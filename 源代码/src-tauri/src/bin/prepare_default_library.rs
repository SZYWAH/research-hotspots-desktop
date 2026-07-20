use std::env;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection, OpenFlags};
use serde::Serialize;
use sha2::{Digest, Sha256};

const APP_VERSION: &str = env!("CARGO_PKG_VERSION");
const DATABASE_FILE: &str = "research-hotspots-v7.sqlite";
const DEFAULT_PROJECT_ID: &str = "project-default";
const MANIFEST_SCHEMA_VERSION: i64 = 2;
const GENERATOR_VERSION: &str = "v20-seed-2";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DefaultLibraryManifest {
    manifest_schema_version: i64,
    generator_version: String,
    database_schema_version: i64,
    data_version: String,
    app_version: String,
    database_file: String,
    project_id: String,
    snapshot_id: String,
    sha256: String,
    size_bytes: u64,
    paper_count: i64,
    hotspot_count: i64,
    membership_count: i64,
    generated_at: String,
}

fn main() {
    if let Err(error) = run() {
        eprintln!("prepare_default_library failed: {error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let args = env::args().skip(1).collect::<Vec<_>>();
    let database_dir = required_arg(&args, "--database-dir")?;
    let output_dir = required_arg(&args, "--output-dir")?;
    let data_version = optional_arg(&args, "--data-version")
        .unwrap_or_else(|| "v20-default-2026-07-19".to_string());
    let project_id =
        optional_arg(&args, "--project-id").unwrap_or_else(|| DEFAULT_PROJECT_ID.to_string());

    let source_path = PathBuf::from(database_dir).join(DATABASE_FILE);
    if !source_path.is_file() {
        return Err(format!("source database does not exist: {:?}", source_path));
    }
    let source = Connection::open_with_flags(&source_path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|error| {
            format!(
                "cannot open source database read-only {:?}: {error}",
                source_path
            )
        })?;
    let source_validation =
        research_hotspots_core::validate_library_candidate_connection(&source, &project_id)?;
    let snapshot_id = source_validation
        .snapshot_id
        .clone()
        .ok_or_else(|| format!("source project {project_id} has no active V20 snapshot"))?;
    if source_validation.schema_version != research_hotspots_core::V20_SCHEMA_VERSION {
        return Err(format!(
            "source schema must be {}, got {}",
            research_hotspots_core::V20_SCHEMA_VERSION,
            source_validation.schema_version
        ));
    }

    let output_dir = PathBuf::from(output_dir);
    fs::create_dir_all(&output_dir)
        .map_err(|error| format!("cannot create output directory {:?}: {error}", output_dir))?;
    let output_path = output_dir.join(DATABASE_FILE);
    let manifest_path = output_dir.join("default-library-manifest.json");
    let partial_path = output_dir.join(format!("{DATABASE_FILE}.partial"));
    let partial_manifest_path = output_dir.join("default-library-manifest.json.partial");
    cleanup_file(&partial_path);
    cleanup_file(&partial_manifest_path);

    let result = (|| {
        let escaped_output = partial_path.to_string_lossy().replace('\'', "''");
        source
            .execute_batch(&format!("VACUUM INTO '{escaped_output}';"))
            .map_err(|error| {
                format!("cannot create SQLite seed snapshot without modifying source: {error}")
            })?;
        drop(source);

        let snapshot = Connection::open(&partial_path)
            .map_err(|error| format!("cannot open generated snapshot: {error}"))?;
        snapshot
            .execute_batch("PRAGMA foreign_keys = ON;")
            .map_err(|error| format!("cannot enable seed foreign keys: {error}"))?;
        {
            let tx = snapshot
                .unchecked_transaction()
                .map_err(|error| error.to_string())?;
            tx.execute(
                "DELETE FROM v20_paper_memberships WHERE project_id <> ?1 OR snapshot_id <> ?2",
                params![project_id, snapshot_id],
            )
            .map_err(|error| error.to_string())?;
            tx.execute(
                "DELETE FROM v20_hotspots WHERE project_id <> ?1 OR snapshot_id <> ?2",
                params![project_id, snapshot_id],
            )
            .map_err(|error| error.to_string())?;
            tx.execute(
                "DELETE FROM v20_analysis_state WHERE project_id <> ?1 OR active_snapshot_id <> ?2",
                params![project_id, snapshot_id],
            )
            .map_err(|error| error.to_string())?;
            tx.execute(
                "DELETE FROM v20_analysis_snapshots WHERE project_id <> ?1 OR id <> ?2",
                params![project_id, snapshot_id],
            )
            .map_err(|error| error.to_string())?;
            tx.execute(
                "DELETE FROM papers WHERE project_id <> ?1",
                params![project_id],
            )
            .map_err(|error| error.to_string())?;
            clear_legacy_app17_rows(&tx)?;
            tx.commit().map_err(|error| error.to_string())?;
        }
        snapshot
            .execute_batch("PRAGMA wal_checkpoint(TRUNCATE); VACUUM;")
            .map_err(|error| format!("cannot compact generated seed: {error}"))?;
        drop(snapshot);

        let verified =
            research_hotspots_core::validate_library_candidate_file(&partial_path, &project_id)?;
        if verified.schema_version != research_hotspots_core::V20_SCHEMA_VERSION
            || verified.snapshot_id.as_deref() != Some(snapshot_id.as_str())
            || verified.paper_count != source_validation.paper_count
            || verified.hotspot_count != source_validation.hotspot_count
            || verified.membership_count != source_validation.membership_count
        {
            return Err(format!(
                "generated V20 snapshot mismatch: source={}/{}/{}, generated={}/{}/{}",
                source_validation.paper_count,
                source_validation.hotspot_count,
                source_validation.membership_count,
                verified.paper_count,
                verified.hotspot_count,
                verified.membership_count
            ));
        }

        let size_bytes = fs::metadata(&partial_path)
            .map_err(|error| format!("cannot inspect generated snapshot: {error}"))?
            .len();
        let sha256 = sha256_file(&partial_path)?;
        let generated_at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| format!("unix-ms:{}", duration.as_millis()))
            .unwrap_or_else(|_| "unix-ms:0".to_string());
        let manifest = DefaultLibraryManifest {
            manifest_schema_version: MANIFEST_SCHEMA_VERSION,
            generator_version: GENERATOR_VERSION.to_string(),
            database_schema_version: verified.schema_version,
            data_version,
            app_version: APP_VERSION.to_string(),
            database_file: DATABASE_FILE.to_string(),
            project_id: project_id.clone(),
            snapshot_id: snapshot_id.clone(),
            sha256,
            size_bytes,
            paper_count: verified.paper_count,
            hotspot_count: verified.hotspot_count,
            membership_count: verified.membership_count,
            generated_at,
        };
        let content = serde_json::to_string_pretty(&manifest)
            .map_err(|error| format!("cannot serialize manifest: {error}"))?;
        let mut file = File::create(&partial_manifest_path).map_err(|error| {
            format!(
                "cannot create manifest {:?}: {error}",
                partial_manifest_path
            )
        })?;
        file.write_all(content.as_bytes())
            .map_err(|error| format!("cannot write manifest: {error}"))?;
        file.write_all(b"\n")
            .map_err(|error| format!("cannot finalize manifest: {error}"))?;
        drop(file);

        replace_generated_file(&partial_path, &output_path)?;
        replace_generated_file(&partial_manifest_path, &manifest_path)?;
        println!(
            "seed snapshot ready: snapshot={} papers={} hotspots={} memberships={} bytes={} path={}",
            snapshot_id, verified.paper_count, verified.hotspot_count, verified.membership_count, size_bytes, output_path.display()
        );
        Ok(())
    })();
    if result.is_err() {
        cleanup_file(&partial_path);
        cleanup_file(&partial_manifest_path);
    }
    result
}

fn clear_legacy_app17_rows(conn: &Connection) -> Result<(), String> {
    for table in [
        "app17_hotspot_reviews",
        "app17_hotspots",
        "app17_paper_topics",
    ] {
        let exists: i64 = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1)",
                params![table],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        if exists != 0 {
            conn.execute(&format!("DELETE FROM {table}"), [])
                .map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

fn replace_generated_file(staged: &Path, destination: &Path) -> Result<(), String> {
    let previous = destination.with_extension(format!(
        "{}-previous",
        destination
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("file")
    ));
    cleanup_file(&previous);
    let had_destination = destination.exists();
    if had_destination {
        fs::rename(destination, &previous)
            .map_err(|error| format!("cannot preserve existing {:?}: {error}", destination))?;
    }
    if let Err(error) = fs::rename(staged, destination) {
        if had_destination {
            let _ = fs::rename(&previous, destination);
        }
        return Err(format!(
            "cannot activate generated file {:?}: {error}",
            destination
        ));
    }
    cleanup_file(&previous);
    Ok(())
}

fn cleanup_file(path: &Path) {
    if path.is_file() {
        let _ = fs::remove_file(path);
    }
}

fn required_arg(args: &[String], name: &str) -> Result<String, String> {
    optional_arg(args, name).ok_or_else(|| format!("missing required argument {name}"))
}

fn optional_arg(args: &[String], name: &str) -> Option<String> {
    args.iter()
        .position(|value| value == name)
        .and_then(|index| args.get(index + 1))
        .cloned()
}

fn sha256_file(path: &Path) -> Result<String, String> {
    let mut file = File::open(path).map_err(|error| format!("cannot read {:?}: {error}", path))?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0_u8; 1024 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|error| format!("cannot hash file: {error}"))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}
