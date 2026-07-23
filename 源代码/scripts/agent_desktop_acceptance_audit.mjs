import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../src/components/AgentWorkspace.tsx", import.meta.url), "utf8");
const client = readFileSync(new URL("../src/lib/agentDesktop.ts", import.meta.url), "utf8");
const model = readFileSync(new URL("../src/lib/agentUiModel.ts", import.meta.url), "utf8");
const checks = {
  navigation: app.includes("研究 Agent"),
  supervisedWorkspace: model.includes("awaiting_action_approval") && model.includes("awaiting_user"),
  safeCommitState: model.includes("committing") || workspace.includes("正在安全提交"),
  pauseResumeCancel: /pause|resume|cancel/.test(client),
  sqliteOverview: client.includes("agent_get_run_overview"),
  lazyArtifacts: client.includes("agent_get_artifact"),
  noFrontendStateMachineMutation: !client.includes("set_agent_status"),
};
const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
if (failed.length) throw new Error(`Agent desktop acceptance audit failed: ${failed.join(", ")}`);
console.log(JSON.stringify({ ok: true, checks, manualDesktopRequired: true }, null, 2));
