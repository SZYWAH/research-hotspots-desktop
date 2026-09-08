import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Atom,
  BookOpen,
  Bot,
  Check,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  Copy,
  Database,
  Download,
  Edit3,
  FileText,
  FileCode2,
  FileUp,
  FolderKanban,
  FlaskConical,
  Globe2,
  Home,
  Loader2,
  ListChecks,
  Link2,
  LocateFixed,
  MoreHorizontal,
  Network,
  Orbit,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Square,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import * as THREE from "three";

import {
  App17GalaxyCanvas,
  type GalaxyExplorationState,
  type GalaxyPaperInspectionMode,
  type GalaxyPaperPanelState,
  type GalaxyPaperFocusState,
  type GalaxyPaperDetailCacheState,
  type GalaxyPerformanceSnapshot,
  type GalaxyReviewCameraPreset,
  type GalaxyCameraPose,
  type GalaxySystemViewMode,
  type GalaxyContextRailMode,
} from "./components/App17GalaxyCanvas";
import { AgentWorkspace } from "./components/AgentWorkspace";
import { DocumentReaderShell } from "./components/DocumentReaderShell";
import {
  AgentDualBackgroundPage,
  type AgentPromptSubmitEvent,
  type SideraConversationTurn,
} from "./components/AgentDualBackgroundPage";
import { SideraSplash, type SideraBootPhase } from "./components/SideraSplash";
import { SideraTitleBar } from "./components/SideraTitleBar";
import { WorkbenchSideSheet } from "./components/WorkbenchSideSheet";
import type { BundledPdfJsModule } from "./lib/documentPdfJsAdapter";
import type {
  DocumentEvidenceAnchor,
  DocumentIndexSnapshot,
  SideraReadingContextScope,
} from "./lib/documentReaderContract";
import { createDesktopDocumentReaderComposition } from "./lib/documentReaderDesktopService";
import { readAgentVisualReviewScenario } from "./lib/agentVisualReview";
import {
  agentBackgroundLibraryIdentity,
  agentBackgroundMountKey,
  isCurrentAgentBackgroundEpoch,
  transitionAgentBackgroundLibrary,
  type AgentBackgroundLibraryLifecycle,
} from "./lib/agentBackgroundLifecycle";
import type {
  SideraNavigationLayout,
  SideraPipelineSpatialState,
  SideraShellScene,
} from "./lib/sideraShell";
import {
  abortSideraPiTurn,
  decideSideraToolApproval,
  describeSideraPiError,
  getSideraPiSessionStats,
  listenSideraPiEvents,
  startSideraPiSession,
  stopSideraPiSession,
  submitSideraPiPrompt,
  type SideraPiSessionInfo,
  type SideraSessionStats,
  type SideraToolApprovalRequest,
} from "./lib/sideraPi";
import {
  archiveSideraConversation,
  checkSideraAgentLocalReadiness,
  conversationTurnsFromSnapshot,
  createSideraConversation,
  deleteSideraConversation,
  listSideraConversations,
  openRecentSideraConversation,
  openSideraConversation,
  renameSideraConversation,
  restoreSideraConversation,
  upsertSideraConversationTurn,
  type SideraConversationSnapshot,
  type SideraConversationSummary,
  type SideraAgentLocalReadiness,
} from "./lib/sideraConversations";
import {
  SIDERA_INSTITUTION_ACADEMIC_ADAPTER_ID,
  SIDERA_INSTITUTION_CATALOG_ADAPTER_ID,
  SIDERA_RESEARCH_ACADEMIC_CONNECTOR_ID,
  beginSideraInstitutionConnection,
  cancelSideraInstitutionSessionRestore,
  cancelSideraResearchSearch,
  cancelSideraInstitutionConnection,
  cancelSideraInstitutionAuth,
  cancelSideraInstitutionBrowserAuth,
  cancelSideraInstitutionDownload,
  cancelSideraInstitutionSearch,
  closeSideraInstitutionBrowserTab,
  createSideraInstitutionBrowserTab,
  ensureSideraInstitutionSession,
  ensureSideraInstitutionBrowser,
  getSideraInstitutionBrowserState,
  getSideraInstitutionSessionState,
  getSideraResearchSearchState,
  goBackSideraInstitutionBrowser,
  goForwardSideraInstitutionBrowser,
  listenSideraInstitutionBrowser,
  listenSideraInstitutionDownloads,
  listenSideraInstitutionSearch,
  listenSideraInstitutionSession,
  listenSideraResearchSearch,
  navigateSideraInstitutionBrowserTab,
  listSideraInstitutionDownloads,
  openSideraInstitutionCurrentSource,
  openSideraInstitutionDownload,
  openSideraInstitutionResult,
  openSideraResearchResult,
  probeSideraInstitution,
  reloadSideraInstitutionBrowser,
  revealSideraInstitutionDownload,
  resetSideraInstitutionBrowser,
  resetSideraInstitutionSession,
  restoreSideraInstitutionSession,
  retrySideraInstitutionDownload,
  selectSideraInstitutionBrowserTab,
  setSideraInstitutionBrowserShellBounds,
  setSideraInstitutionBrowserShellVisible,
  setSideraInstitutionBrowserVisible,
  shouldAcceptSideraResearchSearchState,
  shouldAcceptSideraInstitutionSearchEvent,
  sideraResearchSearchStateCursor,
  sideraInstitutionSearchStreamKey,
  startSideraInstitutionSearch,
  startSideraResearchSearch,
  stopSideraInstitutionBrowser,
  type SideraInstitutionCapabilityStatus,
  type SideraInstitutionAuthKind,
  type SideraInstitutionAuthState,
  type SideraInstitutionAuthStatus,
  type SideraInstitutionClientStatus,
  type SideraInstitutionEndpointStatus,
  type SideraInstitutionProbeResult,
  type SideraInstitutionBrowserState,
  type SideraInstitutionDownloadRecord,
  type SideraInstitutionSearchSnapshot,
  type SideraInstitutionSearchSource,
  type SideraInstitutionSessionState,
  type SideraInstitutionSearchEventCursor,
  type SideraNormalizedCandidateDraft,
  type SideraResearchSearchEventCursor,
  type SideraResearchSearchFilters,
  type SideraResearchSearchStartReason,
  type SideraResearchSearchState,
  type SideraResearchSearchSnapshot,
} from "./lib/sideraInstitution";
import {
  SIDERA_INSTITUTION_BROWSER_DEFAULT_RATIO,
  SIDERA_INSTITUTION_BROWSER_DIVIDER_WIDTH,
  SIDERA_INSTITUTION_BROWSER_LAYOUT_STORAGE_KEY,
  parseSideraInstitutionBrowserLayout,
  resolveSideraInstitutionSplitLayout,
  serializeSideraInstitutionBrowserLayout,
  type SideraInstitutionBrowserPresentation,
  type SideraInstitutionNarrowPane,
} from "./lib/sideraInstitutionLayout";
import {
  orderSideraResearchCandidates,
  paginateSideraResearchCandidates,
  shouldResetSideraResearchPresentation,
  sideraResearchFiltersAreActive,
  sideraResearchSnapshotKey,
  toggleSideraResearchPageSelection,
  type SideraResearchDisplayOrder,
} from "./lib/sideraResearchPresentation";

const SIDERA_AGENT_MOUNT_DEADLINE_MS = 20_000;
const SIDERA_IMMERSIVE_VISUAL_SOURCE_MISSING = "AGENT_IMMERSIVE_VISUAL_SOURCE_MISSING";

function isMissingImmersiveVisualSource(message: string) {
  return message.includes(SIDERA_IMMERSIVE_VISUAL_SOURCE_MISSING);
}

const documentReaderComposition = createDesktopDocumentReaderComposition({
  loadPdfJs: async () => await import("pdfjs-dist") as unknown as BundledPdfJsModule,
  workerUrl: pdfWorkerUrl,
  parserVersion: "pdfjs-dist@5.4.149",
});

const threeConsole = (THREE as unknown as {
  setConsoleFunction?: (handler: ((type: string, message: string, ...args: unknown[]) => void) | null) => void;
}).setConsoleFunction;

threeConsole?.((type, message, ...args) => {
  if (type === "warn" && message === "THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.") return;
  if (type === "error") {
    console.error(message, ...args);
    return;
  }
  if (type === "warn") {
    console.warn(message, ...args);
    return;
  }
  console.log(message, ...args);
});

import {
  clearTaskLogs,
  approveReport,
  countIndexedDbPapers,
  createProject,
  deleteProject,
  exportBackupData,
  forEachIndexedDbPaperBatch,
  getActiveProject,
  getAiSettings,
  getAllTaskLogs,
  getHotspots,
  getPipelineJobs,
  getProjects,
  getReports,
  getTaskLogs,
  importMarkdownReports,
  replaceHotspots,
  replaceV20HotspotCache,
  replacePaperLibrary,
  reconcileInterruptedAiTaskLogs,
  renameProject,
  restoreBackupData,
  saveAiSettings,
  saveHotspot,
  saveReport,
  saveReportWithTaskLog,
  saveTaskLog,
  seedResearchDataIfEmpty,
  setActiveProject as activateProject,
  updatePipelineJob,
} from "./data/researchStore";
import {
  generateBilingualKeyword,
  generateResearchReport,
  reviseResearchReport,
  testAiConnection,
} from "./ai/deepseek";
import { searchAcademicSources } from "./lib/searchSources";
import { deriveAnalysisProgress } from "./lib/analysisProgress";
import { buildOfflineHotspotReport, formatHotspotEvidenceMarkdown, hotspotEvidenceToPapers } from "./lib/hotspotEvidenceReport";
import {
  loadPersistedHotspotEvidence,
  type HotspotEvidenceDiagnostics,
  type HotspotEvidenceLoadStatus,
} from "./lib/hotspotEvidenceLoader";
import {
  backupPaperLibrary,
  cancelAiTask,
  chooseChromeDriverFile,
  chooseExportDirectory,
  choosePaperImportFile,
  choosePdfFile,
  chooseSqliteBackupFile,
  cloneImportReviewBatch,
  confirmDesktopAction,
  controlPaperFileImport,
  controlSemanticModeling,
  createImportReviewBatch,
  createImportReviewBatchFromSearch,
  deletePapersFromLibrary,
  discardImportReviewBatch,
  executeImportReviewCommit,
  getApp17GalaxyPayload,
  getImportReviewCommitStatus,
  getV20GalaxyPayload,
  getV20HotspotSnapshot,
  getLibraryMutationStatus,
  getLibrarySetupState,
  getSemanticEmbeddingCapabilities,
  getSemanticModelingStatus,
  getPaperLibraryFacets,
  getPaperLibraryStatus,
  getAppCredentialStatus,
  getPapersByIds,
  getDemoPaperSamplePath,
  isGalaxyVisualReviewMode,
  isDesktopRuntime,
  initializeLibrary,
  prepareLibraryDatabase,
  inspectPaperLibraryBackup,
  getPaperDocumentSnapshot,
  importLocalPaperDocument,
  attachInstitutionDownloadToPaper,
  armImportReadFaultFixture,
  openInstitutionPaperSource,
  listImportReviewBatches,
  listImportReviewCommitHistory,
  loadApp17Galaxy,
  openExternalUrl,
  openPaperDocumentVersion,
  openImportReviewBatch,
  prepareImportReviewCommit,
  queryPaperLibrary,
  readMarkdownExports,
  runCleanerWorker,
  runClusterWorker,
  runDesktopHealthCheck,
  runLibraryCleanerWorker,
  runLibraryClusterWorker,
  setAppCredential,
  runLibraryPressureTest,
  startPaperFileImport,
  startMysqlPaperImport,
  restorePaperLibrary,
  rollbackImportReviewCommit,
  clearImportReadFaultFixture,
  saveImportReviewDecision,
  validateLibraryLocation,
  upsertPaperLibrary,
  writeTextFile,
  type DesktopHealthResult,
  type LibraryLocationValidation,
  type LibraryPressureTestResult,
  type LibrarySetupMode,
  type LibrarySetupState,
  type LibraryMutationStatus,
  type InitializeLibraryResult,
  type PaperFileImportProgress,
  type SideraImportCommitHistory,
  type SideraImportCommitPreview,
  type SideraImportCommitResult,
  type SideraImportCommitStatus,
  type SideraImportRollbackResult,
  type SideraImportCandidate,
  type SideraImportDecisionKind,
  type SideraImportReadFaultTarget,
  type SideraImportReviewBatch,
  type SideraDocumentVersionKind,
  type SideraPaperDocumentSnapshot,
  type SideraPaperSourceRecord,
  type SemanticEmbeddingCapabilities,
  type SemanticModelingStatus,
} from "./lib/desktop";
import { formatDateTime, nowIso } from "./lib/dates";
import { analyzePaperImport } from "./lib/importers";
import { auditReport, buildReportEvidenceProfile, evaluateReportQuality, reportToHtml } from "./lib/references";
import type {
  ActiveView,
  AiSettings,
  AiParameterTemplate,
  App17GalaxyHotspotPoint,
  App17GalaxyPayload,
  DataBackup,
  DashboardData,
  Hotspot,
  HotspotEvidenceBundle,
  ImportPreview,
  Paper,
  PaperLibraryFacets,
  PaperLibraryStatus,
  PaperQueryInput,
  PaperQueryResult,
  PipelineJob,
  Project,
  ReportAudit,
  ReportGenerationOptions,
  ResearchReport,
  SearchOptions,
  SourceKind,
  TaskLog,
  V20HotspotSnapshot,
} from "./types";
import { DISCIPLINES } from "./types";

const navItems: Array<{ id: ActiveView; label: string; icon: LucideIcon; hint: string }> = [
  { id: "dashboard", label: "总览", icon: Home, hint: "流程与状态" },
  { id: "agent", label: "研究 Agent", icon: Bot, hint: "监督式研究" },
  { id: "search", label: "文献工作台", icon: Search, hint: "检索与导入" },
  { id: "pipeline", label: "分析流水线", icon: Activity, hint: "清洗与建模" },
  { id: "galaxy", label: "科研星图", icon: Orbit, hint: "热点空间" },
  { id: "hotspots", label: "热点库", icon: Atom, hint: "编辑与报告" },
  { id: "reports", label: "报告库", icon: FileText, hint: "历史产物" },
  { id: "logs", label: "任务日志", icon: Database, hint: "输入输出" },
  { id: "health", label: "健康检查", icon: ShieldCheck, hint: "系统诊断" },
  { id: "about", label: "关于", icon: BookOpen, hint: "架构依赖" },
  { id: "settings", label: "设置", icon: Settings, hint: "模型目录" },
];

const sourceOptions: Array<{ id: SourceKind; label: string; description: string }> = [
  { id: "openalex", label: "OpenAlex", description: "开放学术知识图谱" },
  { id: "arxiv", label: "arXiv", description: "预印本与前沿论文" },
  { id: "cnki", label: "CNKI", description: "桌面端后台检索" },
];

const paperSourceOptions: Array<{ value: SourceKind; label: string }> = [
  { value: "openalex", label: "OpenAlex" },
  { value: "arxiv", label: "arXiv" },
  { value: "cnki", label: "CNKI" },
  { value: "local", label: "本地导入" },
  { value: "institution", label: "机构资源" },
];

const defaultReportOptions: ReportGenerationOptions = {
  structure: "standard",
  targetLength: "medium",
  citationDensity: "medium",
  tone: "formal",
  includeFutureDirections: true,
};

const reportTemplates: AiParameterTemplate[] = [
  {
    id: "quick-draft",
    name: "快速草稿",
    description: "中等篇幅、标准结构、适合先看方向。",
    options: { structure: "standard", targetLength: "short", citationDensity: "medium", tone: "draft", includeFutureDirections: true },
  },
  {
    id: "strict-review",
    name: "严谨综述",
    description: "高引用密度、正式语气、适合课程设计正文。",
    options: { structure: "problem-method", targetLength: "medium", citationDensity: "high", tone: "formal", includeFutureDirections: true },
  },
  {
    id: "long-depth",
    name: "长篇深度报告",
    description: "长篇、比较结构、强化证据差异和未来方向。",
    options: { structure: "comparison", targetLength: "long", citationDensity: "high", tone: "critical", includeFutureDirections: true },
  },
];

const reportTemplateStorageKey = "research-hotspots-report-templates-v7";
const importRecoveryGuidance = {
  safeToRerun: true,
  batchSize: 1000,
  strategy: "如果导入中断或被取消，可重新选择同一个源文件执行大文件直导；已写入的记录会更新，未写入的记录会继续插入。",
};

type ImportJobState = {
  status: "running" | "paused" | "cancelled" | "done" | "failed";
  total: number;
  written: number;
  inserted: number;
  updated: number;
  invalidRows?: number;
  duplicateRows?: number;
  startedAt: number;
  taskId?: string;
  fileName?: string;
  message?: string;
  recovery?: typeof importRecoveryGuidance;
};

type SearchFocusIntent = {
  query: string;
  field?: string;
  paperId?: string;
  timestamp: number;
};

type AppNoticeKind = "success" | "info" | "error";
type AppNoticeScope = "institution-sso" | "institution-search" | "import-review";

type AppNotice = {
  id: number;
  message: string;
  kind: AppNoticeKind;
  scope?: AppNoticeScope;
  scopeRevision?: number;
  dismissAfterMs?: number;
};

type AppNoticeHandler = (
  message: string,
  kind?: AppNoticeKind,
  options?: { scope?: AppNoticeScope; scopeRevision?: number; dismissAfterMs?: number },
) => void;

type AppNoticeScopeClearHandler = (scope: AppNoticeScope) => number;

type ImportReviewReadDiagnostic = {
  state: "idle" | "ready" | "error";
  message?: string;
};

type ImportReviewReadDiagnostics = {
  batches: ImportReviewReadDiagnostic;
  status: ImportReviewReadDiagnostic;
  history: ImportReviewReadDiagnostic;
};

type SideraAgentActivityStatus =
  | "idle"
  | "generating"
  | "awaiting-approval"
  | "complete"
  | "failed";

type SideraAgentTerminalActivity = Extract<SideraAgentActivityStatus, "complete" | "failed"> | null;

type SideraAgentActivity = {
  status: SideraAgentActivityStatus;
  label: string;
  canStop: boolean;
};

function resolveSideraAgentActivity(input: {
  generating: boolean;
  toolApproval: SideraToolApprovalRequest | null;
  terminal: SideraAgentTerminalActivity;
}): SideraAgentActivity {
  if (input.toolApproval) {
    return { status: "awaiting-approval", label: "Agent 等待工具审批", canStop: false };
  }
  if (input.generating) {
    return { status: "generating", label: "Agent 正在回答", canStop: true };
  }
  if (input.terminal === "complete") {
    return { status: "complete", label: "Agent 回答已完成", canStop: false };
  }
  if (input.terminal === "failed") {
    return { status: "failed", label: "Agent 回答失败", canStop: false };
  }
  return { status: "idle", label: "", canStop: false };
}

type HotspotFocusIntent = {
  hotspotId: string;
  timestamp: number;
};

type DocumentEvidenceFocusIntent = {
  paperId: string;
  versionId: string;
  title: string;
  anchor: DocumentEvidenceAnchor;
  timestamp: number;
};

type LiteratureWorkspaceTab = "library" | "institution" | "ingest" | "analysis";

type PaperLibraryBootstrapSnapshot = {
  identity: string;
  databasePath: string;
  projectId: string;
  libraryRevision: number;
  facets: PaperLibraryFacets;
  page: PaperQueryResult;
};

type PaperDocumentPanelLoadResult = {
  snapshot: SideraPaperDocumentSnapshot;
  downloads: SideraInstitutionDownloadRecord[];
};

type PipelineStepId = "prepare" | "clean" | "cluster" | "result";

type PipelineStepState = "pending" | "running" | "done" | "failed";

const PIPELINE_EXECUTION_SESSION_ID = globalThis.crypto?.randomUUID?.()
  ?? `pipeline-${Date.now()}-${Math.random().toString(36).slice(2)}`;

type GalaxyLoadPhase = "idle" | "cache" | "mysql" | "ready" | "error";

type GalaxySessionState = {
  payload: App17GalaxyPayload | null;
  loading: boolean;
  error: string;
  notice: string;
  phase: GalaxyLoadPhase;
};

type GalaxyVisualReviewIntent = {
  field?: string;
  topic?: number;
  paperId?: string;
  stage: "overview" | "system" | "paper";
  preset?: GalaxyReviewCameraPreset;
};

function readGalaxyVisualReviewIntent(): GalaxyVisualReviewIntent | undefined {
  if (!isGalaxyVisualReviewMode() || typeof window === "undefined") return undefined;
  const params = new URLSearchParams(window.location.search);
  const parsedTopic = Number(params.get("topic"));
  const requestedStage = params.get("stage");
  const requestedPreset = params.get("preset");
  const preset: GalaxyReviewCameraPreset | undefined = requestedPreset === "global"
    || requestedPreset === "interwoven"
    || requestedPreset === "system-small"
    || requestedPreset === "system-medium"
    || requestedPreset === "system-large"
    ? requestedPreset
    : undefined;
  return {
    field: params.get("field")?.trim() || undefined,
    topic: params.has("topic") && Number.isFinite(parsedTopic) ? parsedTopic : undefined,
    paperId: params.get("paperId")?.trim() || undefined,
    stage: requestedStage === "system" || requestedStage === "paper" ? requestedStage : "overview",
    preset,
  };
}

function formatVisualReviewTimestamp(value?: string) {
  if (!value) return "未知时间";
  const unixMatch = /^unix-ms:(\d+)$/.exec(value);
  const date = unixMatch ? new Date(Number(unixMatch[1])) : new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false });
}

const EMPTY_GALAXY_SESSION: GalaxySessionState = {
  payload: null,
  loading: false,
  error: "",
  notice: "",
  phase: "idle",
};

function galaxySessionCacheKey(databaseDir: string, projectId: string) {
  return `${databaseDir.trim().toLowerCase()}::${projectId}`;
}

function normalizePaperLibraryPath(value?: string) {
  return (value ?? "").trim().replace(/\\/g, "/").toLowerCase();
}

function paperLibraryReadIdentity(databasePath: string, projectId: string, libraryRevision: number) {
  return `${normalizePaperLibraryPath(databasePath)}::${projectId}::r${libraryRevision}`;
}

function paperLibraryQueryKey(identity: string, input: PaperQueryInput) {
  return JSON.stringify([
    identity,
    input.query?.trim() ?? "",
    input.source ?? "all",
    input.field ?? "all",
    input.year ?? null,
    input.limit ?? 20,
    input.offset ?? 0,
    input.sort ?? "newest",
  ]);
}

function paperPageFromBootstrap(
  bootstrap: PaperLibraryBootstrapSnapshot | null,
  input: PaperQueryInput,
) {
  if (!bootstrap) return null;
  if (
    input.query?.trim()
    || (input.source && input.source !== "all")
    || (input.field && input.field !== "all")
    || input.year !== undefined
    || (input.sort && input.sort !== "newest")
  ) return null;
  const limit = Math.max(1, input.limit ?? 20);
  const offset = Math.max(0, input.offset ?? 0);
  const requiredRows = Math.min(bootstrap.page.total, offset + limit);
  if (offset < bootstrap.page.total && requiredRows > bootstrap.page.rows.length) return null;
  return {
    rows: bootstrap.page.rows.slice(offset, offset + limit),
    total: bootstrap.page.total,
    limit,
    offset,
    queryMs: bootstrap.page.queryMs,
  } satisfies PaperQueryResult;
}

type SharedInFlightRequest<T> = {
  promise: Promise<T>;
  started: boolean;
};

function shareInFlight<T>(
  requests: Map<string, Promise<T>>,
  key: string,
  start: () => Promise<T>,
): SharedInFlightRequest<T> {
  const current = requests.get(key);
  if (current) return { promise: current, started: false };
  const promise = start();
  requests.set(key, promise);
  const clear = () => {
    if (requests.get(key) === promise) requests.delete(key);
  };
  void promise.then(clear, clear);
  return { promise, started: true };
}

const paperLibraryPageRequests = new Map<string, Promise<PaperQueryResult>>();
const paperDocumentPanelRequests = new Map<string, Promise<PaperDocumentPanelLoadResult>>();

function requestPaperLibraryPageOnce(identity: string, input: PaperQueryInput) {
  return shareInFlight(
    paperLibraryPageRequests,
    paperLibraryQueryKey(identity, input),
    () => queryPaperLibrary(input),
  );
}

function requestPaperDocumentPanelOnce(input: {
  databaseDir?: string;
  projectId: string;
  paperId: string;
  refreshRevision: number;
}) {
  const key = JSON.stringify([
    normalizePaperLibraryPath(input.databaseDir),
    input.projectId,
    input.paperId,
    input.refreshRevision,
  ]);
  return shareInFlight(
    paperDocumentPanelRequests,
    key,
    async () => {
      const [snapshot, downloads] = await Promise.all([
        getPaperDocumentSnapshot({
          databaseDir: input.databaseDir,
          projectId: input.projectId,
          paperId: input.paperId,
        }),
        listSideraInstitutionDownloads(),
      ]);
      return { snapshot, downloads };
    },
  ).promise;
}

export default function App() {
  const galaxyVisualReview = isGalaxyVisualReviewMode();
  const agentVisualReviewScenario = useMemo(readAgentVisualReviewScenario, []);
  const galaxyVisualReviewIntent = useMemo(readGalaxyVisualReviewIntent, []);
  const bypassSideraBoot = galaxyVisualReview || Boolean(agentVisualReviewScenario);
  const [activeView, setActiveView] = useState<ActiveView>(() => galaxyVisualReview ? "galaxy" : "agent");
  const [galaxyVisited, setGalaxyVisited] = useState(galaxyVisualReview);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [libraryBootstrap, setLibraryBootstrap] = useState<PaperLibraryBootstrapSnapshot | null>(null);
  const [libraryStatus, setLibraryStatus] = useState<PaperLibraryStatus | null>(null);
  const [librarySetupState, setLibrarySetupState] = useState<LibrarySetupState | null>(null);
  const [librarySetupRequired, setLibrarySetupRequired] = useState(false);
  const [libraryFacets, setLibraryFacets] = useState<PaperLibraryFacets | null>(null);
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [v20Snapshot, setV20Snapshot] = useState<V20HotspotSnapshot | null>(null);
  const [libraryMutationStatus, setLibraryMutationStatus] = useState<LibraryMutationStatus | null>(null);
  const [reports, setReports] = useState<ResearchReport[]>([]);
  const [jobs, setJobs] = useState<PipelineJob[]>([]);
  const [taskLogs, setTaskLogs] = useState<TaskLog[]>([]);
  const [allTaskLogs, setAllTaskLogs] = useState<TaskLog[]>([]);
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [piConversationTurns, setPiConversationTurns] = useState<SideraConversationTurn[]>([]);
  const [piConversations, setPiConversations] = useState<SideraConversationSummary[]>([]);
  const [piActiveConversation, setPiActiveConversation] = useState<SideraConversationSummary | null>(null);
  const [piConversationLoading, setPiConversationLoading] = useState(false);
  const [piSessionStats, setPiSessionStats] = useState<SideraSessionStats | null>(null);
  const [piToolApproval, setPiToolApproval] = useState<SideraToolApprovalRequest | null>(null);
  const [piGenerating, setPiGenerating] = useState(false);
  const [piConversationError, setPiConversationError] = useState("");
  const [piAgentTerminalActivity, setPiAgentTerminalActivity] =
    useState<SideraAgentTerminalActivity>(null);
  const [searchFocusIntent, setSearchFocusIntent] = useState<SearchFocusIntent | null>(null);
  const [documentEvidenceFocusIntent, setDocumentEvidenceFocusIntent] =
    useState<DocumentEvidenceFocusIntent | null>(null);
  const [literatureWorkspaceTab, setLiteratureWorkspaceTab] = useState<LiteratureWorkspaceTab | null>(null);
  const [documentReaderActive, setDocumentReaderActive] = useState(false);
  const [documentIndexActivity, setDocumentIndexActivity] = useState<DocumentIndexSnapshot | null>(null);
  const [institutionSession, setInstitutionSession] = useState<SideraInstitutionSessionState | null>(null);
  const [institutionSearchSnapshots, setInstitutionSearchSnapshots] = useState<
    Record<SideraInstitutionSearchSource, SideraInstitutionSearchSnapshot | null>
  >({ "academic-discovery": null, catalog: null });
  const [researchSearchState, setResearchSearchState] = useState<SideraResearchSearchState | null>(null);
  const [researchSearchQuery, setResearchSearchQuery] = useState("人工智能");
  const [selectedResearchCandidateIds, setSelectedResearchCandidateIds] = useState<string[]>([]);
  const [institutionBrowserPresentation, setInstitutionBrowserPresentation] =
    useState<SideraInstitutionBrowserPresentation>("closed");
  const [institutionTerminalActivity, setInstitutionTerminalActivity] = useState<"complete" | "failed" | null>(null);
  const [hotspotFocusIntent, setHotspotFocusIntent] =
    useState<HotspotFocusIntent | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<AppNotice | null>(null);
  const [agentNavigationOpen, setAgentNavigationOpen] = useState(false);
  const [edgeNavigationPhase, setEdgeNavigationPhase] = useState<"idle" | "arming" | "open">("idle");
  const [edgeNavigationOpenedBy, setEdgeNavigationOpenedBy] = useState<"edge" | "keyboard" | null>(null);
  const [titleBarToolsHost, setTitleBarToolsHost] = useState<HTMLDivElement | null>(null);
  const [windowGeometryTransitionActive, setWindowGeometryTransitionActive] = useState(false);
  const [sideraBootPhase, setSideraBootPhase] = useState<SideraBootPhase>(
    bypassSideraBoot ? "ready" : "booting-data",
  );
  const [sideraSplashMounted, setSideraSplashMounted] = useState(!bypassSideraBoot);
  const [sideraSplashExiting, setSideraSplashExiting] = useState(false);
  const [sideraBootStatusVisible, setSideraBootStatusVisible] = useState(false);
  const [sideraBootError, setSideraBootError] = useState("");
  const [sideraStaticBackground, setSideraStaticBackground] = useState(false);
  const [sideraStaticFallbackAllowed, setSideraStaticFallbackAllowed] = useState(false);
  const [sideraBootRevision, setSideraBootRevision] = useState(0);
  const [agentMountRevision, setAgentMountRevision] = useState(0);
  const [pipelineSpatialState, setPipelineSpatialState] = useState<SideraPipelineSpatialState>({
    active: false,
    progress: 0,
    paused: false,
  });
  const sideraBootStartedAtRef = useRef(performance.now());
  const sideraSplashMountedRef = useRef(!bypassSideraBoot);
  const sideraAgentStartupSettledRef = useRef(bypassSideraBoot);
  const sideraAgentFirstFrameReadyRef = useRef(bypassSideraBoot);
  const sideraMissingVisualFallbackStartedRef = useRef(false);
  const agentBackgroundLifecycleRef = useRef<AgentBackgroundLibraryLifecycle>({
    identity: "",
    epoch: 0,
  });
  const edgeNavigationTimerRef = useRef<number | null>(null);
  const edgeNavigationCloseTimerRef = useRef<number | null>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const institutionWorkbenchScrollTopRef = useRef(0);
  const institutionBrowserImmersiveActiveRef = useRef(false);
  const galaxySessionsRef = useRef(new Map<string, GalaxySessionState>());
  const galaxyRequestsRef = useRef(new Map<string, Promise<void>>());
  const refreshRequestSequenceRef = useRef(0);
  const piSessionRef = useRef<SideraPiSessionInfo | null>(null);
  const piActiveConversationRef = useRef<SideraConversationSummary | null>(null);
  const piConversationTurnsRef = useRef<SideraConversationTurn[]>([]);
  const piCheckpointTimerRef = useRef(0);
  const piPendingCheckpointIdsRef = useRef(new Set<string>());
  const piConversationScopeRevisionRef = useRef(0);
  const piActiveTurnRef = useRef<{ sessionId: string; messageId: string; revision: number } | null>(null);
  const piTurnSettledWaitersRef = useRef(new Set<() => void>());
  const piLastEventSequenceRef = useRef(0);
  const piConfigKeyRef = useRef("");
  const activeViewRef = useRef(activeView);
  const piAgentActivityTimerRef = useRef(0);
  const institutionActivityTimerRef = useRef(0);
  const institutionSearchEventCursorsRef = useRef(
    new Map<string, SideraInstitutionSearchEventCursor>(),
  );
  const institutionSessionRef = useRef<SideraInstitutionSessionState | null>(null);
  const institutionRestoreAttemptedRef = useRef(false);
  const researchSearchEventCursorRef = useRef<SideraResearchSearchEventCursor | null>(null);
  const researchSearchStateRef = useRef<SideraResearchSearchState | null>(null);
  const researchSearchSubmitRef = useRef<{
    query: string;
    requestKey: string;
    startReason: SideraResearchSearchStartReason;
    clientRequestId: string;
    pending: boolean;
  } | null>(null);
  const researchDisplayedSnapshotKeyRef = useRef<string | null>(null);
  const noticeSequenceRef = useRef(0);
  const noticeScopeRevisionsRef = useRef(new Map<AppNoticeScope, number>());
  const [, refreshGalaxySessions] = useState(0);
  const piDatabaseDir = libraryStatus?.databaseDir.trim()
    || settings?.databaseDir.trim()
    || "";

  useEffect(() => {
    if (
      !settings
      || !activeProject
      || agentBackgroundLifecycleRef.current.identity
    ) return;
    agentBackgroundLifecycleRef.current = {
      ...agentBackgroundLifecycleRef.current,
      identity: agentBackgroundLibraryIdentity(settings.databaseDir, activeProject.id),
    };
  }, [activeProject, settings]);

  const showNotice = useCallback<AppNoticeHandler>((message, kind = "info", options) => {
    if (
      kind === "error"
      && options?.scope === "institution-sso"
      && institutionSessionRef.current?.databaseAuth.status === "ready"
    ) return;
    const currentScopeRevision = options?.scope
      ? noticeScopeRevisionsRef.current.get(options.scope) ?? 0
      : undefined;
    if (
      options?.scope
      && options.scopeRevision !== undefined
      && options.scopeRevision !== currentScopeRevision
    ) return;
    noticeSequenceRef.current += 1;
    const scopeRevision = options?.scope
      ? options.scopeRevision ?? (currentScopeRevision ?? 0) + 1
      : undefined;
    if (options?.scope && scopeRevision !== undefined) {
      noticeScopeRevisionsRef.current.set(options.scope, scopeRevision);
    }
    setNotice({
      id: noticeSequenceRef.current,
      message,
      kind,
      scope: options?.scope,
      scopeRevision,
      dismissAfterMs: options?.dismissAfterMs,
    });
  }, []);

  const clearNoticeScope = useCallback<AppNoticeScopeClearHandler>((scope) => {
    const scopeRevision = (noticeScopeRevisionsRef.current.get(scope) ?? 0) + 1;
    noticeScopeRevisionsRef.current.set(scope, scopeRevision);
    setNotice((current) => current?.scope === scope ? null : current);
    return scopeRevision;
  }, []);

  const dismissNotice = useCallback((noticeId?: number) => {
    setNotice((current) => {
      if (!current || (noticeId !== undefined && current.id !== noticeId)) return current;
      if (current.scope) {
        const nextRevision = Math.max(
          noticeScopeRevisionsRef.current.get(current.scope) ?? 0,
          current.scopeRevision ?? 0,
        ) + 1;
        noticeScopeRevisionsRef.current.set(current.scope, nextRevision);
      }
      return null;
    });
  }, []);

  const acceptResearchSearchState = useCallback((next: SideraResearchSearchState) => {
    if (!shouldAcceptSideraResearchSearchState(researchSearchEventCursorRef.current, next)) return;
    researchSearchEventCursorRef.current = sideraResearchSearchStateCursor(next);
    researchSearchStateRef.current = next;
    if (next.displayedSnapshot) {
      const nextKey = sideraResearchSnapshotKey(next.displayedSnapshot);
      const previousKey = researchDisplayedSnapshotKeyRef.current;
      researchDisplayedSnapshotKeyRef.current = nextKey;
      if (shouldResetSideraResearchPresentation(previousKey, next.displayedSnapshot)) {
        setSelectedResearchCandidateIds([]);
      }
    }
    setResearchSearchState(next);
    if (next.displayedSnapshot && (
      next.displayedSnapshot.status === "complete"
      || next.displayedSnapshot.status === "partial"
    )) {
      clearNoticeScope("institution-sso");
      clearNoticeScope("institution-search");
    }
  }, [clearNoticeScope]);

  const applyInstitutionSessionState = useCallback((next: SideraInstitutionSessionState) => {
    if (!shouldAcceptInstitutionSessionState(institutionSessionRef.current, next)) return;
    institutionSessionRef.current = next;
    setInstitutionSession(next);
    if (next.databaseAuth.status === "ready") clearNoticeScope("institution-sso");
  }, [clearNoticeScope]);

  const submitResearchSearch = useCallback(async (
    query: string,
    startReason: SideraResearchSearchStartReason,
    filters: SideraResearchSearchFilters,
    resultLimit: 40 | 100,
  ) => {
    const normalizedQuery = query.trim();
    const requestKey = JSON.stringify([normalizedQuery, filters, resultLimit]);
    const currentAttempt = researchSearchStateRef.current?.activeAttempt;
    const pending = researchSearchSubmitRef.current;
    const currentAttemptKey = currentAttempt
      ? JSON.stringify([currentAttempt.request.query, currentAttempt.request.filters, currentAttempt.request.resultLimit])
      : null;
    const clientRequestId = currentAttempt && currentAttemptKey === requestKey
      ? currentAttempt.clientRequestId
      : pending?.pending && pending.requestKey === requestKey && pending.startReason === startReason
        ? pending.clientRequestId
        : globalThis.crypto?.randomUUID?.()
          ?? `research-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    researchSearchSubmitRef.current = {
      query: normalizedQuery,
      requestKey,
      startReason,
      clientRequestId,
      pending: true,
    };
    try {
      const next = await startSideraResearchSearch({
        query: normalizedQuery,
        clientRequestId,
        startReason,
        filters,
        resultLimit,
      });
      acceptResearchSearchState(next);
      return next;
    } finally {
      if (researchSearchSubmitRef.current?.clientRequestId === clientRequestId) {
        researchSearchSubmitRef.current = {
          query: normalizedQuery,
          requestKey,
          startReason,
          clientRequestId,
          pending: false,
        };
      }
    }
  }, [acceptResearchSearchState]);

  const stopResearchSearch = useCallback(async () => {
    const next = await cancelSideraResearchSearch(
      researchSearchStateRef.current?.activeAttempt?.taskId,
    );
    acceptResearchSearchState(next);
    return next;
  }, [acceptResearchSearchState]);

  const handleBeforeToggleMaximize = useCallback(async () => {
    setWindowGeometryTransitionActive(true);
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => {
        if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
          resolve();
          return;
        }
        window.setTimeout(resolve, 140);
      });
    });
  }, []);

  const handleAfterToggleMaximize = useCallback(() => {
    setWindowGeometryTransitionActive(false);
  }, []);

  activeViewRef.current = activeView;

  const publishPiAgentTerminalActivity = useCallback((status: Exclude<SideraAgentTerminalActivity, null>) => {
    window.clearTimeout(piAgentActivityTimerRef.current);
    setPiAgentTerminalActivity(status);
    if (status === "complete") {
      piAgentActivityTimerRef.current = window.setTimeout(() => {
        setPiAgentTerminalActivity((current) => current === "complete" ? null : current);
      }, 3_000);
    }
  }, []);

  const replacePiConversationTurns = useCallback((turns: SideraConversationTurn[]) => {
    piConversationTurnsRef.current = turns;
    setPiConversationTurns(turns);
  }, []);

  const applyPiConversationSnapshot = useCallback((snapshot: SideraConversationSnapshot) => {
    piActiveConversationRef.current = snapshot.conversation;
    setPiActiveConversation(snapshot.conversation);
    replacePiConversationTurns(conversationTurnsFromSnapshot(snapshot));
    setPiConversationError(
      snapshot.conversation.contextAvailable
        ? ""
        : "该会话的 Pi 上下文文件不可用；历史仍可阅读，请新建对话后继续。",
    );
    setPiSessionStats(null);
    piSessionRef.current = null;
  }, [replacePiConversationTurns]);

  const refreshPiConversationList = useCallback(async () => {
    if (!settings || !activeProject || !piDatabaseDir || !isDesktopRuntime()) return;
    const rows = await listSideraConversations({
      databaseDir: piDatabaseDir,
      projectId: activeProject.id,
      status: "all",
    });
    setPiConversations(rows);
    const active = piActiveConversationRef.current;
    if (active) {
      const refreshed = rows.find((row) => row.id === active.id);
      if (refreshed) {
        piActiveConversationRef.current = refreshed;
        setPiActiveConversation(refreshed);
      }
    }
  }, [activeProject, piDatabaseDir, settings]);

  const persistPiTurn = useCallback(async (turn: SideraConversationTurn) => {
    const conversation = piActiveConversationRef.current;
    if (!settings || !activeProject || !piDatabaseDir || !conversation || !isDesktopRuntime()) return;
    await upsertSideraConversationTurn({
      databaseDir: piDatabaseDir,
      projectId: activeProject.id,
      conversationId: conversation.id,
      id: turn.id,
      submittedAtMs: turn.submittedAtMs,
      userText: turn.userText,
      assistantStatus: turn.assistant.status,
      assistantMarkdown: turn.assistant.markdown,
      entityRefs: turn.assistant.entityRefs,
      retrievalMode: turn.assistant.retrievalMode,
      citationStatus: turn.assistant.citationStatus,
      evidenceGateStatus: turn.assistant.evidenceGateStatus,
      usage: turn.assistant.usage,
    });
  }, [activeProject, piDatabaseDir, settings]);

  const flushPiTurnCheckpoints = useCallback(async () => {
    window.clearTimeout(piCheckpointTimerRef.current);
    piCheckpointTimerRef.current = 0;
    const ids = Array.from(piPendingCheckpointIdsRef.current);
    piPendingCheckpointIdsRef.current.clear();
    const turns = piConversationTurnsRef.current.filter((turn) => ids.includes(turn.id));
    try {
      await Promise.all(turns.map(persistPiTurn));
    } catch (error) {
      setPiConversationError(`对话保存失败：${describeSideraPiError(error)}`);
    }
  }, [persistPiTurn]);

  const checkpointPiTurn = useCallback((turnId: string, immediate = false) => {
    piPendingCheckpointIdsRef.current.add(turnId);
    window.clearTimeout(piCheckpointTimerRef.current);
    if (immediate) {
      void flushPiTurnCheckpoints();
    } else {
      piCheckpointTimerRef.current = window.setTimeout(() => {
        void flushPiTurnCheckpoints();
      }, 500);
    }
  }, [flushPiTurnCheckpoints]);

  const updatePiConversationTurn = useCallback((
    messageId: string,
    updater: (turn: SideraConversationTurn) => SideraConversationTurn,
    immediate = false,
  ) => {
    const next = piConversationTurnsRef.current.map((turn) => (
      turn.assistant.id === messageId ? updater(turn) : turn
    ));
    replacePiConversationTurns(next);
    checkpointPiTurn(messageId, immediate);
  }, [checkpointPiTurn, replacePiConversationTurns]);

  const notifyPiTurnSettled = useCallback(() => {
    for (const resolve of piTurnSettledWaitersRef.current) resolve();
    piTurnSettledWaitersRef.current.clear();
  }, []);

  useEffect(() => {
    if (!notice) return undefined;
    const dismissAfterMs = notice.dismissAfterMs
      ?? (notice.kind === "error" ? undefined : 3000);
    if (dismissAfterMs === undefined) return undefined;
    const noticeId = notice.id;
    const timer = window.setTimeout(() => {
      dismissNotice(noticeId);
    }, dismissAfterMs);
    return () => window.clearTimeout(timer);
  }, [dismissNotice, notice]);

  function updateGalaxySession(key: string, next: GalaxySessionState) {
    galaxySessionsRef.current.set(key, next);
    refreshGalaxySessions((revision) => revision + 1);
  }

  async function ensureGalaxySession(nextSettings: AiSettings, project: Project, forceMysqlRefresh = false) {
    const key = galaxySessionCacheKey(nextSettings.databaseDir, project.id);
    const current = galaxySessionsRef.current.get(key);
    if (!forceMysqlRefresh && current?.payload?.ready) return;
    const pending = galaxyRequestsRef.current.get(key);
    if (pending) return pending;

    const task = (async () => {
      let previous = galaxySessionsRef.current.get(key) ?? EMPTY_GALAXY_SESSION;

      if (galaxyVisualReview) {
        updateGalaxySession(key, {
          ...previous,
          loading: true,
          error: "",
          notice: forceMysqlRefresh ? "正在重新读取浏览器视觉快照…" : "正在读取浏览器视觉快照…",
          phase: "cache",
        });
        try {
          const payload = forceMysqlRefresh
            ? await loadApp17Galaxy({ projectId: project.id, mode: "nebula" })
            : await getApp17GalaxyPayload({ projectId: project.id, mode: "nebula" });
          if (!payload.ready || payload.hotspots.length === 0) throw new Error(payload.message || "视觉快照中没有 app17 热点。");
          updateGalaxySession(key, {
            payload,
            loading: false,
            error: "",
            notice: payload.message,
            phase: "ready",
          });
        } catch (error) {
          updateGalaxySession(key, {
            ...previous,
            loading: false,
            error: error instanceof Error ? error.message : String(error),
            notice: "",
            phase: "error",
          });
        }
        return;
      }

      updateGalaxySession(key, { ...previous, loading: true, error: "", notice: "正在读取统一 V20 星图快照…", phase: "cache" });
      try {
        const payload = await getV20GalaxyPayload({ databaseDir: nextSettings.databaseDir, projectId: project.id, mode: "nebula" });
        updateGalaxySession(key, {
          payload,
          loading: false,
          error: payload.ready ? "" : payload.message,
          notice: payload.message,
          phase: payload.ready ? "ready" : "error",
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error || "统一 V20 星图快照读取失败。");
        updateGalaxySession(key, { ...previous, loading: false, error: errorMessage, notice: "", phase: "error" });
      }
    })();

    galaxyRequestsRef.current.set(key, task);
    try {
      await task;
    } finally {
      galaxyRequestsRef.current.delete(key);
    }
  }

  async function refreshAll() {
    const requestSequence = refreshRequestSequenceRef.current + 1;
    refreshRequestSequenceRef.current = requestSequence;
    const [nextProjects, nextProject, nextReports, nextJobs, nextTaskLogs, nextAllTaskLogs, nextSettings] = await Promise.all([
      getProjects(),
      getActiveProject(),
      getReports(),
      getPipelineJobs(),
      getTaskLogs(),
      getAllTaskLogs(),
      getAiSettings(),
    ]);
    let nextV20Snapshot: V20HotspotSnapshot | null = null;
    let nextLibraryMutationStatus: LibraryMutationStatus | null = null;
    if (isDesktopRuntime() && !galaxyVisualReview) {
      const [snapshot, mutationStatus] = await Promise.all([
        getV20HotspotSnapshot({ databaseDir: nextSettings.databaseDir, projectId: nextProject.id }),
        getLibraryMutationStatus(nextSettings.databaseDir),
      ]);
      nextV20Snapshot = snapshot ?? null;
      nextLibraryMutationStatus = mutationStatus;
      if (requestSequence !== refreshRequestSequenceRef.current) return;
      if (snapshot) {
        await replaceV20HotspotCache(snapshot);
        const sessionKey = galaxySessionCacheKey(nextSettings.databaseDir, nextProject.id);
        const currentSession = galaxySessionsRef.current.get(sessionKey);
        if (currentSession?.payload?.snapshotId !== snapshot.snapshotId) {
          galaxySessionsRef.current.delete(sessionKey);
          galaxyRequestsRef.current.delete(sessionKey);
          refreshGalaxySessions((revision) => revision + 1);
        }
      }
    }
    if (requestSequence !== refreshRequestSequenceRef.current) return;
    const nextHotspots = await getHotspots();
    const nextStatus = await ensurePaperLibraryReady(nextSettings, nextProject);
    const [nextFacets, paperPage] = await Promise.all([
      getPaperLibraryFacets(nextSettings.databaseDir, nextProject.id),
      queryPaperLibrary({
        databaseDir: nextSettings.databaseDir,
        projectId: nextProject.id,
        limit: 80,
        offset: 0,
        sort: "newest",
      }),
    ]);
    if (requestSequence !== refreshRequestSequenceRef.current) return;
    setProjects(nextProjects);
    setActiveProject(nextProject);
    setDashboard(buildDashboardFromLibrary(nextStatus, nextFacets, nextHotspots, nextReports, nextJobs));
    setPapers(paperPage.rows);
    setLibraryBootstrap({
      identity: paperLibraryReadIdentity(
        nextStatus.databasePath,
        nextProject.id,
        nextStatus.libraryRevision,
      ),
      databasePath: nextStatus.databasePath,
      projectId: nextProject.id,
      libraryRevision: nextStatus.libraryRevision,
      facets: nextFacets,
      page: paperPage,
    });
    setLibraryStatus(nextStatus);
    setLibraryFacets(nextFacets);
    setHotspots(nextHotspots);
    setV20Snapshot(nextV20Snapshot);
    setLibraryMutationStatus(nextLibraryMutationStatus);
    setReports(nextReports);
    setJobs(nextJobs);
    setTaskLogs(nextTaskLogs);
    setAllTaskLogs(nextAllTaskLogs);
    setSettings(nextSettings);
  }

  async function ensurePaperLibraryReady(nextSettings: AiSettings, nextProject: Project) {
    let status = await getPaperLibraryStatus(nextSettings.databaseDir, nextProject.id);
    if (status.paperCount > 0) return status;

    if (nextSettings.librarySetupCompleted) return status;

    const legacyCount = await countIndexedDbPapers();
    if (legacyCount === 0) return status;

    let migrated = 0;
    await forEachIndexedDbPaperBatch(1000, async (batch) => {
      const result = await upsertPaperLibrary(nextSettings.databaseDir, nextProject.id, batch);
      migrated += result.total;
    });
    if (migrated > 0) {
      status = await getPaperLibraryStatus(nextSettings.databaseDir, nextProject.id);
    }
    return status;
  }

  useEffect(() => {
    let mounted = true;
    async function boot() {
      if (!bypassSideraBoot) {
        sideraAgentStartupSettledRef.current = false;
        sideraAgentFirstFrameReadyRef.current = false;
        sideraMissingVisualFallbackStartedRef.current = false;
        setSideraBootPhase("booting-data");
        setSideraBootError("");
        setSideraStaticFallbackAllowed(false);
      }
      setLoading(true);
      try {
        await seedResearchDataIfEmpty();
        await reconcileInterruptedAiTaskLogs();
        let nextSettings = await getAiSettings();
        const nextProject = await getActiveProject();
        if (isDesktopRuntime()) {
          let migrated = false;
          let apiCredentialConfigured = nextSettings.apiCredentialConfigured ?? false;
          let mysqlCredentialConfigured = nextSettings.mysql.credentialConfigured ?? false;
          if (nextSettings.manualApiKey.trim()) {
            apiCredentialConfigured = (await setAppCredential(nextProject.id, `ai-${nextSettings.provider}`, nextSettings.manualApiKey)).configured;
            migrated = true;
          } else {
            apiCredentialConfigured = (await getAppCredentialStatus(nextProject.id, `ai-${nextSettings.provider}`)).configured;
          }
          if (nextSettings.mysql.password.trim()) {
            mysqlCredentialConfigured = (await setAppCredential(nextProject.id, "mysql", nextSettings.mysql.password)).configured;
            migrated = true;
          } else {
            mysqlCredentialConfigured = (await getAppCredentialStatus(nextProject.id, "mysql")).configured;
          }
          if (migrated || apiCredentialConfigured !== nextSettings.apiCredentialConfigured || mysqlCredentialConfigured !== nextSettings.mysql.credentialConfigured) {
            nextSettings = await saveAiSettings({ ...nextSettings, manualApiKey: "", apiCredentialConfigured, mysql: { ...nextSettings.mysql, password: "", credentialConfigured: mysqlCredentialConfigured } });
          }
        }
        if (isDesktopRuntime()) {
          if (!galaxyVisualReview) {
            const nextSetupState = await getLibrarySetupState(nextSettings.databaseDir);
            if (!mounted) return;
            if (!nextSetupState.configured || (!import.meta.env.DEV && !nextSettings.librarySetupCompleted && !nextSettings.databaseDir.trim())) {
              setSettings(nextSettings);
              setLibrarySetupState(nextSetupState);
              setLibrarySetupRequired(true);
              if (!bypassSideraBoot) setSideraBootPhase("ready");
              return;
            }
          }
          await prepareLibraryDatabase(nextSettings.databaseDir);
          if (!mounted) return;
          if (!galaxyVisualReview && !nextSettings.librarySetupCompleted && nextSettings.databaseDir.trim()) {
            await saveAiSettings({
              ...nextSettings,
              librarySetupCompleted: true,
              librarySetupMode: "existing",
            });
          }
        }
        if (mounted) {
          await refreshAll();
          if (!bypassSideraBoot) {
            if (sideraAgentFirstFrameReadyRef.current) {
              setSideraBootPhase("ready");
            } else if (!sideraAgentStartupSettledRef.current) {
              setSideraBootPhase("mounting-agent");
            }
          }
        }
      } catch (error) {
        if (!mounted) return;
        const message = error instanceof Error ? error.message : "桌面端初始化失败。";
        showNotice(message, "error");
        if (!bypassSideraBoot) {
          setSideraBootError(message);
          setSideraBootPhase("failed");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void boot();
    return () => {
      mounted = false;
    };
  }, [bypassSideraBoot, showNotice, sideraBootRevision]);

  useEffect(() => {
    sideraSplashMountedRef.current = sideraSplashMounted;
  }, [sideraSplashMounted]);

  useEffect(() => {
    if (!sideraSplashMounted || sideraBootPhase === "ready" || sideraBootPhase === "failed") {
      setSideraBootStatusVisible(false);
      return undefined;
    }
    const elapsed = performance.now() - sideraBootStartedAtRef.current;
    const timer = window.setTimeout(
      () => setSideraBootStatusVisible(true),
      Math.max(0, 2000 - elapsed),
    );
    return () => window.clearTimeout(timer);
  }, [sideraBootPhase, sideraSplashMounted]);

  useEffect(() => {
    if (
      bypassSideraBoot
      || !sideraSplashMounted
      || sideraBootPhase !== "mounting-agent"
    ) return undefined;
    const timer = window.setTimeout(() => {
      if (
        sideraAgentStartupSettledRef.current
        || !sideraSplashMountedRef.current
      ) return;
      sideraAgentStartupSettledRef.current = true;
      const message = `SIDERA_AGENT_MOUNT_TIMEOUT:${SIDERA_AGENT_MOUNT_DEADLINE_MS}ms:`
        + "动态背景未在期限内提交首个真实帧。";
      setSideraBootError(message);
      setSideraStaticFallbackAllowed(true);
      setSideraBootPhase((current) => (
        current === "mounting-agent" ? "failed" : current
      ));
    }, SIDERA_AGENT_MOUNT_DEADLINE_MS);
    return () => window.clearTimeout(timer);
  }, [bypassSideraBoot, sideraBootPhase, sideraSplashMounted]);

  useEffect(() => {
    if (!sideraSplashMounted || sideraBootPhase !== "ready") return undefined;
    const elapsed = performance.now() - sideraBootStartedAtRef.current;
    let unmountTimer = 0;
    const exitTimer = window.setTimeout(() => {
      setSideraSplashExiting(true);
      unmountTimer = window.setTimeout(() => setSideraSplashMounted(false), 420);
    }, Math.max(0, 1000 - elapsed));
    return () => {
      window.clearTimeout(exitTimer);
      window.clearTimeout(unmountTimer);
    };
  }, [sideraBootPhase, sideraSplashMounted]);

  useEffect(() => {
    if (!workspaceRef.current) return;
    workspaceRef.current.parentElement?.scrollTo({ top: 0, left: 0 });
    workspaceRef.current.scrollTo({ top: 0, left: 0 });
  }, [activeView]);

  useEffect(() => {
    if (activeView === "galaxy") setGalaxyVisited(true);
  }, [activeView]);

  useEffect(() => {
    if (!isDesktopRuntime()) return undefined;
    let disposed = false;
    const unlistens: Array<() => void> = [];
    void Promise.all([
      listenSideraInstitutionSession((next) => {
        if (!disposed) applyInstitutionSessionState(next);
      }),
      listenSideraInstitutionSearch((next) => {
        if (disposed) return;
        const streamKey = sideraInstitutionSearchStreamKey(next);
        const cursor = institutionSearchEventCursorsRef.current.get(streamKey);
        if (!shouldAcceptSideraInstitutionSearchEvent(cursor, next)) return;
        institutionSearchEventCursorsRef.current.set(streamKey, {
          epoch: next.epoch,
          sequence: next.sequence,
        });
        setInstitutionSearchSnapshots((current) => ({ ...current, [next.source]: next }));
        window.clearTimeout(institutionActivityTimerRef.current);
        if (next.status === "searching") {
          setInstitutionTerminalActivity(null);
        } else if (next.status === "complete" || next.status === "partial") {
          setInstitutionTerminalActivity("complete");
          institutionActivityTimerRef.current = window.setTimeout(
            () => setInstitutionTerminalActivity((current) => current === "complete" ? null : current),
            3_000,
          );
        } else if (next.status === "failed") {
          setInstitutionTerminalActivity("failed");
        }
      }),
      listenSideraResearchSearch((next) => {
        if (!disposed) acceptResearchSearchState(next);
      }),
    ]).then((rows) => unlistens.push(...rows)).catch(() => undefined);
    void getSideraInstitutionSessionState().then((next) => {
      if (!disposed) applyInstitutionSessionState(next);
    }).catch(() => undefined);
    void getSideraResearchSearchState().then((next) => {
      if (!disposed) acceptResearchSearchState(next);
    }).catch(() => undefined);
    return () => {
      disposed = true;
      unlistens.forEach((unlisten) => unlisten());
    };
  }, [acceptResearchSearchState, applyInstitutionSessionState]);

  const resolvedLiteratureWorkspaceTab = literatureWorkspaceTab
    ?? ((libraryStatus?.paperCount ?? 0) > 0 ? "library" : "ingest");
  const institutionBrowserVisible = activeView === "search"
    && resolvedLiteratureWorkspaceTab === "institution"
    && institutionBrowserPresentation !== "closed"
    && !agentNavigationOpen;
  const institutionBrowserImmersiveVisible = institutionBrowserVisible
    && institutionBrowserPresentation === "immersive";

  function updateInstitutionBrowserPresentation(next: SideraInstitutionBrowserPresentation) {
    if (next === "immersive" && institutionBrowserPresentation !== "immersive") {
      institutionWorkbenchScrollTopRef.current = workspaceRef.current?.scrollTop ?? 0;
    }
    setInstitutionBrowserPresentation(next);
  }

  useLayoutEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    const wasImmersive = institutionBrowserImmersiveActiveRef.current;
    if (institutionBrowserImmersiveVisible && !wasImmersive) {
      workspace.scrollTo({ top: 0, left: 0, behavior: "auto" });
    } else if (!institutionBrowserImmersiveVisible && wasImmersive) {
      workspace.scrollTo({
        top: institutionWorkbenchScrollTopRef.current,
        left: 0,
        behavior: "auto",
      });
    }
    institutionBrowserImmersiveActiveRef.current = institutionBrowserImmersiveVisible;
  }, [institutionBrowserImmersiveVisible]);

  useLayoutEffect(() => {
    if (!isDesktopRuntime()) return;
    void setSideraInstitutionBrowserVisible(false).catch(() => undefined);
    if (!institutionBrowserVisible) {
      void setSideraInstitutionBrowserShellVisible(false).catch(() => undefined);
    }
  }, [institutionBrowserVisible]);

  useEffect(() => {
    if (!settings || !activeProject || !isDesktopRuntime() || !piDatabaseDir) return;
    const revision = piConversationScopeRevisionRef.current + 1;
    piConversationScopeRevisionRef.current = revision;
    let disposed = false;
    setPiConversationLoading(true);
    setPiToolApproval(null);
    piSessionRef.current = null;
    piActiveTurnRef.current = null;
    setPiGenerating(false);
    void stopSideraPiSession().catch(() => undefined);
    void (async () => {
      try {
        let snapshot = await openRecentSideraConversation({
          databaseDir: piDatabaseDir,
          projectId: activeProject.id,
        });
        if (!snapshot) {
          snapshot = await createSideraConversation({
            databaseDir: piDatabaseDir,
            projectId: activeProject.id,
            conversationId: globalThis.crypto?.randomUUID?.(),
            provider: settings.provider,
            model: settings.model,
          });
        }
        const conversations = await listSideraConversations({
          databaseDir: piDatabaseDir,
          projectId: activeProject.id,
          status: "all",
        });
        if (disposed || revision !== piConversationScopeRevisionRef.current) return;
        applyPiConversationSnapshot(snapshot);
        setPiConversations(conversations);
      } catch (error) {
        if (!disposed) setPiConversationError(`对话历史初始化失败：${describeSideraPiError(error)}`);
      } finally {
        if (!disposed) setPiConversationLoading(false);
      }
    })();
    return () => {
      disposed = true;
    };
  }, [
    activeProject?.id,
    applyPiConversationSnapshot,
    piDatabaseDir,
    settings?.model,
    settings?.provider,
  ]);

  useEffect(() => () => {
    window.clearTimeout(piCheckpointTimerRef.current);
    window.clearTimeout(piAgentActivityTimerRef.current);
    window.clearTimeout(institutionActivityTimerRef.current);
    if (isDesktopRuntime()) void setSideraInstitutionBrowserVisible(false).catch(() => undefined);
    void flushPiTurnCheckpoints();
  }, [flushPiTurnCheckpoints]);

  useEffect(() => {
    if (!isDesktopRuntime()) return undefined;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listenSideraPiEvents((event) => {
      if (disposed || event.sequence <= piLastEventSequenceRef.current) return;
      piLastEventSequenceRef.current = event.sequence;

      if (event.type === "session-ready") {
        piSessionRef.current = {
          sessionId: event.sessionId,
          provider: event.provider,
          model: event.model,
          packageVersion: "0.82.1",
        };
        setPiConversationError("");
        return;
      }

      if (event.type === "tool-approval-requested") {
        setPiAgentTerminalActivity(null);
        setPiToolApproval(event.request);
        return;
      }

      if (event.type === "tool-approval-resolved") {
        setPiToolApproval((current) => (
          current?.approvalId === event.approvalId ? null : current
        ));
        return;
      }

      const currentSessionId = piSessionRef.current?.sessionId;
      if ("sessionId" in event && event.sessionId && currentSessionId && event.sessionId !== currentSessionId) return;

      if (event.type === "turn-start") {
        window.clearTimeout(piAgentActivityTimerRef.current);
        setPiAgentTerminalActivity(null);
        piActiveTurnRef.current = {
          sessionId: event.sessionId,
          messageId: event.messageId,
          revision: event.revision,
        };
        setPiGenerating(true);
        return;
      }

      if (event.type === "assistant-delta") {
        const active = piActiveTurnRef.current;
        if (!active || active.messageId !== event.messageId || event.revision < active.revision) return;
        updatePiConversationTurn(event.messageId, (turn) => ({
          ...turn,
          assistant: {
            ...turn.assistant,
            status: "streaming",
            markdown: turn.assistant.markdown + event.delta,
          },
        }));
        return;
      }

      if (event.type === "assistant-replace") {
        const active = piActiveTurnRef.current;
        if (!active || active.messageId !== event.messageId || event.revision !== active.revision) return;
        updatePiConversationTurn(event.messageId, (turn) => ({
          ...turn,
          assistant: {
            ...turn.assistant,
            status: "streaming",
            markdown: event.markdown,
          },
        }), true);
        return;
      }

      if (event.type === "tool-stage") {
        const active = piActiveTurnRef.current;
        if (!active || active.messageId !== event.messageId || event.revision < active.revision) return;
        updatePiConversationTurn(event.messageId, (turn) => ({
          ...turn,
          assistant: { ...turn.assistant, status: "streaming", toolStage: event.stage },
        }));
        return;
      }

      if (event.type === "turn-complete" || event.type === "turn-cancelled") {
        const active = piActiveTurnRef.current;
        if (!active || active.messageId !== event.messageId || event.revision < active.revision) return;
        const status = event.type === "turn-cancelled" ? "cancelled" : "complete";
        updatePiConversationTurn(event.messageId, (turn) => (
          event.type === "turn-complete"
            ? {
                ...turn,
                assistant: {
                  ...turn.assistant,
                  status,
                  toolStage: undefined,
                  entityRefs: event.entityRefs,
                  retrievalMode: event.retrievalMode,
                  citationStatus: event.citationStatus,
                  evidenceGateStatus: event.evidenceGateStatus,
                  usage: event.usage,
                },
              }
            : {
                ...turn,
                assistant: { ...turn.assistant, status, toolStage: undefined },
              }
        ), true);
        piActiveTurnRef.current = null;
        notifyPiTurnSettled();
        setPiGenerating(false);
        setPiToolApproval(null);
        if (event.type === "turn-complete") {
          publishPiAgentTerminalActivity("complete");
        } else {
          window.clearTimeout(piAgentActivityTimerRef.current);
          setPiAgentTerminalActivity(null);
        }
        void getSideraPiSessionStats().then(setPiSessionStats).catch(() => undefined);
        void refreshPiConversationList().catch(() => undefined);
        return;
      }

      if (event.type === "runtime-error") {
        const message = describeSideraPiError(new Error(`${event.code}:${event.message}`));
        const active = piActiveTurnRef.current;
        if (active) {
          updatePiConversationTurn(active.messageId, (turn) => ({
            ...turn,
            assistant: {
              ...turn.assistant,
              status: "failed",
              markdown: turn.assistant.markdown || "本轮回答未能完成。",
            },
          }), true);
        }
        piActiveTurnRef.current = null;
        notifyPiTurnSettled();
        setPiGenerating(false);
        setPiToolApproval(null);
        setPiConversationError(message);
        publishPiAgentTerminalActivity("failed");
        if (activeViewRef.current !== "agent") showNotice(message, "error");
      }
    }).then((dispose) => {
      if (disposed) dispose();
      else unlisten = dispose;
    }).catch((error) => {
      if (!disposed) {
        const message = describeSideraPiError(error);
        setPiConversationError(message);
        publishPiAgentTerminalActivity("failed");
        if (activeViewRef.current !== "agent") showNotice(message, "error");
      }
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [notifyPiTurnSettled, publishPiAgentTerminalActivity, refreshPiConversationList, showNotice, updatePiConversationTurn]);

  const piConfigKey = settings && activeProject
    ? [
        activeProject.id,
        piDatabaseDir,
        settings.provider,
        settings.baseUrl.trim(),
        settings.model.trim(),
        settings.sideraCacheRetention,
        settings.useEnvKey ? "env" : "keyring",
      ].join("\u0000")
    : "";

  useEffect(() => {
    if (!piConfigKey) return;
    const previous = piConfigKeyRef.current;
    piConfigKeyRef.current = piConfigKey;
    if (!previous || previous === piConfigKey || !piSessionRef.current) return;
    const active = piActiveTurnRef.current;
    if (active) {
      updatePiConversationTurn(active.messageId, (turn) => ({
        ...turn,
        assistant: { ...turn.assistant, status: "cancelled" },
      }), true);
    }
    piActiveTurnRef.current = null;
    notifyPiTurnSettled();
    piSessionRef.current = null;
    setPiGenerating(false);
    setPiConversationError("模型或项目设置已变化，下一条问题将开始新的 Pi 会话。");
    void stopSideraPiSession().catch(() => undefined);
  }, [notifyPiTurnSettled, piConfigKey, updatePiConversationTurn]);

  const submitSideraPrompt = useCallback(async (event: AgentPromptSubmitEvent) => {
    const messageId = globalThis.crypto?.randomUUID?.()
      ?? `sidera-pi-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let conversation = piActiveConversationRef.current;
    if (!conversation && settings && activeProject) {
      try {
        const snapshot = await createSideraConversation({
          databaseDir: piDatabaseDir,
          projectId: activeProject.id,
          conversationId: globalThis.crypto?.randomUUID?.(),
          provider: settings.provider,
          model: settings.model,
        });
        applyPiConversationSnapshot(snapshot);
        conversation = snapshot.conversation;
      } catch (error) {
        setPiConversationError(`新对话创建失败：${describeSideraPiError(error)}`);
        return;
      }
    }
    const nextTurn: SideraConversationTurn = {
      id: messageId,
      submittedAtMs: event.submittedAtMs,
      userText: event.text,
      assistant: { id: messageId, status: "streaming", markdown: "", entityRefs: [] },
    };
    replacePiConversationTurns([...piConversationTurnsRef.current, nextTurn]);
    setPiConversationError("");
    if (!settings || !activeProject) {
      updatePiConversationTurn(messageId, (turn) => ({
        ...turn,
        assistant: { ...turn.assistant, status: "failed", markdown: "本轮回答未能开始。" },
      }), true);
      setPiConversationError("当前项目或模型设置尚未就绪，请先打开设置完成配置。");
      return;
    }
    if (piGenerating) {
      updatePiConversationTurn(messageId, (turn) => ({
        ...turn,
        assistant: { ...turn.assistant, status: "failed", markdown: "上一轮回答仍在结束中。" },
      }), true);
      setPiConversationError("上一轮回答仍在结束中，请稍后再试。");
      return;
    }
    // `conversationGenerating` is the visible submission gate. Terminal RPC
    // events and invoke responses use separate Tauri channels, so reconcile a
    // stale ref here and let the Rust singleton remain the authoritative guard
    // against a genuinely concurrent turn.
    piActiveTurnRef.current = null;
    window.clearTimeout(piAgentActivityTimerRef.current);
    setPiAgentTerminalActivity(null);
    setPiGenerating(true);
    try {
      if (conversation && !conversation.contextAvailable && conversation.turnCount > 0) {
        throw new Error("该会话的 Pi 上下文不可恢复，请新建对话后继续。");
      }
      await persistPiTurn(nextTurn);
      const session = await startSideraPiSession({
        projectId: activeProject.id,
        conversationId: conversation!.id,
        databaseDir: piDatabaseDir,
        provider: settings.provider,
        baseUrl: settings.baseUrl,
        model: settings.model,
        useEnvKey: settings.useEnvKey,
        cacheRetention: settings.sideraCacheRetention,
      });
      piSessionRef.current = session;
      piActiveTurnRef.current = {
        sessionId: session.sessionId,
        messageId,
        revision: 0,
      };
      await submitSideraPiPrompt({
        sessionId: session.sessionId,
        messageId,
        prompt: event.text,
        readingContext: event.readingContext,
      });
    } catch (error) {
      const message = describeSideraPiError(error);
      piActiveTurnRef.current = null;
      setPiGenerating(false);
      updatePiConversationTurn(messageId, (turn) => ({
        ...turn,
        assistant: { ...turn.assistant, status: "failed", markdown: "本轮回答未能开始。" },
      }), true);
      setPiConversationError(message);
      publishPiAgentTerminalActivity("failed");
      if (activeViewRef.current !== "agent") showNotice(message, "error");
    }
  }, [
    activeProject,
    applyPiConversationSnapshot,
    persistPiTurn,
    piDatabaseDir,
    piGenerating,
    publishPiAgentTerminalActivity,
    replacePiConversationTurns,
    settings,
    showNotice,
    updatePiConversationTurn,
  ]);

  const stopSideraGeneration = useCallback(() => {
    const active = piActiveTurnRef.current;
    if (!active) {
      setPiGenerating(false);
      return;
    }
    void abortSideraPiTurn({
      sessionId: active.sessionId,
      messageId: active.messageId,
    }).catch((error) => {
      const message = describeSideraPiError(error);
      setPiConversationError(message);
      publishPiAgentTerminalActivity("failed");
      if (activeViewRef.current !== "agent") showNotice(message, "error");
    });
  }, [publishPiAgentTerminalActivity, showNotice]);

  const preparePiConversationChange = useCallback(async (reason: string) => {
    const activeTurn = piActiveTurnRef.current;
    if (activeTurn) {
      if (!window.confirm(`当前回答仍在生成。${reason}会先停止本轮且不会自动重试，是否继续？`)) {
        return false;
      }
      let cancelSettledWait = () => undefined;
      const settled = new Promise<void>((resolve, reject) => {
        let timer = 0;
        const finish = () => {
          window.clearTimeout(timer);
          piTurnSettledWaitersRef.current.delete(finish);
          resolve();
        };
        cancelSettledWait = () => {
          window.clearTimeout(timer);
          piTurnSettledWaitersRef.current.delete(finish);
        };
        piTurnSettledWaitersRef.current.add(finish);
        timer = window.setTimeout(() => {
          piTurnSettledWaitersRef.current.delete(finish);
          reject(new Error("等待当前回答停止超时；会话未切换。"));
        }, 10_000);
      });
      try {
        await abortSideraPiTurn({
          sessionId: activeTurn.sessionId,
          messageId: activeTurn.messageId,
        });
        await settled;
      } catch (error) {
        cancelSettledWait();
        setPiConversationError(describeSideraPiError(error));
        return false;
      }
    }
    try {
      await flushPiTurnCheckpoints();
      await stopSideraPiSession();
    } catch (error) {
      setPiConversationError(describeSideraPiError(error));
      return false;
    }
    piSessionRef.current = null;
    piActiveTurnRef.current = null;
    setPiGenerating(false);
    setPiToolApproval(null);
    return true;
  }, [flushPiTurnCheckpoints]);

  const createNewPiConversation = useCallback(async () => {
    if (!settings || !activeProject || !piDatabaseDir || !isDesktopRuntime()) return;
    if (!await preparePiConversationChange("新建对话")) return;
    setPiConversationLoading(true);
    try {
      const snapshot = await createSideraConversation({
        databaseDir: piDatabaseDir,
        projectId: activeProject.id,
        conversationId: globalThis.crypto?.randomUUID?.(),
        provider: settings.provider,
        model: settings.model,
      });
      applyPiConversationSnapshot(snapshot);
      await refreshPiConversationList();
    } catch (error) {
      setPiConversationError(`新对话创建失败：${describeSideraPiError(error)}`);
    } finally {
      setPiConversationLoading(false);
    }
  }, [activeProject, applyPiConversationSnapshot, piDatabaseDir, preparePiConversationChange, refreshPiConversationList, settings]);

  const openPiConversationById = useCallback(async (conversationId: string) => {
    if (!settings || !activeProject || !piDatabaseDir || !isDesktopRuntime()) return;
    if (piActiveConversationRef.current?.id === conversationId) return;
    if (!await preparePiConversationChange("切换对话")) return;
    setPiConversationLoading(true);
    try {
      const snapshot = await openSideraConversation({
        databaseDir: piDatabaseDir,
        projectId: activeProject.id,
        conversationId,
      });
      applyPiConversationSnapshot(snapshot);
      await refreshPiConversationList();
    } catch (error) {
      setPiConversationError(`对话打开失败：${describeSideraPiError(error)}`);
    } finally {
      setPiConversationLoading(false);
    }
  }, [activeProject, applyPiConversationSnapshot, piDatabaseDir, preparePiConversationChange, refreshPiConversationList, settings]);

  const renamePiConversationById = useCallback(async (conversationId: string, title: string) => {
    if (!settings || !activeProject || !piDatabaseDir || !title.trim() || !isDesktopRuntime()) return;
    try {
      const summary = await renameSideraConversation({
        databaseDir: piDatabaseDir,
        projectId: activeProject.id,
        conversationId,
        title: title.trim(),
      });
      setPiConversations((rows) => rows.map((row) => row.id === summary.id ? summary : row));
      if (piActiveConversationRef.current?.id === summary.id) {
        piActiveConversationRef.current = summary;
        setPiActiveConversation(summary);
      }
    } catch (error) {
      setPiConversationError(`重命名失败：${describeSideraPiError(error)}`);
    }
  }, [activeProject, piDatabaseDir, settings]);

  const archivePiConversationById = useCallback(async (conversationId: string) => {
    if (!settings || !activeProject || !piDatabaseDir || !isDesktopRuntime()) return;
    const isCurrent = piActiveConversationRef.current?.id === conversationId;
    if (isCurrent && !await preparePiConversationChange("归档当前对话")) return;
    setPiConversationLoading(true);
    try {
      await archiveSideraConversation({
        databaseDir: piDatabaseDir,
        projectId: activeProject.id,
        conversationId,
      });
      if (isCurrent) {
        let snapshot = await openRecentSideraConversation({
          databaseDir: piDatabaseDir,
          projectId: activeProject.id,
        });
        if (!snapshot) {
          snapshot = await createSideraConversation({
            databaseDir: piDatabaseDir,
            projectId: activeProject.id,
            conversationId: globalThis.crypto?.randomUUID?.(),
            provider: settings.provider,
            model: settings.model,
          });
        }
        applyPiConversationSnapshot(snapshot);
      }
      await refreshPiConversationList();
    } catch (error) {
      setPiConversationError(`归档失败：${describeSideraPiError(error)}`);
    } finally {
      setPiConversationLoading(false);
    }
  }, [activeProject, applyPiConversationSnapshot, piDatabaseDir, preparePiConversationChange, refreshPiConversationList, settings]);

  const restorePiConversationById = useCallback(async (conversationId: string) => {
    if (!settings || !activeProject || !piDatabaseDir || !isDesktopRuntime()) return;
    try {
      await restoreSideraConversation({
        databaseDir: piDatabaseDir,
        projectId: activeProject.id,
        conversationId,
      });
      await refreshPiConversationList();
    } catch (error) {
      setPiConversationError(`恢复失败：${describeSideraPiError(error)}`);
    }
  }, [activeProject, piDatabaseDir, refreshPiConversationList, settings]);

  const deletePiConversationById = useCallback(async (conversationId: string) => {
    if (!settings || !activeProject || !piDatabaseDir || !isDesktopRuntime()) return;
    const row = piConversations.find((conversation) => conversation.id === conversationId);
    if (!row || row.status !== "archived") return;
    if (!window.confirm(`永久删除“${row.title}”？该操作会同时删除对应的 Pi 上下文文件，且无法恢复。`)) return;
    const isCurrent = piActiveConversationRef.current?.id === conversationId;
    if (isCurrent && !await preparePiConversationChange("删除当前归档对话")) return;
    setPiConversationLoading(true);
    try {
      await deleteSideraConversation({
        databaseDir: piDatabaseDir,
        projectId: activeProject.id,
        conversationId,
      });
      if (isCurrent) {
        let snapshot = await openRecentSideraConversation({
          databaseDir: piDatabaseDir,
          projectId: activeProject.id,
        });
        if (!snapshot) {
          snapshot = await createSideraConversation({
            databaseDir: piDatabaseDir,
            projectId: activeProject.id,
            conversationId: globalThis.crypto?.randomUUID?.(),
            provider: settings.provider,
            model: settings.model,
          });
        }
        applyPiConversationSnapshot(snapshot);
      }
      await refreshPiConversationList();
    } catch (error) {
      setPiConversationError(`永久删除失败：${describeSideraPiError(error)}`);
    } finally {
      setPiConversationLoading(false);
    }
  }, [activeProject, applyPiConversationSnapshot, piConversations, piDatabaseDir, preparePiConversationChange, refreshPiConversationList, settings]);

  const decidePiToolApproval = useCallback(async (decision: "approved" | "rejected") => {
    const approval = piToolApproval;
    if (!approval) return;
    try {
      await decideSideraToolApproval({ approvalId: approval.approvalId, decision });
    } catch (error) {
      setPiConversationError(describeSideraPiError(error));
    }
  }, [piToolApproval]);

  const cancelEdgeNavigationArm = useCallback(() => {
    if (edgeNavigationTimerRef.current !== null) {
      window.clearTimeout(edgeNavigationTimerRef.current);
      edgeNavigationTimerRef.current = null;
    }
    setEdgeNavigationPhase((current) => current === "open" ? current : "idle");
  }, []);

  const openAgentNavigation = useCallback((openedBy: "edge" | "keyboard") => {
    if (edgeNavigationTimerRef.current !== null) {
      window.clearTimeout(edgeNavigationTimerRef.current);
      edgeNavigationTimerRef.current = null;
    }
    if (edgeNavigationCloseTimerRef.current !== null) {
      window.clearTimeout(edgeNavigationCloseTimerRef.current);
      edgeNavigationCloseTimerRef.current = null;
    }
    if (isDesktopRuntime()) {
      void setSideraInstitutionBrowserVisible(false).catch(() => undefined);
    }
    setAgentNavigationOpen(true);
    setEdgeNavigationPhase("open");
    setEdgeNavigationOpenedBy(openedBy);
  }, []);

  const closeAgentNavigation = useCallback(() => {
    if (edgeNavigationTimerRef.current !== null) {
      window.clearTimeout(edgeNavigationTimerRef.current);
      edgeNavigationTimerRef.current = null;
    }
    if (edgeNavigationCloseTimerRef.current !== null) {
      window.clearTimeout(edgeNavigationCloseTimerRef.current);
      edgeNavigationCloseTimerRef.current = null;
    }
    setAgentNavigationOpen(false);
    setEdgeNavigationPhase("idle");
    setEdgeNavigationOpenedBy(null);
  }, []);

  const cancelNavigationAutoClose = useCallback(() => {
    if (edgeNavigationCloseTimerRef.current === null) return;
    window.clearTimeout(edgeNavigationCloseTimerRef.current);
    edgeNavigationCloseTimerRef.current = null;
  }, []);

  const scheduleNavigationAutoClose = useCallback(() => {
    cancelNavigationAutoClose();
    edgeNavigationCloseTimerRef.current = window.setTimeout(() => {
      edgeNavigationCloseTimerRef.current = null;
      closeAgentNavigation();
    }, 220);
  }, [cancelNavigationAutoClose, closeAgentNavigation]);

  const armEdgeNavigation = useCallback(() => {
    if (agentNavigationOpen || edgeNavigationTimerRef.current !== null) return;
    setEdgeNavigationPhase("arming");
    edgeNavigationTimerRef.current = window.setTimeout(() => {
      edgeNavigationTimerRef.current = null;
      openAgentNavigation("edge");
    }, 150);
  }, [agentNavigationOpen, openAgentNavigation]);

  useEffect(() => {
    const handleGlobalNavigationKey = (event: KeyboardEvent) => {
      if (event.altKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (agentNavigationOpen) closeAgentNavigation();
        else openAgentNavigation("keyboard");
        return;
      }
      if (event.key !== "Escape" || !agentNavigationOpen) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      closeAgentNavigation();
    };
    window.addEventListener("keydown", handleGlobalNavigationKey, true);
    return () => {
      window.removeEventListener("keydown", handleGlobalNavigationKey, true);
      if (edgeNavigationTimerRef.current !== null) window.clearTimeout(edgeNavigationTimerRef.current);
      if (edgeNavigationCloseTimerRef.current !== null) window.clearTimeout(edgeNavigationCloseTimerRef.current);
    };
  }, [agentNavigationOpen, closeAgentNavigation, openAgentNavigation]);

  const handleAgentInitialReady = useCallback((lifecycleEpoch: number) => {
    if (!isCurrentAgentBackgroundEpoch(
      lifecycleEpoch,
      agentBackgroundLifecycleRef.current.epoch,
    )) return;
    if (bypassSideraBoot || sideraAgentStartupSettledRef.current) return;
    sideraAgentStartupSettledRef.current = true;
    sideraAgentFirstFrameReadyRef.current = true;
    setSideraBootPhase((current) => (
      current === "mounting-agent" ? "ready" : current
    ));
  }, [bypassSideraBoot]);

  const handleAgentInitialError = useCallback((lifecycleEpoch: number, message: string) => {
    if (!isCurrentAgentBackgroundEpoch(
      lifecycleEpoch,
      agentBackgroundLifecycleRef.current.epoch,
    )) return;
    if (
      isMissingImmersiveVisualSource(message)
      && !sideraMissingVisualFallbackStartedRef.current
    ) {
      sideraMissingVisualFallbackStartedRef.current = true;
      sideraAgentFirstFrameReadyRef.current = false;
      setSideraStaticBackground(true);
      setSideraStaticFallbackAllowed(false);
      setSideraBootError("");
      if (sideraSplashMountedRef.current && !bypassSideraBoot) {
        setSideraBootPhase("mounting-agent");
      }
      showNotice(
        "当前论文库尚未生成可用动态星图，已使用静态背景进入应用。",
        "info",
        { dismissAfterMs: 8_000 },
      );
      return;
    }
    if (
      !sideraSplashMountedRef.current
      || bypassSideraBoot
      || sideraAgentStartupSettledRef.current
    ) return;
    sideraAgentStartupSettledRef.current = true;
    setSideraBootError(message);
    setSideraStaticFallbackAllowed(true);
    setSideraBootPhase("failed");
  }, [bypassSideraBoot, showNotice]);

  const agentInitialCallbacks = useMemo(() => {
    const lifecycleEpoch = agentMountRevision;
    return {
      ready: () => handleAgentInitialReady(lifecycleEpoch),
      error: (message: string) => handleAgentInitialError(lifecycleEpoch, message),
    };
  }, [agentMountRevision, handleAgentInitialError, handleAgentInitialReady]);

  const advanceAgentBackgroundLibrary = useCallback((databaseDir: string, projectId: string) => {
    const transition = transitionAgentBackgroundLibrary(
      agentBackgroundLifecycleRef.current,
      databaseDir,
      projectId,
    );
    if (!transition.changed) return false;
    agentBackgroundLifecycleRef.current = transition.current;
    sideraMissingVisualFallbackStartedRef.current = false;
    setSideraStaticBackground(false);
    setSideraStaticFallbackAllowed(false);
    setSideraBootError("");
    setAgentMountRevision(transition.current.epoch);
    return true;
  }, []);

  const retrySideraBoot = () => {
    sideraBootStartedAtRef.current = performance.now();
    sideraAgentStartupSettledRef.current = false;
    sideraAgentFirstFrameReadyRef.current = false;
    sideraMissingVisualFallbackStartedRef.current = false;
    setSideraSplashMounted(true);
    setSideraSplashExiting(false);
    setSideraBootStatusVisible(false);
    setSideraBootError("");
    setSideraStaticBackground(false);
    setSideraStaticFallbackAllowed(false);
    setSideraBootPhase("booting-data");
    const nextEpoch = agentBackgroundLifecycleRef.current.epoch + 1;
    agentBackgroundLifecycleRef.current = {
      ...agentBackgroundLifecycleRef.current,
      epoch: nextEpoch,
    };
    setAgentMountRevision(nextEpoch);
    setSideraBootRevision((value) => value + 1);
  };

  const openSettingsFromSplash = async () => {
    try {
      if (!settings) setSettings(await getAiSettings());
      if (!activeProject) setActiveProject(await getActiveProject());
      setActiveView("settings");
      sideraAgentStartupSettledRef.current = true;
      setSideraBootPhase("ready");
    } catch (error) {
      setSideraBootError(error instanceof Error ? error.message : "无法打开设置。");
      setSideraBootPhase("failed");
    }
  };

  const sideraSplash = sideraSplashMounted ? (
    <SideraSplash
      phase={sideraBootPhase}
      exiting={sideraSplashExiting}
      showStatus={sideraBootStatusVisible}
      error={sideraBootError}
      allowStaticFallback={sideraStaticFallbackAllowed}
      onRetry={retrySideraBoot}
      onOpenSettings={() => void openSettingsFromSplash()}
      onUseStaticBackground={() => {
        sideraMissingVisualFallbackStartedRef.current = true;
        sideraAgentStartupSettledRef.current = false;
        sideraAgentFirstFrameReadyRef.current = false;
        setSideraStaticBackground(true);
        setSideraBootError("");
        setSideraBootPhase("mounting-agent");
      }}
      onOpenSource={() => void openExternalUrl("https://ctext.org/wiki.pl?chapter=795512&if=en")}
    />
  ) : null;

  if (librarySetupRequired && settings && librarySetupState) {
    return (
      <>
        <SideraTitleBar variant="transparent" />
        <div className="sidera-library-setup-frame">
          <LibrarySetupView
            state={librarySetupState}
            onComplete={async (result) => {
              await saveAiSettings({
                ...settings,
                databaseDir: result.databaseDir,
                dataDir: result.databaseDir,
                librarySetupCompleted: true,
                librarySetupMode: result.mode,
              });
              setLoading(true);
              try {
                await prepareLibraryDatabase(result.databaseDir);
                await refreshAll();
                setLibrarySetupRequired(false);
                setLibrarySetupState(null);
                showNotice(result.summary, "success");
                sideraAgentStartupSettledRef.current = false;
                sideraAgentFirstFrameReadyRef.current = false;
                setSideraBootPhase("mounting-agent");
              } finally {
                setLoading(false);
              }
            }}
          />
        </div>
        {sideraSplash}
      </>
    );
  }

  const renderSidebarContents = () => (
    <>
      <div className="sidera-navigation-drawer__header">
        <span>导航</span>
        <button
          type="button"
          className="agent-navigation-drawer__close"
          title="关闭导航"
          aria-label="关闭导航"
          onClick={closeAgentNavigation}
        >
          <X size={15} />
        </button>
      </div>

      <ProjectSwitcher
        projects={projects}
        activeProject={activeProject}
        onSwitch={switchProject}
        onCreate={createNewProject}
        onRename={renameActiveProject}
        onDelete={deleteActiveProject}
      />

      <nav className="mt-5 space-y-1.5">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = item.id === activeView || (item.id === "agent" && activeView === "agent-runs");
          return (
            <button
              key={item.id}
              className={`nav-row ${active ? "nav-row-active" : ""}`}
              onClick={() => {
                setActiveView(item.id);
                closeAgentNavigation();
              }}
            >
              <Icon size={17} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{item.label}</span>
              </span>
            </button>
          );
        })}
      </nav>

      <div className="mt-auto rounded-[14px] border border-white/[0.07] bg-white/[0.025] p-3 text-xs text-ink/55">
        <div className="mb-2 flex items-center gap-2 text-ink/75">
          <Database size={14} />
          本地数据层
        </div>
        <div>SQLite 承载论文主库与 Agent 运行，IndexedDB 保留界面设置和兼容数据。</div>
        <div className="mt-2 text-ink/35">v{__APP_VERSION__} · {libraryStatus ? formatBytes(libraryStatus.sizeBytes) : "loading"}</div>
      </div>
    </>
  );

  const shellScene: SideraShellScene = activeView === "agent"
    ? "agent"
    : activeView === "galaxy"
      ? "research-galaxy"
      : activeView === "pipeline" && pipelineSpatialState.active
        ? "pipeline-formation"
        : "workbench";
  const usesWorkbenchBackground = shellScene === "workbench" || shellScene === "pipeline-formation";
  const navigationLayout: SideraNavigationLayout = shellScene === "workbench"
    ? "workbench-reserve"
    : "spatial-overlay";
  const piAgentActivity = resolveSideraAgentActivity({
    generating: piGenerating,
    toolApproval: piToolApproval,
    terminal: piAgentTerminalActivity,
  });
  const activeInstitutionSearch = Object.values(institutionSearchSnapshots)
    .find((snapshot) => snapshot?.status === "searching") ?? null;
  const institutionActivity = activeInstitutionSearch?.status === "searching"
    ? { status: "generating" as const, label: "机构资源正在检索", canStop: true }
    : institutionTerminalActivity === "complete"
      ? { status: "complete" as const, label: "机构检索已完成", canStop: false }
      : institutionTerminalActivity === "failed"
        ? { status: "failed" as const, label: "机构检索失败", canStop: false }
        : { status: "idle" as const, label: "", canStop: false };
  const institutionWorkspaceVisible = activeView === "search"
    && resolvedLiteratureWorkspaceTab === "institution";

  useEffect(() => {
    if (!isDesktopRuntime() || !institutionWorkspaceVisible) return undefined;
    if (institutionRestoreAttemptedRef.current) return undefined;
    let disposed = false;
    let restoreStarted = false;
    // Defer the command until after React StrictMode's development-only
    // setup/cleanup probe. Otherwise the probe cancels the first restore and
    // leaves the one-shot ref set, so the real effect never starts it again.
    const restoreTimer = window.setTimeout(() => {
      if (disposed || institutionRestoreAttemptedRef.current) return;
      const current = institutionSessionRef.current;
      institutionRestoreAttemptedRef.current = true;
      if (current && current.status !== "uninitialized") return;
      restoreStarted = true;
      void restoreSideraInstitutionSession()
        .then((next) => {
          if (!disposed) applyInstitutionSessionState(next);
        })
        .catch((error) => {
          if (!disposed) {
            showNotice(
              error instanceof Error ? error.message : "机构会话静默恢复启动失败。",
              "error",
              { scope: "institution-sso" },
            );
          }
        });
    }, 0);
    return () => {
      disposed = true;
      window.clearTimeout(restoreTimer);
      if (restoreStarted) {
        void cancelSideraInstitutionSessionRestore().catch(() => undefined);
      }
    };
  }, [applyInstitutionSessionState, institutionWorkspaceVisible, showNotice]);

  return (
    <main
      className={`app-shell app-shell--${shellScene}`}
      data-shell-scene={shellScene}
      data-navigation-open={agentNavigationOpen ? "true" : "false"}
      data-navigation-layout={navigationLayout}
      data-navigation-opened-by={edgeNavigationOpenedBy ?? "none"}
    >
      <SideraTitleBar
        variant="transparent"
        toolsHostRef={setTitleBarToolsHost}
        onBeforeToggleMaximize={handleBeforeToggleMaximize}
        onAfterToggleMaximize={handleAfterToggleMaximize}
      />
      {activeView !== "agent" && titleBarToolsHost && piAgentActivity.status !== "idle" ? createPortal(
        <div
          className="sidera-agent-activity"
          data-status={piAgentActivity.status}
          role={piAgentActivity.status === "failed" ? "alert" : "status"}
          aria-live={piAgentActivity.status === "failed" ? "assertive" : "polite"}
        >
          <button
            type="button"
            className="sidera-agent-activity__return"
            title="返回研究 Agent"
            onClick={() => {
              setPiAgentTerminalActivity(null);
              setActiveView("agent");
            }}
          >
            {piAgentActivity.status === "generating" ? <Loader2 className="sidera-agent-activity__spinner" size={12} /> : null}
            {piAgentActivity.status === "awaiting-approval" || piAgentActivity.status === "failed" ? <AlertTriangle size={12} /> : null}
            {piAgentActivity.status === "complete" ? <Check size={12} /> : null}
            <span>{piAgentActivity.label}</span>
          </button>
          {piAgentActivity.canStop ? (
            <button
              type="button"
              className="sidera-agent-activity__stop"
              title="停止当前回答"
              aria-label="停止当前 Agent 回答"
              onClick={stopSideraGeneration}
            >
              <Square size={10} fill="currentColor" />
            </button>
          ) : null}
        </div>,
        titleBarToolsHost,
      ) : null}
      {!institutionWorkspaceVisible && titleBarToolsHost && institutionActivity.status !== "idle" ? createPortal(
        <div
          className="sidera-agent-activity sidera-institution-activity"
          data-status={institutionActivity.status}
          role={institutionActivity.status === "failed" ? "alert" : "status"}
          aria-live={institutionActivity.status === "failed" ? "assertive" : "polite"}
        >
          <button
            type="button"
            className="sidera-agent-activity__return"
            title="返回机构资源"
            onClick={() => {
              setInstitutionTerminalActivity(null);
              setLiteratureWorkspaceTab("institution");
              setActiveView("search");
            }}
          >
            {institutionActivity.status === "generating" ? <Loader2 className="sidera-agent-activity__spinner" size={12} /> : null}
            {institutionActivity.status === "failed" ? <AlertTriangle size={12} /> : null}
            {institutionActivity.status === "complete" ? <Check size={12} /> : null}
            <span>{institutionActivity.label}</span>
          </button>
          {institutionActivity.canStop ? (
            <button
              type="button"
              className="sidera-agent-activity__stop"
              title="停止当前机构检索"
              aria-label="停止当前机构检索"
              onClick={() => void cancelSideraInstitutionSearch(activeInstitutionSearch?.taskId)}
            >
              <Square size={10} fill="currentColor" />
            </button>
          ) : null}
        </div>,
        titleBarToolsHost,
      ) : null}
      <div
        className="sidera-edge-navigation-hotzone"
        data-phase={edgeNavigationPhase}
        onPointerEnter={armEdgeNavigation}
        onPointerLeave={cancelEdgeNavigationArm}
        aria-hidden="true"
      />
      {agentNavigationOpen ? (
        <>
          <button
            type="button"
            className="agent-navigation-scrim"
            aria-label="关闭导航抽屉"
            onClick={closeAgentNavigation}
          />
          <aside
            className="sidebar-surface agent-navigation-drawer"
            onPointerEnter={cancelNavigationAutoClose}
            onPointerLeave={scheduleNavigationAutoClose}
          >
            {renderSidebarContents()}
          </aside>
        </>
      ) : null}

      <section
        ref={workspaceRef}
        className={`workspace workspace--${shellScene} ${usesWorkbenchBackground ? "workspace--workbench" : ""} ${documentReaderActive ? "workspace--reader-active" : ""} ${institutionBrowserVisible ? `workspace--institution-browser-${institutionBrowserPresentation}` : ""}`}
      >
        {settings && activeProject && (
          <div
            className={`sidera-shell-background-layer ${activeView === "agent" ? "sidera-shell-background-layer--agent" : "sidera-shell-background-layer--workbench"}`}
            aria-hidden={activeView !== "agent"}
          >
            <AgentDualBackgroundPage
              key={agentBackgroundMountKey(
                settings.databaseDir,
                activeProject.id,
                agentMountRevision,
              )}
              settings={settings}
              activeProject={activeProject}
              hotspots={hotspots}
              shellPresentation={institutionBrowserVisible || documentReaderActive ? "suspended" : activeView === "agent" ? "agent" : usesWorkbenchBackground ? "workbench" : "suspended"}
              windowGeometryTransitionActive={windowGeometryTransitionActive}
              navigationOpen={agentNavigationOpen}
              onCloseNavigation={closeAgentNavigation}
              onPromptSubmit={(event) => void submitSideraPrompt(event)}
              conversationTurns={piConversationTurns}
              conversationGenerating={piGenerating}
              conversationError={piConversationError}
              conversations={piConversations}
              activeConversationId={piActiveConversation?.id}
              conversationLoading={piConversationLoading}
              sessionStats={piSessionStats}
              toolApproval={piToolApproval}
              onNewConversation={() => void createNewPiConversation()}
              onSelectConversation={(conversationId) => void openPiConversationById(conversationId)}
              onRenameConversation={(conversationId, title) => void renamePiConversationById(conversationId, title)}
              onArchiveConversation={(conversationId) => void archivePiConversationById(conversationId)}
              onRestoreConversation={(conversationId) => void restorePiConversationById(conversationId)}
              onDeleteConversation={(conversationId) => void deletePiConversationById(conversationId)}
              onDecideToolApproval={(decision) => void decidePiToolApproval(decision)}
              onStopGeneration={stopSideraGeneration}
              onOpenSettings={() => setActiveView("settings")}
              onInitialReady={agentInitialCallbacks.ready}
              onInitialError={agentInitialCallbacks.error}
              forceStaticBackground={sideraStaticBackground}
              onOpenPaperDetail={(paperId, title) => {
                setSearchFocusIntent({ query: title || "", paperId, timestamp: Date.now() });
                setActiveView("search");
              }}
              onOpenHotspotDetail={(hotspotId) => {
                setHotspotFocusIntent({ hotspotId, timestamp: Date.now() });
                setActiveView("hotspots");
              }}
              onOpenDocumentEvidence={(reference) => {
                if (!reference.paperId || !reference.documentVersionId || !reference.anchor) return;
                setDocumentEvidenceFocusIntent({
                  paperId: reference.paperId,
                  versionId: reference.documentVersionId,
                  title: papers.find((paper) => paper.id === reference.paperId)?.title ?? "文档证据",
                  anchor: reference.anchor,
                  timestamp: Date.now(),
                });
                setLiteratureWorkspaceTab("library");
                setActiveView("search");
              }}
              onOpenRunCenter={() => setActiveView("agent-runs")}
              onOpenPipeline={() => setActiveView("pipeline")}
            />
          </div>
        )}
        {activeView === "dashboard" && (
          <DashboardView dashboard={dashboard} papers={papers} hotspots={hotspots} reports={reports} jobs={jobs} taskLogs={taskLogs} settings={settings} libraryMutationStatus={libraryMutationStatus} libraryStatus={libraryStatus} v20Snapshot={v20Snapshot} loading={loading} onNavigate={setActiveView} />
        )}
        {activeView === "agent-runs" && settings && activeProject && (
          <AgentWorkspace
            settings={settings}
            activeProject={activeProject}
            libraryStatus={libraryStatus}
            v20Snapshot={v20Snapshot}
            documentIndexActivity={documentIndexActivity}
            visualReviewScenario={agentVisualReviewScenario}
            onNavigate={setActiveView}
            onOpenPaper={(paperId, title) => {
              setSearchFocusIntent({ query: title || "", paperId, timestamp: Date.now() });
              setActiveView("search");
            }}
            onNotice={showNotice}
          />
        )}
        {activeView === "search" && settings && activeProject && (
          <SearchWorkspace
            settings={settings}
            activeProject={activeProject}
            libraryStatus={libraryStatus}
            libraryFacets={libraryFacets}
            libraryBootstrap={libraryBootstrap}
            searchFocusIntent={searchFocusIntent}
            documentEvidenceFocusIntent={documentEvidenceFocusIntent}
            onClearDocumentEvidenceFocus={() => setDocumentEvidenceFocusIntent(null)}
            workspaceTab={literatureWorkspaceTab}
            onWorkspaceTabChange={setLiteratureWorkspaceTab}
            institutionSession={institutionSession}
            institutionSearchSnapshots={institutionSearchSnapshots}
            researchSearchState={researchSearchState}
            researchSearchQuery={researchSearchQuery}
            selectedResearchCandidateIds={selectedResearchCandidateIds}
            institutionBrowserPresentation={institutionBrowserPresentation}
            onInstitutionSessionChange={applyInstitutionSessionState}
            onInstitutionSearchSnapshotChange={(next) => {
              setInstitutionSearchSnapshots((current) => ({ ...current, [next.source]: next }));
            }}
            onResearchSearchQueryChange={setResearchSearchQuery}
            onSelectedResearchCandidateIdsChange={setSelectedResearchCandidateIds}
            onStartResearchSearch={submitResearchSearch}
            onStopResearchSearch={stopResearchSearch}
            onInstitutionBrowserPresentationChange={updateInstitutionBrowserPresentation}
            onDocumentReaderActiveChange={setDocumentReaderActive}
            onDocumentIndexActivityChange={setDocumentIndexActivity}
            agentConversationTurns={piConversationTurns}
            agentGenerating={piGenerating}
            agentError={piConversationError}
            onAskEvidence={(prompt, readingContext) => void submitSideraPrompt({
              text: prompt,
              backgroundMode: "immersive",
              submittedAtMs: Date.now(),
              readingContext,
            })}
            onStopEvidenceAnswer={stopSideraGeneration}
            onNavigate={setActiveView}
            onRefresh={refreshAll}
            onNotice={showNotice}
            onClearNoticeScope={clearNoticeScope}
          />
        )}
        {(activeView === "galaxy" || galaxyVisited) && settings && activeProject && (
          <div className={activeView === "galaxy" ? "contents" : "hidden"} aria-hidden={activeView !== "galaxy"}>
            <GalaxyView
              key={galaxySessionCacheKey(settings.databaseDir, activeProject.id)}
              active={activeView === "galaxy"}
              navigationOpen={agentNavigationOpen}
              titleBarToolsHost={titleBarToolsHost}
              hotspots={hotspots}
              papers={papers}
              settings={settings}
              activeProject={activeProject}
              libraryStatus={libraryStatus}
              v20Snapshot={v20Snapshot}
              app17Session={galaxySessionsRef.current.get(galaxySessionCacheKey(settings.databaseDir, activeProject.id)) ?? EMPTY_GALAXY_SESSION}
              app17SessionKey={galaxySessionCacheKey(settings.databaseDir, activeProject.id)}
              visualReview={galaxyVisualReview}
              visualReviewIntent={galaxyVisualReviewIntent}
              onEnsureApp17={() => ensureGalaxySession(settings, activeProject)}
              onRefreshApp17={() => ensureGalaxySession(settings, activeProject, true)}
              onOpenPipeline={() => setActiveView("pipeline")}
              onOpenPaperList={(hotspot) => {
                setSearchFocusIntent({ query: hotspot.keywords[0] || hotspot.title, field: hotspot.field, timestamp: Date.now() });
                setActiveView("search");
              }}
              onOpenPaper={(paper) => {
                setSearchFocusIntent({ query: paper.title, field: paper.field, paperId: paper.id, timestamp: Date.now() });
                setActiveView("search");
              }}
            />
          </div>
        )}
        {activeView === "hotspots" && settings && activeProject && <HotspotLibrary hotspots={hotspots} settings={settings} activeProject={activeProject} focusIntent={hotspotFocusIntent} onNavigate={setActiveView} onRefresh={refreshAll} onNotice={showNotice} />}
        {activeView === "reports" && <ReportLibrary reports={reports} papers={papers} settings={settings} activeProject={activeProject} onRefresh={refreshAll} onNotice={showNotice} />}
        {activeView === "pipeline" && settings && activeProject && <PipelineView jobs={jobs} taskLogs={taskLogs} papers={papers} hotspots={hotspots} settings={settings} activeProject={activeProject} libraryMutationStatus={libraryMutationStatus} libraryStatus={libraryStatus} v20Snapshot={v20Snapshot} onNavigate={setActiveView} onRefresh={refreshAll} onNotice={showNotice} onSpatialStateChange={setPipelineSpatialState} />}
        {activeView === "logs" && settings && <LogsView taskLogs={taskLogs} allTaskLogs={allTaskLogs} projects={projects} activeProject={activeProject} papers={papers} settings={settings} onRefresh={refreshAll} onNotice={showNotice} />}
        {activeView === "health" && settings && <HealthView settings={settings} papers={papers} libraryStatus={libraryStatus} onNavigate={setActiveView} onRefresh={refreshAll} onNotice={showNotice} />}
        {activeView === "about" && <AboutView settings={settings} libraryStatus={libraryStatus} hotspots={hotspots} reports={reports} />}
        {activeView === "settings" && settings && (
          <SettingsView
            settings={settings}
            institutionSession={institutionSession}
            onOpenInstitutionResources={() => {
              setLiteratureWorkspaceTab("institution");
              setActiveView("search");
            }}
            onSave={saveSettings}
            onRefresh={refreshAll}
            onNotice={showNotice}
          />
        )}
      </section>

      {loading && !sideraSplashMounted && (
        <div className="startup-overlay">
          <div className="panel-card flex min-w-[320px] items-center gap-3">
            <Loader2 className="animate-spin text-cyan" size={20} />
            <div>
              <div className="text-sm font-semibold text-ink">正在加载本地科研工作台</div>
              <div className="mt-1 text-xs text-ink/45">初始化 IndexedDB、设置与任务日志</div>
            </div>
          </div>
        </div>
      )}

      {notice && (
        <div
          className={`toast toast--${notice.kind}`}
          role={notice.kind === "error" ? "alert" : "status"}
          aria-live={notice.kind === "error" ? "assertive" : "polite"}
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              dismissNotice(notice.id);
            }
          }}
        >
          <span className="toast__message">{notice.message}</span>
          <button
            type="button"
            className="toast__close"
            aria-label="关闭通知"
            onClick={() => dismissNotice(notice.id)}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      )}
      {sideraSplash}
    </main>
  );

  async function saveSettings(next: AiSettings) {
    const currentLibraryIdentity = settings && activeProject
      ? agentBackgroundLibraryIdentity(settings.databaseDir, activeProject.id)
      : "";
    const nextLibraryIdentity = activeProject
      ? agentBackgroundLibraryIdentity(next.databaseDir, activeProject.id)
      : "";
    const changesLibrary = Boolean(
      settings
      && activeProject
      && currentLibraryIdentity !== nextLibraryIdentity,
    );
    const changesPiSession = Boolean(settings && (
      next.provider !== settings.provider
      || next.baseUrl.trim() !== settings.baseUrl.trim()
      || next.model.trim() !== settings.model.trim()
      || next.useEnvKey !== settings.useEnvKey
      || next.sideraCacheRetention !== settings.sideraCacheRetention
      || changesLibrary
    ));
    if (changesPiSession && !await preparePiConversationChange("修改 Agent 配置")) {
      showNotice("已保留当前 Agent 回答，设置未保存。", "info");
      return;
    }
    let effectiveSettings = next;
    if (activeProject && isDesktopRuntime()) {
      const apiCredentialConfigured = next.manualApiKey.trim()
        ? (await setAppCredential(activeProject.id, `ai-${next.provider}`, next.manualApiKey)).configured
        : (await getAppCredentialStatus(activeProject.id, `ai-${next.provider}`)).configured;
      const mysqlCredentialConfigured = next.mysql.password.trim()
        ? (await setAppCredential(activeProject.id, "mysql", next.mysql.password)).configured
        : (await getAppCredentialStatus(activeProject.id, "mysql")).configured;
      effectiveSettings = {
        ...next,
        manualApiKey: "",
        apiCredentialConfigured,
        mysql: { ...next.mysql, password: "", credentialConfigured: mysqlCredentialConfigured },
      };
    }
    if (settings && changesLibrary) {
      const nextDir = next.databaseDir.trim();
      if (!nextDir) throw new Error("SQLite 论文库目录不能为空。");
      const useExisting = await validateLibraryLocation(nextDir, "existing");
      if (!useExisting.valid) {
        const canMigrate = await validateLibraryLocation(nextDir, "empty");
        if (!canMigrate.valid) throw new Error(canMigrate.message);
        if (!window.confirm("新目录中没有现有论文库。是否将当前 SQLite 论文库复制到新目录？原目录数据会保留。")) {
          throw new Error("已取消论文库目录迁移。");
        }
        const backup = await backupPaperLibrary({
          databaseDir: settings.databaseDir,
          backupDir: nextDir,
          projectId: settings.projectId,
        });
        await restorePaperLibrary({
          databaseDir: nextDir,
          backupPath: backup.backupPath,
          projectId: settings.projectId,
        });
      }
      await prepareLibraryDatabase(nextDir);
      effectiveSettings = {
        ...effectiveSettings,
        dataDir: nextDir,
        databaseDir: nextDir,
        librarySetupCompleted: true,
        librarySetupMode: "existing",
      };
    }
    await saveAiSettings(effectiveSettings);
    await refreshAll();
    if (changesLibrary && activeProject) {
      advanceAgentBackgroundLibrary(effectiveSettings.databaseDir, activeProject.id);
    }
    showNotice("设置已保存。", "success");
  }

  async function switchProject(projectId: string) {
    if (!await preparePiConversationChange("切换项目")) return;
    await activateProject(projectId);
    await refreshAll();
    showNotice("项目已切换。", "success");
  }

  async function createNewProject() {
    const name = window.prompt("新项目名称", "新的科研课题");
    if (name === null) return;
    if (!await preparePiConversationChange("创建并切换项目")) return;
    await createProject(name);
    await refreshAll();
    showNotice("项目已创建并切换。", "success");
  }

  async function renameActiveProject() {
    if (!activeProject) return;
    const name = window.prompt("项目新名称", activeProject.name);
    if (name === null) return;
    await renameProject(activeProject.id, name);
    await refreshAll();
    showNotice("项目已重命名。", "success");
  }

  async function deleteActiveProject() {
    if (!activeProject) return;
    if (!window.confirm(`确认删除项目“${activeProject.name}”？该项目下的文献、热点、报告和日志都会删除。`)) return;
    if (!await preparePiConversationChange("删除当前项目")) return;
    try {
      await deleteProject(activeProject.id);
      await refreshAll();
      showNotice("项目已删除。", "success");
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "项目删除失败。", "error");
    }
  }
}

function LibrarySetupView({
  state,
  onComplete,
}: {
  state: LibrarySetupState;
  onComplete: (result: InitializeLibraryResult) => Promise<void>;
}) {
  const [databaseDir, setDatabaseDir] = useState(state.databaseDir ?? "");
  const [mode, setMode] = useState<LibrarySetupMode>(state.databaseExists ? "existing" : state.seedAvailable ? "seed" : "empty");
  const [validation, setValidation] = useState<LibraryLocationValidation | null>(null);
  const [validationBusy, setValidationBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(state.message);
  const [error, setError] = useState("");
  const validationRequestRef = useRef(0);

  const normalizedDatabaseDir = databaseDir.trim().replace(/[\\/]+$/, "").toLocaleLowerCase();
  const normalizedInitialDatabaseDir = (state.databaseDir ?? "").trim().replace(/[\\/]+$/, "").toLocaleLowerCase();
  const validationMatchesCurrentDir = Boolean(
    validation
      && validation.databaseDir.trim().replace(/[\\/]+$/, "").toLocaleLowerCase() === normalizedDatabaseDir,
  );
  const existingDatabaseDetected = Boolean(
    (validationMatchesCurrentDir && validation?.existingDatabase)
    || (state.databaseExists && normalizedInitialDatabaseDir && normalizedInitialDatabaseDir === normalizedDatabaseDir),
  );
  const knownPrecontractV14 = validationMatchesCurrentDir
    && validation?.schemaContractStatus === "known-precontract-v14";

  useEffect(() => {
    const trimmedDir = databaseDir.trim();
    const requestId = ++validationRequestRef.current;
    if (!trimmedDir) {
      setValidation(null);
      setValidationBusy(false);
      return;
    }

    setValidationBusy(true);
    const timer = window.setTimeout(() => {
      setError("");
      void validateLibraryLocation(trimmedDir, mode)
        .then((result) => {
          if (requestId !== validationRequestRef.current) return;
          setValidation(result);
          if (result.existingDatabase && mode !== "existing") {
            setMode("existing");
            setMessage(
              result.schemaContractStatus === "known-precontract-v14"
                ? "检测到开发版早期 v14，可先备份并安全补全；现有论文不会被覆盖。"
                : "所选目录已包含论文库，已切换为“使用现有 SQLite 论文库”；默认数据和空白库不会覆盖它。",
            );
            return;
          }
          setMessage(result.message);
        })
        .catch((reason) => {
          if (requestId !== validationRequestRef.current) return;
          setValidation(null);
          setMessage(reason instanceof Error ? reason.message : String(reason));
        })
        .finally(() => {
          if (requestId === validationRequestRef.current) setValidationBusy(false);
        });
    }, 180);

    return () => window.clearTimeout(timer);
  }, [databaseDir, mode]);

  const options: Array<{ id: LibrarySetupMode; title: string; description: string; disabled?: boolean }> = [
    {
      id: "seed",
      title: "安装默认论文数据",
      description: state.seedAvailable
        ? `V20 快照包含 ${state.seedPaperCount?.toLocaleString("zh-CN") ?? "-"} 篇论文、${state.seedHotspotCount?.toLocaleString("zh-CN") ?? "-"} 个热点与 ${state.seedMembershipCount?.toLocaleString("zh-CN") ?? "-"} 条归属，约 ${formatBytes(state.seedSizeBytes ?? 0)}。`
        : "当前 Lite 安装包未包含默认数据。",
      disabled: !state.seedAvailable || existingDatabaseDetected,
    },
    {
      id: "empty",
      title: "空白开始",
      description: "创建完整但不含论文的本地 SQLite 库，稍后自行导入数据。",
      disabled: existingDatabaseDetected,
    },
    {
      id: "existing",
      title: "使用现有 SQLite 论文库",
      description: knownPrecontractV14
        ? "检测到开发版早期 v14；完成配置时会先生成带 SHA-256 的独立备份，再原地补全最终契约。"
        : "所选目录必须包含 research-hotspots-v7.sqlite。合法旧库可接入，但没有 V20 快照时需稍后显式运行热点建模。",
    },
  ];

  async function chooseDirectory() {
    const selected = await chooseExportDirectory("选择论文数据库目录");
    if (!selected) return;
    setDatabaseDir(selected);
    setError("");
    setMessage("目录已选择，开始前会检查写入权限、剩余空间与现有数据库。 ");
  }

  async function submit() {
    if (!databaseDir.trim()) {
      setError("请先选择数据库目录。");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("正在检查目录与论文库状态...");
    try {
      const validation = await validateLibraryLocation(databaseDir, mode);
      if (!validation.valid) throw new Error(validation.message);
      setMessage(
        mode === "seed"
          ? "正在复制并校验默认论文库，请勿关闭应用..."
          : mode === "empty"
            ? "正在创建空白论文库..."
            : validation.schemaContractStatus === "known-precontract-v14"
              ? "正在备份并安全补全开发版早期 v14；现有论文不会被覆盖..."
              : "正在迁移、严格校验并接入现有论文库...",
      );
      const result = await initializeLibrary(databaseDir, mode);
      setMessage(result.summary);
      await onComplete(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setMessage("初始化未完成。数据目录中的已有论文库不会被覆盖。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="library-setup-shell">
      <section className="library-setup-workspace" aria-labelledby="library-setup-title">
        <header className="library-setup-header">
          <div className="brand-mark"><Sparkles size={22} /></div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan/80">Sidera</div>
            <h1 id="library-setup-title">配置本地论文库</h1>
            <p>论文数据存放在您选择的目录中。升级或卸载应用不会删除该目录。</p>
          </div>
          <span className="library-setup-edition">{state.seedAvailable ? "Full" : "Lite"} · v{__APP_VERSION__}</span>
        </header>

        <div className="library-setup-section">
          <div className="library-setup-section-title">
            <span>1</span>
            <div><strong>选择数据库目录</strong><small>建议选择空间充足、长期保留且当前用户可写的目录。</small></div>
          </div>
          <div className="library-setup-path-row">
            <div className="library-setup-path" title={databaseDir}>{databaseDir || "尚未选择目录"}</div>
            <button className="icon-text-button" type="button" onClick={chooseDirectory} disabled={busy}>
              <FolderKanban size={16} /> 选择目录
            </button>
          </div>
        </div>

        <div className="library-setup-section">
          <div className="library-setup-section-title">
            <span>2</span>
            <div><strong>选择初始化方式</strong><small>已有同名数据库时，应用始终拒绝覆盖。</small></div>
          </div>
          <div className="library-setup-options">
            {options.map((option) => (
              <button
                key={option.id}
                type="button"
                disabled={busy || option.disabled}
                className={`library-setup-option ${mode === option.id ? "library-setup-option-active" : ""}`}
                onClick={() => { setMode(option.id); setError(""); }}
              >
                <span className="library-setup-radio">{mode === option.id ? <Check size={14} /> : null}</span>
                <span><strong>{option.title}</strong><small>{option.description}</small></span>
              </button>
            ))}
          </div>
          {knownPrecontractV14 && (
            <div className="library-setup-message" role="status">
              <ShieldCheck size={16} />
              <span>检测到开发版早期 v14，可先备份并安全补全；现有论文不会被覆盖。</span>
            </div>
          )}
        </div>

        <footer className="library-setup-footer">
          <div className={`library-setup-message ${error ? "library-setup-error" : ""}`}>
            {error ? <AlertTriangle size={16} /> : <ShieldCheck size={16} />}
            <span>{error || message}</span>
          </div>
          <button className="primary-button" type="button" disabled={busy || validationBusy || !databaseDir.trim()} onClick={submit}>
            {busy ? <Loader2 className="animate-spin" size={16} /> : <Database size={16} />}
            {busy ? "正在初始化" : validationBusy ? "正在检查目录" : "完成配置并进入应用"}
          </button>
        </footer>
      </section>
    </main>
  );
}

function buildDashboardFromLibrary(status: PaperLibraryStatus, facets: PaperLibraryFacets, hotspots: Hotspot[], reports: ResearchReport[], jobs: PipelineJob[]): DashboardData {
  return {
    paperCount: status.paperCount,
    hotspotCount: hotspots.length,
    reportCount: reports.length,
    fieldCount: facets.fields.length,
    latestReport: reports[0],
    latestJob: jobs.at(-1),
    sourceCounts: facets.sources.map((row) => ({ source: row.value as SourceKind, count: row.count })),
    yearlyCounts: facets.years
      .map((row) => ({ year: Number(row.value), count: row.count }))
      .filter((row) => Number.isFinite(row.year))
      .sort((a, b) => a.year - b.year),
  };
}

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function ProjectSwitcher({
  projects,
  activeProject,
  onSwitch,
  onCreate,
  onRename,
  onDelete,
}: {
  projects: Project[];
  activeProject: Project | null;
  onSwitch: (projectId: string) => Promise<void>;
  onCreate: () => Promise<void>;
  onRename: () => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  return (
    <section className="project-card">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-ink/70">
        <FolderKanban size={14} />
        当前项目
      </div>
      <SelectControl
        className="h-9 text-xs"
        value={activeProject?.id ?? ""}
        options={projects.map((project) => ({ value: project.id, label: project.name }))}
        onChange={(value) => void onSwitch(value)}
      />
      <FoldSection title="项目操作" compact>
      <div className="grid grid-cols-3 gap-2">
        <button className="secondary-action h-8 px-2" onClick={() => void onCreate()} title="创建项目">
          <Plus size={14} />
        </button>
        <button className="secondary-action h-8 px-2" onClick={() => void onRename()} disabled={!activeProject} title="重命名项目">
          <Edit3 size={14} />
        </button>
        <button className="danger-action h-8 px-2" onClick={() => void onDelete()} disabled={!activeProject} title="删除项目">
          <Trash2 size={14} />
        </button>
      </div>
      <div className="mt-2 truncate text-[11px] text-ink/35">{activeProject?.description || "文献、热点、报告、日志和设置按项目隔离。"}</div>
      </FoldSection>
    </section>
  );
}

type SelectOption = {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
};

function SelectControl({
  value,
  options,
  onChange,
  className = "h-10 text-sm",
  placeholder = "请选择",
}: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const ref = useRef<HTMLDivElement | null>(null);
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;
    setActiveIndex(Math.max(0, options.findIndex((option) => option.value === value)));
    function handlePointerDown(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open, options, value]);

  function commit(nextIndex: number) {
    const option = options[nextIndex];
    if (!option || option.disabled) return;
    onChange(option.value);
    setOpen(false);
  }

  function selectableIndex(start: number, direction: -1 | 1) {
    let index = start;
    while (index >= 0 && index < options.length) {
      if (!options[index]?.disabled) return index;
      index += direction;
    }
    return Math.max(0, Math.min(options.length - 1, start));
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) setOpen(true);
      setActiveIndex((current) => selectableIndex(Math.min(options.length - 1, current + 1), 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) setOpen(true);
      setActiveIndex((current) => selectableIndex(Math.max(0, current - 1), -1));
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) commit(activeIndex);
      else setOpen(true);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="select-wrap" ref={ref}>
      <button
        type="button"
        className={`select-trigger ${open ? "select-open" : ""} ${className} px-3`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleKeyDown}
      >
        <span className="min-w-0 truncate">{selected?.label ?? placeholder}</span>
        <ChevronDown className={`shrink-0 text-ink/40 transition ${open ? "rotate-180" : ""}`} size={15} />
      </button>
      {open && (
        <div className="select-popover" role="listbox">
          {options.map((option, index) => {
            const selectedOption = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selectedOption}
                aria-disabled={option.disabled || undefined}
                disabled={option.disabled}
                className={`select-option ${index === activeIndex ? "select-option-active" : ""} ${selectedOption ? "select-option-selected" : ""} disabled:cursor-not-allowed disabled:opacity-45`}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => commit(index)}
              >
                <span className="min-w-0">
                  <span className="block truncate">{option.label}</span>
                  {option.description && <span className="block truncate text-[11px] text-ink/[0.38]">{option.description}</span>}
                </span>
                {selectedOption && <Check size={14} className="shrink-0 text-cyan" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FoldSection({
  title,
  children,
  defaultOpen = false,
  compact = false,
  flush = false,
  right,
  onOpenChange,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  compact?: boolean;
  flush?: boolean;
  right?: ReactNode;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`fold-section ${compact ? "fold-section-compact" : ""} ${flush ? "fold-section-flush" : ""}`} data-open={open}>
      <button
        type="button"
        className="fold-header"
        onClick={() => {
          const nextOpen = !open;
          setOpen(nextOpen);
          onOpenChange?.(nextOpen);
        }}
        aria-expanded={open}
      >
        <span className="min-w-0 truncate">{title}</span>
        <span className="ml-auto flex shrink-0 items-center gap-2">
          {right}
          <ChevronDown className={`text-ink/38 transition ${open ? "rotate-180" : ""}`} size={15} />
        </span>
      </button>
      {open && <div className="fold-content">{children}</div>}
    </section>
  );
}

type DashboardStage = "prepare" | "clean" | "cluster" | "hotspot" | "report";
type DashboardStepState = "pending" | "running" | "done" | "failed";

type DashboardPrimaryAction = {
  stage: DashboardStage;
  stageLabel: string;
  title: string;
  description: string;
  buttonLabel: string;
  target: ActiveView;
  icon: LucideIcon;
  tone: "default" | "running" | "error" | "ready";
};

type DashboardProgressStep = {
  id: DashboardStage;
  title: string;
  detail: string;
  state: DashboardStepState;
};

function dashboardStepStateLabel(state: DashboardStepState) {
  if (state === "done") return "已完成";
  if (state === "running") return "进行中";
  if (state === "failed") return "失败";
  return "未开始";
}

function dashboardSourceLabel(source: SourceKind) {
  if (source === "arxiv") return "arXiv";
  if (source === "openalex") return "OpenAlex";
  if (source === "cnki") return "CNKI";
  if (source === "institution") return "机构资源";
  return "本地导入";
}

function reportReviewGate(content: string, papers: Paper[]) {
  const auditSnapshot = auditReport(content, papers);
  const approved = auditSnapshot.riskLevel !== "high";
  return {
    reviewStatus: approved ? "approved" as const : "needs-review" as const,
    auditSnapshot,
    reviewedAt: approved ? nowIso() : undefined,
    reviewedBy: approved ? "system-quality-gate" : undefined,
  };
}

function dashboardReportModeLabel(mode: ResearchReport["mode"]) {
  if (mode === "deep") return "深版";
  if (mode === "revised") return "修订版";
  return "简版";
}

function DashboardView({
  dashboard,
  papers,
  hotspots,
  reports,
  jobs,
  taskLogs,
  settings,
  libraryMutationStatus,
  libraryStatus,
  v20Snapshot,
  loading,
  onNavigate,
}: {
  dashboard: DashboardData | null;
  papers: Paper[];
  hotspots: Hotspot[];
  reports: ResearchReport[];
  jobs: PipelineJob[];
  taskLogs: TaskLog[];
  settings: AiSettings | null;
  libraryMutationStatus: LibraryMutationStatus | null;
  libraryStatus: PaperLibraryStatus | null;
  v20Snapshot: V20HotspotSnapshot | null;
  loading: boolean;
  onNavigate: (view: ActiveView) => void;
}) {
  const paperCount = libraryStatus?.paperCount ?? dashboard?.paperCount ?? papers.length;
  const analysisProgress = useMemo(() => deriveAnalysisProgress({
    paperCount,
    hotspotCount: hotspots.length,
    jobs,
    snapshot: v20Snapshot,
    databaseKey: settings?.databaseDir,
    executionSessionId: PIPELINE_EXECUTION_SESSION_ID,
    activeMutationKind: libraryMutationStatus?.operationKind,
  }), [hotspots.length, jobs, libraryMutationStatus?.operationKind, paperCount, settings?.databaseDir, v20Snapshot]);
  const { cleanJob, clusterJob } = analysisProgress;
  const cleanRunning = analysisProgress.cleanState === "running";
  const clusterRunning = analysisProgress.clusterState === "running";
  const cleanDone = analysisProgress.cleanState === "done";
  const clusterDone = analysisProgress.clusterState === "done";
  const latestTaskLog = useMemo(
    () => taskLogs.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0],
    [taskLogs],
  );
  const topHotspot = useMemo(
    () => hotspots.slice().sort((a, b) => b.paperCount - a.paperCount || (b.confidence ?? 0) - (a.confidence ?? 0) || a.title.localeCompare(b.title))[0],
    [hotspots],
  );
  const latestReport = useMemo(
    () => reports.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0],
    [reports],
  );
  const sourceRows = (dashboard?.sourceCounts ?? []).slice().sort((a, b) => b.count - a.count).slice(0, 5);
  const sourceMax = Math.max(1, ...sourceRows.map((row) => row.count));
  const yearRows = dashboard?.yearlyCounts ?? [];
  const firstYear = yearRows[0];
  const latestYear = yearRows.at(-1);
  const yearRange = firstYear && latestYear ? `${firstYear.year}-${latestYear.year}` : "暂无年份";

  const cleanStepState: DashboardStepState = analysisProgress.cleanState;
  const clusterStepState: DashboardStepState = analysisProgress.clusterState;
  const progressSteps: DashboardProgressStep[] = [
    {
      id: "prepare",
      title: "文献准备",
      detail: paperCount > 0 ? `${paperCount.toLocaleString()} 篇已入库` : "等待导入文献",
      state: paperCount > 0 ? "done" : "pending",
    },
    {
      id: "clean",
      title: "清洗去重",
      detail: cleanJob?.detail || "规范化并去除重复记录",
      state: cleanStepState,
    },
    {
      id: "cluster",
      title: "热点建模",
      detail: clusterDone
        ? `${hotspots.length} 个热点 · V20 快照已同步`
        : analysisProgress.snapshotStale
          ? "论文库已变化，需要重新运行热点建模"
          : clusterJob?.detail || "生成热点与演化趋势",
      state: clusterStepState,
    },
    {
      id: "report",
      title: "报告成果",
      detail: latestReport ? `${reports.length} 份报告` : "等待生成首份报告",
      state: latestReport ? "done" : "pending",
    },
  ];
  const completedStepCount = progressSteps.filter((step) => step.state === "done").length;
  const workflowComplete = completedStepCount === progressSteps.length;

  let primaryAction: DashboardPrimaryAction;
  if (paperCount === 0) {
    primaryAction = {
      stage: "prepare",
      stageLabel: "文献准备",
      title: "从建立本地文献库开始",
      description: "检索在线来源或导入本地文件，为清洗、建模和证据报告准备数据。",
      buttonLabel: "前往检索与导入",
      target: "search",
      icon: Search,
      tone: "default",
    };
  } else if (cleanRunning) {
    primaryAction = {
      stage: "clean",
      stageLabel: "清洗去重",
      title: "清洗任务正在进行",
      description: cleanJob?.detail || "正在规范化文献字段并处理重复记录。",
      buttonLabel: "查看清洗进度",
      target: "pipeline",
      icon: Loader2,
      tone: "running",
    };
  } else if (cleanStepState === "failed") {
    primaryAction = {
      stage: "clean",
      stageLabel: "清洗去重",
      title: "上次清洗未完成",
      description: cleanJob?.detail || "进入分析流水线查看失败原因并重试当前步骤。",
      buttonLabel: "处理清洗问题",
      target: "pipeline",
      icon: RefreshCw,
      tone: "error",
    };
  } else if (!cleanDone) {
    primaryAction = {
      stage: "clean",
      stageLabel: "清洗去重",
      title: "文献已就绪，下一步进行清洗",
      description: `本地库已有 ${paperCount.toLocaleString()} 篇文献，建议先规范字段并去除重复记录。`,
      buttonLabel: "开始清洗去重",
      target: "pipeline",
      icon: RefreshCw,
      tone: "default",
    };
  } else if (clusterRunning) {
    primaryAction = {
      stage: "cluster",
      stageLabel: "热点建模",
      title: "热点建模正在进行",
      description: clusterJob?.detail || "正在生成热点、关键词权重和演化趋势。",
      buttonLabel: "查看建模进度",
      target: "pipeline",
      icon: Loader2,
      tone: "running",
    };
  } else if (clusterStepState === "failed") {
    primaryAction = {
      stage: "cluster",
      stageLabel: "热点建模",
      title: "上次热点建模未完成",
      description: clusterJob?.detail || "进入分析流水线查看失败原因并重新运行热点建模。",
      buttonLabel: "处理建模问题",
      target: "pipeline",
      icon: Network,
      tone: "error",
    };
  } else if (!clusterDone) {
    primaryAction = {
      stage: "cluster",
      stageLabel: "热点建模",
      title: "清洗完成，可以生成科研热点",
      description: "运行热点建模，生成关键词、置信度、演化趋势和星图坐标。",
      buttonLabel: "开始热点建模",
      target: "pipeline",
      icon: Network,
      tone: "default",
    };
  } else if (!latestReport) {
    primaryAction = {
      stage: "hotspot",
      stageLabel: "热点证据",
      title: "热点已经生成，下一步确认研究证据",
      description: `当前已有 ${hotspots.length} 个热点，可选择热点查看代表论文并生成首份报告。`,
      buttonLabel: "查看热点结果",
      target: "hotspots",
      icon: Atom,
      tone: "ready",
    };
  } else {
    primaryAction = {
      stage: "report",
      stageLabel: "报告成果",
      title: "最新报告已经就绪",
      description: `${latestReport.topic} · ${dashboardReportModeLabel(latestReport.mode)} · ${formatDateTime(latestReport.createdAt)}`,
      buttonLabel: "阅读最新报告",
      target: "reports",
      icon: FileText,
      tone: "ready",
    };
  }

  const PrimaryActionIcon = primaryAction.icon;
  const taskSummary = latestTaskLog
    ? latestTaskLog.status === "failed"
      ? taskErrorSummary(latestTaskLog.error || latestTaskLog.outputSummary || "任务执行失败。")
      : latestTaskLog.outputSummary || "该任务没有输出摘要。"
    : "运行清洗、建模、备份或健康检查后，这里会显示最近结果。";

  return (
    <div className="page-grid dashboard-page">
      <header className="page-header">
        <div>
          <h1>总览</h1>
          <p className="page-subtitle">查看当前项目阶段、下一步行动和最近科研成果。</p>
        </div>
      </header>

      <section className={`dashboard-action-panel dashboard-action-${primaryAction.tone}`}>
        <div className="dashboard-action-copy">
          <div className="dashboard-action-stage">当前阶段 · {primaryAction.stageLabel}</div>
          <h2>{primaryAction.title}</h2>
          <p>{primaryAction.description}</p>
        </div>
        <button type="button" className="primary-action dashboard-primary-action h-10 gap-2" onClick={() => onNavigate(primaryAction.target)}>
          <PrimaryActionIcon className={primaryAction.tone === "running" ? "animate-spin" : ""} size={16} />
          {primaryAction.buttonLabel}
        </button>
      </section>

      <section className="dashboard-status-strip" aria-label="项目状态摘要">
        <div><span>SQLite 文献</span><strong>{loading ? "..." : paperCount.toLocaleString()}</strong></div>
        <div><span>数据库体积</span><strong>{loading ? "..." : formatBytes(libraryStatus?.sizeBytes ?? 0)}</strong></div>
        <div><span>学科</span><strong>{dashboard?.fieldCount ?? 0}</strong></div>
        <div><span>热点</span><strong>{hotspots.length}</strong></div>
        <div><span>报告</span><strong>{reports.length}</strong></div>
      </section>

      {workflowComplete ? (
        <section className="dashboard-progress-complete">
          <div><CheckCircle2 size={17} /><strong>项目流程已完成</strong><span>文献准备、清洗、建模和报告成果均已就绪。</span></div>
          <button type="button" onClick={() => onNavigate("pipeline")}>查看分析流水线<ArrowRight size={14} /></button>
        </section>
      ) : (
        <section className="dashboard-progress-panel">
          <div className="dashboard-section-heading">
            <div><h2>项目进度</h2><p>完成 {completedStepCount} / {progressSteps.length} 个阶段</p></div>
            <button type="button" onClick={() => onNavigate("pipeline")}>查看分析流水线<ArrowRight size={14} /></button>
          </div>
          <div className="dashboard-progress-steps">
            {progressSteps.map((step, index) => (
              <div key={step.id} className={`dashboard-progress-step dashboard-progress-${step.state}`}>
                <div className="dashboard-progress-marker">
                  {step.state === "done" ? <Check size={14} /> : step.state === "running" ? <Loader2 className="animate-spin" size={14} /> : step.state === "failed" ? <AlertTriangle size={14} /> : index + 1}
                </div>
                <div className="min-w-0"><strong>{step.title}</strong><span>{dashboardStepStateLabel(step.state)}</span><p>{step.detail}</p></div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="dashboard-results-section">
        <div className="dashboard-section-heading">
          <div><h2>最近成果</h2><p>结果优先展示，点击可进入对应工作区。</p></div>
        </div>
        <div className="dashboard-results-grid">
          <button type="button" className={`dashboard-result-card ${latestTaskLog?.status === "failed" ? "dashboard-result-failed" : ""}`} onClick={() => onNavigate("logs")}>
            <div className="dashboard-result-heading"><span><Activity size={16} />最近任务</span><ArrowRight size={15} /></div>
            {latestTaskLog ? (
              <>
                <h3>{latestTaskLog.title}</h3>
                <div className="dashboard-result-meta"><span>{taskStageLabel(latestTaskLog.stage)}</span><span>{taskStatusLabel(latestTaskLog.status)}</span><span>{formatTaskDuration(latestTaskLog.durationMs)}</span></div>
                <p>{taskSummary}</p>
                <small>{formatDateTime(latestTaskLog.createdAt)}</small>
              </>
            ) : (
              <div className="dashboard-result-empty"><strong>尚无任务记录</strong><p>{taskSummary}</p></div>
            )}
          </button>

          <button type="button" className="dashboard-result-card" onClick={() => onNavigate("hotspots")}>
            <div className="dashboard-result-heading"><span><Atom size={16} />主要热点</span><ArrowRight size={15} /></div>
            {topHotspot ? (
              <>
                <h3>{topHotspot.title}</h3>
                <div className="dashboard-result-meta"><span>{topHotspot.field}</span><span>{hotspotTrendLabel(topHotspot.trend)}</span><span>{topHotspot.paperCount.toLocaleString()} 篇</span></div>
                <p>{topHotspot.summary}</p>
                <small>置信度 {Math.round((topHotspot.confidence ?? 0) * 100)}%</small>
              </>
            ) : (
              <div className="dashboard-result-empty"><strong>尚无热点结果</strong><p>完成热点建模后，这里会显示论文规模最大的研究热点。</p></div>
            )}
          </button>

          <button type="button" className="dashboard-result-card" onClick={() => onNavigate("reports")}>
            <div className="dashboard-result-heading"><span><FileText size={16} />最新报告</span><ArrowRight size={15} /></div>
            {latestReport ? (
              <>
                <h3>{latestReport.topic}</h3>
                <div className="dashboard-result-meta"><span>{latestReport.discipline}</span><span>{dashboardReportModeLabel(latestReport.mode)}</span></div>
                <p>{latestReport.content.replace(/[#*`]/g, "").replace(/\s+/g, " ").trim().slice(0, 180)}</p>
                <small>{formatDateTime(latestReport.createdAt)}</small>
              </>
            ) : (
              <div className="dashboard-result-empty"><strong>尚无研究报告</strong><p>确认热点证据后，可在热点库生成离线或 AI 报告。</p></div>
            )}
          </button>
        </div>
      </section>

      <div className="dashboard-data-overview">
        <FoldSection title="数据概况" compact right={<span className="text-xs font-normal text-ink/40">{yearRange}</span>}>
          <div className="dashboard-data-grid">
            <section>
              <h3>来源分布</h3>
              <div className="dashboard-source-list">
                {sourceRows.map((row) => (
                  <div key={row.source} className="dashboard-source-row">
                    <span>{dashboardSourceLabel(row.source)}</span>
                    <div><i style={{ width: `${Math.max(4, (row.count / sourceMax) * 100)}%` }} /></div>
                    <strong>{row.count.toLocaleString()}</strong>
                  </div>
                ))}
                {sourceRows.length === 0 && <p>暂无可统计的数据来源。</p>}
              </div>
            </section>
            <section className="dashboard-year-section">
              <h3>年份覆盖</h3>
              <div className="dashboard-year-summary">
                <div><span>覆盖范围</span><strong>{yearRange}</strong></div>
                <div><span>有效年份</span><strong>{yearRows.length}</strong></div>
                <div><span>最近年份文献</span><strong>{latestYear?.count.toLocaleString() ?? 0}</strong></div>
              </div>
            </section>
          </div>
        </FoldSection>
      </div>
    </div>
  );
}

function SearchWorkspace({
  settings,
  activeProject,
  libraryStatus,
  libraryFacets,
  libraryBootstrap,
  searchFocusIntent,
  documentEvidenceFocusIntent,
  onClearDocumentEvidenceFocus,
  workspaceTab,
  onWorkspaceTabChange,
  institutionSession,
  institutionSearchSnapshots,
  researchSearchState,
  researchSearchQuery,
  selectedResearchCandidateIds,
  institutionBrowserPresentation,
  onInstitutionSessionChange,
  onInstitutionSearchSnapshotChange,
  onResearchSearchQueryChange,
  onSelectedResearchCandidateIdsChange,
  onStartResearchSearch,
  onStopResearchSearch,
  onInstitutionBrowserPresentationChange,
  onDocumentReaderActiveChange,
  onDocumentIndexActivityChange,
  agentConversationTurns,
  agentGenerating,
  agentError,
  onAskEvidence,
  onStopEvidenceAnswer,
  onNavigate,
  onRefresh,
  onNotice,
  onClearNoticeScope,
}: {
  settings: AiSettings;
  activeProject: Project;
  libraryStatus: PaperLibraryStatus | null;
  libraryFacets: PaperLibraryFacets | null;
  libraryBootstrap: PaperLibraryBootstrapSnapshot | null;
  searchFocusIntent: SearchFocusIntent | null;
  documentEvidenceFocusIntent: DocumentEvidenceFocusIntent | null;
  onClearDocumentEvidenceFocus: () => void;
  workspaceTab: LiteratureWorkspaceTab | null;
  onWorkspaceTabChange: (tab: LiteratureWorkspaceTab) => void;
  institutionSession: SideraInstitutionSessionState | null;
  institutionSearchSnapshots: Record<
    SideraInstitutionSearchSource,
    SideraInstitutionSearchSnapshot | null
  >;
  researchSearchState: SideraResearchSearchState | null;
  researchSearchQuery: string;
  selectedResearchCandidateIds: string[];
  institutionBrowserPresentation: SideraInstitutionBrowserPresentation;
  onInstitutionSessionChange: (state: SideraInstitutionSessionState) => void;
  onInstitutionSearchSnapshotChange: (snapshot: SideraInstitutionSearchSnapshot) => void;
  onResearchSearchQueryChange: (query: string) => void;
  onSelectedResearchCandidateIdsChange: (ids: string[]) => void;
  onStartResearchSearch: (
    query: string,
    startReason: SideraResearchSearchStartReason,
    filters: SideraResearchSearchFilters,
    resultLimit: 40 | 100,
  ) => Promise<SideraResearchSearchState>;
  onStopResearchSearch: () => Promise<SideraResearchSearchState>;
  onInstitutionBrowserPresentationChange: (presentation: SideraInstitutionBrowserPresentation) => void;
  onDocumentReaderActiveChange: (active: boolean) => void;
  onDocumentIndexActivityChange: (snapshot: DocumentIndexSnapshot) => void;
  agentConversationTurns: SideraConversationTurn[];
  agentGenerating: boolean;
  agentError: string;
  onAskEvidence: (prompt: string, scope: SideraReadingContextScope) => void;
  onStopEvidenceAnswer: () => void;
  onNavigate: (view: ActiveView) => void;
  onRefresh: () => Promise<void>;
  onNotice: AppNoticeHandler;
  onClearNoticeScope: AppNoticeScopeClearHandler;
}) {
  const libraryReadIdentity = libraryStatus
    ? paperLibraryReadIdentity(
        libraryStatus.databasePath,
        activeProject.id,
        libraryStatus.libraryRevision,
      )
    : "";
  const matchingLibraryBootstrap = libraryBootstrap?.identity === libraryReadIdentity
    ? libraryBootstrap
    : null;
  const initialLibraryPage = paperPageFromBootstrap(matchingLibraryBootstrap, {
    databaseDir: settings.databaseDir,
    projectId: activeProject.id,
    source: "all",
    field: "all",
    limit: 20,
    offset: 0,
    sort: "newest",
  });
  const [query, setQuery] = useState("verifiable scientific agents");
  const [discipline, setDiscipline] = useState<string>(DISCIPLINES[2]);
  const [sources, setSources] = useState<SourceKind[]>(["openalex", "arxiv"]);
  const [maxResults, setMaxResults] = useState(12);
  const [libraryQueryDraft, setLibraryQueryDraft] = useState("");
  const [libraryQuery, setLibraryQuery] = useState("");
  const [libraryQueryComposing, setLibraryQueryComposing] = useState(false);
  const [libraryQueryExecutionCount, setLibraryQueryExecutionCount] = useState(0);
  const [librarySource, setLibrarySource] = useState<SourceKind | "all">("all");
  const [libraryField, setLibraryField] = useState("all");
  const [libraryYear, setLibraryYear] = useState("all");
  const [librarySort, setLibrarySort] = useState<"newest" | "oldest" | "title">("newest");
  const [page, setPage] = useState(1);
  const [pageJump, setPageJump] = useState("1");
  const [pageSize, setPageSize] = useState(20);
  const [selectedPaperId, setSelectedPaperId] = useState("");
  const [libraryDiagnosticsOpen, setLibraryDiagnosticsOpen] = useState(false);
  const [paperDetailDirty, setPaperDetailDirty] = useState(false);
  const [pendingPaperSelectionId, setPendingPaperSelectionId] = useState("");
  const [pendingPaperSave, setPendingPaperSave] = useState(false);
  const [pendingFocusPaperId, setPendingFocusPaperId] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedPapers, setSelectedPapers] = useState<Paper[]>([]);
  const [libraryPage, setLibraryPage] = useState<PaperQueryResult>(initialLibraryPage ?? { rows: [], total: 0, limit: 20, offset: 0, queryMs: 0 });
  const [facets, setFacets] = useState<PaperLibraryFacets>(matchingLibraryBootstrap?.facets ?? libraryFacets ?? { sources: [], fields: [], years: [] });
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [reportMode, setReportMode] = useState<"simple" | "deep">("deep");
  const [searchRows, setSearchRows] = useState<Paper[]>([]);
  const [currentReport, setCurrentReport] = useState<ResearchReport | null>(null);
  const [reportOptions, setReportOptions] = useState<ReportGenerationOptions>(defaultReportOptions);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importProgress, setImportProgress] = useState("");
  const [importJob, setImportJob] = useState<ImportJobState | null>(null);
  const [importReviewBatches, setImportReviewBatches] = useState<SideraImportReviewBatch[]>([]);
  const [activeImportReviewBatch, setActiveImportReviewBatch] = useState<SideraImportReviewBatch | null>(null);
  const [importReviewBusy, setImportReviewBusy] = useState("");
  const [importCommitPreview, setImportCommitPreview] = useState<SideraImportCommitPreview | null>(null);
  const [importCommitStatus, setImportCommitStatus] = useState<SideraImportCommitStatus | null>(null);
  const [importCommitHistory, setImportCommitHistory] = useState<SideraImportCommitHistory>({ entries: [] });
  const [importCommitReadDiagnostics, setImportCommitReadDiagnostics] = useState<ImportReviewReadDiagnostics>({
    batches: { state: "idle" },
    status: { state: "idle" },
    history: { state: "idle" },
  });
  const [importCommitResult, setImportCommitResult] = useState<SideraImportCommitResult | null>(null);
  const [importRollbackResult, setImportRollbackResult] = useState<SideraImportRollbackResult | null>(null);
  const [pendingLocalPdf, setPendingLocalPdf] = useState<{ filePath: string; fileName: string } | null>(null);
  const [pendingLocalPdfVersionKind, setPendingLocalPdfVersionKind] = useState<SideraDocumentVersionKind>("user-import");
  const [pendingLocalPdfBusy, setPendingLocalPdfBusy] = useState(false);
  const [documentRefreshRevision, setDocumentRefreshRevision] = useState(0);
  const [documentReaderTarget, setDocumentReaderTarget] = useState<{
    paperId: string;
    versionId: string;
    title: string;
    initialEvidenceAnchor?: DocumentEvidenceAnchor;
  } | null>(() => documentEvidenceFocusIntent
    ? {
        paperId: documentEvidenceFocusIntent.paperId,
        versionId: documentEvidenceFocusIntent.versionId,
        title: documentEvidenceFocusIntent.title,
        initialEvidenceAnchor: documentEvidenceFocusIntent.anchor,
      }
    : null);

  useEffect(() => {
    onDocumentReaderActiveChange(Boolean(documentReaderTarget));
    return () => onDocumentReaderActiveChange(false);
  }, [documentReaderTarget, onDocumentReaderActiveChange]);
  const importCommitClientIdRef = useRef<{ previewId: string; clientCommitId: string } | null>(null);
  const importRollbackClientIdsRef = useRef<Map<string, string>>(new Map());
  const importReviewNoticeRevisionRef = useRef(0);
  const libraryLoadSequenceRef = useRef(0);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const literaturePageRef = useRef<HTMLDivElement | null>(null);
  const paperListScrollRef = useRef<HTMLDivElement | null>(null);
  const paperDetailScrollRef = useRef<HTMLElement | null>(null);
  const paperDetailEditorRef = useRef<PaperDetailEditorHandle | null>(null);
  const unsavedPaperDialogRef = useRef<HTMLDialogElement | null>(null);
  const importControlRef = useRef({ paused: false, cancelled: false });
  const desktopImportTaskIdRef = useRef("");
  const setWorkspaceTab = (tab: LiteratureWorkspaceTab) => {
    if (tab !== "institution") {
      if (isDesktopRuntime()) {
        void setSideraInstitutionBrowserVisible(false).catch(() => undefined);
      }
    }
    onWorkspaceTabChange(tab);
  };

  const fields = useMemo(() => facets.fields.map((row) => row.value).sort(), [facets]);
  const years = useMemo(() => facets.years.map((row) => Number(row.value)).filter((year) => Number.isFinite(year)).sort((a, b) => b - a), [facets]);
  const filterIndex = useMemo(
    () => ({
      sources: facets.sources.length,
      fields: facets.fields.length,
      years: facets.years.length,
      keywords: facets.fields.reduce((sum, row) => sum + Math.min(12, row.count), 0),
    }),
    [facets],
  );
  const visibleLibraryPapers = libraryPage.rows;
  const qualityHints = useMemo(() => buildPaperQualityHints(visibleLibraryPapers), [visibleLibraryPapers]);
  const pageCount = Math.max(1, Math.ceil(libraryPage.total / pageSize));
  const pageStart = libraryPage.total === 0 ? 0 : libraryPage.offset + 1;
  const pageEnd = Math.min(libraryPage.offset + visibleLibraryPapers.length, libraryPage.total);
  const selectedOnPageCount = visibleLibraryPapers.filter((paper) => selectedIds.includes(paper.id)).length;
  const allVisiblePapersSelected = visibleLibraryPapers.length > 0
    && selectedOnPageCount === visibleLibraryPapers.length;
  const activeFilterLabels = useMemo(
    () =>
      [
        libraryQuery.trim() ? `关键词：${libraryQuery.trim()}` : "",
        librarySource !== "all" ? `来源：${librarySource}` : "",
        libraryField !== "all" ? `学科：${libraryField}` : "",
        libraryYear !== "all" ? `年份：${libraryYear}` : "",
        librarySort !== "newest" ? `排序：${librarySort === "oldest" ? "最早" : "标题"}` : "",
      ].filter(Boolean),
    [libraryField, libraryQuery, librarySort, librarySource, libraryYear],
  );
  const selectedPaper = visibleLibraryPapers.find((paper) => paper.id === selectedPaperId);
  const reportPapers = useMemo(() => {
    if (selectedIds.length === 0) return [];
    if (selectedPapers.length > 0) return selectedPapers;
    const selectedSet = new Set(selectedIds);
    return searchRows.filter((paper) => selectedSet.has(paper.id));
  }, [searchRows, selectedIds, selectedPapers]);
  const workload = useMemo(() => estimateReportWorkload(reportPapers.length, reportOptions), [reportOptions, reportPapers.length]);
  const reportEvidenceSummary = useMemo(() => {
    const validYears = reportPapers.map((paper) => paper.year).filter((year): year is number => Number.isFinite(year));
    const sourceCounts = countBy(reportPapers, (paper) => paper.source);
    return {
      years: validYears.length > 0 ? `${Math.min(...validYears)}-${Math.max(...validYears)}` : "暂无年份",
      sources: sourceCounts.slice(0, 4).map(([source, count]) => `${source} ${count}`).join(" / ") || "暂无来源",
    };
  }, [reportPapers]);
  const terminalTargetRows = 100_000;
  const currentLibraryRows = libraryStatus?.paperCount ?? libraryPage.total;
  const activeWorkspaceTab = workspaceTab ?? (currentLibraryRows > 0 ? "library" : "ingest");
  const terminalImportPercent = Math.min(100, Math.round((currentLibraryRows / terminalTargetRows) * 100));
  const terminalImportActive = importJob?.status === "running" || importJob?.status === "paused";
  const terminalImportGuidance = terminalImportActive
    ? {
        title: importJob?.status === "paused" ? "大文件直导已暂停" : "大文件直导运行中",
        status: importJob?.status === "paused" ? "paused" : "running",
        detail: `${importJob?.fileName ?? "论文数据文件"} 已处理 ${(importJob?.written ?? 0).toLocaleString()} 行，新增 ${(importJob?.inserted ?? 0).toLocaleString()}，更新 ${(importJob?.updated ?? 0).toLocaleString()}。`,
        action: "继续观察导入进度",
      }
    : currentLibraryRows >= terminalTargetRows
      ? {
          title: "10 万级规模已达标",
          status: "ready",
          detail: `当前 SQLite 主库已有 ${currentLibraryRows.toLocaleString()} 篇文献，可进入清洗、聚类、星图证据和终局验收。`,
          action: "运行大库清洗与聚类",
        }
      : currentLibraryRows > 0
        ? {
            title: "当前仍是小库规模",
            status: "partial",
            detail: `当前 SQLite 主库有 ${currentLibraryRows.toLocaleString()} 篇文献，距离 100,000 篇还差 ${(terminalTargetRows - currentLibraryRows).toLocaleString()} 篇。`,
            action: "继续大文件直导",
          }
        : {
            title: "等待真实论文库",
            status: "empty",
            detail: "终局验收需要真实 CSV / JSONL / BibTeX / RIS 论文源进入 SQLite 主库。",
            action: "选择真实论文文件",
          };
  const terminalNextSteps = terminalImportActive
    ? [
        ["保持导入任务可见", "等待 Tauri/Rust 侧继续分批写入 SQLite，必要时使用暂停/继续/取消控制。"],
        ["导入完成后刷新库状态", "完成事件会自动刷新分页和总量；如果数量异常，重新选择同一文件可安全恢复。"],
        ["达标后进入分析流水线", "100,000 篇达标后，先运行大库清洗，再运行 V20 热点聚类。"],
      ]
    : currentLibraryRows >= terminalTargetRows
      ? [
          ["运行大库清洗", "进入分析流水线页，先规范化标题、摘要并处理空记录与重复记录。"],
          ["运行热点聚类", "生成真实热点、代表论文、年度演化与星图坐标。"],
          ["导出终局证据", "刷新 About 就绪矩阵后，使用 acceptance:terminal-config 跑最终验收。"],
        ]
      : [
          ["准备真实论文源", "优先使用 Zotero / Web of Science / OpenAlex 等导出的 CSV、JSONL、BibTeX 或 RIS。"],
          ["使用大文件直导", "不要用浏览器预览导入 10 万级文件，直接让桌面端流式写入 SQLite。"],
          ["导入后检查差距", "当数量未达 100,000 时继续导入下一批；达标后再进入分析流水线。"],
        ];

  useEffect(() => {
    importReviewNoticeRevisionRef.current = onClearNoticeScope("import-review");
    setImportCommitReadDiagnostics({
      batches: { state: "idle" },
      status: { state: "idle" },
      history: { state: "idle" },
    });
    return () => {
      importReviewNoticeRevisionRef.current = onClearNoticeScope("import-review");
    };
  }, [activeProject.id, activeWorkspaceTab, onClearNoticeScope, settings.databaseDir]);

  useEffect(() => {
    if (activeWorkspaceTab !== "ingest" || !isDesktopRuntime()) return;
    let disposed = false;
    void listImportReviewBatches({ databaseDir: settings.databaseDir, projectId: activeProject.id })
      .then(async (batches) => {
        if (disposed) return;
        setImportReviewBatches(batches);
        setImportCommitReadDiagnostics((current) => ({
          ...current,
          batches: { state: "ready" },
        }));
        const currentId = activeImportReviewBatch?.projectId === activeProject.id
          ? activeImportReviewBatch.id
          : "";
        const selected = batches.find((batch) => batch.id === currentId)
          ?? batches.find((batch) => matchesEditableImportReviewStatus(batch.status))
          ?? batches[0];
        if (!selected) {
          setActiveImportReviewBatch(null);
          return;
        }
        const opened = await openImportReviewBatch({
          databaseDir: settings.databaseDir,
          projectId: activeProject.id,
          batchId: selected.id,
        });
        if (!disposed) {
          setActiveImportReviewBatch(opened);
          setImportCommitReadDiagnostics((current) => ({
            ...current,
            batches: { state: "ready" },
          }));
        }
      })
      .catch((error) => {
        if (!disposed) {
          const message = error instanceof Error ? error.message : "题录审查批次读取失败。";
          setImportCommitReadDiagnostics((current) => ({
            ...current,
            batches: { state: "error", message },
          }));
          onNotice("题录审查批次读取失败，请查看读取诊断。", "error", {
            scope: "import-review",
            scopeRevision: importReviewNoticeRevisionRef.current,
            dismissAfterMs: 8000,
          });
        }
      });
    return () => {
      disposed = true;
    };
  }, [activeProject.id, activeWorkspaceTab, settings.databaseDir]);

  useEffect(() => {
    if (activeWorkspaceTab !== "ingest" || !isDesktopRuntime()) return;
    let disposed = false;
    const noticeScopeRevision = onClearNoticeScope("import-review");
    importReviewNoticeRevisionRef.current = noticeScopeRevision;
    const isCurrent = () => !disposed
      && importReviewNoticeRevisionRef.current === noticeScopeRevision;
    const batchId = activeImportReviewBatch?.id;
    void (async () => {
      const readErrors = await refreshImportReviewCommitState(
        batchId,
        (_kind, noticeMessage) => {
          if (disposed) return;
          onNotice(noticeMessage, "error", {
            scope: "import-review",
            scopeRevision: noticeScopeRevision,
            dismissAfterMs: 8000,
          });
        },
        isCurrent,
      );
      if (disposed || readErrors.stale) return;
      let batchError: string | undefined;
      try {
        await refreshImportReviewBatches(batchId, isCurrent);
        if (!isCurrent()) return;
        setImportCommitReadDiagnostics((current) => ({
          ...current,
          batches: { state: "ready" },
        }));
      } catch (error) {
        if (!isCurrent()) return;
        batchError = error instanceof Error ? error.message : "审查批次对账读取失败。";
        setImportCommitReadDiagnostics((current) => ({
          ...current,
          batches: { state: "error", message: batchError },
        }));
        onNotice("题录审查批次对账读取失败，请查看读取诊断。", "error", {
          scope: "import-review",
          scopeRevision: noticeScopeRevision,
          dismissAfterMs: 8000,
        });
      }
      if (!isCurrent()) return;
      if (!readErrors.statusError && !readErrors.historyError && !batchError) {
        importReviewNoticeRevisionRef.current = onClearNoticeScope("import-review");
      }
    })();
    return () => {
      disposed = true;
      importReviewNoticeRevisionRef.current = onClearNoticeScope("import-review");
    };
  }, [
    activeImportReviewBatch?.id,
    activeProject.id,
    activeWorkspaceTab,
    onClearNoticeScope,
    onNotice,
    settings.databaseDir,
  ]);

  useEffect(() => {
    setImportCommitPreview(null);
    setImportCommitResult(null);
    setImportRollbackResult(null);
    importCommitClientIdRef.current = null;
  }, [activeImportReviewBatch?.id]);

  useEffect(() => {
    setFacets(matchingLibraryBootstrap?.facets ?? libraryFacets ?? { sources: [], fields: [], years: [] });
  }, [libraryFacets, matchingLibraryBootstrap]);

  useEffect(() => {
    setPage(1);
  }, [libraryField, libraryQuery, librarySource, libraryYear, librarySort, pageSize]);

  useEffect(() => {
    setPageJump(String(page));
  }, [page]);

  useEffect(() => {
    if (!searchFocusIntent) return;
    setWorkspaceTab("library");
    setLibraryQueryDraft(searchFocusIntent.query);
    setLibraryQuery(searchFocusIntent.query);
    if (searchFocusIntent.field) setLibraryField(searchFocusIntent.field);
    setPendingFocusPaperId(searchFocusIntent.paperId ?? "");
    setPage(1);
  }, [searchFocusIntent]);

  useEffect(() => {
    if (activeWorkspaceTab !== "library") return;
    void loadLibraryPage();
  }, [
    activeProject.id,
    activeWorkspaceTab,
    settings.databaseDir,
    libraryReadIdentity,
    matchingLibraryBootstrap,
    libraryField,
    libraryQuery,
    librarySource,
    libraryYear,
    librarySort,
    page,
    pageSize,
  ]);

  useEffect(() => {
    if (pendingFocusPaperId) {
      const target = visibleLibraryPapers.find((paper) => (
        paper.id === pendingFocusPaperId
        || paper.id.endsWith(`:${pendingFocusPaperId}`)
        || pendingFocusPaperId.endsWith(`:${paper.id}`)
      ));
      if (target) {
        setSelectedPaperId(target.id);
        setPendingFocusPaperId("");
      }
      return;
    }
    if (selectedPaperId && !visibleLibraryPapers.some((paper) => paper.id === selectedPaperId)) {
      setSelectedPaperId("");
    }
  }, [pendingFocusPaperId, selectedPaperId, visibleLibraryPapers]);

  useEffect(() => {
    paperListScrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [activeProject.id, libraryField, libraryQuery, librarySort, librarySource, libraryYear, page, pageSize]);

  useEffect(() => {
    paperDetailScrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [selectedPaper?.id]);

  useEffect(() => {
    if (activeWorkspaceTab !== "library") return;
    literaturePageRef.current?.parentElement?.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [activeWorkspaceTab]);

  useEffect(() => {
    const dialog = unsavedPaperDialogRef.current;
    if (!dialog) return;
    if (pendingPaperSelectionId) {
      if (!dialog.open) dialog.showModal();
      return;
    }
    if (dialog.open) dialog.close();
  }, [pendingPaperSelectionId]);

  useEffect(() => {
    let mounted = true;
    async function loadSelectedPapers() {
      if (selectedIds.length === 0) {
        setSelectedPapers([]);
        return;
      }
      const rows = await getPapersByIds(settings.databaseDir, activeProject.id, selectedIds);
      if (mounted) setSelectedPapers(rows);
    }
    void loadSelectedPapers();
    return () => {
      mounted = false;
    };
  }, [activeProject.id, selectedIds, settings.databaseDir]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let mounted = true;
    void import("@tauri-apps/api/event").then(async ({ listen }) => {
      unlisten = await listen<PaperFileImportProgress>("paper-import-progress", (event) => {
        const payload = event.payload;
        if (desktopImportTaskIdRef.current && payload.taskId !== desktopImportTaskIdRef.current) return;
        if (!desktopImportTaskIdRef.current) desktopImportTaskIdRef.current = payload.taskId;
        const finalStatus = payload.status === "done" || payload.status === "failed" || payload.status === "cancelled";
        setImportJob((current) => ({
          status: payload.status,
          total: payload.totalRows ?? current?.total ?? 0,
          written: payload.processedRows,
          inserted: payload.inserted,
          updated: payload.updated,
          invalidRows: payload.invalidRows,
          duplicateRows: payload.duplicateRows,
          startedAt: current?.startedAt ?? performance.now(),
          taskId: payload.taskId,
          fileName: payload.fileName,
          message: payload.message,
          recovery: current?.recovery ?? importRecoveryGuidance,
        }));
        setImportProgress(`${payload.fileName}：已处理 ${payload.processedRows}，新增 ${payload.inserted}，更新 ${payload.updated}，无效 ${payload.invalidRows}，重复 ${payload.duplicateRows}`);
        if (finalStatus) {
          setBusy("");
          void (async () => {
            await loadLibraryPage({ force: true });
            await onRefresh();
            await saveTaskLog({
              stage: "crawl",
              title: "SQLite 大文件直导",
              status: payload.status === "done" ? "done" : "failed",
              inputSummary: `${payload.fileName} / task=${payload.taskId}`,
              outputSummary: `${payload.message}；恢复策略：${importRecoveryGuidance.strategy}`,
              rawOutput: JSON.stringify({ ...payload, recovery: importRecoveryGuidance }, null, 2),
              durationMs: payload.elapsedMs,
            });
            await onRefresh();
            if (mounted) {
              onNotice(
                payload.status === "done"
                  ? "大文件直导完成。"
                  : payload.status === "cancelled"
                    ? "大文件直导已取消。"
                    : payload.message,
                payload.status === "failed"
                  ? "error"
                  : payload.status === "done"
                    ? "success"
                    : "info",
              );
            }
            desktopImportTaskIdRef.current = "";
          })();
        }
      });
    }).catch(() => undefined);
    return () => {
      mounted = false;
      void unlisten?.();
    };
  }, [activeProject.id, settings.databaseDir]);

  async function loadLibraryPage(options?: { force?: boolean }) {
    const requestSequence = ++libraryLoadSequenceRef.current;
    const input: PaperQueryInput = {
      databaseDir: settings.databaseDir,
      projectId: activeProject.id,
      query: libraryQuery,
      source: librarySource,
      field: libraryField,
      year: libraryYear === "all" ? undefined : Number(libraryYear),
      limit: pageSize,
      offset: (Math.max(1, page) - 1) * pageSize,
      sort: librarySort,
    };
    const bootstrapPage = options?.force
      ? null
      : paperPageFromBootstrap(matchingLibraryBootstrap, input);
    if (bootstrapPage) {
      if (requestSequence !== libraryLoadSequenceRef.current) return;
      setLibraryPage(bootstrapPage);
      setLibraryLoading(false);
      const nextPageCount = Math.max(1, Math.ceil(bootstrapPage.total / pageSize));
      if (page > nextPageCount) setPage(nextPageCount);
      return;
    }
    const request = options?.force
      ? { promise: queryPaperLibrary(input), started: true }
      : requestPaperLibraryPageOnce(libraryReadIdentity, input);
    if (request.started) {
      setLibraryQueryExecutionCount((current) => current + 1);
    }
    setLibraryLoading(true);
    try {
      const nextPage = await request.promise;
      if (requestSequence !== libraryLoadSequenceRef.current) return;
      setLibraryPage(nextPage);
      const nextPageCount = Math.max(1, Math.ceil(nextPage.total / pageSize));
      if (page > nextPageCount) setPage(nextPageCount);
    } catch (error) {
      if (requestSequence !== libraryLoadSequenceRef.current) return;
      onNotice(error instanceof Error ? error.message : "文献库分页查询失败。", "error");
    } finally {
      if (requestSequence === libraryLoadSequenceRef.current) setLibraryLoading(false);
    }
  }

  function executeLibraryKeywordSearch() {
    if (libraryQueryComposing) return;
    const nextQuery = libraryQueryDraft.trim();
    if (!nextQuery || nextQuery === libraryQuery.trim()) return;
    setPage(1);
    setLibraryQuery(nextQuery);
  }

  function refreshLibraryKeywordSearch() {
    if (libraryQueryComposing || libraryLoading) return;
    void loadLibraryPage({ force: true });
  }

  async function stageLocalPdfImport() {
    const filePath = await choosePdfFile("选择待关联的本地 PDF");
    if (!filePath) return;
    const fileName = filePath.split(/[\\/]/).pop() || "PDF 文件";
    setPendingLocalPdf({ filePath, fileName });
    setWorkspaceTab("library");
    onNotice("PDF 已选择；请在文献列表中选择目标论文，再确认关联。", "info");
  }

  async function associatePendingLocalPdf() {
    if (!pendingLocalPdf || !selectedPaper || pendingLocalPdfBusy) return;
    const confirmed = window.confirm(
      `确认将本地文件“${pendingLocalPdf.fileName}”关联到论文《${selectedPaper.title}》？\n\nSidera 不会根据文件名自动判断论文身份。`,
    );
    if (!confirmed) return;
    setPendingLocalPdfBusy(true);
    try {
      await importLocalPaperDocument({
        databaseDir: settings.databaseDir,
        projectId: activeProject.id,
        paperId: selectedPaper.id,
        filePath: pendingLocalPdf.filePath,
        versionKind: pendingLocalPdfVersionKind,
      });
      setPendingLocalPdf(null);
      setDocumentRefreshRevision((current) => current + 1);
      onNotice("本地 PDF 已按 SHA-256 保存，并明确关联到所选论文。", "success");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "本地 PDF 关联失败。", "error");
    } finally {
      setPendingLocalPdfBusy(false);
    }
  }

  async function refreshImportReviewBatches(
    preferredBatchId?: string,
    isCurrent: () => boolean = () => true,
  ) {
    const batches = await listImportReviewBatches({
      databaseDir: settings.databaseDir,
      projectId: activeProject.id,
    });
    if (!isCurrent()) return;
    setImportReviewBatches(batches);
    const selected = batches.find((batch) => batch.id === preferredBatchId)
      ?? batches.find((batch) => batch.id === activeImportReviewBatch?.id)
      ?? batches.find((batch) => matchesEditableImportReviewStatus(batch.status))
      ?? batches[0];
    if (!selected) {
      if (!isCurrent()) return;
      setActiveImportReviewBatch(null);
      return;
    }
    const opened = await openImportReviewBatch({
      databaseDir: settings.databaseDir,
      projectId: activeProject.id,
      batchId: selected.id,
    });
    if (!isCurrent()) return;
    setActiveImportReviewBatch(opened);
  }

  async function createReviewBatchFromFile() {
    const filePath = await choosePaperImportFile("选择待审查的 CSV / JSON / JSONL / BibTeX / RIS 题录文件");
    if (!filePath) return;
    setImportReviewBusy("正在解析候选并比对身份...");
    try {
      const batch = await createImportReviewBatch({
        databaseDir: settings.databaseDir,
        projectId: activeProject.id,
        filePath,
      });
      setActiveImportReviewBatch(batch);
      await refreshImportReviewBatches(batch.id);
      onNotice(`已创建题录审查批次：${batch.counts.total} 条候选，尚未写入论文库。`, "success");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "题录审查批次创建失败。", "error");
    } finally {
      setImportReviewBusy("");
    }
  }

  async function createReviewBatchFromInstitutionSearch(
    snapshot: SideraResearchSearchSnapshot,
    candidateIds: string[],
  ) {
    if (candidateIds.length === 0) {
      onNotice("请至少选择一条论文候选。", "info");
      return;
    }
    const selectedCandidates = snapshot.candidates.filter((candidate) => candidateIds.includes(candidate.id));
    const selectedSourceIds = new Set(selectedCandidates.flatMap((candidate) => candidate.sourceIds));
    const producerVersions = new Set(
      selectedCandidates.flatMap((candidate) => candidate.producerVersions ?? []),
    );
    if (producerVersions.size === 0) {
      snapshot.sourceReports
        .filter((report) => selectedSourceIds.has(report.sourceId))
        .forEach((report) => {
          if (report.connectorVersion) producerVersions.add(report.connectorVersion);
        });
    }
    if (producerVersions.size !== 1) {
      onNotice("所选候选来自不同或未确认的生产适配器，不能合并为一个审查批次。", "error");
      return;
    }
    const connectorVersion = Array.from(producerVersions)[0];
    setImportReviewBusy("正在保存机构检索候选并比对身份...");
    try {
      const batch = await createImportReviewBatchFromSearch({
        databaseDir: settings.databaseDir,
        projectId: activeProject.id,
        searchId: snapshot.taskId,
        generation: snapshot.epoch,
        connectorVersion,
        candidateIds,
      });
      setActiveImportReviewBatch(batch);
      setImportReviewBatches((current) => [
        { ...batch, candidates: [] },
        ...current.filter((item) => item.id !== batch.id),
      ]);
      setWorkspaceTab("ingest");
      onNotice(`已将 ${candidateIds.length} 条机构候选加入导入审查；主论文库尚未写入。`, "success");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "机构检索候选加入审查失败。", "error");
    } finally {
      setImportReviewBusy("");
    }
  }

  async function openReviewBatch(batchId: string) {
    setImportReviewBusy("正在恢复审查批次...");
    try {
      const batch = await openImportReviewBatch({
        databaseDir: settings.databaseDir,
        projectId: activeProject.id,
        batchId,
      });
      setActiveImportReviewBatch(batch);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "题录审查批次打开失败。", "error");
    } finally {
      setImportReviewBusy("");
    }
  }

  async function cloneReadOnlyReviewBatch() {
    if (!activeImportReviewBatch
      || (activeImportReviewBatch.status !== "committed" && activeImportReviewBatch.status !== "rolled-back")) return;
    setImportReviewBusy("正在复制为新的审查批次...");
    try {
      const batch = await cloneImportReviewBatch({
        databaseDir: settings.databaseDir,
        projectId: activeProject.id,
        batchId: activeImportReviewBatch.id,
      });
      setActiveImportReviewBatch(batch);
      await refreshImportReviewBatches(batch.id);
      setImportCommitPreview(null);
      setImportCommitStatus(null);
      setImportCommitResult(null);
      setImportRollbackResult(null);
      importCommitClientIdRef.current = null;
      onNotice("已复制为新的可编辑审查批次；原提交与回滚历史保持不变。", "success");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "审查批次复制失败。", "error");
    } finally {
      setImportReviewBusy("");
    }
  }

  async function decideImportCandidate(
    candidate: SideraImportCandidate,
    decision?: SideraImportDecisionKind,
    targetPaperId?: string,
  ) {
    if (!activeImportReviewBatch || !matchesEditableImportReviewStatus(activeImportReviewBatch.status)) return;
    const mergeTarget = decision === "accept-merge"
      ? targetPaperId
        ?? candidate.identityMatches.find((match) => match.preferred)?.paperId
        ?? candidate.identityMatches[0]?.paperId
      : undefined;
    setImportReviewBusy(`正在保存第 ${candidate.rowIndex} 条决定...`);
    try {
      const batch = await saveImportReviewDecision({
        databaseDir: settings.databaseDir,
        projectId: activeProject.id,
        batchId: activeImportReviewBatch.id,
        candidateId: candidate.id,
        decision,
        targetPaperId: mergeTarget,
      });
      setActiveImportReviewBatch(batch);
      setImportCommitPreview(null);
      setImportCommitResult(null);
      setImportRollbackResult(null);
      importCommitClientIdRef.current = null;
      setImportReviewBatches((current) => current.map((item) => (
        item.id === batch.id ? { ...batch, candidates: [] } : item
      )));
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "审查决定保存失败。", "error");
    } finally {
      setImportReviewBusy("");
    }
  }

  async function discardActiveReviewBatch() {
    if (!activeImportReviewBatch || !matchesEditableImportReviewStatus(activeImportReviewBatch.status)) return;
    const confirmed = await confirmDesktopAction(
      `放弃审查批次“${activeImportReviewBatch.fileName}”？这不会修改主论文库。`,
      "放弃题录审查批次",
    );
    if (!confirmed) return;
    setImportReviewBusy("正在放弃审查批次...");
    try {
      await discardImportReviewBatch({
        databaseDir: settings.databaseDir,
        projectId: activeProject.id,
        batchId: activeImportReviewBatch.id,
      });
      await refreshImportReviewBatches();
      setImportCommitPreview(null);
      setImportCommitStatus(null);
      setImportCommitResult(null);
      setImportRollbackResult(null);
      importCommitClientIdRef.current = null;
      onNotice("审查批次已放弃，主论文库未发生变化。", "success");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "审查批次放弃失败。", "error");
    } finally {
      setImportReviewBusy("");
    }
  }

  async function refreshImportReviewCommitState(
    batchId?: string,
    reportError?: (kind: "status" | "history", message: string) => void,
    isCurrent: () => boolean = () => true,
  ) {
    let statusError: string | undefined;
    let historyError: string | undefined;
    if (batchId) {
      try {
        const status = await getImportReviewCommitStatus({
          databaseDir: settings.databaseDir,
          projectId: activeProject.id,
          batchId,
        });
        if (!isCurrent()) return { statusError, historyError, stale: true };
        setImportCommitStatus(status ?? null);
        setImportCommitReadDiagnostics((current) => ({
          ...current,
          status: { state: "ready" },
        }));
      } catch (error) {
        if (!isCurrent()) return { statusError, historyError, stale: true };
        statusError = error instanceof Error ? error.message : "题录提交状态读取失败。";
        setImportCommitReadDiagnostics((current) => ({
          ...current,
          status: { state: "error", message: statusError },
        }));
        reportError?.("status", "题录提交状态读取失败，请查看读取诊断。");
      }
    } else {
      if (!isCurrent()) return { statusError, historyError, stale: true };
      setImportCommitStatus(null);
      setImportCommitReadDiagnostics((current) => ({
        ...current,
        status: { state: "idle" },
      }));
    }
    if (!isCurrent()) return { statusError, historyError, stale: true };
    try {
      const history = await listImportReviewCommitHistory({
        databaseDir: settings.databaseDir,
        projectId: activeProject.id,
        batchId,
        limit: 50,
      });
      if (!isCurrent()) return { statusError, historyError, stale: true };
      setImportCommitHistory(history);
      setImportCommitReadDiagnostics((current) => ({
        ...current,
        history: { state: "ready" },
      }));
    } catch (error) {
      if (!isCurrent()) return { statusError, historyError, stale: true };
      historyError = error instanceof Error ? error.message : "题录提交历史读取失败。";
      setImportCommitReadDiagnostics((current) => ({
        ...current,
        history: { state: "error", message: historyError },
      }));
      reportError?.("history", "题录提交历史读取失败，请查看读取诊断。");
    }
    return { statusError, historyError, stale: false };
  }

  async function runImportReadFaultFixture(target: SideraImportReadFaultTarget) {
    if (!import.meta.env.DEV || !isDesktopRuntime() || importReviewBusy) return;
    const noticeScopeRevision = onClearNoticeScope("import-review");
    importReviewNoticeRevisionRef.current = noticeScopeRevision;
    const labels: Record<SideraImportReadFaultTarget, string> = {
      "batch-list": "题录审查批次读取失败，请查看读取诊断。",
      "commit-status": "题录提交状态读取失败，请查看读取诊断。",
      "commit-history": "题录提交历史读取失败，请查看读取诊断。",
    };
    const diagnosticKey = target === "batch-list"
      ? "batches"
      : target === "commit-status"
        ? "status"
        : "history";
    setImportReviewBusy("正在运行一次性只读故障夹具…");
    try {
      await armImportReadFaultFixture({
        databaseDir: settings.databaseDir,
        projectId: activeProject.id,
        target,
      });
      if (target === "batch-list") {
        await listImportReviewBatches({
          databaseDir: settings.databaseDir,
          projectId: activeProject.id,
        });
      } else if (target === "commit-status") {
        await getImportReviewCommitStatus({
          databaseDir: settings.databaseDir,
          projectId: activeProject.id,
          batchId: activeImportReviewBatch?.id ?? "fixture-read",
        });
      } else {
        await listImportReviewCommitHistory({
          databaseDir: settings.databaseDir,
          projectId: activeProject.id,
          batchId: activeImportReviewBatch?.id,
          limit: 50,
        });
      }
      throw new Error("SIDERA_IMPORT_READ_FAULT_FIXTURE_NOT_TRIGGERED");
    } catch (error) {
      const message = error instanceof Error ? error.message : "SIDERA_IMPORT_READ_FAULT_FIXTURE_FAILED";
      setImportCommitReadDiagnostics((current) => ({
        ...current,
        [diagnosticKey]: { state: "error", message },
      }));
      onNotice(labels[target], "error", {
        scope: "import-review",
        scopeRevision: noticeScopeRevision,
        dismissAfterMs: 8000,
      });
    } finally {
      await clearImportReadFaultFixture().catch(() => undefined);
      setImportReviewBusy("");
    }
  }

  async function rereadImportReviewState() {
    if (importReviewBusy) return;
    const noticeScopeRevision = onClearNoticeScope("import-review");
    importReviewNoticeRevisionRef.current = noticeScopeRevision;
    setImportReviewBusy("正在重新读取题录状态…");
    try {
      const readErrors = await refreshImportReviewCommitState(activeImportReviewBatch?.id);
      await refreshImportReviewBatches(activeImportReviewBatch?.id);
      setImportCommitReadDiagnostics((current) => ({
        ...current,
        batches: { state: "ready" },
      }));
      if (!readErrors.statusError && !readErrors.historyError) {
        importReviewNoticeRevisionRef.current = onClearNoticeScope("import-review");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "题录状态重新读取失败。";
      setImportCommitReadDiagnostics((current) => ({
        ...current,
        batches: { state: "error", message },
      }));
      onNotice("题录状态重新读取失败，请查看读取诊断。", "error", {
        scope: "import-review",
        scopeRevision: noticeScopeRevision,
        dismissAfterMs: 8000,
      });
    } finally {
      setImportReviewBusy("");
    }
  }

  async function refreshAfterImportMutation(batchId: string) {
    const readErrors = await refreshImportReviewCommitState(batchId);
    const errors = [
      readErrors.statusError ? "题录提交状态刷新失败，请查看读取诊断。" : "",
      readErrors.historyError ? "题录提交历史刷新失败，请查看读取诊断。" : "",
    ].filter(Boolean);
    const refreshSteps = [
      ["审查批次", () => refreshImportReviewBatches(batchId)],
      ["本地文献页", () => loadLibraryPage({ force: true })],
      ["论文库状态", () => onRefresh()],
    ] as const;
    for (const [label, refresh] of refreshSteps) {
      try {
        await refresh();
      } catch (error) {
        errors.push(`${label}刷新失败：${error instanceof Error ? error.message : "未知错误"}`);
      }
    }
    return errors;
  }

  async function prepareActiveImportCommit() {
    if (!activeImportReviewBatch || !matchesEditableImportReviewStatus(activeImportReviewBatch.status)) return;
    setImportReviewBusy("正在核对主论文库 revision、身份匹配与字段变更...");
    try {
      const preview = await prepareImportReviewCommit({
        databaseDir: settings.databaseDir,
        projectId: activeProject.id,
        batchId: activeImportReviewBatch.id,
      });
      setImportCommitPreview(preview);
      importCommitClientIdRef.current = {
        previewId: preview.previewId,
        clientCommitId: globalThis.crypto?.randomUUID?.()
          ?? `commit-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      };
      setImportCommitResult(null);
      setImportRollbackResult(null);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "正式提交预览生成失败。", "error");
    } finally {
      setImportReviewBusy("");
    }
  }

  async function executeActiveImportCommit() {
    if (!activeImportReviewBatch || !importCommitPreview) return;
    if (importCommitPreview.batchId !== activeImportReviewBatch.id) {
      onNotice("提交预览与当前审查批次不一致，请重新生成预览。", "error");
      return;
    }
    const blockingCount = importCommitPreview.counts.unresolvedCount
      + importCommitPreview.items.filter((item) => item.blockingCodes.length > 0).length;
    if (blockingCount > 0) {
      onNotice("当前预览仍有待处理或身份漂移项，不能正式提交。无效候选必须明确跳过。", "error");
      return;
    }
    const confirmed = await confirmDesktopAction(
      importCommitPreview.counts.changedCount === 0
        ? "确认关闭这个全跳过审查批次？本次操作不会新增或合并论文，也不会修改主论文库 revision。"
        : `确认将 ${importCommitPreview.counts.changedCount} 条已审查决定一次性提交到主论文库？提交后不会自动运行热点建模。`,
      importCommitPreview.counts.changedCount === 0 ? "确认全跳过并关闭批次" : "确认正式提交题录",
    );
    if (!confirmed) return;
    setImportReviewBusy("正在以单一事务写入主论文库...");
    try {
      const clientCommitId = importCommitClientIdRef.current?.previewId === importCommitPreview.previewId
        ? importCommitClientIdRef.current.clientCommitId
        : globalThis.crypto?.randomUUID?.()
          ?? `commit-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      importCommitClientIdRef.current = { previewId: importCommitPreview.previewId, clientCommitId };
      const result = await executeImportReviewCommit({
        databaseDir: settings.databaseDir,
        projectId: activeProject.id,
        batchId: activeImportReviewBatch.id,
        previewId: importCommitPreview.previewId,
        previewHash: importCommitPreview.previewHash,
        batchVersion: importCommitPreview.batchVersion,
        expectedRevision: importCommitPreview.expectedRevision,
        clientCommitId,
      });
      setImportCommitResult(result);
      setImportCommitPreview(null);
      importCommitClientIdRef.current = null;
      setImportRollbackResult(null);
      const refreshErrors = await refreshAfterImportMutation(activeImportReviewBatch.id);
      if (refreshErrors.length > 0) {
        onNotice(
          `题录已由主库账本确认提交（revision ${result.beforeRevision} → ${result.afterRevision}）；${refreshErrors.join("；")}`,
          "info",
        );
      } else {
        onNotice(
          result.counts.changedCount === 0
            ? `全跳过审查批次已关闭，主论文库 revision 保持 ${result.afterRevision}。`
            : `题录已提交：新增 ${result.counts.insertCount} 条，合并 ${result.counts.mergeCount} 条，主库 revision ${result.beforeRevision} → ${result.afterRevision}。`,
          "success",
        );
      }
    } catch (error) {
      const failureMessage = error instanceof Error ? error.message : "题录正式提交失败。";
      try {
        const reconciled = await getImportReviewCommitStatus({
          databaseDir: settings.databaseDir,
          projectId: activeProject.id,
          batchId: activeImportReviewBatch.id,
        });
        if (reconciled?.batchStatus === "committed" && reconciled.commitId) {
          setImportCommitStatus(reconciled);
          setImportCommitPreview(null);
          setImportCommitResult(null);
          importCommitClientIdRef.current = null;
          const refreshErrors = await refreshAfterImportMutation(activeImportReviewBatch.id);
          onNotice(
            refreshErrors.length === 0
              ? `提交响应异常，但主库账本已确认提交 ${reconciled.commitId}，界面已完成对账。`
              : `主库账本已确认提交 ${reconciled.commitId}；${refreshErrors.join("；")}`,
            refreshErrors.length === 0 ? "success" : "info",
          );
        } else {
          onNotice(failureMessage, "error");
        }
      } catch {
        onNotice(`${failureMessage}；提交状态自动对账也未完成，请重新打开批次核对提交历史。`, "error");
      }
    } finally {
      setImportReviewBusy("");
    }
  }

  async function rollbackImportCommit(entry: SideraImportCommitStatus) {
    if (!entry.commitId || entry.afterRevision === undefined || entry.batchStatus !== "committed") return;
    const confirmed = await confirmDesktopAction(
      "确认整次回滚该提交？若任一论文在提交后又被修改，回滚会整体停止并列出冲突，不会强制覆盖。",
      "确认回滚题录提交",
    );
    if (!confirmed) return;
    setImportReviewBusy("正在校验提交后的论文指纹并准备整次回滚...");
    try {
      const clientRollbackId = importRollbackClientIdsRef.current.get(entry.commitId)
        ?? globalThis.crypto?.randomUUID?.()
        ?? `rollback-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      importRollbackClientIdsRef.current.set(entry.commitId, clientRollbackId);
      const result = await rollbackImportReviewCommit({
        databaseDir: settings.databaseDir,
        projectId: activeProject.id,
        batchId: entry.batchId,
        commitId: entry.commitId,
        expectedRevision: entry.afterRevision,
        clientRollbackId,
      });
      setImportRollbackResult(result);
      if (result.rollbackConflicts.length > 0 || result.status === "blocked") {
        onNotice("回滚被后续修改阻止；主论文库未被强制覆盖，请查看冲突详情。", "error");
        await refreshImportReviewCommitState(entry.batchId);
        return;
      }
      setImportCommitResult(null);
      setImportCommitPreview(null);
      importRollbackClientIdsRef.current.delete(entry.commitId);
      const refreshErrors = await refreshAfterImportMutation(entry.batchId);
      if (refreshErrors.length > 0) {
        onNotice(
          `主库账本已确认整次回滚（新 revision ${result.rollbackRevision ?? "已生成"}）；${refreshErrors.join("；")}`,
          "info",
        );
      } else {
        onNotice(
          `整次提交已回滚：恢复 ${result.restoredCount} 条，删除 ${result.deletedCount} 条；未自动运行热点建模。`,
          "success",
        );
      }
    } catch (error) {
      const failureMessage = error instanceof Error ? error.message : "题录提交回滚失败。";
      try {
        const reconciled = await getImportReviewCommitStatus({
          databaseDir: settings.databaseDir,
          projectId: activeProject.id,
          batchId: entry.batchId,
        });
        if (reconciled?.batchStatus === "rolled-back" || reconciled?.rolledBackAtMs !== undefined) {
          setImportCommitStatus(reconciled ?? null);
          setImportCommitPreview(null);
          setImportCommitResult(null);
          importRollbackClientIdsRef.current.delete(entry.commitId);
          const refreshErrors = await refreshAfterImportMutation(entry.batchId);
          onNotice(
            refreshErrors.length === 0
              ? `回滚响应异常，但主库账本已确认提交 ${entry.commitId} 已回滚，界面已完成对账。`
              : `主库账本已确认提交 ${entry.commitId} 已回滚；${refreshErrors.join("；")}`,
            refreshErrors.length === 0 ? "success" : "info",
          );
        } else {
          onNotice(failureMessage, "error");
        }
      } catch {
        onNotice(`${failureMessage}；回滚状态自动对账也未完成，请重新打开批次核对提交历史。`, "error");
      }
    } finally {
      setImportReviewBusy("");
    }
  }

  async function viewCommittedImportPapers(inputPaperIds: string[]) {
    const paperIds = Array.from(new Set(inputPaperIds.filter(Boolean)));
    if (paperIds.length === 0) {
      onNotice("该提交没有可定位的入库论文；全跳过批次不会产生论文实体。", "info");
      return;
    }

    setImportReviewBusy("正在本地论文库中定位已提交论文...");
    try {
      const rows = await getPapersByIds(settings.databaseDir, activeProject.id, paperIds);
      const firstPaper = rows[0];
      setLibraryQueryDraft(firstPaper?.title ?? "");
      setLibraryQuery(firstPaper?.title ?? "");
      setLibrarySource("all");
      setLibraryField("all");
      setLibraryYear("all");
      setLibrarySort("newest");
      setPage(1);
      setSelectedIds(paperIds);
      setSelectedPapers(rows);
      setPendingFocusPaperId(firstPaper?.id ?? paperIds[0]);
      setWorkspaceTab("library");
      onNotice(
        `已进入本地文献库，并保留 ${paperIds.length} 个已提交论文 ID${firstPaper ? "；当前定位到首条记录" : ""}。`,
        "success",
      );
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "已提交论文定位失败。", "error");
    } finally {
      setImportReviewBusy("");
    }
  }

  async function runSearch() {
    if (!query.trim()) {
      onNotice("请先输入科研主题。");
      return;
    }
    if (sources.length === 0) {
      onNotice("请至少选择一个文献来源。");
      return;
    }

    setBusy("正在检索文献...");
    try {
      let searchQuery = query.trim();
      if (settings.apiCredentialConfigured || settings.useEnvKey) {
        searchQuery = await generateBilingualKeyword(query, settings);
      }
      const options: SearchOptions = {
        query: searchQuery,
        sources,
        maxResults,
        startYear: 2020,
        endYear: new Date().getFullYear(),
        cnki: settings.cnki,
      };
      const rows = await searchAcademicSources(options);
      const timestamp = nowIso();
      const savedRows = rows.map((row) => ({ ...row, createdAt: timestamp, updatedAt: timestamp }));
      await upsertPaperLibrary(settings.databaseDir, activeProject.id, savedRows);
      setSearchRows(savedRows);
      setSelectedIds((current) => Array.from(new Set([...current, ...savedRows.map((paper) => paper.id)])));
      await loadLibraryPage({ force: true });
      await onRefresh();
      onNotice(`检索完成：${rows.length} 篇文献已入库。`, "success");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "检索失败。", "error");
    } finally {
      setBusy("");
    }
  }

  async function previewLocalPapers(file?: File) {
    if (!file) return;
    setBusy("正在解析导入文件...");
    try {
      const text = await file.text();
      setImportPreview(analyzePaperImport(file.name, text, []));
      setImportProgress("");
      setImportJob(null);
      onNotice("导入预览已生成，请确认后入库。");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "本地文件解析失败。", "error");
    } finally {
      setBusy("");
      if (importInputRef.current) importInputRef.current.value = "";
    }
  }

  async function startDesktopFileImport() {
    const filePath = await choosePaperImportFile();
    if (!filePath) return;
    setBusy("正在由桌面端分批导入 SQLite...");
    setImportPreview(null);
    setImportProgress("正在启动大文件直导任务...");
    try {
      const started = await startPaperFileImport({ databaseDir: settings.databaseDir, projectId: activeProject.id, filePath });
      desktopImportTaskIdRef.current = started.taskId;
      importControlRef.current = { paused: false, cancelled: false };
      setImportJob({
        status: "running",
        total: 0,
        written: 0,
        inserted: 0,
        updated: 0,
        invalidRows: 0,
        duplicateRows: 0,
        startedAt: performance.now(),
        taskId: started.taskId,
        fileName: started.fileName,
        message: "任务已启动。",
        recovery: importRecoveryGuidance,
      });
    } catch (error) {
      setBusy("");
      setImportProgress("");
      onNotice(error instanceof Error ? error.message : "大文件直导启动失败。", "error");
    }
  }

  async function importDemoPapers() {
    setBusy("正在导入 80 条演示文献...");
    setImportPreview(null);
    setImportProgress("正在定位演示数据...");
    try {
      const filePath = await getDemoPaperSamplePath();
      const started = await startPaperFileImport({ databaseDir: settings.databaseDir, projectId: activeProject.id, filePath });
      desktopImportTaskIdRef.current = started.taskId;
      importControlRef.current = { paused: false, cancelled: false };
      setImportJob({
        status: "running",
        total: 80,
        written: 0,
        inserted: 0,
        updated: 0,
        invalidRows: 0,
        duplicateRows: 0,
        startedAt: performance.now(),
        taskId: started.taskId,
        fileName: started.fileName,
        message: "演示数据导入已启动。",
        recovery: importRecoveryGuidance,
      });
    } catch (error) {
      setBusy("");
      setImportProgress("");
      onNotice(error instanceof Error ? error.message : "演示数据导入启动失败。", "error");
    }
  }

  async function importMysqlPapers() {
    const configured = settings.mysql;
    setBusy("正在从本地 MySQL 分批导入 SQLite...");
    setImportPreview(null);
    setImportProgress("正在启动 MySQL 后台导入任务...");
    try {
      const started = await startMysqlPaperImport({
        databaseDir: settings.databaseDir,
        projectId: activeProject.id,
        workerTempDir: settings.workerTempDir,
        host: configured.host,
        port: configured.port,
        user: configured.user,
        password: undefined,
        database: configured.database,
        batchSize: configured.batchSize,
      });
      desktopImportTaskIdRef.current = started.taskId;
      importControlRef.current = { paused: false, cancelled: false };
      setImportJob({
        status: "running",
        total: 0,
        written: 0,
        inserted: 0,
        updated: 0,
        invalidRows: 0,
        duplicateRows: 0,
        startedAt: performance.now(),
        taskId: started.taskId,
        fileName: started.fileName,
        message: "MySQL 导入任务已启动。",
        recovery: importRecoveryGuidance,
      });
    } catch (error) {
      setBusy("");
      setImportProgress("");
      onNotice(error instanceof Error ? error.message : "MySQL 导入启动失败。", "error");
    }
  }

  async function confirmImport() {
    if (!importPreview) return;
    if (importPreview.validRows.length === 0) {
      onNotice("没有可入库的有效文献。");
      return;
    }
    setBusy("正在分批写入 SQLite 文献库...");
    importControlRef.current = { paused: false, cancelled: false };
    setImportJob({ status: "running", total: importPreview.validRows.length, written: 0, inserted: 0, updated: 0, startedAt: performance.now() });
    try {
      let inserted = 0;
      let updated = 0;
      let written = 0;
      const chunkSize = 1000;
      for (let index = 0; index < importPreview.validRows.length; index += chunkSize) {
        while (importControlRef.current.paused && !importControlRef.current.cancelled) {
          setImportJob((current) => current ? { ...current, status: "paused" } : current);
          setImportProgress(`已暂停：${written} / ${importPreview.validRows.length}`);
          await sleep(200);
        }
        if (importControlRef.current.cancelled) {
          const summary = `导入已取消：已写入 ${written} / ${importPreview.validRows.length}，新增 ${inserted}，更新 ${updated}。`;
          setImportJob((current) => current ? { ...current, status: "cancelled", written, inserted, updated } : current);
          setImportProgress(summary);
          await loadLibraryPage({ force: true });
          await onRefresh();
          onNotice(summary);
          return;
        }
        setImportJob((current) => current ? { ...current, status: "running" } : current);
        const chunk = importPreview.validRows.slice(index, index + chunkSize);
        const result = await upsertPaperLibrary(settings.databaseDir, activeProject.id, chunk);
        inserted += result.inserted;
        updated += result.updated;
        written = Math.min(index + chunk.length, importPreview.validRows.length);
        setImportProgress(`已写入 ${written} / ${importPreview.validRows.length}，新增 ${inserted}，更新 ${updated}`);
        setImportJob((current) => current ? { ...current, status: "running", written, inserted, updated } : current);
        await sleep(0);
      }
      await loadLibraryPage({ force: true });
      await onRefresh();
      onNotice(`导入完成：新增 ${inserted} 篇，更新 ${updated} 篇，文件内重复 ${importPreview.duplicateRows.length} 篇，无效 ${importPreview.invalidRows.length} 行。`);
      setImportJob((current) => current ? { ...current, status: "done", written: importPreview.validRows.length, inserted, updated } : current);
      setImportPreview(null);
      setImportProgress("");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "导入入库失败。", "error");
    } finally {
      setBusy("");
    }
  }

  function pauseImport() {
    if (importJob?.taskId) void controlPaperFileImport(importJob.taskId, "pause");
    importControlRef.current.paused = true;
    setImportJob((current) => current ? { ...current, status: "paused" } : current);
  }

  function resumeImport() {
    if (importJob?.taskId) void controlPaperFileImport(importJob.taskId, "resume");
    importControlRef.current.paused = false;
    setImportJob((current) => current ? { ...current, status: "running" } : current);
  }

  function cancelImport() {
    if (importJob?.taskId) void controlPaperFileImport(importJob.taskId, "cancel");
    importControlRef.current.cancelled = true;
    importControlRef.current.paused = false;
    setImportJob((current) => current ? { ...current, status: "cancelled" } : current);
  }

  function closeImportPreview() {
    if (importJob?.status === "running" || importJob?.status === "paused") {
      cancelImport();
      return;
    }
    setImportPreview(null);
    setImportProgress("");
    setImportJob(null);
  }

  async function deleteSelected() {
    if (selectedIds.length === 0) return;
    setBusy("正在删除选中文献...");
    try {
      const count = await deletePapersFromLibrary(settings.databaseDir, activeProject.id, selectedIds);
      setSelectedIds([]);
      await loadLibraryPage({ force: true });
      await onRefresh();
      onNotice(`已删除 ${count} 篇文献。`);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "删除失败。", "error");
    } finally {
      setBusy("");
    }
  }

  async function runReport(mode: Extract<ResearchReport["mode"], "simple" | "deep">) {
    if (reportPapers.length === 0) {
      onNotice("没有可用于综述的文献。");
      return;
    }
    const started = performance.now();
    const rawInput = JSON.stringify({ topic: query, mode, discipline, options: reportOptions, paperIds: reportPapers.map((paper) => paper.id) }, null, 2);
    setBusy(mode === "deep" ? "正在生成深版综述..." : "正在生成简版综述...");
    try {
      const generated = await generateResearchReport({ topic: query, papers: reportPapers, mode, discipline, settings, options: reportOptions });
      const reviewGate = reportReviewGate(generated.content, reportPapers);
      const { report: saved } = await saveReportWithTaskLog({
        topic: query, mode, discipline, content: generated.content,
        paperIds: reportPapers.map((paper) => paper.id), metrics: generated.metrics,
        evidenceProfile: generated.evidenceProfile, ...reviewGate,
      }, {
        stage: "review", title: "AI 综述生成", status: "done",
        inputSummary: `${query} / ${mode} / ${reportPapers.length} 篇文献`,
        outputSummary: reviewGate.reviewStatus === "needs-review" ? "报告已保存为待复核草稿。" : `已生成并保存报告：${query}`,
        rawInput, rawOutput: generated.content, durationMs: Math.round(performance.now() - started),
      });
      setCurrentReport(saved);
      await onRefresh();
      onNotice(reviewGate.reviewStatus === "needs-review" ? "综述风险较高，已保存为待复核草稿并禁止正式导出。" : "综述已保存到报告库。");
    } catch (error) {
      const message = error instanceof Error ? error.message : "报告生成失败。";
      await saveTaskLog({
        stage: "review",
        title: "AI 综述生成",
        status: "failed",
        inputSummary: `${query} / ${mode} / ${reportPapers.length} 篇文献`,
        outputSummary: "",
        rawInput,
        error: message,
        durationMs: Math.round(performance.now() - started),
      });
      await onRefresh();
      onNotice(error instanceof Error ? error.message : "报告生成失败。", "error");
    } finally {
      setBusy("");
    }
  }

  async function runRevision() {
    if (!currentReport) return;
    setBusy("正在修订综述...");
    try {
      const generated = await reviseResearchReport({
        topic: currentReport.topic,
        papers: reportPapers,
        originalReport: currentReport.content,
        feedback: "强化证据比较、局限性和未来路线，保留真实引用编号。",
        discipline,
        settings,
      });
      const saved = await saveReport({
        topic: currentReport.topic,
        mode: "revised",
        discipline,
        content: generated.content,
        paperIds: reportPapers.map((paper) => paper.id),
        metrics: generated.metrics,
        evidenceProfile: generated.evidenceProfile,
        ...reportReviewGate(generated.content, reportPapers),
      });
      setCurrentReport(saved);
      await onRefresh();
      onNotice("修订版已保存。");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "修订失败。", "error");
    } finally {
      setBusy("");
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function requestPaperSelection(id: string) {
    if (!id || id === selectedPaper?.id) return;
    if (paperDetailDirty) {
      setPendingPaperSelectionId(id);
      return;
    }
    setSelectedPaperId(id);
  }

  function cancelPendingPaperSelection() {
    if (pendingPaperSave) return;
    setPendingPaperSelectionId("");
  }

  async function saveAndSelectPendingPaper() {
    const nextPaperId = pendingPaperSelectionId;
    if (!nextPaperId || pendingPaperSave) return;
    setPendingPaperSave(true);
    try {
      const saved = await paperDetailEditorRef.current?.save();
      if (!saved) return;
      setPaperDetailDirty(false);
      setPendingPaperSelectionId("");
      setSelectedPaperId(nextPaperId);
    } finally {
      setPendingPaperSave(false);
    }
  }

  function discardAndSelectPendingPaper() {
    const nextPaperId = pendingPaperSelectionId;
    if (!nextPaperId || pendingPaperSave) return;
    paperDetailEditorRef.current?.discard();
    setPaperDetailDirty(false);
    setPendingPaperSelectionId("");
    setSelectedPaperId(nextPaperId);
  }

  function selectCurrentPage() {
    setSelectedIds((current) => Array.from(new Set([...current, ...visibleLibraryPapers.map((paper) => paper.id)])));
  }

  function deselectCurrentPage() {
    const visibleIds = new Set(visibleLibraryPapers.map((paper) => paper.id));
    setSelectedIds((current) => current.filter((id) => !visibleIds.has(id)));
  }

  function clearLibraryFilters() {
    setLibraryQueryDraft("");
    setLibraryQuery("");
    setLibrarySource("all");
    setLibraryField("all");
    setLibraryYear("all");
    setLibrarySort("newest");
    setPage(1);
  }

  function jumpToLibraryPage() {
    const nextPage = clamp(Number(pageJump) || 1, 1, pageCount);
    setPage(nextPage);
    setPageJump(String(nextPage));
  }

  function runTerminalImportAction() {
    if (terminalImportActive) {
      onNotice("大文件直导任务正在进行，可在下方进度卡片中暂停、继续或取消。");
      return;
    }
    if (currentLibraryRows >= terminalTargetRows) {
      onNavigate("pipeline");
      return;
    }
    void startDesktopFileImport();
  }

  if (documentReaderTarget) {
    const returnVersionId = documentReaderTarget.versionId;
    return (
      <DocumentReaderShell
        databaseDir={settings.databaseDir}
        projectId={activeProject.id}
        paperId={documentReaderTarget.paperId}
        versionId={documentReaderTarget.versionId}
        title={documentReaderTarget.title}
        initialEvidenceAnchor={documentReaderTarget.initialEvidenceAnchor}
        service={documentReaderComposition.service}
        pdfAdapter={documentReaderComposition.pdfAdapter}
        onNotice={onNotice}
        onBack={() => {
          setDocumentReaderTarget(null);
          onClearDocumentEvidenceFocus();
          requestAnimationFrame(() => {
            const trigger = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-document-reader-version]"))
              .find((button) => button.dataset.documentReaderVersion === returnVersionId);
            trigger?.focus();
          });
        }}
        onIndexActivityChange={onDocumentIndexActivityChange}
        agentConversationTurns={agentConversationTurns}
        agentGenerating={agentGenerating}
        agentError={agentError}
        onAskEvidence={onAskEvidence}
        onStopEvidenceAnswer={onStopEvidenceAnswer}
      />
    );
  }

  return (
    <div ref={literaturePageRef} className={`page-grid literature-workspace-page ${activeWorkspaceTab === "library" ? "literature-workspace-library" : ""} ${activeWorkspaceTab === "institution" ? "literature-workspace-institution" : ""}`}>
      <header className="page-header">
        <div>
          <p className="eyebrow">文献中心</p>
          <h1>文献工作台</h1>
          <p className="page-subtitle">管理本地文献、完成检索导入，并将选中证据生成研究报告。</p>
        </div>
      </header>

      <nav className="literature-tabs" aria-label="文献工作台任务">
        {([
          ["library", "本地文献库"],
          ["institution", "机构资源"],
          ["ingest", "检索与导入"],
          ["analysis", "批量分析"],
        ] as Array<[LiteratureWorkspaceTab, string]>).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={`literature-tab ${activeWorkspaceTab === value ? "literature-tab-active" : ""}`}
            aria-pressed={activeWorkspaceTab === value}
            onClick={() => setWorkspaceTab(value)}
          >
            {label}
            {value === "analysis" && selectedIds.length > 0 && <span>{selectedIds.length}</span>}
          </button>
        ))}
      </nav>

      {activeWorkspaceTab === "institution" && (
        <InstitutionResourceWorkspace
          session={institutionSession}
          snapshots={institutionSearchSnapshots}
          researchSearchState={researchSearchState}
          researchSearchQuery={researchSearchQuery}
          selectedResearchCandidateIds={selectedResearchCandidateIds}
          browserPresentation={institutionBrowserPresentation}
          onSessionChange={onInstitutionSessionChange}
          onSnapshotChange={onInstitutionSearchSnapshotChange}
          onResearchSearchQueryChange={onResearchSearchQueryChange}
          onSelectedResearchCandidateIdsChange={onSelectedResearchCandidateIdsChange}
          onStartResearchSearch={onStartResearchSearch}
          onStopResearchSearch={onStopResearchSearch}
          onBrowserPresentationChange={onInstitutionBrowserPresentationChange}
          onCreateReviewBatch={createReviewBatchFromInstitutionSearch}
          onNotice={onNotice}
        />
      )}

      {activeWorkspaceTab === "ingest" && (
        <>
          <ImportReviewWorkspace
            batches={importReviewBatches}
            activeBatch={activeImportReviewBatch}
            busy={importReviewBusy}
            commitPreview={importCommitPreview}
            commitStatus={importCommitStatus}
            commitHistory={importCommitHistory}
            readDiagnostics={importCommitReadDiagnostics}
            commitResult={importCommitResult}
            rollbackResult={importRollbackResult}
            onCreate={() => void createReviewBatchFromFile()}
            onOpen={(batchId) => void openReviewBatch(batchId)}
            onDecide={(candidate, decision, targetPaperId) => void decideImportCandidate(candidate, decision, targetPaperId)}
            onDiscard={() => void discardActiveReviewBatch()}
            onClone={() => void cloneReadOnlyReviewBatch()}
            onPrepareCommit={() => void prepareActiveImportCommit()}
            onExecuteCommit={() => void executeActiveImportCommit()}
            onRollback={(entry) => void rollbackImportCommit(entry)}
            onViewImportedPapers={(paperIds) => void viewCommittedImportPapers(paperIds)}
            onRefreshReads={() => void rereadImportReviewState()}
            onRunReadFaultFixture={import.meta.env.DEV
              ? (target) => void runImportReadFaultFixture(target)
              : undefined}
          />
          <section className="panel-card">
            <div className="panel-title">
              <Search size={17} />
              在线主题检索
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_220px_180px]">
              <input className="field-control h-11 px-3" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入科研主题" />
              <SelectControl className="h-11 text-sm" value={discipline} options={DISCIPLINES.map((item) => ({ value: item, label: item }))} onChange={setDiscipline} />
              <button className="primary-action h-11 gap-2" onClick={() => void runSearch()} disabled={Boolean(busy)}>
                {busy ? <Loader2 className="animate-spin" size={16} /> : <Search size={16} />}
                检索入库
              </button>
            </div>
            <FoldSection title="检索来源与参数" compact>
              <div className="flex flex-wrap items-center gap-2">
                {sourceOptions.map((source) => (
                  <label key={source.id} className={`source-toggle ${sources.includes(source.id) ? "source-toggle-active" : ""}`}>
                    <input
                      type="checkbox"
                      checked={sources.includes(source.id)}
                      onChange={(event) => setSources((current) => event.target.checked ? [...current, source.id] : current.filter((item) => item !== source.id))}
                    />
                    <span>
                      <strong>{source.label}</strong>
                      <small>{source.description}</small>
                    </span>
                  </label>
                ))}
                <label className="ml-auto flex items-center gap-2 text-sm text-ink/50">
                  每个来源数量
                  <input className="field-control h-9 w-20 px-2" type="number" min={5} max={50} value={maxResults} onChange={(event) => setMaxResults(Math.max(5, Math.min(50, Number(event.target.value) || 12)))} />
                </label>
              </div>
            </FoldSection>
            <FoldSection title="导入数据" compact>
              <input ref={importInputRef} className="hidden" type="file" accept=".csv,.json,.jsonl,.ndjson" onChange={(event) => void previewLocalPapers(event.target.files?.[0])} />
              <div className="flex flex-wrap items-center gap-2">
                <button className="secondary-action h-9 gap-2" onClick={() => importInputRef.current?.click()} disabled={Boolean(busy)}>
                  <FileUp size={15} />
                  预览文件导入
                </button>
                <button className="secondary-action h-9 gap-2" onClick={() => void startDesktopFileImport()} disabled={Boolean(busy)}>
                  <Database size={15} />
                  大文件直导
                </button>
                <button className="secondary-action h-9 gap-2" onClick={() => void importMysqlPapers()} disabled={Boolean(busy)}>
                  <Database size={15} />
                  从 MySQL 导入
                </button>
                <button className="secondary-action h-9 gap-2" onClick={() => void importDemoPapers()} disabled={Boolean(busy)}>
                  <FlaskConical size={15} />
                  导入演示数据
                </button>
              </div>
              <p className="mt-3 text-xs leading-5 text-ink/45">大文件直导支持 CSV、JSON、JSONL、NDJSON、BibTeX 和 RIS。</p>
              <p className="mt-2 text-xs leading-5 text-amber">正式题录导入将从上方审查批次进入；这里的既有直导入口仅保留兼容用途，P2a 不会自动触发。</p>
            </FoldSection>
          </section>

          {importPreview && <ImportPreviewPanel preview={importPreview} job={importJob} progress={importProgress} onConfirm={confirmImport} onPause={pauseImport} onResume={resumeImport} onCancel={closeImportPreview} busy={Boolean(busy)} />}
          {!importPreview && importJob && <ImportProgressPanel job={importJob} progress={importProgress} onPause={pauseImport} onResume={resumeImport} onCancel={cancelImport} />}

          <section className="panel-card">
            <FoldSection
              title="大库验收"
              compact
              right={<span className={terminalImportGuidance.status === "ready" ? "text-xs text-cyan" : "text-xs text-amber"}>{terminalImportGuidance.title}</span>}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <p className="max-w-3xl text-sm leading-6 text-ink/55">{terminalImportGuidance.detail}</p>
                <button className="secondary-action h-9 gap-2" onClick={runTerminalImportAction} disabled={Boolean(busy) && !terminalImportActive}>
                  <FileUp size={14} />
                  {terminalImportGuidance.action}
                </button>
              </div>
              <div className="progress-track mt-4"><div style={{ width: `${terminalImportPercent}%` }} /></div>
              <div className="mt-3 text-xs text-ink/50">
                当前 {currentLibraryRows.toLocaleString()} / 100,000 篇 · 数据库 {formatBytes(libraryStatus?.sizeBytes ?? 0)} · 进度 {terminalImportPercent}% · 每批 {importRecoveryGuidance.batchSize.toLocaleString()} 行
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {terminalNextSteps.map(([title, detail], index) => (
                  <div key={title} className="acceptance-step">
                    <div className="flex items-center gap-2 text-sm font-medium text-ink">
                      <span>{index + 1}</span>
                      {title}
                      {index === 0 && terminalImportGuidance.status === "ready" && <CheckCircle2 className="ml-auto text-cyan" size={15} />}
                    </div>
                    <div className="mt-2 text-xs leading-5 text-ink/45">{detail}</div>
                  </div>
                ))}
              </div>
            </FoldSection>
          </section>
        </>
      )}

      {activeWorkspaceTab === "library" && (
        <>
          <div className="library-status-line" role="status">
            <span>总文献数 <strong>{currentLibraryRows.toLocaleString()}</strong></span>
            <span>数据库体积 <strong>{formatBytes(libraryStatus?.sizeBytes ?? 0)}</strong></span>
            <span>当前结果 <strong>{libraryPage.total.toLocaleString()}</strong></span>
          </div>

          <div className="two-column literature-library-layout">
            <section className="panel-card literature-library-panel">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="panel-title">
                  <BookOpen size={17} />
                  本地文献库
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    className="primary-action h-8 gap-2 px-3"
                    onClick={() => void stageLocalPdfImport()}
                    disabled={pendingLocalPdfBusy}
                  >
                    <FileUp size={14} />
                    导入本地 PDF
                  </button>
                  <button
                    type="button"
                    className="secondary-action h-8 gap-2 px-3"
                    aria-expanded={libraryDiagnosticsOpen}
                    aria-controls="library-diagnostics-panel"
                    onClick={() => setLibraryDiagnosticsOpen((current) => !current)}
                  >
                    库诊断
                    <ChevronDown className={`transition-transform ${libraryDiagnosticsOpen ? "rotate-180" : ""}`} size={14} />
                  </button>
                  <button
                    type="button"
                    className="secondary-action h-8 gap-2 px-3"
                    onClick={allVisiblePapersSelected ? deselectCurrentPage : selectCurrentPage}
                    disabled={visibleLibraryPapers.length === 0}
                  >
                    {allVisiblePapersSelected ? <Square size={14} /> : <CheckSquare size={14} />}
                    {allVisiblePapersSelected ? "取消本页" : "选中本页"}
                  </button>
                  <label className="flex items-center gap-2 text-xs text-ink/45">
                    每页
                    <div className="w-20">
                      <SelectControl className="h-8 text-xs" value={String(pageSize)} options={[12, 20, 40, 80].map((count) => ({ value: String(count), label: String(count) }))} onChange={(value) => setPageSize(Number(value))} />
                    </div>
                  </label>
                </div>
              </div>

              {pendingLocalPdf && (
                <div className="mt-4 rounded-[9px] border border-cyan/30 bg-cyan/5 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-ink">待关联文件：{pendingLocalPdf.fileName}</div>
                      <p className="mt-1 text-xs leading-5 text-ink/50">
                        请先在下方列表中明确选择论文。Sidera 不会依据文件名、目录名或 PDF 文本自动推断身份。
                      </p>
                      <p className="mt-1 text-xs text-cyan">
                        当前目标：{selectedPaper ? `《${selectedPaper.title}》` : "尚未选择论文"}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        className="field-control h-9 min-w-[150px] px-3 text-xs"
                        value={pendingLocalPdfVersionKind}
                        onChange={(event) => setPendingLocalPdfVersionKind(event.target.value as SideraDocumentVersionKind)}
                        aria-label="选择待关联 PDF 的版本类型"
                      >
                        {Object.entries(documentVersionKindLabels).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="primary-action h-9 gap-2 px-3"
                        onClick={() => void associatePendingLocalPdf()}
                        disabled={!selectedPaper || pendingLocalPdfBusy}
                      >
                        {pendingLocalPdfBusy ? <Loader2 className="animate-spin" size={14} /> : <Link2 size={14} />}
                        确认关联
                      </button>
                      <button
                        type="button"
                        className="secondary-action h-9 px-3"
                        onClick={() => setPendingLocalPdf(null)}
                        disabled={pendingLocalPdfBusy}
                      >
                        取消
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="library-toolbar-sticky">
                <div className="grid gap-2 lg:grid-cols-[minmax(280px,1fr)_128px_150px_128px_128px]">
                  <div className="flex min-w-0 gap-2">
                    <input
                      className="field-control h-9 min-w-0 flex-1 px-3 text-sm"
                      value={libraryQueryDraft}
                      onChange={(event) => setLibraryQueryDraft(event.target.value)}
                      onCompositionStart={() => setLibraryQueryComposing(true)}
                      onCompositionEnd={(event) => {
                        setLibraryQueryComposing(false);
                        setLibraryQueryDraft(event.currentTarget.value);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.nativeEvent.isComposing) executeLibraryKeywordSearch();
                      }}
                      placeholder="输入后按 Enter 或点击检索"
                      aria-label="本地文献关键词"
                    />
                    <button
                      type="button"
                      className="primary-action h-9 shrink-0 gap-1.5 px-3"
                      onClick={executeLibraryKeywordSearch}
                      disabled={libraryQueryComposing || !libraryQueryDraft.trim() || libraryQueryDraft.trim() === libraryQuery.trim()}
                    >
                      <Search size={14} />
                      检索
                    </button>
                    <button
                      type="button"
                      className="secondary-action h-9 w-9 shrink-0 p-0"
                      aria-label="重新检索当前条件"
                      title="重新检索当前条件"
                      onClick={refreshLibraryKeywordSearch}
                      disabled={libraryQueryComposing || libraryLoading}
                    >
                      <RefreshCw className={libraryLoading ? "animate-spin" : ""} size={14} />
                    </button>
                  </div>
                  <SelectControl className="h-9 text-sm" value={librarySource} options={[{ value: "all", label: "全部来源" }, ...paperSourceOptions]} onChange={(value) => setLibrarySource(value as SourceKind | "all")} />
                  <SelectControl className="h-9 text-sm" value={libraryField} options={[{ value: "all", label: "全部学科" }, ...fields.map((field) => ({ value: field, label: field }))]} onChange={setLibraryField} />
                  <SelectControl className="h-9 text-sm" value={libraryYear} options={[{ value: "all", label: "全部年份" }, ...years.map((year) => ({ value: String(year), label: String(year) }))]} onChange={setLibraryYear} />
                  <SelectControl className="h-9 text-sm" value={librarySort} options={[{ value: "newest", label: "最新" }, { value: "oldest", label: "最早" }, { value: "title", label: "标题" }]} onChange={(value) => setLibrarySort(value as "newest" | "oldest" | "title")} />
                </div>
                <div className="library-filter-strip">
                  {libraryQueryDraft.trim() !== libraryQuery.trim() && <span>待检索：{libraryQueryDraft.trim() || "空"}</span>}
                  {activeFilterLabels.length > 0 ? activeFilterLabels.map((label) => <span key={label}>{label}</span>) : <span>当前为全库视图</span>}
                  {activeFilterLabels.length > 0 && <button type="button" onClick={clearLibraryFilters}>清空筛选</button>}
                  <strong>{pageStart.toLocaleString()}-{pageEnd.toLocaleString()} / {libraryPage.total.toLocaleString()}</strong>
                </div>
              </div>

              {libraryDiagnosticsOpen && <div id="library-diagnostics-panel" className="library-diagnostics-panel">
                <div className="library-diagnostics">
                  <span>查询耗时：{libraryLoading ? "查询中" : `${libraryPage.queryMs} ms`}</span>
                  <span>本次会话查询次数：{libraryQueryExecutionCount}</span>
                  <span>排序标准：{librarySort === "newest" ? "年份从新到旧" : librarySort === "oldest" ? "年份从旧到新" : "题名字母序"}</span>
                  <span>来源索引：{filterIndex.sources}</span>
                  <span>学科索引：{filterIndex.fields}</span>
                  <span>年份索引：{filterIndex.years}</span>
                  <span>关键词估算：{filterIndex.keywords}</span>
                </div>
                <DataQualityPanel hints={qualityHints} />
              </div>}

              <div ref={paperListScrollRef} className="library-paper-scroll space-y-2">
                {visibleLibraryPapers.map((paper, index) => (
                  <article key={paper.id} className={`paper-row ${selectedPaper?.id === paper.id ? "paper-row-active" : ""}`}>
                    <button
                      type="button"
                      className={`paper-index ${selectedIds.includes(paper.id) ? "paper-index-active" : ""}`}
                      aria-label={selectedIds.includes(paper.id) ? `取消批量选择：${paper.title}` : `加入批量选择：${paper.title}`}
                      aria-pressed={selectedIds.includes(paper.id)}
                      onClick={() => toggleSelected(paper.id)}
                    >
                      {selectedIds.includes(paper.id) ? <CheckSquare size={14} /> : (page - 1) * pageSize + index + 1}
                    </button>
                    <button
                      type="button"
                      className="paper-row-main"
                      aria-controls="paper-detail-panel"
                      aria-pressed={selectedPaper?.id === paper.id}
                      onClick={() => requestPaperSelection(paper.id)}
                    >
                      <span className="paper-row-title">{paper.title}</span>
                      <span className="mt-1 block text-xs text-ink/40">{paper.source} | {paper.year ?? "未知年份"} | {paper.field}</span>
                      <span className="paper-row-abstract">{paper.abstract}</span>
                    </button>
                  </article>
                ))}
                {!libraryLoading && visibleLibraryPapers.length === 0 && <EmptyState title="没有匹配文献" description="调整筛选条件，或前往“检索与导入”添加文献。" />}
              </div>

              {selectedIds.length > 0 && (
                <div className="library-bulk-bar">
                  <strong>已选 {selectedIds.length} 篇</strong>
                  <button className="secondary-action h-8 gap-2 px-3" onClick={() => setSelectedIds([])}>
                    <X size={14} />
                    清空选择
                  </button>
                  <button className="danger-action h-8 gap-2 px-3" onClick={() => void deleteSelected()} disabled={Boolean(busy)}>
                    <Trash2 size={14} />
                    删除选中
                  </button>
                  <button className="primary-action ml-auto h-8 gap-2 px-3" onClick={() => setWorkspaceTab("analysis")}>
                    <FlaskConical size={14} />
                    前往批量分析
                  </button>
                </div>
              )}

              <div className="library-pagination">
                <span>第 {Math.min(page, pageCount)} / {pageCount} 页，共 {libraryPage.total.toLocaleString()} 篇</span>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    className="field-control h-8 w-16 px-2 text-xs"
                    value={pageJump}
                    onChange={(event) => setPageJump(event.target.value.replace(/[^\d]/g, ""))}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") jumpToLibraryPage();
                    }}
                  />
                  <button className="secondary-action h-8 px-3" onClick={jumpToLibraryPage}>跳转</button>
                  <button className="secondary-action h-8 px-3" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>上一页</button>
                  <button className="secondary-action h-8 px-3" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={page >= pageCount}>下一页</button>
                </div>
              </div>
            </section>

            <section id="paper-detail-panel" ref={paperDetailScrollRef} className="panel-card literature-detail-panel">
              <PaperDetailEditor
                ref={paperDetailEditorRef}
                paper={selectedPaper}
                qualityHints={qualityHints.filter((hint) => !hint.paperId || hint.paperId === selectedPaper?.id)}
                onDirtyChange={setPaperDetailDirty}
                onSave={async (paper) => {
                  try {
                    await upsertPaperLibrary(settings.databaseDir, activeProject.id, [paper]);
                    await loadLibraryPage({ force: true });
                    await onRefresh();
                    onNotice("文献详情已保存。");
                  } catch (error) {
                    onNotice(error instanceof Error ? error.message : "文献保存失败。", "error");
                    throw error;
                  }
                }}
              />
              {selectedPaper && (
                <PaperDocumentPanel
                  databaseDir={settings.databaseDir}
                  projectId={activeProject.id}
                  paper={selectedPaper}
                  refreshRevision={documentRefreshRevision}
                  onReadVersion={(versionId) => setDocumentReaderTarget({
                    paperId: selectedPaper.id,
                    versionId,
                    title: selectedPaper.title,
                  })}
                  onInstitutionSourceOpened={() => {
                    setWorkspaceTab("institution");
                    onInstitutionBrowserPresentationChange("split");
                  }}
                  onNotice={onNotice}
                />
              )}
            </section>
          </div>
        </>
      )}

      <dialog
        ref={unsavedPaperDialogRef}
        className="unsaved-paper-dialog"
        aria-labelledby="unsaved-paper-dialog-title"
        aria-describedby="unsaved-paper-dialog-description"
        onCancel={(event) => {
          event.preventDefault();
          cancelPendingPaperSelection();
        }}
        onClose={() => {
          if (!pendingPaperSave) setPendingPaperSelectionId("");
        }}
      >
        <div className="unsaved-paper-dialog-body">
          <div>
            <h2 id="unsaved-paper-dialog-title">当前修改尚未保存</h2>
            <p id="unsaved-paper-dialog-description">切换论文前，请选择保存当前修改、放弃修改，或继续编辑。</p>
          </div>
          <div className="unsaved-paper-dialog-actions">
            <button type="button" className="secondary-action h-9 px-3" onClick={cancelPendingPaperSelection} disabled={pendingPaperSave}>继续编辑</button>
            <button type="button" className="danger-action h-9 px-3" onClick={discardAndSelectPendingPaper} disabled={pendingPaperSave}>放弃修改</button>
            <button type="button" className="primary-action h-9 gap-2 px-3" onClick={() => void saveAndSelectPendingPaper()} disabled={pendingPaperSave}>
              {pendingPaperSave && <Loader2 className="animate-spin" size={14} />}
              {pendingPaperSave ? "正在保存" : "保存并切换"}
            </button>
          </div>
        </div>
      </dialog>

      {activeWorkspaceTab === "analysis" && (
        <section className="panel-card literature-analysis">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="panel-title">
                <FlaskConical size={17} />
                批量证据分析
              </div>
              <p className="mt-2 text-sm text-ink/55">用选中文献构建证据包，并生成可保存到报告库的研究综述。</p>
            </div>
            {reportPapers.length > 0 && (
              <div className="analysis-evidence-summary">
                <span><strong>{reportPapers.length}</strong> 篇文献</span>
                <span>{reportEvidenceSummary.years}</span>
                <span>{reportEvidenceSummary.sources}</span>
              </div>
            )}
          </div>

          {reportPapers.length === 0 ? (
            <div className="analysis-empty">
              <EmptyState title="尚未选择文献" description="返回本地文献库选中一组文献，再在这里设置报告深度与证据参数。" />
              <button className="primary-action h-10 gap-2" onClick={() => setWorkspaceTab("library")}>
                <BookOpen size={15} />
                返回文献库选择
              </button>
            </div>
          ) : (
            <>
              <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_220px]">
                <label className="field-label">
                  报告主题
                  <input className="field-control h-11 px-3" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入研究主题" />
                </label>
                <label className="field-label">
                  研究领域
                  <SelectControl className="h-11 text-sm" value={discipline} options={DISCIPLINES.map((item) => ({ value: item, label: item }))} onChange={setDiscipline} />
                </label>
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-y border-line/40 py-4">
                <div>
                  <div className="text-sm font-medium text-ink/80">报告深度</div>
                  <div className="mt-1 text-xs text-ink/45">预估 {workload.words} 字 / {workload.tokens} tokens / {workload.minutes} 分钟</div>
                </div>
                <div className="analysis-mode-switch" role="group" aria-label="报告深度">
                  <button type="button" className={reportMode === "simple" ? "active" : ""} onClick={() => setReportMode("simple")}>简版</button>
                  <button type="button" className={reportMode === "deep" ? "active" : ""} onClick={() => setReportMode("deep")}>深版</button>
                </div>
              </div>

              <ReportOptionsPanel options={reportOptions} onChange={setReportOptions} />
              <EvidenceMini papers={reportPapers} />

              <div className="mt-5 flex flex-wrap items-center gap-2">
                <button className="primary-action h-10 gap-2" onClick={() => void runReport(reportMode)} disabled={Boolean(busy)}>
                  {busy ? <Loader2 className="animate-spin" size={15} /> : <Sparkles size={15} />}
                  生成报告
                </button>
                {currentReport && (
                  <button className="secondary-action h-10 gap-2" onClick={() => void runRevision()} disabled={Boolean(busy)}>
                    <RefreshCw size={15} />
                    修订当前报告
                  </button>
                )}
              </div>
              {busy && <div className="mt-4 rounded-[8px] border border-cyan/20 bg-cyan/5 p-3 text-sm text-cyan">{busy}</div>}

              {currentReport && (
                <div className="report-preview mt-5">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium text-ink">{currentReport.topic}</div>
                      <div className="text-xs text-ink/40">{currentReport.mode} | {formatDateTime(currentReport.createdAt)}</div>
                    </div>
                    <div className="text-xs text-cyan/80">{Math.round(currentReport.metrics.consistencyScore * 100)}% 可信度</div>
                  </div>
                  <pre>{currentReport.content}</pre>
                </div>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}

type SideraResearchFilterKind = SideraResearchSearchFilters["recordKinds"][number];

function isTerminalInstitutionConnectionPhase(
  phase: NonNullable<SideraInstitutionSessionState["activeConnection"]>["phase"],
) {
  return phase === "ready" || phase === "cancelled" || phase === "failed";
}

function shouldAcceptInstitutionSessionState(
  current: SideraInstitutionSessionState | null,
  next: SideraInstitutionSessionState,
) {
  if (!current) return true;
  if (next.updatedAtMs < current.updatedAtMs) return false;

  const currentConnection = current.activeConnection;
  const nextConnection = next.activeConnection;
  if (!currentConnection || !nextConnection
    || currentConnection.transactionId !== nextConnection.transactionId) {
    return true;
  }
  if (isTerminalInstitutionConnectionPhase(currentConnection.phase)
    && nextConnection.phase !== currentConnection.phase) {
    return false;
  }
  if (nextConnection.updatedAtMs < currentConnection.updatedAtMs) return false;

  const phaseOrder: Record<NonNullable<SideraInstitutionSessionState["activeConnection"]>["phase"], number> = {
    opening: 0,
    "awaiting-user": 1,
    verifying: 2,
    "refreshing-parent": 3,
    ready: 4,
    cancelled: 4,
    failed: 4,
  };
  return phaseOrder[nextConnection.phase] >= phaseOrder[currentConnection.phase];
}

const DEFAULT_SIDERA_RESEARCH_FILTERS: SideraResearchSearchFilters = {
  recordKinds: ["journal-article", "conference-paper", "thesis"],
  yearFrom: null,
  yearTo: null,
  fullTextOnly: false,
};

function InstitutionResourceWorkspace({
  session,
  snapshots,
  researchSearchState,
  researchSearchQuery,
  selectedResearchCandidateIds,
  browserPresentation,
  onSessionChange,
  onSnapshotChange,
  onResearchSearchQueryChange,
  onSelectedResearchCandidateIdsChange,
  onStartResearchSearch,
  onStopResearchSearch,
  onBrowserPresentationChange,
  onCreateReviewBatch,
  onNotice,
}: {
  session: SideraInstitutionSessionState | null;
  snapshots: Record<SideraInstitutionSearchSource, SideraInstitutionSearchSnapshot | null>;
  researchSearchState: SideraResearchSearchState | null;
  researchSearchQuery: string;
  selectedResearchCandidateIds: string[];
  browserPresentation: SideraInstitutionBrowserPresentation;
  onSessionChange: (state: SideraInstitutionSessionState) => void;
  onSnapshotChange: (snapshot: SideraInstitutionSearchSnapshot) => void;
  onResearchSearchQueryChange: (query: string) => void;
  onSelectedResearchCandidateIdsChange: (ids: string[]) => void;
  onStartResearchSearch: (
    query: string,
    startReason: SideraResearchSearchStartReason,
    filters: SideraResearchSearchFilters,
    resultLimit: 40 | 100,
  ) => Promise<SideraResearchSearchState>;
  onStopResearchSearch: () => Promise<SideraResearchSearchState>;
  onBrowserPresentationChange: (presentation: SideraInstitutionBrowserPresentation) => void;
  onCreateReviewBatch: (
    snapshot: SideraResearchSearchSnapshot,
    candidateIds: string[],
  ) => Promise<void>;
  onNotice: AppNoticeHandler;
}) {
  type InstitutionWorkspaceMode = SideraInstitutionSearchSource | "database-direct";
  const [selectedSource, setSelectedSource] = useState<InstitutionWorkspaceMode>("academic-discovery");
  const [sessionBusy, setSessionBusy] = useState(false);
  const [researchReviewBusy, setResearchReviewBusy] = useState(false);
  const [connectionDrawerOpen, setConnectionDrawerOpen] = useState(false);
  const [connectionDrawerSurfaceHeld, setConnectionDrawerSurfaceHeld] = useState(false);
  const connectionDrawerReleaseTimerRef = useRef<number | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [researchRecordKinds, setResearchRecordKinds] = useState<SideraResearchFilterKind[]>(
    DEFAULT_SIDERA_RESEARCH_FILTERS.recordKinds,
  );
  const [researchYearFrom, setResearchYearFrom] = useState("");
  const [researchYearTo, setResearchYearTo] = useState("");
  const [researchResultLimit, setResearchResultLimit] = useState<40 | 100>(40);
  const [researchDisplayOrder, setResearchDisplayOrder] = useState<SideraResearchDisplayOrder>("source-return-order");
  const [browserState, setBrowserState] = useState<SideraInstitutionBrowserState | null>(null);
  const [browserAddressDraft, setBrowserAddressDraft] = useState("");
  const [browserBusy, setBrowserBusy] = useState(false);
  const [browserVisibilityDiagnostic, setBrowserVisibilityDiagnostic] = useState<{
    target: "visible" | "hidden";
    attempts: number;
    message: string;
  } | null>(null);
  const [downloadsOpen, setDownloadsOpen] = useState(false);
  const [splitRatio, setSplitRatio] = useState(() => {
    try {
      return parseSideraInstitutionBrowserLayout(
        window.localStorage.getItem(SIDERA_INSTITUTION_BROWSER_LAYOUT_STORAGE_KEY),
      );
    } catch {
      return SIDERA_INSTITUTION_BROWSER_DEFAULT_RATIO;
    }
  });
  const [splitHostWidth, setSplitHostWidth] = useState(() => window.innerWidth);
  const [narrowPane, setNarrowPane] = useState<SideraInstitutionNarrowPane>("native");
  const browserHostRef = useRef<HTMLDivElement | null>(null);
  const splitHostRef = useRef<HTMLDivElement | null>(null);
  const browserBoundsRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const browserVisibilitySequenceRef = useRef(0);
  const browserVisibilityDesiredRef = useRef(false);
  const dividerFrameRef = useRef(0);
  const dividerClientXRef = useRef<number | null>(null);
  const searchSource = selectedSource === "database-direct" ? null : selectedSource;
  const snapshot = searchSource ? snapshots[searchSource] : null;
  const activeSearch = snapshots.catalog?.status === "searching" ? snapshots.catalog : null;
  const displayedResearchSnapshot = researchSearchState?.displayedSnapshot ?? null;
  const activeResearchAttempt = researchSearchState?.activeAttempt ?? null;
  const researchSearchActive = Boolean(activeResearchAttempt);
  const searching = researchSearchActive || Boolean(activeSearch);
  const databaseAuth = session?.databaseAuth;
  const academicDiscoveryAuth = session?.academicDiscoveryAuth;
  const libraryAccountAuth = session?.libraryAccountAuth;
  const databaseSessionReady = databaseAuth?.status === "ready";
  const activeConnection = session?.activeConnection ?? null;
  const activeDatabaseConnection = activeConnection?.goal === "database-access"
    ? activeConnection
    : null;
  const activeDiscoveryConnection = activeConnection?.goal === "discovery-fulltext"
    && !isTerminalInstitutionConnectionPhase(activeConnection.phase)
    && session?.discoveryAuthWindowVisible
    ? activeConnection
    : null;
  const activeAuth = session?.authModalVisible && session.activeAuthKind === "library-account"
    ? libraryAccountAuth
    : selectedSource === "academic-discovery"
      ? academicDiscoveryAuth
      : databaseAuth;
  const sourceReadiness = searchSource
    ? session?.sourceReadiness?.find((value) => value.source === searchSource)
    : null;
  const academicBackendReadiness = researchSearchActive
    ? "starting"
    : displayedResearchSnapshot?.status === "complete"
      ? "ready"
      : displayedResearchSnapshot?.status === "partial"
        ? "partial"
        : researchSearchState?.lastFailure?.status === "failed"
          ? "failed"
          : "uninitialized";
  const adapterId = selectedSource === "academic-discovery"
    ? SIDERA_RESEARCH_ACADEMIC_CONNECTOR_ID
    : selectedSource === "catalog"
      ? SIDERA_INSTITUTION_CATALOG_ADAPTER_ID
      : "whu-database-directory-v1";
  const activeBrowserTab = browserState?.tabs.find((tab) => tab.id === browserState.activeTabId) ?? null;
  const managedPopupNotices = (browserState?.popups ?? [])
    .filter((popup) => popup.phase !== "closed")
    .slice(-3);
  const splitLayout = useMemo(
    () => resolveSideraInstitutionSplitLayout(splitHostWidth, splitRatio),
    [splitHostWidth, splitRatio],
  );
  const setConnectionDrawerPresentation = useCallback((open: boolean) => {
    if (connectionDrawerReleaseTimerRef.current !== null) {
      window.clearTimeout(connectionDrawerReleaseTimerRef.current);
      connectionDrawerReleaseTimerRef.current = null;
    }
    if (open) {
      setConnectionDrawerSurfaceHeld(true);
      setConnectionDrawerOpen(true);
      return;
    }
    setConnectionDrawerOpen(false);
    const releaseDelay = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 230;
    connectionDrawerReleaseTimerRef.current = window.setTimeout(() => {
      setConnectionDrawerSurfaceHeld(false);
      connectionDrawerReleaseTimerRef.current = null;
    }, releaseDelay);
  }, []);

  useEffect(() => () => {
    if (connectionDrawerReleaseTimerRef.current !== null) {
      window.clearTimeout(connectionDrawerReleaseTimerRef.current);
    }
  }, []);

  const browserSurfaceVisible = browserPresentation !== "closed"
    && !connectionDrawerSurfaceHeld
    && (browserPresentation === "immersive" || !splitLayout.narrow || narrowPane === "browser");
  const workspaceStyle = {
    "--institution-native-pane-width": `${splitLayout.nativeWidth}px`,
  } as CSSProperties;

  useEffect(() => {
    if (!isDesktopRuntime()) return undefined;
    let disposed = false;
    const unlistens: Array<() => void> = [];
    void Promise.all([
      listenSideraInstitutionBrowser((next) => {
        if (!disposed) setBrowserState(next);
      }),
      listenSideraInstitutionDownloads((record) => {
        if (disposed) return;
        setBrowserState((current) => current ? {
          ...current,
          downloads: [record, ...current.downloads.filter((item) => item.id !== record.id)]
            .sort((left, right) => right.createdAtMs - left.createdAtMs),
          updatedAtMs: Date.now(),
        } : current);
      }),
    ]).then((rows) => unlistens.push(...rows)).catch(() => undefined);
    void getSideraInstitutionBrowserState().then((next) => {
      if (!disposed) setBrowserState(next);
    }).catch(() => undefined);
    return () => {
      disposed = true;
      unlistens.forEach((unlisten) => unlisten());
    };
  }, []);

  useEffect(() => {
    setBrowserAddressDraft(activeBrowserTab?.address ?? "");
  }, [activeBrowserTab?.id, activeBrowserTab?.address]);

  const reconcileBrowserSurfaceVisibility = useCallback(async (
    visible: boolean,
    reportFailure = true,
  ) => {
    const sequence = browserVisibilitySequenceRef.current + 1;
    browserVisibilitySequenceRef.current = sequence;
    browserVisibilityDesiredRef.current = visible;
    const retryDelays = visible ? [0] : [0, 45, 120];
    let failureMessage = visible
      ? "SIDERA_INSTITUTION_BROWSER_SHOW_FAILED"
      : "SIDERA_INSTITUTION_BROWSER_HIDE_FAILED";
    for (let attempt = 0; attempt < retryDelays.length; attempt += 1) {
      const delay = retryDelays[attempt];
      if (delay > 0) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, delay));
      }
      if (
        sequence !== browserVisibilitySequenceRef.current
        || browserVisibilityDesiredRef.current !== visible
      ) return false;
      try {
        const next = await setSideraInstitutionBrowserShellVisible(visible);
        if (
          sequence !== browserVisibilitySequenceRef.current
          || browserVisibilityDesiredRef.current !== visible
        ) return false;
        if (next.visible !== visible) {
          failureMessage = visible
            ? "SIDERA_INSTITUTION_BROWSER_SHOW_STATE_MISMATCH"
            : "SIDERA_INSTITUTION_BROWSER_HIDE_STATE_MISMATCH";
          continue;
        }
        setBrowserState(next);
        setBrowserVisibilityDiagnostic(null);
        return true;
      } catch (error) {
        failureMessage = error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : failureMessage;
      }
    }
    if (
      sequence !== browserVisibilitySequenceRef.current
      || browserVisibilityDesiredRef.current !== visible
    ) return false;
    setBrowserVisibilityDiagnostic({
      target: visible ? "visible" : "hidden",
      attempts: retryDelays.length,
      message: failureMessage,
    });
    if (reportFailure) {
      onNotice(
        visible
          ? "机构浏览器显示失败，请查看技术诊断后重试。"
          : "机构浏览器未能安全隐藏；页面保持当前布局，请查看技术诊断后重试。",
        "error",
        { dismissAfterMs: 8_000 },
      );
    }
    return false;
  }, [onNotice]);

  async function setBrowserPresentation(next: SideraInstitutionBrowserPresentation) {
    if (next === "closed" && isDesktopRuntime()) {
      const hidden = await reconcileBrowserSurfaceVisibility(false);
      if (!hidden) return false;
    }
    if (next !== "closed" && splitLayout.narrow) setNarrowPane("browser");
    onBrowserPresentationChange(next);
    return true;
  }

  useLayoutEffect(() => {
    const host = splitHostRef.current;
    if (!host) return undefined;
    const update = () => {
      const width = host.getBoundingClientRect().width;
      if (width > 0) setSplitHostWidth((current) => Math.abs(current - width) < 1 ? current : width);
    };
    const observer = new ResizeObserver(update);
    observer.observe(host);
    window.addEventListener("resize", update);
    update();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  useLayoutEffect(() => {
    if (!isDesktopRuntime()) return undefined;
    void reconcileBrowserSurfaceVisibility(browserSurfaceVisible);
    return undefined;
  }, [browserSurfaceVisible, reconcileBrowserSurfaceVisibility]);

  useEffect(() => () => {
    if (!isDesktopRuntime()) return;
    const sequence = browserVisibilitySequenceRef.current + 1;
    browserVisibilitySequenceRef.current = sequence;
    browserVisibilityDesiredRef.current = false;
    void (async () => {
      for (const delay of [0, 45, 120]) {
        if (delay > 0) {
          await new Promise<void>((resolve) => window.setTimeout(resolve, delay));
        }
        if (sequence !== browserVisibilitySequenceRef.current) return;
        try {
          await setSideraInstitutionBrowserShellVisible(false);
          return;
        } catch {
          // Unmount cleanup is bounded; an active workspace reports its own diagnostic.
        }
      }
    })();
  }, []);

  useEffect(() => {
    if (!browserSurfaceVisible || !browserHostRef.current || !isDesktopRuntime()) return undefined;
    let frame = 0;
    browserBoundsRef.current = null;
    const update = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const rect = browserHostRef.current?.getBoundingClientRect();
        if (!rect || rect.width < 120 || rect.height < 120) return;
        const nextBounds = {
          x: Math.max(0, rect.left),
          y: Math.max(0, rect.top),
          width: rect.width,
          height: rect.height,
        };
        const currentBounds = browserBoundsRef.current;
        if (currentBounds && [
          Math.abs(currentBounds.x - nextBounds.x),
          Math.abs(currentBounds.y - nextBounds.y),
          Math.abs(currentBounds.width - nextBounds.width),
          Math.abs(currentBounds.height - nextBounds.height),
        ].every((delta) => delta < 1)) return;
        browserBoundsRef.current = nextBounds;
        void setSideraInstitutionBrowserShellBounds(nextBounds).catch(() => undefined);
      });
    };
    const observer = new ResizeObserver(update);
    observer.observe(browserHostRef.current);
    window.addEventListener("resize", update);
    update();
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [browserSurfaceVisible]);

  function persistSplitRatio(nextRatio: number) {
    try {
      window.localStorage.setItem(
        SIDERA_INSTITUTION_BROWSER_LAYOUT_STORAGE_KEY,
        serializeSideraInstitutionBrowserLayout(nextRatio),
      );
    } catch {
      // A blocked storage backend must not prevent the workspace from resizing.
    }
  }

  function ratioFromClientX(clientX: number) {
    const rect = splitHostRef.current?.getBoundingClientRect();
    if (!rect) return splitLayout.ratio;
    const availableWidth = Math.max(1, rect.width - SIDERA_INSTITUTION_BROWSER_DIVIDER_WIDTH);
    return resolveSideraInstitutionSplitLayout(
      rect.width,
      (clientX - rect.left) / availableWidth,
    ).ratio;
  }

  function handleDividerPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    dividerClientXRef.current = event.clientX;
    if (dividerFrameRef.current) return;
    dividerFrameRef.current = window.requestAnimationFrame(() => {
      dividerFrameRef.current = 0;
      const clientX = dividerClientXRef.current;
      if (clientX !== null) setSplitRatio(ratioFromClientX(clientX));
    });
  }

  function finishDividerDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (dividerFrameRef.current) window.cancelAnimationFrame(dividerFrameRef.current);
    dividerFrameRef.current = 0;
    dividerClientXRef.current = null;
    const nextRatio = ratioFromClientX(event.clientX);
    setSplitRatio(nextRatio);
    persistSplitRatio(nextRatio);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleDividerKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home"].includes(event.key)) return;
    event.preventDefault();
    const requestedRatio = event.key === "Home"
      ? SIDERA_INSTITUTION_BROWSER_DEFAULT_RATIO
      : splitLayout.ratio + (event.key === "ArrowLeft" ? -0.02 : 0.02);
    const nextRatio = resolveSideraInstitutionSplitLayout(splitHostWidth, requestedRatio).ratio;
    setSplitRatio(nextRatio);
    persistSplitRatio(nextRatio);
  }

  async function openInstitutionConnection(
    goal: "database-access" | "library-account" | "discovery-fulltext" = "database-access",
  ) {
    setSessionBusy(true);
    try {
      const next = await beginSideraInstitutionConnection(goal);
      onSessionChange(next);
    } catch (error) {
      onNotice(
        error instanceof Error
          ? error.message
          : goal === "database-access"
            ? "机构连接初始化失败。"
            : goal === "library-account"
              ? "个人图书馆连接初始化失败。"
              : "统一发现全文认证初始化失败。",
        "error",
        goal === "database-access" ? { scope: "institution-sso" } : undefined,
      );
    } finally {
      setSessionBusy(false);
    }
  }

  async function cancelActiveInstitutionConnection() {
    const transactionId = session?.activeConnection?.transactionId;
    if (!transactionId) {
      onNotice("当前没有可取消的机构连接事务。", "info");
      return;
    }
    try {
      const next = await cancelSideraInstitutionConnection(transactionId);
      onSessionChange(next);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "取消机构连接失败。", "error");
    }
  }

  async function cancelLegacyInstitutionAuthModal() {
    try {
      const next = await cancelSideraInstitutionAuth(session?.activeAuthKind ?? "library-account");
      onSessionChange(next);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "取消旧版认证窗口失败。", "error");
    }
  }

  async function cancelInstitutionBrowserAuthModal() {
    setBrowserBusy(true);
    try {
      setBrowserState(await cancelSideraInstitutionBrowserAuth());
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "取消机构浏览器认证窗口失败。", "error");
    } finally {
      setBrowserBusy(false);
    }
  }

  function selectedResearchFilters(): SideraResearchSearchFilters | null {
    if (researchRecordKinds.length === 0) {
      onNotice("请至少选择一种文献类型。", "info");
      return null;
    }
    const yearFrom = researchYearFrom.trim() ? Number(researchYearFrom) : null;
    const yearTo = researchYearTo.trim() ? Number(researchYearTo) : null;
    if ((yearFrom !== null && !Number.isInteger(yearFrom)) || (yearTo !== null && !Number.isInteger(yearTo))) {
      onNotice("年份必须填写为整数。", "info");
      return null;
    }
    if (yearFrom !== null && yearTo !== null && yearFrom > yearTo) {
      onNotice("起始年份不能晚于结束年份。", "info");
      return null;
    }
    return {
      recordKinds: researchRecordKinds,
      yearFrom,
      yearTo,
      fullTextOnly: false,
    };
  }

  async function runInstitutionSearch(
    startReason: SideraResearchSearchStartReason = "user-search",
  ) {
    if (!searchSource) return;
    if (searching) return;
    if (!researchSearchQuery.trim()) {
      onNotice("请输入机构检索词。", "info");
      return;
    }
    try {
      if (searchSource === "academic-discovery") {
        const filters = selectedResearchFilters();
        if (!filters) return;
        await onStartResearchSearch(
          researchSearchQuery.trim(),
          startReason,
          filters,
          researchResultLimit,
        );
        return;
      }
      let nextSession = session;
      if (!nextSession || nextSession.databaseAuth.status !== "ready") {
        nextSession = await beginSideraInstitutionConnection("database-access");
        onSessionChange(nextSession);
      }
      if (nextSession.databaseAuth.status !== "ready") {
        onNotice("请先完成数据库 SSO 登录；个人图书馆登录不能替代数据库检索会话。", "info");
        return;
      }
      const next = await startSideraInstitutionSearch(researchSearchQuery, searchSource);
      onSnapshotChange(next);
    } catch (error) {
      onNotice(
        error instanceof Error ? error.message : "机构检索启动失败。",
        "error",
        { scope: session?.databaseAuth.status === "ready" ? "institution-search" : "institution-sso" },
      );
    }
  }

  async function stopInstitutionSearch() {
    try {
      if (selectedSource === "academic-discovery" && researchSearchActive) {
        await onStopResearchSearch();
        return;
      }
      const next = await cancelSideraInstitutionSearch(activeSearch?.taskId);
      onSnapshotChange(next);
    } catch (error) {
      onNotice(
        error instanceof Error ? error.message : "停止机构检索失败。",
        "error",
        { scope: "institution-search" },
      );
    }
  }

  async function openRawResult(
    resultId: string,
    target: "record" | "full-text" = "record",
    mode: "embedded" | "system" = "embedded",
  ) {
    if (!searchSource) return;
    try {
      if (searchSource === "academic-discovery" && displayedResearchSnapshot) {
        const candidate = displayedResearchSnapshot.candidates.find((item) =>
          item.id === resultId
          || item.detailLocator === resultId
          || item.fullTextLocator === resultId
        );
        if (!candidate) throw new Error("原生论文候选已失效，请重新检索。");
        await openSideraResearchResult({
          candidateId: candidate.id,
          target,
          mode,
        });
        setBrowserState(await getSideraInstitutionBrowserState());
        void setBrowserPresentation("split");
        return;
      }
      await openSideraInstitutionResult({
        resultId,
        mode,
        source: searchSource,
        target,
      });
      setBrowserState(await getSideraInstitutionBrowserState());
      void setBrowserPresentation("split");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "原始记录已失效，请重新检索。", "error");
    }
  }

  async function addSelectedResearchCandidatesToReview() {
    if (!displayedResearchSnapshot || selectedResearchCandidateIds.length === 0) {
      onNotice("请先选择要加入审查的论文候选。", "info");
      return;
    }
    setResearchReviewBusy(true);
    try {
      await onCreateReviewBatch(displayedResearchSnapshot, selectedResearchCandidateIds);
    } finally {
      setResearchReviewBusy(false);
    }
  }

  async function resetInstitutionSession() {
    const previousPresentation = browserPresentation;
    const hidden = await setBrowserPresentation("closed");
    if (!hidden) return;
    if (!window.confirm("清除机构会话会移除 Sidera 内独立保存的武汉大学登录数据。论文库、设置和系统浏览器会话不受影响。是否继续？")) {
      void setBrowserPresentation(previousPresentation);
      return;
    }
    setSessionBusy(true);
    try {
      setBrowserState(await resetSideraInstitutionBrowser());
      const next = await resetSideraInstitutionSession();
      onSessionChange(next);
      for (const source of ["academic-discovery", "catalog"] as const) {
        onSnapshotChange({
          institutionId: "whu",
          adapterId: source === "academic-discovery"
            ? SIDERA_INSTITUTION_ACADEMIC_ADAPTER_ID
            : SIDERA_INSTITUTION_CATALOG_ADAPTER_ID,
          source,
          taskId: null,
          epoch: 0,
          sequence: 0,
          query: "",
          status: "idle",
          stage: "idle",
          sourceBuckets: [],
          items: [],
          code: "SIDERA_INSTITUTION_SEARCH_IDLE",
          message: "尚未开始机构检索。",
          startedAtMs: null,
          updatedAtMs: Date.now(),
          finishedAtMs: null,
        });
      }
      onNotice("机构会话数据已清除；下次使用需要重新认证。", "success");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "机构会话清除失败。", "error");
    } finally {
      setSessionBusy(false);
    }
  }

  async function openBlockedFallback() {
    if (!session?.fallbackTargetId) return;
    try {
      await openSideraInstitutionResult({
        resultId: session.fallbackTargetId,
        mode: "embedded",
      });
      setBrowserState(await getSideraInstitutionBrowserState());
      void setBrowserPresentation("split");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "机构浏览器备用入口打开失败。", "error");
    }
  }

  async function showCurrentInstitutionPage() {
    if (browserPresentation !== "closed") {
      if (splitLayout.narrow) setNarrowPane("browser");
      return;
    }
    setBrowserBusy(true);
    try {
      try {
        await openSideraInstitutionCurrentSource();
        setBrowserState(await getSideraInstitutionBrowserState());
      } catch {
        setBrowserState(await ensureSideraInstitutionBrowser(
          selectedSource === "database-direct" ? "database-sso" : "library-home",
        ));
      }
      void setBrowserPresentation("split");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "机构浏览器打开失败。", "error");
    } finally {
      setBrowserBusy(false);
    }
  }

  async function createBrowserTab(address?: string) {
    setBrowserBusy(true);
    try {
      setBrowserState(await createSideraInstitutionBrowserTab(address));
      void setBrowserPresentation("split");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "新建机构浏览器标签页失败。", "error");
    } finally {
      setBrowserBusy(false);
    }
  }

  async function selectBrowserTab(tabId: string) {
    try {
      setBrowserState(await selectSideraInstitutionBrowserTab(tabId));
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "机构浏览器标签页已失效。", "error");
    }
  }

  async function closeBrowserTab(tabId: string) {
    try {
      const next = await closeSideraInstitutionBrowserTab(tabId);
      setBrowserState(next);
      if (next.tabs.length === 0) setBrowserPresentation("closed");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "关闭机构浏览器标签页失败。", "error");
    }
  }

  async function submitBrowserAddress() {
    if (!activeBrowserTab || !browserAddressDraft.trim()) return;
    setBrowserBusy(true);
    try {
      setBrowserState(await navigateSideraInstitutionBrowserTab({
        tabId: activeBrowserTab.id,
        address: browserAddressDraft,
      }));
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "地址无法打开。", "error");
    } finally {
      setBrowserBusy(false);
    }
  }

  async function runBrowserNavigation(
    action: "back" | "forward" | "reload" | "stop",
  ) {
    if (!activeBrowserTab) return;
    try {
      const next = action === "back"
        ? await goBackSideraInstitutionBrowser(activeBrowserTab.id)
        : action === "forward"
          ? await goForwardSideraInstitutionBrowser(activeBrowserTab.id)
          : action === "stop"
            ? await stopSideraInstitutionBrowser(activeBrowserTab.id)
            : await reloadSideraInstitutionBrowser(activeBrowserTab.id);
      setBrowserState(next);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "机构浏览器导航操作失败。", "error");
    }
  }

  async function runDownloadAction(
    record: SideraInstitutionDownloadRecord,
    action: "cancel" | "retry" | "open" | "reveal",
  ) {
    try {
      if (action === "cancel") await cancelSideraInstitutionDownload(record.id);
      if (action === "retry") setBrowserState(await retrySideraInstitutionDownload(record.id));
      if (action === "open") await openSideraInstitutionDownload(record.id);
      if (action === "reveal") await revealSideraInstitutionDownload(record.id);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "下载操作失败。", "error");
    }
  }

  return (
    <section
      className="institution-workspace"
      data-browser-visible={browserPresentation !== "closed" ? "true" : "false"}
      data-browser-presentation={browserPresentation}
      data-narrow-pane={narrowPane}
    >
      {browserPresentation === "split" && splitLayout.narrow ? (
        <nav className="institution-narrow-switch" aria-label="机构资源工作面">
          <button
            type="button"
            className={narrowPane === "native" ? "is-active" : ""}
            aria-pressed={narrowPane === "native"}
            onClick={() => setNarrowPane("native")}
          >
            原生研究
          </button>
          <button
            type="button"
            className={narrowPane === "browser" ? "is-active" : ""}
            aria-pressed={narrowPane === "browser"}
            onClick={() => setNarrowPane("browser")}
          >
            机构网页
          </button>
        </nav>
      ) : null}
      <div ref={splitHostRef} className="institution-workspace__split" style={workspaceStyle}>
      <div className="institution-primary-command panel-card">
        <div className="institution-primary-command__heading">
          <Network size={16} />
          <div>
            <strong>{selectedSource === "catalog" ? "馆藏目录" : "统一学术发现"}</strong>
            <span>{selectedSource === "catalog" ? "图书与馆藏信息的次级工具" : "结构化论文检索"}</span>
          </div>
        </div>
        <div className="institution-primary-command__search">
          <input
            className="field-control"
            value={researchSearchQuery}
            maxLength={200}
            onChange={(event) => onResearchSearchQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void runInstitutionSearch("user-search");
            }}
            placeholder={selectedSource === "catalog"
              ? "检索图书与馆藏，例如：人工智能"
              : "检索期刊、会议和学位论文"}
            aria-label="武汉大学机构资源检索词"
          />
          {selectedSource === "academic-discovery" ? (
            <div className="institution-filter-anchor">
              <button
                type="button"
                className={filtersOpen ? "secondary-action is-active" : "secondary-action"}
                aria-expanded={filtersOpen}
                onClick={() => setFiltersOpen((value) => !value)}
              >
                <SlidersHorizontal size={14} />筛选
              </button>
              {filtersOpen ? (
                <div className="institution-filter-popover" role="dialog" aria-label="机构论文筛选">
                  <strong>文献类型</strong>
                  <div className="institution-filter-kinds">
                    {([
                      ["journal-article", "期刊论文"],
                      ["conference-paper", "会议论文"],
                      ["thesis", "学位论文"],
                    ] as Array<[SideraResearchFilterKind, string]>).map(([kind, label]) => (
                      <label key={kind}>
                        <input
                          type="checkbox"
                          checked={researchRecordKinds.includes(kind)}
                          onChange={(event) => setResearchRecordKinds((current) => event.target.checked
                            ? [...current, kind]
                            : current.filter((value) => value !== kind))}
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                  <strong>年份范围</strong>
                  <div className="institution-filter-years">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1000}
                      max={9999}
                      value={researchYearFrom}
                      onChange={(event) => setResearchYearFrom(event.target.value)}
                      placeholder="起始"
                      aria-label="起始年份"
                    />
                    <span>至</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1000}
                      max={9999}
                      value={researchYearTo}
                      onChange={(event) => setResearchYearTo(event.target.value)}
                      placeholder="结束"
                      aria-label="结束年份"
                    />
                  </div>
                  <strong>结果目标</strong>
                  <div className="institution-filter-limit" role="radiogroup" aria-label="结果目标上限">
                    {([40, 100] as const).map((limit) => (
                      <label key={limit}>
                        <input
                          type="radio"
                          name="institution-result-limit"
                          checked={researchResultLimit === limit}
                          onChange={() => setResearchResultLimit(limit)}
                        />
                        <span>{limit} 条</span>
                      </label>
                    ))}
                  </div>
                  <small>上限作用于过滤、归一化和去重后的论文候选。</small>
                </div>
              ) : null}
            </div>
          ) : null}
          {selectedSource === "academic-discovery" ? (
            <label className="institution-display-order">
              <span className="sr-only">展示排序</span>
              <select
                value={researchDisplayOrder}
                onChange={(event) => setResearchDisplayOrder(event.target.value as SideraResearchDisplayOrder)}
                aria-label="论文展示排序"
              >
                <option value="source-return-order">来源返回顺序</option>
                <option value="newest">最新</option>
                <option value="oldest">最早</option>
                <option value="title">题名</option>
              </select>
            </label>
          ) : null}
          <button
            className="primary-action"
            type="button"
            onClick={() => void runInstitutionSearch("user-search")}
            disabled={searching || sessionBusy}
          >
            {searching ? <Loader2 className="animate-spin" size={15} /> : <Search size={15} />}
            {searching ? "检索中" : "检索"}
          </button>
          {searching ? (
            <button className="secondary-action" type="button" onClick={() => void stopInstitutionSearch()}>
              <Square size={12} fill="currentColor" />停止
            </button>
          ) : null}
        </div>
      </div>

      <div className="institution-connection-strip panel-card" data-status={databaseAuth?.status ?? "idle"}>
        <div>
          <i aria-hidden="true" />
          <div>
            <strong>武汉大学 · {databaseSessionReady ? "已连接" : "未连接"}</strong>
            <span>{activeDatabaseConnection
              ? `${institutionConnectionPhaseLabel(activeDatabaseConnection.phase)} · ${activeDatabaseConnection.message}`
              : databaseAuth?.message ?? "连接状态尚未确认"}</span>
          </div>
        </div>
        <nav>
          <button
            type="button"
            className="secondary-action"
            onClick={() => void openInstitutionConnection("database-access")}
            disabled={sessionBusy}
          >
            {sessionBusy ? <Loader2 className="animate-spin" size={14} /> : <Link2 size={14} />}
            {databaseSessionReady ? "修复连接" : "连接机构"}
          </button>
          {activeDatabaseConnection && !isTerminalInstitutionConnectionPhase(activeDatabaseConnection.phase) ? (
            <button type="button" className="secondary-action" onClick={() => void cancelActiveInstitutionConnection()}>
              <X size={14} />取消
            </button>
          ) : null}
          <button
            type="button"
            className="secondary-action"
            aria-haspopup="dialog"
            aria-expanded={connectionDrawerOpen}
            aria-controls="institution-connections-sheet"
            onClick={() => setConnectionDrawerPresentation(true)}
          >
            <Settings size={14} />连接与来源
          </button>
        </nav>
      </div>

      <WorkbenchSideSheet
        id="institution-connections-sheet"
        open={connectionDrawerOpen}
        onOpenChange={setConnectionDrawerPresentation}
        title="连接与来源"
        description="认证能力、辅助入口与脱敏诊断"
        closeLabel="关闭连接与来源"
        bodyClassName="institution-connection-drawer-content"
      >
            <section>
              <h3>机构能力</h3>
              <div className="institution-capability-list">
                {([
                  ["数据库访问", databaseAuth],
                  ["统一发现全文", academicDiscoveryAuth],
                  ["个人图书馆", libraryAccountAuth],
                ] as Array<[string, SideraInstitutionAuthState | undefined]>).map(([label, state]) => (
                  <div key={label} data-status={state?.status ?? "idle"}>
                    <span>{label}</span><strong>{institutionAuthStatusLabel(state?.status)}</strong><small>{state?.message ?? "尚未观察"}</small>
                  </div>
                ))}
              </div>
              <div className="institution-drawer-actions">
                <button type="button" onClick={() => void openInstitutionConnection("database-access")}>连接数据库</button>
                <button type="button" onClick={() => void openInstitutionConnection("library-account")}>登录个人图书馆</button>
                {activeDiscoveryConnection ? (
                  <button type="button" onClick={() => void openInstitutionConnection("discovery-fulltext")}>聚焦全文身份验证</button>
                ) : null}
              </div>
            </section>
            <section>
              <h3>来源与次级工具</h3>
              <button
                type="button"
                className="institution-source-tool"
                onClick={() => { setSelectedSource("academic-discovery"); setConnectionDrawerPresentation(false); }}
              ><strong>统一学术发现</strong><span>当前唯一自动结构化检索连接器</span></button>
              <button
                type="button"
                className="institution-source-tool"
                onClick={() => { setSelectedSource("catalog"); setConnectionDrawerPresentation(false); }}
              ><strong>馆藏目录</strong><span>图书与馆藏信息，不进入论文题录</span></button>
              <div className="institution-manual-sources">
                {[
                  ["Web of Science", "仅人工访问 · 尚无连接器"],
                  ["中国知网", "仅人工访问 · 尚无连接器"],
                  ["Scopus", "仅人工访问 · 尚无连接器"],
                ].map(([name, status]) => <div key={name}><strong>{name}</strong><span>{status}</span></div>)}
              </div>
              <div className="institution-drawer-actions">
                <button type="button" onClick={() => {
                  void showCurrentInstitutionPage();
                  setConnectionDrawerPresentation(false);
                }}>{browserPresentation === "closed" ? "显示机构浏览器" : "聚焦机构浏览器"}</button>
                {browserPresentation !== "closed" ? <button type="button" onClick={() => void setBrowserPresentation("closed")}>隐藏机构浏览器</button> : null}
              </div>
            </section>
            <details>
              <summary>技术诊断</summary>
              <code>{adapterId}</code>
              <p>{sourceReadiness?.message ?? "来源状态等待检索验证。"}</p>
              {browserVisibilityDiagnostic ? (
                <p>
                  <code>
                    browser-surface-{browserVisibilityDiagnostic.target}
                    {` · attempts=${browserVisibilityDiagnostic.attempts} · ${browserVisibilityDiagnostic.message}`}
                  </code>
                </p>
              ) : null}
              {session?.activeConnection ? (
                <p><code>{session.activeConnection.phase} · {session.activeConnection.code}</code></p>
              ) : null}
              {session?.connectionVerificationTrace?.length ? (
                <ol className="institution-verification-trace">
                  {session.connectionVerificationTrace.slice(-12).map((event, index) => (
                    <li key={`${event.transactionId}-${event.timestampMs}-${index}`}>
                      <code>{event.stage}</code>
                      {` · ${event.surface} · ${event.verdict} · ${event.reasonCode} · #${event.attempt || "-"} · ${event.elapsedMs}ms`}
                    </li>
                  ))}
                </ol>
              ) : null}
              {session?.navigationTrace?.length ? (
                <ol>{session.navigationTrace.slice(-7).map((event, index) => <li key={`${event.generation}-${event.timestampMs}-${index}`}>{event.phase} · {event.host}{event.path}</li>)}</ol>
              ) : null}
              <small>仅显示脱敏判定码、耗时、主机、路径和状态；不保存页面文本、查询参数、ticket、Cookie、表单、账号或凭据。</small>
            </details>
            <footer>
              <button
                type="button"
                className="danger-action"
                onClick={() => void resetInstitutionSession()}
                disabled={sessionBusy || searching}
              >显式清除机构会话</button>
            </footer>
      </WorkbenchSideSheet>

      <div className="institution-hero panel-card">
        <div className="institution-hero__copy">
          <div className="panel-title"><Network size={17} />武汉大学机构资源</div>
          <p>后台连接器复用隔离的官方机构会话，原生检索结果仅保存在当前运行内存中。</p>
          <div className="institution-boundary-note">正常检索不会打开网页；只有官方登录、原始记录核对和全文跳转会显示机构页面。所选结果可加入独立审查库，但不会写入主论文库或调用 AI Provider。</div>
        </div>
        <div className="institution-session-state" data-status={databaseAuth?.status ?? "idle"}>
          <span>数据库 SSO · {institutionAuthStatusLabel(databaseAuth?.status)}</span>
          <strong>{databaseAuth?.message ?? "首次检索前需要在 Sidera 内完成数据库 SSO。"}</strong>
          <small>
            统一发现全文身份 · {academicDiscoveryAuth?.status && academicDiscoveryAuth.status !== "idle"
              ? institutionAuthStatusLabel(academicDiscoveryAuth.status)
              : "待确认"}
            {academicDiscoveryAuth?.currentHost ? ` · ${academicDiscoveryAuth.currentHost}` : ""}
            <br />个人图书馆 · {institutionAuthStatusLabel(libraryAccountAuth?.status)}
            {libraryAccountAuth?.currentHost ? ` · ${libraryAccountAuth.currentHost}` : ""}
          </small>
          {session?.navigationTrace?.length ? (
            <details>
              <summary>脱敏导航轨迹 · 最近 {session.navigationTrace.length} 条</summary>
              <ol>
                {session.navigationTrace.slice(-10).map((event, index) => (
                  <li key={`${event.generation}-${event.navigationId ?? "none"}-${event.timestampMs}-${index}`}>
                    <code>{event.phase}</code>
                    {` · ${event.host}${event.path}`}
                    {event.redirected ? " · redirect" : ""}
                    {event.webErrorStatus ? ` · ${event.webErrorStatus}` : ""}
                  </li>
                ))}
              </ol>
              <small>轨迹仅保留主机与路径；查询参数、ticket、Cookie、账号和密码不会进入前端。</small>
            </details>
          ) : null}
        </div>
      </div>

      <div className="institution-toolbar panel-card">
        <div className="institution-source-switch" role="tablist" aria-label="机构检索来源">
          {([
            ["academic-discovery", "统一学术发现", "原生论文结果与全文路线"],
            ["database-direct", "数据库直达", "WOS 等官方数据库入口"],
            ["catalog", "馆藏目录", "图书与馆藏信息"],
          ] as const).map(([source, label, description]) => {
            const readiness = source === "database-direct"
              ? null
              : session?.sourceReadiness?.find((value) => value.source === source);
            const sourceSnapshot = source === "database-direct" ? null : snapshots[source];
            return (
              <button
                key={source}
                type="button"
                role="tab"
                aria-selected={selectedSource === source}
                className={selectedSource === source ? "is-active" : ""}
                onClick={() => setSelectedSource(source)}
              >
                <span>{label}</span>
                <small>{description}</small>
                <em data-status={source === "academic-discovery"
                  ? academicBackendReadiness
                  : source === "database-direct" && databaseAuth?.status === "ready"
                    ? "ready"
                    : readiness?.status ?? "uninitialized"}>
                  {source === "academic-discovery" && researchSearchActive
                    ? "检索中"
                    : source === "academic-discovery" && (displayedResearchSnapshot?.status === "complete" || displayedResearchSnapshot?.status === "partial")
                      ? `${displayedResearchSnapshot.candidates.length} 条候选`
                    : sourceSnapshot?.status === "searching"
                    ? "检索中"
                    : source === "database-direct" && databaseAuth?.status === "ready"
                      ? "入口已就绪"
                    : source === "database-direct"
                      ? "待登录"
                    : readiness?.status === "ready"
                      ? source === "academic-discovery" ? "检索可用" : "已确认"
                      : readiness?.status === "partial"
                        ? "部分可用"
                        : readiness?.status === "failed"
                          ? "不可用"
                          : "待检查"}
                </em>
              </button>
            );
          })}
        </div>
        <div className="institution-source-readiness" data-status={selectedSource === "academic-discovery"
          ? academicBackendReadiness
          : selectedSource === "database-direct" && databaseAuth?.status === "ready"
            ? "ready"
            : sourceReadiness?.status ?? "uninitialized"}>
          <strong>{selectedSource === "academic-discovery" ? "统一学术发现" : selectedSource === "database-direct" ? "数据库直达" : "馆藏目录"}</strong>
          <span>{selectedSource === "database-direct"
            ? "仅登记官方入口、资源类型和当前能力；WOS 等供应商高级检索适配器留到 P6。"
            : selectedSource === "academic-discovery"
              ? activeResearchAttempt?.message
                ?? displayedResearchSnapshot?.message
                ?? researchSearchState?.lastFailure?.message
                ?? "由后台连接器解析期刊论文、会议论文和学位论文；类型不明记录会被排除并标记部分完成。"
              : sourceReadiness?.message ?? "用于查询图书、期刊馆藏和索书信息，不进入论文题录导入。"}</span>
          {selectedSource === "academic-discovery" ? (
            <small data-status={academicDiscoveryAuth?.status ?? "idle"}>
              机构全文身份 · {academicDiscoveryAuth?.status && academicDiscoveryAuth.status !== "idle"
                ? institutionAuthStatusLabel(academicDiscoveryAuth.status)
                : "待确认"} · {academicDiscoveryAuth?.message ?? "检索可用性与全文身份将分别确认。"}
              {session?.discoveryAuthWindowVisible ? " · 认证窗口已打开" : ""}
            </small>
          ) : null}
        </div>
        {selectedSource !== "database-direct" ? <div className="institution-search-row">
          <input
            className="field-control"
            value={researchSearchQuery}
            maxLength={200}
            onChange={(event) => onResearchSearchQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void runInstitutionSearch("user-search");
            }}
            placeholder={selectedSource === "academic-discovery"
              ? "检索学术论文，例如：人工智能 / machine learning"
              : "检索图书与馆藏，例如：人工智能 / machine learning"}
            aria-label="武汉大学机构资源检索词"
          />
          <button className="primary-action" type="button" onClick={() => void runInstitutionSearch("user-search")} disabled={searching || sessionBusy}>
            {searching ? <Loader2 className="animate-spin" size={15} /> : <Search size={15} />}
            {searching ? "检索中" : selectedSource === "academic-discovery" ? "检索学术论文" : "检索馆藏目录"}
          </button>
          {searching ? (
            <button className="secondary-action" type="button" onClick={() => void stopInstitutionSearch()}>
              <Square size={12} fill="currentColor" />停止
            </button>
          ) : null}
        </div> : null}
        <div className="institution-toolbar__actions">
          <button className="secondary-action" type="button" onClick={() => void openInstitutionConnection("database-access")} disabled={sessionBusy}>
            {sessionBusy ? <Loader2 className="animate-spin" size={14} /> : <Globe2 size={14} />}
            {databaseSessionReady ? "打开数据库会话" : "登录数据库 SSO"}
          </button>
          <button className="secondary-action" type="button" onClick={() => void openInstitutionConnection("library-account")} disabled={sessionBusy}>
            <BookOpen size={14} />
            {libraryAccountAuth?.status === "ready" ? "打开我的图书馆" : "登录我的图书馆"}
          </button>
          <button
            className="secondary-action"
            type="button"
            onClick={() => void showCurrentInstitutionPage()}
            disabled={browserBusy}
          >
            {browserBusy ? <Loader2 className="animate-spin" size={14} /> : <Globe2 size={14} />}
            {browserPresentation === "closed" ? "打开机构浏览器" : splitLayout.narrow && narrowPane === "native" ? "查看机构网页" : "机构网页已在侧栏"}
          </button>
          {browserState?.authModalVisible ? (
            <button className="secondary-action" type="button" onClick={() => void cancelInstitutionBrowserAuthModal()} disabled={browserBusy}>
              <X size={14} />取消浏览器认证
            </button>
          ) : null}
          {session?.authModalVisible ? (
            <button className="secondary-action" type="button" onClick={() => void cancelLegacyInstitutionAuthModal()}>
              <X size={14} />取消旧版认证
            </button>
          ) : null}
          <button className="secondary-action" type="button" onClick={() => void resetInstitutionSession()} disabled={sessionBusy || searching}>
            <RefreshCw size={14} />清除机构会话
          </button>
          <span className="institution-adapter-badge">{adapterId}</span>
        </div>
      </div>

      {session?.fallbackTargetId ? (
        <div className="institution-fallback" role="status">
          <AlertTriangle size={15} />
          <span>{session.code === "SIDERA_INSTITUTION_AUTH_NAVIGATION_FAILED"
            ? `官方认证跳转失败：${session.fallbackDisplayUrl ?? "外部页面"}`
            : `当前跳转不受内嵌连接器支持：${session.fallbackDisplayUrl ?? "外部页面"}`}</span>
          <button type="button" onClick={() => void openBlockedFallback()}>在机构浏览器打开</button>
        </div>
      ) : null}

      {browserPresentation === "split" && !splitLayout.narrow ? (
        <div
          className="institution-browser-resizer"
          role="separator"
          aria-label="调整原生研究与机构网页宽度"
          aria-orientation="vertical"
          aria-valuemin={30}
          aria-valuemax={70}
          aria-valuenow={Math.round(splitLayout.ratio * 100)}
          tabIndex={0}
          onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
          onPointerMove={handleDividerPointerMove}
          onPointerUp={finishDividerDrag}
          onPointerCancel={finishDividerDrag}
          onKeyDown={handleDividerKeyDown}
        >
          <span />
        </div>
      ) : null}

      {browserPresentation !== "closed" ? (
        <div className="institution-browser-shell" aria-label="Sidera 共享机构浏览器">
          <div className="institution-browser-tabs" role="tablist" aria-label="机构浏览器标签页">
            <div className="institution-browser-tabs__scroll">
              {browserState?.tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={browserState.activeTabId === tab.id}
                  className={browserState.activeTabId === tab.id ? "is-active" : ""}
                  onClick={() => void selectBrowserTab(tab.id)}
                  title={tab.title || tab.address}
                >
                  {tab.loading ? <Loader2 className="animate-spin" size={12} /> : <Globe2 size={12} />}
                  <span>{tab.title || tab.address || "新标签页"}</span>
                  <X
                    size={12}
                    role="button"
                    aria-label={`关闭 ${tab.title || "标签页"}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      void closeBrowserTab(tab.id);
                    }}
                  />
                </button>
              ))}
            </div>
            <button type="button" className="institution-browser-icon-button" onClick={() => void createBrowserTab()} title="新标签页">
              <Plus size={15} />
            </button>
            <button
              type="button"
              className={downloadsOpen ? "institution-browser-icon-button is-active" : "institution-browser-icon-button"}
              onClick={() => setDownloadsOpen((value) => !value)}
              title="下载"
            >
              <Download size={15} />
              {browserState?.downloads.some((item) => item.status === "downloading") ? <i /> : null}
            </button>
            <button
              type="button"
              className="institution-browser-return"
              onClick={() => void setBrowserPresentation(browserPresentation === "immersive" ? "split" : "immersive")}
            >
              {browserPresentation === "immersive" ? "返回双栏" : "沉浸网页"}
            </button>
            <button
              type="button"
              className="institution-browser-icon-button"
              onClick={() => void setBrowserPresentation("closed")}
              title="关闭网页"
              aria-label="关闭机构网页"
            >
              <X size={15} />
            </button>
          </div>
          <div className="institution-browser-navigation">
            <button type="button" onClick={() => void runBrowserNavigation("back")} disabled={!activeBrowserTab?.canGoBack} title="后退"><ArrowLeft size={15} /></button>
            <button type="button" onClick={() => void runBrowserNavigation("forward")} disabled={!activeBrowserTab?.canGoForward} title="前进"><ArrowRight size={15} /></button>
            <button type="button" onClick={() => void runBrowserNavigation(activeBrowserTab?.loading ? "stop" : "reload")} disabled={!activeBrowserTab} title={activeBrowserTab?.loading ? "停止" : "刷新"}>
              {activeBrowserTab?.loading ? <X size={15} /> : <RefreshCw size={15} />}
            </button>
            <button type="button" onClick={() => void openInstitutionConnection("database-access")} title="数据库导航"><Home size={15} /></button>
            <form onSubmit={(event) => { event.preventDefault(); void submitBrowserAddress(); }}>
              <Globe2 size={14} />
              <input
                value={browserAddressDraft}
                onChange={(event) => setBrowserAddressDraft(event.target.value)}
                spellCheck={false}
                aria-label="机构浏览器地址"
                placeholder="输入网址或域名"
              />
            </form>
            <span>{browserState?.profileId ?? "institution-shared-v1"}</span>
          </div>
          {browserState?.authModalVisible ? (
            <div className="institution-browser-auth-status" role="status">
              <Loader2 className="animate-spin" size={14} />
              <span>认证窗口正在处理必须保留弹窗语义的官方登录。</span>
              <code>{browserState.authModalAddress ?? "official-auth"}</code>
              <button type="button" onClick={() => void cancelInstitutionBrowserAuthModal()} disabled={browserBusy}>取消</button>
            </div>
          ) : null}
          {managedPopupNotices.length ? (
            <div className="institution-browser-popup-status" role="status">
              {managedPopupNotices.map((popup) => (
                <div key={`${popup.popupId}-${popup.generation}`} data-phase={popup.phase}>
                  <span>{popup.phase === "transient" ? "兼容桥接窗口" : popup.phase === "failed" ? "弹窗导航失败" : "兼容弹窗已保留"}</span>
                  <code>{popup.location.origin}{popup.location.path}</code>
                  <small>{popup.code}</small>
                </div>
              ))}
            </div>
          ) : null}
          {downloadsOpen ? (
            <div className="institution-download-drawer" aria-label="机构下载暂存区">
              <header>
                <div><strong>机构下载暂存区</strong><span>文件、哈希与来源清单为后续沉浸式阅读准备。</span></div>
                <button type="button" onClick={() => setDownloadsOpen(false)}><X size={14} /></button>
              </header>
              <div className="institution-download-list">
                {browserState?.downloads.length ? browserState.downloads.map((record) => (
                  <article key={record.id} data-status={record.status}>
                    <Download size={15} />
                    <div>
                      <strong>{record.fileName}</strong>
                      <span>{institutionDownloadStatusLabel(record.status)} · {formatInstitutionFileSize(record.sizeBytes)} · {record.provenance.resultTitle ?? record.provenance.sourceTitle ?? record.provenance.safeSourceUrl}</span>
                      {record.sha256 ? <code>SHA-256 {record.sha256}</code> : <small>{record.message}</small>}
                    </div>
                    <nav>
                      {record.status === "downloading" ? <button type="button" onClick={() => void runDownloadAction(record, "cancel")}>取消</button> : null}
                      {(record.status === "failed" || record.status === "cancelled") && record.retryable ? <button type="button" onClick={() => void runDownloadAction(record, "retry")}>重试</button> : null}
                      {record.status === "complete" ? <button type="button" onClick={() => void runDownloadAction(record, "open")}>打开</button> : null}
                      {record.status === "complete" ? <button type="button" onClick={() => void runDownloadAction(record, "reveal")}>定位</button> : null}
                    </nav>
                  </article>
                )) : <div className="institution-download-empty">尚无下载。网页触发的 PDF 或附件会进入此处，不会自动写入论文库。</div>}
              </div>
            </div>
          ) : null}
          <div ref={browserHostRef} className="institution-browser-host" aria-label="机构浏览器网页内容">
            <div className="institution-browser-host__placeholder">
              {activeAuth?.status === "failed" || activeAuth?.status === "cancelled" ? (
                <>
                  <AlertTriangle size={18} />
                  <div><strong>{activeAuth.code}</strong><span>{activeAuth.message}</span></div>
                </>
              ) : activeBrowserTab ? (
                <><Loader2 className="animate-spin" size={18} /><span>{activeBrowserTab.loading ? "网页正在加载…" : "网页表面正在同步…"}</span></>
              ) : (
                <><Globe2 size={18} /><span>新建标签页或打开数据库会话开始浏览。</span></>
              )}
            </div>
          </div>
        </div>
      ) : null}
      <div className="institution-native-results">
          {selectedSource === "academic-discovery" ? (
            <ResearchSearchNativeResults
              state={researchSearchState}
              selectedIds={selectedResearchCandidateIds}
              busy={researchReviewBusy}
              displayOrder={researchDisplayOrder}
              onSelectedIdsChange={onSelectedResearchCandidateIdsChange}
              onStop={() => void stopInstitutionSearch()}
              onRetry={() => void runInstitutionSearch("retry")}
              onAddToReview={() => void addSelectedResearchCandidatesToReview()}
              onOpen={(candidate, target) => void openRawResult(
                target === "full-text"
                  ? candidate.fullTextLocator ?? candidate.detailLocator ?? candidate.id
                  : candidate.detailLocator ?? candidate.id,
                target,
              )}
            />
          ) : null}
          {selectedSource === "database-direct" ? (
            <div className="institution-result-list" aria-label="数据库直达登记">
              <article className="institution-result-item">
                <div className="institution-result-item__meta"><span>引文与题录数据库</span><span>浏览器辅助访问</span></div>
                <h3>Web of Science</h3>
                <p>入口：武汉大学官方数据库门户 → 数据库卡片 → 详情 → 访问地址</p>
                <div className="institution-result-item__footer">
                  <span>能力：官方入口与会话复用；供应商高级检索适配器计划于 P6</span>
                  <button type="button" onClick={() => void openInstitutionConnection("database-access")}>打开数据库门户</button>
                </div>
              </article>
              <article className="institution-result-item">
                <div className="institution-result-item__meta"><span>机构数据库导航</span><span>只读入口登记</span></div>
                <h3>武汉大学数据库导航</h3>
                <p>保留馆方数据库卡片、详情页与供应商访问地址的既有链路，不与统一发现或馆藏结果合并。</p>
                <div className="institution-result-item__footer">
                  <span>{databaseAuth?.status === "ready" ? "数据库 SSO 会话已就绪" : "首次访问需完成数据库 SSO"}</span>
                  <button type="button" onClick={() => void openInstitutionConnection("database-access")}>打开官方入口</button>
                </div>
              </article>
            </div>
          ) : null}
          {selectedSource === "catalog" && snapshot?.status === "searching" ? (
            <div className="institution-search-progress" role="status" aria-live="polite">
              <Loader2 className="animate-spin" size={16} />
               <div><strong>馆藏目录正在检索</strong><span>{snapshot.message}</span></div>
            </div>
          ) : null}

          {selectedSource === "catalog" && snapshot && snapshot.status !== "idle" && snapshot.status !== "searching" ? (
            <div className="institution-result-summary" data-status={snapshot.status}>
              <div>
                 <span>{institutionSearchStageLabel(snapshot.stage)}</span>
                 <strong>{snapshot.status === "complete" || snapshot.status === "partial"
                   ? `“${snapshot.query}” · ${snapshot.items.length} 条馆藏结构化预览`
                   : `“${snapshot.query}” · ${institutionSearchStatusLabel(snapshot.status)}`}</strong>
              </div>
              <p>{snapshot.message}</p>
            </div>
          ) : null}

          {selectedSource === "catalog" && snapshot?.sourceBuckets.length ? (
            <div className="institution-source-buckets" aria-label="机构资源来源桶">
              {snapshot.sourceBuckets.map((bucket) => (
                <div key={bucket.id} data-status={bucket.status}>
                  <span>{bucket.label || "未标明来源"}</span>
                  <strong>{bucket.returned} / {bucket.count ?? "?"}</strong>
                  {bucket.code ? <small>{bucket.code}</small> : null}
                </div>
              ))}
            </div>
          ) : null}

          {selectedSource === "catalog" && snapshot?.items.length ? (
            <div className="institution-result-list">
              {snapshot.items.map((item) => (
                <article key={item.id} className="institution-result-item">
                  <div className="institution-result-item__meta">
                    <span>{institutionRecordKindLabel(item.recordKind)}</span>
                    {item.year ? <span>{item.year}</span> : null}
                    {(item.sourceProvider ? [item.sourceProvider] : item.sourceBuckets).map((source) => <span key={source}>{source}</span>)}
                  </div>
                  <h3>{item.title}</h3>
                  <p>{institutionResultCitationLine(item)}</p>
                  {item.abstractSnippet ? <div className="institution-result-item__abstract">{item.abstractSnippet}</div> : null}
                  <div className="institution-result-item__footer">
                    <span>{item.doi ? `DOI ${item.doi}` : item.availability || "馆藏状态待原始记录确认"}</span>
                    <div>
                      <button type="button" onClick={() => void openRawResult(item.detailLocator)}>查看原始记录</button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : selectedSource !== "catalog" ? null : snapshot?.status === "complete" ? (
            <EmptyState title="没有匹配的首屏结果" description="官方结果页明确返回 0 条记录；可调整检索词后重试。" />
          ) : snapshot?.status === "failed" ? (
            <div className="institution-error-state">
              <AlertTriangle size={18} />
              <div><strong>{snapshot.code}</strong><p>{snapshot.message}</p></div>
              <button type="button" className="secondary-action" onClick={() => void openInstitutionConnection("database-access")}>打开数据库会话检查</button>
            </div>
          ) : (
            <EmptyState
              title="图书与馆藏信息将在这里显示"
              description="馆藏目录仅用于辅助查找图书和馆藏位置，结果不会进入论文题录导入。"
            />
          )}
      </div>
      </div>
    </section>
  );
}

function institutionAuthStatusLabel(status?: SideraInstitutionAuthStatus) {
  if (status === "ready") return "已就绪";
  if (status === "login-required") return "需要认证";
  if (status === "starting") return "认证中";
  if (status === "cancelled") return "已取消";
  if (status === "failed") return "异常";
  return "尚未初始化";
}

function institutionConnectionPhaseLabel(phase: NonNullable<SideraInstitutionSessionState["activeConnection"]>["phase"]) {
  if (phase === "opening") return "正在打开";
  if (phase === "awaiting-user") return "等待用户认证";
  if (phase === "verifying") return "正在验证";
  if (phase === "refreshing-parent") return "正在刷新业务页";
  if (phase === "ready") return "连接就绪";
  if (phase === "cancelled") return "连接已取消";
  return "连接失败";
}

function ResearchSearchNativeResults({
  state,
  selectedIds,
  busy,
  displayOrder,
  onSelectedIdsChange,
  onStop,
  onRetry,
  onAddToReview,
  onOpen,
}: {
  state: SideraResearchSearchState | null;
  selectedIds: string[];
  busy: boolean;
  displayOrder: SideraResearchDisplayOrder;
  onSelectedIdsChange: (ids: string[]) => void;
  onStop: () => void;
  onRetry: () => void;
  onAddToReview: () => void;
  onOpen: (candidate: SideraNormalizedCandidateDraft, target: "record" | "full-text") => void;
}) {
  const snapshot = state?.displayedSnapshot ?? null;
  const activeAttempt = state?.activeAttempt ?? null;
  const lastFailure = !activeAttempt
    && state?.lastFailure
    && (!snapshot || state.lastFailure.failedAtMs >= snapshot.updatedAtMs)
    ? state.lastFailure
    : null;
  const failedTerminalSnapshot = lastFailure?.terminalSnapshot ?? null;
  const [page, setPage] = useState(1);
  const snapshotKey = sideraResearchSnapshotKey(snapshot);
  useEffect(() => setPage(1), [snapshotKey]);
  const orderedCandidates = useMemo(
    () => orderSideraResearchCandidates(snapshot?.candidates ?? [], displayOrder),
    [displayOrder, snapshot],
  );
  const {
    currentPage,
    pageCount,
    candidates: pageCandidates,
  } = paginateSideraResearchCandidates(orderedCandidates, page, 10);
  const selectedSet = new Set(selectedIds);
  const allSelected = Boolean(pageCandidates.length)
    && pageCandidates.every((candidate) => selectedSet.has(candidate.id));
  const failedSources = snapshot?.sourceReports.filter((report) => report.status === "failed") ?? [];

  if (!state || (!snapshot && !activeAttempt && !lastFailure)) {
    return (
      <EmptyState
        title="后台学术论文结果将在这里显示"
        description="蓝色检索按钮只调用后台连接器；除官方登录、原始记录核对或全文跳转外，不会打开机构网页。"
      />
    );
  }

  return (
    <div
      className="research-search-native"
      data-status={activeAttempt?.status ?? lastFailure?.status ?? snapshot?.status ?? "idle"}
    >
      {activeAttempt ? (
        <div className="research-search-native__summary" role="status" aria-live="polite">
          <div>
            <span>{researchSearchStatusLabel(activeAttempt.status)}</span>
            <strong>“{activeAttempt.request.query}” · 正在执行新查询</strong>
            <p>
              {snapshot
                ? `仍展示上次成功结果（“${snapshot.request.query}” · ${snapshot.candidates.length} 条），完成后才会原子替换。`
                : activeAttempt.message}
            </p>
          </div>
          <div className="research-search-native__actions">
            <button type="button" className="secondary-action" onClick={onStop}>
              <Square size={12} fill="currentColor" />停止
            </button>
          </div>
        </div>
      ) : null}

      {activeAttempt?.status === "awaiting-user-auth" ? (
        <div className="research-search-native__auth" role="status">
          <Loader2 className="animate-spin" size={16} />
          <div>
            <strong>{researchSearchAuthPhaseLabel(activeAttempt.authContext?.phase)}</strong>
            <span>认证等待不占用90秒检索预算；成功后恢复同一 searchId，不会重复提交查询。</span>
          </div>
        </div>
      ) : null}

      {activeAttempt?.sourceReports.length ? (
        <details className="research-search-diagnostics research-search-diagnostics--attempt">
          <summary>本次检索来源进度（{activeAttempt.sourceReports.length}）</summary>
          <div className="research-search-sources" aria-label="本次后台检索来源进度">
            {activeAttempt.sourceReports.map((report) => (
              <article key={`attempt-${report.connectorId}-${report.sourceId}`} data-status={report.status}>
                <div><strong>{report.sourceName || report.sourceId}</strong><span>{report.connectorVersion ?? report.connectorId}</span></div>
                <span>{researchSearchSourceStatusLabel(report.status)}</span>
                <p>{report.recordsAccepted} / {report.recordsReceived} 条接收 · 扫描 {report.pagesScanned} 页</p>
                <small>{report.message}{report.code ? ` · ${report.code}` : ""}</small>
              </article>
            ))}
          </div>
        </details>
      ) : null}

      {lastFailure ? (
        <>
          <div className="institution-error-state" role="alert">
            <AlertTriangle size={18} />
            <div>
              <strong>{lastFailure.code}</strong>
              <p>
                “{lastFailure.query}”{lastFailure.status === "cancelled" ? "已取消" : "检索失败"}。{lastFailure.message}
                {snapshot ? " 上一份成功结果已保留，可继续查看或加入导入审查。" : ""}
              </p>
              {failedTerminalSnapshot ? (
                <small>
                  失败尝试真值：扫描 {failedTerminalSnapshot.truth.pagesScanned} 页
                  {` · 接收 ${failedTerminalSnapshot.truth.recordsReceived} 条`}
                  {` · 接受 ${failedTerminalSnapshot.truth.recordsAccepted} 条`}
                  {` · 合并 ${failedTerminalSnapshot.truth.duplicatesMerged} 条重复`}
                  {` · 覆盖 ${failedTerminalSnapshot.truth.coverage} 个供应商`}
                  {` · ${researchCompletionReasonLabel(failedTerminalSnapshot.truth.completionReason)}`}
                </small>
              ) : null}
            </div>
            <button type="button" className="secondary-action" onClick={onRetry}>重新检索</button>
          </div>
          {failedTerminalSnapshot?.sourceReports.length ? (
            <details className="research-search-diagnostics research-search-diagnostics--failure">
              <summary>查看失败检索真值与来源</summary>
              <div className="research-search-sources" aria-label="失败后台检索来源">
                {failedTerminalSnapshot.sourceReports.map((report) => (
                  <article key={`failure-${report.connectorId}-${report.sourceId}`} data-status={report.status}>
                    <div><strong>{report.sourceName || report.sourceId}</strong><span>{report.connectorVersion ?? report.connectorId}</span></div>
                    <span>{researchSearchSourceStatusLabel(report.status)}</span>
                    <p>{report.recordsAccepted} / {report.recordsReceived} 条接收 · 扫描 {report.pagesScanned} 页</p>
                    {report.providerBreakdown.length ? (
                      <div className="research-provider-breakdown">
                        {report.providerBreakdown.map((provider) => (
                          <span key={provider.providerId}>{provider.providerName} · {provider.recordsAccepted}/{provider.recordsReceived}</span>
                        ))}
                      </div>
                    ) : null}
                    <small>{report.message}{report.code ? ` · ${report.code}` : ""}</small>
                  </article>
                ))}
              </div>
            </details>
          ) : null}
        </>
      ) : null}

      {snapshot ? (
        <div className="research-search-truth" aria-live="polite">
          <div>
            <strong>
              已取得 {snapshot.candidates.length} 条
              {` · ${snapshot.truth.totalHits == null ? "总命中未知" : `总命中 ${snapshot.truth.totalHits} 条`}`}
              {" · 来源返回顺序"}
              {displayOrder === "source-return-order" ? "" : ` · 本地展示：${researchDisplayOrderLabel(displayOrder)}`}
              {` · 目标 ${snapshot.truth.resultLimit} 条${snapshot.truth.targetReached ? "已达" : "未达"}`}
              {` · ${snapshot.truth.hasMore == null ? "后续结果未知" : snapshot.truth.hasMore ? "来源仍有后续结果" : "来源已无后续结果"}`}
              {` · 扫描 ${snapshot.truth.pagesScanned} 页`}
              {` · 覆盖 ${snapshot.truth.coverage} 个供应商`}
              {` · ${researchCompletionReasonLabel(snapshot.truth.completionReason)}`}
            </strong>
            <span>“{snapshot.request.query}” · {snapshot.message}</span>
          </div>
          {failedSources.length > 0 && !activeAttempt ? (
            <div className="research-search-native__actions">
              <button type="button" className="secondary-action" onClick={onRetry}>
                <RefreshCw size={14} />重试失败来源
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {snapshot?.sourceReports.length ? (
        <details className="research-search-diagnostics">
          <summary>来源、传输与排除诊断</summary>
          <div className="research-search-sources" aria-label="后台检索来源">
            {snapshot.sourceReports.map((report) => (
              <article key={`${report.connectorId}-${report.sourceId}`} data-status={report.status}>
                <div><strong>{report.sourceName || report.sourceId}</strong><span>{report.connectorVersion ?? report.connectorId}</span></div>
                <span>{researchSearchSourceStatusLabel(report.status)}</span>
                <p>{report.recordsAccepted} / {report.recordsReceived} 条接收 · 扫描 {report.pagesScanned} 页</p>
                {report.providerBreakdown.length ? (
                  <div className="research-provider-breakdown">
                    {report.providerBreakdown.map((provider) => (
                      <span key={provider.providerId}>{provider.providerName} · {provider.recordsAccepted}/{provider.recordsReceived}</span>
                    ))}
                  </div>
                ) : null}
                <small>
                  实际传输：{researchSearchTransportLabel(report.transport)}
                  {report.observedTransport && report.observedTransport !== report.transport
                    ? ` · 协议勘察候选：${researchSearchTransportLabel(report.observedTransport)}`
                    : ""}
                </small>
                <small>
                  {(() => {
                    const positions = snapshot.candidates
                      .filter((candidate) => candidate.connectorIds.includes(report.connectorId))
                      .map((candidate) => candidate.retrievalPosition.basis);
                    const observed = positions.filter((basis) => basis === "observed").length;
                    return `位置真值：observed ${observed} · synthesized ${positions.length - observed}`;
                  })()}
                </small>
                <small>{report.message}{report.code ? ` · ${report.code}` : ""}</small>
              </article>
            ))}
          </div>
        </details>
      ) : null}

      {snapshot?.candidates.length ? (
        <>
          <div className="research-search-selection">
            <label>
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(event) => onSelectedIdsChange(toggleSideraResearchPageSelection(
                  selectedIds,
                  pageCandidates,
                  event.target.checked,
                ))}
              />
              <span>全选本页 {pageCandidates.length} 条</span>
            </label>
            <span>已选择 {selectedIds.length} 条</span>
            <button
              type="button"
              className="primary-action"
              disabled={selectedIds.length === 0 || busy}
              onClick={onAddToReview}
            >
              {busy ? <Loader2 className="animate-spin" size={14} /> : <ListChecks size={14} />}
              加入导入审查
            </button>
          </div>
          <div className="institution-result-list">
            {pageCandidates.map((candidate) => (
              <article key={candidate.id} className="institution-result-item research-search-candidate" data-selected={selectedSet.has(candidate.id)}>
                <label className="research-search-candidate__select" aria-label={`选择 ${candidate.title}`}>
                  <input
                    type="checkbox"
                    checked={selectedSet.has(candidate.id)}
                    onChange={(event) => onSelectedIdsChange(event.target.checked
                      ? [...selectedIds, candidate.id]
                      : selectedIds.filter((id) => id !== candidate.id))}
                  />
                </label>
                <div className="institution-result-item__meta">
                  <span>{institutionRecordKindLabel(candidate.recordKind)}</span>
                  {candidate.year ? <span>{candidate.year}</span> : null}
                  <span>{candidate.sourceDatabase}</span>
                  {candidate.connectorIds.map((connector) => <span key={connector}>{connector}</span>)}
                </div>
                <h3>{candidate.title}</h3>
                <p>{researchCandidateCitationLine(candidate)}</p>
                {candidate.abstractText ? <div className="institution-result-item__abstract">{candidate.abstractText}</div> : null}
                <div className="institution-result-item__footer">
                  <span>{candidate.doi ? `DOI ${candidate.doi}` : institutionFullTextStatusLabel(candidate.fullTextStatus)}</span>
                  <div>
                    {candidate.detailLocator ? <button type="button" onClick={() => onOpen(candidate, "record")}>核对原始记录</button> : null}
                    {candidate.fullTextLocator ? (
                      <button type="button" onClick={() => onOpen(candidate, "full-text")}>
                        查看全文入口 · {institutionFullTextRouteLabel(candidate.fullTextRoute)}
                      </button>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
          {pageCount > 1 ? (
            <nav className="research-search-pagination" aria-label="机构论文结果分页">
              <button type="button" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>上一页</button>
              <span>第 {currentPage} / {pageCount} 页 · 每页 10 条</span>
              <button type="button" disabled={currentPage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>下一页</button>
            </nav>
          ) : null}
        </>
      ) : snapshot && (snapshot.status === "complete" || snapshot.status === "partial") ? (
        <EmptyState
          title="没有正式论文候选"
          description={sideraResearchFiltersAreActive(snapshot.request.filters)
            ? "来源检索已完成，但当前文献类型、年份或全文筛选下没有候选；可调整筛选后重新检索。"
            : "来源明确返回零结果，或返回记录均因非论文、类型不明或身份信息不足而被排除。"}
        />
      ) : null}
    </div>
  );
}

function researchSearchStatusLabel(status: SideraResearchSearchSnapshot["status"]) {
  if (status === "checking-session") return "正在检查机构会话";
  if (status === "awaiting-user-auth") return "等待官方登录";
  if (status === "resolving-connectors") return "正在解析后台连接器";
  if (status === "searching") return "正在检索真实来源";
  if (status === "normalizing") return "正在归一化与去重";
  if (status === "complete") return "后台检索完成";
  if (status === "partial") return "后台检索部分完成";
  if (status === "failed") return "后台检索失败";
  if (status === "cancelled") return "检索已停止";
  return "等待检索";
}

function researchSearchAuthPhaseLabel(
  phase?: "awaiting-user" | "verifying" | "refreshing-parent" | "resuming",
) {
  if (phase === "verifying") return "正在核验统一发现身份";
  if (phase === "refreshing-parent") return "正在刷新绑定结果页";
  if (phase === "resuming") return "认证完成，正在恢复检索";
  return "等待官方机构认证";
}

function researchSearchSourceStatusLabel(status: SideraResearchSearchSnapshot["sourceReports"][number]["status"]) {
  if (status === "complete") return "完成";
  if (status === "partial") return "部分完成";
  return "失败";
}

function researchSearchTransportLabel(transport?: SideraResearchSearchSnapshot["sourceReports"][number]["transport"] | null) {
  if (transport === "structured-api") return "结构化接口";
  if (transport === "session-web-request") return "同会话后台请求";
  if (transport === "dom-fallback") return "实验性隐藏网页抽取";
  return "未确认";
}

function researchDisplayOrderLabel(order: SideraResearchDisplayOrder) {
  if (order === "newest") return "最新";
  if (order === "oldest") return "最早";
  if (order === "title") return "题名";
  return "来源返回顺序";
}

function researchCompletionReasonLabel(reason: SideraResearchSearchSnapshot["truth"]["completionReason"]) {
  if (reason === "result-limit") return "达到结果上限";
  if (reason === "page-limit") return "达到页面预算";
  if (reason === "timeout") return "达到时间预算";
  if (reason === "explicit-zero-results") return "来源明确零结果";
  if (reason === "source-exhausted") return "来源已耗尽";
  if (reason === "partial-failure") return "部分来源失败";
  return "正在采集";
}

function researchCandidateCitationLine(candidate: SideraNormalizedCandidateDraft) {
  const venue = candidate.venue || candidate.journal || candidate.conference || candidate.degreeInstitution || "";
  return [candidate.authors.join("; "), venue, candidate.volume ? `卷 ${candidate.volume}` : "", candidate.issue ? `期 ${candidate.issue}` : "", candidate.pages ? `页 ${candidate.pages}` : ""]
    .filter(Boolean)
    .join(" · ") || "作者与来源信息未提供";
}

function institutionDownloadStatusLabel(status: SideraInstitutionDownloadRecord["status"]) {
  if (status === "downloading") return "下载中";
  if (status === "cancel-requested") return "正在取消";
  if (status === "complete") return "已完成";
  if (status === "cancelled") return "已取消";
  return "失败";
}

function formatInstitutionFileSize(size?: number | null) {
  if (!size || size < 0) return "大小待确认";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KiB`;
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MiB`;
  return `${(size / 1024 / 1024 / 1024).toFixed(2)} GiB`;
}

function institutionSearchStatusLabel(status: SideraInstitutionSearchSnapshot["status"]) {
  if (status === "complete") return "检索完成";
  if (status === "partial") return "部分完成";
  if (status === "cancelled") return "已停止";
  if (status === "failed") return "检索失败";
  return "检索中";
}

function institutionSearchStageLabel(stage: SideraInstitutionSearchSnapshot["stage"]) {
  if (stage === "opening-web-result") return "正在提交官方检索";
  if (stage === "web-result-available") return "网页结果可用";
  if (stage === "awaiting-auth") return "统一发现认证中";
  if (stage === "resuming-after-auth") return "正在恢复检索";
  if (stage === "facet-processing") return "分面处理中";
  if (stage === "extracting") return "正在抽取";
  if (stage === "native-snapshot-complete") return "原生结果完成";
  if (stage === "filter-unconfirmed") return "筛选未确认";
  if (stage === "adapter-drift") return "适配器漂移";
  if (stage === "cancelled") return "已停止";
  if (stage === "failed") return "检索失败";
  return "等待检索";
}

function institutionRecordKindLabel(kind: SideraInstitutionSearchSnapshot["items"][number]["recordKind"]) {
  if (kind === "journal-article") return "期刊论文";
  if (kind === "conference-paper") return "会议论文";
  if (kind === "thesis") return "学位论文";
  if (kind === "book") return "图书";
  if (kind === "journal-holding") return "期刊馆藏";
  return "类型待确认";
}

function institutionFullTextStatusLabel(
  status: SideraInstitutionSearchSnapshot["items"][number]["fullTextStatus"],
) {
  if (status === "available") return "全文可用";
  if (status === "link-only") return "可跳转全文入口";
  if (status === "unavailable") return "未提供全文";
  return "全文状态未知";
}

function institutionFullTextRouteLabel(
  route: SideraInstitutionSearchSnapshot["items"][number]["fullTextRoute"],
) {
  if (route === "direct-html-pdf") return "直接 HTML/PDF";
  if (route === "doi") return "DOI";
  if (route === "openurl-link-resolver") return "OpenURL/链接解析器";
  if (route === "provider-record") return "供应商记录";
  if (route === "publisher-page") return "出版社页面";
  return "浏览器回退";
}

function institutionResultCitationLine(
  item: SideraInstitutionSearchSnapshot["items"][number],
) {
  const venue = item.publication || item.journal || item.conference || item.degreeInstitution || "";
  const normalizedVenue = venue.toLocaleLowerCase();
  const parts = [item.authors, venue || null];
  if (item.volume && !normalizedVenue.includes(`vol.${item.volume}`) && !normalizedVenue.includes(`卷 ${item.volume}`)) {
    parts.push(`卷 ${item.volume}`);
  }
  if (item.issue && !normalizedVenue.includes(`(${item.issue})`) && !normalizedVenue.includes(`期 ${item.issue}`)) {
    parts.push(`期 ${item.issue}`);
  }
  if (item.pages && !normalizedVenue.includes(`p.${item.pages}`) && !normalizedVenue.includes(`页 ${item.pages}`)) {
    parts.push(`页 ${item.pages}`);
  }
  return Array.from(new Set(parts.filter((part): part is string => Boolean(part)))).join(" · ")
    || "作者与来源信息未提供";
}

function ImportReviewWorkspace({
  batches,
  activeBatch,
  busy,
  commitPreview,
  commitStatus,
  commitHistory,
  readDiagnostics,
  commitResult,
  rollbackResult,
  onCreate,
  onOpen,
  onDecide,
  onDiscard,
  onClone,
  onPrepareCommit,
  onExecuteCommit,
  onRollback,
  onViewImportedPapers,
  onRefreshReads,
  onRunReadFaultFixture,
}: {
  batches: SideraImportReviewBatch[];
  activeBatch: SideraImportReviewBatch | null;
  busy: string;
  commitPreview: SideraImportCommitPreview | null;
  commitStatus: SideraImportCommitStatus | null;
  commitHistory: SideraImportCommitHistory;
  readDiagnostics: ImportReviewReadDiagnostics;
  commitResult: SideraImportCommitResult | null;
  rollbackResult: SideraImportRollbackResult | null;
  onCreate: () => void;
  onOpen: (batchId: string) => void;
  onDecide: (
    candidate: SideraImportCandidate,
    decision?: SideraImportDecisionKind,
    targetPaperId?: string,
  ) => void;
  onDiscard: () => void;
  onClone: () => void;
  onPrepareCommit: () => void;
  onExecuteCommit: () => void;
  onRollback: (entry: SideraImportCommitStatus) => void;
  onViewImportedPapers: (paperIds: string[]) => void;
  onRefreshReads: () => void;
  onRunReadFaultFixture?: (target: SideraImportReadFaultTarget) => void;
}) {
  const [page, setPage] = useState(1);
  const pageSize = 40;
  const pageCount = Math.max(1, Math.ceil((activeBatch?.candidates.length ?? 0) / pageSize));
  const visibleCandidates = activeBatch?.candidates.slice((page - 1) * pageSize, page * pageSize) ?? [];
  const previewBlockingItems = commitPreview?.items.filter((item) => item.blockingCodes.length > 0) ?? [];
  const previewBlocked = Boolean(commitPreview && (
    commitPreview.counts.unresolvedCount > 0
    || previewBlockingItems.length > 0
  ));
  const batchEditable = activeBatch ? matchesEditableImportReviewStatus(activeBatch.status) : false;
  const readDiagnosticRows = [
    ["batches", "审查批次", readDiagnostics.batches],
    ["status", "提交状态", readDiagnostics.status],
    ["history", "提交历史", readDiagnostics.history],
  ] as const;

  useEffect(() => {
    setPage(1);
  }, [activeBatch?.id]);

  return (
    <section className="panel-card import-review-workspace" aria-labelledby="import-review-title">
      <div className="import-review-header">
        <div>
          <p className="eyebrow">P2a–P2b · 题录审查与正式提交</p>
          <h2 id="import-review-title">先审查与预览，再以单一事务进入论文库</h2>
          <p>支持 CSV、JSON、JSONL、NDJSON、BibTeX 与 RIS。待处理项和未明确跳过的无效项会阻止提交；正式提交保留历史，并支持带指纹保护的整次回滚。</p>
        </div>
        <button type="button" className="primary-action h-10 gap-2" onClick={onCreate} disabled={Boolean(busy)}>
          {busy ? <Loader2 className="animate-spin" size={15} /> : <FileUp size={15} />}
          创建审查批次
        </button>
      </div>

      {busy ? <div className="import-review-busy" role="status">{busy}</div> : null}

      <details className="mini-card mb-4" aria-label="题录读取诊断">
        <summary className="cursor-pointer text-xs text-ink/55">
          读取诊断 · {readDiagnosticRows.map(([, label, diagnostic]) => (
            `${label}${diagnostic.state === "ready" ? "正常" : diagnostic.state === "error" ? "失败" : "待读取"}`
          )).join(" · ")}
        </summary>
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          {readDiagnosticRows.map(([key, label, diagnostic]) => (
            <div key={key} className="rounded-lg border border-line/50 bg-black/10 p-3">
              <div className="flex items-center justify-between gap-2 text-xs">
                <strong>{label}</strong>
                <span className={diagnostic.state === "error" ? "text-danger" : "text-ink/45"}>
                  {diagnostic.state === "ready" ? "正常" : diagnostic.state === "error" ? "失败" : "待读取"}
                </span>
              </div>
              {diagnostic.message ? (
                <code className="mt-2 block break-all text-[11px] leading-5 text-danger" role="alert">
                  {diagnostic.message}
                </code>
              ) : null}
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line/40 pt-3">
          <button type="button" className="secondary-action h-8" onClick={onRefreshReads} disabled={Boolean(busy)}>
            正常重读
          </button>
          {onRunReadFaultFixture ? (
            <>
              <span className="text-[11px] text-ink/35">开发夹具（内存一次性，不写数据库）</span>
              <button type="button" className="secondary-action h-8" onClick={() => onRunReadFaultFixture("batch-list")} disabled={Boolean(busy)}>
                批次故障
              </button>
              <button type="button" className="secondary-action h-8" onClick={() => onRunReadFaultFixture("commit-status")} disabled={Boolean(busy)}>
                状态故障
              </button>
              <button type="button" className="secondary-action h-8" onClick={() => onRunReadFaultFixture("commit-history")} disabled={Boolean(busy)}>
                历史故障
              </button>
            </>
          ) : null}
        </div>
      </details>

      <div className="import-review-layout">
        <aside className="import-review-batches" aria-label="题录审查批次">
          <strong>审查批次</strong>
          {batches.length > 0 ? batches.map((batch) => (
            <button
              type="button"
              key={batch.id}
              className={activeBatch?.id === batch.id ? "is-active" : ""}
              onClick={() => onOpen(batch.id)}
              disabled={Boolean(busy)}
            >
              <span>{batch.fileName}</span>
              <small>{batch.status === "active" ? `${batch.counts.decidedCount}/${batch.counts.total} 已决定` : importReviewBatchStatusLabel(batch.status)} · {batch.format.toUpperCase()}</small>
            </button>
          )) : <p>尚无批次。选择一个小型真实题录文件开始。</p>}
        </aside>

        <div className="import-review-detail">
          {activeBatch ? (
            <>
              <div className="import-review-summary">
                <div>
                  <span>{activeBatch.fileName}</span>
                  <strong>{importReviewBatchStatusLabel(activeBatch.status)}</strong>
                </div>
                <div className="import-review-counts" aria-label="候选分类统计">
                  <span data-kind="new">新记录 {activeBatch.counts.newCount}</span>
                  <span data-kind="merge">可合并 {activeBatch.counts.mergeCount}</span>
                  <span data-kind="conflict">冲突 {activeBatch.counts.conflictCount}</span>
                  <span data-kind="invalid">无效 {activeBatch.counts.invalidCount}</span>
                  <span>已决定 {activeBatch.counts.decidedCount}/{activeBatch.counts.total}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {batchEditable ? (
                    <>
                      <button type="button" className="primary-action h-8" onClick={onPrepareCommit} disabled={Boolean(busy)}>
                        生成提交预览
                      </button>
                      <button type="button" className="secondary-action h-8" onClick={onDiscard} disabled={Boolean(busy)}>放弃批次</button>
                    </>
                  ) : (
                    <>
                      <span className="text-xs text-ink/55">该批次已经进入只读状态，历史决定不会被继续修改。</span>
                      {(activeBatch.status === "committed" || activeBatch.status === "rolled-back") ? (
                        <button type="button" className="secondary-action h-8" onClick={onClone} disabled={Boolean(busy)}>
                          复制为新审查批次
                        </button>
                      ) : null}
                    </>
                  )}
                </div>
              </div>

              {commitStatus?.batchId === activeBatch.id ? (
                <div className="mini-card mb-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong>主库提交状态 · {importReviewBatchStatusLabel(commitStatus.batchStatus)}</strong>
                    <span className="text-xs text-ink/55">批次版本 {commitStatus.batchVersion}</span>
                  </div>
                  <p className="mt-2 text-sm text-ink/65">
                    {commitStatus.beforeRevision !== undefined && commitStatus.afterRevision !== undefined
                      ? `论文库 revision ${commitStatus.beforeRevision} → ${commitStatus.afterRevision}`
                      : "尚未产生正式主库提交。"}
                    {commitStatus.rollbackRevision !== undefined ? ` · 回滚后 revision ${commitStatus.rollbackRevision}` : ""}
                  </p>
                </div>
              ) : null}

              {commitPreview?.batchId === activeBatch.id ? (
                <ImportCommitPreviewPanel
                  preview={commitPreview}
                  blocked={previewBlocked}
                  blockingItems={previewBlockingItems.length}
                  busy={Boolean(busy)}
                  onExecute={onExecuteCommit}
                />
              ) : null}

              {commitResult?.batchId === activeBatch.id ? (
                <div className="mini-card mb-4" role="status">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong>提交完成 · {commitResult.counts.changedCount} 条主库变更</strong>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-ink/55">操作 {commitResult.commitId}</span>
                      {commitResult.items.some((item) => Boolean(item.paperId)) ? (
                        <button
                          type="button"
                          className="secondary-action h-8"
                          onClick={() => onViewImportedPapers(commitResult.items.flatMap((item) => item.paperId ? [item.paperId] : []))}
                          disabled={Boolean(busy)}
                        >
                          查看已入库论文
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-ink/65">
                    新增 {commitResult.counts.insertCount} · 合并 {commitResult.counts.mergeCount} · 独立保留 {commitResult.counts.keepSeparateCount} · 跳过 {commitResult.counts.skipCount}
                  </p>
                  <p className="mt-1 text-xs text-ink/50">
                    论文数 {commitResult.paperCountBefore} → {commitResult.paperCountAfter}；revision {commitResult.beforeRevision} → {commitResult.afterRevision}。热点模型未自动运行。
                  </p>
                  {commitResult.items.some((item) => Boolean(item.paperId)) ? (
                    <details className="mt-2 text-xs text-ink/45">
                      <summary className="cursor-pointer">已提交论文 ID</summary>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {Array.from(new Set(commitResult.items.flatMap((item) => item.paperId ? [item.paperId] : []))).map((paperId) => (
                          <code key={paperId} className="quiet-chip">{paperId}</code>
                        ))}
                      </div>
                    </details>
                  ) : null}
                </div>
              ) : null}

              {rollbackResult?.batchId === activeBatch.id ? (
                <ImportRollbackResultPanel result={rollbackResult} />
              ) : null}

              <div className="import-review-candidates">
                {visibleCandidates.map((candidate) => (
                  <article key={candidate.id} className="import-review-candidate" data-kind={candidate.classification}>
                    <div className="import-review-candidate__topline">
                      <span>第 {candidate.rowIndex} 条</span>
                      <strong>{importCandidateClassificationLabel(candidate.classification)}</strong>
                      {candidate.decision ? <em>{importDecisionLabel(candidate.decision.kind)}</em> : <em>待决定</em>}
                    </div>
                    <h3>{candidate.title || "无题名候选"}</h3>
                    <p>{[
                      candidate.authors.join("; "),
                      candidate.year?.toString(),
                      candidate.venue,
                      candidate.sourceDatabase,
                    ].filter(Boolean).join(" · ") || candidate.invalidReason || "无可展示元数据"}</p>
                    <div className="import-review-evidence">
                      {candidate.identityEvidence.map((evidence) => (
                        <span key={`${evidence.kind}:${evidence.value}`} title={evidence.value}>{evidence.rank}. {evidence.label}</span>
                      ))}
                    </div>
                    {candidate.identityMatches.length > 0 ? (
                      <div className="import-review-matches">
                        {candidate.identityMatches.map((match) => (
                          <div key={match.paperId}>
                            <span>{match.preferred ? "优先匹配" : "候选匹配"} · {match.title}</span>
                            <small>{match.matchedBy.map(importIdentityKindLabel).join(" + ")}</small>
                            {batchEditable ? (
                              <button type="button" onClick={() => onDecide(candidate, "accept-merge", match.paperId)} disabled={Boolean(busy)}>合并到此记录</button>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {batchEditable ? (
                      <div className="import-review-actions">
                        {candidate.classification !== "invalid" ? (
                          <button
                            type="button"
                            onClick={() => onDecide(
                              candidate,
                              candidate.classification === "new" ? "accept-new" : "keep-separate",
                            )}
                            disabled={Boolean(busy)}
                          >
                            {candidate.classification === "new" ? "确认作为新记录" : "作为独立记录"}
                          </button>
                        ) : null}
                        <button type="button" onClick={() => onDecide(candidate, "skip")} disabled={Boolean(busy)}>跳过</button>
                        {candidate.classification !== "invalid" ? (
                          <button type="button" onClick={() => onDecide(candidate, "unresolved")} disabled={Boolean(busy)}>保留待处理</button>
                        ) : null}
                        {candidate.decision ? <button type="button" onClick={() => onDecide(candidate)} disabled={Boolean(busy)}>清除决定</button> : null}
                      </div>
                    ) : null}
                  </article>
                ))}
                {activeBatch.candidates.length === 0 ? <div className="import-review-empty">该批次没有可显示候选。</div> : null}
              </div>

              {pageCount > 1 ? (
                <div className="import-review-pagination">
                  <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>上一页</button>
                  <span>{page}/{pageCount}</span>
                  <button type="button" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={page >= pageCount}>下一页</button>
                </div>
              ) : null}

              <ImportCommitHistoryPanel
                entries={commitHistory.entries.filter((entry) => entry.batchId === activeBatch.id)}
                busy={Boolean(busy)}
                onRollback={onRollback}
                onViewImportedPapers={onViewImportedPapers}
              />
            </>
          ) : (
            <div className="import-review-empty">
              <Database size={24} />
              <strong>尚未创建审查批次</strong>
              <span>文件解析与身份匹配结果会保存在独立的 Sidera/import-review-v1.sqlite 中。</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function ImportCommitPreviewPanel({
  preview,
  blocked,
  blockingItems,
  busy,
  onExecute,
}: {
  preview: SideraImportCommitPreview;
  blocked: boolean;
  blockingItems: number;
  busy: boolean;
  onExecute: () => void;
}) {
  const revisionDrift = preview.baseRevision !== undefined && preview.baseRevision !== preview.expectedRevision;
  const identityDrift = preview.items.some((item) => item.blockingCodes.some((code) => code.includes("IDENTITY")));

  return (
    <section className="mini-card mb-4" aria-label="题录正式提交预览">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">P2b · 主论文库提交预览</p>
          <strong>预览 {preview.previewId}</strong>
          <p className="mt-1 text-xs text-ink/50">
            预期 revision {preview.expectedRevision}
            {preview.baseRevision !== undefined ? ` · 审查基线 ${preview.baseRevision}` : ""}
            {` · 批次版本 ${preview.batchVersion}`}
          </p>
        </div>
        <button
          type="button"
          className="primary-action h-9"
          onClick={onExecute}
          disabled={busy || blocked}
        >
          {preview.counts.changedCount === 0 ? "确认全跳过并关闭批次" : "最终确认并提交"}
        </button>
      </div>

      <div className="import-review-counts mt-3" aria-label="提交动作统计">
        <span data-kind="new">新增 {preview.counts.insertCount}</span>
        <span data-kind="merge">合并 {preview.counts.mergeCount}</span>
        <span>独立 {preview.counts.keepSeparateCount}</span>
        <span>跳过 {preview.counts.skipCount}</span>
        <span data-kind="conflict">待处理 {preview.counts.unresolvedCount}</span>
        <span data-kind="invalid">无效 {preview.counts.invalidCount}</span>
        <span>实际变更 {preview.counts.changedCount}</span>
      </div>

      {revisionDrift || identityDrift || blocked ? (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-400/25 bg-amber-400/5 p-3 text-sm text-ink/70" role="alert">
          <AlertTriangle className="mt-0.5 shrink-0 text-amber" size={16} />
          <div>
            {revisionDrift ? <p>论文库 revision 已偏离审查基线，提交时会再次校验；若继续变化，当前预览将失效。</p> : null}
            {identityDrift ? <p>存在身份匹配漂移，请返回候选决定重新确认目标记录。</p> : null}
            {blocked ? <p>当前有 {preview.counts.unresolvedCount} 条待处理、{blockingItems} 条带阻塞码的预览项，不能提交。{preview.counts.invalidCount > 0 ? `另有 ${preview.counts.invalidCount} 条无效候选，只能明确跳过。` : ""}</p> : null}
          </div>
        </div>
      ) : (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-3 text-sm text-ink/65">
          <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-300" size={16} />
          <span>身份与 revision 预检通过；最终提交仍会重新校验预览哈希和主库状态。</span>
        </div>
      )}

      <div className="mt-3 grid gap-2">
        {preview.items.map((item) => (
          <details key={item.candidateId} className="rounded-xl border border-line/60 bg-black/10 px-3 py-2">
            <summary className="cursor-pointer text-sm text-ink/75">
              第 {item.rowIndex} 条 · {importCommitActionLabel(item.action)}
              {item.effectivePaperId ? ` · 目标 ${item.effectivePaperId}` : ""}
              {item.blockingCodes.length > 0 ? ` · 阻塞 ${item.blockingCodes.length}` : ""}
            </summary>
            <div className="mt-3 grid gap-3">
              <div>
                <strong className="text-xs text-ink/55">身份与来源摘要</strong>
                <div className="mt-1 flex flex-wrap gap-2">
                  {item.identityEvidence.length > 0 ? item.identityEvidence.map((evidence) => (
                    <span className="quiet-chip" key={`${item.candidateId}:${evidence.kind}:${evidence.value}`} title={evidence.value}>
                      {evidence.rank}. {evidence.label}
                    </span>
                  )) : <span className="text-xs text-ink/45">无可用身份依据</span>}
                </div>
              </div>
              {item.fieldChanges.length > 0 ? (
                <div className="grid gap-2">
                  {item.fieldChanges.map((change) => (
                    <div key={`${item.candidateId}:${change.field}`} className="grid gap-1 rounded-lg border border-line/40 p-2 text-xs md:grid-cols-[120px_1fr_1fr]">
                      <strong>{change.field} · {importCommitFieldActionLabel(change.action)}</strong>
                      <span title={change.existingValue}>现有：{change.existingValue || "空"}</span>
                      <span title={change.incomingValue}>候选：{change.incomingValue || "空"}</span>
                    </div>
                  ))}
                </div>
              ) : <span className="text-xs text-ink/45">该项不会产生字段变更。</span>}
              {item.blockingCodes.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {item.blockingCodes.map((code) => <code key={code} className="quiet-chip">{code}</code>)}
                </div>
              ) : null}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

function ImportCommitHistoryPanel({
  entries,
  busy,
  onRollback,
  onViewImportedPapers,
}: {
  entries: SideraImportCommitStatus[];
  busy: boolean;
  onRollback: (entry: SideraImportCommitStatus) => void;
  onViewImportedPapers: (paperIds: string[]) => void;
}) {
  return (
    <section className="mini-card mt-4" aria-label="题录提交历史">
      <div className="flex items-center justify-between gap-2">
        <strong>提交与回滚历史</strong>
        <span className="text-xs text-ink/45">{entries.length} 次操作</span>
      </div>
      {entries.length > 0 ? (
        <div className="mt-3 grid gap-2">
          {entries.map((entry, index) => (
            <article key={`${entry.commitId ?? entry.batchId}:${entry.completedAtMs ?? index}`} className="rounded-xl border border-line/50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <strong>{importReviewBatchStatusLabel(entry.batchStatus)}</strong>
                  <p className="mt-1 text-xs text-ink/45">
                    {entry.completedAtMs ? formatDateTime(new Date(entry.completedAtMs).toISOString()) : "尚无提交时间"}
                    {entry.commitId ? ` · ${entry.commitId}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {entry.batchStatus === "committed" && (entry.paperIds?.length ?? 0) > 0 ? (
                    <button type="button" className="secondary-action h-8" onClick={() => onViewImportedPapers(entry.paperIds ?? [])} disabled={busy}>
                      查看已入库论文
                    </button>
                  ) : null}
                  {entry.batchStatus === "committed" && entry.commitId && entry.afterRevision !== undefined ? (
                    <button type="button" className="secondary-action h-8" onClick={() => onRollback(entry)} disabled={busy}>
                      整次回滚
                    </button>
                  ) : <span className="text-xs text-ink/45">只读</span>}
                </div>
              </div>
              <p className="mt-2 text-xs text-ink/55">
                {entry.beforeRevision !== undefined && entry.afterRevision !== undefined
                  ? `revision ${entry.beforeRevision} → ${entry.afterRevision}`
                  : "尚未产生主库 revision 变更"}
                {entry.rollbackRevision !== undefined ? ` · 回滚至新 revision ${entry.rollbackRevision}` : ""}
              </p>
              {entry.counts ? (
                <p className="mt-1 text-xs text-ink/55">
                  新增 {entry.counts.insertCount} · 合并 {entry.counts.mergeCount} · 独立 {entry.counts.keepSeparateCount} · 跳过 {entry.counts.skipCount}
                </p>
              ) : null}
              {entry.errorCode ? <code className="mt-2 block text-xs text-red-300">{entry.errorCode}</code> : null}
            </article>
          ))}
        </div>
      ) : <p className="mt-2 text-sm text-ink/45">该批次尚无正式提交或回滚历史。</p>}
    </section>
  );
}

function ImportRollbackResultPanel({ result }: { result: SideraImportRollbackResult }) {
  return (
    <section className="mini-card mb-4" aria-label="题录回滚结果">
      <div className="flex items-center gap-2">
        {result.rollbackConflicts.length > 0 ? <AlertTriangle className="text-amber" size={16} /> : <CheckCircle2 className="text-emerald-300" size={16} />}
        <strong>{result.rollbackConflicts.length > 0 ? "整次回滚已被阻止" : "整次提交已回滚"}</strong>
      </div>
      <p className="mt-2 text-sm text-ink/60">
        恢复 {result.restoredCount} 条 · 删除 {result.deletedCount} 条
        {result.rollbackRevision !== undefined ? ` · 回滚 revision ${result.rollbackRevision}` : ""}
      </p>
      {result.rollbackConflicts.length > 0 ? (
        <div className="mt-3 grid gap-2">
          {result.rollbackConflicts.map((conflict) => (
            <div key={`${conflict.candidateId}:${conflict.paperId}:${conflict.code}`} className="rounded-lg border border-amber-400/20 p-2 text-xs text-ink/65">
              <strong>{conflict.code}</strong>
              <span className="ml-2">论文 {conflict.paperId}</span>
              {conflict.fields.length > 0 ? <p className="mt-1">发生漂移的字段：{conflict.fields.join("、")}</p> : null}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function importReviewBatchStatusLabel(value: SideraImportReviewBatch["status"]) {
  return {
    active: "审查中",
    discarded: "已放弃",
    committing: "提交中 · 只读",
    committed: "已提交 · 只读",
    "commit-failed": "提交失败",
    "rolled-back": "已回滚 · 只读",
  }[value];
}

function matchesEditableImportReviewStatus(value: SideraImportReviewBatch["status"]) {
  return value === "active" || value === "commit-failed";
}

function importCommitActionLabel(value: string) {
  return {
    insert: "新增记录",
    merge: "合并记录",
    "keep-separate": "独立记录",
    skip: "跳过",
  }[value] ?? value;
}

function importCommitFieldActionLabel(value: string) {
  return {
    insert: "写入",
    "fill-empty": "填补空字段",
    "preserve-existing": "保留现有值",
    unchanged: "不变",
    skip: "跳过",
  }[value] ?? value;
}

function importCandidateClassificationLabel(value: SideraImportCandidate["classification"]) {
  return { new: "新记录", merge: "建议合并", conflict: "身份冲突", invalid: "无效候选" }[value];
}

function importDecisionLabel(value: SideraImportDecisionKind) {
  return {
    "accept-new": "已确认新记录",
    "accept-merge": "已确认合并",
    "keep-separate": "保留独立",
    skip: "已跳过",
    unresolved: "待后续处理",
  }[value];
}

function importIdentityKindLabel(value: string) {
  return {
    doi: "DOI",
    "provider-record": "供应商记录",
    "canonical-url": "详情 URL",
    "title-author-year": "题名作者年份",
  }[value] ?? value;
}

function ImportPreviewPanel({
  preview,
  job,
  progress,
  onConfirm,
  onPause,
  onResume,
  onCancel,
  busy,
}: {
  preview: ImportPreview;
  job: ImportJobState | null;
  progress: string;
  onConfirm: () => void;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const importing = job?.status === "running" || job?.status === "paused";
  const percent = job ? Math.round((job.written / Math.max(1, job.total)) * 100) : 0;
  return (
    <section className="panel-card">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="panel-title">
            <FileUp size={17} />
            导入预览：{preview.fileName}
          </div>
          <p className="mt-2 text-sm text-ink/55">总行数 {preview.totalRows}，有效 {preview.validRows.length}，重复 {preview.duplicateRows.length}，无效 {preview.invalidRows.length}。</p>
        </div>
        <div className="flex gap-2">
          {importing ? (
            job?.status === "paused" ? (
              <button className="primary-action h-10 gap-2" onClick={onResume}>
                <Play size={15} />
                继续
              </button>
            ) : (
              <button className="secondary-action h-10 gap-2" onClick={onPause}>
                <Pause size={15} />
                暂停
              </button>
            )
          ) : (
            <button className="primary-action h-10 gap-2" onClick={() => void onConfirm()} disabled={busy || preview.validRows.length === 0}>
              <Save size={15} />
              确认入库
            </button>
          )}
          <button className="secondary-action h-10 gap-2" onClick={onCancel}>
            <X size={15} />
            {importing ? "取消导入" : "取消"}
          </button>
        </div>
      </div>
      {job && (
        <div className="mt-4 rounded-[8px] border border-cyan/20 bg-cyan/5 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-cyan">
            <span>{progress || `已写入 ${job.written} / ${job.total}`}</span>
            <span>{job.status} · {percent}% · 新增 {job.inserted} · 更新 {job.updated}</span>
          </div>
          <div className="progress-track mt-3"><div style={{ width: `${percent}%` }} /></div>
        </div>
      )}
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <div className="mini-card">
          <div className="text-sm font-medium text-ink">学科分布</div>
          <div className="mt-2 space-y-1 text-xs text-ink/55">{preview.fieldCounts.slice(0, 6).map((row) => <div key={row.field}>{row.field}: {row.count}</div>)}</div>
        </div>
        <div className="mini-card">
          <div className="text-sm font-medium text-ink">来源分布</div>
          <div className="mt-2 space-y-1 text-xs text-ink/55">{preview.sourceCounts.map((row) => <div key={row.source}>{row.source}: {row.count}</div>)}</div>
        </div>
        <div className="mini-card">
          <div className="text-sm font-medium text-ink">错误行示例</div>
          <div className="mt-2 space-y-1 text-xs text-ink/55">{preview.invalidRows.slice(0, 4).map((row) => <div key={row.index}>第 {row.index} 行：{row.reason}</div>) || "无"}</div>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {preview.validRows.slice(0, 6).map((paper) => (
          <div key={paper.id} className="mini-card">
            <div className="line-clamp-2 text-sm font-medium text-ink">{paper.title}</div>
            <div className="mt-2 text-xs text-ink/45">{paper.source} | {paper.year ?? "未知年份"} | {paper.field}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ImportProgressPanel({
  job,
  progress,
  onPause,
  onResume,
  onCancel,
}: {
  job: ImportJobState;
  progress: string;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
}) {
  const active = job.status === "running" || job.status === "paused";
  const percent = job.total > 0 ? Math.min(100, Math.round((job.written / job.total) * 100)) : job.status === "done" ? 100 : 0;
  return (
    <section className="panel-card">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="panel-title">
            <Database size={17} />
            大文件直导：{job.fileName ?? "论文数据文件"}
          </div>
          <p className="mt-2 text-sm text-ink/55">{progress || job.message || "正在由 Tauri/Rust 侧读取文件并分批写入 SQLite。"}</p>
        </div>
        <div className="flex gap-2">
          {active && (job.status === "paused" ? (
            <button className="primary-action h-10 gap-2" onClick={onResume}><Play size={15} />继续</button>
          ) : (
            <button className="secondary-action h-10 gap-2" onClick={onPause}><Pause size={15} />暂停</button>
          ))}
          {active && <button className="secondary-action h-10 gap-2" onClick={onCancel}><X size={15} />取消</button>}
        </div>
      </div>
      <div className="mt-4 rounded-[8px] border border-cyan/20 bg-cyan/5 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-cyan">
          <span>{job.status} · 已处理 {job.written.toLocaleString()} 行</span>
          <span>新增 {job.inserted.toLocaleString()} · 更新 {job.updated.toLocaleString()} · 无效 {(job.invalidRows ?? 0).toLocaleString()} · 重复 {(job.duplicateRows ?? 0).toLocaleString()}</span>
        </div>
        <div className="progress-track mt-3"><div style={{ width: `${percent}%` }} /></div>
        {job.recovery?.safeToRerun && (
          <div className="mt-3 rounded-[6px] border border-white/10 bg-black/18 px-3 py-2 text-xs leading-5 text-ink/55">
            恢复策略：每 {job.recovery.batchSize.toLocaleString()} 行左右分批写入；{job.recovery.strategy}
          </div>
        )}
      </div>
    </section>
  );
}

const GALAXY_FIELD_COLORS = ["#8EA7FF", "#B58DFF", "#F3B75D", "#F47A9C", "#58D4F2", "#D8E2F4"];
const GALAXY_BG = "#01040d";
const GALAXY_LAYOUT_STORAGE_KEY = "research-hotspots:galaxy-layout";

function galaxyLoadPhaseLabel(phase: GalaxyLoadPhase) {
  if (phase === "cache") return "正在读取 SQLite 星图缓存";
  if (phase === "mysql") return "正在连接 MySQL 并更新缓存";
  return "正在构建 app17 星图";
}

type GalaxySelectedPaperDetail = {
  id: string;
  title: string;
  source: string;
  year?: number;
  field: string;
  abstractText: string;
  authors?: string;
  doi?: string;
  url?: string;
  categories?: string;
  publishedDate?: string;
  createdAt?: string;
  updatedAt?: string;
  kind: "ordinary" | "representative";
};

function galaxyPaperPanelClass(state: GalaxyPaperPanelState) {
  if (state === "staged") return "galaxy-paper-reading-panel-staged";
  if (state === "entering") return "galaxy-paper-reading-panel-entering";
  if (state === "visible") return "galaxy-paper-reading-panel-visible";
  if (state === "exiting") return "galaxy-paper-reading-panel-exiting";
  return "galaxy-paper-reading-panel-hidden";
}

function galaxyPaperInspectorClass(state: GalaxyPaperPanelState) {
  if (state === "staged") return "galaxy-inspector-paper-reading-staged";
  if (state === "entering") return "galaxy-inspector-paper-reading-entering";
  if (state === "visible") return "galaxy-inspector-paper-reading-visible";
  if (state === "exiting") return "galaxy-inspector-paper-reading-exiting";
  return "galaxy-inspector-paper-reading-hidden";
}

function GalaxyPaperReadingPanel({
  paper,
  paperId,
  fallbackYear,
  representative,
  status,
  error,
  inspectionMode,
  panelState,
  onToggleInspection,
  onReturn,
  onOpenPaper,
  fullscreen = false,
}: {
  paper?: GalaxySelectedPaperDetail;
  paperId: string;
  fallbackYear?: number;
  representative: boolean;
  status: "idle" | "loading" | "ready" | "missing" | "error";
  error: string;
  inspectionMode: GalaxyPaperInspectionMode;
  panelState: GalaxyPaperPanelState;
  onToggleInspection: () => void;
  onReturn: () => void;
  onOpenPaper: (paper: { id: string; title: string; field: string }) => void;
  fullscreen?: boolean;
}) {
  const loading = !paper && (status === "idle" || status === "loading");
  const displayTitle = paper?.title || (representative ? "代表论文" : "普通论文");
  const displayYear = paper?.year ?? fallbackYear;
  return (
    <section className={`galaxy-paper-reading-panel ${galaxyPaperPanelClass(panelState)} ${fullscreen ? "galaxy-paper-reading-panel-fullscreen" : ""}`} aria-label="论文近景详情">
      <header className="galaxy-paper-reading-header">
        <div className="galaxy-paper-reading-kicker">{representative ? "代表论文能量光核" : "普通论文近景"}</div>
        <h2>{displayTitle}</h2>
        <div className="galaxy-paper-reading-status">
          <span>{paper?.source || "来源待读取"}</span>
          <span>{displayYear ?? "未知年份"}</span>
          <span>{paper?.field || "当前热点学科"}</span>
        </div>
      </header>
      <div className="galaxy-paper-reading-scroll">
        {loading ? (
          <div className="galaxy-paper-reading-skeleton" aria-label="正在读取论文详情">
            <span /><span /><span /><span />
            <p>正在从 SQLite 读取论文完整信息...</p>
          </div>
        ) : paper ? (
          <>
            <section className="galaxy-paper-reading-section">
              <h3>摘要</h3>
              <p>{paper.abstractText || "暂无摘要。"}</p>
            </section>
            <section className="galaxy-paper-reading-section galaxy-paper-reading-metadata">
              <h3>论文信息</h3>
              <dl>
                <div><dt>作者</dt><dd>{paper.authors || "暂无作者信息"}</dd></div>
                <div><dt>分类</dt><dd>{paper.categories || "暂无分类信息"}</dd></div>
                <div><dt>发布日期</dt><dd>{paper.publishedDate || paper.year || "未知"}</dd></div>
                <div><dt>DOI</dt><dd>{paper.doi || "暂无 DOI"}</dd></div>
                <div><dt>URL</dt><dd>{paper.url || "暂无原文链接"}</dd></div>
              </dl>
            </section>
            <details className="galaxy-paper-record-details">
              <summary>记录信息</summary>
              <dl>
                <div><dt>论文 ID</dt><dd>{paper.id}</dd></div>
                <div><dt>创建时间</dt><dd>{paper.createdAt || "证据快照未提供"}</dd></div>
                <div><dt>更新时间</dt><dd>{paper.updatedAt || "证据快照未提供"}</dd></div>
              </dl>
            </details>
          </>
        ) : (
          <div className="galaxy-paper-reading-error">
            <strong>完整记录暂不可用</strong>
            <p>{error || "SQLite 中未找到该论文的完整记录，但仍可继续观察其星图坐标。"}</p>
            <small>论文 ID：{paperId}</small>
          </div>
        )}
        <p className="galaxy-paper-visual-note">
          {representative
            ? "能量光核仅为代表论文视觉标记，不表示引用量、影响力或真实能量。"
            : "近景球面为视觉映射，不表示论文具有真实物理尺度或行星属性。"}
        </p>
      </div>
      <footer className="galaxy-paper-reading-actions">
        {paper && <button className="secondary-action h-9 gap-2 px-3" onClick={() => onOpenPaper(paper)}><BookOpen size={15} />进入文献列表</button>}
        {paper?.url && <button className="secondary-action h-9 gap-2 px-3" onClick={() => void openExternalUrl(paper.url!)}><Globe2 size={15} />打开原文</button>}
        <button className="secondary-action h-9 gap-2 px-3" onClick={onToggleInspection}>
          {inspectionMode === "centered" ? <><ArrowRight size={15} />展开详情</> : <><LocateFixed size={15} />居中观察</>}
        </button>
        <button className="secondary-action h-9 gap-2 px-3" onClick={onReturn}><ArrowLeft size={15} />返回系统中心</button>
      </footer>
    </section>
  );
}

type GalaxyToolbarPopover = "closed" | "field-filter" | "filters" | "more";

type GalaxyContextRailState =
  | { mode: "closed" }
  | { mode: "hotspot"; hotspotId: string }
  | { mode: "paper-summary"; hotspotId: string; paperId: string }
  | { mode: "paper-reading"; hotspotId: string; paperId: string };

function GalaxyView({
  active,
  navigationOpen,
  titleBarToolsHost,
  hotspots,
  papers,
  settings,
  activeProject,
  libraryStatus,
  v20Snapshot,
  app17Session,
  app17SessionKey,
  visualReview,
  visualReviewIntent,
  onEnsureApp17,
  onRefreshApp17,
  onOpenPipeline,
  onOpenPaperList,
  onOpenPaper,
}: {
  active: boolean;
  navigationOpen: boolean;
  titleBarToolsHost: HTMLDivElement | null;
  hotspots: Hotspot[];
  papers: Paper[];
  settings: AiSettings;
  activeProject: Project;
  libraryStatus: PaperLibraryStatus | null;
  v20Snapshot: V20HotspotSnapshot | null;
  app17Session: GalaxySessionState;
  app17SessionKey: string;
  visualReview: boolean;
  visualReviewIntent?: GalaxyVisualReviewIntent;
  onEnsureApp17: () => Promise<void>;
  onRefreshApp17: () => Promise<void>;
  onOpenPipeline: () => void;
  onOpenPaperList: (hotspot: Hotspot) => void;
  onOpenPaper: (paper: { id: string; title: string; field: string }) => void;
}) {
  const visualReviewCapture = visualReview
    && typeof window !== "undefined"
    && new URLSearchParams(window.location.search).get("capture") === "clean";
  const [field, setField] = useState("all");
  const [layoutMode, setLayoutMode] = useState<GalaxyLayoutMode>("semantic");
  const [visualMode, setVisualMode] = useState<GalaxyVisualMode>(
    visualReviewIntent?.preset ? "galaxy" : "nebula",
  );
  const [minPaperCount, setMinPaperCount] = useState(1);
  const [minConfidence, setMinConfidence] = useState(0);
  const [selectedId, setSelectedId] = useState("");
  const [selectionActive, setSelectionActive] = useState(false);
  const [galaxyExplorationState, setGalaxyExplorationState] = useState<GalaxyExplorationState>("overview");
  const [galaxySystemViewMode, setGalaxySystemViewMode] = useState<GalaxySystemViewMode>("system");
  const [galaxyPaperFocusState, setGalaxyPaperFocusState] = useState<GalaxyPaperFocusState>("idle");
  const [galaxyPaperInspectionMode, setGalaxyPaperInspectionMode] = useState<GalaxyPaperInspectionMode>("none");
  const [galaxyPaperPanelState, setGalaxyPaperPanelState] = useState<GalaxyPaperPanelState>("hidden");
  const [galaxyContextRailState, setGalaxyContextRailState] = useState<GalaxyContextRailState>({ mode: "closed" });
  const [galaxyToolbarPopover, setGalaxyToolbarPopover] = useState<GalaxyToolbarPopover>("closed");
  const [galaxyFocusedPaperId, setGalaxyFocusedPaperId] = useState("");
  const [selectedGalaxyPaperId, setSelectedGalaxyPaperId] = useState("");
  const [selectedOrdinaryGalaxyPaper, setSelectedOrdinaryGalaxyPaper] = useState<Paper | null>(null);
  const [galaxyPaperDetailStatus, setGalaxyPaperDetailStatus] = useState<"idle" | "loading" | "ready" | "missing" | "error">("idle");
  const [galaxyPaperDetailError, setGalaxyPaperDetailError] = useState("");
  const [galaxyPaperDetailPerformance, setGalaxyPaperDetailPerformance] = useState<{ queryMs: number; cacheState: GalaxyPaperDetailCacheState }>({ queryMs: 0, cacheState: "idle" });
  const [hotspotEvidence, setHotspotEvidence] = useState<HotspotEvidenceBundle | null>(null);
  const [hotspotEvidenceStatus, setHotspotEvidenceStatus] = useState<"idle" | "loading" | "ready" | "unavailable">("idle");
  const [galaxyEvidencePerformance, setGalaxyEvidencePerformance] = useState<GalaxyEvidencePerformance>({ cacheState: "idle", queryMs: 0, pendingQueries: 0 });
  const [galaxyFullscreen, setGalaxyFullscreen] = useState(false);
  const [galaxyLayoutClassic, setGalaxyLayoutClassic] = useState(() => {
    if (!import.meta.env.DEV) return false;
    return new URLSearchParams(window.location.search).get("galaxyLayout") === "classic";
  });
  const [galaxyCameraPose, setGalaxyCameraPose] = useState<GalaxyCameraPose | undefined>();
  const [cameraCommand, setCameraCommand] = useState<GalaxyCameraCommand>({ kind: "reset", target: [0, 0, 0], distance: 78, nonce: 0 });
  const [galaxyDiagnosticsOpen, setGalaxyDiagnosticsOpen] = useState(false);
  const [galaxyDiagnosticsResetNonce, setGalaxyDiagnosticsResetNonce] = useState(0);
  const [galaxyPerformance, setGalaxyPerformance] = useState<GalaxyPerformanceSnapshot | null>(null);
  const [galaxyDiagnosticsCopyStatus, setGalaxyDiagnosticsCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const app17Payload = app17Session.payload;
  const galaxyProductSpatialPresentation = !visualReview && !galaxyLayoutClassic;
  const galaxyPresentationFullscreen = galaxyProductSpatialPresentation || galaxyFullscreen;
  const app17Loading = app17Session.loading;
  const app17Error = app17Session.error;
  const app17Notice = app17Session.notice;
  const evidenceCacheRef = useRef(new Map<string, HotspotEvidenceBundle>());
  const evidenceRequestSequenceRef = useRef(0);
  const evidencePendingRequestsRef = useRef(new Set<number>());
  const galaxyPaperDetailCacheRef = useRef(new Map<string, Paper>());
  const galaxyPaperDetailRequestSequenceRef = useRef(0);
  const visualReviewAutomationRef = useRef({ key: "", hotspotSelected: false, systemRequested: false, paperSelected: false, paperRequested: false });
  const galaxyInspectorScrollRef = useRef<HTMLDivElement>(null);
  const galaxyToolbarRef = useRef<HTMLDivElement>(null);
  const cachedSnapshotIds = useMemo(() => Array.from(new Set(hotspots.map((hotspot) => hotspot.snapshotId).filter(Boolean))), [hotspots]);
  const cachedSnapshotId = v20Snapshot?.snapshotId ?? (cachedSnapshotIds.length === 1 ? cachedSnapshotIds[0] : undefined);
  const v20SnapshotConsistent = visualReview || !app17Payload?.ready || Boolean(
    app17Payload.snapshotId && cachedSnapshotId && app17Payload.snapshotId === cachedSnapshotId,
  );
  const app17Available = Boolean(app17Payload?.ready && app17Payload.hotspots.length > 0 && v20SnapshotConsistent);
  const app17Hotspots = useMemo(() => (app17Payload?.ready && v20SnapshotConsistent
    ? (app17Payload.hotspotRecords?.length ? app17Payload.hotspotRecords : app17Payload.hotspots.map(app17HotspotToHotspot))
    : []), [app17Payload, v20SnapshotConsistent]);
  const displayHotspots = app17Available ? app17Hotspots : [];
  const visualReviewTargetHotspot = useMemo(() => {
    if (!visualReview || !visualReviewIntent || app17Hotspots.length === 0) return undefined;
    const exact = app17Hotspots.find((hotspot) =>
      (visualReviewIntent.field === undefined || hotspot.field === visualReviewIntent.field)
      && (visualReviewIntent.topic === undefined || hotspot.topicId === visualReviewIntent.topic));
    if (exact) return exact;
    const fieldCandidates = visualReviewIntent.field
      ? app17Hotspots.filter((hotspot) => hotspot.field === visualReviewIntent.field)
      : app17Hotspots;
    return fieldCandidates.slice().sort((left, right) => right.paperCount - left.paperCount)[0]
      ?? app17Hotspots.slice().sort((left, right) => right.paperCount - left.paperCount)[0];
  }, [app17Hotspots, visualReview, visualReviewIntent]);
  const fields = useMemo(() => Array.from(new Set(displayHotspots.map((hotspot) => hotspot.field))).sort(), [displayHotspots]);
  const filteredHotspots = useMemo(
    () =>
      displayHotspots.filter((hotspot) => {
        const matchesField = field === "all" || hotspot.field === field;
        const matchesCount = hotspot.paperCount >= minPaperCount;
        const matchesConfidence = (hotspot.confidence ?? 0) >= minConfidence / 100;
        return matchesField && matchesCount && matchesConfidence;
      }),
    [displayHotspots, field, minConfidence, minPaperCount],
  );
  const app17FilteredPayload = useMemo(() => v20SnapshotConsistent ? filterApp17Payload(app17Payload, filteredHotspots) : null, [app17Payload, filteredHotspots, v20SnapshotConsistent]);
  const nodes = useMemo(() => buildGalaxyNodes(filteredHotspots, layoutMode, visualMode, GALAXY_FIELD_COLORS), [filteredHotspots, layoutMode, visualMode]);
  const links = useMemo(() => buildHotspotLinks(nodes), [nodes]);
  const galaxyBounds = useMemo(() => calculateGalaxyBounds(nodes), [nodes]);
  const selected = selectedId ? filteredHotspots.find((hotspot) => hotspot.id === selectedId) : undefined;
  const selectedNode = nodes.find((node) => node.hotspot.id === selected?.id);
  const selectedLinks = useMemo(
    () =>
      selected
        ? links
            .filter((link) => link.source.hotspot.id === selected.id || link.target.hotspot.id === selected.id)
            .sort((a, b) => b.score - a.score)
        : [],
    [links, selected],
  );
  const similarHotspots = useMemo(
    () =>
      selected
        ? (selected.similarHotspots?.length
            ? selected.similarHotspots
                .map((relation) => ({ hotspot: filteredHotspots.find((hotspot) => hotspot.id === relation.hotspotId), score: relation.score }))
                .filter((item): item is { hotspot: Hotspot; score: number } => Boolean(item.hotspot))
            : nodes
                .filter((node) => node.hotspot.id !== selected.id)
                .map((node) => ({
                  hotspot: node.hotspot,
                  score: keywordSimilarity(selected.keywords, node.hotspot.keywords) + (selected.field === node.hotspot.field ? 0.08 : 0),
                })))
            .filter((item) => item.score > 0.02)
            .sort((a, b) => b.score - a.score)
            .slice(0, 6)
        : [],
    [filteredHotspots, nodes, selected],
  );
  const relatedLinkIds = useMemo(
    () =>
      new Set(
        selectedLinks.flatMap((link) => [
          link.source.hotspot.id,
          link.target.hotspot.id,
        ]),
      ),
    [selectedLinks],
  );
  const activeSelectedId = selectionActive ? selected?.id ?? "" : "";
  // In the immersive layout the inspector is a floating panel: it slides in for
  // a live selection or a paper being read, and stays out of the way otherwise.
  const galaxyContextRailMode = galaxyContextRailState.mode;
  const galaxyInspectorOpen = galaxyContextRailMode !== "closed";
  const visibleRelatedIds = useMemo(() => (selectionActive ? relatedLinkIds : new Set<string>()), [relatedLinkIds, selectionActive]);
  const visibleRelatedIdList = useMemo(() => Array.from(visibleRelatedIds), [visibleRelatedIds]);
  const galaxyLabelIds = useMemo(() => {
    const topIds = filteredHotspots
      .slice()
      .sort((a, b) => (b.paperCount * ((b.confidence ?? 0.5) + 0.5)) - (a.paperCount * ((a.confidence ?? 0.5) + 0.5)))
      .slice(0, 6)
      .map((hotspot) => hotspot.id);
    const selectedIds = selected ? [selected.id] : [];
    const relatedIds = selectionActive ? similarHotspots.slice(0, 4).map((item) => item.hotspot.id) : [];
    return Array.from(new Set([...selectedIds, ...relatedIds, ...topIds])).slice(0, 10);
  }, [filteredHotspots, selected, selectionActive, similarHotspots]);
  const galaxyPaperCount = useMemo(
    () => (app17FilteredPayload?.ready ? app17FilteredPayload.paperCount : 0),
    [app17FilteredPayload],
  );
  const visibleGalaxyHotspotCount = app17FilteredPayload?.ready
    ? visualMode === "nebula"
      ? Math.min(50, app17FilteredPayload.hotspotCount)
      : app17FilteredPayload.hotspotCount
    : Math.min(filteredHotspots.length, 50);
  const representativeIds = useMemo(
    () => (hotspotEvidence && hotspotEvidence.selectedHotspotId === selected?.id ? hotspotEvidence.representativeIds.slice(0, 12) : []),
    [hotspotEvidence, selected?.id],
  );
  const representativeGalaxyPapers = useMemo(
    () => (hotspotEvidence && hotspotEvidence.selectedHotspotId === selected?.id ? hotspotEvidence.representativePapers.slice(0, 10) : []),
    [hotspotEvidence, selected?.id],
  );
  const selectedRepresentativeGalaxyPaper = useMemo(
    () => representativeGalaxyPapers.find((paper) => paper.id === selectedGalaxyPaperId),
    [representativeGalaxyPapers, selectedGalaxyPaperId],
  );
  const selectedGalaxyPaper = useMemo(() => {
    if (selectedRepresentativeGalaxyPaper) {
      return {
        id: selectedRepresentativeGalaxyPaper.id,
        title: selectedRepresentativeGalaxyPaper.title,
        source: selectedRepresentativeGalaxyPaper.source,
        year: selectedRepresentativeGalaxyPaper.year,
        field: selectedRepresentativeGalaxyPaper.field,
        abstractText: selectedRepresentativeGalaxyPaper.abstractText,
        authors: selectedRepresentativeGalaxyPaper.authors,
        doi: selectedRepresentativeGalaxyPaper.doi,
        url: selectedRepresentativeGalaxyPaper.url,
        categories: selectedRepresentativeGalaxyPaper.categories,
        publishedDate: selectedRepresentativeGalaxyPaper.publishedDate,
        createdAt: undefined,
        updatedAt: undefined,
        kind: "representative" as const,
      };
    }
    if (!selectedOrdinaryGalaxyPaper || selectedOrdinaryGalaxyPaper.id !== selectedGalaxyPaperId) return undefined;
    return {
      id: selectedOrdinaryGalaxyPaper.id,
      title: selectedOrdinaryGalaxyPaper.title,
      source: selectedOrdinaryGalaxyPaper.source,
      year: selectedOrdinaryGalaxyPaper.year,
      field: selectedOrdinaryGalaxyPaper.field,
      abstractText: selectedOrdinaryGalaxyPaper.abstract,
      authors: selectedOrdinaryGalaxyPaper.authors,
      doi: selectedOrdinaryGalaxyPaper.doi,
      url: selectedOrdinaryGalaxyPaper.url,
      categories: selectedOrdinaryGalaxyPaper.categories,
      publishedDate: selectedOrdinaryGalaxyPaper.publishedDate,
      createdAt: selectedOrdinaryGalaxyPaper.createdAt,
      updatedAt: selectedOrdinaryGalaxyPaper.updatedAt,
      kind: "ordinary" as const,
    };
  }, [selectedGalaxyPaperId, selectedOrdinaryGalaxyPaper, selectedRepresentativeGalaxyPaper]);
  const selectedGalaxyPaperCoordinate = useMemo(
    () => app17FilteredPayload?.papers.find((paper) => (
      paper.scopedPaperId === selectedGalaxyPaperId || paper.rawPaperId === selectedGalaxyPaperId
    )),
    [app17FilteredPayload, selectedGalaxyPaperId],
  );
  const selectedGalaxyPaperVisual = useMemo(
    () => selectedGalaxyPaperId
      ? {
          id: selectedGalaxyPaperId,
          year: selectedGalaxyPaper?.year ?? selectedGalaxyPaperCoordinate?.year,
          source: selectedGalaxyPaper?.source,
          representative: Boolean(selectedRepresentativeGalaxyPaper),
        }
      : undefined,
    [selectedGalaxyPaper, selectedGalaxyPaperCoordinate?.year, selectedGalaxyPaperId, selectedRepresentativeGalaxyPaper],
  );
  const evidenceBundlePapers = useMemo(() => hotspotEvidenceToPapers(hotspotEvidence), [hotspotEvidence]);
  const fallbackPapersByField = useMemo(() => {
    const index = new Map<string, Paper[]>();
    for (const paper of papers) {
      const rows = index.get(paper.field) ?? [];
      if (rows.length < 8) {
        rows.push(paper);
        index.set(paper.field, rows);
      }
    }
    return index;
  }, [papers]);
  const inspectorRelatedPapers = evidenceBundlePapers.length > 0
    ? evidenceBundlePapers
    : hotspotEvidenceStatus === "unavailable" && selected
      ? fallbackPapersByField.get(selected.field) ?? []
      : [];
  const sourceDistribution = useMemo(
    () =>
      hotspotEvidence?.sourceDistribution?.length
        ? hotspotEvidence.sourceDistribution.map((row) => [row.value, row.count] as [string, number])
        : selected?.sourceDistribution?.length
          ? selected.sourceDistribution.map((row) => [row.value, row.count] as [string, number])
          : countBy(inspectorRelatedPapers, (paper) => paper.source).slice(0, 5),
    [hotspotEvidence, inspectorRelatedPapers, selected],
  );
  const yearDistribution = useMemo(() => (hotspotEvidence?.yearEvolution?.length ? hotspotEvidence.yearEvolution : selected?.evolution ?? []).slice().sort((a, b) => a.year - b.year).slice(-8), [hotspotEvidence, selected]);

  useEffect(() => {
    void onEnsureApp17();
  }, [app17SessionKey]);

  useEffect(() => {
    if (!active) setGalaxyFullscreen(false);
  }, [active]);

  useEffect(() => {
    galaxyPaperDetailCacheRef.current.clear();
    galaxyPaperDetailRequestSequenceRef.current += 1;
    setSelectedOrdinaryGalaxyPaper(null);
    setGalaxyPaperDetailStatus("idle");
    setGalaxyPaperDetailError("");
    setGalaxyPaperDetailPerformance({ queryMs: 0, cacheState: "idle" });
  }, [app17SessionKey, app17Payload?.generatedAt]);

  useEffect(() => {
    galaxyInspectorScrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
    setSelectedGalaxyPaperId("");
    setSelectedOrdinaryGalaxyPaper(null);
    setGalaxyPaperDetailStatus("idle");
    setGalaxyPaperDetailError("");
    setGalaxySystemViewMode("system");
    setGalaxyPaperFocusState("idle");
    setGalaxyPaperInspectionMode("none");
    setGalaxyPaperPanelState("hidden");
    setGalaxyFocusedPaperId("");
  }, [selected?.id]);

  useEffect(() => {
    const requestSequence = ++galaxyPaperDetailRequestSequenceRef.current;
    if (!selectedGalaxyPaperId) {
      setSelectedOrdinaryGalaxyPaper(null);
      setGalaxyPaperDetailStatus("idle");
      setGalaxyPaperDetailError("");
      setGalaxyPaperDetailPerformance({ queryMs: 0, cacheState: "idle" });
      return;
    }
    if (selectedRepresentativeGalaxyPaper) {
      setSelectedOrdinaryGalaxyPaper(null);
      setGalaxyPaperDetailStatus("ready");
      setGalaxyPaperDetailError("");
      setGalaxyPaperDetailPerformance({ queryMs: 0, cacheState: "representative" });
      return;
    }

    const cached = galaxyPaperDetailCacheRef.current.get(selectedGalaxyPaperId);
    if (cached) {
      galaxyPaperDetailCacheRef.current.delete(selectedGalaxyPaperId);
      galaxyPaperDetailCacheRef.current.set(selectedGalaxyPaperId, cached);
      setSelectedOrdinaryGalaxyPaper(cached);
      setGalaxyPaperDetailStatus("ready");
      setGalaxyPaperDetailError("");
      setGalaxyPaperDetailPerformance({ queryMs: 0, cacheState: "hit" });
      return;
    }

    setSelectedOrdinaryGalaxyPaper(null);
    setGalaxyPaperDetailStatus("loading");
    setGalaxyPaperDetailError("");
    setGalaxyPaperDetailPerformance({ queryMs: 0, cacheState: "miss" });
    const startedAt = performance.now();
    void getPapersByIds(settings.databaseDir, activeProject.id, [selectedGalaxyPaperId])
      .then((rows) => {
        if (requestSequence !== galaxyPaperDetailRequestSequenceRef.current) return;
        const queryMs = performance.now() - startedAt;
        const paper = rows[0];
        if (!paper) {
          setGalaxyPaperDetailStatus("missing");
          setGalaxyPaperDetailError("SQLite 中未找到该论文的完整记录。");
          setGalaxyPaperDetailPerformance({ queryMs, cacheState: "missing" });
          return;
        }
        const cache = galaxyPaperDetailCacheRef.current;
        cache.delete(selectedGalaxyPaperId);
        cache.set(selectedGalaxyPaperId, paper);
        while (cache.size > 128) {
          const oldestKey = cache.keys().next().value as string | undefined;
          if (!oldestKey) break;
          cache.delete(oldestKey);
        }
        setSelectedOrdinaryGalaxyPaper(paper);
        setGalaxyPaperDetailStatus("ready");
        setGalaxyPaperDetailPerformance({ queryMs, cacheState: "miss" });
      })
      .catch((error) => {
        if (requestSequence !== galaxyPaperDetailRequestSequenceRef.current) return;
        setGalaxyPaperDetailStatus("error");
        setGalaxyPaperDetailError(error instanceof Error ? error.message : String(error));
        setGalaxyPaperDetailPerformance({ queryMs: performance.now() - startedAt, cacheState: "error" });
      });
  }, [activeProject.id, representativeGalaxyPapers, selectedGalaxyPaperId, selectedRepresentativeGalaxyPaper, settings.databaseDir]);

  function commandCamera(kind: GalaxyCameraCommand["kind"]) {
    const target = kind === "reset" ? [0, 0, 0] as [number, number, number] : galaxyBounds.center;
    const distance = kind === "reset" ? 78 : galaxyBounds.distance;
    setCameraCommand((current) => ({ kind, target, distance, nonce: current.nonce + 1 }));
  }

  function selectGalaxyHotspot(hotspotId: string) {
    if (galaxyExplorationState !== "overview") return;
    setSelectedId(hotspotId);
    setSelectionActive(true);
    setGalaxyContextRailState({ mode: "hotspot", hotspotId });
  }

  function closeGalaxyContextRail() {
    setGalaxyContextRailState({ mode: "closed" });
    if (galaxyExplorationState === "overview") setSelectionActive(false);
  }

  function handleGalaxyDiagnosticsOpenChange(open: boolean) {
    setGalaxyDiagnosticsOpen(open);
    setGalaxyDiagnosticsCopyStatus("idle");
    if (open) {
      setGalaxyPerformance(null);
      setGalaxyDiagnosticsResetNonce((value) => value + 1);
    }
  }

  function resetGalaxyDiagnostics() {
    setGalaxyPerformance(null);
    setGalaxyEvidencePerformance((current) => ({ ...current, cacheState: "idle", queryMs: 0 }));
    setGalaxyDiagnosticsCopyStatus("idle");
    setGalaxyDiagnosticsResetNonce((value) => value + 1);
  }

  async function copyGalaxyDiagnostics() {
    if (!galaxyPerformance || !navigator.clipboard) {
      setGalaxyDiagnosticsCopyStatus("failed");
      return;
    }
    try {
      await navigator.clipboard.writeText(formatGalaxyPerformanceSummary(galaxyPerformance, galaxyEvidencePerformance));
      setGalaxyDiagnosticsCopyStatus("copied");
    } catch {
      setGalaxyDiagnosticsCopyStatus("failed");
    }
  }

  useEffect(() => {
    if (!selectedId) {
      setSelectedId(filteredHotspots[0]?.id ?? "");
      return;
    }
    if (!filteredHotspots.some((hotspot) => hotspot.id === selectedId)) setSelectedId(filteredHotspots[0]?.id ?? "");
  }, [filteredHotspots, selectedId]);

  useEffect(() => {
    if (!visualReview || !visualReviewIntent || !visualReviewTargetHotspot || !app17Payload?.generatedAt) return;
    const automationKey = [
      app17Payload.generatedAt,
      visualReviewTargetHotspot.id,
      visualReviewIntent.stage,
      visualReviewIntent.paperId ?? "",
      visualReviewIntent.preset ?? "",
    ].join("::");
    if (visualReviewAutomationRef.current.key !== automationKey) {
      visualReviewAutomationRef.current = {
        key: automationKey,
        hotspotSelected: false,
        systemRequested: false,
        paperSelected: false,
        paperRequested: false,
      };
    }
    if (visualReviewAutomationRef.current.hotspotSelected) return;
    visualReviewAutomationRef.current.hotspotSelected = true;
    setField(visualReviewIntent.preset === "global"
      ? "all"
      : visualReviewTargetHotspot.field);
    setSelectedId(visualReviewTargetHotspot.id);
    setSelectionActive(
      visualReviewIntent.preset !== "global"
      && visualReviewIntent.preset !== "interwoven",
    );
  }, [app17Payload?.generatedAt, visualReview, visualReviewIntent, visualReviewTargetHotspot]);

  useEffect(() => {
    if (!visualReview || !visualReviewIntent || !visualReviewTargetHotspot) return;
    if (selected?.id !== visualReviewTargetHotspot.id || visualReviewIntent.stage === "overview") return;
    const automation = visualReviewAutomationRef.current;
    if (
      galaxyExplorationState === "overview"
      && !automation.systemRequested
      && (hotspotEvidenceStatus === "ready" || hotspotEvidenceStatus === "unavailable")
    ) {
      automation.systemRequested = true;
      commandCamera("enter-system");
      return;
    }
    if (visualReviewIntent.stage !== "paper" || galaxyExplorationState !== "system") return;
    const topicPoints = app17FilteredPayload?.papers.filter((paper) =>
      paper.field === visualReviewTargetHotspot.field && paper.topicId === visualReviewTargetHotspot.topicId) ?? [];
    const requestedPoint = visualReviewIntent.paperId
      ? topicPoints.find((paper) => paper.scopedPaperId === visualReviewIntent.paperId || paper.rawPaperId === visualReviewIntent.paperId)
      : undefined;
    const targetPaperId = requestedPoint?.scopedPaperId
      ?? representativeGalaxyPapers[0]?.id
      ?? topicPoints[0]?.scopedPaperId
      ?? "";
    if (!targetPaperId) return;
    if (!automation.paperSelected) {
      automation.paperSelected = true;
      setSelectedGalaxyPaperId(targetPaperId);
      return;
    }
    if (!automation.paperRequested && galaxyPaperFocusState === "idle") {
      automation.paperRequested = true;
      commandCamera("focus-paper");
    }
  }, [
    app17FilteredPayload,
    galaxyExplorationState,
    galaxyPaperFocusState,
    hotspotEvidenceStatus,
    representativeGalaxyPapers,
    selected?.id,
    selectedGalaxyPaperId,
    visualReview,
    visualReviewIntent,
    visualReviewTargetHotspot,
  ]);

  // Camera fitting is an explicit user action. Filtering and display/theory
  // layer swaps must not enqueue a second camera writer or replay the initial fit.

  useEffect(() => {
    if (!active) {
      setGalaxyContextRailState({ mode: "closed" });
      setGalaxyToolbarPopover("closed");
    }
  }, [active]);

  useEffect(() => {
    evidenceRequestSequenceRef.current += 1;
    evidenceCacheRef.current.clear();
    setHotspotEvidence(null);
    setHotspotEvidenceStatus("idle");
    setGalaxyEvidencePerformance({ cacheState: "idle", queryMs: 0, pendingQueries: evidencePendingRequestsRef.current.size });
  }, [activeProject.id, app17Payload?.generatedAt, settings.databaseDir]);

  useEffect(() => {
    const requestSequence = evidenceRequestSequenceRef.current + 1;
    evidenceRequestSequenceRef.current = requestSequence;
    if (!selected) {
      setHotspotEvidence(null);
      setHotspotEvidenceStatus("idle");
      setGalaxyEvidencePerformance((current) => ({ ...current, cacheState: "idle", queryMs: 0 }));
      return;
    }

    const cacheKey = app17EvidenceCacheKey(activeProject.id, selected.field, selected.topicId);
    const cached = readApp17EvidenceCache(evidenceCacheRef.current, cacheKey);
    if (cached) {
      setHotspotEvidence(cached);
      setHotspotEvidenceStatus("ready");
      setGalaxyEvidencePerformance((current) => ({ ...current, cacheState: "hit", queryMs: 0 }));
      return;
    }

    setHotspotEvidence(null);
    setHotspotEvidenceStatus("loading");
    setGalaxyEvidencePerformance((current) => ({ ...current, cacheState: "pending", queryMs: 0 }));
    const timeoutId = window.setTimeout(() => {
      const queryStartedAt = performance.now();
      evidencePendingRequestsRef.current.add(requestSequence);
      setGalaxyEvidencePerformance((current) => ({ ...current, cacheState: "miss", pendingQueries: evidencePendingRequestsRef.current.size }));
      void loadPersistedHotspotEvidence({
        databaseDir: settings.databaseDir,
        projectId: activeProject.id,
        hotspot: selected,
        hotspots: displayHotspots,
        requestSequence,
        maxPapers: 12,
        fetchPapersByIds: (ids) => getPapersByIds(settings.databaseDir, activeProject.id, ids),
      })
        .then((result) => {
          if (requestSequence !== evidenceRequestSequenceRef.current) return;
          const queryMs = performance.now() - queryStartedAt;
          const bundle = result.bundle;
          if (!bundle || result.status !== "ready" || bundle.selectedHotspotId !== selected.id) {
            setHotspotEvidence(null);
            setHotspotEvidenceStatus("unavailable");
            setGalaxyEvidencePerformance((current) => ({ ...current, cacheState: "error", queryMs }));
            return;
          }
          writeApp17EvidenceCache(evidenceCacheRef.current, cacheKey, bundle);
          setHotspotEvidence(bundle);
          setHotspotEvidenceStatus("ready");
          setGalaxyEvidencePerformance((current) => ({ ...current, cacheState: "miss", queryMs }));
        })
        .catch(() => {
          if (requestSequence !== evidenceRequestSequenceRef.current) return;
          setHotspotEvidence(null);
          setHotspotEvidenceStatus("unavailable");
          setGalaxyEvidencePerformance((current) => ({ ...current, cacheState: "error", queryMs: performance.now() - queryStartedAt }));
        })
        .finally(() => {
          evidencePendingRequestsRef.current.delete(requestSequence);
          setGalaxyEvidencePerformance((current) => ({ ...current, pendingQueries: evidencePendingRequestsRef.current.size }));
        });
    }, APP17_EVIDENCE_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [activeProject.id, app17Payload?.generatedAt, displayHotspots, selected, settings.databaseDir]);

  useEffect(() => {
    if (!galaxyFullscreen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setGalaxyFullscreen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [galaxyFullscreen]);

  useEffect(() => {
    if (navigationOpen) setGalaxyToolbarPopover("closed");
  }, [navigationOpen]);

  useEffect(() => {
    if (galaxyToolbarPopover === "closed") return undefined;
    const closePopover = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setGalaxyToolbarPopover("closed");
    };
    window.addEventListener("keydown", closePopover, true);
    return () => window.removeEventListener("keydown", closePopover, true);
  }, [galaxyToolbarPopover]);

  return (
    <div
      className={galaxyLayoutClassic ? "page-grid galaxy-layout-classic" : "galaxy-layout-immersive"}
      data-navigation-open={navigationOpen ? "true" : "false"}
      data-context-rail={galaxyContextRailMode}
    >
      {active && galaxyProductSpatialPresentation && titleBarToolsHost ? createPortal(
        <div ref={galaxyToolbarRef} className="galaxy-titlebar-tools" data-popover={galaxyToolbarPopover}>
          <GalaxyModeSwitch
            mode={visualMode}
            disabled={galaxyExplorationState !== "overview"}
            onChange={setVisualMode}
          />
          <button
            type="button"
            className="galaxy-titlebar-tool"
            aria-expanded={galaxyToolbarPopover === "filters"}
            onClick={() => setGalaxyToolbarPopover((current) => current === "filters" ? "closed" : "filters")}
          >
            <Search size={13} />
            <span>{field === "all" ? "全部学科" : field}</span>
            <strong>{visibleGalaxyHotspotCount}/{filteredHotspots.length}</strong>
          </button>
          <button type="button" className="galaxy-titlebar-tool" onClick={() => commandCamera("fit")}>适配全图</button>
          {galaxyExplorationState === "overview" && selectedNode ? (
            <button type="button" className="galaxy-titlebar-tool" onClick={() => { setSelectionActive(true); commandCamera("enter-system"); }}>进入热点</button>
          ) : galaxyExplorationState === "system" ? (
            galaxyPaperFocusState === "focused" ? (
              <button type="button" className="galaxy-titlebar-tool" onClick={() => commandCamera("return-system-center")}>返回系统</button>
            ) : (
              <button type="button" className="galaxy-titlebar-tool" onClick={() => commandCamera("exit-system")}>返回全图</button>
            )
          ) : galaxyExplorationState !== "overview" ? (
            <button type="button" className="galaxy-titlebar-tool" onClick={() => commandCamera("exit-system")}>取消过渡</button>
          ) : null}
          <button
            type="button"
            className="galaxy-titlebar-tool galaxy-titlebar-tool--icon"
            aria-label="更多星图工具"
            title="更多星图工具"
            aria-expanded={galaxyToolbarPopover === "more"}
            onClick={() => setGalaxyToolbarPopover((current) => current === "more" ? "closed" : "more")}
          >
            <MoreHorizontal size={15} />
          </button>
          {galaxyToolbarPopover === "more" ? (
            <div className="galaxy-titlebar-popover galaxy-titlebar-popover--more">
              <button type="button" onClick={() => void onRefreshApp17()} disabled={app17Loading}><RefreshCw size={14} />刷新星图数据</button>
              <button type="button" onClick={() => commandCamera("reset")}>重置视角</button>
              <button type="button" onClick={() => commandCamera("top")}>俯视图</button>
              <button type="button" onClick={() => setGalaxyToolbarPopover("filters")}>高级筛选与诊断</button>
              <div className="galaxy-titlebar-popover__divider" />
              <small>{visualMode === "nebula" ? "展示星图" : "理论星图"} · 粒子密度=论文数 · 核心亮度=置信度</small>
              <small>快照 {app17Payload?.snapshotId || "未载入"} · SQLite {libraryStatus ? formatBytes(libraryStatus.sizeBytes) : "loading"}</small>
            </div>
          ) : null}
        </div>,
        titleBarToolsHost,
      ) : null}
      {!galaxyLayoutClassic && galaxyToolbarPopover !== "closed" ? (
        <button
          type="button"
          className="galaxy-toolbar-popover-scrim"
          aria-label="关闭星图工具弹层"
          onClick={() => setGalaxyToolbarPopover("closed")}
        />
      ) : null}
      {galaxyLayoutClassic && (
        <header className="page-header">
          <div>
            <p className="eyebrow">Research Galaxy</p>
            {visualReview && (
              <div className="mb-3 mt-2 inline-flex items-center gap-2 rounded-[6px] border border-cyan/20 bg-cyan/[0.06] px-3 py-2 text-xs text-cyan/80">
                <Database size={13} />
                浏览器视觉快照 · 数据 {formatVisualReviewTimestamp(app17Payload?.generatedAt)} · 构建 {formatVisualReviewTimestamp(__BUILD_TIME__)} · {__BUILD_REVISION__}
              </div>
            )}
            <h1>科研星图</h1>
            <p className="page-subtitle">星图以锐利点阵、星场密度和克制的三色温体系呈现科研热点关系，避免大面积光晕和雾化发光团。</p>
          </div>
        </header>
      )}
      <section
        className={galaxyLayoutClassic ? "panel-card" : "galaxy-filter-bar galaxy-titlebar-filter-popover"}
        data-open={galaxyLayoutClassic || galaxyToolbarPopover === "filters" ? "true" : "false"}
        aria-hidden={!galaxyLayoutClassic && galaxyToolbarPopover !== "filters"}
      >
        <div className="galaxy-filter-expanded-content">
        {!galaxyLayoutClassic && (
          <div className="galaxy-filter-bar-title">
            <span className="eyebrow">Research Galaxy</span>
            <h2>科研星图</h2>
            {visualReview && (
              <span className="galaxy-filter-bar-review">
                <Database size={12} />
                快照 {formatVisualReviewTimestamp(app17Payload?.generatedAt)} · {__BUILD_REVISION__}
              </span>
            )}
          </div>
        )}
        <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
          <SelectControl className="h-10 text-sm" value={field} options={[{ value: "all", label: "全部学科" }, ...fields.map((item) => ({ value: item, label: item }))]} onChange={setField} />
          <div className="flex flex-wrap items-center justify-end gap-2 self-end">
            <div className="quiet-chip">画布 {visibleGalaxyHotspotCount} / {filteredHotspots.length} 个热点</div>
            <button
              type="button"
              className="secondary-action h-8 gap-1.5 px-3"
              disabled={app17Loading}
              onClick={() => void onRefreshApp17()}
              title="重新读取当前统一 V20 星图快照"
            >
              <RefreshCw className={app17Loading && app17Session.phase === "mysql" ? "animate-spin" : ""} size={14} />
              刷新星图数据
            </button>
          </div>
        </div>
        <details className="galaxy-filter-popover">
          <summary>筛选与诊断</summary>
          <div className="galaxy-filter-popover-content">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {app17Available ? (
            <span className="quiet-chip">V20 SQLite 快照：{(app17FilteredPayload?.paperCount ?? app17Payload?.paperCount ?? 0).toLocaleString()} 论文星 / {(app17FilteredPayload?.hotspotCount ?? app17Payload?.hotspotCount ?? 0).toLocaleString()} 热点</span>
          ) : (
            <>
              <span className="quiet-chip">{!v20SnapshotConsistent ? "正在同步 V20 快照，暂不渲染混合数据" : app17Loading ? galaxyLoadPhaseLabel(app17Session.phase) : "统一 V20 星图未就绪"}</span>
            </>
          )}
          {app17Notice && <span className="text-ink/45">{app17Notice}</span>}
          {app17Error && <span className="text-amber-100/75">{app17Error}</span>}
        </div>
        <FoldSection title="Advanced filters" compact>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="field-label text-xs">最少文献<input className="field-control h-9 px-3" type="number" min={1} value={minPaperCount} onChange={(event) => setMinPaperCount(Math.max(1, Number(event.target.value) || 1))} /></label>
            <label className="field-label text-xs">最低置信度<input className="field-control h-9 px-3" type="range" min={0} max={100} value={minConfidence} onChange={(event) => setMinConfidence(Number(event.target.value))} /></label>
          </div>
        </FoldSection>
        <FoldSection
          title="星图性能诊断"
          compact
          onOpenChange={handleGalaxyDiagnosticsOpenChange}
          right={galaxyDiagnosticsOpen && galaxyPerformance ? <span className="quiet-chip">{galaxyPerformance.currentFps.toFixed(0)} FPS</span> : undefined}
        >
          {galaxyPerformance ? (
            <>
              <dl className="galaxy-diagnostics-grid">
                <GalaxyDiagnosticMetric label="当前场景" value={galaxyPerformanceScenarioLabel(galaxyPerformance.scenario)} />
                <GalaxyDiagnosticMetric label="采样窗口" value={`${(galaxyPerformance.sampleDurationMs / 1_000).toFixed(1)} s · ${galaxyPerformance.fullscreen ? "全屏" : "窗口"}`} />
                <GalaxyDiagnosticMetric label="实时 / 平均 FPS" value={`${galaxyPerformance.currentFps.toFixed(1)} / ${galaxyPerformance.averageFps.toFixed(1)}`} />
                <GalaxyDiagnosticMetric label="平均 / P95 / 最大帧" value={`${formatPerformanceMs(galaxyPerformance.averageFrameMs)} / ${formatPerformanceMs(galaxyPerformance.p95FrameMs)} / ${formatPerformanceMs(galaxyPerformance.maxFrameMs)}`} />
                <GalaxyDiagnosticMetric label="WebGL / 标签耗时" value={`${formatPerformanceMs(galaxyPerformance.averageWebglMs)} / ${formatPerformanceMs(galaxyPerformance.averageLabelMs)}`} />
                <GalaxyDiagnosticMetric label="局部辉光 / 渐入" value={`${galaxyBloomModeLabel(galaxyPerformance.bloomEffectiveMode)} / ${Math.round(galaxyPerformance.bloomBlend * 100)}%`} />
                <GalaxyDiagnosticMetric label="Bloom 平均 / P95" value={`${formatPerformanceMs(galaxyPerformance.averageBloomMs)} / ${formatPerformanceMs(galaxyPerformance.p95BloomMs)}`} />
                <GalaxyDiagnosticMetric label="Bloom 阈值 / 强度 / 半径" value={`${galaxyPerformance.bloomThreshold.toFixed(2)} / ${galaxyPerformance.bloomStrength.toFixed(2)} / ${galaxyPerformance.bloomRadius.toFixed(2)}`} />
                <GalaxyDiagnosticMetric label="基础 / Bloom DPR" value={`${galaxyPerformance.pixelRatio.toFixed(2)} / ${galaxyPerformance.bloomBufferPixelRatio.toFixed(2)} · ${galaxyPerformance.bloomAvailable ? "可用" : "不可用"}`} />
                <GalaxyDiagnosticMetric
                  label={galaxyPerformance.ambientTargetFps > 0 || galaxyPerformance.environmentTargetFps > 0 ? "环境目标 / 节拍偏离" : "长帧 >50 / >100 ms"}
                  value={galaxyPerformance.ambientTargetFps > 0 || galaxyPerformance.environmentTargetFps > 0
                    ? `${Math.max(galaxyPerformance.ambientTargetFps, galaxyPerformance.environmentTargetFps)} FPS / ${galaxyPerformance.ambientCadenceMisses}`
                    : `${galaxyPerformance.longFrames50} / ${galaxyPerformance.longFrames100}`}
                />
                <GalaxyDiagnosticMetric label="Draw calls / 点" value={`${galaxyPerformance.drawCalls} / ${galaxyPerformance.renderedPoints.toLocaleString()}`} />
                <GalaxyDiagnosticMetric label="论文点 / 热点" value={`${galaxyPerformance.paperCount.toLocaleString()} / ${galaxyPerformance.hotspotCount.toLocaleString()}`} />
                <GalaxyDiagnosticMetric label="Geometry / Texture" value={`${galaxyPerformance.geometries} / ${galaxyPerformance.textures}`} />
                <GalaxyDiagnosticMetric label="画布 / DPR" value={`${galaxyPerformance.width}×${galaxyPerformance.height} / ${galaxyPerformance.pixelRatio.toFixed(2)}`} />
                <GalaxyDiagnosticMetric label="投影倍率" value={`${galaxyPerformance.projectionZoom.toFixed(2)}×`} />
                <GalaxyDiagnosticMetric label="深空源 球壳 / 视野估算" value={`${galaxyPerformance.environmentStarCount.toLocaleString()} / ${galaxyPerformance.environmentVisibleStarEstimate.toLocaleString()}`} />
                <GalaxyDiagnosticMetric label="深空源 微星 / 紧凑 / 锚点" value={`${galaxyPerformance.environmentMicroCount.toLocaleString()} / ${galaxyPerformance.environmentCompactCount.toLocaleString()} / ${galaxyPerformance.environmentAnchorCount.toLocaleString()}`} />
                <GalaxyDiagnosticMetric label="深空场动态" value={galaxyEnvironmentMotionLabel(galaxyPerformance.environmentMotion)} />
                <GalaxyDiagnosticMetric label="远景动态" value={galaxyAmbientMotionLabel(galaxyPerformance.ambientMotion)} />
                <GalaxyDiagnosticMetric label="选择到首帧" value={galaxyPerformance.selectionToFirstFrameMs > 0 ? formatPerformanceMs(galaxyPerformance.selectionToFirstFrameMs) : "待采样"} />
                <GalaxyDiagnosticMetric label="页面恢复到首帧" value={galaxyPerformance.resumeToFirstFrameMs > 0 ? formatPerformanceMs(galaxyPerformance.resumeToFirstFrameMs) : "待采样"} />
                <GalaxyDiagnosticMetric label="星系跃迁" value={galaxyPerformance.focusTransitionActive ? "进行中" : galaxyPerformance.focusTransitionMs > 0 ? formatPerformanceMs(galaxyPerformance.focusTransitionMs) : "待采样"} />
                <GalaxyDiagnosticMetric label="局部系统准备" value={galaxyPerformance.systemPrepareMs > 0 ? `${formatPerformanceMs(galaxyPerformance.systemPrepareMs)} · ${galaxyPerformance.systemCacheHit ? "缓存命中" : "新建"}` : galaxyPerformance.systemCacheHit ? "缓存命中" : "待采样"} />
                <GalaxyDiagnosticMetric label="局部视觉 / 主星批次" value={`${galaxyPerformance.systemVisualMode === "display" ? "展示图共面" : galaxyPerformance.systemVisualMode === "theory" ? "理论图三维" : "未进入"} / ${galaxyPerformance.systemStarDrawCalls}+${galaxyPerformance.systemStarBloomDrawCalls}`} />
                <GalaxyDiagnosticMetric label="运动论文 / 局部目标" value={`${galaxyPerformance.systemMovingPaperCount} / ${galaxyPerformance.systemTargetFps || 0} FPS`} />
                <GalaxyDiagnosticMetric label="主星直径 / 视口" value={galaxyPerformance.systemStarLod === "none" ? "未进入" : `${galaxyPerformance.systemStarProjectedDiameter.toFixed(1)} px / ${(galaxyPerformance.systemStarViewportRatio * 100).toFixed(1)}%`} />
                <GalaxyDiagnosticMetric label="LOD 混合 / 自转" value={galaxyPerformance.systemStarLod === "none" ? "未进入" : `${Math.round(galaxyPerformance.systemStarLodBlend * 100)}% / ${galaxyPerformance.systemStarRotationDegrees.toFixed(1)}° · ${galaxyPerformance.systemStarMotionActive ? "动态" : "冻结"}`} />
                <GalaxyDiagnosticMetric label="点光 / 光球 / 日冕" value={galaxyPerformance.systemStarLod === "none" ? "未进入" : `${Math.round(galaxyPerformance.systemStarFarCoreBlend * 100)}% / ${Math.round(galaxyPerformance.systemStarLodBlend * 100)}% / ${Math.round(galaxyPerformance.systemStarCoronaBlend * 100)}%`} />
                <GalaxyDiagnosticMetric label="表面细节 / 遮挡" value={galaxyPerformance.systemStarLod === "none" ? "未进入" : `${Math.round(galaxyPerformance.systemStarSurfaceDetailBlend * 100)}% / ${galaxyPerformance.systemStarDepthOcclusionActive ? "启用" : "等待近景"}`} />
                <GalaxyDiagnosticMetric label="表面辉光 / 日冕近景" value={galaxyPerformance.systemStarLod === "none" ? "未进入" : `${Math.round(galaxyPerformance.systemStarSurfaceBloomBlend * 100)}% / ${Math.round(galaxyPerformance.systemStarCoronaCloseupBlend * 100)}%`} />
                <GalaxyDiagnosticMetric label="全景 topic / 局部云" value={`${Math.round(galaxyPerformance.overviewSelectedTopicOpacity * 100)}% / ${Math.round(galaxyPerformance.systemCloudOpacity * 100)}%`} />
                <GalaxyDiagnosticMetric label="非选中论文 / 热点" value={`${Math.round(galaxyPerformance.systemNonSelectedPaperOpacity * 100)}% / ${Math.round(galaxyPerformance.systemNonSelectedHotspotOpacity * 100)}%`} />
                <GalaxyDiagnosticMetric label="进入位移 / 世界漂移" value={`${galaxyPerformance.systemEntryCameraTravelDistance.toFixed(3)} / ${galaxyPerformance.systemEntryNonSelectedWorldDrift.toExponential(2)}`} />
                <GalaxyDiagnosticMetric label="进入射线偏差 / 距离违规" value={`${galaxyPerformance.systemEntryCameraRayDeviation.toExponential(2)} / ${galaxyPerformance.systemEntryDistanceMonotonicViolations}`} />
                <GalaxyDiagnosticMetric label="入口尺度 / 重基准" value={`${galaxyPerformance.systemEntryScale.toFixed(6)} / ${galaxyPerformance.systemCanonicalRebaseCount}`} />
                <GalaxyDiagnosticMetric label="重基准像素 / 云直径比" value={`${galaxyPerformance.systemCanonicalRebaseProjectionDeltaPx.toFixed(3)} px / ${galaxyPerformance.systemEntryCloudDiameterRatio.toFixed(4)}`} />
                <GalaxyDiagnosticMetric label="远景热点 / 论文样本" value={`${galaxyPerformance.farBackgroundHotspotCount} / ${galaxyPerformance.farBackgroundPaperSampleCount}`} />
                <GalaxyDiagnosticMetric label="远景退远 / 交织淡入" value={`${galaxyPerformance.farBackgroundRetreatHotspotCount} / ${galaxyPerformance.farBackgroundCrossfadeHotspotCount}`} />
                <GalaxyDiagnosticMetric label="远景最近 / 最远半径" value={`${galaxyPerformance.farBackgroundNearestRadius.toFixed(2)} / ${galaxyPerformance.farBackgroundFarthestRadius.toFixed(2)}`} />
                <GalaxyDiagnosticMetric label="远景局部向量 / 重基准误差" value={`${galaxyPerformance.farBackgroundLocalOffsetError.toExponential(2)} / ${galaxyPerformance.farBackgroundRebaseProjectionDeltaPx.toFixed(3)} px`} />
                <GalaxyDiagnosticMetric label="中央遮罩可见代理" value={String(galaxyPerformance.farBackgroundCentralMaskVisibleCount)} />
                <GalaxyDiagnosticMetric label="远景论文 / 核心呼吸范围" value={`${(galaxyPerformance.farBackgroundPaperBrightnessMin * 100).toFixed(2)}–${(galaxyPerformance.farBackgroundPaperBrightnessMax * 100).toFixed(2)}% / ${(galaxyPerformance.farBackgroundHotspotCoreBrightnessMin * 100).toFixed(2)}–${(galaxyPerformance.farBackgroundHotspotCoreBrightnessMax * 100).toFixed(2)}%`} />
                <GalaxyDiagnosticMetric label="远景光晕呼吸范围" value={`${(galaxyPerformance.farBackgroundHotspotHaloBrightnessMin * 100).toFixed(2)}–${(galaxyPerformance.farBackgroundHotspotHaloBrightnessMax * 100).toFixed(2)}%`} />
                <GalaxyDiagnosticMetric label="真实概览可见 / 可拾取" value={`${galaxyPerformance.systemOverviewVisibleObjectCount} / ${galaxyPerformance.systemOverviewPickableObjectCount}`} />
                <GalaxyDiagnosticMetric label="理论初始视角" value={`${galaxyPerformance.theoryViewAzimuthDegrees.toFixed(1)}° / ${galaxyPerformance.theoryViewElevationDegrees.toFixed(1)}°${galaxyPerformance.theoryViewOptimized ? " · 优化" : " · 基线"}`} />
                <GalaxyDiagnosticMetric label="构图评分 / 改善" value={`${galaxyPerformance.theoryViewSelectedScore.toFixed(4)} / ${(galaxyPerformance.theoryViewImprovementRatio * 100).toFixed(1)}%`} />
                <GalaxyDiagnosticMetric label="唯一论文 / 去重" value={`${galaxyPerformance.systemUniquePaperCount.toLocaleString()} / ${galaxyPerformance.systemDuplicatePaperCount.toLocaleString()}`} />
                <GalaxyDiagnosticMetric label="隐藏代表 / 未匹配" value={`${galaxyPerformance.systemHiddenRepresentativeCount} / ${galaxyPerformance.systemUnresolvedRepresentativeCount}`} />
                <GalaxyDiagnosticMetric label="代表交接 所有权 / 外观" value={`${Math.round(galaxyPerformance.representativeOwnershipBlend * 100)}% / ${Math.round(galaxyPerformance.representativeStyleBlend * 100)}%`} />
                <GalaxyDiagnosticMetric label="代表交接 轨道 / 运动" value={`${Math.round(galaxyPerformance.representativeOrbitReveal * 100)}% / ${Math.round(galaxyPerformance.representativeOrbitMotionBlend * 100)}%`} />
                <GalaxyDiagnosticMetric label="语义轨道 / 交接投影" value={`${galaxyPerformance.representativeSemanticOrbitError.toExponential(2)} / ${galaxyPerformance.representativeHandoffProjectionDeltaPx.toFixed(3)} px`} />
                <GalaxyDiagnosticMetric label="安全轨道 / 最大亮度步进" value={`${galaxyPerformance.representativeSafeOrbitCaptureCount} / ${galaxyPerformance.representativeMaxLuminanceStep.toFixed(4)}`} />
                <GalaxyDiagnosticMetric label="论文星 LOD / 混合" value={`${galaxySystemPaperLodLabel(galaxyPerformance.systemPaperLod)} / ${Math.round(galaxyPerformance.systemPaperLodBlend * 100)}%`} />
                <GalaxyDiagnosticMetric label="普通论文星尺寸" value={galaxyPerformance.systemPaperLod === "none" ? "未进入" : `${galaxyPerformance.systemPaperMinPointSize.toFixed(2)}–${galaxyPerformance.systemPaperMaxPointSize.toFixed(2)} px`} />
                <GalaxyDiagnosticMetric label="论文云显现 / 曝光" value={`${Math.round(galaxyPerformance.systemPaperRevealProgress * 100)}% / ${galaxyPerformance.systemPaperExposure.toFixed(2)}×（目标 ${galaxyPerformance.systemPaperTargetExposure.toFixed(2)}×）`} />
                <GalaxyDiagnosticMetric label="论文云深层亮度 / 尺寸" value={`${Math.round(galaxyPerformance.systemPaperDepthBrightnessFloor * 100)}% / ${Math.round(galaxyPerformance.systemPaperDepthSizeFloor * 100)}%`} />
                <GalaxyDiagnosticMetric label="代表论文焦点" value={`${galaxySystemPaperFocusLabel(galaxyPerformance.systemRepresentativeFocusMode)} / ${galaxyPerformance.systemRepresentativeFocusRank >= 0 ? `#${galaxyPerformance.systemRepresentativeFocusRank + 1}` : "无"} / ${Math.round(galaxyPerformance.systemRepresentativeDimFactor * 100)}%`} />
                <GalaxyDiagnosticMetric label="代表论文局部辉光" value={galaxyPerformance.systemRepresentativeBloomActive ? "启用" : "关闭"} />
                <GalaxyDiagnosticMetric label="论文拾取 当前 / P95 / 候选" value={`${formatPerformanceMs(galaxyPerformance.systemPaperPickMs)} / ${formatPerformanceMs(galaxyPerformance.systemPaperPickP95Ms)} / ${galaxyPerformance.systemPaperPickCandidateCount}`} />
                <GalaxyDiagnosticMetric label="当前论文 / 详情缓存" value={`${galaxyPerformance.systemSelectedPaperType === "representative" ? "代表论文" : galaxyPerformance.systemSelectedPaperType === "ordinary" ? "普通论文" : "未选择"} / ${galaxyPaperDetailCacheStateLabel(galaxyPerformance.systemPaperDetailCacheState)}`} />
                <GalaxyDiagnosticMetric label="论文详情查询" value={galaxyPerformance.systemPaperDetailQueryMs > 0 ? formatPerformanceMs(galaxyPerformance.systemPaperDetailQueryMs) : "未查询"} />
                <GalaxyDiagnosticMetric label="论文旅程 / 进度 / 路径" value={`${galaxyPerformance.systemPaperJourneyState} / ${Math.round(galaxyPerformance.systemPaperJourneyProgress * 100)}% / ${galaxyPerformance.systemPaperJourneyPathMode}`} />
                <GalaxyDiagnosticMetric label="兼容飞行状态 / 补间" value={`${galaxyPaperFocusStateLabel(galaxyPerformance.systemPaperFocusState)} / ${galaxyPerformance.systemPaperFocusTransitionMs > 0 ? formatPerformanceMs(galaxyPerformance.systemPaperFocusTransitionMs) : "未执行"}`} />
                <GalaxyDiagnosticMetric label="起始 / 目标距离 / 目标尺寸" value={`${galaxyPerformance.systemPaperFocusStartDistance > 0 ? galaxyPerformance.systemPaperFocusStartDistance.toFixed(2) : "-"} / ${galaxyPerformance.systemPaperFocusTargetDistance > 0 ? galaxyPerformance.systemPaperFocusTargetDistance.toFixed(2) : "-"} / ${galaxyPerformance.systemPaperFocusTargetScreenSize > 0 ? `${galaxyPerformance.systemPaperFocusTargetScreenSize.toFixed(1)} px` : "-"}`} />
                <GalaxyDiagnosticMetric label="相机真实位移 / 到目标 / 投影直径" value={`${galaxyPerformance.systemPaperCameraTravelDistance.toFixed(3)} / ${galaxyPerformance.systemPaperCameraDistanceToTarget.toFixed(3)} / ${galaxyPerformance.systemPaperProjectedTargetDiameter.toFixed(2)} px`} />
                <GalaxyDiagnosticMetric label="目标坐标漂移 / 平滑延长" value={`${galaxyPerformance.systemPaperTargetWorldPositionDrift.toExponential(2)} / ${formatPerformanceMs(galaxyPerformance.systemPaperSmoothnessExtensionMs)}`} />
                <GalaxyDiagnosticMetric label="返回位置 / 角度误差" value={`${galaxyPerformance.systemPaperReturnPositionError.toExponential(2)} / ${galaxyPerformance.systemPaperReturnAngleErrorDegrees.toFixed(4)}°`} />
                <GalaxyDiagnosticMetric label="主星最小净空 / 视锥 / 绘制" value={`${galaxyPerformance.systemPaperMinimumStarClearance.toFixed(3)} / ${galaxyPerformance.systemPaperStarInFrustum ? "视锥内" : "视锥外"} / ${galaxyPerformance.systemPaperStarDrawCalls}`} />
                <GalaxyDiagnosticMetric label="主体目标 / 实际直径" value={`${galaxyPerformance.systemPaperTargetBodyDiameterPx.toFixed(1)} px / ${galaxyPerformance.systemPaperActualBodyDiameterPx.toFixed(1)} px`} />
                <GalaxyDiagnosticMetric label="代表载体 / 主星退出边距" value={`${(galaxyPerformance.systemPaperRepresentativeCarrierRatio * 100).toFixed(1)}% / ${galaxyPerformance.systemPaperEndpointStarExitMarginPx.toFixed(1)} px`} />
                <GalaxyDiagnosticMetric label="终点候选 / 方向偏转 / 拒绝" value={`${galaxyPerformance.systemPaperEndpointCandidateCount} / ${galaxyPerformance.systemPaperEndpointDirectionDeviationDegrees.toFixed(1)}° / ${galaxyPerformance.systemPaperEndpointCompositionRejected ? "是" : "否"}`} />
                <GalaxyDiagnosticMetric label="邻域 / 远景亮度" value={`${Math.round(galaxyPerformance.systemPaperFocusNeighborBrightness * 100)}% / ${Math.round(galaxyPerformance.systemPaperFocusContextBrightness * 100)}%${galaxyPerformance.systemPaperFocusCanceled ? " · 已取消" : ""}`} />
                <GalaxyDiagnosticMetric label="论文阅读空间" value={`${galaxyPaperInspectionModeLabel(galaxyPerformance.systemPaperInspectionMode)} / ${galaxyPerformance.systemPaperInspectionVisualType === "energy-core" ? "能量光核" : galaxyPerformance.systemPaperInspectionVisualType === "data-sphere" ? "数据球" : "未建立"} / ${Math.round(galaxyPerformance.systemPaperInspectionBlend * 100)}%`} />
                <GalaxyDiagnosticMetric label="停靠 / 球面 / 批次" value={`${Math.round(galaxyPerformance.systemPaperInspectionDockBlend * 100)}% / ${galaxyPerformance.systemPaperInspectionDiameter > 0 ? `${galaxyPerformance.systemPaperInspectionDiameter.toFixed(1)} px` : "-"} / ${galaxyPerformance.systemPaperInspectionDrawCalls}`} />
                <GalaxyDiagnosticMetric label="详情面板 / 进度" value={`${galaxyPerformance.systemPaperPanelState === "hidden" ? "隐藏" : galaxyPerformance.systemPaperPanelState === "staged" ? "待显现" : galaxyPerformance.systemPaperPanelState === "entering" ? "进入" : galaxyPerformance.systemPaperPanelState === "visible" ? "可见" : "退出"} / ${Math.round(galaxyPerformance.systemPaperPanelProgress * 100)}%`} />
                <GalaxyDiagnosticMetric label="面板标题 / 正文" value={`${Math.round(galaxyPerformance.systemPaperPanelHeaderProgress * 100)}% / ${Math.round(galaxyPerformance.systemPaperPanelBodyProgress * 100)}%`} />
                <GalaxyDiagnosticMetric label="阅读锚点 / 偏差" value={`${galaxyPerformance.systemPaperTargetAnchorX.toFixed(2)} / ${galaxyPerformance.systemPaperAnchorErrorPx.toFixed(1)} px`} />
                <GalaxyDiagnosticMetric label="相机写入源 / 返回反转" value={`${galaxyPerformance.systemPaperCameraWriter} / ${galaxyPerformance.systemPaperReturnHorizontalReversals}`} />
                <GalaxyDiagnosticMetric label="相机切换 / 四元数 / 锚点位移" value={`${galaxyPerformance.systemPaperCameraWriterChanges} / ${galaxyPerformance.systemPaperQuaternionDeltaDegrees.toFixed(3)}° / ${galaxyPerformance.systemPaperAnchorDeltaPx.toFixed(2)}px`} />
                <GalaxyDiagnosticMetric label="论文视觉所有权 / 专用对象" value={`${galaxyPerformance.systemPaperVisualOwnerState} / ${Math.round(galaxyPerformance.systemPaperVisualOwnerOpacity * 100)}%`} />
                <GalaxyDiagnosticMetric label="紧凑 / 近景 LOD / 可见能量" value={`${Math.round(galaxyPerformance.systemPaperVisualCompactLod * 100)}% / ${galaxyPerformance.systemPaperVisibleEnergyRatio.toFixed(2)}×`} />
                <GalaxyDiagnosticMetric label="光学尺寸 Point / 专用对象" value={`${galaxyPerformance.systemPaperHandoffPointDiameter.toFixed(1)}px / ${galaxyPerformance.systemPaperHandoffCloseupDiameter.toFixed(1)}px`} />
                <GalaxyDiagnosticMetric label="光学重心差" value={`${galaxyPerformance.systemPaperHandoffPositionDeltaPx.toFixed(2)}px`} />
                <GalaxyDiagnosticMetric label="视觉所有权 Point / 专用对象 / 总和" value={`${galaxyPerformance.systemPaperHandoffPointAlpha.toFixed(3)} / ${galaxyPerformance.systemPaperHandoffCloseupAlpha.toFixed(3)} / ${galaxyPerformance.systemPaperHandoffAlphaSum.toFixed(3)}`} />
                <GalaxyDiagnosticMetric label="代表能量核 / 近景辉光" value={`${galaxyPerformance.systemRepresentativeEnergyCoreDrawCalls} / ${galaxyPerformance.systemPaperInspectionBloomDrawCalls}`} />
                <GalaxyDiagnosticMetric label="能量核细节 / Bloom / 能量丝" value={`${Math.round(galaxyPerformance.systemRepresentativeEnergyDetailBlend * 100)}% / ${Math.round(galaxyPerformance.systemRepresentativeEnergyBloomOpacity * 100)}% / ${galaxyPerformance.systemRepresentativeEnergyWispCount}`} />
                <GalaxyDiagnosticMetric label="能量核承载范围" value={`${galaxyPerformance.systemRepresentativeEnergyCarrierScale.toFixed(2)}×`} />
                <GalaxyDiagnosticMetric label="近景压缩 / 可见半径 / 轨道" value={`${Math.round(galaxyPerformance.systemRepresentativeEnergyCloseupCompactness * 100)}% / ${Math.round(galaxyPerformance.systemRepresentativeEnergyVisibleRadius * 100)}% / ${Math.round(galaxyPerformance.systemRepresentativeEnergyOrbitAttenuation * 100)}%`} />
                <GalaxyDiagnosticMetric label="星核主体 / LOD" value={`${galaxyPerformance.systemRepresentativeEnergyBodyCoreDiameter.toFixed(1)}px / ${Math.round(galaxyPerformance.systemRepresentativeEnergyBodyCoreBlend * 100)}%`} />
                <GalaxyDiagnosticMetric label="白热中心 / Fresnel / 外晕" value={`${galaxyPerformance.systemRepresentativeEnergyMicroCoreDiameter.toFixed(1)}px / ${galaxyPerformance.systemRepresentativeEnergyFresnelWidth.toFixed(1)}px / ${galaxyPerformance.systemRepresentativeEnergyOuterGlowDiameter.toFixed(1)}px`} />
                <GalaxyDiagnosticMetric label="外晕径向衰减" value={galaxyPerformance.systemRepresentativeEnergyOuterGlowMonotonic ? "单调" : "异常"} />
                <GalaxyDiagnosticMetric label="软核心 / 光球亮度 / Bloom" value={`${Math.round(galaxyPerformance.systemRepresentativeEnergySoftCoreAttenuation * 100)}% / ${Math.round(galaxyPerformance.systemRepresentativeEnergyMicroCoreBrightness * 100)}% / ${Math.round(galaxyPerformance.systemRepresentativeEnergyBloomOpacity * 100)}%`} />
                <GalaxyDiagnosticMetric label="论文角尺寸 / 帧增长" value={`${(galaxyPerformance.systemPaperAngularSizeRatio * 100).toFixed(1)}% / ${formatSignedPercent(galaxyPerformance.systemPaperAngularGrowthRatio)}`} />
                <GalaxyDiagnosticMetric label="论文直飞路径 / 距离" value={`${galaxyPerformance.systemPaperFlightPathMode === "avoidance" ? "避障" : galaxyPerformance.systemPaperFlightPathMode === "direct" ? "直飞" : "未执行"} / ${galaxyPerformance.systemPaperCameraDistance > 0 ? galaxyPerformance.systemPaperCameraDistance.toFixed(3) : "-"}`} />
                <GalaxyDiagnosticMetric label="中心偏差 / 主星净空" value={`${galaxyPerformance.systemPaperCenterErrorPx.toFixed(1)} px / ${galaxyPerformance.systemPaperStarClearance.toFixed(3)}`} />
                <GalaxyDiagnosticMetric label="代表资源 准备 / 提交" value={`${formatPerformanceMs(galaxyPerformance.representativePrepareMs)} / ${formatPerformanceMs(galaxyPerformance.representativeCommitMs)}`} />
                <GalaxyDiagnosticMetric label="滚轮输入 / 距离" value={`${galaxyPerformance.lastNormalizedWheelDelta.toFixed(1)} / ${formatSignedPercent(galaxyPerformance.lastWheelDistanceRatio)}`} />
                <GalaxyDiagnosticMetric label="跃迁 P95 / >50ms" value={`${formatPerformanceMs(galaxyPerformance.transitionP95Ms)} / ${galaxyPerformance.transitionLongFrames50}`} />
                <GalaxyDiagnosticMetric label="跃迁末段 P95 / >50ms" value={`${formatPerformanceMs(galaxyPerformance.transitionTailP95Ms)} / ${galaxyPerformance.transitionTailLongFrames50}`} />
                <GalaxyDiagnosticMetric label="末段 Resize / 顶部 / scrollY" value={`${galaxyPerformance.transitionCanvasResizeCount} / ${galaxyPerformance.transitionCanvasTopDelta.toFixed(1)} px / ${galaxyPerformance.transitionScrollDelta.toFixed(1)} px`} />
                <GalaxyDiagnosticMetric label="证据查询" value={galaxyEvidencePerformance.queryMs > 0 ? formatPerformanceMs(galaxyEvidencePerformance.queryMs) : "未查询"} />
                <GalaxyDiagnosticMetric label="证据缓存 / 待处理" value={`${galaxyEvidenceCacheStateLabel(galaxyEvidencePerformance.cacheState)} / ${galaxyEvidencePerformance.pendingQueries}`} />
                <GalaxyDiagnosticMetric label="证据延迟应用" value={galaxyPerformance.evidenceUpdateDeferred ? "等待跃迁完成" : "无"} />
                <GalaxyDiagnosticMetric className="md:col-span-2" label="WebGL Renderer" value={galaxyPerformance.gpuRenderer} />
                <GalaxyDiagnosticMetric className="md:col-span-2" label="WebGL Vendor" value={galaxyPerformance.gpuVendor} />
              </dl>
              {galaxyPerformance.bloomEffectiveMode !== "none" && galaxyPerformance.p95BloomMs > 33 && (
                <div className="mt-3 rounded-[6px] border border-warning/25 bg-warning/5 px-3 py-2 text-xs text-warning">
                  局部辉光 P95 为 {formatPerformanceMs(galaxyPerformance.p95BloomMs)}，已超过 33 ms 目标；基础画面仍保持完整，可在后续调低离屏分辨率。
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className="secondary-action h-8 gap-1.5 px-3" onClick={resetGalaxyDiagnostics}><RefreshCw size={14} />重置样本</button>
                <button type="button" className="secondary-action h-8 gap-1.5 px-3" onClick={() => void copyGalaxyDiagnostics()}><Copy size={14} />{galaxyDiagnosticsCopyStatus === "copied" ? "已复制" : galaxyDiagnosticsCopyStatus === "failed" ? "复制失败" : "复制摘要"}</button>
              </div>
            </>
          ) : (
            <div className="py-2 text-xs text-ink/45">正在采集性能样本…</div>
          )}
        </FoldSection>
          </div>
        </details>
        </div>
      </section>
      <section className={`galaxy-workspace-grid grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px] ${galaxyPaperInspectionMode === "centered" ? "galaxy-workspace-paper-centered" : ""}`}>
        <div className={`galaxy-panel galaxy-panel-3d ${galaxyFullscreen ? "galaxy-panel-fullscreen" : ""} ${visualReviewCapture ? "galaxy-panel-review-capture" : ""} ${galaxyPaperPanelState !== "hidden" && galaxyPaperPanelState !== "staged" && galaxyPaperInspectionMode !== "centered" ? "galaxy-panel-paper-docked" : galaxyPaperInspectionMode === "centered" ? "galaxy-panel-paper-centered" : ""}`}>
          <div className={`galaxy-stage galaxy-stage-3d galaxy-stage-reference galaxy-stage-${visualMode}`}>
            {active && app17FilteredPayload?.ready ? (
              <App17GalaxyCanvas
                active={active}
                payload={app17FilteredPayload}
                farBackgroundPayload={app17Payload?.ready ? app17Payload : app17FilteredPayload}
                selectedId={activeSelectedId}
                visualMode={visualMode}
                reviewCameraPreset={visualReviewIntent?.preset}
                initialCameraPose={galaxyCameraPose}
                onCameraPoseChange={setGalaxyCameraPose}
                contextRailMode={galaxyContextRailMode as GalaxyContextRailMode}
                command={cameraCommand}
                representativePapers={representativeGalaxyPapers}
                selectedPaperId={selectedGalaxyPaperId}
                selectedPaperVisual={selectedGalaxyPaperVisual}
                paperDetailQueryMs={galaxyPaperDetailPerformance.queryMs}
                paperDetailCacheState={galaxyPaperDetailPerformance.cacheState}
                diagnosticsResetNonce={galaxyDiagnosticsResetNonce}
                fullscreen={galaxyPresentationFullscreen}
                onPerformanceSnapshot={active && galaxyDiagnosticsOpen ? setGalaxyPerformance : undefined}
                onSelect={selectGalaxyHotspot}
                onSelectPaper={(paperId) => {
                  setSelectedGalaxyPaperId(paperId);
                  if (selected) setGalaxyContextRailState({ mode: "paper-summary", hotspotId: selected.id, paperId });
                }}
                onExplorationStateChange={(state) => {
                  setGalaxyExplorationState(state);
                  if (state === "overview") {
                    setSelectedGalaxyPaperId("");
                    setGalaxySystemViewMode("system");
                    setGalaxyPaperFocusState("idle");
                    setGalaxyPaperInspectionMode("none");
                    setGalaxyPaperPanelState("hidden");
                    setGalaxyFocusedPaperId("");
                    setGalaxyContextRailState(selectionActive && selected
                      ? { mode: "hotspot", hotspotId: selected.id }
                      : { mode: "closed" });
                  }
                }}
                onSystemViewModeChange={setGalaxySystemViewMode}
                onPaperFocusStateChange={(state, paperId) => {
                  setGalaxyPaperFocusState(state);
                  setGalaxyFocusedPaperId(paperId);
                  if (state === "entering" && selected && paperId) {
                    setGalaxyContextRailState({ mode: "paper-reading", hotspotId: selected.id, paperId });
                  } else if (state === "exiting" && selected) {
                    setGalaxyContextRailState({ mode: "hotspot", hotspotId: selected.id });
                  } else if (state === "idle") {
                    setGalaxyPaperInspectionMode("none");
                    setGalaxyPaperPanelState("hidden");
                    setGalaxyContextRailState(selected
                      ? { mode: "hotspot", hotspotId: selected.id }
                      : { mode: "closed" });
                  }
                }}
                onPaperInspectionModeChange={(mode) => {
                  setGalaxyPaperInspectionMode(mode);
                  if (mode === "centered" && selected && selectedGalaxyPaperId) {
                    setGalaxyContextRailState({ mode: "paper-summary", hotspotId: selected.id, paperId: selectedGalaxyPaperId });
                  } else if (mode === "docked" && selected && selectedGalaxyPaperId) {
                    setGalaxyContextRailState({ mode: "paper-reading", hotspotId: selected.id, paperId: selectedGalaxyPaperId });
                  }
                }}
                onPaperPanelStateChange={(state) => {
                  setGalaxyPaperPanelState(state);
                  if (
                    (state === "entering" || state === "visible")
                    && galaxyPaperInspectionMode !== "centered"
                    && selected
                    && selectedGalaxyPaperId
                  ) {
                    setGalaxyContextRailState({ mode: "paper-reading", hotspotId: selected.id, paperId: selectedGalaxyPaperId });
                  }
                }}
                onClearSelection={() => {
                  setSelectionActive(false);
                  setGalaxyContextRailState({ mode: "closed" });
                }}
              />
            ) : (
              <div className="absolute inset-0 z-[3] flex items-center justify-center px-6 text-center">
                <div className="max-w-xl rounded-[8px] border border-white/10 bg-black/45 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.35)]">
                  <p className="eyebrow">{app17Loading ? "Loading V20 Snapshot" : "V20 Snapshot Required"}</p>
                  <h2 className="mt-2 text-xl font-semibold text-ink">{app17Loading ? "正在读取统一 V20 星图快照" : "需要生成统一星图快照"}</h2>
                  <p className="mt-3 text-sm leading-6 text-ink/55">{app17Error || app17Notice || "页面不会自动聚类。请前往分析流水线显式运行热点建模。"}</p>
                  {!app17Loading && <button type="button" className="primary-action mt-4" onClick={onOpenPipeline}>前往热点建模</button>}
                </div>
              </div>
            )}
            {galaxyLayoutClassic ? <div className="galaxy-hud">
              <GalaxyModeSwitch
                mode={visualMode}
                disabled={galaxyExplorationState !== "overview"}
                onChange={(nextMode) => {
                  setVisualMode(nextMode);
                }}
              />
              {galaxyExplorationState === "overview" ? (
                <>
                  <button className="secondary-action galaxy-view-tool galaxy-view-tool--secondary h-8 px-3" onClick={() => commandCamera("reset")}>重置视角</button>
                  <button className="secondary-action galaxy-view-tool h-8 px-3" onClick={() => commandCamera("fit")}>适配全图</button>
                  <button className="secondary-action galaxy-view-tool galaxy-view-tool--secondary h-8 px-3" onClick={() => commandCamera("top")}>俯视图</button>
                  {selectedNode && <button className="secondary-action galaxy-focus-action h-8 px-3" onClick={() => { setSelectionActive(true); commandCamera("enter-system"); }}>进入热点星系</button>}
                </>
              ) : galaxyExplorationState === "system" ? (
                <>
                  <span className="galaxy-system-mode-label">热点星系</span>
                  {galaxyPaperFocusState === "entering" ? (
                    <button className="secondary-action h-8 px-3" onClick={() => commandCamera("return-system-center")}>取消靠近</button>
                  ) : galaxyPaperFocusState === "exiting" ? (
                    <button className="secondary-action h-8 px-3" disabled>正在返回…</button>
                  ) : galaxyPaperFocusState === "focused" && selectedGalaxyPaperId === galaxyFocusedPaperId ? (
                    <>
                      <button className="secondary-action h-8 gap-1.5 px-3" onClick={() => commandCamera("toggle-paper-inspection")}>
                        {galaxyPaperInspectionMode === "centered" ? <><ArrowRight size={14} />展开详情</> : <><LocateFixed size={14} />居中观察</>}
                      </button>
                      <button className="secondary-action h-8 px-3" onClick={() => commandCamera("return-system-center")}>返回系统中心</button>
                    </>
                  ) : galaxyPresentationFullscreen && selectedGalaxyPaperId ? (
                    <button className="secondary-action h-8 gap-1.5 px-3" onClick={() => commandCamera("focus-paper")}><LocateFixed size={14} />靠近论文</button>
                  ) : null}
                  {galaxyPaperFocusState === "focused" && selectedGalaxyPaperId !== galaxyFocusedPaperId && (
                    <button className="secondary-action h-8 px-3" onClick={() => commandCamera("return-system-center")}>返回系统中心</button>
                  )}
                  <button className="secondary-action galaxy-view-tool--secondary h-8 px-3" onClick={() => commandCamera("reset-system")}>重置系统视角</button>
                  <button className="secondary-action h-8 px-3" onClick={() => commandCamera("exit-system")}>返回全图</button>
                </>
              ) : (
                <>
                  <span className="galaxy-system-mode-label">
                    {galaxyExplorationState === "preparing" ? "正在准备热点星系" : galaxyExplorationState === "entering" ? "正在飞入" : "正在返回"}
                  </span>
                  <button className="secondary-action h-8 px-3" onClick={() => commandCamera("exit-system")}>
                    {galaxyExplorationState === "preparing" ? "取消准备" : galaxyExplorationState === "entering" ? "取消进入" : "返回中…"}
                  </button>
                </>
              )}
              {import.meta.env.DEV && (visualReview || galaxyLayoutClassic) ? (
                <button
                  className="secondary-action h-8 px-3"
                  data-galaxy-fullscreen-toggle
                  onClick={() => setGalaxyFullscreen((value) => !value)}
                  disabled={galaxyPaperFocusState === "entering" || galaxyPaperFocusState === "exiting"}
                  aria-pressed={galaxyFullscreen}
                  title={galaxyFullscreen ? "退出星图全屏" : "星图全屏"}
                >
                  {galaxyFullscreen ? "退出全屏" : "全屏"}
                </button>
              ) : null}
              {import.meta.env.DEV && visualReview ? (
                <button
                  className="secondary-action h-8 px-3"
                  onClick={() => setGalaxyLayoutClassic((value) => !value)}
                  aria-pressed={galaxyLayoutClassic}
                  title={galaxyLayoutClassic ? "切换到沉浸布局：星图铺满窗口" : "开发回归：切换到经典布局"}
                >
                  {galaxyLayoutClassic ? "沉浸布局" : "经典布局"}
                </button>
              ) : null}
            </div> : null}
            {galaxyLayoutClassic ? <div className="galaxy-legend" data-collapsed={navigationOpen ? "true" : "false"}>
              {navigationOpen ? <button type="button" className="galaxy-legend-collapsed">图例</button> : null}
              <div className="galaxy-legend-content">
              {galaxyExplorationState === "overview" ? (
                <>
                  <span>{visualMode === "nebula" ? "展示星图" : "理论星图"}</span>
                  <span>粒子密度=论文数</span>
                  <span>核心亮度=置信度</span>
                  <span>色系=学科 · 呼吸=趋势</span>
                </>
              ) : (
                <>
                  <span>热点星系</span>
                  <span>{visualMode === "nebula" ? "代表轨道=共面" : "代表轨道=三维倾斜"}</span>
                  <span title="能量光核只用于区分前十篇代表论文，不表示引用量、影响力或真实能量">代表论文=能量光核</span>
                  <span>论文星大小=代表顺序</span>
                  <span>色温=年份 · 轨道色=来源</span>
                  <span title="轨道和极慢公转仅用于区分代表论文，不表示真实时间演化或引用关系">
                    {visualMode === "nebula" ? "轨道=代表性排序" : "轨道=语义原位成轨"}
                  </span>
                  <span title="日冕、磁场弧线和 Bloom 仅用于增强空间与能量层次，不表示额外科研数据">辉光=视觉增强</span>
                </>
              )}
              </div>
            </div> : null}
            {galaxyLayoutClassic && <div className="galaxy-evidence-card" tabIndex={0} aria-label={selected ? `当前证据链：${selected.title}` : "星图筛选摘要"}>
              {selected ? (
                <>
                  <div className="galaxy-evidence-summary">
                    <span className="galaxy-evidence-summary-title">{selected.title}</span>
                    <span>{selected.paperCount} 篇</span>
                    <span>{representativeIds.length} 代表</span>
                  </div>
                  <div className="galaxy-evidence-expanded">
                    <div className="galaxy-evidence-kicker">当前证据链</div>
                    <div className="galaxy-evidence-title">{selected.title}</div>
                    <div className="galaxy-evidence-meta">
                      <span>{selected.paperCount} 篇文献</span>
                      <span>{representativeIds.length} 篇代表论文</span>
                      <span>{hotspotEvidenceStatusLabel(hotspotEvidenceStatus)}</span>
                      <span>{selectedLinks.length} 条语义连接</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button className="secondary-action h-8 px-3" onClick={() => onOpenPaperList(selected)}>追溯论文</button>
                      {selectedNode && galaxyExplorationState === "overview" && <button className="secondary-action galaxy-focus-action h-8 px-3" onClick={() => { setSelectionActive(true); commandCamera("enter-system"); }}>进入热点星系</button>}
                      {galaxyExplorationState === "system" && <button className="secondary-action h-8 px-3" onClick={() => commandCamera("exit-system")}>返回全图</button>}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="galaxy-evidence-summary">
                    <span className="galaxy-evidence-summary-title">{filteredHotspots.length} 个热点</span>
                    <span>{galaxyPaperCount.toLocaleString()} 篇</span>
                    <span>{field === "all" ? "全部学科" : field}</span>
                  </div>
                  <div className="galaxy-evidence-expanded">
                    <div className="galaxy-evidence-kicker">星图筛选</div>
                    <div className="galaxy-evidence-title">{filteredHotspots.length} 个热点 · {galaxyPaperCount.toLocaleString()} 篇文献</div>
                    <div className="galaxy-evidence-meta">
                      <span>{field === "all" ? "全部学科" : field}</span>
                      <span>{galaxyLayoutOptions.find((item) => item.id === layoutMode)?.label}</span>
                      <span>置信度 ≥ {minConfidence}%</span>
                    </div>
                  </div>
                </>
              )}
            </div>}
          </div>
        </div>
        <aside
          className={`panel-card galaxy-inspector ${galaxyContextRailMode === "paper-reading" ? `galaxy-inspector-paper-reading ${galaxyPaperInspectorClass(galaxyPaperPanelState)}` : ""}`}
          data-open={galaxyInspectorOpen}
          data-mode={galaxyContextRailMode}
        >
          {galaxyInspectorOpen && (
            <button type="button" className="galaxy-context-rail-close" onClick={closeGalaxyContextRail} aria-label="关闭详情"><X size={16} /></button>
          )}
          {galaxyContextRailMode === "paper-reading" && selectedGalaxyPaperId ? (
            <GalaxyPaperReadingPanel
              paper={selectedGalaxyPaper}
              paperId={selectedGalaxyPaperId}
              fallbackYear={selectedGalaxyPaperCoordinate?.year}
              representative={Boolean(selectedRepresentativeGalaxyPaper)}
              status={galaxyPaperDetailStatus}
              error={galaxyPaperDetailError}
              inspectionMode={galaxyPaperInspectionMode}
              panelState={galaxyPaperPanelState}
              onToggleInspection={() => commandCamera("toggle-paper-inspection")}
              onReturn={() => commandCamera("return-system-center")}
              onOpenPaper={onOpenPaper}
            />
          ) : selected ? (
            <>
              <div className="galaxy-inspector-header">
                <p className="eyebrow">{selected.field}</p>
                <h2 className="galaxy-inspector-title mt-2 text-2xl font-semibold text-ink">{selected.title}</h2>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="quiet-chip">{selected.paperCount} 篇文献</span>
                  <span className="quiet-chip">置信度 {Math.round((selected.confidence ?? 0) * 100)}%</span>
                  <span className="quiet-chip">{selected.trend}</span>
                  <span className="quiet-chip">{hotspotEvidenceStatusLabel(hotspotEvidenceStatus)}</span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button className="secondary-action h-9 gap-2 px-3" onClick={() => onOpenPaperList(selected)}>
                    <BookOpen size={15} />
                    进入文献列表
                  </button>
                  {selectedNode && galaxyExplorationState === "overview" && <button className="secondary-action galaxy-focus-action h-9 gap-2 px-3" onClick={() => { setSelectionActive(true); commandCamera("enter-system"); }}><Orbit size={15} />进入热点星系</button>}
                  {galaxyExplorationState === "system" && <button className="secondary-action h-9 gap-2 px-3" onClick={() => commandCamera("exit-system")}><ArrowLeft size={15} />返回全图</button>}
                </div>
              </div>
              <div ref={galaxyInspectorScrollRef} className="galaxy-inspector-scroll">
                {galaxyExplorationState === "system" && (
                  <div className="galaxy-system-paper-detail">
                    <div className="inspector-section-title">当前论文</div>
                    {selectedGalaxyPaperId ? (
                      <div className="mini-card mt-2">
                        <div className="text-[11px] font-semibold text-cyan/75">{selectedRepresentativeGalaxyPaper ? "代表论文" : "普通论文"}</div>
                        {selectedGalaxyPaper ? (
                          <>
                            <div className="font-medium leading-6 text-ink">{selectedGalaxyPaper.title}</div>
                            <div className="mt-1 text-xs text-ink/45">{selectedGalaxyPaper.source} · {selectedGalaxyPaper.year ?? "未知年份"}</div>
                            {selectedGalaxyPaper.authors && <div className="mt-1 line-clamp-2 text-xs leading-5 text-ink/45">{selectedGalaxyPaper.authors}</div>}
                            <p className="mt-2 line-clamp-3 text-xs leading-5 text-ink/55">{selectedGalaxyPaper.abstractText || "暂无摘要。"}</p>
                            {(selectedGalaxyPaper.doi || selectedGalaxyPaper.url) && <div className="mt-2 truncate text-[11px] text-ink/35">{selectedGalaxyPaper.doi ? `DOI ${selectedGalaxyPaper.doi}` : selectedGalaxyPaper.url}</div>}
                          </>
                        ) : galaxyPaperDetailStatus === "loading" || galaxyPaperDetailStatus === "idle" ? (
                          <div className="mt-1 text-sm leading-6 text-ink/45">正在从 SQLite 读取论文详情…</div>
                        ) : (
                          <div className="mt-1 text-sm leading-6 text-danger/80">{galaxyPaperDetailError || "SQLite 中未找到该论文的完整记录。"}</div>
                        )}
                        <div className="mt-3 flex flex-wrap gap-2">
                          {selectedGalaxyPaper && <button className="secondary-action h-8 gap-1.5 px-3" onClick={() => onOpenPaper(selectedGalaxyPaper)}><BookOpen size={14} />进入文献列表</button>}
                          {galaxyPaperFocusState === "entering" ? (
                            <button className="secondary-action h-8 px-3" onClick={() => commandCamera("return-system-center")}>取消靠近</button>
                          ) : galaxyPaperFocusState === "exiting" ? (
                            <button className="secondary-action h-8 px-3" disabled>正在返回…</button>
                          ) : galaxyPaperFocusState !== "focused" || selectedGalaxyPaperId !== galaxyFocusedPaperId ? (
                            <button className="secondary-action h-8 gap-1.5 px-3" onClick={() => commandCamera("focus-paper")}><LocateFixed size={14} />靠近论文</button>
                          ) : null}
                          {galaxyPaperFocusState === "focused" && <button className="secondary-action h-8 px-3" onClick={() => commandCamera("return-system-center")}>返回系统中心</button>}
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2 text-sm leading-6 text-ink/45">点击普通论文星或轨道上的代表论文星，可在此查看完整信息。</div>
                    )}
                  </div>
                )}
                <p className="text-sm leading-7 text-ink/[0.58]">{selected.summary}</p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {selected.keywords.slice(0, 8).map((keyword) => <span key={keyword} className="quiet-chip">{keyword}</span>)}
                  {selected.keywords.length > 8 && <span className="quiet-chip">+{selected.keywords.length - 8}</span>}
                </div>
                <div className="inspector-metrics mt-5">
                  <div className="inspector-metric">
                    <span>年份分布</span>
                    <strong>{yearDistribution.map((item) => `${item.year}:${item.count}`).join(" / ") || "无"}</strong>
                  </div>
                  <div className="inspector-metric">
                    <span>来源分布</span>
                    <strong>{sourceDistribution.map(([source, count]) => `${source}:${count}`).join(" / ") || "待加载"}</strong>
                  </div>
                </div>
                <div className="mt-5">
                  <div className="inspector-section-title">语义连接</div>
                  <div className="mt-2 space-y-2">
                    {selectedLinks.slice(0, 4).map((link) => {
                      const peer = link.source.hotspot.id === selected.id ? link.target.hotspot : link.source.hotspot;
                      return (
                        <button key={`${selected.id}-${peer.id}`} className="inspector-related-row" onClick={() => selectGalaxyHotspot(peer.id)}>
                          <span>{peer.title}</span>
                          <small>{peer.field} | {peer.paperCount} 篇 | 连接强度 {Math.round(link.score * 100)}%</small>
                        </button>
                      );
                    })}
                    {selectedLinks.length === 0 && <div className="text-sm leading-6 text-ink/45">暂无可视化语义连接，尝试降低筛选条件。</div>}
                  </div>
                </div>
                <div className="mt-5">
                  <div className="inspector-section-title">代表论文</div>
                  <div className="mt-2 min-h-[76px] space-y-2">
                    {hotspotEvidenceStatus === "loading" && inspectorRelatedPapers.length === 0 && (
                      <div className="mini-card flex min-h-[76px] items-center text-sm leading-6 text-ink/45">正在读取 V20 热点证据与代表论文…</div>
                    )}
                    {inspectorRelatedPapers.slice(0, 6).map((paper) => (
                      <div key={paper.id} className="mini-card flex items-start gap-2 text-sm leading-6 text-ink/65">
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-left"
                          onClick={() => {
                            setSelectedGalaxyPaperId(paper.id);
                            if (galaxyExplorationState === "system") window.requestAnimationFrame(() => commandCamera("focus-paper"));
                          }}
                        >
                          <div className="font-medium text-ink">{paper.title}</div>
                          <div className="text-xs text-ink/40">{paper.source} | {paper.year ?? "未知年份"} | {paper.field}</div>
                        </button>
                        {paper.url && <button type="button" className="secondary-action h-7 shrink-0 px-2 text-xs" onClick={() => void openExternalUrl(paper.url!)}>打开原文</button>}
                      </div>
                    ))}
                    {hotspotEvidenceStatus !== "loading" && inspectorRelatedPapers.length === 0 && <div className="text-sm leading-6 text-ink/45">暂无可直接读取的代表论文，进入文献列表可按关键词继续筛选。</div>}
                  </div>
                </div>
                <div className="mt-5">
                  <div className="inspector-section-title">相似热点</div>
                  <div className="mt-2 space-y-2">
                    {similarHotspots.map(({ hotspot, score }) => (
                      <button key={hotspot.id} className="inspector-related-row" onClick={() => selectGalaxyHotspot(hotspot.id)}>
                        <span>{hotspot.title}</span>
                        <small>{hotspot.field} | {hotspot.paperCount} 篇 | 相似度 {Math.round(score * 100)}%</small>
                      </button>
                    ))}
                    {similarHotspots.length === 0 && <div className="text-sm leading-6 text-ink/45">暂无高相似度连接。</div>}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="galaxy-inspector-empty">
              <EmptyState title="暂无热点" description="调整筛选条件或先运行热点聚类。" />
            </div>
          )}
        </aside>
      </section>
    </div>
  );
}

type GalaxyEvidenceCacheState = "idle" | "pending" | "hit" | "miss" | "error";

type GalaxyEvidencePerformance = {
  cacheState: GalaxyEvidenceCacheState;
  queryMs: number;
  pendingQueries: number;
};

const APP17_EVIDENCE_DEBOUNCE_MS = 250;
const APP17_EVIDENCE_CACHE_LIMIT = 64;

function app17EvidenceCacheKey(projectId: string, field: string, topicId: number) {
  return `${projectId}\u0000${field}\u0000${topicId}`;
}

function readApp17EvidenceCache(cache: Map<string, HotspotEvidenceBundle>, key: string) {
  const bundle = cache.get(key);
  if (!bundle) return undefined;
  cache.delete(key);
  cache.set(key, bundle);
  return bundle;
}

function writeApp17EvidenceCache(cache: Map<string, HotspotEvidenceBundle>, key: string, bundle: HotspotEvidenceBundle) {
  cache.delete(key);
  cache.set(key, bundle);
  while (cache.size > APP17_EVIDENCE_CACHE_LIMIT) {
    const oldestKey = cache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    cache.delete(oldestKey);
  }
}

function hotspotEvidenceStatusLabel(status: "idle" | "loading" | "ready" | "unavailable") {
  if (status === "loading") return "证据包加载中";
  if (status === "ready") return "V20 快照证据";
  if (status === "unavailable") return "领域回退数据";
  return "证据待选择";
}

function app17HotspotToHotspot(hotspot: App17GalaxyHotspotPoint): Hotspot {
  const keywords = hotspot.keywords.length > 0 ? hotspot.keywords : hotspot.label.split(/\s+/).filter(Boolean).slice(0, 8);
  return {
    id: hotspot.id,
    field: hotspot.field,
    topicId: hotspot.topicId,
    title: hotspot.title || hotspot.label,
    label: hotspot.label,
    summary: hotspot.summary || hotspot.review || `app17 topic ${hotspot.topicId} from ${hotspot.paperCount.toLocaleString()} papers.`,
    keywords,
    paperCount: hotspot.paperCount,
    trend: mapApp17Trend(hotspot.trend),
    confidence: 0.92,
    source: "worker",
    coordinates: {
      x: hotspot.x * 0.045,
      y: hotspot.y * 0.045,
      z: hotspot.z * 0.045,
    },
    evolution: [],
    sourceDistribution: [],
    similarHotspots: [],
    analysis: {
      keywordFocus: 0.82,
      representativeCoverage: 0,
      recentMomentum: 0.6,
      sourceDiversity: 0,
      evidencePaperIds: [],
      warnings: [],
    },
    updatedAt: nowIso(),
  };
}

function mapApp17Trend(value: string): Hotspot["trend"] {
  const normalized = value.toLowerCase();
  if (normalized.includes("declin") || normalized.includes("下降")) return "Declining";
  if (normalized.includes("stable") || normalized.includes("稳定")) return "Stable";
  if (normalized.includes("surg") || normalized.includes("hot") || normalized.includes("爆")) return "Surging";
  return "Unknown";
}

function filterApp17Payload(payload: App17GalaxyPayload | null, hotspots: Hotspot[]) {
  if (!payload?.ready) return null;
  const allowedIds = new Set(hotspots.map((hotspot) => hotspot.id));
  const allowedTopics = new Set(hotspots.map((hotspot) => `${hotspot.field}::${hotspot.topicId}`));
  const filteredHotspots = payload.hotspots.filter((hotspot) => allowedIds.has(hotspot.id));
  const filteredPapers = payload.papers.filter((paper) => allowedTopics.has(`${paper.field}::${paper.topicId}`));
  return {
    ...payload,
    paperCount: filteredPapers.length,
    hotspotCount: filteredHotspots.length,
    topicCount: allowedTopics.size,
    papers: filteredPapers,
    hotspots: filteredHotspots,
  } satisfies App17GalaxyPayload;
}

function GalaxyDiagnosticMetric({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className={`galaxy-diagnostics-metric ${className}`}>
      <dt>{label}</dt>
      <dd title={value}>{value}</dd>
    </div>
  );
}

function galaxyPerformanceScenarioLabel(scenario: GalaxyPerformanceSnapshot["scenario"]) {
  const labels: Record<GalaxyPerformanceSnapshot["scenario"], string> = {
    "overview-auto": "全图旋转",
    interacting: "拖动缩放",
    "system-exploration": "热点星系",
    "top-static": "俯视静止",
    "theory-static": "理论星图",
  };
  return labels[scenario];
}

function formatPerformanceMs(value: number) {
  return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)} ms`;
}

function formatSignedPercent(value: number) {
  const percentage = value * 100;
  return `${percentage > 0 ? "+" : ""}${percentage.toFixed(1)}%`;
}

function galaxyAmbientMotionLabel(motion: GalaxyPerformanceSnapshot["ambientMotion"]) {
  const labels: Record<GalaxyPerformanceSnapshot["ambientMotion"], string> = {
    none: "关闭",
    "rotation-breath": "远景旋转与呼吸",
    breath: "远景低频呼吸",
  };
  return labels[motion];
}

function galaxyEnvironmentMotionLabel(motion: GalaxyPerformanceSnapshot["environmentMotion"]) {
  return motion === "twinkle" ? "异步深空呼吸" : "静态";
}

function galaxyBloomModeLabel(mode: GalaxyPerformanceSnapshot["bloomEffectiveMode"]) {
  const labels: Record<GalaxyPerformanceSnapshot["bloomEffectiveMode"], string> = {
    none: "关闭",
    local: "自动局部",
  };
  return labels[mode];
}

function galaxyEvidenceCacheStateLabel(state: GalaxyEvidenceCacheState) {
  const labels: Record<GalaxyEvidenceCacheState, string> = {
    idle: "空闲",
    pending: "防抖等待",
    hit: "命中",
    miss: "未命中",
    error: "查询失败",
  };
  return labels[state];
}

function galaxySystemStarLodLabel(lod: GalaxyPerformanceSnapshot["systemStarLod"]) {
  const labels: Record<GalaxyPerformanceSnapshot["systemStarLod"], string> = {
    none: "未进入",
    far: "远景点光",
    transition: "平滑混合",
    near: "近景光球",
    surface: "恒星表面",
  };
  return labels[lod];
}

function galaxySystemPaperLodLabel(lod: GalaxyPerformanceSnapshot["systemPaperLod"]) {
  const labels: Record<GalaxyPerformanceSnapshot["systemPaperLod"], string> = {
    none: "未进入",
    far: "远景星群",
    medium: "中景点光",
    near: "近景锐核",
  };
  return labels[lod];
}

function galaxySystemPaperFocusLabel(mode: GalaxyPerformanceSnapshot["systemRepresentativeFocusMode"]) {
  const labels: Record<GalaxyPerformanceSnapshot["systemRepresentativeFocusMode"], string> = {
    none: "无",
    hover: "悬停",
    selected: "选中",
  };
  return labels[mode];
}

function galaxyPaperFocusStateLabel(state: GalaxyPaperFocusState) {
  const labels: Record<GalaxyPaperFocusState, string> = {
    idle: "系统中心",
    entering: "正在靠近",
    focused: "论文近景",
    exiting: "正在返回",
  };
  return labels[state];
}

function galaxyPaperInspectionModeLabel(mode: GalaxyPerformanceSnapshot["systemPaperInspectionMode"]) {
  const labels: Record<GalaxyPerformanceSnapshot["systemPaperInspectionMode"], string> = {
    none: "未进入",
    docked: "停靠阅读",
    centered: "居中观察",
  };
  return labels[mode];
}

function galaxyPaperDetailCacheStateLabel(state: GalaxyPaperDetailCacheState) {
  const labels: Record<GalaxyPaperDetailCacheState, string> = {
    idle: "未查询",
    representative: "代表证据",
    hit: "缓存命中",
    miss: "SQLite 查询",
    missing: "记录缺失",
    error: "查询失败",
  };
  return labels[state];
}

function formatGalaxyPerformanceSummary(snapshot: GalaxyPerformanceSnapshot, evidence: GalaxyEvidencePerformance) {
  return [
    "科研星图性能摘要",
    `记录时间: ${new Date().toLocaleString()}`,
    `场景: ${galaxyPerformanceScenarioLabel(snapshot.scenario)} (${snapshot.fullscreen ? "全屏" : "窗口"})`,
    `采样窗口: ${(snapshot.sampleDurationMs / 1_000).toFixed(1)} s`,
    `实时 FPS: ${snapshot.currentFps.toFixed(1)}`,
    `平均 FPS: ${snapshot.averageFps.toFixed(1)}`,
    `帧耗时 平均/P95/最大: ${formatPerformanceMs(snapshot.averageFrameMs)} / ${formatPerformanceMs(snapshot.p95FrameMs)} / ${formatPerformanceMs(snapshot.maxFrameMs)}`,
    `WebGL/标签平均耗时: ${formatPerformanceMs(snapshot.averageWebglMs)} / ${formatPerformanceMs(snapshot.averageLabelMs)}`,
    `局部辉光/渐入: ${galaxyBloomModeLabel(snapshot.bloomEffectiveMode)} / ${Math.round(snapshot.bloomBlend * 100)}%`,
    `Bloom 平均/P95: ${formatPerformanceMs(snapshot.averageBloomMs)} / ${formatPerformanceMs(snapshot.p95BloomMs)}`,
    `Bloom 阈值/强度/半径/分辨率: ${snapshot.bloomThreshold.toFixed(2)} / ${snapshot.bloomStrength.toFixed(2)} / ${snapshot.bloomRadius.toFixed(2)} / ${Math.round(snapshot.bloomResolutionScale * 100)}%`,
    `Draw calls/渲染点: ${snapshot.drawCalls} / ${snapshot.renderedPoints}`,
    `论文点/热点: ${snapshot.paperCount} / ${snapshot.hotspotCount}`,
    `Geometry/Texture: ${snapshot.geometries} / ${snapshot.textures}`,
    `画布/基础DPR/Bloom DPR: ${snapshot.width}×${snapshot.height} / ${snapshot.pixelRatio.toFixed(2)} / ${snapshot.bloomBufferPixelRatio.toFixed(2)}`,
    `投影倍率: ${snapshot.projectionZoom.toFixed(2)}×`,
    `深空源 球壳/视野估算: ${snapshot.environmentStarCount} / ${snapshot.environmentVisibleStarEstimate}`,
    `深空源 微星/紧凑/锚点: ${snapshot.environmentMicroCount} / ${snapshot.environmentCompactCount} / ${snapshot.environmentAnchorCount}`,
    `深空场动态: ${galaxyEnvironmentMotionLabel(snapshot.environmentMotion)}`,
    `远景动态: ${galaxyAmbientMotionLabel(snapshot.ambientMotion)}`,
    `环境目标 FPS/节拍偏离: ${Math.max(snapshot.ambientTargetFps, snapshot.environmentTargetFps)} / ${snapshot.ambientCadenceMisses}`,
    snapshot.ambientTargetFps > 0 || snapshot.environmentTargetFps > 0
      ? `主动限帧原始间隔 >50/>100 ms: ${snapshot.longFrames50} / ${snapshot.longFrames100}（不等同于渲染卡顿）`
      : `长帧 >50/>100 ms: ${snapshot.longFrames50} / ${snapshot.longFrames100}`,
    `选择到首帧: ${snapshot.selectionToFirstFrameMs > 0 ? formatPerformanceMs(snapshot.selectionToFirstFrameMs) : "待采样"}`,
    `页面恢复到首帧: ${snapshot.resumeToFirstFrameMs > 0 ? formatPerformanceMs(snapshot.resumeToFirstFrameMs) : "待采样"}`,
    `星系跃迁: ${snapshot.focusTransitionActive ? "进行中" : snapshot.focusTransitionMs > 0 ? formatPerformanceMs(snapshot.focusTransitionMs) : "待采样"}`,
    `局部系统准备: ${snapshot.systemPrepareMs > 0 ? formatPerformanceMs(snapshot.systemPrepareMs) : "待采样"} / ${snapshot.systemCacheHit ? "缓存命中" : "新建"}`,
    `局部视觉/主星基础+Bloom批次: ${snapshot.systemVisualMode} / ${snapshot.systemStarDrawCalls}+${snapshot.systemStarBloomDrawCalls}`,
    `运动论文/局部目标 FPS: ${snapshot.systemMovingPaperCount} / ${snapshot.systemTargetFps}`,
    `主星直径/视口/LOD: ${snapshot.systemStarProjectedDiameter.toFixed(1)} px / ${(snapshot.systemStarViewportRatio * 100).toFixed(1)}% / ${galaxySystemStarLodLabel(snapshot.systemStarLod)}`,
    `LOD 混合/自转: ${Math.round(snapshot.systemStarLodBlend * 100)}% / ${snapshot.systemStarRotationDegrees.toFixed(1)}° / ${snapshot.systemStarMotionActive ? "动态" : "冻结"}`,
    `点光/光球/日冕: ${Math.round(snapshot.systemStarFarCoreBlend * 100)}% / ${Math.round(snapshot.systemStarLodBlend * 100)}% / ${Math.round(snapshot.systemStarCoronaBlend * 100)}%`,
    `表面细节/遮挡/辉光: ${Math.round(snapshot.systemStarSurfaceDetailBlend * 100)}% / ${snapshot.systemStarDepthOcclusionActive ? "启用" : "等待近景"} / ${Math.round(snapshot.systemStarSurfaceBloomBlend * 100)}%`,
    `日冕近景保留: ${Math.round(snapshot.systemStarCoronaCloseupBlend * 100)}%`,
    `全景 topic/局部云可见度: ${Math.round(snapshot.overviewSelectedTopicOpacity * 100)}% / ${Math.round(snapshot.systemCloudOpacity * 100)}%`,
    `远景热点/论文样本/退远/交织淡入: ${snapshot.farBackgroundHotspotCount} / ${snapshot.farBackgroundPaperSampleCount} / ${snapshot.farBackgroundRetreatHotspotCount} / ${snapshot.farBackgroundCrossfadeHotspotCount}`,
    `远景最近/最远半径: ${snapshot.farBackgroundNearestRadius.toFixed(2)} / ${snapshot.farBackgroundFarthestRadius.toFixed(2)}`,
    `远景局部向量/重基准误差: ${snapshot.farBackgroundLocalOffsetError.toExponential(2)} / ${snapshot.farBackgroundRebaseProjectionDeltaPx.toFixed(3)}px`,
    `中央遮罩可见代理/真实概览可见/可拾取: ${snapshot.farBackgroundCentralMaskVisibleCount} / ${snapshot.systemOverviewVisibleObjectCount} / ${snapshot.systemOverviewPickableObjectCount}`,
    `远景论文呼吸: ${(snapshot.farBackgroundPaperBrightnessMin * 100).toFixed(2)}-${(snapshot.farBackgroundPaperBrightnessMax * 100).toFixed(2)}%`,
    `远景核心/光晕呼吸: ${(snapshot.farBackgroundHotspotCoreBrightnessMin * 100).toFixed(2)}-${(snapshot.farBackgroundHotspotCoreBrightnessMax * 100).toFixed(2)}% / ${(snapshot.farBackgroundHotspotHaloBrightnessMin * 100).toFixed(2)}-${(snapshot.farBackgroundHotspotHaloBrightnessMax * 100).toFixed(2)}%`,
    `局部唯一论文/去重: ${snapshot.systemUniquePaperCount} / ${snapshot.systemDuplicatePaperCount}`,
    `隐藏代表论文/未匹配: ${snapshot.systemHiddenRepresentativeCount} / ${snapshot.systemUnresolvedRepresentativeCount}`,
    `论文星 LOD/混合/尺寸: ${galaxySystemPaperLodLabel(snapshot.systemPaperLod)} / ${Math.round(snapshot.systemPaperLodBlend * 100)}% / ${snapshot.systemPaperMinPointSize.toFixed(2)}–${snapshot.systemPaperMaxPointSize.toFixed(2)} px`,
    `论文云显现/曝光/目标: ${Math.round(snapshot.systemPaperRevealProgress * 100)}% / ${snapshot.systemPaperExposure.toFixed(2)}x / ${snapshot.systemPaperTargetExposure.toFixed(2)}x`,
    `论文云深层亮度/尺寸下限: ${Math.round(snapshot.systemPaperDepthBrightnessFloor * 100)}% / ${Math.round(snapshot.systemPaperDepthSizeFloor * 100)}%`,
    `代表论文焦点/名次/降亮: ${galaxySystemPaperFocusLabel(snapshot.systemRepresentativeFocusMode)} / ${snapshot.systemRepresentativeFocusRank >= 0 ? `#${snapshot.systemRepresentativeFocusRank + 1}` : "无"} / ${Math.round(snapshot.systemRepresentativeDimFactor * 100)}%`,
    `代表论文局部辉光: ${snapshot.systemRepresentativeBloomActive ? "启用" : "关闭"}`,
    `论文拾取当前/P95/候选: ${formatPerformanceMs(snapshot.systemPaperPickMs)} / ${formatPerformanceMs(snapshot.systemPaperPickP95Ms)} / ${snapshot.systemPaperPickCandidateCount}`,
    `当前论文/详情缓存: ${snapshot.systemSelectedPaperType} / ${galaxyPaperDetailCacheStateLabel(snapshot.systemPaperDetailCacheState)}`,
    `论文详情查询: ${snapshot.systemPaperDetailQueryMs > 0 ? formatPerformanceMs(snapshot.systemPaperDetailQueryMs) : "未查询"}`,
    `论文旅程/进度/路径: ${snapshot.systemPaperJourneyState} / ${Math.round(snapshot.systemPaperJourneyProgress * 100)}% / ${snapshot.systemPaperJourneyPathMode}`,
    `兼容飞行状态/补间: ${galaxyPaperFocusStateLabel(snapshot.systemPaperFocusState)} / ${formatPerformanceMs(snapshot.systemPaperFocusTransitionMs)}`,
    `论文飞行起始/目标距离/目标尺寸: ${snapshot.systemPaperFocusStartDistance.toFixed(2)} / ${snapshot.systemPaperFocusTargetDistance.toFixed(2)} / ${snapshot.systemPaperFocusTargetScreenSize.toFixed(1)}px`,
    `论文相机真实位移/到目标距离/投影直径: ${snapshot.systemPaperCameraTravelDistance.toFixed(3)} / ${snapshot.systemPaperCameraDistanceToTarget.toFixed(3)} / ${snapshot.systemPaperProjectedTargetDiameter.toFixed(2)}px`,
    `论文目标世界坐标漂移/平滑延长: ${snapshot.systemPaperTargetWorldPositionDrift.toExponential(2)} / ${formatPerformanceMs(snapshot.systemPaperSmoothnessExtensionMs)}`,
    `论文返回位置/角度误差: ${snapshot.systemPaperReturnPositionError.toExponential(2)} / ${snapshot.systemPaperReturnAngleErrorDegrees.toFixed(4)}deg`,
    `论文主星最小净空/视锥/绘制批次: ${snapshot.systemPaperMinimumStarClearance.toFixed(3)} / ${snapshot.systemPaperStarInFrustum ? "in" : "out"} / ${snapshot.systemPaperStarDrawCalls}`,
    `论文主体目标/实际直径: ${snapshot.systemPaperTargetBodyDiameterPx.toFixed(1)}px / ${snapshot.systemPaperActualBodyDiameterPx.toFixed(1)}px`,
    `论文代表载体/主星退出边距: ${(snapshot.systemPaperRepresentativeCarrierRatio * 100).toFixed(1)}% / ${snapshot.systemPaperEndpointStarExitMarginPx.toFixed(1)}px`,
    `论文终点候选/方向偏转/构图拒绝: ${snapshot.systemPaperEndpointCandidateCount} / ${snapshot.systemPaperEndpointDirectionDeviationDegrees.toFixed(1)}deg / ${snapshot.systemPaperEndpointCompositionRejected ? "是" : "否"}`,
    `论文飞行邻域/远景亮度/取消: ${Math.round(snapshot.systemPaperFocusNeighborBrightness * 100)}% / ${Math.round(snapshot.systemPaperFocusContextBrightness * 100)}% / ${snapshot.systemPaperFocusCanceled ? "是" : "否"}`,
    `论文阅读空间/类型/实体化/停靠: ${galaxyPaperInspectionModeLabel(snapshot.systemPaperInspectionMode)} / ${snapshot.systemPaperInspectionVisualType} / ${Math.round(snapshot.systemPaperInspectionBlend * 100)}% / ${Math.round(snapshot.systemPaperInspectionDockBlend * 100)}%`,
    `论文近景直径/基础+辉光批次: ${snapshot.systemPaperInspectionDiameter.toFixed(1)}px / ${snapshot.systemPaperInspectionDrawCalls}+${snapshot.systemPaperInspectionBloomDrawCalls}`,
    `详情面板/外壳/标题/正文: ${snapshot.systemPaperPanelState} / ${Math.round(snapshot.systemPaperPanelProgress * 100)}% / ${Math.round(snapshot.systemPaperPanelHeaderProgress * 100)}% / ${Math.round(snapshot.systemPaperPanelBodyProgress * 100)}%`,
    `阅读锚点/偏差/相机写入源: ${snapshot.systemPaperTargetAnchorX.toFixed(2)} / ${snapshot.systemPaperAnchorErrorPx.toFixed(1)}px / ${snapshot.systemPaperCameraWriter}`,
    `相机切换/四元数变化/锚点位移: ${snapshot.systemPaperCameraWriterChanges} / ${snapshot.systemPaperQuaternionDeltaDegrees.toFixed(3)}deg / ${snapshot.systemPaperAnchorDeltaPx.toFixed(2)}px`,
    `论文视觉所有权/专用对象/紧凑LOD: ${snapshot.systemPaperVisualOwnerState} / ${Math.round(snapshot.systemPaperVisualOwnerOpacity * 100)}% / ${Math.round(snapshot.systemPaperVisualCompactLod * 100)}%`,
    `论文光学尺寸 Point/专用对象/重心差: ${snapshot.systemPaperHandoffPointDiameter.toFixed(1)}px / ${snapshot.systemPaperHandoffCloseupDiameter.toFixed(1)}px / ${snapshot.systemPaperHandoffPositionDeltaPx.toFixed(2)}px`,
    `论文视觉所有权 Point/专用对象/总和/能量: ${snapshot.systemPaperHandoffPointAlpha.toFixed(3)} / ${snapshot.systemPaperHandoffCloseupAlpha.toFixed(3)} / ${snapshot.systemPaperHandoffAlphaSum.toFixed(3)} / ${snapshot.systemPaperVisibleEnergyRatio.toFixed(2)}x`,
    `返回水平反转/代表能量核批次: ${snapshot.systemPaperReturnHorizontalReversals} / ${snapshot.systemRepresentativeEnergyCoreDrawCalls}`,
    `代表能量核细节/Bloom/能量丝/承载: ${Math.round(snapshot.systemRepresentativeEnergyDetailBlend * 100)}% / ${Math.round(snapshot.systemRepresentativeEnergyBloomOpacity * 100)}% / ${snapshot.systemRepresentativeEnergyWispCount} / ${snapshot.systemRepresentativeEnergyCarrierScale.toFixed(2)}x`,
    `代表能量核近景压缩/可见半径/轨道: ${Math.round(snapshot.systemRepresentativeEnergyCloseupCompactness * 100)}% / ${Math.round(snapshot.systemRepresentativeEnergyVisibleRadius * 100)}% / ${Math.round(snapshot.systemRepresentativeEnergyOrbitAttenuation * 100)}%`,
    `代表能量核主体/LOD: ${snapshot.systemRepresentativeEnergyBodyCoreDiameter.toFixed(1)}px / ${Math.round(snapshot.systemRepresentativeEnergyBodyCoreBlend * 100)}%`,
    `代表能量核白热中心/Fresnel/外晕: ${snapshot.systemRepresentativeEnergyMicroCoreDiameter.toFixed(1)}px / ${snapshot.systemRepresentativeEnergyFresnelWidth.toFixed(1)}px / ${snapshot.systemRepresentativeEnergyOuterGlowDiameter.toFixed(1)}px`,
    `代表能量核外晕径向衰减: ${snapshot.systemRepresentativeEnergyOuterGlowMonotonic ? "单调" : "异常"}`,
    `代表能量核软核心/Bloom: ${Math.round(snapshot.systemRepresentativeEnergySoftCoreAttenuation * 100)}% / ${Math.round(snapshot.systemRepresentativeEnergyBloomOpacity * 100)}%`,
    `论文角尺寸/逐帧增长: ${(snapshot.systemPaperAngularSizeRatio * 100).toFixed(1)}% / ${formatSignedPercent(snapshot.systemPaperAngularGrowthRatio)}`,
    `论文直飞路径/相机距离: ${snapshot.systemPaperFlightPathMode} / ${snapshot.systemPaperCameraDistance.toFixed(3)}`,
    `论文中心偏差/主星净空: ${snapshot.systemPaperCenterErrorPx.toFixed(1)}px / ${snapshot.systemPaperStarClearance.toFixed(3)}`,
    `代表资源准备/提交: ${formatPerformanceMs(snapshot.representativePrepareMs)} / ${formatPerformanceMs(snapshot.representativeCommitMs)}`,
    `滚轮输入/距离变化: ${snapshot.lastNormalizedWheelDelta.toFixed(1)} / ${formatSignedPercent(snapshot.lastWheelDistanceRatio)}`,
    `跃迁 P95/>50ms: ${formatPerformanceMs(snapshot.transitionP95Ms)} / ${snapshot.transitionLongFrames50}`,
    `跃迁末段 P95/>50ms: ${formatPerformanceMs(snapshot.transitionTailP95Ms)} / ${snapshot.transitionTailLongFrames50}`,
    `跃迁 Resize/Canvas top/scrollY: ${snapshot.transitionCanvasResizeCount} / ${snapshot.transitionCanvasTopDelta.toFixed(1)}px / ${snapshot.transitionScrollDelta.toFixed(1)}px`,
    `证据延迟应用: ${snapshot.evidenceUpdateDeferred ? "等待跃迁完成" : "无"}`,
    `证据查询: ${evidence.queryMs > 0 ? formatPerformanceMs(evidence.queryMs) : "未查询"}`,
    `证据缓存/待处理: ${galaxyEvidenceCacheStateLabel(evidence.cacheState)} / ${evidence.pendingQueries}`,
    `WebGL Renderer: ${snapshot.gpuRenderer}`,
    `WebGL Vendor: ${snapshot.gpuVendor}`,
  ].join("\n");
}

type GalaxyLayoutMode = "semantic" | "spiral" | "timeline" | "confidence";
type GalaxyVisualMode = "nebula" | "galaxy";

type GalaxyNodeData = {
  hotspot: Hotspot;
  index: number;
  position: [number, number, number];
  radius: number;
  cloudRadius: number;
  color: string;
  confidence: number;
  influence: number;
};

type GalaxyCameraCommand = {
  kind: "reset" | "fit" | "top" | "enter-system" | "exit-system" | "reset-system" | "focus-paper" | "return-system-center" | "toggle-paper-inspection";
  target: [number, number, number];
  distance: number;
  nonce: number;
};

const galaxyLayoutOptions: Array<{ id: GalaxyLayoutMode; label: string }> = [
  { id: "semantic", label: "语义星团" },
  { id: "spiral", label: "银河旋臂" },
  { id: "timeline", label: "年度演化" },
  { id: "confidence", label: "置信空间" },
];

function buildGalaxyNodes(hotspots: Hotspot[], layoutMode: GalaxyLayoutMode, visualMode: GalaxyVisualMode, colors: string[]): GalaxyNodeData[] {
  const fields = Array.from(new Set(hotspots.map((hotspot) => hotspot.field))).sort();
  const years = hotspots.flatMap((hotspot) => hotspot.evolution.map((item) => item.year)).filter(Boolean);
  const minYear = Math.min(...years, new Date().getFullYear() - 4);
  const maxYear = Math.max(...years, new Date().getFullYear());
  const maxPaperCount = Math.max(1, ...hotspots.map((hotspot) => hotspot.paperCount));

  return hotspots.map((hotspot, index) => {
    const fieldIndex = Math.max(0, fields.indexOf(hotspot.field));
    const fieldAngle = (fieldIndex / Math.max(1, fields.length)) * Math.PI * 2;
    const confidence = hotspot.confidence ?? 0.5;
    const influence = Math.sqrt(hotspot.paperCount / maxPaperCount);
    const radius = 0.28 + influence * 0.5;
    const cloudRadius = 2.35 + influence * 3.35;
    const color = colors[fieldIndex % colors.length] ?? colors[index % colors.length];
    const yearCenter = hotspot.evolution.length > 0 ? hotspot.evolution.reduce((sum, item) => sum + item.year * item.count, 0) / Math.max(1, hotspot.evolution.reduce((sum, item) => sum + item.count, 0)) : minYear;
    const normalizedYear = (yearCenter - minYear) / Math.max(1, maxYear - minYear);
    const baseX = hotspot.coordinates.x * 0.42;
    const baseY = hotspot.coordinates.y * 0.42;
    const baseZ = hotspot.coordinates.z * 0.58;

    let position: [number, number, number];
    if (layoutMode === "spiral") {
      const seed = hashString(`${hotspot.id}:${hotspot.title}`);
      const jitter = ((seed % 17) - 8) * 0.11;
      const turn = index * 0.76 + fieldAngle + jitter;
      const distance = 8 + Math.sqrt(index + 1) * 8.4 + fieldIndex * 1.1;
      const armTwist = turn + distance * 0.085;
      position = [
        Math.cos(armTwist) * distance,
        Math.sin(armTwist) * distance * 0.72,
        (confidence - 0.5) * 8 + ((seed >> 4) % 9 - 4) * 0.22,
      ];
    } else if (layoutMode === "timeline") {
      position = [(normalizedYear - 0.5) * 58, Math.sin(fieldAngle) * 18 + (confidence - 0.5) * 8, Math.cos(fieldAngle) * 18 + (fieldIndex % 3) * 4];
    } else if (layoutMode === "confidence") {
      const shell = 34 - confidence * 24 + index * 0.22;
      position = [Math.cos(fieldAngle + index * 0.31) * shell, (confidence - 0.5) * 32, Math.sin(fieldAngle + index * 0.31) * shell];
    } else {
      position = [baseX, baseY, baseZ];
    }

    return { hotspot, index, position, radius, cloudRadius, color, confidence, influence };
  });
}

function calculateGalaxyBounds(nodes: GalaxyNodeData[]) {
  if (nodes.length === 0) return { center: [0, 0, 0] as [number, number, number], distance: 78 };
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  nodes.forEach((node) => {
    const point = new THREE.Vector3(...node.position);
    min.min(point);
    max.max(point);
  });
  const center = min.clone().add(max).multiplyScalar(0.5);
  const diagonal = Math.max(42, min.distanceTo(max));
  return {
    center: [center.x, center.y, center.z] as [number, number, number],
    distance: Math.min(150, Math.max(64, diagonal * 1.35)),
  };
}

function GalaxyModeSwitch({ mode, onChange, disabled = false }: { mode: GalaxyVisualMode; onChange: (mode: GalaxyVisualMode) => void; disabled?: boolean }) {
  return (
    <div className={`galaxy-mode-switch ${disabled ? "galaxy-mode-switch-disabled" : ""}`} aria-label="星图模式" aria-disabled={disabled}>
      <button disabled={disabled} className={mode === "nebula" ? "galaxy-mode-active" : ""} onClick={() => onChange("nebula")}>展示星图</button>
      <button disabled={disabled} className={mode === "galaxy" ? "galaxy-mode-active" : ""} onClick={() => onChange("galaxy")}>理论星图</button>
    </div>
  );
}

type HotspotReportMode = "offline" | "simple" | "deep";

function hotspotTrendLabel(trend: Hotspot["trend"]) {
  if (trend === "Surging") return "快速上升";
  if (trend === "Stable") return "稳定发展";
  if (trend === "Declining") return "热度下降";
  return "趋势待定";
}

function hotspotSourceLabel(source: Hotspot["source"]) {
  if (source === "worker") return "聚类生成";
  if (source === "manual") return "手动维护";
  if (source === "seed") return "样例数据";
  return "来源待定";
}

function HotspotLibrary({
  hotspots,
  settings,
  activeProject,
  focusIntent,
  onNavigate,
  onRefresh,
  onNotice,
}: {
  hotspots: Hotspot[];
  settings: AiSettings;
  activeProject: Project;
  focusIntent?: HotspotFocusIntent | null;
  onNavigate: (view: ActiveView) => void;
  onRefresh: () => Promise<void>;
  onNotice: AppNoticeHandler;
}) {
  const [selectedId, setSelectedId] = useState(hotspots[0]?.id ?? "");
  const [hotspotQuery, setHotspotQuery] = useState("");
  const [hotspotField, setHotspotField] = useState("all");
  const [hotspotTrend, setHotspotTrend] = useState<Hotspot["trend"] | "all">("all");
  const hotspotFields = useMemo(() => Array.from(new Set(hotspots.map((hotspot) => hotspot.field))).sort(), [hotspots]);
  const seedHotspotCount = useMemo(() => hotspots.filter((hotspot) => hotspot.source === "seed").length, [hotspots]);
  const hasSeedHotspots = seedHotspotCount > 0;
  const onlySeedHotspots = hasSeedHotspots && seedHotspotCount === hotspots.length;
  const filteredHotspots = useMemo(() => {
    const normalizedQuery = hotspotQuery.trim().toLowerCase();
    return hotspots.filter((hotspot) => {
      const matchesQuery = !normalizedQuery || `${hotspot.title} ${hotspot.summary} ${hotspot.keywords.join(" ")}`.toLowerCase().includes(normalizedQuery);
      const matchesField = hotspotField === "all" || hotspot.field === hotspotField;
      const matchesTrend = hotspotTrend === "all" || hotspot.trend === hotspotTrend;
      return matchesQuery && matchesField && matchesTrend;
    });
  }, [hotspotField, hotspotQuery, hotspots, hotspotTrend]);
  const selected = filteredHotspots.find((hotspot) => hotspot.id === selectedId) ?? filteredHotspots[0];
  const [draft, setDraft] = useState<Hotspot | null>(selected ?? null);
  const [busy, setBusy] = useState("");
  const [activeAiTaskKey, setActiveAiTaskKey] = useState("");
  const [reportMode, setReportMode] = useState<HotspotReportMode>("offline");
  const [reportOptions, setReportOptions] = useState<ReportGenerationOptions>(defaultReportOptions);
  const [hotspotEvidence, setHotspotEvidence] = useState<HotspotEvidenceBundle | null>(null);
  const [hotspotEvidenceStatus, setHotspotEvidenceStatus] = useState<"idle" | "loading" | HotspotEvidenceLoadStatus>("idle");
  const [hotspotEvidenceDiagnostics, setHotspotEvidenceDiagnostics] = useState<HotspotEvidenceDiagnostics | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);
  const evidenceRequestSequenceRef = useRef(0);
  const hotspotsRef = useRef(hotspots);
  hotspotsRef.current = hotspots;
  const activeHotspotEvidence = hotspotEvidence?.selectedHotspotId === selected?.id ? hotspotEvidence : null;
  const evidencePapers = useMemo(() => hotspotEvidenceToPapers(activeHotspotEvidence), [activeHotspotEvidence]);
  const reportPapers = evidencePapers;
  const workload = useMemo(() => estimateReportWorkload(reportPapers.length, reportOptions), [reportOptions, reportPapers.length]);
  const displayEvolution = activeHotspotEvidence?.yearEvolution ?? selected?.evolution ?? [];
  const displaySources = activeHotspotEvidence?.sourceDistribution ?? selected?.sourceDistribution ?? [];
  const evolutionMax = Math.max(1, ...displayEvolution.map((item) => item.count));
  const sourceMax = Math.max(1, ...displaySources.map((item) => item.count));
  const reportModeReady = hotspotEvidenceStatus === "ready" && Boolean(activeHotspotEvidence) && reportPapers.length > 0;
  const reportGenerationBusy = busy === "offline-report" || busy === "simple" || busy === "deep";
  const reportModeHint = reportMode === "offline"
    ? hotspotEvidenceStatus === "loading"
      ? "正在按持久化代表论文 ID 读取 SQLite 证据，完成后可生成离线报告。"
      : hotspotEvidenceStatus === "ready" && activeHotspotEvidence
        ? "使用 SQLite 中按代表 ID 精确读取的论文生成，无需 AI API key。"
        : hotspotEvidenceStatus === "missing-evidence"
          ? "当前热点没有持久化代表论文 ID，请先在流水线中重新运行热点聚类。"
          : "当前热点的持久化 SQLite 证据不可用，请检查论文库或重新运行热点聚类。"
    : hotspotEvidenceStatus === "ready" && reportPapers.length > 0
      ? `将使用 ${reportPapers.length} 篇真实代表论文生成 AI ${reportMode === "deep" ? "深版" : "简版"}报告。`
      : "当前热点没有可验证的代表论文，AI 报告已禁用。";

  useEffect(() => {
    const hotspotId = focusIntent?.hotspotId;
    if (!hotspotId || !hotspots.some((hotspot) => hotspot.id === hotspotId)) {
      return;
    }
    setHotspotQuery("");
    setHotspotField("all");
    setHotspotTrend("all");
    setSelectedId(hotspotId);
  }, [focusIntent?.hotspotId, focusIntent?.timestamp, hotspots]);

  useEffect(() => {
    setDraft(selected ? { ...selected, keywords: [...selected.keywords] } : null);
  }, [selected]);

  useEffect(() => {
    if (filteredHotspots.length === 0) {
      if (selectedId) setSelectedId("");
      return;
    }
    if (!filteredHotspots.some((hotspot) => hotspot.id === selectedId)) setSelectedId(filteredHotspots[0].id);
  }, [filteredHotspots, selectedId]);

  useEffect(() => {
    setMoreMenuOpen(false);
  }, [selected?.id]);

  useEffect(() => {
    if (!moreMenuOpen && !editorOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setMoreMenuOpen(false);
      setEditorOpen(false);
    }
    function handlePointerDown(event: MouseEvent) {
      if (moreMenuOpen && moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) setMoreMenuOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [editorOpen, moreMenuOpen]);

  useEffect(() => {
    const requestSequence = evidenceRequestSequenceRef.current + 1;
    evidenceRequestSequenceRef.current = requestSequence;
    const selectedHotspot = selected;
    if (!selectedHotspot) {
      setHotspotEvidence(null);
      setHotspotEvidenceDiagnostics(null);
      setHotspotEvidenceStatus("idle");
      return;
    }

    let active = true;
    setHotspotEvidence(null);
    setHotspotEvidenceDiagnostics(null);
    setHotspotEvidenceStatus("loading");
    void loadPersistedHotspotEvidence({
      databaseDir: settings.databaseDir,
      projectId: activeProject.id,
      hotspot: selectedHotspot,
      hotspots: hotspotsRef.current,
      requestSequence,
      maxPapers: 18,
      fetchPapersByIds: (ids) => getPapersByIds(settings.databaseDir, activeProject.id, ids),
    }).then((result) => {
      if (!active || requestSequence !== evidenceRequestSequenceRef.current) return;
      setHotspotEvidence(result.bundle);
      setHotspotEvidenceDiagnostics(result.diagnostics);
      setHotspotEvidenceStatus(result.status);
      if (import.meta.env.DEV) {
        console.info("[hotspot-evidence]", {
          hotspotId: selectedHotspot.id,
          cacheState: result.diagnostics.evidenceCacheState,
          queryMs: Number(result.diagnostics.evidenceLoadMs.toFixed(2)),
          requested: result.diagnostics.requestedRepresentativeCount,
          found: result.diagnostics.foundRepresentativeCount,
          missing: result.diagnostics.missingRepresentativeCount,
          requestSequence,
          fullReclusterTriggeredByNavigation: false,
        });
      }
    });
    return () => {
      active = false;
    };
  }, [activeProject.id, selected?.id, selected?.updatedAt, settings.databaseDir]);

  async function saveDraft() {
    if (!draft) return;
    await saveHotspot({ ...draft, paperCount: reportPapers.length || draft.paperCount, updatedAt: nowIso() });
    await onRefresh();
    setEditorOpen(false);
    onNotice("热点已保存。");
  }

  async function generateFromHotspot(mode: Extract<ResearchReport["mode"], "simple" | "deep">) {
    if (!selected) return;
    if (reportPapers.length === 0) {
      onNotice("该热点暂无可用于综述的代表文献。");
      return;
    }
    const started = performance.now();
    const evidenceSource = "sqlite-persisted-hotspot-ids";
    const rawInput = JSON.stringify({ topic: selected.title, mode, discipline: selected.field, options: reportOptions, evidenceSource, paperIds: reportPapers.map((paper) => paper.id) }, null, 2);
    const taskLogId = crypto.randomUUID();
    let taskKey = "";
    let runningLogPromise: Promise<unknown> | null = null;
    setBusy(mode);
    try {
      const generated = await generateResearchReport({
        topic: selected.title,
        papers: reportPapers,
        mode,
        discipline: selected.field,
        settings,
        options: reportOptions,
        hotspot: selected,
        onTaskStarted: (startedTaskKey) => {
          taskKey = startedTaskKey;
          setActiveAiTaskKey(startedTaskKey);
          runningLogPromise = saveTaskLog({
            id: taskLogId,
            stage: "review",
            title: "热点 AI 综述生成",
            status: "running",
            taskKey: startedTaskKey,
            inputSummary: `${selected.title} / ${mode} / ${reportPapers.length} 篇文献 / ${evidenceSource}`,
            outputSummary: "AI 后台任务正在运行，可在任务日志中取消。",
            rawInput,
            durationMs: 0,
          }).then(() => onRefresh());
        },
      });
      await runningLogPromise;
      const reviewGate = reportReviewGate(generated.content, reportPapers);
      await saveReportWithTaskLog({
        topic: selected.title, mode, discipline: selected.field, content: generated.content,
        paperIds: reportPapers.map((paper) => paper.id), metrics: generated.metrics,
        evidenceProfile: generated.evidenceProfile, ...reviewGate,
      }, {
        id: taskLogId,
        stage: "review", title: "热点 AI 综述生成", status: "done",
        inputSummary: `${selected.title} / ${mode} / ${reportPapers.length} 篇文献 / ${evidenceSource}`,
        outputSummary: reviewGate.reviewStatus === "needs-review" ? "热点综述已保存为待复核草稿。" : "热点综述已保存到报告库。",
        rawInput, rawOutput: generated.content, durationMs: Math.round(performance.now() - started),
      });
      await onRefresh();
      onNotice(reviewGate.reviewStatus === "needs-review" ? "报告风险较高，已保存为待复核草稿。" : `已按热点生成 ${mode === "deep" ? "深版" : "简版"}综述。`);
    } catch (error) {
      await runningLogPromise;
      const message = error instanceof Error ? error.message : typeof error === "string" ? error : "热点综述生成失败。";
      const cancelled = message.includes("AI_TASK_CANCELLED");
      await saveTaskLog({
        id: taskLogId,
        stage: "review",
        title: "热点 AI 综述生成",
        status: cancelled ? "cancelled" : "failed",
        taskKey: taskKey || undefined,
        inputSummary: `${selected.title} / ${mode} / ${reportPapers.length} 篇文献`,
        outputSummary: "",
        rawInput,
        error: message,
        durationMs: Math.round(performance.now() - started),
      });
      await onRefresh();
      onNotice(
        cancelled
          ? "AI 报告任务已取消。"
          : error instanceof Error
            ? error.message
            : "热点综述生成失败。",
        cancelled ? "info" : "error",
      );
    } finally {
      setActiveAiTaskKey("");
      setBusy("");
    }
  }

  async function cancelActiveAiReport() {
    if (!activeAiTaskKey) return;
    const cancelled = await cancelAiTask(activeAiTaskKey);
    onNotice(cancelled ? "已请求取消 AI 报告任务。" : "AI 任务已经结束或不再运行。");
  }

  async function exportSelectedEvidenceBundle() {
    if (!selected) return;
    setBusy("evidence-export");
    const started = performance.now();
    try {
      const bundle = activeHotspotEvidence;
      if (!bundle || bundle.representativePapers.length === 0) {
        onNotice("当前热点没有可导出的持久化代表论文证据，请先在流水线中重新运行热点聚类。");
        return;
      }
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const baseName = `hotspot-evidence-${selected.title}-${timestamp}`.replace(/[\\/:*?"<>|]/g, "_");
      const dir = settings.exportDir || await chooseExportDirectory("选择热点证据包导出目录");
      const jsonPath = dir ? `${dir}\\${baseName}.json` : `${baseName}.json`;
      const mdPath = dir ? `${dir}\\${baseName}.md` : `${baseName}.md`;
      await writeTextFile(jsonPath, JSON.stringify(bundle, null, 2));
      await writeTextFile(mdPath, formatHotspotEvidenceMarkdown(bundle));
      await saveTaskLog({
        stage: "export",
        title: "热点 SQLite 证据包导出",
        status: "done",
        inputSummary: `${selected.title} / ${bundle.representativePapers.length} 篇代表论文`,
        outputSummary: `${jsonPath}\n${mdPath}`,
        rawOutput: JSON.stringify({ jsonPath, mdPath, selectedHotspotId: bundle.selectedHotspotId, representativePapers: bundle.representativePapers.length }, null, 2),
        durationMs: Math.round(performance.now() - started),
      });
      await onRefresh();
      onNotice("热点证据包 JSON / Markdown 已导出。");
    } catch (error) {
      const message = error instanceof Error ? error.message : "热点证据包导出失败。";
      await saveTaskLog({
        stage: "export",
        title: "热点 SQLite 证据包导出",
        status: "failed",
        inputSummary: selected.title,
        outputSummary: "",
        error: message,
        durationMs: Math.round(performance.now() - started),
      });
      await onRefresh();
      onNotice(message, "error");
    } finally {
      setBusy("");
    }
  }

  async function generateOfflineEvidenceReport() {
    if (!selected || !activeHotspotEvidence) return;
    const papersFromEvidence = hotspotEvidenceToPapers(activeHotspotEvidence);
    if (papersFromEvidence.length === 0) {
      onNotice("当前 SQLite 证据包没有代表论文，无法生成离线报告。");
      return;
    }
    setBusy("offline-report");
    const started = performance.now();
    try {
      const content = buildOfflineHotspotReport(selected, activeHotspotEvidence, papersFromEvidence);
      const evidenceProfile = buildReportEvidenceProfile(papersFromEvidence, selected);
      await saveReport({
        topic: selected.title,
        mode: "simple",
        discipline: selected.field,
        content,
        paperIds: papersFromEvidence.map((paper) => paper.id),
        metrics: evaluateReportQuality(content, papersFromEvidence),
        evidenceProfile,
        ...reportReviewGate(content, papersFromEvidence),
      });
      await saveTaskLog({
        stage: "review",
        title: "热点离线证据报告生成",
        status: "done",
        inputSummary: `${selected.title} / SQLite 证据包 / ${papersFromEvidence.length} 篇代表论文`,
        outputSummary: "已从 SQLite 热点证据包生成离线报告并保存到报告库。",
        rawInput: JSON.stringify({ hotspotId: selected.id, evidenceSource: "sqlite-hotspot-evidence", paperIds: papersFromEvidence.map((paper) => paper.id) }, null, 2),
        rawOutput: content,
        durationMs: Math.round(performance.now() - started),
      });
      await onRefresh();
      onNotice("离线证据报告已保存到报告库。");
    } catch (error) {
      const message = error instanceof Error ? error.message : "离线证据报告生成失败。";
      await saveTaskLog({
        stage: "review",
        title: "热点离线证据报告生成",
        status: "failed",
        inputSummary: selected.title,
        outputSummary: "",
        error: message,
        durationMs: Math.round(performance.now() - started),
      });
      await onRefresh();
      onNotice(message, "error");
    } finally {
      setBusy("");
    }
  }

  async function generateSelectedHotspotReport() {
    if (!reportModeReady || busy) return;
    if (reportMode === "offline") {
      await generateOfflineEvidenceReport();
      return;
    }
    await generateFromHotspot(reportMode);
  }

  return (
    <div className="split-workspace hotspot-library-workspace">
      <aside className="list-panel hotspot-list-panel">
        <div className="flex items-center justify-between gap-3 px-4 pt-4">
          <div className="panel-title">
            <Atom size={17} />
            热点库
          </div>
          <span className="text-xs text-ink/45">
            {onlySeedHotspots
              ? `样例热点 ${filteredHotspots.length} / ${hotspots.length}`
              : hasSeedHotspots
                ? `${filteredHotspots.length} / ${hotspots.length}（样例 ${seedHotspotCount}）`
                : `${filteredHotspots.length} / ${hotspots.length}`}
          </span>
        </div>
        {hasSeedHotspots && (
          <div className="mx-3 mt-3 rounded-[10px] border border-amber/20 bg-amber/[0.055] p-3" role="note" aria-label="样例热点说明">
            <div className="flex items-start gap-2.5">
              <FlaskConical className="mt-0.5 shrink-0 text-amber/80" size={16} />
              <div className="min-w-0 flex-1">
                <strong className="block text-xs font-semibold text-amber/90">
                  {onlySeedHotspots ? "当前展示的是内置样例热点" : `当前包含 ${seedHotspotCount} 个样例热点`}
                </strong>
                <p className="mt-1 text-xs leading-5 text-ink/55">
                  {onlySeedHotspots
                    ? `这 ${seedHotspotCount} 个热点用于演示界面，并非基于当前 SQLite 论文库生成。运行“热点建模”后，样例会由真实聚类结果替换。`
                    : "带“样例”标记的内容仅用于演示，不代表本地论文聚类结果。"}
                </p>
                <button
                  type="button"
                  className="mt-2 inline-flex items-center gap-1.5 rounded-[6px] text-xs font-medium text-cyan/85 transition hover:text-cyan focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/45"
                  onClick={() => onNavigate("pipeline")}
                >
                  前往热点建模
                  <ArrowRight size={13} />
                </button>
              </div>
            </div>
          </div>
        )}
        <div className="space-y-2 p-3">
          <input className="field-control h-10 w-full px-3 text-sm" value={hotspotQuery} onChange={(event) => setHotspotQuery(event.target.value)} placeholder="搜索标题、摘要、关键词" />
          <div className="grid grid-cols-2 gap-2">
            <SelectControl className="h-10 text-sm" value={hotspotField} options={[{ value: "all", label: "全部学科" }, ...hotspotFields.map((field) => ({ value: field, label: field }))]} onChange={setHotspotField} />
            <SelectControl
              className="h-10 text-sm"
              value={hotspotTrend}
              options={[
                { value: "all", label: "全部趋势" },
                { value: "Surging", label: "快速上升" },
                { value: "Stable", label: "稳定发展" },
                { value: "Declining", label: "热度下降" },
                { value: "Unknown", label: "趋势待定" },
              ]}
              onChange={(value) => setHotspotTrend(value as Hotspot["trend"] | "all")}
            />
          </div>
        </div>
        <div className="space-y-2 px-3 pb-4">
          {filteredHotspots.map((hotspot) => (
            <button
              key={hotspot.id}
              type="button"
              className={`hotspot-row ${selected?.id === hotspot.id ? "hotspot-row-active" : ""}`}
              data-hotspot-source={hotspot.source ?? "unknown"}
              onClick={() => setSelectedId(hotspot.id)}
            >
              <div className="flex items-start justify-between gap-2">
                <span>{hotspot.title}</span>
                {hotspot.source === "seed" && (
                  <em className="shrink-0 rounded-[6px] border border-amber/25 bg-amber/[0.08] px-1.5 py-0.5 text-[10px] font-semibold leading-none text-amber/85 not-italic">
                    样例
                  </em>
                )}
              </div>
              <small>{hotspotTrendLabel(hotspot.trend)} · {hotspot.paperCount} 篇 · {Math.round((hotspot.confidence ?? 0) * 100)}%</small>
            </button>
          ))}
          {filteredHotspots.length === 0 && <div className="px-2 py-8 text-center text-sm leading-6 text-ink/45">没有匹配的科研热点。</div>}
        </div>
      </aside>

      <section className="detail-panel hotspot-detail-panel">
        {selected && draft ? (
          <div
            className={`hotspot-detail-shell ${editorOpen ? "hotspot-editor-active" : ""}`}
            data-evidence-cache-state={hotspotEvidenceDiagnostics?.evidenceCacheState ?? "none"}
            data-evidence-request-sequence={hotspotEvidenceDiagnostics?.requestSequence ?? 0}
            data-evidence-requested={hotspotEvidenceDiagnostics?.requestedRepresentativeCount ?? 0}
            data-evidence-found={hotspotEvidenceDiagnostics?.foundRepresentativeCount ?? 0}
            data-evidence-missing={hotspotEvidenceDiagnostics?.missingRepresentativeCount ?? 0}
            data-evidence-full-recluster="false"
          >
            <main className="hotspot-results-pane">
              <div className="hotspot-results-inner">
                <div className="hotspot-result-header">
                  <div className="min-w-0">
                    <p className="eyebrow">{selected.field}</p>
                    <h1>{selected.title}</h1>
                    <p className="hotspot-result-summary">{selected.summary}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <button className={`secondary-action h-10 gap-2 ${editorOpen ? "border-cyan/35 text-cyan" : ""}`} onClick={() => setEditorOpen((value) => !value)} aria-expanded={editorOpen}>
                      <Edit3 size={15} />
                      编辑热点
                    </button>
                    <div className="report-export-control" ref={moreMenuRef}>
                      <button className="secondary-action h-10 gap-2" onClick={() => setMoreMenuOpen((value) => !value)} aria-expanded={moreMenuOpen} aria-haspopup="menu">
                        <MoreHorizontal size={15} />
                        更多操作
                        <ChevronDown className={moreMenuOpen ? "rotate-180 transition" : "transition"} size={14} />
                      </button>
                      {moreMenuOpen && (
                        <div className="report-export-menu hotspot-more-menu" role="menu">
                          <button type="button" role="menuitem" disabled={Boolean(busy) || hotspotEvidenceStatus !== "ready" || !activeHotspotEvidence} onClick={() => { setMoreMenuOpen(false); void exportSelectedEvidenceBundle(); }}>
                            {busy === "evidence-export" ? <Loader2 className="animate-spin" size={15} /> : <Download size={15} />}
                            <span><strong>导出 SQLite 证据包</strong><small>{hotspotEvidenceStatus === "ready" && activeHotspotEvidence ? "导出 JSON 与 Markdown" : "证据包尚未就绪"}</small></span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="report-status-line hotspot-status-line">
                  <span>{selected.field}</span>
                  <span>{hotspotTrendLabel(selected.trend)}</span>
                  <span><strong>{selected.paperCount}</strong> 篇论文</span>
                  <span>置信度 <strong>{Math.round((selected.confidence ?? 0) * 100)}%</strong></span>
                  <span className={hotspotEvidenceStatus === "ready" && activeHotspotEvidence ? "text-cyan/80" : hotspotEvidenceStatus === "loading" ? "text-ink/55" : "text-amber/80"}>
                    {hotspotEvidenceStatus === "loading"
                      ? "正在按代表 ID 查询"
                      : hotspotEvidenceStatus === "ready" && activeHotspotEvidence
                        ? `代表 ID 证据就绪 · ${activeHotspotEvidence.representativePapers.length} 篇 · ${hotspotEvidenceDiagnostics?.evidenceCacheState ?? "miss"} ${Math.round(hotspotEvidenceDiagnostics?.evidenceLoadMs ?? 0)}ms`
                        : hotspotEvidenceStatus === "missing-evidence"
                          ? "缺少持久化代表 ID"
                          : "持久化证据不可用"}
                  </span>
                </div>
                <div className="hotspot-keyword-line">
                  <span>关键词</span>
                  <p>{selected.keywords.join("、") || "暂无关键词"}</p>
                  <small>{hotspotSourceLabel(selected.source)}</small>
                </div>

                {hotspotEvidenceStatus === "loading" && <div className="hotspot-evidence-notice">正在按持久化代表论文 ID 精确读取 SQLite，页面导航不会触发全库聚类。</div>}
                {hotspotEvidenceStatus === "missing-evidence" && <div className="hotspot-evidence-notice hotspot-evidence-warning">当前热点没有持久化代表论文 ID。请前往流水线重新运行热点聚类；报告和证据导出已禁用。</div>}
                {hotspotEvidenceStatus === "unavailable" && <div className="hotspot-evidence-notice hotspot-evidence-warning">持久化代表论文在 SQLite 中不可用。请检查论文库或重新运行热点聚类；不会使用同领域论文替代。</div>}
                {hotspotEvidenceStatus === "ready" && (hotspotEvidenceDiagnostics?.missingRepresentativeCount ?? 0) > 0 && <div className="hotspot-evidence-notice hotspot-evidence-warning">已按 ID 找到 {hotspotEvidenceDiagnostics?.foundRepresentativeCount} 篇代表论文，另有 {hotspotEvidenceDiagnostics?.missingRepresentativeCount} 个持久化 ID 在当前 SQLite 中缺失。</div>}

                <div className="hotspot-result-grid">
                  <section className="hotspot-result-block">
                    <div className="panel-title">
                      <Activity size={16} />
                      年份演化
                    </div>
                    <div className="hotspot-evolution-list">
                      {displayEvolution.slice(-8).map((item) => (
                        <div key={item.year} className="hotspot-evolution-row">
                          <span>{item.year}</span>
                          <div><i style={{ width: `${Math.max(4, (item.count / evolutionMax) * 100)}%` }} /></div>
                          <strong>{item.count}</strong>
                          <small>{item.keywords.slice(0, 2).join("、") || "无关键词"}</small>
                        </div>
                      ))}
                      {displayEvolution.length === 0 && <div className="hotspot-result-empty">暂无年份演化数据。</div>}
                    </div>
                  </section>

                  <section className="hotspot-result-block">
                    <div className="panel-title">
                      <Database size={16} />
                      来源分布
                    </div>
                    <div className="hotspot-source-list">
                      {displaySources.map((item) => (
                        <div key={item.value} className="source-row">
                          <span>{item.value}</span>
                          <div className="source-bar"><div style={{ width: `${Math.max(4, (item.count / sourceMax) * 100)}%` }} /></div>
                          <strong>{item.count}</strong>
                        </div>
                      ))}
                      {displaySources.length === 0 && <div className="hotspot-result-empty">暂无来源分布数据。</div>}
                    </div>
                  </section>
                </div>

                <section className="hotspot-result-block hotspot-paper-section">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="panel-title">
                      <BookOpen size={16} />
                      代表论文
                    </div>
                    <span className="text-xs text-ink/45">展示 {Math.min(8, reportPapers.length)} / {reportPapers.length}</span>
                  </div>
                  {hotspotEvidenceStatus === "loading" ? (
                    <div className="hotspot-paper-loading" aria-label="正在加载代表论文">
                      {[0, 1, 2, 3].map((item) => <span key={item} />)}
                    </div>
                  ) : (
                    <div className="hotspot-paper-list">
                      {reportPapers.slice(0, 8).map((paper, index) => (
                        <article key={paper.id} className="hotspot-paper-result">
                          <span>{String(index + 1).padStart(2, "0")}</span>
                          <div>
                            <div className="text-sm font-medium leading-6 text-ink">{paper.title}</div>
                            <div className="mt-1 text-xs text-ink/40">{paper.source} · {paper.year ?? "未知年份"} · {paper.field}</div>
                            <p className="mt-2 line-clamp-2 text-sm leading-6 text-ink/55">{paper.abstract}</p>
                          </div>
                        </article>
                      ))}
                      {reportPapers.length === 0 && <div className="hotspot-result-empty">暂无可验证的持久化代表论文，请先在流水线中重新运行热点聚类。</div>}
                    </div>
                  )}
                </section>

                <section className="hotspot-report-generator">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="panel-title">
                        <FlaskConical size={16} />
                        生成热点报告
                      </div>
                      <p className="mt-2 text-sm leading-6 text-ink/50">{reportModeHint}</p>
                    </div>
                    <div className="hotspot-report-mode-switch" role="group" aria-label="热点报告模式">
                      <button type="button" className={reportMode === "offline" ? "active" : ""} onClick={() => setReportMode("offline")}>离线证据</button>
                      <button type="button" className={reportMode === "simple" ? "active" : ""} onClick={() => setReportMode("simple")}>AI 简版</button>
                      <button type="button" className={reportMode === "deep" ? "active" : ""} onClick={() => setReportMode("deep")}>AI 深版</button>
                    </div>
                  </div>

                  {reportMode !== "offline" && (
                    <>
                      <div className="hotspot-workload-line">预估 {workload.words} 字 · {workload.tokens} tokens · {workload.minutes} 分钟</div>
                      <FoldSection title="AI 报告参数" compact>
                        <ReportOptionsPanel options={reportOptions} onChange={setReportOptions} />
                      </FoldSection>
                    </>
                  )}

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button className="primary-action h-10 gap-2" onClick={() => void generateSelectedHotspotReport()} disabled={Boolean(busy) || !reportModeReady}>
                      {reportGenerationBusy ? <Loader2 className="animate-spin" size={15} /> : <Sparkles size={15} />}
                      生成报告
                    </button>
                    {activeAiTaskKey && (
                      <button className="secondary-action h-10 gap-2" onClick={() => void cancelActiveAiReport()}>
                        <Square size={14} />取消 AI 任务
                      </button>
                    )}
                  </div>
                </section>
              </div>
            </main>

            {editorOpen && <button type="button" className="report-tools-backdrop" aria-label="关闭热点编辑" onClick={() => setEditorOpen(false)} />}
            {editorOpen && (
              <aside className="report-tools-drawer hotspot-editor-drawer" aria-label="编辑热点">
                <div className="report-tools-header">
                  <div>
                    <div className="panel-title">
                      <Edit3 size={16} />
                      编辑热点
                    </div>
                    <p>修订热点标题、学科、摘要与关键词</p>
                  </div>
                  <button type="button" onClick={() => setEditorOpen(false)} aria-label="关闭热点编辑"><X size={17} /></button>
                </div>
                <div className="report-tools-content">
                  <div className="grid gap-3">
                    <label className="field-label">标题<input className="field-control h-10 px-3" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
                    <label className="field-label">学科<input className="field-control h-10 px-3" value={draft.field} onChange={(event) => setDraft({ ...draft, field: event.target.value })} /></label>
                    <label className="field-label">摘要<textarea className="field-control min-h-[150px] p-3" value={draft.summary} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} /></label>
                    <label className="field-label">关键词（逗号分隔）<input className="field-control h-10 px-3" value={draft.keywords.join(", ")} onChange={(event) => setDraft({ ...draft, keywords: event.target.value.split(/[,，]/).map((item) => item.trim()).filter(Boolean) })} /></label>
                    <button className="primary-action h-10 gap-2" onClick={() => void saveDraft()}>
                      <Save size={15} />
                      保存热点
                    </button>
                  </div>
                </div>
              </aside>
            )}
          </div>
        ) : (
          <div className="p-5"><EmptyState title="暂无热点" description={hotspots.length === 0 ? "运行热点聚类 worker 后可查看真实聚类结果。" : "当前筛选条件下没有匹配的热点。"} /></div>
        )}
      </section>
    </div>
  );
}

function ReportLibrary({ reports, papers, settings, activeProject, onRefresh, onNotice }: { reports: ResearchReport[]; papers: Paper[]; settings: AiSettings | null; activeProject: Project | null; onRefresh: () => Promise<void>; onNotice: AppNoticeHandler }) {
  const [selectedId, setSelectedId] = useState(reports[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<ResearchReport["mode"] | "all">("all");
  const [sort, setSort] = useState<"newest" | "oldest" | "topic">("newest");
  const [busy, setBusy] = useState(false);
  const [sectionFocus, setSectionFocus] = useState("三、挑战与发展趋势");
  const [selectedPapers, setSelectedPapers] = useState<Paper[]>([]);
  const [missingPaperIds, setMissingPaperIds] = useState<string[]>([]);
  const [bindingLoading, setBindingLoading] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  const filteredReports = useMemo(() => {
    const value = query.trim().toLowerCase();
    const rows = reports.filter((report) => {
      const matchesText = !value || `${report.topic} ${report.discipline} ${report.content}`.toLowerCase().includes(value);
      const matchesMode = mode === "all" || report.mode === mode;
      return matchesText && matchesMode;
    });
    return rows.sort((a, b) => sort === "topic" ? a.topic.localeCompare(b.topic) : sort === "oldest" ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt));
  }, [mode, query, reports, sort]);
  const selected = filteredReports.find((report) => report.id === selectedId) ?? filteredReports[0] ?? reports[0];
  const canUseEvidence = Boolean(selected && !bindingLoading && selectedPapers.length > 0 && missingPaperIds.length === 0);
  const audit = useMemo<ReportAudit | null>(() => (selected ? selected.auditSnapshot ?? auditReport(selected.content, selectedPapers) : null), [selected, selectedPapers]);
  const formalExportAllowed = selected?.reviewStatus === "approved";
  const evidenceProfile = useMemo(() => (selected ? selected.evidenceProfile ?? buildReportEvidenceProfile(selectedPapers) : null), [selected, selectedPapers]);
  const selectedModeLabel = selected ? ({ simple: "简版", deep: "深版", revised: "修订版" } as Record<ResearchReport["mode"], string>)[selected.mode] : "";
  const boundPaperIdCount = selected ? new Set(selected.paperIds ?? []).size : 0;

  useEffect(() => {
    if (!filteredReports.some((report) => report.id === selectedId)) setSelectedId(filteredReports[0]?.id ?? "");
  }, [filteredReports, selectedId]);

  useEffect(() => {
    setExportMenuOpen(false);
  }, [selected?.id]);

  useEffect(() => {
    if (!exportMenuOpen && !toolsOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setExportMenuOpen(false);
      setToolsOpen(false);
    }
    function handlePointerDown(event: MouseEvent) {
      if (exportMenuOpen && exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setExportMenuOpen(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [exportMenuOpen, toolsOpen]);

  useEffect(() => {
    let cancelled = false;
    async function loadBoundPapers() {
      if (!selected) {
        setSelectedPapers([]);
        setMissingPaperIds([]);
        setBindingLoading(false);
        return;
      }
      const paperIds = Array.from(new Set(selected.paperIds ?? []));
      if (paperIds.length === 0) {
        setSelectedPapers([]);
        setMissingPaperIds([]);
        setBindingLoading(false);
        return;
      }

      setBindingLoading(true);
      try {
        const rows = settings && activeProject
          ? await getPapersByIds(settings.databaseDir, activeProject.id, paperIds)
          : papers.filter((paper) => paperIds.includes(paper.id));
        if (cancelled) return;
        const foundIds = new Set(rows.map((paper) => paper.id));
        setSelectedPapers(rows);
        setMissingPaperIds(paperIds.filter((id) => !foundIds.has(id)));
      } catch (error) {
        if (cancelled) return;
        setSelectedPapers([]);
        setMissingPaperIds(paperIds);
        onNotice(error instanceof Error ? error.message : "报告绑定文献加载失败。", "error");
      } finally {
        if (!cancelled) setBindingLoading(false);
      }
    }

    void loadBoundPapers();
    return () => {
      cancelled = true;
    };
  }, [activeProject, onNotice, papers, selected, settings]);

  async function exportSelected(format: "md" | "html") {
    if (!selected) return;
    if (!formalExportAllowed) {
      onNotice("该报告仍是待复核草稿，人工确认或修订后才能正式导出。");
      return;
    }
    if (format === "html" && !canUseEvidence) {
      onNotice("HTML 证据导出需要完整绑定文献；可先导出 Markdown 原文。");
      return;
    }
    const dir = settings?.exportDir || await chooseExportDirectory("选择报告导出目录");
    const extension = format === "html" ? "html" : "md";
    const fileName = `${selected.topic}_${selected.mode}_${selected.createdAt.slice(0, 10)}.${extension}`.replace(/[\\/:*?"<>|]/g, "_");
    const content = format === "html" ? reportToHtml(selected, selectedPapers) : selected.content;
    await writeTextFile(dir ? `${dir}\\${fileName}` : fileName, content);
    onNotice(format === "html" ? "HTML 报告已导出。" : "Markdown 报告已导出。");
  }

  async function approveSelectedReport() {
    if (!selected) return;
    await approveReport(selected.id, "local-user");
    await onRefresh();
    onNotice("已人工确认报告，可进行正式导出。");
  }

  async function regenerateSection() {
    if (!selected || !settings) return;
    if (!canUseEvidence) {
      onNotice("章节重写需要完整绑定文献，请先修复或重新生成报告证据。");
      return;
    }
    if (!sectionFocus.trim()) {
      onNotice("请填写需要重写的章节名称。");
      return;
    }
    setBusy(true);
    try {
      const generated = await reviseResearchReport({
        topic: selected.topic,
        papers: selectedPapers,
        originalReport: selected.content,
        feedback: `只重点重写“${sectionFocus.trim()}”这一章节，补强引用、证据比较和逻辑衔接；其他章节尽量保持原结构和原意。`,
        discipline: selected.discipline,
        settings,
      });
      await saveReport({
        topic: selected.topic,
        mode: "revised",
        discipline: selected.discipline,
        content: generated.content,
        paperIds: selectedPapers.map((paper) => paper.id),
        metrics: generated.metrics,
        evidenceProfile: generated.evidenceProfile,
        ...reportReviewGate(generated.content, selectedPapers),
      });
      await onRefresh();
      onNotice("指定章节重写版已保存为修订报告。");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "章节重写失败。", "error");
    } finally {
      setBusy(false);
    }
  }

  async function importHistoryReports() {
    setBusy(true);
    try {
      const rows = await readMarkdownExports();
      const count = await importMarkdownReports(rows);
      await onRefresh();
      onNotice(`历史 Markdown 报告导入完成：新增 ${count} 份。`);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "历史报告导入失败。", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="split-workspace report-library-workspace">
      <aside className="list-panel report-list-panel">
        <div className="flex items-center justify-between gap-3 px-4 pt-4">
          <div className="panel-title">
            <FileText size={17} />
            报告库
          </div>
          <span className="text-xs text-ink/45">{filteredReports.length} 份</span>
        </div>
        <div className="space-y-2 p-3">
          <input className="field-control h-10 w-full px-3 text-sm" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索主题、学科、正文" />
          <div className="grid grid-cols-2 gap-2">
            <SelectControl className="h-10 text-sm" value={mode} options={[{ value: "all", label: "全部类型" }, { value: "simple", label: "简版" }, { value: "deep", label: "深版" }, { value: "revised", label: "修订版" }]} onChange={(value) => setMode(value as ResearchReport["mode"] | "all")} />
            <SelectControl className="h-10 text-sm" value={sort} options={[{ value: "newest", label: "最新" }, { value: "oldest", label: "最早" }, { value: "topic", label: "主题" }]} onChange={(value) => setSort(value as "newest" | "oldest" | "topic")} />
          </div>
          <FoldSection title="更多操作" compact>
            <button className="secondary-action h-9 w-full gap-2" onClick={() => void importHistoryReports()} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" size={15} /> : <FileUp size={15} />}
              导入历史 Markdown
            </button>
          </FoldSection>
        </div>
        <div className="space-y-2 px-3 pb-4">
          {filteredReports.map((report) => (
            <button key={report.id} className={`hotspot-row ${selected?.id === report.id ? "hotspot-row-active" : ""}`} onClick={() => setSelectedId(report.id)}>
              <span>{report.topic}</span>
              <small>{report.mode === "simple" ? "简版" : report.mode === "deep" ? "深版" : "修订版"} | {report.reviewStatus === "approved" ? "已批准" : "待复核"} | {formatDateTime(report.createdAt)}</small>
            </button>
          ))}
          {filteredReports.length === 0 && <div className="px-2 py-8 text-center text-sm text-ink/45">没有匹配的报告。</div>}
        </div>
      </aside>

      <section className="detail-panel report-detail-panel">
        {selected ? (
          <div className={`report-detail-shell ${toolsOpen ? "report-tools-active" : ""}`}>
            <main className="report-reader-pane">
              <div className="report-reader-inner">
                <div className="report-reader-header">
                  <div className="min-w-0">
                    <p className="eyebrow">{selected.discipline} / {selectedModeLabel}</p>
                    <h1>{selected.topic}</h1>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <button className={`secondary-action h-10 gap-2 ${toolsOpen ? "border-cyan/35 text-cyan" : ""}`} onClick={() => setToolsOpen((value) => !value)} aria-expanded={toolsOpen}>
                      <Settings size={15} />
                      报告工具
                    </button>
                    <div className="report-export-control" ref={exportMenuRef}>
                      <button className="primary-action h-10 gap-2" disabled={!formalExportAllowed} onClick={() => setExportMenuOpen((value) => !value)} aria-expanded={exportMenuOpen} aria-haspopup="menu" title={formalExportAllowed ? "导出正式报告" : "待复核草稿禁止正式导出"}>
                        <Download size={15} />
                        导出报告
                        <ChevronDown className={exportMenuOpen ? "rotate-180 transition" : "transition"} size={14} />
                      </button>
                      {exportMenuOpen && (
                        <div className="report-export-menu" role="menu">
                          <button type="button" role="menuitem" onClick={() => { setExportMenuOpen(false); void exportSelected("md"); }}>
                            <FileText size={15} />
                            <span><strong>Markdown 原文</strong><small>保留当前报告内容</small></span>
                          </button>
                          <button type="button" role="menuitem" disabled={!canUseEvidence} onClick={() => { setExportMenuOpen(false); void exportSelected("html"); }}>
                            <FileCode2 size={15} />
                            <span><strong>HTML 证据报告</strong><small>{canUseEvidence ? "包含完整绑定证据" : "需要完整绑定文献"}</small></span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="report-status-line">
                  <span>{formatDateTime(selected.createdAt)}</span>
                  <span>覆盖率 <strong>{Math.round(selected.metrics.citationCoverage * 100)}%</strong></span>
                  <span>引用准确率 <strong>{Math.round(selected.metrics.citationAccuracy * 100)}%</strong></span>
                  <span>一致性 <strong>{Math.round(selected.metrics.consistencyScore * 100)}%</strong></span>
                  <span className={canUseEvidence ? "text-cyan/80" : "text-amber/80"}>
                    {bindingLoading ? "正在加载绑定文献" : canUseEvidence ? `证据完整 · ${selectedPapers.length} 篇` : boundPaperIdCount === 0 ? "未绑定证据文献" : "证据不完整"}
                  </span>
                </div>

                {(bindingLoading || !canUseEvidence) && (
                  <div className="report-binding-alert">
                    <div className="flex items-center gap-2 font-medium text-ink">
                      {bindingLoading ? <Loader2 className="animate-spin" size={15} /> : <AlertTriangle size={15} />}
                      {bindingLoading ? "正在从 SQLite 加载绑定文献..." : boundPaperIdCount === 0 ? "报告未绑定证据文献" : "报告绑定文献不完整"}
                    </div>
                    {!bindingLoading && (
                      <div className="mt-2">
                        {boundPaperIdCount === 0 ? "该报告没有可加载的文献 ID。" : `已加载 ${selectedPapers.length} 篇，缺失 ${missingPaperIds.length} 篇。`}Markdown 原文仍可导出，HTML 证据导出和 AI 重写已禁用。
                        {missingPaperIds.length > 0 && <div className="mt-1 break-all text-xs text-ink/45">缺失 ID：{missingPaperIds.slice(0, 8).join("、")}{missingPaperIds.length > 8 ? " ..." : ""}</div>}
                      </div>
                    )}
                  </div>
                )}

                <pre className="report-reader-content">{selected.content}</pre>
              </div>
            </main>

            {toolsOpen && <button type="button" className="report-tools-backdrop" aria-label="关闭报告工具" onClick={() => setToolsOpen(false)} />}
            {toolsOpen && (
              <aside className="report-tools-drawer" aria-label="报告工具">
                <div className="report-tools-header">
                  <div>
                    <div className="panel-title">
                      <Settings size={16} />
                      报告工具
                    </div>
                    <p>证据、审计与指定章节修订</p>
                  </div>
                  <button type="button" onClick={() => setToolsOpen(false)} aria-label="关闭报告工具"><X size={17} /></button>
                </div>

                <div className="report-tools-content">
                  <FoldSection title="绑定文献与证据概览" defaultOpen flush>
                    <div className={`report-binding-summary ${canUseEvidence ? "report-binding-ready" : "report-binding-warning"}`}>
                      {bindingLoading ? "正在读取绑定文献" : canUseEvidence ? `绑定完整，已读取 ${selectedPapers.length} 篇文献` : boundPaperIdCount === 0 ? "当前报告未绑定证据文献" : `已读取 ${selectedPapers.length} 篇，缺失 ${missingPaperIds.length} 篇`}
                    </div>
                    {evidenceProfile && (
                      <>
                        <div className="report-tool-metrics">
                          <div><span>绑定文献</span><strong>{evidenceProfile.paperCount}</strong></div>
                          <div><span>年份范围</span><strong>{evidenceProfile.yearRange}</strong></div>
                          <div><span>代表证据</span><strong>{evidenceProfile.representativePaperIds.length}</strong></div>
                        </div>
                        <div className="report-tool-detail"><span>关联热点</span><p>{evidenceProfile.hotspot?.title ?? "未绑定热点"}</p></div>
                        <div className="report-tool-detail"><span>来源分布</span><p>{evidenceProfile.sourceCounts.map((item) => `${item.value} ${item.count}`).join(" / ") || "暂无"}</p></div>
                        <div className="report-tool-detail"><span>领域分布</span><p>{evidenceProfile.fieldCounts.map((item) => `${item.value} ${item.count}`).join(" / ") || "暂无"}</p></div>
                        <div className="report-tool-detail"><span>关键词网络</span><p>{evidenceProfile.keywordHighlights.slice(0, 10).join("、") || "暂无"}</p></div>
                      </>
                    )}
                  </FoldSection>

                  <FoldSection title="可信度审计" compact>
                    {audit && (
                      <>
                        <div className="report-tool-metrics report-audit-metrics">
                          <div><span>风险</span><strong>{audit.riskLevel}</strong></div>
                          <div><span>有效引用</span><strong>{audit.validCitationCount}</strong></div>
                          <div><span>无效引用</span><strong>{audit.invalidCitationCount}</strong></div>
                          <div><span>未覆盖文献</span><strong>{audit.uncitedPaperCount}</strong></div>
                        </div>
                        <p className="mt-3 text-sm leading-6 text-ink/55">{audit.coverageExplanation}</p>
                        <div className="report-audit-line">证据概览：{audit.evidenceProfilePresent ? "已写入" : "缺失"} · 缺失章节 {audit.missingRequiredSections.length}</div>
                        <div className="report-audit-line">复核状态：{selected.reviewStatus === "approved" ? `已批准${selected.reviewedBy ? ` · ${selected.reviewedBy}` : ""}` : "待人工复核，正式导出已锁定"}</div>
                        {audit.missingRequiredSections.length > 0 && <div className="report-tool-warning">缺少核心章节：{audit.missingRequiredSections.join("、")}。</div>}
                        {audit.unreferencedParagraphs.length > 0 && <div className="report-tool-warning">有 {audit.unreferencedParagraphs.length} 段可能缺少引用或证据支撑，建议人工确认。</div>}
                        {selected.reviewStatus !== "approved" && <button type="button" className="secondary-action mt-3 h-9 w-full" onClick={() => void approveSelectedReport()}>人工确认并允许导出</button>}
                      </>
                    )}
                  </FoldSection>

                  <FoldSection title="指定章节重写" compact>
                    <div className="grid gap-3">
                      <label className="field-label text-xs">
                        章节标题
                        <input className="field-control h-10 px-3" value={sectionFocus} onChange={(event) => setSectionFocus(event.target.value)} placeholder="例如：二、主要研究进展" />
                      </label>
                      <button className="secondary-action h-10 gap-2" onClick={() => void regenerateSection()} disabled={busy || !settings || !canUseEvidence}>
                        {busy ? <Loader2 className="animate-spin" size={15} /> : <RefreshCw size={15} />}
                        重写章节
                      </button>
                      {!canUseEvidence && <p className="text-xs leading-5 text-amber/75">需要完整绑定文献后才能使用 AI 重写。</p>}
                    </div>
                  </FoldSection>
                </div>
              </aside>
            )}
          </div>
        ) : (
          <div className="p-5"><EmptyState title="暂无报告" description="从文献工作台或热点库生成第一份报告。" /></div>
        )}
      </section>
    </div>
  );
}

function formatTaskDuration(durationMs: number) {
  if (durationMs < 1000) return `${durationMs} ms`;
  if (durationMs < 60_000) return `${(durationMs / 1000).toFixed(durationMs < 10_000 ? 1 : 0)} 秒`;
  const minutes = Math.floor(durationMs / 60_000);
  const seconds = Math.round((durationMs % 60_000) / 1000);
  return `${minutes} 分 ${seconds} 秒`;
}

function taskStageLabel(stage: TaskLog["stage"]) {
  const labels: Record<TaskLog["stage"], string> = {
    crawl: "文献采集",
    clean: "清洗去重",
    cluster: "热点建模",
    name: "热点命名",
    review: "AI 报告",
    export: "结果导出",
    backup: "数据备份",
    restore: "数据恢复",
    health: "健康检查",
  };
  return labels[stage];
}

function taskStatusLabel(status: TaskLog["status"]) {
  const labels: Record<TaskLog["status"], string> = {
    queued: "等待中",
    running: "进行中",
    cancelled: "已取消",
    done: "已完成",
    failed: "失败",
  };
  return labels[status];
}

function taskErrorSummary(value: string) {
  const firstLine = value.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || value.trim();
  return firstLine.length > 360 ? `${firstLine.slice(0, 360)}…` : firstLine;
}

function PipelineView({
  jobs,
  taskLogs,
  papers,
  hotspots,
  settings,
  activeProject,
  libraryMutationStatus,
  libraryStatus,
  v20Snapshot,
  onNavigate,
  onRefresh,
  onNotice,
  onSpatialStateChange,
}: {
  jobs: PipelineJob[];
  taskLogs: TaskLog[];
  papers: Paper[];
  hotspots: Hotspot[];
  settings: AiSettings;
  activeProject: Project;
  libraryMutationStatus: LibraryMutationStatus | null;
  libraryStatus: PaperLibraryStatus | null;
  v20Snapshot: V20HotspotSnapshot | null;
  onNavigate: (view: ActiveView) => void;
  onRefresh: () => Promise<void>;
  onNotice: AppNoticeHandler;
  onSpatialStateChange?: (state: SideraPipelineSpatialState) => void;
}) {
  const [busyStage, setBusyStage] = useState<string>("");
  const [semanticModeling, setSemanticModeling] = useState<SemanticModelingStatus | null>(null);
  const semanticModelingRequest = useRef(0);
  const hotspotQuality = useMemo(() => buildHotspotQualitySummary(hotspots), [hotspots]);
  const paperCount = libraryStatus?.paperCount ?? papers.length;
  const modeledHotspotCount = hotspots.filter((hotspot) => (
    hotspot.source === "worker"
    || (hotspot.source !== "seed" && Boolean(hotspot.analysis?.evidencePaperIds.length))
  )).length;
  const hasModeledHotspotResult = modeledHotspotCount > 0;
  const analysisProgress = useMemo(() => deriveAnalysisProgress({
    paperCount,
    hotspotCount: hotspots.length,
    jobs,
    snapshot: v20Snapshot,
    databaseKey: settings.databaseDir,
    executionSessionId: PIPELINE_EXECUTION_SESSION_ID,
    activeMutationKind: libraryMutationStatus?.operationKind,
  }), [hotspots.length, jobs, libraryMutationStatus?.operationKind, paperCount, settings.databaseDir, v20Snapshot]);
  const { cleanJob, clusterJob } = analysisProgress;
  const cleanState: PipelineStepState = analysisProgress.cleanState;
  const clusterState: PipelineStepState = analysisProgress.clusterState;
  const currentStepId: PipelineStepId = paperCount === 0
    ? "prepare"
    : cleanState !== "done"
      ? "clean"
      : clusterState !== "done"
        ? "cluster"
        : "result";
  const latestTaskLog = useMemo(
    () => taskLogs
      .filter((log) => log.stage === "clean" || log.stage === "cluster")
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0],
    [taskLogs],
  );
  const anyStageRunning = Boolean(busyStage) || cleanState === "running" || clusterState === "running";
  const currentJob = currentStepId === "clean" ? cleanJob : currentStepId === "cluster" ? clusterJob : undefined;
  const currentState: PipelineStepState = currentStepId === "prepare"
    ? (paperCount > 0 ? "done" : "pending")
    : currentStepId === "clean"
      ? cleanState
      : currentStepId === "cluster"
        ? clusterState
        : (hasModeledHotspotResult ? "done" : "pending");

  useEffect(() => {
    if (!isDesktopRuntime() || (clusterState !== "running" && busyStage !== "cluster")) {
      setSemanticModeling(null);
      return;
    }
    let disposed = false;
    let timer = 0;
    const requestId = ++semanticModelingRequest.current;
    const refresh = async () => {
      try {
        const status = await getSemanticModelingStatus(settings.databaseDir, activeProject.id);
        if (!disposed && requestId === semanticModelingRequest.current) {
          setSemanticModeling(status ?? null);
        }
      } catch {
        // The cluster command remains the authority for final failures; polling is only progress UI.
      }
      if (!disposed) timer = window.setTimeout(() => void refresh(), 650);
    };
    void refresh();
    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, [activeProject.id, busyStage, clusterState, settings.databaseDir]);

  const semanticStageLabel = semanticModeling
    ? ({
        preparing: "准备建模",
        "text-preparation": "准备论文文本",
        "cache-check": "检查 Embedding 缓存",
        embedding: semanticModeling.paused ? "Embedding 推理已暂停" : "分批生成 Embedding",
        projection: "计算语义三维投影",
        committing: "正在安全提交",
        complete: "语义快照已完成",
      } as Record<string, string>)[semanticModeling.stage] ?? semanticModeling.stage
    : "";
  const semanticProgress = semanticModeling
    ? (() => {
        const ratio = semanticModeling.total > 0
          ? Math.min(1, semanticModeling.processed / semanticModeling.total)
          : 0;
        if (semanticModeling.stage === "preparing") return 3;
        if (semanticModeling.stage === "text-preparation") return 7;
        if (semanticModeling.stage === "cache-check") return 10;
        if (semanticModeling.stage === "embedding") return Math.round(10 + ratio * 78);
        if (semanticModeling.stage === "projection") return 91;
        if (semanticModeling.stage === "committing") return 97;
        if (semanticModeling.stage === "complete") return 100;
        return Math.round(ratio * 90);
      })()
    : currentJob?.progress ?? 0;

  useEffect(() => {
    const active = clusterState === "running" || busyStage === "cluster";
    onSpatialStateChange?.({
      active,
      runId: clusterJob?.id,
      stage: semanticModeling?.stage ?? (active ? "cluster" : undefined),
      progress: active ? semanticProgress : clusterState === "done" ? 100 : 0,
      paused: Boolean(semanticModeling?.paused),
    });
  }, [
    busyStage,
    clusterJob?.id,
    clusterState,
    onSpatialStateChange,
    semanticModeling?.paused,
    semanticModeling?.stage,
    semanticProgress,
  ]);

  useEffect(() => () => {
    onSpatialStateChange?.({ active: false, progress: 0, paused: false });
  }, [onSpatialStateChange]);

  async function controlSemanticTask(action: "pause" | "resume" | "cancel") {
    try {
      const status = await controlSemanticModeling(settings.databaseDir, activeProject.id, action);
      setSemanticModeling(status);
      onNotice(
        action === "pause"
          ? "热点建模将在当前批次边界暂停。"
          : action === "resume"
            ? "热点建模已恢复。"
            : "热点建模将在安全边界取消。",
      );
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "无法控制当前热点建模任务。", "error");
    }
  }

  const stepStateLabels: Record<PipelineStepState, string> = {
    pending: "未开始",
    running: "进行中",
    done: "已完成",
    failed: "失败",
  };

  const steps: Array<{
    id: PipelineStepId;
    title: string;
    description: string;
    state: PipelineStepState;
    icon: LucideIcon;
  }> = [
    {
      id: "prepare",
      title: "文献准备",
      description: paperCount > 0 ? `${paperCount.toLocaleString()} 篇文献已进入本地库` : "从检索或导入开始",
      state: paperCount > 0 ? "done" : "pending",
      icon: Search,
    },
    {
      id: "clean",
      title: "清洗去重",
      description: cleanJob?.detail || "规范化标题、摘要并去除重复记录",
      state: cleanState,
      icon: RefreshCw,
    },
    {
      id: "cluster",
      title: "热点建模",
      description: clusterJob?.detail || "生成关键词、演化趋势和热点坐标",
      state: clusterState,
      icon: Network,
    },
    {
      id: "result",
      title: "查看结果",
      description: hasModeledHotspotResult
        ? `已生成 ${modeledHotspotCount} 个热点${analysisProgress.snapshotCurrent ? "，V20 快照已同步" : ""}`
        : hotspots.length > 0
          ? "当前仅有样例热点，请先运行热点建模"
          : "建模完成后查看热点证据",
      state: hasModeledHotspotResult ? "done" : "pending",
      icon: Atom,
    },
  ];

  async function runCleanTask() {
    await runLoggedWorker("clean", papers, settings, onRefresh, onNotice, setBusyStage, activeProject);
  }

  async function runClusterTask() {
    await runLoggedWorker("cluster", papers, settings, onRefresh, onNotice, setBusyStage, activeProject);
  }

  const primaryTask = currentStepId === "prepare"
    ? {
        title: "先准备分析文献",
        description: "当前项目还没有可处理的文献。请先完成在线检索、文件导入或 MySQL 导入。",
        buttonLabel: "前往检索与导入",
        icon: Search,
        action: () => onNavigate("search"),
      }
    : currentStepId === "clean"
      ? {
          title: cleanState === "failed" ? "清洗未完成" : "清洗并规范化本地文献",
          description: cleanState === "failed"
            ? "上次清洗没有完成。请查看下方错误摘要，确认后重新运行当前步骤。"
            : `将处理当前项目的 ${paperCount.toLocaleString()} 篇文献。本次只运行清洗，不会自动开始热点建模。`,
          buttonLabel: cleanState === "running" ? "正在清洗文献" : cleanState === "failed" ? "重试清洗去重" : "开始清洗",
          icon: Play,
          action: () => void runCleanTask(),
        }
      : currentStepId === "cluster"
        ? {
            title: clusterState === "failed" ? "热点建模未完成" : "从清洗结果生成科研热点",
            description: clusterState === "failed"
              ? "上次热点建模没有完成。请查看下方错误摘要，确认后重新运行当前步骤。"
              : "清洗已经完成。开始后将生成热点、代表论文、年度演化与星图坐标。",
            buttonLabel: clusterState === "running" ? "正在生成热点" : clusterState === "failed" ? "重试热点建模" : "开始热点建模",
            icon: Network,
            action: () => void runClusterTask(),
          }
        : {
            title: "热点结果已经准备好",
            description: `当前项目已有 ${hotspots.length} 个热点，可以进入热点库检查结论、证据和报告生成入口。`,
            buttonLabel: "查看热点结果",
            icon: Atom,
            action: () => onNavigate("hotspots"),
          };
  const PrimaryTaskIcon = primaryTask.icon;
  const currentTaskRunning = currentState === "running" || Boolean(busyStage);
  const canRerunClean = cleanState === "done";
  const canRerunCluster = clusterState === "done";

  return (
    <div className="page-grid pipeline-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">数据处理</p>
          <h1>分析流水线</h1>
          <p className="page-subtitle">按顺序完成文献准备、清洗去重和热点建模，每一步完成后再确认下一步。</p>
        </div>
        <button
          type="button"
          className="secondary-action h-10 gap-2"
          onClick={() => onNavigate("search")}
        >
          <ArrowLeft size={16} />
          返回文献工作台
        </button>
      </header>

      <ol className="pipeline-stepper" aria-label="分析流水线进度">
        {steps.map((step, index) => {
          const StepIcon = step.icon;
          return (
            <li key={step.id} className={`pipeline-step pipeline-step-${step.state} ${currentStepId === step.id ? "pipeline-step-current" : ""}`}>
              <div className="pipeline-step-marker" aria-hidden="true">
                {step.state === "done" ? <CheckCircle2 size={18} /> : step.state === "running" ? <Loader2 className="animate-spin" size={18} /> : step.state === "failed" ? <AlertTriangle size={18} /> : <StepIcon size={17} />}
              </div>
              <div className="min-w-0">
                <div className="pipeline-step-heading">
                  <span>{index + 1}. {step.title}</span>
                  <small>{stepStateLabels[step.state]}</small>
                </div>
                <p>{step.description}</p>
              </div>
            </li>
          );
        })}
      </ol>

      <section className={`pipeline-primary-panel pipeline-primary-${currentState}`}>
        <div className="pipeline-primary-copy">
          <div className="pipeline-current-label">当前任务 · {stepStateLabels[currentState]}</div>
          <h2>{primaryTask.title}</h2>
          <p>{primaryTask.description}</p>
          {currentState === "failed" && currentJob?.detail && (
            <div className="pipeline-error-summary"><AlertTriangle size={16} />{currentJob.detail}</div>
          )}
          {currentState === "running" && currentJob && (
            <div className="pipeline-running-progress">
              <div className="flex items-center justify-between gap-3 text-xs text-ink/45">
                <span>{semanticStageLabel || currentJob.detail}</span>
                <span>{semanticProgress}%</span>
              </div>
              <div className="progress-track mt-2"><div style={{ width: `${semanticProgress}%` }} /></div>
              {semanticModeling && (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-ink/45">
                  <span>
                    {semanticModeling.processed.toLocaleString()} / {semanticModeling.total.toLocaleString()}
                    {semanticModeling.cached > 0 ? ` · 缓存 ${semanticModeling.cached.toLocaleString()}` : ""}
                    {semanticModeling.inferred > 0 ? ` · 推理 ${semanticModeling.inferred.toLocaleString()}` : ""}
                    {semanticModeling.provider ? ` · ${semanticModeling.provider}` : ""}
                  </span>
                  <span className="flex gap-2">
                    <button
                      className="secondary-action h-8 gap-1.5"
                      onClick={() => void controlSemanticTask(semanticModeling.paused ? "resume" : "pause")}
                      disabled={!semanticModeling.cancellable}
                    >
                      {semanticModeling.paused ? <Play size={13} /> : <Pause size={13} />}
                      {semanticModeling.paused ? "恢复" : "暂停"}
                    </button>
                    <button
                      className="secondary-action h-8 gap-1.5"
                      onClick={() => void controlSemanticTask("cancel")}
                      disabled={!semanticModeling.cancellable}
                    >
                      <Square size={12} />
                      取消
                    </button>
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
        <button className="primary-action pipeline-primary-button h-10 gap-2" onClick={primaryTask.action} disabled={(currentStepId === "clean" || currentStepId === "cluster") && anyStageRunning}>
          {currentTaskRunning ? <Loader2 className="animate-spin" size={16} /> : <PrimaryTaskIcon size={16} />}
          {primaryTask.buttonLabel}
        </button>
      </section>

      <section className="pipeline-result-panel">
        <div className="pipeline-result-heading">
          <div>
            <p className="eyebrow">最近执行结果</p>
            <h2>{latestTaskLog?.title ?? "尚无处理记录"}</h2>
          </div>
          <button className="pipeline-detail-link" onClick={() => onNavigate("logs")}>查看任务日志</button>
        </div>
        {latestTaskLog ? (
          <>
            <p className={latestTaskLog.status === "failed" ? "text-danger" : "text-ink/60"}>{latestTaskLog.outputSummary || latestTaskLog.error || "该任务没有输出摘要。"}</p>
            <div className="pipeline-result-meta">
              <span>{latestTaskLog.status === "done" ? "已完成" : latestTaskLog.status === "failed" ? "失败" : latestTaskLog.status === "running" ? "进行中" : "等待中"}</span>
              <span>{formatTaskDuration(latestTaskLog.durationMs)}</span>
              <span>{formatDateTime(latestTaskLog.createdAt)}</span>
            </div>
          </>
        ) : (
          <p className="text-ink/45">运行清洗或热点建模后，这里会优先显示结果摘要；原始输入输出保留在任务日志中。</p>
        )}
      </section>

      <div className="pipeline-secondary-sections">
        {(canRerunClean || canRerunCluster) && (
          <FoldSection title="更多操作" compact>
            <div className="flex flex-wrap gap-2">
              {canRerunClean && <button className="secondary-action h-9 gap-2" onClick={() => void runCleanTask()} disabled={anyStageRunning}><RefreshCw size={15} />重新清洗</button>}
              {canRerunCluster && <button className="secondary-action h-9 gap-2" onClick={() => void runClusterTask()} disabled={anyStageRunning}><Network size={15} />重新建模</button>}
            </div>
          </FoldSection>
        )}
        <FoldSection title="质量诊断" compact right={<span className="text-xs font-normal text-ink/40">{hotspotQuality.count > 0 ? `${hotspotQuality.count} 个热点` : "等待建模"}</span>}>
          <div className="pipeline-quality-grid">
            <div className="pipeline-quality-metric"><span>平均置信度</span><strong>{formatPercent(hotspotQuality.confidence)}</strong></div>
            <div className="pipeline-quality-metric"><span>关键词集中度</span><strong>{formatPercent(hotspotQuality.keywordFocus)}</strong></div>
            <div className="pipeline-quality-metric"><span>代表论文覆盖</span><strong>{formatPercent(hotspotQuality.representativeCoverage)}</strong></div>
            <div className="pipeline-quality-metric"><span>证据论文</span><strong>{hotspotQuality.evidenceCount}</strong></div>
            <div className="pipeline-quality-metric"><span>趋势分布</span><strong>{hotspotQuality.trendText}</strong></div>
          </div>
          {hotspotQuality.warningText && <p className="mt-3 text-sm leading-6 text-amber/80">{hotspotQuality.warningText}</p>}
        </FoldSection>
      </div>
    </div>
  );
}

function LogsView({
  taskLogs,
  allTaskLogs,
  projects,
  activeProject,
  papers,
  settings,
  onRefresh,
  onNotice,
}: {
  taskLogs: TaskLog[];
  allTaskLogs: TaskLog[];
  projects: Project[];
  activeProject: Project | null;
  papers: Paper[];
  settings: AiSettings;
  onRefresh: () => Promise<void>;
  onNotice: AppNoticeHandler;
}) {
  const [selectedId, setSelectedId] = useState(taskLogs[0]?.id ?? "");
  const [projectFilter, setProjectFilter] = useState("current");
  const [stageFilter, setStageFilter] = useState<TaskLog["stage"] | "all">("all");
  const [statusFilter, setStatusFilter] = useState<TaskLog["status"] | "all">("all");
  const [busy, setBusy] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);
  const rerunSnapshotRef = useRef<{ stage: TaskLog["stage"]; projectId?: string; existingIds: Set<string> } | null>(null);
  const filteredLogs = useMemo(() => {
    const base = projectFilter === "current" ? taskLogs : allTaskLogs;
    return base
      .filter((log) => {
        const matchesProject = projectFilter === "all" || projectFilter === "current" || log.projectId === projectFilter;
        const matchesStage = stageFilter === "all" || log.stage === stageFilter;
        const matchesStatus = statusFilter === "all" || log.status === statusFilter;
        return matchesProject && matchesStage && matchesStatus;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [allTaskLogs, projectFilter, stageFilter, statusFilter, taskLogs]);
  const selected = filteredLogs.find((log) => log.id === selectedId) ?? filteredLogs[0];
  const selectedProjectName = selected ? projectName(selected.projectId, projects) : "";
  const selectedBelongsToActiveProject = Boolean(selected && activeProject && selected.projectId === activeProject.id);
  const selectedSupportsRerun = Boolean(selected && (["clean", "cluster", "review", "export"] as TaskLog["stage"][]).includes(selected.stage));
  const selectedCanRerun = Boolean(selected && selectedSupportsRerun && selectedBelongsToActiveProject && (selected.status === "done" || selected.status === "failed" || selected.status === "cancelled"));
  const showPrimaryRerun = Boolean(selectedCanRerun && selected?.status === "failed");
  const showSecondaryRerun = Boolean(selectedCanRerun && selected?.status === "done");
  const suggestions = selected?.status === "failed" ? buildLogFixSuggestions(selected.error || selected.outputSummary) : [];
  const resultText = selected
    ? selected.status === "failed"
      ? taskErrorSummary(selected.error || selected.outputSummary || "任务未完成，且没有可用的错误摘要。")
      : selected.status === "running"
        ? selected.outputSummary || "任务正在运行，完成后会在这里显示结果。"
        : selected.status === "queued"
          ? "任务正在等待执行。"
          : selected.status === "cancelled"
            ? selected.outputSummary || "任务已由用户取消。"
          : selected.outputSummary || "任务已完成，但没有输出摘要。"
    : "";
  const ResultIcon = selected?.status === "failed" ? AlertTriangle : selected?.status === "done" ? CheckCircle2 : selected?.status === "running" ? Loader2 : selected?.status === "cancelled" ? X : Square;

  useEffect(() => {
    if (!filteredLogs.some((log) => log.id === selectedId)) setSelectedId(filteredLogs[0]?.id ?? "");
  }, [filteredLogs, selectedId]);

  useEffect(() => {
    const pending = rerunSnapshotRef.current;
    if (!pending) return;
    const nextLog = allTaskLogs.find((log) => log.stage === pending.stage && log.projectId === pending.projectId && !pending.existingIds.has(log.id));
    if (!nextLog) return;
    rerunSnapshotRef.current = null;
    setProjectFilter("current");
    setStatusFilter("all");
    setSelectedId(nextLog.id);
  }, [allTaskLogs]);

  useEffect(() => {
    if (!exportMenuOpen && !moreMenuOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setExportMenuOpen(false);
      setMoreMenuOpen(false);
    }
    function handlePointerDown(event: MouseEvent) {
      if (exportMenuOpen && exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) setExportMenuOpen(false);
      if (moreMenuOpen && moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) setMoreMenuOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [exportMenuOpen, moreMenuOpen]);

  async function clearLogs() {
    if (taskLogs.length === 0) return;
    const confirmed = window.confirm(`确定清空当前项目“${activeProject?.name ?? "未命名"}”的 ${taskLogs.length} 条任务日志吗？此操作不可撤销。`);
    if (!confirmed) return;
    setMoreMenuOpen(false);
    await clearTaskLogs();
    setSelectedId("");
    await onRefresh();
    onNotice("当前项目的任务日志已清空。");
  }

  async function cancelSelectedTask() {
    if (!selected?.taskKey || selected.status !== "running" || busy) return;
    setBusy(true);
    try {
      const cancelled = await cancelAiTask(selected.taskKey);
      onNotice(cancelled ? "已请求取消 AI 任务。" : "AI 任务已经结束或不再运行。");
      await new Promise((resolve) => window.setTimeout(resolve, 250));
      await onRefresh();
    } finally {
      setBusy(false);
    }
  }

  async function rerunSelected() {
    if (!selected || busy) return;
    if (!selectedSupportsRerun) {
      onNotice("该日志类型不支持重新运行。");
      return;
    }
    if (!selectedBelongsToActiveProject) {
      onNotice(`请先切换到项目“${selectedProjectName}”，再重新运行该任务。`);
      return;
    }
    if (selected.status !== "done" && selected.status !== "failed") {
      onNotice("等待中或运行中的任务不能重复启动。");
      return;
    }
    const logToRerun = selected;
    rerunSnapshotRef.current = {
      stage: logToRerun.stage,
      projectId: activeProject?.id,
      existingIds: new Set(allTaskLogs.map((log) => log.id)),
    };
    setMoreMenuOpen(false);
    setBusy(true);
    try {
      if (logToRerun.stage === "clean" || logToRerun.stage === "cluster") {
        await runLoggedWorker(logToRerun.stage, papers, settings, onRefresh, onNotice, () => undefined, activeProject ?? undefined);
      } else if (logToRerun.stage === "export") {
        const rows = await readMarkdownExports();
        const count = await importMarkdownReports(rows);
        await saveTaskLog({ stage: "export", title: "重跑历史报告导入", status: "done", inputSummary: `${rows.length} 个 Markdown 文件`, outputSummary: `新增 ${count} 份`, durationMs: 0 });
        await onRefresh();
      } else if (logToRerun.stage === "review") {
        const payload = JSON.parse(logToRerun.rawInput || "{}") as {
          topic?: string;
          mode?: Extract<ResearchReport["mode"], "simple" | "deep">;
          discipline?: string;
          options?: ReportGenerationOptions;
          paperIds?: string[];
        };
        const paperIds = Array.from(new Set(payload.paperIds ?? []));
        if (!payload.topic || !payload.mode || paperIds.length === 0) throw new Error("日志缺少可重跑的报告参数或文献。");
        const reviewPapers = activeProject
          ? await getPapersByIds(settings.databaseDir, activeProject.id, paperIds)
          : papers.filter((paper) => paperIds.includes(paper.id));
        const foundIds = new Set(reviewPapers.map((paper) => paper.id));
        const missingIds = paperIds.filter((id) => !foundIds.has(id));
        if (reviewPapers.length === 0 || missingIds.length > 0) {
          throw new Error(`日志绑定文献缺失 ${missingIds.length}/${paperIds.length}：${missingIds.slice(0, 8).join("、")}${missingIds.length > 8 ? " ..." : ""}`);
        }
        const started = performance.now();
        const generated = await generateResearchReport({
          topic: payload.topic,
          papers: reviewPapers,
          mode: payload.mode,
          discipline: payload.discipline ?? "未指定学科",
          settings,
          options: payload.options ?? defaultReportOptions,
        });
        await saveReport({
          topic: payload.topic,
          mode: payload.mode,
          discipline: payload.discipline ?? "未指定学科",
          content: generated.content,
          paperIds: reviewPapers.map((paper) => paper.id),
          metrics: generated.metrics,
          evidenceProfile: generated.evidenceProfile,
          ...reportReviewGate(generated.content, reviewPapers),
        });
        await saveTaskLog({
          stage: "review",
          title: "重跑 AI 综述生成",
          status: "done",
          inputSummary: `${payload.topic} / ${payload.mode} / ${reviewPapers.length} 篇文献`,
          outputSummary: "已从日志参数重跑并保存报告。",
          rawInput: logToRerun.rawInput,
          rawOutput: generated.content,
          durationMs: Math.round(performance.now() - started),
        });
        await onRefresh();
        onNotice("AI 综述已从日志重跑并保存。");
      }
    } catch (error) {
      rerunSnapshotRef.current = null;
      onNotice(error instanceof Error ? error.message : "任务重跑失败。", "error");
    } finally {
      setBusy(false);
    }
  }

  function copySelected() {
    if (!selected) return;
    const content = [
      selected.title,
      `项目：${selectedProjectName}`,
      `类型：${taskStageLabel(selected.stage)}`,
      `状态：${taskStatusLabel(selected.status)}`,
      `时间：${formatDateTime(selected.createdAt)}`,
      `耗时：${formatTaskDuration(selected.durationMs)}`,
      `输入摘要：\n${selected.inputSummary || "无"}`,
      `输出摘要：\n${selected.outputSummary || "无"}`,
      selected.error ? `完整错误：\n${selected.error}` : "",
      selected.rawInput ? `原始输入：\n${selected.rawInput}` : "",
      selected.rawOutput ? `原始输出：\n${selected.rawOutput}` : "",
    ].filter(Boolean).join("\n\n");
    void navigator.clipboard?.writeText(content);
    onNotice("日志内容已复制。");
  }

  async function exportLogs(format: "json" | "md") {
    setExportMenuOpen(false);
    const rows = filteredLogs;
    const fileName = `research-task-logs-${new Date().toISOString().replace(/[:.]/g, "-")}.${format}`;
    const content =
      format === "json"
        ? JSON.stringify(rows, null, 2)
        : rows.map((log) => `## ${log.title}\n\n- 项目：${projectName(log.projectId, projects)}\n- 类型：${taskStageLabel(log.stage)}\n- 状态：${taskStatusLabel(log.status)}\n- 时间：${formatDateTime(log.createdAt)}\n- 耗时：${formatTaskDuration(log.durationMs)}\n\n### 输入摘要\n${log.inputSummary || "无"}\n\n### 执行结果\n${log.outputSummary || log.error || "无"}\n`).join("\n");
    const dir = settings.exportDir || await chooseExportDirectory("选择日志导出目录");
    await writeTextFile(dir ? `${dir}\\${fileName}` : fileName, content);
    onNotice(format === "json" ? "日志 JSON 已导出。" : "日志 Markdown 已导出。");
  }

  return (
    <div className="split-workspace log-workspace">
      <aside className="list-panel log-list-panel">
        <div className="log-list-header">
          <div className="panel-title"><Database size={17} />任务日志</div>
          <span>{filteredLogs.length} 条</span>
        </div>
        <div className="space-y-2 p-3">
          <SelectControl className="h-10 text-sm" value={projectFilter} options={[{ value: "current", label: `当前项目：${activeProject?.name ?? "未命名"}` }, { value: "all", label: "全部项目" }, ...projects.map((project) => ({ value: project.id, label: project.name }))]} onChange={setProjectFilter} />
          <div className="grid grid-cols-2 gap-2">
            <SelectControl className="h-10 text-sm" value={stageFilter} options={[{ value: "all", label: "全部类型" }, ...(["crawl", "clean", "cluster", "name", "review", "export", "backup", "restore", "health"] as TaskLog["stage"][]).map((stage) => ({ value: stage, label: taskStageLabel(stage) }))]} onChange={(value) => setStageFilter(value as TaskLog["stage"] | "all")} />
            <SelectControl className="h-10 text-sm" value={statusFilter} options={[{ value: "all", label: "全部状态" }, ...(["queued", "running", "cancelled", "done", "failed"] as TaskLog["status"][]).map((status) => ({ value: status, label: taskStatusLabel(status) }))]} onChange={(value) => setStatusFilter(value as TaskLog["status"] | "all")} />
          </div>
        </div>
        <div className="log-list-actions">
          <div className="report-export-control" ref={exportMenuRef}>
            <button className="secondary-action h-9 gap-2" onClick={() => { setMoreMenuOpen(false); setExportMenuOpen((value) => !value); }} disabled={filteredLogs.length === 0} aria-expanded={exportMenuOpen} aria-haspopup="menu">
              <Download size={15} />导出日志<ChevronDown className={exportMenuOpen ? "rotate-180 transition" : "transition"} size={14} />
            </button>
            {exportMenuOpen && (
              <div className="report-export-menu log-list-menu" role="menu">
                <button type="button" role="menuitem" onClick={() => void exportLogs("json")}>
                  <FileCode2 size={15} />
                  <span><strong>JSON 数据</strong><small>导出当前筛选的 {filteredLogs.length} 条完整日志</small></span>
                </button>
                <button type="button" role="menuitem" onClick={() => void exportLogs("md")}>
                  <FileText size={15} />
                  <span><strong>Markdown 摘要</strong><small>使用中文任务类型与状态</small></span>
                </button>
              </div>
            )}
          </div>
          <div className="report-export-control" ref={moreMenuRef}>
            <button className="secondary-action h-9 gap-2" onClick={() => { setExportMenuOpen(false); setMoreMenuOpen((value) => !value); }} aria-expanded={moreMenuOpen} aria-haspopup="menu">
              <MoreHorizontal size={15} />更多操作<ChevronDown className={moreMenuOpen ? "rotate-180 transition" : "transition"} size={14} />
            </button>
            {moreMenuOpen && (
              <div className="report-export-menu log-list-menu" role="menu">
                <button className="log-danger-menu-item" type="button" role="menuitem" onClick={() => void clearLogs()} disabled={taskLogs.length === 0 || busy}>
                  <Trash2 size={15} />
                  <span><strong>清空当前项目日志</strong><small>{taskLogs.length > 0 ? `将清除 ${taskLogs.length} 条记录，需要再次确认` : "当前项目没有可清理的日志"}</small></span>
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="log-list-rows">
          {filteredLogs.map((log) => (
            <button key={log.id} className={`log-row log-row-${log.status} ${selected?.id === log.id ? "log-row-active" : ""}`} onClick={() => setSelectedId(log.id)}>
              <span className="log-row-heading"><strong>{log.title}</strong><small>{taskStatusLabel(log.status)}</small></span>
              <span className="log-row-meta"><small>{formatDateTime(log.createdAt)}</small><small>{formatTaskDuration(log.durationMs)}</small></span>
            </button>
          ))}
          {filteredLogs.length === 0 && <div className="log-list-empty">没有匹配的任务日志。</div>}
        </div>
      </aside>
      <section className="detail-panel log-detail-panel">
        {selected ? (
          <div className="log-detail-inner">
            <div className="log-detail-header">
              <div className="min-w-0"><p className="eyebrow">{taskStageLabel(selected.stage)}</p><h1>{selected.title}</h1></div>
              {showPrimaryRerun && (
                <button className="primary-action h-10 shrink-0 gap-2" onClick={() => void rerunSelected()} disabled={busy}>
                  {busy ? <Loader2 className="animate-spin" size={15} /> : <RefreshCw size={15} />}
                  {busy ? "正在重新运行" : "重新运行"}
                </button>
              )}
              {selected.status === "running" && selected.taskKey && (
                <button className="secondary-action h-10 shrink-0 gap-2" onClick={() => void cancelSelectedTask()} disabled={busy}>
                  {busy ? <Loader2 className="animate-spin" size={15} /> : <Square size={14} />}
                  取消 AI 任务
                </button>
              )}
            </div>
            <div className="log-status-line">
              <span className={`log-status-${selected.status}`}>{taskStatusLabel(selected.status)}</span>
              <span>{taskStageLabel(selected.stage)}</span>
              <span>{selectedProjectName}</span>
              <span>{formatDateTime(selected.createdAt)}</span>
              <span>{formatTaskDuration(selected.durationMs)}</span>
            </div>
            {selectedSupportsRerun && !selectedBelongsToActiveProject && (selected.status === "done" || selected.status === "failed") && (
              <div className="log-project-warning">该日志属于项目“{selectedProjectName}”。请先在左侧项目选择器切换到该项目，再重新运行。</div>
            )}

            <section className={`log-result-section log-result-${selected.status}`}>
              <div className="log-result-title">
                <ResultIcon className={selected.status === "running" ? "animate-spin" : ""} size={18} />
                <span>{selected.status === "failed" ? "错误摘要" : selected.status === "done" ? "执行结果" : "任务状态"}</span>
              </div>
              <p>{resultText}</p>
            </section>

            {suggestions.length > 0 && (
              <section className="log-fix-section">
                <div className="panel-title text-amber"><AlertTriangle size={16} />修复建议</div>
                <div>{suggestions.map((item) => <p key={item}>{item}</p>)}</div>
              </section>
            )}

            <section className="log-input-summary">
              <span>输入摘要</span>
              <p>{selected.inputSummary || "没有输入摘要。"}</p>
            </section>

            <div className="log-technical-section">
              <FoldSection title="技术详情" compact>
                <div className="log-technical-toolbar">
                  <span>原始数据仅用于排查问题</span>
                  <button className="secondary-action h-8 gap-2" onClick={copySelected}><Copy size={14} />复制详情</button>
                </div>
                <div className="log-technical-grid">
                  <div className="log-technical-block"><span>原始输入</span><pre>{selected.rawInput || "无原始输入"}</pre></div>
                  <div className="log-technical-block"><span>原始输出</span><pre>{selected.rawOutput || "无原始输出"}</pre></div>
                  {selected.error && <div className="log-technical-block log-technical-error"><span>完整错误</span><pre>{selected.error}</pre></div>}
                </div>
              </FoldSection>
            </div>

            {showSecondaryRerun && (
              <div className="log-secondary-actions">
                <FoldSection title="更多操作" compact>
                  <button className="secondary-action h-9 gap-2" onClick={() => void rerunSelected()} disabled={busy}>
                    {busy ? <Loader2 className="animate-spin" size={15} /> : <RefreshCw size={15} />}
                    再次运行该任务
                  </button>
                </FoldSection>
              </div>
            )}
          </div>
        ) : (
          <EmptyState title="暂无任务日志" description="运行清洗、聚类、导入、备份或健康检查后会在这里记录输入、输出、错误、耗时与状态。" />
        )}
      </section>
    </div>
  );
}

type HealthItemState = "untested" | "ok" | "warning" | "error";
type HealthSummaryState = "untested" | "checking" | "ok" | "warning" | "error";

type HealthCheckItem = {
  id: string;
  label: string;
  state: HealthItemState;
  detail: string;
  actionLabel?: string;
};

function healthStateLabel(state: HealthItemState) {
  if (state === "ok") return "正常";
  if (state === "warning") return "警告";
  if (state === "error") return "故障";
  return "未检测";
}

function findHealthError(errors: string[] | undefined, keywords: string[], fallback: string) {
  const normalizedKeywords = keywords.map((keyword) => keyword.toLowerCase());
  return errors?.find((error) => normalizedKeywords.some((keyword) => error.toLowerCase().includes(keyword))) ?? fallback;
}

function HealthView({
  settings,
  papers,
  libraryStatus,
  onNavigate,
  onRefresh,
  onNotice,
}: {
  settings: AiSettings;
  papers: Paper[];
  libraryStatus: PaperLibraryStatus | null;
  onNavigate: (view: ActiveView) => void;
  onRefresh: () => Promise<void>;
  onNotice: AppNoticeHandler;
}) {
  const [checking, setChecking] = useState(false);
  const [pressureTesting, setPressureTesting] = useState(false);
  const [result, setResult] = useState<DesktopHealthResult | null>(null);
  const [pressureResult, setPressureResult] = useState<LibraryPressureTestResult | null>(null);
  const [checkError, setCheckError] = useState("");
  const [pressureError, setPressureError] = useState("");
  const [lastCheckedAt, setLastCheckedAt] = useState("");
  const aiReady = Boolean(settings.apiCredentialConfigured || settings.useEnvKey);
  const libraryPaperCount = libraryStatus?.paperCount ?? papers.length;

  async function runCheck() {
    const started = performance.now();
    setChecking(true);
    setResult(null);
    setCheckError("");
    try {
      const next = await runDesktopHealthCheck({ databaseDir: settings.databaseDir, workerTempDir: settings.workerTempDir, exportDir: settings.exportDir, backupDir: settings.backupDir });
      setResult(next);
      setLastCheckedAt(nowIso());
      await saveTaskLog({
        stage: "health",
        title: "系统健康检查",
        status: next.errors.length === 0 ? "done" : "failed",
        inputSummary: `文献 ${libraryPaperCount} 篇；数据库目录=${settings.databaseDir || "默认 SQLite 目录"}；检测 SQLite、Python、worker 和目录状态。`,
        outputSummary: next.errors.length === 0 ? "全部检查通过。" : next.errors.join("\n"),
        rawOutput: JSON.stringify(next, null, 2),
        durationMs: Math.round(performance.now() - started),
      });
      await onRefresh();
      onNotice(
        next.errors.length === 0 ? "健康检查通过。" : "健康检查发现问题，请查看详情。",
        next.errors.length === 0 ? "success" : "error",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "健康检查失败。";
      setCheckError(message);
      setLastCheckedAt(nowIso());
      onNotice(message, "error");
    } finally {
      setChecking(false);
    }
  }

  async function runPressureTest() {
    const started = performance.now();
    setPressureTesting(true);
    setPressureResult(null);
    setPressureError("");
    try {
      const next = await runLibraryPressureTest({ databaseDir: settings.databaseDir, rows: 100_000 });
      setPressureResult(next);
      await saveTaskLog({
        stage: "health",
        title: "10 万级 SQLite 压力测试",
        status: "done",
        inputSummary: `rows=${next.rows.toLocaleString()}；目录=${settings.databaseDir || "默认 SQLite 目录"}`,
        outputSummary: next.summary,
        rawOutput: JSON.stringify(next, null, 2),
        durationMs: Math.round(performance.now() - started),
      });
      await onRefresh();
      onNotice("10 万级压力测试完成。");
    } catch (error) {
      const message = error instanceof Error ? error.message : "10 万级压力测试失败。";
      setPressureError(message);
      await saveTaskLog({
        stage: "health",
        title: "10 万级 SQLite 压力测试",
        status: "failed",
        inputSummary: `rows=100000；目录=${settings.databaseDir || "默认 SQLite 目录"}`,
        outputSummary: "",
        error: message,
        durationMs: Math.round(performance.now() - started),
      });
      await onRefresh();
      onNotice(message, "error");
    } finally {
      setPressureTesting(false);
    }
  }

  const untestedDetail = "等待运行健康检查。";
  const exportReady = Boolean(result) && (!settings.exportDir || result?.exportDirWritable !== false);
  const backupReady = Boolean(result) && (!settings.backupDir || result?.backupDirWritable !== false);
  const groups: Array<{ id: string; title: string; items: HealthCheckItem[] }> = [
    {
      id: "core",
      title: "核心环境",
      items: [
        {
          id: "sqlite",
          label: "SQLite 主库",
          state: !result ? "untested" : result.databaseDirWritable ? "ok" : "error",
          detail: !result
            ? untestedDetail
            : result.databaseDirWritable
              ? result.databasePath ?? result.databaseDir ?? "SQLite 数据目录可写。"
              : findHealthError(result.errors, ["sqlite", "database", "数据库"], "SQLite 数据目录不可写，请检查目录权限。"),
          actionLabel: result && !result.databaseDirWritable ? "前往设置" : undefined,
        },
        {
          id: "python",
          label: "Python 环境",
          state: !result ? "untested" : result.workerOk ? "ok" : "error",
          detail: !result
            ? untestedDetail
            : result.workerOk
              ? `运行环境可用：${result.pythonPath}`
              : findHealthError(result.errors, ["python"], `Python 环境不可用：${result.pythonPath || "未找到可执行路径"}`),
          actionLabel: result && !result.workerOk ? "前往设置" : undefined,
        },
        {
          id: "worker",
          label: "任务 worker",
          state: !result ? "untested" : result.taskWorkerFound ? "ok" : "error",
          detail: !result
            ? untestedDetail
            : result.taskWorkerFound
              ? "task_worker.py 已找到。"
              : findHealthError(result.errors, ["worker", "task_worker"], "未找到 task_worker.py，请确认程序文件完整。"),
          actionLabel: result && !result.taskWorkerFound ? "前往设置" : undefined,
        },
      ],
    },
    {
      id: "directories",
      title: "文件与目录",
      items: [
        {
          id: "temp",
          label: "临时目录",
          state: !result ? "untested" : result.tempDirWritable ? "ok" : "error",
          detail: !result
            ? untestedDetail
            : result.tempDirWritable
              ? settings.workerTempDir || "临时目录可写。"
              : findHealthError(result.errors, ["temp", "临时"], "临时目录不可写，请更换目录。"),
          actionLabel: result && !result.tempDirWritable ? "前往设置" : undefined,
        },
        {
          id: "export",
          label: "导出目录",
          state: !result ? "untested" : exportReady ? "ok" : "error",
          detail: !result
            ? untestedDetail
            : !settings.exportDir
              ? "未固定目录，导出时由用户选择可写位置。"
              : exportReady
                ? settings.exportDir
                : findHealthError(result.errors, ["export", "导出"], "导出目录不可写，请更换目录。"),
          actionLabel: result && !exportReady ? "前往设置" : undefined,
        },
        {
          id: "backup",
          label: "备份目录",
          state: !result ? "untested" : backupReady ? "ok" : "error",
          detail: !result
            ? untestedDetail
            : !settings.backupDir
              ? "未固定目录，备份时由用户选择可写位置。"
              : backupReady
                ? settings.backupDir
                : findHealthError(result.errors, ["backup", "备份"], "备份目录不可写，请更换目录。"),
          actionLabel: result && !backupReady ? "前往设置" : undefined,
        },
      ],
    },
    {
      id: "optional",
      title: "可选能力",
      items: [
        {
          id: "ai",
          label: "AI 模型配置",
          state: !result ? "untested" : aiReady ? "ok" : "warning",
          detail: !result
            ? untestedDetail
            : aiReady
              ? "模型服务凭据已配置，可使用 AI 简版和深版报告。"
              : "未配置 AI Key，仍可使用离线证据报告。",
          actionLabel: result && !aiReady ? "配置模型" : undefined,
        },
      ],
    },
  ];
  const items = groups.flatMap((group) => group.items);
  const okCount = items.filter((item) => item.state === "ok").length;
  const warningCount = items.filter((item) => item.state === "warning").length;
  const itemErrorCount = items.filter((item) => item.state === "error").length;
  const rawErrors = Array.from(new Set([checkError, ...(result?.errors ?? [])].filter(Boolean)));
  const errorCount = Math.max(itemErrorCount, rawErrors.length);
  const inspected = Boolean(result || checkError);
  const summaryState: HealthSummaryState = checking
    ? "checking"
    : errorCount > 0
      ? "error"
      : !result
        ? "untested"
        : warningCount > 0
          ? "warning"
          : "ok";
  const summaryCopy = summaryState === "checking"
    ? { title: "正在检查系统环境", detail: "正在读取本地数据库、Python、worker 与目录状态。" }
    : summaryState === "error"
      ? { title: "发现需要处理的故障", detail: rawErrors[0] || `有 ${errorCount} 项核心能力未通过检查。` }
      : summaryState === "warning"
        ? { title: "核心环境正常，存在可选项提醒", detail: "离线主流程可正常使用，可按需要补充模型配置。" }
        : summaryState === "ok"
          ? { title: "系统运行正常", detail: "本地数据库、任务环境和目录状态均已通过检查。" }
          : { title: "尚未检查", detail: "运行一次健康检查，确认本地分析环境是否完整可用。" };
  const technicalOutput = rawErrors.length > 0
    ? rawErrors.join("\n")
    : result
      ? JSON.stringify(result, null, 2)
      : "暂无检查结果。";

  return (
    <div className="page-grid health-page">
      <header className="page-header">
        <div>
          <h1>健康检查</h1>
          <p className="page-subtitle">检查本地数据库、任务运行环境和目录状态，并在发现问题时给出处理入口。</p>
        </div>
        <button type="button" className="primary-action h-10 gap-2" onClick={() => void runCheck()} disabled={checking || pressureTesting}>
          {checking ? <Loader2 className="animate-spin" size={16} /> : <ShieldCheck size={16} />}
          运行健康检查
        </button>
      </header>

      <section className={`health-summary health-summary-${summaryState}`}>
        <div className="health-summary-main">
          <div className="health-summary-icon" aria-hidden="true">
            {summaryState === "checking" ? <Loader2 className="animate-spin" size={20} /> : summaryState === "ok" ? <CheckCircle2 size={20} /> : summaryState === "warning" || summaryState === "error" ? <AlertTriangle size={20} /> : <ShieldCheck size={20} />}
          </div>
          <div className="min-w-0">
            <div className="health-summary-kicker">系统状态</div>
            <h2>{summaryCopy.title}</h2>
            <p>{summaryCopy.detail}</p>
          </div>
        </div>
        <div className="health-summary-metrics">
          <div><span>本地文献</span><strong>{libraryPaperCount.toLocaleString()}</strong></div>
          <div><span>正常</span><strong>{okCount}</strong></div>
          <div><span>警告</span><strong>{warningCount}</strong></div>
          <div><span>故障</span><strong>{errorCount}</strong></div>
        </div>
        <div className="health-summary-footer">
          <span>{lastCheckedAt ? `最近检查：${formatDateTime(lastCheckedAt)}` : "尚无检查记录"}</span>
          {inspected && <button type="button" onClick={() => onNavigate("logs")}>查看任务日志</button>}
        </div>
      </section>

      <section className="panel-card health-check-panel">
        <div className="health-check-panel-heading">
          <div>
            <div className="panel-title"><Activity size={17} />检查项目</div>
            <p>核心故障会影响本地任务，可选能力不会阻断离线工作流。</p>
          </div>
          <span>{items.length} 项</span>
        </div>
        <div className="health-check-groups">
          {groups.map((group) => (
            <section key={group.id} className="health-check-group">
              <div className="health-check-group-heading">
                <h3>{group.title}</h3>
                <span>{group.items.length} 项</span>
              </div>
              <div>
                {group.items.map((item) => (
                  <div key={item.id} className={`health-check-row health-check-row-${item.state}`}>
                    <span className="health-check-dot" aria-hidden="true" />
                    <div className="health-check-copy">
                      <strong>{item.label}</strong>
                      <p>{item.detail}</p>
                    </div>
                    <div className="health-check-actions">
                      <span className={`health-state-label health-state-${item.state}`}>{healthStateLabel(item.state)}</span>
                      {item.actionLabel && (
                        <button type="button" onClick={() => onNavigate("settings")}>
                          <Settings size={13} />
                          {item.actionLabel}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>

      <div className="health-secondary-sections">
        {inspected && (
          <FoldSection
            title="技术详情"
            compact
            right={<span className={rawErrors.length > 0 ? "text-xs text-danger/75" : "text-xs text-ink/38"}>{rawErrors.length > 0 ? `${rawErrors.length} 条错误` : "无错误"}</span>}
          >
            <pre className={`health-technical-output ${rawErrors.length > 0 ? "health-technical-error" : ""}`}>{technicalOutput}</pre>
          </FoldSection>
        )}

        <FoldSection
          title="高级诊断与工程验收"
          compact
          right={pressureTesting ? <span className="text-xs text-cyan/75">运行中</span> : pressureResult ? <span className="text-xs text-ink/45">已完成</span> : undefined}
        >
          <div className="health-advanced-heading">
            <div>
              <h3>10 万级 SQLite 压力测试</h3>
              <p>创建临时测试库验证大批量写入、查询和聚类性能，结果不计入普通健康状态。</p>
            </div>
            <button type="button" className="secondary-action h-9 shrink-0 gap-2" onClick={() => void runPressureTest()} disabled={checking || pressureTesting}>
              {pressureTesting ? <Loader2 className="animate-spin" size={15} /> : <Database size={15} />}
              {pressureTesting ? "正在测试" : "开始压力测试"}
            </button>
          </div>
          {pressureError && <div className="health-pressure-error"><AlertTriangle size={15} />{pressureError}</div>}
          {pressureResult && (
            <div className="health-pressure-result">
              <div className="health-pressure-result-heading">
                <div>
                  <strong>压力测试完成</strong>
                  <p>{pressureResult.summary}</p>
                </div>
                <span>{pressureResult.cleanupDone ? "临时库已清理" : "临时库保留"}</span>
              </div>
              <div className="health-pressure-grid">
                <div><span>写入</span><strong>{pressureResult.insertMs} ms</strong></div>
                <div><span>查询</span><strong>{pressureResult.queryMs} ms</strong><small>{pressureResult.queryCount.toLocaleString()} 命中</small></div>
                <div><span>聚类</span><strong>{pressureResult.clusterMs} ms</strong><small>{pressureResult.clusterCount} 个热点</small></div>
                <div><span>总耗时</span><strong>{pressureResult.totalMs} ms</strong></div>
                <div><span>临时库</span><strong>{formatBytes(pressureResult.sizeBytes)}</strong></div>
              </div>
              <div className="health-pressure-samples">样例热点：{pressureResult.sampleHotspots.slice(0, 5).join(" / ") || "无"}</div>
            </div>
          )}
        </FoldSection>
      </div>
    </div>
  );
}

type SettingsAgentReadiness = {
  provider: { status: "pass" | "fail"; detail: string };
  local: SideraAgentLocalReadiness;
  ready: boolean;
};

function SettingsView({
  settings,
  institutionSession,
  onOpenInstitutionResources,
  onSave,
  onRefresh,
  onNotice,
}: {
  settings: AiSettings;
  institutionSession: SideraInstitutionSessionState | null;
  onOpenInstitutionResources: () => void;
  onSave: (settings: AiSettings) => Promise<void>;
  onRefresh: () => Promise<void>;
  onNotice: AppNoticeHandler;
}) {
  const [draft, setDraft] = useState(settings);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [agentReadiness, setAgentReadiness] = useState<SettingsAgentReadiness>();
  const [institutionTesting, setInstitutionTesting] = useState(false);
  const [institutionProbe, setInstitutionProbe] = useState<SideraInstitutionProbeResult>();
  const [institutionError, setInstitutionError] = useState("");
  const [semanticCapabilities, setSemanticCapabilities] = useState<SemanticEmbeddingCapabilities>();
  const restoreInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => setDraft(settings), [settings]);
  useEffect(() => {
    let active = true;
    void getSemanticEmbeddingCapabilities()
      .then((value) => {
        if (!active) return;
        setSemanticCapabilities(value);
        if (!value.gpuAvailable) {
          setDraft((current) => current.semanticEmbeddingDevice === "gpu"
            ? { ...current, semanticEmbeddingDevice: "cpu" }
            : current);
        }
      })
      .catch(() => {
        if (active) setSemanticCapabilities(undefined);
      });
    return () => {
      active = false;
    };
  }, []);

  async function test() {
    setTesting(true);
    setMessage("");
    setAgentReadiness(undefined);
    let effective = draft;
    try {
      if (draft.manualApiKey.trim() && draft.projectId && isDesktopRuntime()) {
        const status = await setAppCredential(draft.projectId, `ai-${draft.provider}`, draft.manualApiKey);
        effective = { ...draft, manualApiKey: "", apiCredentialConfigured: status.configured };
        setDraft(effective);
      }
      const [provider, local] = await Promise.all([
        testAiConnection(effective)
          .then((detail) => ({ status: "pass" as const, detail }))
          .catch((error) => ({
            status: "fail" as const,
            detail: error instanceof Error ? error.message : "Provider 连接失败。",
          })),
        checkSideraAgentLocalReadiness({
          databaseDir: effective.databaseDir,
          projectId: effective.projectId || "project-default",
        }).catch((error): SideraAgentLocalReadiness => {
          const detail = error instanceof Error ? error.message : "Agent 本地检测失败。";
          return {
            conversationStore: {
              status: "fail",
              code: "SIDERA_AGENT_LOCAL_READINESS_FAILED",
              detail,
              repaired: false,
            },
            piRuntime: {
              status: "fail",
              code: "SIDERA_AGENT_LOCAL_READINESS_FAILED",
              detail,
            },
          };
        }),
      ]);
      const ready = provider.status === "pass"
        && local.conversationStore.status !== "fail"
        && local.piRuntime.status === "pass";
      setAgentReadiness({ provider, local, ready });
      setMessage(ready ? "Agent 可以对话。" : "Agent 尚未就绪，请查看失败项。");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Agent 本地检测失败。";
      setMessage("Agent 尚未就绪，请查看失败项。");
      setAgentReadiness({
        provider: { status: "fail", detail: "Provider 尚未完成检测。" },
        local: {
          conversationStore: {
            status: "fail",
            code: "SIDERA_AGENT_LOCAL_READINESS_FAILED",
            detail,
            repaired: false,
          },
          piRuntime: {
            status: "fail",
            code: "SIDERA_AGENT_LOCAL_READINESS_FAILED",
            detail,
          },
        },
        ready: false,
      });
    } finally {
      setTesting(false);
    }
  }

  async function testInstitution() {
    setInstitutionTesting(true);
    setInstitutionError("");
    try {
      setInstitutionProbe(await probeSideraInstitution("whu"));
    } catch (error) {
      setInstitutionProbe(undefined);
      setInstitutionError(error instanceof Error ? error.message : "机构资源检测失败。");
    } finally {
      setInstitutionTesting(false);
    }
  }

  async function openInstitutionUrl(url: string) {
    try {
      await openExternalUrl(url);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "机构入口打开失败。", "error");
    }
  }

  async function openInstitutionTarget(id: "database-directory" | "unified-discovery") {
    const target = institutionProbe?.navigationTargets.find((item) => item.id === id);
    if (target) {
      await openInstitutionUrl(target.openUrl);
      return;
    }
    onNotice(
      id === "database-directory"
        ? "尚未解析到正式数据库 SSO，已打开图书馆主页；请从“常用数据库”进入。"
        : "尚未解析到稳定的统一发现入口，已打开图书馆主页。",
      "info",
    );
    await openInstitutionUrl("https://www.lib.whu.edu.cn/");
  }

  async function chooseDir(key: "databaseDir" | "exportDir" | "workerTempDir" | "backupDir") {
    const dir = await chooseExportDirectory(key === "databaseDir" ? "选择 SQLite 论文库目录" : key === "workerTempDir" ? "选择任务临时目录" : key === "backupDir" ? "选择备份目录" : "选择导出目录");
    if (dir) setDraft((current) => ({ ...current, [key]: dir }));
  }

  async function saveDraft() {
    setSaving(true);
    try {
      await onSave(draft);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "设置保存失败。", "error");
    } finally {
      setSaving(false);
    }
  }

  function updateCnki(patch: Partial<AiSettings["cnki"]>) {
    setDraft((current) => ({ ...current, cnki: { ...current.cnki, ...patch } }));
  }

  function updateMysql(patch: Partial<AiSettings["mysql"]>) {
    setDraft((current) => ({ ...current, mysql: { ...current.mysql, ...patch } }));
  }

  async function chooseCnkiDriver() {
    const file = await chooseChromeDriverFile();
    if (file) updateCnki({ chromeDriverPath: file });
  }

  async function chooseCnkiDir(key: "chromeUserDataDir" | "debugDir") {
    const dir = await chooseExportDirectory(key === "chromeUserDataDir" ? "选择 Chrome 用户数据目录" : "选择 CNKI 调试快照目录");
    if (dir) updateCnki({ [key]: dir });
  }

  async function exportBackup() {
    const started = performance.now();
    try {
      const backup = await exportBackupData();
      const fileName = `research-hotspots-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
      const dir = draft.backupDir || draft.exportDir || draft.databaseDir || draft.dataDir;
      await writeTextFile(dir ? `${dir}\\${fileName}` : fileName, JSON.stringify(backup, null, 2));
      await saveTaskLog({ stage: "backup", title: "IndexedDB JSON 备份", status: "done", inputSummary: "导出文献、热点、报告、任务、设置和日志。", outputSummary: dir ? `${dir}\\${fileName}` : fileName, rawOutput: JSON.stringify({ fileName, version: backup.version, exportedAt: backup.exportedAt }, null, 2), durationMs: Math.round(performance.now() - started) });
      await onRefresh();
      onNotice("JSON 备份已导出。");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "备份导出失败。";
      await saveTaskLog({ stage: "backup", title: "IndexedDB JSON 备份", status: "failed", inputSummary: "导出 IndexedDB 备份。", outputSummary: "", error: errorMessage, durationMs: Math.round(performance.now() - started) });
      await onRefresh();
      onNotice(errorMessage, "error");
    }
  }

  async function exportSqliteBackup() {
    const started = performance.now();
    try {
      const result = await backupPaperLibrary({ databaseDir: draft.databaseDir, backupDir: draft.backupDir || draft.exportDir || draft.databaseDir, projectId: draft.projectId });
      await saveTaskLog({
        stage: "backup",
        title: "SQLite 论文库备份",
        status: "done",
        inputSummary: `数据库=${result.databasePath}`,
        outputSummary: result.backupPath,
        rawOutput: JSON.stringify(result, null, 2),
        durationMs: Math.round(performance.now() - started),
      });
      await onRefresh();
      onNotice(result.summary);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "SQLite 论文库备份失败。";
      await saveTaskLog({ stage: "backup", title: "SQLite 论文库备份", status: "failed", inputSummary: draft.databaseDir || "默认 SQLite 目录", outputSummary: "", error: errorMessage, durationMs: Math.round(performance.now() - started) });
      await onRefresh();
      onNotice(errorMessage, "error");
    }
  }

  async function restoreSqliteBackup() {
    const backupPath = await chooseSqliteBackupFile();
    if (!backupPath) return;
    const started = performance.now();
    try {
      onNotice("正在检查 SQLite 备份完整性…");
      const inspection = await inspectPaperLibraryBackup({ backupPath, projectId: draft.projectId });
      const snapshotSummary = inspection.snapshotId
        ? `${inspection.hotspotCount} 个热点、${inspection.membershipCount} 条归属`
        : "无 V20 快照；恢复后需要重新运行热点建模";
      onNotice(`SQLite 备份检查通过：${inspection.paperCount.toLocaleString()} 篇论文，${snapshotSummary}。`);
      if (!(await confirmDesktopAction(
        `确认恢复这个 SQLite 备份？\n\n论文：${inspection.paperCount.toLocaleString()} 篇\n项目：${inspection.projectCount}\n快照：${snapshotSummary}\n\n当前论文库会先保留为安全副本。`,
        "确认恢复 SQLite 主库",
      ))) return;
      const result = await restorePaperLibrary({ databaseDir: draft.databaseDir, backupPath, projectId: draft.projectId });
      await saveTaskLog({
        stage: "restore",
        title: "SQLite 论文库恢复",
        status: "done",
        inputSummary: backupPath,
        outputSummary: result.summary,
        rawOutput: JSON.stringify(result, null, 2),
        durationMs: Math.round(performance.now() - started),
      });
      await onRefresh();
      onNotice(result.previousBackupPath ? `${result.summary} 恢复前副本：${result.previousBackupPath}` : result.summary);
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : "SQLite 论文库恢复失败。";
      const errorMessage = rawMessage.includes("LIBRARY_BUSY") ? "论文库正在执行导入、清洗或聚类，请任务完成后再恢复。" : rawMessage;
      await saveTaskLog({ stage: "restore", title: "SQLite 论文库恢复", status: "failed", inputSummary: backupPath, outputSummary: "", error: errorMessage, durationMs: Math.round(performance.now() - started) });
      await onRefresh();
      onNotice(errorMessage, "error");
    }
  }

  async function restoreBackup(file?: File) {
    if (!file) return;
    const started = performance.now();
    try {
      const backup = JSON.parse(await file.text()) as DataBackup;
      const projectCount = Array.isArray(backup.projects) ? backup.projects.length : 1;
      const paperCount = Array.isArray(backup.papers) ? backup.papers.length : 0;
      const reportCount = Array.isArray(backup.reports) ? backup.reports.length : 0;
      if (!(await confirmDesktopAction(
        `确认用这个 JSON 备份替换当前工作台数据？\n\n项目：${projectCount}\n文献：${paperCount.toLocaleString()}\n报告：${reportCount}\n\n恢复采用原子事务；V20 热点缓存将从 SQLite 重新同步。`,
        "确认恢复 JSON 备份",
      ))) return;
      const result = await restoreBackupData(backup);
      if (isDesktopRuntime()) {
        const restoredSettings = await getAiSettings();
        const restoredProjectId = restoredSettings.projectId || draft.projectId || "project-default";
        const [apiStatus, mysqlStatus] = await Promise.all([
          getAppCredentialStatus(restoredProjectId, `ai-${restoredSettings.provider}`),
          getAppCredentialStatus(restoredProjectId, "mysql"),
        ]);
        await saveAiSettings({
          ...restoredSettings,
          apiCredentialConfigured: apiStatus.configured,
          mysql: { ...restoredSettings.mysql, credentialConfigured: mysqlStatus.configured, password: "" },
        });
      }
      await saveTaskLog({ stage: "restore", title: "IndexedDB JSON 恢复", status: "done", inputSummary: file.name, outputSummary: `文献=${result.paperCount}，热点=${result.hotspotCount}，报告=${result.reportCount}，日志=${result.taskLogCount}`, rawInput: file.name, durationMs: Math.round(performance.now() - started) });
      await onRefresh();
      onNotice("JSON 备份已恢复。");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "备份恢复失败。";
      await saveTaskLog({ stage: "restore", title: "IndexedDB JSON 恢复", status: "failed", inputSummary: file.name, outputSummary: "", error: errorMessage, durationMs: Math.round(performance.now() - started) });
      await onRefresh();
      onNotice(errorMessage, "error");
    } finally {
      if (restoreInputRef.current) restoreInputRef.current.value = "";
    }
  }

  const aiReady = Boolean(draft.apiCredentialConfigured || draft.manualApiKey.trim() || draft.useEnvKey);
  const directoryCount = [draft.databaseDir, draft.exportDir, draft.workerTempDir, draft.backupDir].filter(Boolean).length;
  const hasUnsavedChanges = JSON.stringify(draft) !== JSON.stringify(settings);

  return (
    <div className="page-grid settings-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">本地配置</p>
          <h1>系统设置</h1>
          <p className="page-subtitle">配置模型服务与本地目录；高级数据源和备份恢复可按需展开。</p>
        </div>
        <button className="primary-action h-10 gap-2" onClick={() => void saveDraft()} disabled={saving || !hasUnsavedChanges}>
          {saving ? <Loader2 className="animate-spin" size={16} /> : hasUnsavedChanges ? <Save size={16} /> : <CheckCircle2 size={16} />}
          {saving ? "正在保存" : hasUnsavedChanges ? "保存设置" : "设置已保存"}
        </button>
      </header>
      <div className="settings-layout">
        <div className="settings-main">
          <section className="panel-card settings-section">
            <div className="settings-section-header">
              <div>
                <div className="panel-title"><Settings size={17} />模型服务</div>
                <p>配置报告生成使用的模型和认证方式。</p>
              </div>
              <button className="secondary-action h-9 gap-2" onClick={() => void test()} disabled={testing}>
                {testing ? <Loader2 className="animate-spin" size={15} /> : <Play size={15} />}
                {testing ? "正在检测" : "检测 Agent"}
              </button>
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <label className="field-label">
                服务商
                <SelectControl
                  className="h-11 text-sm"
                  value={draft.provider}
                  options={[{ value: "deepseek", label: "DeepSeek" }, { value: "openai-compatible", label: "OpenAI 兼容模型" }]}
                  onChange={(value) => setDraft({ ...draft, provider: value as AiSettings["provider"] })}
                />
              </label>
              <label className="field-label">模型名称<input className="field-control h-11 px-3" value={draft.model} onChange={(event) => setDraft({ ...draft, model: event.target.value })} /></label>
              <label className="field-label">
                Pi 提示缓存
                <SelectControl
                  className="h-11 text-sm"
                  value={draft.sideraCacheRetention}
                  options={[
                    { value: "long", label: "长缓存（默认，推荐）" },
                    { value: "auto", label: "兼容模式（上游不支持长缓存时使用）" },
                  ]}
                  onChange={(value) => setDraft({ ...draft, sideraCacheRetention: value === "long" ? "long" : "auto" })}
                />
              </label>
              <label className="field-label">服务地址（Base URL）<input className="field-control h-11 px-3" value={draft.baseUrl} onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })} /></label>
              <label className="field-label lg:col-span-2">API 密钥<input className="field-control h-11 px-3" type="password" value={draft.manualApiKey} onChange={(event) => setDraft({ ...draft, manualApiKey: event.target.value })} placeholder={draft.apiCredentialConfigured ? "已安全保存到 Windows 凭据管理器；输入新值可替换" : "输入后保存到 Windows 凭据管理器"} /></label>
              <label className="field-label">生成温度<input className="field-control h-11 px-3" type="number" step={0.05} min={0} max={1} value={draft.temperature} onChange={(event) => setDraft({ ...draft, temperature: Number(event.target.value) })} /></label>
              <label className="settings-toggle-row"><input type="checkbox" checked={draft.useEnvKey} onChange={(event) => setDraft({ ...draft, useEnvKey: event.target.checked })} />允许后端开发环境读取 DEEPSEEK_API_KEY</label>
            </div>
            {message && (
              <div
                className={`settings-connection-message ${agentReadiness?.ready ? "is-ready" : "is-failed"}`}
                role={agentReadiness?.ready ? "status" : "alert"}
              >
                <strong>{message}</strong>
              </div>
            )}
            {agentReadiness ? (
              <div className="settings-agent-readiness" aria-label="Agent 可用性检测结果">
                <AgentReadinessRow
                  label="Provider"
                  status={agentReadiness.provider.status}
                  summary={agentReadiness.provider.status === "pass" ? "连接正常" : "连接失败"}
                  detail={agentReadiness.provider.detail}
                />
                <AgentReadinessRow
                  label="会话存储"
                  status={agentReadiness.local.conversationStore.status}
                  summary={agentReadiness.local.conversationStore.status === "repaired"
                    ? "已原地修复"
                    : agentReadiness.local.conversationStore.status === "pass"
                      ? "可用"
                      : "不可用"}
                  detail={agentReadiness.local.conversationStore.detail}
                  code={agentReadiness.local.conversationStore.code}
                />
                <AgentReadinessRow
                  label="Pi 运行时"
                  status={agentReadiness.local.piRuntime.status}
                  summary={agentReadiness.local.piRuntime.status === "pass" ? "可用" : "不可用"}
                  detail={agentReadiness.local.piRuntime.detail}
                  code={agentReadiness.local.piRuntime.code}
                />
              </div>
            ) : null}
          </section>

          <section className="panel-card settings-section settings-institution-section">
            <div className="settings-section-header">
              <div>
                <div className="panel-title"><Network size={17} />武汉大学机构资源</div>
                <p>aTrust 登录由学校客户端完成；这里仅检测客户端与公开入口，不读取 Cookie，也不判断浏览器是否已经登录。</p>
              </div>
              <button className="secondary-action h-9 gap-2" onClick={() => void testInstitution()} disabled={institutionTesting}>
                {institutionTesting ? <Loader2 className="animate-spin" size={15} /> : <ShieldCheck size={15} />}
                {institutionTesting ? "正在检测" : institutionProbe ? "重新检测" : "检测机构资源"}
              </button>
            </div>
            <div className="settings-institution-actions">
              <button type="button" className="primary-action h-9 gap-2" onClick={onOpenInstitutionResources}>
                <Network size={15} />前往机构资源
              </button>
              <button type="button" className="secondary-action h-9 gap-2" onClick={() => void openInstitutionUrl("https://www.lib.whu.edu.cn/")}>
                <Globe2 size={15} />在系统浏览器打开图书馆
              </button>
              <button type="button" className="secondary-action h-9 gap-2" onClick={() => void openInstitutionTarget("database-directory")}>
                <BookOpen size={15} />{institutionProbe?.navigationTargets.some((item) => item.id === "database-directory") ? "在系统浏览器打开数据库导航" : "在系统浏览器从图书馆进入数据库"}
              </button>
            </div>
            <div className="settings-agent-readiness" aria-label="应用内机构会话状态">
              <AgentReadinessRow
                label="数据库 SSO 会话"
                status={institutionAuthRowStatus(institutionSession?.databaseAuth.status)}
                summary={institutionAuthSummary(institutionSession?.databaseAuth.status)}
                detail={institutionAuthDetail(institutionSession?.databaseAuth, "数据库检索")}
                code={institutionSession?.databaseAuth.status === "failed"
                  || institutionSession?.databaseAuth.status === "cancelled"
                  ? institutionSession.databaseAuth.code
                  : undefined}
              />
              <AgentReadinessRow
                label="统一发现机构全文身份"
                status={institutionAuthRowStatus(institutionSession?.academicDiscoveryAuth.status)}
                summary={institutionAuthSummary(institutionSession?.academicDiscoveryAuth.status)}
                detail={institutionAuthDetail(institutionSession?.academicDiscoveryAuth, "统一发现机构全文")}
                code={institutionSession?.academicDiscoveryAuth.status === "failed"
                  || institutionSession?.academicDiscoveryAuth.status === "cancelled"
                  ? institutionSession.academicDiscoveryAuth.code
                  : undefined}
              />
              <AgentReadinessRow
                label="个人图书馆会话"
                status={institutionAuthRowStatus(institutionSession?.libraryAccountAuth.status)}
                summary={institutionAuthSummary(institutionSession?.libraryAccountAuth.status)}
                detail={institutionAuthDetail(institutionSession?.libraryAccountAuth, "个人图书馆")}
                code={institutionSession?.libraryAccountAuth.status === "failed"
                  || institutionSession?.libraryAccountAuth.status === "cancelled"
                  ? institutionSession.libraryAccountAuth.code
                  : undefined}
              />
            </div>
            {institutionError ? <div className="settings-connection-message is-failed" role="alert"><strong>{institutionError}</strong></div> : null}
            {institutionProbe ? (
              <>
                <div
                  className={`settings-connection-message ${institutionProbe.status === "ready" ? "is-ready" : institutionProbe.status === "unavailable" ? "is-failed" : "is-partial"}`}
                  role={institutionProbe.status === "unavailable" ? "alert" : "status"}
                >
                  <strong>{institutionProbe.summary}</strong>
                  <small>检测时间：{new Date(institutionProbe.checkedAtMs).toLocaleString()}</small>
                </div>
                <div className="settings-agent-readiness" aria-label="武汉大学机构资源检测结果">
                  <AgentReadinessRow
                    label="aTrust 客户端"
                    status={institutionClientRowStatus(institutionProbe.client.status)}
                    summary={institutionClientSummary(institutionProbe.client.status)}
                    detail={institutionProbe.client.executablePath
                      ? `${institutionProbe.client.detail} 路径：${institutionProbe.client.executablePath}`
                      : institutionProbe.client.detail}
                    code={institutionProbe.client.code}
                  />
                  {institutionProbe.endpoints.map((endpoint) => (
                    <AgentReadinessRow
                      key={endpoint.id}
                      label={endpoint.label}
                      status={institutionEndpointRowStatus(endpoint.status)}
                      summary={institutionEndpointSummary(endpoint.status, endpoint.code)}
                      detail={`${endpoint.detail}${endpoint.detectedEntry ? ` 已解析入口：${endpoint.detectedEntry}` : ""}${endpoint.latencyMs != null ? ` 耗时：${endpoint.latencyMs} ms。` : ""}`}
                      code={endpoint.code}
                    />
                  ))}
                </div>
                <div className="settings-institution-capabilities" aria-label="机构资源能力报告">
                  <div className="settings-institution-capabilities__header">
                    <div>
                      <span>全馆能力报告</span>
                      <strong>{institutionRouteLabel(institutionProbe.capabilities.routeRecommendation)}</strong>
                    </div>
                    <small>{institutionProbe.capabilities.catalogEntryCount != null
                      ? `识别 ${institutionProbe.capabilities.catalogEntryCount.toLocaleString()} 条目录记录`
                      : "目录数量待公开入口解析"}</small>
                  </div>
                  <div className="settings-institution-capabilities__grid">
                    <InstitutionCapability label="统一发现" status={institutionProbe.capabilities.unifiedDiscovery} />
                    <InstitutionCapability label="题录导出" status={institutionProbe.capabilities.metadataExport} />
                    <InstitutionCapability label="在线跳转" status={institutionProbe.capabilities.onlineNavigation} />
                    <InstitutionCapability label="全文解析入口" status={institutionProbe.capabilities.fullTextResolution} />
                    <InstitutionCapability label="专用适配器" status={institutionProbe.capabilities.dedicatedAdapters} />
                  </div>
                  {institutionProbe.catalog.structured ? (
                    <div className="settings-institution-catalog">
                      <span>结构化目录样例</span>
                      <strong>{institutionProbe.catalog.sampleEntries.map((entry) => entry.name).join(" · ")}</strong>
                      {institutionProbe.catalog.categories.length > 0 ? (
                        <small>类别：{institutionProbe.catalog.categories.join("、")}</small>
                      ) : null}
                    </div>
                  ) : null}
                  <p>以上是无 Cookie 的入口与能力探测，不代表系统浏览器或应用内会话已经登录。真实会话状态以上方“应用内机构会话”为准。</p>
                </div>
              </>
            ) : (
              <p className="settings-institution-empty">重新检测只刷新 aTrust 与公开入口状态，不会读取系统浏览器或应用内 WebView 的 Cookie，也不会改变登录状态。</p>
            )}
          </section>

          <section className="panel-card settings-section">
            <div className="settings-section-header">
              <div>
                <div className="panel-title"><Database size={17} />本地目录</div>
                <p>论文库、导出、临时文件和备份分别保存到指定目录。</p>
              </div>
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <DirField label="SQLite 论文库目录" value={draft.databaseDir} onChange={(value) => setDraft({ ...draft, databaseDir: value })} onChoose={() => void chooseDir("databaseDir")} />
              <DirField label="导出目录" value={draft.exportDir} onChange={(value) => setDraft({ ...draft, exportDir: value })} onChoose={() => void chooseDir("exportDir")} />
              <DirField label="任务临时目录" value={draft.workerTempDir} onChange={(value) => setDraft({ ...draft, workerTempDir: value })} onChoose={() => void chooseDir("workerTempDir")} />
              <DirField label="备份目录" value={draft.backupDir} onChange={(value) => setDraft({ ...draft, backupDir: value })} onChoose={() => void chooseDir("backupDir")} />
              <label className="field-label">
                语义建模设备
                <SelectControl
                  className="h-11 text-sm"
                  value={draft.semanticEmbeddingDevice}
                  options={[
                    { value: "cpu", label: "CPU（默认稳定）" },
                    {
                      value: "gpu",
                      label: semanticCapabilities?.gpuAvailable
                        ? "GPU（DirectML，失败回退 CPU）"
                        : "GPU（当前安装不可用）",
                      description: semanticCapabilities?.gpuAvailable
                        ? "使用 Full 安装包内置的 DirectML 模型。"
                        : "Lite 仅内置 CPU 模型；安装 Full 后可启用。",
                      disabled: !semanticCapabilities?.gpuAvailable,
                    },
                  ]}
                  onChange={(value) => setDraft({ ...draft, semanticEmbeddingDevice: value === "gpu" ? "gpu" : "cpu" })}
                />
                <span className="text-xs leading-5 text-ink/40">
                  {semanticCapabilities
                    ? semanticCapabilities.gpuAvailable
                      ? "当前安装包含 CPU 与 DirectML GPU 模型。"
                      : semanticCapabilities.cpuAvailable
                        ? "当前安装为 CPU 模型版本；GPU 建模仅在 Full 安装包中提供。"
                        : "未检测到语义模型资源，热点建模前请修复安装。"
                    : "正在检查本地语义模型资源…"}
                </span>
              </label>
            </div>
          </section>

          <FoldSection title="高级数据源" right={<span className="text-xs font-normal text-ink/40">MySQL · CNKI</span>}>
            <section className="settings-advanced-source">
              <div className="settings-subsection-heading"><Database size={16} />MySQL 导入源</div>
              <p>只作为按需导入源；导入后程序仍以 SQLite 为主库。密码留空时尝试环境变量 MYSQL_PASSWORD 或 DB_PASSWORD。</p>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <label className="field-label">主机地址<input className="field-control h-11 px-3" value={draft.mysql.host} onChange={(event) => updateMysql({ host: event.target.value })} placeholder="127.0.0.1" /></label>
                <label className="field-label">端口<input className="field-control h-11 px-3" type="number" min={1} max={65535} value={draft.mysql.port} onChange={(event) => updateMysql({ port: Number(event.target.value) || 3306 })} /></label>
                <label className="field-label">用户名<input className="field-control h-11 px-3" value={draft.mysql.user} onChange={(event) => updateMysql({ user: event.target.value })} placeholder="root" /></label>
                <label className="field-label">数据库<input className="field-control h-11 px-3" value={draft.mysql.database} onChange={(event) => updateMysql({ database: event.target.value })} placeholder="research_hotspots" /></label>
                <label className="field-label">密码<input className="field-control h-11 px-3" type="password" value={draft.mysql.password} onChange={(event) => updateMysql({ password: event.target.value })} placeholder={draft.mysql.credentialConfigured ? "已安全保存；输入新值可替换" : "输入后保存到 Windows 凭据管理器"} /></label>
                <label className="field-label">每批数量<input className="field-control h-11 px-3" type="number" min={100} max={5000} step={100} value={draft.mysql.batchSize} onChange={(event) => updateMysql({ batchSize: Math.max(100, Math.min(5000, Number(event.target.value) || 1000)) })} /></label>
              </div>
            </section>

            <section className="settings-advanced-source settings-advanced-source-divider">
              <div className="settings-subsection-heading"><Search size={16} />CNKI 后台检索</div>
              <p>仅复用本机已有合法访问权限；不保存账号密码，也不自动处理验证码或访问限制。</p>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <DirField label="ChromeDriver 路径" value={draft.cnki.chromeDriverPath} onChange={(value) => updateCnki({ chromeDriverPath: value })} onChoose={() => void chooseCnkiDriver()} />
                <DirField label="Chrome 用户数据目录" value={draft.cnki.chromeUserDataDir} onChange={(value) => updateCnki({ chromeUserDataDir: value })} onChoose={() => void chooseCnkiDir("chromeUserDataDir")} />
                <label className="field-label">Chrome 配置文件<input className="field-control h-11 px-3" value={draft.cnki.chromeProfile} onChange={(event) => updateCnki({ chromeProfile: event.target.value })} placeholder="Default" /></label>
                <DirField label="调试快照目录" value={draft.cnki.debugDir} onChange={(value) => updateCnki({ debugDir: value })} onChoose={() => void chooseCnkiDir("debugDir")} />
                <label className="field-label">等待超时（秒）<input className="field-control h-11 px-3" type="number" min={3} max={120} value={draft.cnki.waitTimeoutSec} onChange={(event) => updateCnki({ waitTimeoutSec: Number(event.target.value) })} /></label>
                <label className="field-label">页面加载超时（秒）<input className="field-control h-11 px-3" type="number" min={5} max={180} value={draft.cnki.pageLoadTimeoutSec} onChange={(event) => updateCnki({ pageLoadTimeoutSec: Number(event.target.value) })} /></label>
                <label className="field-label">隐式等待（秒）<input className="field-control h-11 px-3" type="number" min={0} max={30} value={draft.cnki.implicitWaitSec} onChange={(event) => updateCnki({ implicitWaitSec: Number(event.target.value) })} /></label>
                <label className="settings-toggle-row"><input type="checkbox" checked={draft.cnki.headless} onChange={(event) => updateCnki({ headless: event.target.checked })} />启用后台模式</label>
              </div>
            </section>
          </FoldSection>

          <FoldSection title="备份与恢复" right={<span className="text-xs font-normal text-ink/40">JSON · SQLite</span>}>
            <div className="settings-backup-grid">
              <section>
                <div className="settings-subsection-heading"><Download size={16} />创建备份</div>
                <p>分别备份轻量状态数据与 SQLite 论文主库。</p>
                <div className="settings-action-row">
                  <button className="secondary-action h-9 gap-2" onClick={() => void exportBackup()}><Download size={15} />导出 JSON 备份</button>
                  <button className="secondary-action h-9 gap-2" onClick={() => void exportSqliteBackup()}><Database size={15} />备份 SQLite 主库</button>
                </div>
              </section>
              <section>
                <div className="settings-subsection-heading"><FileUp size={16} />恢复数据</div>
                <p>恢复会改变当前项目数据，请确认备份文件和项目范围。</p>
                <div className="settings-action-row">
                  <input ref={restoreInputRef} className="hidden" type="file" accept=".json,application/json" onChange={(event) => void restoreBackup(event.target.files?.[0])} />
                  <button className="secondary-action h-9 gap-2" onClick={() => restoreInputRef.current?.click()}><FileUp size={15} />恢复 JSON 备份</button>
                  <button className="secondary-action h-9 gap-2" onClick={() => void restoreSqliteBackup()}><FileUp size={15} />恢复 SQLite 主库</button>
                </div>
              </section>
            </div>
          </FoldSection>
        </div>

        <aside className="settings-side">
          <div className="settings-summary-header">
            <div className="panel-title"><ShieldCheck size={17} />配置概览</div>
            <span className={hasUnsavedChanges ? "settings-unsaved" : "settings-saved"}>{hasUnsavedChanges ? "有未保存修改" : "已保存"}</span>
          </div>
          <div className="settings-summary-list">
            <div className="settings-summary-row">
              <span>AI 密钥</span>
              <strong className={aiReady ? "text-cyan/85" : "text-amber/85"}>{aiReady ? "已就绪" : "未配置"}</strong>
              <small>{aiReady ? "可以测试连接并生成报告" : "报告生成前需要配置密钥"}</small>
            </div>
            <div className="settings-summary-row">
              <span>本地目录</span>
              <strong>{directoryCount}/4 已明确</strong>
              <small>空目录将沿用程序默认位置</small>
            </div>
            <div className="settings-summary-row">
              <span>当前模型</span>
              <strong>{draft.model || "未填写"}</strong>
              <small>{draft.baseUrl || "尚未填写服务地址"}</small>
            </div>
          </div>
          <p className="settings-summary-note">设置按当前项目保存在本机；数据库、导出和备份目录建议优先放在 D 盘。</p>
        </aside>
      </div>
    </div>
  );
}

function AgentReadinessRow({
  label,
  status,
  summary,
  detail,
  code,
}: {
  label: string;
  status: "pass" | "repaired" | "partial" | "fail";
  summary: string;
  detail: string;
  code?: string;
}) {
  const successful = status === "pass" || status === "repaired";
  return (
    <div className="settings-agent-readiness__row" data-status={status}>
      <span className="settings-agent-readiness__icon" aria-hidden="true">
        {successful ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
      </span>
      <div>
        <span>{label}</span>
        <strong>{summary}</strong>
        {code ? (
          <details>
            <summary>技术详情 · {code}</summary>
            <pre>{detail}</pre>
          </details>
        ) : (
          <small>{detail}</small>
        )}
      </div>
    </div>
  );
}

function institutionAuthRowStatus(
  status?: SideraInstitutionAuthStatus,
): "pass" | "partial" | "fail" {
  if (status === "ready") return "pass";
  if (status === "failed") return "fail";
  return "partial";
}

function institutionAuthSummary(status?: SideraInstitutionAuthStatus) {
  if (status === "ready") return "已就绪";
  if (status === "starting" || status === "login-required") return "正在登录";
  if (status === "cancelled") return "已取消";
  if (status === "failed") return "异常";
  return "未初始化";
}

function institutionAuthDetail(
  auth: SideraInstitutionAuthState | undefined,
  label: string,
) {
  if (!auth || auth.status === "idle") {
    return `${label}会话尚未创建；系统浏览器登录状态不会迁移到 Sidera。`;
  }
  if (auth.status === "ready") {
    return `${label}会话可用${auth.currentHost ? `，当前站点：${auth.currentHost}` : ""}。`;
  }
  return auth.message;
}

function institutionClientRowStatus(status: SideraInstitutionClientStatus): "pass" | "partial" | "fail" {
  if (status === "installed-running" || status === "running-path-unknown") return "pass";
  if (status === "installed-stopped") return "partial";
  return "fail";
}

function institutionClientSummary(status: SideraInstitutionClientStatus) {
  if (status === "installed-running") return "已安装并运行";
  if (status === "running-path-unknown") return "正在运行";
  if (status === "installed-stopped") return "已安装，未运行";
  if (status === "detection-failed") return "检测失败";
  return "未检测到";
}

function institutionEndpointRowStatus(status: SideraInstitutionEndpointStatus): "pass" | "partial" | "fail" {
  if (status === "native-direct") return "pass";
  if (status === "browser-required" || status === "unresolved") return "partial";
  return "fail";
}

function institutionEndpointSummary(status: SideraInstitutionEndpointStatus, code?: string) {
  if (code === "SIDERA_INSTITUTION_DATABASE_SSO_REQUIRED") return "正式 SSO 路由已解析";
  if (code === "SIDERA_INSTITUTION_DISCOVERY_UNRESOLVED") return "公开统一发现入口尚未解析";
  if (code === "SIDERA_INSTITUTION_DATABASE_CONFIG_UNRESOLVED") return "正式 SSO 入口待解析";
  if (code === "SIDERA_INSTITUTION_DATABASE_CONFIG_FETCH_FAILED") return "官网配置读取失败";
  if (status === "native-direct") return "后台可直接读取";
  if (status === "browser-required") return "需要交互式页面确认";
  if (status === "unresolved") return "入口待解析";
  return "当前不可达";
}

function institutionCapabilityLabel(status: SideraInstitutionCapabilityStatus) {
  if (status === "available") return "可用";
  if (status === "browser-required") return "交互页面确认";
  return "待确认";
}

function institutionRouteLabel(route: SideraInstitutionProbeResult["capabilities"]["routeRecommendation"]) {
  if (route === "direct-unified-search") return "建议：统一检索直连";
  if (route === "hybrid") return "建议：元数据直连＋浏览器全文";
  return "建议：可见浏览器＋题录导入";
}

function InstitutionCapability({ label, status }: { label: string; status: SideraInstitutionCapabilityStatus }) {
  return (
    <div data-status={status}>
      <span>{label}</span>
      <strong>{institutionCapabilityLabel(status)}</strong>
    </div>
  );
}

function AboutView({
  settings,
  libraryStatus,
  hotspots,
  reports,
}: {
  settings: AiSettings | null;
  libraryStatus: PaperLibraryStatus | null;
  hotspots: Hotspot[];
  reports: ResearchReport[];
}) {
  const layers = [
    ["前端", "React 19 + Vite + Tailwind CSS + lucide-react + Three.js App17GalaxyCanvas"],
    ["桌面后端", "Tauri 2 / Rust / SQLite，负责窗口、文件写入、本地论文库、目录选择、健康检查与 Python worker 调用"],
    ["本地数据", "SQLite 保存 10 万级 papers 主库；IndexedDB / idb 保存 hotspots、reports、pipelineJobs、settings、taskLogs"],
    ["Python worker", "workers/task_worker.py 调度 cleaner_worker.py 与 cluster_worker.py"],
    ["历史方案", "Streamlit / Docker / MySQL 文件保留为 legacy 参考，不作为桌面端运行依赖"],
  ];
  const dependencies = ["@tauri-apps/api / cli / dialog / opener", "react / react-dom", "three", "vite / typescript", "tailwindcss / postcss / autoprefixer", "idb", "lucide-react", "rusqlite bundled SQLite", "Python stdlib worker scripts"];
  const releaseChecks = [
    ["版本统一", `package / Vite / Cargo / Tauri 均使用 v${__APP_VERSION__}`],
    ["桌面打包", "Tauri release exe，最终检查 Windows GUI 子系统，避免额外 cmd 窗口"],
    ["主数据层", "SQLite 承载论文主库，健康检查覆盖数据库目录可写性"],
    ["轻量状态层", "IndexedDB 保存项目、热点、报告、任务日志和设置，可导出 JSON 备份"],
    ["备份恢复", "设置页提供 JSON 备份恢复与 SQLite 主库备份恢复"],
    ["性能验收", "健康检查页保留 10 万级 SQLite 压力测试入口"],
    ["视觉主线", "全局暗色高质感界面，星图沿用锐利深空科研星场方向"],
    ["依赖边界", "不新增大型运行时依赖，legacy Python/Docker/MySQL 文件不作为桌面端主依赖"],
  ];
  const paperCount = libraryStatus?.paperCount ?? 0;
  const largeLibraryReady = paperCount >= 100_000;
  const evidenceHotspots = hotspots.filter((hotspot) => {
    const representativeIds = new Set([
      ...(hotspot.analysis?.evidencePaperIds ?? []),
      ...hotspot.evolution.flatMap((item) => item.representativeIds),
    ]);
    return representativeIds.size > 0 && hotspot.evolution.length > 0 && (hotspot.sourceDistribution?.length ?? 0) > 0;
  });
  const starMapEvidenceReady = largeLibraryReady && evidenceHotspots.length >= 10;
  const reportEvidenceReady = reports.some((report) => {
    const profile = report.evidenceProfile;
    return Boolean(profile && profile.paperCount >= 3 && profile.representativePaperIds.length >= 3 && report.metrics.citationAccuracy >= 0.8);
  });
  const aiConfigured = Boolean(settings?.apiCredentialConfigured || settings?.useEnvKey);
  const runtimeSummary = [
    ["当前 SQLite 论文", paperCount.toLocaleString()],
    ["热点证据覆盖", `${evidenceHotspots.length}/${hotspots.length}`],
    ["证据型报告", `${reports.filter((report) => report.evidenceProfile).length}/${reports.length}`],
    ["AI Key", aiConfigured ? "已配置" : "未配置"],
  ];
  const terminalReadiness = [
    {
      area: "真实 10 万级论文源",
      state: largeLibraryReady ? "规模达标" : paperCount > 0 ? "小库运行" : "待导入",
      tone: largeLibraryReady ? "ok" : "warn",
      detail: largeLibraryReady ? `当前 SQLite 主库已有 ${paperCount.toLocaleString()} 篇文献，已达到终局规模门槛；仍需用终局验收脚本证明源文件非 sample/demo。` : "需要接入非 sample/demo 的真实 CSV、JSONL、BibTeX 或 RIS 文件，并通过 100000+ 有效行预检。",
      evidence: "pnpm discover:real-data / pnpm acceptance:terminal-config",
    },
    {
      area: "SQLite 主库导入",
      state: largeLibraryReady ? "已达规模" : paperCount > 0 ? "样例/小库" : "未导入",
      tone: largeLibraryReady ? "ok" : "warn",
      detail: largeLibraryReady ? `当前项目主库 paperCount=${paperCount.toLocaleString()}；下一步应跑 audit_library 证明索引、查询和聚类烟测。` : "当前样例链路可跑通，但最终完成必须证明真实导入库中 paperCount >= 100000。",
      evidence: "outputs/v20_sqlite_library_audit_final.json",
    },
    {
      area: "科研星图语义证据",
      state: starMapEvidenceReady ? "证据充足" : evidenceHotspots.length > 0 ? "局部具备" : "待聚类",
      tone: starMapEvidenceReady ? "ok" : "warn",
      detail: starMapEvidenceReady ? `已有 ${evidenceHotspots.length} 个热点带代表论文、年度演化和来源分布，可进入真实星图导出验收。` : "星图 UI 与全屏交互已有烟测，最终还需真实热点、代表论文 ID、年度演化和来源分布覆盖。",
      evidence: "outputs/v20_star_map_export_final.json",
    },
    {
      area: "热点证据包",
      state: evidenceHotspots.length >= 1 ? "可抽取" : "待生成",
      tone: evidenceHotspots.length >= 1 && largeLibraryReady ? "ok" : "warn",
      detail: evidenceHotspots.length >= 1 ? `当前内存热点中已有 ${evidenceHotspots.length} 个具备基础证据结构；终局仍需从真实 SQLite 导出证据包。` : "需要从真实 SQLite 热点导出代表论文、缺失 ID 检查、相似热点、年度趋势和来源分布。",
      evidence: "outputs/v20_hotspot_evidence_final.json",
    },
    {
      area: "报告证据链",
      state: reportEvidenceReady ? "已有证据报告" : reports.length > 0 ? "待审计" : "待生成",
      tone: reportEvidenceReady && largeLibraryReady ? "ok" : "warn",
      detail: reportEvidenceReady ? "已发现包含证据概览、代表论文和较高引用准确度的报告；终局仍需绑定真实 10 万级热点证据链。" : "报告结构已可审计，最终必须绑定真实热点证据并通过引用、参考文献和语义章节检查。",
      evidence: "outputs/v20_report_export_audit_final.json",
    },
    {
      area: "Live AI 配置",
      state: aiConfigured ? "已配置待验收" : "待配置",
      tone: "warn",
      detail: aiConfigured ? "检测到环境变量或手动 Key；最终仍需要执行一次 network-enabled live smoke，证明报告生成可用。" : "需要用户确认可用的 VITE_DEEPSEEK_* 或手动 Key，并执行一次 network-enabled smoke。",
      evidence: "outputs/v20_ai_live_report_smoke.json",
    },
    {
      area: "工程与打包",
      state: "已证明",
      tone: "ok",
      detail: "版本统一、GUI 子系统、样例验收、导入恢复、100000 行压力测试和配置校验已有证据。",
      evidence: "outputs/V20_GOAL_READINESS_AUDIT.md",
    },
  ];

  return (
    <div className="page-grid">
      <header className="page-header">
        <div>
          <p className="eyebrow">About V20</p>
          <h1>版本 / 架构 / 依赖</h1>
          <p className="page-subtitle">当前主线是 Tauri exe。V20 聚焦最终工程收尾：版本、依赖、数据目录、备份恢复、健康检查和打包产物保持清晰可靠。</p>
        </div>
        <div className="flex flex-wrap gap-2"><span className="quiet-chip">v{__APP_VERSION__}</span><span className="quiet-chip">build {formatDateTime(__BUILD_TIME__)}</span></div>
      </header>
      <section className="panel-card"><div className="panel-title"><Network size={17} />架构分层</div><div className="mt-4 grid gap-3 lg:grid-cols-2">{layers.map(([name, detail]) => <div key={name} className="mini-card"><div className="text-sm font-medium text-ink">{name}</div><div className="mt-2 text-sm leading-6 text-ink/55">{detail}</div></div>)}</div></section>
      <section className="panel-card"><div className="panel-title"><CheckCircle2 size={17} />V20 最终工程验收清单</div><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">{releaseChecks.map(([name, detail]) => <div key={name} className="mini-card"><div className="text-sm font-medium text-ink">{name}</div><div className="mt-2 text-sm leading-6 text-ink/55">{detail}</div></div>)}</div></section>
      <section className="panel-card">
        <div className="panel-title"><ShieldCheck size={17} />终极目标就绪矩阵</div>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-ink/55">这里展示的是最终科研热点工作站的完成证据，不把样例数据或局部烟测当作终局完成。当前工程链路已具备，真正缺口集中在真实 10 万级论文库、真实热点证据、报告证据链和 live AI。</p>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          {runtimeSummary.map(([label, value]) => (
            <div key={label} className="mini-card">
              <div className="text-xs text-ink/40">{label}</div>
              <div className="mt-1 text-lg font-semibold text-ink">{value}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {terminalReadiness.map((item) => {
            const ready = item.tone === "ok";
            return (
              <div key={item.area} className="mini-card">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-ink">{item.area}</div>
                    <div className="mt-2 text-sm leading-6 text-ink/55">{item.detail}</div>
                  </div>
                  <span className={`quiet-chip shrink-0 ${ready ? "text-cyan" : "text-amber"}`}>
                    {ready ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                    {item.state}
                  </span>
                </div>
                <div className="mt-3 border-t border-white/[0.06] pt-3 text-xs leading-5 text-ink/40">证据：{item.evidence}</div>
              </div>
            );
          })}
        </div>
      </section>
      <section className="panel-card"><div className="panel-title"><Globe2 size={17} />依赖库说明</div><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">{dependencies.map((item) => <div key={item} className="mini-card text-sm leading-6 text-ink/65">{item}</div>)}</div></section>
    </div>
  );
}

async function runLoggedWorker(stage: "clean" | "cluster", papers: Paper[], settings: AiSettings, onRefresh: () => Promise<void>, onNotice: AppNoticeHandler, setBusyStage: (value: string) => void, activeProject?: Project) {
  const started = performance.now();
  const isLibraryTask = Boolean(activeProject);
  const inputSummary = isLibraryTask
    ? `SQLite 项目库${stage === "clean" ? "清洗" : "聚合"}；项目=${activeProject?.name ?? "当前项目"}；目录=${settings.databaseDir || "默认 SQLite 目录"}`
    : `${papers.length} 篇文献；临时目录=${settings.workerTempDir || "系统临时目录"}`;
  const rawInputForLog = isLibraryTask
    ? JSON.stringify({ databaseDir: settings.databaseDir || "默认 SQLite 目录", projectId: activeProject?.id, projectName: activeProject?.name }, null, 2)
    : JSON.stringify(papers.slice(0, 20), null, 2);
  setBusyStage(stage);
  try {
    await updatePipelineJob(stage, {
      projectId: activeProject?.id,
      status: "running",
      databaseKey: settings.databaseDir,
      executionSessionId: PIPELINE_EXECUTION_SESSION_ID,
      progress: stage === "clean" ? 35 : 45,
      detail: stage === "clean" ? "正在 SQLite 论文库中规范化标题、摘要并删除空记录和重复记录。" : "正在运行 V20 热点分析：聚合关键词、筛选代表论文、判断趋势并生成星图坐标。",
    });
    await onRefresh();
    if (stage === "clean") {
      const result = activeProject ? await runLibraryCleanerWorker(settings.databaseDir, activeProject.id) : await runCleanerWorker(papers, settings.workerTempDir);
      if (!activeProject) {
        await replacePaperLibrary(result.cleanedPapers);
      }
      await updatePipelineJob("clean", {
        projectId: activeProject?.id,
        databaseKey: settings.databaseDir,
        executionSessionId: PIPELINE_EXECUTION_SESSION_ID,
        status: "done",
        progress: 100,
        detail: result.summary,
      });
      await saveTaskLog({
        stage,
        title: activeProject ? "SQLite 大库清洗去重" : "清洗去重 worker",
        status: "done",
        inputSummary,
        outputSummary: result.summary,
        rawInput: rawInputForLog,
        rawOutput: JSON.stringify({
          beforeCount: result.beforeCount,
          afterCount: result.afterCount,
          removedCount: result.removedCount,
          updatedCount: result.updatedCount ?? 0,
          emptyRemovedCount: result.emptyRemovedCount ?? 0,
          duplicateRemovedCount: result.duplicateRemovedCount ?? 0,
          duplicateIds: result.duplicateIds.slice(0, 50),
          cleanedPapers: activeProject ? [] : result.cleanedPapers.slice(0, 20),
        }, null, 2),
        durationMs: Math.round(performance.now() - started),
      });
      onNotice(result.summary);
    } else {
      const result = activeProject
        ? await runLibraryClusterWorker(settings.databaseDir, activeProject.id, settings.semanticEmbeddingDevice)
        : await runClusterWorker(papers, settings.workerTempDir);
      if (activeProject && isDesktopRuntime()) {
        const snapshot = await getV20HotspotSnapshot({ databaseDir: settings.databaseDir, projectId: activeProject.id });
        if (!snapshot || snapshot.snapshotId !== result.snapshotId) throw new Error("聚类完成后无法读取一致的 V20 活动快照。");
        await replaceV20HotspotCache(snapshot);
      } else {
        await replaceHotspots(result.hotspots.map((hotspot) => ({ ...hotspot, snapshotId: result.snapshotId })));
      }
      await updatePipelineJob("cluster", {
        projectId: activeProject?.id,
        databaseKey: settings.databaseDir,
        executionSessionId: PIPELINE_EXECUTION_SESSION_ID,
        status: "done",
        progress: 100,
        detail: result.summary,
      });
      await saveTaskLog({ stage, title: activeProject ? "SQLite 大库 V20 热点分析" : "热点聚类 worker", status: "done", inputSummary, outputSummary: result.summary, rawInput: rawInputForLog, rawOutput: JSON.stringify({ beforeCount: result.beforeCount, clusterCount: result.clusterCount, hotspots: result.hotspots.slice(0, 20) }, null, 2), durationMs: Math.round(performance.now() - started) });
      onNotice(result.summary);
    }
    await onRefresh();
  } catch (error) {
    const message = error instanceof Error ? error.message : `${stage} worker 执行失败。`;
    if (stage === "cluster" && message.includes("CLUSTER_ALREADY_RUNNING")) {
      await onRefresh();
      onNotice("该项目正在后台聚类，请等待当前任务完成。");
      return;
    }
    await updatePipelineJob(stage, {
      projectId: activeProject?.id,
      databaseKey: settings.databaseDir,
      executionSessionId: PIPELINE_EXECUTION_SESSION_ID,
      status: "failed",
      progress: 100,
      detail: message,
    });
    await saveTaskLog({ stage, title: stage === "clean" ? (activeProject ? "SQLite 大库清洗去重" : "清洗去重 worker") : (activeProject ? "SQLite 大库热点聚类" : "热点聚类 worker"), status: "failed", inputSummary, outputSummary: "", rawInput: rawInputForLog, error: message, durationMs: Math.round(performance.now() - started) });
    await onRefresh();
    onNotice(message, "error");
  } finally {
    setBusyStage("");
  }
}

function EvidenceMini({ papers }: { papers: Paper[] }) {
  const yearCounts = countBy(papers.filter((paper) => paper.year), (paper) => String(paper.year));
  const sourceCounts = countBy(papers, (paper) => paper.source);
  return (
    <div className="mt-4 grid gap-3 md:grid-cols-3">
      <div className="mini-card"><div className="text-xs text-ink/40">文献数</div><div className="mt-1 text-xl font-semibold text-ink">{papers.length}</div></div>
      <div className="mini-card"><div className="text-xs text-ink/40">年份分布</div><div className="mt-1 text-xs leading-5 text-ink/55">{yearCounts.slice(0, 4).map(([year, count]) => `${year}: ${count}`).join(" / ") || "无"}</div></div>
      <div className="mini-card"><div className="text-xs text-ink/40">来源分布</div><div className="mt-1 text-xs leading-5 text-ink/55">{sourceCounts.map(([source, count]) => `${source}: ${count}`).join(" / ") || "无"}</div></div>
    </div>
  );
}

type PaperQualityHint = {
  level: "warning" | "danger";
  label: string;
  detail: string;
  paperId?: string;
};

function DataQualityPanel({ hints }: { hints: PaperQualityHint[] }) {
  const dangerCount = hints.filter((hint) => hint.level === "danger").length;
  return (
    <div className="mt-4 rounded-[8px] border border-line bg-surface/70 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="panel-title">
          <ShieldCheck size={16} />
          数据质量提示
        </div>
        <span className="quiet-chip">{hints.length === 0 ? "暂无问题" : `${hints.length} 项 / 高风险 ${dangerCount}`}</span>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {hints.slice(0, 6).map((hint, index) => (
          <div key={`${hint.label}-${index}`} className={`mini-card text-sm leading-6 ${hint.level === "danger" ? "border-danger/40 text-danger" : "text-ink/[0.62]"}`}>
            <div className="font-medium">{hint.label}</div>
            <div className="text-xs text-ink/45">{hint.detail}</div>
          </div>
        ))}
        {hints.length === 0 && <div className="text-sm text-ink/45">摘要、年份、DOI/URL 和重复项暂未发现明显异常。</div>}
      </div>
    </div>
  );
}

type PaperDetailEditorHandle = {
  save: () => Promise<boolean>;
  discard: () => void;
};

function comparablePaperDetails(paper: Paper | null | undefined) {
  return {
    title: paper?.title ?? "",
    abstract: paper?.abstract ?? "",
    authors: paper?.authors ?? "",
    year: paper?.year ?? null,
    field: paper?.field ?? "",
    source: paper?.source ?? "",
    doi: paper?.doi ?? "",
    url: paper?.url ?? "",
  };
}

const PaperDetailEditor = forwardRef<PaperDetailEditorHandle, {
  paper?: Paper;
  qualityHints: PaperQualityHint[];
  onDirtyChange: (dirty: boolean) => void;
  onSave: (paper: Paper) => Promise<void>;
}>(function PaperDetailEditor({ paper, qualityHints, onDirtyChange, onSave }, ref) {
  const [baseline, setBaseline] = useState<Paper | null>(paper ? { ...paper } : null);
  const [draft, setDraft] = useState<Paper | null>(paper ? { ...paper } : null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setBaseline(paper ? { ...paper } : null);
    setDraft(paper ? { ...paper } : null);
  }, [paper]);

  const dirty = useMemo(
    () => JSON.stringify(comparablePaperDetails(draft)) !== JSON.stringify(comparablePaperDetails(baseline)),
    [baseline, draft],
  );

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  async function saveDraft() {
    if (!draft || saving) return false;
    const normalizedDraft: Paper = {
      ...draft,
      title: draft.title.trim() || "未命名文献",
      abstract: draft.abstract.trim(),
      year: draft.year ? Number(draft.year) : undefined,
    };
    setSaving(true);
    try {
      await onSave(normalizedDraft);
      setBaseline({ ...normalizedDraft });
      setDraft({ ...normalizedDraft });
      return true;
    } catch {
      return false;
    } finally {
      setSaving(false);
    }
  }

  function discardDraft() {
    setDraft(baseline ? { ...baseline } : null);
  }

  useImperativeHandle(ref, () => ({
    save: saveDraft,
    discard: discardDraft,
  }));

  if (!draft) return <EmptyState title="未选择文献" description="点击左侧论文卡片后，可在这里编辑详情和查看数据质量提示。" />;

  return (
    <>
      <div className="panel-title">
        <Edit3 size={17} />
        文献详情治理
      </div>
      <div className="mt-4 grid gap-3">
        <label className="field-label">标题<input className="field-control h-10 px-3" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
        <label className="field-label">摘要<textarea className="field-control min-h-[120px] p-3" value={draft.abstract} onChange={(event) => setDraft({ ...draft, abstract: event.target.value })} /></label>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="field-label">作者<input className="field-control h-10 px-3" value={draft.authors ?? ""} onChange={(event) => setDraft({ ...draft, authors: event.target.value })} /></label>
          <label className="field-label">年份<input className="field-control h-10 px-3" type="number" value={draft.year ?? ""} onChange={(event) => setDraft({ ...draft, year: Number(event.target.value) || undefined })} /></label>
          <label className="field-label">学科<input className="field-control h-10 px-3" value={draft.field} onChange={(event) => setDraft({ ...draft, field: event.target.value })} /></label>
          <label className="field-label">
            来源
            <SelectControl className="h-10 text-sm" value={draft.source} options={paperSourceOptions} onChange={(value) => setDraft({ ...draft, source: value as SourceKind })} />
          </label>
        </div>
        <label className="field-label">DOI<input className="field-control h-10 px-3" value={draft.doi ?? ""} onChange={(event) => setDraft({ ...draft, doi: event.target.value })} /></label>
        <label className="field-label">URL<input className="field-control h-10 px-3" value={draft.url ?? ""} onChange={(event) => setDraft({ ...draft, url: event.target.value })} /></label>
        {qualityHints.length > 0 && <DataQualityPanel hints={qualityHints} />}
        <div className="flex flex-wrap gap-2">
          <button className="primary-action h-10 gap-2" onClick={() => void saveDraft()} disabled={saving || !dirty}>
            {saving ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />}
            保存文献
          </button>
          <button className="secondary-action h-10 gap-2" onClick={() => draft.url && void openExternalUrl(draft.url)} disabled={!draft.url}>
            <Globe2 size={15} />
            打开链接
          </button>
        </div>
      </div>
    </>
  );
});

const documentVersionKindLabels: Record<SideraDocumentVersionKind, string> = {
  "publisher-version": "出版社正式版",
  "author-manuscript": "作者稿",
  scan: "扫描版",
  "user-import": "用户导入版",
  unknown: "版本类型待确认",
};

function PaperDocumentPanel({
  databaseDir,
  projectId,
  paper,
  refreshRevision = 0,
  onReadVersion,
  onInstitutionSourceOpened,
  onNotice,
}: {
  databaseDir?: string;
  projectId: string;
  paper: Paper;
  refreshRevision?: number;
  onReadVersion: (versionId: string) => void;
  onInstitutionSourceOpened: () => void;
  onNotice: AppNoticeHandler;
}) {
  const [snapshot, setSnapshot] = useState<SideraPaperDocumentSnapshot | null>(null);
  const [downloads, setDownloads] = useState<SideraInstitutionDownloadRecord[]>([]);
  const [selectedDownloadId, setSelectedDownloadId] = useState("");
  const [localVersionKind, setLocalVersionKind] = useState<SideraDocumentVersionKind>("user-import");
  const [institutionVersionKind, setInstitutionVersionKind] = useState<SideraDocumentVersionKind>("unknown");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const loadSequenceRef = useRef(0);

  const completedPdfDownloads = useMemo(
    () => downloads.filter((record) => (
      record.status === "complete"
      && (record.fileName.toLowerCase().endsWith(".pdf") || record.mimeType?.toLowerCase().includes("pdf"))
    )),
    [downloads],
  );

  const load = useCallback(async () => {
    const sequence = ++loadSequenceRef.current;
    setLoading(true);
    setError("");
    try {
      const { snapshot: nextSnapshot, downloads: nextDownloads } = await requestPaperDocumentPanelOnce({
        databaseDir,
        projectId,
        paperId: paper.id,
        refreshRevision,
      });
      if (sequence !== loadSequenceRef.current) return;
      setSnapshot(nextSnapshot);
      setDownloads(nextDownloads);
      const available = nextDownloads.filter((record) => (
        record.status === "complete"
        && (record.fileName.toLowerCase().endsWith(".pdf") || record.mimeType?.toLowerCase().includes("pdf"))
      ));
      setSelectedDownloadId((current) => (
        available.some((record) => record.id === current) ? current : (available[0]?.id ?? "")
      ));
    } catch (loadError) {
      if (sequence !== loadSequenceRef.current) return;
      setError(loadError instanceof Error ? loadError.message : "全文记录读取失败。");
    } finally {
      if (sequence === loadSequenceRef.current) setLoading(false);
    }
  }, [databaseDir, paper.id, projectId, refreshRevision]);

  useEffect(() => {
    setSnapshot(null);
    setDownloads([]);
    setSelectedDownloadId("");
    void load();
    return () => {
      loadSequenceRef.current += 1;
    };
  }, [load]);

  async function importLocalPdf() {
    const filePath = await choosePdfFile(`为《${paper.title}》选择 PDF 全文`);
    if (!filePath) return;
    setBusy("local");
    setError("");
    try {
      const next = await importLocalPaperDocument({
        databaseDir,
        projectId,
        paperId: paper.id,
        filePath,
        versionKind: localVersionKind,
      });
      setSnapshot(next);
      onNotice("本地 PDF 已按内容哈希保存并关联到当前论文。", "success");
    } catch (importError) {
      const message = importError instanceof Error ? importError.message : "本地 PDF 导入失败。";
      setError(message);
      onNotice(message, "error");
      await load();
    } finally {
      setBusy("");
    }
  }

  async function attachInstitutionPdf() {
    if (!selectedDownloadId) return;
    setBusy("institution");
    setError("");
    try {
      const next = await attachInstitutionDownloadToPaper({
        databaseDir,
        projectId,
        paperId: paper.id,
        downloadId: selectedDownloadId,
        versionKind: institutionVersionKind,
      });
      setSnapshot(next);
      onNotice("机构 PDF 已验证并形成不可变文档版本。", "success");
    } catch (attachError) {
      const message = attachError instanceof Error ? attachError.message : "机构 PDF 关联失败。";
      setError(message);
      onNotice(message, "error");
      await load();
    } finally {
      setBusy("");
    }
  }

  async function openInstitutionSource(source: SideraPaperSourceRecord) {
    setBusy(`source:${source.id}`);
    setError("");
    try {
      await openInstitutionPaperSource({
        databaseDir,
        projectId,
        paperId: paper.id,
        sourceRecordId: source.id,
      });
      onInstitutionSourceOpened();
      onNotice("已打开当前论文的机构来源。请在官方页面完成单篇全文跳转和下载，随后回到论文详情关联 PDF。", "info");
    } catch (openError) {
      const message = openError instanceof Error ? openError.message : "机构来源打开失败。";
      setError(message);
      onNotice(message, "error");
      await load();
    } finally {
      setBusy("");
    }
  }

  async function openVersion(versionId: string) {
    try {
      await openPaperDocumentVersion({ databaseDir, projectId, paperId: paper.id, versionId });
    } catch (openError) {
      onNotice(openError instanceof Error ? openError.message : "原始文档打开失败。", "error");
    }
  }

  return (
    <div className="mt-6 border-t border-line pt-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="panel-title"><FileText size={17} />全文与文档版本</div>
          <p className="mt-1 text-xs leading-5 text-ink/45">原始 PDF 按 SHA-256 不可变保存；相同内容不会重复占用空间。</p>
        </div>
        <button className="secondary-action h-8 gap-2 px-3" onClick={() => void load()} disabled={loading || Boolean(busy)}>
          <RefreshCw className={loading ? "animate-spin" : ""} size={14} />刷新
        </button>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        <div className="flex min-w-0 gap-2">
          <select
            className="field-control h-10 min-w-0 flex-1 px-3 text-xs"
            value={localVersionKind}
            onChange={(event) => setLocalVersionKind(event.target.value as SideraDocumentVersionKind)}
            aria-label="选择本地全文版本类型"
          >
            {Object.entries(documentVersionKindLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <button className="primary-action h-10 shrink-0 gap-2 px-3" type="button" onClick={() => void importLocalPdf()} disabled={Boolean(busy)}>
            {busy === "local" ? <Loader2 className="animate-spin" size={15} /> : <FileUp size={15} />}
            导入本地全文
          </button>
        </div>
        <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(140px,0.55fr)_auto]">
          <select
            className="field-control h-10 min-w-0 flex-1 px-3 text-xs"
            value={selectedDownloadId}
            onChange={(event) => setSelectedDownloadId(event.target.value)}
            aria-label="选择已完成的机构 PDF 下载"
          >
            <option value="">{completedPdfDownloads.length > 0 ? "选择已完成的机构 PDF" : "暂无已完成的机构 PDF"}</option>
            {completedPdfDownloads.map((record) => (
              <option key={record.id} value={record.id}>{record.fileName}</option>
            ))}
          </select>
          <select
            className="field-control h-10 min-w-0 px-3 text-xs"
            value={institutionVersionKind}
            onChange={(event) => setInstitutionVersionKind(event.target.value as SideraDocumentVersionKind)}
            aria-label="选择机构全文版本类型"
          >
            {Object.entries(documentVersionKindLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <button className="secondary-action h-10 shrink-0 gap-2 px-3" type="button" onClick={() => void attachInstitutionPdf()} disabled={!selectedDownloadId || Boolean(busy)}>
            {busy === "institution" ? <Loader2 className="animate-spin" size={15} /> : <Database size={15} />}
            关联已下载机构 PDF
          </button>
        </div>
      </div>

      {error && <div className="mt-3 rounded-[7px] border border-danger/30 bg-danger/5 px-3 py-2 text-xs leading-5 text-danger">{error}</div>}

      <div className="mt-5">
        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-ink/45">论文来源与机构全文 · {snapshot?.sources.length ?? 0}</div>
        {loading && !snapshot ? (
          <div className="mt-3 flex items-center gap-2 text-xs text-ink/45"><Loader2 className="animate-spin" size={14} />正在读取来源记录</div>
        ) : (snapshot?.sources.length ?? 0) === 0 ? (
          <p className="mt-3 text-xs leading-5 text-ink/40">当前论文没有可追溯的机构来源记录；仍可导入已有本地 PDF。</p>
        ) : (
          <div className="mt-3 grid gap-2">
            {snapshot?.sources.map((source) => {
              const actionLabel = source.fullTextStatus === "available"
                ? "获取机构全文"
                : source.fullTextStatus === "link-only"
                  ? "打开全文解析"
                  : "核对机构题录";
              return (
                <div key={source.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-line bg-surface/55 p-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-ink">{source.sourceDatabase || "机构来源"}</div>
                    <div className="mt-1 text-xs text-ink/45">
                      {source.recordType || "记录类型待确认"} · 全文状态 {source.fullTextStatus || "unknown"} · {source.producerVersion}
                    </div>
                    {source.displayLocator && <code className="mt-2 block break-all text-[11px] text-ink/35">{source.displayLocator}</code>}
                  </div>
                  <button
                    className="secondary-action h-8 shrink-0 gap-2 px-3"
                    type="button"
                    onClick={() => void openInstitutionSource(source)}
                    disabled={!source.canOpenRecord || Boolean(busy)}
                  >
                    {busy === `source:${source.id}` ? <Loader2 className="animate-spin" size={14} /> : <Globe2 size={14} />}
                    {actionLabel}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-5">
        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-ink/45">文档版本 · {snapshot?.versions.length ?? 0}</div>
        {loading && !snapshot ? (
          <div className="mt-3 flex items-center gap-2 text-xs text-ink/45"><Loader2 className="animate-spin" size={14} />正在读取文档记录</div>
        ) : (snapshot?.versions.length ?? 0) === 0 ? (
          <p className="mt-3 text-xs leading-5 text-ink/40">当前论文尚未关联 PDF。可导入本地文件，或先在机构浏览器中显式下载单篇 PDF。</p>
        ) : (
          <div className="mt-3 grid gap-2">
            {snapshot?.versions.map((version) => (
              <div key={version.id} className="rounded-[8px] border border-line bg-surface/55 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-ink">{version.originalFileName ?? "PDF 文档"}</div>
                    <div className="mt-1 text-xs text-ink/45">
                      {formatInstitutionFileSize(version.byteSize)} · {documentVersionKindLabels[version.versionKind] ?? "版本类型待确认"} · {version.firstAcquisitionKind === "local-import" ? "本地导入" : "机构获取"}
                    </div>
                    <code className="mt-2 block break-all text-[11px] text-ink/35">SHA-256 {version.sha256}</code>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <button
                      className="primary-action h-8 gap-2 px-3"
                      type="button"
                      data-document-reader-version={version.id}
                      onClick={() => onReadVersion(version.id)}
                    >
                      <BookOpen size={14} />阅读全文
                    </button>
                    <button className="secondary-action h-8 gap-2 px-3" type="button" onClick={() => void openVersion(version.id)}>
                      打开原始文件
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {(snapshot?.acquisitions.length ?? 0) > 0 && (
        <div className="mt-5">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-ink/45">获取记录</div>
          <div className="mt-3 grid gap-2">
            {snapshot?.acquisitions.map((record) => (
              <div key={record.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[7px] border border-line px-3 py-2 text-xs">
                <div className="min-w-0">
                  <div className={record.status === "complete" ? "text-ink/65" : "text-danger"}>
                    {record.kind === "local-import" ? "本地导入" : "机构获取"} · {record.status === "complete" ? "已完成" : "失败"} · {record.stage}
                  </div>
                  <div className="mt-1 break-all text-ink/35">
                    {record.originLabel ?? record.id}{record.errorCode ? ` · ${record.errorCode}` : ""}
                  </div>
                </div>
                {record.kind === "institution-download" && record.status === "failed" && record.retryable && (
                  record.sourceRecordId && ["source-route", "source-navigation"].includes(record.stage) ? (
                    <button
                      className="secondary-action h-8 shrink-0 gap-2 px-3"
                      type="button"
                      onClick={() => {
                        const source = snapshot?.sources.find((candidate) => candidate.id === record.sourceRecordId);
                        if (source) void openInstitutionSource(source);
                      }}
                      disabled={Boolean(busy) || !snapshot?.sources.some((candidate) => candidate.id === record.sourceRecordId)}
                    >
                      {busy === `source:${record.sourceRecordId}` ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />}
                      重试打开来源
                    </button>
                  ) : selectedDownloadId ? (
                    <button className="secondary-action h-8 shrink-0 gap-2 px-3" type="button" onClick={() => void attachInstitutionPdf()} disabled={Boolean(busy)}>
                      {busy === "institution" ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />}
                      重试关联
                    </button>
                  ) : null
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ReportOptionsPanel({ options, onChange }: { options: ReportGenerationOptions; onChange: (options: ReportGenerationOptions) => void }) {
  const [userTemplates, setUserTemplates] = useState<AiParameterTemplate[]>([]);
  const templates = [...reportTemplates, ...userTemplates];

  useEffect(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(reportTemplateStorageKey) || "[]") as AiParameterTemplate[];
      setUserTemplates(Array.isArray(parsed) ? parsed : []);
    } catch {
      setUserTemplates([]);
    }
  }, []);

  function saveCurrentTemplate() {
    const name = window.prompt("模板名称", "我的常用模板");
    if (!name?.trim()) return;
    const next = [
      ...userTemplates,
      {
        id: `custom-${crypto.randomUUID()}`,
        name: name.trim(),
        description: "用户保存的生成参数模板。",
        options,
      },
    ];
    setUserTemplates(next);
    localStorage.setItem(reportTemplateStorageKey, JSON.stringify(next));
  }

  return (
    <div className="mt-4 rounded-[8px] border border-line bg-surface/70 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="panel-title">
          <Settings size={16} />
          生成参数模板
        </div>
        <button className="secondary-action h-8 gap-2 px-3" onClick={saveCurrentTemplate} type="button">
          <Save size={14} />
          保存当前
        </button>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-3">
        {templates.map((template) => (
          <button key={template.id} className="mini-card text-left hover:border-cyan/40" onClick={() => onChange(template.options)} type="button">
            <div className="text-sm font-medium text-ink">{template.name}</div>
            <div className="mt-1 text-xs leading-5 text-ink/45">{template.description}</div>
          </button>
        ))}
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <label className="field-label text-xs">结构<SelectControl className="h-10 text-sm" value={options.structure} options={[{ value: "standard", label: "标准" }, { value: "problem-method", label: "问题-方法" }, { value: "timeline", label: "时间线" }, { value: "comparison", label: "对比" }]} onChange={(value) => onChange({ ...options, structure: value as ReportGenerationOptions["structure"] })} /></label>
        <label className="field-label text-xs">篇幅<SelectControl className="h-10 text-sm" value={options.targetLength} options={[{ value: "short", label: "短" }, { value: "medium", label: "中" }, { value: "long", label: "长" }]} onChange={(value) => onChange({ ...options, targetLength: value as ReportGenerationOptions["targetLength"] })} /></label>
        <label className="field-label text-xs">引用密度<SelectControl className="h-10 text-sm" value={options.citationDensity} options={[{ value: "low", label: "低" }, { value: "medium", label: "中" }, { value: "high", label: "高" }]} onChange={(value) => onChange({ ...options, citationDensity: value as ReportGenerationOptions["citationDensity"] })} /></label>
        <label className="field-label text-xs">语气<SelectControl className="h-10 text-sm" value={options.tone} options={[{ value: "draft", label: "草稿" }, { value: "formal", label: "正式" }, { value: "critical", label: "审慎批判" }]} onChange={(value) => onChange({ ...options, tone: value as ReportGenerationOptions["tone"] })} /></label>
        <label className="flex items-center gap-2 rounded-[7px] border border-line bg-surface px-3 text-xs text-ink/65"><input type="checkbox" checked={options.includeFutureDirections} onChange={(event) => onChange({ ...options, includeFutureDirections: event.target.checked })} />未来方向</label>
      </div>
    </div>
  );
}

function DirField({ label, value, onChange, onChoose }: { label: string; value: string; onChange: (value: string) => void; onChoose: () => void }) {
  return (
    <label className="field-label">
      {label}
      <div className="flex gap-2">
        <input className="field-control h-11 min-w-0 flex-1 px-3" value={value} onChange={(event) => onChange(event.target.value)} />
        <button className="secondary-action h-11 px-3" onClick={onChoose} type="button"><Download size={15} /></button>
      </div>
    </label>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="empty-state">
      <div className="mb-3 rounded-full border border-line bg-surface p-3 text-ink/50"><Sparkles size={18} /></div>
      <div className="font-medium text-ink">{title}</div>
      <p className="mt-2 max-w-md text-center text-sm leading-6 text-ink/50">{description}</p>
    </div>
  );
}

function buildHotspotQualitySummary(hotspots: Hotspot[]) {
  if (hotspots.length === 0) {
    return {
      count: 0,
      confidence: 0,
      keywordFocus: 0,
      representativeCoverage: 0,
      evidenceCount: 0,
      trendText: "暂无热点",
      warningText: "导入或检索文献后，运行大库清洗与 V20 热点聚类。",
    };
  }

  const evidenceIds = new Set<string>();
  const warnings = new Map<string, number>();
  let confidenceTotal = 0;
  let keywordFocusTotal = 0;
  let representativeCoverageTotal = 0;

  for (const hotspot of hotspots) {
    confidenceTotal += hotspot.confidence ?? 0;
    keywordFocusTotal += hotspot.analysis?.keywordFocus ?? estimateKeywordFocus(hotspot);
    representativeCoverageTotal += hotspot.analysis?.representativeCoverage ?? estimateRepresentativeCoverage(hotspot);
    for (const id of hotspot.analysis?.evidencePaperIds ?? hotspot.evolution.flatMap((item) => item.representativeIds)) {
      evidenceIds.add(id);
    }
    for (const warning of hotspot.analysis?.warnings ?? []) {
      warnings.set(warning, (warnings.get(warning) ?? 0) + 1);
    }
  }

  const trendText = countBy(hotspots, (hotspot) => hotspot.trend)
    .map(([trend, count]) => `${trend} ${count}`)
    .join(" / ");
  const warningText = Array.from(warnings.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([warning, count]) => `${warning}：${count}`)
    .join("；");

  return {
    count: hotspots.length,
    confidence: confidenceTotal / hotspots.length,
    keywordFocus: keywordFocusTotal / hotspots.length,
    representativeCoverage: representativeCoverageTotal / hotspots.length,
    evidenceCount: evidenceIds.size,
    trendText,
    warningText,
  };
}

function estimateKeywordFocus(hotspot: Hotspot) {
  const weights = hotspot.keywordWeights ?? [];
  if (weights.length === 0) return 0;
  const total = weights.reduce((sum, item) => sum + item.weight, 0) || 1;
  return weights.slice(0, 3).reduce((sum, item) => sum + item.weight, 0) / total;
}

function estimateRepresentativeCoverage(hotspot: Hotspot) {
  const ids = new Set(hotspot.evolution.flatMap((item) => item.representativeIds));
  return ids.size / Math.max(1, Math.min(18, hotspot.paperCount));
}

function formatPercent(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0%";
  return `${Math.round(value * 100)}%`;
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function buildFilterIndex(papers: Paper[]) {
  const keywords = new Set<string>();
  for (const paper of papers) {
    for (const token of `${paper.title} ${paper.abstract} ${paper.categories ?? ""}`.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}-]{2,}/gu) ?? []) {
      keywords.add(token);
    }
  }
  return {
    sources: new Set(papers.map((paper) => paper.source)).size,
    fields: new Set(papers.map((paper) => paper.field).filter(Boolean)).size,
    years: new Set(papers.map((paper) => paper.year).filter(Boolean)).size,
    keywords: keywords.size,
  };
}

function buildPaperQualityHints(papers: Paper[]): PaperQualityHint[] {
  const hints: PaperQualityHint[] = [];
  const currentYear = new Date().getFullYear();
  const titleBuckets = new Map<string, Paper[]>();
  const doiBuckets = new Map<string, Paper[]>();

  for (const paper of papers) {
    const titleKey = normalizePaperTitle(paper.title);
    if (titleKey) titleBuckets.set(titleKey, [...(titleBuckets.get(titleKey) ?? []), paper]);
    const doiKey = paper.doi?.trim().toLowerCase();
    if (doiKey) doiBuckets.set(doiKey, [...(doiBuckets.get(doiKey) ?? []), paper]);
    if (!paper.abstract?.trim()) hints.push({ level: "danger", label: "缺少摘要", detail: paper.title, paperId: paper.id });
    if (!paper.year) hints.push({ level: "warning", label: "缺少年份", detail: paper.title, paperId: paper.id });
    if (paper.year && (paper.year < 1900 || paper.year > currentYear + 1)) hints.push({ level: "danger", label: "年份异常", detail: `${paper.title}：${paper.year}`, paperId: paper.id });
    if (!paper.doi?.trim()) hints.push({ level: "warning", label: "缺少 DOI", detail: paper.title, paperId: paper.id });
    if (!paper.url?.trim()) hints.push({ level: "warning", label: "缺少 URL", detail: paper.title, paperId: paper.id });
  }

  for (const rows of titleBuckets.values()) {
    if (rows.length > 1) hints.unshift({ level: "danger", label: "疑似重复标题", detail: rows.map((paper) => paper.title).slice(0, 2).join(" / "), paperId: rows[0].id });
  }
  for (const rows of doiBuckets.values()) {
    if (rows.length > 1) hints.unshift({ level: "danger", label: "疑似重复 DOI", detail: rows.map((paper) => paper.title).slice(0, 2).join(" / "), paperId: rows[0].id });
  }

  return hints.slice(0, 80);
}

function buildHotspotLinks<T extends { hotspot: Hotspot }>(nodes: T[]) {
  const links: Array<{ source: (typeof nodes)[number]; target: (typeof nodes)[number]; score: number }> = [];
  for (let index = 0; index < nodes.length; index += 1) {
    for (let nextIndex = index + 1; nextIndex < nodes.length; nextIndex += 1) {
      const source = nodes[index];
      const target = nodes[nextIndex];
      const keywordScore = keywordSimilarity(source.hotspot.keywords, target.hotspot.keywords);
      const sameFieldBoost = source.hotspot.field === target.hotspot.field ? 0.09 : 0;
      const distance = Math.hypot(
        source.hotspot.coordinates.x - target.hotspot.coordinates.x,
        source.hotspot.coordinates.y - target.hotspot.coordinates.y,
        source.hotspot.coordinates.z - target.hotspot.coordinates.z,
      );
      const spatialScore = Math.max(0, 0.18 - distance / 420);
      const score = Math.min(0.62, keywordScore + sameFieldBoost + spatialScore);
      if (score >= 0.1) links.push({ source, target, score });
    }
  }
  return links.sort((a, b) => b.score - a.score).slice(0, 44);
}

function keywordSimilarity(left: string[], right: string[]) {
  const a = new Set(left.map((item) => item.toLowerCase()));
  const b = new Set(right.map((item) => item.toLowerCase()));
  const shared = Array.from(a).filter((item) => b.has(item)).length;
  const union = new Set([...a, ...b]).size || 1;
  return shared / union;
}

function estimateReportWorkload(paperCount: number, options: ReportGenerationOptions) {
  const lengthBase = options.targetLength === "long" ? 6500 : options.targetLength === "short" ? 1800 : 3200;
  const densityFactor = options.citationDensity === "high" ? 1.18 : options.citationDensity === "low" ? 0.88 : 1;
  const words = Math.round((lengthBase + Math.min(paperCount, 60) * 35) * densityFactor);
  const tokens = Math.round(words * 1.7 + paperCount * 220);
  const minutes = Math.max(1, Math.round(tokens / 2800));
  return { words, tokens, minutes };
}

function projectName(projectId: string | undefined, projects: Project[]) {
  return projects.find((project) => project.id === projectId)?.name ?? "默认/未知项目";
}

function buildLogFixSuggestions(text: string | undefined) {
  if (!text) return [];
  const value = text.toLowerCase();
  const suggestions: string[] = [];
  if (value.includes("python") || value.includes("worker")) suggestions.push("检查设置页的 worker 临时目录，并确认 Python worker 文件仍在 workers 目录。");
  if (value.includes("api key") || value.includes("401") || value.includes("unauthorized")) suggestions.push("请在设置页重新保存 API Key；开发环境也可检查后端 DEEPSEEK_API_KEY 是否可用。");
  if (value.includes("permission") || value.includes("access") || value.includes("denied") || value.includes("eacces")) suggestions.push("把导出、备份、临时目录改到 D 盘可写目录，避免系统目录权限限制。");
  if (value.includes("network") || value.includes("fetch") || value.includes("timeout")) suggestions.push("检查网络连接、Base URL 和模型服务是否可访问，必要时降低检索数量后重试。");
  if (value.includes("json") || value.includes("parse")) suggestions.push("检查导入文件或 worker 输出是否为合法 UTF-8 JSON。");
  return suggestions.length > 0 ? suggestions : ["查看原始输入/输出，确认数据格式、目录权限和外部服务连接后重试。"];
}

function normalizePaperTitle(value: string) {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function countBy<T>(rows: T[], getKey: (row: T) => string) {
  const counts = new Map<string, number>();
  rows.forEach((row) => {
    const key = getKey(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}


