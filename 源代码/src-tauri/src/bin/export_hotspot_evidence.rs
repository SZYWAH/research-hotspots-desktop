use research_hotspots_desktop_lib::{export_hotspot_evidence_from_database_path, HotspotEvidenceExportResult};
use serde::Serialize;
use std::env;
use std::fs;
use std::path::PathBuf;

const DATABASE_FILE: &str = "research-hotspots-v7.sqlite";

#[derive(Default)]
struct Args {
    database_dir: Option<PathBuf>,
    database_path: Option<PathBuf>,
    project_id: Option<String>,
    hotspot_id: Option<String>,
    output: Option<PathBuf>,
    markdown_output: Option<PathBuf>,
    max_papers: usize,
    min_representative_papers: usize,
    require_evolution: bool,
    require_source_distribution: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HotspotEvidenceReport {
    #[serde(flatten)]
    export: HotspotEvidenceExportResult,
    strict_gate: StrictGate,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StrictGate {
    enabled: bool,
    passed: bool,
    checks: Vec<GateCheck>,
    failures: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GateCheck {
    name: String,
    expected: String,
    actual: String,
    passed: bool,
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
    let export = export_hotspot_evidence_from_database_path(database_path, args.project_id.clone(), args.hotspot_id.clone(), args.max_papers)?;
    let strict_gate = build_gate(&args, &export);

    if let Some(markdown_output) = args.markdown_output.as_ref() {
        if let Some(parent) = markdown_output.parent() {
            fs::create_dir_all(parent).map_err(|error| format!("Cannot create markdown output dir {}: {error}", parent.display()))?;
        }
        fs::write(markdown_output, format!("{}\n", export.evidence_profile_markdown)).map_err(|error| format!("Cannot write {}: {error}", markdown_output.display()))?;
    }

    let report = HotspotEvidenceReport { export, strict_gate };
    let json = serde_json::to_string_pretty(&report).map_err(|error| error.to_string())?;
    if let Some(output) = args.output.as_ref() {
        if let Some(parent) = output.parent() {
            fs::create_dir_all(parent).map_err(|error| format!("Cannot create output dir {}: {error}", parent.display()))?;
        }
        fs::write(output, format!("{json}\n")).map_err(|error| format!("Cannot write {}: {error}", output.display()))?;
    }

    println!(
        "Hotspot evidence export completed: hotspot={}, papers={}, missing={}, gate={}",
        report.export.selected_hotspot_id,
        report.export.representative_papers.len(),
        report.export.missing_representative_ids.len(),
        report.strict_gate.passed
    );
    if let Some(output) = args.output.as_ref() {
        println!("Report: {}", output.display());
    }
    if let Some(markdown_output) = args.markdown_output.as_ref() {
        println!("Markdown: {}", markdown_output.display());
    }
    if report.strict_gate.enabled && !report.strict_gate.passed {
        eprintln!("Strict gate failed:");
        for failure in report.strict_gate.failures {
            eprintln!("- {failure}");
        }
        std::process::exit(1);
    }
    Ok(())
}

fn parse_args() -> Result<Args, String> {
    let raw = env::args().skip(1).collect::<Vec<_>>();
    if raw.iter().any(|arg| arg == "--help" || arg == "-h") {
        print_help();
        std::process::exit(0);
    }
    let mut args = Args {
        max_papers: 12,
        min_representative_papers: 3,
        require_evolution: false,
        require_source_distribution: false,
        ..Args::default()
    };
    let mut index = 0;
    while index < raw.len() {
        match raw[index].as_str() {
            "--" => {
                index += 1;
            }
            "--database-dir" => {
                args.database_dir = Some(PathBuf::from(value_after(&raw, index, "--database-dir")?));
                index += 2;
            }
            "--database-path" => {
                args.database_path = Some(PathBuf::from(value_after(&raw, index, "--database-path")?));
                index += 2;
            }
            "--project-id" => {
                args.project_id = Some(value_after(&raw, index, "--project-id")?);
                index += 2;
            }
            "--hotspot-id" => {
                args.hotspot_id = Some(value_after(&raw, index, "--hotspot-id")?);
                index += 2;
            }
            "--output" => {
                args.output = Some(PathBuf::from(value_after(&raw, index, "--output")?));
                index += 2;
            }
            "--markdown-output" => {
                args.markdown_output = Some(PathBuf::from(value_after(&raw, index, "--markdown-output")?));
                index += 2;
            }
            "--max-papers" => {
                args.max_papers = parse_positive_usize(&value_after(&raw, index, "--max-papers")?, "--max-papers")?;
                index += 2;
            }
            "--min-representative-papers" => {
                args.min_representative_papers = parse_positive_usize(&value_after(&raw, index, "--min-representative-papers")?, "--min-representative-papers")?;
                index += 2;
            }
            "--require-evolution" => {
                args.require_evolution = true;
                index += 1;
            }
            "--require-source-distribution" => {
                args.require_source_distribution = true;
                index += 1;
            }
            value if value.starts_with("--") => return Err(format!("Unsupported argument: {value}")),
            value => {
                if args.database_path.is_none() && args.database_dir.is_none() {
                    args.database_path = Some(PathBuf::from(value));
                    index += 1;
                } else {
                    return Err(format!("Unexpected positional argument: {value}"));
                }
            }
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
    if let Some(path) = args.database_path.as_ref() {
        return path.canonicalize().map_err(|error| format!("Cannot resolve database path {}: {error}", path.display()));
    }
    let path = args.database_dir.as_ref().expect("database_dir checked").join(DATABASE_FILE);
    path.canonicalize().map_err(|error| format!("Cannot resolve database path {}: {error}", path.display()))
}

fn build_gate(args: &Args, export: &HotspotEvidenceExportResult) -> StrictGate {
    let mut checks = vec![
        GateCheck {
            name: "minRepresentativePapers".to_string(),
            expected: args.min_representative_papers.to_string(),
            actual: export.representative_papers.len().to_string(),
            passed: export.representative_papers.len() >= args.min_representative_papers,
        },
        GateCheck {
            name: "missingRepresentativeIds".to_string(),
            expected: "0".to_string(),
            actual: export.missing_representative_ids.len().to_string(),
            passed: export.missing_representative_ids.is_empty(),
        },
        GateCheck {
            name: "hotspotKeywords".to_string(),
            expected: "at least 3".to_string(),
            actual: export.hotspot_keywords.len().to_string(),
            passed: export.hotspot_keywords.len() >= 3,
        },
    ];
    if args.require_evolution {
        checks.push(GateCheck {
            name: "requireEvolution".to_string(),
            expected: "present".to_string(),
            actual: export.year_evolution.len().to_string(),
            passed: !export.year_evolution.is_empty(),
        });
    }
    if args.require_source_distribution {
        checks.push(GateCheck {
            name: "requireSourceDistribution".to_string(),
            expected: "present".to_string(),
            actual: export.source_distribution.len().to_string(),
            passed: !export.source_distribution.is_empty(),
        });
    }
    let failures = checks
        .iter()
        .filter(|check| !check.passed)
        .map(|check| format!("{} expected {}, actual {}.", check.name, check.expected, check.actual))
        .collect::<Vec<_>>();
    StrictGate {
        enabled: true,
        passed: failures.is_empty(),
        checks,
        failures,
    }
}

fn value_after(raw: &[String], index: usize, name: &str) -> Result<String, String> {
    raw.get(index + 1)
        .cloned()
        .filter(|value| !value.starts_with("--"))
        .ok_or_else(|| format!("Missing value after {name}."))
}

fn parse_positive_usize(value: &str, name: &str) -> Result<usize, String> {
    let parsed = value.parse::<usize>().map_err(|_| format!("{name} must be a positive integer."))?;
    if parsed == 0 {
        return Err(format!("{name} must be a positive integer."));
    }
    Ok(parsed)
}

fn print_help() {
    println!(
        r#"Usage:
  cargo run --manifest-path src-tauri/Cargo.toml --bin export_hotspot_evidence -- --database-dir D:\ResearchHotspotsDesktop\library --output outputs\v20_hotspot_evidence_final.json --markdown-output outputs\v20_hotspot_evidence_final.md

Options:
  --database-dir <dir>                  Directory containing research-hotspots-v7.sqlite.
  --database-path <file>                Direct path to a SQLite database.
  --project-id <id>                     Project id. Defaults to project-default.
  --hotspot-id <id>                     Optional hotspot id. Defaults to the highest-weight generated hotspot.
  --output <file>                       JSON output path.
  --markdown-output <file>              Optional Markdown evidence bundle.
  --max-papers <n>                      Representative paper cap. Defaults to 12.
  --min-representative-papers <n>       Minimum representative paper count. Defaults to 3.
  --require-evolution                   Require yearly evolution signal.
  --require-source-distribution         Require source distribution signal.

This tool exports the paper evidence bundle behind a generated SQLite hotspot for report-generation traceability."#
    );
}
