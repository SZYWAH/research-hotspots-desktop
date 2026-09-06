import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const read = (file) => readFile(path.join(root, file), "utf8");
const [app, page, styles, composerLayout, packageText] = await Promise.all([
  read("src/App.tsx"),
  read("src/components/AgentDualBackgroundPage.tsx"),
  read("src/components/AgentDualBackgroundPage.css"),
  read("src/lib/sideraComposerLayout.ts"),
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
  /const submitPrompt = \(\) => \{[\s\S]*?if \(!text \|\| conversationGenerating\) return;[\s\S]*?requestDialogCollapsed\(false, true\);[\s\S]*?onPromptSubmit\?\.\(event\);/u,
  "a valid prompt must restore the reading panel before provider submission",
);
assert.ok(page.includes("const dialogVisuallyCollapsed = dialogCollapsed && !dialogExploreVisible;"));
for (const phase of ["visible", "fading-out", "geometry", "settling", "fading-in"]) {
  assert.ok(page.includes(`| "${phase}"`) || page.includes(`= "${phase}"`), `${phase} motion phase is required`);
}
assert.ok(page.includes("SIDERA_DIALOG_FADE_OUT_MS = 140"));
assert.ok(page.includes("SIDERA_DIALOG_GEOMETRY_FALLBACK_MS = 500"));
assert.ok(page.includes("SIDERA_DIALOG_FADE_IN_MS = 180"));
assert.ok(page.includes('dialog.addEventListener("transitionend"'));
assert.ok(page.includes("dialogMotionEpochRef.current"));
assert.ok(page.includes("waitForSideraPaintFrames(sideraPrefersReducedMotion() ? 1 : 2)"));
assert.ok(page.includes('className="agent-dual-dialog__reading-shell"'));
assert.ok(page.includes('className="agent-dual-dialog__approval-shell"'));
assert.ok(page.includes('className="agent-dual-dialog__footer-shell"'));
assert.ok(!page.includes("!dialogExploreVisible && !dialogCollapsed ? ("), "reading content must stay mounted while collapsed");
assert.match(
  styles,
  /\.agent-dual-dialog__reading-shell,[\s\S]*?\.agent-dual-dialog__approval-shell,[\s\S]*?\.agent-dual-dialog__footer-shell\s*\{[\s\S]*?min-height: 0;[\s\S]*?overflow: hidden;[\s\S]*?grid-template-rows: minmax\(0, 1fr\);/u,
  "mounted reading, approval, and footer shells must be intrinsically collapsible",
);
assert.match(
  styles,
  /\.agent-dual-dialog--collapsed \.agent-dual-dialog__reading-shell,[\s\S]*?\.agent-dual-dialog--collapsed \.agent-dual-dialog__approval-shell,[\s\S]*?\.agent-dual-dialog--collapsed \.agent-dual-dialog__footer-shell\s*\{[\s\S]*?grid-template-rows: minmax\(0, 0fr\);/u,
  "collapsed mounted shells must have a true zero minimum so child padding cannot lift the composer",
);
assert.match(styles, /\[data-dialog-motion="fading-out"\][\s\S]*?opacity: 0;[\s\S]*?transition-duration: 140ms;/u);
assert.ok(!/\.agent-dual-dialog\s*>\s*\*[\s\S]{0,500}?scale\(/u.test(styles), "dialog text must never be scaled");

assert.match(page, /<textarea[\s\S]*?ref=\{composerTextareaRef\}[\s\S]*?rows=\{1\}/u);
assert.ok(page.includes("resolveSideraComposerHeight(textarea.value, textarea.scrollHeight)"));
assert.ok(page.includes("useLayoutEffect(() =>"), "composer measurement must run before paint");
for (const dependency of [
  "dialogCollapsed",
  "dialogMotionPhase",
  "draft",
  "passiveWindowResizeActive",
  "windowGeometryTransitionActive",
]) {
  assert.ok(page.includes(dependency), `${dependency} must participate in composer remeasurement`);
}
assert.ok(composerLayout.includes("value.length === 0"));
assert.ok(composerLayout.includes("SIDERA_COMPOSER_MIN_HEIGHT_PX = 42"));
assert.ok(composerLayout.includes("SIDERA_COMPOSER_MAX_HEIGHT_PX = 100"));
assert.ok(composerLayout.includes("SIDERA_COMPOSER_TRACK_PADDING_BLOCK_PX = 6"));
assert.ok(composerLayout.includes("SIDERA_COMPOSER_TEXTAREA_MIN_HEIGHT_PX = 20"));
assert.ok(page.includes('className="agent-dual-dialog__composer-track"'));
assert.match(
  styles,
  /\.agent-dual-dialog__composer-track\s*\{[\s\S]*?align-items: center;[\s\S]*?min-height: 42px;[\s\S]*?max-height: 100px;[\s\S]*?padding: 6px 0;/u,
);
assert.match(
  styles,
  /\.agent-dual-dialog__composer-track textarea\s*\{[\s\S]*?height: 20px;[\s\S]*?min-height: 20px;[\s\S]*?max-height: 88px;[\s\S]*?align-self: center;[\s\S]*?padding: 0;[\s\S]*?line-height: 20px;/u,
);
assert.match(
  styles,
  /\.agent-dual-dialog--collapsed \.agent-dual-dialog__composer\s*\{[\s\S]*?height: auto;[\s\S]*?min-height: 42px;[\s\S]*?max-height: 100px;[\s\S]*?overflow: hidden;/u,
);
assert.match(
  styles,
  /\.agent-dual-dialog--collapsed \.agent-dual-dialog__composer-track\s*\{[\s\S]*?grid-template-columns: 30px 30px minmax\(0, 1fr\) 32px;/u,
);
assert.match(
  styles,
  /\.agent-dual-dialog--collapsed\s*\{[\s\S]*?top: calc\(100% - 21px\);[\s\S]*?transform: translate\(-50%, -100%\);/u,
  "the collapsed composer must remain bottom-anchored while growing upward",
);
assert.match(
  styles,
  /\.agent-dual-dialog__composer-track > button\s*\{[\s\S]*?width: 30px;[\s\S]*?height: 30px;[\s\S]*?align-self: center;/u,
);
assert.ok(!styles.includes("agent-composer-optical-offset-y"));

assert.match(
  styles,
  /\.sidera-user-record\s*\{[\s\S]*?border: 0;[\s\S]*?background: none;[\s\S]*?box-shadow: none;[\s\S]*?text-align: right;/u,
  "user messages must not render a rectangular emphasis surface",
);

assert.ok(app.includes('type AppNoticeKind = "success" | "info" | "error";'));
assert.ok(app.includes("const [notice, setNotice] = useState<AppNotice | null>(null);"));
assert.ok(app.includes("if (!notice) return undefined;"));
assert.ok(app.includes('?? (notice.kind === "error" ? undefined : 3000)'));
assert.ok(app.includes("if (dismissAfterMs === undefined) return undefined;"));
assert.ok(app.includes("}, dismissAfterMs);"));
assert.ok(app.includes("current?.id === noticeId ? null : current"));
assert.ok(app.includes('role={notice.kind === "error" ? "alert" : "status"}'));
assert.ok(app.includes('showNotice("设置已保存。", "success");'));
assert.ok(app.includes('onNotice(error instanceof Error ? error.message : "设置保存失败。", "error");'));

console.log(JSON.stringify({
  status: "PASS",
  package: "M2.0b-R3",
  dialog: "collapsed-composer-to-fixed-reading",
  motion: "fade-out-geometry-two-raf-fade-in",
  composer: { minHeightPx: 42, maxHeightPx: 100, lineHeightPx: 20, emptyValueIgnoresPlaceholder: true },
  userMessageSurface: "none",
  noticeLifecycle: { successMs: 3000, infoMs: 3000, error: "sticky" },
  productAcceptance: "UNVERIFIED",
}, null, 2));
