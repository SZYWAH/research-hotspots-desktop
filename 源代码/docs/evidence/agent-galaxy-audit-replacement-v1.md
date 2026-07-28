# Agent 星河审计替换清单

状态：M1.2a 首轮替换已接入

更新时间：2026-07-28

## 继续保留

- 背景载荷抽样确定性、ID 完整性、相对坐标、快照身份、文件大小和重复哈希。
- 独立 Three.js 渲染器，不复用完整分析星图页面。
- 批量 `BufferGeometry` / `THREE.Points`。
- 页面隐藏暂停、减少动态、WebGL 回退和固定时间。
- 自动质量降级只降不升，避免会话内反复跳级。
- 默认首页不因开发评审入口改变。
- 评审就绪状态、性能快照和受控录屏保存。

## M1.2a 已替换

| 旧检查 | 新检查 |
| --- | --- |
| `voyage / breath / signal` 三 preset 存在 | 独立加载 `gravitational-weave-tech-preview`；旧 preset 仍明确为历史 `FAIL` |
| 环境星固定为 6,000 / 2,500 | balanced/high 环境星预算改为 800 / 1,200 |
| `PAPER_LIMITS` 为 24 / 12 / 8 | 3,840 个身份继续保留，balanced/high 稳定选择不超过 1,920 / 2,560 |
| Shader 深度焦点影响所有 Point Sprite | M1.2a 锐利语义星不使用景深或时间透明度 |
| `hotspotGlowMaterial` 代表局部 Bloom | M1.2a 使用 `NormalBlending`，不使用 Bloom |
| 整组旋转、缩放和相机正弦摆动 | 四节点解析流场改变粒子位置；主要验收相机固定 |
| 固定三个候选截图 | `agent-flow` 支持固定时间截图和正常动态视频 |
| 旧审计只统计 FPS、对象数和降级原因 | 新审计检查确定性、连续性、形变预算、清晰度和隔离入口 |

## 后续阶段仍需替换

| 尚未完成 | 后续要求 |
| --- | --- |
| 只有一个活动技术 FlowModel | 按人工评审结果决定是否实现 `tidal-curl-tech-preview`，不得预选最终主视觉 |
| 仅实现 `idle` 黑白骨架 | 接入六状态连续转换，不重建粒子几何体 |
| 无动态焦点 | 增加焦点误差、实体解析和 16–32 个会话缓存审计 |
| 仅浏览器评审 | 完成 Iris Xe、RTX 4060 和 Tauri 原生窗口性能验收 |

## 必须删除或禁止

- 将自动审计通过解释为旧候选视觉验收通过。
- 语义星核心读取时间驱动透明度。
- 语义星参与景深、运动模糊或低分辨率放大。
- 整片语义星图旋转、统一斜向平移或整体缩放作为主要流动。
- 粒子在屏幕内循环重生或运行时随机换流带。
- 不存在实体获得伪造的空间位置。

## 新审计入口

- `audit:agent-galaxy-background`：继续审计轻量数据载荷。
- `audit:agent-galaxy-background-visual`：当前仅冻结旧基础设施，明确输出视觉验收 `FAIL`。
- `audit:agent-galaxy-flow-preparation`：作为 preparation gate，继续审计文档、契约、夹具、预算、快照和失败分类；不再要求“流场尚未实现”。
- `audit:agent-galaxy-gravitational-weave`：审计场节点、确定性、连续性、位移、热点论文共同形变和 CPU/GPU 数学一致性。
- `audit:agent-galaxy-flow-visual`：静态审计独立入口、正常透明混合、清晰度禁项、固定相机、预算、减少动态、页面隐藏暂停和默认首页隔离。

以上新审计通过只代表 M1.2a 技术约束 `PASS`。在固定相机动态视频完成人工观看前，产品视觉继续标记为 `UNVERIFIED`。
