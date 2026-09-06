import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const sources = {
  coreLib: read("src-tauri/core/src/lib.rs"),
  store: read("src-tauri/core/src/document_store.rs"),
  commands: read("src-tauri/src/sidera_documents.rs"),
  browser: read("src-tauri/src/sidera_institution_browser.rs"),
  invokeHandler: read("src-tauri/src/lib.rs"),
  desktop: read("src/lib/desktop.ts"),
  app: read("src/App.tsx"),
};
const evidencePath = path.join(
  root,
  "docs/evidence/sidera-f1a-single-document-acquisition-2026-08-06.json",
);
const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
const docs = ["PROJECT.md", "ROADMAP.md", "STATUS.md", "ARCHITECTURE.md", "DECISIONS.md", "DEVELOPMENT.md"]
  .map((name) => ({ name, content: read(`docs/${name}`) }));

const checks = [];
const check = (name, passed, detail) => checks.push({ name, passed: Boolean(passed), detail });
const includesAll = (content, values) => values.every((value) => content.includes(value));

check(
  "document store is a UI-independent core module",
  sources.coreLib.includes("pub mod document_store;") &&
    includesAll(sources.store, [
      'DOCUMENT_STORE_DATABASE: &str = "documents-v1.sqlite"',
      'DOCUMENT_STORE_DIRECTORY: &str = "documents-v1"',
      "pub fn ingest_document(",
      "pub fn paper_document_snapshot(",
    ]),
  "PaperEntity remains in the main library while documents use an independent store",
);
check(
  "document identity and versions are immutable and content addressed",
  includesAll(sources.store, [
    "CREATE TABLE IF NOT EXISTS documents",
    "UNIQUE(project_id, paper_id)",
    "CREATE TABLE IF NOT EXISTS document_versions",
    "UNIQUE(document_id, sha256)",
    "sha256_hex",
    'join("blobs")',
    'format!("{sha256}.pdf")',
  ]),
  "same bytes deduplicate while different hashes create multiple versions",
);
check(
  "blob installation is atomic and verified before rename",
  includesAll(sources.store, [
    '".{sha256}.{}.{}.partial"',
    "file.sync_all()",
    "SIDERA_DOCUMENT_BLOB_HASH_MISMATCH",
    "fs::rename(&partial, &target)",
  ]),
  "partial files never become committed document versions without hash verification",
);
check(
  "PDF signature and paper/source provenance are validated without latest-source guessing",
  includesAll(sources.store, [
    'window == b"%PDF-"',
    "validate_paper_and_source",
    "resolve_source_record_match",
    "SideraSourceRecordMatchInput",
    "provenance_search_candidate_ids",
    "paper_source_records",
    "SIDERA_DOCUMENT_NOT_PDF",
  ]) &&
    !sources.store.includes("ORDER BY created_at_ms DESC LIMIT 1"),
  "local files have no inferred institution source; institution files require an evidence-matched SourceRecord",
);
check(
  "persisted locators contain no authentication query or fragment",
  includesAll(sources.store, [
    "fn safe_locator",
    'url.scheme() != "https" && url.scheme() != "http"',
    'url.set_username("")',
    "url.set_password(None)",
    "url.set_query(None)",
    "url.set_fragment(None)",
  ]),
  "Cookie, ticket, token, userinfo, and fragments never enter document provenance",
);
check(
  "local and institution acquisitions share one immutable ingest path",
  includesAll(sources.commands, [
    "SideraAcquisitionKind::LocalImport",
    "SideraAcquisitionKind::InstitutionDownload",
    "source_record_id: None",
    "resolve_source_record_match",
    "SIDERA_DOCUMENT_SOURCE_MATCH_UNRESOLVED",
    "user-selected-local-file",
    "institution-session-user-triggered",
    "ingest_document(",
  ]),
  "both routes produce AcquisitionRecord -> DocumentVersion",
);
check(
  "pre-ingest institution failures are persisted with retryable stages",
  includesAll(sources.store, [
    "pub struct SideraDocumentFailureInput",
    "pub fn record_acquisition_failure(",
    "pre_ingest_failures_are_persisted_safely_and_restored",
    "SIDERA_DOCUMENT_ACQUISITION_FAILURE_INVALID",
  ]) &&
    includesAll(sources.commands, [
      'stage: "download-selection".to_string()',
      'stage: "source-match".to_string()',
      'stage: "source-route".to_string()',
      'stage: "source-navigation".to_string()',
      "record_acquisition_failure(SideraDocumentFailureInput",
      "retryable: true",
    ]) &&
    includesAll(sources.app, [
      "record.stage",
      "record.errorCode",
      "重试关联",
      "重试打开来源",
    ]),
  "route, navigation, download selection, and SourceRecord failures remain visible after restart and can be retried explicitly",
);
check(
  "institution source navigation is resolved from an opaque SourceRecord identity",
  includesAll(sources.store, [
    "pub struct SideraPaperSourceRouteQuery",
    "pub fn resolve_paper_source_route(",
    "sanitize_source_route",
    "source_record_id",
    "sensitive_source_query_key",
    "source_routes_are_resolved_by_identity_and_strip_sensitive_parameters",
  ]) &&
    includesAll(sources.commands, [
      "OpenInstitutionPaperSourceInput",
      "resolve_paper_source_route(SideraPaperSourceRouteQuery",
      "open_url_in_browser(",
      "SideraInstitutionBrowserContext",
    ]) &&
    !/struct OpenInstitutionPaperSourceInput[\s\S]*?url\s*:/.test(sources.commands),
  "the frontend submits only sourceRecordId; Rust resolves and sanitizes the persisted institutional route",
);
check(
  "institution attachment accepts only an opaque completed download id",
  includesAll(sources.commands, [
    "download_id: String",
    "completed_institution_download(&app, browser_state.inner(), &input.download_id)",
  ]) &&
    includesAll(sources.browser, [
      "pub(crate) fn completed_institution_download(",
      "record.status != SideraInstitutionDownloadStatus::Complete",
    ]) &&
    !/struct InstitutionPaperDocumentInput[\s\S]*?file_path\s*:/.test(sources.commands),
  "the frontend cannot attach an arbitrary institution filesystem path",
);
check(
  "five narrow Tauri commands are registered and typed",
  [
    "sidera_document_import_local",
    "sidera_document_attach_institution_download",
    "sidera_document_paper_snapshot",
    "sidera_document_open_version",
    "sidera_document_open_institution_source",
  ].every((command) => sources.invokeHandler.includes(`sidera_documents::${command}`) && sources.desktop.includes(`"${command}"`)) &&
    includesAll(sources.desktop, [
      "SideraDocumentVersion",
      "SideraDocumentAcquisitionRecord",
      "SideraPaperDocumentSnapshot",
      "SideraPaperSourceRecord",
      "openInstitutionPaperSource",
    ]),
  "no generic file, URL, Cookie, or credential command is exposed",
);
check(
  "native UI supports file-first explicit paper association and institution attachment",
  includesAll(sources.app, [
    "function PaperDocumentPanel(",
    "pendingLocalPdf",
    "stageLocalPdfImport",
    "associatePendingLocalPdf",
    "导入本地 PDF",
    "确认关联",
    "不会依据文件名",
    "关联已下载机构 PDF",
    "论文来源与机构全文",
    "获取机构全文",
    "SHA-256",
    "文档版本",
    "获取记录",
    "打开原始文件",
  ]),
  "the user sees versions and acquisition outcomes on the PaperEntity detail",
);
check(
  "core tests cover dedupe, multiple versions, restart, and invalid input",
  includesAll(sources.store, [
    "local_pdf_is_immutable_deduplicated_and_restored",
    "explicit_and_evidence_based_source_records_are_bound_without_guessing",
    "invalid_file_and_unknown_paper_are_rejected",
    "pre_ingest_failures_are_persisted_safely_and_restored",
    "source_routes_are_resolved_by_identity_and_strip_sensitive_parameters",
    "assert_eq!(duplicate.versions.len(), 1)",
    "assert_eq!(multi.versions.len(), 2)",
    "assert_eq!(restored.versions.len(), 2)",
  ]),
  "disposable fixtures prove the immutable document lifecycle without institution access",
);

check(
  "evidence keeps native acquisition unverified",
  evidence.package === "Sidera-F1a" &&
    evidence.date === "2026-08-06" &&
    evidence.status === "IMPLEMENTED" &&
    evidence.automatedTechnical === "PASS" &&
    evidence.nativeSingleDocumentAcquisition === "UNVERIFIED",
  evidencePath,
);
check(
  "evidence records zero automated external and main-library side effects",
  evidence.automatedSafety?.institutionNetworkRequests === 0 &&
    evidence.automatedSafety?.providerCalls === 0 &&
    evidence.automatedSafety?.mainLibraryWrites === 0 &&
    evidence.automatedSafety?.hotspotRebuilds === 0,
  "document tests use temporary synthetic libraries and PDFs",
);

for (const doc of docs) {
  check(
    `${doc.name} records F1a and the native acquisition gate`,
    includesAll(doc.content, [
      "开发 012 / F1a",
      "documents-v1.sqlite",
      "AcquisitionRecord",
      "DocumentVersion",
      "NATIVE SINGLE-DOCUMENT ACQUISITION PASS",
      "PRODUCT UNVERIFIED",
    ]),
    "canonical docs describe the same immutable document boundary",
  );
}

const failedChecks = checks.filter((entry) => !entry.passed);
const result = {
  audit: "sidera-f1a-single-document-acquisition",
  generatedAt: new Date().toISOString(),
  status: failedChecks.length === 0 ? "PASS" : "FAIL",
  execution: "read-only-source-and-evidence-audit",
  checks,
  failedChecks,
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (failedChecks.length > 0) process.exitCode = 1;
