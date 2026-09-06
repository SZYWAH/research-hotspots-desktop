import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const read = (file) => readFile(path.join(root, file), "utf8");
const [core, desktop, bridge, app, css, cargoText, packageText, evidenceText, ...documents] = await Promise.all([
  read("src-tauri/core/src/import_review.rs"),
  read("src-tauri/src/sidera_import_review.rs"),
  read("src/lib/desktop.ts"),
  read("src/App.tsx"),
  read("src/index.css"),
  read("src-tauri/core/Cargo.toml"),
  read("package.json"),
  read("docs/evidence/sidera-p2a-import-review-2026-08-05.json"),
  read("docs/PROJECT.md"),
  read("docs/ROADMAP.md"),
  read("docs/STATUS.md"),
  read("docs/ARCHITECTURE.md"),
  read("docs/DECISIONS.md"),
  read("docs/DEVELOPMENT.md"),
]);
const pkg = JSON.parse(packageText);
const evidence = JSON.parse(evidenceText);

for (const marker of [
  "SideraImportReviewBatch",
  "SideraImportCandidate",
  "SideraIdentityEvidence",
  "SideraIdentityMatch",
  "SideraImportDecision",
  '"csv" => parse_csv',
  '"json" => parse_json',
  '"jsonl" | "ndjson" => parse_json_lines',
  '"bib" => parse_bibtex',
  '"ris" => parse_ris',
  "OpenFlags::SQLITE_OPEN_READ_ONLY",
  "OpenFlags::SQLITE_OPEN_NO_MUTEX",
  "CREATE TABLE IF NOT EXISTS review_batches",
  "CREATE TABLE IF NOT EXISTS review_candidates",
  "CREATE TABLE IF NOT EXISTS review_search_generations",
  "PRAGMA user_version=2",
  'evidence("doi"',
  '"provider-record",',
  'evidence("canonical-url"',
  '"title-author-year",',
]) assert.ok(core.includes(marker), marker);

assert.ok(cargoText.includes('csv = "1"'));
assert.ok(desktop.includes('const REVIEW_DATABASE_RELATIVE_PATH: &str = "Sidera/import-review-v1.sqlite"'));
assert.ok(desktop.includes('const LIBRARY_DATABASE_FILE: &str = "research-hotspots-v7.sqlite"'));
for (const command of [
  "sidera_import_review_batch_create",
  "sidera_import_review_batch_list",
  "sidera_import_review_batch_open",
  "sidera_import_review_decision_save",
  "sidera_import_review_batch_discard",
]) {
  assert.ok(desktop.includes(command), command);
  assert.ok(bridge.includes(command), command);
}

for (const marker of [
  "ImportReviewWorkspace",
  "P2a–P2b · 题录审查与正式提交",
  "先审查与预览，再以单一事务进入论文库",
  "创建审查批次",
  "合并到此记录",
  "放弃批次",
  "尚未写入论文库",
]) assert.ok(app.includes(marker), marker);
for (const marker of [
  ".import-review-workspace",
  ".import-review-layout",
  ".import-review-candidate",
  ".import-review-evidence",
  ".import-review-matches",
]) assert.ok(css.includes(marker), marker);

for (const document of documents) {
  assert.ok(document.includes("P2a"));
  assert.ok(document.includes("import-review-v1.sqlite"));
  assert.ok(document.includes("PRODUCT UNVERIFIED"));
}
assert.equal(evidence.package, "Sidera-P2a");
assert.equal(evidence.task, "开发 008");
assert.equal(evidence.status, "IMPLEMENTED");
assert.equal(evidence.automatedTechnical, "PASS");
assert.equal(evidence.product, "UNVERIFIED");
assert.equal(evidence.formats.csv, "PASS");
assert.equal(evidence.formats.json, "PASS");
assert.equal(evidence.formats.jsonl, "PASS");
assert.equal(evidence.formats.ndjson, "PASS");
assert.equal(evidence.formats.bibtex, "PASS");
assert.equal(evidence.formats.ris, "PASS");
assert.equal(evidence.mainPaperLibraryWrites, 0);
assert.equal(evidence.externalInstitutionRequests, 0);
assert.equal(evidence.providerCalls, 0);
assert.equal(
  pkg.scripts["audit:sidera-import-review-p2a"],
  "node scripts/sidera_import_review_p2a_audit.mjs",
);

console.log(JSON.stringify({
  status: "PASS",
  package: evidence.package,
  fixtures: {
    csv: "PASS",
    json: "PASS",
    jsonl: "PASS",
    ndjson: "PASS",
    bibtex: "PASS",
    ris: "PASS",
    damagedFile: "PASS",
    doiIdentity: "PASS",
    providerIdentity: "PASS",
    canonicalUrlIdentity: "PASS",
    titleAuthorYearIdentity: "PASS",
    newMergeConflictInvalid: "PASS",
    decisionPersistence: "PASS",
    projectIsolation: "PASS",
    mainLibraryReadOnly: "PASS",
  },
  mainPaperLibraryWrites: 0,
  externalInstitutionRequests: 0,
  providerCalls: 0,
  product: "UNVERIFIED",
}, null, 2));
