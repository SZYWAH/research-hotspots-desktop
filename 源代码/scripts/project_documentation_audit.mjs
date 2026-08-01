import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const docsRoot = path.join(root, "docs");
const requiredDocs = [
  "PROJECT.md",
  "ROADMAP.md",
  "STATUS.md",
  "ARCHITECTURE.md",
  "DECISIONS.md",
  "DEVELOPMENT.md",
];

const checks = [];
const addCheck = (name, passed, detail) => {
  checks.push({ name, passed: Boolean(passed), detail });
};

const readDoc = (name) => {
  const filePath = path.join(docsRoot, name);
  const exists = fs.existsSync(filePath);
  addCheck(`document exists: ${name}`, exists, filePath);
  return exists ? fs.readFileSync(filePath, "utf8") : "";
};

const docs = Object.fromEntries(requiredDocs.map((name) => [name, readDoc(name)]));

const requireText = (name, pattern, description) => {
  const value = docs[name] ?? "";
  const passed = typeof pattern === "string" ? value.includes(pattern) : pattern.test(value);
  addCheck(`${name}: ${description}`, passed, String(pattern));
};

for (const name of requiredDocs) {
  requireText(name, "更新时间：2026-08-01", "current update date");
}

requireText("PROJECT.md", "## 最终目标", "final goal section");
requireText("PROJECT.md", "M1.3g", "current work package");
requireText("PROJECT.md", "M1.3g-R9", "current repair package");
requireText("PROJECT.md", "M1.3g-R10", "single cruise resume package");
requireText("PROJECT.md", "M1.3h", "superseded dual focus package");
requireText("PROJECT.md", "M1.3i", "current explicit evidence focus package");
requireText("PROJECT.md", "M1.3j", "current direct focus package");
requireText("PROJECT.md", "M1.3l", "current dual immersive style package");
requireText("PROJECT.md", "M1.3m", "current unified spatial shell package");
requireText("PROJECT.md", "M1.3n", "current Agent run center package");
requireText("PROJECT.md", "M2.0a Pi 基础会话链路", "current Pi basic conversation package");
requireText("PROJECT.md", "Sidera", "Agent product working name");
requireText("ROADMAP.md", "## 里程碑", "milestone section");
requireText("ROADMAP.md", "M1.3e 沉浸流动与理论恒星材质修订", "M1.3e stage");
requireText("ROADMAP.md", "M1.3f Agent 理论背景纵深与深空层次调整", "M1.3f stage");
requireText("ROADMAP.md", "M1.3g Agent 理论外围巡航与观测尺度恒星 LOD", "M1.3g stage");
requireText("ROADMAP.md", "M1.3g-R10", "R10 stage");
requireText("ROADMAP.md", "M1.3h 双背景动态语义聚焦闭环", "superseded M1.3h stage");
requireText("ROADMAP.md", "M1.3i Sidera 回答后显式证据聚焦", "current M1.3i stage");
requireText("ROADMAP.md", "M1.3j Sidera 一键直达聚焦与论文恒星近景", "current M1.3j stage");
requireText("ROADMAP.md", "M1.3k Sidera 桌面产品壳、启动页与默认入口", "current M1.3k stage");
requireText("ROADMAP.md", "M1.3l Sidera 双沉浸样式与流动知识星河", "current M1.3l stage");
requireText("ROADMAP.md", "M1.3l-R1 Sidera 全局星空导航壳", "current M1.3l-R1 stage");
requireText("ROADMAP.md", "M1.3m 统一星空外壳与空间页面", "current M1.3m stage");
requireText("ROADMAP.md", "M1.3m-R1 工作台可读性与全局控件安全区修订", "current M1.3m-R1 stage");
requireText("ROADMAP.md", "M1.3m-R3 科研星图顶部工具化、边缘导航与详情轨道修复", "frozen M1.3m-R3 stage");
requireText("ROADMAP.md", "已完成工作包：M1.3n Sidera Agent 运行中心", "completed M1.3n stage");
requireText("STATUS.md", "当前分支：`codex/sidera-m2-pi-baseline`", "current branch");
requireText("STATUS.md", "M1.3g 收口与 M1.3h 启动", "R10 closure and M1.3h handoff");
requireText("STATUS.md", "IN_PROGRESS / PRODUCT UNVERIFIED", "current status");
requireText("STATUS.md", /M1\.3k[\s\S]*桌面产品壳/, "M1.3k desktop shell status");
requireText("STATUS.md", "M1.3l 双沉浸样式与流动知识星河（用户视觉 PASS）", "completed M1.3l status");
requireText("STATUS.md", "## 2026-08-01 M1.3m 统一星空外壳与空间页面", "M1.3m architecture status");
requireText("STATUS.md", "M1.3m-R3 及 M1.3m 据此记录为技术与用户视觉 `PASS`", "frozen M1.3m-R3 status");
requireText("STATUS.md", "当前阶段：M2.0a“Pi 基础会话链路”", "current M2.0a status");
requireText("STATUS.md", "IMPLEMENTED / TECHNICAL PASS / USER ACCEPTANCE UNVERIFIED", "current M2.0a verification state");
requireText("ARCHITECTURE.md", "## 现有基础", "as-built architecture section");
requireText("DECISIONS.md", "D-033", "GPGPU flow decision");
requireText("DECISIONS.md", "D-034", "analytic fallback decision");
requireText("DECISIONS.md", "D-035", "stellar material decision");
requireText("DECISIONS.md", "D-036", "documentation governance decision");
requireText("DECISIONS.md", "D-037", "Agent theory depth decision");
requireText("DECISIONS.md", "D-038", "deep-field layer decision");
requireText("DECISIONS.md", "D-039", "ambient co-orbit decision");
requireText("DECISIONS.md", "D-042", "perimeter cruise decision");
requireText("DECISIONS.md", "D-043", "Explore return decision");
requireText("DECISIONS.md", "D-044", "observational stellar LOD decision");
requireText("DECISIONS.md", "D-045", "runtime WebGL readiness and coordinate-unit decision");
requireText("DECISIONS.md", "D-046", "screen-space LOD and Explore pivot decision");
requireText("DECISIONS.md", "D-047", "interaction hot-path isolation decision");
requireText("DECISIONS.md", "D-055", "continuous visibility floor decision");
requireText("DECISIONS.md", "D-056", "perceptible hotspot energy decision");
requireText("DECISIONS.md", "D-057", "frozen Explore return anchor decision");
requireText("DECISIONS.md", "D-058", "exact Explore anchor return decision");
requireText("DECISIONS.md", "D-059", "unified camera LOD and dialog return decision");
requireText("DECISIONS.md", "D-060", "continuous Agent theory label decision");
requireText("DECISIONS.md", "D-061", "hierarchical Agent theory navigation decision");
requireText("DECISIONS.md", "D-062", "cruise liveness proof decision");
requireText("DECISIONS.md", "D-063", "Agent theory system paper visibility decision");
requireText("DECISIONS.md", "D-064", "live guard cruise proof decision");
requireText("DECISIONS.md", "D-065", "second system paper visibility decision");
requireText("DECISIONS.md", "D-066", "non-blocking visibility guidance decision");
requireText("DECISIONS.md", "D-067", "continuous cruise randomness decision");
requireText("DECISIONS.md", "D-068", "worker cruise guidance decision");
requireText("DECISIONS.md", "D-072", "single cruise resume decision");
requireText("DECISIONS.md", "D-073", "dual focus identity decision");
requireText("DECISIONS.md", "D-074", "immersive focus decision");
requireText("DECISIONS.md", "D-075", "theory focus decision");
requireText("DECISIONS.md", "D-076", "theory focus lifecycle ownership decision");
requireText("DECISIONS.md", "D-077", "streaming answer background stability decision");
requireText("DECISIONS.md", "D-078", "explicit evidence stage decision");
requireText("DECISIONS.md", "D-079", "no immersive context relocation decision");
requireText("DECISIONS.md", "D-080", "opposite-side evidence card decision");
requireText("DECISIONS.md", "D-081", "Sidera working-name decision");
requireText("DECISIONS.md", "D-082", "single timeline direct focus decision");
requireText("DECISIONS.md", "D-083", "single target carousel decision");
requireText("DECISIONS.md", "D-084", "fixed dialog geometry decision");
requireText("DECISIONS.md", "D-085", "real paper photosphere decision");
requireText("DECISIONS.md", "D-086", "in-flight direct-route ownership decision");
requireText("DECISIONS.md", "D-087", "Sidera default desktop shell decision");
requireText("DECISIONS.md", "D-088", "Sidera startup and window chrome decision");
requireText("DECISIONS.md", "D-089", "dual immersive style decision");
requireText("DECISIONS.md", "D-090", "stable star-river composition decision");
requireText("DECISIONS.md", "D-091", "unified transparent Agent navigation decision");
requireText("DECISIONS.md", "D-092", "global transparent navigation decision");
requireText("DECISIONS.md", "D-093", "workbench star-river decision");
requireText("DECISIONS.md", "D-094", "exclusive research galaxy decision");
requireText("DECISIONS.md", "D-095", "pipeline spatial ownership decision");
requireText("DECISIONS.md", "D-096", "workbench navigation reserve decision");
requireText("DECISIONS.md", "D-097", "titlebar navigation ownership decision");
requireText("DECISIONS.md", "D-098", "research galaxy fullscreen ownership decision");
requireText("DECISIONS.md", "D-099", "research galaxy original-screen mode handoff decision");
requireText("DECISIONS.md", "D-100", "research galaxy single context rail decision");
requireText("DECISIONS.md", "D-101", "research galaxy titlebar tool ownership decision");
requireText("DECISIONS.md", "D-102", "edge navigation decision");
requireText("DECISIONS.md", "D-103", "discriminated context rail state decision");
requireText("DECISIONS.md", "D-104", "frozen unified shell baseline decision");
requireText("DECISIONS.md", "D-105", "internal Agent run center view decision");
requireText("DECISIONS.md", "D-106", "inbox-first run center decision");
requireText("DECISIONS.md", "D-107", "research-report-only creation decision");
requireText("DECISIONS.md", "D-108", "Rust managed Pi RPC decision");
requireText("DECISIONS.md", "D-109", "tool-free in-memory Pi stage decision");
requireText("DECISIONS.md", "D-110", "no silent legacy chat fallback decision");
requireText(
  "STATUS.md",
  "agent-m1.3g-r10-single-cruise-resume-2026-07-30.json",
  "R10 evidence link",
);
requireText(
  "STATUS.md",
  "agent-m1.3h-dual-semantic-focus-2026-07-30.json",
  "M1.3h technical evidence link",
);
requireText(
  "STATUS.md",
  "agent-m1.3i-explicit-evidence-focus-2026-07-30.json",
  "M1.3i evidence link",
);
requireText(
  "STATUS.md",
  "agent-m1.3j-direct-focus-photosphere-2026-07-31.json",
  "M1.3j evidence link",
);
requireText(
  "STATUS.md",
  "sidera-m1.3m-unified-spatial-shell-2026-08-01.json",
  "M1.3m evidence link",
);
requireText(
  "STATUS.md",
  "sidera-m1.3m-r1-workbench-navigation-2026-08-01.json",
  "M1.3m-R1 evidence link",
);
requireText(
  "STATUS.md",
  "sidera-m1.3m-r2-galaxy-camera-spatial-ui-2026-08-01.json",
  "M1.3m-R2 evidence link",
);
requireText(
  "STATUS.md",
  "sidera-m1.3m-r3-titlebar-edge-navigation-context-rail-2026-08-01.json",
  "M1.3m-R3 evidence link",
);
requireText(
  "STATUS.md",
  "sidera-m1.3n-agent-run-center-2026-08-01.json",
  "M1.3n evidence link",
);
requireText(
  "STATUS.md",
  "sidera-m2.0a-pi-basic-conversation-2026-08-01.json",
  "M2.0a evidence link",
);
addCheck(
  "M1.3m evidence exists",
  fs.existsSync(path.join(docsRoot, "evidence", "sidera-m1.3m-unified-spatial-shell-2026-08-01.json")),
  "docs/evidence/sidera-m1.3m-unified-spatial-shell-2026-08-01.json",
);
addCheck(
  "M1.3m-R1 evidence exists",
  fs.existsSync(path.join(docsRoot, "evidence", "sidera-m1.3m-r1-workbench-navigation-2026-08-01.json")),
  "docs/evidence/sidera-m1.3m-r1-workbench-navigation-2026-08-01.json",
);
addCheck(
  "M1.3m-R2 evidence exists",
  fs.existsSync(path.join(docsRoot, "evidence", "sidera-m1.3m-r2-galaxy-camera-spatial-ui-2026-08-01.json")),
  "docs/evidence/sidera-m1.3m-r2-galaxy-camera-spatial-ui-2026-08-01.json",
);
addCheck(
  "M1.3m-R3 evidence exists",
  fs.existsSync(path.join(docsRoot, "evidence", "sidera-m1.3m-r3-titlebar-edge-navigation-context-rail-2026-08-01.json")),
  "docs/evidence/sidera-m1.3m-r3-titlebar-edge-navigation-context-rail-2026-08-01.json",
);
addCheck(
  "M1.3n evidence exists",
  fs.existsSync(path.join(docsRoot, "evidence", "sidera-m1.3n-agent-run-center-2026-08-01.json")),
  "docs/evidence/sidera-m1.3n-agent-run-center-2026-08-01.json",
);
addCheck(
  "M2.0a evidence exists",
  fs.existsSync(path.join(docsRoot, "evidence", "sidera-m2.0a-pi-basic-conversation-2026-08-01.json")),
  "docs/evidence/sidera-m2.0a-pi-basic-conversation-2026-08-01.json",
);

for (const heading of [
  "## 最终目标摘要",
  "## 阶段事实",
  "## M1.3k Sidera 桌面产品壳、启动页与默认入口",
  "## M1.3l Sidera 双沉浸样式与流动知识星河",
  "## M1.3l-R1 Sidera 全局星空导航壳",
  "## 当前工作包：M1.3m 统一星空外壳与空间页面",
  "## M1.3j Sidera 一键直达聚焦与论文恒星近景",
  "### 1. 工作包",
  "### 2. 计划步骤与完成条件",
  "### 3. 实际开发日志",
  "### 4. 测试与证据",
  "### 5. 当前进度",
  "### 6. 边界与遗留",
  "## 开发总账更新规则",
]) {
  requireText("DEVELOPMENT.md", heading, heading);
}

requireText(
  "DEVELOPMENT.md",
  "220a5c4",
  "current baseline commit",
);
requireText(
  "DEVELOPMENT.md",
  "ea5c8b843dc94f328caa25e32b358150b38c1518",
  "M1.3e technical checkpoint commit",
);
requireText("DEVELOPMENT.md", "M1.3h 双背景动态语义聚焦闭环", "superseded development package");
requireText("DEVELOPMENT.md", "M1.3j Sidera 一键直达聚焦", "current development package");
requireText("DEVELOPMENT.md", "M1.3k Sidera 桌面产品壳", "current desktop shell development package");
requireText("DEVELOPMENT.md", "M1.3l Sidera 双沉浸样式与流动知识星河", "current dual immersive development package");
requireText("DEVELOPMENT.md", "M1.3l-R1 Sidera 全局星空导航壳", "current unified navigation development package");
requireText("DEVELOPMENT.md", "M1.3m 统一星空外壳与空间页面", "current unified spatial shell development package");
requireText("DEVELOPMENT.md", "M1.3m-R2 科研星图相机稳定与空间面板整合", "current research galaxy spatial development package");
requireText("DEVELOPMENT.md", "M1.3m-R3 科研星图顶部工具化、边缘导航与详情轨道修复", "current research galaxy titlebar development package");
requireText("DEVELOPMENT.md", "M1.3n Sidera Agent 运行中心", "current Agent run center development package");
requireText("DEVELOPMENT.md", "IMPLEMENTED / TECHNICAL PASS / PRODUCT UNVERIFIED", "current M1.3n status");
requireText("DEVELOPMENT.md", "M2.0a Pi 基础会话链路", "current Pi conversation development package");
requireText("DEVELOPMENT.md", "IMPLEMENTED / TECHNICAL PASS / USER ACCEPTANCE UNVERIFIED", "current M2.0a status");

for (const detailedDoc of [
  "RESEARCH_AGENT_PRODUCT_GOAL.md",
  "RESEARCH_AGENT_IMPLEMENTATION_ROADMAP.md",
]) {
  const content = fs.readFileSync(path.join(docsRoot, detailedDoc), "utf8");
  addCheck(
    `${detailedDoc}: historical/detail authority banner`,
    content.includes("不记录当前开发状态或进度") && content.includes("DEVELOPMENT.md"),
    "detail documents must defer live facts to the six canonical entry documents",
  );
}

const failed = checks.filter((check) => !check.passed);
const result = {
  audit: "project-documentation-v1",
  generatedAt: new Date().toISOString(),
  status: failed.length === 0 ? "PASS" : "FAIL",
  currentStage: "M2.0a",
  requiredDocuments: requiredDocs,
  checks,
  failedChecks: failed,
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (failed.length > 0) {
  process.exitCode = 1;
}
