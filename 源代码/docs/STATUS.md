# 科研 Agent 当前状态

## 2026-09-07 beta.3 交付复核（优先于下方历史结论）

基线 HEAD 为 `26cb7d6770516f8536872fd4d9ef2c1cb58d6575`。原 PID 18328 曾被提权 CIM 确认为不响应，随后由既有开发 watcher 的重编译/重启消失；全程未强杀，该消失不计退出 PASS。补丁哈希 `E83206AA787316E11CD011A58E0AA88D609E2DC0DA1344F7BB255BDD08E41575` 已通过空闲、机构三项就绪、认证窗口打开三种正常退出门，固定退出事件链完整，主窗、认证窗、应用进程和机构 WebView 子进程均无残留。R7 同一哈希新进程对照仅恢复数据库 SSO，统一发现一次 10 秒超时、个人图书馆仍需认证，完整跨重启免登录为 `PARTIAL PASS / LIMITATION`。R7 26/26、R4 52/52、R6 16/16、恢复 core 2/2、前端构建、`cargo check --tests -j 2` 与 `cargo check -j 2` 均通过；根 Tauri 测试宿主仍因 `TaskDialogIndirect` 不运行。beta.3 安装包尚待干净提交构建；未提交推送。

证据：[本轮分门记录](./evidence/sidera-beta3-exit-delivery-2026-09-07.json)。

更新时间：2026-09-05

当前分支：`codex/sidera-m2-rag`

M1.3d 基线提交：`63e83d3cd7b49d513df1613dfb42ef01fd1b5ce0`

M1.3e 技术检查点：`ea5c8b843dc94f328caa25e32b358150b38c1518`

M1.3e 文档检查点：`07de19d`

M1.3f 失败归档提交：`220a5c4`

当前 HEAD：`ede6e0b4ddc3980816ec4e4d694f59c33461b159`

当前阶段：开发 014-R6 已完成为 `IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE STRUCTURED TRANSPORT PASS / NATIVE STRUCTURED PAGINATION PASS / NATIVE SEARCH TRUTH PASS / NATIVE CANCELLATION PASS / NATIVE UX PASS`。开发 014-R7 已通过自动技术、静默流程、登录页分类和主窗口进程退出原生门；有效登录态跨进程恢复和最终用户体验仍待复验。统一发现可访问不等于恢复了登录态。开发 016/017 已完整收口，真实论文库、V20、Provider 与星图背景不在 014-R6/R7 范围。

## 2026-09-05 开发 014-R7｜主窗口退出修复与重启证据校正

当前状态：`IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE SILENT LIFECYCLE PASS / NATIVE LOGIN-REQUIRED CLASSIFICATION PASS / NATIVE CAPABILITY TRUTH PASS_BOUNDED / NATIVE PROCESS EXIT PASS / EFFECTIVE SAVED SESSION RESTORE UNVERIFIED / USER EXPERIENCE UNVERIFIED`。

- 9 月 3 日观察到主窗口关闭后旧进程 PID 15124 仍存在，开始时间仍为 13:28:07；此前将窗口重开写作“进程重启”的结论撤回。下面历史能力终态保留，但不能证明有效 Cookie 持久化或推断官方 Cookie 有效期。
- `main` 的 `CloseRequested` 现调用 Tauri 正常退出路径 `AppHandle::exit(0)`，避免隐藏机构窗口继续维持进程。R7 审计已通过 23/23，`cargo check -j 2` 和 `cargo build -j 2` 于 9 月 3 日通过。9 月 5 日对哈希已核验的新版 PID 26540 执行主窗正常关闭后，06:39:08 已查无该 PID，06:39:28 所有 Sidera 进程与窗口均为 0，因此 `NATIVE PROCESS EXIT PASS`。
- 关闭前隐藏静默恢复仍如实得到数据库 `login-required`、统一发现 `ready`、个人图书馆 `login-required`，无认证弹窗。随后同一哈希新版曾以新 PID 22688 启动，但轻量前端宿主先退出，未形成可用的重启后界面证据；可用内存又降至约 1.22 GiB，按 2 GiB 安全线暂停再次启动。因此有效认证能力的跨进程恢复仍为 `UNVERIFIED`。证据：[R7 静默恢复](./evidence/sidera-014-r7-session-restore-2026-09-01.json)。

## 2026-09-03 开发 014-R7｜机构会话静默恢复登录失效真值窄修

历史状态（其中跨重启解释已由 2026-09-05 校正撤回）：`IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE SILENT LIFECYCLE PASS / NATIVE LOGIN-REQUIRED CLASSIFICATION PASS / NATIVE CAPABILITY TRUTH PASS_BOUNDED / EFFECTIVE SAVED SESSION RESTORE PARTIAL PASS / USER EXPERIENCE UNVERIFIED`。

- 新增独立 restore/cancel 命令，首次进入机构资源才调用；固定 profile、三项 10 秒/总 30 秒、隐藏 WebView、epoch/generation 隔离、离页和手工事务取消均已实现。R7 静态审计 22/22、core 2/2、`pnpm build`、`cargo check --tests -j 2` 和 `cargo build -j 2` 均通过。
- 根因已定位为个人图书馆检查器引用未定义的 `host`，导致每次检查在路由动作前抛错，最终耗尽 10 秒。检查器现自行定义脱敏 page title/host，并把官方 `/page/902099/show` 登录页稳定映射为 `login-required / OFFICIAL_LIBRARY_LOGIN_LANDING`。
- 当时窗口重开后显示“正在确认”且没有认证窗，只有一个可点击 Sidera 主窗；终态为数据库 `login-required`、统一发现 `ready`、个人图书馆 `login-required`。这些是保留的界面观察；原记录中的“进程重启”和“部分 profile 恢复”解释已撤回。
- 根 Tauri lib 测试宿主因 Windows `TaskDialogIndirect / STATUS_ENTRYPOINT_NOT_FOUND` 不可运行，已停止并不再重试；可运行的 core 测试、静态审计、checks 和真实 desktop executable 是本轮证据。下一步需要用户完成一次新的官方登录，再做一次普通进程重启。证据：[R7 静默恢复](./evidence/sidera-014-r7-session-restore-2026-09-01.json)。

## 2026-09-01 开发 014-R6｜结构化适配器与多页收口

- `whu-academic-discovery-v2-structured` 已实际接受真实结构化响应。中文 40/40、9 页、15 供应商、总命中 280,113；英文 76/100、20 页、32 供应商、总命中 530,969，终止真值分别为 `target-reached` 与 `page-limit`。
- 跨页选择、每页 10 条、本地排序零搜索 IPC、取消保留旧 40 条与 1 条选择、迟到响应不恢复，以及正常/最大化、网页隐藏、主窗可点击均通过。R6 正式收口，不再保留 R5 的 `ADAPTER DEFERRED`。证据：[R6 结构化分页](./evidence/sidera-014-r6-structured-pagination-2026-09-01.json)。

## 2026-08-28 开发 014-R5｜多分面公平分页与远端继续性真值窄修

状态：`IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE PAGINATION TRUTH PASS_BOUNDED / NATIVE SEARCH TRUTH PARTIAL PASS / NATIVE UX PASS_BOUNDED`。该状态作为 R5 历史基线保留，已由 R6 的结构化多页真值收口继续推进。

- 顺序分面不再允许第一个分面独占全部页预算：剩余分面获得最低保留预算，全局与作用域页预算分离，观察页码按当前分面内的真实页面计算。
- DOM fallback 在判定页面预算结束前先只读检查一次真实“下一页”；探针不导航、不消费页面，也不把未知继续性强写成 false。core 26/26、R5 audit 8/8、R4 52、P2a-R1 99、P2a-R2 84、机构工作台 117/117、`pnpm build`、`cargo check --tests -j 2`、`cargo check -j 2` 与 `cargo build -j 2` 均通过。
- 用户完成正式机构登录后，同一英文矩阵“machine learning / 期刊+会议 / 2020–2025 / 100条”实得 3 条，扫描 2 页，覆盖 4 个供应商，`targetReached=false / hasMore=false / totalHits=null / source-exhausted`。这纠正了 R4 的“3 条却扫描 20 页、`hasMore=null / page-limit`”虚假终态。
- 正常和最大化窗口均保持首条可见，机构浏览器隐藏，主窗口可点击，只有 1 个 Sidera 顶层窗口且无 CMD/孤儿认证窗；结果选择保持 1 条。真实结果不足一页，100 条目标、会议结果、跨页选择与完整 observed/synthesized 矩阵仍为 `UNVERIFIED`。Computer Use 因 WebView 子 HWND 安全边界没有重做排序选项点击，R4 的本地排序原生 PASS 只作为历史证据保留。
- 仅使用隔离测试库，没有访问或写入真实论文库、重建 V20、调用 Provider、下载全文、清除登录态或操作其他进程。证据：[sidera-014-r5-pagination-truth-2026-08-28.json](./evidence/sidera-014-r5-pagination-truth-2026-08-28.json)。

## 2026-08-25 开发 017｜按需 OCR 与页码证据 Agent

R1 状态：`IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE OCR PASS / USER OCR ACCEPTANCE PASS`。

R2 状态：`IMPLEMENTED / AUTOMATED TECHNICAL PASS / REAL PROVIDER EVIDENCE PASS / NATIVE AGENT UX PASS / USER EXPERIENCE PASS`。

- R1：派生库非破坏升级至 `user_version=5`；Full 离线捆绑固定 PP-OCRv5 mobile det/rec 并核验 manifest/SHA-256/许可证，Lite 不含模型且运行时不下载。OCR 仅由用户显式触发，主 WebView 单次 PNG token、全局单页、CPU 两线程、90 秒上限、取消幂等并拒绝迟到结果。隔离五页扫描 fixture 已原生验证中文、英文、双栏、90°旋转和低对比页；来源偏好与 OCR 结果持久，重跑只使索引 stale，不覆盖原生文本。
- R2：复用现有 Pi 会话和流式状态机，增加 `selected-anchor / current-page / document-retrieval` 以及三个文档工具。Rust 只从当前逐轮作用域解析文档，限制 8 段/32KiB/6 引用，拒绝跨文档、跨页、未搜索/未读取引用；工具结果标记为不可信数据，不把路径、数据库目录、Cookie、凭据、PDF 图像或整篇正文发送给 Provider。阅读器只提供按需纯黑覆盖面板，点击 `document-anchor` 回到准确页码并聚焦锚点。
- 已通过：OCR 4/4、Document Agent 3/3、文档索引 11/11、Pi 协议 8/8、reader/Agent/OCR/RAG 静态审计、`pnpm build`、`cargo check --tests -j 2` 与 `cargo check -j 2`。用户授予电脑操控权限后，唯一一次真实 Provider 请求只发送隔离 fixture 的合成问题与第 2 页 OCR 证据，回答正确并返回 1 条 `[1] 第 2 页` 引用；先翻到第 3 页，再点击该引用准确回到第 2 页并高亮原锚点。用户随后确认五项人工检查全部正常，开发 017 用户体验门为 `PASS`。证据：[开发 017 分门快照](./evidence/sidera-017-ocr-evidence-agent-2026-08-25.json)。
- 原生复验同时发现并窄修两个真实联动缺陷：问答打开时证据 SideSheet 需要暂时隐藏，关闭后恢复其原开关状态；Pi 会话/历史必须优先使用 `libraryStatus.databaseDir` 的已解析活动库，不能在隔离库可读时继续把空的旧设置传给会话存储。修复后 `selected-anchor / current-page / document-retrieval` 三种作用域全部可用，显式索引显示 `FTS + E5 · 5 个片段`，125% OCR 选区、侧栏/选区恢复及正常/最大化主窗口均通过；未操作其他应用、未写真实论文库，也未再次触发旧测试宿主弹窗。
- 第 2 项错位根因是 OCR 检测框的水平 padding 按整句框宽放大，使长句矩形扩到页面左缘；现改为按行高扩张，并由阅读器按 OCR span 规范化几何绘制透明原生选择的可视层。隔离第 2 页重新识别由 63% 提升到 97%，9 spans 的最小 `x=0.085247...`；125% 单行与四行原生拖选均贴合文字，选中文本完整返回四行且没有错误通知。自动、Codex 可见原生复验及用户复验均为 `PASS`。

## 2026-08-22 开发 016-R1 批注矩形误拒与永久转圈窄修

开发 016 聚合状态：`IMPLEMENTED / AUTOMATED TECHNICAL PASS / WINDOWS STANDALONE TEST HOST PASS / NATIVE EVIDENCE UX PASS / ROTATED TEXTLAYER FIX NATIVE RETEST PASS / NATIVE INDEX PASS / USER EXPERIENCE PASS`。

- 已定位用户截图中的 `SIDERA_DOCUMENT_EVIDENCE_RECTS_INVALID`：旧 Rust 校验只接受按 UTF-16 线性插值的 canonical 子矩形，但 PDF TextLayer 在中英文比例字形下会产生不同且仍位于权威源 span 内的精确 DOM 矩形，导致合法混合选区被间歇误拒。新校验接受同页、同范围、仍在源 span 内的精确几何，同时继续拒绝 NaN、跨页、远离源 span、越界和超过 64 个矩形的输入。
- 保存按钮存在两个独立问题：真实请求 loading 曾因 manifest/version epoch 更新而跳过 `finally` 清理，已改用独立 selection action token；用户随后确认“保存正常、按钮可点、无错误，但图标始终旋转”，进一步定位为空闲新建批注时 `evidenceMutationId` 与 `editingAnnotation?.id` 同为 `undefined`，旧条件把 `undefined === undefined` 误判为 busy。现改用显式 `noteSaveBusy`，只有真实新建请求或带明确批注 id 的编辑请求显示 spinner，空闲态显示静态 Save 图标并同步 `aria-busy`。
- 自动门：Rust `persistent_anchor_` 2/2、TypeScript、reader R2 静态审计、`pnpm build` 与 2-job release 候选构建全部 `PASS`。reader 审计新增空闲 Save、真实请求 spinner、`aria-busy` 和禁止可选链空值比较断言；最新 release 候选 SHA-256 为 `1A294A0167EAB8B00714328FF0E41613E6D4926399F87CD405CE20D1AC723109`。debug-only 候选的 `0xC0000142` 未重复启动，也不影响 release 产品候选。
- 原生门：在隔离四页 fixture 第 3 页、100% 缩放连续两次保存“默认片段最多八百个 UTF-16 字符。”混合选区批注，计数 `6 → 7 → 8`；两次 loading 均结束且无 `RECTS_INVALID`。最新候选又打开既有批注编辑器，空闲按钮显示静态 Save 图标，执行真实保存后编辑器正常关闭、无错误提示，记为 `NATIVE IDLE-SPINNER REGRESSION PASS`。主窗口可点击且无异常窗口；用户已于 2026-08-22 回复“通过”，因此该窄项升级为 `USER IDLE-SPINNER EXPERIENCE PASS`。旋转页主观门也已在后续复验通过，开发 016 聚合 `USER EXPERIENCE` 升级为 `PASS`。证据：[sidera-016-r1-evidence-rect-recovery-2026-08-22.json](./evidence/sidera-016-r1-evidence-rect-recovery-2026-08-22.json)。

## 2026-08-22 开发 016-R1 原生索引收口与人工验收交接

- 在隔离库中用 12,811 片段长任务完成原生索引暂停、恢复和取消；`doc-index-45202f4723f9950dcab92346` 以 176 个 embedding 进入 `cancelled`，之后计数不再增长。第二条 `doc-index-913a3411728b89a113dc845d` 在应用重启后重挂到同一 job，再以 512 个 embedding 取消，迟到结果没有恢复任务。因此 `NATIVE INDEX` 升级为 `PASS`。
- 300 页解析任务 `parse-b3d0e0200baf84fa0920ea0a` 在关闭阅读器后重开时仍是同一 run，重开后观察到 254/300，证明同 run 恢复；独立任务 `parse-06b79981f8e9ededc83c601d` 在 5/300 手动停止，3 秒后页数和 `updated_at` 不变，证明停止及迟到页隔离。随后使用新 DocumentVersion 的 v8 fixture 在 `parse-3644922f0c69ab1a79ede754` 同一 run 中连续完成活动解析时关闭、重开观察 263/300、手动停止；终态为 `cancelled`、295/300，4 秒后页数与更新时间不变，且 `versionRunCount=1`。因此连续“关闭→重开→停止”、无重复 run 与迟到页隔离全部升级为 `PASS`。
- 持久证据库仍为 2 条批注、1 条保存证据，SHA-256 继续是 `4B2251844350D1DBBA65B9E025A0632069C45A281BFECB3A1B26BA2822BE8879`；只移动隔离派生库到可恢复备份，没有写真实论文库、下载模型、调用 Provider、重建 V20 或操作其他进程。
- 用户曾在隔离 Sidera 四页 fixture 第 4 页、125% 缩放确认旧候选的可见竖排文字无法命中，只有左侧空白区出现蓝色选区。根因是 90°/270° 页把已旋转 viewport 宽高固定到 PDF.js 未旋转 TextLayer 盒；现已交换 quarter-turn 盒尺寸并补静态断言。最新候选 `53725696` bytes、SHA-256 `593FC415BA1AE460056CD4141595DC1A6FFD047553996FA9B1566501BAE1F1DE` 已通过 TypeScript、reader 审计、2-job Tauri 构建和可见原生拖选：选中文本为 `otated pages must apply the PDF.js viewport transfor`，蓝色范围紧贴可见竖排文字。用户随后确认“可以正常通过”，且蓝色范围、工具条、主窗口点击和错误提示均正常，因此 `NATIVE EVIDENCE UX / USER EXPERIENCE` 均为 `PASS`。证据：[sidera-016-r1-native-closure-2026-08-12.json](./evidence/sidera-016-r1-native-closure-2026-08-12.json)。

## 2026-08-13 开发 016-R1 / 测试宿主、检索真值与全文证据原生收口

- 新增独立 workspace member `sidera-windows-test-host-smoke`，不初始化 Tauri、不修改产品 EXE 清单。目标 EXE 静态含资源清单、Common Controls v6 和 `TaskDialogIndirect` import；仅运行一次，10 秒内 exit 0 且没有窗口，记为 `WINDOWS STANDALONE TEST HOST PASS`。原 desktop lib unit-test harness 的 `0xC0000139 / TEST-HOST UNAVAILABLE` 保留为历史事实。
- 014-R4 在 2026-08-27 唯一最新 Tauri 实例中完成正式 discovery SSO。中文“人工智能”按三类文献、无年份、目标 40 实得 10 条、扫描 2 页、覆盖 3 个供应商并以 `source-exhausted` 收口；英文“machine learning”按期刊+会议、2020–2025、目标 100 实得 3 条、扫描 20 页、覆盖 4 个供应商并以 `hasMore=null / page-limit` 收口。英文停止保留旧 3 条快照和 1 条选择，5 秒后无迟到恢复；重新完成后本地“最新”排序未触发新检索。正常/最大化、机构网页隐藏、主窗可点击和无额外窗口均通过；40/100、真实跨页选择与完整 observed/synthesized 矩阵未形成，因此 discovery auth 为 `PASS`，search truth 为 `PARTIAL PASS`，UX 为有界 `PASS`。
- 隔离四页 fixture 已在单一最新候选上完成：一个 PDF Canvas、0 iframe、reader active 星河 renderer=0；100%/125% 精确选择、高亮、批注编辑、保存证据、正常/最大化窗口、SideSheet 覆盖不压缩正文和关闭后主界面点击均通过。90° 页视觉通过，但旋转页鼠标精确选区未能稳定捕获，保持 `UNVERIFIED`。
- 只删除隔离项目的 `document-derived-v1.sqlite` 后，`document-evidence-v1.sqlite` SHA-256 前后均为 `4B2251844350D1DBBA65B9E025A0632069C45A281BFECB3A1B26BA2822BE8879`；2 条批注与 1 条保存证据先明确为 missing，重解析后 3/3 回到 exact，没有静默移动或删除。本地 E5 索引 ready（4 segments/4 embeddings），中文查英文和英文查中文均命中并跳回正确页码。
- 四页 fixture 完成过快，无法在活动窗口内人工完成解析关闭重开同 run 后停止，也无法完成原生索引 pause/resume/cancel/restart；这些语义仍有确定性 core 测试，但原生门保持 `UNVERIFIED`。隔离空论文库进入 Agent 时出现 `AGENT_IMMERSIVE_VISUAL_SOURCE_MISSING`，原因是测试库没有 V20 视觉源，不是 PDF/证据/索引损坏；静态背景可继续，空项目启动提示体验需后续窄修。
- 验收结束时指定隔离 Sidera 已完全关闭；没有查看或操作其他进程，没有打开/写入真实论文库、重建 V20、下载模型、调用 Provider、清除机构会话、暂存或提交。证据：[sidera-016-r1-native-closure-2026-08-12.json](./evidence/sidera-016-r1-native-closure-2026-08-12.json)。

开发 014 当前聚合状态同步为 `IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE AUTH PARTIAL PASS / NATIVE SEARCH TRUTH PARTIAL PASS / NATIVE UX PARTIAL PASS / USER EXPERIENCE PARTIAL PASS`；不以 discovery 认证 PASS 替代完整 40/100、跨页/供应商和用户体验门。

## 2026-08-12 开发 016 / 全文证据台 R2

- 已实现 PDF.js 单 Canvas + 透明 TextLayer、旋转页坐标、按近可见页读取的 UTF-16 页文本，以及不含 parse run ID 的 `DocumentEvidenceAnchor`。文本选择后才显示高亮、批注和保存证据动作；唯一“证据”入口打开默认关闭的纯黑 SideSheet，阅读正文保持优先且无常驻右栏/Hero。
- 新增非重建型 `Sidera/document-evidence-v1.sqlite`，保存 annotations、saved_evidence 和 source preference；create/update 语义严格区分，重解析以保存时 canonical baseline、引文哈希、前后文和矩形重定位，返回 `exact / reanchored / ambiguous / missing`。
- 派生库升级到 `user_version=4`：片段、FTS5、索引任务和 384 维 float16 E5 全部按 job_id 隔离；分段最多 800 UTF-16、重叠 120；CPU 固定 2 线程、batch 16、DirectML 关闭。索引显式启动，支持暂停/恢复/取消；`auto` 只有在语义索引 Ready 时使用 0.45 lexical + 0.55 semantic 的加权 RRF，否则明确 lexical，不把降级伪装成混合结果。
- 自动门：derived 23/23、evidence 8/8、index 11/11、document protocol 7/7、Pi protocol 8/8、research search 25/25；TypeScript `PASS`，reader R1 105、reader R2 `STATIC PASS`、Agent 运行中心、F1a、014-R2 visual 92/92、012-R3 dynamic 15/15 均通过；`pnpm build` 为 1,928 modules，本地 PDF worker 打包成功；`cargo check --tests -j 2` 与正式 `cargo check -j 2` 均 `PASS`，13 条既有 `dead_code` warning 未变。
- Windows desktop lib unit-test EXE `research_hotspots_desktop_lib-d0cee4ce784a11a3.exe` 编译完成，但运行在断言前以 `0xC0000139 / STATUS_ENTRYPOINT_NOT_FOUND` 终止并提示 `TaskDialogIndirect`。`embed_resource::compile_for_tests` 的参数已生成，但 Cargo 未把 test-only 资源链接参数应用到 library unit-test harness；依照停止门不再重复触发弹窗。该项严格记为 `TEST-HOST UNAVAILABLE`，不是产品、协议、语义模型或 016 断言 `FAIL`。
- 四页 fixture `document-reader-r2-four-page.pdf` 为 76,563 bytes，SHA-256 `2EB19E71946F84D2620ACD6FB9D381835CF15812AF2A19CAEC416C000DC5B065`，覆盖中文、英文、双栏和 90° 旋转；本轮只完成生成、哈希与静态契约，100%/125% 选择/高亮、解析关闭重开停止、派生重建后批注重定位、真实 E5/取消/恢复、正常/最大化视觉均为 `UNVERIFIED`。
- 本轮没有启动 GUI、访问网络、调用 Provider、打开或写真实论文库、重建 V20、下载全文、暂存或提交。证据：[sidera-016-document-evidence-r2-2026-08-12.json](./evidence/sidera-016-document-evidence-r2-2026-08-12.json)。

P1 继续冻结为 `PARTIAL / ADAPTER DEFERRED`；WOS、CNKI、Scopus 仍只有人工入口而没有正式自动连接器。开发 014-R3 的历史 `NATIVE INPUT OWNERSHIP HISTORICAL FAIL`、当前 `INPUT FIX NATIVE RETEST PASS` 与个人图书馆首次交易复验结论全部保留，不被 R4 或 015 覆盖。

## 2026-08-09 开发 015 / 文档原生阅读台 R1

- F1a 的 `Sidera/documents-v1.sqlite` 继续治理原始 `DocumentVersion`、不可变 blob 与 SHA-256。新建独立 `Sidera/document-derived-v1.sqlite` 保存解析运行、页、文本段、UTF-16 锚点、FTS 与阅读位置；产品文件名保留 v1，当前 Schema 为 `user_version=2`，包含显式 v1→v2 UTF-16 长度回填。原始 PDF 不因解析、搜索、缩放或恢复位置而改变。
- 阅读器采用本地 `pdfjs-dist@5.4.149` 和本地 worker bundle；仅主 WebView 可使用不透明 `sidera-document://localhost/version/{token}`。协议支持 GET/HEAD/OPTIONS 与单 Range，拒绝越界/多 Range，不暴露本地路径；50MB/300 页限制在解析前执行。reader 激活时不挂载星河 Canvas，PDF 内容保持至少 70% 主空间，搜索与文档详情按需打开。
- 最后硬化已静态确认落盘：阅读器重开可恢复 active parse snapshot 并继续有限轮询，`document-reader-viewport` 是唯一外层滚动所有者；协议错误响应带 CORS，稳定错误码可由主 WebView 读取；research-search 的 `request_tasks` 使用上限 32 的 LRU，活动请求免于淘汰。
- 自动技术门：reader audit 105/105、derived core 14/14、document store 9/9、P2a-R2 84/84、`pnpm build` 1,928 modules（本地 `pdf.worker` bundle）为 `PASS`。2026-08-09 补跑中，core LRU 定向测试 1/1 `PASS`；首次桌面 `cargo test` 被无关 integration target `sidera_pi_runtime_protocol` 缺失 `sidera_rag` / `sidera_stream_gate` 阻断。随后定向到 desktop lib 的 `sidera_document_protocol::tests` 已完成编译，但 Windows test host 在进入断言前以 `0xC0000139 / STATUS_ENTRYPOINT_NOT_FOUND`（`TaskDialogIndirect`）终止，协议断言因此为 `TEST-HOST UNAVAILABLE`，不是产品、协议或断言 `FAIL`，也不得写成协议测试 `PASS`。`cargo check --manifest-path src-tauri/Cargo.toml -j 2` 为 `PASS`，仅有 13 条既有 `dead_code` warning；此前 `cargo build --manifest-path src-tauri/Cargo.toml -j 2` 只保留为先前包证据。最终独立静态复审仍为 P0/P1/P2=0。
- 可见 Tauri fixture 为 `Simple_AI_20260430_111347.pdf`，74,996 bytes、2 页，DocumentVersion `version-b433cace57bf4bd5bbe5e5a1`，SHA-256 `cdac21fe62ac20328e983a930c80dad66b0eb9b19f99abfa96977fe5d5074f9c`。PDF.js 单 renderer 生成 2 个 canvas，无 iframe fallback 或错误；约 0.75s 从解析进入 ready。中文“人工智能”命中第 1/2 页并跳转；页 1/2、110/120% 缩放及离开重开恢复通过。
- 正常 1360×860 与最大化 1707×1019 均为 `PASS`。搜索跳页后 `window.scrollY=0`，shell/toolbar y=70，物理缩放按钮可点击；reader active 时 starfield canvas=0。原生协议 Range `bytes 0-7` 返回 206、`Content-Range: bytes 0-7/74996`、正文前缀 `%PDF-1.3`，HEAD 200、OPTIONS 204。416 只由 core 自动 Range 测试通过，WebView fetch 拒绝使其没有独立原生状态证据，故不写 `NATIVE 416 PASS`。
- 派生库 ready run=1、pages=2、spans=505、anchors=505、FTS rows=2，reader state 已持久化。当前结论严格为 `IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE READER PASS (CODEX VISIBLE DESKTOP) / USER EXPERIENCE UNVERIFIED`；OCR、E5、批注、AI 阅读和用户主观体验继续后置。证据：[sidera-015-document-reader-r1-2026-08-09.json](./evidence/sidera-015-document-reader-r1-2026-08-09.json)。

## 2026-08-27 开发 014-R4 / 最新原生真值闭环

- 武大官网当前数据库入口使用三参数 `jumpDatabases(enc, uname, '')`。core 探针已同时兼容历史双参数和当前三参数绑定；用户只在官方 WebView2 页面手工登录，Sidera 未读取或记录凭据、Cookie、ticket 与表单值。
- 中文矩阵：`人工智能`、期刊+会议+学位论文、无年份、目标 40，实际 10 条、扫描 2 页、覆盖 3 个供应商，`targetReached=false / hasMore=false / source-exhausted`。
- 英文矩阵：`machine learning`、期刊+会议、2020–2025、目标 100，实际 3 条、扫描 20 页、覆盖 4 个供应商，`targetReached=false / hasMore=null / page-limit`。停止重跑保留旧 3 条与 1 条选择，5 秒后无迟到恢复；重新完成后切换本地“最新”排序没有启动新检索。
- 正常与最大化窗口均保持首条结果可见、机构网页默认隐藏、主窗口可点击；只存在一个可见 Sidera 顶层窗口，没有 CMD、认证或孤儿窗口。当前真实结果均不超过 10 条，因此跨页选择和逐条 observed/synthesized 全组合无法诚实执行，继续记 `UNVERIFIED`。
- 聚合状态为 `IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE DISCOVERY AUTH PASS / NATIVE SEARCH TRUTH PARTIAL PASS / NATIVE UX PASS_BOUNDED`。复验任务本身已完成；完整真值 PASS 的下一步不是重复点击，而是补强来源适配器、远端分页和 position-basis 可观察性。证据：[sidera-014-r4-auth-search-truth-2026-08-09.json](./evidence/sidera-014-r4-auth-search-truth-2026-08-09.json)。

## 2026-08-09 开发 014-R4 / 任务绑定发现认证与检索真值加固

- `discovery-fulltext` 登录等待现在属于同一个研究搜索事务，复用 taskId/searchId、候选快照与取消句柄。认证等待不计入 90 秒活跃搜索预算；恢复后从同一搜索继续，停止操作同时取消等待和该搜索，不能出现第二次查询或失去结果所有权。
- `NormalizedCandidateDraft.retrievalPosition` 新增 `basis=observed|synthesized`：observed 只用于供应商页面真实观察到的 DOM/page/rank，兼容回退无法证明位置时必须标记 synthesized。去重仍继承首次出现位置，不因供应商分组或展示排序重排。
- `ResearchSearchTruth` 增加 `targetReached` 与 nullable `hasMore`；`limitReached` 仅镜像 `targetReached` 供兼容。达到 40/100 本地目标不等于远端来源耗尽；`hasMore=null` 不得显示成 false，未知 total 继续保持未知。机构页面保持结果优先构图，活动来源与低频传输/诊断默认折叠。
- 自动技术门为 `PASS`：R4 审计 45/45、research core 24/24、正式 `cargo check/build -j 2`；import-read 18/18、014-R2 visual 92/92、012-R3 dynamic 15/15、P2b-R2、F1a、desktop shell 与 workbench read 回归也通过。
- 当前原生候选只尝试复用已有机构登录态；数据库 SSO 未初始化，官方发现页面要求用户认证。未输入机构凭据并取消，因此中文/英文、筛选、40/100 目标、真实页数/覆盖/终止原因及本地 0-IPC 交互均未做完整原生矩阵。状态保持 `IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE DISCOVERY AUTH UNVERIFIED / NATIVE SEARCH TRUTH UNVERIFIED / NATIVE UX UNVERIFIED`，不把环境未认证升级为产品失败。
- P1 保持 `PARTIAL / ADAPTER DEFERRED`；WOS、CNKI、Scopus 仍属 P6 且没有正式连接器。证据：[sidera-014-r4-auth-search-truth-2026-08-09.json](./evidence/sidera-014-r4-auth-search-truth-2026-08-09.json)。

## 2026-08-08 开发 014-R3 / 纯黑浮层、星图状态与题录通知修复

- 历史输入失败与当前修复复验并列保留；本包状态为 `IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE APPEARANCE PASS (BOUNDED) / NATIVE INPUT OWNERSHIP HISTORICAL FAIL / INPUT FIX IMPLEMENTED / INPUT FIX NATIVE RETEST PASS / NATIVE LIBRARY AUTH FIRST-TRANSACTION RETEST PASS / NATIVE IMPORT READ PASS / USER INPUT+AUTH EXPERIENCE PASS_BOUNDED`。R4 与 015 不反向改写该时间线。
- “连接与来源”SideSheet 只在组件内声明 `--workbench-side-sheet-surface: #000`，Panel、Header、关闭按钮和机构能力分组统一引用；Body 透明继承。全局主题、16% 遮罩、边框、阴影、圆角、状态色、hover/focus、桌面/窄屏几何和退出动画均未改变。
- 理论入口现在先执行一次 `get_v20_galaxy_payload`。ready 才提交理论模式、focus 与 localStorage；当前 active V20 不存在时进入 `not-ready`，保留正在运动的沉浸 Canvas、动画时间、checkpoint 和 `immersive` 偏好，显示“理论星图待更新”非模态面板。“继续沉浸”为 0 IPC/0 重建，“前往分析流水线”只导航；IPC/超时是“理论载荷读取失败”，真正 Canvas/WebGL 故障才是“理论背景渲染失败”。
- 画布左上角历史来源常驻提示已移除。“…”菜单按 `mountedImmersivePayload` 展示 source `historical-v20` r0 / 25,463、current library r1 / 25,473 及“非当前热点分析”，展开为 0 IPC。`get_v20_galaxy_payload` 复用 prepared 只读、`query_only` 连接；冷启动偏好理论而 active V20 缺失时仍由真实动态沉浸首帧完成 012-R3 启动门。
- 题录提交状态/历史保留现有 Tauri 命令名与 JSON，但改为 prepared `READ_ONLY + query_only` 主库连接，只校验 Schema v14/import ledger；读取不再执行 `migrate_library_file`、DDL、mutation permit 或 review receipt 回写。`paper_import_commits` 继续是提交事实权威；review store 只读打开不创建目录、不切 WAL、不建表、不启事务。ledger 存在而 receipt 缺失仍返回权威状态；两端均不存在返回稳定 `SIDERA_IMPORT_COMMIT_STATUS_NOT_FOUND`。
- 前端 Tauri 字符串拒绝统一转换为保留稳定错误码的 `Error`。`import-review` 后台状态/历史错误分别汇报，固定 8 秒自动关闭；成功重读、离开“检索与导入”或点击 X 立即清理。提交/回滚阻断错误仍常驻，详细错误码只进入题录诊断；database identity/generation/revision 门隔离 A-B-A 迟到响应。
- 自动技术门为 `PASS`：`pnpm build` 通过（Vite 6.4.3，1,922 modules，8.12s）；`cargo check --manifest-path src-tauri/Cargo.toml -j 2` 通过，只有 13 个既有 `dead_code` warning。题录通知 16/16、理论可用性 10/10、更新后的 014-R2 视觉 92/92、012-R3 动态启动 15/15、工作台读取、性能 105、P2b、P2b-R2 17、机构 113、桌面壳 16/16、P2a、v14 兼容 20、F1a 20 均通过。独立复审为 P0=0 / P1=0；未完成原生门只记为 P2/`UNVERIFIED`。
- Rust 定向测试均为 1/1 `PASS`：prepared review store `query_only` 读取、all-skip 状态/历史只读、missing status/history，以及新增真实库精确副本 `import_read_real_copy`。all-skip 首跑因合成夹具仍为 `user_version=0` 被新的 v14 只读契约正确拒绝；只把夹具补为 v14 后通过，产品契约未放宽。
- 精确副本读取到 history=1、权威 batch=`committed` 且没有 review store。副本主文件前后 SHA-256 均为 `B546C505F6FAD89C9D4C6429DBBA8FACC7838D5F66CC9367E24A2824EFDCA8FA`、214,532,096 bytes、Schema v14、25,473 篇、revision 1、active V20 0；只产生副本自身 0-byte WAL 与 32KB SHM bookkeeping。当前真实库基线相同，最终原生复验后的只读指纹也已再次确认不变，详见下列原生记录。
- 原生构建与启动：`cargo build --manifest-path src-tauri/Cargo.toml -j 2` 48.01s `PASS`；直接启动 GUI exe PID 61844，无可见 CMD。只存在一个 `research-hotspots-desktop`，复用已存在且 HTTP 200 确认为当前项目的 `127.0.0.1:5174` Vite，没有并行启动第二编译或服务实例。
- 最大化窗口与正常窗口 UIA Rect `(260,119)-(2062,1303)` 的既有截图确认 SideSheet 为 `#000`；理论按钮经 UIA 触发后沉浸 Canvas 未卸载，连续截图中星位持续变化且非黑屏，“理论星图待更新”出现；“前往分析流水线”只导航且没有自动创建 job。这些事实保留为 `NATIVE APPEARANCE PASS (BOUNDED)`。Escape 焦点记录与截图没有捕获冻结瞬间的主 HWND enabled/owner，也没有直接证明机构原生 WebView 的物理输入层级，因此原先“WebView 无层级遮挡”和聚合 `NATIVE VISUAL PASS` 均撤回。
- “…”菜单无需额外读取即可显示历史 V20 r0 / 25,463、当前库 r1 / 25,473 和“非当前热点分析”，画布左上无常驻来源。题录“检索与导入”正常窗口显示“读取诊断 · 审查批次正常 · 提交状态正常 · 提交历史正常”且无长期 toast；隔离 fault fixture 又证明 batch/status/history 分别保留稳定错误码，history toast 59ms 出现、+4003ms 仍在、+8304ms 消失，X 后 100ms 消失，离页 150ms 清除，成功重读 50.8ms 恢复且无 toast，因此聚合门升级为 `NATIVE IMPORT READ PASS`。提交/回滚阻断错误常驻未单独注入，仍为独立 `UNVERIFIED` 边界。
- 最终真实库 immutable + `query_only` 复核：SHA-256 仍为 `B546C505F6FAD89C9D4C6429DBBA8FACC7838D5F66CC9367E24A2824EFDCA8FA`、214,532,096 bytes、Schema v14、25,473 篇、revision 1、active rows 0、ready snapshots 4、commit ledger 1；主文件 mtime 仍为 `2026-08-06T04:55:16Z`。WAL 0 byte 的 mtime 为 `2026-08-08T14:12:09Z`，SHM 32,768 bytes 的 mtime 为 `2026-08-08T14:27:17Z`，仅说明只读连接 bookkeeping，主内容与哈希未改变。
- 用户随后确认鼠标仍能移动，但 Sidera 内无法点击；通过任务管理器强制结束 Sidera 后输入立即恢复。系统侧没有 Application Hang、崩溃或 GPU reset 证据，且冻结瞬间没有主 HWND enabled/owner 快照，因此只能确定 `NATIVE INPUT OWNERSHIP FAIL`，不能把 `set_enabled` 失衡或原生 WebView 可见性竞态中的任一项写成已证实唯一根因。
- 输入窄修已实现：生产认证与共享浏览器路径不再调用 `set_enabled(false)`，主窗口恢复幂等；机构 WebView 的逻辑 visible 只在物理 hide/show 成功后提交，单调 `clientRequestId` 阻止迟到 show，show 两阶段失败回滚，关闭只做 0/45/120ms 三次有限 hide 重试。正常和最大化 SideSheet X/Escape、机构 WebView show/hide、认证窗口关闭后输入均复验；用户确认最大化可点击、机构浏览器隐藏后可点击、认证窗关闭后可点击且无异常窗，因此为 `INPUT FIX NATIVE RETEST PASS`，但历史 FAIL 不删除。
- 个人图书馆时间线：旧候选首轮完成登录后关闭却进入 Cancelled，是 `FIRST-TRANSACTION HISTORICAL FAIL`；第二次已登录后 Ready 只是 `SECOND-ENTRY PASS_BOUNDED`。最新窄修为个人图书馆只做一次 current 检查，随后在同一 4 秒 deadline 内导航并直接轮询同一个可见 WebView/environment 的固定 landing；数据库访问与发现全文仍是三次 current 加隐藏父页 reload。机构工作台专项 117/117、正式 `cargo check -j 2`、desktop lib test binary `--no-run`、`cargo build -j 2` 均 PASS，独立复审 P0/P1/P2=0。附加 `cargo check --tests` 因既有 `tests/sidera_pi_runtime_protocol.rs` path-module 在 integration test crate 中的模块引用漂移而 FAIL；不是本窄修引入，不影响正式 cargo check，也不能表述为全 tests PASS。
- 最新 PID 62020 在清除会话后完成个人图书馆首轮登录并显示 Ready；用户明确回复“已就绪 / 手动关闭 / 可点击 / 无异常窗口”，故为 `NATIVE LIBRARY AUTH FIRST-TRANSACTION RETEST PASS / USER INPUT+AUTH EXPERIENCE PASS_BOUNDED`。2026-08-09 16:40:32+08 快照：main HWND `0x33049E` 最大化 rect `(-11,-11)-(2571,1539)`、visible/enabled、uncloaked、owner 0/rootOwner self；非 main 可见顶层窗口 0；library/auth WRY `0x1F10988` 与 PID 46180 renderer 隐藏；唯一可见交互 WebView 为 main，无孤儿拦截层。
- 最终 immutable + `query_only` 复核为 SHA-256 `B546C505F6FAD89C9D4C6429DBBA8FACC7838D5F66CC9367E24A2824EFDCA8FA`、214,532,096 bytes、v14、25,473、r1、active V20 rows 0、ready snapshots 4；main/WAL(0B)/SHM(32768B) 的大小与 mtime 在复验前后均不变。理论数据待更新不等于 WebGL 失败；题录读取与非阻断通知生命周期为 `NATIVE IMPORT READ PASS`，只有未单独注入的提交/回滚阻断错误常驻仍 `UNVERIFIED`。自动/文档任务没有 Provider、机构网络、全文下载、热点重建或真实库写入；官方认证仅由用户在原生会话中进行。没有暂存、提交、推送、PR 或发布。证据：[sidera-014-r3-visual-truth-and-notice-2026-08-08.json](./evidence/sidera-014-r3-visual-truth-and-notice-2026-08-08.json)。

## 2026-08-08 开发 014 / 机构资源工作台 R1

- 用户实机反馈构成开发基线：常驻“打开数据库会话 / 登录我的图书馆 / 打开机构浏览器 / 机构网页已在侧栏”让目标与表面混淆；登录弹窗关闭后原生状态不收敛；结果固定显示 10 条却不解释召回上限、排序或覆盖；当前自动来源仅有既有武大统一发现路线，不能检索用户指定的 WOS、CNKI、Scopus；“数据库直达”若只打开官网不形成自动发现、审查、入库和 Agent 闭环，则不能作为产品价值；页头、机构说明、就绪状态、来源卡与按钮组把结果推到首屏以下。
- 认证实现改为一个 `InstitutionAuthCoordinator` 协调三个独立目标：`database-access`、`library-account`、`discovery-fulltext`。同目标复用并聚焦当前事务，异目标并发稳定返回 busy；事务带 generation，迟到回调不能覆盖新事务，`ready` 终态不能被晚到 close 降级，失败/取消也不会抹除此前已经证明的 ready 状态。
- 关闭连接窗口只触发验证，不直接等于成功。个人图书馆在同一个 4 秒 deadline 中先检查当前可见页一次，若仍未知则导航并直接轮询同一个可见 WebView/environment 的固定图书馆 landing；数据库访问和发现全文继续检查当前页三次，再 reload 隐藏绑定父页。只有目标对应身份获得证明才进入 `ready`。官网 popup 继续由 `NewWindowResponse::Create + window_features` 承接，公开 payload 排除 query、fragment、ticket、Cookie、密码。
- 首屏改为一个紧凑主检索区、单行连接摘要和默认关闭的“连接与来源”抽屉；旧 hero、常驻工具条、大块连接说明和重复来源卡退出首屏。抽屉容纳三个连接目标、人工来源入口、浏览器显示/隐藏及诊断。WOS、CNKI、Scopus 只标记“仅人工访问 · 尚无连接器”，开发 014 不宣称已获得这些数据库的自动检索能力。
- 检索由用户选择 40 或 100 条候选目标，而不是前端指定连接器。Rust 在上限前执行记录类型/年份过滤、规范化、去重，并返回 `resultLimit`、`limitReached`、`pagesScanned`、`recordsReceived`、`recordsAccepted`、`duplicatesMerged`、`totalHits?`、`coverage`、`completionReason`、`orderBasis`、供应商分解和 `retrievalPosition.connectorId`。未知总命中量保持未知；当前已取回记录不冒充供应商全库结果。前端每页 10 条仅作本地分页，跨页选择保留；来源返回、最新、最早、标题排序仅作用于当前候选，不触发新 IPC，也不冒充供应商全局排序。
- 自动技术门为 `PASS`：既有 `pnpm build`、core/search/runtime 与相关回归保持；最新个人图书馆关闭窄修的机构工作台专项为 117/117，正式 `cargo check -j 2`、desktop lib test binary `--no-run`、增量 `cargo build -j 2` 均通过，独立复审 P0/P1/P2=0。附加 `cargo check --tests` 因既有 `sidera_pi_runtime_protocol` integration wrapper 模块引用漂移失败，单独记录为非本修复的 test-target `FAIL`，不得模糊成全 tests PASS。
- Windows debug/release 入口继续统一为 `windows_subsystem = "windows"`。个人图书馆首轮历史失败、第二次已有会话有界通过和最新首轮复验通过按顺序保留；当前能力为 `NATIVE PERSONAL LIBRARY AUTH FIRST-TRANSACTION RETEST PASS`，用户输入与认证体验为 `USER INPUT+AUTH EXPERIENCE PASS_BOUNDED`。数据库访问仍为有界 `NATIVE DATABASE ACCESS AUTH PASS`。
- localhost 1360×864 检查的首屏、筛选与抽屉为 `PASS`，它只证明本地网页 UI，不构成原生 Tauri 认证、搜索真值或 UX 证据。真实库通过 immutable + `query_only` 复核：SHA-256 `B546C505F6FAD89C9D4C6429DBBA8FACC7838D5F66CC9367E24A2824EFDCA8FA`、214,532,096 bytes、Schema v14、25,473 篇、revision 1，metadata 不变。
- 开发 014 当前状态严格保持 `IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE AUTH PARTIAL PASS / NATIVE SEARCH TRUTH UNVERIFIED / NATIVE UX UNVERIFIED / USER EXPERIENCE PARTIAL PASS`。其中 `database-access` 为有界 `PASS`、`library-account` 为 `PASS`、`discovery-fulltext` 为 `UNVERIFIED`；认证流程的用户体验通过不替代完整机构工作台 UX。自动与文档收口没有发起 Provider 调用、机构网络请求或全文下载；原生验收中的官方机构网页访问由用户在隔离 WebView2 会话中完成，未把凭据、Cookie、ticket 或表单值带入 Sidera 状态和证据。当前真实论文库未写入、热点未重建，且没有提交、推送、PR 或发布。证据：[sidera-014-institution-workspace-r1-2026-08-08.json](./evidence/sidera-014-institution-workspace-r1-2026-08-08.json)。

## 2026-08-07 开发 013 / 文献工作台首屏与持续卡顿治理

- 基线只读分阶段计时确认，普通工作台读取此前重复承担完整数据库准备：完整校验中位 490.7ms，其中 `quick_check` 366.0ms（74.59%）、`foreign_key_check` 34.3ms（6.99%）、V20 孤儿引用检查 87.3ms（17.79%）、论文计数 1.6ms（0.33%）、metadata 读取 0.41ms（0.08%）。并发读取受同一路径准备锁串行，开发版 StrictMode 又会把已进入 Rust/SQLite 的工作放大。
- 基线点击工作台到首批内容为 5,981.9ms，详情为 6,073.6ms；该路径的目标业务读取 IPC 数为开发版 8、生产版 4。最大化窗口约 604 draws/s、Renderer process CPU 30.55%、GPU process CPU 53.80%、Task 678.2ms；正常窗口约 688 draws/s、Renderer CPU 19.10%、GPU CPU 32.87%、Task 421.7ms。首次进入的主因是重复重量级数据库准备与请求，停留期主因是工作台背后的全屏 WebGL 满 RAF。
- 读取契约已经拆分。启动、初始化和恢复流程显式执行 `prepare_library_database`；普通 `paper_library_status`、`query_paper_library` 与 `paper_library_facets` 在未准备或数据库指纹失效时稳定失败，绝不隐式回落 full prepare。准备有效时打开只读、`query_only`、Schema v14 明确校验的轻量连接；分面在同一只读事务中读取 revision 与三组结果，并按 database path + project + library revision 缓存，写路径按数据库失效。父层已取得的状态、分面和首屏结果作为同一 revision 的 bootstrap 交给工作台；StrictMode 同键在途请求合并，分页/刷新不再读取分面。
- 工作台不再默认选择首篇论文。首屏列表稳定后也不会自动挂载 `PaperDocumentPanel`；用户明确选文时才并行读取文档快照和下载列表，同键在途详情请求合并，旧响应序号门继续保留。
- 012-R3 的首帧启动契约保持不变：初始化末尾仍同步提交首个真实 WebGL 帧，只有该帧成功才报告就绪。仅 `workbench` 运行态设置 24 FPS 渲染预算，Agent 运行态不限；跳帧不推进渲染，下一次实际处理按距上次处理帧的墙钟 delta 推进，visibility 恢复安全，预算切换不重建 renderer。没有降低 DPR、论文数或尘埃数，也未静态化背景。
- 显式 prepare 二次窄修前的开发冷启动中间测量为：`DOMContentLoaded` 6,775.9ms；数据库 setup 1 次、2,923.9ms；V20 snapshot 401.3ms；library status 5.7ms；facets 146.8ms且 1 次；首屏 query 148.1ms且 1 次；背景 payload 647.6ms，完整真实动态画面约 11,070ms 可见。该组数字不再作为二次窄修后的最终 resource chain；最终链待复测更新，复测仍必须由真实动态 WebGL 首帧结束且不得使用静态回退、重试或热点自动分析。
- 显式 prepare 二次窄修前的中间原生采样为：从已就绪 Agent 点击“文献工作台”到 20 条首屏稳定显示 114.2ms，详情未自动加载，业务读取 IPC 为 0；另有 2 个 Tauri event listen 订阅。显式选择论文后详情面板 39.2ms 挂载、60.1ms 稳定，恰好 2 次 IPC（18.7ms / 25.7ms）；刷新只有 1 query、没有 facets，`queryMs` 为 268–269ms。该组数据 `finalForDevelopment013=false`，不代表二次窄修后的最终性能。
- 同一中间采样中，最大化窗口约 121.2 draws/s、Renderer process CPU 7.64%、GPU process CPU 7.14%、Task 347.926ms；正常窗口约 120 draws/s、Renderer CPU 9.07%、GPU CPU 6.97%、Task 314.103ms，两帧 SHA-256 不同。它证明当时版本的 24 FPS 背景仍动态，但不能代替二次窄修后的可见桌面复验。最终原生结论为 `NATIVE PERFORMANCE UNVERIFIED`，用户体感为 `USER PERFORMANCE ACCEPTANCE UNVERIFIED`。
- 上述 `USER PERFORMANCE ACCEPTANCE UNVERIFIED` 是 2026-08-07 evidence 快照。2026-08-08 用户随后在正常窗口、最大化窗口及明确选文后反馈“正常”，有界主观体验更新为 `USER PERFORMANCE ACCEPTANCE PASS (BOUNDED)`；该反馈没有记录最终 IPC、首屏/详情耗时、draws/CPU/Task 或冷启动 resource chain，不能升级 `NATIVE PERFORMANCE UNVERIFIED`。
- 当前实际论文库仍为 Schema v14、25,473 篇、library revision 1，主数据库 SHA-256 `B546C505F6FAD89C9D4C6429DBBA8FACC7838D5F66CC9367E24A2824EFDCA8FA`、论文数和 revision 前后不变，main database content mutations 为 0，WAL 为 0 bytes。原生启动与只读连接会让 0-byte WAL 和 32KB SHM 的 SQLite bookkeeping 时间戳前移；这不是内容写入，但也不能表述为“文件系统完全未触碰”。
- 自动技术门：`pnpm build`、正式 `cargo check -j 2`、Rust core 两组定向测试（各 1/1）、工作台读取/背景所有权、R3 冷启动 15/15、P2b 提交/v14/R2、F1a、桌面壳与项目文档专项均为 `PASS`。新增桌面端 5 项测试已成功编译，但 Windows test host 以 `0xffffffff` 退出，记录为 `TEST-HOST UNAVAILABLE`；额外的 `cargo check --tests` 因既有 integration unresolved modules 为 `FAIL`，它不是正式 `cargo check`，也不推翻其 `PASS`。
- 执行边界：没有 Provider 调用、真实机构网络访问、全文下载、热点重建、当前真实论文库内容写入、提交、推送、PR 或发布。无筛选“最新”排序仍显示 `USE TEMP B-TREE FOR ORDER BY`，修复后刷新 query 仍为 268–269ms；未经授权不修改 Schema、索引或排序语义。证据：[sidera-013-workbench-performance-2026-08-07.json](./evidence/sidera-013-workbench-performance-2026-08-07.json)。

## 2026-08-06 开发 012-R3 / 冷启动动态快照重建闭环

- 只读真实数据库证据：当前实际选择库为 `src-tauri/target/v022-desktop-acceptance-2/library/research-hotspots-v7.sqlite`，Schema v14，论文数 25,473，library revision 1；`v20_analysis_state` 为 0 行。库内有 4 个 `ready` 历史快照且全部属于 revision 0；最新结构完整历史快照包含 25,463 篇论文、160 个热点和 25,463 条 membership。
- 真实库代码路径复核还纠正了一个过严校验假设：`v20_hotspots.paper_count` 是热点构建时的证据论文数，不是该热点最终合并后的 membership 基数。4 个历史快照中该字段合计 5,340，而 membership 按热点合计 25,463，160 个热点均不相等；结构完整性因此必须校验快照级 paper/hotspot/membership 总数、引用完整性与孤儿关系，不能要求逐热点 `paper_count == membership count`。
- 版本变化与数据一致：开发 011 / P2b 的正式提交使论文数 `25463 → 25473`、library revision `0 → 1`，并按既有“正式入库后不自动运行热点分析”约束使 active state 失效。数据库路径正确，迁移后的 v14 主库可进入程序；当前证据不支持“选错库”或“Schema 迁移失败”作为根因。
- 准确根因：`load_agent_immersive_background` 仍通过 `read_analysis_state` 把 active V20 指针当作沉浸动态载荷的硬前提。P2b 合法删除 active state 后，调用在 WebGL Canvas 挂载前即失败；因此 012-R2 的真实首帧门没有机会达成。故障是“入库失效策略与背景载荷契约冲突”，不是要求 P2b 自动重跑热点分析。
- R3 契约：只读视觉来源选择器在 active state 明确存在时只接受与当前 revision 一致且结构完整的快照，stale、超前或损坏均明确失败；仅当 active state 缺失时，才允许选择最新结构完整的 `ready historical-v20` 供沉浸背景可视化，并在载荷中明确标注视觉来源类型、当前/来源 revision 与 freshness，不能称为当前分析结果。没有有效来源时明确失败。
- 理论背景继续 current-only。若冷启动偏好理论但当前 active V20 不可用，只能切换到同样提交真实动态首帧的沉浸背景；静态背景不是正常回退。载荷期限和 Canvas 挂载看门狗只负责进入可观察 `failed` 终态，不能伪造成功；只有真实首个动态帧能够进入 `ready`。
- 自动验证：TypeScript、Vite 6.4.3（1,919 modules）、Rust core 定向测试 11 项、`cargo check -j 2`、真实数据库沉浸载荷、冷启动 R3 专项 15 项、P2b 提交/v14/R2、F1a、桌面壳 16 项、项目文档和差异检查均为 `PASS`。
- 原生验证：真实 Tauri 连续冷启动 3 次，均未点击回退、重试或静态背景；每次均为单一 immersive GPGPU WebGL Canvas、context 未丢失，视觉来源明确为 `historical-v20 / stale-by-library-revision / source r0 25463 / current r1 25473`。900ms 帧对比分别变化 3.0871%、3.0483% 和 2.9700%；正常窗口、恢复最大化及最大化冷启动均通过。
- 运行状态与 revision 门：第 3 次后只保留一个响应中的 Sidera 进程 PID 41708。三次均读取此前正式导入已推进到 r1、active 为空的当前真实库，故“正式导入导致 revision 变化后再次冷启动”已经覆盖；验证期间 library writes 为 0、hotspot rebuilds 为 0。
- 原生证据方法：tasklist 显示 Console session 中唯一 Sidera 窗口，Tauri visible API 返回 `visible=true`，实际 Tauri WebView 截图同时包含自定义标题栏、动态星河、历史来源提示和 Agent 输入面；同一 WebView 的两帧哈希与像素差证明动态变化。Computer Use helper 在一次 reset/retry 后仍以 `0x80070003` 失败，只记为工具 `UNAVAILABLE`，不记为 Sidera 产品失败。
- 当前状态：`IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE STARTUP PASS / USER VISUAL ACCEPTANCE UNVERIFIED`。证据：[sidera-012-r3-cold-start-dynamic-snapshot-2026-08-06.json](./evidence/sidera-012-r3-cold-start-dynamic-snapshot-2026-08-06.json)。
- 执行边界：保留大型 dirty worktree；本轮不调用 Provider、不访问真实机构网络、不下载全文、不自动运行热点分析、不写论文库，不提交、不推送、不创建 PR、不发布。

## 2026-08-06 开发 012-R2 / 冷启动真实动态首帧闭环

- 用户明确拒绝开发012-R1的“8秒后自动静态进入”策略：开发阶段必须修通真实动态启动，计时器不能把未完成伪装成成功。开发012-R1的自动证据作为历史保留，但产品结论更正为`PRODUCT FAIL / SUPERSEDED`。
- 根因不是论文库或`refreshAll()`：Agent背景切换在载荷读取前等待`requestAnimationFrame`，而WebView2冷窗口显现阶段可能暂时节流RAF；沉浸背景虽然可在尺寸更新时渲染，却把就绪上报留给后续RAF；理论背景又把深度诊断门和动画RAF混入启动完成条件。这三处共同允许“已有可渲染场景，但根级永远收不到终态”。
- 背景切换现在只等待一个宏任务以释放旧渲染器，不再等待RAF。沉浸背景完成初始化后同步执行首个真实`renderer.render()`，成功后才上报就绪；理论背景在运行时门通过后同步渲染，且仅在首帧WebGL错误计数为0时通过独立`onFirstFrame`上报。深度、密度和标签诊断继续用于运行时质量审计，不再拥有启动生命周期。
- 初始化或首帧渲染异常会进入明确`failed`路径；启动后发生的运行时错误不得把已经完成的启动重新改写为失败。自动计时器及“动态星图初始化超时，已使用静态背景进入应用”路径已经删除；显式静态按钮只保留为用户主动诊断入口，不计为正常启动通过。
- 自动验证：TypeScript、Vite（1919 modules）、桌面壳专项16项、项目文档审计和`git diff --check`均通过；验证过程机构网络请求、Provider调用、主论文库写入和全文下载均为0。证据：[`sidera-012-r2-dynamic-startup-first-frame-2026-08-06.json`](evidence/sidera-012-r2-dynamic-startup-first-frame-2026-08-06.json)。
- 当前状态：`IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE STARTUP UNVERIFIED`。只有唯一最新可见Tauri在不点击静态诊断入口的情况下完成真实动态首帧冷启动，才能记录`NATIVE STARTUP PASS`。

## 2026-08-06 开发 012-R1 / 冷启动动态背景超时降级

- 状态：`PRODUCT FAIL / SUPERSEDED BY 012-R2`。以下内容仅保留为失败历史，自动8秒静态放行已从运行时代码和专项审计删除。
- 用户原生启动停留在“正在点亮本地知识星图……”。只读定位确认数据初始化和`refreshAll()`已经结束，启动门唯一等待项为Agent动态背景的首次`onReady`；当载荷调用或WebGL首帧回调静默挂起时，旧实现没有期限，会让装饰性背景无限阻塞核心应用。
- 真实首帧仍是首选完成路径；进入`mounting-agent`后增加8秒独立期限。期限内未收到就绪回调时，根级启动状态切换为静态深空背景并进入应用，迟到回调只能保持`ready`，不得重新阻塞或改写失败状态。
- 本次只改变启动门，不修改论文库、导入账本、热点快照、Agent会话或Provider流程。TypeScript、Vite、桌面壳专项、项目文档审计与差异检查已通过，当前状态为`IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE STARTUP UNVERIFIED`。

## 2026-08-06 开发 011-R2 / P2b-R2 受控入库收口与本地检索性能修复

- 主库`paper_import_commits`账本为提交结果唯一事实来源；状态和历史均先读取主库账本，审查回执或界面刷新失败只报告次级刷新问题，不得把已经提交的事务改写为失败。重启时以主库账本best-effort对账审查批次，不重放写入；审查页在没有可编辑批次时自动恢复最近更新的已提交/已回滚批次。
- 本地文献输入框只更新草稿；Enter或按钮才执行一次查询，IME组合期不触发，空查询不执行，相同查询不重复，显式重新检索除外。旧结果在新查询完成前保留，失败或取消不清空；请求序号隔离迟到结果。
- 本地检索由Rust/SQLite负责过滤、确定性排序和分页，首屏数量受限并展示排序说明。自动状态：`IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE LOCAL SEARCH UNVERIFIED`。
- 用户已完成10条真实新增提交，进程退出后的只读检查确认主库与审查库均持久化同一提交，该已观察结果记为`NATIVE CONTROLLED IMPORT PARTIAL PASS`；基于该提交的真实SQLite副本进一步通过整次回滚与后续编辑阻断2项生产函数验证。桌面UI重启恢复、可见回滚/阻断和本地显式检索仍通过后才能记录`NATIVE CONTROLLED IMPORT AND LOCAL SEARCH PASS`。证据：[sidera-p2b-r2-controlled-import-local-search-2026-08-06.json](./evidence/sidera-p2b-r2-controlled-import-local-search-2026-08-06.json)。

## 2026-08-06 开发 012 / F1a 单篇文档身份与不可变获取基座

- 独立`Sidera/documents-v1.sqlite`保存论文文档快照、`AcquisitionRecord`与`DocumentVersion`；PDF按SHA-256写入不可变blob目录，相同内容去重，同一论文允许多个版本。文档库契约已升级至v2，明确区分出版社正式版、作者稿、扫描版、用户导入版和待确认版本，并对既有v1记录做非破坏迁移。
- 首期本地路线允许先选择PDF、再由用户明确关联目标论文，不依据文件名、目录或PDF正文推断身份，且本地获取记录不会继承机构SourceRecord。机构路线先由用户在论文详情中选择既有SourceRecord，Rust按不透明记录ID解析安全官方路线并在共享机构会话中打开；用户显式完成单篇PDF下载后，再按搜索候选ID、供应商记录ID、脱敏规范定位或唯一来源库精确匹配回该论文的SourceRecord。前端既不能传任意URL，也不能把“网页已打开”当作“全文已获得”。
- 原生论文详情可查看来源、版本、完整哈希、失败获取记录并打开原文件。来源解析或导航失败分别写入`source-route / source-navigation`阶段；机构下载凭证选择失败和SourceRecord匹配失败写入`download-selection / source-match`阶段。所有失败`AcquisitionRecord`均保存错误码和重试状态，重启后仍可诊断并由用户显式重试；失败不会生成`DocumentVersion`。自动状态为`IMPLEMENTED / AUTOMATED TECHNICAL PASS / PRODUCT UNVERIFIED`；完成门为`NATIVE SINGLE-DOCUMENT ACQUISITION PASS`。证据：[sidera-f1a-single-document-acquisition-2026-08-06.json](./evidence/sidera-f1a-single-document-acquisition-2026-08-06.json)。

原生桌面已完成低负载只读验收：入口、待办空态、历史筛选、既有失败/完成运行、专业页面建议入口及返回 Sidera 为 `PARTIAL PASS`；创建、审批、暂停、恢复、取消等有状态治理操作仍为 `UNVERIFIED`。

提交收口：M2.0b 与 R1–R4-R3 已收口到 `ede6e0b`；当前 M2.0c-L0至开发011-R1/P2b-R1仍为`dirty worktree`。用户明确要求本工作包不提交、不推送、不创建 PR、不发布。

## 2026-08-05 开发 011-R1 / P2b-R1 早期 v14 兼容识别与安全补全

- 开发011首次原生设置在严格验证阶段拒绝了开发过程中较早生成的v14论文库；这证明原自动技术证据没有覆盖真实早期v14接入。开发011的原生/产品结果据此更正为`PRODUCT FAIL / SUPERSEDED`，不得用旧自动PASS替代该事实。
- v14检查不再只依赖`user_version=14`，而是精确分类为`current-v14 / known-precontract-v14 / unknown-invalid-v14`。`known-precontract-v14`只接受开发011已知的早期契约签名，并继续验证治理表、唯一索引、旧外键与项目身份完整性；其他任何变形均归入`unknown-invalid-v14`。
- 只有`known-precontract-v14`可修复：先生成独立`.pre-v14-contract.<timestamp>.sqlite`备份，校验SHA-256与治理数据指纹，再以`BEGIN IMMEDIATE`事务补全结构；事务内重新执行外键检查、严格`current-v14`契约和数据指纹核对。任一步失败都回滚，现有论文与治理记录不得被覆盖。
- `current-v14`路径幂等，不生成兼容备份且不重复修复；`unknown-invalid-v14`直接拒绝，不备份、不猜测、不修改。设置页只允许“使用现有SQLite论文库”接入已知早期v14，并明确展示补全后的备份路径和SHA-256。
- 自动检查只使用临时合成SQLite夹具，不触碰用户当前选定论文库；Provider调用、机构外网请求和全文下载均为0。当前状态为`IMPLEMENTED / AUTOMATED TECHNICAL PASS / PRODUCT UNVERIFIED`，真实早期v14接入、重启幂等和未知结构拒绝仍为原生兼容`UNVERIFIED`。证据：[sidera-p2b-v14-compatibility-r1-2026-08-05.json](./evidence/sidera-p2b-v14-compatibility-r1-2026-08-05.json)。

## 2026-08-05 开发 011 / P2b 受控主库提交与来源治理

- 主论文库升级为schema v14，新增提交账本、提交项、`paper_source_records`与`paper_identity_aliases`；审查库升级为schema v3，保存预览、决定和可修复的批次状态投影。主库提交账本是提交/回滚事实的唯一权威，审查状态在重启后由其best-effort reconciliation。
- 预览绑定`previewId + previewHash + batchVersion + expectedRevision`。只有逐条决定完备、没有阻塞项且主库前提未变化的完整批次可以提交；执行在单一事务内完成全部insert、fill-empty-only merge、来源/身份写入、提交账本和revision更新，任一失败整批回滚。
- 合并绝不覆盖主库既有非空字段；来源记录与身份别名保留候选provenance和确定性身份依据。`clientCommitId`与账本保证重复提交幂等，进程异常后不自动重放写入。
- 已提交批次只在整批可证明安全时回滚；后续编辑、后续引用、身份冲突或revision前提变化会拒绝回滚，不提供force选项。拒绝回滚不改变主库或账本。
- P2b不自动生成热点、不下载或解析全文、不调用Provider。该工作包自动技术证据保留，但首次原生设置因早期v14契约不兼容而失败，产品结果现记为`PRODUCT FAIL / SUPERSEDED`；由开发011-R1修复后仍需原生复验。只有原生完整提交、重启对账、重复提交和安全回滚均通过才记录`NATIVE CONTROLLED IMPORT PASS`。历史证据：[sidera-p2b-controlled-import-2026-08-05.json](./evidence/sidera-p2b-controlled-import-2026-08-05.json)。

## 2026-08-05 开发 010 / P2a-R2 后台检索快照权威化与跨页连续性修复

- 进程级检索状态分为稳定`displayedSnapshot`、当前`activeAttempt`和独立`lastFailure`。开始新任务不再删除旧成功结果；失败或取消保留旧结果和选择，成功、部分成功或明确零结果才原子晋升。
- 旧学术DOM传输绑定`taskId + clientRequestId + epoch + sequence + webviewGeneration`；旧回调、迟到`EVAL_TIMEOUT`和旧WebView不得写回终态快照。学术兼容入口只投影新状态，馆藏目录继续使用既有事件流。
- 研究检索状态和监听上移到App根级，普通页面卸载、重挂与导航不得开始或取消任务。SSO/检索恢复成功后仅清除对应机构作用域的过期失败通知，不影响其他错误。
- 自动技术记录为`PASS`；原生仍需复验中文/英文快照跨页一致、进行中导航、失败/取消保留旧结果、SSO旧通知消失、审查批次重启恢复和主库/下载/Provider零非预期变化，故严格保持`NATIVE CONTINUITY UNVERIFIED`。
- 原生基线证据：[sidera-p2a-r2-native-continuity-2026-08-05.json](./evidence/sidera-p2a-r2-native-continuity-2026-08-05.json)。该文件不覆盖开发009自动技术证据。

## 2026-08-05 开发 009 / P2a-R1 武大后台检索连接器与原生审查闭环

- 新增`LiteratureConnector / ResearchSearchOrchestrator`和`whu-academic-discovery-v2`能力契约。状态从`checking-session`到`complete / partial / failed / cancelled`，单来源失败不清空其他来源，任务继续使用task/epoch/sequence隔离迟到结果；当前运行来源报告会如实标注`dom-fallback / experimental`及可选协议勘察候选。
- 正常蓝色“检索学术论文”只启动后台编排器，不打开侧边网页；认证失效时唯一可见网页是官方登录窗口，成功后恢复同一检索。用户只有显式“核对原始记录”才打开机构网页。
- 候选只包含期刊论文、会议论文和学位论文，保留带实际生产适配器版本的字段级provenance，并通过不透明定位打开题录/全文。供应商记录ID按来源数据库隔离。真实敏感定位仅在Rust内存使用；审查身份URL在持久化前移除ticket、token、session等认证参数。当前检索不读取Cookie，临时Cookie容器处于预留未启用状态。协议、Cookie和完整敏感URL不进入前端、日志或证据。
- “加入导入审查”校验searchId、generation、候选实际生产适配器版本和候选ID后写入`Sidera/import-review-v1.sqlite`；主`research-hotspots-v7.sqlite`保持只读，本包不下载全文、不调用Provider，也不新增Agent工具。
- 自动技术记录为`PASS`。用户已确认中文10条/2来源、英文9条/4来源、正常检索不打开网页和审查批次创建`PASS`；跨页面连续性及过期SSO失败提示为`FAIL`，故状态更正为`NATIVE PARTIAL PASS / CROSS-VIEW CONTINUITY FAIL`。自动证据仍为[sidera-p2a-r1-background-search-review-2026-08-05.json](./evidence/sidera-p2a-r1-background-search-review-2026-08-05.json)，原生事实另见开发010证据。

当前开发总账：[DEVELOPMENT.md](./DEVELOPMENT.md)

## 2026-08-05 开发 008 / P2a 题录审查与身份基座

- 六类文件解析已接入统一候选：CSV、JSON、JSONL、NDJSON、BibTeX与RIS；损坏数据、缺字段和身份不足不会被静默补写。
- 身份匹配顺序为 DOI、来源数据库＋供应商记录 ID、规范详情 URL、题名＋第一作者＋年份；候选分类为`new / merge / conflict / invalid`，决定包含确认新记录、确认合并、保留独立、跳过与待处理。
- 审查批次存入所选论文库旁的`Sidera/import-review-v1.sqlite`，主`research-hotspots-v7.sqlite`只读；P2a不执行正式入库，也不改变主库 Schema、revision或论文数。
- Rust core定向用例3/3、TypeScript、Vite、`cargo check -j 2`、P2a专项、文档审计与diff检查组成自动门；产品桌面验收仍为`UNVERIFIED`。证据：[sidera-p2a-import-review-2026-08-05.json](./evidence/sidera-p2a-import-review-2026-08-05.json)。

## 2026-08-05 开发 007 / P1c-R3 主窗口所有权修复

- 根因：Tauri主标签`main`是顶层`Window`而非`WebviewWindow`；旧窗口创建路径因此找不到主宿主，蓝色检索与网页popup出现`RESULT_WEBVIEW_CREATE_FAILED`或静默失败。
- 修复：统一`resolve_main_window_host`使用`app.get_window("main")`；Windows从真实窗口取得HWND并通过`owner_raw()`创建应用自有窗口，非Windows保持无owner降级。隐藏结果面、两类认证、共享浏览器普通/认证popup及主窗口恢复路径均复用该解析器。
- P1状态：机构访问、登录、数据库直达和逐级全文跳转保留为基础`PASS`；自动统一发现结构化适配器标记`DEFERRED / EXPERIMENTAL`，P1总状态为`PARTIAL / ADAPTER DEFERRED`。原生短验收仍为`UNVERIFIED`。证据：[sidera-p1c-r3-main-window-ownership-2026-08-05.json](./evidence/sidera-p1c-r3-main-window-ownership-2026-08-05.json)。

## 2026-08-05 开发 006 / P1c-R2 原生研究双栏与侧边机构浏览器收口

- 修复前实机事实：固定网页视口的滚动性能为`PASS`，但网页独占造成的产品构图与原生功能连续性为`FAIL`；该历史结论不由后续源码或自动构建覆盖。
- 当前实现：浏览器展示状态为`closed / split / immersive`；数据库、题录、全文与机构入口默认进入`split`，宽屏默认50/50且可拖动，偏好键为`research-agent:sidera-institution-browser-layout:v1`，沉浸网页只允许显式进入。
- 原生连续性：双栏左侧保留完整研究控制和结构化结果，右侧保留真实 WebView工具；来源切换、普通页面切换和返回机构资源不销毁标签、任务或快照。小于1180px时只切换可见面，不改变逻辑状态。
- 几何与性能：原生面最小420px、网页面最小640px，动态端点仍受30%–70%限制；分隔拖动由`requestAnimationFrame`合并，普通滚轮、左侧滚动和网页内部滚动均不发 bounds IPC，已有网页滚动实机`PASS`继续保留。
- 自动状态：TypeScript、Vite、机构浏览器 core、`cargo check -j 2`、P1c-R2专项、P1c-R1/P1c/P1b-R2/L1a-R4回归、文档审计和 diff 检查组成技术门，自动过程外网、Provider、论文库写入和下载均为0。
- 待验收：1360/1920双栏、1100单面切换、比例跨重启、沉浸往返、CNKI/WOS/额外供应商、跨页面恢复、认证 popup、下载暂存和共享 UDF仍为`NATIVE SPLIT WORKSPACE UNVERIFIED`。证据：[sidera-p1c-r2-native-split-browser-2026-08-05.json](./evidence/sidera-p1c-r2-native-split-browser-2026-08-05.json)。

## 2026-08-05 开发 005 / P1c-R1 真实弹窗语义与固定浏览器视口修复

- 根因复核：普通`on_new_window`确实只按 URL 分类，并以`queue_browser_tab(target) + Deny`重放目标，丢失 WindowProxy/opener/POST/window features；MetaERSP `/loading`因此成为幽灵标签。前端在 capture-scroll 上逐帧测量 host，Rust 每次遍历全部标签执行 position/size 并聚焦活动页，配合 workbench`overflow:auto`造成原生子 WebView异步追赶。
- popup 修复：普通 HTTP/HTTPS popup 统一进入共享 UDF 的应用自有`WebviewWindow`，使用`NewWindowResponse::Create + window_features(features)`保留真实请求语义；认证仍走真实应用模态。运行态绑定`popupId + openerTabId + generation`，React 只收到 origin/path、阶段、处置与安全错误码，不记录 query、fragment、ticket、Cookie、表单或正文。
- bridge 修复：`whu.metaersp.com/loading`标记为 transient bridge，不创建标签。opener 到达 CNKI/WOS或同一规范供应商目标时关闭 bridge；安全 GET 只有在显式证明后才能迁移，否则保留独立窗口。超时和失败分别为`SIDERA_INSTITUTION_POPUP_BRIDGE_TIMEOUT / SIDERA_INSTITUTION_POPUP_NAVIGATION_FAILED`，关闭/过期回调不能复活状态。
- 视口修复：浏览器显示时根 workbench 进入固定 focus mode，隐藏文献页标题、机构控制和原生结果，只保留 Sidera 标题栏、浏览器标签/导航、下载入口与“返回原生结果”；网页 host 填满余高，外层`overflow:hidden`。返回时恢复原滚动位置、检索快照与选中来源。
- 几何修复：删除 document capture-scroll 监听；ResizeObserver与窗口 resize只响应真实几何变化。前后端均以`<1px`为 no-op，Rust 只对活动标签调用一次`set_bounds(Rect)`，bounds、visibility、focus 分离，geometry 不聚焦。
- 自动状态：core popup/bridge/bounds 纯状态测试、TypeScript、Vite、P1c-R1专项、P1c/P1b-R2/L1a-R4回归、`cargo check -j 2`、文档审计与 diff 检查组成完成门；自动过程机构外网请求、Provider、论文库写入和下载均为 0。自动 PASS 只能生成候选，原生 popup 与性能仍为`UNVERIFIED`。
- 原生顺序：先验证 CNKI/WOS及另一供应商单一可用页面，再验证认证 popup 回父页；随后快速滚轮、3–5 标签、正常/最大化与100/125/150%缩放；最后验证下载和重启共享 UDF复用。完成前保持 P1`IN PROGRESS`。
- 证据：[sidera-p1c-r1-popup-focus-viewport-2026-08-05.json](./evidence/sidera-p1c-r1-popup-focus-viewport-2026-08-05.json)

## 2026-08-04 开发 004 / P1c 通用机构浏览器内核、应用内认证与下载基座

- 根因收敛：固定`institution-whu`表面、active-search 结果面和多个专用 popup 先后各自承担浏览、认证、检索与结果展示，导致“网页能打开”与“Sidera 状态可回写”反复分叉。P1c 把用户可见网页统一交给共享机构浏览器；原生自动检索继续由不可见、任务绑定的 WebView 执行，二者不再争夺同一表面。
- Rust 在主窗口内创建应用自有多标签子 WebView，提供地址栏、前进/后退、刷新/停止、新建/关闭/切换标签页和显式返回原生结果。普通 HTTP/HTTPS 链接与`window.open`进入应用内标签；只有需要真实 opener、POST 或弹窗语义的认证流程进入唯一应用模态`WebviewWindow`。
- 所有项目共享`institution-shared-v1`配置和`institution-webview-v1/whu` WebView2 UDF；标签页与认证模态显式使用同一数据目录。数据库 SSO、统一发现身份和个人图书馆仍是独立状态，版本化页面观察器确认成功后回写状态并关闭认证模态。
- 结果题录、全文路线和当前来源均通过 Rust 保存的不透明定位复制到共享浏览器；React 不创建 WebView，也不能提交任意下载文件路径。统一发现、数据库直达和馆藏目录的原生快照及 hidden task WebView 保持独立。
- 手工 PDF/附件下载进入`institution-downloads-v1/<download-id>/`，每项生成 manifest、文件大小、MIME、SHA-256和来源上下文。下载不会自动写论文库、解析全文或调用 Provider；敏感原始下载 URL只在本次运行内存中用于即时重试，重启后仅保留脱敏 provenance。
- 浏览器纯逻辑 5/5、TypeScript、Vite、`cargo check -j 2`、P1c 专项、既有机构回归、项目文档审计与`git diff --check`为自动技术门。自动过程不访问真实机构网络，不调用 Provider，不写论文库，也不触发下载。
- 最新可见原生 Tauri 基础烟测已通过：从“文献工作台 → 机构资源”打开共享机构浏览器后，可见标签栏、地址栏、导航控件、下载入口与`institution-shared-v1`标识，武大图书馆官网在同一 Sidera 窗口的原生子 WebView 内成功加载。
- 完整原生验收尚未执行：仍须验证任意地址输入、标签新建/切换/关闭、数据库与个人图书馆认证、普通链接与认证 popup 分流、统一发现/直达/馆藏、题录/全文、手工下载清单、跨页面隐藏及重启复用。完成前保持`NATIVE INSTITUTION BROWSER UNVERIFIED`与 P1`IN PROGRESS`。
- 证据：[sidera-p1c-institution-browser-kernel-2026-08-04.json](./evidence/sidera-p1c-institution-browser-kernel-2026-08-04.json)

## 2026-08-04 开发 003 / P1b-R2 统一发现认证回写与任务恢复闭环

- 原生失败事实：数据库 SSO、数据库直达与 CAS/MetaAuth 会话均可用；统一发现“统一登录”弹窗显示“已登录”，但关闭后父结果页和 Sidera 仍未登录。该结果准确记为`DISCOVERY AUTH CALLBACK/STATE SYNC FAIL`，不是账号密码失败。
- 状态模型新增独立`academicDiscoveryAuth`与`discoveryAuthWindowVisible`；`databaseAuth`、统一发现检索入口`sourceReadiness`、机构全文身份和`libraryAccountAuth`不再互相冒充。UI 明确显示检索入口可用、身份待确认、认证中、已就绪、取消、失败与恢复中。
- 结果页所有合法 HTTP/HTTPS popup 均进入固定单例应用自有认证窗口，使用`NewWindowResponse::Create + window_features(features)`继承 opener environment/UDF、POST 和`window.opener`；任务结束后的手工登录也不再交给无人管理的默认 Allow。
- 固定`whu-discovery-auth-v1` DOM 检查仅读取有上限页面文本和脱敏 origin/path，识别“已登录/机构访问已建立”而不依赖域名。成功或用户关闭前都会复查；确认后关闭窗口、刷新正确父结果 WebView并重新检查来源结构。
- active search 保存`taskId + epoch + sequence + webviewGeneration + query + result label + phase`，进入`awaiting-auth`后暂停普通 90 秒活动计时；认证回写后同一任务进入`resuming-after-auth`并继续分面与抽取。旧 popup、旧任务、旧 generation、迟到关闭/page-load/timeout 都不能覆盖当前任务或 ready 状态。
- 稳定错误码包括`SIDERA_INSTITUTION_DISCOVERY_AUTH_REQUIRED / CANCELLED / FAILED / RESUME_FAILED`；取消与失败保留重试当前检索入口，不清除 UDF，不把“重新登录”作为正常回写步骤。
- 当前自动结果：TypeScript、Vite 6.4.3（1918 modules）、Rust core 定向 21 项、`cargo check -j 2`、P1b-R2 12 项、P1b-R1 8 项、P1b/L1a-R4/L1a-R3-R1/L1a-R3/L0-R2 机构回归、项目文档审计、rustfmt modified files 和`git diff --check`均为`PASS`。自动过程机构外网、Provider、论文库写入和下载均为 0。
- 脱敏实现与验证证据：`docs/evidence/sidera-p1b-r2-discovery-auth-resume-2026-08-04.json`。
- 原生验收仍须用户在最新可见 Tauri 中完成“统一登录 → 弹窗已登录 → 自动/手动收口 → 主程序 ready → 同一任务结构化论文 → 重启复用”。完成前保持`NATIVE DISCOVERY AUTH UNVERIFIED`和 P1`IN PROGRESS`。
- 证据：[sidera-p1b-r2-discovery-auth-resume-2026-08-04.json](./evidence/sidera-p1b-r2-discovery-auth-resume-2026-08-04.json)

## 2026-08-04 开发 002 / P1b-R1 统一发现真实分面与原生快照闭环

- 根因已定位：active search 的`on_new_window`把官方`window.open`结果 URL 普通导航回`institution-whu`并`Deny`，丢失 opener/POST 语义；筛选和抽取继续在错误的主 WebView 执行。旧分面脚本又要求纯标签，无法匹配“文章 (154,863)”等带计数真实标签，导致筛选未确认后出现无效 0 条。
- 现在由应用自有结果 WebView 承接 active search 弹窗，继承同一 WebView2 environment/UDF，并绑定`taskId + epoch + sequence + webviewGeneration + label`。搜索替换、取消、关闭和迟到 page-load 回调均不能覆盖新任务；手工 popup 不参与原生快照。
- 分面脚本先移除中英文括号计数、空白和可访问性后缀，识别 hidden input、checked、aria checked/selected/pressed 以及 Material/Primo 类。每次点击后等待页面/分面签名变化；真实控件互斥时按文章、会议论文、学位论文执行三个受控子检索并合并。
- inspect、分页与 extract 只在任务绑定结果 WebView 运行；只接受期刊文章、会议论文和学位论文，按 DOI、供应商记录 ID、规范详情、题名＋第一作者＋年份去重。图书、电子书、期刊刊名、菜单、脚本和 unknown 均不进入快照；未确认筛选或没有显式零结果证据时明确失败，不再返回假 0 条。
- UI 区分“网页结果可用 / 分面处理中 / 正在抽取 / 原生结果完成 / 筛选未确认 / 适配器漂移”。抽取完成后默认隐藏官方网页并显示原生列表，只有“查看原始页面”才显式显示任务结果面；数据库直达与馆藏目录未重做。
- 自动证据：TypeScript/Vite 1918 modules `PASS`，Rust core 机构检索 19/19 `PASS`，`cargo check -j 2` `PASS`，P1b-R1 脱敏专项夹具 `PASS`且机构请求/Provider 调用均为 0。Windows Rust lib 测试 EXE 在进入测试前因`TaskDialogIndirect`返回`0xc0000139`，单独记为`ENVIRONMENT FAIL`，未重跑该宿主，也不把它记成产品代码或原生验收 PASS/FAIL。
- 原生结论：机构认证、数据库 SSO/直达和官网手工检索继续是`PASS`；这些是三条不同链。修复候选尚未完成最新桌面中英文查询、原生结构化列表、题录/全文、跨页面和重启复验，所以`NATIVE ACADEMIC DISCOVERY UNVERIFIED`，P1 不得标记 COMPLETE。
- 证据：[sidera-p1b-r1-native-snapshot-2026-08-04.json](./evidence/sidera-p1b-r1-native-snapshot-2026-08-04.json)

## 2026-08-04 前序 P1b 武大统一学术发现原生化与 P1 收口

- 机构工作台现在显式分为“统一学术发现 / 数据库直达 / 馆藏目录”。前两类搜索快照继续由 Rust 按来源隔离；数据库直达只登记 WOS 与武汉大学数据库导航的入口、资源类型和当前能力，不接受检索词，也不与论文或馆藏结果合并。
- `whu-academic-discovery-v1`在查询进入真实结果页后自动定位资源类型分面，并依次选择文章、会议论文、学位论文；只有三类均确认选中后才提取结果。无法找到或确认分面时明确失败，避免把客户端后过滤误报为网页自动限定。
- 原生论文字段保留题名、作者、年份、期刊/会议/授予单位、类型、DOI、供应商记录身份、来源数据库、摘要、全文状态与 provenance；Rust 去重优先级为 DOI、供应商记录 ID、规范详情、题名＋第一作者＋年份。
- 全文入口新增六类只读路线：`direct-html/pdf`、`doi`、`openurl/link-resolver`、`provider-record`、`publisher-page`、`browser-fallback`。前端只拿到不透明定位；浏览器回退显式交给系统浏览器，其余在当前机构会话内打开，本轮不下载。
- 该候选的静态实现和自动证据不能覆盖随后实机失败；active search 未到达真实分面/抽取链，故由 P1b-R1 取代。
- 历史`NATIVE CORE FLOW PASS`仅重命名并限定为`NATIVE CORE WEB FLOW PASS`：它只代表手工官网逐级访问，不代表原生结构化发现完成。
- 证据：[sidera-p1b-whu-native-academic-discovery-2026-08-04.json](./evidence/sidera-p1b-whu-native-academic-discovery-2026-08-04.json)

## 2026-08-04 M2.0c-L1a-R4 论文级统一发现与馆藏目录降级修复

- 用户原生复验确认 CAS/MetaAuth/MetaERS 认证链已经成功，但 `whu-catalog-multidb-v2` 实际只查询 OPAC 图书，并把同一书目容器中的数字链接、`doclist[...]`脚本片段和真实题名拆成多条重复结果。R3-R1 的产品结论因此更正为 `INSTITUTION AUTH PASS / CATALOG EXTRACTION FAIL / PRIMARY ROUTE MISALIGNED`。
- 机构资源页现分为独立的“学术论文”和“馆藏目录”两种来源，默认选择学术论文。数据库 SSO 只表示机构认证成功；`academic-discovery`与`catalog`各自维护来源就绪状态、内存快照、详情定位和全文定位，切换来源或普通页面不会清空已完成快照。
- OPAC 适配器升级为`whu-opac-catalog-v3`：按完整书目容器提取，先移除脚本、样式、隐藏节点，再按显式题名、有效书目链接和可读文本选取唯一题名；纯数字、`doclist`、`fmt_issn`、`dispfmt`、评级代码和导航文字均被拒绝。唯一记录上限作用于逻辑书目而非候选链接，结果明确标注为“图书与馆藏信息”，不进入论文导入。
- 新增`whu-academic-discovery-v1`。运行时优先消费 L0 探针解析出的当前统一发现目标；未解析时只在同一机构 WebView 中打开武大官网并严格激活“珞珈学术搜索/学术搜索”官方元素。入口不存在时返回`SIDERA_INSTITUTION_DISCOVERY_ROUTE_UNRESOLVED`，禁止回退 OPAC 冒充论文搜索。
- 论文结果只接受期刊论文、会议论文和学位论文；必须具备真实题名、受控详情定位，以及 DOI 或作者加期刊/年份等身份证据。快照增加期刊/会议/授予单位、卷期页码、来源数据库、全文状态及不透明全文定位；全文只允许在当前内嵌会话跳转，不下载、不入库、不调用 Provider。
- TypeScript、Vite 6.4.3（1918 modules）、Rust core 18/18、`cargo check -j 2`、R4 专项、L1a/L1a-R1/L1a-R2/L1a-R3/L1a-R3-R1/L0-R2 回归、项目文档审计和`git diff --check`均已通过；自动过程机构外网与 Provider 调用数为 0。
- 用户曾在原生桌面手工完成机构登录、官网检索和非图书资源逐级全文访问，限定记为`NATIVE CORE WEB FLOW PASS`。后续 active search 的原生结构化链实机失败，不能再用该手工链证明统一发现或全文编排完成。
- R4 原生学术发现结论更正为`NATIVE ACADEMIC DISCOVERY FAIL / SUPERSEDED BY P1b-R1`；馆藏清洗、中英双查询、至少两个真实来源、跨页连续和重启复用仍需逐项留下结果。
- 产品方向已明确：Sidera 不以嵌入数据库网页数量作为价值，而以“一次问题→统一发现→去重→受控导入→全文文档→页码证据→Agent 分析→成果沉淀”的原生闭环作为最终目标。下一阶段为 L1b 题录导入与论文身份设计，实际 Schema 写入仍需单独计划和确认。
- 证据：[sidera-m2.0c-l1a-r4-academic-discovery-2026-08-04.json](./evidence/sidera-m2.0c-l1a-r4-academic-discovery-2026-08-04.json)

## 2026-08-04 M2.0c-L1a-R3-R1 武大真实检索适配器与双会话闭环

- 用户原生确认数据库 SSO 已经通过 CAS、MetaAuth 并进入武大馆藏检索页面；同时发现旧 `whu-catalog-multidb-v1` 把“简单检索”等导航链接误识别为文献。认证主链因此保留，当前失败点收敛到真实查询提交与结果身份。
- 适配器升级为 `whu-catalog-multidb-v2`。入口只接受检索表单；提交前保存页面签名，提交后必须观察到新签名、匹配查询回显、来源桶、正式结果结构或显式零结果，否则返回 `SIDERA_INSTITUTION_QUERY_NOT_SUBMITTED`。
- 结果质量门只接受非导航标题与可验证馆藏详情定位；“简单检索、多字段检索、高级检索、多库检索、检索历史”等导航标题以及 `func=find-b` 等菜单定位均被拒绝。伪记录返回 `SIDERA_INSTITUTION_RESULT_FALSE_POSITIVE`，未知结构返回 `SIDERA_INSTITUTION_ADAPTER_DRIFT`，禁止伪造 0 条结果。
- 中文、西文等来源桶继续按每桶最多 20 条、总计最多 40 条顺序提取，单桶失败保留其他桶并标记 `partial`；结果按 DOI、规范详情地址、标题与年份去重，原始记录仍只接受当前快照的不透明结果 ID。
- 数据库认证和个人图书馆认证继续独立。个人图书馆从 URL 推断就绪改为版本化 DOM 检查；发现账号表单时仅标记 `login-required/BLOCKED`，不会冒充就绪，也不会阻断数据库检索闭环。
- TypeScript、Vite 6.4.3（1918 modules）、Rust core 14/14 与 `cargo check -j 2`已通过；专项、相关回归、文档审计和差异检查作为本工作包自动收口的一部分执行，自动阶段机构外网与 Provider 调用数均为 0。
- 电脑操控已打开唯一、最新的 `Sidera` 原生窗口并进入“文献工作台 → 机构资源”。数据库登录准确显示 `login-required`，内嵌页为武大统一身份认证账号密码表单；本次隔离 UDF 未直接恢复成已登录状态。自动化没有填写或提交凭据，因此中英文查询、详情、跨页和重启复用暂未开始。
- 当前严格记录为 `IN PROGRESS / AUTOMATED TECHNICAL PASS / NATIVE CLOSED-LOOP BLOCKED`。用户在当前 Sidera 内手动完成数据库认证后，继续“人工智能”和“machine learning”真实结构化文献、来源桶、原始记录、跨页连续与重启复用；数据库部分全部通过后才可记录 `NATIVE IN-APP SEARCH PASS`。个人图书馆若出现认证表单也必须单独记为 `BLOCKED`。
- 证据：[sidera-m2.0c-l1a-r3-r1-real-search-adapter-2026-08-04.json](./evidence/sidera-m2.0c-l1a-r3-r1-real-search-adapter-2026-08-04.json)

## 2026-08-03 Sidera 启动页与 Agent 对话动画稳定性修复

- 用户发现启动页延迟状态出现时品牌、题字和出处整体上移；同时 Agent 阅读框在收展、Windows 最大化/还原、贴靠和边缘拖动中会可见地逐帧换行、前移或后移。
- 启动页现将加载状态与失败操作放入出处下方的绝对反馈层；品牌组继续使用原文档流和初始居中位置。反馈只执行自身透明度与 3px 纵向位移动画，`aria-live`、失败操作、重试和静态背景入口保持不变。自动审计锁定反馈层脱离文档流；真实品牌坐标差 `<= 0.5 CSS px`仍需原生验收。
- Agent 继续保留`clamp(560px, 42vw, 760px)`阅读宽度。标题、历史正文、审批、输入和页脚在折叠期间保持挂载；收展与历史抽屉统一执行`visible → fading-out(140ms) → geometry(400ms) → settling(2 RAF) → fading-in(180ms) → visible`，并使用`transitionend`、`500ms`回退和 epoch 防止迟到回调提前显示文字。
- 标题栏按钮和双击已统一为受锁定的异步最大化处理；Agent 在最大化/还原前先淡出，窗口 resize 静默`120ms`、最多`900ms`并稳定两帧后恢复。普通 resize、系统贴靠和边缘拖动进入同一隐藏门；最小化不增加等待，reduced-motion 在尺寸稳定后的下一帧恢复。
- 用户随后原生复验发现折叠输入栏异常保持约 100px 高：旧自动增高逻辑会把空值占位文本的`scrollHeight`或上一次展开宽度的内联高度带入折叠态，而折叠、展开和窗口稳定后没有重新测量；按钮虽相对错误高行居中，但占位文字仍从顶部内边距绘制，形成明显错位。
- 输入栏现由纯高度解析器按真实草稿决定尺寸：空值和单行为`42px`，多行增长至`100px`，超出后只在文本框内部滚动。预绘制布局效应会在草稿变化、收展进入`settling`、最大化/还原和普通 resize 稳定后重新测量；阅读、审批和页脚壳保持挂载，但折叠时严格归零且不再贡献高度。折叠宽度继续保持`440px`上限。
- TypeScript、Vite 6.4.3（1918 modules）、桌面壳 15 项、Agent R3/R4/R4-R2/R4-R3、空间构图 R2、项目文档审计与`git diff --check`均为`PASS`；自动过程未运行 Rust、未调用 Provider、未修改数据库、论文库 revision 或机构会话。状态为`IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE MOTION UNVERIFIED`。
- 原生验收仍需使用既有本地长对话，在 1100/1360/1920px 与 100%/125%/150% 缩放下检查启动坐标、连续五次收展、历史抽屉、最大化/还原、贴靠、边缘拖动、快速重复、超时和 reduced-motion；验收前不得标记`NATIVE MOTION PASS`。

## 2026-08-03 M2.0c-L1a-R3 应用内机构认证与检索真实闭环

- 用户原生复验确认 L1a-R2 的主数据库 SSO 仍在 20 秒后进入 `SIDERA_INSTITUTION_NAVIGATION_TIMEOUT`；R2 只把灰屏变成显式超时，没有打通登录，产品结论更正为 `NATIVE IN-APP INSTITUTION AUTH FAIL / SUPERSEDED`。
- Rust core 将入口发现与 WebView2 会话导航分离。脱敏轨迹只保留主机、路径、阶段、重定向、安全错误状态、navigation ID、generation 和 epoch，最多 32 条且只在内存存在；query/fragment、ticket、Cookie 与凭据仍不会进入前端或日志。
- 主 WebView 接入 `NavigationStarting / NavigationCompleted`；失败读取 WebView2 安全错误状态，被策略拦截时立即清除首航等待。20 秒计时器只处理没有任何终态的停滞，旧 generation、旧 epoch 与旧 DOM 回调不能覆盖重试。
- MetaERS/OPAC 主机不再直接推断 `ready`。`whu.metaersp.com/personalIndex`只表示数据库 SSO 已完成，运行时会在同一 WebView/UDF 内幂等进入`WHU_CATALOG_ENTRY_URL`；随后才通过版本化 DOM 检查确认检索表单、来源桶或结果。未知结构返回 `SIDERA_INSTITUTION_ADAPTER_DRIFT`，不得显示为 0 条结果。
- 两轮真实轨迹均为 `starting www.metaauth.com/242010/login.html → blocked [rejected] → redirect [rejected]`，第二轮明确返回 `POLICY_UNREGISTERED_TARGET`。这证明当前程序已经是最新诊断候选，同时也证明精确主机、路径、端口和 HTTPS-only 策略本身就是登录失败源。按用户明确决定，会话策略现改为登录优先：所有 HTTP/HTTPS 主机、端口、路径、重定向、userinfo 与不透明认证参数均由 WebView2 原样继续；数据库弹窗使用 `NewWindowResponse::Allow` 保留真实 POST/opener 语义，个人图书馆及嵌套网络弹窗不再按域名拒绝。机构 WebView 的自动填充/密码保存禁用和下载拒绝钩子也已移除。
- 第三轮真实轨迹已完整经过`cas.whu.edu.cn/authserver/login → uas.metaauth.com/casservice/... → www.metaauth.com/auth/... → whu.metaersp.com/personalIndex`，证明 CAS/MetaAuth/数据库 SSO 已打通；本轮失败点已从认证更正为“认证落地页缺少到馆藏检索页的自动交接”。候选现已补上同会话交接，仍需原生确认 OPAC DOM、检索与重启复用。
- TypeScript、Vite 6.4.3（1918 modules）、Rust core 12/12 与 `cargo check -j 2`已通过；R3 专项、相关回归、文档审计和差异检查在本工作包自动验证中收口。自动过程机构外网与 Provider 调用数均为 0。
- 当前状态严格保持 `IN PROGRESS / AUTOMATED TECHNICAL PASS / NATIVE CLOSED-LOOP UNVERIFIED`。必须在最新原生桌面完成数据库 SSO、个人图书馆模态、中英文检索、原始记录、跨页连续性和重启复用后，才允许记录完成并进入 L1b。
- 证据：[sidera-m2.0c-l1a-r3-native-closed-loop-candidate-2026-08-03.json](./evidence/sidera-m2.0c-l1a-r3-native-closed-loop-candidate-2026-08-03.json)

## 2026-08-03 M2.0c-L1a-R2 真实认证弹窗与首航恢复修复（原生 FAIL / SUPERSEDED）

- 用户原生复验确认 L1a-R1 仍为灰屏：旧修复把 `window.open` 捕获到的 `outer-proxy-detail-url` 当作普通 GET 在主 WebView 重放，丢失原弹窗的 POST、`opener` 和认证上下文。L1a-R1 因此更正为 `NATIVE IN-APP INSTITUTION AUTH FAIL / SUPERSEDED`。
- `institution-whu` 现在先以隐藏的 `about:blank` 创建，完成 UDF、安全导航、密码保存禁用和 WebView2 `NavigationCompleted.IsSuccess` 监听后，才显式进入正式 MetaAuth 路由；SSO 未解析时明确失败，不回退图书馆首页。
- 首航使用 20 秒期限、`navigationEpoch + webviewGeneration` 隔离和显式重试。失败或超时保持原生表面隐藏；重试重建子 WebView但复用同一 UDF，旧导航完成事件不能覆盖新状态。
- 数据库 SSO 在主内嵌区域完成；个人图书馆的合法 `window.open` 由共享 WebView2 environment 的 `institution-whu-auth` 模态窗口通过 `NewWindowResponse::Create` 承接，保留真实表单、POST 和 opener 语义。模态关闭、取消、创建/导航失败都会恢复主窗口。
- 会话状态拆为 `databaseAuth` 与 `libraryAccountAuth`；只有前者为 `ready` 才能启动多库检索。设置页分别展示两种认证，入口探针仍不读取 Cookie 或判断登录。
- TypeScript、Vite 6.4.3（1918 modules）、Rust core 8/8、`cargo check -j 2`、L1a-R2/L1a-R1/L1a/L0-R2/R4-R3/R4-R2、项目文档审计与 `git diff --check`均为`PASS`。自动过程机构外网与 Provider 调用数为 0。
- 证据：[sidera-m2.0c-l1a-r2-real-auth-popup-first-navigation-2026-08-03.json](./evidence/sidera-m2.0c-l1a-r2-real-auth-popup-first-navigation-2026-08-03.json)
- 用户随后在最新原生桌面复验得到 `SIDERA_INSTITUTION_NAVIGATION_TIMEOUT`；数据库 SSO 未达到 `ready`，因此 R2 产品结论更正为 `NATIVE IN-APP INSTITUTION AUTH FAIL / SUPERSEDED`，由 L1a-R3 继续闭环。

## 2026-08-03 M2.0c-L1a-R1 应用内认证跳转与机构状态修复（原生 FAIL / SUPERSEDED）

- 用户原生验收确认，武大官方登录通过 `window.open` 请求 `https://www.lib.whu.edu.cn/engine2/general-rest/outer-proxy-detail-url`，旧 L1a 的 `on_new_window` 无条件登记回退并返回 `Deny`，因此应用内登录被错误拦截；原 L1a 产品结论更正为 `NATIVE IN-APP SEARCH FAIL / SUPERSEDED`。
- core 新增纯弹窗 URL 决策器并复用现有机构白名单，但合法官方目标被错误地在同一个 `institution-whu` WebView 中以普通 `navigate()` 重放；该实现没有保留真实认证弹窗上下文。
- 认证重定向和导航失败分别使用 `SIDERA_INSTITUTION_AUTH_REDIRECTING` 与 `SIDERA_INSTITUTION_AUTH_NAVIGATION_FAILED`。合法页面加载后清理旧回退横幅；未初始化/失败态可重新解析正式入口，正在登录或已经就绪的页面不会被 `session_ensure` 强制重载。
- 检索只允许在会话严格为 `ready` 时启动。登录中、失效或异常状态返回内嵌登录表面，不创建后台检索，也不把失败伪装成“0 条结果”；单桶 `partial` 归属于检索快照，不再污染登录状态。
- 设置页明确“重新检测”是无 Cookie 的 aTrust 与公开入口诊断，不会判断或改变登录；系统浏览器按钮改为备用入口，新增独立“应用内机构会话”状态和“前往机构资源”按钮。
- TypeScript、Vite、Rust core 7/7 与静态审计曾通过，但原生灰屏证明该审计没有覆盖 POST/opener 语义；产品结论更正为 `NATIVE IN-APP INSTITUTION AUTH FAIL / SUPERSEDED`，由 L1a-R2 取代。
- 证据：[sidera-m2.0c-l1a-r1-in-app-auth-navigation-2026-08-03.json](./evidence/sidera-m2.0c-l1a-r1-in-app-auth-navigation-2026-08-03.json)

## 2026-08-03 M2.0c-L1a 应用内机构会话与武大多库检索预览（原生 FAIL）

- “文献工作台”新增“机构资源”页签。Rust 在主窗口中持有固定标签 `institution-whu` 的子 WebView，使用独立 `institution-webview-v1/whu/` WebView2 数据目录；官方页面负责登录，Sidera 不读取 Cookie、表单、账号或密码。
- 子 WebView 关闭通用自动填充、密码保存、下载、新窗口与开发工具；导航只允许固定机构主机，未知页面使用不透明回退 ID 由用户显式打开系统浏览器。远程页面不绑定 Tauri capability，也不能创建任意 WebView、提交任意 URL 或脚本。
- `whu-catalog-multidb-v1` 以任务 ID、epoch 和 sequence 隔离检索；固定脚本识别登录、服务异常、来源桶和首屏记录。查询上限 200 字符、总时限 90 秒、载荷上限 256 KiB，每桶最多 20 条、总计最多 40 条。
- 结果按 DOI、规范 URL、标题＋年份去重，缺失字段保持为空并保留 provenance；单桶失败可返回 `partial`。登录失效、结构漂移、服务异常和取消不会被表述为零结果，迟到回调不能覆盖新任务。
- React 使用 `ResizeObserver` 同步原生子表面边界，并在全局导航、弹层、非机构页签和返回原生结果前隐藏它。机构检索可跨文献库、星图、设置和 Agent 页面继续，标题栏提供返回结果与独立停止入口。
- 搜索快照只保存在 Rust 运行内存，重启后清空；L1a 不写 `papers`、不改变库 revision、不下载全文、不调用 Provider。TypeScript、Vite 6.4.3（1917 modules）、Rust core 6/6、`cargo check -j 2`及 L1a 专项已通过。
- 用户随后原生确认官方认证弹窗被旧 `on_new_window` 无条件拒绝，应用内登录无法完成；本包产品结果为 `NATIVE IN-APP SEARCH FAIL / SUPERSEDED`，由 L1a-R1 修复。
- 证据：[sidera-m2.0c-l1a-in-app-institution-search-2026-08-03.json](./evidence/sidera-m2.0c-l1a-in-app-institution-search-2026-08-03.json)

## 2026-08-03 M2.0c-L0-R2 武大动态 SSO 配置解析修复

- 原生复验显示 aTrust 与官网正常，但数据库行仍为通用 `browser-required`，且按钮回退“从图书馆进入数据库”；L0-R1 据此记录为 `NATIVE ACCESS PROBE FAIL / SUPERSEDED`。
- 实时只读诊断确认官网原始 HTML 约 2.4 KiB，仅加载同域 `/whuWebsite.js`，不含数据库导航锚点；正式 MetaAuth `personalIndex` 位于该公开脚本的 `jumpDatabases` 配置中。
- core 新增同域脚本发现、精确路径/版本参数/Content-Type 校验和函数体静态字符串解析。脚本不执行，合法候选必须唯一，带嵌套参数的 `databaseDetail`继续拒绝。
- 首页与 MetaERS 诊断仍最多两项并发；脚本只在锚点缺失后顺序读取，限制 8 秒、5 次严格重定向和 256 KiB。Rust 不请求超星、MetaAuth 或 SSO 目标，不传递用户名。
- Rust core 15/15、TypeScript、Vite 6.4.3（1917 modules）、`cargo check -j 2`、L0-R2/L0-R1/L0 与 R4-R3/R4-R2 回归均为 `PASS`；自动测试外网与 Provider 调用数为 0。
- 用户随后完成原生验收：数据库导航先经正式 MetaAuth 路由进入馆藏多库检索，“人工智能”和“machine learning”均可正常查询。L0-R2 记录为 `NATIVE ACCESS PROBE PASS`，但不宣称全馆接入、题录导入或全文能力完成。
- 证据：[sidera-m2.0c-l0-r2-whu-dynamic-sso-config-2026-08-03.json](./evidence/sidera-m2.0c-l0-r2-whu-dynamic-sso-config-2026-08-03.json)

## 2026-08-03 M2.0c-L0-R1 武大正式 SSO 路由与机构状态判定修复

- 首轮原生探测确认 aTrust 客户端和武大图书馆官网登录有效，但旧按钮直达 `whu.metaersp.cn/databaseList` 后仍显示登录、暂无数据和服务异常；原 L0 据此记录为 `NATIVE ACCESS PROBE FAIL`，失败不归因于用户未登录。
- Rust core 改为锚点级解析，数据库导航文字必须与同一锚点中的 MetaAuth URL 配对；租户固定为 `242010`，只允许一个 `service` 参数，并限制到武大 MetaERS 的 `personalIndex/databaseList`。
- 新增内存态 `navigationTargets`。完整 SSO URL 仅用于系统浏览器打开，技术详情只显示去查询参数地址；MetaAuth 不进入 Rust 后台请求白名单，也不保存 Cookie、票据或账号信息。
- 设置页删除 MetaERS 直达用户入口；解析到正式 SSO 时显示“已解析正式 SSO，需浏览器确认”，未解析时打开图书馆主页并提示从“常用数据库”进入。
- Rust core 11/11、TypeScript、Vite、`cargo check -j 2`与 L0-R1 专项为 `PASS`，但夹具错误假设官网会直接返回带 SSO `href` 的锚点；原生检测未解析到导航目标，因此产品结果为 `NATIVE ACCESS PROBE FAIL / SUPERSEDED`，由 L0-R2 修复。
- 证据：[sidera-m2.0c-l0-r1-whu-sso-route-2026-08-03.json](./evidence/sidera-m2.0c-l0-r1-whu-sso-route-2026-08-03.json)

## 2026-08-03 M2.0c-L0 武大 aTrust 与全馆发现接入探针

- 设置页新增可长期保留的“武汉大学机构资源”卡片，按 aTrust 客户端、图书馆官网、数据库导航、全馆统一发现四项独立显示；结果只保留于当前运行内存，提供系统浏览器打开官网和导航入口。
- Rust core 新增 `whu`固定机构配置与纯状态解析器。Windows 端只用 ToolHelp 读取 `aTrustTray.exe`进程名，并检查两个已登记 Program Files 路径；不会启动 aTrust、读取窗口、账号或配置，运行态也不会被表述为数据库已登录。
- 独立 HTTPS 探针只接收 `institutionId`，URL 由 Rust 固定。请求限于三个武大登记域名、最多 2 个并发、8 秒单项超时、5 次同白名单重定向和 256 KiB 响应；不携带 Cookie/Token，不保存正文或敏感请求头。
- 入口结果区分 `native-direct / browser-required / unresolved / failed`。统一发现从当前官网或数据库导航响应动态解析；外部发现域名只报告为浏览器路径，不由后台继续请求，也不写死历史 Find+ 地址。
- 公开结构化响应会在内存中提取数据库名称、类别、去查询参数入口和有限样例，形成统一发现、题录导出、在线跳转、全文解析入口和专用适配器能力矩阵；没有稳定结构化接口时明确降级为可见浏览器路线。
- Rust core 固定夹具 8/8、TypeScript、Vite 6.4.3（1917 modules）、`cargo check -j 2`和 L0 专项审计为 `PASS`；自动测试外网请求数和 Provider 调用数均为 0。原生探测随后确认图书馆登录通过、错误直达数据库导航失败，L0 产品结果更正为 `NATIVE ACCESS PROBE FAIL`，由 L0-R1 修复。
- 证据：[sidera-m2.0c-l0-whu-institution-probe-2026-08-03.json](./evidence/sidera-m2.0c-l0-whu-institution-probe-2026-08-03.json)

## 2026-08-03 M2.0b-R4-R3 Agent 长缓存默认与真实首段流式修复

- Agent 设置新增缓存策略 v2 标记；新项目、缺失字段和旧备份默认使用 `long`。启动迁移会遍历所有项目，把未带 v2 标记的 `auto`、`long`或缺失值原地升级为 `long`并补标记；迁移后用户显式选择 `auto`可持续保存，不会再次被强制改写。
- 设置项现为“长缓存（默认，推荐）”与“兼容模式（上游不支持长缓存时使用）”。明确的长缓存参数拒绝会映射为持久 `SIDERA_PI_LONG_CACHE_UNSUPPORTED`错误，提示用户手动切换兼容模式，本轮不会静默降级或自动重放。
- Rust 运行时已删除 512 字节首段缓冲，并提取 Tauri-free 纯流式门状态机。普通文本从首个 `text_delta`立即发送；工具开始进入隐藏态并通过带 session/message/revision/sequence 的 `assistant-replace`清除未核验前言；系统工具结束后与 RAG `finalize`后分别按原协议释放最终正文。
- 用户停止普通回答时保留已显示部分；隐藏工具旁白不会在停止或结算时整块补出；证据核验失败使用替换事件显示固定失败说明。`toolcall_start`只参与显示状态，现有 `tool_execution_start`白名单和审批绑定未改变。
- TypeScript、Vite 6.4.3（1916 modules）、`cargo check -j 2`、会话与流式 harness 8/8、Windows 生成物禁用字符串扫描、R4-R3 至 R1/双背景回归和 Pi 无 Provider RPC 均为 `PASS`；Provider调用数为 0。真实缓存用量、首字流式与原生体验保持 `UNVERIFIED`。
- 证据：[sidera-m2.0b-r4-r3-cache-default-true-streaming-2026-08-03.json](./evidence/sidera-m2.0b-r4-r3-cache-default-true-streaming-2026-08-03.json)

## 2026-08-02 M2.0b-R4-R2 Agent 后台连续性与清透光学玻璃修复

- 根级控制器已移除“离开 Agent 页面即 abort 当前轮次”的策略。普通导航只改变可见页面，Pi 流、500ms 检查点、SQLite 轮次和工具等待状态继续；停止按钮、项目/配置/会话变更仍走明确停止或确认。
- Agent 以外页面通过现有标题栏宿主显示 `正在回答 / 等待工具审批 / 已完成 / 失败`状态。运行态可返回 Agent并单独停止；审批只能返回原审批卡处理；后台完成 3 秒消失，后台错误复用持久全局错误提示。
- 对话材质已从约 54% 外壳、28px 模糊和逐回答烟熏卡片改为 34% 清透外壳、18px 模糊、115%饱和度与单一连续烟熏阅读层。左上大片径向灰光和助手嵌套矩形被移除；历史抽屉、折叠输入与标题栏状态共享光学变量。
- 主 Rust lib 保持 `test=false`，项目脚本只调用无 Tauri 依赖的会话 harness；旧 `target`测试 EXE 按边界保留但不再属于标准入口。harness 4/4 通过，生成物禁用字符串匹配数为 0。
- TypeScript、Vite 6.4.3（1915 modules）、`cargo check -j 2`、R4-R2/R4/R3专项和会话 harness 为 `PASS`；未调用 Provider。普通导航后台连续性、审批返回、标题栏多工具并存和 1100/1360/1920px 多缩放视觉仍待原生验收。
- 证据：[sidera-m2.0b-r4-r2-background-continuity-optical-glass-2026-08-02.json](./evidence/sidera-m2.0b-r4-r2-background-continuity-optical-glass-2026-08-02.json)

## 2026-08-02 M2.0b-R4-R1 Agent 会话存储与诊断修复

- R4 原生程序实际暴露两项产品失败：会话 Schema 的 Rust `\`跨行字符串吞掉词间空格，导致残缺 `user_version=0`数据库只有 `conversations`表且 Agent 无法创建会话；同时 Tauri 测试 EXE 缺少 Common Controls v6 清单，加载 `TaskDialogIndirect`时直接报入口错误。因此原 R4 原生结论更正为 `PRODUCT FAIL / SUPERSEDED BY R4-R1`。
- 会话 v1 Schema 已移入保留换行的独立 SQL 文件；所有查询、更新和 UPSERT 均改为不会吞空格的原始多行字符串。`open_store()`先设置 WAL/外键，再在事务内建表、验证列/索引/级联外键并写入 `user_version=1`。
- 对现有 `user_version=0`且只有兼容 `conversations`表的残缺库执行幂等原地补全，已有行保持不变；发现列定义或版本不兼容时返回 `SIDERA_CONVERSATION_SCHEMA_INCOMPATIBLE`，不会删除或重建数据库。
- 设置页“测试连接”已升级为“检测 Agent”，分别呈现 Provider、会话存储和 Pi 运行时；只有三项通过才显示“Agent 可以对话”。对话表面只显示安全错误码和简短说明，原始技术详情放在可展开区域。
- 会话存储使用不链接 Tauri/rfd 的独立 Rust 测试框架；4 组定向用例真实运行并通过，生成的测试 EXE 中 `TaskDialogIndirect / comctl32 / tauri-plugin-dialog / rfd`匹配数为 0。Tauri 主程序仍按默认 `desktop-dialog`特性加载原生对话框插件。
- TypeScript、Vite、`cargo check -j 2`、R4-R1 专项、R4/R3/R2/R1、双背景、科研星图与 Pi 无 Provider RPC 回归为 `PASS`；未调用付费 Provider。最新可见 Tauri 已将原残缺库在原路径修复为 v1，保留原 1 条会话，并确认“检测 Agent”入口和无 Windows 弹窗，记录为 `NATIVE PARTIAL PASS`；三项检测结果、第一条真实消息和重启历史 CRUD 仍为 `UNVERIFIED`。
- 证据：[sidera-m2.0b-r4-r1-conversation-store-readiness-2026-08-02.json](./evidence/sidera-m2.0b-r4-r1-conversation-store-readiness-2026-08-02.json)

## 2026-08-02 M2.0b-R4 Agent 会话、工具能力与 Liquid Glass 收口

- 会话事实已从内存升级为所选论文库下的 `Sidera/conversations-v1.sqlite`，完整保存会话元数据和 UI 轮次；Pi 使用 `Sidera/pi-sessions/project-<hash>/`原生 JSONL，启动参数改为 `--session-dir + --session-id`，不再使用 `--no-session`。最近活动会话按项目恢复，异常退出的流式轮次标记为“已中断”，不会自动重放付费请求。
- 新对话、历史搜索、活动/归档切换、重命名、归档、恢复和归档区二次确认永久删除已经接入 Tauri 窄命令。生成中切换、新建或归档当前会话必须先确认、发出停止并等待终止事件；Pi 上下文损坏或缺失时保留 SQLite 阅读历史，但禁止在旧会话继续提问。
- 历史抽屉位于对话框左侧，宽度 `clamp(272px, 20vw, 320px)`、间距 16px；宽屏按“抽屉＋间距＋对话框”整体居中，对话框连续右移半个新增宽度，低于 960px 改为覆盖层。打开历史会释放聚焦，空间 Explore/聚焦会关闭历史。
- Pi 内置工具继续关闭。会话扩展新增目录浏览、文件读取/搜索、HTTPS GET、文件写入/编辑/删除和 PowerShell；只读工具直接执行，写入、编辑、删除与任意 PowerShell 都通过 Rust 一次性审批卡。审批绑定当前 session/message/tool/toolCallId/参数哈希；子进程环境先清空再只恢复必要系统项，输出限量、最长 120 秒，用户中止轮次会传播到正在执行的已审批 Shell；HTTPS 重定向降级为非 HTTPS 时拒绝，敏感字段统一脱敏。
- 设置新增 `auto / long`缓存策略；`auto`不写长缓存环境变量，`long`只在新建或重新打开会话时设置 `PI_CACHE_RETENTION=long`。会话统计展示输入、输出、cacheRead、cacheWrite、成本和上下文占用；零缓存只显示“未检测到缓存用量”。
- 完整对话工作区、历史抽屉、按钮、输入区和审批卡已统一为静态深色 Liquid Glass：约 28px 模糊、半透明材质、顶/左镜面高光、细边和柔和阴影；助手正文使用更稳定的烟熏玻璃。没有增加 WebGL、动态噪声或逐帧滤镜，并提供 reduced motion、降低透明度、高对比度、forced colors 和不支持 backdrop-filter 的纯色退路。
- TypeScript、Vite、`cargo check -j 2`、R4 专项、R3/R1/R2 与 Pi 基础 RPC 回归为 `PASS`；Rust 会话测试目标完成编译，但本机测试可执行文件仍在进入测试框架前挂起并超时，与 R1 已记录环境阻塞一致，因此记录为 `BLOCKED`，不覆盖 Rust 编译和源码/协议专项 `PASS`。没有调用付费 Provider。
- 原生桌面随后确认会话 Schema SQL 拼接失败，Agent 无法创建新会话；Rust 测试 EXE 还出现 `TaskDialogIndirect`入口错误。本工作包产品结论因此更正为 `PRODUCT FAIL / SUPERSEDED BY M2.0b-R4-R1`；其余原生会话、工具、缓存和 Liquid Glass 验收仍未完成。证据：[sidera-m2.0b-r4-agent-conversations-tools-liquid-glass-2026-08-02.json](./evidence/sidera-m2.0b-r4-agent-conversations-tools-liquid-glass-2026-08-02.json)

## 2026-08-02 M2.0b-R3 对话体验收口

- Agent 无对话时默认只显示底部输入条；首次有效提交在调用 Provider 前立即恢复固定阅读面板，因此后续失败也会留在大面板中展示。已有对话手动收起后，下一次有效提交同样自动展开。
- 对话只保留现有阅读尺寸：宽度 `clamp(560px, 42vw, 760px)`、历史区最大 `min(56vh, 580px)`。紧凑/阅读切换按钮、自由缩放手柄、`SideraDialogLayoutPreference`及旧布局偏好读写已经删除；旧 `research-agent:sidera-dialog-layout:v1`数据保留但不再读取。
- 用户消息已去除渐变背景、右边框、阴影与气泡底色，只保留右对齐文字、用户标签和轮次间距。
- textarea 改为单行 42px 基线、20px 行高、11px 上下内边距，并按真实 `scrollHeight`向上增长至 100px；超过上限后内部滚动，发送清空后恢复 42px。折叠与理论 Explore 输入均使用底部锚点，30px 眼睛/发送按钮继续垂直居中。
- 全局提示现为带唯一 ID 的 `success / info / error`消息对象。成功和普通信息 3 秒自动关闭；错误保持到点击/键盘关闭或被新提示替换。计时器按消息 ID 校验并在替换时清理，旧计时器不会误删新提示；设置保存成功明确使用 `success`，异常通知使用 `error`。
- TypeScript、Vite、R3 对话专项、R1 会话证据回归、R2 空间构图、Agent 双背景、科研星图 R3、热点过渡、项目文档审计和差异检查均为 `PASS`；原生桌面和用户视觉尚未执行，产品状态保持 `UNVERIFIED`。
- 本工作包不实现新对话、历史持久化、联网或缓存架构，也未调用付费 Provider。当前继续保留全部脏工作树和未跟踪证据，不提交、不推送、不创建 PR、不发布。证据：[sidera-m2.0b-r3-conversation-experience-2026-08-02.json](./evidence/sidera-m2.0b-r3-conversation-experience-2026-08-02.json)

## 2026-08-02 M2.0b-R2 对话控件与空间构图连续性

- 输入区已经统一为 42px 基准控制高度，左右 30px 操作按钮与文本区共享垂直中心；当时的阅读、紧凑、自定义、折叠和 Explore 不再使用独立底部偏移规则。紧凑/自定义布局随后由 R3 删除。
- Agent 显式聚焦不再使用固定 `22% / 78%` 或理论近景 `±0.56` 锚点。`ResizeObserver` 从真实对话框、证据卡、标题栏和视口边界生成 `SideraFocusComposition`，并由沉浸相机、理论论文近景与 CSS 光学强调共同消费。
- 科研星图右侧轨道继续按热点、论文摘要、论文阅读使用三档实际宽度，但展示星图的空闲投影偏移固定为 `0`；轨道作为覆盖层，不再推动星系几何中心离开物理画布中心。
- 论文摘要和阅读锚点分别按对应轨道宽度与 24px 间隔计算，并由论文 Journey 连续驱动相机和目标论文。研究星图路径继续取消独立 acquisition；返回时轨道可保留热点详情，但系统姿态恢复到物理画布中心，不触发额外 fit/reset。
- 用户实机反馈科研星图无法点击热点、无法进入且右侧轨道不打开。根因是 Canvas 运行时被 Fast Refresh 或场景替换重建后已回到 `overview`，外层 React 仍保留 `system`，导致模式按钮禁用且 `exit-system` 被内部概览守卫忽略。Canvas 现在会在每次运行时重建时立即发布真实的 `overview` 状态。
- 用户随后实机确认论文靠近仍会先横移，返回末端会突然居中。根因是起始锚点由带右栏 `setViewOffset` 的真实相机投影取得，但 Journey 四元数求解使用不含该偏移的规范投影，导致右栏位移被同时写入相机姿态与渲染投影；返回结束再由 Journey 切回 Orbit 时暴露姿态跳变。
- Canvas 现在使用 Journey 规范投影记录论文起始锚点，并按实际 `viewOffset` 修正锚点诊断；新增运行级回归确认 1920px 论文摘要轨道夹具从旧约 `11.80°` 首帧/返回角误差收敛为位置 `0`、角度 `0°`。修复已实现，等待用户在当前 Tauri 完成论文飞近/返回复验。
- 用户继续指出返回后展示星图的视觉中心不再是星系中心。根因是旧修复把连续返回终点稳定在热点轨道的“剩余区域中心”；现在科研展示模式会清除全场景 `viewOffset`，只把论文目标移动到轨道左侧安全锚点。
- 用户进一步澄清真正未修复的是旋转枢轴：展示星图拖拽时围绕某个热点或其他点旋转，而不是围绕可见圆圈中心。根因是系统态 `orbit.center=hotspot` 被持续发布到外层相机姿态，Fast Refresh/场景重建又把该瞬态中心写回 `cameraPreset.center`；上一轮只修复投影主点，没有修复 Orbit 枢轴。
- 概览姿态解析现在始终输出场景规范中心；只有保存中心与前一概览规范中心一致时才继承距离/角度，否则恢复整组默认概览姿态。姿态发布函数本身增加 `overview + paper idle` 守卫，连 effect 清理也不能再保存热点中心。展示星图规范枢轴为 `[0, 0, -0.1]`。
- TypeScript、覆盖 1100/1360/1440/1920px 的 R2 构图专项、科研星图 R3 和热点过渡回归为 `PASS`；空闲星系中心误差不超过 1px，Journey 起点/返回位置误差为 `0`，摘要↔阅读交互后的返回角度误差小于 `0.00001°`。按钮像素对齐、修复后的五轮论文往返和多缩放视觉验收仍为 `UNVERIFIED`。
- 新增旋转枢轴运行夹具为 `PASS`：热点瞬态中心 `[2.4, -1.2, 0.5]`被拒绝，0°/90°/180°/270°/360°旋转均围绕规范圆心，最大圆心投影误差约 `4.79e-16`。真实 Tauri 拖拽视觉仍为 `UNVERIFIED`。
- 当前继续保留 `dirty worktree`，不提交、不推送、不创建 PR、不发布。证据：[sidera-m2.0b-r2-spatial-composition-2026-08-02.json](./evidence/sidera-m2.0b-r2-spatial-composition-2026-08-02.json)

## 2026-08-02 M2.0b-R1 对话编排、阅读面板与证据闭环（自动技术闭环）

- 真实桌面对话确认 M2.0b 的检索与多轮上下文有效，但产品验收失败：用户问题与回答分组错位、Markdown 原文裸露、阅读面板偏小、库总量无法可靠回答，并且读取证据后仍可能绕过结构化引用收口。
- R1 将根级状态改为逐轮交错的 `SideraConversationTurn`，增加安全 GFM Markdown、阅读面板和只读 `sidera_get_library_overview`；R1 当时加入的紧凑/自定义布局已由 R3 的单一固定阅读面板取代。
- 证据回合增加不可绕过的完成门：检索过程旁白不进入正文；读取成功后必须完成结构化引用，否则进入 `invalid`并禁止引用与聚焦。
- TypeScript/Vite、Pi 基础会话审计、混合 RAG 审计、R1 会话专项、`cargo check -j 2`和默认 SQLite 只读审计均为 `PASS`。默认库概况为 25,463 篇论文、15 个学科、160 个热点，活动快照含 25,463 篇论文。
- Rust 定向测试目标能够完成编译，但 Windows 测试可执行文件在进入测试框架前挂起；该项记录为环境 `BLOCKED`，不以此覆盖独立 Rust 编译和真实数据库审计的 `PASS`。
- R1 阶段的 Tauri 开发版曾低负载确认唯一可见 `Sidera` 原生窗口、流动星河及阅读面板；当时呈现的自定义尺寸拖拽入口已由 R3 删除。未代用户发送真实 Provider 问题，避免未经确认产生模型调用费用。
- 当前仍保留现有脏工作树。真实 Provider 的三轮交错、Markdown、尺寸恢复、停止和引用/聚焦桌面验收尚未完成，因此产品状态从已知 `FAIL`恢复为 `UNVERIFIED`，不得提前标记 `PASS`。
- 证据：[sidera-m2.0b-r1-conversation-evidence-ui-2026-08-02.json](./evidence/sidera-m2.0b-r1-conversation-evidence-ui-2026-08-02.json)

## 2026-08-02 M2.0b Pi 本地论文轻量混合 RAG（自动技术闭环）

- 从 M2.0a 干净基线创建隔离分支 `codex/sidera-m2-rag`，HEAD `d6e044af8d15fe04039bb1184a71ee5a0b159665`；当前实现保留为 `dirty worktree`。
- Pi 会话不再使用“全部工具关闭”，而是关闭全部内置工具和通用发现，仅显式加载会话专用扩展。扩展只注册 `sidera_search_local_papers`、`sidera_get_papers_by_ids`和`sidera_finalize_evidence`。
- Rust 工具桥通过会话 nonce、进程 epoch、回合 revision、活动 `toolCallId`和三项白名单校验请求；项目 ID 与只读数据库路径由 Rust 注入，模型不能提供 SQL、数据库路径或其他项目。
- 混合检索复用现有 `search_blob` LIKE 路径和活动快照的 384 维 multilingual-e5-small 向量，以语义 `0.55`、关键词 `0.45`、`k=60`的确定性 RRF 融合。向量表缺失或模型版本不匹配时在加载 E5 前安全降级，不现场重建。
- 引用闭包限制为本回合已搜索并成功读取的真实论文 ID；最多搜索 3 次、读取 2 次、引用收口 1 次，证据最多 6 篇，摘要和累计工具输出均有上限。标题与摘要明确标记为不可信数据。
- 前端已经显示“正在检索本地文献 / 正在读取证据 / 正在组织回答”，只在完整回答且结构化引用通过核验后生成引用与现有显式聚焦入口；无引用核验时保留正文但禁用引用。
- `cargo check -j 2`、TypeScript、Vite 生产构建、M2.0a 回归、M2.0b 专项和项目文档审计均已通过；默认发布库真实验证为 `hybrid-e5-like`，旧数据库真实验证为 `lexical-fallback`。
- Rust 定向单元测试可执行文件在进入测试框架前被 Windows 以 `0xC0000139 / STATUS_ENTRYPOINT_NOT_FOUND`终止；本轮未重装依赖或改动系统 DLL。该项记录为 `BLOCKED`，真实数据库审计可执行程序仍为独立 `PASS`。
- 真实桌面 Provider 的中文跨语言检索、流式证据回答、点击引用与显式聚焦尚未执行，产品状态保持 `UNVERIFIED`。
- 证据：[sidera-m2.0b-pi-local-paper-rag-2026-08-02.json](./evidence/sidera-m2.0b-pi-local-paper-rag-2026-08-02.json)

## 2026-08-01 M2.0a Pi 基础会话链路（技术闭环完成）

- 在保持 M1.3m-R3 统一外壳与科研星图冻结基线、M1.3n 运行中心既有实现和当前脏工作树的前提下，已把 Pi RPC 接入正式 Sidera 输入框。
- 本阶段精确锁定 `@earendil-works/pi-coding-agent@0.82.1`，由 Rust/Tauri 按需托管唯一 Pi 子进程；复用现有模型设置和 Windows Keyring，但不读取或改写用户全局 Pi 配置。
- 第一阶段只提供流式文本、多轮上下文、停止和安全错误恢复。工具、论文库、文件、Shell、网页、结构化引用、聚焦、历史持久化和运行中心桥接全部关闭。
- 基线：分支 `codex/agent-theory-perimeter-lod`、HEAD `38e732e5b6905dfab7dc551a6588f4bab88542cb`、`dirty worktree`；Node `24.14.1`、pnpm `11.11.0`、Rust `1.96.1`。
- Pi 依赖精确为 `@earendil-works/pi-coding-agent@0.82.1`。Rust 直接运行包声明的 `bin.pi`，使用严格 LF JSONL、单进程/单会话/单活动回合和标准化事件；真实密钥只从 Windows Keyring 进入会话专用环境变量，私有 `models.json` 只保存环境变量引用。
- 正式桌面已完成首轮精确回答、带上轮上下文的追问、长回答真实中止（保留部分文本并标记“已停止”）以及中止后新一轮恢复；因此技术状态为 `PASS`。
- TypeScript、Vite、`audit:sidera-pi-basic`、Rust 协议测试 5/5 与 `cargo check -j 2` 均为 `PASS`。错误密钥、断网、生成中背景切换和离开/返回 Agent 尚未逐项实机覆盖，用户最终验收仍为 `UNVERIFIED`。
- 2026-08-02 在隔离分支 `codex/sidera-m2-pi-baseline` 创建功能检查点 `03e844560b6857ec4aa0e529dab5ba504d512392`；提交前再次通过 TypeScript、Vite、Pi 专项审计、Rust 协议测试 5/5、`cargo check -j 2`、暂存区 secret 扫描和 whitespace 检查。
- 证据：[sidera-m2.0a-pi-basic-conversation-2026-08-01.json](./evidence/sidera-m2.0a-pi-basic-conversation-2026-08-01.json)。推送只包含已审阅功能基线与文档证据，不创建 PR、不合并、不发布。

## 2026-08-01 M1.3n Sidera Agent 运行中心

- 用户已确认统一外壳与科研星图实际体验暂时没有问题，M1.3m-R3 及 M1.3m 据此记录为技术与用户视觉 `PASS` 并冻结，只保留回归维护。
- `AgentWorkspace` 已从 Agent 页的嵌入式特殊分支移出，新增独立内部视图 `agent-runs`；入口仅位于 Sidera“更多”菜单，未新增一级导航项。进入后使用统一工作页流动星河，返回不改变 Agent 背景偏好、相机或聚焦状态。
- 页面默认进入待办，按等待审批/回答/成果复核、活动运行、最近七天最多三项失败排序；历史区保留全部终态运行并支持状态、任务类型和关键词筛选。既有六类历史运行继续可读。
- 手工新建已收敛为 `research_report`；专业导入、清洗、V20 建模和导出仍由文献工作台、分析流水线与报告库承担。失败专业运行提供对应工作页跳转，研究报告失败可复制目标重新新建。
- 详情保留计划、过程和成果；首屏新增目标、类型、阶段、阻塞和下一步概览。审批、用户问题与成果复核使用按需右侧治理抽屉，Token、费用、租约、修订和哈希收进“技术详情”。
- `pnpm build`、`audit:sidera-agent-run-center`、Agent UI、Agent 桌面验收、Agent 能力静态审计、双背景、统一外壳、单渲染器所有权、工作台和科研星图 R3 回归均为 `PASS`。原生运行中心视觉与真实操作仍为 `UNVERIFIED`。
- 工作树继续为 `dirty worktree`；没有提交、推送、创建 PR 或发布。证据：[sidera-m1.3n-agent-run-center-2026-08-01.json](./evidence/sidera-m1.3n-agent-run-center-2026-08-01.json)

## 2026-08-01 M1.3m-R3 科研星图顶部工具化、边缘导航与详情轨道修复

- M1.3m-R2 的相机生命周期修复继续有效，但用户实机截图确认左上/左下常驻 HUD、标题栏下方第二套工具带和详情轨道重叠仍为产品 `FAIL`。
- 产品科研星图已移除常驻左上筛选面板、左下图例与旧顶部 HUD；模式、筛选、适配、层级动作和更多工具通过 Portal 进入 38px Sidera 标题栏，窗口控件前保留独立安全区。
- 全局可见导航按钮已移除，改为标题栏下方 8px 左缘热区停留 150ms 呼出；快速经过取消，打开后仅由外部点击、导航完成、Escape 或 `Alt+N`关闭/切换。
- 用户进一步要求鼠标离开导航后自动收起；当前加入 220ms 延迟关闭，指针在期限内重新进入会取消关闭，避免轻微越界导致瞬间消失。外部点击、Escape 与 `Alt+N`仍保留。
- 右侧详情改为携带 `hotspotId/paperId` 的唯一 `GalaxyContextRailState`。热点、论文摘要和论文阅读只由该状态决定显示；关闭按钮不再受 `.galaxy-inspector > *` 的相对定位覆盖。
- TypeScript 与 Vite 生产构建、R3 源码/布局专项、统一外壳、单渲染器所有权、空间页面和项目文档审计均为 `PASS`；`git diff --check` 无 whitespace error。收口时已有两个 Cargo 进程运行，依照蓝屏保护规则未并发执行 Rust 增量检查，也未终止既有任务。
- 用户后续实机确认统一外壳与科研星图暂时没有问题，R3 与 M1.3m 的产品视觉由 `UNVERIFIED` 更新为 `PASS / FROZEN`。
- 当前仍是 `dirty worktree`；不提交、不推送、不创建 PR、不发布。
- 证据：[sidera-m1.3m-r3-titlebar-edge-navigation-context-rail-2026-08-01.json](./evidence/sidera-m1.3m-r3-titlebar-edge-navigation-context-rail-2026-08-01.json)

## 2026-08-01 M1.3m-R2 科研星图相机稳定与空间面板整合

- 用户实机确认 R1 后的科研星图仍有五项产品问题：展示/理论切换会复现刷新式自动构图；导航与左侧筛选/图例重叠；常驻筛选面板过大；热点详情默认占据右侧；热点、论文近景和顶部工具栏互相覆盖。
- 已确认模式切换同时触发 `visualMode` 场景重建与页面级 `fit` 命令，属于相机生命周期问题而非视觉错觉；右侧则存在 HUD、证据卡、热点 Inspector 和论文阅读层的多套绝对定位。
- R2 锁定原屏相对姿态继承、导航打开时筛选/图例临时折叠、右侧详情通过投影中心左移约 8% 让位，并将热点与论文内容合并为单一信息轨道。
- 已移除模式变化自动 `fit`；科研星图在展示/理论切换时复用同一 Renderer、Camera 与 Canvas，并按源/目标包围尺度映射当前相对姿态。Canvas 内只重建模式场景资源，用户世界姿态和投影方向不再先回初始值再旋转。
- 左上控制台已压缩为两行常驻结构，快照全文、高级筛选和性能诊断进入同一弹出面板；导航打开时筛选与图例折叠。产品右侧只保留一个 `GalaxyContextRail`，热点、论文摘要和论文阅读严格互斥且默认关闭。
- 右侧轨道使用 `Camera.setViewOffset()` 在 320ms 内形成最高 8% 的投影让位；画布尺寸、世界坐标、FOV 和保存姿态不改变。TypeScript、Vite、R2 专项、空间页面、工作台导航、理论相机与热点过渡审计均为 `PASS`。
- 旧视觉不变量审计仍以 M1.3g 之前的 `createSystemPaperLayer` 哈希为黄金值，受既有 Agent 系统论文可见度修改影响为 `FAIL`；本轮未擅自改写黄金哈希。当前 Tauri 窗口已确认存在，但自动操控返回异常窗口边界，桌面产品视觉继续为 `UNVERIFIED`。现有 Tauri/Cargo 链运行中，Rust 增量检查按蓝屏保护延后。
- 当前为 `dirty worktree`；本轮只做增量实现，不提交、不推送、不创建 PR。
- 证据：[sidera-m1.3m-r2-galaxy-camera-spatial-ui-2026-08-01.json](./evidence/sidera-m1.3m-r2-galaxy-camera-spatial-ui-2026-08-01.json)

## 2026-08-01 M1.3l-R1 全局星空导航壳

- 用户已确认流动星河“效果不错”，M1.3l 的产品视觉由 `UNVERIFIED` 更新为 `PASS`。
- Agent 页标题栏、导航点击层和悬浮抽屉现已全部透明；打开导航不再模糊、压暗或切割中央 Agent 页面。
- 抽屉本体、品牌区、项目区和底部状态区不再绘制独立面板或右侧硬边；仅保留文字阴影、控件本体及当前导航项的克制渐变，工作页面实体侧栏保持原样。
- 真实 Tauri 窗口热更新检查确认星空连续延伸至窗口顶部与导航区域，左上角不再出现生硬直角。自动技术验证通过，等待用户对最终可读性和简约感作确认。
- 证据：[sidera-m1.3l-r1-unified-navigation-shell-2026-08-01.json](./evidence/sidera-m1.3l-r1-unified-navigation-shell-2026-08-01.json)

## 2026-08-01 M1.3m 统一星空外壳与空间页面

- 用户已确认 M1.3l 流动星河的产品视觉为 `PASS`，并锁定普通工作页使用低亮、低速的 `star-river`，不跟随 Agent 理论背景。
- 已取消普通页面永久实体侧栏，全部页面改用透明覆盖导航；普通页面迁移为低亮低速星河上的一体化悬浮工作台，科研星图成为独占空间页面。
- 根级场景所有权已接入 `agent / workbench / research-galaxy / pipeline-formation`。Agent 背景偏好、理论相机和沉浸检查点与工作页临时背景隔离；工作页之间复用星河，科研星图活动时释放外壳 WebGL 子画布。
- 流水线已发布运行、暂停、取消、完成和进度状态，供后续聚类生成空间取得所有权；本轮不实现完整凝聚动画。
- TypeScript、Vite 生产构建、`cargo check -j 2`、M1.3m 四项专项、旧桌面壳、全屏 Agent 壳、项目文档和差异检查均为 `PASS`。
- Tauri 低负载已完成 `Agent 流动星河 → 文献工作台 → 科研星图 → Agent` 往返：透明导航不推动页面，工作台为单一悬浮表面，科研星图无第二套星河，返回 Agent 后星河恢复。理论姿态往返、随机检查点、真实聚类运行态和多缩放档仍为 `UNVERIFIED`。
- 实现与自动技术状态为 `PASS`；Tauri 为 `PARTIAL PASS`，产品视觉继续为 `UNVERIFIED`，因此工作包总状态仍保持 `IN_PROGRESS / PRODUCT UNVERIFIED`。
- 当前基线为分支 `codex/agent-theory-perimeter-lod`、HEAD `38e732e`、`dirty worktree`；不提交、不推送、不创建 PR。
- 证据：[sidera-m1.3m-unified-spatial-shell-2026-08-01.json](./evidence/sidera-m1.3m-unified-spatial-shell-2026-08-01.json)

## 2026-08-01 M1.3m-R1 工作台可读性与全局控件安全区

- M1.3m 的单渲染器、根级场景所有权与独占科研星图架构继续为 `PASS`；用户截图确认其工作台与导航产品视觉为 `FAIL`，因此进入 R1 而非推翻背景架构。
- 导航入口已移到左上 `SIDERA` 品牌旁并排除 Tauri 拖动区；页面右上重复导航入口已删除。标题栏、工作台与科研星图工具栏统一使用窗口控件安全变量。
- 密集工作页使用 `workbench-reserve`：导航展开时只让工作台在 240ms 内右移并收窄；Agent、科研星图等空间页仍为覆盖式导航，画布、相机和实体投影不动。
- 工作页 `star-river` 亮度由 `0.18`提高至 `0.34`，速度保持 `0.20`；主工作台改为 `rgba(0,0,0,0.94)`，常用大型表面统一为纯黑细边线体系并移除蓝色激活底。
- 产品科研星图默认继承空间展示参数并移除全屏按钮；旧全屏切换只存在于开发评审或经典布局。
- 直接 TypeScript、Vite 生产构建、R1/统一壳/所有权/工作台/空间页面、项目文档与差异检查均为 `PASS`。设备已有两条 Cargo 开发链，本轮按蓝屏保护不并发运行 Rust；真实 Tauri 产品视觉继续为 `UNVERIFIED`。
- 当前仍为 `dirty worktree`，不提交、不推送、不创建 PR；证据：[sidera-m1.3m-r1-workbench-navigation-2026-08-01.json](./evidence/sidera-m1.3m-r1-workbench-navigation-2026-08-01.json)

## 2026-08-01 M1.3l 双沉浸样式与流动知识星河（用户视觉 PASS）

- 用户接受“左下至右上知识星河＋主带迁移＋局部 Curl＋微尘剪切＋中央缓流”的参考方向，并决定让“流动星河”和现有“随机星海”都成为正式可选沉浸样式。
- 首次默认流动星河；整体构图稳定，弯曲、密度、支流、纵深和局部运动由会话种子变化。聚焦期间切换样式保留同一实体和信息卡，在短遮罩内重新捕获。
- 当前实现事实：沉浸载荷包含 6,000 篇真实论文和 160 个热点且无理论坐标；`128×64` 状态纹理除语义实体和 32 个动态槽外剩余 2,000 个槽位，可直接承载暗微尘。
- 基线：分支 `codex/agent-theory-perimeter-lod`、HEAD `38e732e5b6905dfab7dc551a6588f4bab88542cb`、`dirty worktree`；保留全部既有修改，不提交、不推送、不创建 PR。
- 已实现 `star-river / random-field` 双样式、首次默认与偏好记忆、分样式运行时间和检查点、黑色遮罩单渲染器切换，以及聚焦身份在新样式中的重新捕获入口。
- 流动星河以 `sessionSeed + entityId + star-river-v1` 建立稳定对角主带、两条支流和外围星点；6,000 篇论文、160 个热点、32 个动态槽及 2,000 个暗微尘恰好占满 `128×64` 状态纹理。微尘不可拾取，三条程序化薄带共享一个绘制几何体。
- 专项审计实测主带/支流/外围为 `72.24% / 18.72% / 9.04%`，5 秒位移中位数/P75/P95 为 `6.23 / 9.62 / 14.48px`，局部切线一致率 `63.19%`，中央/外围速度比 `68.11%`。
- TypeScript、Vite、`cargo check -j 2`、新星河、旧随机星海、双背景、桌面壳、显式聚焦和项目文档审计均为 `PASS`。Tauri 原生窗口已完成 `流动星河 → 随机星海 → 流动星河` 低负载往返，两个 WebGL 首帧均正常。
- 证据：[sidera-m1.3l-immersive-star-river-2026-08-01.json](./evidence/sidera-m1.3l-immersive-star-river-2026-08-01.json)。用户已在原生桌面版确认整体效果不错，因此产品视觉更新为 `PASS`。

## 2026-08-01 M1.3k Sidera 桌面产品壳、启动页与默认入口

- 用户明确要求普通桌面冷启动不再进入旧总览，而是先显示极简 Sidera 启动页，再直接进入全屏 Agent；总览和既有工作页继续通过悬浮导航抽屉访问。
- 品牌统一为 `Sidera`；启动页使用极简星点字标与王羲之《兰亭集序》“仰观宇宙之大，俯察品类之盛”。首次背景为沉浸星海，之后恢复用户上次选择。
- Windows 系统装饰将替换为约 38px 的自定义标题栏：Agent/启动页透明叠加，工作页为深色实体；窗口冷启动默认最大化，不使用独占全屏。
- 旧“默认首页在 M1.4 前不改变”决定已被用户的当前产品决策取代；M1.3j 恒星近景继续保持 `IN_PROGRESS / PRODUCT UNVERIFIED`，本轮不得改写其视觉结论。
- 基线：分支 `codex/agent-theory-perimeter-lod`、HEAD `38e732e`、`dirty worktree` 60 项；实现前仅停止本项目桌面进程，未触碰其他项目的 Cargo/Rust 任务。
- 已实现同 WebView 冷启动门、真实背景 `onReady`、1000ms 最短展示、2000ms 状态提示、错误重试/设置/静态背景继续、默认 Agent 入口和首次沉浸/后续背景偏好恢复。
- 已实现 38px `SideraTitleBar` 与必要窗口权限；Tauri 配置已改为 `Sidera`、默认最大化、居中兜底、非独占全屏和无系统装饰，identifier 继续保持 `com.local.research-hotspots-desktop`。
- TypeScript、Vite 生产构建、桌面壳专项、全屏壳、双背景和项目文档审计均为 `PASS`；浏览器回归确认失败页可进入静态 Agent、导航抽屉不挤压视口、工作页/Agent 标题栏正确切换且启动页不重播。
- 当前另有“机器学习课堂展示”和“个人知识库”两个 Tauri/Cargo 开发任务运行。依据蓝屏保护规则，本项目 `cargo check -j 2` 与原生窗口验收暂记 `PENDING / UNVERIFIED`，未并发启动第三套 Rust 编译。
- 随后确认只剩一套其他项目的空闲 Cargo 父进程且没有 `rustc` 工作、可用内存约 8.4 GiB，遂以 `CARGO_BUILD_JOBS=2` 启动本项目。Tauri dev 增量编译在 43.76 秒内完成，真实 `Sidera` 原生窗口已出现并置于前台；默认 Agent、沉浸背景和自定义标题栏实际可见。冷启动节奏、窗口控件和 DPI 仍等待用户操作验收。
- 证据：[sidera-m1.3k-desktop-shell-startup-2026-08-01.json](./evidence/sidera-m1.3k-desktop-shell-startup-2026-08-01.json)

## 2026-07-31 M1.3j 一键直达聚焦与论文恒星近景

- 用户实机否决 M1.3i 的两段式理论聚焦、背景先暗后移动、关闭时复用 Explore 底栏动画和灰色数据球近景；M1.3i 的解析、身份、动态槽、信息卡与 R10 返回基础保留，产品交互和近景视觉记为 `FAIL / SUPERSEDED`。
- M1.3j 将回答完成后的显式入口简化为单目标舞台：一次点击直接抵达论文近景或热点主星，多对象只保留“下一颗 / 关闭”，不再同时弱亮五个证据对象。
- 沉浸与理论背景统一由 Sidera 时间线驱动压暗、目标增强、相机和信息卡；关闭不再改变中央对话框布局。
- Agent 理论论文近景改用真实 `SphereGeometry` 恒星光球，参考图 A 只约束白热亮核、低饱和冷色颗粒与薄日冕；最终目标直径限制为 `160–240px`。
- 中央对话框宽度调整为 `clamp(480px, 36vw, 640px)`；独立分析星图、展示星图、理论 XYZ、数据库与 UMAP 保持不变。
- TypeScript、Vite、Sidera 一键直达专项、实体解析、全屏壳、沉浸流场、理论恒星材质、外围 LOD 与 R10 回归已通过；另一项目的 Tauri/Cargo 进程仍在运行，因此本项目 Cargo 增量检查继续记为 `PENDING`。
- Tauri balanced 低负载实测发现并修复两项运行时缺陷：论文 `entering` 曾被路由器反向释放，多对象切换完成后曾滞留在 `retargeting`。修复后已确认理论论文一次点击到达 `paper/system/focused`、关闭退出并恢复巡航、沉浸压暗与镜头同步、以及“下一颗”完成后进入 `hold`。
- 用户将当前桌面近景与参考恒星图并列后，确认旧实现仍是灰白冰球/月球：`mu` 边缘衰减制造黑边，低对比噪声无法形成自发光等离子结构。现已删除行星式暗边，改为域扭曲、多尺度脊状等离子网络、白热中心、明亮边缘和约 `1.095×` 的不规则薄日冕；新视觉仍须用户刷新后实机判断。
- 第一轮自发光修订的实机截图又暴露“大块迷彩斑纹”问题；该版本不再继续微调。当前材质已拆成发光本体、白热能量薄层和顶点位移日冕三层：表面只保留高频狭窄网络，中心能量与表面纹理解耦，日冕外轮廓不再是完美圆壳。产品视觉仍为 `UNVERIFIED`。
- 三层版本首次热更新被真实 WebGL 就绪门拦截：日冕顶点位移误接到能量薄层，Corona 片元 Shader 因缺失 `vPlume` 对应顶点输出而无法编译。现已纠正三层 Shader 归属；Vite 构建、Sidera/理论恒星/文档审计和桌面实际 Shader 编译均通过，约 200px 新近景已在当前 Tauri 窗口真实显示。
- 用户进一步确认参考恒星在球面最外侧具有连续高温薄光壳。四层版本第一次采用固定宽度的中尺度等值带后，实机截图再次退化为上一版的大理石/迷彩球，产品视觉判定为失败。当前已撤销宽阈值网络，改用 `fwidth` 控制的屏幕像素级中/细流丝，压低表面覆盖率与曝光，并把独立高温薄光壳扩大到 `1.018×`、稀疏位移日冕维持 `1.038×`；Vite 构建与两项专项审计通过。新版本尚未完成真实桌面视觉复验，因此继续保持 `UNVERIFIED`。
- 最新实机截图确认窄流丝版本略有改善，但 `1.018× SphereGeometry + Fresnel` 仍把参考图的二维圆周轮廓误实现为三维球壳。当前已将该层替换为朝向相机的独立投影圆环：平面外径 `1.04×`，圆环中心与三维球体投影边界重合，主亮线和弱肩部均由 `fwidth` 保持物理像素级宽度；圆周基础亮度连续且只允许小幅稳定变化，不再读取球面旋转或三维噪声。三维本体、能量薄层和位移日冕继续保持各自职责。Vite 构建与 Sidera 专项审计通过，真实桌面视觉仍为 `UNVERIFIED`。
- 用户复验发现第一版投影圆环仍相对可见球体轮廓向右约 `3px`，并在不同方向内缩约 `3–13px`。根因是圆环虽然已经二维化，仍把球心平面上的同世界半径当成透视球体轮廓；近景光球占据大幅视口且位于离轴安全区时，该近似不成立。当前圆环 Fragment Shader 已改为按每个像素的相机射线计算真实球体切线判别式，以 `tangentField = 0` 直接生成轮廓，并用 `fwidth(tangentField)` 保持像素级线宽；包围平面只负责限定片元范围，其尺寸根据真实角半径动态扩张，不再决定圆环位置。前端构建与 Sidera 专项审计通过，桌面最终贴合度仍为 `UNVERIFIED`。
- 当前状态：前端与 Tauri 低负载技术切片 `PASS`、Cargo `PENDING`、产品视觉 `UNVERIFIED`；工作树继续保持未提交，不推送、不创建 PR。

## 2026-07-30 M1.3i Sidera 显式证据聚焦

- M1.3h 的全屏壳层、只读解析、稳定动态槽、双背景身份协调和 R10 返回继续复用；自动三级聚焦、回答期间镜头运动与 24 颗上下文星凝聚被用户判定为产品视觉 `FAIL / SUPERSEDED`。
- 新增正式 `SideraAssistantMessage` / `SideraAnswerEntityReference` 契约。只有回答状态为 `complete` 且结构化实体解析完成后，正文实体入口和回答末尾聚焦按钮才启用；不从自由文本猜测实体。
- Sidera 聚焦会话按首次出现顺序去重，直接轮播最多 6 个对象；一个主目标、最多 5 个证据弱亮，支持单对象关闭、多对象有界上一颗/下一颗、溢出对象列表和历史回答独立重开。
- 双背景页面已增加固定宽度对话框、固定槽位轮播控件、手动收起、对侧信息卡、完整详情、查看语义位置及理论二次深入操作。
- 沉浸适配器已停止产品路径中的上下文星搬运，目标保留原流场运动并由共速相机侧面捕获；理论适配器只做外围证据构图，二次明确命令才进入热点或论文近景。
- `audit:sidera-explicit-focus`、TypeScript、Vite 生产构建、`cargo check -j 2`、实体解析、全屏壳层、沉浸流场、理论恒星材质、外围巡航与 R10 回归均为 `PASS`；`git diff --check` 无错误。
- 技术状态：`PASS`；桌面状态：`PARTIAL PASS`；产品视觉：`UNVERIFIED`；工作树继续保持未提交。
- Tauri balanced 低负载抽查已确认：流式回答期间引用入口禁用且背景不进入聚焦；完整回答解析后可启动单对象证据舞台，按钮原位变为“关闭”，对侧真实信息卡正常出现；关闭后信息卡撤销且理论巡航恢复。溢出夹具可显示 11 个结构化引用和“查看全部对象”入口。
- 多项轮播的逐项视觉接管、跨背景同实体重捕获、二次深入和连续五轮关闭恢复仍须用户实机判断，因此不得将本阶段产品视觉提前标记为 `PASS`。

## 2026-07-30 M1.3g 收口与 M1.3h 启动

- 用户已经在桌面开发版确认 R10 修复完成，并评价当前双背景整体效果“非常不错”。M1.3g、外围巡航、Explore 自由观察、精确返回和现有恒星材质据此记录为用户视觉 `PASS`。
- M1.3h 在已通过的背景上增加产品级动态语义聚焦，不再改写巡航、Explore 返回或当前概览星体材质。
- Agent 页将先移除固定 232px 侧栏，改为不挤压画布的覆盖式导航抽屉；默认启动页仍为总览。
- 聚焦协调器只保存实体身份、模式和上下文；沉浸背景使用会话流场中的单侧凝聚，理论背景始终保持真实 XYZ，并仅在 `full-focus` 时进入热点或论文近景。
- 当前工作树继续保留 R2–R10 的未提交实现与证据；本阶段不提交、不推送、不创建 PR。

## 2026-07-30 M1.3h 技术收口与桌面抽查

- Agent 页已使用完整应用视口；悬浮导航抽屉复用原导航、项目和本地数据库状态，Tauri 中可覆盖打开并由 Escape 关闭，不挤压星空。
- 新增 revision 门控的双背景协调器、只读 `resolve_agent_dual_focus_scene`、一主/5 证据/24 上下文上限和 32 个稳定动态槽。
- 沉浸背景已支持同顶点 sampled 聚焦、单侧上下文凝聚及 snapshot-unsampled/active-only 动态槽；理论背景已支持外围 signal/soft 与 full-focus 热点/论文分层进入，所有理论 XYZ 保持只读。
- 桌面抽查发现并修复三项真实生命周期缺陷：聚焦命令早于 WebGL 就绪、材质释放过早报告 idle、局部近景相机污染概览保存姿态。
- 低负载 Tauri 已验证 sampled 论文跨背景 full-focus、理论论文近景与完整释放、释放后外围巡航继续、active-only 使用 `slot=0`、missing 返回明确错误且不造星。
- TypeScript、Vite 生产构建、`cargo check -j 2`、双聚焦、解析器、全屏壳层、R8/R9/R10 回归和项目文档审计均为 `PASS`。
- 技术状态：`PASS`；桌面状态：`PARTIAL PASS`；产品视觉：`UNVERIFIED`。证据见 [M1.3h 双背景动态聚焦](./evidence/agent-m1.3h-dual-semantic-focus-2026-07-30.json)。

## 2026-07-30 R9 用户结论与 R10 实现

- R9 的连续随机动力学、Worker 引导与 Hermite/slerp 已消除对话态周期性微抖，技术回归继续为 `PASS`；但用户实机确认 Explore 返回到精确锚点后仍出现两次额外滑动和一次跃迁，R9 完整产品视觉因此记为 `FAIL`。
- 根因是锚点返回后的控制权没有真正唯一：Guidance Worker 会立即恢复并连续接管构图；旧 900ms 健康审计只统计主线程护栏而没有统计 Worker 安全结果，因而会误触发 fallback；Guidance 的 `directionSign` 又在接管帧直接替换。
- R10 在 Explore 入口冻结当前/目标 Guidance、目标保持余量、下一 Worker 评估余量、安全计数、epoch、深度、LOD、巡航 previous/current、插值和 accumulator。进入 Explore 时及返回恢复时分别推进 epoch，旧 Worker/LOD 响应不能覆盖返回状态。
- 到达锚点后原子恢复全部冻结状态并从下一个 `1/60s` 固定步续播。返回后三秒禁止重新构图，只发布相机、Guidance、revision、fallback、LOD/深度哈希和持续轨迹残差；原 900ms 健康审计不再能触发 fallback。
- `tsc -b`、Vite 生产构建、`cargo check -j 2`、R10 专项、R6/R8/R9 回归、共享 Screen LOD Worker、项目文档审计和差异检查均为 `PASS`。
- 最新 Tauri 开发版完成 balanced 低负载抽查后，用户进一步确认 R10 修复完成并认可整体双背景效果；滚轮、拖拽后的精确回锚和单一巡航接管据此记录为产品视觉 `PASS`。
- R10 证据：[agent-m1.3g-r10-single-cruise-resume-2026-07-30.json](./evidence/agent-m1.3g-r10-single-cruise-resume-2026-07-30.json)

## 2026-07-30 R8 用户结论与 R9 实现

- 用户确认 R8 的持续巡航与 Explore 精确返回效果“很棒”，因此巡航生命期和返回功能保留为 `PASS`；对话态持续观察仍存在幅度很小但可捕捉的横向或纵向冲击，Ambient 平顺性结论为 `FAIL`。
- 根因对应三条周期离散路径：旧积分器约每 2 秒直接改变垂直速度与角目标；未来 6 秒可见性候选每 250ms 在 RAF 主线程扫描最多 2,048 篇论文和 160 个热点；固定步之间相机位置与注视点使用线性插值。
- R9 巡航检查点已原位升级为 `cruise-motion-v2-jerk-limited`：随机目标每 4–7 秒由会话种子确定，角速度、垂直目标和切线权重分别以 2.4/3.2/2.8 秒连续响应，普通随机更新不反转方向。
- 现有 Screen LOD Worker 已升级为同时处理普通 LOD 与高优先级 `cruise-guidance`；同一时刻仅有一个任务执行，引导最多每 500ms 请求一次，只保留最新待处理请求，过期响应不能改变引导或深度。Worker 不可用时以 1Hz、512 篇、3 个未来时点的空闲任务降级，不进入 RAF 热路径。
- 固定步渲染位置使用端点速度 Hermite 插值并限制在线段包围内；相机方向使用前后检查点的最短路径四元数 `slerp`。Worker 引导提供深度百分位，Ambient 主线程不再每 250ms投影 2,048 篇论文。
- 当前 `tsc -b`、Vite 生产构建、R9 专项审计、R6/R8 回归、共享 Worker 审计、项目文档审计和差异检查均为 `PASS`。收口时已有 Tauri/Cargo 开发链运行且可用内存约 2.6 GiB，依据蓝屏保护规则未并行启动 Rust 增量检查；R9 未修改 Rust 源码，该项记录为 `DEFERRED`。Tauri 60 秒平顺性观察仍为 `UNVERIFIED`。
- R9 证据：[agent-m1.3g-r9-ambient-cruise-smoothness-2026-07-30.json](./evidence/agent-m1.3g-r9-ambient-cruise-smoothness-2026-07-30.json)

## 2026-07-30 后续产品需求登记

- 状态：`PLANNED / NOT IMPLEMENTED`，不替换当前 M1.3g-R9，也不代表数据库、连接器或全文阅读已经存在。
- 校园图书馆方向：按学校、图书馆和实际数据库供应商建立受治理连接器，先做馆藏发现、OpenURL/DOI 跳转和正式元数据接口，再评估用户授权的单篇全文获取。禁止通用账号密码采集、Cookie 导出、验证码/付费墙/IP 限制绕过和无人值守批量下载。
- 全文阅读方向：在“文献与建模 → 阅读与详情”中建设沉浸式论文/期刊阅读台。来源覆盖用户上传、合法下载后导入、开放获取和后续机构连接器；首期格式为 PDF。
- 文档治理方向：论文实体与全文文件分离；原文件按内容哈希不可变保存，来源、版本、许可、页码、章节、文本/页面坐标和 OCR 置信度可追溯。
- AI 阅读辅助方向：翻译、总结、解释和自由问答作为可扩展候选能力，必须明确作用范围并引用页码/章节。默认只向用户配置的外部模型发送最小必要片段，整篇全文或页面图像外发前要求明确确认。
- 实现顺序和退出门槛已写入 [ROADMAP.md](./ROADMAP.md) 的“全文阅读与机构来源”轨道；实际开发开始前仍需确认首个目标学校、首批数据库、允许的登录方式、OCR 优先级和翻译呈现方式。

## 2026-07-30 R7 开始结论

- R6 精确锚点的位置和方向返回获得用户确认，轨迹技术结论保留为 `PASS`；但完整产品视觉为 `FAIL`。
- Explore 热点标题闪烁来自标签画布在拖拽、滚轮或论文 LOD Worker 待办时被主动清空，不是热点坐标或 WebGL 星体跳动。
- Agent 理论包装层把系统视图和论文聚焦状态回调丢弃，外层页面只能显示“退出探索”，底层已有的 `return-system-center` 与 `exit-system` 没有产品入口。
- 返回完成只恢复相机、巡航检查点、深度和 LOD，没有原子恢复巡航推进许可；可见性护栏拒绝推进时，画布仍运行但外围相机保持静止，重新挂载才会执行完整构图搜索。
- 系统普通论文沿用共享分析材质。Agent 理论模式需要独立的高亮环境可读配置，不能用全局常量改变展示星图或独立理论星图。
- R7 已锁定：标题持续跟随、右上角动态返回键、系统论文按高亮环境可读调整；外围巡航、R6 返回轨迹和当前概览论文材质保持不变。

## 2026-07-30 R7 用户验收与 R7.1 修订

- 用户实机确认热点标题不再闪烁，动态返回键和 Escape 分层返回正确。
- 用户实机确认 Explore 返回轨迹正确，但返回后理论背景仍永久静止；切换沉浸背景再返回才恢复。系统论文亮度略有增强，但仍有提升空间。
- 根因是 R7 恢复证明在 `agentTheoryCruiseResumeProofActive` 期间跳过真实可见性护栏，只需两个固定步即可发布完成；随后第一次护栏评估仍可关闭 `advanceAllowed`，自动审计没有覆盖该时间边界。
- R7.1 已让恢复证明持续至少 900ms、30 个固定步并通过至少两次真实护栏安全评估；候选构图安全时允许巡航在连续转向期间继续推进。
- Agent 理论热点系统论文进一步提高为基础透明度 `0.82`、远/中/近最小尺寸 `2.9 / 3.1 / 3.25px`、深度亮度/尺寸下限 `0.94 / 0.96`、聚焦非邻域/邻域倍率 `0.68 / 0.80`，并扩大稳定亮核但不增加 Bloom 或软雾。
- `pnpm build`、R5、R6 和 R7-v2 审计为 `PASS`；真实桌面持续巡航和亮度仍需用户复验。
- R7.1 证据：[agent-m1.3g-r7-1-liveness-visibility-2026-07-30.json](./evidence/agent-m1.3g-r7-1-liveness-visibility-2026-07-30.json)

## 2026-07-30 R7.1 用户验收与 R8 修复

- 用户再次在真实桌面确认：Explore 返回相机轨迹正确，但返回完成后外围巡航仍永久静止；切换沉浸背景再返回才会重新运动。R7.1 因而记录为“静态/自动审计 `PASS`、产品实机 `FAIL`”。
- 根因不是 RAF、渲染器或 React 画布停止，而是同一确定性检查点在可见性守卫判定不安全后不再前进；下一次评估仍得到同一结果，形成稳定死锁。延长完成证明只能观察到证明窗口内的短时运动，不能解除这项控制权冲突。
- R8 已删除“可见性守卫决定是否推进”的结构。Ambient 的 `1/60s` 固定步在页面可见、理论概览且未启用减少动态时始终推进；守卫只连续调节方向、切向权重、垂直注视和 `0.35–1` 的非零速度。
- 无普通安全候选时进入 `fallback`：连续减速、转向或反向，并临时增加面向有效包围盒的构图权重；不传送、不重置检查点、不创建第二相机控制器。
- Explore 到达精确锚点后立即恢复冻结的巡航与引导状态；首个成功固定步后发布 `idle`，论文 LOD 并集在 300ms 内收敛。旧 900ms 健康证明改为只读后台审计，失败只请求 fallback。
- R8、R7-v2、R6 精确返回与 R5 可见性回归审计均为 `PASS`；真实桌面连续五轮往返及每轮 30 秒巡航仍为 `UNVERIFIED`。
- 用户已接受 R8 的主要巡航与返回效果；当前仅对 Explore 自由相机滚轮做局部灵敏度修正：标准单格的预计惯性路程从约 32% 星系中位半径降低到约 6.7%，其他相机与星体视觉保持不变。调整后的手感等待一次简短复验。
- R8 证据：[agent-m1.3g-r8-cruise-liveness-2026-07-30.json](./evidence/agent-m1.3g-r8-cruise-liveness-2026-07-30.json)

## 2026-07-30 R7 初始实现与验证结论

- 热点标题已与论文 LOD Worker 解耦：Explore 拖拽和滚轮期间继续按最高 30 FPS 重投影，普通标题使用两次无碰撞显示、250ms 碰撞隐藏和 160ms 透明度迟滞；选中、悬停和主要标题不再经过瞬时清空帧。
- Agent 理论页已发布 `overview / system / paper` 层级，并增加“取消靠近 / 返回热点星系 / 返回理论全图”动态返回键；Escape 与按钮使用同一导航命令。
- R6 安全锚点已扩展为完整巡航生命期快照。返回完成后至少成功推进两个固定步并产生 `0.15px` 真实投影位移，页面才结束 `return-commit`；不再用切换背景重新挂载来恢复巡航。
- Agent 理论热点系统论文使用独立高亮环境配置；独立理论星图、展示星图和当前 Agent 概览论文材质未改。
- `pnpm build`、`cargo check -j 2`、R5/R6/R7 审计和 `git diff --check` 均为 `PASS`。
- Tauri 低负载自动抽样曾看到返回后的短时投影位移，但用户持续观察证明它不足以代表巡航真正恢复；该结论已被上方 R7.1 根因分析取代。
- R7 证据：[agent-m1.3g-r7-navigation-liveness-visibility-2026-07-30.json](./evidence/agent-m1.3g-r7-navigation-liveness-visibility-2026-07-30.json)
- 桌面开发版当前保持打开，供用户继续验收。

## 2026-07-28 纠错结论

- 当前所谓“沉浸背景”仍通过 `hotspot.position + paper.offset` 生成论文位置，视觉上必然保留理论热点团簇；这与 `agent背景.html` 的会话随机星海不是同一种空间结构。
- 构建、Rust 增量编译和自动审计的 `PASS` 只证明旧实现满足自身技术约束，不能覆盖用户在 Tauri 实机中确认的产品结构性失败。
- M1.3c 的“实现完成”结论撤销。旧 `AgentGalaxyFlowCanvas`、同顶点聚焦、实体解析、性能诊断和恒星材质研究保留为技术资产，但不再进入正式沉浸背景产品路径。
- M1.3d 将沉浸背景和理论背景彻底拆开：沉浸背景不得读取理论 XYZ、热点质心或论文语义偏移；理论背景继续使用真实理论坐标。
- M1.3d 的技术闭环和低负载功能验收为 `PASS`，但用户实机确认沉浸流动不明显、理论论文色相不足、热点像蓝色行星圆片，因此产品视觉为 `FAIL`。
- M1.3e 只修订沉浸流动与 Agent 理论恒星材质。聚焦、Thinking 波纹、六态动画和正式 Agent 后端继续暂停。
- 用户在 M1.3e 技术复验后确认 Agent 理论背景仍像薄板状、低饱和二维数据点云。M1.3f 仅修订 Agent 理论显示空间、构图、深度材质和非语义深空装饰层。
- M1.3f 允许 Agent 理论背景使用上限为 `2.2` 的可审计纵深增强；独立理论星图、展示星图、数据库和原始理论载荷继续保持原始 XYZ。
- M1.3f 的纵深矩阵、深度材质、装饰层和共轨数学审计通过，但用户实机确认默认构图仍像二维圆片散点图，只有主动鼠标交互时才产生明显三维感；该产品视觉结论为 `FAIL`。
- M1.3g 从 M1.3f 的失败归档提交创建隔离分支；外围巡航、连续返回和恒星 LOD 仅进入 Agent 理论背景，不修改独立理论星图、展示星图、数据库或原始 XYZ。
- M1.3g 首轮桌面运行出现理论背景全黑。R1 确认并修复三项运行时根因：InstancedMesh Shader 重复声明 Three.js 自动注入的 `instanceColor`；外围剖面使用原始单位而场景使用 `0.0047` 缩放单位；热点 PSF/光球尺寸未统一到渲染世界单位。
- 用户在 R1 实机复验中确认沉浸背景正常，但 Agent 理论背景仍存在三项问题：同屏论文过密且单星过小过暗；Explore 首次鼠标拖拽或滚轮会把星系甩出视锥；进入/退出相机过程可见卡顿。R2 已进入开发。
- R2 实时诊断确认桌面进程与 WebView2 均保持响应；明显卡顿来自拖拽期间最高每 250ms 在主线程投影/排序全部 25,463 篇论文，并在 180ms LOD 交接中逐帧遍历全权重缓冲。旧慢帧降级随后会永久停止全图环境 RAF，造成“理论星图卡死”的观感。
- R3 自动技术验证虽通过，但用户实机确认拖拽期间屏外论文不实时补齐、Ambient 长时仍偶发跳动、退出 Explore 存在多次跃迁和论文延迟显现、热点材质仍不成立。R3 产品视觉现为 `FAIL`，R4 已进入开发。
- R4 自动技术闭环已完成：护栏增量 LOD Worker `PASS`（11/11）、交互与运行期接线 `PASS`（23/23）、自由观察/连续性/热点 `PASS`（25/25）、周期 C2 安全壳 `PASS`（8/8）、外围巡航 `PASS`（19/19）、热点 PSF `PASS`（9/9）。Worker 只在真实运行时就绪后创建并唯一销毁，队列限制为一个执行中请求和一个最新待执行请求；失败时使用 1.5ms 分块后备。返回只有在零待办、深度误差不超过 1%、LOD 完成且选集稳定 500ms 后才进入巡航。
- R4 低负载 Tauri 短时抽样为 `PARTIAL PASS`：理论背景正常加载，大幅拖拽后的首帧已有新视区论文，退出完成门后没有观察到延迟论文补批。一次返回落入近乎空白的自然稀疏扇区；依据用户确认的“不自动纠正构图”规则没有抢回中心，因此该观感仍为 `UNVERIFIED`。持续按住鼠标的中间帧、60–90 秒 Ambient 和热点系统交接也尚未实机验收。
- 2026-07-30 用户实机确认 R4 产品视觉 `FAIL`：Ambient 与 Explore 中全部热点不可辨认；退出 Explore 后巡航会进入完全无论文和热点的黑屏方向，只有切换到沉浸背景再返回才恢复论文。论文星当前材质获得认可并冻结。R5 将热点恢复为清晰克制的点源/PSF，并以单一相机写入者内部的连续可见性包络替代“运行期永不纠正构图”。
- R5 自动技术闭环已完成：热点概览为 `2.8–5.2px` 锐利核心与 `5.5–10px` PSF；`agent-theory-visibility-v1` 每 250ms 检查当前及未来 6 秒；`agent-theory-screen-lod-v3` 先填满真实视口再填充护栏，返回门只统计 `viewportSelectedCount`。
- 第一轮 R5 Tauri 复验确认热点和 Explore 标签恢复，但真实返回仍停在近黑的 `return-handoff`。完成门没有误判通过；根因是屏外护栏论文被旧计数冒充视口可见论文。修订后若预测与真实渲染仍不一致，同一返回控制器会连续转向中心安全包络并提前生成该视口 LOD。
- 用户进一步确认“不操作 Explore 立即退出”也会滑向黑屏，证明错误来自返回终点本身。当前实现已在 Explore 入口冻结安全巡航锚点：无交互退出原位恢复，有交互退出优先返回该锚点，不再按最终 Explore 位置临时制造外围终点。
- 用户随后复验确认 R5 的无交互立即退出已经能恢复原位，但任何滚轮、拖拽或平移都会进入另一条旧 Hermite 返回路径；自由相机残余速度可把轨迹推出锚点区间，返回 LOD 又可能在锚点集合建立前淘汰当前集合。R5 因此记录为“自动验证不充分、产品视觉 `FAIL`”。
- R6 删除运行时 Hermite 返回和交互速度注入：进入 Explore 时冻结精确相机四元数、投影、巡航插值、深度和论文 LOD；退出先预热“当前集合 ∪ 锚点集合”，再用 `smootherstep` 位置线性插值与四元数球面插值返回同一锚点。返回完成门只读取实时相机和实际论文权重，过期 Worker 用途、投影签名或旧视口响应会被丢弃。

## PASS

- M1.3g-R1 已为论文 PSF、热点核心/光学 PSF、光球核心/日冕和深空装饰材质设置可诊断名称；热点 Shader 不再手动声明 `instanceColor`，自定义 `instanceSeed` 与 `instanceBlend` 保留。
- Agent 理论背景撤掉遮罩前会真实编译并检查 WebGL program、清空首帧错误并使用 Three.js `Frustum` 确认至少一个真实论文或热点可见；失败会停止 RAF、禁止保存检查点并显示可重试错误。
- 外围剖面、巡航相机、场景实体与热点光学尺寸已统一到 `APP15_THEORY_COORDINATE_SCALE=0.0047` 后的 Three.js 世界单位；旧检查点版本被隔离。
- M1.3g 外围专项审计读取 25,463 篇论文和 160 个热点，原始坐标哈希仍为 `49c931dad6ccee730f7e6939010971c42a829db1a731c4feb77a570a8388bf37`；96 扇区 8 分钟覆盖率为 `91.67%`，近景 5 秒位移中位数为 `16.248px`，连续返回无单调违规。
- Tauri balanced Ambient 已完成真实首帧和 15 秒低负载观察：论文与热点可见、无间歇性黑屏、未出现原错误中的重复无效 program；热点尺寸单位修正后不再出现巨型蓝色光弧。
- R2 交互热路径现已冻结屏幕 LOD 重选和既有权重交接；相机停稳 140ms 后才通过空闲回调刷新一次。外围巡航下限改为 750ms，Explore 枢轴只遍历当前 LOD 选择，并复用预计算理论边界。
- LOD 排序预先计算稳定哈希、优先级和屏幕网格键；180ms 交接只遍历发生变化的顶点。专项交互审计和 TypeScript 检查为 `PASS`。
- Agent 理论慢帧降级不再终止环境 RAF：降级后保留约 18 FPS；Agent 理论热点系统静置目标提高到 24 FPS。独立理论星图和展示星图不受影响。
- M1.3g-R2 自动技术验证为 `PASS`，但用户视觉验收为 `FAIL`：Explore 的固定 Orbit 中心仍限制自由观察；返回外围结束前出现一次视角跃迁；Ambient 偶发抖动；热点在 Ambient 中不可辨认、Explore 中也常常消失；近景论文仍可小幅提亮。
- M1.3g-R3 已完成自由观察相机、`return-handoff` 连续交接、巡航/深度/LOD 平滑、热点独立视觉层级和近景论文亮核增强。最终边界复核又补齐热点单击进入与双击瞄准互斥、自由相机 reset/fit/top 真实姿态过渡、Sphere 退场所有权与总槽位预算、近景辐射渐进门控，以及返回末帧真实热点世界参考的投影/方向诊断。R3 专项审计扩展为 25/25 通过，全部构建与回归审计通过，自动技术状态为 `PASS`。
- 低负载 Tauri 已确认理论星体正常可见；进入 Explore 后拖动会明显改变构图且星体不会消失，证明自由视线已经进入真实桌面路径。检测到用户输入后停止进一步 GUI 操作，其余交互与完整返回没有被自动推断为通过。
- `pnpm exec` 的 shim 在本机出现异常，但直接调用项目本地 `tsc -b` 和 `vite build` 均为 `PASS`；未清理或重装 pnpm Store。
- R6 精确返回专项审计使用活动快照 25,463 篇论文、160 个热点、真实 Three.js 相机和非零滚轮/拖拽/平移场景，轨迹最大线段越界为 `0`，终点位置误差不超过 `7.9e-17`；可见交互场景最低保持 2,940 篇论文、48 个热点和 10 个热点网格。Screen LOD Worker v2 用途/投影签名审计为 `13/13 PASS`；TypeScript、Vite 生产构建、`cargo check -j 2`、恒星材质、双背景、项目文档和差异检查均为 `PASS`。

- 理论星图和展示星图已有稳定基线，生产布局继续使用 v3。
- 轻量 `AgentGalaxyBackgroundPayloadV1` 已生成并通过确定性、身份、大小和哈希审计。
- 当前载荷包含 160 个热点和 3,840 个论文代理，文件小于 1 MiB。
- 独立 Three.js 背景渲染器、开发评审入口、质量等级、页面隐藏暂停、减少动态和性能快照已存在。
- 默认应用入口尚未替换，旧背景原型与正式星图隔离。
- 标准项目文档入口、流场/焦点内部契约和旧审计替换清单已经冻结。
- 确定性夹具覆盖 2 篇常驻论文、2 篇快照内未抽样论文、1 个活动库新信号夹具、1 个缺失实体、6 个热点和 2 组多实体场景。
- `pnpm build`、背景载荷、旧基础设施、准备阶段、理论相机、热点过渡、星图视觉不变量、UMAP 隔离和版本一致性审计均通过。
- M1.2a 使用独立 `AgentGalaxyFlowCanvas`、`agent-flow` 路由和 `gravitational-weave-tech-preview`，未覆盖旧背景入口或默认 `<App />`。
- 引力织场技术骨架采用四个不可见、由快照确定的解析场节点；热点和论文云保持共同形变，运行中无换带或屏幕内重生。
- 黑白锐利星层使用正常透明混合，不使用时间透明度、Bloom、景深、运动模糊或整组旋转/缩放。
- `audit:agent-galaxy-gravitational-weave` 与 `audit:agent-galaxy-flow-visual` 用于技术验证；通过只代表技术约束 `PASS`，不代表产品视觉通过。
- 重启后重新执行 `pnpm build`、引力织场数学/静态视觉/准备审计、背景载荷、旧背景隔离、星图视觉不变量、理论相机、热点过渡、UMAP 隔离和版本一致性审计，结果均为 `PASS`；`git diff --check` 无空白错误。
- Iris Xe WebGL2 对 256 个样本的 CPU/GPU 最大坐标误差为 `3.998122019257539e-6`，低于 `2e-4` 阈值。
- 浏览器按 720p balanced 15 秒、1440×900 balanced 30 秒、1440×900 high 30 秒逐级运行；三档 P95 帧时间均约 `6.2ms`，无控制台错误或新的系统异常。
- 已生成 `t=0 / 8 / 20` 三张 3840×2160 WebGL 原图、1 张原生 1024×768 星体裁切及固定/协同漂移两段约 20 秒视频。
- 用户已接受引力织场运动语言；视频中的轻微软化记录为录屏压缩现象，浏览器和 4K 原图的锐利星核约束继续有效。
- M1.3a 将全部 3,840 个常驻论文身份保留在一个稳定几何体中，balanced 与 high 改为逐顶点可见掩码。
- 常驻论文聚焦使用独立 FocusController，基础 `FlowModel.dynamicFocus` 继续如实保持 `false`。
- `signal / soft-focus / full-focus`、显式释放、回答结束延迟释放和双目标交叉切换已经接入隔离评审页。
- 新审计 `pnpm audit:agent-galaxy-focus` 验证常驻身份唯一、同顶点提升、时间曲线、云直径比和渲染器不因聚焦意图重建，结果为 `PASS`。
- `pnpm build`、`audit:agent-galaxy-gravitational-weave` 和 `audit:agent-galaxy-flow-visual` 在聚焦改造后继续为 `PASS`。
- 第二次异常重启后再次执行 `pnpm build`、`audit:agent-galaxy-focus`、`audit:agent-galaxy-gravitational-weave` 和 `audit:agent-galaxy-flow-visual`，结果均为 `PASS`。
- 聚焦亮度已与透明度解耦；预算外常驻论文使用可靠片元掩码，并且在目标切换途中释放时，两颗论文星会从当前权重连续退出。
- 用户已在浏览器中确认引力织场与聚焦空间运动总体效果可继续使用；未观察到目标复制、排队或重建粒子层。
- 隔离评审背景已统一为 `#000000`；语义星和装饰星已改用紧致导数抗锯齿边缘，去除原宽软边覆盖。
- 三级焦点已增加确定性的低饱和语义色、轻微晶面轮廓和最多 10% 的局部邻域 RGB 对比；仍不使用 Bloom、圆环、准星、标题或聚焦透明度动画。
- 新材质修改后 `pnpm build`、`pnpm audit:agent-galaxy-focus`、`pnpm audit:agent-galaxy-flow-visual` 和 `pnpm audit:agent-galaxy-gravitational-weave` 均为 `PASS`；`git diff --check` 无空白错误。
- 第二轮快速可见度调整将普通论文星提高到 `1.6-2.8 CSS px`、完整聚焦上限提高到 `5.2 CSS px`，并改为锐利白核加低饱和语义色外层；评审页刷新后会自动激活默认完整聚焦。
- 聚焦锚点诊断在投影前显式更新相机世界矩阵，避免旧矩阵造成的数百像素假误差；本轮构建、聚焦审计和流场视觉审计继续为 `PASS`。
- M1.3b-1 将聚焦时间线拆分为 `acquisitionBlend / fieldBlend / materialBlend / cameraBlend / releaseBlend`；完整聚焦先在 0.65 秒内完成目标捕获，再形成局部织场，最后才启动共速相机。
- 新 `FocusField` 使用 CPU/GLSL 同源的非径向潮汐弯曲，目标自身不位移，世界位移硬上限为 `0.24`，静态审计中 256 个样本有 228 个表现为非径向响应。
- 论文、热点与聚焦目标已统一使用双通道恒星光球 LOD：核心通道全分辨率并写深度，表面/薄层日冕通道共享同一几何体和实体索引且不写深度。
- 普通论文继承热点低饱和色相，热点使用稳定主星层级；`signal / soft-focus / full-focus` 的目标终点尺寸分别固定为 `4.2 / 6.2 / 8.5 CSS px`，不再受原始论文点尺寸影响。
- `starMaterial=flat|photosphere`、`focusField=0|1`、`focusCamera=0|1` 已加入隔离评审入口；HUD 可检查五项 Blend、光球 LOD、局部织场位移、语义色与核心/表面绘制调用。
- 本轮 `pnpm build`、`pnpm audit:agent-galaxy-focus`、`pnpm audit:agent-galaxy-flow-visual` 和 `pnpm audit:agent-galaxy-gravitational-weave` 均为 `PASS`。
- 低负载浏览器 WebGL2 复验为 `READY`：基础引力织场 256 点 CPU/GPU 最大误差约 `4.0e-6`，FocusField 最大误差约 `3.0e-7`，均低于 `2e-4`。
- `focusCamera=0` 时常驻可见论文达到 `8.5 CSS px / LOD 1.0`，FocusField 屏幕位移约 `0.96px`，受影响可见邻域约 `22.2%`；目标可在不移动相机的情况下形成独立光球。
- balanced 下预算外常驻论文继续使用原顶点 `2274`，诊断为 `baseVisible=false / promoted=true`；切换与释放期间渲染器实例保持不变。
- 浏览器静置样本使用 Iris Xe、DPR 约 `1.2`、6 个绘制调用，记录约 `164 FPS / P95 6.2ms`；本轮未运行全屏、录屏或高质量压力测试。
- 已完整审计外部 `D:\wenjian\Desktop\agent背景.html`，并以 SHA-256 `951A5FA1C156A4720BA6E501356C5100FC8CC6B23C5BB7B3F2EB679E39BB3D78` 冻结为沉浸视图视觉参考。
- 已接受“沉浸展示视图 + 理论语义视图”双背景边界；两者共享实体身份、焦点意图、证据集合和快照身份，但使用独立空间解释器。
- [沉浸版准备文档](./AGENT_IMMERSIVE_BACKGROUND_PREPARATION.md) 已明确原型保留项、小幅调整项、随机逻辑替换表、上下文集合契约和第一轮隔离评审范围。
- [准备证据](./evidence/agent-immersive-background-preparation-2026-07-28.json) 已记录分支、HEAD、脏工作树、原型哈希、设备风险和未修改生产入口的边界。
- 新增 `AgentGalaxyImmersiveCanvas`、`AgentGalaxyImmersiveWorkspace`、`AgentGalaxyImmersiveReview` 和 `visual-review=agent-immersive` 独立入口。
- 沉浸工作区已直接读取 `AgentGalaxyBackgroundPayloadV1`，焦点目标使用真实 `paperId`；上下文集合由同热点成员和语义相对距离确定，不使用随机论文或屏幕半径。
- 中央对话框、左右信息面板、`idle / thinking / focus` 控制和真实实体切换已形成可运行 React 程序。
- 新入口复用现有引力织场、稳定顶点、FocusField、光球亮核和共速相机；默认 `<App />`、展示星图、理论星图和数据库未修改。
- 项目本地 `tsc -b` 和 Vite 生产构建均通过，新入口生成独立 CSS/JS 产物。
- 沉浸视图已扩展为 `idle / input / thinking / answer / reading / focus` 六态；所有参数在 900ms 连续时间线上变化，不因状态切换重建渲染器或基础几何体。
- 上下文抽取已进入 GPU 顶点层：目标与最多 24 篇上下文继续使用原顶点，通过双槽角色/证据顺序属性完成侧向整团抽取、回答顺序显现、释放与切换；背景亮度下限为 68%，沉浸目标尺寸上限为 4.8 CSS px。
- Agent 沉浸相机辅助已限制为 `signal=0 / soft-focus=8% / full-focus=15%`，上下文先可辨认、相机后启动。
- 全部 160 个热点身份现在保留在稳定热点几何体中；质量等级使用逐顶点预算，预算外目标热点只提升自身。
- 已增加 24 槽动态语义层。`snapshot-unsampled` 使用源快照 membership、热点坐标、`sourceCentroid` 与 `isotropicScale` 恢复精确坐标；`active-only` 明确进入版本化未分类外围区；`missing` 不创建星体、面板或替代关系。
- 新增只读 Tauri 命令 `resolve_agent_galaxy_entities`，以 `SQLITE_OPEN_READ_ONLY` 批量解析最多 32 个论文/热点实体；未增加数据库表、迁移或写操作。
- 沉浸/理论视图通过 400ms 黑色遮罩交叉切换；理论桥接视图直接使用完整 V20 理论 XYZ 定位同一实体，不进行逐星插值，活动库未聚类实体明确禁用“查看语义位置”。
- `audit:agent-galaxy-immersive` 已验证 25,463 篇源论文、3,840 个常驻代理、160 个热点，以及 sampled / snapshot-unsampled / active-only / hotspot / missing 五类行为，结果为 `PASS`。
- 本轮本地 `tsc --noEmit`、Vite 生产构建、`cargo check -j 2`、引力织场数学审计、聚焦审计、流场静态审计和沉浸阶段审计均为 `PASS`。
- M1.3c 失败实现已保存为本地提交 `e739e41`，并从该提交创建隔离分支 `codex/agent-dual-background-v2`；未推送远程。
- 新增坐标为空的 `AgentImmersiveBackgroundPayloadV2` 和只读命令 `load_agent_immersive_background`。活动快照实测返回 6,000 个唯一真实论文 ID、全部 160 个热点 ID，重复种子哈希一致，不同种子改变 9,044 个抽样位置；载荷不序列化理论坐标。
- 新 `AgentImmersiveStarfieldCanvas` 独立使用会话随机空间、静止相机和连续 Curl 流，不复用理论星图坐标、质心、语义偏移或 `AgentGalaxyFlowCanvas`。
- 正式“研究 Agent”导航项已接入 `AgentDualBackgroundPage`：首次使用沉浸背景，模式偏好本地保存，沉浸种子和流动时间在同一会话延续，背景切换期间仅挂载一个 WebGL 画布。
- Agent 理论背景继续使用完整真实理论 XYZ；默认环境态隐藏标签和交互，探索态显示标签并启用理论星图交互。探索态 Enter 提交后已在 Tauri 中验证恢复中央输入和最佳全图。
- Tauri 低负载功能验收已验证：沉浸随机星海、理论真实团簇、显式切换、探索进入/退出、普通/探索提交、高级工作台往返均正常；未运行全屏、长录屏或 GPU 压力测试。
- `tsc -b`、Vite 生产构建、`cargo check -j 2`、`audit:agent-dual-background`、只读数据库审计和 `git diff --check` 均通过。
- M1.3d 双背景相关代码、审计和文档已冻结为本地提交 `63e83d3`；未推送远程。
- M1.3e 已实现 `128×64` RGBA32F 位置/速度 Ping-Pong 两级流场、固定 `1/60s` 积分、最多 3 步补算、会话检查点和解析式后备。
- `audit:agent-immersive-flow` 已通过：代表种子 5 秒位移中位数 `4.635px`、P75 `8.114px`、P95 `19.137px`，超过 `3px` 的可见论文比例为 `78.96%`，全局方向性为 `22.19%`。
- Agent 理论论文已保留独立热点语义色；热点概览已改为共享实体索引的锐利核心与薄光学层，不再使用方向光 Lambert 行星圆片。
- `audit:agent-theory-stellar-material`、`audit:agent-dual-background` 和 `audit:project-docs` 均为 `PASS`。
- M1.3e TypeScript、Vite 生产构建和 `cargo check -j 2` 均为 `PASS`。
- 首次 Tauri 切换沉浸背景时发现检查点回写导致 React 递归更新；WebView 控制台已定位，现已改为每个渲染器实例冻结挂载检查点，修复后 TypeScript 和专项审计继续通过。
- 修复后使用全新低负载 Tauri 启动链完成沉浸 → 理论 → Quantum Physics 热点 → 沉浸往返；沉浸持续运动、理论论文色相、热点概览恒星材质和检查点续接均正常，未再出现纯黑页或递归错误。
- M1.3e 已创建本地技术检查点 `ea5c8b843dc94f328caa25e32b358150b38c1518`；未推送、未创建 PR、未发布。
- M1.3g-R5 专项自动验证通过：可见性/热点 `14/14`、Screen LOD Worker `12/12`、交互 `23/23`、自由观察/连续性/热点 `25/25`、周期安全壳 `8/8`、恒星材质 `19/19`。项目本地 TypeScript、Vite 生产构建和 `cargo check -j 2` 同样通过。

## FAIL

- `voyage / breath / signal` 三套视觉候选未通过人工验收。
- 主要问题包括固定坐标感、整组旋转/缩放代替真实流动、热点过强、论文星不明显、色彩过于突出和整体模糊。
- 因视觉验收失败，M1 不能标记完成，即使旧自动审计仍能通过。
- 首次 M1.3a 浏览器体验确认旧星体覆盖函数仍显得模糊，且原聚焦能量差过小，视觉上主要只能感知相机远近变化；该旧材质基线判定为 `FAIL`，现已替换。
- M1.3a 的同顶点、相机和切换骨架技术上通过，但旧的二维白点/弱材质方案无法让用户在关闭相机时辨认目标，因此其产品视觉结论保持 `FAIL`，不能用技术审计覆盖。
- M1.3b-1 恒星光球能够产生明确放大缩小，但用户不认可这种表达作为沉浸版主视觉。该视觉方向不再继续扩张，底层同顶点、锐利亮核、FocusField 和相机能力保留。
- M1.3c 把真实身份约束错误扩张为理论空间约束，沉浸视图继续继承理论热点中心和论文语义偏移。Tauri 实机中启动后仍呈现理论星图式热点团簇，用户无法找到 `agent背景.html` 的随机流动星海，因此该产品结构判定为 `FAIL`。
- M1.3d 双背景空间拆分正确，但沉浸 Shader 只产生原位微幅偏移，5 秒内缺少可追踪输运；Agent 理论论文被重复白化，热点使用方向光球面圆片。其技术状态保留 `PASS`，产品视觉状态改为 `FAIL`。
- M1.3f 仅靠全图远视角、Z 轴增强、前中后景材质和微幅共轨漂移，未能让默认 Agent 理论背景摆脱圆片散点图观感；该方向停止扩张。
- M1.3g 首轮运行时 Shader 因 `instanceColor` 重复声明编译失败并持续调用无效 program，理论背景完全空白；原静态审计错误地将源码结构通过视为运行时成功。本次事故技术结论记录为 `FAIL`，已由 R1 修复并建立真实 WebGL 就绪门。
- M1.3g-R2 的屏幕 LOD 和热路径治理通过自动审计，但固定语义 Orbit 枢轴、返回末帧集中切换和热点层级未通过用户视觉验收；产品视觉结论为 `FAIL`，由 R3 取代。

## UNVERIFIED

- M1.3e 状态化两级流场、检查点续接、解析式后备和理论恒星材质已经完成自动验证与低负载 Tauri 技术复验。
- M1.3h 的核心运行链路已经通过低负载 Tauri 抽查；沉浸单侧构图、三级视觉强度、小中大热点和多实体密度仍待用户完整视觉验收。
- RTX 4060 和 Tauri 原生窗口中的最终持续性能。
- 本轮只执行了低负载浏览器检查，未执行新的全屏、录屏或高质量 GPU 压力测试。
- Tauri 原生窗口中 `resolve_agent_galaxy_entities` 对真实活动库新增论文的只读解析。
- 相位呼吸、时间地层和正式 Agent 后端驱动的真实回答状态。

## 当前风险

- 自动静态审计只能证明结构和不变量，不能判断运动是否“高级”；动态视频人工验收仍是 M1.2a 的停止门。
- `gravitational-weave-tech-preview` 的运动语言已经接受，但沉浸版构图、上下文抽取和完整 Agent 状态仍需分阶段验收，不能提前视为最终首页。
- Windows 系统日志记录到两次图形栈蓝屏：`0x10e` 与 `0x116`；第二次同时出现 `nvlddmkm` 错误。现有证据不能证明由本项目 WebGL 代码直接触发，但足以停止自动 GUI/GPU 测试，避免继续扩大设备风险。
- 动态聚焦已经接入按 ID 解析和 24 槽动态语义层；当前风险转为 Tauri 原生运行时尚未验证真实活动库实体。
- 外部原型包含随机位置、随机论文、强加法混合和时间亮度噪声，只能作为视觉参考，不能直接复制为产品运行时。
- `pnpm 11.11.0` 当前无法打开本地 Store 索引数据库；项目 `node_modules` 和本地 `tsc/vite` 可用。本轮不清理、不重装 Store，避免扩大环境变化。

## 下一步

1. 开发 016 与开发 017 均已完整收口；开发 017 的真实 Provider、页码回跳、三种证据作用域、隔离 `FTS + E5` 索引、正常/最大化原生交互及五项用户检查全部通过。后续不再重复 016/017 验收，除非相关代码发生回归性改动。
2. 开发 014-R5 已把英文 3/100 从虚假 20 页/page-limit 纠正为真实 2 页/source-exhausted。下一轮进入结构化来源适配器验证，并只在真实结果足够时补齐 page/facet/rank observed 证据与跨页选择；不得通过重复同一矩阵或伪造 40/100 结果升级门。
3. 014-R5 自动技术门通过后，使用当前已登录会话只做一次窄原生复验：验证至少两页真实候选、跨页选择保持、本地排序 0 新检索 IPC、取消隔离和正常/最大化窗口。若官方页面漂移，只采集一次脱敏签名并停止。
4. 独立 Windows 冒烟宿主已通过；旧 desktop lib harness 只保留历史 `TEST-HOST UNAVAILABLE`，不得再次运行触发弹窗，也不得拿独立宿主 PASS 反向宣称旧 harness 可用。
5. Full 包已实现按需 PP-OCR、ReadingContextScope 与最小片段 Agent 页码引用；Lite 包保持稳定“未安装 OCR”，不运行时下载模型。开发 017 的原生技术门与五项用户主观验收均已通过，不再保留待确认项。
6. P1 保持 `PARTIAL / ADAPTER DEFERRED`；WOS/CNKI/Scopus 正式连接器仍属于 P6。不要用数据库 SSO、个人图书馆或人工官网可访问替代自动连接器验收。
7. 开发 014-R3 历史输入失败和当前输入复验并列保留；如窗口所有权或 WebView 可见性再改动，重新验主 HWND enabled/owner、认证关闭恢复和 hide/show。题录故障通知只在隔离 fixture 验收，禁止通过破坏真实库制造错误。
8. 真实论文库继续 immutable + `query_only`：不重建 V20、不为了验收写库。开发 013 最终定量 trace、P2b-R2 与 F1a 的既有缺口继续独立保留；未经明确授权不暂存、不提交、不推送、不创建 PR、不发布。

## 证据

- [开发 015 文档原生阅读台 R1](./evidence/sidera-015-document-reader-r1-2026-08-09.json)
- [开发 016 全文证据台 R2](./evidence/sidera-016-document-evidence-r2-2026-08-12.json)
- [开发 016-R1 测试宿主、检索真值与全文证据原生收口](./evidence/sidera-016-r1-native-closure-2026-08-12.json)
- [开发 014-R4 任务绑定发现认证与检索真值加固](./evidence/sidera-014-r4-auth-search-truth-2026-08-09.json)
- [开发 014-R3 纯黑浮层、星图状态与题录通知修复](./evidence/sidera-014-r3-visual-truth-and-notice-2026-08-08.json)
- [开发 014 机构资源工作台 R1](./evidence/sidera-014-institution-workspace-r1-2026-08-08.json)
- [开发 013 文献工作台首屏与持续卡顿治理](./evidence/sidera-013-workbench-performance-2026-08-07.json)
- [准备基线 JSON](./evidence/agent-galaxy-flow-baseline-2026-07-27.json)
- [确定性焦点夹具](./evidence/agent-galaxy-focus-fixtures-v1.json)
- [沉浸版准备基线](./evidence/agent-immersive-background-preparation-2026-07-28.json)
- [阶段 1 实现审计](./evidence/agent-galaxy-immersive-stage1-2026-07-28.json)
- [M1.3d 双背景实现与低负载验收](./evidence/agent-dual-background-v2-2026-07-28.json)
- [M1.3e 技术实现与运行时修复](./evidence/agent-m1.3e-technical-2026-07-29.json)
- [M1.3g 外围巡航、恒星 LOD 与 R1 空白修复](./evidence/agent-m1.3g-perimeter-stellar-lod-2026-07-29.json)
- [M1.3g-R2 理论交互与性能修订](./evidence/agent-m1.3g-r2-theory-interaction-2026-07-29.json)
- [M1.3g-R3 自由观察、连续性与热点层级](./evidence/agent-m1.3g-r3-free-look-continuity-hotspots-2026-07-29.json)
- [M1.3g-R5 持续可见性与热点主星修复](./evidence/agent-m1.3g-r5-visibility-hotspots-2026-07-30.json)
- [M1.3g-R6 精确锚点返回与 LOD 交接](./evidence/agent-m1.3g-r6-explore-return-2026-07-30.json)
- [M1.3h 双背景动态语义聚焦闭环](./evidence/agent-m1.3h-dual-semantic-focus-2026-07-30.json)
- [M1.3i Sidera 回答后显式证据聚焦](./evidence/agent-m1.3i-explicit-evidence-focus-2026-07-30.json)
- [M1.3j Sidera 一键直达聚焦与论文恒星近景](./evidence/agent-m1.3j-direct-focus-photosphere-2026-07-31.json)
- [沉浸版保留式改造准备](./AGENT_IMMERSIVE_BACKGROUND_PREPARATION.md)
- [旧审计替换清单](./evidence/agent-galaxy-audit-replacement-v1.md)
- [产品目标](./PROJECT.md)
- [路线图](./ROADMAP.md)
- [架构](./ARCHITECTURE.md)
- [决策](./DECISIONS.md)
- [开发总账](./DEVELOPMENT.md)
- [M1.2a 本地验收材料](../../验收临时/agent-galaxy-flow-m1.2a-20260728/README.md)
