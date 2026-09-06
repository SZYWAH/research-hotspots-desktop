import { invoke as tauriInvoke, isTauri } from "@tauri-apps/api/core";
import type {
  App17GalaxyPayload,
  App17GalaxySyncResult,
  AgentImmersiveBackgroundPayloadV2,
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
import type {
  AgentDualFocusResolveInput,
  AgentDualFocusScene,
} from "./agentDualFocus";
import type {
  AgentGalaxyFocusIntent,
  ResolvedAgentGalaxyEntity,
} from "./agentGalaxyFlowContract";

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

export type SideraImportCandidateClassification = "new" | "merge" | "conflict" | "invalid";
export type SideraImportDecisionKind = "accept-new" | "accept-merge" | "keep-separate" | "skip" | "unresolved";
export type SideraImportReadFaultTarget = "batch-list" | "commit-status" | "commit-history";

export type SideraIdentityEvidence = {
  kind: string;
  value: string;
  label: string;
  rank: number;
};

export type SideraIdentityMatch = {
  paperId: string;
  title: string;
  matchedBy: string[];
  preferred: boolean;
};

export type SideraImportDecision = {
  kind: SideraImportDecisionKind;
  targetPaperId?: string;
  note?: string;
  updatedAtMs: number;
};

export type SideraImportCandidate = {
  id: string;
  batchId: string;
  rowIndex: number;
  title: string;
  authors: string[];
  firstAuthor?: string;
  year?: number;
  doi?: string;
  sourceDatabase?: string;
  providerRecordId?: string;
  canonicalUrl?: string;
  venue?: string;
  abstract?: string;
  classification: SideraImportCandidateClassification;
  invalidReason?: string;
  identityEvidence: SideraIdentityEvidence[];
  identityMatches: SideraIdentityMatch[];
  decision?: SideraImportDecision;
};

export type SideraImportReviewCounts = {
  total: number;
  newCount: number;
  mergeCount: number;
  conflictCount: number;
  invalidCount: number;
  decidedCount: number;
};

export type SideraImportReviewBatch = {
  id: string;
  projectId: string;
  fileName: string;
  format: string;
  status: "active" | "discarded" | "committing" | "committed" | "commit-failed" | "rolled-back";
  batchVersion: number;
  baseLibraryRevision?: number;
  beforeLibraryRevision?: number;
  afterLibraryRevision?: number;
  commitId?: string;
  commitCounts?: SideraImportCommitCounts;
  completedAtMs?: number;
  rolledBackAtMs?: number;
  errorCode?: string;
  counts: SideraImportReviewCounts;
  createdAtMs: number;
  updatedAtMs: number;
  candidates: SideraImportCandidate[];
};

export type SideraImportCommitFieldAction =
  | "insert"
  | "fill-empty"
  | "preserve-existing"
  | "unchanged"
  | "skip";

export type SideraImportCommitAction = "insert" | "merge" | "keep-separate" | "skip";

export type SideraImportCommitCounts = {
  total: number;
  insertCount: number;
  mergeCount: number;
  keepSeparateCount: number;
  skipCount: number;
  unresolvedCount: number;
  invalidCount: number;
  changedCount: number;
};

export type SideraImportCommitFieldChange = {
  field: string;
  existingValue?: string;
  incomingValue?: string;
  action: SideraImportCommitFieldAction;
};

export type SideraImportCommitPreviewItem = {
  candidateId: string;
  rowIndex: number;
  decision?: SideraImportDecisionKind;
  targetPaperId?: string;
  effectivePaperId?: string;
  action: SideraImportCommitAction;
  identityEvidence: SideraIdentityEvidence[];
  fieldChanges: SideraImportCommitFieldChange[];
  blockingCodes: string[];
};

export type SideraImportCommitPreview = {
  previewId: string;
  previewHash: string;
  projectId: string;
  batchId: string;
  batchVersion: number;
  baseRevision?: number;
  expectedRevision: number;
  generatedAtMs: number;
  counts: SideraImportCommitCounts;
  items: SideraImportCommitPreviewItem[];
};

export type SideraImportCommitItemResult = {
  candidateId: string;
  rowIndex: number;
  action: SideraImportCommitAction;
  paperId?: string;
  sourceRecordId?: string;
};

export type SideraImportCommitResult = {
  commitId: string;
  clientCommitId: string;
  projectId: string;
  batchId: string;
  status: "committed" | "rolled-back";
  beforeRevision: number;
  afterRevision: number;
  paperCountBefore: number;
  paperCountAfter: number;
  counts: SideraImportCommitCounts;
  items: SideraImportCommitItemResult[];
  idempotent: boolean;
  completedAtMs: number;
};

export type SideraImportCommitStatus = {
  projectId: string;
  batchId: string;
  batchStatus: SideraImportReviewBatch["status"];
  batchVersion: number;
  commitId?: string;
  clientCommitId?: string;
  beforeRevision?: number;
  afterRevision?: number;
  counts?: SideraImportCommitCounts;
  paperIds?: string[];
  completedAtMs?: number;
  rolledBackAtMs?: number;
  rollbackRevision?: number;
  errorCode?: string;
};

export type SideraImportCommitHistory = {
  entries: SideraImportCommitStatus[];
};

export type SideraImportRollbackConflict = {
  candidateId: string;
  paperId: string;
  code: string;
  fields: string[];
};

export type SideraImportRollbackResult = {
  commitId: string;
  projectId: string;
  batchId: string;
  status: "rolled-back" | "blocked";
  beforeRevision: number;
  rollbackRevision?: number;
  rolledBackAtMs?: number;
  restoredCount: number;
  deletedCount: number;
  rollbackConflicts: SideraImportRollbackConflict[];
};

export type SideraDocumentVersionKind =
  | "publisher-version"
  | "author-manuscript"
  | "scan"
  | "user-import"
  | "unknown";

export type SideraDocumentVersion = {
  id: string;
  sha256: string;
  mimeType: string;
  byteSize: number;
  originalFileName?: string;
  firstAcquisitionKind: "local-import" | "institution-download" | string;
  versionKind: SideraDocumentVersionKind;
  createdAtMs: number;
};

export type SideraDocumentAcquisitionRecord = {
  id: string;
  sourceRecordId?: string;
  kind: "local-import" | "institution-download" | string;
  status: "complete" | "failed" | string;
  stage: string;
  originLabel?: string;
  safeLocator?: string;
  authorizationState: string;
  documentVersionId?: string;
  errorCode?: string;
  retryable: boolean;
  createdAtMs: number;
  completedAtMs: number;
};

export type SideraPaperSourceRecord = {
  id: string;
  sourceDatabase: string;
  producerVersion: string;
  providerRecordId?: string;
  recordType?: string;
  fullTextStatus: "available" | "link-only" | "unavailable" | "unknown" | string;
  displayLocator?: string;
  canOpenRecord: boolean;
};

export type SideraPaperDocumentSnapshot = {
  projectId: string;
  paperId: string;
  documentId?: string;
  versions: SideraDocumentVersion[];
  acquisitions: SideraDocumentAcquisitionRecord[];
  sources: SideraPaperSourceRecord[];
};

export type SideraDocumentParseState =
  | "queued"
  | "running"
  | "ready"
  | "needs-ocr"
  | "failed"
  | "cancelled"
  | "stale";

export type SideraDocumentParseSnapshot = {
  runId: string;
  projectId: string;
  paperId: string;
  documentVersionId: string;
  documentSha256: string;
  parserVersion: string;
  state: SideraDocumentParseState;
  expectedPageCount: number;
  pagesCommitted: number;
  textBearingPages: number;
  errorCode?: string;
  createdAtMs: number;
  updatedAtMs: number;
  finishedAtMs?: number;
};

export type SideraDocumentDerivedPage = {
  pageIndex: number;
  pageLabel: string;
  width: number;
  height: number;
  textLengthUtf16: number;
  spanCount: number;
  anchorCount: number;
};

export type SideraDocumentReaderState = {
  projectId: string;
  paperId: string;
  documentVersionId: string;
  pageIndex: number;
  scrollOffset: number;
  zoom: number;
  updatedAtMs: number;
};

export type SideraDocumentReaderManifest = {
  projectId: string;
  paperId: string;
  documentId: string;
  version: {
    id: string;
    sha256: string;
    mimeType: string;
    byteSize: number;
    originalFileName?: string;
    versionKind: SideraDocumentVersionKind;
  };
  resourceUri: string;
  parse?: SideraDocumentParseSnapshot;
  pages: SideraDocumentDerivedPage[];
  readerState?: SideraDocumentReaderState;
};

export type SideraDocumentSearchHit = {
  pageIndex: number;
  pageLabel: string;
  excerpt: string;
  score: number;
  anchorId?: string;
  anchor?: SideraDocumentEvidenceAnchor;
};

export type SideraDocumentSearchResult = {
  runId: string;
  total: number;
  offset: number;
  limit: number;
  hits: SideraDocumentSearchHit[];
};

export type SideraDocumentTextSpanInput = {
  text: string;
  startOffsetUtf16: number;
  endOffsetUtf16: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SideraDocumentTextSourceKind = "native" | "ocr";

export type SideraDocumentEvidenceRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SideraDocumentEvidenceAnchor = {
  id: string;
  documentVersionId: string;
  documentSha256: string;
  pageIndex: number;
  pageLabel: string;
  sourceKind: SideraDocumentTextSourceKind;
  startOffsetUtf16: number;
  endOffsetUtf16: number;
  quote: string;
  quoteSha256: string;
  prefix: string;
  suffix: string;
  rects: SideraDocumentEvidenceRect[];
};

export type SideraDocumentPageTextSpan = SideraDocumentTextSpanInput;

export type SideraDocumentPageText = {
  documentVersionId: string;
  documentSha256: string;
  pageIndex: number;
  pageLabel: string;
  sourceKind: SideraDocumentTextSourceKind;
  text: string;
  textSha256: string;
  textLengthUtf16: number;
  spans: SideraDocumentPageTextSpan[];
};

export type SideraDocumentEvidenceResolution = "exact" | "reanchored" | "ambiguous" | "missing";
export type SideraDocumentEvidenceStatus = "active" | "orphaned";

export type SideraDocumentAnnotation = {
  id: string;
  projectId: string;
  paperId: string;
  documentVersionId: string;
  documentSha256: string;
  kind: "highlight" | "note";
  colorToken: "yellow" | "blue" | "green" | "rose";
  noteText?: string | null;
  anchor: SideraDocumentEvidenceAnchor;
  resolution: SideraDocumentEvidenceResolution;
  resolvedAnchor?: SideraDocumentEvidenceAnchor | null;
  status: SideraDocumentEvidenceStatus;
  createdAtMs: number;
  updatedAtMs: number;
};

export type SideraDocumentSavedEvidence = {
  id: string;
  projectId: string;
  paperId: string;
  documentVersionId: string;
  documentSha256: string;
  label?: string | null;
  noteText?: string | null;
  anchor: SideraDocumentEvidenceAnchor;
  resolution: SideraDocumentEvidenceResolution;
  resolvedAnchor?: SideraDocumentEvidenceAnchor | null;
  status: SideraDocumentEvidenceStatus;
  createdAtMs: number;
  updatedAtMs: number;
};

export type SideraDocumentSourcePreference = {
  documentVersionId: string;
  pageIndex?: number | null;
  preference: "auto" | SideraDocumentTextSourceKind;
  updatedAtMs: number;
};

export type SideraDocumentIndexMode = "auto" | "lexical" | "hybrid";
export type SideraDocumentIndexState =
  | "queued"
  | "running"
  | "paused"
  | "ready"
  | "failed"
  | "cancelled"
  | "superseded";

export type SideraDocumentIndexSnapshot = {
  jobId: string;
  projectId: string;
  paperId: string;
  documentVersionId: string;
  documentSha256: string;
  parseRunId: string;
  requestedMode: SideraDocumentIndexMode;
  resolvedMode?: Exclude<SideraDocumentIndexMode, "auto"> | null;
  state: SideraDocumentIndexState;
  stage: "segmenting" | "embedding" | "complete";
  segmentCount: number;
  embeddedCount: number;
  modelId: string;
  modelRevision: string;
  fallbackReason?: string | null;
  errorCode?: string | null;
  createdAtMs: number;
  updatedAtMs: number;
  finishedAtMs?: number | null;
};

export type SideraDocumentIndexSearchHit = {
  segmentId: string;
  pageIndex: number;
  excerpt: string;
  score: number;
  lexicalScore?: number | null;
  semanticScore?: number | null;
  anchor: SideraDocumentEvidenceAnchor;
};

export type SideraDocumentIndexSearchResult = {
  jobId: string;
  requestedMode: SideraDocumentIndexMode;
  resolvedMode: Exclude<SideraDocumentIndexMode, "auto">;
  fallbackReason?: string | null;
  total: number;
  offset: number;
  limit: number;
  hits: SideraDocumentIndexSearchHit[];
};

export type SideraDocumentOcrCapability = {
  installed: boolean;
  modelId: string;
  modelRevision: string;
  executionProvider: string;
  maxBatchPages: number;
  unavailableCode?: string | null;
};

export type SideraDocumentOcrSnapshot = {
  jobId: string;
  projectId: string;
  paperId: string;
  documentVersionId: string;
  documentSha256: string;
  pageIndex: number;
  modelId: string;
  modelRevision: string;
  state: "awaiting-upload" | "queued" | "running" | "ready" | "failed" | "cancelled" | "superseded";
  errorCode?: string | null;
  meanConfidence?: number | null;
  createdAtMs: number;
  updatedAtMs: number;
  finishedAtMs?: number | null;
};

export type SideraDocumentOcrStartResponse = {
  snapshot: SideraDocumentOcrSnapshot;
  uploadUrl: string;
  expiresAtMs: number;
};

export type LibraryMutationStatus = {
  databaseKey: string;
  operationKind?: string;
};

export type SemanticModelingStatus = {
  running: boolean;
  stage: string;
  processed: number;
  total: number;
  cached: number;
  inferred: number;
  provider?: string;
  fallbackReason?: string;
  paused: boolean;
  cancellable: boolean;
};

export type SemanticEmbeddingCapabilities = {
  modelId: string;
  modelRevision: string;
  modelRoot?: string | null;
  cpuAvailable: boolean;
  gpuAvailable: boolean;
};

export type AgentGalaxyEntityResolveInput = {
  databaseDir?: string;
  projectId?: string;
  sourceSnapshotId: string;
  sourceCentroid: [number, number, number];
  isotropicScale: number;
  sampledEntityIds?: string[];
  entities: Array<Pick<AgentGalaxyFocusIntent, "kind" | "entityId">>;
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

export type LibrarySchemaContractStatus =
  | "current-v14"
  | "known-precontract-v14"
  | "unknown-invalid-v14";

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
  seedLibraryRevision?: number;
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
  schemaContractStatus?: LibrarySchemaContractStatus;
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
  compatibilityRepairApplied: boolean;
  migrationBackupPath?: string;
  migrationBackupSha256?: string;
  schemaContractStatus: LibrarySchemaContractStatus;
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

export function normalizeDesktopInvokeError(error: unknown) {
  if (error instanceof Error) return error;
  if (typeof error === "string" && error.trim()) return new Error(error.trim());
  if (
    error
    && typeof error === "object"
    && "message" in error
    && typeof error.message === "string"
    && error.message.trim()
  ) {
    return new Error(error.message.trim());
  }
  return new Error("桌面命令执行失败。");
}

async function invoke<T>(
  command: string,
  args?: Parameters<typeof tauriInvoke>[1],
): Promise<T> {
  try {
    return await tauriInvoke<T>(command, args);
  } catch (error) {
    throw normalizeDesktopInvokeError(error);
  }
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

export async function choosePdfFile(title = "选择 PDF 全文") {
  if (!isDesktopRuntime()) return undefined;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({
    directory: false,
    multiple: false,
    title,
    filters: [{ name: "PDF 文档", extensions: ["pdf"] }],
  });
  return Array.isArray(selected) ? selected[0] : selected ?? undefined;
}

export async function getPaperDocumentSnapshot(input: {
  databaseDir?: string;
  projectId: string;
  paperId: string;
}) {
  if (!isDesktopRuntime()) throw new Error("文档版本仅在桌面应用中可用。");
  return invoke<SideraPaperDocumentSnapshot>("sidera_document_paper_snapshot", { input });
}

export async function importLocalPaperDocument(input: {
  databaseDir?: string;
  projectId: string;
  paperId: string;
  filePath: string;
  versionKind?: SideraDocumentVersionKind;
}) {
  if (!isDesktopRuntime()) throw new Error("本地全文导入仅在桌面应用中可用。");
  return invoke<SideraPaperDocumentSnapshot>("sidera_document_import_local", { input });
}

export async function attachInstitutionDownloadToPaper(input: {
  databaseDir?: string;
  projectId: string;
  paperId: string;
  downloadId: string;
  versionKind?: SideraDocumentVersionKind;
}) {
  if (!isDesktopRuntime()) throw new Error("机构全文关联仅在桌面应用中可用。");
  return invoke<SideraPaperDocumentSnapshot>("sidera_document_attach_institution_download", { input });
}

export async function openInstitutionPaperSource(input: {
  databaseDir?: string;
  projectId: string;
  paperId: string;
  sourceRecordId: string;
}) {
  if (!isDesktopRuntime()) throw new Error("机构来源仅在桌面应用中可打开。");
  return invoke<void>("sidera_document_open_institution_source", { input });
}

export async function openPaperDocumentVersion(input: {
  databaseDir?: string;
  projectId: string;
  paperId: string;
  versionId: string;
}) {
  if (!isDesktopRuntime()) throw new Error("原始文档仅在桌面应用中可打开。");
  return invoke<void>("sidera_document_open_version", { input });
}

type SideraDocumentReaderCommonInput = {
  databaseDir?: string;
  projectId: string;
  paperId: string;
  versionId: string;
};

export async function getDocumentReaderManifest(input: SideraDocumentReaderCommonInput) {
  if (!isDesktopRuntime()) throw new Error("全文阅读台仅在桌面应用中可用。");
  return invoke<SideraDocumentReaderManifest>("sidera_document_reader_manifest", { input });
}

export async function getDocumentReaderState(input: SideraDocumentReaderCommonInput) {
  if (!isDesktopRuntime()) return undefined;
  return invoke<SideraDocumentReaderState | undefined>("sidera_document_reader_state_get", { input });
}

export async function saveDocumentReaderState(input: SideraDocumentReaderCommonInput & {
  pageIndex: number;
  scrollOffset: number;
  zoom: number;
}) {
  if (!isDesktopRuntime()) return;
  await invoke<void>("sidera_document_reader_state_save", { input });
}

export async function searchDocumentText(input: SideraDocumentReaderCommonInput & {
  query: string;
  limit?: number;
  offset?: number;
}) {
  if (!isDesktopRuntime()) throw new Error("全文搜索仅在桌面应用中可用。");
  return invoke<SideraDocumentSearchResult>("sidera_document_search", { input });
}

export async function getDocumentPageText(input: SideraDocumentReaderCommonInput & {
  pageIndex: number;
}) {
  if (!isDesktopRuntime()) throw new Error("全文页文本仅在桌面应用中可用。");
  return invoke<SideraDocumentPageText>("sidera_document_page_text", { input });
}

export async function getDocumentOcrCapabilities() {
  return invoke<SideraDocumentOcrCapability>("sidera_document_ocr_capabilities");
}

export async function startDocumentOcr(input: SideraDocumentReaderCommonInput & {
  pageIndex: number;
}) {
  return invoke<SideraDocumentOcrStartResponse>("sidera_document_ocr_start", { input });
}

export async function getCurrentDocumentOcr(input: SideraDocumentReaderCommonInput & {
  pageIndex: number;
}) {
  return invoke<SideraDocumentOcrSnapshot | null>("sidera_document_ocr_current", { input });
}

export async function getDocumentOcrSnapshot(input: {
  databaseDir?: string;
  jobId: string;
}) {
  return invoke<SideraDocumentOcrSnapshot>("sidera_document_ocr_snapshot", { input });
}

export async function cancelDocumentOcr(input: {
  databaseDir?: string;
  jobId: string;
}) {
  return invoke<SideraDocumentOcrSnapshot>("sidera_document_ocr_cancel", { input });
}

export async function listDocumentAnnotations(input: SideraDocumentReaderCommonInput) {
  if (!isDesktopRuntime()) return [];
  return invoke<SideraDocumentAnnotation[]>("sidera_document_annotation_list", { input });
}

export async function saveDocumentAnnotation(input: SideraDocumentReaderCommonInput & {
  annotationId: string;
  kind: SideraDocumentAnnotation["kind"];
  colorToken: SideraDocumentAnnotation["colorToken"];
  noteText?: string;
  anchor: SideraDocumentEvidenceAnchor;
}) {
  if (!isDesktopRuntime()) throw new Error("全文批注仅在桌面应用中可保存。");
  return invoke<SideraDocumentAnnotation>("sidera_document_annotation_save", { input });
}

export async function createDocumentAnnotation(input: SideraDocumentReaderCommonInput & {
  annotationId: string;
  kind: SideraDocumentAnnotation["kind"];
  colorToken: SideraDocumentAnnotation["colorToken"];
  noteText?: string;
  anchor: SideraDocumentEvidenceAnchor;
}) {
  if (!isDesktopRuntime()) throw new Error("全文批注仅在桌面应用中可创建。");
  return invoke<SideraDocumentAnnotation>("sidera_document_annotation_create", { input });
}

export async function updateDocumentAnnotation(input: SideraDocumentReaderCommonInput & {
  annotationId: string;
  kind: SideraDocumentAnnotation["kind"];
  colorToken: SideraDocumentAnnotation["colorToken"];
  noteText?: string;
  anchor: SideraDocumentEvidenceAnchor;
}) {
  if (!isDesktopRuntime()) throw new Error("全文批注仅在桌面应用中可编辑。");
  return invoke<SideraDocumentAnnotation>("sidera_document_annotation_update", { input });
}

export async function deleteDocumentAnnotation(input: SideraDocumentReaderCommonInput & {
  annotationId: string;
}) {
  if (!isDesktopRuntime()) return false;
  return invoke<boolean>("sidera_document_annotation_delete", { input });
}

export async function listDocumentSavedEvidence(input: SideraDocumentReaderCommonInput) {
  if (!isDesktopRuntime()) return [];
  return invoke<SideraDocumentSavedEvidence[]>("sidera_document_evidence_list", { input });
}

export async function saveDocumentEvidence(input: SideraDocumentReaderCommonInput & {
  evidenceId: string;
  label?: string;
  noteText?: string;
  anchor: SideraDocumentEvidenceAnchor;
}) {
  if (!isDesktopRuntime()) throw new Error("全文证据仅在桌面应用中可保存。");
  return invoke<SideraDocumentSavedEvidence>("sidera_document_evidence_save", { input });
}

export async function deleteDocumentEvidence(input: SideraDocumentReaderCommonInput & {
  evidenceId: string;
}) {
  if (!isDesktopRuntime()) return false;
  return invoke<boolean>("sidera_document_evidence_delete", { input });
}

export async function getDocumentSourcePreference(input: SideraDocumentReaderCommonInput & {
  pageIndex?: number;
}) {
  if (!isDesktopRuntime()) return undefined;
  return invoke<SideraDocumentSourcePreference | undefined>(
    "sidera_document_source_preference_get",
    { input },
  );
}

export async function saveDocumentSourcePreference(input: SideraDocumentReaderCommonInput & {
  pageIndex?: number;
  preference: SideraDocumentSourcePreference["preference"];
}) {
  if (!isDesktopRuntime()) throw new Error("全文来源偏好仅在桌面应用中可保存。");
  return invoke<SideraDocumentSourcePreference>("sidera_document_source_preference_save", { input });
}

export async function startDocumentIndex(input: SideraDocumentReaderCommonInput & {
  requestedMode?: SideraDocumentIndexMode;
}) {
  if (!isDesktopRuntime()) throw new Error("全文索引仅在桌面应用中可用。");
  return invoke<SideraDocumentIndexSnapshot>("sidera_document_index_start", { input });
}

export async function getCurrentDocumentIndex(input: SideraDocumentReaderCommonInput) {
  if (!isDesktopRuntime()) return null;
  return invoke<SideraDocumentIndexSnapshot | null>("sidera_document_index_current", { input });
}

export async function getDocumentIndexSnapshot(input: SideraDocumentReaderCommonInput & {
  jobId: string;
}) {
  if (!isDesktopRuntime()) throw new Error("全文索引状态仅在桌面应用中可用。");
  return invoke<SideraDocumentIndexSnapshot>("sidera_document_index_snapshot", { input });
}

export async function pauseDocumentIndex(input: SideraDocumentReaderCommonInput & {
  jobId: string;
}) {
  if (!isDesktopRuntime()) throw new Error("全文索引仅在桌面应用中可暂停。");
  return invoke<SideraDocumentIndexSnapshot>("sidera_document_index_pause", { input });
}

export async function resumeDocumentIndex(input: SideraDocumentReaderCommonInput & {
  jobId: string;
}) {
  if (!isDesktopRuntime()) throw new Error("全文索引仅在桌面应用中可继续。");
  return invoke<SideraDocumentIndexSnapshot>("sidera_document_index_resume", { input });
}

export async function cancelDocumentIndex(input: SideraDocumentReaderCommonInput & {
  jobId: string;
}) {
  if (!isDesktopRuntime()) throw new Error("全文索引仅在桌面应用中可取消。");
  return invoke<SideraDocumentIndexSnapshot>("sidera_document_index_cancel", { input });
}

export async function searchDocumentIndex(input: SideraDocumentReaderCommonInput & {
  query: string;
  requestedMode?: SideraDocumentIndexMode;
  limit?: number;
  offset?: number;
}) {
  if (!isDesktopRuntime()) throw new Error("全文索引检索仅在桌面应用中可用。");
  const { requestedMode, ...commandInput } = input;
  return invoke<SideraDocumentIndexSearchResult>("sidera_document_search", {
    input: { ...commandInput, mode: requestedMode },
  });
}

export async function startDocumentParse(input: SideraDocumentReaderCommonInput & {
  expectedSha256: string;
  parserVersion: string;
  pageCount: number;
}) {
  if (!isDesktopRuntime()) throw new Error("全文解析仅在桌面应用中可用。");
  return invoke<SideraDocumentParseSnapshot>("sidera_document_parse_start", { input });
}

type SideraDocumentParseRunInput = SideraDocumentReaderCommonInput & {
  runId: string;
  documentSha256: string;
  parserVersion: string;
};

export async function getDocumentParseSnapshot(input: SideraDocumentParseRunInput) {
  if (!isDesktopRuntime()) throw new Error("全文解析状态仅在桌面应用中可用。");
  return invoke<SideraDocumentParseSnapshot>("sidera_document_parse_snapshot", { input });
}

export async function cancelDocumentParse(input: SideraDocumentParseRunInput) {
  if (!isDesktopRuntime()) throw new Error("全文解析任务仅在桌面应用中可取消。");
  return invoke<SideraDocumentParseSnapshot>("sidera_document_parse_cancel", { input });
}

export async function submitDocumentParsePage(input: SideraDocumentParseRunInput & {
  pageIndex: number;
  pageLabel: string;
  width: number;
  height: number;
  text: string;
  spans: SideraDocumentTextSpanInput[];
}) {
  if (!isDesktopRuntime()) throw new Error("全文解析页面仅在桌面应用中可提交。");
  await invoke<void>("sidera_document_parse_page_submit", { input });
}

export async function finalizeDocumentParse(input: SideraDocumentParseRunInput) {
  if (!isDesktopRuntime()) throw new Error("全文解析任务仅在桌面应用中可完成。");
  return invoke<SideraDocumentParseSnapshot>("sidera_document_parse_finalize", { input });
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

function libraryDatabaseRequestKey(databaseDir?: string) {
  return (databaseDir ?? "").trim().replace(/\\/g, "/").toLowerCase();
}

const libraryPreparationRequests = new Map<string, Promise<void>>();

export async function prepareLibraryDatabase(databaseDir?: string) {
  if (!isDesktopRuntime()) return;
  const requestKey = libraryDatabaseRequestKey(databaseDir);
  const current = libraryPreparationRequests.get(requestKey);
  if (current) return current;
  const request = invoke<void>("prepare_library_database", { databaseDir });
  libraryPreparationRequests.set(requestKey, request);
  try {
    return await request;
  } finally {
    if (libraryPreparationRequests.get(requestKey) === request) {
      libraryPreparationRequests.delete(requestKey);
    }
  }
}

export async function getPaperLibraryStatus(databaseDir?: string, projectId?: string) {
  if (!isDesktopRuntime()) {
    return {
      databaseDir: "browser-preview",
      databasePath: "IndexedDB preview",
      sizeBytes: 0,
      paperCount: 0,
      libraryRevision: 0,
    } satisfies PaperLibraryStatus;
  }
  return invoke<PaperLibraryStatus>("paper_library_status", { databaseDir, projectId });
}

export async function getLibraryMutationStatus(databaseDir?: string) {
  if (!isDesktopRuntime()) {
    return { databaseKey: databaseDir ?? "browser-preview" } satisfies LibraryMutationStatus;
  }
  return invoke<LibraryMutationStatus>("get_library_mutation_status", { databaseDir });
}

const librarySetupStateRequests = new Map<string, Promise<LibrarySetupState>>();

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
  const requestKey = libraryDatabaseRequestKey(databaseDir);
  const current = librarySetupStateRequests.get(requestKey);
  if (current) return current;
  const request = invoke<LibrarySetupState>("get_library_setup_state", { databaseDir });
  librarySetupStateRequests.set(requestKey, request);
  try {
    return await request;
  } finally {
    if (librarySetupStateRequests.get(requestKey) === request) {
      librarySetupStateRequests.delete(requestKey);
    }
  }
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

export async function runLibraryClusterWorker(
  databaseDir: string | undefined,
  projectId: string | undefined,
  embeddingDevice: "cpu" | "gpu" = "cpu",
) {
  if (!isDesktopRuntime()) {
    return runBrowserCluster([]);
  }
  return invoke<ClusterWorkerResult>("cluster_paper_library", { databaseDir, projectId, embeddingDevice });
}

export async function getSemanticModelingStatus(databaseDir?: string, projectId?: string) {
  if (!isDesktopRuntime()) return undefined;
  return invoke<SemanticModelingStatus | null>("get_semantic_modeling_status", { databaseDir, projectId });
}

export async function controlSemanticModeling(
  databaseDir: string | undefined,
  projectId: string | undefined,
  action: "pause" | "resume" | "cancel",
) {
  if (!isDesktopRuntime()) throw new Error("语义建模控制只在桌面端可用。");
  return invoke<SemanticModelingStatus>("control_semantic_modeling", { databaseDir, projectId, action });
}

export async function getSemanticEmbeddingCapabilities() {
  if (!isDesktopRuntime()) {
    return {
      modelId: "intfloat/multilingual-e5-small",
      modelRevision: "browser-review",
      cpuAvailable: false,
      gpuAvailable: false,
    } satisfies SemanticEmbeddingCapabilities;
  }
  return invoke<SemanticEmbeddingCapabilities>("get_semantic_embedding_capabilities");
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

export async function createImportReviewBatch(input: { databaseDir?: string; projectId?: string; filePath: string }) {
  if (!isDesktopRuntime()) throw new Error("题录审查批次只在桌面端可用。");
  return invoke<SideraImportReviewBatch>("sidera_import_review_batch_create", { input });
}

export async function createImportReviewBatchFromSearch(input: {
  databaseDir?: string;
  projectId?: string;
  searchId: string;
  generation: number;
  connectorVersion: string;
  candidateIds: string[];
}) {
  if (!isDesktopRuntime()) throw new Error("检索候选审查批次只在桌面端可用。");
  return invoke<SideraImportReviewBatch>("sidera_import_review_create_from_search", { input });
}

export async function listImportReviewBatches(input: { databaseDir?: string; projectId?: string }) {
  if (!isDesktopRuntime()) return [];
  return invoke<SideraImportReviewBatch[]>("sidera_import_review_batch_list", { input });
}

export async function openImportReviewBatch(input: { databaseDir?: string; projectId?: string; batchId: string }) {
  if (!isDesktopRuntime()) throw new Error("题录审查批次只在桌面端可用。");
  return invoke<SideraImportReviewBatch>("sidera_import_review_batch_open", { input });
}

export async function cloneImportReviewBatch(input: { databaseDir?: string; projectId?: string; batchId: string }) {
  if (!isDesktopRuntime()) throw new Error("题录审查批次只在桌面端可用。");
  return invoke<SideraImportReviewBatch>("sidera_import_review_batch_clone", { input });
}

export async function saveImportReviewDecision(input: {
  databaseDir?: string;
  projectId?: string;
  batchId: string;
  candidateId: string;
  decision?: SideraImportDecisionKind;
  targetPaperId?: string;
  note?: string;
}) {
  if (!isDesktopRuntime()) throw new Error("题录审查决定只在桌面端可用。");
  return invoke<SideraImportReviewBatch>("sidera_import_review_decision_save", { input });
}

export async function discardImportReviewBatch(input: { databaseDir?: string; projectId?: string; batchId: string }) {
  if (!isDesktopRuntime()) return;
  await invoke("sidera_import_review_batch_discard", { input });
}

export async function prepareImportReviewCommit(input: {
  databaseDir?: string;
  projectId?: string;
  batchId: string;
}) {
  if (!isDesktopRuntime()) throw new Error("题录提交预览只在桌面端可用。");
  return invoke<SideraImportCommitPreview>("sidera_import_review_commit_prepare", { input });
}

export async function executeImportReviewCommit(input: {
  databaseDir?: string;
  projectId?: string;
  batchId: string;
  previewId: string;
  previewHash: string;
  batchVersion: number;
  expectedRevision: number;
  clientCommitId: string;
}) {
  if (!isDesktopRuntime()) throw new Error("题录正式提交只在桌面端可用。");
  return invoke<SideraImportCommitResult>("sidera_import_review_commit_execute", { input });
}

export async function getImportReviewCommitStatus(input: {
  databaseDir?: string;
  projectId?: string;
  batchId: string;
}) {
  if (!isDesktopRuntime()) return undefined;
  return invoke<SideraImportCommitStatus>("sidera_import_review_commit_status", { input });
}

export async function listImportReviewCommitHistory(input: {
  databaseDir?: string;
  projectId?: string;
  batchId?: string;
  limit?: number;
}) {
  if (!isDesktopRuntime()) return { entries: [] } satisfies SideraImportCommitHistory;
  return invoke<SideraImportCommitHistory>("sidera_import_review_commit_history", { input });
}

export async function armImportReadFaultFixture(input: {
  databaseDir?: string;
  projectId?: string;
  target: SideraImportReadFaultTarget;
}) {
  if (!isDesktopRuntime() || !import.meta.env.DEV) {
    throw new Error("SIDERA_IMPORT_READ_FAULT_FIXTURE_UNAVAILABLE");
  }
  await invoke<void>("sidera_import_read_fault_fixture_arm", { input });
}

export async function clearImportReadFaultFixture() {
  if (!isDesktopRuntime() || !import.meta.env.DEV) return;
  await invoke<void>("sidera_import_read_fault_fixture_clear");
}

export async function rollbackImportReviewCommit(input: {
  databaseDir?: string;
  projectId?: string;
  batchId: string;
  commitId: string;
  expectedRevision: number;
  clientRollbackId: string;
}) {
  if (!isDesktopRuntime()) throw new Error("题录提交回滚只在桌面端可用。");
  return invoke<SideraImportRollbackResult>("sidera_import_review_commit_rollback", { input });
}

export async function resolveAgentGalaxyEntities(
  input: AgentGalaxyEntityResolveInput,
) {
  if (!isDesktopRuntime()) return [] as ResolvedAgentGalaxyEntity[];
  return invoke<ResolvedAgentGalaxyEntity[]>(
    "resolve_agent_galaxy_entities",
    { input },
  );
}

export async function resolveAgentDualFocusScene(
  input: AgentDualFocusResolveInput,
) {
  if (!isDesktopRuntime()) {
    throw new Error("双背景真实实体聚焦仅可在桌面应用中解析。");
  }
  return invoke<AgentDualFocusScene>(
    "resolve_agent_dual_focus_scene",
    { input },
  );
}

export async function loadAgentImmersiveBackground(input: {
  databaseDir?: string;
  projectId?: string;
  sessionSeed: string;
  paperCount?: number;
}) {
  if (!isDesktopRuntime()) {
    throw new Error("沉浸背景真实论文载荷仅可在桌面应用中读取。");
  }
  try {
    return await invoke<AgentImmersiveBackgroundPayloadV2>(
      "load_agent_immersive_background",
      { input },
    );
  } catch (error) {
    // Tauri rejects commands with the serialized Rust error string. Normalize
    // that value without rewriting it so callers keep the exact error code.
    if (error instanceof Error) throw error;
    throw new Error(typeof error === "string" ? error : String(error));
  }
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
