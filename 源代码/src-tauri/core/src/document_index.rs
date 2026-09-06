use std::cmp::Ordering;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::Duration;

use rusqlite::{params, Connection, OpenFlags, OptionalExtension, TransactionBehavior};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::document_derived::{
    document_derived_database_path, document_reader_manifest, evidence_anchor_from_page,
    prepare_document_derived_index_schema, validate_document_derived_index_schema,
    SideraDocumentEvidenceAnchor, SideraDocumentPageText, SideraDocumentPageTextSpan,
    SideraDocumentParseState, SideraDocumentReaderQuery, DOCUMENT_DERIVED_SCHEMA_VERSION,
};
use crate::document_evidence::{document_source_preference, SideraDocumentEvidenceQuery};
use crate::document_ocr::document_ocr_page_text;
use crate::semantic_layout::{
    decode_float16_le, encode_float16_le, SEMANTIC_EMBEDDING_DIMENSIONS, SEMANTIC_MODEL_ID,
    SEMANTIC_MODEL_REVISION,
};

pub const DOCUMENT_INDEX_SEGMENT_UTF16: u32 = 800;
pub const DOCUMENT_INDEX_SEGMENT_OVERLAP_UTF16: u32 = 120;
pub const DOCUMENT_INDEX_MAX_SEGMENTS: usize = 20_000;
const DOCUMENT_INDEX_RRF_K: f64 = 60.0;
const DOCUMENT_INDEX_RRF_LEXICAL_WEIGHT: f64 = 0.45;
const DOCUMENT_INDEX_RRF_SEMANTIC_WEIGHT: f64 = 0.55;
const DOCUMENT_INDEX_TERMINAL_RETENTION: i64 = 3;

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SideraDocumentIndexMode {
    Auto,
    Lexical,
    Hybrid,
}

impl SideraDocumentIndexMode {
    fn as_str(self) -> &'static str {
        match self {
            Self::Auto => "auto",
            Self::Lexical => "lexical",
            Self::Hybrid => "hybrid",
        }
    }

    fn from_str(value: &str) -> Result<Self, String> {
        match value {
            "auto" => Ok(Self::Auto),
            "lexical" => Ok(Self::Lexical),
            "hybrid" => Ok(Self::Hybrid),
            _ => Err("SIDERA_DOCUMENT_INDEX_MODE_INVALID".to_string()),
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SideraDocumentIndexState {
    Queued,
    Running,
    Paused,
    Ready,
    Failed,
    Cancelled,
    Superseded,
}

impl SideraDocumentIndexState {
    fn from_str(value: &str) -> Result<Self, String> {
        match value {
            "queued" => Ok(Self::Queued),
            "running" => Ok(Self::Running),
            "paused" => Ok(Self::Paused),
            "ready" => Ok(Self::Ready),
            "failed" => Ok(Self::Failed),
            "cancelled" => Ok(Self::Cancelled),
            "superseded" => Ok(Self::Superseded),
            _ => Err("SIDERA_DOCUMENT_INDEX_STATE_INVALID".to_string()),
        }
    }
}

#[derive(Clone, Debug)]
pub struct SideraDocumentIndexQuery {
    pub library_directory: PathBuf,
    pub project_id: String,
    pub paper_id: String,
    pub document_version_id: String,
}

#[derive(Clone, Debug)]
pub struct SideraDocumentIndexStartInput {
    pub query: SideraDocumentIndexQuery,
    pub requested_mode: SideraDocumentIndexMode,
    pub now_ms: i64,
}

#[derive(Clone, Debug)]
pub struct SideraDocumentIndexJobQuery {
    pub query: SideraDocumentIndexQuery,
    pub job_id: String,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SideraDocumentIndexSnapshot {
    pub job_id: String,
    pub project_id: String,
    pub paper_id: String,
    pub document_version_id: String,
    pub document_sha256: String,
    pub parse_run_id: String,
    pub requested_mode: SideraDocumentIndexMode,
    pub resolved_mode: Option<SideraDocumentIndexMode>,
    pub state: SideraDocumentIndexState,
    pub stage: String,
    pub segment_count: u32,
    pub embedded_count: u32,
    pub model_id: String,
    pub model_revision: String,
    pub fallback_reason: Option<String>,
    pub error_code: Option<String>,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
    pub finished_at_ms: Option<i64>,
}

#[derive(Clone, Debug)]
pub struct SideraDocumentIndexSegmentDocument {
    pub segment_id: String,
    pub text: String,
    pub content_sha256: String,
}

#[derive(Clone, Debug)]
struct PreparedDocumentIndexSegment {
    segment_id: String,
    page_index: u32,
    source_kind: String,
    start_offset_utf16: u32,
    end_offset_utf16: u32,
    text: String,
    text_sha256: String,
    anchor_json: String,
}

#[derive(Clone, Debug)]
pub struct SideraDocumentSegmentEmbeddingInput {
    pub segment_id: String,
    pub content_sha256: String,
    pub vector: Vec<f32>,
}

#[derive(Clone, Debug)]
pub struct SideraDocumentIndexSearchInput {
    pub query: SideraDocumentIndexQuery,
    pub text: String,
    pub requested_mode: SideraDocumentIndexMode,
    pub query_embedding: Option<Vec<f32>>,
    pub query_fallback_reason: Option<String>,
    pub limit: u32,
    pub offset: u32,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SideraDocumentIndexSearchHit {
    pub segment_id: String,
    pub page_index: u32,
    pub excerpt: String,
    pub score: f64,
    pub lexical_score: Option<f64>,
    pub semantic_score: Option<f64>,
    pub anchor: SideraDocumentEvidenceAnchor,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SideraDocumentIndexSearchResult {
    pub job_id: String,
    pub requested_mode: SideraDocumentIndexMode,
    pub resolved_mode: SideraDocumentIndexMode,
    pub fallback_reason: Option<String>,
    pub total: u32,
    pub offset: u32,
    pub limit: u32,
    pub hits: Vec<SideraDocumentIndexSearchHit>,
}

fn sha256_hex(bytes: &[u8]) -> String {
    let mut digest = Sha256::new();
    digest.update(bytes);
    format!("{:x}", digest.finalize())
}

fn stable_id(prefix: &str, parts: &[&str]) -> String {
    let mut digest = Sha256::new();
    for part in parts {
        digest.update(part.as_bytes());
        digest.update([0]);
    }
    format!("{prefix}-{}", &format!("{:x}", digest.finalize())[..24])
}

fn clean_identity(value: &str, code: &str) -> Result<String, String> {
    let value = value.trim();
    if value.is_empty() || value.len() > 256 {
        return Err(code.to_string());
    }
    Ok(value.to_string())
}

fn canonical_query(query: SideraDocumentIndexQuery) -> Result<SideraDocumentIndexQuery, String> {
    Ok(SideraDocumentIndexQuery {
        library_directory: query.library_directory,
        project_id: clean_identity(&query.project_id, "SIDERA_DOCUMENT_PROJECT_INVALID")?,
        paper_id: clean_identity(&query.paper_id, "SIDERA_DOCUMENT_PAPER_INVALID")?,
        document_version_id: clean_identity(
            &query.document_version_id,
            "SIDERA_DOCUMENT_VERSION_INVALID",
        )?,
    })
}

fn reader_query(query: &SideraDocumentIndexQuery) -> SideraDocumentReaderQuery {
    SideraDocumentReaderQuery {
        library_directory: query.library_directory.clone(),
        project_id: query.project_id.clone(),
        paper_id: query.paper_id.clone(),
        document_version_id: query.document_version_id.clone(),
    }
}

fn configure_write(connection: &Connection) -> Result<(), String> {
    connection
        .busy_timeout(Duration::from_secs(2))
        .map_err(|_| "SIDERA_DOCUMENT_INDEX_PRAGMA_FAILED".to_string())?;
    connection
        .execute_batch("PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;")
        .map_err(|_| "SIDERA_DOCUMENT_INDEX_PRAGMA_FAILED".to_string())
}

fn validate_schema(connection: &Connection) -> Result<(), String> {
    let version: i64 = connection
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(|_| "SIDERA_DOCUMENT_DERIVED_VERSION_FAILED".to_string())?;
    if version != DOCUMENT_DERIVED_SCHEMA_VERSION {
        return Err(if version > DOCUMENT_DERIVED_SCHEMA_VERSION {
            "SIDERA_DOCUMENT_DERIVED_TOO_NEW".to_string()
        } else {
            "SIDERA_DOCUMENT_DERIVED_NOT_PREPARED".to_string()
        });
    }
    validate_document_derived_index_schema(connection)
}

fn open_write(library_directory: &Path) -> Result<Connection, String> {
    prepare_document_derived_index_schema(library_directory)?;
    let connection = Connection::open_with_flags(
        document_derived_database_path(library_directory),
        OpenFlags::SQLITE_OPEN_READ_WRITE,
    )
    .map_err(|_| "SIDERA_DOCUMENT_DERIVED_OPEN_FAILED".to_string())?;
    configure_write(&connection)?;
    validate_schema(&connection)?;
    Ok(connection)
}

fn open_read(library_directory: &Path) -> Result<Connection, String> {
    let path = document_derived_database_path(library_directory);
    if !path.is_file() {
        return Err("SIDERA_DOCUMENT_DERIVED_NOT_PREPARED".to_string());
    }
    let connection = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|_| "SIDERA_DOCUMENT_DERIVED_OPEN_FAILED".to_string())?;
    connection
        .pragma_update(None, "query_only", true)
        .map_err(|_| "SIDERA_DOCUMENT_INDEX_PRAGMA_FAILED".to_string())?;
    validate_schema(&connection)?;
    Ok(connection)
}

fn snapshot_from_connection(
    connection: &Connection,
    job_id: &str,
) -> Result<SideraDocumentIndexSnapshot, String> {
    let row = connection
        .query_row(
            "SELECT id,project_id,paper_id,document_version_id,document_sha256,run_id,
                    requested_mode,resolved_mode,state,stage,segment_count,embedded_count,
                    model_id,model_revision,fallback_reason,error_code,created_at_ms,updated_at_ms,
                    finished_at_ms
             FROM document_index_jobs WHERE id=?1",
            [job_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, String>(6)?,
                    row.get::<_, Option<String>>(7)?,
                    row.get::<_, String>(8)?,
                    row.get::<_, String>(9)?,
                    row.get::<_, i64>(10)?,
                    row.get::<_, i64>(11)?,
                    row.get::<_, String>(12)?,
                    row.get::<_, String>(13)?,
                    row.get::<_, Option<String>>(14)?,
                    row.get::<_, Option<String>>(15)?,
                    row.get::<_, i64>(16)?,
                    row.get::<_, i64>(17)?,
                    row.get::<_, Option<i64>>(18)?,
                ))
            },
        )
        .optional()
        .map_err(|_| "SIDERA_DOCUMENT_INDEX_READ_FAILED".to_string())?
        .ok_or_else(|| "SIDERA_DOCUMENT_INDEX_JOB_NOT_FOUND".to_string())?;
    Ok(SideraDocumentIndexSnapshot {
        job_id: row.0,
        project_id: row.1,
        paper_id: row.2,
        document_version_id: row.3,
        document_sha256: row.4,
        parse_run_id: row.5,
        requested_mode: SideraDocumentIndexMode::from_str(&row.6)?,
        resolved_mode: row
            .7
            .as_deref()
            .map(SideraDocumentIndexMode::from_str)
            .transpose()?,
        state: SideraDocumentIndexState::from_str(&row.8)?,
        stage: row.9,
        segment_count: row.10.max(0) as u32,
        embedded_count: row.11.max(0) as u32,
        model_id: row.12,
        model_revision: row.13,
        fallback_reason: row.14,
        error_code: row.15,
        created_at_ms: row.16,
        updated_at_ms: row.17,
        finished_at_ms: row.18,
    })
}

fn validate_job_fence(
    snapshot: &SideraDocumentIndexSnapshot,
    query: &SideraDocumentIndexJobQuery,
) -> Result<(), String> {
    if snapshot.project_id != query.query.project_id
        || snapshot.paper_id != query.query.paper_id
        || snapshot.document_version_id != query.query.document_version_id
    {
        return Err("SIDERA_DOCUMENT_INDEX_FENCE_MISMATCH".to_string());
    }
    Ok(())
}

fn validate_latest_ready_parse_fence(
    connection: &Connection,
    document_version_id: &str,
    parse_run_id: &str,
) -> Result<(), String> {
    let latest = connection
        .query_row(
            "SELECT id,state FROM parse_runs WHERE document_version_id=?1
             ORDER BY updated_at_ms DESC,id DESC LIMIT 1",
            [document_version_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .optional()
        .map_err(|_| "SIDERA_DOCUMENT_INDEX_READ_FAILED".to_string())?;
    match latest {
        Some((latest_run_id, state))
            if latest_run_id == parse_run_id
                && parse_state_has_indexable_text(connection, document_version_id, &state)? =>
        {
            Ok(())
        }
        _ => Err("SIDERA_DOCUMENT_INDEX_PARSE_STALE".to_string()),
    }
}

fn parse_state_has_indexable_text(
    connection: &Connection,
    document_version_id: &str,
    state: &str,
) -> Result<bool, String> {
    if state == "ready" {
        return Ok(true);
    }
    if state != "needs-ocr" {
        return Ok(false);
    }
    connection
        .query_row(
            "SELECT EXISTS(
               SELECT 1 FROM document_ocr_active_results active
               JOIN document_ocr_jobs job ON job.id=active.job_id
               WHERE active.document_version_id=?1 AND job.state='ready'
             )",
            [document_version_id],
            |row| row.get::<_, bool>(0),
        )
        .map_err(|_| "SIDERA_DOCUMENT_INDEX_READ_FAILED".to_string())
}

fn page_from_connection(
    connection: &Connection,
    document_version_id: &str,
    document_sha256: &str,
    run_id: &str,
    page_index: u32,
) -> Result<SideraDocumentPageText, String> {
    let page = connection
        .query_row(
            "SELECT page_label,text,text_sha256,text_length_utf16
             FROM document_pages WHERE run_id=?1 AND page_index=?2",
            params![run_id, page_index as i64],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, i64>(3)?,
                ))
            },
        )
        .map_err(|_| "SIDERA_DOCUMENT_INDEX_PAGE_READ_FAILED".to_string())?;
    let mut statement = connection
        .prepare(
            "SELECT text,start_offset_utf16,end_offset_utf16,x,y,width,height
             FROM page_spans WHERE run_id=?1 AND page_index=?2 ORDER BY span_index",
        )
        .map_err(|_| "SIDERA_DOCUMENT_INDEX_PAGE_READ_FAILED".to_string())?;
    let spans = statement
        .query_map(params![run_id, page_index as i64], |row| {
            Ok(SideraDocumentPageTextSpan {
                text: row.get(0)?,
                start_offset_utf16: row.get::<_, i64>(1)?.max(0) as u32,
                end_offset_utf16: row.get::<_, i64>(2)?.max(0) as u32,
                x: row.get(3)?,
                y: row.get(4)?,
                width: row.get(5)?,
                height: row.get(6)?,
            })
        })
        .map_err(|_| "SIDERA_DOCUMENT_INDEX_PAGE_READ_FAILED".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "SIDERA_DOCUMENT_INDEX_PAGE_READ_FAILED".to_string())?;
    Ok(SideraDocumentPageText {
        document_version_id: document_version_id.to_string(),
        document_sha256: document_sha256.to_string(),
        page_index,
        page_label: page.0,
        source_kind: "native".to_string(),
        text: page.1,
        text_sha256: page.2,
        text_length_utf16: page.3.max(0) as u32,
        spans,
    })
}

fn utf16_boundaries(value: &str) -> Vec<u32> {
    let mut boundaries = Vec::with_capacity(value.chars().count() + 1);
    let mut offset = 0_u32;
    boundaries.push(offset);
    for character in value.chars() {
        offset = offset.saturating_add(character.len_utf16() as u32);
        boundaries.push(offset);
    }
    boundaries
}

fn segment_ranges(value: &str) -> Vec<(u32, u32)> {
    let boundaries = utf16_boundaries(value);
    let total = *boundaries.last().unwrap_or(&0);
    if total == 0 {
        return Vec::new();
    }
    let mut ranges = Vec::new();
    let mut start = 0_u32;
    while start < total {
        let target_end = start
            .saturating_add(DOCUMENT_INDEX_SEGMENT_UTF16)
            .min(total);
        let end = boundaries
            .iter()
            .copied()
            .take_while(|value| *value <= target_end)
            .last()
            .unwrap_or(total);
        if end <= start {
            break;
        }
        ranges.push((start, end));
        if end == total {
            break;
        }
        let target_next = end.saturating_sub(DOCUMENT_INDEX_SEGMENT_OVERLAP_UTF16);
        let next = boundaries
            .iter()
            .copied()
            .take_while(|value| *value <= target_next)
            .last()
            .unwrap_or(end);
        start = if next > start { next } else { end };
    }
    ranges
}

fn byte_index_for_utf16(value: &str, target: u32) -> Option<usize> {
    let mut offset = 0_u32;
    for (byte_index, character) in value.char_indices() {
        if offset == target {
            return Some(byte_index);
        }
        offset = offset.checked_add(character.len_utf16() as u32)?;
        if offset > target {
            return None;
        }
    }
    (offset == target).then_some(value.len())
}

fn utf16_slice(value: &str, start: u32, end: u32) -> Option<&str> {
    value.get(byte_index_for_utf16(value, start)?..byte_index_for_utf16(value, end)?)
}

fn supersede_previous_ready_jobs(
    connection: &Connection,
    document_version_id: &str,
    promoted_job_id: &str,
    now_ms: i64,
) -> Result<(), String> {
    connection
        .execute(
            "UPDATE document_index_jobs
             SET state='superseded',error_code='SIDERA_DOCUMENT_INDEX_SUPERSEDED',
                 updated_at_ms=?3,finished_at_ms=?3
             WHERE document_version_id=?1 AND id<>?2 AND state='ready'",
            params![document_version_id, promoted_job_id, now_ms],
        )
        .map_err(|_| "SIDERA_DOCUMENT_INDEX_WRITE_FAILED".to_string())?;
    Ok(())
}

fn prune_rebuildable_terminal_jobs(
    connection: &Connection,
    document_version_id: &str,
) -> Result<(), String> {
    // FTS5 virtual tables cannot declare a foreign key. Clear their rows by job id first;
    // deleting the job then lets the declared job_id foreign keys cascade through segments and
    // embeddings in the same short promotion transaction.
    connection
        .execute(
            "DELETE FROM document_segments_fts
             WHERE job_id IN (
               SELECT id FROM document_index_jobs
               WHERE document_version_id=?1 AND state IN ('failed','cancelled','superseded')
               ORDER BY updated_at_ms DESC,id DESC
               LIMIT -1 OFFSET ?2
             )",
            params![document_version_id, DOCUMENT_INDEX_TERMINAL_RETENTION],
        )
        .map_err(|_| "SIDERA_DOCUMENT_INDEX_GC_FAILED".to_string())?;
    connection
        .execute(
            "DELETE FROM document_index_jobs
             WHERE id IN (
               SELECT id FROM document_index_jobs
               WHERE document_version_id=?1 AND state IN ('failed','cancelled','superseded')
               ORDER BY updated_at_ms DESC,id DESC
               LIMIT -1 OFFSET ?2
             )",
            params![document_version_id, DOCUMENT_INDEX_TERMINAL_RETENTION],
        )
        .map_err(|_| "SIDERA_DOCUMENT_INDEX_GC_FAILED".to_string())?;
    Ok(())
}

pub fn start_document_index(
    input: SideraDocumentIndexStartInput,
) -> Result<SideraDocumentIndexSnapshot, String> {
    let query = canonical_query(input.query)?;
    let manifest = document_reader_manifest(reader_query(&query))?;
    let parse = manifest
        .parse
        .filter(|value| {
            matches!(
                value.state,
                SideraDocumentParseState::Ready | SideraDocumentParseState::NeedsOcr
            )
        })
        .ok_or_else(|| "SIDERA_DOCUMENT_PARSE_NOT_READY".to_string())?;
    let mut connection = open_write(&query.library_directory)?;
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|_| "SIDERA_DOCUMENT_INDEX_TRANSACTION_FAILED".to_string())?;
    validate_latest_ready_parse_fence(&transaction, &query.document_version_id, &parse.run_id)?;
    let active = transaction
        .query_row(
            "SELECT id FROM document_index_jobs
             WHERE document_version_id=?1 AND document_sha256=?2 AND run_id=?3
               AND requested_mode=?4 AND state IN ('queued','running','paused')
             ORDER BY updated_at_ms DESC,id DESC LIMIT 1",
            params![
                query.document_version_id,
                parse.document_sha256,
                parse.run_id,
                input.requested_mode.as_str()
            ],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|_| "SIDERA_DOCUMENT_INDEX_READ_FAILED".to_string())?;
    if let Some(active) = active {
        let snapshot = snapshot_from_connection(&transaction, &active)?;
        transaction
            .commit()
            .map_err(|_| "SIDERA_DOCUMENT_INDEX_TRANSACTION_COMMIT_FAILED".to_string())?;
        return Ok(snapshot);
    }
    let existing = transaction
        .query_row(
            "SELECT id FROM document_index_jobs
             WHERE document_version_id=?1 AND document_sha256=?2 AND run_id=?3
               AND requested_mode=?4 AND state='ready'
             ORDER BY updated_at_ms DESC,id DESC LIMIT 1",
            params![
                query.document_version_id,
                parse.document_sha256,
                parse.run_id,
                input.requested_mode.as_str()
            ],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|_| "SIDERA_DOCUMENT_INDEX_READ_FAILED".to_string())?;
    if let Some(existing) = existing {
        let snapshot = snapshot_from_connection(&transaction, &existing)?;
        transaction
            .commit()
            .map_err(|_| "SIDERA_DOCUMENT_INDEX_TRANSACTION_COMMIT_FAILED".to_string())?;
        return Ok(snapshot);
    }
    transaction
        .execute(
            "UPDATE document_index_jobs SET state='superseded',error_code='SIDERA_DOCUMENT_INDEX_SUPERSEDED',
                    updated_at_ms=?2,finished_at_ms=?2
             WHERE document_version_id=?1 AND state IN ('queued','running','paused')",
            params![query.document_version_id, input.now_ms],
        )
        .map_err(|_| "SIDERA_DOCUMENT_INDEX_WRITE_FAILED".to_string())?;
    let generation: i64 = transaction
        .query_row(
            "SELECT COALESCE(MAX(rowid),0)+1 FROM document_index_jobs",
            [],
            |row| row.get(0),
        )
        .map_err(|_| "SIDERA_DOCUMENT_INDEX_READ_FAILED".to_string())?;
    let job_id = stable_id(
        "doc-index",
        &[
            &query.document_version_id,
            &parse.document_sha256,
            &parse.run_id,
            input.requested_mode.as_str(),
            &input.now_ms.to_string(),
            &generation.to_string(),
        ],
    );
    transaction
        .execute(
            "INSERT INTO document_index_jobs(
               id,project_id,paper_id,document_version_id,document_sha256,run_id,requested_mode,
               resolved_mode,state,stage,segment_count,embedded_count,model_id,model_revision,
               fallback_reason,error_code,created_at_ms,updated_at_ms,finished_at_ms
             ) VALUES(?1,?2,?3,?4,?5,?6,?7,NULL,'running','segmenting',0,0,?8,?9,NULL,NULL,?10,?10,NULL)",
            params![
                job_id,
                query.project_id,
                query.paper_id,
                query.document_version_id,
                parse.document_sha256,
                parse.run_id,
                input.requested_mode.as_str(),
                SEMANTIC_MODEL_ID,
                SEMANTIC_MODEL_REVISION,
                input.now_ms
            ],
        )
        .map_err(|_| "SIDERA_DOCUMENT_INDEX_WRITE_FAILED".to_string())?;
    let snapshot = snapshot_from_connection(&transaction, &job_id)?;
    transaction
        .commit()
        .map_err(|_| "SIDERA_DOCUMENT_INDEX_TRANSACTION_COMMIT_FAILED".to_string())?;
    Ok(snapshot)
}

pub fn complete_document_index_segmenting<F>(
    query: SideraDocumentIndexJobQuery,
    now_ms: i64,
    mut keep_running: F,
) -> Result<SideraDocumentIndexSnapshot, String>
where
    F: FnMut() -> bool,
{
    let query = SideraDocumentIndexJobQuery {
        query: canonical_query(query.query)?,
        job_id: clean_identity(&query.job_id, "SIDERA_DOCUMENT_INDEX_JOB_ID_INVALID")?,
    };
    let initial = document_index_snapshot(query.clone())?;
    if initial.state != SideraDocumentIndexState::Running || initial.stage != "segmenting" {
        return Err("SIDERA_DOCUMENT_INDEX_NOT_SEGMENTING".to_string());
    }
    let manifest = document_reader_manifest(reader_query(&query.query))?;
    let parse = manifest
        .parse
        .filter(|value| {
            matches!(
                value.state,
                SideraDocumentParseState::Ready | SideraDocumentParseState::NeedsOcr
            )
        })
        .ok_or_else(|| "SIDERA_DOCUMENT_PARSE_NOT_READY".to_string())?;
    if parse.run_id != initial.parse_run_id || parse.document_sha256 != initial.document_sha256 {
        return Err("SIDERA_DOCUMENT_INDEX_PARSE_STALE".to_string());
    }
    let connection = open_read(&query.query.library_directory)?;
    validate_latest_ready_parse_fence(
        &connection,
        &initial.document_version_id,
        &initial.parse_run_id,
    )?;
    let mut segments = Vec::new();
    for page_index in 0..parse.expected_page_count {
        if !keep_running() {
            return Err("SIDERA_DOCUMENT_INDEX_SEGMENTING_INTERRUPTED".to_string());
        }
        let native_page = page_from_connection(
            &connection,
            &query.query.document_version_id,
            &parse.document_sha256,
            &parse.run_id,
            page_index,
        )?;
        let has_ready_ocr = connection
            .query_row(
                "SELECT EXISTS(
                   SELECT 1 FROM document_ocr_active_results active
                   JOIN document_ocr_jobs job ON job.id=active.job_id
                   WHERE active.document_version_id=?1 AND active.page_index=?2
                     AND job.state='ready'
                 )",
                params![query.query.document_version_id, page_index as i64],
                |row| row.get::<_, bool>(0),
            )
            .map_err(|_| "SIDERA_DOCUMENT_INDEX_READ_FAILED".to_string())?;
        let page = if !has_ready_ocr {
            native_page
        } else {
            let preference = document_source_preference(
                SideraDocumentEvidenceQuery {
                    library_directory: query.query.library_directory.clone(),
                    project_id: query.query.project_id.clone(),
                    paper_id: query.query.paper_id.clone(),
                    document_version_id: query.query.document_version_id.clone(),
                },
                Some(page_index),
            )?
            .map(|value| value.preference)
            .unwrap_or_else(|| "auto".to_string());
            match preference.as_str() {
                "native" => native_page,
                "ocr" => document_ocr_page_text(reader_query(&query.query), page_index)?,
                "auto" if native_page.text.trim().is_empty() => {
                    document_ocr_page_text(reader_query(&query.query), page_index)?
                }
                "auto" => native_page,
                _ => return Err("SIDERA_DOCUMENT_SOURCE_PREFERENCE_INVALID".to_string()),
            }
        };
        for (start, end) in segment_ranges(&page.text) {
            if segments.len() >= DOCUMENT_INDEX_MAX_SEGMENTS {
                return Err("SIDERA_DOCUMENT_INDEX_SEGMENT_LIMIT_EXCEEDED".to_string());
            }
            if segments.len() % 64 == 0 && !keep_running() {
                return Err("SIDERA_DOCUMENT_INDEX_SEGMENTING_INTERRUPTED".to_string());
            }
            let text = utf16_slice(&page.text, start, end)
                .ok_or_else(|| "SIDERA_DOCUMENT_INDEX_SEGMENT_INVALID".to_string())?
                .trim()
                .to_string();
            if text.is_empty() {
                continue;
            }
            let anchor = evidence_anchor_from_page(&page, start, end)?;
            let text_sha256 = sha256_hex(text.as_bytes());
            let segment_id = stable_id(
                "doc-segment",
                &[
                    &parse.document_sha256,
                    &page_index.to_string(),
                    &page.source_kind,
                    &start.to_string(),
                    &end.to_string(),
                    &text_sha256,
                ],
            );
            segments.push(PreparedDocumentIndexSegment {
                segment_id,
                page_index,
                source_kind: page.source_kind.clone(),
                start_offset_utf16: start,
                end_offset_utf16: end,
                text,
                text_sha256,
                anchor_json: serde_json::to_string(&anchor)
                    .map_err(|_| "SIDERA_DOCUMENT_INDEX_SEGMENT_INVALID".to_string())?,
            });
        }
    }
    drop(connection);
    if !keep_running() {
        return Err("SIDERA_DOCUMENT_INDEX_SEGMENTING_INTERRUPTED".to_string());
    }

    let mut connection = open_write(&query.query.library_directory)?;
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|_| "SIDERA_DOCUMENT_INDEX_TRANSACTION_FAILED".to_string())?;
    let current = snapshot_from_connection(&transaction, &query.job_id)?;
    validate_job_fence(&current, &query)?;
    validate_latest_ready_parse_fence(
        &transaction,
        &current.document_version_id,
        &current.parse_run_id,
    )?;
    if current.state != SideraDocumentIndexState::Running || current.stage != "segmenting" {
        return Err("SIDERA_DOCUMENT_INDEX_NOT_SEGMENTING".to_string());
    }
    transaction
        .execute(
            "DELETE FROM document_segment_embeddings WHERE job_id=?1",
            [&query.job_id],
        )
        .map_err(|_| "SIDERA_DOCUMENT_INDEX_SEGMENT_WRITE_FAILED".to_string())?;
    transaction
        .execute(
            "DELETE FROM document_segments_fts WHERE job_id=?1",
            [&query.job_id],
        )
        .map_err(|_| "SIDERA_DOCUMENT_INDEX_LEXICAL_WRITE_FAILED".to_string())?;
    transaction
        .execute(
            "DELETE FROM document_segments WHERE job_id=?1",
            [&query.job_id],
        )
        .map_err(|_| "SIDERA_DOCUMENT_INDEX_SEGMENT_WRITE_FAILED".to_string())?;
    {
        let mut segment_statement = transaction
            .prepare_cached(
                "INSERT INTO document_segments(
                   job_id,run_id,id,document_version_id,document_sha256,page_index,source_kind,
                   start_offset_utf16,end_offset_utf16,text,text_sha256,anchor_json
                 ) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)",
            )
            .map_err(|_| "SIDERA_DOCUMENT_INDEX_SEGMENT_WRITE_FAILED".to_string())?;
        let mut lexical_statement = transaction
            .prepare_cached(
                "INSERT INTO document_segments_fts(job_id,run_id,segment_id,page_index,text)
                 VALUES(?1,?2,?3,?4,?5)",
            )
            .map_err(|_| "SIDERA_DOCUMENT_INDEX_LEXICAL_WRITE_FAILED".to_string())?;
        for segment in &segments {
            segment_statement
                .execute(params![
                    query.job_id,
                    current.parse_run_id,
                    segment.segment_id,
                    current.document_version_id,
                    current.document_sha256,
                    segment.page_index as i64,
                    segment.source_kind,
                    segment.start_offset_utf16 as i64,
                    segment.end_offset_utf16 as i64,
                    segment.text,
                    segment.text_sha256,
                    segment.anchor_json,
                ])
                .map_err(|_| "SIDERA_DOCUMENT_INDEX_SEGMENT_WRITE_FAILED".to_string())?;
            lexical_statement
                .execute(params![
                    query.job_id,
                    current.parse_run_id,
                    segment.segment_id,
                    segment.page_index.to_string(),
                    segment.text,
                ])
                .map_err(|_| "SIDERA_DOCUMENT_INDEX_LEXICAL_WRITE_FAILED".to_string())?;
        }
    }
    let (state, stage, resolved_mode, finished_at_ms) =
        if current.requested_mode == SideraDocumentIndexMode::Lexical {
            ("ready", "complete", Some("lexical"), Some(now_ms))
        } else {
            ("running", "embedding", None, None)
        };
    transaction
        .execute(
            "UPDATE document_index_jobs SET state=?2,stage=?3,resolved_mode=?4,segment_count=?5,
                    embedded_count=0,updated_at_ms=?6,finished_at_ms=?7 WHERE id=?1",
            params![
                query.job_id,
                state,
                stage,
                resolved_mode,
                segments.len() as i64,
                now_ms,
                finished_at_ms,
            ],
        )
        .map_err(|_| "SIDERA_DOCUMENT_INDEX_WRITE_FAILED".to_string())?;
    if state == "ready" {
        supersede_previous_ready_jobs(
            &transaction,
            &current.document_version_id,
            &query.job_id,
            now_ms,
        )?;
        prune_rebuildable_terminal_jobs(&transaction, &current.document_version_id)?;
    }
    let snapshot = snapshot_from_connection(&transaction, &query.job_id)?;
    transaction
        .commit()
        .map_err(|_| "SIDERA_DOCUMENT_INDEX_TRANSACTION_COMMIT_FAILED".to_string())?;
    Ok(snapshot)
}

pub fn document_index_snapshot(
    query: SideraDocumentIndexJobQuery,
) -> Result<SideraDocumentIndexSnapshot, String> {
    let query = SideraDocumentIndexJobQuery {
        query: canonical_query(query.query)?,
        job_id: clean_identity(&query.job_id, "SIDERA_DOCUMENT_INDEX_JOB_ID_INVALID")?,
    };
    let connection = open_read(&query.query.library_directory)?;
    let snapshot = snapshot_from_connection(&connection, &query.job_id)?;
    validate_job_fence(&snapshot, &query)?;
    Ok(snapshot)
}

pub fn current_document_index(
    query: SideraDocumentIndexQuery,
) -> Result<Option<SideraDocumentIndexSnapshot>, String> {
    let query = canonical_query(query)?;
    if !document_derived_database_path(&query.library_directory).is_file() {
        return Ok(None);
    }
    let connection = open_read(&query.library_directory)?;
    let latest_parse = connection
        .query_row(
            "SELECT id,state,document_sha256 FROM parse_runs
             WHERE project_id=?1 AND paper_id=?2 AND document_version_id=?3
             ORDER BY updated_at_ms DESC,id DESC LIMIT 1",
            params![query.project_id, query.paper_id, query.document_version_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            },
        )
        .optional()
        .map_err(|_| "SIDERA_DOCUMENT_INDEX_READ_FAILED".to_string())?;
    let Some((parse_run_id, parse_state, document_sha256)) = latest_parse else {
        return Ok(None);
    };
    if !parse_state_has_indexable_text(&connection, &query.document_version_id, &parse_state)? {
        return Ok(None);
    }
    let job_id = connection
        .query_row(
            "SELECT id FROM document_index_jobs
             WHERE project_id=?1 AND paper_id=?2 AND document_version_id=?3 AND run_id=?4
               AND state IN ('queued','running','paused','ready')
             ORDER BY CASE state
                        WHEN 'queued' THEN 0 WHEN 'running' THEN 0 WHEN 'paused' THEN 0
                        WHEN 'ready' THEN 1 ELSE 2 END,
                      updated_at_ms DESC,id DESC LIMIT 1",
            params![
                query.project_id,
                query.paper_id,
                query.document_version_id,
                parse_run_id,
            ],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|_| "SIDERA_DOCUMENT_INDEX_READ_FAILED".to_string())?;
    let Some(job_id) = job_id else {
        return Ok(None);
    };
    let snapshot = snapshot_from_connection(&connection, &job_id)?;
    if snapshot.project_id != query.project_id
        || snapshot.paper_id != query.paper_id
        || snapshot.document_version_id != query.document_version_id
        || snapshot.parse_run_id != parse_run_id
        || snapshot.document_sha256 != document_sha256
    {
        return Err("SIDERA_DOCUMENT_INDEX_FENCE_MISMATCH".to_string());
    }
    Ok(Some(snapshot))
}

pub fn document_index_segment_documents(
    query: SideraDocumentIndexJobQuery,
) -> Result<Vec<SideraDocumentIndexSegmentDocument>, String> {
    let snapshot = document_index_snapshot(query.clone())?;
    if snapshot.state != SideraDocumentIndexState::Running || snapshot.stage != "embedding" {
        return Err("SIDERA_DOCUMENT_INDEX_NOT_EMBEDDING".to_string());
    }
    let connection = open_read(&query.query.library_directory)?;
    validate_latest_ready_parse_fence(
        &connection,
        &snapshot.document_version_id,
        &snapshot.parse_run_id,
    )?;
    let mut statement = connection
        .prepare(
            "SELECT segment.id,segment.text,segment.text_sha256
             FROM document_segments segment
             LEFT JOIN document_segment_embeddings embedding
               ON embedding.job_id=segment.job_id AND embedding.segment_id=segment.id
              AND embedding.content_sha256=segment.text_sha256
              AND embedding.model_id=?2 AND embedding.model_revision=?3
             WHERE segment.job_id=?1 AND embedding.segment_id IS NULL
             ORDER BY segment.page_index,segment.start_offset_utf16,segment.id",
        )
        .map_err(|_| "SIDERA_DOCUMENT_INDEX_READ_FAILED".to_string())?;
    let documents = statement
        .query_map(
            params![snapshot.job_id, SEMANTIC_MODEL_ID, SEMANTIC_MODEL_REVISION],
            |row| {
                Ok(SideraDocumentIndexSegmentDocument {
                    segment_id: row.get(0)?,
                    text: row.get(1)?,
                    content_sha256: row.get(2)?,
                })
            },
        )
        .map_err(|_| "SIDERA_DOCUMENT_INDEX_READ_FAILED".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "SIDERA_DOCUMENT_INDEX_READ_FAILED".to_string())?;
    Ok(documents)
}

pub fn submit_document_index_embeddings(
    query: SideraDocumentIndexJobQuery,
    records: &[SideraDocumentSegmentEmbeddingInput],
    now_ms: i64,
) -> Result<SideraDocumentIndexSnapshot, String> {
    if records.is_empty() || records.len() > 256 {
        return Err("SIDERA_DOCUMENT_INDEX_EMBEDDING_BATCH_INVALID".to_string());
    }
    let query = SideraDocumentIndexJobQuery {
        query: canonical_query(query.query)?,
        job_id: clean_identity(&query.job_id, "SIDERA_DOCUMENT_INDEX_JOB_ID_INVALID")?,
    };
    let mut connection = open_write(&query.query.library_directory)?;
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|_| "SIDERA_DOCUMENT_INDEX_TRANSACTION_FAILED".to_string())?;
    let snapshot = snapshot_from_connection(&transaction, &query.job_id)?;
    validate_job_fence(&snapshot, &query)?;
    validate_latest_ready_parse_fence(
        &transaction,
        &snapshot.document_version_id,
        &snapshot.parse_run_id,
    )?;
    if snapshot.state != SideraDocumentIndexState::Running || snapshot.stage != "embedding" {
        return Err("SIDERA_DOCUMENT_INDEX_NOT_EMBEDDING".to_string());
    }
    let mut inserted = 0_i64;
    for record in records {
        if record.vector.len() != SEMANTIC_EMBEDDING_DIMENSIONS
            || record.vector.iter().any(|value| !value.is_finite())
        {
            return Err("SIDERA_DOCUMENT_INDEX_EMBEDDING_DIMENSIONS_MISMATCH".to_string());
        }
        let segment_id = clean_identity(
            &record.segment_id,
            "SIDERA_DOCUMENT_INDEX_SEGMENT_ID_INVALID",
        )?;
        let content_sha256 = clean_identity(
            &record.content_sha256,
            "SIDERA_DOCUMENT_INDEX_CONTENT_HASH_INVALID",
        )?;
        let exists: bool = transaction
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM document_segments
                 WHERE job_id=?1 AND id=?2 AND text_sha256=?3)",
                params![snapshot.job_id, segment_id, content_sha256],
                |row| row.get(0),
            )
            .map_err(|_| "SIDERA_DOCUMENT_INDEX_READ_FAILED".to_string())?;
        if !exists {
            return Err("SIDERA_DOCUMENT_INDEX_SEGMENT_FENCE_MISMATCH".to_string());
        }
        inserted += transaction
            .execute(
                "INSERT OR IGNORE INTO document_segment_embeddings(
                   job_id,run_id,segment_id,content_sha256,model_id,model_revision,dimensions,encoding,
                   vector_blob,created_at_ms
                 ) VALUES(?1,?2,?3,?4,?5,?6,?7,'float16-le',?8,?9)",
                params![
                    snapshot.job_id,
                    snapshot.parse_run_id,
                    segment_id,
                    content_sha256,
                    SEMANTIC_MODEL_ID,
                    SEMANTIC_MODEL_REVISION,
                    SEMANTIC_EMBEDDING_DIMENSIONS as i64,
                    encode_float16_le(&record.vector),
                    now_ms
                ],
            )
            .map_err(|_| "SIDERA_DOCUMENT_INDEX_EMBEDDING_WRITE_FAILED".to_string())?
            as i64;
    }
    transaction
        .execute(
            "UPDATE document_index_jobs SET embedded_count=embedded_count+?2,updated_at_ms=?3
             WHERE id=?1",
            params![query.job_id, inserted, now_ms],
        )
        .map_err(|_| "SIDERA_DOCUMENT_INDEX_WRITE_FAILED".to_string())?;
    let snapshot = snapshot_from_connection(&transaction, &query.job_id)?;
    transaction
        .commit()
        .map_err(|_| "SIDERA_DOCUMENT_INDEX_TRANSACTION_COMMIT_FAILED".to_string())?;
    Ok(snapshot)
}

fn finish_document_index(
    query: SideraDocumentIndexJobQuery,
    mode: SideraDocumentIndexMode,
    fallback_reason: Option<String>,
    error_code: Option<String>,
    now_ms: i64,
) -> Result<SideraDocumentIndexSnapshot, String> {
    if mode == SideraDocumentIndexMode::Auto {
        return Err("SIDERA_DOCUMENT_INDEX_MODE_INVALID".to_string());
    }
    let query = SideraDocumentIndexJobQuery {
        query: canonical_query(query.query)?,
        job_id: clean_identity(&query.job_id, "SIDERA_DOCUMENT_INDEX_JOB_ID_INVALID")?,
    };
    let mut connection = open_write(&query.query.library_directory)?;
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|_| "SIDERA_DOCUMENT_INDEX_TRANSACTION_FAILED".to_string())?;
    let snapshot = snapshot_from_connection(&transaction, &query.job_id)?;
    validate_job_fence(&snapshot, &query)?;
    validate_latest_ready_parse_fence(
        &transaction,
        &snapshot.document_version_id,
        &snapshot.parse_run_id,
    )?;
    if snapshot.state != SideraDocumentIndexState::Running {
        return Ok(snapshot);
    }
    if mode == SideraDocumentIndexMode::Hybrid && snapshot.embedded_count != snapshot.segment_count
    {
        return Err("SIDERA_DOCUMENT_INDEX_EMBEDDING_INCOMPLETE".to_string());
    }
    transaction
        .execute(
            "UPDATE document_index_jobs SET state='ready',stage='complete',resolved_mode=?2,
                    fallback_reason=?3,error_code=?4,updated_at_ms=?5,finished_at_ms=?5 WHERE id=?1",
            params![query.job_id, mode.as_str(), fallback_reason, error_code, now_ms],
        )
        .map_err(|_| "SIDERA_DOCUMENT_INDEX_WRITE_FAILED".to_string())?;
    supersede_previous_ready_jobs(
        &transaction,
        &snapshot.document_version_id,
        &query.job_id,
        now_ms,
    )?;
    prune_rebuildable_terminal_jobs(&transaction, &snapshot.document_version_id)?;
    let snapshot = snapshot_from_connection(&transaction, &query.job_id)?;
    transaction
        .commit()
        .map_err(|_| "SIDERA_DOCUMENT_INDEX_TRANSACTION_COMMIT_FAILED".to_string())?;
    Ok(snapshot)
}

pub fn complete_document_index_hybrid(
    query: SideraDocumentIndexJobQuery,
    now_ms: i64,
) -> Result<SideraDocumentIndexSnapshot, String> {
    finish_document_index(query, SideraDocumentIndexMode::Hybrid, None, None, now_ms)
}

pub fn fallback_document_index_to_lexical(
    query: SideraDocumentIndexJobQuery,
    fallback_reason: String,
    now_ms: i64,
) -> Result<SideraDocumentIndexSnapshot, String> {
    finish_document_index(
        query,
        SideraDocumentIndexMode::Lexical,
        Some(fallback_reason),
        None,
        now_ms,
    )
}

pub fn fail_document_index(
    query: SideraDocumentIndexJobQuery,
    error_code: String,
    now_ms: i64,
) -> Result<SideraDocumentIndexSnapshot, String> {
    let query = SideraDocumentIndexJobQuery {
        query: canonical_query(query.query)?,
        job_id: clean_identity(&query.job_id, "SIDERA_DOCUMENT_INDEX_JOB_ID_INVALID")?,
    };
    let connection = open_write(&query.query.library_directory)?;
    let snapshot = snapshot_from_connection(&connection, &query.job_id)?;
    validate_job_fence(&snapshot, &query)?;
    if snapshot.state == SideraDocumentIndexState::Running {
        connection
            .execute(
                "UPDATE document_index_jobs SET state='failed',error_code=?2,updated_at_ms=?3,
                        finished_at_ms=?3 WHERE id=?1",
                params![query.job_id, error_code, now_ms],
            )
            .map_err(|_| "SIDERA_DOCUMENT_INDEX_WRITE_FAILED".to_string())?;
    }
    snapshot_from_connection(&connection, &query.job_id)
}

pub fn cancel_document_index(
    query: SideraDocumentIndexJobQuery,
    now_ms: i64,
) -> Result<SideraDocumentIndexSnapshot, String> {
    let query = SideraDocumentIndexJobQuery {
        query: canonical_query(query.query)?,
        job_id: clean_identity(&query.job_id, "SIDERA_DOCUMENT_INDEX_JOB_ID_INVALID")?,
    };
    let connection = open_write(&query.query.library_directory)?;
    let snapshot = snapshot_from_connection(&connection, &query.job_id)?;
    validate_job_fence(&snapshot, &query)?;
    if matches!(
        snapshot.state,
        SideraDocumentIndexState::Queued
            | SideraDocumentIndexState::Running
            | SideraDocumentIndexState::Paused
    ) {
        connection
            .execute(
                "UPDATE document_index_jobs SET state='cancelled',error_code='SIDERA_DOCUMENT_INDEX_CANCELLED',
                        updated_at_ms=?2,finished_at_ms=?2 WHERE id=?1",
                params![query.job_id, now_ms],
            )
            .map_err(|_| "SIDERA_DOCUMENT_INDEX_WRITE_FAILED".to_string())?;
    }
    snapshot_from_connection(&connection, &query.job_id)
}

pub fn pause_document_index(
    query: SideraDocumentIndexJobQuery,
    now_ms: i64,
) -> Result<SideraDocumentIndexSnapshot, String> {
    let query = SideraDocumentIndexJobQuery {
        query: canonical_query(query.query)?,
        job_id: clean_identity(&query.job_id, "SIDERA_DOCUMENT_INDEX_JOB_ID_INVALID")?,
    };
    let mut connection = open_write(&query.query.library_directory)?;
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|_| "SIDERA_DOCUMENT_INDEX_TRANSACTION_FAILED".to_string())?;
    let snapshot = snapshot_from_connection(&transaction, &query.job_id)?;
    validate_job_fence(&snapshot, &query)?;
    if snapshot.state == SideraDocumentIndexState::Running
        && matches!(snapshot.stage.as_str(), "segmenting" | "embedding")
    {
        transaction
            .execute(
                "UPDATE document_index_jobs SET state='paused',updated_at_ms=?2 WHERE id=?1",
                params![query.job_id, now_ms],
            )
            .map_err(|_| "SIDERA_DOCUMENT_INDEX_WRITE_FAILED".to_string())?;
    }
    let snapshot = snapshot_from_connection(&transaction, &query.job_id)?;
    transaction
        .commit()
        .map_err(|_| "SIDERA_DOCUMENT_INDEX_TRANSACTION_COMMIT_FAILED".to_string())?;
    Ok(snapshot)
}

pub fn resume_document_index(
    query: SideraDocumentIndexJobQuery,
    now_ms: i64,
) -> Result<SideraDocumentIndexSnapshot, String> {
    let query = SideraDocumentIndexJobQuery {
        query: canonical_query(query.query)?,
        job_id: clean_identity(&query.job_id, "SIDERA_DOCUMENT_INDEX_JOB_ID_INVALID")?,
    };
    let mut connection = open_write(&query.query.library_directory)?;
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|_| "SIDERA_DOCUMENT_INDEX_TRANSACTION_FAILED".to_string())?;
    let snapshot = snapshot_from_connection(&transaction, &query.job_id)?;
    validate_job_fence(&snapshot, &query)?;
    validate_latest_ready_parse_fence(
        &transaction,
        &snapshot.document_version_id,
        &snapshot.parse_run_id,
    )?;
    if snapshot.state == SideraDocumentIndexState::Paused
        && matches!(snapshot.stage.as_str(), "segmenting" | "embedding")
    {
        transaction
            .execute(
                "UPDATE document_index_jobs SET state='running',updated_at_ms=?2 WHERE id=?1",
                params![query.job_id, now_ms],
            )
            .map_err(|_| "SIDERA_DOCUMENT_INDEX_WRITE_FAILED".to_string())?;
    }
    let snapshot = snapshot_from_connection(&transaction, &query.job_id)?;
    transaction
        .commit()
        .map_err(|_| "SIDERA_DOCUMENT_INDEX_TRANSACTION_COMMIT_FAILED".to_string())?;
    Ok(snapshot)
}

fn fts_query(value: &str) -> Result<String, String> {
    let value = value.trim();
    if value.is_empty() || value.len() > 512 {
        return Err("SIDERA_DOCUMENT_INDEX_SEARCH_QUERY_INVALID".to_string());
    }
    Ok(format!("\"{}\"", value.replace('"', "\"\"")))
}

fn excerpt(value: &str) -> String {
    let mut output = value.chars().take(280).collect::<String>();
    if value.chars().count() > 280 {
        output.push('…');
    }
    output
}

fn cosine(left: &[f32], right: &[f32]) -> f64 {
    let mut dot = 0.0_f64;
    let mut left_norm = 0.0_f64;
    let mut right_norm = 0.0_f64;
    for (left, right) in left.iter().zip(right) {
        let left = *left as f64;
        let right = *right as f64;
        dot += left * right;
        left_norm += left * left;
        right_norm += right * right;
    }
    if left_norm <= f64::EPSILON || right_norm <= f64::EPSILON {
        0.0
    } else {
        dot / (left_norm.sqrt() * right_norm.sqrt())
    }
}

fn weighted_rrf_score(lexical_rank: Option<usize>, semantic_rank: Option<usize>) -> f64 {
    lexical_rank
        .map(|rank| DOCUMENT_INDEX_RRF_LEXICAL_WEIGHT / (DOCUMENT_INDEX_RRF_K + rank as f64))
        .unwrap_or(0.0)
        + semantic_rank
            .map(|rank| DOCUMENT_INDEX_RRF_SEMANTIC_WEIGHT / (DOCUMENT_INDEX_RRF_K + rank as f64))
            .unwrap_or(0.0)
}

fn stable_descending_score_order(
    left_score: f64,
    left_page_index: u32,
    left_segment_id: &str,
    right_score: f64,
    right_page_index: u32,
    right_segment_id: &str,
) -> Ordering {
    right_score
        .partial_cmp(&left_score)
        .unwrap_or(Ordering::Equal)
        .then_with(|| left_page_index.cmp(&right_page_index))
        .then_with(|| left_segment_id.cmp(right_segment_id))
}

pub fn search_document_index(
    input: SideraDocumentIndexSearchInput,
) -> Result<SideraDocumentIndexSearchResult, String> {
    let query = canonical_query(input.query)?;
    if input.limit == 0 || input.limit > 100 || input.offset > 10_000 {
        return Err("SIDERA_DOCUMENT_INDEX_SEARCH_PAGE_INVALID".to_string());
    }
    let lexical_query = fts_query(&input.text)?;
    let connection = open_read(&query.library_directory)?;
    let (latest_parse_run_id, latest_parse_state) = connection
        .query_row(
            "SELECT id,state FROM parse_runs
             WHERE project_id=?1 AND paper_id=?2 AND document_version_id=?3
             ORDER BY updated_at_ms DESC,id DESC LIMIT 1",
            params![query.project_id, query.paper_id, query.document_version_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .optional()
        .map_err(|_| "SIDERA_DOCUMENT_INDEX_READ_FAILED".to_string())?
        .ok_or_else(|| "SIDERA_DOCUMENT_PARSE_NOT_READY".to_string())?;
    if !parse_state_has_indexable_text(
        &connection,
        &query.document_version_id,
        &latest_parse_state,
    )? {
        return Err("SIDERA_DOCUMENT_INDEX_PARSE_NOT_READY".to_string());
    }
    let job_id = connection
        .query_row(
            "SELECT id FROM document_index_jobs
             WHERE project_id=?1 AND paper_id=?2 AND document_version_id=?3
               AND run_id=?4 AND state='ready'
             ORDER BY updated_at_ms DESC,id DESC LIMIT 1",
            params![
                query.project_id,
                query.paper_id,
                query.document_version_id,
                latest_parse_run_id
            ],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|_| "SIDERA_DOCUMENT_INDEX_READ_FAILED".to_string())?
        .ok_or_else(|| "SIDERA_DOCUMENT_INDEX_NOT_READY".to_string())?;
    let snapshot = snapshot_from_connection(&connection, &job_id)?;
    let indexed_mode = snapshot
        .resolved_mode
        .ok_or_else(|| "SIDERA_DOCUMENT_INDEX_NOT_READY".to_string())?;
    let (resolved_mode, fallback_reason) = match input.requested_mode {
        SideraDocumentIndexMode::Lexical => (SideraDocumentIndexMode::Lexical, None),
        SideraDocumentIndexMode::Hybrid => {
            if indexed_mode != SideraDocumentIndexMode::Hybrid {
                return Err("SIDERA_DOCUMENT_INDEX_HYBRID_UNAVAILABLE".to_string());
            }
            if input.query_embedding.is_none() {
                return Err("SIDERA_DOCUMENT_INDEX_QUERY_EMBEDDING_REQUIRED".to_string());
            }
            (SideraDocumentIndexMode::Hybrid, None)
        }
        SideraDocumentIndexMode::Auto => {
            if indexed_mode == SideraDocumentIndexMode::Hybrid {
                if input.query_embedding.is_some() {
                    (
                        SideraDocumentIndexMode::Hybrid,
                        snapshot.fallback_reason.clone(),
                    )
                } else if input.query_fallback_reason.is_some() {
                    (
                        SideraDocumentIndexMode::Lexical,
                        input.query_fallback_reason.clone(),
                    )
                } else {
                    return Err("SIDERA_DOCUMENT_INDEX_QUERY_EMBEDDING_REQUIRED".to_string());
                }
            } else {
                (
                    SideraDocumentIndexMode::Lexical,
                    snapshot.fallback_reason.clone(),
                )
            }
        }
    };
    let mut lexical_scores = HashMap::new();
    let mut lexical_ranks = HashMap::new();
    {
        let mut statement = connection
            .prepare(
                "SELECT segment_id,bm25(document_segments_fts)
                 FROM document_segments_fts
                 WHERE document_segments_fts MATCH ?1 AND job_id=?2
                 ORDER BY bm25(document_segments_fts),CAST(page_index AS INTEGER),segment_id",
            )
            .map_err(|_| "SIDERA_DOCUMENT_INDEX_SEARCH_FAILED".to_string())?;
        for row in statement
            .query_map(params![lexical_query, snapshot.job_id], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))
            })
            .map_err(|_| "SIDERA_DOCUMENT_INDEX_SEARCH_FAILED".to_string())?
        {
            let (id, score) = row.map_err(|_| "SIDERA_DOCUMENT_INDEX_SEARCH_FAILED".to_string())?;
            let rank = lexical_ranks.len() + 1;
            lexical_scores.insert(id.clone(), -score);
            lexical_ranks.insert(id, rank);
        }
    }
    let mut candidates = Vec::new();
    if resolved_mode == SideraDocumentIndexMode::Lexical {
        let mut statement = connection
            .prepare(
                "SELECT id,page_index,text,anchor_json FROM document_segments
                 WHERE job_id=?1 ORDER BY page_index,start_offset_utf16,id",
            )
            .map_err(|_| "SIDERA_DOCUMENT_INDEX_SEARCH_FAILED".to_string())?;
        for row in statement
            .query_map([&snapshot.job_id], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                ))
            })
            .map_err(|_| "SIDERA_DOCUMENT_INDEX_SEARCH_FAILED".to_string())?
        {
            let (segment_id, page_index, text, anchor_json) =
                row.map_err(|_| "SIDERA_DOCUMENT_INDEX_SEARCH_FAILED".to_string())?;
            let Some(score) = lexical_scores.get(&segment_id).copied() else {
                continue;
            };
            let anchor = serde_json::from_str(&anchor_json)
                .map_err(|_| "SIDERA_DOCUMENT_INDEX_ANCHOR_CORRUPT".to_string())?;
            candidates.push(SideraDocumentIndexSearchHit {
                segment_id,
                page_index: page_index.max(0) as u32,
                excerpt: excerpt(&text),
                score,
                lexical_score: Some(score),
                semantic_score: None,
                anchor,
            });
        }
        candidates.sort_by(|left, right| {
            stable_descending_score_order(
                left.score,
                left.page_index,
                &left.segment_id,
                right.score,
                right.page_index,
                &right.segment_id,
            )
        });
    } else {
        let query_embedding = input
            .query_embedding
            .as_deref()
            .ok_or_else(|| "SIDERA_DOCUMENT_INDEX_QUERY_EMBEDDING_UNAVAILABLE".to_string())?;
        if query_embedding.len() != SEMANTIC_EMBEDDING_DIMENSIONS
            || query_embedding.iter().any(|value| !value.is_finite())
        {
            return Err("SIDERA_DOCUMENT_INDEX_QUERY_EMBEDDING_INVALID".to_string());
        }
        let mut statement = connection
            .prepare(
                "SELECT segment.id,segment.page_index,segment.text,segment.anchor_json,
                        embedding.dimensions,embedding.vector_blob
                 FROM document_segments segment
                 JOIN document_segment_embeddings embedding
                   ON embedding.job_id=segment.job_id AND embedding.segment_id=segment.id
                   AND embedding.content_sha256=segment.text_sha256
                 WHERE segment.job_id=?1 AND embedding.model_id=?2 AND embedding.model_revision=?3",
            )
            .map_err(|_| "SIDERA_DOCUMENT_INDEX_SEARCH_FAILED".to_string())?;
        for row in statement
            .query_map(
                params![snapshot.job_id, SEMANTIC_MODEL_ID, SEMANTIC_MODEL_REVISION],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, i64>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, i64>(4)?,
                        row.get::<_, Vec<u8>>(5)?,
                    ))
                },
            )
            .map_err(|_| "SIDERA_DOCUMENT_INDEX_SEARCH_FAILED".to_string())?
        {
            let (segment_id, page_index, text, anchor_json, dimensions, blob) =
                row.map_err(|_| "SIDERA_DOCUMENT_INDEX_SEARCH_FAILED".to_string())?;
            if dimensions.max(0) as usize != SEMANTIC_EMBEDDING_DIMENSIONS {
                return Err("SIDERA_DOCUMENT_INDEX_EMBEDDING_DIMENSIONS_MISMATCH".to_string());
            }
            let vector = decode_float16_le(&blob, SEMANTIC_EMBEDDING_DIMENSIONS)?;
            if vector.iter().any(|value| !value.is_finite()) {
                return Err("SIDERA_DOCUMENT_INDEX_EMBEDDING_INVALID".to_string());
            }
            let semantic_score = cosine(query_embedding, &vector);
            let lexical_score = lexical_scores.get(&segment_id).copied();
            let anchor = serde_json::from_str(&anchor_json)
                .map_err(|_| "SIDERA_DOCUMENT_INDEX_ANCHOR_CORRUPT".to_string())?;
            candidates.push(SideraDocumentIndexSearchHit {
                segment_id,
                page_index: page_index.max(0) as u32,
                excerpt: excerpt(&text),
                score: 0.0,
                lexical_score,
                semantic_score: Some(semantic_score),
                anchor,
            });
        }
        candidates.sort_by(|left, right| {
            stable_descending_score_order(
                left.semantic_score.unwrap_or(f64::NEG_INFINITY),
                left.page_index,
                &left.segment_id,
                right.semantic_score.unwrap_or(f64::NEG_INFINITY),
                right.page_index,
                &right.segment_id,
            )
        });
        for (index, candidate) in candidates.iter_mut().enumerate() {
            candidate.score = weighted_rrf_score(
                lexical_ranks.get(&candidate.segment_id).copied(),
                Some(index + 1),
            );
        }
        candidates.sort_by(|left, right| {
            stable_descending_score_order(
                left.score,
                left.page_index,
                &left.segment_id,
                right.score,
                right.page_index,
                &right.segment_id,
            )
        });
    }
    let total = candidates.len().min(u32::MAX as usize) as u32;
    let hits = candidates
        .into_iter()
        .skip(input.offset as usize)
        .take(input.limit as usize)
        .collect();
    Ok(SideraDocumentIndexSearchResult {
        job_id,
        requested_mode: input.requested_mode,
        resolved_mode,
        fallback_reason,
        total,
        offset: input.offset,
        limit: input.limit,
        hits,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::document_derived::{
        finalize_document_parse, start_document_parse, submit_document_parse_page,
        SideraDocumentParsePageInput, SideraDocumentParseRunQuery, SideraDocumentParseStartInput,
        SideraDocumentTextSpanInput,
    };
    use crate::document_store::{document_store_database_path, DOCUMENT_STORE_DIRECTORY};
    use std::fs;
    use std::sync::atomic::{AtomicU64, Ordering};

    static NEXT_FIXTURE: AtomicU64 = AtomicU64::new(1);

    fn fixture() -> (PathBuf, SideraDocumentIndexQuery) {
        let root = std::env::temp_dir().join(format!(
            "sidera-document-index-{}-{}",
            std::process::id(),
            NEXT_FIXTURE.fetch_add(1, Ordering::Relaxed)
        ));
        let _ = fs::remove_dir_all(&root);
        let blob_root = root
            .join("Sidera")
            .join(DOCUMENT_STORE_DIRECTORY)
            .join("blobs/ab");
        fs::create_dir_all(&blob_root).unwrap();
        let bytes = b"%PDF-1.7\nfixture\n%%EOF";
        let sha = sha256_hex(bytes);
        let rel = format!("blobs/ab/{sha}.pdf");
        fs::write(
            root.join("Sidera")
                .join(DOCUMENT_STORE_DIRECTORY)
                .join(&rel),
            bytes,
        )
        .unwrap();
        let store = Connection::open(document_store_database_path(&root)).unwrap();
        store
            .execute_batch(
                "CREATE TABLE documents(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,paper_id TEXT NOT NULL);
                 CREATE TABLE document_versions(
                   id TEXT PRIMARY KEY,document_id TEXT NOT NULL,sha256 TEXT NOT NULL,mime_type TEXT NOT NULL,
                   byte_size INTEGER NOT NULL,storage_rel_path TEXT NOT NULL,original_file_name TEXT,
                   version_kind TEXT NOT NULL
                 );",
            )
            .unwrap();
        store
            .execute(
                "INSERT INTO documents VALUES('document-1','project','paper')",
                [],
            )
            .unwrap();
        store
            .execute(
                "INSERT INTO document_versions VALUES('version-1','document-1',?1,'application/pdf',?2,?3,NULL,'user-import')",
                params![sha, bytes.len() as i64, rel],
            )
            .unwrap();
        let started = start_document_parse(SideraDocumentParseStartInput {
            library_directory: root.clone(),
            project_id: "project".to_string(),
            paper_id: "paper".to_string(),
            document_version_id: "version-1".to_string(),
            expected_sha256: sha.clone(),
            parser_version: "pdfjs-index".to_string(),
            page_count: 1,
            now_ms: 1,
        })
        .unwrap();
        let run = SideraDocumentParseRunQuery {
            library_directory: root.clone(),
            project_id: "project".to_string(),
            paper_id: "paper".to_string(),
            document_version_id: "version-1".to_string(),
            run_id: started.run_id,
            document_sha256: sha,
            parser_version: "pdfjs-index".to_string(),
        };
        submit_document_parse_page(SideraDocumentParsePageInput {
            run: run.clone(),
            page_index: 0,
            page_label: "1".to_string(),
            width: 100.0,
            height: 100.0,
            text: "人工智能 evidence retrieval and grounded citation".to_string(),
            spans: vec![SideraDocumentTextSpanInput {
                text: "evidence retrieval".to_string(),
                start_offset_utf16: 5,
                end_offset_utf16: 23,
                x: 0.1,
                y: 0.2,
                width: 0.3,
                height: 0.04,
            }],
            now_ms: 2,
        })
        .unwrap();
        finalize_document_parse(run, 3).unwrap();
        (
            root.clone(),
            SideraDocumentIndexQuery {
                library_directory: root,
                project_id: "project".to_string(),
                paper_id: "paper".to_string(),
                document_version_id: "version-1".to_string(),
            },
        )
    }

    #[test]
    fn segment_ranges_are_utf16_safe_and_overlap_without_stalling() {
        let text = "🧠".repeat(900);
        let ranges = segment_ranges(&text);
        assert_eq!(DOCUMENT_INDEX_SEGMENT_UTF16, 800);
        assert_eq!(DOCUMENT_INDEX_SEGMENT_OVERLAP_UTF16, 120);
        assert!(ranges.len() >= 2);
        assert_eq!(ranges[0].0, 0);
        assert_eq!(ranges.last().unwrap().1, text.encode_utf16().count() as u32);
        for (index, (start, end)) in ranges.iter().copied().enumerate() {
            assert!(start < end);
            assert!(end - start <= DOCUMENT_INDEX_SEGMENT_UTF16);
            assert!(utf16_slice(&text, start, end).is_some());
            if index > 0 {
                assert!(start < ranges[index - 1].1);
                assert_eq!(
                    ranges[index - 1].1 - start,
                    DOCUMENT_INDEX_SEGMENT_OVERLAP_UTF16
                );
            }
        }
    }

    #[test]
    fn hybrid_weighted_rrf_is_deterministic_with_stable_ties() {
        let both_first = weighted_rrf_score(Some(1), Some(1));
        let expected = DOCUMENT_INDEX_RRF_LEXICAL_WEIGHT / (DOCUMENT_INDEX_RRF_K + 1.0)
            + DOCUMENT_INDEX_RRF_SEMANTIC_WEIGHT / (DOCUMENT_INDEX_RRF_K + 1.0);
        assert!((both_first - expected).abs() < f64::EPSILON);
        assert!(both_first > weighted_rrf_score(None, Some(1)));
        assert!(weighted_rrf_score(Some(1), Some(2)) > weighted_rrf_score(Some(2), Some(2)));
        assert_eq!(
            stable_descending_score_order(0.5, 2, "a", 0.5, 1, "z"),
            std::cmp::Ordering::Greater
        );
        assert_eq!(
            stable_descending_score_order(0.5, 1, "b", 0.5, 1, "a"),
            std::cmp::Ordering::Greater
        );
    }

    #[test]
    fn float16_embedding_contract_is_exactly_384_dimensions() {
        let vector = vec![0.25_f32; SEMANTIC_EMBEDDING_DIMENSIONS];
        let blob = encode_float16_le(&vector);
        assert_eq!(blob.len(), 768);
        assert_eq!(
            decode_float16_le(&blob, SEMANTIC_EMBEDDING_DIMENSIONS)
                .unwrap()
                .len(),
            SEMANTIC_EMBEDDING_DIMENSIONS
        );
    }

    #[test]
    fn start_is_fast_and_interrupted_segmenting_publishes_no_partial_artifacts() {
        let (root, query) = fixture();
        assert!(current_document_index(query.clone()).unwrap().is_none());
        let started = start_document_index(SideraDocumentIndexStartInput {
            query: query.clone(),
            requested_mode: SideraDocumentIndexMode::Auto,
            now_ms: 10,
        })
        .unwrap();
        assert_eq!(started.stage, "segmenting");
        assert_eq!(started.segment_count, 0);
        assert_eq!(
            current_document_index(query.clone())
                .unwrap()
                .unwrap()
                .job_id,
            started.job_id
        );
        let job = SideraDocumentIndexJobQuery {
            query: query.clone(),
            job_id: started.job_id,
        };
        assert_eq!(
            complete_document_index_segmenting(job.clone(), 11, || false).unwrap_err(),
            "SIDERA_DOCUMENT_INDEX_SEGMENTING_INTERRUPTED"
        );
        let connection = open_read(&root).unwrap();
        assert_eq!(
            connection
                .query_row(
                    "SELECT COUNT(*) FROM document_segments WHERE job_id=?1",
                    [&job.job_id],
                    |row| row.get::<_, i64>(0),
                )
                .unwrap(),
            0
        );
        drop(connection);
        assert_eq!(
            search_document_index(SideraDocumentIndexSearchInput {
                query: query.clone(),
                text: "evidence retrieval".to_string(),
                requested_mode: SideraDocumentIndexMode::Hybrid,
                query_embedding: None,
                query_fallback_reason: None,
                limit: 10,
                offset: 0,
            })
            .unwrap_err(),
            "SIDERA_DOCUMENT_INDEX_NOT_READY"
        );
        assert_eq!(
            complete_document_index_segmenting(job, 12, || true)
                .unwrap()
                .stage,
            "embedding"
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn auto_index_really_falls_back_to_lexical_and_remains_searchable() {
        let (root, query) = fixture();
        let library_before = fs::read(document_store_database_path(&root)).unwrap();
        let started = start_document_index(SideraDocumentIndexStartInput {
            query: query.clone(),
            requested_mode: SideraDocumentIndexMode::Auto,
            now_ms: 10,
        })
        .unwrap();
        assert_eq!(started.state, SideraDocumentIndexState::Running);
        assert_eq!(started.stage, "segmenting");
        assert_eq!(started.segment_count, 0);
        let job = SideraDocumentIndexJobQuery {
            query: query.clone(),
            job_id: started.job_id.clone(),
        };
        let segmented = complete_document_index_segmenting(job.clone(), 11, || true).unwrap();
        assert_eq!(segmented.stage, "embedding");
        assert!(segmented.segment_count > 0);
        let fallback =
            fallback_document_index_to_lexical(job, "SEMANTIC_MODEL_UNAVAILABLE".to_string(), 12)
                .unwrap();
        assert_eq!(fallback.state, SideraDocumentIndexState::Ready);
        assert_eq!(
            fallback.resolved_mode,
            Some(SideraDocumentIndexMode::Lexical)
        );
        let result = search_document_index(SideraDocumentIndexSearchInput {
            query,
            text: "evidence retrieval".to_string(),
            requested_mode: SideraDocumentIndexMode::Auto,
            query_embedding: None,
            query_fallback_reason: Some("SEMANTIC_MODEL_UNAVAILABLE".to_string()),
            limit: 10,
            offset: 0,
        })
        .unwrap();
        assert_eq!(result.resolved_mode, SideraDocumentIndexMode::Lexical);
        assert_eq!(result.hits.len(), 1);
        assert_eq!(
            result.fallback_reason.as_deref(),
            Some("SEMANTIC_MODEL_UNAVAILABLE")
        );
        assert_eq!(
            fs::read(document_store_database_path(&root)).unwrap(),
            library_before
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rebuilding_and_cancelling_a_new_job_never_mutates_the_ready_snapshot() {
        let (root, query) = fixture();
        let ready_started = start_document_index(SideraDocumentIndexStartInput {
            query: query.clone(),
            requested_mode: SideraDocumentIndexMode::Lexical,
            now_ms: 10,
        })
        .unwrap();
        let ready = complete_document_index_segmenting(
            SideraDocumentIndexJobQuery {
                query: query.clone(),
                job_id: ready_started.job_id,
            },
            11,
            || true,
        )
        .unwrap();
        let rebuilding_started = start_document_index(SideraDocumentIndexStartInput {
            query: query.clone(),
            requested_mode: SideraDocumentIndexMode::Hybrid,
            now_ms: 12,
        })
        .unwrap();
        let rebuilding = complete_document_index_segmenting(
            SideraDocumentIndexJobQuery {
                query: query.clone(),
                job_id: rebuilding_started.job_id,
            },
            13,
            || true,
        )
        .unwrap();
        assert_ne!(ready.job_id, rebuilding.job_id);
        assert_eq!(ready.state, SideraDocumentIndexState::Ready);
        assert_eq!(rebuilding.state, SideraDocumentIndexState::Running);

        let during_rebuild = search_document_index(SideraDocumentIndexSearchInput {
            query: query.clone(),
            text: "evidence retrieval".to_string(),
            requested_mode: SideraDocumentIndexMode::Auto,
            query_embedding: None,
            query_fallback_reason: Some("SEMANTIC_MODEL_UNAVAILABLE".to_string()),
            limit: 10,
            offset: 0,
        })
        .unwrap();
        assert_eq!(during_rebuild.job_id, ready.job_id);
        assert_eq!(during_rebuild.hits.len(), 1);

        let connection = open_read(&root).unwrap();
        let artifact_counts = [&ready.job_id, &rebuilding.job_id]
            .into_iter()
            .map(|job_id| {
                connection
                    .query_row(
                        "SELECT COUNT(*) FROM document_segments WHERE job_id=?1",
                        [job_id],
                        |row| row.get::<_, i64>(0),
                    )
                    .unwrap()
            })
            .collect::<Vec<_>>();
        assert!(artifact_counts.iter().all(|count| *count > 0));
        drop(connection);

        cancel_document_index(
            SideraDocumentIndexJobQuery {
                query: query.clone(),
                job_id: rebuilding.job_id,
            },
            14,
        )
        .unwrap();
        let after_cancel = search_document_index(SideraDocumentIndexSearchInput {
            query: query.clone(),
            text: "evidence retrieval".to_string(),
            requested_mode: SideraDocumentIndexMode::Lexical,
            query_embedding: None,
            query_fallback_reason: None,
            limit: 10,
            offset: 0,
        })
        .unwrap();
        assert_eq!(after_cancel.job_id, ready.job_id);
        assert_eq!(after_cancel.hits.len(), 1);
        let failing = start_document_index(SideraDocumentIndexStartInput {
            query: query.clone(),
            requested_mode: SideraDocumentIndexMode::Hybrid,
            now_ms: 15,
        })
        .unwrap();
        fail_document_index(
            SideraDocumentIndexJobQuery {
                query: query.clone(),
                job_id: failing.job_id,
            },
            "SIDERA_DOCUMENT_INDEX_TEST_FAILURE".to_string(),
            16,
        )
        .unwrap();
        let after_failure = search_document_index(SideraDocumentIndexSearchInput {
            query,
            text: "evidence retrieval".to_string(),
            requested_mode: SideraDocumentIndexMode::Lexical,
            query_embedding: None,
            query_fallback_reason: None,
            limit: 10,
            offset: 0,
        })
        .unwrap();
        assert_eq!(after_failure.job_id, ready.job_id);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn completed_job_is_promoted_atomically_and_supersedes_the_previous_ready_job() {
        let (root, query) = fixture();
        let previous_started = start_document_index(SideraDocumentIndexStartInput {
            query: query.clone(),
            requested_mode: SideraDocumentIndexMode::Lexical,
            now_ms: 20,
        })
        .unwrap();
        let previous = complete_document_index_segmenting(
            SideraDocumentIndexJobQuery {
                query: query.clone(),
                job_id: previous_started.job_id,
            },
            21,
            || true,
        )
        .unwrap();
        let building_started = start_document_index(SideraDocumentIndexStartInput {
            query: query.clone(),
            requested_mode: SideraDocumentIndexMode::Hybrid,
            now_ms: 22,
        })
        .unwrap();
        let building = complete_document_index_segmenting(
            SideraDocumentIndexJobQuery {
                query: query.clone(),
                job_id: building_started.job_id,
            },
            23,
            || true,
        )
        .unwrap();
        let job = SideraDocumentIndexJobQuery {
            query: query.clone(),
            job_id: building.job_id.clone(),
        };
        let documents = document_index_segment_documents(job.clone()).unwrap();
        let records = documents
            .iter()
            .map(|document| SideraDocumentSegmentEmbeddingInput {
                segment_id: document.segment_id.clone(),
                content_sha256: document.content_sha256.clone(),
                vector: vec![0.25; SEMANTIC_EMBEDDING_DIMENSIONS],
            })
            .collect::<Vec<_>>();
        submit_document_index_embeddings(job.clone(), &records, 24).unwrap();
        let promoted = complete_document_index_hybrid(job, 25).unwrap();
        assert_eq!(promoted.state, SideraDocumentIndexState::Ready);
        assert_eq!(
            document_index_snapshot(SideraDocumentIndexJobQuery {
                query: query.clone(),
                job_id: previous.job_id,
            })
            .unwrap()
            .state,
            SideraDocumentIndexState::Superseded
        );
        assert_eq!(
            search_document_index(SideraDocumentIndexSearchInput {
                query: query.clone(),
                text: "evidence retrieval".to_string(),
                requested_mode: SideraDocumentIndexMode::Auto,
                query_embedding: None,
                query_fallback_reason: None,
                limit: 10,
                offset: 0,
            })
            .unwrap_err(),
            "SIDERA_DOCUMENT_INDEX_QUERY_EMBEDDING_REQUIRED"
        );
        assert_eq!(
            search_document_index(SideraDocumentIndexSearchInput {
                query: query.clone(),
                text: "   ".to_string(),
                requested_mode: SideraDocumentIndexMode::Auto,
                query_embedding: None,
                query_fallback_reason: None,
                limit: 10,
                offset: 0,
            })
            .unwrap_err(),
            "SIDERA_DOCUMENT_INDEX_SEARCH_QUERY_INVALID"
        );
        let degraded = search_document_index(SideraDocumentIndexSearchInput {
            query: query.clone(),
            text: "evidence retrieval".to_string(),
            requested_mode: SideraDocumentIndexMode::Auto,
            query_embedding: None,
            query_fallback_reason: Some("SEMANTIC_MODEL_UNAVAILABLE".to_string()),
            limit: 10,
            offset: 0,
        })
        .unwrap();
        assert_eq!(degraded.resolved_mode, SideraDocumentIndexMode::Lexical);
        assert_eq!(
            degraded.fallback_reason.as_deref(),
            Some("SEMANTIC_MODEL_UNAVAILABLE")
        );
        let search = search_document_index(SideraDocumentIndexSearchInput {
            query,
            text: "evidence retrieval".to_string(),
            requested_mode: SideraDocumentIndexMode::Hybrid,
            query_embedding: Some(vec![0.25; SEMANTIC_EMBEDDING_DIMENSIONS]),
            query_fallback_reason: None,
            limit: 10,
            offset: 0,
        })
        .unwrap();
        assert_eq!(search.job_id, promoted.job_id);
        assert_eq!(search.resolved_mode, SideraDocumentIndexMode::Hybrid);
        assert_eq!(search.hits.len(), 1);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn successful_promotion_retains_only_three_recent_terminal_jobs_and_cascades_artifacts() {
        let (root, query) = fixture();
        let evidence_database = root
            .join("Sidera")
            .join(crate::document_evidence::DOCUMENT_EVIDENCE_DATABASE);
        fs::write(&evidence_database, b"evidence-sentinel").unwrap();
        let first_started = start_document_index(SideraDocumentIndexStartInput {
            query: query.clone(),
            requested_mode: SideraDocumentIndexMode::Lexical,
            now_ms: 80,
        })
        .unwrap();
        let first_ready = complete_document_index_segmenting(
            SideraDocumentIndexJobQuery {
                query: query.clone(),
                job_id: first_started.job_id,
            },
            81,
            || true,
        )
        .unwrap();
        let text = "terminal evidence";
        let text_sha256 = sha256_hex(text.as_bytes());
        {
            let mut connection = open_write(&root).unwrap();
            let transaction = connection
                .transaction_with_behavior(TransactionBehavior::Immediate)
                .unwrap();
            for index in 0..5_i64 {
                let job_id = format!("terminal-{index}");
                let segment_id = format!("segment-{index}");
                let updated_at_ms = 90 + index;
                transaction
                    .execute(
                        "INSERT INTO document_index_jobs(
                           id,project_id,paper_id,document_version_id,document_sha256,run_id,
                           requested_mode,resolved_mode,state,stage,segment_count,embedded_count,
                           model_id,model_revision,fallback_reason,error_code,created_at_ms,
                           updated_at_ms,finished_at_ms
                         ) VALUES(?1,'project','paper','version-1',?2,?3,'hybrid','hybrid',
                                  'failed','complete',1,1,?4,?5,NULL,'TEST_TERMINAL',?6,?6,?6)",
                        params![
                            job_id,
                            first_ready.document_sha256,
                            first_ready.parse_run_id,
                            SEMANTIC_MODEL_ID,
                            SEMANTIC_MODEL_REVISION,
                            updated_at_ms,
                        ],
                    )
                    .unwrap();
                transaction
                    .execute(
                        "INSERT INTO document_segments(
                           job_id,run_id,id,document_version_id,document_sha256,page_index,
                           source_kind,start_offset_utf16,end_offset_utf16,text,text_sha256,
                           anchor_json
                         ) VALUES(?1,?2,?3,'version-1',?4,0,'native',0,8,?5,?6,'{}')",
                        params![
                            job_id,
                            first_ready.parse_run_id,
                            segment_id,
                            first_ready.document_sha256,
                            text,
                            text_sha256,
                        ],
                    )
                    .unwrap();
                transaction
                    .execute(
                        "INSERT INTO document_segments_fts(job_id,run_id,segment_id,page_index,text)
                         VALUES(?1,?2,?3,'0',?4)",
                        params![job_id, first_ready.parse_run_id, segment_id, text],
                    )
                    .unwrap();
                transaction
                    .execute(
                        "INSERT INTO document_segment_embeddings(
                           job_id,run_id,segment_id,content_sha256,model_id,model_revision,
                           dimensions,encoding,vector_blob,created_at_ms
                         ) VALUES(?1,?2,?3,?4,?5,?6,384,'float16-le',?7,?8)",
                        params![
                            job_id,
                            first_ready.parse_run_id,
                            segment_id,
                            text_sha256,
                            SEMANTIC_MODEL_ID,
                            SEMANTIC_MODEL_REVISION,
                            vec![0_u8; 768],
                            updated_at_ms,
                        ],
                    )
                    .unwrap();
            }
            transaction.commit().unwrap();
        }

        let rebuilding = start_document_index(SideraDocumentIndexStartInput {
            query: query.clone(),
            requested_mode: SideraDocumentIndexMode::Hybrid,
            now_ms: 100,
        })
        .unwrap();
        let rebuilding_job = SideraDocumentIndexJobQuery {
            query: query.clone(),
            job_id: rebuilding.job_id,
        };
        complete_document_index_segmenting(rebuilding_job.clone(), 101, || true).unwrap();
        let promoted = fallback_document_index_to_lexical(
            rebuilding_job,
            "SEMANTIC_MODEL_UNAVAILABLE".to_string(),
            102,
        )
        .unwrap();
        assert_eq!(promoted.state, SideraDocumentIndexState::Ready);

        let connection = open_read(&root).unwrap();
        let retained_terminal_ids = {
            let mut statement = connection
                .prepare(
                    "SELECT id FROM document_index_jobs
                     WHERE document_version_id='version-1'
                       AND state IN ('failed','cancelled','superseded')
                     ORDER BY updated_at_ms DESC,id DESC",
                )
                .unwrap();
            statement
                .query_map([], |row| row.get::<_, String>(0))
                .unwrap()
                .collect::<Result<Vec<_>, _>>()
                .unwrap()
        };
        assert_eq!(retained_terminal_ids.len(), 3);
        assert_eq!(retained_terminal_ids[0], first_ready.job_id);
        assert_eq!(
            retained_terminal_ids[1..]
                .iter()
                .map(String::as_str)
                .collect::<Vec<_>>(),
            vec!["terminal-4", "terminal-3"]
        );
        assert_eq!(
            connection
                .query_row(
                    "SELECT COUNT(*) FROM document_index_jobs WHERE document_version_id='version-1'",
                    [],
                    |row| row.get::<_, i64>(0),
                )
                .unwrap(),
            4
        );
        for pruned in ["terminal-0", "terminal-1", "terminal-2"] {
            for table in [
                "document_segments",
                "document_segment_embeddings",
                "document_segments_fts",
            ] {
                assert_eq!(
                    connection
                        .query_row(
                            &format!("SELECT COUNT(*) FROM {table} WHERE job_id=?1"),
                            [pruned],
                            |row| row.get::<_, i64>(0),
                        )
                        .unwrap(),
                    0
                );
            }
        }
        drop(connection);
        assert_eq!(fs::read(evidence_database).unwrap(), b"evidence-sentinel");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn pause_is_durable_resume_processes_remaining_segments_and_late_writes_are_fenced() {
        let (root, query) = fixture();
        let started = start_document_index(SideraDocumentIndexStartInput {
            query: query.clone(),
            requested_mode: SideraDocumentIndexMode::Hybrid,
            now_ms: 30,
        })
        .unwrap();
        let job = SideraDocumentIndexJobQuery {
            query: query.clone(),
            job_id: started.job_id,
        };
        let paused = pause_document_index(job.clone(), 31).unwrap();
        assert_eq!(paused.state, SideraDocumentIndexState::Paused);
        assert_eq!(paused.stage, "segmenting");
        assert_eq!(
            document_index_snapshot(job.clone()).unwrap().state,
            SideraDocumentIndexState::Paused
        );
        assert_eq!(
            complete_document_index_segmenting(job.clone(), 32, || true).unwrap_err(),
            "SIDERA_DOCUMENT_INDEX_NOT_SEGMENTING"
        );
        assert_eq!(
            resume_document_index(job.clone(), 33).unwrap().state,
            SideraDocumentIndexState::Running
        );
        let segmented = complete_document_index_segmenting(job.clone(), 34, || true).unwrap();
        assert_eq!(segmented.stage, "embedding");
        assert_eq!(
            pause_document_index(job.clone(), 35).unwrap().state,
            SideraDocumentIndexState::Paused
        );
        let segment = {
            let connection = open_read(&root).unwrap();
            connection
                .query_row(
                    "SELECT id,text_sha256 FROM document_segments WHERE job_id=?1 LIMIT 1",
                    [&job.job_id],
                    |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
                )
                .unwrap()
        };
        let record = SideraDocumentSegmentEmbeddingInput {
            segment_id: segment.0,
            content_sha256: segment.1,
            vector: vec![0.1; SEMANTIC_EMBEDDING_DIMENSIONS],
        };
        assert_eq!(
            submit_document_index_embeddings(job.clone(), &[record.clone()], 36).unwrap_err(),
            "SIDERA_DOCUMENT_INDEX_NOT_EMBEDDING"
        );
        assert_eq!(
            resume_document_index(job.clone(), 37).unwrap().state,
            SideraDocumentIndexState::Running
        );
        submit_document_index_embeddings(job.clone(), &[record], 38).unwrap();
        assert_eq!(
            complete_document_index_hybrid(job.clone(), 39)
                .unwrap()
                .state,
            SideraDocumentIndexState::Ready
        );
        assert_eq!(
            pause_document_index(job, 40).unwrap().state,
            SideraDocumentIndexState::Ready
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn search_refuses_an_index_from_a_superseded_parse_run() {
        let (root, query) = fixture();
        let indexed_started = start_document_index(SideraDocumentIndexStartInput {
            query: query.clone(),
            requested_mode: SideraDocumentIndexMode::Lexical,
            now_ms: 40,
        })
        .unwrap();
        let indexed = complete_document_index_segmenting(
            SideraDocumentIndexJobQuery {
                query: query.clone(),
                job_id: indexed_started.job_id,
            },
            41,
            || true,
        )
        .unwrap();
        let manifest = document_reader_manifest(reader_query(&query)).unwrap();
        let sha = manifest.version.sha256;
        let next = start_document_parse(SideraDocumentParseStartInput {
            library_directory: root.clone(),
            project_id: "project".to_string(),
            paper_id: "paper".to_string(),
            document_version_id: "version-1".to_string(),
            expected_sha256: sha,
            parser_version: "pdfjs-index-next".to_string(),
            page_count: 1,
            now_ms: 42,
        })
        .unwrap();
        assert_eq!(next.state, SideraDocumentParseState::Running);
        assert!(current_document_index(query.clone()).unwrap().is_none());
        assert_eq!(
            search_document_index(SideraDocumentIndexSearchInput {
                query: query.clone(),
                text: "evidence retrieval".to_string(),
                requested_mode: SideraDocumentIndexMode::Lexical,
                query_embedding: None,
                query_fallback_reason: None,
                limit: 10,
                offset: 0,
            })
            .unwrap_err(),
            "SIDERA_DOCUMENT_INDEX_PARSE_NOT_READY"
        );
        assert_eq!(
            document_index_snapshot(SideraDocumentIndexJobQuery {
                query,
                job_id: indexed.job_id,
            })
            .unwrap()
            .state,
            SideraDocumentIndexState::Ready
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn cancel_is_idempotent_and_late_embeddings_cannot_promote_the_job() {
        let (root, query) = fixture();
        let started = start_document_index(SideraDocumentIndexStartInput {
            query: query.clone(),
            requested_mode: SideraDocumentIndexMode::Hybrid,
            now_ms: 20,
        })
        .unwrap();
        let job = SideraDocumentIndexJobQuery {
            query,
            job_id: started.job_id,
        };
        complete_document_index_segmenting(job.clone(), 21, || true).unwrap();
        assert_eq!(
            cancel_document_index(job.clone(), 22).unwrap().state,
            SideraDocumentIndexState::Cancelled
        );
        assert_eq!(
            cancel_document_index(job.clone(), 23).unwrap().state,
            SideraDocumentIndexState::Cancelled
        );
        let segment = {
            let connection = open_read(&root).unwrap();
            connection
                .query_row(
                    "SELECT id,text_sha256 FROM document_segments LIMIT 1",
                    [],
                    |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
                )
                .unwrap()
        };
        assert_eq!(
            submit_document_index_embeddings(
                job.clone(),
                &[SideraDocumentSegmentEmbeddingInput {
                    segment_id: segment.0,
                    content_sha256: segment.1,
                    vector: vec![0.1; SEMANTIC_EMBEDDING_DIMENSIONS],
                }],
                24,
            )
            .unwrap_err(),
            "SIDERA_DOCUMENT_INDEX_NOT_EMBEDDING"
        );
        assert_eq!(
            complete_document_index_hybrid(job, 25).unwrap().state,
            SideraDocumentIndexState::Cancelled
        );
        let _ = fs::remove_dir_all(root);
    }
}
