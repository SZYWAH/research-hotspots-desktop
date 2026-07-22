import type {
  AgentArtifactRecord,
  AgentEventRecord,
  AgentModelProfileReference,
  AgentRunOverview,
  AgentRunSnapshot,
  AgentRunStatus,
} from "../agentTypes";
import { DEFAULT_AGENT_BUDGET } from "../agentTypes";
import type { AgentDesktopClient } from "./agentDesktop";

const now = 1_788_000_000_000;

export function readAgentVisualReviewScenario() {
  if (!import.meta.env.DEV || typeof window === "undefined") return undefined;
  const params = new URLSearchParams(window.location.search);
  return params.get("visual-review") === "agent" ? params.get("scenario")?.trim() || "plan" : undefined;
}

function statusForScenario(scenario: string): AgentRunStatus {
  const statuses: Record<string, AgentRunStatus> = {
    planning: "planning",
    plan: "awaiting_plan_approval",
    running: "running",
    action: "awaiting_action_approval",
    question: "awaiting_user",
    review: "awaiting_user",
    paused: "paused",
    failed: "failed",
    cancelling: "cancelling",
    completed: "completed",
  };
  return statuses[scenario] ?? "awaiting_plan_approval";
}

export function createAgentVisualReviewClient(scenario = "plan"): AgentDesktopClient {
  let status = statusForScenario(scenario);
  const runId = "agent-visual-review";
  const evidence: AgentArtifactRecord = {
    id: "artifact-evidence",
    runId,
    stepId: "collect-evidence",
    artifactKind: "research_evidence",
    contentSha256: "8af031fe3c2bb6f5",
    snapshotId: "snapshot-v20-review",
    reviewStatus: "approved",
    createdAtMs: now - 18_000,
    content: {
      topic: "量子纠错与容错量子计算",
      mode: "deep",
      hotspotIds: ["hotspot-quantum-error", "hotspot-fault-tolerance"],
      truncated: false,
      papers: [
        { id: "paper-001", title: "Fault tolerant quantum error correction under realistic noise", year: 2025, source: "arxiv", field: "Quantum Physics" },
        { id: "paper-002", title: "Scalable logical qubits with neutral atoms", year: 2024, source: "openalex", field: "Quantum Physics" },
        { id: "paper-003", title: "Surface-code thresholds in correlated environments", year: 2025, source: "arxiv", field: "Quantum Physics" },
      ],
    },
  };
  const report: AgentArtifactRecord = {
    id: "artifact-report",
    runId,
    stepId: "write-report",
    artifactKind: "report_draft",
    contentSha256: "4ce35b518ce493bf",
    snapshotId: "snapshot-v20-review",
    reviewStatus: scenario === "review" ? "needs-review" : "approved",
    createdAtMs: now - 8_000,
    content: {
      topic: "量子纠错与容错量子计算",
      mode: "deep",
      evidenceArtifactId: evidence.id,
      paperIds: ["paper-001", "paper-002", "paper-003"],
      content: "# 量子纠错与容错量子计算\n\n## 证据概览\n本报告基于 3 篇本地代表论文，围绕噪声模型、逻辑量子比特与阈值展开。\n\n## 热点概述\n研究重点正从单一误差模型转向真实相关噪声下的端到端容错验证。[1]\n\n## 代表论文\n中性原子与表面码路线分别展示了可扩展性与阈值工程的主要进展。[2][3]\n\n## 未来方向\n需要统一硬件误差、解码成本和逻辑操作保真度的评价框架。",
    },
  };
  const audit: AgentArtifactRecord = {
    id: "artifact-audit",
    runId,
    stepId: "audit-report",
    artifactKind: "report_audit",
    contentSha256: "ca3f2c031cca88d0",
    snapshotId: "snapshot-v20-review",
    reviewStatus: scenario === "review" ? "needs-review" : "approved",
    createdAtMs: now - 5_000,
    content: {
      riskLevel: scenario === "review" ? "high" : "medium",
      validCitationCount: 3,
      invalidCitationCount: scenario === "review" ? 1 : 0,
      uncitedPaperCount: 0,
      missingRequiredSections: scenario === "review" ? ["来源分布"] : [],
      unreferencedParagraphs: scenario === "review" ? ["一段缺少可验证引用的结论。"] : [],
      coverageExplanation: "报告覆盖 3 篇绑定论文。",
      metrics: { citationCoverage: 1, citationAccuracy: scenario === "review" ? 0.75 : 1, consistencyScore: 0.9 },
    },
  };
  const artifacts = scenario === "completed" || scenario === "review" ? [evidence, report, audit] : scenario === "running" || scenario === "action" ? [evidence] : [];

  function overview(): AgentRunOverview {
    const question = scenario === "question" && status === "awaiting_user" ? [{
      id: "question-scope", runId, planVersion: 1, stepId: "collect-evidence", prompt: "是否将研究范围限制在 2022 年之后的论文？", answerType: "choice" as const, options: ["限制到 2022 年后", "保留全部年份"], requiresReplan: true, createdAtMs: now - 3_000,
    }] : [];
    return {
      run: {
        id: runId,
        libraryInstanceId: "library-review",
        projectId: "default-project",
        snapshotId: "snapshot-v20-review",
        automationMode: "supervised",
        status,
        objective: "基于本地论文库分析量子纠错与容错量子计算的研究进展，并生成可审计报告。",
        budget: DEFAULT_AGENT_BUDGET,
        budgetUsage: { executedSteps: status === "completed" ? 7 : 3, toolCalls: status === "completed" ? 9 : 4, plannerRounds: 4, protocolRepairs: 0, retriesForCurrentTool: 0, reportRewrites: scenario === "review" ? 1 : 0 },
        currentPlanVersion: 1,
        lastErrorCode: status === "failed" ? "AGENT_MODEL_RESPONSE_INVALID" : status === "paused" ? "AGENT_EXECUTOR_LOST" : undefined,
        createdAtMs: now - 120_000,
        updatedAtMs: now,
        completedAtMs: status === "completed" ? now : undefined,
      },
      plan: {
        version: 1,
        objective: "形成有本地证据支持的量子纠错研究综述",
        assumptions: ["活动 V20 快照仍与当前论文库一致", "只使用本地持久化论文证据"],
        successCriteria: [{ id: "evidence", description: "至少绑定 3 篇有效论文" }, { id: "audit", description: "报告通过确定性引用审计" }],
        steps: [
          { id: "inspect", title: "核验论文库与活动快照", tool: "inspect_v20_snapshot", input: {}, risk: "read" },
          { id: "search", title: "检索主题相关热点", tool: "search_v20_hotspots", input: { query: "量子纠错" }, risk: "read" },
          { id: "collect-evidence", title: "固化研究证据", tool: "save_research_evidence", input: { hotspotIds: ["hotspot-quantum-error"] }, risk: "write" },
          { id: "write-report", title: "生成报告草稿", tool: "create_report_draft", input: { mode: "deep" }, risk: "write" },
          { id: "audit-report", title: "审计引用和完整性", tool: "inspect_report_audit", input: {}, risk: "read" },
        ],
      },
      steps: [
        { runId, planVersion: 1, stepId: "inspect", ordinal: 0, title: "核验论文库与活动快照", toolName: "inspect_v20_snapshot", toolVersion: "1", registryHash: "registry-01", input: {}, risk: "read", status: "succeeded", attempts: 1, recoveryCount: 0, updatedAtMs: now - 80_000 },
        { runId, planVersion: 1, stepId: "search", ordinal: 1, title: "检索主题相关热点", toolName: "search_v20_hotspots", toolVersion: "1", registryHash: "registry-01", input: { query: "量子纠错" }, risk: "read", status: "succeeded", attempts: 1, recoveryCount: 0, updatedAtMs: now - 55_000 },
        { runId, planVersion: 1, stepId: "collect-evidence", ordinal: 2, title: "固化研究证据", toolName: "save_research_evidence", toolVersion: "1", registryHash: "registry-01", input: {}, resolvedInput: { hotspotIds: ["hotspot-quantum-error"] }, actionHash: "action-collect", pendingApprovalHash: status === "awaiting_action_approval" ? "approval-collect" : undefined, risk: "write", status: status === "awaiting_action_approval" ? "waiting_user" : "succeeded", attempts: 1, recoveryCount: status === "paused" ? 1 : 0, lastErrorCode: status === "paused" ? "AGENT_EXECUTOR_LOST" : undefined, updatedAtMs: now - 30_000 },
        { runId, planVersion: 1, stepId: "write-report", ordinal: 3, title: "生成报告草稿", toolName: "create_report_draft", toolVersion: "1", registryHash: "registry-01", input: {}, risk: "write", status: status === "completed" || status === "awaiting_user" ? "succeeded" : "ready", attempts: status === "completed" ? 1 : 0, recoveryCount: 0, updatedAtMs: now - 10_000 },
        { runId, planVersion: 1, stepId: "audit-report", ordinal: 4, title: "审计引用和完整性", toolName: "inspect_report_audit", toolVersion: "1", registryHash: "registry-01", input: {}, risk: "read", status: status === "completed" || scenario === "review" ? "succeeded" : "planned", attempts: status === "completed" ? 1 : 0, recoveryCount: 0, updatedAtMs: now - 5_000 },
      ],
      artifacts: artifacts.map(({ content: _content, ...metadata }) => metadata),
      approvals: [], questions: question, answers: [], artifactReviews: [],
      modelProfiles: [{ id: "profile-planner", role: "planner", protocol: "openai_chat_completions", model: "deepseek-chat", endpointOrigin: "https://api.deepseek.com", config: {}, configSha256: "profile-hash", createdAtMs: now - 120_000 }],
      eventCursor: 5,
    };
  }
  const events: AgentEventRecord[] = [
    { sequence: 1, eventType: "run_created", payload: { status: "draft" }, createdAtMs: now - 120_000 },
    { sequence: 2, eventType: "plan_generated", payload: { summary: "已生成 5 步监督计划" }, createdAtMs: now - 100_000 },
    { sequence: 3, eventType: "step_succeeded", stepId: "inspect", payload: { summary: "活动快照计数一致" }, createdAtMs: now - 80_000 },
    { sequence: 4, eventType: "step_succeeded", stepId: "search", payload: { summary: "找到 2 个相关热点" }, createdAtMs: now - 55_000 },
    { sequence: 5, eventType: "run_status_changed", payload: { status }, createdAtMs: now },
  ];
  const snapshot = (): AgentRunSnapshot => ({ ...overview(), artifacts, events });
  const profileReference: AgentModelProfileReference = { profileId: "profile-review", configSha256: "profile-hash" };
  return {
    listRuns: async () => scenario === "no-snapshot" ? [] : [overview().run],
    getOverview: async () => overview(),
    getDraftModelProfiles: async () => ({ planner: profileReference, writer: profileReference }),
    getArtifact: async (_context, _runId, artifactId) => artifacts.find((artifact) => artifact.id === artifactId) ?? evidence,
    getEvents: async (_context, _runId, after = 0) => events.filter((event) => event.sequence > after),
    configureCredential: async () => ({ configured: true, migratedLegacyCredential: false }),
    testModel: async ({ profile }) => ({ connected: true, protocol: profile.protocol, model: profile.model, elapsedMs: 612, retryCount: 0, fallbackUsed: false }),
    saveModelProfile: async () => profileReference,
    createRun: async () => overview().run,
    planRun: async () => { status = "awaiting_plan_approval"; return snapshot(); },
    executeRun: async () => { status = scenario === "review" ? "awaiting_user" : "completed"; return snapshot(); },
    decidePlan: async (_context, input) => { status = input.decision === "approved" ? "ready" : "planning"; return snapshot(); },
    decideAction: async (_context, input) => { status = input.decision === "approved" ? "awaiting_action_approval" : "planning"; return snapshot(); },
    submitAnswer: async () => { status = "planning"; return snapshot(); },
    reviewArtifact: async (_context, input) => { status = input.decision === "approved" ? "evaluating" : "awaiting_user"; return snapshot(); },
    controlRun: async (_context, _runId, action) => { status = action === "cancel" ? "cancelled" : action === "pause" ? "paused" : "ready"; return snapshot(); },
  };
}
