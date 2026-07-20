import { invoke, isTauri } from "@tauri-apps/api/core";
import type {
  App17GalaxyPayload,
  App17GalaxySyncResult,
  CleanerWorkerResult,
  ClusterWorkerResult,
  CnkiSettings,
  Hotspot,
  HotspotEvidenceBundle,
  MarkdownExport,
  Paper,
  PaperLibraryFacets,
  PaperLibraryMutationResult,
  PaperLibraryStatus,
  PaperQueryInput,
  PaperQueryResult,
  SearchResultPaper,
  V20HotspotSnapshot,
} from "../types";

export type DesktopHealthResult = {
  pythonPath: string;
  taskWorkerFound: boolean;
  workerOk: boolean;
  databaseDir?: string;
  databasePath?: string;
  databaseDirWritable: boolean;
  tempDirWritable: boolean;
  exportDirWritable?: boolean;
  backupDirWritable?: boolean;
  errors: string[];
};

export type PaperFileImportStart = {
  taskId: string;
  fileName: string;
};

export type PaperFileImportProgress = {
  taskId: string;
  fileName: string;
  status: "running" | "paused" | "cancelled" | "done" | "failed";
  totalRows?: number;
  processedRows: number;
  inserted: number;
  updated: number;
  invalidRows: number;
  duplicateRows: number;
  message: string;
  elapsedMs: number;
};

export type MysqlPaperImportInput = {
  databaseDir?: string;
  projectId?: string;
  workerTempDir?: string;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  batchSize?: number;
};

export type App17GalaxySyncInput = {
  databaseDir?: string;
  projectId?: string;
  workerTempDir?: string;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  mode?: string;
};

export type App17HotspotEvidenceInput = {
  databaseDir?: string;
  projectId?: string;
  field: string;
  topicId: number;
  maxPapers?: number;
};

export type LibraryPressureTestResult = {
  rows: number;
  databaseDir: string;
  databasePath: string;
  sizeBytes: number;
  insertMs: number;
  queryMs: number;
  clusterMs: number;
  totalMs: number;
  queryCount: number;
  clusterCount: number;
  sampleHotspots: string[];
  cleanupDone: boolean;
  summary: string;
};

export type PaperLibraryBackupResult = {
  databasePath: string;
  backupPath: string;
  sizeBytes: number;
  paperCount: number;
  summary: string;
};

export type PaperLibraryRestoreResult = {
  databasePath: string;
  restoredFrom: string;
  previousBackupPath?: string;
  sizeBytes: number;
  paperCount: number;
  restoredSnapshotId?: string;
  validationStatus: string;
  rollbackPerformed: boolean;
  summary: string;
};

export type PaperLibraryBackupInspection = {
  backupPath: string;
  schemaVersion: number;
  paperCount: number;
  projectCount: number;
  snapshotId?: string;
  hotspotCount: number;
  membershipCount: number;
  validationStatus: string;
};

export type LibrarySetupMode = "seed" | "empty" | "existing";

export type LibrarySetupState = {
  configured: boolean;
  databaseDir?: string;
  databasePath?: string;
  databaseExists: boolean;
  databaseValid: boolean;
  paperCount: number;
  hotspotCount: number;
  membershipCount: number;
  snapshotId?: string;
  databaseSchemaVersion?: number;
  requiresModeling: boolean;
  seedAvailable: boolean;
  seedSizeBytes?: number;
  seedPaperCount?: number;
  seedHotspotCount?: number;
  seedMembershipCount?: number;
  seedSnapshotId?: string;
  seedDatabaseSchemaVersion?: number;
  seedVersion?: string;
  message: string;
};

export type LibraryLocationValidation = {
  valid: boolean;
  databaseDir: string;
  databasePath: string;
  writable: boolean;
  availableSpaceBytes: number;
  requiredSpaceBytes: number;
  existingDatabase: boolean;
  existingDatabaseValid: boolean;
  paperCount: number;
  hotspotCount: number;
  membershipCount: number;
  snapshotId?: string;
  databaseSchemaVersion?: number;
  requiresModeling: boolean;
  message: string;
};

export type InitializeLibraryResult = {
  mode: LibrarySetupMode;
  databaseDir: string;
  databasePath: string;
  sizeBytes: number;
  paperCount: number;
  hotspotCount: number;
  membershipCount: number;
  snapshotId?: string;
  databaseSchemaVersion: number;
  requiresModeling: boolean;
  sha256: string;
  integrityCheck: string;
  summary: string;
};

export type CnkiSearchInput = {
  query: string;
  maxResults: number;
  startYear?: number;
  endYear?: number;
  settings: CnkiSettings;
};

export type CnkiSearchOutput = {
  ok: boolean;
  message: string;
  papers: SearchResultPaper[];
  debugArtifacts: string[];
  elapsedMs: number;
};

export function isDesktopRuntime() {
  return isTauri();
}

export function isGalaxyVisualReviewMode() {
  if (!import.meta.env.DEV || isDesktopRuntime() || typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("visual-review") === "galaxy";
}

const loadGalaxyVisualReviewProvider: () => Promise<typeof import("./galaxyVisualReview") | undefined> = import.meta.env.DEV
  ? async () => isGalaxyVisualReviewMode() ? import("./galaxyVisualReview") : undefined
  : async () => undefined;

export async function openExternalUrl(url: string) {
  const value = url.trim();
  if (!value) return;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("外部链接格式无效。");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("仅允许打开 http 或 https 外部链接。");
  }

  if (isDesktopRuntime()) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(parsed.toString());
    return;
  }

  window.open(parsed.toString(), "_blank", "noopener,noreferrer");
}

export async function chooseExportDirectory(title = "选择目录") {
  if (!isDesktopRuntime()) return undefined;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({
    directory: true,
    multiple: false,
    title,
  });
  return Array.isArray(selected) ? selected[0] : selected ?? undefined;
}

export async function choosePaperImportFile(title = "选择 CSV / JSON / JSONL / BibTeX / RIS 论文文件") {
  if (!isDesktopRuntime()) return undefined;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({
    directory: false,
    multiple: false,
    title,
    filters: [{ name: "论文数据", extensions: ["csv", "json", "jsonl", "ndjson", "bib", "ris"] }],
  });
  return Array.isArray(selected) ? selected[0] : selected ?? undefined;
}

export async function chooseSqliteBackupFile(title = "选择 SQLite 论文库备份") {
  if (!isDesktopRuntime()) return undefined;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({
    directory: false,
    multiple: false,
    title,
    filters: [{ name: "SQLite 数据库", extensions: ["sqlite", "db", "sqlite3"] }],
  });
  return Array.isArray(selected) ? selected[0] : selected ?? undefined;
}

export async function confirmDesktopAction(message: string, title = "确认操作") {
  if (!isDesktopRuntime()) return window.confirm(message);
  // Native file pickers resolve on the activation key-down event. Let that input
  // finish before opening the next native dialog so Enter/Space cannot confirm it.
  await new Promise((resolve) => window.setTimeout(resolve, 120));
  const { confirm } = await import("@tauri-apps/plugin-dialog");
  return confirm(message, { title, kind: "warning" });
}

export async function chooseChromeDriverFile(title = "选择 ChromeDriver 可执行文件") {
  if (!isDesktopRuntime()) return undefined;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({
    directory: false,
    multiple: false,
    title,
    filters: [{ name: "ChromeDriver", extensions: ["exe"] }],
  });
  return Array.isArray(selected) ? selected[0] : selected ?? undefined;
}

export async function writeTextFile(path: string, content: string) {
  if (!isDesktopRuntime()) {
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = path.split(/[\\/]/).pop() || "research-export.md";
    anchor.click();
    URL.revokeObjectURL(url);
    return;
  }
  await invoke("write_text_file", { path, content });
}

export async function readMarkdownExports() {
  if (!isDesktopRuntime()) return [] as MarkdownExport[];
  return invoke<MarkdownExport[]>("read_markdown_exports");
}

export async function getPaperLibraryStatus(databaseDir?: string, projectId?: string) {
  if (!isDesktopRuntime()) {
    return {
      databaseDir: "browser-preview",
      databasePath: "IndexedDB preview",
      sizeBytes: 0,
      paperCount: 0,
    } satisfies PaperLibraryStatus;
  }
  return invoke<PaperLibraryStatus>("paper_library_status", { databaseDir, projectId });
}

export async function getLibrarySetupState(databaseDir?: string) {
  if (!isDesktopRuntime()) {
    return {
      configured: true,
      databaseDir: databaseDir || "browser-preview",
      databasePath: "IndexedDB preview",
      databaseExists: true,
      databaseValid: true,
      paperCount: 0,
      hotspotCount: 0,
      membershipCount: 0,
      requiresModeling: true,
      seedAvailable: false,
      message: "Browser preview",
    } satisfies LibrarySetupState;
  }
  return invoke<LibrarySetupState>("get_library_setup_state", { databaseDir });
}

export async function validateLibraryLocation(databaseDir: string, mode: LibrarySetupMode) {
  if (!isDesktopRuntime()) {
    return {
      valid: true,
      databaseDir,
      databasePath: `${databaseDir}/research-hotspots-v7.sqlite`,
      writable: true,
      availableSpaceBytes: 0,
      requiredSpaceBytes: 0,
      existingDatabase: mode === "existing",
      existingDatabaseValid: mode === "existing",
      paperCount: 0,
      hotspotCount: 0,
      membershipCount: 0,
      requiresModeling: mode !== "existing",
      message: "Browser preview",
    } satisfies LibraryLocationValidation;
  }
  return invoke<LibraryLocationValidation>("validate_library_location", { input: { databaseDir, mode } });
}

export async function initializeLibrary(databaseDir: string, mode: LibrarySetupMode) {
  return invoke<InitializeLibraryResult>("initialize_library", { input: { databaseDir, mode } });
}

export async function queryPaperLibrary(input: PaperQueryInput) {
  if (!isDesktopRuntime()) {
    return { rows: [], total: 0, limit: input.limit ?? 20, offset: input.offset ?? 0, queryMs: 0 } satisfies PaperQueryResult;
  }
  return invoke<PaperQueryResult>("query_paper_library", { input });
}

export async function getPaperLibraryFacets(databaseDir?: string, projectId?: string) {
  if (!isDesktopRuntime()) {
    return { sources: [], fields: [], years: [] } satisfies PaperLibraryFacets;
  }
  return invoke<PaperLibraryFacets>("paper_library_facets", { databaseDir, projectId });
}

export async function upsertPaperLibrary(databaseDir: string | undefined, projectId: string | undefined, papers: Array<Omit<Paper, "createdAt" | "updatedAt"> | Paper>) {
  const timestamp = new Date().toISOString();
  const rows = papers.map((paper) => ({
    ...paper,
    createdAt: "createdAt" in paper ? paper.createdAt : timestamp,
    updatedAt: "updatedAt" in paper ? paper.updatedAt : timestamp,
  }));
  if (!isDesktopRuntime()) {
    return { inserted: rows.length, updated: 0, total: rows.length } satisfies PaperLibraryMutationResult;
  }
  return invoke<PaperLibraryMutationResult>("upsert_paper_library", { databaseDir, projectId, papers: rows });
}

export async function getPapersByIds(databaseDir: string | undefined, projectId: string | undefined, ids: string[]) {
  if (ids.length === 0) return [] as Paper[];
  if (!isDesktopRuntime()) {
    const visualReview = await loadGalaxyVisualReviewProvider();
    return visualReview ? visualReview.getGalaxyVisualReviewPapersByIds(ids) : [] as Paper[];
  }
  return invoke<Paper[]>("get_papers_by_ids", { databaseDir, projectId, ids });
}

export async function deletePapersFromLibrary(databaseDir: string | undefined, projectId: string | undefined, ids: string[]) {
  if (!isDesktopRuntime() || ids.length === 0) return 0;
  return invoke<number>("delete_papers_from_library", { databaseDir, projectId, ids });
}

export async function runLibraryClusterWorker(databaseDir: string | undefined, projectId: string | undefined) {
  if (!isDesktopRuntime()) {
    return runBrowserCluster([]);
  }
  return invoke<ClusterWorkerResult>("cluster_paper_library", { databaseDir, projectId });
}

export async function exportHotspotEvidence(input: { databaseDir?: string; projectId?: string; hotspotId?: string; maxPapers?: number }) {
  if (!isDesktopRuntime()) return undefined;
  return invoke<HotspotEvidenceBundle>("export_hotspot_evidence", {
    databaseDir: input.databaseDir,
    projectId: input.projectId,
    hotspotId: input.hotspotId,
    maxPapers: input.maxPapers,
  });
}

export async function getApp17HotspotEvidence(input: App17HotspotEvidenceInput) {
  if (!isDesktopRuntime()) {
    const visualReview = await loadGalaxyVisualReviewProvider();
    return visualReview ? visualReview.getGalaxyVisualReviewEvidence(input) : undefined;
  }
  return invoke<HotspotEvidenceBundle>("get_app17_hotspot_evidence", { input });
}

export async function runLibraryCleanerWorker(databaseDir: string | undefined, projectId: string | undefined) {
  if (!isDesktopRuntime()) {
    return runBrowserCleaner([]);
  }
  return invoke<CleanerWorkerResult>("clean_paper_library", { databaseDir, projectId });
}

export async function startPaperFileImport(input: { databaseDir?: string; projectId?: string; filePath: string }) {
  if (!isDesktopRuntime()) {
    throw new Error("大文件直导只在桌面端可用。");
  }
  return invoke<PaperFileImportStart>("start_paper_file_import", { input });
}

export async function startMysqlPaperImport(input: MysqlPaperImportInput) {
  if (!isDesktopRuntime()) {
    throw new Error("MySQL import is only available in the desktop app.");
  }
  return invoke<PaperFileImportStart>("start_mysql_paper_import", { input });
}

export async function syncApp17GalaxyFromMysql(input: App17GalaxySyncInput) {
  if (!isDesktopRuntime()) {
    throw new Error("App17 galaxy sync is only available in the desktop app.");
  }
  return invoke<App17GalaxySyncResult>("sync_app17_galaxy_from_mysql", { input });
}

export async function loadApp17Galaxy(input: App17GalaxySyncInput) {
  if (!isDesktopRuntime()) {
    const visualReview = await loadGalaxyVisualReviewProvider();
    if (visualReview) return (await visualReview.getGalaxyVisualReviewSnapshot(true)).payload;
    return {
      ready: false,
      message: "App17 galaxy is only available in the desktop app.",
      source: "none",
      mode: input.mode ?? "nebula",
      generatedAt: new Date().toISOString(),
      paperCount: 0,
      hotspotCount: 0,
      topicCount: 0,
      fields: [],
      papers: [],
      hotspots: [],
    } satisfies App17GalaxyPayload;
  }
  return invoke<App17GalaxyPayload>("load_app17_galaxy", { input });
}

export async function getApp17GalaxyPayload(input: { databaseDir?: string; projectId?: string; mode?: string }) {
  if (!isDesktopRuntime()) {
    const visualReview = await loadGalaxyVisualReviewProvider();
    if (visualReview) return (await visualReview.getGalaxyVisualReviewSnapshot()).payload;
    return {
      ready: false,
      message: "App17 galaxy payload is only available in the desktop app.",
      source: "none",
      mode: input.mode ?? "nebula",
      generatedAt: new Date().toISOString(),
      paperCount: 0,
      hotspotCount: 0,
      topicCount: 0,
      fields: [],
      papers: [],
      hotspots: [],
    } satisfies App17GalaxyPayload;
  }
  return invoke<App17GalaxyPayload>("get_app17_galaxy_payload", { input });
}

export async function getV20AnalysisState(input: { databaseDir?: string; projectId?: string }) {
  if (!isDesktopRuntime()) return undefined;
  return invoke<import("../types").V20AnalysisState | null>("get_v20_analysis_state", { input });
}

export async function getV20HotspotSnapshot(input: { databaseDir?: string; projectId?: string }) {
  if (!isDesktopRuntime()) return undefined;
  return invoke<V20HotspotSnapshot>("get_v20_hotspot_snapshot", { input });
}

export async function getV20GalaxyPayload(input: { databaseDir?: string; projectId?: string; mode?: string }) {
  if (!isDesktopRuntime()) return getApp17GalaxyPayload(input);
  return invoke<App17GalaxyPayload>("get_v20_galaxy_payload", { input });
}

export async function setAppCredential(projectId: string, service: string, secret: string) {
  if (!isDesktopRuntime()) return { configured: Boolean(secret.trim()) };
  return invoke<{ configured: boolean }>("set_app_credential", { projectId, service, secret });
}

export async function getAppCredentialStatus(projectId: string, service: string) {
  if (!isDesktopRuntime()) return { configured: false };
  return invoke<{ configured: boolean }>("get_app_credential_status", { projectId, service });
}

export async function deleteAppCredential(projectId: string, service: string) {
  if (!isDesktopRuntime()) return { configured: false };
  return invoke<{ configured: boolean }>("delete_app_credential", { projectId, service });
}

export async function runAiChat(input: {
  taskKey: string;
  projectId: string;
  provider: string;
  baseUrl: string;
  model: string;
  temperature: number;
  useEnvKey: boolean;
  mode: "test" | "simple" | "deep" | "revised" | "keyword";
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
}) {
  if (!isDesktopRuntime()) throw new Error("AI 请求仅在桌面应用中可用。");
  return invoke<{ content: string; retryCount: number; elapsedMs: number }>("ai_chat", { input });
}

export async function cancelAiTask(taskKey: string) {
  if (!isDesktopRuntime()) return false;
  return invoke<boolean>("cancel_ai_task", { taskKey });
}

export async function getDemoPaperSamplePath() {
  if (!isDesktopRuntime()) {
    throw new Error("演示数据一键导入仅桌面端可用。");
  }
  return invoke<string>("demo_paper_sample_path");
}

export async function controlPaperFileImport(taskId: string, action: "pause" | "resume" | "cancel") {
  if (!isDesktopRuntime()) return;
  await invoke("control_paper_file_import", { taskId, action });
}

export async function runCleanerWorker(papers: Paper[], tempDir?: string) {
  if (!isDesktopRuntime()) {
    return runBrowserCleaner(papers);
  }
  return invoke<CleanerWorkerResult>("run_cleaner_worker", { papers, tempDir });
}

export async function runClusterWorker(papers: Paper[], tempDir?: string) {
  if (!isDesktopRuntime()) {
    return runBrowserCluster(papers);
  }
  return invoke<ClusterWorkerResult>("run_cluster_worker", { papers, tempDir });
}

export async function runDesktopHealthCheck(input: { databaseDir?: string; workerTempDir?: string; exportDir?: string; backupDir?: string }) {
  if (!isDesktopRuntime()) {
    return {
      pythonPath: "浏览器预览模式",
      taskWorkerFound: true,
      workerOk: true,
      databaseDir: "browser-preview",
      databasePath: "IndexedDB preview",
      databaseDirWritable: true,
      tempDirWritable: true,
      exportDirWritable: true,
      backupDirWritable: true,
      errors: [],
    } satisfies DesktopHealthResult;
  }
  return invoke<DesktopHealthResult>("run_health_check", input);
}

export async function runLibraryPressureTest(input: { databaseDir?: string; rows?: number }) {
  if (!isDesktopRuntime()) {
    throw new Error("10 万级压力测试只在桌面端可用。");
  }
  return invoke<LibraryPressureTestResult>("run_library_pressure_test", input);
}

export async function backupPaperLibrary(input: { databaseDir?: string; backupDir?: string; projectId?: string }) {
  if (!isDesktopRuntime()) {
    throw new Error("SQLite 论文库备份只在桌面端可用。");
  }
  return invoke<PaperLibraryBackupResult>("backup_paper_library", input);
}

export async function inspectPaperLibraryBackup(input: { backupPath: string; projectId?: string }) {
  if (!isDesktopRuntime()) {
    throw new Error("SQLite 论文库备份检查只在桌面端可用。");
  }
  return invoke<PaperLibraryBackupInspection>("inspect_paper_library_backup", input);
}

export async function restorePaperLibrary(input: { databaseDir?: string; backupPath: string; projectId?: string }) {
  if (!isDesktopRuntime()) {
    throw new Error("SQLite 论文库恢复只在桌面端可用。");
  }
  return invoke<PaperLibraryRestoreResult>("restore_paper_library", input);
}

export async function searchCnkiPapers(input: CnkiSearchInput) {
  if (!isDesktopRuntime()) {
    return {
      ok: false,
      message: "CNKI 在线检索仅桌面端可用。",
      papers: [],
      debugArtifacts: [],
      elapsedMs: 0,
    } satisfies CnkiSearchOutput;
  }
  return invoke<CnkiSearchOutput>("search_cnki_papers", { input });
}

function runBrowserCleaner(papers: Paper[]): CleanerWorkerResult {
  const seen = new Set<string>();
  const cleanedPapers: Paper[] = [];
  const duplicateIds: string[] = [];
  for (const paper of papers) {
    const title = paper.title.replace(/\s+/g, " ").trim();
    const abstract = paper.abstract.replace(/\s+/g, " ").trim();
    const key = (paper.doi || paper.url || title).toLowerCase();
    if (!title || !abstract || seen.has(key)) {
      duplicateIds.push(paper.id);
      continue;
    }
    seen.add(key);
    cleanedPapers.push({ ...paper, title, abstract });
  }
  return {
    beforeCount: papers.length,
    afterCount: cleanedPapers.length,
    removedCount: papers.length - cleanedPapers.length,
    duplicateIds,
    cleanedPapers,
    summary: `清洗 ${papers.length} 条，保留 ${cleanedPapers.length} 条，移除 ${papers.length - cleanedPapers.length} 条。`,
  };
}

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "this",
  "that",
  "using",
  "based",
  "paper",
  "study",
  "research",
  "model",
  "models",
  "method",
  "methods",
  "data",
  "analysis",
]);

function runBrowserCluster(papers: Paper[]): ClusterWorkerResult {
  const groups = new Map<string, Paper[]>();
  for (const paper of papers) {
    const keyword = topKeyword(`${paper.title} ${paper.abstract}`) || normalizeGroupKey(paper.field);
    const key = `${paper.field}::${keyword}`;
    groups.set(key, [...(groups.get(key) ?? []), paper]);
  }

  const timestamp = new Date().toISOString();
  const hotspots: Hotspot[] = Array.from(groups.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 12)
    .map(([key, rows], index) => {
      const [field, keyword] = key.split("::");
      const keywords = topKeywords(rows.map((paper) => `${paper.title} ${paper.abstract}`).join(" "), 10);
      const years = Array.from(new Set(rows.map((paper) => paper.year).filter(Boolean) as number[])).sort((a, b) => a - b);
      return {
        id: `local-cluster:${field}:${keyword}:${index + 1}`,
        field,
        topicId: index + 1,
        title: `${keyword} 研究热点`,
        label: keyword,
        summary: `基于 ${rows.length} 篇本地文献生成的关键词聚类。`,
        keywords: keywords.length > 0 ? keywords : [keyword],
        keywordWeights: keywords.map((item, weightIndex) => ({ keyword: item, weight: Math.round((1 - weightIndex / Math.max(1, keywords.length)) * 100) / 100 })),
        paperCount: rows.length,
        confidence: Math.min(0.95, 0.45 + rows.length * 0.08),
        source: "worker",
        trend: years.length >= 2 && (years.at(-1) ?? 0) >= new Date().getFullYear() - 1 ? "Surging" : "Stable",
        coordinates: {
          x: Math.cos(index * 1.7) * (24 + rows.length * 4),
          y: Math.sin(index * 1.3) * (20 + rows.length * 3),
          z: (index % 5) * 8 - 16,
        },
        evolution: years.map((year) => {
          const yearRows = rows.filter((paper) => paper.year === year);
          return {
            year,
            count: yearRows.length,
            keywords: keywords.slice(0, 5),
            representativeIds: yearRows.slice(0, 5).map((paper) => paper.id),
          };
        }),
        updatedAt: timestamp,
      };
    });

  return {
    beforeCount: papers.length,
    clusterCount: hotspots.length,
    hotspots,
    summary: `已从 ${papers.length} 篇文献生成 ${hotspots.length} 个本地关键词热点。`,
  };
}

function topKeyword(text: string) {
  return topKeywords(text, 1)[0] ?? "";
}

function topKeywords(text: string, limit: number) {
  const counts = new Map<string, number>();
  for (const token of text.toLowerCase().match(/[a-z][a-z-]{2,}/g) ?? []) {
    const normalized = token.replace(/^-+|-+$/g, "");
    if (normalized.length < 3 || STOPWORDS.has(normalized)) continue;
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([token]) => token);
}

function normalizeGroupKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "local";
}
