import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const read = (file) => readFile(path.join(root, file), "utf8");
const [core, runtime, app, bridge, packageText, status, decisions, evidence] = await Promise.all([
  read("src-tauri/core/src/institution_search.rs"),
  read("src-tauri/src/sidera_institution_runtime.rs"),
  read("src/App.tsx"),
  read("src/lib/sideraInstitution.ts"),
  read("package.json"),
  read("docs/STATUS.md"),
  read("docs/DECISIONS.md"),
  read("docs/evidence/sidera-m2.0c-l1a-r3-native-closed-loop-candidate-2026-08-03.json"),
]);

const pkg = JSON.parse(packageText);
const evidenceJson = JSON.parse(evidence);
const runtimeProduction = runtime.slice(0, runtime.indexOf("#[cfg(test)]"));
const between = (source, start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `${start} source range`);
  return source.slice(from, to);
};

const navigationEvent = between(
  core,
  "pub struct SideraInstitutionNavigationEvent",
  "pub struct SideraInstitutionAuthState",
);
assert.ok(core.includes("INSTITUTION_NAVIGATION_TRACE_LIMIT: usize = 32"));
assert.ok(core.includes("push_bounded_navigation_event"));
assert.ok(core.includes("initial_navigation_wait_is_current"));
assert.ok(navigationEvent.includes("navigation_id: Option<u64>"));
assert.ok(navigationEvent.includes("generation: u64"));
assert.ok(navigationEvent.includes("epoch: u64"));
assert.ok(navigationEvent.includes("host: String"));
assert.ok(navigationEvent.includes("path: String"));
assert.ok(navigationEvent.includes("web_error_status: Option<String>"));
for (const secretField of ["url:", "query", "fragment", "ticket", "cookie", "password", "response"]) {
  assert.ok(!navigationEvent.toLowerCase().includes(secretField), secretField);
}

assert.ok(core.includes("is_whu_database_sso_entry_url"));
assert.ok(core.includes("is_whu_database_authenticated_landing_url"));
assert.ok(core.includes("is_whu_institution_navigation_url"));
assert.ok(core.includes("decide_whu_institution_navigation"));
assert.ok(core.includes("safe_institution_navigation_parts"));
assert.ok(core.includes('"https" | "http" => SideraInstitutionNavigationDecision::Allow'));
assert.ok(core.includes('Reject("POLICY_NON_NETWORK_SCHEME")'));
assert.ok(core.includes("session_navigation_allows_every_http_and_https_target"));
assert.ok(!core.includes("POLICY_UNREGISTERED_TARGET"));
assert.ok(!core.includes("SideraInstitutionNavigationDecision::UpgradeToHttps"));

assert.ok(runtimeProduction.includes("NavigationStartingEventHandler"));
assert.ok(runtimeProduction.includes("NavigationCompletedEventHandler"));
assert.ok(runtimeProduction.includes("args.NavigationId"));
assert.ok(runtimeProduction.includes("args.IsRedirected"));
assert.ok(runtimeProduction.includes("args.WebErrorStatus"));
assert.ok(runtimeProduction.includes("CoTaskMemFree"));
assert.ok(runtimeProduction.includes("record_navigation_event"));
assert.ok(runtimeProduction.includes("WEBVIEW2_NO_TERMINAL_EVENT"));
assert.ok(runtimeProduction.includes("NewWindowResponse::Allow"));
assert.ok(runtimeProduction.includes("is_blank_or_whu_navigation"));
assert.ok(!runtimeProduction.includes("POLICY_UNREGISTERED_TARGET"));
assert.ok(!runtimeProduction.includes("POLICY_HTTP_REDIRECT_UPGRADED_TO_HTTPS"));
assert.ok(!runtimeProduction.includes("ignored_navigation_ids"));
assert.ok(!runtimeProduction.includes("general_autofill_enabled(false)"));
assert.ok(!runtimeProduction.includes(".on_download(|_webview, _event| false)"));

const entryResolver = between(
  runtimeProduction,
  "async fn resolve_whu_session_entry",
  "fn is_blank_or_whu_navigation",
);
assert.ok(entryResolver.includes("is_whu_institution_navigation_url"));
const sessionFromUrl = between(runtimeProduction, "fn session_from_url", "fn library_auth_from_url");
assert.ok(sessionFromUrl.includes("SIDERA_INSTITUTION_PAGE_INSPECTION_PENDING"));
assert.ok(!sessionFromUrl.includes("SideraInstitutionSessionStatus::Ready"));

const blocked = between(
  runtimeProduction,
  "fn apply_blocked_navigation_locked",
  "fn register_blocked_target",
);
assert.ok(blocked.includes("SideraInstitutionNavigationPhase::Blocked"));
assert.ok(blocked.includes("guard.pending_initial_navigation_epoch = None"));
assert.ok(blocked.includes("SIDERA_INSTITUTION_NAVIGATION_BLOCKED"));

const timeout = between(
  runtimeProduction,
  "fn start_initial_navigation",
  "fn invalidate_institution_webviews",
);
assert.ok(timeout.includes("initial_navigation_wait_is_current"));
assert.ok(timeout.includes("SideraInstitutionNavigationPhase::Timeout"));
assert.ok(timeout.includes("SIDERA_INSTITUTION_NAVIGATION_TIMEOUT"));

assert.ok(runtimeProduction.includes("schedule_database_page_inspection"));
assert.ok(runtimeProduction.includes("session_from_adapter_page"));
assert.ok(runtimeProduction.includes('"search-form" | "bucket-summary" | "records"'));
assert.ok(runtimeProduction.includes("SIDERA_INSTITUTION_ADAPTER_DRIFT"));
assert.ok(!runtimeProduction.includes("SIDERA_INSTITUTION_ADAPTER_UPDATE_REQUIRED"));
assert.ok(runtimeProduction.includes("safeLocation = `${location.origin}${location.pathname}`"));
assert.ok(runtimeProduction.includes("SIDERA_INSTITUTION_NAVIGATION_WEBVIEW_FAILED"));
assert.ok(runtimeProduction.includes("begin_catalog_handoff"));
assert.ok(runtimeProduction.includes("SIDERA_INSTITUTION_DATABASE_AUTH_READY"));
assert.ok(runtimeProduction.includes("学术论文与馆藏目录将分别检查来源就绪状态"));
assert.ok(!runtimeProduction.includes("SIDERA_INSTITUTION_CATALOG_HANDOFF_FAILED"));
assert.ok(runtimeProduction.includes("WHU_CATALOG_ENTRY_URL"));

assert.ok(bridge.includes("SideraInstitutionNavigationEvent"));
assert.ok(bridge.includes("navigationTrace: SideraInstitutionNavigationEvent[]"));
assert.ok(app.includes("脱敏导航轨迹"));
assert.ok(app.includes("查询参数、ticket、Cookie、账号和密码不会进入前端"));

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

assert.ok(status.includes("M2.0c-L1a-R3"));
assert.ok(status.includes("IN PROGRESS / AUTOMATED TECHNICAL PASS / NATIVE CLOSED-LOOP UNVERIFIED"));
assert.ok(status.includes("NATIVE IN-APP INSTITUTION AUTH FAIL / SUPERSEDED"));
assert.ok(decisions.includes("D-139"));
assert.ok(decisions.includes("D-140"));
assert.equal(evidenceJson.package, "M2.0c-L1a-R3");
assert.equal(evidenceJson.status, "IN PROGRESS");
assert.equal(evidenceJson.automatedTechnical, "PASS");
assert.equal(evidenceJson.nativeClosedLoop, "UNVERIFIED");
assert.equal(
  evidenceJson.implemented.sessionNavigationPolicy,
  "allow every HTTP and HTTPS navigation, redirect, port, path and opaque authentication parameter",
);
assert.equal(evidenceJson.externalInstitutionRequests, 0);
assert.equal(evidenceJson.providerCalls, 0);
assert.equal(
  pkg.scripts["audit:sidera-institution-auth-l1a-r3"],
  "node scripts/sidera_institution_auth_l1a_r3_audit.mjs",
);

console.log(JSON.stringify({
  status: "PASS",
  package: "M2.0c-L1a-R3",
  navigationTraceLimit: 32,
  traceMaterial: ["authKind", "phase", "networkHost", "path", "redirect", "webErrorStatus"],
  entryPolicy: "official-probe-network-target",
  sessionPolicy: "open-http-https",
  authPopups: "native-allow",
  databaseReadyGate: "versioned-dom",
  adapterDrift: "explicit-failure",
  externalInstitutionRequests: 0,
  providerCalls: 0,
  nativeClosedLoop: "UNVERIFIED",
}, null, 2));
