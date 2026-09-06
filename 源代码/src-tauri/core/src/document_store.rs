use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use rusqlite::{params, Connection, OpenFlags, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use url::Url;

pub const DOCUMENT_STORE_SCHEMA_VERSION: i64 = 2;
pub const DOCUMENT_STORE_DATABASE: &str = "documents-v1.sqlite";
pub const DOCUMENT_STORE_DIRECTORY: &str = "documents-v1";
pub const DOCUMENT_INGEST_MAX_BYTES: u64 = 50 * 1024 * 1024;

const DOCUMENT_SCHEMA: &str = r#"
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  paper_id TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  UNIQUE(project_id, paper_id)
);
CREATE INDEX IF NOT EXISTS idx_documents_project_paper
  ON documents(project_id, paper_id);

CREATE TABLE IF NOT EXISTS document_versions (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  storage_rel_path TEXT NOT NULL,
  original_file_name TEXT,
  first_acquisition_kind TEXT NOT NULL,
  version_kind TEXT NOT NULL CHECK(version_kind IN ('publisher-version','author-manuscript','scan','user-import','unknown')),
  created_at_ms INTEGER NOT NULL,
  UNIQUE(document_id, sha256),
  FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_document_versions_document_created
  ON document_versions(document_id, created_at_ms DESC);

CREATE TABLE IF NOT EXISTS acquisition_records (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  paper_id TEXT NOT NULL,
  document_id TEXT,
  source_record_id TEXT,
  kind TEXT NOT NULL CHECK(kind IN ('local-import','institution-download')),
  status TEXT NOT NULL CHECK(status IN ('complete','failed')),
  stage TEXT NOT NULL,
  origin_label TEXT,
  safe_locator TEXT,
  authorization_state TEXT NOT NULL,
  document_version_id TEXT,
  error_code TEXT,
  retryable INTEGER NOT NULL DEFAULT 0,
  created_at_ms INTEGER NOT NULL,
  completed_at_ms INTEGER NOT NULL,
  FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE SET NULL,
  FOREIGN KEY(document_version_id) REFERENCES document_versions(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_acquisition_records_project_paper
  ON acquisition_records(project_id, paper_id, created_at_ms DESC);
"#;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SideraAcquisitionKind {
    LocalImport,
    InstitutionDownload,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SideraDocumentVersionKind {
    PublisherVersion,
    AuthorManuscript,
    Scan,
    UserImport,
    Unknown,
}

impl SideraDocumentVersionKind {
    fn as_str(&self) -> &'static str {
        match self {
            Self::PublisherVersion => "publisher-version",
            Self::AuthorManuscript => "author-manuscript",
            Self::Scan => "scan",
            Self::UserImport => "user-import",
            Self::Unknown => "unknown",
        }
    }
}

impl SideraAcquisitionKind {
    fn as_str(&self) -> &'static str {
        match self {
            Self::LocalImport => "local-import",
            Self::InstitutionDownload => "institution-download",
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SideraDocumentIngestInput {
    pub library_database: PathBuf,
    pub library_directory: PathBuf,
    pub project_id: String,
    pub paper_id: String,
    pub source_path: PathBuf,
    pub acquisition_kind: SideraAcquisitionKind,
    pub version_kind: SideraDocumentVersionKind,
    pub source_record_id: Option<String>,
    pub origin_label: Option<String>,
    pub safe_locator: Option<String>,
    pub authorization_state: String,
    pub original_file_name: Option<String>,
    pub now_ms: i64,
}

#[derive(Clone, Debug)]
pub struct SideraDocumentFailureInput {
    pub library_database: PathBuf,
    pub library_directory: PathBuf,
    pub project_id: String,
    pub paper_id: String,
    pub acquisition_kind: SideraAcquisitionKind,
    pub source_record_id: Option<String>,
    pub stage: String,
    pub origin_label: Option<String>,
    pub safe_locator: Option<String>,
    pub authorization_state: String,
    pub error_code: String,
    pub retryable: bool,
    pub now_ms: i64,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SideraSourceRecordMatchInput {
    pub library_database: PathBuf,
    pub project_id: String,
    pub paper_id: String,
    pub search_candidate_id: Option<String>,
    pub provider_record_id: Option<String>,
    pub canonical_locator: Option<String>,
    pub source_database: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SideraPaperDocumentQuery {
    pub library_database: Option<PathBuf>,
    pub library_directory: PathBuf,
    pub project_id: String,
    pub paper_id: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SideraPaperSourceQuery {
    pub library_database: PathBuf,
    pub project_id: String,
    pub paper_id: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SideraPaperSourceRouteQuery {
    pub library_database: PathBuf,
    pub project_id: String,
    pub paper_id: String,
    pub source_record_id: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SideraDocumentVersionQuery {
    pub library_directory: PathBuf,
    pub project_id: String,
    pub paper_id: String,
    pub version_id: String,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SideraDocumentVersion {
    pub id: String,
    pub sha256: String,
    pub mime_type: String,
    pub byte_size: u64,
    pub original_file_name: Option<String>,
    pub first_acquisition_kind: String,
    pub version_kind: String,
    pub created_at_ms: i64,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SideraAcquisitionRecord {
    pub id: String,
    pub source_record_id: Option<String>,
    pub kind: String,
    pub status: String,
    pub stage: String,
    pub origin_label: Option<String>,
    pub safe_locator: Option<String>,
    pub authorization_state: String,
    pub document_version_id: Option<String>,
    pub error_code: Option<String>,
    pub retryable: bool,
    pub created_at_ms: i64,
    pub completed_at_ms: i64,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SideraPaperSourceRecord {
    pub id: String,
    pub source_database: String,
    pub producer_version: String,
    pub provider_record_id: Option<String>,
    pub record_type: Option<String>,
    pub full_text_status: String,
    pub display_locator: Option<String>,
    pub can_open_record: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SideraPaperSourceRoute {
    pub id: String,
    pub source_database: String,
    pub producer_version: String,
    pub provider_record_id: Option<String>,
    pub record_type: Option<String>,
    pub full_text_status: String,
    pub paper_title: String,
    pub url: String,
    pub display_locator: String,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SideraPaperDocumentSnapshot {
    pub project_id: String,
    pub paper_id: String,
    pub document_id: Option<String>,
    pub versions: Vec<SideraDocumentVersion>,
    pub acquisitions: Vec<SideraAcquisitionRecord>,
    pub sources: Vec<SideraPaperSourceRecord>,
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

fn document_store_root(library_directory: &Path) -> PathBuf {
    library_directory
        .join("Sidera")
        .join(DOCUMENT_STORE_DIRECTORY)
}

pub fn document_store_database_path(library_directory: &Path) -> PathBuf {
    library_directory
        .join("Sidera")
        .join(DOCUMENT_STORE_DATABASE)
}

fn open_store(library_directory: &Path) -> Result<Connection, String> {
    let sidera = library_directory.join("Sidera");
    fs::create_dir_all(&sidera)
        .map_err(|_| "SIDERA_DOCUMENT_DIRECTORY_CREATE_FAILED".to_string())?;
    let connection = Connection::open(document_store_database_path(library_directory))
        .map_err(|_| "SIDERA_DOCUMENT_STORE_OPEN_FAILED".to_string())?;
    connection
        .execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;")
        .map_err(|_| "SIDERA_DOCUMENT_STORE_PRAGMA_FAILED".to_string())?;
    let version: i64 = connection
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(|_| "SIDERA_DOCUMENT_STORE_VERSION_FAILED".to_string())?;
    if version > DOCUMENT_STORE_SCHEMA_VERSION {
        return Err("SIDERA_DOCUMENT_STORE_TOO_NEW".to_string());
    }
    if version == 1 {
        let transaction = connection
            .unchecked_transaction()
            .map_err(|_| "SIDERA_DOCUMENT_STORE_MIGRATION_FAILED".to_string())?;
        transaction
            .execute_batch(
                "ALTER TABLE document_versions
                   ADD COLUMN version_kind TEXT NOT NULL DEFAULT 'unknown'
                   CHECK(version_kind IN ('publisher-version','author-manuscript','scan','user-import','unknown'));
                 UPDATE document_versions
                   SET version_kind=CASE
                     WHEN first_acquisition_kind='local-import' THEN 'user-import'
                     ELSE 'unknown'
                   END;",
            )
            .map_err(|_| "SIDERA_DOCUMENT_STORE_MIGRATION_FAILED".to_string())?;
        transaction
            .pragma_update(None, "user_version", DOCUMENT_STORE_SCHEMA_VERSION)
            .map_err(|_| "SIDERA_DOCUMENT_STORE_VERSION_FAILED".to_string())?;
        transaction
            .commit()
            .map_err(|_| "SIDERA_DOCUMENT_STORE_MIGRATION_FAILED".to_string())?;
    } else {
        connection
            .execute_batch(DOCUMENT_SCHEMA)
            .map_err(|_| "SIDERA_DOCUMENT_STORE_SCHEMA_FAILED".to_string())?;
        connection
            .pragma_update(None, "user_version", DOCUMENT_STORE_SCHEMA_VERSION)
            .map_err(|_| "SIDERA_DOCUMENT_STORE_VERSION_FAILED".to_string())?;
    }
    connection
        .execute_batch(DOCUMENT_SCHEMA)
        .map_err(|_| "SIDERA_DOCUMENT_STORE_SCHEMA_FAILED".to_string())?;
    Ok(connection)
}

fn open_store_read_only(library_directory: &Path) -> Result<Option<Connection>, String> {
    let database = document_store_database_path(library_directory);
    if !database.is_file() {
        return Ok(None);
    }
    let connection = Connection::open_with_flags(
        database,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|_| "SIDERA_DOCUMENT_STORE_OPEN_FAILED".to_string())?;
    connection
        .pragma_update(None, "query_only", "ON")
        .map_err(|_| "SIDERA_DOCUMENT_STORE_PRAGMA_FAILED".to_string())?;
    let version: i64 = connection
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(|_| "SIDERA_DOCUMENT_STORE_VERSION_FAILED".to_string())?;
    if version > DOCUMENT_STORE_SCHEMA_VERSION {
        return Err("SIDERA_DOCUMENT_STORE_TOO_NEW".to_string());
    }
    if version != DOCUMENT_STORE_SCHEMA_VERSION {
        return Err("SIDERA_DOCUMENT_STORE_NOT_PREPARED".to_string());
    }
    Ok(Some(connection))
}

fn open_library_read_only(library_database: &Path) -> Result<Connection, String> {
    let connection = Connection::open_with_flags(
        library_database,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|_| "SIDERA_DOCUMENT_LIBRARY_OPEN_FAILED".to_string())?;
    connection
        .pragma_update(None, "query_only", "ON")
        .map_err(|_| "SIDERA_DOCUMENT_LIBRARY_OPEN_FAILED".to_string())?;
    Ok(connection)
}

fn validate_paper_and_source_values(
    library_database: &Path,
    project_id: &str,
    paper_id: &str,
    source_record_id: Option<&str>,
) -> Result<Option<String>, String> {
    let library = open_library_read_only(library_database)?;
    let exists: i64 = library
        .query_row(
            "SELECT COUNT(*) FROM papers WHERE project_id=?1 AND id=?2",
            params![project_id, paper_id],
            |row| row.get(0),
        )
        .map_err(|_| "SIDERA_DOCUMENT_PAPER_LOOKUP_FAILED".to_string())?;
    if exists != 1 {
        return Err("SIDERA_DOCUMENT_PAPER_NOT_FOUND".to_string());
    }
    if let Some(source_record_id) = source_record_id {
        let valid: i64 = library
            .query_row(
                "SELECT COUNT(*) FROM paper_source_records WHERE project_id=?1 AND paper_id=?2 AND id=?3",
                params![project_id, paper_id, source_record_id],
                |row| row.get(0),
            )
            .map_err(|_| "SIDERA_DOCUMENT_SOURCE_LOOKUP_FAILED".to_string())?;
        if valid != 1 {
            return Err("SIDERA_DOCUMENT_SOURCE_NOT_FOUND".to_string());
        }
        return Ok(Some(source_record_id.to_string()));
    }
    Ok(None)
}

fn validate_paper_and_source(input: &SideraDocumentIngestInput) -> Result<Option<String>, String> {
    validate_paper_and_source_values(
        &input.library_database,
        &input.project_id,
        &input.paper_id,
        input.source_record_id.as_deref(),
    )
}

#[derive(Clone, Debug)]
struct SourceRecordMatchRow {
    id: String,
    candidate_id: String,
    source_database: String,
    provider_record_id: Option<String>,
    canonical_locator: Option<String>,
    provenance: serde_json::Value,
}

fn clean_match_value(value: Option<&str>) -> Option<String> {
    let value = value?.trim();
    (!value.is_empty()).then(|| value.to_string())
}

fn provenance_search_candidate_ids(value: &serde_json::Value) -> Vec<&str> {
    [
        value.get("resultId").and_then(serde_json::Value::as_str),
        value
            .get("payload")
            .and_then(|payload| payload.get("searchCandidateId"))
            .and_then(serde_json::Value::as_str),
        value
            .get("searchCandidateId")
            .and_then(serde_json::Value::as_str),
    ]
    .into_iter()
    .flatten()
    .collect()
}

fn unique_source_record<'a>(
    rows: impl Iterator<Item = &'a SourceRecordMatchRow>,
) -> Option<String> {
    let mut ids = rows.map(|row| row.id.as_str()).collect::<Vec<_>>();
    ids.sort_unstable();
    ids.dedup();
    (ids.len() == 1).then(|| ids[0].to_string())
}

pub fn resolve_source_record_match(
    input: SideraSourceRecordMatchInput,
) -> Result<Option<String>, String> {
    let library = open_library_read_only(&input.library_database)?;
    let mut statement = match library.prepare(
        "SELECT id,candidate_id,source_database,provider_record_id,canonical_locator,provenance_json
         FROM paper_source_records
         WHERE project_id=?1 AND paper_id=?2
         ORDER BY created_at_ms DESC,id",
    ) {
        Ok(statement) => statement,
        Err(error) if error.to_string().contains("no such table") => return Ok(None),
        Err(_) => return Err("SIDERA_DOCUMENT_SOURCE_LOOKUP_FAILED".to_string()),
    };
    let rows = statement
        .query_map(params![input.project_id, input.paper_id], |row| {
            let provenance_json = row.get::<_, String>(5)?;
            Ok(SourceRecordMatchRow {
                id: row.get(0)?,
                candidate_id: row.get(1)?,
                source_database: row.get(2)?,
                provider_record_id: row.get(3)?,
                canonical_locator: row.get(4)?,
                provenance: serde_json::from_str(&provenance_json)
                    .unwrap_or(serde_json::Value::Null),
            })
        })
        .map_err(|_| "SIDERA_DOCUMENT_SOURCE_LOOKUP_FAILED".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "SIDERA_DOCUMENT_SOURCE_LOOKUP_FAILED".to_string())?;
    if rows.is_empty() {
        return Ok(None);
    }

    if let Some(search_candidate_id) = clean_match_value(input.search_candidate_id.as_deref()) {
        if let Some(id) = unique_source_record(rows.iter().filter(|row| {
            row.candidate_id == search_candidate_id
                || provenance_search_candidate_ids(&row.provenance)
                    .iter()
                    .any(|value| value.trim() == search_candidate_id)
        })) {
            return Ok(Some(id));
        }
    }
    if let Some(provider_record_id) = clean_match_value(input.provider_record_id.as_deref()) {
        if let Some(id) = unique_source_record(rows.iter().filter(|row| {
            row.provider_record_id
                .as_deref()
                .is_some_and(|value| value.trim() == provider_record_id)
        })) {
            return Ok(Some(id));
        }
    }
    if let Some(locator) = safe_locator(input.canonical_locator.as_deref()) {
        if let Some(id) = unique_source_record(rows.iter().filter(|row| {
            safe_locator(row.canonical_locator.as_deref()).as_deref() == Some(locator.as_str())
        })) {
            return Ok(Some(id));
        }
    }
    if let Some(source_database) = clean_match_value(input.source_database.as_deref()) {
        if let Some(id) = unique_source_record(rows.iter().filter(|row| {
            row.source_database
                .trim()
                .eq_ignore_ascii_case(&source_database)
        })) {
            return Ok(Some(id));
        }
    }
    Ok(None)
}

fn safe_locator(value: Option<&str>) -> Option<String> {
    let raw = value?.trim();
    if raw.is_empty() {
        return None;
    }
    let mut url = Url::parse(raw).ok()?;
    if url.scheme() != "https" && url.scheme() != "http" {
        return None;
    }
    let _ = url.set_username("");
    let _ = url.set_password(None);
    url.set_query(None);
    url.set_fragment(None);
    Some(url.to_string())
}

fn sensitive_source_query_key(key: &str) -> bool {
    let key = key.trim().to_ascii_lowercase();
    [
        "cookie",
        "ticket",
        "token",
        "session",
        "credential",
        "password",
        "passwd",
        "authorization",
        "authcode",
        "access_key",
        "secret",
        "nonce",
        "saml",
    ]
    .iter()
    .any(|needle| key.contains(needle))
        || matches!(key.as_str(), "state" | "code")
}

fn sanitize_source_route(value: Option<&str>) -> Option<(String, String)> {
    let raw = value?.trim();
    if raw.is_empty() {
        return None;
    }
    let mut url = Url::parse(raw).ok()?;
    if url.scheme() != "https"
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some_and(|port| port != 443)
    {
        return None;
    }
    let safe_pairs = url
        .query_pairs()
        .filter(|(key, _)| !sensitive_source_query_key(key))
        .map(|(key, value)| (key.into_owned(), value.into_owned()))
        .collect::<Vec<_>>();
    url.set_query(None);
    url.set_fragment(None);
    if !safe_pairs.is_empty() {
        let mut query = url.query_pairs_mut();
        for (key, value) in safe_pairs {
            query.append_pair(&key, &value);
        }
    }
    let route = url.to_string();
    url.set_query(None);
    Some((route, url.to_string()))
}

pub fn paper_source_records(
    input: SideraPaperSourceQuery,
) -> Result<Vec<SideraPaperSourceRecord>, String> {
    validate_paper_and_source_values(
        &input.library_database,
        &input.project_id,
        &input.paper_id,
        None,
    )?;
    let library = open_library_read_only(&input.library_database)?;
    let mut statement = match library.prepare(
        "SELECT id,source_database,producer_version,provider_record_id,canonical_locator,record_type,full_text_status
         FROM paper_source_records
         WHERE project_id=?1 AND paper_id=?2
         ORDER BY created_at_ms DESC,id",
    ) {
        Ok(statement) => statement,
        Err(error) if error.to_string().contains("no such table") => return Ok(Vec::new()),
        Err(_) => return Err("SIDERA_DOCUMENT_SOURCE_LOOKUP_FAILED".to_string()),
    };
    let records = statement
        .query_map(params![input.project_id, input.paper_id], |row| {
            let canonical_locator = row.get::<_, Option<String>>(4)?;
            let route = sanitize_source_route(canonical_locator.as_deref());
            Ok(SideraPaperSourceRecord {
                id: row.get(0)?,
                source_database: row.get(1)?,
                producer_version: row.get(2)?,
                provider_record_id: row.get(3)?,
                record_type: row.get(5)?,
                full_text_status: row
                    .get::<_, Option<String>>(6)?
                    .filter(|value| !value.trim().is_empty())
                    .unwrap_or_else(|| "unknown".to_string()),
                display_locator: route.as_ref().map(|(_, display)| display.clone()),
                can_open_record: route.is_some(),
            })
        })
        .map_err(|_| "SIDERA_DOCUMENT_SOURCE_LOOKUP_FAILED".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "SIDERA_DOCUMENT_SOURCE_LOOKUP_FAILED".to_string())?;
    Ok(records)
}

pub fn resolve_paper_source_route(
    input: SideraPaperSourceRouteQuery,
) -> Result<SideraPaperSourceRoute, String> {
    validate_paper_and_source_values(
        &input.library_database,
        &input.project_id,
        &input.paper_id,
        Some(&input.source_record_id),
    )?;
    let library = open_library_read_only(&input.library_database)?;
    let row = library
        .query_row(
            "SELECT source.id,source.source_database,source.producer_version,
                    source.provider_record_id,source.canonical_locator,source.record_type,
                    source.full_text_status,paper.title
             FROM paper_source_records source
             JOIN papers paper ON paper.project_id=source.project_id AND paper.id=source.paper_id
             WHERE source.project_id=?1 AND source.paper_id=?2 AND source.id=?3",
            params![input.project_id, input.paper_id, input.source_record_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, Option<String>>(5)?,
                    row.get::<_, Option<String>>(6)?,
                    row.get::<_, String>(7)?,
                ))
            },
        )
        .optional()
        .map_err(|_| "SIDERA_DOCUMENT_SOURCE_LOOKUP_FAILED".to_string())?
        .ok_or_else(|| "SIDERA_DOCUMENT_SOURCE_NOT_FOUND".to_string())?;
    let (url, display_locator) = sanitize_source_route(row.4.as_deref())
        .ok_or_else(|| "SIDERA_DOCUMENT_SOURCE_ROUTE_UNAVAILABLE".to_string())?;
    Ok(SideraPaperSourceRoute {
        id: row.0,
        source_database: row.1,
        producer_version: row.2,
        provider_record_id: row.3,
        record_type: row.5,
        full_text_status: row
            .6
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| "unknown".to_string()),
        paper_title: row.7,
        url,
        display_locator,
    })
}

fn read_and_validate_pdf(path: &Path) -> Result<(Vec<u8>, String), String> {
    let file = File::open(path).map_err(|_| "SIDERA_DOCUMENT_SOURCE_OPEN_FAILED".to_string())?;
    let metadata = file
        .metadata()
        .map_err(|_| "SIDERA_DOCUMENT_SOURCE_METADATA_FAILED".to_string())?;
    if !metadata.is_file() || metadata.len() == 0 {
        return Err("SIDERA_DOCUMENT_SOURCE_EMPTY".to_string());
    }
    if metadata.len() > DOCUMENT_INGEST_MAX_BYTES {
        return Err("SIDERA_DOCUMENT_SOURCE_SIZE_LIMIT_EXCEEDED".to_string());
    }
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    let mut bounded = file.take(DOCUMENT_INGEST_MAX_BYTES + 1);
    bounded
        .read_to_end(&mut bytes)
        .map_err(|_| "SIDERA_DOCUMENT_SOURCE_READ_FAILED".to_string())?;
    if bytes.len() as u64 > DOCUMENT_INGEST_MAX_BYTES {
        return Err("SIDERA_DOCUMENT_SOURCE_SIZE_LIMIT_EXCEEDED".to_string());
    }
    if !bytes.windows(5).take(1020).any(|window| window == b"%PDF-") {
        return Err("SIDERA_DOCUMENT_NOT_PDF".to_string());
    }
    let hash = sha256_hex(&bytes);
    Ok((bytes, hash))
}

fn store_blob(
    library_directory: &Path,
    sha256: &str,
    bytes: &[u8],
    now_ms: i64,
) -> Result<PathBuf, String> {
    let root = document_store_root(library_directory)
        .join("blobs")
        .join(&sha256[..2]);
    fs::create_dir_all(&root).map_err(|_| "SIDERA_DOCUMENT_BLOB_DIRECTORY_FAILED".to_string())?;
    let target = root.join(format!("{sha256}.pdf"));
    if target.is_file() {
        let existing =
            fs::read(&target).map_err(|_| "SIDERA_DOCUMENT_BLOB_VERIFY_FAILED".to_string())?;
        if sha256_hex(&existing) != sha256 {
            return Err("SIDERA_DOCUMENT_BLOB_HASH_MISMATCH".to_string());
        }
        return Ok(target);
    }
    let partial = root.join(format!(
        ".{sha256}.{}.{}.partial",
        std::process::id(),
        now_ms
    ));
    let mut file =
        File::create(&partial).map_err(|_| "SIDERA_DOCUMENT_BLOB_WRITE_FAILED".to_string())?;
    file.write_all(bytes)
        .and_then(|_| file.sync_all())
        .map_err(|_| "SIDERA_DOCUMENT_BLOB_WRITE_FAILED".to_string())?;
    if sha256_hex(
        &fs::read(&partial).map_err(|_| "SIDERA_DOCUMENT_BLOB_VERIFY_FAILED".to_string())?,
    ) != sha256
    {
        let _ = fs::remove_file(&partial);
        return Err("SIDERA_DOCUMENT_BLOB_HASH_MISMATCH".to_string());
    }
    match fs::rename(&partial, &target) {
        Ok(()) => Ok(target),
        Err(_) if target.is_file() => {
            let _ = fs::remove_file(&partial);
            Ok(target)
        }
        Err(_) => {
            let _ = fs::remove_file(&partial);
            Err("SIDERA_DOCUMENT_BLOB_COMMIT_FAILED".to_string())
        }
    }
}

fn relative_blob_path(library_directory: &Path, path: &Path) -> Result<String, String> {
    path.strip_prefix(document_store_root(library_directory))
        .map(|value| value.to_string_lossy().replace('\\', "/"))
        .map_err(|_| "SIDERA_DOCUMENT_STORAGE_PATH_INVALID".to_string())
}

pub fn record_acquisition_failure(
    input: SideraDocumentFailureInput,
) -> Result<SideraPaperDocumentSnapshot, String> {
    let source_record_id = validate_paper_and_source_values(
        &input.library_database,
        &input.project_id,
        &input.paper_id,
        input.source_record_id.as_deref(),
    )?;
    let stage = input.stage.trim();
    let error_code = input.error_code.trim();
    if stage.is_empty() || error_code.is_empty() {
        return Err("SIDERA_DOCUMENT_ACQUISITION_FAILURE_INVALID".to_string());
    }
    let locator = safe_locator(input.safe_locator.as_deref());
    let connection = open_store(&input.library_directory)?;
    let existing_document_id = connection
        .query_row(
            "SELECT id FROM documents WHERE project_id=?1 AND paper_id=?2",
            params![input.project_id, input.paper_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|_| "SIDERA_DOCUMENT_ENTITY_READ_FAILED".to_string())?;
    let acquisition_id = stable_id(
        "acquisition",
        &[
            &input.project_id,
            &input.paper_id,
            input.acquisition_kind.as_str(),
            stage,
            error_code,
            &input.now_ms.to_string(),
        ],
    );
    connection
        .execute(
            "INSERT INTO acquisition_records
             (id,project_id,paper_id,document_id,source_record_id,kind,status,stage,origin_label,safe_locator,authorization_state,document_version_id,error_code,retryable,created_at_ms,completed_at_ms)
             VALUES(?1,?2,?3,?4,?5,?6,'failed',?7,?8,?9,?10,NULL,?11,?12,?13,?13)",
            params![
                acquisition_id,
                input.project_id,
                input.paper_id,
                existing_document_id,
                source_record_id,
                input.acquisition_kind.as_str(),
                stage,
                input.origin_label,
                locator,
                input.authorization_state,
                error_code,
                i64::from(input.retryable),
                input.now_ms,
            ],
        )
        .map_err(|_| "SIDERA_DOCUMENT_ACQUISITION_WRITE_FAILED".to_string())?;
    paper_document_snapshot(SideraPaperDocumentQuery {
        library_database: Some(input.library_database),
        library_directory: input.library_directory,
        project_id: input.project_id,
        paper_id: input.paper_id,
    })
}

pub fn ingest_document(
    input: SideraDocumentIngestInput,
) -> Result<SideraPaperDocumentSnapshot, String> {
    let source_record_id = validate_paper_and_source(&input)?;
    let locator = safe_locator(input.safe_locator.as_deref());
    let (bytes, sha256) = match read_and_validate_pdf(&input.source_path) {
        Ok(value) => value,
        Err(code) => {
            record_acquisition_failure(SideraDocumentFailureInput {
                library_database: input.library_database,
                library_directory: input.library_directory,
                project_id: input.project_id,
                paper_id: input.paper_id,
                acquisition_kind: input.acquisition_kind,
                source_record_id,
                stage: "validation".to_string(),
                origin_label: input.origin_label,
                safe_locator: locator,
                authorization_state: input.authorization_state,
                error_code: code.clone(),
                retryable: true,
                now_ms: input.now_ms,
            })?;
            return Err(code);
        }
    };
    let blob_path = store_blob(&input.library_directory, &sha256, &bytes, input.now_ms)?;
    let storage_rel_path = relative_blob_path(&input.library_directory, &blob_path)?;
    let document_id = stable_id("document", &[&input.project_id, &input.paper_id]);
    let version_id = stable_id("version", &[&document_id, &sha256]);
    let acquisition_id = stable_id(
        "acquisition",
        &[
            &input.project_id,
            &input.paper_id,
            input.acquisition_kind.as_str(),
            &sha256,
            &input.now_ms.to_string(),
        ],
    );
    let connection = open_store(&input.library_directory)?;
    let transaction = connection
        .unchecked_transaction()
        .map_err(|_| "SIDERA_DOCUMENT_TRANSACTION_FAILED".to_string())?;
    transaction
        .execute(
            "INSERT INTO documents(id,project_id,paper_id,created_at_ms,updated_at_ms)
             VALUES(?1,?2,?3,?4,?4)
             ON CONFLICT(project_id,paper_id) DO UPDATE SET updated_at_ms=excluded.updated_at_ms",
            params![document_id, input.project_id, input.paper_id, input.now_ms],
        )
        .map_err(|_| "SIDERA_DOCUMENT_ENTITY_WRITE_FAILED".to_string())?;
    transaction
        .execute(
            "INSERT OR IGNORE INTO document_versions
             (id,document_id,sha256,mime_type,byte_size,storage_rel_path,original_file_name,first_acquisition_kind,version_kind,created_at_ms)
             VALUES(?1,?2,?3,'application/pdf',?4,?5,?6,?7,?8,?9)",
            params![
                version_id,
                document_id,
                sha256,
                bytes.len() as i64,
                storage_rel_path,
                input.original_file_name,
                input.acquisition_kind.as_str(),
                input.version_kind.as_str(),
                input.now_ms
            ],
        )
        .map_err(|_| "SIDERA_DOCUMENT_VERSION_WRITE_FAILED".to_string())?;
    transaction
        .execute(
            "INSERT INTO acquisition_records
             (id,project_id,paper_id,document_id,source_record_id,kind,status,stage,origin_label,safe_locator,authorization_state,document_version_id,error_code,retryable,created_at_ms,completed_at_ms)
             VALUES(?1,?2,?3,?4,?5,?6,'complete','stored',?7,?8,?9,?10,NULL,0,?11,?11)",
            params![
                acquisition_id,
                input.project_id,
                input.paper_id,
                document_id,
                source_record_id,
                input.acquisition_kind.as_str(),
                input.origin_label,
                locator,
                input.authorization_state,
                version_id,
                input.now_ms
            ],
        )
        .map_err(|_| "SIDERA_DOCUMENT_ACQUISITION_WRITE_FAILED".to_string())?;
    transaction
        .commit()
        .map_err(|_| "SIDERA_DOCUMENT_TRANSACTION_COMMIT_FAILED".to_string())?;
    paper_document_snapshot(SideraPaperDocumentQuery {
        library_database: Some(input.library_database),
        library_directory: input.library_directory,
        project_id: input.project_id,
        paper_id: input.paper_id,
    })
}

pub fn paper_document_snapshot(
    input: SideraPaperDocumentQuery,
) -> Result<SideraPaperDocumentSnapshot, String> {
    let project_id = input.project_id.clone();
    let paper_id = input.paper_id.clone();
    let mut document_id = None;
    let mut versions = Vec::new();
    let mut acquisitions = Vec::new();
    if let Some(connection) = open_store_read_only(&input.library_directory)? {
        document_id = connection
            .query_row(
                "SELECT id FROM documents WHERE project_id=?1 AND paper_id=?2",
                params![project_id, paper_id],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(|_| "SIDERA_DOCUMENT_ENTITY_READ_FAILED".to_string())?;
        if let Some(id) = document_id.as_ref() {
            let mut statement = connection
                .prepare(
                    "SELECT id,sha256,mime_type,byte_size,original_file_name,first_acquisition_kind,version_kind,created_at_ms
                     FROM document_versions WHERE document_id=?1 ORDER BY created_at_ms DESC,id DESC",
                )
                .map_err(|_| "SIDERA_DOCUMENT_VERSION_READ_FAILED".to_string())?;
            let rows = statement
                .query_map([id], |row| {
                    Ok(SideraDocumentVersion {
                        id: row.get(0)?,
                        sha256: row.get(1)?,
                        mime_type: row.get(2)?,
                        byte_size: row.get::<_, i64>(3)?.max(0) as u64,
                        original_file_name: row.get(4)?,
                        first_acquisition_kind: row.get(5)?,
                        version_kind: row.get(6)?,
                        created_at_ms: row.get(7)?,
                    })
                })
                .map_err(|_| "SIDERA_DOCUMENT_VERSION_READ_FAILED".to_string())?;
            versions = rows
                .collect::<Result<Vec<_>, _>>()
                .map_err(|_| "SIDERA_DOCUMENT_VERSION_READ_FAILED".to_string())?;
        }
        let mut statement = connection
            .prepare(
                "SELECT id,source_record_id,kind,status,stage,origin_label,safe_locator,authorization_state,document_version_id,error_code,retryable,created_at_ms,completed_at_ms
                 FROM acquisition_records WHERE project_id=?1 AND paper_id=?2 ORDER BY created_at_ms DESC,id DESC",
            )
            .map_err(|_| "SIDERA_DOCUMENT_ACQUISITION_READ_FAILED".to_string())?;
        acquisitions = statement
            .query_map(params![project_id, paper_id], |row| {
                Ok(SideraAcquisitionRecord {
                    id: row.get(0)?,
                    source_record_id: row.get(1)?,
                    kind: row.get(2)?,
                    status: row.get(3)?,
                    stage: row.get(4)?,
                    origin_label: row.get(5)?,
                    safe_locator: row.get(6)?,
                    authorization_state: row.get(7)?,
                    document_version_id: row.get(8)?,
                    error_code: row.get(9)?,
                    retryable: row.get::<_, i64>(10)? != 0,
                    created_at_ms: row.get(11)?,
                    completed_at_ms: row.get(12)?,
                })
            })
            .map_err(|_| "SIDERA_DOCUMENT_ACQUISITION_READ_FAILED".to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| "SIDERA_DOCUMENT_ACQUISITION_READ_FAILED".to_string())?;
    }
    let sources = match input.library_database {
        Some(library_database) => paper_source_records(SideraPaperSourceQuery {
            library_database,
            project_id: project_id.clone(),
            paper_id: paper_id.clone(),
        })?,
        None => Vec::new(),
    };
    Ok(SideraPaperDocumentSnapshot {
        project_id,
        paper_id,
        document_id,
        versions,
        acquisitions,
        sources,
    })
}

pub fn resolve_document_version_path(input: SideraDocumentVersionQuery) -> Result<PathBuf, String> {
    let connection = open_store_read_only(&input.library_directory)?
        .ok_or_else(|| "SIDERA_DOCUMENT_VERSION_NOT_FOUND".to_string())?;
    let rel = connection
        .query_row(
            "SELECT version.storage_rel_path
             FROM document_versions version
             JOIN documents document ON document.id=version.document_id
             WHERE document.project_id=?1 AND document.paper_id=?2 AND version.id=?3",
            params![input.project_id, input.paper_id, input.version_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|_| "SIDERA_DOCUMENT_VERSION_READ_FAILED".to_string())?
        .ok_or_else(|| "SIDERA_DOCUMENT_VERSION_NOT_FOUND".to_string())?;
    let root = document_store_root(&input.library_directory);
    let path = root.join(rel);
    if !path.is_file() || !path.starts_with(&root) {
        return Err("SIDERA_DOCUMENT_FILE_UNAVAILABLE".to_string());
    }
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static NEXT_FIXTURE: AtomicU64 = AtomicU64::new(1);

    fn fixture() -> (PathBuf, PathBuf) {
        let root = std::env::temp_dir().join(format!(
            "sidera-document-store-{}-{}",
            std::process::id(),
            NEXT_FIXTURE.fetch_add(1, Ordering::Relaxed)
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        let library = root.join("research-hotspots-v7.sqlite");
        let connection = Connection::open(&library).unwrap();
        connection
            .execute_batch(
                "CREATE TABLE papers(id TEXT NOT NULL,project_id TEXT NOT NULL,title TEXT,PRIMARY KEY(project_id,id));
                 CREATE TABLE paper_source_records(
                   id TEXT PRIMARY KEY,project_id TEXT NOT NULL,paper_id TEXT NOT NULL,
                   commit_id TEXT NOT NULL,batch_id TEXT NOT NULL,candidate_id TEXT NOT NULL,
                   source_database TEXT NOT NULL,producer_version TEXT NOT NULL,
                   provider_record_id TEXT,canonical_locator TEXT,record_type TEXT,
                   full_text_status TEXT NOT NULL,metadata_json TEXT NOT NULL,
                   provenance_json TEXT NOT NULL,
                   created_at_ms INTEGER NOT NULL
                 );
                 INSERT INTO papers(id,project_id,title) VALUES('paper-1','project-1','Test');
                 INSERT INTO paper_source_records(
                   id,project_id,paper_id,commit_id,batch_id,candidate_id,source_database,
                   producer_version,provider_record_id,canonical_locator,record_type,
                   full_text_status,metadata_json,provenance_json,created_at_ms
                  ) VALUES(
                   'source-1','project-1','paper-1','commit-1','batch-1','review-candidate-1',
                   'Crossref','whu-academic-discovery-v2','provider-1',
                   'https://example.org/record/1?docid=provider-1&ticket=secret',
                   'journal-article','available','{}',
                   '{\"resultId\":\"search-candidate-1\",\"payload\":{\"searchCandidateId\":\"search-candidate-1\"}}',1
                  );",
            )
            .unwrap();
        (root, library)
    }

    fn input(root: &Path, library: &Path, source: &Path, now_ms: i64) -> SideraDocumentIngestInput {
        SideraDocumentIngestInput {
            library_database: library.to_path_buf(),
            library_directory: root.to_path_buf(),
            project_id: "project-1".to_string(),
            paper_id: "paper-1".to_string(),
            source_path: source.to_path_buf(),
            acquisition_kind: SideraAcquisitionKind::LocalImport,
            version_kind: SideraDocumentVersionKind::UserImport,
            source_record_id: None,
            origin_label: Some("local.pdf".to_string()),
            safe_locator: Some("https://example.com/file?ticket=secret#page=2".to_string()),
            authorization_state: "user-selected".to_string(),
            original_file_name: Some("local.pdf".to_string()),
            now_ms,
        }
    }

    #[test]
    fn local_pdf_is_immutable_deduplicated_and_restored() {
        let (root, library) = fixture();
        let first = root.join("first.pdf");
        fs::write(&first, b"%PDF-1.7\nfirst\n%%EOF").unwrap();
        let snapshot = ingest_document(input(&root, &library, &first, 10)).unwrap();
        assert_eq!(snapshot.versions.len(), 1);
        assert_eq!(snapshot.versions[0].version_kind, "user-import");
        assert_eq!(snapshot.acquisitions.len(), 1);
        assert_eq!(snapshot.acquisitions[0].source_record_id, None);
        assert_eq!(snapshot.sources.len(), 1);
        assert_eq!(snapshot.sources[0].id, "source-1");
        assert_eq!(
            snapshot.sources[0].display_locator.as_deref(),
            Some("https://example.org/record/1")
        );
        assert!(snapshot.sources[0].can_open_record);
        assert_eq!(
            snapshot.acquisitions[0].safe_locator.as_deref(),
            Some("https://example.com/file")
        );
        let stored_path = resolve_document_version_path(SideraDocumentVersionQuery {
            library_directory: root.clone(),
            project_id: "project-1".to_string(),
            paper_id: "paper-1".to_string(),
            version_id: snapshot.versions[0].id.clone(),
        })
        .unwrap();
        let stored = fs::read(stored_path).unwrap();
        assert_eq!(sha256_hex(&stored), snapshot.versions[0].sha256);
        let public_json = serde_json::to_value(&snapshot).unwrap();
        assert!(public_json["versions"][0].get("storagePath").is_none());

        let duplicate = ingest_document(input(&root, &library, &first, 11)).unwrap();
        assert_eq!(duplicate.versions.len(), 1);
        assert_eq!(duplicate.acquisitions.len(), 2);

        let second = root.join("second.pdf");
        fs::write(&second, b"%PDF-1.7\nsecond\n%%EOF").unwrap();
        let multi = ingest_document(input(&root, &library, &second, 12)).unwrap();
        assert_eq!(multi.versions.len(), 2);
        let restored = paper_document_snapshot(SideraPaperDocumentQuery {
            library_database: Some(library.clone()),
            library_directory: root.clone(),
            project_id: "project-1".to_string(),
            paper_id: "paper-1".to_string(),
        })
        .unwrap();
        assert_eq!(restored.versions.len(), 2);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn explicit_and_evidence_based_source_records_are_bound_without_guessing() {
        let (root, library) = fixture();
        let pdf = root.join("institution.pdf");
        fs::write(&pdf, b"%PDF-1.7\ninstitution\n%%EOF").unwrap();

        let resolved = resolve_source_record_match(SideraSourceRecordMatchInput {
            library_database: library.clone(),
            project_id: "project-1".to_string(),
            paper_id: "paper-1".to_string(),
            search_candidate_id: Some("search-candidate-1".to_string()),
            provider_record_id: None,
            canonical_locator: None,
            source_database: None,
        })
        .unwrap();
        assert_eq!(resolved.as_deref(), Some("source-1"));

        let mut explicit = input(&root, &library, &pdf, 30);
        explicit.acquisition_kind = SideraAcquisitionKind::InstitutionDownload;
        explicit.source_record_id = resolved;
        let snapshot = ingest_document(explicit).unwrap();
        assert_eq!(
            snapshot.acquisitions[0].source_record_id.as_deref(),
            Some("source-1")
        );

        let connection = Connection::open(&library).unwrap();
        connection
            .execute(
                "INSERT INTO paper_source_records(
                   id,project_id,paper_id,commit_id,batch_id,candidate_id,source_database,
                   producer_version,provider_record_id,canonical_locator,record_type,
                   full_text_status,metadata_json,provenance_json,created_at_ms
                  ) VALUES(
                   'source-2','project-1','paper-1','commit-1','batch-1','review-candidate-2',
                   'Crossref','whu-academic-discovery-v2',NULL,NULL,'journal-article',
                   'unknown','{}','{}',2
                  )",
                [],
            )
            .unwrap();
        drop(connection);
        let ambiguous = resolve_source_record_match(SideraSourceRecordMatchInput {
            library_database: library.clone(),
            project_id: "project-1".to_string(),
            paper_id: "paper-1".to_string(),
            search_candidate_id: None,
            provider_record_id: None,
            canonical_locator: None,
            source_database: Some("Crossref".to_string()),
        })
        .unwrap();
        assert_eq!(ambiguous, None);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn source_routes_are_resolved_by_identity_and_strip_sensitive_parameters() {
        let (root, library) = fixture();
        let sources = paper_source_records(SideraPaperSourceQuery {
            library_database: library.clone(),
            project_id: "project-1".to_string(),
            paper_id: "paper-1".to_string(),
        })
        .unwrap();
        assert_eq!(sources.len(), 1);
        assert_eq!(sources[0].source_database, "Crossref");
        assert_eq!(sources[0].full_text_status, "available");
        assert_eq!(
            sources[0].display_locator.as_deref(),
            Some("https://example.org/record/1")
        );

        let route = resolve_paper_source_route(SideraPaperSourceRouteQuery {
            library_database: library.clone(),
            project_id: "project-1".to_string(),
            paper_id: "paper-1".to_string(),
            source_record_id: "source-1".to_string(),
        })
        .unwrap();
        assert_eq!(route.paper_title, "Test");
        assert!(route.url.contains("docid=provider-1"));
        assert!(!route.url.contains("ticket"));
        assert_eq!(route.display_locator, "https://example.org/record/1");
        assert_eq!(
            resolve_paper_source_route(SideraPaperSourceRouteQuery {
                library_database: library,
                project_id: "project-1".to_string(),
                paper_id: "paper-1".to_string(),
                source_record_id: "missing".to_string(),
            })
            .unwrap_err(),
            "SIDERA_DOCUMENT_SOURCE_NOT_FOUND"
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn invalid_file_and_unknown_paper_are_rejected() {
        let (root, library) = fixture();
        let text = root.join("not.pdf");
        fs::write(&text, b"not a pdf").unwrap();
        assert_eq!(
            ingest_document(input(&root, &library, &text, 20)).unwrap_err(),
            "SIDERA_DOCUMENT_NOT_PDF"
        );
        let mut missing = input(&root, &library, &text, 21);
        missing.paper_id = "missing".to_string();
        assert_eq!(
            ingest_document(missing).unwrap_err(),
            "SIDERA_DOCUMENT_PAPER_NOT_FOUND"
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn oversized_source_is_rejected_from_metadata_before_pdf_reading() {
        let (root, _) = fixture();
        let source = root.join("oversized.pdf");
        File::create(&source)
            .unwrap()
            .set_len(DOCUMENT_INGEST_MAX_BYTES + 1)
            .unwrap();

        assert_eq!(
            read_and_validate_pdf(&source).unwrap_err(),
            "SIDERA_DOCUMENT_SOURCE_SIZE_LIMIT_EXCEEDED"
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn missing_store_business_reads_are_side_effect_free() {
        let (root, _) = fixture();
        let sidera_directory = root.join("Sidera");
        assert!(!sidera_directory.exists());

        let snapshot = paper_document_snapshot(SideraPaperDocumentQuery {
            library_database: None,
            library_directory: root.clone(),
            project_id: "project-1".to_string(),
            paper_id: "paper-1".to_string(),
        })
        .unwrap();
        assert_eq!(snapshot.document_id, None);
        assert!(snapshot.versions.is_empty());
        assert!(snapshot.acquisitions.is_empty());
        assert!(!sidera_directory.exists());

        assert_eq!(
            resolve_document_version_path(SideraDocumentVersionQuery {
                library_directory: root.clone(),
                project_id: "project-1".to_string(),
                paper_id: "paper-1".to_string(),
                version_id: "missing".to_string(),
            })
            .unwrap_err(),
            "SIDERA_DOCUMENT_VERSION_NOT_FOUND"
        );
        assert!(!sidera_directory.exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn prepared_store_business_reads_enforce_query_only() {
        let (root, _) = fixture();
        drop(open_store(&root).unwrap());
        let connection = open_store_read_only(&root).unwrap().unwrap();
        let query_only: i64 = connection
            .pragma_query_value(None, "query_only", |row| row.get(0))
            .unwrap();
        assert_eq!(query_only, 1);
        drop(connection);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn pre_ingest_failures_are_persisted_safely_and_restored() {
        let (root, library) = fixture();
        let snapshot = record_acquisition_failure(SideraDocumentFailureInput {
            library_database: library.clone(),
            library_directory: root.clone(),
            project_id: "project-1".to_string(),
            paper_id: "paper-1".to_string(),
            acquisition_kind: SideraAcquisitionKind::InstitutionDownload,
            source_record_id: None,
            stage: "source-match".to_string(),
            origin_label: Some("institution.pdf".to_string()),
            safe_locator: Some("https://example.org/record/1?ticket=secret#download".to_string()),
            authorization_state: "institution-session-user-triggered".to_string(),
            error_code: "SIDERA_DOCUMENT_SOURCE_MATCH_UNRESOLVED".to_string(),
            retryable: true,
            now_ms: 40,
        })
        .unwrap();
        assert_eq!(snapshot.versions.len(), 0);
        assert_eq!(snapshot.acquisitions.len(), 1);
        assert_eq!(snapshot.acquisitions[0].status, "failed");
        assert_eq!(snapshot.acquisitions[0].stage, "source-match");
        assert_eq!(
            snapshot.acquisitions[0].error_code.as_deref(),
            Some("SIDERA_DOCUMENT_SOURCE_MATCH_UNRESOLVED")
        );
        assert!(snapshot.acquisitions[0].retryable);
        assert_eq!(
            snapshot.acquisitions[0].safe_locator.as_deref(),
            Some("https://example.org/record/1")
        );

        let restored = paper_document_snapshot(SideraPaperDocumentQuery {
            library_database: Some(library.clone()),
            library_directory: root.clone(),
            project_id: "project-1".to_string(),
            paper_id: "paper-1".to_string(),
        })
        .unwrap();
        assert_eq!(restored.acquisitions, snapshot.acquisitions);

        let mut unknown = SideraDocumentFailureInput {
            library_database: library,
            library_directory: root.clone(),
            project_id: "project-1".to_string(),
            paper_id: "missing".to_string(),
            acquisition_kind: SideraAcquisitionKind::InstitutionDownload,
            source_record_id: None,
            stage: "download-selection".to_string(),
            origin_label: None,
            safe_locator: None,
            authorization_state: "institution-session-user-triggered".to_string(),
            error_code: "SIDERA_INSTITUTION_DOWNLOAD_NOT_FOUND".to_string(),
            retryable: true,
            now_ms: 41,
        };
        assert_eq!(
            record_acquisition_failure(unknown.clone()).unwrap_err(),
            "SIDERA_DOCUMENT_PAPER_NOT_FOUND"
        );
        unknown.paper_id = "paper-1".to_string();
        unknown.stage = " ".to_string();
        assert_eq!(
            record_acquisition_failure(unknown).unwrap_err(),
            "SIDERA_DOCUMENT_ACQUISITION_FAILURE_INVALID"
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn schema_v1_is_migrated_without_losing_document_versions() {
        let (root, _) = fixture();
        fs::create_dir_all(root.join("Sidera")).unwrap();
        let database = document_store_database_path(&root);
        let connection = Connection::open(&database).unwrap();
        connection
            .execute_batch(
                "PRAGMA user_version=1;
                 CREATE TABLE documents(
                   id TEXT PRIMARY KEY,project_id TEXT NOT NULL,paper_id TEXT NOT NULL,
                   created_at_ms INTEGER NOT NULL,updated_at_ms INTEGER NOT NULL,
                   UNIQUE(project_id,paper_id)
                 );
                 CREATE TABLE document_versions(
                   id TEXT PRIMARY KEY,document_id TEXT NOT NULL,sha256 TEXT NOT NULL,
                   mime_type TEXT NOT NULL,byte_size INTEGER NOT NULL,storage_rel_path TEXT NOT NULL,
                   original_file_name TEXT,first_acquisition_kind TEXT NOT NULL,created_at_ms INTEGER NOT NULL,
                   UNIQUE(document_id,sha256),
                   FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE
                 );
                 INSERT INTO documents VALUES('document-1','project-1','paper-1',1,1);
                 INSERT INTO document_versions VALUES(
                   'version-1','document-1','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                   'application/pdf',12,'blobs/aa/a.pdf','legacy.pdf','local-import',1
                 );",
            )
            .unwrap();
        drop(connection);

        let migrated = open_store(&root).unwrap();
        let schema_version: i64 = migrated
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .unwrap();
        let version_kind: String = migrated
            .query_row(
                "SELECT version_kind FROM document_versions WHERE id='version-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(schema_version, DOCUMENT_STORE_SCHEMA_VERSION);
        assert_eq!(version_kind, "user-import");
        drop(migrated);
        fs::remove_dir_all(root).unwrap();
    }
}
