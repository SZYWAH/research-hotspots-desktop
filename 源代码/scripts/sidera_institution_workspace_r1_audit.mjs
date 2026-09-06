import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { runInNewContext } from "node:vm";
import {
  orderSideraResearchCandidates,
  paginateSideraResearchCandidates,
  shouldResetSideraResearchPresentation,
  sideraResearchFiltersAreActive,
  sideraResearchSnapshotKey,
  toggleSideraResearchPageSelection,
} from "../src/lib/sideraResearchPresentation.ts";

const root = process.cwd();
const read = (file) => readFile(path.join(root, file), "utf8");
const section = (source, start, end) => {
  const startAt = source.indexOf(start);
  assert.notEqual(startAt, -1, `missing section: ${start}`);
  const endAt = source.indexOf(end, startAt + start.length);
  return source.slice(startAt, endAt === -1 ? undefined : endAt);
};

const [
  app,
  styles,
  frontend,
  runtime,
  browser,
  core,
  connectionCore,
  institutionCore,
  coreLib,
  tauriLib,
  packageText,
  ...documents
] = await Promise.all([
  read("src/App.tsx"),
  read("src/index.css"),
  read("src/lib/sideraInstitution.ts"),
  read("src-tauri/src/sidera_institution_runtime.rs"),
  read("src-tauri/src/sidera_institution_browser.rs"),
  read("src-tauri/core/src/research_search.rs"),
  read("src-tauri/core/src/institution_connection.rs"),
  read("src-tauri/core/src/institution_search.rs"),
  read("src-tauri/core/src/lib.rs"),
  read("src-tauri/src/lib.rs"),
  read("package.json"),
  read("docs/PROJECT.md"),
  read("docs/ROADMAP.md"),
  read("docs/STATUS.md"),
  read("docs/ARCHITECTURE.md"),
  read("docs/DECISIONS.md"),
  read("docs/DEVELOPMENT.md"),
]);

const checks = [];
const check = (name, passed) => {
  assert.ok(passed, name);
  checks.push(name);
};

for (const marker of [
  "SideraInstitutionConnectionGoal",
  "SideraInstitutionConnectionPhase",
  "SideraInstitutionActiveConnection",
  "activeConnection?: SideraInstitutionActiveConnection | null",
  "beginSideraInstitutionConnection",
  "cancelSideraInstitutionConnection",
  '"sidera_institution_connection_begin"',
  '"sidera_institution_connection_cancel"',
]) check(`frontend-auth:${marker}`, frontend.includes(marker));

const primaryConnection = section(app, "async function openInstitutionConnection(", "async function cancelActiveInstitutionConnection(");
check("primary-connection-is-one-invoke-wrapper", primaryConnection.includes("beginSideraInstitutionConnection(goal)"));
check("primary-connection-does-not-start-legacy-session", !primaryConnection.includes("ensureSideraInstitutionSession"));
check("primary-connection-does-not-start-browser-second-time", !primaryConnection.includes("ensureSideraInstitutionBrowser"));

for (const marker of [
  "institution-primary-command",
  "institution-connection-strip",
  "institution-connection-drawer",
  "连接与来源",
  "连接机构",
  "修复连接",
  "仅人工访问 · 尚无连接器",
]) check(`ui:${marker}`, app.includes(marker));
check("drawer-default-closed", app.includes("const [connectionDrawerOpen, setConnectionDrawerOpen] = useState(false)"));
check("legacy-hero-hidden", styles.includes(".institution-workspace .institution-hero") && styles.includes("display: none"));
check("first-screen-prioritizes-results", styles.includes(".literature-workspace-institution") && styles.includes(".institution-native-results"));

for (const marker of [
  "SideraResearchSearchFilters",
  "resultLimit: 40 | 100",
  "retrievalPosition: SideraResearchRetrievalPosition",
  "providerBreakdown: SideraResearchSearchProviderBreakdown[]",
  "truth: SideraResearchSearchTruth",
  'orderBasis: "source-return-order"',
]) check(`frontend-search:${marker}`, frontend.includes(marker));

const startWrapper = section(frontend, "export async function startSideraResearchSearch", "export async function cancelSideraResearchSearch");
check("start-only-exposes-filters-and-result-limit", startWrapper.includes("filters: SideraResearchSearchFilters") && startWrapper.includes("resultLimit: 40 | 100"));
check("frontend-cannot-select-connectors", !startWrapper.includes("connectorIds"));

const results = section(app, "function ResearchSearchNativeResults(", "function researchSearchStatusLabel(");
check("local-pages-have-ten-records", results.includes("paginateSideraResearchCandidates(orderedCandidates, page, 10)"));
check("page-selection-is-page-scoped", results.includes("全选本页") && results.includes("toggleSideraResearchPageSelection("));
check("local-sort-has-four-orders", ["source-return-order", "newest", "oldest", "title"].every((value) => app.includes(`value=\"${value}\"`)));
check("local-page-and-sort-have-no-tauri-invoke", !results.includes("invoke("));
check("truth-summary-does-not-fake-total", results.includes("总命中未知") && results.includes("snapshot.truth.totalHits"));
check("provider-breakdown-is-folded", results.includes("research-search-diagnostics") && results.includes("provider.providerName"));
check("failed-truth-is-rendered", results.includes("failedTerminalSnapshot.truth") && results.includes("失败检索真值与来源"));
check("filtered-empty-is-explicit", results.includes("sideraResearchFiltersAreActive(snapshot.request.filters)"));

const orderedFixture = [
  { id: "unknown", title: "未标年", year: null, retrievalPosition: { rank: 1 } },
  { id: "new-first", title: "新论文甲", year: 2024, retrievalPosition: { rank: 2 } },
  { id: "new-second", title: "新论文乙", year: 2024, retrievalPosition: { rank: 3 } },
  { id: "old", title: "旧论文", year: 2020, retrievalPosition: { rank: 4 } },
];
assert.deepEqual(
  orderSideraResearchCandidates(orderedFixture, "source-return-order").map(({ id }) => id),
  ["unknown", "new-first", "new-second", "old"],
);
assert.deepEqual(
  orderSideraResearchCandidates(orderedFixture, "newest").map(({ id }) => id),
  ["new-first", "new-second", "old", "unknown"],
);
assert.deepEqual(
  orderSideraResearchCandidates(orderedFixture, "oldest").map(({ id }) => id),
  ["old", "new-first", "new-second", "unknown"],
);
assert.deepEqual(
  orderSideraResearchCandidates([
    { id: "later", title: "同题", year: 2024, retrievalPosition: { rank: 9 } },
    { id: "earlier", title: "同题", year: 2020, retrievalPosition: { rank: 2 } },
  ], "title").map(({ id }) => id),
  ["earlier", "later"],
);
check("semantic-local-sorts-are-stable-and-unknown-years-last", true);

const pagedFixture = Array.from({ length: 23 }, (_, index) => ({
  id: `record-${index + 1}`,
  title: `Record ${index + 1}`,
}));
const secondPage = paginateSideraResearchCandidates(pagedFixture, 2, 10);
assert.equal(secondPage.currentPage, 2);
assert.equal(secondPage.pageCount, 3);
assert.deepEqual(secondPage.candidates.map(({ id }) => id), Array.from({ length: 10 }, (_, index) => `record-${index + 11}`));
const selectedAcrossPages = toggleSideraResearchPageSelection(["record-1"], secondPage.candidates, true);
assert.ok(selectedAcrossPages.includes("record-1"));
assert.ok(secondPage.candidates.every(({ id }) => selectedAcrossPages.includes(id)));
assert.deepEqual(toggleSideraResearchPageSelection(selectedAcrossPages, secondPage.candidates, false), ["record-1"]);
check("semantic-pagination-and-cross-page-selection", true);

const retainedSnapshot = { taskId: "stable-task", epoch: 7 };
const retainedKey = sideraResearchSnapshotKey(retainedSnapshot);
assert.equal(shouldResetSideraResearchPresentation(retainedKey, retainedSnapshot), false);
assert.equal(shouldResetSideraResearchPresentation(retainedKey, { taskId: "new-task", epoch: 8 }), true);
assert.equal(sideraResearchFiltersAreActive({
  recordKinds: ["journal-article", "conference-paper", "thesis"],
  fullTextOnly: false,
}), false);
assert.equal(sideraResearchFiltersAreActive({
  recordKinds: ["journal-article"],
  fullTextOnly: false,
}), true);
check("semantic-failed-retry-retains-snapshot-and-filtered-empty-is-detectable", true);

for (const marker of [
  "SIDERA_RESEARCH_SEARCH_RESULT_LIMIT_INVALID",
  "ResearchSearchTruth",
  "ResearchSearchProviderBreakdown",
  "retrieval_position",
  "result_limit",
]) check(`core-search:${marker}`, core.includes(marker));
check("core-default-is-40", core.includes("RESEARCH_SEARCH_DEFAULT_RESULT_LIMIT") && core.includes("40"));
check("core-hard-limit-is-100", core.includes("RESEARCH_SEARCH_MAX_RESULT_LIMIT") && core.includes("100"));

for (const marker of [
  "sidera_institution_connection_begin",
  "sidera_institution_connection_cancel",
]) {
  check(`runtime-command:${marker}`, runtime.includes(marker));
  check(`tauri-registration:${marker}`, tauriLib.includes(marker));
}
check("auth-coordinator-is-core-owned", coreLib.includes("institution_connection"));
check("auth-coordinator-rejects-terminal-page-observations", connectionCore.includes("pub fn is_active")
  && runtime.includes("connection.is_active(token)"));
check("browser-event-remains-presentation-only", !section(browser, "pub struct SideraInstitutionBrowserState", "impl Default for SideraInstitutionBrowserState").includes("database_auth"));

const libraryInspection = section(
  runtime,
  'const LIBRARY_AUTH_INSPECT_SCRIPT: &str = r#"',
  "const CATALOG_INSPECT_SCRIPT",
);
const libraryScript = libraryInspection.match(/r#"\r?\n([\s\S]*?)\r?\n"#;/)?.[1];
assert.ok(libraryScript, "library auth inspection script must be extractable");
const fixtureElement = ({
  selectors = [],
  text = "",
  innerText = text,
  textContent = text,
  visible = true,
  attributes = {},
  id = "",
  className = "",
  descendants = [],
  tagName = "DIV",
  interactive = false,
  rect = { left: 920, top: 24, width: 160, height: 48 },
  computedStyles = {},
} = {}) => {
  const flatten = (elements) => elements.flatMap((element) => [element, ...flatten(element.descendants ?? [])]);
  const element = {
    selectors,
    descendants,
    innerText,
    textContent,
    hidden: false,
    id,
    className,
    tagName,
    computedStyles,
    parentElement: null,
    getAttribute(name) {
      return attributes[name] ?? null;
    },
    getClientRects() {
      return visible ? [{}] : [];
    },
    getBoundingClientRect() {
      return {
        ...rect,
        right: rect.left + rect.width,
        bottom: rect.top + rect.height,
      };
    },
    matches(selector) {
      return interactive && /a, button|role="button"|aria-haspopup|tabindex/.test(selector);
    },
    closest(selector) {
      let current = this;
      while (current) {
        if (current.selectors.some((marker) => selector.includes(marker))) return current;
        current = current.parentElement;
      }
      return null;
    },
    querySelectorAll(selector) {
      const nested = flatten(descendants);
      return selector === "*"
        ? nested
        : nested.filter((candidate) => candidate.selectors.some((marker) => selector.includes(marker)));
    },
  };
  for (const descendant of descendants) descendant.parentElement = element;
  return element;
};
const flattenFixtureElements = (elements) => elements.flatMap((element) => [
  element,
  ...flattenFixtureElements(element.descendants ?? []),
]);
const inspectLibraryFixture = ({ body = "", elements = [], host = "www.lib.whu.edu.cn" } = {}) => runInNewContext(
  libraryScript,
  {
    document: {
      body: { innerText: body },
      documentElement: { clientWidth: 1200, clientHeight: 720 },
      querySelectorAll(selector) {
        return flattenFixtureElements(elements)
          .filter((element) => element.selectors.some((marker) => selector.includes(marker)));
      },
    },
    location: { origin: `https://${host}`, hostname: host, pathname: "/" },
    innerWidth: 1200,
    innerHeight: 720,
    getComputedStyle: (element, pseudo = "base") => ({
      display: "block",
      visibility: "visible",
      opacity: "1",
      cursor: "default",
      backgroundImage: "none",
      maskImage: "none",
      webkitMaskImage: "none",
      content: "none",
      ...(element?.computedStyles?.[pseudo] ?? {}),
    }),
  },
);

const residualLogin = fixtureElement({ selectors: ["button"], text: "登录我的图书馆" });
const authenticatedMenu = fixtureElement({
  selectors: ['header [class*="username" i]'],
  text: "脱敏用户标识",
  className: "top-username",
  attributes: { "aria-haspopup": "true" },
});
const authenticatedWithResidualLogin = inspectLibraryFixture({
  body: "登录我的图书馆",
  elements: [residualLogin, authenticatedMenu],
});
assert.equal(authenticatedWithResidualLogin.kind, "library-ready");
assert.equal(authenticatedWithResidualLogin.title, "");
assert.ok(!JSON.stringify(authenticatedWithResidualLogin).includes("脱敏用户标识"));

const hiddenPassword = fixtureElement({ selectors: ['input[type="password"]'], visible: false });
assert.equal(inspectLibraryFixture({ elements: [hiddenPassword] }).kind, "unknown");
const visiblePassword = fixtureElement({ selectors: ['input[type="password"]'] });
assert.equal(inspectLibraryFixture({ elements: [visiblePassword] }).kind, "unknown");
const visiblePasswordForm = fixtureElement({ selectors: ["form"], descendants: [visiblePassword] });
const passwordInspection = inspectLibraryFixture({ elements: [visiblePasswordForm] });
assert.equal(passwordInspection.kind, "login-required");
assert.equal(passwordInspection.message, "LOGIN_VISIBLE_PASSWORD");
const authenticationLoginButton = fixtureElement({
  selectors: ["button"],
  text: "登录",
  interactive: true,
});
const authenticationLoginForm = fixtureElement({ selectors: ["form"], descendants: [authenticationLoginButton] });
const authenticationFormInspection = inspectLibraryFixture({
  elements: [authenticationLoginForm],
  host: "cas.whu.edu.cn",
});
assert.equal(authenticationFormInspection.kind, "login-required");
assert.equal(authenticationFormInspection.message, "LOGIN_VISIBLE_FORM");
const bodyHintInspection = inspectLibraryFixture({ body: "统一身份认证" });
assert.equal(bodyHintInspection.kind, "unknown");
assert.equal(bodyHintInspection.message, "UNKNOWN_BODY_HINT");
assert.equal(inspectLibraryFixture({ body: "我的图书馆" }).kind, "unknown");

const publicUserService = fixtureElement({
  selectors: ['header [class*="user" i]', "header div"],
  text: "新生 校友 工作网",
  className: "user-service",
});
assert.equal(inspectLibraryFixture({ elements: [publicUserService] }).kind, "unknown");
const publicNavigationDropdown = fixtureElement({
  selectors: ['nav [aria-haspopup="true"]', "header [aria-haspopup]"],
  text: "相关链接",
  attributes: { "aria-haspopup": "true" },
});
assert.equal(inspectLibraryFixture({ elements: [publicNavigationDropdown] }).kind, "unknown");

const avatar = fixtureElement({ selectors: ['[class*="avatar" i]'], className: "avatar" });
const caret = fixtureElement({ selectors: ['[class*="caret" i]'], className: "caret" });
const structuralUserMenu = fixtureElement({
  selectors: ["header div"],
  text: "脱敏用户标识",
  descendants: [avatar, caret],
});
assert.equal(inspectLibraryFixture({ elements: [structuralUserMenu] }).kind, "library-ready");

const plainAvatar = fixtureElement({
  selectors: ["img"],
  tagName: "IMG",
  rect: { left: 944, top: 32, width: 32, height: 32 },
});
const plainImageAccount = fixtureElement({
  selectors: ["header div"],
  text: "脱敏用户标识",
  descendants: [plainAvatar],
});
const plainImageReady = inspectLibraryFixture({
  body: "登录我的图书馆",
  elements: [residualLogin, plainImageAccount],
});
assert.equal(plainImageReady.kind, "library-ready");
assert.ok(!JSON.stringify(plainImageReady).includes("脱敏用户标识"));

const hiddenLogout = fixtureElement({ selectors: ["button"], text: "退出登录", visible: false });
const genericAvatar = fixtureElement({
  selectors: ["img"],
  tagName: "IMG",
  rect: { left: 944, top: 32, width: 32, height: 32 },
});
const genericAccount = fixtureElement({
  selectors: ["a"],
  innerText: "示例账号",
  textContent: "示例账号 退出登录 个人信息 我的借阅",
  interactive: true,
  descendants: [genericAvatar, hiddenLogout],
});
const genericAccountInspection = inspectLibraryFixture({
  body: "统一身份认证 登录我的图书馆",
  elements: [residualLogin, genericAccount],
});
assert.equal(genericAccountInspection.kind, "library-ready");
assert.equal(genericAccountInspection.message, "READY_TOP_RIGHT_VISUAL");
assert.ok(!JSON.stringify(genericAccountInspection).includes("示例账号"));

const unclassifiedAvatar = fixtureElement({
  selectors: ["img"],
  tagName: "IMG",
  rect: { left: 944, top: 32, width: 32, height: 32 },
});
const unclassifiedCaret = fixtureElement({
  selectors: ["svg"],
  tagName: "SVG",
  rect: { left: 1082, top: 42, width: 14, height: 14 },
});
const unclassifiedAccount = fixtureElement({
  selectors: ["div"],
  text: "示例用户",
  descendants: [unclassifiedAvatar, unclassifiedCaret],
});
const unclassifiedAccountInspection = inspectLibraryFixture({ elements: [unclassifiedAccount] });
assert.equal(unclassifiedAccountInspection.kind, "library-ready");
assert.equal(unclassifiedAccountInspection.message, "READY_TOP_RIGHT_VISUAL");

const plainAvatarSvg = fixtureElement({
  selectors: ["svg"],
  tagName: "SVG",
  rect: { left: 946, top: 32, width: 30, height: 30 },
});
const plainSvgAccount = fixtureElement({
  selectors: ["header button"],
  text: "示例用户",
  interactive: true,
  descendants: [plainAvatarSvg],
});
assert.equal(inspectLibraryFixture({ elements: [plainSvgAccount] }).kind, "library-ready");

const cssAvatar = fixtureElement({
  selectors: ["span"],
  rect: { left: 944, top: 32, width: 32, height: 32 },
  computedStyles: { base: { backgroundImage: "url(avatar-placeholder)" } },
});
const cssAvatarAccount = fixtureElement({
  selectors: ["header div"],
  text: "示例读者",
  descendants: [cssAvatar],
});
assert.equal(inspectLibraryFixture({ elements: [cssAvatarAccount] }).kind, "library-ready");

const pseudoAvatar = fixtureElement({
  selectors: ["span"],
  rect: { left: 944, top: 32, width: 32, height: 32 },
  computedStyles: { "::before": { maskImage: "url(avatar-mask-placeholder)" } },
});
const pseudoAvatarAccount = fixtureElement({
  selectors: ["header div"],
  text: "示例账号",
  descendants: [pseudoAvatar],
});
assert.equal(inspectLibraryFixture({ elements: [pseudoAvatarAccount] }).kind, "library-ready");

const fontAvatar = fixtureElement({
  selectors: ["i"],
  tagName: "I",
  className: "icon-user",
  rect: { left: 944, top: 32, width: 32, height: 32 },
  computedStyles: { "::before": { content: '"\\e001"' } },
});
const fontAvatarAccount = fixtureElement({
  selectors: ["a"],
  text: "示例读者",
  interactive: true,
  descendants: [fontAvatar],
});
assert.equal(inspectLibraryFixture({ elements: [fontAvatarAccount] }).kind, "library-ready");

const publicLogo = fixtureElement({
  selectors: ["header div"],
  text: "武汉大学图书馆",
  descendants: [plainAvatar],
});
assert.equal(inspectLibraryFixture({ elements: [publicLogo] }).kind, "unknown");
const publicIconNavigation = fixtureElement({
  selectors: ["header button"],
  text: "首页",
  interactive: true,
  descendants: [plainAvatarSvg],
});
assert.equal(inspectLibraryFixture({ elements: [publicIconNavigation] }).kind, "unknown");
const hiddenVisualAccount = fixtureElement({
  selectors: ["header div"],
  text: "示例账号",
  visible: false,
  descendants: [plainAvatar],
});
assert.equal(inspectLibraryFixture({ elements: [hiddenVisualAccount] }).kind, "unknown");
const ancestorHiddenAvatar = fixtureElement({
  selectors: ["img"],
  tagName: "IMG",
  rect: { left: 944, top: 32, width: 32, height: 32 },
});
const ancestorHiddenAccount = fixtureElement({
  selectors: ["a"],
  text: "示例账号",
  interactive: true,
  descendants: [ancestorHiddenAvatar],
});
const transparentAncestor = fixtureElement({
  selectors: ["div"],
  descendants: [ancestorHiddenAccount],
  computedStyles: { base: { opacity: "0" } },
});
assert.equal(inspectLibraryFixture({ elements: [transparentAncestor] }).kind, "unknown");

const delayedLogin = inspectLibraryFixture({
  elements: [authenticationLoginForm],
  host: "cas.whu.edu.cn",
});
const delayedReady = inspectLibraryFixture({ elements: [genericAccount] });
assert.equal(delayedLogin.kind, "login-required");
assert.equal(delayedReady.kind, "library-ready");
check("library-auth-dom-fixtures", true);

const readyAt = libraryInspection.indexOf("return base('library-ready'");
const loginAt = libraryInspection.indexOf("return base('login-required'");
check("library-strong-ready-precedes-visible-login", readyAt !== -1 && loginAt !== -1 && readyAt < loginAt);
check("library-auth-does-not-serialize-identity", libraryInspection.includes("title: ''") && !libraryInspection.includes("clean(body, 300)"));
check("library-generic-my-library-is-not-ready", !libraryInspection.includes("|我的图书馆/i.test(body)"));
check("library-global-top-right-account-menu-is-boolean-only", libraryInspection.includes("topRightVisualAccountMenu")
  && libraryInspection.includes("globalVisualSeeds")
  && libraryInspection.includes(".slice(0, 1200).filter(visible)")
  && libraryInspection.includes("depth <= 5")
  && libraryInspection.includes("tag === 'img' || tag === 'svg'")
  && libraryInspection.includes("backgroundImage")
  && libraryInspection.includes("maskImage")
  && libraryInspection.includes("hasPseudoGlyph"));
check("library-visible-text-precedes-text-content-fallback", libraryInspection.includes("const rendered = clean(element?.innerText")
  && libraryInspection.includes("if (rendered) return rendered"));
check("library-body-login-copy-is-hint-only", libraryInspection.includes("UNKNOWN_BODY_HINT")
  && !libraryInspection.includes("visiblePasswordForm || visibleAuthenticationForm ||"));
const mainNavigation = section(runtime, "fn handle_navigation_completed(", "async fn configure_webview_platform(");
check("hidden-library-parent-does-not-hardcode-login-required", !mainNavigation.includes('"SIDERA_INSTITUTION_LIBRARY_LOGIN_REQUIRED"'));
const libraryNavigationOwner = section(mainNavigation,
  "auth_kind == SideraInstitutionAuthKind::LibraryAccount",
  "match role {");
check("library-navigation-completed-does-not-publish-pending", libraryNavigationOwner.includes("Finished page-load callback is the sole owner")
  && !libraryNavigationOwner.includes("SIDERA_INSTITUTION_LIBRARY_PAGE_INSPECTION_PENDING"));
const hiddenWebview = section(runtime, "async fn create_institution_webview(", "fn start_initial_navigation(");
check("library-parent-observation-is-active-token-claimed", hiddenWebview.includes("claim_library_parent_observation_locked")
  && hiddenWebview.indexOf("claim_library_parent_observation_locked") < hiddenWebview.indexOf("if pending"));
check("terminal-library-popup-is-rejected", hiddenWebview.includes("library_parent_popup_is_authorized_locked")
  && runtime.includes("Some(token) =>")
  && runtime.includes("connection_accepts_page_observation_locked(guard, &token)"));
const sharedBrowserObservation = section(runtime, "pub(crate) fn observe_shared_browser_page(", "fn session_from_url(");
check("shared-browser-url-starting-does-not-own-library-truth", sharedBrowserObservation.includes("status != SideraInstitutionAuthStatus::Starting"));
const connectionPopup = section(runtime,
  "fn create_library_connection_auth_popup(",
  "fn create_connection_window(");
const connectionWindow = section(runtime,
  "fn create_connection_window(",
  "fn finish_library_auth_modal(");
const connectionCloseRequested = section(connectionWindow,
  "let close_webview = window.as_ref().clone();",
  "WindowEvent::Destroyed => {");
const legacyAuthFinish = section(runtime,
  "fn finish_library_auth_modal(",
  "fn handle_navigation_completed(");
const legacyAuthModal = section(runtime,
  "fn create_library_auth_modal(",
  "fn close_library_auth_modal(");
const beginConnection = section(runtime,
  "async fn begin_institution_connection(",
  "#[tauri::command]\npub async fn sidera_institution_connection_begin(");
const focusExistingConnection = section(beginConnection,
  "InstitutionConnectionBeginOutcome::FocusExisting(token) => {",
  "InstitutionConnectionBeginOutcome::Busy(_)");
const finalizeConnection = section(runtime,
  "fn finalize_connection_locked(",
  "fn mark_connection_login_required_locked(");
const resetSession = section(runtime,
  "pub async fn sidera_institution_session_reset(",
  "pub async fn sidera_institution_browser_show(");
const finalizedConnectionClose = section(runtime,
  "fn close_finalized_connection_window(",
  "fn mark_connection_login_required_locked(");
check("library-connection-popup-is-managed-opener-window", connectionPopup.includes("INSTITUTION_CONNECTION_AUTH_WINDOW_LABEL")
  && connectionPopup.includes("get_webview_window(INSTITUTION_CONNECTION_AUTH_WINDOW_LABEL)")
  && connectionPopup.includes(".window_features(features)")
  && connectionPopup.includes("NewWindowResponse::Create { window }")
  && !connectionPopup.includes(".data_directory(")
  && connectionPopup.includes("attach the requested popup to its real opener/environment"));
check("library-connection-popup-does-not-replay-sensitive-target", !connectionPopup.includes("navigate(target)")
  && !connectionWindow.includes("navigate(target)")
  && !connectionPopup.includes("target.to_string()")
  && !connectionPopup.includes("target.as_str()"));
check("library-connection-popup-is-token-and-phase-bound", connectionPopup.includes("library_connection_popup_is_authorized_locked")
  && runtime.includes("connection_accepts_page_observation_locked(guard, token)"));
check("library-connection-popup-singleton-is-bound-to-current-token", runtime.includes("connection_auth_popup_token: Option<InstitutionConnectionToken>")
  && connectionPopup.includes("library_connection_popup_is_bound_locked")
  && connectionPopup.includes("let _ = existing.close()"));
check("library-connection-popup-binding-has-terminal-and-reset-cleanup", connectionPopup.includes("bind_library_connection_popup_locked")
  && connectionPopup.includes("clear_matching_library_connection_popup_locked")
  && finalizeConnection.includes("clear_matching_library_connection_popup_locked(guard, token)")
  && resetSession.includes("guard.connection_auth_popup_token = None"));
check("library-connection-popup-page-load-uses-same-token-observer", connectionPopup.includes("schedule_connection_page_observation")
  && connectionPopup.includes("page_token.clone()")
  && connectionPopup.includes("SideraInstitutionConnectionVerificationSurface::AuthWindow"));
check("library-connection-popup-denies-unmanaged-secondary-popups", connectionPopup.includes(".on_new_window(|_target, _features| NewWindowResponse::Deny)")
  && !connectionPopup.includes("NewWindowResponse::Allow"));
check("library-connection-popup-destroyed-refreshes-fixed-real-parent", connectionPopup.includes("WindowEvent::Destroyed")
  && connectionPopup.includes("claim_library_connection_popup_parent_refresh_locked")
  && connectionPopup.indexOf("clear_matching_library_connection_popup_locked") < connectionPopup.indexOf("claim_library_connection_popup_parent_refresh_locked")
  && connectionPopup.includes("get_webview_window(INSTITUTION_CONNECTION_WINDOW_LABEL)")
  && connectionPopup.includes("Url::parse(WHU_LIBRARY_HOME_URL)")
  && connectionPopup.includes("parent.navigate(landing)"));
check("library-connection-popup-create-failures-terminate-cleanly", connectionPopup.includes("SIDERA_INSTITUTION_CONNECTION_AUTH_POPUP_TARGET_REJECTED")
  && connectionPopup.includes("SIDERA_INSTITUTION_CONNECTION_AUTH_POPUP_CREATE_FAILED")
  && connectionPopup.includes("InstitutionConnectionTerminal::Failed"));
check("connection-terminal-closes-popup-and-parent", finalizedConnectionClose.includes("INSTITUTION_CONNECTION_AUTH_WINDOW_LABEL")
  && finalizedConnectionClose.includes("INSTITUTION_CONNECTION_WINDOW_LABEL"));
check("legacy-library-auth-cannot-override-active-coordinator", legacyAuthFinish.includes("active_connection_owns_auth_locked")
  && legacyAuthFinish.includes("(None, true)")
  && legacyAuthFinish.includes("if !coordinator_owns_auth")
  && legacyAuthModal.includes("active_connection_owns_auth_locked")
  && legacyAuthModal.includes("return NewWindowResponse::Deny"));
check("connection-start-closes-stale-legacy-auth-window", connectionWindow.includes("get_webview_window(INSTITUTION_AUTH_WINDOW_LABEL)")
  && connectionWindow.includes("let _ = stale.close()"));
check("focus-existing-prefers-bound-popup-before-parent", focusExistingConnection.includes("library_connection_popup_is_bound_locked")
  && focusExistingConnection.indexOf("INSTITUTION_CONNECTION_AUTH_WINDOW_LABEL") < focusExistingConnection.indexOf("INSTITUTION_CONNECTION_WINDOW_LABEL"));
check("blank-reentry-hotfix-was-not-retained", !runtime.includes("ConnectionWindowNavigationState")
  && !runtime.includes("ConnectionWindowPageLoadAction")
  && !runtime.includes("ReenterLibraryLanding"));
const closeBudgetMatch = connectionCore.match(/INSTITUTION_CONNECTION_CLOSE_VERIFY_BUDGET_MS:\s*u64\s*=\s*([\d_]+)/);
const closeBudgetMs = Number((closeBudgetMatch?.[1] ?? "NaN").replaceAll("_", ""));
const closeEvalSliceMatch = runtime.match(/CONNECTION_CLOSE_EVAL_SLICE:\s*Duration\s*=\s*Duration::from_millis\(([\d_]+)\)/);
const closeEvalSliceMs = Number((closeEvalSliceMatch?.[1] ?? "NaN").replaceAll("_", ""));
const closeVerification = section(runtime, "async fn verify_connection_before_close(", "fn schedule_connection_page_observation(");
const closeVerificationRoutes = section(runtime,
  "enum InstitutionConnectionParentVerificationRoute",
  "struct InstitutionConnectionInspectionEvidence");
const sameVisibleLibraryVerification = section(closeVerification,
  "InstitutionConnectionParentVerificationRoute::SameVisibleLibraryLanding => {",
  "InstitutionConnectionParentVerificationRoute::HiddenBoundParentReload => {");
check("connection-close-uses-one-deadline-and-short-evals", closeEvalSliceMs < closeBudgetMs
  && closeVerification.includes("tokio::time::timeout(")
  && closeVerification.includes("inspect_connection_surface_before_deadline"));
check("connection-close-passes-the-visible-connection-webview", connectionCloseRequested.startsWith("let close_webview = window.as_ref().clone();")
  && connectionCloseRequested.includes("let verify_webview = close_webview.clone();")
  && /verify_connection_before_close\(\s*verify_app,\s*verify_inner,\s*verify_webview,\s*verify_token,/s.test(connectionCloseRequested)
  && !connectionCloseRequested.includes("INSTITUTION_WEBVIEW_LABEL"));
check("library-close-reserves-budget-for-one-current-check", closeVerificationRoutes.includes("SideraInstitutionConnectionGoal::LibraryAccount => 1")
  && closeVerification.includes("connection_close_current_attempts(token.goal)"));
check("library-close-verifies-the-visible-popup-environment", sameVisibleLibraryVerification.includes("Url::parse(WHU_LIBRARY_HOME_URL)")
  && sameVisibleLibraryVerification.includes("webview.navigate(landing)")
  && sameVisibleLibraryVerification.includes("webview.clone()")
  && !sameVisibleLibraryVerification.includes("INSTITUTION_WEBVIEW_LABEL")
  && !sameVisibleLibraryVerification.includes(".reload()"));
check("non-library-close-keeps-the-hidden-parent-fallback", closeVerification.includes("InstitutionConnectionParentVerificationRoute::HiddenBoundParentReload")
  && closeVerification.includes("app.get_webview(INSTITUTION_WEBVIEW_LABEL)")
  && closeVerification.includes("parent.reload()"));
check("connection-page-observation-retries-and-rejects-terminal", runtime.includes("CONNECTION_PAGE_OBSERVATION_ATTEMPTS: u8 = 4")
  && runtime.includes("connection_accepts_page_observation_locked"));
check("connection-login-required-needs-two-stable-observations", runtime.includes("CONNECTION_LOGIN_REQUIRED_STABILITY_OBSERVATIONS: u8 = 2")
  && closeVerification.includes("current_login_required_streak")
  && closeVerification.includes("parent_login_required_streak")
  && runtime.includes("let mut login_required_streak = 0_u8"));
const verificationEvent = section(institutionCore,
  "pub struct SideraInstitutionConnectionVerificationEvent",
  "pub fn push_bounded_navigation_event");
check("connection-verification-trace-is-bounded-to-12", institutionCore.includes("INSTITUTION_CONNECTION_VERIFICATION_TRACE_LIMIT: usize = 12")
  && institutionCore.includes("push_bounded_connection_verification_event")
  && institutionCore.includes("pub connection_verification_trace: Vec<SideraInstitutionConnectionVerificationEvent>"));
check("connection-verification-event-is-metadata-only", [
  "transaction_id", "stage", "surface", "verdict", "reason_code", "attempt", "elapsed_ms", "timestamp_ms",
].every((field) => verificationEvent.includes(field))
  && !/url|dom|cookie|account|identity|credential|password|query|form/i.test(verificationEvent));
check("connection-verification-records-all-required-stages", [
  "PageObservation", "CloseCurrent", "CloseParent", "Resolved",
  ].every((stage) => runtime.includes(`SideraInstitutionConnectionVerificationStage::${stage}`))
  && runtime.includes('"PARENT_MISSING"')
  && runtime.includes('"NAVIGATE_FAILED"')
  && runtime.includes('"RELOAD_FAILED"')
  && runtime.includes('"DEADLINE"'));
check("connection-verification-reason-message-is-whitelisted", runtime.includes("whitelisted_connection_inspection_reason")
  && runtime.includes('"READY_TOP_RIGHT_VISUAL"')
  && runtime.includes('"LOGIN_VISIBLE_PASSWORD"')
  && !runtime.includes("reason_code: page.message"));
const technicalDiagnosis = section(app, "<summary>技术诊断</summary>", "</details>");
check("technical-diagnosis-shows-terminal-code-and-verification-trace", technicalDiagnosis.includes("session.activeConnection.code")
  && technicalDiagnosis.includes("connectionVerificationTrace.slice(-12)")
  && technicalDiagnosis.includes("event.reasonCode")
  && technicalDiagnosis.includes("event.elapsedMs"));

const serializedPublicContract = `${frontend}\n${core}\n${institutionCore}`.toLowerCase();
for (const forbidden of ["cookie:", "password:", "ticket:", "form_value", "query_params"]) {
  check(`no-sensitive-field:${forbidden}`, !serializedPublicContract.includes(forbidden));
}

const pkg = JSON.parse(packageText);
check("package-exposes-workspace-audit", pkg.scripts["audit:sidera-institution-workspace-r1"] === "node --experimental-strip-types scripts/sidera_institution_workspace_r1_audit.mjs");

for (const document of documents) {
  check("document-development-014", document.includes("开发 014"));
  check("document-keeps-p1-partial", document.includes("PARTIAL / ADAPTER DEFERRED"));
  check("document-does-not-claim-new-wos-connector", !document.includes("WOS CONNECTOR PASS"));
}
check("decision-d165", documents[4].includes("D-165"));

process.stdout.write(`${JSON.stringify({
  audit: "sidera-institution-workspace-r1",
  status: "PASS",
  checkCount: checks.length,
  checks,
}, null, 2)}\n`);
