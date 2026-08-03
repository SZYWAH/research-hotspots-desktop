import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const read = (file) => readFile(path.join(root, file), "utf8");
const [app, page, styles, markdown, bridge, focus, rust, rag, extension, packageText] = await Promise.all([
  read("src/App.tsx"),
  read("src/components/AgentDualBackgroundPage.tsx"),
  read("src/components/AgentDualBackgroundPage.css"),
  read("src/components/SideraMarkdown.tsx"),
  read("src/lib/sideraPi.ts"),
  read("src/lib/sideraFocus.ts"),
  read("src-tauri/src/sidera_pi_runtime.rs"),
  read("src-tauri/src/sidera_rag.rs"),
  read("src-tauri/resources/sidera_pi_paper_tools.ts"),
  read("package.json"),
]);
const pkg = JSON.parse(packageText);

assert.ok(focus.includes("type SideraConversationTurn"), "root turn contract is required");
assert.ok(app.includes("piConversationTurns"), "App must own the runtime conversation turns");
assert.ok(!page.includes("submittedPrompts"), "page-local submitted prompt history must be removed");
assert.ok(page.includes("visibleConversationTurns.map"), "turns must render in one ordered loop");
assert.ok(page.includes("sidera-user-record"), "user records must render inside each turn");
assert.ok(page.includes("<SideraMarkdown"), "assistant prose must use the safe Markdown renderer");

assert.equal(pkg.dependencies["react-markdown"], "10.1.0");
assert.equal(pkg.dependencies["remark-gfm"], "4.0.1");
assert.ok(markdown.includes("skipHtml"), "raw HTML must remain disabled");
assert.ok(markdown.includes("components={{"), "Markdown elements must be rendered through controlled components");
assert.ok(!markdown.includes("rehypeRaw"), "raw HTML plugins are forbidden");
assert.ok(markdown.includes("img: () => null"), "images must be suppressed");
assert.ok(markdown.includes("if (!safeHref)"), "unsafe links must be downgraded to text");
assert.ok(styles.includes("clamp(560px, 42vw, 760px)"), "reading preset width must be locked");
assert.ok(styles.includes("min(56vh, 580px)"), "reading history height must be locked");
assert.ok(!page.includes("agent-dual-dialog__resize-handle"), "custom resize handle must be removed");
assert.ok(!page.includes("research-agent:sidera-dialog-layout:v1"), "obsolete layout preferences must not be read");
assert.ok(!page.includes("SideraDialogLayoutPreference"), "obsolete layout preference types must be removed");
assert.ok(page.includes("setDialogCollapsed(false);"), "a valid submission must restore the reading panel");
assert.ok(page.includes("rows={1}"), "the conversation composer must use a one-row baseline");

assert.ok(extension.includes('"sidera_get_library_overview"'), "overview tool must be registered");
assert.ok(rag.includes("OVERVIEW_TOOL"), "overview tool must be in the Rust whitelist");
assert.ok(rag.includes("SQLITE_OPEN_READ_ONLY"), "library overview must use the read-only database path");
assert.ok(rag.includes("COUNT(DISTINCT field)"), "overview must count fields directly");
assert.ok(rust.includes('"type": "steer"'), "read evidence must trigger the internal evidence steer");
assert.ok(rust.includes("steer_sent"), "the evidence steer must be turn-bounded");
assert.ok(rust.includes('event_type == "toolcall_start"'), "tool-process prose must be hidden from toolcall start");
assert.ok(rust.includes("SideraAssistantStreamGate"), "tool-process prose must use the event-driven stream gate");
assert.ok(rust.includes("evidence_gate_status"), "turn completion must expose the evidence gate");
assert.ok(bridge.includes('"reading-library-overview"'), "frontend must expose the safe overview stage");
assert.ok(bridge.includes("SideraEvidenceGateStatus"), "frontend gate status contract is required");

console.log(JSON.stringify({
  status: "PASS",
  conversation: "root-owned-turns",
  markdown: "safe-gfm",
  dialog: ["collapsed-composer", "fixed-reading"],
  overviewTool: "read-only-project-scoped",
  evidenceGate: "event-gate-steer-finalize",
}, null, 2));
