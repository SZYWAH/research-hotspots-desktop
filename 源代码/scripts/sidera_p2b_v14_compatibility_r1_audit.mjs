import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

const sources = {
  core: read("src-tauri/core/src/lib.rs"),
  migration: read("src-tauri/core/src/agent_store.rs"),
  setup: read("src-tauri/src/lib.rs"),
  desktop: read("src/lib/desktop.ts"),
  app: read("src/App.tsx"),
};
const docs = [
  "PROJECT.md",
  "ROADMAP.md",
  "STATUS.md",
  "ARCHITECTURE.md",
  "DECISIONS.md",
  "DEVELOPMENT.md",
].map((name) => ({ name, content: read(`docs/${name}`) }));
const evidencePath = path.join(
  root,
  "docs/evidence/sidera-p2b-v14-compatibility-r1-2026-08-05.json",
);
const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));

const setupStateStart = sources.setup.indexOf("fn get_library_setup_state(");
const setupStateEnd = sources.setup.indexOf(
  "#[tauri::command]\nfn validate_library_location(",
  setupStateStart,
);
const setupStateBody =
  setupStateStart >= 0 && setupStateEnd > setupStateStart
    ? sources.setup.slice(setupStateStart, setupStateEnd)
    : "";

const checks = [];
const check = (name, passed, detail) => {
  checks.push({ name, passed: Boolean(passed), detail });
};
const includesAll = (content, values) =>
  values.every((value) => content.includes(value));

check(
  "v14 contract status is a stable kebab-case three-way classification",
  /#\[serde\(rename_all = "kebab-case"\)\][\s\S]*?pub enum LibraryV14SchemaContractStatus[\s\S]*?CurrentV14,[\s\S]*?KnownPrecontractV14,[\s\S]*?UnknownInvalidV14,/.test(
    sources.core,
  ),
  "current-v14 | known-precontract-v14 | unknown-invalid-v14",
);
check(
  "v14 inspection has connection and read-only file entry points",
  includesAll(sources.core, [
    "pub fn inspect_library_v14_schema_contract_connection",
    "pub fn inspect_library_v14_schema_contract_file",
    "SQLITE_OPEN_READ_ONLY",
  ]),
  "inspection itself does not mutate the selected library",
);
check(
  "known early-v14 recognition is exact rather than heuristic",
  includesAll(sources.core, [
    "validate_known_precontract_v14",
    "LIBRARY_SCHEMA_V14_IMPORT_CONTRACT_INVALID:MISSING_INDEX:idx_papers_project_identity",
    "NOT_KNOWN_PRECONTRACT_SIGNATURE",
    "ensure_precontract_project_identity_integrity",
  ]),
  "only the Development 011 pre-contract signature is repairable",
);
check(
  "unknown or malformed v14 stays rejected",
  includesAll(sources.core, [
    "LibraryV14SchemaContractStatus::UnknownInvalidV14",
    "error_code: Some(error_code)",
  ]) &&
    includesAll(sources.migration, [
      "LibraryV14SchemaContractStatus::UnknownInvalidV14 => Err",
      "LIBRARY_SCHEMA_V14_IMPORT_CONTRACT_INVALID",
    ]),
  "no guessed repair path exists for unknown-invalid-v14",
);
check(
  "known early-v14 repair first creates and verifies an independent backup",
  includesAll(sources.migration, [
    "create_precontract_v14_backup",
    "{stem}.pre-v14-contract.{now_ms}.sqlite",
    "sha256_file(&partial_path)",
    "AGENT_MIGRATION_BACKUP_INVALID",
    "AGENT_MIGRATION_BACKUP_COUNT_MISMATCH",
  ]),
  "recoverable backup path plus SHA-256 and content fingerprint",
);
check(
  "repair is one immediate transaction with strict post-validation",
  includesAll(sources.migration, [
    "transaction_with_behavior(TransactionBehavior::Immediate)",
    "repair_known_precontract_v14(&tx)?",
    "SELECT COUNT(*) FROM pragma_foreign_key_check",
    "LibraryV14SchemaContractStatus::CurrentV14",
    "AGENT_V14_COMPATIBILITY_DATA_CHANGED",
    "tx.commit()",
  ]),
  "schema repair rolls back as a unit and preserves governed data",
);
check(
  "current v14 path is idempotent and produces no repair backup",
  includesAll(sources.migration, [
    "LibraryV14SchemaContractStatus::CurrentV14 => Ok(AgentMigrationResult",
    "backup_path: None",
    "backup_sha256: None",
    "compatibility_repair_applied: false",
  ]),
  "reopening current-v14 is a no-op",
);
check(
  "repair result exposes status, backup path, and backup hash",
  includesAll(sources.migration, [
    "compatibility_repair_applied: true",
    "schema_contract_status: LibraryV14SchemaContractStatus::CurrentV14",
  ]) &&
    includesAll(sources.desktop, [
      "compatibilityRepairApplied: boolean",
      "migrationBackupPath?: string",
      "migrationBackupSha256?: string",
      "schemaContractStatus: LibrarySchemaContractStatus",
    ]),
  "Rust and TypeScript share the compatibility result contract",
);
check(
  "setup distinguishes repairable and unknown v14 before initialization",
  includesAll(sources.setup, [
    "KNOWN_PRECONTRACT_V14",
    "KNOWN_PRECONTRACT_V14_TARGET_ALREADY_EXISTS",
    "UNKNOWN_INVALID_V14",
    "现有论文不会被覆盖",
    "应用不会自动修复或覆盖它",
  ]) &&
    includesAll(sources.app, [
      'validation?.schemaContractStatus === "known-precontract-v14"',
      "正在备份并安全补全开发版早期 v14",
    ]),
  "repair requires explicit existing-library mode and explains the backup",
);
check(
  "initial setup state exposes known early v14 without performing compatibility repair",
  includesAll(setupStateBody, [
    "inspect_library_v14_schema_contract_file(&database_path, &default_project_id())",
    "LibraryV14SchemaContractStatus::KnownPrecontractV14",
    "candidate.paper_count",
    "candidate.hotspot_count",
    "candidate.membership_count",
    "configured: database_valid",
    "现有论文不会被覆盖",
  ]) &&
    !setupStateBody.includes("migrate_library_file(") &&
    !setupStateBody.includes("repair_known_precontract_v14("),
  "the first setup frame uses read-only classification, preserves counts, and waits for explicit initialization",
);
check(
  "targeted compatibility tests cover repair, preservation, rejection, and rollback",
  includesAll(sources.migration, [
    "known_precontract_v14_empty_governance_repairs_with_backup_and_is_idempotent",
    "known_precontract_v14_preserves_governance_rows_and_composite_foreign_keys",
    "unknown_invalid_v14_is_rejected_without_backup_or_mutation",
    "known_precontract_v14_transaction_rollback_restores_original_contract",
  ]),
  "synthetic temporary SQLite fixtures only",
);

check(
  "evidence records the superseded native failure and current unverified gate",
  evidence.package === "Sidera-P2b-R1" &&
    evidence.date === "2026-08-05" &&
    evidence.status === "IMPLEMENTED" &&
    evidence.automatedTechnical === "PASS" &&
    evidence.product === "UNVERIFIED" &&
    evidence.nativeCompatibility === "UNVERIFIED" &&
    evidence.supersedes?.nativeProductResult === "PRODUCT FAIL / SUPERSEDED",
  evidencePath,
);
check(
  "evidence records the three exact v14 classes",
  evidence.classification?.current === "current-v14" &&
    evidence.classification?.repairable === "known-precontract-v14" &&
    evidence.classification?.rejected === "unknown-invalid-v14",
  "classification is not inferred from user_version alone",
);
check(
  "evidence records zero live-library and external automated side effects",
  evidence.automatedSafety?.liveSelectedDatabaseMutations === 0 &&
    evidence.automatedSafety?.syntheticTemporaryDatabasesOnly === true &&
    evidence.automatedSafety?.providerCalls === 0 &&
    evidence.automatedSafety?.institutionNetworkRequests === 0 &&
    evidence.automatedSafety?.fullTextDownloads === 0,
  "automation is limited to source inspection and disposable fixtures",
);

for (const doc of docs) {
  check(
    `${doc.name} records Development 011-R1 compatibility closure`,
    includesAll(doc.content, [
      "开发 011-R1",
      "known-precontract-v14",
      "unknown-invalid-v14",
      "PRODUCT FAIL / SUPERSEDED",
      "PRODUCT UNVERIFIED",
    ]),
    "canonical status, classification, and native gate",
  );
}

const failedChecks = checks.filter((entry) => !entry.passed);
const result = {
  audit: "sidera-p2b-v14-compatibility-r1",
  generatedAt: new Date().toISOString(),
  status: failedChecks.length === 0 ? "PASS" : "FAIL",
  execution: "read-only-source-and-evidence-audit",
  checks,
  failedChecks,
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (failedChecks.length > 0) {
  process.exitCode = 1;
}
