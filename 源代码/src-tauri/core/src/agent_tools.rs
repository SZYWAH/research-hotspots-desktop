use crate::agent::{canonical_value_sha256, validate_storable_json, AgentRiskLevel};
use crate::agent_capabilities::AgentCapabilityRepository;
use crate::{current_library_revision, validate_active_snapshot, AnalysisState};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::collections::{HashMap, HashSet};
use std::time::{SystemTime, UNIX_EPOCH};

pub const AGENT_TOOL_REGISTRY_VERSION: &str = "research-tools-v2";
pub const AGENT_SEARCH_PAPER_LIMIT: usize = 20;
pub const AGENT_SEARCH_HOTSPOT_LIMIT: usize = 10;
pub const AGENT_HOTSPOT_LIMIT: usize = 5;
pub const AGENT_REPRESENTATIVES_PER_HOTSPOT: usize = 18;
pub const AGENT_SIMPLE_REPORT_PAPER_LIMIT: usize = 40;
pub const AGENT_DEEP_REPORT_PAPER_LIMIT: usize = 80;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AgentArtifactKind {
    Evidence,
    ReportDraft,
    ReportAudit,
    ImportAudit,
    MaintenanceAudit,
    SnapshotReference,
    ExportManifest,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AgentToolDefinition {
    pub name: String,
    pub version: String,
    pub risk: AgentRiskLevel,
    pub mutates_business_data: bool,
    pub requires_active_v20_snapshot: bool,
    pub input_schema: Value,
    pub output_schema: Value,
    pub timeout_ms: u64,
    pub max_input_bytes: usize,
    pub max_output_bytes: usize,
    pub retryable_errors: Vec<String>,
    pub artifact_kind: Option<AgentArtifactKind>,
}

#[derive(Debug, Clone)]
pub struct AgentToolRegistry {
    definitions: Vec<AgentToolDefinition>,
    by_name: HashMap<String, usize>,
    hash: String,
}

impl AgentToolRegistry {
    pub fn standard() -> Result<Self, String> {
        Self::new(standard_tool_definitions())
    }

    pub fn new(mut definitions: Vec<AgentToolDefinition>) -> Result<Self, String> {
        if definitions.is_empty() {
            return Err("AGENT_TOOL_REGISTRY_EMPTY".into());
        }
        definitions.sort_by(|left, right| left.name.cmp(&right.name));
        let mut by_name = HashMap::new();
        for (index, definition) in definitions.iter().enumerate() {
            validate_definition(definition)?;
            if by_name.insert(definition.name.clone(), index).is_some() {
                return Err("AGENT_TOOL_REGISTRY_DUPLICATE_NAME".into());
            }
        }
        let payload = json!({
            "registryVersion": AGENT_TOOL_REGISTRY_VERSION,
            "tools": definitions,
        });
        let hash = canonical_value_sha256(&payload)?;
        Ok(Self {
            definitions,
            by_name,
            hash,
        })
    }

    pub fn hash(&self) -> &str {
        &self.hash
    }

    pub fn definitions(&self) -> &[AgentToolDefinition] {
        &self.definitions
    }

    pub fn get(&self, name: &str) -> Result<&AgentToolDefinition, String> {
        self.by_name
            .get(name)
            .map(|index| &self.definitions[*index])
            .ok_or_else(|| format!("AGENT_TOOL_UNKNOWN:{name}"))
    }

    pub fn validate_planned_call(
        &self,
        name: &str,
        version: &str,
        claimed_risk: AgentRiskLevel,
        input: &Value,
    ) -> Result<&AgentToolDefinition, String> {
        let definition = self.get(name)?;
        if definition.version != version {
            return Err(format!(
                "AGENT_TOOL_VERSION_STALE:{name}:expected={}:actual={version}",
                definition.version
            ));
        }
        if definition.risk != claimed_risk {
            return Err(format!("AGENT_TOOL_RISK_MISMATCH:{name}"));
        }
        validate_json_size(
            input,
            definition.max_input_bytes,
            "AGENT_TOOL_INPUT_TOO_LARGE",
        )?;
        validate_untrusted_json(input)?;
        validate_schema(&definition.input_schema, input, true)
            .map_err(|error| format!("AGENT_TOOL_INPUT_SCHEMA_INVALID:{name}:{error}"))?;
        validate_semantic_input(name, input, true)?;
        Ok(definition)
    }

    pub fn validate_resolved_input(&self, name: &str, input: &Value) -> Result<(), String> {
        let definition = self.get(name)?;
        validate_json_size(
            input,
            definition.max_input_bytes,
            "AGENT_TOOL_INPUT_TOO_LARGE",
        )?;
        validate_untrusted_json(input)?;
        validate_schema(&definition.input_schema, input, false)
            .map_err(|error| format!("AGENT_TOOL_INPUT_SCHEMA_INVALID:{name}:{error}"))?;
        validate_semantic_input(name, input, false)
    }

    pub fn validate_output(&self, name: &str, output: &Value) -> Result<(), String> {
        let definition = self.get(name)?;
        validate_json_size(
            output,
            definition.max_output_bytes,
            "AGENT_TOOL_OUTPUT_TOO_LARGE",
        )?;
        validate_untrusted_json(output)?;
        validate_schema(&definition.output_schema, output, false)
            .map_err(|error| format!("AGENT_TOOL_OUTPUT_SCHEMA_INVALID:{name}:{error}"))
    }
}

fn validate_semantic_input(name: &str, input: &Value, allow_refs: bool) -> Result<(), String> {
    for key in [
        "query",
        "topic",
        "evidenceArtifactId",
        "reportArtifactId",
        "auditArtifactId",
    ] {
        if let Some(value) = input.get(key) {
            if allow_refs && is_dynamic_reference(value) {
                continue;
            }
            if value.as_str().is_some_and(|text| text.trim().is_empty()) {
                return Err(format!("AGENT_TOOL_INPUT_BLANK:{name}:{key}"));
            }
        }
    }
    for key in ["paperIds", "hotspotIds"] {
        let Some(value) = input.get(key) else {
            continue;
        };
        if allow_refs && is_dynamic_reference(value) {
            continue;
        }
        if let Some(values) = value.as_array() {
            let ids = values
                .iter()
                .filter_map(Value::as_str)
                .map(str::trim)
                .collect::<Vec<_>>();
            if ids.iter().any(|id| id.is_empty())
                || ids.iter().copied().collect::<HashSet<_>>().len() != ids.len()
            {
                return Err(format!("AGENT_TOOL_INPUT_IDS_INVALID:{name}:{key}"));
            }
        }
    }
    if name == "save_research_evidence" {
        let paper_ids = input.get("paperIds");
        if !(allow_refs && paper_ids.is_some_and(is_dynamic_reference)) {
            let count = paper_ids.and_then(Value::as_array).map_or(0, Vec::len);
            match input.get("mode").and_then(Value::as_str) {
                Some("simple") if count > AGENT_SIMPLE_REPORT_PAPER_LIMIT => {
                    return Err("AGENT_SIMPLE_REPORT_PAPER_LIMIT_EXCEEDED".into());
                }
                Some("deep") if count > AGENT_DEEP_REPORT_PAPER_LIMIT => {
                    return Err("AGENT_DEEP_REPORT_PAPER_LIMIT_EXCEEDED".into());
                }
                _ => {}
            }
        }
    }
    Ok(())
}

fn validate_definition(definition: &AgentToolDefinition) -> Result<(), String> {
    if definition.name.is_empty()
        || definition.name.len() > 64
        || !definition
            .name
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'_')
    {
        return Err("AGENT_TOOL_DEFINITION_NAME_INVALID".into());
    }
    if definition.version.trim().is_empty()
        || definition.timeout_ms == 0
        || definition.max_input_bytes == 0
        || definition.max_output_bytes == 0
    {
        return Err(format!("AGENT_TOOL_DEFINITION_INVALID:{}", definition.name));
    }
    if definition.mutates_business_data && definition.risk == AgentRiskLevel::Read {
        return Err(format!(
            "AGENT_TOOL_MUTATION_RISK_INVALID:{}",
            definition.name
        ));
    }
    validate_schema_definition(&definition.input_schema)?;
    validate_schema_definition(&definition.output_schema)?;
    Ok(())
}

fn validate_schema_definition(schema: &Value) -> Result<(), String> {
    if schema.get("type").and_then(Value::as_str).is_none() {
        return Err("AGENT_TOOL_SCHEMA_TYPE_REQUIRED".into());
    }
    Ok(())
}

fn standard_tool_definitions() -> Vec<AgentToolDefinition> {
    let empty_input = strict_object(json!({}), &[]);
    let artifact_receipt = strict_object(
        json!({
            "artifacts": array_schema(artifact_pointer_schema(), 1, 1),
        }),
        &["artifacts"],
    );
    vec![
        tool(
            "inspect_library_state",
            AgentRiskLevel::Read,
            false,
            false,
            empty_input.clone(),
            strict_object(
                json!({
                    "libraryInstanceId": string_schema(1, 128),
                    "projectId": string_schema(1, 128),
                    "schemaVersion": integer_schema(8, 1000),
                    "paperCount": integer_schema(0, i64::MAX),
                }),
                &[
                    "libraryInstanceId",
                    "projectId",
                    "schemaVersion",
                    "paperCount",
                ],
            ),
            15_000,
            8 * 1024,
            64 * 1024,
            &[],
            None,
        ),
        tool(
            "inspect_v20_snapshot",
            AgentRiskLevel::Read,
            false,
            true,
            empty_input,
            snapshot_schema(),
            15_000,
            8 * 1024,
            64 * 1024,
            &[],
            None,
        ),
        tool(
            "search_local_papers",
            AgentRiskLevel::Read,
            false,
            false,
            strict_object(
                json!({
                    "query": string_schema(1, 500),
                    "limit": integer_schema(1, AGENT_SEARCH_PAPER_LIMIT as i64),
                }),
                &["query"],
            ),
            strict_object(
                json!({
                    "papers": array_schema(paper_summary_schema(), 0, AGENT_SEARCH_PAPER_LIMIT),
                    "truncated": {"type": "boolean"},
                    "untrustedData": {"type": "boolean", "const": true},
                }),
                &["papers", "truncated", "untrustedData"],
            ),
            20_000,
            16 * 1024,
            512 * 1024,
            &[],
            None,
        ),
        tool(
            "search_v20_hotspots",
            AgentRiskLevel::Read,
            false,
            true,
            strict_object(
                json!({
                    "query": string_schema(1, 500),
                    "limit": integer_schema(1, AGENT_SEARCH_HOTSPOT_LIMIT as i64),
                }),
                &["query"],
            ),
            strict_object(
                json!({
                    "snapshot": snapshot_schema(),
                    "hotspots": array_schema(hotspot_summary_schema(), 0, AGENT_SEARCH_HOTSPOT_LIMIT),
                    "untrustedData": {"type": "boolean", "const": true},
                }),
                &["snapshot", "hotspots", "untrustedData"],
            ),
            20_000,
            16 * 1024,
            512 * 1024,
            &[],
            None,
        ),
        tool(
            "get_papers_by_ids",
            AgentRiskLevel::Read,
            false,
            false,
            strict_object(
                json!({
                    "paperIds": array_schema(string_schema(1, 256), 1, AGENT_SEARCH_PAPER_LIMIT),
                }),
                &["paperIds"],
            ),
            strict_object(
                json!({
                    "papers": array_schema(paper_evidence_schema(), 0, AGENT_SEARCH_PAPER_LIMIT),
                    "missingPaperIds": array_schema(string_schema(1, 256), 0, AGENT_SEARCH_PAPER_LIMIT),
                    "untrustedData": {"type": "boolean", "const": true},
                }),
                &["papers", "missingPaperIds", "untrustedData"],
            ),
            20_000,
            32 * 1024,
            1024 * 1024,
            &[],
            None,
        ),
        tool(
            "load_hotspot_evidence",
            AgentRiskLevel::Read,
            false,
            true,
            strict_object(
                json!({
                    "hotspotIds": array_schema(string_schema(1, 256), 1, AGENT_HOTSPOT_LIMIT),
                    "maxPapersPerHotspot": integer_schema(1, AGENT_REPRESENTATIVES_PER_HOTSPOT as i64),
                }),
                &["hotspotIds"],
            ),
            strict_object(
                json!({
                    "snapshot": snapshot_schema(),
                    "hotspots": array_schema(hotspot_evidence_schema(), 1, AGENT_HOTSPOT_LIMIT),
                    "paperIds": array_schema(string_schema(1, 256), 0, AGENT_HOTSPOT_LIMIT * AGENT_REPRESENTATIVES_PER_HOTSPOT),
                    "papers": array_schema(paper_evidence_schema(), 0, AGENT_HOTSPOT_LIMIT * AGENT_REPRESENTATIVES_PER_HOTSPOT),
                    "missingPaperIds": array_schema(string_schema(1, 256), 0, AGENT_HOTSPOT_LIMIT * AGENT_REPRESENTATIVES_PER_HOTSPOT),
                    "untrustedData": {"type": "boolean", "const": true},
                }),
                &[
                    "snapshot",
                    "hotspots",
                    "paperIds",
                    "papers",
                    "missingPaperIds",
                    "untrustedData",
                ],
            ),
            30_000,
            32 * 1024,
            1024 * 1024,
            &[],
            None,
        ),
        tool(
            "save_research_evidence",
            AgentRiskLevel::Write,
            true,
            true,
            strict_object(
                json!({
                    "topic": string_schema(1, 500),
                    // A persisted hotspot can legitimately resolve to fewer than three
                    // still-existing papers. Let the deterministic evidence builder
                    // classify that outcome so the executor can enter awaiting_user;
                    // rejecting it here would bypass the supervised recovery path.
                    "paperIds": array_schema(string_schema(1, 256), 0, AGENT_DEEP_REPORT_PAPER_LIMIT),
                    "hotspotIds": array_schema(string_schema(1, 256), 0, AGENT_HOTSPOT_LIMIT),
                    "mode": enum_string_schema(&["simple", "deep"]),
                }),
                &["topic", "paperIds", "mode"],
            ),
            artifact_receipt.clone(),
            30_000,
            64 * 1024,
            128 * 1024,
            &[],
            Some(AgentArtifactKind::Evidence),
        ),
        tool(
            "create_report_draft",
            AgentRiskLevel::Write,
            true,
            true,
            strict_object(
                json!({
                    "topic": string_schema(1, 500),
                    "evidenceArtifactId": string_schema(1, 128),
                    "mode": enum_string_schema(&["simple", "deep"]),
                }),
                &["topic", "evidenceArtifactId", "mode"],
            ),
            artifact_receipt.clone(),
            180_000,
            32 * 1024,
            128 * 1024,
            &["AGENT_NETWORK_TIMEOUT", "AGENT_HTTP_429", "AGENT_HTTP_5XX"],
            Some(AgentArtifactKind::ReportDraft),
        ),
        tool(
            "revise_report_draft",
            AgentRiskLevel::Write,
            true,
            true,
            strict_object(
                json!({
                    "reportArtifactId": string_schema(1, 128),
                    "auditArtifactId": string_schema(1, 128),
                    "instructions": string_schema(0, 4096),
                }),
                &["reportArtifactId", "auditArtifactId"],
            ),
            artifact_receipt.clone(),
            180_000,
            32 * 1024,
            128 * 1024,
            &["AGENT_NETWORK_TIMEOUT", "AGENT_HTTP_429", "AGENT_HTTP_5XX"],
            Some(AgentArtifactKind::ReportDraft),
        ),
        tool(
            "inspect_report_audit",
            AgentRiskLevel::Read,
            false,
            true,
            strict_object(
                json!({
                    "reportArtifactId": string_schema(1, 128),
                }),
                &["reportArtifactId"],
            ),
            artifact_receipt.clone(),
            30_000,
            16 * 1024,
            128 * 1024,
            &[],
            Some(AgentArtifactKind::ReportAudit),
        ),
        tool(
            "preview_paper_import",
            AgentRiskLevel::Read,
            false,
            false,
            strict_object(
                json!({"resourceGrantId":string_schema(1,128)}),
                &["resourceGrantId"],
            ),
            strict_object(
                json!({
                    "resourceGrantId":string_schema(1,128),"sourceFingerprint":string_schema(64,64),
                    "sourceKind":enum_string_schema(&["file","mysql"]),"totalRows":integer_schema(0,i64::MAX),
                    "validRows":integer_schema(0,i64::MAX),"invalidRows":integer_schema(0,i64::MAX),
                    "duplicateRows":integer_schema(0,i64::MAX),"previewHash":string_schema(64,64)
                }),
                &[
                    "resourceGrantId",
                    "sourceFingerprint",
                    "sourceKind",
                    "totalRows",
                    "validRows",
                    "invalidRows",
                    "duplicateRows",
                    "previewHash",
                ],
            ),
            120_000,
            16 * 1024,
            128 * 1024,
            &[],
            None,
        ),
        tool(
            "import_papers",
            AgentRiskLevel::High,
            true,
            false,
            strict_object(
                json!({"resourceGrantId":string_schema(1,128),"previewHash":string_schema(64,64)}),
                &["resourceGrantId", "previewHash"],
            ),
            artifact_receipt.clone(),
            600_000,
            16 * 1024,
            128 * 1024,
            &[],
            Some(AgentArtifactKind::ImportAudit),
        ),
        tool(
            "preview_library_clean",
            AgentRiskLevel::Read,
            false,
            false,
            strict_object(json!({}), &[]),
            strict_object(
                json!({
                    "libraryRevision":integer_schema(0,i64::MAX),"beforeCount":integer_schema(0,i64::MAX),
                    "normalizedCount":integer_schema(0,i64::MAX),"emptyCount":integer_schema(0,i64::MAX),
                    "duplicateCount":integer_schema(0,i64::MAX),"previewHash":string_schema(64,64)
                }),
                &[
                    "libraryRevision",
                    "beforeCount",
                    "normalizedCount",
                    "emptyCount",
                    "duplicateCount",
                    "previewHash",
                ],
            ),
            120_000,
            8 * 1024,
            128 * 1024,
            &[],
            None,
        ),
        tool(
            "clean_paper_library",
            AgentRiskLevel::High,
            true,
            false,
            strict_object(
                json!({"libraryRevision":integer_schema(0,i64::MAX),"previewHash":string_schema(64,64)}),
                &["libraryRevision", "previewHash"],
            ),
            artifact_receipt.clone(),
            600_000,
            16 * 1024,
            128 * 1024,
            &[],
            Some(AgentArtifactKind::MaintenanceAudit),
        ),
        tool(
            "inspect_v20_modeling_input",
            AgentRiskLevel::Read,
            false,
            false,
            strict_object(json!({}), &[]),
            strict_object(
                json!({"libraryRevision":integer_schema(0,i64::MAX),"paperCount":integer_schema(0,i64::MAX),"hasActiveSnapshot":{"type":"boolean"}}),
                &["libraryRevision", "paperCount", "hasActiveSnapshot"],
            ),
            30_000,
            8 * 1024,
            64 * 1024,
            &[],
            None,
        ),
        tool(
            "rebuild_v20_snapshot",
            AgentRiskLevel::High,
            true,
            false,
            strict_object(
                json!({"libraryRevision":integer_schema(0,i64::MAX),"paperCount":integer_schema(0,i64::MAX)}),
                &["libraryRevision", "paperCount"],
            ),
            artifact_receipt.clone(),
            900_000,
            16 * 1024,
            128 * 1024,
            &[],
            Some(AgentArtifactKind::SnapshotReference),
        ),
        tool(
            "export_report_artifact",
            AgentRiskLevel::High,
            true,
            false,
            strict_object(
                json!({
                    "reportArtifactId":string_schema(1,128),"resourceGrantId":string_schema(1,128),
                    "formats":array_schema(enum_string_schema(&["md","html"]),1,2)
                }),
                &["reportArtifactId", "resourceGrantId", "formats"],
            ),
            artifact_receipt,
            120_000,
            32 * 1024,
            128 * 1024,
            &[],
            Some(AgentArtifactKind::ExportManifest),
        ),
    ]
}

#[allow(clippy::too_many_arguments)]
fn tool(
    name: &str,
    risk: AgentRiskLevel,
    mutates_business_data: bool,
    requires_active_v20_snapshot: bool,
    input_schema: Value,
    output_schema: Value,
    timeout_ms: u64,
    max_input_bytes: usize,
    max_output_bytes: usize,
    retryable_errors: &[&str],
    artifact_kind: Option<AgentArtifactKind>,
) -> AgentToolDefinition {
    AgentToolDefinition {
        name: name.into(),
        version: "1.0.0".into(),
        risk,
        mutates_business_data,
        requires_active_v20_snapshot,
        input_schema,
        output_schema,
        timeout_ms,
        max_input_bytes,
        max_output_bytes,
        retryable_errors: retryable_errors
            .iter()
            .map(|value| (*value).into())
            .collect(),
        artifact_kind,
    }
}

fn strict_object(properties: Value, required: &[&str]) -> Value {
    json!({
        "type": "object",
        "properties": properties,
        "required": required,
        "additionalProperties": false,
    })
}

fn string_schema(min: usize, max: usize) -> Value {
    json!({"type": "string", "minLength": min, "maxLength": max})
}

fn enum_string_schema(values: &[&str]) -> Value {
    json!({"type": "string", "enum": values})
}

fn integer_schema(min: i64, max: i64) -> Value {
    json!({"type": "integer", "minimum": min, "maximum": max})
}

fn array_schema(items: Value, min: usize, max: usize) -> Value {
    json!({"type": "array", "items": items, "minItems": min, "maxItems": max})
}

fn nullable(schema: Value) -> Value {
    json!({"anyOf": [schema, {"type": "null"}]})
}

fn snapshot_schema() -> Value {
    strict_object(
        json!({
            "projectId": string_schema(1, 128),
            "snapshotId": string_schema(1, 128),
            "algorithmVersion": string_schema(1, 128),
            "paperCount": integer_schema(0, i64::MAX),
            "hotspotCount": integer_schema(0, i64::MAX),
            "membershipCount": integer_schema(0, i64::MAX),
        }),
        &[
            "projectId",
            "snapshotId",
            "algorithmVersion",
            "paperCount",
            "hotspotCount",
            "membershipCount",
        ],
    )
}

fn paper_summary_schema() -> Value {
    strict_object(
        json!({
            "id": string_schema(1, 256),
            "title": string_schema(0, 4096),
            "abstractExcerpt": string_schema(0, 2000),
            "year": nullable(integer_schema(0, 9999)),
            "source": string_schema(0, 256),
            "field": string_schema(0, 256),
            "untrustedData": {"type": "boolean", "const": true},
        }),
        &[
            "id",
            "title",
            "abstractExcerpt",
            "year",
            "source",
            "field",
            "untrustedData",
        ],
    )
}

fn paper_evidence_schema() -> Value {
    strict_object(
        json!({
            "id": string_schema(1, 256),
            "title": string_schema(0, 4096),
            "abstractText": string_schema(0, 65536),
            "authors": nullable(string_schema(0, 8192)),
            "categories": nullable(string_schema(0, 4096)),
            "year": nullable(integer_schema(0, 9999)),
            "source": string_schema(0, 256),
            "field": string_schema(0, 256),
            "doi": nullable(string_schema(0, 2048)),
            "url": nullable(string_schema(0, 4096)),
            "untrustedData": {"type": "boolean", "const": true},
        }),
        &[
            "id",
            "title",
            "abstractText",
            "authors",
            "categories",
            "year",
            "source",
            "field",
            "doi",
            "url",
            "untrustedData",
        ],
    )
}

fn hotspot_summary_schema() -> Value {
    strict_object(
        json!({
            "id": string_schema(1, 256),
            "title": string_schema(0, 4096),
            "field": string_schema(0, 256),
            "summary": string_schema(0, 8192),
            "keywords": array_schema(string_schema(1, 256), 0, 64),
            "paperCount": integer_schema(0, i64::MAX),
            "untrustedData": {"type": "boolean", "const": true},
        }),
        &[
            "id",
            "title",
            "field",
            "summary",
            "keywords",
            "paperCount",
            "untrustedData",
        ],
    )
}

fn hotspot_evidence_schema() -> Value {
    strict_object(
        json!({
            "id": string_schema(1, 256),
            "title": string_schema(0, 4096),
            "field": string_schema(0, 256),
            "keywords": array_schema(string_schema(1, 256), 0, 64),
            "representativePaperIds": array_schema(string_schema(1, 256), 0, AGENT_REPRESENTATIVES_PER_HOTSPOT),
        }),
        &["id", "title", "field", "keywords", "representativePaperIds"],
    )
}

fn artifact_pointer_schema() -> Value {
    strict_object(
        json!({
            "id": string_schema(1, 128),
            "kind": enum_string_schema(&["evidence", "report_draft", "report_audit"]),
            "contentHash": string_schema(64, 64),
        }),
        &["id", "kind", "contentHash"],
    )
}

fn validate_json_size(value: &Value, max: usize, code: &str) -> Result<(), String> {
    let size = serde_json::to_vec(value)
        .map_err(|error| format!("AGENT_JSON_SERIALIZE_FAILED:{error}"))?
        .len();
    if size > max {
        Err(format!("{code}:{size}>{max}"))
    } else {
        Ok(())
    }
}

pub fn validate_untrusted_json(value: &Value) -> Result<(), String> {
    validate_storable_json(value)?;
    fn walk(value: &Value) -> bool {
        match value {
            Value::String(text) => looks_like_credential(text),
            Value::Array(values) => values.iter().any(walk),
            Value::Object(values) => values.values().any(walk),
            _ => false,
        }
    }
    if walk(value) {
        Err("AGENT_JSON_CONTAINS_CREDENTIAL_PATTERN".into())
    } else {
        Ok(())
    }
}

fn looks_like_credential(value: &str) -> bool {
    let trimmed = value.trim();
    let lower = trimmed.to_ascii_lowercase();
    lower.contains("-----begin private key-----")
        || lower.contains("-----begin rsa private key-----")
        || token_after_prefix(trimmed, "Bearer ", 16)
        || token_after_prefix(trimmed, "sk-", 20)
        || token_after_prefix(trimmed, "ghp_", 20)
        || token_after_prefix(trimmed, "github_pat_", 20)
        || token_after_prefix(trimmed, "AKIA", 16)
}

fn token_after_prefix(value: &str, prefix: &str, minimum_len: usize) -> bool {
    value.find(prefix).is_some_and(|index| {
        value[index + prefix.len()..]
            .split_whitespace()
            .next()
            .is_some_and(|token| {
                token.len() >= minimum_len
                    && token
                        .bytes()
                        .all(|byte| byte.is_ascii_alphanumeric() || b"-_.".contains(&byte))
            })
    })
}

fn validate_schema(schema: &Value, value: &Value, allow_refs: bool) -> Result<(), String> {
    validate_schema_at(schema, value, allow_refs, "$", 0)
}

fn validate_schema_at(
    schema: &Value,
    value: &Value,
    allow_refs: bool,
    path: &str,
    depth: usize,
) -> Result<(), String> {
    if depth > 32 {
        return Err(format!("{path}:max_depth"));
    }
    if allow_refs && is_dynamic_reference(value) {
        parse_dynamic_reference(value)?;
        return Ok(());
    }
    if let Some(variants) = schema.get("anyOf").and_then(Value::as_array) {
        if variants
            .iter()
            .any(|variant| validate_schema_at(variant, value, allow_refs, path, depth + 1).is_ok())
        {
            return Ok(());
        }
        return Err(format!("{path}:no_any_of_variant_matched"));
    }
    let schema_type = schema
        .get("type")
        .and_then(Value::as_str)
        .ok_or_else(|| format!("{path}:schema_type_missing"))?;
    match schema_type {
        "object" => {
            let object = value
                .as_object()
                .ok_or_else(|| format!("{path}:expected_object"))?;
            let properties = schema
                .get("properties")
                .and_then(Value::as_object)
                .ok_or_else(|| format!("{path}:schema_properties_missing"))?;
            if let Some(required) = schema.get("required").and_then(Value::as_array) {
                for key in required.iter().filter_map(Value::as_str) {
                    if !object.contains_key(key) {
                        return Err(format!("{path}.{key}:required"));
                    }
                }
            }
            if schema.get("additionalProperties").and_then(Value::as_bool) == Some(false) {
                for key in object.keys() {
                    if !properties.contains_key(key) {
                        return Err(format!("{path}.{key}:unknown_field"));
                    }
                }
            }
            for (key, child) in object {
                if let Some(child_schema) = properties.get(key) {
                    validate_schema_at(
                        child_schema,
                        child,
                        allow_refs,
                        &format!("{path}.{key}"),
                        depth + 1,
                    )?;
                }
            }
        }
        "array" => {
            let values = value
                .as_array()
                .ok_or_else(|| format!("{path}:expected_array"))?;
            let min = schema.get("minItems").and_then(Value::as_u64).unwrap_or(0) as usize;
            let max = schema
                .get("maxItems")
                .and_then(Value::as_u64)
                .unwrap_or(usize::MAX as u64) as usize;
            if values.len() < min || values.len() > max {
                return Err(format!(
                    "{path}:item_count:{} not_in {min}..={max}",
                    values.len()
                ));
            }
            let item_schema = schema
                .get("items")
                .ok_or_else(|| format!("{path}:items_schema_missing"))?;
            for (index, child) in values.iter().enumerate() {
                validate_schema_at(
                    item_schema,
                    child,
                    allow_refs,
                    &format!("{path}[{index}]"),
                    depth + 1,
                )?;
            }
        }
        "string" => {
            let text = value
                .as_str()
                .ok_or_else(|| format!("{path}:expected_string"))?;
            let length = text.chars().count();
            let min = schema.get("minLength").and_then(Value::as_u64).unwrap_or(0) as usize;
            let max = schema
                .get("maxLength")
                .and_then(Value::as_u64)
                .unwrap_or(usize::MAX as u64) as usize;
            if length < min || length > max {
                return Err(format!(
                    "{path}:string_length:{length} not_in {min}..={max}"
                ));
            }
            if let Some(values) = schema.get("enum").and_then(Value::as_array) {
                if !values
                    .iter()
                    .any(|candidate| candidate.as_str() == Some(text))
                {
                    return Err(format!("{path}:enum"));
                }
            }
            if let Some(expected) = schema.get("const") {
                if expected != value {
                    return Err(format!("{path}:const"));
                }
            }
        }
        "integer" => {
            let number = value
                .as_i64()
                .ok_or_else(|| format!("{path}:expected_integer"))?;
            let min = schema
                .get("minimum")
                .and_then(Value::as_i64)
                .unwrap_or(i64::MIN);
            let max = schema
                .get("maximum")
                .and_then(Value::as_i64)
                .unwrap_or(i64::MAX);
            if number < min || number > max {
                return Err(format!("{path}:range:{number} not_in {min}..={max}"));
            }
        }
        "number" => {
            if !value.as_f64().is_some_and(f64::is_finite) {
                return Err(format!("{path}:expected_finite_number"));
            }
        }
        "boolean" => {
            if !value.is_boolean() {
                return Err(format!("{path}:expected_boolean"));
            }
            if let Some(expected) = schema.get("const") {
                if expected != value {
                    return Err(format!("{path}:const"));
                }
            }
        }
        "null" if !value.is_null() => return Err(format!("{path}:expected_null")),
        "null" => {}
        other => return Err(format!("{path}:unsupported_schema_type:{other}")),
    }
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AgentInputReferenceTarget {
    pub step_id: String,
    pub pointer: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct AgentInputReference {
    #[serde(rename = "$ref")]
    pub target: AgentInputReferenceTarget,
}

#[derive(Debug, Clone, PartialEq)]
pub struct AgentReferenceSource {
    pub step_id: String,
    pub order_index: usize,
    pub succeeded: bool,
    pub output: Value,
}

pub fn resolve_dynamic_input(
    planned_input: &Value,
    current_step_index: usize,
    sources: &[AgentReferenceSource],
) -> Result<Value, String> {
    let source_map = sources
        .iter()
        .map(|source| (source.step_id.as_str(), source))
        .collect::<HashMap<_, _>>();
    resolve_dynamic_value(planned_input, current_step_index, &source_map, 0)
}

fn resolve_dynamic_value(
    value: &Value,
    current_step_index: usize,
    sources: &HashMap<&str, &AgentReferenceSource>,
    depth: usize,
) -> Result<Value, String> {
    if depth > 32 {
        return Err("AGENT_DYNAMIC_REF_MAX_DEPTH".into());
    }
    if is_dynamic_reference(value) {
        let reference = parse_dynamic_reference(value)?;
        let source = sources
            .get(reference.target.step_id.as_str())
            .ok_or_else(|| "AGENT_DYNAMIC_REF_SOURCE_UNKNOWN".to_string())?;
        if source.order_index >= current_step_index {
            return Err("AGENT_DYNAMIC_REF_NOT_PRIOR".into());
        }
        if !source.succeeded {
            return Err("AGENT_DYNAMIC_REF_SOURCE_NOT_SUCCEEDED".into());
        }
        let pointer = reference.target.pointer.as_str();
        if pointer.is_empty() || !pointer.starts_with('/') || pointer.len() > 512 {
            return Err("AGENT_DYNAMIC_REF_POINTER_INVALID".into());
        }
        return source
            .output
            .pointer(pointer)
            .cloned()
            .ok_or_else(|| "AGENT_DYNAMIC_REF_POINTER_NOT_FOUND".into());
    }
    match value {
        Value::Array(values) => values
            .iter()
            .map(|child| resolve_dynamic_value(child, current_step_index, sources, depth + 1))
            .collect::<Result<Vec<_>, _>>()
            .map(Value::Array),
        Value::Object(values) => values
            .iter()
            .map(|(key, child)| {
                Ok((
                    key.clone(),
                    resolve_dynamic_value(child, current_step_index, sources, depth + 1)?,
                ))
            })
            .collect::<Result<Map<_, _>, String>>()
            .map(Value::Object),
        _ => Ok(value.clone()),
    }
}

fn is_dynamic_reference(value: &Value) -> bool {
    value
        .as_object()
        .is_some_and(|object| object.len() == 1 && object.contains_key("$ref"))
}

fn parse_dynamic_reference(value: &Value) -> Result<AgentInputReference, String> {
    serde_json::from_value(value.clone()).map_err(|_| "AGENT_DYNAMIC_REF_INVALID".into())
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AgentLibraryState {
    pub library_instance_id: String,
    pub project_id: String,
    pub schema_version: i64,
    pub paper_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AgentSnapshotState {
    pub project_id: String,
    pub snapshot_id: String,
    pub algorithm_version: String,
    pub paper_count: i64,
    pub hotspot_count: i64,
    pub membership_count: i64,
}

impl From<AnalysisState> for AgentSnapshotState {
    fn from(value: AnalysisState) -> Self {
        Self {
            project_id: value.project_id,
            snapshot_id: value.active_snapshot_id,
            algorithm_version: value.algorithm_version,
            paper_count: value.paper_count,
            hotspot_count: value.hotspot_count,
            membership_count: value.membership_count,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AgentPaperSummary {
    pub id: String,
    pub title: String,
    pub abstract_excerpt: String,
    pub year: Option<i64>,
    pub source: String,
    pub field: String,
    pub untrusted_data: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AgentPaperEvidence {
    pub id: String,
    pub title: String,
    pub abstract_text: String,
    pub authors: Option<String>,
    pub categories: Option<String>,
    pub year: Option<i64>,
    pub source: String,
    pub field: String,
    pub doi: Option<String>,
    pub url: Option<String>,
    pub untrusted_data: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AgentHotspotSummary {
    pub id: String,
    pub title: String,
    pub field: String,
    pub summary: String,
    pub keywords: Vec<String>,
    pub paper_count: i64,
    pub untrusted_data: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AgentHotspotEvidence {
    pub id: String,
    pub title: String,
    pub field: String,
    pub keywords: Vec<String>,
    pub representative_paper_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AgentPapersByIdResult {
    pub papers: Vec<AgentPaperEvidence>,
    pub missing_paper_ids: Vec<String>,
    pub untrusted_data: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AgentHotspotEvidenceResult {
    pub snapshot: AgentSnapshotState,
    pub hotspots: Vec<AgentHotspotEvidence>,
    pub paper_ids: Vec<String>,
    pub papers: Vec<AgentPaperEvidence>,
    pub missing_paper_ids: Vec<String>,
    pub untrusted_data: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AgentReadToolContext {
    pub project_id: String,
}

pub fn execute_read_tool(
    conn: &Connection,
    registry: &AgentToolRegistry,
    context: &AgentReadToolContext,
    name: &str,
    input: &Value,
) -> Result<Value, String> {
    let definition = registry.get(name)?;
    if definition.risk != AgentRiskLevel::Read || definition.mutates_business_data {
        return Err(format!("AGENT_TOOL_NOT_READ_ONLY:{name}"));
    }
    registry.validate_resolved_input(name, input)?;
    if definition.requires_active_v20_snapshot {
        inspect_v20_snapshot(conn, &context.project_id)?;
    }
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase", deny_unknown_fields)]
    struct SearchInput {
        query: String,
        limit: Option<usize>,
    }
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase", deny_unknown_fields)]
    struct PaperIdsInput {
        paper_ids: Vec<String>,
    }
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase", deny_unknown_fields)]
    struct HotspotInput {
        hotspot_ids: Vec<String>,
        max_papers_per_hotspot: Option<usize>,
    }
    let output = match name {
        "inspect_library_state" => {
            serde_json::to_value(inspect_library_state(conn, &context.project_id)?)
                .map_err(|error| error.to_string())?
        }
        "inspect_v20_snapshot" => {
            serde_json::to_value(inspect_v20_snapshot(conn, &context.project_id)?)
                .map_err(|error| error.to_string())?
        }
        "search_local_papers" => {
            let input: SearchInput = serde_json::from_value(input.clone())
                .map_err(|error| format!("AGENT_TOOL_INPUT_DECODE_FAILED:{error}"))?;
            let (papers, truncated) = search_local_papers_page(
                conn,
                &context.project_id,
                &input.query,
                input.limit.unwrap_or(AGENT_SEARCH_PAPER_LIMIT),
            )?;
            json!({"papers": papers, "truncated": truncated, "untrustedData": true})
        }
        "search_v20_hotspots" => {
            let input: SearchInput = serde_json::from_value(input.clone())
                .map_err(|error| format!("AGENT_TOOL_INPUT_DECODE_FAILED:{error}"))?;
            let (snapshot, hotspots) = search_v20_hotspots(
                conn,
                &context.project_id,
                &input.query,
                input.limit.unwrap_or(AGENT_SEARCH_HOTSPOT_LIMIT),
            )?;
            json!({"snapshot": snapshot, "hotspots": hotspots, "untrustedData": true})
        }
        "get_papers_by_ids" => {
            let input: PaperIdsInput = serde_json::from_value(input.clone())
                .map_err(|error| format!("AGENT_TOOL_INPUT_DECODE_FAILED:{error}"))?;
            serde_json::to_value(get_papers_by_ids(
                conn,
                &context.project_id,
                &input.paper_ids,
            )?)
            .map_err(|error| error.to_string())?
        }
        "load_hotspot_evidence" => {
            let input: HotspotInput = serde_json::from_value(input.clone())
                .map_err(|error| format!("AGENT_TOOL_INPUT_DECODE_FAILED:{error}"))?;
            serde_json::to_value(load_hotspot_evidence(
                conn,
                &context.project_id,
                &input.hotspot_ids,
                input
                    .max_papers_per_hotspot
                    .unwrap_or(AGENT_REPRESENTATIVES_PER_HOTSPOT),
            )?)
            .map_err(|error| error.to_string())?
        }
        "inspect_report_audit" => {
            return Err("AGENT_REPORT_ARTIFACT_CONTEXT_REQUIRED".into());
        }
        "preview_paper_import" => {
            let grant_id = input
                .get("resourceGrantId")
                .and_then(Value::as_str)
                .ok_or("AGENT_RESOURCE_GRANT_REQUIRED")?;
            let now_ms = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map_err(|_| "AGENT_SYSTEM_CLOCK_INVALID")?
                .as_millis()
                .min(i64::MAX as u128) as i64;
            let grant = AgentCapabilityRepository::new(conn)?.resource_grant(grant_id, now_ms)?;
            let source_kind = match grant.grant_kind {
                crate::agent_capabilities::AgentResourceGrantKind::ImportFile => "file",
                crate::agent_capabilities::AgentResourceGrantKind::MysqlProfile => "mysql",
                _ => return Err("AGENT_RESOURCE_GRANT_KIND_MISMATCH".into()),
            };
            let total = grant
                .metadata
                .get("totalRows")
                .and_then(Value::as_i64)
                .unwrap_or(0)
                .max(0);
            let valid = grant
                .metadata
                .get("validRows")
                .and_then(Value::as_i64)
                .unwrap_or(total)
                .clamp(0, total);
            let invalid = grant
                .metadata
                .get("invalidRows")
                .and_then(Value::as_i64)
                .unwrap_or(total - valid)
                .max(0);
            let duplicates = grant
                .metadata
                .get("duplicateRows")
                .and_then(Value::as_i64)
                .unwrap_or(0)
                .max(0);
            let preview_hash = canonical_value_sha256(
                &json!({"grant":grant.id,"fingerprint":grant.fingerprint_sha256,"metadata":grant.metadata}),
            )?;
            json!({"resourceGrantId":grant.id,"sourceFingerprint":grant.fingerprint_sha256,"sourceKind":source_kind,"totalRows":total,"validRows":valid,"invalidRows":invalid,"duplicateRows":duplicates,"previewHash":preview_hash})
        }
        "preview_library_clean" => preview_library_clean(conn, &context.project_id)?,
        "inspect_v20_modeling_input" => {
            let revision = current_library_revision(conn, &context.project_id)?;
            let paper_count: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM papers WHERE project_id=?1",
                    params![context.project_id],
                    |row| row.get(0),
                )
                .map_err(|e| e.to_string())?;
            let has_active = validate_active_snapshot(conn, &context.project_id)
                .ok()
                .flatten()
                .is_some();
            json!({"libraryRevision":revision,"paperCount":paper_count,"hasActiveSnapshot":has_active})
        }
        _ => return Err(format!("AGENT_TOOL_NOT_CORE_READ_QUERY:{name}")),
    };
    registry.validate_output(name, &output)?;
    Ok(output)
}

fn preview_library_clean(conn: &Connection, project_id: &str) -> Result<Value, String> {
    let revision = current_library_revision(conn, project_id)?;
    let mut stmt = conn
        .prepare("SELECT id,title,abstract,doi,url FROM papers WHERE project_id=?1 ORDER BY id")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![project_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, Option<String>>(4)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    let before = rows.len() as i64;
    let mut normalized = 0_i64;
    let mut empty = 0_i64;
    let mut duplicate = 0_i64;
    let mut seen = HashSet::new();
    for (id, title, abstract_text, doi, url) in rows {
        let clean_title = title.split_whitespace().collect::<Vec<_>>().join(" ");
        let clean_abstract = abstract_text
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ");
        if clean_title.is_empty() || clean_abstract.is_empty() {
            empty += 1;
            continue;
        }
        if clean_title != title || clean_abstract != abstract_text {
            normalized += 1
        }
        let key = doi
            .filter(|v| !v.trim().is_empty())
            .map(|v| format!("doi:{}", v.trim().to_lowercase()))
            .or_else(|| {
                url.filter(|v| !v.trim().is_empty())
                    .map(|v| format!("url:{}", v.trim().to_lowercase()))
            })
            .unwrap_or_else(|| format!("title:{}", clean_title.to_lowercase()));
        if !seen.insert(key) {
            duplicate += 1
        }
        let _ = id;
    }
    let base = json!({"libraryRevision":revision,"beforeCount":before,"normalizedCount":normalized,"emptyCount":empty,"duplicateCount":duplicate});
    let hash = canonical_value_sha256(&base)?;
    let mut out = base;
    out["previewHash"] = Value::String(hash);
    Ok(out)
}

pub fn inspect_library_state(
    conn: &Connection,
    project_id: &str,
) -> Result<AgentLibraryState, String> {
    let schema_version = conn
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(|error| error.to_string())?;
    let paper_count = conn
        .query_row(
            "SELECT COUNT(*) FROM papers WHERE project_id = ?1",
            params![project_id],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    let has_meta: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='agent_meta')",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map(|value| value != 0)
        .map_err(|error| error.to_string())?;
    let library_instance_id = if has_meta {
        conn.query_row(
            "SELECT value FROM agent_meta WHERE key = 'libraryInstanceId'",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())?
        .unwrap_or_else(|| "uninitialized".into())
    } else {
        "legacy".into()
    };
    Ok(AgentLibraryState {
        library_instance_id,
        project_id: project_id.into(),
        schema_version,
        paper_count,
    })
}

pub fn inspect_v20_snapshot(
    conn: &Connection,
    project_id: &str,
) -> Result<AgentSnapshotState, String> {
    validate_active_snapshot(conn, project_id)?
        .map(AgentSnapshotState::from)
        .ok_or_else(|| "AGENT_V20_SNAPSHOT_REQUIRED".into())
}

pub fn search_local_papers(
    conn: &Connection,
    project_id: &str,
    query: &str,
    limit: usize,
) -> Result<Vec<AgentPaperSummary>, String> {
    search_local_papers_page(conn, project_id, query, limit).map(|(rows, _)| rows)
}

fn search_local_papers_page(
    conn: &Connection,
    project_id: &str,
    query: &str,
    limit: usize,
) -> Result<(Vec<AgentPaperSummary>, bool), String> {
    let query = query.trim();
    if query.is_empty() || query.chars().count() > 500 {
        return Err("AGENT_SEARCH_QUERY_INVALID".into());
    }
    if limit == 0 || limit > AGENT_SEARCH_PAPER_LIMIT {
        return Err("AGENT_SEARCH_PAPER_LIMIT_INVALID".into());
    }
    let pattern = format!(
        "%{}%",
        query
            .replace('\\', "\\\\")
            .replace('%', "\\%")
            .replace('_', "\\_")
    );
    let mut stmt = conn
        .prepare(
            "SELECT id, title, abstract, year, source, field
             FROM papers
             WHERE project_id = ?1
               AND (search_blob LIKE ?2 ESCAPE '\\' OR title LIKE ?2 ESCAPE '\\' OR abstract LIKE ?2 ESCAPE '\\')
             ORDER BY COALESCE(year, 0) DESC, updated_at DESC, id ASC
             LIMIT ?3",
        )
        .map_err(|error| error.to_string())?;
    let mut rows = stmt
        .query_map(
            params![project_id, pattern, limit.saturating_add(1) as i64],
            |row| {
                let abstract_text: String = row.get(2)?;
                Ok(AgentPaperSummary {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    abstract_excerpt: truncate_chars(&abstract_text, 480),
                    year: row.get(3)?,
                    source: row.get(4)?,
                    field: row.get(5)?,
                    untrusted_data: true,
                })
            },
        )
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    let truncated = rows.len() > limit;
    rows.truncate(limit);
    Ok((rows, truncated))
}

pub fn search_v20_hotspots(
    conn: &Connection,
    project_id: &str,
    query: &str,
    limit: usize,
) -> Result<(AgentSnapshotState, Vec<AgentHotspotSummary>), String> {
    let query = query.trim().to_lowercase();
    if query.is_empty() || query.chars().count() > 500 {
        return Err("AGENT_SEARCH_QUERY_INVALID".into());
    }
    if limit == 0 || limit > AGENT_SEARCH_HOTSPOT_LIMIT {
        return Err("AGENT_SEARCH_HOTSPOT_LIMIT_INVALID".into());
    }
    let snapshot = inspect_v20_snapshot(conn, project_id)?;
    let mut stmt = conn
        .prepare(
            "SELECT hotspot_id, payload_json, paper_count
             FROM v20_hotspots
             WHERE project_id = ?1 AND snapshot_id = ?2",
        )
        .map_err(|error| error.to_string())?;
    let rows = stmt
        .query_map(params![project_id, snapshot.snapshot_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?,
            ))
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    let terms = query.split_whitespace().collect::<Vec<_>>();
    let mut matches = rows
        .into_iter()
        .filter_map(|(id, payload_json, paper_count)| {
            let payload: Value = serde_json::from_str(&payload_json).ok()?;
            let title = payload_string(&payload, "title");
            let field = payload_string(&payload, "field");
            let summary = payload_string(&payload, "summary");
            let keywords = payload_strings(&payload, "keywords");
            let searchable =
                format!("{title} {field} {summary} {}", keywords.join(" ")).to_lowercase();
            let score = terms
                .iter()
                .filter(|term| searchable.contains(**term))
                .count();
            (score > 0).then_some((
                score,
                AgentHotspotSummary {
                    id,
                    title,
                    field,
                    summary,
                    keywords,
                    paper_count,
                    untrusted_data: true,
                },
            ))
        })
        .collect::<Vec<_>>();
    matches.sort_by(|left, right| {
        right
            .0
            .cmp(&left.0)
            .then_with(|| right.1.paper_count.cmp(&left.1.paper_count))
            .then_with(|| left.1.id.cmp(&right.1.id))
    });
    Ok((
        snapshot,
        matches
            .into_iter()
            .take(limit)
            .map(|(_, row)| row)
            .collect(),
    ))
}

pub fn get_papers_by_ids(
    conn: &Connection,
    project_id: &str,
    paper_ids: &[String],
) -> Result<AgentPapersByIdResult, String> {
    if paper_ids.is_empty() || paper_ids.len() > AGENT_SEARCH_PAPER_LIMIT {
        return Err("AGENT_PAPER_ID_LIMIT_INVALID".into());
    }
    get_papers_by_ids_with_limit(conn, project_id, paper_ids, AGENT_SEARCH_PAPER_LIMIT)
}

fn get_papers_by_ids_with_limit(
    conn: &Connection,
    project_id: &str,
    paper_ids: &[String],
    maximum: usize,
) -> Result<AgentPapersByIdResult, String> {
    if paper_ids.len() > maximum {
        return Err("AGENT_PAPER_ID_LIMIT_INVALID".into());
    }
    let mut stmt = conn
        .prepare(
            "SELECT id, title, abstract, authors, categories, year, source, field, doi, url
             FROM papers WHERE project_id = ?1 AND id = ?2",
        )
        .map_err(|error| error.to_string())?;
    let mut papers = Vec::new();
    let mut missing_paper_ids = Vec::new();
    let mut seen = HashSet::new();
    for id in paper_ids {
        let id = id.trim();
        if id.is_empty() || !seen.insert(id.to_string()) {
            continue;
        }
        let paper = stmt
            .query_row(params![project_id, id], |row| {
                Ok(AgentPaperEvidence {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    abstract_text: truncate_chars(&row.get::<_, String>(2)?, 16_000),
                    authors: row.get(3)?,
                    categories: row.get(4)?,
                    year: row.get(5)?,
                    source: row.get(6)?,
                    field: row.get(7)?,
                    doi: row.get(8)?,
                    url: row.get(9)?,
                    untrusted_data: true,
                })
            })
            .optional()
            .map_err(|error| error.to_string())?;
        if let Some(paper) = paper {
            papers.push(paper);
        } else {
            missing_paper_ids.push(id.to_string());
        }
    }
    Ok(AgentPapersByIdResult {
        papers,
        missing_paper_ids,
        untrusted_data: true,
    })
}

pub fn load_hotspot_evidence(
    conn: &Connection,
    project_id: &str,
    hotspot_ids: &[String],
    max_papers_per_hotspot: usize,
) -> Result<AgentHotspotEvidenceResult, String> {
    if hotspot_ids.is_empty() || hotspot_ids.len() > AGENT_HOTSPOT_LIMIT {
        return Err("AGENT_HOTSPOT_ID_LIMIT_INVALID".into());
    }
    if max_papers_per_hotspot == 0 || max_papers_per_hotspot > AGENT_REPRESENTATIVES_PER_HOTSPOT {
        return Err("AGENT_HOTSPOT_EVIDENCE_LIMIT_INVALID".into());
    }
    let snapshot = inspect_v20_snapshot(conn, project_id)?;
    let mut hotspot_stmt = conn
        .prepare(
            "SELECT payload_json FROM v20_hotspots
             WHERE project_id = ?1 AND snapshot_id = ?2 AND hotspot_id = ?3",
        )
        .map_err(|error| error.to_string())?;
    let mut rank_stmt = conn
        .prepare(
            "SELECT paper_id FROM v20_paper_memberships
             WHERE project_id = ?1 AND snapshot_id = ?2 AND hotspot_id = ?3
               AND representative_rank IS NOT NULL
             ORDER BY representative_rank ASC, paper_id ASC LIMIT ?4",
        )
        .map_err(|error| error.to_string())?;
    let mut hotspots = Vec::new();
    let mut representative_ids = Vec::new();
    let mut all_seen = HashSet::new();
    let mut hotspot_seen = HashSet::new();
    for hotspot_id in hotspot_ids {
        let hotspot_id = hotspot_id.trim();
        if hotspot_id.is_empty() || !hotspot_seen.insert(hotspot_id.to_string()) {
            continue;
        }
        let payload_json = hotspot_stmt
            .query_row(
                params![project_id, snapshot.snapshot_id, hotspot_id],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(|error| error.to_string())?
            .ok_or_else(|| format!("AGENT_HOTSPOT_NOT_IN_ACTIVE_SNAPSHOT:{hotspot_id}"))?;
        let payload: Value = serde_json::from_str(&payload_json)
            .map_err(|_| format!("AGENT_HOTSPOT_PAYLOAD_INVALID:{hotspot_id}"))?;
        let mut ids = representative_ids_from_payload(&payload);
        if ids.is_empty() {
            ids = rank_stmt
                .query_map(
                    params![
                        project_id,
                        snapshot.snapshot_id,
                        hotspot_id,
                        max_papers_per_hotspot as i64
                    ],
                    |row| row.get::<_, String>(0),
                )
                .map_err(|error| error.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|error| error.to_string())?;
        }
        ids.truncate(max_papers_per_hotspot);
        ids.retain(|id| !id.trim().is_empty());
        ids.dedup();
        for id in &ids {
            if all_seen.insert(id.clone()) {
                representative_ids.push(id.clone());
            }
        }
        hotspots.push(AgentHotspotEvidence {
            id: hotspot_id.to_string(),
            title: payload_string(&payload, "title"),
            field: payload_string(&payload, "field"),
            keywords: payload_strings(&payload, "keywords"),
            representative_paper_ids: ids,
        });
    }
    let papers = get_papers_by_ids_with_limit(
        conn,
        project_id,
        &representative_ids,
        AGENT_HOTSPOT_LIMIT * AGENT_REPRESENTATIVES_PER_HOTSPOT,
    )?;
    Ok(AgentHotspotEvidenceResult {
        snapshot,
        hotspots,
        paper_ids: papers.papers.iter().map(|paper| paper.id.clone()).collect(),
        papers: papers.papers,
        missing_paper_ids: papers.missing_paper_ids,
        untrusted_data: true,
    })
}

fn representative_ids_from_payload(payload: &Value) -> Vec<String> {
    let mut ids = Vec::new();
    let mut seen = HashSet::new();
    let evidence = payload
        .get("analysis")
        .and_then(|value| value.get("evidencePaperIds"))
        .and_then(Value::as_array)
        .into_iter()
        .flatten();
    let evolution = payload
        .get("evolution")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_object)
        .flat_map(|row| {
            row.get("representativeIds")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
        });
    for id in evidence.chain(evolution).filter_map(Value::as_str) {
        let id = id.trim();
        if !id.is_empty() && seen.insert(id.to_string()) {
            ids.push(id.to_string());
        }
    }
    ids
}

fn payload_string(payload: &Value, key: &str) -> String {
    payload
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn payload_strings(payload: &Value, key: &str) -> Vec<String> {
    payload
        .get(key)
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .take(64)
        .map(str::to_string)
        .collect()
}

fn truncate_chars(value: &str, limit: usize) -> String {
    if value.chars().count() <= limit {
        value.to_string()
    } else {
        value
            .chars()
            .take(limit.saturating_sub(1))
            .collect::<String>()
            + "…"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_is_stable_complete_and_governs_risk() {
        let first = AgentToolRegistry::standard().unwrap();
        let second = AgentToolRegistry::standard().unwrap();
        assert_eq!(first.hash(), second.hash());
        assert_eq!(first.definitions().len(), 17);
        let mut reordered = first.definitions().to_vec();
        reordered.reverse();
        assert_eq!(
            first.hash(),
            AgentToolRegistry::new(reordered).unwrap().hash()
        );
        assert_eq!(
            first.get("save_research_evidence").unwrap().risk,
            AgentRiskLevel::Write
        );
        assert_eq!(
            first
                .validate_planned_call(
                    "save_research_evidence",
                    "1.0.0",
                    AgentRiskLevel::Read,
                    &json!({"topic":"t","paperIds":["1","2","3"],"mode":"simple"}),
                )
                .unwrap_err(),
            "AGENT_TOOL_RISK_MISMATCH:save_research_evidence"
        );
        assert_eq!(
            first
                .validate_planned_call(
                    "delete_everything",
                    "1.0.0",
                    AgentRiskLevel::Read,
                    &json!({}),
                )
                .unwrap_err(),
            "AGENT_TOOL_UNKNOWN:delete_everything"
        );
    }

    #[test]
    fn any_registry_definition_change_invalidates_the_registry_hash() {
        let original = AgentToolRegistry::standard().unwrap();
        let mut changed_version = original.definitions().to_vec();
        changed_version[0].version = "1.0.1".into();
        let changed_version = AgentToolRegistry::new(changed_version).unwrap();
        assert_ne!(original.hash(), changed_version.hash());

        let mut changed_schema = original.definitions().to_vec();
        changed_schema[0].max_output_bytes += 1;
        let changed_schema = AgentToolRegistry::new(changed_schema).unwrap();
        assert_ne!(original.hash(), changed_schema.hash());
    }

    #[test]
    fn registry_rejects_unknown_fields_limits_and_credentials() {
        let registry = AgentToolRegistry::standard().unwrap();
        assert!(registry
            .validate_planned_call(
                "search_local_papers",
                "1.0.0",
                AgentRiskLevel::Read,
                &json!({"query":"quantum","unknown":true}),
            )
            .unwrap_err()
            .contains("unknown_field"));
        assert!(registry
            .validate_planned_call(
                "get_papers_by_ids",
                "1.0.0",
                AgentRiskLevel::Read,
                &json!({"paperIds": (0..21).map(|index| index.to_string()).collect::<Vec<_>>() }),
            )
            .unwrap_err()
            .contains("item_count"));
        assert_eq!(
            registry
                .validate_planned_call(
                    "search_local_papers",
                    "1.0.0",
                    AgentRiskLevel::Read,
                    &json!({"query":"Bearer abcdefghijklmnopqrstuvwxyz"}),
                )
                .unwrap_err(),
            "AGENT_JSON_CONTAINS_CREDENTIAL_PATTERN"
        );
        assert_eq!(
            registry
                .validate_planned_call(
                    "save_research_evidence",
                    "1.0.0",
                    AgentRiskLevel::Write,
                    &json!({
                        "topic":"quantum",
                        "paperIds": (0..41).map(|index| format!("p{index}")).collect::<Vec<_>>(),
                        "mode":"simple"
                    }),
                )
                .unwrap_err(),
            "AGENT_SIMPLE_REPORT_PAPER_LIMIT_EXCEEDED"
        );
    }

    #[test]
    fn dynamic_refs_only_resolve_prior_successful_structured_outputs() {
        let sources = vec![AgentReferenceSource {
            step_id: "collect".into(),
            order_index: 0,
            succeeded: true,
            output: json!({"artifacts":[{"id":"evidence-1"}]}),
        }];
        let planned = json!({
            "topic":"quantum",
            "mode":"simple",
            "evidenceArtifactId":{"$ref":{"stepId":"collect","pointer":"/artifacts/0/id"}}
        });
        let resolved = resolve_dynamic_input(&planned, 1, &sources).unwrap();
        assert_eq!(resolved["evidenceArtifactId"], "evidence-1");
        let registry = AgentToolRegistry::standard().unwrap();
        registry
            .validate_resolved_input("create_report_draft", &resolved)
            .unwrap();
        assert_eq!(
            resolve_dynamic_input(&planned, 0, &sources).unwrap_err(),
            "AGENT_DYNAMIC_REF_NOT_PRIOR"
        );
        let mut failed = sources;
        failed[0].succeeded = false;
        assert_eq!(
            resolve_dynamic_input(&planned, 1, &failed).unwrap_err(),
            "AGENT_DYNAMIC_REF_SOURCE_NOT_SUCCEEDED"
        );
    }

    #[test]
    fn dynamic_refs_reject_future_missing_and_invalid_json_pointers() {
        let sources = vec![
            AgentReferenceSource {
                step_id: "prior".into(),
                order_index: 0,
                succeeded: true,
                output: json!({"escaped/key":{"~value":"ok"}}),
            },
            AgentReferenceSource {
                step_id: "future".into(),
                order_index: 2,
                succeeded: true,
                output: json!({"value":"forbidden"}),
            },
        ];
        let escaped =
            json!({"value":{"$ref":{"stepId":"prior","pointer":"/escaped~1key/~0value"}}});
        assert_eq!(
            resolve_dynamic_input(&escaped, 1, &sources).unwrap()["value"],
            "ok"
        );
        let future = json!({"value":{"$ref":{"stepId":"future","pointer":"/value"}}});
        assert_eq!(
            resolve_dynamic_input(&future, 1, &sources).unwrap_err(),
            "AGENT_DYNAMIC_REF_NOT_PRIOR"
        );
        let missing = json!({"value":{"$ref":{"stepId":"prior","pointer":"/missing"}}});
        assert_eq!(
            resolve_dynamic_input(&missing, 1, &sources).unwrap_err(),
            "AGENT_DYNAMIC_REF_POINTER_NOT_FOUND"
        );
        let invalid = json!({"value":{"$ref":{"stepId":"prior","pointer":"escaped/key"}}});
        assert_eq!(
            resolve_dynamic_input(&invalid, 1, &sources).unwrap_err(),
            "AGENT_DYNAMIC_REF_POINTER_INVALID"
        );
    }

    #[test]
    fn planned_schema_accepts_refs_but_resolved_schema_does_not() {
        let registry = AgentToolRegistry::standard().unwrap();
        let input = json!({
            "topic":"quantum",
            "mode":"simple",
            "evidenceArtifactId":{"$ref":{"stepId":"collect","pointer":"/artifacts/0/id"}}
        });
        registry
            .validate_planned_call(
                "create_report_draft",
                "1.0.0",
                AgentRiskLevel::Write,
                &input,
            )
            .unwrap();
        assert!(registry
            .validate_resolved_input("create_report_draft", &input)
            .is_err());
    }

    #[test]
    fn evidence_paper_id_array_can_flow_through_one_pointer() {
        let registry = AgentToolRegistry::standard().unwrap();
        let planned = json!({
            "topic":"quantum",
            "paperIds":{"$ref":{"stepId":"load","pointer":"/paperIds"}},
            "hotspotIds":["h1"],
            "mode":"simple"
        });
        registry
            .validate_planned_call(
                "save_research_evidence",
                "1.0.0",
                AgentRiskLevel::Write,
                &planned,
            )
            .unwrap();
        let resolved = resolve_dynamic_input(
            &planned,
            1,
            &[AgentReferenceSource {
                step_id: "load".into(),
                order_index: 0,
                succeeded: true,
                output: json!({"paperIds":["p1","p2","p3"]}),
            }],
        )
        .unwrap();
        assert_eq!(resolved["paperIds"], json!(["p1", "p2", "p3"]));
        registry
            .validate_resolved_input("save_research_evidence", &resolved)
            .unwrap();
    }

    fn fixture_connection() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(include_str!("library_schema.sql"))
            .unwrap();
        crate::ensure_v20_schema(&conn).unwrap();
        conn.pragma_update(None, "user_version", 10).unwrap();
        for (id, title, abstract_text) in [
            (
                "p1",
                "Quantum error correction",
                "Fault tolerant quantum systems",
            ),
            ("p2", "Protein language models", "Sequence design"),
            ("p3", "Quantum noise", "Error mitigation"),
        ] {
            conn.execute(
                "INSERT INTO papers(id, project_id, source, title, abstract, field, year, created_at, updated_at, search_blob)
                 VALUES(?1,'project','arxiv',?2,?3,'Physics',2026,'now','now',lower(?2 || ' ' || ?3))",
                params![id, title, abstract_text],
            )
            .unwrap();
        }
        let payload = json!({
            "id":"h1","title":"Quantum Error Correction","field":"Physics","summary":"Noise tolerant systems",
            "keywords":["quantum","error"],
            "analysis":{"evidencePaperIds":["p1","p3"]},
            "evolution":[]
        });
        conn.execute(
            "INSERT INTO v20_analysis_snapshots(id,project_id,algorithm_version,paper_count,hotspot_count,membership_count,status,created_at)
             VALUES('s1','project','v20',3,1,3,'ready','now')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO v20_hotspots(snapshot_id,project_id,hotspot_id,payload_json,x,y,z,paper_count,updated_at)
             VALUES('s1','project','h1',?1,0,0,0,3,'now')",
            params![payload.to_string()],
        ).unwrap();
        for (rank, id) in ["p1", "p3", "p2"].iter().enumerate() {
            conn.execute(
                "INSERT INTO v20_paper_memberships(snapshot_id,project_id,paper_id,hotspot_id,x,y,z,representative_rank,score)
                 VALUES('s1','project',?1,'h1',0,0,0,?2,1)",
                params![id, rank as i64 + 1],
            ).unwrap();
        }
        conn.execute(
            "INSERT INTO v20_analysis_state(project_id,active_snapshot_id,updated_at) VALUES('project','s1','now')",
            [],
        ).unwrap();
        conn
    }

    #[test]
    fn local_queries_are_bounded_ordered_and_use_persisted_v20_evidence() {
        let conn = fixture_connection();
        let papers = search_local_papers(&conn, "project", "quantum", 20).unwrap();
        assert_eq!(
            papers.iter().map(|row| row.id.as_str()).collect::<Vec<_>>(),
            vec!["p1", "p3"]
        );
        assert!(papers.iter().all(|row| row.untrusted_data));
        let (snapshot, hotspots) = search_v20_hotspots(&conn, "project", "error", 10).unwrap();
        assert_eq!(snapshot.snapshot_id, "s1");
        assert_eq!(hotspots[0].id, "h1");
        let evidence = load_hotspot_evidence(&conn, "project", &["h1".into()], 18).unwrap();
        assert_eq!(
            evidence
                .papers
                .iter()
                .map(|paper| paper.id.as_str())
                .collect::<Vec<_>>(),
            vec!["p1", "p3"]
        );
        assert!(evidence.missing_paper_ids.is_empty());
    }

    #[test]
    fn read_tool_dispatch_validates_both_input_and_output() {
        let conn = fixture_connection();
        let registry = AgentToolRegistry::standard().unwrap();
        let context = AgentReadToolContext {
            project_id: "project".into(),
        };
        let output = execute_read_tool(
            &conn,
            &registry,
            &context,
            "load_hotspot_evidence",
            &json!({"hotspotIds":["h1"]}),
        )
        .unwrap();
        assert_eq!(output["snapshot"]["snapshotId"], "s1");
        assert_eq!(output["paperIds"], json!(["p1", "p3"]));
        assert_eq!(output["untrustedData"], true);
        assert_eq!(
            execute_read_tool(
                &conn,
                &registry,
                &context,
                "save_research_evidence",
                &json!({"topic":"q","paperIds":["p1","p2","p3"],"mode":"simple"}),
            )
            .unwrap_err(),
            "AGENT_TOOL_NOT_READ_ONLY:save_research_evidence"
        );
    }

    #[test]
    fn evidence_reports_missing_ids_without_substituting_unrelated_papers() {
        let conn = fixture_connection();
        let payload = json!({
            "id":"h1","title":"Quantum Error Correction","field":"Physics","summary":"Noise tolerant systems",
            "keywords":["quantum","error"],
            "analysis":{"evidencePaperIds":["p1","missing"]},
            "evolution":[]
        });
        conn.execute(
            "UPDATE v20_hotspots SET payload_json=?1 WHERE snapshot_id='s1' AND hotspot_id='h1'",
            params![payload.to_string()],
        )
        .unwrap();
        let evidence = load_hotspot_evidence(&conn, "project", &["h1".into()], 18).unwrap();
        assert_eq!(evidence.paper_ids, vec!["p1"]);
        assert_eq!(evidence.missing_paper_ids, vec!["missing"]);
        assert!(!evidence.paper_ids.contains(&"p2".to_string()));
    }
}
