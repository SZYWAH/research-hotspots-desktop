use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::agent::{
    validate_action, validate_question_request, validate_storable_json, AgentAction, AgentPlan,
    AgentPlanStep, AgentQuestionRequest, AgentQuestionType, AgentRiskLevel, AgentRunKind,
    AgentSuccessCriterion, AGENT_OBJECTIVE_MAX_BYTES, AGENT_PLAN_MAX_BYTES,
};
use crate::agent_tools::AgentToolRegistry;

pub const AGENT_QUESTION_MAX_BYTES: usize = 4 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AgentQuestionDraft {
    pub prompt: String,
    pub answer_type: AgentQuestionType,
    #[serde(default)]
    pub options: Vec<String>,
    pub requires_replan: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AgentPlanStepDraft {
    pub id: String,
    pub title: String,
    pub tool: String,
    pub input: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AgentPlanDraft {
    pub objective: String,
    #[serde(default)]
    pub assumptions: Vec<String>,
    pub success_criteria: Vec<AgentSuccessCriterion>,
    pub steps: Vec<AgentPlanStepDraft>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "action", rename_all = "snake_case", deny_unknown_fields)]
pub enum ActionPlannerTurn {
    CallTool { tool: String, input: Value },
    AskUser { question: AgentQuestionDraft },
    Complete { summary: String },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExecutableActionPlannerTurn {
    pub action: ExecutableActionPlannerKind,
    pub tool: String,
    pub input: Value,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ExecutableActionPlannerKind {
    CallTool,
}

impl From<ExecutableActionPlannerTurn> for ActionPlannerTurn {
    fn from(turn: ExecutableActionPlannerTurn) -> Self {
        Self::CallTool {
            tool: turn.tool,
            input: turn.input,
        }
    }
}

impl AgentQuestionDraft {
    pub fn validate(&self) -> Result<(), String> {
        validate_question_request(&AgentQuestionRequest {
            prompt: self.prompt.clone(),
            answer_type: self.answer_type,
            options: self.options.clone(),
            requires_replan: self.requires_replan,
        })?;
        if serde_json::to_vec(self)
            .map_err(|error| format!("AGENT_QUESTION_SERIALIZE_FAILED:{error}"))?
            .len()
            > AGENT_QUESTION_MAX_BYTES
        {
            return Err("AGENT_QUESTION_SIZE_LIMIT_EXCEEDED".into());
        }
        match self.answer_type {
            AgentQuestionType::Choice => {
                if !(2..=8).contains(&self.options.len())
                    || self.options.iter().any(|option| option.trim().is_empty())
                {
                    return Err("AGENT_QUESTION_OPTIONS_INVALID".into());
                }
            }
            AgentQuestionType::Text | AgentQuestionType::Confirm => {
                if !self.options.is_empty() {
                    return Err("AGENT_QUESTION_OPTIONS_NOT_ALLOWED".into());
                }
            }
        }
        Ok(())
    }
}

impl AgentPlanDraft {
    pub fn validate(&self) -> Result<(), String> {
        let value = serde_json::to_value(self)
            .map_err(|error| format!("AGENT_PLAN_DRAFT_SERIALIZE_FAILED:{error}"))?;
        validate_storable_json(&value)?;
        if serde_json::to_vec(&value)
            .map_err(|error| format!("AGENT_PLAN_DRAFT_SERIALIZE_FAILED:{error}"))?
            .len()
            > AGENT_PLAN_MAX_BYTES
        {
            return Err("AGENT_PLAN_SIZE_LIMIT_EXCEEDED".into());
        }
        if self.objective.trim().is_empty() || self.objective.len() > AGENT_OBJECTIVE_MAX_BYTES {
            return Err("AGENT_PLAN_DRAFT_OBJECTIVE_INVALID".into());
        }
        if self.assumptions.len() > 20
            || self
                .assumptions
                .iter()
                .any(|value| value.trim().is_empty() || value.len() > 2 * 1024)
        {
            return Err("AGENT_PLAN_DRAFT_ASSUMPTIONS_INVALID".into());
        }
        if !(1..=20).contains(&self.success_criteria.len())
            || self.success_criteria.iter().any(|criterion| {
                criterion.id.trim().is_empty()
                    || criterion.id.len() > 64
                    || criterion.description.trim().is_empty()
                    || criterion.description.len() > 4 * 1024
            })
        {
            return Err("AGENT_PLAN_DRAFT_SUCCESS_CRITERIA_INVALID".into());
        }
        if !(1..=20).contains(&self.steps.len())
            || self.steps.iter().any(|step| {
                step.id.trim().is_empty()
                    || step.id.len() > 64
                    || step.title.trim().is_empty()
                    || step.title.len() > 512
                    || step.tool.trim().is_empty()
                    || step.tool.len() > 64
                    || !step.input.is_object()
            })
        {
            return Err("AGENT_PLAN_DRAFT_STEPS_INVALID".into());
        }
        Ok(())
    }
}

impl ActionPlannerTurn {
    pub fn validate_shape(&self) -> Result<(), String> {
        match self {
            Self::CallTool { tool, input } => validate_action(&AgentAction::CallTool {
                tool: tool.clone(),
                input: input.clone(),
                risk: AgentRiskLevel::Read,
            }),
            Self::AskUser { question } => question.validate(),
            Self::Complete { summary } => validate_action(&AgentAction::Complete {
                summary: summary.clone(),
            }),
        }
    }
}

pub fn build_governed_plan<F>(
    draft: AgentPlanDraft,
    version: u32,
    mut resolve_risk: F,
) -> Result<AgentPlan, String>
where
    F: FnMut(&str) -> Result<AgentRiskLevel, String>,
{
    draft.validate()?;
    if version == 0 {
        return Err("AGENT_PLAN_VERSION_REQUIRED".into());
    }
    let steps = draft
        .steps
        .into_iter()
        .map(|step| {
            let risk = resolve_risk(&step.tool)?;
            Ok(AgentPlanStep {
                id: step.id,
                title: step.title,
                tool: step.tool,
                input: step.input,
                risk,
            })
        })
        .collect::<Result<Vec<_>, String>>()?;
    Ok(AgentPlan {
        version,
        objective: draft.objective,
        assumptions: draft.assumptions,
        success_criteria: draft.success_criteria,
        steps,
    })
}

pub fn build_flagship_research_plan(
    draft: &AgentPlanDraft,
    objective: &str,
    version: u32,
    registry: &AgentToolRegistry,
) -> Result<AgentPlan, String> {
    draft.validate()?;
    if objective.trim().is_empty() {
        return Err("AGENT_PLAN_OBJECTIVE_REQUIRED".into());
    }
    for step in &draft.steps {
        registry.get(&step.tool)?;
    }
    let query = draft
        .steps
        .iter()
        .find(|step| {
            matches!(
                step.tool.as_str(),
                "search_local_papers" | "search_v20_hotspots"
            )
        })
        .and_then(|step| step.input.get("query"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|query| !query.is_empty())
        .unwrap_or(objective)
        .chars()
        .take(500)
        .collect::<String>();
    validate_flagship_search_query(&query)?;
    let mode = draft
        .steps
        .iter()
        .find(|step| step.tool == "create_report_draft")
        .and_then(|step| step.input.get("mode"))
        .and_then(Value::as_str)
        .filter(|mode| matches!(*mode, "simple" | "deep"))
        .unwrap_or("simple");
    let reference =
        |step_id: &str, pointer: &str| json!({"$ref":{"stepId":step_id,"pointer":pointer}});
    let specifications = vec![
        (
            "inspect-library",
            "Inspect the local library",
            "inspect_library_state",
            json!({}),
        ),
        (
            "inspect-snapshot",
            "Validate the active V20 snapshot",
            "inspect_v20_snapshot",
            json!({}),
        ),
        (
            "search-papers",
            "Search bounded local paper summaries",
            "search_local_papers",
            json!({"query":query,"limit":20}),
        ),
        (
            "search-hotspots",
            "Find the most relevant V20 hotspots",
            "search_v20_hotspots",
            json!({"query":query,"limit":5}),
        ),
        (
            "save-evidence",
            "Save an immutable evidence artifact",
            "save_research_evidence",
            json!({
                "topic":objective,
                "paperIds":reference("search-papers","/paperIds"),
                "hotspotIds":reference("search-hotspots","/hotspotIds"),
                "mode":mode
            }),
        ),
        (
            "create-report",
            "Create the first report draft",
            "create_report_draft",
            json!({
                "topic":objective,
                "evidenceArtifactId":reference("save-evidence","/artifacts/0/id"),
                "mode":mode
            }),
        ),
        (
            "audit-report",
            "Audit the first report draft",
            "inspect_report_audit",
            json!({
                "reportArtifactId":reference("create-report","/artifacts/0/id")
            }),
        ),
        (
            "revise-high-risk",
            "Conditionally revise a high-risk report once",
            "revise_report_draft",
            json!({
                "reportArtifactId":reference("create-report","/artifacts/0/id"),
                "auditArtifactId":reference("audit-report","/artifacts/0/id"),
                "instructions":"Repair unsupported claims, invalid citations, and missing required sections without adding evidence."
            }),
        ),
        (
            "audit-revised",
            "Audit the conditional revised report",
            "inspect_report_audit",
            json!({
                "reportArtifactId":reference("revise-high-risk","/artifacts/0/id")
            }),
        ),
    ];
    let steps = specifications
        .into_iter()
        .map(|(id, title, tool, input)| {
            let definition = registry.get(tool)?;
            registry.validate_planned_call(tool, &definition.version, definition.risk, &input)?;
            Ok(AgentPlanStep {
                id: id.into(),
                title: title.into(),
                tool: tool.into(),
                input,
                risk: definition.risk,
            })
        })
        .collect::<Result<Vec<_>, String>>()?;
    let mut success_criteria = draft.success_criteria.clone();
    for (id, description) in [
        (
            "traceable-evidence",
            "At least three papers are stored in an immutable evidence artifact.",
        ),
        (
            "audited-report",
            "The latest report and deterministic audit bind the active V20 snapshot.",
        ),
        (
            "completion-gate",
            "The deterministic completion gate accepts the run.",
        ),
    ] {
        if !success_criteria.iter().any(|criterion| criterion.id == id) {
            success_criteria.push(AgentSuccessCriterion {
                id: id.into(),
                description: description.into(),
            });
        }
    }
    Ok(AgentPlan {
        version,
        objective: objective.trim().into(),
        assumptions: draft.assumptions.clone(),
        success_criteria,
        steps,
    })
}

fn validate_flagship_search_query(query: &str) -> Result<(), String> {
    let query = query.trim();
    if query.is_empty() || query.chars().count() > 120 {
        return Err("AGENT_PLAN_SEARCH_QUERY_INVALID".into());
    }
    let terms = query
        .split(|character: char| {
            character.is_whitespace()
                || matches!(
                    character,
                    ',' | '.'
                        | ';'
                        | ':'
                        | '/'
                        | '\\'
                        | '('
                        | ')'
                        | '['
                        | ']'
                        | '，'
                        | '。'
                        | '；'
                        | '：'
                )
        })
        .map(|term| {
            term.trim_matches(|character: char| !character.is_alphanumeric() && character != '-')
        })
        .filter(|term| !term.is_empty())
        .collect::<Vec<_>>();
    if !(2..=8).contains(&terms.len())
        || !terms.iter().any(|term| {
            term.chars()
                .filter(|character| character.is_ascii_alphabetic())
                .count()
                >= 3
        })
    {
        return Err("AGENT_PLAN_SEARCH_QUERY_INVALID".into());
    }
    const WORKFLOW_TERMS: &[&str] = &[
        "v20",
        "snapshot",
        "report",
        "local library",
        "论文库",
        "快照",
        "报告",
    ];
    let lower = query.to_lowercase();
    if WORKFLOW_TERMS.iter().any(|term| lower.contains(term)) {
        return Err("AGENT_PLAN_SEARCH_QUERY_INVALID".into());
    }
    Ok(())
}

pub fn build_governed_task_plan(
    run_kind: AgentRunKind,
    draft: &AgentPlanDraft,
    objective: &str,
    task_input: &Value,
    version: u32,
    registry: &AgentToolRegistry,
) -> Result<AgentPlan, String> {
    if run_kind == AgentRunKind::ResearchReport {
        return build_flagship_research_plan(draft, objective, version, registry);
    }
    draft.validate()?;
    let text = |key: &str| {
        task_input
            .get(key)
            .and_then(Value::as_str)
            .filter(|value| !value.trim().is_empty())
            .map(str::to_string)
            .ok_or_else(|| format!("AGENT_TASK_INPUT_REQUIRED:{key}"))
    };
    let reference =
        |step_id: &str, pointer: &str| json!({"$ref":{"stepId":step_id,"pointer":pointer}});
    let specifications: Vec<(&str, &str, &str, Value)> = match run_kind {
        AgentRunKind::PaperFileImport | AgentRunKind::PaperMysqlImport => {
            let grant = text("resourceGrantId")?;
            vec![
                (
                    "preview-import",
                    "Preview the authorized paper source",
                    "preview_paper_import",
                    json!({"resourceGrantId":grant}),
                ),
                (
                    "commit-import",
                    "Import the staged papers atomically",
                    "import_papers",
                    json!({"resourceGrantId":text("resourceGrantId")?,"previewHash":reference("preview-import","/previewHash")}),
                ),
            ]
        }
        AgentRunKind::LibraryClean => vec![
            (
                "preview-clean",
                "Preview deterministic library cleaning",
                "preview_library_clean",
                json!({}),
            ),
            (
                "commit-clean",
                "Apply the approved cleaning transaction",
                "clean_paper_library",
                json!({"libraryRevision":reference("preview-clean","/libraryRevision"),"previewHash":reference("preview-clean","/previewHash")}),
            ),
        ],
        AgentRunKind::V20Modeling => vec![
            (
                "inspect-modeling",
                "Inspect the modeling input revision",
                "inspect_v20_modeling_input",
                json!({}),
            ),
            (
                "rebuild-snapshot",
                "Build and atomically activate a V20 snapshot",
                "rebuild_v20_snapshot",
                json!({"libraryRevision":reference("inspect-modeling","/libraryRevision"),"paperCount":reference("inspect-modeling","/paperCount")}),
            ),
        ],
        AgentRunKind::ReportExport => {
            let formats = task_input
                .get("formats")
                .cloned()
                .unwrap_or_else(|| json!(["md", "html"]));
            vec![(
                "export-report",
                "Export the approved report artifact",
                "export_report_artifact",
                json!({"reportArtifactId":text("reportArtifactId")?,"resourceGrantId":text("resourceGrantId")?,"formats":formats}),
            )]
        }
        AgentRunKind::ResearchReport => unreachable!(),
    };
    let steps = specifications
        .into_iter()
        .map(|(id, title, tool, input)| {
            let definition = registry.get(tool)?;
            registry.validate_planned_call(tool, &definition.version, definition.risk, &input)?;
            Ok(AgentPlanStep {
                id: id.into(),
                title: title.into(),
                tool: tool.into(),
                input,
                risk: definition.risk,
            })
        })
        .collect::<Result<Vec<_>, String>>()?;
    Ok(AgentPlan{
        version,
        objective:objective.trim().into(),
        assumptions:draft.assumptions.clone(),
        success_criteria:vec![
            AgentSuccessCriterion{id:"approved-impact".into(),description:"Every high-risk action is approved against its resolved parameters and current library revision.".into()},
            AgentSuccessCriterion{id:"atomic-result".into(),description:"The deterministic task gate verifies one atomic result and its receipt.".into()},
        ],
        steps,
    })
}

pub fn plan_builder_output_schema() -> Value {
    json!({
        "type": "object",
        "additionalProperties": false,
        "required": ["objective", "assumptions", "successCriteria", "steps"],
        "properties": {
            "objective": {"type": "string", "minLength": 1, "maxLength": 4096},
            "assumptions": {"type": "array", "items": {"type": "string", "minLength": 1, "maxLength": 2048}, "maxItems": 20},
            "successCriteria": {
                "type": "array", "minItems": 1, "maxItems": 20,
                "items": {
                    "type": "object", "additionalProperties": false,
                    "required": ["id", "description"],
                    "properties": {"id": {"type": "string", "minLength": 1, "maxLength": 64}, "description": {"type": "string", "minLength": 1, "maxLength": 4096}}
                }
            },
            "steps": {
                "type": "array", "minItems": 1, "maxItems": 20,
                "items": {
                    "type": "object", "additionalProperties": false,
                    "required": ["id", "title", "tool", "input"],
                    "properties": {
                        "id": {"type": "string", "minLength": 1, "maxLength": 64}, "title": {"type": "string", "minLength": 1, "maxLength": 512},
                        "tool": {"type": "string", "minLength": 1, "maxLength": 64}, "input": {"type": "object"}
                    }
                }
            }
        }
    })
}

pub fn action_planner_output_schema() -> Value {
    json!({
        "oneOf": [
            {
                "type": "object", "additionalProperties": false,
                "required": ["action", "tool", "input"],
                "properties": {
                    "action": {"const": "call_tool"},
                    "tool": {"type": "string"},
                    "input": {"type": "object"}
                }
            },
            {
                "type": "object", "additionalProperties": false,
                "required": ["action", "question"],
                "properties": {
                    "action": {"const": "ask_user"},
                    "question": {
                        "type": "object", "additionalProperties": false,
                        "required": ["prompt", "answerType", "options", "requiresReplan"],
                        "properties": {
                            "prompt": {"type": "string", "minLength": 1, "maxLength": 4096},
                            "answerType": {"enum": ["choice", "text", "confirm"]},
                            "options": {"type": "array", "items": {"type": "string", "minLength": 1, "maxLength": 1024}, "maxItems": 8},
                            "requiresReplan": {"type": "boolean"}
                        }
                    }
                }
            },
            {
                "type": "object", "additionalProperties": false,
                "required": ["action", "summary"],
                "properties": {
                    "action": {"const": "complete"},
                    "summary": {"type": "string", "minLength": 1, "maxLength": 8192}
                }
            }
        ]
    })
}

/// Core calls the ActionPlanner only after the current step's references and
/// input schema have already been validated. At that boundary the only valid
/// model decision is to confirm the planned tool call; deterministic Core
/// checks own user questions and completion decisions.
pub fn executable_action_planner_output_schema(tool: &str, input: &Value) -> Value {
    json!({
        "type": "object",
        "additionalProperties": false,
        "required": ["action", "tool", "input"],
        "properties": {
            "action": {"const": "call_tool"},
            "tool": {"const": tool},
            "input": {"const": input}
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn strict_action_protocol_rejects_unknown_fields_and_missing_questions() {
        let parsed = serde_json::from_value::<ActionPlannerTurn>(json!({
            "action":"call_tool","tool":"inspect_library_state","input":{},"risk":"read"
        }));
        assert!(parsed.is_err(), "model must not provide authoritative risk");

        let question = AgentQuestionDraft {
            prompt: "".into(),
            answer_type: AgentQuestionType::Text,
            options: vec![],
            requires_replan: true,
        };
        assert_eq!(question.validate().unwrap_err(), "AGENT_QUESTION_REQUIRED");
    }

    #[test]
    fn executable_action_schema_only_allows_tool_calls() {
        let schema = executable_action_planner_output_schema("inspect_v20_snapshot", &json!({}));
        assert_eq!(schema["type"], "object");
        assert_eq!(schema["properties"]["action"]["const"], "call_tool");
        assert_eq!(
            schema["properties"]["tool"]["const"],
            "inspect_v20_snapshot"
        );
        assert_eq!(schema["properties"]["input"]["const"], json!({}));
        assert!(schema.get("oneOf").is_none());

        let valid = serde_json::from_value::<ExecutableActionPlannerTurn>(json!({
            "action":"call_tool",
            "tool":"inspect_library_state",
            "input":{}
        }))
        .unwrap();
        assert_eq!(valid.action, ExecutableActionPlannerKind::CallTool);
        assert!(
            serde_json::from_value::<ExecutableActionPlannerTurn>(json!({
                "action":"ask_user",
                "question":{
                    "prompt":"Should I continue?",
                    "answerType":"confirm",
                    "options":[],
                    "requiresReplan":true
                }
            }))
            .is_err(),
            "an executable step must reject a model-authored user question so the gateway can repair it"
        );
    }

    #[test]
    fn governed_plan_injects_registry_risk() {
        let plan = build_governed_plan(
            AgentPlanDraft {
                objective: "Build an evidence report".into(),
                assumptions: vec![],
                success_criteria: vec![AgentSuccessCriterion {
                    id: "report".into(),
                    description: "A report passes deterministic audit".into(),
                }],
                steps: vec![AgentPlanStepDraft {
                    id: "save".into(),
                    title: "Save evidence".into(),
                    tool: "save_research_evidence".into(),
                    input: json!({"sourceStepId":"collect"}),
                }],
            },
            2,
            |tool| {
                assert_eq!(tool, "save_research_evidence");
                Ok(AgentRiskLevel::Write)
            },
        )
        .unwrap();
        assert_eq!(plan.steps[0].risk, AgentRiskLevel::Write);
    }

    #[test]
    fn flagship_plan_is_canonical_and_injects_all_completion_gates() {
        let registry = AgentToolRegistry::standard().unwrap();
        let draft = AgentPlanDraft {
            objective: "model wording is not authoritative".into(),
            assumptions: vec!["Use only the local snapshot".into()],
            success_criteria: vec![AgentSuccessCriterion {
                id: "useful".into(),
                description: "Answer the topic".into(),
            }],
            steps: vec![AgentPlanStepDraft {
                id: "idea".into(),
                title: "Search".into(),
                tool: "search_v20_hotspots".into(),
                input: json!({"query":"quantum correction","limit":3}),
            }],
        };
        let plan =
            build_flagship_research_plan(&draft, "Analyse quantum error correction", 1, &registry)
                .unwrap();
        assert_eq!(plan.objective, "Analyse quantum error correction");
        assert_eq!(plan.steps.len(), 9);
        assert_eq!(plan.steps[4].risk, AgentRiskLevel::Write);
        assert_eq!(
            plan.steps[4].input["hotspotIds"]["$ref"]["stepId"],
            "search-hotspots"
        );
        assert!(plan
            .success_criteria
            .iter()
            .any(|criterion| criterion.id == "completion-gate"));
    }

    #[test]
    fn flagship_plan_rejects_any_model_invented_tool_before_rewriting_steps() {
        let registry = AgentToolRegistry::standard().unwrap();
        let draft = AgentPlanDraft {
            objective: "Try an unknown capability".into(),
            assumptions: vec![],
            success_criteria: vec![AgentSuccessCriterion {
                id: "unsafe".into(),
                description: "Must not execute".into(),
            }],
            steps: vec![AgentPlanStepDraft {
                id: "invented".into(),
                title: "Run arbitrary SQL".into(),
                tool: "execute_sql".into(),
                input: json!({"sql":"DELETE FROM papers"}),
            }],
        };
        assert_eq!(
            build_flagship_research_plan(&draft, "Safe local analysis", 1, &registry).unwrap_err(),
            "AGENT_TOOL_UNKNOWN:execute_sql"
        );
    }

    #[test]
    fn flagship_plan_rejects_a_full_workflow_objective_as_the_search_query() {
        let registry = AgentToolRegistry::standard().unwrap();
        let objective = "基于当前本地论文库与 V20 快照，分析检索增强科研智能体并生成可追溯报告";
        let draft = AgentPlanDraft {
            objective: objective.into(),
            assumptions: vec![],
            success_criteria: vec![AgentSuccessCriterion {
                id: "relevant".into(),
                description: "Evidence remains on topic".into(),
            }],
            steps: vec![AgentPlanStepDraft {
                id: "search".into(),
                title: "Search".into(),
                tool: "search_local_papers".into(),
                input: json!({"query":objective,"limit":20}),
            }],
        };
        assert_eq!(
            build_flagship_research_plan(&draft, objective, 1, &registry).unwrap_err(),
            "AGENT_PLAN_SEARCH_QUERY_INVALID"
        );
    }
}
