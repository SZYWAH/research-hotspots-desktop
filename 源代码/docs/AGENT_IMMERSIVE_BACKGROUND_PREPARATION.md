# Agent 沉浸版背景保留式改造准备

状态：准备完成，第一段程序开发已开始

更新时间：2026-07-28

## 设计判断

这是面向科研工作者的沉浸式 Agent 主界面保留式改造。它使用纯黑、克制、空间叙事型语言，保留外部原型的中央对话框、左右语义抽取构图和三种状态表达，不把它改造成常见霓虹星空或技术屏保。

- `DESIGN_VARIANCE=8`
- `MOTION_INTENSITY=7`
- `VISUAL_DENSITY=5`
- 改造类型：`redesign-preserve`
- 实施原则：用户可见构图只做小幅调整，随机演示逻辑替换为正式确定性数据通路

## 冻结参考

外部原型：

- 路径：`D:\wenjian\Desktop\agent背景.html`
- 大小：25,143 字节
- SHA-256：`951A5FA1C156A4720BA6E501356C5100FC8CC6B23C5BB7B3F2EB679E39BB3D78`
- 定位：沉浸视图的视觉语言参考，不是生产代码

准备阶段不复制、不修改该文件。完整仓库和设备证据见 [准备基线](./evidence/agent-immersive-background-preparation-2026-07-28.json)。

## 双背景产品边界

### 沉浸视图

用途：

- 默认 Agent 对话氛围。
- 根据 Agent 当前回答抽取论文、热点和证据上下文。
- 允许对论文位置进行确定性的展示空间编排。
- 强调流动、状态反馈和空间叙事，不声称使用严格理论 XYZ。

### 理论视图

用途：

- 查看论文的理论位置、热点归属和语义邻近关系。
- 保持现有理论星图坐标、真实相机飞行和可解释布局。
- 用户明确选择“查看语义位置”时进入，不在普通对话中自动切换。

### 共享数据

两种视图必须共享：

- `paperId` 和 `hotspotId`。
- `AgentGalaxyFocusIntent`。
- `ResolvedAgentGalaxyEntity`。
- 当前回答使用的证据集合。
- 快照和论文库身份。

两种视图不共享世界坐标解释器。沉浸视图使用展示空间，理论视图使用理论空间。

## 原型保留项

以下内容作为第一轮实现的视觉基线：

1. 纯黑全屏背景。
2. 居中、紧凑、半透明的 Agent 对话框。
3. `Idle / Thinking / Focus` 三种可感知空间状态。
4. 焦点论文与上下文出现在对话框一侧，证据面板出现在另一侧。
5. 论文星、热点星和焦点星拥有不同但克制的光学层级。
6. 星空持续存在，不在聚焦时清空成单一目标。
7. 低饱和冷色只作为辅助语义，不承担主要层级。

第一轮不得主动改变中央构图、面板方位关系、对话框尺寸等级或纯黑背景。

## 小幅视觉调整

### 星体

- 语义星继续使用现有全分辨率锐利亮核。
- 普通论文保持紧致，不使用宽软雾、景深或运动模糊。
- 热点只比论文稍厚、稍大，不形成压倒性的发光核心。
- 远处星体只能更小、更暗，不能更模糊。
- 环境微尘与论文星分层，不能伪装成真实论文。

### 颜色

- 原型中的紫色和蓝色提示降为低饱和语义色。
- 背景、环境星和微尘以纯黑、银白、冷灰为主。
- 聚焦论文不突然换色，只连续提高所属热点色相的表面能量。
- 不使用霓虹渐变、强紫色 HUD 或大面积彩色光晕。

### 聚焦

- 背景整体能量最多降低约 35%-55%，不能压暗到只剩目标。
- 目标能量建议提高约 1.5-2.5 倍，不沿用原型中的 18 倍。
- 取消十字尖刺、准星、圆环和突然闪白。
- 上下文区域采用减速、弯曲和有限侧向抽取，不向固定点塌缩。
- 目标、上下文和面板按同一事件连续显现，目标始终可以从原位置追踪。

### 面板

- 保留星体与证据面板分处对话框两侧的构图。
- `Focused Node` 等开发式标签替换为真实论文或证据语义。
- 不展示伪造相关度、伪造引用数或随机论文标题。
- 面板只在存在真实解析结果时出现。

## 必须替换的演示逻辑

| 原型逻辑 | 正式逻辑 |
| --- | --- |
| `Math.random()` 生成位置 | `AgentGalaxyBackgroundPayloadV1` 和稳定实体分配 |
| 随机选择焦点论文 | `AgentGalaxyFocusIntent` |
| 欧氏半径 20 选上下文 | `ContextSetResolver` 返回的证据、引用或热点成员 |
| 将上下文向固定点压缩 | 有限侧向抽取和局部共速形变 |
| 全局压暗 85% | 有上限的分层能量交接 |
| 焦点能量 18 倍 | 克制的连续材质增强 |
| 时间噪声控制星体亮度 | 星核亮度稳定，时间只驱动位置和状态包络 |
| Simplex 标量复制成向量 | 现有确定性引力织场或正式向量流场 |
| CDN Tailwind 和 Three r128 | 项目已有 React、CSS 和 Three.js 0.185.1 |
| 单文件全局生命周期 | 独立 React 评审入口和严格清理的 Three.js 生命周期 |

## 目标架构

```text
AgentGalaxyBackgroundPayloadV1
  -> StableParticleIdentity
  -> ImmersiveDisplayComposer
  -> GravitationalWeaveFlow
  -> ContextSetResolver
  -> ContextExtractionController
  ├─ SharpPaperLayer
  ├─ StableHotspotLayer
  ├─ EnvironmentLayer
  └─ EvidencePanelAnchor
  -> AgentMotionStateController
  -> ImmersiveCameraController
```

理论视图继续走现有理论星图通路，不经过 `ImmersiveDisplayComposer`。

### ContextSetResolver

第一轮冻结以下接口语义：

```ts
type AgentGalaxyContextSet = {
  target: ResolvedAgentGalaxyEntity;
  contextEntityIds: string[];
  relation:
    | "answer-evidence"
    | "citation-neighborhood"
    | "hotspot-membership"
    | "visual-review-fixture";
  sourceSnapshotId?: string;
};
```

规则：

- 正式产品优先使用当前回答的真实证据集合。
- 没有引用边时才退回热点成员关系。
- `visual-review-fixture` 只允许出现在开发评审入口。
- 禁止用屏幕距离或随机半径伪装成论文关系。

## 第一轮实现切片

第一段开发交付一个隔离的沉浸视图入口：

```text
?visual-review=agent-immersive
&state=idle|thinking|focus
&focusPaper=<paper-id>
&quality=balanced|high
&hud=0|1
```

第一轮包含：

1. 新增独立 `AgentGalaxyImmersiveCanvas`、`AgentGalaxyImmersiveWorkspace` 和 `AgentGalaxyImmersiveReview`。
2. 复用现有背景载荷、引力织场、稳定顶点身份和实体聚焦契约。
3. 复刻原型中央对话框与左右构图，不接入默认首页。
4. 接入常驻论文焦点和确定性开发上下文。
5. 实现 `idle / thinking / focus` 三态的连续转换。
6. 保留现有 `agent-flow` 入口作为技术对照，不覆盖 M1.3a/M1.3b-1 工作。

当前实现状态：

- 独立入口、真实载荷、中央对话框、左右面板和三态控制已完成。
- 常驻论文焦点使用真实 `paperId` 和既有同顶点通路。
- 开发上下文使用可验证的同热点成员关系，不再随机选择。
- 上下文星群的有限侧向抽取和 `thinking` 空间响应仍是下一段开发内容。
- TypeScript 与 Vite 构建通过；浏览器视觉仍待实际体验。

第一轮不包含：

- 默认首页替换。
- Tauri 正式实体解析命令。
- 快照内未抽样论文和活动库新论文。
- 热点聚焦和多目标联动。
- 理论视图切换动画。
- 新数据库表、迁移、UMAP 或星图修改。

## 视觉验收门槛

### 保留度

- 1440×900 下对话框保持视觉居中，宽度等级接近原型的 448px。
- 焦点上下文与证据面板继续分处对话框两侧。
- 用户第一眼仍能识别为外部原型的同一设计语言。
- 不增加新的大面积 UI、导航、装饰文字或彩色灯效。

### 连续性

- 目标论文从原位置连续进入焦点，不复制、不重生、不跳转。
- 上下文星不排队、不向一点塌缩、不穿越对话框。
- 焦点释放后准确回归持续流场。
- `idle / thinking / focus` 状态切换不重建渲染器和几何体。

### 语义真实性

- 聚焦目标来自真实 `paperId`。
- 上下文关系有明确来源，开发夹具必须显式标记。
- 信息面板不得显示随机标题或伪造指标。
- 沉浸视图明确标记为展示空间，不宣称理论 XYZ。

### 清晰度与设备保护

- 语义星保持全分辨率亮核，无景深、运动模糊和低分辨率放大。
- 先进行构建、类型检查和静态审计。
- 浏览器只从 720p balanced 短时测试开始。
- 当前设备再次出现卡顿、显卡重置或图形栈异常时立即停止 GUI/GPU 测试。

## 停止条件

准备阶段完成不等于视觉通过。只有隔离评审入口在真实浏览器中同时满足以下条件，才允许规划默认 Agent 首页：

- 原型设计语言保留成立。
- 星体清晰、上下文抽取连续。
- 真实论文和证据关系可追溯。
- 设备在低负载验收中稳定。
- 用户明确接受沉浸视图。
