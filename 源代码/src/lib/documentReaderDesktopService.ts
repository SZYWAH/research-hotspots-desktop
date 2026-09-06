import {
  cancelDocumentOcr,
  cancelDocumentIndex,
  cancelDocumentParse,
  deleteDocumentAnnotation,
  deleteDocumentEvidence,
  finalizeDocumentParse,
  getCurrentDocumentIndex,
  getCurrentDocumentOcr,
  getDocumentIndexSnapshot,
  getDocumentOcrCapabilities,
  getDocumentOcrSnapshot,
  getDocumentPageText,
  getDocumentParseSnapshot,
  getDocumentReaderManifest,
  getDocumentReaderState,
  getDocumentSourcePreference,
  getPaperDocumentSnapshot,
  listDocumentAnnotations,
  listDocumentSavedEvidence,
  pauseDocumentIndex,
  saveDocumentReaderState,
  saveDocumentAnnotation,
  saveDocumentEvidence,
  saveDocumentSourcePreference,
  searchDocumentIndex,
  searchDocumentText,
  startDocumentIndex,
  startDocumentOcr,
  startDocumentParse,
  submitDocumentParsePage,
  resumeDocumentIndex,
  type SideraDocumentParseSnapshot,
  type SideraDocumentReaderManifest as DesktopReaderManifest,
} from "./desktop";
import type {
  DocumentIndexSearchResult,
  DocumentParseSnapshot,
  DocumentReaderManifest,
  DocumentReaderService,
  DocumentReaderTarget,
} from "./documentReaderContract";
import {
  createBundledPdfJsAdapter,
  parseWithBundledPdfJs,
  type BundledPdfJsModule,
  type DocumentPdfAdapter,
  type DocumentPdfParseTransport,
} from "./documentPdfJsAdapter";

type ReaderCompositionOptions = {
  loadPdfJs: () => Promise<BundledPdfJsModule>;
  workerUrl: string;
  parserVersion: string;
  resolveTitle?: (paperId: string) => string | undefined;
  onParseError?: (error: Error) => void;
};

type CachedManifest = {
  publicManifest: DocumentReaderManifest;
  desktopManifest: DesktopReaderManifest;
  parseSnapshot?: DocumentParseSnapshot;
};

type ParseFence = {
  runId: string;
  documentSha256: string;
  parserVersion: string;
};

const MANIFEST_CACHE_LIMIT = 8;
const RUN_CACHE_LIMIT = 16;
const ACTIVE_PARSE_LIMIT = 4;

function documentOcrUploadUri(uploadUrl: string) {
  const parsed = new URL(uploadUrl);
  if (
    parsed.protocol !== "sidera-document:"
    || parsed.hostname !== "localhost"
    || !parsed.pathname.startsWith("/ocr-upload/")
    || parsed.search
    || parsed.hash
  ) {
    throw new Error("SIDERA_DOCUMENT_OCR_UPLOAD_URI_INVALID");
  }
  // WebView2 exposes Wry custom protocols through a local HTTP origin for
  // fetch/XHR. The logical scheme remains the cross-platform Rust contract.
  if (/Windows/i.test(navigator.userAgent)) {
    return `http://sidera-document.localhost${parsed.pathname}`;
  }
  return uploadUrl;
}

function lruGet<K, V>(cache: Map<K, V>, key: K) {
  const value = cache.get(key);
  if (value === undefined) return undefined;
  cache.delete(key);
  cache.set(key, value);
  return value;
}

function lruSet<K, V>(cache: Map<K, V>, key: K, value: V, limit: number) {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > limit) {
    const oldest = cache.keys().next().value as K | undefined;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

function targetKey(target: DocumentReaderTarget & { versionId: string }) {
  return [target.databaseDir ?? "", target.projectId, target.paperId, target.versionId].join("\u0000");
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
}

function toPublicParse(snapshot: SideraDocumentParseSnapshot): DocumentParseSnapshot {
  return {
    documentVersionId: snapshot.documentVersionId,
    runId: snapshot.runId,
    state: snapshot.state,
    pagesProcessed: snapshot.pagesCommitted,
    pageCount: snapshot.expectedPageCount,
    message: snapshot.state === "running"
      ? `已解析 ${snapshot.pagesCommitted} / ${snapshot.expectedPageCount} 页`
      : undefined,
    errorCode: snapshot.errorCode,
  };
}

function configurePdfJsWorker(pdfjs: BundledPdfJsModule, workerUrl: string) {
  const value = workerUrl.trim();
  if (!value) throw new Error("SIDERA_DOCUMENT_PDFJS_WORKER_URL_MISSING");
  if (!pdfjs.GlobalWorkerOptions) {
    throw new Error("SIDERA_DOCUMENT_PDFJS_WORKER_OPTIONS_MISSING");
  }
  pdfjs.GlobalWorkerOptions.workerSrc = value;
  return pdfjs;
}

function createLazyPdfAdapter(loadPdfJs: () => Promise<BundledPdfJsModule>): DocumentPdfAdapter {
  return {
    async open(manifest, signal) {
      throwIfAborted(signal);
      const pdfjs = await loadPdfJs();
      throwIfAborted(signal);
      return createBundledPdfJsAdapter(pdfjs).open(manifest, signal);
    },
  };
}

export function createDesktopDocumentReaderComposition(options: ReaderCompositionOptions): {
  service: DocumentReaderService;
  pdfAdapter: DocumentPdfAdapter;
} {
  const manifestCache = new Map<string, CachedManifest>();
  const runFences = new Map<string, ParseFence>();
  const terminalParseSnapshots = new Map<string, DocumentParseSnapshot>();
  const parseControllersByVersion = new Map<string, AbortController>();
  const parseControllersByRun = new Map<string, AbortController>();
  const parseStartRequestsByVersion = new Map<string, Promise<DocumentParseSnapshot>>();
  const cancelRequests = new Map<string, Promise<DocumentParseSnapshot>>();
  let pdfJsRequest: Promise<BundledPdfJsModule> | undefined;
  const loadPdfJs = () => {
    pdfJsRequest ??= options.loadPdfJs()
      .then((module) => configurePdfJsWorker(module, options.workerUrl))
      .catch((error) => {
        pdfJsRequest = undefined;
        throw error;
      });
    return pdfJsRequest;
  };

  const releaseParseController = (controller: AbortController) => {
    for (const [key, current] of parseControllersByVersion) {
      if (current === controller) parseControllersByVersion.delete(key);
    }
    for (const [key, current] of parseControllersByRun) {
      if (current === controller) parseControllersByRun.delete(key);
    }
  };

  const rememberVersionController = (key: string, controller: AbortController) => {
    const existing = parseControllersByVersion.get(key);
    existing?.abort();
    if (existing) releaseParseController(existing);
    while (parseControllersByVersion.size >= ACTIVE_PARSE_LIMIT) {
      const oldest = parseControllersByVersion.values().next().value as AbortController | undefined;
      if (!oldest) break;
      oldest.abort();
      releaseParseController(oldest);
    }
    parseControllersByVersion.set(key, controller);
  };

  const rememberRunController = (runId: string, controller: AbortController) => {
    parseControllersByRun.delete(runId);
    parseControllersByRun.set(runId, controller);
  };

  const toPublicManifest = async (
    raw: DesktopReaderManifest,
    target: DocumentReaderTarget,
    signal?: AbortSignal,
  ): Promise<DocumentReaderManifest> => {
    const documentSnapshot = await getPaperDocumentSnapshot({
      databaseDir: target.databaseDir,
      projectId: target.projectId,
      paperId: target.paperId,
    });
    throwIfAborted(signal);
    const pageCount = raw.parse?.expectedPageCount
      ?? (raw.pages.length > 0 ? Math.max(...raw.pages.map((page) => page.pageIndex)) + 1 : 1);
    const parseState = raw.parse?.state ?? "stale";
    if (raw.parse && (raw.parse.state === "queued" || raw.parse.state === "running")) {
      lruSet(runFences, raw.parse.runId, {
        runId: raw.parse.runId,
        documentSha256: raw.parse.documentSha256,
        parserVersion: raw.parse.parserVersion,
      }, RUN_CACHE_LIMIT);
    }
    return {
      projectId: raw.projectId,
      paperId: raw.paperId,
      documentId: raw.documentId,
      documentVersionId: raw.version.id,
      title: options.resolveTitle?.(raw.paperId) ?? "",
      contentUri: raw.resourceUri,
      pageCount,
      parserVersion: raw.parse?.parserVersion,
      parseState,
      parseMessage: raw.parse?.errorCode,
      pages: raw.pages.map((page) => ({
        pageNumber: page.pageIndex + 1,
        pageLabel: page.pageLabel || String(page.pageIndex + 1),
        width: page.width,
        height: page.height,
        textAvailable: page.textLengthUtf16 > 0,
      })),
      versions: documentSnapshot.versions.map((version) => ({
        id: version.id,
        versionKind: version.versionKind,
        label: version.originalFileName ?? "",
        sha256: version.sha256,
        byteSize: version.byteSize,
        createdAtMs: version.createdAtMs,
        parseState: version.id === raw.version.id ? parseState : "stale",
      })),
    };
  };

  const commonInput = (target: DocumentReaderTarget & { versionId: string }) => ({
    databaseDir: target.databaseDir,
    projectId: target.projectId,
    paperId: target.paperId,
    versionId: target.versionId,
  });

  const rememberTerminalSnapshot = (snapshot: DocumentParseSnapshot) => {
    if (!snapshot.runId) return snapshot;
    lruSet(terminalParseSnapshots, snapshot.runId, snapshot, RUN_CACHE_LIMIT);
    runFences.delete(snapshot.runId);
    cancelRequests.delete(snapshot.runId);
    const controller = parseControllersByRun.get(snapshot.runId);
    if (controller) releaseParseController(controller);
    return snapshot;
  };

  const cancelRun = (
    target: DocumentReaderTarget & { versionId: string },
    fence: ParseFence,
  ) => {
    const terminal = lruGet(terminalParseSnapshots, fence.runId);
    if (terminal) return Promise.resolve(terminal);
    parseControllersByRun.get(fence.runId)?.abort();
    const current = cancelRequests.get(fence.runId);
    if (current) return current;
    const request = cancelDocumentParse({ ...commonInput(target), ...fence })
      .then((next) => rememberTerminalSnapshot(toPublicParse(next)))
      .catch((error) => {
        cancelRequests.delete(fence.runId);
        throw error;
      });
    cancelRequests.set(fence.runId, request);
    return request;
  };

  const parseTransport = (
    target: DocumentReaderTarget & { versionId: string },
  ): DocumentPdfParseTransport => ({
    async start(input) {
      const next = await startDocumentParse({
        ...commonInput(target),
        expectedSha256: input.documentSha256,
        parserVersion: input.parserVersion,
        pageCount: input.pageCount,
      });
      lruSet(runFences, next.runId, {
        runId: next.runId,
        documentSha256: next.documentSha256,
        parserVersion: next.parserVersion,
      }, RUN_CACHE_LIMIT);
      return toPublicParse(next);
    },
    async submitPage(input) {
      await submitDocumentParsePage({
        ...commonInput(target),
        ...input,
      });
    },
    async finalize(input) {
      const next = await finalizeDocumentParse({ ...commonInput(target), ...input });
      return rememberTerminalSnapshot(toPublicParse(next));
    },
    async cancel(input) {
      return cancelRun(target, input);
    },
  });

  const service: DocumentReaderService = {
    async loadManifest(target, signal) {
      let versionId = target.versionId;
      if (!versionId) {
        const snapshot = await getPaperDocumentSnapshot({
          databaseDir: target.databaseDir,
          projectId: target.projectId,
          paperId: target.paperId,
        });
        versionId = snapshot.versions[0]?.id;
      }
      if (!versionId) throw new Error("SIDERA_DOCUMENT_VERSION_REQUIRED");
      const resolvedTarget = { ...target, versionId };
      throwIfAborted(signal);
      const desktopManifest = await getDocumentReaderManifest(commonInput(resolvedTarget));
      throwIfAborted(signal);
      if (!desktopManifest.resourceUri.startsWith("sidera-document://localhost/version/")) {
        throw new Error("SIDERA_DOCUMENT_READER_URI_INVALID");
      }
      const publicManifest = await toPublicManifest(desktopManifest, resolvedTarget, signal);
      lruSet(manifestCache, targetKey(resolvedTarget), {
        desktopManifest,
        publicManifest,
        parseSnapshot: desktopManifest.parse ? toPublicParse(desktopManifest.parse) : undefined,
      }, MANIFEST_CACHE_LIMIT);
      return publicManifest;
    },
    async loadState(target, signal) {
      throwIfAborted(signal);
      const cachedManifest = lruGet(manifestCache, targetKey(target));
      const state = cachedManifest
        ? cachedManifest.desktopManifest.readerState
        : await getDocumentReaderState(commonInput(target));
      throwIfAborted(signal);
      return state ? {
        documentVersionId: state.documentVersionId,
        pageNumber: state.pageIndex + 1,
        scrollOffset: state.scrollOffset,
        scale: state.zoom,
        updatedAtMs: state.updatedAtMs,
      } : undefined;
    },
    async saveState(target) {
      await saveDocumentReaderState({
        ...commonInput(target),
        pageIndex: Math.max(0, target.state.pageNumber - 1),
        scrollOffset: Math.max(0, target.state.scrollOffset),
        zoom: target.state.scale,
      });
    },
    async search(target, signal) {
      throwIfAborted(signal);
      const result = await searchDocumentText({
        ...commonInput(target),
        query: target.query,
        limit: target.limit,
        offset: 0,
      });
      throwIfAborted(signal);
      return result.hits.map((hit, index) => ({
        anchor: {
          id: hit.anchorId ?? `${result.runId}:${hit.pageIndex}:${index}`,
          documentVersionId: target.versionId,
          pageNumber: (hit.anchor?.pageIndex ?? hit.pageIndex) + 1,
          startOffset: hit.anchor?.startOffsetUtf16 ?? 0,
          endOffset: hit.anchor?.endOffsetUtf16 ?? 0,
          quote: hit.anchor?.quote ?? hit.excerpt,
          rects: hit.anchor?.rects ?? [],
        },
        score: hit.score,
        excerpt: hit.excerpt,
      }));
    },
    async searchIndex(target, signal): Promise<DocumentIndexSearchResult> {
      throwIfAborted(signal);
      let result;
      try {
        result = await searchDocumentIndex({
          ...commonInput(target),
          query: target.query,
          requestedMode: target.mode,
          limit: target.limit,
          offset: 0,
        });
      } catch (error) {
        const code = error instanceof Error ? error.message : String(error);
        if (
          (target.mode !== "auto" && target.mode !== "lexical")
          || code !== "SIDERA_DOCUMENT_INDEX_NOT_READY"
        ) throw error;
        const legacy = await searchDocumentText({
          ...commonInput(target),
          query: target.query,
          limit: target.limit,
          offset: 0,
        });
        throwIfAborted(signal);
        return {
          jobId: "lexical-fallback",
          requestedMode: target.mode,
          resolvedMode: "lexical",
          fallbackReason: "SIDERA_DOCUMENT_INDEX_NOT_READY",
          hits: legacy.hits.map((hit, index) => ({
            anchor: {
              id: hit.anchorId ?? `${legacy.runId}:${hit.pageIndex}:${index}`,
              documentVersionId: target.versionId,
              pageNumber: (hit.anchor?.pageIndex ?? hit.pageIndex) + 1,
              startOffset: hit.anchor?.startOffsetUtf16 ?? 0,
              endOffset: hit.anchor?.endOffsetUtf16 ?? 0,
              quote: hit.anchor?.quote ?? hit.excerpt,
              rects: hit.anchor?.rects ?? [],
            },
            score: hit.score,
            excerpt: hit.excerpt,
          })),
        };
      }
      throwIfAborted(signal);
      return {
        jobId: result.jobId,
        requestedMode: result.requestedMode,
        resolvedMode: result.resolvedMode,
        fallbackReason: result.fallbackReason,
        hits: result.hits.map((hit) => ({
          anchor: {
            id: hit.anchor.id,
            documentVersionId: target.versionId,
            pageNumber: hit.anchor.pageIndex + 1,
            startOffset: hit.anchor.startOffsetUtf16,
            endOffset: hit.anchor.endOffsetUtf16,
            quote: hit.anchor.quote,
            rects: hit.anchor.rects,
          },
          score: hit.score,
          excerpt: hit.excerpt,
        })),
      };
    },
    async startIndex(target) {
      return startDocumentIndex({
        ...commonInput(target),
        requestedMode: target.mode,
      });
    },
    async currentIndex(target, signal) {
      throwIfAborted(signal);
      const snapshot = await getCurrentDocumentIndex(commonInput(target));
      throwIfAborted(signal);
      return snapshot ?? undefined;
    },
    async loadIndexSnapshot(target, signal) {
      throwIfAborted(signal);
      const snapshot = await getDocumentIndexSnapshot({
        ...commonInput(target),
        jobId: target.jobId,
      });
      throwIfAborted(signal);
      return snapshot;
    },
    async pauseIndex(target) {
      return pauseDocumentIndex({ ...commonInput(target), jobId: target.jobId });
    },
    async resumeIndex(target) {
      return resumeDocumentIndex({ ...commonInput(target), jobId: target.jobId });
    },
    async cancelIndex(target) {
      return cancelDocumentIndex({ ...commonInput(target), jobId: target.jobId });
    },
    async loadPageText(target, signal) {
      throwIfAborted(signal);
      const page = await getDocumentPageText({
        ...commonInput(target),
        pageIndex: target.pageIndex,
      });
      throwIfAborted(signal);
      return page;
    },
    async listAnnotations(target, signal) {
      throwIfAborted(signal);
      const annotations = await listDocumentAnnotations(commonInput(target));
      throwIfAborted(signal);
      return annotations;
    },
    async saveAnnotation(target) {
      return saveDocumentAnnotation({
        ...commonInput(target),
        annotationId: target.annotationId,
        kind: target.kind,
        colorToken: target.colorToken,
        noteText: target.noteText,
        anchor: target.anchor,
      });
    },
    async deleteAnnotation(target) {
      return deleteDocumentAnnotation({
        ...commonInput(target),
        annotationId: target.annotationId,
      });
    },
    async listSavedEvidence(target, signal) {
      throwIfAborted(signal);
      const evidence = await listDocumentSavedEvidence(commonInput(target));
      throwIfAborted(signal);
      return evidence;
    },
    async saveEvidence(target) {
      return saveDocumentEvidence({
        ...commonInput(target),
        evidenceId: target.evidenceId,
        label: target.label,
        noteText: target.noteText,
        anchor: target.anchor,
      });
    },
    async deleteEvidence(target) {
      return deleteDocumentEvidence({
        ...commonInput(target),
        evidenceId: target.evidenceId,
      });
    },
    async loadSourcePreference(target, signal) {
      throwIfAborted(signal);
      const preference = await getDocumentSourcePreference({
        ...commonInput(target),
        pageIndex: target.pageIndex,
      });
      throwIfAborted(signal);
      return preference;
    },
    async saveSourcePreference(target) {
      return saveDocumentSourcePreference({
        ...commonInput(target),
        pageIndex: target.pageIndex,
        preference: target.preference,
      });
    },
    async loadOcrCapability(signal) {
      throwIfAborted(signal);
      const capability = await getDocumentOcrCapabilities();
      throwIfAborted(signal);
      return capability;
    },
    async startOcr(target) {
      const started = await startDocumentOcr({
        ...commonInput(target),
        pageIndex: target.pageIndex,
      });
      let response: Response;
      try {
        response = await fetch(documentOcrUploadUri(started.uploadUrl), {
          method: "POST",
          headers: { "Content-Type": "image/png" },
          body: target.png,
          cache: "no-store",
          credentials: "omit",
        });
      } catch (error) {
        await cancelDocumentOcr({ databaseDir: target.databaseDir, jobId: started.snapshot.jobId })
          .catch(() => undefined);
        throw error;
      }
      if (!response.ok) {
        const code = (await response.text()).trim() || `SIDERA_DOCUMENT_OCR_UPLOAD_HTTP_${response.status}`;
        await cancelDocumentOcr({ databaseDir: target.databaseDir, jobId: started.snapshot.jobId })
          .catch(() => undefined);
        throw new Error(code);
      }
      return getDocumentOcrSnapshot({
        databaseDir: target.databaseDir,
        jobId: started.snapshot.jobId,
      });
    },
    async loadCurrentOcr(target, signal) {
      throwIfAborted(signal);
      const snapshot = await getCurrentDocumentOcr({
        ...commonInput(target),
        pageIndex: target.pageIndex,
      });
      throwIfAborted(signal);
      return snapshot ?? undefined;
    },
    async loadOcrSnapshot(target, signal) {
      throwIfAborted(signal);
      const snapshot = await getDocumentOcrSnapshot({
        databaseDir: target.databaseDir,
        jobId: target.jobId,
      });
      throwIfAborted(signal);
      return snapshot;
    },
    async cancelOcr(target) {
      return cancelDocumentOcr({ databaseDir: target.databaseDir, jobId: target.jobId });
    },
    async startParse(target) {
      const versionKey = targetKey(target);
      const existingStart = parseStartRequestsByVersion.get(versionKey);
      if (existingStart) return existingStart;
      const cached = lruGet(manifestCache, versionKey);
      if (!cached) throw new Error("SIDERA_DOCUMENT_READER_MANIFEST_REQUIRED");
      const controller = new AbortController();
      rememberVersionController(versionKey, controller);

      let resolveStarted!: (snapshot: DocumentParseSnapshot) => void;
      let rejectStarted!: (error: Error) => void;
      const started = new Promise<DocumentParseSnapshot>((resolve, reject) => {
        resolveStarted = resolve;
        rejectStarted = reject;
      });
      parseStartRequestsByVersion.set(versionKey, started);
      let didStart = false;
      void loadPdfJs().then((pdfjs) => parseWithBundledPdfJs({
        pdfjs,
        manifest: cached.publicManifest,
        parserVersion: options.parserVersion,
        transport: parseTransport(target),
        signal: controller.signal,
        onProgress(snapshot) {
          if (!didStart && snapshot.runId) {
            didStart = true;
            rememberRunController(snapshot.runId, controller);
            resolveStarted(snapshot);
          }
        },
      })).catch((error) => {
        const normalized = error instanceof Error ? error : new Error(String(error));
        if (!didStart) rejectStarted(normalized);
        if (
          !controller.signal.aborted
          && !(normalized instanceof DOMException && normalized.name === "AbortError")
        ) {
          options.onParseError?.(normalized);
        }
      }).finally(() => {
        releaseParseController(controller);
        if (parseStartRequestsByVersion.get(versionKey) === started) {
          parseStartRequestsByVersion.delete(versionKey);
        }
      });
      return started;
    },
    async loadParseSnapshot(target, signal) {
      let runId = target.runId;
      if (!runId) {
        const cachedManifest = lruGet(manifestCache, targetKey(target));
        const restored = cachedManifest?.parseSnapshot;
        if (!restored?.runId) throw new Error("SIDERA_DOCUMENT_PARSE_RUN_ID_REQUIRED");
        throwIfAborted(signal);
        return restored;
      }
      const terminal = lruGet(terminalParseSnapshots, runId);
      if (terminal) return terminal;
      const fence = lruGet(runFences, runId);
      if (!fence) throw new Error("SIDERA_DOCUMENT_PARSE_FENCE_NOT_FOUND");
      throwIfAborted(signal);
      const next = await getDocumentParseSnapshot({ ...commonInput(target), ...fence });
      throwIfAborted(signal);
      const publicSnapshot = toPublicParse(next);
      return next.state === "queued" || next.state === "running"
        ? publicSnapshot
        : rememberTerminalSnapshot(publicSnapshot);
    },
    async cancelParse(target) {
      if (!target.runId) throw new Error("SIDERA_DOCUMENT_PARSE_RUN_ID_REQUIRED");
      parseControllersByRun.get(target.runId)?.abort();
      const terminal = lruGet(terminalParseSnapshots, target.runId);
      if (terminal) return terminal;
      const fence = lruGet(runFences, target.runId);
      if (!fence) throw new Error("SIDERA_DOCUMENT_PARSE_FENCE_NOT_FOUND");
      return cancelRun(target, fence);
    },
    async loadDetails(target, signal) {
      throwIfAborted(signal);
      const snapshot = await getPaperDocumentSnapshot({
        databaseDir: target.databaseDir,
        projectId: target.projectId,
        paperId: target.paperId,
      });
      throwIfAborted(signal);
      return {
        acquisitions: snapshot.acquisitions.map((record) => ({
          id: record.id,
          kind: record.kind,
          status: record.status,
          stage: record.stage,
          originLabel: record.originLabel,
          errorCode: record.errorCode,
          retryable: record.retryable,
          createdAtMs: record.createdAtMs,
        })),
      };
    },
  };

  return {
    service,
    pdfAdapter: createLazyPdfAdapter(loadPdfJs),
  };
}
