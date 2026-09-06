import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const read = (file) => readFile(path.join(root, file), "utf8");
const occurrences = (value, needle) => value.split(needle).length - 1;
const section = (value, start, end) => {
  const startIndex = value.indexOf(start);
  assert.notEqual(startIndex, -1, `missing section start: ${start}`);
  const endIndex = end ? value.indexOf(end, startIndex + start.length) : -1;
  return value.slice(startIndex, endIndex === -1 ? undefined : endIndex);
};

const [
  core,
  runtime,
  institutionTypes,
  app,
  presentation,
  packageText,
  evidenceText,
  ...documents
] = await Promise.all([
  read("src-tauri/core/src/research_search.rs"),
  read("src-tauri/src/sidera_institution_runtime.rs"),
  read("src/lib/sideraInstitution.ts"),
  read("src/App.tsx"),
  read("src/lib/sideraResearchPresentation.ts"),
  read("package.json"),
  read("docs/evidence/sidera-p2a-r2-native-continuity-2026-08-05.json"),
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
  "pub struct ResearchSearchStore",
  "pub struct SideraResearchSearchState",
  "pub displayed_snapshot: Option<ResearchSearchRun>",
  "pub active_attempt: Option<SideraResearchSearchAttempt>",
  "pub last_failure: Option<SideraResearchSearchFailure>",
  "pub struct SideraResearchSearchLifecycleEvent",
  "pub client_request_id: String",
  "pub start_reason: SideraResearchSearchStartReason",
  "pub webview_generation: u64",
  "UserSearch",
  "Retry",
  "Compatibility",
]) {
  check(`core:${marker}`, core.includes(marker));
}

const beginWithContext = section(core, "pub fn begin_with_context(", "pub fn active(");
check("begin-keeps-displayed-snapshot", !beginWithContext.includes("displayed_snapshot = None"));
check(
  "client-request-id-is-idempotent",
  beginWithContext.includes("self.request_tasks.get(&client_request_id).cloned()")
    && beginWithContext.includes("if let Some(remembered_task_id)")
    && beginWithContext.includes("Some(remembered_task_id)")
    && beginWithContext.includes("IdempotentReplay")
    && beginWithContext.includes("return Ok((self.state.clone(), false))"),
);

const finish = section(core, "pub fn finish(", "pub fn cancel(");
check(
  "only-success-or-partial-promotes-display",
  finish.includes("ResearchSearchStatus::Complete | ResearchSearchStatus::Partial")
    && finish.includes("self.state.displayed_snapshot = Some(snapshot.clone())")
    && finish.includes("self.state.last_failure = Some"),
);
check(
  "explicit-zero-is-valid-completion",
  finish.includes("explicit_zero_results")
    && finish.includes("SIDERA_RESEARCH_SEARCH_COMPLETE_EMPTY"),
);

const cancel = section(core, "pub fn cancel(", "fn current_for_token_mut(");
check("cancel-keeps-displayed-snapshot", !cancel.includes("displayed_snapshot = None"));
check(
  "cancel-records-independent-failure",
  cancel.includes("self.state.last_failure = Some")
    && cancel.includes("ResearchSearchStatus::Cancelled"),
);

const tokenCheck = section(core, "pub fn token_is_current(", "pub fn mark_status(");
for (const tokenField of [
  "attempt.run.task_id == token.task_id",
  "attempt.client_request_id == token.client_request_id",
  "attempt.run.epoch == token.epoch",
  "attempt.webview_generation == token.webview_generation",
  "token.sequence == attempt.run.sequence",
]) {
  check(`full-token:${tokenField}`, tokenCheck.includes(tokenField));
}
check(
  "lifecycle-is-memory-bounded-to-32",
  core.includes("if self.state.lifecycle.len() > 32")
    && core.includes("self.state.lifecycle.drain(0..overflow)"),
);
check(
  "stale-callback-is-recorded-and-rejected",
  core.includes("StaleCallbackDropped")
    && core.includes("SIDERA_RESEARCH_SEARCH_STALE_CALLBACK"),
);

check("runtime-has-private-legacy-academic-transport", runtime.includes("struct LegacyAcademicTransportRun"));
check(
  "legacy-transport-binds-complete-token",
  runtime.includes("struct LegacyAcademicTransportRun")
    && runtime.includes("token: ResearchSearchToken"),
);
check(
  "academic-old-event-stream-is-disabled",
  runtime.includes("if snapshot.source == SideraInstitutionSearchSource::AcademicDiscovery")
    && runtime.includes("return;")
    && runtime.includes("app.emit(INSTITUTION_SEARCH_EVENT, snapshot.clone())"),
);
check(
  "research-event-emits-complete-state",
  runtime.includes("fn emit_research_search(app: &AppHandle, state: &SideraResearchSearchState)")
    && runtime.includes("app.emit(RESEARCH_SEARCH_EVENT, state.clone())"),
);

const researchStart = section(
  runtime,
  "pub async fn sidera_research_search_start(",
  "pub async fn sidera_research_search_cancel(",
);
check("research-start-returns-complete-state", researchStart.includes("Result<SideraResearchSearchState, String>"));
check(
  "research-start-uses-client-request-id",
  researchStart.includes("let ResearchSearchStartInput {")
    && researchStart.includes("client_request_id,")
    && researchStart.includes(".begin_with_context("),
);
check(
  "research-start-uses-start-reason",
  researchStart.includes("start_reason,")
    && researchStart.includes(".begin_with_context("),
);
check("research-start-spawns-only-when-new", researchStart.includes("if started"));

const researchCancel = section(
  runtime,
  "pub async fn sidera_research_search_cancel(",
  "pub async fn sidera_research_search_snapshot(",
);
check("research-cancel-returns-complete-state", researchCancel.includes("Result<SideraResearchSearchState, String>"));
check("research-cancel-emits-complete-state", researchCancel.includes("emit_research_search(&app, &search_state)"));

const researchSnapshot = section(
  runtime,
  "pub async fn sidera_research_search_snapshot(",
  "pub async fn sidera_research_result_open(",
);
check("research-snapshot-returns-complete-state", researchSnapshot.includes("Result<SideraResearchSearchState, String>"));
check("snapshot-can-address-display-attempt-or-failure", researchSnapshot.includes("displayed_snapshot") && researchSnapshot.includes("last_failure"));

const resultOpen = section(
  runtime,
  "pub async fn sidera_research_result_open(",
  "pub async fn sidera_import_review_create_from_search(",
);
check("record-open-resolves-stable-display", resultOpen.includes(".displayed()") && !resultOpen.includes(".active()"));

const reviewCreate = section(
  runtime,
  "pub async fn sidera_import_review_create_from_search(",
  "pub async fn sidera_institution_search_start(",
);
check("review-reads-stable-displayed-snapshot", reviewCreate.includes(".displayed()") && !reviewCreate.includes(".active()"));
check(
  "review-validates-stable-producer",
  reviewCreate.includes("SIDERA_IMPORT_REVIEW_SEARCH_GENERATION_STALE")
    && reviewCreate.includes("SIDERA_IMPORT_REVIEW_CONNECTOR_VERSION_STALE")
    && reviewCreate.includes("SIDERA_IMPORT_REVIEW_RESULT_ID_STALE"),
);

const compatibilityStart = section(
  runtime,
  "pub async fn sidera_institution_search_start(",
  "pub async fn sidera_institution_search_cancel(",
);
check(
  "academic-compatibility-projects-research-state",
  compatibilityStart.includes("SideraInstitutionSearchSource::AcademicDiscovery")
    && compatibilityStart.includes("research_search")
    && compatibilityStart.includes("active_attempt")
    && compatibilityStart.includes(".displayed()")
    && compatibilityStart.includes("attempt.run.request.query == query")
    && compatibilityStart.includes("run.request.query == query")
    && compatibilityStart.includes("research_run_to_institution_snapshot")
    && !compatibilityStart.includes("begin_with_context"),
);

for (const marker of [
  "export type SideraResearchSearchState",
  "displayedSnapshot: SideraResearchSearchRun | null",
  "activeAttempt: SideraResearchSearchAttempt | null",
  "lastFailure: SideraResearchSearchFailure | null",
  "clientRequestId: string",
  "startReason: SideraResearchSearchStartReason",
  "shouldAcceptSideraResearchSearchState",
  'listen<SideraResearchSearchState>("sidera-research-search"',
]) {
  check(`frontend-contract:${marker}`, institutionTypes.includes(marker));
}
check(
  "frontend-commands-return-complete-state",
  institutionTypes.includes('invoke<SideraResearchSearchState>("sidera_research_search_start"')
    && institutionTypes.includes('invoke<SideraResearchSearchState>("sidera_research_search_cancel"')
    && institutionTypes.includes('invoke<SideraResearchSearchState>("sidera_research_search_snapshot"'),
);

check("app-root-owns-research-state", app.includes("const [researchSearchState, setResearchSearchState]"));
check("app-root-owns-single-research-listener", occurrences(app, "listenSideraResearchSearch((next)") === 1);
check("app-root-initializes-state-once", occurrences(app, "getSideraResearchSearchState().then") === 1);
check(
  "app-root-rejects-late-events",
  app.includes("shouldAcceptSideraResearchSearchState(researchSearchEventCursorRef.current, next)")
    && app.includes("sideraResearchSearchStateCursor(next)"),
);
check(
  "selection-clears-only-after-display-promotion",
  app.includes("researchDisplayedSnapshotKeyRef")
    && app.includes("setSelectedResearchCandidateIds([])")
    && app.includes("shouldResetSideraResearchPresentation(previousKey, next.displayedSnapshot)")
    && presentation.includes("export function shouldResetSideraResearchPresentation")
    && presentation.includes("previousKey !== null && previousKey !== nextKey"),
);
check(
  "root-submit-carries-idempotency-context",
  app.includes("researchSearchSubmitRef")
    && app.includes("clientRequestId")
    && app.includes("startReason")
    && app.includes("startSideraResearchSearch({"),
);
check(
  "institution-notices-are-scoped-and-clear-on-recovery",
  app.includes('clearNoticeScope("institution-sso")')
    && app.includes('clearNoticeScope("institution-search")')
    && app.includes("noticeScopeRevisionsRef"),
);
check("workspace-has-no-second-research-listener", occurrences(app, "listenSideraResearchSearch((next)") === 1);
check(
  "ui-preserves-old-result-while-attempt-runs",
  app.includes("displayedResearchSnapshot")
    && app.includes("activeResearchAttempt")
    && app.includes("正在执行新查询")
    && app.includes("仍展示上次成功结果")
    && app.includes("上一份成功结果已保留"),
);

for (const document of documents) {
  check("document:development010", document.includes("开发 010") && document.includes("P2a-R2"));
  check("document:development009-native-fact", document.includes("NATIVE PARTIAL PASS / CROSS-VIEW CONTINUITY FAIL"));
  check("document:development010-native-gate", document.includes("NATIVE CONTINUITY UNVERIFIED"));
  check("document:p1-remains-partial", document.includes("PARTIAL / ADAPTER DEFERRED"));
}

check(
  "package-script",
  pkg.scripts["audit:sidera-research-search-p2a-r2"]
    === "node scripts/sidera_research_search_p2a_r2_audit.mjs",
);
assert.equal(evidence.package, "Sidera-P2a-R2");
assert.equal(evidence.task, "开发 010");
assert.equal(
  evidence.development009Status,
  "IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE PARTIAL PASS / CROSS-VIEW CONTINUITY FAIL",
);
assert.equal(
  evidence.development010Status,
  "IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE CONTINUITY UNVERIFIED",
);
assert.equal(evidence.p1Status, "PARTIAL / ADAPTER DEFERRED");
assert.equal(evidence.p2Stage, "P2a");
assert.equal(evidence.verified.normalSearchDoesNotOpenBrowser, "PASS");
assert.equal(evidence.verified.chineseQuery.candidateCount, 10);
assert.deepEqual(evidence.verified.chineseQuery.sources, ["万方", "国家哲学社会科学文献中心"]);
assert.equal(evidence.verified.englishQuery.candidateCount, 9);
assert.deepEqual(evidence.verified.englishQuery.sources, ["Crossref", "PubMed", "ScienceDirect", "SwePub"]);
assert.equal(evidence.verified.importReviewBatchCreation, "PASS");
assert.equal(evidence.failed.crossViewSnapshotContinuity, "FAIL");
assert.equal(evidence.failed.lateEvalTimeoutIsolation, "FAIL");
assert.equal(evidence.failed.staleDatabaseSsoFailureNotice, "FAIL");
assert.equal(evidence.supersedesAutomatedEvidence, false);
assert.equal(evidence.automatedValidationNetworkRequests, 0);
assert.equal(evidence.providerCallsDuringAutomatedValidation, 0);
assert.equal(evidence.mainPaperLibraryWritesDuringAutomatedValidation, 0);
assert.equal(evidence.fullTextDownloadsDuringAutomatedValidation, 0);

console.log(JSON.stringify({
  audit: "sidera-research-search-p2a-r2",
  status: "PASS",
  checks: checks.length,
  stateAuthority: "ResearchSearchStore",
  displayedSnapshot: "STABLE_UNTIL_PROMOTION",
  failedAttempt: "PRESERVES_DISPLAYED_SNAPSHOT",
  eventPayload: "SideraResearchSearchState",
  lifecycleOwner: "APP_ROOT",
  nativeContinuity: "UNVERIFIED",
  externalInstitutionRequestsDuringAutomatedValidation: 0,
  providerCalls: 0,
  mainPaperLibraryWrites: 0,
  fullTextDownloads: 0,
}, null, 2));
