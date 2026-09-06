export type DocumentParseState =
  | "queued"
  | "running"
  | "ready"
  | "needs-ocr"
  | "failed"
  | "cancelled"
  | "stale";

export type DocumentPageRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DocumentTextSourceKind = "native" | "ocr";

export type DocumentPageTextSpan = {
  text: string;
  startOffsetUtf16: number;
  endOffsetUtf16: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DocumentPageText = {
  documentVersionId: string;
  documentSha256: string;
  pageIndex: number;
  pageLabel: string;
  sourceKind: DocumentTextSourceKind;
  text: string;
  textSha256: string;
  textLengthUtf16: number;
  spans: DocumentPageTextSpan[];
};

export type DocumentEvidenceAnchor = {
  id: string;
  documentVersionId: string;
  documentSha256: string;
  pageIndex: number;
  pageLabel: string;
  sourceKind: DocumentTextSourceKind;
  startOffsetUtf16: number;
  endOffsetUtf16: number;
  quote: string;
  quoteSha256: string;
  prefix: string;
  suffix: string;
  rects: DocumentPageRect[];
};

export type SideraReadingContextScope = {
  kind: "selected-anchor" | "current-page" | "document-retrieval";
  paperId: string;
  documentVersionId: string;
  pageIndex?: number;
  anchor?: DocumentEvidenceAnchor;
};

export type DocumentAnnotationKind = "highlight" | "note";
export type DocumentAnnotationColor = "yellow" | "blue" | "green" | "rose";
export type DocumentEvidenceStatus = "active" | "orphaned";
export type DocumentEvidenceResolution = "exact" | "reanchored" | "ambiguous" | "missing";

export type DocumentAnnotation = {
  id: string;
  projectId: string;
  paperId: string;
  documentVersionId: string;
  documentSha256: string;
  kind: DocumentAnnotationKind;
  colorToken: DocumentAnnotationColor;
  noteText?: string | null;
  anchor: DocumentEvidenceAnchor;
  resolution: DocumentEvidenceResolution;
  resolvedAnchor?: DocumentEvidenceAnchor | null;
  status: DocumentEvidenceStatus;
  createdAtMs: number;
  updatedAtMs: number;
};

export type DocumentSavedEvidence = {
  id: string;
  projectId: string;
  paperId: string;
  documentVersionId: string;
  documentSha256: string;
  label?: string | null;
  noteText?: string | null;
  anchor: DocumentEvidenceAnchor;
  resolution: DocumentEvidenceResolution;
  resolvedAnchor?: DocumentEvidenceAnchor | null;
  status: DocumentEvidenceStatus;
  createdAtMs: number;
  updatedAtMs: number;
};

export type DocumentTextSourcePreference = "auto" | DocumentTextSourceKind;

export type DocumentSourcePreference = {
  documentVersionId: string;
  pageIndex?: number | null;
  preference: DocumentTextSourcePreference;
  updatedAtMs: number;
};

export type DocumentPageAnchor = {
  id: string;
  documentVersionId: string;
  pageNumber: number;
  startOffset: number;
  endOffset: number;
  quote: string;
  rects: DocumentPageRect[];
};

export type DocumentSearchHit = {
  anchor: DocumentPageAnchor;
  score: number;
  excerpt: string;
};

export type DocumentIndexMode = "auto" | "lexical" | "hybrid";
export type DocumentIndexResolvedMode = Exclude<DocumentIndexMode, "auto">;
export type DocumentIndexState =
  | "queued"
  | "running"
  | "paused"
  | "ready"
  | "failed"
  | "cancelled"
  | "superseded";

export type DocumentIndexSnapshot = {
  jobId: string;
  documentVersionId: string;
  requestedMode: DocumentIndexMode;
  resolvedMode?: DocumentIndexResolvedMode | null;
  state: DocumentIndexState;
  stage: "segmenting" | "embedding" | "complete";
  segmentCount: number;
  embeddedCount: number;
  fallbackReason?: string | null;
  errorCode?: string | null;
};

export type DocumentIndexSearchResult = {
  jobId: string;
  requestedMode: DocumentIndexMode;
  resolvedMode: DocumentIndexResolvedMode;
  fallbackReason?: string | null;
  hits: DocumentSearchHit[];
};

export type DocumentOcrState =
  | "awaiting-upload"
  | "queued"
  | "running"
  | "ready"
  | "failed"
  | "cancelled"
  | "superseded";

export type DocumentOcrCapability = {
  installed: boolean;
  modelId: string;
  modelRevision: string;
  executionProvider: string;
  maxBatchPages: number;
  unavailableCode?: string | null;
};

export type DocumentOcrSnapshot = {
  jobId: string;
  documentVersionId: string;
  pageIndex: number;
  state: DocumentOcrState;
  modelId: string;
  modelRevision: string;
  meanConfidence?: number | null;
  errorCode?: string | null;
  updatedAtMs: number;
  finishedAtMs?: number | null;
};

export type DocumentReaderVersion = {
  id: string;
  versionKind: string;
  label: string;
  sha256: string;
  byteSize: number;
  createdAtMs: number;
  parseState: DocumentParseState;
};

export type DocumentReaderPage = {
  pageNumber: number;
  pageLabel: string;
  width: number;
  height: number;
  textAvailable: boolean;
};

export type DocumentReaderManifest = {
  projectId: string;
  paperId: string;
  documentId: string;
  documentVersionId: string;
  title: string;
  contentUri: string;
  pageCount: number;
  parserVersion?: string;
  parseState: DocumentParseState;
  parseMessage?: string;
  pages: DocumentReaderPage[];
  versions: DocumentReaderVersion[];
};

export type DocumentReaderState = {
  documentVersionId: string;
  pageNumber: number;
  scrollOffset: number;
  scale: number;
  updatedAtMs: number;
};

export type DocumentParseSnapshot = {
  documentVersionId: string;
  runId?: string;
  state: DocumentParseState;
  pagesProcessed: number;
  pageCount: number;
  message?: string;
  errorCode?: string;
};

export type DocumentReaderAcquisition = {
  id: string;
  kind: string;
  status: string;
  stage: string;
  originLabel?: string;
  errorCode?: string;
  retryable: boolean;
  createdAtMs: number;
};

export type DocumentReaderDetails = {
  acquisitions: DocumentReaderAcquisition[];
};

export type DocumentReaderTarget = {
  databaseDir?: string;
  projectId: string;
  paperId: string;
  versionId?: string;
};

export type DocumentReaderService = {
  loadManifest: (input: DocumentReaderTarget, signal?: AbortSignal) => Promise<DocumentReaderManifest>;
  loadState: (
    input: DocumentReaderTarget & { versionId: string },
    signal?: AbortSignal,
  ) => Promise<DocumentReaderState | undefined>;
  saveState: (
    input: DocumentReaderTarget & { versionId: string; state: DocumentReaderState },
  ) => Promise<void>;
  search: (
    input: DocumentReaderTarget & { versionId: string; query: string; limit?: number },
    signal?: AbortSignal,
  ) => Promise<DocumentSearchHit[]>;
  searchIndex?: (
    input: DocumentReaderTarget & {
      versionId: string;
      query: string;
      mode: DocumentIndexMode;
      limit?: number;
    },
    signal?: AbortSignal,
  ) => Promise<DocumentIndexSearchResult>;
  startIndex?: (
    input: DocumentReaderTarget & { versionId: string; mode: DocumentIndexMode },
  ) => Promise<DocumentIndexSnapshot>;
  currentIndex?: (
    input: DocumentReaderTarget & { versionId: string },
    signal?: AbortSignal,
  ) => Promise<DocumentIndexSnapshot | undefined>;
  loadIndexSnapshot?: (
    input: DocumentReaderTarget & { versionId: string; jobId: string },
    signal?: AbortSignal,
  ) => Promise<DocumentIndexSnapshot>;
  pauseIndex?: (
    input: DocumentReaderTarget & { versionId: string; jobId: string },
  ) => Promise<DocumentIndexSnapshot>;
  resumeIndex?: (
    input: DocumentReaderTarget & { versionId: string; jobId: string },
  ) => Promise<DocumentIndexSnapshot>;
  cancelIndex?: (
    input: DocumentReaderTarget & { versionId: string; jobId: string },
  ) => Promise<DocumentIndexSnapshot>;
  loadPageText: (
    input: DocumentReaderTarget & { versionId: string; pageIndex: number },
    signal?: AbortSignal,
  ) => Promise<DocumentPageText>;
  listAnnotations: (
    input: DocumentReaderTarget & { versionId: string },
    signal?: AbortSignal,
  ) => Promise<DocumentAnnotation[]>;
  saveAnnotation: (
    input: DocumentReaderTarget & {
      versionId: string;
      annotationId: string;
      kind: DocumentAnnotationKind;
      colorToken: DocumentAnnotationColor;
      noteText?: string;
      anchor: DocumentEvidenceAnchor;
    },
  ) => Promise<DocumentAnnotation>;
  deleteAnnotation: (
    input: DocumentReaderTarget & { versionId: string; annotationId: string },
  ) => Promise<boolean>;
  listSavedEvidence: (
    input: DocumentReaderTarget & { versionId: string },
    signal?: AbortSignal,
  ) => Promise<DocumentSavedEvidence[]>;
  saveEvidence: (
    input: DocumentReaderTarget & {
      versionId: string;
      evidenceId: string;
      label?: string;
      noteText?: string;
      anchor: DocumentEvidenceAnchor;
    },
  ) => Promise<DocumentSavedEvidence>;
  deleteEvidence: (
    input: DocumentReaderTarget & { versionId: string; evidenceId: string },
  ) => Promise<boolean>;
  loadSourcePreference: (
    input: DocumentReaderTarget & { versionId: string; pageIndex?: number },
    signal?: AbortSignal,
  ) => Promise<DocumentSourcePreference | undefined>;
  saveSourcePreference: (
    input: DocumentReaderTarget & {
      versionId: string;
      pageIndex?: number;
      preference: DocumentTextSourcePreference;
    },
  ) => Promise<DocumentSourcePreference>;
  loadOcrCapability?: (signal?: AbortSignal) => Promise<DocumentOcrCapability>;
  startOcr?: (
    input: DocumentReaderTarget & { versionId: string; pageIndex: number; png: Blob },
  ) => Promise<DocumentOcrSnapshot>;
  loadCurrentOcr?: (
    input: DocumentReaderTarget & { versionId: string; pageIndex: number },
    signal?: AbortSignal,
  ) => Promise<DocumentOcrSnapshot | undefined>;
  loadOcrSnapshot?: (
    input: DocumentReaderTarget & { versionId: string; jobId: string },
    signal?: AbortSignal,
  ) => Promise<DocumentOcrSnapshot>;
  cancelOcr?: (
    input: DocumentReaderTarget & { versionId: string; jobId: string },
  ) => Promise<DocumentOcrSnapshot>;
  startParse: (
    input: DocumentReaderTarget & { versionId: string },
  ) => Promise<DocumentParseSnapshot>;
  loadParseSnapshot: (
    input: DocumentReaderTarget & { versionId: string; runId?: string },
    signal?: AbortSignal,
  ) => Promise<DocumentParseSnapshot>;
  cancelParse: (
    input: DocumentReaderTarget & { versionId: string; runId?: string },
  ) => Promise<DocumentParseSnapshot>;
  loadDetails?: (
    input: DocumentReaderTarget & { versionId: string },
    signal?: AbortSignal,
  ) => Promise<DocumentReaderDetails>;
};
