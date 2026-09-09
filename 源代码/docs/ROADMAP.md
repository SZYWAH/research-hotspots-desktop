# 科研 Agent 路线图

## 2026-09-09 beta.4 稳定化门已完成

本门位于 M3 收口与 M5 发布工程预备之间，不进入 M4 功能扩展。提交 `b9868ad`、beta.4 Full Demo 安装包与已安装 EXE 已完成一致性核验；安装版在同一进程完成“一篇论文缺源库→完整库”后无需重启即恢复星图，沉浸/理论双模式、15 秒迟到回调、普通/最大化窗口和正常退出均通过本轮用户观察或原生进程门。R7 静默检查为数据库 `login-required`、统一发现 `ready`、个人图书馆 `login-required` 且无自动认证弹窗；R6 因官方认证不可用保持 `UNVERIFIED_OFFICIAL_AUTH_REQUIRED`。beta.4 验收收口完成，后续小问题另行汇总，不在本轮进入 M4。

证据：[beta.4 安装版热切换验收](./evidence/sidera-beta4-installed-hot-switch-2026-09-09.json)。

## 2026-09-08 beta.3 后续窄修：运行中切库重挂载 Agent 背景

已确认 Full Demo 工作库本身包含完整且 active 的 V20 快照；异常只发生在同一进程先因旧测试库缺少视觉源进入静态降级、再从设置页切换到完整库时。论文数据会立即刷新，但旧 `forceStaticBackground` 状态仍锁存，导致沉浸星图和理论星图继续隐藏；重启同一 beta.3 后恢复。beta.4 已实现规范化库身份、单调 epoch、成功刷新后的静态降级复位及旧回调隔离，并完成安装版原生复验。当前为 `REPRODUCED / WORKAROUND PASS / FIX AUTOMATED PASS / USER-OBSERVED NATIVE HOT-SWITCH PASS`，仍不运行热点重建、不改写 V20 快照。

证据：[运行中切库背景重挂载缺陷](./evidence/sidera-beta3-library-switch-background-remount-2026-09-08.json)。

## 2026-09-08 beta.3 交付门结果

已安装的 `19dfb4e` Full Demo 在复用旧外部论文库时因缺少 V20 视觉源阻断启动；安装目录及内置默认库不是根因。缺源静态兼容窄修已提交为 `af57d1d`，并从该干净提交重建、审计和安装 Full Demo。安装版在开发服务器关闭时可独立进入主界面并正常退出，启动与退出停止门均为 `PASS`。机构静默恢复无自动认证弹窗，但数据库和个人图书馆当前均由官方明确要求重新认证，统一发现为 `ready`；完整免登录按限制交付。安装版多页检索因未重复登录保持 `UNVERIFIED`。下一步只补齐证据提交并普通推送当前分支；不发布 Release、不合并、不强推。

证据：[beta.3 安装启动兼容](./evidence/sidera-beta3-installed-startup-compatibility-2026-09-08.json)。

## 2026-09-07 beta.3 当前停止门

R6 不重新扩展。主窗正常退出已在空闲、机构三项就绪、认证窗打开三种状态通过；同一哈希跨进程会话对照为数据库 SSO `ready`、统一发现超时异常、个人图书馆 `login-required`，因此完整免登录不通过并列为 beta.3 限制。下一停止门是从提交后的干净源码构建并审计 Full beta.3、完成安装版短时验收，再普通推送当前分支；不发布 Release、不合并分支。

证据：[本轮分门记录](./evidence/sidera-beta3-exit-delivery-2026-09-07.json)。

状态：权威路线入口

更新时间：2026-09-09

详细阶段说明见 [科研 Agent 分阶段实施路线](./RESEARCH_AGENT_IMPLEMENTATION_ROADMAP.md)。

## 里程碑

| 里程碑 | 状态 | 目标 |
| --- | --- | --- |
| M1 沉浸式视觉方向确认 | 主壳已通过，局部近景仍有独立验收项 | 交付参数化星河引擎、双背景、统一空间外壳和可追溯证据导航 |
| M2 本地证据与全文阅读 Agent | 进行中（本地 RAG 与开发 015 阅读 R1 已实现） | 默认 Agent 首页完成带本地引用的问答，并建立全文身份、解析、阅读和页码证据基座 |
| M3 空间化联网与机构来源 Agent | 进行中（开发 014-R6 已完成；开发 014-R7 静默恢复与登录失效真值已通过，完整有效会话跨重启待复验） | 以后台连接器产出可解释、可审计的原生候选，统一进入题录审查、受控入库，并建立单篇不可变文档基座；同时确保桌面冷启动与文献工作台在真实动态背景下稳定、低负载闭环 |
| M4 真实星系诞生 | 未开始 | 建模增量真实驱动星系诞生观测站 |
| M5 最终科研 Agent | 未开始 | 完成原生整合、质量、安全和发布验收 |

## 当前顺序：开发 014-R6 已完成；开发 014-R7 已修正登录失效真值，下一门仅为完整有效官方会话的进程重启恢复

- R6 当前为 `IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE STRUCTURED TRANSPORT PASS / NATIVE STRUCTURED PAGINATION PASS / NATIVE SEARCH TRUTH PASS / NATIVE CANCELLATION PASS / NATIVE UX PASS`。中文 40/40 接受 9 页，英文接受 20 页并如实得到 76/100；不足目标不伪造。证据：[R6 结构化分页](./evidence/sidera-014-r6-structured-pagination-2026-09-01.json)。
- R7 当前为 `IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE SILENT LIFECYCLE PASS / NATIVE LOGIN-REQUIRED CLASSIFICATION PASS / NATIVE CAPABILITY TRUTH PASS_BOUNDED / NATIVE PROCESS EXIT PASS / EFFECTIVE SAVED SESSION RESTORE UNVERIFIED / USER EXPERIENCE UNVERIFIED`。个人图书馆检查器及主窗口关闭后的正常退出钩子均已修复；哈希已核验新版 PID 26540 经主窗正常关闭后，精确 PID、全部 Sidera 进程和窗口均消失。此前窗口重开后显示数据库/个人图书馆 `login-required`、统一发现 `ready`，只能证明能力分类；旧进程仍存活，使历史跨重启 `PARTIAL PASS` 解释失效。下一步在内存安全线以上复用现有新版，先建立有效认证前态，再完成同一哈希的新 PID 恢复对照。证据：[R7 静默恢复](./evidence/sidera-014-r7-session-restore-2026-09-01.json)。

- 开发 017-R1 已实现固定 PP-OCRv5 mobile det/rec 的本地按需 OCR、`user_version=5`、原生/OCR 并存、持久来源偏好、单任务取消和迟到隔离；Full/Lite 资源、自动门、隔离原生识别及用户五项验收均通过。当前为 `IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE OCR PASS / USER OCR ACCEPTANCE PASS`。
- 开发 017-R2 已复用现有 Pi/RAG 实现 `selected-anchor / current-page / document-retrieval` 三种逐轮 ReadingContextScope、8 段/32KiB/6 引用限制及 `document-anchor` 页码回跳 UI。唯一一次真实 Provider 问答只读取隔离扫描 fixture 第 2 页 OCR 证据并生成可验证页码；第 3 页点击引用后准确回到第 2 页。显式索引得到 `FTS + E5 · 5 个片段`，三种作用域、125% 选区恢复、侧栏自动避让/恢复和正常/最大化布局均已原生通过。当前为 `IMPLEMENTED / AUTOMATED TECHNICAL PASS / REAL PROVIDER EVIDENCE PASS / NATIVE AGENT UX PASS / USER EXPERIENCE PASS`。证据：[开发 017 原生/自动分门](./evidence/sidera-017-ocr-evidence-agent-2026-08-25.json)。
- 2026-08-27 用户五项验收全部通过。第 2 项曾暴露 OCR 长行检测框向页面左缘过度扩张，导致 125% 蓝色选区与文字不匹配；检测框 padding 已改为按行高计算，阅读器增加按规范化 OCR span 绘制的选择层。隔离第 2 页重新识别后为 97%/9 spans，单行与四行选区自动原生复验均贴合，用户随后确认修复后的选区通过，开发 017 已正式收口。

- 开发 011-R1 已由用户完成真实早期 v14 兼容补全，记为 `NATIVE V14 COMPATIBILITY PASS`。
- 开发 011 的 10 条新增记录已真实提交，论文数 `25463 → 25473`、revision `0 → 1`，记为 `NATIVE CONTROLLED IMPORT PARTIAL PASS`。磁盘账本/审查回执持久化已只读确认；同一真实提交的SQLite副本已通过整次回滚及后续编辑阻断，但桌面重启呈现和可见回滚交互仍未验收。
- 开发 011-R2 已实现提交账本权威化及本地文献显式检索；状态为 `IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE LOCAL SEARCH UNVERIFIED`，退出门为 `NATIVE CONTROLLED IMPORT AND LOCAL SEARCH PASS`。
- 开发 012 / F1a 已实现 `AcquisitionRecord`、`DocumentVersion` 与独立 `documents-v1.sqlite`，支持本地 PDF 和用户触发的单篇机构 PDF 进入 SHA-256 不可变存储。机构路线先由不透明 SourceRecord ID 打开 Rust 解析并脱敏的官方来源，再由用户显式完成单篇 PDF 下载并用不透明完成下载 ID 关联；来源解析、来源导航、下载选择和来源匹配失败都会形成可恢复、可显式重试的逐论文失败获取记录。当前为 `PRODUCT UNVERIFIED`，退出门为 `NATIVE SINGLE-DOCUMENT ACQUISITION PASS`。
- 开发 012-R2 删除了开发 012-R1 的 8 秒自动静态放行。冷启动必须在所选动态背景完成初始化并成功提交首个无 WebGL 错误的真实帧后才能退出启动页；初始化或首帧失败进入显式错误页。当前为 `IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE STARTUP UNVERIFIED`；显式静态诊断入口不计作正常启动 `PASS`。
- 开发 012-R3 已只读确认正式提交后的真实库为 Schema v14、25,473 篇论文、library revision 1、active state 缺失，而 4 个 `ready` 历史快照均停留在 revision 0，最新快照结构完整。P2b 保持“提交后不自动运行热点分析”；R3 只解除沉浸动态背景对 active 指针的不必要硬绑定，并建立显式视觉来源、版本与失败终态契约。当前为 `IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE STARTUP PASS / USER VISUAL ACCEPTANCE UNVERIFIED`。
- 开发 015 已完成不可变 DocumentVersion 的 PDF.js 原生阅读 R1、派生页/段锚点与 FTS、阅读位置恢复及主 WebView 私有 Range 协议。当前状态为 `IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE READER PASS (CODEX VISIBLE DESKTOP) / USER EXPERIENCE UNVERIFIED`；OCR、E5、批注、AI 阅读工具及用户主观体验仍属于后续门。
- 开发 016 已在 015 R1 上实现透明可选 TextLayer、稳定精确页证据、独立持久批注/保存证据库、派生 Schema v4 的 FTS/E5 混合索引及运行中心状态。当前状态为 `IMPLEMENTED / AUTOMATED TECHNICAL PASS / WINDOWS STANDALONE TEST HOST PASS / NATIVE EVIDENCE UX PASS / ROTATED TEXTLAYER FIX NATIVE RETEST PASS / NATIVE INDEX PASS / USER EXPERIENCE PASS`。独立 Windows 冒烟宿主、非旋转页证据主链、本地 E5 双向检索、正常/最大化布局以及两条 12,811 片段任务的暂停/恢复/取消、重启重挂和迟到结果隔离均通过。同一 300 页解析 run 已连续完成活动时关闭、重开后手动停止，4 秒后页数与更新时间不变且未创建重复 run，因此连续组合门为 `PASS`。旋转页 125% 的 TextLayer 命中区域左移已由 quarter-turn 盒尺寸窄修解决，并在最新原生候选中自动拖选通过；用户已进一步确认实际选择、蓝色范围、浮动工具条和主窗口交互正常且无错误提示，开发 017 阻塞解除。
- 开发 014-R4 当前状态为 `IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE DISCOVERY AUTH PASS / NATIVE SEARCH TRUTH PARTIAL PASS / NATIVE UX PASS_BOUNDED`。2026-08-27 最新单实例复验兼容官网三参数 SSO 绑定并完成用户登录：中文目标 40 实得 10 条、2 页、3 个供应商、`source-exhausted`；英文目标 100 实得 3 条、20 页、4 个供应商、`hasMore=null / page-limit`。英文停止保留旧 3 条与 1 条选择，5 秒后无迟到恢复；重新完成后本地“最新”排序不启动新检索。正常/最大化、网页隐藏、主窗点击和无孤儿窗口通过；40/100、真实跨页选择与完整 position-basis 矩阵仍未达成，因此不升级完整 search-truth PASS。
- 开发 014-R5 当前状态为 `IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE PAGINATION TRUTH PASS_BOUNDED / NATIVE SEARCH TRUTH PARTIAL PASS / NATIVE UX PASS_BOUNDED`。顺序分面采用公平页预算，`page-limit` 前执行只读下一页探针，页码改为分面内真实观察值。2026-08-28 英文“machine learning”同一 100 条矩阵仍实得 3 条，但从 R4 的虚假 20 页、`hasMore=null / page-limit`纠正为扫描 2 页、`hasMore=false / source-exhausted`；正常/最大化和单窗口所有权通过。真实结果不足一页，跨页选择、会议结果与完整 position-basis 仍保持 `UNVERIFIED`。证据：[R5 分页真值](./evidence/sidera-014-r5-pagination-truth-2026-08-28.json)。
- 开发 014 已落地单一机构连接协调器、三个独立连接目标、紧凑首屏与 40/100 检索真相。个人图书馆 direct-poll 修复前首轮登录完成后 Cancelled，保留 `FIRST-TRANSACTION HISTORICAL FAIL`；第二次已有会话 Ready 仅为 `SECOND-ENTRY PASS_BOUNDED`。最新修复在同一 4 秒 deadline 内对同一可见 WebView/environment 的固定 landing 直接轮询，PID 62020 清除会话后的首轮登录 Ready，认证窗手动关闭后主窗可点击且无异常窗，记为 `NATIVE LIBRARY AUTH FIRST-TRANSACTION RETEST PASS / USER INPUT+AUTH EXPERIENCE PASS_BOUNDED`。统一发现全文、检索真相和完整桌面 UX 仍未验证，故聚合仍为 `IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE AUTH PARTIAL PASS / NATIVE SEARCH TRUTH UNVERIFIED / NATIVE UX UNVERIFIED / USER EXPERIENCE PARTIAL PASS`。
- 开发 014-R3 的纯黑、理论、More 与题录读取契约不变。历史鼠标可移动但无法点击的事实保留为 `NATIVE INPUT OWNERSHIP HISTORICAL FAIL`；输入窄修已实现，正常/最大化、机构 WebView 隐藏和认证关闭后的复验及最终 Win32 快照支持 `INPUT FIX NATIVE RETEST PASS`。当前状态为 `IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE APPEARANCE PASS (BOUNDED) / NATIVE INPUT OWNERSHIP HISTORICAL FAIL / INPUT FIX IMPLEMENTED / INPUT FIX NATIVE RETEST PASS / NATIVE LIBRARY AUTH FIRST-TRANSACTION RETEST PASS / NATIVE IMPORT READ PASS / USER INPUT+AUTH EXPERIENCE PASS_BOUNDED`。
- 开发 013 已完成普通读取轻量连接、父层首屏快照复用、StrictMode 同键在途合并、按路径/项目/revision 的分面缓存、显式选文后详情加载，以及工作台独立 24 FPS 动态背景预算。显式 prepare 二次窄修前曾取得首屏 114.2ms、进入时业务读取 IPC 为 0、最大化/正常窗口约 121.2/120 draws/s 的中间原生证据，但该证据 `finalForDevelopment013=false`。二次窄修后最终可见桌面启动授权因 Codex usage limit 不可用，非产品失败；2026-08-07 快照状态为 `IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE PERFORMANCE UNVERIFIED / USER PERFORMANCE ACCEPTANCE UNVERIFIED`。2026-08-08 用户已在正常/最大化窗口并明确选文后反馈“正常”，有界主观门更新为 `USER PERFORMANCE ACCEPTANCE PASS (BOUNDED)`；最终定量原生 trace 仍未完成，故 `NATIVE PERFORMANCE UNVERIFIED` 不变。
- P1 继续保持 `PARTIAL / ADAPTER DEFERRED`；机构网页仍只承担登录、原始记录核对和故障回退。

### 开发 016 全文证据台 R2（已实现；自动门与索引原生门通过，证据体验停止门部分通过）

1. PDF.js Canvas 仍是唯一视觉渲染器；透明 TextLayer 按可见页惰性生成，使用 PDF.js v5 scale/user-unit/rotation 契约与 UTF-16 DOM 范围，搜索、选择、高亮、批注统一输出不含 parse run ID 的稳定页证据锚。
2. `Sidera/document-evidence-v1.sqlite` 独立保存 annotations、saved evidence 和文本来源偏好；删除/重建 `document-derived-v1.sqlite` 不得删除用户证据，重解析只能明确返回 exact、reanchored、ambiguous 或 missing。
3. `document-derived-v1.sqlite` 升为 `user_version=4`，索引按 job 隔离，片段最多 800 UTF-16、重叠 120，FTS5 与 384 维 float16 E5 用加权 RRF；CPU 2 线程、batch 16、DirectML 关闭，索引显式启动并可暂停/恢复/取消。
4. 页面继续采用 52px 单行工具栏与正文优先构图；选择后才出现“高亮 / 添加批注 / 保存证据”，唯一文字入口“证据”打开默认关闭的纯黑 SideSheet，窄屏使用 bottom sheet，无 Hero、统计卡或常驻右栏。
5. 自动结果：既有 core/TypeScript/R1/R2/运行中心/构建与两项 cargo check 继续通过，本轮 57 项 headless core 定向测试也通过。独立 `sidera-windows-test-host-smoke` 的 EXE 静态含 manifest、Common Controls v6 与 `TaskDialogIndirect` import，唯一一次运行 exit 0 且无窗口，记为 `WINDOWS STANDALONE TEST HOST PASS`；原 desktop lib host 的 `TEST-HOST UNAVAILABLE` 只保留为历史边界。
6. 原生已通过：中文/英文/双栏非旋转页 100%/125% 精确选择、高亮/批注/证据持久化、派生库重建后 3/3 `missing → exact` 重定位、本地 E5 中英双向跨语言召回、正常/最大化、SideSheet 覆盖、reader active renderer=0、主窗点击与无异常窗口；索引暂停/恢复/取消、重启重挂和迟到结果隔离也已通过。中英文比例字形精确矩形的间歇误拒、真实保存 loading 遗留及空闲新建批注的永久 spinner 误判已完成窄修；隔离 fixture 连续两次混合选区批注和最新候选空闲静态 Save/真实保存收口原生通过，用户已确认该窄项“通过”。同一 300 页解析 run 的连续关闭、重开、停止及停止后无迟到页已经原生通过。旋转页 125% 的旧候选失败已保留；90°/270° TextLayer 未旋转盒尺寸窄修现已通过 TypeScript、静态审计、2-job Tauri 构建及最新原生候选自动拖选，蓝色范围紧贴可见竖排文字。用户最终手感已确认通过；后续开发 017-R1 OCR 与 R2 页码证据 Agent 也已完成全部停止门。证据：[sidera-016-r1-native-closure-2026-08-12.json](./evidence/sidera-016-r1-native-closure-2026-08-12.json)、[sidera-016-r1-evidence-rect-recovery-2026-08-22.json](./evidence/sidera-016-r1-evidence-rect-recovery-2026-08-22.json)。

### 开发 015 文档原生阅读台 R1（已实现；Codex 可见桌面门通过）

1. F1a 的原始文档和 SHA-256 不可变性保持；解析结果写入独立 `Sidera/document-derived-v1.sqlite`。产品文件名保留 v1，当前 Schema 为 `user_version=2`，v1→v2 以显式 UTF-16 长度回填兼容 PDF.js 文本定位。
2. 阅读器使用本地 `pdfjs-dist@5.4.149` 与本地 worker bundle，只有一个 PDF renderer。主 WebView 通过不透明 `sidera-document://localhost/version/{token}` 读取版本；协议支持 GET/HEAD/OPTIONS、单 Range 与稳定错误，不公开 blob 路径。解析前执行 50MB/300 页边界。
3. 内容优先布局保持 PDF 区域至少 70%；紧凑工具条承载页码、缩放、搜索和详情，搜索/详情进入按需浮层。阅读态不挂载星河 Canvas，避免低价值背景与文档争夺 GPU 和空间。
4. 最后硬化已落盘：重开阅读器可从 manifest 恢复 active parse snapshot 并继续有限轮询，不创建第二解析 run；`document-reader-viewport` 是唯一外层滚动所有者，shell 与页面只做 hidden/clipping；协议错误响应保留 CORS 与稳定错误码；research-search 的 `request_tasks` 使用上限 32 的 LRU，活动请求不被淘汰。
5. 自动门为 reader 105/105、derived core 14/14、document store 9/9、P2a-R2 84/84、Vite 1,928 modules 与相关回归 `PASS`。2026-08-09 补跑中，core LRU 定向测试 1/1 `PASS`；首次桌面 `cargo test` 被无关 integration target `sidera_pi_runtime_protocol` 缺失 `sidera_rag` / `sidera_stream_gate` 阻断。随后定向到 desktop lib 的 `sidera_document_protocol::tests` 已完成编译，但 Windows test host 在断言前以 `0xC0000139 / STATUS_ENTRYPOINT_NOT_FOUND`（`TaskDialogIndirect`）终止，所以协议断言严格为 `TEST-HOST UNAVAILABLE`，不是产品、协议或断言 `FAIL`，也不是协议测试 `PASS`。最新 `cargo check --manifest-path src-tauri/Cargo.toml -j 2` 为 `PASS`，仅有 13 条既有 `dead_code` warning；此前 `cargo build -j 2` 仍只作为先前包证据。
6. 74,996-byte、2 页 fixture 的可见 Tauri 验收为 `PASS`：PDF.js 2 canvases、约 0.75s ready、中文“人工智能”命中并跳至第 1/2 页、1/2 页导航、110/120% 缩放、离开重开恢复；1360×860 与 1707×1019 均通过，跳页后 `window.scrollY=0` 且 shell/toolbar y=70。协议原生证明 Range 206、HEAD 200、OPTIONS 204；416 只由 core 自动测试证明。
7. 退出边界：原始版本不被改写；OCR、E5、批注、AI 阅读与多文档比较仍未实现。用户体验独立保持 `UNVERIFIED`。证据：[sidera-015-document-reader-r1-2026-08-09.json](./evidence/sidera-015-document-reader-r1-2026-08-09.json)。

### 开发 014-R4 任务绑定发现认证与检索真值加固（已实现；认证通过，检索真值部分通过）

1. `discovery-fulltext` 认证不再脱离搜索创建第二事务；同一 taskId/searchId 暂停、恢复并保持候选快照所有权。认证等待不计入 90 秒活跃搜索期限，用户停止同时取消认证等待和该搜索。
2. `retrievalPosition.basis=observed|synthesized` 明确区分真实页面首次位置和兼容合成顺序。`ResearchSearchTruth.targetReached` 表示本地 40/100 目标是否达到，`hasMore` 为可空远端继续性事实；`limitReached` 仅作为兼容镜像，不能替代来源耗尽、总命中或完整覆盖。
3. 首屏继续优先显示检索命令、连接摘要、真值摘要和结果；活动来源、传输、导航与诊断默认折叠，不恢复大块连接说明。每页 10 条、本地排序和翻页继续为 0 IPC。
4. 自动技术门继续为 `PASS`。2026-08-27 使用唯一最新 Tauri 实例和当前机构会话完成正式 discovery SSO、中文 40 与英文 100 两组真实矩阵；实际来源只返回中文 10 条（2 页/3 供应商/来源耗尽）和英文 3 条（20 页/4 供应商/页面预算，`hasMore` 未知）。英文停止保留 3 条旧快照与 1 条选择且 5 秒无迟到恢复，新请求可重新完成；本地排序不产生新检索。正常/最大化 UX 为有界 `PASS`，但 40/100、真实跨页选择和完整 observed/synthesized 组合未达成，search truth 仍为 `PARTIAL PASS`。
5. P1 仍为 `PARTIAL / ADAPTER DEFERRED`。WOS、CNKI、Scopus 仍只有人工入口，正式多库连接器属于 P6。证据：[sidera-014-r4-auth-search-truth-2026-08-09.json](./evidence/sidera-014-r4-auth-search-truth-2026-08-09.json)。

### 开发 014-R3 纯黑浮层、星图状态与题录通知修复（已实现；输入与个人图书馆首次交易窄复验通过）

1. `WorkbenchSideSheet` 只在自身声明 `--workbench-side-sheet-surface: #000`。Panel、Header、关闭按钮和机构能力分组引用同一局部 token；Body 透明继承，16% 遮罩、阴影、边框、圆角、状态色、焦点、窄屏几何与退出动画保持，禁止改动全局 `--color-panel`。
2. 理论入口先执行一次 `get_v20_galaxy_payload`。只有 current active V20 ready 才提交模式、focus 与持久偏好；`not-ready` 保留同一个沉浸 Canvas、动画时间、checkpoint 和 `immersive` 偏好，显示非模态“理论星图待更新”。“继续沉浸”为 0 IPC/0 renderer 重建；“前往分析流水线”只导航，不创建任务或自动建模。IPC/期限失败与真实 Canvas/WebGL 故障继续使用不同错误语义。
3. 画布左上角不再常驻历史来源提示；右上角“…”按已挂载沉浸载荷显示 `historical-v20` source r0 / 25,463、current r1 / 25,473 与“非当前热点分析”。菜单打开不产生 IPC。012-R3 的冷启动真实动态沉浸回退和首帧 ready 门不变。
4. 题录 `status/history` 保留命令名与 JSON，但只复用 prepared 主库并使用 `READ_ONLY + query_only`，仅校验 v14/import ledger；读取不迁移、不执行 DDL、不申请 mutation permit、不写审查回执。主库账本是提交事实权威；审查库只读打开不创建目录、WAL、表或事务，两端都不存在时返回稳定 `NOT_FOUND`。
5. `import-review` 通知作用域独立于 Agent、星图和机构通知。后台状态/历史读取错误 8 秒自动关闭，并可由 X、成功重读或离页立即清理；提交、回滚等阻断错误保持常驻。状态与历史错误独立记录，稳定错误码只进入题录诊断；database identity/generation 门拒绝 A-B-A 迟到结果。
6. 自动技术门为 `PASS`：既有 Vite/Rust/题录/理论/动态/工作台与回归结果保留；最新个人图书馆窄修的机构专项 117/117、正式 `cargo check -j 2`、desktop lib test binary `--no-run`、`cargo build -j 2` 均通过，独立复审 P0/P1/P2=0。附加 `cargo check --tests` 因既有 `sidera_pi_runtime_protocol` integration path-module 引用漂移而 FAIL；它不是本修复引入，不影响正式 cargo check，且不得写成全 tests PASS。
7. 精确副本验证读取到 1 条历史、权威批次为 committed 且无 review store；副本主文件 SHA-256 前后均为 `B546C505F6FAD89C9D4C6429DBBA8FACC7838D5F66CC9367E24A2824EFDCA8FA`、214,532,096 bytes、Schema v14、25,473 篇、revision 1、active V20 0。0-byte WAL 与 32KB SHM 只是副本自身 SQLite bookkeeping。
8. 先前唯一 Tauri 的最大化和正常窗口截图确认 SideSheet 纯黑、理论 not-ready 保持动态沉浸、流水线只导航、More 历史来源与左上提示移除，保留为 `NATIVE APPEARANCE PASS (BOUNDED)`；Escape 焦点记录和静态截图不能证明冻结瞬间的 HWND enabled/owner 或物理点击可达性，也不能把未实际显示的机构 WebView 层级升级为通过。题录正常读取与隔离 fault fixture 的 batch/status/history 稳定错误码均通过；history toast 在 59ms 出现、+4003ms 仍在、+8304ms 消失，X 后 100ms 消失，离页 150ms 清除，正常重读 50.8ms 恢复且无 toast，聚合升级为 `NATIVE IMPORT READ PASS`。提交/回滚阻断错误常驻未单独注入，仍为独立 `UNVERIFIED` 边界。
9. 历史输入故障、无 Application Hang/崩溃/GPU reset 与未捕获冻结瞬间 HWND 的边界继续保留，精确根因仍为 `UNVERIFIED`。两个 P0 候选的窄修已完成；正常/最大化、机构 WebView hide 及认证关闭后点击均通过。最终 PID 62020 快照确认 main visible/enabled/uncloaked、无非 main 可见顶层窗、auth WRY/renderer 隐藏、唯一交互 WebView 为 main，因此为 `INPUT FIX NATIVE RETEST PASS`。最新清会话首轮个人图书馆登录也为 Ready；用户手动关闭后可点击、无异常窗。真实库 immutable/query_only 仍为同一 SHA、214,532,096 bytes、v14/25,473/r1/active0/ready4，main/WAL/SHM 大小与 mtime 前后不变。证据：[sidera-014-r3-visual-truth-and-notice-2026-08-08.json](./evidence/sidera-014-r3-visual-truth-and-notice-2026-08-08.json)。

### 开发 014 机构资源工作台 R1（已实现，自动技术通过）

1. 三个连接目标保持语义分离：数据库访问证明数据库 SSO，可用全文发现证明统一发现的机构全文身份，个人图书馆证明个人账户身份；它们由一个 `InstitutionAuthCoordinator` 串行协调，而不是由多个按钮分别启动会话、浏览器和回写状态。相同目标聚焦现有事务，不同目标在活动事务结束前稳定返回忙碌；generation 隔离迟到回调，已就绪终态不因晚到窗口关闭而降级。
2. 连接窗口关闭不等于登录成功。关闭请求先进入 `verifying`，短时检查当前连接窗口，再刷新并检查绑定父页；只在目标对应身份获得证明后进入 `ready`，否则进入可解释的失败/取消终态。个人图书馆官网 popup 由受管子 WebView 通过 `NewWindowResponse::Create + window_features` 承接，保留 POST、`window.opener` 与共享 environment/UDF，不再把目标 URL 当普通 GET 重放。公开负载不包含 query、fragment、ticket、Cookie 或密码，浏览器只作为登录与诊断表面，不能成为认证权威。
3. 首屏移除重复 hero、常驻连接按钮组和大块就绪说明，改为紧凑主检索、单行连接摘要及默认关闭的“连接与来源”抽屉。抽屉承载三个连接目标、人工来源入口、浏览器显示/隐藏与诊断；WOS、CNKI、Scopus 明确为“仅人工访问 · 尚无连接器”，自动连接器与多源覆盖属于 P6，不能作为开发 014 的完成声明。
4. 用户只选择候选目标 40 或 100，不直接选择连接器。后端在结果上限之前完成记录类型/年份过滤、规范化和去重，并返回 `resultLimit / recordsReceived / recordsAccepted / duplicatesMerged / pagesScanned / completionReason / totalHits? / coverage / providerBreakdown / retrievalPosition.connectorId`；未知总命中量保持未知，不把当前返回数伪装为供应商总命中量。前端每页显示 10 条并保留跨页选择，翻页与“来源返回/最新/最早/标题”仅作用于当前已取回候选，不触发新 IPC，也不冒充数据库全局排序。
5. 自动技术门结果：`pnpm build` 1,920 modules、`cargo check -j 2`、增量 `cargo build -j 2`、core auth 7/7、research 22/22、institution 21/21、014 专项 113/113、相关回归与 `git diff --check` 均为 `PASS`；独立 popup 修复复审为 `PASS`，P0/P1/P2 均为 0。desktop lib test 编译 `PASS`，但执行环境以 `0xc0000139` 退出，记为 `TEST-HOST UNAVAILABLE`，不是产品失败。
6. 本工作包不改变 P2b、F1a、012-R3、论文库 Schema、真实数据库内容或 Provider 边界。immutable + `query_only` 复核确认真实库 SHA-256 `B546C505F6FAD89C9D4C6429DBBA8FACC7838D5F66CC9367E24A2824EFDCA8FA`、214,532,096 bytes、Schema v14、25,473 篇、revision 1 且 metadata 不变。证据：[sidera-014-institution-workspace-r1-2026-08-08.json](./evidence/sidera-014-institution-workspace-r1-2026-08-08.json)。
7. Windows debug/release 入口统一使用 `windows_subsystem = "windows"`，最新候选以唯一可见 Sidera 启动且没有新增 CMD 窗口。用户此前确认数据库访问“已连接”、主窗口可点击、无异常窗口；最新又确认个人图书馆首次登录在同一次事务中自动关闭认证窗口、状态变为“已就绪”且“很丝滑”。据此数据库访问为有界 `PASS`、个人图书馆认证为 `PASS`，但 `discovery-fulltext` 仍为 `UNVERIFIED`，真实检索真相与完整正常/最大化 UX 也继续 `UNVERIFIED`；开发 014 不得进入整体完成态。

### 开发 013 文献工作台首屏与持续卡顿治理（自动技术通过，最终原生性能待验）

1. 完整迁移、完整性/外键/V20 引用校验和过期 Agent 任务恢复属于显式数据库准备阶段；启动、初始化和恢复流程调用 `prepare_library_database`。普通状态、分页和分面读取只在准备指纹有效后打开只读、`query_only` 的轻量连接；未准备或指纹失效必须稳定失败，绝不隐式回落 full prepare。
2. 应用父层已经取得的数据库路径、项目、library revision、分面与首屏结果组成可失效 bootstrap；工作台首次挂载直接复用。开发版 StrictMode 的同键在途请求合并，翻页和刷新只执行一次分页查询，不重算分面。
3. 分面缓存键锁定为数据库路径、项目与 library revision；revision 与三组 facet 必须在同一只读事务中读取，任何写路径按数据库失效缓存。详情不默认选择首篇，只有用户明确选中文献后才读取文档快照与下载列表。
4. 012-R3 的同步真实 WebGL 首帧仍是不变启动门。工作台运行态单独采用 24 FPS 帧预算，跳帧期间不渲染，但下一次实际处理使用距上次处理帧的墙钟 delta；Agent 页不设该预算，visibility 恢复和预算热切换不重建 renderer。
5. 真实库复核仍为 Schema v14、25,473 篇、revision 1，完整 SHA-256、计数和 revision 不变，main database content mutations 为 0、WAL 为 0 bytes；原生启动与只读连接会使 0-byte WAL 和 32KB SHM 的 SQLite bookkeeping 时间戳前移。无筛选“最新”排序仍产生 `USE TEMP B-TREE FOR ORDER BY`，修复后显式刷新约 268–269ms；Schema、索引和排序语义必须另行授权并先在精确副本验证。

退出门结果：`pnpm build`、正式 `cargo check -j 2`、Rust core 两组定向测试、工作台读取/背景/R3 15项/P2b/F1a/桌面壳/文档专项均为 `PASS`。新增桌面端 5 项测试已编译，但 Windows 测试宿主以 `0xffffffff` 退出，准确记为 `TEST-HOST UNAVAILABLE`；额外 `cargo check --tests` 命中既有 integration unresolved modules，不推翻正式 `cargo check`。此前正常/最大化窗口的首屏、详情、单次刷新、动态帧和低负载数据均为二次窄修前的中间原生证据，不能升级为最终 PASS。最终 GUI 启动 escalation 因 Codex usage limit 被系统拒绝且不得绕过，准确记为 `NATIVE PERFORMANCE UNVERIFIED`，不是产品 `FAIL`；2026-08-07 evidence 的用户体感状态仍为 `USER PERFORMANCE ACCEPTANCE UNVERIFIED`。2026-08-08 用户在正常/最大化窗口和明确选文后反馈“正常”，只将有界主观体验更新为 `USER PERFORMANCE ACCEPTANCE PASS (BOUNDED)`；最终定量 trace 与冷启动资源链仍待复测。证据：[sidera-013-workbench-performance-2026-08-07.json](./evidence/sidera-013-workbench-performance-2026-08-07.json)。

### 开发 012-R3 冷启动动态快照重建闭环（自动与原生启动门通过）

1. 视觉来源选择必须只读。active state 明确存在时，只接受与当前 library revision 一致且结构完整的快照；stale、超前或损坏的 active state 直接失败，不得静默降级。
2. active state 缺失时，可选择最新结构完整的 `ready historical-v20` 作为沉浸背景的显式视觉来源。载荷必须携带视觉来源类型、当前/来源 revision 和 freshness；历史来源不能冒充当前分析结果。结构完整按快照级总数和引用关系判断，不把热点证据 `paper_count` 误作逐热点 membership 基数。
3. 理论背景保持 current-only。冷启动偏好理论但没有当前 active V20 时，只能切换到真实动态沉浸背景；禁止静态正常回退。
4. 没有有效视觉来源、载荷损坏、来源 revision 超前、stale active、载荷期限到期或 Canvas 挂载看门狗触发时，启动必须进入可观察的 `failed` 终态，不能无限等待。
5. P2b 正式提交继续只更新论文库 revision 并使 active state 失效，不自动运行热点分析。若以后需要重建，必须另行进入明确、可观察、可取消且低负载的分析阶段。

退出门结果：TypeScript、Vite、相关 Rust core 定向测试、`cargo check -j 2`、冷启动专项、P2b/F1a/桌面壳/文档回归和差异检查均为 `PASS`。真实 Tauri 连续冷启动 3 次，均未点击回退、重试或静态背景；单一 GPGPU WebGL Canvas 持续运行，900ms 帧变化约 2.97%–3.09%，正常与最大化窗口均通过。当前真实库已处于正式导入后的 r1 / 25,473、active 为空状态，因此 revision 变化后的冷启动门已覆盖；验证未新写库、未重建热点，最终只保留 PID 41708。Computer Use helper `0x80070003` 记为工具 `UNAVAILABLE`，实际 Tauri 由 tasklist Console session、Tauri visible API 和同一 WebView 截图/动态帧确认。证据：[sidera-012-r3-cold-start-dynamic-snapshot-2026-08-06.json](./evidence/sidera-012-r3-cold-start-dynamic-snapshot-2026-08-06.json)。用户视觉验收仍为 `UNVERIFIED`，不得由该原生技术门替代。

开发 014 当前聚合状态同步为 `IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE AUTH PARTIAL PASS / NATIVE SEARCH TRUTH PARTIAL PASS / NATIVE UX PARTIAL PASS / USER EXPERIENCE PARTIAL PASS`；三类认证目标已有有界通过，完整检索真值与 UX 仍只部分完成。

## M1 当前子阶段

### M1.3l-R1 Sidera 全局星空导航壳（历史基线，已并入 M1.3m）

- 移除 Agent 页标题栏、导航抽屉及全屏点击层的独立底板，使星河在整个窗口中保持连续。
- 导航打开时不再模糊或压暗 Agent 对话与星空；文字、控件依靠局部文字阴影和轻量状态渐变保持可读。
- 当时只移除 Agent 抽屉右侧硬边、卡片外框和左上角直角分割；其“工作页实体侧栏不受影响”的边界随后由 M1.3m 取代。
- 2026-08-01：样式已在真实 Tauri 窗口热更新并完成初步视觉检查；技术验证通过，等待用户最终确认导航可读性与整体感。

历史退出门槛：导航开合不改变画布、相机或背景亮度；窗口顶部、导航区和主内容区视觉上属于同一连续星空。工作页导航现以 M1.3m 为准。

### M1.3l Sidera 双沉浸样式与流动知识星河（已通过）

- 新增默认“流动星河”，以稳定对角主带、克制支流、外围留白、真实论文/热点星与非语义暗微尘建立沉浸主视觉。
- 保留当前“随机星海”作为用户可选样式；两种样式分别记忆运行时间与检查点，聚焦期间切换保留同一实体和信息卡。
- 继续使用身份型 `AgentImmersiveBackgroundPayloadV2` 和现有 `128×64` GPGPU，不读取或派生理论 XYZ；剩余状态槽用于约 2,000 个暗微尘代理。
- 本工作包只修改沉浸背景、样式选择、诊断和文档，不修改理论背景、Pi 接入、侧栏历史对话或正式 Agent 后端。
- 2026-08-01：双样式、独立检查点、稳定星河骨架、同纹理暗微尘、程序化薄带及样式控件已经实现；TypeScript、Vite、Cargo、专项/回归审计和 Tauri 低负载样式往返为 `PASS`。用户实机确认“效果不错”，产品视觉更新为 `PASS`。

退出门槛：用户能直接识别“主带＋支流＋留白”的星河构图，5 秒内感知沿流带的连续流动而非整图平移；语义星保持锐利，两种样式与聚焦状态往返连续，自动审计和低负载 Tauri 验收通过。

### M1.3k Sidera 桌面产品壳、启动页与默认入口（当前）

- 普通冷启动改为 `Sidera 启动页 → Agent 背景真实 onReady → 全屏 Agent`，不再闪现总览。
- 启动页使用纯黑背景、SIDERA 字标、极简星点和《兰亭集序》古句；首次沉浸、之后恢复背景偏好。
- 主窗口默认最大化、非独占全屏，并以自定义标题栏替换 Windows 默认装饰；Agent 透明叠加，工作页面使用深色实体栏。
- 应用 identifier、数据库路径、Cargo 包名和本地存储键保持不变；正式 Agent 后端不在本工作包接入。
- 2026-08-01：默认入口、启动状态机、极简启动页、用户显式静态诊断入口、自定义标题栏、窗口配置和专项审计均已落地；正常冷启动不得使用自动静态退路，必须等待真实动态首帧。前端构建及浏览器壳层回归为 `PASS`，Cargo/原生窗口验收因其他项目编译占用保持 `PENDING / UNVERIFIED`。

退出门槛：冷启动无白闪/总览闪现，背景真实就绪后才撤掉启动页，窗口控制与高 DPI 正常，Agent/工作页标题栏切换不改变画布尺寸，Tauri 用户验收通过。

### M1.3j Sidera 一键直达聚焦与论文恒星近景（并行视觉验收）

- 流式回答继续保持背景不变；回答完成并解析真实结构化实体后才显示聚焦入口。
- 单次聚焦只强化当前目标。论文一键进入所属热点并自动抵达论文近景；热点一键进入并停在热点主星。
- 多对象只保留“下一颗 / 关闭”，不再显示上一颗、复杂序号或五个证据弱亮。
- 背景压暗、目标增强、相机移动与信息卡使用同一时间线；关闭时中央对话框保持原位。
- Agent 理论论文近景统一使用真实恒星光球，最终直径 `160–240px`；分析理论星图保持原样。
- 恒星光球必须使用自发光等离子模型：宏观流动、屏幕空间窄流丝和微观颗粒形成可读的三维表面；不规则白热核心承担内部能量，相机射线—球体切线解析圆环承担连续高温轮廓，位移日冕只承担外部火舌。中/细尺度线宽与圆环宽度都必须由像素导数控制；圆环必须在近距离和离轴构图中匹配真实投影轮廓，禁止恢复球心平面半径近似、第二个三维 Fresnel 球壳、固定宽阈值的大理石/迷彩斑纹，也禁止通过方向漫反射、规则径向亮斑或黑色暗边把论文星表现成冰球、月球或行星。
- 对话框宽度为 `clamp(480px, 36vw, 640px)`。
- 自动审计和 Tauri balanced 低负载抽查已确认论文一键直达、关闭恢复、沉浸同步时间线和单次“下一颗”接管；实测暴露的反向释放与 `retargeting` 滞留已经修复。Cargo 因另一项目编译链占用而延后，三尺寸材质比较、跨热点连续轮播和最终用户视觉仍未完成。

退出门槛：一键直达、同/跨热点换项、连续关闭恢复、恒星光球像素检查和 Tauri 用户视觉验收通过；通过前保持 `IN_PROGRESS / PRODUCT UNVERIFIED`。

### M1.3i Sidera 回答后显式证据聚焦（技术资产保留，产品模型已取代）

- Sidera 回答使用结构化实体引用；流式阶段不得自动改变相机、背景亮度或实体材质。
- 回答完成且真实实体解析结束后，正文引用与消息末尾才启用“聚焦”入口。
- 每组按首次出现顺序去重，直接轮播最多 6 个对象；实体解析、身份协调和信息卡继续复用。
- 聚焦时中央对话框宽度和中心不变，目标位于固定一侧，对侧显示轻量核心信息卡；支持手动收起对话。
- 沉浸背景使用同一真实顶点/动态槽和共速相机，不再自动凝聚或重排 24 颗上下文星。
- 原“理论背景先外围构图、再二次点击进入近景”的产品路径，以及同时弱亮五个证据对象的表达已由 M1.3j 取代。
- 关闭、换组和背景切换继续复用 M1.3h 的只读解析、动态槽、双背景身份协调以及 R10 精确返回。
- 正式 Agent 后端尚未接入；当前使用生产同构消息契约和仅开发环境可见的真实 ID 夹具。

结论：技术基础可复用；产品交互与近景视觉 `FAIL / SUPERSEDED`。

### M1.3h 双背景动态语义聚焦闭环（技术资产保留，产品模型已取代）

- 全屏壳层、悬浮抽屉、只读实体解析、稳定原顶点、32 个动态槽、双背景身份协调和理论精确释放继续复用。
- “回答期间自动 signal/soft/full”“自动凝聚 24 颗上下文星”“自动进入系统或论文近景”经用户实机判定为产品视觉 `FAIL`。
- 该产品路径由 M1.3i 显式证据舞台取代，不再作为待验收候选。

### M1.0 旧基线冻结（已完成）

- 记录背景载荷、工具链、提交和哈希。
- 保留旧三候选历史，不再把它们视为产品候选。
- 明确展示/理论星图、UMAP、默认首页和数据库均不在当前改动范围。

### M1.1 开发前准备（已完成）

- 建立标准项目文档入口。
- 冻结 `FlowModel`、焦点意图和实体解析接口。
- 准备确定性测试实体。
- 锁定清晰度、连续性、色彩、数量和性能要求。
- 增加准备阶段自动审计。

### M1.2 参数化星河引擎（运动语言已接受）

#### M1.2a 引力织场黑白运动骨架（已完成）

- 以独立 `AgentGalaxyFlowCanvas` 和 `agent-flow` 评审入口实现，不覆盖旧背景或默认应用。
- 使用四个不可见场节点产生确定性、连续的局部拉伸、压缩、剪切和轻微扭曲。
- 分离锐利论文星、锐利热点核心、环境星和暗微尘；本轮不使用颜色、Bloom、景深或运动模糊。
- 以固定相机为主要验收条件，证明运动来自知识空间形变而不是整组变换。
- 技术实现、自动审计、Iris Xe 分级浏览器测试、4K 原图和两段动态材料已经完成。
- 用户已接受引力织场运动语言；视频中的轻微软化判定为录屏压缩现象，不改变锐利渲染通路结论。

#### M1.2b 相位呼吸与低饱和色彩（暂缓）

- 在常驻论文黑白聚焦骨架通过人工体验后，再加入“相位星海”的密度呼吸。
- 再引入银白、冷灰和低饱和灰蓝的最终候选色彩，不改变锐利亮核不变量。

#### M1.2c 备用流场适配器与 Agent 状态（未开始）

- 保留 `tidal-curl-tech-preview` 作为后续技术适配器，不在 M1.2a 实现。
- 对通过技术验证的 FlowModel 接入连续 Agent 状态和自动降级。
- 任何技术适配器都不自动成为最终主视觉。

### M1.3 双背景与动态语义聚焦（进行中）

#### M1.3a 常驻论文引力锁定骨架（技术完成，旧视觉失败）

- 在同一批 3,840 个稳定论文顶点上实现 `signal / soft-focus / full-focus`。
- balanced 和 high 只改变逐顶点可见掩码；预算外常驻论文按 ID 提升同一顶点，不创建替代星。
- 使用独立 FocusController 驱动局部相位锁定、共速相机、显式释放和目标切换。
- 评审背景使用纯黑底色；语义星改为导数抗锯齿的紧致亮核，环境星与微尘不再使用宽软边模拟雾化。
- 焦点星使用所属热点颜色派生的低饱和语义材质、轻微晶面轮廓和最多 10% 的局部邻域对比，不使用 Bloom、圆环、准星或标题。
- 本阶段只做浏览器隔离评审，不接入正式 Agent 首页或 Tauri。
- 同顶点、逐点可见掩码、双槽切换和共速相机技术审计为 `PASS`。
- 首轮浏览器体验只能明显感知相机远近，目标星本身辨识不足，旧二维白点材质的产品视觉结论为 `FAIL`。

#### M1.3b-1 恒星光球与可感知聚焦切片（技术完成，产品表达未采用）

- 将聚焦拆分为目标捕获、局部织场、材质展开、相机接近和延迟释放五条连续时间线。
- 使用 CPU/GLSL 同源的局部非径向 `FocusField`，邻域产生潮汐弯曲而不排队、塌缩或冻结。
- 论文、热点与目标使用共享几何体的双通道恒星光球 LOD；热点成为低饱和稳定主星，论文主要保持银白亮核。
- 完整聚焦终点固定为 `8.5 CSS px`；关闭聚焦相机时也必须在 0.8 秒内辨认目标。
- 构建和静态/数学审计已通过。
- 用户能够看到圆点放大缩小，但不认可其作为沉浸版主要表达；同顶点、FocusField、锐利亮核和相机能力保留为底层能力。

#### M1.3c 理论坐标 + 沉浸外壳实验（结构性失败，已归档）

- 技术上实现了六态、上下文抽取、动态实体层和只读实体解析。
- 产品结构仍以 `hotspot.position + paper.offset` 生成沉浸论文位置，因而保留理论团簇。
- Tauri 实机确认其仍像理论星图，无法呈现参考 HTML 的随机流动星海。
- 自动审计 `PASS` 不再视为产品闭环；同顶点、实体解析、诊断和材质研究保留，错误产品入口归档。

#### M1.3d 真正的沉浸/理论双背景静置闭环（技术 PASS，产品视觉 FAIL）

- 沉浸背景使用最多 6,000 篇真实论文与 160 个真实热点，但位置完全由会话种子和 Curl 流生成。
- 沉浸载荷不得包含理论 XYZ、热点质心或论文语义偏移。
- 理论背景继续使用完整真实理论布局，仅在 Agent 页面采用专用锐利恒星视觉配置。
- 正式研究 Agent 页面提供中央极简输入、显式背景切换、理论探索态和高级工作台入口。
- 任意时刻只存在一个 WebGL 渲染器；切换时保存沉浸时间或理论相机姿态。
- 本子阶段不实现聚焦、Thinking、六态动画和正式 Agent 后端；两套静置结构必须先经 Tauri 人工验收。
- 6,000 篇唯一真实论文、160 个真实热点、无理论坐标载荷、随机 Curl 星海、Agent 理论配置、探索态、极简提交契约和高级工作台入口均已实现。
- 本地静态/数据库审计、TypeScript、Vite、Rust 增量检查和低负载 Tauri 功能验收为 `PASS`。
- 用户实机确认沉浸位移过小、理论论文色相不足，热点呈蓝色行星圆片；产品视觉判定为 `FAIL`，进入 M1.3e 修订。

#### M1.3e 沉浸流动与理论恒星材质修订（技术闭环完成，视觉待验收）

- 沉浸背景保持会话随机空间和真实稳定身份，不读取或继承理论 XYZ。
- 使用 `128×64` 状态化 GPGPU Ping-Pong 两级流场，实现可持续输运、固定步长、无重生与会话检查点续接。
- WebGL2、浮点渲染目标或 context 不可用时，使用解析式两级流场连续降级。
- Agent 理论论文恢复所属热点的中低饱和色相，保留锐利银白亮核。
- Agent 理论热点概览改为共享实体索引的锐利核心与薄光学层，不再使用方向光照亮的实心球面圆片。
- 流场、恒星材质、双背景与项目文档专项审计已经通过；桌面切换首次复验发现并修复了 React 检查点回写造成的递归更新。
- 修复后的低负载 Tauri 已完成沉浸、理论、热点与返回沉浸的技术往返；阶段仍保持 `IN_PROGRESS / UNVERIFIED`，直到用户视觉确认完成。
- Agent 理论热点概览改为锐利核心、短衍射与薄日冕；完整光球只在飞近后的局部系统显示。

#### M1.3f Agent 理论背景纵深与深空层次调整（技术 PASS，产品视觉 FAIL）

- 仅为 `agent-theory` 建立有上限、可审计的自适应 Z 轴显示增强；原始理论 XYZ、独立理论星图和展示星图保持不变。
- 使用增强后的坐标执行 Agent 专用最佳视角评分，新增深度压缩和微偏航视差潜力指标。
- 通过锐利的前中后景尺寸、亮度和主题色层次，以及低频共轨相机漂移建立可感知纵深。
- 增加世界锚定、不可拾取且不携带业务 ID 的稀疏装饰恒星和暗微尘；性能降级优先移除装饰层。
- Ambient 与 Explore 始终使用同一增强空间，切换、拾取、标签和热点进入不得发生空间收缩或跳变。
- 数学、材质和隔离审计通过，但用户实机确认默认静态观感仍是二维圆片散点图，只有鼠标交互时才出现明显 3D 感；产品视觉判定为 `FAIL`。
- 新增流场、恒星材质和项目文档审计；独立理论星图、展示星图、数据库与活动快照保持不变。
- 自动验证和低负载 Tauri 检查通过后仍需用户人工接受，才可结束本阶段。

#### M1.3g Agent 理论外围巡航与观测尺度恒星 LOD（进行中）

- 在增强后的 Agent 显示坐标上计算 PCA 主平面、96 扇区外围包络和 6%–10% 安全间隔，相机始终位于真实实体之外。
- Ambient 使用会话随机、固定步长、限速限加速度的连续巡航；视线以切向斜视为主，单帧只显示局部星系，不再默认适配全图。
- Explore 从当前巡航姿态原地冻结；早期“退出后搜索最近外围安全壳”已被 R6 的精确入口锚点返回取代。
- 普通论文使用 Point / PSF / Near-PSF；只有近景热点和焦点论文可以使用有迟滞的真实 Sphere LOD。
- M1.3f 的 Z 轴增强保留为辅助显示矩阵，不再承担主要三维表达。
- M1.3g-R1 修复热点实例 Shader 的 `instanceColor` 重复声明，并增加真实 WebGL 编译、链接、首帧错误和视锥可见性就绪门；失败时停止 RAF、保留黑色错误页并允许重试。
- 外围剖面、巡航相机、场景实体和热点光学尺寸统一使用 `APP15_THEORY_COORDINATE_SCALE` 后的 Three.js 世界单位；无效旧检查点不得恢复。
- R1 已通过 Ambient 首帧和 15 秒无黑屏低负载桌面检查；Explore、重置、返回外围、背景往返和 100% 像素材质检查仍需完成。
- M1.3g-R2 以屏幕可辨识数量和网格占用替代“视锥实体比例”，保留全部论文顶点并在 balanced 下稳定显示约 3,500–5,500 颗。
- Explore 增加约 350ms 的可见语义枢轴交接；退出使用速度连续的最近外围返回，并将进入/退出列为 60 FPS 交互过渡。
- R2 性能修订将全量论文投影、排序和 LOD 权重生成移出拖拽/缩放热路径：手势期间冻结选择和交接，停稳后空闲刷新一次；Explore 入口不再二次扫描全部论文。
- Agent 理论慢帧降级保留约 18 FPS 环境节奏，热点系统静置目标提高到 24 FPS，避免正常运行被误判为渲染卡死；独立理论/展示星图维持原策略。
- R2 自动技术验证为 `PASS`，但用户视觉验收为 `FAIL`：固定 Orbit 枢轴仍限制观察方向，返回末端发生跃迁，Ambient 偶发抖动，热点层级不稳定。
- M1.3g-R3 已将 Explore 改为自由视线、沿视线推进和局部平移；双击实体只触发可被鼠标输入连续取消的短暂瞄准，不形成永久中心锁定。
- R3 已为返回外围增加 `return-handoff`，在交接完成后才空闲刷新深度与屏幕 LOD；巡航使用 previous/current 状态插值，并限制积压追赶、深度阶跃和低可见度重构图。
- R3 已建立独立热点主星层级：Ambient 构图单独保证热点数量与屏幕分散度，Explore 与 Ambient 使用同一热点可见规则；近景论文亮核仅做克制增强。
- R3 边界复核补齐热点单击/双击互斥、自由相机 reset/fit/top 的位置与四元数过渡、Sphere 退场所有权与总槽位预算，以及返回末帧投影/方向诊断；近景 `1.12` 辐射仅随真实 nearness 渐进生效。
- R3 的 TypeScript、Vite、Rust 与全部专项/回归审计已经通过；低负载 Tauri 已确认星体可见和自由拖动生效，但滚轮、平移、双击瞄准、完整返回、热点系统退出及最终用户视觉仍为 `UNVERIFIED`。
- R3 用户实机复验为产品视觉 `FAIL`：拖拽期间屏外论文直到松手才补齐，Ambient 长时观察仍会跳动，退出末端相机/深度/论文集合分段跃迁，热点仍像圆片或会在 Explore 中消失。
- M1.3g-R4 将论文 LOD 移入专用 Worker，并使用 `±1.35 NDC` 护栏、20Hz 交互更新、90ms 新星渐显和延迟退场；拖拽期间不再冻结星体集合。
- R4 将 96 扇区统计拟合为经全部实体验证的周期 C2 安全壳，删除运行期自动重构图，并取消 Agent 理论 Ambient 的 24/18 FPS 人工节流。
- R4 把返回相机、深度和论文 LOD纳入同一过渡；终点集合在到达前准备完成，`return-handoff` 只交接相机速度。
- R4 的 Ambient/Explore 热点仅使用紧致核心、低饱和非圆肩部和稳定短芒；三维光球只在真正进入热点系统后出现。
- R4 自动技术闭环已经完成：Worker 生命周期、单执行＋最新待执行请求合并、1.5ms 分块后备、拖拽实时护栏选集、终点 LOD 预取、深度同步收敛、500ms 视觉稳定完成门、周期 C2 安全壳和概览 PSF-only 均通过组合审计；TypeScript、Vite 与 Rust 增量检查通过。
- 低负载 Tauri 已抽样验证理论背景加载和 Explore 大幅拖拽后的首帧补星。最终完成门后没有延迟论文批次，但一次返回落入近乎空白的自然稀疏扇区；由于已锁定“永不自动纠正巡航构图”，程序没有强制转回星系。该观感、持续按住拖拽、长期巡航和热点材质仍待用户验收，阶段继续为 `IN_PROGRESS / UNVERIFIED`。
- R4 用户实机结论为产品视觉 `FAIL`：热点核心实际只有 `1.1–1.6px`，低于近景论文星，Ambient/Explore 均无法辨认热点；开放式外围巡航可进入无语义星视野，LOD 随后把论文集合淡出为黑屏。
- M1.3g-R5 冻结当前论文材质，热点概览改为 `2.8–5.2px` 锐利核心与 `5.5–10px` 克制 PSF；概览不使用真实光球。
- R5 在唯一巡航相机写入者内部加入未来 6 秒连续可见性包络。`1440×900 balanced` 的硬性下限为约 1,200 颗可辨论文、12 颗热点和 5 个热点网格；Explore 仍允许用户主动看向空白区域。
- R5 的 Explore 返回只有在终点及未来路径满足内容下限、深度/LOD 已稳定时才完成；旧 R4 无可见性证明的检查点不得恢复。
- R5 入口冻结已验证安全巡航锚点。无交互立即退出不得生成新的 1.6 秒返回旅程；发生交互后优先 C2 返回该锚点，只有锚点失效才搜索替代终点。
- R5 用户复验确认无交互立即退出可恢复原位，但任意交互仍进入旧 Hermite 返回并再次滑向黑屏；R5 因此为“自动验证不充分、产品视觉 `FAIL`”。
- M1.3g-R6 在 Explore 入口冻结精确相机四元数、投影参数、巡航前后检查点、插值进度、深度和论文 LOD；发生交互后也始终返回这组锚点，不再搜索或推导新外围终点。
- R6 返回状态为 `return-preparing → returning-anchor → return-commit → cruise`：先预热当前与锚点论文并集，再使用无导数、无越界的 `smootherstep` 位置线性插值和四元数球面插值；完成门只读取真实相机、实际顶点权重和投影位置。
- LOD Worker v2 为每次请求携带 `explore / return-anchor / cruise` 用途和投影签名；过期用途、旧视口或错误投影响应不能覆盖返回选集。输入栏直接消费相机 RAF 的同一返回进度。
- R6 真实相机专项审计已覆盖非零滚轮、拖拽、平移、组合操作和主动空白视野；完整 Tauri 验收仍需覆盖连续五轮往返、热点系统内部退出和背景切换。
- R6 用户实机确认返回轨迹不再越界，但产品仍存在四项失败：热点标题随论文 LOD 请求闪烁、局部系统和论文近景没有返回控件、返回后巡航失活、系统普通论文在高亮环境下不可读。因此 R6 保留“精确轨迹技术 PASS”，整体产品视觉改为 `FAIL`。
- M1.3g-R7 将标签布局与论文 LOD 解耦，以持续跟随和碰撞迟滞替代清空；Agent 页面增加论文→热点→概览的动态返回；返回完成门增加巡航固定步生命期证明；系统论文采用仅作用于 `agent-theory` 的高亮环境可读配置。
- M1.3g-R7 用户实机确认标题持续跟随与分层返回为 `PASS`，但返回后的外围巡航仍永久静止，系统论文亮度只获得部分改善。旧“两个固定步＋0.15px”证明没有跨越护栏真实评估周期，自动技术结论不足，R7 完整产品验收记为 `FAIL`。
- M1.3g-R7.1 将恢复完成门延长为至少 900ms、30 个固定步、两次真实安全护栏评估和 `0.15px` 位移；护栏可以采用安全候选构图继续推进。Agent 系统论文基础透明度、核心尺寸、深度下限和聚焦上下文倍率再提高一档，概览论文与其他星图不变。
- M1.3g-R7.1 增量构建及 R5/R6/R7-v2 审计通过，但用户桌面持续观察仍确认退出 Explore 后永久静止；该工作包记录为“静态/自动技术 `PASS`、产品实机 `FAIL`”。
- M1.3g-R8 将 `CruiseIntegrator` 与 `VisibilityGuidance` 解耦：Ambient 可运行时固定步始终推进，守卫只输出 `normal / steering / fallback` 引导，速度下限分别保持为 `1 / 0.55 / 0.35` 级别，任何模式都不得把速度置零或拒绝检查点推进。
- R8 到达精确锚点后立即恢复巡航，首个成功固定步后发布 `idle`，论文并集在 300ms 内后台收敛；旧 900ms/30步/两次守卫证明保留为非阻塞健康审计，失败只触发 fallback。当前自动技术闭环完成，产品视觉等待 Tauri 实机复验。
- 用户已接受 R8 巡航生命期与返回逻辑，但对话态仍有轻微横向/纵向冲击。M1.3g-R9 将随机目标改为 `4–7s` 会话确定目标、`2.4 / 3.2 / 2.8s` 连续响应和限加加速度运动；可见性/深度预测复用唯一 LOD Worker，最高每 `500ms`提交一次；固定步渲染使用 Hermite 位置与最短路径四元数插值。
- R9 不调整星体视觉、巡航整体速度、Explore 操作或可见性硬下限。专项模拟、TypeScript、Vite、R6/R8/Worker 回归、文档和差异检查已通过；用户确认稳定巡航效果成立，但随后发现 Explore 返回锚点后仍存在两次额外滑动和一次跃迁，因此 R9 完整产品视觉为 `FAIL`。
- M1.3g-R10 冻结并原子恢复巡航 previous/current 检查点、插值、accumulator、当前/目标 Guidance、目标保持余量、Worker 评估余量、连续安全状态、epoch、深度和 LOD。到达锚点后直接续播原轨迹，不再创建 handoff。
- R10 返回后三秒只发布相机、Guidance、Worker revision、fallback、LOD/深度哈希与持续实体投影诊断；旧 epoch 响应永久丢弃，旧 900ms 健康审计不能触发 fallback。三秒结束后按冻结时剩余时钟恢复正常 Worker 调度。
- R10 自动退出门包括 R6/R8/R9/R10 回归、生产构建、Rust 增量检查、文档审计和差异检查；产品退出门是在 Tauri balanced 中对立即退出、滚轮、拖拽、平移及组合操作逐一观察锚点后至少五秒，只允许一条自然巡航轨迹。
- 用户已经在最新桌面开发版确认 R10 修复完成，并认可当前双背景整体效果；M1.3g 据此以技术与产品视觉 `PASS` 结束，后续 M1.3h 不得改写其巡航、Explore、精确返回和恒星材质基线。

#### M1.3b-2 扩展动态聚焦（已并入 M1.3c 阶段 1）

- 聚焦常驻论文和热点。
- 按需解析并显现快照内未抽样论文。
- 将活动库新增实体作为明确的“新信号”处理。
- 覆盖多实体、取消、切换和会话焦点缓存。

### M1.4 参数实验室与人工选择

- 交付沉浸视图的空闲、思考、聚焦和上下文抽取动态材料。
- 对照理论视图验证身份一致、空间解释清晰和显式切换边界。
- 提供固定时间 4K 原图和 15–30 秒动态视频。
- 完成 Iris Xe、RTX 4060、窗口与全屏性能验收。
- 用户选定主视觉后才进入默认 Agent 首页集成。

## M1 退出门槛

- 最终流动形态由动态材料人工选择，不由静态指标自动决定。
- 语义星保持锐利，不使用时间透明度闪烁、景深模糊或拖影。
- 任意库内论文均具有明确、可追溯的聚焦行为。
- Iris Xe 空闲达到 30 FPS、回答状态达到 24 FPS，或自动稳定降级达标。
- 默认首页、正式 Agent 后端和数据库在 M1 选择完成前保持不变。

## 全文阅读与机构来源轨道

该轨道不改变现有论文库、会话库或 Agent 协议。M2.0c-L0 已实现基础探针，L0-R1 将用户导航改为正式 SSO，L0-R2 修复官网 JavaScript 壳与同域动态配置的真实结构，并已由用户完成原生访问验收。L1a 已建立应用内隔离机构会话；L1a-R4 将默认主路线从 OPAC 馆藏目录纠正为论文级统一学术发现，馆藏目录仅保留为辅助来源，其余阶段仍按退出门槛推进。

### 面向最终产品的统一实施序列

这条序列把现有 L/F/M 编号映射为一个连续产品闭环。机构网页只负责登录、原始记录、供应商专用交互和故障回退；每个阶段的主交付都必须回到 Sidera 原生数据与工作流，不能以“成功打开更多网页”作为完成标准。

```text
研究问题
  → 统一论文发现
  → 规范化、去重与来源合并
  → 受控题录导入
  → 单篇全文获取与文档版本治理
  → 解析、页码锚点与本地索引
  → 原生阅读、批注与证据跳转
  → Agent 检索、比较、综述和报告
  → 热点、星图、运行记录与可复现成果
```

| 产品阶段 | 对应工作包 | 主要任务 | 退出门槛 | 当前状态 |
| --- | --- | --- | --- | --- |
| P0 研究入口与本地 Agent 基座 | M1、M2.0a–M2.0b-R4-R3 | 桌面壳、Agent 会话、本地论文 RAG、证据引用、后台连续性 | 可持续对话并使用本地题录证据；空间壳与运行状态稳定 | 基础已实现，部分真实 Provider/视觉验收独立保留 |
| P1 机构会话与论文发现 | L0–P1c-R3、开发 014-R3 输入窄修 | 机构访问、登录、数据库直达、原始记录与全文跳转；自动发现适配器保留实验资产 | 手工机构主链有界可用；输入窄修须重新通过主窗口点击、认证关闭恢复与 WebView hide/show 原生门；适配器不再阻塞数据基座 | PARTIAL / ADAPTER DEFERRED |
| P2 受控题录导入与论文身份 | P2a–P2b-R1 | 文件与机构后台候选共用审查、字段依据、身份匹配、冲突决定、受控主库写入和早期 v14 安全补全 | P2b-R1 兼容补全与 P2b 整批原子提交、只填空值合并、账本对账、幂等及安全回滚均通过原生验收 | P2b-R1 IMPLEMENTED / PRODUCT UNVERIFIED |
| P3 文档身份与单篇全文获取 | F1 | Paper/Document/Version 分离、来源与获取记录、哈希存储、单篇获取、版本选择 | 至少一篇机构全文和一篇本地全文进入不可变文档基座并可回溯 | F1a IMPLEMENTED / PRODUCT UNVERIFIED |
| P4 全文解析、索引与阅读 | F2–F3、开发 015–016 | PDF 文本/版面/页码解析，稳定页证据、FTS/E5、原生阅读与持久批注 | 搜索、选择和批注能定位精确页码；重启和重解析后文档、阅读位置与用户证据稳定 | PARTIAL / R2 IMPLEMENTED / NATIVE GATES PARTIAL PASS |
| P5 证据型科研 Agent | F4、后续 M2.1 | 跨来源检索、选段/页面/章节工具、比较、综述、证据问答和阅读建议 | Agent 输出带论文、版本和页码锚点；证据不足与推断可区分 | PLANNED |
| P6 多库连接器与检索编排 | F5、M3 | 通用发现、标准题录接口、链接解析器和重点供应商专用适配器 | 同一查询可调度多个来源，统一去重、失败隔离并回到同一导入/文档管线 | PLANNED |
| P7 成果沉淀与发布质量 | M4–M5 | 笔记、报告、热点、星图、任务复现、备份、性能、安装与发布验收 | 从问题到可追溯成果完成真实项目级闭环并通过发布门 | PLANNED |

P1 不再以供应商网页自动筛选和结构化抽取的完整原生通过作为 P2 硬门槛。P2 先消费稳定的 CSV、JSON、JSONL、NDJSON、BibTeX 与 RIS 文件；未来已验收机构快照再接入同一候选接口。P2a 不负责 PDF 解析或主库写入，并为 P3/F1 预留来源、论文身份和文档版本接口。

开发 009 已把首个机构快照接入该接口，但不改变 P1 的冻结结论。结构化接口或同 UDF 后台请求是目标优先级；当前实际候选仍由隐藏同 UDF 的 DOM 实验回退产生，协议勘察只记录可能的更强路线，尚未把它接成正式传输。正常检索不主动展示网页，认证与原始记录核对才显示官方表面。P2a-R1仍只创建审查批次，正式主库写入继续属于P2b。

### L0 武大 aTrust 与全馆发现接入探针

- 首个机构固定为武汉大学，用户在外部 aTrust 中自行完成登录；Sidera 只读检查客户端安装/运行，不接收账号密码，也不把客户端运行等同于数据库登录。
- 设置页长期保留官网、MetaERS 数据库导航和动态统一发现诊断；HTTPS 仅访问 Rust 登记域名，限 2 并发、8 秒、5 次白名单内重定向和 256 KiB。
- 数据库直达端点只用于无 Cookie 后台诊断；用户导航必须从武大官网解析 MetaAuth SSO。aTrust 运行、图书馆官网登录与供应商数据库会话分别记录，不互相替代。
- 从公开响应尝试提取数据库名称、类别和入口，形成统一发现、题录导出、在线跳转、全文解析入口和专用适配器能力矩阵；没有稳定结构化目录时明确使用系统浏览器路线。
- L0 不搜索付费 Provider、不下载全文、不写论文库、不扩展旧 CNKI Selenium。普通检测、阅读和导航不增加重复审批。

状态：原 L0 自动技术 `PASS`、原生访问 `FAIL`；L0-R1 自动夹具 `PASS`，但因未覆盖真实 JavaScript 壳而原生复验 `FAIL / SUPERSEDED`；L0-R2 自动技术与用户原生访问均已通过，记录为 `NATIVE ACCESS PROBE PASS`。

退出门槛已满足：用户在 aTrust 登录后确认正式 MetaAuth 路由和馆藏多库检索可用，并完成“人工智能”和“machine learning”查询。该结论不宣称全馆接入、题录导入或全文能力完成。

### L1a 应用内机构会话与多库检索预览

- 在“文献工作台”内提供 Rust 所有的隔离持久机构 WebView；官方页面负责登录，Sidera 不读取 Cookie、表单或凭据，系统浏览器降级为备用路线。
- 默认由 Sidera 原生界面提交查询、展示来源桶和结构化首屏结果；固定版本适配器只运行 Rust 内置脚本，远程页面不获得 Tauri capability 或任意 IPC。
- 搜索快照只保存在 Rust 运行内存，切换普通页面不中止；登录失效、结构漂移、服务异常和零结果必须明确区分。
- L1a 不写论文库、不下载全文、不调用 AI Provider。

退出门槛：在 Sidera 内完成一次官方登录，重启后会话仍可用；“人工智能”和“machine learning”均返回原生结构化结果与可打开详情；跨页面检索连续，论文 revision、下载数和 Provider 调用数保持不变。

### L1a-R4 论文级统一发现与馆藏目录降级

- 默认“学术论文”动态解析武大当前统一学术发现入口，只接受期刊论文、会议论文和学位论文；入口无法解析时明确`BLOCKED`，不得用 OPAC 图书结果替代。
- “馆藏目录”使用`whu-opac-catalog-v3`按完整书目容器清理脚本与辅助节点、选择唯一题名并按稳定记录身份去重，只承担图书、期刊馆藏和索书信息查询。
- 两种来源拥有独立内存快照和就绪状态；数据库 SSO 只证明认证完成，不替代来源 DOM、真实查询提交与结果身份门。
- 论文题录与全文入口都由 Rust 保存不透明定位；本阶段只应用内查看，不入库、不下载、不解析全文、不调用 AI Provider。

原生进度：用户已确认机构认证、数据库 SSO/直达以及官网手工检索与非图书资源逐级全文访问可用，历史记为`NATIVE CORE WEB FLOW PASS`。该结论只证明手工网页连接层，不证明 Sidera active search 的原生结构化发现。最新实机中 active search 的弹窗被导航回主 WebView、真实分面未确认且结构化结果为 0，准确结论为`NATIVE ACADEMIC DISCOVERY FAIL`。

P1 当前最高优先级原生短门是开发 014-R3 输入窄修复测：主 HWND 保持 enabled，网页 popup 可创建和关闭，认证关闭后主窗口物理可点击，共享机构 WebView 的 hide/show 不被迟到请求反转，正常/最大化窗口均无输入锁定。开发 007 只完成 owner 类型与绑定的自动窄修，其原生所有权证据原本就是 `UNVERIFIED`；自动发现筛选和结构化抽取继续作为实验适配器，不阻塞 P2。

### L1b 受控题录导入

- 在线结果先作为带 provenance 的临时题录；进入本地论文库前执行字段映射、去重、来源记录和用户可见确认。
- 导入只消费 L1a 的已验证快照与不透明结果身份，不允许前端传入任意 URL 或伪造来源。
- 全文不在 L1b 直接解析；导入元数据与后续文档获取保持独立。

退出门槛：至少一条中英文查询能够选择、预览并受控导入题录；重复项、缺失字段、部分来源失败和撤销/失败路径均可追溯。

### 开发 010 / P2a-R2 后台检索快照权威化与跨页连续性修复

状态：`IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE CONTINUITY UNVERIFIED`；P1保持`PARTIAL / ADAPTER DEFERRED`，P2仍停留在P2a。

1. 研究检索状态拆为稳定展示快照、活动尝试和独立失败；启动新检索不清空旧结果，只有成功、部分成功或明确零结果才能原子晋升展示快照。
2. 学术DOM传输绑定完整任务令牌并退出公共旧事件流；`clientRequestId`保证用户按钮、回车和兼容入口重复触发幂等。迟到eval、旧WebView和旧任务回调不得覆盖终态快照。
3. 状态读取和事件监听上移到App根级；普通页面导航只改变可见组件，不拥有检索生命周期。失败或取消保留上一份成功结果和候选选择，SSO恢复只清理机构作用域的旧错误通知。
4. 用户已确认开发009中文10条/2来源、英文9条/4来源和审查创建`PASS`；跨页连续性与过期SSO通知为`FAIL`。开发010自动门已形成P2b输入契约，但不因此把其原生连续性门改写为`PASS`。

### 开发 011-R1 / P2b-R1 早期 v14 兼容识别与安全补全

状态：`IMPLEMENTED / AUTOMATED TECHNICAL PASS / PRODUCT UNVERIFIED`。开发 011 首次原生初始化暴露早期 v14 库未满足完整治理契约的问题，其产品结论更正为`PRODUCT FAIL / SUPERSEDED`；开发 011-R1 只修复该兼容边界，不替代受控提交与回滚的原生验收。

1. 不再只按`PRAGMA user_version=14`判断数据库可用，而是只读检查表、列、索引、外键和治理契约，将 v14 精确分类为`current-v14 / known-precontract-v14 / unknown-invalid-v14`。
2. `current-v14`直接进入严格验证，不生成兼容备份、不改写数据库；重复打开保持幂等。
3. `known-precontract-v14`仅接受已登记的早期签名；先生成独立`.pre-v14-contract.<timestamp>.sqlite`备份并记录SHA256，再在`BEGIN IMMEDIATE`事务中补齐缺失契约。已有论文、来源、别名、提交账本和审查决定不得被覆盖。
4. 补全提交前后均校验文件指纹、完整v14契约与外键；任何失败整笔回滚，原库保持补全前状态。重新打开已补全库应分类为`current-v14`且不再生成第二份备份。
5. `unknown-invalid-v14`立即拒绝且零变更，不自动猜测、重建或覆盖；界面明确区分当前契约、已知早期契约和未知无效契约，并显示安全备份路径与哈希。
6. 自动验证只使用临时合成数据库，不升级用户当前所选真实论文库。完整原生兼容、受控提交、重启对账、幂等和安全回滚通过前不得记录`NATIVE CONTROLLED IMPORT PASS`。

### 前序开发 011 / P2b 受控主库提交与来源治理

状态：`IMPLEMENTED / AUTOMATED TECHNICAL PASS / PRODUCT FAIL / SUPERSEDED`。P1保持`PARTIAL / ADAPTER DEFERRED`；P2已进入P2b，但首次原生初始化因早期v14契约不兼容失败，现由开发011-R1接管兼容修复；P2c与F1均未开始、未完成。

1. 主论文库升级为schema v14，审查库升级为schema v3。主库增加提交账本、提交项、来源记录和身份别名；主库提交账本是提交/回滚事实的唯一权威，审查库只保存预览、决定与可由主库账本修复的状态投影。
2. 只有逐条决定完备且没有阻塞项的整个批次可以生成提交预览。预览绑定`previewId + previewHash + batchVersion + expectedRevision`；执行时重新验证全部输入，过期预览、批次变化或主库revision变化均拒绝。
3. 提交以整个批次为一个SQLite事务：新记录插入，合并仅填充主库空字段，既有非空字段一律保留；同时写入`paper_source_records`、`paper_identity_aliases`、提交项、提交账本和revision。任何候选、约束或账本写入失败都整批回滚。
4. `clientCommitId`与主库提交账本提供幂等权威；重复请求返回既有提交，不重复创建论文或来源。进程异常后先读取主库提交账本，再对审查状态执行best-effort reconciliation，不自动重放写入；即使辅助审查库暂不可读，也不得隐藏有效提交历史。
5. 回滚仅在整批都能证明安全时执行，并同样保持all-or-nothing。插入记录被后续引用、合并目标已发生后续编辑、身份别名冲突或revision前提不成立时拒绝整批回滚；不提供强制回滚。
6. P2b只处理题录、身份与来源治理；不自动生成热点，不获取、下载或解析全文，不调用Provider。完整原生提交、重启对账、幂等和安全回滚通过前不得记录`NATIVE CONTROLLED IMPORT PASS`。

### 开发 009 / P2a-R1 武大后台检索连接器与原生审查闭环

状态：`IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE PARTIAL PASS / CROSS-VIEW CONTINUITY FAIL`；P1保持`PARTIAL / ADAPTER DEFERRED`。

1. 新增UI无关的`LiteratureConnector / ResearchSearchOrchestrator`与`whu-academic-discovery-v2`能力契约，状态覆盖会话检查、等待用户认证、连接器解析、检索、规范化、完成/部分失败/失败/取消；当前可执行传输仍明确报告为`whu-academic-discovery-v1-dom-fallback`。
2. 连接目标优先级固定为结构化接口、同UDF隐藏请求、实验DOM回退；协议勘察已接入脱敏路由判断，但结构化/同会话请求尚未成为候选生产者。正常蓝色检索不主动打开网页，认证失效时仅显示官方登录窗口并在成功后恢复同一`searchId`。
3. 论文候选统一为`SideraNormalizedCandidateDraft`，只接收期刊、会议和学位论文；图书、未知类型、菜单与脚本记录排除，来源失败彼此隔离。供应商记录身份固定为“来源数据库＋供应商记录 ID”，不能跨来源误合并。
4. 前端只接收不透明候选ID与题录/全文能力定位；原始敏感URL只留在Rust内存。进入审查时允许保存已删除ticket、token、session等认证参数的规范身份URL，不保存原始认证查询。当前搜索不读取Cookie，预留的临时Cookie容器未接入运行检索；Cookie、完整敏感URL均不进入前端、日志、证据或额外持久化。
5. 用户选择当前快照候选后创建现有P2a审查批次；必须校验searchId、generation、候选实际生产适配器版本和候选ID，批次写入`Sidera/import-review-v1.sqlite`，主论文库继续只读。
6. 原生完成门为中英文非空结构化论文、至少两个真实来源、跨页连续、登录恢复、审查批次重启恢复、显式原始记录核对，以及论文数/revision/下载/Provider零非预期变化。

### 前序开发 008 / P2a 文件题录审查与身份基座

状态：`IMPLEMENTED / AUTOMATED TECHNICAL PASS / PRODUCT UNVERIFIED`。

1. 六类文件进入统一候选模型，损坏行和缺失字段保留为无效候选，不自动补写。
2. 身份依据固定为 DOI、来源＋供应商记录 ID、规范 URL、题名＋第一作者＋年份；分类为`new / merge / conflict / invalid`。
3. 审查批次与逐条决定只写`Sidera/import-review-v1.sqlite`；`research-hotspots-v7.sqlite`以只读连接参与匹配，P2a不改变其 Schema、revision或论文数量。
4. 用户可以创建、恢复、打开、决定或放弃批次；正式提交主论文库属于 P2b。
5. 原生验收使用小型 RIS/BibTeX，验证依据、重复、冲突与决定跨重启保存，同时核对主论文库零变化。

### F1 来源、许可与文档身份基座

- 定义论文实体与全文文档版本的多对多关系；同一论文可以关联作者稿、出版社版、扫描版和用户批注副本。
- 原始文件以内容哈希不可变保存；来源、URL、DOI、供应商、获取时间、访问方式、许可/限制和用户授权单独记录。
- 区分 `用户上传 / 合法下载后导入 / 开放获取 / 机构授权 / 未知来源`，未知来源不得自动外传或批量处理。
- 首期只承诺 PDF；HTML、EPUB、Word、整期期刊容器和补充材料在接口稳定后评估。
- F1a本地路线采用“先选PDF、后明确关联PaperEntity”，不使用文件名、目录或PDF正文推断身份，也不继承机构来源；机构路线先按不透明SourceRecord ID打开经Rust验证和脱敏的官方题录/全文解析入口，再从用户明确完成的单篇下载凭证精确解析回同一SourceRecord，歧义或无匹配时拒绝接入。来源解析、来源导航、下载选择、来源匹配和PDF校验失败必须保存带阶段与错误码的AcquisitionRecord，不创建DocumentVersion，并允许用户在条件修复后显式重试。

退出门槛：任意全文都能回溯到原文件和来源记录，重复文件/版本不会覆盖，删除派生索引不影响原文。

### F2 全文解析、页码锚点与本地索引

- 原生文本 PDF 优先提取字形、阅读顺序、章节、页码、参考文献、图表标题和页面坐标。
- 扫描件进入可选 OCR；OCR 文本必须标记置信度，并与原始页面图像保持坐标映射。
- 建立文档级 FTS/BM25 与 E5 语义索引，检索结果必须返回文档、版本、页码、章节和文本范围。
- AI 不读取“无限整篇文本”；长文任务使用分层检索和摘要，并保留每层证据锚点。

退出门槛：搜索、引用点击和 AI 回答均能定位到精确页面/文本范围；OCR 与原生文本不会混淆。

### F3 沉浸式论文/期刊阅读台

- 作为“文献与建模 → 阅读与详情”的正式子空间，支持连续页/单页、缩放、目录、页码跳转、全文搜索、选择、批注和阅读位置恢复。
- 论文星、热点、对话引用和报告引用均可深链接到同一阅读实体；有页码锚点时直接定位对应证据。
- 阅读状态使用低干扰深空背景，不让星空运动、标签或侧栏遮挡正文。
- 期刊整期先作为“卷期元数据＋目录＋文章集合”表达，不把整期扫描文件强行伪装成一篇论文。

退出门槛：本地 PDF 在桌面端可以稳定、清晰、连续阅读，重启后恢复位置，引用跳转和版本身份正确。

### F4 AI 阅读辅助侧边栏

- 采用上下文工具，而不是固定死四个按钮；首批候选为翻译、总结、解释和文档内自由问答。
- 操作范围必须明确为 `选中文本 / 当前页 / 当前章节 / 当前文档 / 关联文献集合`。
- 结果必须引用页码、章节和文本锚点；无法定位证据时明确标记推断或失败。
- 默认只向用户配置的模型供应商发送最小必要片段；发送全文、图片、表格或敏感文档前显示范围和供应商并取得确认。
- AI 结果与用户批注分离，允许复制、保存为阅读笔记或加入对话，但不得改写原文。

退出门槛：至少完成一次选段翻译、章节总结、方法解释和带页码引用的自由问答；取消、失败、断网和模型未配置状态均可恢复。

### F5 校园图书馆与机构来源连接器深化

按风险从低到高分阶段：

1. 发现与跳转：学校馆藏目录、OPAC、OpenURL/链接解析器、DOI 和数据库落地页。
2. 正式元数据接口：OAI-PMH、Z39.50、供应商 API 或学校明确开放的服务。
3. 用户授权单篇获取：用户在系统浏览器或机构页面自行登录，程序只接收明确下载的文件或正式回调结果。
4. 供应商专用连接器：在学校许可和接口条款允许时增加检索、全文获取、配额和审计适配器。

禁止通用账号密码采集、浏览器 Cookie 导出、验证码/付费墙/IP 限制绕过和无人值守批量下载。每个连接器必须声明实际能力、访问范围、速率和许可边界。

退出门槛：至少一个真实学校/机构环境完成“发现→用户授权→单篇获取→来源记录→阅读台打开”的完整闭环；未授权、会话过期、无全文权限和供应商限流均有明确错误。

### 依赖与待决策门

```text
M2 本地混合检索
  → L0 武大 aTrust 与全馆发现探针
  → L1 直接统一搜索 / 可见浏览器题录导入 / 混合模式
  → F1 文档身份与来源治理
  → F2 全文解析和页码索引
  → F3 沉浸阅读台
  → F4 AI 阅读辅助

M3 受控在线检索
  → F5 校园图书馆/机构连接器深化
  → 获取的全文回到 F1，而不是绕过文档治理
```

首个目标学校和登录方式已锁定为武汉大学外部 aTrust。进入全文阶段前仍需确认首期文件格式、OCR 优先级、翻译呈现方式和外部模型可接收的内容范围。
## M1.3m 统一星空外壳与空间页面（技术与用户视觉 PASS，已冻结）

状态：`PASS / FROZEN`

1. 将 Agent 背景生命周期提升到根级 Shell，并增加 `agent / workbench / research-galaxy / pipeline-formation` 场景所有权。
2. 删除普通页面永久实体侧栏，统一透明标题栏和覆盖式导航；当前项仅使用中性亮度强调。
3. 普通工作页固定复用低亮、20% 流速的 `star-river`，并迁移到一体化悬浮工作台。
4. 科研星图使用现有沉浸布局并独占空间；经典布局仅保留为开发回归入口。
5. 为热点建模建立空间过程所有权与进度契约；完整凝聚动画在后续独立工作包实现。

早期视觉问题由 R1–R3 连续修订。用户最终实机确认统一外壳与科研星图暂时没有问题，单渲染器、工作页星河、边缘导航、标题栏工具和单一详情轨道据此以技术与用户视觉 `PASS` 冻结，后续只做回归维护。

## 当前工作包：M1.3m-R1 工作台可读性与全局控件安全区修订

状态：`IMPLEMENTED / TECHNICAL PARTIAL PASS / PRODUCT UNVERIFIED`

1. 导航入口移至左上 `SIDERA` 品牌旁，删除页面右上重复入口，并统一标题栏和窗口控制区安全变量。
2. 密集工作页在导航展开时使用 `workbench-reserve` 平滑右移收窄；空间页面保持 `spatial-overlay`，画布和相机不动。
3. 工作页星河强度提升到 `0.34`、速度保持 `0.20`；主工作台改为约 94% 不透明的纯黑细线表面。
4. 产品科研星图沿用空间展示参数但移除“全屏”按钮；开发评审和经典布局继续保留旧开关。
5. TypeScript、Vite、六项 Shell/工作台/空间/文档专项与差异检查已通过；Rust 因设备已有 Cargo 开发链而延后，原生桌面视觉仍待验收，不以静态审计替代实机结论。

退出门槛：导航与工作台无重叠；工作页外围星河清晰、面板内部不干扰正文；工具栏不侵入窗口控件；产品科研星图无重复全屏按钮；桌面多页面与缩放档人工验收通过。
6. 通过单活动渲染器、状态恢复、工作台连续性和 Tauri 低负载验收后，再由用户判断产品视觉。

当前技术进度：根级场景、全局透明导航、普通工作页星河、一体化工作台、科研星图独占画布和流水线空间状态契约已经完成前端实现；TypeScript、Vite、Rust 增量检查、四项专项、旧壳回归、文档和差异检查为 `PASS`。原生桌面已经通过 Agent、文献工作台、科研星图的短时往返，理论/随机恢复、聚类运行态和多缩放档仍是退出门，不得提前标记产品 `PASS`。

## 当前工作包：M1.3m-R2 科研星图相机稳定与空间面板整合

状态：`IMPLEMENTED / TECHNICAL PARTIAL PASS / PRODUCT UNVERIFIED`

1. 将展示/理论模式切换改为原屏相对姿态的原子场景层交接，移除模式变化触发的自动 `fit` 和相机重建。
2. 压缩左上控制台；空间导航打开时只折叠筛选与图例，不移动 WebGL 画布。
3. 将模式工具栏固定到标题栏下缘，并把热点证据、热点 Inspector 和论文阅读合并为单一右侧信息轨道。
4. 详情轨道打开时仅改变相机投影中心，向左让位约 8%；世界坐标、画布尺寸、FOV 和保存姿态不变。
5. 通过连续模式切换、导航避让、热点/论文层级、投影恢复和多缩放档审计后，再进行低负载 Tauri 视觉验收。

当前进度：Renderer、Camera 与 Canvas 已跨展示/理论模式持久化，页面级自动 `fit` 已移除；紧凑筛选、导航折叠、单一右侧信息轨道和 8% 投影让位已完成。TypeScript、Vite、R2 专项、空间页面、工作台导航、理论相机和热点过渡均为 `PASS`。旧视觉不变量黄金哈希与 M1.3g 已批准的系统论文可见度实现不一致，Rust 因现有开发链与蓝屏保护延后，真实 Tauri 交互因自动化窗口边界异常保持 `UNVERIFIED`，因此当前只记技术部分通过，不提前关闭工作包。

退出门槛：模式切换无自动旋转、黑帧或重复相机写入；所有 HUD 无重叠；右侧详情默认关闭且内容互斥；投影让位与恢复连续；星体材质、理论 XYZ、热点飞行和论文近景不回归。

## M1.3m-R3 科研星图顶部工具化、边缘导航与详情轨道修复（已通过并冻结）

状态：`PASS / FROZEN`

1. 产品科研星图取消左上/左下常驻 HUD，将模式、筛选、适配、层级操作和更多工具统一挂载到 Sidera 标题栏。
2. 产品界面取消可见导航按钮，使用 8px 左缘热区、150ms 停留门和 `Alt+N`进入同一透明导航；空间画布不移动。
3. 将右侧热点、论文摘要和论文阅读收敛为唯一带实体 ID 的状态轨道，标题与正文原子交接，关闭按钮独立绝对定位。
4. 保留 R2 的持久 Renderer/Camera、原屏展示/理论切换和 8% 投影让位；工具和导航不得写入世界坐标或触发自动 fit。
5. 自动构建和 R3 专项通过后，以 balanced Tauri 短时验收边缘触发、标题栏安全区和 20 次详情层级往返。

退出门槛已经满足：产品路径无常驻左侧 HUD；标题栏工具和窗口控制无碰撞；导航可访问；详情轨道无多状态叠加；用户已确认当前统一外壳与科研星图无明显问题。

### 开发 006 / P1c-R2 原生研究双栏与侧边机构浏览器收口

状态：`IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE SPLIT WORKSPACE UNVERIFIED`；P1 保持`IN PROGRESS`。用户已确认 P1c-R1 固定网页视口的滚动性能`PASS`，同时确认网页独占窗口令产品构图与原生功能连续性`FAIL`。

1. 用户可见构图改为`closed / split / immersive`。关闭网页时原生文献工作台全宽；打开数据库、原始记录或全文默认进入双栏；沉浸网页只能显式进入，不能由链接或认证自动触发。
2. 宽屏默认50/50，分隔条支持指针拖动、方向键每次2%和`Home`复位；比例在30%–70%与原生420px、网页640px动态最小宽度内解析，并以版本化偏好跨重启保存。
3. 左侧保留来源切换、搜索、停止、认证/错误、脱敏轨迹、来源桶、结构化结果、题录和全文入口；右侧保留标签、地址、导航、下载、认证与 popup 状态。两侧独立滚动，来源切换和普通页面切换不得销毁另一侧状态。
4. 小于1180px时逻辑仍为`split`，但一次只显示“原生研究”或“机构网页”；打开网页目标时自动切网页面，返回原生结果只切可见面，不重建 WebView 或快照。
5. WebView bounds只由初显、显隐、活动标签、窗口/真实布局变化和分隔条拖动更新；拖动用`requestAnimationFrame`合并，每帧最多一次，普通滚轮与两侧内部滚动产生0次 bounds IPC，geometry不抢焦点。
6. 该完整网页构图门保留为产品回归证据，但已被开发 007–008 的路线调整取代为非阻塞项；不得据此把 P1 写成 COMPLETE，也不得阻止 P2a 的独立审查基座。

### 开发 007 / P1c-R3 主窗口所有权窄修

状态：`IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE MAIN WINDOW OWNERSHIP UNVERIFIED`；P1冻结为`PARTIAL / ADAPTER DEFERRED`。

1. 所有应用自有结果面和认证/popup窗口统一从`app.get_window("main")`取得顶层宿主。
2. Windows 使用主窗口 HWND 与`owner_raw()`绑定，非 Windows 无 owner 降级；禁止`parent_raw()`与主`WebviewWindow`假设。
3. 保留共享 UDF、真实 opener/POST、`window_features`与任务代际隔离。
4. 原生短验收只检查蓝色检索、网页 popup、认证关闭恢复和知网/WOS/滚动/分栏回归。

### 开发 005 / P1c-R1 真实弹窗语义与固定浏览器视口修复

状态：`IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE POPUP AND PERFORMANCE UNVERIFIED`；修复前最新实机基线为`PROVIDER ACCESS PASS / POPUP ROUTING FAIL / EMBEDDED BROWSER PERFORMANCE FAIL`，P1 继续`IN PROGRESS`。

1. 普通 HTTP/HTTPS popup 不再`Deny`后把目标 URL 作为 GET 重放。应用先以相同 WebView2 UDF/environment、`window_features(features)`与`NewWindowResponse::Create`建立受管独立窗口，保留 opener、POST 和窗口生命周期；顶级危险 scheme 与远程 capability 边界不变。
2. popup 状态绑定`popupId + openerTabId + generation`，只记录创建时间、脱敏 origin/path、transient/interactive/stable-content/auth 阶段、处置和安全错误码。关闭、取消、超时或过期后的迟到回调不能新建标签或覆盖新状态。
3. `whu.metaersp.com/loading`是窄连接器 bridge，不生成普通标签。opener 已进入 CNKI、WOS 或同一规范供应商目标时关闭 bridge；bridge 自身到达可用页面但无法证明安全 GET 时保留应用窗口。安全 GET 迁移仅在显式证据成立时允许，30 秒未收口返回`SIDERA_INSTITUTION_POPUP_BRIDGE_TIMEOUT`。
4. 浏览器显示时进入固定专注工作区：仅保留 Sidera 标题栏、标签/导航工具栏、下载入口和“返回原生结果”；机构控制与原生结果隐藏，网页占满剩余视口，外层工作台`overflow:hidden`，只有 WebView 页面内部滚动。
5. bounds 仅由首次显示、显隐、活动标签切换、窗口 resize/maximize/缩放与真实工具栏布局变化更新；`<1px`变化为 no-op。Rust 只对活动标签执行一次`set_bounds(Rect)`，几何、显隐和 focus 分离，geometry 永不触发 focus。
6. 原生退出门：CNKI/WOS及另一供应商无`/loading` ghost且只留一个可用页面；认证 popup 完成并回父页；快速滚轮无黑条/追赶；3–5 标签在正常/最大化和100/125/150%缩放无错位；下载不回归；重启复用共享 UDF。全部通过前不得标记 P1 COMPLETE。

### 前序 P1c 通用机构浏览器内核、应用内认证与下载基座

状态：`IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE INSTITUTION BROWSER UNVERIFIED`；P1 继续`IN PROGRESS`，最新原生失败事实仍由新候选实机验收改写。

1. 用户可见机构网页统一进入主窗口内的共享浏览器外壳，提供标签页、任意 HTTP/HTTPS 地址、前进/后退、刷新/停止和显式返回原生结果；React 不拥有 WebView 创建能力。
2. 本阶段原设计让普通链接和新窗口进入应用内标签页、认证进入单例应用模态；实机证明 URL 重放会产生 MetaERSP `/loading` ghost，故普通 popup 部分已由 P1c-R1 的兼容优先 Create 语义取代。共享 UDF、认证模态与版本化状态回写继续保留。
3. hidden task WebView继续负责统一发现的查询提交、分面、分页和结构化抽取；题录、全文和当前来源以不透明定位复制到共享浏览器，不再把自动化任务面当作通用浏览器。
4. 用户手工下载的 PDF/附件进入隔离暂存目录，每项保存 manifest、大小、MIME、SHA-256和 provenance；不自动写论文库、不解析、不调用 Provider。重启可恢复清单，敏感原始下载 URL不持久化。
5. 原生退出门：验证任意网页、普通标签和认证模态分流；完成数据库/个人图书馆认证；回归统一发现、数据库直达和馆藏目录；打开题录/全文并完成一次带清单的手工下载；跨页面隐藏与重启复用正确；论文库 revision和 Provider 调用无变化。
6. 自动技术通过只产出原生候选。上述全部通过前不得标记`NATIVE INSTITUTION BROWSER PASS`、P1 COMPLETE，也不得开始 L1b 或 F1 的不可逆写入。

### 前序 P1b-R2 统一发现认证回写与任务恢复闭环

状态：`IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE DISCOVERY AUTH UNVERIFIED`；最新原生事实为`DISCOVERY AUTH CALLBACK/STATE SYNC FAIL`，P1 继续`IN PROGRESS`。

1. `databaseAuth`、统一发现检索入口`sourceReadiness`、`academicDiscoveryAuth`和`libraryAccountAuth`独立；检索入口可用但全文身份未确认时明确显示“检索可用 / 机构全文身份待确认”。
2. 结果 WebView 的合法 HTTP/HTTPS `window.open`统一进入单例应用自有认证窗口，复用 opener environment/UDF、POST 和 opener 语义；重复请求只聚焦现有窗口，非网络协议拒绝。
3. 固定`whu-discovery-auth-v1` DOM 检查确认已登录，不以域名推断。自动成功或用户关闭前均检查当前窗口及共享父页；成功后关闭弹窗、刷新并复查任务绑定父结果面。
4. active search 保存`taskId、epoch、sequence、query、result label、phase`并进入`awaiting-auth`；普通 90 秒活动超时在认证等待期间暂停。父页恢复后以同一任务进入`resuming-after-auth`并继续分面、分页、抽取与去重。
5. 取消、创建失败、认证失败和父页恢复失败使用稳定错误码并保留重试入口；popup epoch、task/epoch 和 WebView generation 隔离迟到 page-load、关闭和 timeout。自动测试不得访问机构外网、Provider、论文库或下载路径。
6. 原生完成门：最新可见 Tauri 中点击统一登录，确认弹窗已登录，自动或手动收口后主程序 ready，同一任务产出结构化论文，并在重启后复用会话。未全部通过前不得记录`NATIVE DISCOVERY AUTH PASS`或 P1 COMPLETE。

### P1b-R1 统一发现真实分面与原生快照闭环

状态：`IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE ACADEMIC DISCOVERY UNVERIFIED`；P1 总状态仍为`IN PROGRESS`，上一轮原生结论`NATIVE ACADEMIC DISCOVERY FAIL`只有最新实机闭环才能改写。

1. 产品表面固定拆为“统一学术发现 / 数据库直达 / 馆藏目录”，搜索快照仅属于统一发现或馆藏；数据库直达只显示入口登记与数据库会话状态，不生成伪造搜索结果。
2. active search 的真实`window.open`由应用自有结果 WebView 承接，并继承 opener 的 WebView2 environment/UDF；结果面绑定`taskId + epoch + sequence + webviewGeneration`，迟到事件和手工 popup 都不能生成或覆盖快照。
3. 资源类型标签先移除中英文括号计数与可访问性附加文字，再识别 hidden input、checked、aria checked/selected/pressed 及 Material/Primo 控件。每次点击后必须等待页面签名变化；确认控件互斥时顺序执行文章、会议论文、学位论文三个子检索并合并，而不是伪报三类同时选中。
4. 结构化抽取只在任务绑定结果 WebView 执行，仅接受期刊文章、会议论文和学位论文；按 DOI、供应商记录 ID、规范详情、题名＋第一作者＋年份去重。未确认筛选或没有显式零结果证据时明确失败，不能返回假 0 条。
5. 完成后默认隐藏原始网页并显示原生快照；只有“查看原始页面”才显示任务结果面。WOS、数据库直达、馆藏目录和六类只读全文路线保持不变，不下载、不入库、不解析、不调用 Provider。
6. 自动测试只使用源码契约与脱敏夹具。原生双查询、原生结构化快照、题录/全文打开、跨页、重启会话复用、WOS、馆藏清洗和库计数不变仍需用户实机闭环，因此 P1 不标记 COMPLETE。

## 前序工作包：M2.0c-L1a-R4 论文级统一发现与馆藏目录降级修复

状态：`IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE ACADEMIC DISCOVERY FAIL / SUPERSEDED BY P1b-R1`

1. 机构页默认来源改为“学术论文”，使用`whu-academic-discovery-v1`；“馆藏目录”使用`whu-opac-catalog-v3`并明确属于图书与馆藏辅助能力。
2. 数据库 SSO 与两个来源就绪状态分离，两个来源分别保存当前运行内存快照；普通页面和来源切换不终止既有任务或清空结果。
3. OPAC 按完整容器清除`script/style/noscript/template`与隐藏节点，拒绝数字、`doclist`、格式化与评级代码，先按馆藏记录身份再按规范详情、ISBN/ISSN、题名与年份去重。
4. 学术发现优先使用 L0 正式目标，缺失时由武大官网严格文字元素触发真实跳转；无法解析时返回`SIDERA_INSTITUTION_DISCOVERY_ROUTE_UNRESOLVED`，不允许 OPAC 回退。
5. 论文至少具有题名、详情定位和 DOI 或作者加来源/年份证据；只保留期刊、会议和学位论文，全文状态与定位只支持应用内跳转。
6. 自动技术验证只建立候选；全部原生完成门槛通过前不标记`NATIVE ACADEMIC DISCOVERY PASS`，也不启动 L1b。

退出门槛尚未满足：需要在最新原生 Tauri 复用现有 UDF，验证 OPAC 干净结果、两个学术查询、来源识别、题录与全文跳转、跨页和重启复用。当前不宣布原生闭环完成。

## 前序工作包：M2.0c-L1a-R3-R1 武大真实检索适配器与双会话闭环（主路线已纠正）

状态：`INSTITUTION AUTH PASS / CATALOG EXTRACTION FAIL / PRIMARY ROUTE MISALIGNED / SUPERSEDED BY L1a-R4`

1. 保留 L1a-R3 已由真实轨迹证明的 CAS/MetaAuth/MetaERS 主认证链与同 UDF 馆藏交接；适配器升级为 `whu-catalog-multidb-v2`，不再把“简单检索、多字段检索、高级检索、多库检索、检索历史”等全局导航当成文献。
2. 馆藏入口必须先被识别为检索表单；提交动作返回提交前页面签名和查询值，后续页面必须出现新签名、查询回显、来源桶、正式结果或显式零结果，否则返回 `SIDERA_INSTITUTION_QUERY_NOT_SUBMITTED`。
3. 只有带非导航标题和可验证详情定位的官方结果行才能进入快照。导航伪记录返回 `SIDERA_INSTITUTION_RESULT_FALSE_POSITIVE`，未知 DOM 返回 `SIDERA_INSTITUTION_ADAPTER_DRIFT`，没有明确零记录证据时不得显示 0 条结果。
4. 中文、西文等来源桶顺序提取，每桶最多 20 条、总计最多 40 条；单桶失败保留其他桶并标记 `partial`。详情仍由 Rust 使用当前快照中的不透明结果 ID 解析，前端不能提交任意 URL。
5. 数据库 SSO 与个人图书馆状态继续独立。个人图书馆 `ready` 必须由版本化 DOM 检查确认；域名命中不再等同于登录成功，出现账号表单时单独记录 `PERSONAL LIBRARY BLOCKED`，不阻断数据库检索验收。
6. 自动验证只产出原生验收候选；必须完成中英文真实结果、来源桶、原始记录、跨页面连续性和重启复用，个人图书馆则按真实页面记录 `PASS`或`BLOCKED`。数据库闭环通过前不得进入 L1b。

退出门槛尚未满足：最新原生实例已进入真实统一身份认证账号密码表单，隔离 UDF 未直接恢复为已登录状态；需要用户在应用内手动完成认证后继续验收。当前不宣布完整闭环，不开始 L1b；任何原生步骤失败都继续保持 `FAIL`或`IN PROGRESS`。L1a-R3 的认证证据与终态隔离继续有效，但旧 `whu-catalog-multidb-v1` 已由本包取代。

## 已完成但原生失败：M2.0c-L1a-R2 真实认证弹窗与首航恢复修复

状态：`IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE IN-APP INSTITUTION AUTH FAIL / SUPERSEDED`

1. `institution-whu` 先以隐藏 `about:blank` 创建并完成 UDF、安全配置与 WebView2 完成事件监听，再显式进入唯一正式数据库 SSO；禁止以图书馆首页静默代替未解析的 SSO。
2. 首航以 `NavigationCompleted.IsSuccess` 判定，20 秒期限只做失败兜底；重试重建子 WebView但复用 UDF，generation、epoch 和 pending revision 阻止迟到完成事件覆盖新状态。
3. 数据库 SSO 在主区域继续；个人图书馆合法 `window.open` 使用共享 WebView2 environment 的 `institution-whu-auth` 模态窗口和 `NewWindowResponse::Create`，保留原始表单、POST 与 opener 语义。
4. 模态期间主窗口禁用；成功、取消、关闭、创建失败、导航失败与程序退出均恢复主窗口。同一时刻只允许一个认证模态，未知目标继续拦截。
5. `databaseAuth` 与 `libraryAccountAuth` 独立；只有数据库认证 `ready` 可以启动检索。设置页分别展示两类状态，无 Cookie L0 探针仍不检测登录。
6. 不修改论文库、Provider、Pi、缓存或会话数据库；下载、任意远程窗口、远程 capability、Cookie/凭据读取继续禁用。

原生复验结果：主区域没有完成正式数据库 SSO，而是在 20 秒后返回 `SIDERA_INSTITUTION_NAVIGATION_TIMEOUT`。R2 只把无限灰屏变为可诊断失败，没有证明真实闭环；由 L1a-R3 的导航证据、策略分层、终态隔离和 DOM 就绪门取代。

## 已完成但原生失败：M2.0c-L1a-R1 应用内认证跳转与机构状态修复

状态：`IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE IN-APP INSTITUTION AUTH FAIL / SUPERSEDED`

合法弹窗曾被改为在主机构 WebView 中执行 URL 级普通 GET 重放；原生复验显示代理页为空并丢失 POST/opener/认证上下文，因此由 L1a-R2 的真实弹窗接管取代。

## 已完成但原生失败：M2.0c-L1a 应用内机构会话与武大多库检索预览

状态：`IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE IN-APP SEARCH FAIL / SUPERSEDED`

Rust 隔离 WebView、后台检索状态机和结构化预览通过自动验证，但真实官网通过 `window.open` 发起认证，旧实现无条件拒绝所有新窗口请求，导致应用内登录无法完成；L1a-R1 的 URL 重放仍失败，最终由 L1a-R2 修复真实首航与弹窗语义。

## 已完成工作包：M2.0b-R4-R3 Agent 长缓存默认与真实首段流式修复

状态：`IMPLEMENTED / AUTOMATED TECHNICAL PASS / PRODUCT UNVERIFIED`

1. 缓存偏好默认值升级为 `long`，策略版本固定为 v2；启动时幂等遍历全部项目设置，将未标记的 `auto`、`long`或缺失值一次性迁移为 `long`并补版本标记。
2. 迁移完成后用户显式选择的兼容模式 `auto`可跨保存、重启和新版备份恢复长期保留；旧格式备份仍按一次性迁移规则升级。上游拒绝长缓存时给出持久安全错误，不静默降级或重放付费请求。
3. Rust 删除 512 字节正文判定缓冲，普通回答的首个 `text_delta`立即进入前端；`toolcall_start`只控制显示门并通过 `assistant-replace`撤回未核验前言，不改变工具白名单与审批安全边界。
4. 系统工具结束后立即释放下一段最终回答；RAG 继续等待概况、无结果或证据 `finalize`后放行。停止保留已显示的普通正文，隐藏工具旁白不在结算时补块，证据失败使用精确替换。

退出门槛：自动验证不得调用付费 Provider；原生 Tauri 必须确认旧 `auto`升级为 `long`、显式兼容模式可持久保留、真实 Provider后续轮次出现可核实的缓存用量、短长回答从首字连续流式、工具旁白不泄漏且跨页面导航不中止。用户确认前保持 `PRODUCT UNVERIFIED`。

## M2.0b-R4-R2 Agent 后台连续性与清透光学玻璃修复

状态：`IMPLEMENTED / AUTOMATED TECHNICAL PASS / PRODUCT UNVERIFIED`

1. 普通页面导航不再拥有 Agent 轮次生命周期；Pi 流式回答、检查点、工具等待和会话上下文继续运行。停止、项目/模型配置、会话切换与破坏性会话操作继续使用明确停止或确认。
2. Agent 以外页面在统一标题栏显示运行、审批、完成和失败状态；运行态提供返回与停止，审批只返回 Agent 面板处理，完成提示 3 秒关闭，错误保持到用户关闭。
3. 对话框、历史抽屉、折叠输入和标题栏状态共享清透光学变量：18px 模糊、34%外壳、连续 58%烟熏阅读层；移除左上灰雾和逐回答矩形卡片，保留所有无障碍降级。
4. 主 Rust lib 禁止测试目标，独立 Tauri-free harness 成为唯一标准会话测试入口；旧 build artifact保留但不会被项目脚本执行。

退出门槛：自动验证不得调用付费 Provider；原生 Tauri 必须验证回答中跨文献、热点、星图、设置和运行中心导航仍连续，标题栏状态与星图工具不重叠，审批可返回处理，1100/1360/1920px 与 100%/125%/150% 下材质无灰斑、正文清晰并保留星点。用户确认前保持 `PRODUCT UNVERIFIED`。

## M2.0b-R4-R1 Agent 会话存储与诊断修复

状态：`IMPLEMENTED / AUTOMATED TECHNICAL PASS / PRODUCT UNVERIFIED`

1. 将会话 v1 Schema 固定为独立、保留换行的 SQL 文件，清除全部会吞空格的 Rust `\`跨行 SQL；WAL/外键、事务建库、结构验证和 `user_version=1`形成两阶段打开流程。
2. 对兼容的残缺 v0 库原地补齐 `turns / project_state`、索引和级联外键并保留已有会话；不兼容结构明确失败，不自动删除、重建或重放 Provider 请求。
3. 新增 `sidera_agent_local_readiness`，设置页把 Provider、会话存储、Pi 运行时分别展示；三项全部通过才宣布 Agent 可对话，长 SQLite 错误只进入可展开技术详情。
4. 会话定向测试改由不依赖 Tauri 桌面运行时的 Rust harness 执行，覆盖新库、残缺库修复、行保留、CRUD、搜索、归档/恢复、级联删除、中断和项目隔离；测试 EXE 不导入 `TaskDialogIndirect`。

退出门槛：自动验证不调用付费 Provider且全部通过；原生 Tauri 必须在不删除原残缺库的情况下恢复，设置三项检测准确，首条消息可发送，重启后历史 CRUD 正常，并确认不再出现 Windows 入口错误。人工确认前保持 `PRODUCT UNVERIFIED`。

## M2.0b-R4 Agent 会话、工具能力与 Liquid Glass 收口

状态：`AUTOMATED TECHNICAL PASS / PRODUCT FAIL / SUPERSEDED BY M2.0b-R4-R1`

1. 在所选论文库的 `Sidera/`目录维护独立会话 SQLite 和项目级 Pi JSONL；恢复最近活动会话，以 500ms 检查点保存流式回答，异常退出标记“已中断”且不自动重放。
2. 增加新对话和左侧历史抽屉，支持搜索、活动/归档、重命名、恢复与归档区永久删除；宽屏按组合容器整体居中，低于 960px 使用覆盖层。
3. 保留 `--no-builtin-tools`，由 Rust 桥提供结构化文件、HTTPS GET 和 PowerShell。只读直接执行；写入、编辑、删除及 PowerShell 按 session/message/tool/toolCallId/参数哈希逐次审批，敏感环境和输出受控。
4. 增加 `auto / long`缓存策略和输入、输出、cacheRead、cacheWrite、成本、上下文占用统计；上游拒绝 `long`时不静默降级或重发。
5. 将对话框、历史抽屉、标题栏、按钮和输入区统一为静态深色 Liquid Glass；助手正文使用烟熏玻璃，并提供 reduced motion、高对比度、降低透明度及无 `backdrop-filter`退路。

退出门槛：自动技术验证通过且不调用付费 Provider；原生 Tauri 完成重启/项目恢复、五轮新建与切换、归档/恢复/删除、工具批准/拒绝、真实 Provider 上下文与缓存对照，以及 1100/1360/1920px、100%/125%/150% 缩放的组合居中和 Liquid Glass 视觉验收。人工确认前保持 `PRODUCT UNVERIFIED`。

## M2.0b-R3 对话体验收口

状态：`IMPLEMENTED / AUTOMATED TECHNICAL PASS / PRODUCT UNVERIFIED`

1. 无对话时默认只显示底部 42px 输入条；首次有效提交或手动收起后的下一次有效提交，在 Provider 返回前立即展开现有阅读面板。
2. 删除紧凑/阅读切换、自由缩放手柄和布局偏好读写，只保留 `clamp(560px, 42vw, 760px)`宽度与 `min(56vh, 580px)`历史区上限；旧本地布局数据不读取也不删除。
3. 用户消息只保留右对齐文字、用户标签和轮次间距，不绘制渐变、右边框、阴影或气泡底色。
4. textarea 使用单行 42px 基线、20px 行高和 11px 上下内边距，按 `scrollHeight`只向上增长至 100px，发送清空后恢复 42px；左右按钮保持当前输入区垂直居中。
5. 全局提示使用唯一 ID 和 `success / info / error`类型；成功与普通信息 3 秒自动关闭，错误保持到点击关闭或被新提示替换，旧计时器不能清除新提示。

退出门槛：TypeScript、Vite、R3 对话专项、R1/R2 回归、Agent 双背景、项目文档和差异检查通过；真实 Tauri 在 1100/1360/1920px 与 100%/125%/150% 缩放完成首发自动展开、收起后再展开、多行向上增长、用户消息无背景、无尺寸按钮/手柄和提示生命周期验收。

本工作包明确不实现新对话、历史持久化、联网或缓存架构；用户完成原生视觉验收前保持 `PRODUCT UNVERIFIED`。

## M2.0b-R2 对话控件与空间构图连续性

- 输入栏左右操作使用同一 42px 控制基准和 30px 按钮尺寸，在展开、折叠、Explore 及多行输入下保持垂直居中。
- Agent 聚焦以真实对话框、信息卡、标题栏和视口边界计算目标侧别、直径、间距与锚点；默认保持 64px 外缘间距，空间不足时按换侧、缩小至 160px、间距收敛至 40px 的顺序降级。
- 科研星图的热点、论文摘要和论文阅读轨道采用内容分档宽度；轨道保持覆盖层，概览、热点详情和论文返回后的星系中心固定在物理画布中心。
- 论文飞近与返回继续使用单一 Journey 驱动相机距离和目标锚点；摘要/阅读锚点由真实轨道宽度和 24px 间隔计算，研究星图取消独立 acquisition、固定 8% 和全场景投影让位。
- 用户实机发现论文 Journey 起始锚点混入右栏 `viewOffset`，造成进入首帧横移和返回末端姿态交接跳变；当前已改为规范投影锚点并以运行级回归锁定起点/终点零误差。
- 用户随后指出连续返回终点仍落在轨道剩余区域中心；当前已将展示星图基准恢复为物理画布中心，并把右栏避让仅转交给论文锚点。自动技术验证完成，真实 Tauri 五轮往返、像素对齐和 100%/125%/150% 缩放仍待用户验收，产品状态为 `UNVERIFIED`。
- 用户澄清展示星图仍围绕热点而非圆圈中心旋转；当前已把概览 Orbit 枢轴锁定到场景规范中心，并禁止系统/论文瞬态中心进入持久概览姿态。Fast Refresh、场景重建和模式切换均会拒绝被热点污染的保存中心。

退出门槛：输入按钮中心误差不超过 1px；Agent 聚焦目标不侵入对话安全区；科研星图空闲中心与物理画布中心误差不超过 1px，拖拽旋转始终围绕场景规范圆心，飞近和返回不存在预平移、末端跃迁、额外 fit/reset 或构图累积偏差。

## M2.0b-R1 Sidera 对话编排、阅读面板与证据闭环（技术完成，产品继续验收）

状态：`IMPLEMENTED / AUTOMATED TECHNICAL PASS / PRODUCT UNVERIFIED`

1. 根级会话统一为逐轮 `用户问题 → 检索状态 → 回答 → 引用/聚焦`，停止页面内部最近三问截断和问题/答案分组渲染。
2. 加入安全 GFM Markdown，并在当时提供阅读、紧凑和受视口约束的自由尺寸；其多尺寸产品选择已由 M2.0b-R3 的单一固定阅读面板取代。
3. 增加无参数只读库概况工具，精确回答论文、学科、热点和活动快照规模。
4. 证据回合必须在已读取证据上完成结构化引用收口；工具过程旁白不进入正文，失败时显示核验失败且不得生成聚焦入口。
5. TypeScript、Vite、Pi/RAG 定向验证、Cargo 编译和真实 SQLite 审计已经通过；真实 Tauri 三轮交错验收仍待用户执行。

自动技术门槛已经满足：轮次归属、安全 Markdown、库概况、引用闭包和真实默认库统计均已验证。产品退出门槛仍为：三轮真实桌面对话严格交错，Markdown 正确渲染，固定阅读面板和滚动符合阅读习惯，引用点击和显式聚焦继续使用真实实体身份。

## M2.0b Pi 本地论文轻量混合 RAG（技术基础完成，产品修复中）

状态：`AUTOMATED TECHNICAL PASS / PRODUCT FAIL / SUPERSEDED BY M2.0b-R1`

1. Pi 继续保持单进程、单会话与单活动回合，但由会话专用扩展只注册搜索、读取和引用收口三个 Sidera 工具；内置文件、Shell、网页及通用扩展发现继续关闭。
2. 原始中英文问题通过 `query:` E5 查询向量召回活动快照论文 Top-40，Pi 提供的最多 8 个关键词沿现有 LIKE 路径召回 Top-20，以 `0.55 / 0.45 / k=60` 的确定性 RRF 融合。
3. 向量缓存缺失或版本不匹配时在加载 E5 前降级为关键词检索，不重建数据库；检索和向量扫描由 Rust 后台阻塞任务执行。
4. 单回合最多搜索 3 次、读取 2 次并收口 1 次引用；证据最多 6 篇、单篇摘要 4,000 字符、工具结果累计 128KB。
5. 引用只能来自本回合成功读取的真实论文 ID。前端显示安全检索阶段，回答完成后复用现有引用按钮与显式聚焦，不在流式阶段自动操控星图。

自动实现已完成：精确工具白名单、nonce/epoch/revision/toolCallId 校验、只读数据库、混合与降级检索、引用闭包、停止/迟到响应隔离以及前端检索阶段均已落地。真实默认库验证了 CPU E5 混合路径，旧库验证了 LIKE 降级路径；生产构建与最终文档审计完成后可记录自动技术 `PASS`。真实 Provider 的桌面“中文问题—证据回答—点击引用—聚焦”仍须用户验收，因此产品状态保持 `UNVERIFIED`。

退出门槛：真实桌面完成混合检索、证据回答、可点击引用、显式聚焦、无结果透明回答、停止后恢复和背景往返；不得出现文件、Shell、网页、热点、跨项目访问或伪造引用。

## 已完成工作包：M2.0a Pi 基础会话链路

状态：`IMPLEMENTED / TECHNICAL PASS / USER ACCEPTANCE UNVERIFIED`

1. 精确锁定 `@earendil-works/pi-coding-agent@0.82.1`，Rust/Tauri 按需启动唯一 RPC 子进程，不经过 Shell。
2. 复用现有 Provider、Base URL、模型和 Windows Keyring；会话配置与工作目录完全隔离，不读取全局 Pi 配置。
3. 只开放开始、提交、停止、状态和关闭五个窄化命令；向 React 发布经过序号门和大小限制的标准化流式事件。
4. 正式 Sidera 输入框支持用户消息、单条增量回答、停止、多轮上下文和错误恢复；会话仅在本次程序运行期间存在。
5. 强制关闭工具、扩展、技能、模板、上下文文件与审批；本阶段不产生论文引用、聚焦入口或本地证据声明。

已完成：真实桌面已经完成“提问—流式回答—追问—真正停止—停止后恢复”；TypeScript、Vite、Pi 专项审计、Rust JSONL/配置测试和 `cargo check -j 2` 已通过。错误密钥、断网、生成中背景切换和离开/返回 Agent 尚未逐项实机覆盖，继续保持 `UNVERIFIED`，不影响 M2.0a 技术闭环结论。

退出门槛：技术门槛已经满足；用户确认正式输入框体验后关闭 M2.0a。下一阶段 M2.0b 才建立受控只读论文工具和真实 Agent 工具循环，不提前开放文件、Shell、网页或通用 Pi RPC。

## 已完成工作包：M1.3n Sidera Agent 运行中心

状态：`IMPLEMENTED / TECHNICAL PASS / PRODUCT UNVERIFIED`

1. 新增内部视图 `agent-runs`，从 Sidera“更多”中的“Agent 运行中心”明确进入，不增加一级导航项。
2. 运行中心使用“待办 / 历史”双区：待审批与活动运行优先，最近七天失败最多三项；终态历史支持状态、类型和关键词筛选。
3. 主详情保留计划、过程和成果，并新增任务目标、当前阶段、阻塞原因与下一步概览；审批、用户问题和成果复核使用按需治理抽屉。
4. 手工新建只允许 `research_report`，专业导入、清洗、建模与导出继续由各自工作页承担；既有六类历史运行和审计记录保持可读。
5. 复用现有 Agent Runtime、Tauri 命令、计划、事件、Artifact、审批、预算和租约机制，不接入 Pi、正式对话后端或新数据库结构。

退出门槛：自动构建、Agent UI/能力/桌面验收审计、统一外壳回归和项目文档审计通过；原生桌面完成待办、历史、治理抽屉、新建研究任务与专业失败跳转的短时验收。用户确认前产品视觉保持 `UNVERIFIED`。
