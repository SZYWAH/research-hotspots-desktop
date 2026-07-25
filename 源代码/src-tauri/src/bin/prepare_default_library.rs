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
const MANIFEST_SCHEMA_VERSION: i64 = 5;
const GENERATOR_VERSION: &str = "semantic-seed-5";

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
    library_revision: i64,
    algorithm_version: String,
    paper_layout_version: String,
    projection_version: String,
    embedding_model_id: String,
    embedding_model_revision: String,
    embedding_dimensions: usize,
    embedding_encoding: String,
    embedding_count: i64,
    hotspot_identity_version: String,
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
    if !(research_hotspots_core::MIN_SUPPORTED_LIBRARY_SCHEMA_VERSION
        ..=research_hotspots_core::LIBRARY_SCHEMA_VERSION)
        .contains(&source_validation.schema_version)
    {
        return Err(format!(
            "source schema must be between {} and {}, got {}",
            research_hotspots_core::MIN_SUPPORTED_LIBRARY_SCHEMA_VERSION,
            research_hotspots_core::LIBRARY_SCHEMA_VERSION,
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

        research_hotspots_core::agent_store::migrate_library_file(
            &partial_path,
            &project_id,
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|duration| duration.as_millis().min(i64::MAX as u128) as i64)
                .unwrap_or(0),
            false,
        )?;

        let snapshot = Connection::open(&partial_path)
            .map_err(|error| format!("cannot open generated snapshot: {error}"))?;
        snapshot
            .execute_batch("PRAGMA foreign_keys = OFF;")
            .map_err(|error| format!("cannot prepare seed pruning: {error}"))?;
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
            tx.execute("DELETE FROM v20_hotspot_lineage", [])
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
            prune_semantic_embedding_cache(&tx, &project_id)?;
            clear_legacy_app17_rows(&tx)?;
            clear_agent_runtime_rows(&tx)?;
            tx.commit().map_err(|error| error.to_string())?;
        }
        snapshot
            .execute_batch("PRAGMA foreign_keys = ON;")
            .map_err(|error| format!("cannot enable seed foreign keys: {error}"))?;
        let library_revision = research_hotspots_core::current_library_revision(
            &snapshot,
            &project_id,
        )?;
        let (
            algorithm_version,
            paper_layout_version,
            projection_version,
            embedding_model_id,
            embedding_model_revision,
            hotspot_identity_version,
        ): (String, String, String, String, String, String) = snapshot
            .query_row(
                "SELECT algorithm_version,layout_version,projection_version,
                        embedding_model_id,embedding_model_revision,hotspot_identity_version
                 FROM v20_analysis_snapshots WHERE id=?1 AND project_id=?2",
                params![snapshot_id, project_id],
                |row| Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                )),
            )
            .map_err(|error| format!("cannot read active semantic algorithm: {error}"))?;
        if algorithm_version != research_hotspots_core::V20_ALGORITHM_VERSION
            || paper_layout_version
                != research_hotspots_core::semantic_layout::SEMANTIC_LAYOUT_VERSION
            || projection_version
                != research_hotspots_core::semantic_layout::SEMANTIC_PROJECTION_VERSION
            || embedding_model_id
                != research_hotspots_core::semantic_layout::SEMANTIC_MODEL_ID
            || embedding_model_revision
                != research_hotspots_core::semantic_layout::SEMANTIC_MODEL_REVISION
            || hotspot_identity_version != research_hotspots_core::HOTSPOT_IDENTITY_VERSION
        {
            return Err(format!(
                "active snapshot metadata is incompatible: {algorithm_version}/{paper_layout_version}/{projection_version}/{hotspot_identity_version}, expected {}/{}/{}/{}",
                research_hotspots_core::V20_ALGORITHM_VERSION
                ,
                research_hotspots_core::semantic_layout::SEMANTIC_LAYOUT_VERSION,
                research_hotspots_core::semantic_layout::SEMANTIC_PROJECTION_VERSION,
                research_hotspots_core::HOTSPOT_IDENTITY_VERSION,
            ));
        }
        let embedding_count: i64 = snapshot
            .query_row(
                "SELECT COUNT(*) FROM paper_semantic_embeddings
                 WHERE project_id=?1 AND model_id=?2 AND model_revision=?3
                   AND dimensions=?4 AND encoding='float16-le'",
                params![
                    project_id,
                    research_hotspots_core::semantic_layout::SEMANTIC_MODEL_ID,
                    research_hotspots_core::semantic_layout::SEMANTIC_MODEL_REVISION,
                    research_hotspots_core::semantic_layout::SEMANTIC_EMBEDDING_DIMENSIONS as i64,
                ],
                |row| row.get(0),
            )
            .map_err(|error| format!("cannot count semantic embeddings: {error}"))?;
        snapshot
            .execute_batch("PRAGMA wal_checkpoint(TRUNCATE); VACUUM;")
            .map_err(|error| format!("cannot compact generated seed: {error}"))?;
        drop(snapshot);

        let verified =
            research_hotspots_core::validate_library_candidate_file(&partial_path, &project_id)?;
        if verified.schema_version != research_hotspots_core::LIBRARY_SCHEMA_VERSION
            || verified.snapshot_id.as_deref() != Some(snapshot_id.as_str())
            || verified.paper_count != source_validation.paper_count
            || verified.hotspot_count != source_validation.hotspot_count
            || verified.membership_count != source_validation.membership_count
            || embedding_count != verified.paper_count
        {
            return Err(format!(
                "generated semantic snapshot mismatch: source={}/{}/{}, generated={}/{}/{}, embeddings={}",
                source_validation.paper_count,
                source_validation.hotspot_count,
                source_validation.membership_count,
                verified.paper_count,
                verified.hotspot_count,
                verified.membership_count,
                embedding_count,
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
            library_revision,
            algorithm_version,
            paper_layout_version,
            projection_version,
            embedding_model_id,
            embedding_model_revision,
            embedding_dimensions:
                research_hotspots_core::semantic_layout::SEMANTIC_EMBEDDING_DIMENSIONS,
            embedding_encoding: "float16-le".to_string(),
            embedding_count,
            hotspot_identity_version,
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
            "semantic seed ready: snapshot={} papers={} hotspots={} memberships={} embeddings={} bytes={} path={}",
            snapshot_id, verified.paper_count, verified.hotspot_count, verified.membership_count, embedding_count, size_bytes, output_path.display()
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

fn prune_semantic_embedding_cache(conn: &Connection, project_id: &str) -> Result<(), String> {
    use research_hotspots_core::semantic_layout::{
        semantic_content_sha256, SemanticPaperDocument, SEMANTIC_EMBEDDING_DIMENSIONS,
        SEMANTIC_MODEL_ID, SEMANTIC_MODEL_REVISION,
    };

    conn.execute_batch(
        "DROP TABLE IF EXISTS temp.seed_semantic_embedding_keep;
         CREATE TEMP TABLE seed_semantic_embedding_keep(
           paper_id TEXT PRIMARY KEY,
           content_sha256 TEXT NOT NULL
         ) WITHOUT ROWID;",
    )
    .map_err(|error| format!("cannot prepare semantic seed cache filter: {error}"))?;
    let mut read = conn
        .prepare(
            "SELECT id,title,field,categories,abstract
             FROM papers WHERE project_id=?1 ORDER BY id",
        )
        .map_err(|error| error.to_string())?;
    let documents = read
        .query_map(params![project_id], |row| {
            Ok(SemanticPaperDocument {
                paper_id: row.get(0)?,
                title: row.get(1)?,
                field: row.get(2)?,
                categories: row.get(3)?,
                abstract_text: row.get(4)?,
            })
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    drop(read);
    {
        let mut insert = conn
            .prepare(
                "INSERT INTO seed_semantic_embedding_keep(paper_id,content_sha256)
                 VALUES(?1,?2)",
            )
            .map_err(|error| error.to_string())?;
        for document in &documents {
            insert
                .execute(params![
                    document.paper_id,
                    semantic_content_sha256(document)
                ])
                .map_err(|error| error.to_string())?;
        }
    }
    conn.execute(
        "DELETE FROM paper_semantic_embeddings
         WHERE project_id<>?1 OR model_id<>?2 OR model_revision<>?3
           OR dimensions<>?4 OR encoding<>'float16-le'
           OR NOT EXISTS(
             SELECT 1 FROM seed_semantic_embedding_keep keep
             WHERE keep.paper_id=paper_semantic_embeddings.paper_id
               AND keep.content_sha256=paper_semantic_embeddings.content_sha256
           )",
        params![
            project_id,
            SEMANTIC_MODEL_ID,
            SEMANTIC_MODEL_REVISION,
            SEMANTIC_EMBEDDING_DIMENSIONS as i64,
        ],
    )
    .map_err(|error| format!("cannot prune stale semantic embeddings: {error}"))?;
    conn.execute_batch("DROP TABLE temp.seed_semantic_embedding_keep;")
        .map_err(|error| format!("cannot finalize semantic seed cache filter: {error}"))?;
    Ok(())
}

fn clear_agent_runtime_rows(conn: &Connection) -> Result<(), String> {
    let mut statement = conn
        .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE 'agent_%' OR name='library_operation_leases') ORDER BY name",
        )
        .map_err(|error| error.to_string())?;
    let tables = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    drop(statement);
    for table in tables {
        if !table
            .bytes()
            .all(|value| value.is_ascii_alphanumeric() || value == b'_')
        {
            return Err("unsafe Agent table name in seed source".to_string());
        }
        conn.execute(&format!("DELETE FROM {table}"), [])
            .map_err(|error| format!("cannot clear {table} from seed: {error}"))?;
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
