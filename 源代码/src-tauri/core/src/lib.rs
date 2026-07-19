use std::collections::HashSet;
use std::fs;
use std::path::Path;
use std::sync::{Arc, Mutex};

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

pub const V20_SCHEMA_VERSION: i64 = 8;
pub const V20_ALGORITHM_VERSION: &str = "v20-unified-1";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotHotspot {
    pub hotspot_id: String,
    pub payload_json: String,
    pub x: f64,
    pub y: f64,
    pub z: f64,
    pub paper_count: i64,
    pub updated_at: String,
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
    pub paper_count: i64,
    pub created_at: String,
    pub hotspots: Vec<SnapshotHotspot>,
    pub memberships: Vec<SnapshotMembership>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisState {
    pub project_id: String,
    pub active_snapshot_id: String,
    pub algorithm_version: String,
    pub paper_count: i64,
    pub hotspot_count: i64,
    pub membership_count: i64,
    pub generated_at: String,
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

#[derive(Debug, Clone, PartialEq)]
pub struct ValidatedLibraryCandidate {
    pub paper_count: i64,
    pub snapshot_id: Option<String>,
}

pub fn ensure_v20_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(include_str!("schema.sql")).map_err(|error| error.to_string())
}

pub fn write_snapshot_transaction(conn: &Connection, input: &SnapshotWriteInput) -> Result<AnalysisState, String> {
    ensure_v20_schema(conn)?;
    if input.paper_count != input.memberships.len() as i64 {
        return Err(format!("V20_MEMBERSHIP_COUNT_MISMATCH: papers={}, memberships={}", input.paper_count, input.memberships.len()));
    }
    let hotspot_ids = input.hotspots.iter().map(|row| row.hotspot_id.as_str()).collect::<HashSet<_>>();
    if input.memberships.iter().any(|row| !hotspot_ids.contains(row.hotspot_id.as_str())) {
        return Err("V20_MEMBERSHIP_HOTSPOT_MISSING".to_string());
    }
    let tx = conn.unchecked_transaction().map_err(|error| error.to_string())?;
    tx.execute(
        "INSERT INTO v20_analysis_snapshots (id, project_id, algorithm_version, paper_count, hotspot_count, membership_count, status, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'writing', ?7)",
        params![input.snapshot_id, input.project_id, input.algorithm_version, input.paper_count, input.hotspots.len() as i64, input.memberships.len() as i64, input.created_at],
    ).map_err(|error| error.to_string())?;
    {
        let mut stmt = tx.prepare("INSERT INTO v20_hotspots (snapshot_id, project_id, hotspot_id, payload_json, x, y, z, paper_count, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)").map_err(|error| error.to_string())?;
        for row in &input.hotspots {
            stmt.execute(params![input.snapshot_id, input.project_id, row.hotspot_id, row.payload_json, row.x, row.y, row.z, row.paper_count, row.updated_at]).map_err(|error| error.to_string())?;
        }
    }
    {
        let mut stmt = tx.prepare("INSERT INTO v20_paper_memberships (snapshot_id, project_id, paper_id, hotspot_id, x, y, z, representative_rank, score) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)").map_err(|error| error.to_string())?;
        for row in &input.memberships {
            stmt.execute(params![input.snapshot_id, input.project_id, row.paper_id, row.hotspot_id, row.x, row.y, row.z, row.representative_rank, row.score]).map_err(|error| error.to_string())?;
        }
    }
    tx.execute("UPDATE v20_analysis_snapshots SET status = 'ready' WHERE id = ?1", params![input.snapshot_id]).map_err(|error| error.to_string())?;
    tx.execute(
        "INSERT INTO v20_analysis_state(project_id, active_snapshot_id, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(project_id) DO UPDATE SET active_snapshot_id = excluded.active_snapshot_id, updated_at = excluded.updated_at",
        params![input.project_id, input.snapshot_id, input.created_at],
    ).map_err(|error| error.to_string())?;
    tx.commit().map_err(|error| error.to_string())?;
    read_analysis_state(conn, &input.project_id)?.ok_or_else(|| "V20_STATE_SWITCH_FAILED".to_string())
}

pub fn read_analysis_state(conn: &Connection, project_id: &str) -> Result<Option<AnalysisState>, String> {
    ensure_v20_schema(conn)?;
    conn.query_row(
        "SELECT s.project_id, s.id, s.algorithm_version, s.paper_count, s.hotspot_count, s.membership_count, s.created_at FROM v20_analysis_state a JOIN v20_analysis_snapshots s ON s.id = a.active_snapshot_id AND s.status = 'ready' WHERE a.project_id = ?1",
        params![project_id],
        |row| Ok(AnalysisState { project_id: row.get(0)?, active_snapshot_id: row.get(1)?, algorithm_version: row.get(2)?, paper_count: row.get(3)?, hotspot_count: row.get(4)?, membership_count: row.get(5)?, generated_at: row.get(6)? }),
    ).optional().map_err(|error| error.to_string())
}

pub fn read_unified_galaxy_rows(conn: &Connection, project_id: &str) -> Result<Option<UnifiedGalaxyRows>, String> {
    let Some(state) = read_analysis_state(conn, project_id)? else { return Ok(None) };
    let mut hotspot_stmt = conn.prepare("SELECT hotspot_id, payload_json, x, y, z, paper_count, updated_at FROM v20_hotspots WHERE project_id = ?1 AND snapshot_id = ?2 ORDER BY paper_count DESC, hotspot_id ASC").map_err(|error| error.to_string())?;
    let hotspots = hotspot_stmt.query_map(params![project_id, state.active_snapshot_id], |row| Ok(SnapshotHotspot { hotspot_id: row.get(0)?, payload_json: row.get(1)?, x: row.get(2)?, y: row.get(3)?, z: row.get(4)?, paper_count: row.get(5)?, updated_at: row.get(6)? })).map_err(|error| error.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|error| error.to_string())?;
    let mut membership_stmt = conn.prepare("SELECT paper_id, hotspot_id, x, y, z, representative_rank, score FROM v20_paper_memberships WHERE project_id = ?1 AND snapshot_id = ?2 ORDER BY hotspot_id ASC, COALESCE(representative_rank, 2147483647), paper_id ASC").map_err(|error| error.to_string())?;
    let memberships = membership_stmt.query_map(params![project_id, state.active_snapshot_id], |row| Ok(SnapshotMembership { paper_id: row.get(0)?, hotspot_id: row.get(1)?, x: row.get(2)?, y: row.get(3)?, z: row.get(4)?, representative_rank: row.get(5)?, score: row.get(6)? })).map_err(|error| error.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|error| error.to_string())?;
    Ok(Some(UnifiedGalaxyRows { state, hotspots, memberships }))
}

pub fn read_unified_hotspot_rows(conn: &Connection, project_id: &str) -> Result<Option<UnifiedHotspotRows>, String> {
    ensure_v20_schema(conn)?;
    let Some(state) = read_analysis_state(conn, project_id)? else { return Ok(None); };
    let mut stmt = conn.prepare("SELECT hotspot_id, payload_json, x, y, z, paper_count, updated_at FROM v20_hotspots WHERE project_id = ?1 AND snapshot_id = ?2 ORDER BY paper_count DESC, hotspot_id ASC").map_err(|error| error.to_string())?;
    let hotspots = stmt.query_map(params![project_id, state.active_snapshot_id], |row| Ok(SnapshotHotspot { hotspot_id: row.get(0)?, payload_json: row.get(1)?, x: row.get(2)?, y: row.get(3)?, z: row.get(4)?, paper_count: row.get(5)?, updated_at: row.get(6)? })).map_err(|error| error.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|error| error.to_string())?;
    Ok(Some(UnifiedHotspotRows { state, hotspots }))
}

pub fn validate_active_snapshot(conn: &Connection, project_id: &str) -> Result<Option<AnalysisState>, String> {
    ensure_v20_schema(conn)?;
    let Some(state) = read_analysis_state(conn, project_id)? else { return Ok(None); };
    let hotspot_count: i64 = conn.query_row("SELECT COUNT(*) FROM v20_hotspots WHERE project_id = ?1 AND snapshot_id = ?2", params![project_id, state.active_snapshot_id], |row| row.get(0)).map_err(|error| error.to_string())?;
    let membership_count: i64 = conn.query_row("SELECT COUNT(*) FROM v20_paper_memberships WHERE project_id = ?1 AND snapshot_id = ?2", params![project_id, state.active_snapshot_id], |row| row.get(0)).map_err(|error| error.to_string())?;
    let orphan_memberships: i64 = conn.query_row(
        "SELECT COUNT(*) FROM v20_paper_memberships m LEFT JOIN v20_hotspots h ON h.project_id = m.project_id AND h.snapshot_id = m.snapshot_id AND h.hotspot_id = m.hotspot_id WHERE m.project_id = ?1 AND m.snapshot_id = ?2 AND h.hotspot_id IS NULL",
        params![project_id, state.active_snapshot_id],
        |row| row.get(0),
    ).map_err(|error| error.to_string())?;
    if hotspot_count != state.hotspot_count {
        return Err(format!("V20 hotspot count mismatch: state={}, rows={hotspot_count}.", state.hotspot_count));
    }
    if membership_count != state.membership_count {
        return Err(format!("V20 membership count mismatch: state={}, rows={membership_count}.", state.membership_count));
    }
    if orphan_memberships != 0 {
        return Err(format!("V20 snapshot contains {orphan_memberships} orphan memberships."));
    }
    Ok(Some(state))
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

pub fn validate_library_candidate_connection(
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
    if foreign_rows.next().map_err(|error| error.to_string())?.is_some() {
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
            validate_active_snapshot(conn, &project)?;
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
            return Err(format!("V20 snapshot contains {orphan_papers} memberships without papers."));
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
    Ok(ValidatedLibraryCandidate {
        paper_count,
        snapshot_id: state.map(|value| value.active_snapshot_id),
    })
}

pub fn atomic_replace_file_with_rollback<T, F>(active: &Path, staged: &Path, safety: &Path, validate: F) -> Result<(bool, T), String>
where
    F: FnOnce(&Path) -> Result<T, String>,
{
    let had_active = active.exists();
    if had_active {
        fs::rename(active, safety).map_err(|error| format!("Cannot move active database to safety copy: {error}"))?;
    }
    if let Err(error) = fs::rename(staged, active) {
        if had_active { let _ = fs::rename(safety, active); }
        return Err(format!("Cannot activate staged database; previous database restored: {error}"));
    }
    match validate(active) {
        Ok(value) => Ok((had_active, value)),
        Err(error) => {
            let _ = fs::remove_file(active);
            if had_active {
                fs::rename(safety, active).map_err(|rollback_error| format!("Validation failed ({error}) and rollback failed: {rollback_error}"))?;
            }
            Err(format!("Activated database failed validation and was rolled back: {error}"))
        }
    }
}

#[derive(Default, Clone)]
pub struct TaskRegistry { active: Arc<Mutex<HashSet<String>>> }
pub struct TaskPermit { key: String, active: Arc<Mutex<HashSet<String>>> }
impl TaskRegistry {
    pub fn try_acquire(&self, key: impl Into<String>) -> Result<TaskPermit, String> {
        let key = key.into();
        let mut active = self.active.lock().map_err(|_| "TASK_REGISTRY_POISONED".to_string())?;
        if !active.insert(key.clone()) { return Err("TASK_ALREADY_RUNNING".to_string()) }
        Ok(TaskPermit { key, active: Arc::clone(&self.active) })
    }
}
impl Drop for TaskPermit { fn drop(&mut self) { if let Ok(mut active) = self.active.lock() { active.remove(&self.key); } } }

#[cfg(test)]
mod tests {
    use super::*;
    fn input(snapshot: &str, paper_id: &str) -> SnapshotWriteInput {
        SnapshotWriteInput { snapshot_id: snapshot.into(), project_id: "p".into(), algorithm_version: V20_ALGORITHM_VERSION.into(), paper_count: 1, created_at: snapshot.into(), hotspots: vec![SnapshotHotspot { hotspot_id: "h".into(), payload_json: "{}".into(), x: 1.0, y: 2.0, z: 3.0, paper_count: 1, updated_at: snapshot.into() }], memberships: vec![SnapshotMembership { paper_id: paper_id.into(), hotspot_id: "h".into(), x: 1.1, y: 2.2, z: 3.3, representative_rank: Some(1), score: 1.0 }] }
    }

    fn add_papers_table(conn: &Connection, rows: &[(&str, &str)]) {
        conn.execute_batch("CREATE TABLE papers(id TEXT NOT NULL, project_id TEXT NOT NULL, PRIMARY KEY(id, project_id));").unwrap();
        for (id, project_id) in rows {
            conn.execute("INSERT INTO papers(id, project_id) VALUES (?1, ?2)", params![id, project_id]).unwrap();
        }
    }
    #[test]
    fn snapshot_switch_is_atomic_and_readable() {
        let conn = Connection::open_in_memory().unwrap();
        write_snapshot_transaction(&conn, &input("s1", "a")).unwrap();
        let state = write_snapshot_transaction(&conn, &input("s2", "b")).unwrap();
        assert_eq!(state.active_snapshot_id, "s2");
        assert_eq!(read_unified_galaxy_rows(&conn, "p").unwrap().unwrap().memberships[0].paper_id, "b");
    }
    #[test]
    fn invalid_snapshot_keeps_old_active() {
        let conn = Connection::open_in_memory().unwrap();
        write_snapshot_transaction(&conn, &input("s1", "a")).unwrap();
        let mut bad = input("s2", "b"); bad.paper_count = 2;
        assert!(write_snapshot_transaction(&conn, &bad).is_err());
        assert_eq!(read_analysis_state(&conn, "p").unwrap().unwrap().active_snapshot_id, "s1");
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
        write_snapshot_transaction(&conn, &input("s1", "a")).unwrap();
        let rows = read_unified_hotspot_rows(&conn, "p").unwrap().unwrap();
        assert_eq!(rows.state.active_snapshot_id, "s1");
        assert_eq!(rows.hotspots.len(), 1);
        assert_eq!(validate_active_snapshot(&conn, "p").unwrap().unwrap().membership_count, 1);
        conn.execute("DELETE FROM v20_paper_memberships WHERE snapshot_id = 's1'", []).unwrap();
        assert!(validate_active_snapshot(&conn, "p").unwrap_err().contains("membership count mismatch"));
    }

    #[test]
    fn library_candidate_rejects_missing_papers_table() {
        let conn = Connection::open_in_memory().unwrap();
        assert!(validate_library_candidate_connection(&conn, "p").unwrap_err().contains("no papers table"));
    }

    #[test]
    fn library_candidate_rejects_corrupt_sqlite_file() {
        let root = std::env::temp_dir().join(format!("research-hotspots-core-corrupt-{}", std::process::id()));
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
    fn library_candidate_rejects_membership_count_mismatch() {
        let conn = Connection::open_in_memory().unwrap();
        add_papers_table(&conn, &[("a", "p")]);
        write_snapshot_transaction(&conn, &input("s1", "a")).unwrap();
        conn.execute("DELETE FROM v20_paper_memberships WHERE snapshot_id = 's1'", []).unwrap();
        assert!(validate_library_candidate_connection(&conn, "p").unwrap_err().contains("membership count mismatch"));
    }

    #[test]
    fn library_candidate_rejects_invalid_active_snapshot_reference() {
        let conn = Connection::open_in_memory().unwrap();
        add_papers_table(&conn, &[("a", "p")]);
        ensure_v20_schema(&conn).unwrap();
        conn.execute("PRAGMA foreign_keys = OFF", []).unwrap();
        conn.execute("INSERT INTO v20_analysis_state(project_id, active_snapshot_id, updated_at) VALUES ('p', 'missing', 'now')", []).unwrap();
        assert!(validate_library_candidate_connection(&conn, "p").unwrap_err().contains("foreign_key_check"));
    }

    #[test]
    fn library_candidate_rejects_membership_without_paper() {
        let conn = Connection::open_in_memory().unwrap();
        add_papers_table(&conn, &[("different", "p")]);
        write_snapshot_transaction(&conn, &input("s1", "missing")).unwrap();
        assert!(validate_library_candidate_connection(&conn, "p").unwrap_err().contains("memberships without papers"));
    }

    #[test]
    fn atomic_file_replace_preserves_safety_copy() {
        let root = std::env::temp_dir().join(format!("research-hotspots-core-swap-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        let active = root.join("active.sqlite");
        let staged = root.join("staged.sqlite");
        let safety = root.join("safety.sqlite");
        fs::write(&active, b"old").unwrap();
        fs::write(&staged, b"new").unwrap();
        let (_, value) = atomic_replace_file_with_rollback(&active, &staged, &safety, |path| fs::read(path).map_err(|error| error.to_string())).unwrap();
        assert_eq!(value, b"new");
        assert_eq!(fs::read(&active).unwrap(), b"new");
        assert_eq!(fs::read(&safety).unwrap(), b"old");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn atomic_file_replace_rolls_back_on_validation_failure() {
        let root = std::env::temp_dir().join(format!("research-hotspots-core-rollback-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        let active = root.join("active.sqlite");
        let staged = root.join("staged.sqlite");
        let safety = root.join("safety.sqlite");
        fs::write(&active, b"old").unwrap();
        fs::write(&staged, b"bad").unwrap();
        assert!(atomic_replace_file_with_rollback::<(), _>(&active, &staged, &safety, |_| Err("injected".into())).is_err());
        assert_eq!(fs::read(&active).unwrap(), b"old");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn atomic_file_replace_restores_active_when_staged_file_is_missing() {
        let root = std::env::temp_dir().join(format!("research-hotspots-core-missing-stage-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        let active = root.join("active.sqlite");
        let staged = root.join("missing.sqlite");
        let safety = root.join("safety.sqlite");
        fs::write(&active, b"old").unwrap();
        assert!(atomic_replace_file_with_rollback::<(), _>(&active, &staged, &safety, |_| Ok(())).is_err());
        assert_eq!(fs::read(&active).unwrap(), b"old");
        fs::remove_dir_all(root).unwrap();
    }
}
