import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Atom,
  BookOpen,
  BrainCircuit,
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
  LocateFixed,
  Maximize2,
  Minimize2,
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
  type GalaxySystemViewMode,
} from "./components/App17GalaxyCanvas";

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
  chooseSqliteBackupFile,
  confirmDesktopAction,
  controlPaperFileImport,
  deletePapersFromLibrary,
  getApp17GalaxyPayload,
  getV20GalaxyPayload,
  getV20HotspotSnapshot,
  getLibrarySetupState,
  getPaperLibraryFacets,
  getPaperLibraryStatus,
  getAppCredentialStatus,
  getPapersByIds,
  getDemoPaperSamplePath,
  isGalaxyVisualReviewMode,
  isDesktopRuntime,
  initializeLibrary,
  inspectPaperLibraryBackup,
  loadApp17Galaxy,
  openExternalUrl,
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
  validateLibraryLocation,
  upsertPaperLibrary,
  writeTextFile,
  type DesktopHealthResult,
  type LibraryPressureTestResult,
  type LibrarySetupMode,
  type LibrarySetupState,
  type InitializeLibraryResult,
  type PaperFileImportProgress,
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

type LiteratureWorkspaceTab = "library" | "ingest" | "analysis";

type PipelineStepId = "prepare" | "clean" | "cluster" | "result";

type PipelineStepState = "pending" | "running" | "done" | "failed";

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
};

function readGalaxyVisualReviewIntent(): GalaxyVisualReviewIntent | undefined {
  if (!isGalaxyVisualReviewMode() || typeof window === "undefined") return undefined;
  const params = new URLSearchParams(window.location.search);
  const parsedTopic = Number(params.get("topic"));
  const requestedStage = params.get("stage");
  return {
    field: params.get("field")?.trim() || undefined,
    topic: params.has("topic") && Number.isFinite(parsedTopic) ? parsedTopic : undefined,
    paperId: params.get("paperId")?.trim() || undefined,
    stage: requestedStage === "system" || requestedStage === "paper" ? requestedStage : "overview",
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

export default function App() {
  const galaxyVisualReview = isGalaxyVisualReviewMode();
  const galaxyVisualReviewIntent = useMemo(readGalaxyVisualReviewIntent, []);
  const [activeView, setActiveView] = useState<ActiveView>(() => galaxyVisualReview ? "galaxy" : "dashboard");
  const [galaxyVisited, setGalaxyVisited] = useState(galaxyVisualReview);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [libraryStatus, setLibraryStatus] = useState<PaperLibraryStatus | null>(null);
  const [librarySetupState, setLibrarySetupState] = useState<LibrarySetupState | null>(null);
  const [librarySetupRequired, setLibrarySetupRequired] = useState(false);
  const [libraryFacets, setLibraryFacets] = useState<PaperLibraryFacets | null>(null);
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [v20Snapshot, setV20Snapshot] = useState<V20HotspotSnapshot | null>(null);
  const [reports, setReports] = useState<ResearchReport[]>([]);
  const [jobs, setJobs] = useState<PipelineJob[]>([]);
  const [taskLogs, setTaskLogs] = useState<TaskLog[]>([]);
  const [allTaskLogs, setAllTaskLogs] = useState<TaskLog[]>([]);
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [searchFocusIntent, setSearchFocusIntent] = useState<SearchFocusIntent | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const galaxySessionsRef = useRef(new Map<string, GalaxySessionState>());
  const galaxyRequestsRef = useRef(new Map<string, Promise<void>>());
  const refreshRequestSequenceRef = useRef(0);
  const [, refreshGalaxySessions] = useState(0);

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
    if (isDesktopRuntime() && !galaxyVisualReview) {
      const snapshot = await getV20HotspotSnapshot({ databaseDir: nextSettings.databaseDir, projectId: nextProject.id });
      nextV20Snapshot = snapshot ?? null;
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
    setLibraryStatus(nextStatus);
    setLibraryFacets(nextFacets);
    setHotspots(nextHotspots);
    setV20Snapshot(nextV20Snapshot);
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
        if (isDesktopRuntime() && !galaxyVisualReview) {
          const nextSetupState = await getLibrarySetupState(nextSettings.databaseDir);
          if (!nextSetupState.configured || (!import.meta.env.DEV && !nextSettings.librarySetupCompleted && !nextSettings.databaseDir.trim())) {
            if (mounted) {
              setSettings(nextSettings);
              setLibrarySetupState(nextSetupState);
              setLibrarySetupRequired(true);
            }
            return;
          }
          if (!nextSettings.librarySetupCompleted && nextSettings.databaseDir.trim()) {
            await saveAiSettings({
              ...nextSettings,
              librarySetupCompleted: true,
              librarySetupMode: "existing",
            });
          }
        }
        if (mounted) await refreshAll();
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "桌面端初始化失败。");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void boot();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!workspaceRef.current) return;
    workspaceRef.current.parentElement?.scrollTo({ top: 0, left: 0 });
    workspaceRef.current.scrollTo({ top: 0, left: 0 });
  }, [activeView]);

  useEffect(() => {
    if (activeView === "galaxy") setGalaxyVisited(true);
  }, [activeView]);

  if (librarySetupRequired && settings && librarySetupState) {
    return (
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
            await refreshAll();
            setLibrarySetupRequired(false);
            setLibrarySetupState(null);
            setNotice(result.summary);
          } finally {
            setLoading(false);
          }
        }}
      />
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar-surface">
        <div className="brand-block">
          <div className="brand-mark">
            <BrainCircuit size={22} />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-ink">科研热点分析桌面端</div>
          </div>
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
            const active = item.id === activeView;
            return (
              <button key={item.id} className={`nav-row ${active ? "nav-row-active" : ""}`} onClick={() => setActiveView(item.id)}>
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
          <div>SQLite 承载论文主库，IndexedDB 保留设置、热点、报告与任务日志。</div>
          <div className="mt-2 text-ink/35">v{__APP_VERSION__} · {libraryStatus ? formatBytes(libraryStatus.sizeBytes) : "loading"}</div>
        </div>
      </aside>

      <section ref={workspaceRef} className="workspace">
        {activeView === "dashboard" && (
          <DashboardView dashboard={dashboard} papers={papers} hotspots={hotspots} reports={reports} jobs={jobs} taskLogs={taskLogs} libraryStatus={libraryStatus} v20Snapshot={v20Snapshot} loading={loading} onNavigate={setActiveView} />
        )}
        {activeView === "search" && settings && activeProject && <SearchWorkspace settings={settings} activeProject={activeProject} libraryStatus={libraryStatus} libraryFacets={libraryFacets} searchFocusIntent={searchFocusIntent} onNavigate={setActiveView} onRefresh={refreshAll} onNotice={setNotice} />}
        {(activeView === "galaxy" || galaxyVisited) && settings && activeProject && (
          <div className={activeView === "galaxy" ? "contents" : "hidden"} aria-hidden={activeView !== "galaxy"}>
            <GalaxyView
              key={galaxySessionCacheKey(settings.databaseDir, activeProject.id)}
              active={activeView === "galaxy"}
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
        {activeView === "hotspots" && settings && activeProject && <HotspotLibrary hotspots={hotspots} settings={settings} activeProject={activeProject} onNavigate={setActiveView} onRefresh={refreshAll} onNotice={setNotice} />}
        {activeView === "reports" && <ReportLibrary reports={reports} papers={papers} settings={settings} activeProject={activeProject} onRefresh={refreshAll} onNotice={setNotice} />}
        {activeView === "pipeline" && settings && activeProject && <PipelineView jobs={jobs} taskLogs={taskLogs} papers={papers} hotspots={hotspots} settings={settings} activeProject={activeProject} libraryStatus={libraryStatus} v20Snapshot={v20Snapshot} onNavigate={setActiveView} onRefresh={refreshAll} onNotice={setNotice} />}
        {activeView === "logs" && settings && <LogsView taskLogs={taskLogs} allTaskLogs={allTaskLogs} projects={projects} activeProject={activeProject} papers={papers} settings={settings} onRefresh={refreshAll} onNotice={setNotice} />}
        {activeView === "health" && settings && <HealthView settings={settings} papers={papers} libraryStatus={libraryStatus} onNavigate={setActiveView} onRefresh={refreshAll} onNotice={setNotice} />}
        {activeView === "about" && <AboutView settings={settings} libraryStatus={libraryStatus} hotspots={hotspots} reports={reports} />}
        {activeView === "settings" && settings && <SettingsView settings={settings} onSave={saveSettings} onRefresh={refreshAll} onNotice={setNotice} />}
      </section>

      {loading && (
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
        <div className="toast" onClick={() => setNotice("")}>
          {notice}
        </div>
      )}
    </main>
  );

  async function saveSettings(next: AiSettings) {
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
    if (settings && next.databaseDir.trim() !== settings.databaseDir.trim()) {
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
    setNotice("设置已保存。");
  }

  async function switchProject(projectId: string) {
    await activateProject(projectId);
    await refreshAll();
    setNotice("项目已切换。");
  }

  async function createNewProject() {
    const name = window.prompt("新项目名称", "新的科研课题");
    if (name === null) return;
    await createProject(name);
    await refreshAll();
    setNotice("项目已创建并切换。");
  }

  async function renameActiveProject() {
    if (!activeProject) return;
    const name = window.prompt("项目新名称", activeProject.name);
    if (name === null) return;
    await renameProject(activeProject.id, name);
    await refreshAll();
    setNotice("项目已重命名。");
  }

  async function deleteActiveProject() {
    if (!activeProject) return;
    if (!window.confirm(`确认删除项目“${activeProject.name}”？该项目下的文献、热点、报告和日志都会删除。`)) return;
    try {
      await deleteProject(activeProject.id);
      await refreshAll();
      setNotice("项目已删除。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "项目删除失败。");
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
  const [mode, setMode] = useState<LibrarySetupMode>(state.seedAvailable ? "seed" : "empty");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(state.message);
  const [error, setError] = useState("");

  const options: Array<{ id: LibrarySetupMode; title: string; description: string; disabled?: boolean }> = [
    {
      id: "seed",
      title: "安装默认论文数据",
      description: state.seedAvailable
        ? `V20 快照包含 ${state.seedPaperCount?.toLocaleString("zh-CN") ?? "-"} 篇论文、${state.seedHotspotCount?.toLocaleString("zh-CN") ?? "-"} 个热点与 ${state.seedMembershipCount?.toLocaleString("zh-CN") ?? "-"} 条归属，约 ${formatBytes(state.seedSizeBytes ?? 0)}。`
        : "当前 Lite 安装包未包含默认数据。",
      disabled: !state.seedAvailable,
    },
    { id: "empty", title: "空白开始", description: "创建完整但不含论文的本地 SQLite 库，稍后自行导入数据。" },
    { id: "existing", title: "使用现有 SQLite 论文库", description: "所选目录必须包含 research-hotspots-v7.sqlite。合法旧库可接入，但没有 V20 快照时需稍后显式运行热点建模。" },
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
      setMessage(mode === "seed" ? "正在复制并校验默认论文库，请勿关闭应用..." : mode === "empty" ? "正在创建空白论文库..." : "正在验证并接入现有论文库...");
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
          <div className="brand-mark"><BrainCircuit size={24} /></div>
          <div>
            <div className="text-xs font-semibold uppercase text-cyan/80">Research Hotspots Desktop</div>
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
        </div>

        <footer className="library-setup-footer">
          <div className={`library-setup-message ${error ? "library-setup-error" : ""}`}>
            {error ? <AlertTriangle size={16} /> : <ShieldCheck size={16} />}
            <span>{error || message}</span>
          </div>
          <button className="primary-button" type="button" disabled={busy || !databaseDir.trim()} onClick={submit}>
            {busy ? <Loader2 className="animate-spin" size={16} /> : <Database size={16} />}
            {busy ? "正在初始化" : "完成配置并进入应用"}
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
    if (!option) return;
    onChange(option.value);
    setOpen(false);
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) setOpen(true);
      setActiveIndex((current) => Math.min(options.length - 1, current + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) setOpen(true);
      setActiveIndex((current) => Math.max(0, current - 1));
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
                className={`select-option ${index === activeIndex ? "select-option-active" : ""} ${selectedOption ? "select-option-selected" : ""}`}
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
  }), [hotspots.length, jobs, paperCount, v20Snapshot]);
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
  searchFocusIntent,
  onNavigate,
  onRefresh,
  onNotice,
}: {
  settings: AiSettings;
  activeProject: Project;
  libraryStatus: PaperLibraryStatus | null;
  libraryFacets: PaperLibraryFacets | null;
  searchFocusIntent: SearchFocusIntent | null;
  onNavigate: (view: ActiveView) => void;
  onRefresh: () => Promise<void>;
  onNotice: (value: string) => void;
}) {
  const [query, setQuery] = useState("verifiable scientific agents");
  const [discipline, setDiscipline] = useState<string>(DISCIPLINES[2]);
  const [sources, setSources] = useState<SourceKind[]>(["openalex", "arxiv"]);
  const [maxResults, setMaxResults] = useState(12);
  const [libraryQuery, setLibraryQuery] = useState("");
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
  const [libraryPage, setLibraryPage] = useState<PaperQueryResult>({ rows: [], total: 0, limit: 20, offset: 0, queryMs: 0 });
  const [facets, setFacets] = useState<PaperLibraryFacets>(libraryFacets ?? { sources: [], fields: [], years: [] });
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [workspaceTab, setWorkspaceTab] = useState<LiteratureWorkspaceTab | null>(null);
  const [reportMode, setReportMode] = useState<"simple" | "deep">("deep");
  const [searchRows, setSearchRows] = useState<Paper[]>([]);
  const [currentReport, setCurrentReport] = useState<ResearchReport | null>(null);
  const [reportOptions, setReportOptions] = useState<ReportGenerationOptions>(defaultReportOptions);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importProgress, setImportProgress] = useState("");
  const [importJob, setImportJob] = useState<ImportJobState | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const literaturePageRef = useRef<HTMLDivElement | null>(null);
  const paperListScrollRef = useRef<HTMLDivElement | null>(null);
  const paperDetailScrollRef = useRef<HTMLElement | null>(null);
  const paperDetailEditorRef = useRef<PaperDetailEditorHandle | null>(null);
  const unsavedPaperDialogRef = useRef<HTMLDialogElement | null>(null);
  const importControlRef = useRef({ paused: false, cancelled: false });
  const desktopImportTaskIdRef = useRef("");

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
  const selectedPaper = visibleLibraryPapers.find((paper) => paper.id === selectedPaperId) ?? visibleLibraryPapers[0];
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
    setFacets(libraryFacets ?? { sources: [], fields: [], years: [] });
  }, [libraryFacets]);

  useEffect(() => {
    setPage(1);
  }, [libraryField, libraryQuery, librarySource, libraryYear, librarySort, pageSize]);

  useEffect(() => {
    setPageJump(String(page));
  }, [page]);

  useEffect(() => {
    if (!searchFocusIntent) return;
    setWorkspaceTab("library");
    setLibraryQuery(searchFocusIntent.query);
    if (searchFocusIntent.field) setLibraryField(searchFocusIntent.field);
    setPendingFocusPaperId(searchFocusIntent.paperId ?? "");
    setPage(1);
  }, [searchFocusIntent]);

  useEffect(() => {
    void loadLibraryPage();
  }, [activeProject.id, settings.databaseDir, libraryField, libraryQuery, librarySource, libraryYear, librarySort, page, pageSize]);

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
    if (!selectedPaperId || !visibleLibraryPapers.some((paper) => paper.id === selectedPaperId)) {
      setSelectedPaperId(visibleLibraryPapers[0]?.id ?? "");
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
            await loadLibraryPage();
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
              onNotice(payload.status === "done" ? "大文件直导完成。" : payload.status === "cancelled" ? "大文件直导已取消。" : payload.message);
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

  async function loadLibraryPage() {
    setLibraryLoading(true);
    try {
      const [nextFacets, nextPage] = await Promise.all([
        getPaperLibraryFacets(settings.databaseDir, activeProject.id),
        queryPaperLibrary({
          databaseDir: settings.databaseDir,
          projectId: activeProject.id,
          query: libraryQuery,
          source: librarySource,
          field: libraryField,
          year: libraryYear === "all" ? undefined : Number(libraryYear),
          limit: pageSize,
          offset: (Math.max(1, page) - 1) * pageSize,
          sort: librarySort,
        }),
      ]);
      setFacets(nextFacets);
      setLibraryPage(nextPage);
      const nextPageCount = Math.max(1, Math.ceil(nextPage.total / pageSize));
      if (page > nextPageCount) setPage(nextPageCount);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "文献库分页查询失败。");
    } finally {
      setLibraryLoading(false);
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
      await loadLibraryPage();
      await onRefresh();
      onNotice(`检索完成：${rows.length} 篇文献已入库。`);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "检索失败。");
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
      onNotice(error instanceof Error ? error.message : "本地文件解析失败。");
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
      onNotice(error instanceof Error ? error.message : "大文件直导启动失败。");
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
      onNotice(error instanceof Error ? error.message : "演示数据导入启动失败。");
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
      onNotice(error instanceof Error ? error.message : "MySQL 导入启动失败。");
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
          await loadLibraryPage();
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
      await loadLibraryPage();
      await onRefresh();
      onNotice(`导入完成：新增 ${inserted} 篇，更新 ${updated} 篇，文件内重复 ${importPreview.duplicateRows.length} 篇，无效 ${importPreview.invalidRows.length} 行。`);
      setImportJob((current) => current ? { ...current, status: "done", written: importPreview.validRows.length, inserted, updated } : current);
      setImportPreview(null);
      setImportProgress("");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "导入入库失败。");
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
      await loadLibraryPage();
      await onRefresh();
      onNotice(`已删除 ${count} 篇文献。`);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "删除失败。");
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
      onNotice(error instanceof Error ? error.message : "报告生成失败。");
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
      onNotice(error instanceof Error ? error.message : "修订失败。");
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

  return (
    <div ref={literaturePageRef} className={`page-grid literature-workspace-page ${activeWorkspaceTab === "library" ? "literature-workspace-library" : ""}`}>
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

      {activeWorkspaceTab === "ingest" && (
        <>
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

              <div className="library-toolbar-sticky">
                <div className="grid gap-2 lg:grid-cols-[1fr_128px_150px_128px_128px]">
                  <input className="field-control h-10 px-3 text-sm" value={libraryQuery} onChange={(event) => setLibraryQuery(event.target.value)} placeholder="筛选标题、摘要、作者" />
                  <SelectControl className="h-10 text-sm" value={librarySource} options={[{ value: "all", label: "全部来源" }, ...(["openalex", "arxiv", "cnki", "local"] as SourceKind[]).map((source) => ({ value: source, label: source }))]} onChange={(value) => setLibrarySource(value as SourceKind | "all")} />
                  <SelectControl className="h-10 text-sm" value={libraryField} options={[{ value: "all", label: "全部学科" }, ...fields.map((field) => ({ value: field, label: field }))]} onChange={setLibraryField} />
                  <SelectControl className="h-10 text-sm" value={libraryYear} options={[{ value: "all", label: "全部年份" }, ...years.map((year) => ({ value: String(year), label: String(year) }))]} onChange={setLibraryYear} />
                  <SelectControl className="h-10 text-sm" value={librarySort} options={[{ value: "newest", label: "最新" }, { value: "oldest", label: "最早" }, { value: "title", label: "标题" }]} onChange={(value) => setLibrarySort(value as "newest" | "oldest" | "title")} />
                </div>
                <div className="library-filter-strip">
                  {activeFilterLabels.length > 0 ? activeFilterLabels.map((label) => <span key={label}>{label}</span>) : <span>当前为全库视图</span>}
                  {activeFilterLabels.length > 0 && <button type="button" onClick={clearLibraryFilters}>清空筛选</button>}
                  <strong>{pageStart.toLocaleString()}-{pageEnd.toLocaleString()} / {libraryPage.total.toLocaleString()}</strong>
                </div>
              </div>

              {libraryDiagnosticsOpen && <div id="library-diagnostics-panel" className="library-diagnostics-panel">
                <div className="library-diagnostics">
                  <span>查询耗时：{libraryLoading ? "查询中" : `${libraryPage.queryMs} ms`}</span>
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
                    await loadLibraryPage();
                    await onRefresh();
                    onNotice("文献详情已保存。");
                  } catch (error) {
                    onNotice(error instanceof Error ? error.message : "文献保存失败。");
                    throw error;
                  }
                }}
              />
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

function galaxyPaperOverlayClass(state: GalaxyPaperPanelState) {
  if (state === "staged") return "galaxy-paper-reading-overlay-staged";
  if (state === "entering") return "galaxy-paper-reading-overlay-entering";
  if (state === "visible") return "galaxy-paper-reading-overlay-visible";
  if (state === "exiting") return "galaxy-paper-reading-overlay-exiting";
  return "galaxy-paper-reading-overlay-hidden";
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

function GalaxyView({
  active,
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
  const [field, setField] = useState("all");
  const [layoutMode, setLayoutMode] = useState<GalaxyLayoutMode>("semantic");
  const [visualMode, setVisualMode] = useState<GalaxyVisualMode>("nebula");
  const [minPaperCount, setMinPaperCount] = useState(1);
  const [minConfidence, setMinConfidence] = useState(0);
  const [selectedId, setSelectedId] = useState("");
  const [selectionActive, setSelectionActive] = useState(false);
  const [galaxyExplorationState, setGalaxyExplorationState] = useState<GalaxyExplorationState>("overview");
  const [galaxySystemViewMode, setGalaxySystemViewMode] = useState<GalaxySystemViewMode>("system");
  const [galaxyPaperFocusState, setGalaxyPaperFocusState] = useState<GalaxyPaperFocusState>("idle");
  const [galaxyPaperInspectionMode, setGalaxyPaperInspectionMode] = useState<GalaxyPaperInspectionMode>("none");
  const [galaxyPaperPanelState, setGalaxyPaperPanelState] = useState<GalaxyPaperPanelState>("hidden");
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
  const [galaxyBloomAvailable, setGalaxyBloomAvailable] = useState(true);
  const [galaxyBloomUnavailableReason, setGalaxyBloomUnavailableReason] = useState("");
  const [cameraCommand, setCameraCommand] = useState<GalaxyCameraCommand>({ kind: "reset", target: [0, 0, 0], distance: 78, nonce: 0 });
  const [galaxyDiagnosticsOpen, setGalaxyDiagnosticsOpen] = useState(false);
  const [galaxyDiagnosticsResetNonce, setGalaxyDiagnosticsResetNonce] = useState(0);
  const [galaxyPerformance, setGalaxyPerformance] = useState<GalaxyPerformanceSnapshot | null>(null);
  const [galaxyDiagnosticsCopyStatus, setGalaxyDiagnosticsCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const app17Payload = app17Session.payload;
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
  const selectedGalaxyPaperStatusText = selectedGalaxyPaper
    ? `${selectedGalaxyPaper.title} · ${selectedGalaxyPaper.source} · ${selectedGalaxyPaper.year ?? "未知年份"}`
    : selectedGalaxyPaperId
      ? `${selectedRepresentativeGalaxyPaper ? "代表论文" : "普通论文"} · ${selectedGalaxyPaperCoordinate?.year ?? "未知年份"}`
      : "";
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
    setField(visualReviewTargetHotspot.field);
    setSelectedId(visualReviewTargetHotspot.id);
    setSelectionActive(true);
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

  useEffect(() => {
    if (nodes.length === 0) return;
    setCameraCommand((current) => ({ kind: "fit", target: galaxyBounds.center, distance: galaxyBounds.distance, nonce: current.nonce + 1 }));
  }, [filteredHotspots.length, galaxyBounds.center, galaxyBounds.distance, layoutMode, nodes.length, visualMode]);

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

  return (
    <div className="page-grid">
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
          <p className="page-subtitle">星图以锐利点阵、星场密度和克制语义光丝呈现科研热点关系，避免大面积光晕和雾化发光团。</p>
        </div>
      </header>
      <section className="panel-card">
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
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
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
                <GalaxyDiagnosticMetric label="唯一论文 / 去重" value={`${galaxyPerformance.systemUniquePaperCount.toLocaleString()} / ${galaxyPerformance.systemDuplicatePaperCount.toLocaleString()}`} />
                <GalaxyDiagnosticMetric label="隐藏代表 / 未匹配" value={`${galaxyPerformance.systemHiddenRepresentativeCount} / ${galaxyPerformance.systemUnresolvedRepresentativeCount}`} />
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
      </section>
      <section className={`galaxy-workspace-grid grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px] ${galaxyPaperInspectionMode === "centered" ? "galaxy-workspace-paper-centered" : ""}`}>
        <div className={`galaxy-panel galaxy-panel-3d ${galaxyFullscreen ? "galaxy-panel-fullscreen" : ""} ${galaxyPaperPanelState !== "hidden" && galaxyPaperPanelState !== "staged" && galaxyPaperInspectionMode !== "centered" ? "galaxy-panel-paper-docked" : galaxyPaperInspectionMode === "centered" ? "galaxy-panel-paper-centered" : ""}`}>
          <div className={`galaxy-stage galaxy-stage-3d galaxy-stage-reference galaxy-stage-${visualMode}`}>
            {app17FilteredPayload?.ready ? (
              <App17GalaxyCanvas
                active={active}
                payload={app17FilteredPayload}
                selectedId={activeSelectedId}
                visualMode={visualMode}
                command={cameraCommand}
                representativePapers={representativeGalaxyPapers}
                selectedPaperId={selectedGalaxyPaperId}
                selectedPaperVisual={selectedGalaxyPaperVisual}
                paperDetailQueryMs={galaxyPaperDetailPerformance.queryMs}
                paperDetailCacheState={galaxyPaperDetailPerformance.cacheState}
                diagnosticsResetNonce={galaxyDiagnosticsResetNonce}
                fullscreen={galaxyFullscreen}
                onBloomAvailabilityChange={(available, reason) => {
                  setGalaxyBloomAvailable(available);
                  setGalaxyBloomUnavailableReason(reason || "");
                }}
                onPerformanceSnapshot={active && galaxyDiagnosticsOpen ? setGalaxyPerformance : undefined}
                onSelect={selectGalaxyHotspot}
                onSelectPaper={setSelectedGalaxyPaperId}
                onExplorationStateChange={(state) => {
                  setGalaxyExplorationState(state);
                  if (state === "overview") {
                    setSelectedGalaxyPaperId("");
                    setGalaxySystemViewMode("system");
                    setGalaxyPaperFocusState("idle");
                    setGalaxyPaperInspectionMode("none");
                    setGalaxyPaperPanelState("hidden");
                    setGalaxyFocusedPaperId("");
                  }
                }}
                onSystemViewModeChange={setGalaxySystemViewMode}
                onPaperFocusStateChange={(state, paperId) => {
                  setGalaxyPaperFocusState(state);
                  setGalaxyFocusedPaperId(paperId);
                  if (state === "idle") {
                    setGalaxyPaperInspectionMode("none");
                    setGalaxyPaperPanelState("hidden");
                  }
                }}
                onPaperInspectionModeChange={setGalaxyPaperInspectionMode}
                onPaperPanelStateChange={setGalaxyPaperPanelState}
                onClearSelection={() => {
                  setSelectionActive(false);
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
            <div className="galaxy-hud">
              <GalaxyModeSwitch
                mode={visualMode}
                disabled={galaxyExplorationState !== "overview"}
                onChange={(nextMode) => {
                  setVisualMode(nextMode);
                  setLayoutMode((currentLayout) => {
                    if (nextMode === "galaxy" && currentLayout === "semantic") return "spiral";
                    if (nextMode === "nebula" && currentLayout === "spiral") return "semantic";
                    return currentLayout;
                  });
                }}
              />
              {galaxyExplorationState === "overview" ? (
                <>
                  <button className="secondary-action h-8 px-3" onClick={() => commandCamera("reset")}>重置视角</button>
                  <button className="secondary-action h-8 px-3" onClick={() => commandCamera("fit")}>适配全图</button>
                  <button className="secondary-action h-8 px-3" onClick={() => commandCamera("top")}>俯视图</button>
                  {selectedNode && <button className="secondary-action galaxy-focus-action h-8 px-3" onClick={() => { setSelectionActive(true); commandCamera("enter-system"); }}>进入热点星系</button>}
                </>
              ) : galaxyExplorationState === "system" ? (
                <>
                  <span className="galaxy-system-mode-label">热点星系</span>
                  <span className="galaxy-bloom-status" title={galaxyBloomAvailable ? "仅增强主星紧凑核心与十篇代表论文" : galaxyBloomUnavailableReason || "当前环境不支持局部辉光"}>
                    {galaxyBloomAvailable ? "局部辉光已启用" : "基础渲染模式"}
                  </span>
                  {galaxyFullscreen && selectedGalaxyPaperId && (
                    <span className="galaxy-paper-selection-status" title={selectedGalaxyPaperStatusText}>
                      {selectedGalaxyPaperStatusText}
                    </span>
                  )}
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
                  ) : galaxyFullscreen && selectedGalaxyPaperId ? (
                    <button className="secondary-action h-8 gap-1.5 px-3" onClick={() => commandCamera("focus-paper")}><LocateFixed size={14} />靠近论文</button>
                  ) : null}
                  {galaxyPaperFocusState === "focused" && selectedGalaxyPaperId !== galaxyFocusedPaperId && (
                    <button className="secondary-action h-8 px-3" onClick={() => commandCamera("return-system-center")}>返回系统中心</button>
                  )}
                  <button className="secondary-action h-8 px-3" onClick={() => commandCamera("reset-system")}>重置系统视角</button>
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
              <button
                className="secondary-action h-8 gap-1.5 px-3"
                data-galaxy-fullscreen-toggle
                onClick={() => setGalaxyFullscreen((value) => !value)}
                disabled={galaxyPaperFocusState === "entering" || galaxyPaperFocusState === "exiting"}
                aria-pressed={galaxyFullscreen}
                title={galaxyFullscreen ? "退出星图全屏" : "星图全屏"}
              >
                {galaxyFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                {galaxyFullscreen ? "退出全屏" : "全屏"}
              </button>
            </div>
            <div className="galaxy-legend">
              {galaxyExplorationState === "overview" ? (
                <>
                  <span>{visualMode === "nebula" ? "展示星图" : "理论星图"}</span>
                  <span>粒子密度=论文数</span>
                  <span>核心亮度=置信度</span>
                  <span>光丝=关键词相似度</span>
                </>
              ) : (
                <>
                  <span>热点星系</span>
                  <span>{visualMode === "nebula" ? "代表轨道=共面" : "代表轨道=三维倾斜"}</span>
                  <span title="能量光核只用于区分前十篇代表论文，不表示引用量、影响力或真实能量">代表论文=能量光核</span>
                  <span>论文星大小=代表顺序</span>
                  <span>色温=年份 · 轨道色=来源</span>
                  <span title="轨道和极慢公转仅用于区分代表论文，不表示真实时间演化或引用关系">轨道=代表性排序</span>
                  <span title="日冕、磁场弧线和 Bloom 仅用于增强空间与能量层次，不表示额外科研数据">辉光=视觉增强</span>
                </>
              )}
            </div>
            <div className="galaxy-evidence-card" tabIndex={0} aria-label={selected ? `当前证据链：${selected.title}` : "星图筛选摘要"}>
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
            </div>
            {galaxyFullscreen
              && galaxyPaperPanelState !== "hidden"
              && galaxyPaperInspectionMode !== "centered"
              && galaxyPaperFocusState !== "idle"
              && selectedGalaxyPaperId && (
                <div className={`galaxy-paper-reading-overlay ${galaxyPaperOverlayClass(galaxyPaperPanelState)}`}>
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
                    fullscreen
                  />
                </div>
              )}
          </div>
        </div>
        <aside className={`panel-card galaxy-inspector ${galaxyPaperPanelState !== "hidden" && galaxyPaperInspectionMode !== "centered" && galaxyPaperFocusState !== "idle" ? `galaxy-inspector-paper-reading ${galaxyPaperInspectorClass(galaxyPaperPanelState)}` : ""}`}>
          {!galaxyFullscreen
          && galaxyPaperPanelState !== "hidden"
          && galaxyPaperInspectionMode !== "centered"
          && galaxyPaperFocusState !== "idle"
          && selectedGalaxyPaperId ? (
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
  onNavigate,
  onRefresh,
  onNotice,
}: {
  hotspots: Hotspot[];
  settings: AiSettings;
  activeProject: Project;
  onNavigate: (view: ActiveView) => void;
  onRefresh: () => Promise<void>;
  onNotice: (value: string) => void;
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
      onNotice(cancelled ? "AI 报告任务已取消。" : error instanceof Error ? error.message : "热点综述生成失败。");
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
      onNotice(message);
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
      onNotice(message);
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

function ReportLibrary({ reports, papers, settings, activeProject, onRefresh, onNotice }: { reports: ResearchReport[]; papers: Paper[]; settings: AiSettings | null; activeProject: Project | null; onRefresh: () => Promise<void>; onNotice: (value: string) => void }) {
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
        onNotice(error instanceof Error ? error.message : "报告绑定文献加载失败。");
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
      onNotice(error instanceof Error ? error.message : "章节重写失败。");
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
      onNotice(error instanceof Error ? error.message : "历史报告导入失败。");
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
  libraryStatus,
  v20Snapshot,
  onNavigate,
  onRefresh,
  onNotice,
}: {
  jobs: PipelineJob[];
  taskLogs: TaskLog[];
  papers: Paper[];
  hotspots: Hotspot[];
  settings: AiSettings;
  activeProject: Project;
  libraryStatus: PaperLibraryStatus | null;
  v20Snapshot: V20HotspotSnapshot | null;
  onNavigate: (view: ActiveView) => void;
  onRefresh: () => Promise<void>;
  onNotice: (value: string) => void;
}) {
  const [busyStage, setBusyStage] = useState<string>("");
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
  }), [hotspots.length, jobs, paperCount, v20Snapshot]);
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
                <span>{currentJob.detail}</span>
                <span>{currentJob.progress}%</span>
              </div>
              <div className="progress-track mt-2"><div style={{ width: `${currentJob.progress}%` }} /></div>
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
  onNotice: (value: string) => void;
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
      onNotice(error instanceof Error ? error.message : "任务重跑失败。");
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
  onNotice: (value: string) => void;
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
      onNotice(next.errors.length === 0 ? "健康检查通过。" : "健康检查发现问题，请查看详情。");
    } catch (error) {
      const message = error instanceof Error ? error.message : "健康检查失败。";
      setCheckError(message);
      setLastCheckedAt(nowIso());
      onNotice(message);
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
      onNotice(message);
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

function SettingsView({ settings, onSave, onRefresh, onNotice }: { settings: AiSettings; onSave: (settings: AiSettings) => Promise<void>; onRefresh: () => Promise<void>; onNotice: (value: string) => void }) {
  const [draft, setDraft] = useState(settings);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const restoreInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => setDraft(settings), [settings]);

  async function test() {
    setTesting(true);
    setMessage("");
    try {
      let effective = draft;
      if (draft.manualApiKey.trim() && draft.projectId && isDesktopRuntime()) {
        const status = await setAppCredential(draft.projectId, `ai-${draft.provider}`, draft.manualApiKey);
        effective = { ...draft, manualApiKey: "", apiCredentialConfigured: status.configured };
        setDraft(effective);
      }
      setMessage(await testAiConnection(effective));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "连接失败。");
    } finally {
      setTesting(false);
    }
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
      onNotice(error instanceof Error ? error.message : "设置保存失败。");
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
      onNotice(errorMessage);
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
      onNotice(errorMessage);
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
      onNotice(errorMessage);
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
      onNotice(errorMessage);
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
                测试连接
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
              <label className="field-label lg:col-span-2">服务地址（Base URL）<input className="field-control h-11 px-3" value={draft.baseUrl} onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })} /></label>
              <label className="field-label lg:col-span-2">API 密钥<input className="field-control h-11 px-3" type="password" value={draft.manualApiKey} onChange={(event) => setDraft({ ...draft, manualApiKey: event.target.value })} placeholder={draft.apiCredentialConfigured ? "已安全保存到 Windows 凭据管理器；输入新值可替换" : "输入后保存到 Windows 凭据管理器"} /></label>
              <label className="field-label">生成温度<input className="field-control h-11 px-3" type="number" step={0.05} min={0} max={1} value={draft.temperature} onChange={(event) => setDraft({ ...draft, temperature: Number(event.target.value) })} /></label>
              <label className="settings-toggle-row"><input type="checkbox" checked={draft.useEnvKey} onChange={(event) => setDraft({ ...draft, useEnvKey: event.target.checked })} />允许后端开发环境读取 DEEPSEEK_API_KEY</label>
            </div>
            {message && <div className="settings-connection-message" aria-live="polite">{message}</div>}
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

async function runLoggedWorker(stage: "clean" | "cluster", papers: Paper[], settings: AiSettings, onRefresh: () => Promise<void>, onNotice: (value: string) => void, setBusyStage: (value: string) => void, activeProject?: Project) {
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
      status: "running",
      progress: stage === "clean" ? 35 : 45,
      detail: stage === "clean" ? "正在 SQLite 论文库中规范化标题、摘要并删除空记录和重复记录。" : "正在运行 V20 热点分析：聚合关键词、筛选代表论文、判断趋势并生成星图坐标。",
    });
    await onRefresh();
    if (stage === "clean") {
      const result = activeProject ? await runLibraryCleanerWorker(settings.databaseDir, activeProject.id) : await runCleanerWorker(papers, settings.workerTempDir);
      if (!activeProject) {
        await replacePaperLibrary(result.cleanedPapers);
      }
      await updatePipelineJob("clean", { status: "done", progress: 100, detail: result.summary });
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
      const result = activeProject ? await runLibraryClusterWorker(settings.databaseDir, activeProject.id) : await runClusterWorker(papers, settings.workerTempDir);
      if (activeProject && isDesktopRuntime()) {
        const snapshot = await getV20HotspotSnapshot({ databaseDir: settings.databaseDir, projectId: activeProject.id });
        if (!snapshot || snapshot.snapshotId !== result.snapshotId) throw new Error("聚类完成后无法读取一致的 V20 活动快照。");
        await replaceV20HotspotCache(snapshot);
      } else {
        await replaceHotspots(result.hotspots.map((hotspot) => ({ ...hotspot, snapshotId: result.snapshotId })));
      }
      await updatePipelineJob("cluster", { status: "done", progress: 100, detail: result.summary });
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
    await updatePipelineJob(stage, { status: "failed", progress: 100, detail: message });
    await saveTaskLog({ stage, title: stage === "clean" ? (activeProject ? "SQLite 大库清洗去重" : "清洗去重 worker") : (activeProject ? "SQLite 大库热点聚类" : "热点聚类 worker"), status: "failed", inputSummary, outputSummary: "", rawInput: rawInputForLog, error: message, durationMs: Math.round(performance.now() - started) });
    await onRefresh();
    onNotice(message);
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
            <SelectControl className="h-10 text-sm" value={draft.source} options={(["openalex", "arxiv", "cnki", "local"] as SourceKind[]).map((source) => ({ value: source, label: source }))} onChange={(value) => setDraft({ ...draft, source: value as SourceKind })} />
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


