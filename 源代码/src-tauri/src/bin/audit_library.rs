use rusqlite::{params, Connection, OpenFlags};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

const DATABASE_FILE: &str = "research-hotspots-v7.sqlite";
const DEFAULT_PROJECT_ID: &str = "project-default";
const DEFAULT_ABSTRACT_EN: &str = "Local imported paper without abstract.";
const DEFAULT_ABSTRACT_ZH: &str = "本地导入文献，暂无摘要。";
const REQUIRED_INDEXES: &[&str] = &[
    "idx_papers_project_year",
    "idx_papers_project_source",
    "idx_papers_project_field",
    "idx_papers_project_updated",
    "idx_papers_project_doi",
    "idx_papers_project_source_year",
    "idx_papers_project_field_year",
    "idx_papers_project_source_field_year",
];

#[derive(Default)]
struct Args {
    database_dir: Option<PathBuf>,
    database_path: Option<PathBuf>,
    project_id: String,
    output: Option<PathBuf>,
    min_rows: Option<i64>,
    max_missing_abstract_rate: Option<f64>,
    max_missing_year_rate: Option<f64>,
    max_query_ms: Option<u128>,
    min_clusters: Option<usize>,
    require_indexes: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AuditResult {
    generated_at: String,
    database_path: String,
    project_id: String,
    size_bytes: u64,
    wal_bytes: u64,
    shm_bytes: u64,
    paper_count: i64,
    missing_abstract_count: i64,
    missing_abstract_rate: f64,
    missing_year_count: i64,
    missing_year_rate: f64,
    missing_doi_and_url_count: i64,
    duplicate_doi_risk_count: i64,
    duplicate_url_risk_count: i64,
    duplicate_title_risk_count: i64,
    source_count: usize,
    field_count: usize,
    year_count: usize,
    year_range: Option<String>,
    source_distribution: Vec<Facet>,
    field_distribution: Vec<Facet>,
    year_distribution: Vec<Facet>,
    required_indexes: Vec<IndexStatus>,
    missing_indexes: Vec<String>,
    query_smoke: QuerySmoke,
    cluster_smoke: ClusterSmoke,
    strict_gate: StrictGate,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Facet {
    value: String,
    count: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct IndexStatus {
    name: String,
    present: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct QuerySmoke {
    elapsed_ms: u128,
    result_count: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ClusterSmoke {
    elapsed_ms: u128,
    candidate_cluster_count: usize,
    visible_hotspot_count: usize,
    sample_hotspots: Vec<SampleHotspot>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SampleHotspot {
    field: String,
    keyword: String,
    paper_count: i64,
    representative_ids: Vec<String>,
    year_range: Option<String>,
    source_count: usize,
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

#[derive(Default)]
struct ClusterGroup {
    field: String,
    keyword: String,
    paper_count: i64,
    representative_ids: Vec<String>,
    years: HashMap<i64, i64>,
    sources: HashSet<String>,
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
    if !database_path.exists() || !database_path.is_file() {
        return Err(format!("SQLite database does not exist: {}", database_path.display()));
    }

    let conn = Connection::open_with_flags(
        &database_path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|error| format!("Cannot open SQLite database {}: {error}", database_path.display()))?;

    ensure_papers_table(&conn)?;

    let started_query = Instant::now();
    let query_count = conn
        .query_row(
            "SELECT COUNT(*) FROM papers WHERE project_id = ?1 AND search_blob LIKE ?2",
            params![args.project_id, "%research%"],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|error| error.to_string())?;
    let query_ms = started_query.elapsed().as_millis();

    let paper_count = count_project_rows(&conn, &args.project_id)?;
    let missing_abstract_count = count_missing_abstracts(&conn, &args.project_id)?;
    let missing_year_count = count_where(&conn, &args.project_id, "year IS NULL")?;
    let missing_doi_and_url_count = count_where(
        &conn,
        &args.project_id,
        "(doi IS NULL OR TRIM(doi) = '') AND (url IS NULL OR TRIM(url) = '')",
    )?;
    let duplicate_doi_risk_count = duplicate_risk_count(&conn, &args.project_id, "doi")?;
    let duplicate_url_risk_count = duplicate_risk_count(&conn, &args.project_id, "url")?;
    let duplicate_title_risk_count = duplicate_risk_count(&conn, &args.project_id, "LOWER(TRIM(title))")?;
    let sources = facet(&conn, &args.project_id, "source", 20)?;
    let fields = facet(&conn, &args.project_id, "field", 80)?;
    let years = facet(&conn, &args.project_id, "CAST(year AS TEXT)", 80)?;
    let year_range = year_range(&conn, &args.project_id)?;
    let (required_indexes, missing_indexes) = index_status(&conn)?;
    let cluster_smoke = cluster_smoke(&conn, &args.project_id)?;

    let size_bytes = file_size(&database_path);
    let wal_bytes = file_size(PathBuf::from(format!("{}-wal", database_path.to_string_lossy())).as_path());
    let shm_bytes = file_size(PathBuf::from(format!("{}-shm", database_path.to_string_lossy())).as_path());

    let strict_gate = build_gate(&args, GateInputs {
        paper_count,
        missing_abstract_rate: rate(missing_abstract_count, paper_count),
        missing_year_rate: rate(missing_year_count, paper_count),
        query_ms,
        cluster_count: cluster_smoke.visible_hotspot_count,
        missing_indexes: &missing_indexes,
    });

    let result = AuditResult {
        generated_at: now_iso_like(),
        database_path: database_path.to_string_lossy().to_string(),
        project_id: args.project_id.clone(),
        size_bytes,
        wal_bytes,
        shm_bytes,
        paper_count,
        missing_abstract_count,
        missing_abstract_rate: rate(missing_abstract_count, paper_count),
        missing_year_count,
        missing_year_rate: rate(missing_year_count, paper_count),
        missing_doi_and_url_count,
        duplicate_doi_risk_count,
        duplicate_url_risk_count,
        duplicate_title_risk_count,
        source_count: sources.len(),
        field_count: fields.len(),
        year_count: years.len(),
        year_range,
        source_distribution: sources,
        field_distribution: fields,
        year_distribution: years,
        required_indexes,
        missing_indexes,
        query_smoke: QuerySmoke {
            elapsed_ms: query_ms,
            result_count: query_count,
        },
        cluster_smoke,
        strict_gate,
    };

    let json = serde_json::to_string_pretty(&result).map_err(|error| error.to_string())?;
    if let Some(output) = args.output.as_ref() {
        if let Some(parent) = output.parent() {
            fs::create_dir_all(parent).map_err(|error| format!("Cannot create output dir {}: {error}", parent.display()))?;
        }
        fs::write(output, format!("{json}\n")).map_err(|error| format!("Cannot write {}: {error}", output.display()))?;
    }

    println!(
        "SQLite library audit completed: rows={}, queryMs={}, hotspots={}, gate={}",
        result.paper_count,
        result.query_smoke.elapsed_ms,
        result.cluster_smoke.visible_hotspot_count,
        result.strict_gate.passed
    );
    if let Some(output) = args.output.as_ref() {
        println!("Report: {}", output.display());
    }
    if result.strict_gate.enabled && !result.strict_gate.passed {
        eprintln!("Strict gate failed:");
        for failure in result.strict_gate.failures {
            eprintln!("- {failure}");
        }
        std::process::exit(1);
    }

    Ok(())
}

struct GateInputs<'a> {
    paper_count: i64,
    missing_abstract_rate: f64,
    missing_year_rate: f64,
    query_ms: u128,
    cluster_count: usize,
    missing_indexes: &'a [String],
}

fn parse_args() -> Result<Args, String> {
    let raw = env::args().skip(1).collect::<Vec<_>>();
    if raw.iter().any(|arg| arg == "--help" || arg == "-h") {
        print_help();
        std::process::exit(0);
    }

    let mut args = Args {
        project_id: DEFAULT_PROJECT_ID.to_string(),
        ..Args::default()
    };
    let mut index = 0;
    while index < raw.len() {
        let key = &raw[index];
        match key.as_str() {
            "--" => {
                index += 1;
            }
            "--database-dir" => {
                args.database_dir = Some(PathBuf::from(read_value(&raw, index, key)?));
                index += 2;
            }
            "--database-path" => {
                args.database_path = Some(PathBuf::from(read_value(&raw, index, key)?));
                index += 2;
            }
            "--project-id" => {
                args.project_id = read_value(&raw, index, key)?;
                index += 2;
            }
            "--output" => {
                args.output = Some(PathBuf::from(read_value(&raw, index, key)?));
                index += 2;
            }
            "--min-rows" => {
                args.min_rows = Some(parse_i64(&read_value(&raw, index, key)?, key)?);
                index += 2;
            }
            "--max-missing-abstract-rate" => {
                args.max_missing_abstract_rate = Some(parse_rate(&read_value(&raw, index, key)?, key)?);
                index += 2;
            }
            "--max-missing-year-rate" => {
                args.max_missing_year_rate = Some(parse_rate(&read_value(&raw, index, key)?, key)?);
                index += 2;
            }
            "--max-query-ms" => {
                args.max_query_ms = Some(parse_u128(&read_value(&raw, index, key)?, key)?);
                index += 2;
            }
            "--min-clusters" => {
                args.min_clusters = Some(parse_usize(&read_value(&raw, index, key)?, key)?);
                index += 2;
            }
            "--require-indexes" => {
                args.require_indexes = true;
                index += 1;
            }
            _ => return Err(format!("Unknown argument: {key}")),
        }
    }

    if args.database_dir.is_some() && args.database_path.is_some() {
        return Err("Use either --database-dir or --database-path, not both.".to_string());
    }
    if args.database_dir.is_none() && args.database_path.is_none() {
        args.database_dir = Some(PathBuf::from("data").join("library"));
    }
    Ok(args)
}

fn read_value(raw: &[String], index: usize, key: &str) -> Result<String, String> {
    raw.get(index + 1)
        .filter(|value| !value.starts_with("--"))
        .cloned()
        .ok_or_else(|| format!("Missing value for {key}"))
}

fn parse_i64(value: &str, key: &str) -> Result<i64, String> {
    let parsed = value.parse::<i64>().map_err(|_| format!("{key} must be an integer."))?;
    if parsed <= 0 {
        return Err(format!("{key} must be positive."));
    }
    Ok(parsed)
}

fn parse_usize(value: &str, key: &str) -> Result<usize, String> {
    let parsed = value.parse::<usize>().map_err(|_| format!("{key} must be an integer."))?;
    if parsed == 0 {
        return Err(format!("{key} must be positive."));
    }
    Ok(parsed)
}

fn parse_u128(value: &str, key: &str) -> Result<u128, String> {
    let parsed = value.parse::<u128>().map_err(|_| format!("{key} must be an integer."))?;
    if parsed == 0 {
        return Err(format!("{key} must be positive."));
    }
    Ok(parsed)
}

fn parse_rate(value: &str, key: &str) -> Result<f64, String> {
    let parsed = value.parse::<f64>().map_err(|_| format!("{key} must be a number."))?;
    if !(0.0..=1.0).contains(&parsed) {
        return Err(format!("{key} must be between 0 and 1."));
    }
    Ok(parsed)
}

fn print_help() {
    println!(
        r#"Usage:
  cargo run --manifest-path src-tauri/Cargo.toml --bin audit_library -- --database-dir data/library --min-rows 100000 --require-indexes --output outputs/sqlite_audit.json

Options:
  --database-dir <dir>                 Directory containing research-hotspots-v7.sqlite.
  --database-path <file>               Direct SQLite file path.
  --project-id <id>                    Project id, default project-default.
  --output <file>                      JSON report path.
  --min-rows <n>                       Fail if row count is below n.
  --max-missing-abstract-rate <0..1>   Fail if missing abstract rate is too high.
  --max-missing-year-rate <0..1>       Fail if missing year rate is too high.
  --max-query-ms <n>                   Fail if query smoke exceeds n ms.
  --min-clusters <n>                   Fail if cluster smoke produces fewer visible hotspots.
  --require-indexes                    Fail if required production indexes are missing.
"#
    );
}

fn resolve_database_path(args: &Args) -> Result<PathBuf, String> {
    if let Some(path) = args.database_path.as_ref() {
        return Ok(path.clone());
    }
    let dir = args
        .database_dir
        .as_ref()
        .ok_or_else(|| "Missing database dir.".to_string())?;
    Ok(dir.join(DATABASE_FILE))
}

fn ensure_papers_table(conn: &Connection) -> Result<(), String> {
    let exists = conn
        .query_row(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='papers'",
            [],
            |row| row.get::<_, i64>(0),
        )
        .optional()
        .map_err(|error| error.to_string())?
        .is_some();
    if exists {
        Ok(())
    } else {
        Err("SQLite database does not contain papers table.".to_string())
    }
}

fn count_project_rows(conn: &Connection, project_id: &str) -> Result<i64, String> {
    conn.query_row(
        "SELECT COUNT(*) FROM papers WHERE project_id = ?1",
        params![project_id],
        |row| row.get(0),
    )
    .map_err(|error| error.to_string())
}

fn count_missing_abstracts(conn: &Connection, project_id: &str) -> Result<i64, String> {
    conn.query_row(
        "SELECT COUNT(*) FROM papers
         WHERE project_id = ?1
           AND (
             TRIM(abstract) = ''
             OR abstract = ?2
             OR abstract = ?3
           )",
        params![project_id, DEFAULT_ABSTRACT_EN, DEFAULT_ABSTRACT_ZH],
        |row| row.get(0),
    )
    .map_err(|error| error.to_string())
}

fn count_where(conn: &Connection, project_id: &str, clause: &str) -> Result<i64, String> {
    let sql = format!("SELECT COUNT(*) FROM papers WHERE project_id = ?1 AND ({clause})");
    conn.query_row(&sql, params![project_id], |row| row.get(0))
        .map_err(|error| error.to_string())
}

fn duplicate_risk_count(conn: &Connection, project_id: &str, expr: &str) -> Result<i64, String> {
    let sql = format!(
        "SELECT COALESCE(SUM(count - 1), 0)
         FROM (
           SELECT {expr} AS value, COUNT(*) AS count
           FROM papers
           WHERE project_id = ?1
           GROUP BY value
           HAVING value IS NOT NULL AND TRIM(value) <> '' AND count > 1
         )"
    );
    conn.query_row(&sql, params![project_id], |row| row.get(0))
        .map_err(|error| error.to_string())
}

fn facet(conn: &Connection, project_id: &str, expr: &str, limit: i64) -> Result<Vec<Facet>, String> {
    let null_guard = if expr.contains("year") { "AND year IS NOT NULL" } else { "" };
    let sql = format!(
        "SELECT {expr} AS value, COUNT(*) AS count
         FROM papers
         WHERE project_id = ?1 {null_guard}
         GROUP BY value
         HAVING value IS NOT NULL AND TRIM(value) <> ''
         ORDER BY count DESC, value ASC
         LIMIT ?2"
    );
    let mut stmt = conn.prepare(&sql).map_err(|error| error.to_string())?;
    let rows = stmt
        .query_map(params![project_id, limit], |row| {
        Ok(Facet {
            value: row.get(0)?,
            count: row.get(1)?,
        })
    })
    .map_err(|error| error.to_string())?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|error| error.to_string())?;
    Ok(rows)
}

fn year_range(conn: &Connection, project_id: &str) -> Result<Option<String>, String> {
    let row = conn
        .query_row(
            "SELECT MIN(year), MAX(year) FROM papers WHERE project_id = ?1 AND year IS NOT NULL",
            params![project_id],
            |row| Ok((row.get::<_, Option<i64>>(0)?, row.get::<_, Option<i64>>(1)?)),
        )
        .map_err(|error| error.to_string())?;
    Ok(match row {
        (Some(min), Some(max)) => Some(format!("{min}-{max}")),
        _ => None,
    })
}

fn index_status(conn: &Connection) -> Result<(Vec<IndexStatus>, Vec<String>), String> {
    let mut stmt = conn.prepare("PRAGMA index_list('papers')").map_err(|error| error.to_string())?;
    let indexes = stmt
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|error| error.to_string())?
        .collect::<Result<HashSet<_>, _>>()
        .map_err(|error| error.to_string())?;
    let mut rows = Vec::new();
    let mut missing = Vec::new();
    for index in REQUIRED_INDEXES {
        let present = indexes.contains(*index);
        rows.push(IndexStatus {
            name: (*index).to_string(),
            present,
        });
        if !present {
            missing.push((*index).to_string());
        }
    }
    Ok((rows, missing))
}

fn cluster_smoke(conn: &Connection, project_id: &str) -> Result<ClusterSmoke, String> {
    let started = Instant::now();
    let mut stmt = conn
        .prepare("SELECT id, field, title, abstract, year, source, categories FROM papers WHERE project_id = ?1")
        .map_err(|error| error.to_string())?;
    let mut rows = stmt.query(params![project_id]).map_err(|error| error.to_string())?;
    let mut groups: HashMap<String, ClusterGroup> = HashMap::new();

    while let Some(row) = rows.next().map_err(|error| error.to_string())? {
        let id: String = row.get(0).map_err(|error| error.to_string())?;
        let field: String = row.get(1).map_err(|error| error.to_string())?;
        let title: String = row.get(2).map_err(|error| error.to_string())?;
        let abstract_text: String = row.get(3).map_err(|error| error.to_string())?;
        let year: Option<i64> = row.get(4).map_err(|error| error.to_string())?;
        let source: String = row.get(5).map_err(|error| error.to_string())?;
        let categories: Option<String> = row.get(6).map_err(|error| error.to_string())?;
        let keyword = top_keyword(&format!("{} {} {}", title, abstract_text, categories.unwrap_or_default()))
            .unwrap_or_else(|| normalize_group_key(&field));
        let key = format!("{field}::{keyword}");
        let group = groups.entry(key).or_insert_with(|| ClusterGroup {
            field: field.clone(),
            keyword: keyword.clone(),
            ..ClusterGroup::default()
        });
        group.paper_count += 1;
        if group.representative_ids.len() < 8 {
            group.representative_ids.push(id);
        }
        if let Some(year) = year {
            *group.years.entry(year).or_insert(0) += 1;
        }
        group.sources.insert(source);
    }

    let mut sorted = groups.into_values().collect::<Vec<_>>();
    sorted.sort_by(|a, b| b.paper_count.cmp(&a.paper_count).then_with(|| a.field.cmp(&b.field)));
    let sample_hotspots = sorted
        .iter()
        .take(12)
        .map(|group| {
            let year_range = if group.years.is_empty() {
                None
            } else {
                let min = group.years.keys().min().copied().unwrap_or_default();
                let max = group.years.keys().max().copied().unwrap_or_default();
                Some(format!("{min}-{max}"))
            };
            SampleHotspot {
                field: group.field.clone(),
                keyword: group.keyword.clone(),
                paper_count: group.paper_count,
                representative_ids: group.representative_ids.clone(),
                year_range,
                source_count: group.sources.len(),
            }
        })
        .collect::<Vec<_>>();

    Ok(ClusterSmoke {
        elapsed_ms: started.elapsed().as_millis(),
        candidate_cluster_count: sorted.len(),
        visible_hotspot_count: sorted.len().min(160),
        sample_hotspots,
    })
}

fn top_keyword(text: &str) -> Option<String> {
    let mut counts: HashMap<String, i64> = HashMap::new();
    for token in tokenize_ascii(text) {
        if token.len() < 3 || is_stopword(&token) {
            continue;
        }
        *counts.entry(token).or_insert(0) += 1;
    }
    counts
        .into_iter()
        .max_by(|a, b| a.1.cmp(&b.1).then_with(|| b.0.cmp(&a.0)))
        .map(|(token, _)| token)
}

fn tokenize_ascii(text: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    for ch in text.chars() {
        if ch.is_ascii_alphabetic() || ch == '-' {
            current.push(ch.to_ascii_lowercase());
        } else if !current.is_empty() {
            tokens.push(current.trim_matches('-').to_string());
            current.clear();
        }
    }
    if !current.is_empty() {
        tokens.push(current.trim_matches('-').to_string());
    }
    tokens.into_iter().filter(|token| !token.is_empty()).collect()
}

fn is_stopword(token: &str) -> bool {
    matches!(
        token,
        "the"
            | "and"
            | "for"
            | "with"
            | "from"
            | "this"
            | "that"
            | "using"
            | "based"
            | "paper"
            | "study"
            | "research"
            | "model"
            | "models"
            | "method"
            | "methods"
            | "data"
            | "analysis"
            | "results"
            | "system"
            | "systems"
    )
}

fn normalize_group_key(value: &str) -> String {
    let mut out = String::new();
    let mut last_dash = false;
    for ch in value.chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
            last_dash = false;
        } else if !last_dash && !out.is_empty() {
            out.push('-');
            last_dash = true;
        }
    }
    out.trim_matches('-').to_string()
}

fn build_gate(args: &Args, inputs: GateInputs<'_>) -> StrictGate {
    let mut checks = Vec::new();
    if let Some(min_rows) = args.min_rows {
        checks.push(GateCheck {
            name: "minRows".to_string(),
            expected: min_rows.to_string(),
            actual: inputs.paper_count.to_string(),
            passed: inputs.paper_count >= min_rows,
        });
    }
    if let Some(max_rate) = args.max_missing_abstract_rate {
        checks.push(GateCheck {
            name: "maxMissingAbstractRate".to_string(),
            expected: format_rate(max_rate),
            actual: format_rate(inputs.missing_abstract_rate),
            passed: inputs.missing_abstract_rate <= max_rate,
        });
    }
    if let Some(max_rate) = args.max_missing_year_rate {
        checks.push(GateCheck {
            name: "maxMissingYearRate".to_string(),
            expected: format_rate(max_rate),
            actual: format_rate(inputs.missing_year_rate),
            passed: inputs.missing_year_rate <= max_rate,
        });
    }
    if let Some(max_ms) = args.max_query_ms {
        checks.push(GateCheck {
            name: "maxQueryMs".to_string(),
            expected: max_ms.to_string(),
            actual: inputs.query_ms.to_string(),
            passed: inputs.query_ms <= max_ms,
        });
    }
    if let Some(min_clusters) = args.min_clusters {
        checks.push(GateCheck {
            name: "minClusters".to_string(),
            expected: min_clusters.to_string(),
            actual: inputs.cluster_count.to_string(),
            passed: inputs.cluster_count >= min_clusters,
        });
    }
    if args.require_indexes {
        checks.push(GateCheck {
            name: "requireIndexes".to_string(),
            expected: "all required indexes present".to_string(),
            actual: if inputs.missing_indexes.is_empty() {
                "all present".to_string()
            } else {
                inputs.missing_indexes.join(", ")
            },
            passed: inputs.missing_indexes.is_empty(),
        });
    }

    let failures = checks
        .iter()
        .filter(|check| !check.passed)
        .map(|check| format!("{} expected {}, actual {}.", check.name, check.expected, check.actual))
        .collect::<Vec<_>>();

    StrictGate {
        enabled: !checks.is_empty(),
        passed: failures.is_empty(),
        checks,
        failures,
    }
}

fn file_size(path: &Path) -> u64 {
    fs::metadata(path).map(|metadata| metadata.len()).unwrap_or_default()
}

fn rate(count: i64, total: i64) -> f64 {
    if total <= 0 {
        0.0
    } else {
        ((count as f64 / total as f64) * 1_000_000.0).round() / 1_000_000.0
    }
}

fn format_rate(value: f64) -> String {
    format!("{value:.6}")
}

fn now_iso_like() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    format!("unix-ms:{millis}")
}

trait OptionalExtension<T> {
    fn optional(self) -> rusqlite::Result<Option<T>>;
}

impl<T> OptionalExtension<T> for rusqlite::Result<T> {
    fn optional(self) -> rusqlite::Result<Option<T>> {
        match self {
            Ok(value) => Ok(Some(value)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(error) => Err(error),
        }
    }
}
