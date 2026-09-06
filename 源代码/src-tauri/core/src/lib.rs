pub mod agent;
pub mod agent_capabilities;
pub mod agent_executor;
pub mod agent_protocol;
pub mod agent_report;
pub mod agent_store;
pub mod agent_tools;
pub mod document_agent;
pub mod document_derived;
pub mod document_evidence;
pub mod document_index;
pub mod document_ocr;
pub mod document_protocol;
pub mod document_store;
pub mod import_commit;
pub mod import_review;
pub mod institution_browser;
pub mod institution_connection;
pub mod institution_probe;
pub mod institution_search;
pub mod pi_protocol;
pub mod research_search;
pub mod semantic_layout;
pub mod whu_structured_discovery;

use std::collections::HashSet;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

pub const V20_SCHEMA_VERSION: i64 = 8;
pub const LIBRARY_SCHEMA_VERSION: i64 = 14;
pub const MIN_SUPPORTED_LIBRARY_SCHEMA_VERSION: i64 = 8;
pub const V20_ALGORITHM_VERSION: &str = "v20-semantic-e5-small-3";
pub const HOTSPOT_IDENTITY_VERSION: &str = "stable-field-key-sha256-v2";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotHotspot {
    pub hotspot_id: String,
    pub payload_json: String,
    pub identity_key_sha256: String,
    pub x: f64,
    pub y: f64,
    pub z: f64,
    pub paper_count: i64,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotHotspotLineage {
    pub from_snapshot_id: String,
    pub from_hotspot_id: String,
    pub to_snapshot_id: String,
    pub to_hotspot_id: String,
    pub relation_type: String,
    pub member_overlap: f64,
    pub identity_key_match: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotMembership {
    pub paper_id: String,
    pub hotspot_id: String,
    pub x: f64,
    pub y: f64,
    pub z: f64,
    pub representative_rank: Option<i64>,
    pub score: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotWriteInput {
    pub snapshot_id: String,
    pub project_id: String,
    pub algorithm_version: String,
    pub layout_version: String,
    pub projection_version: String,
    pub embedding_model_id: String,
    pub embedding_model_revision: String,
    pub hotspot_identity_version: String,
    pub paper_count: i64,
    pub created_at: String,
    pub hotspots: Vec<SnapshotHotspot>,
    pub memberships: Vec<SnapshotMembership>,
    #[serde(default)]
    pub lineage: Vec<SnapshotHotspotLineage>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisState {
    pub project_id: String,
    pub active_snapshot_id: String,
    pub algorithm_version: String,
    pub layout_version: String,
    pub projection_version: String,
    pub embedding_model_id: String,
    pub embedding_model_revision: String,
    pub hotspot_identity_version: String,
    pub paper_count: i64,
    pub hotspot_count: i64,
    pub membership_count: i64,
    pub generated_at: String,
    pub library_revision: i64,
}

pub const V20_VISUAL_SOURCE_ACTIVE_SNAPSHOT_INVALID: &str =
    "V20_VISUAL_SOURCE_ACTIVE_SNAPSHOT_INVALID";
pub const V20_VISUAL_SOURCE_REVISION_AHEAD: &str = "V20_VISUAL_SOURCE_REVISION_AHEAD";
pub const V20_VISUAL_SOURCE_ACTIVE_REVISION_MISMATCH: &str =
    "V20_VISUAL_SOURCE_ACTIVE_REVISION_MISMATCH";
pub const V20_VISUAL_SOURCE_HOTSPOT_COUNT_MISMATCH: &str =
    "V20_VISUAL_SOURCE_HOTSPOT_COUNT_MISMATCH";
pub const V20_VISUAL_SOURCE_MEMBERSHIP_COUNT_MISMATCH: &str =
    "V20_VISUAL_SOURCE_MEMBERSHIP_COUNT_MISMATCH";
pub const V20_VISUAL_SOURCE_PAPER_COUNT_MISMATCH: &str = "V20_VISUAL_SOURCE_PAPER_COUNT_MISMATCH";
pub const V20_VISUAL_SOURCE_CURRENT_PAPER_COUNT_MISMATCH: &str =
    "V20_VISUAL_SOURCE_CURRENT_PAPER_COUNT_MISMATCH";
pub const V20_VISUAL_SOURCE_LIBRARY_REVISION_CONTRACT_MISMATCH: &str =
    "V20_VISUAL_SOURCE_LIBRARY_REVISION_CONTRACT_MISMATCH";
pub const V20_VISUAL_SOURCE_ORPHAN_HOTSPOT_MEMBERSHIP: &str =
    "V20_VISUAL_SOURCE_ORPHAN_HOTSPOT_MEMBERSHIP";
pub const V20_VISUAL_SOURCE_ORPHAN_PAPER_MEMBERSHIP: &str =
    "V20_VISUAL_SOURCE_ORPHAN_PAPER_MEMBERSHIP";

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ImmersiveBackgroundVisualSourceKind {
    ActiveV20,
    HistoricalV20,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ImmersiveBackgroundAnalysisFreshness {
    Current,
    StaleByLibraryRevision,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ImmersiveBackgroundVisualSourceStaleReason {
    ActiveStateMissing,
    LibraryRevisionAdvanced,
    LibraryRevisionAndPaperCountChanged,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ImmersiveBackgroundVisualSource {
    pub source_snapshot_id: String,
    pub source_kind: ImmersiveBackgroundVisualSourceKind,
    pub analysis_freshness: ImmersiveBackgroundAnalysisFreshness,
    pub source_revision: i64,
    pub current_revision: i64,
    pub source_paper_count: i64,
    pub current_paper_count: i64,
    pub stale_reason: Option<ImmersiveBackgroundVisualSourceStaleReason>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnifiedGalaxyRows {
    pub state: AnalysisState,
    pub hotspots: Vec<SnapshotHotspot>,
    pub memberships: Vec<SnapshotMembership>,
}

#[derive(Debug, Clone)]
pub struct UnifiedHotspotRows {
    pub state: AnalysisState,
    pub hotspots: Vec<SnapshotHotspot>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ValidatedLibraryCandidate {
    pub schema_version: i64,
    pub project_id: String,
    pub paper_count: i64,
    pub hotspot_count: i64,
    pub membership_count: i64,
    pub snapshot_id: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum LibraryV14SchemaContractStatus {
    CurrentV14,
    KnownPrecontractV14,
    UnknownInvalidV14,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LibraryV14SchemaContractAssessment {
    pub status: LibraryV14SchemaContractStatus,
    pub candidate: ValidatedLibraryCandidate,
    pub error_code: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FirstRunMode {
    Seed,
    Empty,
    Existing,
}

impl FirstRunMode {
    pub fn parse(value: &str) -> Result<Self, String> {
        match value.trim().to_ascii_lowercase().as_str() {
            "seed" => Ok(Self::Seed),
            "empty" => Ok(Self::Empty),
            "existing" => Ok(Self::Existing),
            _ => Err("UNKNOWN_LIBRARY_SETUP_MODE".to_string()),
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FirstRunLocationValidation {
    pub valid: bool,
    pub database_dir: PathBuf,
    pub database_path: PathBuf,
    pub writable: bool,
    pub available_space_bytes: u64,
    pub required_space_bytes: u64,
    pub existing_database: bool,
    pub existing: Option<ValidatedLibraryCandidate>,
    pub message: String,
}

#[derive(Debug, Clone)]
pub struct SeedExpectation {
    pub sha256: String,
    pub size_bytes: u64,
    pub schema_version: i64,
    pub project_id: String,
    pub snapshot_id: String,
    pub paper_count: i64,
    pub hotspot_count: i64,
    pub membership_count: i64,
}

pub fn ensure_v20_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(include_str!("schema.sql"))
        .map_err(|error| error.to_string())
}

pub fn ensure_import_schema(conn: &Connection) -> Result<(), String> {
    let schema_version: i64 = conn
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(|error| error.to_string())?;
    match schema_version {
        LIBRARY_SCHEMA_VERSION => validate_import_schema_contract(conn),
        version if version > LIBRARY_SCHEMA_VERSION => Err("LIBRARY_SCHEMA_TOO_NEW".to_string()),
        0 => {
            conn.execute_batch(include_str!("import_schema.sql"))
                .map_err(|error| error.to_string())?;
            validate_import_schema_contract(conn)
        }
        _ => Err("LIBRARY_SCHEMA_MIGRATION_REQUIRED".to_string()),
    }
}

#[derive(Clone, Copy)]
struct ImportColumnContract {
    name: &'static str,
    declared_type: &'static str,
    not_null: bool,
    primary_key_ordinal: i64,
}

#[derive(Clone, Copy)]
struct ImportForeignKeyContract {
    from_columns: &'static [&'static str],
    target_table: &'static str,
    target_columns: &'static [&'static str],
    on_delete: &'static str,
}

const IMPORT_COMMIT_COLUMNS: &[ImportColumnContract] = &[
    ImportColumnContract {
        name: "id",
        declared_type: "TEXT",
        not_null: false,
        primary_key_ordinal: 1,
    },
    ImportColumnContract {
        name: "project_id",
        declared_type: "TEXT",
        not_null: true,
        primary_key_ordinal: 0,
    },
    ImportColumnContract {
        name: "batch_id",
        declared_type: "TEXT",
        not_null: true,
        primary_key_ordinal: 0,
    },
    ImportColumnContract {
        name: "client_commit_id",
        declared_type: "TEXT",
        not_null: true,
        primary_key_ordinal: 0,
    },
    ImportColumnContract {
        name: "preview_id",
        declared_type: "TEXT",
        not_null: true,
        primary_key_ordinal: 0,
    },
    ImportColumnContract {
        name: "preview_hash",
        declared_type: "TEXT",
        not_null: true,
        primary_key_ordinal: 0,
    },
    ImportColumnContract {
        name: "batch_version",
        declared_type: "INTEGER",
        not_null: true,
        primary_key_ordinal: 0,
    },
    ImportColumnContract {
        name: "status",
        declared_type: "TEXT",
        not_null: true,
        primary_key_ordinal: 0,
    },
    ImportColumnContract {
        name: "before_revision",
        declared_type: "INTEGER",
        not_null: true,
        primary_key_ordinal: 0,
    },
    ImportColumnContract {
        name: "after_revision",
        declared_type: "INTEGER",
        not_null: true,
        primary_key_ordinal: 0,
    },
    ImportColumnContract {
        name: "paper_count_before",
        declared_type: "INTEGER",
        not_null: true,
        primary_key_ordinal: 0,
    },
    ImportColumnContract {
        name: "paper_count_after",
        declared_type: "INTEGER",
        not_null: true,
        primary_key_ordinal: 0,
    },
    ImportColumnContract {
        name: "counts_json",
        declared_type: "TEXT",
        not_null: true,
        primary_key_ordinal: 0,
    },
    ImportColumnContract {
        name: "created_at_ms",
        declared_type: "INTEGER",
        not_null: true,
        primary_key_ordinal: 0,
    },
    ImportColumnContract {
        name: "completed_at_ms",
        declared_type: "INTEGER",
        not_null: true,
        primary_key_ordinal: 0,
    },
    ImportColumnContract {
        name: "rolled_back_at_ms",
        declared_type: "INTEGER",
        not_null: false,
        primary_key_ordinal: 0,
    },
    ImportColumnContract {
        name: "rollback_revision",
        declared_type: "INTEGER",
        not_null: false,
        primary_key_ordinal: 0,
    },
    ImportColumnContract {
        name: "error_code",
        declared_type: "TEXT",
        not_null: false,
        primary_key_ordinal: 0,
    },
];

const IMPORT_SOURCE_COLUMNS: &[ImportColumnContract] = &[
    ImportColumnContract {
        name: "id",
        declared_type: "TEXT",
        not_null: false,
        primary_key_ordinal: 1,
    },
    ImportColumnContract {
        name: "project_id",
        declared_type: "TEXT",
        not_null: true,
        primary_key_ordinal: 0,
    },
    ImportColumnContract {
        name: "paper_id",
        declared_type: "TEXT",
        not_null: true,
        primary_key_ordinal: 0,
    },
    ImportColumnContract {
        name: "commit_id",
        declared_type: "TEXT",
        not_null: true,
        primary_key_ordinal: 0,
    },
    ImportColumnContract {
        name: "batch_id",
        declared_type: "TEXT",
        not_null: true,
        primary_key_ordinal: 0,
    },
    ImportColumnContract {
        name: "candidate_id",
        declared_type: "TEXT",
        not_null: true,
        primary_key_ordinal: 0,
    },
    ImportColumnContract {
        name: "source_database",
        declared_type: "TEXT",
        not_null: true,
        primary_key_ordinal: 0,
    },
    ImportColumnContract {
        name: "producer_version",
        declared_type: "TEXT",
        not_null: true,
        primary_key_ordinal: 0,
    },
    ImportColumnContract {
        name: "provider_record_id",
        declared_type: "TEXT",
        not_null: false,
        primary_key_ordinal: 0,
    },
    ImportColumnContract {
        name: "canonical_locator",
        declared_type: "TEXT",
        not_null: false,
        primary_key_ordinal: 0,
    },
    ImportColumnContract {
        name: "record_type",
        declared_type: "TEXT",
        not_null: false,
        primary_key_ordinal: 0,
    },
    ImportColumnContract {
        name: "full_text_status",
        declared_type: "TEXT",
        not_null: false,
        primary_key_ordinal: 0,
    },
    ImportColumnContract {
        name: "metadata_json",
        declared_type: "TEXT",
        not_null: true,
        primary_key_ordinal: 0,
    },
    ImportColumnContract {
        name: "provenance_json",
        declared_type: "TEXT",
        not_null: true,
        primary_key_ordinal: 0,
    },
    ImportColumnContract {
        name: "created_at_ms",
        declared_type: "INTEGER",
        not_null: true,
        primary_key_ordinal: 0,
    },
];

const IMPORT_ALIAS_COLUMNS: &[ImportColumnContract] = &[
    ImportColumnContract {
        name: "id",
        declared_type: "TEXT",
        not_null: false,
        primary_key_ordinal: 1,
    },
    ImportColumnContract {
        name: "project_id",
        declared_type: "TEXT",
        not_null: true,
        primary_key_ordinal: 0,
    },
    ImportColumnContract {
        name: "paper_id",
        declared_type: "TEXT",
        not_null: true,
        primary_key_ordinal: 0,
    },
    ImportColumnContract {
        name: "alias_kind",
        declared_type: "TEXT",
        not_null: true,
        primary_key_ordinal: 0,
    },
    ImportColumnContract {
        name: "normalized_value",
        declared_type: "TEXT",
        not_null: true,
        primary_key_ordinal: 0,
    },
    ImportColumnContract {
        name: "source_record_id",
        declared_type: "TEXT",
        not_null: false,
        primary_key_ordinal: 0,
    },
    ImportColumnContract {
        name: "commit_id",
        declared_type: "TEXT",
        not_null: true,
        primary_key_ordinal: 0,
    },
    ImportColumnContract {
        name: "created_at_ms",
        declared_type: "INTEGER",
        not_null: true,
        primary_key_ordinal: 0,
    },
];

const IMPORT_ITEM_COLUMNS: &[ImportColumnContract] = &[
    ImportColumnContract {
        name: "commit_id",
        declared_type: "TEXT",
        not_null: true,
        primary_key_ordinal: 1,
    },
    ImportColumnContract {
        name: "candidate_id",
        declared_type: "TEXT",
        not_null: true,
        primary_key_ordinal: 2,
    },
    ImportColumnContract {
        name: "row_index",
        declared_type: "INTEGER",
        not_null: true,
        primary_key_ordinal: 0,
    },
    ImportColumnContract {
        name: "action",
        declared_type: "TEXT",
        not_null: true,
        primary_key_ordinal: 0,
    },
    ImportColumnContract {
        name: "paper_id",
        declared_type: "TEXT",
        not_null: false,
        primary_key_ordinal: 0,
    },
    ImportColumnContract {
        name: "before_paper_json",
        declared_type: "TEXT",
        not_null: false,
        primary_key_ordinal: 0,
    },
    ImportColumnContract {
        name: "after_paper_json",
        declared_type: "TEXT",
        not_null: false,
        primary_key_ordinal: 0,
    },
    ImportColumnContract {
        name: "after_fingerprint",
        declared_type: "TEXT",
        not_null: false,
        primary_key_ordinal: 0,
    },
    ImportColumnContract {
        name: "source_record_id",
        declared_type: "TEXT",
        not_null: false,
        primary_key_ordinal: 0,
    },
    ImportColumnContract {
        name: "created_at_ms",
        declared_type: "INTEGER",
        not_null: true,
        primary_key_ordinal: 0,
    },
];

const IMPORT_SOURCE_FOREIGN_KEYS: &[ImportForeignKeyContract] = &[
    ImportForeignKeyContract {
        from_columns: &["project_id", "paper_id"],
        target_table: "papers",
        target_columns: &["project_id", "id"],
        on_delete: "CASCADE",
    },
    ImportForeignKeyContract {
        from_columns: &["commit_id"],
        target_table: "paper_import_commits",
        target_columns: &["id"],
        on_delete: "RESTRICT",
    },
];
const IMPORT_ALIAS_FOREIGN_KEYS: &[ImportForeignKeyContract] = &[
    ImportForeignKeyContract {
        from_columns: &["project_id", "paper_id"],
        target_table: "papers",
        target_columns: &["project_id", "id"],
        on_delete: "CASCADE",
    },
    ImportForeignKeyContract {
        from_columns: &["source_record_id"],
        target_table: "paper_source_records",
        target_columns: &["id"],
        on_delete: "SET NULL",
    },
    ImportForeignKeyContract {
        from_columns: &["commit_id"],
        target_table: "paper_import_commits",
        target_columns: &["id"],
        on_delete: "RESTRICT",
    },
];
const IMPORT_ITEM_FOREIGN_KEYS: &[ImportForeignKeyContract] = &[
    ImportForeignKeyContract {
        from_columns: &["commit_id"],
        target_table: "paper_import_commits",
        target_columns: &["id"],
        on_delete: "CASCADE",
    },
    ImportForeignKeyContract {
        from_columns: &["source_record_id"],
        target_table: "paper_source_records",
        target_columns: &["id"],
        on_delete: "SET NULL",
    },
];
const PRECONTRACT_IMPORT_SOURCE_FOREIGN_KEYS: &[ImportForeignKeyContract] = &[
    ImportForeignKeyContract {
        from_columns: &["paper_id"],
        target_table: "papers",
        target_columns: &["id"],
        on_delete: "CASCADE",
    },
    ImportForeignKeyContract {
        from_columns: &["commit_id"],
        target_table: "paper_import_commits",
        target_columns: &["id"],
        on_delete: "RESTRICT",
    },
];
const PRECONTRACT_IMPORT_ALIAS_FOREIGN_KEYS: &[ImportForeignKeyContract] = &[
    ImportForeignKeyContract {
        from_columns: &["paper_id"],
        target_table: "papers",
        target_columns: &["id"],
        on_delete: "CASCADE",
    },
    ImportForeignKeyContract {
        from_columns: &["source_record_id"],
        target_table: "paper_source_records",
        target_columns: &["id"],
        on_delete: "SET NULL",
    },
    ImportForeignKeyContract {
        from_columns: &["commit_id"],
        target_table: "paper_import_commits",
        target_columns: &["id"],
        on_delete: "RESTRICT",
    },
];

fn import_schema_error(detail: impl AsRef<str>) -> String {
    format!(
        "LIBRARY_SCHEMA_V14_IMPORT_CONTRACT_INVALID:{}",
        detail.as_ref()
    )
}

fn validate_import_table_columns(
    conn: &Connection,
    table: &str,
    expected: &[ImportColumnContract],
) -> Result<(), String> {
    if !table_exists(conn, table)? {
        return Err(import_schema_error(format!("MISSING_TABLE:{table}")));
    }
    let mut statement = conn
        .prepare("SELECT name,type,\"notnull\",pk FROM pragma_table_info(?1) ORDER BY cid")
        .map_err(|error| import_schema_error(format!("TABLE_INFO:{table}:{error}")))?;
    let actual = statement
        .query_map(params![table], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)? != 0,
                row.get::<_, i64>(3)?,
            ))
        })
        .map_err(|error| import_schema_error(format!("TABLE_INFO:{table}:{error}")))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| import_schema_error(format!("TABLE_INFO:{table}:{error}")))?;
    for column in expected {
        let Some((_, declared_type, not_null, primary_key_ordinal)) =
            actual.iter().find(|(name, _, _, _)| name == column.name)
        else {
            return Err(import_schema_error(format!(
                "MISSING_COLUMN:{table}.{}",
                column.name
            )));
        };
        if !declared_type.eq_ignore_ascii_case(column.declared_type)
            || *not_null != column.not_null
            || *primary_key_ordinal != column.primary_key_ordinal
        {
            return Err(import_schema_error(format!(
                "COLUMN_MISMATCH:{table}.{}",
                column.name
            )));
        }
    }
    Ok(())
}

fn validate_exact_import_table_columns(
    conn: &Connection,
    table: &str,
    expected: &[ImportColumnContract],
) -> Result<(), String> {
    validate_import_table_columns(conn, table, expected)?;
    let actual_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info(?1)",
            params![table],
            |row| row.get(0),
        )
        .map_err(|error| import_schema_error(format!("TABLE_INFO:{table}:{error}")))?;
    if actual_count != expected.len() as i64 {
        return Err(import_schema_error(format!(
            "COLUMN_COUNT_MISMATCH:{table}"
        )));
    }
    Ok(())
}

fn schema_index_columns(conn: &Connection, index_name: &str) -> Result<Vec<String>, String> {
    let mut statement = conn
        .prepare("SELECT name FROM pragma_index_info(?1) ORDER BY seqno")
        .map_err(|error| import_schema_error(format!("INDEX_INFO:{index_name}:{error}")))?;
    let columns = statement
        .query_map(params![index_name], |row| row.get::<_, String>(0))
        .map_err(|error| import_schema_error(format!("INDEX_INFO:{index_name}:{error}")))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| import_schema_error(format!("INDEX_INFO:{index_name}:{error}")))?;
    Ok(columns)
}

fn validate_named_import_index(
    conn: &Connection,
    table: &str,
    index_name: &str,
    expected_columns: &[&str],
) -> Result<(), String> {
    let present: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND tbl_name=?1 AND name=?2",
            params![table, index_name],
            |row| row.get(0),
        )
        .map_err(|error| import_schema_error(format!("INDEX_LOOKUP:{index_name}:{error}")))?;
    if present != 1 {
        return Err(import_schema_error(format!("MISSING_INDEX:{index_name}")));
    }
    let actual = schema_index_columns(conn, index_name)?;
    if actual != expected_columns {
        return Err(import_schema_error(format!("INDEX_MISMATCH:{index_name}")));
    }
    Ok(())
}

fn validate_unique_import_index(
    conn: &Connection,
    table: &str,
    expected_columns: &[&str],
) -> Result<(), String> {
    let mut statement = conn
        .prepare("SELECT name FROM pragma_index_list(?1) WHERE \"unique\"=1 ORDER BY seq")
        .map_err(|error| import_schema_error(format!("INDEX_LIST:{table}:{error}")))?;
    let indexes = statement
        .query_map(params![table], |row| row.get::<_, String>(0))
        .map_err(|error| import_schema_error(format!("INDEX_LIST:{table}:{error}")))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| import_schema_error(format!("INDEX_LIST:{table}:{error}")))?;
    for index in indexes {
        if schema_index_columns(conn, &index)? == expected_columns {
            return Ok(());
        }
    }
    Err(import_schema_error(format!(
        "MISSING_UNIQUE:{table}:{}",
        expected_columns.join(",")
    )))
}

fn validate_exact_import_manual_indexes(
    conn: &Connection,
    table: &str,
    expected_names: &[&str],
) -> Result<(), String> {
    let mut statement = conn
        .prepare("SELECT name FROM pragma_index_list(?1) WHERE origin='c' ORDER BY name")
        .map_err(|error| import_schema_error(format!("INDEX_LIST:{table}:{error}")))?;
    let actual = statement
        .query_map(params![table], |row| row.get::<_, String>(0))
        .map_err(|error| import_schema_error(format!("INDEX_LIST:{table}:{error}")))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| import_schema_error(format!("INDEX_LIST:{table}:{error}")))?;
    let mut expected = expected_names
        .iter()
        .map(|value| (*value).to_string())
        .collect::<Vec<_>>();
    expected.sort();
    if actual != expected {
        return Err(import_schema_error(format!("INDEX_SET_MISMATCH:{table}")));
    }
    Ok(())
}

fn validate_exact_import_unique_indexes(
    conn: &Connection,
    table: &str,
    expected_columns: &[&[&str]],
) -> Result<(), String> {
    let mut statement = conn
        .prepare("SELECT name FROM pragma_index_list(?1) WHERE \"unique\"=1 ORDER BY name")
        .map_err(|error| import_schema_error(format!("INDEX_LIST:{table}:{error}")))?;
    let indexes = statement
        .query_map(params![table], |row| row.get::<_, String>(0))
        .map_err(|error| import_schema_error(format!("INDEX_LIST:{table}:{error}")))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| import_schema_error(format!("INDEX_LIST:{table}:{error}")))?;
    let mut actual = indexes
        .iter()
        .map(|index| schema_index_columns(conn, index))
        .collect::<Result<Vec<_>, _>>()?;
    actual.sort();
    let mut expected = expected_columns
        .iter()
        .map(|columns| columns.iter().map(|value| (*value).to_string()).collect())
        .collect::<Vec<Vec<String>>>();
    expected.sort();
    if actual != expected {
        return Err(import_schema_error(format!(
            "UNIQUE_INDEX_SET_MISMATCH:{table}"
        )));
    }
    Ok(())
}

fn validate_import_foreign_keys(
    conn: &Connection,
    table: &str,
    expected: &[ImportForeignKeyContract],
) -> Result<(), String> {
    let mut statement = conn
        .prepare(
            "SELECT id,seq,\"from\",\"table\",\"to\",\"on_delete\"
             FROM pragma_foreign_key_list(?1) ORDER BY id,seq",
        )
        .map_err(|error| import_schema_error(format!("FOREIGN_KEY_LIST:{table}:{error}")))?;
    let actual = statement
        .query_map(params![table], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
            ))
        })
        .map_err(|error| import_schema_error(format!("FOREIGN_KEY_LIST:{table}:{error}")))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| import_schema_error(format!("FOREIGN_KEY_LIST:{table}:{error}")))?;
    for foreign_key in expected {
        let mut candidate_ids =
            actual
                .iter()
                .filter_map(|(id, _, _, target_table, _, on_delete)| {
                    (target_table == foreign_key.target_table
                        && on_delete.eq_ignore_ascii_case(foreign_key.on_delete))
                    .then_some(*id)
                });
        let matches = candidate_ids.any(|candidate_id| {
            let columns = actual
                .iter()
                .filter(|(id, _, _, _, _, _)| *id == candidate_id)
                .map(|(_, _, from, _, target, _)| (from.as_str(), target.as_str()))
                .collect::<Vec<_>>();
            columns.len() == foreign_key.from_columns.len()
                && columns.iter().enumerate().all(|(index, (from, target))| {
                    *from == foreign_key.from_columns[index]
                        && *target == foreign_key.target_columns[index]
                })
        });
        if !matches {
            return Err(import_schema_error(format!(
                "MISSING_FOREIGN_KEY:{table}.{}",
                foreign_key.from_columns.join("+")
            )));
        }
    }
    Ok(())
}

fn validate_exact_import_foreign_keys(
    conn: &Connection,
    table: &str,
    expected: &[ImportForeignKeyContract],
) -> Result<(), String> {
    validate_import_foreign_keys(conn, table, expected)?;
    let actual_count: i64 = conn
        .query_row(
            "SELECT COUNT(DISTINCT id) FROM pragma_foreign_key_list(?1)",
            params![table],
            |row| row.get(0),
        )
        .map_err(|error| import_schema_error(format!("FOREIGN_KEY_LIST:{table}:{error}")))?;
    if actual_count != expected.len() as i64 {
        return Err(import_schema_error(format!(
            "FOREIGN_KEY_COUNT_MISMATCH:{table}"
        )));
    }
    Ok(())
}

fn ensure_precontract_project_identity_integrity(conn: &Connection) -> Result<(), String> {
    let checks = [
        (
            "SOURCE_PAPER_PROJECT_MISMATCH",
            "SELECT COUNT(*) FROM paper_source_records s
             JOIN papers p ON p.id=s.paper_id
             WHERE p.project_id<>s.project_id",
        ),
        (
            "SOURCE_COMMIT_PROJECT_MISMATCH",
            "SELECT COUNT(*) FROM paper_source_records s
             JOIN paper_import_commits c ON c.id=s.commit_id
             WHERE c.project_id<>s.project_id",
        ),
        (
            "ALIAS_PAPER_PROJECT_MISMATCH",
            "SELECT COUNT(*) FROM paper_identity_aliases a
             JOIN papers p ON p.id=a.paper_id
             WHERE p.project_id<>a.project_id",
        ),
        (
            "ALIAS_SOURCE_PROJECT_MISMATCH",
            "SELECT COUNT(*) FROM paper_identity_aliases a
             JOIN paper_source_records s ON s.id=a.source_record_id
             WHERE a.source_record_id IS NOT NULL AND s.project_id<>a.project_id",
        ),
        (
            "ALIAS_COMMIT_PROJECT_MISMATCH",
            "SELECT COUNT(*) FROM paper_identity_aliases a
             JOIN paper_import_commits c ON c.id=a.commit_id
             WHERE c.project_id<>a.project_id",
        ),
        (
            "ITEM_SOURCE_PROJECT_MISMATCH",
            "SELECT COUNT(*) FROM paper_import_commit_items i
             JOIN paper_import_commits c ON c.id=i.commit_id
             JOIN paper_source_records s ON s.id=i.source_record_id
             WHERE i.source_record_id IS NOT NULL AND s.project_id<>c.project_id",
        ),
        (
            "ITEM_PAPER_PROJECT_MISMATCH",
            "SELECT COUNT(*) FROM paper_import_commit_items i
             JOIN paper_import_commits c ON c.id=i.commit_id
             JOIN papers p ON p.id=i.paper_id
             WHERE i.paper_id IS NOT NULL AND p.project_id<>c.project_id",
        ),
    ];
    for (code, query) in checks {
        let count: i64 = conn
            .query_row(query, [], |row| row.get(0))
            .map_err(|error| import_schema_error(format!("PRECONTRACT_CHECK:{code}:{error}")))?;
        if count != 0 {
            return Err(import_schema_error(format!("PRECONTRACT_{code}")));
        }
    }
    Ok(())
}

fn validate_known_precontract_v14(conn: &Connection, strict_error: &str) -> Result<(), String> {
    if strict_error
        != "LIBRARY_SCHEMA_V14_IMPORT_CONTRACT_INVALID:MISSING_INDEX:idx_papers_project_identity"
    {
        return Err(import_schema_error("NOT_KNOWN_PRECONTRACT_SIGNATURE"));
    }

    validate_exact_import_table_columns(conn, "paper_import_commits", IMPORT_COMMIT_COLUMNS)?;
    validate_exact_import_table_columns(conn, "paper_source_records", IMPORT_SOURCE_COLUMNS)?;
    validate_exact_import_table_columns(conn, "paper_identity_aliases", IMPORT_ALIAS_COLUMNS)?;
    validate_exact_import_table_columns(conn, "paper_import_commit_items", IMPORT_ITEM_COLUMNS)?;

    validate_unique_import_index(conn, "paper_import_commits", &["project_id", "batch_id"])?;
    validate_unique_import_index(
        conn,
        "paper_import_commits",
        &["project_id", "client_commit_id"],
    )?;
    validate_unique_import_index(
        conn,
        "paper_source_records",
        &["project_id", "batch_id", "candidate_id"],
    )?;
    validate_unique_import_index(
        conn,
        "paper_identity_aliases",
        &["project_id", "alias_kind", "normalized_value"],
    )?;
    validate_exact_import_unique_indexes(
        conn,
        "paper_import_commits",
        &[
            &["id"],
            &["project_id", "batch_id"],
            &["project_id", "client_commit_id"],
        ],
    )?;
    validate_exact_import_unique_indexes(
        conn,
        "paper_source_records",
        &[&["id"], &["project_id", "batch_id", "candidate_id"]],
    )?;
    validate_exact_import_unique_indexes(
        conn,
        "paper_identity_aliases",
        &[&["id"], &["project_id", "alias_kind", "normalized_value"]],
    )?;
    validate_exact_import_unique_indexes(
        conn,
        "paper_import_commit_items",
        &[&["commit_id", "candidate_id"]],
    )?;
    if validate_unique_import_index(conn, "papers", &["project_id", "id"]).is_ok() {
        return Err(import_schema_error(
            "PRECONTRACT_UNEXPECTED_PROJECT_IDENTITY_INDEX",
        ));
    }

    validate_named_import_index(
        conn,
        "paper_import_commits",
        "idx_paper_import_commits_project_created",
        &["project_id", "created_at_ms"],
    )?;
    validate_named_import_index(
        conn,
        "paper_source_records",
        "idx_paper_source_records_project_paper",
        &["project_id", "paper_id", "created_at_ms"],
    )?;
    validate_named_import_index(
        conn,
        "paper_source_records",
        "idx_paper_source_records_provider",
        &["project_id", "source_database", "provider_record_id"],
    )?;
    validate_named_import_index(
        conn,
        "paper_identity_aliases",
        "idx_paper_identity_aliases_project_paper",
        &["project_id", "paper_id", "alias_kind"],
    )?;
    validate_named_import_index(
        conn,
        "paper_import_commit_items",
        "idx_paper_import_commit_items_paper",
        &["paper_id", "commit_id"],
    )?;
    validate_exact_import_manual_indexes(
        conn,
        "paper_import_commits",
        &["idx_paper_import_commits_project_created"],
    )?;
    validate_exact_import_manual_indexes(
        conn,
        "paper_source_records",
        &[
            "idx_paper_source_records_project_paper",
            "idx_paper_source_records_provider",
        ],
    )?;
    validate_exact_import_manual_indexes(
        conn,
        "paper_identity_aliases",
        &["idx_paper_identity_aliases_project_paper"],
    )?;
    validate_exact_import_manual_indexes(
        conn,
        "paper_import_commit_items",
        &["idx_paper_import_commit_items_paper"],
    )?;

    validate_exact_import_foreign_keys(
        conn,
        "paper_source_records",
        PRECONTRACT_IMPORT_SOURCE_FOREIGN_KEYS,
    )?;
    validate_exact_import_foreign_keys(
        conn,
        "paper_identity_aliases",
        PRECONTRACT_IMPORT_ALIAS_FOREIGN_KEYS,
    )?;
    validate_exact_import_foreign_keys(
        conn,
        "paper_import_commit_items",
        IMPORT_ITEM_FOREIGN_KEYS,
    )?;
    ensure_precontract_project_identity_integrity(conn)
}

pub fn validate_import_schema_contract(conn: &Connection) -> Result<(), String> {
    validate_import_table_columns(conn, "paper_import_commits", IMPORT_COMMIT_COLUMNS)?;
    validate_import_table_columns(conn, "paper_source_records", IMPORT_SOURCE_COLUMNS)?;
    validate_import_table_columns(conn, "paper_identity_aliases", IMPORT_ALIAS_COLUMNS)?;
    validate_import_table_columns(conn, "paper_import_commit_items", IMPORT_ITEM_COLUMNS)?;

    validate_unique_import_index(conn, "paper_import_commits", &["project_id", "batch_id"])?;
    validate_unique_import_index(
        conn,
        "paper_import_commits",
        &["project_id", "client_commit_id"],
    )?;
    validate_unique_import_index(
        conn,
        "paper_source_records",
        &["project_id", "batch_id", "candidate_id"],
    )?;
    validate_unique_import_index(
        conn,
        "paper_identity_aliases",
        &["project_id", "alias_kind", "normalized_value"],
    )?;
    validate_named_import_index(
        conn,
        "papers",
        "idx_papers_project_identity",
        &["project_id", "id"],
    )?;
    validate_unique_import_index(conn, "papers", &["project_id", "id"])?;

    validate_named_import_index(
        conn,
        "paper_import_commits",
        "idx_paper_import_commits_project_created",
        &["project_id", "created_at_ms"],
    )?;
    validate_named_import_index(
        conn,
        "paper_source_records",
        "idx_paper_source_records_project_paper",
        &["project_id", "paper_id", "created_at_ms"],
    )?;
    validate_named_import_index(
        conn,
        "paper_source_records",
        "idx_paper_source_records_provider",
        &["project_id", "source_database", "provider_record_id"],
    )?;
    validate_named_import_index(
        conn,
        "paper_identity_aliases",
        "idx_paper_identity_aliases_project_paper",
        &["project_id", "paper_id", "alias_kind"],
    )?;
    validate_named_import_index(
        conn,
        "paper_import_commit_items",
        "idx_paper_import_commit_items_paper",
        &["paper_id", "commit_id"],
    )?;

    validate_import_foreign_keys(conn, "paper_source_records", IMPORT_SOURCE_FOREIGN_KEYS)?;
    validate_import_foreign_keys(conn, "paper_identity_aliases", IMPORT_ALIAS_FOREIGN_KEYS)?;
    validate_import_foreign_keys(conn, "paper_import_commit_items", IMPORT_ITEM_FOREIGN_KEYS)?;
    Ok(())
}

pub fn write_snapshot_transaction(
    conn: &Connection,
    input: &SnapshotWriteInput,
) -> Result<AnalysisState, String> {
    ensure_v20_schema(conn)?;
    let tx = conn
        .unchecked_transaction()
        .map_err(|error| error.to_string())?;
    let state = write_snapshot_in_transaction(&tx, input)?;
    tx.commit().map_err(|error| error.to_string())?;
    Ok(state)
}

/// Writes and activates a prepared V20 snapshot inside the caller's transaction.
///
/// This is the commit primitive used by governed Agent operations so the V20
/// rows, active-state switch, Agent artifact and idempotency receipt can share
/// one SQLite commit boundary.
pub fn write_snapshot_in_transaction(
    tx: &Transaction<'_>,
    input: &SnapshotWriteInput,
) -> Result<AnalysisState, String> {
    if input.paper_count != input.memberships.len() as i64 {
        return Err(format!(
            "V20_MEMBERSHIP_COUNT_MISMATCH: papers={}, memberships={}",
            input.paper_count,
            input.memberships.len()
        ));
    }
    let hotspot_ids = input
        .hotspots
        .iter()
        .map(|row| row.hotspot_id.as_str())
        .collect::<HashSet<_>>();
    if input
        .memberships
        .iter()
        .any(|row| !hotspot_ids.contains(row.hotspot_id.as_str()))
    {
        return Err("V20_MEMBERSHIP_HOTSPOT_MISSING".to_string());
    }
    tx.execute(
        "INSERT INTO library_revision_state(project_id,revision,updated_at_ms) VALUES (?1,0,0) ON CONFLICT(project_id) DO NOTHING",
        params![input.project_id],
    ).map_err(|error| error.to_string())?;
    let library_revision: i64 = tx
        .query_row(
            "SELECT revision FROM library_revision_state WHERE project_id=?1",
            params![input.project_id],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    tx.execute(
        "INSERT INTO v20_analysis_snapshots (
           id,project_id,algorithm_version,layout_version,projection_version,
           embedding_model_id,embedding_model_revision,hotspot_identity_version,
           paper_count,hotspot_count,membership_count,status,created_at,library_revision
         ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,'writing',?12,?13)",
        params![
            input.snapshot_id,
            input.project_id,
            input.algorithm_version,
            input.layout_version,
            input.projection_version,
            input.embedding_model_id,
            input.embedding_model_revision,
            input.hotspot_identity_version,
            input.paper_count,
            input.hotspots.len() as i64,
            input.memberships.len() as i64,
            input.created_at,
            library_revision
        ],
    )
    .map_err(|error| error.to_string())?;
    {
        let mut stmt = tx
            .prepare(
                "INSERT INTO v20_hotspots (
               snapshot_id,project_id,hotspot_id,payload_json,identity_key_sha256,
               x,y,z,paper_count,updated_at
             ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
            )
            .map_err(|error| error.to_string())?;
        for row in &input.hotspots {
            stmt.execute(params![
                input.snapshot_id,
                input.project_id,
                row.hotspot_id,
                row.payload_json,
                row.identity_key_sha256,
                row.x,
                row.y,
                row.z,
                row.paper_count,
                row.updated_at
            ])
            .map_err(|error| error.to_string())?;
        }
    }
    {
        let mut stmt = tx
            .prepare(
                "INSERT INTO v20_hotspot_lineage(
               project_id,from_snapshot_id,from_hotspot_id,to_snapshot_id,to_hotspot_id,
               relation_type,member_overlap,identity_key_match,created_at
             ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
            )
            .map_err(|error| error.to_string())?;
        for row in &input.lineage {
            if row.to_snapshot_id != input.snapshot_id {
                return Err("V20_HOTSPOT_LINEAGE_TARGET_MISMATCH".into());
            }
            stmt.execute(params![
                input.project_id,
                row.from_snapshot_id,
                row.from_hotspot_id,
                row.to_snapshot_id,
                row.to_hotspot_id,
                row.relation_type,
                row.member_overlap,
                i64::from(row.identity_key_match),
                row.created_at,
            ])
            .map_err(|error| error.to_string())?;
        }
    }
    {
        let mut stmt = tx.prepare("INSERT INTO v20_paper_memberships (snapshot_id, project_id, paper_id, hotspot_id, x, y, z, representative_rank, score) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)").map_err(|error| error.to_string())?;
        for row in &input.memberships {
            stmt.execute(params![
                input.snapshot_id,
                input.project_id,
                row.paper_id,
                row.hotspot_id,
                row.x,
                row.y,
                row.z,
                row.representative_rank,
                row.score
            ])
            .map_err(|error| error.to_string())?;
        }
    }
    tx.execute(
        "UPDATE v20_analysis_snapshots SET status = 'ready' WHERE id = ?1",
        params![input.snapshot_id],
    )
    .map_err(|error| error.to_string())?;
    tx.execute(
        "INSERT INTO v20_analysis_state(project_id, active_snapshot_id, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(project_id) DO UPDATE SET active_snapshot_id = excluded.active_snapshot_id, updated_at = excluded.updated_at",
        params![input.project_id, input.snapshot_id, input.created_at],
    ).map_err(|error| error.to_string())?;
    Ok(AnalysisState {
        project_id: input.project_id.clone(),
        active_snapshot_id: input.snapshot_id.clone(),
        algorithm_version: input.algorithm_version.clone(),
        layout_version: input.layout_version.clone(),
        projection_version: input.projection_version.clone(),
        embedding_model_id: input.embedding_model_id.clone(),
        embedding_model_revision: input.embedding_model_revision.clone(),
        hotspot_identity_version: input.hotspot_identity_version.clone(),
        paper_count: input.paper_count,
        hotspot_count: input.hotspots.len() as i64,
        membership_count: input.memberships.len() as i64,
        generated_at: input.created_at.clone(),
        library_revision,
    })
}

pub fn read_analysis_state(
    conn: &Connection,
    project_id: &str,
) -> Result<Option<AnalysisState>, String> {
    let has_library_revision = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('v20_analysis_snapshots') WHERE name = 'library_revision'",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|error| error.to_string())?
        > 0;
    let has_layout_metadata = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('v20_analysis_snapshots') WHERE name = 'layout_version'",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|error| error.to_string())?
        > 0;
    let query = if has_library_revision && has_layout_metadata {
        "SELECT s.project_id,s.id,s.algorithm_version,s.layout_version,s.projection_version,
                s.embedding_model_id,s.embedding_model_revision,s.hotspot_identity_version,
                s.paper_count,s.hotspot_count,s.membership_count,s.created_at,s.library_revision
         FROM v20_analysis_state a
         JOIN v20_analysis_snapshots s ON s.id=a.active_snapshot_id AND s.status='ready'
         WHERE a.project_id=?1"
    } else if has_library_revision {
        "SELECT s.project_id,s.id,s.algorithm_version,'legacy','legacy','','','ranked-hash-v1',
                s.paper_count,s.hotspot_count,s.membership_count,s.created_at,s.library_revision
         FROM v20_analysis_state a
         JOIN v20_analysis_snapshots s ON s.id=a.active_snapshot_id AND s.status='ready'
         WHERE a.project_id=?1"
    } else {
        "SELECT s.project_id,s.id,s.algorithm_version,'legacy','legacy','','','ranked-hash-v1',
                s.paper_count,s.hotspot_count,s.membership_count,s.created_at,0
         FROM v20_analysis_state a
         JOIN v20_analysis_snapshots s ON s.id=a.active_snapshot_id AND s.status='ready'
         WHERE a.project_id=?1"
    };
    conn.query_row(query, params![project_id], |row| {
        Ok(AnalysisState {
            project_id: row.get(0)?,
            active_snapshot_id: row.get(1)?,
            algorithm_version: row.get(2)?,
            layout_version: row.get(3)?,
            projection_version: row.get(4)?,
            embedding_model_id: row.get(5)?,
            embedding_model_revision: row.get(6)?,
            hotspot_identity_version: row.get(7)?,
            paper_count: row.get(8)?,
            hotspot_count: row.get(9)?,
            membership_count: row.get(10)?,
            generated_at: row.get(11)?,
            library_revision: row.get(12)?,
        })
    })
    .optional()
    .map_err(|error| error.to_string())
}

pub fn read_unified_galaxy_rows(
    conn: &Connection,
    project_id: &str,
) -> Result<Option<UnifiedGalaxyRows>, String> {
    let Some(state) = read_analysis_state(conn, project_id)? else {
        return Ok(None);
    };
    let has_identity_key = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('v20_hotspots') WHERE name='identity_key_sha256'",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|error| error.to_string())? > 0;
    let hotspot_query = if has_identity_key {
        "SELECT hotspot_id,payload_json,identity_key_sha256,x,y,z,paper_count,updated_at
         FROM v20_hotspots WHERE project_id=?1 AND snapshot_id=?2
         ORDER BY paper_count DESC,hotspot_id ASC"
    } else {
        "SELECT hotspot_id,payload_json,'' AS identity_key_sha256,x,y,z,paper_count,updated_at
         FROM v20_hotspots WHERE project_id=?1 AND snapshot_id=?2
         ORDER BY paper_count DESC,hotspot_id ASC"
    };
    let mut hotspot_stmt = conn
        .prepare(hotspot_query)
        .map_err(|error| error.to_string())?;
    let hotspots = hotspot_stmt
        .query_map(params![project_id, state.active_snapshot_id], |row| {
            Ok(SnapshotHotspot {
                hotspot_id: row.get(0)?,
                payload_json: row.get(1)?,
                identity_key_sha256: row.get(2)?,
                x: row.get(3)?,
                y: row.get(4)?,
                z: row.get(5)?,
                paper_count: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    let mut membership_stmt = conn.prepare("SELECT paper_id, hotspot_id, x, y, z, representative_rank, score FROM v20_paper_memberships WHERE project_id = ?1 AND snapshot_id = ?2 ORDER BY hotspot_id ASC, COALESCE(representative_rank, 2147483647), paper_id ASC").map_err(|error| error.to_string())?;
    let memberships = membership_stmt
        .query_map(params![project_id, state.active_snapshot_id], |row| {
            Ok(SnapshotMembership {
                paper_id: row.get(0)?,
                hotspot_id: row.get(1)?,
                x: row.get(2)?,
                y: row.get(3)?,
                z: row.get(4)?,
                representative_rank: row.get(5)?,
                score: row.get(6)?,
            })
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    Ok(Some(UnifiedGalaxyRows {
        state,
        hotspots,
        memberships,
    }))
}

pub fn read_unified_hotspot_rows(
    conn: &Connection,
    project_id: &str,
) -> Result<Option<UnifiedHotspotRows>, String> {
    let Some(state) = read_analysis_state(conn, project_id)? else {
        return Ok(None);
    };
    let has_identity_key = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('v20_hotspots') WHERE name='identity_key_sha256'",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|error| error.to_string())? > 0;
    let query = if has_identity_key {
        "SELECT hotspot_id,payload_json,identity_key_sha256,x,y,z,paper_count,updated_at
         FROM v20_hotspots WHERE project_id=?1 AND snapshot_id=?2
         ORDER BY paper_count DESC,hotspot_id ASC"
    } else {
        "SELECT hotspot_id,payload_json,'' AS identity_key_sha256,x,y,z,paper_count,updated_at
         FROM v20_hotspots WHERE project_id=?1 AND snapshot_id=?2
         ORDER BY paper_count DESC,hotspot_id ASC"
    };
    let mut stmt = conn.prepare(query).map_err(|error| error.to_string())?;
    let hotspots = stmt
        .query_map(params![project_id, state.active_snapshot_id], |row| {
            Ok(SnapshotHotspot {
                hotspot_id: row.get(0)?,
                payload_json: row.get(1)?,
                identity_key_sha256: row.get(2)?,
                x: row.get(3)?,
                y: row.get(4)?,
                z: row.get(5)?,
                paper_count: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    Ok(Some(UnifiedHotspotRows { state, hotspots }))
}

pub fn validate_active_snapshot(
    conn: &Connection,
    project_id: &str,
) -> Result<Option<AnalysisState>, String> {
    let Some(state) = read_analysis_state(conn, project_id)? else {
        return Ok(None);
    };
    let hotspot_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM v20_hotspots WHERE project_id = ?1 AND snapshot_id = ?2",
            params![project_id, state.active_snapshot_id],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    let membership_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM v20_paper_memberships WHERE project_id = ?1 AND snapshot_id = ?2",
            params![project_id, state.active_snapshot_id],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    let orphan_memberships: i64 = conn.query_row(
        "SELECT COUNT(*) FROM v20_paper_memberships m LEFT JOIN v20_hotspots h ON h.project_id = m.project_id AND h.snapshot_id = m.snapshot_id AND h.hotspot_id = m.hotspot_id WHERE m.project_id = ?1 AND m.snapshot_id = ?2 AND h.hotspot_id IS NULL",
        params![project_id, state.active_snapshot_id],
        |row| row.get(0),
    ).map_err(|error| error.to_string())?;
    if hotspot_count != state.hotspot_count {
        return Err(format!(
            "V20 hotspot count mismatch: state={}, rows={hotspot_count}.",
            state.hotspot_count
        ));
    }
    if membership_count != state.membership_count {
        return Err(format!(
            "V20 membership count mismatch: state={}, rows={membership_count}.",
            state.membership_count
        ));
    }
    if orphan_memberships != 0 {
        return Err(format!(
            "V20 snapshot contains {orphan_memberships} orphan memberships."
        ));
    }
    let orphan_papers: i64 = conn.query_row(
        "SELECT COUNT(*) FROM v20_paper_memberships m LEFT JOIN papers p ON p.project_id = m.project_id AND p.id = m.paper_id WHERE m.project_id = ?1 AND m.snapshot_id = ?2 AND p.id IS NULL",
        params![project_id, state.active_snapshot_id],
        |row| row.get(0),
    ).map_err(|error| error.to_string())?;
    if orphan_papers != 0 {
        return Err(format!(
            "V20 snapshot contains {orphan_papers} memberships without papers."
        ));
    }
    let paper_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM papers WHERE project_id = ?1",
            params![project_id],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    if paper_count != state.paper_count || membership_count != paper_count {
        return Err(format!("V20 paper membership mismatch: papers={paper_count}, state={}, memberships={membership_count}.", state.paper_count));
    }
    let has_revision_state = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='library_revision_state'",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|error| error.to_string())?
        > 0;
    let current_revision: i64 = if has_revision_state {
        conn.query_row(
            "SELECT COALESCE((SELECT revision FROM library_revision_state WHERE project_id=?1),0)",
            params![project_id],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?
    } else {
        0
    };
    if state.library_revision != current_revision {
        return Err(format!(
            "V20 library revision mismatch: snapshot={}, current={current_revision}.",
            state.library_revision
        ));
    }
    Ok(Some(state))
}

fn visual_source_analysis_state_from_row(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<AnalysisState> {
    Ok(AnalysisState {
        project_id: row.get(0)?,
        active_snapshot_id: row.get(1)?,
        algorithm_version: row.get(2)?,
        layout_version: row.get(3)?,
        projection_version: row.get(4)?,
        embedding_model_id: row.get(5)?,
        embedding_model_revision: row.get(6)?,
        hotspot_identity_version: row.get(7)?,
        paper_count: row.get(8)?,
        hotspot_count: row.get(9)?,
        membership_count: row.get(10)?,
        generated_at: row.get(11)?,
        library_revision: row.get(12)?,
    })
}

fn read_ready_visual_source_snapshot(
    conn: &Connection,
    project_id: &str,
    snapshot_id: Option<&str>,
) -> Result<Option<AnalysisState>, String> {
    let has_library_revision = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('v20_analysis_snapshots') WHERE name = 'library_revision'",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|error| error.to_string())?
        > 0;
    let has_layout_metadata = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('v20_analysis_snapshots') WHERE name = 'layout_version'",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|error| error.to_string())?
        > 0;
    let projection = if has_library_revision && has_layout_metadata {
        "s.project_id,s.id,s.algorithm_version,s.layout_version,s.projection_version,
         s.embedding_model_id,s.embedding_model_revision,s.hotspot_identity_version,
         s.paper_count,s.hotspot_count,s.membership_count,s.created_at,s.library_revision"
    } else if has_library_revision {
        "s.project_id,s.id,s.algorithm_version,'legacy','legacy','','','ranked-hash-v1',
         s.paper_count,s.hotspot_count,s.membership_count,s.created_at,s.library_revision"
    } else {
        "s.project_id,s.id,s.algorithm_version,'legacy','legacy','','','ranked-hash-v1',
         s.paper_count,s.hotspot_count,s.membership_count,s.created_at,0"
    };
    if let Some(snapshot_id) = snapshot_id {
        let query = format!(
            "SELECT {projection}
             FROM v20_analysis_snapshots s
             WHERE s.project_id=?1 AND s.id=?2 AND s.status='ready'"
        );
        conn.query_row(
            &query,
            params![project_id, snapshot_id],
            visual_source_analysis_state_from_row,
        )
        .optional()
        .map_err(|error| error.to_string())
    } else {
        let query = format!(
            "SELECT {projection}
             FROM v20_analysis_snapshots s
             WHERE s.project_id=?1 AND s.status='ready'
             ORDER BY s.created_at DESC,s.id DESC
             LIMIT 1"
        );
        conn.query_row(
            &query,
            params![project_id],
            visual_source_analysis_state_from_row,
        )
        .optional()
        .map_err(|error| error.to_string())
    }
}

fn validate_visual_source_snapshot_structure(
    conn: &Connection,
    project_id: &str,
    state: &AnalysisState,
) -> Result<(), String> {
    let hotspot_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM v20_hotspots WHERE project_id=?1 AND snapshot_id=?2",
            params![project_id, state.active_snapshot_id],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    if hotspot_count != state.hotspot_count {
        return Err(V20_VISUAL_SOURCE_HOTSPOT_COUNT_MISMATCH.to_string());
    }

    let membership_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM v20_paper_memberships WHERE project_id=?1 AND snapshot_id=?2",
            params![project_id, state.active_snapshot_id],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    if membership_count != state.membership_count {
        return Err(V20_VISUAL_SOURCE_MEMBERSHIP_COUNT_MISMATCH.to_string());
    }
    if membership_count != state.paper_count {
        return Err(V20_VISUAL_SOURCE_PAPER_COUNT_MISMATCH.to_string());
    }

    let orphan_hotspot_memberships: i64 = conn
        .query_row(
            "SELECT COUNT(*)
             FROM v20_paper_memberships m
             LEFT JOIN v20_hotspots h
               ON h.project_id=m.project_id
              AND h.snapshot_id=m.snapshot_id
              AND h.hotspot_id=m.hotspot_id
             WHERE m.project_id=?1 AND m.snapshot_id=?2 AND h.hotspot_id IS NULL",
            params![project_id, state.active_snapshot_id],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    if orphan_hotspot_memberships != 0 {
        return Err(V20_VISUAL_SOURCE_ORPHAN_HOTSPOT_MEMBERSHIP.to_string());
    }

    let orphan_paper_memberships: i64 = conn
        .query_row(
            "SELECT COUNT(*)
             FROM v20_paper_memberships m
             LEFT JOIN papers p ON p.project_id=m.project_id AND p.id=m.paper_id
             WHERE m.project_id=?1 AND m.snapshot_id=?2 AND p.id IS NULL",
            params![project_id, state.active_snapshot_id],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    if orphan_paper_memberships != 0 {
        return Err(V20_VISUAL_SOURCE_ORPHAN_PAPER_MEMBERSHIP.to_string());
    }

    Ok(())
}

pub fn select_immersive_background_visual_source(
    conn: &Connection,
    project_id: &str,
) -> Result<Option<ImmersiveBackgroundVisualSource>, String> {
    let active_snapshot_id = if table_exists(conn, "v20_analysis_state")? {
        conn.query_row(
            "SELECT active_snapshot_id FROM v20_analysis_state WHERE project_id=?1",
            params![project_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| error.to_string())?
    } else {
        None
    };

    if !table_exists(conn, "v20_analysis_snapshots")? {
        return if active_snapshot_id.is_some() {
            Err(V20_VISUAL_SOURCE_ACTIVE_SNAPSHOT_INVALID.to_string())
        } else {
            Ok(None)
        };
    }

    let (state, source_kind) = if let Some(active_snapshot_id) = active_snapshot_id {
        let state =
            read_ready_visual_source_snapshot(conn, project_id, Some(active_snapshot_id.as_str()))?
                .ok_or_else(|| V20_VISUAL_SOURCE_ACTIVE_SNAPSHOT_INVALID.to_string())?;
        (state, ImmersiveBackgroundVisualSourceKind::ActiveV20)
    } else {
        let Some(state) = read_ready_visual_source_snapshot(conn, project_id, None)? else {
            return Ok(None);
        };
        (state, ImmersiveBackgroundVisualSourceKind::HistoricalV20)
    };

    let current_revision = if table_exists(conn, "library_revision_state")? {
        conn.query_row(
            "SELECT COALESCE((SELECT revision FROM library_revision_state WHERE project_id=?1),0)",
            params![project_id],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|error| error.to_string())?
    } else {
        0
    };
    if state.library_revision > current_revision {
        return Err(V20_VISUAL_SOURCE_REVISION_AHEAD.to_string());
    }
    if source_kind == ImmersiveBackgroundVisualSourceKind::ActiveV20
        && state.library_revision < current_revision
    {
        return Err(V20_VISUAL_SOURCE_ACTIVE_REVISION_MISMATCH.to_string());
    }

    validate_visual_source_snapshot_structure(conn, project_id, &state)?;
    let current_paper_count = conn
        .query_row(
            "SELECT COUNT(*) FROM papers WHERE project_id=?1",
            params![project_id],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|error| error.to_string())?;
    if source_kind == ImmersiveBackgroundVisualSourceKind::ActiveV20
        && state.paper_count != current_paper_count
    {
        return Err(V20_VISUAL_SOURCE_CURRENT_PAPER_COUNT_MISMATCH.to_string());
    }
    if source_kind == ImmersiveBackgroundVisualSourceKind::HistoricalV20
        && state.library_revision == current_revision
        && state.paper_count != current_paper_count
    {
        return Err(V20_VISUAL_SOURCE_LIBRARY_REVISION_CONTRACT_MISMATCH.to_string());
    }

    let revision_changed = state.library_revision != current_revision;
    let paper_count_changed = state.paper_count != current_paper_count;
    let analysis_freshness = if revision_changed {
        ImmersiveBackgroundAnalysisFreshness::StaleByLibraryRevision
    } else {
        ImmersiveBackgroundAnalysisFreshness::Current
    };
    let stale_reason = if source_kind == ImmersiveBackgroundVisualSourceKind::HistoricalV20 {
        Some(if !revision_changed {
            ImmersiveBackgroundVisualSourceStaleReason::ActiveStateMissing
        } else if paper_count_changed {
            ImmersiveBackgroundVisualSourceStaleReason::LibraryRevisionAndPaperCountChanged
        } else {
            ImmersiveBackgroundVisualSourceStaleReason::LibraryRevisionAdvanced
        })
    } else {
        None
    };

    Ok(Some(ImmersiveBackgroundVisualSource {
        source_snapshot_id: state.active_snapshot_id,
        source_kind,
        analysis_freshness,
        source_revision: state.library_revision,
        current_revision,
        source_paper_count: state.paper_count,
        current_paper_count,
        stale_reason,
    }))
}

pub fn current_library_revision(conn: &Connection, project_id: &str) -> Result<i64, String> {
    ensure_v20_schema(conn)?;
    conn.execute(
        "INSERT INTO library_revision_state(project_id,revision,updated_at_ms) VALUES (?1,0,0) ON CONFLICT(project_id) DO NOTHING",
        params![project_id],
    ).map_err(|error| error.to_string())?;
    conn.query_row(
        "SELECT revision FROM library_revision_state WHERE project_id=?1",
        params![project_id],
        |row| row.get(0),
    )
    .map_err(|error| error.to_string())
}

pub fn invalidate_v20_after_library_mutation(
    tx: &rusqlite::Transaction<'_>,
    project_id: &str,
    now_ms: i64,
) -> Result<i64, String> {
    tx.execute(
        "INSERT INTO library_revision_state(project_id,revision,updated_at_ms) VALUES (?1,1,?2) ON CONFLICT(project_id) DO UPDATE SET revision=revision+1,updated_at_ms=excluded.updated_at_ms",
        params![project_id, now_ms],
    ).map_err(|error| error.to_string())?;
    tx.execute(
        "DELETE FROM v20_analysis_state WHERE project_id=?1",
        params![project_id],
    )
    .map_err(|error| error.to_string())?;
    tx.query_row(
        "SELECT revision FROM library_revision_state WHERE project_id=?1",
        params![project_id],
        |row| row.get(0),
    )
    .map_err(|error| error.to_string())
}

fn table_exists(conn: &Connection, table: &str) -> Result<bool, String> {
    conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1)",
        params![table],
        |row| row.get::<_, i64>(0),
    )
    .map(|value| value != 0)
    .map_err(|error| error.to_string())
}

fn validate_library_candidate_connection_base(
    conn: &Connection,
    project_id: &str,
) -> Result<ValidatedLibraryCandidate, String> {
    let quick_check: String = conn
        .query_row("PRAGMA quick_check", [], |row| row.get(0))
        .map_err(|error| error.to_string())?;
    if quick_check.to_lowercase() != "ok" {
        return Err(format!("SQLite quick_check failed: {quick_check}"));
    }
    let mut foreign_stmt = conn
        .prepare("PRAGMA foreign_key_check")
        .map_err(|error| error.to_string())?;
    let mut foreign_rows = foreign_stmt.query([]).map_err(|error| error.to_string())?;
    if foreign_rows
        .next()
        .map_err(|error| error.to_string())?
        .is_some()
    {
        return Err("SQLite foreign_key_check reported violations.".to_string());
    }
    if !table_exists(conn, "papers")? {
        return Err("SQLite backup has no papers table.".to_string());
    }

    if table_exists(conn, "v20_analysis_state")? {
        let mut stmt = conn
            .prepare("SELECT project_id FROM v20_analysis_state")
            .map_err(|error| error.to_string())?;
        let projects = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|error| error.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?;
        for project in projects {
            if validate_active_snapshot(conn, &project)?.is_none() {
                return Err(format!(
                    "V20 active snapshot reference is invalid for project {project}."
                ));
            }
        }
    }

    if table_exists(conn, "v20_paper_memberships")? {
        let orphan_papers: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM v20_paper_memberships m LEFT JOIN papers p ON p.id = m.paper_id AND p.project_id = m.project_id WHERE p.id IS NULL",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        if orphan_papers != 0 {
            return Err(format!(
                "V20 snapshot contains {orphan_papers} memberships without papers."
            ));
        }
    }

    let state = if table_exists(conn, "v20_analysis_state")? {
        validate_active_snapshot(conn, project_id)?
    } else {
        None
    };
    let paper_count = conn
        .query_row(
            "SELECT COUNT(*) FROM papers WHERE project_id = ?1",
            params![project_id],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    let schema_version = conn
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(|error| error.to_string())?;
    if schema_version > LIBRARY_SCHEMA_VERSION {
        return Err("LIBRARY_SCHEMA_TOO_NEW".to_string());
    }
    Ok(ValidatedLibraryCandidate {
        schema_version,
        project_id: project_id.to_string(),
        paper_count,
        hotspot_count: state.as_ref().map_or(0, |value| value.hotspot_count),
        membership_count: state.as_ref().map_or(0, |value| value.membership_count),
        snapshot_id: state.map(|value| value.active_snapshot_id),
    })
}

pub fn inspect_library_v14_schema_contract_connection(
    conn: &Connection,
    project_id: &str,
) -> Result<LibraryV14SchemaContractAssessment, String> {
    let candidate = validate_library_candidate_connection_base(conn, project_id)?;
    if candidate.schema_version != LIBRARY_SCHEMA_VERSION {
        return Err("LIBRARY_SCHEMA_V14_INSPECTION_REQUIRES_V14".to_string());
    }
    match validate_import_schema_contract(conn) {
        Ok(()) => Ok(LibraryV14SchemaContractAssessment {
            status: LibraryV14SchemaContractStatus::CurrentV14,
            candidate,
            error_code: None,
        }),
        Err(strict_error) => {
            let (status, error_code) = match validate_known_precontract_v14(conn, &strict_error) {
                Ok(()) => (
                    LibraryV14SchemaContractStatus::KnownPrecontractV14,
                    strict_error,
                ),
                Err(precontract_error)
                    if precontract_error
                        == "LIBRARY_SCHEMA_V14_IMPORT_CONTRACT_INVALID:NOT_KNOWN_PRECONTRACT_SIGNATURE" =>
                {
                    (
                        LibraryV14SchemaContractStatus::UnknownInvalidV14,
                        strict_error,
                    )
                }
                Err(precontract_error) => (
                    LibraryV14SchemaContractStatus::UnknownInvalidV14,
                    precontract_error,
                ),
            };
            Ok(LibraryV14SchemaContractAssessment {
                status,
                candidate,
                error_code: Some(error_code),
            })
        }
    }
}

pub fn inspect_library_v14_schema_contract_file(
    database_path: &Path,
    project_id: &str,
) -> Result<LibraryV14SchemaContractAssessment, String> {
    if !database_path.is_file() {
        return Err(format!(
            "SQLite library does not exist: {:?}",
            database_path
        ));
    }
    let conn =
        Connection::open_with_flags(database_path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
            .map_err(|error| format!("Cannot open SQLite library {:?}: {error}", database_path))?;
    inspect_library_v14_schema_contract_connection(&conn, project_id)
}

pub fn validate_library_candidate_connection(
    conn: &Connection,
    project_id: &str,
) -> Result<ValidatedLibraryCandidate, String> {
    let candidate = validate_library_candidate_connection_base(conn, project_id)?;
    if candidate.schema_version == LIBRARY_SCHEMA_VERSION {
        validate_import_schema_contract(conn)?;
    }
    Ok(candidate)
}

pub fn validate_library_candidate_file(
    database_path: &Path,
    project_id: &str,
) -> Result<ValidatedLibraryCandidate, String> {
    if !database_path.is_file() {
        return Err(format!(
            "SQLite library does not exist: {:?}",
            database_path
        ));
    }
    let conn =
        Connection::open_with_flags(database_path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
            .map_err(|error| format!("Cannot open SQLite library {:?}: {error}", database_path))?;
    validate_library_candidate_connection(&conn, project_id)
}

pub fn copy_file_atomically_without_overwrite<T, F>(
    source: &Path,
    target: &Path,
    validate: F,
) -> Result<T, String>
where
    F: FnOnce(&Path) -> Result<T, String>,
{
    if target.exists() {
        return Err("TARGET_ALREADY_EXISTS".to_string());
    }
    let file_name = target
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "INVALID_TARGET_NAME".to_string())?;
    let partial = target.with_file_name(format!("{file_name}.partial"));
    cleanup_sqlite_artifacts(&partial);
    let result = (|| {
        fs::copy(source, &partial).map_err(|error| format!("COPY_FAILED: {error}"))?;
        let value = validate(&partial)?;
        fs::rename(&partial, target).map_err(|error| format!("ATOMIC_SWITCH_FAILED: {error}"))?;
        Ok(value)
    })();
    if result.is_err() {
        cleanup_sqlite_artifacts(&partial);
    }
    result
}

pub fn ensure_library_schema(conn: &Connection) -> Result<(), String> {
    let schema_version: i64 = conn
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(|error| error.to_string())?;
    if schema_version > LIBRARY_SCHEMA_VERSION {
        return Err("LIBRARY_SCHEMA_TOO_NEW".to_string());
    }
    if schema_version == LIBRARY_SCHEMA_VERSION {
        return validate_import_schema_contract(conn);
    }
    if schema_version != 0 {
        return Err("LIBRARY_SCHEMA_MIGRATION_REQUIRED".to_string());
    }
    conn.execute_batch(include_str!("library_schema.sql"))
        .map_err(|error| error.to_string())?;
    ensure_v20_schema(conn)?;
    agent_store::ensure_agent_schema(conn)?;
    ensure_import_schema(conn)?;
    validate_import_schema_contract(conn)?;
    conn.pragma_update(None, "user_version", LIBRARY_SCHEMA_VERSION)
        .map_err(|error| error.to_string())?;
    validate_import_schema_contract(conn)
}

pub fn cleanup_sqlite_artifacts(database_path: &Path) {
    let _ = fs::remove_file(database_path);
    let _ = fs::remove_file(format!("{}-wal", database_path.to_string_lossy()));
    let _ = fs::remove_file(format!("{}-shm", database_path.to_string_lossy()));
}

pub fn sha256_file(path: &Path) -> Result<String, String> {
    let mut file =
        fs::File::open(path).map_err(|error| format!("Cannot read {:?}: {error}", path))?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0_u8; 1024 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|error| format!("Cannot hash {:?}: {error}", path))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

pub fn validate_first_run_location(
    database_dir: &Path,
    mode: FirstRunMode,
    project_id: &str,
    seed_size_bytes: Option<u64>,
) -> Result<FirstRunLocationValidation, String> {
    fs::create_dir_all(database_dir)
        .map_err(|error| format!("CANNOT_CREATE_LIBRARY_DIR: {error}"))?;
    let probe = database_dir.join(format!(
        ".research-hotspots-write-test-{}",
        std::process::id()
    ));
    let writable = fs::write(&probe, b"ok").is_ok();
    let _ = fs::remove_file(&probe);
    let available_space_bytes = fs2::available_space(database_dir).unwrap_or_default();
    let required_space_bytes = match mode {
        FirstRunMode::Seed => seed_size_bytes
            .unwrap_or_default()
            .saturating_add(64 * 1024 * 1024),
        _ => 16 * 1024 * 1024,
    };
    let database_path = database_dir.join("research-hotspots-v7.sqlite");
    let existing_database = database_path.is_file();
    let existing_result = if existing_database {
        Some(
            validate_library_candidate_file(&database_path, project_id).or_else(|strict_error| {
                match inspect_library_v14_schema_contract_file(&database_path, project_id) {
                    Ok(assessment)
                        if assessment.status
                            == LibraryV14SchemaContractStatus::KnownPrecontractV14 =>
                    {
                        Ok(assessment.candidate)
                    }
                    Ok(assessment) => Err(assessment.error_code.unwrap_or(strict_error)),
                    Err(_) => Err(strict_error),
                }
            }),
        )
    } else {
        None
    };
    let existing = existing_result
        .as_ref()
        .and_then(|value| value.as_ref().ok())
        .cloned();
    let invalid_existing = existing_result
        .as_ref()
        .and_then(|value| value.as_ref().err())
        .cloned();

    let (valid, message) = if mode != FirstRunMode::Existing && existing_database {
        (false, "TARGET_ALREADY_EXISTS".to_string())
    } else if !writable {
        (false, "LIBRARY_DIRECTORY_NOT_WRITABLE".to_string())
    } else if mode == FirstRunMode::Existing && !existing_database {
        (false, "EXISTING_LIBRARY_NOT_FOUND".to_string())
    } else if mode == FirstRunMode::Existing && existing.is_none() {
        (
            false,
            invalid_existing.unwrap_or_else(|| "EXISTING_LIBRARY_INVALID".to_string()),
        )
    } else if available_space_bytes > 0 && available_space_bytes < required_space_bytes {
        (false, "INSUFFICIENT_DISK_SPACE".to_string())
    } else {
        (true, "ok".to_string())
    };

    Ok(FirstRunLocationValidation {
        valid,
        database_dir: database_dir.to_path_buf(),
        database_path,
        writable,
        available_space_bytes,
        required_space_bytes,
        existing_database,
        existing,
        message,
    })
}

pub fn create_empty_library_atomically(
    target: &Path,
    project_id: &str,
) -> Result<ValidatedLibraryCandidate, String> {
    if target.exists() {
        return Err("TARGET_ALREADY_EXISTS".to_string());
    }
    let file_name = target
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "INVALID_TARGET_NAME".to_string())?;
    let partial = target.with_file_name(format!("{file_name}.partial"));
    cleanup_sqlite_artifacts(&partial);
    let result = (|| {
        let conn = Connection::open(&partial)
            .map_err(|error| format!("EMPTY_LIBRARY_CREATE_FAILED: {error}"))?;
        ensure_library_schema(&conn)?;
        conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
            .map_err(|error| error.to_string())?;
        drop(conn);
        let validated = validate_library_candidate_file(&partial, project_id)?;
        if validated.paper_count != 0 || validated.snapshot_id.is_some() {
            return Err("EMPTY_LIBRARY_CONTAINS_DATA".to_string());
        }
        cleanup_sqlite_sidecars(&partial);
        fs::rename(&partial, target).map_err(|error| format!("ATOMIC_SWITCH_FAILED: {error}"))?;
        Ok(validated)
    })();
    if result.is_err() {
        cleanup_sqlite_artifacts(&partial);
    }
    result
}

pub fn install_seed_library_atomically(
    seed: &Path,
    target: &Path,
    expectation: &SeedExpectation,
) -> Result<ValidatedLibraryCandidate, String> {
    if fs::metadata(seed)
        .map_err(|error| format!("SEED_NOT_READABLE: {error}"))?
        .len()
        != expectation.size_bytes
    {
        return Err("SEED_SIZE_MISMATCH".to_string());
    }
    if !sha256_file(seed)?.eq_ignore_ascii_case(&expectation.sha256) {
        return Err("SEED_SHA256_MISMATCH".to_string());
    }
    if let Some(parent) = target.parent() {
        let available = fs2::available_space(parent).unwrap_or_default();
        if available > 0 && available < expectation.size_bytes.saturating_add(64 * 1024 * 1024) {
            return Err("INSUFFICIENT_DISK_SPACE".to_string());
        }
    }
    copy_file_atomically_without_overwrite(seed, target, |partial| {
        if !sha256_file(partial)?.eq_ignore_ascii_case(&expectation.sha256) {
            return Err("COPIED_SEED_SHA256_MISMATCH".to_string());
        }
        let seed_value = validate_library_candidate_file(partial, &expectation.project_id)?;
        if seed_value.schema_version != expectation.schema_version
            || seed_value.project_id != expectation.project_id
            || seed_value.snapshot_id.as_deref() != Some(expectation.snapshot_id.as_str())
            || seed_value.paper_count != expectation.paper_count
            || seed_value.hotspot_count != expectation.hotspot_count
            || seed_value.membership_count != expectation.membership_count
        {
            return Err("SEED_V20_MANIFEST_MISMATCH".to_string());
        }
        agent_store::migrate_library_file(partial, &expectation.project_id, 0, false)?;
        let value = validate_library_candidate_file(partial, &expectation.project_id)?;
        if value.schema_version != LIBRARY_SCHEMA_VERSION
            || value.snapshot_id != seed_value.snapshot_id
            || value.paper_count != seed_value.paper_count
            || value.hotspot_count != seed_value.hotspot_count
            || value.membership_count != seed_value.membership_count
        {
            return Err("SEED_SCHEMA_V10_MIGRATION_MISMATCH".to_string());
        }
        cleanup_sqlite_sidecars(partial);
        Ok(value)
    })
}

fn cleanup_sqlite_sidecars(database_path: &Path) {
    let _ = fs::remove_file(format!("{}-wal", database_path.to_string_lossy()));
    let _ = fs::remove_file(format!("{}-shm", database_path.to_string_lossy()));
}

pub fn atomic_replace_file_with_rollback<T, F>(
    active: &Path,
    staged: &Path,
    safety: &Path,
    validate: F,
) -> Result<(bool, T), String>
where
    F: FnOnce(&Path) -> Result<T, String>,
{
    let had_active = active.exists();
    if had_active {
        fs::rename(active, safety)
            .map_err(|error| format!("Cannot move active database to safety copy: {error}"))?;
    }
    if let Err(error) = fs::rename(staged, active) {
        if had_active {
            let _ = fs::rename(safety, active);
        }
        return Err(format!(
            "Cannot activate staged database; previous database restored: {error}"
        ));
    }
    match validate(active) {
        Ok(value) => Ok((had_active, value)),
        Err(error) => {
            let _ = fs::remove_file(active);
            if had_active {
                fs::rename(safety, active).map_err(|rollback_error| {
                    format!("Validation failed ({error}) and rollback failed: {rollback_error}")
                })?;
            }
            Err(format!(
                "Activated database failed validation and was rolled back: {error}"
            ))
        }
    }
}

#[derive(Default, Clone)]
pub struct TaskRegistry {
    active: Arc<Mutex<HashSet<String>>>,
}
pub struct TaskPermit {
    key: String,
    active: Arc<Mutex<HashSet<String>>>,
}
impl TaskRegistry {
    pub fn try_acquire(&self, key: impl Into<String>) -> Result<TaskPermit, String> {
        let key = key.into();
        let mut active = self
            .active
            .lock()
            .map_err(|_| "TASK_REGISTRY_POISONED".to_string())?;
        if !active.insert(key.clone()) {
            return Err("TASK_ALREADY_RUNNING".to_string());
        }
        Ok(TaskPermit {
            key,
            active: Arc::clone(&self.active),
        })
    }
}
impl Drop for TaskPermit {
    fn drop(&mut self) {
        if let Ok(mut active) = self.active.lock() {
            active.remove(&self.key);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn input(snapshot: &str, paper_id: &str) -> SnapshotWriteInput {
        SnapshotWriteInput {
            snapshot_id: snapshot.into(),
            project_id: "p".into(),
            algorithm_version: V20_ALGORITHM_VERSION.into(),
            layout_version: semantic_layout::SEMANTIC_LAYOUT_VERSION.into(),
            projection_version: semantic_layout::SEMANTIC_PROJECTION_VERSION.into(),
            embedding_model_id: semantic_layout::SEMANTIC_MODEL_ID.into(),
            embedding_model_revision: semantic_layout::SEMANTIC_MODEL_REVISION.into(),
            hotspot_identity_version: HOTSPOT_IDENTITY_VERSION.into(),
            paper_count: 1,
            created_at: snapshot.into(),
            hotspots: vec![SnapshotHotspot {
                hotspot_id: "h".into(),
                payload_json: "{}".into(),
                identity_key_sha256: "identity".into(),
                x: 1.0,
                y: 2.0,
                z: 3.0,
                paper_count: 1,
                updated_at: snapshot.into(),
            }],
            memberships: vec![SnapshotMembership {
                paper_id: paper_id.into(),
                hotspot_id: "h".into(),
                x: 1.1,
                y: 2.2,
                z: 3.3,
                representative_rank: Some(1),
                score: 1.0,
            }],
            lineage: Vec::new(),
        }
    }

    fn add_papers_table(conn: &Connection, rows: &[(&str, &str)]) {
        conn.execute_batch("CREATE TABLE papers(id TEXT NOT NULL, project_id TEXT NOT NULL, PRIMARY KEY(id, project_id));").unwrap();
        for (id, project_id) in rows {
            conn.execute(
                "INSERT INTO papers(id, project_id) VALUES (?1, ?2)",
                params![id, project_id],
            )
            .unwrap();
        }
    }

    fn create_known_precontract_first_run_fixture(path: &Path) {
        let connection = Connection::open(path).unwrap();
        ensure_library_schema(&connection).unwrap();
        connection
            .pragma_update(None, "foreign_keys", "OFF")
            .unwrap();
        connection
            .execute_batch(
                "DROP TABLE paper_identity_aliases;
                 DROP TABLE paper_import_commit_items;
                 DROP TABLE paper_source_records;

                 CREATE TABLE paper_source_records(
                   id TEXT PRIMARY KEY,
                   project_id TEXT NOT NULL,
                   paper_id TEXT NOT NULL,
                   commit_id TEXT NOT NULL,
                   batch_id TEXT NOT NULL,
                   candidate_id TEXT NOT NULL,
                   source_database TEXT NOT NULL,
                   producer_version TEXT NOT NULL,
                   provider_record_id TEXT,
                   canonical_locator TEXT,
                   record_type TEXT,
                   full_text_status TEXT,
                   metadata_json TEXT NOT NULL,
                   provenance_json TEXT NOT NULL,
                   created_at_ms INTEGER NOT NULL,
                   UNIQUE(project_id,batch_id,candidate_id),
                   FOREIGN KEY(paper_id) REFERENCES papers(id) ON DELETE CASCADE,
                   FOREIGN KEY(commit_id) REFERENCES paper_import_commits(id) ON DELETE RESTRICT
                 );
                 CREATE INDEX idx_paper_source_records_project_paper
                   ON paper_source_records(project_id,paper_id,created_at_ms DESC);
                 CREATE INDEX idx_paper_source_records_provider
                   ON paper_source_records(project_id,source_database,provider_record_id);

                 CREATE TABLE paper_identity_aliases(
                   id TEXT PRIMARY KEY,
                   project_id TEXT NOT NULL,
                   paper_id TEXT NOT NULL,
                   alias_kind TEXT NOT NULL CHECK(alias_kind IN('doi','provider-record','canonical-url')),
                   normalized_value TEXT NOT NULL,
                   source_record_id TEXT,
                   commit_id TEXT NOT NULL,
                   created_at_ms INTEGER NOT NULL,
                   UNIQUE(project_id,alias_kind,normalized_value),
                   FOREIGN KEY(paper_id) REFERENCES papers(id) ON DELETE CASCADE,
                   FOREIGN KEY(source_record_id) REFERENCES paper_source_records(id) ON DELETE SET NULL,
                   FOREIGN KEY(commit_id) REFERENCES paper_import_commits(id) ON DELETE RESTRICT
                 );
                 CREATE INDEX idx_paper_identity_aliases_project_paper
                   ON paper_identity_aliases(project_id,paper_id,alias_kind);

                 CREATE TABLE paper_import_commit_items(
                   commit_id TEXT NOT NULL,
                   candidate_id TEXT NOT NULL,
                   row_index INTEGER NOT NULL,
                   action TEXT NOT NULL CHECK(action IN('insert','merge','keep-separate','skip')),
                   paper_id TEXT,
                   before_paper_json TEXT,
                   after_paper_json TEXT,
                   after_fingerprint TEXT,
                   source_record_id TEXT,
                   created_at_ms INTEGER NOT NULL,
                   PRIMARY KEY(commit_id,candidate_id),
                   FOREIGN KEY(commit_id) REFERENCES paper_import_commits(id) ON DELETE CASCADE,
                   FOREIGN KEY(source_record_id) REFERENCES paper_source_records(id) ON DELETE SET NULL
                 );
                 CREATE INDEX idx_paper_import_commit_items_paper
                   ON paper_import_commit_items(paper_id,commit_id);
                 DROP INDEX idx_papers_project_identity;",
            )
            .unwrap();
        connection
            .pragma_update(None, "foreign_keys", "ON")
            .unwrap();
        assert_eq!(
            inspect_library_v14_schema_contract_connection(&connection, "project-default")
                .unwrap()
                .status,
            LibraryV14SchemaContractStatus::KnownPrecontractV14
        );
    }
    #[test]
    fn snapshot_switch_is_atomic_and_readable() {
        let conn = Connection::open_in_memory().unwrap();
        write_snapshot_transaction(&conn, &input("s1", "a")).unwrap();
        let state = write_snapshot_transaction(&conn, &input("s2", "b")).unwrap();
        assert_eq!(state.active_snapshot_id, "s2");
        assert_eq!(
            read_unified_galaxy_rows(&conn, "p")
                .unwrap()
                .unwrap()
                .memberships[0]
                .paper_id,
            "b"
        );
    }
    #[test]
    fn invalid_snapshot_keeps_old_active() {
        let conn = Connection::open_in_memory().unwrap();
        write_snapshot_transaction(&conn, &input("s1", "a")).unwrap();
        let mut bad = input("s2", "b");
        bad.paper_count = 2;
        assert!(write_snapshot_transaction(&conn, &bad).is_err());
        assert_eq!(
            read_analysis_state(&conn, "p")
                .unwrap()
                .unwrap()
                .active_snapshot_id,
            "s1"
        );
    }
    #[test]
    fn task_permit_releases_on_drop() {
        let registry = TaskRegistry::default();
        let permit = registry.try_acquire("p").unwrap();
        assert!(registry.try_acquire("p").is_err());
        drop(permit);
        assert!(registry.try_acquire("p").is_ok());
    }

    #[test]
    fn hotspot_only_read_and_validation_match_snapshot() {
        let conn = Connection::open_in_memory().unwrap();
        add_papers_table(&conn, &[("a", "p")]);
        write_snapshot_transaction(&conn, &input("s1", "a")).unwrap();
        let rows = read_unified_hotspot_rows(&conn, "p").unwrap().unwrap();
        assert_eq!(rows.state.active_snapshot_id, "s1");
        assert_eq!(rows.hotspots.len(), 1);
        assert_eq!(
            validate_active_snapshot(&conn, "p")
                .unwrap()
                .unwrap()
                .membership_count,
            1
        );
        conn.execute(
            "DELETE FROM v20_paper_memberships WHERE snapshot_id = 's1'",
            [],
        )
        .unwrap();
        assert!(validate_active_snapshot(&conn, "p")
            .unwrap_err()
            .contains("membership count mismatch"));
    }

    #[test]
    fn immersive_visual_source_selects_strict_active_current_snapshot() {
        let conn = Connection::open_in_memory().unwrap();
        add_papers_table(&conn, &[("a", "p")]);
        write_snapshot_transaction(&conn, &input("s1", "a")).unwrap();

        let source = select_immersive_background_visual_source(&conn, "p")
            .unwrap()
            .unwrap();
        assert_eq!(source.source_snapshot_id, "s1");
        assert_eq!(
            source.source_kind,
            ImmersiveBackgroundVisualSourceKind::ActiveV20
        );
        assert_eq!(
            source.analysis_freshness,
            ImmersiveBackgroundAnalysisFreshness::Current
        );
        assert_eq!(source.source_revision, 0);
        assert_eq!(source.current_revision, 0);
        assert_eq!(source.source_paper_count, 1);
        assert_eq!(source.current_paper_count, 1);
        assert_eq!(source.stale_reason, None);
    }

    #[test]
    fn immersive_visual_source_accepts_distinct_hotspot_evidence_count() {
        let conn = Connection::open_in_memory().unwrap();
        add_papers_table(&conn, &[("a", "p")]);
        let mut snapshot = input("s1", "a");
        snapshot.hotspots[0].paper_count = 7;
        write_snapshot_transaction(&conn, &snapshot).unwrap();

        let source = select_immersive_background_visual_source(&conn, "p")
            .unwrap()
            .unwrap();
        assert_eq!(source.source_snapshot_id, "s1");
        assert_eq!(source.source_paper_count, 1);
        assert_eq!(source.current_paper_count, 1);
    }

    #[test]
    fn immersive_visual_source_uses_historical_snapshot_after_library_mutation() {
        let mut conn = Connection::open_in_memory().unwrap();
        add_papers_table(&conn, &[("a", "p")]);
        write_snapshot_transaction(&conn, &input("s1", "a")).unwrap();
        conn.execute("INSERT INTO papers(id,project_id) VALUES ('b','p')", [])
            .unwrap();
        let tx = conn.transaction().unwrap();
        assert_eq!(
            invalidate_v20_after_library_mutation(&tx, "p", 1).unwrap(),
            1
        );
        tx.commit().unwrap();

        let source = select_immersive_background_visual_source(&conn, "p")
            .unwrap()
            .unwrap();
        assert_eq!(source.source_snapshot_id, "s1");
        assert_eq!(
            source.source_kind,
            ImmersiveBackgroundVisualSourceKind::HistoricalV20
        );
        assert_eq!(
            source.analysis_freshness,
            ImmersiveBackgroundAnalysisFreshness::StaleByLibraryRevision
        );
        assert_eq!(source.source_revision, 0);
        assert_eq!(source.current_revision, 1);
        assert_eq!(source.source_paper_count, 1);
        assert_eq!(source.current_paper_count, 2);
        assert_eq!(
            source.stale_reason,
            Some(ImmersiveBackgroundVisualSourceStaleReason::LibraryRevisionAndPaperCountChanged)
        );
    }

    #[test]
    fn immersive_visual_source_returns_none_without_ready_snapshot() {
        let conn = Connection::open_in_memory().unwrap();
        add_papers_table(&conn, &[("a", "p")]);
        ensure_v20_schema(&conn).unwrap();

        assert_eq!(
            select_immersive_background_visual_source(&conn, "p").unwrap(),
            None
        );
    }

    #[test]
    fn immersive_visual_source_rejects_same_revision_paper_count_drift() {
        let conn = Connection::open_in_memory().unwrap();
        add_papers_table(&conn, &[("a", "p")]);
        write_snapshot_transaction(&conn, &input("s1", "a")).unwrap();
        conn.execute("INSERT INTO papers(id,project_id) VALUES ('b','p')", [])
            .unwrap();
        conn.execute("DELETE FROM v20_analysis_state WHERE project_id='p'", [])
            .unwrap();

        assert_eq!(
            select_immersive_background_visual_source(&conn, "p").unwrap_err(),
            V20_VISUAL_SOURCE_LIBRARY_REVISION_CONTRACT_MISMATCH
        );
    }

    #[test]
    fn immersive_visual_source_rejects_damaged_active_without_older_fallback() {
        let conn = Connection::open_in_memory().unwrap();
        add_papers_table(&conn, &[("a", "p")]);
        write_snapshot_transaction(&conn, &input("s0", "a")).unwrap();
        write_snapshot_transaction(&conn, &input("s1", "a")).unwrap();
        conn.execute(
            "DELETE FROM v20_paper_memberships WHERE snapshot_id='s1'",
            [],
        )
        .unwrap();

        assert_eq!(
            select_immersive_background_visual_source(&conn, "p").unwrap_err(),
            V20_VISUAL_SOURCE_MEMBERSHIP_COUNT_MISMATCH
        );
    }

    #[test]
    fn immersive_visual_source_rejects_orphan_hotspot_membership() {
        let conn = Connection::open_in_memory().unwrap();
        add_papers_table(&conn, &[("a", "p")]);
        write_snapshot_transaction(&conn, &input("s1", "a")).unwrap();
        conn.execute(
            "UPDATE v20_paper_memberships SET hotspot_id='missing' WHERE snapshot_id='s1'",
            [],
        )
        .unwrap();

        assert_eq!(
            select_immersive_background_visual_source(&conn, "p").unwrap_err(),
            V20_VISUAL_SOURCE_ORPHAN_HOTSPOT_MEMBERSHIP
        );
    }

    #[test]
    fn immersive_visual_source_rejects_orphan_paper_membership() {
        let conn = Connection::open_in_memory().unwrap();
        add_papers_table(&conn, &[("a", "p")]);
        write_snapshot_transaction(&conn, &input("s1", "a")).unwrap();
        conn.execute(
            "UPDATE v20_paper_memberships SET paper_id='missing' WHERE snapshot_id='s1'",
            [],
        )
        .unwrap();

        assert_eq!(
            select_immersive_background_visual_source(&conn, "p").unwrap_err(),
            V20_VISUAL_SOURCE_ORPHAN_PAPER_MEMBERSHIP
        );
    }

    #[test]
    fn immersive_visual_source_rejects_snapshot_revision_ahead() {
        let conn = Connection::open_in_memory().unwrap();
        add_papers_table(&conn, &[("a", "p")]);
        write_snapshot_transaction(&conn, &input("s1", "a")).unwrap();
        conn.execute(
            "UPDATE v20_analysis_snapshots SET library_revision=1 WHERE id='s1'",
            [],
        )
        .unwrap();

        assert_eq!(
            select_immersive_background_visual_source(&conn, "p").unwrap_err(),
            V20_VISUAL_SOURCE_REVISION_AHEAD
        );
    }

    #[test]
    fn immersive_visual_source_rejects_stale_explicit_active_pointer() {
        let conn = Connection::open_in_memory().unwrap();
        add_papers_table(&conn, &[("a", "p")]);
        write_snapshot_transaction(&conn, &input("s1", "a")).unwrap();
        conn.execute(
            "UPDATE library_revision_state SET revision=1 WHERE project_id='p'",
            [],
        )
        .unwrap();

        assert_eq!(
            select_immersive_background_visual_source(&conn, "p").unwrap_err(),
            V20_VISUAL_SOURCE_ACTIVE_REVISION_MISMATCH
        );
    }

    #[test]
    fn immersive_visual_source_rejects_dangling_active_pointer() {
        let conn = Connection::open_in_memory().unwrap();
        add_papers_table(&conn, &[("a", "p")]);
        ensure_v20_schema(&conn).unwrap();
        conn.execute("PRAGMA foreign_keys=OFF", []).unwrap();
        conn.execute(
            "INSERT INTO v20_analysis_state(project_id,active_snapshot_id,updated_at) VALUES ('p','missing','now')",
            [],
        )
        .unwrap();

        assert_eq!(
            select_immersive_background_visual_source(&conn, "p").unwrap_err(),
            V20_VISUAL_SOURCE_ACTIVE_SNAPSHOT_INVALID
        );
    }

    #[test]
    fn library_candidate_rejects_missing_papers_table() {
        let conn = Connection::open_in_memory().unwrap();
        assert!(validate_library_candidate_connection(&conn, "p")
            .unwrap_err()
            .contains("no papers table"));
    }

    #[test]
    fn library_candidate_rejects_corrupt_sqlite_file() {
        let root = std::env::temp_dir().join(format!(
            "research-hotspots-core-corrupt-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        let path = root.join("corrupt.sqlite");
        fs::write(&path, b"not a sqlite database").unwrap();
        let conn = Connection::open(&path).unwrap();
        assert!(validate_library_candidate_connection(&conn, "p").is_err());
        drop(conn);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn library_candidate_accepts_legacy_library_without_snapshot() {
        let conn = Connection::open_in_memory().unwrap();
        add_papers_table(&conn, &[("a", "p")]);
        let validated = validate_library_candidate_connection(&conn, "p").unwrap();
        assert_eq!(validated.paper_count, 1);
        assert_eq!(validated.snapshot_id, None);
    }

    #[test]
    fn complete_v14_import_contract_is_accepted() {
        let conn = Connection::open_in_memory().unwrap();
        ensure_library_schema(&conn).unwrap();
        validate_import_schema_contract(&conn).unwrap();
        assert_eq!(
            validate_library_candidate_connection(&conn, "p")
                .unwrap()
                .schema_version,
            LIBRARY_SCHEMA_VERSION
        );
    }

    #[test]
    fn declared_v14_missing_import_table_is_rejected_without_repair() {
        let conn = Connection::open_in_memory().unwrap();
        ensure_library_schema(&conn).unwrap();
        conn.execute_batch("DROP TABLE paper_import_commit_items;")
            .unwrap();
        let error = ensure_library_schema(&conn).unwrap_err();
        assert!(
            error.contains("MISSING_TABLE:paper_import_commit_items"),
            "{error}"
        );
        assert!(!table_exists(&conn, "paper_import_commit_items").unwrap());
    }

    #[test]
    fn declared_v14_missing_import_column_is_rejected() {
        let conn = Connection::open_in_memory().unwrap();
        ensure_library_schema(&conn).unwrap();
        conn.execute_batch(
            "PRAGMA foreign_keys=OFF;
             DROP TABLE paper_import_commit_items;
             CREATE TABLE paper_import_commit_items(
               commit_id TEXT NOT NULL,
               candidate_id TEXT NOT NULL,
               row_index INTEGER NOT NULL,
               action TEXT NOT NULL,
               paper_id TEXT,
               before_paper_json TEXT,
               after_paper_json TEXT,
               after_fingerprint TEXT,
               source_record_id TEXT,
               PRIMARY KEY(commit_id,candidate_id),
               FOREIGN KEY(commit_id) REFERENCES paper_import_commits(id) ON DELETE CASCADE,
               FOREIGN KEY(source_record_id) REFERENCES paper_source_records(id) ON DELETE SET NULL
             );
             CREATE INDEX idx_paper_import_commit_items_paper
               ON paper_import_commit_items(paper_id,commit_id);
             PRAGMA foreign_keys=ON;",
        )
        .unwrap();
        let error = validate_import_schema_contract(&conn).unwrap_err();
        assert!(
            error.contains("MISSING_COLUMN:paper_import_commit_items.created_at_ms"),
            "{error}"
        );
    }

    #[test]
    fn declared_v14_missing_import_unique_or_named_index_is_rejected() {
        let conn = Connection::open_in_memory().unwrap();
        ensure_library_schema(&conn).unwrap();
        conn.execute_batch(
            "PRAGMA foreign_keys=OFF;
             DROP TABLE paper_import_commits;
             CREATE TABLE paper_import_commits(
               id TEXT PRIMARY KEY,
               project_id TEXT NOT NULL,
               batch_id TEXT NOT NULL,
               client_commit_id TEXT NOT NULL,
               preview_id TEXT NOT NULL,
               preview_hash TEXT NOT NULL,
               batch_version INTEGER NOT NULL,
               status TEXT NOT NULL,
               before_revision INTEGER NOT NULL,
               after_revision INTEGER NOT NULL,
               paper_count_before INTEGER NOT NULL,
               paper_count_after INTEGER NOT NULL,
               counts_json TEXT NOT NULL,
               created_at_ms INTEGER NOT NULL,
               completed_at_ms INTEGER NOT NULL,
               rolled_back_at_ms INTEGER,
               rollback_revision INTEGER,
               error_code TEXT
             );
             CREATE INDEX idx_paper_import_commits_project_created
               ON paper_import_commits(project_id,created_at_ms DESC);
             PRAGMA foreign_keys=ON;",
        )
        .unwrap();
        let error = validate_import_schema_contract(&conn).unwrap_err();
        assert!(
            error.contains("MISSING_UNIQUE:paper_import_commits:project_id,batch_id"),
            "{error}"
        );

        let conn = Connection::open_in_memory().unwrap();
        ensure_library_schema(&conn).unwrap();
        conn.execute_batch("DROP INDEX idx_paper_import_commit_items_paper;")
            .unwrap();
        let error = validate_import_schema_contract(&conn).unwrap_err();
        assert!(
            error.contains("MISSING_INDEX:idx_paper_import_commit_items_paper"),
            "{error}"
        );
    }

    #[test]
    fn declared_v14_missing_import_foreign_key_is_rejected() {
        let conn = Connection::open_in_memory().unwrap();
        ensure_library_schema(&conn).unwrap();
        conn.execute_batch(
            "PRAGMA foreign_keys=OFF;
             DROP TABLE paper_import_commit_items;
             CREATE TABLE paper_import_commit_items(
               commit_id TEXT NOT NULL,
               candidate_id TEXT NOT NULL,
               row_index INTEGER NOT NULL,
               action TEXT NOT NULL,
               paper_id TEXT,
               before_paper_json TEXT,
               after_paper_json TEXT,
               after_fingerprint TEXT,
               source_record_id TEXT,
               created_at_ms INTEGER NOT NULL,
               PRIMARY KEY(commit_id,candidate_id)
             );
             CREATE INDEX idx_paper_import_commit_items_paper
               ON paper_import_commit_items(paper_id,commit_id);
             PRAGMA foreign_keys=ON;",
        )
        .unwrap();
        let error = validate_import_schema_contract(&conn).unwrap_err();
        assert!(
            error.contains("MISSING_FOREIGN_KEY:paper_import_commit_items.commit_id"),
            "{error}"
        );
    }

    #[test]
    fn library_candidate_rejects_membership_count_mismatch() {
        let conn = Connection::open_in_memory().unwrap();
        add_papers_table(&conn, &[("a", "p")]);
        write_snapshot_transaction(&conn, &input("s1", "a")).unwrap();
        conn.execute(
            "DELETE FROM v20_paper_memberships WHERE snapshot_id = 's1'",
            [],
        )
        .unwrap();
        assert!(validate_library_candidate_connection(&conn, "p")
            .unwrap_err()
            .contains("membership count mismatch"));
    }

    #[test]
    fn library_candidate_rejects_invalid_active_snapshot_reference() {
        let conn = Connection::open_in_memory().unwrap();
        add_papers_table(&conn, &[("a", "p")]);
        ensure_v20_schema(&conn).unwrap();
        conn.execute("PRAGMA foreign_keys = OFF", []).unwrap();
        conn.execute("INSERT INTO v20_analysis_state(project_id, active_snapshot_id, updated_at) VALUES ('p', 'missing', 'now')", []).unwrap();
        assert!(validate_library_candidate_connection(&conn, "p")
            .unwrap_err()
            .contains("foreign_key_check"));
    }

    #[test]
    fn library_candidate_rejects_membership_without_paper() {
        let conn = Connection::open_in_memory().unwrap();
        add_papers_table(&conn, &[("different", "p")]);
        write_snapshot_transaction(&conn, &input("s1", "missing")).unwrap();
        assert!(validate_library_candidate_connection(&conn, "p")
            .unwrap_err()
            .contains("memberships without papers"));
    }

    #[test]
    fn atomic_file_replace_preserves_safety_copy() {
        let root = std::env::temp_dir().join(format!(
            "research-hotspots-core-swap-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        let active = root.join("active.sqlite");
        let staged = root.join("staged.sqlite");
        let safety = root.join("safety.sqlite");
        fs::write(&active, b"old").unwrap();
        fs::write(&staged, b"new").unwrap();
        let (_, value) = atomic_replace_file_with_rollback(&active, &staged, &safety, |path| {
            fs::read(path).map_err(|error| error.to_string())
        })
        .unwrap();
        assert_eq!(value, b"new");
        assert_eq!(fs::read(&active).unwrap(), b"new");
        assert_eq!(fs::read(&safety).unwrap(), b"old");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn atomic_file_replace_rolls_back_on_validation_failure() {
        let root = std::env::temp_dir().join(format!(
            "research-hotspots-core-rollback-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        let active = root.join("active.sqlite");
        let staged = root.join("staged.sqlite");
        let safety = root.join("safety.sqlite");
        fs::write(&active, b"old").unwrap();
        fs::write(&staged, b"bad").unwrap();
        assert!(
            atomic_replace_file_with_rollback::<(), _>(&active, &staged, &safety, |_| Err(
                "injected".into()
            ))
            .is_err()
        );
        assert_eq!(fs::read(&active).unwrap(), b"old");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn atomic_file_replace_restores_active_when_staged_file_is_missing() {
        let root = std::env::temp_dir().join(format!(
            "research-hotspots-core-missing-stage-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        let active = root.join("active.sqlite");
        let staged = root.join("missing.sqlite");
        let safety = root.join("safety.sqlite");
        fs::write(&active, b"old").unwrap();
        assert!(
            atomic_replace_file_with_rollback::<(), _>(&active, &staged, &safety, |_| Ok(()))
                .is_err()
        );
        assert_eq!(fs::read(&active).unwrap(), b"old");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn first_run_recognizes_known_precontract_only_as_existing_library() {
        let root = std::env::temp_dir().join(format!(
            "research-hotspots-core-first-run-pre-v14-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        let known_dir = root.join("known");
        let unknown_dir = root.join("unknown");
        fs::create_dir_all(&known_dir).unwrap();
        fs::create_dir_all(&unknown_dir).unwrap();

        let known_database = known_dir.join("research-hotspots-v7.sqlite");
        create_known_precontract_first_run_fixture(&known_database);

        let existing = validate_first_run_location(
            &known_dir,
            FirstRunMode::Existing,
            "project-default",
            None,
        )
        .unwrap();
        assert!(existing.valid, "{}", existing.message);
        assert_eq!(
            existing.existing.as_ref().map(|value| value.schema_version),
            Some(LIBRARY_SCHEMA_VERSION)
        );

        for mode in [FirstRunMode::Seed, FirstRunMode::Empty] {
            let validation =
                validate_first_run_location(&known_dir, mode, "project-default", Some(0)).unwrap();
            assert!(!validation.valid);
            assert_eq!(validation.message, "TARGET_ALREADY_EXISTS");
        }

        let unknown_database = unknown_dir.join("research-hotspots-v7.sqlite");
        create_known_precontract_first_run_fixture(&unknown_database);
        let connection = Connection::open(&unknown_database).unwrap();
        connection
            .execute_batch(
                "CREATE INDEX idx_paper_source_records_unexpected
                   ON paper_source_records(candidate_id);",
            )
            .unwrap();
        drop(connection);

        let unknown_existing = validate_first_run_location(
            &unknown_dir,
            FirstRunMode::Existing,
            "project-default",
            None,
        )
        .unwrap();
        assert!(!unknown_existing.valid);
        assert!(unknown_existing.existing.is_none());
        assert!(
            unknown_existing
                .message
                .contains("LIBRARY_SCHEMA_V14_IMPORT_CONTRACT_INVALID"),
            "{}",
            unknown_existing.message
        );
        for mode in [FirstRunMode::Seed, FirstRunMode::Empty] {
            let validation =
                validate_first_run_location(&unknown_dir, mode, "project-default", Some(0))
                    .unwrap();
            assert!(!validation.valid);
            assert_eq!(validation.message, "TARGET_ALREADY_EXISTS");
        }

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn first_run_copy_is_atomic_and_refuses_overwrite() {
        let root = std::env::temp_dir().join(format!(
            "research-hotspots-core-first-run-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        let source = root.join("seed.sqlite");
        let target = root.join("library.sqlite");
        fs::write(&source, b"seed").unwrap();
        let size = copy_file_atomically_without_overwrite(&source, &target, |path| {
            fs::metadata(path)
                .map(|value| value.len())
                .map_err(|error| error.to_string())
        })
        .unwrap();
        assert_eq!(size, 4);
        assert_eq!(fs::read(&target).unwrap(), b"seed");
        assert_eq!(
            copy_file_atomically_without_overwrite::<(), _>(&source, &target, |_| Ok(()))
                .unwrap_err(),
            "TARGET_ALREADY_EXISTS"
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn first_run_copy_cleans_partial_after_validation_failure() {
        let root = std::env::temp_dir().join(format!(
            "research-hotspots-core-first-run-fail-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        let source = root.join("seed.sqlite");
        let target = root.join("library.sqlite");
        fs::write(&source, b"seed").unwrap();
        assert!(
            copy_file_atomically_without_overwrite::<(), _>(&source, &target, |_| Err(
                "injected".to_string()
            ))
            .is_err()
        );
        assert!(!target.exists());
        assert!(!root.join("library.sqlite.partial").exists());
        fs::remove_dir_all(root).unwrap();
    }
}
