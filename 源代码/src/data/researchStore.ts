import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type {
  AiSettings,
  AppMeta,
  CnkiSettings,
  DashboardData,
  DataBackup,
  Hotspot,
  MarkdownExport,
  MysqlImportSettings,
  Paper,
  PipelineJob,
  Project,
  ResearchReport,
  SourceKind,
  TaskLog,
  V20CacheState,
  V20HotspotSnapshot,
} from "../types";
import { nowIso } from "../lib/dates";

const DB_NAME = "research-hotspots-desktop";
const DB_VERSION = 5;
const PROJECT_STORE = "projects";
const META_STORE = "meta";
const PAPER_STORE = "papers";
const HOTSPOT_STORE = "hotspots";
const REPORT_STORE = "reports";
const JOB_STORE = "pipelineJobs";
const SETTINGS_STORE = "settings";
const TASK_LOG_STORE = "taskLogs";
const DEFAULT_PROJECT_ID = "project-default";

interface ResearchDb extends DBSchema {
  projects: {
    key: string;
    value: Project;
    indexes: { "by-updatedAt": string };
  };
  meta: {
    key: "main";
    value: AppMeta;
  };
  papers: {
    key: string;
    value: Paper;
    indexes: {
      "by-source": SourceKind;
      "by-field": string;
      "by-year": number;
      "by-updatedAt": string;
    };
  };
  hotspots: {
    key: string;
    value: Hotspot;
    indexes: {
      "by-field": string;
      "by-paperCount": number;
      "by-updatedAt": string;
    };
  };
  reports: {
    key: string;
    value: ResearchReport;
    indexes: {
      "by-topic": string;
      "by-createdAt": string;
    };
  };
  pipelineJobs: {
    key: string;
    value: PipelineJob;
    indexes: {
      "by-stage": string;
      "by-updatedAt": string;
    };
  };
  settings: {
    key: string;
    value: AiSettings;
  };
  taskLogs: {
    key: string;
    value: TaskLog;
    indexes: {
      "by-stage": string;
      "by-status": string;
      "by-createdAt": string;
    };
  };
}

let dbPromise: Promise<IDBPDatabase<ResearchDb>> | undefined;

function getDb() {
  dbPromise ??= openDB<ResearchDb>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(PROJECT_STORE)) {
        const store = db.createObjectStore(PROJECT_STORE, { keyPath: "id" });
        store.createIndex("by-updatedAt", "updatedAt");
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(PAPER_STORE)) {
        const store = db.createObjectStore(PAPER_STORE, { keyPath: "id" });
        store.createIndex("by-source", "source");
        store.createIndex("by-field", "field");
        store.createIndex("by-year", "year");
        store.createIndex("by-updatedAt", "updatedAt");
      }
      if (!db.objectStoreNames.contains(HOTSPOT_STORE)) {
        const store = db.createObjectStore(HOTSPOT_STORE, { keyPath: "id" });
        store.createIndex("by-field", "field");
        store.createIndex("by-paperCount", "paperCount");
        store.createIndex("by-updatedAt", "updatedAt");
      }
      if (!db.objectStoreNames.contains(REPORT_STORE)) {
        const store = db.createObjectStore(REPORT_STORE, { keyPath: "id" });
        store.createIndex("by-topic", "topic");
        store.createIndex("by-createdAt", "createdAt");
      }
      if (!db.objectStoreNames.contains(JOB_STORE)) {
        const store = db.createObjectStore(JOB_STORE, { keyPath: "id" });
        store.createIndex("by-stage", "stage");
        store.createIndex("by-updatedAt", "updatedAt");
      }
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(TASK_LOG_STORE)) {
        const store = db.createObjectStore(TASK_LOG_STORE, { keyPath: "id" });
        store.createIndex("by-stage", "stage");
        store.createIndex("by-status", "status");
        store.createIndex("by-createdAt", "createdAt");
      }
    },
  });
  return dbPromise;
}

export async function seedResearchDataIfEmpty() {
  const db = await getDb();
  const projectId = await ensureProjectState(db);
  await migrateRowsToProject(db, projectId);

  if ((await activeCount(db, PAPER_STORE, projectId)) === 0) {
    await Promise.all(seedPapers(projectId).map((paper) => db.put(PAPER_STORE, paper)));
  }

  const [jobs, settings, logs] = await Promise.all([
    getPipelineJobs(),
    getAiSettings(),
    getTaskLogs(),
  ]);

  if (jobs.length === 0 || !jobs.some((job) => job.stage === "name")) {
    await replacePipelineJobs(seedJobs(projectId));
  }

  await saveAiSettings(settings);

  if (logs.length === 0 || !logs.some((log) => log.id.includes("v5-bootstrap"))) {
    await saveTaskLog({
      id: scopedId(projectId, "log-v5-bootstrap"),
      stage: "health",
      title: "V20 工程收尾初始化",
      status: "done",
      inputSummary: "IndexedDB v5: projects / meta / project-scoped papers, hotspots, reports, jobs, settings and task logs.",
      outputSummary: "项目隔离、文献治理、报告审计和 HTML 导出能力已可用。",
      durationMs: 0,
    });
  }
}

export async function getProjects() {
  const db = await getDb();
  await ensureProjectState(db);
  return (await db.getAll(PROJECT_STORE)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getActiveProject() {
  const db = await getDb();
  const projectId = await ensureProjectState(db);
  return (await db.get(PROJECT_STORE, projectId)) ?? defaultProject();
}

export async function setActiveProject(projectId: string) {
  const db = await getDb();
  const project = await db.get(PROJECT_STORE, projectId);
  if (!project) throw new Error("项目不存在。");
  const meta = await db.get(META_STORE, "main");
  await db.put(META_STORE, { ...meta, id: "main", activeProjectId: projectId, updatedAt: nowIso() });
  await db.put(PROJECT_STORE, { ...project, updatedAt: nowIso() });
  return project;
}

export async function createProject(name: string, description = "") {
  const db = await getDb();
  const timestamp = nowIso();
  const project: Project = {
    id: `project-${crypto.randomUUID()}`,
    name: name.trim() || "未命名课题",
    description,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await db.put(PROJECT_STORE, project);
  const meta = await db.get(META_STORE, "main");
  await db.put(META_STORE, { ...meta, id: "main", activeProjectId: project.id, updatedAt: timestamp });
  await Promise.all(seedJobs(project.id).map((job) => db.put(JOB_STORE, job)));
  await db.put(SETTINGS_STORE, defaultSettings(project.id));
  return project;
}

export async function renameProject(projectId: string, name: string) {
  const db = await getDb();
  const project = await db.get(PROJECT_STORE, projectId);
  if (!project) throw new Error("项目不存在。");
  const saved = { ...project, name: name.trim() || project.name, updatedAt: nowIso() };
  await db.put(PROJECT_STORE, saved);
  return saved;
}

export async function deleteProject(projectId: string) {
  if (projectId === DEFAULT_PROJECT_ID) throw new Error("默认项目不能删除。");
  const db = await getDb();
  const projects = await db.getAll(PROJECT_STORE);
  if (projects.length <= 1) throw new Error("至少需要保留一个项目。");
  await Promise.all([
    deleteRowsByProject(db, PAPER_STORE, projectId),
    deleteRowsByProject(db, HOTSPOT_STORE, projectId),
    deleteRowsByProject(db, REPORT_STORE, projectId),
    deleteRowsByProject(db, JOB_STORE, projectId),
    deleteRowsByProject(db, TASK_LOG_STORE, projectId),
    db.delete(SETTINGS_STORE, settingsKey(projectId)),
    db.delete(PROJECT_STORE, projectId),
  ]);
  const meta = await db.get(META_STORE, "main");
  const v20CacheStates = { ...(meta?.v20CacheStates ?? {}) };
  delete v20CacheStates[projectId];
  await db.put(META_STORE, { ...meta, id: "main", activeProjectId: DEFAULT_PROJECT_ID, v20CacheStates, updatedAt: nowIso() });
}

export async function getPapers() {
  const db = await getDb();
  const projectId = await ensureProjectState(db);
  return filterProject(await db.getAll(PAPER_STORE), projectId).sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
}

export async function countIndexedDbPapers() {
  const db = await getDb();
  const projectId = await ensureProjectState(db);
  let count = 0;
  const tx = db.transaction(PAPER_STORE, "readonly");
  let cursor = await tx.store.openCursor();
  while (cursor) {
    const value = cursor.value as Paper;
    if ((value.projectId ?? DEFAULT_PROJECT_ID) === projectId) count += 1;
    cursor = await cursor.continue();
  }
  await tx.done;
  return count;
}

export async function forEachIndexedDbPaperBatch(batchSize: number, onBatch: (papers: Paper[]) => Promise<void>) {
  const db = await getDb();
  const projectId = await ensureProjectState(db);
  let lastKey: IDBValidKey | undefined;
  const safeBatchSize = Math.max(100, Math.min(2000, batchSize));

  while (true) {
    const tx = db.transaction(PAPER_STORE, "readonly");
    const range = lastKey === undefined ? undefined : IDBKeyRange.lowerBound(lastKey, true);
    let cursor = await tx.store.openCursor(range);
    const batch: Paper[] = [];

    while (cursor && batch.length < safeBatchSize) {
      lastKey = cursor.key;
      const value = cursor.value as Paper;
      if ((value.projectId ?? DEFAULT_PROJECT_ID) === projectId) batch.push(value);
      cursor = await cursor.continue();
    }

    await tx.done;
    if (batch.length === 0) break;
    await onBatch(batch);
    if (!cursor) break;
  }
}

export async function upsertPapers(input: Array<Omit<Paper, "createdAt" | "updatedAt">>) {
  const db = await getDb();
  const projectId = await ensureProjectState(db);
  const timestamp = nowIso();
  const existingRows = await db.getAll(PAPER_STORE);
  const existingById = new Map(existingRows.map((paper) => [paper.id, paper]));
  await Promise.all(
    input.map((paper) => {
      const id = scopedId(projectId, paper.id);
      const existing = existingById.get(id);
      return db.put(PAPER_STORE, {
        ...existing,
        ...paper,
        id,
        projectId,
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
      });
    }),
  );
}

export async function savePaper(paper: Paper) {
  const db = await getDb();
  const projectId = await ensureProjectState(db);
  const saved = { ...paper, id: scopedId(projectId, paper.id), projectId, updatedAt: nowIso() };
  await db.put(PAPER_STORE, saved);
  return saved;
}

export async function replacePaperLibrary(papers: Paper[]) {
  const db = await getDb();
  const projectId = await ensureProjectState(db);
  await deleteRowsByProject(db, PAPER_STORE, projectId);
  const timestamp = nowIso();
  await Promise.all(papers.map((paper) => db.put(PAPER_STORE, { ...paper, id: scopedId(projectId, paper.id), projectId, updatedAt: timestamp })));
}

export async function deletePapers(ids: string[]) {
  if (ids.length === 0) return 0;
  const db = await getDb();
  await Promise.all(ids.map((id) => db.delete(PAPER_STORE, id)));
  return ids.length;
}

export async function getHotspots() {
  const db = await getDb();
  const projectId = await ensureProjectState(db);
  const state = (await db.get(META_STORE, "main"))?.v20CacheStates?.[projectId];
  if (!state?.snapshotId) return [];
  return filterProject(await db.getAll(HOTSPOT_STORE), projectId)
    .filter((hotspot) => hotspot.databaseKey === state.databaseKey && hotspot.snapshotId === state.snapshotId)
    .sort((a, b) => b.paperCount - a.paperCount);
}

export async function getV20CacheState(projectId?: string) {
  const db = await getDb();
  const activeProjectId = projectId ?? await ensureProjectState(db);
  return (await db.get(META_STORE, "main"))?.v20CacheStates?.[activeProjectId];
}

export async function replaceV20HotspotCache(snapshot: V20HotspotSnapshot) {
  const db = await getDb();
  const timestamp = nowIso();
  const tx = db.transaction([HOTSPOT_STORE, META_STORE], "readwrite");
  const hotspotStore = tx.objectStore(HOTSPOT_STORE);
  let cursor = await hotspotStore.openCursor();
  while (cursor) {
    const hotspot = cursor.value;
    if ((hotspot.projectId ?? DEFAULT_PROJECT_ID) === snapshot.projectId) await cursor.delete();
    cursor = await cursor.continue();
  }
  if (snapshot.snapshotId) {
    for (const hotspot of snapshot.hotspots) {
      await hotspotStore.put({
        ...hotspot,
        id: scopedId(snapshot.projectId, hotspot.id),
        projectId: snapshot.projectId,
        databaseKey: snapshot.databaseKey,
        snapshotId: snapshot.snapshotId,
        updatedAt: hotspot.updatedAt || timestamp,
      });
    }
  }
  const metaStore = tx.objectStore(META_STORE);
  const meta = await metaStore.get("main") ?? { id: "main" as const, activeProjectId: snapshot.projectId, updatedAt: timestamp };
  const cacheState: V20CacheState = {
    databaseKey: snapshot.databaseKey,
    projectId: snapshot.projectId,
    snapshotId: snapshot.snapshotId,
    paperCount: snapshot.paperCount,
    hotspotCount: snapshot.hotspotCount,
    membershipCount: snapshot.membershipCount,
    generatedAt: snapshot.generatedAt,
  };
  await metaStore.put({
    ...meta,
    v20CacheStates: { ...(meta.v20CacheStates ?? {}), [snapshot.projectId]: cacheState },
    updatedAt: timestamp,
  });
  await tx.done;
  return cacheState;
}

export async function saveHotspot(hotspot: Hotspot) {
  const db = await getDb();
  const projectId = await ensureProjectState(db);
  const saved = { ...hotspot, id: scopedId(projectId, hotspot.id), projectId, source: "manual" as const, updatedAt: nowIso() };
  await db.put(HOTSPOT_STORE, saved);
  return saved;
}

export async function replaceHotspots(hotspots: Hotspot[]) {
  const db = await getDb();
  const projectId = await ensureProjectState(db);
  const timestamp = nowIso();
  const tx = db.transaction(HOTSPOT_STORE, "readwrite");
  const store = tx.objectStore(HOTSPOT_STORE);
  const existing = await store.getAll();
  for (const hotspot of existing) {
    if (hotspot.projectId === projectId || (!hotspot.projectId && projectId === DEFAULT_PROJECT_ID)) await store.delete(hotspot.id);
  }
  for (const hotspot of hotspots) {
    await store.put({ ...hotspot, id: scopedId(projectId, hotspot.id), projectId, updatedAt: timestamp });
  }
  await tx.done;
}

export async function getReports() {
  const db = await getDb();
  const projectId = await ensureProjectState(db);
  return filterProject(await db.getAll(REPORT_STORE), projectId)
    .map((report) => ({ ...report, reviewStatus: report.reviewStatus ?? "needs-review" as const }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

type NewReportInput = Omit<ResearchReport, "id" | "createdAt" | "updatedAt" | "reviewStatus"> & Partial<Pick<ResearchReport, "reviewStatus">>;

export async function saveReport(report: NewReportInput) {
  const db = await getDb();
  const projectId = await ensureProjectState(db);
  const snapshotId = report.snapshotId ?? (await db.get(META_STORE, "main"))?.v20CacheStates?.[projectId]?.snapshotId;
  const timestamp = nowIso();
  const saved: ResearchReport = {
    ...report,
    snapshotId,
    reviewStatus: report.reviewStatus ?? "needs-review",
    id: scopedId(projectId, crypto.randomUUID()),
    projectId,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await db.put(REPORT_STORE, saved);
  return saved;
}

export async function saveReportWithTaskLog(
  report: NewReportInput,
  log: Omit<TaskLog, "id" | "createdAt"> & Partial<Pick<TaskLog, "id" | "createdAt">>,
) {
  const db = await getDb();
  const projectId = await ensureProjectState(db);
  const snapshotId = report.snapshotId ?? (await db.get(META_STORE, "main"))?.v20CacheStates?.[projectId]?.snapshotId;
  const timestamp = nowIso();
  const saved: ResearchReport = { ...report, snapshotId, reviewStatus: report.reviewStatus ?? "needs-review", id: scopedId(projectId, crypto.randomUUID()), projectId, createdAt: timestamp, updatedAt: timestamp };
  const savedLog: TaskLog = { ...log, id: scopedId(projectId, log.id ?? crypto.randomUUID()), projectId, createdAt: log.createdAt ?? timestamp };
  const tx = db.transaction([REPORT_STORE, TASK_LOG_STORE], "readwrite");
  await tx.objectStore(REPORT_STORE).put(saved);
  await tx.objectStore(TASK_LOG_STORE).put(savedLog);
  await tx.done;
  return { report: saved, taskLog: savedLog };
}

export async function approveReport(reportId: string, reviewedBy = "user") {
  const db = await getDb();
  const existing = await db.get(REPORT_STORE, reportId);
  if (!existing) throw new Error("Report not found.");
  const updated: ResearchReport = { ...existing, reviewStatus: "approved", reviewedAt: nowIso(), reviewedBy, updatedAt: nowIso() };
  await db.put(REPORT_STORE, updated);
  return updated;
}

export async function importMarkdownReports(rows: MarkdownExport[]) {
  const db = await getDb();
  const projectId = await ensureProjectState(db);
  const existing = filterProject(await db.getAll(REPORT_STORE), projectId);
  const existingIds = new Set(existing.map((report) => report.id));
  const existingContentKeys = new Set(existing.map((report) => contentKey(report.content)));
  const timestamp = nowIso();
  const nextReports: ResearchReport[] = [];

  for (const row of rows) {
    const parsed = parseMarkdownExport(row);
    const id = scopedId(projectId, `imported:${row.fileName}`);
    if (existingIds.has(id) || existingContentKeys.has(contentKey(row.content))) continue;
    nextReports.push({
      id,
      projectId,
      topic: parsed.topic,
      mode: parsed.mode,
      discipline: parsed.discipline,
      content: row.content,
      paperIds: [],
      metrics: { citationCoverage: 0, citationAccuracy: 0, consistencyScore: 0 },
      reviewStatus: "needs-review",
      createdAt: parsed.createdAt ?? timestamp,
      updatedAt: timestamp,
    });
  }

  await Promise.all(nextReports.map((report) => db.put(REPORT_STORE, report)));
  return nextReports.length;
}

export async function getPipelineJobs() {
  const db = await getDb();
  const projectId = await ensureProjectState(db);
  return filterProject(await db.getAll(JOB_STORE), projectId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function updatePipelineJob(stage: PipelineJob["stage"], patch: Partial<Omit<PipelineJob, "id" | "stage" | "createdAt">>) {
  const db = await getDb();
  const activeProjectId = await ensureProjectState(db);
  const projectId = patch.projectId ?? activeProjectId;
  const jobs = filterProject(await db.getAll(JOB_STORE), projectId);
  const databaseKey = patch.databaseKey ?? "";
  const executionSessionId = patch.executionSessionId ?? "";
  const existing = jobs.find((job) => (
    job.stage === stage
      && (job.databaseKey ?? "") === databaseKey
      && (job.executionSessionId ?? "") === executionSessionId
  ));
  const timestamp = nowIso();
  const saved: PipelineJob = {
    id: existing?.id ?? scopedId(projectId, `job-${stage}-${executionSessionId || "legacy"}-${timestamp}`),
    projectId,
    stage,
    title: existing?.title ?? stage,
    status: existing?.status ?? "queued",
    detail: existing?.detail ?? "",
    progress: existing?.progress ?? 0,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
    ...patch,
  };
  await db.put(JOB_STORE, saved);
  return saved;
}

export async function getTaskLogs() {
  const db = await getDb();
  const projectId = await ensureProjectState(db);
  return filterProject(await db.getAll(TASK_LOG_STORE), projectId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getAllTaskLogs() {
  const db = await getDb();
  await ensureProjectState(db);
  return (await db.getAll(TASK_LOG_STORE)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function reconcileInterruptedAiTaskLogs() {
  const db = await getDb();
  await ensureProjectState(db);
  const interrupted = (await db.getAll(TASK_LOG_STORE)).filter((log) => log.status === "running" && Boolean(log.taskKey));
  if (interrupted.length === 0) return 0;
  const tx = db.transaction(TASK_LOG_STORE, "readwrite");
  await Promise.all(interrupted.map((log) => tx.store.put({
    ...log,
    status: "cancelled" as const,
    outputSummary: "应用上次退出时 AI 后台任务仍在运行，现已标记为中断。",
    error: undefined,
  })));
  await tx.done;
  return interrupted.length;
}

export async function saveTaskLog(log: Omit<TaskLog, "id" | "createdAt"> & Partial<Pick<TaskLog, "id" | "createdAt">>) {
  const db = await getDb();
  const projectId = await ensureProjectState(db);
  const saved: TaskLog = {
    ...log,
    id: scopedId(projectId, log.id ?? crypto.randomUUID()),
    projectId,
    createdAt: log.createdAt ?? nowIso(),
  };
  await db.put(TASK_LOG_STORE, saved);
  return saved;
}

export async function clearTaskLogs() {
  const db = await getDb();
  const projectId = await ensureProjectState(db);
  await deleteRowsByProject(db, TASK_LOG_STORE, projectId);
}

export async function getAiSettings() {
  const db = await getDb();
  const projectId = await ensureProjectState(db);
  const settings = normalizeSettings((await db.get(SETTINGS_STORE, settingsKey(projectId))) ?? defaultSettings(projectId), projectId);
  return settings;
}

export async function saveAiSettings(settings: AiSettings) {
  const db = await getDb();
  const projectId = await ensureProjectState(db);
  const saved = normalizeSettings({ ...settings, manualApiKey: "", mysql: { ...settings.mysql, password: "" }, updatedAt: nowIso() }, projectId);
  await db.put(SETTINGS_STORE, saved);
  return saved;
}

export async function exportBackupData(): Promise<DataBackup> {
  const db = await getDb();
  const activeProjectId = await ensureProjectState(db);
  const [projects, papers, reports, jobs, taskLogs, settings] = await Promise.all([
    db.getAll(PROJECT_STORE),
    db.getAll(PAPER_STORE),
    db.getAll(REPORT_STORE),
    db.getAll(JOB_STORE),
    db.getAll(TASK_LOG_STORE),
    getAiSettings(),
  ]);
  const {
    manualApiKey: _manualApiKey,
    apiCredentialConfigured: _apiCredentialConfigured,
    mysql,
    ...backupSettings
  } = settings;
  const {
    password: _mysqlPassword,
    credentialConfigured: _mysqlCredentialConfigured,
    ...backupMysql
  } = mysql;
  return {
    schemaVersion: 2,
    version: __APP_VERSION__,
    exportedAt: nowIso(),
    projects,
    activeProjectId,
    papers,
    hotspots: [],
    reports,
    jobs,
    settings: { ...backupSettings, mysql: backupMysql },
    taskLogs,
  };
}

export async function restoreBackupData(backup: DataBackup) {
  const db = await getDb();
  const timestamp = nowIso();
  const normalized = normalizeBackupForRestore(backup, timestamp);
  const tx = db.transaction(
    [PROJECT_STORE, META_STORE, PAPER_STORE, HOTSPOT_STORE, REPORT_STORE, JOB_STORE, SETTINGS_STORE, TASK_LOG_STORE],
    "readwrite",
  );
  try {
    await Promise.all([
      tx.objectStore(PROJECT_STORE).clear(),
      tx.objectStore(META_STORE).clear(),
      tx.objectStore(PAPER_STORE).clear(),
      tx.objectStore(HOTSPOT_STORE).clear(),
      tx.objectStore(REPORT_STORE).clear(),
      tx.objectStore(JOB_STORE).clear(),
      tx.objectStore(SETTINGS_STORE).clear(),
      tx.objectStore(TASK_LOG_STORE).clear(),
    ]);
    for (const project of normalized.projects) await tx.objectStore(PROJECT_STORE).put(project);
    for (const paper of normalized.papers) await tx.objectStore(PAPER_STORE).put(paper);
    for (const report of normalized.reports) await tx.objectStore(REPORT_STORE).put(report);
    for (const job of normalized.jobs) await tx.objectStore(JOB_STORE).put(job);
    for (const log of normalized.taskLogs) await tx.objectStore(TASK_LOG_STORE).put(log);
    await tx.objectStore(META_STORE).put({ id: "main", activeProjectId: normalized.activeProjectId, v20CacheStates: {}, updatedAt: timestamp });
    await tx.objectStore(SETTINGS_STORE).put(normalized.settings);
    await tx.done;
  } catch (error) {
    try { tx.abort(); } catch { /* the browser may already have aborted the transaction */ }
    throw error;
  }

  return {
    paperCount: normalized.papers.length,
    hotspotCount: 0,
    reportCount: normalized.reports.length,
    taskLogCount: normalized.taskLogs.length,
  };
}

function normalizeBackupForRestore(backup: DataBackup, timestamp: string) {
  if (!backup || typeof backup !== "object") throw new Error("备份文件格式无效。");
  for (const key of ["papers", "reports", "jobs", "taskLogs"] as const) {
    if (!Array.isArray(backup[key])) throw new Error(`备份字段 ${key} 必须是数组。`);
  }
  if (backup.projects !== undefined && !Array.isArray(backup.projects)) throw new Error("备份字段 projects 必须是数组。");
  if (backup.schemaVersion !== undefined && backup.schemaVersion !== 1 && backup.schemaVersion !== 2) {
    throw new Error(`不支持的备份 schemaVersion：${backup.schemaVersion}。`);
  }
  const projects = backup.projects?.length
    ? backup.projects.map((project) => ({ ...project, updatedAt: project.updatedAt ?? timestamp }))
    : [defaultProject(timestamp)];
  assertUniqueIds(projects, "项目");
  const projectIds = new Set(projects.map((project) => project.id));
  if (backup.activeProjectId && !projectIds.has(backup.activeProjectId)) throw new Error(`活动项目不存在：${backup.activeProjectId}。`);
  const activeProjectId = backup.activeProjectId && projectIds.has(backup.activeProjectId) ? backup.activeProjectId : projects[0].id;
  const normalizeProjectId = (projectId?: string) => {
    const value = projectId ?? activeProjectId;
    if (!projectIds.has(value)) throw new Error(`备份数据引用了不存在的项目：${value}。`);
    return value;
  };
  const papers = backup.papers.map((paper) => ({ ...paper, projectId: normalizeProjectId(paper.projectId), updatedAt: paper.updatedAt ?? timestamp }));
  const reports = backup.reports.map((report) => ({
    ...report,
    projectId: normalizeProjectId(report.projectId),
    reviewStatus: report.reviewStatus ?? "needs-review" as const,
    updatedAt: report.updatedAt ?? timestamp,
  }));
  const jobs = backup.jobs.map((job) => ({ ...job, projectId: normalizeProjectId(job.projectId), updatedAt: job.updatedAt ?? timestamp }));
  const taskLogs = backup.taskLogs.map((log) => ({ ...log, projectId: normalizeProjectId(log.projectId) }));
  assertUniqueIds(papers, "论文");
  assertUniqueIds(reports, "报告");
  assertUniqueIds(jobs, "流水线任务");
  assertUniqueIds(taskLogs, "任务日志");
  const restoredSettings = backup.settings ?? defaultSettings(activeProjectId);
  const settings = normalizeSettings({
    ...restoredSettings,
    manualApiKey: "",
    apiCredentialConfigured: false,
    mysql: { ...restoredSettings.mysql, password: "", credentialConfigured: false },
  }, activeProjectId);
  return { projects, activeProjectId, papers, reports, jobs, taskLogs, settings };
}

function assertUniqueIds(rows: Array<{ id: string }>, label: string) {
  const ids = new Set<string>();
  for (const row of rows) {
    if (!row?.id || typeof row.id !== "string") throw new Error(`${label}记录缺少有效 ID。`);
    if (ids.has(row.id)) throw new Error(`${label}记录存在重复 ID：${row.id}。`);
    ids.add(row.id);
  }
}

export async function getDashboardData(): Promise<DashboardData> {
  const db = await getDb();
  const projectId = await ensureProjectState(db);
  const [paperStats, hotspots, reports, jobs] = await Promise.all([getIndexedDbPaperStats(db, projectId), getHotspots(), getReports(), getPipelineJobs()]);

  return {
    paperCount: paperStats.paperCount,
    hotspotCount: hotspots.length,
    reportCount: reports.length,
    fieldCount: paperStats.fieldCount,
    latestReport: reports[0],
    latestJob: jobs.at(-1),
    yearlyCounts: paperStats.yearlyCounts,
    sourceCounts: paperStats.sourceCounts,
  };
}

async function ensureProjectState(db: IDBPDatabase<ResearchDb>) {
  const timestamp = nowIso();
  const projects = await db.getAll(PROJECT_STORE);
  if (projects.length === 0) {
    await db.put(PROJECT_STORE, defaultProject(timestamp));
  }
  const meta = await db.get(META_STORE, "main");
  const activeProjectId = meta?.activeProjectId ?? DEFAULT_PROJECT_ID;
  if (!meta || !(await db.get(PROJECT_STORE, activeProjectId))) {
    await db.put(META_STORE, { ...meta, id: "main", activeProjectId: DEFAULT_PROJECT_ID, updatedAt: timestamp });
    return DEFAULT_PROJECT_ID;
  }
  const activeProject = await db.get(PROJECT_STORE, activeProjectId);
  if (activeProject?.id === DEFAULT_PROJECT_ID && /V(?:[1-9]|1[0-9])/.test(activeProject.description ?? "")) {
    await db.put(PROJECT_STORE, { ...activeProject, description: "V20 自动创建的默认科研项目。", updatedAt: timestamp });
  }
  return activeProjectId;
}

async function migrateRowsToProject(db: IDBPDatabase<ResearchDb>, projectId: string) {
  await Promise.all([
    migrateStoreRowsToProject(db, PAPER_STORE, projectId),
    migrateStoreRowsToProject(db, HOTSPOT_STORE, projectId),
    migrateStoreRowsToProject(db, REPORT_STORE, projectId),
    migrateStoreRowsToProject(db, JOB_STORE, projectId),
    migrateStoreRowsToProject(db, TASK_LOG_STORE, projectId),
  ]);
}

async function activeCount<T extends { projectId?: string }>(db: IDBPDatabase<ResearchDb>, storeName: "papers" | "hotspots" | "reports" | "pipelineJobs" | "taskLogs", projectId: string) {
  let count = 0;
  const tx = db.transaction(storeName, "readonly");
  let cursor = await tx.store.openCursor();
  while (cursor) {
    const row = cursor.value as unknown as T;
    if ((row.projectId ?? DEFAULT_PROJECT_ID) === projectId) count += 1;
    cursor = await cursor.continue();
  }
  await tx.done;
  return count;
}

async function migrateStoreRowsToProject<T extends { projectId?: string }>(db: IDBPDatabase<ResearchDb>, storeName: "papers" | "hotspots" | "reports" | "pipelineJobs" | "taskLogs", projectId: string) {
  const tx = db.transaction(storeName, "readwrite");
  let cursor = await tx.store.openCursor();
  while (cursor) {
    const row = cursor.value as unknown as T;
    if (!row.projectId) {
      await (cursor as unknown as { update: (value: unknown) => Promise<unknown> }).update({ ...row, projectId });
    }
    cursor = await cursor.continue();
  }
  await tx.done;
}

async function getPaperSeedSample(db: IDBPDatabase<ResearchDb>, projectId: string, limit: number) {
  const rows: Paper[] = [];
  const tx = db.transaction(PAPER_STORE, "readonly");
  let cursor = await tx.store.openCursor();
  while (cursor && rows.length < limit) {
    const row = cursor.value as Paper;
    if ((row.projectId ?? DEFAULT_PROJECT_ID) === projectId) rows.push(row);
    cursor = await cursor.continue();
  }
  await tx.done;
  return rows;
}

async function getIndexedDbPaperStats(db: IDBPDatabase<ResearchDb>, projectId: string) {
  let paperCount = 0;
  const fields = new Set<string>();
  const yearly = new Map<number, number>();
  const sources = new Map<SourceKind, number>();
  const tx = db.transaction(PAPER_STORE, "readonly");
  let cursor = await tx.store.openCursor();
  while (cursor) {
    const paper = cursor.value as Paper;
    if ((paper.projectId ?? DEFAULT_PROJECT_ID) === projectId) {
      paperCount += 1;
      if (paper.field) fields.add(paper.field);
      if (paper.year) yearly.set(paper.year, (yearly.get(paper.year) ?? 0) + 1);
      sources.set(paper.source, (sources.get(paper.source) ?? 0) + 1);
    }
    cursor = await cursor.continue();
  }
  await tx.done;
  return {
    paperCount,
    fieldCount: fields.size,
    yearlyCounts: Array.from(yearly.entries()).map(([year, count]) => ({ year, count })).sort((a, b) => a.year - b.year),
    sourceCounts: Array.from(sources.entries()).map(([source, count]) => ({ source, count })),
  };
}

function defaultProject(timestamp = nowIso()): Project {
  return {
    id: DEFAULT_PROJECT_ID,
    name: "默认课题",
    description: "V20 自动创建的默认科研项目。",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function filterProject<T extends { projectId?: string }>(rows: T[], projectId: string) {
  return rows.filter((row) => (row.projectId ?? DEFAULT_PROJECT_ID) === projectId);
}

async function deleteRowsByProject<T extends { id: string; projectId?: string }>(db: IDBPDatabase<ResearchDb>, storeName: "papers" | "hotspots" | "reports" | "pipelineJobs" | "taskLogs", projectId: string) {
  const tx = db.transaction(storeName, "readwrite");
  let cursor = await tx.store.openCursor();
  while (cursor) {
    const row = cursor.value as unknown as T;
    if ((row.projectId ?? DEFAULT_PROJECT_ID) === projectId) {
      await cursor.delete();
    }
    cursor = await cursor.continue();
  }
  await tx.done;
}

async function replacePipelineJobs(jobs: PipelineJob[]) {
  const db = await getDb();
  const projectId = await ensureProjectState(db);
  await deleteRowsByProject(db, JOB_STORE, projectId);
  await Promise.all(jobs.map((job) => db.put(JOB_STORE, job)));
}

function settingsKey(projectId: string) {
  return `settings:${projectId}`;
}

function scopedId(projectId: string, id: string) {
  return id.startsWith(`${projectId}:`) ? id : `${projectId}:${id}`;
}

function countBy<T>(rows: T[], getKey: (row: T) => string) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = getKey(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries());
}

function contentKey(content: string) {
  return content.replace(/\s+/g, " ").trim().slice(0, 6000);
}

function parseMarkdownExport(row: MarkdownExport) {
  const fileName = row.fileName.replace(/\.md$/i, "");
  const heading = row.content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const mode = /revised|修订/i.test(fileName) ? "revised" : /deep|深/i.test(fileName) ? "deep" : "simple";
  const topic =
    heading?.replace(/\s*学术综述\s*$/i, "") ||
    fileName.replace(/^Research_Report_/, "").replace(/_(AI_)?(Simple|Deep|Revised)_/i, "_").replace(/_\d{8}_\d{6}$/i, "").replace(/_/g, " ");
  const timestamp = fileName.match(/(\d{8})_(\d{6})$/);
  const createdAt = timestamp
    ? `${timestamp[1].slice(0, 4)}-${timestamp[1].slice(4, 6)}-${timestamp[1].slice(6, 8)}T${timestamp[2].slice(0, 2)}:${timestamp[2].slice(2, 4)}:${timestamp[2].slice(4, 6)}.000Z`
    : undefined;
  return { topic, mode: mode as ResearchReport["mode"], discipline: "历史导入", createdAt };
}

function defaultSettings(projectId = DEFAULT_PROJECT_ID): AiSettings {
  return {
    id: settingsKey(projectId),
    projectId,
    provider: "deepseek",
    customProviderName: "",
    baseUrl: import.meta.env.VITE_DEEPSEEK_BASE_URL || "https://api.deepseek.com",
    model: import.meta.env.VITE_DEEPSEEK_MODEL || "deepseek-chat",
    useEnvKey: true,
    manualApiKey: "",
    apiCredentialConfigured: false,
    temperature: 0.2,
    streamOutput: true,
    dataDir: "",
    databaseDir: "",
    librarySetupCompleted: false,
    librarySetupMode: "",
    exportDir: "",
    workerTempDir: "",
    backupDir: "",
    cnki: defaultCnkiSettings(),
    mysql: defaultMysqlSettings(),
    updatedAt: nowIso(),
  };
}

function defaultCnkiSettings(): CnkiSettings {
  return {
    chromeDriverPath: "",
    chromeUserDataDir: "",
    chromeProfile: "Default",
    headless: true,
    waitTimeoutSec: 20,
    pageLoadTimeoutSec: 45,
    implicitWaitSec: 2,
    debugDir: "",
  };
}

function normalizeCnkiSettings(settings?: Partial<CnkiSettings>): CnkiSettings {
  const fallback = defaultCnkiSettings();
  return {
    chromeDriverPath: settings?.chromeDriverPath ?? fallback.chromeDriverPath,
    chromeUserDataDir: settings?.chromeUserDataDir ?? fallback.chromeUserDataDir,
    chromeProfile: settings?.chromeProfile ?? fallback.chromeProfile,
    headless: settings?.headless ?? fallback.headless,
    waitTimeoutSec: Math.max(3, Number(settings?.waitTimeoutSec ?? fallback.waitTimeoutSec) || fallback.waitTimeoutSec),
    pageLoadTimeoutSec: Math.max(5, Number(settings?.pageLoadTimeoutSec ?? fallback.pageLoadTimeoutSec) || fallback.pageLoadTimeoutSec),
    implicitWaitSec: Math.max(0, Number(settings?.implicitWaitSec ?? fallback.implicitWaitSec) || fallback.implicitWaitSec),
    debugDir: settings?.debugDir ?? fallback.debugDir,
  };
}

function defaultMysqlSettings(): MysqlImportSettings {
  return {
    host: "127.0.0.1",
    port: 3306,
    user: "root",
    password: "",
    credentialConfigured: false,
    database: "research_hotspots",
    batchSize: 1000,
  };
}

function normalizeMysqlSettings(settings?: Partial<MysqlImportSettings>): MysqlImportSettings {
  const fallback = defaultMysqlSettings();
  return {
    host: settings?.host?.trim() || fallback.host,
    port: Math.max(1, Math.min(65535, Number(settings?.port ?? fallback.port) || fallback.port)),
    user: settings?.user?.trim() || fallback.user,
    password: settings?.password ?? fallback.password,
    credentialConfigured: settings?.credentialConfigured ?? false,
    database: settings?.database?.trim() || fallback.database,
    batchSize: Math.max(100, Math.min(5000, Number(settings?.batchSize ?? fallback.batchSize) || fallback.batchSize)),
  };
}

function normalizeSettings(settings: Partial<AiSettings>, projectId = DEFAULT_PROJECT_ID): AiSettings {
  const fallback = defaultSettings(projectId);
  return {
    ...fallback,
    ...settings,
    id: settingsKey(projectId),
    projectId,
    customProviderName: settings.customProviderName ?? fallback.customProviderName,
    manualApiKey: settings.manualApiKey ?? "",
    apiCredentialConfigured: settings.apiCredentialConfigured ?? false,
    dataDir: settings.dataDir ?? "",
    databaseDir: settings.databaseDir ?? settings.dataDir ?? "",
    librarySetupCompleted: settings.librarySetupCompleted ?? false,
    librarySetupMode: settings.librarySetupMode ?? "",
    exportDir: settings.exportDir ?? settings.dataDir ?? "",
    workerTempDir: settings.workerTempDir ?? "",
    backupDir: settings.backupDir ?? settings.dataDir ?? "",
    cnki: normalizeCnkiSettings(settings.cnki),
    mysql: normalizeMysqlSettings(settings.mysql),
    updatedAt: settings.updatedAt ?? fallback.updatedAt,
  };
}

function seedPapers(projectId: string): Paper[] {
  const timestamp = nowIso();
  const rows = [
    ["arxiv:ai-001", "arxiv", "Retrieval augmented scientific agents for literature synthesis", "This paper studies retrieval augmented agents that ground long-form scientific synthesis in verifiable paper evidence.", "Artificial Intelligence", 2026, "https://arxiv.org/abs/ai-001"],
    ["openalex:ai-002", "openalex", "Evaluation protocols for large language model hallucination control", "The work compares hallucination mitigation methods including citation constraints, retrieval, uncertainty estimation and tool verification.", "Artificial Intelligence", 2025, "https://openalex.org/ai-002"],
    ["openalex:bio-001", "openalex", "Protein design with multimodal generative models", "The study surveys structure-conditioned protein design, diffusion priors and wet-lab feedback loops.", "Computational Biology", 2025, "https://openalex.org/bio-001"],
    ["arxiv:math-001", "arxiv", "Derived moduli spaces and stability conditions in algebraic geometry", "The paper discusses derived categories, moduli construction and stability wall crossing.", "Algebraic Geometry", 2024, "https://arxiv.org/abs/math-001"],
    ["openalex:med-001", "openalex", "Foundation models for medical imaging diagnosis", "A review of multimodal imaging models, cross-hospital validation, interpretability and clinical deployment risk.", "Medical Imaging", 2026, "https://openalex.org/med-001"],
    ["arxiv:quantum-001", "arxiv", "Fault tolerant quantum error correction under realistic noise", "The paper investigates scalable quantum error correction with hardware-aware noise models.", "Quantum Physics", 2025, "https://arxiv.org/abs/quantum-001"],
  ] as const;

  return rows.map(([id, source, title, abstract, field, year, url]) => ({
    id: scopedId(projectId, id),
    projectId,
    source: source as SourceKind,
    title,
    abstract,
    field,
    year,
    url,
    createdAt: timestamp,
    updatedAt: timestamp,
  }));
}

function seedHotspotsFromPapers(projectId: string, papers: Paper[]): Hotspot[] {
  const timestamp = nowIso();
  const groups = Array.from(
    papers.reduce((map, paper) => {
      const rows = map.get(paper.field) ?? [];
      rows.push(paper);
      map.set(paper.field, rows);
      return map;
    }, new Map<string, Paper[]>()),
  );

  return groups.map(([field, rows], index) => {
    const keywordWeights = topSeedKeywords(rows);
    const keywords = keywordWeights.map((item) => item.keyword);
    const years = Array.from(new Set(rows.map((paper) => paper.year).filter(Boolean) as number[])).sort((a, b) => a - b);
    return {
      id: scopedId(projectId, `local-seed-cluster:${field}:${index + 1}`),
      projectId,
      field,
      topicId: index + 1,
      title: keywords.slice(0, 3).map(capitalize).join(" ") || field,
      label: keywords.slice(0, 5).join("_"),
      summary: `基于 ${rows.length} 篇本地样例文献生成的初始热点。核心词：${keywords.slice(0, 6).join("、")}。`,
      keywords,
      keywordWeights,
      paperCount: rows.length,
      confidence: Math.min(0.9, 0.45 + rows.length * 0.08),
      source: "seed",
      trend: years.length >= 2 && years.at(-1)! > years[0] ? "Surging" : "Stable",
      coordinates: { x: Math.round(Math.cos(index * 1.7) * (28 + rows.length * 6)), y: Math.round(Math.sin(index * 1.3) * (26 + rows.length * 5)), z: index * 8 - 12 },
      evolution: years.map((year) => {
        const yearRows = rows.filter((paper) => paper.year === year);
        return { year, count: yearRows.length, keywords: keywords.slice(0, 5), representativeIds: yearRows.map((paper) => paper.id) };
      }),
      updatedAt: timestamp,
    };
  });
}

function topSeedKeywords(papers: Paper[]) {
  const stopwords = new Set(["the", "and", "for", "with", "from", "this", "that", "using", "based", "paper", "study", "research", "model", "models", "method", "data", "analysis"]);
  const counts = new Map<string, number>();
  for (const paper of papers) {
    for (const token of `${paper.title} ${paper.abstract}`.toLowerCase().match(/[a-z][a-z-]{2,}/g) ?? []) {
      if (stopwords.has(token)) continue;
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  }
  const max = Math.max(1, ...counts.values());
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([keyword, count]) => ({ keyword, weight: Math.round((count / max) * 100) / 100 }));
}

function seedJobs(projectId: string): PipelineJob[] {
  const timestamp = nowIso();
  return [
    { id: scopedId(projectId, "job-crawl"), projectId, stage: "crawl", title: "多源文献采集", status: "done", detail: "支持实时检索和本地 CSV/JSON 导入。", progress: 100, createdAt: timestamp, updatedAt: timestamp },
    { id: scopedId(projectId, "job-clean"), projectId, stage: "clean", title: "清洗去重", status: "queued", detail: "在 SQLite 论文库中规范化标题/摘要，并按 DOI、链接或标题去重。", progress: 20, createdAt: timestamp, updatedAt: timestamp },
    { id: scopedId(projectId, "job-cluster"), projectId, stage: "cluster", title: "热点建模", status: "queued", detail: "从 SQLite 论文库聚合关键词权重、代表文献、年度演化和 3D 星图坐标。", progress: 20, createdAt: timestamp, updatedAt: timestamp },
    { id: scopedId(projectId, "job-name"), projectId, stage: "name", title: "热点命名", status: "planned", detail: "支持手动编辑热点标题、摘要、关键词和学科标签。", progress: 0, createdAt: timestamp, updatedAt: timestamp },
    { id: scopedId(projectId, "job-review"), projectId, stage: "review", title: "AI 综述生成", status: "queued", detail: "按热点证据包生成简版或深版综述。", progress: 30, createdAt: timestamp, updatedAt: timestamp },
    { id: scopedId(projectId, "job-export"), projectId, stage: "export", title: "结果导出", status: "queued", detail: "支持 Markdown/HTML 导出、历史报告导入和 IndexedDB JSON 备份恢复。", progress: 40, createdAt: timestamp, updatedAt: timestamp },
  ];
}

function capitalize(value: string) {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}
