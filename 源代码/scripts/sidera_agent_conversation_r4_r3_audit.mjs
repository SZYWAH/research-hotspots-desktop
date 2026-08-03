import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  resolveSideraCachePolicy,
  SIDERA_CACHE_POLICY_VERSION,
} from "../src/lib/sideraCachePolicy.ts";

const root = process.cwd();
const read = (file) => readFile(path.join(root, file), "utf8");
const [app, types, settingsStore, cachePolicy, bridge, runtime, streamGate, harness, packageText] = await Promise.all([
  read("src/App.tsx"),
  read("src/types.ts"),
  read("src/data/researchStore.ts"),
  read("src/lib/sideraCachePolicy.ts"),
  read("src/lib/sideraPi.ts"),
  read("src-tauri/src/sidera_pi_runtime.rs"),
  read("src-tauri/src/sidera_stream_gate.rs"),
  read("src-tauri/conversation-store-test-harness/src/lib.rs"),
  read("package.json"),
]);
const pkg = JSON.parse(packageText);

assert.equal(SIDERA_CACHE_POLICY_VERSION, 2);
assert.deepEqual(resolveSideraCachePolicy({ sideraCacheRetention: "auto" }), {
  sideraCacheRetention: "long",
  sideraCachePolicyVersion: 2,
  migrated: true,
});
assert.deepEqual(resolveSideraCachePolicy({ sideraCacheRetention: "long" }), {
  sideraCacheRetention: "long",
  sideraCachePolicyVersion: 2,
  migrated: true,
});
assert.deepEqual(resolveSideraCachePolicy({}), {
  sideraCacheRetention: "long",
  sideraCachePolicyVersion: 2,
  migrated: true,
});
assert.deepEqual(resolveSideraCachePolicy({
  sideraCacheRetention: "auto",
  sideraCachePolicyVersion: 2,
}), {
  sideraCacheRetention: "auto",
  sideraCachePolicyVersion: 2,
  migrated: false,
});

assert.ok(types.includes("sideraCachePolicyVersion: number"));
assert.ok(cachePolicy.includes('sideraCacheRetention === "auto" ? "auto" : "long"'));
assert.ok(settingsStore.includes('sideraCacheRetention: "long"'));
assert.ok(settingsStore.includes("migrateSideraCachePolicies"));
assert.ok(settingsStore.includes("tx.store.openCursor()"));
assert.ok(app.includes('label: "长缓存（默认，推荐）"'));
assert.ok(app.includes('label: "兼容模式（上游不支持长缓存时使用）"'));

assert.ok(!runtime.includes("TEXT_DECISION_BUFFER_BYTES"));
assert.ok(!runtime.includes("pending_text"));
assert.ok(runtime.includes('event_type == "toolcall_start"'));
assert.ok(runtime.includes("SideraPiEventPayload::AssistantReplace"));
assert.ok(runtime.includes("SideraTextDeltaDecision::Emit"));
assert.ok(runtime.includes("SIDERA_PI_LONG_CACHE_UNSUPPORTED"));
assert.ok(streamGate.includes("direct_text_streams_from_the_first_delta"));
assert.ok(streamGate.includes("text_then_tool_retracts_once_and_hides_process_prose"));
assert.ok(streamGate.includes("tool_first_hides_prose_until_final_release"));
assert.ok(harness.includes("sidera_stream_gate.rs"));
assert.ok(bridge.includes('type: "assistant-replace"'));
assert.ok(bridge.includes("SIDERA_PI_LONG_CACHE_UNSUPPORTED"));
assert.match(
  app,
  /event\.type === "assistant-replace"[\s\S]*?markdown: event\.markdown[\s\S]*?\}\), true\);/u,
  "assistant replacement must overwrite and checkpoint immediately",
);

assert.equal(
  pkg.scripts["audit:sidera-agent-conversation-r4-r3"],
  "node --experimental-strip-types scripts/sidera_agent_conversation_r4_r3_audit.mjs",
);

console.log(JSON.stringify({
  status: "PASS",
  package: "M2.0b-R4-R3",
  cacheDefault: "long",
  legacyAutoMigration: "all-projects-once",
  explicitCompatibilityAfterMigration: "auto",
  firstDelta: "immediate",
  toolPrelude: "replace-on-toolcall-start",
  providerCalls: 0,
  productAcceptance: "UNVERIFIED",
}, null, 2));
