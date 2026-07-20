use std::{
    env, fs,
    path::{Path, PathBuf},
};

use research_hotspots_core::{
    agent::{
        AgentAutomationMode, AgentBudget, AgentPlan, AgentPlanStep, AgentRiskLevel, AgentRunStatus,
        AgentSuccessCriterion,
    },
    agent_store::{migrate_library_file, AgentRepository, NewAgentRun},
    ensure_v20_schema,
};
use rusqlite::Connection;
use serde_json::{json, Value};

fn main() -> Result<(), String> {
    let mut args = env::args().skip(1);
    let mut root = None;
    while let Some(arg) = args.next() {
        if arg == "--root" {
            root = args.next().map(PathBuf::from)
        }
    }
    let root = root.ok_or("--root is required")?;
    prepare_owned_root(&root)?;
    let database = root.join("agent-v8.sqlite");
    remove_owned_files(
        &database,
        &root.join("too-new.sqlite"),
        &root.join("agent-v8.pre-schema-v10.1000.sqlite"),
    )?;
    let conn = Connection::open(&database).map_err(|e| e.to_string())?;
    conn.execute_batch("PRAGMA foreign_keys=ON;CREATE TABLE papers(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,source TEXT NOT NULL,title TEXT NOT NULL,abstract TEXT NOT NULL,field TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,search_blob TEXT NOT NULL DEFAULT '');").map_err(|e|e.to_string())?;
    ensure_v20_schema(&conn)?;
    conn.pragma_update(None, "user_version", 8)
        .map_err(|e| e.to_string())?;
    drop(conn);
    let migration = migrate_library_file(&database, "project-default", 1000, true)?;
    if migration.previous_version != 8
        || migration.current_version != 10
        || migration.backup_path.as_ref().is_none_or(|p| !p.exists())
    {
        return Err("migration audit failed".into());
    }
    let backup_version: i64 = Connection::open(migration.backup_path.as_ref().unwrap())
        .map_err(|e| e.to_string())?
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(|e| e.to_string())?;
    if backup_version != 8 {
        return Err("pre-migration backup version changed".into());
    }
    let too_new = root.join("too-new.sqlite");
    let too_new_conn = Connection::open(&too_new).map_err(|e| e.to_string())?;
    too_new_conn
        .pragma_update(None, "user_version", 11)
        .map_err(|e| e.to_string())?;
    drop(too_new_conn);
    if migrate_library_file(&too_new, "project-default", 1001, true).unwrap_err()
        != "LIBRARY_SCHEMA_TOO_NEW"
    {
        return Err("future schema was not rejected".into());
    }
    let conn = Connection::open(&database).map_err(|e| e.to_string())?;
    let repo = AgentRepository::new(&conn)?;
    repo.create_run(NewAgentRun {
        id: "audit-run".into(),
        project_id: "project-default".into(),
        snapshot_id: None,
        automation_mode: AgentAutomationMode::Supervised,
        objective: "Audit persistence".into(),
        budget: AgentBudget::default(),
        now_ms: 1100,
    })?;
    repo.transition_run("audit-run", AgentRunStatus::Planning, None, 1200)?;
    let plan = AgentPlan {
        version: 1,
        objective: "Audit persistence".into(),
        assumptions: vec![],
        success_criteria: vec![AgentSuccessCriterion {
            id: "persisted".into(),
            description: "State survives reopen".into(),
        }],
        steps: vec![AgentPlanStep {
            id: "inspect".into(),
            title: "Inspect".into(),
            tool: "inspect_library".into(),
            input: json!({}),
            risk: AgentRiskLevel::Read,
        }],
    };
    repo.save_plan("audit-run", &plan, 1300)?;
    conn.execute("CREATE TABLE audit_business(value INTEGER NOT NULL)", [])
        .map_err(|e| e.to_string())?;
    let key = repo.operation_key("audit-run", 1, "inspect", "audit_write", "action")?;
    let first = repo.execute_idempotent_sqlite_mutation(
        &key,
        "audit-run",
        1,
        "inspect",
        "audit_write",
        "action",
        1400,
        |tx| {
            tx.execute("INSERT INTO audit_business VALUES(1)", [])
                .map_err(|e| e.to_string())?;
            Ok(json!({"committed":true}))
        },
    )?;
    let second = repo.execute_idempotent_sqlite_mutation(
        &key,
        "audit-run",
        1,
        "inspect",
        "audit_write",
        "action",
        1500,
        |_| Err("duplicate executed".into()),
    )?;
    if first != second
        || conn
            .query_row("SELECT count(*) FROM audit_business", [], |r| {
                r.get::<_, i64>(0)
            })
            .map_err(|e| e.to_string())?
            != 1
    {
        return Err("receipt audit failed".into());
    }
    let snapshot = repo.snapshot("audit-run")?;
    drop(repo);
    drop(conn);
    let reopened = Connection::open(&database).map_err(|e| e.to_string())?;
    let rebuilt = AgentRepository::new(&reopened)?.snapshot("audit-run")?;
    if snapshot.run != rebuilt.run
        || snapshot.events != rebuilt.events
        || snapshot.steps != rebuilt.steps
    {
        return Err("reopen audit failed".into());
    }
    let output: Value = json!({"ok":true,"schemaVersion":migration.current_version,"backupSchemaVersion":backup_version,"futureSchemaRejected":true,"backupPath":migration.backup_path,"runId":rebuilt.run.id,"eventCount":rebuilt.events.len(),"stepCount":rebuilt.steps.len(),"receiptIdempotent":true});
    println!(
        "{}",
        serde_json::to_string_pretty(&output).map_err(|e| e.to_string())?
    );
    Ok(())
}

fn prepare_owned_root(root: &Path) -> Result<(), String> {
    fs::create_dir_all(root).map_err(|error| error.to_string())?;
    let canonical = fs::canonicalize(root).map_err(|error| error.to_string())?;
    let text = canonical.to_string_lossy();
    let drive_path = text.strip_prefix(r"\\?\").unwrap_or(&text);
    if !drive_path.to_ascii_uppercase().starts_with("D:\\") {
        return Err(format!("AGENT_PERSISTENCE_AUDIT_REQUIRES_D_DRIVE:{text}"));
    }
    fs::write(canonical.join(".agent-persistence-audit-owned"),"Only agent-v8.sqlite*, too-new.sqlite*, and the schema-v10 audit backup are managed by this audit.\n").map_err(|error|error.to_string())
}

fn remove_owned_files(database: &Path, too_new: &Path, backup: &Path) -> Result<(), String> {
    for base in [database, too_new] {
        for path in [
            base.to_path_buf(),
            PathBuf::from(format!("{}-wal", base.display())),
            PathBuf::from(format!("{}-shm", base.display())),
        ] {
            if path.exists() {
                fs::remove_file(&path).map_err(|error| format!("{}:{error}", path.display()))?;
            }
        }
    }
    if backup.exists() {
        fs::remove_file(backup).map_err(|error| format!("{}:{error}", backup.display()))?;
    }
    Ok(())
}
