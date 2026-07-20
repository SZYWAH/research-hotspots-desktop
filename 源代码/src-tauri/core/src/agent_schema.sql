CREATE TABLE IF NOT EXISTS agent_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL,created_at_ms INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS agent_runs(
 id TEXT PRIMARY KEY,library_instance_id TEXT NOT NULL,project_id TEXT NOT NULL,snapshot_id TEXT,
 automation_mode TEXT NOT NULL CHECK(automation_mode IN('advisor','supervised')),
 status TEXT NOT NULL CHECK(status IN('draft','planning','awaiting_plan_approval','ready','running','awaiting_action_approval','evaluating','paused','cancelling','cancelled','failed','completed')),
 objective TEXT NOT NULL,budget_json TEXT NOT NULL,budget_usage_json TEXT NOT NULL,current_plan_version INTEGER,
 decision_summary_json TEXT,last_error_code TEXT,next_event_sequence INTEGER NOT NULL DEFAULT 1,
 created_at_ms INTEGER NOT NULL,updated_at_ms INTEGER NOT NULL,completed_at_ms INTEGER);
CREATE INDEX IF NOT EXISTS idx_agent_runs_project_updated ON agent_runs(project_id,updated_at_ms DESC);
CREATE TABLE IF NOT EXISTS agent_plans(
 run_id TEXT NOT NULL,version INTEGER NOT NULL,plan_json TEXT NOT NULL,plan_hash TEXT NOT NULL,created_at_ms INTEGER NOT NULL,
 PRIMARY KEY(run_id,version),FOREIGN KEY(run_id) REFERENCES agent_runs(id) ON DELETE RESTRICT);
CREATE TABLE IF NOT EXISTS agent_steps(
 run_id TEXT NOT NULL,plan_version INTEGER NOT NULL,step_id TEXT NOT NULL,ordinal INTEGER NOT NULL,title TEXT NOT NULL,
 tool_name TEXT NOT NULL,input_json TEXT NOT NULL,risk TEXT NOT NULL CHECK(risk IN('read','write','high')),
 status TEXT NOT NULL CHECK(status IN('planned','ready','running','waiting_user','succeeded','failed','skipped')),
 attempts INTEGER NOT NULL DEFAULT 0,operation_key TEXT,recovery_count INTEGER NOT NULL DEFAULT 0,
 observation_json TEXT,last_error_code TEXT,started_at_ms INTEGER,finished_at_ms INTEGER,updated_at_ms INTEGER NOT NULL,
 PRIMARY KEY(run_id,plan_version,step_id),UNIQUE(run_id,plan_version,ordinal),
 FOREIGN KEY(run_id,plan_version) REFERENCES agent_plans(run_id,version) ON DELETE RESTRICT);
CREATE TABLE IF NOT EXISTS agent_events(
 id INTEGER PRIMARY KEY AUTOINCREMENT,run_id TEXT NOT NULL,sequence INTEGER NOT NULL,event_type TEXT NOT NULL,
 step_id TEXT,payload_json TEXT NOT NULL,created_at_ms INTEGER NOT NULL,UNIQUE(run_id,sequence),
 FOREIGN KEY(run_id) REFERENCES agent_runs(id) ON DELETE RESTRICT);
CREATE TABLE IF NOT EXISTS agent_approvals(
 id TEXT PRIMARY KEY,run_id TEXT NOT NULL,plan_version INTEGER,step_id TEXT,
 approval_kind TEXT NOT NULL CHECK(approval_kind IN('plan','action')),
 decision TEXT NOT NULL CHECK(decision IN('approved','rejected','revoked')),
 approved_hash TEXT NOT NULL,risk TEXT CHECK(risk IS NULL OR risk IN('read','write','high')),
 actor_id TEXT NOT NULL,policy_reason TEXT,created_at_ms INTEGER NOT NULL,
 FOREIGN KEY(run_id) REFERENCES agent_runs(id) ON DELETE RESTRICT);
CREATE INDEX IF NOT EXISTS idx_agent_approvals_run_created ON agent_approvals(run_id,created_at_ms DESC);
CREATE TABLE IF NOT EXISTS agent_artifacts(
 id TEXT PRIMARY KEY,run_id TEXT NOT NULL,step_id TEXT,artifact_kind TEXT NOT NULL,content_json TEXT NOT NULL,
 content_sha256 TEXT NOT NULL,snapshot_id TEXT,audit_json TEXT,
 review_status TEXT CHECK(review_status IS NULL OR review_status IN('approved','needs-review')),
 supersedes_artifact_id TEXT,created_at_ms INTEGER NOT NULL,
 FOREIGN KEY(run_id) REFERENCES agent_runs(id) ON DELETE RESTRICT,
 FOREIGN KEY(supersedes_artifact_id) REFERENCES agent_artifacts(id) ON DELETE RESTRICT);
CREATE TABLE IF NOT EXISTS agent_tool_receipts(
 operation_key TEXT PRIMARY KEY,run_id TEXT NOT NULL,plan_version INTEGER NOT NULL,step_id TEXT NOT NULL,
 tool_name TEXT NOT NULL,action_hash TEXT NOT NULL,result_json TEXT NOT NULL,artifact_id TEXT,committed_at_ms INTEGER NOT NULL,
 FOREIGN KEY(run_id) REFERENCES agent_runs(id) ON DELETE RESTRICT,
 FOREIGN KEY(artifact_id) REFERENCES agent_artifacts(id) ON DELETE RESTRICT);
CREATE TABLE IF NOT EXISTS agent_run_leases(
 run_id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,lease_token TEXT NOT NULL,generation INTEGER NOT NULL,
 acquired_at_ms INTEGER NOT NULL,heartbeat_at_ms INTEGER NOT NULL,expires_at_ms INTEGER NOT NULL,
 FOREIGN KEY(run_id) REFERENCES agent_runs(id) ON DELETE RESTRICT);
CREATE TRIGGER IF NOT EXISTS agent_events_no_update BEFORE UPDATE ON agent_events BEGIN SELECT RAISE(ABORT,'AGENT_EVENTS_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS agent_events_no_delete BEFORE DELETE ON agent_events BEGIN SELECT RAISE(ABORT,'AGENT_EVENTS_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS agent_approvals_no_update BEFORE UPDATE ON agent_approvals BEGIN SELECT RAISE(ABORT,'AGENT_APPROVALS_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS agent_approvals_no_delete BEFORE DELETE ON agent_approvals BEGIN SELECT RAISE(ABORT,'AGENT_APPROVALS_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS agent_receipts_no_update BEFORE UPDATE ON agent_tool_receipts BEGIN SELECT RAISE(ABORT,'AGENT_RECEIPTS_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS agent_receipts_no_delete BEFORE DELETE ON agent_tool_receipts BEGIN SELECT RAISE(ABORT,'AGENT_RECEIPTS_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS agent_artifacts_no_update BEFORE UPDATE ON agent_artifacts BEGIN SELECT RAISE(ABORT,'AGENT_ARTIFACTS_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS agent_artifacts_no_delete BEFORE DELETE ON agent_artifacts BEGIN SELECT RAISE(ABORT,'AGENT_ARTIFACTS_IMMUTABLE'); END;
