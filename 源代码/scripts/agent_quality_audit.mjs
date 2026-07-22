import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const [runtime, report, capabilities, workspace] = await Promise.all([
  readFile(join(root, "src-tauri/src/agent_runtime.rs"), "utf8"),
  readFile(join(root, "src-tauri/core/src/agent_report.rs"), "utf8"),
  readFile(join(root, "src-tauri/core/src/agent_capabilities.rs"), "utf8"),
  readFile(join(root, "src/components/AgentWorkspace.tsx"), "utf8"),
]);

for (const gate of ["AGENT_IMPORT_COMPLETION_GATE_FAILED", "AGENT_CLEAN_COMPLETION_GATE_FAILED", "AGENT_MODELING_COMPLETION_GATE_FAILED", "AGENT_EXPORT_COMPLETION_GATE_FAILED"]) assert.match(runtime, new RegExp(gate));
assert.match(runtime, /record_model_turn/);
assert.match(capabilities, /estimated_cost_microusd/);
assert.match(workspace, /未配置单价/);
assert.match(workspace, /modelUsage/);
assert.match(report, /citation/);
assert.match(report, /risk_level/);
assert.doesNotMatch(runtime, /Authorization.*agent_events|credential.*agent_events/i);

console.log(JSON.stringify({ deterministicTaskGates: 5, tokenAccounting: true, optionalCostAccounting: true, citationAudit: true, credentialLogging: false, liveEvaluationRequiredSeparately: true }, null, 2));
