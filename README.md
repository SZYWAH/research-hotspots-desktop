# Research Hotspots Desktop

[GitHub 主页](https://github.com/SZYWAH) · [Windows 测试版安装包](https://github.com/SZYWAH/research-hotspots-desktop/releases/tag/v0.22.0-beta.1) · [论文导入格式](源代码/docs/PAPER_IMPORT_FORMAT.md) · [版本说明](源代码/docs/v0.22-release-security.md)

本地优先的科研热点分析桌面工作台，将文献导入、数据清洗、热点建模、演化分析、科研星图与证据报告连接在一起，帮助从本地文献资料中梳理研究线索。

## 当前版本与下载

**v0.22.0-beta.1 · Windows x64 测试版**。版本信息见 [package.json](源代码/package.json)，发布产物见上方 Release。

| 安装包 | 适用场景 |
| --- | --- |
| **Full** | 包含默认 V20 数据快照，便于体验已有数据与分析结果 |
| **Lite** | 创建空库，适合导入自己的文献资料 |

下载时请同时查看 Release 中的版本说明和 `SHA256SUMS.txt`。当前安装包未签名，仍处于测试阶段。

## 主要能力

- 本地文献导入、检索、清洗与去重。
- 热点建模、时间演化分析与交互式科研星图。
- 代表性论文、引用与分析来源的证据追溯。
- AI 辅助研究报告与文件导出。
- 本地数据库、备份与恢复。
- 受监督研究 Agent：按工具范围与动作审批执行本地研究流程。

当前测试版不包含在线学术来源和校园图书馆连接器。文献来源范围以实际导入的数据为准，具体边界见 [v0.22 发布说明](源代码/docs/v0.22-release-security.md)。

## 技术栈

- 桌面端：Tauri 2、Rust
- 前端：React、TypeScript、Vite
- 可视化：Three.js、React Three Fiber
- 大型文献库：本地 SQLite
- 轻量前端状态：IndexedDB
- Python：保留兼容 Worker 与早期实验脚本，当前主要数据操作由 Rust / Tauri 处理

## 从源码运行

当前桌面源码位于 **[源代码/](源代码/)**。开发 Windows 桌面版需要 Node.js / pnpm、Rust 与 Tauri 所需的 Windows 构建环境。

```powershell
git clone https://github.com/SZYWAH/research-hotspots-desktop.git
Set-Location research-hotspots-desktop
Set-Location 源代码
pnpm install
pnpm tauri:dev
```

仅运行前端开发预览：

```powershell
pnpm dev
```

前端构建与 Rust 测试：

```powershell
pnpm build
cargo test --manifest-path src-tauri/Cargo.toml
```

构建 Windows 安装包：

```powershell
pnpm release:windows:full
pnpm release:windows:lite
```

具体构建与审计脚本以 [package.json](源代码/package.json) 为准；Windows 安装包的完整验收要求见版本说明。

## 仓库导航

| 位置 | 内容 |
| --- | --- |
| [源代码/src/](源代码/src/) | React 工作台与交互界面 |
| [源代码/src-tauri/](源代码/src-tauri/) | Rust 后端、本地数据库与桌面封装 |
| [源代码/docs/PAPER_IMPORT_FORMAT.md](源代码/docs/PAPER_IMPORT_FORMAT.md) | 论文导入格式 |
| [源代码/docs/agent-v0.22-contract.md](源代码/docs/agent-v0.22-contract.md) | 研究 Agent 的功能契约 |
| [源代码/docs/v0.22-release-security.md](源代码/docs/v0.22-release-security.md) | 当前测试版边界与发布说明 |
| [源代码/docs/V20_FINAL_HANDOFF.md](源代码/docs/V20_FINAL_HANDOFF.md) | V20 阶段交接记录 |
| [源代码/docs/LEGACY.md](源代码/docs/LEGACY.md) | 早期运行路径与迁移说明 |

## 早期实现与课程材料

仓库仍保留 Streamlit、Docker、MySQL 和早期 BERTopic 实验相关文件。它们用于追溯课程研究与迁移过程，**不是当前桌面应用的默认启动方式**。历史部署说明见 [部署与使用说明.md](部署与使用说明.md)。

相关课程研究项目：[Whu_Big_Data_Analysis_in_Public_Administration](https://github.com/SZYWAH/Whu_Big_Data_Analysis_in_Public_Administration)，主要保留多源采集、BERTopic / LDA 方法对比和课程实验结果。

