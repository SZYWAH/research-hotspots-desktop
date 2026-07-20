use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::{Arc, Mutex, OnceLock, Weak},
    time::Duration,
};

use rusqlite::{
    backup::Backup, params, Connection, OptionalExtension, Transaction, TransactionBehavior,
};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

use crate::agent::{
    action_approval_hash, canonical_value_sha256, plan_approval_hash, validate_budget,
    validate_error_code, validate_plan, validate_question_request, validate_run_transition,
    validate_step_transition, validate_storable_json, validate_user_answer, AgentAction,
    AgentArtifactReviewDecision, AgentAutomationMode, AgentBudget, AgentBudgetUsage,
    AgentDecisionSummary, AgentModelProtocol, AgentModelRole, AgentPlan, AgentQuestionRequest,
    AgentQuestionType, AgentRiskLevel, AgentRunStatus, AgentStepStatus, AGENT_OBJECTIVE_MAX_BYTES,
    AGENT_PLAN_MAX_BYTES,
};
use crate::{
    sha256_file, validate_library_candidate_file, LIBRARY_SCHEMA_VERSION,
    MIN_SUPPORTED_LIBRARY_SCHEMA_VERSION,
};

pub const AGENT_LEASE_TTL_MS: i64 = 30_000;
pub const AGENT_LEASE_HEARTBEAT_MS: i64 = 10_000;
pub const AGENT_EVENT_MAX_BYTES: usize = 64 * 1024;
pub const AGENT_OBSERVATION_MAX_BYTES: usize = 1024 * 1024;
pub const AGENT_ARTIFACT_MAX_BYTES: usize = 8 * 1024 * 1024;
pub const AGENT_ANSWER_MAX_BYTES: usize = 4 * 1024;

static LIBRARY_MIGRATION_LOCKS: OnceLock<Mutex<HashMap<PathBuf, Weak<Mutex<()>>>>> =
    OnceLock::new();

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AgentRunRecord {
    pub id: String,
    pub library_instance_id: String,
    pub project_id: String,
    pub snapshot_id: Option<String>,
    pub automation_mode: AgentAutomationMode,
    pub status: AgentRunStatus,
    pub objective: String,
    pub budget: AgentBudget,
    pub budget_usage: AgentBudgetUsage,
    pub current_plan_version: Option<u32>,
    pub decision_summary: Option<AgentDecisionSummary>,
    pub last_error_code: Option<String>,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
    pub completed_at_ms: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AgentStepRecord {
    pub run_id: String,
    pub plan_version: u32,
    pub step_id: String,
    pub ordinal: u32,
    pub title: String,
    pub tool_name: String,
    pub tool_version: String,
    pub registry_hash: String,
    pub input: Value,
    pub resolved_input: Option<Value>,
    pub action_hash: Option<String>,
    pub pending_approval_hash: Option<String>,
    pub pending_approval_requested_at_ms: Option<i64>,
    pub risk: AgentRiskLevel,
    pub status: AgentStepStatus,
    pub attempts: u32,
    pub operation_key: Option<String>,
    pub recovery_count: u32,
    pub observation: Option<Value>,
    pub last_error_code: Option<String>,
    pub started_at_ms: Option<i64>,
    pub finished_at_ms: Option<i64>,
    pub updated_at_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AgentEventRecord {
    pub sequence: i64,
    pub event_type: String,
    pub step_id: Option<String>,
    pub payload: Value,
    pub created_at_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AgentArtifactRecord {
    pub id: String,
    pub run_id: String,
    pub step_id: Option<String>,
    pub artifact_kind: String,
    pub content: Value,
    pub content_sha256: String,
    pub snapshot_id: Option<String>,
    pub audit: Option<Value>,
    pub review_status: Option<String>,
    pub supersedes_artifact_id: Option<String>,
    pub created_at_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AgentApprovalRecord {
    pub id: String,
    pub run_id: String,
    pub decision_sequence: i64,
    pub plan_version: Option<u32>,
    pub step_id: Option<String>,
    pub approval_kind: String,
    pub decision: String,
    pub approved_hash: String,
    pub risk: Option<AgentRiskLevel>,
    pub registry_hash: String,
    pub tool_version: Option<String>,
    pub model_profile_hash: Option<String>,
    pub actor_id: String,
    pub policy_reason: Option<String>,
    pub created_at_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AgentEffectiveApproval {
    pub record: AgentApprovalRecord,
    pub is_approved: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AgentQuestionRecord {
    pub id: String,
    pub run_id: String,
    pub plan_version: Option<u32>,
    pub step_id: Option<String>,
    pub prompt: String,
    pub answer_type: AgentQuestionType,
    pub options: Option<Value>,
    pub requires_replan: bool,
    pub created_at_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AgentAnswerRecord {
    pub id: String,
    pub question_id: String,
    pub run_id: String,
    pub answer: Value,
    pub actor_id: String,
    pub created_at_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AgentArtifactReviewRecord {
    pub id: String,
    pub artifact_id: String,
    pub run_id: String,
    pub decision_sequence: i64,
    pub artifact_sha256: String,
    pub decision: AgentArtifactReviewDecision,
    pub actor_id: String,
    pub reason: Option<String>,
    pub created_at_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AgentModelProfileRecord {
    pub id: String,
    pub role: AgentModelRole,
    pub protocol: AgentModelProtocol,
    pub model: String,
    pub endpoint_origin: String,
    pub config: Value,
    pub config_sha256: String,
    pub created_at_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AgentModelProfileReference {
    pub profile_id: String,
    pub config_sha256: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AgentStepExecutionBinding {
    pub step_id: String,
    pub tool_name: String,
    pub tool_version: String,
    pub registry_hash: String,
    pub unresolved_input: Value,
    pub authoritative_risk: AgentRiskLevel,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentPlanContext {
    pub run_id: String,
    pub version: u32,
    pub plan_hash: String,
    pub registry_hash: String,
    pub planner_profile_hash: String,
    pub writer_profile_hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentLeaseFence {
    pub run_id: String,
    pub owner_id: String,
    pub lease_token: String,
    pub generation: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AgentRunSnapshot {
    pub run: AgentRunRecord,
    pub plan: Option<AgentPlan>,
    pub steps: Vec<AgentStepRecord>,
    pub events: Vec<AgentEventRecord>,
    pub artifacts: Vec<AgentArtifactRecord>,
    pub approvals: Vec<AgentApprovalRecord>,
    pub questions: Vec<AgentQuestionRecord>,
    pub answers: Vec<AgentAnswerRecord>,
    pub artifact_reviews: Vec<AgentArtifactReviewRecord>,
    pub model_profiles: Vec<AgentModelProfileRecord>,
    pub current_lease: Option<AgentLease>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentLease {
    pub run_id: String,
    pub owner_id: String,
    pub lease_token: String,
    pub generation: i64,
    pub acquired_at_ms: i64,
    pub heartbeat_at_ms: i64,
    pub expires_at_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentMigrationResult {
    pub previous_version: i64,
    pub current_version: i64,
    pub backup_path: Option<PathBuf>,
    pub backup_sha256: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentRecoveryResult {
    pub recovered_run_ids: Vec<String>,
    pub completed_step_count: u32,
    pub requeued_step_count: u32,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewAgentRun {
    pub id: String,
    pub project_id: String,
    pub snapshot_id: Option<String>,
    pub automation_mode: AgentAutomationMode,
    pub objective: String,
    pub budget: AgentBudget,
    pub now_ms: i64,
}

pub fn ensure_agent_schema(conn: &Connection) -> Result<(), String> {
    if table_exists(conn, "agent_runs")? && !table_has_column(conn, "agent_runs", "status")? {
        return Err("AGENT_SCHEMA_INVALID".into());
    }
    if table_exists(conn, "agent_runs")?
        && !table_sql(conn, "agent_runs")?.is_some_and(|sql| sql.contains("awaiting_user"))
    {
        return Err("AGENT_SCHEMA_V10_MIGRATION_REQUIRED".into());
    }
    conn.execute_batch(include_str!("agent_schema.sql"))
        .map_err(|e| e.to_string())
}

fn migration_lock_for_path(path: &Path) -> Result<Arc<Mutex<()>>, String> {
    let key = fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
    let registry = LIBRARY_MIGRATION_LOCKS.get_or_init(|| Mutex::new(HashMap::new()));
    let mut locks = registry
        .lock()
        .map_err(|_| "AGENT_MIGRATION_LOCK_REGISTRY_POISONED".to_string())?;
    if let Some(existing) = locks.get(&key).and_then(Weak::upgrade) {
        return Ok(existing);
    }
    let lock = Arc::new(Mutex::new(()));
    locks.insert(key, Arc::downgrade(&lock));
    Ok(lock)
}

fn cleanup_migration_backup_artifacts(path: &Path) {
    let _ = fs::remove_file(path);
    let _ = fs::remove_file(format!("{}-wal", path.to_string_lossy()));
    let _ = fs::remove_file(format!("{}-shm", path.to_string_lossy()));
    let _ = fs::remove_file(format!("{}-journal", path.to_string_lossy()));
}

fn migration_source_size(path: &Path) -> Result<u64, String> {
    let database_size = fs::metadata(path)
        .map_err(|error| format!("AGENT_MIGRATION_SOURCE_METADATA_FAILED:{error}"))?
        .len();
    let wal_path = PathBuf::from(format!("{}-wal", path.to_string_lossy()));
    let wal_size = match fs::metadata(&wal_path) {
        Ok(metadata) => metadata.len(),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => 0,
        Err(error) => return Err(format!("AGENT_MIGRATION_WAL_METADATA_FAILED:{error}")),
    };
    Ok(database_size.saturating_add(wal_size))
}

pub fn migrate_library_file(
    path: &Path,
    project_id: &str,
    now_ms: i64,
    backup_existing: bool,
) -> Result<AgentMigrationResult, String> {
    if !path.is_file() {
        return Err("LIBRARY_SCHEMA_TOO_OLD".into());
    }
    let path_lock = migration_lock_for_path(path)?;
    let _path_guard = path_lock
        .lock()
        .map_err(|_| "AGENT_MIGRATION_PATH_LOCK_POISONED".to_string())?;
    let mut conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(|e| e.to_string())?;
    let previous: i64 = conn
        .pragma_query_value(None, "user_version", |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if previous > LIBRARY_SCHEMA_VERSION {
        return Err("LIBRARY_SCHEMA_TOO_NEW".into());
    }
    if previous < MIN_SUPPORTED_LIBRARY_SCHEMA_VERSION {
        return Err("LIBRARY_SCHEMA_TOO_OLD".into());
    }
    if previous == LIBRARY_SCHEMA_VERSION {
        ensure_agent_schema(&conn)?;
        return Ok(AgentMigrationResult {
            previous_version: previous,
            current_version: LIBRARY_SCHEMA_VERSION,
            backup_path: None,
            backup_sha256: None,
        });
    }
    let source_value = validate_library_candidate_file(path, project_id)?;
    let (mut backup_path, mut backup_sha256) = if backup_existing {
        let parent = path.parent().ok_or("AGENT_MIGRATION_PARENT_MISSING")?;
        let source_size = migration_source_size(path)?;
        let available = fs2::available_space(parent)
            .map_err(|error| format!("AGENT_MIGRATION_BACKUP_SPACE_CHECK_FAILED:{error}"))?;
        if available < source_size.saturating_add(16 * 1024 * 1024) {
            return Err("AGENT_MIGRATION_BACKUP_SPACE_INSUFFICIENT".into());
        }
        let stem = path
            .file_stem()
            .and_then(|v| v.to_str())
            .ok_or("AGENT_MIGRATION_FILE_NAME_INVALID")?;
        let backup_path = parent.join(format!("{stem}.pre-schema-v10.{now_ms}.sqlite"));
        if backup_path.exists() {
            return Err("AGENT_MIGRATION_BACKUP_EXISTS".into());
        }
        let partial_path = backup_path.with_file_name(format!(
            "{}.partial",
            backup_path
                .file_name()
                .and_then(|value| value.to_str())
                .ok_or("AGENT_MIGRATION_BACKUP_FILE_NAME_INVALID")?
        ));
        cleanup_migration_backup_artifacts(&partial_path);
        if partial_path.exists() {
            return Err("AGENT_MIGRATION_BACKUP_PARTIAL_CLEANUP_FAILED".into());
        }
        let backup_result: Result<(PathBuf, String), String> = (|| {
            let mut dest = Connection::open(&partial_path)
                .map_err(|e| format!("AGENT_MIGRATION_BACKUP_OPEN_FAILED:{e}"))?;
            let backup = Backup::new(&conn, &mut dest)
                .map_err(|e| format!("AGENT_MIGRATION_BACKUP_FAILED:{e}"))?;
            backup
                .run_to_completion(128, Duration::from_millis(5), None)
                .map_err(|e| format!("AGENT_MIGRATION_BACKUP_FAILED:{e}"))?;
            drop(backup);
            drop(dest);
            let backup_value = validate_library_candidate_file(&partial_path, project_id)
                .map_err(|e| format!("AGENT_MIGRATION_BACKUP_INVALID:{e}"))?;
            if backup_value.paper_count != source_value.paper_count
                || backup_value.hotspot_count != source_value.hotspot_count
                || backup_value.membership_count != source_value.membership_count
                || backup_value.snapshot_id != source_value.snapshot_id
            {
                return Err("AGENT_MIGRATION_BACKUP_COUNT_MISMATCH".into());
            }
            let hash = sha256_file(&partial_path)
                .map_err(|e| format!("AGENT_MIGRATION_BACKUP_HASH_FAILED:{e}"))?;
            fs::rename(&partial_path, &backup_path)
                .map_err(|e| format!("AGENT_MIGRATION_BACKUP_ACTIVATE_FAILED:{e}"))?;
            Ok((backup_path, hash))
        })();
        if backup_result.is_err() {
            cleanup_migration_backup_artifacts(&partial_path);
        }
        let (backup_path, hash) = backup_result?;
        (Some(backup_path), Some(hash))
    } else {
        (None, None)
    };
    conn.pragma_update(None, "foreign_keys", "OFF")
        .map_err(|e| format!("AGENT_SCHEMA_MIGRATION_FAILED:{e}"))?;
    let migration: Result<bool, String> = (|| {
        let tx = conn
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|e| format!("AGENT_SCHEMA_MIGRATION_FAILED:{e}"))?;
        let locked_version: i64 = tx
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .map_err(|e| format!("AGENT_SCHEMA_MIGRATION_FAILED:{e}"))?;
        if locked_version == LIBRARY_SCHEMA_VERSION {
            tx.commit()
                .map_err(|e| format!("AGENT_SCHEMA_MIGRATION_FAILED:{e}"))?;
            return Ok(false);
        }
        if locked_version != previous {
            return Err("AGENT_SCHEMA_MIGRATION_VERSION_CHANGED".into());
        }
        if previous == 9 {
            migrate_v9_agent_schema(&tx)?;
        } else {
            tx.execute_batch(include_str!("agent_schema.sql"))
                .map_err(|e| format!("AGENT_SCHEMA_MIGRATION_FAILED:{e}"))?;
        }
        let foreign_key_errors: i64 = tx
            .query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |row| {
                row.get(0)
            })
            .map_err(|e| format!("AGENT_SCHEMA_MIGRATION_FAILED:{e}"))?;
        if foreign_key_errors != 0 {
            return Err("AGENT_SCHEMA_MIGRATION_FOREIGN_KEY_FAILED".into());
        }
        let migrated_value = crate::validate_library_candidate_connection(&tx, project_id)
            .map_err(|e| format!("AGENT_SCHEMA_MIGRATION_V20_INVALID:{e}"))?;
        if migrated_value.paper_count != source_value.paper_count
            || migrated_value.hotspot_count != source_value.hotspot_count
            || migrated_value.membership_count != source_value.membership_count
            || migrated_value.snapshot_id != source_value.snapshot_id
        {
            return Err("AGENT_SCHEMA_MIGRATION_V20_CHANGED".into());
        }
        tx.pragma_update(None, "user_version", LIBRARY_SCHEMA_VERSION)
            .map_err(|e| format!("AGENT_SCHEMA_MIGRATION_FAILED:{e}"))?;
        tx.commit()
            .map_err(|e| format!("AGENT_SCHEMA_MIGRATION_FAILED:{e}"))?;
        Ok(true)
    })();
    // This connection is dropped immediately after migration. Re-enabling foreign keys is
    // best-effort so a post-commit PRAGMA failure can never be reported as a rolled-back upgrade.
    let _ = conn.pragma_update(None, "foreign_keys", "ON");
    let migrated = migration?;
    if !migrated {
        if let Some(path) = backup_path.take() {
            cleanup_migration_backup_artifacts(&path);
        }
        backup_sha256 = None;
        ensure_agent_schema(&conn)?;
    }
    Ok(AgentMigrationResult {
        previous_version: previous,
        current_version: LIBRARY_SCHEMA_VERSION,
        backup_path,
        backup_sha256,
    })
}

fn migrate_v9_agent_schema(tx: &Transaction<'_>) -> Result<(), String> {
    tx.execute_batch(
        "DROP TRIGGER IF EXISTS agent_approvals_no_update;
         DROP TRIGGER IF EXISTS agent_approvals_no_delete;
         DROP TRIGGER IF EXISTS agent_artifacts_no_update;
         DROP TRIGGER IF EXISTS agent_artifacts_no_delete;
         CREATE TABLE agent_runs_v10(
          id TEXT PRIMARY KEY,library_instance_id TEXT NOT NULL,project_id TEXT NOT NULL,snapshot_id TEXT,
          automation_mode TEXT NOT NULL CHECK(automation_mode IN('advisor','supervised')),
          status TEXT NOT NULL CHECK(status IN('draft','planning','awaiting_plan_approval','ready','running','awaiting_action_approval','awaiting_user','evaluating','paused','cancelling','cancelled','failed','completed')),
          objective TEXT NOT NULL,budget_json TEXT NOT NULL,budget_usage_json TEXT NOT NULL,current_plan_version INTEGER,
          decision_summary_json TEXT,last_error_code TEXT,next_event_sequence INTEGER NOT NULL DEFAULT 1,
          created_at_ms INTEGER NOT NULL,updated_at_ms INTEGER NOT NULL,completed_at_ms INTEGER);
         INSERT INTO agent_runs_v10 SELECT id,library_instance_id,project_id,snapshot_id,automation_mode,status,objective,budget_json,budget_usage_json,current_plan_version,decision_summary_json,last_error_code,next_event_sequence,created_at_ms,updated_at_ms,completed_at_ms FROM agent_runs;
         DROP TABLE agent_runs;
         ALTER TABLE agent_runs_v10 RENAME TO agent_runs;
         CREATE TABLE agent_artifacts_v10(
          id TEXT PRIMARY KEY,run_id TEXT NOT NULL,step_id TEXT,artifact_kind TEXT NOT NULL,content_json TEXT NOT NULL,
          content_sha256 TEXT NOT NULL,snapshot_id TEXT,audit_json TEXT,
          review_status TEXT CHECK(review_status IS NULL OR review_status IN('approved','warning','needs-review')),
          supersedes_artifact_id TEXT,created_at_ms INTEGER NOT NULL,
          FOREIGN KEY(run_id) REFERENCES agent_runs(id) ON DELETE RESTRICT,
          FOREIGN KEY(supersedes_artifact_id) REFERENCES agent_artifacts_v10(id) ON DELETE RESTRICT);
         INSERT INTO agent_artifacts_v10(
          id,run_id,step_id,artifact_kind,content_json,content_sha256,snapshot_id,audit_json,
          review_status,supersedes_artifact_id,created_at_ms)
         SELECT id,run_id,step_id,artifact_kind,content_json,content_sha256,snapshot_id,audit_json,
          review_status,supersedes_artifact_id,created_at_ms FROM agent_artifacts;
         DROP TABLE agent_artifacts;
         ALTER TABLE agent_artifacts_v10 RENAME TO agent_artifacts;
         ALTER TABLE agent_plans ADD COLUMN registry_hash TEXT NOT NULL DEFAULT '';
         ALTER TABLE agent_plans ADD COLUMN planner_profile_hash TEXT NOT NULL DEFAULT '';
         ALTER TABLE agent_plans ADD COLUMN writer_profile_hash TEXT NOT NULL DEFAULT '';
         ALTER TABLE agent_steps ADD COLUMN tool_version TEXT NOT NULL DEFAULT '1';
         ALTER TABLE agent_steps ADD COLUMN registry_hash TEXT NOT NULL DEFAULT '';
         ALTER TABLE agent_steps ADD COLUMN resolved_input_json TEXT;
         ALTER TABLE agent_steps ADD COLUMN action_hash TEXT;
         ALTER TABLE agent_steps ADD COLUMN pending_approval_hash TEXT;
         ALTER TABLE agent_steps ADD COLUMN pending_approval_requested_at_ms INTEGER;
         ALTER TABLE agent_approvals ADD COLUMN decision_sequence INTEGER NOT NULL DEFAULT 0;
         ALTER TABLE agent_approvals ADD COLUMN registry_hash TEXT NOT NULL DEFAULT '';
         ALTER TABLE agent_approvals ADD COLUMN tool_version TEXT;
         ALTER TABLE agent_approvals ADD COLUMN model_profile_hash TEXT;
         UPDATE agent_approvals AS current
            SET decision_sequence=(SELECT COUNT(*) FROM agent_approvals AS previous
              WHERE previous.run_id=current.run_id
                AND (previous.created_at_ms<current.created_at_ms
                  OR (previous.created_at_ms=current.created_at_ms AND previous.id<=current.id)));
         CREATE UNIQUE INDEX idx_agent_approvals_run_sequence ON agent_approvals(run_id,decision_sequence);",
    )
    .map_err(|e| format!("AGENT_SCHEMA_MIGRATION_FAILED:{e}"))?;
    tx.execute_batch(include_str!("agent_schema.sql"))
        .map_err(|e| format!("AGENT_SCHEMA_MIGRATION_FAILED:{e}"))
}

fn table_exists(conn: &Connection, table: &str) -> Result<bool, String> {
    conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1)",
        params![table],
        |row| row.get::<_, i64>(0),
    )
    .map(|value| value != 0)
    .map_err(|e| e.to_string())
}

fn table_sql(conn: &Connection, table: &str) -> Result<Option<String>, String> {
    conn.query_row(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name=?1",
        params![table],
        |row| row.get(0),
    )
    .optional()
    .map_err(|e| e.to_string())
}

fn table_has_column(conn: &Connection, table: &str, column: &str) -> Result<bool, String> {
    if !table
        .bytes()
        .all(|value| value.is_ascii_alphanumeric() || value == b'_')
    {
        return Err("AGENT_SCHEMA_TABLE_NAME_INVALID".into());
    }
    let mut statement = conn
        .prepare(&format!("PRAGMA table_info({table})"))
        .map_err(|e| e.to_string())?;
    let columns = statement
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(columns.iter().any(|value| value == column))
}

pub struct AgentRepository<'a> {
    conn: &'a Connection,
}

impl<'a> AgentRepository<'a> {
    pub fn new(conn: &'a Connection) -> Result<Self, String> {
        ensure_agent_schema(conn)?;
        Ok(Self { conn })
    }
    pub fn library_instance_id(&self, now: i64) -> Result<String, String> {
        if let Some(v) = self
            .conn
            .query_row(
                "SELECT value FROM agent_meta WHERE key='libraryInstanceId'",
                [],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?
        {
            return Ok(v);
        }
        let v: String = self
            .conn
            .query_row("SELECT lower(hex(randomblob(16)))", [], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        self.conn
            .execute(
                "INSERT OR IGNORE INTO agent_meta VALUES('libraryInstanceId',?1,?2)",
                params![v, now],
            )
            .map_err(|e| e.to_string())?;
        self.conn
            .query_row(
                "SELECT value FROM agent_meta WHERE key='libraryInstanceId'",
                [],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())
    }
    pub fn create_run(&self, input: NewAgentRun) -> Result<AgentRunRecord, String> {
        if input.objective.trim().is_empty() {
            return Err("AGENT_RUN_OBJECTIVE_REQUIRED".into());
        }
        if input.objective.len() > AGENT_OBJECTIVE_MAX_BYTES {
            return Err("AGENT_RUN_OBJECTIVE_TOO_LARGE".into());
        }
        validate_storable_json(&Value::String(input.objective.clone()))?;
        validate_budget(&input.budget)?;
        let library = self.library_instance_id(input.now_ms)?;
        let budget = json_text(&input.budget, AGENT_PLAN_MAX_BYTES)?;
        let usage = json_text(&AgentBudgetUsage::default(), AGENT_EVENT_MAX_BYTES)?;
        let tx = self
            .conn
            .unchecked_transaction()
            .map_err(|e| e.to_string())?;
        tx.execute("INSERT INTO agent_runs(id,library_instance_id,project_id,snapshot_id,automation_mode,status,objective,budget_json,budget_usage_json,created_at_ms,updated_at_ms) VALUES(?1,?2,?3,?4,?5,'draft',?6,?7,?8,?9,?9)",params![input.id,library,input.project_id,input.snapshot_id,enum_text(input.automation_mode)?,input.objective,budget,usage,input.now_ms]).map_err(|e|e.to_string())?;
        append_event(
            &tx,
            &input.id,
            "run_created",
            None,
            &json!({"status":"draft"}),
            input.now_ms,
        )?;
        tx.commit().map_err(|e| e.to_string())?;
        self.get_run(&input.id)?
            .ok_or_else(|| "AGENT_RUN_CREATE_FAILED".into())
    }
    pub fn get_run(&self, id: &str) -> Result<Option<AgentRunRecord>, String> {
        self.conn.query_row("SELECT id,library_instance_id,project_id,snapshot_id,automation_mode,status,objective,budget_json,budget_usage_json,current_plan_version,decision_summary_json,last_error_code,created_at_ms,updated_at_ms,completed_at_ms FROM agent_runs WHERE id=?1",params![id],row_to_run).optional().map_err(|e|e.to_string())
    }
    pub fn list_runs(
        &self,
        project: &str,
        limit: u32,
        offset: u32,
    ) -> Result<Vec<AgentRunRecord>, String> {
        let mut s=self.conn.prepare("SELECT id,library_instance_id,project_id,snapshot_id,automation_mode,status,objective,budget_json,budget_usage_json,current_plan_version,decision_summary_json,last_error_code,created_at_ms,updated_at_ms,completed_at_ms FROM agent_runs WHERE project_id=?1 ORDER BY updated_at_ms DESC,id LIMIT ?2 OFFSET ?3").map_err(|e|e.to_string())?;
        let rows = s
            .query_map(params![project, limit.clamp(1, 100), offset], row_to_run)
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        Ok(rows)
    }
    pub fn save_plan(&self, run_id: &str, plan: &AgentPlan, now: i64) -> Result<String, String> {
        let bindings = plan
            .steps
            .iter()
            .map(|step| AgentStepExecutionBinding {
                step_id: step.id.clone(),
                tool_name: step.tool.clone(),
                tool_version: "1".into(),
                registry_hash: String::new(),
                unresolved_input: step.input.clone(),
                authoritative_risk: step.risk,
            })
            .collect::<Vec<_>>();
        self.save_generated_plan(run_id, plan, &bindings, "", "", "", now)
    }

    pub fn save_generated_plan(
        &self,
        run_id: &str,
        plan: &AgentPlan,
        bindings: &[AgentStepExecutionBinding],
        registry_hash: &str,
        planner_profile_hash: &str,
        writer_profile_hash: &str,
        now: i64,
    ) -> Result<String, String> {
        self.save_generated_plan_internal(
            run_id,
            plan,
            bindings,
            registry_hash,
            planner_profile_hash,
            writer_profile_hash,
            None,
            None,
            now,
        )
    }

    pub fn save_generated_plan_and_transition(
        &self,
        run_id: &str,
        plan: &AgentPlan,
        bindings: &[AgentStepExecutionBinding],
        registry_hash: &str,
        planner_profile_hash: &str,
        writer_profile_hash: &str,
        target_status: AgentRunStatus,
        now: i64,
    ) -> Result<String, String> {
        if !matches!(
            target_status,
            AgentRunStatus::AwaitingPlanApproval | AgentRunStatus::Evaluating
        ) {
            return Err("AGENT_PLAN_TARGET_STATUS_INVALID".into());
        }
        self.save_generated_plan_internal(
            run_id,
            plan,
            bindings,
            registry_hash,
            planner_profile_hash,
            writer_profile_hash,
            None,
            Some(target_status),
            now,
        )
    }

    pub fn save_generated_plan_fenced(
        &self,
        fence: &AgentLeaseFence,
        plan: &AgentPlan,
        bindings: &[AgentStepExecutionBinding],
        registry_hash: &str,
        planner_profile_hash: &str,
        writer_profile_hash: &str,
        target_status: AgentRunStatus,
        now: i64,
    ) -> Result<String, String> {
        if !matches!(
            target_status,
            AgentRunStatus::AwaitingPlanApproval | AgentRunStatus::Evaluating
        ) {
            return Err("AGENT_PLAN_TARGET_STATUS_INVALID".into());
        }
        self.save_generated_plan_internal(
            &fence.run_id,
            plan,
            bindings,
            registry_hash,
            planner_profile_hash,
            writer_profile_hash,
            Some(fence),
            Some(target_status),
            now,
        )
    }

    fn save_generated_plan_internal(
        &self,
        run_id: &str,
        plan: &AgentPlan,
        bindings: &[AgentStepExecutionBinding],
        registry_hash: &str,
        planner_profile_hash: &str,
        writer_profile_hash: &str,
        fence: Option<&AgentLeaseFence>,
        target_status: Option<AgentRunStatus>,
        now: i64,
    ) -> Result<String, String> {
        let run = self.get_run(run_id)?.ok_or("AGENT_RUN_NOT_FOUND")?;
        validate_plan(plan, &run.budget)?;
        if let Some(target) = target_status {
            if run.status != AgentRunStatus::Planning {
                return Err("AGENT_RUN_NOT_PLANNING".into());
            }
            validate_run_transition(run.status, target)?;
            if matches!(run.automation_mode, AgentAutomationMode::Advisor)
                != (target == AgentRunStatus::Evaluating)
            {
                return Err("AGENT_PLAN_TARGET_MODE_MISMATCH".into());
            }
        }
        if bindings.len() != plan.steps.len() {
            return Err("AGENT_PLAN_BINDING_COUNT_MISMATCH".into());
        }
        for (step, binding) in plan.steps.iter().zip(bindings) {
            if binding.step_id != step.id
                || binding.tool_name != step.tool
                || binding.unresolved_input != step.input
                || binding.authoritative_risk != step.risk
                || binding.tool_version.trim().is_empty()
                || binding.registry_hash != registry_hash
            {
                return Err("AGENT_PLAN_BINDING_MISMATCH".into());
            }
        }
        let text = json_text(plan, AGENT_PLAN_MAX_BYTES)?;
        let base_hash = plan_approval_hash(plan)?;
        let hash = canonical_value_sha256(&json!({
            "planHash":base_hash,
            "registryHash":registry_hash,
            "plannerProfileHash":planner_profile_hash,
            "writerProfileHash":writer_profile_hash,
            "steps":bindings,
        }))?;
        let tx = self
            .conn
            .unchecked_transaction()
            .map_err(|e| e.to_string())?;
        if let Some(fence) = fence {
            assert_fence(&tx, fence, now)?;
            let (status, current_version): (AgentRunStatus, Option<u32>) = tx
                .query_row(
                    "SELECT status,current_plan_version FROM agent_runs WHERE id=?1",
                    params![run_id],
                    |row| {
                        Ok((
                            enum_parse(&row.get::<_, String>(0)?).map_err(sql_error)?,
                            row.get::<_, Option<i64>>(1)?.map(|value| value as u32),
                        ))
                    },
                )
                .map_err(|e| e.to_string())?;
            if status != AgentRunStatus::Planning
                || status != run.status
                || current_version != run.current_plan_version
            {
                return Err("AGENT_PLAN_SAVE_FENCE_STALE".into());
            }
        }
        tx.execute(
            "INSERT INTO agent_plans(run_id,version,plan_json,plan_hash,registry_hash,planner_profile_hash,writer_profile_hash,created_at_ms) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)",
            params![run_id, plan.version, text, hash, registry_hash, planner_profile_hash, writer_profile_hash, now],
        )
        .map_err(|e| e.to_string())?;
        for (n, (step, binding)) in plan.steps.iter().zip(bindings).enumerate() {
            let input = value_text(&binding.unresolved_input, AGENT_OBSERVATION_MAX_BYTES)?;
            tx.execute("INSERT INTO agent_steps(run_id,plan_version,step_id,ordinal,title,tool_name,tool_version,registry_hash,input_json,risk,status,updated_at_ms) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,'planned',?11)",params![run_id,plan.version,step.id,n as i64,step.title,binding.tool_name,binding.tool_version,binding.registry_hash,input,enum_text(binding.authoritative_risk)?,now]).map_err(|e|e.to_string())?;
        }
        tx.execute(
            "UPDATE agent_runs SET current_plan_version=?2,updated_at_ms=?3 WHERE id=?1",
            params![run_id, plan.version, now],
        )
        .map_err(|e| e.to_string())?;
        append_event(
            &tx,
            run_id,
            "plan_saved",
            None,
            &json!({"version":plan.version,"planHash":hash,"registryHash":registry_hash,"plannerProfileHash":planner_profile_hash,"writerProfileHash":writer_profile_hash}),
            now,
        )?;
        if let Some(target) = target_status {
            tx.execute(
                "UPDATE agent_runs SET status=?2,updated_at_ms=?3 WHERE id=?1",
                params![run_id, enum_text(target)?, now],
            )
            .map_err(|e| e.to_string())?;
            append_event(
                &tx,
                run_id,
                "run_status_changed",
                None,
                &json!({"from":run.status,"to":target,"errorCode":Value::Null}),
                now,
            )?;
            if target == AgentRunStatus::AwaitingPlanApproval {
                if let Some(fence) = fence {
                    delete_fence(&tx, fence)?;
                }
            }
        }
        tx.commit().map_err(|e| e.to_string())?;
        Ok(hash)
    }
    pub fn transition_run(
        &self,
        id: &str,
        to: AgentRunStatus,
        error: Option<&str>,
        now: i64,
    ) -> Result<(), String> {
        if let Some(error) = error {
            validate_error_code(error)?;
        }
        let from = self.get_run(id)?.ok_or("AGENT_RUN_NOT_FOUND")?.status;
        validate_run_transition(from, to)?;
        let terminal = matches!(
            to,
            AgentRunStatus::Cancelled | AgentRunStatus::Failed | AgentRunStatus::Completed
        );
        let tx = self
            .conn
            .unchecked_transaction()
            .map_err(|e| e.to_string())?;
        tx.execute("UPDATE agent_runs SET status=?2,last_error_code=?3,updated_at_ms=?4,completed_at_ms=CASE WHEN ?5 THEN ?4 ELSE NULL END WHERE id=?1",params![id,enum_text(to)?,error,now,terminal]).map_err(|e|e.to_string())?;
        append_event(
            &tx,
            id,
            "run_status_changed",
            None,
            &json!({"from":from,"to":to,"errorCode":error}),
            now,
        )?;
        tx.commit().map_err(|e| e.to_string())
    }
    pub fn transition_run_fenced(
        &self,
        fence: &AgentLeaseFence,
        expected_from: AgentRunStatus,
        to: AgentRunStatus,
        error: Option<&str>,
        now: i64,
    ) -> Result<(), String> {
        if let Some(error) = error {
            validate_error_code(error)?;
        }
        validate_run_transition(expected_from, to)?;
        let tx = self
            .conn
            .unchecked_transaction()
            .map_err(|e| e.to_string())?;
        assert_fence(&tx, fence, now)?;
        let from: AgentRunStatus = tx
            .query_row(
                "SELECT status FROM agent_runs WHERE id=?1",
                params![fence.run_id],
                |row| row.get::<_, String>(0),
            )
            .map_err(|e| e.to_string())
            .and_then(|value| enum_parse(&value))?;
        if from != expected_from {
            return Err("AGENT_RUN_STATUS_STALE".into());
        }
        let terminal = matches!(
            to,
            AgentRunStatus::Cancelled | AgentRunStatus::Failed | AgentRunStatus::Completed
        );
        tx.execute("UPDATE agent_runs SET status=?2,last_error_code=?3,updated_at_ms=?4,completed_at_ms=CASE WHEN ?5 THEN ?4 ELSE NULL END WHERE id=?1",params![fence.run_id,enum_text(to)?,error,now,terminal]).map_err(|e|e.to_string())?;
        append_event(
            &tx,
            &fence.run_id,
            "run_status_changed",
            None,
            &json!({"from":from,"to":to,"errorCode":error}),
            now,
        )?;
        if matches!(
            to,
            AgentRunStatus::AwaitingPlanApproval
                | AgentRunStatus::AwaitingActionApproval
                | AgentRunStatus::AwaitingUser
                | AgentRunStatus::Paused
                | AgentRunStatus::Cancelled
                | AgentRunStatus::Failed
                | AgentRunStatus::Completed
        ) {
            delete_fence(&tx, fence)?;
        }
        tx.commit().map_err(|e| e.to_string())
    }

    pub fn pause_run(&self, id: &str, now: i64) -> Result<(), String> {
        let tx = self
            .conn
            .unchecked_transaction()
            .map_err(|e| e.to_string())?;
        let from: AgentRunStatus = tx
            .query_row(
                "SELECT status FROM agent_runs WHERE id=?1",
                params![id],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(|e| e.to_string())?
            .map(|value| enum_parse(&value))
            .transpose()?
            .ok_or("AGENT_RUN_NOT_FOUND")?;
        validate_run_transition(from, AgentRunStatus::Paused)?;
        tx.execute(
            "UPDATE agent_runs SET updated_at_ms=updated_at_ms WHERE id=?1",
            params![id],
        )
        .map_err(|e| e.to_string())?;
        let running_steps=tx.execute("UPDATE agent_steps SET status='ready',last_error_code='AGENT_EXECUTION_PAUSED',finished_at_ms=NULL,updated_at_ms=?2 WHERE run_id=?1 AND plan_version=(SELECT current_plan_version FROM agent_runs WHERE id=?1) AND status='running'",params![id,now]).map_err(|e|e.to_string())?;
        if running_steps > 0 {
            append_event(
                &tx,
                id,
                "step_requeued_after_pause",
                None,
                &json!({"count":running_steps,"errorCode":"AGENT_EXECUTION_PAUSED"}),
                now,
            )?;
        }
        tx.execute("DELETE FROM agent_run_leases WHERE run_id=?1", params![id])
            .map_err(|e| e.to_string())?;
        tx.execute("UPDATE agent_runs SET status='paused',last_error_code=NULL,updated_at_ms=?2 WHERE id=?1",params![id,now]).map_err(|e|e.to_string())?;
        append_event(
            &tx,
            id,
            "run_status_changed",
            None,
            &json!({"from":from,"to":AgentRunStatus::Paused,"errorCode":Value::Null}),
            now,
        )?;
        tx.commit().map_err(|e| e.to_string())
    }

    pub fn rebind_snapshot_for_planning_fenced(
        &self,
        fence: &AgentLeaseFence,
        snapshot_id: &str,
        now: i64,
    ) -> Result<(), String> {
        if snapshot_id.trim().is_empty() {
            return Err("AGENT_V20_SNAPSHOT_REQUIRED".into());
        }
        let tx = self
            .conn
            .unchecked_transaction()
            .map_err(|e| e.to_string())?;
        assert_fence(&tx, fence, now)?;
        let (status, previous): (AgentRunStatus, Option<String>) = tx
            .query_row(
                "SELECT status,snapshot_id FROM agent_runs WHERE id=?1",
                params![fence.run_id],
                |row| {
                    Ok((
                        enum_parse(&row.get::<_, String>(0)?).map_err(sql_error)?,
                        row.get(1)?,
                    ))
                },
            )
            .map_err(|e| e.to_string())?;
        if status != AgentRunStatus::Planning {
            return Err("AGENT_RUN_NOT_PLANNING".into());
        }
        if previous.as_deref() != Some(snapshot_id) {
            tx.execute(
                "UPDATE agent_runs SET snapshot_id=?2,updated_at_ms=?3 WHERE id=?1",
                params![fence.run_id, snapshot_id, now],
            )
            .map_err(|e| e.to_string())?;
            append_event(
                &tx,
                &fence.run_id,
                "run_snapshot_rebound",
                None,
                &json!({"previousSnapshotId":previous,"snapshotId":snapshot_id}),
                now,
            )?;
        }
        tx.commit().map_err(|e| e.to_string())
    }

    pub fn evaluate_completion<F>(
        &self,
        fence: &AgentLeaseFence,
        now: i64,
        evaluate: F,
    ) -> Result<AgentRunStatus, String>
    where
        F: FnOnce(
            &Connection,
            &AgentRepository<'_>,
        ) -> Result<(AgentRunStatus, Option<String>), String>,
    {
        let tx = self
            .conn
            .unchecked_transaction()
            .map_err(|e| e.to_string())?;
        assert_fence(&tx, fence, now)?;
        let locked=tx.execute("UPDATE agent_runs SET updated_at_ms=updated_at_ms WHERE id=?1 AND status='evaluating'",params![fence.run_id]).map_err(|e|e.to_string())?;
        if locked != 1 {
            return Err("AGENT_RUN_NOT_EVALUATING".into());
        }
        let scoped = AgentRepository { conn: &tx };
        let (target, error) = evaluate(&tx, &scoped)?;
        if !matches!(
            target,
            AgentRunStatus::Completed | AgentRunStatus::AwaitingUser | AgentRunStatus::Failed
        ) {
            return Err("AGENT_COMPLETION_TARGET_INVALID".into());
        }
        if let Some(error) = error.as_deref() {
            validate_error_code(error)?;
        }
        validate_run_transition(AgentRunStatus::Evaluating, target)?;
        let terminal = matches!(target, AgentRunStatus::Completed | AgentRunStatus::Failed);
        tx.execute("UPDATE agent_runs SET status=?2,last_error_code=?3,updated_at_ms=?4,completed_at_ms=CASE WHEN ?5 THEN ?4 ELSE NULL END WHERE id=?1",params![fence.run_id,enum_text(target)?,error,now,terminal]).map_err(|e|e.to_string())?;
        append_event(
            &tx,
            &fence.run_id,
            "run_status_changed",
            None,
            &json!({"from":AgentRunStatus::Evaluating,"to":target,"errorCode":error}),
            now,
        )?;
        delete_fence(&tx, fence)?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(target)
    }

    pub fn skip_step_fenced(
        &self,
        fence: &AgentLeaseFence,
        plan_version: u32,
        step_id: &str,
        reason: &str,
        now: i64,
    ) -> Result<(), String> {
        validate_error_code(reason)?;
        let tx = self
            .conn
            .unchecked_transaction()
            .map_err(|e| e.to_string())?;
        assert_fence(&tx, fence, now)?;
        let run_status: AgentRunStatus = tx
            .query_row(
                "SELECT status FROM agent_runs WHERE id=?1 AND current_plan_version=?2",
                params![fence.run_id, plan_version],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(|e| e.to_string())?
            .map(|value| enum_parse(&value))
            .transpose()?
            .ok_or("AGENT_PLAN_VERSION_STALE")?;
        if !matches!(
            run_status,
            AgentRunStatus::Running | AgentRunStatus::Evaluating
        ) {
            return Err("AGENT_RUN_NOT_EXECUTING".into());
        }
        let from: AgentStepStatus = tx
            .query_row(
                "SELECT status FROM agent_steps WHERE run_id=?1 AND plan_version=?2 AND step_id=?3",
                params![fence.run_id, plan_version, step_id],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(|e| e.to_string())?
            .map(|value| enum_parse(&value))
            .transpose()?
            .ok_or("AGENT_STEP_NOT_FOUND")?;
        validate_step_transition(from, AgentStepStatus::Skipped)?;
        tx.execute("UPDATE agent_steps SET status='skipped',last_error_code=?4,finished_at_ms=?5,updated_at_ms=?5 WHERE run_id=?1 AND plan_version=?2 AND step_id=?3",params![fence.run_id,plan_version,step_id,reason,now]).map_err(|e|e.to_string())?;
        append_event(
            &tx,
            &fence.run_id,
            "step_skipped",
            Some(step_id),
            &json!({"planVersion":plan_version,"reason":reason}),
            now,
        )?;
        tx.commit().map_err(|e| e.to_string())
    }

    pub fn skip_report_revision_fenced(
        &self,
        fence: &AgentLeaseFence,
        plan_version: u32,
        now: i64,
    ) -> Result<(), String> {
        const REASON: &str = "AGENT_REPORT_REVISION_NOT_REQUIRED";
        let tx = self
            .conn
            .unchecked_transaction()
            .map_err(|error| error.to_string())?;
        assert_fence(&tx, fence, now)?;
        assert_current_run_and_plan(&tx, fence, plan_version, AgentRunStatus::Running)?;
        for step_id in ["revise-high-risk", "audit-revised"] {
            let (status, error): (AgentStepStatus, Option<String>) = tx
                .query_row(
                    "SELECT status,last_error_code FROM agent_steps WHERE run_id=?1 AND plan_version=?2 AND step_id=?3",
                    params![fence.run_id, plan_version, step_id],
                    |row| {
                        Ok((
                            enum_parse(&row.get::<_, String>(0)?).map_err(sql_error)?,
                            row.get(1)?,
                        ))
                    },
                )
                .optional()
                .map_err(|query_error| query_error.to_string())?
                .ok_or("AGENT_STEP_NOT_FOUND")?;
            if status == AgentStepStatus::Skipped && error.as_deref() == Some(REASON) {
                continue;
            }
            validate_step_transition(status, AgentStepStatus::Skipped)?;
            tx.execute(
                "UPDATE agent_steps SET status='skipped',last_error_code=?4,finished_at_ms=?5,updated_at_ms=?5 WHERE run_id=?1 AND plan_version=?2 AND step_id=?3",
                params![fence.run_id, plan_version, step_id, REASON, now],
            )
            .map_err(|update_error| update_error.to_string())?;
            append_event(
                &tx,
                &fence.run_id,
                "step_skipped",
                Some(step_id),
                &json!({"planVersion":plan_version,"reason":REASON}),
                now,
            )?;
        }
        tx.commit().map_err(|error| error.to_string())
    }
    pub fn transition_step(
        &self,
        run: &str,
        version: u32,
        step: &str,
        to: AgentStepStatus,
        observation: Option<&Value>,
        error: Option<&str>,
        now: i64,
    ) -> Result<(), String> {
        if let Some(error) = error {
            validate_error_code(error)?;
        }
        let from: AgentStepStatus = self
            .conn
            .query_row(
                "SELECT status FROM agent_steps WHERE run_id=?1 AND plan_version=?2 AND step_id=?3",
                params![run, version, step],
                |r| r.get::<_, String>(0),
            )
            .optional()
            .map_err(|e| e.to_string())?
            .map(|v| enum_parse(&v))
            .transpose()?
            .ok_or("AGENT_STEP_NOT_FOUND")?;
        validate_step_transition(from, to)?;
        let observation = observation
            .map(|v| value_text(v, AGENT_OBSERVATION_MAX_BYTES))
            .transpose()?;
        let terminal = matches!(
            to,
            AgentStepStatus::Succeeded | AgentStepStatus::Failed | AgentStepStatus::Skipped
        );
        let tx = self
            .conn
            .unchecked_transaction()
            .map_err(|e| e.to_string())?;
        tx.execute("UPDATE agent_steps SET status=?4,observation_json=?5,last_error_code=?6,started_at_ms=CASE WHEN ?4='running' AND started_at_ms IS NULL THEN ?7 ELSE started_at_ms END,finished_at_ms=CASE WHEN ?8 THEN ?7 ELSE NULL END,updated_at_ms=?7 WHERE run_id=?1 AND plan_version=?2 AND step_id=?3",params![run,version,step,enum_text(to)?,observation,error,now,terminal]).map_err(|e|e.to_string())?;
        append_event(
            &tx,
            run,
            "step_status_changed",
            Some(step),
            &json!({"planVersion":version,"from":from,"to":to,"errorCode":error}),
            now,
        )?;
        tx.commit().map_err(|e| e.to_string())
    }
    pub fn record_approval(
        &self,
        id: &str,
        run: &str,
        version: Option<u32>,
        step: Option<&str>,
        kind: &str,
        decision: &str,
        hash: &str,
        risk: Option<AgentRiskLevel>,
        actor: &str,
        reason: Option<&str>,
        now: i64,
    ) -> Result<(), String> {
        if !matches!(kind, "plan" | "action")
            || !matches!(decision, "approved" | "rejected" | "revoked")
        {
            return Err("AGENT_APPROVAL_INVALID".into());
        }
        let (registry_hash, tool_version, model_profile_hash) = if kind == "plan" {
            let v = version.ok_or("AGENT_APPROVAL_PLAN_VERSION_REQUIRED")?;
            let current:Option<(i64,String,String,String)>=self.conn.query_row("SELECT r.current_plan_version,p.plan_hash,p.registry_hash,p.planner_profile_hash FROM agent_runs r JOIN agent_plans p ON p.run_id=r.id AND p.version=r.current_plan_version WHERE r.id=?1",params![run],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?))).optional().map_err(|e|e.to_string())?;
            if current.as_ref().map(|(x, h, _, _)| (*x as u32, h.as_str())) != Some((v, hash)) {
                return Err("AGENT_PLAN_APPROVAL_STALE".into());
            }
            let (_, _, registry, profile) = current.expect("checked above");
            (registry, None, Some(profile))
        } else {
            let v = version.ok_or("AGENT_APPROVAL_PLAN_VERSION_REQUIRED")?;
            let step = step.ok_or("AGENT_APPROVAL_STEP_REQUIRED")?;
            let (tool,tool_version,registry,input,risk_text,stored_action_hash,writer_profile):(String,String,String,String,String,Option<String>,String)=self.conn.query_row("SELECT s.tool_name,s.tool_version,s.registry_hash,COALESCE(s.resolved_input_json,s.input_json),s.risk,s.action_hash,p.writer_profile_hash FROM agent_steps s JOIN agent_plans p ON p.run_id=s.run_id AND p.version=s.plan_version WHERE s.run_id=?1 AND s.plan_version=?2 AND s.step_id=?3",params![run,v,step],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?,r.get(5)?,r.get(6)?))).optional().map_err(|e|e.to_string())?.ok_or("AGENT_STEP_NOT_FOUND")?;
            let stored_risk: AgentRiskLevel = enum_parse(&risk_text)?;
            if risk != Some(stored_risk) {
                return Err("AGENT_ACTION_APPROVAL_STALE".into());
            }
            let action = AgentAction::CallTool {
                tool,
                input: serde_json::from_str(&input).map_err(|e| e.to_string())?,
                risk: stored_risk,
            };
            let expected_hash = stored_action_hash.unwrap_or(action_approval_hash(&action)?);
            if expected_hash != hash {
                return Err("AGENT_ACTION_APPROVAL_STALE".into());
            }
            (registry, Some(tool_version), Some(writer_profile))
        };
        let payload = json!({"kind":kind,"decision":decision,"planVersion":version,"stepId":step,"hash":hash,"risk":risk,"actorId":actor,"policyReason":reason});
        value_text(&payload, AGENT_EVENT_MAX_BYTES)?;
        let tx = self
            .conn
            .unchecked_transaction()
            .map_err(|e| e.to_string())?;
        let decision_sequence: i64 = tx
            .query_row(
                "SELECT COALESCE(MAX(decision_sequence),0)+1 FROM agent_approvals WHERE run_id=?1",
                params![run],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        tx.execute(
            "INSERT INTO agent_approvals(id,run_id,decision_sequence,plan_version,step_id,approval_kind,decision,approved_hash,risk,registry_hash,tool_version,model_profile_hash,actor_id,policy_reason,created_at_ms) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)",
            params![
                id,
                run,
                decision_sequence,
                version,
                step,
                kind,
                decision,
                hash,
                risk.map(enum_text).transpose()?,
                registry_hash,
                tool_version,
                model_profile_hash,
                actor,
                reason,
                now
            ],
        )
        .map_err(|e| e.to_string())?;
        append_event(&tx, run, "approval_recorded", step, &payload, now)?;
        tx.commit().map_err(|e| e.to_string())
    }

    pub fn resolve_effective_approval(
        &self,
        run: &str,
        version: u32,
        step: Option<&str>,
        kind: &str,
        expected_hash: &str,
        registry_hash: &str,
        tool_version: Option<&str>,
        model_profile_hash: Option<&str>,
    ) -> Result<Option<AgentEffectiveApproval>, String> {
        if !matches!(kind, "plan" | "action") {
            return Err("AGENT_APPROVAL_INVALID".into());
        }
        let record = self
            .conn
            .query_row(
                "SELECT id,run_id,decision_sequence,plan_version,step_id,approval_kind,decision,approved_hash,risk,registry_hash,tool_version,model_profile_hash,actor_id,policy_reason,created_at_ms FROM agent_approvals WHERE run_id=?1 AND plan_version=?2 AND approval_kind=?3 AND ((?4 IS NULL AND step_id IS NULL) OR step_id=?4) ORDER BY decision_sequence DESC LIMIT 1",
                params![run, version, kind, step],
                row_to_approval,
            )
            .optional()
            .map_err(|e| e.to_string())?;
        Ok(record.map(|record| {
            let is_approved = record.decision == "approved"
                && record.approved_hash == expected_hash
                && record.registry_hash == registry_hash
                && record.tool_version.as_deref() == tool_version
                && record.model_profile_hash.as_deref() == model_profile_hash;
            AgentEffectiveApproval {
                record,
                is_approved,
            }
        }))
    }

    pub fn decide_current_plan(
        &self,
        run: &str,
        decision: &str,
        actor: &str,
        reason: Option<&str>,
        now: i64,
    ) -> Result<AgentApprovalRecord, String> {
        if !matches!(decision, "approved" | "rejected" | "revoked") {
            return Err("AGENT_APPROVAL_INVALID".into());
        }
        value_text(
            &json!({"actorId":actor,"policyReason":reason}),
            AGENT_EVENT_MAX_BYTES,
        )?;
        let tx = self
            .conn
            .unchecked_transaction()
            .map_err(|e| e.to_string())?;
        let (status,version,hash,registry,planner_profile):(AgentRunStatus,u32,String,String,String)=tx.query_row("SELECT r.status,r.current_plan_version,p.plan_hash,p.registry_hash,p.planner_profile_hash FROM agent_runs r JOIN agent_plans p ON p.run_id=r.id AND p.version=r.current_plan_version WHERE r.id=?1",params![run],|row|Ok((enum_parse(&row.get::<_,String>(0)?).map_err(sql_error)?,row.get::<_,i64>(1)? as u32,row.get(2)?,row.get(3)?,row.get(4)?))).optional().map_err(|e|e.to_string())?.ok_or("AGENT_CURRENT_PLAN_NOT_FOUND")?;
        let status_allowed = status == AgentRunStatus::AwaitingPlanApproval
            || (decision == "revoked" && status == AgentRunStatus::Ready);
        if !status_allowed {
            return Err("AGENT_RUN_NOT_AWAITING_PLAN_APPROVAL".into());
        }
        let target = if decision == "approved" {
            AgentRunStatus::Ready
        } else {
            AgentRunStatus::Planning
        };
        validate_run_transition(status, target)?;
        let sequence: i64 = tx
            .query_row(
                "SELECT COALESCE(MAX(decision_sequence),0)+1 FROM agent_approvals WHERE run_id=?1",
                params![run],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        let id: String = tx
            .query_row("SELECT lower(hex(randomblob(16)))", [], |row| row.get(0))
            .map_err(|e| e.to_string())?;
        tx.execute("INSERT INTO agent_approvals(id,run_id,decision_sequence,plan_version,step_id,approval_kind,decision,approved_hash,risk,registry_hash,tool_version,model_profile_hash,actor_id,policy_reason,created_at_ms) VALUES(?1,?2,?3,?4,NULL,'plan',?5,?6,NULL,?7,NULL,?8,?9,?10,?11)",params![id,run,sequence,version,decision,hash,registry,planner_profile,actor,reason,now]).map_err(|e|e.to_string())?;
        if decision == "approved" {
            tx.execute("UPDATE agent_steps SET status='ready',updated_at_ms=?3 WHERE run_id=?1 AND plan_version=?2 AND status='planned'",params![run,version,now]).map_err(|e|e.to_string())?;
        }
        tx.execute(
            "UPDATE agent_runs SET status=?2,updated_at_ms=?3 WHERE id=?1",
            params![run, enum_text(target)?, now],
        )
        .map_err(|e| e.to_string())?;
        append_event(
            &tx,
            run,
            "approval_recorded",
            None,
            &json!({"approvalId":id,"kind":"plan","decision":decision,"planVersion":version,"actorId":actor,"policyReason":reason}),
            now,
        )?;
        append_event(
            &tx,
            run,
            "run_status_changed",
            None,
            &json!({"from":status,"to":target,"errorCode":Value::Null}),
            now,
        )?;
        tx.commit().map_err(|e| e.to_string())?;
        self.conn.query_row("SELECT id,run_id,decision_sequence,plan_version,step_id,approval_kind,decision,approved_hash,risk,registry_hash,tool_version,model_profile_hash,actor_id,policy_reason,created_at_ms FROM agent_approvals WHERE id=?1",params![id],row_to_approval).map_err(|e|e.to_string())
    }

    pub fn decide_current_action(
        &self,
        run: &str,
        step_id: &str,
        decision: &str,
        actor: &str,
        reason: Option<&str>,
        now: i64,
    ) -> Result<AgentApprovalRecord, String> {
        if !matches!(decision, "approved" | "rejected" | "revoked") {
            return Err("AGENT_APPROVAL_INVALID".into());
        }
        value_text(
            &json!({"actorId":actor,"policyReason":reason}),
            AGENT_EVENT_MAX_BYTES,
        )?;
        let tx = self
            .conn
            .unchecked_transaction()
            .map_err(|e| e.to_string())?;
        let (status,version,step_status,hash,risk,registry,tool_version,writer_profile):(AgentRunStatus,u32,AgentStepStatus,String,AgentRiskLevel,String,String,String)=tx.query_row("SELECT r.status,r.current_plan_version,s.status,s.pending_approval_hash,s.risk,s.registry_hash,s.tool_version,p.writer_profile_hash FROM agent_runs r JOIN agent_steps s ON s.run_id=r.id AND s.plan_version=r.current_plan_version JOIN agent_plans p ON p.run_id=s.run_id AND p.version=s.plan_version WHERE r.id=?1 AND s.step_id=?2",params![run,step_id],|row|Ok((enum_parse(&row.get::<_,String>(0)?).map_err(sql_error)?,row.get::<_,i64>(1)? as u32,enum_parse(&row.get::<_,String>(2)?).map_err(sql_error)?,row.get(3)?,enum_parse(&row.get::<_,String>(4)?).map_err(sql_error)?,row.get(5)?,row.get(6)?,row.get(7)?))).optional().map_err(|e|e.to_string())?.ok_or("AGENT_PENDING_ACTION_NOT_FOUND")?;
        if status != AgentRunStatus::AwaitingActionApproval || step_status != AgentStepStatus::Ready
        {
            return Err("AGENT_RUN_NOT_AWAITING_ACTION_APPROVAL".into());
        }
        let sequence: i64 = tx
            .query_row(
                "SELECT COALESCE(MAX(decision_sequence),0)+1 FROM agent_approvals WHERE run_id=?1",
                params![run],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        let id: String = tx
            .query_row("SELECT lower(hex(randomblob(16)))", [], |row| row.get(0))
            .map_err(|e| e.to_string())?;
        tx.execute("INSERT INTO agent_approvals(id,run_id,decision_sequence,plan_version,step_id,approval_kind,decision,approved_hash,risk,registry_hash,tool_version,model_profile_hash,actor_id,policy_reason,created_at_ms) VALUES(?1,?2,?3,?4,?5,'action',?6,?7,?8,?9,?10,?11,?12,?13,?14)",params![id,run,sequence,version,step_id,decision,hash,enum_text(risk)?,registry,tool_version,writer_profile,actor,reason,now]).map_err(|e|e.to_string())?;
        append_event(
            &tx,
            run,
            "approval_recorded",
            Some(step_id),
            &json!({"approvalId":id,"kind":"action","decision":decision,"planVersion":version,"stepId":step_id,"actorId":actor,"policyReason":reason}),
            now,
        )?;
        if decision != "approved" {
            validate_run_transition(status, AgentRunStatus::AwaitingUser)?;
            validate_step_transition(step_status, AgentStepStatus::WaitingUser)?;
            tx.execute("UPDATE agent_steps SET status='waiting_user',updated_at_ms=?4 WHERE run_id=?1 AND plan_version=?2 AND step_id=?3",params![run,version,step_id,now]).map_err(|e|e.to_string())?;
            tx.execute(
                "UPDATE agent_runs SET status='awaiting_user',updated_at_ms=?2 WHERE id=?1",
                params![run, now],
            )
            .map_err(|e| e.to_string())?;
            let question_id: String = tx
                .query_row("SELECT lower(hex(randomblob(16)))", [], |row| row.get(0))
                .map_err(|e| e.to_string())?;
            let prompt="该写动作已被拒绝或撤销。请说明希望如何调整研究计划；提交回答后会生成新计划，旧批准不会复用。";
            tx.execute("INSERT INTO agent_questions(id,run_id,plan_version,step_id,prompt,answer_type,options_json,requires_replan,created_at_ms) VALUES(?1,?2,?3,?4,?5,'text',NULL,1,?6)",params![question_id,run,version,step_id,prompt,now]).map_err(|e|e.to_string())?;
            append_event(
                &tx,
                run,
                "user_question_recorded",
                Some(step_id),
                &json!({"questionId":question_id,"planVersion":version,"answerType":AgentQuestionType::Text,"requiresReplan":true}),
                now,
            )?;
            append_event(
                &tx,
                run,
                "run_status_changed",
                Some(step_id),
                &json!({"from":status,"to":AgentRunStatus::AwaitingUser,"errorCode":Value::Null}),
                now,
            )?;
        }
        tx.commit().map_err(|e| e.to_string())?;
        self.conn.query_row("SELECT id,run_id,decision_sequence,plan_version,step_id,approval_kind,decision,approved_hash,risk,registry_hash,tool_version,model_profile_hash,actor_id,policy_reason,created_at_ms FROM agent_approvals WHERE id=?1",params![id],row_to_approval).map_err(|e|e.to_string())
    }

    pub fn put_model_profile(
        &self,
        profile: &AgentModelProfileRecord,
    ) -> Result<AgentModelProfileRecord, String> {
        if profile.id.trim().is_empty()
            || profile.model.trim().is_empty()
            || profile.endpoint_origin.trim().is_empty()
            || profile.endpoint_origin.contains('@')
        {
            return Err("AGENT_MODEL_PROFILE_INVALID".into());
        }
        let expected_hash = canonical_value_sha256(&json!({
            "role":profile.role,
            "protocol":profile.protocol,
            "model":profile.model,
            "endpointOrigin":profile.endpoint_origin,
            "config":profile.config,
        }))?;
        if expected_hash != profile.config_sha256 {
            return Err("AGENT_MODEL_PROFILE_HASH_MISMATCH".into());
        }
        let config = value_text(&profile.config, AGENT_EVENT_MAX_BYTES)?;
        if let Some(existing) = self.get_model_profile_by_id(&profile.id)? {
            if existing.config_sha256 == profile.config_sha256 {
                return Ok(existing);
            }
            return Err("AGENT_MODEL_PROFILE_ID_REBIND_FORBIDDEN".into());
        }
        if let Some(existing) = self.get_model_profile_by_hash(&profile.config_sha256)? {
            if existing.id == profile.id {
                return Ok(existing);
            }
            return Err("AGENT_MODEL_PROFILE_HASH_ALREADY_BOUND".into());
        }
        self.conn
            .execute(
                "INSERT INTO agent_model_profiles(id,role,protocol,model,endpoint_origin,config_json,config_sha256,created_at_ms) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)",
                params![profile.id,enum_text(profile.role)?,enum_text(profile.protocol)?,profile.model,profile.endpoint_origin,config,profile.config_sha256,profile.created_at_ms],
            )
            .map_err(|e| e.to_string())?;
        self.get_model_profile_by_hash(&profile.config_sha256)?
            .ok_or_else(|| "AGENT_MODEL_PROFILE_CREATE_FAILED".into())
    }

    pub fn get_model_profile_by_id(
        &self,
        profile_id: &str,
    ) -> Result<Option<AgentModelProfileRecord>, String> {
        self.conn
            .query_row(
                "SELECT id,role,protocol,model,endpoint_origin,config_json,config_sha256,created_at_ms FROM agent_model_profiles WHERE id=?1",
                params![profile_id],
                row_to_model_profile,
            )
            .optional()
            .map_err(|e| e.to_string())
    }

    pub fn get_model_profile_by_hash(
        &self,
        config_hash: &str,
    ) -> Result<Option<AgentModelProfileRecord>, String> {
        self.conn
            .query_row(
                "SELECT id,role,protocol,model,endpoint_origin,config_json,config_sha256,created_at_ms FROM agent_model_profiles WHERE config_sha256=?1",
                params![config_hash],
                row_to_model_profile,
            )
            .optional()
            .map_err(|e| e.to_string())
    }

    pub fn resolve_model_profile_reference(
        &self,
        reference: &AgentModelProfileReference,
        expected_role: AgentModelRole,
    ) -> Result<AgentModelProfileRecord, String> {
        if reference.profile_id.trim().is_empty()
            || reference.profile_id.len() > 160
            || reference.config_sha256.len() != 64
            || !reference
                .config_sha256
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
        {
            return Err("AGENT_MODEL_PROFILE_REFERENCE_INVALID".into());
        }
        let profile = self
            .get_model_profile_by_id(&reference.profile_id)?
            .ok_or("AGENT_MODEL_PROFILE_NOT_FOUND")?;
        let expected_hash = canonical_value_sha256(&json!({
            "role":profile.role,
            "protocol":profile.protocol,
            "model":profile.model,
            "endpointOrigin":profile.endpoint_origin,
            "config":profile.config,
        }))?;
        if expected_hash != profile.config_sha256 {
            return Err("AGENT_MODEL_PROFILE_STORED_HASH_INVALID".into());
        }
        if profile.config_sha256 != reference.config_sha256 {
            return Err("AGENT_MODEL_PROFILE_REFERENCE_MISMATCH".into());
        }
        if profile.role != expected_role {
            return Err("AGENT_MODEL_PROFILE_ROLE_MISMATCH".into());
        }
        Ok(profile)
    }

    pub fn record_user_question(
        &self,
        fence: &AgentLeaseFence,
        id: &str,
        plan_version: Option<u32>,
        step_id: Option<&str>,
        question: &AgentQuestionRequest,
        now: i64,
    ) -> Result<AgentQuestionRecord, String> {
        validate_question_request(question)?;
        let options = if question.options.is_empty() {
            None
        } else {
            Some(value_text(&json!(question.options), AGENT_EVENT_MAX_BYTES)?)
        };
        let tx = self
            .conn
            .unchecked_transaction()
            .map_err(|e| e.to_string())?;
        assert_fence(&tx, fence, now)?;
        let (from, current_plan): (AgentRunStatus, Option<u32>) = tx
            .query_row(
                "SELECT status,current_plan_version FROM agent_runs WHERE id=?1",
                params![fence.run_id],
                |row| {
                    Ok((
                        enum_parse(&row.get::<_, String>(0)?).map_err(sql_error)?,
                        row.get::<_, Option<i64>>(1)?.map(|value| value as u32),
                    ))
                },
            )
            .map_err(|e| e.to_string())?;
        if plan_version.is_some() && plan_version != current_plan {
            return Err("AGENT_PLAN_VERSION_STALE".into());
        }
        validate_run_transition(from, AgentRunStatus::AwaitingUser)?;
        tx.execute("INSERT INTO agent_questions(id,run_id,plan_version,step_id,prompt,answer_type,options_json,requires_replan,created_at_ms) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)",params![id,fence.run_id,plan_version,step_id,question.prompt,enum_text(question.answer_type)?,options,question.requires_replan,now]).map_err(|e|e.to_string())?;
        if let (Some(version), Some(step)) = (plan_version, step_id) {
            let current: AgentStepStatus = tx.query_row("SELECT status FROM agent_steps WHERE run_id=?1 AND plan_version=?2 AND step_id=?3",params![fence.run_id,version,step],|row|row.get::<_,String>(0)).map_err(|e|e.to_string()).and_then(|value|enum_parse(&value))?;
            validate_step_transition(current, AgentStepStatus::WaitingUser)?;
            tx.execute("UPDATE agent_steps SET status='waiting_user',updated_at_ms=?4 WHERE run_id=?1 AND plan_version=?2 AND step_id=?3",params![fence.run_id,version,step,now]).map_err(|e|e.to_string())?;
        }
        tx.execute(
            "UPDATE agent_runs SET status='awaiting_user',updated_at_ms=?2 WHERE id=?1",
            params![fence.run_id, now],
        )
        .map_err(|e| e.to_string())?;
        append_event(
            &tx,
            &fence.run_id,
            "user_question_recorded",
            step_id,
            &json!({"questionId":id,"planVersion":plan_version,"answerType":question.answer_type,"requiresReplan":question.requires_replan}),
            now,
        )?;
        delete_fence(&tx, fence)?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(AgentQuestionRecord {
            id: id.into(),
            run_id: fence.run_id.clone(),
            plan_version,
            step_id: step_id.map(str::to_string),
            prompt: question.prompt.clone(),
            answer_type: question.answer_type,
            options: if question.options.is_empty() {
                None
            } else {
                Some(json!(question.options))
            },
            requires_replan: question.requires_replan,
            created_at_ms: now,
        })
    }

    pub fn submit_user_answer(
        &self,
        id: &str,
        expected_run_id: &str,
        question_id: &str,
        answer: &Value,
        actor: &str,
        now: i64,
    ) -> Result<AgentAnswerRecord, String> {
        validate_user_answer(answer)?;
        value_text(&Value::String(actor.into()), AGENT_EVENT_MAX_BYTES)?;
        let answer_text = value_text(answer, AGENT_ANSWER_MAX_BYTES)?;
        let tx = self
            .conn
            .unchecked_transaction()
            .map_err(|e| e.to_string())?;
        let question: AgentQuestionRecord = tx.query_row("SELECT id,run_id,plan_version,step_id,prompt,answer_type,options_json,requires_replan,created_at_ms FROM agent_questions WHERE id=?1",params![question_id],row_to_question).optional().map_err(|e|e.to_string())?.ok_or("AGENT_QUESTION_NOT_FOUND")?;
        if question.run_id != expected_run_id {
            return Err("AGENT_ANSWER_RUN_MISMATCH".into());
        }
        let already_answered: i64 = tx
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM agent_answers WHERE question_id=?1)",
                params![question_id],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        if already_answered != 0 {
            return Err("AGENT_QUESTION_ALREADY_ANSWERED".into());
        }
        validate_answer_shape(&question, answer)?;
        let from: AgentRunStatus = tx
            .query_row(
                "SELECT status FROM agent_runs WHERE id=?1",
                params![question.run_id],
                |row| row.get::<_, String>(0),
            )
            .map_err(|e| e.to_string())
            .and_then(|value| enum_parse(&value))?;
        if from != AgentRunStatus::AwaitingUser {
            return Err("AGENT_RUN_NOT_AWAITING_USER".into());
        }
        let to = if question.requires_replan {
            AgentRunStatus::Planning
        } else {
            AgentRunStatus::Ready
        };
        validate_run_transition(from, to)?;
        tx.execute("INSERT INTO agent_answers(id,question_id,run_id,answer_json,actor_id,created_at_ms) VALUES(?1,?2,?3,?4,?5,?6)",params![id,question_id,question.run_id,answer_text,actor,now]).map_err(|e|e.to_string())?;
        if !question.requires_replan {
            if let (Some(version), Some(step)) =
                (question.plan_version, question.step_id.as_deref())
            {
                tx.execute("UPDATE agent_steps SET status='ready',updated_at_ms=?4 WHERE run_id=?1 AND plan_version=?2 AND step_id=?3 AND status='waiting_user'",params![question.run_id,version,step,now]).map_err(|e|e.to_string())?;
            }
        }
        tx.execute(
            "UPDATE agent_runs SET status=?2,updated_at_ms=?3 WHERE id=?1",
            params![question.run_id, enum_text(to)?, now],
        )
        .map_err(|e| e.to_string())?;
        append_event(
            &tx,
            &question.run_id,
            "user_answer_submitted",
            question.step_id.as_deref(),
            &json!({"questionId":question_id,"answerId":id,"requiresReplan":question.requires_replan}),
            now,
        )?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(AgentAnswerRecord {
            id: id.into(),
            question_id: question_id.into(),
            run_id: question.run_id,
            answer: answer.clone(),
            actor_id: actor.into(),
            created_at_ms: now,
        })
    }

    pub fn review_artifact(
        &self,
        id: &str,
        artifact_id: &str,
        artifact_hash: &str,
        decision: AgentArtifactReviewDecision,
        actor: &str,
        reason: Option<&str>,
        now: i64,
    ) -> Result<AgentArtifactReviewRecord, String> {
        value_text(
            &json!({"actorId":actor,"reason":reason}),
            AGENT_EVENT_MAX_BYTES,
        )?;
        let tx = self
            .conn
            .unchecked_transaction()
            .map_err(|e| e.to_string())?;
        let (run, stored_hash): (String, String) = tx
            .query_row(
                "SELECT run_id,content_sha256 FROM agent_artifacts WHERE id=?1",
                params![artifact_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
            .map_err(|e| e.to_string())?
            .ok_or("AGENT_ARTIFACT_NOT_FOUND")?;
        if stored_hash != artifact_hash {
            return Err("AGENT_ARTIFACT_REVIEW_STALE".into());
        }
        let sequence:i64=tx.query_row("SELECT COALESCE(MAX(decision_sequence),0)+1 FROM agent_artifact_reviews WHERE artifact_id=?1",params![artifact_id],|row|row.get(0)).map_err(|e|e.to_string())?;
        tx.execute("INSERT INTO agent_artifact_reviews(id,artifact_id,run_id,decision_sequence,artifact_sha256,decision,actor_id,reason,created_at_ms) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)",params![id,artifact_id,run,sequence,artifact_hash,enum_text(decision)?,actor,reason,now]).map_err(|e|e.to_string())?;
        append_event(
            &tx,
            &run,
            "artifact_reviewed",
            None,
            &json!({"artifactId":artifact_id,"artifactHash":artifact_hash,"decision":decision,"reviewId":id}),
            now,
        )?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(AgentArtifactReviewRecord {
            id: id.into(),
            artifact_id: artifact_id.into(),
            run_id: run,
            decision_sequence: sequence,
            artifact_sha256: artifact_hash.into(),
            decision,
            actor_id: actor.into(),
            reason: reason.map(str::to_string),
            created_at_ms: now,
        })
    }

    pub fn resolve_effective_artifact_review(
        &self,
        artifact_id: &str,
    ) -> Result<Option<AgentArtifactReviewRecord>, String> {
        self.conn.query_row("SELECT id,artifact_id,run_id,decision_sequence,artifact_sha256,decision,actor_id,reason,created_at_ms FROM agent_artifact_reviews WHERE artifact_id=?1 ORDER BY decision_sequence DESC LIMIT 1",params![artifact_id],row_to_artifact_review).optional().map_err(|e|e.to_string())
    }
    pub fn put_artifact(&self, a: &AgentArtifactRecord) -> Result<(), String> {
        let content = value_text(&a.content, AGENT_ARTIFACT_MAX_BYTES)?;
        if canonical_value_sha256(&a.content)? != a.content_sha256 {
            return Err("AGENT_ARTIFACT_HASH_MISMATCH".into());
        }
        let audit = a
            .audit
            .as_ref()
            .map(|v| value_text(v, AGENT_OBSERVATION_MAX_BYTES))
            .transpose()?;
        self.conn
            .execute(
                "INSERT INTO agent_artifacts VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
                params![
                    a.id,
                    a.run_id,
                    a.step_id,
                    a.artifact_kind,
                    content,
                    a.content_sha256,
                    a.snapshot_id,
                    audit,
                    a.review_status,
                    a.supersedes_artifact_id,
                    a.created_at_ms
                ],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    pub fn acquire_lease(
        &self,
        run: &str,
        owner: &str,
        token: &str,
        now: i64,
    ) -> Result<AgentLease, String> {
        let tx = self
            .conn
            .unchecked_transaction()
            .map_err(|e| e.to_string())?;
        let old:Option<AgentLease>=tx.query_row("SELECT run_id,owner_id,lease_token,generation,acquired_at_ms,heartbeat_at_ms,expires_at_ms FROM agent_run_leases WHERE run_id=?1",params![run],row_to_lease).optional().map_err(|e|e.to_string())?;
        if old.as_ref().is_some_and(|l| l.expires_at_ms > now) {
            return Err("AGENT_RUN_LEASE_HELD".into());
        }
        let generation = old.map_or(1, |l| l.generation + 1);
        let expires = now + AGENT_LEASE_TTL_MS;
        tx.execute("INSERT INTO agent_run_leases VALUES(?1,?2,?3,?4,?5,?5,?6) ON CONFLICT(run_id) DO UPDATE SET owner_id=excluded.owner_id,lease_token=excluded.lease_token,generation=excluded.generation,acquired_at_ms=excluded.acquired_at_ms,heartbeat_at_ms=excluded.heartbeat_at_ms,expires_at_ms=excluded.expires_at_ms",params![run,owner,token,generation,now,expires]).map_err(|e|e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(AgentLease {
            run_id: run.into(),
            owner_id: owner.into(),
            lease_token: token.into(),
            generation,
            acquired_at_ms: now,
            heartbeat_at_ms: now,
            expires_at_ms: expires,
        })
    }
    pub fn renew_lease(
        &self,
        run: &str,
        owner: &str,
        token: &str,
        now: i64,
    ) -> Result<AgentLease, String> {
        let expires = now + AGENT_LEASE_TTL_MS;
        let n=self.conn.execute("UPDATE agent_run_leases SET heartbeat_at_ms=?4,expires_at_ms=?5 WHERE run_id=?1 AND owner_id=?2 AND lease_token=?3 AND expires_at_ms>?4",params![run,owner,token,now,expires]).map_err(|e|e.to_string())?;
        if n != 1 {
            return Err("AGENT_RUN_LEASE_NOT_OWNED".into());
        }
        self.conn.query_row("SELECT run_id,owner_id,lease_token,generation,acquired_at_ms,heartbeat_at_ms,expires_at_ms FROM agent_run_leases WHERE run_id=?1",params![run],row_to_lease).map_err(|e|e.to_string())
    }
    pub fn release_lease(&self, run: &str, owner: &str, token: &str) -> Result<(), String> {
        let n = self
            .conn
            .execute(
                "DELETE FROM agent_run_leases WHERE run_id=?1 AND owner_id=?2 AND lease_token=?3",
                params![run, owner, token],
            )
            .map_err(|e| e.to_string())?;
        if n != 1 {
            return Err("AGENT_RUN_LEASE_NOT_OWNED".into());
        }
        Ok(())
    }

    pub fn renew_lease_fenced(
        &self,
        fence: &AgentLeaseFence,
        now: i64,
    ) -> Result<AgentLease, String> {
        let expires = now + AGENT_LEASE_TTL_MS;
        let changed=self.conn.execute("UPDATE agent_run_leases SET heartbeat_at_ms=?5,expires_at_ms=?6 WHERE run_id=?1 AND owner_id=?2 AND lease_token=?3 AND generation=?4 AND expires_at_ms>?5",params![fence.run_id,fence.owner_id,fence.lease_token,fence.generation,now,expires]).map_err(|e|e.to_string())?;
        if changed != 1 {
            return Err("AGENT_RUN_LEASE_NOT_OWNED".into());
        }
        self.conn.query_row("SELECT run_id,owner_id,lease_token,generation,acquired_at_ms,heartbeat_at_ms,expires_at_ms FROM agent_run_leases WHERE run_id=?1",params![fence.run_id],row_to_lease).map_err(|e|e.to_string())
    }

    pub fn release_lease_fenced(&self, fence: &AgentLeaseFence, now: i64) -> Result<(), String> {
        let tx = self
            .conn
            .unchecked_transaction()
            .map_err(|e| e.to_string())?;
        assert_fence(&tx, fence, now)?;
        delete_fence(&tx, fence)?;
        tx.commit().map_err(|e| e.to_string())
    }

    pub fn record_planner_round(
        &self,
        fence: &AgentLeaseFence,
        protocol_repair: bool,
        now: i64,
    ) -> Result<AgentBudgetUsage, String> {
        self.record_model_rounds(
            fence,
            1 + u32::from(protocol_repair),
            u32::from(protocol_repair),
            now,
        )
    }

    pub fn reserve_planner_attempt(
        &self,
        fence: &AgentLeaseFence,
        structure_repair: bool,
        now: i64,
    ) -> Result<AgentBudgetUsage, String> {
        self.record_model_rounds(fence, 1, u32::from(structure_repair), now)
    }

    pub fn record_model_rounds(
        &self,
        fence: &AgentLeaseFence,
        rounds: u32,
        repairs: u32,
        now: i64,
    ) -> Result<AgentBudgetUsage, String> {
        if rounds == 0 || repairs > rounds {
            return Err("AGENT_MODEL_ROUND_COUNT_INVALID".into());
        }
        let tx = self
            .conn
            .unchecked_transaction()
            .map_err(|e| e.to_string())?;
        assert_fence(&tx, fence, now)?;
        let (status, budget_text, usage_text): (AgentRunStatus, String, String) = tx
            .query_row(
                "SELECT status,budget_json,budget_usage_json FROM agent_runs WHERE id=?1",
                params![fence.run_id],
                |row| {
                    Ok((
                        enum_parse(&row.get::<_, String>(0)?).map_err(sql_error)?,
                        row.get(1)?,
                        row.get(2)?,
                    ))
                },
            )
            .map_err(|e| e.to_string())?;
        if !matches!(status, AgentRunStatus::Planning | AgentRunStatus::Running) {
            return Err("AGENT_RUN_NOT_EXECUTING_MODEL".into());
        }
        let budget: AgentBudget = serde_json::from_str(&budget_text).map_err(|e| e.to_string())?;
        let mut usage: AgentBudgetUsage =
            serde_json::from_str(&usage_text).map_err(|e| e.to_string())?;
        if usage.planner_rounds.saturating_add(rounds) > budget.max_planner_rounds {
            return Err("AGENT_PLANNER_BUDGET_EXHAUSTED".into());
        }
        if usage.protocol_repairs.saturating_add(repairs) > budget.max_protocol_repairs {
            return Err("AGENT_PROTOCOL_REPAIR_BUDGET_EXHAUSTED".into());
        }
        usage.planner_rounds += rounds;
        usage.protocol_repairs += repairs;
        let usage_text = json_text(&usage, AGENT_EVENT_MAX_BYTES)?;
        tx.execute(
            "UPDATE agent_runs SET budget_usage_json=?2,updated_at_ms=?3 WHERE id=?1",
            params![fence.run_id, usage_text, now],
        )
        .map_err(|e| e.to_string())?;
        append_event(
            &tx,
            &fence.run_id,
            "planner_round_recorded",
            None,
            &json!({"plannerRounds":usage.planner_rounds,"protocolRepairs":usage.protocol_repairs}),
            now,
        )?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(usage)
    }

    pub fn record_protocol_repairs_fenced(
        &self,
        fence: &AgentLeaseFence,
        repairs: u32,
        now: i64,
    ) -> Result<AgentBudgetUsage, String> {
        if repairs == 0 {
            return Err("AGENT_PROTOCOL_REPAIR_COUNT_INVALID".into());
        }
        let tx = self
            .conn
            .unchecked_transaction()
            .map_err(|e| e.to_string())?;
        assert_fence(&tx, fence, now)?;
        let (status, budget_text, usage_text): (AgentRunStatus, String, String) = tx
            .query_row(
                "SELECT status,budget_json,budget_usage_json FROM agent_runs WHERE id=?1",
                params![fence.run_id],
                |row| {
                    Ok((
                        enum_parse(&row.get::<_, String>(0)?).map_err(sql_error)?,
                        row.get(1)?,
                        row.get(2)?,
                    ))
                },
            )
            .map_err(|e| e.to_string())?;
        if status != AgentRunStatus::Running {
            return Err("AGENT_RUN_NOT_EXECUTING_MODEL".into());
        }
        let budget: AgentBudget = serde_json::from_str(&budget_text).map_err(|e| e.to_string())?;
        let mut usage: AgentBudgetUsage =
            serde_json::from_str(&usage_text).map_err(|e| e.to_string())?;
        if usage.protocol_repairs.saturating_add(repairs) > budget.max_protocol_repairs {
            return Err("AGENT_PROTOCOL_REPAIR_BUDGET_EXHAUSTED".into());
        }
        usage.protocol_repairs += repairs;
        let usage_text = json_text(&usage, AGENT_EVENT_MAX_BYTES)?;
        tx.execute(
            "UPDATE agent_runs SET budget_usage_json=?2,updated_at_ms=?3 WHERE id=?1",
            params![fence.run_id, usage_text, now],
        )
        .map_err(|e| e.to_string())?;
        append_event(
            &tx,
            &fence.run_id,
            "protocol_repair_recorded",
            None,
            &json!({"protocolRepairs":usage.protocol_repairs}),
            now,
        )?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(usage)
    }

    pub fn request_action_approval(
        &self,
        fence: &AgentLeaseFence,
        plan_version: u32,
        step_id: &str,
        resolved_input: &Value,
        action_hash: &str,
        now: i64,
    ) -> Result<(), String> {
        if action_hash.trim().is_empty() {
            return Err("AGENT_ACTION_HASH_REQUIRED".into());
        }
        let resolved = value_text(resolved_input, AGENT_OBSERVATION_MAX_BYTES)?;
        let tx = self
            .conn
            .unchecked_transaction()
            .map_err(|e| e.to_string())?;
        assert_fence(&tx, fence, now)?;
        assert_current_run_and_plan(&tx, fence, plan_version, AgentRunStatus::Running)?;
        assert_current_plan_approved(&tx, &fence.run_id, plan_version)?;
        let (status,risk):(AgentStepStatus,AgentRiskLevel)=tx.query_row("SELECT status,risk FROM agent_steps WHERE run_id=?1 AND plan_version=?2 AND step_id=?3",params![fence.run_id,plan_version,step_id],|row|Ok((enum_parse(&row.get::<_,String>(0)?).map_err(sql_error)?,enum_parse(&row.get::<_,String>(1)?).map_err(sql_error)?))).optional().map_err(|e|e.to_string())?.ok_or("AGENT_STEP_NOT_FOUND")?;
        if status != AgentStepStatus::Ready {
            return Err("AGENT_STEP_NOT_READY".into());
        }
        if risk == AgentRiskLevel::Read {
            return Err("AGENT_READ_ACTION_APPROVAL_NOT_REQUIRED".into());
        }
        tx.execute("UPDATE agent_steps SET resolved_input_json=?4,action_hash=?5,pending_approval_hash=?5,pending_approval_requested_at_ms=?6,updated_at_ms=?6 WHERE run_id=?1 AND plan_version=?2 AND step_id=?3",params![fence.run_id,plan_version,step_id,resolved,action_hash,now]).map_err(|e|e.to_string())?;
        tx.execute(
            "UPDATE agent_runs SET status='awaiting_action_approval',updated_at_ms=?2 WHERE id=?1",
            params![fence.run_id, now],
        )
        .map_err(|e| e.to_string())?;
        append_event(
            &tx,
            &fence.run_id,
            "action_approval_requested",
            Some(step_id),
            &json!({"planVersion":plan_version,"actionHash":action_hash,"risk":risk}),
            now,
        )?;
        delete_fence(&tx, fence)?;
        tx.commit().map_err(|e| e.to_string())
    }

    pub fn claim_step(
        &self,
        fence: &AgentLeaseFence,
        plan_version: u32,
        step_id: &str,
        resolved_input: &Value,
        action_hash: &str,
        now: i64,
    ) -> Result<AgentStepRecord, String> {
        if action_hash.trim().is_empty() {
            return Err("AGENT_ACTION_HASH_REQUIRED".into());
        }
        let resolved = value_text(resolved_input, AGENT_OBSERVATION_MAX_BYTES)?;
        let tx = self
            .conn
            .unchecked_transaction()
            .map_err(|e| e.to_string())?;
        assert_fence(&tx, fence, now)?;
        assert_current_run_and_plan(&tx, fence, plan_version, AgentRunStatus::Running)?;
        assert_current_plan_approved(&tx, &fence.run_id, plan_version)?;
        let (status,attempts,risk,registry,tool_version,writer_profile):(AgentStepStatus,u32,AgentRiskLevel,String,String,String)=tx.query_row("SELECT s.status,s.attempts,s.risk,s.registry_hash,s.tool_version,p.writer_profile_hash FROM agent_steps s JOIN agent_plans p ON p.run_id=s.run_id AND p.version=s.plan_version WHERE s.run_id=?1 AND s.plan_version=?2 AND s.step_id=?3",params![fence.run_id,plan_version,step_id],|row|Ok((enum_parse(&row.get::<_,String>(0)?).map_err(sql_error)?,row.get::<_,i64>(1)? as u32,enum_parse(&row.get::<_,String>(2)?).map_err(sql_error)?,row.get(3)?,row.get(4)?,row.get(5)?))).optional().map_err(|e|e.to_string())?.ok_or("AGENT_STEP_NOT_FOUND")?;
        if status != AgentStepStatus::Ready {
            return Err("AGENT_STEP_NOT_READY".into());
        }
        if risk != AgentRiskLevel::Read
            && !effective_approval_matches(
                &tx,
                &fence.run_id,
                plan_version,
                Some(step_id),
                "action",
                action_hash,
                &registry,
                Some(&tool_version),
                Some(&writer_profile),
            )?
        {
            return Err("AGENT_ACTION_APPROVAL_REQUIRED".into());
        }
        let (budget_text, usage_text): (String, String) = tx
            .query_row(
                "SELECT budget_json,budget_usage_json FROM agent_runs WHERE id=?1",
                params![fence.run_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|e| e.to_string())?;
        let budget: AgentBudget = serde_json::from_str(&budget_text).map_err(|e| e.to_string())?;
        let mut usage: AgentBudgetUsage =
            serde_json::from_str(&usage_text).map_err(|e| e.to_string())?;
        if usage.tool_calls >= budget.max_tool_calls {
            return Err("AGENT_TOOL_CALL_BUDGET_EXHAUSTED".into());
        }
        if attempts == 0 && usage.executed_steps >= budget.max_steps {
            return Err("AGENT_STEP_BUDGET_EXHAUSTED".into());
        }
        if attempts > budget.max_retries_per_tool {
            return Err("AGENT_TOOL_RETRY_BUDGET_EXHAUSTED".into());
        }
        usage.tool_calls += 1;
        if attempts == 0 {
            usage.executed_steps += 1;
            usage.retries_for_current_tool = 0;
        } else {
            usage.retries_for_current_tool = attempts;
        }
        let usage_text = json_text(&usage, AGENT_EVENT_MAX_BYTES)?;
        tx.execute("UPDATE agent_steps SET status='running',attempts=attempts+1,resolved_input_json=?4,action_hash=?5,pending_approval_hash=NULL,pending_approval_requested_at_ms=NULL,started_at_ms=COALESCE(started_at_ms,?6),updated_at_ms=?6 WHERE run_id=?1 AND plan_version=?2 AND step_id=?3",params![fence.run_id,plan_version,step_id,resolved,action_hash,now]).map_err(|e|e.to_string())?;
        tx.execute(
            "UPDATE agent_runs SET budget_usage_json=?2,updated_at_ms=?3 WHERE id=?1",
            params![fence.run_id, usage_text, now],
        )
        .map_err(|e| e.to_string())?;
        append_event(
            &tx,
            &fence.run_id,
            "step_claimed",
            Some(step_id),
            &json!({"planVersion":plan_version,"actionHash":action_hash,"attempt":attempts+1,"toolCalls":usage.tool_calls}),
            now,
        )?;
        tx.commit().map_err(|e| e.to_string())?;
        self.get_step(&fence.run_id, plan_version, step_id)?
            .ok_or_else(|| "AGENT_STEP_NOT_FOUND".into())
    }

    pub fn claim_approved_action(
        &self,
        fence: &AgentLeaseFence,
        now: i64,
    ) -> Result<AgentStepRecord, String> {
        let tx = self
            .conn
            .unchecked_transaction()
            .map_err(|e| e.to_string())?;
        assert_fence(&tx, fence, now)?;
        let (status, plan_version): (AgentRunStatus, u32) = tx
            .query_row(
                "SELECT status,current_plan_version FROM agent_runs WHERE id=?1",
                params![fence.run_id],
                |row| {
                    Ok((
                        enum_parse(&row.get::<_, String>(0)?).map_err(sql_error)?,
                        row.get::<_, i64>(1)? as u32,
                    ))
                },
            )
            .optional()
            .map_err(|e| e.to_string())?
            .ok_or("AGENT_RUN_NOT_FOUND")?;
        if status != AgentRunStatus::AwaitingActionApproval {
            return Err("AGENT_RUN_NOT_AWAITING_ACTION_APPROVAL".into());
        }
        assert_current_plan_approved(&tx, &fence.run_id, plan_version)?;
        let (
            step_id,
            step_status,
            attempts,
            resolved_text,
            action_hash,
            risk,
            registry,
            tool_version,
            writer_profile,
        ): (
            String,
            AgentStepStatus,
            u32,
            String,
            String,
            AgentRiskLevel,
            String,
            String,
            String,
        ) = tx
            .query_row(
                "SELECT s.step_id,s.status,s.attempts,s.resolved_input_json,s.pending_approval_hash,s.risk,s.registry_hash,s.tool_version,p.writer_profile_hash
                 FROM agent_steps s
                 JOIN agent_plans p ON p.run_id=s.run_id AND p.version=s.plan_version
                 WHERE s.run_id=?1 AND s.plan_version=?2 AND s.pending_approval_hash IS NOT NULL
                 ORDER BY s.ordinal ASC LIMIT 1",
                params![fence.run_id, plan_version],
                |row| {
                    Ok((
                        row.get(0)?,
                        enum_parse(&row.get::<_, String>(1)?).map_err(sql_error)?,
                        row.get::<_, i64>(2)? as u32,
                        row.get(3)?,
                        row.get(4)?,
                        enum_parse(&row.get::<_, String>(5)?).map_err(sql_error)?,
                        row.get(6)?,
                        row.get(7)?,
                        row.get(8)?,
                    ))
                },
            )
            .optional()
            .map_err(|e| e.to_string())?
            .ok_or("AGENT_ACTION_APPROVAL_NOT_PENDING")?;
        if step_status != AgentStepStatus::Ready || risk == AgentRiskLevel::Read {
            return Err("AGENT_ACTION_APPROVAL_NOT_PENDING".into());
        }
        if !effective_approval_matches(
            &tx,
            &fence.run_id,
            plan_version,
            Some(&step_id),
            "action",
            &action_hash,
            &registry,
            Some(&tool_version),
            Some(&writer_profile),
        )? {
            return Err("AGENT_ACTION_APPROVAL_REQUIRED".into());
        }
        let resolved_input: Value =
            serde_json::from_str(&resolved_text).map_err(|_| "AGENT_RESOLVED_INPUT_INVALID")?;
        value_text(&resolved_input, AGENT_OBSERVATION_MAX_BYTES)?;
        let (budget_text, usage_text): (String, String) = tx
            .query_row(
                "SELECT budget_json,budget_usage_json FROM agent_runs WHERE id=?1",
                params![fence.run_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|e| e.to_string())?;
        let budget: AgentBudget = serde_json::from_str(&budget_text).map_err(|e| e.to_string())?;
        let mut usage: AgentBudgetUsage =
            serde_json::from_str(&usage_text).map_err(|e| e.to_string())?;
        if usage.tool_calls >= budget.max_tool_calls {
            return Err("AGENT_TOOL_CALL_BUDGET_EXHAUSTED".into());
        }
        if attempts == 0 && usage.executed_steps >= budget.max_steps {
            return Err("AGENT_STEP_BUDGET_EXHAUSTED".into());
        }
        if attempts > budget.max_retries_per_tool {
            return Err("AGENT_TOOL_RETRY_BUDGET_EXHAUSTED".into());
        }
        usage.tool_calls += 1;
        if attempts == 0 {
            usage.executed_steps += 1;
            usage.retries_for_current_tool = 0;
        } else {
            usage.retries_for_current_tool = attempts;
        }
        let usage_text = json_text(&usage, AGENT_EVENT_MAX_BYTES)?;
        validate_run_transition(
            AgentRunStatus::AwaitingActionApproval,
            AgentRunStatus::Running,
        )?;
        validate_step_transition(AgentStepStatus::Ready, AgentStepStatus::Running)?;
        tx.execute(
            "UPDATE agent_runs SET status='running',budget_usage_json=?2,updated_at_ms=?3 WHERE id=?1",
            params![fence.run_id, usage_text, now],
        )
        .map_err(|e| e.to_string())?;
        tx.execute(
            "UPDATE agent_steps SET status='running',attempts=attempts+1,action_hash=?4,pending_approval_hash=NULL,pending_approval_requested_at_ms=NULL,started_at_ms=COALESCE(started_at_ms,?5),updated_at_ms=?5
             WHERE run_id=?1 AND plan_version=?2 AND step_id=?3",
            params![fence.run_id, plan_version, step_id, action_hash, now],
        )
        .map_err(|e| e.to_string())?;
        append_event(
            &tx,
            &fence.run_id,
            "run_status_changed",
            Some(&step_id),
            &json!({"from":AgentRunStatus::AwaitingActionApproval,"to":AgentRunStatus::Running,"errorCode":Value::Null}),
            now,
        )?;
        append_event(
            &tx,
            &fence.run_id,
            "step_claimed",
            Some(&step_id),
            &json!({"planVersion":plan_version,"actionHash":action_hash,"attempt":attempts+1,"toolCalls":usage.tool_calls}),
            now,
        )?;
        tx.commit().map_err(|e| e.to_string())?;
        self.get_step(&fence.run_id, plan_version, &step_id)?
            .ok_or_else(|| "AGENT_STEP_NOT_FOUND".into())
    }

    pub fn commit_tool_success<F>(
        &self,
        fence: &AgentLeaseFence,
        plan_version: u32,
        step_id: &str,
        operation_key: &str,
        tool_name: &str,
        action_hash: &str,
        result: &Value,
        artifact: Option<&AgentArtifactRecord>,
        now: i64,
        mutation: F,
    ) -> Result<Value, String>
    where
        F: FnOnce(&Transaction<'_>) -> Result<(), String>,
    {
        let expected_operation_key =
            self.operation_key(&fence.run_id, plan_version, step_id, tool_name, action_hash)?;
        if expected_operation_key != operation_key {
            return Err("AGENT_OPERATION_KEY_INVALID".into());
        }
        if let Some(artifact) = artifact {
            if artifact.run_id != fence.run_id
                || artifact
                    .step_id
                    .as_deref()
                    .is_some_and(|value| value != step_id)
            {
                return Err("AGENT_ARTIFACT_EXECUTION_CONTEXT_MISMATCH".into());
            }
        }
        let result_text = value_text(result, AGENT_OBSERVATION_MAX_BYTES)?;
        let tx = self
            .conn
            .unchecked_transaction()
            .map_err(|e| e.to_string())?;
        assert_fence(&tx, fence, now)?;
        assert_current_run_and_plan(&tx, fence, plan_version, AgentRunStatus::Running)?;
        assert_active_run_snapshot(&tx, &fence.run_id)?;
        assert_running_step_action(&tx, &fence.run_id, plan_version, step_id, action_hash)?;
        let stored_tool:String=tx.query_row("SELECT tool_name FROM agent_steps WHERE run_id=?1 AND plan_version=?2 AND step_id=?3",params![fence.run_id,plan_version,step_id],|row|row.get(0)).map_err(|e|e.to_string())?;
        if stored_tool != tool_name {
            return Err("AGENT_TOOL_CONTEXT_MISMATCH".into());
        }
        if let Some((stored_tool,stored_hash,stored_result))=tx.query_row("SELECT tool_name,action_hash,result_json FROM agent_tool_receipts WHERE operation_key=?1",params![operation_key],|row|Ok((row.get::<_,String>(0)?,row.get::<_,String>(1)?,row.get::<_,String>(2)?))).optional().map_err(|e|e.to_string())?{
            if stored_tool!=tool_name||stored_hash!=action_hash{return Err("AGENT_OPERATION_KEY_COLLISION".into());}
            return serde_json::from_str(&stored_result).map_err(|e|e.to_string());
        }
        mutation(&tx)?;
        if let Some(artifact) = artifact {
            insert_artifact(&tx, artifact)?;
        }
        tx.execute("INSERT INTO agent_tool_receipts(operation_key,run_id,plan_version,step_id,tool_name,action_hash,result_json,artifact_id,committed_at_ms) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)",params![operation_key,fence.run_id,plan_version,step_id,tool_name,action_hash,result_text,artifact.map(|value|value.id.as_str()),now]).map_err(|e|e.to_string())?;
        tx.execute("UPDATE agent_steps SET status='succeeded',operation_key=?4,observation_json=?5,last_error_code=NULL,finished_at_ms=?6,updated_at_ms=?6 WHERE run_id=?1 AND plan_version=?2 AND step_id=?3",params![fence.run_id,plan_version,step_id,operation_key,result_text,now]).map_err(|e|e.to_string())?;
        append_event(
            &tx,
            &fence.run_id,
            "tool_committed",
            Some(step_id),
            &json!({"planVersion":plan_version,"operationKey":operation_key,"actionHash":action_hash,"artifactId":artifact.map(|value|value.id.as_str())}),
            now,
        )?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(result.clone())
    }

    pub fn commit_tool_failure(
        &self,
        fence: &AgentLeaseFence,
        plan_version: u32,
        step_id: &str,
        action_hash: &str,
        error_code: &str,
        retryable: bool,
        now: i64,
    ) -> Result<(), String> {
        validate_error_code(error_code)?;
        let tx = self
            .conn
            .unchecked_transaction()
            .map_err(|e| e.to_string())?;
        assert_fence(&tx, fence, now)?;
        assert_current_run_and_plan(&tx, fence, plan_version, AgentRunStatus::Running)?;
        assert_running_step_action(&tx, &fence.run_id, plan_version, step_id, action_hash)?;
        tx.execute("UPDATE agent_steps SET status='failed',last_error_code=?4,finished_at_ms=?5,updated_at_ms=?5 WHERE run_id=?1 AND plan_version=?2 AND step_id=?3",params![fence.run_id,plan_version,step_id,error_code,now]).map_err(|e|e.to_string())?;
        append_event(
            &tx,
            &fence.run_id,
            "tool_failed",
            Some(step_id),
            &json!({"planVersion":plan_version,"actionHash":action_hash,"errorCode":error_code,"retryable":retryable}),
            now,
        )?;
        tx.commit().map_err(|e| e.to_string())
    }

    pub fn requeue_failed_step_fenced(
        &self,
        fence: &AgentLeaseFence,
        plan_version: u32,
        step_id: &str,
        expected_action_hash: &str,
        now: i64,
    ) -> Result<(), String> {
        let tx = self
            .conn
            .unchecked_transaction()
            .map_err(|e| e.to_string())?;
        assert_fence(&tx, fence, now)?;
        assert_current_run_and_plan(&tx, fence, plan_version, AgentRunStatus::Running)?;
        let (status,action_hash,attempts,budget_text):(AgentStepStatus,Option<String>,u32,String)=tx.query_row("SELECT s.status,s.action_hash,s.attempts,r.budget_json FROM agent_steps s JOIN agent_runs r ON r.id=s.run_id WHERE s.run_id=?1 AND s.plan_version=?2 AND s.step_id=?3",params![fence.run_id,plan_version,step_id],|row|Ok((enum_parse(&row.get::<_,String>(0)?).map_err(sql_error)?,row.get(1)?,row.get::<_,i64>(2)? as u32,row.get(3)?))).optional().map_err(|e|e.to_string())?.ok_or("AGENT_STEP_NOT_FOUND")?;
        if status != AgentStepStatus::Failed {
            return Err("AGENT_STEP_NOT_FAILED".into());
        }
        if action_hash.as_deref() != Some(expected_action_hash) {
            return Err("AGENT_ACTION_HASH_STALE".into());
        }
        let budget: AgentBudget = serde_json::from_str(&budget_text).map_err(|e| e.to_string())?;
        if attempts == 0 || attempts > budget.max_retries_per_tool {
            return Err("AGENT_TOOL_RETRY_BUDGET_EXHAUSTED".into());
        }
        validate_step_transition(status, AgentStepStatus::Ready)?;
        tx.execute("UPDATE agent_steps SET status='ready',last_error_code=NULL,finished_at_ms=NULL,updated_at_ms=?4 WHERE run_id=?1 AND plan_version=?2 AND step_id=?3",params![fence.run_id,plan_version,step_id,now]).map_err(|e|e.to_string())?;
        append_event(
            &tx,
            &fence.run_id,
            "step_requeued_for_retry",
            Some(step_id),
            &json!({"planVersion":plan_version,"actionHash":expected_action_hash,"completedAttempts":attempts}),
            now,
        )?;
        tx.commit().map_err(|e| e.to_string())
    }
    pub fn operation_key(
        &self,
        run: &str,
        version: u32,
        step: &str,
        tool: &str,
        action_hash: &str,
    ) -> Result<String, String> {
        let library = self.library_instance_id(0)?;
        let mut h = Sha256::new();
        for v in [
            library.as_str(),
            run,
            &version.to_string(),
            step,
            tool,
            action_hash,
        ] {
            h.update(v.as_bytes());
            h.update([0])
        }
        Ok(format!("{:x}", h.finalize()))
    }
    pub fn execute_idempotent_sqlite_mutation<F>(
        &self,
        key: &str,
        run: &str,
        version: u32,
        step: &str,
        tool: &str,
        action_hash: &str,
        now: i64,
        mutation: F,
    ) -> Result<Value, String>
    where
        F: FnOnce(&Transaction<'_>) -> Result<Value, String>,
    {
        if let Some((t,h,r))=self.conn.query_row("SELECT tool_name,action_hash,result_json FROM agent_tool_receipts WHERE operation_key=?1",params![key],|x|Ok((x.get::<_,String>(0)?,x.get::<_,String>(1)?,x.get::<_,String>(2)?))).optional().map_err(|e|e.to_string())?{if t!=tool||h!=action_hash{return Err("AGENT_OPERATION_KEY_COLLISION".into())}return serde_json::from_str(&r).map_err(|e|e.to_string())}
        let tx = self
            .conn
            .unchecked_transaction()
            .map_err(|e| e.to_string())?;
        tx.execute(
            "UPDATE agent_steps SET operation_key=?4,updated_at_ms=?5 WHERE run_id=?1 AND plan_version=?2 AND step_id=?3",
            params![run, version, step, key, now],
        )
        .map_err(|e| e.to_string())?;
        let result = mutation(&tx)?;
        let result_text = value_text(&result, AGENT_OBSERVATION_MAX_BYTES)?;
        tx.execute("INSERT INTO agent_tool_receipts(operation_key,run_id,plan_version,step_id,tool_name,action_hash,result_json,committed_at_ms) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)",params![key,run,version,step,tool,action_hash,result_text,now]).map_err(|e|e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(result)
    }
    pub fn recover_expired_runs(&self, now: i64) -> Result<AgentRecoveryResult, String> {
        self.conn.execute("DELETE FROM agent_run_leases WHERE run_id IN (SELECT id FROM agent_runs WHERE status IN('awaiting_plan_approval','awaiting_action_approval','awaiting_user','paused','cancelled','failed','completed'))",[]).map_err(|e|e.to_string())?;
        let mut s = self
            .conn
            .prepare("SELECT r.id FROM agent_runs r LEFT JOIN agent_run_leases l ON l.run_id=r.id WHERE r.status IN('running','evaluating','cancelling') AND (l.run_id IS NULL OR l.expires_at_ms<=?1) ORDER BY r.id")
            .map_err(|e| e.to_string())?;
        let ids = s
            .query_map(params![now], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        drop(s);
        let mut out = AgentRecoveryResult {
            recovered_run_ids: vec![],
            completed_step_count: 0,
            requeued_step_count: 0,
        };
        for id in ids {
            let Some(run) = self.get_run(&id)? else {
                continue;
            };
            if matches!(
                run.status,
                AgentRunStatus::Cancelled | AgentRunStatus::Failed | AgentRunStatus::Completed
            ) {
                self.conn
                    .execute("DELETE FROM agent_run_leases WHERE run_id=?1", params![id])
                    .map_err(|e| e.to_string())?;
                continue;
            }
            let tx = self
                .conn
                .unchecked_transaction()
                .map_err(|e| e.to_string())?;
            if let Some(v) = run.current_plan_version {
                let mut q=tx.prepare("SELECT step_id,operation_key FROM agent_steps WHERE run_id=?1 AND plan_version=?2 AND status='running'").map_err(|e|e.to_string())?;
                let rows = q
                    .query_map(params![id, v], |r| {
                        Ok((r.get::<_, String>(0)?, r.get::<_, Option<String>>(1)?))
                    })
                    .map_err(|e| e.to_string())?
                    .collect::<Result<Vec<_>, _>>()
                    .map_err(|e| e.to_string())?;
                drop(q);
                for (step, key) in rows {
                    let committed=key.as_ref().is_some_and(|k|tx.query_row("SELECT EXISTS(SELECT 1 FROM agent_tool_receipts WHERE operation_key=?1)",params![k],|r|r.get::<_,i64>(0)).unwrap_or(0)!=0);
                    if committed {
                        tx.execute("UPDATE agent_steps SET status='succeeded',finished_at_ms=?4,updated_at_ms=?4 WHERE run_id=?1 AND plan_version=?2 AND step_id=?3",params![id,v,step,now]).map_err(|e|e.to_string())?;
                        append_event(
                            &tx,
                            &id,
                            "step_recovered_from_receipt",
                            Some(&step),
                            &json!({"planVersion":v}),
                            now,
                        )?;
                        out.completed_step_count += 1
                    } else {
                        tx.execute("UPDATE agent_steps SET status='ready',last_error_code='AGENT_EXECUTOR_LOST',recovery_count=recovery_count+1,updated_at_ms=?4 WHERE run_id=?1 AND plan_version=?2 AND step_id=?3",params![id,v,step,now]).map_err(|e|e.to_string())?;
                        append_event(
                            &tx,
                            &id,
                            "step_requeued_after_executor_loss",
                            Some(&step),
                            &json!({"planVersion":v}),
                            now,
                        )?;
                        out.requeued_step_count += 1
                    }
                }
            }
            if run.status == AgentRunStatus::Cancelling {
                validate_run_transition(run.status, AgentRunStatus::Cancelled)?;
                tx.execute("UPDATE agent_runs SET status='cancelled',last_error_code=NULL,updated_at_ms=?2,completed_at_ms=?2 WHERE id=?1",params![id,now]).map_err(|e|e.to_string())?;
                append_event(
                    &tx,
                    &id,
                    "run_recovered_cancelled",
                    None,
                    &json!({"from":run.status}),
                    now,
                )?;
            } else if run.status != AgentRunStatus::Paused {
                validate_run_transition(run.status, AgentRunStatus::Paused)?;
                tx.execute("UPDATE agent_runs SET status='paused',last_error_code='AGENT_EXECUTOR_LOST',updated_at_ms=?2 WHERE id=?1",params![id,now]).map_err(|e|e.to_string())?;
                append_event(
                    &tx,
                    &id,
                    "run_recovered_paused",
                    None,
                    &json!({"from":run.status}),
                    now,
                )?
            }
            tx.execute("DELETE FROM agent_run_leases WHERE run_id=?1", params![id])
                .map_err(|e| e.to_string())?;
            tx.commit().map_err(|e| e.to_string())?;
            out.recovered_run_ids.push(id)
        }
        Ok(out)
    }
    pub fn get_step(
        &self,
        run: &str,
        version: u32,
        step: &str,
    ) -> Result<Option<AgentStepRecord>, String> {
        self.conn.query_row("SELECT run_id,plan_version,step_id,ordinal,title,tool_name,tool_version,registry_hash,input_json,resolved_input_json,action_hash,pending_approval_hash,pending_approval_requested_at_ms,risk,status,attempts,operation_key,recovery_count,observation_json,last_error_code,started_at_ms,finished_at_ms,updated_at_ms FROM agent_steps WHERE run_id=?1 AND plan_version=?2 AND step_id=?3",params![run,version,step],row_to_step).optional().map_err(|e|e.to_string())
    }
    pub fn current_plan_context(&self, run: &str) -> Result<Option<AgentPlanContext>, String> {
        self.conn.query_row("SELECT p.run_id,p.version,p.plan_hash,p.registry_hash,p.planner_profile_hash,p.writer_profile_hash FROM agent_runs r JOIN agent_plans p ON p.run_id=r.id AND p.version=r.current_plan_version WHERE r.id=?1",params![run],|row|Ok(AgentPlanContext{run_id:row.get(0)?,version:row.get::<_,i64>(1)? as u32,plan_hash:row.get(2)?,registry_hash:row.get(3)?,planner_profile_hash:row.get(4)?,writer_profile_hash:row.get(5)?})).optional().map_err(|e|e.to_string())
    }
    pub fn events_since(
        &self,
        run: &str,
        after_sequence: i64,
        limit: u32,
    ) -> Result<Vec<AgentEventRecord>, String> {
        let mut statement=self.conn.prepare("SELECT sequence,event_type,step_id,payload_json,created_at_ms FROM agent_events WHERE run_id=?1 AND sequence>?2 ORDER BY sequence LIMIT ?3").map_err(|e|e.to_string())?;
        let events = statement
            .query_map(params![run, after_sequence, limit.clamp(1, 500)], |row| {
                Ok(AgentEventRecord {
                    sequence: row.get(0)?,
                    event_type: row.get(1)?,
                    step_id: row.get(2)?,
                    payload: parse_sql_json(row.get(3)?)?,
                    created_at_ms: row.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        Ok(events)
    }
    pub fn snapshot(&self, id: &str) -> Result<AgentRunSnapshot, String> {
        let run = self.get_run(id)?.ok_or("AGENT_RUN_NOT_FOUND")?;
        let plan = run
            .current_plan_version
            .map(|v| {
                self.conn
                    .query_row(
                        "SELECT plan_json FROM agent_plans WHERE run_id=?1 AND version=?2",
                        params![id, v],
                        |r| r.get::<_, String>(0),
                    )
                    .map_err(|e| e.to_string())
                    .and_then(|x| serde_json::from_str(&x).map_err(|e| e.to_string()))
            })
            .transpose()?;
        let steps = if let Some(v) = run.current_plan_version {
            let mut s=self.conn.prepare("SELECT run_id,plan_version,step_id,ordinal,title,tool_name,tool_version,registry_hash,input_json,resolved_input_json,action_hash,pending_approval_hash,pending_approval_requested_at_ms,risk,status,attempts,operation_key,recovery_count,observation_json,last_error_code,started_at_ms,finished_at_ms,updated_at_ms FROM agent_steps WHERE run_id=?1 AND plan_version=?2 ORDER BY ordinal").map_err(|e|e.to_string())?;
            let rows = s
                .query_map(params![id, v], row_to_step)
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?;
            rows
        } else {
            vec![]
        };
        let mut e=self.conn.prepare("SELECT sequence,event_type,step_id,payload_json,created_at_ms FROM agent_events WHERE run_id=?1 ORDER BY sequence").map_err(|e|e.to_string())?;
        let events = e
            .query_map(params![id], |r| {
                Ok(AgentEventRecord {
                    sequence: r.get(0)?,
                    event_type: r.get(1)?,
                    step_id: r.get(2)?,
                    payload: parse_sql_json(r.get(3)?)?,
                    created_at_ms: r.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        let mut a=self.conn.prepare("SELECT id,run_id,step_id,artifact_kind,content_json,content_sha256,snapshot_id,audit_json,review_status,supersedes_artifact_id,created_at_ms FROM agent_artifacts WHERE run_id=?1 ORDER BY created_at_ms,id").map_err(|e|e.to_string())?;
        let artifacts = a
            .query_map(params![id], row_to_artifact)
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        let mut approvals_stmt=self.conn.prepare("SELECT id,run_id,decision_sequence,plan_version,step_id,approval_kind,decision,approved_hash,risk,registry_hash,tool_version,model_profile_hash,actor_id,policy_reason,created_at_ms FROM agent_approvals WHERE run_id=?1 ORDER BY decision_sequence").map_err(|e|e.to_string())?;
        let approvals = approvals_stmt
            .query_map(params![id], row_to_approval)
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        let mut questions_stmt=self.conn.prepare("SELECT id,run_id,plan_version,step_id,prompt,answer_type,options_json,requires_replan,created_at_ms FROM agent_questions WHERE run_id=?1 ORDER BY created_at_ms,id").map_err(|e|e.to_string())?;
        let questions = questions_stmt
            .query_map(params![id], row_to_question)
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        let mut answers_stmt=self.conn.prepare("SELECT id,question_id,run_id,answer_json,actor_id,created_at_ms FROM agent_answers WHERE run_id=?1 ORDER BY created_at_ms,id").map_err(|e|e.to_string())?;
        let answers = answers_stmt
            .query_map(params![id], row_to_answer)
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        let mut reviews_stmt=self.conn.prepare("SELECT id,artifact_id,run_id,decision_sequence,artifact_sha256,decision,actor_id,reason,created_at_ms FROM agent_artifact_reviews WHERE run_id=?1 ORDER BY created_at_ms,id").map_err(|e|e.to_string())?;
        let artifact_reviews = reviews_stmt
            .query_map(params![id], row_to_artifact_review)
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        let mut profile_stmt=self.conn.prepare("SELECT DISTINCT p.id,p.role,p.protocol,p.model,p.endpoint_origin,p.config_json,p.config_sha256,p.created_at_ms FROM agent_model_profiles p JOIN agent_plans ap ON ap.run_id=?1 AND (ap.planner_profile_hash=p.config_sha256 OR ap.writer_profile_hash=p.config_sha256) ORDER BY p.created_at_ms,p.id").map_err(|e|e.to_string())?;
        let model_profiles = profile_stmt
            .query_map(params![id], row_to_model_profile)
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        let current_lease=self.conn.query_row("SELECT run_id,owner_id,lease_token,generation,acquired_at_ms,heartbeat_at_ms,expires_at_ms FROM agent_run_leases WHERE run_id=?1",params![id],row_to_lease).optional().map_err(|e|e.to_string())?;
        Ok(AgentRunSnapshot {
            run,
            plan,
            steps,
            events,
            artifacts,
            approvals,
            questions,
            answers,
            artifact_reviews,
            model_profiles,
            current_lease,
        })
    }
}

fn assert_fence(tx: &Transaction<'_>, fence: &AgentLeaseFence, now: i64) -> Result<(), String> {
    let valid:i64=tx.query_row("SELECT EXISTS(SELECT 1 FROM agent_run_leases WHERE run_id=?1 AND owner_id=?2 AND lease_token=?3 AND generation=?4 AND expires_at_ms>?5)",params![fence.run_id,fence.owner_id,fence.lease_token,fence.generation,now],|row|row.get(0)).map_err(|e|e.to_string())?;
    if valid == 0 {
        Err("AGENT_RUN_LEASE_NOT_OWNED".into())
    } else {
        Ok(())
    }
}

fn delete_fence(tx: &Transaction<'_>, fence: &AgentLeaseFence) -> Result<(), String> {
    let changed=tx.execute("DELETE FROM agent_run_leases WHERE run_id=?1 AND owner_id=?2 AND lease_token=?3 AND generation=?4",params![fence.run_id,fence.owner_id,fence.lease_token,fence.generation]).map_err(|e|e.to_string())?;
    if changed != 1 {
        Err("AGENT_RUN_LEASE_NOT_OWNED".into())
    } else {
        Ok(())
    }
}

fn assert_current_run_and_plan(
    tx: &Transaction<'_>,
    fence: &AgentLeaseFence,
    version: u32,
    expected_status: AgentRunStatus,
) -> Result<(), String> {
    let current: Option<(AgentRunStatus, u32)> = tx
        .query_row(
            "SELECT status,current_plan_version FROM agent_runs WHERE id=?1",
            params![fence.run_id],
            |row| {
                Ok((
                    enum_parse(&row.get::<_, String>(0)?).map_err(sql_error)?,
                    row.get::<_, i64>(1)? as u32,
                ))
            },
        )
        .optional()
        .map_err(|e| e.to_string())?;
    match current {
        Some((status, current_version))
            if status == expected_status && current_version == version =>
        {
            Ok(())
        }
        Some((status, _)) if status != expected_status => Err("AGENT_RUN_STATUS_STALE".into()),
        Some(_) => Err("AGENT_PLAN_VERSION_STALE".into()),
        None => Err("AGENT_RUN_NOT_FOUND".into()),
    }
}

fn assert_active_run_snapshot(tx: &Transaction<'_>, run_id: &str) -> Result<(), String> {
    let (project_id, expected_snapshot): (String, Option<String>) = tx
        .query_row(
            "SELECT project_id,snapshot_id FROM agent_runs WHERE id=?1",
            params![run_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|error| error.to_string())?
        .ok_or("AGENT_RUN_NOT_FOUND")?;
    let active_snapshot = tx
        .query_row(
            "SELECT active_snapshot_id FROM v20_analysis_state WHERE project_id=?1",
            params![project_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    if expected_snapshot.is_none() || active_snapshot != expected_snapshot {
        return Err("AGENT_V20_SNAPSHOT_STALE".into());
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn effective_approval_matches(
    tx: &Transaction<'_>,
    run: &str,
    version: u32,
    step: Option<&str>,
    kind: &str,
    expected_hash: &str,
    registry_hash: &str,
    tool_version: Option<&str>,
    model_profile_hash: Option<&str>,
) -> Result<bool, String> {
    let record:Option<(String,String,String,Option<String>,Option<String>)>=tx.query_row("SELECT decision,approved_hash,registry_hash,tool_version,model_profile_hash FROM agent_approvals WHERE run_id=?1 AND plan_version=?2 AND approval_kind=?3 AND ((?4 IS NULL AND step_id IS NULL) OR step_id=?4) ORDER BY decision_sequence DESC LIMIT 1",params![run,version,kind,step],|row|Ok((row.get(0)?,row.get(1)?,row.get(2)?,row.get(3)?,row.get(4)?))).optional().map_err(|e|e.to_string())?;
    Ok(
        record.is_some_and(|(decision, hash, registry, tool, profile)| {
            decision == "approved"
                && hash == expected_hash
                && registry == registry_hash
                && tool.as_deref() == tool_version
                && profile.as_deref() == model_profile_hash
        }),
    )
}

fn assert_current_plan_approved(
    tx: &Transaction<'_>,
    run: &str,
    version: u32,
) -> Result<(), String> {
    let (mode,plan_hash,registry,planner_profile):(AgentAutomationMode,String,String,String)=tx.query_row("SELECT r.automation_mode,p.plan_hash,p.registry_hash,p.planner_profile_hash FROM agent_runs r JOIN agent_plans p ON p.run_id=r.id AND p.version=r.current_plan_version WHERE r.id=?1 AND p.version=?2",params![run,version],|row|Ok((enum_parse(&row.get::<_,String>(0)?).map_err(sql_error)?,row.get(1)?,row.get(2)?,row.get(3)?))).optional().map_err(|e|e.to_string())?.ok_or("AGENT_PLAN_VERSION_STALE")?;
    if mode == AgentAutomationMode::Advisor {
        return Err("AGENT_ADVISOR_TOOL_EXECUTION_FORBIDDEN".into());
    }
    if !effective_approval_matches(
        tx,
        run,
        version,
        None,
        "plan",
        &plan_hash,
        &registry,
        None,
        Some(&planner_profile),
    )? {
        return Err("AGENT_PLAN_APPROVAL_REQUIRED".into());
    }
    Ok(())
}

fn assert_running_step_action(
    tx: &Transaction<'_>,
    run: &str,
    version: u32,
    step: &str,
    action_hash: &str,
) -> Result<(), String> {
    let value:Option<(String,Option<String>)>=tx.query_row("SELECT status,action_hash FROM agent_steps WHERE run_id=?1 AND plan_version=?2 AND step_id=?3",params![run,version,step],|row|Ok((row.get(0)?,row.get(1)?))).optional().map_err(|e|e.to_string())?;
    match value {
        Some((status, Some(stored))) if status == "running" && stored == action_hash => Ok(()),
        Some((status, _)) if status != "running" => Err("AGENT_STEP_NOT_RUNNING".into()),
        Some(_) => Err("AGENT_ACTION_HASH_STALE".into()),
        None => Err("AGENT_STEP_NOT_FOUND".into()),
    }
}

fn insert_artifact(tx: &Transaction<'_>, artifact: &AgentArtifactRecord) -> Result<(), String> {
    let content = value_text(&artifact.content, AGENT_ARTIFACT_MAX_BYTES)?;
    if canonical_value_sha256(&artifact.content)? != artifact.content_sha256 {
        return Err("AGENT_ARTIFACT_HASH_MISMATCH".into());
    }
    let audit = artifact
        .audit
        .as_ref()
        .map(|value| value_text(value, AGENT_OBSERVATION_MAX_BYTES))
        .transpose()?;
    tx.execute("INSERT INTO agent_artifacts(id,run_id,step_id,artifact_kind,content_json,content_sha256,snapshot_id,audit_json,review_status,supersedes_artifact_id,created_at_ms) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",params![artifact.id,artifact.run_id,artifact.step_id,artifact.artifact_kind,content,artifact.content_sha256,artifact.snapshot_id,audit,artifact.review_status,artifact.supersedes_artifact_id,artifact.created_at_ms]).map_err(|e|e.to_string())?;
    Ok(())
}

fn validate_answer_shape(question: &AgentQuestionRecord, answer: &Value) -> Result<(), String> {
    match question.answer_type {
        AgentQuestionType::Text
            if answer
                .as_str()
                .is_some_and(|value| !value.trim().is_empty()) =>
        {
            Ok(())
        }
        AgentQuestionType::Confirm if answer.is_boolean() => Ok(()),
        AgentQuestionType::Choice => {
            let selected = answer.as_str().ok_or("AGENT_ANSWER_SHAPE_INVALID")?;
            let allowed = question
                .options
                .as_ref()
                .and_then(Value::as_array)
                .is_some_and(|options| {
                    options.iter().any(|value| value.as_str() == Some(selected))
                });
            if allowed {
                Ok(())
            } else {
                Err("AGENT_ANSWER_CHOICE_INVALID".into())
            }
        }
        _ => Err("AGENT_ANSWER_SHAPE_INVALID".into()),
    }
}

fn append_event(
    tx: &Transaction<'_>,
    run: &str,
    kind: &str,
    step: Option<&str>,
    payload: &Value,
    now: i64,
) -> Result<(), String> {
    let payload = value_text(payload, AGENT_EVENT_MAX_BYTES)?;
    let seq: i64 = tx
        .query_row(
            "SELECT next_event_sequence FROM agent_runs WHERE id=?1",
            params![run],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    tx.execute("INSERT INTO agent_events(run_id,sequence,event_type,step_id,payload_json,created_at_ms) VALUES(?1,?2,?3,?4,?5,?6)",params![run,seq,kind,step,payload,now]).map_err(|e|e.to_string())?;
    tx.execute("UPDATE agent_runs SET next_event_sequence=next_event_sequence+1,updated_at_ms=?2 WHERE id=?1",params![run,now]).map_err(|e|e.to_string())?;
    Ok(())
}
fn enum_text<T: Serialize>(value: T) -> Result<String, String> {
    serde_json::to_string(&value)
        .map(|v| v.trim_matches('"').to_string())
        .map_err(|e| e.to_string())
}
fn enum_parse<T: DeserializeOwned>(value: &str) -> Result<T, String> {
    serde_json::from_str(&format!("\"{value}\"")).map_err(|e| e.to_string())
}
fn json_text<T: Serialize>(value: &T, limit: usize) -> Result<String, String> {
    value_text(
        &serde_json::to_value(value).map_err(|e| e.to_string())?,
        limit,
    )
}
fn value_text(value: &Value, limit: usize) -> Result<String, String> {
    validate_storable_json(value)?;
    let text = serde_json::to_string(value).map_err(|e| e.to_string())?;
    if text.len() > limit {
        return Err("AGENT_JSON_SIZE_LIMIT_EXCEEDED".into());
    }
    Ok(text)
}
fn parse_sql_json(text: String) -> rusqlite::Result<Value> {
    serde_json::from_str(&text).map_err(|e| {
        rusqlite::Error::FromSqlConversionFailure(
            text.len(),
            rusqlite::types::Type::Text,
            Box::new(e),
        )
    })
}
fn parse_json<T: DeserializeOwned>(text: String) -> rusqlite::Result<T> {
    serde_json::from_str(&text).map_err(|e| {
        rusqlite::Error::FromSqlConversionFailure(
            text.len(),
            rusqlite::types::Type::Text,
            Box::new(e),
        )
    })
}
fn sql_error(e: String) -> rusqlite::Error {
    rusqlite::Error::FromSqlConversionFailure(
        0,
        rusqlite::types::Type::Text,
        Box::new(std::io::Error::new(std::io::ErrorKind::InvalidData, e)),
    )
}
fn row_to_run(r: &rusqlite::Row<'_>) -> rusqlite::Result<AgentRunRecord> {
    Ok(AgentRunRecord {
        id: r.get(0)?,
        library_instance_id: r.get(1)?,
        project_id: r.get(2)?,
        snapshot_id: r.get(3)?,
        automation_mode: enum_parse(&r.get::<_, String>(4)?).map_err(sql_error)?,
        status: enum_parse(&r.get::<_, String>(5)?).map_err(sql_error)?,
        objective: r.get(6)?,
        budget: parse_json(r.get(7)?)?,
        budget_usage: parse_json(r.get(8)?)?,
        current_plan_version: r.get::<_, Option<i64>>(9)?.map(|v| v as u32),
        decision_summary: r
            .get::<_, Option<String>>(10)?
            .map(parse_json)
            .transpose()?,
        last_error_code: r.get(11)?,
        created_at_ms: r.get(12)?,
        updated_at_ms: r.get(13)?,
        completed_at_ms: r.get(14)?,
    })
}
fn row_to_step(r: &rusqlite::Row<'_>) -> rusqlite::Result<AgentStepRecord> {
    Ok(AgentStepRecord {
        run_id: r.get(0)?,
        plan_version: r.get::<_, i64>(1)? as u32,
        step_id: r.get(2)?,
        ordinal: r.get::<_, i64>(3)? as u32,
        title: r.get(4)?,
        tool_name: r.get(5)?,
        tool_version: r.get(6)?,
        registry_hash: r.get(7)?,
        input: parse_sql_json(r.get(8)?)?,
        resolved_input: r
            .get::<_, Option<String>>(9)?
            .map(parse_sql_json)
            .transpose()?,
        action_hash: r.get(10)?,
        pending_approval_hash: r.get(11)?,
        pending_approval_requested_at_ms: r.get(12)?,
        risk: enum_parse(&r.get::<_, String>(13)?).map_err(sql_error)?,
        status: enum_parse(&r.get::<_, String>(14)?).map_err(sql_error)?,
        attempts: r.get::<_, i64>(15)? as u32,
        operation_key: r.get(16)?,
        recovery_count: r.get::<_, i64>(17)? as u32,
        observation: r
            .get::<_, Option<String>>(18)?
            .map(parse_sql_json)
            .transpose()?,
        last_error_code: r.get(19)?,
        started_at_ms: r.get(20)?,
        finished_at_ms: r.get(21)?,
        updated_at_ms: r.get(22)?,
    })
}
fn row_to_approval(r: &rusqlite::Row<'_>) -> rusqlite::Result<AgentApprovalRecord> {
    Ok(AgentApprovalRecord {
        id: r.get(0)?,
        run_id: r.get(1)?,
        decision_sequence: r.get(2)?,
        plan_version: r.get::<_, Option<i64>>(3)?.map(|value| value as u32),
        step_id: r.get(4)?,
        approval_kind: r.get(5)?,
        decision: r.get(6)?,
        approved_hash: r.get(7)?,
        risk: r
            .get::<_, Option<String>>(8)?
            .map(|value| enum_parse(&value).map_err(sql_error))
            .transpose()?,
        registry_hash: r.get(9)?,
        tool_version: r.get(10)?,
        model_profile_hash: r.get(11)?,
        actor_id: r.get(12)?,
        policy_reason: r.get(13)?,
        created_at_ms: r.get(14)?,
    })
}
fn row_to_question(r: &rusqlite::Row<'_>) -> rusqlite::Result<AgentQuestionRecord> {
    Ok(AgentQuestionRecord {
        id: r.get(0)?,
        run_id: r.get(1)?,
        plan_version: r.get::<_, Option<i64>>(2)?.map(|value| value as u32),
        step_id: r.get(3)?,
        prompt: r.get(4)?,
        answer_type: enum_parse(&r.get::<_, String>(5)?).map_err(sql_error)?,
        options: r
            .get::<_, Option<String>>(6)?
            .map(parse_sql_json)
            .transpose()?,
        requires_replan: r.get::<_, i64>(7)? != 0,
        created_at_ms: r.get(8)?,
    })
}
fn row_to_answer(r: &rusqlite::Row<'_>) -> rusqlite::Result<AgentAnswerRecord> {
    Ok(AgentAnswerRecord {
        id: r.get(0)?,
        question_id: r.get(1)?,
        run_id: r.get(2)?,
        answer: parse_sql_json(r.get(3)?)?,
        actor_id: r.get(4)?,
        created_at_ms: r.get(5)?,
    })
}
fn row_to_artifact_review(r: &rusqlite::Row<'_>) -> rusqlite::Result<AgentArtifactReviewRecord> {
    Ok(AgentArtifactReviewRecord {
        id: r.get(0)?,
        artifact_id: r.get(1)?,
        run_id: r.get(2)?,
        decision_sequence: r.get(3)?,
        artifact_sha256: r.get(4)?,
        decision: enum_parse(&r.get::<_, String>(5)?).map_err(sql_error)?,
        actor_id: r.get(6)?,
        reason: r.get(7)?,
        created_at_ms: r.get(8)?,
    })
}
fn row_to_model_profile(r: &rusqlite::Row<'_>) -> rusqlite::Result<AgentModelProfileRecord> {
    Ok(AgentModelProfileRecord {
        id: r.get(0)?,
        role: enum_parse(&r.get::<_, String>(1)?).map_err(sql_error)?,
        protocol: enum_parse(&r.get::<_, String>(2)?).map_err(sql_error)?,
        model: r.get(3)?,
        endpoint_origin: r.get(4)?,
        config: parse_sql_json(r.get(5)?)?,
        config_sha256: r.get(6)?,
        created_at_ms: r.get(7)?,
    })
}
fn row_to_lease(r: &rusqlite::Row<'_>) -> rusqlite::Result<AgentLease> {
    Ok(AgentLease {
        run_id: r.get(0)?,
        owner_id: r.get(1)?,
        lease_token: r.get(2)?,
        generation: r.get(3)?,
        acquired_at_ms: r.get(4)?,
        heartbeat_at_ms: r.get(5)?,
        expires_at_ms: r.get(6)?,
    })
}
fn row_to_artifact(r: &rusqlite::Row<'_>) -> rusqlite::Result<AgentArtifactRecord> {
    Ok(AgentArtifactRecord {
        id: r.get(0)?,
        run_id: r.get(1)?,
        step_id: r.get(2)?,
        artifact_kind: r.get(3)?,
        content: parse_sql_json(r.get(4)?)?,
        content_sha256: r.get(5)?,
        snapshot_id: r.get(6)?,
        audit: r
            .get::<_, Option<String>>(7)?
            .map(parse_sql_json)
            .transpose()?,
        review_status: r.get(8)?,
        supersedes_artifact_id: r.get(9)?,
        created_at_ms: r.get(10)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::{AgentPlanStep, AgentSuccessCriterion};
    fn db() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        crate::ensure_library_schema(&c).unwrap();
        c.execute(
            "INSERT INTO v20_analysis_snapshots(id,project_id,algorithm_version,paper_count,hotspot_count,membership_count,status,created_at) VALUES('s','p','v20',0,0,0,'ready','now')",
            [],
        )
        .unwrap();
        c.execute(
            "INSERT INTO v20_analysis_state(project_id,active_snapshot_id,updated_at) VALUES('p','s','now')",
            [],
        )
        .unwrap();
        c
    }
    fn add(r: &AgentRepository<'_>) {
        r.create_run(NewAgentRun {
            id: "r".into(),
            project_id: "p".into(),
            snapshot_id: Some("s".into()),
            automation_mode: AgentAutomationMode::Supervised,
            objective: "Research".into(),
            budget: AgentBudget::default(),
            now_ms: 1,
        })
        .unwrap();
    }
    fn plan() -> AgentPlan {
        AgentPlan {
            version: 1,
            objective: "Research".into(),
            assumptions: vec![],
            success_criteria: vec![AgentSuccessCriterion {
                id: "done".into(),
                description: "Done".into(),
            }],
            steps: vec![AgentPlanStep {
                id: "step".into(),
                title: "Inspect".into(),
                tool: "inspect_library".into(),
                input: json!({}),
                risk: AgentRiskLevel::Read,
            }],
        }
    }
    #[test]
    fn persistence_and_events() {
        let c = db();
        let r = AgentRepository::new(&c).unwrap();
        add(&r);
        r.transition_run("r", AgentRunStatus::Planning, None, 2)
            .unwrap();
        r.save_plan("r", &plan(), 3).unwrap();
        let s = r.snapshot("r").unwrap();
        assert_eq!(s.steps.len(), 1);
        assert_eq!(s.events.len(), 3)
    }
    #[test]
    fn lease_expiry_is_exclusive() {
        let c = db();
        let r = AgentRepository::new(&c).unwrap();
        add(&r);
        let a = r.acquire_lease("r", "a", "one", 10).unwrap();
        assert_eq!(
            r.acquire_lease("r", "b", "two", 11).unwrap_err(),
            "AGENT_RUN_LEASE_HELD"
        );
        assert!(r.renew_lease("r", "a", "bad", 12).is_err());
        assert_eq!(
            r.acquire_lease("r", "b", "two", a.expires_at_ms)
                .unwrap()
                .generation,
            2
        )
    }

    #[test]
    fn failed_writer_repairs_are_fenced_and_consume_the_global_budget() {
        let c = db();
        let r = AgentRepository::new(&c).unwrap();
        add(&r);
        r.transition_run("r", AgentRunStatus::Planning, None, 2)
            .unwrap();
        r.transition_run("r", AgentRunStatus::AwaitingPlanApproval, None, 3)
            .unwrap();
        r.transition_run("r", AgentRunStatus::Ready, None, 4)
            .unwrap();
        r.transition_run("r", AgentRunStatus::Running, None, 5)
            .unwrap();
        let lease = r.acquire_lease("r", "writer", "token", 10).unwrap();
        let fence = AgentLeaseFence {
            run_id: lease.run_id,
            owner_id: lease.owner_id,
            lease_token: lease.lease_token,
            generation: lease.generation,
        };
        let usage = r.record_protocol_repairs_fenced(&fence, 1, 11).unwrap();
        assert_eq!(usage.protocol_repairs, 1);
        assert_eq!(
            r.record_protocol_repairs_fenced(&fence, 1, 12).unwrap_err(),
            "AGENT_PROTOCOL_REPAIR_BUDGET_EXHAUSTED"
        );
        let stale = AgentLeaseFence {
            lease_token: "wrong".into(),
            ..fence
        };
        assert_eq!(
            r.record_protocol_repairs_fenced(&stale, 1, 13).unwrap_err(),
            "AGENT_RUN_LEASE_NOT_OWNED"
        );
    }
    #[test]
    fn receipt_is_atomic_and_idempotent() {
        let c = db();
        let r = AgentRepository::new(&c).unwrap();
        add(&r);
        r.transition_run("r", AgentRunStatus::Planning, None, 2)
            .unwrap();
        r.save_plan("r", &plan(), 3).unwrap();
        c.execute("CREATE TABLE business(v INTEGER)", []).unwrap();
        let k = r.operation_key("r", 1, "step", "write", "h").unwrap();
        let a = r
            .execute_idempotent_sqlite_mutation(&k, "r", 1, "step", "write", "h", 4, |tx| {
                tx.execute("INSERT INTO business VALUES(1)", [])
                    .map_err(|e| e.to_string())?;
                Ok(json!({"ok":true}))
            })
            .unwrap();
        let b = r
            .execute_idempotent_sqlite_mutation(&k, "r", 1, "step", "write", "h", 5, |_| {
                Err("duplicate".into())
            })
            .unwrap();
        assert_eq!(a, b);
        assert_eq!(
            c.query_row("SELECT count(*) FROM business", [], |x| x.get::<_, i64>(0))
                .unwrap(),
            1
        )
    }
    #[test]
    fn recovery_pauses_and_requeues() {
        let c = db();
        let r = AgentRepository::new(&c).unwrap();
        add(&r);
        r.transition_run("r", AgentRunStatus::Planning, None, 2)
            .unwrap();
        r.save_plan("r", &plan(), 3).unwrap();
        r.transition_run("r", AgentRunStatus::AwaitingPlanApproval, None, 4)
            .unwrap();
        r.transition_run("r", AgentRunStatus::Ready, None, 5)
            .unwrap();
        r.transition_run("r", AgentRunStatus::Running, None, 6)
            .unwrap();
        r.transition_step("r", 1, "step", AgentStepStatus::Ready, None, None, 7)
            .unwrap();
        r.transition_step("r", 1, "step", AgentStepStatus::Running, None, None, 8)
            .unwrap();
        r.acquire_lease("r", "a", "t", 9).unwrap();
        assert_eq!(
            r.recover_expired_runs(40_000).unwrap().requeued_step_count,
            1
        );
        let s = r.snapshot("r").unwrap();
        assert_eq!(s.run.status, AgentRunStatus::Paused);
        assert_eq!(s.steps[0].status, AgentStepStatus::Ready)
    }

    #[test]
    fn stale_approvals_and_immutable_events_are_rejected() {
        let c = db();
        let r = AgentRepository::new(&c).unwrap();
        add(&r);
        r.transition_run("r", AgentRunStatus::Planning, None, 2)
            .unwrap();
        let first = plan();
        let first_hash = r.save_plan("r", &first, 3).unwrap();
        r.record_approval(
            "a1",
            "r",
            Some(1),
            None,
            "plan",
            "approved",
            &first_hash,
            None,
            "local-user",
            None,
            4,
        )
        .unwrap();
        let mut second = plan();
        second.version = 2;
        second.steps[0].input = json!({"changed":true});
        r.save_plan("r", &second, 5).unwrap();
        assert_eq!(
            r.record_approval(
                "a2",
                "r",
                Some(1),
                None,
                "plan",
                "approved",
                &first_hash,
                None,
                "local-user",
                None,
                6
            )
            .unwrap_err(),
            "AGENT_PLAN_APPROVAL_STALE"
        );
        assert!(c
            .execute("UPDATE agent_events SET event_type='tampered'", [])
            .is_err());
    }

    #[test]
    fn failed_mutation_rolls_back_business_write_and_receipt() {
        let c = db();
        let r = AgentRepository::new(&c).unwrap();
        add(&r);
        r.transition_run("r", AgentRunStatus::Planning, None, 2)
            .unwrap();
        r.save_plan("r", &plan(), 3).unwrap();
        c.execute("CREATE TABLE business(v INTEGER)", []).unwrap();
        let key = r.operation_key("r", 1, "step", "write", "failed").unwrap();
        assert!(r
            .execute_idempotent_sqlite_mutation(&key, "r", 1, "step", "write", "failed", 4, |tx| {
                tx.execute("INSERT INTO business VALUES(1)", [])
                    .map_err(|e| e.to_string())?;
                Err("injected".into())
            })
            .is_err());
        assert_eq!(
            c.query_row("SELECT count(*) FROM business", [], |row| row
                .get::<_, i64>(0))
                .unwrap(),
            0
        );
        assert_eq!(
            c.query_row("SELECT count(*) FROM agent_tool_receipts", [], |row| row
                .get::<_, i64>(0))
                .unwrap(),
            0
        );
    }

    #[test]
    fn artifacts_are_hashed_and_immutable() {
        let c = db();
        let r = AgentRepository::new(&c).unwrap();
        add(&r);
        let content = json!({"report":"traceable"});
        let artifact = AgentArtifactRecord {
            id: "artifact".into(),
            run_id: "r".into(),
            step_id: None,
            artifact_kind: "report".into(),
            content: content.clone(),
            content_sha256: canonical_value_sha256(&content).unwrap(),
            snapshot_id: Some("s".into()),
            audit: Some(json!({"risk":"low"})),
            review_status: Some("approved".into()),
            supersedes_artifact_id: None,
            created_at_ms: 2,
        };
        r.put_artifact(&artifact).unwrap();
        let warning_content = json!({"audit":"medium-risk"});
        r.put_artifact(&AgentArtifactRecord {
            id: "warning-artifact".into(),
            run_id: "r".into(),
            step_id: None,
            artifact_kind: "report_audit".into(),
            content: warning_content.clone(),
            content_sha256: canonical_value_sha256(&warning_content).unwrap(),
            snapshot_id: Some("s".into()),
            audit: None,
            review_status: Some("warning".into()),
            supersedes_artifact_id: None,
            created_at_ms: 3,
        })
        .unwrap();
        assert!(c.execute("DELETE FROM agent_artifacts", []).is_err());
        let mut bad = artifact;
        bad.id = "bad".into();
        bad.content_sha256 = "0".repeat(64);
        assert_eq!(
            r.put_artifact(&bad).unwrap_err(),
            "AGENT_ARTIFACT_HASH_MISMATCH"
        );
    }

    #[test]
    fn recovery_uses_committed_receipt_without_reexecution() {
        let c = db();
        let r = AgentRepository::new(&c).unwrap();
        add(&r);
        r.transition_run("r", AgentRunStatus::Planning, None, 2)
            .unwrap();
        r.save_plan("r", &plan(), 3).unwrap();
        r.transition_run("r", AgentRunStatus::AwaitingPlanApproval, None, 4)
            .unwrap();
        r.transition_run("r", AgentRunStatus::Ready, None, 5)
            .unwrap();
        r.transition_run("r", AgentRunStatus::Running, None, 6)
            .unwrap();
        r.transition_step("r", 1, "step", AgentStepStatus::Ready, None, None, 7)
            .unwrap();
        r.transition_step("r", 1, "step", AgentStepStatus::Running, None, None, 8)
            .unwrap();
        let key = r
            .operation_key("r", 1, "step", "write", "committed")
            .unwrap();
        r.execute_idempotent_sqlite_mutation(&key, "r", 1, "step", "write", "committed", 9, |_| {
            Ok(json!({"ok":true}))
        })
        .unwrap();
        r.acquire_lease("r", "a", "t", 10).unwrap();
        let recovered = r.recover_expired_runs(40_001).unwrap();
        assert_eq!(recovered.completed_step_count, 1);
        assert_eq!(
            r.snapshot("r").unwrap().steps[0].status,
            AgentStepStatus::Succeeded
        );
    }

    #[test]
    fn v9_file_migrates_to_v10_with_backup_and_new_contract() {
        let directory = std::env::current_dir()
            .unwrap()
            .join("target")
            .join("agent-schema-tests");
        fs::create_dir_all(&directory).unwrap();
        let database = directory.join(format!(
            "v9-{}-{}.sqlite",
            std::process::id(),
            std::thread::current()
                .name()
                .unwrap_or("test")
                .replace(':', "-")
        ));
        cleanup_test_file(&database);
        let expected_backup = database.with_file_name(format!(
            "{}.pre-schema-v10.123.sqlite",
            database.file_stem().unwrap().to_string_lossy()
        ));
        cleanup_test_file(&expected_backup);
        create_complete_v9_migration_fixture(&database);
        let before_state =
            crate::validate_library_candidate_file(&database, "project-default").unwrap();
        let migration = migrate_library_file(&database, "project-default", 123, true).unwrap();
        assert_eq!(migration.previous_version, 9);
        assert_eq!(migration.current_version, 10);
        let backup = migration.backup_path.unwrap();
        let backup_hash = crate::sha256_file(&backup).unwrap();
        assert_eq!(
            migration.backup_sha256.as_deref(),
            Some(backup_hash.as_str())
        );
        assert!(backup
            .file_name()
            .unwrap()
            .to_string_lossy()
            .contains("pre-schema-v10"));
        assert_eq!(
            crate::validate_library_candidate_file(&backup, "project-default").unwrap(),
            before_state
        );
        let connection = Connection::open(&database).unwrap();
        connection
            .pragma_update(None, "foreign_keys", "ON")
            .unwrap();
        assert_eq!(
            connection
                .pragma_query_value(None, "user_version", |row| row.get::<_, i64>(0))
                .unwrap(),
            10
        );
        assert_same_v20_state(
            &crate::validate_library_candidate_connection(&connection, "project-default").unwrap(),
            &before_state,
        );
        assert_eq!(
            connection
                .query_row("SELECT COUNT(*) FROM agent_runs", [], |row| {
                    row.get::<_, i64>(0)
                })
                .unwrap(),
            1
        );
        assert_eq!(
            connection
                .query_row(
                    "SELECT artifact_id FROM agent_tool_receipts WHERE operation_key='legacy-operation'",
                    [],
                    |row| row.get::<_, String>(0),
                )
                .unwrap(),
            "legacy-artifact-2"
        );
        assert_eq!(
            connection
                .query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |row| {
                    row.get::<_, i64>(0)
                })
                .unwrap(),
            0
        );
        connection
            .execute(
                "INSERT INTO agent_artifacts(
                  id,run_id,step_id,artifact_kind,content_json,content_sha256,snapshot_id,audit_json,
                  review_status,supersedes_artifact_id,created_at_ms
                 ) VALUES(
                  'warning-artifact','legacy-run','legacy-step','report_audit','{}',?1,
                  'snapshot-1',NULL,'warning','legacy-artifact-2',30
                 )",
                params!["c".repeat(64)],
            )
            .unwrap();
        assert!(connection
            .execute(
                "UPDATE agent_artifacts SET review_status='approved' WHERE id='legacy-artifact-1'",
                [],
            )
            .is_err());
        drop(connection);
        cleanup_test_file(&database);
        cleanup_test_file(&backup);
    }

    #[test]
    fn v8_seed_shape_migrates_directly_to_v10() {
        let directory = std::env::current_dir()
            .unwrap()
            .join("target")
            .join("agent-schema-tests");
        fs::create_dir_all(&directory).unwrap();
        let database = directory.join(format!("v8-{}.sqlite", std::process::id()));
        cleanup_test_file(&database);
        create_v20_migration_fixture(&database, 8);
        let before_state =
            crate::validate_library_candidate_file(&database, "project-default").unwrap();
        let migration = migrate_library_file(&database, "project-default", 456, false).unwrap();
        assert_eq!(
            (migration.previous_version, migration.current_version),
            (8, 10)
        );
        assert!(migration.backup_path.is_none());
        let connection = Connection::open(&database).unwrap();
        assert_same_v20_state(
            &crate::validate_library_candidate_connection(&connection, "project-default").unwrap(),
            &before_state,
        );
        assert!(table_exists(&connection, "agent_questions").unwrap());
        assert!(table_exists(&connection, "agent_model_profiles").unwrap());
        assert_eq!(
            connection
                .pragma_query_value(None, "user_version", |row| row.get::<_, i64>(0))
                .unwrap(),
            10
        );
        drop(connection);
        cleanup_test_file(&database);
    }

    #[test]
    fn repeated_v10_open_is_idempotent_and_does_not_create_another_backup() {
        let directory = std::env::current_dir()
            .unwrap()
            .join("target")
            .join("agent-schema-tests");
        fs::create_dir_all(&directory).unwrap();
        let database = directory.join(format!("v10-idempotent-{}.sqlite", std::process::id()));
        let first_backup = database.with_file_name(format!(
            "{}.pre-schema-v10.1003.sqlite",
            database.file_stem().unwrap().to_string_lossy()
        ));
        let second_backup = database.with_file_name(format!(
            "{}.pre-schema-v10.1004.sqlite",
            database.file_stem().unwrap().to_string_lossy()
        ));
        let first_partial = first_backup.with_file_name(format!(
            "{}.partial",
            first_backup.file_name().unwrap().to_string_lossy()
        ));
        for path in [&database, &first_backup, &second_backup, &first_partial] {
            cleanup_test_file(path);
        }
        create_v20_migration_fixture(&database, 8);
        fs::write(&first_partial, b"stale-partial").unwrap();

        let first = migrate_library_file(&database, "project-default", 1003, true).unwrap();
        assert_eq!((first.previous_version, first.current_version), (8, 10));
        assert_eq!(first.backup_path.as_deref(), Some(first_backup.as_path()));
        assert!(!first_partial.exists());
        let first_state =
            crate::validate_library_candidate_file(&database, "project-default").unwrap();

        let second = migrate_library_file(&database, "project-default", 1004, true).unwrap();
        assert_eq!((second.previous_version, second.current_version), (10, 10));
        assert!(second.backup_path.is_none());
        assert!(!second_backup.exists());
        assert_eq!(
            crate::validate_library_candidate_file(&database, "project-default").unwrap(),
            first_state
        );

        cleanup_test_file(&database);
        cleanup_test_file(&first_backup);
        cleanup_test_file(&second_backup);
        cleanup_test_file(&first_partial);
    }

    #[test]
    fn concurrent_migration_serializes_and_only_one_thread_upgrades() {
        let directory = std::env::current_dir()
            .unwrap()
            .join("target")
            .join("agent-schema-tests");
        fs::create_dir_all(&directory).unwrap();
        let database = directory.join(format!("v10-concurrent-{}.sqlite", std::process::id()));
        let backup_one = database.with_file_name(format!(
            "{}.pre-schema-v10.2001.sqlite",
            database.file_stem().unwrap().to_string_lossy()
        ));
        let backup_two = database.with_file_name(format!(
            "{}.pre-schema-v10.2002.sqlite",
            database.file_stem().unwrap().to_string_lossy()
        ));
        for path in [&database, &backup_one, &backup_two] {
            cleanup_test_file(path);
        }
        create_v20_migration_fixture(&database, 8);
        let barrier = Arc::new(std::sync::Barrier::new(3));
        let mut workers = Vec::new();
        for now_ms in [2001, 2002] {
            let database = database.clone();
            let barrier = Arc::clone(&barrier);
            workers.push(std::thread::spawn(move || {
                barrier.wait();
                migrate_library_file(&database, "project-default", now_ms, true)
            }));
        }
        barrier.wait();
        let results = workers
            .into_iter()
            .map(|worker| worker.join().unwrap().unwrap())
            .collect::<Vec<_>>();
        assert_eq!(
            results
                .iter()
                .filter(|result| result.previous_version == 8 && result.backup_path.is_some())
                .count(),
            1
        );
        assert_eq!(
            results
                .iter()
                .filter(|result| result.previous_version == 10 && result.backup_path.is_none())
                .count(),
            1
        );
        assert_eq!(
            [backup_one.is_file(), backup_two.is_file()]
                .into_iter()
                .filter(|exists| *exists)
                .count(),
            1
        );
        let migrated =
            crate::validate_library_candidate_file(&database, "project-default").unwrap();
        assert_eq!(migrated.schema_version, 10);
        assert_eq!(
            (
                migrated.paper_count,
                migrated.hotspot_count,
                migrated.membership_count
            ),
            (1, 1, 1)
        );

        cleanup_test_file(&database);
        cleanup_test_file(&backup_one);
        cleanup_test_file(&backup_two);
    }

    #[test]
    fn existing_user_version_zero_file_is_rejected_without_mutation() {
        let directory = std::env::current_dir()
            .unwrap()
            .join("target")
            .join("agent-schema-tests");
        fs::create_dir_all(&directory).unwrap();
        let database = directory.join(format!("v0-existing-{}.sqlite", std::process::id()));
        let backup = database.with_file_name(format!(
            "{}.pre-schema-v10.3001.sqlite",
            database.file_stem().unwrap().to_string_lossy()
        ));
        cleanup_test_file(&database);
        cleanup_test_file(&backup);
        let connection = Connection::open(&database).unwrap();
        connection
            .execute_batch(
                "CREATE TABLE papers(id TEXT NOT NULL,project_id TEXT NOT NULL,PRIMARY KEY(project_id,id));
                 INSERT INTO papers(id,project_id) VALUES('legacy','project-default');",
            )
            .unwrap();
        drop(connection);
        let before_hash = crate::sha256_file(&database).unwrap();

        assert_eq!(
            migrate_library_file(&database, "project-default", 3001, true).unwrap_err(),
            "LIBRARY_SCHEMA_TOO_OLD"
        );
        assert_eq!(crate::sha256_file(&database).unwrap(), before_hash);
        assert!(!backup.exists());
        let connection = Connection::open(&database).unwrap();
        assert_eq!(
            connection
                .pragma_query_value(None, "user_version", |row| row.get::<_, i64>(0))
                .unwrap(),
            0
        );
        assert!(!table_exists(&connection, "agent_runs").unwrap());
        drop(connection);
        cleanup_test_file(&database);
    }

    #[test]
    fn existing_v10_backup_path_rejects_migration_without_touching_v8_source() {
        let directory = std::env::current_dir()
            .unwrap()
            .join("target")
            .join("agent-schema-tests");
        fs::create_dir_all(&directory).unwrap();
        let database = directory.join(format!("v8-backup-exists-{}.sqlite", std::process::id()));
        let backup = database.with_file_name(format!(
            "{}.pre-schema-v10.1001.sqlite",
            database.file_stem().unwrap().to_string_lossy()
        ));
        cleanup_test_file(&database);
        cleanup_test_file(&backup);
        create_v20_migration_fixture(&database, 8);
        fs::write(&backup, b"do-not-overwrite").unwrap();

        let before_hash = crate::sha256_file(&database).unwrap();
        let before_state =
            crate::validate_library_candidate_file(&database, "project-default").unwrap();
        assert_eq!(
            migrate_library_file(&database, "project-default", 1001, true).unwrap_err(),
            "AGENT_MIGRATION_BACKUP_EXISTS"
        );

        assert_eq!(fs::read(&backup).unwrap(), b"do-not-overwrite");
        assert_eq!(crate::sha256_file(&database).unwrap(), before_hash);
        assert_eq!(
            crate::validate_library_candidate_file(&database, "project-default").unwrap(),
            before_state
        );
        let connection = Connection::open(&database).unwrap();
        assert_eq!(
            connection
                .pragma_query_value(None, "user_version", |row| row.get::<_, i64>(0))
                .unwrap(),
            8
        );
        assert!(!table_exists(&connection, "agent_runs").unwrap());
        drop(connection);
        cleanup_test_file(&database);
        cleanup_test_file(&backup);
    }

    #[test]
    fn failed_v9_schema_migration_rolls_back_source_and_preserves_verified_backup() {
        let directory = std::env::current_dir()
            .unwrap()
            .join("target")
            .join("agent-schema-tests");
        fs::create_dir_all(&directory).unwrap();
        let database = directory.join(format!(
            "v9-migration-failure-{}.sqlite",
            std::process::id()
        ));
        let backup = database.with_file_name(format!(
            "{}.pre-schema-v10.1002.sqlite",
            database.file_stem().unwrap().to_string_lossy()
        ));
        cleanup_test_file(&database);
        cleanup_test_file(&backup);
        // This is a valid V20 library tagged as schema v9, but it deliberately lacks
        // the v9 Agent tables. The v10 Agent DDL therefore fails after the online
        // backup has already been created and validated.
        create_v20_migration_fixture(&database, 9);

        let before_hash = crate::sha256_file(&database).unwrap();
        let before_state =
            crate::validate_library_candidate_file(&database, "project-default").unwrap();
        let error = migrate_library_file(&database, "project-default", 1002, true).unwrap_err();
        assert!(
            error.starts_with("AGENT_SCHEMA_MIGRATION_FAILED:"),
            "{error}"
        );

        assert!(backup.is_file());
        assert_eq!(
            crate::validate_library_candidate_file(&backup, "project-default").unwrap(),
            before_state
        );
        assert_eq!(crate::sha256_file(&database).unwrap(), before_hash);
        assert_eq!(
            crate::validate_library_candidate_file(&database, "project-default").unwrap(),
            before_state
        );
        let connection = Connection::open(&database).unwrap();
        assert_eq!(
            connection
                .pragma_query_value(None, "user_version", |row| row.get::<_, i64>(0))
                .unwrap(),
            9
        );
        assert!(!table_exists(&connection, "agent_runs_v10").unwrap());
        drop(connection);
        cleanup_test_file(&database);
        cleanup_test_file(&backup);
    }

    #[test]
    fn trusted_model_profile_references_reject_hash_role_endpoint_and_service_rebinding() {
        fn profile(
            id: &str,
            role: AgentModelRole,
            endpoint: &str,
            service: &str,
        ) -> AgentModelProfileRecord {
            let config = json!({
                "gatewayProfile": {
                    "protocol": "openai_responses",
                    "baseUrl": endpoint,
                    "model": "trusted-model",
                    "nativeStructuredOutput": true,
                    "anthropicVersion": null,
                    "allowLocalHttp": false
                },
                "credentialService": service,
                "developmentEnv": null
            });
            let config_sha256 = canonical_value_sha256(&json!({
                "role": role,
                "protocol": AgentModelProtocol::OpenaiResponses,
                "model": "trusted-model",
                "endpointOrigin": endpoint,
                "config": config,
            }))
            .unwrap();
            AgentModelProfileRecord {
                id: id.into(),
                role,
                protocol: AgentModelProtocol::OpenaiResponses,
                model: "trusted-model".into(),
                endpoint_origin: endpoint.into(),
                config,
                config_sha256,
                created_at_ms: 1,
            }
        }

        let connection = db();
        let repository = AgentRepository::new(&connection).unwrap();
        let trusted = repository
            .put_model_profile(&profile(
                "planner-trusted",
                AgentModelRole::Planner,
                "https://trusted.example",
                "ai-trusted",
            ))
            .unwrap();
        let trusted_reference = AgentModelProfileReference {
            profile_id: trusted.id.clone(),
            config_sha256: trusted.config_sha256.clone(),
        };
        assert!(serde_json::from_value::<AgentModelProfileReference>(json!({
            "profileId": trusted.id,
            "configSha256": trusted.config_sha256,
            "baseUrl": "https://attacker.example",
            "credentialService": "ai-trusted"
        }))
        .is_err());
        assert_eq!(
            repository
                .resolve_model_profile_reference(&trusted_reference, AgentModelRole::Planner,)
                .unwrap(),
            trusted
        );

        let mut changed_hash = trusted_reference.clone();
        changed_hash.config_sha256 = "0".repeat(64);
        assert_eq!(
            repository
                .resolve_model_profile_reference(&changed_hash, AgentModelRole::Planner)
                .unwrap_err(),
            "AGENT_MODEL_PROFILE_REFERENCE_MISMATCH"
        );
        let mut changed_id = trusted_reference.clone();
        changed_id.profile_id = "planner-attacker".into();
        assert_eq!(
            repository
                .resolve_model_profile_reference(&changed_id, AgentModelRole::Planner)
                .unwrap_err(),
            "AGENT_MODEL_PROFILE_NOT_FOUND"
        );
        assert_eq!(
            repository
                .resolve_model_profile_reference(&trusted_reference, AgentModelRole::Writer,)
                .unwrap_err(),
            "AGENT_MODEL_PROFILE_ROLE_MISMATCH"
        );

        assert_eq!(
            repository
                .put_model_profile(&profile(
                    "planner-trusted",
                    AgentModelRole::Planner,
                    "https://attacker.example",
                    "ai-trusted",
                ))
                .unwrap_err(),
            "AGENT_MODEL_PROFILE_ID_REBIND_FORBIDDEN"
        );
        assert_eq!(
            repository
                .put_model_profile(&profile(
                    "planner-trusted",
                    AgentModelRole::Planner,
                    "https://trusted.example",
                    "ai-attacker-service",
                ))
                .unwrap_err(),
            "AGENT_MODEL_PROFILE_ID_REBIND_FORBIDDEN"
        );
        assert_eq!(
            repository
                .resolve_model_profile_reference(&trusted_reference, AgentModelRole::Planner,)
                .unwrap(),
            trusted
        );
    }

    #[test]
    fn questions_profiles_reviews_and_fenced_claims_are_recoverable() {
        let connection = db();
        let repository = AgentRepository::new(&connection).unwrap();
        add(&repository);
        let config = json!({"temperature":0});
        let profile_hash=canonical_value_sha256(&json!({"role":"planner","protocol":"openai_responses","model":"test-model","endpointOrigin":"https://example.test","config":config})).unwrap();
        repository
            .put_model_profile(&AgentModelProfileRecord {
                id: "profile".into(),
                role: AgentModelRole::Planner,
                protocol: AgentModelProtocol::OpenaiResponses,
                model: "test-model".into(),
                endpoint_origin: "https://example.test".into(),
                config: config.clone(),
                config_sha256: profile_hash.clone(),
                created_at_ms: 2,
            })
            .unwrap();
        assert_eq!(
            repository
                .get_model_profile_by_hash(&profile_hash)
                .unwrap()
                .unwrap()
                .id,
            "profile"
        );
        repository
            .transition_run("r", AgentRunStatus::Planning, None, 3)
            .unwrap();
        let lease = repository
            .acquire_lease("r", "planner", "token", 4)
            .unwrap();
        let fence = AgentLeaseFence {
            run_id: lease.run_id.clone(),
            owner_id: lease.owner_id.clone(),
            lease_token: lease.lease_token.clone(),
            generation: lease.generation,
        };
        repository
            .record_user_question(
                &fence,
                "question",
                None,
                None,
                &AgentQuestionRequest {
                    prompt: "Use a narrower topic?".into(),
                    answer_type: AgentQuestionType::Confirm,
                    options: vec![],
                    requires_replan: true,
                },
                5,
            )
            .unwrap();
        repository
            .submit_user_answer("answer", "r", "question", &json!(true), "local-user", 6)
            .unwrap();
        assert_eq!(
            repository
                .submit_user_answer("again", "r", "question", &json!(true), "local-user", 7)
                .unwrap_err(),
            "AGENT_QUESTION_ALREADY_ANSWERED"
        );
        let content = json!({"report":"review me"});
        let artifact = AgentArtifactRecord {
            id: "artifact-review".into(),
            run_id: "r".into(),
            step_id: None,
            artifact_kind: "report".into(),
            content: content.clone(),
            content_sha256: canonical_value_sha256(&content).unwrap(),
            snapshot_id: Some("s".into()),
            audit: None,
            review_status: Some("needs-review".into()),
            supersedes_artifact_id: None,
            created_at_ms: 8,
        };
        repository.put_artifact(&artifact).unwrap();
        repository
            .review_artifact(
                "review-1",
                "artifact-review",
                &artifact.content_sha256,
                AgentArtifactReviewDecision::Rejected,
                "local-user",
                None,
                9,
            )
            .unwrap();
        repository
            .review_artifact(
                "review-2",
                "artifact-review",
                &artifact.content_sha256,
                AgentArtifactReviewDecision::Approved,
                "local-user",
                None,
                10,
            )
            .unwrap();
        assert_eq!(
            repository
                .resolve_effective_artifact_review("artifact-review")
                .unwrap()
                .unwrap()
                .decision,
            AgentArtifactReviewDecision::Approved
        );
        let snapshot = repository.snapshot("r").unwrap();
        assert_eq!(snapshot.questions.len(), 1);
        assert_eq!(snapshot.answers.len(), 1);
        assert_eq!(snapshot.artifact_reviews.len(), 2);
    }

    #[test]
    fn missing_lease_pauses_executing_run() {
        let connection = db();
        let repository = AgentRepository::new(&connection).unwrap();
        add(&repository);
        repository
            .transition_run("r", AgentRunStatus::Planning, None, 2)
            .unwrap();
        repository.save_plan("r", &plan(), 3).unwrap();
        repository
            .transition_run("r", AgentRunStatus::AwaitingPlanApproval, None, 4)
            .unwrap();
        repository
            .transition_run("r", AgentRunStatus::Ready, None, 5)
            .unwrap();
        repository
            .transition_run("r", AgentRunStatus::Running, None, 6)
            .unwrap();
        let recovered = repository.recover_expired_runs(7).unwrap();
        assert_eq!(recovered.recovered_run_ids, vec!["r"]);
        assert_eq!(
            repository.get_run("r").unwrap().unwrap().status,
            AgentRunStatus::Paused
        );
    }

    #[test]
    fn report_revision_pair_skip_is_atomic_and_repairs_a_legacy_partial_skip() {
        let connection = db();
        let repository = AgentRepository::new(&connection).unwrap();
        add(&repository);
        repository
            .transition_run("r", AgentRunStatus::Planning, None, 2)
            .unwrap();
        let mut revision_plan = plan();
        revision_plan.steps = vec![
            AgentPlanStep {
                id: "revise-high-risk".into(),
                title: "Revise".into(),
                tool: "revise_report_draft".into(),
                input: json!({}),
                risk: AgentRiskLevel::Write,
            },
            AgentPlanStep {
                id: "audit-revised".into(),
                title: "Audit revised".into(),
                tool: "inspect_report_audit".into(),
                input: json!({}),
                risk: AgentRiskLevel::Read,
            },
        ];
        repository.save_plan("r", &revision_plan, 3).unwrap();
        repository
            .transition_run("r", AgentRunStatus::AwaitingPlanApproval, None, 4)
            .unwrap();
        repository
            .transition_run("r", AgentRunStatus::Ready, None, 5)
            .unwrap();
        repository
            .transition_run("r", AgentRunStatus::Running, None, 6)
            .unwrap();
        for step_id in ["revise-high-risk", "audit-revised"] {
            repository
                .transition_step("r", 1, step_id, AgentStepStatus::Ready, None, None, 7)
                .unwrap();
        }
        let lease = repository
            .acquire_lease("r", "executor", "revision-skip", 8)
            .unwrap();
        let fence = AgentLeaseFence {
            run_id: lease.run_id,
            owner_id: lease.owner_id,
            lease_token: lease.lease_token,
            generation: lease.generation,
        };

        repository
            .skip_step_fenced(
                &fence,
                1,
                "revise-high-risk",
                "AGENT_REPORT_REVISION_NOT_REQUIRED",
                9,
            )
            .unwrap();
        repository
            .skip_report_revision_fenced(&fence, 1, 10)
            .unwrap();
        repository
            .skip_report_revision_fenced(&fence, 1, 11)
            .unwrap();

        for step_id in ["revise-high-risk", "audit-revised"] {
            let step = repository.get_step("r", 1, step_id).unwrap().unwrap();
            assert_eq!(step.status, AgentStepStatus::Skipped);
            assert_eq!(
                step.last_error_code.as_deref(),
                Some("AGENT_REPORT_REVISION_NOT_REQUIRED")
            );
        }
        let skipped_events = repository
            .snapshot("r")
            .unwrap()
            .events
            .into_iter()
            .filter(|event| event.event_type == "step_skipped")
            .count();
        assert_eq!(skipped_events, 2);
    }

    #[test]
    fn fenced_claim_failure_requeue_and_commit_are_atomic() {
        let connection = db();
        let repository = AgentRepository::new(&connection).unwrap();
        add(&repository);
        repository
            .transition_run("r", AgentRunStatus::Planning, None, 2)
            .unwrap();
        let plan_hash = repository.save_plan("r", &plan(), 3).unwrap();
        repository
            .transition_run("r", AgentRunStatus::AwaitingPlanApproval, None, 4)
            .unwrap();
        repository
            .record_approval(
                "plan-approval",
                "r",
                Some(1),
                None,
                "plan",
                "approved",
                &plan_hash,
                None,
                "local-user",
                None,
                5,
            )
            .unwrap();
        repository
            .transition_run("r", AgentRunStatus::Ready, None, 6)
            .unwrap();
        repository
            .transition_run("r", AgentRunStatus::Running, None, 7)
            .unwrap();
        repository
            .transition_step("r", 1, "step", AgentStepStatus::Ready, None, None, 8)
            .unwrap();
        let lease = repository
            .acquire_lease("r", "executor", "lease-1", 9)
            .unwrap();
        let fence = AgentLeaseFence {
            run_id: lease.run_id.clone(),
            owner_id: lease.owner_id.clone(),
            lease_token: lease.lease_token.clone(),
            generation: lease.generation,
        };
        repository
            .claim_step(&fence, 1, "step", &json!({}), "action", 10)
            .unwrap();
        repository
            .commit_tool_failure(&fence, 1, "step", "action", "TEMPORARY", true, 11)
            .unwrap();
        repository
            .requeue_failed_step_fenced(&fence, 1, "step", "action", 12)
            .unwrap();
        repository
            .claim_step(&fence, 1, "step", &json!({}), "action", 13)
            .unwrap();
        connection
            .execute("CREATE TABLE governed_business(value INTEGER)", [])
            .unwrap();
        let operation_key = repository
            .operation_key("r", 1, "step", "inspect_library", "action")
            .unwrap();
        let artifact_content = json!({"kind":"snapshot-fenced-evidence"});
        let artifact = AgentArtifactRecord {
            id: "snapshot-fenced-artifact".into(),
            run_id: "r".into(),
            step_id: Some("step".into()),
            artifact_kind: "evidence".into(),
            content_sha256: canonical_value_sha256(&artifact_content).unwrap(),
            content: artifact_content,
            snapshot_id: Some("s".into()),
            audit: None,
            review_status: Some("approved".into()),
            supersedes_artifact_id: None,
            created_at_ms: 14,
        };
        connection
            .execute(
                "INSERT INTO v20_analysis_snapshots(id,project_id,algorithm_version,paper_count,hotspot_count,membership_count,status,created_at) VALUES('s2','p','v20',0,0,0,'ready','later')",
                [],
            )
            .unwrap();
        connection
            .execute(
                "UPDATE v20_analysis_state SET active_snapshot_id='s2' WHERE project_id='p'",
                [],
            )
            .unwrap();
        assert_eq!(
            repository
                .commit_tool_success(
                    &fence,
                    1,
                    "step",
                    &operation_key,
                    "inspect_library",
                    "action",
                    &json!({"ok":true}),
                    Some(&artifact),
                    14,
                    |tx| {
                        tx.execute("INSERT INTO governed_business VALUES(1)", [])
                            .map_err(|error| error.to_string())?;
                        Ok(())
                    },
                )
                .unwrap_err(),
            "AGENT_V20_SNAPSHOT_STALE"
        );
        assert_eq!(
            connection
                .query_row("SELECT COUNT(*) FROM governed_business", [], |row| row
                    .get::<_, i64>(0))
                .unwrap(),
            0
        );
        assert_eq!(
            connection
                .query_row("SELECT COUNT(*) FROM agent_tool_receipts", [], |row| row
                    .get::<_, i64>(0))
                .unwrap(),
            0
        );
        assert_eq!(
            connection
                .query_row("SELECT COUNT(*) FROM agent_artifacts", [], |row| {
                    row.get::<_, i64>(0)
                })
                .unwrap(),
            0
        );
        connection
            .execute(
                "UPDATE v20_analysis_state SET active_snapshot_id='s' WHERE project_id='p'",
                [],
            )
            .unwrap();
        repository
            .commit_tool_success(
                &fence,
                1,
                "step",
                &operation_key,
                "inspect_library",
                "action",
                &json!({"ok":true}),
                Some(&artifact),
                14,
                |tx| {
                    tx.execute("INSERT INTO governed_business VALUES(1)", [])
                        .map_err(|error| error.to_string())?;
                    Ok(())
                },
            )
            .unwrap();
        assert_eq!(
            connection
                .query_row("SELECT COUNT(*) FROM governed_business", [], |row| row
                    .get::<_, i64>(0))
                .unwrap(),
            1
        );
        assert_eq!(
            repository.get_step("r", 1, "step").unwrap().unwrap().status,
            AgentStepStatus::Succeeded
        );
        assert_eq!(repository.snapshot("r").unwrap().artifacts, vec![artifact]);
        let replacement = repository
            .acquire_lease("r", "executor-2", "lease-2", lease.expires_at_ms)
            .unwrap();
        assert_eq!(replacement.generation, 2);
        assert_eq!(
            repository
                .transition_run_fenced(
                    &fence,
                    AgentRunStatus::Running,
                    AgentRunStatus::Evaluating,
                    None,
                    lease.expires_at_ms + 1
                )
                .unwrap_err(),
            "AGENT_RUN_LEASE_NOT_OWNED"
        );
    }

    #[test]
    fn plan_and_action_decisions_bind_current_server_context() {
        let connection = db();
        let repository = AgentRepository::new(&connection).unwrap();
        add(&repository);
        repository
            .transition_run("r", AgentRunStatus::Planning, None, 2)
            .unwrap();
        let mut governed_plan = plan();
        governed_plan.steps[0].risk = AgentRiskLevel::Write;
        repository.save_plan("r", &governed_plan, 3).unwrap();
        repository
            .transition_run("r", AgentRunStatus::AwaitingPlanApproval, None, 4)
            .unwrap();
        let plan_decision = repository
            .decide_current_plan("r", "approved", "local-user", None, 5)
            .unwrap();
        assert_eq!(plan_decision.decision, "approved");
        assert_eq!(
            repository.get_run("r").unwrap().unwrap().status,
            AgentRunStatus::Ready
        );
        assert_eq!(
            repository.get_step("r", 1, "step").unwrap().unwrap().status,
            AgentStepStatus::Ready
        );
        repository
            .transition_run("r", AgentRunStatus::Running, None, 6)
            .unwrap();
        let lease = repository
            .acquire_lease("r", "executor", "decision-lease", 7)
            .unwrap();
        let fence = AgentLeaseFence {
            run_id: lease.run_id,
            owner_id: lease.owner_id,
            lease_token: lease.lease_token,
            generation: lease.generation,
        };
        repository
            .request_action_approval(&fence, 1, "step", &json!({}), "write-action", 8)
            .unwrap();
        let action_decision = repository
            .decide_current_action("r", "step", "approved", "local-user", None, 9)
            .unwrap();
        assert_eq!(action_decision.approved_hash, "write-action");
        assert_eq!(
            repository.get_run("r").unwrap().unwrap().status,
            AgentRunStatus::AwaitingActionApproval
        );
        let resumed = repository
            .acquire_lease("r", "executor-2", "decision-lease-2", 10)
            .unwrap();
        let resumed_fence = AgentLeaseFence {
            run_id: resumed.run_id,
            owner_id: resumed.owner_id,
            lease_token: resumed.lease_token,
            generation: resumed.generation,
        };
        repository
            .transition_run_fenced(
                &resumed_fence,
                AgentRunStatus::AwaitingActionApproval,
                AgentRunStatus::Running,
                None,
                11,
            )
            .unwrap();
        repository
            .claim_step(&resumed_fence, 1, "step", &json!({}), "write-action", 12)
            .unwrap();
        assert_eq!(
            repository.get_step("r", 1, "step").unwrap().unwrap().status,
            AgentStepStatus::Running
        );
    }

    #[test]
    fn pause_run_atomically_requeues_running_step_and_releases_lease() {
        let connection = db();
        let repository = AgentRepository::new(&connection).unwrap();
        add(&repository);
        repository
            .transition_run("r", AgentRunStatus::Planning, None, 2)
            .unwrap();
        repository.save_plan("r", &plan(), 3).unwrap();
        repository
            .transition_run("r", AgentRunStatus::AwaitingPlanApproval, None, 4)
            .unwrap();
        repository
            .transition_run("r", AgentRunStatus::Ready, None, 5)
            .unwrap();
        repository
            .transition_run("r", AgentRunStatus::Running, None, 6)
            .unwrap();
        repository
            .transition_step("r", 1, "step", AgentStepStatus::Ready, None, None, 7)
            .unwrap();
        repository
            .transition_step("r", 1, "step", AgentStepStatus::Running, None, None, 8)
            .unwrap();
        repository
            .acquire_lease("r", "executor", "pause-lease", 9)
            .unwrap();

        repository.pause_run("r", 10).unwrap();

        let snapshot = repository.snapshot("r").unwrap();
        assert_eq!(snapshot.run.status, AgentRunStatus::Paused);
        assert!(snapshot.current_lease.is_none());
        assert_eq!(snapshot.steps[0].status, AgentStepStatus::Ready);
        assert_eq!(
            snapshot.steps[0].last_error_code.as_deref(),
            Some("AGENT_EXECUTION_PAUSED")
        );
        assert!(snapshot.events.iter().any(|event| {
            event.event_type == "step_requeued_after_pause"
                && event.payload.get("count").and_then(Value::as_u64) == Some(1)
        }));
    }

    #[test]
    fn rejected_action_creates_answerable_replanning_question() {
        let connection = db();
        let repository = AgentRepository::new(&connection).unwrap();
        add(&repository);
        repository
            .transition_run("r", AgentRunStatus::Planning, None, 2)
            .unwrap();
        let mut governed_plan = plan();
        governed_plan.steps[0].risk = AgentRiskLevel::Write;
        repository.save_plan("r", &governed_plan, 3).unwrap();
        repository
            .transition_run("r", AgentRunStatus::AwaitingPlanApproval, None, 4)
            .unwrap();
        repository
            .decide_current_plan("r", "approved", "local-user", None, 5)
            .unwrap();
        repository
            .transition_run("r", AgentRunStatus::Running, None, 6)
            .unwrap();
        let lease = repository
            .acquire_lease("r", "executor", "reject-lease", 7)
            .unwrap();
        let fence = AgentLeaseFence {
            run_id: lease.run_id,
            owner_id: lease.owner_id,
            lease_token: lease.lease_token,
            generation: lease.generation,
        };
        repository
            .request_action_approval(&fence, 1, "step", &json!({}), "write-action", 8)
            .unwrap();

        repository
            .decide_current_action(
                "r",
                "step",
                "rejected",
                "local-user",
                Some("Change the scope"),
                9,
            )
            .unwrap();

        let waiting = repository.snapshot("r").unwrap();
        assert_eq!(waiting.run.status, AgentRunStatus::AwaitingUser);
        assert_eq!(waiting.steps[0].status, AgentStepStatus::WaitingUser);
        assert_eq!(waiting.questions.len(), 1);
        let question = &waiting.questions[0];
        assert_eq!(question.answer_type, AgentQuestionType::Text);
        assert!(question.requires_replan);
        assert_eq!(question.step_id.as_deref(), Some("step"));

        repository
            .submit_user_answer(
                "answer",
                "r",
                &question.id,
                &json!("Use a read-only evidence plan"),
                "local-user",
                10,
            )
            .unwrap();
        let replanning = repository.snapshot("r").unwrap();
        assert_eq!(replanning.run.status, AgentRunStatus::Planning);
        assert_eq!(replanning.answers.len(), 1);
    }

    #[test]
    fn answer_run_mismatch_rolls_back_without_any_change() {
        let connection = db();
        let repository = AgentRepository::new(&connection).unwrap();
        add(&repository);
        repository
            .transition_run("r", AgentRunStatus::Planning, None, 2)
            .unwrap();
        let lease = repository
            .acquire_lease("r", "planner", "question-lease", 3)
            .unwrap();
        let fence = AgentLeaseFence {
            run_id: lease.run_id,
            owner_id: lease.owner_id,
            lease_token: lease.lease_token,
            generation: lease.generation,
        };
        repository
            .record_user_question(
                &fence,
                "question",
                None,
                None,
                &AgentQuestionRequest {
                    prompt: "How should the plan change?".into(),
                    answer_type: AgentQuestionType::Text,
                    options: vec![],
                    requires_replan: true,
                },
                4,
            )
            .unwrap();
        let before = repository.snapshot("r").unwrap();

        assert_eq!(
            repository
                .submit_user_answer(
                    "wrong-answer",
                    "another-run",
                    "question",
                    &json!("Narrow the topic"),
                    "local-user",
                    5,
                )
                .unwrap_err(),
            "AGENT_ANSWER_RUN_MISMATCH"
        );

        assert_eq!(repository.snapshot("r").unwrap(), before);
        assert_eq!(
            connection
                .query_row("SELECT COUNT(*) FROM agent_answers", [], |row| {
                    row.get::<_, i64>(0)
                })
                .unwrap(),
            0
        );
    }

    #[test]
    fn evaluate_completion_is_atomic_and_releases_lease() {
        let connection = db();
        let repository = AgentRepository::new(&connection).unwrap();
        add(&repository);
        repository
            .transition_run("r", AgentRunStatus::Planning, None, 2)
            .unwrap();
        repository
            .transition_run("r", AgentRunStatus::Evaluating, None, 3)
            .unwrap();
        let lease = repository
            .acquire_lease("r", "executor", "completion-lease", 4)
            .unwrap();
        let fence = AgentLeaseFence {
            run_id: lease.run_id,
            owner_id: lease.owner_id,
            lease_token: lease.lease_token,
            generation: lease.generation,
        };
        connection
            .execute("CREATE TABLE completion_probe(value INTEGER)", [])
            .unwrap();

        assert_eq!(
            repository
                .evaluate_completion(&fence, 5, |transaction, _| {
                    transaction
                        .execute("INSERT INTO completion_probe VALUES(1)", [])
                        .map_err(|error| error.to_string())?;
                    Ok((AgentRunStatus::Running, None))
                })
                .unwrap_err(),
            "AGENT_COMPLETION_TARGET_INVALID"
        );
        let rolled_back = repository.snapshot("r").unwrap();
        assert_eq!(rolled_back.run.status, AgentRunStatus::Evaluating);
        assert!(rolled_back.current_lease.is_some());
        assert_eq!(
            connection
                .query_row("SELECT COUNT(*) FROM completion_probe", [], |row| {
                    row.get::<_, i64>(0)
                })
                .unwrap(),
            0
        );

        assert_eq!(
            repository
                .evaluate_completion(&fence, 6, |transaction, scoped| {
                    assert_eq!(
                        scoped.get_run("r")?.ok_or("AGENT_RUN_NOT_FOUND")?.status,
                        AgentRunStatus::Evaluating
                    );
                    transaction
                        .execute("INSERT INTO completion_probe VALUES(2)", [])
                        .map_err(|error| error.to_string())?;
                    Ok((AgentRunStatus::Completed, None))
                })
                .unwrap(),
            AgentRunStatus::Completed
        );
        let completed = repository.snapshot("r").unwrap();
        assert_eq!(completed.run.status, AgentRunStatus::Completed);
        assert!(completed.current_lease.is_none());
        assert_eq!(
            connection
                .query_row("SELECT COUNT(*) FROM completion_probe", [], |row| {
                    row.get::<_, i64>(0)
                })
                .unwrap(),
            1
        );
        assert_eq!(
            repository.renew_lease_fenced(&fence, 7).unwrap_err(),
            "AGENT_RUN_LEASE_NOT_OWNED"
        );
    }

    fn assert_same_v20_state(
        actual: &crate::ValidatedLibraryCandidate,
        expected: &crate::ValidatedLibraryCandidate,
    ) {
        assert_eq!(actual.project_id, expected.project_id);
        assert_eq!(actual.paper_count, expected.paper_count);
        assert_eq!(actual.hotspot_count, expected.hotspot_count);
        assert_eq!(actual.membership_count, expected.membership_count);
        assert_eq!(actual.snapshot_id, expected.snapshot_id);
    }

    fn create_complete_v9_migration_fixture(path: &Path) {
        create_v20_migration_fixture(path, 9);
        let connection = Connection::open(path).unwrap();
        connection
            .pragma_update(None, "foreign_keys", "ON")
            .unwrap();
        connection
            .execute_batch(
                "CREATE TABLE agent_meta(
                  key TEXT PRIMARY KEY,value TEXT NOT NULL,created_at_ms INTEGER NOT NULL);
                 CREATE TABLE agent_runs(
                  id TEXT PRIMARY KEY,library_instance_id TEXT NOT NULL,project_id TEXT NOT NULL,snapshot_id TEXT,
                  automation_mode TEXT NOT NULL CHECK(automation_mode IN('advisor','supervised')),
                  status TEXT NOT NULL CHECK(status IN('draft','planning','awaiting_plan_approval','ready','running','awaiting_action_approval','evaluating','paused','cancelling','cancelled','failed','completed')),
                  objective TEXT NOT NULL,budget_json TEXT NOT NULL,budget_usage_json TEXT NOT NULL,current_plan_version INTEGER,
                  decision_summary_json TEXT,last_error_code TEXT,next_event_sequence INTEGER NOT NULL DEFAULT 1,
                  created_at_ms INTEGER NOT NULL,updated_at_ms INTEGER NOT NULL,completed_at_ms INTEGER);
                 CREATE TABLE agent_plans(
                  run_id TEXT NOT NULL,version INTEGER NOT NULL,plan_json TEXT NOT NULL,plan_hash TEXT NOT NULL,created_at_ms INTEGER NOT NULL,
                  PRIMARY KEY(run_id,version),FOREIGN KEY(run_id) REFERENCES agent_runs(id) ON DELETE RESTRICT);
                 CREATE TABLE agent_steps(
                  run_id TEXT NOT NULL,plan_version INTEGER NOT NULL,step_id TEXT NOT NULL,ordinal INTEGER NOT NULL,title TEXT NOT NULL,
                  tool_name TEXT NOT NULL,input_json TEXT NOT NULL,risk TEXT NOT NULL CHECK(risk IN('read','write','high')),
                  status TEXT NOT NULL CHECK(status IN('planned','ready','running','waiting_user','succeeded','failed','skipped')),
                  attempts INTEGER NOT NULL DEFAULT 0,operation_key TEXT,recovery_count INTEGER NOT NULL DEFAULT 0,
                  observation_json TEXT,last_error_code TEXT,started_at_ms INTEGER,finished_at_ms INTEGER,updated_at_ms INTEGER NOT NULL,
                  PRIMARY KEY(run_id,plan_version,step_id),UNIQUE(run_id,plan_version,ordinal),
                  FOREIGN KEY(run_id,plan_version) REFERENCES agent_plans(run_id,version) ON DELETE RESTRICT);
                 CREATE TABLE agent_events(
                  id INTEGER PRIMARY KEY AUTOINCREMENT,run_id TEXT NOT NULL,sequence INTEGER NOT NULL,event_type TEXT NOT NULL,
                  step_id TEXT,payload_json TEXT NOT NULL,created_at_ms INTEGER NOT NULL,UNIQUE(run_id,sequence),
                  FOREIGN KEY(run_id) REFERENCES agent_runs(id) ON DELETE RESTRICT);
                 CREATE TABLE agent_approvals(
                  id TEXT PRIMARY KEY,run_id TEXT NOT NULL,plan_version INTEGER,step_id TEXT,
                  approval_kind TEXT NOT NULL CHECK(approval_kind IN('plan','action')),
                  decision TEXT NOT NULL CHECK(decision IN('approved','rejected','revoked')),
                  approved_hash TEXT NOT NULL,risk TEXT CHECK(risk IS NULL OR risk IN('read','write','high')),
                  actor_id TEXT NOT NULL,policy_reason TEXT,created_at_ms INTEGER NOT NULL,
                  FOREIGN KEY(run_id) REFERENCES agent_runs(id) ON DELETE RESTRICT);
                 CREATE TABLE agent_artifacts(
                  id TEXT PRIMARY KEY,run_id TEXT NOT NULL,step_id TEXT,artifact_kind TEXT NOT NULL,content_json TEXT NOT NULL,
                  content_sha256 TEXT NOT NULL,snapshot_id TEXT,audit_json TEXT,
                  review_status TEXT CHECK(review_status IS NULL OR review_status IN('approved','needs-review')),
                  supersedes_artifact_id TEXT,created_at_ms INTEGER NOT NULL,
                  FOREIGN KEY(run_id) REFERENCES agent_runs(id) ON DELETE RESTRICT,
                  FOREIGN KEY(supersedes_artifact_id) REFERENCES agent_artifacts(id) ON DELETE RESTRICT);
                 CREATE TABLE agent_tool_receipts(
                  operation_key TEXT PRIMARY KEY,run_id TEXT NOT NULL,plan_version INTEGER NOT NULL,step_id TEXT NOT NULL,
                  tool_name TEXT NOT NULL,action_hash TEXT NOT NULL,result_json TEXT NOT NULL,artifact_id TEXT,committed_at_ms INTEGER NOT NULL,
                  FOREIGN KEY(run_id) REFERENCES agent_runs(id) ON DELETE RESTRICT,
                  FOREIGN KEY(artifact_id) REFERENCES agent_artifacts(id) ON DELETE RESTRICT);
                 CREATE TABLE agent_run_leases(
                  run_id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,lease_token TEXT NOT NULL,generation INTEGER NOT NULL,
                  acquired_at_ms INTEGER NOT NULL,heartbeat_at_ms INTEGER NOT NULL,expires_at_ms INTEGER NOT NULL,
                  FOREIGN KEY(run_id) REFERENCES agent_runs(id) ON DELETE RESTRICT);
                 CREATE TRIGGER agent_events_no_update BEFORE UPDATE ON agent_events BEGIN SELECT RAISE(ABORT,'AGENT_EVENTS_IMMUTABLE'); END;
                 CREATE TRIGGER agent_events_no_delete BEFORE DELETE ON agent_events BEGIN SELECT RAISE(ABORT,'AGENT_EVENTS_IMMUTABLE'); END;
                 CREATE TRIGGER agent_approvals_no_update BEFORE UPDATE ON agent_approvals BEGIN SELECT RAISE(ABORT,'AGENT_APPROVALS_IMMUTABLE'); END;
                 CREATE TRIGGER agent_approvals_no_delete BEFORE DELETE ON agent_approvals BEGIN SELECT RAISE(ABORT,'AGENT_APPROVALS_IMMUTABLE'); END;
                 CREATE TRIGGER agent_receipts_no_update BEFORE UPDATE ON agent_tool_receipts BEGIN SELECT RAISE(ABORT,'AGENT_RECEIPTS_IMMUTABLE'); END;
                 CREATE TRIGGER agent_receipts_no_delete BEFORE DELETE ON agent_tool_receipts BEGIN SELECT RAISE(ABORT,'AGENT_RECEIPTS_IMMUTABLE'); END;
                 CREATE TRIGGER agent_artifacts_no_update BEFORE UPDATE ON agent_artifacts BEGIN SELECT RAISE(ABORT,'AGENT_ARTIFACTS_IMMUTABLE'); END;
                 CREATE TRIGGER agent_artifacts_no_delete BEFORE DELETE ON agent_artifacts BEGIN SELECT RAISE(ABORT,'AGENT_ARTIFACTS_IMMUTABLE'); END;",
            )
            .unwrap();
        let budget_json = serde_json::to_string(&AgentBudget::default()).unwrap();
        let usage_json = serde_json::to_string(&AgentBudgetUsage::default()).unwrap();
        let legacy_plan = plan();
        let plan_json = serde_json::to_string(&legacy_plan).unwrap();
        let artifact_hash = canonical_value_sha256(&json!({})).unwrap();
        connection
            .execute(
                "INSERT INTO agent_meta VALUES('libraryInstanceId','legacy-library',1)",
                [],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO agent_runs(
                  id,library_instance_id,project_id,snapshot_id,automation_mode,status,objective,
                  budget_json,budget_usage_json,current_plan_version,next_event_sequence,created_at_ms,updated_at_ms
                 ) VALUES(
                  'legacy-run','legacy-library','project-default','snapshot-1','supervised','evaluating',
                  'Legacy research',?1,?2,1,2,1,10
                 )",
                params![budget_json, usage_json],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO agent_plans VALUES('legacy-run',1,?1,?2,2)",
                params![plan_json, "1".repeat(64)],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO agent_steps(
                  run_id,plan_version,step_id,ordinal,title,tool_name,input_json,risk,status,attempts,
                  operation_key,recovery_count,observation_json,started_at_ms,finished_at_ms,updated_at_ms
                 ) VALUES(
                  'legacy-run',1,'legacy-step',0,'Legacy step','inspect_library','{}','read','succeeded',1,
                  'legacy-operation',0,'{}',3,4,4
                 )",
                [],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO agent_events(run_id,sequence,event_type,step_id,payload_json,created_at_ms)
                 VALUES('legacy-run',1,'legacy_event','legacy-step','{}',5)",
                [],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO agent_approvals(
                  id,run_id,plan_version,step_id,approval_kind,decision,approved_hash,risk,actor_id,policy_reason,created_at_ms
                 ) VALUES(
                  'legacy-approval','legacy-run',1,NULL,'plan','approved',?1,NULL,'legacy-user','approved',6
                 )",
                params!["2".repeat(64)],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO agent_artifacts VALUES(
                  'legacy-artifact-1','legacy-run','legacy-step','research_report','{}',?1,
                  'snapshot-1',NULL,'approved',NULL,7
                 )",
                params![artifact_hash],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO agent_artifacts VALUES(
                  'legacy-artifact-2','legacy-run','legacy-step','report_audit','{}',?1,
                  'snapshot-1','{}','needs-review','legacy-artifact-1',8
                 )",
                params![artifact_hash],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO agent_tool_receipts VALUES(
                  'legacy-operation','legacy-run',1,'legacy-step','inspect_library',?1,'{}','legacy-artifact-2',9
                 )",
                params!["3".repeat(64)],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO agent_run_leases VALUES(
                  'legacy-run','legacy-owner','legacy-token',1,1,1,2
                 )",
                [],
            )
            .unwrap();
        assert_eq!(
            connection
                .query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |row| {
                    row.get::<_, i64>(0)
                })
                .unwrap(),
            0
        );
        connection.pragma_update(None, "user_version", 9).unwrap();
    }

    fn create_v20_migration_fixture(path: &Path, schema_version: i64) {
        let connection = Connection::open(path).unwrap();
        connection
            .execute_batch(
                "CREATE TABLE papers(
                   id TEXT NOT NULL,
                   project_id TEXT NOT NULL,
                   PRIMARY KEY(project_id,id)
                 );",
            )
            .unwrap();
        crate::ensure_v20_schema(&connection).unwrap();
        connection
            .execute(
                "INSERT INTO papers(id,project_id) VALUES('paper-1','project-default')",
                [],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO v20_analysis_snapshots(
                   id,project_id,algorithm_version,paper_count,hotspot_count,
                   membership_count,status,created_at
                 ) VALUES(
                   'snapshot-1','project-default','v20-test',1,1,1,'ready','2026-01-01'
                 )",
                [],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO v20_hotspots(
                   snapshot_id,project_id,hotspot_id,payload_json,x,y,z,paper_count,updated_at
                 ) VALUES(
                   'snapshot-1','project-default','hotspot-1','{}',0,0,0,1,'2026-01-01'
                 )",
                [],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO v20_paper_memberships(
                   snapshot_id,project_id,paper_id,hotspot_id,x,y,z,representative_rank,score
                 ) VALUES(
                   'snapshot-1','project-default','paper-1','hotspot-1',0,0,0,1,1
                 )",
                [],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO v20_analysis_state(project_id,active_snapshot_id,updated_at)
                 VALUES('project-default','snapshot-1','2026-01-01')",
                [],
            )
            .unwrap();
        connection
            .pragma_update(None, "user_version", schema_version)
            .unwrap();
    }

    fn cleanup_test_file(path: &Path) {
        let _ = fs::remove_file(path);
        let _ = fs::remove_file(format!("{}-wal", path.to_string_lossy()));
        let _ = fs::remove_file(format!("{}-shm", path.to_string_lossy()));
    }
}
