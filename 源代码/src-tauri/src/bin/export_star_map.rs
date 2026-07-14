use research_hotspots_desktop_lib::{export_star_map_from_database_path, StarMapExportResult};
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
    output: Option<PathBuf>,
    min_hotspots: i64,
    min_evidence_ids: usize,
    min_links: usize,
    min_evidence_coverage: f64,
    min_evolution_coverage: f64,
    min_source_distribution_coverage: f64,
    reject_sample_signals: bool,
    require_evolution: bool,
    require_source_distribution: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportStarMapReport {
    #[serde(flatten)]
    export: StarMapExportResult,
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
    let export = export_star_map_from_database_path(database_path, args.project_id.clone())?;
    let strict_gate = build_gate(&args, &export);
    let report = ExportStarMapReport { export, strict_gate };
    let json = serde_json::to_string_pretty(&report).map_err(|error| error.to_string())?;

    if let Some(output) = args.output.as_ref() {
        if let Some(parent) = output.parent() {
            fs::create_dir_all(parent).map_err(|error| format!("Cannot create output dir {}: {error}", parent.display()))?;
        }
        fs::write(output, format!("{json}\n")).map_err(|error| format!("Cannot write {}: {error}", output.display()))?;
    }

    println!(
        "Star-map export completed: papers={}, hotspots={}, evidenceIds={}, links={}, gate={}",
        report.export.paper_count,
        report.export.hotspot_count,
        report.export.evidence_id_count,
        report.export.semantic_link_count,
        report.strict_gate.passed
    );
    if let Some(output) = args.output.as_ref() {
        println!("Report: {}", output.display());
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
        min_hotspots: 10,
        min_evidence_ids: 10,
        min_links: 1,
        min_evidence_coverage: 0.0,
        min_evolution_coverage: 0.0,
        min_source_distribution_coverage: 0.0,
        reject_sample_signals: false,
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
            "--output" => {
                args.output = Some(PathBuf::from(value_after(&raw, index, "--output")?));
                index += 2;
            }
            "--min-hotspots" => {
                args.min_hotspots = parse_positive_i64(&value_after(&raw, index, "--min-hotspots")?, "--min-hotspots")?;
                index += 2;
            }
            "--min-evidence-ids" => {
                args.min_evidence_ids = parse_positive_usize(&value_after(&raw, index, "--min-evidence-ids")?, "--min-evidence-ids")?;
                index += 2;
            }
            "--min-links" => {
                args.min_links = parse_non_negative_usize(&value_after(&raw, index, "--min-links")?, "--min-links")?;
                index += 2;
            }
            "--min-evidence-coverage" => {
                args.min_evidence_coverage = parse_rate(&value_after(&raw, index, "--min-evidence-coverage")?, "--min-evidence-coverage")?;
                index += 2;
            }
            "--min-evolution-coverage" => {
                args.min_evolution_coverage = parse_rate(&value_after(&raw, index, "--min-evolution-coverage")?, "--min-evolution-coverage")?;
                index += 2;
            }
            "--min-source-distribution-coverage" => {
                args.min_source_distribution_coverage = parse_rate(&value_after(&raw, index, "--min-source-distribution-coverage")?, "--min-source-distribution-coverage")?;
                index += 2;
            }
            "--reject-sample-signals" => {
                args.reject_sample_signals = true;
                index += 1;
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
        return path
            .canonicalize()
            .map_err(|error| format!("Cannot resolve database path {}: {error}", path.display()));
    }
    let dir = args.database_dir.as_ref().expect("database_dir checked");
    let path = dir.join(DATABASE_FILE);
    path.canonicalize()
        .map_err(|error| format!("Cannot resolve database path {}: {error}", path.display()))
}

fn build_gate(args: &Args, export: &StarMapExportResult) -> StrictGate {
    let mut checks = vec![
        GateCheck {
            name: "minHotspots".to_string(),
            expected: args.min_hotspots.to_string(),
            actual: export.hotspot_count.to_string(),
            passed: export.hotspot_count >= args.min_hotspots,
        },
        GateCheck {
            name: "minEvidenceIds".to_string(),
            expected: args.min_evidence_ids.to_string(),
            actual: export.evidence_id_count.to_string(),
            passed: export.evidence_id_count >= args.min_evidence_ids,
        },
        GateCheck {
            name: "minSemanticLinks".to_string(),
            expected: args.min_links.to_string(),
            actual: export.semantic_link_count.to_string(),
            passed: export.semantic_link_count >= args.min_links,
        },
        GateCheck {
            name: "coordinateSpread".to_string(),
            expected: "non-zero x/y spread".to_string(),
            actual: format!("x={}, y={}, z={}", export.coordinate_spread.x, export.coordinate_spread.y, export.coordinate_spread.z),
            passed: export.coordinate_spread.x > 0 || export.coordinate_spread.y > 0,
        },
        GateCheck {
            name: "evidenceCoverage".to_string(),
            expected: format!(">= {:.2}", args.min_evidence_coverage),
            actual: format!("{:.4}", export.evidence_profile.evidence_coverage),
            passed: export.evidence_profile.evidence_coverage >= args.min_evidence_coverage,
        },
        GateCheck {
            name: "evolutionCoverage".to_string(),
            expected: format!(">= {:.2}", args.min_evolution_coverage),
            actual: format!("{:.4}", export.evidence_profile.evolution_coverage),
            passed: export.evidence_profile.evolution_coverage >= args.min_evolution_coverage,
        },
        GateCheck {
            name: "sourceDistributionCoverage".to_string(),
            expected: format!(">= {:.2}", args.min_source_distribution_coverage),
            actual: format!("{:.4}", export.evidence_profile.source_distribution_coverage),
            passed: export.evidence_profile.source_distribution_coverage >= args.min_source_distribution_coverage,
        },
    ];
    if args.reject_sample_signals {
        checks.push(GateCheck {
            name: "rejectSampleSignals".to_string(),
            expected: "0 sample-like evidence ids".to_string(),
            actual: export.evidence_profile.sample_signal_count.to_string(),
            passed: export.evidence_profile.sample_signal_count == 0,
        });
    }
    if args.require_evolution {
        checks.push(GateCheck {
            name: "requireEvolution".to_string(),
            expected: format!("{} hotspots with evolution", args.min_hotspots.min(export.hotspot_count)),
            actual: export.hotspots_with_evolution.to_string(),
            passed: export.hotspots_with_evolution as i64 >= args.min_hotspots.min(export.hotspot_count),
        });
    }
    if args.require_source_distribution {
        checks.push(GateCheck {
            name: "requireSourceDistribution".to_string(),
            expected: format!("{} hotspots with source distribution", args.min_hotspots.min(export.hotspot_count)),
            actual: export.hotspots_with_source_distribution.to_string(),
            passed: export.hotspots_with_source_distribution as i64 >= args.min_hotspots.min(export.hotspot_count),
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

fn parse_positive_i64(value: &str, name: &str) -> Result<i64, String> {
    let parsed = value.parse::<i64>().map_err(|_| format!("{name} must be a positive integer."))?;
    if parsed <= 0 {
        return Err(format!("{name} must be a positive integer."));
    }
    Ok(parsed)
}

fn parse_positive_usize(value: &str, name: &str) -> Result<usize, String> {
    let parsed = value.parse::<usize>().map_err(|_| format!("{name} must be a positive integer."))?;
    if parsed == 0 {
        return Err(format!("{name} must be a positive integer."));
    }
    Ok(parsed)
}

fn parse_non_negative_usize(value: &str, name: &str) -> Result<usize, String> {
    value.parse::<usize>().map_err(|_| format!("{name} must be a non-negative integer."))
}

fn parse_rate(value: &str, name: &str) -> Result<f64, String> {
    let parsed = value.parse::<f64>().map_err(|_| format!("{name} must be a number between 0 and 1."))?;
    if !(0.0..=1.0).contains(&parsed) {
        return Err(format!("{name} must be a number between 0 and 1."));
    }
    Ok(parsed)
}

fn print_help() {
    println!(
        r#"Usage:
  cargo run --manifest-path src-tauri/Cargo.toml --bin export_star_map -- --database-dir D:\ResearchHotspotsDesktop\library --output outputs\v20_star_map_export_final.json

Options:
  --database-dir <dir>                Directory containing research-hotspots-v7.sqlite.
  --database-path <file>              Direct path to a SQLite database.
  --project-id <id>                   Project id. Defaults to project-default.
  --output <file>                     JSON output path.
  --min-hotspots <n>                  Minimum hotspot count. Defaults to 10.
  --min-evidence-ids <n>              Minimum unique evidence paper ids. Defaults to 10.
  --min-links <n>                     Minimum semantic relation count. Defaults to 1.
  --min-evidence-coverage <0..1>       Minimum share of hotspots with evidence ids.
  --min-evolution-coverage <0..1>      Minimum share of hotspots with yearly evolution.
  --min-source-distribution-coverage <0..1>
                                      Minimum share of hotspots with source distribution.
  --reject-sample-signals              Fail if sample-like evidence ids are detected.
  --require-evolution                 Require hotspot yearly evolution signal.
  --require-source-distribution       Require source distribution signal.

This tool exports the same SQLite hotspot shape consumed by the star-map UI and audits whether it has enough semantic evidence for real-data star-map verification."#
    );
}
