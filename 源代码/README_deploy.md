# 部署说明

本目录提供当前项目的可交付源码、基础部署文件和运行依赖。

## 当前目录包含

- `app17.py`：Streamlit 主程序
- `config.py`：统一读取 `.env` 配置并创建数据库连接池
- `arxiv_crawler.py`、`openalex_crawler.py`：文献采集脚本
- `cleaner.py`：数据清洗与去重
- `chuli2.py`：热点聚类、趋势分析、3D 坐标生成
- `namer.py`：热点中文命名与简介生成
- `review5.py`：热点综述生成
- `browser.py`：Selenium 浏览器驱动封装
- `Dockerfile`、`docker-compose.yml`：容器部署文件
- `init.sql`：数据库初始化脚本
- `.env.example`：环境变量模板

## 部署前确认

请确认源码目录中存在以下文件或目录：

- `app17.py`
- `config.py`
- `requirements_docker_cnki.txt`
- `assets/fonts/SIMHEI.ttf`
- `assets/js/mermaid.min.js`
- `browser.py`

## 环境变量

第一次部署时，先复制模板：

```bash
cp .env.example .env
```

然后填写你自己的配置项，至少包括：

- `DB_HOST`
- `DB_PORT`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`
- `DEEPSEEK_API_KEY`
- `DEEPSEEK_BASE_URL`
- `DEEPSEEK_MODEL_NAME`

## Docker 部署

当前推荐使用 `docker compose` 启动：

```bash
docker compose up -d --build
```

启动完成后访问：

```text
http://localhost:8501
```

端口说明：

- Web 前端：`8501`
- MySQL 映射端口：`3307`

## 本地运行

如果不使用 Docker，可以在本地安装依赖后运行：

```bash
pip install -r requirements-base.txt
pip install -r requirements-ml.txt
streamlit run app17.py
```

## 数据初始化建议

- 若只需要创建数据库结构，执行 `init.sql`
- 若要直接展示已有结果，导入项目根目录中的完整 `数据集.sql`

## 典型运行顺序

若从头复现实验流程，可按如下顺序执行：

```bash
python arxiv_crawler.py
python openalex_crawler.py
python cleaner.py
python chuli2.py
python namer.py
python review5.py
streamlit run app17.py
```

## 说明

- 当前源码目录以 `docker-compose.yml` 为主要部署入口。
- `Dockerfile` 已与当前源码结构保持一致。
- `data/exports/` 中保存的是运行输出，不是数据库初始化文件。
