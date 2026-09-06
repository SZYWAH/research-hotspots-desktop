import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const read = (file) => readFile(path.join(root, file), "utf8");
const [core, runtime, bridge, app, css, packageText, status, roadmap, architecture, decisions, development, evidenceText] = await Promise.all([
  read("src-tauri/core/src/institution_search.rs"),
  read("src-tauri/src/sidera_institution_runtime.rs"),
  read("src/lib/sideraInstitution.ts"),
  read("src/App.tsx"),
  read("src/index.css"),
  read("package.json"),
  read("docs/STATUS.md"),
  read("docs/ROADMAP.md"),
  read("docs/ARCHITECTURE.md"),
  read("docs/DECISIONS.md"),
  read("docs/DEVELOPMENT.md"),
  read("docs/evidence/sidera-m2.0c-l1a-r4-academic-discovery-2026-08-04.json"),
]);

const pkg = JSON.parse(packageText);
const evidence = JSON.parse(evidenceText);
const runtimeProduction = runtime.slice(0, runtime.indexOf("#[cfg(test)]"));
const rustScript = (name) => {
  const match = runtime.match(new RegExp(`const ${name}: &str = r#"([\\s\\S]*?)"#;`));
  assert.ok(match, `${name} must exist`);
  return match[1];
};
const between = (source, start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `${start} source range`);
  return source.slice(from, to);
};

const catalogInspect = rustScript("CATALOG_INSPECT_SCRIPT");
const catalogSubmit = rustScript("CATALOG_SUBMIT_SCRIPT");
const discoveryRoute = rustScript("DISCOVERY_ROUTE_SCRIPT");
const academicFullTextResolve = rustScript("ACADEMIC_FULL_TEXT_RESOLVE_SCRIPT");
const academicFilter = rustScript("ACADEMIC_FILTER_SCRIPT");
const academicInspect = rustScript("ACADEMIC_INSPECT_SCRIPT");
const academicSubmit = rustScript("ACADEMIC_SUBMIT_SCRIPT");
for (const script of [catalogInspect, discoveryRoute, academicFullTextResolve, academicFilter, academicInspect]) {
  assert.doesNotThrow(() => new Function(script));
}
assert.doesNotThrow(() => new Function(catalogSubmit.replace("__SIDERA_QUERY__", JSON.stringify("人工智能"))));
assert.doesNotThrow(() => new Function(academicSubmit.replace("__SIDERA_QUERY__", JSON.stringify("machine learning"))));

assert.ok(core.includes('WHU_ACADEMIC_DISCOVERY_ADAPTER_ID: &str = "whu-academic-discovery-v1"'));
assert.ok(core.includes('WHU_OPAC_CATALOG_ADAPTER_ID: &str = "whu-opac-catalog-v3"'));
assert.ok(core.includes("pub enum SideraInstitutionSearchSource"));
assert.ok(core.includes("AcademicDiscovery"));
assert.ok(core.includes("Catalog"));
assert.ok(core.includes("pub enum SideraInstitutionRecordKind"));
assert.ok(core.includes("pub enum SideraInstitutionFullTextStatus"));
assert.ok(core.includes("pub enum SideraInstitutionFullTextRoute"));
assert.ok(core.includes("source_readiness: Vec<SideraInstitutionSourceReadiness>"));
assert.ok(core.includes("normalize_catalog_adapter_records"));
assert.ok(core.includes("normalize_academic_adapter_records"));
assert.ok(core.includes("SIDERA_INSTITUTION_ACADEMIC_IDENTITY_MISSING"));
assert.ok(core.includes("catalog_v3_rejects_script_titles_and_caps_unique_logical_records"));
assert.ok(core.includes("academic_discovery_keeps_only_papers_and_opaque_full_text_locators"));

assert.ok(catalogInspect.includes("sanitizedClone"));
assert.ok(catalogInspect.includes("script,style,noscript,template"));
assert.ok(catalogInspect.includes("doclist\\["));
assert.ok(catalogInspect.includes("logicalIdentity"));
assert.ok(catalogInspect.includes("seenRecords"));
assert.ok(catalogInspect.includes("catalogRecordId"));
assert.ok(!catalogInspect.includes("if (records.length >= 20) break"));

assert.ok(discoveryRoute.includes("珞珈学术搜索|学术搜索"));
assert.ok(discoveryRoute.includes("location.assign"));
assert.ok(academicInspect.includes("journal-article"));
assert.ok(academicInspect.includes("conference-paper"));
assert.ok(academicInspect.includes("thesis"));
assert.ok(academicInspect.includes("#searchBar"));
assert.ok(academicInspect.includes("期刊论文|文章"));
assert.ok(academicInspect.includes("_wanfang_"));
assert.ok(academicInspect.includes("_cass_nssd_"));
assert.ok(academicInspect.includes("_crossref_"));
assert.ok(academicInspect.includes("_elsevier_sciencedirect_"));
assert.ok(academicInspect.includes("_pubmed_"));
assert.ok(academicInspect.includes("candidate === 'undefined'"));
assert.ok(academicInspect.includes("fullTextMarker ? detailUrl : null"));
assert.ok(!academicInspect.includes("cloneNode"));
assert.ok(academicFullTextResolve.includes("^阅读全文$"));
assert.ok(academicFullTextResolve.includes("链接到在线资源"));
assert.ok(academicFilter.includes("文章|期刊论文|articles?|journal articles?"));
assert.ok(academicFilter.includes("会议论文|conference papers?"));
assert.ok(academicFilter.includes("学位论文|dissertations?|thesis|theses"));
assert.ok(academicInspect.includes("fullTextStatus"));
assert.ok(academicSubmit.includes("pageSignature"));
assert.ok(runtimeProduction.includes("resolve_whu_academic_discovery_entry"));
assert.ok(runtimeProduction.includes("activate_official_discovery_route"));
assert.ok(runtimeProduction.includes("SIDERA_INSTITUTION_DISCOVERY_ROUTE_UNRESOLVED"));
assert.ok(runtimeProduction.includes("unknown_observations >= 12"));
assert.ok(runtimeProduction.includes("resolve_academic_full_text_entry"));
assert.ok(runtimeProduction.includes("apply_academic_resource_filters"));
assert.ok(runtimeProduction.includes("SIDERA_INSTITUTION_ACADEMIC_FILTER_UNCONFIRMED"));
assert.ok(runtimeProduction.includes("result_open_epoch"));
const searchSuccessRuntime = between(runtimeProduction, "fn finish_search_success", "fn finish_search_error");
assert.ok(searchSuccessRuntime.includes("emit_search(app, &snapshot)"));
assert.ok(searchSuccessRuntime.includes("emit_session(app, &session)"));
const academicRuntime = between(runtimeProduction, "async fn run_academic_discovery_search", "async fn run_catalog_search");
assert.ok(!academicRuntime.includes("WHU_CATALOG_ENTRY_URL"));
assert.ok(academicRuntime.includes("validate_academic_adapter_records"));
assert.ok(academicRuntime.includes("normalize_academic_adapter_records"));

assert.ok(bridge.includes('SideraInstitutionSearchSource = "academic-discovery" | "catalog"'));
assert.ok(bridge.includes('"whu-academic-discovery-v1"'));
assert.ok(bridge.includes('"whu-opac-catalog-v3"'));
assert.ok(bridge.includes('target?: "record" | "full-text"'));
assert.ok(app.includes('useState<InstitutionWorkspaceMode>("academic-discovery")'));
assert.ok(app.includes('"academic-discovery", "统一学术发现", "原生论文结果与全文路线"'));
assert.ok(app.includes('"database-direct", "数据库直达", "WOS 等官方数据库入口"'));
assert.ok(app.includes('"馆藏目录", "图书与馆藏信息"'));
assert.ok(app.includes("institutionFullTextStatusLabel"));
assert.ok(app.includes("institutionFullTextRouteLabel"));
assert.ok(app.includes("sourceReadiness"));
assert.ok(css.includes(".institution-source-switch"));

assert.ok(runtimeProduction.includes('const INSTITUTION_DATA_DIRECTORY: &str = "institution-webview-v1/whu"'));
assert.ok(runtimeProduction.includes("search_snapshots: HashMap"));
assert.ok(runtimeProduction.includes("full_text_urls: HashMap"));
for (const forbidden of [
  "upsert_paper_library",
  "download_pdf",
  "sidera_pi",
  "document.cookie",
  "cookies_for_url",
]) {
  assert.ok(!runtimeProduction.includes(forbidden), forbidden);
}

for (const document of [status, roadmap, architecture, decisions, development]) {
  assert.ok(document.includes("M2.0c-L1a-R4"));
}
assert.ok(status.includes("NATIVE CORE WEB FLOW PASS"));
assert.ok(status.includes("NATIVE ACADEMIC DISCOVERY FAIL"));
assert.ok(status.includes("P1b-R1"));
assert.ok(status.includes("INSTITUTION AUTH PASS / CATALOG EXTRACTION FAIL / PRIMARY ROUTE MISALIGNED"));
assert.ok(roadmap.includes("P2 受控题录导入与论文身份"));
assert.ok(architecture.includes("最终产品目标架构（规划，不代表当前已实现）"));
assert.ok(decisions.includes("D-144：Sidera 拥有原生科研工作流"));
assert.equal(evidence.package, "M2.0c-L1a-R4");
assert.equal(evidence.status, "IMPLEMENTED");
assert.equal(evidence.automatedTechnical, "PASS");
assert.equal(evidence.nativeAcademicDiscovery, "PARTIAL_PASS_USER_REPORTED");
assert.equal(evidence.nativeCoreFlow, "PASS_USER_REPORTED");
assert.equal(evidence.completeNativeGate, "UNVERIFIED");
assert.equal(evidence.externalInstitutionRequests, 0);
assert.equal(evidence.providerCalls, 0);
assert.equal(evidence.paperLibraryWrites, 0);
assert.equal(evidence.downloads, 0);
assert.equal(
  pkg.scripts["audit:sidera-institution-search-l1a-r4"],
  "node scripts/sidera_institution_search_l1a_r4_audit.mjs",
);

console.log(JSON.stringify({
  status: "PASS",
  package: "M2.0c-L1a-R4",
  defaultSource: "academic-discovery",
  adapters: ["whu-academic-discovery-v1", "whu-opac-catalog-v3"],
  catalogGate: ["whole-record-container", "script-cleanup", "logical-record-dedupe"],
  academicGate: ["official-dynamic-route", "paper-kind", "paper-identity", "opaque-open-target"],
  externalInstitutionRequests: 0,
  providerCalls: 0,
  manualCoreWebFlow: "PASS_USER_REPORTED",
  nativeAcademicDiscovery: "FAIL_SUPERSEDED_BY_P1B_R1",
  completeNativeGate: "UNVERIFIED",
}, null, 2));
