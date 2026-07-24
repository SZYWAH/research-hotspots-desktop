export type AgentAutomationMode = "advisor" | "supervised";
export type AgentRunStatus =
  | "draft"
  | "planning"
  | "awaiting_plan_approval"
  | "ready"
  | "running"
  | "awaiting_action_approval"
  | "awaiting_user"
  | "evaluating"
  | "paused"
  | "cancelling"
  | "cancelled"
  | "failed"
  | "completed";
export type AgentStepStatus = "planned" | "ready" | "running" | "waiting_user" | "succeeded" | "failed" | "skipped";
export type AgentRiskLevel = "read" | "write" | "high";
export type AgentModelRole = "planner" | "writer";
export type AgentModelProtocol = "openai_chat_completions" | "openai_responses" | "anthropic_messages";
export type AgentQuestionType = "choice" | "text" | "confirm";
export type AgentRunKind = "research_report" | "paper_file_import" | "paper_mysql_import" | "library_clean" | "v20_modeling" | "report_export";

export type AgentBudget = {
  maxSteps: number;
  maxToolCalls: number;
  maxPlannerRounds: number;
  maxProtocolRepairs: number;
  maxRetriesPerTool: number;
  maxReportRewrites: number;
};

export type AgentBudgetUsage = {
  executedSteps: number;
  toolCalls: number;
  plannerRounds: number;
  protocolRepairs: number;
  retriesForCurrentTool: number;
  reportRewrites: number;
};

export type AgentRunRecord = {
  id: string;
  libraryInstanceId: string;
  projectId: string;
  snapshotId?: string;
  runKind: AgentRunKind;
  taskInput: unknown;
  automationMode: AgentAutomationMode;
  status: AgentRunStatus;
  objective: string;
  budget: AgentBudget;
  budgetUsage: AgentBudgetUsage;
  currentPlanVersion?: number;
  decisionSummary?: { summary: string; policyReason?: string };
  lastErrorCode?: string;
  createdAtMs: number;
  updatedAtMs: number;
  completedAtMs?: number;
};

export type AgentPlan = {
  version: number;
  objective: string;
  assumptions: string[];
  successCriteria: Array<{ id: string; description: string }>;
  steps: Array<{ id: string; title: string; tool: string; input: unknown; risk: AgentRiskLevel }>;
};

export type AgentStepRecord = {
  runId: string;
  planVersion: number;
  stepId: string;
  ordinal: number;
  title: string;
  toolName: string;
  toolVersion: string;
  registryHash: string;
  input: unknown;
  resolvedInput?: unknown;
  actionHash?: string;
  pendingApprovalHash?: string;
  pendingApprovalRequestedAtMs?: number;
  risk: AgentRiskLevel;
  status: AgentStepStatus;
  attempts: number;
  operationKey?: string;
  recoveryCount: number;
  observation?: unknown;
  lastErrorCode?: string;
  startedAtMs?: number;
  finishedAtMs?: number;
  updatedAtMs: number;
};

export type AgentEventRecord = {
  sequence: number;
  eventType: string;
  stepId?: string;
  payload: unknown;
  createdAtMs: number;
};

export type AgentArtifactMetadata = {
  id: string;
  runId: string;
  stepId?: string;
  artifactKind: string;
  contentSha256: string;
  snapshotId?: string;
  audit?: unknown;
  reviewStatus?: string;
  supersedesArtifactId?: string;
  createdAtMs: number;
};

export type AgentArtifactRecord = AgentArtifactMetadata & { content: unknown };

export type AgentApprovalRecord = {
  id: string;
  runId: string;
  decisionSequence: number;
  planVersion?: number;
  stepId?: string;
  approvalKind: string;
  decision: string;
  approvedHash: string;
  risk?: AgentRiskLevel;
  registryHash: string;
  toolVersion?: string;
  modelProfileHash?: string;
  actorId: string;
  policyReason?: string;
  createdAtMs: number;
};

export type AgentQuestionRecord = {
  id: string;
  runId: string;
  planVersion?: number;
  stepId?: string;
  prompt: string;
  answerType: AgentQuestionType;
  options?: unknown;
  requiresReplan: boolean;
  createdAtMs: number;
};

export type AgentAnswerRecord = { id: string; questionId: string; runId: string; answer: unknown; actorId: string; createdAtMs: number };
export type AgentArtifactReviewRecord = { id: string; artifactId: string; runId: string; decisionSequence: number; artifactSha256: string; decision: "approved" | "rejected"; actorId: string; reason?: string; createdAtMs: number };
export type AgentModelProfileRecord = { id: string; role: AgentModelRole; protocol: AgentModelProtocol; model: string; endpointOrigin: string; config: unknown; configSha256: string; createdAtMs: number };
export type AgentModelProfileReference = { profileId: string; configSha256: string };
export type AgentLease = { runId: string; ownerId: string; leaseToken: string; generation: number; acquiredAtMs: number; heartbeatAtMs: number; expiresAtMs: number };
export type AgentOperation = { id: string; runId: string; stepId: string; operationKey: string; operationKind: string; status: "queued" | "running" | "pause_requested" | "paused" | "cancel_requested" | "cancelling" | "committing" | "succeeded" | "failed" | "cancelled"; phase: string; processedCount: number; totalCount?: number; bytesProcessed: number; totalBytes?: number; startedAtMs?: number; heartbeatAtMs?: number; finishedAtMs?: number; recoveryCount: number; result?: unknown; errorCode?: string; createdAtMs: number; updatedAtMs: number };
export type AgentModelUsageSummary = { callCount: number; inputTokens: number; outputTokens: number; totalTokens: number; elapsedMs: number; retryCount: number; structureRepairCount: number; estimatedCostMicrousd?: number };
export type AgentResourceGrant = { id: string; runId?: string; libraryInstanceId: string; projectId: string; grantKind: "import_file" | "mysql_profile" | "export_directory"; locator: string; metadata: unknown; fingerprintSha256: string; createdAtMs: number; expiresAtMs?: number; revokedAtMs?: number; consumedAtMs?: number };

export type AgentRunOverview = {
  run: AgentRunRecord;
  plan?: AgentPlan;
  steps: AgentStepRecord[];
  artifacts: AgentArtifactMetadata[];
  approvals: AgentApprovalRecord[];
  questions: AgentQuestionRecord[];
  answers: AgentAnswerRecord[];
  artifactReviews: AgentArtifactReviewRecord[];
  modelProfiles: AgentModelProfileRecord[];
  currentLease?: AgentLease;
  currentOperation?: AgentOperation;
  modelUsage?: AgentModelUsageSummary;
  libraryRevision?: number;
  eventCursor: number;
};

export type AgentRunSnapshot = Omit<AgentRunOverview, "artifacts" | "eventCursor"> & {
  artifacts: AgentArtifactRecord[];
  events: AgentEventRecord[];
};

export type AgentModelProfile = {
  protocol: AgentModelProtocol;
  baseUrl: string;
  model: string;
  nativeStructuredOutput: boolean;
  anthropicVersion?: string;
  allowLocalHttp: boolean;
  inputUsdPerMillion?: number;
  outputUsdPerMillion?: number;
};

export type AgentCommandError = Error & { code: string; retryable: boolean; runId?: string };

export const DEFAULT_AGENT_BUDGET: AgentBudget = {
  maxSteps: 20,
  maxToolCalls: 24,
  maxPlannerRounds: 24,
  maxProtocolRepairs: 1,
  maxRetriesPerTool: 1,
  maxReportRewrites: 1,
};
