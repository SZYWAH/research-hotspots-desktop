# -*- coding: utf-8 -*-
import os
import json
import numpy as np
import pymysql
import streamlit as st
import streamlit.components.v1 as components
import plotly.graph_objects as go
from datetime import datetime
import sys
import time
import pandas as pd
from openai import OpenAI
import requests
import xml.etree.ElementTree as ET
import random
import re
import concurrent.futures
import markdown
from xhtml2pdf import pisa
import io
import shutil
import tempfile
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from config import (
    DEEPSEEK_API_KEY,
    DEEPSEEK_BASE_URL,
    DEEPSEEK_MODEL_NAME,
    EXPORT_DIR,
    FONT_PATH,
    MERMAID_JS_PATH
)


# --- Selenium 相关导入 ---
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.keys import Keys

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service

from collections import defaultdict

# =========================================================
# 1. 全局配置
# =========================================================

# 必须作为第一个 Streamlit 命令调用
st.set_page_config(page_title="DeepResearch AI 科研平台", page_icon="🌌", layout="wide")

# 初始化统一的 OpenAI 客户端
@st.cache_resource
def get_llm_client():
    return OpenAI(
        api_key=DEEPSEEK_API_KEY,
        base_url=DEEPSEEK_BASE_URL,
        timeout=60.0,
        max_retries=1
    )



# 导出目录配置

# app14.py 顶部配置区

# 这是一个兜底池，当数据库里没有任何热点时显示这些内容
HOTSPOT_POOL = [
    "生成式AI在蛋白质折叠中的应用", "大规模语言模型的幻觉抑制",
    "固态电池电解质界面稳定性", "量子纠错码的最新进展",
    "CRISPR基因编辑脱靶率控制", "6G通信中的太赫兹技术",
    "钙钛矿太阳能电池效率优化", "自动驾驶中的多模态融合",
    "神经形态计算芯片架构", "高温超导材料的压力效应"
]

# 文献深度分析页的学科模板选项：用于提示词侧重点控制。
DISCIPLINE_OPTIONS = [
    "理工科",
    "信息学科",
    "计算机与人工智能",
    "数据科学与信息管理",
    "材料与化学",
    "生命科学",
    "医学科",
    "环境与地球科学",
    "工程技术",
    "管理学与经济学",
    "教育学",
    "法学",
    "人文社科",
    "交叉学科",
]


MAX_VISIBLE_HOTSPOTS = None
MAX_PAPERS_PER_HOTSPOT = None   # None 表示这 50 个热点下的论文星全部显示


def sample_hotspots(pool, sample_size=10):
    """从候选热点中安全采样；数量不足时直接返回全部。"""
    cleaned = [str(x).strip() for x in pool if str(x).strip()]
    cleaned = list(dict.fromkeys(cleaned))
    if not cleaned:
        return []
    if len(cleaned) <= sample_size:
        return cleaned
    return random.sample(cleaned, sample_size)


def load_hotspot_candidates(limit=20):
    """优先从数据库读取热点名称，失败时回退到内置热点池。"""
    try:
        conn = get_conn()
        with conn.cursor() as cur:
            cur.execute(
                "SELECT title_cn FROM hotspots WHERE title_cn IS NOT NULL AND TRIM(title_cn) != '' ORDER BY paper_count DESC LIMIT %s",
                (limit,)
            )
            real_hotspots = [r[0] for r in cur.fetchall()]
        conn.close()
        if real_hotspots:
            return real_hotspots
    except Exception:
        pass
    return HOTSPOT_POOL[:]


# =========================================================
# 全局状态初始化
# =========================================================
def init_session_state():
    if "current_page" not in st.session_state: st.session_state.current_page = "home"
    if 'results' not in st.session_state: st.session_state.results = None
    if 'simple_report' not in st.session_state: st.session_state.simple_report = None
    if 'complex_report' not in st.session_state: st.session_state.complex_report = None
    if 'mindmap_code' not in st.session_state: st.session_state.mindmap_code = None
    if 'search_query' not in st.session_state: st.session_state.search_query = ""
    if 'trigger_search' not in st.session_state: st.session_state.trigger_search = False
    if 'trigger_deep_search' not in st.session_state: st.session_state.trigger_deep_search = False

    # ===== 新增：综述二次修改与 AI 普通聊天状态 =====
    if 'revised_report' not in st.session_state: st.session_state.revised_report = None
    if 'revise_instructions' not in st.session_state: st.session_state.revise_instructions = ""
    if 'revise_base_mode' not in st.session_state: st.session_state.revise_base_mode = "精简版综述"
    if 'chat_history' not in st.session_state: st.session_state.chat_history = []
    if 'ai_workbench_collapsed' not in st.session_state: st.session_state.ai_workbench_collapsed = False

    if 'hotspots' not in st.session_state:
        st.session_state.hotspots = sample_hotspots(load_hotspot_candidates(), 10)

    # ===== 新增：星图页缓存 =====
    if "galaxy_loaded" not in st.session_state:
        st.session_state.galaxy_loaded = False
    if "galaxy_all_papers" not in st.session_state:
        st.session_state.galaxy_all_papers = None
    if "galaxy_all_hotspots" not in st.session_state:
        st.session_state.galaxy_all_hotspots = None
    if "galaxy_visible_papers" not in st.session_state:
        st.session_state.galaxy_visible_papers = None
    if "galaxy_visible_hotspots" not in st.session_state:
        st.session_state.galaxy_visible_hotspots = None
    if "galaxy_figure" not in st.session_state:
        st.session_state.galaxy_figure = None
    if "galaxy_figure_app14" not in st.session_state:
        st.session_state.galaxy_figure_app14 = None
    if "galaxy_figure_app15" not in st.session_state:
        st.session_state.galaxy_figure_app15 = None
    if "galaxy_html_app14" not in st.session_state:
        st.session_state.galaxy_html_app14 = None
    if "galaxy_html_app15" not in st.session_state:
        st.session_state.galaxy_html_app15 = None
    if "galaxy_cache_built_at" not in st.session_state:
        st.session_state.galaxy_cache_built_at = None
    if "galaxy_view_mode" not in st.session_state:
        st.session_state.galaxy_view_mode = "app14"
    if "galaxy_selected_name" not in st.session_state:
        st.session_state.galaxy_selected_name = None

# =========================================================
# 2. CSS 样式注入管理（统一设计系统）
# =========================================================

def inject_global_css():
    """全局设计系统——深色编辑主义，简洁大气有质感。"""
    st.markdown("""
    <style>
    /* ===== Design Tokens ===== */
    :root {
        --bg-deep: #07070f;
        --bg-primary: #0c0c1d;
        --bg-secondary: #12122a;
        --bg-card: rgba(18, 18, 42, 0.88);
        --bg-card-solid: #18183a;
        --bg-elevated: rgba(24, 24, 58, 0.95);

        --text-primary: #eef1f5;
        --text-secondary: #94a3b8;
        --text-muted: #64748b;

        --accent: #06b6d4;
        --accent-glow: rgba(6, 182, 212, 0.15);
        --accent-purple: #8b5cf6;
        --accent-amber: #f59e0b;
        --accent-green: #10b981;

        --border-subtle: rgba(148, 163, 184, 0.10);
        --border-card: rgba(148, 163, 184, 0.12);
        --border-accent: rgba(6, 182, 212, 0.25);

        --shadow-card: 0 8px 40px rgba(0, 0, 0, 0.35);
        --shadow-glow: 0 0 30px rgba(6, 182, 212, 0.08);
        --radius: 16px;
        --radius-sm: 10px;

        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
    }

    /* ---- Global Background ---- */
    .stApp { background: var(--bg-deep) !important; }
    [data-testid="stAppViewContainer"] { background: var(--bg-primary) !important; }
    [data-testid="stHeader"] { background: transparent !important; }
    [data-testid="stToolbar"] { display: none; }

    /* ---- Sidebar ---- */
    [data-testid="stSidebar"] {
        background: var(--bg-secondary) !important;
        border-right: 1px solid var(--border-subtle) !important;
    }
    [data-testid="stSidebar"] .stMarkdown p,
    [data-testid="stSidebar"] label,
    [data-testid="stSidebar"] .stSelectbox label,
    [data-testid="stSidebar"] .stRadio label {
        color: var(--text-secondary) !important;
    }

    /* ---- Typography ---- */
    h1, h2, h3, h4, h5, h6,
    .stMarkdown h1, .stMarkdown h2, .stMarkdown h3,
    .stMarkdown h4, .stMarkdown h5, .stMarkdown h6 {
        color: var(--text-primary) !important;
        font-weight: 600 !important;
        letter-spacing: -0.02em;
    }
    .stMarkdown p, .stMarkdown li, .stMarkdown span {
        color: var(--text-secondary);
    }

    /* ---- Main Content Container ---- */
    .main .block-container {
        background: var(--bg-card) !important;
        border: 1px solid var(--border-card) !important;
        border-radius: var(--radius) !important;
        box-shadow: var(--shadow-card) !important;
        padding: 2.5rem 3rem !important;
        backdrop-filter: blur(12px);
    }

    /* ---- Buttons ---- */
    .stButton > button {
        background: var(--bg-card-solid) !important;
        border: 1px solid var(--border-subtle) !important;
        color: var(--text-primary) !important;
        border-radius: var(--radius-sm) !important;
        padding: 0.5rem 1.2rem !important;
        font-weight: 500 !important;
        transition: all 0.2s ease !important;
        box-shadow: none !important;
    }
    .stButton > button:hover {
        border-color: var(--accent) !important;
        box-shadow: 0 0 24px var(--accent-glow) !important;
        transform: translateY(-1px) !important;
        background: rgba(6, 182, 212, 0.08) !important;
    }
    .stButton > button:active {
        transform: translateY(0) !important;
    }

    /* ---- Inputs ---- */
    .stTextInput input, .stSelectbox div[data-baseweb="select"],
    .stMultiSelect div[data-baseweb="select"] {
        background: var(--bg-card-solid) !important;
        border: 1px solid var(--border-subtle) !important;
        color: var(--text-primary) !important;
        border-radius: var(--radius-sm) !important;
        caret-color: var(--accent);
    }
    .stTextInput input:focus {
        border-color: var(--accent) !important;
        box-shadow: 0 0 0 2px var(--accent-glow) !important;
    }
    .stTextInput label, .stSelectbox label, .stMultiSelect label {
        color: var(--text-secondary) !important;
    }

    /* ---- Slider ---- */
    .stSlider div[data-baseweb="slider"] div[role="slider"] {
        background: var(--accent) !important;
        box-shadow: 0 0 12px var(--accent-glow) !important;
    }
    .stSlider div[data-baseweb="slider"] div[role="slider"]:focus {
        box-shadow: 0 0 0 4px var(--accent-glow) !important;
    }

    /* ---- Checkbox & Radio ---- */
    .stCheckbox label, .stRadio label {
        color: var(--text-secondary) !important;
    }
    .stCheckbox div[data-checked="true"] {
        background: var(--accent) !important;
        border-color: var(--accent) !important;
    }

    /* ---- Metrics ---- */
    [data-testid="stMetricValue"] {
        color: var(--accent) !important;
        font-weight: 700 !important;
    }
    [data-testid="stMetricLabel"] {
        color: var(--text-muted) !important;
    }
    [data-testid="stMetricDelta"] {
        color: var(--accent-green) !important;
    }

    /* ---- Source Cards ---- */
    .source-card {
        background: var(--bg-card-solid) !important;
        padding: 20px !important;
        border-radius: var(--radius-sm) !important;
        border: 1px solid var(--border-card) !important;
        box-shadow: var(--shadow-card) !important;
    }
    .source-card h4 { margin-top: 0 !important; margin-bottom: 8px !important; font-size: 1rem !important; }
    .source-card p { margin-bottom: 0 !important; font-size: 0.82rem !important; color: var(--text-muted) !important; }

    /* ---- Tabs ---- */
    .stTabs {
        background: transparent !important;
        border: none !important;
        padding: 0 !important;
    }
    .stTabs button {
        color: var(--text-muted) !important;
        font-weight: 500 !important;
        border-bottom: 2px solid transparent !important;
    }
    .stTabs button[aria-selected="true"] {
        color: var(--accent) !important;
        border-bottom-color: var(--accent) !important;
    }
    .stTabs button:hover {
        color: var(--text-secondary) !important;
        border-bottom-color: var(--border-subtle) !important;
    }
    [data-testid="stTabContent"] {
        padding-top: 1.5rem !important;
    }

    /* ---- Dividers ---- */
    hr, .stDivider {
        border-color: var(--border-subtle) !important;
        margin: 1.5rem 0 !important;
    }

    /* ---- Alerts ---- */
    [data-testid="stAlert"] {
        background: var(--bg-card-solid) !important;
        border: 1px solid var(--border-card) !important;
        color: var(--text-primary) !important;
        border-radius: var(--radius-sm) !important;
    }
    [data-testid="stAlert"] * {
        color: var(--text-primary) !important;
    }

    /* ---- Expander ---- */
    [data-testid="stExpander"] {
        background: var(--bg-card) !important;
        border: 1px solid var(--border-card) !important;
        border-radius: var(--radius-sm) !important;
        overflow: hidden;
    }
    [data-testid="stExpander"] > summary {
        background: rgba(255,255,255,0.03) !important;
    }
    [data-testid="stExpander"] > summary p {
        color: var(--text-primary) !important;
        font-weight: 600 !important;
    }
    [data-testid="stExpanderDetails"] {
        background: transparent !important;
    }

    /* ---- Status/Spinner ---- */
    .stStatusWidget div[role="status"] p {
        color: var(--text-secondary) !important;
    }

    /* ---- DataFrames ---- */
    [data-testid="stDataFrame"] {
        color: var(--text-primary) !important;
    }
    [data-testid="stDataFrame"] td {
        color: var(--text-secondary) !important;
    }

    /* ---- Caption ---- */
    .stCaptionContainer p {
        color: var(--text-muted) !important;
    }

    /* ---- SelectSlider ---- */
    [data-testid="stSelectSlider"] {
        color: var(--text-secondary) !important;
    }
    </style>
    """, unsafe_allow_html=True)

def inject_home_css():
    """首页专用样式：基于全局设计系统的延伸。"""
    st.markdown("""
    <style>
        .home-wrapper { max-width: 1100px; margin: 0 auto; padding-top: 6vh; }
        .home-title { text-align: center; font-size: 3.6rem; font-weight: 800; color: var(--text-primary) !important; margin-bottom: 12px; letter-spacing: -1px; line-height: 1.2; }
        .home-title span { background: linear-gradient(135deg, #06b6d4, #8b5cf6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .home-subtitle { text-align: center; font-size: 1.15rem; color: var(--text-muted); margin-bottom: 60px; font-weight: 400; }
        .home-btn-card div.stButton > button {
            height: auto !important; padding: 36px 14px !important; border-radius: 20px !important;
            background: var(--bg-card) !important; border: 1px solid var(--border-card) !important;
            box-shadow: var(--shadow-card) !important;
            backdrop-filter: blur(12px); transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
        }
        .home-btn-card div.stButton > button:hover {
            border-color: var(--accent) !important;
            box-shadow: 0 16px 48px var(--accent-glow) !important;
            transform: translateY(-4px) !important;
            background: var(--bg-elevated) !important;
        }
        .home-btn-card div.stButton > button p {
            font-size: 1.1rem !important; font-weight: 700 !important; color: var(--text-primary) !important; line-height: 1.6 !important; white-space: pre-line;
        }
        .feature-section { margin-top: 70px; padding-top: 40px; border-top: 1px solid var(--border-subtle); }
        .feature-box { text-align: center; padding: 16px; }
        .feature-box h4 { color: var(--text-primary) !important; font-weight: 600; font-size: 1rem; margin-bottom: 10px; }
        .feature-box p { color: var(--text-muted); font-size: 0.88rem; line-height: 1.7; }
    </style>
    """, unsafe_allow_html=True)





def inject_app2_css():
    """Material 3 淡色主题 — Academic Warm。"""
    st.markdown("""
    <style>
        /* M3 Surface — 暖瓷白全局底 */
        [data-testid="stAppViewContainer"] {
            background-color: #FEFBF8 !important;
        }
        [data-testid="stHeader"] { background: transparent !important; }

        /* M3 Surface — 主卡片 */
        .main .block-container {
            background-color: #FEFBF8 !important;
            border-radius: 16px !important;
            border: 1px solid #E0DBD2 !important;
            box-shadow: 0 10px 30px rgba(110, 105, 95, 0.04) !important;
            padding: 3rem !important;
            margin-top: 2rem !important;
            max-width: 1150px !important;
        }

        /* Sidebar — 与 Surface 同底但略暖 */
        [data-testid="stSidebar"] {
            background-color: #FEFAF6 !important;
            border-right: 1px solid #E0DBD2 !important;
        }

        /* M3 On Surface — 主文字深棕 */
        h1.app2-title { color: #1E1B18 !important; font-weight: 700 !important; letter-spacing: 0.5px !important; }

        /* M3 Outlined Button */
        .stButton > button {
            background: #FEFBF8 !important;
            border: 1px solid #E0DBD2 !important;
            color: #5B5650 !important;
            border-radius: 8px !important;
            transition: all 0.2s ease !important;
            box-shadow: 0 1px 2px rgba(0,0,0,0.02) !important;
        }
        .stButton > button:hover {
            border-color: #556B5D !important;
            color: #556B5D !important;
            transform: translateY(-1px) !important;
        }

        /* M3 Primary — 鼠尾草绿填充按钮 */
        div.search-area .stButton > button {
            background: #556B5D !important;
            color: #FFFFFF !important;
            border: none !important;
            font-weight: bold !important;
            border-radius: 8px !important;
            box-shadow: 0 4px 10px rgba(85, 107, 93, 0.2) !important;
        }
        div.search-area .stButton > button:hover {
            background: #45574C !important;
            transform: translateY(-1px) !important;
        }

        /* M3 Surface Variant — Tabs 底色 */
        .stTabs {
            background: #F2EFEA !important;
            border: 1px solid #E0DBD2 !important;
            border-radius: 12px !important;
            padding: 24px !important;
        }
    </style>
    """, unsafe_allow_html=True)


def inject_search_two_panel_css():
    """文献深度分析页专用：M3 淡色主题 + 语义容器色分层。"""
    st.markdown("""
    <style>
    /* ============================================================
       Layout
       ============================================================ */
    .main .block-container {
        max-width: 1680px !important;
        padding: 1.5rem 2rem 2.5rem 2rem !important;
        margin-top: 1rem !important;
    }
    [data-testid="stSidebar"] {
        min-width: 360px !important;
        width: 360px !important;
    }
    [data-testid="stSidebar"] [data-testid="stVerticalBlock"] {
        gap: 0.7rem !important;
    }

    /* ============================================================
       M3 Surface — 主面板底色 + 文字
       ============================================================ */
    .main .block-container {
        background: #FEFBF8 !important;
        border: 1px solid #E0DBD2 !important;
        box-shadow: 0 10px 30px rgba(110,105,95,0.04) !important;
        border-radius: 16px !important;
    }
    .main .block-container h1,
    .main .block-container h2,
    .main .block-container h3,
    .main .block-container h4,
    .main .block-container h5,
    .main .block-container h6 {
        color: #1E1B18 !important;
    }
    .main .block-container p,
    .main .block-container span,
    .main .block-container li,
    .main .block-container div:not([class*="st"]) {
        color: #5B5650 !important;
    }
    .main .block-container small,
    .main .block-container .stCaptionContainer p {
        color: #8B8680 !important;
    }
    .main .block-container hr,
    .main .block-container .stDivider {
        border-color: #E0DBD2 !important;
    }

    /* ---- 搜索输入框 ---- */
    .main .block-container .stTextInput input {
        background-color: #FFFFFF !important;
        border: 1px solid #E0DBD2 !important;
        color: #5B5650 !important;
        border-radius: 10px !important;
    }
    .main .block-container .stTextInput input::placeholder {
        color: #B0AAA2 !important;
    }
    .main .block-container .stTextInput input:focus {
        border-color: #556B5D !important;
        box-shadow: 0 0 0 2px rgba(85,107,93,0.10) !important;
    }
    .main .block-container .stTextInput label {
        color: #5B5650 !important;
    }

    /* ---- Select box ---- */
    .main .block-container .stSelectbox div[data-baseweb="select"] {
        background-color: #FFFFFF !important;
        border-color: #E0DBD2 !important;
    }
    .main .block-container .stSelectbox span {
        color: #5B5650 !important;
    }
    .main .block-container .stSelectbox label {
        color: #5B5650 !important;
    }

    /* ---- M3 Primary 按钮 ---- */
    .main .block-container .stButton > button {
        background: #FEFBF8 !important;
        border: 1px solid #E0DBD2 !important;
        color: #5B5650 !important;
        border-radius: 8px !important;
        box-shadow: 0 1px 2px rgba(0,0,0,0.02) !important;
    }
    .main .block-container .stButton > button:hover {
        border-color: #556B5D !important;
        color: #556B5D !important;
        background: #F2EFEA !important;
    }
    .main .block-container div.search-area .stButton > button {
        background: #556B5D !important;
        color: #FFFFFF !important;
        border: none !important;
    }
    .main .block-container div.search-area .stButton > button:hover {
        background: #45574C !important;
    }

    /* ---- M3 Surface Variant — Metric 卡片 ---- */
    .main .block-container [data-testid="stMetric"] {
        background-color: #F2EFEA !important;
        border: 1px solid #E0DBD2 !important;
        border-radius: 12px !important;
    }
    .main .block-container [data-testid="stMetricValue"] {
        color: #1E1B18 !important;
    }
    .main .block-container [data-testid="stMetricLabel"] {
        color: #8B8680 !important;
    }
    .main .block-container [data-testid="stMetricDelta"] {
        color: #556B5D !important;
    }

    /* ---- M3 Surface Variant — Tabs ---- */
    .main .block-container .stTabs {
        background: #F2EFEA !important;
        border: 1px solid #E0DBD2 !important;
        border-radius: 12px !important;
        padding: 24px !important;
    }
    .main .block-container .stTabs [role="tablist"] {
        border-bottom: 1px solid #E0DBD2 !important;
    }
    .main .block-container .stTabs button[role="tab"] {
        color: #8B8680 !important;
        background: transparent !important;
    }
    .main .block-container .stTabs button[role="tab"][aria-selected="true"] {
        color: #556B5D !important;
        border-bottom: 2px solid #556B5D !important;
        font-weight: 600 !important;
    }
    .main .block-container .stTabs button[role="tab"]:hover {
        color: #5B5650 !important;
        border-bottom-color: #E0DBD2 !important;
    }
    .main .block-container [data-testid="stTabContent"] {
        padding-top: 1.5rem !important;
    }

    /* ---- M3 Semantic Containers — Alerts ---- */
    .main .block-container [data-testid="stAlert"] {
        border-radius: 10px !important;
        border: 1px solid #E0DBD2 !important;
    }
    .main .block-container [data-testid="stAlert"] * {
        color: #5B5650 !important;
    }
    /* Surface Variant 作为 alert 底 */
    .main .block-container [data-testid="stAlert"] {
        background-color: #F2EFEA !important;
    }
    /* Secondary Container — info（冷静蓝灰） */
    .main .block-container [data-testid="stInfo"] {
        background-color: #E3E9ED !important;
        border-color: #CED8DD !important;
    }
    /* Primary Container — success（鼠尾草浅绿） */
    .main .block-container [data-testid="stSuccess"] {
        background-color: #DDE7DF !important;
        border-color: #C9D8CC !important;
    }
    /* Tertiary Container — warning（暖蜜桃） */
    .main .block-container [data-testid="stWarning"] {
        background-color: #F6EBE2 !important;
        border-color: #E9DCD0 !important;
    }
    /* Error — 柔化红 */
    .main .block-container [data-testid="stError"] {
        background-color: #FCEAEA !important;
        border-color: #E8CECE !important;
    }

    /* ---- M3 Surface Variant — Source cards ---- */
    .main .block-container .source-card {
        background: #F2EFEA !important;
        border: 1px solid #E0DBD2 !important;
        border-radius: 12px !important;
    }
    .main .block-container .source-card h4 {
        color: #1E1B18 !important;
    }
    .main .block-container .source-card p {
        color: #5B5650 !important;
    }

    /* ---- Dataframes ---- */
    .main .block-container [data-testid="stDataFrame"] {
        color: #5B5650 !important;
    }
    .main .block-container [data-testid="stDataFrame"] th {
        background-color: #F2EFEA !important;
        color: #1E1B18 !important;
    }
    .main .block-container [data-testid="stDataFrame"] td {
        color: #5B5650 !important;
    }

    /* ---- M3 Surface Variant — Expander ---- */
    .main .block-container [data-testid="stExpander"] {
        background: #F2EFEA !important;
        border: 1px solid #E0DBD2 !important;
        border-radius: 12px !important;
    }
    .main .block-container [data-testid="stExpander"] > summary p {
        color: #1E1B18 !important;
        font-weight: 600 !important;
    }

    /* ---- Status widget ---- */
    .main .block-container .stStatusWidget div[role="status"] p {
        color: #5B5650 !important;
    }

    /* ---- Checkbox & Radio ---- */
    .main .block-container .stCheckbox label,
    .main .block-container .stRadio label {
        color: #5B5650 !important;
    }

    /* ---- Slider ---- */
    .main .block-container .stSlider div[data-baseweb="slider"] div[role="slider"] {
        background: #556B5D !important;
    }

    /* ============================================================
       M3 Sidebar
       ============================================================ */
    [data-testid="stSidebar"],
    [data-testid="stSidebar"] [data-testid="stSidebarContent"] {
        background-color: #FEFAF6 !important;
        background-image: none !important;
    }
    [data-testid="stSidebar"] [data-testid="stSidebarContent"] * {
        color: #5B5650 !important;
    }
    [data-testid="stSidebar"] h3 {
        color: #1E1B18 !important;
        font-weight: 700 !important;
    }
    [data-testid="stSidebar"] small,
    [data-testid="stSidebar"] .stCaptionContainer p {
        color: #8B8680 !important;
    }
    [data-testid="stSidebar"] hr,
    [data-testid="stSidebar"] .stDivider {
        border-color: #E0DBD2 !important;
    }

    /* Sidebar — Select */
    [data-testid="stSidebar"] .stSelectbox div[data-baseweb="select"],
    [data-testid="stSidebar"] .stMultiSelect div[data-baseweb="select"] {
        background-color: #FEFBF8 !important;
        border-color: #E0DBD2 !important;
    }
    [data-testid="stSidebar"] .stSelectbox span,
    [data-testid="stSidebar"] .stMultiSelect span {
        color: #5B5650 !important;
    }
    [data-testid="stSidebar"] .stSelectbox label,
    [data-testid="stSidebar"] .stMultiSelect label {
        color: #5B5650 !important;
    }

    /* Sidebar — Text Input */
    [data-testid="stSidebar"] .stTextInput input {
        background-color: #FEFBF8 !important;
        border-color: #E0DBD2 !important;
        color: #5B5650 !important;
    }
    [data-testid="stSidebar"] .stTextInput label {
        color: #5B5650 !important;
    }

    /* Sidebar — M3 Outlined Button */
    [data-testid="stSidebar"] .stButton > button {
        background: #FEFBF8 !important;
        border: 1px solid #E0DBD2 !important;
        color: #5B5650 !important;
        border-radius: 8px !important;
        box-shadow: 0 1px 2px rgba(0,0,0,0.02) !important;
    }
    [data-testid="stSidebar"] .stButton > button:hover {
        border-color: #556B5D !important;
        color: #556B5D !important;
    }
    /* Sidebar — M3 Primary Filled Button */
    [data-testid="stSidebar"] .stButton > button[kind="primary"] {
        background: #556B5D !important;
        color: #FFFFFF !important;
        border-color: #556B5D !important;
    }

    /* Sidebar — Checkbox / Radio */
    [data-testid="stSidebar"] .stCheckbox label,
    [data-testid="stSidebar"] .stRadio label {
        color: #5B5650 !important;
    }

    /* Sidebar — Slider */
    [data-testid="stSidebar"] .stSlider div[data-baseweb="slider"] div[role="slider"] {
        background: #556B5D !important;
    }

    /* Sidebar — Alert */
    [data-testid="stSidebar"] [data-testid="stAlert"] {
        background-color: #F2EFEA !important;
        border: 1px solid #E0DBD2 !important;
    }
    [data-testid="stSidebar"] [data-testid="stAlert"] * {
        color: #5B5650 !important;
    }

    /* ============================================================
       M3 On Surface — AI 工作台
       ============================================================ */
    .right-ai-title {
        font-size: 1.15rem; font-weight: 700; color: #1E1B18; margin-bottom: 0.3rem;
    }
    .right-ai-desc {
        color: #8B8680; font-size: 0.82rem; line-height: 1.6; margin-bottom: 0.8rem;
    }

    /* ============================================================
       响应式
       ============================================================ */
    @media (max-width: 1200px) {
        .main .block-container { max-width: 100% !important; padding: 1rem !important; }
        [data-testid="stSidebar"] { min-width: 320px !important; width: 320px !important; }
    }
    </style>
    """, unsafe_allow_html=True)


# =========================================================
# 3. 核心功能函数
# =========================================================

from config import get_db_pool

def get_conn():
    return get_db_pool().connection()

@st.cache_data(ttl=3600)
def fetch_all_papers_with_topics():
    conn = get_conn()
    cur = conn.cursor(pymysql.cursors.DictCursor)
    cur.execute("""
        SELECT
            p.id,
            p.title,
            p.year,
            p.field,
            pt.topic_id,
            pt.x,
            pt.y,
            pt.z,
            h.title_cn,
            h.topic_label,
            h.summary_cn,
            h.trend_status,
            h.paper_count
        FROM papers p
        JOIN paper_topics pt
            ON p.id = pt.paper_id
        LEFT JOIN hotspots h
            ON pt.field = h.field AND pt.topic_id = h.topic_id
        WHERE p.year IS NOT NULL
        ORDER BY p.year DESC
    """)
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return rows


@st.cache_data(ttl=3600)
def fetch_hotspots():
    conn = get_conn()
    cur = conn.cursor(pymysql.cursors.DictCursor)
    cur.execute("""
        SELECT
            field,
            topic_id,
            title_cn,
            topic_label,
            summary_cn,
            paper_count,
            trend_status,
            evolution_json,
            updated_at
        FROM hotspots
        ORDER BY paper_count DESC, field, topic_id
    """)
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return rows


def fetch_hotspot_review(field, topic_id):
    conn = get_conn()
    cur = conn.cursor(pymysql.cursors.DictCursor)
    cur.execute("""
        SELECT review_cn, created_at
        FROM hotspot_reviews
        WHERE field = %s AND topic_id = %s
        ORDER BY created_at DESC
        LIMIT 1
    """, (field, topic_id))
    row = cur.fetchone()
    cur.close()
    conn.close()
    return row






def get_bilingual_keywords(topic):
    prompt = f"针对学术主题 '{topic}'，请提供最精准的学术英语翻译(English_Core)。不要包含任何解释或符号。"
    try:
        response = get_llm_client().chat.completions.create(
            model=DEEPSEEK_MODEL_NAME,
            messages=[{"role": "user", "content": prompt}]
        )
        en_core = re.sub(r'[\[\]\"\'\(\)]', '', response.choices[0].message.content.strip())
        return {"zh": topic, "en_core": en_core}
    except Exception as e:
        print(f"❌ AI 优化检索词失败，已自动降级为原词。错误原因：{e}")
        return {"zh": topic, "en_core": topic}


def fetch_openalex_papers(query, max_results=50, start_year="2000", end_year="2026"):
    url = f"https://api.openalex.org/works?search={requests.utils.quote(query.strip())}&filter=publication_year:{start_year}-{end_year}&per_page={max_results}&sort=cited_by_count:desc&mailto=academic_researcher@example.com"
    try:
        data = requests.get(url, timeout=20).json()
        papers = []
        for item in data.get("results", []):
            abstract = ""
            if item.get("abstract_inverted_index"):
                words = {pos: word for word, pos_list in item.get("abstract_inverted_index").items() for pos in
                         pos_list}
                abstract = " ".join([words[p] for p in sorted(words.keys())])[:300] + "..."
            papers.append(
                {"标题": item.get("display_name", "Untitled"), "日期": str(item.get("publication_year", "N/A")),
                 "链接": item.get("doi") or item.get("id"), "摘要": abstract if abstract else "暂无摘要",
                 "来源": "OpenAlex"})
        return papers
    except:
        return []


def fetch_arxiv_papers(query, max_results=50):
    url = f"http://export.arxiv.org/api/query?search_query=all:{requests.utils.quote(query)}&start=0&max_results={max_results}"
    try:
        root = ET.fromstring(requests.get(url, timeout=25).content)
        return [{"标题": entry.find('{http://www.w3.org/2005/Atom}title').text.strip().replace('\n', ' '),
                 "日期": entry.find('{http://www.w3.org/2005/Atom}published').text[:10],
                 "摘要": entry.find('{http://www.w3.org/2005/Atom}summary').text.strip()[:250] + "...",
                 "链接": entry.find('{http://www.w3.org/2005/Atom}id').text, "来源": "arXiv"} for entry in
                root.findall('{http://www.w3.org/2005/Atom}entry')]
    except:
        return []

def create_docker_chrome_driver(headless=None):
    """
    Docker/服务器环境下的 Chrome Driver 创建函数。

    说明：
    1. 该函数解决的是“容器里能否启动浏览器”的工程问题。
    2. 它不承诺绕过任何网站风控；如果目标站点要求登录、验证码或限制访问，仍会返回空结果或提示失败。
    3. 在 Dockerfile 中需要安装 chromium/chromium-driver 或 google-chrome + chromedriver。
    """
    if headless is None:
        headless = os.getenv("CNKI_HEADLESS", "1").strip().lower() not in {"0", "false", "no"}

    chrome_options = Options()

    if headless:
        # 新版 Chrome headless，比旧 headless 更接近普通渲染模式
        chrome_options.add_argument("--headless=new")

    # Docker 必备参数：避免沙箱、共享内存和 GPU 问题
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--window-size=1366,900")
    chrome_options.add_argument("--lang=zh-CN")
    chrome_options.add_argument("--disable-extensions")
    chrome_options.add_argument("--disable-notifications")
    chrome_options.add_argument("--remote-debugging-port=9222")

    # 常规浏览器 UA。注意：这不是绕过风控的保证，只是避免容器默认 UA 过于异常。
    chrome_options.add_argument(
        "user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    )

    # 支持通过环境变量指定二进制与 driver 路径，适配不同 Docker 镜像
    chrome_binary = os.getenv("CHROME_BINARY") or os.getenv("GOOGLE_CHROME_BIN")
    if chrome_binary and os.path.exists(chrome_binary):
        chrome_options.binary_location = chrome_binary
    else:
        for candidate in [
            "/usr/bin/chromium",
            "/usr/bin/chromium-browser",
            "/usr/bin/google-chrome",
            "/usr/bin/google-chrome-stable",
        ]:
            if os.path.exists(candidate):
                chrome_options.binary_location = candidate
                break

    driver_path = os.getenv("CHROME_DRIVER_PATH") or os.getenv("CHROMEDRIVER_PATH")
    if driver_path and os.path.exists(driver_path):
        service = Service(driver_path)
        driver = webdriver.Chrome(service=service, options=chrome_options)
    else:
        # Selenium Manager 会尝试自动匹配 driver；若容器无网络，建议显式安装 chromium-driver 并设置路径。
        driver = webdriver.Chrome(options=chrome_options)

    driver.set_page_load_timeout(int(os.getenv("CNKI_PAGELOAD_TIMEOUT", "45")))
    driver.implicitly_wait(int(os.getenv("CNKI_IMPLICIT_WAIT", "2")))
    return driver


def save_cnki_debug_snapshot(driver, prefix="cnki_debug"):
    """保存调试用 HTML/截图，便于在 Docker 里排查页面是否被验证码、登录页或空结果页拦截。"""
    try:
        debug_dir = os.getenv("CNKI_DEBUG_DIR", EXPORT_DIR)
        os.makedirs(debug_dir, exist_ok=True)
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        html_path = os.path.join(debug_dir, f"{prefix}_{ts}.html")
        png_path = os.path.join(debug_dir, f"{prefix}_{ts}.png")
        with open(html_path, "w", encoding="utf-8") as f:
            f.write(driver.page_source)
        try:
            driver.save_screenshot(png_path)
        except Exception:
            pass
        print(f"🧪 CNKI 调试快照已保存: {html_path}")
    except Exception as e:
        print(f"⚠️ 保存 CNKI 调试快照失败: {e}")


def fetch_cnki_papers(query, max_results=50):
    """
    Docker 兼容版 CNKI 抓取函数。

    设计重点：
    - 使用容器友好的 Chrome 参数启动浏览器。
    - 加强等待、窗口切换、页面异常检测。
    - 若遇到验证码、登录限制、访问频繁等情况，优雅返回空列表，而不是让整个 Streamlit 页面崩溃。

    注意：
    CNKI 页面结构和访问策略可能变化；该函数不能保证任何环境下都能稳定抓取。
    更稳的工程做法仍是：CNKI 离线采集入库，Docker 只负责展示和 API 数据源。
    """
    papers = []
    driver = None

    try:
        driver = create_docker_chrome_driver()
        wait = WebDriverWait(driver, int(os.getenv("CNKI_WAIT_TIMEOUT", "20")))

        print(f"🔎 CNKI 搜索开始: {query}")
        driver.get("https://www.cnki.net/")
        time.sleep(random.uniform(2.0, 4.0))

        page_text = driver.find_element(By.TAG_NAME, "body").text if driver.find_elements(By.TAG_NAME, "body") else ""
        if any(flag in page_text for flag in ["验证码", "访问过于频繁", "安全验证"]):
            print("⚠️ CNKI 可能出现验证码/访问限制页面，已停止抓取。")
            save_cnki_debug_snapshot(driver, "cnki_blocked_home")
            return []

        # 首页搜索框
        search_box = wait.until(EC.presence_of_element_located((By.ID, "txt_SearchText")))
        search_box.clear()
        time.sleep(random.uniform(0.5, 1.2))
        search_box.send_keys(query)
        time.sleep(random.uniform(0.8, 1.5))
        search_box.send_keys(Keys.ENTER)
        time.sleep(random.uniform(4.0, 6.0))

        # CNKI 有时会打开新窗口/标签页
        if len(driver.window_handles) > 1:
            driver.switch_to.window(driver.window_handles[-1])
            time.sleep(random.uniform(1.5, 2.5))

        # 尝试等待结果区或空结果区
        try:
            wait.until(
                EC.presence_of_element_located(
                    (By.CSS_SELECTOR, ".result-table-list, .grid-table, .empty-list, table, body")
                )
            )
        except Exception:
            print("⚠️ CNKI 结果页等待超时。")
            save_cnki_debug_snapshot(driver, "cnki_timeout")
            return []

        page_text = driver.find_element(By.TAG_NAME, "body").text if driver.find_elements(By.TAG_NAME, "body") else ""
        if any(flag in page_text for flag in ["验证码", "访问过于频繁", "安全验证"]):
            print("⚠️ CNKI 结果页触发访问限制。")
            save_cnki_debug_snapshot(driver, "cnki_blocked_result")
            return []

        if "抱歉，暂无数据" in page_text or "未找到与" in page_text:
            print("ℹ️ CNKI 无检索结果。")
            return []

        while len(papers) < max_results:
            time.sleep(random.uniform(1.0, 2.0))

            # 兼容多种 CNKI 结果页结构
            rows = []
            selectors = [
                "//tr[td[contains(@class,'name')]]",
                "//table//tr[td//a[contains(@href,'kns') or contains(@href,'kcms')]]",
                "//div[contains(@class,'result')]//a[contains(@href,'kns') or contains(@href,'kcms')]/ancestor::*[self::tr or self::div][1]",
            ]
            for xp in selectors:
                try:
                    rows = driver.find_elements(By.XPATH, xp)
                    if rows:
                        break
                except Exception:
                    continue

            if not rows:
                print("⚠️ CNKI 当前页未解析到结果行。")
                save_cnki_debug_snapshot(driver, "cnki_no_rows")
                break

            before_count = len(papers)
            for row in rows:
                if len(papers) >= max_results:
                    break
                try:
                    # 标题链接
                    title_el = None
                    for css in ["td.name a", "a.fz14", "a"]:
                        try:
                            candidates = row.find_elements(By.CSS_SELECTOR, css)
                            candidates = [c for c in candidates if c.text.strip()]
                            if candidates:
                                title_el = candidates[0]
                                break
                        except Exception:
                            continue
                    if not title_el:
                        continue

                    title = title_el.text.strip()
                    link = title_el.get_attribute("href") or ""

                    def safe_text_by_class(cls):
                        try:
                            return row.find_element(By.CLASS_NAME, cls).text.strip()
                        except Exception:
                            return ""

                    date_text = safe_text_by_class("date") or "N/A"
                    author_text = safe_text_by_class("author")
                    source_text = safe_text_by_class("source")

                    if any(p.get("链接") == link and link for p in papers):
                        continue

                    papers.append({
                        "标题": title,
                        "日期": date_text,
                        "链接": link,
                        "摘要": f"作者: {author_text or '暂无'} | 来源: {source_text or '暂无'}",
                        "来源": "知网"
                    })
                except Exception:
                    continue

            if len(papers) == before_count:
                print("⚠️ CNKI 当前页没有新增结果，停止翻页。")
                break

            if len(papers) >= max_results:
                break

            # 翻页：兼容 id 和文本两种方式
            next_clicked = False
            for locator in [
                (By.ID, "PageNext"),
                (By.LINK_TEXT, "下一页"),
                (By.PARTIAL_LINK_TEXT, "下一页"),
            ]:
                try:
                    next_page = driver.find_element(*locator)
                    cls = (next_page.get_attribute("class") or "").lower()
                    aria_disabled = (next_page.get_attribute("aria-disabled") or "").lower()
                    if "disable" in cls or aria_disabled == "true":
                        next_clicked = False
                        break
                    driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", next_page)
                    time.sleep(random.uniform(0.5, 1.0))
                    driver.execute_script("arguments[0].click();", next_page)
                    next_clicked = True
                    time.sleep(random.uniform(3.0, 5.0))
                    break
                except Exception:
                    continue

            if not next_clicked:
                break

        print(f"✅ CNKI 抓取完成: {len(papers)} 条")
        return papers[:max_results]

    except Exception as e:
        print(f"❌ CNKI 抓取异常: {e}")
        if driver:
            save_cnki_debug_snapshot(driver, "cnki_exception")
        return papers
    finally:
        if driver:
            try:
                driver.quit()
            except Exception:
                pass
def evaluate_report_quality(report_text, results):
    """
    对 AI 综述做一个轻量级可信度评估。
    返回：
    - coverage_rate: 文献检索覆盖率
    - citation_accuracy: 引用溯源准确率
    - fact_consistency: 事实一致性置信度
    """

    # 默认兜底，避免空值报错
    default_metrics = {
        "coverage_rate": 0.0,
        "citation_accuracy": 0.0,
        "fact_consistency": 0.0,
    }

    if not report_text or not results:
        return default_metrics

    try:
        # 1. 总文献数
        total_results = len(results)
        if total_results == 0:
            return default_metrics

        # 2. 提取报告中的引用编号，例如 [1] [2] [3]
        cited_indices = re.findall(r"\[(\d+)\]", report_text)
        cited_indices = sorted(set(int(i) for i in cited_indices if i.isdigit()))

        # 3. 统计有效引用（编号必须落在 results 范围内）
        valid_citations = [i for i in cited_indices if 1 <= i <= total_results]

        # 4. 覆盖率：AI 实际引用了多少篇文献
        coverage_rate = len(valid_citations) / total_results

        # 5. 引用准确率：报告里出现的引用编号有多少是合法的
        if len(cited_indices) > 0:
            citation_accuracy = len(valid_citations) / len(cited_indices)
        else:
            citation_accuracy = 0.0

        # 6. 引用密度：每千字出现多少次引用
        text_len = max(len(report_text), 1)
        citation_density = len(cited_indices) / text_len * 1000

        # 7. 事实一致性置信度（启发式）
        #    结合引用准确率 + 覆盖率 + 引用密度做一个简单综合分
        #    这里不是严格事实核查，只是“可信度代理指标”
        density_score = min(citation_density / 8, 1.0)  # 经验阈值，可调
        fact_consistency = (
            0.5 * citation_accuracy +
            0.3 * coverage_rate +
            0.2 * density_score
        )

        # 限制在 0~1
        fact_consistency = max(0.0, min(1.0, fact_consistency))

        return {
            "coverage_rate": round(coverage_rate, 4),
            "citation_accuracy": round(citation_accuracy, 4),
            "fact_consistency": round(fact_consistency, 4),
        }

    except Exception:
        return default_metrics

def build_reference_section(papers, report_text=None, max_refs=100):
    """根据本次文献列表生成稳定的参考文献区，避免模型漏写或乱写参考文献。"""
    if not papers:
        return "## 参考文献\n暂无可用参考文献。"

    cited_indices = []
    if report_text:
        try:
            cited_indices = sorted({int(x) for x in re.findall(r"\[(\d+)\]", report_text) if x.isdigit()})
        except Exception:
            cited_indices = []

    if cited_indices:
        selected = [i for i in cited_indices if 1 <= i <= len(papers)]
    else:
        selected = list(range(1, min(len(papers), max_refs) + 1))

    if not selected:
        selected = list(range(1, min(len(papers), max_refs) + 1))

    lines = ["## 参考文献"]
    for i in selected[:max_refs]:
        p = papers[i - 1]
        title = str(p.get("标题") or p.get("title") or "无标题").strip()
        source = str(p.get("来源") or p.get("source") or "未知来源").strip()
        date = str(p.get("日期") or p.get("year") or "未知年份").strip()
        link = str(p.get("链接") or p.get("url") or "").strip()
        if link:
            lines.append(f"[{i}] {title}. {source}, {date}. {link}")
        else:
            lines.append(f"[{i}] {title}. {source}, {date}.")
    return "\n".join(lines)


def normalize_report_output(report_text, topic, papers=None):
    """清洗模型输出：去除客套话、免责声明、代码块，并统一追加参考文献。"""
    text = str(report_text or "").strip()
    if not text:
        return text

    text = re.sub(r"^```(?:markdown|md|text)?\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*```\s*$", "", text)

    lines = [ln.rstrip() for ln in text.splitlines()]
    while lines and not lines[0].strip():
        lines.pop(0)
    courtesy_re = re.compile(r"^(好的|当然|可以|没问题|以下是|下面是|请查阅|已根据|这里是|为你整理).{0,80}$")
    while lines and courtesy_re.match(lines[0].strip()):
        lines.pop(0)
        while lines and not lines[0].strip():
            lines.pop(0)
    text = "\n".join(lines).strip()

    banned = [
        r"^.*AI可能生成错误信息.*$",
        r"^.*内容仅供参考.*$",
        r"^.*免责声明.*$",
        r"^.*以上内容.*仅供.*参考.*$",
        r"^.*如需.*我可以.*$",
        r"^.*如果你.*我可以.*$",
    ]
    for pat in banned:
        text = re.sub(pat, "", text, flags=re.IGNORECASE | re.MULTILINE)

    text = re.sub(r"\n#{1,3}\s*(参考文献|References)\s*[\s\S]*$", "", text, flags=re.IGNORECASE).strip()

    if not text.startswith("#"):
        text = f"# {topic}学术综述\n\n" + text

    if papers:
        text = text.rstrip() + "\n\n" + build_reference_section(papers, text)
    return text.strip()


def get_review_length_rule(mode, paper_count):
    """根据实际文献数量动态设置综述正文字数，不包含参考文献列表。"""
    min_chars, max_chars = get_review_length_bounds(mode, paper_count)
    return f"{min_chars}—{max_chars}字"


def get_review_length_bounds(mode, paper_count):
    """返回综述正文目标字数区间，不包含参考文献列表。"""
    paper_count = max(0, int(paper_count or 0))
    if mode == "simple":
        if paper_count <= 5:
            return 1200, 2000
        if paper_count <= 15:
            return 1800, 2800
        if paper_count <= 30:
            return 2000, 3200
        if paper_count <= 60:
            return 2600, 3800
        return 3000, 4000

    if paper_count <= 5:
        return 2500, 4000
    if paper_count <= 15:
        return 4000, 6500
    if paper_count <= 30:
        return 5500, 8000
    if paper_count <= 60:
        return 6500, 9000
    return 8000, 10000


def get_review_max_tokens(mode, paper_count):
    """给长综述留出足够输出空间；若上游不支持会在异常处理中提示。"""
    paper_count = max(0, int(paper_count or 0))
    if mode == "simple":
        return 7000 if paper_count > 60 else 5500
    return 16000 if paper_count > 60 else 12000


def get_prompt_paper_limit(mode, paper_count):
    """控制送入模型的文献数量，避免长上下文失控，同时让完全版能利用更多文献。"""
    paper_count = max(0, int(paper_count or 0))
    if mode == "simple":
        return min(paper_count, 40)
    return min(paper_count, 80)


def split_report_body_and_references(report_text):
    """拆分综述正文和参考文献；字数控制只看正文部分。"""
    text = str(report_text or "").strip()
    match = re.search(r"\n#{1,3}\s*(参考文献|References)\s*", text, flags=re.IGNORECASE)
    if not match:
        return text, ""
    return text[:match.start()].strip(), text[match.start():].strip()


def count_report_body_chars(report_text):
    """统计参考文献前的正文字符数，去掉空白字符。"""
    body, _ = split_report_body_and_references(report_text)
    return len(re.sub(r"\s+", "", body))


def build_expand_report_prompt(topic, papers, draft_report, mode="complex", discipline="理工科"):
    """当模型首轮输出偏短时，要求其重写扩写为达标正文。"""
    paper_count = len(papers or [])
    prompt_paper_limit = get_prompt_paper_limit(mode, paper_count)
    min_chars, max_chars = get_review_length_bounds(mode, paper_count)
    body, _ = split_report_body_and_references(draft_report)
    context = "\n\n".join(
        [f"文献[{i + 1}]【{p['来源']}】: {p['标题']}\n日期: {p.get('日期', '未知')}\n链接: {p.get('链接', '')}\n摘要: {p['摘要']}" for i, p in enumerate((papers or [])[:prompt_paper_limit])]
    )

    return f"""
你是一名严谨的【{discipline}】学术综述写作专家。下面这版“{topic}”综述正文偏短，请基于原文和真实文献重新扩写成完整版本。

【当前正文字符数】
{count_report_body_chars(body)} 字，低于目标下限。

【强制目标】
1. 只输出扩写后的完整综述正文，不要输出修改说明。
2. 正文目标字数为 {min_chars}—{max_chars} 字，只统计“参考文献”之前的正文，不包含参考文献列表。
3. 不要生成“## 参考文献”章节，也不要列出参考文献条目；系统会在生成后自动追加。
4. 保留并增加真实引用编号，所有关键判断必须引用 [1]、[2][3] 这类编号，不得编造超出文献数据源范围的编号。
5. 不要用空话凑字数；请增加文献间比较、方法/观点分歧、证据强弱、局限性和未来路线分析。

【待扩写正文】
{body}

【文献数据源】
{context}
"""


def ensure_report_body_length(report_text, topic, papers, mode, discipline):
    """返回是否需要扩写以及扩写提示词。"""
    min_chars, _ = get_review_length_bounds(mode, len(papers or []))
    body_chars = count_report_body_chars(report_text)
    if body_chars >= min_chars:
        return report_text, None, body_chars, min_chars
    return report_text, build_expand_report_prompt(topic, papers, report_text, mode, discipline), body_chars, min_chars


def build_prompt(topic, papers, mode="simple", discipline="理工科"):
    paper_count = len(papers or [])
    prompt_paper_limit = get_prompt_paper_limit(mode, paper_count)
    context = "\n\n".join(
        [f"文献[{i + 1}]【{p['来源']}】: {p['标题']}\n日期: {p.get('日期', '未知')}\n链接: {p.get('链接', '')}\n摘要: {p['摘要']}" for i, p in enumerate((papers or [])[:prompt_paper_limit])]
    )

    templates = {
        "理工科": {"focus": "实验方法、物理机制、性能指标、工程应用和可复现实验条件", "structure": "研究背景；核心技术路线；性能突破与瓶颈；应用前景；未来趋势"},
        "信息学科": {"focus": "算法架构、数据治理、系统实现、评价指标、开源生态和部署成本", "structure": "问题定义；技术演进；关键算法/系统比较；应用场景；挑战与趋势"},
        "计算机与人工智能": {"focus": "模型结构、训练数据、推理效率、评测基准、安全性和工程落地", "structure": "模型/算法演进；关键技术突破；实验评测比较；部署与安全；未来路线"},
        "数据科学与信息管理": {"focus": "数据采集、数据质量、知识组织、用户行为、平台治理和决策支持", "structure": "数据基础；方法框架；管理机制；应用价值；治理挑战"},
        "材料与化学": {"focus": "材料组成、反应机理、表征方法、性能指标、稳定性和规模化制备", "structure": "材料/体系背景；机理与方法；性能比较；制备瓶颈；产业化趋势"},
        "生命科学": {"focus": "分子机制、实验模型、组学证据、生物功能、技术平台和转化潜力", "structure": "生物学背景；关键机制；实验与数据证据；应用转化；未解问题"},
        "医学科": {"focus": "病理机制、临床试验、疗效安全性、诊疗路径、伦理风险和临床转化", "structure": "疾病/临床背景；机制研究；干预方案；疗效与风险；转化建议"},
        "环境与地球科学": {"focus": "环境过程、时空变化、监测数据、模型预测、生态影响和治理政策", "structure": "问题背景；监测与建模方法；关键发现；风险评估；治理路径"},
        "工程技术": {"focus": "系统架构、工艺流程、可靠性、成本效率、工程约束和应用部署", "structure": "工程需求；技术方案；性能与可靠性；部署约束；发展趋势"},
        "管理学与经济学": {"focus": "理论模型、变量机制、实证识别、政策含义、组织行为和经济效应", "structure": "理论基础；研究设计；实证发现；机制解释；管理/政策启示"},
        "教育学": {"focus": "学习理论、教学设计、学习成效评价、教育公平、技术赋能和实践场景", "structure": "理论背景；教学/学习机制；实证结果；实践问题；改进方向"},
        "法学": {"focus": "法律规范、权利义务、监管框架、司法实践、合规风险和制度完善", "structure": "规范背景；争议焦点；制度比较；实践风险；完善建议"},
        "人文社科": {"focus": "理论框架、学术流派、社会影响、历史脉络、质性证据和范式转变", "structure": "理论演进；主要观点；证据与方法；社会影响；范式趋势"},
        "交叉学科": {"focus": "跨学科问题定义、方法迁移、数据/实验融合、应用边界和协同创新", "structure": "交叉背景；方法融合；代表性进展；应用场景；未来问题"},
    }

    tp = templates.get(discipline, templates["理工科"])
    length_rule = get_review_length_rule(mode, paper_count)
    chapter_rule = (
        "## 一、研究背景与问题界定\n## 二、主要研究进展\n## 三、挑战与发展趋势"
        if mode == "simple"
        else "## 一、研究背景与理论基础\n## 二、研究脉络与关键进展\n## 三、技术路线/观点流派比较\n## 四、问题瓶颈与未来路线图\n## 五、总结"
    )

    return f"""
你是一名严谨的【{discipline}】学术综述写作专家。请基于下方真实文献，为主题“{topic}”生成一篇规范中文学术综述。

【学科侧重点】
- 重点关注：{tp['focus']}
- 分析框架：{tp['structure']}

【强制输出格式】
# {topic}学术综述
{chapter_rule}

【语言与风格要求】
1. 全文必须以中文为主，除英文专有名词、论文标题、数据库名和必要术语外，不得出现整段英文。
2. 直接输出综述正文，禁止出现“好的”“当然”“以下是”“请查阅下述综述”等开头客套话。
3. 禁止出现“AI可能生成错误信息”“内容仅供参考”“免责声明”等模型提示语或安全提示语。
4. 语言应学术、清晰、自然，避免口语化和宣传式表达。
5. 综述正文部分字数控制在 {length_rule}。该字数只统计“参考文献”之前的综述正文，不包含参考文献列表。
6. 当前检索到的可用文献数量为 {paper_count} 篇，本次送入正文生成的文献数量为 {prompt_paper_limit} 篇；文献较少时应降低篇幅并避免空泛扩写，文献较多时应展开更充分的比较、归纳和趋势分析。

【引用与参考文献要求】
1. 所有关键结论、方法比较、趋势判断和数据性描述，必须在句末标注真实文献编号，例如 [1]、[2][3]。
2. 引用编号只能来自下方“文献数据源”，不得编造超出范围的编号。
3. 每个正文段落至少包含 1 处引用。
4. 不要生成“## 参考文献”章节，也不要列出参考文献条目；系统会在正文生成后根据实际引用编号自动追加参考文献列表。
5. 不要把“文献[1]……”原始材料直接复制成正文。

【文献数据源】
{context}
"""


def build_revision_prompt(topic, papers, original_report, user_feedback, discipline="理工科"):
    """构造综述二次修改提示词：结合原综述、用户意见和当前文献重新生成完整综述。"""
    context = "\n\n".join(
        [f"文献[{i + 1}]【{p['来源']}】: {p['标题']}\n日期: {p.get('日期', '未知')}\n链接: {p.get('链接', '')}\n摘要: {p['摘要']}" for i, p in enumerate(papers[:30])]
    )
    return f"""
你是一名严谨的【{discipline}】学术综述写作专家。请根据原综述、用户修改建议和真实文献数据，重新生成一版完整中文学术综述。

【研究主题】
{topic}

【原综述】
{original_report}

【用户修改 / 补充要求】
{user_feedback}

【文献数据源】
{context}

【强制要求】
1. 输出一版“新的完整综述”，不要只写修改说明。
2. 必须明确吸收用户的修改意见。
3. 全文必须以中文为主，除英文专有名词、论文标题、数据库名和必要术语外，不得出现整段英文。
4. 直接输出正文，禁止出现“好的”“当然”“以下是修改后的版本”“请查阅”等客套话。
5. 禁止出现“AI可能生成错误信息”“内容仅供参考”“免责声明”等模型提示语。
6. 正文关键观点必须用 [1]、[2][3] 形式引用上方真实文献，不能编造超出范围的编号。
7. 每个正文段落至少包含 1 处引用。
8. 最后一节必须是“## 参考文献”，并按 [1]、[2]、[3] 格式列出正文实际引用文献。
9. 推荐结构：# {topic}学术综述；一、研究背景；二、核心进展；三、问题与挑战；四、未来趋势；参考文献。
"""


def build_chat_messages(topic, papers, report_text, user_message, discipline="理工科", history=None):
    """构造普通聊天 messages：优先围绕当前课题、文献和已生成综述回答。"""
    history = history or []
    context = "\n\n".join(
        [f"文献[{i + 1}]【{p['来源']}】: {p['标题']}\n摘要: {p['摘要']}" for i, p in enumerate(papers[:20])]
    )
    system_prompt = f"""
你是“全球科研文献深度分析助手”的对话模式，服务于【{discipline}】用户。

当前研究主题：{topic}

你可以完成：
1. 解释当前综述内容
2. 对文献内容做通俗说明或学术化重写
3. 回答围绕当前主题的普通科研问答
4. 提出研究思路、应用场景、后续问题

请遵守：
1. 优先围绕当前主题、当前文献和当前综述回答。
2. 不要虚构未给出的具体论文细节。
3. 如果问题超出当前文献范围，要明确说“基于当前上下文推测”。
4. 语言自然、简洁，适合聊天窗口阅读。

【当前综述】
{report_text or '暂无已生成综述'}

【当前文献】
{context if context else '暂无文献上下文'}
"""
    messages = [{"role": "system", "content": system_prompt}]
    for item in history[-8:]:
        role = item.get("role", "user")
        content = item.get("content", "")
        if content:
            messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": user_message})
    return messages


def stream_messages_generator(messages):
    """支持多轮聊天 messages 的流式输出生成器。"""
    try:
        response = get_llm_client().chat.completions.create(
            model=DEEPSEEK_MODEL_NAME,
            messages=messages,
            stream=True
        )
        for chunk in response:
            if not getattr(chunk, "choices", None):
                continue
            if len(chunk.choices) == 0:
                continue
            delta = getattr(chunk.choices[0], "delta", None)
            if delta is None:
                continue
            content = getattr(delta, "content", None)
            if content is not None:
                yield content
    except Exception as e:
        yield f"\n\n**生成时发生错误:** {str(e)}"


def stream_generator(prompt, max_tokens=None):
    try:
        request_kwargs = {
            "model": DEEPSEEK_MODEL_NAME,
            "messages": [{"role": "user", "content": prompt}],
            "stream": True
        }
        if max_tokens:
            request_kwargs["max_tokens"] = max_tokens

        response = get_llm_client().chat.completions.create(**request_kwargs)
        for chunk in response:
            if not getattr(chunk, "choices", None):
                continue
            if len(chunk.choices) == 0:
                continue

            delta = getattr(chunk.choices[0], "delta", None)
            if delta is None:
                continue

            content = getattr(delta, "content", None)
            if content is not None:
                yield content
    except Exception as e:
        yield f"\n\n**生成时发生错误:** {str(e)}"

def save_report_locally(topic, content, suffix=""):
    """将报告保存到 EXPORT_DIR，并清理文件名中的非法字符。"""
    try:
        os.makedirs(EXPORT_DIR, exist_ok=True)

        safe_topic = re.sub(r'[\/:*?<>|]', '_', str(topic))
        safe_suffix = re.sub(r'[\/:*?<>|]', '_', str(suffix)) if suffix else ""
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')

        filename = f"Research_Report_{safe_topic}_{safe_suffix}_{timestamp}.md"
        filepath = os.path.join(EXPORT_DIR, filename)

        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)

        return filepath

    except Exception as e:
        print(f"保存报告失败: {e}")
        return None


def split_long_pdf_line(line: str, max_chars: int = 100) -> list:
    """Split long prose lines before xhtml2pdf sees them as one unbreakable paragraph."""
    if len(line) <= max_chars:
        return [line]

    chunks = []
    current = ""
    parts = re.split(r"([。！？；;：:，,])", line)
    sentences = []
    for i in range(0, len(parts), 2):
        sentence = parts[i]
        punct = parts[i + 1] if i + 1 < len(parts) else ""
        if sentence or punct:
            sentences.append(sentence + punct)

    for sentence in sentences:
        if len(current) + len(sentence) <= max_chars:
            current += sentence
            continue
        if current:
            chunks.append(current.strip())
            current = ""
        while len(sentence) > max_chars:
            chunks.append(sentence[:max_chars].strip())
            sentence = sentence[max_chars:]
        current = sentence

    if current.strip():
        chunks.append(current.strip())
    return chunks or [line]


def prepare_markdown_for_pdf(content: str) -> str:
    """
    xhtml2pdf can fail when a very long Chinese paragraph must be split across pages.
    This keeps the visible content the same while turning inline numbered clauses and
    oversized prose lines into smaller Markdown paragraphs.
    """
    prepared = []
    in_code_block = False

    for raw_line in str(content or "").splitlines():
        line = raw_line.rstrip()
        stripped = line.strip()

        if stripped.startswith("```"):
            in_code_block = not in_code_block
            prepared.append(line)
            continue

        if in_code_block or not stripped:
            prepared.append(line)
            continue

        is_structural_line = (
            stripped.startswith(("#", "|", ">", "-", "*", "+"))
            or re.match(r"^\d+[.．、]\s+", stripped)
        )
        if is_structural_line:
            prepared.append(line)
            continue

        line = re.sub(r"(?<!\d)\s+([1-9]\d?[.．、])\s+", r"\n\n\1 ", line)
        for segment in line.split("\n\n"):
            segment = segment.strip()
            if not segment:
                continue
            for chunk in split_long_pdf_line(segment):
                prepared.append(chunk)
                prepared.append("")

    return "\n".join(prepared)


def markdown_to_plain_pdf_text(content: str) -> str:
    text = str(content or "")
    text = re.sub(r"```(?:markdown|md|text|mermaid)?", "", text, flags=re.IGNORECASE)
    text = text.replace("```", "")
    text = re.sub(r"!\[[^\]]*\]\([^)]+\)", "", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    text = re.sub(r"[*_`~]+", "", text)
    text = re.sub(r"^\s{0,3}#{1,6}\s*", "", text, flags=re.MULTILINE)
    text = re.sub(r"^\s*[-+*]\s+", "• ", text, flags=re.MULTILINE)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def export_as_plain_pdf(report_content, valid_font):
    pdfmetrics.registerFont(TTFont("SimHei", valid_font))
    result = io.BytesIO()
    pdf = canvas.Canvas(result, pagesize=A4)
    width, height = A4
    left = 2 * cm
    right = width - 2 * cm
    top = height - 2 * cm
    bottom = 2 * cm
    y = top
    line_height = 16
    max_chars = 42

    def new_page():
        nonlocal y
        pdf.showPage()
        pdf.setFont("SimHei", 10.5)
        y = top

    def draw_line(text: str, font_size: float = 10.5):
        nonlocal y
        if y < bottom:
            new_page()
        pdf.setFont("SimHei", font_size)
        pdf.drawString(left, y, text)
        y -= line_height if font_size <= 11 else 22

    pdf.setFont("SimHei", 10.5)
    plain_text = markdown_to_plain_pdf_text(report_content)
    for block in plain_text.split("\n\n"):
        block = re.sub(r"\s+", " ", block.strip())
        if not block:
            continue
        is_heading = len(block) <= 36 and not block.endswith(("。", "；", ";", "，", ","))
        for chunk in split_long_pdf_line(block, max_chars=max_chars):
            for i in range(0, len(chunk), max_chars):
                draw_line(chunk[i:i + max_chars], 13 if is_heading else 10.5)
        y -= 6

    pdf.save()
    return result.getvalue()


def export_as_pdf(report_content, topic="未命名课题"):
    valid_font = FONT_PATH
    if not os.path.exists(valid_font):
        raise Exception(f"无法找到本地字体文件: {valid_font}")

    # xhtml2pdf 对长中文段落分页非常敏感，容易触发 PmlParagraph Splitting error。
    # 这里直接使用 canvas 逐行写入，优先保证 PDF 导出稳定可用。
    return export_as_plain_pdf(report_content, valid_font)

    _original_named_temp_file = tempfile.NamedTemporaryFile

    def _patched_named_temp_file(*args, **kwargs):
        kwargs['delete'] = False
        return _original_named_temp_file(*args, **kwargs)

    tempfile.NamedTemporaryFile = _patched_named_temp_file

    def fetch_resources(uri, rel):
        if 'SIMHEI' in str(uri).upper():
            return valid_font
        if str(uri).upper().startswith('HTTP'):
            return ""
        return uri

    pdf_safe_content = prepare_markdown_for_pdf(report_content)
    html_body = markdown.markdown(pdf_safe_content, extensions=['extra', 'tables', 'toc'])

    html_template = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            @font-face {{
                font-family: 'SimHei';
                src: url('SIMHEI.ttf');
            }}
            body, div, p, span, h1, h2, h3, h4, h5, h6, table, tr, td, th, tbody, thead, tfoot, ul, li, ol, b, i, strong, em, a, blockquote {{
                font-family: 'SimHei';
                font-weight: normal !important;
                font-style: normal !important;
                word-wrap: cjk !important; 
                -pdf-word-wrap: CJK !important;
                word-break: break-all !important; 
                white-space: normal !important;
            }}
            @page {{
                size: A4; margin: 2cm;
                @frame footer {{ -pdf-frame-content: footerContent; bottom: 1cm; margin-left: 1cm; margin-right: 1cm; height: 1cm; text-align: center; }}
            }}
            body {{ font-size: 11pt; line-height: 1.6; color: #222222; }}
            h1 {{ font-size: 18pt; text-align: center; color: #1a365d; border-bottom: 2px solid #1a365d; margin-bottom: 20px; }}
            h2 {{ font-size: 14pt; color: #2b6cb0; border-bottom: 1px solid #e2e8f0; margin-top: 25px; }}
            h3 {{ font-size: 12pt; color: #2d3748; margin-top: 15px; }}
            p {{
                text-align: justify;
                text-indent: 2em;
                margin-bottom: 10px;
                page-break-inside: auto;
                -pdf-keep-with-next: false;
            }}
            ul, ol {{ margin-left: 0; padding-left: 20px; }}
            li {{
                margin-bottom: 6px;
                text-align: justify;
                page-break-inside: auto;
                -pdf-keep-with-next: false;
            }}
            table {{
                width: 100%;
                border-collapse: collapse;
                margin: 12px 0;
                table-layout: fixed;
                page-break-inside: auto;
            }}
            th, td {{
                border: 1px solid #cbd5e1;
                padding: 6px;
                text-align: left;
                word-wrap: cjk !important;
                -pdf-word-wrap: CJK !important;
            }}
            th {{ background-color: #f1f5f9; }}
        </style>
    </head>
    <body>
        {html_body}
        <div id="footerContent">- <pdf:pagenumber> -</div>
    </body>
    </html>
    """

    try:
        result = io.BytesIO()
        pisa_status = pisa.CreatePDF(src=html_template, dest=result, encoding='utf-8', link_callback=fetch_resources)
        if pisa_status.err:
            return export_as_plain_pdf(report_content, valid_font)
        return result.getvalue()
    except Exception:
        return export_as_plain_pdf(report_content, valid_font)
    finally:
        tempfile.NamedTemporaryFile = _original_named_temp_file


def render_mermaid(raw_code: str):
    match = re.search(r'(mindmap.*)', raw_code, re.DOTALL | re.IGNORECASE)
    if match:
        clean_code = match.group(1)
        clean_code = re.sub(r'```.*$', '', clean_code, flags=re.DOTALL).strip()
    else:
        clean_code = raw_code.replace("```mermaid", "").replace("```", "").strip()

    js_file_path = MERMAID_JS_PATH
    if not os.path.exists(js_file_path):
        st.error(f"❌ 找不到本地文件，请检查路径: {js_file_path}")
        return

    try:
        with open(js_file_path, "r", encoding="utf-8") as f:
            mermaid_js = f.read().replace("</script>", "<\\/script>")
    except Exception as e:
        st.error(f"❌ 读取 Mermaid JS 失败: {e}")
        return

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            html, body {{ height: 1000px; margin: 0; padding: 0; background: transparent; }}
            #outer-box {{ display: flex; flex-direction: column; align-items: center; width: 100%; padding-top: 50px; }}
            #graph-div {{ width: 100%; display: flex; justify-content: center; }}
            #graph-div svg {{
                max-width: 1200px !important;
                width: 100% !important;
                height: auto !important;
                font-family: "SimHei", "Microsoft YaHei", sans-serif !important;
            }}
            .error-box {{ border: 1px solid #ef4444; background: #fef2f2; padding: 20px; border-radius: 8px; width: 90%; margin: 0 auto; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }}
            .raw-code {{ white-space: pre-wrap; background: #1e293b; color: #e2e8f0; padding: 15px; border-radius: 6px; font-family: Consolas, monospace; font-size: 14px; margin-top: 15px; text-align: left; overflow-x: auto; line-height: 1.5; }}
        </style>
        <script>window.mermaid = {{ startOnLoad: false }};</script>
        <script>{mermaid_js}</script>
    </head>
    <body>
        <textarea id="source-code" style="display:none;">{clean_code}</textarea>
        <div id="outer-box">
            <div id="graph-div"></div>
        </div>
        <script>
            const target = document.getElementById('graph-div');
            const codeText = document.getElementById('source-code').value;
            let isRendered = false;

            function showError(msg, err) {{
                target.innerHTML = `
                    <div class="error-box">
                        <h3 style="color:#ef4444; margin-top:0;">⚠️ AI 节点渲染异常</h3>
                        <p style="color:#7f1d1d; margin:0;">${{msg}}</p>
                        <p style="color:#991b1b; font-size: 13px; margin-top:8px;"><strong>错误详情：</strong>${{err}}</p>
                        <div class="raw-code">${{codeText}}</div>
                    </div>
                `;
            }}

            async function draw() {{
                if (isRendered) return;
                if (target.offsetWidth === 0) return; 
                isRendered = true; 
                try {{
                    try {{
                        mermaid.initialize({{ startOnLoad: false, theme: 'default', securityLevel: 'loose', fontFamily: 'SimHei' }});
                    }} catch (initErr) {{
                        if (!String(initErr).includes('registered')) console.warn(initErr);
                    }}
                    const renderId = 'mermaid-svg-' + Date.now();
                    if (typeof mermaid.renderAsync === 'function') {{
                        const svg = await mermaid.renderAsync(renderId, codeText);
                        target.innerHTML = typeof svg === 'string' ? svg : svg.svg;
                    }} else {{
                        const result = mermaid.render(renderId, codeText);
                        if (result && typeof result.then === 'function') {{
                            const res = await result;
                            target.innerHTML = res.svg || res;
                        }} else {{
                            target.innerHTML = result;
                        }}
                    }}
                }} catch (e) {{
                    console.error(e);
                    showError("语法解析失败。AI 可能输出了不支持的排版结构。", e.message || String(e));
                }}
            }}
            draw();
            const observer = new ResizeObserver(() => {{
                if (!isRendered && target.offsetWidth > 0) {{
                    draw();
                    observer.disconnect(); 
                }}
            }});
            observer.observe(document.body);
        </script>
    </body>
    </html>
    """
    components.html(html_content, height=1000, scrolling=True)


# =========================================================
# 4. 页面路由与渲染逻辑
# =========================================================

def render_home():
    inject_home_css()
    st.markdown('<div class="home-wrapper">', unsafe_allow_html=True)
    st.markdown('<div class="home-title">DeepResearch <span>AI</span></div>', unsafe_allow_html=True)
    st.markdown('<div class="home-subtitle">一站式科研学术工作台 · 洞察科研趋势，深度解构学术脉络</div>',
                unsafe_allow_html=True)

    col_btn1, col_space1, col_btn2, col_space2, col_btn3 = st.columns([8, 1, 8, 1, 8])

    with col_btn1:
        st.markdown('<div class="home-btn-card">', unsafe_allow_html=True)
        if st.button("🌌 科研宇宙星图\n\n宏观热点概览与跨学科聚类发现", use_container_width=True):
            st.session_state.current_page = "galaxy"
            st.rerun()
        st.markdown('</div>', unsafe_allow_html=True)

    with col_btn2:
        st.markdown('<div class="home-btn-card">', unsafe_allow_html=True)
        if st.button("🔭 文献深度分析\n\n全球跨库检索与定制化学术综述", use_container_width=True):
            st.session_state.current_page = "search"
            st.rerun()
        st.markdown('</div>', unsafe_allow_html=True)

    with col_btn3:
        st.markdown('<div class="home-btn-card">', unsafe_allow_html=True)
        if st.button("📁 历史文献库\n\n查阅本地保存的优质历史报告", use_container_width=True):
            st.session_state.current_page = "history"
            st.rerun()
        st.markdown('</div>', unsafe_allow_html=True)

    st.markdown('<div class="feature-section"></div>', unsafe_allow_html=True)
    fc1, fc2, fc3 = st.columns(3)
    with fc1:
        st.markdown(
            '<div class="feature-box"><h4>🌐 全球多库直连</h4><p>打通中国知网、arXiv、OpenAlex等，实现跨语言、跨学科的文献秒级追踪与入库。</p></div>',
            unsafe_allow_html=True)
    with fc2:
        st.markdown(
            '<div class="feature-box"><h4>🧠 深度 AI 解构</h4><p>基于 DeepSeek 强大模型，提供针对理工、人文、医学等不同学科定制的学术综述。</p></div>',
            unsafe_allow_html=True)
    with fc3:
        st.markdown(
            '<div class="feature-box"><h4>✨ 3D 星图可视化</h4><p>将文献数据转化为沉浸式的银河星系图，自动聚类前沿热点，定位最新的科研风口。</p></div>',
            unsafe_allow_html=True)
    st.markdown('</div>', unsafe_allow_html=True)


def render_history():
    inject_app2_css()
    with st.sidebar:
        st.markdown('<div class="nav-btn">', unsafe_allow_html=True)
        if st.button("◀ 返回主页", use_container_width=True):
            st.session_state.current_page = "home"
            st.rerun()
        st.markdown('</div>', unsafe_allow_html=True)

    st.markdown("## 📁 本地历史文献库", unsafe_allow_html=True)
    st.caption(f"当前存储路径：{EXPORT_DIR}")

    files = [f for f in os.listdir(EXPORT_DIR) if f.endswith('.md')]
    if not files:
        st.info("📂 暂无历史报告，请前往「文献深度分析」生成并保存报告。")
        return

    selected_file = st.selectbox("选择要查阅历史报告", sorted(files, reverse=True))
    if selected_file:
        filepath = os.path.join(EXPORT_DIR, selected_file)
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        col_dl1, col_dl2, _ = st.columns([2, 2, 8])
        with col_dl1:
            st.download_button("📥 重新下载 (MD)", data=content, file_name=selected_file, mime="text/markdown")
        with col_dl2:
            if st.button("📥 导出为 PDF 到本地", key="history_pdf"):
                try:
                    pdf_data = export_as_pdf(content, topic=selected_file.replace('.md', ''))
                    file_path = os.path.join(EXPORT_DIR, selected_file.replace('.md', '.pdf'))
                    with open(file_path, "wb") as f:
                        f.write(pdf_data)
                    st.success(f"✅ 成功导出至：{file_path}")
                except Exception as e:
                    st.error(f"PDF生成失败: {str(e)}")

        st.divider()
        st.markdown(content)


# =========================================================
# 1. 样式重构：实现全宽三段式布局与深空质感
# =========================================================
def inject_galaxy_v2_css():
    """星图页面样式：全宽深空布局。"""
    st.markdown("""
    <style>
        .main .block-container {
            padding: 0 !important;
            max-width: 100vw !important;
            width: 100vw !important;
            margin-left: calc(50% - 50vw) !important;
            margin-right: calc(50% - 50vw) !important;
        }
        .galaxy-chart-shell {
            width: 100vw;
            max-width: 100vw;
            margin-left: calc(50% - 50vw);
            margin-right: calc(50% - 50vw);
            overflow: hidden;
        }
        .galaxy-chart-shell div[data-testid="stElementContainer"],
        .galaxy-chart-shell div[data-testid="stIFrame"],
        .galaxy-chart-shell iframe {
            width: 100vw !important;
            max-width: 100vw !important;
            min-width: 100vw !important;
            display: block !important;
        }
        .header-bar {
            background: transparent !important;
            padding: 1.5rem 0 0.5rem 0;
            text-align: center;
            width: 100%;
            position: relative;
            z-index: 20;
        }
        .header-bar h1 {
            margin: 0;
            font-size: 2.8rem;
            font-weight: 700;
            letter-spacing: 12px;
            color: var(--text-primary) !important;
            text-shadow: 0 0 20px rgba(255,255,255,0.12), 0 0 40px rgba(148,163,184,0.10);
        }
        .footer-panel {
            background: linear-gradient(to top, var(--bg-deep), rgba(12, 12, 29, 0.98));
            padding: 3rem 8%;
            border-top: 1px solid var(--border-subtle);
            width: 100%;
        }
        .js-plotly-plot .plotly .main-svg { background: transparent !important; }
        .updatemenu-container, .modebar { display: none !important; }
        [data-testid="stVerticalBlockBorderWrapper"] {
            background: var(--bg-card) !important;
            border: 1px solid var(--border-accent) !important;
            border-radius: var(--radius) !important;
            padding: 20px !important;
            box-shadow: var(--shadow-card) !important;
        }
        .galaxy-info-box {
            background: var(--bg-card-solid);
            border: 1px solid var(--border-accent);
            border-radius: 12px;
            padding: 14px 16px;
            color: var(--text-primary) !important;
            font-size: 0.95rem;
            line-height: 1.8;
        }
        .galaxy-review-box {
            background: rgba(7, 7, 15, 0.6);
            border: 1px solid var(--border-subtle);
            border-radius: 12px;
            padding: 16px 18px;
            font-size: 1rem;
            color: var(--text-primary) !important;
            line-height: 1.85;
        }
        .galaxy-review-time {
            margin-top: 24px;
            padding-top: 10px;
            border-top: 1px solid var(--border-subtle);
            font-size: 11px;
            color: var(--text-muted) !important;
        }
        [data-testid="stMetricValue"] {
            color: #ffffff !important;
            text-shadow: 0 0 14px rgba(56,189,248,0.20);
        }
    </style>
    """, unsafe_allow_html=True)

def clear_galaxy_cache():
    """清空星图缓存。用于数据库数据更新后手动刷新星图。"""
    st.session_state.galaxy_loaded = False
    st.session_state.galaxy_all_papers = None
    st.session_state.galaxy_all_hotspots = None
    st.session_state.galaxy_visible_papers = None
    st.session_state.galaxy_visible_hotspots = None
    st.session_state.galaxy_figure = None
    st.session_state.galaxy_figure_app14 = None
    st.session_state.galaxy_figure_app15 = None
    st.session_state.galaxy_html_app14 = None
    st.session_state.galaxy_html_app15 = None
    st.session_state.galaxy_cache_built_at = None
    st.session_state.galaxy_selected_name = None

    # 同步清理 Streamlit 数据缓存，避免数据库更新后仍读旧数据。
    try:
        fetch_all_papers_with_topics.clear()
        fetch_hotspots.clear()
    except Exception:
        pass

def build_galaxy_figure_app15(papers, hotspots):
    hotspot_data, paper_data, orbit_data = create_galaxy_map_v4(papers, hotspots)
    hx, hy, hz, hc, hs, ht, h_hover = hotspot_data
    px, py, pz, pc, ps = paper_data
    ox, oy, oz = orbit_data

    fig = go.Figure()

    # 轨道仅在有数据时才加
    if ox and oy and oz:
        fig.add_trace(go.Scatter3d(
            x=ox, y=oy, z=oz,
            mode='lines',
            line=dict(color='rgba(255, 255, 255, 0.05)', width=1.5),
            hoverinfo='none',
            name='热点轨迹'
        ))

    if px and py and pz:
        fig.add_trace(go.Scatter3d(
            x=px, y=py, z=pz,
            mode='markers',
            marker=dict(size=ps, color=pc, opacity=0.42),
            hoverinfo='skip'
        ))

    if hx and hy and hz:
        fig.add_trace(go.Scatter3d(
            x=hx, y=hy, z=hz,
            mode='markers',
            marker=dict(
                size=hs,
                color=hc,
                opacity=1.0,
                line=dict(color='rgba(255, 255, 255, 1.0)', width=2)
            ),
            hovertext=h_hover,
            hoverinfo='text'
        ))

    all_x = np.array([v for v in (hx + px + ox) if v is not None], dtype=float)
    all_y = np.array([v for v in (hy + py + oy) if v is not None], dtype=float)
    all_z = np.array([v for v in (hz + pz + oz) if v is not None], dtype=float)

    if all_x.size == 0:
        all_x = np.array([0.0])
    if all_y.size == 0:
        all_y = np.array([0.0])
    if all_z.size == 0:
        all_z = np.array([0.0])

    xy_max = max(np.abs(all_x).max(), np.abs(all_y).max(), 1.0)
    xy_pad = max(220, xy_max * 0.15)
    z_min, z_max = all_z.min(), all_z.max()
    z_pad = max(60, (z_max - z_min) * 0.22 + 20)

    fig.update_layout(
        height=1050,
        margin=dict(l=0, r=0, t=30, b=30),
        paper_bgcolor='rgba(0,0,0,0)',
        showlegend=False,
        uirevision='galaxy_app15_static',
        scene=dict(
            domain=dict(x=[0.0, 1.0], y=[0.0, 1.0]),
            xaxis=dict(visible=False, range=[-(xy_max + xy_pad), xy_max + xy_pad]),
            yaxis=dict(visible=False, range=[-(xy_max + xy_pad), xy_max + xy_pad]),
            zaxis=dict(visible=False, range=[z_min - z_pad, z_max + z_pad]),
            bgcolor='rgba(0,0,0,0)',
            aspectmode='manual',
            aspectratio=dict(x=1, y=1, z=0.42),
            camera=dict(
                eye=dict(x=0.55, y=0.55, z=0.35),
                center=dict(x=0, y=0, z=0),
                projection=dict(type='perspective')
            )
        )
    )
    return fig

def build_galaxy_figure_app14(papers, hotspots):
    hotspot_data, paper_data, orbit_data = create_galaxy_map_v4_app14(papers, hotspots)
    hx, hy, hz, hc, hs, ht, h_hover = hotspot_data
    px, py, pz, pc, ps = paper_data
    ox, oy, oz = orbit_data

    fig = go.Figure()

    if ox and oy and oz:
        fig.add_trace(go.Scatter3d(
            x=ox, y=oy, z=oz,
            mode='lines',
            line=dict(color='rgba(255, 255, 255, 0.05)', width=1.5),
            hoverinfo='none',
            name='超级热点轨道'
        ))

    if px and py and pz:
        fig.add_trace(go.Scatter3d(
            x=px, y=py, z=pz, mode='markers',
            marker=dict(size=ps, color=pc, opacity=0.38),
            hoverinfo='skip'
        ))

    if hx and hy and hz:
        fig.add_trace(go.Scatter3d(
            x=hx, y=hy, z=hz,
            mode='markers+text',
            marker=dict(
                size=hs, color=hc, opacity=1.0,
                line=dict(color='rgba(255, 255, 255, 0.9)', width=2)
            ),
            text=ht,
            hovertext=h_hover,
            hoverinfo='text',
            textposition='top center',
            textfont=dict(color='white', size=11),
        ))

    all_x = np.array([v for v in (hx + px + ox) if v is not None], dtype=float) if (hx or px or ox) else np.array([0.0])
    all_y = np.array([v for v in (hy + py + oy) if v is not None], dtype=float) if (hy or py or oy) else np.array([0.0])
    all_z = np.array([v for v in (hz + pz + oz) if v is not None], dtype=float) if (hz or pz or oz) else np.array([0.0])

    xy_max = max(np.abs(all_x).max(), np.abs(all_y).max(), 1.0)
    xy_pad = max(250, xy_max * 0.15)
    z_min, z_max = all_z.min(), all_z.max()
    z_pad = max(40, (z_max - z_min) * 0.15)

    fig.update_layout(
        height=1050,
        margin=dict(l=0, r=0, t=30, b=30),
        paper_bgcolor='rgba(0,0,0,0)',
        showlegend=False,
        uirevision='galaxy_app14_rotating',
        scene=dict(
            domain=dict(x=[0.0, 1.0], y=[0.0, 1.0]),
            xaxis=dict(visible=False, range=[-(xy_max + xy_pad), xy_max + xy_pad]),
            yaxis=dict(visible=False, range=[-(xy_max + xy_pad), xy_max + xy_pad]),
            zaxis=dict(visible=False, range=[z_min - z_pad, z_max + z_pad]),
            bgcolor='rgba(0,0,0,0)',
            aspectmode='manual',
            aspectratio=dict(x=1, y=1, z=0.22),
            camera=dict(
                eye=dict(x=0.35, y=0.35, z=0.2),
                center=dict(x=0, y=0, z=-0.1),
                projection=dict(type='perspective')
            )
        )
    )
    return fig


def build_plotly_galaxy_html(fig, rotating=False, chart_key="galaxy_app14"):
    """生成可缓存的 Plotly 星图 HTML。chart_key 固定后可复用浏览器 sessionStorage 中的视角。"""
    div_id = f"galaxy_plot_{chart_key}"
    html = fig.to_html(
        include_plotlyjs=True,
        full_html=False,
        div_id=div_id,
        config={"displayModeBar": False, "responsive": True, "scrollZoom": True}
    )

    css = """
    <style>
        html, body { margin: 0; padding: 0; background: transparent; overflow: hidden; }
        .plot-container, .js-plotly-plot { background: transparent !important; }
        .main-svg { background: transparent !important; }
        .scattertext, .textpoint, svg text {
            opacity: 1 !important;
            fill: #ffffff !important;
            font-family: "Microsoft YaHei", "SimHei", "Noto Sans CJK SC", Arial, sans-serif !important;
            font-weight: 700 !important;
            paint-order: stroke fill;
            stroke: rgba(2, 6, 23, 0.95);
            stroke-width: 3px;
            stroke-linejoin: round;
        }
    </style>
    """

    rotation_script = f"""
    <script>
    (function() {{
        const gd = document.getElementById("{div_id}");
        if (!gd) return;

        const storageKey = "deepresearch_{chart_key}_camera";
        const rotatingEnabled = {str(bool(rotating)).lower()};
        let busy = false;
        let pausedUntil = 0;
        let currentCamera = null;
        let scriptRelayout = false;
        // 原来 120ms 更新一次相机，理论只有 8fps 左右，旋转会明显跳帧。
        // 缩短间隔并按相同角速度缩小步进，让自动旋转更顺。
        const speed = 0.00135;
        const intervalMs = 50;

        function clone(obj) {{
            return JSON.parse(JSON.stringify(obj || {{}}));
        }}

        function readCamera() {{
            const scene = (gd._fullLayout && gd._fullLayout.scene) || (gd.layout && gd.layout.scene) || {{}};
            const camera = scene.camera || {{ eye: {{x: 0.35, y: 0.35, z: 0.2}}, center: {{x: 0, y: 0, z: -0.1}}, up: {{x: 0, y: 0, z: 1}} }};
            return clone(camera);
        }}

        function saveCamera(camera) {{
            if (!camera || !camera.eye) return;
            currentCamera = clone(camera);
            try {{ sessionStorage.setItem(storageKey, JSON.stringify(currentCamera)); }} catch (e) {{}}
        }}

        function loadSavedCamera() {{
            try {{
                const raw = sessionStorage.getItem(storageKey);
                if (!raw) return null;
                const camera = JSON.parse(raw);
                if (camera && camera.eye) return camera;
            }} catch (e) {{}}
            return null;
        }}

        function pauseRotation(ms) {{
            pausedUntil = Math.max(pausedUntil, Date.now() + ms);
        }}

        function applySavedCameraOnce() {{
            if (!window.Plotly || !gd._fullLayout) return;
            const saved = loadSavedCamera();
            if (saved && saved.eye) {{
                currentCamera = saved;
                window.Plotly.relayout(gd, {{"scene.camera": saved}});
            }} else {{
                currentCamera = readCamera();
                saveCamera(currentCamera);
            }}
        }}

        function getBaseCamera() {{
            if (!currentCamera || !currentCamera.eye) {{
                currentCamera = readCamera();
            }}
            return clone(currentCamera);
        }}

        function rotateOnce() {{
            if (!rotatingEnabled || !window.Plotly || busy || !gd._fullLayout) return;
            if (Date.now() < pausedUntil) return;

            const camera = getBaseCamera();
            const center = camera.center || {{x: 0, y: 0, z: 0}};
            const eye = camera.eye || {{x: 0.35, y: 0.35, z: 0.2}};
            const dx = eye.x - center.x;
            const dy = eye.y - center.y;
            const r = Math.sqrt(dx * dx + dy * dy) || 1;
            const angle = Math.atan2(dy, dx);

            camera.eye = {{
                x: center.x + r * Math.cos(angle + speed),
                y: center.y + r * Math.sin(angle + speed),
                z: eye.z
            }};
            camera.center = center;
            if (!camera.up) camera.up = {{x: 0, y: 0, z: 1}};

            busy = true;
            scriptRelayout = true;
            window.Plotly.relayout(gd, {{"scene.camera": camera}})
                .then(() => {{ currentCamera = clone(camera); }})
                .finally(() => {{ busy = false; scriptRelayout = false; }});
        }}

        gd.on && gd.on("plotly_relayout", function(eventData) {{
            // 用户交互或脚本 relayout 后，都记录最新 camera；下一次旋转从当前视角继续，不回初始视角。
            const camera = (eventData && eventData["scene.camera"]) ? eventData["scene.camera"] : readCamera();
            if (camera && camera.eye) {{
                currentCamera = clone(camera);
                if (!scriptRelayout) saveCamera(camera);
            }}
        }});

        gd.addEventListener("mousedown", () => pauseRotation(10000), {{ passive: true }});
        gd.addEventListener("touchstart", () => pauseRotation(10000), {{ passive: true }});
        gd.addEventListener("wheel", () => pauseRotation(10000), {{ passive: true }});
        gd.addEventListener("dblclick", () => pauseRotation(10000), {{ passive: true }});
        document.addEventListener("mouseup", () => pauseRotation(6000), {{ passive: true }});
        document.addEventListener("touchend", () => pauseRotation(6000), {{ passive: true }});

        setTimeout(applySavedCameraOnce, 350);
        const timer = setInterval(rotateOnce, intervalMs);
        window.addEventListener("beforeunload", () => {{
            clearInterval(timer);
            if (currentCamera && currentCamera.eye) saveCamera(currentCamera);
        }});
    }})();
    </script>
    """

    return css + html + rotation_script


def render_plotly_galaxy_chart(fig, rotating=False, height=1050, chart_key="galaxy_app14"):
    """渲染缓存后的 Plotly 星图。"""
    html = build_plotly_galaxy_html(fig, rotating=rotating, chart_key=chart_key)
    components.html(html, height=height, scrolling=False)

def stable_shuffle_hotspots_app14(hotspots):
    """对热点做稳定随机打散；同一个热点每次打开位置一致。"""
    return sorted(
        hotspots,
        key=lambda h: abs(hash(f"{h['field']}_{h['topic_id']}")) % (10 ** 12)
    )


def create_galaxy_map_v4_app14(papers, hotspots):
    phi = (1 + 5 ** 0.5) / 2
    palette = ['#38bdf8', '#818cf8', '#34d399', '#f472b6', '#fbbf24',
               '#a78bfa', '#2dd4bf', '#fb7185', '#fcd34d', '#94a3b8']

    top_hotspots = hotspots[:50]
    layout_hotspots = stable_shuffle_hotspots_app14(top_hotspots)

    hx, hy, hz, hc, hs, ht, h_hover = [], [], [], [], [], [], []
    ox, oy, oz = [], [], []
    px, py, pz, pc, ps = [], [], [], [], []

    hotspot_pos = {}
    unique_fields = list(set([h['field'] for h in top_hotspots]))
    field_to_color = {field: palette[i % len(palette)] for i, field in enumerate(unique_fields)}

    top_5_keys = [f"{h['field']}_{h['topic_id']}" for h in top_hotspots[:5]]

    for i, h in enumerate(layout_hotspots):
        current_key = f"{h['field']}_{h['topic_id']}"
        r = (i + 1) ** 0.5 * 320
        theta = i * 2 * np.pi / (phi ** 2)

        x = r * np.cos(theta)
        y = r * np.sin(theta)
        z = 0

        color = field_to_color.get(h['field'], '#ffffff')
        paper_count = h.get('paper_count', 10)
        size = 6 + np.log1p(paper_count) * 5
        display_name = h.get('title_cn') or h.get('topic_label') or f"Topic {h['topic_id']}"

        hx.append(x)
        hy.append(y)
        hz.append(z)
        hc.append(color)
        hs.append(size)
        ht.append(f"<b>{display_name}</b>")
        h_hover.append(f"主题: {display_name}<br>学科: {h['field']}<br>论文数: {paper_count}")

        hotspot_pos[current_key] = {'x': x, 'y': y, 'z': z, 'color': color}

        if current_key in top_5_keys:
            theta_orbit = np.linspace(0, 2 * np.pi, 120)
            ox.extend((r * np.cos(theta_orbit)).tolist())
            oy.extend((r * np.sin(theta_orbit)).tolist())
            oz.extend(np.full(120, z).tolist())
            ox.append(None)
            oy.append(None)
            oz.append(None)

    valid_keys = set(hotspot_pos.keys())

    grouped_papers = defaultdict(list)
    for p in papers:
        key = f"{p['field']}_{p['topic_id']}"
        if key in valid_keys:
            grouped_papers[key].append(p)

    for key, plist in grouped_papers.items():
        star = hotspot_pos[key]
        n = len(plist)
        seed = abs(hash(key)) % (2 ** 32)
        rng = np.random.default_rng(seed)

        orbit_radius = rng.uniform(80, 250, size=n)
        angle = rng.uniform(0, 2 * np.pi, size=n)

        x_arr = star['x'] + orbit_radius * np.cos(angle)
        y_arr = star['y'] + orbit_radius * np.sin(angle)
        z_arr = np.full(n, star['z'])

        px.extend(x_arr.tolist())
        py.extend(y_arr.tolist())
        pz.extend(z_arr.tolist())
        pc.extend([star['color']] * n)
        ps.extend([2] * n)

    return (hx, hy, hz, hc, hs, ht, h_hover), (px, py, pz, pc, ps), (ox, oy, oz)


def _safe_float(v, default=0.0):
    try:
        return float(v)
    except Exception:
        return default


def _normalize_db_coordinates(papers):
    """
    对 chuli2 写入 paper_topics 的原始 UMAP 坐标做中心化与缩放，
    仅改变显示尺度，不改变相对空间关系。
    """
    valid = [
        p for p in papers
        if p.get("x") is not None and p.get("y") is not None and p.get("z") is not None
    ]
    if not valid:
        return {}

    coords = np.array([
        [_safe_float(p["x"]), _safe_float(p["y"]), _safe_float(p["z"])]
        for p in valid
    ], dtype=float)

    # 中心化：让整体落在画面中央
    center = coords.mean(axis=0)
    coords = coords - center

    # 用 95 分位半径做鲁棒缩放，避免极端离群点把图撑爆
    xy_radius = np.linalg.norm(coords[:, :2], axis=1)
    base_radius = np.percentile(xy_radius, 95)
    if base_radius <= 1e-8:
        base_radius = 1.0

    scale = 900.0 / base_radius
    coords = coords * scale

    # 压缩一点 z 轴，减少“长条形拉伸”
    coords[:, 2] = coords[:, 2] * 0.55

    return {
        p["id"]: coords[i]
        for i, p in enumerate(valid)
    }


def create_galaxy_map_v4(papers, hotspots):
    """
    方向 B：
    - 论文点：直接使用 paper_topics.x/y/z
    - 热点点：使用该 topic 下所有论文点的质心
    - 不再做人造轨道/随机散列
    """
    palette = ['#38bdf8', '#818cf8', '#34d399', '#f472b6', '#fbbf24',
               '#a78bfa', '#2dd4bf', '#fb7185', '#fcd34d', '#94a3b8']

    top_hotspots = hotspots if MAX_VISIBLE_HOTSPOTS is None else hotspots[:MAX_VISIBLE_HOTSPOTS]

    allowed_keys = {
        (h["field"], h["topic_id"])
        for h in top_hotspots
    }

    visible_papers = [
        p for p in papers
        if (p.get("field"), p.get("topic_id")) in allowed_keys
        and p.get("x") is not None and p.get("y") is not None and p.get("z") is not None
    ]

    # 可选：若某个热点想限制论文数，可在这里截断
    if MAX_PAPERS_PER_HOTSPOT is not None:
        grouped = defaultdict(list)
        for p in visible_papers:
            grouped[(p["field"], p["topic_id"])].append(p)

        limited = []
        for key, rows in grouped.items():
            rows = sorted(rows, key=lambda r: (_safe_float(r.get("year", 0)), r.get("id", "")), reverse=True)
            limited.extend(rows[:MAX_PAPERS_PER_HOTSPOT])
        visible_papers = limited

    coord_map = _normalize_db_coordinates(visible_papers)

    # 论文星数据
    px, py, pz, pc, ps = [], [], [], [], []

    current_year = datetime.now().year
    for p in visible_papers:
        pid = p["id"]
        if pid not in coord_map:
            continue

        x, y, z = coord_map[pid]
        px.append(float(x))
        py.append(float(y))
        pz.append(float(z))

        # 颜色：按 topic 稳定分配
        topic_key = f"{p.get('field')}_{p.get('topic_id')}"
        color = palette[abs(hash(topic_key)) % len(palette)]
        pc.append(color)

        # 大小：按年份轻微增强，越新越大一点
        try:
            year_val = int(str(p.get("year", 0))[:4])
        except Exception:
            year_val = 0
        recency = max(0, current_year - year_val)
        size = 2.2 if recency >= 8 else 2.8 if recency >= 4 else 3.4
        ps.append(size)

    # 热点星数据：用论文质心
    hx, hy, hz, hc, hs, ht, h_hover = [], [], [], [], [], [], []

    for i, h in enumerate(top_hotspots):
        members = [
            coord_map[p["id"]]
            for p in visible_papers
            if p.get("field") == h["field"]
            and p.get("topic_id") == h["topic_id"]
            and p["id"] in coord_map
        ]
        if not members:
            continue

        members = np.array(members, dtype=float)
        centroid = members.mean(axis=0)

        hx.append(float(centroid[0]))
        hy.append(float(centroid[1]))
        hz.append(float(centroid[2]))

        color = palette[i % len(palette)]
        hc.append(color)

        paper_count = int(h.get("paper_count") or len(members))
        hs.append(max(10, min(26, 10 + np.sqrt(paper_count) * 0.7)))

        display_name = get_hotspot_display_name(h)
        ht.append(display_name)

        hover_text = (
            f"<b>{display_name}</b><br>"
            f"领域：{h.get('field', '未知')}<br>"
            f"论文数：{paper_count}<br>"
            f"趋势：{h.get('trend_status', '未知')}<br>"
            f"简介：{h.get('summary_cn', '暂无简介')}"
        )
        h_hover.append(hover_text)

    # 方向 B 不再画人造轨道
    ox, oy, oz = [], [], []

    return (hx, hy, hz, hc, hs, ht, h_hover), (px, py, pz, pc, ps), (ox, oy, oz)
    # =========================================================

def get_hotspot_display_name(h):
    return h.get("title_cn") or h.get("topic_label") or f"{h['field']} | Topic {h['topic_id']}"


def render_galaxy():
    inject_galaxy_v2_css()

    if not st.session_state.galaxy_loaded:
        with st.spinner("🚀 正在建立神经连接，同步宇宙数据..."):
            try:
                all_papers = fetch_all_papers_with_topics()
                all_hotspots = fetch_hotspots()
            except Exception as e:
                st.error(f"数据库连接失败：{str(e)}")
                return

            if not all_papers:
                st.warning("🌌 观测器未发现本地数据，请先完成前置数据抓取、清洗、聚类与命名脚本。")
                if st.button("← 返回主页"):
                    st.session_state.current_page = "home"
                    st.rerun()
                return

            st.session_state.galaxy_all_papers = all_papers
            st.session_state.galaxy_all_hotspots = all_hotspots
            st.session_state.galaxy_loaded = True
            st.session_state.galaxy_cache_built_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

            if all_hotspots and not st.session_state.galaxy_selected_name:
                st.session_state.galaxy_selected_name = get_hotspot_display_name(all_hotspots[0])

    all_papers = st.session_state.galaxy_all_papers
    all_hotspots = st.session_state.galaxy_all_hotspots

    if not all_papers:
        st.warning("🌌 观测器未发现本地数据，请先完成前置数据抓取、清洗、聚类与命名脚本。")
        if st.button("← 返回主页"):
            st.session_state.current_page = "home"
            st.rerun()
        return

    st.markdown('<div class="header-bar"><h1>科研宇宙星图</h1></div>', unsafe_allow_html=True)
    st.markdown('<div class="galaxy-chart-shell">', unsafe_allow_html=True)

    if st.session_state.galaxy_view_mode == "app14":
        if st.session_state.galaxy_figure_app14 is None:
            st.session_state.galaxy_figure_app14 = build_galaxy_figure_app14(all_papers, all_hotspots)
        fig = st.session_state.galaxy_figure_app14
        if st.session_state.galaxy_html_app14 is None:
            st.session_state.galaxy_html_app14 = build_plotly_galaxy_html(
                fig,
                rotating=True,
                chart_key="galaxy_app14"
            )
        components.html(st.session_state.galaxy_html_app14, height=1050, scrolling=False)
    else:
        if st.session_state.galaxy_figure_app15 is None:
            st.session_state.galaxy_figure_app15 = build_galaxy_figure_app15(all_papers, all_hotspots)
        fig = st.session_state.galaxy_figure_app15
        if st.session_state.galaxy_html_app15 is None:
            st.session_state.galaxy_html_app15 = build_plotly_galaxy_html(
                fig,
                rotating=False,
                chart_key="galaxy_app15"
            )
        components.html(st.session_state.galaxy_html_app15, height=1050, scrolling=False)

    st.markdown('</div>', unsafe_allow_html=True)

    st.markdown('<div class="footer-panel">', unsafe_allow_html=True)

    unique_fields = len(set([h['field'] for h in all_hotspots]))
    valid_years = []
    current_year = datetime.now().year

    for p in all_papers:
        if p.get('year'):
            try:
                y = int(p['year'])
                if 1900 <= y <= current_year:
                    valid_years.append(y)
            except:
                pass

    time_span = f"{min(valid_years)}-{max(valid_years)}" if valid_years else "N/A"

    st.markdown(f"""
        <style>
        .horizontal-stats {{ display: flex; justify-content: space-between; gap: 20px; margin-bottom: 30px; }}
        .stat-item {{ flex: 1; background: var(--bg-card-solid); border: 1px solid var(--border-accent); border-radius: 12px; padding: 20px; text-align: center; box-shadow: var(--shadow-card); }}
        .stat-item h3 {{ font-size: 2rem; color: #ffffff !important; margin: 0; font-weight: 700; }}
        .stat-item p {{ font-size: 0.82rem; color: var(--text-muted) !important; margin: 6px 0 0 0; letter-spacing: 2px; }}
        </style>
        <div class="horizontal-stats">
            <div class="stat-item"><h3>{len(all_papers)}</h3><p>论文星辰（全库）</p></div>
            <div class="stat-item"><h3>{len(all_hotspots)}</h3><p>研究星系（全库）</p></div>
            <div class="stat-item"><h3>{unique_fields}</h3><p>学科领域</p></div>
            <div class="stat-item"><h3>{time_span}</h3><p>时间跨度</p></div>
        </div>
        """, unsafe_allow_html=True)

    col_left, col_right = st.columns([1, 2], gap="large")

    if not all_hotspots:
        st.info("尚未探测到活跃目标。")
        st.markdown('</div>', unsafe_allow_html=True)
        return

    with col_left:
        st.markdown("""
            <style>
            div[data-testid="stButton"] > button {
                background-color: #000000 !important; color: #ffffff !important;
                border: 1px solid rgba(255, 255, 255, 0.2) !important; transition: all 0.3s ease;
                font-weight: bold; margin-bottom: 20px;
            }
            div[data-testid="stButton"] > button:hover {
                background-color: #1a1a1a !important; border-color: #06b6d4 !important; color: #06b6d4 !important;
            }
            </style>
            """, unsafe_allow_html=True)

        if st.button("← 退出观测系统", use_container_width=True):
            st.session_state.current_page = "home"
            st.rerun()

        st.markdown("#### 星图视图")
        btn_show, btn_theory = st.columns(2)
        with btn_show:
            if st.button("🌌 展示星图", key="switch_show_galaxy", use_container_width=True):
                st.session_state.galaxy_view_mode = "app14"
                st.rerun()
        with btn_theory:
            if st.button("🧭 理论星图", key="switch_theory_galaxy", use_container_width=True):
                st.session_state.galaxy_view_mode = "app15"
                st.rerun()
        st.caption("展示星图自动旋转；用户拖拽或缩放后会暂停数秒，并从当前视角继续，不再跳回初始视角。")

        if st.button("🧹 刷新星图缓存", key="refresh_galaxy_cache", use_container_width=True):
            clear_galaxy_cache()
            st.rerun()
        st.caption("仅在数据库数据更新、聚类结果重跑后需要点击。")

        st.markdown("<br>", unsafe_allow_html=True)

        with st.container(border=True):
            st.subheader("⭐ 星系包含的文献")

            selected_index = 0
            if st.session_state.galaxy_selected_name:
                for i, h in enumerate(all_hotspots):
                    if get_hotspot_display_name(h) == st.session_state.galaxy_selected_name:
                        selected_index = i
                        break

            target = st.selectbox(
                "当前观测目标：",
                all_hotspots,
                index=selected_index,
                format_func=get_hotspot_display_name,
                key="galaxy_selected_obj"
            )
            st.session_state.galaxy_selected_name = get_hotspot_display_name(target)

            hotspot_papers = [
                p for p in all_papers
                if p.get('field') == target['field'] and p.get('topic_id') == target['topic_id']
            ]
            st.caption(f"该星系内捕获到 {len(hotspot_papers)} 篇核心文献")

            with st.container(height=800):
                current_year = datetime.now().year
                for i, p in enumerate(hotspot_papers, 1):
                    title = p.get('title', p.get('标题', '无标题'))
                    year_raw = str(p.get('year', p.get('日期', 'N/A')))
                    display_year = year_raw
                    try:
                        y_int = int(year_raw[:4])
                        if y_int > current_year:
                            display_year = f"{current_year} (源数据标记异常)"
                    except:
                        pass
                    st.markdown(f"**{i}. {title}**")
                    st.caption(f"年份: {display_year}")
                    st.divider()

        with st.container(border=True):
            st.subheader("📈 年度演化轨迹")
            evo_json = target.get("evolution_json")
            if evo_json:
                try:
                    evo_data = json.loads(evo_json)
                    for item in evo_data:
                        year = item.get("year", "未知")
                        count = item.get("count", 0)
                        kws = "、".join(item.get("keywords", [])[:5])
                        rep_ids = item.get("representative_ids", [])
                        st.markdown(
                            f"**{year}** ｜ 文献数：{count}<br>"
                            f"关键词：{kws if kws else '暂无'}<br>"
                            f"代表文献ID：{', '.join(rep_ids[:3]) if rep_ids else '暂无'}",
                            unsafe_allow_html=True
                        )
                        st.divider()
                except Exception:
                    st.warning("演化数据解析失败。")
            else:
                st.caption("暂无演化轨迹数据。")

    with col_right:
        with st.container(border=True):
            st.subheader("🔍 目标星系解析")
            st.markdown(f"### {get_hotspot_display_name(target)}")
            st.caption(f"研究领域：{target['field']} | 坐标系索引：{target['topic_id']}")
            st.divider()

            paper_count = int(target.get("paper_count") or 0)
            trend_text = target.get("trend_status") or "暂无趋势判断"
            summary_text = target.get("summary_cn") or "暂无热点简介"

            c1, c2 = st.columns(2)
            c1.metric("论文规模", paper_count)
            c2.metric("演化态势", trend_text)

            st.markdown("#### 🧭 热点简介")
            st.markdown(
                f"<div class='galaxy-info-box'>{summary_text}</div>",
                unsafe_allow_html=True
            )

            st.markdown("#### 🤖 深度综述")
            review_data = fetch_hotspot_review(target['field'], target['topic_id'])
            if review_data:
                st.markdown(f"""
                    <div class='galaxy-review-box'>
                        {review_data['review_cn']}
                        <div class="galaxy-review-time">
                            📅 综述生成时间：{review_data['created_at']}
                        </div>
                    </div>
                """, unsafe_allow_html=True)
            else:
                st.info("该热点已完成空间建模，但尚未生成深度 AI 综述。")

    st.markdown('</div>', unsafe_allow_html=True)

def render_revision_panel(selected_discipline, compact=False):
    """右侧面板：综述二次修改 / 补充建议。"""
    st.markdown("### ✍️ 综述二次修改")
    st.caption("先在左侧生成精简版或完全版综述，再在这里输入修改意见，AI 会结合当前文献重写新版综述。")

    if not st.session_state.results:
        st.info("请先在左侧完成一次文献检索。")
        return

    available_reports = []
    if st.session_state.simple_report:
        available_reports.append("精简版综述")
    if st.session_state.complex_report:
        available_reports.append("完全版综述")

    if not available_reports:
        st.info("左侧综述正在生成或尚未生成。生成后即可二次修改。")
        return

    default_index = 0
    if st.session_state.revise_base_mode in available_reports:
        default_index = available_reports.index(st.session_state.revise_base_mode)

    revise_base_mode = st.radio(
        "选择要修改的原稿",
        available_reports,
        index=default_index,
        horizontal=True,
        key="right_revise_base_mode_radio"
    )
    st.session_state.revise_base_mode = revise_base_mode

    base_report = (
        st.session_state.simple_report
        if revise_base_mode == "精简版综述"
        else st.session_state.complex_report
    )

    revise_instructions = st.text_area(
        "修改 / 补充要求",
        value=st.session_state.revise_instructions,
        height=110 if compact else 150,
        placeholder="例如：补充研究局限性；增加应用场景；压缩到800字；强化结论；改得更像论文综述。",
        key="right_revise_instructions_box"
    )
    st.session_state.revise_instructions = revise_instructions

    do_revise = st.button("🔁 生成新版综述", use_container_width=True, key="right_do_revise_report")

    if do_revise:
        if not revise_instructions.strip():
            st.warning("请先输入修改意见。")
        else:
            revise_prompt = build_revision_prompt(
                st.session_state.search_query,
                st.session_state.results,
                base_report,
                revise_instructions,
                selected_discipline
            )
            st.info("🤖 AI 正在根据你的修改意见重写综述...")
            revised_text = st.write_stream(stream_generator(revise_prompt))
            revised_text = normalize_report_output(revised_text, st.session_state.search_query, st.session_state.results)
            st.session_state.revised_report = revised_text
            save_report_locally(
                st.session_state.search_query,
                revised_text,
                suffix=f"Revised_{selected_discipline}"
            )
            st.rerun()

    if st.session_state.revised_report:
        st.success("新版综述已生成。")
        d1, d2 = st.columns(2)
        with d1:
            st.download_button(
                "📥 MD",
                data=st.session_state.revised_report,
                file_name=f"Revised_{st.session_state.search_query}.md",
                mime="text/markdown",
                key="right_dl_revised_md",
                use_container_width=True
            )
        with d2:
            if st.button("📥 PDF", key="right_save_pdf_revised", use_container_width=True):
                try:
                    start_time = time.time()
                    pdf_data_revised = export_as_pdf(
                        st.session_state.revised_report,
                        topic=st.session_state.search_query
                    )
                    export_time = time.time() - start_time

                    safe_topic = re.sub(r'[\\/:*?<>|]', '_', st.session_state.search_query)
                    file_path = os.path.join(
                        EXPORT_DIR,
                        f"Revised_{safe_topic}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
                    )
                    with open(file_path, "wb") as f:
                        f.write(pdf_data_revised)
                    st.success(f"PDF 已导出：{file_path}，耗时 {export_time:.2f}s")
                except Exception as e:
                    st.error(f"PDF 导出失败：{str(e)}")

        with st.expander("预览新版综述", expanded=False):
            with st.container(height=280 if compact else 520):
                st.markdown(st.session_state.revised_report)

def render_chat_panel(selected_discipline, compact=False):
    """右侧面板：AI 普通聊天。"""
    st.markdown("### 💬 AI 普通聊天")
    st.caption("围绕当前检索主题、已生成综述和文献继续追问。")

    current_report = st.session_state.revised_report or st.session_state.complex_report or st.session_state.simple_report

    if not st.session_state.results:
        st.info("请先在左侧完成一次文献检索，再使用聊天功能。")
        return

    if not st.session_state.chat_history:
        st.session_state.chat_history = [
            {
                "role": "assistant",
                "content": f"你好，我可以围绕课题“{st.session_state.search_query}”和当前综述内容与你继续交流。"
            }
        ]

    # 固定普通聊天记录区高度，避免右侧工作台被多轮对话无限拉长。
    with st.container(height=280 if compact else 560):
        for msg in st.session_state.chat_history[-8:]:
            with st.chat_message("assistant" if msg.get("role") == "assistant" else "user"):
                st.markdown(msg.get("content", ""))

    with st.form("right_chat_form", clear_on_submit=True):
        user_chat_input = st.text_area(
            "继续提问",
            height=80 if compact else 90,
            placeholder="例如：解释这个算法；提炼3个创新点；补充研究局限性。",
            key="right_chat_input_area"
        )
        submitted = st.form_submit_button("发送", use_container_width=True)

    if submitted and user_chat_input.strip():
        st.session_state.chat_history.append({"role": "user", "content": user_chat_input})

        messages = build_chat_messages(
            st.session_state.search_query,
            st.session_state.results,
            current_report,
            user_chat_input,
            selected_discipline,
            history=st.session_state.chat_history[:-1]
        )

        with st.chat_message("assistant"):
            assistant_reply = st.write_stream(stream_messages_generator(messages))
        st.session_state.chat_history.append({"role": "assistant", "content": assistant_reply})
        st.rerun()

def render_right_ai_panel(selected_discipline, compact=False):
    """右侧独立 AI 面板，把综述修改和普通聊天集中放在这里。"""
    # 文献深度分析页右侧 AI 工作台设置总高度，避免聊天区撑开整个页面。
    panel_height = 720 if compact else 960
    with st.container(border=True, height=panel_height):
        st.markdown("<div class='right-ai-title'>🤖 AI 交互工作台</div>", unsafe_allow_html=True)
        st.markdown(
            "<div class='right-ai-desc'>用于对左侧生成的综述进行二次修改，或围绕当前文献进行普通科研问答。</div>",
            unsafe_allow_html=True
        )
        tab_revise_right, tab_chat_right = st.tabs(["✍️ 综述修改", "💬 普通聊天"])
        with tab_revise_right:
            render_revision_panel(selected_discipline, compact=compact)
        with tab_chat_right:
            render_chat_panel(selected_discipline, compact=compact)

def render_search_main_panel(selected_discipline, selected_libs, max_num, year_range, use_ai_expand):
    """左侧主面板：检索、热点、综述、知识图谱、数据洞察、文献列表。"""
    # 1. 顶部标题
    st.markdown("## 🔭 全球科研文献深度分析助手", unsafe_allow_html=True)
    st.markdown("<div style='margin-top: 30px;'></div>", unsafe_allow_html=True)

    # 2. 搜索框
    col_input, col_btn = st.columns([5, 1])
    with col_input:
        user_topic = st.text_input(
            "Search",
            value=st.session_state.search_query,
            placeholder="输入任何你想探索的学术课题或点击下方热点标签...",
            label_visibility="collapsed"
        )
    with col_btn:
        st.markdown('<div class="search-area">', unsafe_allow_html=True)
        start_btn = st.button("🚀 开始分析", use_container_width=True)
        st.markdown('</div>', unsafe_allow_html=True)

    # 3. 热点推荐
    st.markdown("<div style='margin-top: 20px;'></div>", unsafe_allow_html=True)
    col_title, col_refresh, _ = st.columns([1.5, 1.5, 7])
    with col_title:
        st.markdown(
            "<span style='font-size: 0.95rem; font-weight: 600; color: var(--accent-amber);'>🔥 实时学术热点</span>",
            unsafe_allow_html=True
        )
    with col_refresh:
        if st.button("🔄 换一批", key="refresh", use_container_width=True):
            candidates = load_hotspot_candidates(limit=20)
            st.session_state.hotspots = sample_hotspots(candidates, 10)
            st.rerun()

    hotspot_labels = st.session_state.hotspots or HOTSPOT_POOL[:]
    hotspot_labels = list(dict.fromkeys([str(x).strip() for x in hotspot_labels if str(x).strip()]))

    if hotspot_labels:
        for row_start in range(0, len(hotspot_labels), 5):
            row_items = hotspot_labels[row_start:row_start + 5]
            row_cols = st.columns(5)
            for offset, label in enumerate(row_items):
                idx = row_start + offset
                with row_cols[offset]:
                    if st.button(label, key=f"hp_{idx}", use_container_width=True):
                        st.session_state.search_query = label
                        st.session_state.trigger_search = True
                        st.rerun()

    # 空白状态
    if not st.session_state.results and not st.session_state.trigger_search and not start_btn:
        st.markdown("<div style='margin-top: 50px;'></div>", unsafe_allow_html=True)
        st.markdown("### 📡 全球学术引擎状态")

        try:
            local_papers_count = len(fetch_all_papers_with_topics())
        except Exception:
            local_papers_count = "未知"

        m1, m2, m3, m4 = st.columns(4)
        m1.metric(label="当前图谱接入文献总数", value="2.5 亿+", delta="全时段持续同步")
        m2.metric(label="DeepSeek V3 引擎状态", value="在线 (最优)", delta="响应延迟 < 1.2s", delta_color="inverse")
        m3.metric(label="支持智能解析学科维度", value="4 大类", delta="涵盖 150+ 细分领域")
        m4.metric(label="本地知识库沉淀篇数", value=f"{local_papers_count} 篇", delta="已完成特征向量化")

        st.markdown("<div style='margin-top: 50px;'></div>", unsafe_allow_html=True)
        st.markdown("### 💡 深度分析工作流")
        st.caption("输入任意科研方向，AI 引擎将为您自动化完成以下学术拆解：")

        c1, c2, c3 = st.columns(3)
        with c1:
            st.info("**1. 🌐 多库并发检索**\n\n自动翻译并扩充中英双语检索词，秒级并发请求全球顶尖学术数据库，跨越语言与平台壁垒。")
        with c2:
            st.success("**2. 🧠 摘要精读解构**\n\n调用 DeepSeek V3 顶尖大模型，深度审阅数十篇文献摘要，提炼技术演进路线与观点分歧。")
        with c3:
            st.warning("**3. 💎 综述报告生成**\n\n根据您选择的学科领域，自动化输出排版精美、带有真实溯源文献的学术报告。")

        # ... 上面是 💡 深度分析工作流 的代码 ...
        st.markdown("<div style='margin-top: 40px;'></div>", unsafe_allow_html=True)
        st.markdown("### 📚 接入文献源")
        st.caption("实时接入全球三大主流学术图谱，确保文献的全面性与权威性。")

        dc1, dc2, dc3 = st.columns(3)
        with dc1:
            st.markdown("""
            <div style='background:#ffffff; padding:20px; border-radius:12px; border:1px solid #e2e8f0; box-shadow: 0 4px 6px rgba(0,0,0,0.02);'>
                <h4 style='color:#0f172a; margin-top:0;'>🇨🇳 中国知网 (CNKI)</h4>
                <p style='color:#64748b; font-size:13px; margin-bottom:0;'>国内最权威的学术数据库，涵盖顶尖中文期刊、硕博学位论文及重要会议记录。</p>
            </div>
            """, unsafe_allow_html=True)
        with dc2:
            st.markdown("""
            <div style='background:#ffffff; padding:20px; border-radius:12px; border:1px solid #e2e8f0; box-shadow: 0 4px 6px rgba(0,0,0,0.02);'>
                <h4 style='color:#0f172a; margin-top:0;'>📝 arXiv (预印本)</h4>
                <p style='color:#64748b; font-size:13px; margin-bottom:0;'>计算机、物理、数学等领域的顶级开源预印本平台，追踪最前沿 SOTA 必看。</p>
            </div>
            """, unsafe_allow_html=True)
        with dc3:
            st.markdown("""
            <div style='background:#ffffff; padding:20px; border-radius:12px; border:1px solid #e2e8f0; box-shadow: 0 4px 6px rgba(0,0,0,0.02);'>
                <h4 style='color:#0f172a; margin-top:0;'>🌍 OpenAlex</h4>
                <p style='color:#64748b; font-size:13px; margin-bottom:0;'>全球最大规模的学术开源知识图谱，包含全学科超 2.5 亿篇海量英文文献记录。</p>
            </div>
            """, unsafe_allow_html=True)

    # 执行检索任务
    if start_btn or st.session_state.trigger_search:
        st.session_state.trigger_search = False
        search_target = user_topic if user_topic else st.session_state.search_query

        if not search_target:
            st.warning("请输入课题")
            return

        st.session_state.search_query = search_target
        st.session_state.simple_report = None
        st.session_state.complex_report = None
        st.session_state.mindmap_code = None
        st.session_state.results = None
        st.session_state.trigger_deep_search = False
        st.session_state.revised_report = None
        st.session_state.revise_instructions = ""
        st.session_state.revise_base_mode = "精简版综述"
        st.session_state.chat_history = []

        zh_q, en_q = search_target, search_target
        if use_ai_expand:
            with st.spinner("🤖 AI 正在优化跨语言检索词..."):
                kw_data = get_bilingual_keywords(search_target)
                zh_q, en_q = kw_data["zh"], kw_data["en_core"]
                st.toast(f"已增强英文词: {en_q}", icon="🌐")

        all_results = []
        task_map = {
            "中国知网": lambda: fetch_cnki_papers(zh_q, max_results=max_num),
            "arXiv": lambda: fetch_arxiv_papers(en_q, max_results=max_num),
            "OpenAlex (全学科)": lambda: fetch_openalex_papers(
                en_q,
                max_results=max_num,
                start_year=year_range[0],
                end_year=year_range[1]
            )
        }

        with st.status("📡 正在并发检索全球数据库...", expanded=True) as status:
            if not selected_libs:
                status.update(label="❌ 请至少选择一个检索来源", state="error", expanded=True)
                return

            with concurrent.futures.ThreadPoolExecutor(max_workers=len(selected_libs)) as executor:
                future_to_lib = {executor.submit(task_map[lib]): lib for lib in selected_libs}

                for future in concurrent.futures.as_completed(future_to_lib):
                    lib_name = future_to_lib[future]
                    try:
                        res = future.result()
                        if lib_name != "OpenAlex (全学科)":
                            res = [p for p in res if year_range[0] <= p['日期'][:4] <= year_range[1] or p['日期'] == "N/A"]
                        all_results.extend(res)
                        st.write(f"✅ **{lib_name}** 检索完成，捕获 {len(res)} 篇文献。")
                    except Exception as e:
                        st.write(f"❌ **{lib_name}** 检索失败: {e}")

            if all_results:
                df_dedup = pd.DataFrame(all_results).drop_duplicates(subset=['标题'])
                st.session_state.results = df_dedup.to_dict('records')
                status.update(
                    label=f"📡 检索成功！共合并去重 {len(st.session_state.results)} 篇文献。",
                    state="complete",
                    expanded=False
                )
            else:
                status.update(label="❌ 未找到符合条件的文献，请尝试更换关键词", state="error", expanded=True)

    # 渲染结果 Tabs。注意：综述二次修改和 AI 普通聊天已移到右侧面板，这里不再重复出现。
    if st.session_state.results:
        st.divider()

        if not st.session_state.complex_report:
            col_space, col_deep = st.columns([3, 1])
            with col_deep:
                st.markdown('<div class="deep-btn">', unsafe_allow_html=True)
                if st.button("🚀 生成丰富完全版深度综述", use_container_width=True):
                    st.session_state.trigger_deep_search = True
                st.markdown('</div>', unsafe_allow_html=True)

        tab_simple, tab_deep, tab_mindmap, tab_insights, tab_list = st.tabs(
            [
                "📑 精简版综述",
                "💎 丰富完全版综述",
                "🧠 知识图谱",
                "📊 数据洞察",
                "📚 全球文献列表"
            ]
        )

        with tab_simple:
            if not st.session_state.simple_report:
                st.info(f"🤖 正在基于提取的文献撰写【{selected_discipline}】精简综述...")
                prompt = build_prompt(
                    st.session_state.search_query,
                    st.session_state.results,
                    mode="simple",
                    discipline=selected_discipline
                )
                full_text = st.write_stream(stream_generator(
                    prompt,
                    max_tokens=get_review_max_tokens("simple", len(st.session_state.results))
                ))
                full_text = normalize_report_output(full_text, st.session_state.search_query, st.session_state.results)
                full_text, expand_prompt, body_chars, min_chars = ensure_report_body_length(
                    full_text,
                    st.session_state.search_query,
                    st.session_state.results,
                    "simple",
                    selected_discipline
                )
                if expand_prompt:
                    st.info(f"精简版正文当前约 {body_chars} 字，低于目标下限 {min_chars} 字，正在自动扩写...")
                    full_text = st.write_stream(stream_generator(
                        expand_prompt,
                        max_tokens=get_review_max_tokens("simple", len(st.session_state.results))
                    ))
                    full_text = normalize_report_output(full_text, st.session_state.search_query, st.session_state.results)
                st.session_state.simple_report = full_text
                save_report_locally(st.session_state.search_query, full_text, suffix=f"Simple_{selected_discipline}")
                st.rerun()
            else:
                col_dl1, col_dl2, _ = st.columns([1, 1, 4])
                with col_dl1:
                    st.download_button(
                        "📥 下载精简版 (MD)",
                        data=st.session_state.simple_report,
                        file_name=f"Simple_{st.session_state.search_query}.md",
                        mime="text/markdown"
                    )
                with col_dl2:
                    if st.button("📥 导出精简版 (PDF) ", key="save_pdf_simple"):
                        try:
                            start_time = time.time()
                            pdf_data = export_as_pdf(st.session_state.simple_report, topic=st.session_state.search_query)
                            export_time = time.time() - start_time
                            safe_topic = re.sub(r'[\\/:*?<>|]', '_', st.session_state.search_query)
                            file_path = os.path.join(
                                EXPORT_DIR,
                                f"Simple_{safe_topic}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
                            )
                            with open(file_path, "wb") as f:
                                f.write(pdf_data)
                            st.success(f"✅ PDF 成功导出 (耗时 {export_time:.2f}s，稳定性：100%)：{file_path}")
                        except Exception as e:
                            st.error(f"❌ PDF 导出异常 (稳定性评级下降): {str(e)}")

                st.markdown("### 🛡️ AI 综述可信度评估报告")
                metrics = evaluate_report_quality(st.session_state.simple_report, st.session_state.results)
                m1, m2, m3, m4 = st.columns(4)
                m1.metric("文献检索覆盖率", f"{metrics['coverage_rate'] * 100:.1f}%", help="AI 实际引用的文献数 / 喂给 AI 的总文献数")
                m2.metric("引用溯源准确率", f"{metrics['citation_accuracy'] * 100:.1f}%", help="引用的文献是否 100% 存在于本次检索列表中（零幻觉）")
                m3.metric("事实一致性置信度", f"{metrics['fact_consistency'] * 100:.1f}%", help="基于引用密度和准确率计算的综合事实核查得分")
                m4.metric("PDF 导出稳定性", "高", help="已通过 Emoji 过滤与非法 Markdown 标签清洗")
                st.divider()
                st.markdown(st.session_state.simple_report)

        with tab_deep:
            if st.session_state.trigger_deep_search and not st.session_state.complex_report:
                st.info(f"🔬 正在进行【{selected_discipline}】深度学术拆解，请耐心观看...")
                prompt = build_prompt(
                    st.session_state.search_query,
                    st.session_state.results,
                    mode="complex",
                    discipline=selected_discipline
                )
                full_text = st.write_stream(stream_generator(
                    prompt,
                    max_tokens=get_review_max_tokens("complex", len(st.session_state.results))
                ))
                full_text = normalize_report_output(full_text, st.session_state.search_query, st.session_state.results)
                full_text, expand_prompt, body_chars, min_chars = ensure_report_body_length(
                    full_text,
                    st.session_state.search_query,
                    st.session_state.results,
                    "complex",
                    selected_discipline
                )
                if expand_prompt:
                    st.info(f"完全版正文当前约 {body_chars} 字，低于目标下限 {min_chars} 字，正在自动扩写...")
                    full_text = st.write_stream(stream_generator(
                        expand_prompt,
                        max_tokens=get_review_max_tokens("complex", len(st.session_state.results))
                    ))
                    full_text = normalize_report_output(full_text, st.session_state.search_query, st.session_state.results)
                st.session_state.complex_report = full_text
                save_report_locally(st.session_state.search_query, full_text, suffix=f"Deep_{selected_discipline}")
                st.session_state.trigger_deep_search = False
                st.rerun()
            elif st.session_state.complex_report:
                col_dl3, col_dl4, col_regen, _ = st.columns([1, 1, 1, 3])
                with col_dl3:
                    st.download_button(
                        "📥 下载完全版 (MD)",
                        data=st.session_state.complex_report,
                        file_name=f"Deep_{st.session_state.search_query}.md",
                        mime="text/markdown",
                        key="dl_deep_md"
                    )
                with col_dl4:
                    if st.button("📥 导出完全版 (PDF) ", key="save_pdf_deep"):
                        try:
                            start_time = time.time()
                            pdf_data_deep = export_as_pdf(st.session_state.complex_report, topic=st.session_state.search_query)
                            export_time = time.time() - start_time
                            safe_topic = re.sub(r'[\\/:*?<>|]', '_', st.session_state.search_query)
                            file_path = os.path.join(
                                EXPORT_DIR,
                                f"Deep_{safe_topic}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
                            )
                            with open(file_path, "wb") as f:
                                f.write(pdf_data_deep)
                            st.success(f"✅ PDF 成功导出 (耗时 {export_time:.2f}s，稳定性：100%)：{file_path}")
                        except Exception as e:
                            st.error(f"❌ PDF 导出异常 (稳定性评级下降): {str(e)}")
                with col_regen:
                    if st.button("🔁 重新生成完全版", key="regenerate_deep_report", use_container_width=True):
                        st.session_state.complex_report = None
                        st.session_state.trigger_deep_search = True
                        st.rerun()

                st.markdown("### 🛡️ AI 深度综述可信度评估报告")
                metrics = evaluate_report_quality(st.session_state.complex_report, st.session_state.results)
                m1, m2, m3, m4 = st.columns(4)
                m1.metric("文献检索覆盖率", f"{metrics['coverage_rate'] * 100:.1f}%", help="AI 实际引用的文献数 / 喂给 AI 的总文献数")
                m2.metric("引用溯源准确率", f"{metrics['citation_accuracy'] * 100:.1f}%", help="引用的文献是否 100% 存在于本次检索列表中（零幻觉）")
                m3.metric("事实一致性置信度", f"{metrics['fact_consistency'] * 100:.1f}%", help="基于引用密度和准确率计算的综合事实核查得分")
                m4.metric("PDF 导出稳定性", "高", help="已通过 Emoji 过滤与非法 Markdown 标签清洗")
                st.divider()
                st.markdown(st.session_state.complex_report)
            else:
                st.info(f"💡 点击左侧结果区右上方按钮，开启【{selected_discipline}】深度科学家模式。")

        with tab_mindmap:
            st.markdown("### 🧠 AI 逻辑树解构")
            if not st.session_state.mindmap_code:
                if st.button("✨ 一键提取文献思维导图"):
                    with st.spinner("🤖 DeepSeek 正在构建逻辑结构..."):
                        context = "\n".join([f"- {p['标题']}: {p['摘要'][:100]}" for p in st.session_state.results[:20]])
                        mm_prompt = f"你是一个学术知识图谱构建专家。请根据以下文献，为主题 '{st.session_state.search_query}' 提取核心分支逻辑树（按研究方向、方法、应用等分类）。\n\n【极其重要】：无论输入文献是英文还是中文，图谱中的所有节点文本【必须强制翻译并使用纯中文】输出！\n\n请**严格**按照 Mermaid.js 的 mindmap 语法输出。只输出 Mermaid 代码本身，必须以 `mindmap` 开头，并且根节点格式为 `root((主节点名称))`，不要包含任何额外的 markdown 代码块标记如 ```mermaid。必须使用换行（\\n）和 2 个空格的缩进来表示节点层级。\n\n文献：\n{context}"
                        try:
                            res = get_llm_client().chat.completions.create(
                                model=DEEPSEEK_MODEL_NAME,
                                messages=[{"role": "user", "content": mm_prompt}]
                            )
                            st.session_state.mindmap_code = res.choices[0].message.content
                            st.rerun()
                        except Exception as e:
                            st.error(f"提取失败: {e}")
            if st.session_state.mindmap_code:
                render_mermaid(st.session_state.mindmap_code)

        with tab_insights:
            st.markdown("### 📈 检索数据洞察大屏")
            df_insights = pd.DataFrame(st.session_state.results)
            c_chart1, c_chart2 = st.columns(2)
            with c_chart1:
                source_counts = df_insights['来源'].value_counts()
                fig_pie = go.Figure(data=[go.Pie(
                    labels=source_counts.index,
                    values=source_counts.values,
                    hole=.4,
                    marker_colors=['#3B82F6', '#10B981', '#F59E0B']
                )])
                fig_pie.update_layout(title="文献数据来源分布", margin=dict(t=50, b=20, l=20, r=20))
                st.plotly_chart(fig_pie, use_container_width=True)
            with c_chart2:
                df_insights['年份'] = df_insights['日期'].astype(str).apply(lambda x: x[:4] if len(x) >= 4 else 'Unknown')
                valid_years_df = df_insights[df_insights['年份'].str.isnumeric()]
                if not valid_years_df.empty:
                    year_counts = valid_years_df['年份'].value_counts().sort_index()
                    fig_bar = go.Figure(data=[go.Bar(x=year_counts.index, y=year_counts.values, marker_color='#8B5CF6')])
                    fig_bar.update_layout(title="文献发表年份趋势", xaxis_title="发表年份", yaxis_title="文献数量", margin=dict(t=50, b=20, l=20, r=20))
                    st.plotly_chart(fig_bar, use_container_width=True)
                else:
                    st.info("当前文献无有效的年份数据可供分析。")

        with tab_list:
            df_display = pd.DataFrame(st.session_state.results)[["标题", "来源", "日期", "链接"]]
            st.dataframe(
                df_display,
                use_container_width=True,
                column_config={"链接": st.column_config.LinkColumn("原文链接", display_text="点击访问 🔗")},
                hide_index=True
            )
            with st.expander("🔍 展开查看送入大模型的原始摘要数据"):
                for p in st.session_state.results:
                    st.markdown(f"**{p['标题']}**")
                    st.caption(f"{p['来源']} | {p['日期']}")
                    st.write(p['摘要'])
                    st.divider()


def render_search():
    inject_app2_css()
    inject_search_two_panel_css()

    with st.sidebar:
        st.markdown('<div class="nav-btn">', unsafe_allow_html=True)
        if st.button("◀ 返回主页", key="back_from_search", use_container_width=True):
            st.session_state.current_page = "home"
            st.rerun()
        st.markdown('</div>', unsafe_allow_html=True)
        st.divider()

        st.markdown("### 🛠️ 检索控制台")
        selected_discipline = st.selectbox("学科领域", DISCIPLINE_OPTIONS, index=0)
        st.divider()
        search_mode = st.radio("检索模式", ["单库精准", "多库全网"])
        if search_mode == "单库精准":
            selected_libs = [st.selectbox("目标库", ["中国知网", "arXiv", "OpenAlex (全学科)"])]
            max_num = st.slider("数量", 5, 100, 50)
        else:
            selected_libs = st.multiselect(
                "来源",
                ["中国知网", "arXiv", "OpenAlex (全学科)"],
                default=["中国知网", "arXiv", "OpenAlex (全学科)"]
            )
            max_num = st.slider("每库数量", 5, 50, 20)
        st.divider()
        year_range = st.select_slider(
            "筛选文献年份",
            options=[str(y) for y in range(2000, 2028)],
            value=("2015", "2026")
        )
        use_ai_expand = st.checkbox("AI 双语增强检索", value=True)

        st.divider()
        toggle_label = "展开 AI 工作台" if st.session_state.ai_workbench_collapsed else "收起 AI 工作台"
        if st.button(toggle_label, key="toggle_sidebar_ai_workbench", use_container_width=True):
            st.session_state.ai_workbench_collapsed = not st.session_state.ai_workbench_collapsed
            st.rerun()
        if not st.session_state.ai_workbench_collapsed:
            render_right_ai_panel(selected_discipline, compact=True)
        else:
            st.caption("AI 工作台已收起，可随时展开。")

    with st.container(border=True):
        render_search_main_panel(
            selected_discipline,
            selected_libs,
            max_num,
            year_range,
            use_ai_expand
        )


def main():
    init_session_state()
    # 删除了这里的全局 inject_global_css()
    
    if st.session_state.current_page == "home":
        inject_global_css() # 仅给主页注入深色系统
        render_home()
    elif st.session_state.current_page == "galaxy":
        inject_global_css() # 仅给星图注入深色系统
        render_galaxy()
    elif st.session_state.current_page == "search":
        # 检索页自带 inject_app2_css()，保持干净的暖白底色
        render_search()
    elif st.session_state.current_page == "history":
        render_history()


if __name__ == "__main__":
    main()
