import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const app = read("src/App.tsx");
const styles = read("src/index.css");
const sideSheet = read("src/components/WorkbenchSideSheet.tsx");
const sideSheetStyles = read("src/components/WorkbenchSideSheet.css");
const institution = read("src/lib/sideraInstitution.ts");
const packageText = read("package.json");

const checks = [];
function check(name, passed, detail) {
  checks.push({ name, passed: Boolean(passed), detail });
}
function includes(name, source, token) {
  check(name, source.includes(token), token);
}
function matches(name, source, pattern) {
  check(name, pattern.test(source), pattern.toString());
}
function section(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  if (start < 0) return "";
  const end = source.indexOf(endMarker, start + startMarker.length);
  return source.slice(start, end < 0 ? undefined : end);
}

const sharedChrome = section(
  app,
  "<div ref={literaturePageRef}",
  "<InstitutionResourceWorkspace",
);
check("shared-workbench-chrome-is-present", sharedChrome.length > 0, "literaturePageRef -> institution tab body");
includes("shared-workbench-heading", sharedChrome, "<h1>文献工作台</h1>");
includes("shared-workbench-tab-navigation", sharedChrome, 'className="literature-tabs"');
for (const tab of [
  '["library", "本地文献库"]',
  '["institution", "机构资源"]',
  '["ingest", "检索与导入"]',
  '["analysis", "批量分析"]',
]) {
  includes(`shared-tab:${tab}`, sharedChrome, tab);
}
matches("shared-compact-chrome-tokens", styles, /\.literature-workspace-page\s*\{[^}]*--literature-workbench-control-height:\s*36px;[^}]*--literature-workbench-surface-border:[^}]*--literature-workbench-surface-background:[^}]*--literature-workbench-surface-radius:/s);
matches("shared-compact-heading", styles, /\.literature-workspace-page\s*>\s*\.page-header\s+h1\s*\{[^}]*font-size:\s*20px;[^}]*line-height:\s*1\.2;/s);
matches("shared-secondary-heading-copy-is-hidden", styles, /\.literature-workspace-page\s*>\s*\.page-header\s+\.eyebrow,\s*\.literature-workspace-page\s*>\s*\.page-header\s+\.page-subtitle\s*\{[^}]*display:\s*none;/s);
matches("shared-four-column-tabs", styles, /\.literature-tabs\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\);[^}]*width:\s*min\(100%,\s*720px\);[^}]*min-height:\s*36px;/s);
matches("shared-tab-size", styles, /\.literature-tab\s*\{[^}]*min-height:\s*30px;[^}]*font-size:\s*12px;/s);
check(
  "institution-has-no-private-header-or-tab-sizing",
  !/\.literature-workspace-institution\s*>\s*\.(?:page-header|literature-tabs)|\.literature-workspace-institution[^,{]*\.literature-tab/.test(styles),
  "no institution-scoped page-header/literature-tabs/literature-tab selector",
);
for (const [surface, pattern] of [
  [".library-status-line", /\.library-status-line\s*\{[^}]*--literature-workbench-surface-/s],
  [".library-toolbar-sticky", /\.library-toolbar-sticky\s*\{[^}]*--literature-workbench-surface-/s],
  [".institution-primary-command", /\.institution-primary-command,\s*\.institution-connection-strip\s*\{[^}]*--literature-workbench-surface-/s],
  [".institution-connection-strip", /\.institution-primary-command,\s*\.institution-connection-strip\s*\{[^}]*--literature-workbench-surface-/s],
  [".research-search-truth", /\.research-search-truth\s*\{[^}]*--literature-workbench-surface-/s],
]) matches(`shared-surface-token:${surface}`, styles, pattern);

includes("side-sheet-component-imported", app, 'from "./components/WorkbenchSideSheet"');
includes("side-sheet-content-uses-content-only-class", app, 'bodyClassName="institution-connection-drawer-content"');
check(
  "legacy-full-height-drawer-css-is-removed",
  !styles.includes(".institution-connection-drawer-backdrop") && !styles.includes(".institution-connection-drawer {"),
  "no legacy 42% backdrop or full-height drawer geometry",
);
includes("side-sheet-stays-mounted", sideSheet, 'data-open={open ? "true" : "false"}');
includes("side-sheet-layer", sideSheet, 'className="workbench-side-sheet-layer"');
includes("side-sheet-dialog", sideSheet, 'className="workbench-side-sheet"');
includes("side-sheet-title-association", sideSheet, "aria-labelledby={titleId}");
includes("side-sheet-description-association", sideSheet, "aria-describedby={descriptionId}");
includes("side-sheet-modal-semantics", sideSheet, 'aria-modal="true"');
includes("closed-side-sheet-is-inert", sideSheet, "inert={!open}");
check("closed-side-sheet-does-not-use-stale-aria-hidden-toggle", !sideSheet.includes("aria-hidden={open ?"), "inert owns closed-tree interactivity");

matches("floating-sheet-layer-inset", sideSheetStyles, /\.workbench-side-sheet-layer\s*\{[^}]*inset:\s*var\(--sidera-titlebar-height(?:,\s*\d+px)?\)\s+0\s+0;[^}]*padding:\s*(?:14|16|18)px;/s);
matches("floating-sheet-does-not-stretch-full-height", sideSheetStyles, /\.workbench-side-sheet-layer\s*\{[^}]*align-items:\s*start;[\s\S]*?\.workbench-side-sheet\s*\{[^}]*max-height:\s*100%;/s);
matches("floating-sheet-width", sideSheetStyles, /\.workbench-side-sheet\s*\{[^}]*width:\s*clamp\(380px,\s*27vw,\s*420px\);/s);
matches("floating-sheet-rounded-on-all-sides", sideSheetStyles, /\.workbench-side-sheet\s*\{[^}]*border:\s*1px\s+solid[^}]*border-radius:\s*(?:16|17|18)px;/s);
matches("floating-sheet-light-backdrop", sideSheetStyles, /\.workbench-side-sheet-layer\[data-open="true"\]\s*\{[^}]*background(?:-color)?:\s*rgba\(0,\s*0,\s*0,\s*0\.(?:1[2-8])\);/s);
check(
  "side-sheet-has-one-local-black-surface-token",
  (sideSheetStyles.match(/--workbench-side-sheet-surface\s*:/g) ?? []).length === 1
    && sideSheetStyles.includes("--workbench-side-sheet-surface: #000;"),
  "one local --workbench-side-sheet-surface declaration at #000",
);
matches("side-sheet-panel-uses-black-surface-token", sideSheetStyles, /\.workbench-side-sheet\s*\{[^}]*--workbench-side-sheet-surface:\s*#000;[^}]*background:\s*var\(--workbench-side-sheet-surface\);/s);
matches("side-sheet-header-uses-black-surface-token", sideSheetStyles, /\.workbench-side-sheet__header\s*\{[^}]*background:\s*var\(--workbench-side-sheet-surface\);/s);
matches("side-sheet-close-uses-black-surface-token", sideSheetStyles, /\.workbench-side-sheet__close\s*\{[^}]*background:\s*var\(--workbench-side-sheet-surface\);/s);
matches("side-sheet-capability-group-uses-black-surface-token", sideSheetStyles, /\.workbench-side-sheet\s+\.institution-capability-list\s*\{[^}]*background:\s*var\(--workbench-side-sheet-surface,\s*#000\);/s);
matches("side-sheet-body-remains-transparent", sideSheetStyles, /\.workbench-side-sheet\s*>\s*\.workbench-side-sheet__body\s*\{[^}]*background:\s*transparent;/s);
check(
  "side-sheet-old-tinted-surfaces-are-removed",
  !sideSheetStyles.includes("rgba(5, 9, 14, 0.97)")
    && !sideSheetStyles.includes("linear-gradient(150deg, rgb(var(--color-cyan) / 0.035)")
    && !sideSheetStyles.includes("linear-gradient(180deg, rgb(255 255 255 / 0.018)"),
  "no legacy cyan panel wash or white header wash",
);
matches("side-sheet-close-keeps-semantic-hover", sideSheetStyles, /\.workbench-side-sheet__close:is\(:hover,\s*:focus-visible\)\s*\{[^}]*background:\s*rgb\(var\(--color-cyan\)\s*\/\s*0\.07\);/s);
matches("closed-sheet-does-not-capture-input", sideSheetStyles, /\.workbench-side-sheet-layer\s*\{[^}]*visibility:\s*hidden;[^}]*pointer-events:\s*none;/s);
check(
  "floating-sheet-does-not-use-backdrop-filter",
  !/\.workbench-side-sheet(?:-layer)?[^{}]*\{[^}]*backdrop-filter\s*:/s.test(sideSheetStyles),
  "no backdrop-filter on the full sheet layer or panel",
);
matches("sheet-animates-transform-and-opacity", sideSheetStyles, /\.workbench-side-sheet\s*\{[^}]*transition:[^;}]*transform[^;}]*opacity|\.workbench-side-sheet\s*\{[^}]*transition:[^;}]*opacity[^;}]*transform/s);
matches("sheet-closed-state-transforms", sideSheetStyles, /\.workbench-side-sheet\s*\{[^}]*opacity:\s*0;[^}]*transform:\s*translate3d\(/s);
matches("sheet-open-state-is-visible", sideSheetStyles, /\.workbench-side-sheet-layer\[data-open="true"\]\s*\{[^}]*visibility:\s*visible;[\s\S]*?\.workbench-side-sheet-layer\[data-open="true"\]\s+\.workbench-side-sheet\s*\{[^}]*opacity:\s*1;[^}]*transform:/s);
matches("narrow-layout-becomes-bottom-sheet", sideSheetStyles, /@media\s*\(max-width:\s*720px\)[\s\S]*?\.workbench-side-sheet-layer\s*\{[^}]*align-items:\s*(?:end|flex-end);[\s\S]*?\.workbench-side-sheet\s*\{[^}]*width:\s*100%;[^}]*max-height:/s);
matches("reduced-motion-is-supported", sideSheetStyles, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.workbench-side-sheet[^}]*\{[^}]*transition(?:-duration)?:\s*(?:none|0\.01ms)/s);

includes("escape-close", sideSheet, 'event.key === "Escape"');
includes("tab-focus-trap", sideSheet, 'event.key !== "Tab"');
matches("focus-enters-dialog", sideSheet, /closeButtonRef\.current\?\.focus\(\{\s*preventScroll:\s*true\s*\}\)/s);
includes("focus-constraint-listens-to-focusin", sideSheet, 'document.addEventListener("focusin"');
matches("focus-restores-previous-control", sideSheet, /previousFocus(?:Ref\.current)?[^;\n]*\.focus\(\{\s*preventScroll:\s*true\s*\}\)/s);
matches("outside-pointer-closes", sideSheet, /const\s+closeFromBackdrop[\s\S]*?event\.target\s*===\s*event\.currentTarget[\s\S]*?onOpenChange\(false\)[\s\S]*?onPointerDown=\{closeFromBackdrop\}/s);
includes("explicit-x-close", app, 'closeLabel="关闭连接与来源"');
includes("app-uses-side-sheet", app, "<WorkbenchSideSheet");
includes("app-provides-side-sheet-title", app, 'title="连接与来源"');

matches("capabilities-use-one-grouped-surface", styles, /\.institution-capability-list\s*\{[^}]*overflow:\s*hidden;[^}]*border:\s*1px\s+solid[^}]*border-radius:\s*11px;[^}]*background:/s);
matches("capability-rows-use-dividers", styles, /\.institution-capability-list\s*>\s*div\s*\{[^}]*border-bottom:\s*1px\s+solid[\s\S]*?\.institution-capability-list\s*>\s*div:last-child\s*\{[^}]*border-bottom:\s*0;/s);
matches("capability-status-is-a-pill", styles, /\.institution-capability-list\s+strong\s*\{[^}]*border:\s*1px\s+solid[^}]*border-radius:\s*999px;[^}]*background:/s);
matches("clear-session-action-is-explicitly-dangerous", app, /className="danger-action"[\s\S]*?resetInstitutionSession\(\)[\s\S]*?>显式清除机构会话<\/button>/s);
matches("clear-session-danger-style-is-sheet-scoped", styles, /\.institution-connection-drawer-content\s*>\s*footer\s+button\.danger-action\s*\{[^}]*--color-danger[^}]*\}/s);

const browserSurfaceVisibility = section(app, "const browserSurfaceVisible", "const workspaceStyle");
check("browser-surface-visibility-expression-is-present", browserSurfaceVisibility.length > 0, "browserSurfaceVisible -> workspaceStyle");
includes("drawer-transition-holds-native-browser-surface-hidden", browserSurfaceVisibility, "&& !connectionDrawerSurfaceHeld");
includes("browser-presentation-state-remains-the-authority", browserSurfaceVisibility, 'browserPresentation !== "closed"');
check(
  "drawer-visibility-gate-does-not-mutate-browser-presentation",
  !/setBrowserPresentation|onBrowserPresentationChange/.test(browserSurfaceVisibility),
  browserSurfaceVisibility,
);
const nativeSurfaceVisibilityReconciler = section(
  app,
  "const reconcileBrowserSurfaceVisibility",
  "async function setBrowserPresentation",
);
check(
  "native-shell-visibility-reconciler-is-present",
  nativeSurfaceVisibilityReconciler.length > 0,
  "reconcileBrowserSurfaceVisibility -> setBrowserPresentation",
);
includes(
  "native-shell-reconciler-invokes-presentation-only-command",
  nativeSurfaceVisibilityReconciler,
  "setSideraInstitutionBrowserShellVisible(visible)",
);
matches(
  "native-shell-reconciler-verifies-physical-state",
  nativeSurfaceVisibilityReconciler,
  /if \(next\.visible !== visible\)/,
);
const nativeSurfaceVisibilityEffect = app.match(/useLayoutEffect\(\(\)\s*=>\s*\{[\s\S]{0,260}?reconcileBrowserSurfaceVisibility\(browserSurfaceVisible\)[\s\S]{0,220}?\},\s*\[browserSurfaceVisible,\s*reconcileBrowserSurfaceVisibility\]\);/)?.[0] ?? "";
check("drawer-reuses-native-shell-visibility-effect", nativeSurfaceVisibilityEffect.length > 0, "reconcileBrowserSurfaceVisibility(browserSurfaceVisible)");
check(
  "native-shell-visibility-effect-has-no-business-ipc",
  !/beginSideraInstitutionConnection|startSideraResearchSearch|cancelSideraInstitutionConnection|cancelSideraResearchSearch|\binvoke\s*\(/.test(`${nativeSurfaceVisibilityReconciler}\n${nativeSurfaceVisibilityEffect}`),
  "presentation-only shell visibility wrapper is allowed",
);

const drawerPresentationHandler = section(
  app,
  "const setConnectionDrawerPresentation",
  "useEffect(() => () =>",
);
check("unified-drawer-presentation-handler-is-present", drawerPresentationHandler.length > 0, "setConnectionDrawerPresentation -> timer cleanup effect");
matches("drawer-open-holds-webview-before-presentation", drawerPresentationHandler, /if \(open\) \{\s*setConnectionDrawerSurfaceHeld\(true\);\s*setConnectionDrawerOpen\(true\);/s);
matches("drawer-close-keeps-webview-hidden-through-exit", drawerPresentationHandler, /setConnectionDrawerOpen\(false\);[\s\S]*?window\.setTimeout\(\(\) => \{\s*setConnectionDrawerSurfaceHeld\(false\);/s);
includes("drawer-exit-release-is-reduced-motion-aware", drawerPresentationHandler, 'window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 230');
check(
  "drawer-exit-release-is-one-bounded-cleanable-timer",
  (drawerPresentationHandler.match(/window\.setTimeout\s*\(/g) ?? []).length === 1
    && (drawerPresentationHandler.match(/window\.clearTimeout\s*\(/g) ?? []).length === 1
    && !/setInterval|requestAnimationFrame/.test(drawerPresentationHandler),
  "one 0/230ms timeout; prior timeout cleared; no interval or RAF loop",
);
check(
  "drawer-presentation-handler-has-no-business-ipc",
  !/beginSideraInstitutionConnection|startSideraResearchSearch|cancelSideraInstitutionConnection|cancelSideraResearchSearch|\binvoke\s*\(/.test(drawerPresentationHandler),
  "state and bounded presentation timer only",
);
matches("drawer-release-timer-is-cleared-on-unmount", app, /useEffect\(\(\) => \(\) => \{\s*if \(connectionDrawerReleaseTimerRef\.current !== null\) \{\s*window\.clearTimeout\(connectionDrawerReleaseTimerRef\.current\);\s*\}\s*\}, \[\]\);/s);
check(
  "no-drawer-path-bypasses-unified-handler",
  (app.match(/setConnectionDrawerOpen\s*\(/g) ?? []).length === 2,
  "the raw open setter is called only by the unified handler",
);
const drawerContent = section(app, "<WorkbenchSideSheet", "</WorkbenchSideSheet>");
matches("show-or-focus-browser-also-closes-drawer", drawerContent, /void showCurrentInstitutionPage\(\);\s*setConnectionDrawerPresentation\(false\);/s);

check("side-sheet-has-no-tauri-invoke", !/\binvoke\s*\(/.test(sideSheet), "presentation component contains no invoke call");
const focusFrameRequests = sideSheet.match(/requestAnimationFrame\s*\(/g) ?? [];
check(
  "side-sheet-has-no-continuous-animation-frame-loop",
  focusFrameRequests.length <= 1 && (focusFrameRequests.length === 0 || sideSheet.includes("cancelAnimationFrame(focusFrame)")),
  `${focusFrameRequests.length} one-shot focus frame(s); no render loop`,
);
matches("sheet-trigger-uses-unified-presentation-handler", app, /aria-controls="institution-connections-sheet"[\s\S]*?onClick=\{\(\)\s*=>\s*setConnectionDrawerPresentation\(true\)\}/s);
includes("sheet-trigger-exposes-expanded-state", app, "aria-expanded={connectionDrawerOpen}");
includes("sheet-close-uses-unified-presentation-handler", app, "onOpenChange={setConnectionDrawerPresentation}");

for (const command of [
  "sidera_institution_connection_begin",
  "sidera_institution_connection_cancel",
  "sidera_research_search_start",
  "sidera_research_search_cancel",
  "sidera_research_search_snapshot",
]) {
  includes(`preserved-command:${command}`, institution, `"${command}"`);
}

const pkg = JSON.parse(packageText);
check(
  "package-exposes-visual-r2-audit",
  pkg.scripts["audit:sidera-workbench-visual-r2"] === "node scripts/sidera_workbench_visual_r2_audit.mjs",
  pkg.scripts["audit:sidera-workbench-visual-r2"],
);

const failed = checks.filter((entry) => !entry.passed);
const result = {
  audit: "sidera-workbench-visual-r2",
  status: failed.length === 0 ? "PASS" : "FAIL",
  checkCount: checks.length,
  checks,
  failedChecks: failed,
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (failed.length > 0) process.exitCode = 1;
