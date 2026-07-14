# -*- coding: utf-8 -*-
"""
科研宇宙深度分析引擎 V3 - 适配长周期(10年)数据分布
功能：语义聚类、3D 空间映射、DTM 时间演化分析、趋势自动判定
"""

import json
import re
import numpy as np
import pandas as pd
from datetime import datetime
from scipy.stats import linregress
from bertopic import BERTopic
from sentence_transformers import SentenceTransformer
from umap import UMAP
from hdbscan import HDBSCAN
import nltk
from nltk.corpus import stopwords

# 从全局配置导入
from config import get_db_pool, FIELDS

# ================= 1. 文本清洗配置 =================
try:
    english_stops = set(stopwords.words("english"))
except LookupError:
    nltk.download('stopwords')
    english_stops = set(stopwords.words("english"))

# 针对 10 年跨度的学术词汇优化
custom_stops = {
    "abstract", "study", "research", "results", "paper", "method",
    "proposed", "using", "based", "analysis", "approach", "data"
}


def clean_text(text: str) -> str:
    """针对学术文本的深度清洗"""
    text = text.lower()
    text = re.sub(r"[^a-z\s]", " ", text)
    tokens = text.split()
    tokens = [t for t in tokens if t not in english_stops and t not in custom_stops and len(t) > 2]
    return " ".join(tokens)


# ================= 2. 分析引擎类 =================

class ResearchEvolutionEngine:
    def __init__(self):
        # 使用高性能嵌入模型
        self.embedding_model = SentenceTransformer("all-mpnet-base-v2")

        # 强制 3D 降维用于 app14 星图展示
        self.umap_model = UMAP(
            n_neighbors=15,
            n_components=3,
            min_dist=0.0,
            metric='cosine',
            random_state=42
        )

        # 针对 2000 篇总量的自适应聚类设置
        self.hdbscan_model = HDBSCAN(
            min_cluster_size=10,
            metric='euclidean',
            cluster_selection_method='eom'
        )

    def process_field(self, field: str):
        """处理单个学科的全量分析"""
        conn = get_db_pool().connection()
        try:
            # 1. 加载数据并清洗
            sql = "SELECT id, title, abstract, year FROM papers WHERE field = %s AND abstract IS NOT NULL"
            df = pd.read_sql(sql, conn, params=[field])

            if len(df) < 50:
                print(f"⚠️ [{field}] 数据量不足以进行聚类分析（当前: {len(df)} 篇）。")
                return

            df["clean_text"] = (df["title"] + ". " + df["abstract"]).apply(clean_text)
            df = df[df["clean_text"].str.len() > 30].reset_index(drop=True)

            # 2. 语义聚类与 3D 空间映射
            docs = df["clean_text"].tolist()
            timestamps = df["year"].astype(int).tolist()

            topic_model = BERTopic(
                embedding_model=self.embedding_model,
                umap_model=self.umap_model,
                hdbscan_model=self.hdbscan_model,
                nr_topics="auto",
                verbose=True
            )

            topics, _ = topic_model.fit_transform(docs)
            df["topic_id"] = topics

            # 提取 3D 坐标并写入 DataFrame
            reduced_embeddings = topic_model.umap_model.embedding_
            df["x"], df["y"], df["z"] = reduced_embeddings[:, 0], reduced_embeddings[:, 1], reduced_embeddings[:, 2]

            # 3. 计算时间维度的动态主题 (Topics over Time)
            print(f"[{field}] 正在计算 10 年研究脉络演化...")
            tot = topic_model.topics_over_time(docs, timestamps)

            # 4. 分析趋势并生成演化 JSON
            hotspots = self._analyze_evolution(df, topic_model, tot, field)

            # 5. 保存结果到数据库
            self._save_results(field, hotspots, df)

        finally:
            conn.close()

    def _analyze_evolution(self, df, model, tot, field):
        """分析每个热点的生命周期与年度代表作"""
        topic_info = model.get_topic_info()
        hotspots_results = []

        for _, row in topic_info.iterrows():
            tid = int(row.Topic)
            if tid == -1: continue  # 忽略噪声点

            # 获取该主题的时间序列
            topic_tot = tot[tot.Topic == tid].sort_values("Timestamp")
            years = topic_tot["Timestamp"].astype(int).tolist()
            counts = topic_tot["Frequency"].tolist()

            # 基于线性回归判别趋势状态
            trend_status = "平稳演化 (Stable)"
            if len(years) >= 3:
                # 只取近 5 年的数据进行斜率判定
                slope, _, _, _, _ = linregress(years[-5:], counts[-5:])
                if slope > 0.6:
                    trend_status = "爆发期 (Surging)"
                elif slope < -0.4:
                    trend_status = "衰退期 (Declining)"

            # 构建增强型演化 JSON，注入文献 ID 供综述使用
            evo_history = []
            for _, t_row in topic_tot.iterrows():
                y = int(t_row["Timestamp"])
                # 筛选该主题在该年度最有代表性的 3 篇文献 ID
                rep_ids = df[(df.topic_id == tid) & (df.year == y)].head(3)["id"].tolist()

                evo_history.append({
                    "year": y,
                    "count": int(t_row["Frequency"]),
                    "keywords": t_row["Words"].split(", ")[:5],
                    "representative_ids": rep_ids
                })

            hotspots_results.append({
                "field": field,
                "topic_id": tid,
                "topic_label": row.Name,
                "keywords": [w for w, _ in model.get_topic(tid)[:10]],
                "paper_count": int(row.Count),
                "trend_status": trend_status,
                "evolution_json": json.dumps(evo_history, ensure_ascii=False)
            })
        return hotspots_results

    def _save_results(self, field, hotspots, df):
        """批量更新数据库记录"""
        conn = get_db_pool().connection()
        try:
            with conn.cursor() as cur:
                # 更新 hotspots 表
                cur.execute("DELETE FROM hotspots WHERE field = %s", (field,))
                h_sql = """INSERT INTO hotspots (field, topic_id, topic_label, keywords, paper_count, trend_status, evolution_json, updated_at) 
                           VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())"""
                cur.executemany(h_sql, [
                    (h["field"], h["topic_id"], h["topic_label"], json.dumps(h["keywords"]),
                     h["paper_count"], h["trend_status"], h["evolution_json"])
                    for h in hotspots
                ])

                # 更新 paper_topics 表 (包含 3D 坐标)
                cur.execute("DELETE FROM paper_topics WHERE field = %s", (field,))
                pt_sql = "INSERT INTO paper_topics (paper_id, field, topic_id, x, y, z) VALUES (%s, %s, %s, %s, %s, %s)"
                pt_rows = [
                    (r["id"], field, int(r["topic_id"]), float(r["x"]), float(r["y"]), float(r["z"]))
                    for _, r in df.iterrows() if r["topic_id"] != -1
                ]
                cur.executemany(pt_sql, pt_rows)
            conn.commit()
            print(f"✅ [{field}] 空间坐标与演化轨迹同步完成。")
        finally:
            conn.close()


if __name__ == "__main__":
    engine = ResearchEvolutionEngine()
    # 按照 FIELDS 逐个运行
    for f in FIELDS:
        print(f"\n🚀 启动深度演化分析：{f}")
        try:
            engine.process_field(f)
        except Exception as e:
            print(f"❌ [{f}] 运行出错: {e}")

    print("\n🎉 全学科 10 年演化建模全部完成。")