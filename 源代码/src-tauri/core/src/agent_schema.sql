CREATE TABLE IF NOT EXISTS agent_meta(
 key TEXT PRIMARY KEY,value TEXT NOT NULL,created_at_ms INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS agent_runs(
 id TEXT PRIMARY KEY,library_instance_id TEXT NOT NULL,project_id TEXT NOT NULL,snapshot_id TEXT,
 run_kind TEXT NOT NULL DEFAULT 'research_report' CHECK(run_kind IN('research_report','paper_file_import','paper_mysql_import','library_clean','v20_modeling','report_export')),
 task_input_json TEXT NOT NULL DEFAULT '{}',
 automation_mode TEXT NOT NULL CHECK(automation_mode IN('advisor','supervised')),
 status TEXT NOT NULL CHECK(status IN('draft','planning','awaiting_plan_approval','ready','running','awaiting_action_approval','awaiting_user','evaluating','paused','cancelling','cancelled','failed','completed')),
 objective TEXT NOT NULL,budget_json TEXT NOT NULL,budget_usage_json TEXT NOT NULL,current_plan_version INTEGER,
 decision_summary_json TEXT,last_error_code TEXT,next_event_sequence INTEGER NOT NULL DEFAULT 1,
 created_at_ms INTEGER NOT NULL,updated_at_ms INTEGER NOT NULL,completed_at_ms INTEGER);
CREATE INDEX IF NOT EXISTS idx_agent_runs_project_updated ON agent_runs(project_id,updated_at_ms DESC);
CREATE TABLE IF NOT EXISTS agent_plans(
 run_id TEXT NOT NULL,version INTEGER NOT NULL,plan_json TEXT NOT NULL,plan_hash TEXT NOT NULL,
 registry_hash TEXT NOT NULL DEFAULT '',planner_profile_hash TEXT NOT NULL DEFAULT '',writer_profile_hash TEXT NOT NULL DEFAULT '',created_at_ms INTEGER NOT NULL,
 PRIMARY KEY(run_id,version),FOREIGN KEY(run_id) REFERENCES agent_runs(id) ON DELETE RESTRICT);
CREATE TABLE IF NOT EXISTS agent_steps(
 run_id TEXT NOT NULL,plan_version INTEGER NOT NULL,step_id TEXT NOT NULL,ordinal INTEGER NOT NULL,title TEXT NOT NULL,
 tool_name TEXT NOT NULL,tool_version TEXT NOT NULL DEFAULT '1',registry_hash TEXT NOT NULL DEFAULT '',
 input_json TEXT NOT NULL,resolved_input_json TEXT,action_hash TEXT,pending_approval_hash TEXT,
 pending_approval_requested_at_ms INTEGER,
 risk TEXT NOT NULL CHECK(risk IN('read','write','high')),
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
 id TEXT PRIMARY KEY,run_id TEXT NOT NULL,decision_sequence INTEGER NOT NULL,plan_version INTEGER,step_id TEXT,
 approval_kind TEXT NOT NULL CHECK(approval_kind IN('plan','action')),
 decision TEXT NOT NULL CHECK(decision IN('approved','rejected','revoked')),
 approved_hash TEXT NOT NULL,risk TEXT CHECK(risk IS NULL OR risk IN('read','write','high')),
 registry_hash TEXT NOT NULL DEFAULT '',tool_version TEXT,model_profile_hash TEXT,
 actor_id TEXT NOT NULL,policy_reason TEXT,created_at_ms INTEGER NOT NULL,
 UNIQUE(run_id,decision_sequence),FOREIGN KEY(run_id) REFERENCES agent_runs(id) ON DELETE RESTRICT);
CREATE INDEX IF NOT EXISTS idx_agent_approvals_run_sequence ON agent_approvals(run_id,decision_sequence DESC);
CREATE TABLE IF NOT EXISTS agent_artifacts(
 id TEXT PRIMARY KEY,run_id TEXT NOT NULL,step_id TEXT,artifact_kind TEXT NOT NULL,content_json TEXT NOT NULL,
 content_sha256 TEXT NOT NULL,snapshot_id TEXT,audit_json TEXT,
 review_status TEXT CHECK(review_status IS NULL OR review_status IN('approved','warning','needs-review')),
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
CREATE TABLE IF NOT EXISTS agent_questions(
 id TEXT PRIMARY KEY,run_id TEXT NOT NULL,plan_version INTEGER,step_id TEXT,prompt TEXT NOT NULL,
 answer_type TEXT NOT NULL CHECK(answer_type IN('choice','text','confirm')),options_json TEXT,
 requires_replan INTEGER NOT NULL CHECK(requires_replan IN(0,1)),created_at_ms INTEGER NOT NULL,
 FOREIGN KEY(run_id) REFERENCES agent_runs(id) ON DELETE RESTRICT);
CREATE INDEX IF NOT EXISTS idx_agent_questions_run_created ON agent_questions(run_id,created_at_ms,id);
CREATE TABLE IF NOT EXISTS agent_answers(
 id TEXT PRIMARY KEY,question_id TEXT NOT NULL UNIQUE,run_id TEXT NOT NULL,answer_json TEXT NOT NULL,
 actor_id TEXT NOT NULL,created_at_ms INTEGER NOT NULL,
 FOREIGN KEY(question_id) REFERENCES agent_questions(id) ON DELETE RESTRICT,
 FOREIGN KEY(run_id) REFERENCES agent_runs(id) ON DELETE RESTRICT);
CREATE TABLE IF NOT EXISTS agent_artifact_reviews(
 id TEXT PRIMARY KEY,artifact_id TEXT NOT NULL,run_id TEXT NOT NULL,decision_sequence INTEGER NOT NULL,
 artifact_sha256 TEXT NOT NULL,decision TEXT NOT NULL CHECK(decision IN('approved','rejected')),
 actor_id TEXT NOT NULL,reason TEXT,created_at_ms INTEGER NOT NULL,
 UNIQUE(artifact_id,decision_sequence),
 FOREIGN KEY(artifact_id) REFERENCES agent_artifacts(id) ON DELETE RESTRICT,
 FOREIGN KEY(run_id) REFERENCES agent_runs(id) ON DELETE RESTRICT);
CREATE INDEX IF NOT EXISTS idx_agent_artifact_reviews_artifact_sequence ON agent_artifact_reviews(artifact_id,decision_sequence DESC);
CREATE TABLE IF NOT EXISTS agent_model_profiles(
 id TEXT PRIMARY KEY,role TEXT NOT NULL CHECK(role IN('planner','writer')),
 protocol TEXT NOT NULL CHECK(protocol IN('openai_chat_completions','openai_responses','anthropic_messages')),
 model TEXT NOT NULL,endpoint_origin TEXT NOT NULL,config_json TEXT NOT NULL,config_sha256 TEXT NOT NULL UNIQUE,
 created_at_ms INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS agent_resource_grants(
 id TEXT PRIMARY KEY,run_id TEXT,library_instance_id TEXT NOT NULL,project_id TEXT NOT NULL,
 grant_kind TEXT NOT NULL CHECK(grant_kind IN('import_file','mysql_profile','export_directory')),
 locator TEXT NOT NULL,metadata_json TEXT NOT NULL,fingerprint_sha256 TEXT NOT NULL,
 created_at_ms INTEGER NOT NULL,expires_at_ms INTEGER,revoked_at_ms INTEGER,consumed_at_ms INTEGER,
 FOREIGN KEY(run_id) REFERENCES agent_runs(id) ON DELETE RESTRICT);
CREATE INDEX IF NOT EXISTS idx_agent_resource_grants_run ON agent_resource_grants(run_id,created_at_ms DESC);
CREATE TABLE IF NOT EXISTS agent_operations(
 id TEXT PRIMARY KEY,run_id TEXT NOT NULL,step_id TEXT NOT NULL,operation_key TEXT NOT NULL UNIQUE,
 operation_kind TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN('queued','running','pause_requested','paused','cancel_requested','cancelling','committing','succeeded','failed','cancelled')),
 phase TEXT NOT NULL,processed_count INTEGER NOT NULL DEFAULT 0,total_count INTEGER,
 bytes_processed INTEGER NOT NULL DEFAULT 0,total_bytes INTEGER,started_at_ms INTEGER,
 heartbeat_at_ms INTEGER,finished_at_ms INTEGER,recovery_count INTEGER NOT NULL DEFAULT 0,
 result_json TEXT,error_code TEXT,created_at_ms INTEGER NOT NULL,updated_at_ms INTEGER NOT NULL,
 FOREIGN KEY(run_id) REFERENCES agent_runs(id) ON DELETE RESTRICT);
CREATE INDEX IF NOT EXISTS idx_agent_operations_run ON agent_operations(run_id,updated_at_ms DESC);
CREATE TABLE IF NOT EXISTS agent_import_staging_papers(
 operation_id TEXT NOT NULL,row_index INTEGER NOT NULL,paper_id TEXT NOT NULL,project_id TEXT NOT NULL,
 paper_json TEXT NOT NULL,dedupe_key TEXT NOT NULL,row_sha256 TEXT NOT NULL,
 PRIMARY KEY(operation_id,row_index),FOREIGN KEY(operation_id) REFERENCES agent_operations(id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS idx_agent_import_staging_dedupe ON agent_import_staging_papers(operation_id,dedupe_key);
CREATE TABLE IF NOT EXISTS agent_model_calls(
 id TEXT PRIMARY KEY,run_id TEXT NOT NULL,step_id TEXT,model_role TEXT NOT NULL,
 purpose TEXT NOT NULL,protocol TEXT NOT NULL,model TEXT NOT NULL,profile_hash TEXT NOT NULL,
 request_id TEXT,input_tokens INTEGER,output_tokens INTEGER,total_tokens INTEGER,
 elapsed_ms INTEGER NOT NULL DEFAULT 0,retry_count INTEGER NOT NULL DEFAULT 0,
 structure_repair_count INTEGER NOT NULL DEFAULT 0,fallback_used INTEGER NOT NULL DEFAULT 0,
 status TEXT NOT NULL CHECK(status IN('started','succeeded','failed','cancelled','abandoned')),
 estimated_cost_microusd INTEGER,pricing_hash TEXT,error_code TEXT,
 created_at_ms INTEGER NOT NULL,finished_at_ms INTEGER,
 FOREIGN KEY(run_id) REFERENCES agent_runs(id) ON DELETE RESTRICT);
CREATE INDEX IF NOT EXISTS idx_agent_model_calls_run ON agent_model_calls(run_id,created_at_ms,id);
CREATE TABLE IF NOT EXISTS library_operation_leases(
 lease_key TEXT PRIMARY KEY,owner_id TEXT NOT NULL,lease_token TEXT NOT NULL,generation INTEGER NOT NULL,
 operation_kind TEXT NOT NULL,heartbeat_at_ms INTEGER NOT NULL,expires_at_ms INTEGER NOT NULL);
CREATE TRIGGER IF NOT EXISTS agent_events_no_update BEFORE UPDATE ON agent_events BEGIN SELECT RAISE(ABORT,'AGENT_EVENTS_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS agent_events_no_delete BEFORE DELETE ON agent_events BEGIN SELECT RAISE(ABORT,'AGENT_EVENTS_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS agent_approvals_no_update BEFORE UPDATE ON agent_approvals BEGIN SELECT RAISE(ABORT,'AGENT_APPROVALS_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS agent_approvals_no_delete BEFORE DELETE ON agent_approvals BEGIN SELECT RAISE(ABORT,'AGENT_APPROVALS_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS agent_receipts_no_update BEFORE UPDATE ON agent_tool_receipts BEGIN SELECT RAISE(ABORT,'AGENT_RECEIPTS_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS agent_receipts_no_delete BEFORE DELETE ON agent_tool_receipts BEGIN SELECT RAISE(ABORT,'AGENT_RECEIPTS_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS agent_artifacts_no_update BEFORE UPDATE ON agent_artifacts BEGIN SELECT RAISE(ABORT,'AGENT_ARTIFACTS_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS agent_artifacts_no_delete BEFORE DELETE ON agent_artifacts BEGIN SELECT RAISE(ABORT,'AGENT_ARTIFACTS_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS agent_questions_no_update BEFORE UPDATE ON agent_questions BEGIN SELECT RAISE(ABORT,'AGENT_QUESTIONS_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS agent_questions_no_delete BEFORE DELETE ON agent_questions BEGIN SELECT RAISE(ABORT,'AGENT_QUESTIONS_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS agent_answers_no_update BEFORE UPDATE ON agent_answers BEGIN SELECT RAISE(ABORT,'AGENT_ANSWERS_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS agent_answers_no_delete BEFORE DELETE ON agent_answers BEGIN SELECT RAISE(ABORT,'AGENT_ANSWERS_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS agent_artifact_reviews_no_update BEFORE UPDATE ON agent_artifact_reviews BEGIN SELECT RAISE(ABORT,'AGENT_ARTIFACT_REVIEWS_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS agent_artifact_reviews_no_delete BEFORE DELETE ON agent_artifact_reviews BEGIN SELECT RAISE(ABORT,'AGENT_ARTIFACT_REVIEWS_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS agent_model_profiles_no_update BEFORE UPDATE ON agent_model_profiles BEGIN SELECT RAISE(ABORT,'AGENT_MODEL_PROFILES_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS agent_model_profiles_no_delete BEFORE DELETE ON agent_model_profiles BEGIN SELECT RAISE(ABORT,'AGENT_MODEL_PROFILES_IMMUTABLE'); END;
