# 科研 Agent 开发总账

## 2026-09-07 退出顺序补丁与 beta.3 交付准备

已保存 HEAD、原脏工作区清单和关键文件 SHA-256。旧 EXE 哈希为 34A90D4E1C7BB10BD0C414EA159B39BFD420C4A5ADB83AF32582366F504201EF，PID 18328 曾不响应；只读 WCT 无可解释依赖链。新增 windows_wait_chain.ps1 仅检查 Sidera 数字线程等待拓扑，不读进程正文、锁名称或 Cookie。退出顺序补丁哈希 E83206AA787316E11CD011A58E0AA88D609E2DC0DA1344F7BB255BDD08E41575 已在空闲、机构三项就绪、认证窗口打开三种状态正常退出，profile 子进程均释放且未强杀。R7 26/26、R4 52/52、R6 16/16、恢复 core 2/2、前端构建与两项 Rust `-j 2` 检查通过；Full Demo 输出保护 mock 6/6 通过。跨进程对照只恢复数据库 SSO，统一发现一次超时、个人图书馆仍需认证，记录为限制。根 Tauri lib 测试宿主继续不运行，以免重现 TaskDialogIndirect 弹窗；安装包待干净提交构建。

证据：[本轮分门记录](./evidence/sidera-beta3-exit-delivery-2026-09-07.json)。

状态：权威开发过程入口

更新时间：2026-08-03

## 文档职责

- [PROJECT.md](./PROJECT.md)：最终目标、产品边界和最终验收标准。
- [ROADMAP.md](./ROADMAP.md)：阶段顺序、阶段内容和退出门槛。
- [STATUS.md](./STATUS.md)：当前分支、阶段、验证状态、风险和下一步。
- [ARCHITECTURE.md](./ARCHITECTURE.md)：已经实际落地的架构、数据流和接口。
- [DECISIONS.md](./DECISIONS.md)：关键设计与技术决定，以及被取代决定的历史。
- 本文：大型开发工作包的计划、实际过程、偏差、验证证据和提交总账。

详细产品定义与长期蓝图是参考资料，不承担当前状态：

- [RESEARCH_AGENT_PRODUCT_GOAL.md](./RESEARCH_AGENT_PRODUCT_GOAL.md)
- [RESEARCH_AGENT_IMPLEMENTATION_ROADMAP.md](./RESEARCH_AGENT_IMPLEMENTATION_ROADMAP.md)

## 最终目标摘要

将现有科研热点工作站发展为以本地论文证据为基础、可按需联网检索、结果可追溯的科研 Agent。最终默认入口是全屏沉浸式星空中的极简对话空间；理论星图提供真实语义位置和可解释关系；论文库、热点库、报告库与分析工作台由折叠导航或 Agent 调用。

## 阶段事实

| 工作包 | 技术状态 | 产品视觉状态 | 结论 |
| --- | --- | --- | --- |
| M1.3c 理论坐标 + 沉浸外壳 | PASS | FAIL | 技术资产保留，产品路径归档 |
| M1.3d 独立沉浸/理论双背景 | PASS | FAIL | 空间边界正确，流动与理论恒星材质未通过 |
| M1.3e 沉浸流动与理论恒星材质修订 | PASS | UNVERIFIED | 技术闭环完成，等待修复后桌面复验和用户视觉确认 |
| M1.3f Agent 理论纵深与深空层次 | PASS | FAIL | 技术审计通过，默认视觉仍是二维圆片散点图，归档 |
| M1.3g-R2 理论可见度、Explore 与性能修订 | PASS | FAIL | 屏幕 LOD 和热路径治理通过自动验证，固定中心、返回末跳与热点层级未通过用户验收 |
| M1.3g-R3 自由观察、连续巡航与热点层级 | PASS（自动技术） | FAIL | 用户复验确认拖拽补星冻结、长时跳动、退出多次跃迁和热点圆片问题 |
| M1.3g-R4 实时视野、连续安全壳、原子返回与热点 PSF | PASS（自动技术） | FAIL | 用户确认热点全部不可辨认，Explore 返回后巡航可进入完全黑屏 |
| M1.3g / R10 外围巡航与单一接管 | PASS | PASS | 用户实机确认修复完成，整体双背景效果获认可 |
| M1.3h 双背景动态语义聚焦闭环 | PASS（可复用基础设施） | FAIL / SUPERSEDED | 自动操控背景与上下文凝聚不采用；解析、动态槽、双背景协调和 R10 返回保留 |
| M1.3i Sidera 回答后显式证据聚焦 | PASS（技术资产） | FAIL / SUPERSEDED | 两段式理论聚焦、异步压暗/移动、关闭布局和灰色数据球被用户否决 |
| M1.3j 一键直达聚焦与论文恒星近景 | PASS（前端与 Tauri 低负载；Cargo 延后） | UNVERIFIED | 一键路由、关闭与换项已实机复验；恒星材质等待用户视觉确认 |
| M1.3k Sidera 桌面产品壳、启动页与默认入口 | PASS（前端/审计/原生启动） | UNVERIFIED | Sidera 原生窗口已低并发编译并置于前台；窗口交互与启动节奏等待用户验收，不改变 M1.3j 视觉结论 |
| M1.3l 双沉浸样式与流动知识星河 | PASS（自动与 Tauri 低负载） | PASS | 用户实机确认效果不错；流动星河主视觉通过 |
| M1.3l-R1 全局星空导航壳 | PASS（自动与 Tauri 热更新检查） | UNVERIFIED | 移除 Agent 标题栏、遮罩和抽屉实体底板；等待用户复验 |
| M2.0b Pi 本地论文轻量混合 RAG | PASS（自动技术） | FAIL | 检索与多轮有效；真实会话暴露消息编排、Markdown、库概况和证据收口缺陷 |
| M2.0b-R1 对话编排、阅读面板与证据闭环 | PASS（自动技术） | UNVERIFIED | 统一轮次、Markdown、阅读面板、库概况与证据完成门已实现；等待真实桌面三轮验收 |
| M2.0b-R2 对话控件与空间构图连续性 | PASS（自动技术，含投影连续性与物理中心回归） | UNVERIFIED | 输入控件统一居中；展示星图恢复物理画布中心，论文轨道避让由 Journey 锚点负责，等待真实桌面复验 |
| M2.0b-R3 对话体验收口 | PASS（自动技术） | UNVERIFIED | 空会话底部输入、首发固定阅读面板、无背景用户消息、自增高输入和提示生命周期已实现；等待原生视觉验收 |
| M2.0b-R4 Agent 会话、工具能力与 Liquid Glass 收口 | PASS（自动技术） | FAIL / SUPERSEDED | 原生验收发现 SQL 拼接令会话库残缺且 Agent 无法对话；由 R4-R1 修复 |
| M2.0b-R4-R1 Agent 会话存储与诊断修复 | PASS（自动技术，Rust 用例真实执行） | PARTIAL PASS / UNVERIFIED | 实际残缺库原地恢复、原生窗口和检测入口通过；三项结果、真实首发与历史 CRUD 待验收 |
| M2.0b-R4-R2 Agent 后台连续性与清透光学玻璃修复 | PASS（自动技术） | UNVERIFIED | 普通导航不再中止回答，标题栏状态与清透连续玻璃已实现；等待真实后台回答、审批和视觉验收 |
| M2.0b-R4-R3 Agent 长缓存默认与真实首段流式修复 | PASS（自动技术） | UNVERIFIED | `long`默认与一次性迁移、首字流式、工具旁白撤回和证据替换已实现；等待真实 Provider缓存与流式体验验收 |

## 当前工作包：M2.0b-R4-R3 Agent 长缓存默认与真实首段流式修复

### 1. 工作包

- 日期：2026-08-03
- 分支：`codex/sidera-m2-rag`
- 基线提交：`d6e044af8d15fe04039bb1184a71ee5a0b159665`
- 工作树：`dirty worktree`；保留全部既有修改、未跟踪证据和旧 build artifact，不重置、不清理、不提交、不推送、不创建 PR、不发布。
- 状态：`IMPLEMENTED / AUTOMATED TECHNICAL PASS / PRODUCT UNVERIFIED`
- 目标：将缓存默认策略升级为 `long`并对旧设置执行一次性迁移，同时取消首段 512 字节缓冲，让普通回答从第一个文本增量真实流式显示而不泄漏工具过程旁白。

### 2. 计划步骤与完成条件

| 步骤 | 内容 | 完成条件 | 状态 |
| --- | --- | --- | --- |
| 1 | 缓存默认与迁移 | 新项目/缺失/旧备份为 long；旧 auto 一次性迁移；v2 显式 auto 持久保留 | PASS |
| 2 | 首段流式状态机 | 首个 delta 立即可见；无 512 字节阈值；停止保留可见文本 | PASS |
| 3 | 工具与证据显示门 | toolcall_start 撤回前言并隐藏旁白；系统工具和 RAG 按各自完成门释放 | PASS |
| 4 | 接口与错误 | assistant-replace 精确隔离并立即检查点；长缓存拒绝不降级、不重放 | PASS |
| 5 | 回归与文档 | TypeScript、Vite、Rust、harness、R1–R4-R3、文档和差异检查 | PASS |
| 6 | 真实 Provider与原生体验 | 缓存用量、首字流式、工具旁白和跨页连续性由用户验收 | UNVERIFIED |

### 3. 实际开发日志

- 2026-08-03：新增纯 `sideraCachePolicy`解析器和策略 v2 标记。默认设置改为 `long`；数据库启动迁移以游标遍历全部项目，未标记的 `auto`、`long`或缺失值原地升级为 `long`，已标记的显式 `auto`保持不变。统一备份解析器复用相同规则。
- 2026-08-03：设置选项改为“长缓存（默认，推荐）”和“兼容模式（上游不支持长缓存时使用）”。Pi 运行时识别明确的长缓存参数拒绝并返回安全持久错误，禁止静默改为 `auto`或自动重放请求。
- 2026-08-03：删除 `TEXT_DECISION_BUFFER_BYTES=512`和 pending text 累积。新增 Tauri-free `SideraStreamGate`：直接正文从首个 delta 发送，工具开始转入隐藏态，系统工具结束与 RAG 完成门分别释放下一阶段正文。
- 2026-08-03：新增 `assistant-replace`事件。前端按 session、message、revision、sequence 精确替换并立即强制检查点；普通 delta 保持 500ms 检查点。停止普通回答保留可见部分，证据失败替换为固定说明，工具隐藏文本不在终态补发。
- 2026-08-03：`toolcall_start`只参与显示门；工具执行仍由 `tool_execution_start`白名单、nonce、epoch、revision、`toolCallId`和审批哈希校验。论文、会话和 Pi JSONL存储协议未改变。

### 4. 测试与证据

- TypeScript：`PASS`（`node_modules\.bin\tsc.CMD -b --pretty false`）。
- Vite：`PASS`（Vite 6.4.3，1916 modules；仅既有 Tauri event 分块提示）。
- Rust：`cargo check --manifest-path src-tauri/Cargo.toml -j 2`为 `PASS`；会话与流式 harness 8/8为 `PASS`。
- Windows harness 生成物检查：`TaskDialogIndirect / comctl32.dll / tauri_plugin_dialog / rfd`匹配数为 0。
- R4-R3、R4-R2、R4-R1、R4、R3、R2、R1、双背景与 Pi 基础 RPC：`PASS`；Provider 调用数为 0。
- 证据：[sidera-m2.0b-r4-r3-cache-default-true-streaming-2026-08-03.json](./evidence/sidera-m2.0b-r4-r3-cache-default-true-streaming-2026-08-03.json)

### 5. 当前进度与偏差

- 用户当前项目已手动使用 `long`并观察到后续轮次可正常缓存；本轮自动验证只证明默认、迁移、环境映射和错误边界，不将该观察扩展为所有供应商都支持长缓存。
- 旧 512 字节缓冲用于等待“是否即将出现工具调用”，因此普通短回答会在积累后一次出现。新状态机以 Pi 事件语义替代字节猜测：普通正文立即显示，若随后进入工具调用则精确撤回该阶段未核验前言。

### 6. 原生验收与遗留

- 升级后确认所有旧未标记 `auto`项目显示为 `long`；手动切回兼容模式后保存、重启和新版备份恢复仍保持 `auto`。
- 使用用户授权的真实 Provider验证：首次建立缓存允许 `cacheRead=0`，后续轮次应在 UI与上游记录中出现一致的缓存数据；上游拒绝时只显示持久错误，不自动重发。
- 短回答和长回答从首字连续流式；工具前言如出现会撤回，过程旁白不可见，工具后最终回答继续流式。回答中跨页面导航仍不中止。
- 用户完成真实 Provider与原生体验确认前保持 `PRODUCT UNVERIFIED`。

### 7. 提交

- 当前无 R4-R3 提交；不提交、不推送、不创建 PR、不发布。

## M2.0b-R4-R2 Agent 后台连续性与清透光学玻璃修复

### 1. 工作包

- 日期：2026-08-02
- 分支：`codex/sidera-m2-rag`
- 基线提交：`d6e044af8d15fe04039bb1184a71ee5a0b159665`
- 工作树：`dirty worktree`；保留全部既有修改、未跟踪证据和旧 build artifact，不提交、不推送、不创建 PR、不发布。
- 状态：`IMPLEMENTED / AUTOMATED TECHNICAL PASS / PRODUCT UNVERIFIED`
- 目标：让普通导航后的 Agent 回答在后台连续运行，提供全局可见状态，固定 Windows 会话测试入口，并以清透光学玻璃取代灰黑磨砂面板。

### 2. 计划步骤与完成条件

| 步骤 | 内容 | 完成条件 | 状态 |
| --- | --- | --- | --- |
| 1 | 后台连续性 | 普通 activeView 变化不 abort；明确停止与项目/配置/会话变更仍受控 | PASS（自动）/ Tauri UNVERIFIED |
| 2 | 标题栏状态 | 运行、审批、完成、失败状态跨页面可见且不直接批准工具 | PASS（自动）/ 视觉 UNVERIFIED |
| 3 | 测试入口 | lib `test=false`、唯一 harness 脚本、生成物禁用导入为零 | PASS |
| 4 | 光学玻璃 | 清透外壳、连续烟熏阅读层、无大灰斑和嵌套回答卡 | PASS（实现）/ 视觉 UNVERIFIED |
| 5 | 回归与文档 | TypeScript、Vite、Rust、R1–R4-R2、文档和 diff | PASS |

### 3. 实际开发日志

- 2026-08-02：确认根级 `activeView` effect 会在任何非 Agent 页面调用 `abortSideraPiTurn`；背景页本身持续挂载，Pi 事件监听和检查点均属于 App，因此停止是可移除的产品策略而非技术限制。
- 2026-08-02：删除导航 abort effect，新增活动状态解析和标题栏状态条。等待审批优先于生成状态；批准/拒绝仍只能回到 Agent 审批卡。后台完成 3 秒结束，后台运行错误进入持久全局提示。
- 2026-08-02：项目切换、创建并切换项目、删除当前项目以及影响 Pi 的设置保存现在复用现有 abort-and-wait 确认门；普通页面导航不触发该门。
- 2026-08-02：共享材质调整为 18px blur、115% saturation、34%外壳和 58%连续烟熏阅读层。对话框/抽屉圆角为 26/24px，输入槽与折叠态为 15px；删除大范围左上径向光和逐回答背景、边框及阴影。
- 2026-08-02：新增唯一会话测试脚本和 R4-R2 专项；主 lib 继续 `test=false`，没有删除截图所示旧测试 EXE。

### 4. 测试与证据

- TypeScript：`PASS`（`node_modules\.bin\tsc.CMD -b --pretty false`）。
- Vite：`PASS`（Vite 6.4.3，1915 modules；仅既有 Tauri event 分块提示）。
- Rust：`cargo check -j 2`为 `PASS`；会话 harness 4/4 为 `PASS`，生成物 `TaskDialogIndirect / comctl32.dll / tauri_plugin_dialog / rfd`匹配数 0。
- R4-R2、R4-R1、R4、R3、R2、R1、双背景、Pi、科研星图 R3、热点过渡、项目文档和差异回归：`PASS`；Provider 调用 0。
- 证据：[sidera-m2.0b-r4-r2-background-continuity-optical-glass-2026-08-02.json](./evidence/sidera-m2.0b-r4-r2-background-continuity-optical-glass-2026-08-02.json)

### 5. 当前进度与偏差

- 截图中的 Vite `text-ink/78`错误已由有效类替换并以生产构建复验；旧 `research_hotspots_desktop_lib-*.exe`仍是保留的历史 build artifact。标准项目命令不会再生成或执行主 lib test，只运行无 Tauri harness。
- 原 R4 的“深色 Liquid Glass”被用户视觉否决；D-127 的静态、无 WebGL与无障碍边界继续有效，但高不透明外壳和逐回答烟熏卡片由清透连续材质取代。

### 6. 原生验收与遗留

- 真实 Provider回答中依次前往文献、热点、星图、设置和运行中心，确认流式内容、上下文和检查点不停止；返回后保持同一轮次。
- 标题栏状态与科研星图工具并存，等待审批可返回处理但不得在其他页面直接批准；项目/配置/会话变更仍能停止且不会串线。
- 正常/最大化窗口及 1100/1360/1920px、100%/125%/150% 检查清透材质、星点穿透、长文本对比度和降级样式。用户确认前保持 `PRODUCT UNVERIFIED`。

### 7. 提交

- 当前无 R4-R2 提交；不提交、不推送、不创建 PR、不发布。

## M2.0b-R4-R1 Agent 会话存储与诊断修复

### 1. 工作包

- 日期：2026-08-02
- 分支：`codex/sidera-m2-rag`
- 基线提交：`d6e044af8d15fe04039bb1184a71ee5a0b159665`
- 工作树：`dirty worktree`；保留全部 R2–R4 修改和未跟踪证据，不提交、不推送、不创建 PR、不发布。
- 状态：`IMPLEMENTED / AUTOMATED TECHNICAL PASS / PRODUCT UNVERIFIED`
- 目标：修复 R4 会话 Schema SQL 拼接与残缺库恢复，拆分 Provider/存储/Pi readiness，并让 Windows Rust 会话测试真实运行。

### 2. 计划步骤与完成条件

| 步骤 | 内容 | 完成条件 | 状态 |
| --- | --- | --- | --- |
| 1 | Schema 与语句 | 独立 SQL 文件；无吞空格续行；事务创建与验证 | PASS |
| 2 | v0 原地恢复 | 兼容部分库补全、已有行保留、不兼容结构拒绝 | PASS（Rust）/ Tauri UNVERIFIED |
| 3 | Agent readiness | Provider、会话存储、Pi 运行时分别展示，三项通过才可对话 | PASS（自动）/ 桌面 UNVERIFIED |
| 4 | Windows 测试 | SQLite 用例真实执行，测试 EXE 不导入 TaskDialog/rfd | PASS |
| 5 | 回归与文档 | TypeScript、Vite、Rust、R1–R4、文档与 diff | PASS |

### 3. 实际开发日志

- 2026-08-02：确认截图中的长 SQLite 错误来自 Rust `\`跨行字符串删除换行且未保留空格，生成 `updatedON`、`DESC);CREATE`等非法 SQL；Provider 设置检测此前完全不触及会话存储，因此会出现“连接正常但 Agent 不可用”。
- 2026-08-02：新增 `sidera_conversations_schema.sql`，将三张表、两项索引和级联外键固定为可审计 v1 DDL；会话模块所有 SELECT/INSERT/UPDATE/UPSERT 改为原始多行字符串。
- 2026-08-02：`open_store_with_recovery()`分为 PRAGMA 预备与事务 Schema 两阶段。现有兼容 v0 表先验证必要列，再幂等补齐；完整验证通过后才提交并写 `user_version=1`。更高版本或不兼容列返回 `SIDERA_CONVERSATION_SCHEMA_INCOMPATIBLE`，不会删除数据库。
- 2026-08-02：新增 `sidera_agent_local_readiness`，会话存储报告 `pass / repaired / fail`、版本和会话数；Pi 预检锁定 0.82.1 入口、扩展协议标记、Node 与必要本地路径。设置页保留原 Provider 请求并把三项结果并列显示。
- 2026-08-02：错误表面增加安全码映射；对话框不再渲染完整 SQL，设置诊断的失败项使用可展开技术详情。
- 2026-08-02：`tauri-plugin-dialog`改为默认启用的可选 `desktop-dialog`特性，测试配置排除插件初始化。由于 `tauri-runtime-wry`本身也引用 Common Controls，主 crate 测试路径补充 v6 清单；最终会话用例由无 Tauri 依赖的 workspace harness 直接编译同一存储源文件，彻底消除测试 EXE 的 TaskDialog/rfd 导入。

### 4. 测试与证据

- TypeScript：`PASS`（`node_modules\.bin\tsc.CMD -b --pretty false`）。
- Vite：`PASS`（Vite 6.4.3，1915 modules；仅既有 Tauri event 分块提示）。
- Rust 默认桌面增量：`PASS`（`cargo check --manifest-path src-tauri/Cargo.toml -j 2`）。
- Rust 会话测试：`PASS`（4/4，0.11s）；覆盖不兼容拒绝、残缺 v0 原地补全和行保留、完整生命周期/搜索/归档恢复/中断/级联删除、跨项目隔离。
- 测试 EXE 静态检查：`PASS`；`TaskDialogIndirect / comctl32.dll / tauri_plugin_dialog / rfd`匹配数 0。
- R4-R1、R4、R3、R2、R1、双背景、科研星图、热点过渡和 Pi 无 Provider RPC：`PASS`；Provider 调用 0。
- 原生 Tauri：`PARTIAL PASS`；真实残缺库已原地恢复、原行保留、可见窗口和“检测 Agent”入口通过。真实 Provider与完整会话 CRUD：`UNVERIFIED`。
- 证据：[sidera-m2.0b-r4-r1-conversation-store-readiness-2026-08-02.json](./evidence/sidera-m2.0b-r4-r1-conversation-store-readiness-2026-08-02.json)

### 5. 当前进度与偏差

- R4 原生结果已从 `UNVERIFIED`更正为 `PRODUCT FAIL / SUPERSEDED`；R4-R1 自动技术闭环为 `PASS`，但不会用自动结果替代原有残缺库和真实 Provider 的桌面验收。
- 原计划把入口错误完全归因于 `tauri-plugin-dialog/rfd`。实际二次核查发现 Tauri 的 `tauri-runtime-wry`也直接引用 `TaskDialogIndirect`；因此同时保留测试清单，并以无 Tauri 会话 harness 满足“测试 EXE 不导入”要求。
- readiness 的 Pi 项只验证本地运行条件，不启动付费请求；Provider 项仍沿用显式用户按钮触发的现有连接测试。

### 6. 原生验收与遗留

- 已在不删除原 `conversations-v1.sqlite`的条件下启动最新可见 Tauri：实库从 `user_version=0`补全为 v1，三表、两索引和 `turns`级联外键完整，原 1 条会话保留；未再出现 Windows 入口弹窗。
- 设置页确认 Provider、会话存储、Pi 运行时三项与整体结论一致；故障详情可展开但不污染对话面板。
- 重启并验证最近会话、历史搜索、重命名、归档、恢复和归档区删除；真实 Provider 验收前产品保持 `UNVERIFIED`。

### 7. 提交

- 当前无 R4-R1 提交；不提交、不推送、不创建 PR、不发布。

## M2.0b-R4 Agent 会话、工具能力与 Liquid Glass 收口

### 1. 工作包

- 日期：2026-08-02
- 分支：`codex/sidera-m2-rag`
- 基线提交：`d6e044af8d15fe04039bb1184a71ee5a0b159665`
- 工作树：`dirty worktree`；完整保留 M2.0b、R1–R3 的既有修改和未跟踪证据，本轮不提交、不推送、不创建 PR、不发布。
- 状态：`AUTOMATED TECHNICAL PASS / PRODUCT FAIL / SUPERSEDED BY M2.0b-R4-R1`
- 目标：连续完成持久化会话、历史交互、Rust 托管的 Pi 文件/HTTPS/Shell 工具与缓存统计，并将固定阅读工作区打磨为有降级路径的深色 Liquid Glass。

### 2. 计划步骤与完成条件

| 步骤 | 内容 | 完成条件 | 状态 |
| --- | --- | --- | --- |
| 1 | 会话持久化 | 独立 SQLite、项目级 Pi JSONL、最近会话恢复、500ms 检查点和中断标记 | PASS（自动）/ Tauri UNVERIFIED |
| 2 | 历史交互 | 新建、打开、搜索、重命名、归档/恢复/删除及生成中终止门 | PASS（自动）/ Tauri UNVERIFIED |
| 3 | 工具与缓存 | 只读文件/HTTPS、一次性变更审批、Shell 环境清除、auto/long 和统计 | PASS（源码/协议）/ 真实 Provider UNVERIFIED |
| 4 | Liquid Glass | 宽屏组合居中、窄屏覆盖、静态玻璃变量、可读正文与无透明降级 | PASS（自动）/ 视觉 UNVERIFIED |
| 5 | 验证与文档 | TypeScript、Vite、Rust 增量、R4 与 R1–R3 回归、文档和差异检查 | PASS；Rust test harness BLOCKED |

### 3. 实际开发日志

- 2026-08-02：新增 `sidera_conversations.rs`。存储根固定为用户所选论文库的 `Sidera/`，SQLite 使用 WAL、外键和 `user_version=1`；`conversations / turns / project_state`不修改论文库 Schema。首条问题本地生成标题，活动、归档、恢复和归档区删除均按项目隔离。
- 2026-08-02：Pi 启动删除 `--no-session`，改用 `--session-dir <Sidera/pi-sessions/project-hash>`与`--session-id <conversation-id>`。SQLite 保留完整 UI 历史，Pi 继续拥有原生 JSONL 和自动压缩；缺失 JSONL 的非空历史只读展示并标记上下文不可恢复。
- 2026-08-02：根级 App 在提交 Provider 前先落库；流式 delta 与工具阶段以 500ms 合并检查点保存，完成、失败和取消强制检查点。初始化会把遗留 `streaming`轮次改为`interrupted`。切换、新建或归档当前生成会话时，先二次确认、发出 abort、等待 `turn-cancelled/runtime-error`终止事件，再冲刷检查点并切换；不自动重试。
- 2026-08-02：固定阅读面板标题栏增加历史、新对话和收起；折叠输入条保留历史入口。抽屉支持标题搜索、活动/归档、重命名、归档、恢复和永久删除。宽屏对话框按 `(drawer + 16px) / 2`右移，抽屉按 `(dialog + 16px) / 2`左移，使组合外缘中心等于屏幕中心；小于 960px 时取消对话位移并覆盖展示抽屉。
- 2026-08-02：Pi 继续关闭内置工具和通用发现，只加载会话专用扩展。Rust 桥新增目录列表、文本读取、文件名搜索、HTTPS GET、写入、精确编辑、删除和 PowerShell；前三项文件只读及 HTTPS 直接执行，所有写/改/删/Shell 均暂停在审批卡。审批 ID 绑定 session、message、tool、toolCallId 与参数哈希，批准后即消费；过期 epoch/revision 或迟到调用拒绝。
- 2026-08-02：PowerShell 使用 `env_clear()`，只恢复 Windows 运行和代理所需白名单变量；API Key、Token、Cookie、密码和私钥不继承。stdout/stderr 分流读取并分别设上限，最长 120 秒；超时或用户中止当前轮次都会终止正在运行的已审批 Shell。结构化读取和 HTTPS 也设单次体积上限，HTTPS 重定向不允许降级到明文协议。
- 2026-08-02：设置新增 `sideraCacheRetention=auto|long`。`auto`省略环境覆盖，`long`只在下次新建/重新打开进程时设置 `PI_CACHE_RETENTION=long`；任何 Provider 错误保持为持久错误，不静默重发。Pi 原生 `get_session_stats`映射为输入、输出、cacheRead/cacheWrite、成本与上下文百分比。
- 2026-08-02：完整工作区使用共享玻璃变量：28px blur、深色半透明填充、顶部/左侧静态高光、细白边和多层柔和阴影；助手正文改为高不透明烟熏玻璃，用户消息继续无背景。没有增加 WebGL、动态噪声或逐帧动画，CSS 提供 reduced motion、reduced transparency、prefers contrast、forced colors 和不支持 backdrop-filter 的纯色退路。

### 4. 测试与证据

- TypeScript：`PASS`（`node_modules\.bin\tsc.CMD -b --pretty false`）。
- Vite 生产构建：`PASS`（Vite 6.4.3，1915 modules；仅既有 Tauri event 动态/静态导入提示）。
- Rust 增量检查：`PASS`（`cargo check --manifest-path src-tauri/Cargo.toml -j 2`）。
- `audit:sidera-agent-conversation-r4`：`PASS`；覆盖会话 schema、Pi session 参数、工具注册、审批绑定、环境清除、缓存策略、统计字段、组合居中公式与玻璃降级。
- R3 对话、R1 会话证据、R2 空间构图和 Pi 基础 RPC：`PASS`；基础 RPC 使用无效示例端点，仅执行 `get_state`，Provider 调用为 0。
- Rust 定向会话测试：`BLOCKED`。测试目标完成编译，但本机 `research_hotspots_desktop_lib`测试可执行文件在测试框架输出前持续挂起并由 120 秒门终止；与 R1 已记录的 Windows test harness 环境问题一致，不将其冒充 `PASS`。
- 原生 Tauri、真实 Provider、缓存对照和用户视觉：`UNVERIFIED`。
- 证据：[sidera-m2.0b-r4-agent-conversations-tools-liquid-glass-2026-08-02.json](./evidence/sidera-m2.0b-r4-agent-conversations-tools-liquid-glass-2026-08-02.json)

### 5. 当前进度与偏差

- 四阶段实现已落地，自动技术结论为 `PASS`；测试框架自身的独立环境阻塞保留为 `BLOCKED`，不覆盖 TypeScript、Vite、Rust 编译和专项协议审计。
- 会话恢复通过 Pi CLI 的原生 session manager（`--session-dir / --session-id`）创建或打开对应 JSONL；当前会话切换为了强终止隔离而重启受控 Pi 进程，没有在同一进程内调用 `switch_session/new_session`。上下文连续性由同一原生 JSONL 保持，React 不访问 RPC 或 JSONL。
- `long`只表达 Pi 原生长缓存偏好；供应商是否真的产生缓存必须以真实 Provider UI 与上游用量记录共同验收，零值不推断供应商行为。

### 6. 原生验收与遗留

- 重启程序与切换项目后检查最近会话恢复；逐项验证新建、切换、重命名、归档、恢复和归档区永久删除，以及缺失 Pi JSONL 的只读历史。
- 连续五轮发送、收起、开关历史和切换会话；宽屏确认组合外缘中心，低于 960px 确认抽屉覆盖，正常/最大化与 100%/125%/150% 缩放均无末帧跳变。
- 用安全临时文件验证读取直接执行、写/改/删/Shell 必须审批、拒绝不执行、批准只生效一次；不以真实用户文件作为删除验收对象。
- 用户明确授权后再用真实 Provider 对照上下文连续性、自动压缩、`auto/long`与上游缓存用量；未验收前产品保持 `UNVERIFIED`。

### 7. 提交

- 当前无 R4 提交；不提交、不推送、不创建 PR、不发布。

## M2.0b-R3 对话体验收口

### 1. 工作包

- 日期：2026-08-02
- 分支：`codex/sidera-m2-rag`
- 基线提交：`d6e044af8d15fe04039bb1184a71ee5a0b159665`
- 工作树：`dirty worktree`；完整保留 M2.0b、R1、R2 的既有修改和未跟踪证据，本轮不提交、不推送、不创建 PR、不发布。
- 状态：`IMPLEMENTED / AUTOMATED TECHNICAL PASS / PRODUCT UNVERIFIED`
- 目标：把 Agent 对话统一为“初始底部输入条 → 首次有效提交后固定大阅读面板”，并收口消息表面、输入对齐和全局提示生命周期。

### 2. 计划步骤与完成条件

| 步骤 | 内容 | 完成条件 | 状态 |
| --- | --- | --- | --- |
| 1 | 单一面板状态 | 空会话折叠；首次有效提交和收起后的再次提交立即展开；只保留固定阅读尺寸 | PASS（自动）/ Tauri UNVERIFIED |
| 2 | 消息与输入 | 用户消息无背景/边框/阴影；textarea 42–100px 只向上增长且按钮居中 | PASS（自动）/ Tauri UNVERIFIED |
| 3 | 提示生命周期 | ID 隔离计时器；success/info 3 秒；error 保持并可关闭 | PASS（自动）/ Tauri UNVERIFIED |
| 4 | 回归与文档 | R3、R1、R2、双背景、星图、项目文档和差异检查通过 | PASS |
| 5 | 原生验收 | 多宽度/缩放、五轮收起与发送、提示生命周期均通过 | UNVERIFIED |

### 3. 实际开发日志

- 2026-08-02：用户锁定“大面板”为既有 reading 尺寸，不做全屏；保留收起/恢复，但删除 compact/reading 双按钮、自由缩放手柄和布局偏好类型/读写。旧 `research-agent:sidera-dialog-layout:v1`数据不读取也不主动删除。
- 2026-08-02：`dialogCollapsed` 在无轮次时默认开启；`submitPrompt()`只在草稿有效且未生成时执行，并在 Provider 回调前先 `setDialogCollapsed(false)`，因此首轮失败也会在大面板中展示。
- 2026-08-02：用户消息表面移除渐变、右边框、阴影和气泡底色。textarea 固定 `rows=1`，使用 42px 基线、20px 行高和 11px 上下内边距；按 `scrollHeight`增长至 100px后内部滚动，草稿清空后恢复 42px。
- 2026-08-02：折叠、理论 Explore 和返回过程的输入条统一改为底部锚定；返回时间线同步插值 top 与 translateY，避免多行草稿向下越出窗口。
- 2026-08-02：根级 `notice`由字符串升级为含唯一 ID 与 `success / info / error`的消息对象。success/info 创建 3 秒计时器，error 不创建计时器；替换消息会清理旧计时器，回调只在 ID 仍匹配时关闭。提示增加 `status/alert`、live region 和键盘关闭语义。
- 2026-08-02：R1 会话专项移除旧多布局断言；新增 `audit:sidera-agent-conversation-ui-r3`，并同步 R2 的 42px/11px/20px 输入基准。双背景审计中“后端未接入”的历史断言更新为当前 Pi 本地证据边界。

### 4. 测试与证据

- TypeScript：`PASS`（项目内 `node_modules\\.bin\\tsc.CMD -b`）。
- Vite 生产构建：`PASS`。
- `audit:sidera-agent-conversation-ui-r3`：`PASS`。
- `audit:sidera-pi-conversation-r1`：`PASS`。
- `audit:sidera-spatial-composition-r2`：`PASS`。
- Agent 双背景源码审计、科研星图 R3、热点过渡和项目文档审计：`PASS`。
- `git diff --check`：`PASS`。
- 付费 Provider 调用：`NOT RUN（按边界）`。
- 原生 Tauri 与用户视觉：`UNVERIFIED`。
- 证据：[sidera-m2.0b-r3-conversation-experience-2026-08-02.json](./evidence/sidera-m2.0b-r3-conversation-experience-2026-08-02.json)

### 5. 当前进度

- 实现与低负载自动验证已经完成，自动技术状态为 `PASS`。
- 产品状态保持 `UNVERIFIED`；浏览器/源码审计不能替代原生 Tauri 和用户视觉结论。

### 6. 边界与遗留

- 本工作包不增加新对话、历史持久化、联网或 Provider 缓存架构；这些能力在下一工作包单独设计和验收。
- 需要用户在 1100/1360/1920px 与 100%/125%/150% 缩放检查初始输入条、首次发送、收起后再发送、多行增长、无背景用户消息、无尺寸按钮/手柄和提示关闭。
- 需要连续五轮收起/发送，并在正常窗口和最大化窗口各检查一次；错误提示需通过真实错误或安全夹具确认保持和可关闭。
- 当前无本工作包提交；不提交、不推送、不创建 PR、不发布。

## M2.0b-R2 对话控件与空间构图连续性

### 1. 工作包

- 日期：2026-08-02
- 分支：`codex/sidera-m2-rag`
- 基线提交：`d6e044af8d15fe04039bb1184a71ee5a0b159665`
- 工作树：`dirty worktree`；保留 M2.0b/R1 和视觉主线全部既有修改，本轮不提交、不推送、不创建 PR、不发布。
- 状态：`IMPLEMENTED / AUTOMATED TECHNICAL PASS / PRODUCT UNVERIFIED`
- 目标：修复输入栏按钮偏心、宽对话框聚焦安全距离，以及科研星图详情轨道过窄、飞近预平移和返回末端跃迁。

### 2. 计划步骤与完成条件

| 步骤 | 内容 | 完成条件 | 状态 |
| --- | --- | --- | --- |
| 1 | 输入控件统一基线 | 42px 控制高度、30px 按钮在所有布局中中心误差不超过 1px | PASS（自动）/ Tauri UNVERIFIED |
| 2 | Agent 动态聚焦构图 | 实测面板边界生成固定侧别、160–240px 目标和 40–64px 间距 | PASS（自动）/ Tauri UNVERIFIED |
| 3 | 科研星图轨道分档 | 热点、摘要、阅读使用锁定宽度且窄窗口不溢出 | PASS（自动）/ Tauri 热点轨道冒烟 PASS |
| 4 | 单一空间时间线 | 空闲星系保持物理中心，飞近/返回只连续推进论文锚点和相机，无预平移或额外 fit | PASS（运行级回归）/ TAURI UNVERIFIED |
| 5 | 自动与桌面验收 | 类型、构建、专项、文档通过；五轮桌面往返通过 | AUTOMATED PASS / TAURI PARTIAL PASS / PAPER JOURNEY RE-TEST REQUIRED |

### 3. 实际开发日志

- 2026-08-02：用户实机截图确认输入栏两侧按钮再次偏离高度中心，阅读宽面板下论文近景侵入对话区域，科研星图论文阅读轨道偏窄且飞近和返回存在分段横移。
- 2026-08-02：输入区移除底部对齐和多布局独立偏移；composer、textarea 与两侧 30px 按钮统一使用 42px 控制基准。
- 2026-08-02：新增 `SideraFocusComposition` 与解析器。正式 Agent 页面以 `ResizeObserver` 读取真实边界并保持轮播侧别，沉浸与理论背景改用相同 `normalizedAnchorX / targetDiameterPx`。
- 2026-08-02：科研星图上下文轨道改为三档宽度；投影偏移由实际轨道宽度和 24px 间隔计算。研究星图论文 Journey 取消 acquisition，`focusBlend` 同步驱动视口构图和距离接近，返回沿同一进度收敛至热点轨道。
- 2026-08-02：新增 `audit:sidera-spatial-composition-r2`，检查输入基准、Agent 安全区、轨道分档、固定偏移删除和 Journey 进度所有权。
- 2026-08-02：用户实机确认科研星图出现软锁：画面已经是热点总览，但外层仍处于 `system`，因此热点不可点击、进入命令无效且右侧轨道不显示。该状态由开发期 Fast Refresh/场景重建只重置 Canvas 内部运行时、未同步外层 React 状态导致。
- 2026-08-02：Canvas 运行时初始化后立即向外层发布 `overview`，使工具栏、热点拾取和上下文轨道与真实 Three.js 状态一致。低负载原生复核已完成点击 `Health Mental Care`、右侧轨道展开、进入热点星系和返回总览。
- 2026-08-02：用户继续实机确认论文靠近会先横移，返回时星系先停在左侧再突然居中。只读诊断确认 `worldPosition.project(camera)`记录了右栏 `setViewOffset` 后的 NDC，而 Journey 只用 `fov/aspect/zoom/up` 重建相机四元数；同一右栏偏移因此被相机姿态和渲染投影重复消费。
- 2026-08-02：论文起始锚点改由 Journey 规范投影计算，返回反向路径恢复到同一规范坐标；锚点误差诊断单独加入实际右栏偏移。1920px 论文摘要轨道运行夹具验证旧约 `11.80°` 首帧/返回终点误差均降为 `0°`，位置误差为 `0`。
- 2026-08-02：用户复核指出连续返回后星系仍停留在左侧，展示星图的视觉中心不再对应星系中心。只读诊断确认相机仍 `lookAt(orbit.center)`，但热点轨道保留的 `setViewOffset` 把几何中心投影到右栏之外的剩余区域中心。
- 2026-08-02：新增纯 `ResearchGalaxyContextComposition` 解析器。科研展示模式空闲投影偏移固定为 `0`，Fast Refresh 和运行时重建主动清除遗留偏移；摘要与阅读轨道的真实宽度只生成论文 Journey 安全锚点，窗口变化复用现有 420ms 锚点过渡。Agent 理论聚焦与三档轨道 CSS 保持不变。
- 2026-08-02：用户澄清“视觉中心”指拖拽旋转枢轴而非右栏投影中心。追踪确认展示星图规范中心本为 `[0, 0, -0.1]`，但系统态热点中心会经无状态限制的 `publishCameraPose()`进入外层状态，并在场景重建时覆盖 `cameraPreset.center`；effect 清理阶段的无条件发布使 Fast Refresh 尤其容易复现。
- 2026-08-02：新增纯 `resolveGalaxyOverviewCameraPose`。概览永远采用目标场景规范中心，仅当保存中心属于前一概览规范中心时继承距离和角度；热点/论文瞬态中心会使整组姿态回退到规范默认值。发布守卫下沉到 `publishCameraPose()`，系统、论文、进入/退出及 effect 清理均不能污染概览枢轴。

### 4. 测试与证据

- `node --experimental-strip-types scripts/sidera_m2_spatial_composition_r2_audit.mjs`：`PASS`。
- `node_modules\\.bin\\tsc.CMD -b --pretty false`：`PASS`。
- 科研星图 R3 与热点过渡回归：`PASS`。
- Tauri 热点点击、热点轨道展开、进入热点星系和返回总览：`PASS（低负载冒烟）`。
- 论文 Journey 规范投影起点/返回端点运行回归：`PASS`（位置误差 `0`、角度误差 `0°`）。
- 物理画布中心与论文安全锚点运行回归：`PASS`（1100/1360/1440/1920px；所有空闲轨道状态中心误差不超过 1px；摘要↔阅读交互后的返回角度误差小于 `0.00001°`）。
- 展示星图旋转枢轴回归：`PASS`（热点瞬态中心拒绝；规范中心 `[0, 0, -0.1]`；五档完整旋转最大中心投影误差约 `4.79e-16`）。
- Tauri 修复后真实五轮飞近/返回、像素对齐和多缩放：`UNVERIFIED`。
- 证据：[sidera-m2.0b-r2-spatial-composition-2026-08-02.json](./evidence/sidera-m2.0b-r2-spatial-composition-2026-08-02.json)

### 5. 进度与偏差

- 用户实机先后确认“无预平移/末端跃迁”和“返回后的物理视觉中心”不满足产品标准；两项根因修复与运行级回归均已完成，当前恢复为 `PRODUCT UNVERIFIED`。未引入计划外数据库、RAG、星体材质或理论坐标变更。
- 为避免研究星图先横移再靠近，研究产品路径直接跳过旧 acquisition；Agent 一键聚焦继续保留原有 acquisition 节奏。

### 6. 遗留与下一步

- R2 的空间构图仍需用户在真实桌面以 R3 固定阅读面板和 100%/125%/150% 缩放验收；紧凑/自定义面板已由 R3 删除，不再属于验收入口。
- 需要在热更新后的真实 Tauri 先拖拽展示星图验证圆圈中心静止，再验证打开/关闭热点轨道时中心不移动；随后执行普通/代表论文飞近和返回及连续五轮，人工确认没有错误旋转枢轴、预平移、末端跃迁、中心漂移或累积偏差。

### 7. 提交

- 当前：`dirty worktree`，无本工作包提交；按边界不提交、不推送、不创建 PR、不发布。

## M2.0b-R1 Sidera 对话编排、阅读面板与证据闭环

### 1. 工作包

- 日期：2026-08-02
- 分支：`codex/sidera-m2-rag`
- 基线提交：`d6e044af8d15fe04039bb1184a71ee5a0b159665`
- 工作树：`dirty worktree`；保留 M2.0b 既有修改，本轮不提交、不推送、不创建 PR、不发布。
- 状态：`IMPLEMENTED / AUTOMATED TECHNICAL PASS / PRODUCT UNVERIFIED`
- 目标：将真实会话修正为逐轮研究记录、可阅读的安全 Markdown 面板、准确库概况，以及不可绕过的结构化证据完成门。

### 2. 计划步骤与完成条件

| 步骤 | 内容 | 完成条件 | 状态 |
| --- | --- | --- | --- |
| 1 | 根级统一轮次 | 用户、状态、回答、引用按 turnId 交错且流式事件不串轮 | PASS |
| 2 | 阅读面板与 Markdown | 阅读/紧凑/自定义尺寸可恢复，GFM 安全渲染且不破版 | PASS（自动）/ Tauri UNVERIFIED |
| 3 | 库概况工具 | SQLite 统计准确，工具无参数且不能越项目 | PASS |
| 4 | 证据完成门 | 读取后必须 finalize；过程旁白丢弃，非法收口禁用引用 | PASS（自动）/ Provider UNVERIFIED |
| 5 | 自动与桌面验收 | 构建、专项、文档和三轮桌面闭环通过 | AUTOMATED PASS / TAURI UNVERIFIED |

### 3. 实际开发日志

- 2026-08-02：用户真实桌面对话确认混合检索和上下文延续有效，同时确认四项产品失败：问题与答案分组、Markdown 裸露、面板偏小、库概况与证据收口不可靠。
- 2026-08-02：锁定 R1 边界：继续保持内存会话、论文检索和显式聚焦；不加入网页、热点、全文、校园图书馆、持久历史或数据库迁移。
- 2026-08-02：根级状态改为 `SideraConversationTurn[]`；提交、增量、完成、停止、错误和迟到事件按同一 turnId 更新。页面移除独立问题数组和最近三问截断，改为逐轮研究记录，并加入只在接近底部时跟随的流式滚动。
- 2026-08-02：锁定 `react-markdown@10.1.0`与`remark-gfm@4.0.1`；回答支持 GFM 标题、列表、表格、引用和代码，禁用原始 HTML、图片及危险协议。阅读面板增加紧凑、阅读和受视口夹紧的自由尺寸，设置保存于本地界面偏好。
- 2026-08-02：Pi 扩展增加第四个白名单工具 `sidera_get_library_overview`。实现刻意直接只读 `library_revision_state`，避免复用可能初始化 revision 的写路径；真实默认库返回 25,463 篇论文、15 个学科、160 个热点和 25,463 篇快照论文。
- 2026-08-02：Rust 回合增加输出暂存、工具旁白丢弃、单次 steer 和 `SideraEvidenceGateStatus`。搜索命中后未读取、读取后未 finalize 或引用非法均收口为 `invalid`，正文不能伪装为已核验证据，引用和聚焦保持关闭。

### 4. 测试与证据

- `pnpm run build`：`PASS`（1,913 modules，10.74s；仅既有动态导入提示）。
- `pnpm audit:sidera-pi-basic`：`PASS`。
- `node --experimental-strip-types scripts/sidera_pi_local_paper_rag_audit.mjs`：`PASS`（四工具白名单和扩展协议）。
- `pnpm audit:sidera-pi-conversation-r1`：`PASS`（轮次、Markdown、概况和证据门专项）。
- `cargo check --manifest-path src-tauri/Cargo.toml --jobs 2`：`PASS`（10.89s）。
- 默认库真实只读审计：`PASS`，检索模式 `hybrid-e5-like`，概况为 25,463 / 15 / 160 / 25,463，核验引用 1 项。
- Rust 定向单元测试：目标编译 `PASS`，Windows 测试可执行文件启动前挂起，环境状态 `BLOCKED`；已终止测试残留进程，未自动重试或改系统 DLL。
- Tauri 原生壳启动：`PASS`；唯一可见窗口标题为 `Sidera`，流动星河、默认阅读档和尺寸拖拽入口已呈现。
- Tauri 三轮 Provider、阅读布局、停止和引用聚焦：`UNVERIFIED`。
- 计划证据：[sidera-m2.0b-r1-conversation-evidence-ui-2026-08-02.json](./evidence/sidera-m2.0b-r1-conversation-evidence-ui-2026-08-02.json)

### 5. 当前进度

- 实现、依赖锁定、生产构建、Rust 编译、真实 SQLite 审计和专项审计均已完成。自动技术状态为 `PASS`；真实桌面产品体验仍由用户验收，保持 `UNVERIFIED`。

### 6. 边界与遗留

- 不修改数据库 Schema、活动快照、理论 XYZ、背景渲染器、星体材质或 M1.3j 聚焦路径。
- 本轮不提交、不推送、不创建 PR、不发布。

## M1.3l-R1 Sidera 全局星空导航壳

> 历史工作包：其“工作页面侧栏保持原样”边界已被 M1.3m 统一外壳取代，其余 Agent 连续透明导航结论继续有效。

### 1. 工作包

- 编号：`M1.3l-R1`
- 目标：让标题栏、导航抽屉和主 Agent 区域共享一张连续星空，消除左上角直角、独立面板、全屏模糊与压暗。
- 分支：`codex/agent-theory-perimeter-lod`
- 基线提交：`38e732e5b6905dfab7dc551a6588f4bab88542cb`
- 工作树：`dirty worktree`；保留既有修改，本轮不提交、不推送、不创建 PR。
- 状态：`IMPLEMENTED / TECHNICAL PASS / PRODUCT UNVERIFIED`

### 2. 计划步骤与完成条件

1. 将 Agent 透明标题栏、导航点击层和抽屉本体统一改为透明，不改变工作页实体壳。
2. 移除抽屉右侧边界、面板阴影及品牌/项目/底部状态外框，只保留局部可读性处理。
3. 增加桌面壳审计，防止重新引入模糊、压暗或割裂背景。
4. 在真实 Tauri 窗口检查导航开合、连续星空和对话框亮度。

完成条件：导航打开时星空和 Agent 对话不变暗、不模糊、不缩放；左上角无硬直角，工作页面侧栏保持原样。

### 3. 实际开发日志

- 2026-08-01：用户确认流动星河效果不错，同时指出抽屉实体背景、全屏模糊和标题栏/抽屉交界形成生硬直角。
- 2026-08-01：将 `agent-navigation-scrim` 改为纯透明点击捕获层并关闭 backdrop filter；将 Agent 抽屉及其外层卡片改为透明，取消右边界和阴影。
- 2026-08-01：导航文字保留深色投影，当前项与悬停项只绘制向星空衰减的局部渐变；工作页 `sidebar-surface` 与实体标题栏选择器未修改。
- 2026-08-01：真实 Tauri 热更新检查确认导航打开后中央对话框、星河亮度和锐利度不变，星空连续延伸到左上角。

### 4. 测试与证据

- 证据：[sidera-m1.3l-r1-unified-navigation-shell-2026-08-01.json](./evidence/sidera-m1.3l-r1-unified-navigation-shell-2026-08-01.json)
- TypeScript / Vite / Sidera 桌面壳专项 / 项目文档审计：`PASS`
- Tauri 热更新视觉检查：`PASS`（实现检查）；用户产品视觉：`UNVERIFIED`

### 5. 当前进度

| 项目 | 状态 |
| --- | --- |
| 连续星空表面 | PASS |
| 无模糊/无压暗导航 | PASS |
| 工作页侧栏隔离 | PASS |
| 用户最终视觉 | UNVERIFIED |

### 6. 边界与遗留

- 本轮不改导航信息架构、历史对话、Pi/正式 Agent 后端、理论背景或星体视觉。
- 当前工作树保持未提交；不推送、不创建 PR、不发布。

## M1.3l Sidera 双沉浸样式与流动知识星河

### 1. 工作包

- 编号：`M1.3l`
- 目标：以稳定对角主带、会话随机细节、真实语义星、暗微尘和程序化薄带建立流动知识星河，同时保留现有随机星海供用户切换。
- 分支：`codex/agent-theory-perimeter-lod`
- 基线提交：`38e732e5b6905dfab7dc551a6588f4bab88542cb`
- 工作树：`dirty worktree`；保留 M1.3g-R2 至 M1.3k 的既有未提交实现、审计和证据。
- 状态：`IMPLEMENTED / TECHNICAL PASS / PRODUCT PASS`
- 提交：本阶段不提交、不推送、不创建 PR。

### 2. 计划步骤与完成条件

1. 增加 `star-river / random-field` 双样式、默认和偏好记忆、分样式 elapsed/checkpoint 及单渲染器切换。
2. 在身份型载荷上生成稳定对角样条骨架，按 72% 主带、18% 支流、10% 外围分配语义星，不读取理论 XYZ。
3. 扩展现有 GPGPU/解析流场，以切线输运、Curl、流带回归和软边界驱动星体；使用剩余约 2,000 槽承载暗微尘。
4. 增加单绘制调用的程序化星云薄带，保持语义星原生 DPR、锐利核心和现有聚焦身份。
5. 增加构图、运动、身份、检查点、聚焦跨样式和性能专项审计；完成低负载 Tauri 人工验收。

完成条件：流动星河在 5 秒内可感知且不退化为整图平移；主带、支流和外围构图稳定，语义星锐利；两种样式和聚焦状态往返连续，理论背景及既有随机星海不变。

### 3. 实际开发日志

- 2026-08-01：用户接受带运动说明的知识星河参考图，并锁定“用户可切换两种沉浸样式”“流动星河首次默认”“构图方向稳定、会话细节随机”“聚焦切换样式时保留实体并重新捕获”。
- 2026-08-01：开发前只读复核确认当前沉浸实现仍为扁平随机球体、同一语义 Points 几何体和全空间两级 Curl；`128×64` 状态纹理共 8,192 槽，6,000 论文、160 热点和 32 动态槽之外剩余 2,000 槽，可在不增加第二套模拟的情况下承载微尘。
- 2026-08-01：记录分支、HEAD 和 dirty worktree；更新六份权威文档后开始实现，未修改理论载荷、数据库、UMAP 或正式 Agent 后端。
- 2026-08-01：新增 `agentImmersiveStarRiver.ts`，以确定性三维样条、并行传输横截面和身份哈希分配主带、两条支流及外围粒子；热点沿流带分层布置，但热点归属不参与空间聚类。
- 2026-08-01：将现有单个 `128×64` 状态纹理扩展为 6,160 个常驻语义实体、32 个动态焦点槽和 2,000 个暗微尘槽。GPGPU 与解析式后备共用星河目标函数，微尘与语义星不共享业务身份或拾取路径。
- 2026-08-01：新增一个合并几何体绘制三条程序化星云薄带；薄带世界锚定并沿骨架平移噪声，随机星海分支不创建微尘与薄带，从而保持旧视觉路径不变。
- 2026-08-01：双背景页面增加样式偏好、分样式 elapsed/checkpoint 和“更多”菜单二选一；样式切换复用现有黑色遮罩和单渲染器生命周期，聚焦会话的实体、索引、信息卡与侧别保持不变。
- 2026-08-01：真实 Tauri balanced 窗口确认流动星河 WebGL 首帧、样式菜单和 `流动星河 → 随机星海 → 流动星河` 往返均可用。测试结束后恢复流动星河偏好；未运行全屏、4K、长时或 GPU 压力测试。

### 4. 测试与证据

- 计划证据：`docs/evidence/sidera-m1.3l-immersive-star-river-2026-08-01.json`
- 证据：[sidera-m1.3l-immersive-star-river-2026-08-01.json](./evidence/sidera-m1.3l-immersive-star-river-2026-08-01.json)
- 星河专项、旧随机星海、双背景、桌面壳、显式聚焦与项目文档审计：`PASS`
- TypeScript / Vite / `cargo check -j 2`：`PASS`
- Tauri balanced 技术验收：`PASS`（真实窗口、WebGL 首帧和样式往返）
- 用户产品视觉：`PASS`（2026-08-01 用户确认“效果不错”）

### 5. 当前进度

| 项目 | 状态 |
| --- | --- |
| 文档基线 | PASS |
| 双样式状态与切换 | PASS |
| 星河骨架与运动 | PASS |
| 暗微尘与薄带 | PASS |
| 自动审计 | PASS |
| 用户产品视觉 | PASS |

### 6. 边界与遗留

- 本轮未修改理论背景、原始 XYZ、数据库、UMAP、Pi/正式 Agent 后端、侧栏或历史对话。
- 未执行长时间全屏、4K 动画录制或 GPU 压力测试；这是设备蓝屏保护边界，不属于已通过证据。
- 聚焦身份跨样式的状态契约与重捕获路径已保留，仍需用户以真实聚焦夹具判断视觉连续性。
- 当前工作树继续为 `dirty worktree`；未提交、未推送、未创建 PR、未发布。

## M1.3k Sidera 桌面产品壳、启动页与默认入口

### 1. 工作包

- 编号：`M1.3k`
- 目标：冷启动以极简 Sidera 启动页承接本地数据与背景初始化，随后默认直达 Agent；以应用内标题栏、默认最大化和统一品牌替换旧科研热点工具外壳。
- 分支：`codex/agent-theory-perimeter-lod`
- 基线提交：`38e732e`
- 工作树：`dirty worktree`；保留 M1.3g-R2 至 M1.3j 的既有未提交实现和证据。
- 状态：`IMPLEMENTED / NATIVE PARTIAL PASS / PRODUCT UNVERIFIED`
- 提交：本阶段不提交、不推送、不创建 PR。

### 2. 计划步骤与完成条件

1. 将普通冷启动默认视图改为 Agent，保留 Galaxy/Agent 开发评审参数的入口优先级；首次数据库配置继续进入真实配置流程。
2. 建立 `booting-data → mounting-agent → ready / failed` 状态机；启动页最短展示 1000ms，并以背景真实 `onReady` 作为退出门。
3. 新增纯黑、极简星点、`SIDERA` 字标和《兰亭集序》原句的同 WebView 启动页；补齐超时状态、重试、设置与静态背景继续路径。
4. 新增一体化应用内标题栏；Agent/启动页透明叠加，工作页使用深色实体背景；窗口控件和拖动只开放必要权限。
5. 将 Tauri 主窗口改为默认最大化、居中兜底、非独占全屏、无系统装饰，并统一 `productName`、窗口标题和界面品牌为 `Sidera`，保留 identifier、数据路径和 Cargo 身份。
6. 增加 M1.3k 专项审计、文档证据、保守构建和 Tauri balanced 冷启动验收。

完成条件：冷启动无总览闪现和白帧，启动页在数据及背景就绪后才淡出，默认直达 Agent；标题栏与窗口控制可用且不挤压星空；首次沉浸、后续背景偏好恢复、失败退路和首次数据库配置均闭环。

### 3. 实际开发日志

- 2026-08-01：用户确认旧总览不应继续作为默认启动入口，并锁定 `Sidera` 品牌、默认最大化、首次沉浸后续记忆、自适应标题栏、极简字标星点及“仰观宇宙之大，俯察品类之盛。”启动文案。
- 2026-08-01：开发开始前停止本项目已有桌面进程，只读保留其他项目的 Cargo/Rust 任务；记录分支、HEAD、dirty worktree 和现有双背景就绪门。因设备近期存在显卡蓝屏历史，本工作包继续采用单项、低并发验证。
- 2026-08-01：普通启动默认视图改为 Agent，保留 Galaxy 视觉评审参数优先级；新增 `SideraBootPhase`、真实背景 `onInitialReady/onInitialError`、1000ms 最短启动页、2000ms 状态提示，以及重试、打开设置和静态背景继续路径。
- 2026-08-01：新增纯黑极简 `SideraSplash` 和 `SideraTitleBar`；工作页使用实体标题栏，Agent/启动页透明叠加。导航抽屉及右上角控件统一避开 38px 安全区，浏览器环境保持同布局但不调用原生窗口命令。
- 2026-08-01：Tauri 品牌与窗口配置改为 `Sidera`、默认最大化、居中兜底、非独占全屏和无系统装饰；只增加拖动、最小化、切换最大化、关闭和最大化状态读取权限，identifier 和数据身份不变。
- 2026-08-01：发现根组件传给背景页的初始就绪回调会随每次渲染改变引用，可能造成背景挂载 effect 重跑。改为稳定 `useCallback` 并以 ref 读取启动页存活状态；TypeScript、Vite 和专项审计复验通过。
- 2026-08-01：浏览器壳层回归确认启动失败信息、静态背景继续、导航抽屉、总览实体标题栏、返回 Agent 透明标题栏和不重播启动页均正确。浏览器无法读取桌面论文载荷属于预期边界，不冒充原生验收。
- 2026-08-01：再次启动前确认只剩一套其他项目的空闲 Cargo 父进程、无 `rustc`、可用内存约 8.4 GiB；以 `CARGO_BUILD_JOBS=2` 启动本项目。增量编译 43.76 秒后真实 `research-hotspots-desktop.exe` 窗口以标题 `Sidera` 出现，沉浸 Agent 和自定义标题栏可见并已置于前台。未执行压力测试或长时间全屏运行。

### 4. 测试与证据

- TypeScript：`PASS`（`.\\node_modules\\.bin\\tsc.cmd -b`）
- Vite 生产构建：`PASS`（`.\\node_modules\\.bin\\vite.cmd build`）
- Sidera 桌面壳、Agent 全屏壳、双背景与项目文档审计：`PASS`
- `git diff --check`：`PASS`（仅既有 CRLF 提示，无 whitespace error）
- 浏览器壳层与静态退路：`PASS`
- 独立 `cargo check -j 2`：`NOT RUN`（已由实际 Tauri dev 增量编译覆盖编译可用性，不再重复加压）
- Tauri dev 增量编译和原生窗口出现：`PASS`（43.76 秒，标题 `Sidera`）
- Tauri balanced 冷启动节奏、窗口控件与 DPI 人工验收：`UNVERIFIED`
- 证据：`docs/evidence/sidera-m1.3k-desktop-shell-startup-2026-08-01.json`

### 5. 进度

| 项目 | 状态 |
| --- | --- |
| 基线与开发文档开始记录 | PASS |
| 默认 Agent 入口与启动状态机 | PASS |
| 极简启动页与失败退路 | PASS |
| 一体化标题栏与窗口配置 | PASS（源码/配置/原生可见） |
| 自动验证 | PASS（前端/审计/Tauri dev 编译） |
| Tauri 人工视觉验收 | PARTIAL PASS / 用户验收待完成 |

### 6. 遗留问题和下一步

- M1.3j 论文恒星近景仍为 `PRODUCT UNVERIFIED`，不得由产品壳工作包代替视觉验收。
- 本工作包不接入正式 Agent 后端，也不改变数据库、UMAP、活动快照或星图材质。
- 最新 balanced 原生开发版已保持打开；由用户验收启动页节奏、默认最大化、标题栏拖动/双击/窗口按钮、背景偏好恢复和 DPI。不得为了补做独立 `cargo check` 杀掉其他项目进程或重复加压。

### 7. 提交

- 对应提交：无；`dirty worktree`。

## M1.3j Sidera 一键直达聚焦与论文恒星近景

### 1. 工作包

- 编号：`M1.3j`
- 目标：把 M1.3i 的两段式证据舞台简化为单次点击直达真实目标，并用真实恒星光球替换 Agent 理论论文灰色数据球。
- 分支：`codex/agent-theory-perimeter-lod`
- 基线提交：`38e732e`
- 工作树：`dirty worktree`；保留 M1.3g-R2 至 R10、M1.3h/i 的既有未提交实现和证据。
- 状态：`IMPLEMENTED / TECHNICAL PARTIAL PASS / PRODUCT UNVERIFIED`
- 提交：本阶段不提交、不推送、不创建 PR。

### 2. 计划步骤与完成条件

1. 以 `SideraFocusTimelineSample` 统一背景压暗、目标增强、相机与信息卡，停止产品路径调用旧三级自动时间线。
2. 理论论文一次点击自动完成热点进入和论文飞近；热点一次点击停在热点主星；关闭精确恢复原巡航或 Explore 姿态。
3. 多对象只保留“下一颗 / 关闭”，聚焦期间只强化当前目标；同/跨热点换项保持背景压暗和固定侧别。
4. Agent 理论近景使用真实 `SphereGeometry` 恒星光球；普通与代表论文统一视觉语言，目标直径限制在 `160–240px`。
5. 对话框改为 `clamp(480px, 36vw, 640px)`，聚焦和关闭不得触发底部 Explore 布局或自动折叠。
6. 增加 M1.3j 专项审计、证据、保守构建与 Tauri balanced 截图对比。

完成条件：聚焦与压暗同帧启动、理论一键直达、关闭无黑屏/布局跳变、同/跨热点换项连续、恒星光球达到参考图 A 的材质方向且既有双背景与 R10 不回归。

### 3. 实际开发日志

- 2026-07-31：用户实机判定 M1.3i 产品效果“复杂且逻辑不对”：沉浸压暗先于镜头，理论初次聚焦变为空背景并要求二次点击，关闭时对话框先缩到底部再返回中央；论文近景为米灰色圆片。
- 2026-07-31：源码复核确认产品渲染器仍调用 `sampleAgentDualFocusTimeline()`，而已定义的 Sidera 时间线没有成为唯一时间源；理论 `sidera-explicit` 初次命令仍是 `agent-focus-overview`；普通论文近景仍由始终复制相机四元数的 `PlaneGeometry` 数据球渲染。
- 2026-07-31：用户锁定参考图 A“恒星光球”、最终尺寸 `160–240px`、热点聚焦停在热点主星，并授权使用电脑操控和截图对比进行 Tauri 视觉迭代。
- 2026-07-31：正式 Sidera 路径改用统一时间样本；沉浸背景的压暗、相机和目标增强从同一采样帧启动。理论路径新增单一命令协调器，自动串联热点进入与论文飞近，并在同热点、跨热点换项时按真实导航层级依次释放和接管。
- 2026-07-31：产品轮播缩减为“下一颗 / 关闭”，场景只传入当前目标；移除理论信息卡二次近景入口。聚焦释放不再写入对话框折叠状态，中央面板宽度锁定为 `clamp(480px, 36vw, 640px)`。
- 2026-07-31：Agent 理论论文近景新增真实 `SphereGeometry` 光球和薄日冕，统一普通与代表论文的近景语言；目标为白热亮核、低饱和冷色三维颗粒和克制暗边，屏幕直径限制在 `160–240px`。独立分析星图继续使用原数据球/能量核心路径。
- 2026-07-31：TypeScript、Vite、Sidera 专项、双背景解析、全屏壳、沉浸流场、理论恒星材质、外围 LOD 与 R10 回归均通过。因另一项目 `D:\wenjian\Desktop\个人知识库` 的 Tauri/Cargo 进程仍在运行，按设备保护规则暂不并发执行本项目 Cargo 构建。
- 2026-07-31：使用本项目已有 debug 可执行文件和当前 Vite 前端进行 Tauri balanced 低负载实测。首次实测发现理论论文状态进入 `entering` 后，路由器把“尚未 focused”错误解释为需要 `return-system-center`，导致一键飞近刚启动便反向；现已将同目标的 `entering / focused / paper-focus` 都定义为有效在途所有权，实机可直接到达 `paper/system/focused`。
- 2026-07-31：多对象“下一颗”实测发现视觉切换完成后仍停留在 `retargeting`。根因是状态映射先判断旧阶段、后判断统一时间线 `complete`；现已让完成态优先进入 `hold`，实机可更新目标和信息卡并稳定保持。
- 2026-07-31：论文光球经过“灰色哑光球 → 粗颗粒月面感 → 细颗粒蓝白自发光恒星”三轮低负载迭代。当前实现使用高频稳定颗粒、白热中心、低饱和冷色表面、克制暗边及半径约 `1.075×` 的薄日冕；技术路径通过，最终恒星质感仍等待用户视觉判断。
- 2026-07-31：桌面低负载抽查已覆盖理论论文一次点击直达、关闭后系统退出与巡航恢复、沉浸同步压暗/移动、六项上限消息的“下一颗 / 关闭”及单目标信息卡。没有用该抽查替代连续五轮、跨热点和 `160 / 200 / 240px` 三尺寸的最终人工验收。
- 2026-07-31：用户用参考恒星图与当前桌面截图进行直接对比，确认当前近景仍呈灰白冰球/月球：边缘发黑、表面低对比且缺少自发光等离子层次。源码复核确认旧 Shader 确实用 `mu` 将球体边缘压低到约 42%，属于行星式受光模型。
- 2026-07-31：论文近景再次修订为纯自发光模型：删除黑色边缘衰减，增加域扭曲、多尺度脊状等离子网络、白热中心与明亮边缘；日冕改为连续噪声驱动的不规则薄流丝，外径约 `1.095×`，局部强度约 `10.5%–11.5%`。仍不使用方向光、全屏 Bloom、景深、运动模糊或宽软雾；新视觉等待用户刷新后的实机确认。
- 2026-07-31：刷新后的截图仍呈现宽阈值脊状噪声形成的大块白色迷彩斑纹，整体更像大理石冰球。实现因此停止继续调阈值，改为三层光学架构：本体只保留细尺度对流胞和狭窄发光网络；独立能量薄层负责连续白热中心；96×64 日冕球壳通过稳定顶点位移改变真实外轮廓并产生稀疏火舌。三层共享同一论文身份和世界中心，不创建业务实体副本。
- 2026-07-31：三层材质首次热更新后，真实 Tauri WebGL 就绪门捕获 `agent-theory-paper-photosphere-corona` 编译失败。根因不是数据或 Three.js，而是日冕顶点位移代码误接到能量薄层，Corona 片元 Shader 读取了其顶点 Shader 未声明的 `vPlume`。现已把能量薄层恢复为无位移的同心白热层，并把稳定顶点噪声、`vPlume` 及真实轮廓位移完整归还 Corona；构建、专项审计和真实桌面 Shader 编译均重新通过。
- 2026-07-31：修复后 Tauri balanced 实际近景已能显示约 200px 的蓝白自发光论文恒星、连续白热中心与细颗粒表面，且不再触发 Shader 错误遮罩。该结果仅证明新三层版本已真实运行；是否达到用户期望的恒星质感仍保持 `UNVERIFIED`。
- 2026-07-31：用户确认质感已有提升，同时指出参考图球面最外侧存在一层连续高亮薄光壳。进一步做只读图像对比：参考图球面 P10–P90 为 `0.396–0.887`，当前为 `0.470–0.761`；参考图球外日冕亮度中位数约 `0.107`，当前仅 `0.003`，证明当前动态范围被压平、黑边和日冕缺失并非主观错觉。
- 2026-07-31：本轮不只增加描边。球面本体改为宏观输运、中尺度等值连通流丝和微观颗粒三级结构；规则 `pow(mu)` 中心亮斑改为能量场调制的不规则白热核心；新增 `1.012×` 独立高温薄光壳；日冕改为更稀疏但能量更高的局部火舌，并把外壳基础尺度收紧为 `1.038×`。Vite 构建和两项材质专项审计通过。
- 2026-07-31：尝试进行真实 Tauri Shader 复验时，前台窗口切换到用户正在使用的其他应用；按电脑操控安全规则立即停止后续输入。因此本轮新四层材质的真实桌面最终视觉与 Shader 就绪状态仍记为 `UNVERIFIED`，不以静态审计代替。
- 2026-07-31：用户随后截图确认第一版四层材质实际上回到了上一版的大块大理石/迷彩球。根因是中尺度等值流丝虽独立于微颗粒，但仍使用固定世界阈值，约 200px 光球上形成大片连续高温覆盖。当前已撤销该宽阈值表达：中、细网络分别使用 `fwidth(middleCurrent)` 与 `fwidth(fineCurrent)` 控制为像素宽窄丝，并增加能量门控、收窄微脊阈值、降低网络辐射与总曝光；独立高温薄光壳从 `1.012×` 调整为 `1.018×`，以约两像素的连续锐利边界承担球壳轮廓。Vite 构建、Sidera 一键直达专项与 Agent 理论恒星材质专项审计通过，新的真实桌面视觉仍待用户确认。
- 2026-07-31：窄流丝版本的最新实机截图略有改善，但用户准确指出参考图发亮的是投影“圆”的外沿，而非三维球壳各切线区域。源码复核确认现有轮廓仍由放大的 `SphereGeometry` 和 Fresnel `pow(1-mu, 6.8)` 生成，因此会向球面内部扩散、随三维噪声改变厚度，并随投影尺寸同步变宽。当前已删除该三维轮廓层，改用独立朝向相机的 `PlaneGeometry` 圆环：平面为 `1.04×` 光球直径，圆环半径 `0.961538` 与本体投影边界重合，主线和弱肩部由 `fwidth(radial)` 保持约 `1–1.5` 与 `2–3` 物理像素宽度；完整圆周保持至少 94% 的稳定基础能量，不读取球面旋转。三维球面和位移日冕不变。TypeScript/Vite 构建及 Sidera 专项审计通过，桌面视觉仍待用户复验。
- 2026-07-31：用户复验截图显示第一版二维圆环仍不是实际透视轮廓：相对可见球体约向右偏 `3px`，并按方向向内缩约 `3–13px`。这不是需要写死偏移的 UI 问题，而是球心平面同半径只在远距离/近正交观察下成立；当前光球占据约四分之三视口且位于离轴聚焦区，三维球体的切线轮廓更大且投影中心向光轴偏移。当前实现已改为解析轮廓：圆环 Shader 根据 NDC、FOV、Aspect、View 空间球心和真实半径重建每像素相机射线，使用射线—球体交点判别式 `tangentField = 0` 定位真实轮廓，再以 `fwidth(tangentField)` 控制线宽。朝向相机的平面扩大为根据 `distance / sqrt(distance²-radius²)` 动态计算的保守包围面，不再参与圆环定位。TypeScript/Vite 构建及 Sidera 专项审计通过，真实桌面贴合度仍待用户确认。

### 4. 测试与证据

- 自动验证：`PASS`（Cargo 增量检查待竞争进程释放）
- Tauri balanced 低负载功能验收：`PARTIAL PASS`
- 用户视觉验收：`UNVERIFIED`
- 证据：`docs/evidence/agent-m1.3j-direct-focus-photosphere-2026-07-31.json`

### 5. 方案偏差与复用边界

- 保留 M1.3i 的结构化回答、只读实体解析、动态槽、信息卡、历史回答和跨背景身份协调。
- 停止产品路径中的外围二次聚焦、同时五证据弱亮、上一颗控件和理论信息卡二次近景按钮。
- Agent 专用光球不得改变独立分析理论星图或展示星图。

### 6. 当前进度与下一步

- 文档开工登记：`PASS`
- 单一时间线与控件简化：`PASS`
- 理论一键直达：`PASS（自动与 Tauri 低负载）`
- 多对象换项：`PASS（自动与单次 Tauri 低负载） / UNVERIFIED（跨热点连续轮播）`
- 恒星光球：`PASS（技术与桌面呈现） / UNVERIFIED（用户质感判断与三尺寸比较）`
- 自动审计：`PASS`
- Cargo：`PENDING`（另一项目 Tauri/Cargo 仍在运行）
- Tauri：`PARTIAL PASS`

## M1.3i Sidera 回答后显式证据聚焦与信息台

### 1. 工作包

- 编号：`M1.3i`
- 目标：把 M1.3h 自动聚焦替换为回答完成后由用户显式打开的真实证据舞台。
- 产品内工作名：`Sidera`
- 分支：`codex/agent-theory-perimeter-lod`
- 基线提交：`38e732e`
- 工作树：`dirty worktree`；保留 M1.3g-R2 至 R10、M1.3h 的既有未提交实现和证据。
- 状态：`IN_PROGRESS / PRODUCT UNVERIFIED`
- 提交：本阶段明确不提交、不推送、不创建 PR。

### 2. 计划步骤与完成条件

1. 建立结构化回答/实体引用契约，保证 streaming 阶段不操控背景，complete 且解析完成后才开放入口。
2. 建立单一显式会话、最多六项有界轮播、历史回答独立入口、溢出对象列表和新问题自动释放。
3. 建立固定宽度 Sidera 对话框、固定槽位控件、手动收起、对侧证据信息卡和详情/语义位置/二次深入操作。
4. 沉浸背景停止自动上下文凝聚，以同一真实顶点或动态槽、共速相机和固定侧面完成捕获。
5. 理论背景只进行外围证据构图；世界坐标保持只读，只有二次明确动作可以进入热点或论文近景。
6. 增加 Sidera 专项审计、证据文件、既有回归、保守构建和 Tauri balanced 人工验收。

完成条件：结构化入口、六项轮播、主目标/证据层级、信息卡、跨背景同实体重捕获、二次深入及关闭恢复全部成立；R10、沉浸流场和两套基础背景不得回归。

### 3. 实际开发日志

- 2026-07-30：用户否决 M1.3h 自动聚焦产品表达，要求回答期间背景不变、回答末尾提供显式聚焦入口，并以按钮轮播证据。
- 2026-07-30：新增 `sideraFocus.ts`，定义回答、结构化引用、显式会话、六项窗口、固定侧别和连续时间线。
- 2026-07-30：正式双背景页面接入 Sidera 消息契约；回答未完成时引用禁用，完成并解析后可由正文引用或末尾按钮启动。单项按钮原位变为关闭，多项使用固定网格上一颗/序号/下一颗/关闭。
- 2026-07-30：增加历史回答独立重开、溢出对象列表、新问题自动释放、会话存储恢复和快速换组 revision 门。
- 2026-07-30：中央对话框固定为 `clamp(360px, 30vw, 440px)`；新增手动收起、对侧信息卡、完整详情、查看语义位置及理论二次深入入口。
- 2026-07-30：沉浸产品适配器取消上下文星搬运，保留原流场位置，以共速相机侧面捕获主目标；背景流速降为约 50%，非目标能量连续降至约 43%。
- 2026-07-30：理论适配器增加 `sidera-explicit` 路径，初次聚焦只执行外围侧面构图；热点/论文近景必须通过信息卡二次命令进入。关闭继续复用 R10 精确姿态恢复。
- 2026-07-30：论文与热点材质增加主目标、最多五个证据弱亮及两段静态非闭合日冕弧；不使用标准圆环、旋转、脉冲或全屏 Bloom。
- 2026-07-30：新增 `audit:sidera-explicit-focus`，第一轮消息契约、轮播上限、missing 排除、产品路径和源码不变量为 `PASS`。
- 2026-07-30：在现有 Tauri 开发版执行 balanced 低负载抽查。流式回答只显示禁用引用，未改变聚焦状态；完整回答解析后可打开单对象证据舞台，按钮原位变为“关闭”，对侧真实论文信息卡出现，关闭后理论巡航正常恢复。
- 2026-07-30：溢出回答夹具显示 11 个结构化引用及“查看全部对象”入口。完整多项轮播、跨背景重捕获、二次深入和连续五轮恢复留给用户进行产品视觉验收，不以自动或局部桌面结果代替。

### 4. 测试与证据

- Sidera 专项契约/源码审计：`PASS`
- TypeScript：`PASS`（`node node_modules/typescript/bin/tsc -b --pretty false`）
- Vite 生产构建：`PASS`（`node node_modules/vite/bin/vite.js build`）
- Rust 增量检查：`PASS`（`cargo check -j 2`）
- M1.3h 解析/全屏壳层/R10 回归：`PASS`
- 沉浸流场、理论恒星材质和外围巡航回归：`PASS`
- 项目文档审计与 `git diff --check`：`PASS`
- Tauri balanced 验收：`PARTIAL PASS`（流式门、单对象舞台、信息卡、关闭恢复及溢出入口）
- 用户视觉验收：`UNVERIFIED`
- 证据：[agent-m1.3i-explicit-evidence-focus-2026-07-30.json](./evidence/agent-m1.3i-explicit-evidence-focus-2026-07-30.json)

### 5. 方案偏差与复用边界

- 沉浸相机仍复用 M1.3h 的相机状态机，但产品输入固定为 `sidera-explicit`；旧 signal/soft/full 不再由消息触发。
- M1.3h 的 24 颗上下文解析能力仍作为历史技术资产存在，M1.3i 产品会话不向渲染器传入该上下文集合。
- 正式 Agent 后端尚未接入；开发环境用生产同构消息契约和真实实体 ID 夹具，不在生产路径生成模拟回答。
- 信息卡当前以已有热点载荷和按需论文元数据组成；全文工作台和正式回答证据后端仍属于后续阶段。

### 6. 当前进度与下一步

- 回答契约、显式会话与消息入口：`PASS`
- 双背景证据舞台与信息卡：`PASS（实现） / PRODUCT UNVERIFIED`
- 自动审计：`PASS`
- 保守构建与回归：`PASS`
- Tauri 低负载抽查：`PARTIAL PASS`
- 用户产品视觉验收：`UNVERIFIED`

下一步：由用户在当前保持打开的 balanced 桌面开发版中验收多项轮播、历史回答、跨背景、二次深入及连续五轮关闭恢复；通过前产品视觉继续为 `UNVERIFIED`。

## M1.3h 双背景动态语义聚焦闭环

### 1. 工作包

- 编号：`M1.3h`
- 目标：在不破坏已通过的双背景、巡航、Explore 和恒星材质前提下，完成全屏 Agent 壳层与两套背景的真实实体三级聚焦。
- 分支：`codex/agent-theory-perimeter-lod`
- 基线提交：`38e732e`
- 工作树：`dirty worktree`，保留 M1.3g-R2 至 R10 的既有未提交修改与证据。
- 状态：`TECHNICAL ASSETS PASS / PRODUCT FAIL / SUPERSEDED`

### 2. 计划步骤与完成条件

1. 收口 M1.3g/R10 为用户视觉 `PASS`；Agent 页移除固定侧栏并增加不挤压画布的悬浮抽屉。
2. 增加带 revision 门的 `FocusCoordinator` 和最多 32 实体的只读场景解析。
3. 沉浸背景完成同顶点强调、单侧上下文凝聚、动态论文微尘成星与连续释放。
4. 理论背景完成外围 signal/soft、full-focus 系统/论文进入，以及对巡航和 Explore 姿态的精确释放。
5. 增加开发聚焦面板、自动审计、Tauri balanced 窗口验收和证据文件。

完成条件：一主、最多 5 个证据和 24 个上下文上限生效；missing 不造星；切换背景保持身份但不插值坐标；侧栏、聚焦、释放不重建渲染器；用户接受两套背景的视觉闭环。

### 3. 实际开发日志

- 2026-07-30：用户确认 R10 已修复，M1.3g 产品视觉转为 `PASS`。
- 2026-07-30：复核当前分支、HEAD 与脏工作树；确认正式双背景入口、6000 论文沉浸载荷、理论外围控制器、旧实体解析和历史聚焦资产可复用。
- 2026-07-30：开始以新增协调器与适配层叠加 M1.3h，明确不重写 R10 相机生命期。
- 2026-07-30：Agent 路由改为完整应用视口，固定侧栏在 Agent 页隐藏；新增覆盖式导航抽屉，沿用原项目切换、导航和数据库状态，画布尺寸与渲染器生命期不随抽屉开关变化。
- 2026-07-30：新增 `agentDualFocus.ts`、revision 门和 `resolve_agent_dual_focus_scene` 只读命令；解析 sampled、snapshot-unsampled、active-only、hotspot 与 missing，并限制一主、5 证据、24 上下文和 32 个动态槽。
- 2026-07-30：沉浸背景在原 6000 论文几何体上增加同顶点聚焦属性，并预分配 32 个动态槽；实现 signal/soft/full、单侧上下文平移、流场持续运动、低幅相机辅助与连续释放。
- 2026-07-30：理论背景通过只读视觉属性和既有相机/系统命令实现外围 signal/soft 与 full-focus 分层进入；active-only 使用未分类外围动态槽，释放复用 R10 精确返回，不修改任何理论 XYZ。
- 2026-07-30：开发菜单增加固定实体、动态热点规模夹具、三种模式、释放和运行时诊断；新增双聚焦、解析器和全屏壳层专项审计。
- 2026-07-30：首次原生运行发现理论 full-focus 命令可能早于 App17 WebGL 就绪并被消费；增加真实 `onReady` 门及每 revision 一次的命令门。
- 2026-07-30：原生释放验证发现材质时间线会早于论文/系统/相机返回报告 `idle`；改为由真实导航与 R10 返回回调最终释放协调器。
- 2026-07-30：阻止聚焦或局部系统相机回调覆盖概览保存姿态；无效外围姿态触发时仅清理会话内旧姿态。
- 2026-07-30：Tauri 低负载抽查通过全屏抽屉、sampled 跨背景 full-focus、理论论文近景与完整释放、释放后巡航续播、active-only 动态槽和 missing 不造星。

### 4. 测试与证据

- TypeScript：`PASS`
- Rust 增量检查：`PASS`（`cargo check -j 2`）
- 双聚焦、解析器、全屏壳层与 R8/R9/R10 回归：`PASS`
- Vite 生产构建与完整文档审计：`PASS`
- Tauri balanced 验收：`PARTIAL PASS`
- 用户视觉验收：`UNVERIFIED`
- 技术证据：[agent-m1.3h-dual-semantic-focus-2026-07-30.json](./evidence/agent-m1.3h-dual-semantic-focus-2026-07-30.json)

### 5. 当前进度

- 文档与阶段状态：`PASS / PRODUCT UNVERIFIED`
- 全屏 Agent 壳层：`PASS`
- 只读解析与协调器：`PASS`
- 沉浸聚焦：`TECHNICAL PASS / PRODUCT UNVERIFIED`
- 理论聚焦：`TECHNICAL PASS / PRODUCT UNVERIFIED`
- 自动审计：`PASS`
- 桌面低负载抽查：`PARTIAL PASS`
- 用户视觉验收：`UNVERIFIED`

### 6. 边界与遗留

- 本阶段不实现 Thinking/Answer/Reading 六态、不接入正式 Agent 后端、不切换默认启动页。
- 不修改数据库 Schema、UMAP、活动快照、独立理论星图或展示星图。
- 当前大型工作包完成前不得提交、推送、创建 PR 或发布。
- 仍需用户判断沉浸单侧凝聚、signal/soft/full 强度、小中大热点和多实体密度；当前技术通过不能代替该产品结论。
| M1.3g-R5 持续可见巡航与热点主星修复 | PASS（自动技术不充分） | FAIL | 无交互退出可恢复，但任意交互仍进入旧 Hermite 返回并滑向黑屏 |
| M1.3g-R6 精确锚点返回与无黑屏 LOD 交接 | PASS（精确轨迹技术） | FAIL | 用户确认轨迹正确，但标签、局部返回、巡航恢复和系统论文亮度未闭环 |
| M1.3g-R7 交互闭环与系统论文可见度 | PASS（自动技术不充分） | FAIL | 标题与分层导航通过；用户持续观察证明返回后巡航仍永久静止，系统论文仅部分改善 |
| M1.3g-R7.1 持续巡航恢复与系统论文二次增强 | PASS（静态/自动技术） | FAIL | 延长证明仍未解除守卫停止固定步的控制权，用户桌面复验继续永久静止 |
| M1.3g-R8 巡航生命期与可见性引导解耦 | PASS（自动技术） | UNVERIFIED | 固定步始终推进；守卫改为非阻塞连续引导，等待真实桌面连续往返验收 |
| M1.3g-R9 对话状态巡航平滑性修复 | PASS（稳定巡航技术） | FAIL | 对话态微抖已消除；用户实机确认 Explore 返回锚点后仍有两次额外滑动和一次跃迁 |
| M1.3g-R10 Explore 返回后单一巡航接管 | PASS | PASS | 完整状态原子恢复与单一巡航接管通过自动检查，用户实机确认修复完成 |

## 归档工作包：M1.3g-R10

### 1. 基线

- 目标：保留 R6 精确锚点返回与 R9 平滑巡航，只消除到达锚点后的二次滑动和末次跃迁。
- 分支：`codex/agent-theory-perimeter-lod`
- 基线 HEAD：`38e732e`
- 当前状态：`PASS / PRODUCT PASS`
- 工作树：`dirty worktree`；原样保留 R2 至 R9 的既有代码、审计和证据，本轮不提交、不推送、不创建 PR、不发布。
- 用户结论：稳定巡航本身效果成立；问题发生在返回锚点之后，而不是精确返回轨迹内部。

### 2. 计划步骤与完成条件

| 步骤 | 实现内容 | 状态 |
| --- | --- | --- |
| 1 | Explore 入口冻结 current/target Guidance、逻辑时钟、epoch、深度、LOD 与巡航插值 | PASS |
| 2 | 锚点原子恢复完整状态并从下一个固定步直接续播 | PASS |
| 3 | 旧 Worker epoch/revision 永久失效，前三秒禁止额外构图 | PASS |
| 4 | 删除 900ms 返回专用 fallback，方向反转继续使用限加加速度积分 | PASS |
| 5 | 新增三秒运行时诊断与 R10 专项审计 | PASS |
| 6 | TypeScript、Vite、Rust、R6/R8/R9/R10、Worker、文档与差异检查 | PASS |
| 7 | Tauri balanced 覆盖各交互退出后五秒单轨迹观察 | PASS（用户确认） |

### 3. 实际开发日志

#### 2026-07-30：根因复核与 R10 实现

- 精确锚点返回的位置与方向仍正确；锚点后存在三条额外控制路径：Guidance Worker 按墙钟立即恢复并连续接管、900ms 健康审计因没有统计 Worker 安全结果而误触发 fallback、运行态 `directionSign` 在接管帧直接替换。
- `AgentTheoryExploreSafeAnchorV2` 扩展为同时保存 Guidance 当前值和目标值、目标保持余量、下一 Worker 评估余量、安全持续时间、连续不安全计数、Worker epoch/accepted revision；既有 previous/current 检查点、插值、accumulator、深度和 LOD 继续冻结。
- Explore 入口及锚点恢复各推进一次组件级 Worker epoch。Guidance 和 Screen LOD 请求闭包同时校验 epoch；旧 epoch 或旧 revision 结果只增加丢弃诊断，不能改写返回后的 Guidance、深度或论文集合。
- 锚点恢复后从冻结 accumulator 的下一个 `1/60s` 固定步继续。返回后三秒暂停新的 Guidance 接管和空闲降级，但物理巡航不停；三秒后按冻结时剩余评估时间恢复 Worker 调度，Explore 停留时长不计入 Guidance 时钟。
- 原 `agentTheoryCruiseHandoffSeconds` 已删除；900ms 健康审计改为三秒只读轨迹诊断，不再调用 fallback。正常巡航真实跌破硬下限时仍可使用 fallback。
- Guidance 的目标方向继续送入限加加速度巡航积分器，运行态方向只随实际角速度过零更新，不在 Worker 接管帧瞬间翻转。

### 4. 当前验证

- 项目本地 `tsc -b --pretty false`：`PASS`。
- `audit:agent-theory-r10`：`PASS`（10/10）；覆盖完整状态冻结、epoch、0/500/900ms 结果、五轮下一固定步续播、无 900ms fallback 和三秒额外构图计数。
- `audit:agent-theory-r6`：`PASS`；活动快照 25,463 篇论文、160 个热点，全部非零交互终点误差为 0 或浮点极小量，返回轨迹线段越界为 0。
- `audit:agent-theory-r8`：`PASS`（8/8）；`audit:agent-theory-r9`：`PASS`（8/8）。
- Vite 生产构建：`PASS`（1,654 modules，10.54s）；`cargo check --manifest-path src-tauri/Cargo.toml -j 2`：`PASS`（2.12s）。
- 共享 Screen LOD Worker：`PASS`（13/13）；项目文档审计和 `git diff --check`：`PASS`。差异检查只报告既有 LF/CRLF 转换提示，无空白错误。
- 最新 Tauri 开发版 balanced 低负载抽查后，用户确认 R10 修复完成并认可当前整体双背景效果；精确回锚、单一巡航接管和无末端跃迁据此记为产品视觉 `PASS`。
- 证据：[agent-m1.3g-r10-single-cruise-resume-2026-07-30.json](./evidence/agent-m1.3g-r10-single-cruise-resume-2026-07-30.json)

### 5. 偏差、遗留问题与下一步

- R10 为满足“返回后三秒额外构图次数为 0”，将 Guidance 的剩余逻辑时钟在三秒只读观测窗后继续；这不会减速或暂停巡航本身。
- 自动审计可以证明单一写入者、epoch 和固定步续播，不能替代 WebView2 中对“锚点后只剩一条自然运动”的肉眼判断。
- R10 已作为 M1.3h 的冻结相机与巡航基线；后续聚焦释放必须复用该路径，不得增加新的接管或返回专用 fallback。

## 归档工作包：M1.3g-R9

### 1. 基线

- 目标：保留 R8 已通过的巡航生命期、精确返回、可见性下限、星体材质和 Explore 操作，只消除对话态的微小横向/纵向冲击。
- 分支：`codex/agent-theory-perimeter-lod`
- 基线 HEAD：`38e732e`
- 当前状态：`IN_PROGRESS / PRODUCT UNVERIFIED`
- 工作树：`dirty worktree`；保留全部既有修改，本轮不提交、不推送、不创建 PR。
- 用户结论：R8 整体效果很棒；Ambient/对话态仍有肉眼可见的小幅抖动。

### 2. 计划步骤与完成条件

| 步骤 | 实现内容 | 状态 |
| --- | --- | --- |
| 1 | 巡航检查点 V2：4–7 秒连续随机目标与限加加速度响应 | PASS |
| 2 | 复用唯一 Screen LOD Worker 执行 2Hz 引导与深度预测 | PASS |
| 3 | 固定步之间使用 Hermite 位置与四元数 slerp | PASS |
| 4 | Worker 故障时使用 1Hz/512篇/3时点空闲降级 | PASS |
| 5 | R9 专项、R6/R8/Worker 回归、构建、Rust、文档与差异检查 | FRONTEND PASS / RUST DEFERRED |
| 6 | Tauri balanced 对话态连续观察 60 秒和五轮 Explore 往返 | UNVERIFIED |

### 3. 实际开发日志

#### 2026-07-30：R9 实现

- `AgentTheoryCruiseCheckpointV1` 增加运动版本、下一随机目标步、角速度/垂直/切线目标起止值和垂直加速度。V1 解析保留原种子、步号、位置与速度，并在同一位置生成 V2 连续目标。
- 删除约每 120 步直接改变 `verticalVelocity` 的路径。普通随机目标每 4–7 秒更新，角速度、垂直位置和切线权重分别使用 2.4/3.2/2.8 秒连续响应；可见性 fallback 仍可连续反向。
- 新增纯计算 `agentTheoryCruiseGuidance`，把 2,048 篇分层论文、160 个热点、未来 0/1.5/3/4.5/6 秒预测和深度百分位移入现有 Screen LOD Worker。Worker 协议升级为 v3，同一队列优先处理引导，并分别丢弃过期 LOD/引导响应。
- RAF 不再调用同步 `updateAgentTheoryVisibilityGuard(now)`。Worker 未就绪或失败时通过空闲回调以 1Hz、512 篇和 3 个未来时点降级；当前安全构图在结果返回前保持。
- Ambient 相机位置使用相邻检查点端点速度的三次 Hermite 插值并限制在线段包围内；方向由前后检查点相机四元数最短路径插值。Worker 活动时，深度诊断不再每 250ms 重新投影 2,048 篇论文。
- 诊断增加运动版本、下一目标剩余时间、角/垂直加速度、Worker 延迟/积压/丢弃、引导保持与切换次数。
- 最终低负载收口中，R9、R6、R8、共享 Worker 和项目文档审计全部通过；Vite 生产构建生成独立的 Worker chunk，`git diff --check` 无差异错误。
- 收口时已有 Tauri/Cargo 开发链正在运行，可用内存约 2.6 GiB。依据蓝屏保护规则没有并行启动 `cargo check`；R9 未修改 Rust 源码，该项如实记录为 `DEFERRED`，不以既往 Rust 结果冒充本轮验证。

### 4. 当前验证

- 项目本地 `tsc -b`：`PASS`。
- `audit:agent-theory-r9`：`PASS`（8/8）。相同种子 60 秒运动哈希一致；随机目标间隔为 4.72–6.95 秒；V1 迁移位置误差为 0；Hermite 100 个采样点均未越过相邻检查点包围段。
- `audit:agent-theory-r8`：`PASS`（8/8）。3 个种子各推进 36,000 步且没有静止步，五次锚点恢复均在下一固定步推进。
- `audit:agent-theory-r6`：`PASS`（12/12）；共享 Screen LOD Worker 审计：`PASS`（13/13）。
- Vite 生产构建：`PASS`（1,654 个模块，包含独立 `agentTheoryScreenLod.worker` chunk）。
- 项目文档审计：`PASS`（64/64）；`git diff --check`：`PASS`（仅报告工作树换行符提示）。
- Rust 增量检查：`DEFERRED`（已有 Tauri/Cargo 进程运行且可用内存约 2.6 GiB；R9 无 Rust 改动）。
- Tauri 60 秒平顺性观察与用户视觉结论：`UNVERIFIED`。
- 证据：[agent-m1.3g-r9-ambient-cruise-smoothness-2026-07-30.json](./evidence/agent-m1.3g-r9-ambient-cruise-smoothness-2026-07-30.json)

### 5. 偏差、遗留问题与下一步

- Node 的原生 TypeScript 执行器不解析源码内部无扩展名导入；专项审计直接执行巡航核心数学，并由 TypeScript/Vite 构建验证 Worker 引导模块，未复制第二套运行算法。
- 自动模拟可证明运动连续性和主线程任务边界，不能替代真实 WebView2 帧节奏与肉眼平顺性判断。
- 下一步在现有桌面开发链空闲、设备稳定时执行 Rust 增量检查；随后只使用 balanced 窗口连续观察 60 秒并执行五轮 Explore 往返。用户确认前，工作包继续为 `IN_PROGRESS / PRODUCT UNVERIFIED`。

## 后续规划工作包：全文阅读与校园图书馆连接

### 1. 登记信息

- 登记日期：2026-07-30。
- 状态：`PLANNED / NOT IMPLEMENTED`。
- 目标：在本地证据 Agent 之后建立可追溯全文文档基座、沉浸式论文/期刊阅读台、AI 阅读辅助，以及用户授权的校园图书馆/机构来源连接器。
- 当前分支与代码：不变；本次只更新产品和开发文档，不新增数据库表、命令、依赖、凭据或网络访问。
- 与当前工作的关系：不替换 M1.3g-R9，不进入当前星图修复范围。

### 2. 需求分析

#### 校园图书馆

校园图书馆官网通常只是统一入口，后方可能同时连接学校 OPAC、发现系统、OpenURL 链接解析器、校外访问代理以及 CNKI、Web of Science、Elsevier、Springer、EBSCO、ProQuest 等不同供应商。不存在稳定、合规且能覆盖所有学校的“一个网页连接器”。

因此首期应从发现和跳转开始，再按真实学校能力增加正式接口和用户授权的单篇获取。校园账号密码必须留在机构页面；应用不得保存密码、导出浏览器 Cookie、绕过验证码/付费墙/IP 限制或进行无人值守批量下载。

#### 全文阅读台

全文来源不应局限为一个下载按钮。用户上传、合法下载后导入、开放获取、出版社正式 API、参考文献管理器和后续机构连接器都应汇入统一的文档治理层。论文元数据与文件版本必须分离，原始文件不可变，解析、OCR、索引和 AI 输出可重建。

阅读台应先成为稳定的阅读器，再增加 AI。AI 侧边栏应围绕当前选段、页、章节或文档工作，并把结论引用回页码/章节；“翻译、总结、解释、自由对话”是首批候选，不提前限制未来可加入的文献比较、术语卡片、图表解释和阅读笔记能力。

### 3. 计划步骤与进度

| 步骤 | 内容 | 完成条件 | 状态 |
| --- | --- | --- | --- |
| 1 | 目标学校与来源能力调研 | 确认首个学校、首批数据库、认证方式、正式接口和许可边界 | PLANNED |
| 2 | 文档身份与 provenance 设计 | 论文、逻辑文档、文件版本、来源、许可和哈希边界通过评审 | PLANNED |
| 3 | PDF 原文件导入与阅读器 | 本地 PDF 可去重、打开、搜索、缩放并恢复阅读位置 | PLANNED |
| 4 | 页码锚点、解析、OCR 与索引 | 原生/OCR文本可区分，片段能回到页面和坐标 | PLANNED |
| 5 | AI 阅读辅助最小闭环 | 选段翻译、章节总结、解释和带页码问答可用且可审计 | PLANNED |
| 6 | 发现与跳转连接器 | OPAC/OpenURL/DOI 或正式元数据接口完成真实环境验收 | PLANNED |
| 7 | 用户授权单篇全文获取 | 不接管密码，完成授权获取、来源记录和阅读台打开 | PLANNED |
| 8 | 期刊卷期、更多格式与高级辅助 | 根据真实使用反馈另行立项，不阻塞首期 PDF 闭环 | PLANNED |

### 4. 实际开发日志

#### 2026-07-30：产品需求登记

- 用户提出开始考虑接入校园图书馆官网，并希望增加可沉浸阅读论文/期刊全文的展示台。
- 用户设想的全文来源包括上传、网站下载和其他后续来源；阅读侧边栏可提供翻译、总结、解释和自由对话，但具体功能组合尚未锁定。
- 本次分析将“通用官网抓取”拆分为受治理的发现、跳转、正式接口和用户授权单篇获取；将“全文展示”拆分为来源治理、不可变文档、页面锚点、阅读器、索引和 AI 辅助。
- `PROJECT / ROADMAP / STATUS / ARCHITECTURE / DECISIONS / DEVELOPMENT` 以及两份详细蓝图已同步。没有修改代码、数据库、依赖或运行状态。

### 5. 风险与决策门

- 需要首个真实学校和数据库清单才能判断 OPAC、OpenURL、API、SSO、EZproxy 或仅浏览器跳转中的可行路径。
- 机构许可可能只允许交互式单篇访问，不允许自动化全文下载；产品能力必须由连接器声明，不能统一承诺。
- PDF 版面、扫描 OCR、双栏论文、公式、表格和图像解释是不同难度层级，必须分批验收。
- 外部模型会产生版权、隐私和费用边界；默认采用最小片段外发，整篇/图片外发单独确认。
- 首期翻译呈现、批注格式、全文存储位置、备份策略和 OCR 引擎尚未决定。

### 6. 下一步

1. 完成当前 M1 星图与 Agent 首页基础，不在视觉修复期间并行引入全文数据库迁移。
2. M2 开始前，由用户指定首个目标学校/图书馆和最常用数据库。
3. 先立项 F1/F2 文档基座与 PDF 阅读器，再开发 AI 侧边栏；校园连接器获得的文件必须复用同一文档入口。
4. 每个大型实现工作包继续在开始、偏差、测试和结束时更新本总账。

## 历史工作包：M1.3g-R8

### 1. 基线

- 目标：保留外围巡航、R6 精确锚点返回、R7 标签/导航、论文与热点材质，只替换导致返回后永久静止的巡航控制架构。
- 分支：`codex/agent-theory-perimeter-lod`
- 基线 HEAD：`38e732e`
- 当前状态：`TECHNICAL PASS / PRODUCT UNVERIFIED`
- 工作树：`dirty worktree`；保留全部既有修改，本轮不提交、不推送、不创建 PR。
- 用户实机结论：R7.1 返回轨迹正确，但返回后巡航仍永久静止；切换沉浸背景再返回才能恢复。

### 2. 计划步骤与完成条件

| 步骤 | 实现内容 | 状态 |
| --- | --- | --- |
| 1 | 固定步积分器与可见性守卫解耦，Ambient 始终推进 | PASS |
| 2 | 增加 `normal / steering / fallback` 连续方向与非零速度引导 | PASS |
| 3 | 精确锚点到达后首个固定步结束界面返回，健康审计后台化 | PASS |
| 4 | 增加最高 4Hz 的真实巡航生命期诊断 | PASS |
| 5 | 更新 R5/R6/R7 审计、R8 专项审计、证据与六份权威文档 | PASS |
| 6 | Tauri 连续五轮 Explore 往返并逐轮观察 30 秒 | UNVERIFIED |

### 3. 实际开发日志

#### 2026-07-30：R7.1 实机失败与根因确认

- RAF、渲染器和 React 画布没有停止。静止发生在巡航 fixed-step 入口：可见性守卫可以阻止检查点推进。
- 被阻止时检查点、相机和未来 6 秒预测输入都不再变化；下一轮守卫得到相同不安全结果并继续阻止，形成确定性的永久等待。背景往返重挂载会重新求解初始安全构图，所以表面上能够“恢复”。
- 900ms、30步和两次守卫证明只观察证明窗口；只要完成后仍恢复旧的布尔许可架构，就不能证明持续巡航。

#### 2026-07-30：R8 实现

- `advanceAgentTheoryCruise()` 增加可选 `directionSign / speedScale` 控制，所有 Ambient 固定步无条件调用积分器；`normal / steering / fallback` 的速度比例始终不低于 `1 / 0.55 / 0.35` 对应目标。
- 可见性评估保留 250ms 周期和未来 6 秒预测，但输出改为连续引导。候选搜索覆盖当前/反向巡航；无候选时平滑提高中心构图权重并反转切向趋势，不重置检查点。
- Explore 锚点新增 guidance 与中心构图混合状态。到达锚点后立即恢复 previous/current、插值、accumulator 和 guidance，并启动 300ms LOD 收敛；首个固定步完成后发布 `idle`。
- 旧 900ms/30步/守卫/投影位移证明改为后台健康审计。失败只请求 fallback，不再影响界面返回和固定步生命期。
- 增加 `AgentTheoryCruiseLivenessSnapshot`，以最高 4Hz 发布 step delta、投影位移、连续静止时间、恢复次数和暂停原因；诊断只读，不反馈为相机控制输入。
- 实现过程中进一步删除锚点处旧“两帧＋120ms＋300ms 后才恢复巡航”的阻塞路径；论文并集仍以 300ms 能量连续收敛，但巡航与其并行恢复。
- 用户桌面验收认为 R8 持续巡航与返回效果“很棒”，仅指出 Explore 滚轮推进过敏。标准单格滚轮的理论惯性路程由约 32% 星系中位半径降至约 6.7%，连续滚轮最高速度同步收紧；热点系统缩放、其他星图和 R8 巡航均不读取该参数。

### 4. 当前验证

- 项目本地 `tsc -b`：`PASS`；`pnpm exec tsc` 仍受本机 pnpm shim 异常影响，未清理 Store。
- `audit:agent-theory-r8`：`PASS`（8/8）。3 个种子各推进 36,000 步，最长静止步数为 `0`；5 次锚点恢复均在下一固定步前进，真实 Three.js 相机一秒投影位移约 `0.9496px`。
- R5 十分钟持续可见性、R6 真实快照精确返回、R7-v2 标签/导航/系统可见度回归：`PASS`。
- Vite 生产构建（1,653 模块）、`cargo check -j 2`、理论恒星材质、双背景、项目文档审计和 `git diff --check`：`PASS`。
- 最新 Tauri 桌面开发版已启动并确认真实窗口、研究 Agent 页面和理论背景首帧正常；未自动执行长时间或连续五轮交互，持续巡航产品结论仍由用户验收。
- 用户产品视觉：`UNVERIFIED`。真实 Tauri 连续往返和返回后 30 秒巡航不能由自动审计替代。
- 证据：[agent-m1.3g-r8-cruise-liveness-2026-07-30.json](./evidence/agent-m1.3g-r8-cruise-liveness-2026-07-30.json)

### 5. 偏差、遗留问题与下一步

- 与原计划相比，R8 不仅后台化 900ms 证明，还移除了锚点处遗留的 120ms 可见帧门和 300ms 串行等待；LOD 仍用相同 300ms 收敛，但与固定步巡航并行。
- 自动模拟证明积分器不会再被守卫停住，但不能证明真实桌面上的构图观感、GPU 帧节奏和用户主观巡航感已经通过。
- 下一步只做 balanced 窗口的真实桌面复验：立即退出、滚轮、拖拽、空白视野、热点系统退出和连续五轮往返；每轮返回后至少观察 30 秒。

## 历史工作包：M1.3g-R7.1

### 1. 基线

- 目标：保留已通过的热点标题、分层导航和精确锚点轨迹，修复“短时证明通过后护栏关闭全部巡航步”，并继续增强仅 Agent 理论系统内的普通论文可见度。
- 分支：`codex/agent-theory-perimeter-lod`
- 基线 HEAD：`38e732e`
- 当前状态：`TECHNICAL PASS / PRODUCT FAIL`
- 工作树：`dirty worktree`；保留全部既有修改，本轮不提交、不推送、不创建 PR。
- 用户实机结论：标签 `PASS`；分层返回 `PASS`；返回后持续巡航 `FAIL`；系统论文亮度 `PARTIAL`。

### 2. 计划步骤与完成条件

| 步骤 | 实现内容 | 状态 |
| --- | --- | --- |
| 1 | 让恢复证明跨越真实护栏评估周期 | PASS |
| 2 | 安全候选构图在连续转向期间维持推进许可 | PASS |
| 3 | 再提高 Agent 理论系统论文亮核与深度可读性 | PASS |
| 4 | 更新审计、证据及六份权威文档 | PASS |
| 5 | 用户复验持续巡航和系统亮度 | FAIL（巡航）/ PARTIAL（亮度） |

### 3. 实际开发日志

#### 2026-07-30：用户验收推翻短时巡航恢复结论

- 用户确认 R7 的热点标题和分层返回没有问题。
- 用户确认返回轨迹正确，但返回完成后背景保持静止；切换沉浸背景再返回才恢复正常巡航。
- 源码定位到恢复证明期间显式跳过 `updateAgentTheoryVisibilityGuard()`：两个固定步和 `0.15px` 位移通常在护栏 250ms 评估周期之前完成，随后护栏可将 `advanceAllowed` 关闭。自动抽样看到的是证明阶段短时位移，并非持续巡航。
- 用户认为系统论文亮度已有改善但仍有加强空间。

#### 2026-07-30：R7.1 实现

- 恢复证明改为至少持续 900ms、成功推进 30 个固定步、通过至少两次真实护栏安全评估并产生 `0.15px` 投影位移；证明期间护栏与连续转向正常运行。
- 构图搜索优先选择安全候选。当前方向未来视野不安全但候选安全时，候选结果可以维持推进许可；检查点仍只在当前方向安全时保存。
- 新增护栏评估次数和安全次数诊断，HUD 与 DOM 诊断属性均可读取。
- Agent 理论系统论文配置提高为基础透明度 `0.82`，远/中/近最小尺寸 `2.9 / 3.1 / 3.25px`，上限 `5px`，深度亮度/尺寸下限 `0.94 / 0.96`，聚焦非邻域/邻域亮度 `0.68 / 0.80`；稳定亮核提高到约 `1.2` 物理像素和 `0.74` 核心能量。

### 4. 当前验证

- `pnpm build`：`PASS`，1653 个模块完成生产构建。
- `audit:agent-theory-r7` v2：`PASS`（13/13）。
- R5 十分钟可见性模拟与 R6 精确返回审计：`PASS`。
- 真实桌面持续巡航：`FAIL`；用户复验确认返回后仍永久静止。新系统亮度维持 `PARTIAL`。
- 证据：[agent-m1.3g-r7-1-liveness-visibility-2026-07-30.json](./evidence/agent-m1.3g-r7-1-liveness-visibility-2026-07-30.json)

### 5. 偏差、遗留问题与下一步

- R7 自动审计仅证明短时步进；R7.1 虽把真实护栏周期纳入完成门，仍没有消除守卫停止积分器的结构，已由 R8 取代。
- 用户实机已证明“延长完成门”不能解决持续生命期；后续复验必须同时读取 step delta、投影位移与 guidance，而不能只观察证明窗口。
- 系统论文亮度继续由用户在高亮环境中判断；本轮没有改变概览论文、沉浸背景、分析理论星图或展示星图。

## 历史工作包：M1.3g-R7

### 1. 基线

- 目标：保留 R6 精确锚点轨迹，修复热点标题闪烁、局部返回缺失、返回后巡航失活和系统普通论文过暗。
- 分支：`codex/agent-theory-perimeter-lod`
- 基线 HEAD：`38e732e`
- 当前状态：`TECHNICAL PASS / PRODUCT UNVERIFIED`
- 工作树：`dirty worktree`；保留 R2 至 R6 全部未提交代码、审计和证据，本轮不提交、不推送、不创建 PR。
- 用户锁定：标题持续跟随；右上角动态返回键；系统论文达到高亮环境可读；沉浸背景、理论 XYZ、外围巡航、R6 返回轨迹和概览论文材质不变。

### 2. 计划步骤与完成条件

| 步骤 | 实现内容 | 状态 |
| --- | --- | --- |
| 1 | 标签与论文 LOD 解耦，加入稳定碰撞迟滞和持续跟随 | PASS |
| 2 | 发布导航层级并接入动态返回键与 Escape 层级 | PASS |
| 3 | 冻结/恢复巡航生命期，完成门证明固定步重新推进 | PASS |
| 4 | 增加仅用于 Agent 理论热点系统的高亮环境可读配置 | PASS |
| 5 | R7 专项审计、构建、Rust、文档和低负载 Tauri 验收 | PARTIAL PASS |

### 3. 实际开发日志

#### 2026-07-30：R6 用户复验与 R7 开始

- 用户确认 R6 返回轨迹已经回到进入 Explore 前的精确位置，但退出后背景不再巡航；切换沉浸背景再返回会恢复，说明重新挂载的初始化构图能够解除失活。
- 源码确认标签画布会在拖拽、滚轮或论文 LOD Worker pending 时主动清空；Agent 理论包装层同时把系统视图和论文聚焦回调处理为空函数。
- R6 锚点只冻结相机、巡航检查点、插值、深度和 LOD，没有冻结推进许可与护栏生命期；返回完成帧的窄范围可见性评估可以立即阻止固定步推进。
- 系统普通论文配置仍为共享分析路径；论文聚焦时上下文和邻域分别可降至 34% 与 55%，不满足高亮环境可读要求。

#### 2026-07-30：R7 实现

- Agent 理论标签不再读取论文 LOD Worker 的 pending 状态，也不在拖拽、滚轮或 LOD 计算期间清空画布。Explore 交互时标签最多以 30 FPS 重投影；普通标签采用“两次无碰撞后显示、持续碰撞 250ms 后隐藏、160ms 渐变”的稳定迟滞。
- `AgentTheoryBackgroundCanvas` 现在发布 `overview / system / paper` 导航层级和过渡状态；双背景页增加“取消靠近 / 返回热点星系 / 返回理论全图”动态返回键，Escape 使用相同层级。
- Explore 安全锚点增加巡航累加器、推进许可、检查点保存许可、可见性护栏和最后安全检查点。锚点 LOD 提交后先恢复完整生命期；只有至少两个固定步成功推进并产生 `0.15px` 真实投影位移，才向页面发布返回完成。
- 热点系统论文新增 `agent-theory` 专用配置：基础透明度 `0.76`，远/中/近最小尺寸 `2.75 / 2.9 / 3.0px`，上限 `4.8px`，深度亮度/尺寸下限 `0.90 / 0.94`，聚焦非邻域/邻域亮度 `0.62 / 0.74`。分析理论星图和展示星图继续使用原有常量。
- 新增 `audit:agent-theory-r7`；R5 的历史回归断言同步为 R6/R7 的精确锚点和真实运动提交门，不再要求已被取代的旧中心恢复控制器。

#### 2026-07-30：自动验证与低负载桌面抽样

- `pnpm build`：`PASS`，1653 个模块完成生产构建。
- `cargo check -j 2`：`PASS`。
- `audit:agent-theory-r7`：`PASS`（12/12）。
- `audit:agent-theory-r6`：`PASS`；真实 Three.js 锚点为 3505 篇论文、59 个热点、13 个热点网格，非零滚轮、拖拽、平移和组合路径仍精确返回。
- `audit:agent-theory-r5`：`PASS`；三组确定性十分钟模拟维持全部可见性下限。
- `git diff --check`：`PASS`，只有现有 Windows 行尾提示。
- Tauri 桌面开发版正常启动并加载 Agent 理论背景；进入 Explore 后热点标题仍可见。发生交互并退出后，约 1.2 秒和 3.4 秒两个后续观察帧均显示星群继续沿外围巡航移动，未复现“返回后完全静止”。测试期间检测到用户鼠标输入，因此停止继续自动点击；论文→热点→全图动态返回和小/中/大热点系统亮度保留为用户实机复验项。

### 4. 当前验证

- 开发开始记录：`PASS`。
- R7 代码、TypeScript/Vite、Rust 增量检查及 R5/R6/R7 审计：`PASS`。
- Tauri 理论背景加载、Explore 交互往返和巡航恢复：`PARTIAL PASS`。
- 标题十秒连续交互、分层返回全链路、小/中/大热点系统亮度及用户产品视觉：`UNVERIFIED`。
- 证据：[agent-m1.3g-r7-navigation-liveness-visibility-2026-07-30.json](./evidence/agent-m1.3g-r7-navigation-liveness-visibility-2026-07-30.json)

### 5. 偏差、遗留问题与下一步

- 计划偏差：电脑操控期间检测到用户输入，遵循桌面操控安全规则停止继续自动点击，因此未自动完成五轮往返和小/中/大热点系统逐项验收。
- 下一步由用户在当前已打开的桌面开发版中复验标题持续跟随、动态返回键、五轮 Explore 往返和系统论文高亮环境可读性。
- 用户视觉确认前不得将 R7 或 M1.3g 标记为产品 `PASS`。

## 历史工作包：M1.3g-R6

### 1. 基线

- 目标：替换“发生任意交互后从最终 Explore 姿态推导外围终点”的错误返回架构；所有退出都返回进入 Explore 前保存的精确安全构图。
- 分支：`codex/agent-theory-perimeter-lod`
- 基线 HEAD：`38e732e`
- 当前状态：`IN_PROGRESS / UNVERIFIED`
- 工作树：`dirty worktree`；保留 R2 至 R5 全部未提交代码、审计和证据，本轮不提交、不推送、不创建 PR。
- 用户锁定：不调整星体数量、材质和巡航参数；输入栏与正式相机返回使用同一进度；稳定性优先于保留自由相机惯性。

### 2. 计划步骤与完成条件

| 步骤 | 实现内容 | 状态 |
| --- | --- | --- |
| 1 | Explore 入口冻结相机、投影、巡航前后状态、插值、深度、LOD、视口与快照身份 | PASS |
| 2 | 使用 `smootherstep` 位置线性插值和四元数球面插值返回精确锚点；停止导数注入 | PASS |
| 3 | 返回前预热当前与锚点论文并集；到达后用实际投影和顶点权重完成 120ms/300ms 交接门 | PASS |
| 4 | Worker v2 增加用途与投影签名，丢弃过期 Explore/cruise/旧视口响应 | PASS |
| 5 | 输入栏直接消费相机 RAF 进度；返回期间可重新进入 Explore 且保留原锚点 | PASS |
| 6 | 真实 Three.js 相机专项审计、构建、Rust、材质、文档和 Tauri 验收 | 自动与构建 PASS / Tauri UNVERIFIED |

### 3. 实际开发日志

#### 2026-07-30：R5 用户复验与根因收敛

- 用户确认“不交互立即退出”已经能回到原位，但任意滚轮、拖拽或平移都会重新滑向黑屏。这证明锚点数据本身有效，失败只存在于交互后的第二条返回路径。
- 源码复核发现旧路径仍使用自由相机最后速度、加速度和注视速度构造 quintic Hermite；单次滚轮可产生远高于巡航速度的瞬时速度，轨迹能够越过入口锚点外侧。
- 返回时普通 Screen LOD 与返回 LOD 仍可竞争；旧完成门部分读取 Worker 候选数量，而不是当前相机和实际顶点权重。输入栏还由 React 模式状态独立上移，无法与相机等待/提交门同步。

#### 2026-07-30：精确锚点、返回事务和 Worker 上下文实现

- Explore 入口现在冻结相机位置、四元数、FOV、near/far、zoom、注视距离、巡航 previous/current 检查点、插值进度、构图参数、深度 current/target、LOD 选集/目标权重/哈希、可见计数、视口和快照身份。
- 新 `agent-theory-anchor-return-v2` 只保存起点、锚点、距离比和角度比；位置严格为 `lerp(start, anchor, smootherstep(t))`，方向用同一进度 `slerp`。退出时立即清除滚轮惯性、拖拽状态和自动瞄准，不再向返回轨迹传入任何导数。
- 返回状态改为 `return-preparing → returning-anchor → return-commit → cruise`。准备阶段先把 Explore 当前权重集合与锚点集合取并集，以 90ms 预热锚点论文；预热完成前相机和输入栏都保持 Explore 位置。
- 到达锚点后用当前 Three.js 相机、论文实际权重与真实投影计算论文/热点/网格数量；连续两帧且至少 120ms 安全后，才用 300ms 将并集收敛到锚点集合，再恢复冻结的巡航 previous/current 与插值进度。
- Screen LOD Worker 协议升级为 v2，请求和响应携带 `explore / return-anchor / cruise` 用途及投影签名；返回阶段的旧用途、旧签名和主线程后备旧任务全部丢弃。
- `AgentDualBackgroundPage` 不再单独计时输入栏。画布通过 `onAgentTheoryReturnProgress` 每帧发布统一进度，输入栏据此上移；准备阶段保持底部，提交门未通过时保持最终位置。返回按钮允许中途重新进入 Explore，原入口锚点不会被替换。

#### 2026-07-30：专项自动验证

- 新增 `audit:agent-theory-r6`，直接读取活动 V20 SQLite（25,463 篇论文、160 个热点），使用真实 `THREE.PerspectiveCamera` 和实际论文投影验证立即退出、正/负滚轮、1px 拖拽、拖拽＋平移、组合操作和主动空白视野。
- 所有场景的轨迹线段越界量为 `0`；终点位置最大误差约 `7.9e-17`，终点方向误差为 `0°`，末帧最大方向步进约 `0.0077°`。
- 从可见构图开始的交互返回全程最低保持 2,940 篇论文、48 个热点和 10 个热点网格；空白视野单独验证“先预热锚点集合、再启动返回”的接线。
- Screen LOD Worker 审计扩展到 v2 用途/投影签名并达到 `13/13 PASS`；项目本地 `tsc -b` 为 `PASS`。

### 4. 当前验证

- R6 精确返回专项审计：`12/12 PASS`。
- Screen LOD Worker v2：`13/13 PASS`。
- TypeScript：项目本地 `tsc -b` 为 `PASS`。
- Vite：1,653 个模块生产构建 `PASS`；Rust：`cargo check -j 2` 增量检查 `PASS`。
- Agent 理论恒星材质：`19/19 PASS`；双背景隔离、项目文档和差异检查均为 `PASS`。
- Tauri 用户视觉：`UNVERIFIED`；必须验证单次滚轮、组合交互、空白视野、连续五轮、热点系统内部退出和背景往返。
- 证据：`docs/evidence/agent-m1.3g-r6-explore-return-2026-07-30.json`。

### 5. 已知风险

- 直线位置插值与四元数插值不能凭空让用户主动选择的空白视野在第一帧出现星体；R6 的保证是锚点集合先预热、轨迹不越界、到达后绝不把有效集合提交为空，而不是夺回 Explore 的主动观察自由。
- 返回阶段不得恢复普通 cruise/explore LOD 请求，也不得用 Worker 候选数代替实时权重和实际投影计数。
- 当前工作树跨越多个未提交阶段，后续继续局部补丁化，不覆盖无关修改。

## 前置工作包：M1.3g-R5

### 1. 基线

- 目标：修复 R4 的两项产品级失败：热点核心低于论文星而不可辨认；开放式外围巡航允许屏幕 LOD 稳定收敛为空集合。
- 分支：`codex/agent-theory-perimeter-lod`
- 基线 HEAD：`38e732e`
- 当前状态：`IN_PROGRESS / UNVERIFIED`
- 工作树：`dirty worktree`；保留 R2/R3/R4 全部未提交代码、审计和证据，本轮不提交、不推送、不创建 PR。
- 用户锁定：当前论文星材质、亮度、颜色和 LOD 保持不变；热点使用清晰克制点源/PSF；Ambient 保留外围留白但禁止近空与黑屏；Explore 允许主动看向空白。

### 2. 计划步骤与完成条件

| 步骤 | 实现内容 | 状态 |
| --- | --- | --- |
| 1 | 热点核心恢复到 `2.8–5.2px`，光学层 `5.5–10px`，诊断使用实际 Shader 公式 | PASS |
| 2 | 唯一巡航相机每 250ms 评估当前及未来 6 秒可见性，约束切向、内向和垂直构图 | PASS |
| 3 | `1440×900 balanced` 保持约 1,200 论文、12 热点、5 网格硬下限 | PASS（自动）/ Tauri 最终复验待完成 |
| 4 | Explore 返回选择未来持续安全检查点，内容下限进入 handoff 完成门 | PASS（实现与自动审计）/ 最终视觉待复验 |
| 5 | 旧 R4 检查点失效，背景往返在遮罩内验证新检查点 | PASS |
| 6 | R5 专项审计、构建、低负载 Tauri 和文档证据 | 自动 PASS / Tauri PARTIAL / 用户 UNVERIFIED |

### 3. 实际开发日志

#### 2026-07-30：R5 启动

- 复核当前运行版为 R4 脏工作树，分支与 HEAD 未变化。
- 代码确认热点核心实际为 `1.1–1.6px`、概览 Sphere 槽为 0，低于近景论文核心；旧诊断只统计视锥内坐标，不能证明热点可辨认。
- 代码与 R4 证据确认运行期自动构图被完全关闭，返回完成门只验证任务和选集稳定，稳定的空集合也能通过。
- 停止当前桌面/Rust 热更新进程，避免开发期间重复触发 WebGL。

#### 2026-07-30：热点层级、持续可见性与返回门实现

- Agent 理论概览热点改为共享实体索引的 `2.8–5.2px` 锐利亮核和 `5.5–10px` 克制 PSF；概览 Sphere 全部关闭，进入热点系统后仍保留既有局部光球。
- 新增 `agent-theory-visibility-v1`：按视口面积解析论文下限，以全部 160 个热点和最多 2,048 篇分层论文每 250ms 评估当前及未来 6 秒构图；不安全巡航步由同一控制器拒绝。
- 巡航检查点增加可见性版本；旧 R4 检查点只保留会话种子和时间，恢复前必须重新求解安全构图。
- Explore 返回的完成门同时要求实际视口论文数、热点数、热点网格、未来 6 秒预测、深度和 LOD 全部稳定；空集合或近空集合不能进入普通巡航。

#### 2026-07-30：真实 Tauri 暴露第二层计数缺陷并修订

- 第一轮低负载 Tauri 复验确认 Ambient 和 Explore 已出现可辨热点，Explore 标签能对应真实热点；但退出后仍停留在近黑画面的 `return-handoff`，完成门正确拒绝提交。
- 诊断确认旧 `perceptiblePaperCount` 把 `±1.35 NDC` 护栏内的屏外预加载论文也计为当前可见论文；屏幕 LOD 同时没有使用已经计算出的 `viewportTargetCount`，导致返回终点可以保留数千个屏外顶点而视口为空。
- Screen LOD 升级为 `agent-theory-screen-lod-v3`：先填满当前视口，再使用剩余预算填充护栏；运行时可见门只读取 `viewportSelectedCount`。专项夹具达到 `4,340/4,340` 视口目标，同时保留 3,556 个护栏实体。
- 若采样安全构图与真实 WebGL/Screen LOD 仍不一致，同一 `return-handoff` 控制器会在 800ms 内连续转向已验证的中心安全包络并预取该终点 LOD；中心回退方向在交接完成前不得被普通巡航转向覆盖。
- 最后一次自动桌面取样时前台窗口被用户切换，Computer Use 返回的截图不再可靠对应目标程序；按照安全规则停止继续输入。因此第二次修订后的最终 Tauri 返回路径没有被推断为通过，保留给用户复验。

#### 2026-07-30：用户确认无交互退出也会滑向黑屏

- 用户补充确认：进入 Explore 后完全不操作并立即退出，静止星图仍会沿退出路径滑到空区。这排除了自由相机输入和热点系统交接，直接证明旧 `createAgentTheoryReturnTransition()` 根据最终相机方位重新制造返回终点的策略错误。
- Explore 入口现在冻结已通过当前可见性门的巡航检查点、插值进度、相机位置/四元数、注视点和构图参数。
- 无交互退出在 `0.05°` 与相对位置容差内直接恢复同一巡航状态，不再运行最低 1.6 秒的伪返回动画。
- 有交互退出优先以进入时的安全检查点为 C2 终点；只有该构图在当前视口失效时才重新搜索。真实渲染仍不安全时继续使用同一 handoff 内的 800ms 安全包络恢复。

### 4. 当前验证

- 用户产品视觉：R4 `FAIL`；R5 `UNVERIFIED`。
- 自动验证：R5 可见性/热点审计 `14/14 PASS`；Screen LOD Worker `12/12 PASS`；交互 `23/23 PASS`；自由观察/连续性/热点 `25/25 PASS`；周期安全壳 `8/8 PASS`；恒星材质 `19/19 PASS`。
- 构建：项目本地 `tsc -b`、Vite 生产构建和 `cargo check -j 2` 均为 `PASS`。
- Tauri：初始 Ambient、热点与 Explore 为 `PASS`；第一次返回复现近黑并促成第二次修订；第二次修订后的最终返回与背景往返仍为 `UNVERIFIED`。
- 证据：`docs/evidence/agent-m1.3g-r5-visibility-hotspots-2026-07-30.json`。

### 5. 已知风险

- 可见性约束必须保留单一相机写入者，不能恢复会产生跳动的第二套重构图。
- 内容下限预测只能使用有界分层样本和全部热点，不能把 25,463 篇同步扫描重新带回 RAF 热路径。
- 当前工作树包含多阶段未提交修改，实施必须局部补丁化且不得覆盖无关文件。
- 中心安全包络只在真实渲染计数与预测不一致时作为同控制器内的连续降级；最终视觉仍需确认其不会显得突然抢回中心。

## 前置工作包：M1.3g-R4

### 1. 基线

- 目标：修复 R3 实机暴露的四项产品缺陷：拖拽期间屏外论文不能实时补齐、Ambient 长时仍会跳动、退出 Explore 时相机/深度/论文集合分批跃迁，以及热点概览仍像圆片或过早进入光球。
- 分支：`codex/agent-theory-perimeter-lod`
- 基线 HEAD：`38e732e`
- 当前状态：`IN_PROGRESS / UNVERIFIED`
- 工作树：`dirty worktree`；保留 R2/R3 未提交代码、审计、证据与当前 R4 增量修改。
- 发布边界：本轮不提交、不推送、不创建 PR、不发布。

### 2. 计划步骤与完成条件

| 步骤 | 内容 | 完成条件 | 状态 |
| --- | --- | --- | --- |
| 1 | 护栏增量 LOD Worker | Worker 持有稳定论文目录，交互期 20Hz 计算 `±1.35 NDC` 护栏选集，新星 90ms 渐显并延迟退场 | PASS（实现与自动审计）/ 持续按压视觉 UNVERIFIED |
| 2 | 周期 C2 外围安全壳 | 96 扇区拟合为位置、一阶和二阶连续的安全壳；全部实体保持至少 6% 径向安全余量 | PASS（数学审计） |
| 3 | 运行期永不自动纠正构图 | 初始就绪可确定性选择构图；巡航启动后不得因低可见度启动第二相机写入者 | PASS（实现与数学审计）/ 长时视觉 UNVERIFIED |
| 4 | 返回原子视觉事务 | 到达前准备终点相机、深度和 LOD；完成帧只提交一次视觉状态，handoff 仅交接巡航速度 | PASS（实现与自动审计）/ 多路径视觉 UNVERIFIED |
| 5 | 热点恒星 PSF 层级 | Ambient/Explore 只使用紧致核心、非圆 PSF 肩部和稳定短芒；进入热点系统后才交接真实光球 | PASS（静态专项审计）/ 视觉 UNVERIFIED |
| 6 | 全量自动验证和低负载桌面验收 | 构建、专项/回归/文档审计通过，Tauri 实机确认拖拽、长时巡航和退出连续性 | 自动 PASS / Tauri PARTIAL PASS / 用户 UNVERIFIED |

### 3. 实际开发日志

#### 2026-07-29：R3 用户复验失败与 R4 启动

- 用户实机确认：按住左键拖拽时，新视区论文直到松手后才出现；Ambient 等待数分钟仍能捕捉到跳动；退出 Explore 时相机、深度和论文 LOD 分批恢复；热点概览仍缺乏恒星质感。
- R3 的自动技术结果保留为 `PASS`，但产品视觉结论改为 `FAIL`。R4 不再继续微调 R3 的冻结式冷路径，而是替换为 Worker 护栏增量 LOD、连续安全壳、单一返回事务和概览 PSF-only。
- 原始理论 XYZ、论文/热点身份、沉浸背景、独立理论星图、展示星图、数据库、UMAP 和活动快照继续不在修改范围。

#### 2026-07-29：Worker 护栏 LOD 阶段中结果

- 新增专用 Worker、协议和客户端。Worker 持有稳定论文 ID、热点键、局部位置和尺寸目录；主线程交互请求只发送相机 `localToClip` 矩阵、视口、质量、节奏和 previous/forced mask。
- Worker 在 `±1.35 NDC` 护栏内投影和选择，active/idle 节奏分别为 50ms/250ms；响应返回 visible/incoming/retiring/resident typed array，客户端采用 latest-request-wins 丢弃旧 revision。
- `agent-theory-screen-lod-worker-v1` 专项审计为 `PASS`（11/11）：1440×900 样例中视口选择 4,340，护栏预留 3,556；模拟平移产生 1,079 个 incoming 和 1,173 个 retiring。
- Worker 只在真实 WebGL 就绪门通过后初始化，并随画布资源唯一销毁。拖拽、滚轮、返回和短暂瞄准使用 20Hz 活跃请求；revision gate 只接受最新相机版本。
- Worker 客户端把队列限制为一个执行中请求和一个最新待执行请求，尚未开始的旧请求被最新相机覆盖，避免持续拖拽让 Worker 在后台积压过期的 25K 投影与排序。
- Worker 不可用时不冻结选集，而是使用每个 RAF 最多约 1.5ms 的分块主线程后备投影，并在空闲槽提交选择。

#### 2026-07-29：连续安全壳阶段中结果

- `agentTheoryPerimeter` 升级为 `agent-theory-perimeter-v2-c2`：保留 96 扇区原始统计与保守包络，使用周期三次 B 样条提供连续半径、一阶/二阶导数、切线和外法线。
- 使用全部 25,463 篇论文和 160 个热点验证安全余量；不足时只允许确定性整体外扩，不在运行时更改构图。
- `agent-theory-perimeter-c2-continuity-r4-v1` 为 `PASS`（8/8）：10 分钟、36,000 步重放无非有限值，自动安全重构图请求为 0，最小实体径向安全比为 `0.07083721068980867`。
- 现有外围巡航专项审计继续为 `PASS`（19/19），10 分钟覆盖 96/96 扇区，5 秒近景位移中位数约 `9.1668px`。

#### 2026-07-29：热点 PSF 与返回原子事务

- `agent-theory-hotspot-r4-v1` 为 `PASS`（9/9）：概览热点核心为 1.1–1.6px 原生分辨率点源，光学肩部为 5–11px 非圆 PSF；Ambient/Explore 不分配概览 Sphere，真实光球只在进入热点系统的最后 400ms 交接。
- 返回期间保持 LOD 活跃，并在约 72% 进度使用终点相机预取终点集合；深度范围同步向终点收敛。handoff 只交接巡航速度，不再安排完成后延迟 LOD 或深度刷新。
- 最终只读复核发现旧实现虽计算待办数和深度误差，却仍无条件切回巡航；终点 Worker 不可用时还会同步扫描 25,463 篇论文。该阻断已修复：同步回退改为 1.5ms 分块路径，完成门要求零待办、深度误差不超过 1%、LOD 完成且论文数/选集哈希连续稳定 500ms。
- 诊断新增返回未完成视觉任务数与深度误差比，自动审计确认完成帧不再解除冻结或触发第二批论文刷新。
- 修复后的第二次只读复核确认上述完成门、终点分块后备和 Worker 请求合并均已闭环，未发现新的阻断；保留的一般性性能风险是分块投影后的最终选择/排序仍在单个空闲回调中完成。

#### 2026-07-29：自动闭环与低负载桌面抽样

- TypeScript、Vite 生产构建和 `cargo check -j 2` 通过；Vite 产物包含独立 `agentTheoryScreenLod.worker` chunk。
- `pnpm audit:agent-theory-r4` 全部通过：Worker 11/11、交互/运行期 23/23、自由观察/连续性/热点 25/25、C2 安全壳 8/8、热点 PSF 9/9；10 分钟无 GPU 巡航重放无自动重构图。
- 在现有 Tauri balanced 窗口中进入理论背景与 Explore，执行一次 250px 大幅拖拽：拖拽结束后的首帧已有新视区论文，没有旧版整片空白。
- 加入最终完成门后再次退出：没有观察到完成后延迟补批，但返回构图落入近乎空白的自然稀疏扇区。按用户锁定的“巡航永不自动纠正构图”决定，程序没有强制转回中心；该画面是否可接受不能由技术审计决定。
- 操控 API 只能返回完成后的拖拽，不能在鼠标保持按下的中间帧截图，因此“按住期间”的最终视觉仍必须由用户亲自验收；本次也没有执行 60–90 秒长时 GPU 观察或热点系统进入，避免扩大蓝屏风险。

### 4. 当前验证

- R4 Worker 模块专项审计：`PASS`（11/11）
- R4 周期 C2 安全壳专项审计：`PASS`（8/8）
- R4 外围巡航专项审计：`PASS`（19/19）
- R4 热点 PSF 专项审计：`PASS`（9/9）
- R4 TypeScript / Vite / Rust：`PASS`
- R4 组合自动审计：`PASS`（Worker 11/11、交互 23/23、R3/R4 连续性 25/25、C2 8/8、热点 9/9）
- R4 返回原子视觉事务：`PASS`（实现与自动审计）/ 用户视觉 `UNVERIFIED`
- R4 Worker 运行期初始化、销毁与后备：`PASS`（实现与自动审计）
- R4 Tauri 低负载验收：`PARTIAL PASS`（理论加载、单次拖拽）；普通退出无延迟补批但自然稀疏构图视觉 `UNVERIFIED`
- R4 用户产品视觉：`UNVERIFIED`
- R4 阶段中证据：[agent-m1.3g-r4-continuous-visibility-return-hotspots-2026-07-29.json](./evidence/agent-m1.3g-r4-continuous-visibility-return-hotspots-2026-07-29.json)

### 5. 已知风险

- 自动审计与短时 Tauri 抽样不能替代用户在持续按住拖拽、多个返回起点和热点系统内退出时的肉眼判断。
- 60–90 秒 Ambient 与热点 PSF/光球交接尚未做 GPU 实机验收；数学长时重放只能证明路径连续，不证明最终观感。
- Worker 后备路径已把 25K 投影分块到 RAF，但最终选择与排序仍在单个 idle callback 内；只有 Worker 真正不可用时才会进入该路径，后续如实机发现尾部长任务再继续分段化。
- 当前工作树包含多阶段未提交改动；所有文档必须继续区分自动技术 `PASS`、桌面 `PARTIAL PASS` 和产品视觉 `UNVERIFIED`。
- 本机近期存在 NVIDIA 图形栈蓝屏记录，只允许 balanced、短时、窗口化测试。

### 6. 遗留问题和下一步

1. 由用户在最新 Tauri 开发版持续按住拖拽，确认护栏论文在按住期间实时补齐。
2. 用户从多个全局位置和热点系统内部退出，确认相机、深度、论文与标签没有末端分批跃迁。
3. 用户检查 60–90 秒 Ambient 连续性、热点 PSF 质感和进入热点后的 400ms 光球交接。
4. 保持 `dirty worktree`；本轮不提交、不推送、不创建 PR、不发布。

## 前置工作包：M1.3g-R3

### 1. 基线

- 目标：保留原始理论 XYZ、外围随机巡航和已通过的屏幕 LOD，在 Agent 理论背景中实现真正自由观察，消除返回末端与 Ambient 抖动，并建立稳定热点层级和更清晰的近景论文亮核。
- 分支：`codex/agent-theory-perimeter-lod`
- 基线 HEAD：`38e732e`
- 当前状态：`IN_PROGRESS / UNVERIFIED`
- 工作树：`dirty worktree`；原样保留 M1.3g-R2 修改、审计、证据和未跟踪验收目录。
- 发布边界：本轮不提交、不推送、不创建 PR、不发布。

### 2. 计划步骤与完成条件

| 步骤 | 内容 | 完成条件 | 状态 |
| --- | --- | --- | --- |
| 1 | Explore 自由观察 | 左拖自由视线、滚轮沿视线推进、Shift/中键平移，进入首帧无跳变 | PASS（自动；左拖 Tauri 已观察） |
| 2 | 返回外围与 handoff | C2 返回和 450ms 交接的位置、方向、速度连续，末帧不集中刷新 | PASS（自动）/ Tauri UNVERIFIED |
| 3 | 巡航、深度和 LOD 平滑 | 固定步插值、900ms 深度逼近、低频空闲 LOD 与重构图冷却无可见阶跃 | PASS（自动） |
| 4 | 热点独立视觉层级 | Ambient 至少 16 个热点、至少 6 个屏幕区域，视锥外不占 Sphere 槽 | PASS（自动）/ 视觉 UNVERIFIED |
| 5 | 近景论文亮核增强 | 近景更亮且锐利，尺寸不超过 4.8px，无 Bloom 或宽软雾 | PASS（自动）/ 视觉 UNVERIFIED |
| 6 | 自动审计、证据和低负载 Tauri 验收 | 构建、专项审计、文档审计和用户视觉结论完整 | PARTIAL：自动 PASS，桌面/用户未完成 |

### 3. 实际开发日志

#### 2026-07-29：M1.3g-R3 启动

- 用户确认 M1.3g-R2 的外围巡航逻辑总体可继续使用，但 Explore 仍被固定视觉中心约束；退出 Explore 返回末端发生明显跃迁；Ambient 静置偶发抖动。
- 用户同时确认近景论文可再小幅提亮，热点在 Ambient 中不可辨认、Explore 中也常常消失，需要独立于论文密度的主星层级。
- 锁定自由视线、沿视线推进、局部平移、可取消实体瞄准、C2 返回加 `return-handoff`、固定步渲染插值、深度/LOD 冷路径平滑、热点独立层级和近景亮核增强。
- 原始理论 XYZ、外围随机巡航、沉浸背景、独立理论星图、展示星图、数据库、UMAP 和活动快照不在修改范围。
- 开发开始时仅完成文档启动记录；后续实际实现和验证如下。

#### 2026-07-29：自由观察与连续相机实现

- 相机模式落地为 `cruise → explore-free → returning → return-handoff`。进入 Explore 直接捕获当前巡航位置和视线，不再创建 350ms 语义 Orbit 枢轴过渡。
- 左拖以约 `0.12°/px` 改变 yaw/pitch，pitch 限制在 `±85°`；滚轮沿当前 forward 平滑推进，Shift＋左拖或中键沿相机局部平面平移。
- 双击论文或热点执行 500ms 短暂瞄准，任何手动输入立即取消；自由相机位置限制在理论包围体约 1.5 倍范围内。
- 返回轨迹分别使用巡航位置速度与真实注视目标速度。到达安全壳后进入 450ms `return-handoff`，期间继续冻结深度和屏幕 LOD 冷路径。

#### 2026-07-29：巡航、热点与论文材质修订

- 巡航保存 previous/current 固定步状态，并用 accumulator 余量进行渲染插值；单帧最多推进三步，超过 100ms 的积压不追赶。
- 深度目标使用最多 2,048 篇分层论文计算，以 900ms 时间常数连续逼近。屏幕 LOD 采用 1.2s 空闲评估、4% 变化阈值和 300ms 交接；低可见度重构图增加 2s 持续条件与 8s 冷却。
- 热点核心约束为 `2.6–6px`，光学层为 `4.5–9px`；Sphere LOD 使用 `12px` 进入、`9px` 退出迟滞，最多 12 个且只允许真实视锥内热点占用。
- Ambient 构图单独惩罚少于 16 个热点或少于 6 个屏幕区域；热点核心加入极小裁切空间深度偏置，但整体仍保持深度测试。
- 近景论文核心透明度下限提高到 `0.86`，尺寸倍率最高 `1.06`，核心辐射上限 `1.12`，光学肩部透明度上限 `0.15`；未加入 Bloom、景深、运动模糊或时间透明度。

#### 2026-07-29：自动技术验证与桌面部分验收

- 项目本地直接执行 `tsc -b` 和 `vite build` 均为 `PASS`；`cargo check -j 2` 为 `PASS`。`pnpm exec` shim 异常未用于判断构建失败，也未清理或重装 pnpm Store。
- R3 专项审计最终扩展为 25/25 并保持 `PASS`。R3 版交互审计、外围巡航审计、星图视觉不变量、理论相机、热点过渡、双背景隔离、理论恒星材质和项目文档开始态审计均为 `PASS`。
- R3 专项审计读取活动快照 `project-default:v20:1784365136031`，确认 25,463 篇论文、160 个热点和原始坐标哈希 `192bf4e585f18819fb8d6874df5adb6de61f18c82753d8d08f8fda3617cc730d` 保持不变。
- Tauri balanced 低负载检查确认理论星体正常可见；进入 Explore 后拖动会明显改变构图且星体没有消失，证明自由视线真实生效。
- 检测到用户输入后停止进一步 GUI 操作。滚轮、平移、双击瞄准、普通/热点系统完整返回和最终用户视觉仍为 `UNVERIFIED`，不得由自动审计替代。

#### 2026-07-29：最终边界复核

- 热点单击进入改为延迟 500ms 确认；若同一实体发生双击，则取消待执行的单击进入，只保留自由相机瞄准，避免一次手势触发两条互斥交互。
- Explore 的 reset / fit / top 已从旧 Orbit 参数写入改为相机位置 lerp 与四元数 slerp，实际恢复最佳视角、适配视角或顶视图，并在完成后回写自由相机姿态。
- Sphere LOD 退场期间继续持有实例所有权；current 与 retiring 合计仍限制为 12，预算溢出时实体立即归还点源，避免复制、超额实例或退场闪现。
- 论文核心辐射上限 `1.12` 只随 `vAgentNearness` 渐进生效，中远景不被统一提亮。
- 返回与 `return-handoff` 的最后一帧重新纳入真实热点世界参考的投影误差和相机方向变化诊断，避免状态切换前漏采连续性数据。
- R3 专项审计由 20 项扩展为 25 项并全部通过；最终直接 TypeScript、Vite 构建、R3 交互审计和外围审计继续为 `PASS`。Tauri 完整交互仍未复验。

### 4. 当前验证

- R3 TypeScript / Vite / Rust：`PASS`
- R3 专项审计：`PASS`（25/25）
- R3 交互、外围、视觉不变量、理论相机、热点过渡、双背景和恒星材质回归：`PASS`
- R3 项目文档审计：`PASS`
- R3 低负载 Tauri：`PARTIAL PASS`（星体可见、Explore 左拖自由观察生效）
- R3 Tauri 完整交互与返回：`UNVERIFIED`
- R3 用户产品视觉：`UNVERIFIED`
- R3 证据：[agent-m1.3g-r3-free-look-continuity-hotspots-2026-07-29.json](./evidence/agent-m1.3g-r3-free-look-continuity-hotspots-2026-07-29.json)

### 5. 已知风险

- 当前工作树包含 R2/R3 未提交修改、审计和证据；技术实现已经通过自动验证，但仍不得写成产品视觉完成。
- 返回连续性同时涉及相机、深度范围、屏幕 LOD 和检查点调度；只平滑相机位置不能消除末端视觉跃迁。
- `pnpm exec` shim 异常仍存在；本轮使用项目本地可执行文件完成构建验证，未扩大环境变化。
- 本机近期存在 NVIDIA 图形栈蓝屏记录，只允许 balanced、短时、窗口化测试，不执行全屏、4K 录制或 GPU 压力测试。

### 6. 遗留问题和下一步

1. 由用户检查滚轮沿视线推进、Shift/中键平移与双击瞄准。
2. 完成普通 Explore 和热点系统内部退出的完整 `return-handoff` 桌面观察。
3. 人工检查 30 秒 Ambient 稳定性、热点层级和近景论文亮度；用户确认前整体阶段继续 `IN_PROGRESS / UNVERIFIED`。
4. 保持 `dirty worktree`；本轮不提交、不推送、不创建 PR、不发布。

## 前置工作包：M1.3g-R2

### 1. 基线

- 目标：不修改真实理论 XYZ 的前提下，降低外围理论背景的无效密度、提高可辨识核心，并修复 Explore 交互后空白及进入/退出卡顿。
- 分支：`codex/agent-theory-perimeter-lod`
- 基线提交：`220a5c4`
- M1.3g/R1 技术提交：`2d14b8b`（`feat(agent): add peripheral theory cruise and stellar lod`）
- 当前状态：`TECHNICAL PASS / PRODUCT VISUAL FAIL`
- R2 开发基线：`38e732e`；开发开始前工作树 clean。
- 工作树：`dirty worktree`；当前只允许 M1.3g-R2 代码、审计、证据和六份权威文档。
- 发布边界：只允许本地实现和文档提交；不推送、不创建 PR、不发布。

### 2. 计划步骤与完成条件

| 步骤 | 内容 | 完成条件 | 状态 |
| --- | --- | --- | --- |
| 1 | PCA 主平面、96 扇区外围包络和安全间隔 | 相机不进入实体包络，剖面确定可审计 | PASS |
| 2 | 会话随机巡航、检查点和轻微鼠标视差 | 路径连续、无循环传送、会话可恢复 | PASS |
| 3 | Explore 冻结与最近外围连续返回 | 无跳变，热点系统先退出再返回 | IN_PROGRESS |
| 4 | Point / PSF / Near-PSF / Sphere LOD | 普通论文无圆片，真实热点光球最多 12 个 | PASS |
| 5 | 专项审计、证据和隔离回归 | 数学、Shader、身份和文档检查通过 | PASS |
| 6 | 低负载 Tauri 视觉验收 | 技术结果记录，产品视觉等待用户确认 | UNVERIFIED |
| 7 | Explore 交互性能治理 | 手势热路径无全量 LOD 重选，慢帧不永久停掉 RAF | PASS（自动） |

### 3. 实际开发日志

#### 2026-07-29：M1.3g-R2 启动

- 用户确认沉浸背景正常；理论背景论文星过小、过暗、过密，Explore 鼠标交互后全体消失，进入/退出仍有卡顿。
- 只读检查确认当前 Ambient 以 35%–65% 全量实体进入视锥为目标，可能同屏包含约 9,000–16,000 篇论文；Shader 允许 `0.72px` 论文核心，且计算出的深度尺寸倍率未应用到最终点尺寸。
- Explore 将距离约 18 世界单位的巡航方向辅助点直接吸收为 Orbit 中心，而当前星系外围半径约为 `0.51`；拖拽与滚轮因此会立即把星系甩出视锥。
- 返回外围未进入 60 FPS 过渡调度，且全量 25,463 篇深度投影与排序可能在过渡中造成主线程卡顿。
- 用户锁定渐进式屏幕 LOD、约 350ms 轻微 Explore 稳定构图和最近外围连续返回。

#### 2026-07-29：R2 Explore 卡顿与视觉假死修订

- 实时进程核对确认 Tauri 与 WebView2 均为 `Responding=True`，静止采样没有 CPU、内存或显卡饱和；最新日志没有 Shader、WebGL 或崩溃错误。问题不是操作系统层面的进程假死。
- 源码性能剖析确认三段同步热路径：Explore 入口二次扫描 25,463 篇论文；拖拽/缩放最高每 250ms 全量投影并排序；每次新选择又在 180ms 内逐帧遍历全部权重并上传属性缓冲。
- 拖拽、滚轮惯性、Explore 进入和返回外围现在冻结 LOD 选择与既有交接。相机停稳 140ms 后才经 `requestIdleCallback` 执行一次刷新；外围巡航刷新间隔下限为 750ms。
- Explore 枢轴改为遍历当前 3,500–5,500 个稳定 LOD 选择，并使用预计算理论边界，不再额外扫描全部论文。交互期间标签暂停绘制，停稳后随 LOD 一次恢复。
- LOD 选择器将稳定哈希、优先级和网格索引移出排序比较器；权重交接只遍历实际变化索引。选集哈希保持不变：balanced `073ff907`、high `0ac96a9e`。
- 旧慢帧机制连续触发后会永久停止全图环境 RAF，是“星图像卡死”的直接放大因素。Agent 理论降级现改为保留约 18 FPS 环境节奏；Agent 理论热点系统静置目标由 12 FPS 提高到 24 FPS。分析理论星图和展示星图继续使用原策略。
- TypeScript 增量检查与 `audit:agent-theory-interaction` 已通过；桌面热更新后的人工连续拖拽、滚轮和热点内静置仍需用户复验。

#### 2026-07-29：R2 用户视觉结论

- 用户确认 Explore 进入后视觉中心仍被固定，无法进行真正自由观察。
- 从 Explore 返回外围接近结束时发生一次明显跃迁；Ambient 静置也会不定时抖动。
- 热点在 Ambient 中未形成可辨识层级，Explore 中也经常消失；近景论文仍可小幅提亮。
- 因此 R2 自动技术结果保留为 `PASS`，产品视觉结论改为 `FAIL`，后续由 M1.3g-R3 取代固定 Orbit 枢轴、末帧切换和热点可见规则。

#### 2026-07-29：失败归档与 M1.3g 启动

- 停止现有 Tauri 进程，确认脏工作树只包含 M1.3f 代码、审计和文档。
- 将 M1.3f 记录为“技术审计 PASS、产品视觉 FAIL”，创建本地归档提交 `220a5c4`。
- 从归档提交创建 `codex/agent-theory-perimeter-lod`。
- 新增独立 `agentTheoryPerimeter` 数学模块，开始实现 PCA 外围包络、会话随机检查点、固定步长巡航、最近外围返回和恒星 LOD 判定。
- 开始将 Agent 理论热点拆为共享索引的 Sprite/真实 Instanced Sphere 交接；独立理论星图和展示星图继续绕过该路径。

#### 2026-07-29：R1 理论背景空白事故

- 首次 Tauri 运行中 Agent 理论背景全黑。控制台确认热点光球顶点 Shader 手动声明了 `instanceColor`，与 Three.js 为 `InstancedMesh` 自动注入的同名属性冲突；程序随后每帧继续调用无效 program。
- 原专项审计只检查 Shader 源码和简化投影，没有执行真实 WebGL 编译、链接与 Three.js 视锥检查，因此产生“自动 PASS、实机空白”的错误结论。本事故记为 M1.3g 技术 `FAIL`。
- 删除手动属性声明，保留 `instanceSeed` 和 `instanceBlend`；六类 Agent 理论材质全部具名。增加 `renderer.compile`、program `LINK_STATUS`、Three diagnostics、首帧 WebGL error 和真实语义可见数量组成的就绪门。
- 编译或首帧失败会停止 RAF、禁止保存巡航检查点，并由双背景页面显示“理论背景渲染失败”和重试入口，不再撤掉遮罩后持续黑屏。

#### 2026-07-29：真实桌面复验暴露坐标单位错配

- Shader 修复后程序不再报错，但首帧仍近似全黑。实际场景统一乘以 `APP15_COORD_SCALE=0.0047`，而外围 PCA、安全壳与相机仍使用未缩放坐标，相机距离被放大约 200 倍；简化投影无法暴露该单位错配。
- 将缩放常量提升为 `APP15_THEORY_COORDINATE_SCALE`，纵深增强坐标在进入外围剖面前即换算为 Three.js 世界单位。外围安全壳中位半径现为 `0.508979`，最大半径为 `0.529916`。
- 坐标修正后实机立即显示星体，但热点 PSF 和真实光球仍沿用原始世界直径，形成巨型蓝色光弧。随后将热点 `worldDiameter` 和 Sphere 半径同步乘以同一缩放常量，光弧消失。
- 巡航实际视锥增加 5×5 确定性候选搜索；连续三帧真实可见比例低于 5% 时只调整注视方向，不改变安全壳位置，并记录 `perimeter-reframe`。无效检查点版本升级为 `agent-theory-perimeter-v1-r1`。

#### 2026-07-29：R1 验证结果

- 外围专项审计：`PASS`。活动快照包含 25,463 篇论文、160 个热点；原始坐标 SHA-256 仍为 `49c931dad6ccee730f7e6939010971c42a829db1a731c4feb77a570a8388bf37`。
- 96 扇区 8 分钟覆盖率 `91.67%`；原始巡航可见比例中位数 `35.68%`；5 秒近景位移中位数 `16.248px`；返回安全壳单调违规 `0`。
- 恒星材质、双背景隔离、M1.3f 深度和星图视觉不变量审计均为 `PASS`。TypeScript 和 Rust `cargo check -j 2` 为 `PASS`。
- Tauri balanced Ambient 首帧可见，15 秒内没有间歇性黑屏；热点尺寸修正后不再出现巨型蓝色光弧，控制台未再出现本事故相关 Shader/program 错误。
- 进行 Explore 桌面操作时检测到用户输入，依照电脑操控边界停止后续 GUI 操作。因此 Explore、最佳视角重置、返回外围、背景往返与 100% 像素材质检查本轮保持 `UNVERIFIED`。

### 4. 当前验证

- 类型检查：`PASS`
- 外围数学专项审计：`PASS`
- 恒星材质、双背景隔离、深度和视觉不变量审计：`PASS`
- 生产构建：`PASS`
- Rust 增量检查：`PASS`
- 低负载 Tauri Ambient：`PASS`
- 低负载 Tauri Explore / 返回 / 背景往返 / 100% 像素检查：`UNVERIFIED`
- R2 Explore 交互性能专项审计：`PASS`
- R2 TypeScript 增量检查：`PASS`
- R2 Vite 生产构建：`PASS`（约 9.05 秒）
- R2 证据：[agent-m1.3g-r2-theory-interaction-2026-07-29.json](./evidence/agent-m1.3g-r2-theory-interaction-2026-07-29.json)
- R2 热更新桌面连续拖拽/滚轮复验：`UNVERIFIED`
- 用户产品视觉：`FAIL`

### 5. 已知风险

- 本机近期存在 NVIDIA 图形栈蓝屏记录，本阶段不执行全屏、4K 动画录制或 GPU 压力测试。
- 35%–65% 局部可见比例和 5 秒近景 8–18px 位移需要使用真实活动载荷校准，不能只由静态 Shader 审计替代。
- Sprite/Sphere 交接必须保留同一实体身份，避免视觉复制和拾取分叉。
- 真实 WebGL 就绪门能够阻止编译失败黑屏，但最终构图与 LOD 质感仍需桌面人工检查；自动技术 `PASS` 不得提升为产品视觉 `PASS`。

## 归档工作包：M1.3f

### 1. 基线

- 目标：在不修改原始理论 XYZ、独立理论星图和展示星图的前提下，让 Agent 理论背景形成可感知的前中后景、真实视差和锐利深空层次。
- 分支：`codex/agent-dual-background-v2`
- 基线提交：`07de19deedd051bb17f19fc602ca1ec11006d0f7`
- 当前状态：`TECHNICAL PASS / PRODUCT VISUAL FAIL`
- 工作树：开发开始时为 clean；后续未提交修改需在本节持续记录。
- 发布边界：允许创建两个本地提交；不推送、不创建 PR、不发布。

### 2. 计划步骤与完成条件

| 步骤 | 内容 | 完成条件 | 状态 |
| --- | --- | --- | --- |
| 1 | 建立 AgentTheoryDepthProfileV1 与内存显示载荷 | 比例确定、范围 1.0–2.2、原始载荷不变 | PASS |
| 2 | 实现 Agent 专用深度感知视角和 Ambient 共轨相机 | 视角确定、漂移有界、Explore 无跳变 | IN_PROGRESS |
| 3 | 实现论文/热点前中后景材质 | 近远尺寸比达标，保持锐利和主题色 | PASS |
| 4 | 实现世界锚定非语义装饰层 | 确定生成、不可拾取、优先降级 | PASS |
| 5 | 新增专项审计和证据 | 数学、材质、隔离、文档审计通过 | IN_PROGRESS |
| 6 | 低负载 Tauri 复验与文档回填 | 技术结果记录，产品视觉等待用户确认 | PLANNED |

### 3. 实际开发日志

#### 2026-07-29：M1.3f 开始

- 用户确认 M1.3e 的 Agent 理论背景仍像薄板状、低饱和二维数据点云，缺少深邃星空感。
- 只读统计显示当前理论论文坐标 Z 轴标准差约为 X/Y 平均标准差的 13%；现有最佳视角仅优化二维可读性，没有深度压缩与视差目标。
- 锁定 Agent 专用自适应 Z 轴增强、深度感知视角、锐利前中后景、微幅共轨相机和明确非语义的稀疏深空装饰层。
- 独立理论星图、展示星图、原始载荷、数据库、UMAP 和沉浸流场不在修改范围。

#### 2026-07-29：纵深、构图与材质实现

- 新增 `AgentTheoryDepthProfileV1`。活动快照只读统计为 X/Y/Z 标准差 `51.241440 / 48.171973 / 6.634769`，原始 Z 比例 `0.133478`，自适应增强比例 `1.947881`。
- `AgentTheoryBackgroundCanvas` 在内存中派生增强显示载荷；原始载荷不被修改。理论相机姿态存储键升级为 `v3-agent-depth`，避免旧原始空间姿态直接套用到增强空间。
- 新增 Agent 专用最佳视角评分。原有分析理论视角选择器继续保持原权重和输出。
- 论文和热点 Shader 增加连续深度层次；近景保持主题色和较大锐利星核，远景只变小、变暗，不经过模糊。
- 新增确定的世界锚定装饰层。balanced 使用 500 颗装饰恒星和 1,000 个暗微尘，所有对象明确无业务身份、不可拾取。
- Ambient 相机加入有界多频共轨漂移；进入 Explore 时吸收当前偏移并冻结，退出后从零偏移平滑恢复。

#### 2026-07-29：首次专项审计

- M1.3f 深度专项审计已读取活动 SQLite，确认 25,463 篇论文和 160 个热点身份不变。
- 原始坐标 SHA-256 为 `49c931dad6ccee730f7e6939010971c42a829db1a731c4feb77a570a8388bf37`，应用内存显示变换后原始对象哈希保持不变。
- 第一次相机曲线在 8 秒内只产生 `0.237px` 的近远景位移差，不满足计划阈值。仅调整有界曲线的相位和连续波形整形后，位移差提高到 `1.640px`；最大角度和距离仍未超过锁定范围。

### 4. 测试与证据

- 计划证据：`docs/evidence/agent-m1.3f-theory-depth-2026-07-29.json`
- TypeScript 增量检查：`PASS`。
- M1.3f 深度专项审计：`PASS`。
- M1.3e 理论恒星材质审计：修订后 `PASS`。
- 独立理论最佳视角审计：`PASS`，证明原分析选择器未被替换。
- Vite 生产构建、Rust 增量检查、文档审计：等待其他项目编译结束后执行。
- Tauri 视觉验收：已由用户实机完成产品判断。
- 用户视觉结论：`FAIL`；默认画面仍呈圆片散点图，只有主动鼠标交互时才出现明显三维感。

### 5. 方案偏差与风险

- 初版低频相机曲线不满足 8 秒视差阈值；已在不提高最大角度和距离的前提下调整连续波形，属于验收驱动修正。
- 深度诊断每 1.5 秒更新一次，避免对 25K 论文进行逐帧 CPU 统计。
- 本机当前只有约 3.15GB 可用内存，且另一个项目存在 Cargo/Rust 编译进程；本项目构建暂缓，避免叠加重负载。
- 本机近期存在图形栈蓝屏风险，后续只执行短时、balanced、非全屏 Tauri 检查。

### 6. 当前进度

- Agent 内存纵深配置：`PASS`
- Agent 深度感知视角：`PASS`
- 论文/热点深度材质：`PASS`
- 非语义装饰层：`PASS`
- Ambient 共轨数学指标：`PASS`
- Explore 与热点进入实机连续性：`UNVERIFIED`
- 生产构建与 Rust 增量检查：`UNVERIFIED`
- 用户产品视觉：`FAIL`

### 7. 遗留问题和下一步

1. 将当前技术实现作为失败视觉基线创建本地归档提交。
2. 在新分支以外围安全壳巡航替换微幅共轨相机，并以观测尺度 LOD 替换持续放大圆片。
3. 保留原始理论 XYZ、Agent Z 轴辅助显示矩阵和独立分析星图隔离边界。

## 历史工作包：M1.3e

### 1. 基线

- 目标：让沉浸背景在 5 秒内产生明确、可追踪且非统一平移的星河流动；恢复 Agent 理论论文主题色，并将热点的蓝色行星圆片替换为混合恒星 LOD。
- 分支：`codex/agent-dual-background-v2`
- 基线提交：`63e83d3cd7b49d513df1613dfb42ef01fd1b5ce0`
- 基线提交说明：`feat(agent): establish independent dual-background baseline`
- 当前状态：M1.3e 本地技术检查点 `ea5c8b843dc94f328caa25e32b358150b38c1518` 已创建；等待用户视觉确认。
- 发布边界：仅允许本地技术检查点；不推送、不创建 PR、不发布。

### 2. 计划步骤与完成条件

| 步骤 | 内容 | 完成条件 | 状态 |
| --- | --- | --- | --- |
| 1 | 建立开发文档制度和文档一致性审计 | 六份入口职责明确，`audit:project-docs` 通过 | PASS |
| 2 | 实现 128×64 状态化 GPGPU 两级流场 | 固定步长、无重生、可检查点恢复、支持解析降级 | PASS |
| 3 | 实现 Agent 理论论文语义色与热点混合恒星 LOD | 论文色相可辨、热点无方向光圆片，分析模式不变 | PASS |
| 4 | 增加流场、恒星材质和文档审计 | 自动审计和增量构建通过 | PASS |
| 5 | 执行低负载浏览器/Tauri 验收 | 无 context lost，视觉结论由用户确认 | TECHNICAL PASS / USER UNVERIFIED |
| 6 | 创建本地技术检查点 | 自动验证通过后提交，人工视觉仍可为 UNVERIFIED | PASS |

### 3. 实际开发日志

#### 2026-07-28：问题确认

- 用户在桌面版确认沉浸星体位移过小，静置观察看不出流动。
- 用户确认 Agent 理论背景论文色彩不足，热点外观像固定方向受光的蓝色行星圆片。
- 源码复核发现沉浸 Shader 只是围绕初始位置的微幅解析偏移，且时间倍率被重复压低，不能形成可持续输运。
- 源码复核发现 Agent 理论论文颜色在 CPU 与 Shader 两次白化；热点使用方向光、球面法线和实心圆盘载体，直接导致行星感。

#### 2026-07-28：M1.3d 基线冻结

- 停止当前 Tauri/Vite 开发进程，保留其他无关进程。
- 重新执行 TypeScript、Vite、`cargo check -j 2`、双背景审计和 `git diff --check`，均为 `PASS`。
- 仅暂存双背景 v2 相关文件并创建本地基线提交 `63e83d3`。
- 未推送、未创建 PR、未发布。

#### 2026-07-28：M1.3e 方案锁定

- 主流场采用状态化 GPGPU Ping-Pong 积分；不支持时使用解析式两级流场。
- 沉浸位置仍与理论 XYZ 完全隔离；6,000 篇论文和 160 个热点身份保持真实且稳定。
- Agent 理论论文使用银白亮核与所属热点中低饱和色相。
- Agent 理论热点概览使用锐利核心、短衍射和薄日冕；完整光球只在飞近后的局部系统中出现。

#### 2026-07-29：M1.3e 实际实现

- 沉浸渲染器加入 `128×64` RGBA32F 位置/速度 Ping-Pong 状态纹理，使用固定 `1/60s` 积分且单帧最多补算 3 步。
- 大尺度输运场和小尺度 Curl 场共同驱动 6,000 篇真实论文与 160 个真实热点；热点速度保持论文速度的约 72%，中央缓流椭球降低约 30% 速度。
- 实现位置、速度、步数与后端类型的会话检查点；WebGL2、浮点 framebuffer 或 context 不可用时锁定本会话解析式后备。
- Agent 理论论文几何增加独立 `semanticColor`；分析模式继续使用原有 `color` 路径。
- Agent 理论热点概览用共享几何体的核心/光学双通道替代方向光 Lambert 圆片，拾取仍绑定原核心实体。
- 新增流场、理论恒星材质和项目文档三项专项审计，并将旧双背景审计升级为识别两级流场。

#### 2026-07-29：首次桌面复验与运行时修复

- 低负载 Tauri 开发版能够启动并进入正式“研究 Agent”页面；理论背景正常恢复上次偏好。
- 第一次切到沉浸背景时出现纯黑页面。WebView DevTools 明确记录 `Maximum update depth exceeded`，堆栈指向沉浸渲染器 cleanup 的 elapsed/checkpoint 回写。
- 根因是父组件把可变的最新检查点直接作为 `initialCheckpoint` 属性回传；cleanup 写入新对象并触发父组件更新后，子组件 effect 再次 cleanup，形成递归。
- 修复为每个渲染器实例冻结独立的挂载检查点，并在 elapsed 值未变化时复用旧状态。TypeScript 与全部专项审计在修复后重新通过。
- 检测到用户正在操作桌面窗口后，自动化输入按安全规则暂停；修复后的 Tauri 视觉往返仍需一次低负载复验。

#### 2026-07-29：修复后桌面低负载复验

- 使用单一新启动链重新打开 Tauri，限制 Cargo 为 2 个作业；Vite 在 528ms 就绪，Rust 开发目标在 2.66s 完成。
- 正式“研究 Agent”页能够直接恢复沉浸背景，中央输入框、6,000 篇论文星和 160 个热点身份正常渲染。
- 连续观察 5 秒可见星体产生空间位移；切换到 Agent 理论背景后论文热点色相可辨，概览未再出现蓝色实心行星圆片。
- 进入 Quantum Physics 热点后局部系统正常接管；返回沉浸背景时检查点续接正常，没有再次出现纯黑页或 React 递归。
- 进程持续响应，Tauri/Vite 启动日志没有新的错误；未执行全屏、长录屏、4K 动画或 GPU 压力测试。
- 以上仅将桌面技术复验记为 `PASS`；产品视觉仍为 `UNVERIFIED`，等待用户亲自判断流动和恒星质感。

#### 2026-07-29：本地技术检查点

- 仅暂存 M1.3e 代码、专项审计、六份权威文档和技术证据。
- 创建本地提交 `ea5c8b843dc94f328caa25e32b358150b38c1518`：
  `feat(agent): add perceptible immersive flow and stellar theory materials`
- 未推送、未创建 PR、未发布；桌面开发版保留给用户人工验收。

### 4. 测试与证据

| 验证项 | 结果 | 证据 |
| --- | --- | --- |
| M1.3d TypeScript 构建 | PASS | 2026-07-28 本地命令输出 |
| M1.3d Vite 生产构建 | PASS | 2026-07-28 本地命令输出 |
| M1.3d Rust 增量检查 | PASS | `cargo check -j 2` |
| M1.3d 双背景审计 | PASS | [agent-dual-background-v2-2026-07-28.json](./evidence/agent-dual-background-v2-2026-07-28.json) |
| M1.3d 产品视觉 | FAIL | 用户实机反馈：流动不明显、论文缺色、热点像蓝色行星圆片 |
| M1.3e TypeScript 构建 | PASS | `tsc -b --pretty false` |
| M1.3e Vite 生产构建 | PASS | 本地 Vite 生产构建，约 10.3 秒 |
| M1.3e Rust 增量检查 | PASS | `cargo check -j 2`，约 2.53 秒 |
| M1.3e 沉浸流场审计 | PASS | 5 秒位移中位数 `4.635px`、P75 `8.114px`、P95 `19.137px`、方向性 `22.19%` |
| M1.3e 理论恒星材质审计 | PASS | 论文语义色、热点共享双通道、无 Lambert 圆片路径 |
| M1.3e 双背景与只读数据库审计 | PASS | 6,000 篇唯一论文、160 个热点、25,463 条 membership，载荷不含理论坐标 |
| M1.3e 项目文档审计 | PASS | 六份权威入口、阶段、日期和状态一致 |
| M1.3e Tauri 低负载复验 | PASS | 首轮发现并修复 React 递归；新进程完成沉浸 → 理论 → 热点 → 沉浸往返 |
| M1.3e 用户视觉验收 | UNVERIFIED | 等待用户确认 |

### 5. 方案偏差与风险

- M1.3d 原计划的 Curl 微位移不足以表达流动，M1.3e 改为状态化输运；这是经过用户视觉反馈确认的产品修订。
- 本机近期出现过图形栈蓝屏。只执行短时、低负载和增量验证；不自动运行长时间全屏、4K 动画录制或高质量压力测试。
- GPGPU 能力与 WebGL context 可能因设备或驱动不可用，解析后备必须保持同一身份、连续运动和清晰语义星。

### 6. 当前进度

- 文档治理：`PASS`
- 沉浸 GPGPU 流场：`PASS`
- 解析式后备：`PASS`
- Agent 理论恒星材质：`PASS`
- 自动验证：`PASS`
- 桌面技术验收：`PASS`
- 用户视觉验收：`UNVERIFIED`
- 技术检查点提交：`PASS`（`ea5c8b843dc94f328caa25e32b358150b38c1518`）

### 7. 遗留问题和下一步

1. 保持桌面开发版打开，由用户亲自判断流动和恒星质感。
2. 用户确认视觉结果前，M1.3e 产品视觉不得标记为 `PASS`。

## M1.3m-R3 科研星图顶部工具化、边缘导航与详情轨道修复（已冻结）

### 1. 工作包

- 日期：2026-08-01
- 分支：`codex/agent-theory-perimeter-lod`
- 基线提交：`38e732e5b6905dfab7dc551a6588f4bab88542cb`
- 工作树：`dirty worktree`，保留全部既有 M1.3g–M1.3m 修改。
- 状态：`PASS / FROZEN`
- 目标：消除科研星图常驻左侧 HUD、标题栏下方第二套工具带和多面板详情竞争，同时保留 R2 已通过的相机生命周期与星图视觉。

### 2. 计划步骤与完成条件

| 步骤 | 内容 | 完成条件 | 状态 |
|---|---|---|---|
| 1 | 标题栏页面工具插槽 | 产品星图工具与窗口按钮同高、无常驻左侧 HUD | PASS |
| 2 | 左缘导航 | 8px/150ms 门、快速经过取消、外部点击/Escape/Alt+N | PASS |
| 3 | 单一详情轨道 | 判别联合状态唯一控制热点、摘要、阅读 | PASS |
| 4 | CSS 与相机回归 | 关闭按钮不被覆盖，R2 持久相机和 8% 偏移保留 | PASS |
| 5 | 自动与桌面验收 | 构建/专项通过；Tauri balanced 人工确认 | UNVERIFIED |

### 3. 实际开发日志

- 2026-08-01：确认 R2 残留三套空间所有者：`.galaxy-filter-bar`、`.galaxy-hud`、`.galaxy-legend` 同时存在于产品路径；右侧关闭按钮被后置 `.galaxy-inspector > * { position: relative }`覆盖。
- 2026-08-01：`SideraTitleBar`增加空的页面工具 Host，科研星图通过 React Portal 注入模式切换、学科/数量、适配、层级动作和更多工具。产品路径不再渲染旧 HUD/图例，筛选诊断只在标题栏弹层打开时显示。
- 2026-08-01：移除可见导航按钮，加入标题栏下方 8px 边缘热区与 150ms arming 定时器；加入 `Alt+N`，并复用既有透明 Scrim 处理外部点击。
- 2026-08-01：按用户反馈增加导航离开自动关闭：指针离开抽屉 220ms 后关闭，重新进入时取消计时；保留外部点击、Escape、导航完成和 `Alt+N`路径。
- 2026-08-01：字符串详情模式升级为携带实体 ID 的 `GalaxyContextRailState`。所有 Canvas 回调只派发该状态；Rail 渲染和 reading class 不再直接读取多组显隐布尔值。
- 2026-08-01：将通用 Inspector 子元素选择器改为排除关闭按钮，并以更高精度选择器固定关闭按钮绝对定位。轨道上沿从旧第二工具带下方提升到标题栏下 8px。

### 4. 测试与证据

- `pnpm build`：`PASS`（TypeScript 与 Vite 生产构建）。
- `pnpm audit:sidera-galaxy-spatial-ui-r3`：`PASS`。
- `pnpm audit:sidera-unified-shell`、`audit:sidera-background-ownership`、`audit:sidera-spatial-pages` 与 `audit:project-docs`：`PASS`。
- `git diff --check`：`PASS`（仅既有 LF/CRLF 转换提示，无 whitespace error）。
- Tauri balanced：用户后续确认统一外壳与科研星图暂时没有问题，产品视觉更新为 `PASS`；未执行长时间、4K 或 GPU 压力测试。
- Cargo：`DEFERRED`；收口时检测到两个 2026-08-01 14:13 启动的既有 Cargo 进程，依照蓝屏保护规则未并发执行 `cargo check -j 2`，也未终止既有任务。
- 证据：[sidera-m1.3m-r3-titlebar-edge-navigation-context-rail-2026-08-01.json](./evidence/sidera-m1.3m-r3-titlebar-edge-navigation-context-rail-2026-08-01.json)
- 对应提交：未提交，`dirty worktree`。

### 5. 当前进度

- 标题栏工具、边缘导航和单轨状态机均已落地，自动技术状态为 `PASS`。
- 用户已确认当前统一外壳与科研星图无明显问题，R3 与 M1.3m 以技术和产品视觉 `PASS` 冻结；后续只做回归维护。

### 6. 边界与遗留

- 未修改数据库、UMAP、活动快照、理论 XYZ、Agent 背景、聚焦逻辑和正式 Agent 后端。
- 未改变展示/理论切换的持久相机、热点飞行、论文近景或星体材质。
- 未提交、推送、创建 PR、发布或构建安装包。

## M1.3n Sidera Agent 运行中心

### 1. 工作包

- 日期：2026-08-01
- 分支：`codex/agent-theory-perimeter-lod`
- 基线提交：`38e732e5b6905dfab7dc551a6588f4bab88542cb`
- 工作树：`dirty worktree`，原样保留既有 M1.3g–M1.3m 改动。
- 状态：`IMPLEMENTED / TECHNICAL PASS / PRODUCT UNVERIFIED`
- 目标：将旧嵌入式高级工作台重构为待办优先的独立 Agent 运行中心，同时完整复用现有受监督运行、审批、Artifact 和审计后端。

### 2. 计划步骤与完成条件

| 步骤 | 内容 | 完成条件 | 状态 |
| --- | --- | --- | --- |
| 1 | 独立 `agent-runs` 视图 | 仅由 Sidera“更多”进入，不增加一级导航 | PASS |
| 2 | 待办与历史投影 | 等待动作、活动、最近失败优先；终态可筛选 | PASS |
| 3 | 详情与治理抽屉 | 计划/过程/成果保留，行动治理按需打开 | PASS |
| 4 | 新建入口收敛 | 只创建 `research_report`，六类旧历史仍可读 | PASS |
| 5 | 自动与原生验收 | 构建和回归通过；Tauri 用户操作完成 | TECHNICAL PASS / TAURI UNVERIFIED |

### 3. 实际开发日志

- 2026-08-01：新增 `ActiveView = agent-runs`，将 `AgentWorkspace` 从 `AgentDualBackgroundPage` 特殊分支移到根工作页；“高级工作台”入口改名为“Agent 运行中心”。
- 2026-08-01：运行队列拆分为待办和历史。待办依次聚合等待操作、活动运行及最近七天最多三项失败；历史只读保留所有终态运行，并加入状态、类型和关键词筛选。
- 2026-08-01：详情首屏增加任务目标、运行类型、当前阶段、阻塞和下一步；审批、用户问题和 Artifact 复核触发右侧治理抽屉。低频技术字段移入折叠详情。
- 2026-08-01：新建表单移除导入、清洗、建模和导出类型，只构造研究报告；既有六类 `AgentRunKind`、Tauri Client、命令、Schema、计划、事件和 Artifact 类型均未删除。
- 2026-08-01：失败研究报告提供“复制目标并新建任务”；失败专业任务按类型跳转文献工作台、分析流水线或报告库，不在运行中心复刻专业流程。
- 2026-08-01：新增 `audit:sidera-agent-run-center`，并更新双背景审计以验证独立入口和旧嵌入式工作台已经退出产品路径。

### 4. 测试与证据

- `pnpm build`：`PASS`（TypeScript 与 Vite 生产构建；仅保留既有 Tauri event 动静态导入警告）。
- `audit:sidera-agent-run-center`：`PASS`。
- Agent UI、桌面验收和能力静态审计：`PASS`；原审计仍明确要求手动桌面验收。
- 双背景、统一外壳、背景所有权、工作台表面及科研星图 R3：`PASS`。
- Rust 增量检查：`DEFERRED`（收口时已有两条 Cargo/Tauri 开发链运行；依据蓝屏保护规则未并发启动 `cargo check -j 2`，也未终止既有进程）。
- Tauri 低负载只读验收：`PARTIAL PASS`；已确认“更多 → Agent 运行中心”、待办空态、历史筛选、既有 MySQL 失败/研究报告完成记录、专业页面建议入口及返回 Sidera 的视觉与状态连续性。
- Tauri 真实治理操作：`UNVERIFIED`；本轮未创建运行，也未执行批准、拒绝、回答、暂停、恢复或取消等会改变运行状态的动作。
- 证据：[sidera-m1.3n-agent-run-center-2026-08-01.json](./evidence/sidera-m1.3n-agent-run-center-2026-08-01.json)
- 对应提交：未提交，`dirty worktree`。

### 5. 当前进度

- 独立路由、信息架构、研究任务创建边界和治理抽屉已经实现，自动技术状态为 `PASS`。
- 产品视觉和原生审批/暂停/恢复/取消操作保持 `UNVERIFIED`，不得由源码审计替代。
- M1.3j 论文恒星近景继续独立为 `PRODUCT UNVERIFIED`，不阻塞本工作包。

### 6. 边界与遗留

- 未接入 Pi、正式 Agent 对话、对话历史、校园图书馆或全文阅读台。
- 未修改数据库 Schema、运行时状态机、工具注册表、审批哈希、租约、预算、Artifact 或模型凭据机制。
- 未提交、推送、创建 PR、发布或构建安装包。

## 当前工作包：M2.0b Pi 本地论文轻量混合 RAG

### 1. 工作包

- 日期：2026-08-02
- 分支：`codex/sidera-m2-rag`
- 基线提交：`d6e044af8d15fe04039bb1184a71ee5a0b159665`
- 工作树：`dirty worktree`；本工作包不提交、不推送、不创建 PR、不发布。
- 状态：`IMPLEMENTED / AUTOMATED TECHNICAL PASS / PRODUCT UNVERIFIED`
- 目标：在 M2.0a 单进程 Pi RPC 上建立受控的本地论文检索、摘要读取、证据回答、结构化引用和用户显式聚焦闭环。

### 2. 计划步骤与完成条件

| 步骤 | 内容 | 完成条件 | 状态 |
| --- | --- | --- | --- |
| 1 | 会话专用工具桥 | Pi 只能发现三个 Sidera 工具，Rust 完成 nonce/epoch/revision/toolCallId/项目白名单校验 | PASS |
| 2 | 轻量混合检索 | LIKE Top-20 与 CPU E5 Top-40 经确定性 RRF 产出最多 12 项；缓存不可用时安全降级 | PASS |
| 3 | 证据与引用闭包 | 最多读取 6 篇，引用只能来自本回合已读取论文，恶意摘要不能扩权 | PASS |
| 4 | 正式对话接入 | 显示安全检索阶段，完整回答才发布可点击引用和显式聚焦入口 | PASS |
| 5 | 自动技术验证 | TypeScript、Vite、Rust、混合/降级数据库审计和 M2.0a 回归通过 | PASS |
| 6 | Tauri 产品验收 | 中文问题完成混合检索、证据回答、引用、聚焦、停止和无结果闭环 | UNVERIFIED |

### 3. 实际开发日志

- 2026-08-02：从已收口 M2.0a 基线创建隔离分支；确认继续复用 Pi `0.82.1`、现有模型设置、Keyring、单进程/单会话/单活动回合，不开放内置工具。
- 2026-08-02：新增无额外模块依赖的会话扩展，只注册 `sidera_search_local_papers`、`sidera_get_papers_by_ids`、`sidera_finalize_evidence`，经 `extension_ui_request/response`与 Rust 通信。
- 2026-08-02：Rust 工具桥加入会话 nonce、进程 epoch、回合 revision、活动 toolCallId 和固定白名单；数据库路径和项目 ID 只由宿主注入，非法工具立即阻断。
- 2026-08-02：新增只读 `SideraRagRuntime`。关键词召回复用已有 `search_local_papers`，语义召回使用 `query:` 前缀、CPU multilingual-e5-small 和活动快照 float16 向量精确余弦扫描；最终按稳定 RRF 排序。
- 2026-08-02：为向量表、模型 revision、维度及编码增加前置兼容检查，使无缓存或版本不匹配的库在加载 E5 前直接进入关键词降级，聊天路径从不重建向量。
- 2026-08-02：实现每回合 3 次搜索、2 次读取、1 次引用收口和累计 128KB 上限；单次证据最多 6 篇、单摘要最多 4,000 字符。标题与摘要标记为不可信数据，引用只能来自本回合实际读取 ID。
- 2026-08-02：Pi 事件规范增加检索/读取/组织阶段、retrieval mode、引用核验状态和 `entityRefs`；正式 Sidera 消息只在 turn complete 后启用现有引用与 M1.3j 显式聚焦。
- 2026-08-02：真实发布库运行 CPU E5 审计得到 `hybrid-e5-like`、12 个候选、6 篇证据和 1 个已核验引用；不含向量表的旧库得到 `lexical-fallback`，两条路径均阻断非白名单工具。

### 4. 测试与证据

- TypeScript：`PASS`
- `cargo check -j 2`：`PASS`
- M2.0a Pi 基础会话审计：`PASS`
- M2.0b 扩展加载及三工具注册审计：`PASS`
- 默认发布库 CPU E5 混合检索：`PASS`（`hybrid-e5-like`，12 候选 / 6 证据 / 1 已核验引用）
- 无向量旧库关键词降级：`PASS`（`lexical-fallback`）
- Rust 定向单元测试：`BLOCKED`（测试可执行文件在进入测试框架前由 Windows 以 `0xC0000139 / STATUS_ENTRYPOINT_NOT_FOUND`终止；未重试重装或改动本机 DLL）
- Rust 真实数据库审计可执行程序：`PASS`（默认发布库混合检索与旧库关键词降级均完成）
- Vite 生产构建与项目文档审计：`PASS`
- 最终差异检查：`PASS`
- Tauri 真实 Provider 与显式聚焦：`UNVERIFIED`
- 证据：[sidera-m2.0b-pi-local-paper-rag-2026-08-02.json](./evidence/sidera-m2.0b-pi-local-paper-rag-2026-08-02.json)

### 5. 当前进度

- 工具桥、混合检索、降级路径、引用闭包和前端呈现已经实现；TypeScript、Vite、Rust、专项与文档审计均已通过，自动技术状态为 `PASS`。
- Rust 定向单元测试仍受本机原生测试加载器 `0xC0000139`阻塞；该阻塞与已经通过的 `cargo check`、真实数据库审计分别记录，不能相互替代。
- 用户真实桌面验收尚未完成，因此不得将 M2.0b 标为产品 `PASS`。
- M2.0a 的多轮、停止和错误恢复逻辑继续保留；M1.3m 统一外壳、科研星图和运行中心不在本阶段修改。

### 6. 边界与遗留

- 未加入热点检索、全文切片、FTS5、向量数据库、网页、校园图书馆、历史持久化或 Agent 运行中心桥接。
- 未修改数据库 Schema、活动快照、UMAP、理论 XYZ、Pi 版本或模型凭据机制。
- Pi/Node 生产安装包封装和真实 Provider 桌面终验留待后续明确授权。

## 开发总账更新规则

## 当前工作包：M2.0a Pi 基础会话链路

### 1. 基线与目标

- 日期：2026-08-01
- 分支：`codex/sidera-m2-pi-baseline`（开发基线原位来自 `codex/agent-theory-perimeter-lod`）
- 基线提交：`38e732e5b6905dfab7dc551a6588f4bab88542cb`
- 检查点：功能提交 `03e844560b6857ec4aa0e529dab5ba504d512392`；文档与证据由紧随其后的独立文档提交承载。
- 运行时：Node `24.14.1`、pnpm `11.11.0`、Rust/Cargo `1.96.1`。
- 状态：`IMPLEMENTED / TECHNICAL PASS / USER ACCEPTANCE UNVERIFIED`
- 目标：通过 Rust 托管的 Pi RPC 为正式 Sidera 输入框提供真实流式、多轮、可停止、仅本次程序运行保留的纯文本会话。

### 2. 计划与完成条件

| 步骤 | 内容 | 完成条件 | 状态 |
| --- | --- | --- | --- |
| 1 | 精确依赖与隔离配置 | Pi 版本固定，配置不包含真实密钥且不读取全局 Pi | PASS |
| 2 | Rust RPC 生命周期 | 单进程、严格 JSONL、窄命令、标准事件和安全回收 | PASS |
| 3 | 正式输入框接入 | 流式回答、追问、停止和错误恢复可用 | PASS |
| 4 | 自动验证 | 构建、Rust 测试、无工具/凭据审计和回归通过 | PASS |
| 5 | Tauri 低负载验收 | 真实桌面完成提问—流式—追问—停止—恢复 | PASS（用户终验未完成） |

### 3. 实际开发日志

- 2026-08-01：只读确认正式 Agent 页面已有 `onPromptSubmit` 与 `assistantMessages` 契约，但根组件尚未接线；Rust 已有 Provider 设置、Keyring 凭据读取与 Tauri 状态管理基础。
- 2026-08-01：核对 Pi 官方 RPC 为严格 LF JSONL，`message_update.assistantMessageEvent.text_delta` 提供文本增量，`agent_settled` 表示完整会话回合稳定；M2.0a 采用 RPC 子进程而不是在前端直接运行 SDK。
- 2026-08-01：精确加入 `@earendil-works/pi-coding-agent@0.82.1`，通过 `pnpm-workspace.yaml` 明确允许该已审计包的构建脚本；锁文件和包入口审计一致。
- 2026-08-01：新增 Rust `SideraPiRuntimeState`。运行时从 Pi `package.json` 解析 `bin.pi`，使用 Node 直接启动 RPC；隔离 cwd、HOME/USERPROFILE 和私有 models 配置，不经过 PowerShell/CMD/Shell，也不读取全局 Pi 会话。
- 2026-08-01：实现严格 LF JSONL、记录/输出/诊断大小限制、单调事件序号、epoch 失效门、子进程回收和非重放崩溃恢复；原始 RPC 事件没有暴露给 React。
- 2026-08-01：根级 Pi 对话控制器接入正式 Sidera 输入框。增量写入同一助手消息，生成时提交键变为停止，停止后保留部分文本；普通启动的模拟回答夹具已经关闭。
- 2026-08-01：首次原生联调发现 Rust 枚举只转换了事件类型，没有转换字段名，导致前端无法读取 `sessionId/messageId`；为事件枚举增加 `rename_all_fields = "camelCase"` 并加入序列化测试，随后真实桌面对话恢复正常。
- 2026-08-01：原生桌面验证首轮提示“请只回复：第一轮成功。”得到精确回答；追问“我上一条要求你回复什么？”正确引用上轮上下文。三千字长回答在生成中点击停止后保留部分内容并标记“已停止”，随后新问题得到精确恢复回答“真实中止后仍可恢复。”。
- 2026-08-02：用户明确授权创建隔离分支、提交并推送。创建 `codex/sidera-m2-pi-baseline`，将 `.codex-tmp/` 排除在版本控制之外；暂存区 secret 扫描未发现凭据，功能检查点为 `03e844560b6857ec4aa0e529dab5ba504d512392`。
- 2026-08-02：提交前低负载复验 TypeScript、Vite、Pi 专项审计、Rust 协议测试 5/5、`cargo check -j 2`与 whitespace 检查；推送在文档审计通过后执行，不创建 PR、不合并、不发布。

### 4. 测试、证据与偏差

- TypeScript：`PASS`
- Vite 生产构建：`PASS`（仅保留既有分块与 Tauri event 动静态导入警告）
- `audit:sidera-pi-basic`：`PASS`；版本、包入口、参数、Provider、无工具和无凭据泄露均通过。
- Rust 协议测试：`PASS`（5/5）；覆盖 LF/CRLF、中文、Unicode 行分隔、环境变量密钥引用和前端 camelCase 事件。
- `cargo check -j 2`：`PASS`
- Tauri 真实对话：`PASS`（提问、流式、追问、真实停止、停止后恢复）
- Tauri 错误密钥、断网、生成中背景切换、离开/返回 Agent：`UNVERIFIED`
- 用户最终验收：`UNVERIFIED`
- 证据：[sidera-m2.0a-pi-basic-conversation-2026-08-01.json](./evidence/sidera-m2.0a-pi-basic-conversation-2026-08-01.json)
- 对应功能提交：`03e844560b6857ec4aa0e529dab5ba504d512392`（`feat(sidera): establish unified shell and Pi conversation baseline`）。
- 对应文档提交：当前 `docs: record M2.0a validation` 检查点。

### 5. 当前进度

- M2.0a 的实现、自动技术验证和原生桌面主链均为 `PASS`，已满足技术完成门槛。
- 用户最终体验、错误密钥/断网以及生成中跨页面场景仍未逐项验收，因此对外状态保持 `USER ACCEPTANCE UNVERIFIED`。
- 下一工作包 M2.0b 只在用户确认后开始，并将受控只读论文工具与基础对话链路分开评审。

### 6. 遗留与边界

- 本阶段不访问论文库、文件、Shell、网页，不产生结构化引用或聚焦，不持久化对话，也不桥接 Agent 运行中心。
- Pi/Node 生产安装包封装不属于本工作包。

以下事件必须更新本文以及对应事实入口：

- 大型功能或新阶段开始、完成或失败。
- 背景引擎、公共接口、数据库、架构或产品导航变化。
- 人工视觉验收改变技术或产品结论。
- 自动测试与实机结果不一致。
- 原计划被替换、范围变化或关键决定被推翻。

每个工作包必须记录目标、分支、基线提交、计划步骤、实际日志、偏差、测试、证据、进度、遗留问题和对应提交；未提交时必须明确写出 `dirty worktree`。
## 当前工作包：M1.3m 统一星空外壳与空间页面

### 1. 基线与目标

- 日期：2026-08-01
- 分支：`codex/agent-theory-perimeter-lod`
- 基线提交：`38e732e5b6905dfab7dc551a6588f4bab88542cb`
- 工作树：`dirty worktree`，保留既有 M1.3g 至 M1.3l 修改和未跟踪证据。
- 状态：`IN_PROGRESS / PRODUCT UNVERIFIED`
- 目标：以同一透明 Sidera Shell 统一 Agent、普通工作台和独占空间页面；普通页面固定使用低亮低速流动星河，科研星图不得与第二套星空叠加。

### 2. 计划与完成条件

| 步骤 | 内容 | 完成条件 | 状态 |
| --- | --- | --- | --- |
| 1 | 根级场景与背景所有权 | Agent/工作台/科研星图只存在一个活动 RAF 场景 | PASS |
| 2 | 全局透明导航 | 所有页面无永久侧栏、无模糊压暗、无蓝色选中块 | PASS |
| 3 | 一体化工作台 | 普通页面浮于低速星河且导航开关不引发布局变化 | PASS |
| 4 | 科研星图独占空间 | 沉浸星图铺满页面，不叠加外壳星河 | PASS |
| 5 | 流水线空间契约 | 建模运行状态可取得/释放空间所有权 | PASS |
| 6 | 自动与桌面验收 | 增量构建、专项审计和低负载 Tauri 通过 | IN_PROGRESS |

### 3. 实际开发日志

- 2026-08-01：开始工作包；只读确认现有 `AgentDualBackgroundPage` 已具备单渲染器遮罩切换、分样式检查点和理论姿态保存，可在不推翻 R10/M1.3l 的前提下增加 Shell 展示模式。
- 2026-08-01：确认科研星图已有正式沉浸布局；当前 `galaxyVisited` 会保留隐藏组件，后续必须确保隐藏画布不再推进活动 RAF。
- 2026-08-01：新增 `SideraShellScene / SideraRendererOwner / SideraBackgroundCheckpoint / SideraPipelineSpatialState` 内部契约。`AgentDualBackgroundPage` 增加 `agent / workbench / suspended` 展示模式；工作页复用 `star-river` 并仅降低亮度与速度，科研星图活动时卸载 Agent WebGL 子画布。
- 2026-08-01：根布局删除永久侧栏，只保留全局透明覆盖导航；标题栏统一透明。导航项的蓝色背景、边线和阴影被中性亮度、字重与最高 3% 白色 Hover 取代。
- 2026-08-01：普通页面内容统一承载于星河上的主工作表面；科研星图只在活动时挂载 `App17GalaxyCanvas`，保存恢复 `GalaxyCameraPose`，经典布局仅由开发评审参数开启。
- 2026-08-01：流水线向根壳发布热点建模的运行、暂停、取消、阶段与进度状态。本轮没有伪装已经实现完整“微尘凝聚”动画。
- 2026-08-01：直接 TypeScript 检查、Vite 生产构建以及 `audit:sidera-unified-shell / background-ownership / workbench-surfaces / spatial-pages` 均为 `PASS`。Vite 仅保留既有大分块与 Tauri event 动静态导入警告。
- 2026-08-01：设备上已有一套空闲 Tauri 开发链，未发现 `rustc` 活动且可用内存约 5.5GB；在不终止现有窗口的前提下执行 `cargo check -j 2`，5.33 秒通过。七项新旧壳/文档审计和 `git diff --check` 同步通过。
- 2026-08-01：使用原生桌面低负载检查完成 `Agent 流动星河 → 文献工作台 → 科研星图 → Agent`。导航在 Agent、工作页和科研星图上均为透明覆盖；文献工作台没有位移，科研星图没有叠加外壳星河，返回 Agent 后星河正常恢复。

### 4. 测试、证据与偏差

- TypeScript：`PASS`
- Vite 生产构建：`PASS`
- M1.3m 四项专项审计：`PASS`
- Rust 增量检查：`PASS`
- 项目文档与旧桌面壳回归：`PASS`
- Tauri 低负载验收：`PARTIAL PASS`（Agent、文献工作台、科研星图往返已通过；理论/随机恢复、聚类运行态和多缩放档未验）
- 用户视觉验收：`UNVERIFIED`
- 证据：`docs/evidence/sidera-m1.3m-unified-spatial-shell-2026-08-01.json`
- 对应提交：未提交，`dirty worktree`。

### 5. 遗留问题

- 完整聚类“微尘凝聚成最终理论星图”动画不与本次 Shell 重构混做；本轮只交付所有权和进度入口。
- 需要用户继续验收普通工作页的一体化视觉语言；产品视觉确认前不将 M1.3m 标记为 `PASS`。
- 仍需在低负载原生窗口检查理论背景与随机星海往返、真实聚类运行态，以及 100% / 125% / 150% 缩放。

## 当前工作包：M1.3m-R1 工作台可读性与全局控件安全区修订

### 1. 基线与目标

- 日期：2026-08-01
- 分支：`codex/agent-theory-perimeter-lod`
- 基线提交：`38e732e5b6905dfab7dc551a6588f4bab88542cb`
- 工作树：`dirty worktree`，保留 M1.3g 至 M1.3m 的既有修改与用户验收证据。
- 状态：`IMPLEMENTED / TECHNICAL PARTIAL PASS / PRODUCT UNVERIFIED`
- 根因：M1.3m 的单渲染器和场景所有权成立，但“全部页面纯覆盖导航”在密集工作页造成文字重叠；工作页背景强度不足、面板偏灰、右上控件没有统一窗口安全区，产品科研星图还重复提供桌面全屏功能。

### 2. 计划与完成条件

| 步骤 | 内容 | 完成条件 | 状态 |
| --- | --- | --- | --- |
| 1 | 导航入口归属标题栏品牌区 | 所有产品页面只保留一个左上导航入口 | PASS |
| 2 | 密集工作页 `workbench-reserve` | 导航与工作台不重叠，背景画布不移动 | PASS |
| 3 | 纯黑工作台与可辨星河 | 星河强度 0.34、工作台约 94% 黑且无蓝色激活底 | PASS |
| 4 | 科研星图安全工具栏 | 产品无全屏按钮，工具栏避开窗口控件 | PASS |
| 5 | 构建、审计与桌面验收 | 自动技术通过并由用户实机判断产品视觉 | IN_PROGRESS |

### 3. 实际开发日志

- 2026-08-01：保留 `SideraRendererOwner` 和单渲染器切换不变，新增 `SideraNavigationLayout` 与 `SideraChromeSafeArea`；根壳发布导航开合、场景和布局数据属性。
- 2026-08-01：`SideraTitleBar` 增加品牌旁导航按钮；删除 Agent 与普通页面右上重复导航入口。按钮标记为不可拖动，标题栏剩余空白仍保持桌面拖动行为。
- 2026-08-01：工作页导航展开时只调整 `.workspace--workbench` 左侧内边距，过渡时长 240ms；Agent 与科研星图继续覆盖，不触发 WebGL 重建或画布 resize。
- 2026-08-01：工作页星河强度由 0.18 提升至 0.34，速度保持 0.20；主工作表面改为 `rgba(0,0,0,0.94)`，常见大型面板统一纯黑、中性细边框并移除蓝色选中底。
- 2026-08-01：产品科研星图以独立空间状态启用沉浸展示参数；“全屏”按钮仅在开发评审或经典布局出现，工具栏读取标题栏和窗口控件安全区并在窄宽度折叠次级操作。
- 2026-08-01：`pnpm exec tsc` 因本地 pnpm 命令包装未解析 `tsc` 而未进入编译；改用同一工作区已安装的 `node node_modules/typescript/bin/tsc -b` 完成真实 TypeScript 检查并通过。未清理或重装依赖。
- 2026-08-01：`audit:sidera-workbench-navigation-r1` 与既有 unified-shell、workbench-surfaces、spatial-pages 四项专项为 `PASS`。生产构建、Rust、文档与原生桌面验收在完成阶段分别记录。

### 4. 测试、证据与偏差

- TypeScript：`PASS`
- R1、统一壳、工作台和空间页面审计：`PASS`
- Vite 生产构建：`PASS`（Vite 6.4.3，1,663 modules）
- Rust 增量检查：`DEFERRED`（已有两条 Cargo 开发链，按蓝屏保护不并发启动）
- 项目文档与差异检查：`PASS`
- Tauri 产品视觉：`UNVERIFIED`
- 证据：`docs/evidence/sidera-m1.3m-r1-workbench-navigation-2026-08-01.json`
- 对应提交：未提交，`dirty worktree`。

### 5. 遗留问题

- 需要在原生窗口检查总览、文献、热点、报告和设置页的导航让位，以及 1100px、100% / 125% / 150% 缩放。
- 需要确认工作页外围星河可辨、面板内部不干扰正文，以及科研星图工具栏与窗口控制区无碰撞。
- 用户人工确认前，R1 产品视觉不得标记为 `PASS`。
- 本轮不终止或复用用户已有的 Cargo/Tauri 进程；Rust 与真实桌面视觉在设备空闲后的单独低负载验收中完成。

## 当前工作包：M1.3m-R2 科研星图相机稳定与空间面板整合

### 1. 基线与目标

- 日期：2026-08-01
- 分支：`codex/agent-theory-perimeter-lod`
- 基线提交：`38e732e5b6905dfab7dc551a6588f4bab88542cb`
- 工作树：`dirty worktree`，保留 M1.3g 至 M1.3m-R1 的既有实现与证据。
- 状态：`IN_PROGRESS / PRODUCT UNVERIFIED`
- 目标：消除展示/理论切换时的刷新式相机旋转，建立导航折叠 HUD、顶部安全工具栏和互斥右侧信息轨道，并在不移动画布的前提下为详情提供投影让位。

### 2. 计划与完成条件

| 步骤 | 内容 | 完成条件 | 状态 |
| --- | --- | --- | --- |
| 1 | 相机与模式层解耦 | 模式切换不重建相机、不自动 fit、无黑帧 | PASS（实现与专项审计） |
| 2 | 紧凑筛选和导航折叠 | 导航、筛选、图例无包围框重叠 | PASS（实现与静态布局审计） |
| 3 | 顶部工具栏和单一信息轨道 | 热点/论文内容互斥且不与工具栏重叠 | PASS（实现与专项审计） |
| 4 | 详情投影让位 | 约 8% 左移，关闭后误差不超过 0.5px | PASS（数学与源码审计）/ 视觉 UNVERIFIED |
| 5 | 审计、构建与桌面验收 | 自动技术通过，产品视觉由用户确认 | TECHNICAL PARTIAL PASS / TAURI UNVERIFIED |

### 3. 实际开发日志

- 2026-08-01：只读确认模式开关同时改变 `visualMode/layoutMode`，页面 effect 随即下发 `fit`；Canvas 主 effect 又依赖模式化 `sceneData`，因此模式切换会销毁并重建 Renderer/Camera，形成“错误视角 → 自动适配”的可见过程。
- 2026-08-01：确认科研星图右侧同时存在 HUD、证据卡、热点 Inspector 和论文阅读层，分别使用固定顶部坐标；热点系统工具栏换行后必然与详情区域重叠。用户锁定原屏姿态继承、导航 HUD 临时折叠和约 8% 投影让位。
- 2026-08-01：移除 `visualMode/layoutMode` 变化后的页面级 `fit` effect；`App17GalaxyCanvas` 改为持久持有 WebGL Renderer、Camera 与 Canvas，场景切换只释放并重建模式资源。切换时记录源模式构图中心、方位、仰角与相对距离，并按目标场景基准尺度映射后同帧应用。
- 2026-08-01：左上控制台压缩至两行，快照正文、高级筛选和性能诊断合入弹出层；导航打开时筛选和图例切换为紧凑按钮。产品证据卡与独立论文阅读 overlay 已移除，热点、论文摘要和论文阅读统一进入默认关闭的 `GalaxyContextRail`。
- 2026-08-01：轨道打开时使用 Three.js `setViewOffset` 做相机投影组合，目标偏移最高 8%、小窗口最高 5%，以 320ms smootherstep 连续交接；拾取、标签和实体渲染共享同一 Camera 投影，DOM Canvas 不移动也不 resize。
- 2026-08-01：TypeScript、Vite、R2 专项、空间页面、工作台导航、理论相机与热点过渡均通过。视觉不变量审计的 `createSystemPaperLayer` 旧黄金哈希与既有 Agent 系统论文可见度实现不一致，本轮不改写黄金值；记录为已知基线失败而非 R2 相机/HUD 回归。
- 2026-08-01：确认一个标题为 `Sidera` 的原生开发窗口存在；自动化捕获为 1360×864，但交互接口返回 15×15 窗口边界，依照电脑操控安全规则停止输入。因此真实 Tauri HUD、热点点击与轨道滑出仍需用户人工验收。

### 4. 测试、证据与偏差

- 自动技术：`PARTIAL PASS`（核心专项与构建通过；旧视觉黄金哈希待独立基线审查）
- Tauri 产品视觉：`UNVERIFIED`
- TypeScript：`PASS`
- Vite 生产构建：`PASS`
- R2/空间页面/R1 工作台/理论相机/热点过渡：`PASS`
- 视觉不变量：`FAIL（旧 createSystemPaperLayer 黄金哈希失配；未擅自更新）`
- Cargo：`DEFERRED（现有开发链运行中，避免并发编译）`
- 证据：[sidera-m1.3m-r2-galaxy-camera-spatial-ui-2026-08-01.json](./evidence/sidera-m1.3m-r2-galaxy-camera-spatial-ui-2026-08-01.json)
- 对应提交：未提交，`dirty worktree`。

### 5. 遗留问题

- 用户仍需在最新原生窗口中复验 20 次展示/理论原位切换、导航折叠、热点/论文单轨切换、轨道开关投影恢复和多 DPI 布局。
- 旧视觉不变量黄金哈希应在单独范围内区分 analysis 原始视觉与 Agent 理论系统论文可见度，不能由 R2 工作包直接覆盖。
- 本轮不修改星体材质、数据库、UMAP、活动快照、理论 XYZ、Agent 背景或正式 Agent 后端。
