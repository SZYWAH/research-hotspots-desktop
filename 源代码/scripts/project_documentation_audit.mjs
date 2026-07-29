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
  requireText(name, "更新时间：2026-07-29", "current update date");
}

requireText("PROJECT.md", "## 最终目标", "final goal section");
requireText("PROJECT.md", "M1.3f", "current work package");
requireText("ROADMAP.md", "## 里程碑", "milestone section");
requireText("ROADMAP.md", "M1.3e 沉浸流动与理论恒星材质修订", "M1.3e stage");
requireText("ROADMAP.md", "M1.3f Agent 理论背景纵深与深空层次调整", "M1.3f stage");
requireText("STATUS.md", "当前分支：`codex/agent-dual-background-v2`", "current branch");
requireText("STATUS.md", "IN_PROGRESS / UNVERIFIED", "current status");
requireText("ARCHITECTURE.md", "## 现有基础", "as-built architecture section");
requireText("DECISIONS.md", "D-033", "GPGPU flow decision");
requireText("DECISIONS.md", "D-034", "analytic fallback decision");
requireText("DECISIONS.md", "D-035", "stellar material decision");
requireText("DECISIONS.md", "D-036", "documentation governance decision");
requireText("DECISIONS.md", "D-037", "Agent theory depth decision");
requireText("DECISIONS.md", "D-038", "deep-field layer decision");
requireText("DECISIONS.md", "D-039", "ambient co-orbit decision");

for (const heading of [
  "## 最终目标摘要",
  "## 阶段事实",
  "## 当前工作包：M1.3f",
  "### 1. 基线",
  "### 2. 计划步骤与完成条件",
  "### 3. 实际开发日志",
  "### 4. 测试与证据",
  "### 5. 方案偏差与风险",
  "### 6. 当前进度",
  "### 7. 遗留问题和下一步",
  "## 开发总账更新规则",
]) {
  requireText("DEVELOPMENT.md", heading, heading);
}

requireText(
  "DEVELOPMENT.md",
  "07de19deedd051bb17f19fc602ca1ec11006d0f7",
  "current baseline commit",
);
requireText(
  "DEVELOPMENT.md",
  "ea5c8b843dc94f328caa25e32b358150b38c1518",
  "M1.3e technical checkpoint commit",
);
requireText("DEVELOPMENT.md", "用户产品视觉：`UNVERIFIED`", "visual status");

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
  currentStage: "M1.3f",
  requiredDocuments: requiredDocs,
  checks,
  failedChecks: failed,
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (failed.length > 0) {
  process.exitCode = 1;
}
