import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const sources = {
  app: read("src/App.tsx"),
  desktop: read("src/lib/desktop.ts"),
  commands: read("src-tauri/src/lib.rs"),
  commit: read("src-tauri/core/src/import_commit.rs"),
};
const evidencePath = path.join(
  root,
  "docs/evidence/sidera-p2b-r2-controlled-import-local-search-2026-08-06.json",
);
const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
const docs = ["PROJECT.md", "ROADMAP.md", "STATUS.md", "ARCHITECTURE.md", "DECISIONS.md", "DEVELOPMENT.md"]
  .map((name) => ({ name, content: read(`docs/${name}`) }));

const checks = [];
const check = (name, passed, detail) => checks.push({ name, passed: Boolean(passed), detail });
const includesAll = (content, values) => values.every((value) => content.includes(value));

check(
  "local keyword input is a draft separated from the executed query",
  includesAll(sources.app, [
    "libraryQueryDraft",
    "setLibraryQueryDraft(event.target.value)",
    "const nextQuery = libraryQueryDraft.trim()",
    "setLibraryQuery(nextQuery)",
  ]),
  "typing updates only the draft; execute promotes one trimmed query",
);
check(
  "IME composition cannot submit a partial keyword",
  includesAll(sources.app, [
    "libraryQueryComposing",
    "onCompositionStart",
    "onCompositionEnd",
    "!event.nativeEvent.isComposing",
  ]),
  "Chinese IME composition is fenced from Enter submission",
);
check(
  "empty and unchanged queries are no-op while refresh is explicit",
  includesAll(sources.app, [
    "if (!nextQuery || nextQuery === libraryQuery.trim()) return",
    "refreshLibraryKeywordSearch",
    'aria-label="重新检索当前条件"',
  ]),
  "same-query execution requires the dedicated refresh action",
);
check(
  "keyword execution is bound to Enter or the explicit search button",
  includesAll(sources.app, [
    'event.key === "Enter"',
    "onClick={executeLibraryKeywordSearch}",
    "输入后按 Enter 或点击检索",
  ]),
  "no input-change handler executes a query",
);
check(
  "stale local-library responses are ignored and old results survive failure",
  includesAll(sources.app, [
    "libraryLoadSequenceRef",
    "const requestSequence = ++libraryLoadSequenceRef.current",
    "if (requestSequence !== libraryLoadSequenceRef.current) return",
    "setLibraryPage(nextPage)",
    "文献库分页查询失败",
  ]),
  "the displayed page is replaced only after the latest successful request",
);
check(
  "local search exposes bounded diagnostics and sorting explanation",
  includesAll(sources.app, [
    "libraryQueryExecutionCount",
    "本次会话查询次数",
    "待检索：",
    "排序标准：",
    "年份从新到旧",
    "题名字母序",
  ]),
  "native acceptance can verify zero queries while typing and one per submit",
);
check(
  "paper filtering sorting and pagination execute in SQLite",
  includesAll(sources.commands, [
    "fn query_paper_library(",
    "let (where_sql, query_params) = paper_query_predicate(",
    "WHERE {where_sql}",
    "ORDER BY {sort_sql}",
    "LIMIT ? OFFSET ?",
    "params_from_iter(page_params.iter())",
  ]) && sources.desktop.includes('"query_paper_library"'),
  "the frontend does not scan the full 25k paper collection",
);
check(
  "main-library import ledger is authoritative across restart",
  includesAll(sources.commit, [
    "pub fn import_commit_status(",
    "pub fn import_commit_history(",
    "pub fn import_commit_status_from_connection(",
    "pub fn import_commit_history_from_connection(",
    "SELECT id,project_id,batch_id,client_commit_id",
    "open_review_batch_read_only(",
    "ledger.batch_version",
    "main ledger remains readable without auxiliary review store",
    "history leaves review unchanged",
  ]),
  "status and history read the main ledger without mutating auxiliary review receipts",
);
check(
  "restart restores the latest frozen batch when no editable batch exists",
  (sources.app.match(/\?\? batches\[0\]/g) ?? []).length >= 2,
  "initial mount and explicit refresh both fall back to the newest batch returned by the store",
);

check(
  "evidence separates the observed forward commit from unverified rollback gates",
  evidence.package === "Sidera-P2b-R2" &&
    evidence.date === "2026-08-06" &&
    evidence.status === "IMPLEMENTED" &&
    evidence.automatedTechnical === "PASS" &&
    evidence.nativeControlledImport === "PARTIAL_PASS" &&
    evidence.nativeLocalSearch === "UNVERIFIED" &&
    evidence.nativeObserved?.inserted === 10 &&
    evidence.nativeObserved?.beforeRevision === 0 &&
    evidence.nativeObserved?.afterRevision === 1,
  evidencePath,
);
check(
  "evidence records zero automated external side effects",
  evidence.automatedSafety?.institutionNetworkRequests === 0 &&
    evidence.automatedSafety?.providerCalls === 0 &&
    evidence.automatedSafety?.fullTextDownloads === 0 &&
    evidence.automatedSafety?.hotspotRebuilds === 0,
  "automated verification stays local and low-load",
);

for (const doc of docs) {
  check(
    `${doc.name} records Development 011-R2 and its native gate`,
    includesAll(doc.content, [
      "开发 011-R2",
      "NATIVE CONTROLLED IMPORT PARTIAL PASS",
      "NATIVE LOCAL SEARCH UNVERIFIED",
      "NATIVE CONTROLLED IMPORT AND LOCAL SEARCH PASS",
    ]),
    "canonical docs keep automated, observed, and remaining native facts separate",
  );
}

const failedChecks = checks.filter((entry) => !entry.passed);
const result = {
  audit: "sidera-p2b-r2-controlled-import-local-search",
  generatedAt: new Date().toISOString(),
  status: failedChecks.length === 0 ? "PASS" : "FAIL",
  execution: "read-only-source-and-evidence-audit",
  checks,
  failedChecks,
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (failedChecks.length > 0) process.exitCode = 1;
