# 科研 Agent 项目目标

## 2026-09-09 beta.4 安装版热切换验收收口

beta.4 只修复运行中切换论文库后的 Agent 背景生命周期，不扩展 M4 功能。新内部契约把背景挂载绑定到规范化的 `databaseDir + projectId + epoch`：只有目录实际变化并依次完成校验、准备、设置保存和全量刷新后，才清除旧库产生的静态降级、递增 epoch 并重挂载；旧 epoch 的首帧或错误回调一律拒绝。同目录保存不重挂载，新库仍缺视觉源时继续如实进入既有静态兼容背景，沉浸/理论偏好不被覆盖。

提交 `b9868adcfb9c23a148522a81197c95d60e520bb2` 的 `0.22.0-beta.4` Full Demo 安装包、安装 EXE 和内置默认库已完成版本、哈希与只读数据核验。用户在同一安装进程把一篇论文的缺源库切到 `D:\\wenjian\\Desktop\\Sidera-Data\\library` 后，无需重启即恢复星图；沉浸/理论两种背景、15 秒迟到回调观察、普通/最大化窗口和主界面可点击均按用户观察记为通过。带固定阶段码的有效复测中，PID 10060 经标题栏正常关闭后自然退出，四段退出事件完整。

安装版 R7 首次进入机构资源没有自动认证弹窗，数据库为 `login-required`、统一发现为 `ready`、个人图书馆为 `login-required`，记为受限通过；因现有官方会话要求认证且本轮禁止重新认证，R6 中文“人工智能”40 条回归保持 `UNVERIFIED_OFFICIAL_AUTH_REQUIRED`。beta.4 收口状态为 `IMPLEMENTED / AUTOMATED TECHNICAL PASS / USER-OBSERVED NATIVE HOT-SWITCH PASS / NATIVE PROCESS EXIT PASS / R7 PASS_BOUNDED / R6 UNVERIFIED_OFFICIAL_AUTH_REQUIRED`。用户同时说明仍有若干小问题待后续统一整理，因此本结论不是零缺陷声明，也不进入 M4。

证据：[beta.4 安装版热切换验收](./evidence/sidera-beta4-installed-hot-switch-2026-09-09.json)；beta.3 原始失败经过继续保留在[换库背景生命周期记录](./evidence/sidera-beta3-library-switch-background-remount-2026-09-08.json)。

## 2026-09-08 beta.3 安装启动停止门

beta.3 Full Demo 的安装目录与内置默认库已验证完整；实际阻断来自稳定应用标识沿用旧设置后打开了一个没有 V20 视觉源的外部论文库。产品不得因装饰性视觉源缺失阻断本地论文工作台，也不得擅自切换、覆盖或重建用户论文库。提交 `af57d1d4c7ab526f66fd4e6bad7387debb728768` 只允许对 `AGENT_IMMERSIVE_VISUAL_SOURCE_MISSING` 自动进入静态背景；其他动态启动或数据一致性错误继续明确失败。由该干净提交构建的 beta.3 Full Demo 已在开发服务器关闭时完成安装版启动和正常退出，状态更新为 `INSTALLED NATIVE STARTUP PASS / NORMAL EXIT PASS`。

同一安装版首次进入机构资源时完成静默确认且没有自动认证弹窗；最终能力为数据库 `login-required`、统一发现 `ready`、个人图书馆 `login-required`。因此 R7 记为 `PARTIAL PASS / OFFICIAL AUTHENTICATION LIMITATION`，不承诺跨重启免登录或永久登录；本次未重复官方认证，安装版结构化多页检索保持 `UNVERIFIED`，不挪用旧开发版证据冒充通过。

证据：[beta.3 安装启动兼容](./evidence/sidera-beta3-installed-startup-compatibility-2026-09-08.json)。

## 2026-09-07 当前交付门校正

本轮顺序为退出残留窄修 → R7 有效会话复验 → 干净提交构建 beta.3 Full Demo → 安装版验收 → 当前分支普通推送。退出顺序补丁已通过空闲、机构三项就绪、认证窗口打开三种原生正常退出门，主窗、认证窗、应用进程和机构 WebView 子进程均无残留且未强杀。R7 同一哈希跨进程对照仅恢复数据库 SSO；统一发现一次超时、个人图书馆仍需认证，因此完整免登录按明确限制交付，不承诺永久登录。

证据：[本轮分门记录](./evidence/sidera-beta3-exit-delivery-2026-09-07.json)。

状态：权威事实入口

更新时间：2026-09-09

## 当前交付线：开发 014-R6 已完成，开发 014-R7 已完成静默恢复与登录失效真值修复；完整有效会话跨重启仍待复验；开发 017、016、015 已收口

开发 014-R6 已把武大统一发现从 DOM 画面抽取升级为 `whu-academic-discovery-v2-structured / structured-api`，并完成结构化分页真值收口。中文“人工智能”目标 40 实得 40 条，接受 9 个结构化页面、官方总命中 280,113、覆盖 15 个供应商并以 `target-reached` 结束；英文“machine learning”目标 100 在 20 页预算内得到 76 条合格结果、官方总命中 530,969、覆盖 32 个供应商并如实以 `page-limit` 结束。跨页选择、每页 10 条、本地排序零新增搜索 IPC、活动检索取消后旧 40 条快照与 1 条选择保持、迟到页不恢复任务，以及正常/最大化窗口均已通过。R6 当前为 `IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE STRUCTURED TRANSPORT PASS / NATIVE STRUCTURED PAGINATION PASS / NATIVE SEARCH TRUTH PASS / NATIVE CANCELLATION PASS / NATIVE UX PASS`。证据：[开发 014-R6 结构化分页](./evidence/sidera-014-r6-structured-pagination-2026-09-01.json)。

开发 014-R7 新增只在用户首次进入“机构资源”时触发的 `sidera_institution_session_restore`，复用固定 `institution-webview-v1/whu` WebView2 profile，以 10 秒单项/30 秒总预算隐藏验证数据库 SSO、统一发现和个人图书馆；不会导出 Cookie、启动时联网或自动打开认证窗口，离页、手工连接、清除和 generation/epoch 漂移都会使旧回调失效。个人图书馆检查器未定义 `host` 的异常已修复，官方 `/page/902099/show` 登录落地页稳定归类为 `login-required / OFFICIAL_LIBRARY_LOGIN_LANDING`。保留的原生终态为数据库 `login-required`、统一发现 `ready`、个人图书馆 `login-required`，单一主窗可点击且无认证弹窗。2026-09-05 校正并复验：此前窗口关闭后旧进程仍存活，不能据此证明跨进程登录态恢复；补充 `main` 关闭时正常退出整个 Tauri 应用的钩子后，哈希已核验新版 PID 26540 经主窗正常关闭，随后精确 PID、全部 Sidera 进程及窗口均消失，故进程退出门已通过。有效认证能力尚未建立并完成新进程恢复对照。当前为 `IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE SILENT LIFECYCLE PASS / NATIVE LOGIN-REQUIRED CLASSIFICATION PASS / NATIVE CAPABILITY TRUTH PASS_BOUNDED / NATIVE PROCESS EXIT PASS / EFFECTIVE SAVED SESSION RESTORE UNVERIFIED / USER EXPERIENCE UNVERIFIED`。证据：[开发 014-R7 静默恢复](./evidence/sidera-014-r7-session-restore-2026-09-01.json)。

开发 017 已完成 R1 本地按需 OCR 与 R2 页码证据 Agent 的代码实现和自动技术门。R1 使用固定 PP-OCRv5 mobile det/rec、CPU 两线程和单页单任务；Full 离线资源通过 manifest 哈希审计，Lite 明确不含 OCR 且不提供下载。`document-derived-v1.sqlite` 已非破坏升级为 `user_version=5`，原生与 OCR 文本并存，显式来源缺失会稳定失败，OCR 重跑会使索引 stale 而不自动重建。隔离扫描 fixture 的中文、英文、双栏、90°旋转与低对比页已在原生应用中完成按需识别、持久化、来源切换、串行任务和取消迟到隔离，R1 当前为 `IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE OCR PASS / USER OCR ACCEPTANCE PASS`。

R2 复用现有 Pi 会话、流式状态机与文档索引，增加 `selected-anchor / current-page / document-retrieval` 三种逐轮作用域及三个受限文档工具；每轮最多读取 8 段、32KiB 文本并生成 6 个已读 `document-anchor` 引用。前端只从选择浮层或“证据”SideSheet 打开纯黑覆盖面板，问答期间暂时隐藏证据侧栏，关闭后恢复侧栏、选区、页码与缩放，不压缩 PDF。Pi 会话和历史以已解析的活动论文库为权威目录，避免隔离阅读器已就绪但 Agent 误报目录为空。唯一一次真实 Provider 调用只使用隔离扫描 fixture 第 2 页的 OCR 证据，正确回答第 2 页并生成 1 条可验证引用；从第 3 页点击该引用准确回到第 2 页并高亮锚点。三种作用域、显式 `FTS + E5 · 5 个片段` 以及正常/最大化布局均已原生通过，因此 R2 当前为 `IMPLEMENTED / AUTOMATED TECHNICAL PASS / REAL PROVIDER EVIDENCE PASS / NATIVE AGENT UX PASS / USER EXPERIENCE PASS`。证据：[开发 017 OCR 与页码证据 Agent](./evidence/sidera-017-ocr-evidence-agent-2026-08-25.json)。

2026-08-27 的五项人工检查已全部由用户确认通过。第 2 项曾发现 125% 下 OCR 文字与蓝色选区矩形错位；根因是检测框水平 padding 随整行宽度放大，长句被扩张到页面左缘。修复改为按行高扩张，并由阅读器按 OCR 规范化 span 几何绘制选区。隔离第 2 页重新识别后置信度由 63% 提升到 97%，9 个活动 span 的最小 `x` 为 `0.085247...`；单行和四行选区的自动原生复验均贴合文字，实际选中文本与四行内容一致，用户最终确认第 2 项通过。开发 017 用户体验门已完整收口。

开发 016“全文证据台 R2”已完成代码实现与本轮可运行的自动门：PDF.js 保持单一 Canvas，并增加透明可选 TextLayer、旋转页坐标变换、UTF-16 精确页文本与稳定 `DocumentEvidenceAnchor`；高亮、短批注和保存证据进入独立非重建型 `Sidera/document-evidence-v1.sqlite`，重解析使用原文、上下文与几何基线返回 `exact / reanchored / ambiguous / missing`，不得静默移动。`document-derived-v1.sqlite` 当前 Schema 为 `user_version=4`，新增按 job 隔离的片段、FTS5、索引任务和 384 维 float16 E5 向量；分段上限 800 UTF-16、重叠 120，索引显式启动并支持暂停/恢复/取消，CPU 固定 2 线程、batch 16、DirectML 关闭，`auto` 只有在语义索引 Ready 时使用加权 RRF，否则明确返回 lexical。阅读首屏仍为 52px 单行工具栏、正文优先，选择后才显示操作浮层，唯一常驻文字入口为“证据”，低频信息进入默认关闭的纯黑 SideSheet；运行中心只增加独立紧凑索引行，不计入 Agent run。

开发 016 当前严格状态为 `IMPLEMENTED / AUTOMATED TECHNICAL PASS / WINDOWS STANDALONE TEST HOST PASS / NATIVE EVIDENCE UX PASS / ROTATED TEXTLAYER FIX NATIVE RETEST PASS / NATIVE INDEX PASS / USER EXPERIENCE PASS`。原有 Windows desktop lib unit-test EXE 在断言前以 `0xC0000139 / STATUS_ENTRYPOINT_NOT_FOUND`（`TaskDialogIndirect`）终止的事实继续保留为历史 `TEST-HOST UNAVAILABLE`；新增独立 workspace 冒烟宿主已静态证明 EXE 含资源清单、Common Controls v6 与 `TaskDialogIndirect` import，并在唯一一次 10 秒有界运行中 exit 0、无窗口。四页隔离 fixture 已通过非旋转页 100%/125% 精确选择、高亮/批注/保存证据、派生库删除重建后的 3/3 `missing → exact` 重定位、真实本地 E5 中英双向跨语言召回、正常/最大化内容优先、SideSheet 覆盖与主窗口点击；两条 12,811 片段长任务又分别原生通过暂停/恢复/取消、重启重挂及取消后的迟到结果隔离。2026-08-22 又修复中英文比例字形精确矩形的间歇误拒、selection mutation 真实 loading 遗留及空闲新建批注的 `undefined === undefined` spinner 误判；隔离 fixture 连续两次混合选区批注均落库且无错误通知，最新候选空闲显示静态 Save 并在真实保存后正常收口，用户已确认该窄项“通过”。同日使用独立 300 页 v8 fixture 在同一 `parse-3644922f0c69ab1a79ede754` run 中完成“活动解析→关闭阅读器→重开观察 263/300→手动停止”；终态为 `cancelled`、295/300，4 秒后页数与更新时间不变，且该 DocumentVersion 只有 1 个 run，因此连续解析组合门升级为 `PASS`。随后用户在第 4 页、125% 明确证明旧候选的 90° 可见文字无法命中、蓝色选区出现在左侧空白区；根因是把已旋转 viewport 宽高写给 PDF.js 未旋转 TextLayer 盒。90°/270° 盒尺寸交换窄修已通过 TypeScript、reader 静态审计及最新原生候选复验：Computer Use 在可见竖排文字上拖选后返回对应 `Rotated pages must apply…` 文本，蓝色范围紧贴文字。该原生门现为 `PASS`；用户随后确认第 4 页 125% 旋转文字可正常选择、蓝色范围贴合、浮动工具条可用、主窗口可点击且无错误提示，开发 016 正式收口为 `USER EXPERIENCE PASS`。开发 017 现已进入实现阶段。证据：[016-R2 自动基线](./evidence/sidera-016-document-evidence-r2-2026-08-12.json)、[016-R1 原生收口](./evidence/sidera-016-r1-native-closure-2026-08-12.json)、[016-R1 批注矩形恢复](./evidence/sidera-016-r1-evidence-rect-recovery-2026-08-22.json)。

开发 015“文档原生阅读台 R1”已经把 F1a 的不可变 `DocumentVersion` 接入本地 PDF.js 单渲染器阅读闭环。原始 PDF 仍只存在于 `Sidera/documents-v1.sqlite` 所治理的不可变 blob；派生文本、页/段锚点、FTS 与阅读位置进入独立 `Sidera/document-derived-v1.sqlite`，当前 Schema 为 `user_version=2`，并用显式 v1→v2 UTF-16 长度回填兼容 PDF.js 文本层。阅读协议为仅主 WebView 可用的 `sidera-document://localhost/version/{opaque-token}`，支持 GET/HEAD/OPTIONS 与单 Range，不向前端暴露文件系统路径；50MB/300 页门在解析前拒绝超限文件。当前状态为 `IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE READER PASS (CODEX VISIBLE DESKTOP) / USER EXPERIENCE UNVERIFIED`。自动门为 reader 105/105、derived core 14/14、document store 9/9、Vite 1,928 modules 与本地 PDF worker bundle `PASS`；此前正式 `cargo build -j 2` 为 `PASS`，本轮最新 Rust 硬化的 `cargo check --manifest-path src-tauri/Cargo.toml -j 2` 也为 `PASS`，协议断言的测试宿主边界见下。可见 Tauri 使用 74,996-byte、2 页 fixture `Simple_AI_20260430_111347.pdf` 完成约 0.75s 解析、中文“人工智能”第 1/2 页命中与跳转、1/2 页导航、110/120% 缩放、离开重开恢复，正常 1360×860 与最大化 1707×1019 均通过；阅读态星河 Canvas 为 0。原生协议已证明 Range `bytes 0-7` 返回 206、`Content-Range: bytes 0-7/74996` 与 `%PDF-1.3`，HEAD 200、OPTIONS 204；416 只由 core 自动测试覆盖，不冒充原生通过。OCR、E5、批注与 AI 阅读工具仍后续实现，用户体验验收保持独立 `UNVERIFIED`。证据：[sidera-015-document-reader-r1-2026-08-09.json](./evidence/sidera-015-document-reader-r1-2026-08-09.json)。

开发 014-R4“任务绑定发现认证与检索真值加固”将 `discovery-fulltext` 认证合并进原搜索事务：认证等待复用同一 taskId/searchId 并从 90 秒活跃搜索预算中排除，取消操作终止同一搜索，不创建第二次检索。候选获取位置新增 `basis=observed|synthesized`，`ResearchSearchTruth` 以 `targetReached` 和可空 `hasMore` 区分本地目标与远端继续性。2026-08-27 最新原生复验更新为 `IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE DISCOVERY AUTH PASS / NATIVE SEARCH TRUTH PARTIAL PASS / NATIVE UX PASS_BOUNDED`：兼容武大官网当前三参数 `jumpDatabases(enc, uname, '')` 绑定后，用户在唯一最新 Tauri 实例完成正式 SSO；中文“人工智能”按三类文献、无年份、目标 40 实际得到 10 条、扫描 2 页、覆盖 3 个供应商并以 `source-exhausted` 收口；英文“machine learning”按期刊+会议、2020–2025、目标 100 实际得到 3 条、扫描 20 页、覆盖 4 个供应商并以 `hasMore=null / page-limit` 收口。英文停止复验保留旧 3 条快照与 1 条选择，5 秒后无迟到恢复；重新完成后本地切换“最新”不启动新检索。正常/最大化、机构浏览器隐藏、主窗可点击及无额外 Sidera/CMD/认证窗口均通过。40/100 目标、真实跨页选择和完整 observed/synthesized 逐条矩阵仍受当前来源返回量限制，因此真值只记部分通过；P1 继续为 `PARTIAL / ADAPTER DEFERRED`，WOS、CNKI、Scopus 仍属 P6 且没有正式连接器。证据：[R4 自动与最新原生真值](./evidence/sidera-014-r4-auth-search-truth-2026-08-09.json)、[016-R1 联合原生收口](./evidence/sidera-016-r1-native-closure-2026-08-12.json)。

开发 014-R5“多分面公平分页与远端继续性真值窄修”修复了 R4 英文矩阵的虚假 20 页：顺序分面现在为剩余分面预留最低页预算，分离全局与作用域预算，以分面内真实观察页编号计数，并在判定 `page-limit` 前用只读探针检查下一页。2026-08-28 同一英文矩阵复验得到相同 3 条过滤结果，但正确收口为扫描 2 页、覆盖 4 个供应商、`targetReached=false / hasMore=false / totalHits=null / source-exhausted`，不再把页面预算冒充远端继续性。正常与最大化均保持首条可见、网页隐藏、主窗可点击，且只有一个 Sidera 顶层窗口；选择保持 1 条。本轮状态为 `IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE PAGINATION TRUTH PASS_BOUNDED / NATIVE SEARCH TRUTH PARTIAL PASS / NATIVE UX PASS_BOUNDED`。真实结果仍不足一页，100 条目标、会议结果、跨页选择及完整 position-basis 矩阵不得伪造为通过；本轮电脑操控也因 WebView 子 HWND 安全边界没有重做排序点击，R4 的本地排序原生通过仅保留为历史证据。证据：[R5 分页与继续性真值](./evidence/sidera-014-r5-pagination-truth-2026-08-28.json)。

开发 011-R1 的真实早期 v14 论文库已由用户完成兼容补全并进入应用，记为 `NATIVE V14 COMPATIBILITY PASS`。随后用户完成 10 条新记录的提交，论文数 `25463 → 25473`、library revision `0 → 1`、审查批次冻结，记为 `NATIVE CONTROLLED IMPORT PARTIAL PASS`；提交历史重启恢复、整次回滚及后续修改导致的回滚阻止仍待原生验收。

开发 011-R2 将主库 `paper_import_commits` 账本确立为提交结果的唯一事实来源，界面或审查库回执刷新失败不得把已提交事务误报为失败；同时取消本地文献库的输入即检索，改为输入只更新草稿、Enter/按钮显式执行、IME 组合期不触发、空查询 no-op、相同查询幂等，查询由 Rust/SQLite 完成排序与分页并隔离迟到结果。状态为 `IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE LOCAL SEARCH UNVERIFIED`，完整门为 `NATIVE CONTROLLED IMPORT AND LOCAL SEARCH PASS`。

开发 012 / F1a 已建立 `PaperEntity → SourceRecord → AcquisitionRecord → DocumentVersion → immutable file` 的单篇文档管线。元数据保存在独立 `Sidera/documents-v1.sqlite`，PDF 按 SHA-256 不可变存储并去重，同一论文可拥有多个版本；本地路线支持先选择文件、再由用户明确关联 PaperEntity，且绝不继承机构 SourceRecord 或依据文件名推断论文身份。机构路线分为两个明确步骤：论文详情只能用不透明 SourceRecord ID 请求 Rust 解析并脱敏后的官方来源，前端不能传入任意 URL；用户在共享机构会话中显式完成单篇 PDF 下载后，再用不透明完成下载 ID 精确匹配同一 SourceRecord 并接入。来源解析、来源导航、下载凭证选择或 SourceRecord 匹配失败都会先形成带阶段、错误码和重试标记的逐论文 `AcquisitionRecord`，重启后仍可诊断并由用户显式重试；打开官方网页本身绝不冒充已获得全文。当前为 `IMPLEMENTED / AUTOMATED TECHNICAL PASS / PRODUCT UNVERIFIED`，原生完成门为 `NATIVE SINGLE-DOCUMENT ACQUISITION PASS`。该阶段不批量下载、不调用 Provider、不自动运行热点重建。

开发 012-R2 针对桌面端长期停在“正在点亮本地知识星图……”的问题修复真实启动生命周期，而不是增加自动回退。背景载荷切换不再等待冷窗口可能被节流的 RAF；沉浸背景和理论背景都在初始化尾部同步提交首个真实 WebGL 帧，只有渲染成功且无 WebGL 错误才向根级启动门报告就绪。自动 8 秒静态放行已删除；错误必须进入显式失败路径。当前为 `IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE STARTUP UNVERIFIED`，显式静态背景仅用于用户主动诊断，不能计作正常启动通过。

开发 012-R3 已收口正式入库后的冷启动动态快照契约。对当前实际选择库 `src-tauri/target/v022-desktop-acceptance-2/library/research-hotspots-v7.sqlite` 的只读核验确认：Schema 为 v14，论文数 25,473、library revision 为 1，`v20_analysis_state` 为 0 行；库内仍有 4 个 `ready` 历史快照且全部属于 revision 0，最新历史快照包含 25,463 篇论文、160 个热点和 25,463 条 membership。开发 011 / P2b 按既有产品约束在正式提交后删除 active state、但不自动运行热点分析；真正故障是沉浸背景载荷仍把 active V20 指针当成动态渲染的硬前提。R3 保留“不自动热点分析”，改为只读视觉来源选择：active state 明确存在时必须当前且结构完整，缺失时才可显式使用最新结构完整的 `historical-v20`，并在载荷中标明视觉来源类型、当前/来源 revision 与 freshness，绝不冒充当前分析；理论背景继续只接受当前 active V20，冷启动不可用时只能转入真实动态沉浸背景。无有效来源、损坏、超前或 stale active 均明确失败，期限与挂载看门狗也只能进入失败终态；只有真实动态首帧能够结束启动页。

R3 自动技术门已通过。真实 Tauri 又完成 3 次无点击回退、重试或静态背景的冷启动，三次均使用 `historical-v20`（source r0 / 25,463，current r1 / 25,473）、单一 GPGPU WebGL Canvas 且 context 未丢失；900ms 帧对比变化约 2.97%–3.09%，正常窗口和最大化窗口均通过。当前只保留一个响应中的 Sidera 进程 PID 41708；正式导入后 revision 变化门已由当前真实 r1、active 为空的状态覆盖，验证期间未新写论文库、未重建热点。Computer Use helper 的 `0x80070003` 只记为工具 `UNAVAILABLE`，实际 Tauri 由 tasklist Console session、Tauri visible API 与同一 WebView 的截图/动态帧共同确认。当前状态为 `IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE STARTUP PASS / USER VISUAL ACCEPTANCE UNVERIFIED`；用户视觉验收不能由原生技术门代替。证据：[sidera-012-r3-cold-start-dynamic-snapshot-2026-08-06.json](./evidence/sidera-012-r3-cold-start-dynamic-snapshot-2026-08-06.json)。

开发 013“文献工作台首屏与持续卡顿治理”已把普通分页、状态和分面读取从每次完整迁移/完整性校验/过期任务恢复中拆出：启动、初始化和恢复流程显式执行 `prepare_library_database`，普通只读命令在未准备或指纹失效时稳定失败，绝不隐式回落到 full prepare；准备完成后使用只读、`query_only`、Schema v14 明确校验的轻量连接，分面在同一只读事务中读取 revision 与三组结果并按数据库路径、项目与 revision 缓存。父层首屏快照直接交给工作台，StrictMode 重放的同键请求在进行中合并，翻页或刷新不再重算分面，详情只在用户明确选中文献后加载。工作台仍使用真实动态 WebGL，首个同步真实帧和 012-R3 启动契约不变；仅工作台运行态采用 24 FPS 帧预算并按实际处理帧之间的墙钟时间推进模拟。此前中间原生采样曾得到工作台首屏 114.2ms、显式选文详情 60.1ms，以及最大化/正常窗口约 121.2/120 draws/s；这些数据采集于显式 prepare 二次窄修之前，`finalForDevelopment013=false`，不能作为最终原生门。二次窄修后最终可见桌面启动授权因 Codex usage limit 不可用，系统拒绝 escalation 且不得绕过；这是验证授权不可用，不是产品 `FAIL`。因此当前准确状态为 `IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE PERFORMANCE UNVERIFIED / USER PERFORMANCE ACCEPTANCE UNVERIFIED`。真实库仍为 Schema v14、25,473 篇、revision 1，SHA-256 `B546C505F6FAD89C9D4C6429DBBA8FACC7838D5F66CC9367E24A2824EFDCA8FA`、计数与 revision 不变，main database content mutations 为 0、WAL 为 0 bytes；原生启动和只读连接使 0-byte WAL 与 32KB SHM 的 SQLite bookkeeping 时间戳前移，不能表述为文件系统完全未触碰。无筛选“最新”排序仍使用临时 B-tree，中间采样刷新查询约 268–269ms，未经授权不改变 Schema、索引或排序语义。二次窄修后的最终冷启动 resource chain 与工作台性能均待可见桌面复测。证据：[sidera-013-workbench-performance-2026-08-07.json](./evidence/sidera-013-workbench-performance-2026-08-07.json)。

2026-08-08 用户随后在正常窗口、最大化窗口及明确选文后均反馈“正常”，因此开发 013 的有界主观体验可记为 `USER PERFORMANCE ACCEPTANCE PASS (BOUNDED)`；该反馈不包含二次窄修后的最终 IPC、首屏/详情耗时、draws/CPU/Task 或冷启动 resource chain，`NATIVE PERFORMANCE UNVERIFIED` 仍不变。上一段及 2026-08-07 evidence 中的 `USER PERFORMANCE ACCEPTANCE UNVERIFIED` 是此前快照状态，保留用于审计时间线。

开发 014“机构资源工作台 R1”针对实机反馈中按钮语义重叠、登录窗关闭后状态不收敛、固定 10 条候选缺少覆盖/顺序说明、数据库直达价值不足以及首屏控制区过高的问题，建立单一机构连接协调器和紧凑研究入口。数据库访问、个人图书馆与发现全文仍是三个独立连接目标，但统一进入一次只允许一个活动事务的状态机；窗口关闭先进入验证，迟到回调不得覆盖终态或已证明的就绪状态，浏览器只承担登录、原始记录核对与故障回退。个人图书馆官网 popup 由受管子 WebView 以 `NewWindowResponse::Create + window_features` 承接，保留 POST、`window.opener` 与共享 WebView2 environment/UDF；关闭验证在同一 4 秒 deadline 内只检查当前页一次，尚无证明时导航并直接轮询同一个可见 WebView/environment 的固定图书馆 landing。数据库访问和发现全文仍保留三次当前页检查与隐藏绑定父页 reload，不被该窄修改变。首屏与 40/100 候选、真相负载、每页 10 条本地排序/翻页契约不变。

个人图书馆原生时间线必须完整保留：direct-poll 修复前的首轮网页登录虽然完成，但关闭后终态为 Cancelled，记为 `FIRST-TRANSACTION HISTORICAL FAIL`；第二次进入已复用官方会话并变为 Ready，只记 `SECOND-ENTRY PASS_BOUNDED`，不能覆盖首轮失败。最新修复自动门为机构工作台 117/117、正式 `cargo check -j 2`、desktop lib test binary `--no-run` 和 `cargo build -j 2` 均 `PASS`，独立复审 P0/P1/P2=0；早期 desktop lib 执行宿主仍按历史 `TEST-HOST UNAVAILABLE` 保留。附加 `cargo check --tests` 因既有 `tests/sidera_pi_runtime_protocol.rs` path-module 对 integration test crate 的模块引用漂移而 `FAIL`，它不是本修复引入，也不允许写成全 tests PASS。PID 62020 清除会话后的最新首轮登录变为 Ready，用户手动关闭认证窗后主窗可点击且无异常窗口，记为 `NATIVE LIBRARY AUTH FIRST-TRANSACTION RETEST PASS / USER INPUT+AUTH EXPERIENCE PASS_BOUNDED`。数据库访问仍为有界 PASS；统一发现全文认证、真实检索真相和完整原生 UX 均未验收，因此开发 014 聚合状态仍只能为 `IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE AUTH PARTIAL PASS / NATIVE SEARCH TRUTH UNVERIFIED / NATIVE UX UNVERIFIED / USER EXPERIENCE PARTIAL PASS`，不得宣称整体完成。P1 仍为 `PARTIAL / ADAPTER DEFERRED`；WOS、CNKI、Scopus 尚无自动连接器。证据：[sidera-014-institution-workspace-r1-2026-08-08.json](./evidence/sidera-014-institution-workspace-r1-2026-08-08.json)。

为满足正常调试启动也不出现可见 CMD 窗口，Windows 入口现在在 debug/release 均使用 `windows_subsystem = "windows"`；增量 `cargo build -j 2` 为 `PASS`。最新候选以唯一可见 Sidera 启动且没有新增 CMD 窗口；个人图书馆认证完成后窗口自动关闭，主窗口保持可点击且没有异常窗口。该证据只升级数据库访问与个人图书馆两项认证能力，不替代统一发现全文、真实检索真相或完整原生 UX 验收。

开发 014-R3“纯黑浮层、星图状态与题录通知修复”已完成自动技术门。机构 SideSheet 纯黑、理论先检查后切换、More 历史来源以及题录 prepared `READ_ONLY + query_only` 与 `import-review` 生命周期契约不变。当前结果更新为 `IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE APPEARANCE PASS (BOUNDED) / NATIVE INPUT OWNERSHIP HISTORICAL FAIL / INPUT FIX IMPLEMENTED / INPUT FIX NATIVE RETEST PASS / NATIVE LIBRARY AUTH FIRST-TRANSACTION RETEST PASS / NATIVE IMPORT READ PASS / USER INPUT+AUTH EXPERIENCE PASS_BOUNDED`。历史上“鼠标可移动但无法点击、强制结束后恢复”的 `NATIVE INPUT OWNERSHIP FAIL` 不被删除；它的精确唯一根因仍为 `UNVERIFIED`。本轮没有重建 V20、写当前真实论文库、调用 Provider 或下载全文；用户驱动的官方个人图书馆认证是原生验收，不是自动/文档联网。理论数据待更新不是 WebGL 故障，012-R3 动态首帧契约保持不变。证据：[sidera-014-r3-visual-truth-and-notice-2026-08-08.json](./evidence/sidera-014-r3-visual-truth-and-notice-2026-08-08.json)。

先前 PID 61844 的截图只保留 `NATIVE APPEARANCE PASS (BOUNDED)`，且历史输入故障继续保留。输入窄修后，用户在正常和最大化窗口均确认可点击，机构 WebView 物理隐藏后仍可点击，认证窗口关闭后也可点击且无异常窗口，故升级为 `INPUT FIX NATIVE RETEST PASS`。2026-08-09 16:40:32+08 的 PID 62020 最终快照进一步确认主 HWND `0x33049E` 最大化、visible/enabled、uncloaked、owner=0/rootOwner=self；非 main 可见顶层窗口为 0，library/auth WRY `0x1F10988` 及其 PID 46180 renderer 均隐藏，唯一可见交互 WebView 为 main，没有孤儿拦截层。该证据证明当前修复复验，不反向删除历史 FAIL。题录正常读取以及隔离 fault fixture 的 batch/status/history 稳定错误码均已原生通过；history toast 在 59ms 出现、+4003ms 仍在、+8304ms 消失，X 后 100ms 消失，离开“检索与导入”150ms 清除，正常重读 50.8ms 恢复且无 toast，故升级为 `NATIVE IMPORT READ PASS`。提交/回滚阻断错误常驻没有单独注入，继续作为独立 `UNVERIFIED` 边界，不反向降低读取门。最终 immutable + `query_only` 为 SHA-256 `B546C505F6FAD89C9D4C6429DBBA8FACC7838D5F66CC9367E24A2824EFDCA8FA`、214,532,096 bytes、v14、25,473、r1、active rows 0、ready snapshots 4；main/WAL(0B)/SHM(32768B) 的大小与 mtime 在复验前后均未变化。

开发 015 最后硬化已落盘：阅读器重开可恢复 active parse snapshot 并继续有限轮询，不另起第二解析 run；`document-reader-viewport` 是唯一外层滚动所有者；文档协议错误响应保留 CORS 与稳定错误码；research-search 的 `request_tasks` 采用上限 32、保护活动请求的 LRU。最新 reader audit 105/105、P2a-R2 84/84 与 Vite 1,928 modules 已通过。2026-08-09 补跑中，core LRU 定向测试 1/1 `PASS`；首次桌面 `cargo test` 被无关 integration target `sidera_pi_runtime_protocol` 缺失 `sidera_rag` / `sidera_stream_gate` 阻断。随后定向到 desktop lib 的 `sidera_document_protocol::tests` 已完成编译，但 Windows test host 在进入断言前以 `0xC0000139 / STATUS_ENTRYPOINT_NOT_FOUND`（`TaskDialogIndirect`）终止，因此协议断言记为 `TEST-HOST UNAVAILABLE`，不是产品、协议或断言 `FAIL`，也不写成协议测试 `PASS`。`cargo check --manifest-path src-tauri/Cargo.toml -j 2` 为 `PASS`，仅有 13 条既有 `dead_code` warning；此前 `cargo build -j 2` 只保留为先前包证据。这不改变 015 的现有状态或用户体验 `UNVERIFIED` 边界。

开发 014 当前聚合状态同步为 `IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE AUTH PARTIAL PASS / NATIVE SEARCH TRUTH PARTIAL PASS / NATIVE UX PARTIAL PASS / USER EXPERIENCE PARTIAL PASS`；三类认证目标已有有界通过，但 40/100 与完整跨页/供应商真值仍未闭合。

## 最终目标

将现有科研热点工作站发展为本地优先、机构资源可接入、全文证据可追溯的科研操作系统与 Agent，产品内工作名为 **Sidera**。程序默认入口最终应是全屏沉浸式星空中的极简对话空间；论文发现、题录导入、全文阅读、证据检索、热点分析、报告和建模能力作为同一研究闭环中的原生工具，由 Agent 或用户调用。

2026-08-01 用户决定将该最终入口提前落地为当前桌面产品壳：冷启动显示极简 Sidera 启动页，背景真实就绪后直接进入全屏 Agent；首次使用沉浸背景，之后恢复用户上次选择。主窗口默认最大化但不进入独占全屏，旧总览继续作为导航抽屉中的工作页面。

`M1.3l Sidera 双沉浸样式与流动知识星河` 已在不读取理论 XYZ、不改变 6,000 篇真实论文和 160 个热点身份的前提下，将“流动星河”实现为首次默认沉浸主视觉，并保留现有“随机星海”供用户切换；自动、Tauri 低负载与用户视觉均已通过。`M1.3m Sidera 统一星空外壳与空间页面` 及 R1–R3 已完成单渲染器所有权、透明标题栏、边缘导航、纯黑工作台、科研星图标题栏工具和单一详情轨道，并以技术与用户视觉 `PASS` 冻结。M1.3n 已将旧高级工作台重构为独立的待办优先运行中心。M2.0a–M2.0b-R4-R3 已完成 Pi 会话、本地论文 RAG、持久化会话、审计工具、后台连续性、长缓存默认和首字真实流式，并收口到 `ede6e0b`；真实 Provider 与剩余产品体验继续独立标记为 `UNVERIFIED`。`M2.0c-L0-R2` 已由用户完成原生访问验收：正式 MetaAuth 路由、武大馆藏多库检索及中英文查询均可用，记录为 `NATIVE ACCESS PROBE PASS`，但不等同于全馆接入。`M2.0c-L1a` 已实现 Rust 所有的隔离持久机构 WebView、后台检索状态机和原生结构化结果预览；L1a 与 L1a-R1 分别因无条件拒绝弹窗和把弹窗 URL 作为普通 GET 重放而记录原生失败。L1a-R2 只把灰屏收口为 20 秒超时，原生数据库 SSO 仍未完成，因此更正为 `NATIVE IN-APP INSTITUTION AUTH FAIL / SUPERSEDED`。L1a-R3 已用脱敏真实轨迹证明 CAS/MetaAuth/MetaERS 主认证链能够进入武大馆藏页面。R3-R1 的 OPAC v2 虽建立真实提交门，但用户原生复验确认它只返回图书与馆藏信息，并存在数字、JavaScript 与同书重复项；结论更正为 `INSTITUTION AUTH PASS / CATALOG EXTRACTION FAIL / PRIMARY ROUTE MISALIGNED`。`M2.0c-L1a-R4` 以`whu-academic-discovery-v1`作为默认学术论文路线，以`whu-opac-catalog-v3`作为辅助馆藏路线，分离认证与来源就绪、保存独立内存快照，并仅通过不透明定位打开题录或全文入口。用户曾在原生桌面手工完成官网、数据库和非图书全文的逐级网页访问；该事实只记为`NATIVE CORE WEB FLOW PASS`，不代表 Sidera 原生结构化发现通过。随后实机确认 active search 把`window.open`结果 URL 当普通导航重放，真实带数量分面未确认、抽取链未到达并返回伪零结果，因此 P1 保持`IN PROGRESS / NATIVE ACADEMIC DISCOVERY FAIL`。P1b-R1 已建立任务绑定结果面，但最新实机又确认统一认证弹窗显示“已登录”后关闭，父结果页与 Sidera 仍保持未登录，准确记为`DISCOVERY AUTH CALLBACK/STATE SYNC FAIL`。当前开发 003 / P1b-R2 记录`IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE DISCOVERY AUTH UNVERIFIED`；数据库 SSO、检索入口可用、统一发现机构全文身份和个人图书馆必须独立建模，完整原生闭环前 P1 继续`IN PROGRESS`。M1.3j 恒星近景继续保持独立的 `PRODUCT UNVERIFIED`。

上述开发 003 状态作为前序事实保留。当前工作包已经切换为开发 004 / P1c“通用机构浏览器内核、应用内认证与下载基座”：用户可见的机构网页统一由 Rust 管理的共享浏览器配置 `institution-shared-v1` 承载，普通网页新窗口进入应用内标签页，只有必须保留真实 popup/opener/POST 语义的认证流程进入单一应用模态窗口；自动检索继续使用不可见、任务绑定的专用 WebView。手动 PDF 与附件下载进入独立暂存目录并记录内容哈希、来源与状态，但不自动入库或解析。当前状态为`IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE INSTITUTION BROWSER UNVERIFIED`，P1 仍为`IN PROGRESS`。

开发 004 的基础壳事实继续保留，但最新实机已把其普通 popup 与嵌入视口结论更正为：`PROVIDER ACCESS PASS / POPUP ROUTING FAIL / EMBEDDED BROWSER PERFORMANCE FAIL`。当前工作包为开发 005 / P1c-R1“真实弹窗语义与固定浏览器视口修复”：所有普通网络 popup 先由共享 UDF 的应用自有`WebviewWindow`通过`NewWindowResponse::Create + window_features`承接，MetaERSP `/loading`只作为受管 transient bridge，不再用 URL 重放生成标签；只有获得明确安全 GET 证据时才允许迁移为标签，否则保留真实 opener/POST/window features。浏览器显示时进入固定专注工作区，标题栏、标签/导航、下载入口和“返回原生结果”保留，外层工作台`overflow:hidden`且滚轮不再触发 bounds IPC。当前只可记录`IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE POPUP AND PERFORMANCE UNVERIFIED`，P1 仍为`IN PROGRESS`。

开发 005 的固定视口经用户实机确认已消除明显滚动延迟，故`EMBEDDED BROWSER PERFORMANCE`更新为`PASS`；但网页独占窗口导致原生搜索、结构化结果与机构状态无法同时操作，产品构图与原生功能连续性均为`FAIL`。当前工作包为开发 006 / P1c-R2“原生研究双栏与侧边机构浏览器收口”：机构网页默认以`split`侧栏打开，宽屏保留完整原生研究面并默认50/50，小于1180px时以不销毁状态的“原生研究 / 机构网页”单面切换承载；`immersive`只由用户显式进入。分栏比例在30%–70%与两侧动态最小宽度内解析，并以`research-agent:sidera-institution-browser-layout:v1`跨重启保存。当前记录为`IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE SPLIT WORKSPACE UNVERIFIED`，P1 继续`IN PROGRESS`。

开发 007 / P1c-R3 只修复窗口所有权：所有需要应用自有`WebviewWindow`的隐藏结果面、发现认证、个人图书馆认证及共享机构 popup，都先通过`app.get_window("main")`取得真实顶层窗口；Windows 使用 HWND 与`owner_raw()`建立拥有关系，不再把主`Window`误当成`WebviewWindow`，也不再使用`parent_raw()`子窗口语义。自动技术门已通过，原生蓝色检索、网页`window.open`与认证关闭恢复仍单独记为`NATIVE MAIN WINDOW OWNERSHIP UNVERIFIED`。

P1 由此冻结为`PARTIAL / ADAPTER DEFERRED`：机构访问、登录、数据库直达和非图书资源逐级全文跳转保留为已验证基础能力；自动统一发现筛选与结构化抽取转为`DEFERRED / EXPERIMENTAL`，不再阻塞数据基座。开发 008 / P2a 已启动文件优先的题录审查与身份解析：CSV、JSON、JSONL、NDJSON、BibTeX与RIS进入独立`Sidera/import-review-v1.sqlite`，按 DOI、来源数据库＋供应商记录 ID、规范详情 URL、题名＋第一作者＋年份形成`new / merge / conflict / invalid`候选。P2a只持久化审查批次和用户决定，主论文库保持只读；正式写入留给 P2b。当前记录为`IMPLEMENTED / AUTOMATED TECHNICAL PASS / PRODUCT UNVERIFIED`。

开发 009 / P2a-R1 把武汉大学统一学术发现重新接回同一数据基座，但不恢复“网页就是产品”的旧路线。UI 无关的`LiteratureConnector / ResearchSearchOrchestrator`、`whu-academic-discovery-v2`能力契约、原生候选和审查桥已经建立；当前可执行的武大提取路径仍是`whu-academic-discovery-v1-dom-fallback`隐藏同 UDF 页面抽取，并明确标记`dom-fallback / experimental`。协议勘察可以识别结构化接口或同会话请求候选，但尚未实现以该接口直接产出候选，不能称为正式`v2`传输已打通。正常蓝色检索不主动显示网页；只有认证失效时显示官方登录表面，用户显式核对原始记录时才打开机构网页。候选使用不透明题录/全文定位和字段级 provenance，选中后只能进入`Sidera/import-review-v1.sqlite`审查批次，不写主论文库、不下载全文、不调用 Provider。用户原生验收已确认中文“人工智能”10条/2来源、英文“machine learning”9条/4来源和创建审查批次为`PASS`，但跨页面返回后成功快照会被迟到`EVAL_TIMEOUT`覆盖，且 SSO 已就绪时仍出现旧失败通知，因此开发009更正为`IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE PARTIAL PASS / CROSS-VIEW CONTINUITY FAIL`。独立原生事实见[sidera-p2a-r2-native-continuity-2026-08-05.json](./evidence/sidera-p2a-r2-native-continuity-2026-08-05.json)。

开发 010 / P2a-R2 将后台检索改为进程级单一状态权威：稳定`displayedSnapshot`、当前`activeAttempt`与独立`lastFailure`不再互相覆盖。只有用户显式检索或重试能够开始任务；新尝试失败或取消时继续展示上一份成功结果及候选选择，成功或部分成功后才原子晋升新快照。旧学术 DOM 传输绑定`taskId + clientRequestId + epoch + sequence + webviewGeneration`并退出公共旧事件流；研究检索状态和监听上移到 App 根级，普通导航、组件卸载和重挂不创建或取消任务。SSO/搜索恢复后只清理对应作用域的过期通知。当前状态为`IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE CONTINUITY UNVERIFIED`；P1继续保持`PARTIAL / ADAPTER DEFERRED`，P2仍停留在P2a。

开发 011 / P2b 启动受控主库提交与来源治理：主论文库升级为 schema v14，审查库升级为 schema v3。只有已完成逐条决定且通过预览的整个审查批次可以提交；预览以批次版本、主库 revision、逐条决定和`previewHash`绑定，执行时在单个事务内完成全部插入、只填空值合并、来源记录、身份别名、提交账本和 revision 更新，任何一项失败都整批回滚。审查账本是提交状态的权威来源，重复请求按幂等键返回既有结果；进程异常后通过主库提交账本与审查账本对账恢复，不通过重放写入猜测结果。已提交批次只允许在主库仍满足安全前提时整批回滚；发生后续修改或身份冲突时必须拒绝，不提供强制回滚。该工作包不自动生成热点、不获取或解析全文、不调用 Provider，也不宣称 P2c/F1 已完成。当前状态为`IMPLEMENTED / AUTOMATED TECHNICAL PASS / PRODUCT UNVERIFIED`；只有完整原生提交、重启对账、幂等与安全回滚门均通过后，才可记录`NATIVE CONTROLLED IMPORT PASS`。

开发 011 的首次原生设置尝试暴露了一个兼容性缺口：开发期间较早生成的`user_version=14`数据库并不满足最终严格的 v14 导入治理契约，设置流程因此在进入产品闭环前失败。开发 011 的自动证据继续作为历史实现证据保留，但其原生/产品结论更正为`PRODUCT FAIL / SUPERSEDED`。当前工作包切换为开发 011-R1 / P2b-R1“早期 v14 兼容识别与安全补全”：v14 必须按完整结构精确分为`current-v14 / known-precontract-v14 / unknown-invalid-v14`，不能只看`user_version`。只有命中开发 011 已知早期签名的`known-precontract-v14`允许在生成独立`.pre-v14-contract.<timestamp>.sqlite`备份并校验 SHA-256 后，于单个`BEGIN IMMEDIATE`事务中补全契约；现有论文和治理行不得被覆盖，成功后严格重验为`current-v14`。当前 v14 重开必须幂等且不再生成备份；任何未知或变形结构都以`unknown-invalid-v14`拒绝且零修改。011-R1 当前记录为`IMPLEMENTED / AUTOMATED TECHNICAL PASS / PRODUCT UNVERIFIED`，真实早期 v14 的备份、补全、重开幂等与未知结构拒绝仍为原生兼容`UNVERIFIED`。

阶段名称继续保留为：`M2.0a Pi 基础会话链路`、`M2.0b–R3`本地证据与对话收口、`M2.0b-R4-R2`后台连续性与清透玻璃、`M2.0b-R4-R3`长缓存与真实首段流式。

详细产品定义见 [科研 Agent 最终产品目标](./RESEARCH_AGENT_PRODUCT_GOAL.md)。

### 产品定位：不是图书馆网页套壳

机构登录、数据库访问和网页跳转只是连接层，不是 Sidera 的最终价值。若用户仍需离开原生工作流、逐个打开知网、Web of Science 或其他供应商页面并重复输入查询，Sidera 只能算入口聚合器，不能算科研 Agent。最终产品必须把供应商页面降为登录、原始记录核对、特殊交互和故障回退表面；正常研究过程由 Sidera 原生界面统一承载。

Sidera 的核心价值是把分散资源转化为可持续使用的研究资产：一次提出问题，完成跨来源发现、规范化、去重、受控导入、全文获取、解析、阅读、证据引用、比较分析和成果输出。机构网页可以是底层连接器的一部分，但不能拥有用户的主要研究流程。

### 最终用户闭环

1. 用户在 Agent 首页提出研究问题、关键词、论文题名、DOI 或研究计划。
2. Sidera 同时检索本地论文库、机构统一发现、开放来源和已启用的供应商连接器，在原生结果面板合并来源、类型、全文状态和检索证据。
3. 统一身份层按 DOI、供应商记录 ID、规范地址和题名/作者/年份合并同一论文，保留全部 provenance，而不是复制多条来源记录。
4. 用户在导入队列中审阅字段、冲突和来源后，将选定题录写入本地论文库；检索结果本身不等于已入库。
5. 单篇全文通过机构会话、开放获取、本地文件或正式回调进入文档基座；原始文件不可变，论文实体、来源记录和文档版本彼此分离。
6. 解析管线生成页码、章节、文本范围、参考文献、图表和可重建索引；阅读台能够从任何引用跳到原文证据。
7. Agent 基于本地与在线证据执行检索、比较、综述、证据问答、阅读建议和研究任务，并为结论返回来源、论文、文档版本和页码锚点。
8. 研究结果沉淀为批注、阅读笔记、证据集合、专题综述、报告、热点和空间关系；运行中心记录过程、失败、恢复和可复现输入。

### 最终表现形态

| 产品表面 | 主要职责 | 最终用户体验 |
| --- | --- | --- |
| Sidera Agent 首页 | 研究意图入口与跨模块编排 | 一次提问即可发起本地/机构检索、导入、阅读和分析；回答引用可以直达证据 |
| 文献工作台 | 统一发现、来源筛选、去重和受控导入 | 默认看到 Sidera 规范化结果，而不是多个数据库网页；供应商页面仅按需出现 |
| 全文阅读台 | 文档版本、正文、批注和页码锚点 | 稳定阅读 PDF/后续格式，搜索、选择、批注、恢复位置并调用文档上下文工具 |
| 证据与空间视图 | 论文、热点、引用和研究主题关系 | 星空承担研究导航和证据定位，不替代正文阅读，也不只是装饰背景 |
| 运行中心 | 长任务、审批、失败恢复和成本/上下文 | 检索、导入、解析和 Agent 任务可观察、可取消、可恢复、可审计 |
| 设置与连接器 | 机构会话、供应商能力和模型配置 | 明确每个连接器的检索、题录、全文和跳转能力；登录异常与内容异常分开诊断 |

### 最终产品成功标准

- 正常研究流程不要求用户在多个供应商网页重复检索；原生界面能够统一返回、筛选、合并和解释结果。
- 任一导入论文都能追溯到原始来源、获取时间和字段变换；任一全文都能追溯到不可变文档版本。
- 任一 Agent 证据结论都能定位到题录或全文页码；无法获得全文或证据不足时明确说明，不把链接存在误报为全文已获取。
- 机构会话、供应商页面、公开网络和本地文档是连接器输入，不能绕过统一身份、来源治理、受控导入和文档基座。
- 产品价值以“研究资产是否沉淀、证据是否可追溯、任务是否可复现”衡量，不以嵌入多少个数据库网页衡量。

## 后续核心产品能力

### 校园图书馆与机构来源

科研 Agent 后续应支持校园图书馆、机构订阅和商业学术数据库，但不能把“接入图书馆官网”理解为通用网页爬取。首个机构固定为武汉大学，接入环境固定为用户先在外部 aTrust 中完成登录；Sidera 不接收学号密码，也不把 aTrust 进程运行误报为数据库已登录：

- 优先接入正式 API、OAI-PMH、Z39.50、OpenURL/链接解析器和供应商授权接口。
- 允许用户在 Rust 所有的共享机构浏览器标签页或必要的应用认证模态中自行完成登录；普通 HTTP/HTTPS 导航不再默认离开 Sidera，系统浏览器只作为显式外部打开兼容入口。程序不得采集校园账号密码、读取或导出 Cookie、绕过验证码、付费墙、IP 或机构访问控制。
- 连接器按学校、图书馆和数据库供应商隔离，并明确声明 `检索 / 元数据 / 跳转 / 单篇全文获取` 等实际能力。
- 在线结果默认是带 provenance 的临时证据；全文或元数据入库必须记录来源、获取时间、访问方式、许可/使用限制和内容哈希，并由用户确认。
- L0 首期目标是全馆统一发现、来源识别和访问编排；普通检索、阅读与导航不增加重复审批。L1a 采用“原生结果＋受控内嵌官方页面＋系统浏览器备用”的混合路线，不承诺全量镜像订阅资源。
- M2.0c-L0-R1 明确数据库导航必须使用武大官网公开的 MetaAuth SSO；完整 SSO 参数只在当前运行内存中用于系统浏览器导航，不进入技术详情、日志或 Rust 后台请求。
- M2.0c-L0-R2 允许从首页解析唯一的同域 `/whuWebsite.js` 并静态读取其数据库导航配置；脚本不执行，超星跳转接口、MetaAuth 和 SSO 目标均不由 Rust 后台请求，也不传递用户名。
- M2.0c-L1a 在“文献工作台”内创建 Rust 所有的 `institution-whu` 子 WebView；其 WebView2 用户数据目录与系统浏览器、论文库和项目隔离。官方页面负责登录，Sidera 不读取 Cookie、表单或凭据；检索快照只在 Rust 运行内存中存在，不入库、不下载、不调用 AI Provider。
- M2.0c-L1a-R1 的 URL 级重放已被原生灰屏证明不足。L1a-R2 先隐藏创建 `about:blank` 主子 WebView再进入正式数据库 SSO；个人图书馆弹窗由共享 WebView2 environment/UDF 的应用模态窗口承接。设置页无 Cookie 探针只判断入口和 aTrust 状态，两类真实登录状态分别由应用内会话提供。
- M2.0c-L1a-R2 的原生复验仍停在 `SIDERA_INSTITUTION_NAVIGATION_TIMEOUT`，证明仅增加完成事件和超时不足以打通认证。L1a-R3 在内存中保留最多 32 条仅含网络主机、路径、阶段、重定向和安全错误状态的脱敏导航事件；查询参数、ticket、Cookie、表单与凭据不得进入前端或日志。真实 `POLICY_UNREGISTERED_TARGET` 轨迹已促使会话网络策略完全开放 HTTP/HTTPS；数据库 `ready` 仍必须由版本化 DOM 检查确认，不能由主机名推断。
- M2.0c-L1a-R3-R1 使用 `whu-catalog-multidb-v2` 把“已认证”和“已真实提交查询”继续分离：入口必须是检索表单，提交后必须出现新页面签名、匹配查询回显或正式结果结构；只有带可验证详情定位的官方结果行可以进入快照，导航标题、伪记录和未知结构分别返回明确错误，只有页面明确给出零记录时才允许显示 0 条结果。
- M2.0c-L1a-R4 将默认目标纠正为论文级统一发现：当前官方入口动态解析失败时明确`BLOCKED`，不以 OPAC 代替；OPAC v3 只提供清洗、唯一化的图书与馆藏结果。期刊、会议和学位论文使用独立快照、来源与全文状态，不入库、不下载、不调用 Provider。
- P1b 在 R4 基础上把机构资源固定拆为“统一学术发现 / 数据库直达 / 馆藏目录”三种产品表面。P1b-R1 为每次 active search 创建与`taskId + epoch + sequence + webviewGeneration`绑定、继承同一 UDF/opener 语义的应用自有结果 WebView；带数量的中英文分面先归一化，能稳定多选时确认三类共同生效，否则按文章、会议论文、学位论文顺序执行受控子检索并合并。抽取只在该结果 WebView 运行，未确认筛选或未到达真实结果时明确失败，原始网页默认隐藏且不能代替原生快照。全文入口仍归类为 `direct-html/pdf / doi / openurl/link-resolver / provider-record / publisher-page / browser-fallback`并只保存不透明定位；数据库直达与馆藏目录保持独立。
- P1b-R2 将结果页发起的统一认证弹窗纳入固定标签的应用自有 WebviewWindow，继续通过`NewWindowResponse::Create + window_features(features)`复用 opener environment/UDF、POST 与`window.opener`语义。版本化 DOM 只识别脱敏“已登录/机构访问已建立”标志；成功后刷新正确父结果面并在同一`taskId + epoch + sequence + query + result label + phase`上恢复。认证等待不消耗普通 90 秒检索时限，取消、失败、父页恢复失败及旧 popup/timeout 回调都有稳定错误码和隔离门；不读取 Cookie、ticket、表单值或账号。
- P1c 将用户可见的机构网页统一收口到共享机构浏览器：所有项目共用同一持久 WebView2 UDF；普通`window.open`成为应用内标签页；确实依赖 opener、POST 或窗口特征的认证流程使用唯一认证模态；顶级`javascript:`、`file:`和`data:`等本地或可执行 scheme 被拒绝，远程页面不获得 Tauri capability。
- P1c 允许用户显式触发 PDF 与附件下载。文件进入`institution-downloads-v1`暂存区，伴随安全文件名、大小、MIME、SHA-256、来源标签与脱敏 provenance 清单；取消为尽力而为，重试只在仍持有内存下载定位的当前运行有效。下载完成不等于论文导入、文档身份确认或全文解析。
- P1c-R1 取代 P1c“所有普通`window.open`立即转标签”的约束。popup 运行态绑定`popupId + openerTabId + generation`并只向 React 暴露 origin/path、阶段、处置与安全错误码；MetaERSP `/loading`为有界 bridge，opener 已到达同一供应商目标时关闭 bridge，无法证明安全 GET 时保留应用自有窗口。共享浏览器进入固定专注视口，几何只在首次显示、显隐、活动标签切换、窗口/真实布局尺寸变化时更新，bounds 不再隐式聚焦。
- P1c-R2 取代 P1c-R1 中“网页可见即独占专注视口”的产品构图，但保留其真实 popup、MetaERSP bridge、共享 UDF、固定网页内部滚动和几何/焦点分离。用户可见状态统一为`closed / split / immersive`：默认网页进入可拖动双栏，来源切换与普通页面切换不销毁标签或原生快照，小窗口只切换可见面，沉浸网页必须显式触发。
- P1c-R3 统一所有应用自有窗口的真实顶层 owner；窗口所有权修复只恢复创建、聚焦和关闭收口，不承诺供应商 DOM 自动化。P1 以`PARTIAL / ADAPTER DEFERRED`冻结，内嵌网页正式只承担认证、访问、原始记录核对、全文跳转和故障回退。
- P2a 使用独立审查库承接稳定文件题录。主论文库仅以只读连接提供身份匹配；候选不足、重复或冲突必须由用户决定，任何审查操作都不能直接增加论文数量或 revision。
- P2a-R1 使用`LiteratureConnector / ResearchSearchOrchestrator`把武大候选规范化为与文件导入相同的`SideraNormalizedCandidateDraft`，正常检索不打开侧栏；官方网页只承担登录、隐藏实验抽取、原始记录核对和故障回退。当前运行时不读取或使用 Cookie；临时 Cookie 容器只是为未来已证明的同源请求预留，协议勘察也只提供脱敏路由证据。前端只获得不透明能力定位；进入审查时仅持久化已移除 ticket、token、session 等认证参数的规范身份 URL。供应商记录身份按“来源数据库＋记录 ID”隔离，审查批次记录实际生产候选的适配器版本。正式结构化/同会话连接器仍未解析完成，Agent仅预留编排器服务接口。

### 沉浸式论文与期刊全文阅读台

开发 012 / F1a 已使论文实体能够关联一个或多个不可变真实文档版本，开发 015 已交付 PDF 原生阅读 R1；以下仍是完整阅读轨道而非全部已完成能力。全文来源可包括：

- 用户上传或拖入的本地文件。
- 用户通过校园图书馆、供应商网站或普通浏览器合法下载后导入的文件。
- 开放获取仓储、出版社公开页面或正式 API 返回的全文。
- 后续评估的参考文献管理器、浏览器分享和受治理连接器。

第一生产格式以 PDF 为主。原始文件按内容哈希不可变保存；开发 015 建立阅读 R1，开发 016 已将精确原生页文本、稳定证据锚、job 隔离的 FTS/E5 片段索引和阅读位置写入 `Sidera/document-derived-v1.sqlite`（`user_version=4`），并把用户批注与保存证据独立写入非重建型 `Sidera/document-evidence-v1.sqlite`。OCR、页面图像、更多版面结构和 AI 结果仍作为后续派生数据；任何派生处理不得覆盖原文或删除用户证据。

阅读台完整目标包括连续页/单页阅读、缩放、目录、页码、搜索、选择、批注和恢复阅读位置；开发 015 R1 已覆盖 PDF 打开、页码、缩放、搜索跳页和位置恢复，开发 016 已实现透明文本选择层、稳定页证据、批注/保存证据和显式 FTS/E5 索引。目录、OCR 与 Agent 页码证据闭环仍后置。AI 辅助侧栏采用可扩展能力，不在目标阶段开始前锁死按钮集合；优先候选包括：

- 对选中文本、当前页、当前章节或全文进行翻译和分层总结。
- 解释术语、方法、公式、图表和统计结论。
- 围绕当前文献自由对话，并与本地论文库、热点和引用关系进行可追溯对照。
- 将回答引用回精确页码、章节和文本范围。

AI 默认只获得完成当前任务所需的最小片段。向用户配置的外部模型发送受版权或敏感内容前必须显示来源范围和供应商；不得默认上传整篇全文。无可验证文本锚点时，AI 结论不得伪装成论文原文事实。

## 当前里程碑

M1“沉浸式视觉方向确认”已经完成 M1.2a“引力织场黑白运动骨架”和 M1.3a/M1.3b-1 的常驻论文聚焦技术验证。现有恒星光球能够证明同一顶点、连续焦点场和共速相机可行，但“圆点放大缩小”的产品表达未被采用。

M1.3c“理论坐标 + 沉浸外壳”实验在 Tauri 实机中判定为结构性 `FAIL`。代码虽然完成了六态、上下文抽取和实体解析，但沉浸画布仍继承热点中心与论文语义偏移，因此启动后仍像理论星图，不能作为 `agent背景.html` 的产品迁移。

M1.3d“真正的沉浸/理论双背景静置闭环”已经完成技术闭环，但产品视觉判定为 `FAIL`：沉浸位移不足以形成可感知流动，Agent 理论论文色相被过度白化，热点呈现为蓝色行星圆片。

M1.3e“沉浸流动与理论恒星材质修订”已经完成技术闭环。M1.3f 随后尝试以有上限的 Z 轴增强、深度材质和微幅共轨相机改善 Agent 理论背景；技术审计通过，但用户实机仍将其判断为只有鼠标交互时才产生 3D 感的二维圆片散点图，因此 M1.3f 的产品视觉结论为 `FAIL`。原始理论 XYZ、独立理论星图和展示星图始终未被修改。

当前 M1.3g 改为从理论星系外围观察：Ambient 相机在全部真实实体之外的安全壳上连续随机巡航，默认只显示局部星系并以切向斜视建立真实视差；普通论文按观测尺度保持为锐利点源或 PSF，仅近景热点和当前焦点论文允许进入真实三维光球。该展示仍保留真实理论身份和坐标，只改变 Agent 页的观察方式与光学表达。

M1.3g-R1 将“真实运行时可见”纳入产品底线：外围剖面、相机、实体和热点光学尺寸必须使用同一套 Three.js 世界单位；所有 Agent 理论材质必须在撤掉切换遮罩前完成真实 WebGL 编译、链接、首帧错误和视锥可见性检查。静态审计不能再以数学投影或源码匹配替代实际渲染就绪。

M1.3g-R2 已完成屏幕空间渐进式 LOD、交互热/冷路径隔离和慢帧降级治理，自动技术验证为 `PASS`；但用户实机确认 Explore 仍被固定视觉中心约束，返回末端发生跃迁，Ambient 偶发抖动，热点在 Ambient 与 Explore 中缺乏稳定层级，因此产品视觉结论为 `FAIL`。

M1.3g-R3 已完成 Agent 页理论背景的技术实现与自动验证：Explore 改为不依赖固定中心的自由视线、沿视线推进和局部平移；外围返回增加连续交接段；巡航、深度分层和屏幕 LOD 使用插值、缓变和空闲调度消除阶跃；热点建立独立主星层级，并小幅增强近景论文亮核。热点单击进入与双击瞄准已经互斥，重置/适配/顶视图使用真实相机位置与四元数过渡，热点 Sphere 退场也继续受 12 槽总预算约束。低负载 Tauri 已确认理论星体正常可见，Explore 拖动能够改变构图且不会让星图消失；其余交互、完整返回和最终视觉仍待人工验收，因此整体阶段保持 `IN_PROGRESS / UNVERIFIED`。原始理论 XYZ、外围随机巡航、沉浸背景、独立理论星图和展示星图保持不变。

用户随后实机确认 R3 仍存在四项产品缺陷：按住鼠标拖拽时新视区论文被屏幕 LOD 冻结；巡航在离散安全壳、主线程全量 LOD 和自动重构图叠加下偶发跳动；退出 Explore 时相机、深度和论文集合分批恢复；热点仍表现为圆片或过早出现球体。因此 R3 的产品视觉结论改为 `FAIL`。当前 M1.3g-R4 使用护栏增量 LOD Worker、连续外围安全壳、单一返回事务和“概览 PSF、进入热点后才使用光球”的规则继续修订，用户验收前保持 `IN_PROGRESS / UNVERIFIED`。

R4 已完成自动技术闭环：Screen LOD Worker 只在真实 WebGL 就绪门通过后创建，并随画布唯一销毁；交互请求限制为一个执行中任务和一个可被最新相机覆盖的待执行任务。Worker 故障时使用每帧最多约 1.5ms 的分块主线程后备路径，仍不冻结交互补星。返回路径在 handoff 前预取终点论文集合并同步收敛深度参数，只有 Worker 为零待办、深度误差不超过 1%、LOD 渐变结束且选集连续稳定 500ms 后才进入巡航。TypeScript、Vite、Rust 增量检查与 R4 组合审计均已通过；低负载 Tauri 已完成短时拖拽抽样，退出后未出现延迟论文补批，但一次返回落入了近乎空白的自然稀疏构图。由于用户已锁定“巡航永不自动纠正构图”，该构图不被程序抢回，是否接受仍须用户判断；持续按住拖拽、长时稳定性和热点质感也继续为 `UNVERIFIED`。

2026-07-30 用户实机确认 R4 产品视觉失败：热点概览核心小于论文星而全部不可辨认，开放式巡航在 Explore 返回后会进入完全无语义星的黑屏方向。M1.3g-R5 保留论文星和自由 Explore，恢复清晰克制的热点点源/PSF，并把 Ambient 改为受未来 6 秒内容下限约束的单相机外围巡航；该约束只阻止 Ambient 黑屏，不自动纠正 Explore 中用户主动选择的空白方向。

Agent 理论 Explore 的“退出”不允许为了表现过渡而丢弃已经有效的星空。进入 Explore 时冻结的安全巡航姿态是首选返回锚点：无交互退出应原位恢复，有交互退出应连续返回该安全锚点；只有锚点失效时才允许重新搜索外围终点。

M1.3g-R5 的安全锚点方向正确，但用户实机证明其实现仍分裂为两条返回架构：无交互分支可以恢复原位，任意滚轮或拖拽却会进入带自由相机导数的 Hermite 路径，并在 LOD 所有权未就绪时滑向空区。因此 R5 记录为“自动验证不充分、产品视觉 `FAIL`”。当前 M1.3g-R6 将退出固定为一笔精确事务：保存进入时的相机四元数、投影、巡航插值、深度和论文选集；先建立当前与锚点论文并集，再用无越界的 `smootherstep` 直线位置插值和四元数球面插值返回；输入栏与相机共享同一个 RAF 进度。产品视觉在 Tauri 复验前继续为 `UNVERIFIED`。

R6 实机复验确认精确返回轨迹已经成立，但完整产品闭环仍失败：Explore 标签会因论文 LOD 刷新而被清空；Agent 包装层没有暴露热点/论文局部返回；返回锚点后巡航推进许可可能保持关闭；热点系统内普通论文在高亮环境下不可读。M1.3g-R7 保留 R6 轨迹和现有概览论文材质，只修复标签持续跟随、动态分层返回、巡航生命期恢复和 Agent 专用系统论文可见度。

R7 用户实机验收确认标题稳定和论文→热点→概览的分层返回均已成立，但同时推翻了原巡航恢复结论：原证明在暂停可见性护栏时仅运行两个固定步，发布完成后护栏第一次真实评估仍可能拒绝后续全部固定步；系统普通论文可见度也只获得“略有改善”的结论。因此 R7 记录为“交互导航部分通过、完整产品验收 `FAIL`”。

M1.3g-R7.1 将恢复证明延长到 900ms、至少 30 个固定步并跨越两次护栏评估，但用户桌面复验仍确认返回后永久静止。事实证明问题不是“证明时间不够”，而是可见性守卫仍拥有停止固定步积分的权限；R7.1 因而记录为“静态/自动审计 `PASS`、产品实机 `FAIL`”。

当前 M1.3g-R8 保留标签、分层导航、精确锚点返回、外围构图和全部星体材质，只重构巡航生命期：Ambient 的 `1/60s` 固定步积分始终推进，可见性守卫降级为只输出连续方向、速度和构图引导；无安全候选时以非零速度减速、转向或反向。到达 Explore 锚点后立即恢复巡航，首个成功固定步即结束界面返回，900ms 健康检查只在后台触发 fallback，不能再阻塞 `idle` 或停止相机。

M1.3g-R9 已解决对话态的周期性微抖：约 2 秒一次的随机速度脉冲被替换为 4–7 秒连续目标与限加加速度响应，未来视野预测迁移到现有 LOD Worker，固定步之间采用 Hermite 位置与四元数球面插值。用户随后确认稳定巡航本身成立，但实机发现 Explore 精确返回锚点后仍会发生两次额外滑动和一次跃迁，因此 R9 的稳定巡航技术结论保留，完整产品视觉记为 `FAIL`。

M1.3g-R10 只修复返回后的相机控制权：Explore 入口冻结巡航当前/目标 Guidance、剩余保持时间、Worker 调度余量、深度、LOD 与 epoch；到达精确锚点后原子恢复，并从冻结时刻的下一个 `1/60s` 固定步直接续播。返回后三秒只记录轨迹，不允许 Worker 重新构图或返回专用 fallback；旧 Worker 响应永久失效。用户已经在桌面开发版确认该问题修复完成，并认可当前双背景整体效果，因此 M1.3g 与 R10 的产品视觉结论均为 `PASS`。

旧 `voyage / breath / signal` 三套 Agent 背景原型已经证明轻量载荷、独立渲染器和评审入口可用，但未通过人工视觉验收。默认首页仍保持不变。

## 双背景目标

- 沉浸视图：用于 Agent 对话和沉浸体验。每次应用启动创建新的会话随机星海；真实论文/热点只提供身份和低饱和颜色，不提供理论位置。
- 沉浸视图包含两种正式样式：默认的“流动星河”使用稳定左下至右上构图和会话随机细节，现有“随机星海”作为用户可选样式；两者共享身份载荷，但分别保存流动时间和检查点。
- 理论视图：用于查看论文语义位置、热点归属和可解释关系，继续使用现有理论星图。
- 两种视图共享真实论文/热点身份和快照身份，但空间结构完全独立；禁止把沉浸位置解释为语义距离。
- M1.3h 已证明只读实体解析、稳定顶点/动态槽、双背景身份协调和理论精确返回可复用，但“回答期间自动操控背景、三级自动聚焦、24 颗上下文星自动凝聚”的产品表达经用户实机判定为 `FAIL / SUPERSEDED`。
- 当前修订仅作用于 Agent 页的理论背景：保留外围巡航与自由观察，以交互期护栏 LOD、连续安全壳、原子返回和热点恒星 PSF 替换 R3 的冻结补星、离散壳、末帧补算与概览球体。
- Explore 返回必须以进入时的精确安全锚点为唯一终点；当前论文集合在锚点集合通过实时投影验证前不得淘汰，Worker 响应必须同时匹配用途、投影签名和视口。
- Explore 返回到冻结锚点后原子恢复 previous/current 检查点、插值、accumulator、当前/目标 Guidance 及其剩余逻辑时钟；首个成功步结束界面返回，LOD 只做透明度收敛。返回后三秒的轨迹审计只读，不能触发 fallback、重新构图或第二条相机过渡。
- Ambient 的可见性约束只能连续调整切向权重、垂直注视、方向和非零速度，不能拒绝固定步或进入永久等待。
- Ambient 的随机目标更新不得直接改写速度；未来 6 秒可见性与深度预测必须由现有 Worker 或空闲降级任务完成，不能在 RAF 热路径周期扫描论文。
- Agent 理论 Explore 使用动态分层返回：论文近景返回热点系统，热点系统返回理论概览，“退出探索”始终作为独立顶层操作。
- M1.3i 已证明回答后显式入口和真实实体解析可用，但外围二次聚焦、同时弱亮五个证据对象、关闭布局和灰色数据球近景被用户否决。当前 M1.3j 只强化当前目标：论文或热点一次点击直达真实近景，多对象仅提供“下一颗 / 关闭”，中央对话框始终保持原位。
- M1.3j 的一键路由、关闭恢复、沉浸同步时间线和单次多对象换项已经通过 Tauri balanced 低负载抽查；抽查发现的论文进入阶段反向释放和完成后滞留 `retargeting` 已修复。当前仍需用户确认细颗粒蓝白恒星光球的近景质感，并完成跨热点与三尺寸视觉验收，因此产品结论保持 `UNVERIFIED`。
- 论文近景的产品目标不是“带噪声的三维球体”，而是明确可识别的自发光恒星：三维球面使用宏观流动、像素宽度受控的中尺度连通流丝和微观颗粒三级能量结构，白热核心由能量场打破规则径向亮斑；球体的屏幕投影圆周由独立、连续且像素宽度稳定的高温轮廓层封闭，轮廓之外才是稀疏火舌。轮廓必须由相机射线与真实球体的切线条件解析得到，不能用球心平面上的同世界半径近似，否则近距离、离轴构图会产生圆心偏移与半径内缩。轮廓层不是第二个发光三维球壳，不随球面噪声旋转或产生缺口。固定世界阈值形成的宽等值带会退化为大理石/迷彩纹理，禁止作为最终表面结构；方向光、黑色轮廓和低对比灰色漫反射也不得成为主要形态。参考图约束光学语言，不要求照搬其强 Bloom、尺寸或日冕宽度。

详细准备边界见 [Agent 沉浸版背景保留式改造准备](./AGENT_IMMERSIVE_BACKGROUND_PREPARATION.md)。

## 当前数据事实

- 当前实际选择库：`src-tauri/target/v022-desktop-acceptance-2/library/research-hotspots-v7.sqlite`，Schema v14，25,473 篇论文，library revision 1。
- 当前库没有 active V20 状态：`v20_analysis_state` 为 0 行；4 个 `ready` 快照均为 revision 0。
- 最新结构完整的历史 V20 视觉来源包含 25,463 篇论文、160 个热点和 25,463 条 membership；它只能显式标记为 `historical-v20`，不能称为当前热点分析。这里的完整性按快照级总数和引用关系判定；热点记录的 `paper_count` 是证据计数，不等于逐热点 membership 基数。
- 常驻背景论文代理：3,840 个，每热点最多 24 个。
- M1.3e 沉浸会话保持最多 6,000 篇唯一真实论文和全部 160 个真实热点；位置与运动由会话种子和状态化流场生成，不读取理论 XYZ。
- 生产理论布局：`semantic-hierarchical-natural-pca3-v3`。
- UMAP-A/B/C 继续隔离，不属于生产布局。

可审计数值与哈希见 [Agent 星河准备基线](./evidence/agent-galaxy-flow-baseline-2026-07-27.json)。

## 当前阶段范围

本阶段包含：

- 开发 005 / P1c-R1 已实现兼容优先 popup 状态机、MetaERSP bridge 收口和固定浏览器专注视口；自动验证不访问真实机构外网、不调用 Provider、不写论文库、不触发下载。开发 004 原生基础烟测仍保留，但修复后的 popup 与滚轮性能只标记`NATIVE POPUP AND PERFORMANCE UNVERIFIED`。
- 开发 006 / P1c-R2 已实现原生研究面与机构网页侧栏的三态构图、持久分栏、窄窗口单面切换和每帧至多一次的拖动几何更新。滚动性能沿用用户实机`PASS`，但双栏、窄屏、沉浸往返、跨页面恢复和共享 UDF 的完整原生门仍为`NATIVE SPLIT WORKSPACE UNVERIFIED`。
- 开发 007 / P1c-R3 已完成真实主窗口解析与 Windows owner 绑定的窄修，自动技术`PASS`、原生所有权`UNVERIFIED`；不扩展供应商 DOM 适配器。
- 开发 008 / P2a 已完成六类文件解析、分层身份匹配、候选审查、决定持久化和跨项目隔离；正式入库尚未实现，状态为`PRODUCT UNVERIFIED`。
- 开发 009 / P2a-R1 已实现武大后台检索编排、原生候选、不透明定位与“加入导入审查”映射；当前候选实际由实验性隐藏 DOM 回退产生，协议层发现的更强传输尚未接入候选生成。自动技术`PASS`；用户原生已确认中文10条/2来源、英文9条/4来源、正常检索不打开网页及审查创建，但跨页连续性与过期SSO错误清理失败，因此记录为`NATIVE PARTIAL PASS / CROSS-VIEW CONTINUITY FAIL`，主论文库零写入。
- M2.0c-L0-R2 已完成武汉大学 aTrust、官网与正式 SSO 的原生访问验收；该结论只证明入口与浏览器检索路线可用，不代表全馆题录导入或全文能力已经完成。
- M2.0c-L1a-R3 在“文献工作台”建立可复验的真实认证候选：入口使用官方探针返回的数据库网络目标，认证链内部放行所有 HTTP/HTTPS 导航、重定向和原生弹窗，同时继续只记录脱敏主机与路径；WebView2 导航终态、DOM 适配器和任务 generation/epoch 共同决定状态。前端仍只提交机构 ID、认证类型、查询或不透明结果 ID，不能直接提交 URL 或脚本。
- 第三轮原生导航已经证明数据库 SSO 成功到达 MetaERS `personalIndex`。该页面不再被误当作检索 DOM；运行时在同一隔离会话中自动进入馆藏检索入口，只有检索表单/来源桶/结果结构通过适配器后才允许检索。
- 机构登录页面使用独立持久 WebView2 用户数据目录；学号密码、Cookie 和站点存储始终由官方页面与 WebView2 持有，Sidera 不读取。当前检索快照仅在 Rust 内存中保留，切换页面不中止，重启后清空。
- L1a 不写论文库、不下载文件、不调用 AI Provider；未来受控题录导入属于 L1b，全文仍必须先进入 F1 文档身份与来源治理，不可直接写入现有论文正文或 RAG 索引。

- M2.0b-R4-R1 修复会话 SQL 与残缺 v0 库：只对结构兼容的现有库幂等补全，保留已有会话；不兼容结构明确失败，绝不自动删除或重建。
- 设置将 Agent 可用性拆分为 Provider、会话存储和 Pi 运行时，三项全部通过才宣告可对话；自动测试不调用真实 Provider。
- M2.0b-R4 保留 R3 的底部 42px 空输入态与唯一固定阅读态；最近活动会话按项目恢复，新建空会话回到底部输入条，选择历史会话后进入固定阅读面板。
- 对话面板只保留 `clamp(560px, 42vw, 760px)` 阅读宽度和 `min(56vh, 580px)` 历史高度；旧布局偏好不再读取但不主动删除，用户消息不再绘制背景、边框或阴影。
- 输入文字使用 20px 行高和 11px 上下内边距，草稿按真实 `scrollHeight` 从 42px 向上增长至 100px；成功/普通提示 3 秒关闭，错误提示保持到用户关闭或被新提示替换。
- R4 在论文库的 `Sidera/`目录维护独立会话 SQLite 和项目级 Pi JSONL，不迁移旧内存会话，也不修改 `research-hotspots-v7.sqlite` Schema。
- Pi 内置工具继续关闭；Rust 桥在原四项论文工具之外提供结构化目录、文件、搜索和 HTTPS GET，写入、编辑、删除与 PowerShell 必须按精确 `toolCallId + 参数哈希`逐次审批。文件、网页和命令输出均是不可信数据。
- 缓存策略只有 `auto / long`。`auto`沿用 Pi/供应商兼容策略；`long`只在用户明确选择后用于下一次会话启动，上游拒绝时不得静默降级或重放。
- 使用现有 LIKE 路径和活动快照 384 维 E5 向量进行确定性加权 RRF；缓存缺失或模型版本不匹配时只降级为关键词检索，不在聊天路径重建向量。
- 每回合最多读取 6 篇真实论文摘要，结构化引用只能指向本回合已读取 ID；回答完成后继续使用用户显式点击的聚焦入口。
- 本阶段不修改数据库 Schema、理论 XYZ、UMAP、活动快照或 Agent 运行中心；自动技术结论和原生产品验收继续分开记录。

- M1.3m-R3 将产品科研星图的常驻左上/左下 HUD 取消，页面工具统一进入 Sidera 标题栏；经典与开发回归路径仍可保留旧面板。
- 全局导航由 8px 左侧边缘热区停留 150ms 或 `Alt+N`呼出，空间页画布不移动，密集工作页继续使用工作台让位。
- 科研星图热点、论文摘要与论文阅读由唯一判别联合详情轨道承载，禁止多套布尔显隐并存。

- 保留 M1.3m 的单渲染器、场景所有权、Agent 背景偏好隔离和科研星图独占空间架构。
- 密集工作页导航打开时采用 `workbench-reserve`，工作台在约 240ms 内右移并收窄；Agent、科研星图等空间页仍采用 `spatial-overlay`，不改相机、画布或实体投影。
- 全局导航入口只存在于左上 `SIDERA` 品牌旁；标题栏和页面工具栏统一读取窗口控件安全区。
- 普通工作页星河亮度提高到约 `0.34`、速度保持 `0.20`；主工作面板使用 `rgba(0,0,0,0.94)` 与中性细边线，不再依赖灰色大卡片和蓝色选中底。
- 产品科研星图默认采用空间展示参数并移除“全屏”按钮；旧全屏开关只保留在开发评审和经典布局回归中。

- 将已经由用户实机确认的 M1.3g/R10 外围巡航、Explore、精确返回和恒星材质冻结为基线。
- 让 Agent 页使用完整应用视口，并通过覆盖式抽屉访问项目、导航和本地数据库状态。
- 为沉浸与理论背景建立共享实体身份和显式证据会话，但保留两套完全不同的空间解释。
- 覆盖常驻论文、快照内未抽样论文、活动库新增论文、热点和明确不存在实体。
- 回答 `streaming` 期间不改变背景、相机或实体材质；只有 `complete` 且结构化实体解析完成后，正文引用和消息末尾按钮才可进入证据舞台。
- 证据舞台每组直接轮播最多 6 个真实对象；任意时刻只强化一个主目标，目标位于固定侧面，对侧显示轻量核心信息卡。
- 沉浸背景只通过相机共速寻找同一真实实体，不再移动、排序或聚拢上下文星；理论背景保持真实 XYZ，并在一次显式聚焦中自动进入热点或论文近景。
- 关闭后继续复用 R10 精确返回和单一巡航接管；聚焦不得触发 Explore 底部输入栏或对话框自动折叠。
- 建立开发总账和项目文档一致性审计。
- 保留已经完成的沉浸背景 GPGPU 两级流场和解析式连续降级。
- 保留 Agent 理论背景的辅助 Z 轴显示增强和外围安全壳；原始理论载荷、数据库坐标和独立理论星图保持不变。
- 将 Explore 从固定 Orbit 枢轴改为自由观察，支持视线旋转、沿视线推进、局部平移和可取消的实体瞄准。
- 通过固定步长渲染插值、连续深度参数、低频空闲 LOD 评估和返回交接消除静置及退出末端跃迁。
- 为全部 160 个真实热点建立独立、清晰但克制的主星层级，并仅小幅提高近景论文亮核。
- 保留 6,000 篇论文和 160 个热点的稳定真实身份、会话随机空间和纯黑锐利星空。
- 保存和恢复沉浸流场位置、速度和积分步数。
- 在 `agent-theory` 中恢复论文主题色，并以混合恒星 LOD 替换热点行星圆片。
- 保持沉浸/理论单活动渲染器、显式切换和理论相机姿态；仅替换 Agent 理论 Explore 的相机控制方式。

本阶段不包含：

- 替换默认首页或接入正式对话后端。
- 接入正式 Agent 对话后端和生产首页调用链。
- 将隔离评审入口替换为默认 Agent 首页。
- 修改展示星图、理论星图、活动快照或 UMAP。
- 新增数据库表或迁移。
- 构建安装包、推送、PR、合并或发布。

## 本阶段成功标准

- 5 秒内能够明确感知沉浸星河流动，且不是闪烁、统一平移、跳转或屏幕边缘重生。
- Agent 理论论文保留可辨热点色相，热点不再呈现蓝色行星圆片或 UI 按钮。
- Sidera 回答流式输出期间背景不被回答内容自动操控；回答完成后，只有结构化且可解析的实体才显示聚焦入口。
- 单对象、多对象轮播、历史回答、背景切换和关闭均保持实体身份、固定侧别与连续视觉所有权。
- 当前目标、信息卡和中度背景压暗形成清晰层级；不依赖多证据弱亮、自动星群重排、圆环、Bloom 或宽软雾。
- 理论证据舞台关闭后严格恢复进入前相机姿态，Ambient 沿 R10 的下一固定步继续巡航，不发生二次构图。
- Ambient 至少能辨认 16 个热点并分布在至少 6 个屏幕区域，Explore 模式切换不导致热点突然消失。
- 近景论文比远景更亮且保持锐利，不依赖 Bloom、宽光晕或时间透明度表达距离。
- 两套背景近、中、远恒星保持锐利，切换与会话续接连续。
- TypeScript、Vite、Rust、流场、恒星材质和项目文档审计通过。
- 默认首页、活动数据库、展示/理论星图、活动快照和 UMAP 保持不变。
- 自动实现可以记录技术 `PASS`；Tauri 和用户视觉结论通过前，阶段不得标记完成。
