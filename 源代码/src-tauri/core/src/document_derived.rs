use std::collections::HashMap;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock, Weak};
use std::time::Duration;
use std::time::UNIX_EPOCH;

use rusqlite::{
    params, Connection, OpenFlags, OptionalExtension, Transaction, TransactionBehavior,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::document_store::{document_store_database_path, DOCUMENT_STORE_DIRECTORY};

#[cfg(test)]
thread_local! {
    static PDF_BLOB_VALIDATION_COUNT: std::cell::Cell<u32> = const { std::cell::Cell::new(0) };
}

pub const DOCUMENT_DERIVED_SCHEMA_VERSION: i64 = 5;
pub const DOCUMENT_DERIVED_DATABASE: &str = "document-derived-v1.sqlite";
pub const DOCUMENT_DERIVED_INDEX_SCHEMA_INVALID: &str = "SIDERA_DOCUMENT_INDEX_SCHEMA_INVALID";
pub const DOCUMENT_PARSE_MAX_BYTES: u64 = 50 * 1024 * 1024;
pub const DOCUMENT_PARSE_MAX_PAGES: u32 = 300;
pub const DOCUMENT_PARSE_MAX_PAGE_TEXT_BYTES: usize = 4 * 1024 * 1024;
pub const DOCUMENT_PARSE_MAX_PAGE_SPANS: usize = 20_000;

const DERIVED_SCHEMA: &str = r#"
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS parse_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  paper_id TEXT NOT NULL,
  document_version_id TEXT NOT NULL,
  document_sha256 TEXT NOT NULL,
  parser_version TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('queued','running','ready','needs-ocr','failed','cancelled','stale')),
  expected_page_count INTEGER NOT NULL CHECK(expected_page_count BETWEEN 1 AND 300),
  pages_committed INTEGER NOT NULL DEFAULT 0,
  text_bearing_pages INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  finished_at_ms INTEGER
);
CREATE INDEX IF NOT EXISTS idx_parse_runs_version_updated
  ON parse_runs(document_version_id,updated_at_ms DESC,id DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_parse_runs_one_active_version
  ON parse_runs(document_version_id)
  WHERE state IN ('queued','running');

CREATE TABLE IF NOT EXISTS document_pages (
  run_id TEXT NOT NULL,
  page_index INTEGER NOT NULL,
  page_label TEXT NOT NULL,
  width REAL NOT NULL,
  height REAL NOT NULL,
  text TEXT NOT NULL,
  text_sha256 TEXT NOT NULL,
  text_length_utf16 INTEGER NOT NULL,
  span_count INTEGER NOT NULL,
  PRIMARY KEY(run_id,page_index),
  FOREIGN KEY(run_id) REFERENCES parse_runs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS page_spans (
  run_id TEXT NOT NULL,
  page_index INTEGER NOT NULL,
  span_index INTEGER NOT NULL,
  text TEXT NOT NULL,
  start_offset_utf16 INTEGER NOT NULL,
  end_offset_utf16 INTEGER NOT NULL,
  x REAL NOT NULL,
  y REAL NOT NULL,
  width REAL NOT NULL,
  height REAL NOT NULL,
  PRIMARY KEY(run_id,page_index,span_index),
  FOREIGN KEY(run_id,page_index) REFERENCES document_pages(run_id,page_index) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS page_anchors (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  document_version_id TEXT NOT NULL,
  document_sha256 TEXT NOT NULL,
  page_index INTEGER NOT NULL,
  span_index INTEGER,
  start_offset_utf16 INTEGER NOT NULL,
  end_offset_utf16 INTEGER NOT NULL,
  text_sha256 TEXT NOT NULL,
  FOREIGN KEY(run_id,page_index) REFERENCES document_pages(run_id,page_index) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_page_anchors_run_page
  ON page_anchors(run_id,page_index,start_offset_utf16,id);

CREATE VIRTUAL TABLE IF NOT EXISTS document_pages_fts USING fts5(
  run_id UNINDEXED,
  page_index UNINDEXED,
  text,
  tokenize='trigram'
);

CREATE TABLE IF NOT EXISTS document_index_jobs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  paper_id TEXT NOT NULL,
  document_version_id TEXT NOT NULL,
  document_sha256 TEXT NOT NULL,
  run_id TEXT NOT NULL,
  requested_mode TEXT NOT NULL CHECK(requested_mode IN ('auto','lexical','hybrid')),
  resolved_mode TEXT CHECK(resolved_mode IN ('lexical','hybrid')),
  state TEXT NOT NULL CHECK(state IN ('queued','running','paused','ready','failed','cancelled','superseded')),
  stage TEXT NOT NULL CHECK(stage IN ('segmenting','embedding','complete')),
  segment_count INTEGER NOT NULL DEFAULT 0,
  embedded_count INTEGER NOT NULL DEFAULT 0,
  model_id TEXT NOT NULL,
  model_revision TEXT NOT NULL,
  fallback_reason TEXT,
  error_code TEXT,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  finished_at_ms INTEGER,
  FOREIGN KEY(run_id) REFERENCES parse_runs(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_document_index_jobs_version_updated
  ON document_index_jobs(document_version_id,updated_at_ms DESC,id DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_document_index_jobs_one_active
  ON document_index_jobs(document_version_id) WHERE state IN ('queued','running','paused');

CREATE TABLE IF NOT EXISTS document_segments (
  job_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  id TEXT NOT NULL,
  document_version_id TEXT NOT NULL,
  document_sha256 TEXT NOT NULL,
  page_index INTEGER NOT NULL,
  source_kind TEXT NOT NULL CHECK(source_kind IN ('native','ocr')),
  start_offset_utf16 INTEGER NOT NULL,
  end_offset_utf16 INTEGER NOT NULL,
  text TEXT NOT NULL,
  text_sha256 TEXT NOT NULL,
  anchor_json TEXT NOT NULL,
  PRIMARY KEY(job_id,id),
  FOREIGN KEY(job_id) REFERENCES document_index_jobs(id) ON DELETE CASCADE,
  FOREIGN KEY(run_id,page_index) REFERENCES document_pages(run_id,page_index) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_document_segments_version_page
  ON document_segments(job_id,document_version_id,page_index,start_offset_utf16,id);

CREATE VIRTUAL TABLE IF NOT EXISTS document_segments_fts USING fts5(
  job_id UNINDEXED,
  run_id UNINDEXED,
  segment_id UNINDEXED,
  page_index UNINDEXED,
  text,
  tokenize='trigram'
);

CREATE TABLE IF NOT EXISTS document_segment_embeddings (
  job_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  segment_id TEXT NOT NULL,
  content_sha256 TEXT NOT NULL,
  model_id TEXT NOT NULL,
  model_revision TEXT NOT NULL,
  dimensions INTEGER NOT NULL CHECK(dimensions=384),
  encoding TEXT NOT NULL CHECK(encoding='float16-le'),
  vector_blob BLOB NOT NULL CHECK(length(vector_blob)=768),
  created_at_ms INTEGER NOT NULL,
  PRIMARY KEY(job_id,segment_id,model_id,model_revision,content_sha256),
  FOREIGN KEY(job_id,segment_id) REFERENCES document_segments(job_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_document_segment_embeddings_lookup
  ON document_segment_embeddings(job_id,model_id,model_revision,segment_id);

CREATE TABLE IF NOT EXISTS document_ocr_jobs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  paper_id TEXT NOT NULL,
  document_version_id TEXT NOT NULL,
  document_sha256 TEXT NOT NULL,
  page_index INTEGER NOT NULL CHECK(page_index BETWEEN 0 AND 299),
  model_id TEXT NOT NULL,
  model_revision TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN (
    'awaiting-upload','queued','running','ready','failed','cancelled','superseded'
  )),
  error_code TEXT,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  finished_at_ms INTEGER
);
CREATE INDEX IF NOT EXISTS idx_document_ocr_jobs_version_page_updated
  ON document_ocr_jobs(document_version_id,page_index,updated_at_ms DESC,id DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_document_ocr_jobs_one_active
  ON document_ocr_jobs(document_version_id,page_index)
  WHERE state IN ('awaiting-upload','queued','running');

CREATE TABLE IF NOT EXISTS document_ocr_pages (
  job_id TEXT PRIMARY KEY,
  document_version_id TEXT NOT NULL,
  document_sha256 TEXT NOT NULL,
  page_index INTEGER NOT NULL CHECK(page_index BETWEEN 0 AND 299),
  page_label TEXT NOT NULL,
  width REAL NOT NULL,
  height REAL NOT NULL,
  text TEXT NOT NULL,
  text_sha256 TEXT NOT NULL,
  text_length_utf16 INTEGER NOT NULL,
  mean_confidence REAL NOT NULL CHECK(mean_confidence BETWEEN 0.0 AND 1.0),
  model_id TEXT NOT NULL,
  model_revision TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  FOREIGN KEY(job_id) REFERENCES document_ocr_jobs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS document_ocr_spans (
  job_id TEXT NOT NULL,
  span_index INTEGER NOT NULL,
  text TEXT NOT NULL,
  start_offset_utf16 INTEGER NOT NULL,
  end_offset_utf16 INTEGER NOT NULL,
  x REAL NOT NULL,
  y REAL NOT NULL,
  width REAL NOT NULL,
  height REAL NOT NULL,
  confidence REAL NOT NULL CHECK(confidence BETWEEN 0.0 AND 1.0),
  PRIMARY KEY(job_id,span_index),
  FOREIGN KEY(job_id) REFERENCES document_ocr_pages(job_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS document_ocr_active_results (
  document_version_id TEXT NOT NULL,
  page_index INTEGER NOT NULL CHECK(page_index BETWEEN 0 AND 299),
  job_id TEXT NOT NULL,
  activated_at_ms INTEGER NOT NULL,
  PRIMARY KEY(document_version_id,page_index),
  FOREIGN KEY(job_id) REFERENCES document_ocr_pages(job_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS reader_states (
  project_id TEXT NOT NULL,
  paper_id TEXT NOT NULL,
  document_version_id TEXT NOT NULL,
  page_index INTEGER NOT NULL,
  scroll_offset REAL NOT NULL,
  zoom REAL NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  PRIMARY KEY(project_id,paper_id,document_version_id)
);
"#;

static DERIVED_PREPARE_LOCKS: OnceLock<Mutex<HashMap<PathBuf, Weak<Mutex<()>>>>> = OnceLock::new();

struct DerivedPreparePathLock {
    path: PathBuf,
    lock: Arc<Mutex<()>>,
}

impl DerivedPreparePathLock {
    fn acquire(path: PathBuf) -> Self {
        let registry = DERIVED_PREPARE_LOCKS.get_or_init(|| Mutex::new(HashMap::new()));
        let mut registry = registry
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        registry.retain(|_, entry| entry.strong_count() > 0);
        let lock = registry
            .get(&path)
            .and_then(Weak::upgrade)
            .unwrap_or_else(|| {
                let lock = Arc::new(Mutex::new(()));
                registry.insert(path.clone(), Arc::downgrade(&lock));
                lock
            });
        Self { path, lock }
    }
}

impl Drop for DerivedPreparePathLock {
    fn drop(&mut self) {
        let Some(registry) = DERIVED_PREPARE_LOCKS.get() else {
            return;
        };
        let mut registry = registry
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if Arc::strong_count(&self.lock) != 1 {
            return;
        }
        let owns_entry = registry
            .get(&self.path)
            .and_then(Weak::upgrade)
            .is_some_and(|entry| Arc::ptr_eq(&entry, &self.lock));
        if owns_entry {
            registry.remove(&self.path);
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SideraDocumentParseState {
    Queued,
    Running,
    Ready,
    NeedsOcr,
    Failed,
    Cancelled,
    Stale,
}

impl SideraDocumentParseState {
    fn as_str(&self) -> &'static str {
        match self {
            Self::Queued => "queued",
            Self::Running => "running",
            Self::Ready => "ready",
            Self::NeedsOcr => "needs-ocr",
            Self::Failed => "failed",
            Self::Cancelled => "cancelled",
            Self::Stale => "stale",
        }
    }

    fn from_str(value: &str) -> Result<Self, String> {
        match value {
            "queued" => Ok(Self::Queued),
            "running" => Ok(Self::Running),
            "ready" => Ok(Self::Ready),
            "needs-ocr" => Ok(Self::NeedsOcr),
            "failed" => Ok(Self::Failed),
            "cancelled" => Ok(Self::Cancelled),
            "stale" => Ok(Self::Stale),
            _ => Err("SIDERA_DOCUMENT_PARSE_STATE_INVALID".to_string()),
        }
    }
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SideraDocumentParseSnapshot {
    pub run_id: String,
    pub project_id: String,
    pub paper_id: String,
    pub document_version_id: String,
    pub document_sha256: String,
    pub parser_version: String,
    pub state: SideraDocumentParseState,
    pub expected_page_count: u32,
    pub pages_committed: u32,
    pub text_bearing_pages: u32,
    pub error_code: Option<String>,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
    pub finished_at_ms: Option<i64>,
}

#[derive(Clone, Debug)]
pub struct SideraDocumentParseStartInput {
    pub library_directory: PathBuf,
    pub project_id: String,
    pub paper_id: String,
    pub document_version_id: String,
    pub expected_sha256: String,
    pub parser_version: String,
    pub page_count: u32,
    pub now_ms: i64,
}

#[derive(Clone, Debug)]
pub struct SideraDocumentParseRunQuery {
    pub library_directory: PathBuf,
    pub project_id: String,
    pub paper_id: String,
    pub document_version_id: String,
    pub run_id: String,
    pub document_sha256: String,
    pub parser_version: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SideraDocumentTextSpanInput {
    pub text: String,
    pub start_offset_utf16: u32,
    pub end_offset_utf16: u32,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Clone, Debug)]
pub struct SideraDocumentParsePageInput {
    pub run: SideraDocumentParseRunQuery,
    pub page_index: u32,
    pub page_label: String,
    pub width: f64,
    pub height: f64,
    pub text: String,
    pub spans: Vec<SideraDocumentTextSpanInput>,
    pub now_ms: i64,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SideraDocumentPageAnchor {
    pub id: String,
    pub document_version_id: String,
    pub page_index: u32,
    pub span_index: Option<u32>,
    pub start_offset_utf16: u32,
    pub end_offset_utf16: u32,
    pub text_sha256: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SideraDocumentEvidenceRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SideraDocumentEvidenceAnchor {
    pub id: String,
    pub document_version_id: String,
    pub document_sha256: String,
    pub page_index: u32,
    pub page_label: String,
    pub source_kind: String,
    pub start_offset_utf16: u32,
    pub end_offset_utf16: u32,
    pub quote: String,
    pub quote_sha256: String,
    pub prefix: String,
    pub suffix: String,
    pub rects: Vec<SideraDocumentEvidenceRect>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SideraDocumentPageTextSpan {
    pub text: String,
    pub start_offset_utf16: u32,
    pub end_offset_utf16: u32,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SideraDocumentPageText {
    pub document_version_id: String,
    pub document_sha256: String,
    pub page_index: u32,
    pub page_label: String,
    pub source_kind: String,
    pub text: String,
    pub text_sha256: String,
    pub text_length_utf16: u32,
    pub spans: Vec<SideraDocumentPageTextSpan>,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SideraDocumentReaderPage {
    pub page_index: u32,
    pub page_label: String,
    pub width: f64,
    pub height: f64,
    pub text_length_utf16: u32,
    pub span_count: u32,
    pub anchor_count: u32,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SideraDocumentReaderState {
    pub project_id: String,
    pub paper_id: String,
    pub document_version_id: String,
    pub page_index: u32,
    pub scroll_offset: f64,
    pub zoom: f64,
    pub updated_at_ms: i64,
}

#[derive(Clone, Debug)]
pub struct SideraDocumentReaderStateInput {
    pub library_directory: PathBuf,
    pub project_id: String,
    pub paper_id: String,
    pub document_version_id: String,
    pub page_index: u32,
    pub scroll_offset: f64,
    pub zoom: f64,
    pub now_ms: i64,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SideraDocumentReaderVersion {
    pub id: String,
    pub sha256: String,
    pub mime_type: String,
    pub byte_size: u64,
    pub original_file_name: Option<String>,
    pub version_kind: String,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SideraDocumentReaderManifest {
    pub project_id: String,
    pub paper_id: String,
    pub document_id: String,
    pub version: SideraDocumentReaderVersion,
    pub resource_uri: String,
    pub parse: Option<SideraDocumentParseSnapshot>,
    pub pages: Vec<SideraDocumentReaderPage>,
    pub reader_state: Option<SideraDocumentReaderState>,
}

#[derive(Clone, Debug)]
pub struct SideraDocumentReaderQuery {
    pub library_directory: PathBuf,
    pub project_id: String,
    pub paper_id: String,
    pub document_version_id: String,
}

#[derive(Clone, Debug)]
pub struct SideraDocumentSearchInput {
    pub reader: SideraDocumentReaderQuery,
    pub query: String,
    pub limit: u32,
    pub offset: u32,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SideraDocumentSearchHit {
    pub page_index: u32,
    pub page_label: String,
    pub excerpt: String,
    pub score: f64,
    pub anchor_id: Option<String>,
    pub anchor: Option<SideraDocumentEvidenceAnchor>,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SideraDocumentSearchResult {
    pub run_id: String,
    pub total: u32,
    pub offset: u32,
    pub limit: u32,
    pub hits: Vec<SideraDocumentSearchHit>,
}

#[derive(Clone, Debug)]
struct StoredVersion {
    document_id: String,
    version: SideraDocumentReaderVersion,
    path: PathBuf,
}

#[derive(Clone, Debug)]
pub struct SideraDocumentResourceDescriptor {
    pub token: String,
    pub path: PathBuf,
    pub mime_type: String,
    pub byte_size: u64,
    pub sha256: String,
    pub modified_at_ns: u64,
}

#[derive(Clone, Copy, Debug)]
struct ValidatedPdfBlob {
    modified_at_ns: u64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SideraDocumentByteRange {
    pub start: u64,
    pub end: u64,
    pub partial: bool,
}

pub fn document_derived_database_path(library_directory: &Path) -> PathBuf {
    library_directory
        .join("Sidera")
        .join(DOCUMENT_DERIVED_DATABASE)
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

fn clean_sha256(value: &str) -> Result<String, String> {
    let value = value.trim().to_ascii_lowercase();
    if value.len() != 64 || !value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("SIDERA_DOCUMENT_PARSE_SHA256_INVALID".to_string());
    }
    Ok(value)
}

fn safe_relative_path(value: &str) -> Option<PathBuf> {
    let path = Path::new(value);
    if path.is_absolute()
        || path
            .components()
            .any(|part| !matches!(part, Component::Normal(_)))
    {
        return None;
    }
    Some(path.to_path_buf())
}

fn load_stored_version(query: &SideraDocumentReaderQuery) -> Result<StoredVersion, String> {
    let database = document_store_database_path(&query.library_directory);
    let connection = Connection::open_with_flags(database, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|_| "SIDERA_DOCUMENT_STORE_OPEN_FAILED".to_string())?;
    connection
        .pragma_update(None, "query_only", true)
        .map_err(|_| "SIDERA_DOCUMENT_STORE_PRAGMA_FAILED".to_string())?;
    let row = connection
        .query_row(
            "SELECT document.id,version.id,version.sha256,version.mime_type,version.byte_size,
                    version.storage_rel_path,version.original_file_name,version.version_kind
             FROM document_versions version
             JOIN documents document ON document.id=version.document_id
             WHERE document.project_id=?1 AND document.paper_id=?2 AND version.id=?3",
            params![query.project_id, query.paper_id, query.document_version_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, i64>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, Option<String>>(6)?,
                    row.get::<_, String>(7)?,
                ))
            },
        )
        .optional()
        .map_err(|_| "SIDERA_DOCUMENT_VERSION_READ_FAILED".to_string())?
        .ok_or_else(|| "SIDERA_DOCUMENT_VERSION_NOT_FOUND".to_string())?;
    if row.3 != "application/pdf" {
        return Err("SIDERA_DOCUMENT_PARSE_UNSUPPORTED_MIME".to_string());
    }
    let relative = safe_relative_path(&row.5)
        .ok_or_else(|| "SIDERA_DOCUMENT_STORAGE_PATH_INVALID".to_string())?;
    let root = query
        .library_directory
        .join("Sidera")
        .join(DOCUMENT_STORE_DIRECTORY);
    let path = root.join(relative);
    if !path.is_file() || !path.starts_with(&root) {
        return Err("SIDERA_DOCUMENT_FILE_UNAVAILABLE".to_string());
    }
    Ok(StoredVersion {
        document_id: row.0,
        version: SideraDocumentReaderVersion {
            id: row.1,
            sha256: row.2,
            mime_type: row.3,
            byte_size: row.4.max(0) as u64,
            original_file_name: row.6,
            version_kind: row.7,
        },
        path,
    })
}

fn modified_at_ns(metadata: &fs::Metadata) -> Result<u64, String> {
    let nanos = metadata
        .modified()
        .map_err(|_| "SIDERA_DOCUMENT_RESOURCE_METADATA_FAILED".to_string())?
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "SIDERA_DOCUMENT_RESOURCE_METADATA_FAILED".to_string())?
        .as_nanos();
    Ok(nanos.min(u64::MAX as u128) as u64)
}

fn validate_pdf_blob(stored: &StoredVersion) -> Result<ValidatedPdfBlob, String> {
    #[cfg(test)]
    PDF_BLOB_VALIDATION_COUNT.with(|count| count.set(count.get() + 1));
    let metadata =
        fs::metadata(&stored.path).map_err(|_| "SIDERA_DOCUMENT_FILE_UNAVAILABLE".to_string())?;
    if !metadata.is_file() || metadata.len() == 0 {
        return Err("SIDERA_DOCUMENT_PARSE_CORRUPT".to_string());
    }
    if metadata.len() > DOCUMENT_PARSE_MAX_BYTES {
        return Err("SIDERA_DOCUMENT_PARSE_SIZE_LIMIT_EXCEEDED".to_string());
    }
    if metadata.len() != stored.version.byte_size {
        return Err("SIDERA_DOCUMENT_PARSE_VERSION_SIZE_MISMATCH".to_string());
    }
    let bytes =
        fs::read(&stored.path).map_err(|_| "SIDERA_DOCUMENT_FILE_UNAVAILABLE".to_string())?;
    if !bytes.windows(5).take(1020).any(|window| window == b"%PDF-") {
        return Err("SIDERA_DOCUMENT_PARSE_CORRUPT".to_string());
    }
    if bytes.windows(8).any(|window| window == b"/Encrypt") {
        return Err("SIDERA_DOCUMENT_PARSE_ENCRYPTED".to_string());
    }
    let tail_start = bytes.len().saturating_sub(8192);
    if !bytes[tail_start..]
        .windows(5)
        .any(|window| window == b"%%EOF")
    {
        return Err("SIDERA_DOCUMENT_PARSE_CORRUPT".to_string());
    }
    if sha256_hex(&bytes) != stored.version.sha256.to_ascii_lowercase() {
        return Err("SIDERA_DOCUMENT_PARSE_VERSION_HASH_MISMATCH".to_string());
    }
    let initial_modified_at_ns = modified_at_ns(&metadata)?;
    let final_metadata =
        fs::metadata(&stored.path).map_err(|_| "SIDERA_DOCUMENT_FILE_UNAVAILABLE".to_string())?;
    let final_modified_at_ns = modified_at_ns(&final_metadata)?;
    if final_metadata.len() != metadata.len() || final_modified_at_ns != initial_modified_at_ns {
        return Err("SIDERA_DOCUMENT_RESOURCE_VERSION_CHANGED".to_string());
    }
    Ok(ValidatedPdfBlob {
        modified_at_ns: final_modified_at_ns,
    })
}

#[cfg(test)]
fn reset_pdf_blob_validation_count() {
    PDF_BLOB_VALIDATION_COUNT.with(|count| count.set(0));
}

#[cfg(test)]
fn pdf_blob_validation_count() -> u32 {
    PDF_BLOB_VALIDATION_COUNT.with(std::cell::Cell::get)
}

fn resource_token(stored: &StoredVersion) -> String {
    stable_id(
        "resource",
        &[
            &stored.path.to_string_lossy(),
            &stored.version.id,
            &stored.version.sha256,
        ],
    )
}

pub fn document_resource_descriptor(
    query: &SideraDocumentReaderQuery,
) -> Result<SideraDocumentResourceDescriptor, String> {
    let stored = load_stored_version(query)?;
    let validated = validate_pdf_blob(&stored)?;
    Ok(resource_descriptor_from_stored(&stored, validated))
}

fn resource_descriptor_from_stored(
    stored: &StoredVersion,
    validated: ValidatedPdfBlob,
) -> SideraDocumentResourceDescriptor {
    SideraDocumentResourceDescriptor {
        token: resource_token(&stored),
        path: stored.path.clone(),
        mime_type: stored.version.mime_type.clone(),
        byte_size: stored.version.byte_size,
        sha256: stored.version.sha256.clone(),
        modified_at_ns: validated.modified_at_ns,
    }
}

pub fn document_resource_fingerprint_matches(
    descriptor: &SideraDocumentResourceDescriptor,
    metadata: &fs::Metadata,
) -> bool {
    metadata.is_file()
        && metadata.len() == descriptor.byte_size
        && modified_at_ns(metadata).ok() == Some(descriptor.modified_at_ns)
}

pub fn parse_document_byte_range(
    header: Option<&str>,
    byte_size: u64,
) -> Result<SideraDocumentByteRange, String> {
    if byte_size == 0 {
        return Err("SIDERA_DOCUMENT_RANGE_NOT_SATISFIABLE".to_string());
    }
    let Some(header) = header.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(SideraDocumentByteRange {
            start: 0,
            end: byte_size - 1,
            partial: false,
        });
    };
    let value = header
        .strip_prefix("bytes=")
        .ok_or_else(|| "SIDERA_DOCUMENT_RANGE_NOT_SATISFIABLE".to_string())?;
    if value.contains(',') {
        return Err("SIDERA_DOCUMENT_RANGE_NOT_SATISFIABLE".to_string());
    }
    let (start, end) = value
        .split_once('-')
        .ok_or_else(|| "SIDERA_DOCUMENT_RANGE_NOT_SATISFIABLE".to_string())?;
    let (start, end) = if start.is_empty() {
        let suffix = end
            .parse::<u64>()
            .ok()
            .filter(|value| *value > 0)
            .ok_or_else(|| "SIDERA_DOCUMENT_RANGE_NOT_SATISFIABLE".to_string())?;
        (
            byte_size.saturating_sub(suffix.min(byte_size)),
            byte_size - 1,
        )
    } else {
        let start = start
            .parse::<u64>()
            .map_err(|_| "SIDERA_DOCUMENT_RANGE_NOT_SATISFIABLE".to_string())?;
        if start >= byte_size {
            return Err("SIDERA_DOCUMENT_RANGE_NOT_SATISFIABLE".to_string());
        }
        let end = if end.is_empty() {
            byte_size - 1
        } else {
            end.parse::<u64>()
                .map_err(|_| "SIDERA_DOCUMENT_RANGE_NOT_SATISFIABLE".to_string())?
                .min(byte_size - 1)
        };
        if end < start {
            return Err("SIDERA_DOCUMENT_RANGE_NOT_SATISFIABLE".to_string());
        }
        (start, end)
    };
    Ok(SideraDocumentByteRange {
        start,
        end,
        partial: true,
    })
}

fn configure_derived_write_connection(connection: &Connection) -> Result<(), String> {
    connection
        .busy_timeout(Duration::from_secs(2))
        .map_err(|_| "SIDERA_DOCUMENT_DERIVED_PRAGMA_FAILED".to_string())?;
    connection
        .execute_batch("PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;")
        .map_err(|_| "SIDERA_DOCUMENT_DERIVED_PRAGMA_FAILED".to_string())
}

fn validate_derived_schema_version(connection: &Connection) -> Result<i64, String> {
    connection
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(|_| "SIDERA_DOCUMENT_DERIVED_VERSION_FAILED".to_string())
}

fn index_table_columns(
    connection: &Connection,
    table: &str,
) -> Result<Vec<(String, String, i64, i64)>, String> {
    let mut statement = connection
        .prepare(&format!("PRAGMA table_info({table})"))
        .map_err(|_| DOCUMENT_DERIVED_INDEX_SCHEMA_INVALID.to_string())?;
    let columns = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i64>(3)?,
                row.get::<_, i64>(5)?,
            ))
        })
        .map_err(|_| DOCUMENT_DERIVED_INDEX_SCHEMA_INVALID.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| DOCUMENT_DERIVED_INDEX_SCHEMA_INVALID.to_string())?;
    Ok(columns)
}

fn validate_index_table_columns(
    connection: &Connection,
    table: &str,
    expected: &[(&str, &str, i64, i64)],
) -> Result<(), String> {
    let actual = index_table_columns(connection, table)?;
    let matches = actual.len() == expected.len()
        && actual.iter().zip(expected).all(
            |((name, declared_type, not_null, primary_key), expected)| {
                name == expected.0
                    && declared_type.eq_ignore_ascii_case(expected.1)
                    && *not_null == expected.2
                    && *primary_key == expected.3
            },
        );
    if matches {
        Ok(())
    } else {
        Err(DOCUMENT_DERIVED_INDEX_SCHEMA_INVALID.to_string())
    }
}

type IndexForeignKeyShape = (String, String, String, Vec<(String, String)>);

fn index_foreign_key_shape(
    connection: &Connection,
    table: &str,
) -> Result<Vec<IndexForeignKeyShape>, String> {
    let mut statement = connection
        .prepare(&format!("PRAGMA foreign_key_list({table})"))
        .map_err(|_| DOCUMENT_DERIVED_INDEX_SCHEMA_INVALID.to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, String>(6)?,
            ))
        })
        .map_err(|_| DOCUMENT_DERIVED_INDEX_SCHEMA_INVALID.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| DOCUMENT_DERIVED_INDEX_SCHEMA_INVALID.to_string())?;
    let mut grouped: HashMap<i64, (String, String, String, Vec<(i64, String, String)>)> =
        HashMap::new();
    for (id, sequence, target, source_column, target_column, on_update, on_delete) in rows {
        let group = grouped.entry(id).or_insert_with(|| {
            (
                target.clone(),
                on_update.clone(),
                on_delete.clone(),
                Vec::new(),
            )
        });
        if group.0 != target || group.1 != on_update || group.2 != on_delete {
            return Err(DOCUMENT_DERIVED_INDEX_SCHEMA_INVALID.to_string());
        }
        group.3.push((sequence, source_column, target_column));
    }
    let mut shape = grouped
        .into_values()
        .map(|(target, on_update, on_delete, mut columns)| {
            columns.sort_by_key(|column| column.0);
            (
                target,
                on_update,
                on_delete,
                columns
                    .into_iter()
                    .map(|(_, source, target)| (source, target))
                    .collect(),
            )
        })
        .collect::<Vec<_>>();
    shape.sort();
    Ok(shape)
}

fn validate_index_foreign_keys(
    connection: &Connection,
    table: &str,
    mut expected: Vec<IndexForeignKeyShape>,
) -> Result<(), String> {
    expected.sort();
    if index_foreign_key_shape(connection, table)? == expected {
        Ok(())
    } else {
        Err(DOCUMENT_DERIVED_INDEX_SCHEMA_INVALID.to_string())
    }
}

pub fn validate_document_derived_index_schema(connection: &Connection) -> Result<(), String> {
    validate_index_table_columns(
        connection,
        "document_index_jobs",
        &[
            ("id", "TEXT", 0, 1),
            ("project_id", "TEXT", 1, 0),
            ("paper_id", "TEXT", 1, 0),
            ("document_version_id", "TEXT", 1, 0),
            ("document_sha256", "TEXT", 1, 0),
            ("run_id", "TEXT", 1, 0),
            ("requested_mode", "TEXT", 1, 0),
            ("resolved_mode", "TEXT", 0, 0),
            ("state", "TEXT", 1, 0),
            ("stage", "TEXT", 1, 0),
            ("segment_count", "INTEGER", 1, 0),
            ("embedded_count", "INTEGER", 1, 0),
            ("model_id", "TEXT", 1, 0),
            ("model_revision", "TEXT", 1, 0),
            ("fallback_reason", "TEXT", 0, 0),
            ("error_code", "TEXT", 0, 0),
            ("created_at_ms", "INTEGER", 1, 0),
            ("updated_at_ms", "INTEGER", 1, 0),
            ("finished_at_ms", "INTEGER", 0, 0),
        ],
    )?;
    validate_index_foreign_keys(
        connection,
        "document_index_jobs",
        vec![(
            "parse_runs".to_string(),
            "NO ACTION".to_string(),
            "CASCADE".to_string(),
            vec![("run_id".to_string(), "id".to_string())],
        )],
    )?;
    validate_index_table_columns(
        connection,
        "document_segments",
        &[
            ("job_id", "TEXT", 1, 1),
            ("run_id", "TEXT", 1, 0),
            ("id", "TEXT", 1, 2),
            ("document_version_id", "TEXT", 1, 0),
            ("document_sha256", "TEXT", 1, 0),
            ("page_index", "INTEGER", 1, 0),
            ("source_kind", "TEXT", 1, 0),
            ("start_offset_utf16", "INTEGER", 1, 0),
            ("end_offset_utf16", "INTEGER", 1, 0),
            ("text", "TEXT", 1, 0),
            ("text_sha256", "TEXT", 1, 0),
            ("anchor_json", "TEXT", 1, 0),
        ],
    )?;
    validate_index_foreign_keys(
        connection,
        "document_segments",
        vec![
            (
                "document_index_jobs".to_string(),
                "NO ACTION".to_string(),
                "CASCADE".to_string(),
                vec![("job_id".to_string(), "id".to_string())],
            ),
            (
                "document_pages".to_string(),
                "NO ACTION".to_string(),
                "CASCADE".to_string(),
                vec![
                    ("run_id".to_string(), "run_id".to_string()),
                    ("page_index".to_string(), "page_index".to_string()),
                ],
            ),
        ],
    )?;
    validate_index_table_columns(
        connection,
        "document_segment_embeddings",
        &[
            ("job_id", "TEXT", 1, 1),
            ("run_id", "TEXT", 1, 0),
            ("segment_id", "TEXT", 1, 2),
            ("content_sha256", "TEXT", 1, 5),
            ("model_id", "TEXT", 1, 3),
            ("model_revision", "TEXT", 1, 4),
            ("dimensions", "INTEGER", 1, 0),
            ("encoding", "TEXT", 1, 0),
            ("vector_blob", "BLOB", 1, 0),
            ("created_at_ms", "INTEGER", 1, 0),
        ],
    )?;
    validate_index_foreign_keys(
        connection,
        "document_segment_embeddings",
        vec![(
            "document_segments".to_string(),
            "NO ACTION".to_string(),
            "CASCADE".to_string(),
            vec![
                ("job_id".to_string(), "job_id".to_string()),
                ("segment_id".to_string(), "id".to_string()),
            ],
        )],
    )?;
    validate_index_table_columns(
        connection,
        "document_segments_fts",
        &[
            ("job_id", "", 0, 0),
            ("run_id", "", 0, 0),
            ("segment_id", "", 0, 0),
            ("page_index", "", 0, 0),
            ("text", "", 0, 0),
        ],
    )?;
    let fts_sql = connection
        .query_row(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='document_segments_fts'",
            [],
            |row| row.get::<_, String>(0),
        )
        .map_err(|_| DOCUMENT_DERIVED_INDEX_SCHEMA_INVALID.to_string())?;
    let normalized = fts_sql
        .chars()
        .filter(|character| !character.is_whitespace())
        .collect::<String>()
        .to_ascii_lowercase();
    let canonical_prefix = normalized
        .starts_with("createvirtualtabledocument_segments_ftsusingfts5(")
        || normalized.starts_with("createvirtualtableifnotexistsdocument_segments_ftsusingfts5(");
    if !canonical_prefix
        || !normalized.contains("job_idunindexed")
        || !normalized.contains("run_idunindexed")
        || !normalized.contains("segment_idunindexed")
        || !normalized.contains("page_indexunindexed,text,tokenize='trigram'")
    {
        return Err(DOCUMENT_DERIVED_INDEX_SCHEMA_INVALID.to_string());
    }
    Ok(())
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum DocumentPagesSchemaShape {
    Missing,
    V1,
    V2,
}

fn document_pages_schema_shape(
    connection: &Connection,
) -> Result<DocumentPagesSchemaShape, String> {
    let exists: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='document_pages'",
            [],
            |row| row.get(0),
        )
        .map_err(|_| "SIDERA_DOCUMENT_DERIVED_MIGRATION_FAILED".to_string())?;
    if exists == 0 {
        return Ok(DocumentPagesSchemaShape::Missing);
    }
    let columns = {
        let mut statement = connection
            .prepare("PRAGMA table_info(document_pages)")
            .map_err(|_| "SIDERA_DOCUMENT_DERIVED_MIGRATION_FAILED".to_string())?;
        let rows = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, i64>(5)?,
                ))
            })
            .map_err(|_| "SIDERA_DOCUMENT_DERIVED_MIGRATION_FAILED".to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|_| "SIDERA_DOCUMENT_DERIVED_MIGRATION_FAILED".to_string())?
    };
    let expected_v1 = [
        ("run_id", "TEXT", 1_i64),
        ("page_index", "INTEGER", 2_i64),
        ("page_label", "TEXT", 0_i64),
        ("width", "REAL", 0_i64),
        ("height", "REAL", 0_i64),
        ("text", "TEXT", 0_i64),
        ("text_sha256", "TEXT", 0_i64),
        ("span_count", "INTEGER", 0_i64),
    ];
    let has_utf16 = columns
        .iter()
        .any(|(name, _, _, _)| name.as_str() == "text_length_utf16");
    let expected_len = expected_v1.len() + usize::from(has_utf16);
    let canonical_columns = columns.len() == expected_len
        && expected_v1.iter().all(|(name, declared_type, pk_order)| {
            columns
                .iter()
                .any(|(actual_name, actual_type, not_null, actual_pk)| {
                    actual_name.as_str() == *name
                        && actual_type.eq_ignore_ascii_case(declared_type)
                        && *not_null == 1
                        && *actual_pk == *pk_order
                })
        })
        && (!has_utf16
            || columns
                .iter()
                .any(|(name, declared_type, not_null, pk_order)| {
                    name.as_str() == "text_length_utf16"
                        && declared_type.eq_ignore_ascii_case("INTEGER")
                        && *not_null == 1
                        && *pk_order == 0
                }));
    if !canonical_columns {
        return Err("SIDERA_DOCUMENT_DERIVED_SCHEMA_RECOVERY_UNSAFE".to_string());
    }
    let foreign_keys = {
        let mut statement = connection
            .prepare("PRAGMA foreign_key_list(document_pages)")
            .map_err(|_| "SIDERA_DOCUMENT_DERIVED_MIGRATION_FAILED".to_string())?;
        let rows = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, String>(6)?,
                ))
            })
            .map_err(|_| "SIDERA_DOCUMENT_DERIVED_MIGRATION_FAILED".to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|_| "SIDERA_DOCUMENT_DERIVED_MIGRATION_FAILED".to_string())?
    };
    if foreign_keys.len() != 1
        || foreign_keys[0]
            != (
                "parse_runs".to_string(),
                "run_id".to_string(),
                "id".to_string(),
                "NO ACTION".to_string(),
                "CASCADE".to_string(),
            )
    {
        return Err("SIDERA_DOCUMENT_DERIVED_SCHEMA_RECOVERY_UNSAFE".to_string());
    }
    Ok(if has_utf16 {
        DocumentPagesSchemaShape::V2
    } else {
        DocumentPagesSchemaShape::V1
    })
}

fn backfill_derived_utf16_lengths(
    transaction: &Transaction<'_>,
    add_column: bool,
) -> Result<(), String> {
    if add_column {
        transaction
            .execute(
                "ALTER TABLE document_pages ADD COLUMN text_length_utf16 INTEGER NOT NULL DEFAULT 0",
                [],
            )
            .map_err(|_| "SIDERA_DOCUMENT_DERIVED_MIGRATION_FAILED".to_string())?;
    }
    let page_lengths = {
        let mut statement = transaction
            .prepare("SELECT run_id,page_index,text FROM document_pages")
            .map_err(|_| "SIDERA_DOCUMENT_DERIVED_MIGRATION_FAILED".to_string())?;
        let rows = statement
            .query_map([], |row| {
                let text = row.get::<_, String>(2)?;
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, i64>(1)?,
                    text.encode_utf16().count() as i64,
                ))
            })
            .map_err(|_| "SIDERA_DOCUMENT_DERIVED_MIGRATION_FAILED".to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|_| "SIDERA_DOCUMENT_DERIVED_MIGRATION_FAILED".to_string())?
    };
    for (run_id, page_index, text_length_utf16) in page_lengths {
        transaction
            .execute(
                "UPDATE document_pages SET text_length_utf16=?3 WHERE run_id=?1 AND page_index=?2",
                params![run_id, page_index, text_length_utf16],
            )
            .map_err(|_| "SIDERA_DOCUMENT_DERIVED_MIGRATION_FAILED".to_string())?;
    }
    Ok(())
}

fn ensure_parse_runs_parent(transaction: &Transaction<'_>) -> Result<(), String> {
    transaction
        .execute_batch(
            "CREATE TABLE IF NOT EXISTS parse_runs (
               id TEXT PRIMARY KEY,
               project_id TEXT NOT NULL,
               paper_id TEXT NOT NULL,
               document_version_id TEXT NOT NULL,
               document_sha256 TEXT NOT NULL,
               parser_version TEXT NOT NULL,
               state TEXT NOT NULL CHECK(state IN ('queued','running','ready','needs-ocr','failed','cancelled','stale')),
               expected_page_count INTEGER NOT NULL CHECK(expected_page_count BETWEEN 1 AND 300),
               pages_committed INTEGER NOT NULL DEFAULT 0,
               text_bearing_pages INTEGER NOT NULL DEFAULT 0,
               error_code TEXT,
               created_at_ms INTEGER NOT NULL,
               updated_at_ms INTEGER NOT NULL,
               finished_at_ms INTEGER
             );",
        )
        .map_err(|_| "SIDERA_DOCUMENT_DERIVED_SCHEMA_FAILED".to_string())
}

fn prepare_derived_schema_transaction(transaction: &Transaction<'_>) -> Result<(), String> {
    let version = validate_derived_schema_version(transaction)?;
    if version > DOCUMENT_DERIVED_SCHEMA_VERSION {
        return Err("SIDERA_DOCUMENT_DERIVED_TOO_NEW".to_string());
    }
    if version == DOCUMENT_DERIVED_SCHEMA_VERSION {
        validate_document_derived_index_schema(transaction)?;
        return Ok(());
    }
    if version != 0 && version != 1 && version != 2 && version != 3 && version != 4 {
        return Err("SIDERA_DOCUMENT_DERIVED_NOT_PREPARED".to_string());
    }
    let shape = document_pages_schema_shape(transaction)?;
    if version == 1 && shape == DocumentPagesSchemaShape::Missing {
        return Err("SIDERA_DOCUMENT_DERIVED_SCHEMA_RECOVERY_UNSAFE".to_string());
    }
    if shape == DocumentPagesSchemaShape::V1 || shape == DocumentPagesSchemaShape::V2 {
        ensure_parse_runs_parent(transaction)?;
        backfill_derived_utf16_lengths(transaction, shape == DocumentPagesSchemaShape::V1)?;
    }
    // Version 3 introduced the derived document index before its artifacts were scoped by job.
    // Version zero may also be left with partial, incompatible index tables after an interrupted
    // first preparation. Those artifacts are reproducible, so discard only these four index
    // tables while preserving parse pages, reader state, and every separate evidence database.
    if version == 0 || version == 3 {
        transaction
            .execute_batch(
                "DROP TABLE IF EXISTS document_segment_embeddings;
                 DROP TABLE IF EXISTS document_segments_fts;
                 DROP TABLE IF EXISTS document_segments;
                 DROP TABLE IF EXISTS document_index_jobs;",
            )
            .map_err(|_| "SIDERA_DOCUMENT_DERIVED_MIGRATION_FAILED".to_string())?;
    }
    transaction
        .execute_batch(DERIVED_SCHEMA)
        .map_err(|_| "SIDERA_DOCUMENT_DERIVED_SCHEMA_FAILED".to_string())?;
    validate_document_derived_index_schema(transaction)?;
    transaction
        .pragma_update(None, "user_version", DOCUMENT_DERIVED_SCHEMA_VERSION)
        .map_err(|_| "SIDERA_DOCUMENT_DERIVED_VERSION_FAILED".to_string())
}

fn prepare_derived_database(library_directory: &Path) -> Result<Connection, String> {
    let database = document_derived_database_path(library_directory);
    let prepare_lock = DerivedPreparePathLock::acquire(database.clone());
    let _prepare_guard = prepare_lock
        .lock
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let sidera = library_directory.join("Sidera");
    fs::create_dir_all(&sidera)
        .map_err(|_| "SIDERA_DOCUMENT_DERIVED_DIRECTORY_FAILED".to_string())?;
    let mut connection = Connection::open(database)
        .map_err(|_| "SIDERA_DOCUMENT_DERIVED_OPEN_FAILED".to_string())?;
    configure_derived_write_connection(&connection)?;
    connection
        .execute_batch("PRAGMA journal_mode=WAL;")
        .map_err(|_| "SIDERA_DOCUMENT_DERIVED_PRAGMA_FAILED".to_string())?;
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|_| "SIDERA_DOCUMENT_DERIVED_MIGRATION_FAILED".to_string())?;
    prepare_derived_schema_transaction(&transaction)?;
    transaction
        .commit()
        .map_err(|_| "SIDERA_DOCUMENT_DERIVED_MIGRATION_FAILED".to_string())?;
    Ok(connection)
}

pub fn prepare_document_derived_index_schema(library_directory: &Path) -> Result<(), String> {
    drop(prepare_derived_database(library_directory)?);
    Ok(())
}

fn open_derived_write_existing(library_directory: &Path) -> Result<Connection, String> {
    let path = document_derived_database_path(library_directory);
    if !path.is_file() {
        return Err("SIDERA_DOCUMENT_DERIVED_NOT_PREPARED".to_string());
    }
    let connection = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_WRITE)
        .map_err(|_| "SIDERA_DOCUMENT_DERIVED_OPEN_FAILED".to_string())?;
    configure_derived_write_connection(&connection)?;
    let version = validate_derived_schema_version(&connection)?;
    if version != DOCUMENT_DERIVED_SCHEMA_VERSION {
        return Err(if version > DOCUMENT_DERIVED_SCHEMA_VERSION {
            "SIDERA_DOCUMENT_DERIVED_TOO_NEW".to_string()
        } else {
            "SIDERA_DOCUMENT_DERIVED_NOT_PREPARED".to_string()
        });
    }
    Ok(connection)
}

fn open_or_prepare_derived_write(library_directory: &Path) -> Result<Connection, String> {
    if document_derived_database_path(library_directory).is_file() {
        match open_derived_write_existing(library_directory) {
            Ok(connection) => Ok(connection),
            Err(code) if code == "SIDERA_DOCUMENT_DERIVED_NOT_PREPARED" => {
                prepare_derived_database(library_directory)
            }
            Err(code) => Err(code),
        }
    } else {
        prepare_derived_database(library_directory)
    }
}

fn open_derived_read(library_directory: &Path) -> Result<Option<Connection>, String> {
    let path = document_derived_database_path(library_directory);
    if !path.is_file() {
        return Ok(None);
    }
    let connection = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|_| "SIDERA_DOCUMENT_DERIVED_OPEN_FAILED".to_string())?;
    connection
        .pragma_update(None, "query_only", true)
        .map_err(|_| "SIDERA_DOCUMENT_DERIVED_PRAGMA_FAILED".to_string())?;
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
    Ok(Some(connection))
}

fn parse_snapshot_from_connection(
    connection: &Connection,
    run_id: &str,
) -> Result<SideraDocumentParseSnapshot, String> {
    let row = connection
        .query_row(
            "SELECT id,project_id,paper_id,document_version_id,document_sha256,parser_version,
                    state,expected_page_count,pages_committed,text_bearing_pages,error_code,
                    created_at_ms,updated_at_ms,finished_at_ms
             FROM parse_runs WHERE id=?1",
            [run_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, String>(6)?,
                    row.get::<_, i64>(7)?,
                    row.get::<_, i64>(8)?,
                    row.get::<_, i64>(9)?,
                    row.get::<_, Option<String>>(10)?,
                    row.get::<_, i64>(11)?,
                    row.get::<_, i64>(12)?,
                    row.get::<_, Option<i64>>(13)?,
                ))
            },
        )
        .optional()
        .map_err(|_| "SIDERA_DOCUMENT_PARSE_READ_FAILED".to_string())?
        .ok_or_else(|| "SIDERA_DOCUMENT_PARSE_RUN_NOT_FOUND".to_string())?;
    Ok(SideraDocumentParseSnapshot {
        run_id: row.0,
        project_id: row.1,
        paper_id: row.2,
        document_version_id: row.3,
        document_sha256: row.4,
        parser_version: row.5,
        state: SideraDocumentParseState::from_str(&row.6)?,
        expected_page_count: row.7.max(0) as u32,
        pages_committed: row.8.max(0) as u32,
        text_bearing_pages: row.9.max(0) as u32,
        error_code: row.10,
        created_at_ms: row.11,
        updated_at_ms: row.12,
        finished_at_ms: row.13,
    })
}

fn validate_run_fence(
    snapshot: &SideraDocumentParseSnapshot,
    query: &SideraDocumentParseRunQuery,
) -> Result<(), String> {
    if snapshot.project_id != query.project_id
        || snapshot.paper_id != query.paper_id
        || snapshot.document_version_id != query.document_version_id
        || snapshot.document_sha256 != query.document_sha256.to_ascii_lowercase()
        || snapshot.parser_version != query.parser_version
    {
        return Err("SIDERA_DOCUMENT_PARSE_FENCE_MISMATCH".to_string());
    }
    Ok(())
}

pub fn start_document_parse(
    input: SideraDocumentParseStartInput,
) -> Result<SideraDocumentParseSnapshot, String> {
    let reader = SideraDocumentReaderQuery {
        library_directory: input.library_directory.clone(),
        project_id: clean_identity(&input.project_id, "SIDERA_DOCUMENT_PROJECT_INVALID")?,
        paper_id: clean_identity(&input.paper_id, "SIDERA_DOCUMENT_PAPER_INVALID")?,
        document_version_id: clean_identity(
            &input.document_version_id,
            "SIDERA_DOCUMENT_VERSION_INVALID",
        )?,
    };
    let expected_sha256 = clean_sha256(&input.expected_sha256)?;
    let parser_version = clean_identity(
        &input.parser_version,
        "SIDERA_DOCUMENT_PARSE_PARSER_VERSION_INVALID",
    )?;
    if input.page_count == 0 {
        return Err("SIDERA_DOCUMENT_PARSE_PAGE_COUNT_INVALID".to_string());
    }
    if input.page_count > DOCUMENT_PARSE_MAX_PAGES {
        return Err("SIDERA_DOCUMENT_PARSE_PAGE_LIMIT_EXCEEDED".to_string());
    }
    let stored = load_stored_version(&reader)?;
    if stored.version.sha256.to_ascii_lowercase() != expected_sha256 {
        return Err("SIDERA_DOCUMENT_PARSE_VERSION_HASH_MISMATCH".to_string());
    }
    let _ = validate_pdf_blob(&stored)?;

    let mut connection = prepare_derived_database(&input.library_directory)?;
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|_| "SIDERA_DOCUMENT_DERIVED_TRANSACTION_FAILED".to_string())?;
    let active_id = transaction
        .query_row(
            "SELECT id FROM parse_runs
             WHERE document_version_id=?1 AND document_sha256=?2 AND parser_version=?3
               AND expected_page_count=?4 AND state IN ('queued','running')
             ORDER BY updated_at_ms DESC,id DESC LIMIT 1",
            params![
                reader.document_version_id,
                expected_sha256,
                parser_version,
                input.page_count as i64
            ],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|_| "SIDERA_DOCUMENT_PARSE_READ_FAILED".to_string())?;
    if let Some(active_id) = active_id {
        let snapshot = parse_snapshot_from_connection(&transaction, &active_id)?;
        transaction
            .commit()
            .map_err(|_| "SIDERA_DOCUMENT_DERIVED_TRANSACTION_COMMIT_FAILED".to_string())?;
        return Ok(snapshot);
    }
    let existing_id = transaction
        .query_row(
            "SELECT id FROM parse_runs
             WHERE document_version_id=?1 AND document_sha256=?2 AND parser_version=?3
               AND expected_page_count=?4 AND state IN ('ready','needs-ocr')
             ORDER BY updated_at_ms DESC,id DESC LIMIT 1",
            params![
                reader.document_version_id,
                expected_sha256,
                parser_version,
                input.page_count as i64
            ],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|_| "SIDERA_DOCUMENT_PARSE_READ_FAILED".to_string())?;
    if let Some(existing_id) = existing_id {
        let snapshot = parse_snapshot_from_connection(&transaction, &existing_id)?;
        transaction
            .commit()
            .map_err(|_| "SIDERA_DOCUMENT_DERIVED_TRANSACTION_COMMIT_FAILED".to_string())?;
        return Ok(snapshot);
    }
    transaction
        .execute(
            "UPDATE parse_runs SET state='stale',error_code='SIDERA_DOCUMENT_PARSE_SUPERSEDED',
                    updated_at_ms=?2,finished_at_ms=?2
             WHERE document_version_id=?1 AND state IN ('queued','running','ready','needs-ocr')",
            params![reader.document_version_id, input.now_ms],
        )
        .map_err(|_| "SIDERA_DOCUMENT_PARSE_WRITE_FAILED".to_string())?;
    let generation = transaction
        .query_row(
            "SELECT COALESCE(MAX(rowid),0)+1 FROM parse_runs",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|_| "SIDERA_DOCUMENT_PARSE_READ_FAILED".to_string())?;
    let run_id = stable_id(
        "parse",
        &[
            &reader.document_version_id,
            &expected_sha256,
            &parser_version,
            &input.now_ms.to_string(),
            &generation.to_string(),
        ],
    );
    transaction
        .execute(
            "INSERT INTO parse_runs
             (id,project_id,paper_id,document_version_id,document_sha256,parser_version,state,
              expected_page_count,pages_committed,text_bearing_pages,error_code,
              created_at_ms,updated_at_ms,finished_at_ms)
             VALUES(?1,?2,?3,?4,?5,?6,'running',?7,0,0,NULL,?8,?8,NULL)",
            params![
                run_id,
                reader.project_id,
                reader.paper_id,
                reader.document_version_id,
                expected_sha256,
                parser_version,
                input.page_count as i64,
                input.now_ms
            ],
        )
        .map_err(|_| "SIDERA_DOCUMENT_PARSE_WRITE_FAILED".to_string())?;
    let snapshot = parse_snapshot_from_connection(&transaction, &run_id)?;
    transaction
        .commit()
        .map_err(|_| "SIDERA_DOCUMENT_DERIVED_TRANSACTION_COMMIT_FAILED".to_string())?;
    Ok(snapshot)
}

pub fn document_parse_snapshot(
    query: SideraDocumentParseRunQuery,
) -> Result<SideraDocumentParseSnapshot, String> {
    let connection = open_derived_read(&query.library_directory)?
        .ok_or_else(|| "SIDERA_DOCUMENT_PARSE_RUN_NOT_FOUND".to_string())?;
    let snapshot = parse_snapshot_from_connection(&connection, &query.run_id)?;
    validate_run_fence(&snapshot, &query)?;
    Ok(snapshot)
}

fn validate_page(input: &SideraDocumentParsePageInput) -> Result<(), String> {
    if input.page_label.trim().is_empty() || input.page_label.len() > 64 {
        return Err("SIDERA_DOCUMENT_PARSE_PAGE_LABEL_INVALID".to_string());
    }
    if !input.width.is_finite()
        || !input.height.is_finite()
        || input.width <= 0.0
        || input.height <= 0.0
    {
        return Err("SIDERA_DOCUMENT_PARSE_PAGE_GEOMETRY_INVALID".to_string());
    }
    if input.text.len() > DOCUMENT_PARSE_MAX_PAGE_TEXT_BYTES {
        return Err("SIDERA_DOCUMENT_PARSE_PAGE_TEXT_LIMIT_EXCEEDED".to_string());
    }
    if input.spans.len() > DOCUMENT_PARSE_MAX_PAGE_SPANS {
        return Err("SIDERA_DOCUMENT_PARSE_PAGE_SPAN_LIMIT_EXCEEDED".to_string());
    }
    let text_len_utf16 = input.text.encode_utf16().count() as u32;
    for span in &input.spans {
        if span.start_offset_utf16 > span.end_offset_utf16
            || span.end_offset_utf16 > text_len_utf16
            || span.text.len() > 256 * 1024
            || ![span.x, span.y, span.width, span.height]
                .iter()
                .all(|value| value.is_finite())
            || span.x < 0.0
            || span.y < 0.0
            || span.width < 0.0
            || span.height < 0.0
            || span.x + span.width > 1.000_001
            || span.y + span.height > 1.000_001
        {
            return Err("SIDERA_DOCUMENT_PARSE_SPAN_INVALID".to_string());
        }
        let expected_text =
            utf16_slice(&input.text, span.start_offset_utf16, span.end_offset_utf16)
                .ok_or_else(|| "SIDERA_DOCUMENT_PARSE_SPAN_INVALID".to_string())?;
        if span.text != expected_text {
            return Err("SIDERA_DOCUMENT_PARSE_SPAN_TEXT_MISMATCH".to_string());
        }
    }
    Ok(())
}

fn insert_anchor(
    transaction: &Transaction<'_>,
    input: &SideraDocumentParsePageInput,
    span_index: Option<u32>,
    start_offset_utf16: u32,
    end_offset_utf16: u32,
    text: &str,
) -> Result<String, String> {
    let text_sha256 = sha256_hex(text.as_bytes());
    let anchor_sequence = span_index
        .map(|value| value.to_string())
        .unwrap_or_else(|| "page".to_string());
    let anchor_id = stable_id(
        "anchor",
        &[
            &input.run.run_id,
            &input.run.document_sha256,
            &input.page_index.to_string(),
            &anchor_sequence,
            &start_offset_utf16.to_string(),
            &end_offset_utf16.to_string(),
            &text_sha256,
        ],
    );
    transaction
        .execute(
            "INSERT INTO page_anchors
             (id,run_id,document_version_id,document_sha256,page_index,span_index,
              start_offset_utf16,end_offset_utf16,text_sha256)
             VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)",
            params![
                anchor_id,
                input.run.run_id,
                input.run.document_version_id,
                input.run.document_sha256,
                input.page_index as i64,
                span_index.map(i64::from),
                start_offset_utf16 as i64,
                end_offset_utf16 as i64,
                text_sha256
            ],
        )
        .map_err(|_| "SIDERA_DOCUMENT_PARSE_ANCHOR_WRITE_FAILED".to_string())?;
    Ok(anchor_id)
}

pub fn submit_document_parse_page(
    input: SideraDocumentParsePageInput,
) -> Result<SideraDocumentParseSnapshot, String> {
    validate_page(&input)?;
    let mut connection = open_derived_write_existing(&input.run.library_directory)?;
    let transaction = connection
        .transaction()
        .map_err(|_| "SIDERA_DOCUMENT_DERIVED_TRANSACTION_FAILED".to_string())?;
    let snapshot = parse_snapshot_from_connection(&transaction, &input.run.run_id)?;
    validate_run_fence(&snapshot, &input.run)?;
    if snapshot.state != SideraDocumentParseState::Running {
        return Err("SIDERA_DOCUMENT_PARSE_NOT_RUNNING".to_string());
    }
    if input.page_index != snapshot.pages_committed
        || input.page_index >= snapshot.expected_page_count
    {
        return Err("SIDERA_DOCUMENT_PARSE_PAGE_SEQUENCE_INVALID".to_string());
    }
    let text_sha256 = sha256_hex(input.text.as_bytes());
    transaction
        .execute(
            "INSERT INTO document_pages
             (run_id,page_index,page_label,width,height,text,text_sha256,text_length_utf16,span_count)
             VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)",
            params![
                input.run.run_id,
                input.page_index as i64,
                input.page_label.trim(),
                input.width,
                input.height,
                input.text,
                text_sha256,
                input.text.encode_utf16().count() as i64,
                input.spans.len() as i64
            ],
        )
        .map_err(|_| "SIDERA_DOCUMENT_PARSE_PAGE_WRITE_FAILED".to_string())?;
    if input.spans.is_empty() {
        insert_anchor(
            &transaction,
            &input,
            None,
            0,
            input.text.encode_utf16().count() as u32,
            &input.text,
        )?;
    } else {
        for (index, span) in input.spans.iter().enumerate() {
            transaction
                .execute(
                    "INSERT INTO page_spans
                     (run_id,page_index,span_index,text,start_offset_utf16,end_offset_utf16,
                      x,y,width,height)
                     VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
                    params![
                        input.run.run_id,
                        input.page_index as i64,
                        index as i64,
                        span.text,
                        span.start_offset_utf16 as i64,
                        span.end_offset_utf16 as i64,
                        span.x,
                        span.y,
                        span.width,
                        span.height
                    ],
                )
                .map_err(|_| "SIDERA_DOCUMENT_PARSE_SPAN_WRITE_FAILED".to_string())?;
            insert_anchor(
                &transaction,
                &input,
                Some(index as u32),
                span.start_offset_utf16,
                span.end_offset_utf16,
                &span.text,
            )?;
        }
    }
    transaction
        .execute(
            "INSERT INTO document_pages_fts(run_id,page_index,text) VALUES(?1,?2,?3)",
            params![input.run.run_id, input.page_index.to_string(), input.text],
        )
        .map_err(|_| "SIDERA_DOCUMENT_PARSE_INDEX_WRITE_FAILED".to_string())?;
    let text_bearing = i64::from(!input.text.trim().is_empty());
    transaction
        .execute(
            "UPDATE parse_runs
             SET pages_committed=pages_committed+1,
                 text_bearing_pages=text_bearing_pages+?2,updated_at_ms=?3
             WHERE id=?1",
            params![input.run.run_id, text_bearing, input.now_ms],
        )
        .map_err(|_| "SIDERA_DOCUMENT_PARSE_WRITE_FAILED".to_string())?;
    let snapshot = parse_snapshot_from_connection(&transaction, &input.run.run_id)?;
    transaction
        .commit()
        .map_err(|_| "SIDERA_DOCUMENT_DERIVED_TRANSACTION_COMMIT_FAILED".to_string())?;
    Ok(snapshot)
}

pub fn finalize_document_parse(
    query: SideraDocumentParseRunQuery,
    now_ms: i64,
) -> Result<SideraDocumentParseSnapshot, String> {
    let mut connection = open_derived_write_existing(&query.library_directory)?;
    let transaction = connection
        .transaction()
        .map_err(|_| "SIDERA_DOCUMENT_DERIVED_TRANSACTION_FAILED".to_string())?;
    let snapshot = parse_snapshot_from_connection(&transaction, &query.run_id)?;
    validate_run_fence(&snapshot, &query)?;
    if snapshot.state != SideraDocumentParseState::Running {
        return Err("SIDERA_DOCUMENT_PARSE_NOT_RUNNING".to_string());
    }
    if snapshot.pages_committed != snapshot.expected_page_count {
        return Err("SIDERA_DOCUMENT_PARSE_INCOMPLETE".to_string());
    }
    let (state, error_code) = if snapshot.text_bearing_pages == 0 {
        (
            SideraDocumentParseState::NeedsOcr,
            Some("SIDERA_DOCUMENT_PARSE_NEEDS_OCR"),
        )
    } else {
        (SideraDocumentParseState::Ready, None)
    };
    transaction
        .execute(
            "UPDATE parse_runs SET state=?2,error_code=?3,updated_at_ms=?4,finished_at_ms=?4
             WHERE id=?1",
            params![query.run_id, state.as_str(), error_code, now_ms],
        )
        .map_err(|_| "SIDERA_DOCUMENT_PARSE_WRITE_FAILED".to_string())?;
    let snapshot = parse_snapshot_from_connection(&transaction, &query.run_id)?;
    transaction
        .commit()
        .map_err(|_| "SIDERA_DOCUMENT_DERIVED_TRANSACTION_COMMIT_FAILED".to_string())?;
    Ok(snapshot)
}

pub fn cancel_document_parse(
    query: SideraDocumentParseRunQuery,
    now_ms: i64,
) -> Result<SideraDocumentParseSnapshot, String> {
    let mut connection = open_derived_write_existing(&query.library_directory)?;
    let transaction = connection
        .transaction()
        .map_err(|_| "SIDERA_DOCUMENT_DERIVED_TRANSACTION_FAILED".to_string())?;
    let snapshot = parse_snapshot_from_connection(&transaction, &query.run_id)?;
    validate_run_fence(&snapshot, &query)?;
    if matches!(
        snapshot.state,
        SideraDocumentParseState::Queued | SideraDocumentParseState::Running
    ) {
        transaction
            .execute(
                "UPDATE parse_runs SET state='cancelled',error_code='SIDERA_DOCUMENT_PARSE_CANCELLED',
                        updated_at_ms=?2,finished_at_ms=?2 WHERE id=?1",
                params![query.run_id, now_ms],
            )
            .map_err(|_| "SIDERA_DOCUMENT_PARSE_WRITE_FAILED".to_string())?;
    }
    let snapshot = parse_snapshot_from_connection(&transaction, &query.run_id)?;
    transaction
        .commit()
        .map_err(|_| "SIDERA_DOCUMENT_DERIVED_TRANSACTION_COMMIT_FAILED".to_string())?;
    Ok(snapshot)
}

fn latest_parse_for_version(
    connection: &Connection,
    version_id: &str,
) -> Result<Option<SideraDocumentParseSnapshot>, String> {
    let run_id = connection
        .query_row(
            "SELECT id FROM parse_runs
             WHERE document_version_id=?1 AND state IN ('running','ready','needs-ocr')
             ORDER BY updated_at_ms DESC,id DESC LIMIT 1",
            [version_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|_| "SIDERA_DOCUMENT_PARSE_READ_FAILED".to_string())?;
    run_id
        .map(|run_id| parse_snapshot_from_connection(connection, &run_id))
        .transpose()
}

fn latest_ready_parse_for_version(
    connection: &Connection,
    version_id: &str,
) -> Result<Option<SideraDocumentParseSnapshot>, String> {
    let run_id = connection
        .query_row(
            "SELECT id FROM parse_runs
             WHERE document_version_id=?1 AND state='ready'
             ORDER BY updated_at_ms DESC,id DESC LIMIT 1",
            [version_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|_| "SIDERA_DOCUMENT_PARSE_READ_FAILED".to_string())?;
    run_id
        .map(|run_id| parse_snapshot_from_connection(connection, &run_id))
        .transpose()
}

fn reader_state_from_connection(
    connection: &Connection,
    query: &SideraDocumentReaderQuery,
) -> Result<Option<SideraDocumentReaderState>, String> {
    connection
        .query_row(
            "SELECT project_id,paper_id,document_version_id,page_index,scroll_offset,zoom,updated_at_ms
             FROM reader_states WHERE project_id=?1 AND paper_id=?2 AND document_version_id=?3",
            params![query.project_id, query.paper_id, query.document_version_id],
            |row| {
                Ok(SideraDocumentReaderState {
                    project_id: row.get(0)?,
                    paper_id: row.get(1)?,
                    document_version_id: row.get(2)?,
                    page_index: row.get::<_, i64>(3)?.max(0) as u32,
                    scroll_offset: row.get(4)?,
                    zoom: row.get(5)?,
                    updated_at_ms: row.get(6)?,
                })
            },
        )
        .optional()
        .map_err(|_| "SIDERA_DOCUMENT_READER_STATE_READ_FAILED".to_string())
}

fn reader_manifest_from_stored(
    query: SideraDocumentReaderQuery,
) -> Result<
    (
        SideraDocumentReaderManifest,
        SideraDocumentResourceDescriptor,
    ),
    String,
> {
    let stored = load_stored_version(&query)?;
    let validated = validate_pdf_blob(&stored)?;
    let descriptor = resource_descriptor_from_stored(&stored, validated);
    let resource_uri = format!(
        "sidera-document://localhost/version/{}",
        resource_token(&stored)
    );
    let mut parse = None;
    let mut pages = Vec::new();
    let mut reader_state = None;
    if let Some(connection) = open_derived_read(&query.library_directory)? {
        parse = latest_parse_for_version(&connection, &query.document_version_id)?;
        if let Some(snapshot) = parse.as_ref() {
            let mut statement = connection
                .prepare(
                    "SELECT page.page_index,page.page_label,page.width,page.height,page.text_length_utf16,
                            page.span_count,COUNT(anchor.id)
                     FROM document_pages page
                     LEFT JOIN page_anchors anchor
                       ON anchor.run_id=page.run_id AND anchor.page_index=page.page_index
                     WHERE page.run_id=?1
                     GROUP BY page.run_id,page.page_index,page.page_label,page.width,page.height,
                              page.text_length_utf16,page.span_count
                     ORDER BY page.page_index",
                )
                .map_err(|_| "SIDERA_DOCUMENT_READER_MANIFEST_READ_FAILED".to_string())?;
            pages = statement
                .query_map([&snapshot.run_id], |row| {
                    Ok(SideraDocumentReaderPage {
                        page_index: row.get::<_, i64>(0)?.max(0) as u32,
                        page_label: row.get(1)?,
                        width: row.get(2)?,
                        height: row.get(3)?,
                        text_length_utf16: row.get::<_, i64>(4)?.max(0) as u32,
                        span_count: row.get::<_, i64>(5)?.max(0) as u32,
                        anchor_count: row.get::<_, i64>(6)?.max(0) as u32,
                    })
                })
                .map_err(|_| "SIDERA_DOCUMENT_READER_MANIFEST_READ_FAILED".to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|_| "SIDERA_DOCUMENT_READER_MANIFEST_READ_FAILED".to_string())?;
        }
        reader_state = reader_state_from_connection(&connection, &query)?;
    }
    Ok((
        SideraDocumentReaderManifest {
            project_id: query.project_id,
            paper_id: query.paper_id,
            document_id: stored.document_id,
            resource_uri,
            version: stored.version,
            parse,
            pages,
            reader_state,
        },
        descriptor,
    ))
}

pub fn prepare_document_reader_manifest(
    query: SideraDocumentReaderQuery,
) -> Result<
    (
        SideraDocumentReaderManifest,
        SideraDocumentResourceDescriptor,
    ),
    String,
> {
    reader_manifest_from_stored(query)
}

pub fn document_reader_manifest(
    query: SideraDocumentReaderQuery,
) -> Result<SideraDocumentReaderManifest, String> {
    prepare_document_reader_manifest(query).map(|(manifest, _)| manifest)
}

pub fn document_reader_state(
    query: SideraDocumentReaderQuery,
) -> Result<Option<SideraDocumentReaderState>, String> {
    load_stored_version(&query)?;
    let Some(connection) = open_derived_read(&query.library_directory)? else {
        return Ok(None);
    };
    reader_state_from_connection(&connection, &query)
}

pub fn save_document_reader_state(
    input: SideraDocumentReaderStateInput,
) -> Result<SideraDocumentReaderState, String> {
    let query = SideraDocumentReaderQuery {
        library_directory: input.library_directory.clone(),
        project_id: input.project_id,
        paper_id: input.paper_id,
        document_version_id: input.document_version_id,
    };
    load_stored_version(&query)?;
    if input.page_index >= DOCUMENT_PARSE_MAX_PAGES
        || !input.scroll_offset.is_finite()
        || input.scroll_offset < 0.0
        || !input.zoom.is_finite()
        || !(0.25..=8.0).contains(&input.zoom)
    {
        return Err("SIDERA_DOCUMENT_READER_STATE_INVALID".to_string());
    }
    let connection = open_or_prepare_derived_write(&input.library_directory)?;
    connection
        .execute(
            "INSERT INTO reader_states
             (project_id,paper_id,document_version_id,page_index,scroll_offset,zoom,updated_at_ms)
             VALUES(?1,?2,?3,?4,?5,?6,?7)
             ON CONFLICT(project_id,paper_id,document_version_id) DO UPDATE SET
               page_index=excluded.page_index,scroll_offset=excluded.scroll_offset,
               zoom=excluded.zoom,updated_at_ms=excluded.updated_at_ms",
            params![
                query.project_id,
                query.paper_id,
                query.document_version_id,
                input.page_index as i64,
                input.scroll_offset,
                input.zoom,
                input.now_ms
            ],
        )
        .map_err(|_| "SIDERA_DOCUMENT_READER_STATE_WRITE_FAILED".to_string())?;
    reader_state_from_connection(&connection, &query)?
        .ok_or_else(|| "SIDERA_DOCUMENT_READER_STATE_WRITE_FAILED".to_string())
}

fn byte_index_for_utf16_offset(value: &str, target: u32) -> Option<usize> {
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
    if start > end {
        return None;
    }
    let start = byte_index_for_utf16_offset(value, start)?;
    let end = byte_index_for_utf16_offset(value, end)?;
    value.get(start..end)
}

fn utf16_offset_for_byte(value: &str, byte_index: usize) -> Option<u32> {
    value
        .get(..byte_index)
        .map(|prefix| prefix.encode_utf16().count() as u32)
}

fn bounded_prefix(value: &str, offset_utf16: u32, max_utf16: u32) -> String {
    let mut characters = Vec::new();
    let Some(byte_index) = byte_index_for_utf16_offset(value, offset_utf16) else {
        return String::new();
    };
    let Some(prefix) = value.get(..byte_index) else {
        return String::new();
    };
    let mut used = 0_u32;
    for character in prefix.chars().rev() {
        let width = character.len_utf16() as u32;
        if used.saturating_add(width) > max_utf16 {
            break;
        }
        used += width;
        characters.push(character);
    }
    characters.into_iter().rev().collect()
}

fn bounded_suffix(value: &str, offset_utf16: u32, max_utf16: u32) -> String {
    let Some(byte_index) = byte_index_for_utf16_offset(value, offset_utf16) else {
        return String::new();
    };
    let Some(suffix) = value.get(byte_index..) else {
        return String::new();
    };
    let mut output = String::new();
    let mut used = 0_u32;
    for character in suffix.chars() {
        let width = character.len_utf16() as u32;
        if used.saturating_add(width) > max_utf16 {
            break;
        }
        used += width;
        output.push(character);
    }
    output
}

fn find_query_range_utf16(value: &str, query: &str) -> Option<(u32, u32)> {
    let query = query.trim();
    let byte_start = value.find(query).or_else(|| {
        query
            .is_ascii()
            .then(|| value.to_ascii_lowercase().find(&query.to_ascii_lowercase()))
            .flatten()
    })?;
    let byte_end = byte_start.checked_add(query.len())?;
    Some((
        utf16_offset_for_byte(value, byte_start)?,
        utf16_offset_for_byte(value, byte_end)?,
    ))
}

pub(crate) fn evidence_anchor_from_page(
    page: &SideraDocumentPageText,
    start_offset_utf16: u32,
    end_offset_utf16: u32,
) -> Result<SideraDocumentEvidenceAnchor, String> {
    let quote = utf16_slice(&page.text, start_offset_utf16, end_offset_utf16)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "SIDERA_DOCUMENT_EVIDENCE_ANCHOR_INVALID".to_string())?
        .to_string();
    let quote_sha256 = sha256_hex(quote.as_bytes());
    let source_kind = page.source_kind.as_str();
    let id = stable_id(
        "doc-anchor",
        &[
            &page.document_version_id,
            &page.document_sha256,
            &page.page_index.to_string(),
            source_kind,
            &start_offset_utf16.to_string(),
            &end_offset_utf16.to_string(),
            &quote_sha256,
        ],
    );
    let rects = page
        .spans
        .iter()
        .filter(|span| {
            span.start_offset_utf16 < end_offset_utf16 && span.end_offset_utf16 > start_offset_utf16
        })
        .filter_map(|span| {
            let span_length = span
                .end_offset_utf16
                .saturating_sub(span.start_offset_utf16);
            if span_length == 0 {
                return None;
            }
            let selected_start = start_offset_utf16.max(span.start_offset_utf16);
            let selected_end = end_offset_utf16.min(span.end_offset_utf16);
            let leading_ratio =
                selected_start.saturating_sub(span.start_offset_utf16) as f64 / span_length as f64;
            let selected_ratio =
                selected_end.saturating_sub(selected_start) as f64 / span_length as f64;
            Some(SideraDocumentEvidenceRect {
                x: span.x + span.width * leading_ratio,
                y: span.y,
                width: span.width * selected_ratio,
                height: span.height,
            })
        })
        .collect();
    Ok(SideraDocumentEvidenceAnchor {
        id,
        document_version_id: page.document_version_id.clone(),
        document_sha256: page.document_sha256.clone(),
        page_index: page.page_index,
        page_label: page.page_label.clone(),
        source_kind: page.source_kind.clone(),
        start_offset_utf16,
        end_offset_utf16,
        prefix: bounded_prefix(&page.text, start_offset_utf16, 48),
        suffix: bounded_suffix(&page.text, end_offset_utf16, 48),
        quote,
        quote_sha256,
        rects,
    })
}

fn page_text_from_connection(
    connection: &Connection,
    snapshot: &SideraDocumentParseSnapshot,
    page_index: u32,
) -> Result<SideraDocumentPageText, String> {
    let page = connection
        .query_row(
            "SELECT page_label,text,text_sha256,text_length_utf16
             FROM document_pages WHERE run_id=?1 AND page_index=?2",
            params![snapshot.run_id, page_index as i64],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, i64>(3)?,
                ))
            },
        )
        .optional()
        .map_err(|_| "SIDERA_DOCUMENT_PAGE_TEXT_READ_FAILED".to_string())?
        .ok_or_else(|| "SIDERA_DOCUMENT_PAGE_TEXT_NOT_FOUND".to_string())?;
    let mut statement = connection
        .prepare(
            "SELECT text,start_offset_utf16,end_offset_utf16,x,y,width,height
             FROM page_spans WHERE run_id=?1 AND page_index=?2 ORDER BY span_index",
        )
        .map_err(|_| "SIDERA_DOCUMENT_PAGE_TEXT_READ_FAILED".to_string())?;
    let spans = statement
        .query_map(params![snapshot.run_id, page_index as i64], |row| {
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
        .map_err(|_| "SIDERA_DOCUMENT_PAGE_TEXT_READ_FAILED".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "SIDERA_DOCUMENT_PAGE_TEXT_READ_FAILED".to_string())?;
    Ok(SideraDocumentPageText {
        document_version_id: snapshot.document_version_id.clone(),
        document_sha256: snapshot.document_sha256.clone(),
        page_index,
        page_label: page.0,
        source_kind: "native".to_string(),
        text: page.1,
        text_sha256: page.2,
        text_length_utf16: page.3.max(0) as u32,
        spans,
    })
}

pub fn document_page_text(
    query: SideraDocumentReaderQuery,
    page_index: u32,
) -> Result<SideraDocumentPageText, String> {
    let stored = load_stored_version(&query)?;
    if page_index >= DOCUMENT_PARSE_MAX_PAGES {
        return Err("SIDERA_DOCUMENT_PAGE_TEXT_PAGE_INVALID".to_string());
    }
    let connection = open_derived_read(&query.library_directory)?
        .ok_or_else(|| "SIDERA_DOCUMENT_PARSE_NOT_READY".to_string())?;
    let snapshot = latest_parse_for_version(&connection, &query.document_version_id)?
        .ok_or_else(|| "SIDERA_DOCUMENT_PARSE_NOT_READY".to_string())?;
    if snapshot.document_sha256 != stored.version.sha256.to_ascii_lowercase() {
        return Err("SIDERA_DOCUMENT_PARSE_VERSION_HASH_MISMATCH".to_string());
    }
    page_text_from_connection(&connection, &snapshot, page_index)
}

pub fn validate_document_evidence_anchor(
    query: SideraDocumentReaderQuery,
    anchor: &SideraDocumentEvidenceAnchor,
) -> Result<SideraDocumentEvidenceAnchor, String> {
    if query.document_version_id != anchor.document_version_id {
        return Err("SIDERA_DOCUMENT_EVIDENCE_VERSION_MISMATCH".to_string());
    }
    let page = match anchor.source_kind.as_str() {
        "native" => document_page_text(query, anchor.page_index)?,
        "ocr" => crate::document_ocr::document_ocr_page_text(query, anchor.page_index)?,
        _ => return Err("SIDERA_DOCUMENT_EVIDENCE_SOURCE_MISMATCH".to_string()),
    };
    if page.document_sha256 != anchor.document_sha256.to_ascii_lowercase() {
        return Err("SIDERA_DOCUMENT_EVIDENCE_VERSION_MISMATCH".to_string());
    }
    if anchor.source_kind != page.source_kind {
        return Err("SIDERA_DOCUMENT_EVIDENCE_SOURCE_MISMATCH".to_string());
    }
    let canonical =
        evidence_anchor_from_page(&page, anchor.start_offset_utf16, anchor.end_offset_utf16)?;
    if canonical.id != anchor.id
        || canonical.quote_sha256 != anchor.quote_sha256.to_ascii_lowercase()
        || canonical.quote != anchor.quote
    {
        return Err("SIDERA_DOCUMENT_EVIDENCE_QUOTE_MISMATCH".to_string());
    }
    Ok(canonical)
}

fn fts_query(value: &str) -> Result<String, String> {
    let value = value.trim();
    if value.is_empty() || value.len() > 512 {
        return Err("SIDERA_DOCUMENT_SEARCH_QUERY_INVALID".to_string());
    }
    Ok(format!("\"{}\"", value.replace('"', "\"\"")))
}

pub fn search_document(
    input: SideraDocumentSearchInput,
) -> Result<SideraDocumentSearchResult, String> {
    load_stored_version(&input.reader)?;
    if input.limit == 0 || input.limit > 100 || input.offset > 10_000 {
        return Err("SIDERA_DOCUMENT_SEARCH_PAGE_INVALID".to_string());
    }
    let connection = open_derived_read(&input.reader.library_directory)?
        .ok_or_else(|| "SIDERA_DOCUMENT_PARSE_NOT_READY".to_string())?;
    let snapshot = latest_ready_parse_for_version(&connection, &input.reader.document_version_id)?
        .ok_or_else(|| "SIDERA_DOCUMENT_PARSE_NOT_READY".to_string())?;
    if snapshot.state != SideraDocumentParseState::Ready {
        return Err("SIDERA_DOCUMENT_PARSE_NOT_READY".to_string());
    }
    let query = fts_query(&input.query)?;
    let total = connection
        .query_row(
            "SELECT COUNT(*) FROM document_pages_fts
             WHERE document_pages_fts MATCH ?1 AND run_id=?2",
            params![query, snapshot.run_id],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|_| "SIDERA_DOCUMENT_SEARCH_FAILED".to_string())?
        .max(0) as u32;
    let mut statement = connection
        .prepare(
            "SELECT CAST(fts.page_index AS INTEGER),page.page_label,
                    snippet(document_pages_fts,2,'‹','›',' … ',24),bm25(document_pages_fts),page.text,
                    (SELECT anchor.id FROM page_anchors anchor
                     WHERE anchor.run_id=fts.run_id AND anchor.page_index=CAST(fts.page_index AS INTEGER)
                     ORDER BY anchor.start_offset_utf16,anchor.id LIMIT 1)
             FROM document_pages_fts fts
             JOIN document_pages page
               ON page.run_id=fts.run_id AND page.page_index=CAST(fts.page_index AS INTEGER)
             WHERE document_pages_fts MATCH ?1 AND fts.run_id=?2
             ORDER BY bm25(document_pages_fts),CAST(fts.page_index AS INTEGER)
             LIMIT ?3 OFFSET ?4",
        )
        .map_err(|_| "SIDERA_DOCUMENT_SEARCH_FAILED".to_string())?;
    let raw_hits = statement
        .query_map(
            params![
                query,
                snapshot.run_id,
                input.limit as i64,
                input.offset as i64
            ],
            |row| {
                Ok((
                    row.get::<_, i64>(0)?.max(0) as u32,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, f64>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, Option<String>>(5)?,
                ))
            },
        )
        .map_err(|_| "SIDERA_DOCUMENT_SEARCH_FAILED".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "SIDERA_DOCUMENT_SEARCH_FAILED".to_string())?;
    let mut hits = Vec::with_capacity(raw_hits.len());
    for (page_index, page_label, excerpt, score, text, legacy_anchor_id) in raw_hits {
        let anchor = find_query_range_utf16(&text, input.query.trim()).and_then(|(start, end)| {
            page_text_from_connection(&connection, &snapshot, page_index)
                .and_then(|page| evidence_anchor_from_page(&page, start, end))
                .ok()
        });
        hits.push(SideraDocumentSearchHit {
            page_index,
            page_label,
            excerpt,
            score,
            anchor_id: anchor
                .as_ref()
                .map(|value| value.id.clone())
                .or(legacy_anchor_id),
            anchor,
        });
    }
    Ok(SideraDocumentSearchResult {
        run_id: snapshot.run_id,
        total,
        offset: input.offset,
        limit: input.limit,
        hits,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::{File, FileTimes};
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::sync::{Arc, Barrier};
    use std::time::Duration;

    static NEXT_FIXTURE: AtomicU64 = AtomicU64::new(1);

    fn fixture() -> (PathBuf, SideraDocumentReaderQuery, String) {
        let root = std::env::temp_dir().join(format!(
            "sidera-document-derived-{}-{}",
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
                "INSERT INTO document_versions VALUES('version-1','document-1',?1,'application/pdf',?2,?3,'fixture.pdf','user-import')",
                params![sha, bytes.len() as i64, rel],
            )
            .unwrap();
        drop(store);
        (
            root.clone(),
            SideraDocumentReaderQuery {
                library_directory: root,
                project_id: "project".to_string(),
                paper_id: "paper".to_string(),
                document_version_id: "version-1".to_string(),
            },
            sha,
        )
    }

    fn run_query(root: &Path, sha: &str, run_id: &str) -> SideraDocumentParseRunQuery {
        SideraDocumentParseRunQuery {
            library_directory: root.to_path_buf(),
            project_id: "project".to_string(),
            paper_id: "paper".to_string(),
            document_version_id: "version-1".to_string(),
            run_id: run_id.to_string(),
            document_sha256: sha.to_string(),
            parser_version: "pdfjs-test".to_string(),
        }
    }

    fn create_legacy_document_pages(
        root: &Path,
        schema_version: i64,
        includes_utf16_length: bool,
        text: &str,
    ) {
        fs::create_dir_all(root.join("Sidera")).unwrap();
        let database = document_derived_database_path(root);
        let connection = Connection::open(database).unwrap();
        let utf16_column = if includes_utf16_length {
            ",text_length_utf16 INTEGER NOT NULL DEFAULT 0"
        } else {
            ""
        };
        connection
            .execute_batch(&format!(
                "PRAGMA foreign_keys=OFF;
                 PRAGMA user_version={schema_version};
                 CREATE TABLE document_pages(
                   run_id TEXT NOT NULL,page_index INTEGER NOT NULL,page_label TEXT NOT NULL,
                   width REAL NOT NULL,height REAL NOT NULL,text TEXT NOT NULL,
                   text_sha256 TEXT NOT NULL{utf16_column},span_count INTEGER NOT NULL,
                   PRIMARY KEY(run_id,page_index),
                   FOREIGN KEY(run_id) REFERENCES parse_runs(id) ON DELETE CASCADE
                 );"
            ))
            .unwrap();
        connection
            .execute(
                "INSERT INTO document_pages
                 (run_id,page_index,page_label,width,height,text,text_sha256,span_count)
                 VALUES('run-1',0,'1',1,1,?1,?2,0)",
                params![text, sha256_hex(text.as_bytes())],
            )
            .unwrap();
    }

    #[test]
    fn parse_is_sequential_searchable_and_reader_state_is_separate() {
        let (root, reader, sha) = fixture();
        let started = start_document_parse(SideraDocumentParseStartInput {
            library_directory: root.clone(),
            project_id: "project".to_string(),
            paper_id: "paper".to_string(),
            document_version_id: "version-1".to_string(),
            expected_sha256: sha.clone(),
            parser_version: "pdfjs-test".to_string(),
            page_count: 2,
            now_ms: 1,
        })
        .unwrap();
        let run = run_query(&root, &sha, &started.run_id);
        assert_eq!(
            submit_document_parse_page(SideraDocumentParsePageInput {
                run: run.clone(),
                page_index: 1,
                page_label: "2".to_string(),
                width: 1.0,
                height: 1.0,
                text: "wrong order".to_string(),
                spans: Vec::new(),
                now_ms: 2,
            })
            .unwrap_err(),
            "SIDERA_DOCUMENT_PARSE_PAGE_SEQUENCE_INVALID"
        );
        for (page_index, text) in ["人工智能 🧠 evidence", "machine learning evidence"]
            .into_iter()
            .enumerate()
        {
            submit_document_parse_page(SideraDocumentParsePageInput {
                run: run.clone(),
                page_index: page_index as u32,
                page_label: (page_index + 1).to_string(),
                width: 1.0,
                height: 1.0,
                text: text.to_string(),
                spans: Vec::new(),
                now_ms: 3 + page_index as i64,
            })
            .unwrap();
        }
        let complete = finalize_document_parse(run, 10).unwrap();
        assert_eq!(complete.state, SideraDocumentParseState::Ready);
        let search = search_document(SideraDocumentSearchInput {
            reader: reader.clone(),
            query: "人工智能".to_string(),
            limit: 10,
            offset: 0,
        })
        .unwrap();
        assert_eq!(search.total, 1);
        assert_eq!(search.hits[0].page_index, 0);
        let state = save_document_reader_state(SideraDocumentReaderStateInput {
            library_directory: root.clone(),
            project_id: "project".to_string(),
            paper_id: "paper".to_string(),
            document_version_id: "version-1".to_string(),
            page_index: 1,
            scroll_offset: 12.5,
            zoom: 1.25,
            now_ms: 11,
        })
        .unwrap();
        assert_eq!(state.page_index, 1);
        let manifest = document_reader_manifest(reader).unwrap();
        assert_eq!(manifest.pages.len(), 2);
        assert_eq!(
            manifest.pages[0].text_length_utf16,
            "人工智能 🧠 evidence".encode_utf16().count() as u32
        );
        assert_eq!(manifest.reader_state.unwrap().zoom, 1.25);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn schema_v1_migration_backfills_utf16_lengths_with_rust_semantics() {
        let (root, _, _) = fixture();
        create_legacy_document_pages(&root, 1, false, "A🧠文");

        let migrated = prepare_derived_database(&root).unwrap();
        let version: i64 = migrated
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .unwrap();
        let text_length_utf16: i64 = migrated
            .query_row(
                "SELECT text_length_utf16 FROM document_pages WHERE run_id='run-1' AND page_index=0",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(version, DOCUMENT_DERIVED_SCHEMA_VERSION);
        assert_eq!(text_length_utf16, "A🧠文".encode_utf16().count() as i64);
        drop(migrated);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn schema_v4_migration_adds_ocr_without_rebuilding_existing_reader_or_index() {
        let (root, _, _) = fixture();
        drop(prepare_derived_database(&root).unwrap());
        let database = document_derived_database_path(&root);
        let connection = Connection::open(&database).unwrap();
        connection
            .execute_batch(
                "INSERT INTO parse_runs(
                   id,project_id,paper_id,document_version_id,document_sha256,parser_version,
                   state,expected_page_count,pages_committed,text_bearing_pages,
                   created_at_ms,updated_at_ms
                 ) VALUES('preserved-run','project','paper','version-1','sha','parser',
                          'ready',1,1,1,1,1);
                 INSERT INTO document_pages VALUES(
                   'preserved-run',0,'1',612,792,'existing evidence','sha',17,0
                 );
                 INSERT INTO document_index_jobs(
                   id,project_id,paper_id,document_version_id,document_sha256,run_id,
                   requested_mode,resolved_mode,state,stage,segment_count,embedded_count,
                   model_id,model_revision,created_at_ms,updated_at_ms
                 ) VALUES('preserved-index','project','paper','version-1','sha','preserved-run',
                          'auto','lexical','ready','complete',1,0,'model','revision',2,2);
                 INSERT INTO document_segments VALUES(
                   'preserved-index','preserved-run','preserved-segment','version-1','sha',
                   0,'native',0,17,'existing evidence','sha','{}'
                 );
                 INSERT INTO reader_states VALUES('project','paper','version-1',0,12.5,1.25,7);
                 DROP TABLE document_ocr_active_results;
                 DROP TABLE document_ocr_spans;
                 DROP TABLE document_ocr_pages;
                 DROP TABLE document_ocr_jobs;
                 PRAGMA user_version=4;",
            )
            .unwrap();
        drop(connection);

        let migrated = prepare_derived_database(&root).unwrap();
        assert_eq!(
            validate_derived_schema_version(&migrated).unwrap(),
            DOCUMENT_DERIVED_SCHEMA_VERSION
        );
        for table in [
            "document_ocr_jobs",
            "document_ocr_pages",
            "document_ocr_spans",
            "document_ocr_active_results",
        ] {
            let count: i64 = migrated
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?1",
                    [table],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(count, 1, "missing OCR table after migration: {table}");
        }
        for (table, expected) in [
            ("document_pages", 1),
            ("document_index_jobs", 1),
            ("document_segments", 1),
            ("reader_states", 1),
        ] {
            let count: i64 = migrated
                .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
                    row.get(0)
                })
                .unwrap();
            assert_eq!(
                count, expected,
                "v4 data changed during OCR migration: {table}"
            );
        }
        drop(migrated);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn schema_v3_migration_discards_only_rebuildable_unscoped_index_artifacts() {
        let (root, _, _) = fixture();
        drop(prepare_derived_database(&root).unwrap());
        let database = document_derived_database_path(&root);
        let connection = Connection::open(&database).unwrap();
        connection
            .execute(
                "INSERT INTO reader_states VALUES('project','paper','version-1',0,12.5,1.25,7)",
                [],
            )
            .unwrap();
        connection
            .execute_batch(
                "DROP TABLE document_segment_embeddings;
                 DROP TABLE document_segments_fts;
                 DROP TABLE document_segments;
                 DROP TABLE document_index_jobs;
                 CREATE TABLE document_index_jobs(id TEXT PRIMARY KEY);
                 CREATE TABLE document_segments(
                   run_id TEXT NOT NULL,id TEXT NOT NULL,text TEXT NOT NULL,
                   PRIMARY KEY(run_id,id)
                 );
                 CREATE VIRTUAL TABLE document_segments_fts USING fts5(
                   run_id UNINDEXED,segment_id UNINDEXED,page_index UNINDEXED,text,
                   tokenize='trigram'
                 );
                 CREATE TABLE document_segment_embeddings(
                   run_id TEXT NOT NULL,segment_id TEXT NOT NULL,vector_blob BLOB NOT NULL
                 );
                 PRAGMA user_version=3;",
            )
            .unwrap();
        drop(connection);

        let migrated = prepare_derived_database(&root).unwrap();
        assert_eq!(
            validate_derived_schema_version(&migrated).unwrap(),
            DOCUMENT_DERIVED_SCHEMA_VERSION
        );
        let reader_state_count: i64 = migrated
            .query_row("SELECT COUNT(*) FROM reader_states", [], |row| row.get(0))
            .unwrap();
        let job_id_columns: i64 = migrated
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('document_segments') WHERE name='job_id'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(reader_state_count, 1);
        assert_eq!(job_id_columns, 1);
        drop(migrated);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn version_zero_recovery_discards_only_residual_index_tables() {
        let (root, _, _) = fixture();
        create_legacy_document_pages(&root, 0, true, "preserved page");
        let evidence_database = root
            .join("Sidera")
            .join(crate::document_evidence::DOCUMENT_EVIDENCE_DATABASE);
        fs::write(&evidence_database, b"evidence-sentinel").unwrap();
        let database = document_derived_database_path(&root);
        let connection = Connection::open(&database).unwrap();
        connection
            .execute_batch(
                "CREATE TABLE reader_states(
                   project_id TEXT NOT NULL,paper_id TEXT NOT NULL,document_version_id TEXT NOT NULL,
                   page_index INTEGER NOT NULL,scroll_offset REAL NOT NULL,zoom REAL NOT NULL,
                   updated_at_ms INTEGER NOT NULL,
                   PRIMARY KEY(project_id,paper_id,document_version_id)
                 );
                 INSERT INTO reader_states VALUES('project','paper','version-1',0,8.5,1.25,7);
                 CREATE TABLE document_index_jobs(id INTEGER PRIMARY KEY,legacy TEXT);
                 CREATE TABLE document_segments(job_id BLOB,legacy TEXT);
                 CREATE TABLE document_segments_fts(job_id BLOB,legacy TEXT);
                 CREATE TABLE document_segment_embeddings(job_id BLOB,legacy TEXT);",
            )
            .unwrap();
        drop(connection);

        let recovered = prepare_derived_database(&root).unwrap();
        assert_eq!(
            validate_derived_schema_version(&recovered).unwrap(),
            DOCUMENT_DERIVED_SCHEMA_VERSION
        );
        validate_document_derived_index_schema(&recovered).unwrap();
        assert_eq!(
            recovered
                .query_row("SELECT COUNT(*) FROM document_pages", [], |row| {
                    row.get::<_, i64>(0)
                })
                .unwrap(),
            1
        );
        assert_eq!(
            recovered
                .query_row("SELECT COUNT(*) FROM reader_states", [], |row| {
                    row.get::<_, i64>(0)
                })
                .unwrap(),
            1
        );
        let index_job_id_type: String = recovered
            .query_row(
                "SELECT type FROM pragma_table_info('document_index_jobs') WHERE name='id'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(index_job_id_type, "TEXT");
        assert_eq!(fs::read(evidence_database).unwrap(), b"evidence-sentinel");
        drop(recovered);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn version_four_rejects_corrupt_index_foreign_key_shape() {
        let (root, _, _) = fixture();
        drop(prepare_derived_database(&root).unwrap());
        let database = document_derived_database_path(&root);
        let connection = Connection::open(&database).unwrap();
        connection
            .execute_batch(
                "DROP TABLE document_segment_embeddings;
                 CREATE TABLE document_segment_embeddings(
                   job_id TEXT NOT NULL,
                   run_id TEXT NOT NULL,
                   segment_id TEXT NOT NULL,
                   content_sha256 TEXT NOT NULL,
                   model_id TEXT NOT NULL,
                   model_revision TEXT NOT NULL,
                   dimensions INTEGER NOT NULL CHECK(dimensions=384),
                   encoding TEXT NOT NULL CHECK(encoding='float16-le'),
                   vector_blob BLOB NOT NULL CHECK(length(vector_blob)=768),
                   created_at_ms INTEGER NOT NULL,
                   PRIMARY KEY(job_id,segment_id,model_id,model_revision,content_sha256)
                 );",
            )
            .unwrap();
        drop(connection);

        assert_eq!(
            prepare_document_derived_index_schema(&root).unwrap_err(),
            DOCUMENT_DERIVED_INDEX_SCHEMA_INVALID
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn version_four_rejects_regular_table_in_place_of_fts5() {
        let (root, _, _) = fixture();
        drop(prepare_derived_database(&root).unwrap());
        let database = document_derived_database_path(&root);
        let connection = Connection::open(&database).unwrap();
        connection
            .execute_batch(
                "DROP TABLE document_segments_fts;
                 CREATE TABLE document_segments_fts(job_id,run_id,segment_id,page_index,text);",
            )
            .unwrap();
        drop(connection);

        assert_eq!(
            prepare_document_derived_index_schema(&root).unwrap_err(),
            DOCUMENT_DERIVED_INDEX_SCHEMA_INVALID
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn concurrent_v1_migration_rechecks_version_and_exits_idempotently() {
        let (root, _, _) = fixture();
        create_legacy_document_pages(&root, 1, false, "A🧠文");
        let barrier = Arc::new(Barrier::new(3));
        let handles = (0..2)
            .map(|_| {
                let root = root.clone();
                let barrier = Arc::clone(&barrier);
                std::thread::spawn(move || {
                    barrier.wait();
                    let connection = prepare_derived_database(&root).unwrap();
                    validate_derived_schema_version(&connection).unwrap()
                })
            })
            .collect::<Vec<_>>();
        barrier.wait();
        for handle in handles {
            assert_eq!(handle.join().unwrap(), DOCUMENT_DERIVED_SCHEMA_VERSION);
        }
        let database = document_derived_database_path(&root);
        let registry = DERIVED_PREPARE_LOCKS.get().unwrap();
        let registry = registry
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        assert!(!registry.contains_key(&database));
        drop(registry);
        let connection = Connection::open(database).unwrap();
        let utf16_columns: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('document_pages') WHERE name='text_length_utf16'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let length: i64 = connection
            .query_row(
                "SELECT text_length_utf16 FROM document_pages WHERE run_id='run-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(utf16_columns, 1);
        assert_eq!(length, "A🧠文".encode_utf16().count() as i64);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn version_zero_half_initialization_is_completed_atomically() {
        let (root, _, _) = fixture();
        create_legacy_document_pages(&root, 0, true, "half initialized");

        let connection = prepare_derived_database(&root).unwrap();
        assert_eq!(
            validate_derived_schema_version(&connection).unwrap(),
            DOCUMENT_DERIVED_SCHEMA_VERSION
        );
        let parse_runs: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='parse_runs'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(parse_runs, 1);
        let length: i64 = connection
            .query_row(
                "SELECT text_length_utf16 FROM document_pages WHERE run_id='run-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(length, "half initialized".encode_utf16().count() as i64);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn version_zero_recovery_rejects_noncanonical_types_and_foreign_keys() {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .execute_batch(
                "CREATE TABLE document_pages(
                   run_id TEXT NOT NULL,page_index TEXT NOT NULL,page_label TEXT NOT NULL,
                   width REAL NOT NULL,height REAL NOT NULL,text TEXT NOT NULL,
                   text_sha256 TEXT NOT NULL,span_count INTEGER NOT NULL,
                   PRIMARY KEY(run_id,page_index),
                   FOREIGN KEY(run_id) REFERENCES parse_runs(id) ON DELETE CASCADE
                 );",
            )
            .unwrap();
        assert_eq!(
            document_pages_schema_shape(&connection).unwrap_err(),
            "SIDERA_DOCUMENT_DERIVED_SCHEMA_RECOVERY_UNSAFE"
        );
        connection.execute("DROP TABLE document_pages", []).unwrap();
        connection
            .execute_batch(
                "CREATE TABLE document_pages(
                   run_id TEXT NOT NULL,page_index INTEGER NOT NULL,page_label TEXT NOT NULL,
                   width REAL NOT NULL,height REAL NOT NULL,text TEXT NOT NULL,
                   text_sha256 TEXT NOT NULL,span_count INTEGER NOT NULL,
                   PRIMARY KEY(run_id,page_index)
                 );",
            )
            .unwrap();
        assert_eq!(
            document_pages_schema_shape(&connection).unwrap_err(),
            "SIDERA_DOCUMENT_DERIVED_SCHEMA_RECOVERY_UNSAFE"
        );
    }

    #[test]
    fn late_schema_failure_rolls_back_utf16_alter_and_backfill() {
        let (root, _, _) = fixture();
        create_legacy_document_pages(&root, 0, false, "A🧠文");
        let database = document_derived_database_path(&root);
        let connection = Connection::open(&database).unwrap();
        connection
            .execute("CREATE TABLE page_anchors(blocker TEXT)", [])
            .unwrap();
        drop(connection);

        let error = match prepare_derived_database(&root) {
            Ok(_) => panic!("late schema conflict must roll back preparation"),
            Err(code) => code,
        };
        assert_eq!(error, "SIDERA_DOCUMENT_DERIVED_SCHEMA_FAILED");
        let connection = Connection::open(&database).unwrap();
        assert_eq!(validate_derived_schema_version(&connection).unwrap(), 0);
        let utf16_columns: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('document_pages') WHERE name='text_length_utf16'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let parse_runs: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='parse_runs'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(utf16_columns, 0);
        assert_eq!(parse_runs, 0);
        connection.execute("DROP TABLE page_anchors", []).unwrap();
        drop(connection);

        let recovered = prepare_derived_database(&root).unwrap();
        assert_eq!(
            validate_derived_schema_version(&recovered).unwrap(),
            DOCUMENT_DERIVED_SCHEMA_VERSION
        );
        let length: i64 = recovered
            .query_row(
                "SELECT text_length_utf16 FROM document_pages WHERE run_id='run-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(length, "A🧠文".encode_utf16().count() as i64);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn unsafe_half_initialization_rolls_back_and_clean_retry_recovers() {
        let (root, _, _) = fixture();
        let database = document_derived_database_path(&root);
        let connection = Connection::open(&database).unwrap();
        connection
            .execute_batch(
                "PRAGMA user_version=0;
                 CREATE TABLE document_pages(run_id TEXT NOT NULL);",
            )
            .unwrap();
        drop(connection);

        let error = match prepare_derived_database(&root) {
            Ok(_) => panic!("unsafe schema must not be accepted"),
            Err(code) => code,
        };
        assert_eq!(error, "SIDERA_DOCUMENT_DERIVED_SCHEMA_RECOVERY_UNSAFE");
        let connection = Connection::open(&database).unwrap();
        assert_eq!(validate_derived_schema_version(&connection).unwrap(), 0);
        let parse_runs: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='parse_runs'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(parse_runs, 0);
        connection.execute("DROP TABLE document_pages", []).unwrap();
        drop(connection);

        let recovered = prepare_derived_database(&root).unwrap();
        assert_eq!(
            validate_derived_schema_version(&recovered).unwrap(),
            DOCUMENT_DERIVED_SCHEMA_VERSION
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn empty_text_finishes_as_needs_ocr_and_cancel_is_idempotent() {
        let (root, _, sha) = fixture();
        let started = start_document_parse(SideraDocumentParseStartInput {
            library_directory: root.clone(),
            project_id: "project".to_string(),
            paper_id: "paper".to_string(),
            document_version_id: "version-1".to_string(),
            expected_sha256: sha.clone(),
            parser_version: "pdfjs-test".to_string(),
            page_count: 1,
            now_ms: 1,
        })
        .unwrap();
        let run = run_query(&root, &sha, &started.run_id);
        submit_document_parse_page(SideraDocumentParsePageInput {
            run: run.clone(),
            page_index: 0,
            page_label: "1".to_string(),
            width: 1.0,
            height: 1.0,
            text: String::new(),
            spans: Vec::new(),
            now_ms: 2,
        })
        .unwrap();
        let complete = finalize_document_parse(run, 3).unwrap();
        assert_eq!(complete.state, SideraDocumentParseState::NeedsOcr);

        let retried = start_document_parse(SideraDocumentParseStartInput {
            library_directory: root.clone(),
            project_id: "project".to_string(),
            paper_id: "paper".to_string(),
            document_version_id: "version-1".to_string(),
            expected_sha256: sha.clone(),
            parser_version: "pdfjs-next".to_string(),
            page_count: 1,
            now_ms: 4,
        })
        .unwrap();
        let query = SideraDocumentParseRunQuery {
            parser_version: "pdfjs-next".to_string(),
            ..run_query(&root, &sha, &retried.run_id)
        };
        assert_eq!(
            cancel_document_parse(query.clone(), 5).unwrap().state,
            SideraDocumentParseState::Cancelled
        );
        assert_eq!(
            cancel_document_parse(query, 6).unwrap().state,
            SideraDocumentParseState::Cancelled
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn active_parse_reopens_at_committed_page_and_cancel_survives_reopen() {
        let (root, _, sha) = fixture();
        let start = || {
            start_document_parse(SideraDocumentParseStartInput {
                library_directory: root.clone(),
                project_id: "project".to_string(),
                paper_id: "paper".to_string(),
                document_version_id: "version-1".to_string(),
                expected_sha256: sha.clone(),
                parser_version: "pdfjs-resume".to_string(),
                page_count: 2,
                now_ms: 1,
            })
        };
        let started = start().unwrap();
        let run = SideraDocumentParseRunQuery {
            parser_version: "pdfjs-resume".to_string(),
            ..run_query(&root, &sha, &started.run_id)
        };
        submit_document_parse_page(SideraDocumentParsePageInput {
            run: run.clone(),
            page_index: 0,
            page_label: "1".to_string(),
            width: 1.0,
            height: 1.0,
            text: "first page".to_string(),
            spans: Vec::new(),
            now_ms: 2,
        })
        .unwrap();

        let reopened = start().unwrap();
        assert_eq!(reopened.run_id, started.run_id);
        assert_eq!(reopened.pages_committed, 1);
        assert_eq!(reopened.state, SideraDocumentParseState::Running);

        let cancelled = cancel_document_parse(run.clone(), 3).unwrap();
        assert_eq!(cancelled.state, SideraDocumentParseState::Cancelled);
        assert_eq!(
            document_parse_snapshot(run).unwrap().state,
            SideraDocumentParseState::Cancelled
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn limits_encryption_and_hash_fences_are_stable() {
        let (root, reader, sha) = fixture();
        assert_eq!(
            start_document_parse(SideraDocumentParseStartInput {
                library_directory: root.clone(),
                project_id: "project".to_string(),
                paper_id: "paper".to_string(),
                document_version_id: "version-1".to_string(),
                expected_sha256: sha.clone(),
                parser_version: "pdfjs-test".to_string(),
                page_count: 301,
                now_ms: 1,
            })
            .unwrap_err(),
            "SIDERA_DOCUMENT_PARSE_PAGE_LIMIT_EXCEEDED"
        );
        assert_eq!(
            start_document_parse(SideraDocumentParseStartInput {
                library_directory: root.clone(),
                project_id: "project".to_string(),
                paper_id: "paper".to_string(),
                document_version_id: "version-1".to_string(),
                expected_sha256: "0".repeat(64),
                parser_version: "pdfjs-test".to_string(),
                page_count: 1,
                now_ms: 1,
            })
            .unwrap_err(),
            "SIDERA_DOCUMENT_PARSE_VERSION_HASH_MISMATCH"
        );
        let path = load_stored_version(&reader).unwrap().path;
        let encrypted = b"%PDF-1.7\n/Encrypt true\n%%EOF";
        fs::write(&path, encrypted).unwrap();
        let store = Connection::open(document_store_database_path(&root)).unwrap();
        store
            .execute(
                "UPDATE document_versions SET sha256=?1,byte_size=?2 WHERE id='version-1'",
                params![sha256_hex(encrypted), encrypted.len() as i64],
            )
            .unwrap();
        assert_eq!(
            document_reader_manifest(reader).unwrap_err(),
            "SIDERA_DOCUMENT_PARSE_ENCRYPTED"
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn range_contract_accepts_single_bounded_open_and_suffix_ranges() {
        assert_eq!(
            parse_document_byte_range(None, 100).unwrap(),
            SideraDocumentByteRange {
                start: 0,
                end: 99,
                partial: false
            }
        );
        assert_eq!(
            parse_document_byte_range(Some("bytes=10-19"), 100).unwrap(),
            SideraDocumentByteRange {
                start: 10,
                end: 19,
                partial: true
            }
        );
        assert_eq!(
            parse_document_byte_range(Some("bytes=95-"), 100).unwrap(),
            SideraDocumentByteRange {
                start: 95,
                end: 99,
                partial: true
            }
        );
        assert_eq!(
            parse_document_byte_range(Some("bytes=-12"), 100).unwrap(),
            SideraDocumentByteRange {
                start: 88,
                end: 99,
                partial: true
            }
        );
        for invalid in [
            "items=0-1",
            "bytes=",
            "bytes=100-",
            "bytes=20-10",
            "bytes=0-1,3-4",
        ] {
            assert_eq!(
                parse_document_byte_range(Some(invalid), 100).unwrap_err(),
                "SIDERA_DOCUMENT_RANGE_NOT_SATISFIABLE"
            );
        }
    }

    #[test]
    fn prepared_manifest_hashes_once_and_fences_same_size_mtime_changes() {
        let (root, reader, _) = fixture();
        reset_pdf_blob_validation_count();
        let (manifest, descriptor) = prepare_document_reader_manifest(reader).unwrap();
        assert_eq!(pdf_blob_validation_count(), 1);
        assert_eq!(
            manifest.resource_uri,
            format!("sidera-document://localhost/version/{}", descriptor.token)
        );
        let original = fs::metadata(&descriptor.path).unwrap();
        assert!(document_resource_fingerprint_matches(
            &descriptor,
            &original
        ));
        let changed_time =
            UNIX_EPOCH + Duration::from_nanos(descriptor.modified_at_ns) + Duration::from_secs(2);
        File::options()
            .write(true)
            .open(&descriptor.path)
            .unwrap()
            .set_times(FileTimes::new().set_modified(changed_time))
            .unwrap();
        let changed = fs::metadata(&descriptor.path).unwrap();
        assert_eq!(changed.len(), descriptor.byte_size);
        assert!(!document_resource_fingerprint_matches(
            &descriptor,
            &changed
        ));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn page_submit_uses_existing_contract_without_replaying_schema_ddl() {
        let (root, _, sha) = fixture();
        let started = start_document_parse(SideraDocumentParseStartInput {
            library_directory: root.clone(),
            project_id: "project".to_string(),
            paper_id: "paper".to_string(),
            document_version_id: "version-1".to_string(),
            expected_sha256: sha.clone(),
            parser_version: "pdfjs-test".to_string(),
            page_count: 1,
            now_ms: 1,
        })
        .unwrap();
        let database = document_derived_database_path(&root);
        Connection::open(&database)
            .unwrap()
            .execute_batch("DROP TABLE reader_states;")
            .unwrap();
        submit_document_parse_page(SideraDocumentParsePageInput {
            run: run_query(&root, &sha, &started.run_id),
            page_index: 0,
            page_label: "1".to_string(),
            width: 1.0,
            height: 1.0,
            text: "still sequential".to_string(),
            spans: Vec::new(),
            now_ms: 2,
        })
        .unwrap();
        let connection = Connection::open(database).unwrap();
        let recreated: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='reader_states'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(recreated, 0);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn anchors_are_unique_across_duplicate_spans_and_parser_runs() {
        let (root, _, sha) = fixture();
        let make_run = |parser_version: &str, now_ms: i64| {
            start_document_parse(SideraDocumentParseStartInput {
                library_directory: root.clone(),
                project_id: "project".to_string(),
                paper_id: "paper".to_string(),
                document_version_id: "version-1".to_string(),
                expected_sha256: sha.clone(),
                parser_version: parser_version.to_string(),
                page_count: 1,
                now_ms,
            })
            .unwrap()
        };
        for (parser, now_ms) in [("pdfjs-a", 1), ("pdfjs-b", 10)] {
            let started = make_run(parser, now_ms);
            let run = SideraDocumentParseRunQuery {
                parser_version: parser.to_string(),
                ..run_query(&root, &sha, &started.run_id)
            };
            let duplicate = SideraDocumentTextSpanInput {
                text: "same".to_string(),
                start_offset_utf16: 0,
                end_offset_utf16: 4,
                x: 0.1,
                y: 0.1,
                width: 0.2,
                height: 0.1,
            };
            submit_document_parse_page(SideraDocumentParsePageInput {
                run: run.clone(),
                page_index: 0,
                page_label: "1".to_string(),
                width: 1.0,
                height: 1.0,
                text: "same".to_string(),
                spans: vec![duplicate.clone(), duplicate],
                now_ms: now_ms + 1,
            })
            .unwrap();
            finalize_document_parse(run, now_ms + 2).unwrap();
        }
        let connection = Connection::open(document_derived_database_path(&root)).unwrap();
        let (count, distinct): (i64, i64) = connection
            .query_row(
                "SELECT COUNT(*),COUNT(DISTINCT id) FROM page_anchors",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!((count, distinct), (4, 4));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn evidence_anchor_is_exact_utf16_and_stable_across_parser_runs() {
        let (root, reader, sha) = fixture();
        let mut anchor_ids = Vec::new();
        for (parser_version, now_ms) in [("pdfjs-evidence-a", 1), ("pdfjs-evidence-b", 10)] {
            let started = start_document_parse(SideraDocumentParseStartInput {
                library_directory: root.clone(),
                project_id: "project".to_string(),
                paper_id: "paper".to_string(),
                document_version_id: "version-1".to_string(),
                expected_sha256: sha.clone(),
                parser_version: parser_version.to_string(),
                page_count: 1,
                now_ms,
            })
            .unwrap();
            let run = SideraDocumentParseRunQuery {
                parser_version: parser_version.to_string(),
                ..run_query(&root, &sha, &started.run_id)
            };
            let text = "A🧠文 exact evidence Z";
            submit_document_parse_page(SideraDocumentParsePageInput {
                run: run.clone(),
                page_index: 0,
                page_label: "1".to_string(),
                width: 100.0,
                height: 100.0,
                text: text.to_string(),
                spans: vec![SideraDocumentTextSpanInput {
                    text: "exact evidence".to_string(),
                    start_offset_utf16: 5,
                    end_offset_utf16: 19,
                    x: 0.1,
                    y: 0.2,
                    width: 0.3,
                    height: 0.04,
                }],
                now_ms: now_ms + 1,
            })
            .unwrap();
            finalize_document_parse(run, now_ms + 2).unwrap();
            let result = search_document(SideraDocumentSearchInput {
                reader: reader.clone(),
                query: "exact evidence".to_string(),
                limit: 10,
                offset: 0,
            })
            .unwrap();
            let anchor = result.hits[0].anchor.clone().unwrap();
            assert_eq!(anchor.quote, "exact evidence");
            assert_eq!(
                (anchor.start_offset_utf16, anchor.end_offset_utf16),
                (5, 19)
            );
            assert_eq!(anchor.rects.len(), 1);
            assert_eq!(
                validate_document_evidence_anchor(reader.clone(), &anchor).unwrap(),
                anchor
            );
            anchor_ids.push(anchor.id);
        }
        assert_eq!(anchor_ids[0], anchor_ids[1]);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn evidence_rect_crops_each_span_by_the_selected_utf16_fraction() {
        let text = "A🧠BCDEF";
        let page = SideraDocumentPageText {
            document_version_id: "version-1".to_string(),
            document_sha256: "a".repeat(64),
            page_index: 0,
            page_label: "1".to_string(),
            source_kind: "native".to_string(),
            text: text.to_string(),
            text_sha256: sha256_hex(text.as_bytes()),
            text_length_utf16: 8,
            spans: vec![SideraDocumentPageTextSpan {
                text: text.to_string(),
                start_offset_utf16: 0,
                end_offset_utf16: 8,
                x: 0.1,
                y: 0.2,
                width: 0.8,
                height: 0.05,
            }],
        };
        let anchor = evidence_anchor_from_page(&page, 1, 4).unwrap();
        assert_eq!(anchor.quote, "🧠B");
        assert_eq!(anchor.rects.len(), 1);
        assert!((anchor.rects[0].x - 0.2).abs() < 1e-9);
        assert!((anchor.rects[0].width - 0.3).abs() < 1e-9);
        assert_eq!(anchor.rects[0].y, 0.2);
        assert_eq!(anchor.rects[0].height, 0.05);
        assert_eq!(
            evidence_anchor_from_page(&page, 1, 2).unwrap_err(),
            "SIDERA_DOCUMENT_EVIDENCE_ANCHOR_INVALID"
        );
    }

    #[test]
    fn concurrent_identical_starts_reuse_the_same_active_run() {
        let (root, _, sha) = fixture();
        drop(prepare_derived_database(&root).unwrap());
        let barrier = Arc::new(Barrier::new(3));
        let mut handles = Vec::new();
        for _ in 0..2 {
            let root = root.clone();
            let sha = sha.clone();
            let barrier = Arc::clone(&barrier);
            handles.push(std::thread::spawn(move || {
                barrier.wait();
                start_document_parse(SideraDocumentParseStartInput {
                    library_directory: root,
                    project_id: "project".to_string(),
                    paper_id: "paper".to_string(),
                    document_version_id: "version-1".to_string(),
                    expected_sha256: sha,
                    parser_version: "pdfjs-concurrent".to_string(),
                    page_count: 1,
                    now_ms: 50,
                })
            }));
        }
        barrier.wait();
        let runs = handles
            .into_iter()
            .map(|handle| handle.join().unwrap().unwrap())
            .collect::<Vec<_>>();
        assert_eq!(runs[0].run_id, runs[1].run_id);
        assert_eq!(runs[0].state, SideraDocumentParseState::Running);
        assert_eq!(runs[1].state, SideraDocumentParseState::Running);
        let connection = open_derived_read(&root).unwrap().unwrap();
        let count: i64 = connection
            .query_row("SELECT COUNT(*) FROM parse_runs", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 1);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn page_span_text_must_match_the_exact_utf16_slice() {
        let make_page = |span: SideraDocumentTextSpanInput| SideraDocumentParsePageInput {
            run: SideraDocumentParseRunQuery {
                library_directory: PathBuf::new(),
                project_id: "project".to_string(),
                paper_id: "paper".to_string(),
                document_version_id: "version".to_string(),
                run_id: "run".to_string(),
                document_sha256: "a".repeat(64),
                parser_version: "pdfjs-test".to_string(),
            },
            page_index: 0,
            page_label: "1".to_string(),
            width: 1.0,
            height: 1.0,
            text: "A🧠B".to_string(),
            spans: vec![span],
            now_ms: 1,
        };
        assert!(validate_page(&make_page(SideraDocumentTextSpanInput {
            text: "🧠".to_string(),
            start_offset_utf16: 1,
            end_offset_utf16: 3,
            x: 0.1,
            y: 0.1,
            width: 0.2,
            height: 0.1,
        }))
        .is_ok());
        assert_eq!(
            validate_page(&make_page(SideraDocumentTextSpanInput {
                text: "B".to_string(),
                start_offset_utf16: 1,
                end_offset_utf16: 3,
                x: 0.1,
                y: 0.1,
                width: 0.2,
                height: 0.1,
            }))
            .unwrap_err(),
            "SIDERA_DOCUMENT_PARSE_SPAN_TEXT_MISMATCH"
        );
        assert_eq!(
            validate_page(&make_page(SideraDocumentTextSpanInput {
                text: "🧠".to_string(),
                start_offset_utf16: 1,
                end_offset_utf16: 2,
                x: 0.1,
                y: 0.1,
                width: 0.2,
                height: 0.1,
            }))
            .unwrap_err(),
            "SIDERA_DOCUMENT_PARSE_SPAN_INVALID"
        );
    }

    #[test]
    fn a_different_parser_supersedes_the_previous_active_run() {
        let (root, _, sha) = fixture();
        let first = start_document_parse(SideraDocumentParseStartInput {
            library_directory: root.clone(),
            project_id: "project".to_string(),
            paper_id: "paper".to_string(),
            document_version_id: "version-1".to_string(),
            expected_sha256: sha.clone(),
            parser_version: "pdfjs-owner-a".to_string(),
            page_count: 1,
            now_ms: 50,
        })
        .unwrap();
        let second = start_document_parse(SideraDocumentParseStartInput {
            library_directory: root.clone(),
            project_id: "project".to_string(),
            paper_id: "paper".to_string(),
            document_version_id: "version-1".to_string(),
            expected_sha256: sha.clone(),
            parser_version: "pdfjs-owner-b".to_string(),
            page_count: 1,
            now_ms: 51,
        })
        .unwrap();
        assert_ne!(first.run_id, second.run_id);
        assert_eq!(second.state, SideraDocumentParseState::Running);
        let first = document_parse_snapshot(SideraDocumentParseRunQuery {
            parser_version: "pdfjs-owner-a".to_string(),
            ..run_query(&root, &sha, &first.run_id)
        })
        .unwrap();
        assert_eq!(first.state, SideraDocumentParseState::Stale);
        let _ = fs::remove_dir_all(root);
    }
}
