use research_hotspots_desktop_lib::export_app17_visual_review_snapshot;
use std::env;
use std::path::PathBuf;

const DATABASE_FILE: &str = "research-hotspots-v7.sqlite";

#[derive(Default)]
struct Args {
    database_dir: Option<PathBuf>,
    database_path: Option<PathBuf>,
    project_id: Option<String>,
    output_dir: Option<PathBuf>,
    coordinate_override: Option<PathBuf>,
}

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let args = parse_args()?;
    let database_path = resolve_database_path(&args)?;
    let output_dir = args
        .output_dir
        .ok_or_else(|| "Missing --output-dir <dir>.".to_string())?;
    let result = export_app17_visual_review_snapshot(
        database_path,
        args.project_id,
        output_dir,
        args.coordinate_override,
    )?;
    println!(
        "V20 semantic visual review snapshot completed: papers={}, hotspots={}, topics={}",
        result.paper_count, result.hotspot_count, result.topic_count
    );
    println!(
        "Agent background snapshot: papers={}, bytes={}",
        result.agent_background_paper_count, result.agent_background_size_bytes
    );
    println!("Database: {}", result.database_path);
    println!("Snapshot: {}", result.output_dir);
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
            "--" => index += 1,
            "--database-dir" => {
                args.database_dir =
                    Some(PathBuf::from(value_after(&raw, index, "--database-dir")?));
                index += 2;
            }
            "--database-path" => {
                args.database_path =
                    Some(PathBuf::from(value_after(&raw, index, "--database-path")?));
                index += 2;
            }
            "--project-id" => {
                args.project_id = Some(value_after(&raw, index, "--project-id")?);
                index += 2;
            }
            "--output-dir" => {
                args.output_dir = Some(PathBuf::from(value_after(&raw, index, "--output-dir")?));
                index += 2;
            }
            "--coordinate-override" => {
                args.coordinate_override = Some(PathBuf::from(value_after(
                    &raw,
                    index,
                    "--coordinate-override",
                )?));
                index += 2;
            }
            value if value.starts_with("--") => {
                return Err(format!("Unsupported argument: {value}"))
            }
            value => return Err(format!("Unexpected positional argument: {value}")),
        }
    }
    if args.database_dir.is_some() && args.database_path.is_some() {
        return Err("Use either --database-dir or --database-path, not both.".to_string());
    }
    if args.database_dir.is_none() && args.database_path.is_none() {
        return Err("Missing --database-dir <dir> or --database-path <file>.".to_string());
    }
    Ok(args)
}

fn resolve_database_path(args: &Args) -> Result<PathBuf, String> {
    let path = args
        .database_path
        .clone()
        .or_else(|| {
            args.database_dir
                .as_ref()
                .map(|dir| dir.join(DATABASE_FILE))
        })
        .expect("database path checked");
    path.canonicalize()
        .map_err(|error| format!("Cannot resolve database path {}: {error}", path.display()))
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
  cargo run --manifest-path src-tauri/Cargo.toml --bin export_app17_visual_review -- --database-dir D:\ResearchHotspotsDesktop\library --output-dir .visual-review\app17

Options:
  --database-dir <dir>   Directory containing research-hotspots-v7.sqlite.
  --database-path <file> Direct path to research-hotspots-v7.sqlite.
  --project-id <id>      Project id. Defaults to project-default.
  --output-dir <dir>     Snapshot output directory.
  --coordinate-override <file>
                         Development-only paper/hotspot XYZ override JSON. Exact IDs and
                         memberships are validated before any output is written.

The SQLite database is opened read-only. This command never connects to MySQL or writes task logs."#
    );
}
