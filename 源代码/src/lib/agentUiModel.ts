import type {
  AgentArtifactMetadata,
  AgentCommandError,
  AgentRunOverview,
  AgentRunStatus,
  AgentStepRecord,
} from "../agentTypes";

export const AGENT_TERMINAL_STATUSES = new Set<AgentRunStatus>(["completed", "cancelled", "failed"]);
export const AGENT_ACTIVE_POLL_STATUSES = new Set<AgentRunStatus>(["planning", "running", "evaluating", "cancelling"]);

export const AGENT_STATUS_META: Record<AgentRunStatus, { label: string; tone: "neutral" | "cyan" | "amber" | "danger" | "success"; description: string }> = {
  draft: { label: "草稿", tone: "neutral", description: "目标已保存，尚未开始规划。" },
  planning: { label: "正在规划", tone: "cyan", description: "Planner 正在生成受治理计划。" },
  awaiting_plan_approval: { label: "等待计划审批", tone: "amber", description: "计划不会在批准前执行。" },
  ready: { label: "可继续", tone: "cyan", description: "运行已就绪，需由用户显式继续。" },
  running: { label: "执行中", tone: "cyan", description: "正在执行已批准的低风险步骤。" },
  awaiting_action_approval: { label: "等待动作审批", tone: "amber", description: "写动作等待单独批准。" },
  awaiting_user: { label: "等待用户", tone: "amber", description: "需要补充信息、处理阻塞或复核成果。" },
  evaluating: { label: "确定性评估", tone: "cyan", description: "正在执行完成门禁与报告审计。" },
  paused: { label: "已暂停", tone: "neutral", description: "不会自动恢复模型或工具调用。" },
  cancelling: { label: "取消中", tone: "amber", description: "正在等待当前调用停止或事务回滚。" },
  cancelled: { label: "已取消", tone: "neutral", description: "运行已安全结束。" },
  failed: { label: "失败", tone: "danger", description: "运行因不可恢复错误结束。" },
  completed: { label: "已完成", tone: "success", description: "所有确定性完成门禁均已通过。" },
};

export type AgentPendingKind = "plan" | "action" | "question" | "artifact_review" | "blocker" | "none";

export function findPendingStep(overview: AgentRunOverview): AgentStepRecord | undefined {
  return overview.steps.find((step) => step.pendingApprovalHash && step.status === "waiting_user")
    ?? overview.steps.find((step) => step.pendingApprovalHash);
}

export function findPendingQuestion(overview: AgentRunOverview) {
  const answered = new Set(overview.answers.map((answer) => answer.questionId));
  return [...overview.questions].reverse().find((question) => !answered.has(question.id));
}

export function findLatestArtifact(overview: AgentRunOverview, kind: string): AgentArtifactMetadata | undefined {
  return [...overview.artifacts].reverse().find((artifact) => artifact.artifactKind === kind);
}

export function findPendingReviewArtifact(overview: AgentRunOverview): AgentArtifactMetadata | undefined {
  const reviewed = new Set(
    overview.artifactReviews
      .filter((review) => review.decision === "approved")
      .map((review) => `${review.artifactId}:${review.artifactSha256}`),
  );
  return [...overview.artifacts].reverse().find((artifact) =>
    artifact.artifactKind === "report_draft"
    && artifact.reviewStatus === "needs-review"
    && !reviewed.has(`${artifact.id}:${artifact.contentSha256}`),
  );
}

export function pendingKind(overview: AgentRunOverview): AgentPendingKind {
  if (overview.run.status === "awaiting_plan_approval") return "plan";
  if (overview.run.status === "awaiting_action_approval") return "action";
  if (overview.run.status !== "awaiting_user") return "none";
  if (findPendingQuestion(overview)) return "question";
  if (findPendingReviewArtifact(overview)) return "artifact_review";
  return "blocker";
}

export function pollIntervalForStatus(status: AgentRunStatus) {
  return AGENT_ACTIVE_POLL_STATUSES.has(status) ? 800 : 4_000;
}

export function canAutoContinueAfterUserAction(status: AgentRunStatus) {
  return status === "planning" || status === "ready" || status === "running" || status === "evaluating" || status === "awaiting_action_approval";
}

export function safeExternalUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function normalizeAgentError(value: unknown): AgentCommandError {
  if (value && typeof value === "object" && "code" in value) {
    const source = value as { code?: unknown; message?: unknown; retryable?: unknown; runId?: unknown };
    const error = new Error(typeof source.message === "string" ? source.message : String(source.code || "Agent 命令失败。")) as AgentCommandError;
    error.code = typeof source.code === "string" ? source.code : "AGENT_COMMAND_FAILED";
    error.retryable = source.retryable === true;
    error.runId = typeof source.runId === "string" ? source.runId : undefined;
    return error;
  }
  const raw = value instanceof Error ? value.message : String(value || "AGENT_COMMAND_FAILED");
  const [candidate, detail] = raw.split(":", 2);
  const code = /^AGENT_[A-Z0-9_]+$/.test(candidate) ? candidate : "AGENT_COMMAND_FAILED";
  const error = new Error(code === "AGENT_COMMAND_FAILED" ? raw : candidate) as AgentCommandError;
  error.code = code;
  error.retryable = ["AGENT_RUN_ALREADY_EXECUTING", "AGENT_RUN_LEASE_HELD", "AGENT_MODEL_TEST_NETWORK", "AGENT_MODEL_TEST_TIMEOUT"].includes(code);
  if (code === "AGENT_ACTIVE_RUN_EXISTS" && detail) error.runId = detail;
  return error;
}

export function summarizeEventPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") return typeof payload === "string" ? payload.slice(0, 240) : "";
  const record = payload as Record<string, unknown>;
  for (const key of ["summary", "policyReason", "errorCode", "status", "reason", "tool"]) {
    if (typeof record[key] === "string" && record[key]) return String(record[key]).slice(0, 240);
  }
  return "已记录结构化审计数据";
}
