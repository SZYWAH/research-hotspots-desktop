import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const read = (file) => readFile(path.join(root, file), "utf8");
const [app, globalStyles, dialogStyles, page, cargoManifest, harnessManifest, packageText] = await Promise.all([
  read("src/App.tsx"),
  read("src/index.css"),
  read("src/components/AgentDualBackgroundPage.css"),
  read("src/components/AgentDualBackgroundPage.tsx"),
  read("src-tauri/Cargo.toml"),
  read("src-tauri/conversation-store-test-harness/Cargo.toml"),
  read("package.json"),
]);
const pkg = JSON.parse(packageText);

assert.equal(
  pkg.scripts["audit:sidera-agent-conversation-r4-r2"],
  "node scripts/sidera_agent_conversation_r4_r2_audit.mjs",
);
assert.equal(
  pkg.scripts["test:sidera-conversation-store"],
  "cargo test --manifest-path src-tauri/Cargo.toml -p sidera-conversation-store-test-harness -j 2 -- --nocapture",
);

assert.ok(!app.includes('if (activeView === "agent") return;\n    const active = piActiveTurnRef.current;'));
assert.ok(!app.includes('if (activeView === "agent") return;\r\n    const active = piActiveTurnRef.current;'));
assert.ok(app.includes("resolveSideraAgentActivity"));
assert.ok(app.includes('label: "Agent 正在回答"'));
assert.ok(app.includes('label: "Agent 等待工具审批"'));
assert.ok(app.includes('label: "Agent 回答已完成"'));
assert.ok(app.includes('label: "Agent 回答失败"'));
assert.ok(app.includes('activeView !== "agent" && titleBarToolsHost'));
assert.ok(app.includes('className="sidera-agent-activity__stop"'));
assert.ok(app.includes('setActiveView("agent")'));
assert.ok(app.includes('if (activeViewRef.current !== "agent") showNotice(message, "error")'));
assert.ok(app.includes("abortSideraPiTurn"), "explicit user/session cancellation must remain available");
assert.ok(app.includes("preparePiConversationChange"), "conversation changes must retain confirmation and cancellation");

for (const token of [
  "--sidera-optical-glass-blur: 18px",
  "--sidera-optical-glass-saturation: 115%",
  "--sidera-optical-glass-fill: rgba(7, 11, 17, 0.34)",
  "--sidera-optical-glass-smoke: rgba(3, 7, 12, 0.58)",
]) {
  assert.ok(globalStyles.includes(token), `${token} shared optical token is required`);
}
assert.ok(globalStyles.includes(".sidera-agent-activity"));
assert.ok(globalStyles.includes("max-width: 88px"), "1100px titlebar must compact the status label");
assert.ok(globalStyles.includes("prefers-reduced-transparency"));
assert.ok(!globalStyles.includes("text-ink/78"), "invalid Tailwind opacity class must not return");

assert.ok(dialogStyles.includes("border-radius: 26px"));
assert.ok(dialogStyles.includes("border-radius: 24px"));
assert.ok(dialogStyles.includes("border-radius: 15px"));
assert.ok(dialogStyles.includes("var(--sidera-glass-smoke)"));
assert.match(
  dialogStyles,
  /\.agent-dual-dialog__history\s*\{[\s\S]*?border-radius: 18px;[\s\S]*?var\(--sidera-glass-smoke\);/u,
);
assert.match(
  dialogStyles,
  /\.sidera-answer\s*\{[\s\S]*?border: 0;[\s\S]*?background: transparent;/u,
  "assistant turns must not restore nested dark cards",
);
assert.ok(!dialogStyles.includes("radial-gradient(110% 65% at 0% 0%"), "broad top-left gray wash must be removed");
assert.ok(dialogStyles.includes("prefers-reduced-motion"));
assert.ok(dialogStyles.includes("prefers-reduced-transparency"));
assert.ok(dialogStyles.includes("forced-colors: active"));
assert.ok(dialogStyles.includes("@supports not ((backdrop-filter"));
assert.ok(page.includes('`${26 - bounded * 11}px`'), "return geometry must interpolate between 26px and 15px radii");

assert.match(cargoManifest, /\[lib\][\s\S]*?test\s*=\s*false/u, "the Tauri lib test target must remain disabled");
assert.ok(cargoManifest.includes('"conversation-store-test-harness"'));
assert.ok(!harnessManifest.toLowerCase().includes("tauri"), "the canonical conversation harness must remain Tauri-free");
for (const forbidden of ["cargo test --lib", "research_hotspots_desktop_lib-"]) {
  assert.ok(!Object.values(pkg.scripts).some((value) => String(value).includes(forbidden)), `${forbidden} must not be a package script`);
}

console.log(JSON.stringify({
  status: "PASS",
  package: "M2.0b-R4-R2",
  navigation: "background-turn-continuity",
  titlebarActivity: ["generating", "awaiting-approval", "complete", "failed"],
  material: "clear-optical-shell-with-continuous-smoked-reading-plane",
  conversationTests: "tauri-free-canonical-harness",
  providerCalls: 0,
  productAcceptance: "UNVERIFIED",
}, null, 2));
