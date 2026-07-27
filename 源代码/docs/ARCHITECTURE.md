# 科研 Agent 架构

状态：权威架构入口

更新时间：2026-07-27

## 现有基础

Agent 背景载荷由当前理论星图快照只读派生。载荷保存快照身份、热点、确定性抽样论文、理论相对坐标和版本元数据，但不复制完整 25K/100K 论文集合。

当前 `AgentGalaxyBackgroundCanvas` 已提供独立 Three.js 生命周期、批量几何体、质量降级和性能指标。现有三候选通过固定 XYZ、相机摆动、整组旋转/缩放和时间亮度调制产生运动，不作为新架构的运动基础。

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

- 开发阶段支持曲线流与潮汐/Curl 流两个技术验证适配器。
- 不将技术适配器命名或承诺为产品候选。
- CPU 采样用于相机、焦点、诊断和测试。
- GPU 采样用于批量粒子位置。
- CPU 与 GPU 共享相同参数和数学定义。
- 循环和重生只能发生在屏幕外。

### 渲染层

- 语义星中央亮核使用全分辨率通道，不读取时间透明度。
- 热点光晕、暗微尘和装饰场可以使用低分辨率通道。
- 语义星不参与景深、运动模糊或低分辨率放大。
- 自动降级优先削减微尘、环境星和光晕。

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

开发评审入口继续与默认应用隔离，提供 FlowModel、流速、相机协同、潮汐、涡流、粒子预算、色彩、中央低速度区、Agent 状态和焦点 ID 参数。

固定随机种子和固定时间用于确定性截图；正常时间轴用于视频与性能验收。

## 兼容边界

- 展示星图和理论星图继续使用现有实现。
- UMAP-A/B/C 继续隔离。
- 默认启动页在 M1 人工选择前不改变。
- 本准备阶段无数据库迁移、无生产 Tauri 聚焦命令、无发布资源变更。
