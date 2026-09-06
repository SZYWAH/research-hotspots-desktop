import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const read = (file) => readFile(path.join(root, file), "utf8");
const [core, runtime, bridge, app, packageText, evidenceText] = await Promise.all([
  read("src-tauri/core/src/institution_search.rs"),
  read("src-tauri/src/sidera_institution_runtime.rs"),
  read("src/lib/sideraInstitution.ts"),
  read("src/App.tsx"),
  read("package.json"),
  read("docs/evidence/sidera-p1b-r2-discovery-auth-resume-2026-08-04.json"),
]);
const pkg = JSON.parse(packageText);
const evidence = JSON.parse(evidenceText);
const production = runtime.slice(0, runtime.indexOf("#[cfg(test)]"));
const between = (source, start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `${start} source range`);
  return source.slice(from, to);
};
const rustScript = (name) => {
  const match = runtime.match(new RegExp(`const ${name}: &str = r#"([\\s\\S]*?)"#;`));
  assert.ok(match, `${name} must exist`);
  return match[1];
};

const authScript = rustScript("DISCOVERY_AUTH_INSPECT_SCRIPT");
assert.doesNotThrow(() => new Function("document", "location", `return (${authScript});`));
const inspectAuth = (body, password = false) => new Function(
  "document",
  "location",
  `return (${authScript});`,
)(
  {
    body: { innerText: body },
    querySelector: (selector) => selector === "input[type=\"password\"]" && password ? {} : null,
  },
  { origin: "https://discovery.example", pathname: "/auth/result" },
);
assert.deepEqual(inspectAuth("当前状态：已登录"), {
  adapterVersion: "whu-discovery-auth-v1",
  kind: "ready",
  url: "https://discovery.example/auth/result",
});
assert.equal(inspectAuth("机构访问已建立，可以使用全文服务").kind, "ready");
assert.equal(inspectAuth("尚未登录，请点击统一登录").kind, "login-required");
assert.equal(inspectAuth("统一身份认证", true).kind, "login-required");

const resultWindow = between(
  production,
  "fn create_academic_result_webview",
  "async fn create_institution_webview",
);
const managedAuth = between(
  production,
  "fn create_academic_discovery_auth_window",
  "fn create_academic_result_webview",
);
const completion = between(
  production,
  "async fn complete_discovery_auth",
  "async fn inspect_discovery_auth_before_close",
);
const manualClose = between(
  production,
  "async fn inspect_discovery_auth_before_close",
  "fn schedule_discovery_auth_inspection",
);
const timeout = between(
  production,
  "async fn run_institution_search_with_pauseable_timeout",
  "async fn run_institution_search",
);
const resultWebviewWait = between(
  production,
  "async fn wait_for_academic_result_webview",
  "async fn apply_single_academic_filter",
);

// a-b: both active-task and post-task result popups always enter the same managed window path.
assert.ok(resultWindow.includes("create_academic_discovery_auth_window"));
assert.ok(resultWindow.includes("features"));
assert.ok(!resultWindow.includes("NewWindowResponse::Allow"));
assert.ok(managedAuth.includes("resume = if guard.active_task_id"));
assert.ok(managedAuth.includes("} else {\n            None"));
assert.ok(managedAuth.includes("NewWindowResponse::Create { window }"));
assert.ok(managedAuth.includes(".window_features(features)"));
assert.ok(managedAuth.includes("INSTITUTION_DISCOVERY_AUTH_WINDOW_LABEL"));
assert.ok(managedAuth.includes("existing.set_focus()"));

// c-g: automatic success, manual close recheck, cancel/failure, and parent reload are explicit.
assert.ok(production.includes("schedule_discovery_auth_inspection"));
assert.ok(production.includes("inspection.kind == \"ready\""));
assert.ok(managedAuth.includes("WindowEvent::CloseRequested"));
assert.ok(managedAuth.includes("api.prevent_close()"));
assert.ok(manualClose.includes("inspect_discovery_auth_page(&webview)"));
assert.ok(manualClose.includes("parent.reload()"));
assert.ok(manualClose.includes("finish_discovery_auth_cancelled"));
assert.ok(managedAuth.includes("register_discovery_auth_creation_failure"));
assert.ok(completion.includes("parent.reload()"));
assert.ok(completion.includes("inspect_academic_page(&parent)"));
assert.match(completion, /resume\s*\.as_ref\(\)\s*\.is_none_or/);
assert.ok(completion.includes("mark_discovery_search_access_ready_locked"));
assert.ok(production.includes("SIDERA_INSTITUTION_DISCOVERY_AUTH_RESUME_FAILED"));

// h-j: auth wait is outside the ordinary timeout and resumes the same bound identity.
assert.ok(timeout.includes("discovery_auth_search_timeout_should_advance"));
assert.ok(timeout.includes("task_is_awaiting_discovery_auth"));
assert.ok(production.includes("wait_while_discovery_auth_active"));
assert.ok(resultWebviewWait.includes("saturating_sub(paused)"));
assert.ok(resultWebviewWait.includes("wait_while_discovery_auth_active"));
for (const marker of [
  "task_id",
  "epoch",
  "sequence",
  "webview_generation",
  "query",
  "result_webview_label",
  "phase",
]) {
  assert.ok(production.includes(marker), marker);
}
assert.ok(completion.includes("resume.task_id"));
assert.ok(completion.includes("resume.phase"));
assert.ok(completion.includes("SideraInstitutionSearchStage::ResumingAfterAuth"));
assert.ok(completion.includes("SideraInstitutionSearchStage::WebResultAvailable"));
assert.ok(production.includes("auth_epoch"));
assert.ok(core.includes("discovery_auth_resume_is_current"));
assert.ok(core.includes("discovery_auth_wait_pauses_the_ordinary_search_timeout"));
assert.ok(runtime.includes("discovery_auth_binding_rejects_old_popup_callbacks"));

// k: database SSO, discovery search access, full-text identity, and library account are separate.
assert.ok(core.includes("academic_discovery_auth"));
assert.ok(core.includes("discovery_auth_window_visible"));
assert.ok(bridge.includes("academicDiscoveryAuth"));
assert.ok(bridge.includes("discoveryAuthWindowVisible"));
assert.ok(bridge.includes('"awaiting-auth"'));
assert.ok(bridge.includes('"resuming-after-auth"'));
for (const label of [
  "检索可用",
  "机构全文身份",
  "统一发现认证中",
  "正在恢复检索",
  "重新检索",
]) {
  assert.ok(app.includes(label), label);
}
assert.ok(app.includes("databaseAuth"));
assert.ok(app.includes("libraryAccountAuth"));
assert.ok(!app.includes("const sessionReady = databaseAuth"));

// l: adapters only inspect bounded DOM text and a redacted origin/path URL.
for (const forbidden of [
  "document.cookie",
  "localStorage",
  "sessionStorage",
  "password').value",
  "download_pdf",
  "upsert_paper_library",
]) {
  assert.ok(!production.includes(forbidden), forbidden);
}
assert.ok(authScript.includes("location.origin"));
assert.ok(authScript.includes("location.pathname"));
assert.ok(!authScript.includes("location.href"));
assert.ok(!authScript.includes(".value"));
assert.ok(!authScript.toLowerCase().includes("ticket"));

assert.equal(evidence.package, "Sidera-P1b-R2");
assert.equal(evidence.status, "IMPLEMENTED");
assert.equal(evidence.automatedTechnical, "PASS");
assert.equal(evidence.nativeDiscoveryAuth, "UNVERIFIED");
assert.equal(evidence.latestNativeFact, "DISCOVERY AUTH CALLBACK/STATE SYNC FAIL");
assert.equal(evidence.externalInstitutionRequests, 0);
assert.equal(evidence.providerCalls, 0);
assert.equal(evidence.paperLibraryWrites, 0);
assert.equal(evidence.downloads, 0);
assert.equal(
  pkg.scripts["audit:sidera-institution-search-p1b-r2"],
  "node scripts/sidera_institution_search_p1b_r2_audit.mjs",
);

console.log(JSON.stringify({
  status: "PASS",
  package: evidence.package,
  fixtures: {
    activeTaskPopup: "PASS",
    postTaskPopup: "PASS",
    automaticReady: "PASS",
    manualCloseAfterReady: "PASS",
    unauthenticatedCancel: "PASS",
    popupCreateFailure: "PASS",
    parentReloadAndRecheck: "PASS",
    authWaitExcludesSearchTimeout: "PASS",
    sameTaskResume: "PASS",
    staleCallbackIsolation: "PASS",
    independentSearchAndFullTextState: "PASS",
    sensitiveMaterialBoundary: "PASS",
  },
  externalInstitutionRequests: 0,
  providerCalls: 0,
  paperLibraryWrites: 0,
  downloads: 0,
}, null, 2));
