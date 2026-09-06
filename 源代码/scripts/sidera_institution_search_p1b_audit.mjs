import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const read = (file) => readFile(path.join(root, file), "utf8");
const [core, runtime, bridge, app, evidenceText] = await Promise.all([
  read("src-tauri/core/src/institution_search.rs"),
  read("src-tauri/src/sidera_institution_runtime.rs"),
  read("src/lib/sideraInstitution.ts"),
  read("src/App.tsx"),
  read("docs/evidence/sidera-p1b-whu-native-academic-discovery-2026-08-04.json"),
]);
const evidence = JSON.parse(evidenceText);
const runtimeProduction = runtime.slice(0, runtime.indexOf("#[cfg(test)]"));
const script = (name) => {
  const match = runtime.match(new RegExp(`const ${name}: &str = r#"([\\s\\S]*?)"#;`));
  assert.ok(match, `${name} must exist`);
  return match[1];
};

const filter = script("ACADEMIC_FILTER_SCRIPT");
assert.doesNotThrow(() => new Function(filter));
for (const marker of [
  "文章|期刊论文|articles?|journal articles?",
  "会议论文|conference papers?",
  "学位论文|dissertations?|thesis|theses",
  "aria-checked",
  "action: 'complete'",
]) assert.ok(filter.includes(marker), marker);
assert.ok(runtimeProduction.includes("apply_academic_resource_filters"));
assert.ok(runtimeProduction.includes("SIDERA_INSTITUTION_ACADEMIC_FILTER_UNCONFIRMED"));
const academicFlow = runtimeProduction.slice(
  runtimeProduction.indexOf("async fn run_academic_discovery_search"),
  runtimeProduction.indexOf("async fn run_catalog_search"),
);
assert.ok(academicFlow.indexOf("apply_academic_resource_filters") < academicFlow.indexOf("validate_academic_adapter_records"));

for (const route of [
  "DirectHtmlPdf",
  "Doi",
  "OpenurlLinkResolver",
  "ProviderRecord",
  "PublisherPage",
  "BrowserFallback",
]) assert.ok(core.includes(route), route);
assert.ok(core.includes("classifies_all_read_only_full_text_routes_without_fetching_content"));
assert.ok(bridge.includes('"direct-html-pdf"'));
assert.ok(bridge.includes('"openurl-link-resolver"'));
assert.ok(bridge.includes("fullTextRoute"));

for (const label of ["统一学术发现", "数据库直达", "馆藏目录", "Web of Science"]) {
  assert.ok(app.includes(label), label);
}
assert.ok(app.includes('selectedSource === "database-direct" ? null : selectedSource'));
assert.ok(app.includes("供应商高级检索适配器计划于 P6"));
assert.ok(app.includes("institutionFullTextRouteLabel"));

for (const forbidden of [
  "upsert_paper_library",
  "download_pdf",
  "document.cookie",
  "cookies_for_url",
]) assert.ok(!runtimeProduction.includes(forbidden), forbidden);

assert.equal(evidence.package, "Sidera-P1b-001");
assert.ok(["PENDING", "PASS"].includes(evidence.automatedTechnical));
assert.equal(evidence.nativeCompleteGate, "UNVERIFIED");
assert.equal(evidence.externalInstitutionRequests, 0);
assert.equal(evidence.providerCalls, 0);
assert.equal(evidence.paperLibraryWrites, 0);
assert.equal(evidence.downloads, 0);

console.log(JSON.stringify({
  status: "PASS",
  package: evidence.package,
  routes: 6,
  productModes: ["academic-discovery", "database-direct", "catalog"],
  fixtureOnly: true,
  externalInstitutionRequests: 0,
  providerCalls: 0,
}, null, 2));
