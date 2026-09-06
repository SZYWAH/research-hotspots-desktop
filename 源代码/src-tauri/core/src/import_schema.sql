CREATE TABLE IF NOT EXISTS paper_import_commits (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  client_commit_id TEXT NOT NULL,
  preview_id TEXT NOT NULL,
  preview_hash TEXT NOT NULL,
  batch_version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('committed','rolled-back')),
  before_revision INTEGER NOT NULL,
  after_revision INTEGER NOT NULL,
  paper_count_before INTEGER NOT NULL,
  paper_count_after INTEGER NOT NULL,
  counts_json TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  completed_at_ms INTEGER NOT NULL,
  rolled_back_at_ms INTEGER,
  rollback_revision INTEGER,
  error_code TEXT,
  UNIQUE(project_id, batch_id),
  UNIQUE(project_id, client_commit_id)
);
CREATE INDEX IF NOT EXISTS idx_paper_import_commits_project_created
  ON paper_import_commits(project_id, created_at_ms DESC);

-- Historical v10-v13 libraries scoped paper identities by (project_id,id),
-- while fresh libraries use a globally unique id.  This parent key keeps the
-- v14 import foreign keys valid for both shapes without imposing global-id
-- uniqueness on migrated multi-project libraries.
CREATE UNIQUE INDEX IF NOT EXISTS idx_papers_project_identity
  ON papers(project_id, id);

CREATE TABLE IF NOT EXISTS paper_source_records (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  paper_id TEXT NOT NULL,
  commit_id TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  candidate_id TEXT NOT NULL,
  source_database TEXT NOT NULL,
  producer_version TEXT NOT NULL,
  provider_record_id TEXT,
  canonical_locator TEXT,
  record_type TEXT,
  full_text_status TEXT,
  metadata_json TEXT NOT NULL,
  provenance_json TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  UNIQUE(project_id, batch_id, candidate_id),
  FOREIGN KEY(project_id, paper_id) REFERENCES papers(project_id, id) ON DELETE CASCADE,
  FOREIGN KEY(commit_id) REFERENCES paper_import_commits(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_paper_source_records_project_paper
  ON paper_source_records(project_id, paper_id, created_at_ms DESC);
CREATE INDEX IF NOT EXISTS idx_paper_source_records_provider
  ON paper_source_records(project_id, source_database, provider_record_id);

CREATE TABLE IF NOT EXISTS paper_identity_aliases (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  paper_id TEXT NOT NULL,
  alias_kind TEXT NOT NULL CHECK(alias_kind IN ('doi','provider-record','canonical-url')),
  normalized_value TEXT NOT NULL,
  source_record_id TEXT,
  commit_id TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  UNIQUE(project_id, alias_kind, normalized_value),
  FOREIGN KEY(project_id, paper_id) REFERENCES papers(project_id, id) ON DELETE CASCADE,
  FOREIGN KEY(source_record_id) REFERENCES paper_source_records(id) ON DELETE SET NULL,
  FOREIGN KEY(commit_id) REFERENCES paper_import_commits(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_paper_identity_aliases_project_paper
  ON paper_identity_aliases(project_id, paper_id, alias_kind);

CREATE TABLE IF NOT EXISTS paper_import_commit_items (
  commit_id TEXT NOT NULL,
  candidate_id TEXT NOT NULL,
  row_index INTEGER NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('insert','merge','keep-separate','skip')),
  paper_id TEXT,
  before_paper_json TEXT,
  after_paper_json TEXT,
  after_fingerprint TEXT,
  source_record_id TEXT,
  created_at_ms INTEGER NOT NULL,
  PRIMARY KEY(commit_id, candidate_id),
  FOREIGN KEY(commit_id) REFERENCES paper_import_commits(id) ON DELETE CASCADE,
  FOREIGN KEY(source_record_id) REFERENCES paper_source_records(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_paper_import_commit_items_paper
  ON paper_import_commit_items(paper_id, commit_id);
