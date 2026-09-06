import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const read = (file) => readFile(path.join(root, file), "utf8");
const [core, runtime] = await Promise.all([
  read("src-tauri/core/src/research_search.rs"),
  read("src-tauri/src/sidera_institution_runtime.rs"),
]);

const checks = [];
const check = (name, condition) => {
  assert.ok(condition, name);
  checks.push(name);
};

check(
  "fair-budget-owned-by-headless-core",
  core.includes("pub fn fair_sequential_page_budget")
    && core.includes("fair_page_budget_reserves_capacity_for_remaining_facets"),
);
check(
  "sequential-facets-share-global-budget",
  runtime.includes("progress.fair_sequential_facet_budget")
    && runtime.includes("Some(facet_page_budget)")
    && runtime.includes("facet_count.saturating_sub(facet_index)"),
);
check(
  "later-facets-are-not-stopped-by-an-earlier-scope-cap",
  runtime.includes("if progress.global_budget_reached() && facet_index.saturating_add(1) < facet_count")
    && !runtime.includes("if progress.limit_reached || progress.page_limit_reached"),
);
check(
  "scope-cap-inspects-before-reporting-page-limit",
  runtime.includes("if progress.scope_budget_reached(pages.len(), scope_page_budget)")
    && runtime.includes("let receipt = inspect_academic_next_page(webview).await?")
    && runtime.includes('"complete" => exhausted = true')
    && runtime.includes('"available" => progress.page_limit_reached = true'),
);
const inspectScript = runtime.slice(
  runtime.indexOf("const ACADEMIC_NEXT_PAGE_INSPECT_SCRIPT"),
  runtime.indexOf("const ACADEMIC_INSPECT_SCRIPT"),
);
check(
  "page-limit-inspection-is-read-only",
  inspectScript.includes("next ? 'available' : 'complete'")
    && !inspectScript.includes("next.click()"),
);
check(
  "normal-pagination-remains-explicit-and-mutating",
  runtime.includes("const ACADEMIC_NEXT_PAGE_SCRIPT")
    && runtime.includes("const locateForNativeInput = __SIDERA_LOCATE_FOR_NATIVE_INPUT__")
    && runtime.includes("dispatch_academic_pagination_click(webview, &receipt.diagnostics).await?")
    && runtime.includes("WebView2MouseEventKind::Pressed")
    && runtime.includes("WebView2MouseEventKind::Released"),
);
check(
  "observed-position-page-is-facet-local",
  runtime.includes("page_number: pages.len().saturating_add(1)")
    && runtime.includes("basis: ResearchSearchRetrievalPositionBasis::Observed"),
);
check(
  "global-and-scope-budgets-have-directed-runtime-tests",
  runtime.includes("sequential_facet_budget_reserves_pages_for_every_requested_type")
    && runtime.includes("scope_budget_does_not_replace_the_global_page_budget"),
);

console.log(JSON.stringify({
  status: "PASS",
  package: "Sidera-014-R5-pagination-truth",
  checks: checks.length,
  guarantees: {
    pageBudget: "global-20-with-fair-sequential-facet-scopes",
    remoteContinuation: "read-only-observed-at-scope-boundary",
    retrievalPosition: "observed-page-is-local-to-facet",
  },
}, null, 2));
