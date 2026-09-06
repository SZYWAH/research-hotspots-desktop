import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const read = (file) => readFile(path.join(root, file), "utf8");

const [
  core,
  coreImportReview,
  runtime,
  protocol,
  importReview,
  tauriLib,
  institutionTypes,
  desktopBridge,
  app,
  packageText,
  evidenceText,
  ...documents
] = await Promise.all([
  read("src-tauri/core/src/research_search.rs"),
  read("src-tauri/core/src/import_review.rs"),
  read("src-tauri/src/sidera_institution_runtime.rs"),
  read("src-tauri/src/sidera_institution_protocol.rs"),
  read("src-tauri/src/sidera_import_review.rs"),
  read("src-tauri/src/lib.rs"),
  read("src/lib/sideraInstitution.ts"),
  read("src/lib/desktop.ts"),
  read("src/App.tsx"),
  read("package.json"),
  read("docs/evidence/sidera-p2a-r1-background-search-review-2026-08-05.json"),
  read("docs/PROJECT.md"),
  read("docs/ROADMAP.md"),
  read("docs/STATUS.md"),
  read("docs/ARCHITECTURE.md"),
  read("docs/DECISIONS.md"),
  read("docs/DEVELOPMENT.md"),
]);

const pkg = JSON.parse(packageText);
const evidence = JSON.parse(evidenceText);
const checks = [];
const check = (name, passed) => {
  assert.ok(passed, name);
  checks.push(name);
};

for (const marker of [
  "pub trait LiteratureConnector",
  "pub struct ResearchSearchStore",
  "pub type ResearchSearchOrchestrator = ResearchSearchStore",
  "pub struct NormalizedCandidateDraft",
  "WHU_ACADEMIC_DISCOVERY_V2_CONNECTOR_ID",
  '"whu-academic-discovery-v2"',
  "ResearchSearchStatus",
  "CheckingSession",
  "AwaitingUserAuth",
  "ResolvingConnectors",
  "Normalizing",
]) {
  check(`core:${marker}`, core.includes(marker));
}

for (const kind of ["JournalArticle", "ConferencePaper", "Thesis"]) {
  check(`paper-kind:${kind}`, core.includes(kind));
}
for (const exclusion of ["excluded_non_paper", "excluded_unknown", "excluded_invalid"]) {
  check(`source-report:${exclusion}`, core.includes(exclusion));
}
for (const identity of ["normalize_doi", "provider_record_id", "canonical_url", "first_author"]) {
  check(`identity:${identity}`, core.includes(identity));
}
check(
  "provider-identity-is-source-scoped",
  core.includes("fn normalize_identity_source")
    && core.includes('"provider:{}:{}"')
    && core.includes("provider_record_identity_is_scoped_to_the_source_database"),
);
check(
  "canonical-locator-strips-auth-query",
  core.includes("fn is_sensitive_locator_query_key")
    && core.includes('normalized.contains("ticket")')
    && core.includes('normalized.contains("token")')
    && core.includes('normalized.contains("session")')
    && core.includes('Some("https://provider.example/record/secret?record=42")'),
);
check(
  "candidate-limit:40",
  core.includes("RESEARCH_SEARCH_MAX_ITEMS: usize = INSTITUTION_TOTAL_ITEM_LIMIT")
    && core.includes("assert_eq!(RESEARCH_SEARCH_MAX_ITEMS, 40)"),
);
check(
  "page-size:20",
  core.includes("RESEARCH_SEARCH_SOURCE_ITEM_LIMIT: usize = INSTITUTION_BUCKET_ITEM_LIMIT")
    && core.includes("page_size: RESEARCH_SEARCH_SOURCE_ITEM_LIMIT"),
);
check("timeout:90s", core.includes("RESEARCH_SEARCH_TIMEOUT_MS: u64 = 90_000"));
check(
  "runtime-capability-is-honest-dom-fallback",
  core.includes("transport: LiteratureConnectorTransport::DomFallback")
    && core.includes("experimental_fallback: true"),
);
check("search-result-carries-observed-transport", core.includes("pub observed_transport: Option<LiteratureConnectorTransport>"));

const commandNames = [
  "sidera_research_search_start",
  "sidera_research_search_cancel",
  "sidera_research_search_snapshot",
  "sidera_import_review_create_from_search",
];
for (const command of commandNames) {
  check(`runtime-command:${command}`, runtime.includes(`fn ${command}`));
  check(`tauri-command:${command}`, tauriLib.includes(`sidera_institution_runtime::${command}`));
  check(`frontend-command:${command}`, institutionTypes.includes(`\"${command}\"`) || desktopBridge.includes(`\"${command}\"`));
}
check("opaque-record-open-command", runtime.includes("fn sidera_research_result_open"));
check("opaque-record-open-registered", tauriLib.includes("sidera_institution_runtime::sidera_research_result_open"));

check("raw-detail-url-not-serialized", /#\[serde\(default, skip_serializing\)\]\s*pub canonical_url: Option<String>/.test(core));
check("raw-fulltext-url-not-serialized", /#\[serde\(default, skip_serializing\)\]\s*pub full_text_url: Option<String>/.test(core));
check("opaque-detail-locator", core.includes("pub detail_locator: Option<String>"));
check("opaque-fulltext-locator", core.includes("pub full_text_locator: Option<String>"));
const candidateType = institutionTypes.slice(
  institutionTypes.indexOf("export type SideraNormalizedCandidateDraft"),
  institutionTypes.indexOf("export type SideraResearchSearchSourceReport"),
);
check("frontend-candidate-has-no-canonical-url", !candidateType.includes("canonicalUrl"));
check("frontend-candidate-has-no-fulltext-url", !candidateType.includes("fullTextUrl"));
check("frontend-candidate-uses-locators", candidateType.includes("detailLocator") && candidateType.includes("fullTextLocator"));

check("protocol-has-no-tauri-command", !protocol.includes("#[tauri::command]"));
check("protocol-secret-not-serializable", protocol.includes("pub(crate) struct SecretBytes") && !protocol.includes("impl Serialize for SecretBytes"));
check("cookie-jar-process-local", protocol.includes("pub(crate) struct EphemeralCookieJar"));
check("cookie-header-sensitive", protocol.includes("value.set_sensitive(true)"));
check("cookie-buffer-cleared", protocol.includes("impl Drop for EphemeralCookieJar") && protocol.includes("self.clear()"));
check("protocol-session-cleared-per-search", runtime.includes("guard.protocol_session.clear()"));
check("protocol-not-exposed-to-frontend", !institutionTypes.includes("EphemeralCookieJar") && !desktopBridge.includes("EphemeralCookieJar"));
check("protocol-transport-selector", protocol.includes("fn select_protocol_transport"));
check(
  "protocol-observation-consumed-without-mislabeling",
  runtime.includes("guard.protocol_session.snapshot()")
    && runtime.includes("observed_protocol_transport(&protocol_events)")
    && runtime.includes('connector_version: "whu-academic-discovery-v1-dom-fallback".to_string()')
    && runtime.includes("transport: LiteratureConnectorTransport::DomFallback")
    && runtime.includes("observed_transport: Some(observed_transport)"),
);
check(
  "protocol-capture-attached-to-hidden-result-webview",
  runtime.includes("configure_protocol_capture_only"),
);
check(
  "cookie-jar-is-reserved-not-wired-to-search",
  runtime.includes("guard.protocol_session.snapshot()")
    && !runtime.includes("read_ephemeral_cookies("),
);

const runSearch = app.slice(
  app.indexOf("async function runInstitutionSearch("),
  app.indexOf("async function stopInstitutionSearch()"),
);
const academicBranch = runSearch.slice(
  runSearch.indexOf('if (searchSource === "academic-discovery")'),
  runSearch.indexOf("let nextSession = session"),
);
check(
  "blue-search-starts-background-orchestrator",
  academicBranch.includes("onStartResearchSearch")
    && app.includes("const submitResearchSearch = useCallback")
    && app.includes("startSideraResearchSearch({"),
);
check("blue-search-does-not-open-browser", !academicBranch.includes("ensureSideraInstitutionBrowser") && !academicBranch.includes("setBrowserPresentation"));
check("blue-search-returns-before-legacy-web-route", academicBranch.includes("return;"));
check("runtime-declares-background-search", runtime.includes("正常流程不会打开侧边网页"));
check("login-is-only-default-visible-web-surface", runtime.includes("show_official_login_surface"));

check("native-review-button", app.includes("加入导入审查"));
check("native-raw-record-button", app.includes("核对原始记录"));
check("search-review-bridge", desktopBridge.includes("createImportReviewBatchFromSearch"));
check("review-validates-search-id", runtime.includes("SIDERA_IMPORT_REVIEW_SEARCH_GENERATION_STALE"));
check("review-validates-connector-version", runtime.includes("SIDERA_IMPORT_REVIEW_CONNECTOR_VERSION_STALE"));
check("review-validates-candidate-id", runtime.includes("SIDERA_IMPORT_REVIEW_RESULT_ID_STALE"));
check(
  "review-persists-canonical-url-not-opaque-locator",
  runtime.includes("canonical_locator: candidate.canonical_url.clone()")
    && !runtime.includes("canonical_locator: candidate.detail_locator.clone()"),
);
check(
  "review-validates-actual-producer-version",
  core.includes("pub producer_versions: Vec<String>")
    && runtime.includes("producer_versions.extend(candidate.producer_versions.iter().cloned())")
    && runtime.includes("SIDERA_IMPORT_REVIEW_PRODUCER_VERSION_AMBIGUOUS")
    && app.includes("candidate.producerVersions ?? []")
    && app.includes("所选候选来自不同或未确认的生产适配器"),
);
check("review-store-remains-independent", importReview.includes('Sidera/import-review-v1.sqlite'));
check("main-library-remains-read-only", importReview.includes('research-hotspots-v7.sqlite'));
const legacySearchCommand = runtime.slice(
  runtime.indexOf("pub async fn sidera_institution_search_start"),
  runtime.indexOf("pub async fn sidera_institution_search_cancel"),
);
check(
  "legacy-academic-command-projects-current-orchestrator-state",
  legacySearchCommand.includes("SIDERA_RESEARCH_SEARCH_COMPATIBILITY_UNAVAILABLE")
    && legacySearchCommand.includes("research_run_to_institution_snapshot(&run)")
    && !legacySearchCommand.includes("sidera_research_search_start("),
);
const legacyCancelCommand = runtime.slice(
  runtime.indexOf("pub async fn sidera_institution_search_cancel"),
  runtime.indexOf("pub async fn sidera_institution_result_open"),
);
check(
  "legacy-events-are-isolated-and-cancel-only-projects-research-state",
  runtime.includes("research_run_to_institution_snapshot")
    && runtime.includes("if snapshot.source == SideraInstitutionSearchSource::AcademicDiscovery")
    && legacyCancelCommand.includes("compatibility_projection")
    && legacyCancelCommand.includes("return Ok(research_run_to_institution_snapshot(&run))")
    && !legacyCancelCommand.includes("sidera_research_search_cancel("),
);
check(
  "root-activity-events-are-isolated-by-source-adapter-and-epoch",
  institutionTypes.includes("export function sideraInstitutionSearchStreamKey")
    && institutionTypes.includes('`${snapshot.source}:${snapshot.adapterId}`')
    && institutionTypes.includes("export function shouldAcceptSideraInstitutionSearchEvent")
    && institutionTypes.includes("next.epoch > cursor.epoch")
    && app.includes("institutionSearchEventCursorsRef")
    && app.includes("sideraInstitutionSearchStreamKey(next)")
    && app.includes("shouldAcceptSideraInstitutionSearchEvent(cursor, next)")
    && !app.includes("institutionLastSequenceRef"),
);
check(
  "review-store-recanonicalizes-sensitive-locators",
  coreImportReview.includes("crate::research_search::canonicalize_identity_url")
    && coreImportReview.includes('persisted.contains("ticket")')
    && coreImportReview.includes('persisted.contains("session_id")')
    && coreImportReview.includes('persisted.contains("secret")'),
);
check(
  "all-filtered-source-is-preserved-as-partial",
  runtime.includes("rejected_by_source")
    && runtime.includes("SIDERA_INSTITUTION_ACADEMIC_SOURCE_ALL_FILTERED")
    && runtime.includes("if !source_states.is_empty()")
    && core.includes("let all_records_unusable")
    && core.includes("a_source_with_only_filtered_records_is_partial_not_a_fake_zero_result")
    && core.includes("SIDERA_RESEARCH_SEARCH_SOURCE_ALL_FILTERED"),
);

for (const document of documents) {
  check("document:development009", document.includes("开发 009"));
  check("document:p1-partial", document.includes("PARTIAL / ADAPTER DEFERRED"));
  check(
    "document:native-partial-cross-view-fail",
    document.includes("NATIVE PARTIAL PASS / CROSS-VIEW CONTINUITY FAIL"),
  );
}

check(
  "package-script",
  pkg.scripts["audit:sidera-research-search-p2a-r1"]
    === "node scripts/sidera_research_search_p2a_r1_audit.mjs",
);
assert.equal(evidence.package, "Sidera-P2a-R1");
assert.equal(evidence.task, "开发 009");
assert.equal(evidence.status, "IMPLEMENTED");
assert.equal(evidence.automatedTechnical, "PASS");
assert.equal(evidence.nativeBackgroundSearch, "UNVERIFIED");
assert.equal(evidence.p1Status, "PARTIAL / ADAPTER DEFERRED");
assert.equal(evidence.externalInstitutionRequestsDuringAutomatedValidation, 0);
assert.equal(evidence.providerCalls, 0);
assert.equal(evidence.mainPaperLibraryWrites, 0);
assert.equal(evidence.fullTextDownloads, 0);
assert.equal(evidence.runtimeConnectorTransport, "dom-fallback");
assert.equal(evidence.observedProtocolRoute, "captured-for-routing-only");
assert.equal(evidence.structuredOrSessionConnector, "UNRESOLVED");
assert.equal(evidence.cookieJarRuntimeUse, "RESERVED_NOT_ACTIVE");
assert.equal(evidence.formalBackgroundConnector, "EXPERIMENTAL_FALLBACK_ONLY");
assert.equal(evidence.sensitiveLocatorQueryPersistence, "BLOCKED_AND_TESTED");
assert.equal(evidence.providerIdentityScope, "SOURCE_DATABASE_PLUS_PROVIDER_ID");
assert.equal(evidence.reviewProducerVersion, "ACTUAL_RUNTIME_PRODUCER");
assert.equal(evidence.legacyCompatibilityBridge, "EVENT_AND_CANCEL");
assert.equal(evidence.allFilteredSourceOutcome, "PARTIAL_PRESERVED");
assert.equal(evidence.rootActivityEventIsolation, "SOURCE_ADAPTER_EPOCH_SEQUENCE");

console.log(JSON.stringify({
  audit: "sidera-research-search-p2a-r1",
  status: "PASS",
  checks: checks.length,
  connector: "whu-academic-discovery-v2",
  runtimeTransport: "DOM_FALLBACK_EXPERIMENTAL",
  structuredOrSessionConnector: "UNRESOLVED",
  normalSearchVisibleWebSurface: "NONE",
  authVisibleWebSurface: "OFFICIAL_LOGIN_ONLY",
  importTarget: "Sidera/import-review-v1.sqlite",
  nativeBackgroundSearch: "UNVERIFIED",
  externalInstitutionRequestsDuringAutomatedValidation: 0,
  providerCalls: 0,
  mainPaperLibraryWrites: 0,
  fullTextDownloads: 0,
}, null, 2));
