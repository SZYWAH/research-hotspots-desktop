# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

科研热点分析系统 (Research Hotspot Analysis System) — an end-to-end NLP pipeline that crawls academic papers, performs semantic clustering to discover research hotspots, analyzes temporal evolution trends, and auto-generates Chinese survey reviews using LLMs.

## Architecture (Processing Pipeline)

```
arXiv/OpenAlex Crawling → Data Cleaning → Semantic Clustering → LLM Naming → LLM Review Generation → Streamlit Visualization
```

### Pipeline Scripts (execute in order)

```bash
# 1. Crawl papers from arXiv and OpenAlex APIs
python arxiv_crawler.py
python openalex_crawler.py

# 2. Clean & deduplicate (by DOI, title, remove empty abstracts, strip HTML)
python cleaner.py

# 3. Semantic clustering (SentenceTransformer → BERTopic → UMAP 3D → HDBSCAN → trend analysis)
python chuli2.py

# 4. Generate Chinese hotspot names via LLM
python namer.py

# 5. Generate long-form survey reviews via LLM
python review5.py

# 6. Launch Streamlit frontend
streamlit run app17.py
```

### Quick Docker Deploy

```bash
docker compose up -d --build
# Access at http://localhost:8501
```

### Local Dev Setup

```bash
pip install -r requirements-base.txt
pip install -r requirements-ml.txt
cp .env.example .env  # then edit with your keys
streamlit run app17.py
```

## Key Scripts & Responsibilities

| Script | Role | NLP Techniques |
|---|---|---|
| `arxiv_crawler.py` | arXiv API crawling by arXiv category | — |
| `openalex_crawler.py` | OpenAlex API crawling by keyword | — |
| `cleaner.py` | Data cleaning & deduplication | HTML stripping, text normalization |
| `chuli2.py` | Semantic clustering & trend analysis | SentenceTransformer, BERTopic, HDBSCAN, UMAP, linear regression |
| `namer.py` | Hotspot naming via LLM | DeepSeek API prompt engineering |
| `review5.py` | Survey review generation via LLM | DeepSeek API, discipline-aware writing style control |
| `app17.py` | Streamlit frontend | Plotly 3D visualization, PDF export |
| `browser.py` | Selenium driver wrapper | — |
| `config.py` | Central config + DB connection pool | — |

## Database Schema (MySQL, 4 tables)

- **papers** — Raw paper data (id, source, title, abstract, authors, categories, field, year, url, doi); ~21k records
- **hotspots** — Discovered research hotspots (field, topic_id, topic_label, keywords, paper_count, trend_status, evolution_json, title_cn, summary_cn)
- **paper_topics** — Paper-to-hotspot mapping with 3D coordinates (paper_id, field, topic_id, x, y, z)
- **hotspot_reviews** — Generated survey reviews (field, topic_id, review_cn)

## Configuration

All config via `.env` file:

- **DB**: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
- **LLM**: DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, DEEPSEEK_MODEL_NAME
- **Crawler**: ARXIV_REQUEST_INTERVAL, ARXIV_MAX_RESULTS_PER_CAT, etc.
- **Paths**: FONT_PATH, MERMAID_JS_PATH, CHROME_DRIVER_PATH, EXPORT_DIR

10 disciplines configured: Artificial Intelligence, Quantum Physics, Computational Biology, Econometrics, Astrophysics, Statistics, Condensed Matter, High Energy Physics, Algebraic Geometry, Medical Imaging.

## Tech Stack

- **Python 3.10** + Streamlit (frontend)
- **PyMySQL** + DBUtils (database)
- **sentence-transformers + BERTopic + UMAP + HDBSCAN** (NLP clustering)
- **scipy** (trend analysis via linear regression)
- **DeepSeek API** via openai SDK (LLM naming & review generation)
- **Selenium + Chromium** (PDF export via browser rendering)
- **Docker** (deployment: mysql:8.0 + python:3.10-slim)
