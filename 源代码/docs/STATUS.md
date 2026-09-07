# 科研 Agent 当前状态

## 2026-09-07 beta.3 交付复核（优先于下方历史结论）

基线 HEAD 为 `26cb7d6770516f8536872fd4d9ef2c1cb58d6575`。原 PID 18328 曾被提权 CIM 确认为不响应，随后由既有开发 watcher 的重编译/重启消失；全程未强杀，该消失不计退出 PASS。补丁哈希 `E83206AA787316E11CD011A58E0AA88D609E2DC0DA1344F7BB255BDD08E41575` 已通过空闲、机构三项就绪、认证窗口打开三种正常退出门，固定退出事件链完整，主窗、认证窗、应用进程和机构 WebView 子进程均无残留。R7 同一哈希新进程对照仅恢复数据库 SSO，统一发现一次 10 秒超时、个人图书馆仍需认证，完整跨重启免登录为 `PARTIAL PASS / LIMITATION`。R7 26/26、R4 52/52、R6 16/16、恢复 core 2/2、前端构建、`cargo check --tests -j 2` 与 `cargo check -j 2` 均通过；根 Tauri 测试宿主仍因 `TaskDialogIndirect` 不运行。beta.3 安装包尚待干净提交构建；未提交推送。

证据：[本轮分门记录](./evidence/sidera-beta3-exit-delivery-2026-09-07.json)。

更新时间：2026-08-03

当前分支：`codex/sidera-m2-rag`

M1.3d 基线提交：`63e83d3cd7b49d513df1613dfb42ef01fd1b5ce0`

M1.3e 技术检查点：`ea5c8b843dc94f328caa25e32b358150b38c1518`

M1.3e 文档检查点：`07de19d`

M1.3f 失败归档提交：`220a5c4`

当前 HEAD：`d6e044af8d15fe04039bb1184a71ee5a0b159665`

当前阶段：M2.0b-R4-R3“Agent 长缓存默认与真实首段流式修复”，状态为 `IMPLEMENTED / AUTOMATED TECHNICAL PASS / PRODUCT UNVERIFIED`

原生桌面已完成低负载只读验收：入口、待办空态、历史筛选、既有失败/完成运行、专业页面建议入口及返回 Sidera 为 `PARTIAL PASS`；创建、审批、暂停、恢复、取消等有状态治理操作仍为 `UNVERIFIED`。

提交收口：M2.0a 基线已经收口；M2.0b 与 R1–R4-R3 当前为 `dirty worktree`。用户明确要求本工作包不提交、不推送、不创建 PR、不发布。

当前开发总账：[DEVELOPMENT.md](./DEVELOPMENT.md)

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

1. 等待或由用户明确结束另一项目的 Tauri/Cargo 进程后，执行本项目 `cargo check -j 2`。
2. Cargo 空闲后启动最新 Sidera 桌面开发版，验收冷启动、默认 Agent、背景偏好、自定义标题栏、默认最大化、工作页标题栏和 100%/125%/150% 缩放。
3. 由用户在该 Tauri balanced 窗口继续判断恒星光球质感，并补验热点一键直达、同/跨热点连续“下一颗”、五轮关闭恢复和 `160 / 200 / 240px` 三种近景尺寸。
4. 用户确认一键直达和恒星光球前，M1.3j 产品视觉保持 `UNVERIFIED`；不得恢复 M1.3i 的外围二次按钮或多证据弱亮。
4. 本轮不提交、不推送、不创建 PR、不发布。

## 证据

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
