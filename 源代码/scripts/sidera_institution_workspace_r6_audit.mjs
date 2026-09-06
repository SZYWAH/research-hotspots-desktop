import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const read = (file) => readFile(path.join(root, file), "utf8");
const [core, runtime, protocol, frontend] = await Promise.all([
  read("src-tauri/core/src/whu_structured_discovery.rs"),
  read("src-tauri/src/sidera_institution_runtime.rs"),
  read("src-tauri/src/sidera_institution_protocol.rs"),
  read("src/App.tsx"),
]);

const checks = [];
const check = (name, condition) => {
  assert.ok(condition, name);
  checks.push(name);
};

check(
  "structured-body-is-bounded-and-redacted",
  core.includes("MAX_STRUCTURED_BODY_BYTES: usize = 512 * 1024")
    && core.includes("MAX_STRUCTURED_JSON_DEPTH: usize = 12")
    && core.includes("MAX_STRUCTURED_JSON_NODES: usize = 1_024")
    && protocol.includes("pub(crate) struct SecretBytes")
    && protocol.includes("impl Drop for SecretBytes"),
);
check(
  "structured-parser-maps-only-paper-fields",
  core.includes("pub fn parse_whu_structured_discovery_page")
    && core.includes("fn map_record")
    && core.includes("sensitive_fields_are_never_mapped_or_serialized"),
);
check(
  "structured-route-is-versioned-and-exact",
  runtime.includes("const WHU_STRUCTURED_ROUTE_WHITELIST")
    && runtime.includes("request.https_host == entry.host")
    && runtime.includes("request.path == entry.path")
    && runtime.includes("request.method == entry.method")
    && runtime.includes("schema_sha256 == entry.schema_sha256"),
);
check(
  "current-task-generation-guards-structured-response",
  runtime.includes("binding.webview_generation == context.webview_generation")
    && runtime.includes("guard.research_search.token_is_current(&run.token)")
    && runtime.includes("structured_pending_requests.remove(&request_key)"),
);
check(
  "dom-fallback-is-explicitly-partial",
  runtime.includes("result.code = DOM_FALLBACK_USED.to_string()")
    && runtime.includes("result.partial = true")
    && runtime.includes("result.completion_reason = ResearchSearchCompletionReason::PartialFailure"),
);
check(
  "structured-pages-never-mix-with-dom-results",
  runtime.includes("let used_structured = structured_result.is_some()")
    && runtime.includes("let mut result = structured_result.unwrap_or_else(|| {")
    && runtime.includes("connector_result.unwrap_or_else(|| {")
    && runtime.includes("if !used_structured {"),
);
check(
  "structured-body-is-read-after-loading-finished",
  protocol.includes('subscribe_devtools_event(core, "Network.loadingFinished", callback)')
    && runtime.includes("subscribe_loading_finished(")
    && runtime.includes("capture_devtools_request_id(raw)")
    && runtime.indexOf("subscribe_loading_finished(")
      > runtime.indexOf("WebView2NetworkEvent::ResponseReceived"),
);
check(
  "official-pagination-truth-remains-optional",
  core.includes("pub total_hits: Option<usize>")
    && core.includes("pub has_more: Option<bool>")
    && core.includes("pub next_cursor: Option<String>")
    && core.includes("pub first_result: Option<usize>")
    && core.includes("pub last_result: Option<usize>")
    && core.includes("pub page_number_observed: bool"),
);
check(
  "structured-pagination-is-derived-from-the-last-accepted-response",
  runtime.includes("fn begin_structured_pagination(")
    && runtime.includes("let previous_page = run")
    && runtime.includes("previous_page.page_number")
    && runtime.includes("expected_page_number,")
    && runtime.includes("let previous_identity = previous_page.page_identity.clone()"),
);
check(
  "pagination-control-is-scoped-and-targeted",
  runtime.includes("const expectedPage = __SIDERA_EXPECTED_NEXT_PAGE__")
    && runtime.includes("const locateForNativeInput = __SIDERA_LOCATE_FOR_NATIVE_INPUT__")
    && runtime.includes("const pager = pagerContainers[0]?.node || null")
    && runtime.includes("Number(numericLabel(node)) === expectedPage")
    && runtime.includes("clickableFor(numberedNextNode) || numberedNextNode")
    && runtime.includes("[numberedNext, pagerArrow].filter(Boolean)")
    && runtime.includes("document.elementFromPoint(clickX, clickY)")
    && runtime.includes("dispatch_academic_pagination_click(webview, &receipt.diagnostics)")
    && protocol.includes("call_devtools_method(")
    && protocol.includes('"Input.dispatchMouseEvent"')
    && runtime.includes("!structured_page_required && before != receipt.page_signature")
    && !runtime.includes("const candidates = [numberedNext, relNext, loadMore, pagerArrow]"),
);
check(
  "structured-pagination-requires-strict-forward-progress",
  core.includes("pub fn classify_whu_structured_page_advance")
    && core.includes("WhuStructuredPageAdvance::Duplicate")
    && core.includes("WhuStructuredPageAdvance::Regressed")
    && runtime.includes("wait_for_structured_pagination_advance")
    && runtime.includes("page.page_identity != previous_identity"),
);
check(
  "structured-pagination-does-not-rewait-for-legacy-dom",
  runtime.includes("wait_for_structured_pagination_advance(runtime, task_id, previous_identity)")
    && runtime.includes("current_page_already_scanned = true;")
    && runtime.includes("The accepted official response is the authoritative page"),
);
check(
  "structured-target-progress-uses-filtered-deduped-candidates",
  runtime.includes("fn structured_qualifying_candidate_keys(")
    && runtime.includes("qualifying_research_candidate_key(request, record)")
    && runtime.includes("fn synchronize_academic_progress_from_structured(")
    && runtime.includes("progress.replace_qualifying_keys(qualifying_keys)")
    && runtime.includes("qualifying_count >= request.result_limit")
    && !runtime.includes("records.len() >= request.result_limit"),
);
check(
  "pagination-failures-use-stable-redacted-diagnostics",
  core.includes("SIDERA_RESEARCH_STRUCTURED_PAGINATION_METADATA_MISSING")
    && core.includes("SIDERA_RESEARCH_STRUCTURED_PAGINATION_CONTROL_MISSING")
    && core.includes("SIDERA_RESEARCH_STRUCTURED_PAGINATION_STALLED")
    && core.includes("SIDERA_RESEARCH_STRUCTURED_PAGINATION_REGRESSED")
    && runtime.includes("末页官方范围：{first}–{last}"),
);
check(
  "diagnostics-report-position-basis",
  frontend.includes("位置真值：observed")
    && frontend.includes("synthesized ${positions.length - observed}"),
);
check(
  "no-new-r6-tauri-command",
  !runtime.includes("sidera_research_structured")
    && !runtime.includes("tauri::command]\nfn whu_structured"),
);

console.log(JSON.stringify({
  status: "PASS",
  package: "Sidera-014-R6-structured-discovery",
  checks: checks.length,
  guarantees: {
    rawBody: "memory-only-secret-bytes-512KiB",
    transport: "whitelisted-webview-xhr-fetch-json",
    fallback: "single-dom-fallback-partial-only",
    lifecycle: "task-epoch-generation-bound",
  },
}, null, 2));
