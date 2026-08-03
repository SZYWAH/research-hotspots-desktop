import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const read = (file) => readFile(path.join(root, file), "utf8");
const [
  app,
  styles,
  conversationBridge,
  piBridge,
  conversationStore,
  conversationSchema,
  piRuntime,
  rustLib,
  cargoManifest,
  testHarness,
  buildScript,
  packageText,
] = await Promise.all([
  read("src/App.tsx"),
  read("src/index.css"),
  read("src/lib/sideraConversations.ts"),
  read("src/lib/sideraPi.ts"),
  read("src-tauri/src/sidera_conversations.rs"),
  read("src-tauri/src/sidera_conversations_schema.sql"),
  read("src-tauri/src/sidera_pi_runtime.rs"),
  read("src-tauri/src/lib.rs"),
  read("src-tauri/Cargo.toml"),
  read("src-tauri/conversation-store-test-harness/Cargo.toml"),
  read("src-tauri/build.rs"),
  read("package.json"),
]);
const pkg = JSON.parse(packageText);

assert.equal(
  pkg.scripts["audit:sidera-agent-conversation-r4-r1"],
  "node scripts/sidera_agent_conversation_r4_r1_audit.mjs",
);

assert.ok(!/\\\r?\n/.test(conversationStore), "Rust SQL must not use whitespace-eating line continuations");
assert.ok(conversationStore.includes('include_str!("sidera_conversations_schema.sql")'));
for (const table of ["conversations", "turns", "project_state"]) {
  assert.ok(conversationSchema.includes(`CREATE TABLE IF NOT EXISTS ${table}`));
}
for (const index of [
  "idx_sidera_conversations_project_status_updated",
  "idx_sidera_turns_conversation_time",
]) {
  assert.ok(conversationSchema.includes(`CREATE INDEX IF NOT EXISTS ${index}`));
}
assert.ok(conversationSchema.includes("ON DELETE CASCADE"));
assert.ok(conversationStore.includes("open_store_with_recovery"));
assert.ok(conversationStore.includes("validate_existing_table"));
assert.ok(conversationStore.includes("validate_schema"));
assert.ok(conversationStore.includes("ExpectedColumn"));
assert.ok(conversationStore.includes("PRAGMA index_xinfo"));
assert.ok(conversationStore.includes('.pragma_update(None, "user_version", STORE_VERSION)'));
assert.ok(conversationStore.includes("SIDERA_CONVERSATION_SCHEMA_INCOMPATIBLE"));
assert.ok(conversationStore.includes("partial_v0_store_repairs_in_place_and_preserves_rows"));
assert.ok(conversationStore.includes("incompatible_partial_store_is_not_recreated"));

assert.ok(rustLib.includes("sidera_agent_local_readiness"));
assert.ok(rustLib.includes("conversation_store"));
assert.ok(rustLib.includes("pi_runtime"));
assert.ok(conversationBridge.includes("checkSideraAgentLocalReadiness"));
assert.ok(piRuntime.includes("check_installation"));
assert.ok(app.includes("检测 Agent"));
for (const label of ["Provider", "会话存储", "Pi 运行时", "Agent 可以对话"]) {
  assert.ok(app.includes(label), `${label} readiness presentation is required`);
}
assert.ok(styles.includes("settings-agent-readiness"));
assert.ok(styles.includes("settings-agent-readiness__row"));

assert.ok(piBridge.includes("SIDERA_CONVERSATION_SCHEMA_INCOMPATIBLE"));
assert.ok(piBridge.includes("检测 Agent"));
assert.ok(rustLib.includes('#[cfg(all(not(test), feature = "desktop-dialog"))]'));
assert.ok(cargoManifest.includes('desktop-dialog = ["dep:tauri-plugin-dialog"]'));
assert.ok(cargoManifest.includes('tauri-plugin-dialog = { version = "2", optional = true }'));
assert.ok(cargoManifest.includes('"conversation-store-test-harness"'));
assert.ok(!testHarness.includes("tauri"), "conversation tests must not link the Tauri desktop runtime");
assert.ok(buildScript.includes("compile_for_everything"));
assert.ok(buildScript.includes("CARGO_FEATURE_DESKTOP_DIALOG"));

console.log(JSON.stringify({
  status: "PASS",
  package: "M2.0b-R4-R1",
  schemaSource: "newline-preserving-sql-file",
  recovery: "idempotent-v0-in-place",
  readiness: ["provider", "conversation-store", "pi-runtime"],
  conversationTestRuntime: "tauri-free-harness",
  providerCalls: 0,
  productAcceptance: "UNVERIFIED",
}, null, 2));
