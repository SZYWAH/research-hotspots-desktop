import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  Clock3,
  Database,
  FileCheck2,
  FileText,
  Gauge,
  History,
  Inbox,
  ListChecks,
  Loader2,
  MessageSquare,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Square,
  X,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type {
  AgentArtifactMetadata,
  AgentArtifactRecord,
  AgentAutomationMode,
  AgentBudget,
  AgentEventRecord,
  AgentModelProfile,
  AgentModelProfileReference,
  AgentRunOverview,
  AgentRunKind,
  AgentRunRecord,
  AgentRunSnapshot,
  AgentRunStatus,
} from "../agentTypes";
import { DEFAULT_AGENT_BUDGET } from "../agentTypes";
import type { ActiveView, AiSettings, PaperLibraryStatus, Project, V20HotspotSnapshot } from "../types";
import { createAgentDesktopClient, overviewFromSnapshot, type AgentDatabaseContext, type AgentDesktopClient } from "../lib/agentDesktop";
import {
  AGENT_ACTIVE_POLL_STATUSES,
  AGENT_STATUS_META,
  effectiveArtifactReviewStatus,
  findLatestArtifact,
  findPendingQuestion,
  findPendingReviewArtifact,
  findPendingStep,
  matchesAgentArtifactRequestFence,
  matchesAgentRequestFence,
  normalizeAgentError,
  pendingKind,
  pollIntervalForStatus,
  safeExternalUrl,
  summarizeEventPayload,
} from "../lib/agentUiModel";
import { createAgentVisualReviewClient } from "../lib/agentVisualReview";
import { openExternalUrl } from "../lib/desktop";

const ACTOR_ID = "desktop-user";
const RUN_PAGE_SIZE = 50;

type AgentWorkspaceProps = {
  settings: AiSettings;
  activeProject: Project;
  libraryStatus: PaperLibraryStatus | null;
  v20Snapshot: V20HotspotSnapshot | null;
  onNavigate: (view: ActiveView) => void;
  onOpenPaper: (paperId: string, title?: string) => void;
  onNotice: (message: string, kind?: "success" | "info" | "error") => void;
  visualReviewScenario?: string;
};

type NewRunDraft = {
  objective: string;
  mode: AgentAutomationMode;
  budget: AgentBudget;
  planner: AgentModelProfile;
  writer: AgentModelProfile;
  writerMatchesPlanner: boolean;
  plannerSecret: string;
  writerSecret: string;
};

type AgentRunCenterSection = "inbox" | "history";
type AgentRunHistoryStatus = "all" | "completed" | "failed" | "cancelled";

const TERMINAL_RUN_STATUSES = new Set<AgentRunStatus>(["completed", "cancelled", "failed"]);
const RECENT_RUN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function defaultProfile(settings: AiSettings): AgentModelProfile {
  return {
    protocol: "openai_chat_completions",
    baseUrl: settings.baseUrl,
    model: settings.model,
    nativeStructuredOutput: false,
    allowLocalHttp: /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(settings.baseUrl),
  };
}

function createDraft(settings: AiSettings): NewRunDraft {
  const profile = defaultProfile(settings);
  return {
    objective: "",
    mode: "supervised",
    budget: { ...DEFAULT_AGENT_BUDGET },
    planner: profile,
    writer: { ...profile },
    writerMatchesPlanner: true,
    plannerSecret: "",
    writerSecret: "",
  };
}

const RUN_KIND_LABELS: Record<AgentRunKind, { label: string; description: string; objective: string }> = {
  research_report: { label: "研究报告", description: "检索本地证据并生成可审计报告", objective: "基于当前论文库生成可追溯研究报告" },
  paper_file_import: { label: "文件导入", description: "预览后原子导入 CSV/JSON/BibTeX/RIS", objective: "安全导入授权论文文件" },
  paper_mysql_import: { label: "MySQL 导入", description: "从已配置的 MySQL 数据源原子导入", objective: "安全导入授权 MySQL 论文数据" },
  library_clean: { label: "论文库清洗", description: "先预览影响，再单事务清洗", objective: "确定性清洗当前论文库" },
  v20_modeling: { label: "V20 热点建模", description: "按当前库修订生成统一快照", objective: "重建并原子激活 V20 热点快照" },
  report_export: { label: "正式导出", description: "导出已审计报告为 Markdown/HTML", objective: "安全导出已完成的 Agent 报告" },
};

function professionalViewForRunKind(kind: AgentRunKind): ActiveView | null {
  if (kind === "paper_file_import" || kind === "paper_mysql_import" || kind === "library_clean") return "search";
  if (kind === "v20_modeling") return "pipeline";
  if (kind === "report_export") return "reports";
  return null;
}

function nextRunActionLabel(run: AgentRunRecord) {
  if (run.status.startsWith("awaiting_")) return "完成右侧待办";
  if (run.status === "paused") return "恢复执行或取消";
  if (run.status === "draft") return "开始规划";
  if (run.status === "ready") return "继续执行";
  if (run.status === "failed") return run.runKind === "research_report" ? "复制目标并重试" : "前往专业页面处理";
  if (run.status === "completed") return "复核成果与证据";
  if (run.status === "cancelled") return "只读查看审计记录";
  return "等待当前阶段完成";
}

function fmtTime(value?: number) {
  if (!value) return "—";
  return new Date(value).toLocaleString("zh-CN", { hour12: false, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function shortHash(value?: string) {
  return value ? `${value.slice(0, 8)}…${value.slice(-4)}` : "—";
}

function statusIcon(status: AgentRunStatus) {
  if (status === "completed") return CheckCircle2;
  if (status === "failed") return XCircle;
  if (status === "paused" || status === "cancelled") return Pause;
  if (AGENT_ACTIVE_POLL_STATUSES.has(status)) return Loader2;
  if (status.startsWith("awaiting_")) return Clock3;
  return Circle;
}

function errorMessage(error: unknown) {
  const normalized = normalizeAgentError(error);
  const messages: Record<string, string> = {
    AGENT_MODEL_CREDENTIAL_MISSING: "缺少模型凭据，请输入 API Key 后保存。",
    AGENT_RUN_ALREADY_EXECUTING: "该运行已在另一个执行器中推进。",
    AGENT_RUN_LEASE_HELD: "该运行当前由另一个执行器持有。",
    AGENT_RUN_NOT_EXECUTABLE: "当前状态不能执行，请先完成待办或恢复运行。",
    AGENT_ACTIVE_RUN_EXISTS: "当前项目已有一个活动运行。",
    AGENT_COMPLETION_SNAPSHOT_DRIFT: "活动 V20 快照已经变化，旧证据不能与新快照混用。",
  };
  return messages[normalized.code] ?? normalized.message ?? normalized.code;
}

function profileLabel(profile: AgentModelProfile) {
  const protocol = profile.protocol === "openai_responses" ? "OpenAI Responses" : profile.protocol === "anthropic_messages" ? "Anthropic Messages" : "OpenAI Chat";
  return `${protocol} · ${profile.model || "未设置模型"}`;
}

function legacyCredentialService(profile: AgentModelProfile, settings: AiSettings) {
  try {
    const origin = new URL(profile.baseUrl).origin;
    if (settings.provider === "deepseek" && origin === "https://api.deepseek.com") return "ai-deepseek";
    if (settings.provider === "openai-compatible" && origin === "https://api.openai.com") return "ai-openai-compatible";
  } catch {
    return undefined;
  }
  return undefined;
}

export function AgentWorkspace(props: AgentWorkspaceProps) {
  const client = useMemo<AgentDesktopClient>(
    () => props.visualReviewScenario ? createAgentVisualReviewClient(props.visualReviewScenario) : createAgentDesktopClient(),
    [props.visualReviewScenario],
  );
  const context = useMemo<AgentDatabaseContext>(() => ({ databaseDir: props.settings.databaseDir, projectId: props.activeProject.id }), [props.settings.databaseDir, props.activeProject.id]);
  const contextKey = useMemo(() => `${props.settings.databaseDir ?? ""}\u0000${props.activeProject.id}`, [props.settings.databaseDir, props.activeProject.id]);
  const [runs, setRuns] = useState<AgentRunRecord[]>([]);
  const [hasMoreRuns, setHasMoreRuns] = useState(false);
  const [runLimit, setRunLimit] = useState(RUN_PAGE_SIZE);
  const [centerSection, setCenterSection] = useState<AgentRunCenterSection>("inbox");
  const [historyStatus, setHistoryStatus] = useState<AgentRunHistoryStatus>("all");
  const [historyKind, setHistoryKind] = useState<"all" | AgentRunKind>("all");
  const [runQuery, setRunQuery] = useState("");
  const [selectedRunId, setSelectedRunId] = useState("");
  const [overview, setOverview] = useState<AgentRunOverview | null>(null);
  const [events, setEvents] = useState<AgentEventRecord[]>([]);
  const [artifactCache, setArtifactCache] = useState<Record<string, AgentArtifactRecord>>({});
  const [selectedArtifactId, setSelectedArtifactId] = useState("");
  const [activeTab, setActiveTab] = useState<"plan" | "timeline" | "artifacts">("plan");
  const [busy, setBusy] = useState("");
  const [controlBusy, setControlBusy] = useState("");
  const [error, setError] = useState("");
  const [artifactError, setArtifactError] = useState("");
  const [newRunOpen, setNewRunOpen] = useState(false);
  const [draft, setDraft] = useState<NewRunDraft>(() => createDraft(props.settings));
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [modelTest, setModelTest] = useState("");
  const [reasonDialog, setReasonDialog] = useState<{ kind: "plan" | "action" | "artifact" | "cancel"; decision?: "rejected" | "approved"; title: string } | null>(null);
  const [reason, setReason] = useState("");
  const [answer, setAnswer] = useState<unknown>("");
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const requestSequence = useRef(0);
  const commandInFlightRef = useRef("");
  const controlInFlightRef = useRef("");
  const createRunInFlightRef = useRef(false);
  const commandRequestSequence = useRef(0);
  const controlRequestSequence = useRef(0);
  const artifactRequestSequence = useRef(0);
  const currentRunRef = useRef("");
  const currentContextKeyRef = useRef(contextKey);
  const selectedArtifactRef = useRef("");
  const artifactMetadataIdsRef = useRef<Set<string>>(new Set());
  const eventsRef = useRef<AgentEventRecord[]>([]);
  currentContextKeyRef.current = contextKey;

  const effectiveSnapshot = props.visualReviewScenario === "no-snapshot" ? null : props.visualReviewScenario ? {
    snapshotId: "snapshot-v20-review", activeSnapshotId: "snapshot-v20-review", paperCount: 25_463, hotspotCount: 160, membershipCount: 25_463,
  } : props.v20Snapshot;
  const snapshotReady = Boolean(
    effectiveSnapshot?.snapshotId
    && effectiveSnapshot.activeSnapshotId === effectiveSnapshot.snapshotId
    && effectiveSnapshot.paperCount > 0
    && effectiveSnapshot.hotspotCount > 0
    && effectiveSnapshot.membershipCount === effectiveSnapshot.paperCount
    && (props.visualReviewScenario || !props.libraryStatus || props.libraryStatus.paperCount === effectiveSnapshot.paperCount),
  );

  const synchronizeArtifactScope = useCallback((
    artifacts: AgentArtifactMetadata[],
    resetCache = false,
    initialCache: Record<string, AgentArtifactRecord> = {},
  ) => {
    const nextIds = new Set(artifacts.map((artifact) => artifact.id));
    artifactMetadataIdsRef.current = nextIds;
    const selectedArtifactMissing = Boolean(selectedArtifactRef.current && !nextIds.has(selectedArtifactRef.current));
    if (resetCache || selectedArtifactMissing) {
      artifactRequestSequence.current += 1;
      selectedArtifactRef.current = "";
      setSelectedArtifactId("");
      setArtifactError("");
    }
    if (resetCache) setArtifactCache(initialCache);
  }, []);

  const selectArtifact = useCallback((artifactId: string) => {
    if (selectedArtifactRef.current === artifactId) return;
    artifactRequestSequence.current += 1;
    selectedArtifactRef.current = artifactId;
    setSelectedArtifactId(artifactId);
    setArtifactError("");
  }, []);

  const selectRun = useCallback((runId: string) => {
    if (currentRunRef.current !== runId) {
      requestSequence.current += 1;
      commandRequestSequence.current += 1;
      controlRequestSequence.current += 1;
      currentRunRef.current = runId;
      setBusy("");
      setControlBusy("");
      setOverview(null);
      setEvents([]);
      eventsRef.current = [];
      synchronizeArtifactScope([], true);
    }
    setSelectedRunId(runId);
  }, [synchronizeArtifactScope]);

  const loadRuns = useCallback(async (preserveSelection = true) => {
    const sequence = ++requestSequence.current;
    try {
      const next = await client.listRuns(context, runLimit + 1, 0);
      if (sequence !== requestSequence.current) return;
      const visible = next.slice(0, runLimit);
      setRuns(visible);
      setHasMoreRuns(next.length > runLimit);
      const saved = preserveSelection ? sessionStorage.getItem(`agent-run:${context.projectId}`) : null;
      const preferred = visible.find((run) => run.id === currentRunRef.current)?.id
        ?? visible.find((run) => run.id === saved)?.id
        ?? visible.find((run) => run.status.startsWith("awaiting_"))?.id
        ?? visible.find((run) => !TERMINAL_RUN_STATUSES.has(run.status))?.id
        ?? visible.find((run) => run.status === "failed" && Date.now() - run.updatedAtMs <= RECENT_RUN_WINDOW_MS)?.id
        ?? visible[0]?.id
        ?? "";
      setSelectedRunId((current) => visible.some((run) => run.id === current) ? current : preferred);
    } catch (value) {
      if (sequence === requestSequence.current) setError(errorMessage(value));
    }
  }, [client, context, runLimit]);

  const applySnapshot = useCallback((snapshot: AgentRunSnapshot) => {
    const next = overviewFromSnapshot(snapshot);
    const changingRun = currentRunRef.current !== next.run.id;
    const snapshotArtifacts = Object.fromEntries(snapshot.artifacts.map((artifact) => [artifact.id, artifact]));
    synchronizeArtifactScope(next.artifacts, changingRun, snapshotArtifacts);
    setOverview(next);
    setEvents(snapshot.events);
    eventsRef.current = snapshot.events;
    if (!changingRun) {
      setArtifactCache((current) => ({ ...current, ...snapshotArtifacts }));
    }
    currentRunRef.current = next.run.id;
    setSelectedRunId(next.run.id);
  }, [synchronizeArtifactScope]);

  const loadOverview = useCallback(async (runId: string, quiet = false) => {
    if (!runId) return;
    const sequence = ++requestSequence.current;
    if (!quiet) setBusy("loading");
    try {
      const next = await client.getOverview(context, runId);
      if (sequence !== requestSequence.current || currentRunRef.current !== runId) return;
      synchronizeArtifactScope(next.artifacts);
      setOverview(next);
      const currentEvents = currentRunRef.current === runId ? eventsRef.current : [];
      const afterSequence = currentEvents.at(-1)?.sequence ?? 0;
      const nextEvents = await client.getEvents(context, runId, afterSequence, 200);
      if (sequence !== requestSequence.current || currentRunRef.current !== runId) return;
      const mergedEvents = afterSequence > 0 ? [...currentEvents, ...nextEvents] : nextEvents;
      eventsRef.current = mergedEvents;
      setEvents(mergedEvents);
      setError("");
    } catch (value) {
      if (sequence === requestSequence.current) setError(errorMessage(value));
    } finally {
      if (!quiet && sequence === requestSequence.current) setBusy("");
    }
  }, [client, context, synchronizeArtifactScope]);

  useEffect(() => {
    requestSequence.current += 1;
    commandRequestSequence.current += 1;
    controlRequestSequence.current += 1;
    currentRunRef.current = "";
    setSelectedRunId("");
    setBusy("");
    setControlBusy("");
    setOverview(null);
    setEvents([]);
    eventsRef.current = [];
    synchronizeArtifactScope([], true);
    void loadRuns(false);
  }, [loadRuns, synchronizeArtifactScope]);

  useEffect(() => {
    if (!selectedRunId) {
      currentRunRef.current = "";
      setOverview(null);
      synchronizeArtifactScope([], true);
      return;
    }
    if (currentRunRef.current !== selectedRunId) {
      requestSequence.current += 1;
      commandRequestSequence.current += 1;
      controlRequestSequence.current += 1;
      setBusy("");
      setControlBusy("");
    }
    currentRunRef.current = selectedRunId;
    sessionStorage.setItem(`agent-run:${context.projectId}`, selectedRunId);
    synchronizeArtifactScope([], true);
    eventsRef.current = [];
    setEvents([]);
    void loadOverview(selectedRunId);
  }, [selectedRunId, context.projectId, loadOverview, synchronizeArtifactScope]);

  useEffect(() => {
    if (!overview?.run.id) return;
    const runId = overview.run.id;
    const timer = window.setTimeout(() => {
      if (currentRunRef.current === runId) void loadOverview(runId, true);
    }, pollIntervalForStatus(overview.run.status));
    return () => window.clearTimeout(timer);
  }, [overview?.run.id, overview?.run.status, overview?.run.updatedAtMs, loadOverview]);

  useEffect(() => {
    const onFocus = () => currentRunRef.current && void loadOverview(currentRunRef.current, true);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loadOverview]);

  useEffect(() => {
    if (!overview?.artifacts.length) {
      if (selectedArtifactRef.current) selectArtifact("");
      return;
    }
    if (!selectedArtifactId || !overview.artifacts.some((artifact) => artifact.id === selectedArtifactId)) {
      selectArtifact(overview.artifacts[overview.artifacts.length - 1].id);
    }
  }, [overview?.artifacts, selectedArtifactId, selectArtifact]);

  useEffect(() => {
    if (!selectedArtifactId || !overview || artifactCache[selectedArtifactId]) return;
    if (!overview.artifacts.some((artifact) => artifact.id === selectedArtifactId)) return;
    const runId = overview.run.id;
    const artifactId = selectedArtifactId;
    const sequence = ++artifactRequestSequence.current;
    const fence = { sequence, runId, contextKey, artifactId };
    let active = true;
    void client.getArtifact(context, runId, artifactId).then((artifact) => {
      if (active && matchesAgentArtifactRequestFence(
        fence,
        artifactRequestSequence.current,
        currentRunRef.current,
        currentContextKeyRef.current,
        selectedArtifactRef.current,
        artifactMetadataIdsRef.current.has(artifactId),
      )) {
        setArtifactError("");
        setArtifactCache((current) => ({ ...current, [artifact.id]: artifact }));
      }
    }).catch((value) => {
      if (active && matchesAgentArtifactRequestFence(
        fence,
        artifactRequestSequence.current,
        currentRunRef.current,
        currentContextKeyRef.current,
        selectedArtifactRef.current,
        artifactMetadataIdsRef.current.has(artifactId),
      )) {
        setArtifactError(errorMessage(value));
      }
    });
    return () => { active = false; };
  }, [selectedArtifactId, overview, artifactCache, client, context, contextKey]);

  const runCommand = useCallback(async (label: string, runId: string, operation: () => Promise<AgentRunSnapshot>, autoContinue = false) => {
    const commandKey = `${contextKey}\u0000${runId}`;
    if (busy || controlBusy || commandInFlightRef.current === commandKey) return;
    const sequence = ++commandRequestSequence.current;
    const fence = { sequence, runId, contextKey };
    const isCurrent = () => matchesAgentRequestFence(
      fence,
      commandRequestSequence.current,
      currentRunRef.current,
      currentContextKeyRef.current,
    );
    commandInFlightRef.current = commandKey;
    setBusy(label);
    setError("");
    try {
      let snapshot = await operation();
      if (!isCurrent() || snapshot.run.id !== runId) return;
      applySnapshot(snapshot);
      if (autoContinue && ["ready", "evaluating", "awaiting_action_approval"].includes(snapshot.run.status)) {
        if (!isCurrent()) return;
        snapshot = await client.executeRun(context, snapshot.run.id);
        if (!isCurrent() || snapshot.run.id !== runId) return;
        applySnapshot(snapshot);
      } else if (autoContinue && snapshot.run.status === "planning") {
        const planner = profileReference(snapshot, "planner");
        const writer = profileReference(snapshot, "writer");
        if (planner && isCurrent()) {
          snapshot = await client.planRun(context, snapshot.run.id, planner, writer);
          if (!isCurrent() || snapshot.run.id !== runId) return;
          applySnapshot(snapshot);
        }
      }
      if (isCurrent()) await loadRuns();
    } catch (value) {
      if (isCurrent()) setError(errorMessage(value));
    } finally {
      if (commandInFlightRef.current === commandKey) {
        commandInFlightRef.current = "";
        setBusy("");
      }
    }
  }, [busy, controlBusy, contextKey, applySnapshot, client, context, loadRuns]);

  const runControlCommand = useCallback(async (label: string, runId: string, operation: () => Promise<AgentRunSnapshot>) => {
    const commandKey = `${contextKey}\u0000${runId}`;
    if (controlInFlightRef.current === commandKey) return;
    const sequence = ++controlRequestSequence.current;
    const fence = { sequence, runId, contextKey };
    const isCurrent = () => matchesAgentRequestFence(
      fence,
      controlRequestSequence.current,
      currentRunRef.current,
      currentContextKeyRef.current,
    );
    commandRequestSequence.current += 1;
    controlInFlightRef.current = commandKey;
    setControlBusy(label);
    setError("");
    try {
      const snapshot = await operation();
      if (!isCurrent() || snapshot.run.id !== runId) return;
      applySnapshot(snapshot);
      if (isCurrent()) await loadRuns();
    } catch (value) {
      if (isCurrent()) setError(errorMessage(value));
    } finally {
      if (controlInFlightRef.current === commandKey) controlInFlightRef.current = "";
      if (isCurrent()) setControlBusy("");
    }
  }, [contextKey, applySnapshot, loadRuns]);

  async function createRun() {
    if (!snapshotReady || busy || createRunInFlightRef.current) return;
    createRunInFlightRef.current = true;
    setBusy("create");
    setError("");
    try {
      const plannerCredential = await client.configureCredential({
        projectId: context.projectId,
        profile: draft.planner,
        secret: draft.plannerSecret,
        legacyService: legacyCredentialService(draft.planner, props.settings),
      });
      if (!plannerCredential.configured && !props.settings.useEnvKey) throw new Error("AGENT_MODEL_CREDENTIAL_MISSING");
      const writerProfile = draft.writerMatchesPlanner ? draft.planner : draft.writer;
      if (!draft.writerMatchesPlanner) {
        const writerCredential = await client.configureCredential({ projectId: context.projectId, profile: writerProfile, secret: draft.writerSecret });
        if (!writerCredential.configured) throw new Error("AGENT_MODEL_CREDENTIAL_MISSING");
      }
      const [planner, writer] = await Promise.all([
        client.saveModelProfile(context, "planner", draft.planner),
        client.saveModelProfile(context, "writer", writerProfile),
      ]);
      const id = `agent-${crypto.randomUUID()}`;
      const objective = draft.objective.trim() || RUN_KIND_LABELS.research_report.objective;
      await client.createRun(context, { id, automationMode: draft.mode, objective, budget: draft.budget, runKind: "research_report", taskInput: {} });
      setSelectedRunId(id);
      currentRunRef.current = id;
      const snapshot = await client.planRun(context, id, planner, writer);
      applySnapshot(snapshot);
      setNewRunOpen(false);
      setDraft(createDraft(props.settings));
      await loadRuns();
      props.onNotice(
        draft.mode === "advisor" ? "顾问计划已生成。" : "研究计划已生成，等待审批。",
        "success",
      );
    } catch (value) {
      const normalized = normalizeAgentError(value);
      if (normalized.code === "AGENT_ACTIVE_RUN_EXISTS" && normalized.runId) {
        setNewRunOpen(false);
        selectRun(normalized.runId);
        props.onNotice("当前项目已有活动运行，已为你打开。", "info");
      } else {
        setError(errorMessage(value));
      }
    } finally {
      createRunInFlightRef.current = false;
      setBusy("");
    }
  }

  async function testProfile(role: "planner" | "writer") {
    const profile = role === "planner" || draft.writerMatchesPlanner ? draft.planner : draft.writer;
    const secret = role === "planner" ? draft.plannerSecret : draft.writerSecret;
    setModelTest("正在验证模型协议和凭据…");
    try {
      const configured = await client.configureCredential({ projectId: context.projectId, profile, secret, legacyService: role === "planner" ? legacyCredentialService(profile, props.settings) : undefined });
      if (!configured.configured && !props.settings.useEnvKey) throw new Error("AGENT_MODEL_CREDENTIAL_MISSING");
      const result = await client.testModel({ projectId: context.projectId, profile });
      setModelTest(result.connected ? `连接成功 · ${result.elapsedMs}ms${result.fallbackUsed ? " · 兼容 JSON 模式" : ""}` : "模型返回未通过结构化检查。" );
    } catch (value) {
      setModelTest(errorMessage(value));
    }
  }

  const runCenterData = useMemo(() => {
    const now = Date.now();
    const awaiting = runs.filter((run) => run.status.startsWith("awaiting_"));
    const active = runs.filter((run) => !TERMINAL_RUN_STATUSES.has(run.status) && !run.status.startsWith("awaiting_"));
    const recentFailed = runs
      .filter((run) => run.status === "failed" && now - run.updatedAtMs <= RECENT_RUN_WINDOW_MS)
      .sort((left, right) => right.updatedAtMs - left.updatedAtMs)
      .slice(0, 3);
    const inboxIds = new Set<string>();
    const inbox = [...awaiting, ...active, ...recentFailed].filter((run) => {
      if (inboxIds.has(run.id)) return false;
      inboxIds.add(run.id);
      return true;
    });
    const normalizedQuery = runQuery.trim().toLocaleLowerCase("zh-CN");
    const history = runs.filter((run) => {
      if (!TERMINAL_RUN_STATUSES.has(run.status)) return false;
      if (historyStatus !== "all" && run.status !== historyStatus) return false;
      if (historyKind !== "all" && run.runKind !== historyKind) return false;
      if (!normalizedQuery) return true;
      return `${run.objective} ${RUN_KIND_LABELS[run.runKind]?.label ?? run.runKind} ${run.lastErrorCode ?? ""}`.toLocaleLowerCase("zh-CN").includes(normalizedQuery);
    });
    return {
      awaiting,
      active,
      recentFailed,
      recentCompleted: runs.filter((run) => run.status === "completed" && now - (run.completedAtMs ?? run.updatedAtMs) <= RECENT_RUN_WINDOW_MS),
      inbox,
      history,
    };
  }, [historyKind, historyStatus, runQuery, runs]);
  const visibleRuns = centerSection === "inbox" ? runCenterData.inbox : runCenterData.history;
  const selectedArtifact = selectedArtifactId ? artifactCache[selectedArtifactId] : undefined;
  const pending = overview ? pendingKind(overview) : "none";
  const confirmationBusy = Boolean(controlBusy) || (Boolean(busy) && reasonDialog?.kind !== "cancel");

  useEffect(() => {
    if (pending !== "none") setInspectorOpen(true);
  }, [pending, selectedRunId]);

  const openResearchDraftFromRun = (run: AgentRunRecord) => {
    setDraft({ ...createDraft(props.settings), objective: run.objective });
    setNewRunOpen(true);
  };

  const switchCenterSection = (section: AgentRunCenterSection) => {
    setCenterSection(section);
    const nextRuns = section === "inbox" ? runCenterData.inbox : runCenterData.history;
    if (nextRuns.length && !nextRuns.some((run) => run.id === selectedRunId)) selectRun(nextRuns[0].id);
  };

  return (
    <div className="agent-page agent-run-center-page">
      <header className="agent-page-header">
        <div>
          <div className="eyebrow"><Bot size={14} /> 受监督研究运行</div>
          <h1>Agent 运行中心</h1>
          <p>优先处理审批、用户判断与活动任务；完整历史和技术审计按需展开。</p>
        </div>
        <div className="agent-header-actions">
          <button className="secondary-action h-10 px-3" onClick={() => props.onNavigate("agent")}><ArrowLeft size={16} />返回 Sidera</button>
          <button className="secondary-action agent-rail-toggle h-10 px-3" onClick={() => setRailOpen((value) => !value)}><ListChecks size={16} />队列</button>
          <SnapshotBadge ready={snapshotReady} snapshot={effectiveSnapshot} />
          <button className="primary-action h-10 gap-2 px-4" onClick={() => { setDraft(createDraft(props.settings)); setNewRunOpen(true); }} disabled={runs.some((run) => !["completed", "cancelled", "failed"].includes(run.status))}>
            <Plus size={16} /> 新建研究任务
          </button>
        </div>
      </header>

      <section className="agent-run-center-summary" aria-label="运行摘要">
        <button type="button" onClick={() => switchCenterSection("inbox")}><span>待审批</span><strong>{runCenterData.awaiting.length}</strong><small>计划、动作、回答或成果</small></button>
        <button type="button" onClick={() => switchCenterSection("inbox")}><span>运行中</span><strong>{runCenterData.active.length}</strong><small>规划、执行、评估或暂停</small></button>
        <button type="button" onClick={() => switchCenterSection("inbox")}><span>失败待检查</span><strong>{runCenterData.recentFailed.length}</strong><small>最近 7 天，最多显示 3 项</small></button>
        <button type="button" onClick={() => switchCenterSection("history")}><span>最近完成</span><strong>{runCenterData.recentCompleted.length}</strong><small>最近 7 天完成的运行</small></button>
      </section>

      {!snapshotReady && (
        <div className="agent-blocker-banner">
          <ShieldAlert size={18} />
          <div><strong>需要有效的统一 V20 快照</strong><span>Agent 不会自动聚类，也不会使用样例或 App17 数据。</span></div>
          <button className="secondary-action h-9 px-3" onClick={() => props.onNavigate("pipeline")}>前往热点建模</button>
        </div>
      )}

      {error && <div className="agent-error-banner" role="alert"><AlertTriangle size={16} /><span>{error}</span><button onClick={() => setError("")} aria-label="关闭错误"><X size={14} /></button></div>}
      {artifactError && <div className="agent-error-banner" role="alert" data-agent-error-kind="artifact"><AlertTriangle size={16} /><span>{artifactError}</span><button onClick={() => setArtifactError("")} aria-label="关闭成果读取错误"><X size={14} /></button></div>}

      <div className="agent-workbench">
        <aside className={`agent-run-rail ${railOpen ? "agent-run-rail-open" : ""}`}>
          <button className="agent-rail-close" onClick={() => setRailOpen(false)} aria-label="关闭运行列表"><X size={15} /></button>
          <div className="agent-rail-header">
            <div><span>{centerSection === "inbox" ? "待办队列" : "运行历史"}</span><small>{visibleRuns.length}</small></div>
            <button className="agent-icon-button" onClick={() => void loadRuns()} aria-label="刷新运行列表"><RefreshCw size={15} /></button>
          </div>
          <div className="agent-center-sections" role="tablist" aria-label="运行中心分区">
            <button role="tab" aria-selected={centerSection === "inbox"} className={centerSection === "inbox" ? "active" : ""} onClick={() => switchCenterSection("inbox")}><Inbox size={14} />待办</button>
            <button role="tab" aria-selected={centerSection === "history"} className={centerSection === "history" ? "active" : ""} onClick={() => switchCenterSection("history")}><History size={14} />历史</button>
          </div>
          {centerSection === "history" ? (
            <div className="agent-history-filters">
              <label><Search size={13} /><input value={runQuery} onChange={(event) => setRunQuery(event.target.value)} placeholder="搜索目标、类型或错误" /></label>
              <div>
                <select aria-label="历史运行状态" value={historyStatus} onChange={(event) => setHistoryStatus(event.target.value as AgentRunHistoryStatus)}><option value="all">全部状态</option><option value="completed">已完成</option><option value="failed">失败</option><option value="cancelled">已取消</option></select>
                <select aria-label="历史任务类型" value={historyKind} onChange={(event) => setHistoryKind(event.target.value as "all" | AgentRunKind)}><option value="all">全部类型</option>{(Object.keys(RUN_KIND_LABELS) as AgentRunKind[]).map((kind) => <option key={kind} value={kind}>{RUN_KIND_LABELS[kind].label}</option>)}</select>
              </div>
            </div>
          ) : null}
          <div className="agent-run-list">
            {visibleRuns.map((run) => <RunListItem key={run.id} run={run} active={run.id === selectedRunId} onSelect={() => { selectRun(run.id); setRailOpen(false); }} />)}
            {visibleRuns.length === 0 && <div className="agent-empty-rail"><Bot size={22} /><span>{centerSection === "inbox" ? "当前没有待办" : "没有匹配的历史运行"}</span><small>{centerSection === "inbox" ? "新任务、审批和近期失败会优先出现在这里。" : "调整状态、类型或关键词筛选。"}</small></div>}
          </div>
          {hasMoreRuns && <button className="agent-load-more" onClick={() => setRunLimit((current) => current + RUN_PAGE_SIZE)}>继续加载</button>}
        </aside>

        <main className="agent-main-panel">
          {!overview ? <AgentEmptyState busy={busy === "loading"} onCreate={() => setNewRunOpen(true)} disabled={runs.some((run) => !["completed", "cancelled", "failed"].includes(run.status))} /> : (
            <>
              <RunHeader overview={overview} busy={busy} controlBusy={controlBusy} onPlan={() => void runCommand("plan", overview.run.id, () => resumeDraftPlanning(overview, client, context))} onContinue={() => void runCommand("execute", overview.run.id, () => client.executeRun(context, overview.run.id))} onPause={() => void runControlCommand("pause", overview.run.id, () => client.controlRun(context, overview.run.id, "pause"))} onResume={() => void runCommand("resume", overview.run.id, () => client.controlRun(context, overview.run.id, "resume"), true)} onCancel={() => { setReason(""); setReasonDialog({ kind: "cancel", title: "取消当前运行" }); }} onToggleInspector={() => setInspectorOpen((value) => !value)} />
              <RunOverviewStrip overview={overview} pending={pending} />
              {overview.run.status === "failed" ? (
                <FailedRunRecovery
                  run={overview.run}
                  onCopyResearch={() => openResearchDraftFromRun(overview.run)}
                  onOpenProfessional={() => {
                    const destination = professionalViewForRunKind(overview.run.runKind);
                    if (destination) props.onNavigate(destination);
                  }}
                />
              ) : null}
              <nav className="agent-tabs" aria-label="Agent 运行内容">
                <button className={activeTab === "plan" ? "active" : ""} onClick={() => setActiveTab("plan")}><ListChecks size={15} />计划</button>
                <button className={activeTab === "timeline" ? "active" : ""} onClick={() => setActiveTab("timeline")}><Activity size={15} />过程 <span>{events.length}</span></button>
                <button className={activeTab === "artifacts" ? "active" : ""} onClick={() => setActiveTab("artifacts")}><FileText size={15} />成果 <span>{overview.artifacts.length}</span></button>
              </nav>
              <div className="agent-tab-content">
                {activeTab === "plan" && <PlanView overview={overview} />}
                {activeTab === "timeline" && <TimelineView events={events} steps={overview.steps} hasMore={(events.at(-1)?.sequence ?? 0) < overview.eventCursor} onLoadMore={() => void loadOverview(overview.run.id, true)} />}
                {activeTab === "artifacts" && <ArtifactWorkspace overview={overview} selectedId={selectedArtifactId} onSelect={selectArtifact} artifact={selectedArtifact} onOpenPaper={props.onOpenPaper} />}
              </div>
            </>
          )}
        </main>

        <aside className={`agent-inspector ${pending !== "none" ? "agent-inspector-attention" : ""} ${inspectorOpen ? "agent-inspector-open" : ""}`}>
          <button className="agent-inspector-close" onClick={() => setInspectorOpen(false)} aria-label="关闭运行检查器"><X size={15} /></button>
          {overview ? <Inspector overview={overview} pending={pending} answer={answer} setAnswer={setAnswer} busy={Boolean(busy) || Boolean(controlBusy)} onApprovePlan={() => void runCommand("approve-plan", overview.run.id, () => client.decidePlan(context, { runId: overview.run.id, decision: "approved", actorId: ACTOR_ID }), true)} onRejectPlan={() => { setReason(""); setReasonDialog({ kind: "plan", decision: "rejected", title: "拒绝当前计划" }); }} onApproveAction={() => { const step = findPendingStep(overview); if (step) void runCommand("approve-action", overview.run.id, () => client.decideAction(context, { runId: overview.run.id, stepId: step.stepId, decision: "approved", actorId: ACTOR_ID }), true); }} onRejectAction={() => { setReason(""); setReasonDialog({ kind: "action", decision: "rejected", title: "拒绝当前写动作" }); }} onSubmitAnswer={() => { const question = findPendingQuestion(overview); if (question) void runCommand("answer", overview.run.id, () => client.submitAnswer(context, { runId: overview.run.id, questionId: question.id, answer, actorId: ACTOR_ID }), true); }} onApproveArtifact={() => { const artifact = findPendingReviewArtifact(overview); if (artifact) { setReason(""); setReasonDialog({ kind: "artifact", decision: "approved", title: "批准高风险报告" }); } }} onRejectArtifact={() => { setReason(""); setReasonDialog({ kind: "artifact", decision: "rejected", title: "拒绝高风险报告" }); }} onOpenPipeline={() => props.onNavigate("pipeline")} /> : <InspectorEmpty />}
        </aside>
      </div>

      <AgentModal open={newRunOpen} title="新建研究任务" onClose={() => !busy && setNewRunOpen(false)} wide>
        <NewRunForm draft={draft} setDraft={setDraft} snapshotReady={snapshotReady} snapshot={effectiveSnapshot} advancedOpen={advancedOpen} setAdvancedOpen={setAdvancedOpen} modelTest={modelTest} busy={busy} onTest={testProfile} onSubmit={() => void createRun()} onOpenPipeline={() => props.onNavigate("pipeline")} />
      </AgentModal>

      <AgentModal open={Boolean(reasonDialog)} title={reasonDialog?.title || "确认操作"} onClose={() => !confirmationBusy && setReasonDialog(null)}>
        <div className="agent-confirm-copy">
          <AlertTriangle size={18} />
          <p>{reasonDialog?.kind === "cancel" ? "取消会停止当前模型或工具调用，并在后端确认回滚后结束运行。" : reasonDialog?.decision === "approved" ? "批准将绑定最新成果哈希，随后重新执行确定性完成门禁。" : "拒绝原因会进入不可变审计事件；需要重新规划时，旧批准将自动失效。"}</p>
        </div>
        <label className="field-label">{reasonDialog?.decision === "approved" ? "复核说明（可选）" : "原因"}<textarea className="field-control min-h-[110px] p-3" value={reason} onChange={(event) => setReason(event.target.value.slice(0, 500))} placeholder={reasonDialog?.decision === "approved" ? "记录复核依据" : "请说明拒绝或取消原因"} /></label>
        <div className="agent-modal-actions">
          <button className="secondary-action h-10 px-4" onClick={() => setReasonDialog(null)} disabled={confirmationBusy}>继续检查</button>
          <button className={reasonDialog?.decision === "approved" ? "primary-action h-10 px-4" : "danger-action h-10 px-4"} disabled={confirmationBusy || (reasonDialog?.decision !== "approved" && !reason.trim())} onClick={() => {
            if (!overview || !reasonDialog) return;
            const dialog = reasonDialog;
            setReasonDialog(null);
            if (dialog.kind === "cancel") void runControlCommand("cancel", overview.run.id, () => client.controlRun(context, overview.run.id, "cancel"));
            if (dialog.kind === "plan") void runCommand("reject-plan", overview.run.id, () => client.decidePlan(context, { runId: overview.run.id, decision: "rejected", actorId: ACTOR_ID, reason }));
            if (dialog.kind === "action") { const step = findPendingStep(overview); if (step) void runCommand("reject-action", overview.run.id, () => client.decideAction(context, { runId: overview.run.id, stepId: step.stepId, decision: "rejected", actorId: ACTOR_ID, reason }), true); }
            if (dialog.kind === "artifact") { const artifact = findPendingReviewArtifact(overview); if (artifact) void runCommand("review-artifact", overview.run.id, () => client.reviewArtifact(context, { runId: overview.run.id, artifactId: artifact.id, decision: dialog.decision === "approved" ? "approved" : "rejected", actorId: ACTOR_ID, reason }), dialog.decision === "approved"); }
          }}>{reasonDialog?.decision === "approved" ? "确认批准" : reasonDialog?.kind === "cancel" ? "确认取消" : "确认拒绝"}</button>
        </div>
      </AgentModal>
    </div>
  );
}

function profileReference(snapshot: AgentRunSnapshot, role: "planner" | "writer"): AgentModelProfileReference | undefined {
  const profile = snapshot.modelProfiles.find((value) => value.role === role);
  return profile ? { profileId: profile.id, configSha256: profile.configSha256 } : undefined;
}

async function resumeDraftPlanning(overview: AgentRunOverview, client: AgentDesktopClient, context: AgentDatabaseContext) {
  if (overview.run.status !== "draft") throw new Error("AGENT_RUN_NOT_DRAFT");
  const planner = overview.modelProfiles.find((profile) => profile.role === "planner");
  const writer = overview.modelProfiles.find((profile) => profile.role === "writer");
  const recovered = planner
    ? { planner: { profileId: planner.id, configSha256: planner.configSha256 }, writer: writer ? { profileId: writer.id, configSha256: writer.configSha256 } : undefined }
    : await client.getDraftModelProfiles(context, overview.run.id);
  return client.planRun(context, overview.run.id, recovered.planner, recovered.writer);
}

function SnapshotBadge({ ready, snapshot }: { ready: boolean; snapshot: { snapshotId?: string; paperCount: number; hotspotCount: number; membershipCount: number } | null | undefined }) {
  return <div className={`agent-snapshot-badge ${ready ? "ready" : "blocked"}`}><Database size={15} /><div><strong>{ready ? "V20 快照已锁定" : "V20 快照不可用"}</strong><span>{ready && snapshot ? `${snapshot.paperCount.toLocaleString()} 篇 · ${snapshot.hotspotCount} 热点 · ${shortHash(snapshot.snapshotId)}` : "不会自动建模"}</span></div></div>;
}

function RunListItem({ run, active, onSelect }: { run: AgentRunRecord; active: boolean; onSelect: () => void }) {
  const Icon = statusIcon(run.status);
  const meta = AGENT_STATUS_META[run.status];
  return <button className={`agent-run-item ${active ? "active" : ""}`} onClick={onSelect} aria-pressed={active}><div className="agent-run-item-top"><span className={`agent-status-dot tone-${meta.tone}`}><Icon size={13} className={AGENT_ACTIVE_POLL_STATUSES.has(run.status) ? "animate-spin" : ""} />{meta.label}</span><time>{fmtTime(run.updatedAtMs)}</time></div><strong>{run.objective}</strong><div className="agent-run-item-progress"><span style={{ width: `${Math.min(100, run.budget.maxSteps ? run.budgetUsage.executedSteps / run.budget.maxSteps * 100 : 0)}%` }} /></div><small>{run.automationMode === "advisor" ? "顾问" : "监督"} · {run.budgetUsage.toolCalls}/{run.budget.maxToolCalls} 次工具调用</small></button>;
}

function AgentEmptyState({ busy, onCreate, disabled }: { busy: boolean; onCreate: () => void; disabled: boolean }) {
  return <div className="agent-empty-main"><div className="agent-empty-symbol"><Bot size={30} /></div><h2>{busy ? "正在恢复运行状态" : "建立第一个可审计研究运行"}</h2><p>Agent 只使用当前 SQLite 论文库和活动 V20 快照。所有写动作都需要单独批准。</p><button className="primary-action h-10 px-4" onClick={onCreate} disabled={busy || disabled}><Plus size={16} />新建研究任务</button></div>;
}

function RunHeader({ overview, busy, controlBusy, onPlan, onContinue, onPause, onResume, onCancel, onToggleInspector }: { overview: AgentRunOverview; busy: string; controlBusy: string; onPlan: () => void; onContinue: () => void; onPause: () => void; onResume: () => void; onCancel: () => void; onToggleInspector: () => void }) {
  const meta = AGENT_STATUS_META[overview.run.status];
  const Icon = statusIcon(overview.run.status);
  const working = Boolean(busy) || Boolean(controlBusy);
  const controlWorking = Boolean(controlBusy);
  const committing = overview.currentOperation?.status === "committing";
  return <header className="agent-run-header"><div className="agent-run-heading"><div className={`agent-status-chip tone-${meta.tone}`}><Icon size={14} className={AGENT_ACTIVE_POLL_STATUSES.has(overview.run.status) ? "animate-spin" : ""} />{meta.label}</div><small>{RUN_KIND_LABELS[overview.run.runKind]?.label ?? overview.run.runKind}</small><h2>{overview.run.objective}</h2><p>{committing ? "正在安全提交：事务完成前暂停与取消暂不可用。" : meta.description}</p>{overview.currentOperation && <div className="agent-operation-inline"><span>{committing ? "正在安全提交" : overview.currentOperation.phase}</span><strong>{overview.currentOperation.processedCount.toLocaleString()}/{overview.currentOperation.totalCount?.toLocaleString() ?? "?"}</strong><progress value={overview.currentOperation.processedCount} max={overview.currentOperation.totalCount || 1} /></div>}</div><div className="agent-run-controls"><button className="secondary-action agent-inspector-toggle h-9 px-3" onClick={onToggleInspector}><Gauge size={15} />治理</button>{overview.run.status === "draft" && <button className="primary-action h-9 px-3" onClick={onPlan} disabled={working}><Sparkles size={15} />开始规划</button>}{overview.run.status === "ready" && <button className="primary-action h-9 px-3" onClick={onContinue} disabled={working}><Play size={15} />继续执行</button>}{["running", "evaluating"].includes(overview.run.status) && <button className="secondary-action h-9 px-3" onClick={onPause} disabled={controlWorking || committing}><Pause size={15} />暂停</button>}{overview.run.status === "paused" && <button className="primary-action h-9 px-3" onClick={onResume} disabled={working}><RotateCcw size={15} />恢复执行</button>}{!["completed", "cancelled", "failed", "cancelling"].includes(overview.run.status) && <button className="secondary-action h-9 px-3" onClick={onCancel} disabled={controlWorking || committing}><Square size={14} />取消</button>}</div></header>;
}

function RunOverviewStrip({ overview, pending }: { overview: AgentRunOverview; pending: ReturnType<typeof pendingKind> }) {
  const blocker = pending !== "none"
    ? pending === "plan" ? "计划等待审批" : pending === "action" ? "动作等待审批" : pending === "question" ? "等待用户回答" : pending === "artifact_review" ? "成果等待复核" : "运行等待处理"
    : overview.run.lastErrorCode ?? "无阻塞";
  return <section className="agent-run-overview-strip" aria-label="当前运行概况"><div><span>任务类型</span><strong>{RUN_KIND_LABELS[overview.run.runKind]?.label ?? overview.run.runKind}</strong></div><div><span>当前阶段</span><strong>{overview.currentOperation?.phase ?? AGENT_STATUS_META[overview.run.status].label}</strong></div><div><span>阻塞原因</span><strong>{blocker}</strong></div><div><span>下一步</span><strong>{nextRunActionLabel(overview.run)}</strong></div></section>;
}

function FailedRunRecovery({ run, onCopyResearch, onOpenProfessional }: { run: AgentRunRecord; onCopyResearch: () => void; onOpenProfessional: () => void }) {
  const research = run.runKind === "research_report";
  return <section className="agent-failed-recovery"><div><AlertTriangle size={16} /><span><strong>失败步骤需要检查</strong><small>{run.lastErrorCode ?? "运行未返回可识别错误码"}</small></span></div><button className="secondary-action h-9 px-3" onClick={research ? onCopyResearch : onOpenProfessional}>{research ? "复制目标并新建任务" : `前往${RUN_KIND_LABELS[run.runKind].label}专业页面`}</button></section>;
}

function PlanView({ overview }: { overview: AgentRunOverview }) {
  if (!overview.plan) return <div className="agent-content-empty"><ListChecks size={24} /><span>尚未生成计划</span></div>;
  return <div className="agent-plan-view"><section className="agent-plan-summary"><div><span>计划版本</span><strong>v{overview.plan.version}</strong></div><div><span>假设</span><strong>{overview.plan.assumptions.length}</strong></div><div><span>成功标准</span><strong>{overview.plan.successCriteria.length}</strong></div><div><span>步骤</span><strong>{overview.plan.steps.length}</strong></div></section><section className="agent-plan-context"><div><h3>运行假设</h3>{overview.plan.assumptions.map((value) => <p key={value}><Check size={13} />{value}</p>)}</div><div><h3>确定性成功标准</h3>{overview.plan.successCriteria.map((criterion) => <p key={criterion.id}><ShieldCheck size={13} />{criterion.description}</p>)}</div></section><div className="agent-step-list">{overview.steps.map((step) => <div key={step.stepId} className={`agent-step-row status-${step.status}`}><div className="agent-step-ordinal">{String(step.ordinal + 1).padStart(2, "0")}</div><div className="agent-step-body"><div><strong>{step.title}</strong><span className={`agent-risk risk-${step.risk}`}>{step.risk === "read" ? "只读" : step.risk === "write" ? "写入" : "高风险"}</span></div><code>{step.toolName}@{step.toolVersion}</code>{step.lastErrorCode && <small>{step.lastErrorCode}{step.recoveryCount ? ` · 恢复 ${step.recoveryCount} 次` : ""}</small>}</div><div className="agent-step-state">{step.status === "succeeded" ? <CheckCircle2 size={16} /> : step.status === "running" ? <Loader2 className="animate-spin" size={16} /> : step.status === "failed" ? <XCircle size={16} /> : <Circle size={15} />}<span>{step.status}</span></div></div>)}</div></div>;
}

function TimelineView({ events, steps, hasMore, onLoadMore }: { events: AgentEventRecord[]; steps: AgentRunOverview["steps"]; hasMore: boolean; onLoadMore: () => void }) {
  const titles = new Map(steps.map((step) => [step.stepId, step.title]));
  return <div className="agent-timeline">{events.length === 0 && <div className="agent-content-empty"><Activity size={24} /><span>暂无审计事件</span></div>}{events.map((event) => <article key={event.sequence} className="agent-event"><div className="agent-event-marker" /><div><div className="agent-event-top"><strong>{event.eventType.replaceAll("_", " ")}</strong><span>#{event.sequence} · {fmtTime(event.createdAtMs)}</span></div>{event.stepId && <small>{titles.get(event.stepId) ?? event.stepId}</small>}<p>{summarizeEventPayload(event.payload)}</p></div></article>)}{hasMore && <button className="agent-load-more" onClick={onLoadMore}>加载更多审计事件</button>}</div>;
}

function ArtifactWorkspace({ overview, selectedId, onSelect, artifact, onOpenPaper }: { overview: AgentRunOverview; selectedId: string; onSelect: (id: string) => void; artifact?: AgentArtifactRecord; onOpenPaper: (paperId: string, title?: string) => void }) {
  return <div className="agent-artifact-workspace"><nav className="agent-artifact-list">{overview.artifacts.map((item) => <button key={item.id} className={selectedId === item.id ? "active" : ""} onClick={() => onSelect(item.id)}><ArtifactIcon kind={item.artifactKind} /><div><strong>{artifactLabel(item.artifactKind)}</strong><span>{fmtTime(item.createdAtMs)}</span></div><small>{artifactReviewLabel(effectiveArtifactReviewStatus(overview, item), item.contentSha256)}</small></button>)}{overview.artifacts.length === 0 && <div className="agent-content-empty"><FileText size={22} /><span>执行后将在此显示不可变成果</span></div>}</nav><section className="agent-artifact-view">{selectedId && !artifact ? <div className="agent-content-empty"><Loader2 className="animate-spin" size={22} /><span>正在校验并读取成果…</span></div> : artifact ? <ArtifactContent artifact={artifact} effectiveReviewStatus={effectiveArtifactReviewStatus(overview, artifact)} onOpenPaper={onOpenPaper} /> : <div className="agent-content-empty"><FileText size={24} /><span>选择一个成果查看内容</span></div>}</section></div>;
}

function ArtifactIcon({ kind }: { kind: string }) { return kind === "research_evidence" ? <Search size={16} /> : kind === "report_audit" ? <FileCheck2 size={16} /> : <FileText size={16} />; }
function artifactLabel(kind: string) { return kind === "research_evidence" ? "研究证据" : kind === "report_draft" ? "报告草稿" : kind === "report_audit" ? "确定性审计" : kind; }

function ArtifactContent({ artifact, effectiveReviewStatus, onOpenPaper }: { artifact: AgentArtifactRecord; effectiveReviewStatus?: string; onOpenPaper: (paperId: string, title?: string) => void }) {
  const content = asRecord(artifact.content);
  if (artifact.artifactKind === "research_evidence") {
    const papers = Array.isArray(content.papers) ? content.papers.map(asRecord) : [];
    return <div className="agent-evidence"><ArtifactHeading artifact={artifact} reviewStatus={effectiveReviewStatus} /><div className="agent-evidence-stats"><span>{papers.length} 篇论文</span><span>{Array.isArray(content.hotspotIds) ? content.hotspotIds.length : 0} 个热点</span><span>{content.truncated ? "已截断" : "完整证据包"}</span></div><div className="agent-paper-list">{papers.map((paper, index) => <button key={String(paper.id ?? index)} onClick={() => onOpenPaper(String(paper.id ?? ""), String(paper.title ?? ""))}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{String(paper.title ?? "未命名论文")}</strong><small>{[paper.source, paper.year, paper.field].filter(Boolean).join(" · ")}</small></div></button>)}</div></div>;
  }
  if (artifact.artifactKind === "report_draft") {
    return <div className="agent-report"><ArtifactHeading artifact={artifact} reviewStatus={effectiveReviewStatus} /><SafeMarkdown content={String(content.content ?? "")} /></div>;
  }
  if (artifact.artifactKind === "report_audit") {
    const risk = String(content.riskLevel ?? "unknown");
    const missing = Array.isArray(content.missingRequiredSections) ? content.missingRequiredSections : [];
    const unreferenced = Array.isArray(content.unreferencedParagraphs) ? content.unreferencedParagraphs : [];
    const metrics = asRecord(content.metrics);
    return <div className="agent-audit"><ArtifactHeading artifact={artifact} reviewStatus={effectiveReviewStatus} /><div className={`agent-audit-risk risk-${risk}`}><ShieldAlert size={20} /><div><strong>{risk === "high" ? "高风险，等待人工复核" : risk === "medium" ? "中风险，带警告完成" : "低风险，自动批准"}</strong><span>{String(content.coverageExplanation ?? "")}</span></div></div><div className="agent-audit-grid"><Metric label="有效引用" value={String(content.validCitationCount ?? 0)} /><Metric label="无效引用" value={String(content.invalidCitationCount ?? 0)} /><Metric label="未覆盖论文" value={String(content.uncitedPaperCount ?? 0)} /><Metric label="引用覆盖" value={`${Math.round(Number(metrics.citationCoverage ?? 0) * 100)}%`} /></div>{missing.length > 0 && <AuditList title="缺失章节" values={missing} />}{unreferenced.length > 0 && <AuditList title="无依据段落" values={unreferenced} />}</div>;
  }
  return <pre className="agent-json-view">{JSON.stringify(artifact.content, null, 2)}</pre>;
}

function artifactReviewLabel(status: string | undefined, fallbackHash?: string) { return status === "approved" ? "已通过" : status === "warning" ? "有警告" : status === "needs-review" ? "待复核" : fallbackHash ? shortHash(fallbackHash) : "不可变成果"; }
function ArtifactHeading({ artifact, reviewStatus }: { artifact: AgentArtifactRecord; reviewStatus?: string }) { return <header className="agent-artifact-heading"><div><span>{artifactLabel(artifact.artifactKind)}</span><h3>{artifact.artifactKind === "report_draft" ? String(asRecord(artifact.content).topic ?? "研究报告") : artifact.artifactKind === "research_evidence" ? String(asRecord(artifact.content).topic ?? "证据包") : "报告质量审计"}</h3></div><div><span>{artifactReviewLabel(reviewStatus)}</span><code>{shortHash(artifact.contentSha256)}</code></div></header>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="agent-metric"><span>{label}</span><strong>{value}</strong></div>; }
function AuditList({ title, values }: { title: string; values: unknown[] }) { return <section className="agent-audit-list"><h4>{title}</h4>{values.map((value, index) => <p key={`${index}-${String(value)}`}><AlertTriangle size={13} />{String(value)}</p>)}</section>; }

function Inspector({ overview, pending, answer, setAnswer, busy, onApprovePlan, onRejectPlan, onApproveAction, onRejectAction, onSubmitAnswer, onApproveArtifact, onRejectArtifact, onOpenPipeline }: { overview: AgentRunOverview; pending: ReturnType<typeof pendingKind>; answer: unknown; setAnswer: (value: unknown) => void; busy: boolean; onApprovePlan: () => void; onRejectPlan: () => void; onApproveAction: () => void; onRejectAction: () => void; onSubmitAnswer: () => void; onApproveArtifact: () => void; onRejectArtifact: () => void; onOpenPipeline: () => void }) {
  const step = findPendingStep(overview);
  const question = findPendingQuestion(overview);
  const review = findPendingReviewArtifact(overview);
  if (pending === "plan" && overview.plan) return <div className="agent-inspector-content"><InspectorTitle icon={<ShieldCheck size={17} />} title="计划等待审批" subtitle={`v${overview.plan.version} · ${overview.plan.steps.length} 个步骤`} /><div className="agent-inspector-note">批准绑定当前计划版本、内容哈希和工具注册表；计划变化后批准自动失效。</div><div className="agent-inspector-list">{overview.plan.steps.map((item) => <div key={item.id}><span>{item.title}</span><small className={`risk-${item.risk}`}>{item.risk}</small></div>)}</div><div className="agent-inspector-actions"><button className="primary-action h-10" onClick={onApprovePlan} disabled={busy}><Check size={15} />批准计划</button><button className="secondary-action h-10" onClick={onRejectPlan} disabled={busy}><X size={15} />拒绝并重规划</button></div></div>;
  if (pending === "action" && step) return <div className="agent-inspector-content"><InspectorTitle icon={<ShieldAlert size={17} />} title="写动作等待审批" subtitle={`${step.toolName}@${step.toolVersion}`} /><div className={`agent-risk-banner risk-${step.risk}`}>{step.risk === "high" ? "高风险动作" : "写入动作"} · 将产生不可变 Artifact</div><dl className="agent-inspector-details"><div><dt>步骤</dt><dd>{step.title}</dd></div><div><dt>动作哈希</dt><dd><code>{shortHash(step.actionHash)}</code></dd></div><div><dt>Registry</dt><dd><code>{shortHash(step.registryHash)}</code></dd></div></dl><details className="agent-json-details"><summary>查看解析后的脱敏参数</summary><pre>{JSON.stringify(step.resolvedInput ?? step.input, null, 2)}</pre></details><div className="agent-inspector-actions"><button className="primary-action h-10" onClick={onApproveAction} disabled={busy}><Check size={15} />批准一次</button><button className="secondary-action h-10" onClick={onRejectAction} disabled={busy}><X size={15} />拒绝动作</button></div></div>;
  if (pending === "question" && question) {
    const options = Array.isArray(question.options) ? question.options.map(String) : [];
    const valid = question.answerType === "text" ? typeof answer === "string" && answer.trim().length > 0 : answer !== "" && answer !== undefined;
    return <div className="agent-inspector-content"><InspectorTitle icon={<MessageSquare size={17} />} title="需要你的判断" subtitle={question.requiresReplan ? "回答后将重新规划" : "回答后继续执行"} /><p className="agent-question-prompt">{question.prompt}</p>{question.answerType === "choice" && <div className="agent-choice-list">{options.map((option) => <label key={option}><input type="radio" name={question.id} checked={answer === option} onChange={() => setAnswer(option)} /><span>{option}</span></label>)}</div>}{question.answerType === "confirm" && <div className="agent-confirm-options"><button className={answer === true ? "active" : ""} onClick={() => setAnswer(true)}>确认</button><button className={answer === false ? "active" : ""} onClick={() => setAnswer(false)}>否定</button></div>}{question.answerType === "text" && <textarea className="field-control min-h-[140px] p-3" maxLength={4096} value={typeof answer === "string" ? answer : ""} onChange={(event) => setAnswer(event.target.value)} />}{question.requiresReplan && <div className="agent-inspector-note warning">提交后，当前计划批准将自动失效。</div>}<button className="primary-action h-10 w-full" onClick={onSubmitAnswer} disabled={busy || !valid}>提交回答</button></div>;
  }
  if (pending === "artifact_review" && review) return <div className="agent-inspector-content"><InspectorTitle icon={<FileCheck2 size={17} />} title="高风险报告待复核" subtitle={`内容哈希 ${shortHash(review.contentSha256)}`} /><div className="agent-inspector-note warning">模型不能自行宣布高风险报告完成。批准只绑定当前最新报告内容；报告变化后需重新复核。</div><div className="agent-inspector-actions"><button className="primary-action h-10" onClick={onApproveArtifact} disabled={busy}><Check size={15} />人工批准</button><button className="secondary-action h-10" onClick={onRejectArtifact} disabled={busy}><X size={15} />拒绝报告</button></div></div>;
  if (pending === "blocker") return <div className="agent-inspector-content"><InspectorTitle icon={<AlertTriangle size={17} />} title="运行等待处理" subtitle={overview.run.lastErrorCode ?? "需要用户决定"} /><div className="agent-inspector-note warning">运行不会静默继续。检查快照、预算或报告审计后，选择恢复、取消或在当前快照上创建新任务。</div>{overview.run.lastErrorCode?.includes("SNAPSHOT") && <button className="secondary-action h-10 w-full" onClick={onOpenPipeline}>检查热点建模</button>}<BudgetPanel overview={overview} /></div>;
  return <div className="agent-inspector-content"><InspectorTitle icon={<Gauge size={17} />} title="运行治理" subtitle="当前没有需要立即处理的审批" /><div className="agent-inspector-note">技术状态保持只读显示；需要审批、回答或成果复核时，此抽屉会自动打开。</div><details className="agent-technical-details"><summary>技术详情</summary><BudgetPanel overview={overview} /><dl className="agent-inspector-details"><div><dt>库修订</dt><dd>{overview.libraryRevision ?? "—"}</dd></div><div><dt>快照</dt><dd><code>{shortHash(overview.run.snapshotId)}</code></dd></div><div><dt>Token</dt><dd>{overview.modelUsage?.totalTokens.toLocaleString() ?? "0"}</dd></div><div><dt>模型耗时</dt><dd>{overview.modelUsage ? `${(overview.modelUsage.elapsedMs / 1000).toFixed(1)}s` : "—"}</dd></div><div><dt>估算费用</dt><dd>{overview.modelUsage?.estimatedCostMicrousd == null ? "未配置单价" : `$${(overview.modelUsage.estimatedCostMicrousd / 1_000_000).toFixed(4)}`}</dd></div><div><dt>计划</dt><dd>v{overview.run.currentPlanVersion ?? "—"}</dd></div><div><dt>租约</dt><dd>{overview.currentLease ? `generation ${overview.currentLease.generation}` : "未持有"}</dd></div><div><dt>更新</dt><dd>{fmtTime(overview.run.updatedAtMs)}</dd></div></dl></details></div>;
}

function InspectorTitle({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle: string }) { return <header className="agent-inspector-title"><span>{icon}</span><div><h3>{title}</h3><p>{subtitle}</p></div></header>; }
function InspectorEmpty() { return <div className="agent-inspector-empty"><Gauge size={24} /><strong>运行检查器</strong><span>选择运行后，这里会显示审批、问题、预算和成果复核。</span></div>; }
function BudgetPanel({ overview }: { overview: AgentRunOverview }) { const pairs = [["步骤", overview.run.budgetUsage.executedSteps, overview.run.budget.maxSteps], ["工具", overview.run.budgetUsage.toolCalls, overview.run.budget.maxToolCalls], ["Planner", overview.run.budgetUsage.plannerRounds, overview.run.budget.maxPlannerRounds], ["修订", overview.run.budgetUsage.reportRewrites, overview.run.budget.maxReportRewrites]] as const; return <div className="agent-budget-panel">{pairs.map(([label, used, limit]) => <div key={label}><div><span>{label}</span><strong>{used}/{limit}</strong></div><div className="agent-budget-track"><span style={{ width: `${Math.min(100, limit ? used / limit * 100 : 0)}%` }} /></div></div>)}</div>; }

function NewRunForm({ draft, setDraft, snapshotReady, snapshot, advancedOpen, setAdvancedOpen, modelTest, busy, onTest, onSubmit, onOpenPipeline }: { draft: NewRunDraft; setDraft: (value: NewRunDraft) => void; snapshotReady: boolean; snapshot: { snapshotId?: string; paperCount: number; hotspotCount: number; membershipCount: number } | null | undefined; advancedOpen: boolean; setAdvancedOpen: (value: boolean) => void; modelTest: string; busy: string; onTest: (role: "planner" | "writer") => void; onSubmit: () => void; onOpenPipeline: () => void }) {
  const updateBudget = (key: keyof AgentBudget, value: number) => setDraft({ ...draft, budget: { ...draft.budget, [key]: value } });
  const taskBlocked = !snapshotReady;
  return <div className="agent-new-run-form">
    <section className="agent-new-run-kind"><span>任务类型</span><strong>研究报告</strong><small>运行中心只创建基于真实本地证据的可审计研究报告；导入、清洗、建模和导出继续在对应专业页面完成。</small></section>
    <label className="field-label">任务目标<textarea autoFocus className="field-control min-h-[96px] p-3" maxLength={4096} value={draft.objective} onChange={(event) => setDraft({ ...draft, objective: event.target.value })} placeholder={RUN_KIND_LABELS.research_report.objective} /></label>
    <div className="agent-mode-grid"><button className={draft.mode === "supervised" ? "active" : ""} onClick={() => setDraft({ ...draft, mode: "supervised" })}><ShieldCheck size={18} /><strong>监督模式</strong><span>高风险动作逐次审批后执行。</span></button><button className={draft.mode === "advisor" ? "active" : ""} onClick={() => setDraft({ ...draft, mode: "advisor" })}><Bot size={18} /><strong>顾问模式</strong><span>只生成计划，不调用工具。</span></button></div>
    <div className={`agent-new-snapshot ${snapshotReady ? "ready" : "blocked"}`}><Database size={17} /><div><strong>{snapshotReady ? "报告将绑定当前活动快照" : "研究报告需要有效 V20 快照"}</strong><span>{snapshotReady && snapshot ? `${snapshot.paperCount.toLocaleString()} 篇论文 · ${snapshot.hotspotCount} 热点 · ${snapshot.membershipCount.toLocaleString()} 条归属` : "不会自动建模。"}</span></div>{!snapshotReady && <button onClick={onOpenPipeline}>前往建模</button>}</div>
    <button className="agent-advanced-toggle" onClick={() => setAdvancedOpen(!advancedOpen)} aria-expanded={advancedOpen}><span><ChevronDown size={15} className={advancedOpen ? "rotate-180" : ""} />高级模型、预算与成本</span><small>{profileLabel(draft.planner)}</small></button>
    {advancedOpen && <div className="agent-advanced-panel"><ModelProfileEditor title="Planner" profile={draft.planner} secret={draft.plannerSecret} onChange={(planner) => setDraft({ ...draft, planner, writer: draft.writerMatchesPlanner ? { ...planner } : draft.writer })} onSecret={(plannerSecret) => setDraft({ ...draft, plannerSecret })} onTest={() => onTest("planner")} /><label className="agent-same-model"><input type="checkbox" checked={draft.writerMatchesPlanner} onChange={(event) => setDraft({ ...draft, writerMatchesPlanner: event.target.checked, writer: event.target.checked ? { ...draft.planner } : draft.writer })} />Writer 使用相同模型配置</label>{!draft.writerMatchesPlanner && <ModelProfileEditor title="Writer" profile={draft.writer} secret={draft.writerSecret} onChange={(writer) => setDraft({ ...draft, writer })} onSecret={(writerSecret) => setDraft({ ...draft, writerSecret })} onTest={() => onTest("writer")} />}{modelTest && <div className="agent-model-test-result">{modelTest}</div>}<div className="agent-budget-editor"><BudgetInput label="最大步骤" value={draft.budget.maxSteps} maximum={20} onChange={(value) => updateBudget("maxSteps", value)} /><BudgetInput label="工具调用" value={draft.budget.maxToolCalls} maximum={24} onChange={(value) => updateBudget("maxToolCalls", value)} /><BudgetInput label="规划回合" value={draft.budget.maxPlannerRounds} maximum={24} onChange={(value) => updateBudget("maxPlannerRounds", value)} /><BudgetInput label="报告修订" value={draft.budget.maxReportRewrites} maximum={1} onChange={(value) => updateBudget("maxReportRewrites", value)} /></div></div>}
    <div className="agent-new-run-footer"><div><ShieldCheck size={15} /><span>计划、写动作和高风险成果继续由现有 Agent Runtime 审批门控制。</span></div><button className="primary-action h-11 px-5" onClick={onSubmit} disabled={taskBlocked || Boolean(busy)}>{busy === "create" ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}{draft.mode === "advisor" ? "生成顾问计划" : "生成监督计划"}</button></div>
  </div>;
}

function ModelProfileEditor({ title, profile, secret, onChange, onSecret, onTest }: { title: string; profile: AgentModelProfile; secret: string; onChange: (profile: AgentModelProfile) => void; onSecret: (secret: string) => void; onTest: () => void }) { return <section className="agent-model-editor"><header><div><strong>{title}</strong><span>{profileLabel(profile)}</span></div><button className="secondary-action h-8 px-2 text-xs" onClick={onTest}>测试连接</button></header><div className="agent-model-fields"><label className="field-label">协议<select className="field-control h-10 px-3" value={profile.protocol} onChange={(event) => onChange({ ...profile, protocol: event.target.value as AgentModelProfile["protocol"], anthropicVersion: event.target.value === "anthropic_messages" ? "2023-06-01" : undefined })}><option value="openai_chat_completions">OpenAI Chat</option><option value="openai_responses">OpenAI Responses</option><option value="anthropic_messages">Anthropic Messages</option></select></label><label className="field-label">模型<input className="field-control h-10 px-3" value={profile.model} onChange={(event) => onChange({ ...profile, model: event.target.value })} /></label><label className="field-label agent-model-url">端点<input className="field-control h-10 px-3" value={profile.baseUrl} onChange={(event) => onChange({ ...profile, baseUrl: event.target.value })} /></label><label className="field-label">API Key<input className="field-control h-10 px-3" type="password" value={secret} onChange={(event) => onSecret(event.target.value)} placeholder="留空则使用已保存凭据" /></label><label className="field-label">输入单价 / 百万 Token<input className="field-control h-10 px-3" type="number" min="0" step="0.01" value={profile.inputUsdPerMillion ?? ""} onChange={(event) => onChange({ ...profile, inputUsdPerMillion: event.target.value ? Number(event.target.value) : undefined })} placeholder="可选" /></label><label className="field-label">输出单价 / 百万 Token<input className="field-control h-10 px-3" type="number" min="0" step="0.01" value={profile.outputUsdPerMillion ?? ""} onChange={(event) => onChange({ ...profile, outputUsdPerMillion: event.target.value ? Number(event.target.value) : undefined })} placeholder="可选" /></label></div><div className="agent-model-options"><label><input type="checkbox" checked={profile.nativeStructuredOutput} onChange={(event) => onChange({ ...profile, nativeStructuredOutput: event.target.checked })} />原生结构化输出</label><label><input type="checkbox" checked={profile.allowLocalHttp} onChange={(event) => onChange({ ...profile, allowLocalHttp: event.target.checked })} />允许本机 HTTP</label></div></section>; }
function BudgetInput({ label, value, maximum, onChange }: { label: string; value: number; maximum: number; onChange: (value: number) => void }) { return <label><span>{label}</span><input type="number" min={1} max={maximum} value={value} onChange={(event) => onChange(Math.max(1, Math.min(maximum, Number(event.target.value) || 1)))} /><small>上限 {maximum}</small></label>; }

function AgentModal({ open, title, onClose, wide = false, children }: { open: boolean; title: string; onClose: () => void; wide?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement | null>(null);
  useEffect(() => { const dialog = ref.current; if (!dialog) return; if (open && !dialog.open) dialog.showModal(); if (!open && dialog.open) dialog.close(); }, [open]);
  return <dialog ref={ref} className={`agent-dialog ${wide ? "wide" : ""}`} onCancel={(event) => { event.preventDefault(); onClose(); }}><header><h2>{title}</h2><button className="agent-icon-button" onClick={onClose} aria-label="关闭对话框"><X size={16} /></button></header><div className="agent-dialog-body">{children}</div></dialog>;
}

function SafeMarkdown({ content }: { content: string }) {
  const lines = content.split("\n");
  const nodes: ReactNode[] = [];
  let list: string[] = [];
  const flushList = () => {
    if (!list.length) return;
    const items = list;
    list = [];
    nodes.push(<ul key={`list-${nodes.length}`}>{items.map((value, index) => <li key={index}>{inlineMarkdown(value)}</li>)}</ul>);
  };
  lines.forEach((raw, index) => {
    const line = raw.trim();
    if (/^[-*] /.test(line)) { list.push(line.slice(2)); return; }
    flushList();
    if (!line) return;
    if (line.startsWith("### ")) nodes.push(<h4 key={index}>{inlineMarkdown(line.slice(4))}</h4>);
    else if (line.startsWith("## ")) nodes.push(<h3 key={index}>{inlineMarkdown(line.slice(3))}</h3>);
    else if (line.startsWith("# ")) nodes.push(<h2 key={index}>{inlineMarkdown(line.slice(2))}</h2>);
    else nodes.push(<p key={index}>{inlineMarkdown(line)}</p>);
  });
  flushList();
  return <article className="agent-markdown">{nodes}</article>;
}

function inlineMarkdown(value: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*/g;
  let cursor = 0;
  for (const match of value.matchAll(pattern)) {
    if (match.index! > cursor) parts.push(value.slice(cursor, match.index));
    if (match[3]) parts.push(<strong key={`${match.index}-strong`}>{match[3]}</strong>);
    else {
      const url = safeExternalUrl(match[2]);
      parts.push(url ? <button className="agent-inline-link" key={`${match.index}-link`} onClick={() => void openExternalUrl(url)}>{match[1]}</button> : <span key={`${match.index}-unsafe`}>{match[1]}</span>);
    }
    cursor = match.index! + match[0].length;
  }
  if (cursor < value.length) parts.push(value.slice(cursor));
  return parts;
}

function asRecord(value: unknown): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }
