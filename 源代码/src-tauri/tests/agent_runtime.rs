#![allow(dead_code)]

use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::Connection;

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

#[path = "../src/agent_runtime.rs"]
mod agent_runtime;
