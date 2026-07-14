# V2 Architecture

## 目标

V2 将 V1 桌面端升级为更高质感的科研工作台：视觉采用 Graphite + Cobalt Blue，功能上接入 Python worker 雏形，并补齐本地导入、历史报告导入、流水线触发、报告筛选和文献批量操作。

## 视觉系统

- 背景：Graphite 深石墨灰，避免纯黑和霓虹渐变。
- 面板：分层冷灰，使用细边框表达层级。
- 主色：Cobalt Blue，仅用于主按钮、选中态、焦点态和关键进度。
- 状态色：Amber 表示提醒，Rose 表示危险操作。
- 圆角：控制在 8px 左右，贴近桌面工具而不是营销页。

## 功能分层

- 前端 UI：`src/App.tsx`，负责总览、文献工作台、科研星图、热点库、报告库、流水线和设置页。
- 本地数据层：`src/data/researchStore.ts`，负责 IndexedDB 的文献、热点、报告、AI 设置和流水线任务状态。
- AI 服务层：`src/ai/deepseek.ts`，负责检索词优化、简版综述、深版综述和修订版综述。
- 文献检索层：`src/lib/searchSources.ts`，负责 OpenAlex / arXiv 检索。
- 本地导入层：`src/lib/importers.ts`，负责 CSV / JSON 文献导入解析。
- 桌面后端：`src-tauri/src/lib.rs`，负责 Markdown 导出、历史报告扫描和 Python worker 调用。
- Python worker 层：`workers/cleaner_worker.py`，从 `cleaner.py` 的清洗去重思路拆出独立任务入口。

## Worker 能力

当前 V2 worker 支持：

- 标题与摘要 HTML 清理
- 空标题/空摘要移除
- DOI 去重
- 题名归一化去重
- 返回清洗前数量、清洗后数量、移除 ID 和清洗后文献数组

## 验收

- `pnpm build` 通过
- `pnpm tauri build` 通过
- 产出 Windows exe
- 桌面端可触发 Python 清洗 worker
- 可导入 CSV / JSON 文献
- 可导入 `data/exports` 下的历史 Markdown 报告
