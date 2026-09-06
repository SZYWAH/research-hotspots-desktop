import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const read = (file) => readFile(path.join(root, file), "utf8");
const [core, runtime, app, desktop, packageText, status, decisions] = await Promise.all([
  read("src-tauri/core/src/institution_search.rs"),
  read("src-tauri/src/sidera_institution_runtime.rs"),
  read("src/App.tsx"),
  read("src-tauri/src/lib.rs"),
  read("package.json"),
  read("docs/STATUS.md"),
  read("docs/DECISIONS.md"),
]);
const pkg = JSON.parse(packageText);
const runtimeProduction = runtime.slice(0, runtime.indexOf("#[cfg(test)]"));

assert.ok(core.includes("SideraInstitutionPopupDisposition"));
assert.ok(core.includes("classify_whu_popup_navigation"));
assert.ok(core.includes("AuthModal"));
assert.ok(core.includes("Reject"));
assert.ok(!core.includes("SameWebview"));
assert.ok(core.includes("/engine2/general-rest/outer-proxy-detail-url"));
assert.ok(core.includes("validate_whu_database_sso_url(value)"));

assert.ok(runtimeProduction.includes("is_blank_or_whu_navigation(&url)"));
assert.ok(runtimeProduction.includes("get_webview(INSTITUTION_WEBVIEW_LABEL)"));
assert.ok(runtimeProduction.includes("NewWindowResponse::Deny"));
assert.ok(runtimeProduction.includes("NewWindowResponse::Allow"));
assert.ok(runtimeProduction.includes("NewWindowResponse::Create"));
assert.ok(!runtimeProduction.includes(".map(|webview| webview.navigate(url).is_ok())"));
assert.ok(runtimeProduction.includes("SIDERA_INSTITUTION_AUTH_REDIRECTING"));
assert.ok(runtimeProduction.includes("SIDERA_INSTITUTION_NAVIGATION_FAILED"));
assert.ok(runtimeProduction.includes("clear_navigation_fallback"));
assert.ok(runtimeProduction.includes("SIDERA_INSTITUTION_SESSION_NOT_READY"));
assert.ok(runtimeProduction.includes("guard.session.database_auth.status == SideraInstitutionAuthStatus::Ready"));
assert.ok(!runtimeProduction.includes(".on_download(|_webview, _event| false)"));
assert.ok(!runtimeProduction.includes("SetIsPasswordAutosaveEnabled(false)"));

assert.ok(app.includes('const databaseSessionReady = databaseAuth?.status === "ready"'));
assert.ok(app.includes('if (!nextSession || nextSession.databaseAuth.status !== "ready")'));
assert.ok(app.includes('if (nextSession.databaseAuth.status !== "ready")'));
assert.ok(app.includes("前往机构资源"));
assert.ok(app.includes("在系统浏览器打开图书馆"));
assert.ok(app.includes("在系统浏览器打开数据库导航"));
assert.ok(app.includes("应用内机构会话"));
assert.ok(app.includes("正式 SSO 路由已解析"));
assert.ok(app.includes("公开统一发现入口尚未解析"));
assert.ok(app.includes("重新检测只刷新 aTrust 与公开入口状态"));
assert.ok(desktop.includes("无 Cookie 探针不判断"));

for (const forbidden of [
  "document.cookie",
  "cookies_for_url",
  ".cookies()",
  "localStorage.getItem",
  "sessionStorage.getItem",
]) {
  assert.ok(!runtimeProduction.includes(forbidden), forbidden);
}

assert.ok(status.includes("M2.0c-L1a-R1"));
assert.ok(status.includes("NATIVE IN-APP INSTITUTION AUTH FAIL"));
assert.ok(status.includes("SUPERSEDED"));
assert.ok(decisions.includes("D-137"));
assert.equal(
  pkg.scripts["audit:sidera-institution-auth-l1a-r1"],
  "node scripts/sidera_institution_auth_l1a_r1_audit.mjs",
);

console.log(JSON.stringify({
  status: "PASS",
  package: "M2.0c-L1a-R1-regression",
  popupHandling: "superseded-by-open-network-native-popup",
  cookieReads: 0,
  providerCalls: 0,
  nativeAcceptance: "FAIL / SUPERSEDED",
}, null, 2));
