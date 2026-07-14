CREATE DATABASE IF NOT EXISTS research_hotspots
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE research_hotspots;

-- 原始文献表
CREATE TABLE IF NOT EXISTS papers (
  id VARCHAR(191) NOT NULL,
  source VARCHAR(64) NOT NULL,
  title VARCHAR(500) NOT NULL,
  abstract MEDIUMTEXT NULL,
  authors TEXT NULL,
  categories TEXT NULL,
  field VARCHAR(128) NOT NULL,
  published_date DATETIME NULL,
  year INT NULL,
  url VARCHAR(1000) NULL,
  doi VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_papers_source (source),
  KEY idx_papers_field (field),
  KEY idx_papers_year (year),
  KEY idx_papers_doi (doi(191)),
  KEY idx_papers_title (title(191))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 热点主题表
CREATE TABLE IF NOT EXISTS hotspots (
  field VARCHAR(128) NOT NULL,
  topic_id INT NOT NULL,
  topic_label VARCHAR(500) NULL,
  keywords JSON NULL,
  paper_count INT NOT NULL DEFAULT 0,
  trend_status VARCHAR(128) NULL,
  evolution_json JSON NULL,
  title_cn VARCHAR(255) NULL,
  summary_cn VARCHAR(1000) NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (field, topic_id),
  KEY idx_hotspots_field (field),
  KEY idx_hotspots_paper_count (paper_count),
  KEY idx_hotspots_title_cn (title_cn)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 文献主题归属 + 3D 坐标
CREATE TABLE IF NOT EXISTS paper_topics (
  paper_id VARCHAR(191) NOT NULL,
  field VARCHAR(128) NOT NULL,
  topic_id INT NOT NULL,
  x DOUBLE NOT NULL,
  y DOUBLE NOT NULL,
  z DOUBLE NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (paper_id, field),
  KEY idx_paper_topics_field_topic (field, topic_id),
  KEY idx_paper_topics_topic_id (topic_id),
  CONSTRAINT fk_paper_topics_paper
    FOREIGN KEY (paper_id) REFERENCES papers(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 热点综述表
CREATE TABLE IF NOT EXISTS hotspot_reviews (
  id BIGINT NOT NULL AUTO_INCREMENT,
  field VARCHAR(128) NOT NULL,
  topic_id INT NOT NULL,
  review_cn LONGTEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_hotspot_reviews_field_topic (field, topic_id),
  KEY idx_hotspot_reviews_created_at (created_at),
  CONSTRAINT fk_hotspot_reviews_hotspot
    FOREIGN KEY (field, topic_id) REFERENCES hotspots(field, topic_id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
