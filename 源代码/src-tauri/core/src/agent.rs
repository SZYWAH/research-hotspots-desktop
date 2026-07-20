use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};
use std::collections::HashSet;

pub const DEFAULT_AGENT_MAX_STEPS: u32 = 20;
pub const DEFAULT_AGENT_MAX_RETRIES_PER_TOOL: u32 = 1;
pub const DEFAULT_AGENT_MAX_REPORT_REWRITES: u32 = 1;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AgentAutomationMode {
    Advisor,
    Supervised,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum AgentRunStatus {
    Draft,
    Planning,
    AwaitingPlanApproval,
    Ready,
    Running,
    AwaitingActionApproval,
    Evaluating,
    Paused,
    Cancelling,
    Cancelled,
    Failed,
    Completed,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum AgentStepStatus {
    Planned,
    Ready,
    Running,
    WaitingUser,
    Succeeded,
    Failed,
    Skipped,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AgentRiskLevel {
    Read,
    Write,
    High,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AgentPolicyDecision {
    Allowed,
    RequiresApproval,
    Forbidden,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AgentBudgetOperation {
    ExecuteStep,
    RetryTool,
    RewriteReport,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AgentBudget {
    pub max_steps: u32,
    pub max_retries_per_tool: u32,
    pub max_report_rewrites: u32,
}
impl Default for AgentBudget {
    fn default() -> Self {
        Self {
            max_steps: DEFAULT_AGENT_MAX_STEPS,
            max_retries_per_tool: DEFAULT_AGENT_MAX_RETRIES_PER_TOOL,
            max_report_rewrites: DEFAULT_AGENT_MAX_REPORT_REWRITES,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AgentBudgetUsage {
    pub executed_steps: u32,
    pub retries_for_current_tool: u32,
    pub report_rewrites: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AgentSuccessCriterion {
    pub id: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AgentPlanStep {
    pub id: String,
    pub title: String,
    pub tool: String,
    pub input: Value,
    pub risk: AgentRiskLevel,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AgentPlan {
    pub version: u32,
    pub objective: String,
    pub assumptions: Vec<String>,
    pub success_criteria: Vec<AgentSuccessCriterion>,
    pub steps: Vec<AgentPlanStep>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AgentDecisionSummary {
    pub summary: String,
    pub policy_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "action", rename_all = "snake_case", deny_unknown_fields)]
pub enum AgentAction {
    CallTool {
        tool: String,
        input: Value,
        risk: AgentRiskLevel,
    },
    AskUser {
        question: String,
    },
    Complete {
        summary: String,
    },
}

pub fn validate_run_transition(from: AgentRunStatus, to: AgentRunStatus) -> Result<(), String> {
    let allowed = matches!(
        (from, to),
        (
            AgentRunStatus::Draft,
            AgentRunStatus::Planning | AgentRunStatus::Cancelled
        ) | (
            AgentRunStatus::Planning,
            AgentRunStatus::AwaitingPlanApproval
                | AgentRunStatus::Failed
                | AgentRunStatus::Cancelled
        ) | (
            AgentRunStatus::AwaitingPlanApproval,
            AgentRunStatus::Planning | AgentRunStatus::Ready | AgentRunStatus::Cancelled
        ) | (
            AgentRunStatus::Ready,
            AgentRunStatus::Running | AgentRunStatus::Paused | AgentRunStatus::Cancelled
        ) | (
            AgentRunStatus::Running,
            AgentRunStatus::AwaitingActionApproval
                | AgentRunStatus::Evaluating
                | AgentRunStatus::Paused
                | AgentRunStatus::Cancelling
                | AgentRunStatus::Failed
        ) | (
            AgentRunStatus::AwaitingActionApproval,
            AgentRunStatus::Running
                | AgentRunStatus::Paused
                | AgentRunStatus::Cancelling
                | AgentRunStatus::Cancelled
        ) | (
            AgentRunStatus::Evaluating,
            AgentRunStatus::Running
                | AgentRunStatus::AwaitingActionApproval
                | AgentRunStatus::Completed
                | AgentRunStatus::Paused
                | AgentRunStatus::Cancelling
                | AgentRunStatus::Failed
        ) | (
            AgentRunStatus::Paused,
            AgentRunStatus::Ready
                | AgentRunStatus::Running
                | AgentRunStatus::Cancelling
                | AgentRunStatus::Cancelled
        ) | (
            AgentRunStatus::Cancelling,
            AgentRunStatus::Cancelled | AgentRunStatus::Failed
        )
    );
    if allowed {
        Ok(())
    } else {
        Err(format!("AGENT_INVALID_RUN_TRANSITION:{from:?}->{to:?}"))
    }
}

pub fn validate_step_transition(from: AgentStepStatus, to: AgentStepStatus) -> Result<(), String> {
    let allowed = matches!(
        (from, to),
        (
            AgentStepStatus::Planned,
            AgentStepStatus::Ready | AgentStepStatus::Skipped
        ) | (
            AgentStepStatus::Ready,
            AgentStepStatus::Running | AgentStepStatus::WaitingUser | AgentStepStatus::Skipped
        ) | (
            AgentStepStatus::Running,
            AgentStepStatus::Succeeded | AgentStepStatus::Failed | AgentStepStatus::WaitingUser
        ) | (
            AgentStepStatus::WaitingUser,
            AgentStepStatus::Ready
                | AgentStepStatus::Running
                | AgentStepStatus::Failed
                | AgentStepStatus::Skipped
        ) | (
            AgentStepStatus::Failed,
            AgentStepStatus::Ready | AgentStepStatus::Skipped
        )
    );
    if allowed {
        Ok(())
    } else {
        Err(format!("AGENT_INVALID_STEP_TRANSITION:{from:?}->{to:?}"))
    }
}

pub fn validate_plan(plan: &AgentPlan, budget: &AgentBudget) -> Result<(), String> {
    if plan.version == 0 {
        return Err("AGENT_PLAN_VERSION_REQUIRED".into());
    }
    if plan.objective.trim().is_empty() {
        return Err("AGENT_PLAN_OBJECTIVE_REQUIRED".into());
    }
    if budget.max_steps == 0 {
        return Err("AGENT_BUDGET_MAX_STEPS_REQUIRED".into());
    }
    if plan.steps.is_empty() {
        return Err("AGENT_PLAN_STEPS_REQUIRED".into());
    }
    if plan.steps.len() > budget.max_steps as usize {
        return Err("AGENT_PLAN_STEP_LIMIT_EXCEEDED".into());
    }
    if plan.success_criteria.is_empty() {
        return Err("AGENT_PLAN_SUCCESS_CRITERIA_REQUIRED".into());
    }
    if plan.assumptions.iter().any(|value| value.trim().is_empty()) {
        return Err("AGENT_PLAN_ASSUMPTION_EMPTY".into());
    }
    let mut criterion_ids = HashSet::new();
    for criterion in &plan.success_criteria {
        if !is_valid_identifier(&criterion.id) || criterion.description.trim().is_empty() {
            return Err("AGENT_PLAN_SUCCESS_CRITERION_INVALID".into());
        }
        if !criterion_ids.insert(criterion.id.as_str()) {
            return Err("AGENT_PLAN_SUCCESS_CRITERION_DUPLICATE".into());
        }
    }
    let mut step_ids = HashSet::new();
    for step in &plan.steps {
        if !is_valid_identifier(&step.id) {
            return Err("AGENT_PLAN_STEP_ID_INVALID".into());
        }
        if !step_ids.insert(step.id.as_str()) {
            return Err("AGENT_PLAN_STEP_ID_DUPLICATE".into());
        }
        if step.title.trim().is_empty() {
            return Err("AGENT_PLAN_STEP_TITLE_REQUIRED".into());
        }
        validate_tool_call(&step.tool, &step.input)?;
    }
    Ok(())
}

pub fn validate_action(action: &AgentAction) -> Result<(), String> {
    match action {
        AgentAction::CallTool { tool, input, .. } => validate_tool_call(tool, input),
        AgentAction::AskUser { question } if question.trim().is_empty() => {
            Err("AGENT_QUESTION_REQUIRED".into())
        }
        AgentAction::Complete { summary } if summary.trim().is_empty() => {
            Err("AGENT_COMPLETION_SUMMARY_REQUIRED".into())
        }
        AgentAction::AskUser { .. } | AgentAction::Complete { .. } => Ok(()),
    }
}

pub fn plan_approval_hash(plan: &AgentPlan) -> Result<String, String> {
    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct HashStep<'a> {
        id: &'a str,
        tool: &'a str,
        input: &'a Value,
        risk: AgentRiskLevel,
    }
    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct HashPlan<'a> {
        version: u32,
        objective: &'a str,
        assumptions: &'a [String],
        success_criteria: &'a [AgentSuccessCriterion],
        steps: Vec<HashStep<'a>>,
    }
    let payload = HashPlan {
        version: plan.version,
        objective: &plan.objective,
        assumptions: &plan.assumptions,
        success_criteria: &plan.success_criteria,
        steps: plan
            .steps
            .iter()
            .map(|step| HashStep {
                id: &step.id,
                tool: &step.tool,
                input: &step.input,
                risk: step.risk,
            })
            .collect(),
    };
    canonical_json_sha256(&payload)
}

pub fn action_approval_hash(action: &AgentAction) -> Result<String, String> {
    let AgentAction::CallTool { tool, input, risk } = action else {
        return Err("AGENT_ACTION_APPROVAL_ONLY_SUPPORTS_TOOLS".into());
    };
    validate_tool_call(tool, input)?;
    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct HashAction<'a> {
        tool: &'a str,
        input: &'a Value,
        risk: AgentRiskLevel,
    }
    canonical_json_sha256(&HashAction {
        tool,
        input,
        risk: *risk,
    })
}

pub fn plan_approval_matches(plan: &AgentPlan, approved_hash: &str) -> Result<bool, String> {
    Ok(plan_approval_hash(plan)?.eq_ignore_ascii_case(approved_hash))
}

pub fn action_approval_matches(action: &AgentAction, approved_hash: &str) -> Result<bool, String> {
    Ok(action_approval_hash(action)?.eq_ignore_ascii_case(approved_hash))
}

pub fn plan_requires_approval(mode: AgentAutomationMode) -> bool {
    matches!(mode, AgentAutomationMode::Supervised)
}

pub fn action_policy(mode: AgentAutomationMode, action: &AgentAction) -> AgentPolicyDecision {
    if matches!(mode, AgentAutomationMode::Advisor) {
        return AgentPolicyDecision::Forbidden;
    }
    match action {
        AgentAction::CallTool {
            risk: AgentRiskLevel::Read,
            ..
        } => AgentPolicyDecision::Allowed,
        AgentAction::CallTool {
            risk: AgentRiskLevel::Write | AgentRiskLevel::High,
            ..
        } => AgentPolicyDecision::RequiresApproval,
        AgentAction::AskUser { .. } | AgentAction::Complete { .. } => AgentPolicyDecision::Allowed,
    }
}

pub fn action_requires_approval(mode: AgentAutomationMode, action: &AgentAction) -> bool {
    action_policy(mode, action) == AgentPolicyDecision::RequiresApproval
}

pub fn budget_allows(
    budget: &AgentBudget,
    usage: &AgentBudgetUsage,
    operation: AgentBudgetOperation,
) -> bool {
    match operation {
        AgentBudgetOperation::ExecuteStep => usage.executed_steps < budget.max_steps,
        AgentBudgetOperation::RetryTool => {
            usage.retries_for_current_tool < budget.max_retries_per_tool
        }
        AgentBudgetOperation::RewriteReport => usage.report_rewrites < budget.max_report_rewrites,
    }
}

pub fn budget_is_exhausted(
    budget: &AgentBudget,
    usage: &AgentBudgetUsage,
    operation: AgentBudgetOperation,
) -> bool {
    !budget_allows(budget, usage, operation)
}

fn validate_tool_call(tool: &str, input: &Value) -> Result<(), String> {
    if !is_valid_tool_name(tool) {
        return Err("AGENT_TOOL_NAME_INVALID".into());
    }
    if !input.is_object() {
        return Err("AGENT_TOOL_INPUT_MUST_BE_OBJECT".into());
    }
    if contains_sensitive_field(input) {
        return Err("AGENT_TOOL_INPUT_CONTAINS_CREDENTIAL".into());
    }
    Ok(())
}

fn is_valid_tool_name(value: &str) -> bool {
    let bytes = value.as_bytes();
    !bytes.is_empty()
        && bytes.len() <= 64
        && bytes[0].is_ascii_lowercase()
        && bytes
            .iter()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || *byte == b'_')
}

fn is_valid_identifier(value: &str) -> bool {
    let bytes = value.as_bytes();
    !bytes.is_empty()
        && bytes.len() <= 64
        && bytes[0].is_ascii_alphanumeric()
        && bytes
            .iter()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(*byte, b'_' | b'-' | b'.'))
}

fn contains_sensitive_field(value: &Value) -> bool {
    match value {
        Value::Object(values) => values.iter().any(|(key, child)| {
            let normalized = key
                .chars()
                .filter(|value| value.is_ascii_alphanumeric())
                .flat_map(char::to_lowercase)
                .collect::<String>();
            matches!(
                normalized.as_str(),
                "apikey"
                    | "password"
                    | "mysqlpassword"
                    | "authorization"
                    | "credential"
                    | "credentials"
                    | "accesskey"
                    | "secret"
                    | "clientsecret"
                    | "accesstoken"
                    | "refreshtoken"
                    | "bearer"
            ) || contains_sensitive_field(child)
        }),
        Value::Array(values) => values.iter().any(contains_sensitive_field),
        _ => false,
    }
}

pub fn validate_storable_json(value: &Value) -> Result<(), String> {
    if contains_sensitive_field(value) {
        return Err("AGENT_JSON_CONTAINS_CREDENTIAL".into());
    }
    Ok(())
}

pub fn canonical_value_sha256(value: &Value) -> Result<String, String> {
    validate_storable_json(value)?;
    canonical_json_sha256(value)
}

fn canonical_json_sha256<T: Serialize>(value: &T) -> Result<String, String> {
    let value = serde_json::to_value(value)
        .map_err(|error| format!("AGENT_HASH_SERIALIZE_FAILED:{error}"))?;
    let bytes = serde_json::to_vec(&canonicalize_json(value))
        .map_err(|error| format!("AGENT_HASH_SERIALIZE_FAILED:{error}"))?;
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    Ok(format!("{:x}", hasher.finalize()))
}

fn canonicalize_json(value: Value) -> Value {
    match value {
        Value::Array(values) => Value::Array(values.into_iter().map(canonicalize_json).collect()),
        Value::Object(values) => {
            let mut entries = values.into_iter().collect::<Vec<_>>();
            entries.sort_by(|left, right| left.0.cmp(&right.0));
            let mut output = Map::new();
            for (key, value) in entries {
                output.insert(key, canonicalize_json(value));
            }
            Value::Object(output)
        }
        value => value,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const RUNS: [AgentRunStatus; 12] = [
        AgentRunStatus::Draft,
        AgentRunStatus::Planning,
        AgentRunStatus::AwaitingPlanApproval,
        AgentRunStatus::Ready,
        AgentRunStatus::Running,
        AgentRunStatus::AwaitingActionApproval,
        AgentRunStatus::Evaluating,
        AgentRunStatus::Paused,
        AgentRunStatus::Cancelling,
        AgentRunStatus::Cancelled,
        AgentRunStatus::Failed,
        AgentRunStatus::Completed,
    ];
    const STEPS: [AgentStepStatus; 7] = [
        AgentStepStatus::Planned,
        AgentStepStatus::Ready,
        AgentStepStatus::Running,
        AgentStepStatus::WaitingUser,
        AgentStepStatus::Succeeded,
        AgentStepStatus::Failed,
        AgentStepStatus::Skipped,
    ];

    fn sample_plan() -> AgentPlan {
        AgentPlan {
            version: 1,
            objective: "Analyse quantum error correction".into(),
            assumptions: vec!["Use the active V20 snapshot".into()],
            success_criteria: vec![AgentSuccessCriterion {
                id: "evidence".into(),
                description: "Use traceable representative papers".into(),
            }],
            steps: vec![AgentPlanStep {
                id: "inspect-snapshot".into(),
                title: "Inspect snapshot".into(),
                tool: "inspect_v20_snapshot".into(),
                input: json!({"projectId": "project-default", "scope": {"start": 2021, "end": 2026}}),
                risk: AgentRiskLevel::Read,
            }],
        }
    }

    fn run_edge(from: AgentRunStatus, to: AgentRunStatus) -> bool {
        matches!(
            (from, to),
            (
                AgentRunStatus::Draft,
                AgentRunStatus::Planning | AgentRunStatus::Cancelled
            ) | (
                AgentRunStatus::Planning,
                AgentRunStatus::AwaitingPlanApproval
                    | AgentRunStatus::Failed
                    | AgentRunStatus::Cancelled
            ) | (
                AgentRunStatus::AwaitingPlanApproval,
                AgentRunStatus::Planning | AgentRunStatus::Ready | AgentRunStatus::Cancelled
            ) | (
                AgentRunStatus::Ready,
                AgentRunStatus::Running | AgentRunStatus::Paused | AgentRunStatus::Cancelled
            ) | (
                AgentRunStatus::Running,
                AgentRunStatus::AwaitingActionApproval
                    | AgentRunStatus::Evaluating
                    | AgentRunStatus::Paused
                    | AgentRunStatus::Cancelling
                    | AgentRunStatus::Failed
            ) | (
                AgentRunStatus::AwaitingActionApproval,
                AgentRunStatus::Running
                    | AgentRunStatus::Paused
                    | AgentRunStatus::Cancelling
                    | AgentRunStatus::Cancelled
            ) | (
                AgentRunStatus::Evaluating,
                AgentRunStatus::Running
                    | AgentRunStatus::AwaitingActionApproval
                    | AgentRunStatus::Completed
                    | AgentRunStatus::Paused
                    | AgentRunStatus::Cancelling
                    | AgentRunStatus::Failed
            ) | (
                AgentRunStatus::Paused,
                AgentRunStatus::Ready
                    | AgentRunStatus::Running
                    | AgentRunStatus::Cancelling
                    | AgentRunStatus::Cancelled
            ) | (
                AgentRunStatus::Cancelling,
                AgentRunStatus::Cancelled | AgentRunStatus::Failed
            )
        )
    }

    fn step_edge(from: AgentStepStatus, to: AgentStepStatus) -> bool {
        matches!(
            (from, to),
            (
                AgentStepStatus::Planned,
                AgentStepStatus::Ready | AgentStepStatus::Skipped
            ) | (
                AgentStepStatus::Ready,
                AgentStepStatus::Running | AgentStepStatus::WaitingUser | AgentStepStatus::Skipped
            ) | (
                AgentStepStatus::Running,
                AgentStepStatus::Succeeded | AgentStepStatus::Failed | AgentStepStatus::WaitingUser
            ) | (
                AgentStepStatus::WaitingUser,
                AgentStepStatus::Ready
                    | AgentStepStatus::Running
                    | AgentStepStatus::Failed
                    | AgentStepStatus::Skipped
            ) | (
                AgentStepStatus::Failed,
                AgentStepStatus::Ready | AgentStepStatus::Skipped
            )
        )
    }

    #[test]
    fn transition_matrices_accept_only_declared_edges() {
        for from in RUNS {
            for to in RUNS {
                assert_eq!(
                    validate_run_transition(from, to).is_ok(),
                    run_edge(from, to),
                    "{from:?}->{to:?}"
                );
            }
        }
        for from in STEPS {
            for to in STEPS {
                assert_eq!(
                    validate_step_transition(from, to).is_ok(),
                    step_edge(from, to),
                    "{from:?}->{to:?}"
                );
            }
        }
        assert!(
            validate_run_transition(AgentRunStatus::Running, AgentRunStatus::Completed).is_err()
        );
    }

    #[test]
    fn plan_validation_covers_required_duplicate_limit_and_tool_rules() {
        let budget = AgentBudget::default();
        let mut plan = sample_plan();
        plan.objective.clear();
        assert_eq!(
            validate_plan(&plan, &budget).unwrap_err(),
            "AGENT_PLAN_OBJECTIVE_REQUIRED"
        );
        let mut plan = sample_plan();
        plan.steps.clear();
        assert_eq!(
            validate_plan(&plan, &budget).unwrap_err(),
            "AGENT_PLAN_STEPS_REQUIRED"
        );
        let mut plan = sample_plan();
        plan.steps.push(plan.steps[0].clone());
        assert_eq!(
            validate_plan(&plan, &budget).unwrap_err(),
            "AGENT_PLAN_STEP_ID_DUPLICATE"
        );
        let mut plan = sample_plan();
        plan.steps = (0..=budget.max_steps)
            .map(|index| AgentPlanStep {
                id: format!("step-{index}"),
                ..plan.steps[0].clone()
            })
            .collect();
        assert_eq!(
            validate_plan(&plan, &budget).unwrap_err(),
            "AGENT_PLAN_STEP_LIMIT_EXCEEDED"
        );
        let mut plan = sample_plan();
        plan.steps[0].tool = "Invalid Tool".into();
        assert_eq!(
            validate_plan(&plan, &budget).unwrap_err(),
            "AGENT_TOOL_NAME_INVALID"
        );
        let mut plan = sample_plan();
        plan.steps[0].input = json!([]);
        assert_eq!(
            validate_plan(&plan, &budget).unwrap_err(),
            "AGENT_TOOL_INPUT_MUST_BE_OBJECT"
        );
    }

    #[test]
    fn credential_fields_are_rejected_recursively() {
        for input in [
            json!({"apiKey": "x"}),
            json!({"nested": {"mysql_password": "x"}}),
            json!({"items": [{"authorization": "x"}]}),
        ] {
            let action = AgentAction::CallTool {
                tool: "inspect_library".into(),
                input,
                risk: AgentRiskLevel::Read,
            };
            assert_eq!(
                validate_action(&action).unwrap_err(),
                "AGENT_TOOL_INPUT_CONTAINS_CREDENTIAL"
            );
        }
    }

    #[test]
    fn plan_hash_is_canonical_and_excludes_display_title() {
        let first = sample_plan();
        let mut second = sample_plan();
        second.steps[0].title = "Translated display title".into();
        second.steps[0].input = serde_json::from_str(
            r#"{"scope":{"end":2026,"start":2021},"projectId":"project-default"}"#,
        )
        .unwrap();
        assert_eq!(
            plan_approval_hash(&first).unwrap(),
            plan_approval_hash(&second).unwrap()
        );
    }

    #[test]
    fn executable_changes_invalidate_plan_approval() {
        let plan = sample_plan();
        let hash = plan_approval_hash(&plan).unwrap();
        assert!(plan_approval_matches(&plan, &hash).unwrap());
        let mut changed = plan.clone();
        changed.steps[0].input = json!({"projectId": "other"});
        assert!(!plan_approval_matches(&changed, &hash).unwrap());
        let mut changed = plan;
        changed.steps[0].risk = AgentRiskLevel::Write;
        assert!(!plan_approval_matches(&changed, &hash).unwrap());
    }

    #[test]
    fn action_hash_binds_tool_input_and_risk() {
        let action = AgentAction::CallTool {
            tool: "cluster_v20".into(),
            input: json!({"projectId": "p"}),
            risk: AgentRiskLevel::High,
        };
        let hash = action_approval_hash(&action).unwrap();
        assert!(action_approval_matches(&action, &hash).unwrap());
        let changed = AgentAction::CallTool {
            tool: "cluster_v20".into(),
            input: json!({"projectId": "p"}),
            risk: AgentRiskLevel::Read,
        };
        assert!(!action_approval_matches(&changed, &hash).unwrap());
    }

    #[test]
    fn supervised_and_advisor_policies_enforce_boundaries() {
        let read = AgentAction::CallTool {
            tool: "inspect_library".into(),
            input: json!({}),
            risk: AgentRiskLevel::Read,
        };
        let write = AgentAction::CallTool {
            tool: "export_report".into(),
            input: json!({}),
            risk: AgentRiskLevel::Write,
        };
        let high = AgentAction::CallTool {
            tool: "cluster_v20".into(),
            input: json!({}),
            risk: AgentRiskLevel::High,
        };
        assert_eq!(
            action_policy(AgentAutomationMode::Supervised, &read),
            AgentPolicyDecision::Allowed
        );
        assert!(action_requires_approval(
            AgentAutomationMode::Supervised,
            &write
        ));
        assert!(action_requires_approval(
            AgentAutomationMode::Supervised,
            &high
        ));
        assert!(plan_requires_approval(AgentAutomationMode::Supervised));
        for action in [&read, &write, &high] {
            assert_eq!(
                action_policy(AgentAutomationMode::Advisor, action),
                AgentPolicyDecision::Forbidden
            );
        }
        assert!(!plan_requires_approval(AgentAutomationMode::Advisor));
    }

    #[test]
    fn operation_budgets_stop_without_silent_expansion() {
        let budget = AgentBudget::default();
        let available = AgentBudgetUsage {
            executed_steps: 19,
            retries_for_current_tool: 0,
            report_rewrites: 0,
        };
        for operation in [
            AgentBudgetOperation::ExecuteStep,
            AgentBudgetOperation::RetryTool,
            AgentBudgetOperation::RewriteReport,
        ] {
            assert!(budget_allows(&budget, &available, operation));
        }
        let exhausted = AgentBudgetUsage {
            executed_steps: 20,
            retries_for_current_tool: 1,
            report_rewrites: 1,
        };
        for operation in [
            AgentBudgetOperation::ExecuteStep,
            AgentBudgetOperation::RetryTool,
            AgentBudgetOperation::RewriteReport,
        ] {
            assert!(budget_is_exhausted(&budget, &exhausted, operation));
        }
    }

    #[test]
    fn serde_rejects_unknown_fields_and_contract_excludes_reasoning_fields() {
        let serialized = serde_json::to_string(&sample_plan())
            .unwrap()
            .to_ascii_lowercase();
        for forbidden in [
            "apikey",
            "password",
            "authorization",
            "credential",
            "chainofthought",
            "reasoning",
        ] {
            assert!(!serialized.contains(forbidden));
        }
        assert!(serde_json::from_value::<AgentAction>(json!({
            "action": "call_tool", "tool": "inspect_library", "input": {}, "risk": "read", "unexpected": true
        })).is_err());
        assert!(serde_json::from_value::<AgentRunStatus>(json!("unknown_status")).is_err());
    }
}
