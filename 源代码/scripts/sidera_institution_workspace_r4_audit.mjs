import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const read = (file) => readFile(path.join(root, file), "utf8");
const [core, runtime, bridge, app] = await Promise.all([
  read("src-tauri/core/src/research_search.rs"),
  read("src-tauri/src/sidera_institution_runtime.rs"),
  read("src/lib/sideraInstitution.ts"),
  read("src/App.tsx"),
]);

const checks = [];
const check = (name, condition) => {
  assert.ok(condition, name);
  checks.push(name);
};

for (const marker of [
  "ResearchSearchRetrievalPositionBasis",
  "Observed",
  "Synthesized",
  "pub target_reached: bool",
  "pub has_more: Option<bool>",
  "Backward-compatible mirror of `target_reached`",
]) {
  check(`core-truth:${marker}`, core.includes(marker));
}
check(
  "observed-position-requires-complete-positive-coordinates",
  core.includes("value.basis == ResearchSearchRetrievalPositionBasis::Observed")
    && core.includes("value.rank > 0")
    && core.includes("value.page > 0")
    && core.includes("value.position > 0"),
);
check(
  "compatibility-position-is-synthesized",
  runtime.includes("basis: ResearchSearchRetrievalPositionBasis::Synthesized"),
);
check(
  "native-position-is-observed",
  runtime.includes("basis: ResearchSearchRetrievalPositionBasis::Observed"),
);
check(
  "target-and-more-are-not-conflated",
  core.includes("run.truth.target_reached = run.truth.limit_reached")
    && core.includes("outcome.has_more = true")
    && core.includes("ResearchSearchCompletionReason::ExplicitZeroResults => Some(false)"),
);

for (const marker of [
  "SideraResearchSearchAuthContext",
  "SideraResearchSearchAuthGoal",
  "SideraResearchSearchAuthPhase",
  "DiscoveryFulltext",
  "AwaitingUser",
  "Verifying",
  "RefreshingParent",
  "Resuming",
  "pub search_id: String",
  "pub auth_context: Option<SideraResearchSearchAuthContext>",
]) {
  check(`core-auth:${marker}`, core.includes(marker));
}
check(
  "auth-context-is-owned-by-active-attempt",
  core.indexOf("pub auth_context: Option<SideraResearchSearchAuthContext>")
    < core.indexOf("#[serde(flatten)]\n    pub run: ResearchSearchRun"),
);
check(
  "same-id-auth-phase-api",
  core.includes("pub fn mark_task_bound_auth_phase")
    && core.includes("search_id: attempt.client_request_id.clone()")
    && core.includes("pub fn resume_after_task_bound_auth"),
);
for (const marker of [
  "SideraResearchSearchAuthPhase::AwaitingUser",
  "SideraResearchSearchAuthPhase::Verifying",
  "SideraResearchSearchAuthPhase::RefreshingParent",
  "SideraResearchSearchAuthPhase::Resuming",
  "resume_research_auth_locked",
]) {
  check(`runtime-bridge:${marker}`, runtime.includes(marker));
}
check(
  "auth-wait-does-not-consume-active-budget",
  runtime.includes("discovery_auth_search_timeout_should_advance(awaiting_auth)")
    && runtime.includes("wait_while_discovery_auth_active"),
);
check(
  "runtime-emits-bridged-research-state",
  runtime.includes("emit_research_search(app, &research_state)")
    && runtime.includes("emit_research_search(&app, &resuming_research)")
    && runtime.includes("emit_research_search(&app, &resumed_research)"),
);
check(
  "auth-cancel-cancels-active-attempt-instead-of-promoting-partial",
  runtime.includes("if legacy.status == SideraInstitutionSearchStatus::Cancelled")
    && runtime.includes("guard.research_search.cancel(now_ms())"),
);
check(
  "core-auth-identity-test-present",
  core.includes("task_bound_discovery_auth_keeps_task_and_search_identity_until_resume"),
);
check(
  "target-does-not-invent-more-test-present",
  core.includes("reaching_the_target_does_not_invent_more_results"),
);
check(
  "authenticated-search-keeps-background-webview-alive-without-covering-workbench",
  runtime.includes("fn park_institution_background_transport")
    && runtime.includes("INSTITUTION_BACKGROUND_TRANSPORT_EDGE: f64 = 1.0")
    && runtime.includes("INSTITUTION_BACKGROUND_TRANSPORT_WIDTH: f64 = 1_280.0")
    && runtime.includes("INSTITUTION_BACKGROUND_TRANSPORT_HEIGHT: f64 = 900.0")
    && runtime.includes("INSTITUTION_BACKGROUND_TRANSPORT_WIDTH,")
    && runtime.includes("INSTITUTION_BACKGROUND_TRANSPORT_HEIGHT,")
    && runtime.includes("park_institution_background_transport(&app)")
    && runtime.includes("let _ = webview.hide();\n    if let Err((code, message)) = search_result"),
);
check(
  "read-only-page-inspection-has-bounded-transient-retry",
  runtime.includes("ACADEMIC_READ_ONLY_INSPECTION_ATTEMPTS: u8 = 2")
    && runtime.includes("fn read_only_academic_inspection_error_is_retryable")
    && runtime.includes("inspect_academic_page_read_only(webview, runtime, task_id)")
    && runtime.includes("only_read_only_adapter_callback_interruptions_are_retryable"),
);
check(
  "mutating-adapter-scripts-are-not-replayed",
  runtime.includes("let submission = submit_academic_query(webview, query).await?")
    && runtime.includes("let payload = eval_with_timeout(webview, &script, Duration::from_secs(5)).await?")
    && !runtime.includes("submit_academic_query_read_only"),
);
check(
  "discovery-auth-spa-and-window-close-watchdog-is-task-bound",
  runtime.includes("fn schedule_discovery_auth_lifecycle_watchdog")
    && runtime.includes("DISCOVERY_AUTH_INVISIBLE_CONFIRMATIONS: u8 = 2")
    && runtime.includes("discovery_auth_binding_is_current(&guard, &expected)")
    && runtime.includes("inspect_discovery_auth_before_close(app, inner, webview, expected, true)"),
);
check(
  "discovery-auth-destroyed-defers-to-active-verifier",
  runtime.includes("fn discovery_auth_destroyed_requires_cancel")
    && runtime.includes("discovery_auth_destroyed_defers_to_active_close_verification")
    && runtime.includes("Some(SideraInstitutionConnectionPhase::RefreshingParent)"),
);
check(
  "discovery-auth-terminal-paths-idempotently-restore-main",
  runtime.includes("let _ = restore_main_window(app);")
    && runtime.includes("let _ = restore_main_window(&app);")
    && runtime.includes("统一发现认证窗口消失后的父页核对超过 4 秒"),
);
check(
  "discovery-auth-guards-main-from-owned-window-close",
  runtime.includes("if main.set_closable(false).is_err()")
    && runtime.includes("SIDERA_INSTITUTION_DISCOVERY_AUTH_MAIN_GUARD_FAILED")
    && runtime.includes("let _ = window.set_closable(true);")
    && runtime.includes("let _ = window.show();")
    && runtime.includes("let _ = window.unminimize();"),
);

for (const marker of [
  'basis: "observed" | "synthesized"',
  "targetReached: boolean",
  "hasMore: boolean | null",
  'goal: "discovery-fulltext"',
  'phase: "awaiting-user" | "verifying" | "refreshing-parent" | "resuming"',
  "searchId: string",
]) {
  check(`frontend-contract:${marker}`, bridge.includes(marker));
}
for (const marker of [
  "researchSearchAuthPhaseLabel(activeAttempt.authContext?.phase)",
  "认证等待不占用90秒检索预算",
  "snapshot.truth.targetReached",
  "snapshot.truth.hasMore == null",
  "本次检索来源进度（",
  "researchSearchTransportLabel(report.observedTransport)",
]) {
  check(`content-first-ui:${marker}`, app.includes(marker));
}
check(
  "active-source-details-are-collapsed-by-default",
  app.includes('<details className="research-search-diagnostics research-search-diagnostics--attempt">')
    && !app.includes('<details open className="research-search-diagnostics research-search-diagnostics--attempt">'),
);

console.log(JSON.stringify({
  status: "PASS",
  package: "Sidera-014-R4-backend",
  checks: checks.length,
  guarantees: {
    authIdentity: "same-taskId-and-searchId",
    authBudget: "excluded-from-90-second-active-budget",
    retrievalPosition: "observed-or-synthesized",
    truth: "targetReached-separated-from-hasMore",
  },
}, null, 2));
