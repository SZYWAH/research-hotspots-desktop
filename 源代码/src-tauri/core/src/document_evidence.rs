use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

use rusqlite::{params, Connection, OpenFlags, OptionalExtension, TransactionBehavior};
use serde::{Deserialize, Serialize};

use crate::document_derived::{
    evidence_anchor_from_page, validate_document_evidence_anchor, SideraDocumentEvidenceAnchor,
    SideraDocumentEvidenceRect, SideraDocumentReaderQuery,
};

pub const DOCUMENT_EVIDENCE_DATABASE: &str = "document-evidence-v1.sqlite";
pub const DOCUMENT_EVIDENCE_SCHEMA_VERSION: i64 = 1;

const DOCUMENT_EVIDENCE_SCHEMA: &str = r#"
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS annotations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  paper_id TEXT NOT NULL,
  document_version_id TEXT NOT NULL,
  document_sha256 TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('highlight','note')),
  color_token TEXT NOT NULL CHECK(color_token IN ('yellow','blue','green','rose')),
  note_text TEXT,
  anchor_json TEXT NOT NULL,
  anchor_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('active','orphaned')),
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_annotations_version_page
  ON annotations(project_id,paper_id,document_version_id,anchor_id,updated_at_ms DESC,id);

CREATE TABLE IF NOT EXISTS saved_evidence (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  paper_id TEXT NOT NULL,
  document_version_id TEXT NOT NULL,
  document_sha256 TEXT NOT NULL,
  label TEXT,
  note_text TEXT,
  anchor_json TEXT NOT NULL,
  anchor_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('active','orphaned')),
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_saved_evidence_version_page
  ON saved_evidence(project_id,paper_id,document_version_id,anchor_id,updated_at_ms DESC,id);

CREATE TABLE IF NOT EXISTS source_preferences (
  project_id TEXT NOT NULL,
  paper_id TEXT NOT NULL,
  document_version_id TEXT NOT NULL,
  page_index INTEGER NOT NULL,
  preference TEXT NOT NULL CHECK(preference IN ('auto','native','ocr')),
  updated_at_ms INTEGER NOT NULL,
  PRIMARY KEY(project_id,paper_id,document_version_id,page_index)
);
"#;

#[derive(Clone, Debug)]
pub struct SideraDocumentEvidenceQuery {
    pub library_directory: PathBuf,
    pub project_id: String,
    pub paper_id: String,
    pub document_version_id: String,
}

#[derive(Clone, Debug)]
pub struct SideraDocumentAnnotationSaveInput {
    pub query: SideraDocumentEvidenceQuery,
    pub annotation_id: String,
    pub kind: String,
    pub color_token: String,
    pub note_text: Option<String>,
    pub anchor: SideraDocumentEvidenceAnchor,
    pub now_ms: i64,
}

#[derive(Clone, Debug)]
pub struct SideraDocumentAnnotationUpdateInput {
    pub query: SideraDocumentEvidenceQuery,
    pub annotation_id: String,
    pub kind: String,
    pub color_token: String,
    pub note_text: Option<String>,
    pub now_ms: i64,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SideraDocumentAnnotation {
    pub id: String,
    pub project_id: String,
    pub paper_id: String,
    pub document_version_id: String,
    pub document_sha256: String,
    pub kind: String,
    pub color_token: String,
    pub note_text: Option<String>,
    pub anchor: SideraDocumentEvidenceAnchor,
    pub resolution: SideraDocumentEvidenceResolution,
    pub resolved_anchor: Option<SideraDocumentEvidenceAnchor>,
    pub status: String,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
}

#[derive(Clone, Debug)]
pub struct SideraDocumentSavedEvidenceSaveInput {
    pub query: SideraDocumentEvidenceQuery,
    pub evidence_id: String,
    pub label: Option<String>,
    pub note_text: Option<String>,
    pub anchor: SideraDocumentEvidenceAnchor,
    pub now_ms: i64,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SideraDocumentSavedEvidence {
    pub id: String,
    pub project_id: String,
    pub paper_id: String,
    pub document_version_id: String,
    pub document_sha256: String,
    pub label: Option<String>,
    pub note_text: Option<String>,
    pub anchor: SideraDocumentEvidenceAnchor,
    pub resolution: SideraDocumentEvidenceResolution,
    pub resolved_anchor: Option<SideraDocumentEvidenceAnchor>,
    pub status: String,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
}

#[derive(Clone, Debug)]
pub struct SideraDocumentSourcePreferenceSaveInput {
    pub query: SideraDocumentEvidenceQuery,
    pub page_index: Option<u32>,
    pub preference: String,
    pub now_ms: i64,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SideraDocumentSourcePreference {
    pub document_version_id: String,
    pub page_index: Option<u32>,
    pub preference: String,
    pub updated_at_ms: i64,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SideraDocumentEvidenceResolution {
    Exact,
    Reanchored,
    Ambiguous,
    Missing,
}

pub fn document_evidence_database_path(library_directory: &Path) -> PathBuf {
    library_directory
        .join("Sidera")
        .join(DOCUMENT_EVIDENCE_DATABASE)
}

fn clean_identity(value: &str, code: &str) -> Result<String, String> {
    let value = value.trim();
    if value.is_empty() || value.len() > 256 {
        return Err(code.to_string());
    }
    Ok(value.to_string())
}

fn clean_optional_text(
    value: Option<String>,
    max_bytes: usize,
    code: &str,
) -> Result<Option<String>, String> {
    value
        .map(|value| {
            let value = value.trim().to_string();
            if value.len() > max_bytes {
                return Err(code.to_string());
            }
            Ok(value)
        })
        .transpose()
}

fn canonical_query(
    query: SideraDocumentEvidenceQuery,
) -> Result<SideraDocumentEvidenceQuery, String> {
    Ok(SideraDocumentEvidenceQuery {
        library_directory: query.library_directory,
        project_id: clean_identity(&query.project_id, "SIDERA_DOCUMENT_PROJECT_INVALID")?,
        paper_id: clean_identity(&query.paper_id, "SIDERA_DOCUMENT_PAPER_INVALID")?,
        document_version_id: clean_identity(
            &query.document_version_id,
            "SIDERA_DOCUMENT_VERSION_INVALID",
        )?,
    })
}

fn reader_query(query: &SideraDocumentEvidenceQuery) -> SideraDocumentReaderQuery {
    SideraDocumentReaderQuery {
        library_directory: query.library_directory.clone(),
        project_id: query.project_id.clone(),
        paper_id: query.paper_id.clone(),
        document_version_id: query.document_version_id.clone(),
    }
}

fn configure_write(connection: &Connection) -> Result<(), String> {
    connection
        .busy_timeout(Duration::from_secs(2))
        .map_err(|_| "SIDERA_DOCUMENT_EVIDENCE_PRAGMA_FAILED".to_string())?;
    connection
        .execute_batch("PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;")
        .map_err(|_| "SIDERA_DOCUMENT_EVIDENCE_PRAGMA_FAILED".to_string())
}

fn prepare_evidence_database(library_directory: &Path) -> Result<Connection, String> {
    let sidera = library_directory.join("Sidera");
    fs::create_dir_all(&sidera)
        .map_err(|_| "SIDERA_DOCUMENT_EVIDENCE_DIRECTORY_FAILED".to_string())?;
    let mut connection = Connection::open(document_evidence_database_path(library_directory))
        .map_err(|_| "SIDERA_DOCUMENT_EVIDENCE_OPEN_FAILED".to_string())?;
    configure_write(&connection)?;
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|_| "SIDERA_DOCUMENT_EVIDENCE_TRANSACTION_FAILED".to_string())?;
    let version: i64 = transaction
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(|_| "SIDERA_DOCUMENT_EVIDENCE_VERSION_FAILED".to_string())?;
    if version > DOCUMENT_EVIDENCE_SCHEMA_VERSION {
        return Err("SIDERA_DOCUMENT_EVIDENCE_TOO_NEW".to_string());
    }
    if version != 0 && version != DOCUMENT_EVIDENCE_SCHEMA_VERSION {
        return Err("SIDERA_DOCUMENT_EVIDENCE_MIGRATION_REQUIRED".to_string());
    }
    transaction
        .execute_batch(DOCUMENT_EVIDENCE_SCHEMA)
        .map_err(|_| "SIDERA_DOCUMENT_EVIDENCE_SCHEMA_FAILED".to_string())?;
    transaction
        .pragma_update(None, "user_version", DOCUMENT_EVIDENCE_SCHEMA_VERSION)
        .map_err(|_| "SIDERA_DOCUMENT_EVIDENCE_VERSION_FAILED".to_string())?;
    transaction
        .commit()
        .map_err(|_| "SIDERA_DOCUMENT_EVIDENCE_TRANSACTION_COMMIT_FAILED".to_string())?;
    Ok(connection)
}

fn open_evidence_read(library_directory: &Path) -> Result<Option<Connection>, String> {
    let path = document_evidence_database_path(library_directory);
    if !path.is_file() {
        return Ok(None);
    }
    let connection = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|_| "SIDERA_DOCUMENT_EVIDENCE_OPEN_FAILED".to_string())?;
    connection
        .pragma_update(None, "query_only", true)
        .map_err(|_| "SIDERA_DOCUMENT_EVIDENCE_PRAGMA_FAILED".to_string())?;
    let version: i64 = connection
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(|_| "SIDERA_DOCUMENT_EVIDENCE_VERSION_FAILED".to_string())?;
    if version != DOCUMENT_EVIDENCE_SCHEMA_VERSION {
        return Err(if version > DOCUMENT_EVIDENCE_SCHEMA_VERSION {
            "SIDERA_DOCUMENT_EVIDENCE_TOO_NEW".to_string()
        } else {
            "SIDERA_DOCUMENT_EVIDENCE_NOT_PREPARED".to_string()
        });
    }
    Ok(Some(connection))
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PersistentAnchorEnvelope {
    anchor: SideraDocumentEvidenceAnchor,
    canonical_baseline: SideraDocumentEvidenceAnchor,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum PersistentAnchorJson {
    Envelope(PersistentAnchorEnvelope),
    Legacy(SideraDocumentEvidenceAnchor),
}

#[derive(Clone, Debug)]
struct StoredPersistentAnchor {
    anchor: SideraDocumentEvidenceAnchor,
    canonical_baseline: Option<SideraDocumentEvidenceAnchor>,
}

fn parse_anchor(value: String) -> Result<StoredPersistentAnchor, String> {
    match serde_json::from_str(&value)
        .map_err(|_| "SIDERA_DOCUMENT_EVIDENCE_ANCHOR_CORRUPT".to_string())?
    {
        PersistentAnchorJson::Envelope(value) => Ok(StoredPersistentAnchor {
            anchor: value.anchor,
            canonical_baseline: Some(value.canonical_baseline),
        }),
        PersistentAnchorJson::Legacy(anchor) => Ok(StoredPersistentAnchor {
            anchor,
            canonical_baseline: None,
        }),
    }
}

fn serialize_anchor(value: &PersistentAnchorEnvelope) -> Result<String, String> {
    serde_json::to_string(value).map_err(|_| "SIDERA_DOCUMENT_EVIDENCE_ANCHOR_INVALID".to_string())
}

fn utf16_offset_for_byte(value: &str, byte_index: usize) -> Option<u32> {
    value
        .get(..byte_index)
        .map(|prefix| prefix.encode_utf16().count() as u32)
}

const DOCUMENT_EVIDENCE_MAX_QUOTE_CANDIDATES: usize = 128;

#[derive(Debug, PartialEq, Eq)]
struct QuoteOccurrences {
    ranges: Vec<(u32, u32)>,
    overflowed: bool,
}

fn quote_occurrences(value: &str, quote: &str) -> QuoteOccurrences {
    if quote.is_empty() {
        return QuoteOccurrences {
            ranges: Vec::new(),
            overflowed: false,
        };
    }
    let mut ranges = Vec::new();
    let mut search_start = 0_usize;
    while search_start <= value.len() {
        let Some(relative_start) = value[search_start..].find(quote) else {
            break;
        };
        let byte_start = search_start + relative_start;
        let Some(byte_end) = byte_start.checked_add(quote.len()) else {
            break;
        };
        if ranges.len() == DOCUMENT_EVIDENCE_MAX_QUOTE_CANDIDATES {
            return QuoteOccurrences {
                ranges,
                overflowed: true,
            };
        }
        if let (Some(start), Some(end)) = (
            utf16_offset_for_byte(value, byte_start),
            utf16_offset_for_byte(value, byte_end),
        ) {
            ranges.push((start, end));
        }
        let Some(step) = value[byte_start..].chars().next().map(char::len_utf8) else {
            break;
        };
        search_start = byte_start + step;
    }
    QuoteOccurrences {
        ranges,
        overflowed: false,
    }
}

fn rect_distance(
    original: &SideraDocumentEvidenceAnchor,
    candidate: &SideraDocumentEvidenceAnchor,
) -> Option<f64> {
    let original = original.rects.first()?;
    let candidate = candidate.rects.first()?;
    let original_x = original.x + original.width / 2.0;
    let original_y = original.y + original.height / 2.0;
    let candidate_x = candidate.x + candidate.width / 2.0;
    let candidate_y = candidate.y + candidate.height / 2.0;
    Some((original_x - candidate_x).hypot(original_y - candidate_y))
}

const DOCUMENT_EVIDENCE_MAX_RECTS: usize = 64;
const DOCUMENT_EVIDENCE_RECT_TOLERANCE: f64 = 0.02;
const DOCUMENT_EVIDENCE_REANCHOR_MAX_DISTANCE: f64 = 0.2;
const DOCUMENT_EVIDENCE_EXACT_GEOMETRY_DISTANCE: f64 = 0.015;
const DOCUMENT_EVIDENCE_MIN_PROJECTION_SCALE: f64 = 0.5;
const DOCUMENT_EVIDENCE_MAX_PROJECTION_SCALE: f64 = 2.0;

fn rect_is_normalized(rect: &SideraDocumentEvidenceRect) -> bool {
    [rect.x, rect.y, rect.width, rect.height]
        .iter()
        .all(|value| value.is_finite())
        && rect.x >= 0.0
        && rect.y >= 0.0
        && rect.width > 0.0
        && rect.height > 0.0
        && rect.x + rect.width <= 1.000_001
        && rect.y + rect.height <= 1.000_001
}

fn precise_rect_is_near_canonical(
    precise: &SideraDocumentEvidenceRect,
    canonical: &[SideraDocumentEvidenceRect],
) -> bool {
    let tolerance = DOCUMENT_EVIDENCE_RECT_TOLERANCE;
    let precise_bottom = precise.y + precise.height;
    let mut same_line = canonical.iter().filter(|candidate| {
        let candidate_bottom = candidate.y + candidate.height;
        precise.y <= candidate_bottom + tolerance && precise_bottom + tolerance >= candidate.y
    });
    let Some(first) = same_line.next() else {
        return false;
    };
    let mut left = first.x;
    let mut top = first.y;
    let mut right = first.x + first.width;
    let mut bottom = first.y + first.height;
    for candidate in same_line {
        left = left.min(candidate.x);
        top = top.min(candidate.y);
        right = right.max(candidate.x + candidate.width);
        bottom = bottom.max(candidate.y + candidate.height);
    }
    precise.x + tolerance >= left
        && precise.y + tolerance >= top
        && precise.x + precise.width <= right + tolerance
        && precise.y + precise.height <= bottom + tolerance
}

fn precise_rect_is_near_selected_source_span(
    precise: &SideraDocumentEvidenceRect,
    page: &crate::document_derived::SideraDocumentPageText,
    start_offset_utf16: u32,
    end_offset_utf16: u32,
) -> bool {
    let tolerance = DOCUMENT_EVIDENCE_RECT_TOLERANCE;
    page.spans
        .iter()
        .filter(|span| {
            span.start_offset_utf16 < end_offset_utf16 && span.end_offset_utf16 > start_offset_utf16
        })
        .any(|span| {
            precise.x + tolerance >= span.x
                && precise.y + tolerance >= span.y
                && precise.x + precise.width <= span.x + span.width + tolerance
                && precise.y + precise.height <= span.y + span.height + tolerance
        })
}

fn rect_bounds(rects: &[SideraDocumentEvidenceRect]) -> Option<SideraDocumentEvidenceRect> {
    let first = rects.first()?;
    let mut left = first.x;
    let mut top = first.y;
    let mut right = first.x + first.width;
    let mut bottom = first.y + first.height;
    for rect in &rects[1..] {
        left = left.min(rect.x);
        top = top.min(rect.y);
        right = right.max(rect.x + rect.width);
        bottom = bottom.max(rect.y + rect.height);
    }
    Some(SideraDocumentEvidenceRect {
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
    })
}

fn project_candidate_anchor(
    precise: &SideraDocumentEvidenceAnchor,
    baseline: &SideraDocumentEvidenceAnchor,
    mut candidate: SideraDocumentEvidenceAnchor,
) -> Option<SideraDocumentEvidenceAnchor> {
    let target = candidate.rects.clone();
    if !anchor_text_identity_matches(precise, baseline) {
        return None;
    }
    if precise.rects.is_empty() {
        candidate.rects.clear();
        return Some(candidate);
    }
    if precise.rects.len() > DOCUMENT_EVIDENCE_MAX_RECTS
        || baseline.rects.is_empty()
        || baseline.rects.len() > DOCUMENT_EVIDENCE_MAX_RECTS
        || target.is_empty()
        || target.len() > DOCUMENT_EVIDENCE_MAX_RECTS
        || precise.rects.iter().any(|rect| !rect_is_normalized(rect))
        || baseline.rects.iter().any(|rect| !rect_is_normalized(rect))
        || target.iter().any(|rect| !rect_is_normalized(rect))
        || precise
            .rects
            .iter()
            .any(|rect| !precise_rect_is_near_canonical(rect, &baseline.rects))
    {
        return None;
    }
    let source_bounds = rect_bounds(&baseline.rects)?;
    let target_bounds = rect_bounds(&target)?;
    let source_center_x = source_bounds.x + source_bounds.width / 2.0;
    let source_center_y = source_bounds.y + source_bounds.height / 2.0;
    let target_center_x = target_bounds.x + target_bounds.width / 2.0;
    let target_center_y = target_bounds.y + target_bounds.height / 2.0;
    if (source_center_x - target_center_x).hypot(source_center_y - target_center_y)
        > DOCUMENT_EVIDENCE_REANCHOR_MAX_DISTANCE
    {
        return None;
    }
    let scale_x = target_bounds.width / source_bounds.width;
    let scale_y = target_bounds.height / source_bounds.height;
    if ![scale_x, scale_y].iter().all(|scale| {
        scale.is_finite()
            && *scale >= DOCUMENT_EVIDENCE_MIN_PROJECTION_SCALE
            && *scale <= DOCUMENT_EVIDENCE_MAX_PROJECTION_SCALE
    }) {
        return None;
    }
    let projected = precise
        .rects
        .iter()
        .map(|rect| SideraDocumentEvidenceRect {
            x: target_bounds.x + (rect.x - source_bounds.x) * scale_x,
            y: target_bounds.y + (rect.y - source_bounds.y) * scale_y,
            width: rect.width * scale_x,
            height: rect.height * scale_y,
        })
        .collect::<Vec<_>>();
    if projected.iter().any(|rect| !rect_is_normalized(rect))
        || projected
            .iter()
            .any(|rect| !precise_rect_is_near_canonical(rect, &target))
    {
        return None;
    }
    candidate.rects = projected;
    Some(candidate)
}

fn canonical_geometry_is_current(
    baseline: &SideraDocumentEvidenceAnchor,
    current: &SideraDocumentEvidenceAnchor,
) -> bool {
    let target = &current.rects;
    if baseline.rects.is_empty() {
        return target.is_empty();
    }
    if baseline.rects.len() > DOCUMENT_EVIDENCE_MAX_RECTS
        || target.len() > DOCUMENT_EVIDENCE_MAX_RECTS
        || baseline.rects.iter().any(|rect| !rect_is_normalized(rect))
        || target.iter().any(|rect| !rect_is_normalized(rect))
    {
        return false;
    }
    let (Some(old), Some(current)) = (rect_bounds(&baseline.rects), rect_bounds(target)) else {
        return false;
    };
    let old_center_x = old.x + old.width / 2.0;
    let old_center_y = old.y + old.height / 2.0;
    let current_center_x = current.x + current.width / 2.0;
    let current_center_y = current.y + current.height / 2.0;
    let scale_x = current.width / old.width;
    let scale_y = current.height / old.height;
    (old_center_x - current_center_x).hypot(old_center_y - current_center_y)
        <= DOCUMENT_EVIDENCE_EXACT_GEOMETRY_DISTANCE
        && (0.8..=1.25).contains(&scale_x)
        && (0.8..=1.25).contains(&scale_y)
        && baseline
            .rects
            .iter()
            .all(|rect| precise_rect_is_near_canonical(rect, target))
}

fn anchor_text_identity_matches(
    left: &SideraDocumentEvidenceAnchor,
    right: &SideraDocumentEvidenceAnchor,
) -> bool {
    left.id == right.id
        && left.document_version_id == right.document_version_id
        && left
            .document_sha256
            .eq_ignore_ascii_case(&right.document_sha256)
        && left.page_index == right.page_index
        && left.page_label == right.page_label
        && left.source_kind == right.source_kind
        && left.start_offset_utf16 == right.start_offset_utf16
        && left.end_offset_utf16 == right.end_offset_utf16
        && left.quote == right.quote
        && left.quote_sha256.eq_ignore_ascii_case(&right.quote_sha256)
        && left.prefix == right.prefix
        && left.suffix == right.suffix
}

#[derive(Debug)]
struct ValidatedPersistentAnchor {
    precise: SideraDocumentEvidenceAnchor,
    canonical_baseline: SideraDocumentEvidenceAnchor,
}

fn validate_persistent_anchor(
    query: SideraDocumentReaderQuery,
    submitted: &SideraDocumentEvidenceAnchor,
) -> Result<ValidatedPersistentAnchor, String> {
    let page = crate::document_ocr::document_page_text_for_source(
        query.clone(),
        submitted.page_index,
        &submitted.source_kind,
    )?;
    let canonical = validate_document_evidence_anchor(query, submitted)?;
    if submitted.document_version_id != canonical.document_version_id
        || !submitted
            .document_sha256
            .eq_ignore_ascii_case(&canonical.document_sha256)
        || submitted.page_index != canonical.page_index
        || submitted.source_kind != canonical.source_kind
        || submitted.start_offset_utf16 != canonical.start_offset_utf16
        || submitted.end_offset_utf16 != canonical.end_offset_utf16
        || submitted.id != canonical.id
        || submitted.quote != canonical.quote
        || !submitted
            .quote_sha256
            .eq_ignore_ascii_case(&canonical.quote_sha256)
    {
        return Err("SIDERA_DOCUMENT_EVIDENCE_QUOTE_MISMATCH".to_string());
    }
    if submitted.page_label != canonical.page_label
        || submitted.prefix != canonical.prefix
        || submitted.suffix != canonical.suffix
    {
        return Err("SIDERA_DOCUMENT_EVIDENCE_CONTEXT_MISMATCH".to_string());
    }
    if submitted.rects.len() > DOCUMENT_EVIDENCE_MAX_RECTS
        || submitted.rects.iter().any(|rect| !rect_is_normalized(rect))
        || (!submitted.rects.is_empty() && canonical.rects.is_empty())
        || submitted.rects.iter().any(|rect| {
            !precise_rect_is_near_canonical(rect, &canonical.rects)
                && !precise_rect_is_near_selected_source_span(
                    rect,
                    &page,
                    submitted.start_offset_utf16,
                    submitted.end_offset_utf16,
                )
        })
    {
        return Err("SIDERA_DOCUMENT_EVIDENCE_RECTS_INVALID".to_string());
    }
    let mut precise = submitted.clone();
    precise.document_sha256 = canonical.document_sha256.clone();
    precise.quote_sha256 = canonical.quote_sha256.clone();
    Ok(ValidatedPersistentAnchor {
        precise,
        canonical_baseline: canonical,
    })
}

fn resolve_anchor_in_page(
    stored: &StoredPersistentAnchor,
    page: &crate::document_derived::SideraDocumentPageText,
) -> Result<
    (
        SideraDocumentEvidenceResolution,
        Option<SideraDocumentEvidenceAnchor>,
    ),
    String,
> {
    let precise = &stored.anchor;
    if precise.document_version_id != page.document_version_id
        || precise.document_sha256.to_ascii_lowercase() != page.document_sha256
        || precise.page_index != page.page_index
        || precise.source_kind != page.source_kind
    {
        return Ok((SideraDocumentEvidenceResolution::Missing, None));
    }
    if stored
        .canonical_baseline
        .as_ref()
        .is_some_and(|baseline| !anchor_text_identity_matches(precise, baseline))
    {
        return Ok((SideraDocumentEvidenceResolution::Ambiguous, None));
    }
    let context = stored.canonical_baseline.as_ref().unwrap_or(precise);
    if let Ok(exact) =
        evidence_anchor_from_page(page, precise.start_offset_utf16, precise.end_offset_utf16)
    {
        if anchor_text_identity_matches(context, &exact) {
            if canonical_geometry_is_current(context, &exact) {
                return Ok((
                    SideraDocumentEvidenceResolution::Exact,
                    Some(precise.clone()),
                ));
            }
            return Ok(
                match stored
                    .canonical_baseline
                    .as_ref()
                    .and_then(|baseline| project_candidate_anchor(precise, baseline, exact))
                {
                    Some(projected) => (
                        SideraDocumentEvidenceResolution::Reanchored,
                        Some(projected),
                    ),
                    None => (SideraDocumentEvidenceResolution::Ambiguous, None),
                },
            );
        }
    }
    let occurrences = quote_occurrences(&page.text, &precise.quote);
    if occurrences.overflowed {
        return Ok((SideraDocumentEvidenceResolution::Ambiguous, None));
    }
    let mut candidates = occurrences
        .ranges
        .into_iter()
        .filter_map(|(start, end)| evidence_anchor_from_page(page, start, end).ok())
        .collect::<Vec<_>>();
    if candidates.is_empty() {
        return Ok((SideraDocumentEvidenceResolution::Missing, None));
    }
    let project = |candidate| {
        stored
            .canonical_baseline
            .as_ref()
            .and_then(|baseline| project_candidate_anchor(precise, baseline, candidate))
    };
    if candidates.len() == 1 {
        let candidate = candidates.pop().expect("one candidate");
        return Ok(if let Some(projected) = project(candidate) {
            (
                SideraDocumentEvidenceResolution::Reanchored,
                Some(projected),
            )
        } else {
            (SideraDocumentEvidenceResolution::Ambiguous, None)
        });
    }
    let context_score = |candidate: &SideraDocumentEvidenceAnchor| {
        i32::from(candidate.prefix == context.prefix) * 2
            + i32::from(candidate.suffix == context.suffix) * 2
            + i32::from(
                !context.prefix.is_empty()
                    && candidate.prefix.ends_with(context.prefix.trim_start()),
            )
            + i32::from(
                !context.suffix.is_empty()
                    && candidate.suffix.starts_with(context.suffix.trim_end()),
            )
    };
    let best_context = candidates
        .iter()
        .map(context_score)
        .max()
        .unwrap_or_default();
    let mut best = candidates
        .into_iter()
        .filter(|candidate| context_score(candidate) == best_context)
        .collect::<Vec<_>>();
    if best_context > 0 && best.len() == 1 {
        return Ok(match project(best.pop().expect("one candidate")) {
            Some(projected) => (
                SideraDocumentEvidenceResolution::Reanchored,
                Some(projected),
            ),
            None => (SideraDocumentEvidenceResolution::Ambiguous, None),
        });
    }
    let mut by_rect = best
        .into_iter()
        .filter_map(|candidate| {
            let projected = project(candidate)?;
            rect_distance(precise, &projected).map(|distance| (distance, projected))
        })
        .collect::<Vec<_>>();
    by_rect.sort_by(|left, right| {
        left.0
            .partial_cmp(&right.0)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    if (!by_rect.is_empty() && by_rect[0].0 <= DOCUMENT_EVIDENCE_REANCHOR_MAX_DISTANCE)
        && (by_rect.len() == 1 || by_rect[0].0 + 0.01 < by_rect[1].0)
    {
        return Ok((
            SideraDocumentEvidenceResolution::Reanchored,
            Some(by_rect.remove(0).1),
        ));
    }
    Ok((SideraDocumentEvidenceResolution::Ambiguous, None))
}

fn resolve_anchor(
    query: &SideraDocumentEvidenceQuery,
    stored: &StoredPersistentAnchor,
) -> Result<
    (
        SideraDocumentEvidenceResolution,
        Option<SideraDocumentEvidenceAnchor>,
    ),
    String,
> {
    let page = match crate::document_ocr::document_page_text_for_source(
        reader_query(query),
        stored.anchor.page_index,
        &stored.anchor.source_kind,
    ) {
        Ok(page) => page,
        Err(code)
            if code == "SIDERA_DOCUMENT_PAGE_TEXT_NOT_FOUND"
                || code == "SIDERA_DOCUMENT_PARSE_NOT_READY" =>
        {
            return Ok((SideraDocumentEvidenceResolution::Missing, None));
        }
        Err(code) => return Err(code),
    };
    resolve_anchor_in_page(stored, &page)
}

fn annotation_from_row(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<(
    String,
    String,
    String,
    String,
    String,
    String,
    String,
    Option<String>,
    String,
    String,
    i64,
    i64,
)> {
    Ok((
        row.get(0)?,
        row.get(1)?,
        row.get(2)?,
        row.get(3)?,
        row.get(4)?,
        row.get(5)?,
        row.get(6)?,
        row.get(7)?,
        row.get(8)?,
        row.get(9)?,
        row.get(10)?,
        row.get(11)?,
    ))
}

pub fn list_document_annotations(
    query: SideraDocumentEvidenceQuery,
) -> Result<Vec<SideraDocumentAnnotation>, String> {
    let query = canonical_query(query)?;
    let Some(connection) = open_evidence_read(&query.library_directory)? else {
        return Ok(Vec::new());
    };
    let mut statement = connection
        .prepare(
            "SELECT id,project_id,paper_id,document_version_id,document_sha256,kind,color_token,
                    note_text,anchor_json,status,created_at_ms,updated_at_ms
             FROM annotations WHERE project_id=?1 AND paper_id=?2 AND document_version_id=?3
             ORDER BY updated_at_ms DESC,id",
        )
        .map_err(|_| "SIDERA_DOCUMENT_ANNOTATION_READ_FAILED".to_string())?;
    let rows = statement
        .query_map(
            params![query.project_id, query.paper_id, query.document_version_id],
            annotation_from_row,
        )
        .map_err(|_| "SIDERA_DOCUMENT_ANNOTATION_READ_FAILED".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "SIDERA_DOCUMENT_ANNOTATION_READ_FAILED".to_string())?;
    rows.into_iter()
        .map(|row| {
            let stored = parse_anchor(row.8)?;
            let (resolution, resolved_anchor) = resolve_anchor(&query, &stored)?;
            Ok(SideraDocumentAnnotation {
                id: row.0,
                project_id: row.1,
                paper_id: row.2,
                document_version_id: row.3,
                document_sha256: row.4,
                kind: row.5,
                color_token: row.6,
                note_text: row.7,
                anchor: stored.anchor,
                resolution,
                resolved_anchor,
                status: if matches!(
                    resolution,
                    SideraDocumentEvidenceResolution::Exact
                        | SideraDocumentEvidenceResolution::Reanchored
                ) {
                    "active".to_string()
                } else {
                    "orphaned".to_string()
                },
                created_at_ms: row.10,
                updated_at_ms: row.11,
            })
        })
        .collect()
}

pub fn save_document_annotation(
    input: SideraDocumentAnnotationSaveInput,
) -> Result<SideraDocumentAnnotation, String> {
    let query = canonical_query(input.query)?;
    let annotation_id = clean_identity(
        &input.annotation_id,
        "SIDERA_DOCUMENT_ANNOTATION_ID_INVALID",
    )?;
    let (kind, color_token, note_text) =
        validate_annotation_fields(input.kind, input.color_token, input.note_text)?;
    let anchor = validate_persistent_anchor(reader_query(&query), &input.anchor)?;
    let anchor_json = serialize_anchor(&PersistentAnchorEnvelope {
        anchor: anchor.precise.clone(),
        canonical_baseline: anchor.canonical_baseline,
    })?;
    let connection = prepare_evidence_database(&query.library_directory)?;
    connection
        .execute(
            "INSERT INTO annotations(
               id,project_id,paper_id,document_version_id,document_sha256,kind,color_token,
               note_text,anchor_json,anchor_id,status,created_at_ms,updated_at_ms
             ) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,'active',?11,?11)
             ON CONFLICT(id) DO UPDATE SET
               kind=excluded.kind,color_token=excluded.color_token,note_text=excluded.note_text,
               anchor_json=excluded.anchor_json,anchor_id=excluded.anchor_id,status='active',
               updated_at_ms=excluded.updated_at_ms
             WHERE annotations.project_id=excluded.project_id
               AND annotations.paper_id=excluded.paper_id
               AND annotations.document_version_id=excluded.document_version_id
               AND annotations.document_sha256=excluded.document_sha256",
            params![
                annotation_id,
                query.project_id,
                query.paper_id,
                query.document_version_id,
                anchor.precise.document_sha256,
                kind,
                color_token,
                note_text,
                anchor_json,
                anchor.precise.id,
                input.now_ms
            ],
        )
        .map_err(|_| "SIDERA_DOCUMENT_ANNOTATION_WRITE_FAILED".to_string())?;
    find_document_annotation(
        query,
        &annotation_id,
        "SIDERA_DOCUMENT_ANNOTATION_WRITE_FAILED",
    )
}

fn validate_annotation_fields(
    kind: String,
    color_token: String,
    note_text: Option<String>,
) -> Result<(String, String, Option<String>), String> {
    let kind = match kind.trim() {
        "highlight" | "note" => kind.trim().to_string(),
        _ => return Err("SIDERA_DOCUMENT_ANNOTATION_KIND_INVALID".to_string()),
    };
    let color_token = match color_token.trim() {
        "yellow" | "blue" | "green" | "rose" => color_token.trim().to_string(),
        _ => return Err("SIDERA_DOCUMENT_ANNOTATION_COLOR_INVALID".to_string()),
    };
    let note_text = clean_optional_text(
        note_text,
        64 * 1024,
        "SIDERA_DOCUMENT_ANNOTATION_NOTE_INVALID",
    )?;
    if kind == "note" && note_text.as_deref().unwrap_or_default().is_empty() {
        return Err("SIDERA_DOCUMENT_ANNOTATION_NOTE_REQUIRED".to_string());
    }
    Ok((kind, color_token, note_text))
}

fn find_document_annotation(
    query: SideraDocumentEvidenceQuery,
    annotation_id: &str,
    missing_code: &str,
) -> Result<SideraDocumentAnnotation, String> {
    list_document_annotations(query)?
        .into_iter()
        .find(|value| value.id == annotation_id)
        .ok_or_else(|| missing_code.to_string())
}

pub fn create_document_annotation(
    input: SideraDocumentAnnotationSaveInput,
) -> Result<SideraDocumentAnnotation, String> {
    let query = canonical_query(input.query)?;
    let annotation_id = clean_identity(
        &input.annotation_id,
        "SIDERA_DOCUMENT_ANNOTATION_ID_INVALID",
    )?;
    let (kind, color_token, note_text) =
        validate_annotation_fields(input.kind, input.color_token, input.note_text)?;
    let anchor = validate_persistent_anchor(reader_query(&query), &input.anchor)?;
    let anchor_json = serialize_anchor(&PersistentAnchorEnvelope {
        anchor: anchor.precise.clone(),
        canonical_baseline: anchor.canonical_baseline,
    })?;
    let connection = prepare_evidence_database(&query.library_directory)?;
    let inserted = connection.execute(
        "INSERT INTO annotations(
           id,project_id,paper_id,document_version_id,document_sha256,kind,color_token,
           note_text,anchor_json,anchor_id,status,created_at_ms,updated_at_ms
         ) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,'active',?11,?11)",
        params![
            annotation_id,
            query.project_id,
            query.paper_id,
            query.document_version_id,
            anchor.precise.document_sha256,
            kind,
            color_token,
            note_text,
            anchor_json,
            anchor.precise.id,
            input.now_ms
        ],
    );
    if inserted.is_err() {
        let exists = connection
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM annotations WHERE id=?1)",
                params![annotation_id],
                |row| row.get::<_, i64>(0),
            )
            .map_err(|_| "SIDERA_DOCUMENT_ANNOTATION_WRITE_FAILED".to_string())?
            != 0;
        return Err(if exists {
            "SIDERA_DOCUMENT_ANNOTATION_ALREADY_EXISTS".to_string()
        } else {
            "SIDERA_DOCUMENT_ANNOTATION_WRITE_FAILED".to_string()
        });
    }
    find_document_annotation(
        query,
        &annotation_id,
        "SIDERA_DOCUMENT_ANNOTATION_WRITE_FAILED",
    )
}

pub fn update_document_annotation(
    input: SideraDocumentAnnotationUpdateInput,
) -> Result<SideraDocumentAnnotation, String> {
    let query = canonical_query(input.query)?;
    let annotation_id = clean_identity(
        &input.annotation_id,
        "SIDERA_DOCUMENT_ANNOTATION_ID_INVALID",
    )?;
    let (kind, color_token, note_text) =
        validate_annotation_fields(input.kind, input.color_token, input.note_text)?;
    let connection = prepare_evidence_database(&query.library_directory)?;
    let changed = connection
        .execute(
            "UPDATE annotations SET kind=?5,color_token=?6,note_text=?7,updated_at_ms=?8
             WHERE id=?1 AND project_id=?2 AND paper_id=?3 AND document_version_id=?4",
            params![
                annotation_id,
                query.project_id,
                query.paper_id,
                query.document_version_id,
                kind,
                color_token,
                note_text,
                input.now_ms
            ],
        )
        .map_err(|_| "SIDERA_DOCUMENT_ANNOTATION_WRITE_FAILED".to_string())?;
    if changed == 0 {
        return Err("SIDERA_DOCUMENT_ANNOTATION_NOT_FOUND".to_string());
    }
    find_document_annotation(
        query,
        &annotation_id,
        "SIDERA_DOCUMENT_ANNOTATION_NOT_FOUND",
    )
}

pub fn delete_document_annotation(
    query: SideraDocumentEvidenceQuery,
    annotation_id: &str,
) -> Result<bool, String> {
    let query = canonical_query(query)?;
    let annotation_id = clean_identity(annotation_id, "SIDERA_DOCUMENT_ANNOTATION_ID_INVALID")?;
    let path = document_evidence_database_path(&query.library_directory);
    if !path.is_file() {
        return Ok(false);
    }
    let connection = prepare_evidence_database(&query.library_directory)?;
    connection
        .execute(
            "DELETE FROM annotations
             WHERE id=?1 AND project_id=?2 AND paper_id=?3 AND document_version_id=?4",
            params![
                annotation_id,
                query.project_id,
                query.paper_id,
                query.document_version_id
            ],
        )
        .map(|changed| changed > 0)
        .map_err(|_| "SIDERA_DOCUMENT_ANNOTATION_DELETE_FAILED".to_string())
}

pub fn list_document_saved_evidence(
    query: SideraDocumentEvidenceQuery,
) -> Result<Vec<SideraDocumentSavedEvidence>, String> {
    let query = canonical_query(query)?;
    let Some(connection) = open_evidence_read(&query.library_directory)? else {
        return Ok(Vec::new());
    };
    let mut statement = connection
        .prepare(
            "SELECT id,project_id,paper_id,document_version_id,document_sha256,label,note_text,
                    anchor_json,status,created_at_ms,updated_at_ms
             FROM saved_evidence WHERE project_id=?1 AND paper_id=?2 AND document_version_id=?3
             ORDER BY updated_at_ms DESC,id",
        )
        .map_err(|_| "SIDERA_DOCUMENT_SAVED_EVIDENCE_READ_FAILED".to_string())?;
    let rows = statement
        .query_map(
            params![query.project_id, query.paper_id, query.document_version_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, Option<String>>(5)?,
                    row.get::<_, Option<String>>(6)?,
                    row.get::<_, String>(7)?,
                    row.get::<_, String>(8)?,
                    row.get::<_, i64>(9)?,
                    row.get::<_, i64>(10)?,
                ))
            },
        )
        .map_err(|_| "SIDERA_DOCUMENT_SAVED_EVIDENCE_READ_FAILED".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "SIDERA_DOCUMENT_SAVED_EVIDENCE_READ_FAILED".to_string())?;
    rows.into_iter()
        .map(|row| {
            let stored = parse_anchor(row.7)?;
            let (resolution, resolved_anchor) = resolve_anchor(&query, &stored)?;
            Ok(SideraDocumentSavedEvidence {
                id: row.0,
                project_id: row.1,
                paper_id: row.2,
                document_version_id: row.3,
                document_sha256: row.4,
                label: row.5,
                note_text: row.6,
                anchor: stored.anchor,
                resolution,
                resolved_anchor,
                status: if matches!(
                    resolution,
                    SideraDocumentEvidenceResolution::Exact
                        | SideraDocumentEvidenceResolution::Reanchored
                ) {
                    "active".to_string()
                } else {
                    "orphaned".to_string()
                },
                created_at_ms: row.9,
                updated_at_ms: row.10,
            })
        })
        .collect()
}

pub fn save_document_saved_evidence(
    input: SideraDocumentSavedEvidenceSaveInput,
) -> Result<SideraDocumentSavedEvidence, String> {
    let query = canonical_query(input.query)?;
    let evidence_id = clean_identity(
        &input.evidence_id,
        "SIDERA_DOCUMENT_SAVED_EVIDENCE_ID_INVALID",
    )?;
    let label = clean_optional_text(
        input.label,
        512,
        "SIDERA_DOCUMENT_SAVED_EVIDENCE_LABEL_INVALID",
    )?;
    let note_text = clean_optional_text(
        input.note_text,
        64 * 1024,
        "SIDERA_DOCUMENT_SAVED_EVIDENCE_NOTE_INVALID",
    )?;
    let anchor = validate_persistent_anchor(reader_query(&query), &input.anchor)?;
    let anchor_json = serialize_anchor(&PersistentAnchorEnvelope {
        anchor: anchor.precise.clone(),
        canonical_baseline: anchor.canonical_baseline,
    })?;
    let connection = prepare_evidence_database(&query.library_directory)?;
    connection
        .execute(
            "INSERT INTO saved_evidence(
               id,project_id,paper_id,document_version_id,document_sha256,label,note_text,
               anchor_json,anchor_id,status,created_at_ms,updated_at_ms
             ) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,'active',?10,?10)
             ON CONFLICT(id) DO UPDATE SET
               label=excluded.label,note_text=excluded.note_text,anchor_json=excluded.anchor_json,
               anchor_id=excluded.anchor_id,status='active',updated_at_ms=excluded.updated_at_ms
             WHERE saved_evidence.project_id=excluded.project_id
               AND saved_evidence.paper_id=excluded.paper_id
               AND saved_evidence.document_version_id=excluded.document_version_id
               AND saved_evidence.document_sha256=excluded.document_sha256",
            params![
                evidence_id,
                query.project_id,
                query.paper_id,
                query.document_version_id,
                anchor.precise.document_sha256,
                label,
                note_text,
                anchor_json,
                anchor.precise.id,
                input.now_ms
            ],
        )
        .map_err(|_| "SIDERA_DOCUMENT_SAVED_EVIDENCE_WRITE_FAILED".to_string())?;
    list_document_saved_evidence(query)?
        .into_iter()
        .find(|value| value.id == evidence_id)
        .ok_or_else(|| "SIDERA_DOCUMENT_SAVED_EVIDENCE_WRITE_FAILED".to_string())
}

pub fn delete_document_saved_evidence(
    query: SideraDocumentEvidenceQuery,
    evidence_id: &str,
) -> Result<bool, String> {
    let query = canonical_query(query)?;
    let evidence_id = clean_identity(evidence_id, "SIDERA_DOCUMENT_SAVED_EVIDENCE_ID_INVALID")?;
    let path = document_evidence_database_path(&query.library_directory);
    if !path.is_file() {
        return Ok(false);
    }
    let connection = prepare_evidence_database(&query.library_directory)?;
    connection
        .execute(
            "DELETE FROM saved_evidence
             WHERE id=?1 AND project_id=?2 AND paper_id=?3 AND document_version_id=?4",
            params![
                evidence_id,
                query.project_id,
                query.paper_id,
                query.document_version_id
            ],
        )
        .map(|changed| changed > 0)
        .map_err(|_| "SIDERA_DOCUMENT_SAVED_EVIDENCE_DELETE_FAILED".to_string())
}

const DOCUMENT_SOURCE_PREFERENCE_DOCUMENT_DEFAULT: i64 = -1;

pub fn document_source_preference(
    query: SideraDocumentEvidenceQuery,
    page_index: Option<u32>,
) -> Result<Option<SideraDocumentSourcePreference>, String> {
    let query = canonical_query(query)?;
    let Some(connection) = open_evidence_read(&query.library_directory)? else {
        return Ok(None);
    };
    let page_key = page_index
        .map(i64::from)
        .unwrap_or(DOCUMENT_SOURCE_PREFERENCE_DOCUMENT_DEFAULT);
    connection
        .query_row(
            "SELECT preference,updated_at_ms FROM source_preferences
             WHERE project_id=?1 AND paper_id=?2 AND document_version_id=?3 AND page_index=?4",
            params![
                query.project_id,
                query.paper_id,
                query.document_version_id,
                page_key
            ],
            |row| {
                Ok(SideraDocumentSourcePreference {
                    document_version_id: query.document_version_id.clone(),
                    page_index,
                    preference: row.get(0)?,
                    updated_at_ms: row.get(1)?,
                })
            },
        )
        .optional()
        .map_err(|_| "SIDERA_DOCUMENT_SOURCE_PREFERENCE_READ_FAILED".to_string())
}

pub fn save_document_source_preference(
    input: SideraDocumentSourcePreferenceSaveInput,
) -> Result<SideraDocumentSourcePreference, String> {
    let query = canonical_query(input.query)?;
    if input.page_index.is_some_and(|value| value >= 300) {
        return Err("SIDERA_DOCUMENT_SOURCE_PREFERENCE_PAGE_INVALID".to_string());
    }
    let preference = match input.preference.trim() {
        "auto" | "native" | "ocr" => input.preference.trim().to_string(),
        _ => return Err("SIDERA_DOCUMENT_SOURCE_PREFERENCE_INVALID".to_string()),
    };
    // Validates the immutable document/version fence through the read-only store.
    if let Some(page_index) = input.page_index {
        crate::document_derived::document_page_text(reader_query(&query), page_index)?;
    } else {
        // Page zero may not exist while a parse is absent. A document-level preference
        // remains valid, but only after the version identity itself is proven by the
        // reader manifest path.
        let _ = crate::document_derived::document_reader_manifest(reader_query(&query))?;
    }
    let page_key = input
        .page_index
        .map(i64::from)
        .unwrap_or(DOCUMENT_SOURCE_PREFERENCE_DOCUMENT_DEFAULT);
    let connection = prepare_evidence_database(&query.library_directory)?;
    connection
        .execute(
            "INSERT INTO source_preferences(
               project_id,paper_id,document_version_id,page_index,preference,updated_at_ms
             ) VALUES(?1,?2,?3,?4,?5,?6)
             ON CONFLICT(project_id,paper_id,document_version_id,page_index) DO UPDATE SET
               preference=excluded.preference,updated_at_ms=excluded.updated_at_ms",
            params![
                query.project_id,
                query.paper_id,
                query.document_version_id,
                page_key,
                preference,
                input.now_ms
            ],
        )
        .map_err(|_| "SIDERA_DOCUMENT_SOURCE_PREFERENCE_WRITE_FAILED".to_string())?;
    document_source_preference(query, input.page_index)?
        .ok_or_else(|| "SIDERA_DOCUMENT_SOURCE_PREFERENCE_WRITE_FAILED".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::document_derived::{
        finalize_document_parse, start_document_parse, submit_document_parse_page,
        SideraDocumentParsePageInput, SideraDocumentParseRunQuery, SideraDocumentParseStartInput,
        SideraDocumentTextSpanInput,
    };
    use crate::document_store::{document_store_database_path, DOCUMENT_STORE_DIRECTORY};
    use rusqlite::Connection;
    use sha2::{Digest, Sha256};
    use std::sync::atomic::{AtomicU64, Ordering};

    static NEXT_FIXTURE: AtomicU64 = AtomicU64::new(1);

    fn sha256_hex(bytes: &[u8]) -> String {
        let mut digest = Sha256::new();
        digest.update(bytes);
        format!("{:x}", digest.finalize())
    }

    fn fixture() -> (
        PathBuf,
        SideraDocumentEvidenceQuery,
        SideraDocumentEvidenceAnchor,
    ) {
        let root = std::env::temp_dir().join(format!(
            "sidera-document-evidence-{}-{}",
            std::process::id(),
            NEXT_FIXTURE.fetch_add(1, Ordering::Relaxed)
        ));
        let _ = fs::remove_dir_all(&root);
        let blob_root = root
            .join("Sidera")
            .join(DOCUMENT_STORE_DIRECTORY)
            .join("blobs/ab");
        fs::create_dir_all(&blob_root).unwrap();
        let bytes = b"%PDF-1.7\nfixture\n%%EOF";
        let sha = sha256_hex(bytes);
        let rel = format!("blobs/ab/{sha}.pdf");
        fs::write(
            root.join("Sidera")
                .join(DOCUMENT_STORE_DIRECTORY)
                .join(&rel),
            bytes,
        )
        .unwrap();
        let store = Connection::open(document_store_database_path(&root)).unwrap();
        store
            .execute_batch(
                "CREATE TABLE documents(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,paper_id TEXT NOT NULL);
                 CREATE TABLE document_versions(
                   id TEXT PRIMARY KEY,document_id TEXT NOT NULL,sha256 TEXT NOT NULL,mime_type TEXT NOT NULL,
                   byte_size INTEGER NOT NULL,storage_rel_path TEXT NOT NULL,original_file_name TEXT,
                   version_kind TEXT NOT NULL
                 );",
            )
            .unwrap();
        store
            .execute(
                "INSERT INTO documents VALUES('document-1','project','paper')",
                [],
            )
            .unwrap();
        store
            .execute(
                "INSERT INTO document_versions VALUES('version-1','document-1',?1,'application/pdf',?2,?3,NULL,'user-import')",
                params![sha, bytes.len() as i64, rel],
            )
            .unwrap();
        let started = start_document_parse(SideraDocumentParseStartInput {
            library_directory: root.clone(),
            project_id: "project".to_string(),
            paper_id: "paper".to_string(),
            document_version_id: "version-1".to_string(),
            expected_sha256: sha.clone(),
            parser_version: "pdfjs-evidence".to_string(),
            page_count: 1,
            now_ms: 1,
        })
        .unwrap();
        let run = SideraDocumentParseRunQuery {
            library_directory: root.clone(),
            project_id: "project".to_string(),
            paper_id: "paper".to_string(),
            document_version_id: "version-1".to_string(),
            run_id: started.run_id,
            document_sha256: sha,
            parser_version: "pdfjs-evidence".to_string(),
        };
        submit_document_parse_page(SideraDocumentParsePageInput {
            run: run.clone(),
            page_index: 0,
            page_label: "1".to_string(),
            width: 100.0,
            height: 100.0,
            text: "A🧠文 exact evidence Z".to_string(),
            spans: vec![SideraDocumentTextSpanInput {
                text: "exact evidence".to_string(),
                start_offset_utf16: 5,
                end_offset_utf16: 19,
                x: 0.1,
                y: 0.2,
                width: 0.3,
                height: 0.04,
            }],
            now_ms: 2,
        })
        .unwrap();
        finalize_document_parse(run, 3).unwrap();
        let query = SideraDocumentEvidenceQuery {
            library_directory: root.clone(),
            project_id: "project".to_string(),
            paper_id: "paper".to_string(),
            document_version_id: "version-1".to_string(),
        };
        let page = crate::document_derived::document_page_text(reader_query(&query), 0).unwrap();
        let anchor = crate::document_derived::evidence_anchor_from_page(&page, 5, 19).unwrap();
        (root, query, anchor)
    }

    #[test]
    fn annotations_and_saved_evidence_are_durable_and_do_not_touch_the_library() {
        let (root, query, anchor) = fixture();
        let mut precise_anchor = anchor.clone();
        precise_anchor.rects = vec![crate::document_derived::SideraDocumentEvidenceRect {
            x: 0.11,
            y: 0.2,
            width: 0.28,
            height: 0.04,
        }];
        let store_path = document_store_database_path(&root);
        let before = fs::read(&store_path).unwrap();
        let annotation = save_document_annotation(SideraDocumentAnnotationSaveInput {
            query: query.clone(),
            annotation_id: "annotation-1".to_string(),
            kind: "highlight".to_string(),
            color_token: "yellow".to_string(),
            note_text: None,
            anchor: precise_anchor.clone(),
            now_ms: 10,
        })
        .unwrap();
        assert_eq!(annotation.anchor.id, anchor.id);
        assert_eq!(annotation.anchor.rects, precise_anchor.rects);
        assert_eq!(
            annotation.resolution,
            SideraDocumentEvidenceResolution::Exact
        );
        assert_eq!(annotation.resolved_anchor.as_ref(), Some(&precise_anchor));
        assert_eq!(list_document_annotations(query.clone()).unwrap().len(), 1);
        let saved = save_document_saved_evidence(SideraDocumentSavedEvidenceSaveInput {
            query: query.clone(),
            evidence_id: "evidence-1".to_string(),
            label: Some("核心证据".to_string()),
            note_text: None,
            anchor,
            now_ms: 11,
        })
        .unwrap();
        assert_eq!(saved.label.as_deref(), Some("核心证据"));
        assert_eq!(
            list_document_saved_evidence(query.clone()).unwrap().len(),
            1
        );
        drop(open_evidence_read(&root).unwrap());
        assert_eq!(fs::read(store_path).unwrap(), before);
        assert!(delete_document_annotation(query.clone(), "annotation-1").unwrap());
        assert!(delete_document_saved_evidence(query, "evidence-1").unwrap());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn evidence_database_survives_derived_rebuild_and_reanchors_afterward() {
        let (root, query, mut anchor) = fixture();
        anchor.rects[0].x = 0.11;
        anchor.rects[0].width = 0.28;
        save_document_annotation(SideraDocumentAnnotationSaveInput {
            query: query.clone(),
            annotation_id: "durable-annotation".to_string(),
            kind: "highlight".to_string(),
            color_token: "blue".to_string(),
            note_text: None,
            anchor: anchor.clone(),
            now_ms: 30,
        })
        .unwrap();
        let evidence_path = document_evidence_database_path(&root);
        assert!(evidence_path.is_file());

        fs::remove_file(crate::document_derived::document_derived_database_path(
            &root,
        ))
        .unwrap();
        let missing = list_document_annotations(query.clone()).unwrap();
        assert_eq!(missing.len(), 1);
        assert_eq!(missing[0].anchor, anchor);
        assert_eq!(
            missing[0].resolution,
            SideraDocumentEvidenceResolution::Missing
        );
        assert!(evidence_path.is_file());

        let started = start_document_parse(SideraDocumentParseStartInput {
            library_directory: root.clone(),
            project_id: "project".to_string(),
            paper_id: "paper".to_string(),
            document_version_id: "version-1".to_string(),
            expected_sha256: anchor.document_sha256.clone(),
            parser_version: "pdfjs-evidence-rebuild".to_string(),
            page_count: 1,
            now_ms: 31,
        })
        .unwrap();
        let run = SideraDocumentParseRunQuery {
            library_directory: root.clone(),
            project_id: "project".to_string(),
            paper_id: "paper".to_string(),
            document_version_id: "version-1".to_string(),
            run_id: started.run_id,
            document_sha256: anchor.document_sha256.clone(),
            parser_version: "pdfjs-evidence-rebuild".to_string(),
        };
        submit_document_parse_page(SideraDocumentParsePageInput {
            run: run.clone(),
            page_index: 0,
            page_label: "1".to_string(),
            width: 100.0,
            height: 100.0,
            text: "x A🧠文 exact evidence Z".to_string(),
            spans: vec![SideraDocumentTextSpanInput {
                text: "exact evidence".to_string(),
                start_offset_utf16: 7,
                end_offset_utf16: 21,
                x: 0.15,
                y: 0.2,
                width: 0.3,
                height: 0.04,
            }],
            now_ms: 32,
        })
        .unwrap();
        finalize_document_parse(run, 33).unwrap();

        let reanchored = list_document_annotations(query).unwrap();
        assert_eq!(reanchored.len(), 1);
        assert_eq!(reanchored[0].anchor, anchor);
        assert_eq!(
            reanchored[0].resolution,
            SideraDocumentEvidenceResolution::Reanchored
        );
        let current = reanchored[0].resolved_anchor.as_ref().unwrap();
        assert_eq!(current.start_offset_utf16, 7);
        assert_eq!(current.rects.len(), 1);
        assert!(current.rects[0].width < 0.31);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn persistent_anchor_rejects_context_and_untrusted_geometry() {
        let (root, query, anchor) = fixture();
        let mut wrong_context = anchor.clone();
        wrong_context.prefix.push('x');
        assert_eq!(
            validate_persistent_anchor(reader_query(&query), &wrong_context).unwrap_err(),
            "SIDERA_DOCUMENT_EVIDENCE_CONTEXT_MISMATCH"
        );

        let mut non_finite = anchor.clone();
        non_finite.rects[0].x = f64::NAN;
        assert_eq!(
            validate_persistent_anchor(reader_query(&query), &non_finite).unwrap_err(),
            "SIDERA_DOCUMENT_EVIDENCE_RECTS_INVALID"
        );

        let mut far_away = anchor.clone();
        far_away.rects[0].x = 0.8;
        far_away.rects[0].width = 0.1;
        assert_eq!(
            validate_persistent_anchor(reader_query(&query), &far_away).unwrap_err(),
            "SIDERA_DOCUMENT_EVIDENCE_RECTS_INVALID"
        );

        let mut too_many = anchor;
        too_many.rects = vec![
            crate::document_derived::SideraDocumentEvidenceRect {
                x: 0.1,
                y: 0.2,
                width: 0.01,
                height: 0.01,
            };
            DOCUMENT_EVIDENCE_MAX_RECTS + 1
        ];
        assert_eq!(
            validate_persistent_anchor(reader_query(&query), &too_many).unwrap_err(),
            "SIDERA_DOCUMENT_EVIDENCE_RECTS_INVALID"
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn persistent_anchor_accepts_precise_proportional_geometry_inside_source_span() {
        let (root, query, _) = fixture();
        let page = crate::document_derived::document_page_text(reader_query(&query), 0).unwrap();
        let mut anchor = crate::document_derived::evidence_anchor_from_page(&page, 11, 19).unwrap();
        anchor.rects = vec![crate::document_derived::SideraDocumentEvidenceRect {
            x: 0.19,
            y: 0.2,
            width: 0.2,
            height: 0.04,
        }];

        let validated = validate_persistent_anchor(reader_query(&query), &anchor).unwrap();
        assert_eq!(validated.precise.rects, anchor.rects);
        assert_ne!(validated.canonical_baseline.rects, anchor.rects);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn annotation_create_update_are_scoped_and_legacy_anchor_json_still_reads() {
        let (root, query, anchor) = fixture();
        let created = create_document_annotation(SideraDocumentAnnotationSaveInput {
            query: query.clone(),
            annotation_id: "create-update".to_string(),
            kind: "highlight".to_string(),
            color_token: "yellow".to_string(),
            note_text: None,
            anchor: anchor.clone(),
            now_ms: 40,
        })
        .unwrap();
        assert_eq!(created.created_at_ms, 40);
        assert_eq!(created.anchor, anchor);
        let duplicate = create_document_annotation(SideraDocumentAnnotationSaveInput {
            query: query.clone(),
            annotation_id: "create-update".to_string(),
            kind: "highlight".to_string(),
            color_token: "blue".to_string(),
            note_text: None,
            anchor: anchor.clone(),
            now_ms: 41,
        })
        .unwrap_err();
        assert_eq!(duplicate, "SIDERA_DOCUMENT_ANNOTATION_ALREADY_EXISTS");

        let updated = update_document_annotation(SideraDocumentAnnotationUpdateInput {
            query: query.clone(),
            annotation_id: "create-update".to_string(),
            kind: "note".to_string(),
            color_token: "green".to_string(),
            note_text: Some("kept on the original anchor".to_string()),
            now_ms: 42,
        })
        .unwrap();
        assert_eq!(updated.created_at_ms, 40);
        assert_eq!(updated.updated_at_ms, 42);
        assert_eq!(updated.anchor, anchor);
        assert_eq!(updated.kind, "note");
        assert_eq!(updated.color_token, "green");
        assert_eq!(
            update_document_annotation(SideraDocumentAnnotationUpdateInput {
                query: query.clone(),
                annotation_id: "missing".to_string(),
                kind: "highlight".to_string(),
                color_token: "yellow".to_string(),
                note_text: None,
                now_ms: 43,
            })
            .unwrap_err(),
            "SIDERA_DOCUMENT_ANNOTATION_NOT_FOUND"
        );

        let database = document_evidence_database_path(&root);
        let connection = Connection::open(&database).unwrap();
        let envelope: String = connection
            .query_row(
                "SELECT anchor_json FROM annotations WHERE id='create-update'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let envelope: serde_json::Value = serde_json::from_str(&envelope).unwrap();
        assert!(envelope.get("anchor").is_some());
        assert!(envelope.get("canonicalBaseline").is_some());
        connection
            .execute(
                "UPDATE annotations SET anchor_json=?2 WHERE id=?1",
                params!["create-update", serde_json::to_string(&anchor).unwrap()],
            )
            .unwrap();
        drop(connection);
        let legacy = list_document_annotations(query).unwrap();
        assert_eq!(legacy.len(), 1);
        assert_eq!(legacy[0].anchor, anchor);
        assert_eq!(
            legacy[0].resolution,
            SideraDocumentEvidenceResolution::Exact
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn source_preference_round_trips_with_document_and_page_scope() {
        let (root, query, _) = fixture();
        let document = save_document_source_preference(SideraDocumentSourcePreferenceSaveInput {
            query: query.clone(),
            page_index: None,
            preference: "auto".to_string(),
            now_ms: 20,
        })
        .unwrap();
        assert_eq!(document.page_index, None);
        let page = save_document_source_preference(SideraDocumentSourcePreferenceSaveInput {
            query: query.clone(),
            page_index: Some(0),
            preference: "native".to_string(),
            now_ms: 21,
        })
        .unwrap();
        assert_eq!(page.page_index, Some(0));
        assert_eq!(
            document_source_preference(query, Some(0))
                .unwrap()
                .unwrap()
                .preference,
            "native"
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn reanchor_uses_quote_context_and_rect_without_silently_picking_ambiguous_matches() {
        let page = crate::document_derived::SideraDocumentPageText {
            document_version_id: "version".to_string(),
            document_sha256: "a".repeat(64),
            page_index: 0,
            page_label: "1".to_string(),
            source_kind: "native".to_string(),
            text: "xxquoteyy".to_string(),
            text_sha256: sha256_hex(b"xxquoteyy"),
            text_length_utf16: 9,
            spans: vec![crate::document_derived::SideraDocumentPageTextSpan {
                text: "xxquoteyy".to_string(),
                start_offset_utf16: 0,
                end_offset_utf16: 9,
                x: 0.1,
                y: 0.2,
                width: 0.36,
                height: 0.04,
            }],
        };
        let baseline = evidence_anchor_from_page(&page, 2, 7).unwrap();
        let mut precise = baseline.clone();
        precise.rects = vec![crate::document_derived::SideraDocumentEvidenceRect {
            x: 0.185,
            y: 0.2,
            width: 0.19,
            height: 0.04,
        }];
        let stored = StoredPersistentAnchor {
            anchor: precise.clone(),
            canonical_baseline: Some(baseline.clone()),
        };
        let (resolution, resolved) = resolve_anchor_in_page(&stored, &page).unwrap();
        assert_eq!(resolution, SideraDocumentEvidenceResolution::Exact);
        assert_eq!(resolved.as_ref(), Some(&precise));

        let layout_shifted = crate::document_derived::SideraDocumentPageText {
            spans: vec![crate::document_derived::SideraDocumentPageTextSpan {
                text: "xxquoteyy".to_string(),
                start_offset_utf16: 0,
                end_offset_utf16: 9,
                x: 0.2,
                y: 0.2,
                width: 0.54,
                height: 0.04,
            }],
            ..page.clone()
        };
        let (resolution, resolved) = resolve_anchor_in_page(&stored, &layout_shifted).unwrap();
        assert_eq!(resolution, SideraDocumentEvidenceResolution::Reanchored);
        let projected = resolved.unwrap();
        assert!(projected.rects[0].width < layout_shifted.spans[0].width);
        assert!((projected.rects[0].width - 0.285).abs() < 0.000_001);

        let shifted = crate::document_derived::SideraDocumentPageText {
            text: "z xxquoteyy".to_string(),
            text_sha256: sha256_hex(b"z xxquoteyy"),
            text_length_utf16: 11,
            spans: vec![crate::document_derived::SideraDocumentPageTextSpan {
                text: "z xxquoteyy".to_string(),
                start_offset_utf16: 0,
                end_offset_utf16: 11,
                x: 0.2,
                y: 0.2,
                width: 0.44,
                height: 0.04,
            }],
            ..page.clone()
        };
        let (resolution, resolved) = resolve_anchor_in_page(&stored, &shifted).unwrap();
        assert_eq!(resolution, SideraDocumentEvidenceResolution::Reanchored);
        let projected = resolved.unwrap();
        assert_eq!(projected.start_offset_utf16, 4);
        assert!(projected.rects[0].width < shifted.spans[0].width);

        let far_shifted = crate::document_derived::SideraDocumentPageText {
            spans: vec![crate::document_derived::SideraDocumentPageTextSpan {
                text: "z xxquoteyy".to_string(),
                start_offset_utf16: 0,
                end_offset_utf16: 11,
                x: 0.7,
                y: 0.7,
                width: 0.22,
                height: 0.04,
            }],
            ..shifted.clone()
        };
        let (resolution, resolved) = resolve_anchor_in_page(&stored, &far_shifted).unwrap();
        assert_eq!(resolution, SideraDocumentEvidenceResolution::Ambiguous);
        assert!(resolved.is_none());

        let missing = crate::document_derived::SideraDocumentPageText {
            text: "different".to_string(),
            text_sha256: sha256_hex(b"different"),
            text_length_utf16: 9,
            spans: Vec::new(),
            ..page.clone()
        };
        let (resolution, resolved) = resolve_anchor_in_page(&stored, &missing).unwrap();
        assert_eq!(resolution, SideraDocumentEvidenceResolution::Missing);
        assert!(resolved.is_none());

        let mut context_free = stored;
        context_free.anchor.prefix.clear();
        context_free.anchor.suffix.clear();
        context_free.anchor.rects.clear();
        let context_free_baseline = context_free.canonical_baseline.as_mut().unwrap();
        context_free_baseline.prefix.clear();
        context_free_baseline.suffix.clear();
        context_free_baseline.rects.clear();
        let ambiguous = crate::document_derived::SideraDocumentPageText {
            text: "quote quote".to_string(),
            text_sha256: sha256_hex(b"quote quote"),
            text_length_utf16: 11,
            spans: Vec::new(),
            ..page
        };
        let (resolution, resolved) = resolve_anchor_in_page(&context_free, &ambiguous).unwrap();
        assert_eq!(resolution, SideraDocumentEvidenceResolution::Ambiguous);
        assert!(resolved.is_none());
    }

    #[test]
    fn quote_scanning_keeps_utf8_overlaps_bounded_and_overflow_is_ambiguous() {
        assert_eq!(
            quote_occurrences("aaaa", "aaa"),
            QuoteOccurrences {
                ranges: vec![(0, 3), (1, 4)],
                overflowed: false,
            }
        );
        assert_eq!(
            quote_occurrences("文文文", "文文"),
            QuoteOccurrences {
                ranges: vec![(0, 2), (1, 3)],
                overflowed: false,
            }
        );
        let repeated = format!(
            "x{}",
            "a".repeat(DOCUMENT_EVIDENCE_MAX_QUOTE_CANDIDATES + 8)
        );
        let scan = quote_occurrences(&repeated, "aaa");
        assert!(scan.overflowed);
        assert_eq!(scan.ranges.len(), DOCUMENT_EVIDENCE_MAX_QUOTE_CANDIDATES);

        let original = crate::document_derived::SideraDocumentPageText {
            document_version_id: "version".to_string(),
            document_sha256: "b".repeat(64),
            page_index: 0,
            page_label: "1".to_string(),
            source_kind: "native".to_string(),
            text: "aaa".to_string(),
            text_sha256: sha256_hex(b"aaa"),
            text_length_utf16: 3,
            spans: Vec::new(),
        };
        let anchor = evidence_anchor_from_page(&original, 0, 3).unwrap();
        let stored = StoredPersistentAnchor {
            anchor: anchor.clone(),
            canonical_baseline: Some(anchor),
        };
        let crowded = crate::document_derived::SideraDocumentPageText {
            text_sha256: sha256_hex(repeated.as_bytes()),
            text_length_utf16: repeated.encode_utf16().count() as u32,
            text: repeated,
            ..original
        };
        let (resolution, resolved) = resolve_anchor_in_page(&stored, &crowded).unwrap();
        assert_eq!(resolution, SideraDocumentEvidenceResolution::Ambiguous);
        assert!(resolved.is_none());
    }

    #[test]
    fn same_offset_quote_with_changed_context_uses_candidate_disambiguation() {
        let baseline_page = crate::document_derived::SideraDocumentPageText {
            document_version_id: "version".to_string(),
            document_sha256: "c".repeat(64),
            page_index: 0,
            page_label: "1".to_string(),
            source_kind: "native".to_string(),
            text: "left quote target".to_string(),
            text_sha256: sha256_hex(b"left quote target"),
            text_length_utf16: 17,
            spans: vec![crate::document_derived::SideraDocumentPageTextSpan {
                text: "quote".to_string(),
                start_offset_utf16: 5,
                end_offset_utf16: 10,
                x: 0.1,
                y: 0.2,
                width: 0.1,
                height: 0.04,
            }],
        };
        let baseline = evidence_anchor_from_page(&baseline_page, 5, 10).unwrap();
        let mut precise = baseline.clone();
        precise.rects[0].x = 0.11;
        precise.rects[0].width = 0.08;
        let stored = StoredPersistentAnchor {
            anchor: precise,
            canonical_baseline: Some(baseline),
        };
        let current_text = "xxxx quote wrong | left quote target";
        let current = crate::document_derived::SideraDocumentPageText {
            text: current_text.to_string(),
            text_sha256: sha256_hex(current_text.as_bytes()),
            text_length_utf16: current_text.encode_utf16().count() as u32,
            spans: vec![
                crate::document_derived::SideraDocumentPageTextSpan {
                    text: "quote".to_string(),
                    start_offset_utf16: 5,
                    end_offset_utf16: 10,
                    x: 0.1,
                    y: 0.2,
                    width: 0.1,
                    height: 0.04,
                },
                crate::document_derived::SideraDocumentPageTextSpan {
                    text: "quote".to_string(),
                    start_offset_utf16: 24,
                    end_offset_utf16: 29,
                    x: 0.22,
                    y: 0.2,
                    width: 0.1,
                    height: 0.04,
                },
            ],
            ..baseline_page
        };
        let (resolution, resolved) = resolve_anchor_in_page(&stored, &current).unwrap();
        assert_eq!(resolution, SideraDocumentEvidenceResolution::Reanchored);
        let resolved = resolved.unwrap();
        assert_eq!(resolved.start_offset_utf16, 24);
        assert!((resolved.rects[0].x - 0.23).abs() < 0.000_001);
        assert!((resolved.rects[0].width - 0.08).abs() < 0.000_001);
    }
}
