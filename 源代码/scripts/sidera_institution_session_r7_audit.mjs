import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const read = (file) => readFile(path.join(root, file), "utf8");
const [core, runtime, tauriRoot, service, frontend] = await Promise.all([
  read("src-tauri/core/src/institution_search.rs"),
  read("src-tauri/src/sidera_institution_runtime.rs"),
  read("src-tauri/src/lib.rs"),
  read("src/lib/sideraInstitution.ts"),
  read("src/App.tsx"),
]);

const checks = [];
const check = (name, condition) => {
  assert.ok(condition, name);
  checks.push(name);
};

const restoreStart = runtime.indexOf("pub async fn sidera_institution_session_restore(");
const restoreEnd = runtime.indexOf("pub async fn sidera_institution_session_restore_cancel(", restoreStart);
const restoreCommand = runtime.slice(restoreStart, restoreEnd);
const restoreSequenceStart = runtime.indexOf("async fn run_session_restore(");
const restoreSequenceEnd = runtime.indexOf("#[tauri::command]", restoreSequenceStart);
const restoreSequence = runtime.slice(restoreSequenceStart, restoreSequenceEnd);
const createWebviewStart = runtime.indexOf("async fn create_institution_webview(");
const createWebviewEnd = runtime.indexOf("fn start_initial_navigation(", createWebviewStart);
const createWebview = runtime.slice(createWebviewStart, createWebviewEnd);
const restoreDiscoveryStart = runtime.indexOf("async fn restore_discovery_capability(");
const restoreDiscoveryEnd = runtime.indexOf("async fn restore_library_capability(", restoreDiscoveryStart);
const restoreDiscovery = runtime.slice(restoreDiscoveryStart, restoreDiscoveryEnd);
const restoreLibraryStart = runtime.indexOf("async fn restore_library_capability(");
const restoreLibraryEnd = runtime.indexOf("async fn run_session_restore(", restoreLibraryStart);
const restoreLibrary = runtime.slice(restoreLibraryStart, restoreLibraryEnd);
const libraryInspectStart = runtime.indexOf("const LIBRARY_AUTH_INSPECT_SCRIPT");
const libraryInspectEnd = runtime.indexOf("const CATALOG_INSPECT_SCRIPT", libraryInspectStart);
const libraryInspect = runtime.slice(libraryInspectStart, libraryInspectEnd);

check(
  "restore-command-is-separate-from-visible-session-ensure",
  restoreStart >= 0
    && tauriRoot.includes("sidera_institution_runtime::sidera_institution_session_restore")
    && service.includes('"sidera_institution_session_restore"')
    && !restoreCommand.includes("begin_institution_connection")
    && !restoreCommand.includes("create_connection_window"),
);
check(
  "restore-reuses-the-fixed-webview2-profile",
  runtime.includes('const INSTITUTION_DATA_DIRECTORY: &str = "institution-webview-v1/whu"')
    && runtime.includes(".join(INSTITUTION_DATA_DIRECTORY)")
    && runtime.includes(".data_directory(data_directory)"),
);
check(
  "restore-is-hidden-and-never-opens-auth-windows",
  runtime.includes("正在确认已有机构登录状态；不会打开认证窗口。")
    && runtime.includes("guard.session.browser_visible = false")
    && runtime.includes("guard.session.auth_modal_visible = false")
    && runtime.includes("guard.session.discovery_auth_window_visible = false")
    && !restoreCommand.includes("show_official_login_surface"),
);
check(
  "hidden-restore-webview-keeps-a-desktop-dom-viewport",
  createWebviewStart >= 0
    && createWebview.includes(".hide()")
    && createWebview.includes("INSTITUTION_BACKGROUND_TRANSPORT_WIDTH")
    && createWebview.includes("INSTITUTION_BACKGROUND_TRANSPORT_HEIGHT")
    && createWebview.includes("SIDERA_INSTITUTION_WEBVIEW_VIEWPORT_FAILED")
    && createWebview.indexOf(".hide()") < createWebview.lastIndexOf(".set_size("),
);
check(
  "restore-activates-discovery-through-the-versioned-official-page-route",
  restoreDiscoveryStart >= 0
    && restoreDiscovery.includes("WHU_LIBRARY_HOME_URL")
    && restoreDiscovery.includes("DISCOVERY_ROUTE_SCRIPT")
    && restoreDiscovery.includes('if action == "clicked"')
    && restoreDiscovery.includes("official academic-search tab is current")
    && !restoreDiscovery.includes("resolve_whu_academic_discovery_entry"),
);
check(
  "restore-activates-the-personal-library-route-inside-the-hidden-webview",
  restoreLibraryStart >= 0
    && restoreLibrary.includes("WHU_LIBRARY_HOME_URL")
    && restoreLibrary.includes("LIBRARY_ACCOUNT_ROUTE_SCRIPT")
    && runtime.includes("const safeActivate = (element)")
    && runtime.includes("typeof element.click === 'function'")
    && runtime.includes("element.dispatchEvent(new MouseEvent('click'")
    && runtime.includes("authentication-gateway")
    && !restoreLibrary.includes("create_connection_window")
    && !restoreLibrary.includes("show_official_login_surface"),
);
check(
  "personal-library-route-supports-the-official-bare-account-icon-and-login-card",
  runtime.includes("[class*=\"icon\" i]")
    && runtime.includes("武汉大学统一(?:身份)?认证登录")
    && runtime.includes("label.length > 0 && label.length <= 80")
    && runtime.includes("yonghu|denglu|iconfont"),
);
check(
  "personal-library-route-retries-late-official-header-for-the-full-bounded-capability-window",
  restoreLibrary.includes("while started.elapsed() < INSTITUTION_RESTORE_CAPABILITY_TIMEOUT")
    && !restoreLibrary.includes("unresolved_observations")
    && !restoreLibrary.includes("INSTITUTION_RESTORE_LIBRARY_ROUTE_GRACE")
    && !restoreLibrary.includes("route_advances"),
);
check(
  "personal-library-route-uses-the-confirmed-official-same-origin-login-route",
  runtime.includes("/\\bloginFn\\s*\\(/.test(inlineHandler)")
    && runtime.includes("const inlineHandler = clean(element.getAttribute?.('onclick'), 500)")
    && runtime.includes("const navigateOfficialLibraryLogin = () =>")
    && runtime.includes("const loginTarget = new URL('/login', location.origin)")
    && runtime.includes("loginTarget.searchParams.set('url', '')")
    && runtime.includes("loginTarget.searchParams.set('referer', location.href)")
    && runtime.includes("location.assign(loginTarget.href)")
    && runtime.includes("location.hostname === 'www.lib.whu.edu.cn' && location.pathname === '/'")
    && runtime.includes("control: 'official-library-login-route'")
    && runtime.includes("return navigateOfficialLibraryLogin()")
    && runtime.includes("if (typeof element.click === 'function') element.click()")
    && !runtime.includes("setTimeout(() => {\n        if (typeof element.click === 'function') element.click()"),
);
check(
  "personal-library-inspector-recognizes-the-confirmed-official-login-landing",
  libraryInspectStart >= 0
    && libraryInspect.includes("const pageTitle = clean(document.title, 200)")
    && libraryInspect.includes("const host = String(location.hostname ?? '').toLowerCase()")
    && libraryInspect.includes("location.pathname === '/page/902099/show'")
    && libraryInspect.includes("OFFICIAL_LIBRARY_LOGIN_LANDING"),
);
check(
  "silent-restore-reroutes-official-account-popups-into-the-hidden-parent",
  createWebview.includes("restore_inflight")
    && createWebview.includes("Silent restore never creates a visible authentication window")
    && createWebview.includes("parent.navigate(url.clone())")
    && createWebview.includes("NewWindowResponse::Deny"),
);
check(
  "personal-library-route-validates-url-text-before-resolution",
  runtime.includes("if (!candidate || candidate === 'undefined' || candidate === 'null') return null")
    && runtime.includes("const href = clean(element.getAttribute?.('href'), 2000)")
    && runtime.includes("const target = absolute(href)")
    && runtime.includes("const clickHandled = !href || href === '#' || /^javascript:/i.test(href)"),
);
check(
  "authentication-hosts-cannot-be-overwritten-by-catalog-adapter-drift",
  runtime.includes("fn is_whu_institution_auth_host")
    && runtime.includes('host.ends_with(".metaauth.com")')
    && runtime.includes("if status == SideraInstitutionSessionStatus::LoginRequired")
    && runtime.includes("Their DOM is not an OPAC/search result"),
);
check(
  "terminal-database-restore-truth-is-not-overwritten-by-later-capability-pages",
  createWebview.includes("restore_inflight && database_status != SideraInstitutionAuthStatus::Starting")
    && createWebview.includes("overwrite the already established DB truth"),
);
check(
  "restore-has-sequential-capability-and-total-budgets",
  runtime.includes("INSTITUTION_RESTORE_CAPABILITY_TIMEOUT: Duration = Duration::from_secs(10)")
    && runtime.includes("INSTITUTION_RESTORE_TOTAL_TIMEOUT: Duration = Duration::from_secs(30)")
    && runtime.includes("wait_for_database_restore_terminal")
    && runtime.includes("restore_discovery_capability")
    && runtime.includes("restore_library_capability"),
);
check(
  "restore-validates-capabilities-independently-after-database-outcome",
  restoreSequenceStart >= 0
    && restoreSequence.includes("restore_discovery_capability")
    && restoreSequence.includes("restore_library_capability")
    && !restoreSequence.includes("SIDERA_INSTITUTION_RESTORE_SKIPPED")
    && !restoreSequence.includes("后续能力未继续探测"),
);
check(
  "restore-is-epoch-and-generation-bound",
  runtime.includes("restore_epoch: u64")
    && runtime.includes("restore_inflight: bool")
    && runtime.includes("session_restore_is_current_locked")
    && core.includes("current_generation == value")
    && runtime.includes("invalidate_session_restore_locked"),
);
check(
  "manual-connect-reset-and-leave-invalidate-restore",
  runtime.includes("sidera_institution_session_restore_cancel")
    && runtime.includes("已离开机构资源，静默恢复已取消")
    && service.includes("cancelSideraInstitutionSessionRestore")
    && frontend.includes("cancelSideraInstitutionSessionRestore().catch")
    && runtime.match(/invalidate_session_restore_locked\(&mut guard\)/g)?.length >= 3,
);
check(
  "frontend-triggers-only-on-first-institution-entry",
  frontend.includes("institutionRestoreAttemptedRef")
    && frontend.includes("if (!isDesktopRuntime() || !institutionWorkspaceVisible) return undefined")
    && frontend.includes('current.status !== "uninitialized"')
    && frontend.includes("restoreSideraInstitutionSession()"),
);
check(
  "frontend-restore-survives-react-strict-mode-effect-probe",
  frontend.includes("const restoreTimer = window.setTimeout")
    && frontend.includes("window.clearTimeout(restoreTimer)")
    && frontend.includes("let restoreStarted = false")
    && frontend.includes("if (restoreStarted)")
    && frontend.indexOf("institutionRestoreAttemptedRef.current = true")
      > frontend.indexOf("const restoreTimer = window.setTimeout"),
);
check(
  "restore-keeps-ready-partial-login-required-and-failed-distinct",
  core.includes("pub fn classify_institution_restore_status")
    && core.includes("pub fn institution_restore_is_current")
    && runtime.includes("SIDERA_INSTITUTION_SESSION_RESTORE_READY")
    && runtime.includes("SIDERA_INSTITUTION_SESSION_RESTORE_PARTIAL")
    && runtime.includes("SIDERA_INSTITUTION_SESSION_RESTORE_LOGIN_REQUIRED")
    && runtime.includes("SIDERA_INSTITUTION_SESSION_RESTORE_FAILED"),
);
check(
  "restore-does-not-export-or-copy-cookies",
  !restoreCommand.includes("Cookie")
    && !restoreCommand.includes("cookie")
    && !restoreCommand.includes("clear_all_browsing_data")
    && !service.includes("cookie"),
);
check(
  "app-boot-and-non-institution-pages-do-not-start-restore",
  frontend.indexOf("restoreSideraInstitutionSession()")
    > frontend.indexOf("const institutionWorkspaceVisible")
    && frontend.includes("!institutionWorkspaceVisible"),
);
check(
  "closing-main-exits-the-app-even-while-hidden-institution-webviews-exist",
  tauriRoot.includes(".on_window_event(move |window, event|")
    && tauriRoot.includes('window.label() != "main"')
    && tauriRoot.includes("tauri::WindowEvent::CloseRequested")
    && tauriRoot.includes("window.app_handle().exit(0)"),
);

const mainCloseStart = tauriRoot.indexOf('if let tauri::WindowEvent::CloseRequested { api, .. } = event');
const mainCloseEnd = tauriRoot.indexOf('.manage(PaperImportTaskRegistry', mainCloseStart);
const mainClose = tauriRoot.slice(mainCloseStart, mainCloseEnd);
check(
  "main-default-destruction-is-prevented-before-queued-application-exit",
  mainCloseStart >= 0 && mainCloseEnd > mainCloseStart
    && mainClose.indexOf('api.prevent_close()') >= 0
    && mainClose.indexOf('api.prevent_close()') < mainClose.indexOf('window.app_handle().exit(0)')
    && !mainClose.includes('std::process::exit')
    && !mainClose.includes('.destroy()'),
);
check(
  "exit-trace-is-opt-in-and-uses-only-fixed-lifecycle-codes",
  tauriRoot.includes('std::env::var_os("SIDERA_EXIT_TRACE")')
    && tauriRoot.includes('value == "1"')
    && tauriRoot.includes('tauri::RunEvent::ExitRequested')
    && tauriRoot.includes('tauri::RunEvent::Exit => eprintln!("SIDERA_EXIT_EVENT")')
    && (tauriRoot.match(/eprintln!\("SIDERA_EXIT_[A-Z_]+"\)/g) ?? []).length === 4,
);

console.log(JSON.stringify({
  status: "PASS",
  package: "Sidera-014-R7-institution-session-restore",
  checks: checks.length,
  guarantees: {
    trigger: "first-institution-entry-only",
    profile: "institution-webview-v1/whu",
    windows: "hidden-no-auth-popup",
    lifecycle: "restore-epoch-and-webview-generation-bound",
    cookieHandling: "webview2-profile-only-no-export",
  },
}, null, 2));
