import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path


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
        "connect_timeout": parse_int(env_value(["MYSQL_CONNECT_TIMEOUT", "DB_CONNECT_TIMEOUT"]), 10, 3, 120),
        "read_timeout": parse_int(env_value(["MYSQL_READ_TIMEOUT", "DB_READ_TIMEOUT"]), 120, 10, 600),
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
    if "doesn't exist" in lower:
        return "MySQL app17 galaxy tables are missing. Required tables: papers, paper_topics, hotspots."
    if "pymysql" in lower and "no module" in lower:
        return "PyMySQL is not installed in the selected Python environment. Install pymysql in My_env."
    return text if len(text) <= 800 else f"{text[:800]}..."


def text_value(value):
    if value is None:
        return None
    if isinstance(value, bytes):
        value = value.decode("utf-8", errors="replace")
    text = str(value).strip()
    return " ".join(text.split()) if text else None


def datetime_value(value):
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.isoformat(sep=" ")
    return text_value(value) or ""


def run(input_data):
    try:
        import pymysql
    except Exception as error:
        return {"ok": False, "message": compact_error(error)}

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
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT
                    pt.paper_id AS rawPaperId,
                    pt.field AS field,
                    pt.topic_id AS topicId,
                    pt.x AS x,
                    pt.y AS y,
                    pt.z AS z,
                    p.year AS year
                FROM paper_topics pt
                JOIN papers p ON p.id = pt.paper_id
                WHERE p.year IS NOT NULL
                  AND pt.x IS NOT NULL
                  AND pt.y IS NOT NULL
                  AND pt.z IS NOT NULL
                ORDER BY pt.field, pt.topic_id, p.year DESC, pt.paper_id
                """
            )
            paper_topics = []
            for row in cursor.fetchall():
                paper_topics.append(
                    {
                        "rawPaperId": text_value(row.get("rawPaperId")) or "",
                        "field": text_value(row.get("field")) or "Unknown",
                        "topicId": int(row.get("topicId") or 0),
                        "x": float(row.get("x")),
                        "y": float(row.get("y")),
                        "z": float(row.get("z")),
                        "year": int(row["year"]) if row.get("year") is not None else None,
                    }
                )

            cursor.execute(
                """
                SELECT
                    field,
                    topic_id AS topicId,
                    title_cn AS titleCn,
                    topic_label AS topicLabel,
                    summary_cn AS summaryCn,
                    paper_count AS paperCount,
                    trend_status AS trendStatus,
                    JSON_UNQUOTE(JSON_EXTRACT(evolution_json, '$')) AS evolutionJson
                FROM hotspots
                ORDER BY paper_count DESC, field, topic_id
                """
            )
            hotspots = []
            for row in cursor.fetchall():
                hotspots.append(
                    {
                        "field": text_value(row.get("field")) or "Unknown",
                        "topicId": int(row.get("topicId") or 0),
                        "titleCn": text_value(row.get("titleCn")),
                        "topicLabel": text_value(row.get("topicLabel")),
                        "summaryCn": text_value(row.get("summaryCn")),
                        "paperCount": int(row["paperCount"]) if row.get("paperCount") is not None else None,
                        "trendStatus": text_value(row.get("trendStatus")),
                        "evolutionJson": row.get("evolutionJson"),
                    }
                )

            cursor.execute(
                """
                SELECT field, topic_id AS topicId, review_cn AS reviewCn, created_at AS createdAt
                FROM hotspot_reviews
                ORDER BY created_at DESC
                """
            )
            hotspot_reviews = [
                {
                    "field": text_value(row.get("field")) or "Unknown",
                    "topicId": int(row.get("topicId") or 0),
                    "reviewCn": text_value(row.get("reviewCn")) or "",
                    "createdAt": datetime_value(row.get("createdAt")),
                }
                for row in cursor.fetchall()
                if text_value(row.get("reviewCn"))
            ]

        return {
            "ok": True,
            "paperTopics": paper_topics,
            "hotspots": hotspots,
            "hotspotReviews": hotspot_reviews,
            "elapsedMs": int((time.perf_counter() - started) * 1000),
        }
    except Exception as error:
        return {"ok": False, "message": compact_error(error)}
    finally:
        if connection is not None:
            try:
                connection.close()
            except Exception:
                pass


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"ok": False, "message": "missing input json path"}, ensure_ascii=True))
        return 1
    try:
        input_data = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8-sig"))
    except Exception as error:
        print(json.dumps({"ok": False, "message": f"cannot read input json: {error}"}, ensure_ascii=True))
        return 1
    result = run(input_data if isinstance(input_data, dict) else {})
    print(json.dumps(result, ensure_ascii=True, default=str))
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
