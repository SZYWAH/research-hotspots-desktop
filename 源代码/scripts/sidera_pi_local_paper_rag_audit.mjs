import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const rustRuntime = await readFile(path.join(root, "src-tauri", "src", "sidera_pi_runtime.rs"), "utf8");
const ragRuntime = await readFile(path.join(root, "src-tauri", "src", "sidera_rag.rs"), "utf8");
const extensionPath = path.join(root, "src-tauri", "resources", "sidera_pi_paper_tools.ts");
const extensionSource = await readFile(extensionPath, "utf8");
const frontendBridge = await readFile(path.join(root, "src", "lib", "sideraPi.ts"), "utf8");
const appSource = await readFile(path.join(root, "src", "App.tsx"), "utf8");

const expectedTools = [
  "sidera_get_library_overview",
  "sidera_search_local_papers",
  "sidera_get_papers_by_ids",
  "sidera_finalize_evidence",
];

for (const tool of expectedTools) {
  assert.ok(extensionSource.includes(`"${tool}"`), `extension must register ${tool}`);
  assert.ok(rustRuntime.includes(tool), `Rust runtime must whitelist ${tool}`);
}
for (const forbidden of ["bash", "read", "write", "edit", "web_search"]) {
  assert.ok(!extensionSource.includes(`name: "${forbidden}"`), `extension must not register ${forbidden}`);
}
for (const flag of [
  "--no-builtin-tools",
  "--no-extensions",
  "--no-skills",
  "--no-prompt-templates",
  "--no-context-files",
  "--no-approve",
]) {
  assert.ok(rustRuntime.includes(`"${flag}"`), `Pi runtime must pass ${flag}`);
}
assert.ok(rustRuntime.includes("SIDERA_PI_TOOL_NONCE"), "tool bridge must use a per-session nonce");
assert.ok(rustRuntime.includes("toolCallId"), "tool bridge must bind requests to a Pi tool call");
assert.ok(rustRuntime.includes("extension_ui_response"), "Rust must answer the Pi extension UI bridge");
assert.ok(ragRuntime.includes("SQLITE_OPEN_READ_ONLY"), "RAG database access must be read-only");
assert.ok(ragRuntime.includes("0.55 /"), "semantic RRF weight must remain 0.55");
assert.ok(ragRuntime.includes("0.45 /"), "lexical RRF weight must remain 0.45");
assert.ok(ragRuntime.includes("MAX_ABSTRACT_CHARS: usize = 4_000"));
assert.ok(ragRuntime.includes("MAX_TOOL_RESULT_BYTES: usize = 128 * 1024"));
assert.ok(frontendBridge.includes('type: "tool-stage"'), "frontend must standardize tool stages");
assert.ok(appSource.includes("event.entityRefs"), "turn completion must attach verified references");

process.env.SIDERA_PI_TOOL_NONCE = "audit-nonce";
const extension = await import(`${new URL(`file:///${extensionPath.replaceAll("\\", "/")}`).href}?audit=${Date.now()}`);
const registered = [];
extension.default({ registerTool(tool) { registered.push(tool); } });
assert.deepEqual(registered.map((tool) => tool.name), expectedTools);
for (const tool of registered) {
  assert.equal(tool.parameters?.additionalProperties, false, `${tool.name} must reject unknown fields`);
  assert.equal(typeof tool.execute, "function", `${tool.name} must provide an execute function`);
}

console.log(JSON.stringify({
  status: "PASS",
  tools: expectedTools,
  builtInTools: "disabled",
  databaseMode: "read-only",
  retrieval: "weighted-rrf-e5-like",
  semanticWeight: 0.55,
  lexicalWeight: 0.45,
  citations: "turn-scoped-read-evidence-only",
}, null, 2));
