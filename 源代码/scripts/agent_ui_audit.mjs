import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  AGENT_ACTIVE_POLL_STATUSES,
  AGENT_STATUS_META,
  canAutoContinueAfterUserAction,
  matchesAgentArtifactRequestFence,
  matchesAgentRequestFence,
  normalizeAgentError,
  pendingKind,
  pollIntervalForStatus,
  safeExternalUrl,
} from "../src/lib/agentUiModel.ts";
import { DEFAULT_AGENT_BUDGET } from "../src/agentTypes.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const statuses = ["draft", "planning", "awaiting_plan_approval", "ready", "running", "awaiting_action_approval", "awaiting_user", "evaluating", "paused", "cancelling", "cancelled", "failed", "completed"];
assert.deepEqual(Object.keys(AGENT_STATUS_META).sort(), [...statuses].sort(), "all run states must have UI metadata");
assert.deepEqual([...AGENT_ACTIVE_POLL_STATUSES].sort(), ["cancelling", "evaluating", "planning", "running"]);
assert.equal(pollIntervalForStatus("running"), 800);
assert.equal(pollIntervalForStatus("paused"), 4_000);
assert.equal(canAutoContinueAfterUserAction("ready"), true);
assert.equal(canAutoContinueAfterUserAction("paused"), false);

const requestFence = { sequence: 7, runId: "run-a", contextKey: "db-a\u0000project-a" };
assert.equal(matchesAgentRequestFence(requestFence, 7, "run-a", "db-a\u0000project-a"), true);
assert.equal(matchesAgentRequestFence(requestFence, 8, "run-a", "db-a\u0000project-a"), false, "newer command sequence must fence stale success and failure");
assert.equal(matchesAgentRequestFence(requestFence, 7, "run-b", "db-a\u0000project-a"), false, "switching runs must fence stale commands");
assert.equal(matchesAgentRequestFence(requestFence, 7, "run-a", "db-b\u0000project-a"), false, "switching databases must fence stale commands");
const artifactFence = { ...requestFence, artifactId: "artifact-a" };
assert.equal(matchesAgentArtifactRequestFence(artifactFence, 7, "run-a", "db-a\u0000project-a", "artifact-a", true), true);
assert.equal(matchesAgentArtifactRequestFence(artifactFence, 7, "run-a", "db-a\u0000project-a", "artifact-b", true), false, "switching artifacts must fence stale responses");
assert.equal(matchesAgentArtifactRequestFence(artifactFence, 7, "run-a", "db-a\u0000project-a", "artifact-a", false), false, "removed artifact metadata must fence stale responses");

const baseOverview = {
  run: { id: "r", libraryInstanceId: "l", projectId: "p", automationMode: "supervised", status: "awaiting_user", objective: "o", budget: DEFAULT_AGENT_BUDGET, budgetUsage: { executedSteps: 0, toolCalls: 0, plannerRounds: 0, protocolRepairs: 0, retriesForCurrentTool: 0, reportRewrites: 0 }, createdAtMs: 1, updatedAtMs: 1 },
  steps: [], artifacts: [], approvals: [], questions: [], answers: [], artifactReviews: [], modelProfiles: [], eventCursor: 0,
};
assert.equal(pendingKind({ ...baseOverview, run: { ...baseOverview.run, status: "awaiting_plan_approval" }, plan: { version: 1, objective: "o", assumptions: [], successCriteria: [], steps: [] } }), "plan");
assert.equal(pendingKind({ ...baseOverview, run: { ...baseOverview.run, status: "awaiting_action_approval" }, steps: [{ stepId: "s", status: "waiting_user", pendingApprovalHash: "h" }] }), "action");
assert.equal(pendingKind({ ...baseOverview, questions: [{ id: "q", answerType: "text", prompt: "?", requiresReplan: false }] }), "question");
assert.equal(pendingKind({ ...baseOverview, artifacts: [{ id: "a", artifactKind: "report_draft", reviewStatus: "needs-review", contentSha256: "h" }] }), "artifact_review");
assert.equal(pendingKind(baseOverview), "blocker");

assert.equal(safeExternalUrl("https://example.com/a"), "https://example.com/a");
assert.equal(safeExternalUrl("http://localhost:1234/a"), "http://localhost:1234/a");
assert.equal(safeExternalUrl("javascript:alert(1)"), undefined);
assert.equal(safeExternalUrl("file:///C:/secret"), undefined);
const conflict = normalizeAgentError("AGENT_ACTIVE_RUN_EXISTS:run-123");
assert.equal(conflict.code, "AGENT_ACTIVE_RUN_EXISTS");
assert.equal(conflict.runId, "run-123");

for (const [name, value, maximum] of [["maxSteps", DEFAULT_AGENT_BUDGET.maxSteps, 20], ["maxToolCalls", DEFAULT_AGENT_BUDGET.maxToolCalls, 24], ["maxPlannerRounds", DEFAULT_AGENT_BUDGET.maxPlannerRounds, 24], ["maxReportRewrites", DEFAULT_AGENT_BUDGET.maxReportRewrites, 1]]) {
  assert.equal(value, maximum, `${name} must match the governed backend ceiling`);
}

const [workspaceSource, clientSource, storeSource] = await Promise.all([
  readFile(join(root, "src/components/AgentWorkspace.tsx"), "utf8"),
  readFile(join(root, "src/lib/agentDesktop.ts"), "utf8"),
  readFile(join(root, "src-tauri/core/src/agent_store.rs"), "utf8"),
]);
assert.match(clientSource, /agent_get_run_overview/);
assert.match(clientSource, /agent_get_artifact/);
assert.match(clientSource, /agent_get_draft_model_profiles/);
assert.doesNotMatch(workspaceSource, /dangerouslySetInnerHTML/);
assert.match(workspaceSource, /sessionStorage/);
assert.match(workspaceSource, /pollIntervalForStatus/);
assert.match(workspaceSource, /currentRunRef\.current !== runId/);
assert.match(workspaceSource, /eventsRef\.current/);
assert.match(workspaceSource, /afterSequence/);
assert.match(workspaceSource, /加载更多审计事件/);
assert.match(workspaceSource, /setRunLimit\(\(current\) => current \+ RUN_PAGE_SIZE\)/);
assert.match(workspaceSource, /getDraftModelProfiles/);
assert.match(workspaceSource, /agent-inspector-open/);
assert.match(storeSource, /status NOT IN \('completed','cancelled','failed'\)/);
assert.match(storeSource, /TransactionBehavior::Immediate/);
assert.match(storeSource, /AGENT_ARTIFACT_HASH_MISMATCH/);

console.log(JSON.stringify({
  statusCount: statuses.length,
  activePollStatuses: [...AGENT_ACTIVE_POLL_STATUSES],
  pendingPriority: ["plan", "action", "question", "artifact_review", "blocker"],
  lazyArtifactLoading: true,
  safeMarkdown: true,
  singleActiveRun: true,
  recoverableDraftPlanning: true,
  responsiveInspectors: true,
  incrementalEventPaging: true,
}, null, 2));
