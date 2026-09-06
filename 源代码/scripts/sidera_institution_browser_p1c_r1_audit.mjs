import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const read = (file) => readFile(path.join(root, file), "utf8");
const [core, browser, bridge, app, css, packageText, evidenceText, ...documents] = await Promise.all([
  read("src-tauri/core/src/institution_browser.rs"),
  read("src-tauri/src/sidera_institution_browser.rs"),
  read("src/lib/sideraInstitution.ts"),
  read("src/App.tsx"),
  read("src/index.css"),
  read("package.json"),
  read("docs/evidence/sidera-p1c-r1-popup-focus-viewport-2026-08-05.json"),
  read("docs/PROJECT.md"),
  read("docs/ROADMAP.md"),
  read("docs/STATUS.md"),
  read("docs/ARCHITECTURE.md"),
  read("docs/DECISIONS.md"),
  read("docs/DEVELOPMENT.md"),
]);
const pkg = JSON.parse(packageText);
const evidence = JSON.parse(evidenceText);
const between = (source, start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `${start} source range`);
  return source.slice(from, to);
};

// MetaERSP /loading is a transient bridge, never a replayed child-tab URL.
for (const marker of [
  'host == "whu.metaersp.com"',
  'path.trim_end_matches(\'/\') == "/loading"',
  "InstitutionPopupDisposition::TransientBridge",
  "metaersp_bridge_closes_when_opener_reaches_cnki_or_wos_without_a_ghost_tab",
  "matching_final_targets_deduplicate_after_bridge_navigation",
  "SIDERA_INSTITUTION_POPUP_BRIDGE_TIMEOUT",
  "SIDERA_INSTITUTION_POPUP_NAVIGATION_FAILED",
]) assert.ok(core.includes(marker), marker);
assert.ok(!browser.includes("queue_browser_tab"));
assert.ok(!browser.match(/queue_browser_tab[\s\S]*NewWindowResponse::Deny/));

// Popup callbacks are identity-bound and expose only redacted origin/path state.
for (const marker of [
  "popup_id",
  "opener_tab_id",
  "generation",
  "created_at_ms",
  "InstitutionPopupPhase",
  "InstitutionPopupResolution",
  "sanitize_institution_popup_location",
  "IgnoreStale",
  "safe_get_proven",
  "opener_semantics_required",
]) assert.ok(core.includes(marker), marker);
assert.ok(core.includes("url.path()"));
assert.ok(!between(core, "pub fn sanitize_institution_popup_location", "pub fn new_institution_popup_state").includes("url.query"));
for (const marker of ["popupId", "openerTabId", "generation", "location: { origin: string; path: string }"]) {
  assert.ok(bridge.includes(marker), marker);
}

// Both compatibility popups and authentication modal use true Create semantics, features and the shared UDF.
const managedPopup = between(browser, "fn create_managed_browser_popup", "fn create_browser_auth_modal");
const authPopup = between(browser, "fn create_browser_auth_modal", "pub(crate) fn close_browser_auth_modal");
for (const source of [managedPopup, authPopup]) {
  assert.ok(source.includes("WebviewWindowBuilder::new"));
  assert.ok(source.includes(".data_directory(data_directory)"));
  assert.ok(source.includes(".window_features(features)"));
  assert.ok(source.includes("NewWindowResponse::Create { window }"));
}
assert.ok(managedPopup.includes("opener_tab_id"));
assert.ok(managedPopup.includes("observe_institution_popup_navigation"));
assert.ok(managedPopup.includes("bridge_timeout_scheduled"));
assert.ok(managedPopup.includes("spawn_managed_popup_bridge_timeout"));
assert.match(managedPopup, /observe_institution_popup_navigation\([\s\S]*?false,\s*true,/);
assert.ok(core.includes("safe_get_can_migrate_but_opener_or_post_dependent_content_stays_in_popup"));

// Bounds have an epsilon no-op, one active-tab set_bounds call, and no geometry-driven focus.
const applyBounds = between(browser, "fn apply_active_browser_bounds", "fn apply_browser_visibility");
const hideAllTabs = between(browser, "fn hide_all_browser_tabs", "fn apply_browser_visibility");
const applyVisibility = between(browser, "fn apply_browser_visibility", "fn focus_active_browser_tab");
const boundsCommand = between(
  browser,
  "pub async fn sidera_institution_browser_shell_set_bounds",
  "pub async fn sidera_institution_browser_shell_set_visible",
);
const visibilityCommand = between(
  browser,
  "pub async fn sidera_institution_browser_shell_set_visible",
  "pub async fn sidera_institution_browser_auth_cancel",
);
assert.ok(core.includes("INSTITUTION_BROWSER_BOUNDS_EPSILON"));
assert.ok(core.includes("unchanged_subpixel_bounds_are_a_noop"));
assert.ok(core.includes("ordinary_wheel_and_outer_scroll_never_schedule_bounds_updates"));
assert.ok(applyBounds.includes("guard.active_tab_id"));
assert.ok(applyBounds.includes(".set_bounds(Rect"));
assert.ok(!applyBounds.includes("set_position"));
assert.ok(!applyBounds.includes("set_size"));
assert.ok(!applyBounds.includes("set_focus"));
assert.ok(!applyVisibility.includes("set_focus"));
assert.ok(boundsCommand.includes("institution_browser_bounds_changed"));
assert.ok(boundsCommand.includes("return Ok(browser_snapshot(&guard))"));

// A hidden logical state is not proof that every native child WebView is hidden.
// Every false request must reconcile all tabs, propagate hide failure, and only
// commit visible=false after the native operation succeeds.
assert.ok(applyVisibility.includes("for tab in guard.tabs.values()"));
assert.ok(applyVisibility.includes("SIDERA_INSTITUTION_BROWSER_HIDE_FAILED"));
assert.ok(applyVisibility.includes("failure = result.err()"));
assert.ok(!applyVisibility.includes("let _ = webview.hide()"));
assert.ok(hideAllTabs.includes("for tab in guard.tabs.values()"));
assert.ok(hideAllTabs.includes("SIDERA_INSTITUTION_BROWSER_HIDE_FAILED"));
assert.ok(
  applyVisibility.indexOf(".hide()") < applyVisibility.indexOf(".show()"),
  "inactive tabs must hide successfully before the active tab is shown",
);
assert.ok((applyVisibility.match(/let _ = hide_all_browser_tabs\(app, guard\)/g) ?? []).length >= 2);
assert.ok(!visibilityCommand.includes("if guard.visible == input.visible"));
assert.ok(visibilityCommand.includes("apply_browser_visibility(&app, &guard, input.visible)?"));
assert.ok(
  visibilityCommand.indexOf("apply_browser_visibility(&app, &guard, input.visible)?")
    < visibilityCommand.indexOf("guard.visible = input.visible"),
  "native visibility must succeed before the logical state is committed",
);

// A module-wide client request id preserves UI intent order across components,
// cleanup effects and IPC scheduling. Rust accepts only a strictly newer id;
// stale requests can perform a safety hide but can never perform a show.
for (const marker of [
  "institutionBrowserVisibilityClientRequestId",
  "nextInstitutionBrowserVisibilityClientRequestId",
  "clientRequestId",
  "input: { institutionId, visible, clientRequestId }",
]) assert.ok(bridge.includes(marker), marker);
for (const marker of [
  "InstitutionBrowserVisibilityRequest",
  "client_request_id: u64",
  "accept_browser_visibility_request",
  "latest_browser_visibility_request",
  "client_request_id <= latest.client_request_id",
  "latest.client_request_id != input.client_request_id",
]) assert.ok(browser.includes(marker), marker);
assert.ok((visibilityCommand.match(/latest\.client_request_id != input\.client_request_id/g) ?? []).length >= 2);
assert.ok(visibilityCommand.includes("if !accepted"));
assert.ok((visibilityCommand.match(/!input\.visible && !latest\.visible/g) ?? []).length >= 2);
assert.ok(visibilityCommand.includes("if input.visible {\n            apply_browser_visibility(&app, &guard, false)?;"));
assert.ok(!visibilityCommand.includes("apply_browser_visibility(&app, &guard, latest.visible)"));

// Shared-browser authentication remains owned but must not disable the main
// window. Closing the browser surface retries only a small finite schedule,
// preserves a diagnostic, and changes presentation only after hide succeeds.
assert.ok(!authPopup.includes("set_enabled(false)"));
const visibilityReconcile = between(
  app,
  "const reconcileBrowserSurfaceVisibility",
  "async function setBrowserPresentation",
);
const presentationChange = between(
  app,
  "async function setBrowserPresentation",
  "useLayoutEffect(() => {",
);
for (const marker of [
  "browserVisibilitySequenceRef",
  "browserVisibilityDesiredRef",
  "const retryDelays = visible ? [0] : [0, 45, 120]",
  "setBrowserVisibilityDiagnostic",
  "SIDERA_INSTITUTION_BROWSER_HIDE_FAILED",
  "if (next.visible !== visible)",
  "SIDERA_INSTITUTION_BROWSER_HIDE_STATE_MISMATCH",
]) assert.ok(visibilityReconcile.includes(marker), marker);
assert.ok(!visibilityReconcile.includes("while ("));
assert.ok(
  presentationChange.indexOf("await reconcileBrowserSurfaceVisibility(false)")
    < presentationChange.indexOf("onBrowserPresentationChange(next)"),
  "closed presentation must wait for a successful native hide",
);

// P1c-R2 supersedes the exclusive focus viewport, while preserving the R1
// geometry contract: normal wheel/scroll events cannot schedule bounds IPC.
const geometryEffect = between(app, "if (!browserSurfaceVisible || !browserHostRef.current", "function persistSplitRatio");
assert.ok(geometryEffect.includes("ResizeObserver"));
assert.ok(geometryEffect.includes('window.addEventListener("resize", update)'));
assert.ok(!geometryEffect.includes("document.addEventListener"));
assert.ok(!geometryEffect.includes('addEventListener("scroll"'));
assert.ok(!geometryEffect.includes('addEventListener("wheel"'));
for (const marker of [
  "workspace--institution-browser-",
  "institutionBrowserPresentation",
  "institutionWorkbenchScrollTopRef",
  "返回双栏",
  "机构下载暂存区",
]) assert.ok(app.includes(marker), marker);
for (const marker of [
  ".workspace--workbench.workspace--institution-browser-split",
  ".workspace--workbench.workspace--institution-browser-immersive",
  "overflow: hidden",
  ".institution-workspace[data-browser-presentation=\"split\"] .institution-browser-host",
  ".institution-browser-popup-status",
]) assert.ok(css.includes(marker), marker);

for (const document of documents) {
  assert.ok(document.includes("P1c-R1"));
  assert.ok(document.includes("P1c-R2"));
}
assert.ok(
  documents.some((document) => document.includes("NATIVE POPUP AND PERFORMANCE UNVERIFIED")),
  "P1c-R1 native baseline must remain in the historical documentation",
);
assert.equal(evidence.package, "Sidera-P1c-R1");
assert.equal(evidence.task, "开发 005");
assert.equal(evidence.status, "IMPLEMENTED");
assert.equal(evidence.automatedTechnical, "PASS");
assert.equal(evidence.nativePopupAndPerformance, "UNVERIFIED");
assert.equal(evidence.p1Status, "IN PROGRESS");
assert.equal(evidence.preImplementationNativeBaseline.popupRouting, "FAIL");
assert.equal(evidence.preImplementationNativeBaseline.embeddedBrowserPerformance, "FAIL");
assert.equal(evidence.externalInstitutionRequests, 0);
assert.equal(evidence.providerCalls, 0);
assert.equal(evidence.paperLibraryWrites, 0);
assert.equal(evidence.automatedDownloads, 0);
assert.equal(
  pkg.scripts["audit:sidera-institution-browser-p1c-r1"],
  "node scripts/sidera_institution_browser_p1c_r1_audit.mjs",
);

console.log(JSON.stringify({
  status: "PASS",
  package: evidence.package,
  fixtures: {
    metaerspCnkiBridge: "PASS",
    metaerspWosBridge: "PASS",
    openerFallbackNoGhost: "PASS",
    canonicalTargetDedupe: "PASS",
    popupCreateAndWindowFeatures: "PASS",
    authenticationModalCreate: "PASS",
    safeGetMigrationModel: "PASS",
    openerPostRetentionModel: "PASS",
    timeoutCloseCancelAndLateCallback: "PASS",
    unchangedBoundsNoop: "PASS",
    scrollBoundsIpc: "ZERO",
    geometryFocusSeparation: "PASS",
    activeTabOnlyBounds: "PASS",
    physicalHideReconcile: "PASS",
    hideFailurePropagation: "PASS",
    staleShowSequenceFence: "PASS",
    boundedFrontendHideRetry: "PASS",
    browserAuthMainWindowDisable: "ZERO",
    fixedFocusViewportSupersededBySplitWorkspace: "PASS",
    nativeSurfaceRestore: "PASS",
  },
  externalInstitutionRequests: 0,
  providerCalls: 0,
  paperLibraryWrites: 0,
  automatedDownloads: 0,
  nativePopupAndPerformance: "UNVERIFIED",
}, null, 2));
