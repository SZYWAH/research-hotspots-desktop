use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::agent::{
    canonical_value_sha256, validate_action, AgentAction, AgentAutomationMode,
    AgentQuestionRequest, AgentRiskLevel, AgentRunStatus, AgentStepStatus,
};
use crate::agent_protocol::ActionPlannerTurn;
use crate::agent_store::{AgentArtifactRecord, AgentRunRecord, AgentStepRecord};
use crate::agent_tools::AgentToolRegistry;
use crate::AnalysisState;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GovernedAction {
    pub action: AgentAction,
    pub action_hash: Option<String>,
    pub tool_version: Option<String>,
    pub registry_hash: String,
}

pub fn govern_action_planner_turn(
    turn: ActionPlannerTurn,
    expected_step: &AgentStepRecord,
    resolved_input: &Value,
    registry: &AgentToolRegistry,
    writer_profile_hash: Option<&str>,
) -> Result<GovernedAction, String> {
    turn.validate_shape()?;
    let governed = match turn {
        ActionPlannerTurn::CallTool { tool, input } => {
            if tool != expected_step.tool_name {
                return Err("AGENT_ACTION_TOOL_DOES_NOT_MATCH_CURRENT_STEP".into());
            }
            if input != expected_step.input {
                return Err("AGENT_ACTION_INPUT_DOES_NOT_MATCH_PLAN".into());
            }
            let definition = registry.get(&tool)?;
            if definition.version != expected_step.tool_version
                || expected_step.registry_hash != registry.hash()
            {
                return Err("AGENT_ACTION_REGISTRY_STALE".into());
            }
            if definition.risk != expected_step.risk {
                return Err("AGENT_ACTION_RISK_MISMATCH".into());
            }
            registry.validate_resolved_input(&tool, resolved_input)?;
            let action_hash = governed_action_hash(
                &tool,
                &definition.version,
                registry.hash(),
                definition.risk,
                resolved_input,
                writer_profile_hash,
            )?;
            GovernedAction {
                action: AgentAction::CallTool {
                    tool,
                    input: resolved_input.clone(),
                    risk: definition.risk,
                },
                action_hash: Some(action_hash),
                tool_version: Some(definition.version.clone()),
                registry_hash: registry.hash().into(),
            }
        }
        ActionPlannerTurn::AskUser { question } => GovernedAction {
            action: AgentAction::AskUser {
                question: AgentQuestionRequest {
                    prompt: question.prompt,
                    answer_type: question.answer_type,
                    options: question.options,
                    requires_replan: question.requires_replan,
                },
            },
            action_hash: None,
            tool_version: None,
            registry_hash: registry.hash().into(),
        },
        ActionPlannerTurn::Complete { summary } => GovernedAction {
            action: AgentAction::Complete { summary },
            action_hash: None,
            tool_version: None,
            registry_hash: registry.hash().into(),
        },
    };
    validate_action(&governed.action)?;
    Ok(governed)
}

pub fn governed_action_hash(
    tool: &str,
    tool_version: &str,
    registry_hash: &str,
    risk: AgentRiskLevel,
    resolved_input: &Value,
    writer_profile_hash: Option<&str>,
) -> Result<String, String> {
    canonical_value_sha256(&json!({
        "tool": tool,
        "toolVersion": tool_version,
        "registryHash": registry_hash,
        "risk": risk,
        "input": resolved_input,
        "writerProfileHash": writer_profile_hash,
    }))
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CompletionDisposition {
    Completed,
    AwaitingUser,
    Rejected,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CompletionGateResult {
    pub disposition: CompletionDisposition,
    pub reasons: Vec<String>,
    pub report_artifact_id: Option<String>,
    pub audit_artifact_id: Option<String>,
}

pub struct CompletionGateInput<'a> {
    pub run: &'a AgentRunRecord,
    pub active_snapshot: Option<&'a AnalysisState>,
    pub plan_approved: bool,
    pub pending_action_approval: bool,
    pub steps: &'a [AgentStepRecord],
    pub artifacts: &'a [AgentArtifactRecord],
    pub evidence_papers_exist: bool,
    pub latest_report_review_approved: bool,
}

const REQUIRED_FLAGSHIP_STEPS: [(&str, &str); 8] = [
    ("inspect-library", "inspect_library_state"),
    ("inspect-snapshot", "inspect_v20_snapshot"),
    ("search-papers", "search_local_papers"),
    ("search-hotspots", "search_v20_hotspots"),
    ("load-evidence", "load_hotspot_evidence"),
    ("save-evidence", "save_research_evidence"),
    ("create-report", "create_report_draft"),
    ("audit-report", "inspect_report_audit"),
];

const CONDITIONAL_REVISION_STEPS: [(&str, &str); 2] = [
    ("revise-high-risk", "revise_report_draft"),
    ("audit-revised", "inspect_report_audit"),
];

fn step_by_id<'a>(steps: &'a [AgentStepRecord], id: &str) -> Option<&'a AgentStepRecord> {
    steps.iter().find(|step| step.step_id == id)
}

fn step_artifact_id<'a>(step: &'a AgentStepRecord, expected_kind: &str) -> Option<&'a str> {
    step.observation
        .as_ref()?
        .get("artifacts")?
        .as_array()?
        .iter()
        .find(|artifact| artifact.get("kind").and_then(Value::as_str) == Some(expected_kind))?
        .get("id")?
        .as_str()
}

fn artifact_by_id<'a>(
    artifacts: &'a [AgentArtifactRecord],
    id: Option<&str>,
    expected_kind: &str,
    expected_step_id: &str,
) -> Option<&'a AgentArtifactRecord> {
    let id = id?;
    artifacts.iter().find(|artifact| {
        artifact.id == id
            && artifact.artifact_kind == expected_kind
            && artifact.step_id.as_deref() == Some(expected_step_id)
    })
}

fn validate_all_artifacts(
    run: &AgentRunRecord,
    artifacts: &[AgentArtifactRecord],
    rejected: &mut Vec<String>,
) {
    for artifact in artifacts {
        if artifact.run_id != run.id {
            rejected.push("AGENT_ARTIFACT_CONTEXT_INVALID".into());
        }
        if !canonical_value_sha256(&artifact.content)
            .is_ok_and(|hash| hash == artifact.content_sha256)
        {
            rejected.push("AGENT_ARTIFACT_HASH_INVALID".into());
        }

        let mut current = artifact;
        let mut depth = 0usize;
        while let Some(parent_id) = current.supersedes_artifact_id.as_deref() {
            depth += 1;
            let Some(parent) = artifacts.iter().find(|candidate| candidate.id == parent_id) else {
                rejected.push("AGENT_ARTIFACT_SUPERSEDES_INVALID".into());
                break;
            };
            if parent.run_id != artifact.run_id
                || parent.artifact_kind != artifact.artifact_kind
                || parent.created_at_ms > current.created_at_ms
                || parent.id == current.id
                || depth > artifacts.len()
            {
                rejected.push("AGENT_ARTIFACT_SUPERSEDES_INVALID".into());
                break;
            }
            current = parent;
        }
    }
}

pub fn evaluate_completion_gate(input: CompletionGateInput<'_>) -> CompletionGateResult {
    let mut rejected = Vec::new();
    let mut waiting = Vec::new();
    if input.run.status != AgentRunStatus::Evaluating {
        rejected.push("AGENT_COMPLETION_REQUIRES_EVALUATING".into());
    }
    let Some(active) = input.active_snapshot else {
        waiting.push("AGENT_V20_SNAPSHOT_REQUIRED".into());
        return completion_result(rejected, waiting, None, None);
    };
    if input.run.project_id != active.project_id
        || input.run.snapshot_id.as_deref() != Some(active.active_snapshot_id.as_str())
    {
        waiting.push("AGENT_V20_SNAPSHOT_STALE".into());
    }
    if matches!(input.run.automation_mode, AgentAutomationMode::Supervised) && !input.plan_approved
    {
        rejected.push("AGENT_PLAN_APPROVAL_REQUIRED".into());
    }
    if input.pending_action_approval {
        rejected.push("AGENT_ACTION_APPROVAL_PENDING".into());
    }
    validate_all_artifacts(input.run, input.artifacts, &mut rejected);
    let expected_plan_version = input.run.current_plan_version;
    let expected_step_count = REQUIRED_FLAGSHIP_STEPS.len() + CONDITIONAL_REVISION_STEPS.len();
    if input.steps.len() != expected_step_count
        || input
            .steps
            .iter()
            .any(|step| Some(step.plan_version) != expected_plan_version)
    {
        rejected.push("AGENT_COMPLETION_PLAN_STEPS_INVALID".into());
    }
    for (step_id, tool_name) in REQUIRED_FLAGSHIP_STEPS {
        match step_by_id(input.steps, step_id) {
            Some(step)
                if step.tool_name == tool_name && step.status == AgentStepStatus::Succeeded => {}
            Some(step) if step.status == AgentStepStatus::WaitingUser => {
                waiting.push(format!("AGENT_STEP_WAITING_USER:{step_id}"));
            }
            Some(step) => rejected.push(format!(
                "AGENT_REQUIRED_STEP_NOT_SUCCEEDED:{step_id}:{}:{:?}",
                step.tool_name, step.status
            )),
            None => rejected.push(format!("AGENT_REQUIRED_STEP_MISSING:{step_id}")),
        }
    }

    let initial_audit = step_by_id(input.steps, "audit-report")
        .and_then(|step| step_artifact_id(step, "report_audit"))
        .and_then(|id| artifact_by_id(input.artifacts, Some(id), "report_audit", "audit-report"));
    let initial_high_risk = initial_audit
        .and_then(|artifact| artifact.content.get("riskLevel"))
        .and_then(Value::as_str)
        == Some("high");
    let revision = step_by_id(input.steps, "revise-high-risk");
    let revised_audit = step_by_id(input.steps, "audit-revised");
    let revision_completed = revision.is_some_and(|step| {
        step.tool_name == "revise_report_draft" && step.status == AgentStepStatus::Succeeded
    }) && revised_audit.is_some_and(|step| {
        step.tool_name == "inspect_report_audit" && step.status == AgentStepStatus::Succeeded
    });
    let revision_skipped = revision.is_some_and(|step| {
        step.tool_name == "revise_report_draft"
            && step.status == AgentStepStatus::Skipped
            && step.last_error_code.as_deref() == Some("AGENT_REPORT_REVISION_NOT_REQUIRED")
    }) && revised_audit.is_some_and(|step| {
        step.tool_name == "inspect_report_audit"
            && step.status == AgentStepStatus::Skipped
            && step.last_error_code.as_deref() == Some("AGENT_REPORT_REVISION_NOT_REQUIRED")
    });
    if (initial_high_risk && !revision_completed) || (!initial_high_risk && !revision_skipped) {
        rejected.push("AGENT_CONDITIONAL_REVISION_STATE_INVALID".into());
    }

    let evidence = step_by_id(input.steps, "save-evidence")
        .and_then(|step| step_artifact_id(step, "evidence"))
        .and_then(|id| artifact_by_id(input.artifacts, Some(id), "evidence", "save-evidence"));
    let report_step_id = if revision_completed {
        "revise-high-risk"
    } else {
        "create-report"
    };
    let audit_step_id = if revision_completed {
        "audit-revised"
    } else {
        "audit-report"
    };
    let report = step_by_id(input.steps, report_step_id)
        .and_then(|step| step_artifact_id(step, "report_draft"))
        .and_then(|id| artifact_by_id(input.artifacts, Some(id), "report_draft", report_step_id));
    let audit = step_by_id(input.steps, audit_step_id)
        .and_then(|step| step_artifact_id(step, "report_audit"))
        .and_then(|id| artifact_by_id(input.artifacts, Some(id), "report_audit", audit_step_id));
    for (kind, artifact) in [("evidence", evidence), ("report", report), ("audit", audit)] {
        let Some(artifact) = artifact else {
            rejected.push(format!("AGENT_{kind}_ARTIFACT_REQUIRED").to_ascii_uppercase());
            continue;
        };
        if artifact.snapshot_id.as_deref() != Some(active.active_snapshot_id.as_str()) {
            waiting.push("AGENT_ARTIFACT_SNAPSHOT_STALE".into());
        }
    }
    if let Some(evidence) = evidence {
        let count = evidence
            .content
            .get("papers")
            .and_then(Value::as_array)
            .map_or(0, Vec::len);
        if count < 3 || !input.evidence_papers_exist {
            waiting.push("AGENT_EVIDENCE_INSUFFICIENT".into());
        }
    }
    if let (Some(evidence), Some(report), Some(audit)) = (evidence, report, audit) {
        let report_evidence_id = report
            .content
            .get("evidenceArtifactId")
            .and_then(Value::as_str);
        let report_text = report.content.get("content").and_then(Value::as_str);
        let audit_report_hash = audit
            .content
            .get("reportContentHash")
            .and_then(Value::as_str);
        let audit_evidence_hash = audit
            .content
            .get("evidenceContentHash")
            .and_then(Value::as_str);
        let report_paper_ids = report
            .content
            .get("paperIds")
            .and_then(Value::as_array)
            .map(|values| values.iter().filter_map(Value::as_str).collect::<Vec<_>>());
        let evidence_paper_ids = evidence
            .content
            .get("papers")
            .and_then(Value::as_array)
            .map(|values| {
                values
                    .iter()
                    .filter_map(|value| value.get("id").and_then(Value::as_str))
                    .collect::<Vec<_>>()
            });
        let report_hash = report_text
            .and_then(|content| canonical_value_sha256(&Value::String(content.into())).ok());
        if report_evidence_id != Some(evidence.id.as_str())
            || audit_report_hash != report_hash.as_deref()
            || audit_evidence_hash != Some(evidence.content_sha256.as_str())
            || report_paper_ids.is_none()
            || report_paper_ids != evidence_paper_ids
        {
            rejected.push("AGENT_ARTIFACT_CHAIN_INVALID".into());
        }
    }
    if let Some(audit) = audit {
        let content = &audit.content;
        if content
            .get("invalidCitationCount")
            .and_then(Value::as_u64)
            .unwrap_or(1)
            != 0
            || !content
                .get("evidenceProfilePresent")
                .and_then(Value::as_bool)
                .unwrap_or(false)
            || content
                .get("missingRequiredSections")
                .and_then(Value::as_array)
                .is_none_or(|sections| !sections.is_empty())
        {
            rejected.push("AGENT_REPORT_AUDIT_GATE_FAILED".into());
        }
        if content.get("riskLevel").and_then(Value::as_str) == Some("high")
            && !input.latest_report_review_approved
        {
            waiting.push("AGENT_HIGH_RISK_REPORT_REVIEW_REQUIRED".into());
        }
    }
    completion_result(
        rejected,
        waiting,
        report.map(|artifact| artifact.id.clone()),
        audit.map(|artifact| artifact.id.clone()),
    )
}

fn completion_result(
    rejected: Vec<String>,
    waiting: Vec<String>,
    report_artifact_id: Option<String>,
    audit_artifact_id: Option<String>,
) -> CompletionGateResult {
    let disposition = if !rejected.is_empty() {
        CompletionDisposition::Rejected
    } else if !waiting.is_empty() {
        CompletionDisposition::AwaitingUser
    } else {
        CompletionDisposition::Completed
    };
    CompletionGateResult {
        disposition,
        reasons: rejected.into_iter().chain(waiting).collect(),
        report_artifact_id,
        audit_artifact_id,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::{AgentBudget, AgentBudgetUsage, AgentRunKind};

    fn completed_run() -> AgentRunRecord {
        AgentRunRecord {
            id: "run-1".into(),
            library_instance_id: "library-1".into(),
            project_id: "project".into(),
            snapshot_id: Some("snapshot".into()),
            run_kind: AgentRunKind::ResearchReport,
            task_input: json!({}),
            automation_mode: AgentAutomationMode::Supervised,
            status: AgentRunStatus::Evaluating,
            objective: "Build a traceable report".into(),
            budget: AgentBudget::default(),
            budget_usage: AgentBudgetUsage::default(),
            current_plan_version: Some(1),
            decision_summary: None,
            last_error_code: None,
            created_at_ms: 1,
            updated_at_ms: 2,
            completed_at_ms: None,
        }
    }

    fn succeeded_step() -> AgentStepRecord {
        AgentStepRecord {
            run_id: "run-1".into(),
            plan_version: 1,
            step_id: "audit".into(),
            ordinal: 1,
            title: "Audit".into(),
            tool_name: "inspect_report_audit".into(),
            tool_version: "1.0.0".into(),
            registry_hash: "registry".into(),
            input: json!({"reportArtifactId":"report"}),
            resolved_input: Some(json!({"reportArtifactId":"report"})),
            action_hash: Some("action".into()),
            pending_approval_hash: None,
            pending_approval_requested_at_ms: None,
            risk: AgentRiskLevel::Read,
            status: AgentStepStatus::Succeeded,
            attempts: 1,
            operation_key: Some("operation".into()),
            recovery_count: 0,
            observation: Some(json!({"artifacts":[{"id":"audit"}]})),
            last_error_code: None,
            started_at_ms: Some(1),
            finished_at_ms: Some(2),
            updated_at_ms: 2,
        }
    }

    fn artifact(
        id: &str,
        step_id: &str,
        kind: &str,
        content: Value,
        created_at_ms: i64,
    ) -> AgentArtifactRecord {
        AgentArtifactRecord {
            id: id.into(),
            run_id: "run-1".into(),
            step_id: Some(step_id.into()),
            artifact_kind: kind.into(),
            content_sha256: canonical_value_sha256(&content).unwrap(),
            content,
            snapshot_id: Some("snapshot".into()),
            audit: None,
            review_status: None,
            supersedes_artifact_id: None,
            created_at_ms,
        }
    }

    fn valid_artifacts(risk_level: &str) -> Vec<AgentArtifactRecord> {
        let evidence = artifact(
            "evidence",
            "save-evidence",
            "evidence",
            json!({"papers":[{"id":"p1"},{"id":"p2"},{"id":"p3"}]}),
            1,
        );
        let initial_report_id = if risk_level == "high" {
            "report-initial"
        } else {
            "report"
        };
        let initial_audit_id = if risk_level == "high" {
            "audit-initial"
        } else {
            "audit"
        };
        let initial_report = artifact(
            initial_report_id,
            "create-report",
            "report_draft",
            json!({"content":"traceable report","evidenceArtifactId":"evidence","paperIds":["p1","p2","p3"]}),
            2,
        );
        let report_content_hash =
            canonical_value_sha256(&Value::String("traceable report".into())).unwrap();
        let initial_audit = artifact(
            initial_audit_id,
            "audit-report",
            "report_audit",
            json!({
                "invalidCitationCount":0,
                "evidenceProfilePresent":true,
                "missingRequiredSections":[],
                "riskLevel":risk_level,
                "reportContentHash":report_content_hash,
                "evidenceContentHash":evidence.content_sha256.clone(),
            }),
            3,
        );
        if risk_level != "high" {
            return vec![evidence, initial_report, initial_audit];
        }
        let mut revised_report = artifact(
            "report",
            "revise-high-risk",
            "report_draft",
            json!({"content":"traceable report","evidenceArtifactId":"evidence","paperIds":["p1","p2","p3"]}),
            4,
        );
        revised_report.supersedes_artifact_id = Some("report-initial".into());
        let revised_audit = artifact(
            "audit",
            "audit-revised",
            "report_audit",
            json!({
                "invalidCitationCount":0,
                "evidenceProfilePresent":true,
                "missingRequiredSections":[],
                "riskLevel":"high",
                "reportContentHash":report_content_hash,
                "evidenceContentHash":evidence.content_sha256.clone(),
            }),
            5,
        );
        vec![
            evidence,
            initial_report,
            initial_audit,
            revised_report,
            revised_audit,
        ]
    }

    fn active_snapshot(snapshot_id: &str) -> AnalysisState {
        AnalysisState {
            project_id: "project".into(),
            active_snapshot_id: snapshot_id.into(),
            algorithm_version: "v20".into(),
            paper_count: 3,
            hotspot_count: 1,
            membership_count: 3,
            generated_at: "now".into(),
            library_revision: 0,
        }
    }

    fn completion(
        run: &AgentRunRecord,
        active: &AnalysisState,
        plan_approved: bool,
        artifacts: &[AgentArtifactRecord],
        review_approved: bool,
    ) -> CompletionGateResult {
        let initial_high_risk = artifacts
            .iter()
            .find(|artifact| artifact.id == "audit-initial")
            .is_some();
        let mut steps = REQUIRED_FLAGSHIP_STEPS
            .iter()
            .chain(CONDITIONAL_REVISION_STEPS.iter())
            .enumerate()
            .map(|(ordinal, (step_id, tool_name))| {
                let mut step = succeeded_step();
                step.step_id = (*step_id).into();
                step.ordinal = ordinal as u32;
                step.title = (*step_id).into();
                step.tool_name = (*tool_name).into();
                step.observation = match *step_id {
                    "save-evidence" => {
                        Some(json!({"artifacts":[{"id":"evidence","kind":"evidence"}]}))
                    }
                    "create-report" => Some(json!({"artifacts":[{
                        "id":if initial_high_risk {"report-initial"} else {"report"},
                        "kind":"report_draft"
                    }]})),
                    "audit-report" => Some(json!({"artifacts":[{
                        "id":if initial_high_risk {"audit-initial"} else {"audit"},
                        "kind":"report_audit"
                    }]})),
                    "revise-high-risk" if initial_high_risk => {
                        Some(json!({"artifacts":[{"id":"report","kind":"report_draft"}]}))
                    }
                    "audit-revised" if initial_high_risk => {
                        Some(json!({"artifacts":[{"id":"audit","kind":"report_audit"}]}))
                    }
                    "revise-high-risk" | "audit-revised" => {
                        step.status = AgentStepStatus::Skipped;
                        step.last_error_code = Some("AGENT_REPORT_REVISION_NOT_REQUIRED".into());
                        step.operation_key = None;
                        None
                    }
                    _ => Some(json!({"ok":true})),
                };
                step
            })
            .collect::<Vec<_>>();
        steps.sort_by_key(|step| step.ordinal);
        evaluate_completion_gate(CompletionGateInput {
            run,
            active_snapshot: Some(active),
            plan_approved,
            pending_action_approval: false,
            steps: &steps,
            artifacts,
            evidence_papers_exist: true,
            latest_report_review_approved: review_approved,
        })
    }

    #[test]
    fn action_hash_binds_registry_version_and_writer_profile() {
        let base = governed_action_hash(
            "create_report_draft",
            "1.0.0",
            "registry-a",
            AgentRiskLevel::Write,
            &json!({"topic":"x"}),
            Some("writer-a"),
        )
        .unwrap();
        assert_ne!(
            base,
            governed_action_hash(
                "create_report_draft",
                "1.0.0",
                "registry-b",
                AgentRiskLevel::Write,
                &json!({"topic":"x"}),
                Some("writer-a"),
            )
            .unwrap()
        );
        assert_ne!(
            base,
            governed_action_hash(
                "create_report_draft",
                "1.0.0",
                "registry-a",
                AgentRiskLevel::Write,
                &json!({"topic":"x"}),
                Some("writer-b"),
            )
            .unwrap()
        );
    }

    #[test]
    fn governed_action_rejects_forged_risk_and_stale_registry_binding() {
        let registry = AgentToolRegistry::standard().unwrap();
        let definition = registry.get("save_research_evidence").unwrap();
        let input = json!({
            "topic":"quantum",
            "paperIds":["p1","p2","p3"],
            "mode":"simple"
        });
        let turn = || ActionPlannerTurn::CallTool {
            tool: "save_research_evidence".into(),
            input: input.clone(),
        };
        let mut step = succeeded_step();
        step.tool_name = "save_research_evidence".into();
        step.tool_version = definition.version.clone();
        step.registry_hash = registry.hash().into();
        step.input = input.clone();
        step.resolved_input = Some(input.clone());
        step.risk = AgentRiskLevel::Read;
        assert_eq!(
            govern_action_planner_turn(turn(), &step, &input, &registry, None).unwrap_err(),
            "AGENT_ACTION_RISK_MISMATCH"
        );

        step.risk = AgentRiskLevel::Write;
        step.registry_hash = "previous-registry".into();
        assert_eq!(
            govern_action_planner_turn(turn(), &step, &input, &registry, None).unwrap_err(),
            "AGENT_ACTION_REGISTRY_STALE"
        );
    }

    #[test]
    fn completion_gate_accepts_only_the_fully_valid_baseline() {
        let result = completion(
            &completed_run(),
            &active_snapshot("snapshot"),
            true,
            &valid_artifacts("low"),
            false,
        );
        assert_eq!(result.disposition, CompletionDisposition::Completed);
        assert!(result.reasons.is_empty());
        assert_eq!(result.report_artifact_id.as_deref(), Some("report"));
        assert_eq!(result.audit_artifact_id.as_deref(), Some("audit"));
    }

    #[test]
    fn completion_gate_waits_when_the_active_snapshot_has_drifted() {
        let result = completion(
            &completed_run(),
            &active_snapshot("new-snapshot"),
            true,
            &valid_artifacts("low"),
            false,
        );
        assert_eq!(result.disposition, CompletionDisposition::AwaitingUser);
        assert!(result
            .reasons
            .iter()
            .any(|reason| reason == "AGENT_V20_SNAPSHOT_STALE"));
        assert!(result
            .reasons
            .iter()
            .any(|reason| reason == "AGENT_ARTIFACT_SNAPSHOT_STALE"));
    }

    #[test]
    fn completion_gate_rejects_an_unapproved_supervised_plan() {
        let result = completion(
            &completed_run(),
            &active_snapshot("snapshot"),
            false,
            &valid_artifacts("low"),
            false,
        );
        assert_eq!(result.disposition, CompletionDisposition::Rejected);
        assert!(result
            .reasons
            .iter()
            .any(|reason| reason == "AGENT_PLAN_APPROVAL_REQUIRED"));
    }

    #[test]
    fn completion_gate_waits_for_manual_review_of_a_high_risk_report() {
        let run = completed_run();
        let active = active_snapshot("snapshot");
        let artifacts = valid_artifacts("high");
        let waiting = completion(&run, &active, true, &artifacts, false);
        assert_eq!(waiting.disposition, CompletionDisposition::AwaitingUser);
        assert!(waiting
            .reasons
            .iter()
            .any(|reason| reason == "AGENT_HIGH_RISK_REPORT_REVIEW_REQUIRED"));

        let approved = completion(&run, &active, true, &artifacts, true);
        assert_eq!(approved.disposition, CompletionDisposition::Completed);
    }

    #[test]
    fn completion_gate_rejects_any_artifact_hash_mismatch() {
        let mut artifacts = valid_artifacts("low");
        artifacts[1].content = json!({"content":"tampered after hashing"});
        let result = completion(
            &completed_run(),
            &active_snapshot("snapshot"),
            true,
            &artifacts,
            false,
        );
        assert_eq!(result.disposition, CompletionDisposition::Rejected);
        assert!(result
            .reasons
            .iter()
            .any(|reason| reason == "AGENT_ARTIFACT_HASH_INVALID"));
    }

    #[test]
    fn completion_gate_rejects_tampered_superseded_artifacts_and_broken_chains() {
        let mut artifacts = valid_artifacts("high");
        artifacts
            .iter_mut()
            .find(|artifact| artifact.id == "report-initial")
            .unwrap()
            .content = json!({"content":"tampered superseded draft"});
        let tampered = completion(
            &completed_run(),
            &active_snapshot("snapshot"),
            true,
            &artifacts,
            true,
        );
        assert_eq!(tampered.disposition, CompletionDisposition::Rejected);
        assert!(tampered
            .reasons
            .iter()
            .any(|reason| reason == "AGENT_ARTIFACT_HASH_INVALID"));

        let mut broken = valid_artifacts("high");
        broken
            .iter_mut()
            .find(|artifact| artifact.id == "report")
            .unwrap()
            .supersedes_artifact_id = Some("missing-report".into());
        let broken = completion(
            &completed_run(),
            &active_snapshot("snapshot"),
            true,
            &broken,
            true,
        );
        assert_eq!(broken.disposition, CompletionDisposition::Rejected);
        assert!(broken
            .reasons
            .iter()
            .any(|reason| reason == "AGENT_ARTIFACT_SUPERSEDES_INVALID"));
    }

    #[test]
    fn completion_gate_never_treats_a_skipped_required_step_as_complete() {
        let mut skipped = succeeded_step();
        skipped.step_id = "inspect-library".into();
        skipped.tool_name = "inspect_library_state".into();
        skipped.status = AgentStepStatus::Skipped;
        skipped.last_error_code = Some("AGENT_REPORT_REVISION_NOT_REQUIRED".into());
        let artifacts = valid_artifacts("low");
        let result = evaluate_completion_gate(CompletionGateInput {
            run: &completed_run(),
            active_snapshot: Some(&active_snapshot("snapshot")),
            plan_approved: true,
            pending_action_approval: false,
            steps: &[skipped],
            artifacts: &artifacts,
            evidence_papers_exist: true,
            latest_report_review_approved: false,
        });
        assert_eq!(result.disposition, CompletionDisposition::Rejected);
        assert!(result.reasons.iter().any(|reason| {
            reason.starts_with("AGENT_REQUIRED_STEP_NOT_SUCCEEDED:inspect-library")
        }));
    }
}
