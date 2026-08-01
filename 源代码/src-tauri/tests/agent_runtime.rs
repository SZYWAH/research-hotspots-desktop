#![allow(dead_code)]

use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use research_hotspots_core::SnapshotWriteInput;
use rusqlite::{Connection, Transaction};

#[path = "../src/agent_model_gateway.rs"]
mod agent_model_gateway;

fn now_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}

fn read_app_credential(_project_id: &str, _service: &str) -> Option<String> {
    None
}

struct CredentialStatus {
    configured: bool,
}

fn set_app_credential(
    _project_id: String,
    _service: String,
    secret: String,
) -> Result<CredentialStatus, String> {
    Ok(CredentialStatus {
        configured: !secret.trim().is_empty(),
    })
}

fn get_app_credential_status(_project_id: String, _service: String) -> CredentialStatus {
    CredentialStatus { configured: false }
}

fn normalized_database_key(database_path: &Path) -> String {
    database_path
        .to_string_lossy()
        .replace('/', "\\")
        .to_lowercase()
}

fn open_library_database(
    _app: &tauri::AppHandle,
    _database_dir: Option<String>,
) -> Result<(Connection, PathBuf, PathBuf), String> {
    Err("AGENT_RUNTIME_TEST_DATABASE_RESOLVER_UNUSED".into())
}

// `agent_runtime.rs` is compiled here as a standalone integration-test module.
// Keep the host transaction boundary visible to that module without pulling in
// the Tauri library (and its Windows GUI loader) as a test dependency.
#[derive(Clone)]
struct PaperRecord;

struct PaperLibraryMutationResult {
    inserted: i64,
    updated: i64,
    total: i64,
}

struct PaperLibraryCleanResult {
    before_count: i64,
    after_count: i64,
    removed_count: i64,
    updated_count: i64,
    empty_removed_count: i64,
    duplicate_removed_count: i64,
}

#[derive(Clone)]
struct LibraryClusterResult {
    before_count: i64,
    cluster_count: i64,
    snapshot_id: String,
    membership_count: i64,
}

#[derive(Clone)]
struct PreparedLibraryCluster {
    snapshot: SnapshotWriteInput,
}

fn upsert_paper_rows_in_transaction(
    _transaction: &Transaction<'_>,
    _project_id: &str,
    _papers: Vec<PaperRecord>,
) -> Result<PaperLibraryMutationResult, String> {
    Err("AGENT_RUNTIME_TEST_HOST_MUTATION_UNUSED".into())
}

fn clean_library_in_transaction(
    _transaction: &Transaction<'_>,
    _project_id: &str,
) -> Result<PaperLibraryCleanResult, String> {
    Err("AGENT_RUNTIME_TEST_HOST_MUTATION_UNUSED".into())
}

fn commit_prepared_library_cluster(
    _transaction: &Transaction<'_>,
    _prepared: &PreparedLibraryCluster,
) -> Result<LibraryClusterResult, String> {
    Err("AGENT_RUNTIME_TEST_HOST_MUTATION_UNUSED".into())
}

#[path = "../src/agent_runtime.rs"]
mod agent_runtime;
