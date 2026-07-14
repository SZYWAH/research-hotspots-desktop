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

  const [paperSample, hotspots, jobs, settings, logs] = await Promise.all([
    getPaperSeedSample(db, projectId, 200),
    getHotspots(),
    getPipelineJobs(),
    getAiSettings(),
    getTaskLogs(),
  ]);

  if (hotspots.length === 0 || hotspots.every((hotspot) => ["Artificial Intelligence:1", "Computational Biology:2", "Algebraic Geometry:3"].includes(hotspot.id))) {
    await replaceHotspots(seedHotspotsFromPapers(projectId, paperSample));
  }

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
  await db.put(META_STORE, { id: "main", activeProjectId: projectId, updatedAt: nowIso() });
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
  await db.put(META_STORE, { id: "main", activeProjectId: project.id, updatedAt: timestamp });
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
  await db.put(META_STORE, { id: "main", activeProjectId: DEFAULT_PROJECT_ID, updatedAt: nowIso() });
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
  return filterProject(await db.getAll(HOTSPOT_STORE), projectId).sort((a, b) => b.paperCount - a.paperCount);
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
  await deleteRowsByProject(db, HOTSPOT_STORE, projectId);
  const timestamp = nowIso();
  await Promise.all(hotspots.map((hotspot) => db.put(HOTSPOT_STORE, { ...hotspot, id: scopedId(projectId, hotspot.id), projectId, updatedAt: timestamp })));
}

export async function getReports() {
  const db = await getDb();
  const projectId = await ensureProjectState(db);
  return filterProject(await db.getAll(REPORT_STORE), projectId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function saveReport(report: Omit<ResearchReport, "id" | "createdAt" | "updatedAt">) {
  const db = await getDb();
  const projectId = await ensureProjectState(db);
  const timestamp = nowIso();
  const saved: ResearchReport = {
    ...report,
    id: scopedId(projectId, crypto.randomUUID()),
    projectId,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await db.put(REPORT_STORE, saved);
  return saved;
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
  const projectId = await ensureProjectState(db);
  const jobs = filterProject(await db.getAll(JOB_STORE), projectId);
  const existing = jobs.find((job) => job.stage === stage);
  const timestamp = nowIso();
  const saved: PipelineJob = {
    id: existing?.id ?? scopedId(projectId, `job-${stage}`),
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
  await db.put(SETTINGS_STORE, settings);
  return settings;
}

export async function saveAiSettings(settings: AiSettings) {
  const db = await getDb();
  const projectId = await ensureProjectState(db);
  const saved = normalizeSettings({ ...settings, updatedAt: nowIso() }, projectId);
  await db.put(SETTINGS_STORE, saved);
  return saved;
}

export async function exportBackupData(): Promise<DataBackup> {
  const db = await getDb();
  const activeProjectId = await ensureProjectState(db);
  const [projects, papers, hotspots, reports, jobs, taskLogs, settings] = await Promise.all([
    db.getAll(PROJECT_STORE),
    db.getAll(PAPER_STORE),
    db.getAll(HOTSPOT_STORE),
    db.getAll(REPORT_STORE),
    db.getAll(JOB_STORE),
    db.getAll(TASK_LOG_STORE),
    getAiSettings(),
  ]);
  return {
    version: __APP_VERSION__,
    exportedAt: nowIso(),
    projects,
    activeProjectId,
    papers,
    hotspots,
    reports,
    jobs,
    settings,
    taskLogs,
  };
}

export async function restoreBackupData(backup: DataBackup) {
  const db = await getDb();
  const timestamp = nowIso();
  await Promise.all([
    db.clear(PROJECT_STORE),
    db.clear(PAPER_STORE),
    db.clear(HOTSPOT_STORE),
    db.clear(REPORT_STORE),
    db.clear(JOB_STORE),
    db.clear(TASK_LOG_STORE),
  ]);

  const projects = backup.projects?.length ? backup.projects : [defaultProject()];
  await Promise.all(projects.map((project) => db.put(PROJECT_STORE, { ...project, updatedAt: project.updatedAt ?? timestamp })));
  await Promise.all((backup.papers ?? []).map((paper) => db.put(PAPER_STORE, { ...paper, projectId: paper.projectId ?? backup.activeProjectId ?? DEFAULT_PROJECT_ID, updatedAt: paper.updatedAt ?? timestamp })));
  await Promise.all((backup.hotspots ?? []).map((hotspot) => db.put(HOTSPOT_STORE, { ...hotspot, projectId: hotspot.projectId ?? backup.activeProjectId ?? DEFAULT_PROJECT_ID, updatedAt: hotspot.updatedAt ?? timestamp })));
  await Promise.all((backup.reports ?? []).map((report) => db.put(REPORT_STORE, { ...report, projectId: report.projectId ?? backup.activeProjectId ?? DEFAULT_PROJECT_ID, updatedAt: report.updatedAt ?? timestamp })));
  await Promise.all((backup.jobs ?? []).map((job) => db.put(JOB_STORE, { ...job, projectId: job.projectId ?? backup.activeProjectId ?? DEFAULT_PROJECT_ID, updatedAt: job.updatedAt ?? timestamp })));
  await Promise.all((backup.taskLogs ?? []).map((log) => db.put(TASK_LOG_STORE, { ...log, projectId: log.projectId ?? backup.activeProjectId ?? DEFAULT_PROJECT_ID })));
  const activeProjectId = backup.activeProjectId ?? projects[0].id;
  await db.put(META_STORE, { id: "main", activeProjectId, updatedAt: timestamp });
  await db.put(SETTINGS_STORE, normalizeSettings(backup.settings ?? defaultSettings(activeProjectId), activeProjectId));

  return {
    paperCount: backup.papers?.length ?? 0,
    hotspotCount: backup.hotspots?.length ?? 0,
    reportCount: backup.reports?.length ?? 0,
    taskLogCount: backup.taskLogs?.length ?? 0,
  };
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
    await db.put(META_STORE, { id: "main", activeProjectId: DEFAULT_PROJECT_ID, updatedAt: timestamp });
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
    temperature: 0.2,
    streamOutput: true,
    dataDir: "",
    databaseDir: "",
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
    dataDir: settings.dataDir ?? "",
    databaseDir: settings.databaseDir ?? settings.dataDir ?? "",
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
