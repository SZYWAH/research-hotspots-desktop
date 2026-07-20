use std::{
    fs,
    path::{Path, PathBuf},
    time::Duration,
};

use rusqlite::{backup::Backup, params, Connection, OptionalExtension, Transaction};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

use crate::agent::{
    action_approval_hash, canonical_value_sha256, plan_approval_hash, validate_plan,
    validate_run_transition, validate_step_transition, validate_storable_json, AgentAction,
    AgentAutomationMode, AgentBudget, AgentBudgetUsage, AgentDecisionSummary, AgentPlan,
    AgentRiskLevel, AgentRunStatus, AgentStepStatus,
};
use crate::{
    sha256_file, validate_library_candidate_file, LIBRARY_SCHEMA_VERSION,
    MIN_SUPPORTED_LIBRARY_SCHEMA_VERSION,
};

pub const AGENT_LEASE_TTL_MS: i64 = 30_000;
pub const AGENT_LEASE_HEARTBEAT_MS: i64 = 10_000;
pub const AGENT_PLAN_MAX_BYTES: usize = 512 * 1024;
pub const AGENT_EVENT_MAX_BYTES: usize = 64 * 1024;
pub const AGENT_OBSERVATION_MAX_BYTES: usize = 1024 * 1024;
pub const AGENT_ARTIFACT_MAX_BYTES: usize = 8 * 1024 * 1024;

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
    pub input: Value,
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
pub struct AgentRunSnapshot {
    pub run: AgentRunRecord,
    pub plan: Option<AgentPlan>,
    pub steps: Vec<AgentStepRecord>,
    pub events: Vec<AgentEventRecord>,
    pub artifacts: Vec<AgentArtifactRecord>,
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
    conn.execute_batch(include_str!("agent_schema.sql"))
        .map_err(|e| e.to_string())
}

pub fn migrate_library_file(
    path: &Path,
    project_id: &str,
    now_ms: i64,
    backup_v8: bool,
) -> Result<AgentMigrationResult, String> {
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(|e| e.to_string())?;
    let previous: i64 = conn
        .pragma_query_value(None, "user_version", |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if previous > LIBRARY_SCHEMA_VERSION {
        return Err("LIBRARY_SCHEMA_TOO_NEW".into());
    }
    if previous != 0 && previous < MIN_SUPPORTED_LIBRARY_SCHEMA_VERSION {
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
    if previous == 0 {
        crate::ensure_library_schema(&conn)?;
        return Ok(AgentMigrationResult {
            previous_version: 0,
            current_version: LIBRARY_SCHEMA_VERSION,
            backup_path: None,
            backup_sha256: None,
        });
    }
    let source_value = validate_library_candidate_file(path, project_id)?;
    let (backup_path, backup_sha256) = if backup_v8 {
        let parent = path.parent().ok_or("AGENT_MIGRATION_PARENT_MISSING")?;
        let size = fs::metadata(path).map_err(|e| e.to_string())?.len();
        let available = fs2::available_space(parent).unwrap_or_default();
        if available > 0 && available < size.saturating_add(16 * 1024 * 1024) {
            return Err("AGENT_MIGRATION_BACKUP_SPACE_INSUFFICIENT".into());
        }
        let stem = path
            .file_stem()
            .and_then(|v| v.to_str())
            .ok_or("AGENT_MIGRATION_FILE_NAME_INVALID")?;
        let backup_path = parent.join(format!("{stem}.pre-schema-v9.{now_ms}.sqlite"));
        if backup_path.exists() {
            return Err("AGENT_MIGRATION_BACKUP_EXISTS".into());
        }
        let mut dest = Connection::open(&backup_path)
            .map_err(|e| format!("AGENT_MIGRATION_BACKUP_OPEN_FAILED:{e}"))?;
        let backup = Backup::new(&conn, &mut dest)
            .map_err(|e| format!("AGENT_MIGRATION_BACKUP_FAILED:{e}"))?;
        backup
            .run_to_completion(128, Duration::from_millis(5), None)
            .map_err(|e| format!("AGENT_MIGRATION_BACKUP_FAILED:{e}"))?;
        drop(backup);
        drop(dest);
        let backup_value = validate_library_candidate_file(&backup_path, project_id)
            .map_err(|e| format!("AGENT_MIGRATION_BACKUP_INVALID:{e}"))?;
        if backup_value.paper_count != source_value.paper_count
            || backup_value.hotspot_count != source_value.hotspot_count
            || backup_value.membership_count != source_value.membership_count
            || backup_value.snapshot_id != source_value.snapshot_id
        {
            return Err("AGENT_MIGRATION_BACKUP_COUNT_MISMATCH".into());
        }
        let hash = sha256_file(&backup_path)?;
        (Some(backup_path), Some(hash))
    } else {
        (None, None)
    };
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    tx.execute_batch(include_str!("agent_schema.sql"))
        .map_err(|e| format!("AGENT_SCHEMA_MIGRATION_FAILED:{e}"))?;
    tx.pragma_update(None, "user_version", LIBRARY_SCHEMA_VERSION)
        .map_err(|e| format!("AGENT_SCHEMA_MIGRATION_FAILED:{e}"))?;
    tx.commit()
        .map_err(|e| format!("AGENT_SCHEMA_MIGRATION_FAILED:{e}"))?;
    Ok(AgentMigrationResult {
        previous_version: previous,
        current_version: LIBRARY_SCHEMA_VERSION,
        backup_path,
        backup_sha256,
    })
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
        let run = self.get_run(run_id)?.ok_or("AGENT_RUN_NOT_FOUND")?;
        validate_plan(plan, &run.budget)?;
        let text = json_text(plan, AGENT_PLAN_MAX_BYTES)?;
        let hash = plan_approval_hash(plan)?;
        let tx = self
            .conn
            .unchecked_transaction()
            .map_err(|e| e.to_string())?;
        tx.execute(
            "INSERT INTO agent_plans VALUES(?1,?2,?3,?4,?5)",
            params![run_id, plan.version, text, hash, now],
        )
        .map_err(|e| e.to_string())?;
        for (n, step) in plan.steps.iter().enumerate() {
            let input = value_text(&step.input, AGENT_OBSERVATION_MAX_BYTES)?;
            tx.execute("INSERT INTO agent_steps(run_id,plan_version,step_id,ordinal,title,tool_name,input_json,risk,status,updated_at_ms) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,'planned',?9)",params![run_id,plan.version,step.id,n as i64,step.title,step.tool,input,enum_text(step.risk)?,now]).map_err(|e|e.to_string())?;
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
            &json!({"version":plan.version,"planHash":hash}),
            now,
        )?;
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
        if kind == "plan" {
            let v = version.ok_or("AGENT_APPROVAL_PLAN_VERSION_REQUIRED")?;
            let current:Option<(i64,String)>=self.conn.query_row("SELECT current_plan_version,(SELECT plan_hash FROM agent_plans WHERE run_id=agent_runs.id AND version=current_plan_version) FROM agent_runs WHERE id=?1",params![run],|r|Ok((r.get(0)?,r.get(1)?))).optional().map_err(|e|e.to_string())?;
            if current.as_ref().map(|(x, h)| (*x as u32, h.as_str())) != Some((v, hash)) {
                return Err("AGENT_PLAN_APPROVAL_STALE".into());
            }
        } else {
            let v = version.ok_or("AGENT_APPROVAL_PLAN_VERSION_REQUIRED")?;
            let step = step.ok_or("AGENT_APPROVAL_STEP_REQUIRED")?;
            let (tool,input,risk_text):(String,String,String)=self.conn.query_row("SELECT tool_name,input_json,risk FROM agent_steps WHERE run_id=?1 AND plan_version=?2 AND step_id=?3",params![run,v,step],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).optional().map_err(|e|e.to_string())?.ok_or("AGENT_STEP_NOT_FOUND")?;
            let stored_risk: AgentRiskLevel = enum_parse(&risk_text)?;
            if risk != Some(stored_risk) {
                return Err("AGENT_ACTION_APPROVAL_STALE".into());
            }
            let action = AgentAction::CallTool {
                tool,
                input: serde_json::from_str(&input).map_err(|e| e.to_string())?,
                risk: stored_risk,
            };
            if action_approval_hash(&action)? != hash {
                return Err("AGENT_ACTION_APPROVAL_STALE".into());
            }
        }
        let payload = json!({"kind":kind,"decision":decision,"planVersion":version,"stepId":step,"hash":hash,"risk":risk,"actorId":actor,"policyReason":reason});
        value_text(&payload, AGENT_EVENT_MAX_BYTES)?;
        let tx = self
            .conn
            .unchecked_transaction()
            .map_err(|e| e.to_string())?;
        tx.execute(
            "INSERT INTO agent_approvals VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
            params![
                id,
                run,
                version,
                step,
                kind,
                decision,
                hash,
                risk.map(enum_text).transpose()?,
                actor,
                reason,
                now
            ],
        )
        .map_err(|e| e.to_string())?;
        append_event(&tx, run, "approval_recorded", step, &payload, now)?;
        tx.commit().map_err(|e| e.to_string())
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
        let mut s = self
            .conn
            .prepare("SELECT run_id FROM agent_run_leases WHERE expires_at_ms<=?1 ORDER BY run_id")
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
            if run.status != AgentRunStatus::Paused {
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
            let mut s=self.conn.prepare("SELECT run_id,plan_version,step_id,ordinal,title,tool_name,input_json,risk,status,attempts,operation_key,recovery_count,observation_json,last_error_code,started_at_ms,finished_at_ms,updated_at_ms FROM agent_steps WHERE run_id=?1 AND plan_version=?2 ORDER BY ordinal").map_err(|e|e.to_string())?;
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
        Ok(AgentRunSnapshot {
            run,
            plan,
            steps,
            events,
            artifacts,
        })
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
        input: parse_sql_json(r.get(6)?)?,
        risk: enum_parse(&r.get::<_, String>(7)?).map_err(sql_error)?,
        status: enum_parse(&r.get::<_, String>(8)?).map_err(sql_error)?,
        attempts: r.get::<_, i64>(9)? as u32,
        operation_key: r.get(10)?,
        recovery_count: r.get::<_, i64>(11)? as u32,
        observation: r
            .get::<_, Option<String>>(12)?
            .map(parse_sql_json)
            .transpose()?,
        last_error_code: r.get(13)?,
        started_at_ms: r.get(14)?,
        finished_at_ms: r.get(15)?,
        updated_at_ms: r.get(16)?,
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
}
