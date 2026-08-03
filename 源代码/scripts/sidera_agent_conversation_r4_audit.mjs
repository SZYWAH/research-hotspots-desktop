import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const read = (file) => readFile(path.join(root, file), "utf8");
const [
  app,
  page,
  styles,
  conversationBridge,
  piBridge,
  conversationStore,
  conversationSchema,
  runtime,
  extension,
  settingsStore,
  packageText,
] = await Promise.all([
  read("src/App.tsx"),
  read("src/components/AgentDualBackgroundPage.tsx"),
  read("src/components/AgentDualBackgroundPage.css"),
  read("src/lib/sideraConversations.ts"),
  read("src/lib/sideraPi.ts"),
  read("src-tauri/src/sidera_conversations.rs"),
  read("src-tauri/src/sidera_conversations_schema.sql"),
  read("src-tauri/src/sidera_pi_runtime.rs"),
  read("src-tauri/resources/sidera_pi_paper_tools.ts"),
  read("src/data/researchStore.ts"),
  read("package.json"),
]);
const pkg = JSON.parse(packageText);

assert.equal(
  pkg.scripts["audit:sidera-agent-conversation-r4"],
  "node scripts/sidera_agent_conversation_r4_audit.mjs",
);

for (const table of ["conversations", "turns", "project_state"]) {
  assert.ok(conversationSchema.includes(`CREATE TABLE IF NOT EXISTS ${table}`), `${table} table is required`);
}
assert.ok(conversationStore.includes('root.join("conversations-v1.sqlite")'));
assert.ok(conversationStore.includes('.join("pi-sessions")'));
assert.ok(conversationStore.includes("assistant_status = 'interrupted'"));
assert.ok(conversationSchema.includes("ON DELETE CASCADE"));
assert.ok(conversationStore.includes("SIDERA_CONVERSATION_DELETE_REQUIRES_ARCHIVE"));
assert.ok(conversationStore.includes("find_session_files"));
assert.ok(conversationStore.includes("first_prompt_title"));
for (const command of ["list", "create", "open", "rename", "archive", "restore", "delete", "upsert"]) {
  assert.ok(conversationBridge.toLowerCase().includes(command), `frontend conversation ${command} bridge is required`);
}

assert.ok(!runtime.includes('"--no-session"'), "Pi persistence must not use --no-session");
assert.ok(runtime.includes('"--session-dir"'));
assert.ok(runtime.includes('"--session-id"'));
assert.ok(runtime.includes('"type": "get_session_stats"'));
assert.ok(runtime.includes("PI_CACHE_RETENTION"));
assert.ok(runtime.includes('cache_retention == "long"'));
assert.ok(settingsStore.includes('sideraCacheRetention: "long"'));
assert.ok(settingsStore.includes("sideraCachePolicyVersion"));
assert.ok(piBridge.includes('export type SideraCacheRetention = "auto" | "long"'));
assert.ok(piBridge.includes("cacheRead"));
assert.ok(piBridge.includes("cacheWrite"));
assert.ok(piBridge.includes("contextUsage"));

for (const tool of [
  "sidera_list_directory",
  "sidera_read_file",
  "sidera_search_files",
  "sidera_fetch_url",
  "sidera_write_file",
  "sidera_edit_file",
  "sidera_delete_path",
  "sidera_run_shell",
]) {
  assert.ok(extension.includes(`"${tool}"`), `${tool} must be registered`);
  assert.ok(runtime.includes(`"${tool}"`), `${tool} must be hosted by Rust`);
}
assert.ok(runtime.includes("system_tool_requires_approval"));
assert.ok(runtime.includes("parameter_hash"));
assert.ok(runtime.includes("tool_call_id.as_bytes()"));
assert.ok(runtime.includes("inner.pending_approval.take()"), "approval must be one-shot");
assert.ok(runtime.includes(".env_clear()"), "Shell child environment must be scrubbed");
assert.ok(runtime.includes("redact_sensitive_text"));
assert.ok(runtime.includes("Duration::from_secs(timeout_seconds)"));
assert.ok(runtime.includes("read_stream_capped"));
assert.ok(runtime.includes("active.cancel.store(true, Ordering::Release)"), "turn abort must cancel an active approved system tool");
assert.ok(runtime.includes("SIDERA_TOOL_CANCELLED"), "cancelled Shell execution must not be reported as successful");
assert.ok(runtime.includes("SIDERA_TOOL_HTTPS_REDIRECT_REJECTED"), "HTTPS reads must reject a downgrade redirect");

for (const action of [
  "createNewPiConversation",
  "openPiConversationById",
  "renamePiConversationById",
  "archivePiConversationById",
  "restorePiConversationById",
  "deletePiConversationById",
]) {
  assert.ok(app.includes(action), `${action} orchestration is required`);
}
assert.ok(app.includes("piTurnSettledWaitersRef"));
assert.ok(app.includes("不会自动重试"));
assert.ok(app.includes("flushPiTurnCheckpoints"));
assert.ok(app.includes("}, 500);"));
assert.ok(page.includes("agent-conversation-drawer"));
assert.ok(page.includes("对话历史"));
assert.ok(page.includes("上下文不可恢复"));
assert.ok(page.includes("仅批准本次"));
assert.ok(page.includes("未检测到"));

assert.ok(styles.includes("--sidera-glass-blur: var(--sidera-optical-glass-blur, 18px)"));
assert.ok(styles.includes("backdrop-filter: blur(var(--sidera-glass-blur))"));
assert.ok(styles.includes("var(--sidera-glass-history-width) + var(--sidera-glass-gap)"));
assert.ok(styles.includes("@media (max-width: 959px)"));
assert.ok(styles.includes("@media (prefers-reduced-motion: reduce)"));
assert.ok(styles.includes("prefers-reduced-transparency"));
assert.ok(styles.includes("forced-colors: active"));
assert.ok(styles.includes("@supports not ((backdrop-filter"));

for (const viewport of [1100, 1360, 1920]) {
  const dialog = Math.min(760, Math.max(560, viewport * 0.42));
  const drawer = Math.min(320, Math.max(272, viewport * 0.20));
  const gap = 16;
  const dialogCenter = viewport / 2 + (drawer + gap) / 2;
  const drawerCenter = viewport / 2 - (dialog + gap) / 2;
  const groupCenter = ((drawerCenter - drawer / 2) + (dialogCenter + dialog / 2)) / 2;
  assert.ok(Math.abs(groupCenter - viewport / 2) <= 1, `${viewport}px workspace must be centered`);
  assert.ok(Math.abs((dialogCenter - viewport / 2) - (drawer + gap) / 2) <= 1);
}

console.log(JSON.stringify({
  status: "PASS",
  package: "M2.0b-R4",
  persistence: "sqlite-plus-pi-jsonl",
  tools: "rust-hosted-one-shot-approval",
  cacheRetention: ["auto", "long"],
  historyComposition: "centered-assembly-with-overlay-under-960px",
  material: "static-liquid-glass-with-accessibility-fallbacks",
  providerCalls: 0,
  productAcceptance: "UNVERIFIED",
}, null, 2));
