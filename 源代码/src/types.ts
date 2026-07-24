export type SourceKind = "arxiv" | "openalex" | "cnki" | "local";

export type TrendStatus = "Surging" | "Stable" | "Declining" | "Unknown";

export type ActiveView =
  | "dashboard"
  | "agent"
  | "search"
  | "galaxy"
  | "hotspots"
  | "reports"
  | "pipeline"
  | "logs"
  | "health"
  | "about"
  | "settings";

export type Project = {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
};

export type AppMeta = {
  id: "main";
  activeProjectId: string;
  v20CacheStates?: Record<string, V20CacheState>;
  updatedAt: string;
};

export type V20CacheState = {
  databaseKey: string;
  projectId: string;
  snapshotId?: string;
  paperCount: number;
  hotspotCount: number;
  membershipCount: number;
  generatedAt: string;
};

export type Paper = {
  id: string;
  projectId?: string;
  source: SourceKind;
  title: string;
  abstract: string;
  authors?: string;
  categories?: string;
  field: string;
  publishedDate?: string;
  year?: number;
  url?: string;
  doi?: string;
  createdAt: string;
  updatedAt: string;
};

export type Hotspot = {
  id: string;
  projectId?: string;
  databaseKey?: string;
  snapshotId?: string;
  field: string;
  topicId: number;
  title: string;
  label?: string;
  summary: string;
  keywords: string[];
  keywordWeights?: Array<{ keyword: string; weight: number }>;
  paperCount: number;
  trend: TrendStatus;
  confidence?: number;
  source?: "seed" | "worker" | "manual";
  coordinates: {
    x: number;
    y: number;
    z: number;
  };
  evolution: Array<{
    year: number;
    count: number;
    keywords: string[];
    representativeIds: string[];
  }>;
  sourceDistribution?: CountFacet[];
  similarHotspots?: Array<{ hotspotId: string; score: number }>;
  analysis?: {
    keywordFocus: number;
    representativeCoverage: number;
    recentMomentum: number;
    sourceDiversity: number;
    evidencePaperIds: string[];
    warnings: string[];
  };
  updatedAt: string;
};

export type ResearchReport = {
  id: string;
  projectId?: string;
  snapshotId?: string;
  topic: string;
  mode: "simple" | "deep" | "revised";
  discipline: string;
  content: string;
  paperIds: string[];
  metrics: {
    citationCoverage: number;
    citationAccuracy: number;
    consistencyScore: number;
  };
  evidenceProfile?: ReportEvidenceProfile;
  reviewStatus: "approved" | "needs-review";
  auditSnapshot?: ReportAudit;
  reviewedAt?: string;
  reviewedBy?: string;
  createdAt: string;
  updatedAt: string;
};

export type ReportEvidenceProfile = {
  paperCount: number;
  yearRange: string;
  sourceCounts: CountFacet[];
  fieldCounts: CountFacet[];
  keywordHighlights: string[];
  representativePaperIds: string[];
  hotspot?: {
    id: string;
    title: string;
    field: string;
    trend: TrendStatus;
    confidence: number;
    summary: string;
    warnings: string[];
  };
};

export type MarkdownExport = {
  fileName: string;
  path: string;
  content: string;
};

export type PipelineStage =
  | "crawl"
  | "clean"
  | "cluster"
  | "name"
  | "review"
  | "export";

export type PipelineJob = {
  id: string;
  projectId?: string;
  databaseKey?: string;
  executionSessionId?: string;
  stage: PipelineStage;
  title: string;
  status: "planned" | "queued" | "running" | "done" | "failed";
  detail: string;
  progress: number;
  createdAt: string;
  updatedAt: string;
};

export type CleanerWorkerResult = {
  beforeCount: number;
  afterCount: number;
  removedCount: number;
  updatedCount?: number;
  emptyRemovedCount?: number;
  duplicateRemovedCount?: number;
  duplicateIds: string[];
  cleanedPapers: Paper[];
  summary: string;
};

export type ClusterWorkerResult = {
  beforeCount: number;
  clusterCount: number;
  snapshotId?: string;
  membershipCount?: number;
  hotspots: Hotspot[];
  summary: string;
};

export type TaskLog = {
  id: string;
  projectId?: string;
  stage: PipelineStage | "backup" | "restore" | "health";
  title: string;
  status: "queued" | "running" | "cancelled" | "done" | "failed";
  taskKey?: string;
  inputSummary: string;
  outputSummary: string;
  rawInput?: string;
  rawOutput?: string;
  error?: string;
  durationMs: number;
  createdAt: string;
};

export type AiProvider = "deepseek" | "openai-compatible";

export type CnkiSettings = {
  chromeDriverPath: string;
  chromeUserDataDir: string;
  chromeProfile: string;
  headless: boolean;
  waitTimeoutSec: number;
  pageLoadTimeoutSec: number;
  implicitWaitSec: number;
  debugDir: string;
};

export type MysqlImportSettings = {
  host: string;
  port: number;
  user: string;
  password: string;
  credentialConfigured?: boolean;
  database: string;
  batchSize: number;
};

export type AiSettings = {
  id: string;
  projectId?: string;
  provider: AiProvider;
  customProviderName: string;
  baseUrl: string;
  model: string;
  useEnvKey: boolean;
  manualApiKey: string;
  apiCredentialConfigured?: boolean;
  temperature: number;
  streamOutput: boolean;
  dataDir: string;
  databaseDir: string;
  librarySetupCompleted: boolean;
  librarySetupMode: "" | "seed" | "empty" | "existing";
  exportDir: string;
  workerTempDir: string;
  backupDir: string;
  semanticEmbeddingDevice: "cpu" | "gpu";
  cnki: CnkiSettings;
  mysql: MysqlImportSettings;
  updatedAt: string;
};

export type BackupAiSettings = Omit<AiSettings, "manualApiKey" | "apiCredentialConfigured" | "mysql"> & {
  mysql: Omit<MysqlImportSettings, "password" | "credentialConfigured">;
};

export type ReportGenerationOptions = {
  structure: "standard" | "problem-method" | "timeline" | "comparison";
  targetLength: "short" | "medium" | "long";
  citationDensity: "low" | "medium" | "high";
  tone: "draft" | "formal" | "critical";
  includeFutureDirections: boolean;
};

export type AiParameterTemplate = {
  id: string;
  name: string;
  description: string;
  options: ReportGenerationOptions;
};

export type ReportAudit = {
  citedIndices: number[];
  validCitationCount: number;
  invalidCitationCount: number;
  uncitedPaperCount: number;
  unreferencedParagraphs: string[];
  coverageExplanation: string;
  missingRequiredSections: string[];
  evidenceProfilePresent: boolean;
  riskLevel: "low" | "medium" | "high";
};

export type DataBackup = {
  schemaVersion?: number;
  version: string;
  exportedAt: string;
  projects?: Project[];
  activeProjectId?: string;
  papers: Paper[];
  hotspots: Hotspot[];
  reports: ResearchReport[];
  jobs: PipelineJob[];
  settings: BackupAiSettings;
  taskLogs: TaskLog[];
};

export type DashboardData = {
  paperCount: number;
  hotspotCount: number;
  reportCount: number;
  fieldCount: number;
  latestReport?: ResearchReport;
  latestJob?: PipelineJob;
  yearlyCounts: Array<{ year: number; count: number }>;
  sourceCounts: Array<{ source: SourceKind; count: number }>;
};

export type PaperLibraryStatus = {
  databaseDir: string;
  databasePath: string;
  sizeBytes: number;
  paperCount: number;
};

export type CountFacet = {
  value: string;
  count: number;
};

export type HotspotEvidencePaperSnapshot = {
  id: string;
  source: SourceKind | string;
  title: string;
  abstractText: string;
  authors?: string;
  categories?: string;
  field: string;
  publishedDate?: string;
  year?: number;
  url?: string;
  doi?: string;
};

export type HotspotEvidenceBundle = {
  generatedAt: string;
  databasePath: string;
  projectId: string;
  selectedHotspotId: string;
  selectedHotspotTitle: string;
  selectedHotspotField: string;
  hotspotPaperCount: number;
  hotspotKeywords: string[];
  hotspotTrend: TrendStatus | string;
  hotspotConfidence: number;
  representativeIds: string[];
  missingRepresentativeIds: string[];
  representativePapers: HotspotEvidencePaperSnapshot[];
  yearEvolution: Array<{ year: number; count: number; keywords: string[]; representativeIds: string[] }>;
  sourceDistribution: CountFacet[];
  similarHotspots: Array<{ hotspotId: string; title: string; field: string; score: number }>;
  evidenceProfileMarkdown: string;
};

export type PaperLibraryFacets = {
  sources: CountFacet[];
  fields: CountFacet[];
  years: CountFacet[];
};

export type PaperQueryInput = {
  databaseDir?: string;
  projectId?: string;
  query?: string;
  source?: SourceKind | "all";
  field?: string;
  year?: number;
  limit?: number;
  offset?: number;
  sort?: "newest" | "oldest" | "title";
};

export type PaperQueryResult = {
  rows: Paper[];
  total: number;
  limit: number;
  offset: number;
  queryMs: number;
};

export type PaperLibraryMutationResult = {
  inserted: number;
  updated: number;
  total: number;
};

export type App17GalaxyPaperPoint = {
  rawPaperId: string;
  scopedPaperId: string;
  field: string;
  topicId: number;
  x: number;
  y: number;
  z: number;
  year?: number;
  color: string;
  size: number;
};

export type App17GalaxyHotspotPoint = {
  id: string;
  field: string;
  topicId: number;
  title: string;
  label: string;
  summary: string;
  trend: string;
  paperCount: number;
  x: number;
  y: number;
  z: number;
  color: string;
  size: number;
  keywords: string[];
  review?: string;
};

export type App17GalaxyPayload = {
  ready: boolean;
  message: string;
  source?: "mysql" | "sqlite-cache" | "none" | string;
  mode: GalaxyVisualModeLike;
  generatedAt: string;
  paperCount: number;
  hotspotCount: number;
  topicCount: number;
  fields: string[];
  papers: App17GalaxyPaperPoint[];
  hotspots: App17GalaxyHotspotPoint[];
  snapshotId?: string;
  paperLayoutVersion?: string;
  embeddingModelId?: string;
  embeddingModelRevision?: string;
  projectionVersion?: string;
  hotspotRecords?: Hotspot[];
};

export type V20AnalysisState = {
  projectId: string;
  activeSnapshotId: string;
  algorithmVersion: string;
  paperCount: number;
  hotspotCount: number;
  membershipCount: number;
  generatedAt: string;
  libraryRevision?: number;
  currentLibraryRevision?: number;
};

export type V20HotspotSnapshot = V20AnalysisState & {
  databaseKey: string;
  snapshotId?: string;
  hotspots: Hotspot[];
};

export type App17GalaxySyncResult = {
  databaseDir: string;
  databasePath: string;
  projectId: string;
  paperTopicCount: number;
  hotspotCount: number;
  hotspotReviewCount: number;
  elapsedMs: number;
  summary: string;
};

export type GalaxyVisualModeLike = "nebula" | "galaxy" | string;

export type SearchOptions = {
  query: string;
  sources: SourceKind[];
  maxResults: number;
  startYear: number;
  endYear: number;
  cnki?: CnkiSettings;
};

export type SearchResultPaper = Omit<Paper, "createdAt" | "updatedAt">;

export type ImportInvalidRow = {
  index: number;
  reason: string;
  raw: Record<string, unknown>;
};

export type ImportPreview = {
  fileName: string;
  totalRows: number;
  validRows: SearchResultPaper[];
  invalidRows: ImportInvalidRow[];
  duplicateRows: SearchResultPaper[];
  fieldCounts: Array<{ field: string; count: number }>;
  sourceCounts: Array<{ source: SourceKind; count: number }>;
};

export const DISCIPLINES = [
  "理工科",
  "信息学科",
  "计算机与人工智能",
  "数据科学与信息管理",
  "材料与化学",
  "生命科学",
  "医学科学",
  "环境与地球科学",
  "工程技术",
  "管理学与经济学",
  "教育学",
  "法学",
  "人文社科",
  "交叉学科",
] as const;

export const PIPELINE_STAGES: Array<{ id: PipelineStage; title: string; description: string }> = [
  { id: "crawl", title: "文献采集", description: "arXiv / OpenAlex / CNKI / 本地导入" },
  { id: "clean", title: "清洗去重", description: "摘要过滤、DOI 去重、标题归一化" },
  { id: "cluster", title: "热点建模", description: "本地关键词聚类、年度演化、3D 坐标" },
  { id: "name", title: "热点命名", description: "中文标题、简介、关键词和趋势解释" },
  { id: "review", title: "深度综述", description: "按热点生成带证据链的学术综述" },
  { id: "export", title: "结果导出", description: "Markdown、JSON 备份和历史报告导入" },
];
