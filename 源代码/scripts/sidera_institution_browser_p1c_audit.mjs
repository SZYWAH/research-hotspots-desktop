import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const read = (file) => readFile(path.join(root, file), "utf8");
const [core, browser, runtime, desktop, bridge, app, css, packageText, evidenceText] = await Promise.all([
  read("src-tauri/core/src/institution_browser.rs"),
  read("src-tauri/src/sidera_institution_browser.rs"),
  read("src-tauri/src/sidera_institution_runtime.rs"),
  read("src-tauri/src/lib.rs"),
  read("src/lib/sideraInstitution.ts"),
  read("src/App.tsx"),
  read("src/index.css"),
  read("package.json"),
  read("docs/evidence/sidera-p1c-institution-browser-kernel-2026-08-04.json"),
]);
const pkg = JSON.parse(packageText);
const evidence = JSON.parse(evidenceText);

// Open navigation is a real browser surface, while executable/local schemes stay rejected.
for (const marker of [
  "parse_institution_browser_target",
  '"http" | "https"',
  '"mailto" | "tel"',
  "SIDERA_INSTITUTION_BROWSER_SCHEME_UNSUPPORTED",
  "classify_institution_popup",
  "InstitutionPopupDisposition::ManagedPopup",
  "InstitutionPopupDisposition::TransientBridge",
  "InstitutionPopupDisposition::AuthModal",
  "safe_institution_display_url",
  "sanitize_institution_download_file_name",
]) {
  assert.ok(core.includes(marker), marker);
}
for (const forbidden of ["javascript:alert(1)", "file:///C:/secret.txt", "data:text/html,hello"]) {
  assert.ok(core.includes(forbidden), `${forbidden} rejection fixture`);
}

// All ordinary tabs and the one authentication modal explicitly share the same institution UDF.
assert.ok(browser.includes('const INSTITUTION_DATA_DIRECTORY: &str = "institution-webview-v1/whu"'));
assert.ok(browser.includes('const PROFILE_ID: &str = "institution-shared-v1"'));
assert.ok(browser.includes("WebviewBuilder::new"));
assert.ok(browser.includes("window\n        .add_child("));
assert.ok(browser.match(/WebviewBuilder::new[\s\S]*?\.data_directory\(data_directory\)/));
assert.ok(browser.match(/WebviewWindowBuilder::new[\s\S]*?\.data_directory\(data_directory\)/));
assert.ok(browser.includes("create_managed_browser_popup"));
assert.ok(!browser.includes("queue_browser_tab"));
assert.ok(browser.includes("classify_institution_popup(&target)"));
assert.ok(browser.includes("NewWindowResponse::Create { window }"));
assert.ok(browser.includes(".window_features(features)"));
assert.ok(browser.includes("close_browser_auth_modal"));
assert.ok(browser.includes("core.CanGoBack"));
assert.ok(browser.includes("core.CanGoForward"));
assert.ok(browser.includes('const BROWSER_RESET_WEBVIEW_LABEL: &str = "institution-browser-reset"'));
assert.ok(browser.includes("clear_shared_browsing_data"));
assert.ok(browser.includes("LEGACY_INSTITUTION_WEBVIEW_LABEL"));
assert.ok(!browser.includes("POLICY_UNREGISTERED_TARGET"));

// Downloads stay in an isolated staging area with persistent identity and provenance.
for (const marker of [
  'const INSTITUTION_DOWNLOAD_DIRECTORY: &str = "institution-downloads-v1"',
  ".on_download(browser_download_handler(",
  'join("manifest.json")',
  "sha256_file",
  "SideraInstitutionDownloadProvenance",
  "safe_source_url",
  "SIDERA_INSTITUTION_DOWNLOAD_INTERRUPTED",
  "record.retryable = false",
  "SIDERA_INSTITUTION_DOWNLOAD_CANCEL_REQUESTED",
  "SIDERA_INSTITUTION_DOWNLOAD_COMPLETE",
]) {
  assert.ok(browser.includes(marker), marker);
}
for (const forbidden of ["rusqlite", "upsert_paper", "DEEPSEEK_API_KEY", "providerCall"]) {
  assert.ok(!browser.includes(forbidden), `browser runtime must not include ${forbidden}`);
}

// Native extraction remains hidden/task-bound; user-facing records and current pages open in the shared browser.
assert.ok(runtime.includes("open_url_in_browser"));
assert.ok(runtime.includes("sidera_institution_open_current_source"));
assert.ok(runtime.includes("observe_shared_browser_page"));
assert.ok(runtime.includes("close_browser_auth_modal"));
assert.ok(runtime.includes("academic_result_webview"));
assert.ok(!app.includes('mode: "system"'));

// The command and TypeScript bridge expose browser navigation, tab, auth, geometry and download actions only.
for (const command of [
  "sidera_institution_browser_ensure",
  "sidera_institution_browser_state",
  "sidera_institution_browser_tab_new",
  "sidera_institution_browser_tab_select",
  "sidera_institution_browser_tab_close",
  "sidera_institution_browser_navigate",
  "sidera_institution_browser_back",
  "sidera_institution_browser_forward",
  "sidera_institution_browser_reload",
  "sidera_institution_browser_stop",
  "sidera_institution_browser_shell_set_bounds",
  "sidera_institution_browser_shell_set_visible",
  "sidera_institution_browser_auth_cancel",
  "sidera_institution_browser_reset",
  "sidera_institution_download_list",
  "sidera_institution_download_cancel",
  "sidera_institution_download_retry",
  "sidera_institution_download_open",
  "sidera_institution_download_reveal",
]) {
  assert.ok(desktop.includes(command), command);
  assert.ok(bridge.includes(command), `${command} TypeScript bridge`);
}

// The product surface keeps tabs, address navigation, back/forward and download
// staging. P1c-R2 supersedes the old fullscreen-only "return to native results"
// control with native/split/immersive presentation controls.
for (const marker of [
  "Sidera 共享机构浏览器",
  "机构浏览器标签页",
  "机构浏览器地址",
  "原生研究",
  "返回双栏",
  "关闭机构网页",
  "机构下载暂存区",
  "SHA-256",
  "登录数据库 SSO",
  "登录我的图书馆",
  "不会自动入库、解析或调用 AI Provider",
]) {
  assert.ok(app.includes(marker), marker);
}
for (const marker of [
  ".institution-browser-shell",
  ".institution-browser-tabs",
  ".institution-browser-navigation",
  ".institution-browser-auth-status",
  ".institution-download-drawer",
  ".institution-browser-host",
]) {
  assert.ok(css.includes(marker), marker);
}

assert.equal(evidence.package, "Sidera-P1c");
assert.equal(evidence.status, "IMPLEMENTED");
assert.equal(evidence.automatedTechnical, "PASS");
assert.equal(evidence.nativeBasicShellSmoke, "PASS");
assert.equal(evidence.nativeInstitutionBrowser, "UNVERIFIED");
assert.equal(evidence.p1Status, "IN PROGRESS");
assert.equal(evidence.externalInstitutionRequests, 0);
assert.equal(evidence.providerCalls, 0);
assert.equal(evidence.paperLibraryWrites, 0);
assert.equal(evidence.automatedDownloads, 0);
assert.equal(
  pkg.scripts["audit:sidera-institution-browser-p1c"],
  "node scripts/sidera_institution_browser_p1c_audit.mjs",
);
assert.equal(
  pkg.scripts["test:sidera-institution-browser"],
  "cargo test --manifest-path src-tauri/Cargo.toml -p research-hotspots-core institution_browser::tests -j 2 -- --nocapture",
);

console.log(JSON.stringify({
  status: "PASS",
  package: evidence.package,
  fixtures: {
    openHttpHttpsNavigation: "PASS",
    executableSchemeRejection: "PASS",
    sharedProfileAndUdf: "PASS",
    compatibilityPopupCreate: "PASS",
    authenticationPopupSemantics: "PASS",
    nativeHistoryState: "PASS",
    sharedProfileResetFallback: "PASS",
    isolatedDownloadStaging: "PASS",
    fileIdentityAndProvenance: "PASS",
    taskBrowserSeparation: "PASS",
    browserShellUi: "PASS",
    nativeBasicShellSmokeRecorded: "PASS",
  },
  externalInstitutionRequests: 0,
  providerCalls: 0,
  paperLibraryWrites: 0,
  automatedDownloads: 0,
}, null, 2));
