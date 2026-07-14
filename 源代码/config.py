# -*- coding: utf-8 -*-
import os
from pathlib import Path
from dotenv import load_dotenv

# 加载 .env 文件
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(os.path.join(BASE_DIR, '.env'))

# --- 数据库配置字典 ---
DB_CONF = {
    "host": os.getenv("DB_HOST", "localhost"),
    "port": int(os.getenv("DB_PORT", 3306)),
    "user": os.getenv("DB_USER", "root"),
    "password": os.getenv("DB_PASSWORD", ""),
    "database": os.getenv("DB_NAME", "research_hotspots"),
    "charset": os.getenv("DB_CHARSET", "utf8mb4"),
}

# --- LLM 配置 ---
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://dpapi.cn/v1")
DEEPSEEK_MODEL_NAME = os.getenv("DEEPSEEK_MODEL_NAME", "deepseek-V3")

# --- 路径配置 ---
# --- 路径配置 ---
def resolve_path(env_value: str, default_path: Path) -> str:
    if not env_value:
        return str(default_path)
    p = Path(env_value)
    if p.is_absolute():
        return str(p)
    return str((BASE_DIR / p).resolve())

EXPORT_DIR = resolve_path(
    os.getenv("EXPORT_DIR"),
    BASE_DIR / "data" / "exports"
)

FONT_PATH = resolve_path(
    os.getenv("FONT_PATH"),
    BASE_DIR / "assets" / "fonts" / "SIMHEI.ttf"
)

MERMAID_JS_PATH = resolve_path(
    os.getenv("MERMAID_JS_PATH"),
    BASE_DIR / "assets" / "js" / "mermaid.min.js"
)

CHROME_DRIVER_PATH = os.getenv("CHROME_DRIVER_PATH", "/usr/bin/chromedriver")


# 确保导出目录存在
os.makedirs(EXPORT_DIR, exist_ok=True)

import pymysql
from dbutils.pooled_db import PooledDB

_db_pool = None

def get_db_pool():
    global _db_pool
    if _db_pool is None:
        _db_pool = PooledDB(
            creator=pymysql,
            maxconnections=50,
            mincached=5,
            maxcached=20,
            blocking=True,
            ping=1,
            **DB_CONF
        )
    return _db_pool

# ================= 学科领域配置 =================
# 建议在这里统一管理，这样爬虫、聚类引擎和前端展示都会保持同步
# 在 config.py 中
FIELDS = [
    "Artificial Intelligence",
    "Quantum Physics",
    "Computational Biology",
    "Econometrics",
    "Astrophysics",
    "Statistics",
    "Condensed Matter",
    "High Energy Physics",
    "Algebraic Geometry",
    "Medical Imaging",
    # 社会科学领域（英语验证）
    "Public Administration",
    "Sociology",
    "Political Science"
]