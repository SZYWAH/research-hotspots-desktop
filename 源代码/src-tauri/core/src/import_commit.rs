use std::collections::{BTreeMap, HashMap, HashSet};
use std::path::PathBuf;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use rusqlite::{
    params, Connection, OpenFlags, OptionalExtension, Transaction, TransactionBehavior,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use url::Url;

use crate::import_review::{
    open_review_batch, open_review_batch_read_only, open_store as open_review_store,
    SideraIdentityEvidence, SideraImportCandidate, SideraImportCandidateClassification,
    SideraImportDecisionKind, SideraImportReviewBatch,
};

pub const IMPORT_COMMIT_ENGINE_VERSION: &str = "sidera-import-commit-v1";
const MAX_HISTORY_LIMIT: usize = 100;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SideraImportCommitContext {
    pub review_database: PathBuf,
    pub library_database: PathBuf,
    pub project_id: String,
    pub batch_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SideraImportCommitPrepareInput {
    #[serde(flatten)]
    pub context: SideraImportCommitContext,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SideraImportCommitAction {
    Insert,
    Merge,
    KeepSeparate,
    Skip,
}

impl SideraImportCommitAction {
    fn as_str(&self) -> &'static str {
        match self {
            Self::Insert => "insert",
            Self::Merge => "merge",
            Self::KeepSeparate => "keep-separate",
            Self::Skip => "skip",
        }
    }

    fn parse(value: &str) -> Result<Self, String> {
        match value {
            "insert" => Ok(Self::Insert),
            "merge" => Ok(Self::Merge),
            "keep-separate" => Ok(Self::KeepSeparate),
            "skip" => Ok(Self::Skip),
            _ => Err("SIDERA_IMPORT_COMMIT_LEDGER_CORRUPT".to_string()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SideraImportFieldChangeAction {
    Insert,
    FillEmpty,
    PreserveExisting,
    Unchanged,
    Skip,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SideraImportFieldChange {
    pub field: String,
    pub existing_value: Option<String>,
    pub incoming_value: Option<String>,
    pub action: SideraImportFieldChangeAction,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SideraImportCommitCounts {
    pub total: usize,
    pub insert_count: usize,
    pub merge_count: usize,
    pub keep_separate_count: usize,
    pub skip_count: usize,
    pub unresolved_count: usize,
    pub invalid_count: usize,
    pub changed_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SideraImportCommitPreviewItem {
    pub candidate_id: String,
    pub row_index: usize,
    pub decision: Option<SideraImportDecisionKind>,
    pub target_paper_id: Option<String>,
    pub effective_paper_id: Option<String>,
    pub action: SideraImportCommitAction,
    pub identity_evidence: Vec<SideraIdentityEvidence>,
    pub field_changes: Vec<SideraImportFieldChange>,
    pub blocking_codes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SideraImportCommitPreview {
    pub preview_id: String,
    pub preview_hash: String,
    pub project_id: String,
    pub batch_id: String,
    pub batch_version: i64,
    pub base_revision: Option<i64>,
    pub expected_revision: i64,
    pub generated_at_ms: i64,
    pub counts: SideraImportCommitCounts,
    pub items: Vec<SideraImportCommitPreviewItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SideraImportCommitExecuteInput {
    #[serde(flatten)]
    pub context: SideraImportCommitContext,
    pub preview_id: String,
    pub preview_hash: String,
    pub batch_version: i64,
    pub expected_revision: i64,
    pub client_commit_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SideraImportCommitItemResult {
    pub candidate_id: String,
    pub row_index: usize,
    pub action: SideraImportCommitAction,
    pub paper_id: Option<String>,
    pub source_record_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SideraImportCommitResult {
    pub commit_id: String,
    pub client_commit_id: String,
    pub project_id: String,
    pub batch_id: String,
    pub status: String,
    pub before_revision: i64,
    pub after_revision: i64,
    pub paper_count_before: i64,
    pub paper_count_after: i64,
    pub counts: SideraImportCommitCounts,
    pub items: Vec<SideraImportCommitItemResult>,
    pub idempotent: bool,
    pub completed_at_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SideraImportCommitStatusInput {
    #[serde(flatten)]
    pub context: SideraImportCommitContext,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SideraImportCommitStatus {
    pub project_id: String,
    pub batch_id: String,
    pub batch_status: String,
    pub batch_version: i64,
    pub commit_id: Option<String>,
    pub client_commit_id: Option<String>,
    pub before_revision: Option<i64>,
    pub after_revision: Option<i64>,
    pub counts: Option<SideraImportCommitCounts>,
    pub completed_at_ms: Option<i64>,
    pub rolled_back_at_ms: Option<i64>,
    pub rollback_revision: Option<i64>,
    pub error_code: Option<String>,
    pub paper_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SideraImportCommitHistoryInput {
    #[serde(flatten)]
    pub context: SideraImportCommitContext,
    pub limit: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SideraImportCommitHistory {
    pub entries: Vec<SideraImportCommitStatus>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SideraImportRollbackInput {
    #[serde(flatten)]
    pub context: SideraImportCommitContext,
    pub commit_id: String,
    pub expected_revision: i64,
    pub client_rollback_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SideraImportRollbackConflict {
    pub candidate_id: String,
    pub paper_id: String,
    pub code: String,
    pub fields: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SideraImportRollbackResult {
    pub commit_id: String,
    pub project_id: String,
    pub batch_id: String,
    pub status: String,
    pub before_revision: i64,
    pub rollback_revision: Option<i64>,
    pub rolled_back_at_ms: Option<i64>,
    pub restored_count: usize,
    pub deleted_count: usize,
    pub rollback_conflicts: Vec<SideraImportRollbackConflict>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SideraPaperSourceRecord {
    pub id: String,
    pub project_id: String,
    pub paper_id: String,
    pub commit_id: String,
    pub batch_id: String,
    pub candidate_id: String,
    pub source_database: String,
    pub producer_version: String,
    pub provider_record_id: Option<String>,
    pub canonical_locator: Option<String>,
    pub record_type: Option<String>,
    pub full_text_status: Option<String>,
    pub metadata: serde_json::Value,
    pub provenance: serde_json::Value,
    pub field_provenance: BTreeMap<String, serde_json::Value>,
    pub created_at_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
struct PaperRow {
    id: String,
    project_id: String,
    source: String,
    title: String,
    abstract_text: String,
    authors: Option<String>,
    categories: Option<String>,
    field: String,
    published_date: Option<String>,
    year: Option<i64>,
    url: Option<String>,
    doi: Option<String>,
    created_at: String,
    updated_at: String,
    search_blob: String,
}

#[derive(Default)]
struct LibraryIdentityIndex {
    papers: HashMap<String, PaperRow>,
    aliases: HashMap<(String, String), HashSet<String>>,
    weak: HashMap<String, HashSet<String>>,
}

#[derive(Debug, Clone)]
struct CommitLedgerRow {
    result: SideraImportCommitResult,
    preview_id: String,
    preview_hash: String,
    batch_version: i64,
    rolled_back_at_ms: Option<i64>,
    rollback_revision: Option<i64>,
    error_code: Option<String>,
}

pub fn prepare_import_commit(
    input: SideraImportCommitPrepareInput,
) -> Result<SideraImportCommitPreview, String> {
    validate_context(&input.context)?;
    let mut batch = open_review_batch(
        &input.context.review_database,
        &input.context.project_id,
        &input.context.batch_id,
    )?;
    if !matches!(batch.status.as_str(), "active" | "commit-failed") {
        return Err(
            if matches!(batch.status.as_str(), "committed" | "rolled-back") {
                "SIDERA_IMPORT_COMMIT_BATCH_FROZEN".to_string()
            } else {
                "SIDERA_IMPORT_COMMIT_BATCH_NOT_READY".to_string()
            },
        );
    }
    let connection = open_library(&input.context.library_database)?;
    ensure_library_commit_schema(&connection)?;
    let revision = current_revision(&connection, &input.context.project_id)?;
    if batch.base_library_revision.is_none() {
        let review = open_review_store(&input.context.review_database)?;
        review
            .execute(
                "UPDATE review_batches SET base_library_revision = ?1
                 WHERE id = ?2 AND project_id = ?3 AND base_library_revision IS NULL",
                params![revision, input.context.batch_id, input.context.project_id],
            )
            .map_err(commit_store_error)?;
        drop(review);
        batch = open_review_batch(
            &input.context.review_database,
            &input.context.project_id,
            &input.context.batch_id,
        )?;
    }
    build_preview(&connection, &batch, revision)
}

pub fn execute_import_commit(
    input: SideraImportCommitExecuteInput,
) -> Result<SideraImportCommitResult, String> {
    validate_context(&input.context)?;
    validate_opaque(
        &input.client_commit_id,
        "SIDERA_IMPORT_COMMIT_CLIENT_ID_INVALID",
    )?;
    let mut library = open_library(&input.context.library_database)?;
    ensure_library_commit_schema(&library)?;

    if let Some(ledger) =
        ledger_by_client(&library, &input.context.project_id, &input.client_commit_id)?
    {
        if ledger.result.batch_id != input.context.batch_id
            || ledger.preview_id != input.preview_id
            || ledger.preview_hash != input.preview_hash
            || ledger.batch_version != input.batch_version
        {
            return Err("SIDERA_IMPORT_COMMIT_CLIENT_ID_REUSED".to_string());
        }
        reconcile_review_from_ledger(&input.context, &ledger)?;
        let mut result = ledger.result;
        result.items = load_commit_item_results(&library, &result.commit_id)?;
        result.idempotent = true;
        return Ok(result);
    }

    let preview = prepare_import_commit(SideraImportCommitPrepareInput {
        context: input.context.clone(),
    })?;
    validate_preview_for_execute(&preview, &input)?;
    if preview
        .items
        .iter()
        .any(|item| !item.blocking_codes.is_empty())
    {
        return Err("SIDERA_IMPORT_COMMIT_PREVIEW_BLOCKED".to_string());
    }

    let commit_id = deterministic_id(
        "commit",
        &format!(
            "{}:{}:{}",
            input.context.project_id, input.context.batch_id, input.client_commit_id
        ),
    );
    mark_review_committing(&input.context, &preview, &commit_id)?;

    let execution = execute_library_transaction(&mut library, &input, &preview, &commit_id);
    let result = match execution {
        Ok(result) => result,
        Err(error) => {
            let _ = mark_review_failed(&input.context, &commit_id, &error);
            return Err(error);
        }
    };
    if let Err(error) = mark_review_committed(&input.context, &result) {
        return Err(format!(
            "SIDERA_IMPORT_COMMIT_RECONCILIATION_REQUIRED:{error}"
        ));
    }
    Ok(result)
}

pub fn import_commit_status(
    input: SideraImportCommitStatusInput,
) -> Result<SideraImportCommitStatus, String> {
    let library = open_library_read_only(&input.context.library_database)?;
    import_commit_status_from_connection(input, &library)
}

pub fn import_commit_status_from_connection(
    input: SideraImportCommitStatusInput,
    library: &Connection,
) -> Result<SideraImportCommitStatus, String> {
    validate_context(&input.context)?;
    validate_library_commit_read_schema(library)?;
    if let Some(ledger) =
        ledger_by_batch(library, &input.context.project_id, &input.context.batch_id)?
    {
        // The main-library ledger is authoritative. Ordinary status reads never
        // repair the auxiliary review receipt; reconciliation belongs to an
        // explicit preparation/mutation boundary.
        let paper_ids = load_commit_paper_ids(library, &ledger.result.commit_id)?;
        return Ok(status_from_ledger(&ledger, ledger.batch_version, paper_ids));
    }
    let batch = open_review_batch_read_only(
        &input.context.review_database,
        &input.context.project_id,
        &input.context.batch_id,
    )
    .map_err(normalize_commit_status_review_error)?;
    Ok(status_from_batch(batch))
}

pub fn import_commit_history(
    input: SideraImportCommitHistoryInput,
) -> Result<SideraImportCommitHistory, String> {
    let library = open_library_read_only(&input.context.library_database)?;
    import_commit_history_from_connection(input, &library)
}

pub fn import_commit_history_from_connection(
    input: SideraImportCommitHistoryInput,
    library: &Connection,
) -> Result<SideraImportCommitHistory, String> {
    validate_history_context(&input.context)?;
    validate_library_commit_read_schema(library)?;
    let limit = input.limit.unwrap_or(20).clamp(1, MAX_HISTORY_LIMIT) as i64;
    let mut statement = library
        .prepare(
            "SELECT id, project_id, batch_id, client_commit_id, preview_id, preview_hash,
                    batch_version, status, before_revision, after_revision,
                    paper_count_before, paper_count_after, counts_json, completed_at_ms,
                    rolled_back_at_ms, rollback_revision, error_code
             FROM paper_import_commits
             WHERE project_id = ?1 AND (?2 = '' OR batch_id = ?2)
             ORDER BY completed_at_ms DESC, id DESC LIMIT ?3",
        )
        .map_err(commit_store_error)?;
    let ledgers = statement
        .query_map(
            params![input.context.project_id, input.context.batch_id, limit],
            ledger_from_row,
        )
        .map_err(commit_store_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(commit_store_error)?;
    let mut entries = Vec::with_capacity(ledgers.len());
    for ledger in &ledgers {
        let paper_ids = load_commit_paper_ids(library, &ledger.result.commit_id)?;
        entries.push(status_from_ledger(ledger, ledger.batch_version, paper_ids));
    }
    Ok(SideraImportCommitHistory { entries })
}

pub fn rollback_import_commit(
    input: SideraImportRollbackInput,
) -> Result<SideraImportRollbackResult, String> {
    validate_context(&input.context)?;
    validate_opaque(
        &input.client_rollback_id,
        "SIDERA_IMPORT_ROLLBACK_CLIENT_ID_INVALID",
    )?;
    let mut library = open_library(&input.context.library_database)?;
    ensure_library_commit_schema(&library)?;
    let ledger = ledger_by_id(&library, &input.context.project_id, &input.commit_id)?
        .ok_or_else(|| "SIDERA_IMPORT_ROLLBACK_COMMIT_NOT_FOUND".to_string())?;
    if ledger.result.batch_id != input.context.batch_id {
        return Err("SIDERA_IMPORT_ROLLBACK_BATCH_MISMATCH".to_string());
    }
    if ledger.result.status == "rolled-back" {
        reconcile_review_from_ledger(&input.context, &ledger)?;
        return Ok(SideraImportRollbackResult {
            commit_id: ledger.result.commit_id,
            project_id: ledger.result.project_id,
            batch_id: ledger.result.batch_id,
            status: "rolled-back".to_string(),
            before_revision: ledger.result.before_revision,
            rollback_revision: ledger.rollback_revision,
            rolled_back_at_ms: ledger.rolled_back_at_ms,
            restored_count: 0,
            deleted_count: 0,
            rollback_conflicts: Vec::new(),
        });
    }

    let current = current_revision(&library, &input.context.project_id)?;
    if current != input.expected_revision || current != ledger.result.after_revision {
        let items = load_commit_items(&library, &input.commit_id)?;
        let conflicts = rollback_conflicts_with_revision_drift(
            &library,
            &input.context.project_id,
            &input.commit_id,
            &ledger,
            input.expected_revision,
            current,
            &items,
        )?;
        return Ok(blocked_rollback_result(&input, &ledger, conflicts));
    }
    let transaction = library
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(commit_store_error)?;
    let current = current_revision(&transaction, &input.context.project_id)?;
    if current != input.expected_revision || current != ledger.result.after_revision {
        let items = load_commit_items(&transaction, &input.commit_id)?;
        let conflicts = rollback_conflicts_with_revision_drift(
            &transaction,
            &input.context.project_id,
            &input.commit_id,
            &ledger,
            input.expected_revision,
            current,
            &items,
        )?;
        return Ok(blocked_rollback_result(&input, &ledger, conflicts));
    }
    let items = load_commit_items(&transaction, &input.commit_id)?;
    let conflicts = rollback_conflicts(
        &transaction,
        &input.context.project_id,
        &input.commit_id,
        ledger.result.after_revision,
        &items,
    )?;
    if !conflicts.is_empty() {
        return Ok(blocked_rollback_result(&input, &ledger, conflicts));
    }

    let mut restored_count = 0usize;
    let mut deleted_count = 0usize;
    for item in &items {
        match item.action {
            SideraImportCommitAction::Insert | SideraImportCommitAction::KeepSeparate => {
                if let Some(paper_id) = &item.paper_id {
                    transaction
                        .execute(
                            "DELETE FROM paper_identity_aliases WHERE commit_id = ?1 AND paper_id = ?2",
                            params![input.commit_id, paper_id],
                        )
                        .map_err(commit_store_error)?;
                    transaction
                        .execute(
                            "DELETE FROM paper_source_records WHERE commit_id = ?1 AND paper_id = ?2",
                            params![input.commit_id, paper_id],
                        )
                        .map_err(commit_store_error)?;
                    deleted_count += transaction
                        .execute(
                            "DELETE FROM papers WHERE id = ?1 AND project_id = ?2",
                            params![paper_id, input.context.project_id],
                        )
                        .map_err(commit_store_error)?;
                }
            }
            SideraImportCommitAction::Merge => {
                if let Some(before) = item.before_paper.as_ref() {
                    transaction
                        .execute(
                            "DELETE FROM paper_identity_aliases WHERE commit_id = ?1 AND paper_id = ?2",
                            params![input.commit_id, before.id],
                        )
                        .map_err(commit_store_error)?;
                    transaction
                        .execute(
                            "DELETE FROM paper_source_records WHERE commit_id = ?1 AND paper_id = ?2",
                            params![input.commit_id, before.id],
                        )
                        .map_err(commit_store_error)?;
                    update_paper(&transaction, before)?;
                    restored_count += 1;
                }
            }
            SideraImportCommitAction::Skip => {}
        }
    }
    let now = now_ms();
    let mutation_count = restored_count + deleted_count;
    let rollback_revision = if mutation_count > 0 {
        crate::invalidate_v20_after_library_mutation(&transaction, &input.context.project_id, now)?
    } else {
        current
    };
    transaction
        .execute(
            "UPDATE paper_import_commits SET status = 'rolled-back', rolled_back_at_ms = ?1,
               rollback_revision = ?2, error_code = NULL WHERE id = ?3 AND status = 'committed'",
            params![now, rollback_revision, input.commit_id],
        )
        .map_err(commit_store_error)?;
    transaction.commit().map_err(commit_store_error)?;
    mark_review_rolled_back(&input.context, &input.commit_id, rollback_revision, now)?;
    Ok(SideraImportRollbackResult {
        commit_id: input.commit_id,
        project_id: input.context.project_id,
        batch_id: input.context.batch_id,
        status: "rolled-back".to_string(),
        before_revision: ledger.result.before_revision,
        rollback_revision: Some(rollback_revision),
        rolled_back_at_ms: Some(now),
        restored_count,
        deleted_count,
        rollback_conflicts: Vec::new(),
    })
}

fn validate_context(context: &SideraImportCommitContext) -> Result<(), String> {
    if context.project_id.trim().is_empty() || context.batch_id.trim().is_empty() {
        return Err("SIDERA_IMPORT_COMMIT_CONTEXT_INVALID".to_string());
    }
    Ok(())
}

fn validate_history_context(context: &SideraImportCommitContext) -> Result<(), String> {
    if context.project_id.trim().is_empty() {
        return Err("SIDERA_IMPORT_COMMIT_CONTEXT_INVALID".to_string());
    }
    Ok(())
}

fn validate_opaque(value: &str, code: &str) -> Result<(), String> {
    let value = value.trim();
    if value.is_empty() || value.len() > 256 || value.chars().any(char::is_control) {
        return Err(code.to_string());
    }
    Ok(())
}

fn open_library(path: &PathBuf) -> Result<Connection, String> {
    Connection::open(path).map_err(commit_store_error)
}

fn open_library_read_only(path: &PathBuf) -> Result<Connection, String> {
    let connection = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(commit_store_error)?;
    connection
        .pragma_update(None, "query_only", "ON")
        .map_err(commit_store_error)?;
    connection
        .pragma_update(None, "foreign_keys", "ON")
        .map_err(commit_store_error)?;
    connection
        .busy_timeout(Duration::from_secs(2))
        .map_err(commit_store_error)?;
    Ok(connection)
}

fn validate_library_commit_read_schema(connection: &Connection) -> Result<(), String> {
    let schema_version: i64 = connection
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(commit_store_error)?;
    if schema_version != crate::LIBRARY_SCHEMA_VERSION {
        return Err("SIDERA_IMPORT_COMMIT_LIBRARY_PREPARATION_REQUIRED".to_string());
    }
    crate::validate_import_schema_contract(connection)
        .map_err(|error| format!("SIDERA_IMPORT_COMMIT_SCHEMA_FAILED:{error}"))
}

fn normalize_commit_status_review_error(error: String) -> String {
    if matches!(
        error.as_str(),
        "SIDERA_IMPORT_REVIEW_STORE_NOT_FOUND" | "SIDERA_IMPORT_REVIEW_BATCH_NOT_FOUND"
    ) {
        "SIDERA_IMPORT_COMMIT_STATUS_NOT_FOUND".to_string()
    } else {
        error
    }
}

fn current_revision(connection: &Connection, project_id: &str) -> Result<i64, String> {
    crate::current_library_revision(connection, project_id)
        .map_err(|error| format!("SIDERA_IMPORT_COMMIT_REVISION_READ_FAILED:{error}"))
}

fn ensure_library_commit_schema(connection: &Connection) -> Result<(), String> {
    crate::ensure_v20_schema(connection)
        .map_err(|error| format!("SIDERA_IMPORT_COMMIT_SCHEMA_FAILED:{error}"))?;
    crate::ensure_import_schema(connection)
        .map_err(|error| format!("SIDERA_IMPORT_COMMIT_SCHEMA_FAILED:{error}"))
}

fn build_preview(
    connection: &Connection,
    batch: &SideraImportReviewBatch,
    revision: i64,
) -> Result<SideraImportCommitPreview, String> {
    let index = load_library_index(connection, &batch.project_id)?;
    let mut counts = SideraImportCommitCounts {
        total: batch.candidates.len(),
        ..Default::default()
    };
    let mut items = Vec::with_capacity(batch.candidates.len());
    for candidate in &batch.candidates {
        let item = preview_candidate(candidate, &index, &batch.project_id)?;
        match item.action {
            SideraImportCommitAction::Insert => counts.insert_count += 1,
            SideraImportCommitAction::Merge => counts.merge_count += 1,
            SideraImportCommitAction::KeepSeparate => counts.keep_separate_count += 1,
            SideraImportCommitAction::Skip => counts.skip_count += 1,
        }
        if item.decision.is_none()
            || matches!(item.decision, Some(SideraImportDecisionKind::Unresolved))
        {
            counts.unresolved_count += 1;
        }
        if candidate.classification == SideraImportCandidateClassification::Invalid {
            counts.invalid_count += 1;
        }
        if !matches!(item.action, SideraImportCommitAction::Skip) && item.blocking_codes.is_empty()
        {
            counts.changed_count += 1;
        }
        items.push(item);
    }
    let hash_payload = serde_json::json!({
        "engineVersion": IMPORT_COMMIT_ENGINE_VERSION,
        "projectId": batch.project_id,
        "batchId": batch.id,
        "batchVersion": batch.batch_version,
        "baseRevision": batch.base_library_revision,
        "expectedRevision": revision,
        "counts": counts,
        "items": items,
    });
    let preview_hash = full_hash(
        &serde_json::to_vec(&hash_payload)
            .map_err(|error| format!("SIDERA_IMPORT_COMMIT_PREVIEW_HASH_FAILED:{error}"))?,
    );
    Ok(SideraImportCommitPreview {
        preview_id: format!("preview-{}", &preview_hash[..20]),
        preview_hash,
        project_id: batch.project_id.clone(),
        batch_id: batch.id.clone(),
        batch_version: batch.batch_version,
        base_revision: batch.base_library_revision,
        expected_revision: revision,
        generated_at_ms: now_ms(),
        counts,
        items,
    })
}

fn preview_candidate(
    candidate: &SideraImportCandidate,
    index: &LibraryIdentityIndex,
    project_id: &str,
) -> Result<SideraImportCommitPreviewItem, String> {
    let decision = candidate.decision.as_ref().map(|value| value.kind.clone());
    let matched = current_identity_matches(candidate, index);
    let strong_matches = matched
        .iter()
        .filter(|(_, kinds)| kinds.iter().any(|kind| is_strong_identity(kind)))
        .map(|(paper_id, _)| paper_id.clone())
        .collect::<HashSet<_>>();
    let ownership_conflict = matched.values().any(|kinds| {
        kinds
            .iter()
            .any(|kind| matches!(kind.as_str(), "doi" | "provider-record"))
    });
    let target = candidate
        .decision
        .as_ref()
        .and_then(|value| value.target_paper_id.clone())
        .or_else(|| {
            candidate
                .identity_matches
                .iter()
                .find(|value| value.preferred)
                .map(|value| value.paper_id.clone())
        });
    let mut blocking_codes = Vec::new();
    let action = match decision {
        Some(SideraImportDecisionKind::AcceptNew) => SideraImportCommitAction::Insert,
        Some(SideraImportDecisionKind::AcceptMerge) => SideraImportCommitAction::Merge,
        Some(SideraImportDecisionKind::KeepSeparate) => SideraImportCommitAction::KeepSeparate,
        Some(SideraImportDecisionKind::Skip) => SideraImportCommitAction::Skip,
        Some(SideraImportDecisionKind::Unresolved) | None => {
            blocking_codes.push("SIDERA_IMPORT_COMMIT_DECISION_UNRESOLVED".to_string());
            SideraImportCommitAction::Skip
        }
    };
    if candidate.classification == SideraImportCandidateClassification::Invalid
        && !matches!(action, SideraImportCommitAction::Skip)
    {
        blocking_codes.push("SIDERA_IMPORT_COMMIT_CANDIDATE_INVALID".to_string());
    }
    if matches!(action, SideraImportCommitAction::Insert) && !strong_matches.is_empty() {
        blocking_codes.push("SIDERA_IMPORT_COMMIT_STRONG_IDENTITY_EXISTS".to_string());
    }
    if matches!(action, SideraImportCommitAction::KeepSeparate) && ownership_conflict {
        blocking_codes.push("SIDERA_IMPORT_COMMIT_KEEP_SEPARATE_STRONG_IDENTITY".to_string());
    }
    if matches!(action, SideraImportCommitAction::Merge) {
        match target.as_ref() {
            Some(target) if index.papers.contains_key(target) && matched.contains_key(target) => {}
            Some(_) => blocking_codes.push("SIDERA_IMPORT_COMMIT_MERGE_TARGET_DRIFT".to_string()),
            None => blocking_codes.push("SIDERA_IMPORT_COMMIT_MERGE_TARGET_REQUIRED".to_string()),
        }
    }
    let effective_paper_id = match action {
        SideraImportCommitAction::Merge => target.clone(),
        SideraImportCommitAction::Insert | SideraImportCommitAction::KeepSeparate => {
            deterministic_paper_id(project_id, candidate, &action)
        }
        SideraImportCommitAction::Skip => None,
    };
    if !matches!(action, SideraImportCommitAction::Skip) && effective_paper_id.is_none() {
        blocking_codes.push("SIDERA_IMPORT_COMMIT_STABLE_IDENTITY_REQUIRED".to_string());
    }
    if effective_paper_id.as_ref().is_some_and(|paper_id| {
        !matches!(action, SideraImportCommitAction::Merge) && index.papers.contains_key(paper_id)
    }) {
        blocking_codes.push("SIDERA_IMPORT_COMMIT_PAPER_ID_COLLISION".to_string());
    }
    let incoming = incoming_paper(candidate, effective_paper_id.as_deref(), project_id);
    let existing = effective_paper_id
        .as_ref()
        .and_then(|paper_id| index.papers.get(paper_id));
    let field_changes = field_changes(existing, incoming.as_ref(), &action);
    blocking_codes.sort();
    blocking_codes.dedup();
    Ok(SideraImportCommitPreviewItem {
        candidate_id: candidate.id.clone(),
        row_index: candidate.row_index,
        decision,
        target_paper_id: target,
        effective_paper_id,
        action,
        identity_evidence: commit_identity_evidence(candidate),
        field_changes,
        blocking_codes,
    })
}

#[derive(Debug, Clone)]
struct CommitItemRow {
    candidate_id: String,
    row_index: usize,
    action: SideraImportCommitAction,
    paper_id: Option<String>,
    before_paper: Option<PaperRow>,
    after_fingerprint: Option<String>,
    source_record_id: Option<String>,
}

fn load_library_index(
    connection: &Connection,
    project_id: &str,
) -> Result<LibraryIdentityIndex, String> {
    let mut index = LibraryIdentityIndex::default();
    let mut statement = connection
        .prepare(
            "SELECT id, project_id, source, title, abstract, authors, categories, field,
                    published_date, year, url, doi, created_at, updated_at, search_blob
             FROM papers WHERE project_id = ?1",
        )
        .map_err(commit_store_error)?;
    let papers = statement
        .query_map(params![project_id], paper_from_row)
        .map_err(commit_store_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(commit_store_error)?;
    for paper in papers {
        if let Some(doi) = paper.doi.as_deref().and_then(normalize_doi) {
            add_alias(&mut index.aliases, "doi", &doi, &paper.id);
        }
        if let Some(url) = paper.url.as_deref().and_then(normalize_locator_identity) {
            add_alias(&mut index.aliases, "canonical-url", &url, &paper.id);
        }
        if let Some(key) = weak_identity_key(
            &paper.title,
            paper.authors.as_deref().and_then(first_author),
            paper.year,
        ) {
            index.weak.entry(key).or_default().insert(paper.id.clone());
        }
        index.papers.insert(paper.id.clone(), paper);
    }
    let aliases_exist = connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master
             WHERE type='table' AND name='paper_identity_aliases')",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map_err(commit_store_error)?
        != 0;
    if aliases_exist {
        let mut statement = connection
            .prepare(
                "SELECT alias_kind, normalized_value, paper_id
                 FROM paper_identity_aliases WHERE project_id = ?1",
            )
            .map_err(commit_store_error)?;
        let rows = statement
            .query_map(params![project_id], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })
            .map_err(commit_store_error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(commit_store_error)?;
        for (kind, value, paper_id) in rows {
            add_alias(&mut index.aliases, &kind, &value, &paper_id);
        }
    }
    Ok(index)
}

fn paper_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<PaperRow> {
    Ok(PaperRow {
        id: row.get(0)?,
        project_id: row.get(1)?,
        source: row.get(2)?,
        title: row.get(3)?,
        abstract_text: row.get(4)?,
        authors: row.get(5)?,
        categories: row.get(6)?,
        field: row.get(7)?,
        published_date: row.get(8)?,
        year: row.get(9)?,
        url: row.get(10)?,
        doi: row.get(11)?,
        created_at: row.get(12)?,
        updated_at: row.get(13)?,
        search_blob: row.get(14)?,
    })
}

fn add_alias(
    aliases: &mut HashMap<(String, String), HashSet<String>>,
    kind: &str,
    value: &str,
    paper_id: &str,
) {
    aliases
        .entry((kind.to_string(), value.to_string()))
        .or_default()
        .insert(paper_id.to_string());
}

fn current_identity_matches(
    candidate: &SideraImportCandidate,
    index: &LibraryIdentityIndex,
) -> HashMap<String, HashSet<String>> {
    let mut matches = HashMap::<String, HashSet<String>>::new();
    for (kind, value) in candidate_strong_identities(candidate) {
        if let Some(paper_ids) = index.aliases.get(&(kind.clone(), value)) {
            for paper_id in paper_ids {
                matches
                    .entry(paper_id.clone())
                    .or_default()
                    .insert(kind.clone());
            }
        }
    }
    if let Some(key) = weak_identity_key(
        &candidate.title,
        candidate.first_author.as_deref(),
        candidate.year,
    ) {
        if let Some(paper_ids) = index.weak.get(&key) {
            for paper_id in paper_ids {
                matches
                    .entry(paper_id.clone())
                    .or_default()
                    .insert("title-author-year".to_string());
            }
        }
    }
    matches
}

fn candidate_strong_identities(candidate: &SideraImportCandidate) -> Vec<(String, String)> {
    let mut values = Vec::new();
    if let Some(doi) = candidate.doi.as_deref().and_then(normalize_doi) {
        values.push(("doi".to_string(), doi));
    }
    if let Some(provider) = provider_identity(
        candidate.source_database.as_deref(),
        candidate.provider_record_id.as_deref(),
    ) {
        values.push(("provider-record".to_string(), provider));
    }
    if let Some(locator) = candidate
        .canonical_locator
        .as_deref()
        .or(candidate.canonical_url.as_deref())
        .and_then(normalize_locator_identity)
    {
        values.push(("canonical-url".to_string(), locator));
    }
    values.sort();
    values.dedup();
    values
}

fn commit_identity_evidence(candidate: &SideraImportCandidate) -> Vec<SideraIdentityEvidence> {
    candidate
        .identity_evidence
        .iter()
        .filter(|evidence| evidence.kind != "doi" || normalize_doi(&evidence.value).is_some())
        .cloned()
        .collect()
}

fn is_strong_identity(kind: &str) -> bool {
    matches!(kind, "doi" | "provider-record" | "canonical-url")
}

fn deterministic_paper_id(
    project_id: &str,
    candidate: &SideraImportCandidate,
    action: &SideraImportCommitAction,
) -> Option<String> {
    let identity = if let Some(doi) = candidate.doi.as_deref().and_then(normalize_doi) {
        format!("doi:{doi}")
    } else if let Some(provider) = provider_identity(
        candidate.source_database.as_deref(),
        candidate.provider_record_id.as_deref(),
    ) {
        format!("provider-record:{provider}")
    } else if let Some(locator) = candidate
        .canonical_locator
        .as_deref()
        .or(candidate.canonical_url.as_deref())
        .and_then(normalize_locator_identity)
    {
        format!("canonical-url:{locator}")
    } else {
        format!(
            "title-author-year:{}",
            weak_identity_key(
                &candidate.title,
                candidate.first_author.as_deref(),
                candidate.year,
            )?
        )
    };
    let salt = if matches!(action, SideraImportCommitAction::KeepSeparate) {
        format!(":separate:{}:{}", candidate.batch_id, candidate.id)
    } else {
        String::new()
    };
    Some(deterministic_id(
        "paper",
        &format!("{project_id}:{identity}{salt}"),
    ))
}

fn incoming_paper(
    candidate: &SideraImportCandidate,
    paper_id: Option<&str>,
    project_id: &str,
) -> Option<PaperRow> {
    let paper_id = paper_id?;
    let source = "institution".to_string();
    let authors = (!candidate.authors.is_empty()).then(|| candidate.authors.join("; "));
    let categories = candidate
        .record_type
        .clone()
        .filter(|value| !value.trim().is_empty());
    let field = "未分类".to_string();
    let url = candidate
        .canonical_locator
        .as_deref()
        .or(candidate.canonical_url.as_deref())
        .and_then(sanitize_source_locator);
    let doi = candidate.doi.as_deref().and_then(normalize_doi);
    let abstract_text = candidate.abstract_text.clone().unwrap_or_default();
    let search_blob = build_search_blob(
        &candidate.title,
        &abstract_text,
        authors.as_deref(),
        &field,
        doi.as_deref(),
    );
    Some(PaperRow {
        id: paper_id.to_string(),
        project_id: project_id.to_string(),
        source,
        title: clean_string(&candidate.title),
        abstract_text,
        authors,
        categories,
        field,
        published_date: candidate.year.map(|year| year.to_string()),
        year: candidate.year,
        url,
        doi,
        created_at: String::new(),
        updated_at: String::new(),
        search_blob,
    })
}

fn field_changes(
    existing: Option<&PaperRow>,
    incoming: Option<&PaperRow>,
    action: &SideraImportCommitAction,
) -> Vec<SideraImportFieldChange> {
    let fields = incoming.map(|paper| {
        vec![
            ("title", some_nonempty(&paper.title)),
            ("abstract", some_nonempty(&paper.abstract_text)),
            ("authors", paper.authors.clone()),
            ("categories", paper.categories.clone()),
            ("field", some_nonempty(&paper.field)),
            ("publishedDate", paper.published_date.clone()),
            ("year", paper.year.map(|value| value.to_string())),
            ("url", paper.url.clone()),
            ("doi", paper.doi.clone()),
        ]
    });
    fields
        .unwrap_or_default()
        .into_iter()
        .map(|(field, incoming_value)| {
            let existing_value = existing.and_then(|paper| match field {
                "title" => some_nonempty(&paper.title),
                "abstract" => some_nonempty(&paper.abstract_text),
                "authors" => paper.authors.clone(),
                "categories" => paper.categories.clone(),
                "field" => some_nonempty(&paper.field),
                "publishedDate" => paper.published_date.clone(),
                "year" => paper.year.map(|value| value.to_string()),
                "url" => paper.url.clone(),
                "doi" => paper.doi.clone(),
                _ => None,
            });
            let change = match action {
                SideraImportCommitAction::Insert | SideraImportCommitAction::KeepSeparate => {
                    if incoming_value.is_some() {
                        SideraImportFieldChangeAction::Insert
                    } else {
                        SideraImportFieldChangeAction::Unchanged
                    }
                }
                SideraImportCommitAction::Merge => {
                    if existing_value.as_deref().is_none_or(str::is_empty)
                        && incoming_value.is_some()
                    {
                        SideraImportFieldChangeAction::FillEmpty
                    } else if existing_value == incoming_value {
                        SideraImportFieldChangeAction::Unchanged
                    } else {
                        SideraImportFieldChangeAction::PreserveExisting
                    }
                }
                SideraImportCommitAction::Skip => SideraImportFieldChangeAction::Skip,
            };
            SideraImportFieldChange {
                field: field.to_string(),
                existing_value,
                incoming_value,
                action: change,
            }
        })
        .collect()
}

fn validate_preview_for_execute(
    preview: &SideraImportCommitPreview,
    input: &SideraImportCommitExecuteInput,
) -> Result<(), String> {
    if preview.batch_version != input.batch_version {
        return Err("SIDERA_IMPORT_COMMIT_BATCH_VERSION_DRIFT".to_string());
    }
    if preview.expected_revision != input.expected_revision {
        return Err("SIDERA_IMPORT_COMMIT_REVISION_DRIFT".to_string());
    }
    if preview.project_id != input.context.project_id
        || preview.batch_id != input.context.batch_id
        || preview.preview_id != input.preview_id
        || preview.preview_hash != input.preview_hash
    {
        return Err("SIDERA_IMPORT_COMMIT_PREVIEW_STALE".to_string());
    }
    Ok(())
}

fn mark_review_committing(
    context: &SideraImportCommitContext,
    preview: &SideraImportCommitPreview,
    commit_id: &str,
) -> Result<(), String> {
    let connection = open_review_store(&context.review_database)?;
    let changed = connection
        .execute(
            "UPDATE review_batches SET status='committing', commit_id=?1,
               before_library_revision=?2, after_library_revision=NULL,
               commit_counts_json=?3, completed_at_ms=NULL, rolled_back_at_ms=NULL,
               error_code=NULL, updated_at_ms=?4
             WHERE id=?5 AND project_id=?6 AND batch_version=?7
               AND status IN ('active','commit-failed')",
            params![
                commit_id,
                preview.expected_revision,
                serde_json::to_string(&preview.counts).map_err(commit_store_error)?,
                now_ms(),
                context.batch_id,
                context.project_id,
                preview.batch_version,
            ],
        )
        .map_err(commit_store_error)?;
    if changed == 0 {
        return Err("SIDERA_IMPORT_COMMIT_BATCH_VERSION_DRIFT".to_string());
    }
    Ok(())
}

fn execute_library_transaction(
    library: &mut Connection,
    input: &SideraImportCommitExecuteInput,
    preview: &SideraImportCommitPreview,
    commit_id: &str,
) -> Result<SideraImportCommitResult, String> {
    let transaction = library
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(commit_store_error)?;
    if let Some(existing) = ledger_by_client(
        &transaction,
        &input.context.project_id,
        &input.client_commit_id,
    )? {
        if existing.result.batch_id == input.context.batch_id
            && existing.preview_id == input.preview_id
            && existing.preview_hash == input.preview_hash
            && existing.batch_version == input.batch_version
        {
            let mut result = existing.result;
            result.items = load_commit_item_results(&transaction, &result.commit_id)?;
            result.idempotent = true;
            return Ok(result);
        }
        return Err("SIDERA_IMPORT_COMMIT_CLIENT_ID_REUSED".to_string());
    }
    if ledger_by_batch(
        &transaction,
        &input.context.project_id,
        &input.context.batch_id,
    )?
    .is_some()
    {
        return Err("SIDERA_IMPORT_COMMIT_BATCH_ALREADY_COMMITTED".to_string());
    }
    let revision = current_revision(&transaction, &input.context.project_id)?;
    if revision != input.expected_revision {
        return Err("SIDERA_IMPORT_COMMIT_REVISION_DRIFT".to_string());
    }
    let batch = open_review_batch(
        &input.context.review_database,
        &input.context.project_id,
        &input.context.batch_id,
    )?;
    if batch.status != "committing"
        || batch.commit_id.as_deref() != Some(commit_id)
        || batch.batch_version != input.batch_version
    {
        return Err("SIDERA_IMPORT_COMMIT_REVIEW_STATE_DRIFT".to_string());
    }
    let fresh_preview = build_preview(&transaction, &batch, revision)?;
    validate_preview_for_execute(&fresh_preview, input)?;
    if fresh_preview != *preview {
        // generatedAtMs is intentionally excluded from this comparison.
        if fresh_preview.preview_id != preview.preview_id
            || fresh_preview.preview_hash != preview.preview_hash
            || fresh_preview.items != preview.items
            || fresh_preview.counts != preview.counts
        {
            return Err("SIDERA_IMPORT_COMMIT_PREVIEW_STALE".to_string());
        }
    }
    if fresh_preview
        .items
        .iter()
        .any(|item| !item.blocking_codes.is_empty())
    {
        return Err("SIDERA_IMPORT_COMMIT_PREVIEW_BLOCKED".to_string());
    }

    let paper_count_before: i64 = transaction
        .query_row(
            "SELECT COUNT(*) FROM papers WHERE project_id=?1",
            params![input.context.project_id],
            |row| row.get(0),
        )
        .map_err(commit_store_error)?;
    let predicted_revision = if fresh_preview.counts.changed_count > 0 {
        revision + 1
    } else {
        revision
    };
    let predicted_paper_count = paper_count_before
        + fresh_preview.counts.insert_count as i64
        + fresh_preview.counts.keep_separate_count as i64;
    let now = now_ms();
    transaction
        .execute(
            "INSERT INTO paper_import_commits
             (id,project_id,batch_id,client_commit_id,preview_id,preview_hash,batch_version,
              status,before_revision,after_revision,paper_count_before,paper_count_after,
              counts_json,created_at_ms,completed_at_ms)
             VALUES(?1,?2,?3,?4,?5,?6,?7,'committed',?8,?9,?10,?11,?12,?13,?13)",
            params![
                commit_id,
                input.context.project_id,
                input.context.batch_id,
                input.client_commit_id,
                input.preview_id,
                input.preview_hash,
                input.batch_version,
                revision,
                predicted_revision,
                paper_count_before,
                predicted_paper_count,
                serde_json::to_string(&fresh_preview.counts).map_err(commit_store_error)?,
                now,
            ],
        )
        .map_err(map_commit_constraint)?;

    let candidates = batch
        .candidates
        .iter()
        .map(|candidate| (candidate.id.as_str(), candidate))
        .collect::<HashMap<_, _>>();
    let mut item_results = Vec::with_capacity(fresh_preview.items.len());
    for item in &fresh_preview.items {
        let candidate = candidates
            .get(item.candidate_id.as_str())
            .ok_or_else(|| "SIDERA_IMPORT_COMMIT_CANDIDATE_MISSING".to_string())?;
        let mut paper_id = item.effective_paper_id.clone();
        let mut source_record_id = None;
        let mut before_paper = None;
        let mut after_paper = None;
        match item.action {
            SideraImportCommitAction::Insert | SideraImportCommitAction::KeepSeparate => {
                let mut paper = incoming_paper(
                    candidate,
                    item.effective_paper_id.as_deref(),
                    &input.context.project_id,
                )
                .ok_or_else(|| "SIDERA_IMPORT_COMMIT_PAPER_ID_MISSING".to_string())?;
                paper.created_at = now.to_string();
                paper.updated_at = now.to_string();
                insert_paper(&transaction, &paper)?;
                let source = insert_source_record(
                    &transaction,
                    &input.context,
                    commit_id,
                    candidate,
                    &paper,
                    item,
                    now,
                )?;
                insert_identity_aliases(
                    &transaction,
                    &input.context.project_id,
                    commit_id,
                    candidate,
                    &item.action,
                    &paper.id,
                    &source.id,
                    now,
                )?;
                source_record_id = Some(source.id);
                after_paper = Some(paper);
            }
            SideraImportCommitAction::Merge => {
                let target = item
                    .effective_paper_id
                    .as_deref()
                    .ok_or_else(|| "SIDERA_IMPORT_COMMIT_MERGE_TARGET_REQUIRED".to_string())?;
                let current = load_paper(&transaction, &input.context.project_id, target)?
                    .ok_or_else(|| "SIDERA_IMPORT_COMMIT_MERGE_TARGET_DRIFT".to_string())?;
                let incoming =
                    incoming_paper(candidate, Some(target), &input.context.project_id)
                        .ok_or_else(|| "SIDERA_IMPORT_COMMIT_PAPER_ID_MISSING".to_string())?;
                let merged = merge_paper(&current, &incoming, now);
                before_paper = Some(current);
                update_paper(&transaction, &merged)?;
                let source = insert_source_record(
                    &transaction,
                    &input.context,
                    commit_id,
                    candidate,
                    &merged,
                    item,
                    now,
                )?;
                insert_identity_aliases(
                    &transaction,
                    &input.context.project_id,
                    commit_id,
                    candidate,
                    &item.action,
                    &merged.id,
                    &source.id,
                    now,
                )?;
                source_record_id = Some(source.id);
                after_paper = Some(merged);
            }
            SideraImportCommitAction::Skip => {
                paper_id = None;
            }
        }
        transaction
            .execute(
                "INSERT INTO paper_import_commit_items
                 (commit_id,candidate_id,row_index,action,paper_id,before_paper_json,
                  after_paper_json,after_fingerprint,source_record_id,created_at_ms)
                 VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
                params![
                    commit_id,
                    item.candidate_id,
                    item.row_index as i64,
                    item.action.as_str(),
                    paper_id,
                    serialize_optional(&before_paper)?,
                    serialize_optional(&after_paper)?,
                    after_paper.as_ref().map(paper_fingerprint),
                    source_record_id,
                    now,
                ],
            )
            .map_err(commit_store_error)?;
        item_results.push(SideraImportCommitItemResult {
            candidate_id: item.candidate_id.clone(),
            row_index: item.row_index,
            action: item.action.clone(),
            paper_id,
            source_record_id,
        });
    }
    let after_revision = if fresh_preview.counts.changed_count > 0 {
        crate::invalidate_v20_after_library_mutation(&transaction, &input.context.project_id, now)?
    } else {
        revision
    };
    if after_revision != predicted_revision {
        return Err("SIDERA_IMPORT_COMMIT_REVISION_WRITE_MISMATCH".to_string());
    }
    let paper_count_after: i64 = transaction
        .query_row(
            "SELECT COUNT(*) FROM papers WHERE project_id=?1",
            params![input.context.project_id],
            |row| row.get(0),
        )
        .map_err(commit_store_error)?;
    if paper_count_after != predicted_paper_count {
        return Err("SIDERA_IMPORT_COMMIT_PAPER_COUNT_MISMATCH".to_string());
    }
    transaction.commit().map_err(commit_store_error)?;
    Ok(SideraImportCommitResult {
        commit_id: commit_id.to_string(),
        client_commit_id: input.client_commit_id.clone(),
        project_id: input.context.project_id.clone(),
        batch_id: input.context.batch_id.clone(),
        status: "committed".to_string(),
        before_revision: revision,
        after_revision,
        paper_count_before,
        paper_count_after,
        counts: fresh_preview.counts,
        items: item_results,
        idempotent: false,
        completed_at_ms: now,
    })
}

fn insert_paper(transaction: &Transaction<'_>, paper: &PaperRow) -> Result<(), String> {
    transaction
        .execute(
            "INSERT INTO papers
             (id,project_id,source,title,abstract,authors,categories,field,published_date,
              year,url,doi,created_at,updated_at,search_blob)
             VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)",
            params![
                paper.id,
                paper.project_id,
                paper.source,
                paper.title,
                paper.abstract_text,
                paper.authors,
                paper.categories,
                paper.field,
                paper.published_date,
                paper.year,
                paper.url,
                paper.doi,
                paper.created_at,
                paper.updated_at,
                paper.search_blob,
            ],
        )
        .map_err(map_commit_constraint)?;
    Ok(())
}

fn update_paper(transaction: &Transaction<'_>, paper: &PaperRow) -> Result<(), String> {
    let changed = transaction
        .execute(
            "UPDATE papers SET source=?1,title=?2,abstract=?3,authors=?4,categories=?5,
               field=?6,published_date=?7,year=?8,url=?9,doi=?10,created_at=?11,
               updated_at=?12,search_blob=?13 WHERE id=?14 AND project_id=?15",
            params![
                paper.source,
                paper.title,
                paper.abstract_text,
                paper.authors,
                paper.categories,
                paper.field,
                paper.published_date,
                paper.year,
                paper.url,
                paper.doi,
                paper.created_at,
                paper.updated_at,
                paper.search_blob,
                paper.id,
                paper.project_id,
            ],
        )
        .map_err(commit_store_error)?;
    if changed != 1 {
        return Err("SIDERA_IMPORT_COMMIT_PAPER_UPDATE_DRIFT".to_string());
    }
    Ok(())
}

fn merge_paper(existing: &PaperRow, incoming: &PaperRow, now: i64) -> PaperRow {
    let mut merged = existing.clone();
    fill_string(&mut merged.abstract_text, &incoming.abstract_text);
    fill_option(&mut merged.authors, &incoming.authors);
    fill_option(&mut merged.categories, &incoming.categories);
    if merged.field.trim().is_empty() {
        merged.field = incoming.field.clone();
    }
    fill_option(&mut merged.published_date, &incoming.published_date);
    if merged.year.is_none() {
        merged.year = incoming.year;
    }
    fill_option(&mut merged.url, &incoming.url);
    fill_option(&mut merged.doi, &incoming.doi);
    merged.updated_at = now.to_string();
    merged.search_blob = build_search_blob(
        &merged.title,
        &merged.abstract_text,
        merged.authors.as_deref(),
        &merged.field,
        merged.doi.as_deref(),
    );
    merged
}

fn fill_string(target: &mut String, incoming: &str) {
    if target.trim().is_empty() && !incoming.trim().is_empty() {
        *target = incoming.to_string();
    }
}

fn fill_option<T: Clone>(target: &mut Option<T>, incoming: &Option<T>) {
    if target.is_none() {
        *target = incoming.clone();
    }
}

fn insert_source_record(
    transaction: &Transaction<'_>,
    context: &SideraImportCommitContext,
    commit_id: &str,
    candidate: &SideraImportCandidate,
    paper: &PaperRow,
    preview: &SideraImportCommitPreviewItem,
    now: i64,
) -> Result<SideraPaperSourceRecord, String> {
    let id = deterministic_id("source", &format!("{commit_id}:{}", candidate.id));
    let source_database = clean_string(
        candidate
            .source_database
            .as_deref()
            .or(candidate.source.as_deref())
            .unwrap_or("unknown"),
    );
    let producer_version = candidate
        .provenance
        .as_ref()
        .map(|value| clean_string(&value.connector_version))
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| IMPORT_COMMIT_ENGINE_VERSION.to_string());
    let canonical_locator = candidate
        .canonical_locator
        .as_deref()
        .or(candidate.canonical_url.as_deref())
        .and_then(sanitize_source_locator);
    let provenance = candidate
        .provenance
        .as_ref()
        .and_then(|value| serde_json::to_value(value).ok())
        .map(sanitize_json_value)
        .unwrap_or(serde_json::Value::Null);
    let field_provenance = preview
        .field_changes
        .iter()
        .map(|change| {
            (
                change.field.clone(),
                serde_json::json!({
                    "sourceDatabase": source_database,
                    "candidateId": candidate.id,
                    "action": change.action,
                }),
            )
        })
        .collect::<BTreeMap<_, _>>();
    let conflicts = preview
        .field_changes
        .iter()
        .filter(|change| {
            change.action == SideraImportFieldChangeAction::PreserveExisting
                && change.existing_value != change.incoming_value
                && change.incoming_value.is_some()
        })
        .cloned()
        .collect::<Vec<_>>();
    let candidate_raw = serde_json::to_value(candidate)
        .map(sanitize_json_value)
        .map_err(commit_store_error)?;
    let metadata = sanitize_json_value(serde_json::json!({
        "candidateRaw": candidate_raw,
        "normalizedPaper": {
            "title": paper.title,
            "abstract": paper.abstract_text,
            "authors": paper.authors,
            "categories": paper.categories,
            "field": paper.field,
            "publishedDate": paper.published_date,
            "year": paper.year,
            "url": paper.url,
            "doi": paper.doi,
        },
        "fieldChanges": preview.field_changes,
        "conflicts": conflicts,
        "identityEvidence": preview.identity_evidence,
        "fieldProvenance": field_provenance,
    }));
    let record = SideraPaperSourceRecord {
        id,
        project_id: context.project_id.clone(),
        paper_id: paper.id.clone(),
        commit_id: commit_id.to_string(),
        batch_id: context.batch_id.clone(),
        candidate_id: candidate.id.clone(),
        source_database,
        producer_version,
        provider_record_id: clean_option(candidate.provider_record_id.clone()),
        canonical_locator,
        record_type: clean_option(candidate.record_type.clone()),
        full_text_status: candidate
            .full_text
            .as_ref()
            .and_then(|value| clean_option(value.status.clone())),
        metadata,
        provenance,
        field_provenance,
        created_at_ms: now,
    };
    transaction
        .execute(
            "INSERT INTO paper_source_records
             (id,project_id,paper_id,commit_id,batch_id,candidate_id,source_database,
              producer_version,provider_record_id,canonical_locator,record_type,
              full_text_status,metadata_json,provenance_json,created_at_ms)
             VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)",
            params![
                record.id,
                record.project_id,
                record.paper_id,
                record.commit_id,
                record.batch_id,
                record.candidate_id,
                record.source_database,
                record.producer_version,
                record.provider_record_id,
                record.canonical_locator,
                record.record_type,
                record.full_text_status,
                serde_json::to_string(&record.metadata).map_err(commit_store_error)?,
                serde_json::to_string(&record.provenance).map_err(commit_store_error)?,
                record.created_at_ms,
            ],
        )
        .map_err(map_commit_constraint)?;
    Ok(record)
}

fn insert_identity_aliases(
    transaction: &Transaction<'_>,
    project_id: &str,
    commit_id: &str,
    candidate: &SideraImportCandidate,
    action: &SideraImportCommitAction,
    paper_id: &str,
    source_record_id: &str,
    now: i64,
) -> Result<(), String> {
    for (kind, value) in candidate_strong_identities(candidate) {
        let id = deterministic_id("alias", &format!("{project_id}:{kind}:{value}"));
        transaction
            .execute(
                "INSERT INTO paper_identity_aliases
                 (id,project_id,paper_id,alias_kind,normalized_value,source_record_id,
                  commit_id,created_at_ms)
                 VALUES(?1,?2,?3,?4,?5,?6,?7,?8)
                 ON CONFLICT(project_id,alias_kind,normalized_value) DO NOTHING",
                params![
                    id,
                    project_id,
                    paper_id,
                    kind,
                    value,
                    source_record_id,
                    commit_id,
                    now,
                ],
            )
            .map_err(map_commit_constraint)?;
        let owner: String = transaction
            .query_row(
                "SELECT paper_id FROM paper_identity_aliases
                 WHERE project_id=?1 AND alias_kind=?2 AND normalized_value=?3",
                params![project_id, kind, value],
                |row| row.get(0),
            )
            .map_err(commit_store_error)?;
        if owner != paper_id {
            if matches!(action, SideraImportCommitAction::KeepSeparate) && kind == "canonical-url" {
                continue;
            }
            return Err("SIDERA_IMPORT_COMMIT_IDENTITY_CONFLICT".to_string());
        }
    }
    Ok(())
}

fn mark_review_failed(
    context: &SideraImportCommitContext,
    commit_id: &str,
    error: &str,
) -> Result<(), String> {
    let connection = open_review_store(&context.review_database)?;
    let code = error.split(':').next().unwrap_or(error);
    connection
        .execute(
            "UPDATE review_batches SET status='commit-failed', error_code=?1,
               updated_at_ms=?2 WHERE id=?3 AND project_id=?4
               AND status='committing' AND (?5='' OR commit_id=?5)",
            params![
                code,
                now_ms(),
                context.batch_id,
                context.project_id,
                commit_id
            ],
        )
        .map_err(commit_store_error)?;
    Ok(())
}

fn mark_review_committed(
    context: &SideraImportCommitContext,
    result: &SideraImportCommitResult,
) -> Result<(), String> {
    let connection = open_review_store(&context.review_database)?;
    let changed = connection
        .execute(
            "UPDATE review_batches SET status='committed', before_library_revision=?1,
               after_library_revision=?2, commit_id=?3, commit_counts_json=?4,
               completed_at_ms=?5, rolled_back_at_ms=NULL, error_code=NULL,
               updated_at_ms=?5 WHERE id=?6 AND project_id=?7
               AND status IN ('committing','commit-failed','committed')",
            params![
                result.before_revision,
                result.after_revision,
                result.commit_id,
                serde_json::to_string(&result.counts).map_err(commit_store_error)?,
                result.completed_at_ms,
                context.batch_id,
                context.project_id,
            ],
        )
        .map_err(commit_store_error)?;
    if changed == 0 {
        return Err("SIDERA_IMPORT_COMMIT_REVIEW_RECONCILE_FAILED".to_string());
    }
    Ok(())
}

fn mark_review_rolled_back(
    context: &SideraImportCommitContext,
    commit_id: &str,
    rollback_revision: i64,
    now: i64,
) -> Result<(), String> {
    let connection = open_review_store(&context.review_database)?;
    let changed = connection
        .execute(
            "UPDATE review_batches SET status='rolled-back', after_library_revision=?1,
               rolled_back_at_ms=?2,error_code=NULL,updated_at_ms=?2
             WHERE id=?3 AND project_id=?4 AND commit_id=?5
               AND status IN ('committed','rolled-back')",
            params![
                rollback_revision,
                now,
                context.batch_id,
                context.project_id,
                commit_id,
            ],
        )
        .map_err(commit_store_error)?;
    if changed == 0 {
        return Err("SIDERA_IMPORT_ROLLBACK_REVIEW_RECONCILE_FAILED".to_string());
    }
    Ok(())
}

fn ledger_by_client(
    connection: &Connection,
    project_id: &str,
    client_commit_id: &str,
) -> Result<Option<CommitLedgerRow>, String> {
    query_ledger(
        connection,
        "WHERE project_id=?1 AND client_commit_id=?2",
        params![project_id, client_commit_id],
    )
}

fn ledger_by_batch(
    connection: &Connection,
    project_id: &str,
    batch_id: &str,
) -> Result<Option<CommitLedgerRow>, String> {
    query_ledger(
        connection,
        "WHERE project_id=?1 AND batch_id=?2",
        params![project_id, batch_id],
    )
}

fn ledger_by_id(
    connection: &Connection,
    project_id: &str,
    commit_id: &str,
) -> Result<Option<CommitLedgerRow>, String> {
    query_ledger(
        connection,
        "WHERE project_id=?1 AND id=?2",
        params![project_id, commit_id],
    )
}

fn query_ledger<P: rusqlite::Params>(
    connection: &Connection,
    predicate: &str,
    parameters: P,
) -> Result<Option<CommitLedgerRow>, String> {
    let sql = format!(
        "SELECT id,project_id,batch_id,client_commit_id,preview_id,preview_hash,
                batch_version,status,before_revision,after_revision,paper_count_before,
                paper_count_after,counts_json,completed_at_ms,rolled_back_at_ms,
                rollback_revision,error_code FROM paper_import_commits {predicate}"
    );
    connection
        .query_row(&sql, parameters, ledger_from_row)
        .optional()
        .map_err(commit_store_error)
}

fn ledger_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<CommitLedgerRow> {
    let counts_json: String = row.get(12)?;
    let counts = serde_json::from_str(&counts_json).map_err(sql_conversion_error)?;
    let commit_id: String = row.get(0)?;
    let status: String = row.get(7)?;
    Ok(CommitLedgerRow {
        result: SideraImportCommitResult {
            commit_id,
            client_commit_id: row.get(3)?,
            project_id: row.get(1)?,
            batch_id: row.get(2)?,
            status,
            before_revision: row.get(8)?,
            after_revision: row.get(9)?,
            paper_count_before: row.get(10)?,
            paper_count_after: row.get(11)?,
            counts,
            items: Vec::new(),
            idempotent: false,
            completed_at_ms: row.get(13)?,
        },
        preview_id: row.get(4)?,
        preview_hash: row.get(5)?,
        batch_version: row.get(6)?,
        rolled_back_at_ms: row.get(14)?,
        rollback_revision: row.get(15)?,
        error_code: row.get(16)?,
    })
}

fn reconcile_review_from_ledger(
    context: &SideraImportCommitContext,
    ledger: &CommitLedgerRow,
) -> Result<(), String> {
    if ledger.result.status == "rolled-back" {
        mark_review_rolled_back(
            context,
            &ledger.result.commit_id,
            ledger
                .rollback_revision
                .unwrap_or(ledger.result.after_revision),
            ledger
                .rolled_back_at_ms
                .unwrap_or(ledger.result.completed_at_ms),
        )
    } else {
        mark_review_committed(context, &ledger.result)
    }
}

fn status_from_ledger(
    ledger: &CommitLedgerRow,
    batch_version: i64,
    paper_ids: Vec<String>,
) -> SideraImportCommitStatus {
    SideraImportCommitStatus {
        project_id: ledger.result.project_id.clone(),
        batch_id: ledger.result.batch_id.clone(),
        batch_status: ledger.result.status.clone(),
        batch_version,
        commit_id: Some(ledger.result.commit_id.clone()),
        client_commit_id: Some(ledger.result.client_commit_id.clone()),
        before_revision: Some(ledger.result.before_revision),
        after_revision: Some(ledger.result.after_revision),
        counts: Some(ledger.result.counts.clone()),
        completed_at_ms: Some(ledger.result.completed_at_ms),
        rolled_back_at_ms: ledger.rolled_back_at_ms,
        rollback_revision: ledger.rollback_revision,
        error_code: ledger.error_code.clone(),
        paper_ids,
    }
}

fn status_from_batch(batch: SideraImportReviewBatch) -> SideraImportCommitStatus {
    SideraImportCommitStatus {
        project_id: batch.project_id,
        batch_id: batch.id,
        batch_status: batch.status,
        batch_version: batch.batch_version,
        commit_id: batch.commit_id,
        client_commit_id: None,
        before_revision: batch.before_library_revision,
        after_revision: batch.after_library_revision,
        counts: batch
            .commit_counts
            .and_then(|value| serde_json::from_value(value).ok()),
        completed_at_ms: batch.completed_at_ms,
        rolled_back_at_ms: batch.rolled_back_at_ms,
        rollback_revision: None,
        error_code: batch.error_code,
        paper_ids: Vec::new(),
    }
}

fn load_commit_paper_ids(connection: &Connection, commit_id: &str) -> Result<Vec<String>, String> {
    let mut statement = connection
        .prepare(
            "SELECT DISTINCT paper_id FROM paper_import_commit_items
             WHERE commit_id=?1 AND paper_id IS NOT NULL AND TRIM(paper_id)<>''
             ORDER BY paper_id",
        )
        .map_err(commit_store_error)?;
    let rows = statement
        .query_map(params![commit_id], |row| row.get::<_, String>(0))
        .map_err(commit_store_error)?;
    let paper_ids = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(commit_store_error)?;
    Ok(paper_ids)
}

fn load_commit_items(
    connection: &Connection,
    commit_id: &str,
) -> Result<Vec<CommitItemRow>, String> {
    let mut statement = connection
        .prepare(
            "SELECT candidate_id,row_index,action,paper_id,before_paper_json,
                    after_fingerprint,source_record_id
             FROM paper_import_commit_items WHERE commit_id=?1 ORDER BY row_index,candidate_id",
        )
        .map_err(commit_store_error)?;
    let rows = statement
        .query_map(params![commit_id], |row| {
            let action: String = row.get(2)?;
            let before: Option<String> = row.get(4)?;
            Ok(CommitItemRow {
                candidate_id: row.get(0)?,
                row_index: row.get::<_, i64>(1)? as usize,
                action: SideraImportCommitAction::parse(&action).map_err(sql_conversion_error)?,
                paper_id: row.get(3)?,
                before_paper: before
                    .map(|value| serde_json::from_str(&value).map_err(sql_conversion_error))
                    .transpose()?,
                after_fingerprint: row.get(5)?,
                source_record_id: row.get(6)?,
            })
        })
        .map_err(commit_store_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(commit_store_error)?;
    Ok(rows)
}

fn load_commit_item_results(
    connection: &Connection,
    commit_id: &str,
) -> Result<Vec<SideraImportCommitItemResult>, String> {
    Ok(load_commit_items(connection, commit_id)?
        .into_iter()
        .map(|item| SideraImportCommitItemResult {
            candidate_id: item.candidate_id,
            row_index: item.row_index,
            action: item.action,
            paper_id: item.paper_id,
            source_record_id: item.source_record_id,
        })
        .collect())
}

fn rollback_conflicts(
    connection: &Connection,
    project_id: &str,
    commit_id: &str,
    committed_revision: i64,
    items: &[CommitItemRow],
) -> Result<Vec<SideraImportRollbackConflict>, String> {
    let mut conflicts = Vec::new();
    for item in items {
        if matches!(item.action, SideraImportCommitAction::Skip) {
            continue;
        }
        let Some(paper_id) = item.paper_id.as_deref() else {
            conflicts.push(SideraImportRollbackConflict {
                candidate_id: item.candidate_id.clone(),
                paper_id: String::new(),
                code: "SIDERA_IMPORT_ROLLBACK_PAPER_ID_MISSING".to_string(),
                fields: Vec::new(),
            });
            continue;
        };
        let later_dependencies = later_import_dependencies(
            connection,
            project_id,
            paper_id,
            commit_id,
            committed_revision,
        )?;
        if !later_dependencies.is_empty() {
            conflicts.push(SideraImportRollbackConflict {
                candidate_id: item.candidate_id.clone(),
                paper_id: paper_id.to_string(),
                code: "SIDERA_IMPORT_ROLLBACK_LATER_IMPORT_DEPENDENCY".to_string(),
                fields: later_dependencies,
            });
            continue;
        }
        let current = load_paper(connection, project_id, paper_id)?;
        match (current, item.after_fingerprint.as_deref()) {
            (Some(current), Some(expected)) if paper_fingerprint(&current) == expected => {}
            (None, _) => conflicts.push(SideraImportRollbackConflict {
                candidate_id: item.candidate_id.clone(),
                paper_id: paper_id.to_string(),
                code: "SIDERA_IMPORT_ROLLBACK_PAPER_MISSING".to_string(),
                fields: Vec::new(),
            }),
            (Some(_), _) => conflicts.push(SideraImportRollbackConflict {
                candidate_id: item.candidate_id.clone(),
                paper_id: paper_id.to_string(),
                code: "SIDERA_IMPORT_ROLLBACK_PAPER_DRIFT".to_string(),
                fields: vec!["fingerprint".to_string()],
            }),
        }
    }
    Ok(conflicts)
}

fn rollback_conflicts_with_revision_drift(
    connection: &Connection,
    project_id: &str,
    commit_id: &str,
    ledger: &CommitLedgerRow,
    expected_revision: i64,
    current_revision: i64,
    items: &[CommitItemRow],
) -> Result<Vec<SideraImportRollbackConflict>, String> {
    let mut conflicts = vec![SideraImportRollbackConflict {
        candidate_id: String::new(),
        paper_id: String::new(),
        code: "SIDERA_IMPORT_ROLLBACK_REVISION_DRIFT".to_string(),
        fields: vec![
            format!("requested:{expected_revision}"),
            format!("committed:{}", ledger.result.after_revision),
            format!("current:{current_revision}"),
        ],
    }];
    conflicts.extend(rollback_conflicts(
        connection,
        project_id,
        commit_id,
        ledger.result.after_revision,
        items,
    )?);
    Ok(conflicts)
}

fn blocked_rollback_result(
    input: &SideraImportRollbackInput,
    ledger: &CommitLedgerRow,
    conflicts: Vec<SideraImportRollbackConflict>,
) -> SideraImportRollbackResult {
    SideraImportRollbackResult {
        commit_id: input.commit_id.clone(),
        project_id: input.context.project_id.clone(),
        batch_id: input.context.batch_id.clone(),
        status: "blocked".to_string(),
        before_revision: ledger.result.before_revision,
        rollback_revision: None,
        rolled_back_at_ms: None,
        restored_count: 0,
        deleted_count: 0,
        rollback_conflicts: conflicts,
    }
}

fn later_import_dependencies(
    connection: &Connection,
    project_id: &str,
    paper_id: &str,
    commit_id: &str,
    committed_revision: i64,
) -> Result<Vec<String>, String> {
    let mut dependencies = Vec::new();
    let source_count: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM paper_source_records source
             JOIN paper_import_commits commit_row ON commit_row.id=source.commit_id
             WHERE source.project_id=?1 AND source.paper_id=?2 AND source.commit_id<>?3
               AND commit_row.project_id=?1 AND commit_row.before_revision>=?4
               AND commit_row.status='committed'",
            params![project_id, paper_id, commit_id, committed_revision],
            |row| row.get(0),
        )
        .map_err(commit_store_error)?;
    if source_count > 0 {
        dependencies.push("source-record".to_string());
    }
    let alias_count: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM paper_identity_aliases alias
             JOIN paper_import_commits commit_row ON commit_row.id=alias.commit_id
             WHERE alias.project_id=?1 AND alias.paper_id=?2 AND alias.commit_id<>?3
               AND commit_row.project_id=?1 AND commit_row.before_revision>=?4
               AND commit_row.status='committed'",
            params![project_id, paper_id, commit_id, committed_revision],
            |row| row.get(0),
        )
        .map_err(commit_store_error)?;
    if alias_count > 0 {
        dependencies.push("identity-alias".to_string());
    }
    let item_count: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM paper_import_commit_items item
             JOIN paper_import_commits commit_row ON commit_row.id=item.commit_id
             WHERE item.paper_id=?1 AND item.commit_id<>?2
               AND commit_row.project_id=?3 AND commit_row.before_revision>=?4
               AND commit_row.status='committed'",
            params![paper_id, commit_id, project_id, committed_revision],
            |row| row.get(0),
        )
        .map_err(commit_store_error)?;
    if item_count > 0 {
        dependencies.push("commit-item".to_string());
    }
    Ok(dependencies)
}

fn load_paper(
    connection: &Connection,
    project_id: &str,
    paper_id: &str,
) -> Result<Option<PaperRow>, String> {
    connection
        .query_row(
            "SELECT id,project_id,source,title,abstract,authors,categories,field,
                    published_date,year,url,doi,created_at,updated_at,search_blob
             FROM papers WHERE id=?1 AND project_id=?2",
            params![paper_id, project_id],
            paper_from_row,
        )
        .optional()
        .map_err(commit_store_error)
}

fn normalize_doi(value: &str) -> Option<String> {
    let mut normalized = value.trim();
    for prefix in [
        "https://dx.doi.org/",
        "http://dx.doi.org/",
        "https://doi.org/",
        "http://doi.org/",
        "doi:",
    ] {
        if normalized.len() >= prefix.len()
            && normalized[..prefix.len()].eq_ignore_ascii_case(prefix)
        {
            normalized = &normalized[prefix.len()..];
            break;
        }
    }
    let normalized = normalized
        .trim()
        .trim_end_matches(['.', ',', ';'])
        .to_ascii_lowercase();
    if normalized.len() > 255
        || normalized
            .chars()
            .any(|character| character.is_whitespace() || character.is_control())
    {
        return None;
    }
    let remainder = normalized.strip_prefix("10.")?;
    let (registrant, suffix) = remainder.split_once('/')?;
    if !(4..=9).contains(&registrant.len())
        || !registrant.bytes().all(|byte| byte.is_ascii_digit())
        || suffix.is_empty()
    {
        return None;
    }
    Some(normalized)
}

fn normalize_locator_identity(value: &str) -> Option<String> {
    let sanitized = sanitize_source_locator(value)?;
    crate::research_search::canonicalize_identity_url(&sanitized)
        .or(Some(sanitized))
        .map(|value| value.trim_end_matches('/').to_string())
}

fn sanitize_source_locator(value: &str) -> Option<String> {
    let value = value.trim();
    if value.is_empty() || value.chars().any(char::is_control) {
        return None;
    }
    if let Ok(mut url) = Url::parse(value) {
        if !matches!(url.scheme(), "http" | "https")
            || !url.username().is_empty()
            || url.password().is_some()
        {
            return None;
        }
        let safe_query = url
            .query_pairs()
            .filter(|(key, _)| !is_sensitive_key(key))
            .map(|(key, value)| (key.into_owned(), value.into_owned()))
            .collect::<Vec<_>>();
        url.set_query(None);
        if !safe_query.is_empty() {
            url.query_pairs_mut().extend_pairs(safe_query);
        }
        url.set_fragment(None);
        return Some(url.to_string().trim_end_matches('/').to_string());
    }
    if value.contains("://") {
        return None;
    }
    clean_option(Some(value.to_string()))
}

fn provider_identity(source: Option<&str>, record_id: Option<&str>) -> Option<String> {
    let source = identity_text(source?);
    let record_id = identity_text(record_id?);
    (!source.is_empty() && !record_id.is_empty()).then(|| format!("{source}::{record_id}"))
}

fn weak_identity_key(title: &str, first_author: Option<&str>, year: Option<i64>) -> Option<String> {
    let title = identity_text(title);
    let author = identity_text(first_author?);
    let year = year?;
    (!title.is_empty() && !author.is_empty()).then(|| format!("{title}::{author}::{year}"))
}

fn first_author(value: &str) -> Option<&str> {
    value
        .split([';', '|'])
        .map(str::trim)
        .find(|value| !value.is_empty())
}

fn identity_text(value: &str) -> String {
    value
        .to_lowercase()
        .chars()
        .filter(|character| character.is_alphanumeric())
        .collect()
}

fn build_search_blob(
    title: &str,
    abstract_text: &str,
    authors: Option<&str>,
    field: &str,
    doi: Option<&str>,
) -> String {
    [
        title,
        abstract_text,
        authors.unwrap_or(""),
        field,
        doi.unwrap_or(""),
    ]
    .into_iter()
    .filter(|value| !value.trim().is_empty())
    .collect::<Vec<_>>()
    .join(" ")
}

fn clean_string(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn clean_option(value: Option<String>) -> Option<String> {
    value
        .map(|value| clean_string(&value))
        .filter(|value| !value.is_empty())
}

fn some_nonempty(value: &str) -> Option<String> {
    (!value.trim().is_empty()).then(|| value.to_string())
}

fn serialize_optional<T: Serialize>(value: &Option<T>) -> Result<Option<String>, String> {
    value
        .as_ref()
        .map(|value| serde_json::to_string(value).map_err(commit_store_error))
        .transpose()
}

fn sanitize_json_value(value: serde_json::Value) -> serde_json::Value {
    match value {
        serde_json::Value::Object(map) => serde_json::Value::Object(
            map.into_iter()
                .filter(|(key, _)| !is_sensitive_key(key))
                .map(|(key, value)| (key, sanitize_json_value(value)))
                .collect(),
        ),
        serde_json::Value::Array(values) => {
            serde_json::Value::Array(values.into_iter().map(sanitize_json_value).collect())
        }
        serde_json::Value::String(value) => match Url::parse(&value) {
            Ok(url) if matches!(url.scheme(), "http" | "https") => serde_json::Value::String(
                sanitize_source_locator(&value).unwrap_or_else(|| "[redacted-url]".to_string()),
            ),
            Ok(url) if !url.scheme().is_empty() => {
                serde_json::Value::String("[redacted-url]".to_string())
            }
            _ => serde_json::Value::String(value),
        },
        other => other,
    }
}

fn is_sensitive_key(value: &str) -> bool {
    let normalized = value
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect::<String>();
    matches!(
        normalized.as_str(),
        "sid"
            | "code"
            | "state"
            | "auth"
            | "authcode"
            | "signature"
            | "sig"
            | "expires"
            | "expiry"
            | "nonce"
            | "samlresponse"
            | "assertion"
    ) || normalized.contains("cookie")
        || normalized.contains("ticket")
        || normalized.contains("token")
        || normalized.contains("session")
        || normalized.contains("credential")
        || normalized.contains("secret")
        || normalized.contains("apikey")
        || normalized.contains("authorization")
        || normalized.contains("password")
        || normalized.contains("passwd")
}

fn paper_fingerprint(paper: &PaperRow) -> String {
    full_hash(&serde_json::to_vec(paper).unwrap_or_default())
}

fn deterministic_id(prefix: &str, value: &str) -> String {
    format!("{prefix}-{}", &full_hash(value.as_bytes())[..24])
}

fn full_hash(value: &[u8]) -> String {
    format!("{:x}", Sha256::digest(value))
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(i64::MAX as u128) as i64
}

fn map_commit_constraint(error: rusqlite::Error) -> String {
    if matches!(error, rusqlite::Error::SqliteFailure(ref failure, _)
        if failure.code == rusqlite::ErrorCode::ConstraintViolation)
    {
        "SIDERA_IMPORT_COMMIT_IDENTITY_CONFLICT".to_string()
    } else {
        commit_store_error(error)
    }
}

fn commit_store_error(error: impl std::fmt::Display) -> String {
    format!("SIDERA_IMPORT_COMMIT_STORE_FAILED:{error}")
}

fn sql_conversion_error(error: impl std::fmt::Display) -> rusqlite::Error {
    rusqlite::Error::FromSqlConversionFailure(
        0,
        rusqlite::types::Type::Text,
        Box::new(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            error.to_string(),
        )),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::import_review::{
        create_review_batch_from_candidates, save_review_decision, SideraImportFullText,
        SideraInMemoryImportReviewInput, SideraNormalizedImportCandidate,
    };
    use std::fs;
    use std::path::Path;

    fn root(name: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!("sidera-commit-{name}-{}", now_ms()));
        fs::create_dir_all(&path).expect("temp directory");
        path
    }

    fn setup_library(path: &Path) {
        let connection = Connection::open(path).expect("library");
        connection
            .execute_batch(
                "PRAGMA foreign_keys=ON;
                 CREATE TABLE papers (
                   id TEXT PRIMARY KEY,
                   project_id TEXT NOT NULL,
                   source TEXT NOT NULL,
                   title TEXT NOT NULL,
                   abstract TEXT NOT NULL,
                   authors TEXT,
                   categories TEXT,
                   field TEXT NOT NULL,
                   published_date TEXT,
                   year INTEGER,
                   url TEXT,
                   doi TEXT,
                   created_at TEXT NOT NULL,
                   updated_at TEXT NOT NULL,
                   search_blob TEXT NOT NULL DEFAULT ''
                 );",
            )
            .expect("papers schema");
        crate::ensure_v20_schema(&connection).expect("v20 schema");
        crate::ensure_import_schema(&connection).expect("import schema");
        connection
            .pragma_update(None, "user_version", crate::LIBRARY_SCHEMA_VERSION)
            .expect("current library schema version");
        connection
            .execute(
                "INSERT INTO library_revision_state(project_id,revision,updated_at_ms)
                 VALUES('p',0,0) ON CONFLICT(project_id) DO NOTHING",
                [],
            )
            .expect("revision seed");
    }

    fn normalized_candidate(
        id: &str,
        title: &str,
        doi: Option<&str>,
        provider_record_id: Option<&str>,
    ) -> SideraNormalizedImportCandidate {
        SideraNormalizedImportCandidate {
            id: id.to_string(),
            title: title.to_string(),
            authors: vec!["Alice Example".to_string(), "Bob Example".to_string()],
            year: Some(2025),
            record_type: Some("journal-article".to_string()),
            venue: Some("Journal of Imported Guessing".to_string()),
            doi: doi.map(str::to_string),
            provider_record_id: provider_record_id.map(str::to_string),
            canonical_locator: Some(
                "https://example.org/record?record=42&ticket=secret&session_id=hidden#section"
                    .to_string(),
            ),
            abstract_text: Some("Candidate abstract".to_string()),
            source: Some("academic-discovery".to_string()),
            source_database: Some("WanFang".to_string()),
            full_text: Some(SideraImportFullText {
                status: Some("link-only".to_string()),
                locator: Some("opaque-fulltext".to_string()),
            }),
            provenance: serde_json::json!({
                "question": "why? #keep",
                "Access_Token": "secret-token",
                "nested": {"sessionId": "hidden"},
                "recordUrl": "https://example.org/record?record=42&ticket=secret#fragment"
            }),
        }
    }

    fn create_batch(
        root: &Path,
        library: &Path,
        search_id: &str,
        candidates: Vec<SideraNormalizedImportCandidate>,
    ) -> SideraImportReviewBatch {
        create_review_batch_from_candidates(
            &root.join("Sidera/import-review-v1.sqlite"),
            library,
            "p",
            SideraInMemoryImportReviewInput {
                search_id: search_id.to_string(),
                generation: 1,
                connector_version: "whu-academic-discovery-v2".to_string(),
                query: "machine learning".to_string(),
                candidates,
            },
        )
        .expect("review batch")
    }

    fn decide(
        root: &Path,
        batch: &SideraImportReviewBatch,
        candidate_index: usize,
        decision: SideraImportDecisionKind,
        target: Option<String>,
    ) -> SideraImportReviewBatch {
        save_review_decision(
            &root.join("Sidera/import-review-v1.sqlite"),
            "p",
            &batch.id,
            &batch.candidates[candidate_index].id,
            Some(decision),
            target,
            None,
        )
        .expect("save decision")
    }

    fn context(root: &Path, library: &Path, batch_id: &str) -> SideraImportCommitContext {
        SideraImportCommitContext {
            review_database: root.join("Sidera/import-review-v1.sqlite"),
            library_database: library.to_path_buf(),
            project_id: "p".to_string(),
            batch_id: batch_id.to_string(),
        }
    }

    fn execute_input(
        context: SideraImportCommitContext,
        preview: &SideraImportCommitPreview,
        client_commit_id: &str,
    ) -> SideraImportCommitExecuteInput {
        SideraImportCommitExecuteInput {
            context,
            preview_id: preview.preview_id.clone(),
            preview_hash: preview.preview_hash.clone(),
            batch_version: preview.batch_version,
            expected_revision: preview.expected_revision,
            client_commit_id: client_commit_id.to_string(),
        }
    }

    fn prepare(context: SideraImportCommitContext) -> SideraImportCommitPreview {
        prepare_import_commit(SideraImportCommitPrepareInput { context }).expect("preview")
    }

    #[test]
    fn commit_is_idempotent_and_preserves_source_truth_without_sensitive_values() {
        let root = root("idempotent");
        let library = root.join("research-hotspots-v7.sqlite");
        setup_library(&library);
        let batch = create_batch(
            &root,
            &library,
            "search-one",
            vec![normalized_candidate(
                "result-one",
                "Stable Imported Paper",
                Some("10.1000/stable"),
                Some("WF-1"),
            )],
        );
        let decided = decide(&root, &batch, 0, SideraImportDecisionKind::AcceptNew, None);
        let context = context(&root, &library, &decided.id);
        let preview = prepare(context.clone());
        let input = execute_input(context.clone(), &preview, "client-commit-one");
        let result = execute_import_commit(input.clone()).expect("commit");
        assert_eq!(result.before_revision, 0);
        assert_eq!(result.after_revision, 1);
        assert_eq!(result.paper_count_after, 1);
        assert_eq!(result.items.len(), 1);

        let replay = execute_import_commit(input).expect("idempotent replay");
        assert!(replay.idempotent);
        assert_eq!(replay.commit_id, result.commit_id);
        assert_eq!(replay.items, result.items);

        let connection = Connection::open(&library).expect("library");
        let paper = connection
            .query_row(
                "SELECT id,source,field,url FROM papers WHERE project_id='p'",
                [],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, Option<String>>(3)?,
                    ))
                },
            )
            .expect("paper");
        assert_eq!(paper.1, "institution");
        assert_eq!(paper.2, "未分类");
        assert_eq!(
            paper.3.as_deref(),
            Some("https://example.org/record?record=42")
        );
        let (metadata, provenance, locator): (String, String, Option<String>) = connection
            .query_row(
                "SELECT metadata_json,provenance_json,canonical_locator
                 FROM paper_source_records WHERE commit_id=?1",
                params![result.commit_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .expect("source record");
        assert!(metadata.contains("candidateRaw"));
        assert!(metadata.contains("fieldChanges"));
        assert!(metadata.contains("Journal of Imported Guessing"));
        assert!(metadata.contains("why? #keep"));
        assert!(!metadata.to_ascii_lowercase().contains("secret-token"));
        assert!(!metadata.to_ascii_lowercase().contains("sessionid"));
        assert!(provenance.contains("why? #keep"));
        assert!(!provenance.to_ascii_lowercase().contains("secret"));
        assert_eq!(
            locator.as_deref(),
            Some("https://example.org/record?record=42")
        );

        let history = import_commit_history(SideraImportCommitHistoryInput {
            context: SideraImportCommitContext {
                batch_id: String::new(),
                ..context
            },
            limit: None,
        })
        .expect("project history");
        assert_eq!(history.entries.len(), 1);
        assert_eq!(history.entries[0].paper_ids, vec![paper.0]);
    }

    #[test]
    fn migrated_batch_prepare_persists_base_revision_before_execute() {
        let root = root("migrated-base-revision");
        let library = root.join("research-hotspots-v7.sqlite");
        setup_library(&library);
        let batch = create_batch(
            &root,
            &library,
            "search-migrated",
            vec![normalized_candidate(
                "migrated",
                "Migrated Candidate",
                Some("10.1000/migrated"),
                None,
            )],
        );
        let batch = decide(&root, &batch, 0, SideraImportDecisionKind::AcceptNew, None);
        let context = context(&root, &library, &batch.id);
        let review = open_review_store(&context.review_database).expect("review store");
        review
            .execute(
                "UPDATE review_batches SET base_library_revision=NULL WHERE id=?1",
                params![batch.id],
            )
            .expect("clear migrated base revision");
        drop(review);

        let preview = prepare(context.clone());
        assert_eq!(preview.base_revision, Some(0));
        let result =
            execute_import_commit(execute_input(context, &preview, "client-migrated-base"))
                .expect("execute migrated batch");
        assert_eq!(result.after_revision, 1);
    }

    #[test]
    fn paper_identity_is_stable_across_batches_and_strong_keep_separate_is_blocked() {
        let root = root("identity");
        let library = root.join("research-hotspots-v7.sqlite");
        setup_library(&library);
        let first = create_batch(
            &root,
            &library,
            "search-first",
            vec![normalized_candidate(
                "first-result",
                "Stable Identity",
                Some("10.1000/shared"),
                Some("WF-SHARED"),
            )],
        );
        let first = decide(&root, &first, 0, SideraImportDecisionKind::AcceptNew, None);
        let first_context = context(&root, &library, &first.id);
        let first_preview = prepare(first_context.clone());
        let first_result = execute_import_commit(execute_input(
            first_context,
            &first_preview,
            "client-first-identity",
        ))
        .expect("commit first identity");
        let second = create_batch(
            &root,
            &library,
            "search-second",
            vec![normalized_candidate(
                "different-result-id",
                "Stable Identity",
                Some("10.1000/shared"),
                Some("WF-SHARED"),
            )],
        );
        let second = decide(
            &root,
            &second,
            0,
            SideraImportDecisionKind::AcceptMerge,
            first_result.items[0].paper_id.clone(),
        );
        let second_preview = prepare(context(&root, &library, &second.id));
        assert_eq!(
            first_preview.items[0].effective_paper_id,
            second_preview.items[0].effective_paper_id
        );

        let doi_conflict = create_batch(
            &root,
            &library,
            "search-doi-conflict",
            vec![normalized_candidate(
                "doi-conflict",
                "DOI Ownership Cannot Split",
                Some("10.1000/shared"),
                Some("WF-OTHER"),
            )],
        );
        let doi_conflict = decide(
            &root,
            &doi_conflict,
            0,
            SideraImportDecisionKind::KeepSeparate,
            None,
        );
        let preview = prepare(context(&root, &library, &doi_conflict.id));
        assert!(preview.items[0]
            .blocking_codes
            .contains(&"SIDERA_IMPORT_COMMIT_KEEP_SEPARATE_STRONG_IDENTITY".to_string()));

        let provider_conflict = create_batch(
            &root,
            &library,
            "search-provider-conflict",
            vec![normalized_candidate(
                "provider-conflict",
                "Provider Ownership Cannot Split",
                Some("10.1000/provider-other"),
                Some("WF-SHARED"),
            )],
        );
        let provider_conflict = decide(
            &root,
            &provider_conflict,
            0,
            SideraImportDecisionKind::KeepSeparate,
            None,
        );
        let preview = prepare(context(&root, &library, &provider_conflict.id));
        assert!(preview.items[0]
            .blocking_codes
            .contains(&"SIDERA_IMPORT_COMMIT_KEEP_SEPARATE_STRONG_IDENTITY".to_string()));

        let locator_only_conflict = create_batch(
            &root,
            &library,
            "search-locator-only",
            vec![normalized_candidate(
                "locator-only",
                "Stable Identity",
                Some("10.1000/unique-separate"),
                None,
            )],
        );
        let locator_only_conflict = decide(
            &root,
            &locator_only_conflict,
            0,
            SideraImportDecisionKind::KeepSeparate,
            None,
        );
        let locator_context = context(&root, &library, &locator_only_conflict.id);
        let preview = prepare(locator_context.clone());
        assert!(preview.items[0].blocking_codes.is_empty());
        let separate_result = execute_import_commit(execute_input(
            locator_context,
            &preview,
            "client-locator-separate",
        ))
        .expect("keep separate despite locator and weak match");
        assert_ne!(
            separate_result.items[0].paper_id,
            first_result.items[0].paper_id
        );
        let connection = Connection::open(&library).expect("library");
        assert_eq!(
            connection
                .query_row(
                    "SELECT COUNT(*) FROM paper_identity_aliases
                     WHERE alias_kind='canonical-url'",
                    [],
                    |row| row.get::<_, i64>(0),
                )
                .expect("canonical alias count"),
            1
        );
    }

    #[test]
    fn revision_drift_and_atomic_constraint_failure_leave_library_unchanged() {
        let drift_root = root("drift-atomic");
        let library = drift_root.join("research-hotspots-v7.sqlite");
        setup_library(&library);
        let batch = create_batch(
            &drift_root,
            &library,
            "search-drift",
            vec![normalized_candidate(
                "drift",
                "Drift Candidate",
                Some("10.1000/drift"),
                None,
            )],
        );
        let batch = decide(
            &drift_root,
            &batch,
            0,
            SideraImportDecisionKind::AcceptNew,
            None,
        );
        let drift_context = context(&drift_root, &library, &batch.id);
        let preview = prepare(drift_context.clone());
        let connection = Connection::open(&library).expect("library");
        connection
            .execute(
                "UPDATE library_revision_state SET revision=revision+1 WHERE project_id='p'",
                [],
            )
            .expect("drift revision");
        drop(connection);
        assert_eq!(
            execute_import_commit(execute_input(drift_context, &preview, "client-drift"))
                .expect_err("revision drift"),
            "SIDERA_IMPORT_COMMIT_REVISION_DRIFT"
        );

        let atomic_root = root("atomic");
        let library = atomic_root.join("research-hotspots-v7.sqlite");
        setup_library(&library);
        let batch = create_batch(
            &atomic_root,
            &library,
            "search-atomic",
            vec![
                normalized_candidate(
                    "duplicate-one",
                    "Duplicate One",
                    Some("10.1000/duplicate"),
                    None,
                ),
                normalized_candidate(
                    "duplicate-two",
                    "Duplicate Two",
                    Some("10.1000/duplicate"),
                    None,
                ),
            ],
        );
        let batch = decide(
            &atomic_root,
            &batch,
            0,
            SideraImportDecisionKind::AcceptNew,
            None,
        );
        let batch = decide(
            &atomic_root,
            &batch,
            1,
            SideraImportDecisionKind::AcceptNew,
            None,
        );
        let atomic_context = context(&atomic_root, &library, &batch.id);
        let preview = prepare(atomic_context.clone());
        assert_eq!(
            execute_import_commit(execute_input(
                atomic_context.clone(),
                &preview,
                "client-atomic",
            ))
            .expect_err("atomic collision"),
            "SIDERA_IMPORT_COMMIT_IDENTITY_CONFLICT"
        );
        let connection = Connection::open(&library).expect("library");
        assert_eq!(
            connection
                .query_row("SELECT COUNT(*) FROM papers", [], |row| row
                    .get::<_, i64>(0))
                .expect("paper count"),
            0
        );
        assert_eq!(
            connection
                .query_row("SELECT COUNT(*) FROM paper_import_commits", [], |row| {
                    row.get::<_, i64>(0)
                })
                .expect("commit count"),
            0
        );
        assert_eq!(current_revision(&connection, "p").expect("revision"), 0);
        assert_eq!(
            open_review_batch(
                &atomic_context.review_database,
                &atomic_context.project_id,
                &atomic_context.batch_id,
            )
            .expect("review")
            .status,
            "commit-failed"
        );
    }

    #[test]
    fn all_skip_keeps_revision_and_status_history_are_read_only() {
        let root = root("skip-read-only");
        let library = root.join("research-hotspots-v7.sqlite");
        setup_library(&library);
        let skipped = create_batch(
            &root,
            &library,
            "search-skip",
            vec![normalized_candidate(
                "skip",
                "Skipped Candidate",
                Some("10.1000/skip"),
                None,
            )],
        );
        let skipped = decide(&root, &skipped, 0, SideraImportDecisionKind::Skip, None);
        let skipped_context = context(&root, &library, &skipped.id);
        let skipped_preview = prepare(skipped_context.clone());
        let skipped_result = execute_import_commit(execute_input(
            skipped_context,
            &skipped_preview,
            "client-skip",
        ))
        .expect("skip commit");
        assert_eq!(skipped_result.before_revision, 0);
        assert_eq!(skipped_result.after_revision, 0);
        assert_eq!(skipped_result.paper_count_after, 0);

        let committed = create_batch(
            &root,
            &library,
            "search-reconcile",
            vec![normalized_candidate(
                "reconcile",
                "Receipt Reconciliation",
                Some("10.1000/reconcile"),
                None,
            )],
        );
        let committed = decide(
            &root,
            &committed,
            0,
            SideraImportDecisionKind::AcceptNew,
            None,
        );
        let committed_context = context(&root, &library, &committed.id);
        let preview = prepare(committed_context.clone());
        let result = execute_import_commit(execute_input(
            committed_context.clone(),
            &preview,
            "client-reconcile",
        ))
        .expect("commit");
        let review = open_review_store(&committed_context.review_database).expect("review store");
        review
            .execute(
                "UPDATE review_batches SET status='committing',completed_at_ms=NULL
                 WHERE id=?1",
                params![committed.id],
            )
            .expect("simulate interrupted review receipt");
        drop(review);
        let status = import_commit_status(SideraImportCommitStatusInput {
            context: committed_context.clone(),
        })
        .expect("read authoritative status");
        assert_eq!(status.batch_status, "committed");
        assert_eq!(status.commit_id.as_deref(), Some(result.commit_id.as_str()));
        assert_eq!(
            open_review_batch(
                &committed_context.review_database,
                "p",
                &committed_context.batch_id,
            )
            .expect("unchanged review")
            .status,
            "committing"
        );

        let unavailable_review_path = root.join("unavailable-review-store");
        fs::create_dir_all(&unavailable_review_path).expect("unavailable review directory");
        let ledger_only_status = import_commit_status(SideraImportCommitStatusInput {
            context: SideraImportCommitContext {
                review_database: unavailable_review_path,
                ..committed_context.clone()
            },
        })
        .expect("main ledger remains readable without auxiliary review store");
        assert_eq!(ledger_only_status.batch_status, "committed");
        assert_eq!(
            ledger_only_status.commit_id.as_deref(),
            Some(result.commit_id.as_str())
        );
        assert_eq!(ledger_only_status.batch_version, committed.batch_version);

        let review = open_review_store(&committed_context.review_database).expect("review store");
        review
            .execute(
                "UPDATE review_batches SET status='committing',completed_at_ms=NULL
                 WHERE id=?1",
                params![committed.id],
            )
            .expect("simulate restart before receipt reconciliation");
        drop(review);
        let history = import_commit_history(SideraImportCommitHistoryInput {
            context: SideraImportCommitContext {
                batch_id: String::new(),
                ..committed_context.clone()
            },
            limit: Some(50),
        })
        .expect("read authoritative history");
        assert_eq!(
            history.entries[0].commit_id.as_deref(),
            Some(result.commit_id.as_str())
        );
        assert_eq!(
            open_review_batch(
                &committed_context.review_database,
                "p",
                &committed_context.batch_id,
            )
            .expect("history leaves review unchanged")
            .status,
            "committing"
        );
    }

    #[test]
    fn missing_status_is_normalized_and_empty_history_does_not_create_review_store() {
        let root = root("read-only-not-found");
        let library = root.join("research-hotspots-v7.sqlite");
        setup_library(&library);
        let missing_review = root.join("missing/import-review-v1.sqlite");
        let missing_context = SideraImportCommitContext {
            review_database: missing_review.clone(),
            library_database: library.clone(),
            project_id: "p".to_string(),
            batch_id: "missing-batch".to_string(),
        };

        assert_eq!(
            import_commit_status(SideraImportCommitStatusInput {
                context: missing_context.clone(),
            })
            .expect_err("missing ledger and review store"),
            "SIDERA_IMPORT_COMMIT_STATUS_NOT_FOUND"
        );
        assert!(!missing_review.exists());

        let history = import_commit_history(SideraImportCommitHistoryInput {
            context: SideraImportCommitContext {
                batch_id: String::new(),
                ..missing_context
            },
            limit: None,
        })
        .expect("empty main ledger history");
        assert!(history.entries.is_empty());
        assert!(!missing_review.exists());

        let existing = create_batch(
            &root,
            &library,
            "search-existing-review",
            vec![normalized_candidate(
                "existing",
                "Existing Review Batch",
                Some("10.1000/existing-review"),
                None,
            )],
        );
        let missing_batch_context = context(&root, &library, "another-missing-batch");
        assert_ne!(existing.id, missing_batch_context.batch_id);
        assert_eq!(
            import_commit_status(SideraImportCommitStatusInput {
                context: missing_batch_context,
            })
            .expect_err("missing ledger and review batch"),
            "SIDERA_IMPORT_COMMIT_STATUS_NOT_FOUND"
        );
    }

    #[test]
    fn rollback_succeeds_without_drift_and_blocks_paper_drift() {
        let rollback_root = root("rollback");
        let library = rollback_root.join("research-hotspots-v7.sqlite");
        setup_library(&library);
        let batch = create_batch(
            &rollback_root,
            &library,
            "search-rollback",
            vec![normalized_candidate(
                "rollback",
                "Rollback Candidate",
                Some("10.1000/rollback"),
                None,
            )],
        );
        let batch = decide(
            &rollback_root,
            &batch,
            0,
            SideraImportDecisionKind::AcceptNew,
            None,
        );
        let rollback_context = context(&rollback_root, &library, &batch.id);
        let preview = prepare(rollback_context.clone());
        let committed = execute_import_commit(execute_input(
            rollback_context.clone(),
            &preview,
            "client-rollback",
        ))
        .expect("commit");
        let rolled_back = rollback_import_commit(SideraImportRollbackInput {
            context: rollback_context,
            commit_id: committed.commit_id.clone(),
            expected_revision: committed.after_revision,
            client_rollback_id: "rollback-one".to_string(),
        })
        .expect("rollback");
        assert_eq!(rolled_back.status, "rolled-back");
        assert_eq!(rolled_back.deleted_count, 1);
        assert_eq!(rolled_back.rollback_revision, Some(2));

        let drift_root = root("rollback-drift");
        let library = drift_root.join("research-hotspots-v7.sqlite");
        setup_library(&library);
        let batch = create_batch(
            &drift_root,
            &library,
            "search-rollback-drift",
            vec![normalized_candidate(
                "rollback-drift",
                "Rollback Drift",
                Some("10.1000/rollback-drift"),
                None,
            )],
        );
        let batch = decide(
            &drift_root,
            &batch,
            0,
            SideraImportDecisionKind::AcceptNew,
            None,
        );
        let drift_context = context(&drift_root, &library, &batch.id);
        let preview = prepare(drift_context.clone());
        let committed = execute_import_commit(execute_input(
            drift_context.clone(),
            &preview,
            "client-rollback-drift",
        ))
        .expect("commit");
        let paper_id = committed.items[0].paper_id.as_deref().expect("paper id");
        let connection = Connection::open(&library).expect("library");
        connection
            .execute(
                "UPDATE papers SET title='Out of band change' WHERE id=?1",
                params![paper_id],
            )
            .expect("paper drift");
        drop(connection);
        let blocked = rollback_import_commit(SideraImportRollbackInput {
            context: drift_context,
            commit_id: committed.commit_id,
            expected_revision: committed.after_revision,
            client_rollback_id: "rollback-drift".to_string(),
        })
        .expect("blocked rollback");
        assert_eq!(blocked.status, "blocked");
        assert_eq!(
            blocked.rollback_conflicts[0].code,
            "SIDERA_IMPORT_ROLLBACK_PAPER_DRIFT"
        );
    }

    #[test]
    fn rollback_blocks_later_import_dependencies() {
        let root = root("rollback-dependency");
        let library = root.join("research-hotspots-v7.sqlite");
        setup_library(&library);
        let batch = create_batch(
            &root,
            &library,
            "search-dependency",
            vec![normalized_candidate(
                "dependency",
                "Dependency Candidate",
                Some("10.1000/dependency"),
                None,
            )],
        );
        let batch = decide(&root, &batch, 0, SideraImportDecisionKind::AcceptNew, None);
        let context = context(&root, &library, &batch.id);
        let preview = prepare(context.clone());
        let committed = execute_import_commit(execute_input(
            context.clone(),
            &preview,
            "client-dependency",
        ))
        .expect("commit");
        let paper_id = committed.items[0]
            .paper_id
            .as_deref()
            .expect("paper id")
            .to_string();
        let connection = Connection::open(&library).expect("library");
        let counts =
            serde_json::to_string(&SideraImportCommitCounts::default()).expect("counts json");
        connection
            .execute(
                "INSERT INTO paper_import_commits
                 (id,project_id,batch_id,client_commit_id,preview_id,preview_hash,
                  batch_version,status,before_revision,after_revision,paper_count_before,
                  paper_count_after,counts_json,created_at_ms,completed_at_ms)
                 VALUES('later-commit','p','later-batch','later-client','later-preview',
                        'later-hash',1,'committed',?1,?1,1,1,?2,99,99)",
                params![committed.after_revision, counts],
            )
            .expect("later ledger");
        connection
            .execute(
                "INSERT INTO paper_source_records
                 (id,project_id,paper_id,commit_id,batch_id,candidate_id,source_database,
                  producer_version,metadata_json,provenance_json,created_at_ms)
                 VALUES('later-source','p',?1,'later-commit','later-batch',
                        'later-candidate','later-provider','v1','{}','{}',99)",
                params![paper_id],
            )
            .expect("later source");
        drop(connection);

        let blocked = rollback_import_commit(SideraImportRollbackInput {
            context,
            commit_id: committed.commit_id,
            expected_revision: committed.after_revision,
            client_rollback_id: "rollback-dependency".to_string(),
        })
        .expect("blocked rollback");
        assert_eq!(blocked.status, "blocked");
        assert_eq!(
            blocked.rollback_conflicts[0].code,
            "SIDERA_IMPORT_ROLLBACK_LATER_IMPORT_DEPENDENCY"
        );
        assert!(blocked.rollback_conflicts[0]
            .fields
            .contains(&"source-record".to_string()));
        let connection = Connection::open(&library).expect("library");
        assert_eq!(
            connection
                .query_row(
                    "SELECT COUNT(*) FROM papers WHERE id=?1",
                    params![paper_id],
                    |row| row.get::<_, i64>(0),
                )
                .expect("paper retained"),
            1
        );
    }

    #[test]
    fn revision_drift_returns_blocked_result_and_reports_paper_drift_without_writes() {
        let root = root("rollback-revision-drift-result");
        let library = root.join("research-hotspots-v7.sqlite");
        setup_library(&library);
        let batch = create_batch(
            &root,
            &library,
            "search-revision-drift-result",
            vec![normalized_candidate(
                "revision-drift-result",
                "Revision Drift Result",
                Some("10.1000/revision-drift-result"),
                None,
            )],
        );
        let batch = decide(&root, &batch, 0, SideraImportDecisionKind::AcceptNew, None);
        let context = context(&root, &library, &batch.id);
        let preview = prepare(context.clone());
        let committed = execute_import_commit(execute_input(
            context.clone(),
            &preview,
            "client-revision-drift-result",
        ))
        .expect("commit");
        let paper_id = committed.items[0]
            .paper_id
            .as_deref()
            .expect("paper id")
            .to_string();
        let connection = Connection::open(&library).expect("library");
        connection
            .execute(
                "UPDATE papers SET title='Later title' WHERE id=?1",
                params![paper_id],
            )
            .expect("paper drift");
        connection
            .execute(
                "UPDATE library_revision_state SET revision=revision+1 WHERE project_id='p'",
                [],
            )
            .expect("revision drift");
        drop(connection);

        let blocked = rollback_import_commit(SideraImportRollbackInput {
            context,
            commit_id: committed.commit_id.clone(),
            expected_revision: committed.after_revision,
            client_rollback_id: "rollback-revision-drift-result".to_string(),
        })
        .expect("blocked result");
        assert_eq!(blocked.status, "blocked");
        assert!(blocked
            .rollback_conflicts
            .iter()
            .any(|value| value.code == "SIDERA_IMPORT_ROLLBACK_REVISION_DRIFT"));
        assert!(blocked
            .rollback_conflicts
            .iter()
            .any(|value| value.code == "SIDERA_IMPORT_ROLLBACK_PAPER_DRIFT"));
        let connection = Connection::open(&library).expect("library after blocked rollback");
        assert_eq!(
            connection
                .query_row(
                    "SELECT title FROM papers WHERE id=?1",
                    params![paper_id],
                    |row| row.get::<_, String>(0),
                )
                .expect("paper retained"),
            "Later title"
        );
        assert_eq!(
            connection
                .query_row(
                    "SELECT status FROM paper_import_commits WHERE id=?1",
                    params![committed.commit_id],
                    |row| row.get::<_, String>(0),
                )
                .expect("ledger retained"),
            "committed"
        );
    }

    #[test]
    fn invalid_doi_is_source_truth_only_and_never_becomes_paper_identity() {
        let root = root("invalid-doi");
        let library = root.join("research-hotspots-v7.sqlite");
        setup_library(&library);
        let raw_doi = "10.12/not valid";
        let batch = create_batch(
            &root,
            &library,
            "search-invalid-doi",
            vec![normalized_candidate(
                "invalid-doi",
                "Invalid DOI Candidate",
                Some(raw_doi),
                None,
            )],
        );
        let batch = decide(&root, &batch, 0, SideraImportDecisionKind::AcceptNew, None);
        let context = context(&root, &library, &batch.id);
        let preview = prepare(context.clone());
        assert!(!preview.items[0]
            .identity_evidence
            .iter()
            .any(|value| value.kind == "doi"));
        let result = execute_import_commit(execute_input(context, &preview, "client-invalid-doi"))
            .expect("commit invalid DOI candidate");
        let connection = Connection::open(&library).expect("library");
        let (doi, metadata): (Option<String>, String) = connection
            .query_row(
                "SELECT p.doi,s.metadata_json FROM papers p
                 JOIN paper_source_records s ON s.paper_id=p.id
                 WHERE s.commit_id=?1",
                params![result.commit_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("paper and source truth");
        assert_eq!(doi, None);
        assert!(metadata.contains(raw_doi));
        assert_eq!(
            connection
                .query_row(
                    "SELECT COUNT(*) FROM paper_identity_aliases WHERE alias_kind='doi'",
                    [],
                    |row| row.get::<_, i64>(0),
                )
                .expect("doi alias count"),
            0
        );
    }

    #[test]
    fn sanitizers_keep_identity_query_and_plain_question_text() {
        assert_eq!(
            sanitize_source_locator(
                "https://example.org/detail?record=42&question=why&query=ml&Access_Token=secret&state=hidden&auth=x&auth-code=x&signature=x&sig=x&expires=x&expiry=x&nonce=x&SAMLResponse=x&assertion=x#frag"
            )
            .as_deref(),
            Some("https://example.org/detail?record=42&question=why&query=ml")
        );
        let sanitized = sanitize_json_value(serde_json::json!({
            "question": "what? keep # text",
            "query": "machine learning",
            "apiKey": "secret",
            "Nested": {
                "refresh_token": "secret",
                "Auth-Code": "secret",
                "SIGNATURE": "secret",
                "sig": "secret",
                "expires": "secret",
                "expiry": "secret",
                "nonce": "secret",
                "SAMLResponse": "secret",
                "assertion": "secret",
                "safe": "ok"
            },
            "url": "https://example.org/detail?record=42&sessionId=secret"
        }));
        assert_eq!(
            sanitized.get("question").and_then(|value| value.as_str()),
            Some("what? keep # text")
        );
        assert_eq!(
            sanitized.get("query").and_then(|value| value.as_str()),
            Some("machine learning")
        );
        assert!(sanitized.get("apiKey").is_none());
        assert_eq!(
            sanitized
                .pointer("/Nested/safe")
                .and_then(|value| value.as_str()),
            Some("ok")
        );
        assert_eq!(
            sanitized.get("url").and_then(|value| value.as_str()),
            Some("https://example.org/detail?record=42")
        );
    }
}
