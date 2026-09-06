import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

const sources = {
  coreLib: read("src-tauri/core/src/lib.rs"),
  commit: read("src-tauri/core/src/import_commit.rs"),
  review: read("src-tauri/core/src/import_review.rs"),
  schema: read("src-tauri/core/src/import_schema.sql"),
  agentStore: read("src-tauri/core/src/agent_store.rs"),
  desktopCommands: read("src-tauri/src/sidera_import_review.rs"),
  invokeHandler: read("src-tauri/src/lib.rs"),
  desktopClient: read("src/lib/desktop.ts"),
};

const evidencePath = path.join(
  root,
  "docs/evidence/sidera-p2b-controlled-import-2026-08-05.json",
);
const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
const canonicalDocs = [
  "PROJECT.md",
  "ROADMAP.md",
  "STATUS.md",
  "ARCHITECTURE.md",
  "DECISIONS.md",
  "DEVELOPMENT.md",
].map((name) => ({ name, content: read(`docs/${name}`) }));

const checks = [];
const check = (name, passed, detail) => {
  checks.push({ name, passed: Boolean(passed), detail });
};
const includesAll = (content, values) => values.every((value) => content.includes(value));

check(
  "main paper library schema is v14",
  /pub const LIBRARY_SCHEMA_VERSION:\s*i64\s*=\s*14\s*;/.test(sources.coreLib),
  "src-tauri/core/src/lib.rs",
);
check(
  "import review schema is v3",
  /pub const IMPORT_REVIEW_SCHEMA_VERSION:\s*i64\s*=\s*3\s*;/.test(sources.review),
  "src-tauri/core/src/import_review.rs",
);
check(
  "v14 migration installs the import governance schema",
  includesAll(sources.agentStore, [
    "migrate_v14_import_schema",
    "include_str!(\"import_schema.sql\")",
  ]),
  "v14 migration plus independent SQL schema",
);

for (const table of [
  "paper_import_commits",
  "paper_import_commit_items",
  "paper_source_records",
  "paper_identity_aliases",
]) {
  check(
    `governance table exists: ${table}`,
    sources.schema.includes(`CREATE TABLE IF NOT EXISTS ${table}`),
    "src-tauri/core/src/import_schema.sql",
  );
}

for (const coreFunction of [
  "prepare_import_commit",
  "execute_import_commit",
  "import_commit_status",
  "import_commit_history",
  "rollback_import_commit",
]) {
  check(
    `core API exists: ${coreFunction}`,
    sources.commit.includes(`pub fn ${coreFunction}`),
    "src-tauri/core/src/import_commit.rs",
  );
}

check(
  "frozen review batches can be copied into a new active batch",
  includesAll(sources.review, [
    "pub fn copy_frozen_review_batch",
    "SIDERA_IMPORT_REVIEW_COPY_SOURCE_NOT_FROZEN",
    "copied.decision = None",
  ]),
  "committed and rolled-back batches remain frozen while a new review is created",
);

for (const command of [
  "sidera_import_review_batch_clone",
  "sidera_import_review_commit_prepare",
  "sidera_import_review_commit_execute",
  "sidera_import_review_commit_status",
  "sidera_import_review_commit_history",
  "sidera_import_review_commit_rollback",
]) {
  check(
    `desktop command is registered: ${command}`,
    sources.desktopCommands.includes(`fn ${command}`) &&
      sources.invokeHandler.includes(`sidera_import_review::${command}`) &&
      sources.desktopClient.includes(`\"${command}\"`),
    "Rust command, invoke handler, and TypeScript client",
  );
}

check(
  "commit status and history expose persistent imported paper ids",
  includesAll(sources.commit, [
    "pub paper_ids: Vec<String>",
    "load_commit_paper_ids(",
  ]) && sources.desktopClient.includes("paperIds?: string[]"),
  "submitted entities can be reopened from current results or commit history",
);

check(
  "declared v14 databases are validated instead of silently repaired",
  includesAll(sources.coreLib, [
    "validate_import_schema_contract",
    "LIBRARY_SCHEMA_VERSION => validate_import_schema_contract(conn)",
  ]),
  "missing v14 tables, columns, indexes, or foreign keys are incompatible",
);

check(
  "execute input binds preview, batch, revision, and idempotency key",
  includesAll(sources.commit, [
    "pub preview_id: String",
    "pub preview_hash: String",
    "pub batch_version: i64",
    "pub expected_revision: i64",
    "pub client_commit_id: String",
    "SIDERA_IMPORT_COMMIT_PREVIEW_STALE",
    "SIDERA_IMPORT_COMMIT_REVISION_DRIFT",
  ]),
  "previewId + previewHash + batchVersion + expectedRevision + clientCommitId",
);
check(
  "preview hash is deterministic over the complete batch contract",
  includesAll(sources.commit, [
    "IMPORT_COMMIT_ENGINE_VERSION",
    "\"batchVersion\": batch.batch_version",
    "\"expectedRevision\": revision",
    "\"items\": items",
    "full_hash(",
  ]),
  "engine, batch, revision, counts, and items are hashed",
);
check(
  "whole-batch write is one immediate transaction",
  sources.commit.includes("transaction_with_behavior(TransactionBehavior::Immediate)") &&
    sources.commit.includes("transaction.commit().map_err(commit_store_error)?") &&
    sources.commit.includes("INSERT INTO paper_import_commit_items"),
  "paper, source, alias, item ledger, revision, and commit ledger share a transaction",
);
check(
  "merge policy is fill-empty-only",
  includesAll(sources.commit, [
    "SideraImportFieldChangeAction::FillEmpty",
    "SideraImportFieldChangeAction::PreserveExisting",
    "existing_value.as_deref().is_none_or(str::is_empty)",
  ]),
  "non-empty existing values are preserved",
);
check(
  "invalid DOI values remain source truth only",
  includesAll(sources.commit, [
    "fn normalize_doi(value: &str) -> Option<String>",
    "invalid_doi_is_source_truth_only_and_never_becomes_paper_identity",
  ]) && sources.review.includes("fn normalize_doi(value: &str) -> Option<String>"),
  "PaperEntity, deterministic identity, and aliases use only validated DOI values",
);
check(
  "source locators remove extended authentication parameters",
  includesAll(sources.commit, [
    '"authcode"',
    '"signature"',
    '"nonce"',
    '"samlresponse"',
    '"assertion"',
  ]),
  "Cookie, ticket, token, session, signatures, and assertions are not persisted",
);
check(
  "client commit id is idempotent and the ledgers reconcile",
  includesAll(sources.commit, [
    "ledger_by_client(",
    "SIDERA_IMPORT_COMMIT_CLIENT_ID_REUSED",
    "result.idempotent = true",
    "reconcile_review_from_ledger(",
    "SIDERA_IMPORT_COMMIT_RECONCILIATION_REQUIRED",
  ]),
  "duplicate requests return the authoritative committed result",
);

const rollbackInput = sources.commit.match(
  /pub struct SideraImportRollbackInput\s*\{([\s\S]*?)\n\}/,
)?.[1] ?? "";
check(
  "rollback has no force switch",
  rollbackInput.length > 0 && !/\bforce\b/i.test(rollbackInput),
  "safe rollback only",
);
check(
  "rollback blocks the entire batch on drift or conflicts",
  includesAll(sources.commit, [
    "SIDERA_IMPORT_ROLLBACK_REVISION_DRIFT",
    "let conflicts = rollback_conflicts(",
    "status: \"blocked\".to_string()",
    "restored_count: 0",
    "deleted_count: 0",
  ]),
  "a blocked rollback performs no mutations",
);

const forbiddenAutomaticSideEffects = [
  /reqwest::/,
  /download_(?:pdf|full_text)/i,
  /parse_(?:pdf|full_text)/i,
  /generate_(?:hotspot|embedding)/i,
  /invoke_(?:provider|agent)/i,
  /spawn_(?:provider|agent)/i,
];
check(
  "commit engine has no automatic hotspot, full-text, Provider, or Agent execution",
  forbiddenAutomaticSideEffects.every((pattern) => !pattern.test(sources.commit)),
  "metadata may retain full-text status, but no external side effect is invoked",
);

check(
  "evidence records automated pass and product unverified",
  evidence.status === "IMPLEMENTED" &&
    evidence.automatedTechnical === "PASS" &&
    evidence.product === "UNVERIFIED" &&
    evidence.nativeControlledImport === "UNVERIFIED",
  evidencePath,
);
check(
  "evidence records zero out-of-scope automated side effects",
  evidence.excluded?.hotspotGeneration === 0 &&
    evidence.excluded?.fullTextDownloads === 0 &&
    evidence.excluded?.providerCalls === 0 &&
    evidence.excluded?.agentRuns === 0,
  "hotspot/full-text/Provider/Agent counters",
);
check(
  "P2c and F1 remain not started",
  evidence.nextStages?.p2c === "NOT_STARTED" &&
    evidence.nextStages?.f1 === "NOT_STARTED",
  "P2b does not advance downstream stages",
);

for (const doc of canonicalDocs) {
  check(
    `${doc.name} records development 011`,
    includesAll(doc.content, [
      "开发 011",
      "P2b",
      "PRODUCT UNVERIFIED",
      "NATIVE CONTROLLED IMPORT PASS",
    ]),
    "canonical documentation status contract",
  );
}

const failedChecks = checks.filter((entry) => !entry.passed);
const result = {
  audit: "sidera-import-commit-p2b",
  generatedAt: new Date().toISOString(),
  status: failedChecks.length === 0 ? "PASS" : "FAIL",
  checks,
  failedChecks,
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (failedChecks.length > 0) {
  process.exitCode = 1;
}
