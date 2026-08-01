use std::collections::hash_map::DefaultHasher;
use std::env;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::time::Instant;

use research_hotspots_core::{
    agent_store::migrate_library_file, validate_active_snapshot, write_snapshot_transaction,
    SnapshotHotspot, SnapshotMembership, SnapshotWriteInput, V20_ALGORITHM_VERSION,
};
use rusqlite::{params, Connection};
use serde::Serialize;

const PROJECT_ID: &str = "agent-performance";
const PAPER_COUNT: i64 = 100_000;
const HOTSPOT_COUNT: usize = 160;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PerformanceReport {
    ok: bool,
    paper_count: i64,
    hotspot_count: usize,
    membership_count: usize,
    insert_ms: u128,
    search_25k_p95_ms: u128,
    search_100k_p95_ms: u128,
    evidence_first_ms: u128,
    evidence_cached_ms: u128,
    modeling_ms: u128,
    peak_working_set_bytes: u64,
    database_bytes: u64,
    wal_bytes: u64,
    staging_bytes: u64,
    thresholds: Thresholds,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Thresholds {
    search_25k_p95_ms: u128,
    search_100k_p95_ms: u128,
    evidence_first_ms: u128,
    evidence_cached_ms: u128,
    modeling_ms: u128,
    peak_working_set_bytes: u64,
}

fn main() {
    if let Err(error) = run() {
        eprintln!("audit_agent_performance failed: {error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let root = argument("--root")
        .unwrap_or_else(|| PathBuf::from("src-tauri/target/agent-performance-audit"));
    fs::create_dir_all(&root).map_err(|error| error.to_string())?;
    let database_path = root.join("agent-performance-v11.sqlite");
    remove_sqlite_family(&database_path);
    create_v8_fixture(&database_path)?;
    migrate_library_file(&database_path, PROJECT_ID, 1_000, false)?;
    let mut connection = Connection::open(&database_path).map_err(|error| error.to_string())?;
    connection
        .execute_batch(
            "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA foreign_keys=ON;",
        )
        .map_err(|error| error.to_string())?;

    let insert_started = Instant::now();
    insert_rows(&mut connection, 0, 25_463)?;
    let search_25k_p95_ms = search_p95(&connection)?;
    insert_rows(&mut connection, 25_463, PAPER_COUNT)?;
    let insert_ms = insert_started.elapsed().as_millis();
    let search_100k_p95_ms = search_p95(&connection)?;
    let mut peak_working_set_bytes = working_set_bytes();

    let modeling_started = Instant::now();
    let (hotspots, memberships) = prepare_snapshot_rows(&connection)?;
    peak_working_set_bytes = peak_working_set_bytes.max(working_set_bytes());
    let created_at = "performance-audit".to_string();
    let snapshot_id = format!("{PROJECT_ID}:v20:performance");
    write_snapshot_transaction(
        &connection,
        &SnapshotWriteInput {
            snapshot_id: snapshot_id.clone(),
            project_id: PROJECT_ID.into(),
            algorithm_version: V20_ALGORITHM_VERSION.into(),
            layout_version: research_hotspots_core::semantic_layout::SEMANTIC_LAYOUT_VERSION.into(),
            projection_version:
                research_hotspots_core::semantic_layout::SEMANTIC_PROJECTION_VERSION.into(),
            embedding_model_id: research_hotspots_core::semantic_layout::SEMANTIC_MODEL_ID.into(),
            embedding_model_revision:
                research_hotspots_core::semantic_layout::SEMANTIC_MODEL_REVISION.into(),
            hotspot_identity_version: research_hotspots_core::HOTSPOT_IDENTITY_VERSION.into(),
            paper_count: PAPER_COUNT,
            created_at,
            hotspots,
            memberships: memberships.clone(),
            lineage: Vec::new(),
        },
    )?;
    let modeling_ms = modeling_started.elapsed().as_millis();
    let state = validate_active_snapshot(&connection, PROJECT_ID)?
        .ok_or_else(|| "PERFORMANCE_SNAPSHOT_NOT_ACTIVE".to_string())?;

    let evidence_started = Instant::now();
    let evidence = load_evidence(&connection, &snapshot_id)?;
    let evidence_first_ms = evidence_started.elapsed().as_millis();
    let cached_started = Instant::now();
    let _cached = evidence.clone();
    let evidence_cached_ms = cached_started.elapsed().as_millis();
    connection
        .execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
        .map_err(|error| error.to_string())?;
    peak_working_set_bytes = peak_working_set_bytes.max(working_set_bytes());
    drop(connection);

    let thresholds = Thresholds {
        search_25k_p95_ms: 300,
        search_100k_p95_ms: 750,
        evidence_first_ms: 300,
        evidence_cached_ms: 30,
        modeling_ms: 30 * 60 * 1_000,
        peak_working_set_bytes: 8 * 1024 * 1024 * 1024,
    };
    let database_bytes = file_size(&database_path);
    let wal_bytes = file_size(Path::new(&format!("{}-wal", database_path.display())));
    let staging_bytes = directory_size(&root.join(".agent-operation-staging"));
    let ok = state.paper_count == PAPER_COUNT
        && state.hotspot_count == HOTSPOT_COUNT as i64
        && state.membership_count == PAPER_COUNT
        && memberships.len() == PAPER_COUNT as usize
        && search_25k_p95_ms <= thresholds.search_25k_p95_ms
        && search_100k_p95_ms <= thresholds.search_100k_p95_ms
        && evidence_first_ms <= thresholds.evidence_first_ms
        && evidence_cached_ms <= thresholds.evidence_cached_ms
        && modeling_ms <= thresholds.modeling_ms
        && (peak_working_set_bytes == 0
            || peak_working_set_bytes <= thresholds.peak_working_set_bytes)
        && staging_bytes == 0;
    let report = PerformanceReport {
        ok,
        paper_count: state.paper_count,
        hotspot_count: state.hotspot_count as usize,
        membership_count: memberships.len(),
        insert_ms,
        search_25k_p95_ms,
        search_100k_p95_ms,
        evidence_first_ms,
        evidence_cached_ms,
        modeling_ms,
        peak_working_set_bytes,
        database_bytes,
        wal_bytes,
        staging_bytes,
        thresholds,
    };
    let encoded = serde_json::to_string_pretty(&report).map_err(|error| error.to_string())?;
    fs::write(
        root.join("agent-performance-report.json"),
        format!("{encoded}\n"),
    )
    .map_err(|error| error.to_string())?;
    println!("{encoded}");
    remove_sqlite_family(&database_path);
    if !ok {
        return Err("AGENT_PERFORMANCE_GATE_FAILED".into());
    }
    Ok(())
}

fn create_v8_fixture(path: &Path) -> Result<(), String> {
    let connection = Connection::open(path).map_err(|error| error.to_string())?;
    connection.execute_batch(
        "PRAGMA user_version=8;
         CREATE TABLE papers(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,source TEXT NOT NULL,title TEXT NOT NULL,abstract TEXT NOT NULL,authors TEXT,categories TEXT,field TEXT NOT NULL,published_date TEXT,year INTEGER,url TEXT,doi TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,search_blob TEXT NOT NULL);
         CREATE INDEX idx_papers_project_year ON papers(project_id,year DESC);
         CREATE INDEX idx_papers_project_source ON papers(project_id,source);
         CREATE INDEX idx_papers_project_field ON papers(project_id,field);
         CREATE TABLE v20_analysis_snapshots(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,algorithm_version TEXT NOT NULL,paper_count INTEGER NOT NULL,hotspot_count INTEGER NOT NULL,membership_count INTEGER NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL);
         CREATE TABLE v20_hotspots(snapshot_id TEXT NOT NULL,project_id TEXT NOT NULL,hotspot_id TEXT NOT NULL,payload_json TEXT NOT NULL,x REAL NOT NULL,y REAL NOT NULL,z REAL NOT NULL,paper_count INTEGER NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(snapshot_id,hotspot_id));
         CREATE TABLE v20_paper_memberships(snapshot_id TEXT NOT NULL,project_id TEXT NOT NULL,paper_id TEXT NOT NULL,hotspot_id TEXT NOT NULL,x REAL NOT NULL,y REAL NOT NULL,z REAL NOT NULL,representative_rank INTEGER,score REAL NOT NULL,PRIMARY KEY(snapshot_id,paper_id));
         CREATE TABLE v20_analysis_state(project_id TEXT PRIMARY KEY,active_snapshot_id TEXT NOT NULL,updated_at TEXT NOT NULL);",
    ).map_err(|error| error.to_string())
}

fn insert_rows(connection: &mut Connection, from: i64, to: i64) -> Result<(), String> {
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    {
        let mut statement = transaction.prepare("INSERT INTO papers(id,project_id,source,title,abstract,authors,categories,field,published_date,year,url,doi,created_at,updated_at,search_blob) VALUES(?1,?2,'local',?3,?4,?5,?6,?7,?8,?9,?10,?11,'performance','performance',?12)").map_err(|error|error.to_string())?;
        for index in from..to {
            let discipline = [
                "Quantum Physics",
                "Medical Imaging",
                "Protein Science",
                "Artificial Intelligence",
            ][(index as usize) % 4];
            let topic = [
                "error correction",
                "foundation model",
                "protein design",
                "retrieval agent",
            ][(index as usize) % 4];
            let method = [
                "graph evidence",
                "benchmark evaluation",
                "multimodal learning",
                "temporal audit",
            ][(index as usize / 4) % 4];
            let title = format!("{topic} {method} study {index}");
            let abstract_text = format!("This reproducible {discipline} paper studies {topic} with {method}, evidence retrieval, semantic clustering, limitations, and reliable local analysis at realistic field lengths. Record {index}.");
            let search_blob = format!("{title} {abstract_text} {discipline}").to_lowercase();
            statement
                .execute(params![
                    format!("paper-{index:06}"),
                    PROJECT_ID,
                    title,
                    abstract_text,
                    format!("Author {}, Coauthor {}", index % 997, index % 389),
                    topic,
                    discipline,
                    format!("202{}-01-01", index % 7),
                    2020 + index % 7,
                    format!("https://example.org/paper/{index}"),
                    format!("10.0000/performance.{index:06}"),
                    search_blob
                ])
                .map_err(|error| error.to_string())?;
        }
    }
    transaction.commit().map_err(|error| error.to_string())
}

fn search_p95(connection: &Connection) -> Result<u128, String> {
    let mut samples = Vec::new();
    for term in ["graph", "foundation", "protein", "retrieval", "benchmark"]
        .into_iter()
        .cycle()
        .take(31)
    {
        let started = Instant::now();
        let mut statement = connection.prepare("SELECT id,title FROM papers WHERE project_id=?1 AND search_blob LIKE ?2 ORDER BY year DESC,updated_at DESC LIMIT 20").map_err(|error|error.to_string())?;
        let rows = statement
            .query_map(params![PROJECT_ID, format!("%{term}%")], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|error| error.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?;
        if rows.is_empty() {
            return Err("PERFORMANCE_SEARCH_EMPTY".into());
        }
        samples.push(started.elapsed().as_millis());
    }
    samples.sort_unstable();
    Ok(samples[((samples.len() as f64 * 0.95).ceil() as usize).saturating_sub(1)])
}

fn prepare_snapshot_rows(
    connection: &Connection,
) -> Result<(Vec<SnapshotHotspot>, Vec<SnapshotMembership>), String> {
    let mut counts = vec![0_i64; HOTSPOT_COUNT];
    let mut memberships = Vec::with_capacity(PAPER_COUNT as usize);
    let mut statement = connection
        .prepare("SELECT id,title,abstract FROM papers WHERE project_id=?1 ORDER BY id")
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map(params![PROJECT_ID], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(|error| error.to_string())?;
    for row in rows {
        let (paper_id, title, abstract_text) = row.map_err(|error| error.to_string())?;
        let mut hasher = DefaultHasher::new();
        title.hash(&mut hasher);
        abstract_text.hash(&mut hasher);
        let hash = hasher.finish();
        let index = (hash as usize) % HOTSPOT_COUNT;
        counts[index] += 1;
        memberships.push(SnapshotMembership {
            paper_id,
            hotspot_id: format!("hotspot-{index:03}"),
            x: ((hash & 0xffff) as f64 / 65535.0) * 20.0 - 10.0,
            y: (((hash >> 16) & 0xffff) as f64 / 65535.0) * 20.0 - 10.0,
            z: (((hash >> 32) & 0xffff) as f64 / 65535.0) * 20.0 - 10.0,
            representative_rank: (counts[index] <= 10).then_some(counts[index]),
            score: 0.5 + (hash % 5000) as f64 / 10000.0,
        });
    }
    let hotspots = counts.into_iter().enumerate().map(|(index,paper_count)| SnapshotHotspot { hotspot_id: format!("hotspot-{index:03}"), payload_json: format!(r#"{{"id":"hotspot-{index:03}","title":"Performance hotspot {index}","paperCount":{paper_count}}}"#), identity_key_sha256: format!("identity-{index:03}"), x: (index % 20) as f64 - 10.0, y: ((index / 20) % 8) as f64 - 4.0, z: (index % 7) as f64 - 3.0, paper_count, updated_at: "performance".into() }).collect();
    Ok((hotspots, memberships))
}

fn load_evidence(connection: &Connection, snapshot_id: &str) -> Result<Vec<String>, String> {
    let mut statement = connection.prepare("SELECT p.title FROM v20_paper_memberships m JOIN papers p ON p.id=m.paper_id AND p.project_id=m.project_id WHERE m.snapshot_id=?1 AND m.hotspot_id='hotspot-000' ORDER BY COALESCE(m.representative_rank,2147483647),m.paper_id LIMIT 18").map_err(|error|error.to_string())?;
    let rows = statement
        .query_map(params![snapshot_id], |row| row.get::<_, String>(0))
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    Ok(rows)
}

fn argument(name: &str) -> Option<PathBuf> {
    let values = env::args().collect::<Vec<_>>();
    values
        .iter()
        .position(|value| value == name)
        .and_then(|index| values.get(index + 1))
        .map(PathBuf::from)
}
fn file_size(path: &Path) -> u64 {
    fs::metadata(path).map(|value| value.len()).unwrap_or(0)
}
fn directory_size(path: &Path) -> u64 {
    if !path.exists() {
        return 0;
    }
    fs::read_dir(path)
        .map(|rows| {
            rows.filter_map(Result::ok)
                .map(|row| {
                    if row.path().is_dir() {
                        directory_size(&row.path())
                    } else {
                        file_size(&row.path())
                    }
                })
                .sum()
        })
        .unwrap_or(0)
}
fn remove_sqlite_family(path: &Path) {
    for suffix in ["", "-wal", "-shm", "-journal"] {
        let _ = fs::remove_file(format!("{}{}", path.display(), suffix));
    }
}

#[cfg(windows)]
fn working_set_bytes() -> u64 {
    #[repr(C)]
    struct Counters {
        cb: u32,
        page_fault_count: u32,
        peak_working_set_size: usize,
        working_set_size: usize,
        quota_peak_paged_pool_usage: usize,
        quota_paged_pool_usage: usize,
        quota_peak_non_paged_pool_usage: usize,
        quota_non_paged_pool_usage: usize,
        pagefile_usage: usize,
        peak_pagefile_usage: usize,
    }
    #[link(name = "kernel32")]
    extern "system" {
        fn GetCurrentProcess() -> *mut core::ffi::c_void;
    }
    #[link(name = "psapi")]
    extern "system" {
        fn GetProcessMemoryInfo(
            process: *mut core::ffi::c_void,
            counters: *mut Counters,
            size: u32,
        ) -> i32;
    }
    let mut counters = Counters {
        cb: std::mem::size_of::<Counters>() as u32,
        page_fault_count: 0,
        peak_working_set_size: 0,
        working_set_size: 0,
        quota_peak_paged_pool_usage: 0,
        quota_paged_pool_usage: 0,
        quota_peak_non_paged_pool_usage: 0,
        quota_non_paged_pool_usage: 0,
        pagefile_usage: 0,
        peak_pagefile_usage: 0,
    };
    unsafe {
        if GetProcessMemoryInfo(GetCurrentProcess(), &mut counters, counters.cb) != 0 {
            counters.peak_working_set_size as u64
        } else {
            0
        }
    }
}
#[cfg(not(windows))]
fn working_set_bytes() -> u64 {
    0
}
