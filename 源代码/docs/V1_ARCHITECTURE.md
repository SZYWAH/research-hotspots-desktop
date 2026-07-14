# V1 Architecture

## 目标

V1 交付一个可运行的 Windows 桌面端科研热点分析工作台，运行形态为 Tauri exe，不使用 Streamlit、Docker 或 MySQL 作为最终运行方式。

## 分层

- 依赖库：`package.json` 与 `src-tauri/Cargo.toml` 分别管理前端依赖和 Rust/Tauri 依赖。
- 前端界面：`src/App.tsx` 与 `src/index.css` 提供总览、文献工作台、科研星图、热点库、报告库、流水线和设置页面。
- 本地数据层：`src/data/researchStore.ts` 使用 IndexedDB 保存文献、热点、报告和 AI 设置。
- AI 服务层：`src/ai/deepseek.ts` 通过 OpenAI-compatible chat completions 接口生成检索词、简版综述、深版综述和修订版综述。
- 文献检索层：`src/lib/searchSources.ts` 接入 OpenAlex 与 arXiv，CNKI 作为后续桌面采集/离线导入接口保留。
- 桌面后端：`src-tauri` 提供窗口配置、插件权限和 Markdown 文件写入命令。
- 旧脚本迁移层：`app17.py`、`cleaner.py`、`chuli2.py`、`namer.py`、`review5.py`、`arxiv_crawler.py`、`openalex_crawler.py` 保留为后续 Python worker/sidecar 的迁移基础。

## 依赖库

- 桌面运行：`@tauri-apps/api`、`@tauri-apps/plugin-dialog`、`@tauri-apps/plugin-opener`
- 前端框架：`react`、`react-dom`
- 构建工具：`vite`、`@vitejs/plugin-react`、`typescript`
- 样式系统：`tailwindcss`、`postcss`、`autoprefixer`
- 动效：`animejs`
- 图标：`lucide-react`
- 本地数据库：`idb`
- Rust/Tauri 后端：`tauri`、`tauri-build`、`tauri-plugin-dialog`、`tauri-plugin-opener`、`serde`、`serde_json`

## 依赖复用

- 不复制其他项目的 `node_modules`。
- 前端包通过 `pnpm` 的共享 store `D:/wenjian/Desktop/.pnpm-store` 复用。
- Rust/Tauri crate 通过 Cargo 缓存复用，当前项目只重新编译自身桌面壳。
