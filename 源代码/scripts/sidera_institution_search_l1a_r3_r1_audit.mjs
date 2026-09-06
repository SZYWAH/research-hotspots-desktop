import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const read = (file) => readFile(path.join(root, file), "utf8");
const [core, runtime, bridge, app, packageText, status, decisions, evidenceText] = await Promise.all([
  read("src-tauri/core/src/institution_search.rs"),
  read("src-tauri/src/sidera_institution_runtime.rs"),
  read("src/lib/sideraInstitution.ts"),
  read("src/App.tsx"),
  read("package.json"),
  read("docs/STATUS.md"),
  read("docs/DECISIONS.md"),
  read("docs/evidence/sidera-m2.0c-l1a-r3-r1-real-search-adapter-2026-08-04.json"),
]);

const pkg = JSON.parse(packageText);
const evidence = JSON.parse(evidenceText);
const runtimeProduction = runtime.slice(0, runtime.indexOf("#[cfg(test)]"));
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
const inspectScript = rustScript("CATALOG_INSPECT_SCRIPT");
const submitScript = rustScript("CATALOG_SUBMIT_SCRIPT");
const libraryScript = rustScript("LIBRARY_AUTH_INSPECT_SCRIPT");

assert.doesNotThrow(() => new Function(inspectScript));
assert.doesNotThrow(() => new Function(submitScript.replace("__SIDERA_QUERY__", JSON.stringify("fixture"))));
assert.doesNotThrow(() => new Function(libraryScript));

assert.ok(core.includes('WHU_OPAC_CATALOG_ADAPTER_ID: &str = "whu-opac-catalog-v3"'));
assert.ok(bridge.includes('SIDERA_INSTITUTION_CATALOG_ADAPTER_ID = "whu-opac-catalog-v3"'));
assert.ok(app.includes("SIDERA_INSTITUTION_CATALOG_ADAPTER_ID"));
assert.ok(core.includes("page_signature: String"));
assert.ok(core.includes("query_echo: Option<String>"));
assert.ok(core.includes("explicit_zero_results: bool"));
assert.ok(core.includes("adapter_page_confirms_query_submission"));
assert.ok(core.includes("validate_adapter_records"));
assert.ok(core.includes("is_whu_catalog_record_detail_url"));
assert.ok(core.includes("SIDERA_INSTITUTION_RESULT_FALSE_POSITIVE"));

assert.ok(inspectScript.includes("navigationTitles"));
assert.ok(inspectScript.includes("recordTarget"));
assert.ok(inspectScript.includes("pageSignature"));
assert.ok(inspectScript.includes("queryEcho"));
assert.ok(inspectScript.includes("explicitZeroResults"));
assert.ok(!inspectScript.includes("full-set-set|find-b"));
assert.ok(submitScript.includes("form.requestSubmit"));
assert.ok(submitScript.includes("pageSignature"));
assert.ok(runtimeProduction.includes('&["search-form"]'));
assert.ok(runtimeProduction.includes("wait_for_submitted_search_result"));
assert.ok(runtimeProduction.includes("SIDERA_INSTITUTION_QUERY_NOT_SUBMITTED"));
assert.ok(runtimeProduction.includes("SIDERA_INSTITUTION_SEARCH_COMPLETE_EMPTY"));

assert.ok(libraryScript.includes("library-ready"));
assert.ok(libraryScript.includes('input[type="password"]'));
assert.ok(runtimeProduction.includes("schedule_library_page_inspection"));
assert.ok(runtimeProduction.includes("SIDERA_INSTITUTION_LIBRARY_PAGE_INSPECTION_PENDING"));
const libraryUrlClassifier = between(runtimeProduction, "fn library_auth_from_url", "fn session_from_adapter_page");
assert.ok(!libraryUrlClassifier.includes("SideraInstitutionAuthStatus::Ready"));

for (const forbidden of [
  "document.cookie",
  "cookies_for_url",
  ".cookies()",
  "localStorage.getItem",
  "sessionStorage.getItem",
]) {
  assert.ok(!runtimeProduction.includes(forbidden), forbidden);
}
assert.ok(!runtimeProduction.includes("upsert_paper_library"));
assert.ok(!runtimeProduction.includes("sidera_pi"));

assert.ok(status.includes("M2.0c-L1a-R3-R1"));
assert.ok(status.includes("INSTITUTION AUTH PASS / CATALOG EXTRACTION FAIL / PRIMARY ROUTE MISALIGNED"));
assert.ok(decisions.includes("D-141"));
assert.equal(evidence.package, "M2.0c-L1a-R3-R1");
assert.equal(evidence.status, "IMPLEMENTED");
assert.equal(evidence.automatedTechnical, "PASS");
assert.equal(evidence.nativeClosedLoop, "FAIL_SUPERSEDED");
assert.equal(
  evidence.correctedConclusion,
  "INSTITUTION AUTH PASS / CATALOG EXTRACTION FAIL / PRIMARY ROUTE MISALIGNED",
);
assert.equal(evidence.externalInstitutionRequests, 0);
assert.equal(evidence.providerCalls, 0);
assert.equal(
  pkg.scripts["audit:sidera-institution-search-l1a-r3-r1"],
  "node scripts/sidera_institution_search_l1a_r3_r1_audit.mjs",
);

console.log(JSON.stringify({
  status: "PASS",
  package: "M2.0c-L1a-R3-R1",
  adapter: "whu-opac-catalog-v3",
  entryGate: "search-form-only",
  submissionGate: ["page-signature", "query-echo"],
  resultGate: ["record-container", "catalog-record-url", "navigation-title-denylist"],
  personalLibraryReadyGate: "versioned-dom",
  externalInstitutionRequests: 0,
  providerCalls: 0,
  nativeClosedLoop: "FAIL_SUPERSEDED",
}, null, 2));
