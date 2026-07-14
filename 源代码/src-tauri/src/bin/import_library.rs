use research_hotspots_desktop_lib::import_paper_file_to_library_path;
use serde::Serialize;
use std::env;
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Default)]
struct Args {
    source: Option<PathBuf>,
    database_dir: Option<PathBuf>,
    project_id: Option<String>,
    output: Option<PathBuf>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ImportReport<T: Serialize> {
    generated_at: String,
    source_path: String,
    import: T,
}

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let args = parse_args()?;
    let source = args.source.ok_or_else(|| "Missing --source <file>.".to_string())?;
    let database_dir = args.database_dir.ok_or_else(|| "Missing --database-dir <dir>.".to_string())?;
    let source = source
        .canonicalize()
        .map_err(|error| format!("Cannot resolve source file {}: {error}", source.display()))?;
    if !source.is_file() {
        return Err(format!("Source path is not a file: {}", source.display()));
    }
    fs::create_dir_all(&database_dir)
        .map_err(|error| format!("Cannot create database dir {}: {error}", database_dir.display()))?;
    let database_dir = database_dir
        .canonicalize()
        .map_err(|error| format!("Cannot resolve database dir {}: {error}", database_dir.display()))?;

    let summary = import_paper_file_to_library_path(database_dir, args.project_id, source.clone())?;
    let report = ImportReport {
        generated_at: now_epoch_ms_string(),
        source_path: source.to_string_lossy().to_string(),
        import: summary,
    };
    let json = serde_json::to_string_pretty(&report).map_err(|error| error.to_string())?;
    if let Some(output) = args.output.as_ref() {
        if let Some(parent) = output.parent() {
            fs::create_dir_all(parent).map_err(|error| format!("Cannot create output dir {}: {error}", parent.display()))?;
        }
        fs::write(output, format!("{json}\n")).map_err(|error| format!("Cannot write {}: {error}", output.display()))?;
    }

    println!(
        "Library import completed: processed={}, inserted={}, updated={}, invalid={}, duplicates={}, elapsedMs={}",
        report.import.processed_rows,
        report.import.inserted,
        report.import.updated,
        report.import.invalid_rows,
        report.import.duplicate_rows,
        report.import.elapsed_ms
    );
    println!(
        "Recovery: safeToRerun={}, batchSize={}, strategy={}",
        report.import.recovery.safe_to_rerun,
        report.import.recovery.batch_size,
        report.import.recovery.strategy
    );
    println!("Database: {}", report.import.database_path);
    println!("Manifest: {}", report.import.manifest_path);
    if let Some(output) = args.output.as_ref() {
        println!("Report: {}", output.display());
    }
    Ok(())
}

fn parse_args() -> Result<Args, String> {
    let raw = env::args().skip(1).collect::<Vec<_>>();
    if raw.iter().any(|arg| arg == "--help" || arg == "-h") {
        print_help();
        std::process::exit(0);
    }

    let mut args = Args::default();
    let mut index = 0;
    while index < raw.len() {
        match raw[index].as_str() {
            "--" => {
                index += 1;
            }
            "--source" => {
                args.source = Some(PathBuf::from(value_after(&raw, index, "--source")?));
                index += 2;
            }
            "--database-dir" => {
                args.database_dir = Some(PathBuf::from(value_after(&raw, index, "--database-dir")?));
                index += 2;
            }
            "--project-id" => {
                args.project_id = Some(value_after(&raw, index, "--project-id")?);
                index += 2;
            }
            "--output" => {
                args.output = Some(PathBuf::from(value_after(&raw, index, "--output")?));
                index += 2;
            }
            value if value.starts_with("--") => return Err(format!("Unsupported argument: {value}")),
            value => {
                if args.source.is_none() {
                    args.source = Some(PathBuf::from(value));
                    index += 1;
                } else {
                    return Err(format!("Unexpected positional argument: {value}"));
                }
            }
        }
    }
    Ok(args)
}

fn value_after(raw: &[String], index: usize, name: &str) -> Result<String, String> {
    raw.get(index + 1)
        .cloned()
        .filter(|value| !value.starts_with("--"))
        .ok_or_else(|| format!("Missing value after {name}."))
}

fn print_help() {
    println!(
        r#"Usage:
  cargo run --manifest-path src-tauri/Cargo.toml --bin import_library -- --source D:\papers\library.jsonl --database-dir D:\ResearchHotspotsDesktop\library --output outputs\import_library.json

Options:
  --source <file>         CSV, JSON, JSONL, NDJSON, BibTeX, or RIS source file.
  --database-dir <dir>   Directory that will contain research-hotspots-v7.sqlite.
  --project-id <id>      Optional project id. Defaults to project-default.
  --output <file>        Optional JSON import report.

This tool uses the same Rust import normalization and SQLite upsert path as the desktop app."#
    );
}

fn now_epoch_ms_string() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis().to_string())
        .unwrap_or_else(|_| "0".to_string())
}
