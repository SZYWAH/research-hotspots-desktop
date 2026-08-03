import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const read = (file) => readFile(path.join(root, file), "utf8");
const [app, page, styles, packageText] = await Promise.all([
  read("src/App.tsx"),
  read("src/components/AgentDualBackgroundPage.tsx"),
  read("src/components/AgentDualBackgroundPage.css"),
  read("package.json"),
]);
const pkg = JSON.parse(packageText);

assert.equal(
  pkg.scripts["audit:sidera-agent-conversation-ui-r3"],
  "node scripts/sidera_agent_conversation_ui_r3_audit.mjs",
);

for (const obsolete of [
  "SideraDialogLayoutPreference",
  "research-agent:sidera-dialog-layout:v1",
  "agent-dual-dialog__layout-controls",
  "agent-dual-dialog__resize-handle",
  "agent-dual-dialog--compact",
  "agent-dual-dialog--custom",
  "--sidera-dialog-custom-width",
  "--sidera-dialog-history-height",
]) {
  assert.ok(!page.includes(obsolete), `${obsolete} remained in the dialog component`);
  assert.ok(!styles.includes(obsolete), `${obsolete} remained in the dialog styles`);
}

assert.ok(styles.includes("--sidera-glass-dialog-width: clamp(560px, 42vw, 760px);"));
assert.ok(styles.includes("width: var(--sidera-glass-dialog-width);"));
assert.ok(styles.includes("max-height: min(56vh, 580px);"));
for (const viewportWidth of [1100, 1360, 1920]) {
  const resolvedWidth = Math.min(760, Math.max(560, viewportWidth * 0.42));
  assert.ok(resolvedWidth >= 560 && resolvedWidth <= 760);
  assert.ok(resolvedWidth <= viewportWidth - 64);
}

assert.match(
  page,
  /visibleConversationTurns\.length === 0\s*\? true\s*:\s*storedSideraSession\?\.dialogCollapsed \?\? false/u,
  "an empty session must start at the collapsed composer",
);
assert.match(
  page,
  /const submitPrompt = \(\) => \{[\s\S]*?if \(!text \|\| conversationGenerating\) return;[\s\S]*?setDialogCollapsed\(false\);[\s\S]*?onPromptSubmit\?\.\(event\);/u,
  "a valid prompt must restore the reading panel before provider submission",
);
assert.ok(page.includes("const dialogVisuallyCollapsed = dialogCollapsed && !dialogExploreVisible;"));

assert.match(page, /<textarea[\s\S]*?ref=\{composerTextareaRef\}[\s\S]*?rows=\{1\}/u);
assert.ok(page.includes('textarea.style.height = "42px";'));
assert.ok(page.includes("Math.min(100, Math.max(42, textarea.scrollHeight))"));
assert.ok(page.includes('textarea.style.overflowY = textarea.scrollHeight > 100 ? "auto" : "hidden";'));
assert.match(
  styles,
  /\.agent-dual-dialog__composer textarea\s*\{[\s\S]*?height: 42px;[\s\S]*?min-height: 42px;[\s\S]*?max-height: 100px;[\s\S]*?padding: 11px 0;[\s\S]*?line-height: 20px;/u,
);
assert.match(
  styles,
  /\.agent-dual-dialog--collapsed\s*\{[\s\S]*?top: calc\(100% - 21px\);[\s\S]*?transform: translate\(-50%, -100%\);/u,
  "the collapsed composer must remain bottom-anchored while growing upward",
);
assert.match(
  styles,
  /\.agent-dual-dialog__composer > button\s*\{[\s\S]*?width: 30px;[\s\S]*?height: 30px;[\s\S]*?align-self: center;/u,
);

assert.match(
  styles,
  /\.sidera-user-record\s*\{[\s\S]*?border: 0;[\s\S]*?background: none;[\s\S]*?box-shadow: none;[\s\S]*?text-align: right;/u,
  "user messages must not render a rectangular emphasis surface",
);

assert.ok(app.includes('type AppNoticeKind = "success" | "info" | "error";'));
assert.ok(app.includes("const [notice, setNotice] = useState<AppNotice | null>(null);"));
assert.ok(app.includes('if (!notice || notice.kind === "error") return undefined;'));
assert.ok(app.includes("}, 3000);"));
assert.ok(app.includes("current?.id === noticeId ? null : current"));
assert.ok(app.includes('role={notice.kind === "error" ? "alert" : "status"}'));
assert.ok(app.includes('showNotice("设置已保存。", "success");'));
assert.ok(app.includes('onNotice(error instanceof Error ? error.message : "设置保存失败。", "error");'));

console.log(JSON.stringify({
  status: "PASS",
  package: "M2.0b-R3",
  dialog: "collapsed-composer-to-fixed-reading",
  composer: { minHeightPx: 42, maxHeightPx: 100, lineHeightPx: 20 },
  userMessageSurface: "none",
  noticeLifecycle: { successMs: 3000, infoMs: 3000, error: "sticky" },
  productAcceptance: "UNVERIFIED",
}, null, 2));
