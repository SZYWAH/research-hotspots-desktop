import os
import sys
import re
import pymysql

# 动态定位项目根目录，确保能找到根目录下的 config.py
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(os.path.dirname(CURRENT_DIR))
if PROJECT_ROOT not in sys.path:
    sys.path.append(PROJECT_ROOT)




# 来源优先级（数值越小越优先保留）
SOURCE_PRIORITY = {
    "arxiv": 1,
    "openalex": 2,
    "crossref": 3,
    "semantic_scholar": 4,
}


from config import get_db_pool

def get_conn():
    return get_db_pool().connection()


# ─────────────────────────────────────────
# 工具函数
# ─────────────────────────────────────────

def strip_html(text: str) -> str:
    """去除 HTML/XML 标签（CrossRef 摘要常带 <jats:p> 等）。"""
    if not text:
        return ""
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"&[a-z]+;", " ", text)  # HTML 实体
    return text.strip()


def normalize_whitespace(text: str) -> str:
    if not text:
        return ""
    return re.sub(r"\s+", " ", text).strip()


def normalize_title(title: str) -> str:
    """用于去重比较的标题标准化（不写回数据库）。"""
    return re.sub(r"\s+", " ", title.lower().strip()) if title else ""


def clean_text(text: str, max_len: int) -> str:
    text = strip_html(text)
    text = normalize_whitespace(text)
    return text[:max_len]


# ─────────────────────────────────────────
# 统计
# ─────────────────────────────────────────

def print_stats(conn, label: str):
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM papers")
        total = cur.fetchone()[0]
        cur.execute(
            "SELECT COUNT(*) FROM papers WHERE abstract IS NULL OR TRIM(abstract) = ''"
        )
        no_abstract = cur.fetchone()[0]
        cur.execute("SELECT source, COUNT(*) FROM papers GROUP BY source")
        by_source = cur.fetchall()
        cur.execute("SELECT field, COUNT(*) FROM papers GROUP BY field")
        by_field = cur.fetchall()

    print(f"\n{'=' * 50}")
    print(f"  {label}")
    print(f"{'=' * 50}")
    print(f"  总记录数      : {total}")
    print(f"  无摘要记录    : {no_abstract}")
    print(f"  各来源分布:")
    for src, cnt in by_source:
        print(f"    {src:<20} {cnt}")
    print(f"  各学科分布:")
    for field, cnt in by_field:
        print(f"    {field:<35} {cnt}")


# ─────────────────────────────────────────
# 清洗步骤
# ─────────────────────────────────────────

def step1_remove_empty_abstract(conn):
    """删除摘要为空或过短（<20字符）的记录。"""
    with conn.cursor() as cur:
        # execute() 在 PyMySQL 中会直接返回受影响的行数
        deleted = cur.execute(
            "DELETE FROM papers WHERE abstract IS NULL OR CHAR_LENGTH(TRIM(abstract)) < 20"
        )
    # 不要使用 conn.affected_rows()，因为它在连接池包装器中不可用
    conn.commit()
    print(f"\n[Step 1] 删除无效摘要记录: {deleted} 条")


def step2_deduplicate_by_doi(conn):
    """同一 DOI 只保留来源优先级最高的一条。"""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT doi, GROUP_CONCAT(id ORDER BY source) AS ids,
                   GROUP_CONCAT(source ORDER BY source) AS sources
            FROM papers
            WHERE doi IS NOT NULL AND doi != ''
            GROUP BY doi
            HAVING COUNT(*) > 1
        """)
        duplicates = cur.fetchall()

    to_delete = []
    for doi, ids_str, sources_str in duplicates:
        id_list = ids_str.split(",")
        src_list = sources_str.split(",")
        # 按优先级排序，保留第一个
        paired = sorted(zip(src_list, id_list),
                        key=lambda x: SOURCE_PRIORITY.get(x[0], 99))
        # 其余全部删除
        to_delete.extend(pid for _, pid in paired[1:])

    if to_delete:
        with conn.cursor() as cur:
            fmt = ",".join(["%s"] * len(to_delete))
            cur.execute(f"DELETE FROM papers WHERE id IN ({fmt})", to_delete)
        conn.commit()

    print(f"[Step 2] DOI 去重，删除重复记录: {len(to_delete)} 条")


def step3_deduplicate_by_title(conn):
    """同一标题（忽略大小写和空格）只保留来源优先级最高的一条。"""
    with conn.cursor() as cur:
        cur.execute("SELECT id, title, source FROM papers WHERE title IS NOT NULL")
        rows = cur.fetchall()

    seen: dict[str, tuple] = {}  # normalized_title -> (id, source)
    to_delete = []

    for pid, title, source in rows:
        key = normalize_title(title)
        if not key:
            continue
        if key not in seen:
            seen[key] = (pid, source)
        else:
            existing_id, existing_src = seen[key]
            existing_pri = SOURCE_PRIORITY.get(existing_src, 99)
            current_pri = SOURCE_PRIORITY.get(source, 99)
            if current_pri < existing_pri:
                to_delete.append(existing_id)
                seen[key] = (pid, source)
            else:
                to_delete.append(pid)

    if to_delete:
        # 分批删除，避免 IN 子句过长
        batch = 500
        with conn.cursor() as cur:
            for i in range(0, len(to_delete), batch):
                chunk = to_delete[i:i + batch]
                fmt = ",".join(["%s"] * len(chunk))
                cur.execute(f"DELETE FROM papers WHERE id IN ({fmt})", chunk)
        conn.commit()

    print(f"[Step 3] 标题去重，删除重复记录: {len(to_delete)} 条")


def step4_clean_text_fields(conn):
    """清洗摘要和标题中的 HTML 标签、多余空白，并截断超长字段。"""
    with conn.cursor() as cur:
        cur.execute("SELECT id, title, abstract FROM papers")
        rows = cur.fetchall()

    updates = []
    for pid, title, abstract in rows:
        new_title = clean_text(title or "", 500)
        new_abstract = clean_text(abstract or "", 5000)
        if new_title != (title or "") or new_abstract != (abstract or ""):
            updates.append((new_title, new_abstract, pid))

    if updates:
        with conn.cursor() as cur:
            cur.executemany(
                "UPDATE papers SET title=%s, abstract=%s WHERE id=%s",
                updates
            )
        conn.commit()

    print(f"[Step 4] 清洗文本字段: 更新 {len(updates)} 条记录")


def step5_remove_no_title(conn):
    """删除标题为空的记录。"""
    with conn.cursor() as cur:
        deleted = cur.execute(
            "DELETE FROM papers WHERE title IS NULL OR TRIM(title) = ''"
        )
    conn.commit()
    print(f"[Step 5] 删除无标题记录: {deleted} 条")


# ─────────────────────────────────────────
# 主入口
# ─────────────────────────────────────────

def main():
    conn = get_conn()
    try:
        print_stats(conn, "清洗前数据概况")

        step1_remove_empty_abstract(conn)
        step2_deduplicate_by_doi(conn)
        step3_deduplicate_by_title(conn)
        step4_clean_text_fields(conn)
        step5_remove_no_title(conn)

        print_stats(conn, "清洗后数据概况")
        print("\n清洗完成。")
    finally:
        conn.close()


if __name__ == "__main__":
    main()