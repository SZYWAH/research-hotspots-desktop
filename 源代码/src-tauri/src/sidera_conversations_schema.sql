CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  last_opened_at_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sidera_conversations_project_status_updated
  ON conversations(project_id, status, updated_at_ms DESC);

CREATE TABLE IF NOT EXISTS turns (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  submitted_at_ms INTEGER NOT NULL,
  user_text TEXT NOT NULL,
  assistant_status TEXT NOT NULL,
  assistant_markdown TEXT NOT NULL,
  entity_refs_json TEXT NOT NULL DEFAULT '[]',
  retrieval_mode TEXT,
  citation_status TEXT,
  evidence_gate_status TEXT,
  usage_json TEXT,
  updated_at_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sidera_turns_conversation_time
  ON turns(conversation_id, submitted_at_ms, id);

CREATE TABLE IF NOT EXISTS project_state (
  project_id TEXT PRIMARY KEY,
  active_conversation_id TEXT,
  updated_at_ms INTEGER NOT NULL
);
