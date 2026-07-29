# 科研 Agent 架构

状态：权威架构入口

更新时间：2026-07-29

## 现有基础

Agent 背景载荷由当前理论星图快照只读派生。载荷保存快照身份、热点、确定性抽样论文、理论相对坐标和版本元数据，但不复制完整 25K/100K 论文集合。

当前 `AgentGalaxyBackgroundCanvas` 已提供独立 Three.js 生命周期、批量几何体、质量降级和性能指标。现有三候选通过固定 XYZ、相机摆动、整组旋转/缩放和时间亮度调制产生运动，不作为新架构的运动基础。

M1.2a 新增独立的 `AgentGalaxyFlowCanvas`。它复用只读背景载荷，但不复用旧 Canvas 的空间变换或 Shader；开发入口为 `visual-review=agent-flow`，默认 `<App />`、旧 `agent-background` 和轨道对照入口保持独立。

M1.3c 原计划将 Agent 星空拆分为两种产品视图，但沉浸实现仍消费 `AgentGalaxyBackgroundPayloadV1.position/offset`，最终只是“理论坐标 + 沉浸外壳”，已经判定为结构性失败。该路径只保留为技术预览。

M1.3d 重新建立两种互不继承空间结构的产品背景：

- `immersive`：面向对话和沉浸体验，使用会话随机空间与连续 Curl 流；只消费真实身份、热点归属、颜色和年份，不消费理论 XYZ。
- `theory`：面向语义位置、热点归属和可解释关系，继续使用现有理论星图坐标。

两种视图共享实体身份和快照身份，但不共享世界坐标解释器。M1.3d 完成两套静置背景和显式切换，但产品视觉未通过；M1.3e 在不改变该空间边界的前提下修订沉浸流动与 Agent 理论恒星材质。

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

## 兼容边界

- 展示星图和理论星图继续使用现有实现。
- UMAP-A/B/C 继续隔离。
- 默认启动页在 M1 人工选择前不改变。
- M1.3c 无数据库迁移和发布资源变更；新增的 Tauri 实体解析命令为内部只读命令，不改变 Agent 后端协议或默认首页。
