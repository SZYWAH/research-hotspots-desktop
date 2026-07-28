# 科研 Agent 架构

状态：权威架构入口

更新时间：2026-07-28

## 现有基础

Agent 背景载荷由当前理论星图快照只读派生。载荷保存快照身份、热点、确定性抽样论文、理论相对坐标和版本元数据，但不复制完整 25K/100K 论文集合。

当前 `AgentGalaxyBackgroundCanvas` 已提供独立 Three.js 生命周期、批量几何体、质量降级和性能指标。现有三候选通过固定 XYZ、相机摆动、整组旋转/缩放和时间亮度调制产生运动，不作为新架构的运动基础。

M1.2a 新增独立的 `AgentGalaxyFlowCanvas`。它复用只读背景载荷，但不复用旧 Canvas 的空间变换或 Shader；开发入口为 `visual-review=agent-flow`，默认 `<App />`、旧 `agent-background` 和轨道对照入口保持独立。

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
  → DynamicFocusLayer
  → FlowModel 目标位置与切线
  → CameraFlowController
```

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

## 参数实验室

M1.2a 开发评审入口继续与默认应用隔离，提供引力、剪切、扭曲、时间倍率、中央缓流强度、质量级别、固定/轻微协同漂移相机和固定时间参数。

固定随机种子和固定时间用于确定性截图；正常时间轴用于视频与性能验收。

主要验收使用固定相机，避免将相机运动误判为流场运动。轻微协同漂移仅作为补充，位移小于 `0.6` 世界单位、周期不短于 60 秒，不允许环绕或整景旋转。页面隐藏时暂停 RAF 且恢复后不补算离屏时间；减少动态时冻结在确定性时间相位。

开发评审模式支持只在固定时间截图时启用 `preserveDrawingBuffer`，并直接从 WebGL drawing buffer 导出 3840×2160 PNG；正常运行和视频模式不保留绘制缓冲。100% 星体裁切通过相机 `viewOffset` 重新渲染目标区域，不进行后期放大，避免浏览器界面缩放污染清晰度证据。PNG 保存端点仅在 Vite 开发服务器内启用，限制本机来源、文件名、PNG 文件头和文件大小，不属于生产 API。

## 兼容边界

- 展示星图和理论星图继续使用现有实现。
- UMAP-A/B/C 继续隔离。
- 默认启动页在 M1 人工选择前不改变。
- M1.2a 无数据库迁移、无生产 Tauri 聚焦命令、无发布资源变更。
