use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};
use std::collections::HashSet;

pub const DEFAULT_AGENT_MAX_STEPS: u32 = 20;
pub const DEFAULT_AGENT_MAX_TOOL_CALLS: u32 = 24;
pub const DEFAULT_AGENT_MAX_PLANNER_ROUNDS: u32 = 24;
pub const DEFAULT_AGENT_MAX_PROTOCOL_REPAIRS: u32 = 1;
pub const DEFAULT_AGENT_MAX_RETRIES_PER_TOOL: u32 = 1;
pub const DEFAULT_AGENT_MAX_REPORT_REWRITES: u32 = 1;
pub const AGENT_PLAN_MAX_BYTES: usize = 512 * 1024;
pub const AGENT_OBJECTIVE_MAX_BYTES: usize = 4 * 1024;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AgentAutomationMode {
    Advisor,
    Supervised,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum AgentRunKind {
    ResearchReport,
    PaperFileImport,
    PaperMysqlImport,
    LibraryClean,
    V20Modeling,
    ReportExport,
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
    AwaitingUser,
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
    CallTool,
    PlannerRound,
    RepairProtocol,
    RetryTool,
    RewriteReport,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields, default)]
pub struct AgentBudget {
    pub max_steps: u32,
    pub max_tool_calls: u32,
    pub max_planner_rounds: u32,
    pub max_protocol_repairs: u32,
    pub max_retries_per_tool: u32,
    pub max_report_rewrites: u32,
}
impl Default for AgentBudget {
    fn default() -> Self {
        Self {
            max_steps: DEFAULT_AGENT_MAX_STEPS,
            max_tool_calls: DEFAULT_AGENT_MAX_TOOL_CALLS,
            max_planner_rounds: DEFAULT_AGENT_MAX_PLANNER_ROUNDS,
            max_protocol_repairs: DEFAULT_AGENT_MAX_PROTOCOL_REPAIRS,
            max_retries_per_tool: DEFAULT_AGENT_MAX_RETRIES_PER_TOOL,
            max_report_rewrites: DEFAULT_AGENT_MAX_REPORT_REWRITES,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase", deny_unknown_fields, default)]
pub struct AgentBudgetUsage {
    pub executed_steps: u32,
    pub tool_calls: u32,
    pub planner_rounds: u32,
    pub protocol_repairs: u32,
    pub retries_for_current_tool: u32,
    pub report_rewrites: u32,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AgentQuestionType {
    Choice,
    Text,
    Confirm,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AgentArtifactReviewDecision {
    Approved,
    Rejected,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AgentModelRole {
    Planner,
    Writer,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AgentModelProtocol {
    OpenaiChatCompletions,
    OpenaiResponses,
    AnthropicMessages,
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AgentQuestionRequest {
    pub prompt: String,
    pub answer_type: AgentQuestionType,
    #[serde(default)]
    pub options: Vec<String>,
    pub requires_replan: bool,
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
        question: AgentQuestionRequest,
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
                | AgentRunStatus::AwaitingUser
                | AgentRunStatus::Evaluating
                | AgentRunStatus::Failed
                | AgentRunStatus::Cancelled
        ) | (
            AgentRunStatus::AwaitingPlanApproval,
            AgentRunStatus::Planning | AgentRunStatus::Ready | AgentRunStatus::Cancelled
        ) | (
            AgentRunStatus::Ready,
            AgentRunStatus::Planning
                | AgentRunStatus::Running
                | AgentRunStatus::Paused
                | AgentRunStatus::Cancelled
        ) | (
            AgentRunStatus::Running,
            AgentRunStatus::AwaitingActionApproval
                | AgentRunStatus::AwaitingUser
                | AgentRunStatus::Evaluating
                | AgentRunStatus::Paused
                | AgentRunStatus::Cancelling
                | AgentRunStatus::Failed
        ) | (
            AgentRunStatus::AwaitingActionApproval,
            AgentRunStatus::Running
                | AgentRunStatus::AwaitingUser
                | AgentRunStatus::Paused
                | AgentRunStatus::Cancelling
                | AgentRunStatus::Cancelled
        ) | (
            AgentRunStatus::AwaitingUser,
            AgentRunStatus::Planning
                | AgentRunStatus::Ready
                | AgentRunStatus::Running
                | AgentRunStatus::Evaluating
                | AgentRunStatus::Paused
                | AgentRunStatus::Cancelling
                | AgentRunStatus::Cancelled
        ) | (
            AgentRunStatus::Evaluating,
            AgentRunStatus::Running
                | AgentRunStatus::AwaitingActionApproval
                | AgentRunStatus::AwaitingUser
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
            AgentStepStatus::Ready
                | AgentStepStatus::Succeeded
                | AgentStepStatus::Failed
                | AgentStepStatus::WaitingUser
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
    validate_plan_payload(plan)?;
    validate_budget(budget)?;
    if plan.version == 0 {
        return Err("AGENT_PLAN_VERSION_REQUIRED".into());
    }
    if plan.objective.trim().is_empty() {
        return Err("AGENT_PLAN_OBJECTIVE_REQUIRED".into());
    }
    if plan.objective.len() > AGENT_OBJECTIVE_MAX_BYTES {
        return Err("AGENT_PLAN_OBJECTIVE_TOO_LARGE".into());
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
    if plan.assumptions.iter().any(|value| value.len() > 2 * 1024) {
        return Err("AGENT_PLAN_ASSUMPTION_TOO_LARGE".into());
    }
    let mut criterion_ids = HashSet::new();
    for criterion in &plan.success_criteria {
        if !is_valid_identifier(&criterion.id)
            || criterion.description.trim().is_empty()
            || criterion.description.len() > 4 * 1024
        {
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
        if step.title.len() > 512 {
            return Err("AGENT_PLAN_STEP_TITLE_TOO_LARGE".into());
        }
        validate_tool_call(&step.tool, &step.input)?;
    }
    Ok(())
}

pub fn validate_budget(budget: &AgentBudget) -> Result<(), String> {
    if budget.max_steps == 0 {
        return Err("AGENT_BUDGET_MAX_STEPS_REQUIRED".into());
    }
    if budget.max_tool_calls == 0 {
        return Err("AGENT_BUDGET_MAX_TOOL_CALLS_REQUIRED".into());
    }
    if budget.max_planner_rounds == 0 {
        return Err("AGENT_BUDGET_MAX_PLANNER_ROUNDS_REQUIRED".into());
    }
    if budget.max_steps > DEFAULT_AGENT_MAX_STEPS
        || budget.max_tool_calls > DEFAULT_AGENT_MAX_TOOL_CALLS
        || budget.max_planner_rounds > DEFAULT_AGENT_MAX_PLANNER_ROUNDS
        || budget.max_protocol_repairs > DEFAULT_AGENT_MAX_PROTOCOL_REPAIRS
        || budget.max_retries_per_tool > DEFAULT_AGENT_MAX_RETRIES_PER_TOOL
        || budget.max_report_rewrites > DEFAULT_AGENT_MAX_REPORT_REWRITES
    {
        return Err("AGENT_BUDGET_POLICY_LIMIT_EXCEEDED".into());
    }
    Ok(())
}

pub fn validate_action(action: &AgentAction) -> Result<(), String> {
    match action {
        AgentAction::CallTool { tool, input, .. } => validate_tool_call(tool, input),
        AgentAction::AskUser { question } => validate_question_request(question),
        AgentAction::Complete { summary } if summary.trim().is_empty() => {
            Err("AGENT_COMPLETION_SUMMARY_REQUIRED".into())
        }
        AgentAction::Complete { summary } => {
            if summary.len() > 8 * 1024 {
                return Err("AGENT_COMPLETION_SUMMARY_TOO_LARGE".into());
            }
            validate_storable_json(&Value::String(summary.clone()))
        }
    }
}

pub fn validate_question_request(question: &AgentQuestionRequest) -> Result<(), String> {
    if question.prompt.trim().is_empty() {
        return Err("AGENT_QUESTION_REQUIRED".into());
    }
    if question.prompt.len() > 4 * 1024 {
        return Err("AGENT_QUESTION_TOO_LARGE".into());
    }
    if question.options.iter().any(|value| value.len() > 1024)
        || question.options.iter().map(String::len).sum::<usize>() > 8 * 1024
    {
        return Err("AGENT_QUESTION_OPTIONS_TOO_LARGE".into());
    }
    let value = serde_json::to_value(question)
        .map_err(|error| format!("AGENT_QUESTION_SERIALIZE_FAILED:{error}"))?;
    validate_storable_json(&value)?;
    match question.answer_type {
        AgentQuestionType::Choice => {
            if !(2..=12).contains(&question.options.len())
                || question.options.iter().any(|value| value.trim().is_empty())
            {
                return Err("AGENT_QUESTION_OPTIONS_INVALID".into());
            }
            let unique = question
                .options
                .iter()
                .map(|value| value.trim())
                .collect::<HashSet<_>>();
            if unique.len() != question.options.len() {
                return Err("AGENT_QUESTION_OPTIONS_DUPLICATE".into());
            }
        }
        AgentQuestionType::Text | AgentQuestionType::Confirm => {
            if !question.options.is_empty() {
                return Err("AGENT_QUESTION_OPTIONS_NOT_ALLOWED".into());
            }
        }
    }
    Ok(())
}

pub fn plan_approval_hash(plan: &AgentPlan) -> Result<String, String> {
    validate_plan_payload(plan)?;
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
        AgentBudgetOperation::CallTool => usage.tool_calls < budget.max_tool_calls,
        AgentBudgetOperation::PlannerRound => usage.planner_rounds < budget.max_planner_rounds,
        AgentBudgetOperation::RepairProtocol => {
            usage.protocol_repairs < budget.max_protocol_repairs
        }
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
    if contains_secret_like_value(input) {
        return Err("AGENT_TOOL_INPUT_CONTAINS_CREDENTIAL_PATTERN".into());
    }
    Ok(())
}

pub fn validate_error_code(code: &str) -> Result<(), String> {
    let bytes = code.as_bytes();
    if bytes.is_empty()
        || bytes.len() > 128
        || !bytes[0].is_ascii_uppercase()
        || !bytes
            .iter()
            .all(|byte| byte.is_ascii_uppercase() || byte.is_ascii_digit() || *byte == b'_')
    {
        return Err("AGENT_ERROR_CODE_INVALID".into());
    }
    Ok(())
}

fn validate_plan_payload(plan: &AgentPlan) -> Result<(), String> {
    let value = serde_json::to_value(plan)
        .map_err(|error| format!("AGENT_PLAN_SERIALIZE_FAILED:{error}"))?;
    validate_storable_json(&value)?;
    let size = serde_json::to_vec(&value)
        .map_err(|error| format!("AGENT_PLAN_SERIALIZE_FAILED:{error}"))?
        .len();
    if size > AGENT_PLAN_MAX_BYTES {
        return Err("AGENT_PLAN_SIZE_LIMIT_EXCEEDED".into());
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
    if contains_secret_like_value(value) {
        return Err("AGENT_JSON_CONTAINS_CREDENTIAL_PATTERN".into());
    }
    Ok(())
}

pub fn validate_user_answer(value: &Value) -> Result<(), String> {
    validate_storable_json(value)?;
    if contains_secret_like_value(value) {
        return Err("AGENT_ANSWER_CONTAINS_POSSIBLE_CREDENTIAL".into());
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

fn contains_secret_like_value(value: &Value) -> bool {
    match value {
        Value::String(value) => {
            let trimmed = value.trim();
            let lower = trimmed.to_ascii_lowercase();
            lower.contains("bearer ")
                || lower.contains("authorization:")
                || lower.contains("x-api-key:")
                || contains_prefixed_secret(&lower, "ghp_", 20)
                || contains_prefixed_secret(&lower, "github_pat_", 20)
                || contains_prefixed_secret(&lower, "sk-", 16)
                || contains_prefixed_secret(&lower, "aiza", 24)
                || contains_aws_access_key(trimmed.as_bytes())
                || contains_jwt_like_token(trimmed)
        }
        Value::Array(values) => values.iter().any(contains_secret_like_value),
        Value::Object(values) => values.values().any(contains_secret_like_value),
        _ => false,
    }
}

fn contains_prefixed_secret(value: &str, prefix: &str, minimum_length: usize) -> bool {
    value.match_indices(prefix).any(|(start, _)| {
        value[start..]
            .chars()
            .take_while(|character| {
                character.is_ascii_alphanumeric() || matches!(*character, '_' | '-')
            })
            .count()
            >= minimum_length
    })
}

fn contains_aws_access_key(value: &[u8]) -> bool {
    value.windows(20).any(|window| {
        window.starts_with(b"AKIA")
            && window
                .iter()
                .all(|byte| byte.is_ascii_uppercase() || byte.is_ascii_digit())
    })
}

fn contains_jwt_like_token(value: &str) -> bool {
    value
        .split(|character: char| {
            character.is_ascii_whitespace()
                || matches!(character, ',' | ';' | '"' | '\'' | '(' | ')')
        })
        .any(|token| {
            if token.len() < 32 {
                return false;
            }
            let segments = token.split('.').collect::<Vec<_>>();
            segments.len() == 3
                && segments.iter().all(|segment| {
                    segment.len() >= 4
                        && segment.chars().all(|character| {
                            character.is_ascii_alphanumeric() || matches!(character, '-' | '_')
                        })
                })
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const RUNS: [AgentRunStatus; 13] = [
        AgentRunStatus::Draft,
        AgentRunStatus::Planning,
        AgentRunStatus::AwaitingPlanApproval,
        AgentRunStatus::Ready,
        AgentRunStatus::Running,
        AgentRunStatus::AwaitingActionApproval,
        AgentRunStatus::AwaitingUser,
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
                    | AgentRunStatus::AwaitingUser
                    | AgentRunStatus::Evaluating
                    | AgentRunStatus::Failed
                    | AgentRunStatus::Cancelled
            ) | (
                AgentRunStatus::AwaitingPlanApproval,
                AgentRunStatus::Planning | AgentRunStatus::Ready | AgentRunStatus::Cancelled
            ) | (
                AgentRunStatus::Ready,
                AgentRunStatus::Planning
                    | AgentRunStatus::Running
                    | AgentRunStatus::Paused
                    | AgentRunStatus::Cancelled
            ) | (
                AgentRunStatus::Running,
                AgentRunStatus::AwaitingActionApproval
                    | AgentRunStatus::AwaitingUser
                    | AgentRunStatus::Evaluating
                    | AgentRunStatus::Paused
                    | AgentRunStatus::Cancelling
                    | AgentRunStatus::Failed
            ) | (
                AgentRunStatus::AwaitingActionApproval,
                AgentRunStatus::Running
                    | AgentRunStatus::AwaitingUser
                    | AgentRunStatus::Paused
                    | AgentRunStatus::Cancelling
                    | AgentRunStatus::Cancelled
            ) | (
                AgentRunStatus::AwaitingUser,
                AgentRunStatus::Planning
                    | AgentRunStatus::Ready
                    | AgentRunStatus::Running
                    | AgentRunStatus::Evaluating
                    | AgentRunStatus::Paused
                    | AgentRunStatus::Cancelling
                    | AgentRunStatus::Cancelled
            ) | (
                AgentRunStatus::Evaluating,
                AgentRunStatus::Running
                    | AgentRunStatus::AwaitingActionApproval
                    | AgentRunStatus::AwaitingUser
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
                AgentStepStatus::Ready
                    | AgentStepStatus::Succeeded
                    | AgentStepStatus::Failed
                    | AgentStepStatus::WaitingUser
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
    fn model_questions_and_completion_summaries_are_bounded_and_scrubbed() {
        let question = AgentQuestionRequest {
            prompt: "sk-this-looks-like-a-secret-token-value".into(),
            answer_type: AgentQuestionType::Text,
            options: vec![],
            requires_replan: true,
        };
        assert_eq!(
            validate_question_request(&question).unwrap_err(),
            "AGENT_JSON_CONTAINS_CREDENTIAL_PATTERN"
        );

        let oversized_question = AgentQuestionRequest {
            prompt: "x".repeat(4 * 1024 + 1),
            answer_type: AgentQuestionType::Confirm,
            options: vec![],
            requires_replan: false,
        };
        assert_eq!(
            validate_question_request(&oversized_question).unwrap_err(),
            "AGENT_QUESTION_TOO_LARGE"
        );

        let completion = AgentAction::Complete {
            summary: "Authorization: Bearer ghp_this-is-not-safe-to-store".into(),
        };
        assert_eq!(
            validate_action(&completion).unwrap_err(),
            "AGENT_JSON_CONTAINS_CREDENTIAL_PATTERN"
        );
        let oversized_completion = AgentAction::Complete {
            summary: "x".repeat(8 * 1024 + 1),
        };
        assert_eq!(
            validate_action(&oversized_completion).unwrap_err(),
            "AGENT_COMPLETION_SUMMARY_TOO_LARGE"
        );

        let embedded = AgentAction::CallTool {
            tool: "inspect_library".into(),
            input: json!({"note":"request failed with sk-this-is-an-embedded-secret-value"}),
            risk: AgentRiskLevel::Read,
        };
        assert_eq!(
            validate_action(&embedded).unwrap_err(),
            "AGENT_TOOL_INPUT_CONTAINS_CREDENTIAL_PATTERN"
        );
        assert!(validate_error_code("AGENT_NETWORK_TIMEOUT").is_ok());
        assert_eq!(
            validate_error_code("AGENT_FAILURE:raw database detail").unwrap_err(),
            "AGENT_ERROR_CODE_INVALID"
        );
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
            tool_calls: 23,
            planner_rounds: 23,
            protocol_repairs: 0,
        };
        for operation in [
            AgentBudgetOperation::ExecuteStep,
            AgentBudgetOperation::CallTool,
            AgentBudgetOperation::PlannerRound,
            AgentBudgetOperation::RepairProtocol,
            AgentBudgetOperation::RetryTool,
            AgentBudgetOperation::RewriteReport,
        ] {
            assert!(budget_allows(&budget, &available, operation));
        }
        let exhausted = AgentBudgetUsage {
            executed_steps: 20,
            retries_for_current_tool: 1,
            report_rewrites: 1,
            tool_calls: 24,
            planner_rounds: 24,
            protocol_repairs: 1,
        };
        for operation in [
            AgentBudgetOperation::ExecuteStep,
            AgentBudgetOperation::CallTool,
            AgentBudgetOperation::PlannerRound,
            AgentBudgetOperation::RepairProtocol,
            AgentBudgetOperation::RetryTool,
            AgentBudgetOperation::RewriteReport,
        ] {
            assert!(budget_is_exhausted(&budget, &exhausted, operation));
        }
    }

    #[test]
    fn caller_may_lower_but_never_raise_policy_budget_limits() {
        let mut budget = AgentBudget {
            max_steps: 10,
            max_tool_calls: 10,
            max_planner_rounds: 10,
            max_protocol_repairs: 0,
            max_retries_per_tool: 0,
            max_report_rewrites: 0,
        };
        validate_budget(&budget).unwrap();

        let mutations: [fn(&mut AgentBudget); 6] = [
            |value| value.max_steps = DEFAULT_AGENT_MAX_STEPS + 1,
            |value| value.max_tool_calls = DEFAULT_AGENT_MAX_TOOL_CALLS + 1,
            |value| value.max_planner_rounds = DEFAULT_AGENT_MAX_PLANNER_ROUNDS + 1,
            |value| value.max_protocol_repairs = DEFAULT_AGENT_MAX_PROTOCOL_REPAIRS + 1,
            |value| value.max_retries_per_tool = DEFAULT_AGENT_MAX_RETRIES_PER_TOOL + 1,
            |value| value.max_report_rewrites = DEFAULT_AGENT_MAX_REPORT_REWRITES + 1,
        ];
        for mutate in mutations {
            let original = budget.clone();
            mutate(&mut budget);
            assert_eq!(
                validate_budget(&budget).unwrap_err(),
                "AGENT_BUDGET_POLICY_LIMIT_EXCEEDED"
            );
            budget = original;
        }
    }

    #[test]
    fn v9_budget_json_receives_v10_defaults() {
        let budget: AgentBudget = serde_json::from_value(json!({
            "maxSteps": 12,
            "maxRetriesPerTool": 1,
            "maxReportRewrites": 1
        }))
        .unwrap();
        assert_eq!(budget.max_steps, 12);
        assert_eq!(budget.max_tool_calls, DEFAULT_AGENT_MAX_TOOL_CALLS);
        assert_eq!(budget.max_planner_rounds, DEFAULT_AGENT_MAX_PLANNER_ROUNDS);
        assert_eq!(
            budget.max_protocol_repairs,
            DEFAULT_AGENT_MAX_PROTOCOL_REPAIRS
        );
        let usage: AgentBudgetUsage = serde_json::from_value(json!({
            "executedSteps": 2,
            "retriesForCurrentTool": 0,
            "reportRewrites": 0
        }))
        .unwrap();
        assert_eq!(usage.executed_steps, 2);
        assert_eq!(usage.tool_calls, 0);
        assert_eq!(usage.planner_rounds, 0);
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
