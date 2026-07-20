CREATE TABLE IF NOT EXISTS v20_analysis_snapshots (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, algorithm_version TEXT NOT NULL,
  paper_count INTEGER NOT NULL, hotspot_count INTEGER NOT NULL, membership_count INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('writing','ready','failed')), created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_v20_snapshots_project_created ON v20_analysis_snapshots(project_id, created_at DESC);
CREATE TABLE IF NOT EXISTS v20_hotspots (
  snapshot_id TEXT NOT NULL, project_id TEXT NOT NULL, hotspot_id TEXT NOT NULL, payload_json TEXT NOT NULL,
  x REAL NOT NULL, y REAL NOT NULL, z REAL NOT NULL, paper_count INTEGER NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY(snapshot_id, hotspot_id), FOREIGN KEY(snapshot_id) REFERENCES v20_analysis_snapshots(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_v20_hotspots_project_snapshot ON v20_hotspots(project_id, snapshot_id, paper_count DESC);
CREATE TABLE IF NOT EXISTS v20_paper_memberships (
  snapshot_id TEXT NOT NULL, project_id TEXT NOT NULL, paper_id TEXT NOT NULL, hotspot_id TEXT NOT NULL,
  x REAL NOT NULL, y REAL NOT NULL, z REAL NOT NULL, representative_rank INTEGER, score REAL NOT NULL,
  PRIMARY KEY(snapshot_id, paper_id), FOREIGN KEY(snapshot_id) REFERENCES v20_analysis_snapshots(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_v20_memberships_hotspot ON v20_paper_memberships(project_id, snapshot_id, hotspot_id, representative_rank);
CREATE INDEX IF NOT EXISTS idx_v20_memberships_paper ON v20_paper_memberships(project_id, paper_id, snapshot_id);
CREATE TABLE IF NOT EXISTS v20_analysis_state (
  project_id TEXT PRIMARY KEY, active_snapshot_id TEXT NOT NULL, updated_at TEXT NOT NULL,
  FOREIGN KEY(active_snapshot_id) REFERENCES v20_analysis_snapshots(id)
);
