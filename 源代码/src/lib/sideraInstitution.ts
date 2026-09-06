import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type SideraInstitutionId = "whu";
export type SideraInstitutionProbeStatus = "ready" | "partial" | "unavailable";
export type SideraInstitutionEndpointStatus =
  | "native-direct"
  | "browser-required"
  | "unresolved"
  | "failed";
export type SideraInstitutionClientStatus =
  | "installed-running"
  | "installed-stopped"
  | "running-path-unknown"
  | "not-found"
  | "detection-failed";
export type SideraInstitutionCapabilityStatus = "available" | "browser-required" | "unresolved";
export type SideraInstitutionNavigationKind = "direct" | "official-sso" | "official-external";
export type SideraInstitutionNavigationSource = "fixed-config" | "official-response";

export type SideraInstitutionClientProbe = {
  status: SideraInstitutionClientStatus;
  installed: boolean;
  running: boolean;
  executablePath?: string;
  code: string;
  detail: string;
};

export type SideraInstitutionEndpointCheck = {
  id: "library-home" | "database-directory" | "unified-discovery";
  label: string;
  url: string;
  status: SideraInstitutionEndpointStatus;
  httpStatus?: number;
  latencyMs?: number;
  code: string;
  detail: string;
  detectedEntry?: string;
};

export type SideraInstitutionCapabilityReport = {
  unifiedDiscovery: SideraInstitutionCapabilityStatus;
  metadataExport: SideraInstitutionCapabilityStatus;
  onlineNavigation: SideraInstitutionCapabilityStatus;
  fullTextResolution: SideraInstitutionCapabilityStatus;
  dedicatedAdapters: SideraInstitutionCapabilityStatus;
  catalogEntryCount?: number;
  routeRecommendation: "direct-unified-search" | "visible-browser-export" | "hybrid";
};

export type SideraInstitutionCatalogEntry = {
  name: string;
  category?: string | null;
  entryUrl?: string | null;
};

export type SideraInstitutionCatalogSummary = {
  structured: boolean;
  entryCount?: number | null;
  categories: string[];
  sampleEntries: SideraInstitutionCatalogEntry[];
};

export type SideraInstitutionNavigationTarget = {
  id: "library-home" | "database-directory" | "unified-discovery";
  kind: SideraInstitutionNavigationKind;
  openUrl: string;
  displayUrl: string;
  source: SideraInstitutionNavigationSource;
};

export type SideraInstitutionProbeResult = {
  institutionId: SideraInstitutionId;
  institutionName: string;
  accessMethod: "atrust-external-session";
  status: SideraInstitutionProbeStatus;
  client: SideraInstitutionClientProbe;
  endpoints: SideraInstitutionEndpointCheck[];
  capabilities: SideraInstitutionCapabilityReport;
  catalog: SideraInstitutionCatalogSummary;
  navigationTargets: SideraInstitutionNavigationTarget[];
  checkedAtMs: number;
  summary: string;
};

export type SideraInstitutionSessionStatus =
  | "uninitialized"
  | "starting"
  | "login-required"
  | "ready"
  | "expired"
  | "searching"
  | "partial"
  | "failed";

export type SideraInstitutionAuthKind = "database-sso" | "library-account";
export type SideraInstitutionAuthStatus =
  | "idle"
  | "starting"
  | "login-required"
  | "ready"
  | "cancelled"
  | "failed";

export type SideraInstitutionConnectionGoal =
  | "database-access"
  | "library-account"
  | "discovery-fulltext";

export type SideraInstitutionConnectionPhase =
  | "opening"
  | "awaiting-user"
  | "verifying"
  | "refreshing-parent"
  | "ready"
  | "cancelled"
  | "failed";

export type SideraInstitutionActiveConnection = {
  transactionId: string;
  goal: SideraInstitutionConnectionGoal;
  phase: SideraInstitutionConnectionPhase;
  code: string;
  message: string;
  updatedAtMs: number;
};

export type SideraInstitutionConnectionVerificationStage =
  | "page-observation"
  | "close-current"
  | "close-parent"
  | "resolved";

export type SideraInstitutionConnectionVerificationSurface =
  | "auth-window"
  | "parent";

export type SideraInstitutionConnectionVerificationVerdict =
  | "ready"
  | "login-required"
  | "failed"
  | "unknown";

export type SideraInstitutionConnectionVerificationEvent = {
  transactionId: string;
  stage: SideraInstitutionConnectionVerificationStage;
  surface: SideraInstitutionConnectionVerificationSurface;
  verdict: SideraInstitutionConnectionVerificationVerdict;
  reasonCode: string;
  attempt: number;
  elapsedMs: number;
  timestampMs: number;
};

export type SideraInstitutionNavigationPhase =
  | "starting"
  | "redirect"
  | "completed"
  | "blocked"
  | "failed"
  | "timeout";

export type SideraInstitutionNavigationEvent = {
  navigationId?: number | null;
  generation: number;
  epoch: number;
  authKind: SideraInstitutionAuthKind;
  phase: SideraInstitutionNavigationPhase;
  host: string;
  path: string;
  redirected: boolean;
  webErrorStatus?: string | null;
  timestampMs: number;
};

export type SideraInstitutionAuthState = {
  status: SideraInstitutionAuthStatus;
  code: string;
  message: string;
  currentHost?: string | null;
  updatedAtMs: number;
};

export type SideraInstitutionSearchSource = "academic-discovery" | "catalog";
export type SideraInstitutionAdapterId =
  | "whu-academic-discovery-v1"
  | "whu-academic-discovery-v2"
  | "whu-opac-catalog-v3";
export type SideraInstitutionRecordKind =
  | "journal-article"
  | "conference-paper"
  | "thesis"
  | "book"
  | "journal-holding"
  | "unknown";
export type SideraInstitutionFullTextStatus =
  | "available"
  | "link-only"
  | "unavailable"
  | "unknown";
export type SideraInstitutionFullTextRoute =
  | "direct-html-pdf"
  | "doi"
  | "openurl-link-resolver"
  | "provider-record"
  | "publisher-page"
  | "browser-fallback";
export type SideraInstitutionSourceReadinessStatus =
  | "uninitialized"
  | "starting"
  | "ready"
  | "partial"
  | "failed";
export type SideraInstitutionSourceReadiness = {
  source: SideraInstitutionSearchSource;
  status: SideraInstitutionSourceReadinessStatus;
  code: string;
  message: string;
  currentHost?: string | null;
  updatedAtMs: number;
};

export type SideraInstitutionSessionState = {
  institutionId: SideraInstitutionId;
  status: SideraInstitutionSessionStatus;
  code: string;
  message: string;
  currentHost?: string | null;
  browserVisible: boolean;
  fallbackTargetId?: string | null;
  fallbackDisplayUrl?: string | null;
  databaseAuth: SideraInstitutionAuthState;
  academicDiscoveryAuth: SideraInstitutionAuthState;
  libraryAccountAuth: SideraInstitutionAuthState;
  activeConnection?: SideraInstitutionActiveConnection | null;
  activeAuthKind?: SideraInstitutionAuthKind | null;
  authModalVisible: boolean;
  discoveryAuthWindowVisible: boolean;
  navigationEpoch: number;
  navigationTrace: SideraInstitutionNavigationEvent[];
  connectionVerificationTrace: SideraInstitutionConnectionVerificationEvent[];
  sourceReadiness: SideraInstitutionSourceReadiness[];
  updatedAtMs: number;
};

export type SideraInstitutionBrowserEntry = "blank" | "library-home" | "database-sso";

export type SideraInstitutionBrowserContext = {
  institutionId?: SideraInstitutionId | null;
  source?: string | null;
  adapterId?: string | null;
  query?: string | null;
  resultId?: string | null;
  resultTitle?: string | null;
};

export type SideraInstitutionBrowserTab = {
  id: string;
  label: string;
  title: string;
  address: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  code: string;
  context?: SideraInstitutionBrowserContext | null;
  createdAtMs: number;
  updatedAtMs: number;
};

export type SideraInstitutionPopupPhase =
  | "transient"
  | "interactive"
  | "stable-content"
  | "authentication"
  | "closed"
  | "failed";

export type SideraInstitutionPopupState = {
  popupId: string;
  openerTabId: string;
  generation: number;
  createdAtMs: number;
  location: { origin: string; path: string };
  phase: SideraInstitutionPopupPhase;
  disposition: "managed-popup" | "transient-bridge" | "auth-modal";
  resolution:
    | "pending"
    | "retain-popup"
    | "migrate-safe-get"
    | "close-duplicate"
    | "closed"
    | "failed";
  code: string;
};

export type SideraInstitutionDownloadStatus =
  | "downloading"
  | "cancel-requested"
  | "complete"
  | "failed"
  | "cancelled";

export type SideraInstitutionDownloadProvenance = {
  profileId: string;
  tabId: string;
  sourceTitle?: string | null;
  safeSourceUrl: string;
  institutionId?: string | null;
  source?: string | null;
  adapterId?: string | null;
  query?: string | null;
  resultId?: string | null;
  resultTitle?: string | null;
};

export type SideraInstitutionDownloadRecord = {
  id: string;
  status: SideraInstitutionDownloadStatus;
  fileName: string;
  filePath: string;
  manifestPath: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  sha256?: string | null;
  retryable: boolean;
  code: string;
  message: string;
  provenance: SideraInstitutionDownloadProvenance;
  createdAtMs: number;
  updatedAtMs: number;
  finishedAtMs?: number | null;
};

export type SideraInstitutionBrowserState = {
  profileId: string;
  tabs: SideraInstitutionBrowserTab[];
  activeTabId?: string | null;
  visible: boolean;
  authModalVisible: boolean;
  authModalAddress?: string | null;
  popups: SideraInstitutionPopupState[];
  downloads: SideraInstitutionDownloadRecord[];
  updatedAtMs: number;
};

export type SideraInstitutionSearchStatus =
  | "idle"
  | "searching"
  | "complete"
  | "partial"
  | "cancelled"
  | "failed";
export type SideraInstitutionSearchStage =
  | "idle"
  | "opening-web-result"
  | "web-result-available"
  | "awaiting-auth"
  | "resuming-after-auth"
  | "facet-processing"
  | "extracting"
  | "native-snapshot-complete"
  | "filter-unconfirmed"
  | "adapter-drift"
  | "cancelled"
  | "failed";

export const SIDERA_INSTITUTION_ACADEMIC_ADAPTER_ID = "whu-academic-discovery-v1" as const;
export const SIDERA_RESEARCH_ACADEMIC_CONNECTOR_ID = "whu-academic-discovery-v2" as const;
export const SIDERA_INSTITUTION_CATALOG_ADAPTER_ID = "whu-opac-catalog-v3" as const;

export type SideraResearchSearchStatus =
  | "idle"
  | "checking-session"
  | "awaiting-user-auth"
  | "resolving-connectors"
  | "searching"
  | "normalizing"
  | "complete"
  | "partial"
  | "failed"
  | "cancelled";

export type SideraResearchSearchTransport =
  | "structured-api"
  | "session-web-request"
  | "dom-fallback";

export type SideraResearchSearchRequest = {
  institutionId: string;
  connectorIds: string[];
  query: string;
  filters: {
    recordKinds: SideraInstitutionRecordKind[];
    yearFrom?: number | null;
    yearTo?: number | null;
    fullTextOnly: boolean;
  };
  cursor?: string | null;
  pageSize: number;
  maxPages: number;
  timeoutMs: number;
  resultLimit: 40 | 100;
};

export type SideraResearchRetrievalPosition = {
  connectorId: string;
  rank: number;
  page: number;
  position: number;
  facet?: string | null;
  basis: "observed" | "synthesized";
};

export type SideraResearchCandidateFieldProvenance = {
  connectorId: string;
  connectorVersion: string;
  sourceId: string;
  sourceField: string;
};

export type SideraNormalizedCandidateDraft = {
  id: string;
  title: string;
  authors: string[];
  firstAuthor?: string | null;
  year?: number | null;
  doi?: string | null;
  sourceDatabase: string;
  sourceIds: string[];
  providerRecordId?: string | null;
  venue?: string | null;
  journal?: string | null;
  conference?: string | null;
  degreeInstitution?: string | null;
  volume?: string | null;
  issue?: string | null;
  pages?: string | null;
  abstractText?: string | null;
  recordKind: SideraInstitutionRecordKind;
  fullTextStatus: SideraInstitutionFullTextStatus;
  fullTextRoute: SideraInstitutionFullTextRoute;
  detailLocator?: string | null;
  fullTextLocator?: string | null;
  connectorIds: string[];
  producerVersions: string[];
  fieldProvenance: Record<string, SideraResearchCandidateFieldProvenance>;
  retrievalPosition: SideraResearchRetrievalPosition;
};

export type SideraResearchSearchCompletionReason =
  | "in-progress"
  | "result-limit"
  | "page-limit"
  | "timeout"
  | "explicit-zero-results"
  | "source-exhausted"
  | "partial-failure";

export type SideraResearchSearchProviderBreakdown = {
  providerId: string;
  providerName: string;
  recordsReceived: number;
  recordsAccepted: number;
};

export type SideraResearchSearchSourceReport = {
  connectorId: string;
  sourceId: string;
  sourceName: string;
  status: "complete" | "partial" | "failed";
  transport?: SideraResearchSearchTransport | null;
  observedTransport?: SideraResearchSearchTransport | null;
  connectorVersion?: string | null;
  pagesScanned: number;
  recordsReceived: number;
  recordsAccepted: number;
  excludedNonPaper: number;
  excludedUnknown: number;
  excludedInvalid: number;
  explicitZeroResults: boolean;
  providerBreakdown: SideraResearchSearchProviderBreakdown[];
  totalHits?: number | null;
  hasMore?: boolean | null;
  completionReason: SideraResearchSearchCompletionReason;
  code: string;
  message: string;
};

export type SideraResearchSearchTruth = {
  resultLimit: 40 | 100;
  /** @deprecated Compatibility mirror of targetReached. */
  limitReached: boolean;
  targetReached: boolean;
  hasMore: boolean | null;
  pagesScanned: number;
  recordsReceived: number;
  recordsAccepted: number;
  duplicatesMerged: number;
  totalHits?: number | null;
  coverage: number;
  completionReason: SideraResearchSearchCompletionReason;
  orderBasis: "source-return-order";
};

export type SideraResearchSearchRun = {
  taskId: string;
  epoch: number;
  sequence: number;
  request: SideraResearchSearchRequest;
  status: SideraResearchSearchStatus;
  candidates: SideraNormalizedCandidateDraft[];
  sourceReports: SideraResearchSearchSourceReport[];
  truth: SideraResearchSearchTruth;
  code: string;
  message: string;
  startedAtMs: number;
  updatedAtMs: number;
  finishedAtMs?: number | null;
};

/**
 * Backward-compatible name for a single research-search run. New UI code
 * should consume SideraResearchSearchState so a failed retry cannot replace a
 * previously promoted result.
 */
export type SideraResearchSearchSnapshot = SideraResearchSearchRun;

export type SideraResearchSearchStartReason =
  | "user-search"
  | "retry"
  | "compatibility";

export type SideraResearchSearchFilters = {
  recordKinds: Array<"journal-article" | "conference-paper" | "thesis">;
  yearFrom?: number | null;
  yearTo?: number | null;
  fullTextOnly: boolean;
};

export type SideraResearchSearchAttempt = SideraResearchSearchRun & {
  clientRequestId: string;
  startReason: SideraResearchSearchStartReason;
  webviewGeneration: number;
  authContext: {
    goal: "discovery-fulltext";
    phase: "awaiting-user" | "verifying" | "refreshing-parent" | "resuming";
    /** Opaque idempotency identity; never contains a query or navigation URL. */
    searchId: string;
  } | null;
};

export type SideraResearchSearchFailure = {
  taskId: string;
  clientRequestId: string;
  query: string;
  status: "failed" | "cancelled";
  code: string;
  message: string;
  failedAtMs: number;
  terminalSnapshot: SideraResearchSearchRun;
};

export type SideraResearchSearchLifecycleEvent = {
  kind:
    | "started"
    | "progress"
    | "promoted"
    | "failed"
    | "cancelled"
    | "stale-callback-dropped"
    | "idempotent-replay";
  taskId?: string | null;
  clientRequestId?: string | null;
  epoch: number;
  sequence: number;
  webviewGeneration: number;
  code: string;
  atMs: number;
};

export type SideraResearchSearchState = {
  displayedSnapshot: SideraResearchSearchRun | null;
  activeAttempt: SideraResearchSearchAttempt | null;
  lastFailure: SideraResearchSearchFailure | null;
  lifecycle: SideraResearchSearchLifecycleEvent[];
};

export type SideraResearchSearchEventCursor = {
  taskId: string;
  epoch: number;
  sequence: number;
};

export function sideraResearchSearchStateCursor(
  state: SideraResearchSearchState,
): SideraResearchSearchEventCursor | null {
  const lifecycle = state.lifecycle.at(-1);
  if (lifecycle?.taskId) {
    return {
      taskId: lifecycle.taskId,
      epoch: lifecycle.epoch,
      sequence: lifecycle.sequence,
    };
  }
  const run = state.activeAttempt ?? state.displayedSnapshot;
  return run ? { taskId: run.taskId, epoch: run.epoch, sequence: run.sequence } : null;
}

export function shouldAcceptSideraResearchSearchState(
  current: SideraResearchSearchEventCursor | null,
  next: SideraResearchSearchState,
) {
  const cursor = sideraResearchSearchStateCursor(next);
  if (!cursor) return current === null;
  if (!current) return true;
  if (cursor.epoch !== current.epoch) return cursor.epoch > current.epoch;
  if (cursor.sequence !== current.sequence) return cursor.sequence > current.sequence;
  return cursor.taskId === current.taskId;
}

export type SideraInstitutionSearchProvenance = {
  institutionId: SideraInstitutionId;
  adapterId: SideraInstitutionAdapterId;
  sourceBuckets: string[];
  sourceHost?: string | null;
  extractedAtMs: number;
};

export type SideraInstitutionSearchItem = {
  id: string;
  title: string;
  authors?: string | null;
  year?: number | null;
  publication?: string | null;
  sourceBucket: string;
  sourceBuckets: string[];
  documentType?: string | null;
  doi?: string | null;
  abstractSnippet?: string | null;
  availability?: string | null;
  recordKind: SideraInstitutionRecordKind;
  journal?: string | null;
  conference?: string | null;
  degreeInstitution?: string | null;
  volume?: string | null;
  issue?: string | null;
  pages?: string | null;
  sourceProvider?: string | null;
  fullTextStatus: SideraInstitutionFullTextStatus;
  fullTextRoute: SideraInstitutionFullTextRoute;
  detailLocator: string;
  fullTextLocator?: string | null;
  provenance: SideraInstitutionSearchProvenance;
};

export type SideraInstitutionSourceBucket = {
  id: string;
  label: string;
  count?: number | null;
  returned: number;
  status: "complete" | "failed";
  code?: string | null;
};

export type SideraInstitutionSearchSnapshot = {
  institutionId: SideraInstitutionId;
  adapterId: SideraInstitutionAdapterId;
  source: SideraInstitutionSearchSource;
  taskId?: string | null;
  epoch: number;
  sequence: number;
  query: string;
  status: SideraInstitutionSearchStatus;
  stage: SideraInstitutionSearchStage;
  sourceBuckets: SideraInstitutionSourceBucket[];
  items: SideraInstitutionSearchItem[];
  code: string;
  message: string;
  startedAtMs?: number | null;
  updatedAtMs: number;
  finishedAtMs?: number | null;
};

export type SideraInstitutionSearchEventCursor = {
  epoch: number;
  sequence: number;
};

export function sideraInstitutionSearchStreamKey(
  snapshot: Pick<SideraInstitutionSearchSnapshot, "source" | "adapterId">,
) {
  return `${snapshot.source}:${snapshot.adapterId}`;
}

export function shouldAcceptSideraInstitutionSearchEvent(
  cursor: SideraInstitutionSearchEventCursor | undefined,
  next: Pick<SideraInstitutionSearchSnapshot, "epoch" | "sequence">,
) {
  if (!cursor) return true;
  if (next.epoch !== cursor.epoch) return next.epoch > cursor.epoch;
  return next.sequence >= cursor.sequence;
}

export async function probeSideraInstitution(
  institutionId: SideraInstitutionId = "whu",
) {
  if (!isTauri()) {
    throw new Error("机构资源检测仅可在 Sidera 桌面版中使用。");
  }
  return invoke<SideraInstitutionProbeResult>("sidera_institution_probe", {
    input: { institutionId },
  });
}

function requireDesktop() {
  if (!isTauri()) throw new Error("机构资源仅可在 Sidera 桌面版中使用。");
}

export async function ensureSideraInstitutionSession(
  institutionId: SideraInstitutionId = "whu",
  authKind: SideraInstitutionAuthKind = "database-sso",
) {
  requireDesktop();
  return invoke<SideraInstitutionSessionState>("sidera_institution_session_ensure", {
    input: { institutionId, authKind },
  });
}

export async function restoreSideraInstitutionSession(
  institutionId: SideraInstitutionId = "whu",
) {
  requireDesktop();
  return invoke<SideraInstitutionSessionState>("sidera_institution_session_restore", {
    input: { institutionId },
  });
}

export async function cancelSideraInstitutionSessionRestore(
  institutionId: SideraInstitutionId = "whu",
) {
  requireDesktop();
  return invoke<SideraInstitutionSessionState>("sidera_institution_session_restore_cancel", {
    input: { institutionId },
  });
}

export async function beginSideraInstitutionConnection(
  goal: SideraInstitutionConnectionGoal,
  institutionId: SideraInstitutionId = "whu",
) {
  requireDesktop();
  return invoke<SideraInstitutionSessionState>("sidera_institution_connection_begin", {
    input: { institutionId, goal },
  });
}

export async function cancelSideraInstitutionConnection(
  transactionId?: string | null,
  institutionId: SideraInstitutionId = "whu",
) {
  requireDesktop();
  return invoke<SideraInstitutionSessionState>("sidera_institution_connection_cancel", {
    input: { institutionId, ...(transactionId ? { transactionId } : {}) },
  });
}

export async function cancelSideraInstitutionAuth(
  authKind: SideraInstitutionAuthKind = "library-account",
  institutionId: SideraInstitutionId = "whu",
) {
  requireDesktop();
  return invoke<SideraInstitutionSessionState>("sidera_institution_auth_cancel", {
    input: { institutionId, authKind },
  });
}

export async function getSideraInstitutionSessionState(
  institutionId: SideraInstitutionId = "whu",
) {
  requireDesktop();
  return invoke<SideraInstitutionSessionState>("sidera_institution_session_state", {
    input: { institutionId },
  });
}

export async function setSideraInstitutionBrowserBounds(input: {
  institutionId?: SideraInstitutionId;
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  requireDesktop();
  return invoke<{ ok: boolean; code: string }>("sidera_institution_browser_set_bounds", {
    input: { ...input, institutionId: input.institutionId ?? "whu" },
  });
}

export async function setSideraInstitutionBrowserVisible(
  visible: boolean,
  institutionId: SideraInstitutionId = "whu",
) {
  requireDesktop();
  return invoke<SideraInstitutionSessionState>("sidera_institution_browser_set_visible", {
    input: { institutionId, visible },
  });
}

export async function ensureSideraInstitutionBrowser(
  entry?: SideraInstitutionBrowserEntry,
  institutionId: SideraInstitutionId = "whu",
) {
  requireDesktop();
  return invoke<SideraInstitutionBrowserState>("sidera_institution_browser_ensure", {
    input: { institutionId, ...(entry ? { entry } : {}) },
  });
}

export async function getSideraInstitutionBrowserState(
  institutionId: SideraInstitutionId = "whu",
) {
  requireDesktop();
  return invoke<SideraInstitutionBrowserState>("sidera_institution_browser_state", {
    input: { institutionId },
  });
}

export async function createSideraInstitutionBrowserTab(
  address?: string,
  institutionId: SideraInstitutionId = "whu",
) {
  requireDesktop();
  return invoke<SideraInstitutionBrowserState>("sidera_institution_browser_tab_new", {
    input: { institutionId, ...(address ? { address } : {}) },
  });
}

export async function selectSideraInstitutionBrowserTab(
  tabId: string,
  institutionId: SideraInstitutionId = "whu",
) {
  requireDesktop();
  return invoke<SideraInstitutionBrowserState>("sidera_institution_browser_tab_select", {
    input: { institutionId, tabId },
  });
}

export async function closeSideraInstitutionBrowserTab(
  tabId: string,
  institutionId: SideraInstitutionId = "whu",
) {
  requireDesktop();
  return invoke<SideraInstitutionBrowserState>("sidera_institution_browser_tab_close", {
    input: { institutionId, tabId },
  });
}

export async function navigateSideraInstitutionBrowserTab(input: {
  tabId: string;
  address: string;
  context?: SideraInstitutionBrowserContext | null;
  institutionId?: SideraInstitutionId;
}) {
  requireDesktop();
  return invoke<SideraInstitutionBrowserState>("sidera_institution_browser_navigate", {
    input: {
      institutionId: input.institutionId ?? "whu",
      tabId: input.tabId,
      address: input.address,
      context: input.context ?? null,
    },
  });
}

async function runSideraInstitutionBrowserTabAction(
  command: string,
  tabId: string,
  institutionId: SideraInstitutionId = "whu",
) {
  requireDesktop();
  return invoke<SideraInstitutionBrowserState>(command, {
    input: { institutionId, tabId },
  });
}

export const goBackSideraInstitutionBrowser = (tabId: string) =>
  runSideraInstitutionBrowserTabAction("sidera_institution_browser_back", tabId);
export const goForwardSideraInstitutionBrowser = (tabId: string) =>
  runSideraInstitutionBrowserTabAction("sidera_institution_browser_forward", tabId);
export const reloadSideraInstitutionBrowser = (tabId: string) =>
  runSideraInstitutionBrowserTabAction("sidera_institution_browser_reload", tabId);
export const stopSideraInstitutionBrowser = (tabId: string) =>
  runSideraInstitutionBrowserTabAction("sidera_institution_browser_stop", tabId);

export async function setSideraInstitutionBrowserShellBounds(input: {
  institutionId?: SideraInstitutionId;
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  requireDesktop();
  return invoke<SideraInstitutionBrowserState>("sidera_institution_browser_shell_set_bounds", {
    input: { ...input, institutionId: input.institutionId ?? "whu" },
  });
}

let institutionBrowserVisibilityClientRequestId = Date.now() * 1_000;

function nextInstitutionBrowserVisibilityClientRequestId() {
  institutionBrowserVisibilityClientRequestId = Math.max(
    institutionBrowserVisibilityClientRequestId + 1,
    Date.now() * 1_000,
  );
  return institutionBrowserVisibilityClientRequestId;
}

export async function setSideraInstitutionBrowserShellVisible(
  visible: boolean,
  institutionId: SideraInstitutionId = "whu",
) {
  requireDesktop();
  const clientRequestId = nextInstitutionBrowserVisibilityClientRequestId();
  return invoke<SideraInstitutionBrowserState>("sidera_institution_browser_shell_set_visible", {
    input: { institutionId, visible, clientRequestId },
  });
}

export async function cancelSideraInstitutionBrowserAuth(
  institutionId: SideraInstitutionId = "whu",
) {
  requireDesktop();
  return invoke<SideraInstitutionBrowserState>("sidera_institution_browser_auth_cancel", {
    input: { institutionId },
  });
}

export async function resetSideraInstitutionBrowser(
  institutionId: SideraInstitutionId = "whu",
) {
  requireDesktop();
  return invoke<SideraInstitutionBrowserState>("sidera_institution_browser_reset", {
    input: { institutionId },
  });
}

export async function listSideraInstitutionDownloads(
  institutionId: SideraInstitutionId = "whu",
) {
  requireDesktop();
  return invoke<SideraInstitutionDownloadRecord[]>("sidera_institution_download_list", {
    input: { institutionId },
  });
}

async function runSideraInstitutionDownloadAction(
  command: string,
  downloadId: string,
  institutionId: SideraInstitutionId = "whu",
) {
  requireDesktop();
  return invoke<SideraInstitutionDownloadRecord>(command, {
    input: { institutionId, downloadId },
  });
}

export const cancelSideraInstitutionDownload = (downloadId: string) =>
  runSideraInstitutionDownloadAction("sidera_institution_download_cancel", downloadId);
export const openSideraInstitutionDownload = (downloadId: string) =>
  runSideraInstitutionDownloadAction("sidera_institution_download_open", downloadId);
export const revealSideraInstitutionDownload = (downloadId: string) =>
  runSideraInstitutionDownloadAction("sidera_institution_download_reveal", downloadId);

export async function retrySideraInstitutionDownload(
  downloadId: string,
  institutionId: SideraInstitutionId = "whu",
) {
  requireDesktop();
  return invoke<SideraInstitutionBrowserState>("sidera_institution_download_retry", {
    input: { institutionId, downloadId },
  });
}

export async function openSideraInstitutionCurrentSource(
  institutionId: SideraInstitutionId = "whu",
) {
  requireDesktop();
  return invoke<{ ok: boolean; code: string }>("sidera_institution_open_current_source", {
    input: { institutionId },
  });
}

export async function startSideraInstitutionSearch(
  query: string,
  source: SideraInstitutionSearchSource = "academic-discovery",
  institutionId: SideraInstitutionId = "whu",
) {
  requireDesktop();
  return invoke<SideraInstitutionSearchSnapshot>("sidera_institution_search_start", {
    input: { institutionId, query, source },
  });
}

export async function cancelSideraInstitutionSearch(
  taskId?: string | null,
  institutionId: SideraInstitutionId = "whu",
) {
  requireDesktop();
  return invoke<SideraInstitutionSearchSnapshot>("sidera_institution_search_cancel", {
    input: { institutionId, taskId: taskId ?? null },
  });
}

export async function openSideraInstitutionResult(input: {
  resultId: string;
  mode?: "embedded" | "system";
  source?: SideraInstitutionSearchSource;
  target?: "record" | "full-text";
  institutionId?: SideraInstitutionId;
}) {
  requireDesktop();
  return invoke<{ ok: boolean; code: string }>("sidera_institution_result_open", {
    input: {
      institutionId: input.institutionId ?? "whu",
      resultId: input.resultId,
      mode: input.mode ?? "embedded",
      source: input.source ?? "academic-discovery",
      target: input.target ?? "record",
    },
  });
}

export async function resetSideraInstitutionSession(
  institutionId: SideraInstitutionId = "whu",
) {
  requireDesktop();
  return invoke<SideraInstitutionSessionState>("sidera_institution_session_reset", {
    input: { institutionId },
  });
}

export async function listenSideraInstitutionSearch(
  handler: (snapshot: SideraInstitutionSearchSnapshot) => void,
): Promise<UnlistenFn> {
  return listen<SideraInstitutionSearchSnapshot>("sidera-institution-search", (event) => {
    handler(event.payload);
  });
}

/**
 * Starts the UI-independent research-search service. The UI may provide only
 * user-facing filters and a bounded 40/100 result target. Connector selection,
 * remote pagination and the 90-second safety deadline remain Rust-owned.
 */
export async function startSideraResearchSearch(input: {
  query: string;
  clientRequestId: string;
  startReason: SideraResearchSearchStartReason;
  filters: SideraResearchSearchFilters;
  resultLimit: 40 | 100;
}) {
  requireDesktop();
  return invoke<SideraResearchSearchState>("sidera_research_search_start", {
    input,
  });
}

export async function cancelSideraResearchSearch(taskId?: string | null) {
  requireDesktop();
  return invoke<SideraResearchSearchState>("sidera_research_search_cancel", {
    input: { taskId: taskId ?? null },
  });
}

export async function getSideraResearchSearchState(taskId?: string | null) {
  requireDesktop();
  return invoke<SideraResearchSearchState>("sidera_research_search_snapshot", {
    input: { taskId: taskId ?? null },
  });
}

export const getSideraResearchSearchSnapshot = getSideraResearchSearchState;

export async function openSideraResearchResult(input: {
  candidateId: string;
  target?: "record" | "full-text";
  mode?: "embedded" | "system";
}) {
  requireDesktop();
  return invoke<{ ok: boolean; code: string }>("sidera_research_result_open", {
    input: {
      candidateId: input.candidateId,
      target: input.target ?? "record",
      mode: input.mode ?? "embedded",
    },
  });
}

export async function listenSideraResearchSearch(
  handler: (state: SideraResearchSearchState) => void,
): Promise<UnlistenFn> {
  return listen<SideraResearchSearchState>("sidera-research-search", (event) => {
    handler(event.payload);
  });
}

export async function listenSideraInstitutionSession(
  handler: (state: SideraInstitutionSessionState) => void,
): Promise<UnlistenFn> {
  return listen<SideraInstitutionSessionState>("sidera-institution-session", (event) => {
    handler(event.payload);
  });
}

export async function listenSideraInstitutionBrowser(
  handler: (state: SideraInstitutionBrowserState) => void,
): Promise<UnlistenFn> {
  return listen<SideraInstitutionBrowserState>("sidera-institution-browser", (event) => {
    handler(event.payload);
  });
}

export async function listenSideraInstitutionDownloads(
  handler: (record: SideraInstitutionDownloadRecord) => void,
): Promise<UnlistenFn> {
  return listen<SideraInstitutionDownloadRecord>("sidera-institution-download", (event) => {
    handler(event.payload);
  });
}
