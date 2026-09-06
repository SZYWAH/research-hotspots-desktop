use std::collections::{BTreeSet, HashSet};

use serde_json::{Map, Value};
use sha2::{Digest, Sha256};

use crate::institution_search::{
    SideraInstitutionAdapterRecord, SideraInstitutionFullTextStatus, SideraInstitutionRecordKind,
};
use crate::research_search::{
    ResearchSearchRetrievalPosition, ResearchSearchRetrievalPositionBasis,
    WHU_ACADEMIC_DISCOVERY_V2_CONNECTOR_ID,
};

pub const WHU_STRUCTURED_CONNECTOR_VERSION: &str = "whu-academic-discovery-v2-structured";
pub const STRUCTURED_ROUTE_UNAVAILABLE: &str = "SIDERA_RESEARCH_STRUCTURED_ROUTE_UNAVAILABLE";
pub const STRUCTURED_SCHEMA_DRIFT: &str = "SIDERA_RESEARCH_STRUCTURED_SCHEMA_DRIFT";
pub const STRUCTURED_BODY_TOO_LARGE: &str = "SIDERA_RESEARCH_STRUCTURED_BODY_TOO_LARGE";
pub const STRUCTURED_BODY_INVALID: &str = "SIDERA_RESEARCH_STRUCTURED_BODY_INVALID";
pub const DOM_FALLBACK_USED: &str = "SIDERA_RESEARCH_DOM_FALLBACK_USED";
pub const STRUCTURED_PAGINATION_METADATA_MISSING: &str =
    "SIDERA_RESEARCH_STRUCTURED_PAGINATION_METADATA_MISSING";
pub const STRUCTURED_PAGINATION_CONTROL_MISSING: &str =
    "SIDERA_RESEARCH_STRUCTURED_PAGINATION_CONTROL_MISSING";
pub const STRUCTURED_PAGINATION_STALLED: &str = "SIDERA_RESEARCH_STRUCTURED_PAGINATION_STALLED";
pub const STRUCTURED_PAGINATION_REGRESSED: &str = "SIDERA_RESEARCH_STRUCTURED_PAGINATION_REGRESSED";

pub const MAX_STRUCTURED_BODY_BYTES: usize = 512 * 1024;
const MAX_STRUCTURED_JSON_DEPTH: usize = 12;
const MAX_STRUCTURED_JSON_NODES: usize = 1_024;
const MAX_STRUCTURED_PRIMO_DOCS: usize = 100;
const PRIMO_SCHEMA_CONTRACT: &str = "primo-pnxs-v1|docs:array|docs.item:object|docs.item.pnx:object|docs.item.pnx.display:object|docs.item.pnx.display.title:string-array|info:object|info.total:usize|info.first:usize|info.last:usize";
pub const WHU_STRUCTURED_PRIMO_SCHEMA_SHA256: &str =
    "9ab016fe96f6abafad5e2ee1eabdac6faa8e5390eceb0b0d2c85175695239cb3";

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct WhuStructuredDiscoveryPage {
    pub records: Vec<SideraInstitutionAdapterRecord>,
    pub retrieval_positions: Vec<ResearchSearchRetrievalPosition>,
    pub page_number: Option<usize>,
    pub page_number_observed: bool,
    pub first_result: Option<usize>,
    pub last_result: Option<usize>,
    pub facet: Option<String>,
    pub total_hits: Option<usize>,
    pub has_more: Option<bool>,
    pub next_cursor: Option<String>,
    pub explicit_zero_results: bool,
    pub schema_sha256: String,
    pub page_identity: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WhuStructuredPageAdvance {
    Advanced,
    Duplicate,
    Regressed,
    MetadataMissing,
}

/// Classifies only official structured pagination truth. DOM state, request
/// parameters and inferred result counts are deliberately excluded.
pub fn classify_whu_structured_page_advance(
    previous: &WhuStructuredDiscoveryPage,
    candidate: &WhuStructuredDiscoveryPage,
) -> WhuStructuredPageAdvance {
    if candidate.page_identity == previous.page_identity {
        return WhuStructuredPageAdvance::Duplicate;
    }

    if previous.page_number_observed && candidate.page_number_observed {
        let (Some(previous_page), Some(candidate_page)) =
            (previous.page_number, candidate.page_number)
        else {
            return WhuStructuredPageAdvance::MetadataMissing;
        };
        if candidate_page == previous_page.saturating_add(1) {
            return WhuStructuredPageAdvance::Advanced;
        }
        return WhuStructuredPageAdvance::Regressed;
    }

    if let (
        Some(previous_first),
        Some(previous_last),
        Some(candidate_first),
        Some(candidate_last),
    ) = (
        previous.first_result,
        previous.last_result,
        candidate.first_result,
        candidate.last_result,
    ) {
        if candidate_first > previous_last && candidate_last >= candidate_first {
            return WhuStructuredPageAdvance::Advanced;
        }
        if candidate_first <= previous_first || candidate_last <= previous_last {
            return WhuStructuredPageAdvance::Regressed;
        }
    }

    if let (Some(previous_page), Some(candidate_page)) =
        (previous.page_number, candidate.page_number)
    {
        if candidate_page == previous_page.saturating_add(1) {
            return WhuStructuredPageAdvance::Advanced;
        }
        return WhuStructuredPageAdvance::Regressed;
    }

    WhuStructuredPageAdvance::MetadataMissing
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WhuStructuredParseError {
    BodyTooLarge,
    BodyInvalid,
    SchemaDrift,
}

impl WhuStructuredParseError {
    pub const fn code(self) -> &'static str {
        match self {
            Self::BodyTooLarge => STRUCTURED_BODY_TOO_LARGE,
            Self::BodyInvalid => STRUCTURED_BODY_INVALID,
            Self::SchemaDrift => STRUCTURED_SCHEMA_DRIFT,
        }
    }
}

pub fn parse_whu_structured_discovery_page(
    bytes: &[u8],
) -> Result<WhuStructuredDiscoveryPage, WhuStructuredParseError> {
    if bytes.len() > MAX_STRUCTURED_BODY_BYTES {
        return Err(WhuStructuredParseError::BodyTooLarge);
    }
    let value: Value =
        serde_json::from_slice(bytes).map_err(|_| WhuStructuredParseError::BodyInvalid)?;
    let schema_sha256 = if is_official_primo_payload(&value) {
        // Primo responses contain large vendor-owned enrichment/facet trees that
        // are not part of Sidera's extraction contract. The 512 KiB body limit
        // and depth-12 check still cover the complete JSON, while the 1,024-node
        // limit is applied to the allowlisted extraction projection.
        validate_json_depth(&value, 0)?;
        let projection = official_primo_budget_projection(&value)?;
        validate_json_budget(&projection, 0, &mut 0)?;
        debug_assert_eq!(
            sha256_hex(PRIMO_SCHEMA_CONTRACT.as_bytes()),
            WHU_STRUCTURED_PRIMO_SCHEMA_SHA256
        );
        WHU_STRUCTURED_PRIMO_SCHEMA_SHA256.to_string()
    } else {
        validate_json_budget(&value, 0, &mut 0)?;
        let schema = schema_value(&value);
        sha256_hex(&serde_json::to_vec(&schema).map_err(|_| WhuStructuredParseError::BodyInvalid)?)
    };
    let record_values = find_record_array(&value).ok_or(WhuStructuredParseError::SchemaDrift)?;
    let first_result = lookup_usize_recursive(&value, FIRST_RESULT_KEYS);
    let last_result = lookup_usize_recursive(&value, LAST_RESULT_KEYS);
    let observed_page_number = lookup_usize_recursive(&value, PAGE_NUMBER_KEYS);
    let page_number = observed_page_number.or_else(|| {
        let first = first_result?;
        let page_size = last_result
            .and_then(|last| last.checked_sub(first))
            .map(|span| span.saturating_add(1))
            .unwrap_or_else(|| record_values.len().max(1));
        Some(first.saturating_sub(1) / page_size.max(1) + 1)
    });
    let facet = lookup_string_recursive(&value, FACET_KEYS);
    let total_hits = lookup_usize_recursive(&value, TOTAL_HITS_KEYS);
    let has_more = lookup_bool_recursive(&value, HAS_MORE_KEYS).or_else(|| {
        let last = last_result?;
        let total = total_hits?;
        Some(last < total)
    });
    let next_cursor = lookup_string_recursive(&value, NEXT_CURSOR_KEYS);

    let mut records = Vec::new();
    let mut retrieval_positions = Vec::new();
    let mut seen = HashSet::new();
    for (index, raw) in record_values.iter().enumerate() {
        let Some(object) = raw.as_object() else {
            continue;
        };
        let Some(record) = map_record(object) else {
            continue;
        };
        let identity = record_identity(&record);
        if !seen.insert(identity) {
            continue;
        }
        let observed_page = object_usize(object, RECORD_PAGE_KEYS).or(page_number);
        let observed_position = object_usize(object, POSITION_KEYS);
        let observed_rank = object_usize(object, RANK_KEYS)
            .or_else(|| first_result.map(|first| first.saturating_add(index)));
        let has_observed_position =
            observed_page.is_some() && (observed_position.is_some() || observed_rank.is_some());
        let page = observed_page.unwrap_or(1).max(1);
        let position = observed_position
            .or(observed_rank)
            .unwrap_or(index.saturating_add(1))
            .max(1);
        let rank = observed_rank
            .unwrap_or_else(|| {
                page.saturating_sub(1)
                    .saturating_mul(record_values.len().max(1))
                    .saturating_add(position)
            })
            .max(1);
        retrieval_positions.push(ResearchSearchRetrievalPosition {
            connector_id: WHU_ACADEMIC_DISCOVERY_V2_CONNECTOR_ID.to_string(),
            rank,
            page,
            position,
            facet: object_string(object, FACET_KEYS).or_else(|| facet.clone()),
            basis: if has_observed_position {
                ResearchSearchRetrievalPositionBasis::Observed
            } else {
                ResearchSearchRetrievalPositionBasis::Synthesized
            },
        });
        records.push(record);
    }

    let explicit_zero_results = record_values.is_empty()
        && (total_hits == Some(0)
            || lookup_bool_recursive(&value, EXPLICIT_ZERO_KEYS) == Some(true));
    let page_identity = page_identity(
        page_number,
        facet.as_deref(),
        next_cursor.as_deref(),
        &records,
    );
    Ok(WhuStructuredDiscoveryPage {
        records,
        retrieval_positions,
        page_number,
        page_number_observed: observed_page_number.is_some(),
        first_result,
        last_result,
        facet,
        total_hits,
        has_more,
        next_cursor,
        explicit_zero_results,
        schema_sha256,
        page_identity,
    })
}

fn validate_json_budget(
    value: &Value,
    depth: usize,
    nodes: &mut usize,
) -> Result<(), WhuStructuredParseError> {
    if depth > MAX_STRUCTURED_JSON_DEPTH {
        return Err(WhuStructuredParseError::BodyInvalid);
    }
    *nodes = nodes.saturating_add(1);
    if *nodes > MAX_STRUCTURED_JSON_NODES {
        return Err(WhuStructuredParseError::BodyInvalid);
    }
    match value {
        Value::Array(values) => {
            for value in values {
                validate_json_budget(value, depth.saturating_add(1), nodes)?;
            }
        }
        Value::Object(values) => {
            for value in values.values() {
                validate_json_budget(value, depth.saturating_add(1), nodes)?;
            }
        }
        _ => {}
    }
    Ok(())
}

fn validate_json_depth(value: &Value, depth: usize) -> Result<(), WhuStructuredParseError> {
    if depth > MAX_STRUCTURED_JSON_DEPTH {
        return Err(WhuStructuredParseError::BodyInvalid);
    }
    match value {
        Value::Array(values) => {
            for value in values {
                validate_json_depth(value, depth.saturating_add(1))?;
            }
        }
        Value::Object(values) => {
            for value in values.values() {
                validate_json_depth(value, depth.saturating_add(1))?;
            }
        }
        _ => {}
    }
    Ok(())
}

fn is_official_primo_payload(value: &Value) -> bool {
    let Some(root) = value.as_object() else {
        return false;
    };
    let Some(docs) = root.get("docs").and_then(Value::as_array) else {
        return false;
    };
    let Some(info) = root.get("info").and_then(Value::as_object) else {
        return false;
    };
    if docs.len() > MAX_STRUCTURED_PRIMO_DOCS
        || info.get("total").and_then(value_usize).is_none()
        || info.get("first").and_then(value_usize).is_none()
        || info.get("last").and_then(value_usize).is_none()
    {
        return false;
    }
    docs.iter().all(|doc| {
        doc.as_object()
            .and_then(|doc| doc.get("pnx"))
            .and_then(Value::as_object)
            .and_then(|pnx| pnx.get("display"))
            .and_then(Value::as_object)
            .and_then(|display| display.get("title"))
            .is_some_and(|title| matches!(title, Value::String(_) | Value::Array(_)))
    })
}

fn official_primo_budget_projection(value: &Value) -> Result<Value, WhuStructuredParseError> {
    let root = value
        .as_object()
        .ok_or(WhuStructuredParseError::SchemaDrift)?;
    let docs = root
        .get("docs")
        .and_then(Value::as_array)
        .ok_or(WhuStructuredParseError::SchemaDrift)?;
    let info = root
        .get("info")
        .and_then(Value::as_object)
        .ok_or(WhuStructuredParseError::SchemaDrift)?;

    let mut projected_info = Map::new();
    copy_allowlisted_fields(info, &mut projected_info, &["total", "first", "last"]);

    let mut projected_docs = Vec::with_capacity(docs.len());
    for doc in docs {
        let doc = doc
            .as_object()
            .ok_or(WhuStructuredParseError::SchemaDrift)?;
        let pnx = doc
            .get("pnx")
            .and_then(Value::as_object)
            .ok_or(WhuStructuredParseError::SchemaDrift)?;
        let mut projected_doc = Map::new();
        copy_allowlisted_fields(
            doc,
            &mut projected_doc,
            &["_id", "@id", "adaptor", "context"],
        );

        let mut projected_pnx = Map::new();
        copy_primo_section(
            pnx,
            &mut projected_pnx,
            "display",
            &[
                "title",
                "creator",
                "type",
                "source",
                "ispartof",
                "publisher",
                "description",
                "identifier",
                "availability",
            ],
        );
        copy_primo_section(
            pnx,
            &mut projected_pnx,
            "addata",
            &[
                "atitle",
                "au",
                "date",
                "doi",
                "jtitle",
                "btitle",
                "pub",
                "abstract",
                "issn",
                "isbn",
                "genre",
                "format",
                "degreegrantor",
                "institution",
                "volume",
                "issue",
                "pages",
                "spage",
                "epage",
            ],
        );
        copy_primo_section(
            pnx,
            &mut projected_pnx,
            "control",
            &["recordtype", "sourcerecordid", "recordid"],
        );
        copy_primo_section(
            pnx,
            &mut projected_pnx,
            "sort",
            &["creationdate", "date", "year"],
        );
        copy_primo_section(
            pnx,
            &mut projected_pnx,
            "delivery",
            &[
                "availability",
                "fullTextStatus",
                "accessStatus",
                "fulltext",
                "delcategory",
            ],
        );
        projected_doc.insert("pnx".to_string(), Value::Object(projected_pnx));
        projected_docs.push(Value::Object(projected_doc));
    }

    Ok(Value::Object(Map::from_iter([
        ("info".to_string(), Value::Object(projected_info)),
        ("docs".to_string(), Value::Array(projected_docs)),
    ])))
}

fn copy_primo_section(
    pnx: &Map<String, Value>,
    projected_pnx: &mut Map<String, Value>,
    section: &str,
    fields: &[&str],
) {
    let Some(source) = pnx.get(section).and_then(Value::as_object) else {
        return;
    };
    let mut projected = Map::new();
    copy_allowlisted_fields(source, &mut projected, fields);
    projected_pnx.insert(section.to_string(), Value::Object(projected));
}

fn copy_allowlisted_fields(
    source: &Map<String, Value>,
    target: &mut Map<String, Value>,
    fields: &[&str],
) {
    for field in fields {
        if let Some(value) = source.get(*field) {
            target.insert((*field).to_string(), value.clone());
        }
    }
}

fn find_record_array(value: &Value) -> Option<&Vec<Value>> {
    let object = value.as_object()?;
    for key in RECORD_ARRAY_KEYS {
        if let Some(array) = object_get(object, &[*key]).and_then(Value::as_array) {
            if array.is_empty() || array.iter().any(looks_like_record) {
                return Some(array);
            }
        }
    }
    for key in CONTAINER_KEYS {
        if let Some(nested) = object_get(object, &[*key]) {
            if let Some(array) = find_record_array(nested) {
                return Some(array);
            }
        }
    }
    None
}

fn looks_like_record(value: &Value) -> bool {
    let Some(object) = value.as_object() else {
        return false;
    };
    object_string(object, TITLE_KEYS).is_some()
        || object_get(object, &["pnx"])
            .and_then(Value::as_object)
            .and_then(|pnx| object_get(pnx, &["display"]))
            .and_then(Value::as_object)
            .and_then(|display| object_string(display, TITLE_KEYS))
            .is_some()
}

fn map_record(object: &Map<String, Value>) -> Option<SideraInstitutionAdapterRecord> {
    if object_get(object, &["pnx"]).is_some() {
        return map_primo_record(object);
    }
    let title = object_string(object, TITLE_KEYS)?;
    if title.trim().is_empty() {
        return None;
    }
    let document_type = object_string(object, DOCUMENT_TYPE_KEYS);
    let record_kind = classify_record_kind(document_type.as_deref());
    let publication = object_string(object, PUBLICATION_KEYS);
    let detail_url = object_string(object, DETAIL_URL_KEYS).unwrap_or_default();
    let full_text_url = object_string(object, FULL_TEXT_URL_KEYS);
    let availability = object_string(object, AVAILABILITY_KEYS);
    let full_text_status = if full_text_url.is_some() {
        SideraInstitutionFullTextStatus::Available
    } else if !detail_url.is_empty() {
        SideraInstitutionFullTextStatus::LinkOnly
    } else if availability
        .as_deref()
        .is_some_and(|value| contains_any(value, &["available", "可获取", "全文"]))
    {
        SideraInstitutionFullTextStatus::Available
    } else {
        SideraInstitutionFullTextStatus::Unknown
    };
    Some(SideraInstitutionAdapterRecord {
        title: clean_string(title),
        authors: object_authors(object),
        year: object_year(object),
        publication: publication.clone(),
        document_type,
        doi: object_string(object, DOI_KEYS).map(normalize_doi),
        abstract_snippet: object_string(object, ABSTRACT_KEYS),
        availability,
        detail_url,
        full_text_url,
        record_kind,
        journal: object_string(object, JOURNAL_KEYS).or_else(|| {
            (record_kind == SideraInstitutionRecordKind::JournalArticle)
                .then(|| publication.clone())
                .flatten()
        }),
        conference: object_string(object, CONFERENCE_KEYS).or_else(|| {
            (record_kind == SideraInstitutionRecordKind::ConferencePaper)
                .then(|| publication.clone())
                .flatten()
        }),
        degree_institution: object_string(object, DEGREE_INSTITUTION_KEYS),
        volume: object_string(object, VOLUME_KEYS),
        issue: object_string(object, ISSUE_KEYS),
        pages: object_string(object, PAGES_KEYS),
        source_provider: object_provider(object),
        full_text_status,
        provider_record_id: object_string(object, PROVIDER_RECORD_ID_KEYS),
        catalog_record_id: object_string(object, CATALOG_RECORD_ID_KEYS),
        isbn_issn: object_string(object, ISBN_ISSN_KEYS),
    })
}

fn map_primo_record(object: &Map<String, Value>) -> Option<SideraInstitutionAdapterRecord> {
    let pnx = object_get(object, &["pnx"])?.as_object()?;
    let display = object_get(pnx, &["display"])?.as_object()?;
    let addata = object_get(pnx, &["addata"]).and_then(Value::as_object);
    let control = object_get(pnx, &["control"]).and_then(Value::as_object);
    let sort = object_get(pnx, &["sort"]).and_then(Value::as_object);

    let title = object_string(display, TITLE_KEYS)?;
    if title.trim().is_empty() {
        return None;
    }
    let document_type = object_string(display, DOCUMENT_TYPE_KEYS)
        .or_else(|| control.and_then(|value| object_string(value, &["recordtype"])));
    let record_kind = classify_record_kind(document_type.as_deref());
    let publication = object_string(display, &["ispartof", "publisher"])
        .or_else(|| addata.and_then(|value| object_string(value, &["jtitle", "btitle", "pub"])));
    let detail_url = object
        .get("@id")
        .and_then(value_string)
        .and_then(safe_public_locator)
        .unwrap_or_default();
    let availability = object_get(object, &["delivery"])
        .and_then(Value::as_object)
        .and_then(|delivery| object_string(delivery, AVAILABILITY_KEYS));
    let full_text_status = if !detail_url.is_empty() {
        SideraInstitutionFullTextStatus::LinkOnly
    } else if availability
        .as_deref()
        .is_some_and(|value| contains_any(value, &["available", "可获取", "全文"]))
    {
        SideraInstitutionFullTextStatus::Available
    } else {
        SideraInstitutionFullTextStatus::Unknown
    };
    let authors = object_authors(display).or_else(|| addata.and_then(object_authors));
    let year = addata
        .and_then(object_year)
        .or_else(|| object_year(display))
        .or_else(|| sort.and_then(object_year));
    let source_provider = object_string(display, &["source"])
        .or_else(|| object_string(object, &["adaptor", "context"]));

    Some(SideraInstitutionAdapterRecord {
        title: clean_string(title),
        authors,
        year,
        publication: publication.clone(),
        document_type,
        doi: addata
            .and_then(|value| object_string(value, DOI_KEYS))
            .map(normalize_doi),
        abstract_snippet: object_string(display, ABSTRACT_KEYS),
        availability,
        detail_url,
        full_text_url: None,
        record_kind,
        journal: addata
            .and_then(|value| object_string(value, &["jtitle"]))
            .or_else(|| {
                (record_kind == SideraInstitutionRecordKind::JournalArticle)
                    .then(|| publication.clone())
                    .flatten()
            }),
        conference: addata
            .and_then(|value| object_string(value, &["btitle", "conference"]))
            .or_else(|| {
                (record_kind == SideraInstitutionRecordKind::ConferencePaper)
                    .then(|| publication.clone())
                    .flatten()
            }),
        degree_institution: addata
            .and_then(|value| object_string(value, &["degreegrantor", "institution"])),
        volume: addata.and_then(|value| object_string(value, VOLUME_KEYS)),
        issue: addata.and_then(|value| object_string(value, ISSUE_KEYS)),
        pages: addata.and_then(|value| object_string(value, &["pages", "spage", "epage"])),
        source_provider,
        full_text_status,
        provider_record_id: control
            .and_then(|value| object_string(value, &["sourcerecordid", "recordid"])),
        catalog_record_id: control.and_then(|value| object_string(value, &["recordid"])),
        isbn_issn: addata.and_then(|value| object_string(value, &["issn", "isbn"])),
    })
}

fn object_authors(object: &Map<String, Value>) -> Option<String> {
    let value = object_get(object, AUTHOR_KEYS)?;
    match value {
        Value::String(value) => non_empty(value.clone()),
        Value::Array(values) => {
            let authors = values
                .iter()
                .filter_map(|value| match value {
                    Value::String(value) => non_empty(value.clone()),
                    Value::Object(object) => object_string(object, &["name", "fullName", "label"]),
                    _ => None,
                })
                .collect::<Vec<_>>();
            (!authors.is_empty()).then(|| authors.join("; "))
        }
        Value::Object(object) => object_string(object, &["name", "fullName", "label"]),
        _ => None,
    }
}

fn object_provider(object: &Map<String, Value>) -> Option<String> {
    let value = object_get(object, PROVIDER_KEYS)?;
    match value {
        Value::String(value) => non_empty(value.clone()),
        Value::Object(object) => object_string(object, &["name", "label", "displayName", "id"]),
        _ => None,
    }
}

fn object_year(object: &Map<String, Value>) -> Option<i32> {
    // Primo PNX serializes date fields as arrays even when only one year is
    // present. Reuse the bounded scalar reader so official `["2024"]` values
    // are not silently treated as missing by year filters.
    let raw = value_string(object_get(object, YEAR_KEYS)?)?;
    raw.split(|value: char| !value.is_ascii_digit())
        .find(|part| part.len() == 4)
        .and_then(|part| part.parse::<i32>().ok())
        .filter(|year| (1000..=3000).contains(year))
}

fn classify_record_kind(value: Option<&str>) -> SideraInstitutionRecordKind {
    let value = value.unwrap_or_default().to_ascii_lowercase();
    if contains_any(&value, &["journal", "article", "期刊", "论文集文章"]) {
        SideraInstitutionRecordKind::JournalArticle
    } else if contains_any(&value, &["conference", "proceeding", "会议"]) {
        SideraInstitutionRecordKind::ConferencePaper
    } else if contains_any(&value, &["thesis", "dissertation", "学位", "硕士", "博士"]) {
        SideraInstitutionRecordKind::Thesis
    } else if contains_any(&value, &["book", "图书", "专著"]) {
        SideraInstitutionRecordKind::Book
    } else {
        SideraInstitutionRecordKind::Unknown
    }
}

fn object_get<'a>(object: &'a Map<String, Value>, keys: &[&str]) -> Option<&'a Value> {
    object.iter().find_map(|(key, value)| {
        keys.iter()
            .any(|candidate| normalized_key(key) == normalized_key(candidate))
            .then_some(value)
    })
}

fn object_string(object: &Map<String, Value>, keys: &[&str]) -> Option<String> {
    value_string(object_get(object, keys)?)
}

fn value_string(value: &Value) -> Option<String> {
    match value {
        Value::String(value) => non_empty(clean_string(value.clone())),
        Value::Number(value) => Some(value.to_string()),
        Value::Array(values) => values.iter().find_map(value_string),
        _ => None,
    }
}

fn safe_public_locator(value: String) -> Option<String> {
    let value = value.trim();
    (value.starts_with("https://")
        && value.len() <= 2_048
        && !value.contains('?')
        && !value.contains('#'))
    .then(|| value.to_string())
}

fn object_usize(object: &Map<String, Value>, keys: &[&str]) -> Option<usize> {
    value_usize(object_get(object, keys)?)
}

fn lookup_usize_recursive(value: &Value, keys: &[&str]) -> Option<usize> {
    lookup_value_recursive(value, keys).and_then(value_usize)
}

fn lookup_bool_recursive(value: &Value, keys: &[&str]) -> Option<bool> {
    match lookup_value_recursive(value, keys)? {
        Value::Bool(value) => Some(*value),
        Value::String(value) if value.eq_ignore_ascii_case("true") => Some(true),
        Value::String(value) if value.eq_ignore_ascii_case("false") => Some(false),
        _ => None,
    }
}

fn lookup_string_recursive(value: &Value, keys: &[&str]) -> Option<String> {
    match lookup_value_recursive(value, keys)? {
        Value::String(value) => non_empty(clean_string(value.clone())),
        Value::Number(value) => Some(value.to_string()),
        _ => None,
    }
}

fn lookup_value_recursive<'a>(value: &'a Value, keys: &[&str]) -> Option<&'a Value> {
    let object = value.as_object()?;
    if let Some(value) = object_get(object, keys) {
        return Some(value);
    }
    for key in META_CONTAINER_KEYS {
        if let Some(nested) = object_get(object, &[*key]) {
            if let Some(value) = lookup_value_recursive(nested, keys) {
                return Some(value);
            }
        }
    }
    None
}

fn value_usize(value: &Value) -> Option<usize> {
    match value {
        Value::Number(value) => value.as_u64().and_then(|value| usize::try_from(value).ok()),
        Value::String(value) => value.trim().replace(',', "").parse().ok(),
        _ => None,
    }
}

fn normalized_key(value: &str) -> String {
    value
        .chars()
        .filter(|value| value.is_ascii_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

fn contains_any(value: &str, patterns: &[&str]) -> bool {
    patterns.iter().any(|pattern| value.contains(pattern))
}

fn clean_string(value: String) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn non_empty(value: String) -> Option<String> {
    (!value.trim().is_empty()).then(|| value.trim().to_string())
}

fn normalize_doi(value: String) -> String {
    value
        .trim()
        .trim_start_matches("https://doi.org/")
        .trim_start_matches("http://doi.org/")
        .trim_start_matches("doi:")
        .trim()
        .to_string()
}

fn record_identity(record: &SideraInstitutionAdapterRecord) -> String {
    format!(
        "{}|{}|{}|{}",
        record.title.to_ascii_lowercase(),
        record
            .authors
            .as_deref()
            .unwrap_or_default()
            .to_ascii_lowercase(),
        record.year.unwrap_or_default(),
        record
            .doi
            .as_deref()
            .unwrap_or_default()
            .to_ascii_lowercase()
    )
}

fn page_identity(
    page: Option<usize>,
    facet: Option<&str>,
    cursor: Option<&str>,
    records: &[SideraInstitutionAdapterRecord],
) -> String {
    let mut digest = Sha256::new();
    digest.update(page.unwrap_or_default().to_le_bytes());
    digest.update(facet.unwrap_or_default().as_bytes());
    digest.update(cursor.unwrap_or_default().as_bytes());
    for record in records {
        digest.update(record_identity(record).as_bytes());
    }
    format!("{:x}", digest.finalize())
}

fn sha256_hex(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn schema_value(value: &Value) -> Value {
    match value {
        Value::Null => Value::String("null".into()),
        Value::Bool(_) => Value::String("boolean".into()),
        Value::Number(_) => Value::String("number".into()),
        Value::String(_) => Value::String("string".into()),
        Value::Array(values) => {
            let variants = values
                .iter()
                .map(schema_value)
                .map(|value| serde_json::to_string(&value).unwrap_or_default())
                .collect::<BTreeSet<_>>()
                .into_iter()
                .filter_map(|value| serde_json::from_str(&value).ok())
                .collect();
            Value::Array(variants)
        }
        Value::Object(values) => Value::Object(
            values
                .iter()
                .map(|(key, value)| (key.clone(), schema_value(value)))
                .collect(),
        ),
    }
}

const RECORD_ARRAY_KEYS: &[&str] = &["records", "items", "results", "docs", "documents"];
const CONTAINER_KEYS: &[&str] = &["data", "response", "payload", "result", "searchResult"];
const META_CONTAINER_KEYS: &[&str] = &[
    "data",
    "response",
    "payload",
    "result",
    "searchResult",
    "page",
    "pagination",
    "meta",
    "info",
];
const TITLE_KEYS: &[&str] = &["title", "name", "recordTitle", "itemTitle", "dcTitle"];
const AUTHOR_KEYS: &[&str] = &["authors", "author", "authorList", "creators", "creator"];
const YEAR_KEYS: &[&str] = &[
    "year",
    "publicationYear",
    "publishYear",
    "date",
    "publicationDate",
    "pubYear",
];
const DOI_KEYS: &[&str] = &["doi", "digitalObjectIdentifier"];
const DOCUMENT_TYPE_KEYS: &[&str] = &[
    "documentType",
    "resourceType",
    "type",
    "docType",
    "materialType",
    "format",
];
const PUBLICATION_KEYS: &[&str] = &[
    "publication",
    "sourceTitle",
    "journalTitle",
    "venue",
    "publisher",
    "containerTitle",
];
const PROVIDER_KEYS: &[&str] = &["provider", "sourceProvider", "database", "source", "vendor"];
const DETAIL_URL_KEYS: &[&str] = &["detailUrl", "recordUrl", "link", "url", "permalink"];
const FULL_TEXT_URL_KEYS: &[&str] = &[
    "fullTextUrl",
    "pdfUrl",
    "fulltext",
    "fullTextLink",
    "downloadUrl",
];
const PROVIDER_RECORD_ID_KEYS: &[&str] = &[
    "id",
    "recordId",
    "uniqueId",
    "an",
    "providerRecordId",
    "docId",
];
const CATALOG_RECORD_ID_KEYS: &[&str] = &["catalogRecordId", "mmsId", "bibId"];
const ABSTRACT_KEYS: &[&str] = &["abstract", "abstractSnippet", "description", "summary"];
const AVAILABILITY_KEYS: &[&str] = &["availability", "fullTextStatus", "accessStatus"];
const JOURNAL_KEYS: &[&str] = &["journal", "journalTitle"];
const CONFERENCE_KEYS: &[&str] = &["conference", "conferenceName", "meetingName"];
const DEGREE_INSTITUTION_KEYS: &[&str] = &[
    "degreeInstitution",
    "institution",
    "university",
    "degreeGrantor",
];
const VOLUME_KEYS: &[&str] = &["volume", "volumeNumber"];
const ISSUE_KEYS: &[&str] = &["issue", "issueNumber"];
const PAGES_KEYS: &[&str] = &["pages", "pageRange"];
const ISBN_ISSN_KEYS: &[&str] = &["isbnIssn", "isbn", "issn"];
const PAGE_NUMBER_KEYS: &[&str] = &["pageNumber", "currentPage", "page", "pageNo"];
const FIRST_RESULT_KEYS: &[&str] = &["first", "firstResult", "start", "offset"];
const LAST_RESULT_KEYS: &[&str] = &["last", "lastResult", "end"];
const RECORD_PAGE_KEYS: &[&str] = &["pageNumber", "resultPage", "page", "pageNo"];
const POSITION_KEYS: &[&str] = &["position", "positionInPage", "resultPosition"];
const RANK_KEYS: &[&str] = &["rank", "resultRank", "absolutePosition"];
const FACET_KEYS: &[&str] = &["facet", "facetName", "resourceTypeFacet", "category"];
const TOTAL_HITS_KEYS: &[&str] = &["totalHits", "total", "totalCount", "numFound"];
const HAS_MORE_KEYS: &[&str] = &["hasMore", "moreResults", "hasNext", "hasNextPage"];
const NEXT_CURSOR_KEYS: &[&str] = &["nextCursor", "cursor", "nextPageToken", "next"];
const EXPLICIT_ZERO_KEYS: &[&str] = &["explicitZeroResults", "noResults", "empty"];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_multilingual_records_and_official_truth() {
        let body = r#"{
          "data": {
            "items": [
              {"title":"人工智能研究","authors":[{"name":"张三"}],"publicationYear":2024,"resourceType":"期刊论文","journalTitle":"软件学报","doi":"doi:10.1/a","provider":{"name":"CNKI"},"pageNumber":2,"position":1,"rank":11},
              {"title":"Machine Learning Systems","creators":["Ada","Bob"],"date":"2023-05-01","type":"conference paper","conferenceName":"MLSys","sourceProvider":"EBSCO","pageNumber":2,"position":2,"rank":12},
              {"title":"知识发现方法","author":"李四","year":"2022","docType":"博士学位论文","degreeInstitution":"武汉大学","recordId":"r3","pageNumber":2,"position":3,"rank":13}
            ],
            "pagination":{"currentPage":2,"totalHits":31,"hasMore":true,"nextCursor":"opaque"},
            "facet":"all"
          }
        }"#;
        let page = parse_whu_structured_discovery_page(body.as_bytes()).unwrap();
        assert_eq!(page.records.len(), 3);
        assert_eq!(
            page.records[0].record_kind,
            SideraInstitutionRecordKind::JournalArticle
        );
        assert_eq!(
            page.records[1].record_kind,
            SideraInstitutionRecordKind::ConferencePaper
        );
        assert_eq!(
            page.records[2].record_kind,
            SideraInstitutionRecordKind::Thesis
        );
        assert_eq!(page.total_hits, Some(31));
        assert_eq!(page.has_more, Some(true));
        assert_eq!(page.next_cursor.as_deref(), Some("opaque"));
        assert!(page
            .retrieval_positions
            .iter()
            .all(|position| position.basis == ResearchSearchRetrievalPositionBasis::Observed));
    }

    #[test]
    fn parses_official_primo_pnx_search_shape() {
        let body = r#"{
          "info":{"total":42,"first":11,"last":12},
          "docs":[
            {
              "context":"L",
              "adaptor":"Local Search Engine",
              "@id":"https://example.edu/primaws/rest/pub/pnxs/L/991",
              "pnx":{
                "display":{"source":["Alma"],"type":["article"],"title":["人工智能证据"],"creator":["张三"],"ispartof":["软件学报"]},
                "sort":{"creationdate":["2024"]},
                "control":{"recordid":["991"],"sourcerecordid":["source-991"],"recordtype":["article"]},
                "addata":{"doi":["10.1/example"],"issn":["1234-5678"],"date":["2024"]}
              }
            },
            {
              "context":"PC",
              "adaptor":"Central Index",
              "pnx":{
                "display":{"source":["Primo Central"],"type":["conference paper"],"title":["Machine Learning Evidence"],"creator":["Ada","Bob"]},
                "control":{"recordid":["pc-2"],"recordtype":["conference paper"]},
                "addata":{"date":["2023"],"btitle":["MLSys"]}
              }
            }
          ],
          "facets":[]
        }"#;
        let page = parse_whu_structured_discovery_page(body.as_bytes()).unwrap();
        assert_eq!(page.records.len(), 2);
        assert_eq!(page.page_number, Some(6));
        assert_eq!(page.first_result, Some(11));
        assert_eq!(page.last_result, Some(12));
        assert_eq!(page.total_hits, Some(42));
        assert_eq!(page.has_more, Some(true));
        assert_eq!(page.records[0].title, "人工智能证据");
        assert_eq!(page.records[0].authors.as_deref(), Some("张三"));
        assert_eq!(page.records[0].doi.as_deref(), Some("10.1/example"));
        assert_eq!(page.records[0].journal.as_deref(), Some("软件学报"));
        assert_eq!(page.records[0].year, Some(2024));
        assert_eq!(page.records[1].conference.as_deref(), Some("MLSys"));
        assert_eq!(page.records[1].year, Some(2023));
        assert_eq!(page.retrieval_positions[0].rank, 11);
        assert_eq!(page.retrieval_positions[1].rank, 12);
        assert!(page
            .retrieval_positions
            .iter()
            .all(|position| position.basis == ResearchSearchRetrievalPositionBasis::Observed));
        assert_eq!(page.schema_sha256, WHU_STRUCTURED_PRIMO_SCHEMA_SHA256);
    }

    #[test]
    fn primo_vendor_extensions_are_skipped_but_allowlisted_projection_stays_bounded() {
        let vendor_extension = (0..2_000)
            .map(|index| Value::String(format!("vendor-{index}")))
            .collect::<Vec<_>>();
        let body = serde_json::json!({
            "info": {"total": 1, "first": 1, "last": 1},
            "docs": [{
                "vendorExtension": vendor_extension,
                "pnx": {
                    "display": {"title": ["Bounded evidence"], "type": ["article"]},
                    "control": {"recordid": ["safe-1"]}
                }
            }]
        });
        let encoded = serde_json::to_vec(&body).unwrap();
        let page = parse_whu_structured_discovery_page(&encoded).unwrap();
        assert_eq!(page.records.len(), 1);
        assert_eq!(page.schema_sha256, WHU_STRUCTURED_PRIMO_SCHEMA_SHA256);

        let excessive_projection = serde_json::json!({
            "info": {"total": 1, "first": 1, "last": 1},
            "docs": [{
                "pnx": {
                    "display": {
                        "title": ["Bounded evidence"],
                        "description": (0..1_100).map(|index| format!("selected-{index}")).collect::<Vec<_>>()
                    }
                }
            }]
        });
        assert_eq!(
            parse_whu_structured_discovery_page(
                &serde_json::to_vec(&excessive_projection).unwrap()
            ),
            Err(WhuStructuredParseError::BodyInvalid)
        );
    }

    #[test]
    fn missing_truth_stays_unknown_and_duplicates_are_removed() {
        let body = br#"{"results":[{"title":"Same","author":"A"},{"title":"Same","author":"A"}]}"#;
        let page = parse_whu_structured_discovery_page(body).unwrap();
        assert_eq!(page.records.len(), 1);
        assert_eq!(page.total_hits, None);
        assert_eq!(page.has_more, None);
        assert_eq!(page.next_cursor, None);
        assert_eq!(
            page.retrieval_positions[0].basis,
            ResearchSearchRetrievalPositionBasis::Synthesized
        );
    }

    #[test]
    fn classifies_exact_structured_page_advancement_without_dom_truth() {
        let first = parse_whu_structured_discovery_page(
            br#"{"info":{"total":21,"first":1,"last":10},"docs":[{"pnx":{"display":{"title":["First"],"type":["article"]},"control":{"recordid":["first"]}}}]}"#,
        )
        .unwrap();
        let second = parse_whu_structured_discovery_page(
            br#"{"info":{"total":21,"first":11,"last":20},"docs":[{"pnx":{"display":{"title":["Second"],"type":["article"]},"control":{"recordid":["second"]}}}]}"#,
        )
        .unwrap();
        assert_eq!(first.page_number, Some(1));
        assert_eq!(second.page_number, Some(2));
        assert_eq!(first.has_more, Some(true));
        assert_eq!(second.has_more, Some(true));
        assert_eq!(
            classify_whu_structured_page_advance(&first, &second),
            WhuStructuredPageAdvance::Advanced
        );
        assert_eq!(
            classify_whu_structured_page_advance(&first, &first),
            WhuStructuredPageAdvance::Duplicate
        );
        assert_eq!(
            classify_whu_structured_page_advance(&second, &first),
            WhuStructuredPageAdvance::Regressed
        );
    }

    #[test]
    fn final_official_range_reports_source_exhaustion() {
        let page = parse_whu_structured_discovery_page(
            br#"{"info":{"total":21,"first":21,"last":21},"docs":[{"pnx":{"display":{"title":["Final"],"type":["article"]},"control":{"recordid":["final"]}}}]}"#,
        )
        .unwrap();
        assert_eq!(page.first_result, Some(21));
        assert_eq!(page.last_result, Some(21));
        assert_eq!(page.total_hits, Some(21));
        assert_eq!(page.has_more, Some(false));
    }

    #[test]
    fn official_ranges_advance_when_page_sizes_differ() {
        let first = parse_whu_structured_discovery_page(
            br#"{"info":{"total":15,"first":1,"last":10},"docs":[{"pnx":{"display":{"title":["First"],"type":["article"]},"control":{"recordid":["first"]}}}]}"#,
        )
        .unwrap();
        let final_page = parse_whu_structured_discovery_page(
            br#"{"info":{"total":15,"first":11,"last":15},"docs":[{"pnx":{"display":{"title":["Final"],"type":["article"]},"control":{"recordid":["final"]}}}]}"#,
        )
        .unwrap();
        assert!(!first.page_number_observed);
        assert!(!final_page.page_number_observed);
        assert_eq!(final_page.page_number, Some(3));
        assert_eq!(
            classify_whu_structured_page_advance(&first, &final_page),
            WhuStructuredPageAdvance::Advanced
        );
    }

    #[test]
    fn advancement_without_page_or_range_truth_is_unverifiable() {
        let first = parse_whu_structured_discovery_page(
            br#"{"records":[{"title":"First","recordId":"first"}]}"#,
        )
        .unwrap();
        let second = parse_whu_structured_discovery_page(
            br#"{"records":[{"title":"Second","recordId":"second"}]}"#,
        )
        .unwrap();
        assert_eq!(
            classify_whu_structured_page_advance(&first, &second),
            WhuStructuredPageAdvance::MetadataMissing
        );
    }

    #[test]
    fn empty_official_result_is_explicit_only_with_truth() {
        let explicit = parse_whu_structured_discovery_page(
            br#"{"data":{"records":[],"totalHits":0,"hasMore":false}}"#,
        )
        .unwrap();
        assert!(explicit.explicit_zero_results);
        let unknown = parse_whu_structured_discovery_page(br#"{"records":[]}"#).unwrap();
        assert!(!unknown.explicit_zero_results);
    }

    #[test]
    fn rejects_schema_drift_invalid_and_bounded_payloads() {
        assert_eq!(
            parse_whu_structured_discovery_page(br#"{"data":{"facets":[]}}"#),
            Err(WhuStructuredParseError::SchemaDrift)
        );
        assert_eq!(
            parse_whu_structured_discovery_page(&[0xff, 0xfe]),
            Err(WhuStructuredParseError::BodyInvalid)
        );
        assert_eq!(
            parse_whu_structured_discovery_page(&vec![b' '; MAX_STRUCTURED_BODY_BYTES + 1]),
            Err(WhuStructuredParseError::BodyTooLarge)
        );
        let mut deep = String::new();
        for _ in 0..14 {
            deep.push_str("{\"data\":");
        }
        deep.push_str("{\"records\":[]}");
        for _ in 0..14 {
            deep.push('}');
        }
        assert_eq!(
            parse_whu_structured_discovery_page(deep.as_bytes()),
            Err(WhuStructuredParseError::BodyInvalid)
        );
    }

    #[test]
    fn sensitive_fields_are_never_mapped_or_serialized() {
        let body = br#"{"records":[{"title":"Safe","cookie":"secret","token":"ticket","requestParams":{"query":"private"}}]}"#;
        let page = parse_whu_structured_discovery_page(body).unwrap();
        let encoded = serde_json::to_string(&page.records).unwrap();
        assert!(!encoded.contains("secret"));
        assert!(!encoded.contains("ticket"));
        assert!(!encoded.contains("private"));
    }

    #[test]
    fn rejects_json_node_exhaustion() {
        let values = (0..1_100)
            .map(|value| value.to_string())
            .collect::<Vec<_>>();
        let body = format!("{{\"records\":[],\"noise\":[{}]}}", values.join(","));
        assert_eq!(
            parse_whu_structured_discovery_page(body.as_bytes()),
            Err(WhuStructuredParseError::BodyInvalid)
        );
    }
}
