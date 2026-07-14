# -*- coding: utf-8 -*-
"""
review3.py - 严格格式 + 按数据库学科精确切换综述风格版

适配你的数据库 field 值：
Artificial Intelligence / Quantum Physics / Computational Biology / Econometrics /
Astrophysics / Statistics / Condensed Matter / High Energy Physics /
Algebraic Geometry / Medical Imaging

核心目标：
1. 继续从 hotspots、paper_topics、papers、hotspot_reviews 读取/写入数据；
2. 保留原有时间演化采样：2024+、2021-2023、2020及以前；
3. 根据 field 精确匹配不同学科综述风格；
4. 强制输出固定格式，清除“好的，请查看下述综述内容”等前言；
5. 支持覆盖旧综述重新生成。
"""

import os
import re
import sys
import time
import math
import pymysql
import requests
from pathlib import Path
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from typing import Dict, List

# 允许脚本放在子目录中运行：自动向上查找包含 config.py 的项目根目录
CURRENT_FILE = Path(__file__).resolve()
PROJECT_ROOT = CURRENT_FILE.parent
while PROJECT_ROOT != PROJECT_ROOT.parent:
    if (PROJECT_ROOT / "config.py").exists():
        break
    PROJECT_ROOT = PROJECT_ROOT.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from config import (
    DEEPSEEK_API_KEY,
    DEEPSEEK_BASE_URL,
    DEEPSEEK_MODEL_NAME,
    get_db_pool
)


# =========================================================
# 0. 你的数据库学科配置
# =========================================================
# 这两个映射来自你的爬虫配置。综述脚本不会用它们重新爬虫，
# 但会用它们作为 field 识别和学科写作风格切换的基准。
FIELD_CATEGORY_MAP: Dict[str, List[str]] = {
    "Artificial Intelligence": ["cs.AI", "cs.LG"],
    "Quantum Physics": ["quant-ph"],
    "Computational Biology": ["q-bio.BM", "q-bio.GN"],
    "Econometrics": ["econ.EM"],
    "Astrophysics": ["astro-ph.CO", "astro-ph.HE"],
    "Statistics": ["stat.TH", "stat.AP"],
    "Condensed Matter": ["cond-mat.mtrl-sci"],
    "High Energy Physics": ["hep-ph"],
    "Algebraic Geometry": ["math.AG"],
    "Medical Imaging": ["eess.IV"],
    # 社会科学领域
    "Public Administration": ["pubadmin"],
    "Sociology": ["sociology"],
    "Political Science": ["polisci"]
}

FIELD_KEYWORD_MAP: Dict[str, str] = {
    "Artificial Intelligence": "artificial intelligence",
    "Quantum Physics": "quantum mechanics",
    "Computational Biology": "computational biology",
    "Econometrics": "econometrics",
    "Astrophysics": "astrophysics",
    "Statistics": "mathematical statistics",
    "Condensed Matter": "condensed matter physics",
    "High Energy Physics": "particle physics",
    "Algebraic Geometry": "algebraic geometry",
    "Medical Imaging": "medical imaging",
    # 社会科学领域
    "Public Administration": "public administration",
    "Sociology": "sociology",
    "Political Science": "political science"
}


# =========================================================
# 1. 全局控制参数
# =========================================================
# 不必考虑 token 问题时，可以适当放宽摘要长度和输出上限。
MAX_ABSTRACT_CHARS = int(os.getenv("MAX_ABSTRACT_CHARS", "900"))
MIN_SAMPLE = int(os.getenv("MIN_SAMPLE", "30"))
MAX_SAMPLE = int(os.getenv("MAX_SAMPLE", "120"))

# 如果你的中转站/模型支持更大输出，可继续调大；不支持则改回 4096/6000。
REVIEW_MAX_TOKENS = int(os.getenv("REVIEW_MAX_TOKENS", "9000"))

# 是否覆盖已经生成过的综述：
# 0 = 只处理未生成热点；1 = 删除旧综述并重新生成，适合修复旧格式不统一的问题。
REGENERATE_EXISTING_REVIEWS = os.getenv("REGENERATE_EXISTING_REVIEWS", "0") == "1"

# 温度越低，格式越稳定。
GENERATION_TEMPERATURE = float(os.getenv("GENERATION_TEMPERATURE", "0.18"))
REPAIR_TEMPERATURE = float(os.getenv("REPAIR_TEMPERATURE", "0.03"))


# =========================================================
# 2. 网络通信层：构建稳定 Session
# =========================================================
def get_robust_session():
    session = requests.Session()
    retries = Retry(
        total=5,
        backoff_factor=2,
        status_forcelist=[500, 502, 503, 504],
        allowed_methods=["POST", "GET"],
        raise_on_status=False
    )
    adapter = HTTPAdapter(max_retries=retries)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    return session


session = get_robust_session()


# =========================================================
# 3. 采样逻辑：保留原有时间演化权重
# =========================================================
def calculate_sample_limit(paper_count: int) -> int:
    """
    根据热点规模采用“长尾友好”的阶梯式采样，而不是线性增长。

    适配你的热点分布：
    - 大量小热点：几十篇文献，不需要过度采样；
    - 几个较大热点：100—300 篇，需要适度增加代表性；
    - 一个或少数大热点：380—1200 篇，需要更充分采样，但仍要控制 token。

    注意：
    这里返回的是“计划采样上限”。
    fetch_weighted_papers_stable() 会先查真实可用文献数：
    - 实际文献 <= 30：直接全量读取；
    - 实际文献 > 30：最多读取这里返回的采样上限。
    """
    try:
        paper_count = int(paper_count or 0)
    except Exception:
        paper_count = 0

    # 小热点交给 fetch_weighted_papers_stable() 全量读取；
    # 这里返回 MIN_SAMPLE 只是作为计划上限兜底。
    if paper_count <= 30:
        return MIN_SAMPLE

    # 长尾小热点：几十篇，最多读 30 篇左右即可。
    if paper_count <= 80:
        return max(MIN_SAMPLE, 30)

    # 中小热点：80—150 篇，略微增加。
    if paper_count <= 150:
        return min(MAX_SAMPLE, max(MIN_SAMPLE, 40))

    # 较大热点：150—300 篇。
    if paper_count <= 300:
        return min(MAX_SAMPLE, max(MIN_SAMPLE, 55))

    # 大热点：300—600 篇。
    if paper_count <= 600:
        return min(MAX_SAMPLE, max(MIN_SAMPLE, 70))

    # 超大热点：600—1000 篇。
    if paper_count <= 1000:
        return min(MAX_SAMPLE, max(MIN_SAMPLE, 90))

    # 极大热点：1000 篇以上。默认封顶，不让 token 无限制增长。
    return MAX_SAMPLE


def fetch_weighted_papers_stable(field: str, topic_id: int, limit: int):
    """
    文献读取策略：
    1. 先查询该热点在 papers + paper_topics 中实际可用的全部文献；
    2. 如果实际文献数 <= 30，直接返回全部文献，避免 5 篇/10 篇热点被固定比例切分后更少；
    3. 如果实际文献数 > 30，再按时间阶段分层抽样：
       - 2024 年及以后：50%
       - 2021—2023 年：30%
       - 2020 年及以前：20%
    4. 如果某个时间阶段文献不足，会从剩余文献中按年份倒序自动补足到 limit。
    """
    try:
        limit = int(limit or MIN_SAMPLE)
    except Exception:
        limit = MIN_SAMPLE

    conn = get_db_pool().connection()
    cursor = conn.cursor(pymysql.cursors.DictCursor)

    try:
        # 先查该热点实际可用的全部论文。这里用 JOIN 后的真实数量，而不是 hotspots.paper_count。
        all_sql = """
        SELECT p.id, p.title, p.abstract, p.year
        FROM papers p
        JOIN paper_topics pt ON p.id = pt.paper_id
        WHERE BINARY pt.field = %s
          AND pt.topic_id = %s
        ORDER BY
          CASE WHEN p.year IS NULL THEN 1 ELSE 0 END,
          p.year DESC,
          p.id DESC
        """
        cursor.execute(all_sql, (field, topic_id))
        all_papers = cursor.fetchall()

        real_total = len(all_papers)
        if real_total == 0:
            return []

        # 小热点：直接返回全部文献，不再做时间段切分。
        if real_total <= 30:
            return all_papers

        # 大热点：分层抽样，但最终不超过真实总数。
        final_limit = min(limit, real_total)

        recent_limit = math.ceil(final_limit * 0.5)
        mid_limit = math.ceil(final_limit * 0.3)
        old_limit = max(final_limit - recent_limit - mid_limit, 0)

        buckets = {
            "recent": [],
            "mid": [],
            "old": [],
            "unknown": []
        }

        for p in all_papers:
            try:
                y = int(p.get("year") or 0)
            except Exception:
                y = 0

            if y >= 2024:
                buckets["recent"].append(p)
            elif 2021 <= y <= 2023:
                buckets["mid"].append(p)
            elif y > 0 and y < 2021:
                buckets["old"].append(p)
            else:
                buckets["unknown"].append(p)

        selected = []
        selected.extend(buckets["recent"][:recent_limit])
        selected.extend(buckets["mid"][:mid_limit])
        selected.extend(buckets["old"][:old_limit])

        selected_ids = {p["id"] for p in selected}

        # 如果某些阶段不足，则从剩余文献中按年份倒序补足。
        if len(selected) < final_limit:
            need = final_limit - len(selected)
            remaining = [p for p in all_papers if p["id"] not in selected_ids]
            selected.extend(remaining[:need])

        # 最后再去重一次，防止极端情况下重复。
        deduped = []
        seen = set()
        for p in selected:
            if p["id"] in seen:
                continue
            seen.add(p["id"])
            deduped.append(p)

        return deduped[:final_limit]

    finally:
        conn.close()


# =========================================================
# 4. 按 field 精确匹配学科综述风格
# =========================================================
FIELD_REVIEW_PROFILE_MAP: Dict[str, Dict[str, str]] = {
    "Artificial Intelligence": {
        "name": "人工智能与机器学习",
        "style": "采用“任务定义—模型结构—训练数据—评价指标—系统部署—应用边界”的技术综述风格。",
        "evidence": "优先比较算法范式、模型架构、数据集规模与质量、训练策略、实验指标、可解释性、泛化能力和工程落地。",
        "evaluation": "重点评价性能提升是否来自模型结构创新、数据扩展、训练技巧、算力条件、系统集成或应用场景变化。",
        "writing_hint": "写作时应突出方法路线之间的演进关系，例如符号方法、统计学习、深度学习、预训练模型、多模态模型、智能体或领域专用模型的转换逻辑。"
    },
    "Quantum Physics": {
        "name": "量子物理",
        "style": "采用“物理问题—理论模型—数学形式—实验可检验性—量子态操控—未来器件/计算应用”的学理综述风格。",
        "evidence": "优先呈现量子态、纠缠、退相干、测量、量子信息、量子模拟、实验平台和理论假设之间的关系。",
        "evaluation": "重点评价理论解释力、实验可验证性、噪声与误差约束、可扩展性以及与量子计算/通信/精密测量的关联。",
        "writing_hint": "不要写成泛泛科普，应体现量子体系、哈密顿量、态制备、测量机制、误差控制或物理平台差异。"
    },
    "Computational Biology": {
        "name": "计算生物学与基因组学",
        "style": "采用“生物问题—数据类型—计算模型—机制解释—实验验证—转化应用”的证据链综述风格。",
        "evidence": "优先梳理基因组、转录组、蛋白质、单细胞、多组学、网络生物学、疾病表型和实验验证之间的证据链。",
        "evaluation": "重点评价模型是否能解释生物机制、数据噪声与批次效应是否可控、跨队列泛化能力以及临床/药物发现潜力。",
        "writing_hint": "应区分纯预测模型、机制建模、组学整合、疾病关联和实验验证，避免只罗列算法。"
    },
    "Econometrics": {
        "name": "计量经济学",
        "style": "采用“经济理论—变量设定—数据来源—识别策略—稳健性检验—政策含义”的社会科学综述风格。",
        "evidence": "优先解释研究对象、核心变量、因果识别、样本结构、模型设定、内生性处理和外部有效性。",
        "evaluation": "重点评价识别策略是否可信、数据是否支持因果推断、估计结果是否稳健以及对经济政策或市场机制的解释力。",
        "writing_hint": "写作时应体现实证研究逻辑，例如面板数据、工具变量、双重差分、结构模型、时间序列或微观计量方法。"
    },
    "Astrophysics": {
        "name": "天体物理与宇宙学",
        "style": "采用“天体现象—观测证据—理论模型—数值模拟—宇宙学/高能机制—观测展望”的综合综述风格。",
        "evidence": "优先比较观测数据、辐射机制、宇宙学参数、星系/黑洞/高能天体过程、数值模拟和不同理论解释。",
        "evaluation": "重点评价模型是否能解释观测约束、模拟假设是否合理、不同波段/探测器证据是否一致。",
        "writing_hint": "应突出观测与理论之间的张力，例如宇宙结构形成、高能辐射源、黑洞、星系演化或暗物质/暗能量相关问题。"
    },
    "Statistics": {
        "name": "统计学理论与应用",
        "style": "采用“统计问题—模型假设—估计/推断方法—理论性质—应用场景—局限性”的方法论综述风格。",
        "evidence": "优先讨论分布假设、估计量、推断框架、不确定性量化、渐近性质、计算复杂度和应用数据类型。",
        "evaluation": "重点评价方法的统计一致性、效率、鲁棒性、可解释性、计算可行性和高维/复杂数据适应性。",
        "writing_hint": "应体现统计学的理论严谨性，例如置信区间、假设检验、贝叶斯推断、非参数方法、高维统计或因果推断。"
    },
    "Condensed Matter": {
        "name": "凝聚态物理与材料科学",
        "style": "采用“材料体系—微观结构—物性机制—实验表征—理论计算—器件潜力”的物性综述风格。",
        "evidence": "优先梳理晶体结构、电子态、拓扑性质、相变、磁性/超导/输运性质、材料制备和表征手段。",
        "evaluation": "重点评价物理机制是否清晰、实验表征是否充分、材料可制备性与稳定性如何、潜在器件应用是否可信。",
        "writing_hint": "应围绕材料体系和物性机制组织，不要泛泛写成普通工程材料介绍。"
    },
    "High Energy Physics": {
        "name": "高能物理与粒子物理",
        "style": "采用“标准模型背景—理论扩展—实验约束—参数空间—现象学解释—未来探测”的高能物理综述风格。",
        "evidence": "优先呈现粒子相互作用、对称性、质量起源、暗物质候选、碰撞机/探测器约束和现象学模型。",
        "evaluation": "重点评价理论模型的自洽性、可检验性、实验排除边界、参数空间收缩和下一代实验突破口。",
        "writing_hint": "应突出理论模型与实验约束之间的关系，例如 LHC、暗物质探测、中微子、希格斯机制、超出标准模型等。"
    },
    "Algebraic Geometry": {
        "name": "代数几何",
        "style": "采用“核心对象—概念谱系—定理/构造—证明思想—与相邻领域联系—开放问题”的纯数学综述风格。",
        "evidence": "优先梳理簇、概形、模空间、上同调、奇点、双有理几何、导出范畴或算术几何等对象的内在逻辑。",
        "evaluation": "重点评价概念推广的必要性、定理之间的依赖关系、证明方法的创新性和对相关数学分支的影响。",
        "writing_hint": "不要写成实验科学综述；应突出定义、命题、结构、证明思路和理论脉络。"
    },
    "Medical Imaging": {
        "name": "医学影像与智能诊断",
        "style": "采用“影像任务—数据模态—算法模型—临床评价—可解释性—部署风险”的医学 AI 综述风格。",
        "evidence": "优先比较 CT、MRI、超声、病理图像、分割/检测/分类/重建任务、标注质量、评价指标和临床验证。",
        "evaluation": "重点评价模型性能、数据偏倚、跨中心泛化、医生协同、可解释性、隐私合规和临床落地可行性。",
        "writing_hint": "应把医学影像任务和临床问题绑定，避免只写成普通计算机视觉综述。"
    },
    "Public Administration": {
        "name": "公共管理",
        "style": "采用“制度背景—政策问题—理论框架—研究设计—实证发现—政策含义”的公共管理综述风格。",
        "evidence": "优先梳理制度环境、治理结构、政策工具、组织行为、公共服务供给、数字政府转型和跨层级治理之间的逻辑关系。",
        "evaluation": "重点评价理论框架的解释力、研究设计的严谨性、数据来源的可信度（如调查、行政数据、实验）、内生性处理、外部有效性和政策建议的可操作性。",
        "writing_hint": "应体现公共管理的学科特征，如多层级治理、制度分析、政策执行、绩效评估、政企关系、数字治理与公众参与等核心议题。"
    },
    "Sociology": {
        "name": "社会学",
        "style": "采用“社会现象—理论视角—研究假设—数据与方法—发现与解释—社会含义”的社会学综述风格。",
        "evidence": "优先梳理社会分层、社会流动、社会网络、文化资本、社会变迁、群体行为、代际传递和社会不平等议题。",
        "evaluation": "重点评价理论视角的创新性（功能主义、冲突论、符号互动论等）、样本的代表性、测量工具的有效性、统计方法的适当性以及对既有理论的修正或拓展。",
        "writing_hint": "应区分宏观社会结构分析与微观社会互动研究，体现社会学的实证传统，例如调查数据、民族志、社会网络分析、多变量回归或比较历史分析。"
    },
    "Political Science": {
        "name": "政治学",
        "style": "采用“研究问题—制度/行为理论—研究设计—经验证据—理论贡献—实践启示”的政治学综述风格。",
        "evidence": "优先梳理政治制度、民主治理、比较政治、国际关系、政治行为、公共舆论、政策制定、政党和利益集团等核心主题。",
        "evaluation": "重点评价理论建构的逻辑自洽性、研究设计的因果识别策略（如自然实验、断点回归、面板数据）、证据的跨案例一致性、内外部有效性以及对政治现实的分析深度。",
        "writing_hint": "应体现政治学的多元方法特征，如比较案例研究、过程追踪、大样本统计分析、形式模型或实验方法，避免仅描述现象而不做理论贡献。"
    }
}


def infer_discipline_profile(h: dict) -> dict:
    """
    根据数据库中的 field 精确匹配学科写作风格。
    若 field 出现大小写/空格差异，则做一次宽松匹配。
    """
    raw_field = str(h.get("field") or "").strip()
    title = str(h.get("title_cn") or "").strip()

    if raw_field in FIELD_REVIEW_PROFILE_MAP:
        profile = dict(FIELD_REVIEW_PROFILE_MAP[raw_field])
        profile["field"] = raw_field
        profile["categories"] = FIELD_CATEGORY_MAP.get(raw_field, [])
        profile["keyword"] = FIELD_KEYWORD_MAP.get(raw_field, raw_field)
        return profile

    # 宽松匹配：防止数据库中出现大小写或多余空格差异。
    normalized = raw_field.lower().replace("_", " ").strip()
    for field_name, base_profile in FIELD_REVIEW_PROFILE_MAP.items():
        if normalized == field_name.lower():
            profile = dict(base_profile)
            profile["field"] = field_name
            profile["categories"] = FIELD_CATEGORY_MAP.get(field_name, [])
            profile["keyword"] = FIELD_KEYWORD_MAP.get(field_name, field_name)
            return profile

    # 兜底：理论上你的数据库不会走到这里。
    profile = {
        "name": "通用交叉学科",
        "style": "采用“问题界定—方法脉络—证据比较—时间演化—未来挑战”的综合综述风格。",
        "evidence": "根据素材内容同时比较理论基础、研究方法、关键证据、应用场景和局限性。",
        "evaluation": "重点评价研究问题是否清晰、证据是否充分、方法是否可靠、应用是否可持续。",
        "writing_hint": "优先依据标题和摘要判断学科语境，不要套用单一学科模板。",
        "field": raw_field or "Unknown",
        "categories": [],
        "keyword": title or raw_field or "unknown"
    }
    return profile

# =========================================================
# 5. 省 token 版：单次 API 生成中长综述
# =========================================================
# 全局兜底边界：真实目标会根据实际采样文献数动态调整。
TARGET_MIN_CHARS = int(os.getenv("TARGET_MIN_CHARS", "1500"))
TARGET_MAX_CHARS = int(os.getenv("TARGET_MAX_CHARS", "8000"))
ENABLE_STRUCTURED_CHARTS = os.getenv("ENABLE_STRUCTURED_CHARTS", "1") == "1"

# 只在严重格式问题时修复；默认关闭，避免额外 API 消耗。
ENABLE_REPAIR = os.getenv("ENABLE_REPAIR", "0") == "1"

# 省 token 兜底：只有当首轮结果短于 TARGET_MIN_CHARS 时，才额外调用一次扩写。
# 扩写时不再重复输入所有摘要，只输入“已生成综述 + Ref标题索引”，成本远低于重新生成。
ENABLE_EXPAND_IF_SHORT = os.getenv("ENABLE_EXPAND_IF_SHORT", "1") == "1"

SYSTEM_FORMAT_GUARD = """
你是严谨的中文学术综述写作系统。你必须服从固定输出模板。
禁止输出寒暄、解释、免责声明、前言引导语、英文段落、代码块或与综述无关的内容。
最终回答只能是综述正文。所有核心判断必须来自素材库，不得编造文献、数据、实验结果或参考编号。
图表必须使用 Markdown 表格或纯文本箭头图，不要使用 Markdown 代码块。
""".strip()

FORBIDDEN_PREFIXES = [
    "好的", "当然", "以下", "下面", "请查看", "我将", "这里是", "作为AI", "作为 AI",
    "Here is", "Sure", "Certainly", "Below is"
]

EXPECTED_HEADINGS = [
    "## 一、研究对象与问题界定",
    "## 二、文献证据结构与研究路线图",
    "## 三、时间演化：溯源、转折与前沿",
    "## 四、学科专属图表化分析",
    "## 五、综合评议、局限性与2027+展望",
    "## 六、参考依据说明"
]


def get_field_chart_requirements(field: str) -> str:
    chart_map = {
        "Artificial Intelligence": "生成“技术路线对比表”和“模型演化箭头图”，重点比较任务、模型、数据、指标、部署风险。",
        "Quantum Physics": "生成“理论—实验—器件关联表”和“量子体系演化箭头图”，重点比较物理模型、实验平台、可观测量、误差限制。",
        "Computational Biology": "生成“数据模态—计算方法—生物机制—验证路径表”和“证据链箭头图”，重点比较组学数据、模型、机制解释、实验验证。",
        "Econometrics": "生成“变量—模型—识别策略—稳健性检验表”和“因果识别路径图”，重点比较理论假设、数据构造、内生性处理、政策解释。",
        "Astrophysics": "生成“观测证据—理论模型—数值模拟表”和“多波段/多信使证据图”，重点比较观测信号、物理机制、模型约束。",
        "Statistics": "生成“模型假设—估计方法—推断性质表”和“方法谱系图”，重点比较一致性、效率、鲁棒性、计算复杂度。",
        "Condensed Matter": "生成“材料体系—微观结构—物性机制—表征方法表”和“物性机制路径图”，重点比较结构、电子态、相变、器件潜力。",
        "High Energy Physics": "生成“理论模型—实验约束—参数空间表”和“标准模型之外问题链图”，重点比较理论自洽性、实验排除边界、未来探测。",
        "Algebraic Geometry": "生成“核心对象—概念工具—定理/构造表”和“概念谱系图”，重点比较定义、命题、证明思想、开放问题。",
        "Medical Imaging": "生成“影像模态—任务类型—算法模型—临床风险表”和“临床转化路径图”，重点比较数据、模型、指标、泛化、可解释性。"
    }
    return chart_map.get(field, "生成“研究路线对比表”和“时间演化箭头图”，重点比较问题、方法、证据、优势和局限。")


def stage_of_year(year) -> str:
    try:
        y = int(year)
    except Exception:
        return "未知年份"
    if y <= 2020:
        return "2020年及以前"
    if 2021 <= y <= 2023:
        return "2021—2023"
    return "2024—2026"



def get_target_length_by_paper_count(paper_count: int):
    """
    根据实际送入模型的文献数量动态设置综述长度与扩写策略。
    这里使用 len(papers)，不是热点表中的 paper_count，也不是计划采样 limit。
    """
    try:
        paper_count = int(paper_count or 0)
    except Exception:
        paper_count = 0

    if paper_count <= 0:
        target_min, target_max, allow_expand = 800, 1500, False
    elif paper_count <= 5:
        target_min, target_max, allow_expand = 1500, 2500, False
    elif paper_count <= 10:
        target_min, target_max, allow_expand = 2200, 3500, False
    elif paper_count <= 20:
        target_min, target_max, allow_expand = 3000, 4500, True
    elif paper_count <= 40:
        target_min, target_max, allow_expand = 4000, 6000, True
    else:
        target_min, target_max, allow_expand = 5000, 8000, True

    # 全局环境变量作为安全边界：
    # 小样本文献不被 TARGET_MIN_CHARS 强行抬到很长；
    # 大于 10 篇时，允许用户用环境变量提高最低下限。
    if paper_count > 10:
        target_min = max(target_min, TARGET_MIN_CHARS)
    target_max = min(target_max, TARGET_MAX_CHARS)

    if target_min > target_max:
        target_min, target_max = min(target_min, target_max), max(target_min, target_max)

    return target_min, target_max, allow_expand


def get_generation_max_tokens(target_max_chars: int) -> int:
    """
    根据目标上限动态控制 max_tokens，减少小样本文献生成超长综述的概率。
    """
    try:
        target_max_chars = int(target_max_chars or 4000)
    except Exception:
        target_max_chars = 4000
    suggested = int(target_max_chars * 1.65)
    return min(REVIEW_MAX_TOKENS, max(2500, suggested))



def build_sample_statistics(papers: list) -> str:
    stage_counts = {"2020年及以前": 0, "2021—2023": 0, "2024—2026": 0, "未知年份": 0}
    for p in papers:
        st = stage_of_year(p.get("year"))
        stage_counts[st] = stage_counts.get(st, 0) + 1

    rows = "\n".join([f"| {k} | {v} |" for k, v in stage_counts.items()])
    return f"""
| 时间阶段 | 样本文献数 |
|---|---:|
{rows}
""".strip()


def build_compact_papers_text(papers: list) -> str:
    """
    省 token 输入：
    - 只保留 Ref编号、年份、标题、压缩摘要；
    - 每篇摘要默认 900 字符，可通过 MAX_ABSTRACT_CHARS 调整；
    - 不再在每章重复投喂。
    """
    context_list = []
    for i, p in enumerate(papers, 1):
        abs_text = (p.get("abstract") or "")[:MAX_ABSTRACT_CHARS]
        abs_text = re.sub(r"\s+", " ", abs_text).strip()
        year = p.get("year") or "未知年份"
        paper_title = re.sub(r"\s+", " ", str(p.get("title") or "Untitled")).strip()
        context_list.append(
            f"【Ref_{i}】{year}｜{paper_title}｜{abs_text}"
        )
    return "\n".join(context_list)


def build_ref_title_index(papers: list, max_items: int = 120) -> str:
    """
    扩写阶段使用的低成本证据索引：
    不再重复输入长摘要，只给 Ref 编号、年份、标题，防止扩写时丢引用。
    """
    rows = []
    for i, p in enumerate(papers[:max_items], 1):
        year = p.get("year") or "未知年份"
        paper_title = re.sub(r"\s+", " ", str(p.get("title") or "Untitled")).strip()
        rows.append(f"[Ref_{i}] {year}｜{paper_title}")
    return "\n".join(rows)


def build_expand_prompt(h: dict, review: str, papers: list) -> str:
    title = h["title_cn"]
    field = h.get("field") or "Unknown"
    profile = infer_discipline_profile(h)
    target_min, target_max, _ = get_target_length_by_paper_count(len(papers or []))
    ref_index = build_ref_title_index(papers)

    return f"""
请在不重新生成全文结构的前提下，适度扩写下面这篇综述，使总长度尽量达到 {target_min}—{target_max} 字符。

【扩写原则】
1. 输出必须直接从“# {title}”开始。
2. 必须保留原有 6 个二级标题，不得增删、改名、换序。
3. 不要新增未提供的事实，不要虚构作者、数据、实验结果或文献。
4. 可以基于已有 [Ref_n] 和下方 Ref 标题索引，扩展比较分析、时间演化解释、局限性、未来方向和图表解读。
5. 必须保留 Markdown 表格和纯文本箭头图；如原文图表过短，可适度补充行数。
6. 学科风格必须符合：{profile['name']}。
7. 重点扩写第三、四、五部分；第一、六部分只适度补充。
8. 不要使用代码块，不要输出解释或寒暄。

【数据库学科】
field：{field}
学科风格：{profile['style']}

【可用 Ref 标题索引】
{ref_index}

【待扩写综述】
{review}
""".strip()


def build_compact_review_prompt(h: dict, papers: list) -> str:
    title = h["title_cn"]
    field = h.get("field") or "Unknown"
    profile = infer_discipline_profile(h)

    papers_text = build_compact_papers_text(papers)
    sample_stats = build_sample_statistics(papers)
    target_min, target_max, allow_expand = get_target_length_by_paper_count(len(papers or []))
    categories = ", ".join(profile.get("categories", [])) or "未记录"
    keyword = profile.get("keyword", field)
    chart_requirements = get_field_chart_requirements(field)

    return f"""
【任务】
请围绕热点方向“{title}”生成一篇省 token 版中长篇中文深度综述。

【长度要求】
本次实际送入文献数量：{len(papers or [])} 篇。
动态目标总长度：{target_min}—{target_max} 字符。
最低要求：尽量达到 {target_min} 字符；但如果文献数量较少，不要为了凑字数重复扩写或空泛推测。
上限要求：不要超过 {target_max} 字符；表格、图示、引用标注都计入长度。
写作密度：要求内容充实但不堆砌。文献较少时应写成紧凑综述；文献较多时再展开更充分的比较、图表和趋势分析。

【数据库学科信息】
数据库 field：{field}
爬虫分类：{categories}
学科关键词：{keyword}

【学科写作风格】
学科类型：{profile['name']}
写作风格：{profile['style']}
证据组织：{profile['evidence']}
评价重点：{profile['evaluation']}
写作提示：{profile['writing_hint']}

【图表要求】
{chart_requirements}

【样本文献时间分布】
{sample_stats}

【硬性输出协议】
1. 最终回答必须直接从“# {title}”开始，前面不得出现任何文字。
2. 禁止“好的、以下是、请查看、我将”等寒暄或引导语。
3. 必须使用且只使用下面的固定标题，不得增删、改名、换序。
4. 必须保留时间演化：2020年及以前 → 2021—2023 → 2024—2026 → 2027+。
5. 每个核心判断尽量标注 [Ref_n]，不得虚构不存在的 Ref 编号。
6. 必须包含至少 1 个 Markdown 表格和 1 个纯文本箭头图。
7. 不要使用 Markdown 代码块。
8. 没有素材支持时，只能写“从现有素材看”，不能编造数据、作者、实验结果或文献。
9. 正文使用中文；英文只允许出现在必要术语、模型名、缩写或论文标题中。
10. “参考依据说明”不是参考文献表，不要编造 APA/GB/T 7714 条目。

【固定输出模板】
# {title}

## 一、研究对象与问题界定
根据文献数量写 300—900 字，说明核心对象、关键概念、研究边界和学科意义。

## 二、文献证据结构与研究路线图
根据文献数量写 300—900 字，说明样本文献的时间分布、证据来源、主要研究路线。必须包含一个简洁表格。

## 三、时间演化：溯源、转折与前沿
根据文献数量写 600—1600 字，按“2020年及以前、2021—2023、2024—2026、2027+”展开，体现连续演化。

## 四、学科专属图表化分析
根据文献数量写 400—1200 字，至少包含 1 个 Markdown 表格和 1 个纯文本箭头图，并解释图表含义。

## 五、综合评议、局限性与2027+展望
根据文献数量写 500—1300 字，评价贡献、限制、不确定性和未来方向。

## 六、参考依据说明
根据文献数量写 200—600 字，说明主要依据了哪些 Ref 编号，哪些材料是核心证据，哪些只作为背景。

【素材库 - 共计 {len(papers)} 篇】
{papers_text}
""".strip()


def clean_text_prefix(text: str) -> str:
    if not text:
        return ""

    text = text.replace("\ufeff", "").strip()
    text = re.sub(r"^\s*```(?:markdown|md|text)?\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*```\s*$", "", text, flags=re.IGNORECASE).strip()

    changed = True
    while changed:
        changed = False
        for prefix in FORBIDDEN_PREFIXES:
            new_text = re.sub(
                rf"^\s*{re.escape(prefix)}[，,。！!：:\s]*",
                "",
                text,
                flags=re.IGNORECASE
            )
            if new_text != text:
                text = new_text.strip()
                changed = True

    return re.sub(r"\n{3,}", "\n\n", text).strip()


def clean_review_output(text: str, title: str) -> str:
    text = clean_text_prefix(text)

    exact_title_pattern = rf"(?m)^#\s*{re.escape(title)}\s*$"
    m = re.search(exact_title_pattern, text)
    if m:
        text = text[m.start():].strip()
    else:
        m = re.search(r"(?m)^#\s+.+$", text)
        if m:
            text = text[m.start():].strip()

    lines = text.splitlines()
    if lines:
        if lines[0].startswith("#"):
            lines[0] = f"# {title}"
        else:
            lines.insert(0, f"# {title}")
    else:
        lines = [f"# {title}"]

    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()


def validate_review_format(review: str, title: str, target_min=None, target_max=None):
    issues = []

    if not review.startswith(f"# {title}"):
        issues.append("未从标准一级标题开始")

    pos = -1
    for heading in EXPECTED_HEADINGS:
        new_pos = review.find(heading)
        if new_pos == -1:
            issues.append(f"缺少固定标题：{heading}")
        elif new_pos < pos:
            issues.append(f"标题顺序错误：{heading}")
        else:
            pos = new_pos

    if "[Ref_" not in review:
        issues.append("缺少素材引用标注 [Ref_n]")

    if ENABLE_STRUCTURED_CHARTS and ("|" not in review or "→" not in review):
        issues.append("缺少Markdown表格或纯文本箭头图")

    char_count = len(review)
    target_min = target_min or TARGET_MIN_CHARS
    target_max = target_max or TARGET_MAX_CHARS
    if char_count < target_min:
        issues.append(f"字数偏少：{char_count} < {target_min}")
    if char_count > target_max:
        issues.append(f"字数偏多：{char_count} > {target_max}")

    alpha_count = len(re.findall(r"[A-Za-z]", review))
    if len(review) > 0 and alpha_count / len(review) > 0.32:
        issues.append("英文比例偏高，可能存在英文段落")

    return len(issues) == 0, issues


def build_repair_prompt(h: dict, review: str, issues: list, papers: list = None) -> str:
    title = h["title_cn"]
    profile = infer_discipline_profile(h)
    target_min, target_max, _ = get_target_length_by_paper_count(len(papers or []))
    return f"""
请修复下面综述的格式问题。只允许调整结构、删减冗余、补足必要标题，不得新增事实，不得新增未出现过的 Ref 编号。

【问题】
{issues}

【硬性要求】
1. 输出必须从“# {title}”开始。
2. 总长度控制在 {target_min}—{target_max} 字符。
3. 保留固定章节标题、时间演化、核心 [Ref_n] 引用、Markdown表格和箭头图。
4. 学科风格符合：{profile['name']}。
5. 不要使用代码块，不要输出解释。

【待修复综述】
{review}
""".strip()


def call_deepseek(messages, temperature=GENERATION_TEMPERATURE, max_tokens=None):
    headers = {
        "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": DEEPSEEK_MODEL_NAME,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens or REVIEW_MAX_TOKENS
    }

    resp = session.post(
        f"{DEEPSEEK_BASE_URL}/chat/completions",
        headers=headers,
        json=payload,
        timeout=(20, 900)
    )
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"].strip()


def save_review(h: dict, review: str):
    conn = get_db_pool().connection()
    try:
        with conn.cursor() as cur:
            if REGENERATE_EXISTING_REVIEWS:
                cur.execute(
                    "DELETE FROM hotspot_reviews WHERE field = %s AND topic_id = %s",
                    (h["field"], h["topic_id"])
                )

            sql = """
            INSERT INTO hotspot_reviews (field, topic_id, review_cn, created_at)
            VALUES (%s, %s, %s, NOW())
            """
            cur.execute(sql, (h["field"], h["topic_id"], review))
        conn.commit()
    finally:
        conn.close()


def generate_compact_review(h: dict, papers: list) -> str:
    title = h["title_cn"]
    target_min, target_max, allow_expand = get_target_length_by_paper_count(len(papers or []))
    dynamic_max_tokens = get_generation_max_tokens(target_max)
    prompt = build_compact_review_prompt(h, papers)

    raw = call_deepseek(
        [
            {"role": "system", "content": SYSTEM_FORMAT_GUARD},
            {"role": "user", "content": prompt}
        ],
        temperature=GENERATION_TEMPERATURE,
        max_tokens=dynamic_max_tokens
    )

    review = clean_review_output(raw, title)
    ok, issues = validate_review_format(review, title, target_min, target_max)

    # 低成本扩写：只对文献数量足够的热点启用；
    # 同时设置 90% 缓冲，避免轻微偏短也触发二次扩写。
    expand_threshold = int(target_min * 0.9)
    if ENABLE_EXPAND_IF_SHORT and allow_expand and len(review) < expand_threshold:
        print(
            f"   📝 首轮字数明显偏少，启动低成本扩写："
            f"{len(review)} < {expand_threshold} | 动态目标 {target_min}-{target_max}"
        )
        expand_prompt = build_expand_prompt(h, review, papers)
        expanded = call_deepseek(
            [
                {"role": "system", "content": SYSTEM_FORMAT_GUARD},
                {"role": "user", "content": expand_prompt}
            ],
            temperature=REPAIR_TEMPERATURE,
            max_tokens=dynamic_max_tokens
        )
        review = clean_review_output(expanded, title)
        ok, issues = validate_review_format(review, title, target_min, target_max)

    if not ok and ENABLE_REPAIR:
        print(f"   🧹 启动一次格式修复：{issues}")
        repair_prompt = build_repair_prompt(h, review, issues, papers)
        repaired = call_deepseek(
            [
                {"role": "system", "content": SYSTEM_FORMAT_GUARD},
                {"role": "user", "content": repair_prompt}
            ],
            temperature=REPAIR_TEMPERATURE,
            max_tokens=dynamic_max_tokens
        )
        review = clean_review_output(repaired, title)

    return review


# =========================================================
# 6. 核心调度主程序
# =========================================================
def main():
    conn = get_db_pool().connection()
    cursor = conn.cursor(pymysql.cursors.DictCursor)

    cursor.execute("SELECT field, topic_id FROM hotspot_reviews")
    processed = {f"{r['field']}_{r['topic_id']}" for r in cursor.fetchall()}

    cursor.execute("""
        SELECT field, topic_id, title_cn, paper_count
        FROM hotspots
        WHERE title_cn IS NOT NULL
    """)
    all_hotspots = cursor.fetchall()
    conn.close()

    if REGENERATE_EXISTING_REVIEWS:
        todo = all_hotspots
        print(f"📊 启动省token中长综述重生成模式。将覆盖旧综述：{len(todo)} 个热点")
    else:
        todo = [h for h in all_hotspots if f"{h['field']}_{h['topic_id']}" not in processed]
        print(f"📊 启动省token中长综述生成模式。待处理：{len(todo)} 个热点")

    print(
        f"⚙️ 参数：MIN_SAMPLE={MIN_SAMPLE}, MAX_SAMPLE={MAX_SAMPLE}, "
        f"MAX_ABSTRACT_CHARS={MAX_ABSTRACT_CHARS}, REVIEW_MAX_TOKENS={REVIEW_MAX_TOKENS}, "
        f"全局边界={TARGET_MIN_CHARS}-{TARGET_MAX_CHARS}, 动态字数=按实际采样文献数调整, 图表={ENABLE_STRUCTURED_CHARTS}, 扩写={ENABLE_EXPAND_IF_SHORT}, 修复={ENABLE_REPAIR}"
    )

    for h in todo:
        title = h["title_cn"]
        try:
            limit = calculate_sample_limit(h.get("paper_count"))
            profile = infer_discipline_profile(h)
            print(
                f"🚀 处理中: {title} | field: {h.get('field')} | "
                f"学科风格: {profile['name']} | 热点规模: {h.get('paper_count')} | 阶梯计划采样: {limit}"
            )

            papers = fetch_weighted_papers_stable(h["field"], h["topic_id"], limit)
            if not papers:
                print(f"⚠️ 未找到文献素材，跳过: {title}")
                continue

            sampling_mode = "小热点全量读取" if len(papers) <= 30 else "大热点分层抽样"
            print(f"   📚 实际读取文献: {len(papers)} | 读取模式: {sampling_mode}")

            try:
                review = generate_compact_review(h, papers)
                target_min, target_max, allow_expand = get_target_length_by_paper_count(len(papers or []))
                ok, issues = validate_review_format(review, title, target_min, target_max)

                if not ok:
                    print(f"⚠️ 校验提示，将仍保存。问题: {issues}")

                save_review(h, review)
                print(
                    f"✅ 生成成功。字数: {len(review)} | 采样文献: {len(papers)} | "
                    f"动态目标: {target_min}-{target_max} | 扩写允许: {allow_expand} | "
                    f"校验: {'通过' if ok else '有提示'}"
                )
                time.sleep(2)

            except (requests.exceptions.SSLError, requests.exceptions.ConnectionError, requests.exceptions.ReadTimeout) as net_err:
                print(f"🔒 网络抖动/超时: {net_err}。跳过当前热点，将在下一轮自动重试。")
                time.sleep(10)
                continue

            except requests.exceptions.HTTPError as http_err:
                print(f"🌐 API HTTP 错误: {http_err}。当前热点跳过: {title}")
                time.sleep(10)
                continue

        except KeyboardInterrupt:
            print("⏹️ 用户手动中断，已安全退出。")
            break

        except Exception as e:
            print(f"❌ 逻辑异常 {title}: {e}")


if __name__ == "__main__":
    main()
