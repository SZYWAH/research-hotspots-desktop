# -*- coding: utf-8 -*-
"""
evaluate.py — BERTopic vs LDA 跨领域主题建模评估工具

功能：
  1. 在同一数据集上运行 BERTopic 和 LDA，定量对比多项指标
  2. 支持跨领域（STEM + 社科）批量评估，产出统一样表
  3. 输出终端对比表 + JSON 报告，直接用于论文

指标说明：
  - NPMI Coherence: 主题内关键词语义一致性（-1~1，越高越好）
  - Topic Diversity: 主题间 Top-N 词唯一率（0~1，越高说明主题区分度越好）
  - Coverage: 有效分配到主题的文档比例（0~1）
  - Silhouette: 基于文档-主题向量的轮廓系数（-1~1，越高聚类越清晰）

用法：
  python evaluate.py --all                # 评估所有学科
  python evaluate.py --fields AI,Sociology # 指定学科
  python evaluate.py --fields AI --output results.json
"""

import argparse
import json
import re
import sys
import time
import numpy as np
import pandas as pd
from collections import Counter

# NLP / ML
from bertopic import BERTopic
from sentence_transformers import SentenceTransformer
from umap import UMAP
from hdbscan import HDBSCAN
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.decomposition import LatentDirichletAllocation
from sklearn.metrics import silhouette_score

# Gensim — 用于 NPMI Coherence
try:
    from gensim.models import CoherenceModel
    from gensim.corpora import Dictionary
    HAS_GENSIM = True
except ImportError:
    HAS_GENSIM = False

import nltk
from nltk.corpus import stopwords

from config import get_db_pool, FIELDS as CONFIG_FIELDS


# ============================
# 1. 文本清洗（与 chuli2.py 保持一致）
# ============================
try:
    english_stops = set(stopwords.words("english"))
except LookupError:
    nltk.download('stopwords')
    english_stops = set(stopwords.words("english"))

CUSTOM_STOPS = {
    "abstract", "study", "research", "results", "paper", "method",
    "proposed", "using", "based", "analysis", "approach", "data"
}


def clean_text(text: str) -> str:
    text = text.lower()
    text = re.sub(r"[^a-z\s]", " ", text)
    tokens = text.split()
    tokens = [t for t in tokens if t not in english_stops and t not in CUSTOM_STOPS and len(t) > 2]
    return " ".join(tokens)


# ============================
# 2. 评估引擎
# ============================

class TopicModelEvaluator:
    def __init__(self, verbose: bool = True):
        self.verbose = verbose
        self.log("正在加载嵌入模型 all-mpnet-base-v2 ...")
        self.embedding_model = SentenceTransformer("all-mpnet-base-v2")

        self.umap_model = UMAP(
            n_neighbors=15, n_components=3, min_dist=0.0,
            metric='cosine', random_state=42
        )
        self.hdbscan_model = HDBSCAN(
            min_cluster_size=10, metric='euclidean',
            cluster_selection_method='eom'
        )
        self.log("嵌入模型加载完成。")

    def log(self, msg: str):
        if self.verbose:
            print(f"[evaluate] {msg}")

    # ---------- 数据加载 ----------

    def load_data(self, field: str):
        """从数据库加载清洗后的论文数据"""
        conn = get_db_pool().connection()
        try:
            sql = ("SELECT id, title, abstract, year FROM papers "
                   "WHERE field = %s AND abstract IS NOT NULL")
            df = pd.read_sql(sql, conn, params=[field])

            if len(df) < 50:
                self.log(f"⚠️ [{field}] 数据不足 50 篇（当前 {len(df)}），跳过。")
                return None, None

            df["clean_text"] = (df["title"] + ". " + df["abstract"]).apply(clean_text)
            df = df[df["clean_text"].str.len() > 30].reset_index(drop=True)

            if len(df) < 30:
                self.log(f"⚠️ [{field}] 清洗后不足 30 篇，跳过。")
                return None, None

            docs = df["clean_text"].tolist()
            return docs, df
        finally:
            conn.close()

    # ---------- BERTopic ----------

    def run_bertopic(self, docs):
        """运行 BERTopic 并返回主题分配、模型对象和 3D 坐标"""
        self.log("  正在运行 BERTopic ...")
        topic_model = BERTopic(
            embedding_model=self.embedding_model,
            umap_model=self.umap_model,
            hdbscan_model=self.hdbscan_model,
            nr_topics="auto",
            verbose=False
        )
        topics, probs = topic_model.fit_transform(docs)

        # 提取 3D 坐标
        embeddings_3d = topic_model.umap_model.embedding_

        return topics, topic_model, embeddings_3d

    # ---------- LDA ----------

    def run_lda(self, docs, n_topics):
        """运行 sklearn LDA，主题数与 BERTopic 对齐"""
        if n_topics < 2:
            self.log(f"  主题数不足 2，跳过 LDA。")
            return None, None, None, None

        self.log(f"  正在运行 LDA（主题数={n_topics}）...")
        vectorizer = CountVectorizer(
            max_features=5000,
            stop_words='english',
            min_df=5,
            max_df=0.85
        )
        doc_term_matrix = vectorizer.fit_transform(docs)

        if doc_term_matrix.shape[0] < n_topics * 2:
            self.log(f"  文档数少于主题数*2，跳过 LDA。")
            return None, None, None, None

        lda = LatentDirichletAllocation(
            n_components=n_topics,
            random_state=42,
            max_iter=100,
            learning_method='online',
            verbose=False
        )
        lda.fit(doc_term_matrix)

        return lda, vectorizer, doc_term_matrix

    # ---------- 指标计算 ----------

    def compute_npmi(self, topic_words, tokenized_docs):
        """计算 NPMI Coherence"""
        if not HAS_GENSIM:
            self.log("  gensim 未安装，跳过 NPMI Coherence 计算。")
            return None

        if len(topic_words) < 2:
            return None

        try:
            dictionary = Dictionary(tokenized_docs)
            dictionary.filter_extremes(no_below=2, no_above=0.85)

            cm = CoherenceModel(
                topics=topic_words,
                texts=tokenized_docs,
                dictionary=dictionary,
                coherence='c_npmi'
            )
            return float(cm.get_coherence())
        except Exception as e:
            self.log(f"  NPMI 计算异常: {e}")
            return None

    def compute_diversity(self, topic_words):
        """计算 Topic Diversity（Top-N 词唯一率）"""
        if not topic_words or len(topic_words) < 2:
            return 0.0

        top_k = min(10, min(len(t) for t in topic_words))

        all_words = []
        for words in topic_words:
            all_words.extend(words[:top_k])

        unique = set(all_words)
        total = len(all_words)
        return len(unique) / total if total > 0 else 0.0

    @staticmethod
    def sort_topic_words(model, is_bertopic=True, vectorizer=None, feature_names=None):
        """
        提取模型的 Topic → Top-N 词列表，统一格式。
        BERTopic: model.get_topic(tid) → [(word, score), ...]
        LDA: model.components_ → argsort → feature_names
        """
        if is_bertopic:
            topic_words = []
            for tid in sorted(model.get_topics().keys()):
                if tid == -1:
                    continue
                words = [w for w, _ in model.get_topic(tid)[:10]]
                topic_words.append(words)
            return topic_words
        else:
            if feature_names is None:
                feature_names = vectorizer.get_feature_names_out()
            topic_words = []
            for topic in model.components_:
                top_indices = topic.argsort()[:-11:-1]
                words = [feature_names[i] for i in top_indices]
                topic_words.append(words)
            return topic_words

    # ---------- 全流程 ----------

    def evaluate_field(self, field):
        """对单个领域执行完整评估"""
        self.log(f"\n{'='*60}")
        self.log(f"评估领域: {field}")

        docs, df = self.load_data(field)
        if docs is None:
            return None

        self.log(f"文档数: {len(docs)}")

        # 分词（用于 NPMI 计算）
        tokenized_docs = [d.split() for d in docs if d.strip()]

        # ---- BERTopic ----
        t0 = time.time()
        topics, bert_model, embeddings_3d = self.run_bertopic(docs)
        bert_time = time.time() - t0

        topics_arr = np.array(topics)
        valid_mask = topics_arr != -1
        n_topics = len(set(topics_arr) - {-1})
        noise_ratio = float(1 - valid_mask.mean())

        self.log(f"  BERTopic: {n_topics} 个主题, 噪声率 {noise_ratio:.2%}, "
                 f"耗时 {bert_time:.1f}s")

        if n_topics < 2:
            self.log("  ⚠️ 有效主题数不足 2，无法评估。")
            return None

        bert_topic_words = self.sort_topic_words(bert_model, is_bertopic=True)

        # ---- LDA ----
        lda_model, vectorizer, doc_term_matrix = self.run_lda(docs, n_topics)
        if lda_model is None:
            return None

        # ---- 计算指标 ----

        # NPMI Coherence
        bert_npmi = self.compute_npmi(bert_topic_words, tokenized_docs)
        lda_topic_words = self.sort_topic_words(lda_model, is_bertopic=False,
                                                 vectorizer=vectorizer)
        lda_npmi = self.compute_npmi(lda_topic_words, tokenized_docs)

        # Topic Diversity
        bert_div = self.compute_diversity(bert_topic_words)
        lda_div = self.compute_diversity(lda_topic_words)

        # Coverage
        bert_cov = float(valid_mask.mean())
        # LDA: 文档归属主题的最大概率 > 0.2 视为有效分配
        lda_doc_topic = lda_model.transform(doc_term_matrix)
        lda_max_probs = lda_doc_topic.max(axis=1)
        lda_cov = float((lda_max_probs > 0.2).mean())

        # Silhouette
        # BERTopic: 在 UMAP 3D 空间内对非噪声点算 silhouette
        if valid_mask.sum() > 1 and len(set(topics_arr[valid_mask])) > 1:
            bert_sil = float(silhouette_score(embeddings_3d[valid_mask],
                                              topics_arr[valid_mask]))
        else:
            bert_sil = 0.0

        # LDA: 在文档-主题概率空间算 silhouette
        lda_labels = np.argmax(lda_doc_topic, axis=1)
        if len(set(lda_labels)) > 1 and lda_doc_topic.shape[0] > 1:
            lda_sil = float(silhouette_score(lda_doc_topic, lda_labels))
        else:
            lda_sil = 0.0

        # ---- 汇总 ----
        result = {
            "field": field,
            "n_docs": len(docs),
            "n_topics": n_topics,
            "noise_ratio": round(noise_ratio, 4),
            "bertopic": {
                "npmi": round(bert_npmi, 4) if bert_npmi is not None else None,
                "diversity": round(bert_div, 4),
                "coverage": round(bert_cov, 4),
                "silhouette": round(bert_sil, 4),
                "time_seconds": round(bert_time, 1),
            },
            "lda": {
                "npmi": round(lda_npmi, 4) if lda_npmi is not None else None,
                "diversity": round(lda_div, 4),
                "coverage": round(lda_cov, 4),
                "silhouette": round(lda_sil, 4),
            }
        }
        return result

    def evaluate_all(self, fields):
        """批量评估多个领域"""
        results = []
        for field in fields:
            try:
                result = self.evaluate_field(field)
                if result:
                    results.append(result)
            except Exception as e:
                self.log(f"❌ [{field}] 评估失败: {e}")
        return results


# ============================
# 3. 输出格式化
# ============================

def print_comparison_table(results):
    """打印 BERTopic vs LDA 对比表"""
    print("\n" + "=" * 100)
    print("  BERTopic vs LDA  跨领域主题建模对比评估")
    print("=" * 100)

    if not results:
        print("  (无有效评估结果)")
        return

    header = (
        f"{'领域':<28} {'文档数':>6} {'主题数':>5} "
        f"{'模型':>8} {'NPMI':>8} {'多样性':>8} {'覆盖率':>8} {'轮廓系数':>8}"
    )
    print(header)
    print("-" * 100)

    for r in results:
        field = r["field"]
        n_docs = r["n_docs"]
        n_topics = r["n_topics"]

        for model_name, label in [("bertopic", "BERTopic"), ("lda", "LDA")]:
            m = r[model_name]
            npmi_str = f"{m['npmi']:.4f}" if m['npmi'] is not None else "  N/A  "
            print(
                f"{field:<28} {n_docs:>6} {n_topics:>5} "
                f"{label:>8} {npmi_str:>8} {m['diversity']:>8.4f} "
                f"{m['coverage']:>8.4f} {m['silhouette']:>8.4f}"
            )

    print("-" * 100)

    # 胜出统计
    npmi_wins = 0
    div_wins = 0
    sil_wins = 0
    total = len(results)

    for r in results:
        b, l = r["bertopic"], r["lda"]
        if b["npmi"] is not None and l["npmi"] is not None:
            if b["npmi"] > l["npmi"]:
                npmi_wins += 1
        if b["diversity"] > l["diversity"]:
            div_wins += 1
        if b["silhouette"] > l["silhouette"]:
            sil_wins += 1

    print(f"  BERTopic 获胜场次:")
    print(f"    NPMI Coherence : {npmi_wins}/{total} 个领域")
    print(f"    Topic Diversity: {div_wins}/{total} 个领域")
    print(f"    Silhouette     : {sil_wins}/{total} 个领域")
    print(f"    (覆盖率 LDA 天然占优 —— BERTopic 主动过滤噪声)")
    print("=" * 100 + "\n")


def print_summary_stem_vs_social(results):
    """STEM vs 社科领域分组概要"""
    stem_fields = {
        "Artificial Intelligence", "Quantum Physics", "Computational Biology",
        "Econometrics", "Astrophysics", "Statistics", "Condensed Matter",
        "High Energy Physics", "Algebraic Geometry", "Medical Imaging"
    }

    stem_results = [r for r in results if r["field"] in stem_fields]
    social_results = [r for r in results if r["field"] not in stem_fields]

    if not social_results:
        return

    def avg_metrics(group, model_key):
        vals = [r[model_key] for r in group]
        npmi_vals = [v["npmi"] for v in vals if v["npmi"] is not None]
        return {
            "npmi": np.mean(npmi_vals) if npmi_vals else None,
            "diversity": np.mean([v["diversity"] for v in vals]),
            "silhouette": np.mean([v["silhouette"] for v in vals]),
        }

    print("=" * 70)
    print("  STEM vs 社会科学  分组平均对比")
    print("=" * 70)

    for group_name, group in [("STEM 领域", stem_results), ("社会科学领域", social_results)]:
        b_avg = avg_metrics(group, "bertopic")
        l_avg = avg_metrics(group, "lda")
        npmi_str = f"{b_avg['npmi']:.4f}" if b_avg['npmi'] is not None else "N/A"
        print(f"  {group_name} ({len(group)} 个):")
        print(f"    BERTopic  NPMI={npmi_str}  Diversity={b_avg['diversity']:.4f}  "
              f"Silhouette={b_avg['silhouette']:.4f}")
        npmi_str_l = f"{l_avg['npmi']:.4f}" if l_avg['npmi'] is not None else "N/A"
        print(f"    LDA       NPMI={npmi_str_l}  Diversity={l_avg['diversity']:.4f}  "
              f"Silhouette={l_avg['silhouette']:.4f}")
    print("=" * 70 + "\n")


# ============================
# 4. 主入口
# ============================

def main():
    parser = argparse.ArgumentParser(
        description="BERTopic vs LDA 跨领域主题建模定量对比评估"
    )
    parser.add_argument("--fields", type=str, default=None,
                        help="评估指定领域，逗号分隔（如 'AI,Sociology'），"
                             "或 'all' 评估全部")
    parser.add_argument("--output", type=str, default=None,
                        help="输出 JSON 报告路径")
    args = parser.parse_args()

    # 确定待评估领域列表
    if args.fields and args.fields.lower() != "all":
        field_names = [f.strip() for f in args.fields.split(",")]
        # 从 CONFIG_FIELDS 中匹配（大小写不敏感）
        field_lower = {f.lower(): f for f in CONFIG_FIELDS}
        fields = []
        for fn in field_names:
            if fn in CONFIG_FIELDS:
                fields.append(fn)
            elif fn.lower() in field_lower:
                fields.append(field_lower[fn.lower()])
            else:
                print(f"⚠️ 未知领域: {fn}，跳过。可用领域: {CONFIG_FIELDS}")
    else:
        fields = CONFIG_FIELDS

    if not fields:
        print("❌ 没有待评估的领域。")
        sys.exit(1)

    print(f"📊 待评估领域 ({len(fields)} 个): {fields}")
    if not HAS_GENSIM:
        print("⚠️  未检测到 gensim，将跳过 NPMI Coherence 计算。")
        print("   安装: pip install gensim\n")

    evaluator = TopicModelEvaluator(verbose=True)
    results = evaluator.evaluate_all(fields)

    if not results:
        print("❌ 所有领域均评估失败或无有效结果。")
        sys.exit(1)

    # 打印对比表
    print_comparison_table(results)
    print_summary_stem_vs_social(results)

    # 输出 JSON
    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(results, f, ensure_ascii=False, indent=2)
        print(f"📄 评估报告已保存: {args.output}")
    else:
        # 默认保存到 exports 目录
        from config import EXPORT_DIR
        os.makedirs(EXPORT_DIR, exist_ok=True)
        default_path = os.path.join(EXPORT_DIR, "evaluation_report.json")
        with open(default_path, "w", encoding="utf-8") as f:
            json.dump(results, f, ensure_ascii=False, indent=2)
        print(f"📄 评估报告默认保存: {default_path}")

    # 打印简短结论
    print("\n📋 结论:")
    for r in results:
        b, l = r["bertopic"], r["lda"]
        if b["npmi"] is not None and l["npmi"] is not None:
            delta = (b["npmi"] - l["npmi"]) / max(abs(l["npmi"]), 0.001) * 100
            print(f"  {r['field']}: BERTopic NPMI={b['npmi']:.4f}, "
                  f"LDA NPMI={l['npmi']:.4f} (BERTopic 领先 {delta:+.1f}%)")


if __name__ == "__main__":
    import os  # noqa: needed for default export path
    main()
