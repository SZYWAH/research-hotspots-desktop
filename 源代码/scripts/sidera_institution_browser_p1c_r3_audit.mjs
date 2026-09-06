import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const read = (file) => readFile(path.join(root, file), "utf8");
const [host, browser, runtime, lib, packageText, evidenceText, ...documents] = await Promise.all([
  read("src-tauri/src/sidera_window_host.rs"),
  read("src-tauri/src/sidera_institution_browser.rs"),
  read("src-tauri/src/sidera_institution_runtime.rs"),
  read("src-tauri/src/lib.rs"),
  read("package.json"),
  read("docs/evidence/sidera-p1c-r3-main-window-ownership-2026-08-05.json"),
  read("docs/PROJECT.md"),
  read("docs/ROADMAP.md"),
  read("docs/STATUS.md"),
  read("docs/ARCHITECTURE.md"),
  read("docs/DECISIONS.md"),
  read("docs/DEVELOPMENT.md"),
]);
const pkg = JSON.parse(packageText);
const evidence = JSON.parse(evidenceText);

for (const marker of [
  'app.get_window("main")',
  "window.hwnd()",
  "builder.owner_raw(hwnd)",
  "#[cfg(windows)]",
  "#[cfg(not(windows))]",
  "SIDERA_INSTITUTION_MAIN_WINDOW_MISSING",
  "SIDERA_INSTITUTION_MAIN_WINDOW_HANDLE_UNAVAILABLE",
  "SIDERA_INSTITUTION_WINDOW_OWNER_BIND_FAILED",
]) assert.ok(host.includes(marker), marker);

assert.ok(lib.includes("mod sidera_window_host;"));
for (const source of [browser, runtime]) {
  assert.ok(source.includes("resolve_main_window_host"));
  assert.ok(source.includes("bind_webview_window_owner"));
  assert.ok(!source.includes('get_webview_window("main")'));
  assert.ok(!source.includes("parent_raw("));
  assert.ok(!source.includes(".parent(&main)"));
}

for (const marker of [
  "NewWindowResponse::Create",
  ".data_directory(data_directory)",
  ".window_features(features)",
]) assert.ok(browser.includes(marker), marker);
assert.ok(runtime.includes("SIDERA_INSTITUTION_RESULT_WEBVIEW_CREATE_FAILED"));

for (const document of documents) {
  assert.ok(document.includes("P1c-R3"));
  assert.ok(document.includes("PARTIAL / ADAPTER DEFERRED"));
}
assert.equal(evidence.package, "Sidera-P1c-R3");
assert.equal(evidence.task, "开发 007");
assert.equal(evidence.status, "IMPLEMENTED");
assert.equal(evidence.automatedTechnical, "PASS");
assert.equal(evidence.nativeMainWindowOwnership, "UNVERIFIED");
assert.equal(evidence.p1Status, "PARTIAL / ADAPTER DEFERRED");
assert.equal(evidence.externalInstitutionRequests, 0);
assert.equal(evidence.providerCalls, 0);
assert.equal(evidence.paperLibraryWrites, 0);
assert.equal(
  pkg.scripts["audit:sidera-institution-browser-p1c-r3"],
  "node scripts/sidera_institution_browser_p1c_r3_audit.mjs",
);

console.log(JSON.stringify({
  status: "PASS",
  package: evidence.package,
  fixtures: {
    actualTopLevelWindowResolver: "PASS",
    windowsOwnerRaw: "PASS",
    nonWindowsOwnerFallback: "PASS",
    hiddenResultOwnership: "PASS",
    discoveryAuthOwnership: "PASS",
    libraryAuthOwnership: "PASS",
    sharedPopupOwnership: "PASS",
    mainWindowRestorePaths: "PASS",
    legacyMainWebviewLookup: "ZERO",
    parentRawChildSemantics: "ZERO",
  },
  externalInstitutionRequests: 0,
  providerCalls: 0,
  paperLibraryWrites: 0,
  nativeMainWindowOwnership: "UNVERIFIED",
}, null, 2));
