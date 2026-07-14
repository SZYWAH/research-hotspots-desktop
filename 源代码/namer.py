# -*- coding: utf-8 -*-
"""
全学科热点命名引擎：基于 10 年演化趋势与多学科背景生成专业名称。
"""

import argparse
import csv
import json
import os
import time
from typing import List, Tuple
import pymysql
import requests

from config import (
    DEEPSEEK_API_KEY,
    DEEPSEEK_BASE_URL,
    DEEPSEEK_MODEL_NAME,
    EXPORT_DIR,
    get_db_pool
)


# ============ 配置区域 ============
# 建议将这些参数放在 config.py 导入之后
DEEPSEEK_TIMEOUT = 60      # API 响应最长等待时间（秒），综述生成建议设长一点
DEEPSEEK_MAX_RETRY = 5    # 失败后自动重试的最大次数
# ================================
# ============ 1. 学科属性定义 ============
# 区分基础理论学科与应用技术学科，引导 AI 采用不同的命名风格
BASIC_THEORY_FIELDS = ["Algebraic Geometry", "Statistics", "Quantum Physics", "High Energy Physics"]
SOCIAL_SCIENCE_FIELDS = ["Public Administration", "Sociology", "Political Science"]


# ============ 2. 核心函数 ============

def fetch_hotspots(field: str = None, force: bool = False) -> List[dict]:
    """读取待命名的热点记录"""
    conn = get_db_pool().connection()
    cursor = conn.cursor(pymysql.cursors.DictCursor)
    try:
        sql = "SELECT field, topic_id, topic_label, keywords, paper_count, trend_status FROM hotspots WHERE 1=1"
        params = []
        if not force:
            sql += " AND (title_cn IS NULL OR title_cn = '')"
        if field:
            sql += " AND field = %s"
            params.append(field)

        cursor.execute(sql, params)
        return cursor.fetchall()
    finally:
        cursor.close()
        conn.close()


def build_prompt(field: str, keywords: List[str], paper_count: int, trend_status: str) -> str:
    """构造适配全学科、长周期的命名提示词"""
    kws = ", ".join(keywords[:10])
    if field in BASIC_THEORY_FIELDS:
        is_theory = "基础理论与严谨推导"
    elif field in SOCIAL_SCIENCE_FIELDS:
        is_theory = "社会科学与实证研究"
    else:
        is_theory = "工程实践与前沿应用"

    return f"""
你是一名「全学科资深学术专家」，擅长从海量文献关键词中提炼核心研究方向。
请为以下这个在过去 10 年间形成的学术热点聚类命名。

🧩 聚类背景：
- 所属学科：{field}（侧重 {is_theory}）
- 核心关键词：{kws}
- 涉及论文：{paper_count} 篇
- 10 年演化态势：{trend_status}

🎯 命名任务：
1. 生成中文热点名称：
   - 若处于「爆发期」，可使用“范式变迁”、“关键突破”等词汇。
   - 若处于「平稳期」，使用成熟、标准的学术定义。
   - 若处于「基础理论」学科，名称应极度严谨，体现其在学科大树上的位置。
2. 生成中文描述（60字内）：
   - 必须结合 10 年演化背景。描述该方向是从什么技术演变而来，或者其解决的底层科学问题是什么。

📌 输出格式（必须严格遵守）：
热点名称：[在此输入中文名称]
热点描述：[在此输入中文简述]
"""


def call_deepseek(prompt: str) -> str:
    """调用 DeepSeek API，严格清洗 URL 防止重定向"""
    if not DEEPSEEK_API_KEY:
        raise RuntimeError("缺失 API KEY，请检查配置文件。")

    # 1. 动态清洗 URL：确保没有多余的空格和重复的斜杠
    base_url = DEEPSEEK_BASE_URL.strip().rstrip('/')
    target_url = f"{base_url}/chat/completions"

    # 2. 清洗 API Key：防止复制粘贴时带入不可见的换行符
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {DEEPSEEK_API_KEY.strip()}"
    }

    payload = {
        "model": DEEPSEEK_MODEL_NAME,  # 确保 config.py 中是 deepseek-chat
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.3,
    }

    # 3. 增加 allow_redirects=False 以便在调试阶段捕获异常重定向
    for attempt in range(1, DEEPSEEK_MAX_RETRY + 1):
        try:
            resp = requests.post(
                target_url,
                headers=headers,
                json=payload,
                timeout=DEEPSEEK_TIMEOUT,
                allow_redirects=False  # 关键：禁止自动转为 GET
            )
            print(f"DEBUG: 最终请求地址是 {target_url}")
            if resp.status_code == 301 or resp.status_code == 302:
                print(f"❌ 发现重定向！请检查 BASE_URL 配置。当前拼接结果: {target_url}")
                return ""

            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"].strip()

        except Exception as e:
            print(f"⚠️ 第 {attempt} 次调用失败: {e}")
            time.sleep(2 * attempt)

    return ""


def parse_output(text: str) -> Tuple[str, str]:
    """解析 AI 返回的标题和描述"""
    title, summary = "", ""
    for line in text.splitlines():
        if "热点名称：" in line: title = line.split("：", 1)[-1].strip()
        if "热点描述：" in line: summary = line.split("：", 1)[-1].strip()
    return title, summary


def update_db(results: List[dict]):
    """批量写回数据库"""
    if not results: return
    conn = get_db_pool().connection()
    try:
        with conn.cursor() as cur:
            sql = "UPDATE hotspots SET title_cn = %s, summary_cn = %s WHERE field = %s AND topic_id = %s"
            params = [(r["t"], r["s"], r["f"], r["id"]) for r in results]
            cur.executemany(sql, params)
        conn.commit()
    finally:
        conn.close()


# ============ 3. 主程序 ============

def main(field=None, force=False):
    hotspots = fetch_hotspots(field, force)
    if not hotspots:
        print("✅ 没有待命名的热点，任务提前结束。")
        return

    print(f"🚀 开始命名流程，共 {len(hotspots)} 个热点...")
    results = []

    for row in hotspots:
        try:
            kw_list = json.loads(row["keywords"])
            prompt = build_prompt(row["field"], kw_list, row["paper_count"], row["trend_status"])

            raw_response = call_deepseek(prompt)
            title, summary = parse_output(raw_response)

            if title and summary:
                results.append({"t": title, "s": summary, "f": row["field"], "id": row["topic_id"]})
                print(f"✅ [{row['field']}] Topic {row['topic_id']} -> {title}")

            # 每 10 条保存一次，防止程序崩溃导致丢失进度
            if len(results) >= 10:
                update_db(results)
                results = []

        except Exception as e:
            print(f"❌ 处理 Topic {row['topic_id']} 失败: {e}")

    update_db(results)  # 保存剩余结果
    print("🎉 所有热点中文命名与描述生成完毕。")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--field", type=str, default=None)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    main(args.field, args.force)