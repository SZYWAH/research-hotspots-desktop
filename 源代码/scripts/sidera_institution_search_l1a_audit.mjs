import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const read = (file) => readFile(path.join(root, file), "utf8");
const [cargo, capability, core, runtime, desktop, app, bridge, css, packageText] = await Promise.all([
  read("src-tauri/Cargo.toml"),
  read("src-tauri/capabilities/default.json"),
  read("src-tauri/core/src/institution_search.rs"),
  read("src-tauri/src/sidera_institution_runtime.rs"),
  read("src-tauri/src/lib.rs"),
  read("src/App.tsx"),
  read("src/lib/sideraInstitution.ts"),
  read("src/index.css"),
  read("package.json"),
]);
const pkg = JSON.parse(packageText);
const runtimeProduction = runtime.slice(0, runtime.indexOf("#[cfg(test)]"));
const institutionComponentStart = app.indexOf("function InstitutionResourceWorkspace");
const institutionComponentEnd = app.indexOf("function ImportPreviewPanel", institutionComponentStart);
assert.ok(institutionComponentStart >= 0 && institutionComponentEnd > institutionComponentStart);
const institutionComponent = app.slice(institutionComponentStart, institutionComponentEnd);

assert.ok(cargo.includes('tauri = { version = "=2.11.5", features = ["unstable"] }'));
assert.ok(runtimeProduction.includes('INSTITUTION_WEBVIEW_LABEL: &str = "institution-whu"'));
assert.ok(runtimeProduction.includes('INSTITUTION_DATA_DIRECTORY: &str = "institution-webview-v1/whu"'));
assert.ok(runtimeProduction.includes("WebviewBuilder::new"));
assert.ok(runtimeProduction.includes(".data_directory(data_directory)"));
assert.ok(!runtimeProduction.includes(".general_autofill_enabled(false)"));
assert.ok(!runtimeProduction.includes("SetIsPasswordAutosaveEnabled(false)"));
assert.ok(runtimeProduction.includes(".on_navigation"));
assert.ok(runtimeProduction.includes(".on_new_window"));
assert.ok(runtimeProduction.includes("NewWindowResponse::Allow"));
assert.ok(runtimeProduction.includes("NewWindowResponse::Deny"));
assert.ok(!runtimeProduction.includes(".on_download(|_webview, _event| false)"));
assert.ok(desktop.includes(".open_js_links_on_click(false)"));
assert.ok(!capability.includes("institution-whu"));
assert.ok(!capability.includes('"remote"'));

assert.ok(core.includes('WHU_OPAC_CATALOG_ADAPTER_ID: &str = "whu-opac-catalog-v3"'));
assert.ok(core.includes('WHU_ACADEMIC_DISCOVERY_ADAPTER_ID: &str = "whu-academic-discovery-v1"'));
assert.ok(core.includes("INSTITUTION_QUERY_MAX_CHARS: usize = 200"));
assert.ok(core.includes("INSTITUTION_EXTRACTION_MAX_BYTES: usize = 256 * 1024"));
assert.ok(core.includes("INSTITUTION_BUCKET_ITEM_LIMIT: usize = 20"));
assert.ok(core.includes("INSTITUTION_TOTAL_ITEM_LIMIT: usize = 40"));
assert.ok(core.includes("normalize_catalog_adapter_records"));
assert.ok(core.includes("normalize_academic_adapter_records"));
assert.ok(core.includes("merge_institution_results"));
assert.ok(core.includes("is_whu_catalog_result_url"));
assert.ok(core.includes("validate_whu_database_sso_url(value)"));
assert.ok(runtimeProduction.includes("eval_with_callback"));
assert.ok(runtimeProduction.includes("SEARCH_TOTAL_TIMEOUT: Duration = Duration::from_secs(90)"));
assert.ok(runtimeProduction.includes("active_task_id"));
assert.ok(runtimeProduction.includes("guard.epoch = guard.epoch.saturating_add(1)"));
assert.ok(runtimeProduction.includes("SIDERA_INSTITUTION_ADAPTER_DRIFT"));
assert.ok(runtimeProduction.includes("SIDERA_INSTITUTION_SEARCH_PARTIAL"));

for (const command of [
  "sidera_institution_session_ensure",
  "sidera_institution_session_state",
  "sidera_institution_browser_set_bounds",
  "sidera_institution_browser_set_visible",
  "sidera_institution_auth_cancel",
  "sidera_institution_search_start",
  "sidera_institution_search_cancel",
  "sidera_institution_result_open",
  "sidera_institution_session_reset",
]) {
  assert.ok(desktop.includes(`sidera_institution_runtime::${command}`), command);
  assert.ok(bridge.includes(`"${command}"`), command);
}

assert.ok(app.includes('["institution", "机构资源"]'));
assert.ok(institutionComponent.includes("ResizeObserver"));
assert.ok(institutionComponent.includes("setSideraInstitutionBrowserShellBounds"));
assert.ok(institutionComponent.includes("不会自动入库、解析或调用 AI Provider"));
assert.ok(institutionComponent.includes("查看原始记录"));
assert.ok(institutionComponent.includes("清除机构会话"));
assert.ok(!institutionComponent.includes("upsertPaperLibrary"));
assert.ok(!institutionComponent.includes("searchAcademicSources"));
assert.ok(app.includes("机构资源正在检索"));
assert.ok(css.includes(".institution-browser-host"));
assert.ok(css.includes("grid-template-columns: repeat(4, minmax(0, 1fr))"));

for (const forbidden of [
  "document.cookie",
  "cookies_for_url",
  ".cookies()",
  "password').value",
  "localStorage.getItem",
  "sessionStorage.getItem",
]) {
  assert.ok(!runtimeProduction.includes(forbidden), forbidden);
}
assert.ok(!runtimeProduction.includes("upsert_paper_library"));
assert.ok(!runtimeProduction.includes("sidera_pi"));
assert.ok(!runtimeProduction.includes("reqwest"));

assert.equal(
  pkg.scripts["audit:sidera-institution-search-l1a"],
  "node scripts/sidera_institution_search_l1a_audit.mjs",
);
assert.equal(
  pkg.scripts["test:sidera-institution-search"],
  "cargo test --manifest-path src-tauri/Cargo.toml -p research-hotspots-core institution_search::tests -j 2 -- --nocapture",
);

console.log(JSON.stringify({
  status: "PASS",
  package: "M2.0c-L1a",
  webview: {
    owner: "rust",
    label: "institution-whu",
    persistentProfile: "institution-webview-v1/whu",
    remoteCapability: false,
    downloads: "browser-default-no-automatic-download",
    cookieReads: 0,
  },
  search: {
    adapters: ["whu-academic-discovery-v1", "whu-opac-catalog-v3"],
    perBucketLimit: 20,
    totalLimit: 40,
    timeoutSeconds: 90,
    writesToPaperLibrary: 0,
  },
  providerCalls: 0,
  nativeAcceptance: "FAIL / SUPERSEDED",
}, null, 2));
