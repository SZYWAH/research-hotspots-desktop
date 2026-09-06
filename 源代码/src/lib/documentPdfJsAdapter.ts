import type {
  DocumentParseSnapshot,
  DocumentReaderManifest,
  DocumentPageRect,
} from "./documentReaderContract";

export type DocumentPdfHighlight = DocumentPageRect & {
  colorToken?: "search" | "yellow" | "blue" | "green" | "rose";
};

export type DocumentPdfRenderRequest = {
  pageNumber: number;
  scale: number;
  canvas: HTMLCanvasElement;
  signal?: AbortSignal;
  highlights?: DocumentPdfHighlight[];
};

export type DocumentPdfTextLayerRequest = {
  pageNumber: number;
  scale: number;
  container: HTMLElement;
  signal?: AbortSignal;
};

export type DocumentPdfTextLayerResult = {
  width: number;
  height: number;
  textLengthUtf16: number;
};

export type DocumentPdfPngResult = {
  blob: Blob;
  width: number;
  height: number;
};

export type DocumentPdfSession = {
  pageCount: number;
  renderPage: (request: DocumentPdfRenderRequest) => Promise<{ width: number; height: number }>;
  renderTextLayer: (
    request: DocumentPdfTextLayerRequest,
  ) => Promise<DocumentPdfTextLayerResult>;
  renderPagePng: (
    request: { pageNumber: number; signal?: AbortSignal },
  ) => Promise<DocumentPdfPngResult>;
  destroy: () => Promise<void> | void;
};

export type DocumentPdfAdapter = {
  open: (manifest: DocumentReaderManifest, signal?: AbortSignal) => Promise<DocumentPdfSession>;
};

type PdfJsViewport = {
  width: number;
  height: number;
  scale: number;
  rotation: number;
  transform: number[];
  userUnit?: number;
  convertToViewportRectangle?: (rectangle: number[]) => number[];
  rawDims: {
    pageWidth: number;
    pageHeight: number;
    pageX: number;
    pageY: number;
  };
};

type PdfJsTextContent = {
  items: Array<{
    str?: string;
    width?: number;
    height?: number;
    transform?: number[];
    hasEOL?: boolean;
    type?: string;
    id?: string;
  }>;
  styles?: Record<string, unknown>;
  lang?: string | null;
};

type PdfJsPage = {
  getViewport: (input: { scale: number }) => PdfJsViewport;
  getTextContent: () => Promise<PdfJsTextContent>;
  render: (input: {
    canvas: HTMLCanvasElement;
    canvasContext: CanvasRenderingContext2D;
    viewport: PdfJsViewport;
  }) => { promise: Promise<void>; cancel?: () => void };
  cleanup?: () => void;
};

type PdfJsDocument = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfJsPage>;
  destroy: () => Promise<void>;
};

export type BundledPdfJsModule = {
  GlobalWorkerOptions?: {
    workerSrc: string;
  };
  getDocument: (input: {
    url: string;
    withCredentials: boolean;
    disableAutoFetch?: boolean;
  }) => { promise: Promise<PdfJsDocument>; destroy?: () => void };
  TextLayer?: new (input: {
    textContentSource: PdfJsTextContent;
    container: HTMLElement;
    viewport: PdfJsViewport;
  }) => {
    render: () => Promise<void>;
    cancel: () => void;
    readonly textDivs: HTMLElement[];
    readonly textContentItemsStr: string[];
  };
};

export type DocumentPdfTextSpan = {
  text: string;
  startOffsetUtf16: number;
  endOffsetUtf16: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

type ParseFence = {
  runId: string;
  documentSha256: string;
  parserVersion: string;
};

export type DocumentPdfParseTransport = {
  start: (input: {
    documentVersionId: string;
    documentSha256: string;
    parserVersion: string;
    pageCount: number;
  }) => Promise<DocumentParseSnapshot>;
  submitPage: (input: ParseFence & {
    pageIndex: number;
    pageLabel: string;
    width: number;
    height: number;
    text: string;
    spans: DocumentPdfTextSpan[];
  }) => Promise<void>;
  finalize: (input: ParseFence) => Promise<DocumentParseSnapshot>;
  cancel: (input: ParseFence) => Promise<DocumentParseSnapshot>;
};

const DOCUMENT_READER_MAX_BYTES = 50 * 1024 * 1024;
const DOCUMENT_READER_MAX_PAGES = 300;

function pdfJsResourceUri(contentUri: string) {
  const parsed = new URL(contentUri);
  if (
    parsed.protocol !== "sidera-document:"
    || parsed.hostname !== "localhost"
    || !parsed.pathname.startsWith("/version/")
    || parsed.search
    || parsed.hash
  ) {
    throw new Error("SIDERA_DOCUMENT_READER_URI_INVALID");
  }
  // WebView2 exposes Wry custom protocols to fetch/XHR through its local HTTP
  // workaround. Navigations may keep the logical custom scheme, but PDF.js
  // must receive the fetchable origin or Chromium reports status 0.
  if (/Windows/i.test(navigator.userAgent)) {
    return `http://sidera-document.localhost${parsed.pathname}`;
  }
  return contentUri;
}

function normalizeUnit(value: number) {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

function textLayerBoxSize(viewport: PdfJsViewport) {
  const rotation = ((viewport.rotation % 360) + 360) % 360;
  return rotation === 90 || rotation === 270
    ? { width: viewport.height, height: viewport.width }
    : { width: viewport.width, height: viewport.height };
}

function viewportRectangle(
  viewport: PdfJsViewport,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const converted = viewport.convertToViewportRectangle?.([x, y, x + width, y + height]);
  if (converted?.length === 4 && converted.every(Number.isFinite)) {
    const left = Math.min(converted[0], converted[2]);
    const top = Math.min(converted[1], converted[3]);
    const right = Math.max(converted[0], converted[2]);
    const bottom = Math.max(converted[1], converted[3]);
    return { left, top, right, bottom };
  }
  const [a = 1, b = 0, c = 0, d = -1, e = 0, f = viewport.height] = viewport.transform;
  const points = [
    [x, y],
    [x + width, y],
    [x, y + height],
    [x + width, y + height],
  ].map(([pointX, pointY]) => ({
    x: a * pointX + c * pointY + e,
    y: b * pointX + d * pointY + f,
  }));
  return {
    left: Math.min(...points.map((point) => point.x)),
    top: Math.min(...points.map((point) => point.y)),
    right: Math.max(...points.map((point) => point.x)),
    bottom: Math.max(...points.map((point) => point.y)),
  };
}

function highlightFillStyle(token: DocumentPdfHighlight["colorToken"]) {
  if (token === "yellow") return "rgba(245, 194, 66, 0.28)";
  if (token === "green") return "rgba(82, 196, 132, 0.25)";
  if (token === "rose") return "rgba(235, 104, 139, 0.25)";
  return "rgba(112, 164, 255, 0.24)";
}

/**
 * Serial PDF.js extraction runner. It never writes a path or document bytes to
 * application state: the transport receives only text, normalized page
 * coordinates and the immutable version/hash fence.
 */
export async function parseWithBundledPdfJs(input: {
  pdfjs: BundledPdfJsModule;
  manifest: DocumentReaderManifest;
  parserVersion: string;
  transport: DocumentPdfParseTransport;
  signal?: AbortSignal;
  onProgress?: (snapshot: DocumentParseSnapshot) => void;
}) {
  const { pdfjs, manifest, parserVersion, transport, signal, onProgress } = input;
  const resourceUri = pdfJsResourceUri(manifest.contentUri);
  const activeVersion = manifest.versions.find((version) => version.id === manifest.documentVersionId);
  if (!activeVersion) throw new Error("SIDERA_DOCUMENT_VERSION_NOT_FOUND");
  if (activeVersion.byteSize > DOCUMENT_READER_MAX_BYTES) {
    throw new Error("SIDERA_DOCUMENT_PARSE_FILE_TOO_LARGE");
  }
  if (manifest.pageCount > DOCUMENT_READER_MAX_PAGES) {
    throw new Error("SIDERA_DOCUMENT_PARSE_PAGE_LIMIT_EXCEEDED");
  }
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const loading = pdfjs.getDocument({
    url: resourceUri,
    withCredentials: false,
    disableAutoFetch: true,
  });
  const abortLoading = () => loading.destroy?.();
  signal?.addEventListener("abort", abortLoading, { once: true });
  const document = await loading.promise.finally(() => {
    signal?.removeEventListener("abort", abortLoading);
  });
  if (signal?.aborted) {
    await document.destroy();
    throw new DOMException("Aborted", "AbortError");
  }
  if (document.numPages > DOCUMENT_READER_MAX_PAGES) {
    await document.destroy();
    throw new Error("SIDERA_DOCUMENT_PARSE_PAGE_LIMIT_EXCEEDED");
  }

  let started: DocumentParseSnapshot;
  try {
    started = await transport.start({
      documentVersionId: manifest.documentVersionId,
      documentSha256: activeVersion.sha256,
      parserVersion,
      pageCount: document.numPages,
    });
  } catch (error) {
    await document.destroy();
    throw error;
  }
  if (!started.runId) {
    await document.destroy();
    throw new Error("SIDERA_DOCUMENT_PARSE_RUN_ID_MISSING");
  }
  const fence: ParseFence = {
    runId: started.runId,
    documentSha256: activeVersion.sha256,
    parserVersion,
  };
  onProgress?.(started);

  try {
    const resumePageIndex = Math.min(document.numPages, Math.max(0, started.pagesProcessed));
    for (let pageIndex = resumePageIndex; pageIndex < document.numPages; pageIndex += 1) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const page = await document.getPage(pageIndex + 1);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      let text = "";
      const spans: DocumentPdfTextSpan[] = [];

      for (const rawItem of content.items) {
        const itemText = rawItem.str ?? "";
        if (!itemText) continue;
        const separator = text && !/\s$/.test(text) ? " " : "";
        text += separator;
        const startOffsetUtf16 = text.length;
        text += itemText;
        const transform = rawItem.transform ?? [];
        const itemX = transform[4] ?? 0;
        const itemY = transform[5] ?? 0;
        const itemWidth = Math.max(0, rawItem.width ?? 0);
        const itemHeight = Math.max(0, rawItem.height ?? Math.abs(transform[3] ?? 0));
        const rectangle = viewportRectangle(
          viewport,
          itemX,
          itemY,
          itemWidth,
          itemHeight,
        );
        spans.push({
          text: itemText,
          startOffsetUtf16,
          endOffsetUtf16: text.length,
          x: normalizeUnit(rectangle.left / Math.max(1, viewport.width)),
          y: normalizeUnit(rectangle.top / Math.max(1, viewport.height)),
          width: normalizeUnit((rectangle.right - rectangle.left) / Math.max(1, viewport.width)),
          height: normalizeUnit((rectangle.bottom - rectangle.top) / Math.max(1, viewport.height)),
        });
        if (rawItem.hasEOL) text += "\n";
      }

      const pageManifest = manifest.pages.find((candidate) => candidate.pageNumber === pageIndex + 1);
      await transport.submitPage({
        ...fence,
        pageIndex,
        pageLabel: pageManifest?.pageLabel ?? String(pageIndex + 1),
        width: viewport.width,
        height: viewport.height,
        text,
        spans,
      });
      onProgress?.({
        ...started,
        state: "running",
        pagesProcessed: pageIndex + 1,
        pageCount: document.numPages,
      });
      page.cleanup?.();
    }
    const finalized = await transport.finalize(fence);
    onProgress?.(finalized);
    return finalized;
  } catch (error) {
    const isHandoffAbort = signal?.aborted
      || (error instanceof DOMException && error.name === "AbortError");
    if (!isHandoffAbort) {
      try {
        const cancelled = await transport.cancel(fence);
        onProgress?.(cancelled);
      } catch {
        // The original parse error remains authoritative.
      }
    }
    throw error;
  } finally {
    await document.destroy();
  }
}

/**
 * Keeps the reader independent from a CDN and from a package-level side effect.
 * The composition root must pass the locally bundled `pdfjs-dist` module here.
 */
export function createBundledPdfJsAdapter(pdfjs: BundledPdfJsModule): DocumentPdfAdapter {
  return {
    async open(manifest, signal) {
      const resourceUri = pdfJsResourceUri(manifest.contentUri);
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

      const task = pdfjs.getDocument({
        url: resourceUri,
        withCredentials: false,
        disableAutoFetch: true,
      });
      const onAbort = () => task.destroy?.();
      signal?.addEventListener("abort", onAbort, { once: true });
      const document = await task.promise.finally(() => {
        signal?.removeEventListener("abort", onAbort);
      });
      if (signal?.aborted) {
        await document.destroy();
        throw new DOMException("Aborted", "AbortError");
      }
      const textContentByPage = new Map<number, Promise<PdfJsTextContent>>();

      const loadPageText = (pageNumber: number, page: PdfJsPage) => {
        const cached = textContentByPage.get(pageNumber);
        if (cached) return cached;
        const request = page.getTextContent().catch((error) => {
          textContentByPage.delete(pageNumber);
          throw error;
        });
        textContentByPage.set(pageNumber, request);
        return request;
      };

      return {
        pageCount: document.numPages,
        async renderPage({ pageNumber, scale, canvas, signal: renderSignal, highlights = [] }) {
          if (renderSignal?.aborted) throw new DOMException("Aborted", "AbortError");
          let page: PdfJsPage | undefined;
          let rendering: ReturnType<PdfJsPage["render"]> | undefined;
          const onRenderAbort = () => rendering?.cancel?.();
          renderSignal?.addEventListener("abort", onRenderAbort, { once: true });
          try {
            page = await document.getPage(pageNumber);
            if (renderSignal?.aborted) throw new DOMException("Aborted", "AbortError");
            const viewport = page.getViewport({ scale });
            const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
            canvas.width = Math.max(1, Math.floor(viewport.width * pixelRatio));
            canvas.height = Math.max(1, Math.floor(viewport.height * pixelRatio));
            canvas.style.width = `${viewport.width}px`;
            canvas.style.height = `${viewport.height}px`;
            const context = canvas.getContext("2d", { alpha: false });
            if (!context) throw new Error("SIDERA_DOCUMENT_READER_CANVAS_UNAVAILABLE");
            context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
            rendering = page.render({ canvas, canvasContext: context, viewport });
            if (renderSignal?.aborted) {
              rendering.cancel?.();
              throw new DOMException("Aborted", "AbortError");
            }
            try {
              await rendering.promise;
            } catch (error) {
              if (renderSignal?.aborted) throw new DOMException("Aborted", "AbortError");
              throw error;
            }
            if (renderSignal?.aborted) throw new DOMException("Aborted", "AbortError");
            if (highlights.length > 0) {
              context.save();
              for (const rect of highlights) {
                context.fillStyle = highlightFillStyle(rect.colorToken);
                context.fillRect(
                  rect.x * viewport.width,
                  rect.y * viewport.height,
                  rect.width * viewport.width,
                  rect.height * viewport.height,
                );
              }
              context.restore();
            }
            return { width: viewport.width, height: viewport.height };
          } finally {
            renderSignal?.removeEventListener("abort", onRenderAbort);
            page?.cleanup?.();
          }
        },
        async renderPagePng({ pageNumber, signal: renderSignal }) {
          if (renderSignal?.aborted) throw new DOMException("Aborted", "AbortError");
          let page: PdfJsPage | undefined;
          let rendering: ReturnType<PdfJsPage["render"]> | undefined;
          const onRenderAbort = () => rendering?.cancel?.();
          renderSignal?.addEventListener("abort", onRenderAbort, { once: true });
          try {
            page = await document.getPage(pageNumber);
            const initialViewport = page.getViewport({ scale: 2 });
            const edgeScale = Math.min(1, 3000 / Math.max(initialViewport.width, initialViewport.height));
            const pixelScale = Math.min(1, Math.sqrt(12_000_000 / Math.max(
              1,
              initialViewport.width * initialViewport.height,
            )));
            const viewport = page.getViewport({ scale: 2 * Math.min(edgeScale, pixelScale) });
            const canvas = window.document.createElement("canvas");
            canvas.width = Math.max(1, Math.floor(viewport.width));
            canvas.height = Math.max(1, Math.floor(viewport.height));
            const context = canvas.getContext("2d", { alpha: false });
            if (!context) throw new Error("SIDERA_DOCUMENT_READER_CANVAS_UNAVAILABLE");
            rendering = page.render({ canvas, canvasContext: context, viewport });
            await rendering.promise;
            if (renderSignal?.aborted) throw new DOMException("Aborted", "AbortError");
            const blob = await new Promise<Blob>((resolve, reject) => {
              canvas.toBlob((value) => {
                if (value) resolve(value);
                else reject(new Error("SIDERA_DOCUMENT_OCR_PNG_ENCODE_FAILED"));
              }, "image/png");
            });
            if (blob.size > 12 * 1024 * 1024) {
              throw new Error("SIDERA_DOCUMENT_OCR_UPLOAD_SIZE_INVALID");
            }
            return { blob, width: canvas.width, height: canvas.height };
          } catch (error) {
            if (renderSignal?.aborted) throw new DOMException("Aborted", "AbortError");
            throw error;
          } finally {
            renderSignal?.removeEventListener("abort", onRenderAbort);
            page?.cleanup?.();
          }
        },
        async renderTextLayer({ pageNumber, scale, container, signal: renderSignal }) {
          if (!pdfjs.TextLayer) throw new Error("SIDERA_DOCUMENT_PDFJS_TEXT_LAYER_UNAVAILABLE");
          if (renderSignal?.aborted) throw new DOMException("Aborted", "AbortError");
          let page: PdfJsPage | undefined;
          let textLayer: {
            render: () => Promise<void>;
            cancel: () => void;
            readonly textDivs: HTMLElement[];
            readonly textContentItemsStr: string[];
          } | undefined;
          const onTextAbort = () => textLayer?.cancel();
          renderSignal?.addEventListener("abort", onTextAbort, { once: true });
          try {
            page = await document.getPage(pageNumber);
            if (renderSignal?.aborted) throw new DOMException("Aborted", "AbortError");
            const viewport = page.getViewport({ scale });
            const textContent = await loadPageText(pageNumber, page);
            if (renderSignal?.aborted) throw new DOMException("Aborted", "AbortError");
            container.replaceChildren();
            const textLayerBox = textLayerBoxSize(viewport);
            const mainRotation = ((viewport.rotation % 360) + 360) % 360;
            container.style.setProperty("--scale-factor", String(viewport.scale));
            container.style.setProperty("--user-unit", String(viewport.userUnit ?? 1));
            container.style.setProperty(
              "--total-scale-factor",
              `calc(var(--scale-factor) * var(--user-unit))`,
            );
            textLayer = new pdfjs.TextLayer({
              textContentSource: textContent,
              container,
              viewport,
            });
            // PDF.js positions spans in the unrotated page box and rotates that
            // box with CSS. Pinning the already-rotated viewport dimensions here
            // shifts WebView2 hit testing into blank space on 90/270-degree pages.
            container.style.width = `${textLayerBox.width}px`;
            container.style.height = `${textLayerBox.height}px`;
            container.dataset.mainRotation = String(mainRotation);
            try {
              await textLayer.render();
            } catch (error) {
              if (renderSignal?.aborted) throw new DOMException("Aborted", "AbortError");
              throw error;
            }
            if (renderSignal?.aborted) throw new DOMException("Aborted", "AbortError");
            let canonicalText = "";
            let textDivIndex = 0;
            for (const item of textContent.items) {
              if (typeof item.str !== "string") continue;
              const textDiv = textLayer.textDivs[textDivIndex];
              textDivIndex += 1;
              if (!item.str) continue;
              const separator = canonicalText && !/\s$/.test(canonicalText) ? " " : "";
              canonicalText += separator;
              const startOffsetUtf16 = canonicalText.length;
              canonicalText += item.str;
              if (textDiv) {
                textDiv.dataset.readerTextItem = "true";
                textDiv.dataset.startOffsetUtf16 = String(startOffsetUtf16);
                textDiv.dataset.endOffsetUtf16 = String(canonicalText.length);
              }
              if (item.hasEOL) canonicalText += "\n";
            }
            const textLengthUtf16 = canonicalText.length;
            return { width: viewport.width, height: viewport.height, textLengthUtf16 };
          } finally {
            renderSignal?.removeEventListener("abort", onTextAbort);
            page?.cleanup?.();
          }
        },
        destroy: () => {
          textContentByPage.clear();
          return document.destroy();
        },
      };
    },
  };
}
