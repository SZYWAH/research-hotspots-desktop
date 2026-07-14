# -*- coding: utf-8 -*-
import time
import random
import calendar
from datetime import datetime, date
from typing import List, Dict, Tuple
import feedparser
import pymysql
import requests
from config import (
    DB_CONF
)
import os # 用于读取后续的年份环境变量

# ================= 配置区域 =================
# 修改 arxiv_crawler.py 中的配置区域
FIELD_CATEGORY_MAP: Dict[str, List[str]] = {
    "Artificial Intelligence": ["cs.AI", "cs.LG"], # 合并原有的 AI 和机器学习
    "Quantum Physics": ["quant-ph"],               # 量子物理
    "Computational Biology": ["q-bio.BM", "q-bio.GN"], # 计算生物学与基因组学
    "Econometrics": ["econ.EM"],                   # 计量经济学
    "Astrophysics": ["astro-ph.CO", "astro-ph.HE"],# 天体物理（宇宙学与高能）
    "Statistics": ["stat.TH", "stat.AP"],          # 统计理论与应用
    "Condensed Matter": ["cond-mat.mtrl-sci"],     # 凝聚态物理（材料科学相关）
    "High Energy Physics": ["hep-ph"],             # 高能物理
    "Algebraic Geometry": ["math.AG"],             # 代数几何（纯数学代表）
    "Medical Imaging": ["eess.IV"],                # 电气工程：图像与视频处理（医学影像相关）
    # 社会科学领域在 arXiv 上无对应分类，仅通过 OpenAlex 爬取
}

ARXIV_API_URL = "https://export.arxiv.org/api/query"
REQUEST_INTERVAL = float(os.getenv("ARXIV_REQUEST_INTERVAL", 8))
BATCH_SIZE = int(os.getenv("ARXIV_BATCH_SIZE", 25))
MAX_RESULTS_PER_CAT = int(os.getenv("ARXIV_MAX_RESULTS_PER_CAT", 100))
MAX_RETRIES = int(os.getenv("ARXIV_MAX_RETRIES", 6))
COOLDOWN_ON_429 = float(os.getenv("ARXIV_COOLDOWN_ON_429", 300))
COOLDOWN_ON_TIMEOUT = float(os.getenv("ARXIV_COOLDOWN_ON_TIMEOUT", 120))
REQUEST_TIMEOUT = (
    float(os.getenv("ARXIV_CONNECT_TIMEOUT", 10)),
    float(os.getenv("ARXIV_READ_TIMEOUT", 60)),
)
USER_AGENT = os.getenv(
    "ARXIV_USER_AGENT",
    "research-hotspots-crawler/1.0 (mailto:academic_researcher@example.com)",
)




def log(msg: str):
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}")


from config import get_db_pool

def get_conn():
    return get_db_pool().connection()


def iter_month_windows(
    start_year: int,
    end_year: int,
    start_month: int = 1,
    end_month: int = 12,
) -> List[Tuple[date, date]]:
    if not 1 <= start_month <= 12 or not 1 <= end_month <= 12:
        raise ValueError("CRAWL_START_MONTH 和 CRAWL_END_MONTH 必须在 1-12 之间")

    today = datetime.now().date()
    start_day = date(start_year, start_month, 1)
    end_day = date(end_year, end_month, calendar.monthrange(end_year, end_month)[1])
    end_day = min(end_day, today)
    if end_day < start_day:
        return []

    windows = []
    year, month = start_day.year, start_day.month
    while date(year, month, 1) <= end_day:
        month_start = max(date(year, month, 1), start_day)
        if month == 12:
            next_month = date(year + 1, 1, 1)
        else:
            next_month = date(year, month + 1, 1)
        month_end = min(next_month.replace(day=1).toordinal() - 1, end_day.toordinal())
        windows.append((month_start, date.fromordinal(month_end)))

        if month == 12:
            year += 1
            month = 1
        else:
            month += 1

    return list(reversed(windows))


def fetch_entries(
    category: str,
    max_results: int,
    start_year: int,
    end_year: int,
    start_month: int = 1,
    end_month: int = 12,
) -> List:
    entries = []
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})

    for window_start, window_end in iter_month_windows(start_year, end_year, start_month, end_month):
        if len(entries) >= max_results:
            break

        date_filter = (
            "AND submittedDate:"
            f"[{window_start.strftime('%Y%m%d')}0000 TO {window_end.strftime('%Y%m%d')}2359]"
        )
        window_label = f"{window_start:%Y-%m-%d}~{window_end:%Y-%m-%d}"

        for start in range(0, max_results - len(entries), BATCH_SIZE):
            current_max = min(BATCH_SIZE, max_results - len(entries))
            params = {
                "search_query": f"cat:{category} {date_filter}",
                "start": start,
                "max_results": current_max,
                "sortBy": "submittedDate",
                "sortOrder": "descending",
            }

            success = False
            feed = None
            for attempt in range(MAX_RETRIES):
                try:
                    time.sleep(REQUEST_INTERVAL + random.uniform(0, 2))

                    resp = session.get(ARXIV_API_URL, params=params, timeout=REQUEST_TIMEOUT)
                    resp.raise_for_status()
                    feed = feedparser.parse(resp.text)

                    if not feed.entries:
                        success = True
                        break

                    entries.extend(feed.entries)
                    log(f"分类 {category} ({window_label}) 抓取进度: {len(entries)} 条")

                    success = True
                    break

                except requests.HTTPError as e:
                    if e.response is not None and e.response.status_code == 429:
                        retry_after = e.response.headers.get("Retry-After")
                        wait_time = int(retry_after) if retry_after and retry_after.isdigit() else COOLDOWN_ON_429
                        wait_time += random.uniform(0, 10)
                        log(f"arXiv 限流(429)，第{attempt + 1}次重试，等待{wait_time:.1f}s... {e}")
                    else:
                        wait_time = min(30 * (2 ** attempt), 300) + random.uniform(0, 5)
                        log(f"请求失败，第{attempt + 1}次重试，等待{wait_time:.1f}s... {e}")
                    time.sleep(wait_time)

                except requests.Timeout as e:
                    wait_time = COOLDOWN_ON_TIMEOUT + random.uniform(0, 10)
                    log(f"arXiv 响应超时，第{attempt + 1}次重试，等待{wait_time:.1f}s... {e}")
                    time.sleep(wait_time)

                except requests.RequestException as e:
                    wait_time = min(30 * (2 ** attempt), 300) + random.uniform(0, 5)
                    log(f"网络请求失败，第{attempt + 1}次重试，等待{wait_time:.1f}s... {e}")
                    time.sleep(wait_time)

            if not success or not feed or not feed.entries:
                break
            if len(feed.entries) < current_max:
                break
    return entries


def parse_entry(entry, field: str) -> Dict:
    raw_id = entry.id.split("/abs/")[-1]
    published = entry.published
    published_dt = datetime.fromisoformat(published.replace("Z", "+00:00"))

    return {
        "id": f"arxiv:{raw_id}",
        "source": "arxiv",
        "title": entry.title.replace("\n", " ").strip(),
        "abstract": entry.summary.replace("\n", " ").strip(),
        "authors": ", ".join([a.name for a in entry.get("authors", [])]),
        "categories": ",".join([t["term"] for t in entry.get("tags", [])]),
        "field": field,
        "published_date": published_dt.strftime("%Y-%m-%d %H:%M:%S"),
        "year": published_dt.year,
        "url": f"https://arxiv.org/abs/{raw_id}",
        "doi": next((l.href for l in entry.get("links", []) if l.get("title") == "doi"), None),
    }


def save_records(records: List[Dict]):
    if not records: return
    conn = get_conn()
    cursor = conn.cursor()
    sql = """
    INSERT INTO papers (id, source, title, abstract, authors, categories, field, published_date, year, url, doi)
    VALUES (%(id)s, %(source)s, %(title)s, %(abstract)s, %(authors)s, %(categories)s, %(field)s, %(published_date)s, %(year)s, %(url)s, %(doi)s)
    ON DUPLICATE KEY UPDATE year = VALUES(year), field = VALUES(field);
    """
    try:
        cursor.executemany(sql, records)
        conn.commit()
    finally:
        cursor.close()
        conn.close()


def main():
    # 优先从环境变量读取，若未配置则提供默认安全回退值
    START_YEAR = int(os.getenv("CRAWL_START_YEAR", 2020))
    END_YEAR = int(os.getenv("CRAWL_END_YEAR", 2020))
    START_MONTH = int(os.getenv("CRAWL_START_MONTH", 1))
    END_MONTH = int(os.getenv("CRAWL_END_MONTH", 12))
    log(f"开始抓取 arXiv 文献，目标范围: {START_YEAR}-{START_MONTH:02d} 至 {END_YEAR}-{END_MONTH:02d}")

    for field, categories in FIELD_CATEGORY_MAP.items():
        all_field_records = {}
        for cat in categories:
            entries = fetch_entries(cat, MAX_RESULTS_PER_CAT, START_YEAR, END_YEAR, START_MONTH, END_MONTH)
            for e in entries:
                record = parse_entry(e, field)
                all_field_records[record["id"]] = record

        save_records(list(all_field_records.values()))
        log(f"领域 [{field}] 任务完成")


if __name__ == "__main__":
    main()
