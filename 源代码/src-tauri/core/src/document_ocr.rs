use std::path::Path;
use std::time::Duration;

use rusqlite::{params, Connection, OpenFlags, OptionalExtension, TransactionBehavior};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::document_derived::{
    document_derived_database_path, document_page_text, document_reader_manifest,
    prepare_document_derived_index_schema, SideraDocumentEvidenceRect, SideraDocumentPageText,
    SideraDocumentPageTextSpan, SideraDocumentReaderQuery, DOCUMENT_PARSE_MAX_PAGES,
};

pub const DOCUMENT_OCR_MODEL_ID: &str = "PP-OCRv5-mobile-det-rec";
pub const DOCUMENT_OCR_MODEL_REVISION: &str = "paddlepaddle-onnx-2026-08-24";
pub const DOCUMENT_OCR_MAX_UPLOAD_BYTES: usize = 12 * 1024 * 1024;
pub const DOCUMENT_OCR_MAX_IMAGE_EDGE: u32 = 3_000;
pub const DOCUMENT_OCR_MAX_IMAGE_PIXELS: u64 = 12_000_000;
pub const DOCUMENT_OCR_UPLOAD_TTL_MS: i64 = 30_000;
pub const DOCUMENT_OCR_JOB_TIMEOUT_MS: i64 = 90_000;
pub const DOCUMENT_OCR_MAX_BATCH_PAGES: usize = 8;

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SideraDocumentOcrState {
    AwaitingUpload,
    Queued,
    Running,
    Ready,
    Failed,
    Cancelled,
    Superseded,
}

impl SideraDocumentOcrState {
    fn as_str(self) -> &'static str {
        match self {
            Self::AwaitingUpload => "awaiting-upload",
            Self::Queued => "queued",
            Self::Running => "running",
            Self::Ready => "ready",
            Self::Failed => "failed",
            Self::Cancelled => "cancelled",
            Self::Superseded => "superseded",
        }
    }

    fn from_str(value: &str) -> Result<Self, String> {
        match value {
            "awaiting-upload" => Ok(Self::AwaitingUpload),
            "queued" => Ok(Self::Queued),
            "running" => Ok(Self::Running),
            "ready" => Ok(Self::Ready),
            "failed" => Ok(Self::Failed),
            "cancelled" => Ok(Self::Cancelled),
            "superseded" => Ok(Self::Superseded),
            _ => Err("SIDERA_DOCUMENT_OCR_STATE_INVALID".to_string()),
        }
    }
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SideraDocumentOcrSnapshot {
    pub job_id: String,
    pub project_id: String,
    pub paper_id: String,
    pub document_version_id: String,
    pub document_sha256: String,
    pub page_index: u32,
    pub model_id: String,
    pub model_revision: String,
    pub state: SideraDocumentOcrState,
    pub error_code: Option<String>,
    pub mean_confidence: Option<f64>,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
    pub finished_at_ms: Option<i64>,
}

#[derive(Clone, Debug)]
pub struct SideraDocumentOcrStartInput {
    pub reader: SideraDocumentReaderQuery,
    pub page_index: u32,
    pub now_ms: i64,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SideraDocumentOcrSpanInput {
    pub text: String,
    pub rect: SideraDocumentEvidenceRect,
    pub confidence: f64,
}

#[derive(Clone, Debug)]
pub struct SideraDocumentOcrCommitInput {
    pub reader: SideraDocumentReaderQuery,
    pub job_id: String,
    pub page_index: u32,
    pub page_width: f64,
    pub page_height: f64,
    pub spans: Vec<SideraDocumentOcrSpanInput>,
    pub now_ms: i64,
}

fn configure_write(connection: &Connection) -> Result<(), String> {
    connection
        .busy_timeout(Duration::from_secs(2))
        .map_err(|_| "SIDERA_DOCUMENT_OCR_PRAGMA_FAILED".to_string())?;
    connection
        .execute_batch("PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;")
        .map_err(|_| "SIDERA_DOCUMENT_OCR_PRAGMA_FAILED".to_string())
}

fn open_write(library_directory: &Path) -> Result<Connection, String> {
    prepare_document_derived_index_schema(library_directory)?;
    let connection = Connection::open_with_flags(
        document_derived_database_path(library_directory),
        OpenFlags::SQLITE_OPEN_READ_WRITE,
    )
    .map_err(|_| "SIDERA_DOCUMENT_OCR_OPEN_FAILED".to_string())?;
    configure_write(&connection)?;
    Ok(connection)
}

fn open_read(library_directory: &Path) -> Result<Connection, String> {
    let path = document_derived_database_path(library_directory);
    if !path.is_file() {
        return Err("SIDERA_DOCUMENT_OCR_NOT_PREPARED".to_string());
    }
    let connection = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|_| "SIDERA_DOCUMENT_OCR_OPEN_FAILED".to_string())?;
    connection
        .pragma_update(None, "query_only", true)
        .map_err(|_| "SIDERA_DOCUMENT_OCR_PRAGMA_FAILED".to_string())?;
    Ok(connection)
}

fn clean_job_id(value: &str) -> Result<String, String> {
    let value = value.trim();
    if value.is_empty()
        || value.len() > 128
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
    {
        return Err("SIDERA_DOCUMENT_OCR_JOB_ID_INVALID".to_string());
    }
    Ok(value.to_string())
}

fn generated_job_id(input: &SideraDocumentOcrStartInput, sha256: &str) -> String {
    let digest = Sha256::digest(
        format!(
            "{}\n{}\n{}\n{}\n{}",
            input.reader.project_id,
            input.reader.paper_id,
            input.reader.document_version_id,
            input.page_index,
            input.now_ms
        )
        .as_bytes(),
    );
    let sha_prefix = sha256.get(..12).unwrap_or(sha256);
    format!("ocr-{sha_prefix}-{}", lowercase_hex(&digest[..10]))
}

fn lowercase_hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        output.push(HEX[(byte >> 4) as usize] as char);
        output.push(HEX[(byte & 0x0f) as usize] as char);
    }
    output
}

fn snapshot_from_connection(
    connection: &Connection,
    job_id: &str,
) -> Result<SideraDocumentOcrSnapshot, String> {
    let row = connection
        .query_row(
            "SELECT job.id,job.project_id,job.paper_id,job.document_version_id,
                    job.document_sha256,job.page_index,job.model_id,job.model_revision,
                    job.state,job.error_code,page.mean_confidence,job.created_at_ms,
                    job.updated_at_ms,job.finished_at_ms
             FROM document_ocr_jobs job
             LEFT JOIN document_ocr_pages page ON page.job_id=job.id
             WHERE job.id=?1",
            [job_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, i64>(5)?,
                    row.get::<_, String>(6)?,
                    row.get::<_, String>(7)?,
                    row.get::<_, String>(8)?,
                    row.get::<_, Option<String>>(9)?,
                    row.get::<_, Option<f64>>(10)?,
                    row.get::<_, i64>(11)?,
                    row.get::<_, i64>(12)?,
                    row.get::<_, Option<i64>>(13)?,
                ))
            },
        )
        .optional()
        .map_err(|_| "SIDERA_DOCUMENT_OCR_READ_FAILED".to_string())?
        .ok_or_else(|| "SIDERA_DOCUMENT_OCR_NOT_FOUND".to_string())?;
    Ok(SideraDocumentOcrSnapshot {
        job_id: row.0,
        project_id: row.1,
        paper_id: row.2,
        document_version_id: row.3,
        document_sha256: row.4,
        page_index: row.5.max(0) as u32,
        model_id: row.6,
        model_revision: row.7,
        state: SideraDocumentOcrState::from_str(&row.8)?,
        error_code: row.9,
        mean_confidence: row.10,
        created_at_ms: row.11,
        updated_at_ms: row.12,
        finished_at_ms: row.13,
    })
}

pub fn start_document_ocr(
    input: SideraDocumentOcrStartInput,
) -> Result<SideraDocumentOcrSnapshot, String> {
    if input.page_index >= DOCUMENT_PARSE_MAX_PAGES {
        return Err("SIDERA_DOCUMENT_OCR_PAGE_INVALID".to_string());
    }
    let mut connection = open_write(&input.reader.library_directory)?;
    let manifest = document_reader_manifest(input.reader.clone())?;
    if !manifest
        .pages
        .iter()
        .any(|page| page.page_index == input.page_index)
    {
        return Err("SIDERA_DOCUMENT_OCR_PAGE_NOT_PARSED".to_string());
    }
    let job_id = generated_job_id(&input, &manifest.version.sha256);
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|_| "SIDERA_DOCUMENT_OCR_TRANSACTION_FAILED".to_string())?;
    transaction
        .execute(
            "UPDATE document_ocr_jobs SET state='failed',error_code='SIDERA_DOCUMENT_OCR_INTERRUPTED',
                    updated_at_ms=?1,finished_at_ms=?1
             WHERE state IN ('awaiting-upload','queued','running') AND updated_at_ms<=?2",
            params![input.now_ms, input.now_ms - DOCUMENT_OCR_JOB_TIMEOUT_MS],
        )
        .map_err(|_| "SIDERA_DOCUMENT_OCR_RECOVERY_FAILED".to_string())?;
    let active: Option<String> = transaction
        .query_row(
            "SELECT id FROM document_ocr_jobs
             WHERE state IN ('awaiting-upload','queued','running') LIMIT 1",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(|_| "SIDERA_DOCUMENT_OCR_READ_FAILED".to_string())?;
    if active.is_some() {
        return Err("SIDERA_DOCUMENT_OCR_BUSY".to_string());
    }
    transaction
        .execute(
            "INSERT INTO document_ocr_jobs(
               id,project_id,paper_id,document_version_id,document_sha256,page_index,
               model_id,model_revision,state,error_code,created_at_ms,updated_at_ms,finished_at_ms
             ) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,'awaiting-upload',NULL,?9,?9,NULL)",
            params![
                job_id,
                input.reader.project_id,
                input.reader.paper_id,
                input.reader.document_version_id,
                manifest.version.sha256.to_ascii_lowercase(),
                input.page_index as i64,
                DOCUMENT_OCR_MODEL_ID,
                DOCUMENT_OCR_MODEL_REVISION,
                input.now_ms,
            ],
        )
        .map_err(|_| "SIDERA_DOCUMENT_OCR_START_FAILED".to_string())?;
    transaction
        .commit()
        .map_err(|_| "SIDERA_DOCUMENT_OCR_TRANSACTION_COMMIT_FAILED".to_string())?;
    snapshot_from_connection(&connection, &job_id)
}

pub fn queue_document_ocr(
    library_directory: &Path,
    job_id: &str,
    now_ms: i64,
) -> Result<SideraDocumentOcrSnapshot, String> {
    transition_document_ocr(
        library_directory,
        job_id,
        SideraDocumentOcrState::AwaitingUpload,
        SideraDocumentOcrState::Queued,
        None,
        now_ms,
    )
}

pub fn run_document_ocr(
    library_directory: &Path,
    job_id: &str,
    now_ms: i64,
) -> Result<SideraDocumentOcrSnapshot, String> {
    transition_document_ocr(
        library_directory,
        job_id,
        SideraDocumentOcrState::Queued,
        SideraDocumentOcrState::Running,
        None,
        now_ms,
    )
}

fn transition_document_ocr(
    library_directory: &Path,
    job_id: &str,
    expected: SideraDocumentOcrState,
    next: SideraDocumentOcrState,
    error_code: Option<&str>,
    now_ms: i64,
) -> Result<SideraDocumentOcrSnapshot, String> {
    let job_id = clean_job_id(job_id)?;
    let connection = open_write(library_directory)?;
    let changed = connection
        .execute(
            "UPDATE document_ocr_jobs SET state=?1,error_code=?2,updated_at_ms=?3,
                    finished_at_ms=CASE WHEN ?1 IN ('failed','cancelled','superseded') THEN ?3 ELSE NULL END
             WHERE id=?4 AND state=?5",
            params![next.as_str(), error_code, now_ms, job_id, expected.as_str()],
        )
        .map_err(|_| "SIDERA_DOCUMENT_OCR_TRANSITION_FAILED".to_string())?;
    if changed != 1 {
        return Err("SIDERA_DOCUMENT_OCR_STALE_TRANSITION".to_string());
    }
    snapshot_from_connection(&connection, &job_id)
}

pub fn fail_document_ocr(
    library_directory: &Path,
    job_id: &str,
    error_code: &str,
    now_ms: i64,
) -> Result<SideraDocumentOcrSnapshot, String> {
    let error_code = error_code.trim();
    if error_code.is_empty() || error_code.len() > 128 {
        return Err("SIDERA_DOCUMENT_OCR_ERROR_CODE_INVALID".to_string());
    }
    let job_id = clean_job_id(job_id)?;
    let connection = open_write(library_directory)?;
    let changed = connection
        .execute(
            "UPDATE document_ocr_jobs SET state='failed',error_code=?1,updated_at_ms=?2,finished_at_ms=?2
             WHERE id=?3 AND state IN ('awaiting-upload','queued','running')",
            params![error_code, now_ms, job_id],
        )
        .map_err(|_| "SIDERA_DOCUMENT_OCR_TRANSITION_FAILED".to_string())?;
    if changed != 1 {
        return Err("SIDERA_DOCUMENT_OCR_STALE_TRANSITION".to_string());
    }
    snapshot_from_connection(&connection, &job_id)
}

pub fn cancel_document_ocr(
    library_directory: &Path,
    job_id: &str,
    now_ms: i64,
) -> Result<SideraDocumentOcrSnapshot, String> {
    let job_id = clean_job_id(job_id)?;
    let connection = open_write(library_directory)?;
    connection
        .execute(
            "UPDATE document_ocr_jobs SET state='cancelled',error_code=NULL,updated_at_ms=?1,finished_at_ms=?1
             WHERE id=?2 AND state IN ('awaiting-upload','queued','running')",
            params![now_ms, job_id],
        )
        .map_err(|_| "SIDERA_DOCUMENT_OCR_CANCEL_FAILED".to_string())?;
    snapshot_from_connection(&connection, &job_id)
}

fn valid_rect(rect: &SideraDocumentEvidenceRect) -> bool {
    rect.x.is_finite()
        && rect.y.is_finite()
        && rect.width.is_finite()
        && rect.height.is_finite()
        && rect.x >= 0.0
        && rect.y >= 0.0
        && rect.width > 0.0
        && rect.height > 0.0
        && rect.x + rect.width <= 1.000_001
        && rect.y + rect.height <= 1.000_001
}

pub fn complete_document_ocr(
    input: SideraDocumentOcrCommitInput,
) -> Result<SideraDocumentOcrSnapshot, String> {
    if input.page_index >= DOCUMENT_PARSE_MAX_PAGES
        || !input.page_width.is_finite()
        || input.page_width <= 0.0
        || !input.page_height.is_finite()
        || input.page_height <= 0.0
        || input.spans.len() > 20_000
        || input.spans.iter().any(|span| {
            span.text.len() > 64 * 1024
                || span.text.contains('\0')
                || !span.confidence.is_finite()
                || !(0.0..=1.0).contains(&span.confidence)
                || !valid_rect(&span.rect)
        })
    {
        return Err("SIDERA_DOCUMENT_OCR_RESULT_INVALID".to_string());
    }
    let job_id = clean_job_id(&input.job_id)?;
    let manifest = document_reader_manifest(input.reader.clone())?;
    let page_label = document_page_text(input.reader.clone(), input.page_index)
        .map(|page| page.page_label)
        .unwrap_or_else(|_| (input.page_index + 1).to_string());
    let mut text = String::new();
    let mut offsets = Vec::with_capacity(input.spans.len());
    let mut cursor = 0u32;
    for (index, span) in input.spans.iter().enumerate() {
        if index > 0 {
            text.push('\n');
            cursor += 1;
        }
        let start = cursor;
        text.push_str(&span.text);
        cursor = cursor.saturating_add(span.text.encode_utf16().count() as u32);
        offsets.push((start, cursor));
    }
    if text.as_bytes().len() > 4 * 1024 * 1024 {
        return Err("SIDERA_DOCUMENT_OCR_RESULT_TOO_LARGE".to_string());
    }
    let text_sha256 = lowercase_hex(&Sha256::digest(text.as_bytes()));
    let mean_confidence = if input.spans.is_empty() {
        0.0
    } else {
        input.spans.iter().map(|span| span.confidence).sum::<f64>() / input.spans.len() as f64
    };
    let mut connection = open_write(&input.reader.library_directory)?;
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|_| "SIDERA_DOCUMENT_OCR_TRANSACTION_FAILED".to_string())?;
    let state: Option<String> = transaction
        .query_row(
            "SELECT state FROM document_ocr_jobs
             WHERE id=?1 AND project_id=?2 AND paper_id=?3 AND document_version_id=?4
                   AND document_sha256=?5 AND page_index=?6",
            params![
                job_id,
                input.reader.project_id,
                input.reader.paper_id,
                input.reader.document_version_id,
                manifest.version.sha256.to_ascii_lowercase(),
                input.page_index as i64,
            ],
            |row| row.get(0),
        )
        .optional()
        .map_err(|_| "SIDERA_DOCUMENT_OCR_READ_FAILED".to_string())?;
    if state.as_deref() != Some("running") {
        return Err("SIDERA_DOCUMENT_OCR_LATE_RESULT_REJECTED".to_string());
    }
    transaction
        .execute(
            "INSERT INTO document_ocr_pages(
               job_id,document_version_id,document_sha256,page_index,page_label,width,height,
               text,text_sha256,text_length_utf16,mean_confidence,model_id,model_revision,created_at_ms
             ) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)",
            params![
                job_id,
                input.reader.document_version_id,
                manifest.version.sha256.to_ascii_lowercase(),
                input.page_index as i64,
                page_label,
                input.page_width,
                input.page_height,
                text,
                text_sha256,
                cursor as i64,
                mean_confidence,
                DOCUMENT_OCR_MODEL_ID,
                DOCUMENT_OCR_MODEL_REVISION,
                input.now_ms,
            ],
        )
        .map_err(|_| "SIDERA_DOCUMENT_OCR_RESULT_WRITE_FAILED".to_string())?;
    {
        let mut statement = transaction
            .prepare(
                "INSERT INTO document_ocr_spans(
                   job_id,span_index,text,start_offset_utf16,end_offset_utf16,x,y,width,height,confidence
                 ) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
            )
            .map_err(|_| "SIDERA_DOCUMENT_OCR_RESULT_WRITE_FAILED".to_string())?;
        for (index, span) in input.spans.iter().enumerate() {
            let (start, end) = offsets[index];
            statement
                .execute(params![
                    job_id,
                    index as i64,
                    span.text,
                    start as i64,
                    end as i64,
                    span.rect.x,
                    span.rect.y,
                    span.rect.width,
                    span.rect.height,
                    span.confidence,
                ])
                .map_err(|_| "SIDERA_DOCUMENT_OCR_RESULT_WRITE_FAILED".to_string())?;
        }
    }
    transaction
        .execute(
            "UPDATE document_ocr_jobs SET state='superseded',updated_at_ms=?1,finished_at_ms=?1
             WHERE document_version_id=?2 AND page_index=?3 AND state='ready' AND id<>?4",
            params![
                input.now_ms,
                input.reader.document_version_id,
                input.page_index as i64,
                job_id,
            ],
        )
        .map_err(|_| "SIDERA_DOCUMENT_OCR_SUPERSEDE_FAILED".to_string())?;
    transaction
        .execute(
            "INSERT INTO document_ocr_active_results(document_version_id,page_index,job_id,activated_at_ms)
             VALUES(?1,?2,?3,?4)
             ON CONFLICT(document_version_id,page_index) DO UPDATE SET
               job_id=excluded.job_id,activated_at_ms=excluded.activated_at_ms",
            params![
                input.reader.document_version_id,
                input.page_index as i64,
                job_id,
                input.now_ms,
            ],
        )
        .map_err(|_| "SIDERA_DOCUMENT_OCR_ACTIVATE_FAILED".to_string())?;
    transaction
        .execute(
            "UPDATE document_ocr_jobs SET state='ready',error_code=NULL,updated_at_ms=?1,finished_at_ms=?1
             WHERE id=?2 AND state='running'",
            params![input.now_ms, job_id],
        )
        .map_err(|_| "SIDERA_DOCUMENT_OCR_TRANSITION_FAILED".to_string())?;
    transaction
        .execute(
            "UPDATE document_index_jobs SET state='superseded',fallback_reason='ocr-result-stale',
                    error_code=NULL,updated_at_ms=?1,finished_at_ms=?1
             WHERE document_version_id=?2 AND state='ready'",
            params![input.now_ms, input.reader.document_version_id],
        )
        .map_err(|_| "SIDERA_DOCUMENT_OCR_INDEX_STALE_FAILED".to_string())?;
    transaction
        .commit()
        .map_err(|_| "SIDERA_DOCUMENT_OCR_TRANSACTION_COMMIT_FAILED".to_string())?;
    snapshot_from_connection(&connection, &job_id)
}

pub fn document_ocr_snapshot(
    library_directory: &Path,
    job_id: &str,
) -> Result<SideraDocumentOcrSnapshot, String> {
    let job_id = clean_job_id(job_id)?;
    snapshot_from_connection(&open_read(library_directory)?, &job_id)
}

pub fn latest_document_ocr_snapshot(
    reader: &SideraDocumentReaderQuery,
    page_index: u32,
) -> Result<Option<SideraDocumentOcrSnapshot>, String> {
    let connection = match open_read(&reader.library_directory) {
        Ok(connection) => connection,
        Err(code) if code == "SIDERA_DOCUMENT_OCR_NOT_PREPARED" => return Ok(None),
        Err(code) => return Err(code),
    };
    let job_id: Option<String> = connection
        .query_row(
            "SELECT id FROM document_ocr_jobs
             WHERE project_id=?1 AND paper_id=?2 AND document_version_id=?3 AND page_index=?4
             ORDER BY updated_at_ms DESC,id DESC LIMIT 1",
            params![
                reader.project_id,
                reader.paper_id,
                reader.document_version_id,
                page_index as i64,
            ],
            |row| row.get(0),
        )
        .optional()
        .map_err(|_| "SIDERA_DOCUMENT_OCR_READ_FAILED".to_string())?;
    job_id
        .map(|job_id| snapshot_from_connection(&connection, &job_id))
        .transpose()
}

pub fn document_ocr_page_text(
    query: SideraDocumentReaderQuery,
    page_index: u32,
) -> Result<SideraDocumentPageText, String> {
    let manifest = document_reader_manifest(query.clone())?;
    let connection = open_read(&query.library_directory)?;
    let page = connection
        .query_row(
            "SELECT page.page_label,page.text,page.text_sha256,page.text_length_utf16,page.job_id
             FROM document_ocr_active_results active
             JOIN document_ocr_pages page ON page.job_id=active.job_id
             JOIN document_ocr_jobs job ON job.id=page.job_id
             WHERE active.document_version_id=?1 AND active.page_index=?2 AND job.state='ready'",
            params![query.document_version_id, page_index as i64],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, String>(4)?,
                ))
            },
        )
        .optional()
        .map_err(|_| "SIDERA_DOCUMENT_OCR_READ_FAILED".to_string())?
        .ok_or_else(|| "SIDERA_DOCUMENT_OCR_SOURCE_NOT_READY".to_string())?;
    let mut statement = connection
        .prepare(
            "SELECT text,start_offset_utf16,end_offset_utf16,x,y,width,height
             FROM document_ocr_spans WHERE job_id=?1 ORDER BY span_index",
        )
        .map_err(|_| "SIDERA_DOCUMENT_OCR_READ_FAILED".to_string())?;
    let spans = statement
        .query_map([&page.4], |row| {
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
        .map_err(|_| "SIDERA_DOCUMENT_OCR_READ_FAILED".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "SIDERA_DOCUMENT_OCR_READ_FAILED".to_string())?;
    Ok(SideraDocumentPageText {
        document_version_id: query.document_version_id,
        document_sha256: manifest.version.sha256.to_ascii_lowercase(),
        page_index,
        page_label: page.0,
        source_kind: "ocr".to_string(),
        text: page.1,
        text_sha256: page.2,
        text_length_utf16: page.3.max(0) as u32,
        spans,
    })
}

pub fn document_page_text_for_source(
    query: SideraDocumentReaderQuery,
    page_index: u32,
    preference: &str,
) -> Result<SideraDocumentPageText, String> {
    match preference {
        "native" => match document_page_text(query, page_index) {
            Ok(page) if !page.text.trim().is_empty() => Ok(page),
            Ok(_) => Err("SIDERA_DOCUMENT_NATIVE_SOURCE_NOT_READY".to_string()),
            Err(error) => Err(error),
        },
        "ocr" => document_ocr_page_text(query, page_index),
        "auto" => match document_page_text(query.clone(), page_index) {
            Ok(page) if !page.text.trim().is_empty() => Ok(page),
            Ok(_) | Err(_) => document_ocr_page_text(query, page_index),
        },
        _ => Err("SIDERA_DOCUMENT_SOURCE_PREFERENCE_INVALID".to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::document_agent::{
        prepare_document_agent_turn, search_document_agent_segments,
        SideraDocumentAgentReferenceInput, SideraReadingContextKind, SideraReadingContextScope,
    };
    use crate::document_derived::{
        finalize_document_parse, start_document_parse, submit_document_parse_page,
        SideraDocumentParsePageInput, SideraDocumentParseRunQuery, SideraDocumentParseStartInput,
    };
    use crate::document_index::{
        complete_document_index_segmenting, current_document_index, search_document_index,
        start_document_index, SideraDocumentIndexJobQuery, SideraDocumentIndexMode,
        SideraDocumentIndexQuery, SideraDocumentIndexSearchInput, SideraDocumentIndexStartInput,
    };
    use crate::document_store::{document_store_database_path, DOCUMENT_STORE_DIRECTORY};
    use std::fs;
    use std::sync::atomic::{AtomicU64, Ordering};

    static NEXT_FIXTURE: AtomicU64 = AtomicU64::new(1);

    fn fixture() -> (std::path::PathBuf, SideraDocumentReaderQuery, String) {
        let root = std::env::temp_dir().join(format!(
            "sidera-document-ocr-{}-{}",
            std::process::id(),
            NEXT_FIXTURE.fetch_add(1, Ordering::Relaxed)
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(
            root.join("Sidera")
                .join(DOCUMENT_STORE_DIRECTORY)
                .join("blobs/ab"),
        )
        .unwrap();
        let bytes = b"%PDF-1.7\nocr fixture\n%%EOF";
        let sha = lowercase_hex(&Sha256::digest(bytes));
        let relative = format!("blobs/ab/{sha}.pdf");
        fs::write(
            root.join("Sidera")
                .join(DOCUMENT_STORE_DIRECTORY)
                .join(&relative),
            bytes,
        )
        .unwrap();
        let store = Connection::open(document_store_database_path(&root)).unwrap();
        store
            .execute_batch(
                "CREATE TABLE documents(id TEXT PRIMARY KEY,project_id TEXT,paper_id TEXT);
                 CREATE TABLE document_versions(
                   id TEXT PRIMARY KEY,document_id TEXT,sha256 TEXT,mime_type TEXT,byte_size INTEGER,
                   storage_rel_path TEXT,original_file_name TEXT,version_kind TEXT);",
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
                "INSERT INTO document_versions VALUES(
                   'version-1','document-1',?1,'application/pdf',?2,?3,'fixture.pdf','user-import')",
                params![sha, bytes.len() as i64, relative],
            )
            .unwrap();
        let reader = SideraDocumentReaderQuery {
            library_directory: root.clone(),
            project_id: "project".to_string(),
            paper_id: "paper".to_string(),
            document_version_id: "version-1".to_string(),
        };
        let parse = start_document_parse(SideraDocumentParseStartInput {
            library_directory: root.clone(),
            project_id: "project".to_string(),
            paper_id: "paper".to_string(),
            document_version_id: "version-1".to_string(),
            expected_sha256: sha.clone(),
            parser_version: "pdfjs-ocr-test".to_string(),
            page_count: 1,
            now_ms: 1,
        })
        .unwrap();
        let run = SideraDocumentParseRunQuery {
            library_directory: root.clone(),
            project_id: "project".to_string(),
            paper_id: "paper".to_string(),
            document_version_id: "version-1".to_string(),
            run_id: parse.run_id,
            document_sha256: sha.clone(),
            parser_version: "pdfjs-ocr-test".to_string(),
        };
        submit_document_parse_page(SideraDocumentParsePageInput {
            run: run.clone(),
            page_index: 0,
            page_label: "1".to_string(),
            width: 612.0,
            height: 792.0,
            text: String::new(),
            spans: Vec::new(),
            now_ms: 2,
        })
        .unwrap();
        finalize_document_parse(run, 3).unwrap();
        (root, reader, sha)
    }

    #[test]
    fn ocr_limits_are_bounded_for_single_page_uploads() {
        assert_eq!(DOCUMENT_OCR_UPLOAD_TTL_MS, 30_000);
        assert_eq!(DOCUMENT_OCR_JOB_TIMEOUT_MS, 90_000);
        assert_eq!(DOCUMENT_OCR_MAX_BATCH_PAGES, 8);
        assert!(DOCUMENT_OCR_MAX_UPLOAD_BYTES <= 12 * 1024 * 1024);
        assert!(DOCUMENT_OCR_MAX_IMAGE_PIXELS <= 12_000_000);
    }

    #[test]
    fn ocr_rects_reject_non_finite_and_out_of_page_geometry() {
        assert!(valid_rect(&SideraDocumentEvidenceRect {
            x: 0.1,
            y: 0.2,
            width: 0.3,
            height: 0.4,
        }));
        assert!(!valid_rect(&SideraDocumentEvidenceRect {
            x: 0.8,
            y: 0.2,
            width: 0.3,
            height: 0.4,
        }));
        assert!(!valid_rect(&SideraDocumentEvidenceRect {
            x: f64::NAN,
            y: 0.0,
            width: 0.1,
            height: 0.1,
        }));
    }

    #[test]
    fn ocr_jobs_are_single_flight_cancel_idempotently_and_recover_expired_work() {
        let (root, reader, _) = fixture();
        let first = start_document_ocr(SideraDocumentOcrStartInput {
            reader: reader.clone(),
            page_index: 0,
            now_ms: 10,
        })
        .unwrap();
        assert_eq!(
            start_document_ocr(SideraDocumentOcrStartInput {
                reader: reader.clone(),
                page_index: 0,
                now_ms: 11,
            })
            .unwrap_err(),
            "SIDERA_DOCUMENT_OCR_BUSY"
        );

        let cancelled = cancel_document_ocr(&root, &first.job_id, 12).unwrap();
        assert_eq!(cancelled.state, SideraDocumentOcrState::Cancelled);
        let repeated = cancel_document_ocr(&root, &first.job_id, 13).unwrap();
        assert_eq!(repeated.state, SideraDocumentOcrState::Cancelled);

        let expired = start_document_ocr(SideraDocumentOcrStartInput {
            reader: reader.clone(),
            page_index: 0,
            now_ms: 20,
        })
        .unwrap();
        let recovered = start_document_ocr(SideraDocumentOcrStartInput {
            reader,
            page_index: 0,
            now_ms: 20 + DOCUMENT_OCR_JOB_TIMEOUT_MS,
        })
        .unwrap();
        assert_ne!(recovered.job_id, expired.job_id);
        let interrupted = document_ocr_snapshot(&root, &expired.job_id).unwrap();
        assert_eq!(interrupted.state, SideraDocumentOcrState::Failed);
        assert_eq!(
            interrupted.error_code.as_deref(),
            Some("SIDERA_DOCUMENT_OCR_INTERRUPTED")
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn ocr_result_is_atomic_persistent_and_rejects_late_commit_after_cancel() {
        let (root, reader, sha) = fixture();
        {
            let connection = Connection::open(document_derived_database_path(&root)).unwrap();
            let run_id = connection
                .query_row("SELECT id FROM parse_runs LIMIT 1", [], |row| {
                    row.get::<_, String>(0)
                })
                .unwrap();
            connection
                .execute(
                    "INSERT INTO document_index_jobs(
                       id,project_id,paper_id,document_version_id,document_sha256,run_id,
                       requested_mode,resolved_mode,state,stage,segment_count,embedded_count,
                       model_id,model_revision,created_at_ms,updated_at_ms,finished_at_ms
                     ) VALUES(
                       'ready-index','project','paper','version-1',?1,?2,
                       'auto','lexical','ready','complete',0,0,
                       'fixture-model','fixture-revision',4,4,4
                     )",
                    params![sha, run_id],
                )
                .unwrap();
        }
        assert_eq!(
            document_page_text_for_source(reader.clone(), 0, "native").unwrap_err(),
            "SIDERA_DOCUMENT_NATIVE_SOURCE_NOT_READY"
        );
        assert_eq!(
            document_page_text_for_source(reader.clone(), 0, "ocr").unwrap_err(),
            "SIDERA_DOCUMENT_OCR_SOURCE_NOT_READY"
        );
        let started = start_document_ocr(SideraDocumentOcrStartInput {
            reader: reader.clone(),
            page_index: 0,
            now_ms: 10,
        })
        .unwrap();
        queue_document_ocr(&root, &started.job_id, 11).unwrap();
        run_document_ocr(&root, &started.job_id, 12).unwrap();
        let ready = complete_document_ocr(SideraDocumentOcrCommitInput {
            reader: reader.clone(),
            job_id: started.job_id.clone(),
            page_index: 0,
            page_width: 1_224.0,
            page_height: 1_584.0,
            spans: vec![SideraDocumentOcrSpanInput {
                text: "证据🧠 evidence".to_string(),
                rect: SideraDocumentEvidenceRect {
                    x: 0.1,
                    y: 0.2,
                    width: 0.4,
                    height: 0.05,
                },
                confidence: 0.91,
            }],
            now_ms: 13,
        })
        .unwrap();
        assert_eq!(ready.state, SideraDocumentOcrState::Ready);
        {
            let connection = Connection::open(document_derived_database_path(&root)).unwrap();
            let index_status = connection
                .query_row(
                    "SELECT state,fallback_reason FROM document_index_jobs WHERE id='ready-index'",
                    [],
                    |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
                )
                .unwrap();
            assert_eq!(index_status.0, "superseded");
            assert_eq!(index_status.1, "ocr-result-stale");
        }
        let page = document_ocr_page_text(reader.clone(), 0).unwrap();
        assert_eq!(page.source_kind, "ocr");
        assert_eq!(page.text, "证据🧠 evidence");
        assert_eq!(
            page.text_length_utf16,
            page.text.encode_utf16().count() as u32
        );
        assert_eq!(
            document_page_text_for_source(reader.clone(), 0, "auto")
                .unwrap()
                .source_kind,
            "ocr"
        );
        let index_query = SideraDocumentIndexQuery {
            library_directory: root.clone(),
            project_id: "project".to_string(),
            paper_id: "paper".to_string(),
            document_version_id: "version-1".to_string(),
        };
        let index = start_document_index(SideraDocumentIndexStartInput {
            query: index_query.clone(),
            requested_mode: SideraDocumentIndexMode::Lexical,
            now_ms: 14,
        })
        .unwrap();
        let indexed = complete_document_index_segmenting(
            SideraDocumentIndexJobQuery {
                query: index_query.clone(),
                job_id: index.job_id,
            },
            15,
            || true,
        )
        .unwrap();
        assert_eq!(indexed.segment_count, 1);
        assert_eq!(
            current_document_index(index_query.clone())
                .unwrap()
                .unwrap()
                .job_id,
            indexed.job_id
        );
        let indexed_hits = search_document_index(SideraDocumentIndexSearchInput {
            query: index_query,
            text: "evidence".to_string(),
            requested_mode: SideraDocumentIndexMode::Auto,
            query_embedding: None,
            query_fallback_reason: None,
            limit: 8,
            offset: 0,
        })
        .unwrap();
        assert_eq!(indexed_hits.hits.len(), 1);
        assert_eq!(indexed_hits.hits[0].anchor.source_kind, "ocr");
        for kind in [
            SideraReadingContextKind::SelectedAnchor,
            SideraReadingContextKind::CurrentPage,
            SideraReadingContextKind::DocumentRetrieval,
        ] {
            let chosen_anchor = indexed_hits.hits[0].anchor.clone();
            let mut agent = prepare_document_agent_turn(
                &root,
                "project",
                SideraReadingContextScope {
                    kind,
                    paper_id: "paper".to_string(),
                    document_version_id: "version-1".to_string(),
                    page_index: (kind != SideraReadingContextKind::DocumentRetrieval).then_some(0),
                    anchor: (kind == SideraReadingContextKind::SelectedAnchor)
                        .then_some(chosen_anchor),
                },
            )
            .unwrap();
            let (hits, _) = search_document_agent_segments(
                &root, "project", &mut agent, "evidence", 8, None, None,
            )
            .unwrap();
            assert_eq!(hits.len(), 1);
            let segments = agent.read(vec![hits[0].segment_id.clone()]).unwrap();
            assert_eq!(segments[0].source_kind, "ocr");
            let citations = agent
                .finalize(vec![SideraDocumentAgentReferenceInput {
                    segment_id: hits[0].segment_id.clone(),
                    citation_index: 1,
                    role: "cited".to_string(),
                    relation_summary: "verified OCR page evidence".to_string(),
                }])
                .unwrap();
            assert_eq!(citations[0].kind, "document-anchor");
            assert_eq!(citations[0].page_index, Some(0));
            assert_eq!(citations[0].anchor.as_ref().unwrap().source_kind, "ocr");
        }

        let first_job_id = ready.job_id.clone();
        let cancelled = start_document_ocr(SideraDocumentOcrStartInput {
            reader: reader.clone(),
            page_index: 0,
            now_ms: 20,
        })
        .unwrap();
        queue_document_ocr(&root, &cancelled.job_id, 21).unwrap();
        run_document_ocr(&root, &cancelled.job_id, 22).unwrap();
        cancel_document_ocr(&root, &cancelled.job_id, 23).unwrap();
        assert_eq!(
            complete_document_ocr(SideraDocumentOcrCommitInput {
                reader,
                job_id: cancelled.job_id,
                page_index: 0,
                page_width: 1.0,
                page_height: 1.0,
                spans: Vec::new(),
                now_ms: 24,
            })
            .unwrap_err(),
            "SIDERA_DOCUMENT_OCR_LATE_RESULT_REJECTED"
        );
        let still_active = document_ocr_page_text(
            SideraDocumentReaderQuery {
                library_directory: root.clone(),
                project_id: "project".to_string(),
                paper_id: "paper".to_string(),
                document_version_id: "version-1".to_string(),
            },
            0,
        )
        .unwrap();
        assert_eq!(still_active.text, "证据🧠 evidence");

        let rerun_reader = SideraDocumentReaderQuery {
            library_directory: root.clone(),
            project_id: "project".to_string(),
            paper_id: "paper".to_string(),
            document_version_id: "version-1".to_string(),
        };
        let replacement = start_document_ocr(SideraDocumentOcrStartInput {
            reader: rerun_reader.clone(),
            page_index: 0,
            now_ms: 30,
        })
        .unwrap();
        queue_document_ocr(&root, &replacement.job_id, 31).unwrap();
        run_document_ocr(&root, &replacement.job_id, 32).unwrap();
        let replaced = complete_document_ocr(SideraDocumentOcrCommitInput {
            reader: rerun_reader.clone(),
            job_id: replacement.job_id.clone(),
            page_index: 0,
            page_width: 1_224.0,
            page_height: 1_584.0,
            spans: vec![SideraDocumentOcrSpanInput {
                text: "低置信 replacement".to_string(),
                rect: SideraDocumentEvidenceRect {
                    x: 0.2,
                    y: 0.3,
                    width: 0.5,
                    height: 0.07,
                },
                confidence: 0.27,
            }],
            now_ms: 33,
        })
        .unwrap();
        assert_eq!(replaced.state, SideraDocumentOcrState::Ready);
        assert_eq!(replaced.mean_confidence, Some(0.27));
        assert_eq!(
            document_ocr_snapshot(&root, &first_job_id).unwrap().state,
            SideraDocumentOcrState::Superseded
        );
        assert_eq!(
            document_page_text_for_source(rerun_reader, 0, "ocr")
                .unwrap()
                .text,
            "低置信 replacement"
        );
        let _ = fs::remove_dir_all(root);
    }
}
