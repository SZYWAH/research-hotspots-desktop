use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs::{self, File};
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection, OpenFlags, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

pub const IMPORT_REVIEW_SCHEMA_VERSION: i64 = 3;
const SCHEMA_VERSION: i64 = IMPORT_REVIEW_SCHEMA_VERSION;
const MAX_FILE_BYTES: u64 = 64 * 1024 * 1024;
const MAX_CANDIDATES: usize = 20_000;
const MAX_OPAQUE_ID_CHARS: usize = 512;
const MAX_CONNECTOR_VERSION_CHARS: usize = 128;
const MAX_QUERY_CHARS: usize = 2_000;
const MAX_PROVENANCE_BYTES: usize = 64 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SideraImportCandidateClassification {
    New,
    Merge,
    Conflict,
    Invalid,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SideraImportDecisionKind {
    AcceptNew,
    AcceptMerge,
    KeepSeparate,
    Skip,
    Unresolved,
}

impl SideraImportDecisionKind {
    fn as_str(&self) -> &'static str {
        match self {
            Self::AcceptNew => "accept-new",
            Self::AcceptMerge => "accept-merge",
            Self::KeepSeparate => "keep-separate",
            Self::Skip => "skip",
            Self::Unresolved => "unresolved",
        }
    }

    fn parse(value: &str) -> Result<Self, String> {
        match value {
            "accept-new" => Ok(Self::AcceptNew),
            "accept-merge" => Ok(Self::AcceptMerge),
            "keep-separate" => Ok(Self::KeepSeparate),
            "skip" => Ok(Self::Skip),
            "unresolved" => Ok(Self::Unresolved),
            _ => Err("SIDERA_IMPORT_REVIEW_DECISION_INVALID".to_string()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SideraIdentityEvidence {
    pub kind: String,
    pub value: String,
    pub label: String,
    pub rank: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SideraIdentityMatch {
    pub paper_id: String,
    pub title: String,
    pub matched_by: Vec<String>,
    pub preferred: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SideraImportDecision {
    pub kind: SideraImportDecisionKind,
    pub target_paper_id: Option<String>,
    pub note: Option<String>,
    pub updated_at_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SideraImportCandidate {
    pub id: String,
    pub batch_id: String,
    pub row_index: usize,
    pub title: String,
    pub authors: Vec<String>,
    pub first_author: Option<String>,
    pub year: Option<i64>,
    pub doi: Option<String>,
    pub source_database: Option<String>,
    pub provider_record_id: Option<String>,
    pub canonical_url: Option<String>,
    #[serde(default)]
    pub canonical_locator: Option<String>,
    pub venue: Option<String>,
    #[serde(default)]
    pub record_type: Option<String>,
    #[serde(rename = "abstract")]
    pub abstract_text: Option<String>,
    #[serde(default)]
    pub source: Option<String>,
    #[serde(default)]
    pub full_text: Option<SideraImportFullText>,
    #[serde(default)]
    pub provenance: Option<SideraImportCandidateProvenance>,
    pub classification: SideraImportCandidateClassification,
    pub invalid_reason: Option<String>,
    pub identity_evidence: Vec<SideraIdentityEvidence>,
    pub identity_matches: Vec<SideraIdentityMatch>,
    pub decision: Option<SideraImportDecision>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SideraImportFullText {
    pub status: Option<String>,
    pub locator: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SideraImportCandidateProvenance {
    pub search_id: String,
    pub generation: u64,
    pub connector_version: String,
    pub query: String,
    pub result_id: String,
    pub source: Option<String>,
    pub payload: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SideraNormalizedImportCandidate {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub authors: Vec<String>,
    pub year: Option<i64>,
    #[serde(rename = "recordType", alias = "type")]
    pub record_type: Option<String>,
    pub venue: Option<String>,
    pub doi: Option<String>,
    pub provider_record_id: Option<String>,
    pub canonical_locator: Option<String>,
    #[serde(rename = "abstract")]
    pub abstract_text: Option<String>,
    pub source: Option<String>,
    pub source_database: Option<String>,
    pub full_text: Option<SideraImportFullText>,
    #[serde(default)]
    pub provenance: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SideraInMemoryImportReviewInput {
    pub search_id: String,
    pub generation: u64,
    pub connector_version: String,
    pub query: String,
    pub candidates: Vec<SideraNormalizedImportCandidate>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SideraImportReviewCounts {
    pub total: usize,
    pub new_count: usize,
    pub merge_count: usize,
    pub conflict_count: usize,
    pub invalid_count: usize,
    pub decided_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SideraImportReviewBatch {
    pub id: String,
    pub project_id: String,
    pub file_name: String,
    pub format: String,
    pub status: String,
    #[serde(default = "default_batch_version")]
    pub batch_version: i64,
    #[serde(default)]
    pub base_library_revision: Option<i64>,
    #[serde(default)]
    pub before_library_revision: Option<i64>,
    #[serde(default)]
    pub after_library_revision: Option<i64>,
    #[serde(default)]
    pub commit_id: Option<String>,
    #[serde(default)]
    pub commit_counts: Option<serde_json::Value>,
    #[serde(default)]
    pub completed_at_ms: Option<i64>,
    #[serde(default)]
    pub rolled_back_at_ms: Option<i64>,
    #[serde(default)]
    pub error_code: Option<String>,
    pub counts: SideraImportReviewCounts,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
    #[serde(default)]
    pub candidates: Vec<SideraImportCandidate>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SideraImportReviewCopyInput {
    pub review_database: PathBuf,
    pub project_id: String,
    pub source_batch_id: String,
}

fn default_batch_version() -> i64 {
    1
}

#[derive(Debug)]
struct ParsedRow {
    index: usize,
    fields: HashMap<String, String>,
    error: Option<String>,
}

#[derive(Debug)]
struct ExistingPaper {
    id: String,
    title: String,
    title_key: String,
}

#[derive(Default)]
struct ExistingIndex {
    papers: HashMap<String, ExistingPaper>,
    doi: HashMap<String, HashSet<String>>,
    provider: HashMap<String, HashSet<String>>,
    url: HashMap<String, HashSet<String>>,
    title_author_year: HashMap<String, HashSet<String>>,
}

pub fn create_review_batch(
    review_database: &Path,
    library_database: &Path,
    project_id: &str,
    file_path: &Path,
) -> Result<SideraImportReviewBatch, String> {
    let metadata =
        fs::metadata(file_path).map_err(|_| "SIDERA_IMPORT_REVIEW_FILE_UNREADABLE".to_string())?;
    if !metadata.is_file() {
        return Err("SIDERA_IMPORT_REVIEW_FILE_REQUIRED".to_string());
    }
    if metadata.len() > MAX_FILE_BYTES {
        return Err("SIDERA_IMPORT_REVIEW_FILE_TOO_LARGE".to_string());
    }
    let format = file_format(file_path)?;
    let rows = parse_file(file_path, &format)?;
    if rows.len() > MAX_CANDIDATES {
        return Err("SIDERA_IMPORT_REVIEW_TOO_MANY_CANDIDATES".to_string());
    }

    let now = now_ms();
    let id = format!(
        "review-{now}-{}",
        short_hash(&format!("{project_id}:{}:{now}", file_path.display()))
    );
    let index = load_existing_index(library_database, project_id)?;
    let base_library_revision = read_library_revision(library_database, project_id)?;
    let candidates = rows
        .into_iter()
        .map(|row| build_candidate(&id, row, &index))
        .collect::<Vec<_>>();
    let counts = candidate_counts(&candidates);
    let file_name = file_path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("import")
        .to_string();

    let mut connection = open_store(review_database)?;
    let transaction = connection.transaction().map_err(store_error)?;
    transaction
        .execute(
            "INSERT INTO review_batches
             (id, project_id, file_name, file_path, format, status, counts_json,
              batch_version, base_library_revision, created_at_ms, updated_at_ms)
             VALUES (?1, ?2, ?3, ?4, ?5, 'active', ?6, 1, ?7, ?8, ?8)",
            params![
                id,
                project_id,
                file_name,
                file_path.to_string_lossy(),
                format,
                serde_json::to_string(&counts).map_err(store_error)?,
                base_library_revision,
                now
            ],
        )
        .map_err(store_error)?;
    for candidate in &candidates {
        insert_candidate(&transaction, candidate, now)?;
    }
    transaction.commit().map_err(store_error)?;

    Ok(SideraImportReviewBatch {
        id,
        project_id: project_id.to_string(),
        file_name,
        format,
        status: "active".to_string(),
        batch_version: 1,
        base_library_revision: Some(base_library_revision),
        before_library_revision: None,
        after_library_revision: None,
        commit_id: None,
        commit_counts: None,
        completed_at_ms: None,
        rolled_back_at_ms: None,
        error_code: None,
        counts,
        created_at_ms: now,
        updated_at_ms: now,
        candidates,
    })
}

pub fn create_review_batch_from_candidates(
    review_database: &Path,
    library_database: &Path,
    project_id: &str,
    input: SideraInMemoryImportReviewInput,
) -> Result<SideraImportReviewBatch, String> {
    validate_in_memory_batch(&input)?;
    let search_id = input.search_id.trim().to_string();
    let connector_version = input.connector_version.trim().to_string();
    let query = collapse_whitespace(&input.query);
    let source_generation = input.generation;
    let generation = i64::try_from(input.generation)
        .map_err(|_| "SIDERA_IMPORT_REVIEW_SEARCH_GENERATION_INVALID".to_string())?;
    let index = load_existing_index(library_database, project_id)?;
    let base_library_revision = read_library_revision(library_database, project_id)?;
    let now = now_ms();
    let id = format!(
        "review-{now}-{}",
        short_hash(&format!(
            "{project_id}:{search_id}:{generation}:{connector_version}:{now}"
        ))
    );
    let candidates = input
        .candidates
        .into_iter()
        .enumerate()
        .map(|(position, source)| {
            build_in_memory_candidate(
                &id,
                position + 1,
                &search_id,
                source_generation,
                &connector_version,
                &query,
                source,
                &index,
            )
        })
        .collect::<Vec<_>>();
    let counts = candidate_counts(&candidates);
    let file_name = format!("{} · {}", connector_version, truncate_chars(&query, 96));
    let source_marker = format!(
        "memory://institution-search/{}/{}",
        short_hash(&format!("{project_id}:{search_id}")),
        generation
    );

    let mut connection = open_store(review_database)?;
    let transaction = connection.transaction().map_err(store_error)?;
    let latest_generation = transaction
        .query_row(
            "SELECT generation FROM review_search_generations
             WHERE project_id = ?1 AND search_id = ?2",
            params![project_id, search_id],
            |row| row.get::<_, i64>(0),
        )
        .optional()
        .map_err(store_error)?;
    if latest_generation.is_some_and(|latest| generation <= latest) {
        return Err("SIDERA_IMPORT_REVIEW_SEARCH_GENERATION_STALE".to_string());
    }
    transaction
        .execute(
            "INSERT INTO review_batches
             (id, project_id, file_name, file_path, format, status, counts_json,
              batch_version, base_library_revision, created_at_ms, updated_at_ms)
             VALUES (?1, ?2, ?3, ?4, 'institution-snapshot', 'active', ?5, 1, ?6, ?7, ?7)",
            params![
                id,
                project_id,
                file_name,
                source_marker,
                serde_json::to_string(&counts).map_err(store_error)?,
                base_library_revision,
                now
            ],
        )
        .map_err(store_error)?;
    for candidate in &candidates {
        insert_candidate(&transaction, candidate, now)?;
    }
    transaction
        .execute(
            "INSERT INTO review_search_generations
             (project_id, search_id, generation, batch_id, connector_version, query, updated_at_ms)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT(project_id, search_id) DO UPDATE SET
               generation = excluded.generation,
               batch_id = excluded.batch_id,
               connector_version = excluded.connector_version,
               query = excluded.query,
               updated_at_ms = excluded.updated_at_ms",
            params![
                project_id,
                search_id,
                generation,
                id,
                connector_version,
                query,
                now
            ],
        )
        .map_err(store_error)?;
    transaction.commit().map_err(store_error)?;

    Ok(SideraImportReviewBatch {
        id,
        project_id: project_id.to_string(),
        file_name,
        format: "institution-snapshot".to_string(),
        status: "active".to_string(),
        batch_version: 1,
        base_library_revision: Some(base_library_revision),
        before_library_revision: None,
        after_library_revision: None,
        commit_id: None,
        commit_counts: None,
        completed_at_ms: None,
        rolled_back_at_ms: None,
        error_code: None,
        counts,
        created_at_ms: now,
        updated_at_ms: now,
        candidates,
    })
}

pub fn list_review_batches(
    review_database: &Path,
    project_id: &str,
) -> Result<Vec<SideraImportReviewBatch>, String> {
    let connection = open_store(review_database)?;
    let mut statement = connection
        .prepare(
            "SELECT id, project_id, file_name, format, status, counts_json,
                    batch_version, base_library_revision, before_library_revision,
                    after_library_revision, commit_id, commit_counts_json,
                    completed_at_ms, rolled_back_at_ms, error_code,
                    created_at_ms, updated_at_ms,
                    (SELECT COUNT(*) FROM review_candidates c
                     WHERE c.batch_id = b.id AND c.decision_kind IS NOT NULL)
             FROM review_batches b WHERE project_id = ?1
             ORDER BY updated_at_ms DESC, id DESC",
        )
        .map_err(store_error)?;
    let batches = statement
        .query_map(params![project_id], batch_from_row)
        .map_err(store_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(store_error)?;
    Ok(batches)
}

pub fn open_review_batch(
    review_database: &Path,
    project_id: &str,
    batch_id: &str,
) -> Result<SideraImportReviewBatch, String> {
    let connection = open_store(review_database)?;
    read_review_batch(&connection, project_id, batch_id)
}

pub fn open_review_batch_read_only(
    review_database: &Path,
    project_id: &str,
    batch_id: &str,
) -> Result<SideraImportReviewBatch, String> {
    let connection = open_store_read_only(review_database)?;
    read_review_batch(&connection, project_id, batch_id)
}

fn read_review_batch(
    connection: &Connection,
    project_id: &str,
    batch_id: &str,
) -> Result<SideraImportReviewBatch, String> {
    let mut batch = connection
        .query_row(
            "SELECT id, project_id, file_name, format, status, counts_json,
                    batch_version, base_library_revision, before_library_revision,
                    after_library_revision, commit_id, commit_counts_json,
                    completed_at_ms, rolled_back_at_ms, error_code,
                    created_at_ms, updated_at_ms,
                    (SELECT COUNT(*) FROM review_candidates c
                     WHERE c.batch_id = b.id AND c.decision_kind IS NOT NULL)
             FROM review_batches b WHERE id = ?1 AND project_id = ?2",
            params![batch_id, project_id],
            batch_from_row,
        )
        .optional()
        .map_err(store_error)?
        .ok_or_else(|| "SIDERA_IMPORT_REVIEW_BATCH_NOT_FOUND".to_string())?;
    let mut statement = connection
        .prepare(
            "SELECT candidate_json, decision_kind, decision_target_paper_id,
                    decision_note, decision_updated_at_ms
             FROM review_candidates WHERE batch_id = ?1 ORDER BY row_index, id",
        )
        .map_err(store_error)?;
    batch.candidates = statement
        .query_map(params![batch_id], candidate_from_row)
        .map_err(store_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(store_error)?;
    Ok(batch)
}

pub fn copy_frozen_review_batch(
    input: SideraImportReviewCopyInput,
) -> Result<SideraImportReviewBatch, String> {
    if input.project_id.trim().is_empty() || input.source_batch_id.trim().is_empty() {
        return Err("SIDERA_IMPORT_REVIEW_COPY_INPUT_INVALID".to_string());
    }
    let source = open_review_batch(
        &input.review_database,
        &input.project_id,
        &input.source_batch_id,
    )?;
    if !matches!(source.status.as_str(), "committed" | "rolled-back") {
        return Err("SIDERA_IMPORT_REVIEW_COPY_SOURCE_NOT_FROZEN".to_string());
    }

    let mut connection = open_store(&input.review_database)?;
    let source_file_path = connection
        .query_row(
            "SELECT file_path FROM review_batches WHERE id=?1 AND project_id=?2",
            params![input.source_batch_id, input.project_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(store_error)?
        .ok_or_else(|| "SIDERA_IMPORT_REVIEW_BATCH_NOT_FOUND".to_string())?;
    let transaction = connection
        .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
        .map_err(store_error)?;
    let now = now_ms();
    let mut id = None;
    for ordinal in 0..100_u32 {
        let candidate_id = format!(
            "review-{now}-{}",
            short_hash(&format!(
                "copy:{}:{}:{now}:{ordinal}",
                input.project_id, input.source_batch_id
            ))
        );
        let exists = transaction
            .query_row(
                "SELECT 1 FROM review_batches WHERE id=?1",
                params![candidate_id],
                |_| Ok(()),
            )
            .optional()
            .map_err(store_error)?
            .is_some();
        if !exists {
            id = Some(candidate_id);
            break;
        }
    }
    let id = id.ok_or_else(|| "SIDERA_IMPORT_REVIEW_COPY_ID_EXHAUSTED".to_string())?;
    let mut candidates = source
        .candidates
        .iter()
        .map(|candidate| {
            let mut copied = candidate.clone();
            copied.id = format!(
                "candidate-{}",
                short_hash(&format!("{id}:{}:{}", candidate.row_index, candidate.id))
            );
            copied.batch_id = id.clone();
            copied.decision = None;
            copied
        })
        .collect::<Vec<_>>();
    candidates.sort_by_key(|candidate| candidate.row_index);
    let mut counts = source.counts.clone();
    counts.decided_count = 0;
    transaction
        .execute(
            "INSERT INTO review_batches
             (id,project_id,file_name,file_path,format,status,counts_json,batch_version,
              base_library_revision,before_library_revision,after_library_revision,
              commit_id,commit_counts_json,completed_at_ms,rolled_back_at_ms,error_code,
              created_at_ms,updated_at_ms)
             VALUES(?1,?2,?3,?4,?5,'active',?6,1,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,?7,?7)",
            params![
                id,
                input.project_id,
                source.file_name,
                source_file_path,
                source.format,
                serde_json::to_string(&counts).map_err(store_error)?,
                now,
            ],
        )
        .map_err(store_error)?;
    for candidate in &candidates {
        insert_candidate(&transaction, candidate, now)?;
    }
    transaction.commit().map_err(store_error)?;
    open_review_batch(&input.review_database, &input.project_id, &id)
}

pub fn save_review_decision(
    review_database: &Path,
    project_id: &str,
    batch_id: &str,
    candidate_id: &str,
    decision: Option<SideraImportDecisionKind>,
    target_paper_id: Option<String>,
    note: Option<String>,
) -> Result<SideraImportReviewBatch, String> {
    let mut connection = open_store(review_database)?;
    let transaction = connection.transaction().map_err(store_error)?;
    let batch_status = transaction
        .query_row(
            "SELECT status FROM review_batches WHERE id = ?1 AND project_id = ?2",
            params![batch_id, project_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(store_error)?
        .ok_or_else(|| "SIDERA_IMPORT_REVIEW_BATCH_NOT_FOUND".to_string())?;
    if matches!(batch_status.as_str(), "committed" | "rolled-back") {
        return Err("SIDERA_IMPORT_REVIEW_BATCH_FROZEN".to_string());
    }
    if !matches!(batch_status.as_str(), "active" | "commit-failed") {
        return Err("SIDERA_IMPORT_REVIEW_BATCH_NOT_ACTIVE".to_string());
    }
    let candidate_json = transaction
        .query_row(
            "SELECT c.candidate_json FROM review_candidates c
             JOIN review_batches b ON b.id = c.batch_id
             WHERE c.id = ?1 AND c.batch_id = ?2 AND b.project_id = ?3",
            params![candidate_id, batch_id, project_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(store_error)?
        .ok_or_else(|| "SIDERA_IMPORT_REVIEW_CANDIDATE_NOT_FOUND".to_string())?;
    let candidate: SideraImportCandidate = serde_json::from_str(&candidate_json)
        .map_err(|_| "SIDERA_IMPORT_REVIEW_STORE_CORRUPT".to_string())?;
    validate_decision(&candidate, decision.as_ref(), target_paper_id.as_deref())?;
    let now = now_ms();
    transaction
        .execute(
            "UPDATE review_candidates SET decision_kind = ?1,
               decision_target_paper_id = ?2, decision_note = ?3,
               decision_updated_at_ms = CASE WHEN ?1 IS NULL THEN NULL ELSE ?4 END,
               updated_at_ms = ?4 WHERE id = ?5 AND batch_id = ?6",
            params![
                decision.as_ref().map(SideraImportDecisionKind::as_str),
                target_paper_id,
                clean_optional(note),
                now,
                candidate_id,
                batch_id
            ],
        )
        .map_err(store_error)?;
    transaction
        .execute(
            "UPDATE review_batches SET status = 'active', batch_version = batch_version + 1,
               before_library_revision = NULL, after_library_revision = NULL,
               commit_id = NULL, commit_counts_json = NULL, completed_at_ms = NULL,
               rolled_back_at_ms = NULL, error_code = NULL, updated_at_ms = ?1
             WHERE id = ?2 AND project_id = ?3",
            params![now, batch_id, project_id],
        )
        .map_err(store_error)?;
    transaction.commit().map_err(store_error)?;
    open_review_batch(review_database, project_id, batch_id)
}

pub fn discard_review_batch(
    review_database: &Path,
    project_id: &str,
    batch_id: &str,
) -> Result<(), String> {
    let connection = open_store(review_database)?;
    let status = connection
        .query_row(
            "SELECT status FROM review_batches WHERE id = ?1 AND project_id = ?2",
            params![batch_id, project_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(store_error)?
        .ok_or_else(|| "SIDERA_IMPORT_REVIEW_BATCH_NOT_FOUND".to_string())?;
    if matches!(status.as_str(), "committed" | "rolled-back") {
        return Err("SIDERA_IMPORT_REVIEW_BATCH_FROZEN".to_string());
    }
    let changed = connection
        .execute(
            "UPDATE review_batches SET status = 'discarded', batch_version = batch_version + 1,
               updated_at_ms = ?1
             WHERE id = ?2 AND project_id = ?3 AND status IN ('active','commit-failed')",
            params![now_ms(), batch_id, project_id],
        )
        .map_err(store_error)?;
    if changed == 0 {
        return Err("SIDERA_IMPORT_REVIEW_BATCH_NOT_ACTIVE".to_string());
    }
    Ok(())
}

fn validate_decision(
    candidate: &SideraImportCandidate,
    decision: Option<&SideraImportDecisionKind>,
    target: Option<&str>,
) -> Result<(), String> {
    if candidate.classification == SideraImportCandidateClassification::Invalid
        && matches!(
            decision,
            Some(SideraImportDecisionKind::AcceptNew | SideraImportDecisionKind::AcceptMerge)
        )
    {
        return Err("SIDERA_IMPORT_REVIEW_INVALID_CANDIDATE_CANNOT_ACCEPT".to_string());
    }
    if matches!(decision, Some(SideraImportDecisionKind::AcceptMerge)) {
        let target = target
            .or_else(|| {
                candidate
                    .identity_matches
                    .iter()
                    .find(|item| item.preferred)
                    .map(|item| item.paper_id.as_str())
            })
            .ok_or_else(|| "SIDERA_IMPORT_REVIEW_MERGE_TARGET_REQUIRED".to_string())?;
        if !candidate
            .identity_matches
            .iter()
            .any(|item| item.paper_id == target)
        {
            return Err("SIDERA_IMPORT_REVIEW_MERGE_TARGET_INVALID".to_string());
        }
    }
    Ok(())
}

fn file_format(path: &Path) -> Result<String, String> {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    match extension.as_str() {
        "csv" | "json" | "jsonl" | "ndjson" | "bib" | "ris" => Ok(extension),
        _ => Err("SIDERA_IMPORT_REVIEW_FORMAT_UNSUPPORTED".to_string()),
    }
}

fn parse_file(path: &Path, format: &str) -> Result<Vec<ParsedRow>, String> {
    match format {
        "csv" => parse_csv(path),
        "json" => parse_json(path),
        "jsonl" | "ndjson" => parse_json_lines(path),
        "bib" => parse_bibtex(path),
        "ris" => parse_ris(path),
        _ => Err("SIDERA_IMPORT_REVIEW_FORMAT_UNSUPPORTED".to_string()),
    }
}

fn parse_csv(path: &Path) -> Result<Vec<ParsedRow>, String> {
    let mut reader = csv::ReaderBuilder::new()
        .flexible(true)
        .from_path(path)
        .map_err(|_| "SIDERA_IMPORT_REVIEW_CSV_INVALID".to_string())?;
    let headers = reader
        .headers()
        .map_err(|_| "SIDERA_IMPORT_REVIEW_CSV_HEADER_INVALID".to_string())?
        .iter()
        .map(normalize_key)
        .collect::<Vec<_>>();
    Ok(reader
        .records()
        .enumerate()
        .map(|(index, record)| match record {
            Ok(record) => ParsedRow {
                index: index + 1,
                fields: record
                    .iter()
                    .enumerate()
                    .map(|(position, value)| {
                        (
                            headers
                                .get(position)
                                .cloned()
                                .unwrap_or_else(|| format!("col{position}")),
                            value.trim().to_string(),
                        )
                    })
                    .collect(),
                error: None,
            },
            Err(_) => invalid_row(index + 1, "CSV_ROW_INVALID"),
        })
        .collect())
}

fn parse_json(path: &Path) -> Result<Vec<ParsedRow>, String> {
    let file = File::open(path).map_err(|_| "SIDERA_IMPORT_REVIEW_FILE_UNREADABLE".to_string())?;
    let value: serde_json::Value = serde_json::from_reader(BufReader::new(file))
        .map_err(|_| "SIDERA_IMPORT_REVIEW_JSON_INVALID".to_string())?;
    let values = match value {
        serde_json::Value::Array(values) => values,
        serde_json::Value::Object(mut object) => {
            let mut nested = None;
            for key in ["papers", "data", "items", "results", "records"] {
                if let Some(serde_json::Value::Array(values)) = object.remove(key) {
                    nested = Some(values);
                    break;
                }
            }
            nested.unwrap_or_else(|| vec![serde_json::Value::Object(object)])
        }
        _ => return Err("SIDERA_IMPORT_REVIEW_JSON_ROOT_INVALID".to_string()),
    };
    Ok(values
        .iter()
        .enumerate()
        .map(|(index, value)| json_row(index + 1, value))
        .collect())
}

fn parse_json_lines(path: &Path) -> Result<Vec<ParsedRow>, String> {
    let file = File::open(path).map_err(|_| "SIDERA_IMPORT_REVIEW_FILE_UNREADABLE".to_string())?;
    let mut rows = Vec::new();
    for (index, line) in BufReader::new(file).lines().enumerate() {
        let index = index + 1;
        match line {
            Ok(line) if line.trim().is_empty() => {}
            Ok(line) => match serde_json::from_str::<serde_json::Value>(&line) {
                Ok(value) => rows.push(json_row(index, &value)),
                Err(_) => rows.push(invalid_row(index, "JSONL_LINE_INVALID")),
            },
            Err(_) => rows.push(invalid_row(index, "JSONL_LINE_UNREADABLE")),
        }
    }
    Ok(rows)
}

fn json_row(index: usize, value: &serde_json::Value) -> ParsedRow {
    let Some(object) = value.as_object() else {
        return invalid_row(index, "JSON_RECORD_NOT_OBJECT");
    };
    ParsedRow {
        index,
        fields: object
            .iter()
            .map(|(key, value)| (normalize_key(key), json_text(value)))
            .collect(),
        error: None,
    }
}

fn json_text(value: &serde_json::Value) -> String {
    match value {
        serde_json::Value::String(value) => value.trim().to_string(),
        serde_json::Value::Number(value) => value.to_string(),
        serde_json::Value::Bool(value) => value.to_string(),
        serde_json::Value::Array(values) => values
            .iter()
            .map(json_text)
            .filter(|value| !value.is_empty())
            .collect::<Vec<_>>()
            .join("; "),
        serde_json::Value::Null => String::new(),
        value => value.to_string(),
    }
}

fn parse_bibtex(path: &Path) -> Result<Vec<ParsedRow>, String> {
    let mut text = String::new();
    File::open(path)
        .and_then(|mut file| file.read_to_string(&mut text))
        .map_err(|_| "SIDERA_IMPORT_REVIEW_FILE_UNREADABLE".to_string())?;
    let entries = split_bibtex_entries(&text);
    if entries.is_empty() && !text.trim().is_empty() {
        return Err("SIDERA_IMPORT_REVIEW_BIBTEX_INVALID".to_string());
    }
    Ok(entries
        .into_iter()
        .enumerate()
        .map(|(index, entry)| bibtex_row(index + 1, &entry))
        .collect())
}

fn split_bibtex_entries(text: &str) -> Vec<String> {
    let offsets = text.char_indices().collect::<Vec<_>>();
    let mut result = Vec::new();
    let mut cursor = 0;
    while cursor < offsets.len() {
        if offsets[cursor].1 != '@' {
            cursor += 1;
            continue;
        }
        let start = offsets[cursor].0;
        let Some((open_index, open)) =
            offsets[cursor + 1..]
                .iter()
                .enumerate()
                .find_map(|(relative, (_, character))| {
                    matches!(character, '{' | '(').then_some((cursor + 1 + relative, *character))
                })
        else {
            break;
        };
        let close = if open == '{' { '}' } else { ')' };
        let mut depth = 1_i32;
        let mut quoted = false;
        let mut escaped = false;
        let mut end = None;
        for (position, (_, character)) in offsets.iter().enumerate().skip(open_index + 1) {
            if escaped {
                escaped = false;
                continue;
            }
            if *character == '\\' {
                escaped = true;
                continue;
            }
            if *character == '"' {
                quoted = !quoted;
                continue;
            }
            if quoted {
                continue;
            }
            if *character == open {
                depth += 1;
            } else if *character == close {
                depth -= 1;
                if depth == 0 {
                    end = Some(offsets[position].0 + character.len_utf8());
                    cursor = position + 1;
                    break;
                }
            }
        }
        if let Some(end) = end {
            result.push(text[start..end].to_string());
        } else {
            result.push(text[start..].to_string());
            break;
        }
    }
    result
}

fn bibtex_row(index: usize, entry: &str) -> ParsedRow {
    let Some(open) = entry.find(['{', '(']) else {
        return invalid_row(index, "BIBTEX_ENTRY_INVALID");
    };
    let entry_type = entry[1..open].trim().to_ascii_lowercase();
    if matches!(entry_type.as_str(), "comment" | "preamble" | "string") {
        return invalid_row(index, "BIBTEX_NON_RECORD_ENTRY");
    }
    let inner = entry[open + 1..entry.len().saturating_sub(1)].trim();
    let Some(comma) = top_level_comma(inner) else {
        return invalid_row(index, "BIBTEX_ENTRY_INVALID");
    };
    let mut fields = bibtex_fields(&inner[comma + 1..]);
    fields.insert(
        "providerrecordid".to_string(),
        inner[..comma].trim().to_string(),
    );
    ParsedRow {
        index,
        fields,
        error: None,
    }
}

fn top_level_comma(value: &str) -> Option<usize> {
    let mut depth = 0_i32;
    let mut quoted = false;
    let mut escaped = false;
    for (index, character) in value.char_indices() {
        if escaped {
            escaped = false;
            continue;
        }
        if character == '\\' {
            escaped = true;
            continue;
        }
        if character == '"' {
            quoted = !quoted;
            continue;
        }
        if quoted {
            continue;
        }
        if matches!(character, '{' | '(') {
            depth += 1;
        } else if matches!(character, '}' | ')') {
            depth -= 1;
        } else if character == ',' && depth == 0 {
            return Some(index);
        }
    }
    None
}

fn bibtex_fields(value: &str) -> HashMap<String, String> {
    let mut fields = HashMap::new();
    let mut rest = value.trim();
    while let Some(equal) = rest.find('=') {
        let key = normalize_key(&rest[..equal]);
        rest = rest[equal + 1..].trim_start();
        let end = top_level_comma(rest).unwrap_or(rest.len());
        let field_value = clean_bibliography_value(&rest[..end]);
        if !key.is_empty() {
            fields.insert(key, field_value);
        }
        rest = rest
            .get(end + usize::from(end < rest.len())..)
            .unwrap_or("");
    }
    fields
}

fn clean_bibliography_value(value: &str) -> String {
    let mut value = value.trim().trim_end_matches(',').trim().to_string();
    loop {
        let trimmed = value.trim();
        if trimmed.len() >= 2
            && ((trimmed.starts_with('{') && trimmed.ends_with('}'))
                || (trimmed.starts_with('"') && trimmed.ends_with('"')))
        {
            value = trimmed[1..trimmed.len() - 1].trim().to_string();
        } else {
            break;
        }
    }
    collapse_whitespace(&value.replace(['{', '}'], ""))
}

fn parse_ris(path: &Path) -> Result<Vec<ParsedRow>, String> {
    let file = File::open(path).map_err(|_| "SIDERA_IMPORT_REVIEW_FILE_UNREADABLE".to_string())?;
    let mut entries: Vec<BTreeMap<String, Vec<String>>> = Vec::new();
    let mut current = BTreeMap::new();
    let mut last_tag = String::new();
    for line in BufReader::new(file).lines() {
        let line = line.map_err(|_| "SIDERA_IMPORT_REVIEW_RIS_INVALID".to_string())?;
        if let Some((tag, value)) = ris_line(&line) {
            if tag == "TY" && !current.is_empty() {
                entries.push(std::mem::take(&mut current));
            }
            if tag == "ER" {
                if !current.is_empty() {
                    entries.push(std::mem::take(&mut current));
                }
                last_tag.clear();
                continue;
            }
            current
                .entry(tag.clone())
                .or_insert_with(Vec::new)
                .push(value);
            last_tag = tag;
        } else if !last_tag.is_empty() && !line.trim().is_empty() {
            if let Some(value) = current
                .get_mut(&last_tag)
                .and_then(|values| values.last_mut())
            {
                value.push(' ');
                value.push_str(line.trim());
            }
        }
    }
    if !current.is_empty() {
        entries.push(current);
    }
    Ok(entries
        .into_iter()
        .enumerate()
        .map(|(index, entry)| ris_row(index + 1, entry))
        .collect())
}

fn ris_line(line: &str) -> Option<(String, String)> {
    let bytes = line.as_bytes();
    (bytes.len() >= 6 && bytes[2] == b' ' && bytes[3] == b' ' && bytes[4] == b'-')
        .then(|| (line[..2].to_string(), line[5..].trim().to_string()))
}

fn ris_row(index: usize, entry: BTreeMap<String, Vec<String>>) -> ParsedRow {
    let mut fields = HashMap::new();
    put(&mut fields, "title", first_ris(&entry, &["TI", "T1", "CT"]));
    put(&mut fields, "abstract", first_ris(&entry, &["AB", "N2"]));
    put(&mut fields, "doi", first_ris(&entry, &["DO"]));
    put(
        &mut fields,
        "url",
        first_ris(&entry, &["UR", "L1", "L2", "LK"]),
    );
    put(&mut fields, "year", first_ris(&entry, &["PY", "Y1", "DA"]));
    put(&mut fields, "source", first_ris(&entry, &["DB", "DP"]));
    put(
        &mut fields,
        "providerrecordid",
        first_ris(&entry, &["ID", "AN", "UT"]),
    );
    put(
        &mut fields,
        "venue",
        first_ris(&entry, &["JO", "JF", "JA", "T2", "PB"]),
    );
    let authors = ["AU", "A1", "A2", "A3", "A4"]
        .iter()
        .flat_map(|tag| entry.get(*tag).into_iter().flatten())
        .cloned()
        .collect::<Vec<_>>()
        .join("; ");
    put(&mut fields, "authors", authors);
    ParsedRow {
        index,
        fields,
        error: None,
    }
}

fn first_ris(entry: &BTreeMap<String, Vec<String>>, tags: &[&str]) -> String {
    tags.iter()
        .find_map(|tag| {
            entry
                .get(*tag)
                .and_then(|values| values.iter().find(|value| !value.trim().is_empty()))
        })
        .cloned()
        .unwrap_or_default()
}

fn put(fields: &mut HashMap<String, String>, key: &str, value: String) {
    let value = collapse_whitespace(&value);
    if !value.is_empty() {
        fields.insert(normalize_key(key), value);
    }
}

fn invalid_row(index: usize, reason: &str) -> ParsedRow {
    ParsedRow {
        index,
        fields: HashMap::new(),
        error: Some(reason.to_string()),
    }
}

fn validate_in_memory_batch(input: &SideraInMemoryImportReviewInput) -> Result<(), String> {
    validate_bounded_text(
        &input.search_id,
        MAX_OPAQUE_ID_CHARS,
        "SIDERA_IMPORT_REVIEW_SEARCH_ID_INVALID",
    )?;
    if input.generation == 0 || input.generation > i64::MAX as u64 {
        return Err("SIDERA_IMPORT_REVIEW_SEARCH_GENERATION_INVALID".to_string());
    }
    validate_bounded_text(
        &input.connector_version,
        MAX_CONNECTOR_VERSION_CHARS,
        "SIDERA_IMPORT_REVIEW_CONNECTOR_VERSION_INVALID",
    )?;
    validate_bounded_text(
        &input.query,
        MAX_QUERY_CHARS,
        "SIDERA_IMPORT_REVIEW_QUERY_INVALID",
    )?;
    if input.candidates.is_empty() {
        return Err("SIDERA_IMPORT_REVIEW_CANDIDATES_REQUIRED".to_string());
    }
    if input.candidates.len() > MAX_CANDIDATES {
        return Err("SIDERA_IMPORT_REVIEW_TOO_MANY_CANDIDATES".to_string());
    }

    let mut ids = HashSet::with_capacity(input.candidates.len());
    for candidate in &input.candidates {
        validate_bounded_text(
            &candidate.id,
            MAX_OPAQUE_ID_CHARS,
            "SIDERA_IMPORT_REVIEW_RESULT_ID_INVALID",
        )?;
        let id = candidate.id.trim().to_string();
        if !ids.insert(id) {
            return Err("SIDERA_IMPORT_REVIEW_RESULT_ID_DUPLICATE".to_string());
        }
        if !candidate.provenance.is_null() && !candidate.provenance.is_object() {
            return Err("SIDERA_IMPORT_REVIEW_PROVENANCE_INVALID".to_string());
        }
        if serde_json::to_vec(&candidate.provenance)
            .map_err(|_| "SIDERA_IMPORT_REVIEW_PROVENANCE_INVALID".to_string())?
            .len()
            > MAX_PROVENANCE_BYTES
        {
            return Err("SIDERA_IMPORT_REVIEW_PROVENANCE_TOO_LARGE".to_string());
        }
        if let Some(locator) = candidate.canonical_locator.as_deref() {
            validate_optional_bounded_text(locator, 4_096, "SIDERA_IMPORT_REVIEW_LOCATOR_INVALID")?;
        }
        if let Some(locator) = candidate
            .full_text
            .as_ref()
            .and_then(|value| value.locator.as_deref())
        {
            validate_optional_bounded_text(locator, 4_096, "SIDERA_IMPORT_REVIEW_LOCATOR_INVALID")?;
        }
    }
    Ok(())
}

fn validate_bounded_text(value: &str, max_chars: usize, code: &str) -> Result<(), String> {
    let value = value.trim();
    if value.is_empty() || value.chars().count() > max_chars || value.chars().any(char::is_control)
    {
        return Err(code.to_string());
    }
    Ok(())
}

fn validate_optional_bounded_text(value: &str, max_chars: usize, code: &str) -> Result<(), String> {
    let value = value.trim();
    if value.is_empty() {
        return Ok(());
    }
    if value.chars().count() > max_chars || value.chars().any(char::is_control) {
        return Err(code.to_string());
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn build_in_memory_candidate(
    batch_id: &str,
    row_index: usize,
    search_id: &str,
    generation: u64,
    connector_version: &str,
    query: &str,
    source: SideraNormalizedImportCandidate,
    index: &ExistingIndex,
) -> SideraImportCandidate {
    let result_id = source.id.trim().to_string();
    let mut fields = HashMap::new();
    put(&mut fields, "title", source.title.clone());
    put(&mut fields, "authors", source.authors.join("; "));
    put(
        &mut fields,
        "year",
        source
            .year
            .map(|value| value.to_string())
            .unwrap_or_default(),
    );
    put(&mut fields, "doi", source.doi.clone().unwrap_or_default());
    put(
        &mut fields,
        "sourcedatabase",
        source
            .source_database
            .clone()
            .or_else(|| source.source.clone())
            .unwrap_or_default(),
    );
    put(
        &mut fields,
        "providerrecordid",
        source.provider_record_id.clone().unwrap_or_default(),
    );
    put(
        &mut fields,
        "canonicalurl",
        source.canonical_locator.clone().unwrap_or_default(),
    );
    put(
        &mut fields,
        "venue",
        source.venue.clone().unwrap_or_default(),
    );
    put(
        &mut fields,
        "abstract",
        source.abstract_text.clone().unwrap_or_default(),
    );
    let mut candidate = build_candidate(
        batch_id,
        ParsedRow {
            index: row_index,
            fields,
            error: None,
        },
        index,
    );
    candidate.id = format!(
        "candidate-{row_index}-{}",
        short_hash(&format!("{batch_id}:{result_id}"))
    );
    candidate.canonical_locator = source
        .canonical_locator
        .as_deref()
        .and_then(crate::research_search::canonicalize_identity_url);
    candidate.record_type = clean_optional(source.record_type);
    candidate.source = clean_optional(source.source);
    candidate.full_text = source.full_text.map(|value| SideraImportFullText {
        status: clean_optional(value.status),
        locator: clean_optional(value.locator),
    });
    candidate.provenance = Some(SideraImportCandidateProvenance {
        search_id: search_id.to_string(),
        generation,
        connector_version: connector_version.to_string(),
        query: query.to_string(),
        result_id,
        source: candidate.source.clone(),
        payload: source.provenance,
    });
    candidate
}

fn truncate_chars(value: &str, max_chars: usize) -> String {
    value.chars().take(max_chars).collect()
}

fn build_candidate(batch_id: &str, row: ParsedRow, index: &ExistingIndex) -> SideraImportCandidate {
    let title = collapse_whitespace(&pick(
        &row.fields,
        &[
            "title",
            "name",
            "displayname",
            "papertitle",
            "标题",
            "题名",
            "论文标题",
            "文献标题",
        ],
    ));
    let authors = split_authors(&pick(
        &row.fields,
        &["authors", "author", "creator", "作者", "作者列表"],
    ));
    let first_author = authors.first().cloned();
    let year = extract_year(&pick(
        &row.fields,
        &[
            "year",
            "publicationyear",
            "publishedyear",
            "date",
            "published",
            "年份",
            "出版年",
        ],
    ));
    let doi = normalize_doi(&pick(&row.fields, &["doi"]));
    let source_database = clean_optional(Some(pick(
        &row.fields,
        &[
            "sourcedatabase",
            "source",
            "database",
            "platform",
            "来源数据库",
            "来源",
            "数据源",
        ],
    )));
    let provider_record_id = clean_optional(Some(pick(
        &row.fields,
        &[
            "providerrecordid",
            "recordid",
            "accessionnumber",
            "ut",
            "id",
            "paperid",
            "编号",
            "文献编号",
        ],
    )));
    let canonical_url = canonical_url(&pick(
        &row.fields,
        &[
            "canonicalurl",
            "url",
            "link",
            "landingpageurl",
            "pdfurl",
            "链接",
            "网址",
        ],
    ));
    let venue = clean_optional(Some(pick(
        &row.fields,
        &[
            "venue",
            "journal",
            "journaltitle",
            "booktitle",
            "publication",
            "期刊",
            "会议",
            "授予单位",
        ],
    )));
    let abstract_text = clean_optional(Some(pick(
        &row.fields,
        &[
            "abstract",
            "summary",
            "description",
            "摘要",
            "简介",
            "内容摘要",
        ],
    )));

    let title_key = identity_text(&title);
    let author_key = first_author
        .as_deref()
        .map(identity_text)
        .filter(|value| !value.is_empty());
    let provider_key = provider_key(source_database.as_deref(), provider_record_id.as_deref());
    let fallback_key = title_author_year_key(&title_key, author_key.as_deref(), year);
    let mut identity_evidence = Vec::new();
    if let Some(value) = &doi {
        identity_evidence.push(evidence("doi", value, "DOI", 1));
    }
    if let Some(value) = &provider_key {
        identity_evidence.push(evidence(
            "provider-record",
            value,
            "来源数据库 + 供应商记录 ID",
            2,
        ));
    }
    if let Some(value) = &canonical_url {
        identity_evidence.push(evidence("canonical-url", value, "规范详情 URL", 3));
    }
    if let Some(value) = &fallback_key {
        identity_evidence.push(evidence(
            "title-author-year",
            value,
            "题名 + 第一作者 + 年份",
            4,
        ));
    }
    let invalid_reason = row.error.or_else(|| {
        if title.is_empty() {
            Some("缺少题名".to_string())
        } else if identity_evidence.is_empty() {
            Some("身份依据不足".to_string())
        } else {
            None
        }
    });

    let lookup_order = [
        doi.as_ref()
            .and_then(|value| index.doi.get(value))
            .map(|ids| ("doi", ids)),
        provider_key
            .as_ref()
            .and_then(|value| index.provider.get(value))
            .map(|ids| ("provider-record", ids)),
        canonical_url
            .as_ref()
            .and_then(|value| index.url.get(value))
            .map(|ids| ("canonical-url", ids)),
        fallback_key
            .as_ref()
            .and_then(|value| index.title_author_year.get(value))
            .map(|ids| ("title-author-year", ids)),
    ];
    let preferred = lookup_order.iter().flatten().find_map(|(_, ids)| {
        (ids.len() == 1)
            .then(|| ids.iter().next().cloned())
            .flatten()
    });
    let mut matched: HashMap<String, Vec<String>> = HashMap::new();
    for (kind, ids) in lookup_order.into_iter().flatten() {
        for id in ids {
            matched
                .entry(id.clone())
                .or_default()
                .push(kind.to_string());
        }
    }
    let matches = matched
        .into_iter()
        .filter_map(|(paper_id, matched_by)| {
            index
                .papers
                .get(&paper_id)
                .map(|paper| SideraIdentityMatch {
                    paper_id: paper.id.clone(),
                    title: paper.title.clone(),
                    matched_by,
                    preferred: preferred.as_deref() == Some(paper_id.as_str()),
                })
        })
        .collect::<Vec<_>>();
    let title_conflict = matches.first().is_some_and(|matched| {
        index.papers.get(&matched.paper_id).is_some_and(|paper| {
            paper.title_key != title_key
                && !paper.title_key.contains(&title_key)
                && !title_key.contains(&paper.title_key)
                && matched
                    .matched_by
                    .iter()
                    .any(|kind| kind != "title-author-year")
        })
    });
    let classification = if invalid_reason.is_some() {
        SideraImportCandidateClassification::Invalid
    } else if matches.is_empty() {
        SideraImportCandidateClassification::New
    } else if matches.len() == 1 && !title_conflict {
        SideraImportCandidateClassification::Merge
    } else {
        SideraImportCandidateClassification::Conflict
    };
    let id = format!(
        "candidate-{}-{}",
        row.index,
        short_hash(&format!("{batch_id}:{title}:{doi:?}:{canonical_url:?}"))
    );
    SideraImportCandidate {
        id,
        batch_id: batch_id.to_string(),
        row_index: row.index,
        title,
        authors,
        first_author,
        year,
        doi,
        source_database,
        provider_record_id,
        canonical_url,
        canonical_locator: None,
        venue,
        record_type: None,
        abstract_text,
        source: None,
        full_text: None,
        provenance: None,
        classification,
        invalid_reason,
        identity_evidence,
        identity_matches: matches,
        decision: None,
    }
}

fn load_existing_index(path: &Path, project_id: &str) -> Result<ExistingIndex, String> {
    if !path.exists() {
        return Ok(ExistingIndex::default());
    }
    let connection = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|_| "SIDERA_IMPORT_REVIEW_LIBRARY_READ_FAILED".to_string())?;
    let mut statement = connection
        .prepare(
            "SELECT id, source, title, authors, year, url, doi
             FROM papers WHERE project_id = ?1",
        )
        .map_err(|_| "SIDERA_IMPORT_REVIEW_LIBRARY_SCHEMA_INCOMPATIBLE".to_string())?;
    let rows = statement
        .query_map(params![project_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, Option<i64>>(4)?,
                row.get::<_, Option<String>>(5)?,
                row.get::<_, Option<String>>(6)?,
            ))
        })
        .map_err(|_| "SIDERA_IMPORT_REVIEW_LIBRARY_READ_FAILED".to_string())?;
    let mut index = ExistingIndex::default();
    for row in rows {
        let (id, source, title, authors, year, url, doi) =
            row.map_err(|_| "SIDERA_IMPORT_REVIEW_LIBRARY_READ_FAILED".to_string())?;
        let title_key = identity_text(&title);
        let author_key = authors
            .as_deref()
            .and_then(|value| split_authors(value).into_iter().next())
            .map(|value| identity_text(&value));
        let raw_id = id
            .strip_prefix(&format!("{project_id}:"))
            .unwrap_or(&id)
            .to_string();
        if let Some(value) = doi.as_deref().and_then(normalize_doi) {
            add_index(&mut index.doi, &value, &id);
        }
        if let Some(value) = provider_key(Some(&source), Some(&raw_id)) {
            add_index(&mut index.provider, &value, &id);
        }
        if let Some(value) = url.as_deref().and_then(canonical_url) {
            add_index(&mut index.url, &value, &id);
        }
        if let Some(value) = title_author_year_key(&title_key, author_key.as_deref(), year) {
            add_index(&mut index.title_author_year, &value, &id);
        }
        index.papers.insert(
            id.clone(),
            ExistingPaper {
                id,
                title,
                title_key,
            },
        );
    }
    Ok(index)
}

fn read_library_revision(path: &Path, project_id: &str) -> Result<i64, String> {
    if !path.exists() {
        return Ok(0);
    }
    let connection = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|_| "SIDERA_IMPORT_REVIEW_LIBRARY_READ_FAILED".to_string())?;
    let has_revision_table = connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master
             WHERE type = 'table' AND name = 'library_revision_state')",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|_| "SIDERA_IMPORT_REVIEW_LIBRARY_READ_FAILED".to_string())?
        != 0;
    if !has_revision_table {
        return Ok(0);
    }
    connection
        .query_row(
            "SELECT COALESCE((SELECT revision FROM library_revision_state
             WHERE project_id = ?1), 0)",
            params![project_id],
            |row| row.get(0),
        )
        .map_err(|_| "SIDERA_IMPORT_REVIEW_LIBRARY_READ_FAILED".to_string())
}

pub(crate) fn open_store(path: &Path) -> Result<Connection, String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|_| "SIDERA_IMPORT_REVIEW_STORE_DIRECTORY_FAILED".to_string())?;
    }
    let mut connection = Connection::open(path).map_err(store_error)?;
    connection
        .execute_batch(
            "PRAGMA journal_mode=WAL;
             PRAGMA synchronous=NORMAL;
             PRAGMA foreign_keys=ON;",
        )
        .map_err(store_error)?;
    let version: i64 = connection
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(store_error)?;
    if version > SCHEMA_VERSION {
        return Err("SIDERA_IMPORT_REVIEW_SCHEMA_NEWER".to_string());
    }
    let transaction = connection
        .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
        .map_err(store_error)?;
    transaction
        .execute_batch(
            "CREATE TABLE IF NOT EXISTS review_batches (
               id TEXT PRIMARY KEY, project_id TEXT NOT NULL, file_name TEXT NOT NULL,
               file_path TEXT NOT NULL, format TEXT NOT NULL, status TEXT NOT NULL,
               counts_json TEXT NOT NULL, batch_version INTEGER NOT NULL DEFAULT 1,
               base_library_revision INTEGER, before_library_revision INTEGER,
               after_library_revision INTEGER, commit_id TEXT, commit_counts_json TEXT,
               completed_at_ms INTEGER, rolled_back_at_ms INTEGER, error_code TEXT,
               created_at_ms INTEGER NOT NULL, updated_at_ms INTEGER NOT NULL
             );
             CREATE INDEX IF NOT EXISTS idx_review_batches_project_updated
               ON review_batches(project_id, updated_at_ms DESC);
             CREATE TABLE IF NOT EXISTS review_candidates (
               id TEXT PRIMARY KEY,
               batch_id TEXT NOT NULL REFERENCES review_batches(id) ON DELETE CASCADE,
               row_index INTEGER NOT NULL, classification TEXT NOT NULL,
               candidate_json TEXT NOT NULL, decision_kind TEXT,
               decision_target_paper_id TEXT, decision_note TEXT,
               decision_updated_at_ms INTEGER, created_at_ms INTEGER NOT NULL, updated_at_ms INTEGER NOT NULL
             );
             CREATE INDEX IF NOT EXISTS idx_review_candidates_batch_row
               ON review_candidates(batch_id, row_index);
             CREATE TABLE IF NOT EXISTS review_search_generations (
               project_id TEXT NOT NULL, search_id TEXT NOT NULL,
               generation INTEGER NOT NULL, batch_id TEXT NOT NULL UNIQUE
                 REFERENCES review_batches(id) ON DELETE CASCADE,
               connector_version TEXT NOT NULL, query TEXT NOT NULL,
               updated_at_ms INTEGER NOT NULL,
               PRIMARY KEY(project_id, search_id)
             );
             CREATE INDEX IF NOT EXISTS idx_review_search_generations_batch
               ON review_search_generations(batch_id);",
        )
        .map_err(store_error)?;
    if version < 3 {
        add_column_if_missing(
            &transaction,
            "review_batches",
            "batch_version",
            "INTEGER NOT NULL DEFAULT 1",
        )?;
        add_column_if_missing(
            &transaction,
            "review_batches",
            "base_library_revision",
            "INTEGER",
        )?;
        add_column_if_missing(
            &transaction,
            "review_batches",
            "before_library_revision",
            "INTEGER",
        )?;
        add_column_if_missing(
            &transaction,
            "review_batches",
            "after_library_revision",
            "INTEGER",
        )?;
        add_column_if_missing(&transaction, "review_batches", "commit_id", "TEXT")?;
        add_column_if_missing(&transaction, "review_batches", "commit_counts_json", "TEXT")?;
        add_column_if_missing(&transaction, "review_batches", "completed_at_ms", "INTEGER")?;
        add_column_if_missing(
            &transaction,
            "review_batches",
            "rolled_back_at_ms",
            "INTEGER",
        )?;
        add_column_if_missing(&transaction, "review_batches", "error_code", "TEXT")?;
    }
    transaction
        .pragma_update(None, "user_version", SCHEMA_VERSION)
        .map_err(store_error)?;
    transaction.commit().map_err(store_error)?;
    Ok(connection)
}

fn open_store_read_only(path: &Path) -> Result<Connection, String> {
    if !path.is_file() {
        return Err("SIDERA_IMPORT_REVIEW_STORE_NOT_FOUND".to_string());
    }
    let connection = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(store_error)?;
    connection
        .pragma_update(None, "query_only", "ON")
        .map_err(store_error)?;
    connection
        .pragma_update(None, "foreign_keys", "ON")
        .map_err(store_error)?;
    connection
        .busy_timeout(Duration::from_secs(2))
        .map_err(store_error)?;
    let version: i64 = connection
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(store_error)?;
    if version > SCHEMA_VERSION {
        return Err("SIDERA_IMPORT_REVIEW_SCHEMA_NEWER".to_string());
    }
    if version != SCHEMA_VERSION {
        return Err("SIDERA_IMPORT_REVIEW_SCHEMA_PREPARATION_REQUIRED".to_string());
    }
    Ok(connection)
}

fn add_column_if_missing(
    connection: &Connection,
    table: &str,
    column: &str,
    definition: &str,
) -> Result<(), String> {
    let mut statement = connection
        .prepare(&format!("PRAGMA table_info({table})"))
        .map_err(store_error)?;
    let exists = statement
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(store_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(store_error)?
        .into_iter()
        .any(|value| value == column);
    if !exists {
        connection
            .execute_batch(&format!(
                "ALTER TABLE {table} ADD COLUMN {column} {definition}"
            ))
            .map_err(store_error)?;
    }
    Ok(())
}

fn insert_candidate(
    transaction: &Transaction<'_>,
    candidate: &SideraImportCandidate,
    now: i64,
) -> Result<(), String> {
    transaction
        .execute(
            "INSERT INTO review_candidates
             (id, batch_id, row_index, classification, candidate_json, created_at_ms, updated_at_ms)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
            params![
                candidate.id,
                candidate.batch_id,
                candidate.row_index as i64,
                classification_name(&candidate.classification),
                serde_json::to_string(candidate).map_err(store_error)?,
                now
            ],
        )
        .map_err(store_error)?;
    Ok(())
}

fn batch_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<SideraImportReviewBatch> {
    let counts_json: String = row.get(5)?;
    let mut counts: SideraImportReviewCounts =
        serde_json::from_str(&counts_json).map_err(sql_conversion_error)?;
    counts.decided_count = row.get::<_, i64>(17)? as usize;
    let commit_counts_json: Option<String> = row.get(11)?;
    Ok(SideraImportReviewBatch {
        id: row.get(0)?,
        project_id: row.get(1)?,
        file_name: row.get(2)?,
        format: row.get(3)?,
        status: row.get(4)?,
        batch_version: row.get(6)?,
        base_library_revision: row.get(7)?,
        before_library_revision: row.get(8)?,
        after_library_revision: row.get(9)?,
        commit_id: row.get(10)?,
        commit_counts: commit_counts_json
            .map(|value| serde_json::from_str(&value).map_err(sql_conversion_error))
            .transpose()?,
        completed_at_ms: row.get(12)?,
        rolled_back_at_ms: row.get(13)?,
        error_code: row.get(14)?,
        counts,
        created_at_ms: row.get(15)?,
        updated_at_ms: row.get(16)?,
        candidates: Vec::new(),
    })
}

fn candidate_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<SideraImportCandidate> {
    let candidate_json: String = row.get(0)?;
    let mut candidate: SideraImportCandidate =
        serde_json::from_str(&candidate_json).map_err(sql_conversion_error)?;
    let decision_kind: Option<String> = row.get(1)?;
    candidate.decision = decision_kind
        .map(|kind| -> Result<SideraImportDecision, rusqlite::Error> {
            Ok(SideraImportDecision {
                kind: SideraImportDecisionKind::parse(&kind).map_err(sql_conversion_error)?,
                target_paper_id: row.get(2)?,
                note: row.get(3)?,
                updated_at_ms: row.get::<_, Option<i64>>(4)?.unwrap_or_default(),
            })
        })
        .transpose()?;
    Ok(candidate)
}

fn candidate_counts(candidates: &[SideraImportCandidate]) -> SideraImportReviewCounts {
    let mut counts = SideraImportReviewCounts {
        total: candidates.len(),
        ..Default::default()
    };
    for candidate in candidates {
        match candidate.classification {
            SideraImportCandidateClassification::New => counts.new_count += 1,
            SideraImportCandidateClassification::Merge => counts.merge_count += 1,
            SideraImportCandidateClassification::Conflict => counts.conflict_count += 1,
            SideraImportCandidateClassification::Invalid => counts.invalid_count += 1,
        }
        counts.decided_count += usize::from(candidate.decision.is_some());
    }
    counts
}

fn classification_name(value: &SideraImportCandidateClassification) -> &'static str {
    match value {
        SideraImportCandidateClassification::New => "new",
        SideraImportCandidateClassification::Merge => "merge",
        SideraImportCandidateClassification::Conflict => "conflict",
        SideraImportCandidateClassification::Invalid => "invalid",
    }
}

fn evidence(kind: &str, value: &str, label: &str, rank: u8) -> SideraIdentityEvidence {
    SideraIdentityEvidence {
        kind: kind.to_string(),
        value: value.to_string(),
        label: label.to_string(),
        rank,
    }
}

fn add_index(index: &mut HashMap<String, HashSet<String>>, key: &str, id: &str) {
    index
        .entry(key.to_string())
        .or_default()
        .insert(id.to_string());
}

fn normalize_key(value: &str) -> String {
    value
        .trim()
        .to_lowercase()
        .chars()
        .filter(|character| !character.is_whitespace() && !matches!(character, '_' | '-'))
        .collect()
}

fn pick(fields: &HashMap<String, String>, aliases: &[&str]) -> String {
    aliases
        .iter()
        .find_map(|alias| {
            fields
                .get(&normalize_key(alias))
                .filter(|value| !value.trim().is_empty())
        })
        .cloned()
        .unwrap_or_default()
}

fn collapse_whitespace(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn split_authors(value: &str) -> Vec<String> {
    value
        .replace(" and ", ";")
        .split([';', '|'])
        .map(collapse_whitespace)
        .filter(|value| !value.is_empty())
        .collect()
}

fn identity_text(value: &str) -> String {
    value
        .to_lowercase()
        .chars()
        .filter(|character| character.is_alphanumeric())
        .collect()
}

fn normalize_doi(value: &str) -> Option<String> {
    clean_optional(Some(
        value
            .trim()
            .trim_start_matches("doi:")
            .trim_start_matches("DOI:")
            .trim_start_matches("https://doi.org/")
            .trim_start_matches("http://doi.org/")
            .trim_start_matches("https://dx.doi.org/")
            .trim_start_matches("http://dx.doi.org/")
            .trim_end_matches(['.', ',', ';'])
            .to_ascii_lowercase(),
    ))
}

fn canonical_url(value: &str) -> Option<String> {
    crate::research_search::canonicalize_identity_url(value)
        .map(|value| value.trim_end_matches('/').to_string())
}

fn provider_key(source: Option<&str>, record_id: Option<&str>) -> Option<String> {
    let source = identity_text(source?);
    let record_id = identity_text(record_id?);
    (!source.is_empty() && !record_id.is_empty()).then(|| format!("{source}::{record_id}"))
}

fn title_author_year_key(
    title: &str,
    first_author: Option<&str>,
    year: Option<i64>,
) -> Option<String> {
    let author = first_author?;
    let year = year?;
    (!title.is_empty() && !author.is_empty()).then(|| format!("{title}::{author}::{year}"))
}

fn extract_year(value: &str) -> Option<i64> {
    value.as_bytes().windows(4).find_map(|window| {
        std::str::from_utf8(window)
            .ok()?
            .parse::<i64>()
            .ok()
            .filter(|year| (1500..=2300).contains(year))
    })
}

fn clean_optional(value: Option<String>) -> Option<String> {
    value
        .map(|value| collapse_whitespace(&value))
        .filter(|value| !value.is_empty())
}

fn short_hash(value: &str) -> String {
    format!("{:x}", Sha256::digest(value.as_bytes()))[..12].to_string()
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(i64::MAX as u128) as i64
}

fn store_error(error: impl std::fmt::Display) -> String {
    format!("SIDERA_IMPORT_REVIEW_STORE_FAILED:{error}")
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
    use std::path::PathBuf;

    fn root(name: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!("sidera-review-{name}-{}", now_ms()));
        fs::create_dir_all(&path).expect("temp directory");
        path
    }

    fn seed_library(path: &Path) {
        let connection = Connection::open(path).expect("library");
        connection
            .execute_batch(
                "CREATE TABLE papers (
                   id TEXT PRIMARY KEY, project_id TEXT, source TEXT, title TEXT,
                   authors TEXT, year INTEGER, url TEXT, doi TEXT
                 );",
            )
            .expect("schema");
        connection
            .execute(
                "INSERT INTO papers VALUES
                 ('p:WOS-1','p','wos','Known Paper','Alice; Bob',2024,
                  'https://example.org/known','10.1/known')",
                [],
            )
            .expect("seed");
    }

    fn normalized_candidate(id: &str, title: &str) -> SideraNormalizedImportCandidate {
        SideraNormalizedImportCandidate {
            id: id.to_string(),
            title: title.to_string(),
            authors: vec!["Alice".to_string(), "Bob".to_string()],
            year: Some(2024),
            record_type: Some("journal-article".to_string()),
            venue: Some("Journal of Tests".to_string()),
            doi: Some("10.1/known".to_string()),
            provider_record_id: Some("WOS-1".to_string()),
            canonical_locator: Some(
                "https://example.org/known?record=1&ticket=secret&session_id=hidden#record"
                    .to_string(),
            ),
            abstract_text: Some("Evidence abstract".to_string()),
            source: Some("academic-discovery".to_string()),
            source_database: Some("wos".to_string()),
            full_text: Some(SideraImportFullText {
                status: Some("available".to_string()),
                locator: Some("opaque-fulltext-1".to_string()),
            }),
            provenance: serde_json::json!({
                "institutionId": "whu",
                "adapterId": "whu-academic-discovery-v1"
            }),
        }
    }

    fn memory_input(
        generation: u64,
        candidates: Vec<SideraNormalizedImportCandidate>,
    ) -> SideraInMemoryImportReviewInput {
        SideraInMemoryImportReviewInput {
            search_id: "search-opaque-1".to_string(),
            generation,
            connector_version: "whu-academic-discovery-v1".to_string(),
            query: "machine learning".to_string(),
            candidates,
        }
    }

    #[test]
    fn parses_all_six_supported_formats_without_mutating_library() {
        let root = root("formats");
        let library = root.join("research-hotspots-v7.sqlite");
        seed_library(&library);
        let fixtures = [
            (
                "a.csv",
                "title,authors,year,doi\nKnown Paper,Alice,2024,10.1/known\n",
            ),
            (
                "a.json",
                r#"[{"title":"JSON Paper","authors":"B","year":2023,"doi":"10.1/json"}]"#,
            ),
            (
                "a.jsonl",
                "{\"title\":\"JSONL Paper\",\"authors\":\"C\",\"year\":2022}\n",
            ),
            (
                "a.ndjson",
                "{\"title\":\"NDJSON Paper\",\"authors\":\"D\",\"year\":2021}\n",
            ),
            (
                "a.bib",
                "@article{k, title={Bib Paper}, author={E}, year={2020}, doi={10.1/bib}}",
            ),
            (
                "a.ris",
                "TY  - JOUR\nTI  - RIS Paper\nAU  - F\nPY  - 2019\nDO  - 10.1/ris\nER  -\n",
            ),
        ];
        for (name, content) in fixtures {
            let path = root.join(name);
            fs::write(&path, content).expect("fixture");
            let batch = create_review_batch(
                &root.join("Sidera/import-review-v1.sqlite"),
                &library,
                "p",
                &path,
            )
            .unwrap_or_else(|error| panic!("{name}: {error}"));
            assert!(!batch.candidates.is_empty(), "{name}");
        }
        let connection = Connection::open(&library).expect("library reopen");
        let count: i64 = connection
            .query_row("SELECT COUNT(*) FROM papers", [], |row| row.get(0))
            .expect("count");
        assert_eq!(count, 1);
    }

    #[test]
    fn classification_and_decisions_survive_reopen() {
        let root = root("identity");
        let library = root.join("research-hotspots-v7.sqlite");
        seed_library(&library);
        let file = root.join("papers.csv");
        fs::write(
            &file,
            "title,authors,year,doi,source,id\nKnown Paper,Alice,2024,10.1/known,wos,WOS-1\nDifferent,Zed,2024,10.1/known,wos,OTHER\nNew Paper,Nia,2025,10.1/new,wos,N-1\nMissing,,,,,\n",
        )
        .expect("fixture");
        let store = root.join("Sidera/import-review-v1.sqlite");
        let batch = create_review_batch(&store, &library, "p", &file).expect("batch");
        assert_eq!(batch.counts.merge_count, 1);
        assert_eq!(batch.counts.conflict_count, 1);
        assert_eq!(batch.counts.new_count, 1);
        assert_eq!(batch.counts.invalid_count, 1);
        let candidate = batch
            .candidates
            .iter()
            .find(|candidate| candidate.classification == SideraImportCandidateClassification::New)
            .expect("new candidate");
        save_review_decision(
            &store,
            "p",
            &batch.id,
            &candidate.id,
            Some(SideraImportDecisionKind::AcceptNew),
            None,
            Some("reviewed".to_string()),
        )
        .expect("decision");
        let reopened = open_review_batch(&store, "p", &batch.id).expect("reopen");
        assert_eq!(reopened.counts.decided_count, 1);
    }

    #[test]
    fn damaged_files_and_projects_are_isolated() {
        let root = root("isolation");
        let library = root.join("research-hotspots-v7.sqlite");
        seed_library(&library);
        let store = root.join("Sidera/import-review-v1.sqlite");
        let broken = root.join("broken.json");
        fs::write(&broken, "{").expect("broken fixture");
        assert!(create_review_batch(&store, &library, "p", &broken).is_err());
        let valid = root.join("valid.csv");
        fs::write(&valid, "title,authors,year\nA,Alice,2024\n").expect("valid fixture");
        create_review_batch(&store, &library, "p", &valid).expect("p batch");
        create_review_batch(&store, &library, "other", &valid).expect("other batch");
        assert_eq!(list_review_batches(&store, "p").expect("p list").len(), 1);
        assert_eq!(
            list_review_batches(&store, "other")
                .expect("other list")
                .len(),
            1
        );
    }

    #[test]
    fn in_memory_candidates_preserve_provenance_and_survive_reopen_without_library_writes() {
        let root = root("memory-provenance");
        let library = root.join("research-hotspots-v7.sqlite");
        seed_library(&library);
        let library_before = fs::read(&library).expect("library before");
        let store = root.join("Sidera/import-review-v1.sqlite");

        let batch = create_review_batch_from_candidates(
            &store,
            &library,
            "p",
            memory_input(1, vec![normalized_candidate("result-1", "Known Paper")]),
        )
        .expect("memory batch");
        assert_eq!(batch.format, "institution-snapshot");
        assert_eq!(batch.counts.merge_count, 1);
        let candidate = &batch.candidates[0];
        assert_eq!(candidate.record_type.as_deref(), Some("journal-article"));
        assert_eq!(
            candidate.canonical_url.as_deref(),
            Some("https://example.org/known?record=1")
        );
        assert_eq!(
            candidate.canonical_locator.as_deref(),
            Some("https://example.org/known?record=1")
        );
        let persisted = serde_json::to_string(candidate).expect("candidate serialization");
        assert!(!persisted.contains("ticket"));
        assert!(!persisted.contains("session_id"));
        assert!(!persisted.contains("secret"));
        assert_eq!(
            candidate
                .full_text
                .as_ref()
                .and_then(|value| value.locator.as_deref()),
            Some("opaque-fulltext-1")
        );
        let provenance = candidate.provenance.as_ref().expect("provenance");
        assert_eq!(provenance.search_id, "search-opaque-1");
        assert_eq!(provenance.generation, 1);
        assert_eq!(provenance.result_id, "result-1");
        assert_eq!(
            provenance.payload.get("institutionId"),
            Some(&serde_json::json!("whu"))
        );
        assert_eq!(
            candidate
                .identity_evidence
                .iter()
                .map(|value| value.kind.as_str())
                .collect::<Vec<_>>(),
            vec![
                "doi",
                "provider-record",
                "canonical-url",
                "title-author-year"
            ]
        );

        let reopened = open_review_batch(&store, "p", &batch.id).expect("reopen");
        assert_eq!(reopened.candidates[0].provenance, candidate.provenance);
        assert_eq!(fs::read(&library).expect("library after"), library_before);
        let connection = Connection::open(&store).expect("review store");
        assert_eq!(
            connection
                .query_row("PRAGMA user_version", [], |row| row.get::<_, i64>(0))
                .expect("schema version"),
            3
        );
    }

    #[test]
    fn in_memory_batches_reject_duplicate_ids_and_stale_generations_across_reopen() {
        let root = root("memory-generation");
        let library = root.join("research-hotspots-v7.sqlite");
        seed_library(&library);
        let store = root.join("Sidera/import-review-v1.sqlite");
        let duplicate = memory_input(
            1,
            vec![
                normalized_candidate("same", "First"),
                normalized_candidate(" same ", "Second"),
            ],
        );
        assert_eq!(
            create_review_batch_from_candidates(&store, &library, "p", duplicate)
                .expect_err("duplicate result id"),
            "SIDERA_IMPORT_REVIEW_RESULT_ID_DUPLICATE"
        );

        create_review_batch_from_candidates(
            &store,
            &library,
            "p",
            memory_input(2, vec![normalized_candidate("result-2", "Known Paper")]),
        )
        .expect("generation two");
        drop(Connection::open(&store).expect("simulate restart"));
        assert_eq!(
            create_review_batch_from_candidates(
                &store,
                &library,
                "p",
                memory_input(1, vec![normalized_candidate("result-1", "Known Paper")]),
            )
            .expect_err("stale generation"),
            "SIDERA_IMPORT_REVIEW_SEARCH_GENERATION_STALE"
        );
        assert_eq!(
            create_review_batch_from_candidates(
                &store,
                &library,
                "p",
                memory_input(2, vec![normalized_candidate("result-3", "Known Paper")]),
            )
            .expect_err("duplicate generation"),
            "SIDERA_IMPORT_REVIEW_SEARCH_GENERATION_STALE"
        );
        assert_eq!(list_review_batches(&store, "p").expect("list").len(), 1);
    }

    #[test]
    fn migrates_v2_review_store_in_place_and_preserves_rows() {
        let root = root("migrate-v2");
        let store = root.join("Sidera/import-review-v1.sqlite");
        fs::create_dir_all(store.parent().expect("parent")).expect("store parent");
        let connection = Connection::open(&store).expect("v2 store");
        connection
            .execute_batch(
                "CREATE TABLE review_batches (
                   id TEXT PRIMARY KEY, project_id TEXT NOT NULL, file_name TEXT NOT NULL,
                   file_path TEXT NOT NULL, format TEXT NOT NULL, status TEXT NOT NULL,
                   counts_json TEXT NOT NULL, created_at_ms INTEGER NOT NULL,
                   updated_at_ms INTEGER NOT NULL
                 );
                 CREATE TABLE review_candidates (
                   id TEXT PRIMARY KEY, batch_id TEXT NOT NULL,
                   row_index INTEGER NOT NULL, classification TEXT NOT NULL,
                   candidate_json TEXT NOT NULL, decision_kind TEXT,
                   decision_target_paper_id TEXT, decision_note TEXT,
                   decision_updated_at_ms INTEGER, created_at_ms INTEGER NOT NULL,
                   updated_at_ms INTEGER NOT NULL
                 );
                 CREATE TABLE review_search_generations (
                   project_id TEXT NOT NULL, search_id TEXT NOT NULL,
                   generation INTEGER NOT NULL, batch_id TEXT NOT NULL UNIQUE,
                   connector_version TEXT NOT NULL, query TEXT NOT NULL,
                   updated_at_ms INTEGER NOT NULL,
                   PRIMARY KEY(project_id, search_id)
                 );
                 INSERT INTO review_batches
                   (id,project_id,file_name,file_path,format,status,counts_json,
                    created_at_ms,updated_at_ms)
                 VALUES('legacy','p','legacy.csv','legacy.csv','csv','active',
                        '{\"total\":0,\"newCount\":0,\"mergeCount\":0,\"conflictCount\":0,
                          \"invalidCount\":0,\"decidedCount\":0}',1,1);
                 PRAGMA user_version=2;",
            )
            .expect("v2 schema");
        drop(connection);

        let migrated = open_store(&store).expect("migrate");
        assert_eq!(
            migrated
                .query_row("PRAGMA user_version", [], |row| row.get::<_, i64>(0))
                .expect("version"),
            3
        );
        let row = migrated
            .query_row(
                "SELECT status,batch_version,base_library_revision,commit_id,error_code
                 FROM review_batches WHERE id='legacy'",
                [],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, i64>(1)?,
                        row.get::<_, Option<i64>>(2)?,
                        row.get::<_, Option<String>>(3)?,
                        row.get::<_, Option<String>>(4)?,
                    ))
                },
            )
            .expect("legacy row");
        assert_eq!(row, ("active".to_string(), 1, None, None, None));
    }

    #[test]
    fn prepared_review_batches_support_query_only_reads() {
        let root = root("query-only-review");
        let library = root.join("research-hotspots-v7.sqlite");
        seed_library(&library);
        let store = root.join("Sidera/import-review-v1.sqlite");
        let batch = create_review_batch_from_candidates(
            &store,
            &library,
            "p",
            memory_input(
                1,
                vec![normalized_candidate("read-only", "Read Only Candidate")],
            ),
        )
        .expect("prepared batch");

        let connection = open_store_read_only(&store).expect("read-only store");
        assert_eq!(
            connection
                .pragma_query_value(None, "query_only", |row| row.get::<_, i64>(0))
                .expect("query-only pragma"),
            1
        );
        assert!(connection
            .execute("UPDATE review_batches SET status='discarded'", [])
            .is_err());
        drop(connection);

        let reopened =
            open_review_batch_read_only(&store, "p", &batch.id).expect("read-only batch");
        assert_eq!(reopened.status, "active");
        assert_eq!(reopened.candidates.len(), 1);
    }

    #[test]
    fn decisions_increment_version_and_terminal_batches_are_frozen() {
        let root = root("freeze");
        let library = root.join("research-hotspots-v7.sqlite");
        seed_library(&library);
        let store = root.join("Sidera/import-review-v1.sqlite");
        let file = root.join("new.csv");
        fs::write(
            &file,
            "title,authors,year,doi\nNew Paper,Nia,2025,10.1/new\n",
        )
        .expect("fixture");
        let batch = create_review_batch(&store, &library, "p", &file).expect("batch");
        let candidate = &batch.candidates[0];
        let decided = save_review_decision(
            &store,
            "p",
            &batch.id,
            &candidate.id,
            Some(SideraImportDecisionKind::AcceptNew),
            None,
            None,
        )
        .expect("decision");
        assert_eq!(decided.batch_version, 2);

        let connection = open_store(&store).expect("store");
        connection
            .execute(
                "UPDATE review_batches SET status='committed' WHERE id=?1",
                params![batch.id],
            )
            .expect("freeze committed");
        drop(connection);
        assert_eq!(
            save_review_decision(
                &store,
                "p",
                &batch.id,
                &candidate.id,
                Some(SideraImportDecisionKind::Skip),
                None,
                None,
            )
            .expect_err("committed batch frozen"),
            "SIDERA_IMPORT_REVIEW_BATCH_FROZEN"
        );
        assert_eq!(
            discard_review_batch(&store, "p", &batch.id).expect_err("committed discard frozen"),
            "SIDERA_IMPORT_REVIEW_BATCH_FROZEN"
        );
    }

    #[test]
    fn frozen_batch_copy_preserves_candidates_and_clears_commit_and_decision_state() {
        let root = root("copy-frozen");
        let library = root.join("research-hotspots-v7.sqlite");
        seed_library(&library);
        let store = root.join("Sidera/import-review-v1.sqlite");
        let source = create_review_batch_from_candidates(
            &store,
            &library,
            "p",
            memory_input(
                7,
                vec![normalized_candidate("copy-result", "Copy Candidate")],
            ),
        )
        .expect("source batch");
        let decided = save_review_decision(
            &store,
            "p",
            &source.id,
            &source.candidates[0].id,
            Some(SideraImportDecisionKind::AcceptNew),
            None,
            Some("source decision".to_string()),
        )
        .expect("source decision");
        let connection = open_store(&store).expect("store");
        connection
            .execute(
                "UPDATE review_batches SET status='committed',base_library_revision=4,
                   before_library_revision=4,after_library_revision=5,
                   commit_id='commit-source',commit_counts_json='{}',
                   completed_at_ms=99,error_code='old-error' WHERE id=?1",
                params![decided.id],
            )
            .expect("freeze source");
        drop(connection);

        let copied = copy_frozen_review_batch(SideraImportReviewCopyInput {
            review_database: store.clone(),
            project_id: "p".to_string(),
            source_batch_id: decided.id.clone(),
        })
        .expect("copy frozen batch");
        assert_ne!(copied.id, decided.id);
        assert_eq!(copied.project_id, "p");
        assert_eq!(copied.status, "active");
        assert_eq!(copied.batch_version, 1);
        assert_eq!(copied.base_library_revision, None);
        assert_eq!(copied.before_library_revision, None);
        assert_eq!(copied.after_library_revision, None);
        assert_eq!(copied.commit_id, None);
        assert_eq!(copied.commit_counts, None);
        assert_eq!(copied.completed_at_ms, None);
        assert_eq!(copied.rolled_back_at_ms, None);
        assert_eq!(copied.error_code, None);
        assert_eq!(copied.counts.decided_count, 0);
        assert_eq!(copied.candidates.len(), 1);
        assert_ne!(copied.candidates[0].id, decided.candidates[0].id);
        assert_eq!(copied.candidates[0].batch_id, copied.id);
        assert_eq!(copied.candidates[0].title, decided.candidates[0].title);
        assert_eq!(
            copied.candidates[0].identity_evidence,
            decided.candidates[0].identity_evidence
        );
        assert_eq!(
            copied.candidates[0].provenance,
            decided.candidates[0].provenance
        );
        assert!(copied.candidates[0].decision.is_none());

        let source_after = open_review_batch(&store, "p", &decided.id).expect("source after");
        assert_eq!(source_after.status, "committed");
        assert_eq!(source_after.commit_id.as_deref(), Some("commit-source"));
        assert!(source_after.candidates[0].decision.is_some());
    }

    #[test]
    fn frozen_batch_copy_accepts_rolled_back_and_rejects_active_or_cross_project_sources() {
        let root = root("copy-boundaries");
        let library = root.join("research-hotspots-v7.sqlite");
        seed_library(&library);
        let store = root.join("Sidera/import-review-v1.sqlite");
        let source = create_review_batch_from_candidates(
            &store,
            &library,
            "p",
            memory_input(
                3,
                vec![normalized_candidate("boundary", "Boundary Candidate")],
            ),
        )
        .expect("source batch");
        assert_eq!(
            copy_frozen_review_batch(SideraImportReviewCopyInput {
                review_database: store.clone(),
                project_id: "p".to_string(),
                source_batch_id: source.id.clone(),
            })
            .expect_err("active source rejected"),
            "SIDERA_IMPORT_REVIEW_COPY_SOURCE_NOT_FROZEN"
        );
        assert_eq!(
            copy_frozen_review_batch(SideraImportReviewCopyInput {
                review_database: store.clone(),
                project_id: "other".to_string(),
                source_batch_id: source.id.clone(),
            })
            .expect_err("cross-project source rejected"),
            "SIDERA_IMPORT_REVIEW_BATCH_NOT_FOUND"
        );
        let connection = open_store(&store).expect("store");
        connection
            .execute(
                "UPDATE review_batches SET status='rolled-back',commit_id='commit-old',
                   rolled_back_at_ms=101 WHERE id=?1",
                params![source.id],
            )
            .expect("roll back source");
        drop(connection);
        let copied = copy_frozen_review_batch(SideraImportReviewCopyInput {
            review_database: store,
            project_id: "p".to_string(),
            source_batch_id: source.id,
        })
        .expect("rolled-back source copied");
        assert_eq!(copied.status, "active");
        assert_eq!(copied.commit_id, None);
        assert_eq!(copied.rolled_back_at_ms, None);
    }
}
