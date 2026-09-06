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
  read("docs/evidence/sidera-m2.0c-l1a-r2-real-auth-popup-first-navigation-2026-08-03.json"),
]);
const pkg = JSON.parse(packageText);
const evidenceJson = JSON.parse(evidence);
const runtimeProduction = runtime.slice(0, runtime.indexOf("#[cfg(test)]"));
const createMainStart = runtimeProduction.indexOf("async fn create_institution_webview");
const startNavigationStart = runtimeProduction.indexOf("fn start_initial_navigation");
const beginConnectionStart = runtimeProduction.indexOf("async fn begin_institution_connection");
const beginConnectionEnd = runtimeProduction.indexOf(
  "pub async fn sidera_institution_connection_begin",
  beginConnectionStart,
);
const ensureStart = runtimeProduction.indexOf("pub async fn sidera_institution_session_ensure");
const ensureEnd = runtimeProduction.indexOf("pub async fn sidera_institution_session_state", ensureStart);
const ensureSource = runtimeProduction.slice(ensureStart, ensureEnd);
const beginConnectionSource = runtimeProduction.slice(beginConnectionStart, beginConnectionEnd);
const legacyVisibilityStart = runtimeProduction.indexOf(
  "pub async fn sidera_institution_browser_set_visible",
);
const legacyVisibilityEnd = runtimeProduction.indexOf(
  "fn cancel_institution_connection",
  legacyVisibilityStart,
);
const legacyVisibilitySource = runtimeProduction.slice(legacyVisibilityStart, legacyVisibilityEnd);

assert.ok(core.includes("SideraInstitutionAuthKind"));
assert.ok(core.includes("DatabaseSso"));
assert.ok(core.includes("LibraryAccount"));
assert.ok(core.includes("SideraInstitutionAuthStatus"));
assert.ok(core.includes("database_auth"));
assert.ok(core.includes("library_account_auth"));
assert.ok(core.includes('"https" | "http" => SideraInstitutionNavigationDecision::Allow'));
assert.ok(!core.includes("POLICY_UNREGISTERED_TARGET"));
assert.ok(core.includes("SideraInstitutionPopupDisposition::AuthModal"));
assert.ok(!core.includes("SideraInstitutionPopupDisposition::SameWebview"));

assert.ok(createMainStart >= 0 && startNavigationStart > createMainStart);
const createMainSource = runtimeProduction.slice(createMainStart, startNavigationStart);
assert.ok(createMainSource.includes('Url::parse("about:blank")'));
assert.ok(createMainSource.includes("configure_webview_platform"));
assert.match(createMainSource, /webview\s*\.hide\(\)/);
assert.ok(createMainSource.includes("create_library_auth_modal"));
assert.ok(createMainSource.includes("else if active_search"));
assert.ok(createMainSource.includes("create_academic_result_webview"));
assert.ok(!createMainSource.includes("main_webview.navigate(url)"));

assert.ok(runtimeProduction.includes("NavigationCompletedEventHandler"));
assert.ok(runtimeProduction.includes("args.IsSuccess"));
assert.ok(runtimeProduction.includes("INSTITUTION_INITIAL_NAVIGATION_TIMEOUT: Duration = Duration::from_secs(20)"));
assert.ok(runtimeProduction.includes("pending_initial_navigation_epoch"));
assert.ok(runtimeProduction.includes("webview_generation"));
assert.ok(runtimeProduction.includes("SIDERA_INSTITUTION_NAVIGATION_TIMEOUT"));
assert.ok(runtimeProduction.includes("SIDERA_INSTITUTION_NAVIGATION_FAILED"));
assert.ok(runtimeProduction.includes("SIDERA_INSTITUTION_SSO_ROUTE_UNRESOLVED"));

assert.ok(runtimeProduction.includes("WebviewWindowBuilder::new"));
assert.ok(runtimeProduction.includes("INSTITUTION_AUTH_WINDOW_LABEL"));
assert.ok(runtimeProduction.includes(".window_features(features)"));
assert.ok(runtimeProduction.includes("NewWindowResponse::Create { window: modal }"));
assert.ok(runtimeProduction.includes("bind_webview_window_owner(builder, &main_host)"));
assert.ok(runtimeProduction.includes(".inner_size(width, height)"));
assert.ok(runtimeProduction.includes(".min_inner_size(min_width, min_height)"));
assert.ok(!runtimeProduction.includes("set_enabled(false)"));
assert.ok(runtimeProduction.includes("if restore_main_window(app)"));
assert.ok(runtimeProduction.includes("let _ = claim_connection_main_restore(inner, token)"));
assert.ok(runtimeProduction.includes("if window.set_enabled(true).is_ok()"));
assert.ok(runtimeProduction.includes("Restoring the native owner is intentionally idempotent"));
assert.ok(runtimeProduction.includes("SIDERA_INSTITUTION_AUTH_POPUP_CREATE_FAILED"));
assert.ok(runtimeProduction.includes("SIDERA_INSTITUTION_AUTH_CANCELLED"));
assert.ok(runtimeProduction.includes("pub async fn sidera_institution_auth_cancel"));
assert.ok(legacyVisibilityStart >= 0 && legacyVisibilityEnd > legacyVisibilityStart);
assert.ok(legacyVisibilitySource.includes("SIDERA_INSTITUTION_RESULT_WEBVIEW_HIDE_FAILED"));
assert.ok(!legacyVisibilitySource.includes("let _ = result.hide()"));
assert.ok(
  legacyVisibilitySource.indexOf("SIDERA_INSTITUTION_RESULT_WEBVIEW_HIDE_FAILED")
    < legacyVisibilitySource.indexOf("binding.raw_visible = result_label.is_some()"),
);
assert.ok(
  legacyVisibilitySource.indexOf("SIDERA_INSTITUTION_RESULT_WEBVIEW_HIDE_FAILED")
    < legacyVisibilitySource.indexOf("guard.session.browser_visible = input.visible"),
);

assert.ok(ensureStart >= 0 && ensureEnd > ensureStart);
assert.ok(beginConnectionStart >= 0 && beginConnectionEnd > beginConnectionStart);
assert.ok(ensureSource.includes("begin_institution_connection"));
assert.ok(runtimeProduction.includes("不会回退到图书馆首页"));
assert.ok(beginConnectionSource.includes("create_institution_webview"));
assert.ok(beginConnectionSource.includes("start_initial_navigation"));
assert.ok(!ensureSource.includes("webview.navigate(url)"));

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

assert.ok(bridge.includes('SideraInstitutionAuthKind = "database-sso" | "library-account"'));
assert.ok(bridge.includes("databaseAuth: SideraInstitutionAuthState"));
assert.ok(bridge.includes("libraryAccountAuth: SideraInstitutionAuthState"));
assert.ok(bridge.includes('"sidera_institution_auth_cancel"'));
assert.ok(app.includes('openInstitutionConnection("database-access")'));
assert.ok(app.includes('openInstitutionConnection("library-account")'));
assert.ok(app.includes("登录数据库 SSO"));
assert.ok(app.includes("登录我的图书馆"));
assert.ok(app.includes('nextSession.databaseAuth.status !== "ready"'));
assert.ok(app.includes("setBrowserState(await ensureSideraInstitutionBrowser("));
assert.ok(app.includes('setBrowserPresentation("split")'));

assert.ok(status.includes("M2.0c-L1a-R2"));
assert.ok(status.includes("NATIVE IN-APP INSTITUTION AUTH FAIL / SUPERSEDED"));
assert.ok(decisions.includes("D-138"));
assert.equal(evidenceJson.package, "M2.0c-L1a-R2");
assert.equal(evidenceJson.providerCalls, 0);
assert.equal(evidenceJson.externalInstitutionRequests, 0);
assert.equal(
  pkg.scripts["audit:sidera-institution-auth-l1a-r2"],
  "node scripts/sidera_institution_auth_l1a_r2_audit.mjs",
);

console.log(JSON.stringify({
  status: "PASS",
  package: "M2.0c-L1a-R2",
  firstNavigation: "hidden-about-blank-then-official-sso",
  popupHandling: "shared-environment-modal",
  navigationTimeoutSeconds: 20,
  authStates: ["database-sso", "library-account"],
  cookieReads: 0,
  externalInstitutionRequests: 0,
  providerCalls: 0,
  nativeAcceptance: "FAIL / SUPERSEDED",
}, null, 2));
