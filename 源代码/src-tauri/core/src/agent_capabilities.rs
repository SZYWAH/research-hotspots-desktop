use rusqlite::{params, Connection, OptionalExtension, Transaction, TransactionBehavior};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::agent::{validate_storable_json, AgentModelProtocol, AgentModelRole};
use crate::agent_store::ensure_agent_schema;

pub const LIBRARY_OPERATION_LEASE_TTL_MS: i64 = 30_000;
pub const AGENT_RESOURCE_LOCATOR_MAX_BYTES: usize = 4096;
pub const AGENT_RESOURCE_METADATA_MAX_BYTES: usize = 64 * 1024;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AgentResourceGrantKind {
    ImportFile,
    MysqlProfile,
    ExportDirectory,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AgentOperationStatus {
    Queued,
    Running,
    PauseRequested,
    Paused,
    CancelRequested,
    Cancelling,
    Committing,
    Succeeded,
    Failed,
    Cancelled,
}

impl AgentOperationStatus {
    pub fn terminal(self) -> bool {
        matches!(self, Self::Succeeded | Self::Failed | Self::Cancelled)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AgentResourceGrant {
    pub id: String,
    pub run_id: Option<String>,
    pub library_instance_id: String,
    pub project_id: String,
    pub grant_kind: AgentResourceGrantKind,
    pub locator: String,
    pub metadata: Value,
    pub fingerprint_sha256: String,
    pub created_at_ms: i64,
    pub expires_at_ms: Option<i64>,
    pub revoked_at_ms: Option<i64>,
    pub consumed_at_ms: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AgentOperationRecord {
    pub id: String,
    pub run_id: String,
    pub step_id: String,
    pub operation_key: String,
    pub operation_kind: String,
    pub status: AgentOperationStatus,
    pub phase: String,
    pub processed_count: i64,
    pub total_count: Option<i64>,
    pub bytes_processed: i64,
    pub total_bytes: Option<i64>,
    pub started_at_ms: Option<i64>,
    pub heartbeat_at_ms: Option<i64>,
    pub finished_at_ms: Option<i64>,
    pub recovery_count: u32,
    pub result: Option<Value>,
    pub error_code: Option<String>,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AgentModelCallRecord {
    pub id: String,
    pub run_id: String,
    pub step_id: Option<String>,
    pub model_role: AgentModelRole,
    pub purpose: String,
    pub protocol: AgentModelProtocol,
    pub model: String,
    pub profile_hash: String,
    pub request_id: Option<String>,
    pub input_tokens: Option<u64>,
    pub output_tokens: Option<u64>,
    pub total_tokens: Option<u64>,
    pub elapsed_ms: u64,
    pub retry_count: u32,
    pub structure_repair_count: u32,
    pub fallback_used: bool,
    pub status: String,
    pub estimated_cost_microusd: Option<u64>,
    pub pricing_hash: Option<String>,
    pub error_code: Option<String>,
    pub created_at_ms: i64,
    pub finished_at_ms: Option<i64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentModelUsageSummary {
    pub call_count: u64,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub total_tokens: u64,
    pub elapsed_ms: u64,
    pub retry_count: u64,
    pub structure_repair_count: u64,
    pub estimated_cost_microusd: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StagedPaperRow {
    pub row_index: i64,
    pub paper_id: String,
    pub project_id: String,
    pub paper: Value,
    pub dedupe_key: String,
    pub row_sha256: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LibraryOperationLease {
    pub lease_key: String,
    pub owner_id: String,
    pub lease_token: String,
    pub generation: i64,
    pub operation_kind: String,
    pub heartbeat_at_ms: i64,
    pub expires_at_ms: i64,
}

pub struct AgentCapabilityRepository<'a> {
    conn: &'a Connection,
}

impl<'a> AgentCapabilityRepository<'a> {
    pub fn new(conn: &'a Connection) -> Result<Self, String> {
        ensure_agent_schema(conn)?;
        Ok(Self { conn })
    }

    pub fn create_resource_grant(&self, grant: &AgentResourceGrant) -> Result<(), String> {
        validate_resource_grant(grant)?;
        self.conn.execute(
            "INSERT INTO agent_resource_grants(id,run_id,library_instance_id,project_id,grant_kind,locator,metadata_json,fingerprint_sha256,created_at_ms,expires_at_ms,revoked_at_ms,consumed_at_ms) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)",
            params![grant.id,grant.run_id,grant.library_instance_id,grant.project_id,enum_text(grant.grant_kind)?,grant.locator,value_text(&grant.metadata,AGENT_RESOURCE_METADATA_MAX_BYTES)?,grant.fingerprint_sha256,grant.created_at_ms,grant.expires_at_ms,grant.revoked_at_ms,grant.consumed_at_ms],
        ).map_err(|error| error.to_string())?;
        Ok(())
    }

    pub fn resource_grant(&self, id: &str, now_ms: i64) -> Result<AgentResourceGrant, String> {
        let grant = self.conn.query_row(
            "SELECT id,run_id,library_instance_id,project_id,grant_kind,locator,metadata_json,fingerprint_sha256,created_at_ms,expires_at_ms,revoked_at_ms,consumed_at_ms FROM agent_resource_grants WHERE id=?1",
            params![id], row_to_resource_grant,
        ).optional().map_err(|error| error.to_string())?.ok_or("AGENT_RESOURCE_GRANT_NOT_FOUND")?;
        if grant.revoked_at_ms.is_some() {
            return Err("AGENT_RESOURCE_GRANT_REVOKED".into());
        }
        if grant.expires_at_ms.is_some_and(|expires| expires <= now_ms) {
            return Err("AGENT_RESOURCE_GRANT_EXPIRED".into());
        }
        Ok(grant)
    }

    pub fn bind_resource_grant(&self, id: &str, run_id: &str, now_ms: i64) -> Result<(), String> {
        let changed = self.conn.execute(
            "UPDATE agent_resource_grants SET run_id=?2 WHERE id=?1 AND run_id IS NULL AND revoked_at_ms IS NULL AND (expires_at_ms IS NULL OR expires_at_ms>?3)",
            params![id,run_id,now_ms],
        ).map_err(|error| error.to_string())?;
        if changed != 1 {
            return Err("AGENT_RESOURCE_GRANT_BIND_FAILED".into());
        }
        Ok(())
    }

    pub fn revoke_resource_grant(&self, id: &str, now_ms: i64) -> Result<(), String> {
        let changed = self.conn.execute(
            "UPDATE agent_resource_grants SET revoked_at_ms=?2 WHERE id=?1 AND revoked_at_ms IS NULL",
            params![id,now_ms],
        ).map_err(|error| error.to_string())?;
        if changed != 1 {
            return Err("AGENT_RESOURCE_GRANT_REVOKE_FAILED".into());
        }
        Ok(())
    }

    pub fn consume_resource_grant(
        &self,
        id: &str,
        run_id: &str,
        now_ms: i64,
    ) -> Result<(), String> {
        let changed = self.conn.execute(
            "UPDATE agent_resource_grants SET consumed_at_ms=COALESCE(consumed_at_ms,?3) WHERE id=?1 AND run_id=?2 AND revoked_at_ms IS NULL AND (expires_at_ms IS NULL OR expires_at_ms>?3)",
            params![id,run_id,now_ms],
        ).map_err(|error| error.to_string())?;
        if changed != 1 {
            return Err("AGENT_RESOURCE_GRANT_CONSUME_FAILED".into());
        }
        Ok(())
    }

    pub fn create_operation(&self, operation: &AgentOperationRecord) -> Result<(), String> {
        validate_operation(operation)?;
        self.conn.execute(
            "INSERT INTO agent_operations(id,run_id,step_id,operation_key,operation_kind,status,phase,processed_count,total_count,bytes_processed,total_bytes,started_at_ms,heartbeat_at_ms,finished_at_ms,recovery_count,result_json,error_code,created_at_ms,updated_at_ms) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19)",
            params![operation.id,operation.run_id,operation.step_id,operation.operation_key,operation.operation_kind,enum_text(operation.status)?,operation.phase,operation.processed_count,operation.total_count,operation.bytes_processed,operation.total_bytes,operation.started_at_ms,operation.heartbeat_at_ms,operation.finished_at_ms,operation.recovery_count,option_value_text(operation.result.as_ref(),1024*1024)?,operation.error_code,operation.created_at_ms,operation.updated_at_ms],
        ).map_err(|error| error.to_string())?;
        Ok(())
    }

    pub fn begin_operation(
        &self,
        operation: &AgentOperationRecord,
    ) -> Result<AgentOperationRecord, String> {
        validate_operation(operation)?;
        self.conn.execute(
            "INSERT INTO agent_operations(id,run_id,step_id,operation_key,operation_kind,status,phase,processed_count,total_count,bytes_processed,total_bytes,started_at_ms,heartbeat_at_ms,finished_at_ms,recovery_count,result_json,error_code,created_at_ms,updated_at_ms) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19) ON CONFLICT(operation_key) DO UPDATE SET status='running',phase=excluded.phase,processed_count=0,bytes_processed=0,started_at_ms=excluded.started_at_ms,heartbeat_at_ms=excluded.heartbeat_at_ms,finished_at_ms=NULL,recovery_count=agent_operations.recovery_count+1,result_json=NULL,error_code=NULL,updated_at_ms=excluded.updated_at_ms WHERE agent_operations.run_id=excluded.run_id AND agent_operations.step_id=excluded.step_id AND agent_operations.operation_kind=excluded.operation_kind AND agent_operations.status IN('failed','cancelled','paused')",
            params![operation.id,operation.run_id,operation.step_id,operation.operation_key,operation.operation_kind,enum_text(operation.status)?,operation.phase,operation.processed_count,operation.total_count,operation.bytes_processed,operation.total_bytes,operation.started_at_ms,operation.heartbeat_at_ms,operation.finished_at_ms,operation.recovery_count,option_value_text(operation.result.as_ref(),1024*1024)?,operation.error_code,operation.created_at_ms,operation.updated_at_ms],
        ).map_err(|error| error.to_string())?;
        self.operation_by_key(&operation.operation_key)?
            .ok_or("AGENT_OPERATION_BEGIN_FAILED".into())
    }

    pub fn operation_by_key(
        &self,
        operation_key: &str,
    ) -> Result<Option<AgentOperationRecord>, String> {
        self.conn.query_row("SELECT id,run_id,step_id,operation_key,operation_kind,status,phase,processed_count,total_count,bytes_processed,total_bytes,started_at_ms,heartbeat_at_ms,finished_at_ms,recovery_count,result_json,error_code,created_at_ms,updated_at_ms FROM agent_operations WHERE operation_key=?1",params![operation_key],row_to_operation).optional().map_err(|error| error.to_string())
    }

    #[allow(clippy::too_many_arguments)]
    pub fn update_operation_progress(
        &self,
        id: &str,
        status: AgentOperationStatus,
        phase: &str,
        processed: i64,
        total: Option<i64>,
        bytes: i64,
        total_bytes: Option<i64>,
        now_ms: i64,
    ) -> Result<(), String> {
        if processed < 0
            || bytes < 0
            || total.is_some_and(|value| value < processed)
            || total_bytes.is_some_and(|value| value < bytes)
        {
            return Err("AGENT_OPERATION_PROGRESS_INVALID".into());
        }
        let changed=self.conn.execute("UPDATE agent_operations SET status=?2,phase=?3,processed_count=?4,total_count=?5,bytes_processed=?6,total_bytes=?7,heartbeat_at_ms=?8,started_at_ms=COALESCE(started_at_ms,?8),updated_at_ms=?8 WHERE id=?1 AND status NOT IN('succeeded','failed','cancelled')",params![id,enum_text(status)?,phase,processed,total,bytes,total_bytes,now_ms]).map_err(|e|e.to_string())?;
        if changed != 1 {
            return Err("AGENT_OPERATION_NOT_PROGRESSABLE".into());
        }
        Ok(())
    }

    pub fn request_operation_control(
        &self,
        id: &str,
        action: &str,
        now_ms: i64,
    ) -> Result<AgentOperationStatus, String> {
        let target = match action {
            "pause" => AgentOperationStatus::PauseRequested,
            "cancel" => AgentOperationStatus::CancelRequested,
            "resume" => AgentOperationStatus::Running,
            _ => return Err("AGENT_OPERATION_CONTROL_INVALID".into()),
        };
        let allowed = match action {
            "pause" => "('queued','running')",
            "cancel" => "('queued','running','pause_requested','paused')",
            "resume" => "('paused')",
            _ => unreachable!(),
        };
        let sql=format!("UPDATE agent_operations SET status=?2,updated_at_ms=?3 WHERE id=?1 AND status IN {allowed}");
        let changed = self
            .conn
            .execute(&sql, params![id, enum_text(target)?, now_ms])
            .map_err(|e| e.to_string())?;
        if changed != 1 {
            return Err("AGENT_OPERATION_CONTROL_CONFLICT".into());
        }
        Ok(target)
    }

    pub fn finish_operation(
        &self,
        id: &str,
        status: AgentOperationStatus,
        result: Option<&Value>,
        error: Option<&str>,
        now_ms: i64,
    ) -> Result<(), String> {
        if !status.terminal() {
            return Err("AGENT_OPERATION_TERMINAL_STATUS_REQUIRED".into());
        }
        let changed=self.conn.execute("UPDATE agent_operations SET status=?2,result_json=?3,error_code=?4,finished_at_ms=?5,heartbeat_at_ms=?5,updated_at_ms=?5 WHERE id=?1 AND status NOT IN('succeeded','failed','cancelled')",params![id,enum_text(status)?,option_value_text(result,1024*1024)?,error,now_ms]).map_err(|e|e.to_string())?;
        if changed != 1 {
            return Err("AGENT_OPERATION_FINISH_CONFLICT".into());
        }
        Ok(())
    }

    pub fn latest_operation(&self, run_id: &str) -> Result<Option<AgentOperationRecord>, String> {
        self.conn.query_row("SELECT id,run_id,step_id,operation_key,operation_kind,status,phase,processed_count,total_count,bytes_processed,total_bytes,started_at_ms,heartbeat_at_ms,finished_at_ms,recovery_count,result_json,error_code,created_at_ms,updated_at_ms FROM agent_operations WHERE run_id=?1 ORDER BY updated_at_ms DESC,id DESC LIMIT 1",params![run_id],row_to_operation).optional().map_err(|e|e.to_string())
    }

    pub fn recover_stale_operations(&self, now_ms: i64) -> Result<Vec<String>, String> {
        let cutoff = now_ms - LIBRARY_OPERATION_LEASE_TTL_MS;
        let mut stmt=self.conn.prepare("SELECT id FROM agent_operations WHERE status IN('running','pause_requested','cancel_requested','cancelling','committing') AND COALESCE(heartbeat_at_ms,updated_at_ms)<=?1").map_err(|e|e.to_string())?;
        let ids = stmt
            .query_map(params![cutoff], |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        drop(stmt);
        for id in &ids {
            self.conn.execute("UPDATE agent_operations SET status='paused',phase='executor_lost',recovery_count=recovery_count+1,error_code='AGENT_EXECUTOR_LOST',updated_at_ms=?2 WHERE id=?1",params![id,now_ms]).map_err(|e|e.to_string())?;
        }
        Ok(ids)
    }

    pub fn stage_import_rows(
        &self,
        operation_id: &str,
        rows: &[StagedPaperRow],
    ) -> Result<(), String> {
        let tx = Transaction::new_unchecked(self.conn, TransactionBehavior::Immediate)
            .map_err(|e| e.to_string())?;
        {
            let mut stmt=tx.prepare("INSERT INTO agent_import_staging_papers(operation_id,row_index,paper_id,project_id,paper_json,dedupe_key,row_sha256) VALUES(?1,?2,?3,?4,?5,?6,?7)").map_err(|e|e.to_string())?;
            for row in rows {
                validate_storable_json(&row.paper)?;
                stmt.execute(params![
                    operation_id,
                    row.row_index,
                    row.paper_id,
                    row.project_id,
                    value_text(&row.paper, 1024 * 1024)?,
                    row.dedupe_key,
                    row.row_sha256
                ])
                .map_err(|e| e.to_string())?;
            }
        }
        tx.commit().map_err(|e| e.to_string())
    }

    pub fn staged_import_rows(&self, operation_id: &str) -> Result<Vec<StagedPaperRow>, String> {
        let mut stmt=self.conn.prepare("SELECT row_index,paper_id,project_id,paper_json,dedupe_key,row_sha256 FROM agent_import_staging_papers WHERE operation_id=?1 ORDER BY row_index").map_err(|e|e.to_string())?;
        let rows = stmt
            .query_map(params![operation_id], |row| {
                Ok(StagedPaperRow {
                    row_index: row.get(0)?,
                    paper_id: row.get(1)?,
                    project_id: row.get(2)?,
                    paper: parse_value(row.get(3)?)?,
                    dedupe_key: row.get(4)?,
                    row_sha256: row.get(5)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        Ok(rows)
    }

    pub fn clear_staging(&self, operation_id: &str) -> Result<usize, String> {
        self.conn
            .execute(
                "DELETE FROM agent_import_staging_papers WHERE operation_id=?1",
                params![operation_id],
            )
            .map_err(|e| e.to_string())
    }

    pub fn record_model_call(&self, call: &AgentModelCallRecord) -> Result<(), String> {
        self.conn.execute("INSERT INTO agent_model_calls(id,run_id,step_id,model_role,purpose,protocol,model,profile_hash,request_id,input_tokens,output_tokens,total_tokens,elapsed_ms,retry_count,structure_repair_count,fallback_used,status,estimated_cost_microusd,pricing_hash,error_code,created_at_ms,finished_at_ms) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22)",params![call.id,call.run_id,call.step_id,enum_text(call.model_role)?,call.purpose,enum_text(call.protocol)?,call.model,call.profile_hash,call.request_id,call.input_tokens,call.output_tokens,call.total_tokens,call.elapsed_ms,call.retry_count,call.structure_repair_count,i64::from(call.fallback_used),call.status,call.estimated_cost_microusd,call.pricing_hash,call.error_code,call.created_at_ms,call.finished_at_ms]).map_err(|e|e.to_string())?;
        Ok(())
    }

    pub fn model_usage_summary(&self, run_id: &str) -> Result<AgentModelUsageSummary, String> {
        self.conn.query_row("SELECT COUNT(*),COALESCE(SUM(input_tokens),0),COALESCE(SUM(output_tokens),0),COALESCE(SUM(total_tokens),0),COALESCE(SUM(elapsed_ms),0),COALESCE(SUM(retry_count),0),COALESCE(SUM(structure_repair_count),0),CASE WHEN COUNT(estimated_cost_microusd)=COUNT(*) THEN SUM(estimated_cost_microusd) END FROM agent_model_calls WHERE run_id=?1",params![run_id],|r|Ok(AgentModelUsageSummary{call_count:r.get(0)?,input_tokens:r.get(1)?,output_tokens:r.get(2)?,total_tokens:r.get(3)?,elapsed_ms:r.get(4)?,retry_count:r.get(5)?,structure_repair_count:r.get(6)?,estimated_cost_microusd:r.get(7)?})).map_err(|e|e.to_string())
    }

    pub fn acquire_library_lease(
        &self,
        key: &str,
        owner: &str,
        token: &str,
        kind: &str,
        now_ms: i64,
    ) -> Result<LibraryOperationLease, String> {
        let tx = Transaction::new_unchecked(self.conn, TransactionBehavior::Immediate)
            .map_err(|e| e.to_string())?;
        let previous:Option<(String,i64)>=tx.query_row("SELECT owner_id,generation FROM library_operation_leases WHERE lease_key=?1 AND expires_at_ms>?2",params![key,now_ms],|r|Ok((r.get(0)?,r.get(1)?))).optional().map_err(|e|e.to_string())?;
        if previous.is_some() {
            return Err("LIBRARY_BUSY".into());
        }
        let generation:i64=tx.query_row("SELECT COALESCE((SELECT generation FROM library_operation_leases WHERE lease_key=?1),0)+1",params![key],|r|r.get(0)).map_err(|e|e.to_string())?;
        let expires = now_ms + LIBRARY_OPERATION_LEASE_TTL_MS;
        tx.execute("INSERT INTO library_operation_leases(lease_key,owner_id,lease_token,generation,operation_kind,heartbeat_at_ms,expires_at_ms) VALUES(?1,?2,?3,?4,?5,?6,?7) ON CONFLICT(lease_key) DO UPDATE SET owner_id=excluded.owner_id,lease_token=excluded.lease_token,generation=excluded.generation,operation_kind=excluded.operation_kind,heartbeat_at_ms=excluded.heartbeat_at_ms,expires_at_ms=excluded.expires_at_ms",params![key,owner,token,generation,kind,now_ms,expires]).map_err(|e|e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(LibraryOperationLease {
            lease_key: key.into(),
            owner_id: owner.into(),
            lease_token: token.into(),
            generation,
            operation_kind: kind.into(),
            heartbeat_at_ms: now_ms,
            expires_at_ms: expires,
        })
    }

    pub fn renew_library_lease(
        &self,
        lease: &LibraryOperationLease,
        now_ms: i64,
    ) -> Result<LibraryOperationLease, String> {
        let expires = now_ms + LIBRARY_OPERATION_LEASE_TTL_MS;
        let changed=self.conn.execute("UPDATE library_operation_leases SET heartbeat_at_ms=?5,expires_at_ms=?6 WHERE lease_key=?1 AND owner_id=?2 AND lease_token=?3 AND generation=?4 AND expires_at_ms>?5",params![lease.lease_key,lease.owner_id,lease.lease_token,lease.generation,now_ms,expires]).map_err(|e|e.to_string())?;
        if changed != 1 {
            return Err("LIBRARY_OPERATION_LEASE_LOST".into());
        }
        let mut renewed = lease.clone();
        renewed.heartbeat_at_ms = now_ms;
        renewed.expires_at_ms = expires;
        Ok(renewed)
    }

    pub fn release_library_lease(&self, lease: &LibraryOperationLease) -> Result<(), String> {
        let changed=self.conn.execute("DELETE FROM library_operation_leases WHERE lease_key=?1 AND owner_id=?2 AND lease_token=?3 AND generation=?4",params![lease.lease_key,lease.owner_id,lease.lease_token,lease.generation]).map_err(|e|e.to_string())?;
        if changed != 1 {
            return Err("LIBRARY_OPERATION_LEASE_LOST".into());
        }
        Ok(())
    }
}

pub fn estimate_cost_microusd(
    input_tokens: u64,
    output_tokens: u64,
    input_usd_per_million: Option<f64>,
    output_usd_per_million: Option<f64>,
) -> Option<u64> {
    let input_rate = input_usd_per_million?;
    let output_rate = output_usd_per_million?;
    if !input_rate.is_finite() || !output_rate.is_finite() || input_rate < 0.0 || output_rate < 0.0
    {
        return None;
    }
    Some(((input_tokens as f64 * input_rate) + (output_tokens as f64 * output_rate)).round() as u64)
}

fn validate_resource_grant(grant: &AgentResourceGrant) -> Result<(), String> {
    if grant.id.trim().is_empty()
        || grant.library_instance_id.trim().is_empty()
        || grant.project_id.trim().is_empty()
    {
        return Err("AGENT_RESOURCE_GRANT_IDENTITY_REQUIRED".into());
    }
    if grant.locator.is_empty() || grant.locator.len() > AGENT_RESOURCE_LOCATOR_MAX_BYTES {
        return Err("AGENT_RESOURCE_GRANT_LOCATOR_INVALID".into());
    }
    validate_storable_json(&grant.metadata)?;
    if grant.fingerprint_sha256.len() != 64
        || !grant
            .fingerprint_sha256
            .bytes()
            .all(|b| b.is_ascii_hexdigit())
    {
        return Err("AGENT_RESOURCE_GRANT_FINGERPRINT_INVALID".into());
    }
    Ok(())
}
fn validate_operation(operation: &AgentOperationRecord) -> Result<(), String> {
    if operation.id.is_empty()
        || operation.run_id.is_empty()
        || operation.step_id.is_empty()
        || operation.operation_key.is_empty()
    {
        return Err("AGENT_OPERATION_IDENTITY_REQUIRED".into());
    }
    if operation.processed_count < 0 || operation.bytes_processed < 0 {
        return Err("AGENT_OPERATION_PROGRESS_INVALID".into());
    }
    Ok(())
}
fn enum_text<T: Serialize>(value: T) -> Result<String, String> {
    serde_json::to_string(&value)
        .map(|v| v.trim_matches('"').to_string())
        .map_err(|e| e.to_string())
}
fn enum_parse<T: for<'de> Deserialize<'de>>(value: &str) -> rusqlite::Result<T> {
    serde_json::from_str(&format!("\"{value}\"")).map_err(json_sql_error)
}
fn value_text(value: &Value, limit: usize) -> Result<String, String> {
    validate_storable_json(value)?;
    let text = serde_json::to_string(value).map_err(|e| e.to_string())?;
    if text.len() > limit {
        return Err("AGENT_JSON_SIZE_LIMIT_EXCEEDED".into());
    }
    Ok(text)
}
fn option_value_text(value: Option<&Value>, limit: usize) -> Result<Option<String>, String> {
    value.map(|v| value_text(v, limit)).transpose()
}
fn parse_value(text: String) -> rusqlite::Result<Value> {
    serde_json::from_str(&text).map_err(json_sql_error)
}
fn json_sql_error(error: serde_json::Error) -> rusqlite::Error {
    rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(error))
}
fn row_to_resource_grant(row: &rusqlite::Row<'_>) -> rusqlite::Result<AgentResourceGrant> {
    Ok(AgentResourceGrant {
        id: row.get(0)?,
        run_id: row.get(1)?,
        library_instance_id: row.get(2)?,
        project_id: row.get(3)?,
        grant_kind: enum_parse(&row.get::<_, String>(4)?)?,
        locator: row.get(5)?,
        metadata: parse_value(row.get(6)?)?,
        fingerprint_sha256: row.get(7)?,
        created_at_ms: row.get(8)?,
        expires_at_ms: row.get(9)?,
        revoked_at_ms: row.get(10)?,
        consumed_at_ms: row.get(11)?,
    })
}
fn row_to_operation(row: &rusqlite::Row<'_>) -> rusqlite::Result<AgentOperationRecord> {
    Ok(AgentOperationRecord {
        id: row.get(0)?,
        run_id: row.get(1)?,
        step_id: row.get(2)?,
        operation_key: row.get(3)?,
        operation_kind: row.get(4)?,
        status: enum_parse(&row.get::<_, String>(5)?)?,
        phase: row.get(6)?,
        processed_count: row.get(7)?,
        total_count: row.get(8)?,
        bytes_processed: row.get(9)?,
        total_bytes: row.get(10)?,
        started_at_ms: row.get(11)?,
        heartbeat_at_ms: row.get(12)?,
        finished_at_ms: row.get(13)?,
        recovery_count: row.get::<_, i64>(14)? as u32,
        result: row
            .get::<_, Option<String>>(15)?
            .map(parse_value)
            .transpose()?,
        error_code: row.get(16)?,
        created_at_ms: row.get(17)?,
        updated_at_ms: row.get(18)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ensure_library_schema;
    use serde_json::json;
    fn db() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        ensure_library_schema(&c).unwrap();
        c
    }
    #[test]
    fn grants_operations_staging_and_usage_round_trip() {
        let c = db();
        let repo = AgentCapabilityRepository::new(&c).unwrap();
        c.execute("INSERT INTO agent_runs(id,library_instance_id,project_id,snapshot_id,run_kind,task_input_json,automation_mode,status,objective,budget_json,budget_usage_json,created_at_ms,updated_at_ms) VALUES('r','l','p',NULL,'paper_file_import','{}','supervised','draft','x','{}','{}',1,1)",[]).unwrap();
        let grant = AgentResourceGrant {
            id: "g".into(),
            run_id: Some("r".into()),
            library_instance_id: "l".into(),
            project_id: "p".into(),
            grant_kind: AgentResourceGrantKind::ImportFile,
            locator: "D:/input.jsonl".into(),
            metadata: json!({"size":1}),
            fingerprint_sha256: "a".repeat(64),
            created_at_ms: 1,
            expires_at_ms: None,
            revoked_at_ms: None,
            consumed_at_ms: None,
        };
        repo.create_resource_grant(&grant).unwrap();
        assert_eq!(repo.resource_grant("g", 2).unwrap(), grant);
        let op = AgentOperationRecord {
            id: "o".into(),
            run_id: "r".into(),
            step_id: "import".into(),
            operation_key: "k".into(),
            operation_kind: "import".into(),
            status: AgentOperationStatus::Queued,
            phase: "previewed".into(),
            processed_count: 0,
            total_count: Some(1),
            bytes_processed: 0,
            total_bytes: Some(1),
            started_at_ms: None,
            heartbeat_at_ms: None,
            finished_at_ms: None,
            recovery_count: 0,
            result: None,
            error_code: None,
            created_at_ms: 1,
            updated_at_ms: 1,
        };
        repo.create_operation(&op).unwrap();
        repo.update_operation_progress(
            "o",
            AgentOperationStatus::Running,
            "staging",
            1,
            Some(1),
            1,
            Some(1),
            2,
        )
        .unwrap();
        repo.stage_import_rows(
            "o",
            &[StagedPaperRow {
                row_index: 0,
                paper_id: "p1".into(),
                project_id: "p".into(),
                paper: json!({"id":"p1"}),
                dedupe_key: "p1".into(),
                row_sha256: "b".repeat(64),
            }],
        )
        .unwrap();
        assert_eq!(repo.staged_import_rows("o").unwrap().len(), 1);
        let call = AgentModelCallRecord {
            id: "m".into(),
            run_id: "r".into(),
            step_id: None,
            model_role: AgentModelRole::Planner,
            purpose: "plan".into(),
            protocol: AgentModelProtocol::OpenaiChatCompletions,
            model: "mock".into(),
            profile_hash: "h".into(),
            request_id: None,
            input_tokens: Some(10),
            output_tokens: Some(5),
            total_tokens: Some(15),
            elapsed_ms: 20,
            retry_count: 0,
            structure_repair_count: 0,
            fallback_used: false,
            status: "succeeded".into(),
            estimated_cost_microusd: Some(2),
            pricing_hash: Some("p".into()),
            error_code: None,
            created_at_ms: 1,
            finished_at_ms: Some(2),
        };
        repo.record_model_call(&call).unwrap();
        assert_eq!(repo.model_usage_summary("r").unwrap().total_tokens, 15)
    }
    #[test]
    fn library_lease_is_fenced() {
        let c = db();
        let repo = AgentCapabilityRepository::new(&c).unwrap();
        let lease = repo
            .acquire_library_lease("library", "a", "t", "import", 1)
            .unwrap();
        assert_eq!(
            repo.acquire_library_lease("library", "b", "u", "clean", 2)
                .unwrap_err(),
            "LIBRARY_BUSY"
        );
        repo.release_library_lease(&lease).unwrap();
        assert!(repo
            .acquire_library_lease("library", "b", "u", "clean", 3)
            .is_ok())
    }
    #[test]
    fn cost_is_only_known_with_both_rates() {
        assert_eq!(
            estimate_cost_microusd(1_000_000, 500_000, Some(1.0), Some(2.0)),
            Some(2_000_000)
        );
        assert_eq!(estimate_cost_microusd(1, 1, None, Some(1.0)), None)
    }
}
