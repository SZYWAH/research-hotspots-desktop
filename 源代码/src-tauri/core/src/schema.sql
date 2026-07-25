CREATE TABLE IF NOT EXISTS v20_analysis_snapshots (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, algorithm_version TEXT NOT NULL,
  layout_version TEXT NOT NULL DEFAULT 'legacy',
  projection_version TEXT NOT NULL DEFAULT 'legacy',
  embedding_model_id TEXT NOT NULL DEFAULT '',
  embedding_model_revision TEXT NOT NULL DEFAULT '',
  hotspot_identity_version TEXT NOT NULL DEFAULT 'ranked-hash-v1',
  paper_count INTEGER NOT NULL, hotspot_count INTEGER NOT NULL, membership_count INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('writing','ready','failed')), created_at TEXT NOT NULL,
  library_revision INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS library_revision_state (
  project_id TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 0, updated_at_ms INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_v20_snapshots_project_created ON v20_analysis_snapshots(project_id, created_at DESC);
CREATE TABLE IF NOT EXISTS v20_hotspots (
  snapshot_id TEXT NOT NULL, project_id TEXT NOT NULL, hotspot_id TEXT NOT NULL, payload_json TEXT NOT NULL,
  identity_key_sha256 TEXT NOT NULL DEFAULT '',
  x REAL NOT NULL, y REAL NOT NULL, z REAL NOT NULL, paper_count INTEGER NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY(snapshot_id, hotspot_id), FOREIGN KEY(snapshot_id) REFERENCES v20_analysis_snapshots(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_v20_hotspots_project_snapshot ON v20_hotspots(project_id, snapshot_id, paper_count DESC);
CREATE INDEX IF NOT EXISTS idx_v20_hotspots_identity ON v20_hotspots(project_id, identity_key_sha256, snapshot_id);
CREATE TABLE IF NOT EXISTS v20_paper_memberships (
  snapshot_id TEXT NOT NULL, project_id TEXT NOT NULL, paper_id TEXT NOT NULL, hotspot_id TEXT NOT NULL,
  x REAL NOT NULL, y REAL NOT NULL, z REAL NOT NULL, representative_rank INTEGER, score REAL NOT NULL,
  PRIMARY KEY(snapshot_id, paper_id), FOREIGN KEY(snapshot_id) REFERENCES v20_analysis_snapshots(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_v20_memberships_hotspot ON v20_paper_memberships(project_id, snapshot_id, hotspot_id, representative_rank);
CREATE INDEX IF NOT EXISTS idx_v20_memberships_paper ON v20_paper_memberships(project_id, paper_id, snapshot_id);
CREATE TABLE IF NOT EXISTS v20_hotspot_lineage (
  project_id TEXT NOT NULL,
  from_snapshot_id TEXT NOT NULL,
  from_hotspot_id TEXT NOT NULL,
  to_snapshot_id TEXT NOT NULL,
  to_hotspot_id TEXT NOT NULL,
  relation_type TEXT NOT NULL CHECK(relation_type IN ('identity','equivalent','continuation')),
  member_overlap REAL NOT NULL CHECK(member_overlap >= 0 AND member_overlap <= 1),
  identity_key_match INTEGER NOT NULL CHECK(identity_key_match IN (0,1)),
  created_at TEXT NOT NULL,
  PRIMARY KEY(from_snapshot_id,from_hotspot_id,to_snapshot_id,to_hotspot_id),
  FOREIGN KEY(from_snapshot_id) REFERENCES v20_analysis_snapshots(id) ON DELETE CASCADE,
  FOREIGN KEY(to_snapshot_id) REFERENCES v20_analysis_snapshots(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_v20_lineage_to_snapshot
  ON v20_hotspot_lineage(project_id,to_snapshot_id,to_hotspot_id);
CREATE TABLE IF NOT EXISTS paper_semantic_embeddings (
  project_id TEXT NOT NULL,
  paper_id TEXT NOT NULL,
  content_sha256 TEXT NOT NULL,
  model_id TEXT NOT NULL,
  model_revision TEXT NOT NULL,
  dimensions INTEGER NOT NULL CHECK(dimensions > 0),
  encoding TEXT NOT NULL CHECK(encoding = 'float16-le'),
  vector_blob BLOB NOT NULL,
  created_at_ms INTEGER NOT NULL,
  PRIMARY KEY(project_id, paper_id, model_id, model_revision, content_sha256)
);
CREATE INDEX IF NOT EXISTS idx_paper_semantic_embeddings_current
  ON paper_semantic_embeddings(project_id, paper_id, model_id, model_revision, created_at_ms DESC);
CREATE TABLE IF NOT EXISTS v20_analysis_state (
  project_id TEXT PRIMARY KEY, active_snapshot_id TEXT NOT NULL, updated_at TEXT NOT NULL,
  FOREIGN KEY(active_snapshot_id) REFERENCES v20_analysis_snapshots(id)
);
