PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA temp_store = MEMORY;

CREATE TABLE IF NOT EXISTS papers (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  source TEXT NOT NULL,
  title TEXT NOT NULL,
  abstract TEXT NOT NULL,
  authors TEXT,
  categories TEXT,
  field TEXT NOT NULL,
  published_date TEXT,
  year INTEGER,
  url TEXT,
  doi TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  search_blob TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_papers_project_year ON papers(project_id, year);
CREATE INDEX IF NOT EXISTS idx_papers_project_source ON papers(project_id, source);
CREATE INDEX IF NOT EXISTS idx_papers_project_field ON papers(project_id, field);
CREATE INDEX IF NOT EXISTS idx_papers_project_updated ON papers(project_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_papers_project_doi ON papers(project_id, doi);
CREATE INDEX IF NOT EXISTS idx_papers_project_source_year ON papers(project_id, source, year);
CREATE INDEX IF NOT EXISTS idx_papers_project_field_year ON papers(project_id, field, year);
CREATE INDEX IF NOT EXISTS idx_papers_project_source_field_year ON papers(project_id, source, field, year);

CREATE TABLE IF NOT EXISTS app17_paper_topics (
  project_id TEXT NOT NULL, raw_paper_id TEXT NOT NULL, scoped_paper_id TEXT NOT NULL,
  field TEXT NOT NULL, topic_id INTEGER NOT NULL, x REAL NOT NULL, y REAL NOT NULL, z REAL NOT NULL,
  year INTEGER, PRIMARY KEY(project_id, raw_paper_id)
);
CREATE INDEX IF NOT EXISTS idx_app17_paper_topics_project_topic ON app17_paper_topics(project_id, field, topic_id);
CREATE INDEX IF NOT EXISTS idx_app17_paper_topics_project_scoped ON app17_paper_topics(project_id, scoped_paper_id);
CREATE TABLE IF NOT EXISTS app17_hotspots (
  project_id TEXT NOT NULL, field TEXT NOT NULL, topic_id INTEGER NOT NULL, title_cn TEXT,
  topic_label TEXT, summary_cn TEXT, paper_count INTEGER, trend_status TEXT, evolution_json TEXT,
  PRIMARY KEY(project_id, field, topic_id)
);
CREATE INDEX IF NOT EXISTS idx_app17_hotspots_project_count ON app17_hotspots(project_id, paper_count DESC);
CREATE TABLE IF NOT EXISTS app17_hotspot_reviews (
  project_id TEXT NOT NULL, field TEXT NOT NULL, topic_id INTEGER NOT NULL,
  review_cn TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY(project_id, field, topic_id, created_at)
);
