import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const [app, types, dualPage, workspace, css, agentTypes, schema] = await Promise.all([
  readFile(join(root, "src/App.tsx"), "utf8"),
  readFile(join(root, "src/types.ts"), "utf8"),
  readFile(join(root, "src/components/AgentDualBackgroundPage.tsx"), "utf8"),
  readFile(join(root, "src/components/AgentWorkspace.tsx"), "utf8"),
  readFile(join(root, "src/index.css"), "utf8"),
  readFile(join(root, "src/agentTypes.ts"), "utf8"),
  readFile(join(root, "src-tauri/core/src/agent_schema.sql"), "utf8"),
]);

assert.match(types, /\| "agent-runs"/, "ActiveView must expose the independent Agent run center");
assert.match(app, /onOpenRunCenter=\{\(\) => setActiveView\("agent-runs"\)\}/, "Sidera more menu must navigate to the run center");
assert.match(app, /activeView === "agent-runs"[\s\S]{0,600}<AgentWorkspace/, "AgentWorkspace must render as an independent root view");
assert.doesNotMatch(app, /\{ id: "agent-runs"/, "Agent run center must not become a top-level navigation item");
assert.doesNotMatch(dualPage, /advancedWorkspace|高级工作台/, "The legacy embedded advanced workbench must be removed");
assert.match(dualPage, /Agent 运行中心/, "The Agent menu label must use the product name");

assert.match(workspace, /type AgentRunCenterSection = "inbox" \| "history"/);
assert.match(workspace, /run\.status\.startsWith\("awaiting_"\)/, "Inbox must prioritize approval and user-waiting runs");
assert.match(workspace, /RECENT_RUN_WINDOW_MS/);
assert.match(workspace, /\.slice\(0, 3\)/, "Recent failed inbox items must be capped at three");
assert.match(workspace, /historyStatus/);
assert.match(workspace, /historyKind/);
assert.match(workspace, /runQuery/);
assert.match(workspace, /待审批/);
assert.match(workspace, /运行中/);
assert.match(workspace, /失败待检查/);
assert.match(workspace, /最近完成/);

assert.match(workspace, /runKind: "research_report", taskInput: \{\}/, "Manual creation must only create research reports");
assert.doesNotMatch(workspace, /choosePaperImportFile|chooseExportDirectory/, "Professional import/export controls must not remain in the run-center form");
assert.doesNotMatch(workspace, /agent-task-kind-grid/, "The six-kind creation selector must be removed");
for (const kind of ["research_report", "paper_file_import", "paper_mysql_import", "library_clean", "v20_modeling", "report_export"]) {
  assert.match(workspace, new RegExp(kind), `Historical run kind ${kind} must remain readable`);
  assert.match(agentTypes, new RegExp(kind), `Runtime type ${kind} must remain compatible`);
}
assert.match(workspace, /professionalViewForRunKind/);
assert.match(workspace, /复制目标并新建任务/);
assert.match(workspace, /agent-technical-details/);
assert.match(workspace, /if \(pending !== "none"\) setInspectorOpen\(true\)/, "Governance drawer must open for actionable work");

assert.match(css, /grid-template-columns: minmax\(270px, 304px\) minmax\(0, 1fr\)/, "Run center must use queue plus detail layout");
assert.match(css, /\.agent-inspector\s*\{[\s\S]*?@apply\s+fixed[\s\S]*?hidden/, "Governance must be an on-demand drawer");
assert.match(css, /\.agent-inspector\.agent-inspector-open\s*\{[^}]*@apply\s+block/, "Governance drawer must only appear on demand");
assert.match(css, /\.workspace--workbench > \.agent-run-center-page/, "Run center must use the unified workbench surface");

for (const table of ["agent_runs", "agent_plans", "agent_events", "agent_artifacts", "agent_approvals"]) {
  assert.match(schema, new RegExp(table), `Existing runtime table ${table} must remain available`);
}

console.log(JSON.stringify({
  ok: true,
  view: "agent-runs",
  defaultSection: "inbox",
  creationKind: "research_report",
  historicalRunKinds: 6,
  runtimeSchemaChanged: false,
  nativeVisualAcceptance: "UNVERIFIED",
}, null, 2));
