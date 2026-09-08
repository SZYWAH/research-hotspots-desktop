# 科研 Agent 架构

## 2026-09-08 无 V20 视觉源的安装启动兼容

稳定 Tauri identifier 会让安装版与此前开发版共享 IndexedDB 设置；因此 Full Demo 即使携带有效默认库，也可能继续打开用户此前选择的外部论文库。若该库不存在 `select_immersive_background_visual_source` 可接受的 active 或 ready historical V20，后端返回 `AGENT_IMMERSIVE_VISUAL_SOURCE_MISSING`。前端启动状态机仅把这一稳定“能力缺失”码映射到已有静态背景，并在静态层提交 ready 后正常退出启动页；它不改写数据库目录，不复制默认库，不运行建模，也不把静态背景算作动态 WebGL 首帧。

D-162 的动态首帧门继续约束所有存在视觉源的冷启动。载荷 15 秒、挂载 20 秒超时、数据库错误、active 快照损坏、revision 契约不一致及其他未知错误都继续进入失败页，不能自动静态提升成功。

该兼容路径已由 `af57d1d` 的安装版证明：稳定标识选中无 V20 的旧外部库时仍可进入主界面，且正常关闭后进程释放。机构恢复仍使用原固定 profile 和能力真值；安装版当前只恢复统一发现，数据库与个人图书馆由官方判为 `login-required`，没有自动弹出认证窗口。该结果不改变 Cookie 生命周期，也不把统一发现可访问推导成其他能力已登录。

## 2026-09-07 主窗口退出顺序窄修

main 的 CloseRequested 先 prevent_close，再调用 AppHandle::exit(0)，由正常应用退出路径统一结束生命周期。依据本地 Tauri runtime，exit 请求通过事件队列派发，不能任由默认 owner 销毁先于该请求处理。新增 SIDERA_EXIT_TRACE=1 可选 stderr 固定阶段码；不记录 URL、页面或认证数据，不增加强退超时。补丁已在空闲、机构能力就绪、认证子窗打开三种状态完成原生退出，均观察到四段事件码并释放机构 WebView profile 子进程；旧 PID 的精确阻塞栈仍未知，不反推为已证实死锁。机构恢复公开接口及固定 profile 不变。

证据：[本轮分门记录](./evidence/sidera-beta3-exit-delivery-2026-09-07.json)。

状态：权威架构入口

更新时间：2026-09-08

## 机构结构化分页与会话静默恢复（开发 014-R6 / R7）

R6 的武大统一发现连接器优先消费当前任务、当前 WebView generation 内已由官方页面接收的白名单 HTTPS JSON 响应。正文只以 `SecretBytes` 在内存存在，受 512KiB、深度 12、节点 1024 限制；解析后只保留规范化候选、官方页码/范围/排名/分面真值与脱敏 schema 身份。分页下一目标 `expectedNextPage` 由最近接受响应的 `page_number` 或 `first/last` 推导，页面点击只有在新响应身份不同且范围严格前进后才提交；一旦接受结构化页，后续失败只保留已验证结果，不混入 DOM。

R7 在用户首次进入机构资源时创建独立 restore epoch，复用 `app_local_data_dir/institution-webview-v1/whu`，不读取、复制或导出 Cookie。数据库 SSO、统一发现、个人图书馆在同一隐藏 WebView 中顺序且独立验证，每项 10 秒、总计 30 秒；任一项非 Ready 不再短路其余能力。状态只归类为现有 `ready / partial / login-required / failed`，自动恢复不得打开认证窗。离页、手工连接、显式清除和 WebView generation 变化会使旧结果失效。

个人图书馆检查器在自己的脚本作用域内计算脱敏 `pageTitle` 与 `host`；武大官网 `/page/902099/show` 且标题为登录页时返回 `login-required / OFFICIAL_LIBRARY_LOGIN_LANDING`。官网根页只通过同源 `/login` 导航进入该落地页，并在单项 10 秒预算内有限重试；脚本异常、网络失败与明确登录页继续分别保持 `failed` 与 `login-required`，不得互相替代。

主窗口 `main` 的 `WindowEvent::CloseRequested` 调用 `AppHandle::exit(0)`，使关闭主界面进入整个 Tauri 应用的正常退出路径，避免隐藏机构窗口继续维持进程。2026-09-05 原生复验证明哈希已核验新版 PID 26540 经主窗正常关闭后，精确 PID、全部 Sidera 进程及窗口均消失，故通用进程退出契约已通过。有效会话重启验收仍必须另行记录认证前态、旧 PID 退出、新 PID/开始时间与恢复终态；固定 profile 存在和统一发现可访问不能单独证明已认证会话跨重启恢复。

## 现有基础

Agent 背景载荷必须区分“当前分析”与“只读视觉来源”。理论背景只由与当前 library revision 一致的 active V20 快照派生；沉浸背景不消费理论坐标，可由视觉来源选择器读取当前 active V20，或在 active state 缺失时显式读取最新结构完整的 `ready historical-v20`。载荷保存来源类型、快照身份、当前/来源 revision、freshness、热点和确定性抽样论文，但不复制完整 25K/100K 论文集合；历史来源不得被描述为当前分析结果。

当前 `AgentGalaxyBackgroundCanvas` 已提供独立 Three.js 生命周期、批量几何体、质量降级和性能指标。现有三候选通过固定 XYZ、相机摆动、整组旋转/缩放和时间亮度调制产生运动，不作为新架构的运动基础。

M1.2a 新增独立的 `AgentGalaxyFlowCanvas`。它复用只读背景载荷，但不复用旧 Canvas 的空间变换或 Shader；开发入口为 `visual-review=agent-flow`，默认 `<App />`、旧 `agent-background` 和轨道对照入口保持独立。

M1.3c 原计划将 Agent 星空拆分为两种产品视图，但沉浸实现仍消费 `AgentGalaxyBackgroundPayloadV1.position/offset`，最终只是“理论坐标 + 沉浸外壳”，已经判定为结构性失败。该路径只保留为技术预览。

M1.3d 重新建立两种互不继承空间结构的产品背景：

- `immersive`：面向对话和沉浸体验，使用会话随机空间与连续 Curl 流；只消费真实身份、热点归属、颜色和年份，不消费理论 XYZ。
- `theory`：面向语义位置、热点归属和可解释关系，继续使用现有理论星图坐标。

两种视图共享实体身份和快照身份，但不共享世界坐标解释器。M1.3d 完成两套静置背景和显式切换，但产品视觉未通过；M1.3e 在不改变该空间边界的前提下修订沉浸流动与 Agent 理论恒星材质。

M1.3l 在 `immersive` 内部增加两种正式空间解释器，但仍共用无坐标身份载荷：

```text
AgentImmersiveBackgroundPayloadV2（身份、颜色、年份；无 XYZ）
  → AgentImmersiveStyle
      ├─ random-field（现有扁平随机空间＋两级 Curl）
      └─ star-river（稳定对角样条骨架＋会话随机细节）
           ├─ 6,000 真实论文＋160 真实热点
           ├─ 同一 128×64 状态纹理中的约 2,000 暗微尘槽
           └─ 单绘制调用的程序化星云薄带
  → 分样式 elapsed/checkpoint
  → 共享锐利恒星材质、聚焦身份和单渲染器切换门
```

`star-river` 的位置元数据只由 `sessionSeed + entityId + star-river-v1`生成，不携带热点质心或语义距离。样式切换延续逻辑实体和聚焦会话，但在黑色遮罩内释放旧渲染器并由新解释器重新捕获；两套世界坐标不做逐星插值。

已落地的星河运动同时具有 GPGPU 与解析式路径。GPGPU 继续使用单个 `128×64` Ping-Pong 状态纹理：语义实体和 32 个动态焦点槽之后的 2,000 个槽位专用于无业务身份的暗微尘；位置目标由只读流带元数据重建，再叠加切线输运、局部 Curl、横截面回归、中央缓流和端部连续回转。随机星海保留原两级 Curl 代码路径与旧检查点兼容。语义星、微尘和程序化薄带是不同绘制层，性能降级不得降低语义星 DPR 或清晰核心。

M1.3m 将 M1.3l-R1 的透明界面扩展为根级空间外壳。`SideraTitleBar(transparent)` 与 `agent-navigation-drawer` 成为所有页面唯一的标题栏和导航；普通工作页不再挂载永久 `sidebar-surface`。M1.3m-R1 将导航布局显式拆为两类：Agent、科研星图等空间页面使用 `spatial-overlay`，导航只覆盖 DOM；总览、文献、热点、报告和设置等密集工作页使用 `workbench-reserve`，导航展开时只改变工作表面的左右边界，背景画布及其 WebGL 尺寸保持不变。

M1.3m-R2 将科研星图内部进一步拆为持久的 Renderer/Camera 生命周期与可替换 Scene Layer 生命周期。展示/理论模式只替换热点、论文、标签和模式材质层；当前相机姿态按源/目标场景尺度映射后在同一帧应用，模式变化不能再触发页面级 `fit`。科研星图 HUD 使用左侧折叠区、顶部工具条和单一 `GalaxyContextRail` 三个互斥安全区；详情轨道通过相机投影偏移让位，不能移动 DOM 画布或修改世界坐标。

M2.0b-R2 将“面板避让”和“相机飞行”收敛为可测量的空间构图。Agent 侧由 `ResizeObserver` 读取对话框、证据卡、标题栏与视口边界，生成唯一 `SideraFocusComposition`；沉浸相机、理论近景与 CSS 强调不再各自维护固定锚点。科研星图侧由 `GalaxyContextRailMode → resolveGalaxyContextRailWidth() → effectiveViewport` 计算投影构图，并由论文 Journey 的同一个 `focusBlend` 同步推进轨道、投影锚点和相机距离：

```text
Agent DOM bounds → SideraFocusComposition → immersive/theory focus + CSS optical cue

GalaxyContextRailMode → measured rail width + 24px gap
  → effective viewport
  → paper journey focusBlend
      ├─ projection composition
      ├─ paper anchor
      ├─ camera distance
      └─ rail content/width
  → atomic Orbit handoff
```

研究星图不再使用固定 `viewportOffsetRatio=0.08`，论文飞近也不再具有独立 acquisition 停顿。返回系统时在交回 Orbit 前先同步最终相机、投影和热点轨道状态，防止锚点清零与相机接管跨帧发生。

```text
SideraShell
  ├─ SideraTitleBar
  ├─ SideraBackgroundHost
  │    ├─ agent-immersive | agent-theory
  │    ├─ workbench-star-river
  │    ├─ research-galaxy
  │    └─ pipeline-formation
  ├─ current page / SideraAgentStage
  ├─ SideraNavigationDrawer
  └─ scene transition mask
```

当前实现以 `AgentDualBackgroundPage.shellPresentation` 提供 `agent / workbench / suspended` 三种根级展示状态：Agent 使用用户背景偏好；普通工作页复用 `star-river`，亮度为 `0.34`、速度为 `0.20`；科研星图挂载时将 Agent 背景置为 `suspended`，释放其 WebGL 子画布。工作页之间只切换内容，不重建星河。根壳通过 `data-navigation-open`、`data-navigation-layout` 与 `data-shell-scene`驱动 DOM 布局，`SideraChromeSafeArea` 统一标题栏高度、232px 导航宽度、24px 工作台间距和窗口控件占用宽度。科研星图的 React 业务状态保留，但 `App17GalaxyCanvas` 只在页面活动时挂载，并通过 `GalaxyCameraPose` 保存恢复姿态；产品空间模式直接启用沉浸展示参数，全屏开关只留给开发/经典回归。流水线通过 `SideraPipelineSpatialState` 发布运行、暂停、取消和完成状态；完整的聚类凝聚动画留给后续工作包。

M1.3f 在理论背景内部进一步区分“原始理论空间”和“Agent 显示空间”。原始载荷与数据库仍保存未经修改的 XYZ；只有 `agent-theory` 渲染入口创建确定的纵深配置，并将同一显示变换一致应用于论文、热点、标签、拾取、相机拟合和热点进入。独立理论星图始终绕过该变换。

M1.3g 在 Agent 显示空间之外增加“观察控制层”。它读取增强后的只读坐标构建 PCA 外围安全壳，但不改写任何实体位置。初版 Explore 曾继续使用既有 Orbit 控制器；M1.3g-R3 已将它替换为独立自由相机。Ambient、自由 Explore、返回与交接任意时刻只有一个相机写入者。

M1.3h 在两套背景之上增加不解释世界坐标的共享聚焦控制层：

```text
AgentDualFocusIntent
  → FocusCoordinator（revision、实体身份、模式、阶段）
  → resolve_agent_dual_focus_scene（只读 SQLite）
  → AgentDualFocusScene
      ├─ ImmersiveFocusAdapter（会话流场、单侧凝聚、动态槽）
      └─ TheoryFocusAdapter（真实 XYZ、外围定位、系统/论文进入）
```

`FocusCoordinator` 不保存沉浸或理论世界坐标。切换背景时只延续 `entityId`、聚焦模式、上下文、快照身份和逻辑阶段；新背景在黑色遮罩后从自己的 acquisition 开始。这样不会制造两套空间之间虚假的逐星连续性。

实体解析一次最多处理 32 个身份，并明确区分 `sampled / snapshot-unsampled / active-only / missing`。数据库命令只读，返回标题等按需元数据与真实 V20 membership；背景常驻载荷仍不携带摘要或证据正文。

理论聚焦适配器具有独立运行时就绪门。`enter-system / focus-paper / agent-focus-overview` 只在 App17 WebGL `onReady` 后发出，并用 focus revision 保证每个目标最多发出一次。材质时间线完成只代表视觉权重归零，不能直接向协调器报告 `idle`；只有论文近景、热点系统和 R10 精确相机返回全部完成后，理论适配器才释放协调器所有权。

双背景页面只在理论概览且没有聚焦时持久化相机姿态。热点系统、论文近景和返回过程中的相机回调不能覆盖概览姿态，避免下一次背景恢复落入局部系统坐标。这样形成 `WebGLReady → FocusCommand → VisualRelease → NavigationRelease → R10Return → CoordinatorIdle` 的单向生命周期。

M1.3i 保留上述解析与生命周期资产，但替换产品控制层。正式路径现在是：

```text
SideraAssistantMessage（streaming 阶段只渲染文字）
  → complete + structured entityRefs
  → resolve_agent_dual_focus_scene（revision 门、只读 SQLite）
  → SideraFocusSession（messageId、最多 6 个候选、currentIndex、固定 side）
      ├─ ImmersiveEvidenceStage
      │    ├─ sampled：复用原论文/热点顶点
      │    ├─ unsampled/active-only：复用稳定动态槽
      │    └─ 共速相机捕获；不移动或重排上下文星
      └─ TheoryEvidenceStage
           ├─ 真实 XYZ 原位材质强调
           ├─ 外围侧面相机构图
           └─ 用户二次命令才进入 system / paper close-up
  → EvidenceCard / Carousel / ExplicitClose
  → R10 exact resume
```

`SideraFocusSession` 只保存回答、实体身份、当前索引、背景和固定侧别，不保存跨背景世界坐标。切换背景时在黑色短遮罩内释放旧渲染器，由新背景对同一实体重新捕获；任意时刻仍只有一个 WebGL 渲染器。

回答 `streaming` 期间不能创建聚焦意图，也不能改变相机、背景压暗或实体材质。结构化引用既是正文直接入口，也是回答末尾轮播的事实来源；`missing` 只产生“本地库未找到”状态，不生成星体。信息卡元数据按需获取，不进入背景常驻载荷。

M1.3h 的 `signal / soft-focus / full-focus` 自动触发和 24 颗上下文自动凝聚不再进入产品路径。其实体解析、顶点映射、动态槽、运行时就绪门和释放协调保留为 M1.3i 的底层适配器。

M1.3j 再次收窄产品控制层。`SideraFocusTimelineSample` 是背景压暗、目标材质、相机和信息卡的唯一时间源；渲染器不得继续用 M1.3h 的三级时间线解释 `sidera-explicit`。理论论文聚焦由同一 revision 自动串联 `enter-system → focus-paper`，热点只执行 `enter-system`；信息卡不再发出二次深入命令。

理论路由的所有权以“目标是否仍由当前局部导航处理”判断，而不是只检查最终 `focused`：同一论文处于 `entering / focused` 或系统处于 `paper-focus` 时，协调器不得发出 `return-system-center`。统一时间线完成后的状态映射也必须先检查 `sample.complete`，再解释旧的 `retargeting` 阶段；否则视觉已经接管的新目标会永久停留在过渡态。两项约束均来自 M1.3j 的真实 Tauri 运行时复验。

```text
Sidera explicit click
  → resolve real entity
  → SideraDirectFocusRoute
      ├─ immersive: acquire same vertex/dynamic slot + co-moving camera
      └─ theory:
           paper → enter-system → focus-paper
           hotspot → enter-system
           active-only → unclassified peripheral focus
  → hold / next target / release
  → exact origin restore + R10 next fixed step
```

Agent 理论论文近景增加独立 `SphereGeometry` 光球通路。远距离点源/PSF、真实光球和拾取仍共享同一业务实体。近景由四层共享中心、身份和交接进度的光学几何构成：本体 Sphere 使用局部三维位置计算宏观输运、中尺度连通流丝和微观颗粒，并以不规则能量场调制白热核心；中/细尺度流丝使用 GLSL `fwidth` 将阈值宽度约束在屏幕像素尺度，避免世界空间固定阈值形成大块迷彩等值带；略微外扩的能量薄层以受限加法混合补足内部白热能量；独立 `PlaneGeometry` 只作为圆环片元的保守包围面，Fragment Shader 从当前 NDC、相机 FOV/Aspect、球心 View 坐标和真实世界半径重建相机射线，并用射线—球体判别式的 `tangentField = 0` 生成精确透视轮廓，随后以 `fwidth(tangentField)` 生成约 `1–1.5` 物理像素高温主线和极弱外肩部；96×64 日冕 Sphere 在顶点 Shader 中执行稳定噪声位移，再由 Fragment Shader 生成稀疏火舌。圆环不再由平面中心或平面世界半径决定位置，能够补偿近距离角半径放大和离轴轮廓中心偏移；它仍是同一恒星的屏幕空间光学层，不是业务实体或第二个三维球壳。独立分析理论星图继续使用原有论文近景实现。

M1.3g-R1 明确渲染坐标契约：纵深增强后的 XYZ 先统一乘以 `APP15_THEORY_COORDINATE_SCALE`，外围剖面、巡航相机、论文与热点世界坐标、PSF 世界直径和真实光球半径全部消费同一单位。原始 XYZ 与数据库值不变；禁止外围控制器在原始单位、渲染器在缩放单位的双尺度运行。

M1.3g-R2 已增加稳定屏幕 LOD 控制层和独立 Explore 枢轴/过渡层。全部论文身份和顶点继续常驻；屏幕 LOD 只改变逐顶点权重，balanced 同屏目标为 3,500–5,500 颗。Explore 枢轴从当前可见语义实体计算，外围巡航方向辅助点不再进入 Orbit 控制器。

R2 的屏幕 LOD 与热/冷路径隔离已通过自动技术验证，但固定 Orbit 枢轴和轻微稳定构图未通过用户视觉验收。M1.3g-R3 已将 Agent 理论相机写入者改为：

```text
cruise
  → explore-free
  → returning
  → return-handoff
  → cruise
```

- `explore-free` 直接保存相机世界位置与视线，不使用固定中心；左拖改变 yaw/pitch，滚轮沿 forward 移动，Shift/中键沿局部平面平移。双击瞄准使用 500ms 有界过渡，任何手动输入都可连续取消。
- 热点单击选择先进入 500ms 判定窗口；只有未发生双击时才进入热点系统。双击只执行自由相机瞄准，因此一次指针序列不会同时触发瞄准和热点进入。
- Explore 的 reset / fit / top 不再只修改旧 Orbit 参数；它们使用相机位置 lerp 与四元数 slerp 恢复最佳、适配或顶视姿态，并保持自由相机状态连续。
- `returning` 使用外围巡航的真实构图参数和独立注视速度建立 C2 返回；`return-handoff` 用 450ms 连续交接位置、方向、线速度与角速度。
- 返回与 handoff 期间暂停深度目标切换和屏幕 LOD 重选，交接结束后才以空闲任务刷新；末帧使用真实热点世界位置作为参考，显式记录其投影误差与相机方向变化，避免诊断遗漏最终跃迁。
- 巡航保存 previous/current 的 `1/60s` 固定步状态并按 accumulator 插值；每帧最多三步且积压限制为 100ms。深度范围使用 900ms 时间常数连续逼近。
- 屏幕 LOD 在巡航中最多每 1.2s 空闲评估一次；选集变化不足 4% 时不交接，需要交接时使用 300ms 能量连续淡化。低可见度重构图要求持续 2s 且具有 8s 冷却。
- 热点渲染独立于论文可辨识预算：Ambient 构图单独评估至少 16 个热点和 6 个屏幕区域，Sphere 槽位只允许视锥内热点占用。进入退场交接的 Sphere 在视觉衰减完成前继续持有所有权，current 与 retiring 合计仍不得超过 12；预算溢出时立即归还点源。

上述 R3 路径自动技术验证通过，但用户实机确认拖拽时护栏外论文直到松手才补齐、长时巡航仍跳动、退出时视觉状态分批恢复、热点概览仍像圆片。M1.3g-R4 因此将运行结构替换为：

```text
Stable Paper Catalog（Worker 常驻）
  + Camera localToClip / viewport / quality / masks
  → ScreenLodWorker（±1.35 NDC，active 20Hz，idle 4Hz）
  → revision gate（latest request wins）
  → visible / incoming / retiring / resident typed arrays
  → 90ms incoming + delayed retiring

96-sector conservative envelope
  → periodic cubic B-spline C2 shell
  → full-entity radial safety validation
  → analytic tangent / outward normal
  → fixed-step cruise without runtime reframe

Explore return
  → prepare camera + depth + terminal LOD
  → one atomic visual commit
  → velocity-only return handoff

Hotspot overview
  → sharp core + non-circular PSF + stable short rays
  → enter hotspot system
  → final 400ms local photosphere crossfade
```

R3 交互性能历史实现采用“相机热路径与 LOD 冷路径分离”：

- 拖拽、滚轮惯性、进入 Explore 和返回外围期间，只更新相机矩阵与既有 GPU 顶点，不执行 25,463 篇论文的重新投影、排序或权重交接。
- 手势结束并稳定 140ms 后，通过空闲回调执行一次 LOD 重选；外围巡航的重选间隔下限为 750ms。
- 已开始的 LOD 交接在手势期间暂停时间线，结束后从原进度继续；交接 CPU 循环只遍历实际变化的顶点。
- Explore 入口复用既有 LOD 选择和预计算理论边界，不再为求枢轴二次扫描全部论文。
- Explore 拖拽和缩放期间暂时隐藏标签，停稳并完成一次 LOD 刷新后再绘制，避免 2D 标签重绘与 WebGL 相机更新竞争主线程。

R4 保留“不在主线程同步扫描全部论文”的约束，但不再冻结手势期间的选集。Worker 在交互期连续维护护栏实体，主线程只应用增量权重。Agent 理论 Ambient 的 24/18 FPS 人工节流被取消；性能降级优先降低非语义装饰和诊断频率，不得通过停掉或量化相机 RAF 制造卡顿。独立分析理论星图继续使用原有帧率策略。

实际运行期中，Screen LOD Worker 只在 WebGL Shader、首帧错误和真实语义星视锥检查全部通过后初始化，并由画布资源生命周期唯一终止。客户端同时最多保留一个 Worker 执行中请求和一个最新待执行请求，新相机状态直接覆盖尚未执行的旧状态，避免 20Hz 拖拽产生过期计算队列。Worker 不可用或异常时，主线程以每个 RAF 最多约 1.5ms 的协作分块方式继续投影，结果在空闲槽提交，不能退回“拖拽冻结、松手补星”。返回路径在 handoff 结束前用终点相机预取论文集合并同步收敛深度；只有 Worker 和后备任务为零、深度误差不超过 1%、LOD 渐变完成且论文数与选集哈希连续稳定 500ms 后才进入巡航，完成后不再补写选集、深度目标或标签。

R4 的上述返回事务只证明“视觉状态稳定”，不能证明“画面有内容”；其开放式巡航也没有运行期可见性约束。R5 已在观察控制层内加入单一写入者的连续可见性包络：有界论文样本与全部热点共同评估当前和未来 6 秒路径，巡航参数在同一控制器内缓变，不安全积分步直接保留最后安全检查点；Explore 自由相机继续绕过该约束。热点诊断同时从纯视锥计数升级为实际屏幕核心尺寸、能量和网格分散度计数。

R5 还修正了“护栏居民等于视口可见”的错误语义。`agent-theory-screen-lod-v3` 先满足 `viewportTargetCount`，再把剩余预算放入 `±1.35 NDC` 护栏；完成门使用 `viewportSelectedCount`，屏外预加载实体只能保证拖拽连续性，不能证明当前画面有内容。若六秒预测与真实 WebGL/Screen LOD 计数仍不一致，`return-handoff` 在同一相机状态机中连续转向已验证的中心安全包络，并预取该终点 LOD；此过程不创建第二相机写入者，也不允许近空选集进入普通巡航。

Explore 入口同时保存一份只读安全锚点：前后巡航检查点、插值进度、相机位置/方向、注视点和可见构图参数。退出时若相机相对锚点没有发生有效变化，状态直接从 `explore-free` 恢复到同一巡航姿态；发生交互后，C2 返回也优先以该锚点为终点，而不是从最终 Explore 位置的方位角临时制造一个未经验证的新外围终点。

## M1.3d 双背景数据流

```text
SQLite / V20 visual-source selector
  ├─ active state exists
  │    → require current revision + structural completeness
  │    → active-v20
  ├─ active state absent
  │    → latest structurally complete ready snapshot
  │    → historical-v20（explicitly non-current）
  └─ stale / ahead / corrupt / no source
       → explicit load failure

selected visual source
  └─ load_agent_immersive_background
       → AgentImmersiveBackgroundPayloadV2（无坐标 + 来源版本元数据）
       → SessionSeed + SeededSpatialAssignment
       → CurlFlow
       → AgentImmersiveStarfieldCanvas

SQLite / current active V20 only
  └─ existing V20 theory payload
       → real theory XYZ
       → App17GalaxyCanvas(agent-theory / ambient|explore)

AgentDualBackgroundPage
  → BlackSwitchMask
  → exactly one active renderer
  → central prompt contract / advanced workbench
```

`AgentImmersiveBackgroundPayloadV2` 的 Schema 必须从类型层面排除 `position`、`offset`、`centroid` 和任何语义坐标。固定种子仅用于审计和截图；正常应用会话由 Web Crypto 生成种子并保存在 `sessionStorage`。

当前实现入口：

- `AgentDualBackgroundPage.tsx`：正式研究 Agent 页面、单活动渲染器切换、会话状态和极简提交契约。
- `AgentImmersiveStarfieldCanvas.tsx`：身份稳定的会话随机空间、状态化 GPGPU 两级流场、解析式后备、会话检查点和锐利恒星材质。
- `AgentTheoryBackgroundCanvas.tsx`：完整理论载荷的 Agent 环境态/探索态适配。
- `App17GalaxyCanvas.tsx`：以 `analysis | agent-theory` 和 `ambient | explore` 隔离 Agent 专用材质与交互，不改变独立分析星图默认值。
- `load_agent_immersive_background`：通过只读视觉来源选择器抽样最多 6,000 篇真实论文并返回全部热点身份，不返回任何空间坐标；载荷显式携带视觉来源类型、当前/来源 revision 与 freshness。

## M1.3e 沉浸流场数据流

```text
AgentImmersiveBackgroundPayloadV2（无坐标）
  → SessionSeed + StableRandomAssignment
  → PositionTexture RGBA32F 128×64
  → VelocityTexture RGBA32F 128×64
  → FixedStep 1/60s Ping-Pong Integrator
       ├─ LargeScaleTransportField
       ├─ SmallScaleCurlField
       ├─ DialogCalmEllipsoid
       └─ SoftEllipsoidBoundary
  → SharpPaper/Hotspot Core + Restricted Corona
  → AgentImmersiveFlowCheckpointV1
       └─ sessionStorage / in-memory cache

capability failure or context lost
  → session-locked analytic-fallback
  → same seed, identity order and sharp semantic layer
```

GPGPU 每帧最多补算三个固定步；页面隐藏时停止 RAF，恢复后不补算离屏时间。检查点保存位置、速度、步数、纹理尺寸和会话种子；双背景切换的黑色遮罩覆盖后再读回，返回沉浸背景时恢复同一状态。context lost 后该会话不再次申请 GPGPU。

## M1.3e Agent 理论恒星材质

`buildApp15TheoryScene` 为论文同时保留原分析颜色和独立 `semanticColor`。`analysis` 继续读取原 `color`；`agent-theory` 使用银白亮核和约 54% 色度的热点语义色外层。

热点概览层共享同一几何体和实体索引：

```text
Hotspot entity/index
  ├─ core pass: 4.5–9 CSS px, normal blend, depth write
  └─ optical pass: 8–18 CSS px, short diffraction + thin corona,
                   additive blend, no depth write, alpha <= 12%
```

业务拾取只绑定核心对象。Agent 概览不再计算方向光 Lambert 球面或实心圆片；进入热点系统后的现有局部光球继续负责近距离表面层次。独立理论星图和展示星图仍走 `analysis` 分支。

## M1.3f Agent 理论纵深数据流

```text
App17GalaxyPayload（原始理论 XYZ，只读）
  → AgentTheoryDepthProfileV1（轴向标准差、中心 Z、自适应比例）
  → Agent 显示载荷（仅内存，Z 轴增强）
  → Agent 专用深度感知视角
  → 前中后景恒星材质 + 世界锚定装饰层
  → Ambient 共轨相机 / Explore 交互 / 热点进入
```

## M1.3g 外围巡航与恒星 LOD 数据流

```text
Agent 增强显示 XYZ（只读）
  → APP15_THEORY_COORDINATE_SCALE（统一 Three.js 世界单位）
  → PCA 主平面
  → 96 扇区真实外缘 + 周期 C2 安全壳 + 全实体验证
  → 会话随机 CruiseCheckpoint
  → cruise / explore-free / return-preparing / returning-anchor
    单一相机写入者
  → CruiseIntegrator（始终推进）→ VisibilityGuidance（只调方向与速度）
  → Worker 护栏论文 LOD + 精确锚点返回视觉事务
  → 观测深度与投影视直径
  → 论文 Point / PSF / Near-PSF
  → 热点概览 PSF / 系统内部 Photosphere
  → Agent 理论渲染器
```

- 巡航检查点保存种子、固定步数、位置、速度、加速度、PRNG 状态和已访问扇区；背景往返时恢复同一会话路径。
- 普通论文永不进入真实光球；Ambient/Explore 的热点也只使用 Point/PSF。用户进入热点系统后，局部光球才在最后约 400ms 接管；两种所有权共享业务实体 ID、拾取来源和屏幕中心。
- Explore 不重新布局、不自动切到最佳全图；R3 改为无固定枢轴的自由观察，最佳全图只作为 Explore 内显式“重置理论视图”命令。

### R6 Explore 精确锚点返回

```text
Explore entry
  → freeze Camera(position/quaternion/FOV/near/far/zoom)
  → freeze Cruise(previous/current/alpha/framing)
  → freeze Depth(current/target)
  → freeze LOD(selection/weights/hash/viewport/snapshot)

Explore exit
  → return-preparing
       ├─ stop dolly/drag/aim inertia
       ├─ resolve return-anchor LOD with projection signature
       └─ prewarm currentSelection ∪ anchorSelection
  → returning-anchor
       ├─ position = lerp(start, anchor, smootherstep(t))
       ├─ quaternion = slerp(start, anchor, smootherstep(t))
       └─ dialog consumes the same RAF progress
  → arrive exact anchor
       ├─ atomically restore previous/current/alpha/accumulator
       ├─ restore current + target Guidance and relative clocks
       ├─ enter cruise immediately
       ├─ publish idle after the first successful fixed step
       └─ retire union to anchor selection over 300ms
  → passive 3s post-return trajectory trace
       └─ never changes camera, Guidance, depth or LOD ownership
```

自由相机最后几帧的速度和加速度不进入返回轨迹。相机运动不会越过起点—锚点线段；视口发生变化时只重算锚点 LOD，不重新推导锚点相机。Worker 请求必须同时匹配 `purpose`、投影矩阵签名和视口，旧 Explore/cruise 响应在返回阶段只能被丢弃。返回阶段再次进入 Explore 会从当前姿态继续自由观察，并保留最初安全锚点供下一次退出使用。

### R7 交互与巡航生命期闭环

R7 将标签、局部导航和巡航生命期纳入 Agent 理论包装层。热点标签只依赖热点投影与稳定碰撞状态，不再读取论文 LOD Worker 的 pending 状态；相机交互期间继续以受限频率更新，新的标签布局完整后才替换旧布局。

Agent 页面消费画布发布的 `overview / system / paper` 导航状态，并以 nonce 命令调用既有 `return-system-center` 或 `exit-system`。Escape 使用相同的论文→热点→概览→退出层级。

Explore 安全锚点除相机、深度和论文 LOD 外，还冻结巡航 accumulator、可见性引导、护栏快照和最后安全检查点。R8 不再冻结或恢复“推进许可”，因为可见性层没有停止积分器的权限；首个恢复固定步渲染后即可发布 `idle`。

热点系统论文材质新增 `agent-theory` 可见度配置。它与分析/展示模式共享实体、几何和拾取身份，但使用独立的亮核、深度下限和聚焦上下文倍率；概览论文材质不经过该配置。

实际实现中，标签状态由每个热点的 `opacity / targetOpacity / collisionFreePasses / collisionStartedAtMs` 保持；Canvas 只在显式关闭标签时清空。安全锚点的 `liveness` 同时保存 accumulator、推进/保存许可、护栏快照、最后安全检查点和 Ambient 时间。

R7 的初版恢复证明只验证两个固定步并在证明期间暂停护栏；R7.1 虽把证明延长到 900ms 和两次护栏评估，仍保留了“护栏可拒绝固定步”的控制结构。真实桌面复验表明同一不安全检查点会被无限重复评估，从而形成稳定死锁。

### R8 巡航生命期与可见性引导解耦

```text
CruiseIntegrator (1/60s, max 3 catch-up steps)
  → always advance while Ambient is active
  → previous/current checkpoint interpolation
  → Camera

Visibility sampling (4Hz, current + 6s horizon)
  → normal | steering | fallback
  → tangentWeight / verticalAimRatio / directionSign / speedScale
  → CruiseIntegrator control input for the next step
```

`VisibilityGuidance` 不再返回可阻塞推进的布尔值。`normal / steering / fallback` 的速度目标保持非零，fallback 在无普通安全候选时连续减速、提高中心构图权重并平滑反向；角速度、线速度和加速度仍由同一巡航积分器连续积分，不传送检查点，也不创建第二相机写入者。检查点保存可继续受安全性约束，但保存失败不能影响运行时前进。

返回锚点后恢复冻结的 guidance、previous/current、插值和 accumulator，并在同一帧进入 `cruise`。首个成功固定步结束输入栏与相机的返回状态。R10 已删除“900ms 审计失败调用 fallback”的返回专用路径；生命期和可见性仍在正常巡航中工作，但返回诊断只能记录事实，不能形成第二次控制接管。最高 4Hz 的只读生命期诊断记录 step delta、投影位移、连续静止时间和恢复次数，React 诊断不能反向控制相机。

### R9 连续随机运动与 Worker 引导

```text
Session PRNG
  → 4–7s random targets
  → quintic envelopes + jerk-limited dynamics
  → 1/60s previous/current checkpoints
  → Hermite position + quaternion slerp
  → Camera

ScreenLodWorker (single instance)
  ← immutable 2,048-paper / 160-hotspot guidance catalog
  ← newest cruise-guidance request, max 2Hz
  → tangent / vertical / direction / speed + depth percentiles
  → 1.5s hold + 5% improvement hysteresis
  → continuous VisibilityGuidance target
```

巡航随机性只生成连续目标，不直接改写 `verticalVelocity`、角速度或相机姿态。检查点 V2 保存目标起止步、角速度目标、垂直目标、切线目标和垂直加速度；旧检查点保留种子、步号、位置、速度、方位与访问扇区后原位迁移。

Screen LOD 与巡航引导共享唯一 Worker 和任务队列。引导任务优先于普通 LOD，只允许一个执行中任务及每类一个最新待执行任务；旧 revision 只能被丢弃。Ambient 深度 P5/P50/P95 读取 Worker 结果，差异不足 1% 时忽略。Worker 故障时使用 `requestIdleCallback` 执行 512 篇、3 个未来时点、最高 1Hz 的降级预测，RAF 不同步扫描候选。

### R10 Explore 返回后的单一巡航接管

Explore 安全锚点在 R6 相机、深度和 LOD 基础上继续冻结：

```text
Cruise previous/current + interpolation alpha + accumulator
  + Guidance current/target
  + target-hold remaining time
  + next Worker evaluation remaining time
  + safe/unsafe counters + Worker epoch
  + Depth current/target + LOD selection/hash
    → Explore pause（logical time does not advance）
    → exact anchor return
    → atomic restore
    → next fixed step of the frozen cruise
```

Explore 入口和锚点恢复各推进一次组件级 Worker epoch；请求闭包同时校验 epoch 与 revision。旧 Guidance 或 Screen LOD 响应即使在返回后到达，也只能计入丢弃诊断，不能改变相机、深度或论文集合。

锚点后前三秒是只读轨迹观测窗：物理巡航继续从冻结检查点推进，但 Guidance Worker、空闲降级和返回专用 fallback 都不能重新构图。观测窗记录唯一相机写入者、Guidance 当前值/目标值/来源、Worker 接受与丢弃 revision、fallback 次数、LOD/深度哈希和参考实体轨迹残差。窗口结束后，Worker 按 Explore 入口保存的剩余调度时间恢复；Explore 停留时长不进入目标保持、安全持续时间或 Worker 间隔。

Guidance 反向时，目标方向进入巡航积分器的限加加速度控制，运行态 `directionSign` 只随实际角速度过零更新，不在 Worker 接管帧直接翻转。Anchor LOD 的并集收敛只改变同一顶点的透明权重，不改变实体世界位置或相机。

系统论文实际 Shader 配置通过性能快照公开基础透明度、亮核能量、深度衰减和聚焦上下文倍率。R7.1 继续只增强 `agent-theory` 局部系统，概览论文、分析理论星图和展示星图不读取该配置。

### Agent 理论真实 WebGL 就绪门

```text
named Agent theory materials
  → renderer.compile(scene, camera)
  → WebGL COMPILE_STATUS / LINK_STATUS + Three diagnostics
  → drain and verify first-frame WebGL errors
  → real THREE.Frustum semantic visibility > 0
  → onReady / remove switch mask
```

任一步失败都会记录具体材质名称，停止该画布 RAF，禁止保存当前巡航检查点，并通过 `onRuntimeError` 显示“理论背景渲染失败”及重试入口。就绪门不得通过关闭 Three.js Shader 错误检查绕过。R4 只允许在首次就绪时确定性选择有效构图；巡航开始后不得因低可见度执行 `perimeter-reframe`、回看中心或启动第二相机写入者。

`AgentTheoryDepthProfileV1` 的比例由快照坐标统计确定，限制在 `1.0–2.2`。增强载荷只存在于 Agent 页面内存，不写回数据库、快照或导出资源。Ambient 与 Explore 消费同一增强载荷，因此切换模式不替换坐标空间。

Agent 专用视角仍搜索 24 个方位角和 5 个仰角，但同时评估热点重叠、空白、重心、边缘、深度压缩和微偏航视差潜力。共轨相机只在 Ambient 概览态以小角度连续偏移产生视差；进入 Explore 时吸收当前偏移并冻结自动运动，避免第一帧跳变。

装饰恒星与暗微尘是独立的非语义层：由快照身份和层版本确定生成，不含论文/热点 ID，不参与拾取、标签和关系。装饰层首先参与质量降级，语义星核心分辨率保持不变。

## 目标数据流

```text
AgentGalaxyBackgroundPayloadV1
  → ParticleAssignment（稳定身份、流带、相位、种子）
  → FlowModel（时间、位置、速度、切线、焦点形变）
  ├─ SharpSemanticLayer（热点与论文）
  ├─ HotspotHaloLayer（弱光晕）
  ├─ EnvironmentLayer（环境星）
  └─ DustLayer（暗微尘）
  → CameraFlowController
  → MotionStateController
  → Metrics / Review Lab
```

按需聚焦使用独立通路：

```text
AgentGalaxyFocusIntent
  → EntityResolver
  → ResolvedAgentGalaxyEntity
  → ResidentFocusController / DynamicFocusLayer
  → FocusTimeline
  → FocusField
  → PhotosphereLOD
  → CameraFlowController
```

沉浸视图的上下文抽取通路：

```text
AgentGalaxyFocusIntent
  → EntityResolver
  → ContextSetResolver
  → ContextExtractionController
  ├─ SharpPaperLayer
  ├─ StableHotspotLayer
  ├─ EnvironmentLayer
  └─ EvidencePanelAnchor
  → ImmersiveCameraController
```

`ContextSetResolver` 的正式优先级是当前回答证据、引用邻域、热点成员。开发评审可以使用显式标记的确定性夹具，但不得使用屏幕距离或随机半径伪造论文关系。

## 模块边界

### 背景载荷

- `AgentGalaxyBackgroundPayloadV1` 在准备阶段保持不变。
- `position` 和 `offset` 是语义约束输入，不是 Agent 背景固定世界坐标。
- 快照、抽样和视觉配置版本继续可审计。

### 粒子分配

- 输入实体 ID、热点 ID、快照 ID和流场分配版本。
- 输出稳定流带、相位、径向偏移和随机种子。
- 相同输入必须产生相同输出。
- 热点和所属论文保持稳定关系，不允许运行时随机换流带。

### FlowModel

- v2 契约使用真实布尔能力声明，M1.2a 活动模型为 `gravitational-weave-tech-preview`。
- 该模型支持确定性解析运动，不支持动态聚焦，也不需要屏幕循环或粒子重生。
- `tidal-curl-tech-preview` 保留为后续技术适配器，本阶段不实现。
- 不将技术适配器命名或承诺为产品候选。
- CPU 采样用于相机、焦点、诊断和测试。
- GPU 采样用于批量粒子位置。
- CPU 与 GPU 共享相同参数和数学定义。
- M1.2a 不使用循环或重生；任何可见跳转和运行时重新分配均禁止。

### GravitationalWeaveFlow

- 四个不可见场节点由 `sourceSnapshotId` 确定性派生，周期约为 `36 / 44 / 53 / 67` 秒。
- 每个节点在 `18–42` 世界单位影响半径内叠加径向引力、剪切和轻微扭曲。
- 合成位移采用连续软限制，语义星最大位移小于 `2.2` 世界单位。
- 热点先应用场位移；论文在热点共同位移上只叠加有限差分形变，论文云 P95 直径比保持在 `0.94–1.06`。
- 中央缓流区是与初始相机方向对齐的固定世界空间椭球，只降低约 30% 速度和位移，不清空星体，也不跟随相机移动。

### 渲染层

- 语义星中央亮核使用全分辨率通道，不读取时间透明度。
- 热点光晕、暗微尘和装饰场可以使用低分辨率通道。
- 语义星不参与景深、运动模糊或低分辨率放大。
- 自动降级优先削减微尘、环境星和光晕。
- M1.2a 只渲染锐利论文星、锐利热点核心、环境星和暗微尘，统一使用正常透明混合；不加入 Bloom 或高饱和颜色。
- 隔离评审画布和 CSS 使用一致的 `#000000` 底色。语义星与装饰星都使用 `fwidth` 控制的紧致边缘抗锯齿，不再通过占据大部分点精灵半径的透明渐变制造软边。
- M1.3b-1 将语义星改为共享几何体的双通道恒星光球。核心通道全分辨率并写深度；表面/薄层日冕通道复用同一顶点身份且不写深度。两者都使用正常透明混合，不经过 Bloom、景深、运动模糊或低分辨率放大。
- `gl_PointCoord` 在片元阶段重建球面法线，固定视空间主光、弱补光、光球暗边和软能量压缩共同提供三维层次。小于 `2.2px` 时保持锐利针点，`2.2–4.5px` 连续进入光球表面 LOD。
- 每个论文顶点继承所属热点色相。论文色度低于热点，热点使用更厚的表面与极弱日冕；聚焦只连续提高同一色相的受光层次，核心透明度不读取时间或聚焦进度。
- M1.3e 部分取代上述统一光球规则：Agent 理论概览热点改为混合恒星 LOD，完整光球仅保留给飞近后的局部系统；Agent 理论论文通过独立 `semanticColor` 避免 CPU 与 Shader 双重白化。
- balanced 上限为 1,920 个论文代理、55 个明显热点、800 个环境星和 1,600 个暗微尘；high 上限为 2,560、75、1,200 和 2,600。

### MotionStateController

支持：

- `idle`
- `input`
- `thinking`
- `answer`
- `reading`
- `focus`

状态只改变连续参数，不重建粒子几何体。状态切换使用单调、可逆的平滑曲线。

### EntityResolver

解析结果区分：

- `sampled`：已经在常驻背景载荷中。
- `snapshot-unsampled`：属于背景快照但没有被抽样。
- `active-only`：只存在于活动数据库或更新快照。
- `missing`：不存在或已删除。

浏览器评审使用完整视觉快照模拟解析；最终 Tauri 使用按 ID 查询的只读命令，不新增数据库表。

### DynamicFocusLayer

- 会话缓存目标范围为 16–32 个。
- `snapshot-unsampled` 在所属流带中凝聚，不标记为新论文。
- `active-only` 作为有明确状态的“新信号”进入。
- 淘汰、取消和退出均平滑融回星流。
- 不存在实体不生成替代位置。

### ImmersiveDisplayComposer

- 外部 `agent背景.html` 只作为视觉参考，不进入生产依赖。
- 保留纯黑背景、中央紧凑对话框、左右上下文构图和 `Idle / Thinking / Focus` 三态。
- 输入仍为 `AgentGalaxyBackgroundPayloadV1`、稳定粒子身份、FlowModel 和解析后的上下文集合。
- 允许将焦点上下文有限地抽取到对话框一侧，但不改变实体身份、不复制目标、不向固定点塌缩。
- 背景能量下降和目标材质增强必须有上限；语义星核心透明度不参与状态动画。
- 证据面板只消费真实解析结果，不显示随机标题、随机引用数或伪造相关度。
- 第一轮使用独立 `AgentGalaxyImmersiveCanvas`、`AgentGalaxyImmersiveWorkspace` 和 `visual-review=agent-immersive`，不覆盖 `AgentGalaxyFlowCanvas` 或默认应用。
- `AgentGalaxyImmersiveCanvas` 复用 `AgentGalaxyFlowCanvas` 的引力织场和同顶点焦点通路；沉浸工作区负责 Agent 状态、中央对话框、面板构图和上下文集合。
- `agentGalaxyImmersiveContext.ts` 从真实载荷解析目标论文、所属热点和最多 24 个同热点邻近成员。该关系明确标记为 `hotspot-membership`，不冒充引用边。
- `ContextController` 使用 `aContextRoleA/B` 与 `aContextOrderA/B` 在同一论文/热点几何体上执行双槽交接。上下文只接受刚性世界平移和有限 FocusField 形变，内部语义几何不排序、不塌缩。
- `AgentStateController` 将六态映射为引力、剪切、扭曲、中央缓流、时间倍率和上下文强度，并以 900ms smootherstep 连续更新同一组 Shader uniform。
- `DynamicSemanticLayer` 预分配 24 个稳定槽。快照未抽样论文使用精确语义锚点；活动库新增论文使用带版本的未分类外围规则；缺失实体不占槽。
- `resolve_agent_galaxy_entities` 仅以 SQLite 只读连接查询 V20 membership、热点和论文元数据；浏览器评审使用完整视觉快照实现同构解析。
- `CoordinateSpaceBridge` 只传递 `entityId / hotspotId / sourceSnapshotId`，再以 400ms 遮罩切换两个独立空间解释器；严禁逐星坐标插值。

### ResidentFocusController

- M1.3a 只处理 `sampled` 常驻论文，不改变 `FlowModel.dynamicFocus=false` 的真实能力声明。
- 全部 3,840 个常驻论文使用稳定顶点顺序；质量预算通过 `aStableOrder` 逐点掩码控制，不再删除预算外顶点。
- `paperId -> vertexIndex` 在几何体创建时冻结。聚焦、释放和切换只更新 Shader uniform 与相机控制状态，不重建渲染器或论文几何体。
- `signal / soft-focus / full-focus` 使用独立时间曲线，并拆分为 `acquisitionBlend / fieldBlend / materialBlend / cameraBlend / releaseBlend`。完整聚焦先在 0.65 秒内捕获并展开光球，0.45–1.15 秒形成 FocusField，0.95–2.35 秒才接近相机。
- 完整聚焦目标终点为 `8.5 CSS px`，柔焦与信号分别为 `6.2 / 4.2 CSS px`；该绝对尺寸不依赖论文原始点大小，因此关闭相机时仍可辨识。
- 两个聚焦槽支持旧目标与新目标交叉过渡。目标世界位置始终来自基础引力织场，不生成替代星。
- 相机不改变 FOV；它在基础 `static/codrift` 轨迹与目标共速姿态之间连续混合，并把目标投影到未来对话框之外的安全区域。
- `FocusField` 是位于 FlowModel 之后的独立解析形变层，基础 `FlowModel.dynamicFocus` 继续为 `false`。它使用目标实时位置、流场切线和邻域语义向量产生非径向潮汐弯曲，世界位移不超过 `0.24`，目标自身不位移，论文云 P95 直径比保持 `0.96–1.04`。
- `signal / soft-focus / full-focus` 分别增加递进的低饱和语义色、亮度与尺寸；邻域透明度不随聚焦变化，暗微尘只响应局部速度/方向。
- 减少动态时关闭相机飞行和局部形变，只保留同一顶点的静态锐利强调。

## 参数实验室

M1.2a 开发评审入口继续与默认应用隔离，提供引力、剪切、扭曲、时间倍率、中央缓流强度、质量级别、固定/轻微协同漂移相机和固定时间参数。

固定随机种子和固定时间用于确定性截图；正常时间轴用于视频与性能验收。

主要验收使用固定相机，避免将相机运动误判为流场运动。轻微协同漂移仅作为补充，位移小于 `0.6` 世界单位、周期不短于 60 秒，不允许环绕或整景旋转。页面隐藏时暂停 RAF 且恢复后不补算离屏时间；减少动态时冻结在确定性时间相位。

开发评审模式支持只在固定时间截图时启用 `preserveDrawingBuffer`，并直接从 WebGL drawing buffer 导出 3840×2160 PNG；正常运行和视频模式不保留绘制缓冲。100% 星体裁切通过相机 `viewOffset` 重新渲染目标区域，不进行后期放大，避免浏览器界面缩放污染清晰度证据。PNG 保存端点仅在 Vite 开发服务器内启用，限制本机来源、文件名、PNG 文件头和文件大小，不属于生产 API。

## M2.0c-L0/L0-R1/L0-R2 武大机构接入探针与动态正式 SSO 导航

状态：`IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE ACCESS PROBE PASS`。该原生结论只覆盖正式 SSO 与浏览器检索入口，不代表全馆接入或全文能力完成。

```text
SettingsView
  → sidera_institution_probe({ institutionId: "whu" })
      ├─ Windows ToolHelp → aTrustTray.exe 进程名
      ├─ Program Files 固定路径 → 安装状态
      └─ allowlisted reqwest client（2 并发 / 8s / 5 redirects / 256 KiB）
          ├─ www.lib.whu.edu.cn
          │   ├─ 兼容路径：锚点级入口解析
          │   └─ 真实路径：HTML 壳 → 同域 /whuWebsite.js（顺序读取）
          │       ├─ 静态解析数据库导航绑定与 jumpDatabases 函数体
          │       ├─ MetaAuth 242010 SSO（仅系统浏览器）
          │       └─ 珞珈学术搜索 → 官方外部入口（仅系统浏览器）
          └─ whu.metaersp.cn/databaseList（仅无 Cookie 后台诊断）
              → native-direct / browser-required / unresolved / failed
              → 目录摘要 + 能力矩阵 + L1 路线
```

- 前端只提交 `institutionId`，不能提交探针 URL。重定向在发出下一跳前重新校验 HTTPS 与登记域名；动态脚本只允许武大官网主机、精确 `/whuWebsite.js` 和单一受限版本参数。MetaAuth、超星跳转接口和外部发现入口不会由 Rust 后台访问。
- core 是无 Tauri 依赖的纯解析层，覆盖 aTrust 固定快照、HTTP/JS/Login/上游服务异常夹具、锚点级入口、同域脚本发现、JavaScript 字符串静态解析、MetaAuth 租户与 service 校验、目录摘要、能力分类和安全错误；桌面层只负责 Windows 与受限网络 I/O。
- 动态脚本只在首页与 MetaERS 两项并发诊断完成后顺序读取，不执行 JavaScript，也不读取 Cookie 或用户名。整个探针任一时刻最多两个后台请求；脚本响应继续受 8 秒、5 次重定向、256 KiB 和 JavaScript Content-Type 限制。
- `navigationTargets` 只存在于当前探针结果。`openUrl` 可保留经过严格校验的 SSO service 供系统浏览器使用，`displayUrl` 删除查询参数、用户信息和片段；界面和日志不得渲染完整 SSO URL。
- 响应正文最多 256 KiB，只在当前命令内存中存在，不写聊天、事件日志、论文库或会话库；序列化结果不包含正文、Cookie、Token、密码或完整重定向参数。
- aTrust 运行只表示客户端环境就绪。账号密码和机构会话留在 aTrust/系统浏览器，普通机构检测、检索、阅读和导航不增加逐次审批。
- L0 不调用旧 CNKI Selenium、不下载全文、不创建文档 Schema，也不为 Agent 新增图书馆工具。L1 必须根据原生探针选择直接、浏览器或混合路线。

## M2.0c-L1a 应用内机构会话与武大多库检索预览

状态：`IMPLEMENTED / AUTOMATED TECHNICAL PASS / IN-APP INSTITUTION SEARCH UNVERIFIED`。

```text
LiteratureWorkspace / institution tab
  ├─ native query + source buckets + result list
  ├─ ResizeObserver → logical CSS bounds
  └─ Tauri commands（institutionId / query / opaque result id only）
       → SideraInstitutionRuntimeState
           ├─ institution-whu child WebView
           │   ├─ UDF: app-local/institution-webview-v1/whu
           │   ├─ official login + allowlisted navigation
           │   ├─ downloads/unknown windows/remote capability denied
           │   └─ fixed whu-catalog-multidb-v1 eval_with_callback
           ├─ taskId + epoch + sequence gate
           └─ in-memory SideraInstitutionSearchSnapshot
               ├─ source buckets: max 20 each
               ├─ normalized results: max 40 total
               └─ opaque result id → validated raw-record navigation
```

- 子 WebView 只能由 Rust 在主窗口中以固定标签创建；前端没有通用 WebView 创建权限。Tauri 固定为 `2.11.5` 并启用 `unstable` 以使用受控子 WebView API。
- WebView2 用户数据目录与系统浏览器、论文库和项目隔离，允许官方 Cookie/站点存储跨应用重启复用。Sidera 不调用 Cookie API，不读取表单、账号、密码、`localStorage`或`sessionStorage`；通用自动填充和密码保存关闭。
- 主框架导航只接受连接器登记的武大、MetaAuth、MetaERS 与馆藏检索主机；下载、新窗口和未知导航被拦截。未知目标只生成内存态不透明回退 ID，用户可显式交给系统浏览器，前端不能传递任意 URL。
- 适配器脚本是编译进 Rust 的版本化常量，只从固定页面提取状态、来源桶和题录字段；远程页面不获得 Tauri capability、IPC 或脚本入口。提取文本一律按不可信数据截断，单次回调上限 256 KiB。
- 检索状态区分 `uninitialized / starting / login-required / ready / expired / searching / partial / failed`。查询最长 200 字符、总时限 90 秒；任务 ID、epoch 和 sequence 共同隔离取消后的迟到回调。
- 归一化只保留页面实际字段，缺失值为空；依次按 DOI、规范 URL、标题＋年份去重并合并来源 provenance。原生结果快照仅存 Rust 内存，页面切换不终止，应用重启后清空。
- React 只负责原生结果呈现与真实宿主边界。全局导航、弹层、切换页签或返回原生结果前必须隐藏子 WebView，避免原生子表面遮挡 Sidera 控件；非机构页面可通过标题栏返回或停止检索。
- L1a 不扩展 `SourceKind`，不写 `papers`、会话 SQLite 或 Pi JSONL，不下载文件、不调用 Provider。后续顺序为 L1b 受控题录导入、F1 文档身份与来源基座、单篇全文获取、F2/F3 解析与阅读。

## M2.0c-L1a-R1 URL 级弹窗重放（已被 R2 取代）

状态：`AUTOMATED TECHNICAL PASS / NATIVE IN-APP INSTITUTION AUTH FAIL / SUPERSEDED`。把 `window.open` 的 URL 交给主 WebView 普通 `navigate()` 虽保留 UDF，却没有保留原始 POST、opener 和弹窗认证上下文；代理页直接 GET 为空，因此不能作为认证模型。

## M2.0c-L1a-R2 真实首航与共享环境认证模态（原生失败，已被 R3 取代）

状态：`IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE IN-APP INSTITUTION AUTH FAIL / SUPERSEDED`。R2 建立了共享 environment 模态和可恢复超时表面，但原生数据库 SSO 仍以 `SIDERA_INSTITUTION_NAVIGATION_TIMEOUT`结束，未完成认证闭环。

```text
database-sso
  → create hidden institution-whu at about:blank
  → configure UDF / navigation / password settings / NavigationCompleted
  → resolve official MetaAuth route (no homepage fallback)
  → navigate in main child WebView
  → IsSuccess + generation/epoch gate

library-account
  → institution-whu opens official library page
  → official window.open(url, POST/opener context)
  → strict connector URL decision
  → WebviewWindowBuilder.window_features(opener environment)
  → NewWindowResponse::Create { institution-whu-auth }
  → success/cancel/failure closes modal and re-enables main window

Settings L0 probe (no Cookie) → aTrust / public routes only
databaseAuth                  → database search gate
libraryAccountAuth            → personal library state only
```

- 主子 WebView 在 `about:blank` 阶段保持隐藏；首航只有 WebView2 `NavigationCompleted.IsSuccess` 才能释放原生表面。20 秒期限只发布 `NAVIGATION_TIMEOUT`，显式重试会重建失效子 WebView并复用 `institution-webview-v1/whu`，旧 generation/epoch 回调不可覆盖新状态。
- 弹窗决策器不开放任意 `whu.edu.cn` 子域，只接受登记的图书馆、MetaAuth、MetaERS、OPAC 与精确 `cas.whu.edu.cn/authserver/`。未知域名、HTTP、用户信息、异常端口和额外窗口继续拒绝。
- 个人图书馆模态通过 `NewWindowFeatures` 复用 opener 的 WebView2 environment，因此保留真实弹窗和表单语义；模态期间主窗口禁用，关闭、取消、创建/导航失败均恢复。Sidera 仍不读取 Cookie、表单值或凭据。
- `SideraInstitutionSessionState` 同时保存 `databaseAuth` 与 `libraryAccountAuth`；个人图书馆成功不等于数据库可检索，只有前者 `ready` 才能启动 `whu-catalog-multidb-v1`。

## M2.0c-L1a-R3 脱敏导航证据、策略分层与 DOM 就绪门

状态：`IN PROGRESS / AUTOMATED TECHNICAL PASS / NATIVE CLOSED-LOOP UNVERIFIED`。

```text
official probe entry
  database-directory HTTP/HTTPS target
                      │
                      ▼
WebView2 session navigation policy
  allow every HTTP/HTTPS host, port, path and redirect
  native network popups preserve POST + opener semantics
  query / fragment pass through as opaque auth state
                      │
          NavigationStarting / Completed
                      │
                      ├─ in-memory trace (max 32)
                      │    auth kind / phase / host / path
                      │    redirect / safe web error / id / generation / epoch
                      │    no query / fragment / ticket / Cookie / form / body
                      │
                      ├─ WebView failed → terminal state, cancel timeout
                      └─ completed
                           ├─ MetaERS personalIndex
                           │    └─ same WebView/UDF handoff → WHU catalog entry
                           └─ catalog page → versioned DOM inspection
                                      ├─ login page → login-required
                                      ├─ search form / buckets / records → ready
                                      ├─ service error → failed
                                      └─ unknown → ADAPTER_DRIFT
```

- 入口从武大官方探针返回的 `database-directory` 网络目标启动；一旦进入机构 WebView，会话层不再维护域名、路径、端口、userinfo 或 HTTP/HTTPS 白名单。所有网络跳转与重定向由 WebView2 原样处理，认证 query/fragment 不解析、不返回前端也不写入日志。
- `NavigationStarting` 与 `NavigationCompleted` 通过 WebView2 navigation ID、WebView generation 和会话 epoch 关联。脱敏轨迹只在当前运行内存保留最近 32 条；关闭程序后清空，不写论文库、会话库或日志。
- WebView2 失败和完成都是首航终态，会立即使等待失效；20 秒超时只处理从未收到任何终态的传输停滞。重试生成新 generation，迟到导航、计时器或 DOM 回调不得覆盖新状态。
- 两轮实机轨迹证实限制策略而非网络传输阻断了 MetaAuth 后续跳转，第二轮明确给出 `POLICY_UNREGISTERED_TARGET`。该策略已被删除：HTTP 不再被强制升级，未知 HTTP/HTTPS 主机和异常端口不再由 Sidera 拒绝；数据库 `window.open` 返回 `NewWindowResponse::Allow`，由 WebView2 保留原始 POST/opener 语义。只有非 HTTP/HTTPS 顶层协议不会进入机构 WebView。
- 机构 WebView 不再强制关闭自动填充、密码保存、开发工具或下载，也不会因这些设置 API 不可用而判定初始化失败。远程页面仍未绑定 Tauri capability；这不是网络导航限制，也不参与登录链。
- 第三轮原生轨迹已经完整到达`whu.metaersp.com/personalIndex`，所以它被定义为数据库 SSO 成功落地页，而不是`whu-catalog-multidb-v1`的 DOM。运行时以 navigation epoch 幂等地在同一 WebView/UDF 中进入`WHU_CATALOG_ENTRY_URL`；迟到事件、重复`NavigationCompleted/on_page_load`与旧重试不能重复交接。
- 传输成功不等于认证就绪。R3 最初由 `whu-catalog-multidb-v1` 的版本化 DOM 检查确认；主机名只决定下一步检查或登录表面。该检查的导航伪结果缺陷已由下述 R3-R1 的 `whu-catalog-multidb-v2`取代，结构未知仍必须报告 `SIDERA_INSTITUTION_ADAPTER_DRIFT`，不得等同于空结果。
- 当前实现仅是原生闭环候选。真实数据库 SSO、个人图书馆模态、中英文结果、原始记录、跨页连续性和重启复用全部通过前，架构状态不得提升为 COMPLETE，也不得开始 L1b。

## M2.0c-L1a-R3-R1 真实提交证明、结果身份门与双会话 DOM 就绪

状态：`IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE CLOSED-LOOP UNVERIFIED`。

原生 R3 已证明数据库 SSO 能落到武大馆藏页面，但旧 `whu-catalog-multidb-v1` 允许全局导航链接进入记录候选，导致“简单检索”被伪装成文献，同时入口检查可能在没有真实提交查询时直接返回。R3-R1 将适配器升级为 `whu-catalog-multidb-v2`，并把会话、提交和结果身份拆成连续的证明链：

```text
databaseAuth DOM ready
  → search-form-only entry
  → capture pageSignature
  → fill query + official form submit
  → require changed signature | matching queryEcho | official result/zero structure
  → source buckets
  → record identity gate
  → normalize + deduplicate
  → opaque resultId → verified detail navigation
```

- `SideraInstitutionAdapterPage` 增加不含 Cookie、凭据或响应正文的 `pageSignature`、可选 `queryEcho` 与 `explicitZeroResults`。签名只用于当前任务、generation 和 sequence 内判定页面是否变化；不能作为跨运行身份或认证材料。
- 初始页面只能是 `search-form`。提交后仍停留在原签名、没有查询回显且没有正式结果结构时返回 `SIDERA_INSTITUTION_QUERY_NOT_SUBMITTED`；只有页面明确显示零记录或所有来源桶为零时才允许成功返回空快照。
- 记录身份门同时要求非导航标题和真实馆藏详情定位。`func=find-b` 等检索菜单、导航标题及缺少 `doc_number`/`set_number + set_entry` 的链接不能进入结果；发现候选伪记录时返回 `SIDERA_INSTITUTION_RESULT_FALSE_POSITIVE`，未知结构返回 `SIDERA_INSTITUTION_ADAPTER_DRIFT`。
- 来源桶在同一已提交页面中顺序提取，每桶最多 20 条、总计最多 40 条；单桶失败可保留其他结果并标记 `partial`。前端仍只持有不透明 `resultId`，真实详情地址由 Rust 当前快照解析并再次验证。
- `databaseAuth` 与 `libraryAccountAuth` 继续独立。个人图书馆页面不再因进入已知主机而直接 `ready`；只有版本化 DOM 检查识别已认证页面才就绪，账号密码表单返回 `login-required`。两类 WebView 继续复用隔离 UDF，但任何一方状态都不能替代另一方的页面证明。
- R3 的脱敏导航轨迹、开放网络链和 generation/epoch 隔离保持不变；MetaERS→馆藏自动交接已由 R4 的认证/来源分层取代。自动验证只能证明候选实现；中英文真实查询、详情、跨页和重启复用完成前不得开始 L1b。

## 开发 010 / P2a-R2 后台检索单一状态权威与跨页连续性

状态：`IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE CONTINUITY UNVERIFIED`。P1保持`PARTIAL / ADAPTER DEFERRED`，P2仍停留在P2a；该层只收口检索生命周期，不扩充连接器、分页或全文能力。

```text
App process
  └─ ResearchSearchStore (single authority)
       ├─ displayedSnapshot  ── stable complete / partial / explicit-zero result
       ├─ activeAttempt      ── one user-search / retry / compatibility attempt
       ├─ lastFailure        ── failure metadata without replacing displayed result
       └─ lifecycleJournal   ── 32 sanitized in-memory events

LegacyAcademicTransportRun
  └─ taskId + clientRequestId + epoch + sequence + webviewGeneration
       ├─ valid callback   → active attempt/source only
       └─ stale callback   → discard

App root
  ├─ initial state read
  ├─ one sidera-research-search listener
  └─ InstitutionResourceWorkspace (pure projection + user actions)
```

- `displayedSnapshot`是导入审查和原生结果展示的稳定来源。新任务开始时旧快照继续可读；只有`complete / partial`或有明确零结果证据的完成状态可以原子替换。失败或取消只更新`lastFailure`，不清空旧候选和选择。
- 学术发现旧DOM传输只作为私有传输运行，不再写公共旧`search/searchSnapshots`或发布学术旧事件。馆藏目录继续使用`sidera-institution-search`；学术兼容命令只能把新状态投影为旧返回结构，不能再创建第二任务或反向写入编排器。
- 用户动作带`clientRequestId`和`startReason = user-search | retry | compatibility`；同一请求ID幂等。所有eval、超时、导航和WebView回调写入前都验证完整任务令牌，`SIDERA_INSTITUTION_EVAL_TIMEOUT`只影响对应活动尝试或来源。
- 研究检索状态和事件监听属于App根级。普通导航、组件卸载和重挂只改变可见投影，不开始、不取消任务；返回机构页恢复同一searchId、查询、候选、来源报告和候选选择。
- 机构错误通知使用作用域与状态版本。数据库SSO或研究检索恢复成功只清理对应旧失败，不删除其他错误。个人图书馆或其他可见认证表面不拥有数据库身份，不得使已就绪数据库会话失效或重建UDF。
- `sidera_import_review_create_from_search`继续校验稳定展示快照的searchId、generation、producerVersion和候选ID；即使另一个尝试正在执行，也允许从当前展示快照创建审查批次。

## 开发 009 / P2a-R1 武大后台检索连接器与原生审查闭环

状态：`IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE PARTIAL PASS / CROSS-VIEW CONTINUITY FAIL`。P1保持`PARTIAL / ADAPTER DEFERRED`；该层不把机构网页重新升级为主产品表面。

- UI无关的`LiteratureConnector`定义`capabilities / ensure_session / search / resolve_record / resolve_full_text`能力边界，`ResearchSearchOrchestrator`拥有请求、task/epoch/sequence、来源报告、规范化、去重、失败隔离和40条结果上限。`whu-academic-discovery-v2`目前是能力与编排契约；当前唯一可执行候选生产者仍是`whu-academic-discovery-v1-dom-fallback`，来源报告必须标记`DomFallback + experimental`。
- 目标会话传输按“稳定结构化接口或导出 → 同UDF隐藏请求 → 实验DOM回退”排序。WebView2协议勘察只在Rust进程内保存脱敏方法、主机、路径和响应字段Schema，并能选出更强传输候选；但当前只用于路由证据，尚未直接发请求或解析候选。临时Cookie jar不可序列化、值在清理/析构时覆盖，但尚未接入搜索运行时；当前搜索不调用Cookie读取API。
- 原生状态为`checking-session → awaiting-user-auth → resolving-connectors → searching → normalizing → complete | partial | failed | cancelled`。认证等待只显示官方登录表面，完成后恢复同一searchId；正常检索不会请求侧栏或沉浸网页。
- `SideraNormalizedCandidateDraft`统一机构、文件和未来公共API的候选字段。真实详情/全文URL以`skip_serializing`留在Rust，前端只收到候选ID和不透明locator；类型不明、图书和无效记录不进入正式结果。供应商记录去重键为`来源数据库＋记录ID`，字段provenance和候选生产版本都指向实际产生候选的适配器，而不是v2编排契约名称。
- `sidera_research_search_start / cancel / snapshot`管理临时快照；`sidera_import_review_create_from_search`仅接受当前快照的不透明候选ID，并校验searchId、generation、实际生产适配器版本后调用P2a审查服务。规范身份URL进入审查前统一移除ticket、token、session等认证参数，原始敏感URL和全文URL不持久化。显式原始记录核对由独立打开命令完成，不改变快照。
- 审查批次仍写入`Sidera/import-review-v1.sqlite`，主论文库只读。本层只为未来Agent预留编排器服务接口；没有Agent工具、主库提交、全文下载、PDF解析或Provider调用。

## 开发 011-R2 / P2b-R2 提交账本权威与本地显式检索

提交成功事实只由主库`paper_import_commits`决定。普通 `import_commit_status/history` 读取主库账本后直接返回权威投影，不再 best-effort 修复 `import-review-v1.sqlite` 回执；双方对账只存在于显式提交、回滚等可写流程。主库事务成功后，即使审查状态或界面刷新失败，也只能产生次级刷新告警，不能返回“提交失败”。用户已完成10条真实新增提交，记为`NATIVE CONTROLLED IMPORT PARTIAL PASS`；重启呈现、可见整次回滚和数据漂移阻止仍待验收。

本地检索采用`draft → explicit execute → request sequence → SQLite page`数据流。输入、IME composition和普通组件重绘都不创建查询；仅Enter、检索按钮或显式重新检索产生请求。Rust/SQLite执行规范化过滤、确定性排序和`LIMIT/OFFSET`分页，React保留旧页直到新请求完成，失败与取消不清空旧结果，迟到序号被丢弃。状态为`IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE LOCAL SEARCH UNVERIFIED`，完成门为`NATIVE CONTROLLED IMPORT AND LOCAL SEARCH PASS`。

## 开发 012 / F1a 单篇不可变文档基座

F1a采用独立`Sidera/documents-v1.sqlite`和内容寻址blob目录，不修改主论文库schema。`AcquisitionRecord`记录一次本地选择或机构暂存接入的来源、结果与安全定位；成功获取生成`DocumentVersion`，其SHA-256同时是去重键和不可变文件路径依据。相同PDF复用版本，不同PDF为同一PaperEntity创建新版本，原文件不被覆盖。文档库v2将文件获取方式与版本类型分离，版本类型固定为出版社正式版、作者稿、扫描版、用户导入版或待确认，后续阅读器和Agent不得用“机构获取”直接推断出版社正式版。

写入顺序为`验证Paper/SourceRecord → 校验PDF签名 → 计算SHA-256 → .partial原子写入与fsync → 哈希复验 → rename → documents-v1.sqlite事务`。本地文件先由用户选取，再明确关联PaperEntity；它不依据文件名、目录或正文推断身份，且`source_record_id`固定为空。机构路线先由前端提交不透明SourceRecord ID，Rust验证其确属当前论文，并解析为仅供当前运行导航的安全官方路线；该内存路线只保留协议所需的非敏感查询参数，前端只得到去查询的`origin + path`展示地址。来源无法解析或共享机构浏览器无法导航时，分别写入阶段为`source-route`或`source-navigation`的失败`AcquisitionRecord`。用户随后在官方会话中显式完成单篇PDF下载；机构文件只接受Rust下载清单中状态为completed的不透明ID，并按搜索候选ID、供应商记录ID、脱敏规范定位或唯一来源库精确解析SourceRecord，歧义或无匹配时返回`SIDERA_DOCUMENT_SOURCE_MATCH_UNRESOLVED`。下载选择或来源匹配失败写入阶段为`download-selection`或`source-match`的失败记录。所有持久化安全定位仍删除userinfo、query和fragment，失败记录不创建`DocumentVersion`。前端只展示来源、版本、完整哈希、文件大小和获取记录。当前为`IMPLEMENTED / AUTOMATED TECHNICAL PASS / PRODUCT UNVERIFIED`，原生门为`NATIVE SINGLE-DOCUMENT ACQUISITION PASS`。

## 开发 011-R1 / P2b-R1 早期 v14 兼容识别与安全补全

状态：`IMPLEMENTED / AUTOMATED TECHNICAL PASS / PRODUCT UNVERIFIED`。开发011首次原生初始化已记录为`PRODUCT FAIL / SUPERSEDED`；本层只修复早期v14数据库与最终v14治理契约之间的安全兼容，不改变P2b的提交、来源、回滚或主库实体规则。

```text
existing research-hotspots-v7.sqlite
  → read-only full-contract inspection
      ├─ current-v14
      │    → strict validation → open (no backup, no write)
      ├─ known-precontract-v14
      │    → independent .pre-v14-contract.<timestamp>.sqlite backup
      │    → SHA256 + source fingerprint
      │    → BEGIN IMMEDIATE
      │         ├─ recheck fingerprint and known signature
      │         ├─ add only missing v14 contract objects
      │         ├─ strict current-v14 validation + foreign_key_check
      │         └─ commit or all-or-nothing rollback
      └─ unknown-invalid-v14
           → reject without backup or mutation
```

- 分类不以`user_version=14`单独成立为充分条件；检查表、列、索引、外键和治理对象的完整签名。只有精确命中登记的早期签名才允许兼容补全，其他损坏、混合或未来未知结构都属于`unknown-invalid-v14`。
- 兼容备份与常规迁移备份相互独立，文件名使用`.pre-v14-contract.<timestamp>.sqlite`，并在初始化结果中返回路径与SHA256。备份失败、哈希失败或源文件指纹变化都必须在写事务前终止。
- 补全使用`BEGIN IMMEDIATE`，只创建缺失契约对象，不覆盖已有论文、来源、身份别名、提交账本或审查决定。事务内补全后再次执行严格当前契约与外键验证；失败时SQLite事务恢复原始结构。
- `current-v14`重复打开保持幂等；成功补全后的再次打开必须归类为`current-v14`，不得再次生成兼容备份。`unknown-invalid-v14`不得通过删表、重建、猜测或降级打开绕过。
- 初始化接口公开`schemaContractStatus`、`compatibilityRepairApplied`、`migrationBackupPath`和`migrationBackupSha256`，前端据此区分当前契约、已知早期契约与未知无效契约。自动验证只操作临时合成库，真实所选主库仍需原生兼容验收。

## 前序开发 011 / P2b 受控主库提交与来源治理

状态：`IMPLEMENTED / AUTOMATED TECHNICAL PASS / PRODUCT FAIL / SUPERSEDED`。P2b只把用户已经完成审查决定的题录写入主库；首次原生初始化因早期v14契约不兼容失败，兼容入口现由开发011-R1取代。P2c/F1的全文、文档版本与索引能力不属于本层。

```text
Sidera/import-review-v1.sqlite (schema v3, authoritative review ledger)
  → complete per-candidate decisions
  → deterministic commit preview
      ├─ previewId + previewHash
      ├─ batchVersion
      ├─ expected main-library revision
      └─ insert / merge / keep-separate / skip + field actions
  → revalidate the whole batch
  → one main-library SQLite transaction (schema v14)
      ├─ papers: insert or fill-empty-only merge
      ├─ paper_source_records
      ├─ paper_identity_aliases
      ├─ paper_import_commit_items
      ├─ paper_import_commits
      └─ library revision
  → commit review ledger state
  → restart reconciliation (never replay the write speculatively)
```

- `previewHash`覆盖批次、决定、身份目标、逐字段动作和主库revision前提。执行接口必须同时提交previewId、hash、batchVersion、expectedRevision与clientCommitId；任何一项不匹配都拒绝，不能在过期预览上继续写入。
- 主库提交以整个批次为原子边界。`insert`创建新论文；`merge`仅在主库字段为空且候选字段非空时填充，已有非空字段记录为`preserve-existing`；`keep-separate`创建独立论文，`skip`只进入提交项账本。约束、来源、身份别名、revision或账本任一写入失败都会回滚整个事务。
- `paper_source_records`保存来源数据库、生产者版本、供应商记录ID、规范定位、元数据与字段provenance；`paper_identity_aliases`只保存规范DOI、来源内供应商身份和规范URL别名。来源记录与论文实体分离，后续连接器可新增来源而不覆盖论文已有字段。
- 审查账本是批次状态权威，主库`paper_import_commits`和`paper_import_commit_items`是落库事实。重复clientCommitId或同一已提交批次通过账本返回既有结果；若进程在主库提交与审查状态更新之间退出，重启时执行双方对账，不自动重放提交。
- 回滚首先验证整批可逆性：本次insert没有被后续提交引用，本次merge的目标字段仍等于提交后的fingerprint，身份别名和主库revision符合前提。全部安全才在一个事务内恢复；任一冲突返回整批`rollback-conflict`且零写入。接口不提供`force`。
- P2b不会自动生成热点、修改空间模型、获取或解析全文、调用Provider或触发Agent；这些能力分别属于后续P2c/F1及更晚阶段。
- 只有原生桌面完成整批提交、重启对账、幂等重复提交与安全回滚验收后，才可记录`NATIVE CONTROLLED IMPORT PASS`；自动技术证据不能替代该产品门槛。

## P2a 文件题录审查与身份解析基座

状态：`IMPLEMENTED / AUTOMATED TECHNICAL PASS / PRODUCT UNVERIFIED`。P2a 与机构网页适配器解耦，文件候选进入独立审查库；在 P2b 明确确认前不得写入主论文库。

```text
CSV / JSON / JSONL / NDJSON / BibTeX / RIS
  → bounded parser
  → SideraImportCandidate
  → identity evidence (strict precedence)
      1. normalized DOI
      2. source database + provider record id
      3. canonical detail URL
      4. normalized title + first author + year
  → read-only research-hotspots-v7.sqlite identity index
  → new | merge | conflict | invalid
  → Sidera/import-review-v1.sqlite
      ├─ review batch
      ├─ candidates + evidence + matches
      └─ explicit per-candidate decision
  → P2b: preview-bound whole-batch atomic write to the main paper library
```

- `research-hotspots-v7.sqlite`只以只读连接参与身份比对；P2a 不修改其 schema、论文数量或 revision。审查批次位于所选论文库旁的独立`Sidera/import-review-v1.sqlite`，按项目隔离并可跨重启恢复。
- 候选信息不足、强身份冲突或解析错误不会自动补写、自动合并或静默降级。`new / merge / conflict / invalid`是系统判定，`accept-new / accept-merge / keep-separate / skip / unresolved`是用户决定，二者分别持久化。
- React 只通过 Rust 命令创建、列出、打开、保存决定和放弃批次，不直接访问 SQLite。放弃批次只改变审查状态，不删除或改写主论文库。
- 当前文件路线是 P2a 的稳定完成路径；机构统一发现快照以后可以复用同一候选接口，但不再阻塞 P2a。

## P1c-R3 真实主窗口宿主与应用自有窗口所有权

状态：`IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE WINDOW OWNERSHIP UNVERIFIED`。P1总状态为`PARTIAL / ADAPTER DEFERRED`。该工作包只修复 Tauri 顶层窗口所有权，不继续增加供应商 DOM 补丁。

```text
AppHandle
  → app.get_window("main")
  → SideraMainWindowHost
      ├─ Windows: Window::hwnd() → WebviewWindowBuilder::owner_raw(hwnd)
      └─ non-Windows: application-owned window without raw owner
```

- `main`是 Tauri `Window`，不能假定为`WebviewWindow`。隐藏统一发现结果面、统一发现认证、个人图书馆认证以及共享机构浏览器普通/认证 popup 全部经同一宿主解析器创建。
- Windows 所有权使用`owner_raw()`，禁止`parent_raw()`或会生成子窗口语义的`parent()`；`NewWindowResponse::Create`、共享 UDF、opener、POST、`window_features`和任务代际隔离保持不变。
- 主窗口禁用、恢复、聚焦与关闭收口同样使用真实顶层`Window`。错误分别映射为主窗口缺失、HWND不可用、owner绑定失败与 WebViewWindow创建失败，避免把宿主错误误报为统一发现零结果。
- P1 的手工登录、机构访问、数据库直达和全文逐级跳转继续作为已验证基础能力；自动统一发现筛选与结构化抽取转为`DEFERRED / EXPERIMENTAL`。内嵌网页定位冻结为认证、访问、原始记录核对、全文跳转和故障回退层。

## P1c-R2 原生研究双栏与侧边机构浏览器

状态：`IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE SPLIT WORKSPACE UNVERIFIED`。P1c-R1的固定网页内部滚动已由用户实机确认性能`PASS`，但网页独占工作区的产品构图与原生功能连续性为`FAIL`。

```text
SideraInstitutionBrowserPresentation
  closed ─────── native research workspace 100%
  split
    ├─ width >= 1180: native pane | draggable divider | real WebView
    └─ width < 1180: logical split + native/browser single-surface switch
  immersive ─── explicit user action only → real WebView 100%

split preference v1
  parse JSON → invalid/missing = 0.50
  clamp 0.30..0.70
  resolve native >= 420px and browser >= 640px
  pointer move → requestAnimationFrame → React layout → ResizeObserver
  changed >= 1px → active WebView set_bounds(Rect), never focus
```

- 展示状态属于 React 产品构图，不改变 Rust 标签、popup、下载或 UDF 生命周期；关闭展示只隐藏网页表面，关闭最后一个网页标签才强制回到`closed`。打开数据库、题录和全文统一请求`split`，任何远程页面都不能自动进入`immersive`。
- 左侧原生面仍拥有来源、检索、停止、认证/错误、脱敏轨迹、来源桶、结构化结果与题录/全文入口；右侧浏览器只拥有真实网页交互、标签/导航、认证 popup状态和下载暂存。自动检索快照与手工浏览仍按 P1b/P1c 的所有权边界隔离。
- 宽屏两面各自滚动；外层工作台不跟随网页滚动。窄屏只切换可见面，WebView、标签、任务和原生快照保持挂载。切换其他 Sidera 页面时 Rust WebView隐藏，返回机构资源后按原构图恢复。
- `ResizeObserver`只观察真实浏览器宿主几何；普通 wheel、原生结果 scroll 与网页内部 scroll 不注册 bounds监听。分隔条拖动每动画帧最多产生一次 React几何变化，前后端`<1px` no-op和几何/焦点分离继续沿用 P1c-R1。
- P1c-R2只修复构图与连续性，不新增题录导入、全文解析、沉浸阅读器或 Agent动作；这些能力仍按 P2/F1/F2 后续阶段进入统一资产管线。

## P1c-R1 兼容优先 popup bridge 与固定浏览器视口

状态：`IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE POPUP AND PERFORMANCE UNVERIFIED`。修复前原生基线仍是`POPUP ROUTING FAIL / EMBEDDED BROWSER PERFORMANCE FAIL`，架构落地不能覆盖实机结论。

开发 005 在 P1c 的共享 UDF、child-tab、认证模态和下载暂存之上增加两个互相独立的状态边界：

```text
child WebView on_new_window(target, features)
  ├─ auth hint/about:blank
  │    └─ institution-browser-auth → Create + real modal semantics
  └─ ordinary HTTP/HTTPS
       └─ managed WebviewWindow → same UDF + window_features + Create
            ├─ popupId + openerTabId + generation
            ├─ sanitized origin/path + phase + resolution + code
            ├─ whu.metaersp.com/loading → transient bridge
            │    ├─ opener reaches canonical provider → close duplicate
            │    └─ 30s → POPUP_BRIDGE_TIMEOUT
            ├─ explicit safe GET proof → may migrate to child tab
            └─ opener/POST/unknown method → retain independent popup

browserRequested=true (P1c-R1 historical focus model; superseded by P1c-R2 presentation)
  → fixed WebView internal scroll and no outer scroll-driven bounds
  → ResizeObserver | window resize | visibility/tab switch
  → <1px epsilon → active tab set_bounds(Rect), no focus
```

popup 状态只序列化 origin/path，不保存 query、fragment、ticket、Cookie、表单值或正文。所有 page-load、close 和 timeout 回调必须同时匹配`popupId + openerTabId + generation`；terminal 状态拒绝迟到事件。Tauri 2.11.5 高层 popup 回调不提供请求方法证明，也不能把既有 popup WebView直接收编成主窗口 child-tab，因此运行时默认保留独立窗口；纯状态机保留显式 safe GET 迁移分支，但禁止凭最终 URL 猜测后重放。

几何、显隐和聚焦是三套调用：bounds 只写活动标签并以单次`set_bounds(Rect)`提交；visibility只 show/hide；focus只在首次显示、用户切换/关闭标签或明确交互时调用。普通滚轮没有任何 bounds 监听器，返回原生结果时恢复 workbench 滚动位置，原有搜索快照和选中来源保持挂载。

## 前序 P1c 共享机构浏览器、认证模态与下载暂存

开发 004 把此前散落在`institution-whu`、active-search 结果面、数据库直达窗口和认证 popup 中的用户浏览职责，收口为一个 Rust 所有的共享机构浏览器内核：

```text
React InstitutionBrowserShell
  ├─ tabs / address / back / forward / reload / stop
  ├─ ResizeObserver → browser_set_bounds / browser_set_visible
  └─ download drawer / auth state / return-to-native
                  │
                  ▼
SideraInstitutionBrowserRuntime (Rust)
  ├─ institution-shared-v1 profile
  ├─ child WebView tabs ─────────────── shared WebView2 UDF
  ├─ institution-browser-auth modal ── NewWindowResponse::Create + window features
  ├─ page observer ─────────────────── database / discovery / library auth state
  └─ institution-downloads-v1
       ├─ staged file
       └─ manifest: SHA-256 / MIME / size / source / safe provenance

Hidden task-bound institution WebViews
  └─ query submit / facet control / extraction / native snapshot
```

关键边界：

- 用户直接输入或明确导航的 HTTP/HTTPS 地址继续进入应用内标签页。此前“普通`window.open`立即创建标签页”的 URL 重放已被 P1c-R1 取代；popup 必须先保留真实 opener/POST/window features。`mailto:`和`tel:`由系统处理，顶级`javascript:`、`file:`、`data:`及未知 scheme 不进入机构浏览器。
- 认证站点需要 opener、POST、窗口特征或回调语义时，使用唯一`institution-browser-auth`模态。标签与模态显式复用`institution-webview-v1/whu` UDF；所有项目共享机构 Cookie 与站点存储，但 Sidera 不读取或导出它们。
- 远程网页不绑定 Tauri capability；React 只能调用固定浏览器命令，不能把远程脚本变成本地 IPC 入口。用户可任意浏览网络页面不等于网页获得任意本地权限。
- 浏览器标签与历史状态属于当前运行内存；WebView2 UDF和下载清单跨重启保留。根级视图、全局导航或原生结果面显示时必须隐藏所有子 WebView，避免原生表面覆盖 Sidera 控件。
- 后台自动检索继续由不可见、任务绑定的 WebView 拥有。浏览器页面可以用于登录、原始记录核对和自由浏览，但不能直接写入当前原生检索快照。
- 数据库 SSO、统一发现全文身份和个人图书馆继续是三个独立状态。共享浏览器只向既有版本化 DOM 检查器提供匿名页面状态，不读取 Cookie、密码、ticket、表单值或响应正文。
- 用户显式下载的文件进入`institution-downloads-v1/<id>`。完成后计算 SHA-256 并保存安全文件名、MIME、大小、来源标签与脱敏 provenance；包含 token/ticket 的完整 URL 仅在运行内存中存在。中断后清单可恢复为失败记录，缺失文件不会被误报完成。
- 下载暂存不是论文导入或文档基座：它不修改`research-hotspots-v7.sqlite`、会话 SQLite 或全文 Schema，也不自动解析、建立论文身份或调用 Provider。F1/F2 后续按哈希和 provenance 接管文件身份与沉浸式阅读。

该架构取代 D-136、D-138、D-147、D-148 中“某个固定用户可见 WebView 长期拥有全部机构网页”的部分，但保留任务绑定抽取、真实认证 popup 语义与三类认证状态的安全门。

## P1b-R1 任务绑定结果 WebView、真实分面与原生快照

状态：`IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE ACADEMIC DISCOVERY UNVERIFIED`。P1 总状态仍为`IN PROGRESS`；上一原生版本的 active search 事实为`NATIVE ACADEMIC DISCOVERY FAIL`。

P1b-R1 不增加论文库或文档 Schema，而是在现有机构运行时边界内收紧产品所有权：

```text
InstitutionResourceWorkspace
  ├─ unified academic discovery
  │    query → official Luojia window.open
  │          → app-owned result WebView (same environment/UDF + opener)
  │          → task/epoch/sequence/generation binding
  │          → confirmed combined facets | sequential controlled subsearches
  │          → strict structured paper snapshot → opaque record/full-text locators
  ├─ database direct
  │    registered entrance/type/capability → official database portal → WOS/vendor window
  └─ catalog
       query → OPAC v3 cleanup → isolated holdings snapshot

full-text locator
  → direct-html/pdf | doi | openurl/link-resolver
  → provider-record | publisher-page | browser-fallback
```

- 搜索状态机仍只有`academic-discovery`与`catalog`两个可执行来源；`database-direct`是独立的只读入口登记表面，不伪造空快照或供应商结果。
- active search 不再把 popup URL 普通导航回主`institution-whu`。Rust 通过应用自有 WebView 承接真实`window.open`，继承 opener 的 WebView2 environment/UDF，并以`taskId + epoch + sequence + webviewGeneration + label`绑定。旧任务、旧 generation、手工 popup、嵌套原始页面和迟到 page-load 回调都不能写入当前快照。
- 统一发现先证明当前查询已提交，再在真实结果 WebView 应用资源类型分面。标签先删除中英文数字计数和可访问性后缀，选中态读取 input.checked、`:checked`、aria checked/selected/pressed 和真实 Material/Primo 类。每次点击后等待页面/分面签名改变；控件互斥或前一选项消失时，按文章、会议论文、学位论文顺序执行子检索并合并。
- inspect、分页和 extract 只接受任务绑定结果 WebView。归一化再严格限制为`journal-article / conference-paper / thesis`；图书、电子书、期刊刊名、菜单、脚本和 unknown 拒绝。只有页面显式证明零结果时才允许空快照，筛选未确认或适配器漂移都以错误终止。
- 六类全文路线由 Rust 根据 DOI、解析器特征、详情/全文主机关系和供应商记录身份分类。React 只显示路线与不透明定位，不接收真实 URL；路由分类不等于全文已经获取。
- 抽取完成后结果 WebView 默认隐藏、React 展示原生快照；“查看原始页面”只切换当前任务结果面可见性，不创建快照。现有持久 WebView2 UDF继续承担重启后机构 Cookie/站点存储复用，但 Sidera 不读取 Cookie。

## P1b-R2 统一发现认证状态、受管弹窗与可暂停任务恢复

状态：`IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE DISCOVERY AUTH UNVERIFIED`。最新原生事实为`DISCOVERY AUTH CALLBACK/STATE SYNC FAIL`，不是数据库 SSO 或凭据失败。

```text
databaseAuth                       libraryAccountAuth
  database SSO only                 personal library only

academic-discovery sourceReadiness → search page reachable
academicDiscoveryAuth              → idle | starting | login-required
                                      | ready | cancelled | failed

task-bound result WebView window.open(http/https, features)
  → singleton app-owned discovery auth WebviewWindow
  → NewWindowResponse::Create + window_features(features)
  → same opener environment/UDF + POST + window.opener
  → whu-discovery-auth-v1 DOM inspection (origin/path only)
      ├─ ready → close popup → reload bound parent → DOM recheck
      │          → same task resuming-after-auth → facets → extraction
      ├─ manual close → inspect popup + shared parent before cancel
      └─ cancel/failure/create failure → stable terminal code + retry
```

- `AcademicSearchResumeContext`保存`taskId、epoch、sequence、webviewGeneration、query、resultWebviewLabel、phase`。popup 自有`authEpoch`；每个 page-load、关闭、父页恢复与 timeout 回调都同时校验 popup、任务和 WebView generation。
- `awaiting-auth`期间任务 future 继续存在但普通 90 秒活动预算不递减；分面和结果等待器也扣除认证暂停时长。认证成功只恢复原任务，不创建新用户轮次或新 taskId。
- 成功检查只读取有上限`body.innerText`和`location.origin + pathname`，不读取 Cookie、ticket、表单值、账号、`localStorage`或`sessionStorage`。远程认证窗口标签不在 Tauri capability 中，不能获得 IPC。
- 父页刷新后必须重新识别`search-form / records / zero-results`才解除暂停；失败使用`SIDERA_INSTITUTION_DISCOVERY_AUTH_RESUME_FAILED`，不能生成伪零快照。检索入口 readiness 仍可保持 ready，因为它与全文身份不同。
- 程序重启只复用持久 UDF；内存状态重新从真实页面 DOM 建立，不把旧进程的 ready 当事实。数据库直达、馆藏目录、现有分面与严格论文抽取均保持原边界。

## M2.0c-L1a-R4 论文级统一发现与馆藏目录双来源

状态：`IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE ACADEMIC DISCOVERY FAIL / SUPERSEDED BY P1b-R1`。

R4 将“数据库认证”“统一学术发现”“OPAC 馆藏目录”拆为三个独立层级。MetaERS `personalIndex`只结束数据库 SSO；它不再自动交接 OPAC，也不代表任何检索来源已经就绪。`SideraInstitutionSessionState.sourceReadiness`分别记录`academic-discovery`与`catalog`，搜索快照携带来源和联合适配器 ID：

```text
databaseAuth=ready
  ├─ academic-discovery
  │    official L0 target | WHU home exact discovery element
  │      → whu-academic-discovery-v1
  │      → paper identity/type gate
  │      → record/full-text opaque locators
  └─ catalog
       WHU OPAC entry
         → whu-opac-catalog-v3
         → whole bibliographic container cleanup
         → logical catalog identity deduplication
```

- Rust 运行时按来源保存独立内存快照、详情 URL 映射和全文 URL 映射；前端仅提交`source + resultId + target`，不能提交任意 URL。来源切换只改变当前呈现，不清空另一来源快照。
- `whu-opac-catalog-v3`不再遍历每个详情链接直接生成记录。固定脚本先克隆完整书目容器并删除脚本、样式、模板和隐藏节点，再按显式题名、有效书目链接、最长可读行选取一个题名；Rust 以馆藏记录 ID、规范详情、ISBN/ISSN、题名与年份执行二次去重和唯一记录上限。
- `whu-academic-discovery-v1`优先读取 L0 当前运行探针的`unified-discovery`目标；没有目标时只在同一机构 WebView 中加载武大官网，严格匹配并激活“珞珈学术搜索/学术搜索”元素。找不到入口时以`SIDERA_INSTITUTION_DISCOVERY_ROUTE_UNRESOLVED`终止该来源，不能转入 OPAC。
- 学术适配器仅归一化期刊论文、会议论文与学位论文；书籍、电子书、期刊刊名和馆藏记录被排除。每条结果必须具有受控详情定位，并有 DOI 或作者加期刊/会议/授予单位/年份等身份组合；类型或来源不能确认的记录使快照降为`partial`。
- 全文状态只表示`available / link-only / unavailable / unknown`。真实题录与全文地址都只存在于 Rust 当前运行内存，React 得到不透明定位；打开全文只导航现有机构 WebView，不触发下载、论文库写入、解析或 Provider。
- 搜索仍使用 task ID、epoch 与 sequence 隔离迟到回调；单次总时限和提取载荷上限保持不变。个人图书馆继续独立，但不作为 R4 论文检索 PASS 的阻塞条件。
- 用户曾在原生桌面确认机构认证、官网手工检索和非图书资源逐级页面访问可用，限定为`NATIVE CORE WEB FLOW PASS`。随后 active search 实机暴露 popup 重放与真实分面未确认，原生结构化结果为无效 0 条；因此该手工网页验收不能证明统一发现连接器或原生快照成立。当前架构仍没有题录导入事务、全文文件身份、不可变文档存储、解析管线或供 Agent 使用的页码级证据。

R3-R1 的真实认证链资产继续保留，但产品结论更正为`INSTITUTION AUTH PASS / CATALOG EXTRACTION FAIL / PRIMARY ROUTE MISALIGNED`；原“MetaERS 认证后必须自动交接 OPAC”由 R4 取代。原生论文发现闭环通过前不得开始 L1b。

## 最终产品目标架构（规划，不代表当前已实现）

Sidera 的最终架构以原生研究工作流为中心，而不是以 WebView 或供应商页面为中心。WebView、正式 API、链接解析器和本地文件只是连接器输入；一切可持续使用的研究资产都必须经过统一身份、来源治理、受控导入和文档版本层。

```text
Agent 首页 / 文献工作台
  → ResearchIntent（研究问题、查询、筛选和任务范围）
  → SearchOrchestrator
      ├─ LocalPaperConnector
      ├─ InstitutionDiscoveryConnector
      ├─ StandardMetadataConnector
      └─ VendorSpecificConnector
  → NormalizedCandidateSet
      → PaperIdentityResolver（DOI / providerId / canonical URL / title-author-year）
      → ProvenanceMerger（保留全部来源，不复制论文实体）
  → ImportReviewQueue
      → PaperEntity + SourceRecord
  → AcquisitionOrchestrator
      → AcquisitionRecord + ImmutableDocumentVersion
  → ExtractionPipeline
      → PageAnchoredSegment + ReferenceGraph + Figure/Table anchors
      → FTS/BM25 + E5 semantic index
  → ImmersiveReader / EvidenceWorkspace / ResearchAgent
      → Annotation / Note / EvidenceSet / Report / Hotspot / ReproducibleRun
```

### 产品表面与内部所有权

| 表面 | 数据所有权 | 页面/连接器角色 |
| --- | --- | --- |
| Agent 首页 | 研究意图、任务、对话和证据引用 | 发起并编排检索、导入、阅读和分析，不直接解析供应商 DOM |
| 文献工作台 | 临时候选、来源桶、合并身份和导入队列 | 原生展示规范化结果；供应商页面只承担登录、原始记录和特殊交互 |
| 全文阅读台 | 文档版本、页面锚点、阅读状态和批注 | 阅读本地受治理文档；外部全文页面不是正式阅读数据源 |
| 运行中心 | 任务状态、审批、检查点、失败与恢复 | 统一承载在线检索、导入、获取、解析和 Agent 长任务 |
| 证据/星图 | PaperEntity、热点、引用和研究成果的稳定身份 | 提供空间导航和证据关系，不复制正文或创建第二套论文身份 |

### 连接器分层

1. **统一发现层**：提供广覆盖候选召回和来源识别，允许结果不完整，但不得伪造字段。
2. **标准元数据层**：优先消费 DOI、RIS、BibTeX、OAI-PMH、Z39.50、OpenURL 或正式 API，减少 DOM 耦合。
3. **供应商专用层**：只为高价值来源实现版本化检索、题录、全文和失败适配器；页面结构变化返回 drift，不污染统一结果。
4. **原始页面层**：保留登录、题录核对、全文解析跳转和故障回退；它是基础设施，不是默认产品界面。

### 阶段数据边界

- L1a 只产生运行内存中的`NormalizedCandidateSet`和不透明跳转定位。
- L1b 首次引入`ImportReviewQueue / PaperIdentityResolver / SourceRecord`，但不把网页正文写入论文或全文索引。
- F1 引入`AcquisitionRecord / Document / DocumentVersion / ImmutableDocumentStore`，单篇全文必须先获得文档身份再进入后续处理。
- F2/F3 引入解析、页码锚点、索引、阅读状态和批注；原始文档仍不可变。
- F4/M2.1 才允许 Agent 把页码级证据作为研究工具；连接器原始页面文本不能绕过证据层直接成为可信回答。
- F5/M3 扩展多数据库连接器时复用同一候选、身份、导入和文档接口，不为每个供应商复制一套产品工作流。

## 规划中的全文与机构来源边界

状态：`L0 NATIVE PROBE PASS / L1a IMPLEMENTED / L1b+ PLANNED`。以下全文内容只冻结模块边界，不代表当前存在题录导入、文档数据库表、全文连接器或阅读器。

```text
用户上传 / 开放获取 / 浏览器合法下载 / 机构连接器
  → SourcePolicyGate（来源、授权、许可与能力检查）
  → AcquisitionRecord（URL、DOI、Provider、时间、访问方式、哈希）
  → ImmutableDocumentStore（原始文件与版本）
  → ExtractionPipeline（原生文本 / 页面 / 版面 / OCR / 图表）
  → PageAnchoredSegments
      ├─ FTS/BM25
      ├─ E5 语义索引
      ├─ ImmersiveReader
      └─ ReadingAssistant（最小必要片段）
```

架构原则：

- `PaperEntity` 与 `Document/DocumentVersion` 分离。一篇论文可关联多个文件版本；一个期刊卷期可以关联目录和多篇文章。
- 原始文件不可变，解析、OCR、缩略图、索引和 AI 结果均为可重建派生数据；用户批注独立保存。
- `PageAnchoredSegment` 必须携带文档版本、页码、章节、文本范围或页面坐标及提取置信度。
- `SourceConnector` 必须声明能力，不存在可以登录任意校园网站并抓取全文的万能连接器。
- 校园身份认证留在机构页面；凭据和 Cookie 不进入 Agent、文档库或日志。正式 API Token 才可进入 Windows Credential Manager。
- 阅读侧栏通过 `ReadingContextScope` 明确消费选段、当前页、章节、文档或关联文献集合；外部模型默认只获得检索后的最小片段。
- 所有下载结果先经过来源与文档治理，再进入阅读器和索引；连接器不能直接写论文正文或绕过入库审批。

## M1.3m-R3 科研星图空间 Chrome

产品科研星图的空间 UI 数据流收敛为：

```text
SideraTitleBar.toolsHost
  ← React Portal ← GalaxyToolbarPopover / scene actions

8px EdgeHotzone → 150ms arming → SideraNavigationDrawer

Galaxy selection callbacks
  → GalaxyContextRailState(one owner)
  → hotspot | paper-summary | paper-reading
  → viewportOffsetRatio(0 | 0.08)
```

常驻左侧筛选、左下图例和旧 `.galaxy-hud` 只允许经典/开发回归路径渲染。产品标题栏工具不拥有 Camera；它只能提交显式命令。详情轨道的热点、论文摘要与论文阅读共享一个判别联合状态，旧聚焦/面板回调只能派发状态转换，不能直接控制第二块 DOM 面板。

## M1.3n Agent 运行中心

```text
Sidera Agent “更多”
  → ActiveView = agent-runs
  → workbench-star-river（复用根级单渲染器所有权）
  → AgentRunCenter
       ├─ InboxProjection（等待动作 → 活动 → 最近失败）
       ├─ HistoryProjection（终态运行筛选）
       ├─ RunDetail（计划 / 过程 / 成果）
       └─ GovernanceDrawer（审批 / 用户问题 / 成果复核）
  → AgentDesktopClient
  → 既有 Tauri Agent Runtime / SQLite Agent 表
```

- `agent-runs` 是内部工作页视图，不进入一级导航；离开 Agent 时根壳保存原背景、相机与聚焦状态，返回时恢复。
- 待办与历史是现有 Run 数据的只读投影，不新增状态机或数据库表。治理操作继续通过现有命令完成，前端不直接修改运行状态。
- 手工创建器只构造 `research_report`；六类既有 `AgentRunKind` 仍用于历史呈现和审计兼容。专业失败运行只导航到对应工作页，不在运行中心复制专业执行流程。
- Token、费用、租约、库修订、快照和 Registry 哈希属于按需技术详情；Artifact 的内容哈希、证据和复核状态保持不可变语义。

## M2.0a Pi 基础会话链路

```text
SideraAgentStage
  → SideraPiConversationController
  → Tauri narrow commands
  → SideraPiRuntimeState (single process/session/active turn)
  → Node + Pi --mode rpc
  → strict LF JSONL parser
  → normalized sidera-pi-event stream
  → one streaming SideraAssistantMessage
```

- Rust 拥有子进程、stdin/stdout/stderr、请求序号、活动回合与停止边界；React 不接触原始 Pi 事件，也没有通用 RPC 命令入口。
- 每个应用会话使用隔离缓存目录和私有 `models.json`。真实 API Key 只通过子进程环境变量提供，配置文件仅包含环境变量引用；全局 `~/.pi/agent` 不可读写。
- 当前能力是纯文本多轮会话。全部 Pi 工具、扩展、技能、模板和上下文文件关闭；本地论文库、文件、Shell、网页、结构化引用和星图聚焦不进入该链路。
- Pi 会话只保存在内存中。离开 Agent 会中止正在生成的回合但不销毁进程上下文；进程崩溃后不自动重放请求，下次显式提交建立新会话。
- `SideraPiRuntimeState` 只接受受控窄命令。原始 RPC 响应和 `message_update` 不进入 React；Rust 将其规范化为带单调 `sequence/revision` 的 `session-ready / turn-start / assistant-delta / assistant-replace / turn-complete / turn-cancelled / runtime-error`。
- 子进程 stdout 只按 LF 分帧，CR 只允许作为行尾剥离；单条记录、提示词、累计回答与 stderr 诊断均有上限。Pi 崩溃或模型设置变化时销毁旧 epoch，旧事件不能写回当前消息，问题也不会自动重放。
- 正式 Sidera 对话控制器在根级维护本次应用运行的用户消息、单条流式回答和活动回合引用；背景模式切换不拥有对话会话。开发回答夹具只在显式视觉评审参数下启用，普通启动不再混入模拟回答。

## M2.0b Pi 本地论文轻量混合 RAG

```text
Pi tool call
  → session extension (exactly four Sidera tools)
  → extension_ui_request
  → Rust nonce / epoch / revision / toolCallId gate
  → read-only SideraRagRuntime
       ├─ existing LIKE search Top-20
       ├─ CPU E5 query + active-snapshot cosine Top-40
       ├─ deterministic weighted RRF Top-12
       ├─ read-only project library overview
       ├─ evidence read Top-6
       └─ verified citation closure
  → extension_ui_response
  → Pi synthesis
  → normalized turn-complete entityRefs
  → existing explicit focus UI
```

- Pi 内置工具全部关闭；会话专用扩展是唯一工具注册入口，且只暴露搜索、按 ID 读取、引用收口和无参数库概况。Rust 不提供通用 RPC、任意 SQL、文件、Shell、网页或项目选择接口。
- `SideraRagRuntime` 只以 SQLite read-only flags 打开当前项目数据库。活动快照、模型 ID、模型 revision、384 维和 `float16-le` 编码必须同时匹配；缺失或版本不匹配时在加载 E5 之前退回 LIKE。
- E5 查询使用 `query:` 前缀和 CPU runtime。语义扫描与工具执行进入 Tauri blocking task，不占用 UI 线程；Embedding runtime 在进程内懒加载复用，不修改数据库缓存。
- RRF 排序使用语义权重 `0.55`、关键词权重 `0.45`、`k=60`，论文 ID 作为最终稳定次序键。相同问题、快照和库修订产生相同结果。
- 每回合 `SideraRagTurnState` 保存工具预算、已搜索 ID、已读取 ID、retrieval mode 和通过核验的 refs。`finalize` 不能引用未读取或跨项目实体；旧 epoch、停止后的迟到工具结果不能恢复到新回合。
- 前端只接收标准化的工具阶段和最终引用，不接触原始工具参数、摘要正文或模型推理。引用仍走 M1.3j 的用户显式聚焦，不允许回答流式阶段自动操控背景。

M2.0b-R1 已将根级事实模型由独立用户数组和回答数组收敛为 `SideraConversationTurn[]`。Pi 增量、完成、停止和错误事件只按 `turnId`更新所属轮次；页面按用户记录、工具状态、回答、引用和聚焦顺序渲染。

工具白名单现为四项，无参数库概况从 Rust 注入项目的只读 SQLite 读取论文、学科、热点和活动快照规模。证据回合在工具开始时清除过程旁白；读取成功后，宿主在同一回合最多发送一次内部 steer，只有 `finalize_evidence`完成闭包后才发布正式正文。搜索有命中但未读取、读取后未收口或引用非法均进入 `invalid`，不生成可点击引用或聚焦入口。

回答正文经锁定版本的 `react-markdown`与`remark-gfm`渲染，原始 HTML、图片和危险协议被禁用。结构化引用不从 Markdown 推导，继续只信任 Rust 核验后的 `entityRefs`。

## M2.0b-R4 持久会话、审计工具与玻璃工作区

```text
AgentDualBackgroundPage
  ├─ fixed reading dialog
  ├─ left conversation drawer
  └─ one-shot tool approval card
        ↓ typed callbacks
App conversation controller
  ├─ 500ms UI-turn checkpoint
  ├─ abort-and-wait switch gate
  └─ normalized Pi event / stats stream
        ↓ Tauri narrow commands
SideraConversationStore                 SideraPiRuntimeState
  ├─ Sidera/conversations-v1.sqlite       ├─ --session-dir project-<hash>
  ├─ conversations / turns / state         ├─ --session-id conversation-id
  └─ Pi JSONL existence + cascade delete   ├─ native auto compaction / stats
                                            └─ audited extension bridge
                                                 ├─ local RAG (4)
                                                 ├─ read/list/search/HTTPS (4)
                                                 └─ write/edit/delete/Shell (4, approval)
```

- 会话元数据和完整 UI 轮次属于 `conversations-v1.sqlite`；Pi 原生上下文属于项目哈希目录内的 JSONL。论文库 `research-hotspots-v7.sqlite`及其 Schema 不参与会话迁移。`project_state`只记录最近打开会话，归档会清除当前指针，永久删除只接受归档会话并同时删除匹配的 Pi JSONL。
- React 不访问 SQLite、Pi RPC 或 JSONL。用户提交先写 UI 轮次，再启动/打开以 conversation ID 命名的 Pi 原生 session；流式增量以 500ms 合并保存，终态强制保存。启动时任何残留 `streaming`轮次转为`interrupted`，不会触发 Provider 请求。
- 会话切换以进程 epoch 作为隔离门：若有活动轮次，必须先得到用户确认、发送 abort 并等待终止事件；随后冲刷检查点、停止受控子进程并以目标 `--session-id`重新打开同一 JSONL。该重启式切换故意不向 React 暴露 `new_session / switch_session / get_messages`通用 RPC；Pi session manager 与自动压缩仍是上下文事实来源。
- 工具扩展仍只用 `extension_ui_request`作为传输层。Rust 对 nonce、epoch、revision、活动 `toolCallId`和工具名做联合校验；文件/网页/命令内容是不可信数据，不能修改权限或批准后续操作。一次性审批还绑定 session、message、tool、toolCallId 和参数哈希，消费后从 pending slot 移除。
- 目录、文本读取、文件名搜索和 HTTPS GET 可直接执行；写入、精确替换、删除和 PowerShell 一律审批。Shell 子进程 `env_clear()`后只恢复 Windows 运行、临时目录和代理所需变量；stdout/stderr 分流限量，最长 120 秒，轮次 abort 通过原子取消标记终止正在运行的已审批 Shell；HTTPS 最终 URL 仍须为 HTTPS。敏感字段统一脱敏，模型 API Key只存在于 Pi 主子进程的私有环境，不进入 Shell。
- 缓存策略 v2 默认使用 `long`，只在新/重开进程时注入 `PI_CACHE_RETENTION=long`；显式兼容模式 `auto`不覆盖 Pi 原生策略。`get_session_stats`映射 input/output/cacheRead/cacheWrite/cost/contextUsage；零缓存值只表示当前统计未检测到缓存用量。
- 对话框与抽屉不改变 WebGL 所有权。宽屏时抽屉和对话框通过互补 transform 形成几何居中的组合；小于 960px 时抽屉覆盖。Liquid Glass 完全由静态 CSS 材质实现，助手正文使用高不透明烟熏层；reduced motion/transparency、forced colors 和无 backdrop-filter 环境均有纯色降级。

## M2.0b-R4-R1 会话 Schema 恢复与 Agent readiness

```text
Settings "检测 Agent"
  ├─ Provider probe (existing request path)
  └─ sidera_agent_local_readiness (no Provider request)
       ├─ conversation store
       │    ├─ PRAGMA foreign_keys / WAL
       │    ├─ transaction: schema SQL + validation
       │    └─ user_version = 1
       └─ Pi runtime
            ├─ Pi 0.82.1 entrypoint
            ├─ Sidera extension protocol marker
            ├─ Node runtime
            └─ required local database/session paths
```

- 会话 v1 DDL 位于 `sidera_conversations_schema.sql`，Rust 通过 `include_str!`按原始换行执行；查询、更新和 UPSERT 使用原始多行字符串，禁止以 `\`续行吞掉 SQL 词间空格。
- 打开存储先设置外键、WAL 与同步模式，再检查 `user_version`和既有对象。兼容的 v0 部分库在同一事务内补齐表、索引与 `turns → conversations ON DELETE CASCADE`外键，验证成功后才写 `user_version=1`；既有会话行不会删除或迁移重写。
- 发现更高版本、缺列、列主键约束不符或同名对象结构不兼容时返回安全错误码，禁止破坏性自愈。React 显示简短持久错误，原始 SQLite 详情只存在于设置页可展开诊断区。
- `sidera_agent_local_readiness`是只读/幂等本地预检：会话存储返回 `pass / repaired / fail`与 Schema 版本，Pi 返回入口、扩展、Node 和必要路径状态。Provider 检测仍是独立现有链路，三项成功才形成“Agent 可以对话”的产品结论。
- 会话存储测试由独立 workspace harness 直接编译同一 Rust 源文件，不依赖 `tauri-runtime-wry`、`tauri-plugin-dialog`或 rfd。正式桌面默认仍启用 `desktop-dialog`；测试目标因此既能真实执行 SQLite 用例，也不会导入 `TaskDialogIndirect`。

## M2.0b-R4-R2 后台轮次所有权与清透光学工作区

```text
App conversation controller
  ├─ active Pi turn + 500ms checkpoints
  ├─ activeView changes: presentation only
  ├─ explicit stop / project / config / conversation gates
  └─ Agent activity resolver
       └─ SideraTitleBar tools host
            ├─ generating → return + stop
            ├─ awaiting approval → return only
            ├─ complete → 3s terminal state
            └─ failed → persistent error surface
```

- `AgentDualBackgroundPage`在普通页面下仍由根组件挂载，Pi 事件监听、活动 turn ref、SQLite UI轮次和检查点不依赖 Agent 可见性。`activeView`只选择前景工作页与背景 presentation，不再拥有 abort 权限。
- 等待工具审批时 Pi 活动状态优先于普通生成状态。标题栏只提供返回入口，批准与拒绝仍由原审批卡及 `approvalId`一次性绑定完成；因此全局状态不会扩大权限面。
- 项目切换、项目创建/删除、影响 Provider/模型/缓存/论文库路径的设置保存和当前会话生命周期操作复用 abort-and-wait 门。终止事件到达前不得切换上下文，也不得自动重放请求。
- 光学变量提升到全局设计令牌供标题栏状态和 Agent 工作区共享。外壳使用 18px静态 backdrop blur、115%饱和度和约 34%深色填充；历史区是单一 58%烟熏阅读平面，回答项透明。边缘强调由窄线性内反射与短顶部高光构成，不使用大面积左上径向光。
- 主 Tauri lib 设置 `test=false`，标准会话存储测试只通过 workspace harness 运行。旧 `target`中的 lib-test EXE不是运行时或测试入口，不自动删除；harness 不链接 Tauri/rfd且生成物不得导入 TaskDialog符号。

## M2.0b-R4-R3 缓存策略迁移与事件驱动流式门

```text
IndexedDB project settings
  → cache policy resolver v2
       ├─ legacy auto / long / missing → long + v2 marker
       └─ v2 auto / long → preserve explicit selection

Pi message_update
  → pure stream gate
       ├─ direct text_delta → assistant-delta immediately
       ├─ toolcall_start → hidden + assistant-replace("")
       ├─ system tool end → release final text
       └─ RAG overview / no-result / finalize → release verified text
```

- 启动迁移遍历全部项目设置。未带 v2 标记的旧值只迁移一次；带 v2 标记的显式 `auto`不会在后续启动或新版备份恢复时再次改写。新项目、缺失值和旧格式备份统一解析为 `long`。
- 流式门是独立于 Tauri 的纯 Rust 状态机。普通回答从首个文本增量开始可见；工具调用开始只改变显示状态，并以 `assistant-replace`精确撤回此前尚未核验的前言。该事件沿用 session、message、revision、sequence 隔离并触发立即检查点。
- `toolcall_start`不参与授权。真正执行仍必须通过 `tool_execution_start`的工具白名单、nonce、epoch、revision、`toolCallId`和审批参数哈希校验；显示门不能扩大工具权限。
- 普通回答停止时保留已显示文本，隐藏态旁白不会在终态补发。证据核验失败以替换事件写入固定失败说明；论文数据库、会话 SQLite、Pi JSONL与现有审批协议均不改变。

## 冷启动视觉来源与版本契约（开发 012-R3，已实现）

开发 012-R3 将论文库 revision、V20 分析状态和动态背景可视数据拆成三层契约：论文库 revision 是当前题录事实；active V20 只表示当前分析；动态沉浸背景可以消费显式标记的历史视觉来源，但不能据此声称热点分析已经更新。对当前实际选择库 `src-tauri/target/v022-desktop-acceptance-2/library/research-hotspots-v7.sqlite` 的只读核验为 Schema v14、25,473 篇论文、library revision 1、`v20_analysis_state` 0 行；4 个 `ready` 历史快照均为 revision 0，最新结构完整快照含 25,463 篇论文、160 个热点和 25,463 条 membership。

```text
library revision + active state + ready snapshots（read-only）
  → visual-source selector
       ├─ active exists + current + complete
       │    → active-v20 / freshness=current
       ├─ active absent + latest ready complete
       │    → historical-v20 / freshness=stale
       └─ active stale/ahead/corrupt OR no valid source
            → failed terminal
  → immersive payload（source kind + current/source revisions + freshness）
  → Canvas mount
  → real first dynamic frame
  → ready
```

- P2b 正式提交继续只更新论文库和 library revision，并使 active state 失效；它不得为了桌面启动而自动运行热点分析。需要真正重建 V20 时，必须由另一个明确、可观察、可取消且低负载的分析阶段负责。
- active state 明确存在即代表应用声明有当前分析候选，因此必须严格验证 revision 和结构。stale active 不得静默退回历史快照；来源 revision 高于当前库、结构损坏或引用不完整也必须失败。
- 只有 active state 缺失这一种状态允许显式选择最新结构完整的 `ready historical-v20`。该来源只为沉浸背景提供真实身份、热点归属和可视抽样，载荷中的版本元数据必须一路保留到前端诊断；历史来源绝不能改写为 current。
- `v20_hotspots.paper_count` 表示热点记录的证据论文数，多个候选组归并到同一保留热点后，它不等于该热点的最终 membership 行数。视觉来源的“结构完整”使用快照元数据与实际 paper/hotspot/membership 总行数、membership 对热点/论文的引用完整性判断；不得把逐热点证据计数误作 membership 基数。
- 理论背景仍要求 current active V20，因为它展示真实理论 XYZ 与分析语义。冷启动偏好理论但当前分析不可用时，背景协调器只能选择真实动态沉浸背景；静态图不能成为正常启动回退。
- 载荷调用必须有明确期限，Canvas 挂载必须有独立看门狗。两者只把生命周期推进到一次性的 `failed` 终态并提供可诊断错误，不触发无限重试、不运行热点分析、不自动选择静态背景。
- `ready` 的唯一来源仍是 Canvas 成功提交第一个无 WebGL 错误的真实动态帧。载荷读取完成、历史来源可用、Canvas 已创建或超时计时器到期都不等于启动成功。
- 当前架构状态为 `IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE STARTUP PASS / USER VISUAL ACCEPTANCE UNVERIFIED`。真实 Tauri 已在当前 r1 / 25,473、active 为空且视觉来源为历史 r0 / 25,463 的库状态下连续冷启动 3 次；每次均由单一 GPGPU WebGL Canvas 的真实动态首帧结束启动页，900ms 帧变化约 2.97%–3.09%，正常和最大化窗口均通过。验证未写论文库、未重建热点。
- 原生证明来自 tasklist Console session、Tauri visible API 和实际 Tauri WebView 截图/帧对比。Computer Use helper 的 `0x80070003` 只表示该辅助工具 `UNAVAILABLE`，不改变产品原生结论。当前仅保留一个响应中的 Sidera PID 41708；用户视觉验收继续独立为 `UNVERIFIED`。证据：[sidera-012-r3-cold-start-dynamic-snapshot-2026-08-06.json](./evidence/sidera-012-r3-cold-start-dynamic-snapshot-2026-08-06.json)。

## Sidera 桌面壳与冷启动门（开发 012-R2 基线，012-R3 收口）

M1.3k 使用同一主 WebView 完成启动展示与应用运行，不创建第二个 Splash 窗口：

```text
BootDataGate
  → AgentDualBackgroundPage mount（宏任务释放上一渲染器）
  → immersive/theory renderer initialize
  → synchronous first renderer.render()
  → first error-free dynamic frame onFirstFrame/onReady
  → SideraSplash fade-out
  → normal Agent session
```

- `SideraSplash` 只覆盖冷启动，最短展示 1000ms；项目、设置、数据库和根级数据初始化必须真实完成。`mounting-agent` 没有自动成功期限：只有所选动态背景完成初始化并成功提交首个无 WebGL 错误的真实帧，根级启动门才能进入 `ready`。计时器不得切换静态背景或伪造启动成功。
- `SideraTitleBar` 是唯一桌面窗口控制层。M1.3m 起 Agent、启动页、普通工作页和空间页面均使用透明材质；标题栏高度不参与画布或工作台布局，右上角控件通过安全区避让。
- Tauri identifier、数据库路径与存储键不随 `productName=Sidera` 改名。窗口默认最大化、非独占全屏，关闭系统 decorations 后只开放拖动、最小化、切换最大化、关闭和状态读取权限。
- `AgentDualBackgroundPage` 通过稳定的 `onInitialReady/onInitialError` 回调向启动门报告一次性背景结果。沉浸背景在初始化尾部同步执行首帧；理论背景通过独立 `onFirstFrame` 在实际 `renderer.render()` 与 WebGL 错误清查后报告首帧。后续 RAF 只推进动画，深度、密度、标签和可见性诊断只属于运行时质量门，均不再拥有启动完成权。
- 初始化或首帧失败必须进入明确错误状态；首次成功后的运行时异常不得把根级启动状态倒退。纯黑静态深空只保留为用户主动选择的诊断入口，不能由超时自动触发，也不能作为动态启动 `PASS` 的证据。回调引用稳定是生命周期不变量，根组件状态变化不得触发背景重新挂载。
- 012-R2 首帧生命周期基线保持 `IMPLEMENTED / AUTOMATED TECHNICAL PASS`，但它没有覆盖正式入库后 active state 缺失的视觉来源契约。012-R3 已在此前正式导入推进到 r1 且 active 为空的真实库上满足连续 3 次冷启动、revision 变化后复验、正常窗口和最大化窗口门，记录为 `NATIVE STARTUP PASS`；用户视觉验收仍为 `UNVERIFIED`。

## 文献工作台轻量读取、请求所有权与背景帧预算（开发 013，已实现）

开发 013 把“数据库已准备”“普通只读查询”“工作台页面所有权”和“动态背景运行预算”拆成四层。完整迁移、`quick_check`、外键/V20 引用契约、Schema 确保与过期 Agent 任务恢复只属于准备层；普通状态、分页和分面不再每次直接调用重量级 `open_library_database`。真实库基线完整校验中位 490.7ms，其中 `quick_check`、外键和 V20 孤儿检查合计约 99.37%，因此该拆分针对的是已测量的主阻塞而非 CSS 模糊猜测。

```text
database path
  → explicit prepare_library_database（startup / initialize / restore）
       → one serialized full prepare + fingerprint + mark prepared
  → ordinary read command
       ├─ not prepared / fingerprint stale → stable error, no full-prepare fallback
       └─ fingerprint current
            → open read-only + query_only + schema-v14 connection
                 ├─ paper_library_status
                 ├─ query_paper_library
                 └─ paper_library_facets
                      → one read transaction(revision + three facets)
                      → cache(database path, project, library revision)

App bootstrap(status + revision + facets + first page)
  → SearchWorkspace matching identity
       ├─ initial mount → consume bootstrap, 0 business read IPC
       ├─ page/filter/refresh → one shared in-flight page query
       └─ explicit paper selection → two shared in-flight detail reads

root dynamic renderer
  ├─ startup → synchronous first real WebGL render → onReady
  ├─ Agent presentation → unbudgeted RAF processing
  └─ workbench presentation → 24 FPS processing budget on the same renderer
```

- `LibraryReadPreparationRegistry` 按规范化数据库路径持有准备锁、准备状态和文件指纹。启动、初始化与恢复流程显式调用 `prepare_library_database` 完成串行 full prepare 并登记指纹；普通读命令只检查现有登记，未准备或指纹变化返回稳定错误，绝不在读取路径内隐式运行迁移、恢复、Schema 确保或 Agent 任务恢复。准备有效时只打开 `SQLITE_OPEN_READ_ONLY | SQLITE_OPEN_NO_MUTEX` 连接，启用 `query_only`、外键与 2 秒 busy timeout，并读取 `user_version` 以拒绝 stale contract。
- `PaperLibraryFacetCache` 的键为规范化 database path + project ID + library revision；revision 与 source/field/year 三组 facet 在同一个只读事务中取得，避免缓存键与结果跨修订撕裂。同键计算由条目锁合并，较旧 revision 条目清理，所有已知论文库写路径按数据库主动失效。翻页与显式刷新只调用 `query_paper_library`，不携带分面重算。
- React 父层在启动时形成 `PaperLibraryBootstrapSnapshot`，其 identity 与数据库路径、项目和 library revision 绑定；`SearchWorkspace` 只在 identity 完全匹配且输入为默认首屏时复用。StrictMode 仍保留，但状态、页面和详情的同键 Promise 在进行中共享；响应序号门继续拒绝迟到结果，不能把“丢弃旧响应”误当成取消 Rust 工作。
- 工作台进入时不默认选择第一篇论文，因此 `PaperDocumentPanel` 不拥有首屏关键路径。用户显式选择后才并发读取文档快照和下载列表；两条 IPC 完成后详情稳定。该延迟加载不改变 F1a 的 PaperEntity、AcquisitionRecord、DocumentVersion 或来源治理契约。
- `AgentImmersiveStarfieldCanvas` 接受可热切换的可选 `renderBudgetFps`。`AgentDualBackgroundPage` 仅在 `workbench` presentation 传入 24，Agent 不限；预算保存在 ref 中，不进入 renderer 创建 effect 的依赖，因此切页或热切换不重建 WebGL renderer。未到间隔时 RAF 只预约下一回调；下一次实际处理以距上次处理帧的墙钟 delta 推进模拟，visibility 恢复先重置时间锚，避免隐藏期 delta 爆发。
- 24 FPS 只约束工作台停留期的实际处理/渲染频率，不降低 DPR、6,000 篇论文代理或最多 2,000 个尘埃粒子，也不静态化背景。初始化末尾的同步真实 `renderer.render()` 不受预算影响，012-R3 的首帧启动契约、历史 V20 显式来源与失败终态保持原样。
- 显式 prepare 二次窄修前的中间原生证据曾记录进入工作台 114.2ms 显示 20 条且业务读取 IPC 为 0，明确选文后 60.1ms 稳定且恰好 2 IPC；最大化/正常窗口约 121.2/120 draws/s，两帧哈希不同。该证据 `finalForDevelopment013=false`，不能证明二次窄修后的最终原生门。最终 GUI 启动 escalation 因 Codex usage limit 被系统拒绝且不得绕过，属于验证授权不可用而非产品失败；2026-08-07 快照状态为 `NATIVE PERFORMANCE UNVERIFIED / USER PERFORMANCE ACCEPTANCE UNVERIFIED`。2026-08-08 用户在正常/最大化窗口并明确选文后反馈“正常”，有界主观门更新为 `USER PERFORMANCE ACCEPTANCE PASS (BOUNDED)`，但最终定量原生 trace 仍为 `NATIVE PERFORMANCE UNVERIFIED`。
- 本轮未改变查询排序语义或 Schema。无筛选 `ORDER BY COALESCE(year, 0), updated_at` 仍使用临时 B-tree，显式刷新 `queryMs` 约 268–269ms；索引或排序优化必须另行授权并先在当前库精确副本上验证。真实库内容哈希、论文数和 revision 不变，main database content mutations 为 0；只读连接会更新 0-byte WAL 与 32KB SHM 的 SQLite bookkeeping 时间戳，因此不能宣称文件系统完全未触碰。

## 稳定页证据、持久批注与显式混合索引（开发 016，已实现、索引原生门通过）

开发 016 在 015 的不可变 DocumentVersion / 主 WebView 私有 Range 阅读边界之上增加三条互相隔离的数据流：

```text
immutable DocumentVersion SHA + page
  ├─ document-derived-v1.sqlite user_version=4
  │    ├─ page text / spans / current canonical geometry
  │    └─ index_jobs -> segments / FTS5 / float16 E5 embeddings
  ├─ document-evidence-v1.sqlite（非重建型）
  │    ├─ annotations
  │    ├─ saved_evidence
  │    └─ page source preference
  └─ DocumentReaderShell
       ├─ one PDF.js Canvas + transparent selectable TextLayer
       ├─ selection-only action bar
       └─ default-closed pure-black Evidence SideSheet
```

`SideraDocumentPageText` 只按文档身份与页码从派生库读取受限文本、UTF-16 span 范围和归一化矩形；UI 不接收 blob 路径。`SideraDocumentEvidenceAnchor` 绑定 version SHA、1-based page、`native|ocr` source、UTF-16 range、quote/hash、prefix/suffix 与归一化 rects，但 anchor ID 不包含 parse run ID。保存时证据库同时保留公开精确锚和当时 canonical geometry baseline；当前页仍精确相同时返回 `exact`，布局变化时只能在引文、上下文、UTF-16 边界与有界几何投影共同成立时返回 `reanchored`，多义、超出候选上限或几何不可靠分别返回 `ambiguous` / `missing`，不得静默移动或删除。annotation create/update 具有不同稳定语义；update 不得改变原 anchor 或 createdAt。

派生 Schema v4 的索引表全部以 `job_id` 隔离。start 只创建/恢复 job，分段与 embedding 由后台 worker 执行，活跃 worker 同版本排他；替换 job 先取消并等待旧 worker，DB 的 run/job/version fence 拒绝迟到晋升。片段不跨页、最多 800 UTF-16、重叠 120，并携带精确页证据锚；embedding 为 multilingual-e5-small 384 维 float16，专用加载入口固定 CPU、2 个 intra-op 线程、batch 16、DirectML 关闭。索引可暂停、恢复和取消；重启时 queued/running 重挂 worker，paused 只恢复显示而不自动继续。promotion 在同一短事务中发布新 ready、supersede 旧 ready 并有界清理终态 artifact；最新 ready parse 是搜索唯一可用索引身份。

搜索公开模式为 `auto|lexical|hybrid`。lexical 与索引未就绪路径不加载 E5；需要 query embedding 时 Rust 先返回稳定内部要求，再由桌面层加载本地模型。`auto` 在本地模型缺失或推理失败时明确降级 lexical；显式 hybrid 不伪装成功。混合排序使用 lexical 0.45、semantic 0.55、k=60 的加权 RRF，tie-break 固定为 pageIndex / segmentId；返回 resolvedMode、fallbackReason、原始 lexical/semantic score 和精确 anchor。既有 `sidera_document_search` 无 mode 的 JSON 仍保持旧词法结果，新命令/别名提供 page text、annotation/evidence CRUD、index start/current/snapshot/pause/resume/cancel/search。

阅读器仍以 52px 单行工具栏和 PDF 正文为主；全文搜索为图标，“证据”是唯一新增文字入口，文档与版本并入 SideSheet 折叠区。SideSheet 覆盖而不压缩 PDF，窄屏转 bottom sheet；索引进度只在运行中心显示一个独立紧凑行，不进入 Agent run 状态机。当前状态为 `IMPLEMENTED / AUTOMATED TECHNICAL PASS / WINDOWS STANDALONE TEST HOST PASS / NATIVE EVIDENCE UX PASS / ROTATED TEXTLAYER FIX NATIVE RETEST PASS / NATIVE INDEX PASS / USER EXPERIENCE PASS`。四页隔离 fixture 已证明非旋转页 100%/125% 精确选择、证据库独立持久化、派生重建后 3/3 `missing → exact`、真实本地 E5 双向跨语言召回、正常/最大化内容优先、overlay SideSheet 与 reader active renderer=0；两条 12,811 片段任务又证明了索引暂停/恢复/取消、重启重挂与迟到结果隔离。同一 300 页 run 的连续关闭、重开、停止与迟到隔离已通过。旋转页 125% 的旧命中层左移已证明 90°/270° 未旋转 TextLayer 盒必须交换 viewport 宽高；窄修现已通过轻量自动门、最新原生候选可见拖选和用户最终手感确认。开发 017 的 OCR、ReadingContextScope 和 Agent document-anchor 进入实现阶段。

## 按需 OCR、来源并存与逐轮页码证据 Agent（开发 017，R1/R2 已实现）

`document-derived-v1.sqlite` 当前为 `user_version=5`。v4→v5 只新增 OCR job/page/span/active-result；原生解析不被覆盖，OCR 重跑通过页面 active result 原子切换并把现有全文索引标为 stale。Full 的固定 PP-OCRv5 mobile det/rec 仅在用户明确选择当前页或最多 8 个建议页时执行；主 WebView 的单次上传 token 在 30 秒内消费，PNG 只驻留内存。后端全局单页、CPU 两线程、无 DirectML、90 秒上限，取消和 supersede 以 job identity 隔离迟到结果。Lite 不含 OCR 资源，运行时不联网下载。

现有 Pi/RAG 每个问答 turn 可携带一个 `SideraReadingContextScope`，只允许 `selected-anchor / current-page / document-retrieval`。Rust 由当前项目、论文和 DocumentVersion 的已绑定身份解析目标，工具 schema 不接受路径或任意文档 ID；search 产生候选，read 最多消费 8 段/32KiB，finalize 最多接受 6 个实际读取过的引用。文档片段被标记为不可信数据，不能改变系统指令；`document-anchor` 保存论文、版本、页码和稳定 anchor，但不进入星图聚焦。Pi 会话与历史优先使用 `libraryStatus.databaseDir` 解析出的实际活动论文库，避免隔离阅读器和会话层出现目录分叉。覆盖式 Agent 面板打开时暂时隐藏证据 SideSheet，但保留其逻辑开关；关闭后恢复侧栏、页码、缩放、滚动、选择与批注，PDF 布局始终不压缩。

R1 当前为 `IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE OCR PASS / USER OCR ACCEPTANCE PASS`；R2 当前为 `IMPLEMENTED / AUTOMATED TECHNICAL PASS / REAL PROVIDER EVIDENCE PASS / NATIVE AGENT UX PASS / USER EXPERIENCE PASS`。隔离扫描 fixture 已证明唯一真实 Provider 调用只使用第 2 页 OCR 证据，生成可验证引用并从第 3 页准确回到第 2 页；三种作用域、显式 `FTS + E5 · 5 个片段` 及正常/最大化覆盖式布局全部通过，五项用户检查也已全部通过。这两个状态仍明确区分离线实现/测试、真实 Provider、原生引用回跳与最终用户确认。证据：[开发 017 分门架构验证](./evidence/sidera-017-ocr-evidence-agent-2026-08-25.json)。

OCR 选择几何必须以 active OCR span 的规范化矩形为权威，不能直接把浏览器 TextLayer 的 DOM range 矩形当作可视范围。检测阶段的水平扩张也不能随整句宽度增长：长行以 `box_width * 0.25` 扩张会把左边界推至 `x=0`；当前固定为按 `box_height * 0.75` 扩张。阅读器保留透明可交互 TextLayer 负责命中和 UTF-16 range，但把 OCR `::selection` 设为透明，再依据选择范围与 span 覆盖比例绘制只读选择层。这样单行、跨行与缩放后的蓝色几何都来自同一规范化坐标源，同时不改变 native 文本路径。

Windows 测试宿主按 D-170 分成两个不可互换的证据层：原 desktop lib harness 的 `TaskDialogIndirect / TEST-HOST UNAVAILABLE` 作为历史保留；独立 `sidera-windows-test-host-smoke` 不初始化 Tauri，静态含 Common Controls v6 manifest 和目标 import，并只运行一次得到 exit 0/无窗口。独立宿主 PASS 只证明 headless 文档/Pi 协议与 Windows 清单链，不反向证明旧 lib harness 可运行。

开发 014 当前聚合状态同步为 `IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE AUTH PARTIAL PASS / NATIVE SEARCH TRUTH PARTIAL PASS / NATIVE UX PARTIAL PASS / USER EXPERIENCE PARTIAL PASS`；认证完成不等于远端结果目标、全供应商覆盖或完整桌面体验已通过。

## 不可变文档、派生索引与主 WebView 原生阅读（开发 015，已实现、原生阅读门通过）

开发 015 把 F1a 的不可变文档身份、可重建派生数据和阅读呈现拆成三层。原始 DocumentVersion 仍由 `documents-v1.sqlite` 与 SHA-256 blob 治理；PDF 文本、页/段、UTF-16 锚点、FTS 与阅读位置写入独立 `document-derived-v1.sqlite`；主 WebView 只通过短时不透明 token 读取版本字节，UI 永远不接收真实路径。当前状态为 `IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE READER PASS (CODEX VISIBLE DESKTOP) / USER EXPERIENCE UNVERIFIED`。

```text
DocumentVersion(versionId, immutable blob, sha256)
  → open reader(versionId)
       → issue opaque main-WebView token
       → sidera-document://localhost/version/{token}
            ├─ OPTIONS → 204
            ├─ HEAD → metadata only
            └─ GET / single Range → 200 / 206 / stable range error
       → local PDF.js 5.4.149 + local worker
            ├─ preflight: <= 50 MB and <= 300 pages
            ├─ single renderer → page canvases
            └─ text extraction
                 → document-derived-v1.sqlite (user_version=2)
                      ├─ parse run / page / span
                      ├─ UTF-16 anchor
                      ├─ FTS row
                      └─ reader state

reader active
  ├─ PDF content >= 70% of work area
  ├─ compact page / zoom / search toolbar
  ├─ search and details side sheets on demand
  └─ root starfield canvas = 0
```

- `documents-v1.sqlite` 继续是原始文档身份和文件哈希权威。解析失败、派生 Schema 升级、全文搜索或阅读位置写入都不得修改原始 blob；派生库可按 DocumentVersion 重建。产品文件名保持 `Sidera/document-derived-v1.sqlite`，当前 Schema 为 `user_version=2`；v1→v2 迁移只显式回填 UTF-16 长度，避免 JavaScript/PDF.js 文本索引与 SQLite 字符计数漂移。
- `sidera-document` 协议只在主 WebView 注册并消费版本 token。token 映射由 Rust 校验目标 DocumentVersion、文件 identity 与大小；响应支持 GET/HEAD/OPTIONS 及单 Range，设置稳定 MIME、Content-Length、Accept-Ranges 与 Content-Range。路径、任意 URL、多 Range 与越界请求均拒绝。原生已证明 bytes 0-7 为 206 与 `%PDF-1.3`，HEAD 200、OPTIONS 204；416 仍只由 core 自动测试证明，不写成原生通过。
- PDF renderer 单例所有页面 Canvas 和文本层；不允许 iframe fallback 与第二 renderer。首次解析在 50MB/300 页门之后进入可取消派生任务，ready 结果按 DocumentVersion 与解析版本复用。搜索命中由 UTF-16 anchor 跳转页内，阅读状态以版本、页、缩放写入派生库，离开/重开恢复。
- 重开阅读器时若 manifest 仍指向 queued/running parse，主 WebView 从 manifest 恢复 active parse snapshot，并继续既有有界轮询；不得创建第二 parse run。滚动所有权只属于外层 `document-reader-viewport`，shell 固定为 `overflow:hidden`，页面自身的 hidden 只用于裁切而不是建立嵌套滚动面。
- 文档协议的普通错误响应同样设置 `Access-Control-Allow-Origin: *`、GET/HEAD/OPTIONS、Range 与公开响应头，使主 WebView 能读取稳定协议错误码而不是被 CORS 遮蔽。跨包的 research-search `request_tasks` 使用最多 32 项的 LRU；活动请求不能被淘汰，避免长期运行累计无界幂等历史。
- 可见 Tauri fixture `Simple_AI_20260430_111347.pdf` 为 74,996 bytes、2 页、version `version-b433cace57bf4bd5bbe5e5a1`、SHA-256 `cdac21fe62ac20328e983a930c80dad66b0eb9b19f99abfa96977fe5d5074f9c`。约 0.75s ready，2 canvases；中文“人工智能”命中第 1/2 页，页码、110/120% 缩放、重开恢复、1360×860 与 1707×1019 均通过。跳页不滚动应用 shell，reader active 不挂载星河。
- 最新 reader audit 105/105、P2a-R2 84/84 与 Vite 1,928 modules 已通过。2026-08-09 补跑中，core LRU 定向测试 1/1 `PASS`；首次桌面 `cargo test` 被无关 integration target `sidera_pi_runtime_protocol` 缺失 `sidera_rag` / `sidera_stream_gate` 阻断。随后定向到 desktop lib 的 `sidera_document_protocol::tests` 已完成编译，但 Windows test host 在断言前以 `0xC0000139 / STATUS_ENTRYPOINT_NOT_FOUND`（`TaskDialogIndirect`）终止，所以协议断言是 `TEST-HOST UNAVAILABLE`，不是产品、协议或断言 `FAIL`，也不是协议测试 `PASS`。
- 最新 `cargo check --manifest-path src-tauri/Cargo.toml -j 2` 为 `PASS`，仅有 13 条既有 `dead_code` warning；此前正式 `cargo build -j 2` 仍只作为先前包证据。自动门继续为 reader 105/105、derived core 14/14、document store 9/9、Vite 1,928 modules、本地 worker bundle 与相关回归 `PASS`；测试宿主不可用不等于产品失败。OCR、E5、批注、AI 阅读与用户体验仍不在 R1 完成声明内。证据：[sidera-015-document-reader-r1-2026-08-09.json](./evidence/sidera-015-document-reader-r1-2026-08-09.json)。

## 任务绑定发现认证、活跃预算与检索位置真值（开发 014-R4，认证通过、检索真值部分通过）

开发 014-R4 不增加供应商连接器，而是加固现有发现事务的身份、计时和结果真值。`discovery-fulltext` 认证属于正在运行的研究搜索，不再由页面另起会话；认证等待从活跃搜索期限排除，恢复与取消仍使用同一 taskId/searchId。候选位置明确记录可观察性，搜索真值区分“达到本地目标”和“远端是否还有结果”。2026-08-27 最新状态为 `IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE DISCOVERY AUTH PASS / NATIVE SEARCH TRUTH PARTIAL PASS / NATIVE UX PASS_BOUNDED`：探针兼容官网当前三参数 `jumpDatabases` 绑定后，正式 SSO 在唯一最新 Tauri 实例中完成；中文目标 40 实得 10 条、扫描 2 页、覆盖 3 个供应商并来源耗尽，英文目标 100 实得 3 条、扫描 20 页、覆盖 4 个供应商并达到页面预算，远端继续性保持未知。英文停止保留旧 3 条与 1 条选择，5 秒无迟到恢复；正常/最大化、网页隐藏、主窗点击及无孤儿窗口通过。未达到 40/100、没有真实跨页选择且未覆盖完整 position-basis 矩阵，因此不声明完整 search-truth PASS。

```text
research_search(taskId, searchId)
  → active-search budget starts (90 s)
  → discovery connector reports auth-required
       → pause active budget
       → InstitutionAuthCoordinator.begin(discovery-fulltext, same search)
            ├─ ready → resume same task/search/snapshot
            ├─ cancel → cancel same search
            └─ stale transaction → ignored
  → page observation / compatibility extraction
       → retrievalPosition.basis
            ├─ observed: supplier DOM/page/rank was seen
            └─ synthesized: compatibility order only
  → ResearchSearchTruth
       ├─ targetReached (local 40/100 target)
       ├─ hasMore: true | false | null
       ├─ limitReached (compatibility mirror only)
       └─ totalHits remains nullable
```

- 认证窗口、任务恢复与停止操作共享当前 research run 的 token；不允许认证成功后从 React 再次调用 search start。只有活跃抓取/解析时间消耗 90 秒预算，等待用户认证不消耗；恢复后以原 searchId 继续，取消终止等待与搜索。
- `retrievalPosition.basis=observed|synthesized` 与 connector/page/rank/position/facet 一起进入只读候选 provenance。去重记录继承最早首次位置；兼容合成位置不得伪装成供应商排序证据。
- `targetReached` 只说明过滤、规范化、去重后达到 40/100 目标；`hasMore` 只有官方页面或分页事实能证明时才为 true/false，否则为 null。`limitReached` 保留旧客户端兼容但镜像 targetReached，不能推导 totalHits、来源耗尽或完整覆盖。
- 首屏继续保持查询、连接摘要、真值摘要、结果顺序；活动来源、传输与导航轨迹按需折叠。自动门 R4 45/45、research core 24/24、正式 `cargo check/build -j 2` 通过。原生复用会话时官方页要求认证，用户未输入凭据并取消，故 discovery auth、真实搜索真值与完整 UX 均为 `UNVERIFIED`。
- P1 继续为 `PARTIAL / ADAPTER DEFERRED`；WOS、CNKI、Scopus 没有正式连接器，仍属于 P6。证据：[sidera-014-r4-auth-search-truth-2026-08-09.json](./evidence/sidera-014-r4-auth-search-truth-2026-08-09.json)。

## 多分面公平分页与远端继续性真值（开发 014-R5，有界原生通过）

R4 的顺序分面 fallback 共用单一递减页预算，第一个分面可以消耗全部预算；预算耗尽又直接生成 `page-limit / hasMore=null`，所以“英文 3 条却扫描 20 页”并不等于远端真实翻过 20 页。R5 不改变 IPC、候选 JSON 或连接器身份，只修正调度与终态证明。当前状态为 `IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE PAGINATION TRUTH PASS_BOUNDED / NATIVE SEARCH TRUTH PARTIAL PASS / NATIVE UX PASS_BOUNDED`：

```text
remaining global page budget
  → fair_sequential_page_budget(remaining pages, remaining facets)
       ├─ reserve at least one page for every remaining facet
       └─ current facet receives only its fair share
  → execute facet with facet-local observed page numbering
  → if local budget is exhausted
       └─ inspect_academic_next_page() read-only
            ├─ next page observed → page-limit / hasMore=null
            └─ no next page observed → source-exhausted / hasMore=false
```

- 全局预算约束整个搜索，作用域预算只约束当前分面；二者不得混写。页码 provenance 使用当前分面已观察页面数，不把跨分面循环次数合成为远端页码。
- `inspect_academic_next_page` 只读取既有结果 DOM 的下一页能力，不点击、不导航、不改变 WebView generation；只有明确不存在下一页时才能证明 `hasMore=false`。
- core 26/26、R5 audit 8/8、R4 52、P2a-R1 99、P2a-R2 84、机构工作台 117/117、TypeScript/Vite 与 Rust 2-job 门均通过。
- 2026-08-28 隔离单实例英文矩阵从 R4 的“3 条 / 20 页 / `page-limit`”纠正为“3 条 / 2 页 / `source-exhausted`”，并保持 `targetReached=false / totalHits=null`。这证明分页终态纠正，但不证明 100 条目标、会议结果、跨页选择或完整 position-basis；聚合状态因此仍为 `NATIVE SEARCH TRUTH PARTIAL PASS`。证据：[R5 分页与继续性真值](./evidence/sidera-014-r5-pagination-truth-2026-08-28.json)。

## 机构连接协调、检索真相与紧凑工作台（开发 014，已实现、自动技术通过）

开发 014 把机构资源页重新划分为“连接权威”“结构化检索”“人工浏览表面”和“本地结果交互”四层。浏览器可承载真实 SSO 页面、人工数据库访问、原始记录核对与故障诊断，但不再通过“网页已打开”或“弹窗已关闭”推导登录成功；结构化候选必须由后端连接器及真相负载提供，页面卡片与前端排序不得扩大其来源、覆盖或总命中语义。

```text
compact institution workspace
  ├─ primary search(query + record kinds + year range + target 40/100)
  ├─ one-line connection strip
  ├─ connection-and-sources drawer(default closed)
  │    ├─ database-access
  │    ├─ discovery-fulltext
  │    ├─ library-account
  │    ├─ manual sources(WOS/CNKI/Scopus: no connector)
  │    └─ browser show/hide + diagnostics
  └─ native results
       ├─ backend truth + provider breakdown
       ├─ ten records per local page
       ├─ cross-page selection
       └─ local display sort(no new IPC)

begin_institution_connection(goal)
  → InstitutionAuthCoordinator.begin(goal, generation, transactionId)
       ├─ same goal active → focus existing window
       ├─ different goal active → busy
       └─ new transaction → opening → awaiting-user
  → user requests close
       → verifying(current connection window, bounded attempts)
       → refreshing-parent(reload bound parent, bounded attempts)
       ├─ goal-specific proof → ready
       ├─ explicit cancellation → cancelled
       └─ no proof/error → failed
  → late callback/close
       → stale generation or terminal phase → ignored

research_search(request)
  → connector route selected by backend capability, never frontend connector id
  → receive pages
  → filter(record kind/year) → normalize → deduplicate
  → apply result target(40 or 100)
  → return candidates + ResearchSearchTruth
```

- `InstitutionAuthCoordinator` 是进程内唯一活动连接事务的权威。事务身份包含目标、transaction ID 与 generation；相同目标重入只聚焦既有窗口，另一个目标不能并发抢占。`ready` 是稳定终态，晚到窗口关闭不能降级；失败或取消保留此前已证明的目标就绪状态。主窗口恢复只能由当前事务领取一次，避免多回调竞争窗口所有权。
- 三个连接目标不合并身份语义：数据库访问证明数据库 SSO，发现全文证明统一发现的机构全文身份，个人图书馆证明个人账户身份。兼容命令也必须委托给同一协调器，不能恢复旧的“先 ensure session、再 ensure browser”并行链。连接公开负载不携带 query、fragment、ticket、Cookie、密码等秘密。
- 连接窗口关闭事件先阻止销毁并转入 `verifying`，所有检查共享一个 4 秒 deadline。`library-account` 为首次交易保留预算：只检查当前可见页一次，仍无证明时就在该同一可见 WebView/environment 中导航固定 `WHU_LIBRARY_HOME_URL` 并直接轮询；不改用隐藏共享页，也不 reload 另一 environment。`database-access` 与 `discovery-fulltext` 继续执行三次当前页检查，再 reload 隐藏绑定父页。Ready/Failed立即终止；LoginRequired必须有稳定明确页面证据，Unknown只会取消并保留旧 ready，不能伪造成功。个人图书馆官网 popup 继续由绑定 transaction/generation 的 `NewWindowResponse::Create + window_features` 受管子 WebView 承接，保留 POST/opener；旧 token、generation、terminal 或 legacy callback 均不能提交认证真值。公开 trace 仅含 transaction、阶段、表面、白名单 reason 与耗时，页面 query/fragment、ticket、Cookie、账号、密码和表单值不进入状态。
- `ResearchSearchTruth` 与候选同包返回：`resultLimit`、`limitReached`、`pagesScanned`、`recordsReceived`、`recordsAccepted`、`duplicatesMerged`、可选 `totalHits`、`coverage`、`completionReason`、`orderBasis=source-return-order`、`providerBreakdown` 及逐条 `retrievalPosition(connectorId/rank/page/position/facet)`。过滤、规范化和去重必须先于 40/100 条上限；没有供应商总量证据时 `totalHits` 必须为空，不能使用当前候选数代替。
- 前端的每页 10 条、来源返回/最新/最早/标题排序与跨页选择只作用于已取回候选，不产生新的 Tauri invoke。前端不接收连接器选择权；WOS、CNKI、Scopus 当前仅为人工访问入口，尚无连接器，属于 P6。P1 保持 `PARTIAL / ADAPTER DEFERRED`，现有自动结构化路线仍是实验性机构发现能力，不能宣称全馆或多数据库覆盖。
- 页面首屏只保留主检索和一行连接摘要；低频连接目标、来源入口、浏览器控制与诊断放入默认关闭抽屉。旧 hero、常驻按钮工具条和大块就绪说明从机构工作台产品路径隐藏，结果不再被连接基础设施推到首屏以下。浏览器继续支持 split/immersive 生命周期，但只作为被调用的表面，不拥有研究流程。
- 最新首次交易窄修自动门：机构工作台 117/117、正式 `cargo check -j 2`、desktop lib test binary `--no-run`、增量 `cargo build -j 2` 均为 `PASS`，独立复审 P0/P1/P2=0。附加 `cargo check --tests` 因既有 `tests/sidera_pi_runtime_protocol.rs` path-module 对 integration test crate 的模块引用漂移而 `FAIL`；它不是本修复引入，不改变正式 cargo check 的 PASS，也不能被省略成“全 tests PASS”。此前 desktop lib 执行宿主 `0xc0000139 / TEST-HOST UNAVAILABLE` 继续作为旧验证历史保留。
- Windows 入口继续统一使用 `windows_subsystem = "windows"`。原生时间线不可折叠：修复前首轮网页登录完成但关闭为 Cancelled，记 `FIRST-TRANSACTION HISTORICAL FAIL`；第二次已有会话 Ready 只记 `SECOND-ENTRY PASS_BOUNDED`；同 visible WebView landing direct-poll 修复后的 PID 62020 清会话首轮登录 Ready，用户手动关闭认证窗后主窗可点击、无异常窗，记 `NATIVE LIBRARY AUTH FIRST-TRANSACTION RETEST PASS / USER INPUT+AUTH EXPERIENCE PASS_BOUNDED`。
- immutable + `query_only` 最终复核确认真实库 SHA-256 `B546C505F6FAD89C9D4C6429DBBA8FACC7838D5F66CC9367E24A2824EFDCA8FA`、214,532,096 bytes、v14、25,473、r1、active V20 rows 0、ready snapshots 4；main/WAL(0B)/SHM(32768B) 的大小与 mtime 前后不变。开发 014 当前聚合仍为 `IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE AUTH PARTIAL PASS / NATIVE SEARCH TRUTH UNVERIFIED / NATIVE UX UNVERIFIED / USER EXPERIENCE PARTIAL PASS`：`database-access` 有界 PASS、`library-account` 当前首次交易复验 PASS、`discovery-fulltext` UNVERIFIED。搜索真相与完整 UX 仍须分门验收。

## 纯黑浮层、理论可用性真值与题录只读通知（开发 014-R3，已实现、自动技术通过）

开发 014-R3 不创建新数据模型或迁移，而是把此前容易混淆的运行面收敛为明确真值：SideSheet 视觉表面只消费局部 token；理论模式只由 current active V20 可用性推进；题录状态/历史只由 prepared 主库账本读取；Windows owned window 不得禁用主窗口，原生 WebView 逻辑可见性只能在物理 hide/show 成功后提交。当前状态为 `IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE APPEARANCE PASS (BOUNDED) / NATIVE INPUT OWNERSHIP HISTORICAL FAIL / INPUT FIX IMPLEMENTED / INPUT FIX NATIVE RETEST PASS / NATIVE LIBRARY AUTH FIRST-TRANSACTION RETEST PASS / NATIVE IMPORT READ PASS / USER INPUT+AUTH EXPERIENCE PASS_BOUNDED`。

```text
connection-and-sources SideSheet
  → --workbench-side-sheet-surface: #000
       ├─ panel / header / close / capability group
       └─ transparent body + existing overlay / border / motion

owned authentication window / shared institution WebView
  → owner_raw keeps ownership and focus association
  → production set_enabled(false): forbidden
  → main restore: idempotent SetEnabled(TRUE)
  → browser visibility request carries monotonic clientRequestId
       ├─ hide physically succeeds → commit logical hidden state
       ├─ stale show after newer hide → reject / safety-hide
       └─ show: bounds phase → visibility phase → hide rollback on failure

user requests theory or semantic position
  → TheoryAvailabilityState: checking
  → get_v20_galaxy_payload(prepared READ_ONLY + query_only)
       ├─ ready
       │    → commit theory preference / focus
       │    → one renderer handoff
       ├─ current active V20 missing
       │    → not-ready panel
       │    → retain immersive Canvas / elapsed / checkpoint / preference
       └─ IPC or timeout
            → failed: theory payload read failure

mounted immersive payload
  → More menu / visual-source group (0 IPC)
       └─ historical-v20 r0 / current library r1 / non-current analysis

prepared paper library
  → import_commit_status/history
       → READ_ONLY + query_only + v14/import-ledger validation
       → paper_import_commits is authoritative
       → optional review store READ_ONLY only
       → no migration / DDL / mutation permit / receipt repair
       → import-review notice scope
            ├─ background read error: dismiss after 8s
            ├─ success / leave / X: clear immediately
            └─ commit or rollback blocker: sticky
```

- SideSheet 的唯一表面 token 是局部 `--workbench-side-sheet-surface: #000`。Panel、Header、关闭按钮与能力分组使用该 token，Body 透明；全局 `--color-panel`、其他工作台、状态色、focus、hover、16% 遮罩、桌面/窄屏几何和退出动画均不被改写。
- `TheoryAvailabilityState` 只表达 `idle / checking / not-ready / failed`。用户点击“理论”或“查看语义位置”时先检查一次载荷；只有 ready 才改变模式、本地偏好和 focus。`not-ready` 是“理论数据待更新”，不是 WebGL 失败：当前沉浸 Canvas、动画时间、checkpoint 与 `immersive` 偏好保持，继续沉浸为 0 IPC/0 重建，分析流水线动作只导航。真正 Canvas/WebGL 故障仍由 renderer 错误与重试通路拥有。
- `get_v20_galaxy_payload` 使用既有 `LibraryReadPreparationRegistry` 打开的 prepared 只读连接，启用 `query_only`，不会在交互前隐式执行 full prepare。冷启动恢复理论偏好但 current active V20 不可用时，012-R3 仍以历史视觉源驱动的真实动态沉浸首帧结束启动；它与用户运行期理论预检共享数据真值，但不共享错误表面。
- 历史来源显示来自已挂载的 `mountedImmersivePayload`，不是菜单打开时重新读取。左上角常驻节点退出产品画布；“…”菜单约 260px 的视觉来源分组显示 source/current revision、论文数、freshness 与“非当前热点分析”，展开为 0 IPC。
- status/history Tauri 接口保持兼容，但主库连接复用 prepared registry 并严格 `READ_ONLY + query_only`，只检查 v14 与 import ledger。读取禁止 `migrate_library_file`、Schema ensure、DDL、Immediate transaction、mutation permit 和审查回执修复。review store 的只读打开不创建目录、不切 WAL、不建表；ledger 存在而 receipt 缺失仍返回主库事实，两端都不存在返回稳定 `SIDERA_IMPORT_COMMIT_STATUS_NOT_FOUND`。显式提交/回滚仍可执行既有可写对账。
- desktop `invoke` 边界把 Tauri 字符串或对象拒绝统一转成 `Error` 并保留稳定错误码。`AppNoticeScope=import-review` 与 `dismissAfterMs` 管理后台读取通知；状态与历史分别存储、分别诊断，成功重读、离开审查页或 X 关闭对应通知。数据库路径、project、revision 与 generation 共同隔离 A-B-A 迟到读取，不能污染 Agent 或星图页面。
- 自动门覆盖理论状态 10/10、题录通知 16/16、014-R2 视觉 92/92、012-R3 动态启动 15/15、工作台/桌面壳/P2a/P2b/F1a、Vite 与正式 `cargo check -j 2`；最新机构专项为 117/117，lib test binary `--no-run` 与 cargo build PASS，独立复审 P0/P1/P2=0。附加 `cargo check --tests` 的既有 `sidera_pi_runtime_protocol` integration 引用漂移单独为 FAIL，不能升级成全 tests PASS。
- 先前 GUI exe PID 61844 以无可见 CMD 的单实例运行，复用经 HTTP 200 确认的当前项目 Vite 5174。最大化与正常窗口截图仍证明纯黑 SideSheet；理论预检保持同一动态沉浸 Canvas、显示 not-ready 而非黑屏，流水线动作只导航；More 从已挂载载荷展示 r0/r1 真值且左上来源节点已移除，故保留 `NATIVE APPEARANCE PASS (BOUNDED)`。静态截图和 UIA 焦点没有捕获冻结瞬间的 HWND enabled/owner，也没有直接证明机构 WebView 物理输入层级，原聚合 `NATIVE VISUAL PASS` 已撤回。题录正常读取与隔离 fault fixture 的 batch/status/history 稳定错误码均通过；history toast 在 59ms 出现、+4003ms 仍在、+8304ms 消失，X 后 100ms 消失，离开页面 150ms 清除，正常重读 50.8ms 恢复且无 toast，聚合升级为 `NATIVE IMPORT READ PASS`。提交/回滚阻断错误常驻未单独注入，作为独立 `UNVERIFIED` 边界保留。
- 历史原生观察“鼠标可移动但 Sidera 无法点击，强制结束后恢复”继续记为 `NATIVE INPUT OWNERSHIP HISTORICAL FAIL`。没有 Application Hang、崩溃或 GPU reset，冻结瞬间未采集 HWND，故精确根因仍 `UNVERIFIED`。两个 P0 候选分别是主窗口禁用恢复时序与机构 WebView 物理/逻辑可见性竞态。
- 输入修复保持 `owner_raw`，生产 `set_enabled(false)` 为 0；主窗口恢复幂等，机构浏览器使用 `clientRequestId`、物理提交、两阶段 show 回滚和三次有限 hide。正常/最大化、WebView hide 与认证关闭后的用户点击均通过；2026-08-09 16:40:32+08 最终快照中 PID 62020 主 HWND `0x33049E` visible/enabled/uncloaked，owner0/rootOwner self，非 main 可见顶层窗0，auth WRY `0x1F10988`/renderer PID46180隐藏，唯一可见交互 WebView 为 main，无孤儿拦截层。因此当前为 `INPUT FIX NATIVE RETEST PASS`，但不删除历史 FAIL。
- 最新清会话首轮个人图书馆认证 Ready，用户手动关闭后可点击且无异常窗，故 `NATIVE LIBRARY AUTH FIRST-TRANSACTION RETEST PASS / USER INPUT+AUTH EXPERIENCE PASS_BOUNDED`。最终 immutable/query_only 核验确认 SHA、214,532,096 bytes、v14/25,473/r1/active0/ready4 不变，main/WAL/SHM 大小与 mtime 前后不变。题录故障通知、discovery-fulltext、native search truth 与完整机构 UX 仍 UNVERIFIED。

## 兼容边界

- 展示星图和理论星图继续使用现有实现。
- UMAP-A/B/C 继续隔离。
- 旧“默认启动页在 M1 人工选择前不改变”的边界已由 M1.3k 的用户决策取代；普通桌面冷启动进入 Sidera Agent，视觉评审参数仍可覆盖入口。
- M1.3c 无数据库迁移和发布资源变更；新增的 Tauri 实体解析命令为内部只读命令，不改变 Agent 后端协议或默认首页。
- 开发 015 已实现单篇不可变 PDF 的原生阅读 R1；开发 016 已实现稳定页证据、独立持久批注/保存证据与显式 FTS/E5 混合索引，但原生停止门仍待验。OCR、ReadingContextScope、Agent `document-anchor` 引用和正式多库校园连接器仍为后续规划，不改变论文库 Schema、现有 Agent 状态机或凭据存储。P1 继续为 `PARTIAL / ADAPTER DEFERRED`。
