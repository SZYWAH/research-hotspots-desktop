# -*- coding: utf-8 -*-
import time
import pymysql
import requests
import os
import calendar

from datetime import datetime, date

# ================= 配置区域 =================
# 修改 openalex_crawler.py 中的配置区域
FIELD_KEYWORD_MAP = {
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
    "Public Administration": "public administration governance bureaucracy policy implementation",
    "Sociology": "sociology social theory social stratification social network",
    "Political Science": "political science democracy governance political behavior institutions"
}

OPENALEX_API_URL = "https://api.openalex.org/works"
MAX_RESULTS_PER_FIELD = 100

HEADERS = {"User-Agent": "ResearchBot/1.0 (mailto:your-email@example.com)"}


from config import get_db_pool

def get_conn():
    return get_db_pool().connection()


def build_date_filter(start_year: int, end_year: int, start_month: int, end_month: int) -> str:
    if not 1 <= start_month <= 12 or not 1 <= end_month <= 12:
        raise ValueError("CRAWL_START_MONTH 和 CRAWL_END_MONTH 必须在 1-12 之间")

    today = datetime.now().date()
    start_day = date(start_year, start_month, 1)
    end_day = date(end_year, end_month, calendar.monthrange(end_year, end_month)[1])
    end_day = min(end_day, today)
    return f"from_publication_date:{start_day.isoformat()},to_publication_date:{end_day.isoformat()}"


def fetch_openalex_entries(
    keyword: str,
    max_results: int,
    start_year: int,
    end_year: int,
    start_month: int,
    end_month: int,
) -> list:
    all_results = []
    page = 1
    date_filter = build_date_filter(start_year, end_year, start_month, end_month)

    while len(all_results) < max_results:
        params = {
            "search": keyword,
            "filter": date_filter,
            "per_page": 50,
            "page": page,
            "sort": "cited_by_count:desc",  # 优先抓取高引论文，提升综述质量
        }
        try:
            resp = requests.get(OPENALEX_API_URL, params=params, headers=HEADERS, timeout=30)
            resp.raise_for_status()
            data = resp.json()
            results = data.get("results", [])
            if not results: break
            all_results.extend(results)
            print(f"关键词 '{keyword}' 第 {page} 页抓取完成...")
            time.sleep(1)
        except Exception as e:
            print(f"发生错误: {e}")
            break
        page += 1
    return all_results[:max_results]


def reconstruct_abstract(index: dict) -> str:
    if not index: return ""
    try:
        word_list = [None] * (max([max(pos) for pos in index.values()]) + 1)
        for word, pos_list in index.items():
            for pos in pos_list: word_list[pos] = word
        return " ".join(w for w in word_list if w is not None)
    except:
        return ""


def parse_entry(entry: dict, field: str) -> dict:
    raw_id = entry.get("id", "").split("/")[-1]
    return {
        "id": f"openalex:{raw_id}",
        "source": "openalex",
        "title": (entry.get("display_name") or "No Title")[:500],
        "abstract": reconstruct_abstract(entry.get("abstract_inverted_index"))[:5000],
        "authors": ", ".join(
            [ca.get("author", {}).get("display_name", "") for ca in entry.get("authorships", []) if ca.get("author")]),
        "categories": ", ".join([c.get("display_name", "") for c in entry.get("concepts", [])[:5]]),
        "field": field,
        "published_date": entry.get("publication_date"),
        "year": entry.get("publication_year"),
        "url": entry.get("doi") or f"https://openalex.org/{raw_id}",
        "doi": entry.get("doi"),
    }


def save_records(records: list):
    if not records: return
    conn = get_conn()
    sql = """
    INSERT INTO papers (id, source, title, abstract, authors, categories, field, published_date, year, url, doi)
    VALUES (%(id)s, %(source)s, %(title)s, %(abstract)s, %(authors)s, %(categories)s, %(field)s, %(published_date)s, %(year)s, %(url)s, %(doi)s)
    ON DUPLICATE KEY UPDATE year = VALUES(year);
    """
    try:
        with conn.cursor() as cursor:
            cursor.executemany(sql, records)
        conn.commit()
    finally:
        conn.close()


def main():
    # 优先从环境变量读取，默认向后兼容 2020-2026
    START_YEAR = int(os.getenv("CRAWL_START_YEAR", 2020))
    END_YEAR = int(os.getenv("CRAWL_END_YEAR", 2026))
    START_MONTH = int(os.getenv("CRAWL_START_MONTH", 1))
    END_MONTH = int(os.getenv("CRAWL_END_MONTH", 12))
    print(f"开始爬取 OpenAlex, 时间范围: {START_YEAR}-{START_MONTH:02d} 至 {END_YEAR}-{END_MONTH:02d}")
    total_saved = 0
    for field, keyword in FIELD_KEYWORD_MAP.items():
        print(f"正在处理领域: {field}")
        entries = fetch_openalex_entries(keyword, MAX_RESULTS_PER_FIELD, START_YEAR, END_YEAR, START_MONTH, END_MONTH)
        records = [parse_entry(e, field) for e in entries]
        save_records(records)
        total_saved += len(records)

    print(f"全部完成，总计保存 {total_saved} 篇文献。")


if __name__ == "__main__":
    main()
