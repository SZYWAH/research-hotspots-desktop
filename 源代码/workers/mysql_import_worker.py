import hashlib
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path


DEFAULT_BATCH_SIZE = 1000


def emit(payload):
    print(json.dumps(payload, ensure_ascii=True, default=str), flush=True)


def read_dotenv_values():
    values = {}
    candidates = [
        Path.cwd() / ".env",
        Path.cwd() / ".env.local",
        Path(__file__).resolve().parent.parent / ".env",
        Path(__file__).resolve().parent.parent / ".env.local",
    ]
    for path in candidates:
        if not path.exists():
            continue
        try:
            for line in path.read_text(encoding="utf-8-sig").splitlines():
                stripped = line.strip()
                if not stripped or stripped.startswith("#") or "=" not in stripped:
                    continue
                key, value = stripped.split("=", 1)
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                if key and key not in values:
                    values[key] = value
        except Exception:
            continue
    return values


def parse_int(value, default, minimum=None, maximum=None):
    try:
        number = int(value)
    except (TypeError, ValueError):
        number = default
    if minimum is not None:
        number = max(minimum, number)
    if maximum is not None:
        number = min(maximum, number)
    return number


def read_config(input_data):
    dotenv = read_dotenv_values()

    def env_value(names):
        for name in names:
            value = os.environ.get(name)
            if value and value.strip():
                return value.strip()
            value = dotenv.get(name)
            if value and value.strip():
                return value.strip()
        return ""

    def pick(key, env_names, default=""):
        value = input_data.get(key)
        if value is not None and str(value).strip():
            return str(value).strip()
        return env_value(env_names) or default

    return {
        "host": pick("host", ["MYSQL_HOST", "DB_HOST"], "127.0.0.1"),
        "port": parse_int(pick("port", ["MYSQL_PORT", "DB_PORT"], "3306"), 3306, 1, 65535),
        "user": pick("user", ["MYSQL_USER", "DB_USER"], "root"),
        "password": pick("password", ["MYSQL_PASSWORD", "DB_PASSWORD"], ""),
        "database": pick("database", ["MYSQL_DATABASE", "MYSQL_DB", "DB_NAME"], "research_hotspots"),
        "charset": pick("charset", ["MYSQL_CHARSET", "DB_CHARSET"], "utf8mb4"),
        "batch_size": parse_int(input_data.get("batchSize") or input_data.get("batch_size"), DEFAULT_BATCH_SIZE, 100, 5000),
        "connect_timeout": parse_int(env_value(["MYSQL_CONNECT_TIMEOUT", "DB_CONNECT_TIMEOUT"]), 10, 3, 120),
        "read_timeout": parse_int(env_value(["MYSQL_READ_TIMEOUT", "DB_READ_TIMEOUT"]), 60, 10, 600),
    }


def compact_error(error):
    text = str(error).strip() or error.__class__.__name__
    lower = text.lower()
    if "access denied" in lower:
        return "MySQL access denied. Check user/password in settings or MYSQL_PASSWORD/DB_PASSWORD."
    if "can't connect" in lower or "connection refused" in lower:
        return "Cannot connect to MySQL. Check that the local MySQL service is running and host/port are correct."
    if "unknown database" in lower:
        return "MySQL database does not exist. Check the configured database name."
    if "doesn't exist" in lower and "papers" in lower:
        return "MySQL table papers does not exist in the selected database."
    if "pymysql" in lower and "no module" in lower:
        return "PyMySQL is not installed in the selected Python environment. Install pymysql in My_env."
    return text if len(text) <= 600 else f"{text[:600]}..."


def text_value(value, max_len=None):
    if value is None:
        return ""
    if isinstance(value, bytes):
        value = value.decode("utf-8", errors="replace")
    text = str(value).strip()
    text = " ".join(text.split())
    if max_len is not None:
        return text[:max_len]
    return text


def datetime_value(value):
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.isoformat(sep=" ")
    return text_value(value)


def source_value(value):
    text = text_value(value).lower()
    if "arxiv" in text:
        return "arxiv"
    if "openalex" in text:
        return "openalex"
    if "cnki" in text:
        return "cnki"
    return "local"


def parse_year(value, published_date):
    for candidate in (value, published_date):
        text = text_value(candidate)
        if len(text) >= 4:
            try:
                year = int(text[:4])
            except ValueError:
                continue
            if 1800 <= year <= 2200:
                return year
    return None


def fallback_id(title, doi, url, index):
    seed = f"{title}:{doi}:{url}:{index}".encode("utf-8", errors="replace")
    return f"mysql:{hashlib.sha1(seed).hexdigest()[:16]}"


def transform_row(row, row_index):
    title = text_value(row.get("title"), 500)
    if not title:
        return None

    abstract = text_value(row.get("abstract"), 5000)
    if not abstract:
        abstract = "Imported from local MySQL papers table; source abstract was empty."

    doi = text_value(row.get("doi")) or None
    url = text_value(row.get("url")) or None
    published_date = datetime_value(row.get("published_date")) or None
    created_at = datetime_value(row.get("created_at"))
    if not created_at:
        created_at = datetime.now(timezone.utc).isoformat()

    paper_id = text_value(row.get("id")) or fallback_id(title, doi or "", url or "", row_index)
    field = text_value(row.get("field")) or "Local MySQL"

    return {
        "id": paper_id,
        "projectId": None,
        "source": source_value(row.get("source")),
        "title": title,
        "abstract": abstract,
        "authors": text_value(row.get("authors")) or None,
        "categories": text_value(row.get("categories")) or None,
        "field": field,
        "publishedDate": published_date,
        "year": parse_year(row.get("year"), published_date),
        "url": url,
        "doi": doi,
        "createdAt": created_at,
        "updatedAt": created_at,
    }


def run(input_data):
    try:
        import pymysql
    except Exception as error:
        emit({"type": "error", "message": compact_error(error)})
        return 1

    config = read_config(input_data)
    started = time.perf_counter()
    connection = None
    try:
        connection = pymysql.connect(
            host=config["host"],
            port=config["port"],
            user=config["user"],
            password=config["password"],
            database=config["database"],
            charset=config["charset"],
            cursorclass=pymysql.cursors.DictCursor,
            connect_timeout=config["connect_timeout"],
            read_timeout=config["read_timeout"],
            autocommit=True,
        )

        columns = "id, source, title, abstract, authors, categories, field, published_date, year, url, doi, created_at"
        with connection.cursor() as cursor:
            cursor.execute("SELECT COUNT(*) AS total FROM papers")
            total = int((cursor.fetchone() or {}).get("total") or 0)
            emit({"type": "count", "total": total, "batchSize": config["batch_size"]})

            read = 0
            batch_index = 0
            last_id = None
            while True:
                if last_id is None:
                    cursor.execute(f"SELECT {columns} FROM papers ORDER BY id LIMIT %s", (config["batch_size"],))
                else:
                    cursor.execute(f"SELECT {columns} FROM papers WHERE id > %s ORDER BY id LIMIT %s", (last_id, config["batch_size"]))

                rows = cursor.fetchall()
                if not rows:
                    break

                batch_index += 1
                read += len(rows)
                last_id = rows[-1].get("id")
                papers = []
                invalid_rows = 0
                for offset, row in enumerate(rows, start=read - len(rows) + 1):
                    paper = transform_row(row, offset)
                    if paper is None:
                        invalid_rows += 1
                    else:
                        papers.append(paper)

                emit({
                    "type": "batch",
                    "batchIndex": batch_index,
                    "read": read,
                    "invalidRows": invalid_rows,
                    "rows": papers,
                })

        emit({
            "type": "done",
            "read": read,
            "elapsedMs": int((time.perf_counter() - started) * 1000),
        })
        return 0
    except Exception as error:
        emit({"type": "error", "message": compact_error(error)})
        return 1
    finally:
        if connection is not None:
            try:
                connection.close()
            except Exception:
                pass


def main():
    if len(sys.argv) < 2:
        emit({"type": "error", "message": "missing input json path"})
        return 1
    input_path = Path(sys.argv[1])
    try:
        input_data = json.loads(input_path.read_text(encoding="utf-8-sig"))
    except Exception as error:
        emit({"type": "error", "message": f"cannot read input json: {error}"})
        return 1
    return run(input_data if isinstance(input_data, dict) else {})


if __name__ == "__main__":
    raise SystemExit(main())
