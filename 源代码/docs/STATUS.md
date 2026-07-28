# 科研 Agent 当前状态

更新时间：2026-07-28

当前分支：`codex/agent-galaxy-focus`

当前工作树 HEAD：`2b7a32495897afbfed2cfc09de34439166a053a5`

当前阶段：M1.3c“理论坐标 + 沉浸外壳”实验已判定为结构性 `FAIL`；下一阶段为 M1.3d“真正的沉浸/理论双背景静置闭环”

## 2026-07-28 纠错结论

- 当前所谓“沉浸背景”仍通过 `hotspot.position + paper.offset` 生成论文位置，视觉上必然保留理论热点团簇；这与 `agent背景.html` 的会话随机星海不是同一种空间结构。
- 构建、Rust 增量编译和自动审计的 `PASS` 只证明旧实现满足自身技术约束，不能覆盖用户在 Tauri 实机中确认的产品结构性失败。
- M1.3c 的“实现完成”结论撤销。旧 `AgentGalaxyFlowCanvas`、同顶点聚焦、实体解析、性能诊断和恒星材质研究保留为技术资产，但不再进入正式沉浸背景产品路径。
- M1.3d 将沉浸背景和理论背景彻底拆开：沉浸背景不得读取理论 XYZ、热点质心或论文语义偏移；理论背景继续使用真实理论坐标。
- 本轮只实现两套背景的静置闭环、正式研究 Agent 页面和显式切换。聚焦、Thinking 波纹、六态动画和正式 Agent 后端均暂停，等待两套基础结构人工通过。

## PASS

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

## FAIL

- `voyage / breath / signal` 三套视觉候选未通过人工验收。
- 主要问题包括固定坐标感、整组旋转/缩放代替真实流动、热点过强、论文星不明显、色彩过于突出和整体模糊。
- 因视觉验收失败，M1 不能标记完成，即使旧自动审计仍能通过。
- 首次 M1.3a 浏览器体验确认旧星体覆盖函数仍显得模糊，且原聚焦能量差过小，视觉上主要只能感知相机远近变化；该旧材质基线判定为 `FAIL`，现已替换。
- M1.3a 的同顶点、相机和切换骨架技术上通过，但旧的二维白点/弱材质方案无法让用户在关闭相机时辨认目标，因此其产品视觉结论保持 `FAIL`，不能用技术审计覆盖。
- M1.3b-1 恒星光球能够产生明确放大缩小，但用户不认可这种表达作为沉浸版主视觉。该视觉方向不再继续扩张，底层同顶点、锐利亮核、FocusField 和相机能力保留。
- M1.3c 把真实身份约束错误扩张为理论空间约束，沉浸视图继续继承理论热点中心和论文语义偏移。Tauri 实机中启动后仍呈现理论星图式热点团簇，用户无法找到 `agent背景.html` 的随机流动星海，因此该产品结构判定为 `FAIL`。

## UNVERIFIED

- 新 `AgentImmersiveStarfieldCanvas` 是否忠实保留参考 HTML 的随机空间、Curl 流、中央构图和沉浸感。
- Agent 专用理论背景是否在保持真实语义结构的同时改善白色圆点感。
- 单活动渲染器切换、沉浸会话续接和理论相机姿态恢复是否通过 Tauri 实机验收。
- RTX 4060 和 Tauri 原生窗口中的最终性能。
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

1. 归档 M1.3c 失败基线并创建 `codex/agent-dual-background-v2`。
2. 新增不含任何理论坐标的 `AgentImmersiveBackgroundPayloadV2`，会话内抽样最多 6,000 篇真实论文和全部 160 个热点。
3. 忠实迁移 `agent背景.html` 的随机空间与连续 Curl 流，使用锐利恒星材质重建正式沉浸背景。
4. 在正式研究 Agent 页面建立沉浸/理论双背景、单活动渲染器、极简输入和高级工作台入口。
5. 完成 Agent 专用理论视觉配置与探索态；低负载自动验证通过后再交由用户在 Tauri 中人工验收。

## 证据

- [准备基线 JSON](./evidence/agent-galaxy-flow-baseline-2026-07-27.json)
- [确定性焦点夹具](./evidence/agent-galaxy-focus-fixtures-v1.json)
- [沉浸版准备基线](./evidence/agent-immersive-background-preparation-2026-07-28.json)
- [阶段 1 实现审计](./evidence/agent-galaxy-immersive-stage1-2026-07-28.json)
- [沉浸版保留式改造准备](./AGENT_IMMERSIVE_BACKGROUND_PREPARATION.md)
- [旧审计替换清单](./evidence/agent-galaxy-audit-replacement-v1.md)
- [产品目标](./PROJECT.md)
- [路线图](./ROADMAP.md)
- [架构](./ARCHITECTURE.md)
- [决策](./DECISIONS.md)
- [M1.2a 本地验收材料](../../验收临时/agent-galaxy-flow-m1.2a-20260728/README.md)
