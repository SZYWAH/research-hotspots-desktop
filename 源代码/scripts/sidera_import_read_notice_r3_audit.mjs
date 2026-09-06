import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const sources = {
  app: read("src/App.tsx"),
  desktop: read("src/lib/desktop.ts"),
  styles: read("src/index.css"),
  lib: read("src-tauri/src/lib.rs"),
  commands: read("src-tauri/src/sidera_import_review.rs"),
  commit: read("src-tauri/core/src/import_commit.rs"),
  review: read("src-tauri/core/src/import_review.rs"),
  package: read("package.json"),
};

const checks = [];
const check = (name, passed, detail) => checks.push({ name, passed: Boolean(passed), detail });
const includesAll = (source, tokens) => tokens.every((token) => source.includes(token));
const section = (source, start, end) => {
  const from = source.indexOf(start);
  if (from < 0) return "";
  const to = source.indexOf(end, from + start.length);
  return source.slice(from, to < 0 ? undefined : to);
};

const galaxyPayload = section(sources.lib, "fn get_v20_galaxy_payload(", "const AGENT_IMMERSIVE_DEFAULT_PAPER_COUNT");
check(
  "V20 galaxy payload uses the prepared read-only contract",
  galaxyPayload.includes("open_library_database_read_only")
    && !galaxyPayload.includes("open_library_database(&"),
  "ordinary visual reads do not rerun migration or integrity preparation",
);

const statusCommand = section(
  sources.commands,
  "pub(crate) async fn sidera_import_review_commit_status(",
  "pub(crate) async fn sidera_import_review_commit_history(",
);
const historyCommand = section(
  sources.commands,
  "pub(crate) async fn sidera_import_review_commit_history(",
  "pub(crate) async fn sidera_import_review_commit_rollback(",
);
for (const [name, command, delegatedCall] of [
  ["status", statusCommand, "import_commit_status_from_connection"],
  ["history", historyCommand, "import_commit_history_from_connection"],
]) {
  check(
    `${name} command reuses the prepared read-only registry`,
    includesAll(command, ["open_library_database_read_only", delegatedCall])
      && !command.includes("migrate_commit_library")
      && !command.includes("try_acquire"),
    "no migration or mutation permit is acquired by an ordinary read command",
  );
}

const statusCore = section(
  sources.commit,
  "pub fn import_commit_status_from_connection(",
  "pub fn import_commit_history(",
);
const historyCore = section(
  sources.commit,
  "pub fn import_commit_history_from_connection(",
  "pub fn rollback_import_commit(",
);
check(
  "commit status is validation-only and does not reconcile receipts",
  includesAll(statusCore, [
    "validate_library_commit_read_schema",
    "open_review_batch_read_only",
    "normalize_commit_status_review_error",
  ])
    && !statusCore.includes("ensure_library_commit_schema")
    && !statusCore.includes("reconcile_review_from_ledger")
    && !statusCore.includes("mark_review_failed"),
  "status reads either the authoritative ledger or a prepared review receipt without writes",
);
check(
  "commit history is ledger-only and never opens the review store",
  historyCore.includes("validate_library_commit_read_schema")
    && !historyCore.includes("open_review")
    && !historyCore.includes("ensure_library_commit_schema")
    && !historyCore.includes("reconcile_review_from_ledger"),
  "an empty ledger returns an empty history without creating auxiliary state",
);
check(
  "missing status has one stable not-found contract",
  includesAll(sources.commit, [
    '"SIDERA_IMPORT_REVIEW_STORE_NOT_FOUND" | "SIDERA_IMPORT_REVIEW_BATCH_NOT_FOUND"',
    '"SIDERA_IMPORT_COMMIT_STATUS_NOT_FOUND"',
    "missing_status_is_normalized_and_empty_history_does_not_create_review_store",
    "assert!(!missing_review.exists())",
  ]),
  "store absence and batch absence cannot leak different implementation errors",
);
check(
  "core read-only connections enforce SQLite query_only",
  includesAll(sources.commit, [
    "OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX",
    'pragma_update(None, "query_only", "ON")',
    "busy_timeout(Duration::from_secs(2))",
  ]),
  "direct core readers cannot mutate the main library",
);
check(
  "review batch has a prepared read-only opener",
  includesAll(sources.review, [
    "pub fn open_review_batch_read_only(",
    "fn open_store_read_only(path: &Path)",
    '"SIDERA_IMPORT_REVIEW_SCHEMA_PREPARATION_REQUIRED"',
    'pragma_update(None, "query_only", "ON")',
    "prepared_review_batches_support_query_only_reads",
  ]),
  "review reads validate schema version instead of creating or migrating tables",
);

check(
  "desktop invoke errors preserve Rust string codes as Error messages",
  includesAll(sources.desktop, [
    "invoke as tauriInvoke",
    "export function normalizeDesktopInvokeError(error: unknown)",
    'typeof error === "string" && error.trim()',
    "throw normalizeDesktopInvokeError(error)",
  ]),
  "React catches receive the actual stable Rust error instead of a generic fallback",
);
check(
  "import review notices are scoped and expire after eight seconds",
  includesAll(sources.app, [
    '"institution-search" | "import-review"',
    'scope: "import-review"',
    "dismissAfterMs: 8000",
    'onClearNoticeScope("import-review")',
  ]),
  "the ingestion refresh error is bounded and cannot remain global forever",
);
check(
  "status and history failures remain independently inspectable",
  includesAll(sources.app, [
    "type ImportReviewReadDiagnostics",
    "setImportCommitReadDiagnostics",
    "readDiagnostics={importCommitReadDiagnostics}",
    'aria-label="题录读取诊断"',
    '["status", "提交状态", readDiagnostics.status]',
    '["history", "提交历史", readDiagnostics.history]',
    'reportError?: (kind: "status" | "history", message: string) => void',
    'reportError?.("status", "题录提交状态读取失败，请查看读取诊断。")',
    'reportError?.("history", "题录提交历史读取失败，请查看读取诊断。")',
  ]) && !sources.app.includes('errors.join("；")'),
  "bounded toasts contain stable user copy, while both raw command errors stay visible in diagnostics",
);
check(
  "late A-to-B-to-A refreshes cannot overwrite the active context",
  includesAll(sources.app, [
    "isCurrent: () => boolean = () => true",
    "if (!isCurrent()) return { statusError, historyError, stale: true }",
    "importReviewNoticeRevisionRef.current === noticeScopeRevision",
    "if (disposed || readErrors.stale) return",
    "await refreshImportReviewBatches(batchId, isCurrent)",
    "async function refreshImportReviewBatches(",
  ]) && (sources.app.match(/if \(!isCurrent\(\)\)/g) ?? []).length >= 5,
  "status, history, batch-list and opened-batch responses are fenced before state is committed",
);
check(
  "stale import review refreshes are invalidated",
  includesAll(sources.app, [
    "scopeRevision: noticeScopeRevision",
    "options.scopeRevision !== currentScopeRevision",
    "importReviewNoticeRevisionRef.current = onClearNoticeScope",
  ]),
  "leaving the tab or replacing a batch prevents a late async error from resurfacing",
);
check(
  "notice timers clear by notice identity",
  includesAll(sources.app, [
    "const noticeId = notice.id",
    "const dismissNotice = useCallback",
    "current.id !== noticeId",
    "noticeScopeRevisionsRef.current.set(current.scope, nextRevision)",
    "window.clearTimeout(timer)",
  ]),
  "an older timer cannot dismiss a newer notice and a manual dismissal invalidates late scoped responses",
);
check(
  "notices expose a visible close control",
  includesAll(sources.app, [
    'className="toast__close"',
    'aria-label="关闭通知"',
    "<X size={14}",
  ]) && sources.styles.includes(".toast__close"),
  "persistent errors remain explicitly dismissible",
);
check(
  "the import read fault fixture is development-only, scoped and one-shot",
  includesAll(sources.commands, [
    "SideraImportReadFaultFixtureInput",
    "if !cfg!(debug_assertions)",
    "fixture.database_dir == database_dir",
    "fixture.project_id == project_id",
    "fixture.target == target",
    "*fixture = None",
    "import_read_fault_fixture_is_scoped_and_consumed_once",
  ]) && includesAll(sources.lib, [
    "sidera_import_read_fault_fixture_arm",
    "sidera_import_read_fault_fixture_clear",
  ]),
  "the fixture cannot ship active in production or leak across libraries, projects or commands",
);
check(
  "fault controls remain inside the collapsed diagnostics surface",
  includesAll(sources.desktop, [
    "export type SideraImportReadFaultTarget",
    "!isDesktopRuntime() || !import.meta.env.DEV",
    "sidera_import_read_fault_fixture_arm",
  ]) && includesAll(sources.app, [
    'aria-label="题录读取诊断"',
    "onRunReadFaultFixture",
    "开发夹具（内存一次性，不写数据库）",
    'dismissAfterMs: 8000',
  ]),
  "low-value fixture actions are hidden in diagnostics and preserve the content-first workspace",
);

const packageJson = JSON.parse(sources.package);
check(
  "package exposes the R3 read-notice audit",
  packageJson.scripts["audit:sidera-import-read-notice-r3"]
    === "node scripts/sidera_import_read_notice_r3_audit.mjs",
  packageJson.scripts["audit:sidera-import-read-notice-r3"],
);

const failedChecks = checks.filter((entry) => !entry.passed);
const result = {
  audit: "sidera-import-read-notice-r3",
  status: failedChecks.length === 0 ? "PASS" : "FAIL",
  execution: "read-only-source-audit",
  checkCount: checks.length,
  checks,
  failedChecks,
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (failedChecks.length > 0) process.exitCode = 1;
