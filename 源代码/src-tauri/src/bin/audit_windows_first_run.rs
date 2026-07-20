use std::env;
use std::fs;
use std::path::{Path, PathBuf};

use research_hotspots_core::{
    create_empty_library_atomically, install_seed_library_atomically,
    validate_first_run_location, validate_library_candidate_file, FirstRunMode,
    SeedExpectation,
};
use rusqlite::{params, Connection};
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Manifest {
    database_schema_version: i64,
    project_id: String,
    snapshot_id: String,
    sha256: String,
    size_bytes: u64,
    paper_count: i64,
    hotspot_count: i64,
    membership_count: i64,
}

fn arg(name: &str) -> Result<PathBuf, String> {
    let args = env::args().collect::<Vec<_>>();
    let index = args.iter().position(|value| value == name).ok_or_else(|| format!("Missing {name}"))?;
    args.get(index + 1).map(PathBuf::from).ok_or_else(|| format!("Missing value for {name}"))
}

fn assert_no_partial(root: &Path) -> Result<(), String> {
    for entry in fs::read_dir(root).map_err(|error| error.to_string())? {
        let path = entry.map_err(|error| error.to_string())?.path();
        if path.is_dir() { assert_no_partial(&path)?; }
        let name = path.file_name().and_then(|value| value.to_str()).unwrap_or_default();
        if name.contains(".partial") { return Err(format!("Partial SQLite artifact remains: {:?}", path)); }
    }
    Ok(())
}

fn copy_database(source: &Path, target: &Path) -> Result<(), String> {
    fs::copy(source, target).map(|_| ()).map_err(|error| error.to_string())
}

fn run() -> Result<(), String> {
    let root_parent = arg("--root")?;
    let seed = arg("--seed")?;
    let manifest_path = arg("--manifest")?;
    let manifest: Manifest = serde_json::from_slice(&fs::read(&manifest_path).map_err(|error| error.to_string())?)
        .map_err(|error| error.to_string())?;
    let expectation = SeedExpectation {
        sha256: manifest.sha256,
        size_bytes: manifest.size_bytes,
        schema_version: manifest.database_schema_version,
        project_id: manifest.project_id.clone(),
        snapshot_id: manifest.snapshot_id.clone(),
        paper_count: manifest.paper_count,
        hotspot_count: manifest.hotspot_count,
        membership_count: manifest.membership_count,
    };

    fs::create_dir_all(&root_parent).map_err(|error| error.to_string())?;
    let run_root = root_parent.join(format!("run-{}", std::process::id()));
    if run_root.exists() { fs::remove_dir_all(&run_root).map_err(|error| error.to_string())?; }
    fs::create_dir_all(&run_root).map_err(|error| error.to_string())?;

    let full_dir = run_root.join("full");
    fs::create_dir_all(&full_dir).map_err(|error| error.to_string())?;
    let full_location = validate_first_run_location(&full_dir, FirstRunMode::Seed, &manifest.project_id, Some(manifest.size_bytes))?;
    if !full_location.valid { return Err(format!("Full seed location rejected: {}", full_location.message)); }
    let full = install_seed_library_atomically(&seed, &full_location.database_path, &expectation)?;
    if (full.paper_count, full.hotspot_count, full.membership_count) != (25_463, 160, 25_463) {
        return Err(format!("Unexpected Full counts: {}/{}/{}", full.paper_count, full.hotspot_count, full.membership_count));
    }
    let attached = validate_first_run_location(&full_dir, FirstRunMode::Existing, &manifest.project_id, None)?;
    if !attached.valid || attached.existing.as_ref().and_then(|value| value.snapshot_id.as_deref()) != Some(manifest.snapshot_id.as_str()) {
        return Err("Existing V20 library was not accepted".to_string());
    }
    if create_empty_library_atomically(&full_location.database_path, &manifest.project_id).unwrap_err() != "TARGET_ALREADY_EXISTS" {
        return Err("Existing target was not protected".to_string());
    }

    let lite_dir = run_root.join("lite");
    fs::create_dir_all(&lite_dir).map_err(|error| error.to_string())?;
    let lite_path = lite_dir.join("research-hotspots-v7.sqlite");
    let lite = create_empty_library_atomically(&lite_path, &manifest.project_id)?;
    if (lite.paper_count, lite.hotspot_count, lite.membership_count) != (0, 0, 0) || lite.snapshot_id.is_some() {
        return Err("Lite library is not empty".to_string());
    }
    {
        let conn = Connection::open(&lite_path).map_err(|error| error.to_string())?;
        conn.execute(
            "INSERT INTO papers(id, project_id, source, title, abstract, field, created_at, updated_at) VALUES (?1, ?2, 'arxiv', 'legacy', '', 'Other', 'now', 'now')",
            params!["legacy-paper", manifest.project_id],
        ).map_err(|error| error.to_string())?;
    }
    let legacy = validate_library_candidate_file(&lite_path, &manifest.project_id)?;
    if legacy.paper_count != 1 || legacy.snapshot_id.is_some() { return Err("Legacy library modeling state is wrong".to_string()); }

    let corrupt_dir = run_root.join("corrupt");
    fs::create_dir_all(&corrupt_dir).map_err(|error| error.to_string())?;
    fs::write(corrupt_dir.join("research-hotspots-v7.sqlite"), b"not sqlite").map_err(|error| error.to_string())?;
    if validate_first_run_location(&corrupt_dir, FirstRunMode::Existing, &manifest.project_id, None)?.valid {
        return Err("Corrupt library was accepted".to_string());
    }

    let invalid_snapshot_dir = run_root.join("invalid-snapshot");
    fs::create_dir_all(&invalid_snapshot_dir).map_err(|error| error.to_string())?;
    let invalid_snapshot = invalid_snapshot_dir.join("research-hotspots-v7.sqlite");
    copy_database(&full_location.database_path, &invalid_snapshot)?;
    {
        let conn = Connection::open(&invalid_snapshot).map_err(|error| error.to_string())?;
        conn.execute_batch("PRAGMA foreign_keys=OFF; UPDATE v20_analysis_state SET active_snapshot_id='missing-snapshot';")
            .map_err(|error| error.to_string())?;
    }
    if validate_library_candidate_file(&invalid_snapshot, &manifest.project_id).is_ok() { return Err("Invalid active snapshot was accepted".to_string()); }

    let mismatch_dir = run_root.join("membership-mismatch");
    fs::create_dir_all(&mismatch_dir).map_err(|error| error.to_string())?;
    let mismatch = mismatch_dir.join("research-hotspots-v7.sqlite");
    copy_database(&full_location.database_path, &mismatch)?;
    {
        let conn = Connection::open(&mismatch).map_err(|error| error.to_string())?;
        conn.execute("DELETE FROM v20_paper_memberships WHERE rowid IN (SELECT rowid FROM v20_paper_memberships LIMIT 1)", [])
            .map_err(|error| error.to_string())?;
    }
    if validate_library_candidate_file(&mismatch, &manifest.project_id).is_ok() { return Err("Membership mismatch was accepted".to_string()); }

    assert_no_partial(&run_root)?;
    fs::remove_dir_all(&run_root).map_err(|error| error.to_string())?;
    println!("{}", serde_json::json!({
        "ok": true,
        "schema": full.schema_version,
        "snapshotId": full.snapshot_id,
        "papers": full.paper_count,
        "hotspots": full.hotspot_count,
        "memberships": full.membership_count,
        "lite": [0, 0, 0],
        "partialArtifacts": 0
    }));
    Ok(())
}

fn main() {
    if let Err(error) = run() {
        eprintln!("windows first-run audit failed: {error}");
        std::process::exit(1);
    }
}
