# 科研 Agent 架构

## 2026-09-07 主窗口退出顺序窄修

main 的 CloseRequested 先 prevent_close，再调用 AppHandle::exit(0)，由正常应用退出路径统一结束生命周期。依据本地 Tauri runtime，exit 请求通过事件队列派发，不能任由默认 owner 销毁先于该请求处理。新增 SIDERA_EXIT_TRACE=1 可选 stderr 固定阶段码；不记录 URL、页面或认证数据，不增加强退超时。补丁已在空闲、机构能力就绪、认证子窗打开三种状态完成原生退出，均观察到四段事件码并释放机构 WebView profile 子进程；旧 PID 的精确阻塞栈仍未知，不反推为已证实死锁。机构恢复公开接口及固定 profile 不变。

证据：[本轮分门记录](./evidence/sidera-beta3-exit-delivery-2026-09-07.json)。

状态：权威架构入口

更新时间：2026-08-03

## 现有基础

Agent 背景载荷由当前理论星图快照只读派生。载荷保存快照身份、热点、确定性抽样论文、理论相对坐标和版本元数据，但不复制完整 25K/100K 论文集合。

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
SQLite / active V20 snapshot
  ├─ load_agent_immersive_background
  │    → AgentImmersiveBackgroundPayloadV2（无坐标）
  │    → SessionSeed + SeededSpatialAssignment
  │    → CurlFlow
  │    → AgentImmersiveStarfieldCanvas
  └─ existing V20 visual payload
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
- `load_agent_immersive_background`：只读抽样最多 6,000 篇真实论文并返回全部热点身份，不返回任何空间坐标。

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

## 规划中的全文与机构来源边界

状态：`PLANNED / NOT IMPLEMENTED`。以下内容只冻结模块边界，不代表当前存在数据库表、Tauri 命令、连接器或阅读器。

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

## Sidera 桌面壳与冷启动门

M1.3k 使用同一主 WebView 完成启动展示与应用运行，不创建第二个 Splash 窗口：

```text
BootDataGate
  → AgentDualBackgroundPage mount
  → immersive/theory renderer onReady
  → SideraSplash fade-out
  → normal Agent session
```

- `SideraSplash` 只覆盖冷启动，最短展示 1000ms；它等待真实数据与背景就绪，不以固定延时冒充加载完成。
- `SideraTitleBar` 是唯一桌面窗口控制层。M1.3m 起 Agent、启动页、普通工作页和空间页面均使用透明材质；标题栏高度不参与画布或工作台布局，右上角控件通过安全区避让。
- Tauri identifier、数据库路径与存储键不随 `productName=Sidera` 改名。窗口默认最大化、非独占全屏，关闭系统 decorations 后只开放拖动、最小化、切换最大化、关闭和状态读取权限。
- `AgentDualBackgroundPage` 通过稳定的 `onInitialReady/onInitialError` 回调向启动门报告一次性背景结果；失败时可在不创建 WebGL 渲染器的情况下进入纯黑静态深空退路。回调引用稳定是生命周期不变量，根组件状态变化不得触发背景重新挂载。

## 兼容边界

- 展示星图和理论星图继续使用现有实现。
- UMAP-A/B/C 继续隔离。
- 旧“默认启动页在 M1 人工选择前不改变”的边界已由 M1.3k 的用户决策取代；普通桌面冷启动进入 Sidera Agent，视觉评审参数仍可覆盖入口。
- M1.3c 无数据库迁移和发布资源变更；新增的 Tauri 实体解析命令为内部只读命令，不改变 Agent 后端协议或默认首页。
- 全文阅读与校园图书馆连接器当前仅为规划，不改变现有 SQLite Schema、Agent 协议、凭据存储或默认导航。
