import {
  ArrowLeft,
  Bookmark,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileSearch,
  Highlighter,
  LoaderCircle,
  MessageSquare,
  Minus,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Save,
  ScanText,
  Search,
  Send,
  Sparkles,
  Square,
  Trash2,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";

import type {
  DocumentAnnotation,
  DocumentEvidenceAnchor,
  DocumentIndexMode,
  DocumentIndexSnapshot,
  DocumentOcrCapability,
  DocumentOcrSnapshot,
  DocumentPageRect,
  DocumentPageText,
  DocumentParseSnapshot,
  DocumentParseState,
  DocumentReaderDetails,
  DocumentReaderManifest,
  DocumentReaderService,
  DocumentReaderState,
  DocumentReaderTarget,
  DocumentSavedEvidence,
  DocumentSearchHit,
  DocumentTextSourcePreference,
  SideraReadingContextScope,
} from "../lib/documentReaderContract";
import type { SideraConversationTurn } from "../lib/sideraFocus";
import type {
  DocumentPdfAdapter,
  DocumentPdfHighlight,
  DocumentPdfSession,
} from "../lib/documentPdfJsAdapter";
import { computeOcrSelectionRects } from "../lib/documentSelectionGeometry";
import { WorkbenchSideSheet } from "./WorkbenchSideSheet";

import "./DocumentReaderShell.css";

const MIN_SCALE = 0.5;
const MAX_SCALE = 2.5;
const SCALE_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5] as const;
const EMPTY_PAGE_RECTS: DocumentPageRect[] = [];

type DocumentReaderMeasuredSelection = {
  pageNumber: number;
  startOffsetUtf16: number;
  endOffsetUtf16: number;
  selectedText: string;
  rects: DocumentPageRect[];
  viewportAnchor: {
    left: number;
    top: number;
  };
};

export type DocumentReaderShellProps = DocumentReaderTarget & {
  title: string;
  service: DocumentReaderService;
  pdfAdapter?: DocumentPdfAdapter;
  onBack: () => void;
  onNotice?: (message: string, tone?: "info" | "error") => void;
  onIndexActivityChange?: (snapshot: DocumentIndexSnapshot) => void;
  agentConversationTurns?: SideraConversationTurn[];
  agentGenerating?: boolean;
  agentError?: string;
  onAskEvidence?: (prompt: string, scope: SideraReadingContextScope) => void;
  onStopEvidenceAnswer?: () => void;
  initialEvidenceAnchor?: DocumentEvidenceAnchor;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function stepScale(value: number, direction: -1 | 1) {
  const epsilon = 0.001;
  if (direction > 0) {
    return SCALE_PRESETS.find((preset) => preset > value + epsilon) ?? MAX_SCALE;
  }
  return [...SCALE_PRESETS].reverse().find((preset) => preset < value - epsilon) ?? MIN_SCALE;
}

function parseStateLabel(state: DocumentParseState) {
  if (state === "queued") return "等待解析";
  if (state === "running") return "解析中";
  if ((state as string) === "paused") return "已暂停";
  if (state === "ready") return "可检索";
  if (state === "needs-ocr") return "需要 OCR";
  if (state === "cancelled") return "已取消";
  if (state === "stale") return "需要更新";
  return "解析失败";
}

function indexStateLabel(snapshot: DocumentIndexSnapshot) {
  if (snapshot.state === "queued") return "等待索引";
  if (snapshot.state === "running") return "建立索引中";
  if (snapshot.state === "paused") return "已暂停";
  if (snapshot.state === "ready" && snapshot.resolvedMode === "hybrid") return "混合检索可用";
  if (snapshot.state === "ready" && snapshot.resolvedMode === "lexical") {
    return snapshot.fallbackReason ? "词法检索 · 已降级" : "词法检索可用";
  }
  if (snapshot.state === "ready") return "索引已就绪";
  if (snapshot.state === "cancelled") return "已取消";
  if (snapshot.state === "superseded") return "已有更新索引";
  return "索引失败";
}

function searchModeLabel(mode: "lexical" | "hybrid") {
  return mode === "hybrid" ? "FTS + E5" : "词法检索";
}

function evidenceResolutionLabel(resolution: DocumentAnnotation["resolution"]) {
  if (resolution === "exact") return "定位准确";
  if (resolution === "reanchored") return "已重新定位";
  if (resolution === "ambiguous") return "需要确认位置";
  return "原位置已失效";
}

function versionKindLabel(kind: string) {
  if (kind === "publisher-version") return "出版社正式版";
  if (kind === "author-manuscript") return "作者稿";
  if (kind === "scan") return "扫描版";
  if (kind === "user-import") return "用户导入版";
  return "版本待确认";
}

function byteSizeLabel(value: number) {
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function readerErrorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error && error.message.trim()
    ? error.message.trim()
    : typeof error === "string" && error.trim()
      ? error.trim()
      : "";
  if (message === "SIDERA_DOCUMENT_EVIDENCE_RECTS_INVALID") {
    return "选区定位与当前页面不一致，请重新选择文本后再试。";
  }
  if (message === "SIDERA_DOCUMENT_NATIVE_SOURCE_NOT_READY") {
    return "当前页没有可用的原生文字，请使用 OCR 来源。";
  }
  if (message === "SIDERA_DOCUMENT_OCR_SOURCE_NOT_READY") {
    return "当前页尚未生成可用的 OCR 文字，请先识别当前页。";
  }
  return message || fallback;
}

function isPageTextSourceUnavailableError(error: unknown) {
  const message = error instanceof Error
    ? error.message.trim()
    : typeof error === "string"
      ? error.trim()
      : "";
  return [
    "SIDERA_DOCUMENT_OCR_SOURCE_NOT_READY",
    "SIDERA_DOCUMENT_OCR_PAGE_NOT_PARSED",
    "SIDERA_DOCUMENT_OCR_NOT_PREPARED",
  ].includes(message);
}

function scrollReaderViewportToPage(
  viewport: HTMLElement,
  pageNumber: number,
  behavior: ScrollBehavior,
) {
  const page = viewport.querySelector<HTMLElement>(`[data-reader-page="${pageNumber}"]`);
  if (!page) return;
  const viewportTop = viewport.getBoundingClientRect().top;
  const pageTop = page.getBoundingClientRect().top;
  viewport.scrollTo({
    top: Math.max(0, viewport.scrollTop + pageTop - viewportTop - 12),
    behavior,
  });
}

function textItemForNode(node: Node, textLayer: HTMLElement) {
  const element = node instanceof HTMLElement ? node : node.parentElement;
  const textItem = element?.closest<HTMLElement>("[data-reader-text-item='true']");
  return textItem && textLayer.contains(textItem) ? textItem : undefined;
}

function selectionOffsetWithinTextItem(
  node: Node,
  offset: number,
  textItem: HTMLElement,
) {
  const range = document.createRange();
  range.selectNodeContents(textItem);
  try {
    range.setEnd(node, offset);
  } catch {
    return 0;
  }
  return range.toString().length;
}

function measurePageTextSelection(
  textLayer: HTMLElement,
  pageNumber: number,
  pageText?: DocumentPageText,
): DocumentReaderMeasuredSelection | undefined {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount !== 1 || selection.isCollapsed) return undefined;
  const range = selection.getRangeAt(0);
  if (!textLayer.contains(range.startContainer) || !textLayer.contains(range.endContainer)) {
    return undefined;
  }
  const startItem = textItemForNode(range.startContainer, textLayer);
  const endItem = textItemForNode(range.endContainer, textLayer);
  if (!startItem || !endItem) return undefined;
  const startBase = Number(startItem.dataset.startOffsetUtf16);
  const endBase = Number(endItem.dataset.startOffsetUtf16);
  if (!Number.isFinite(startBase) || !Number.isFinite(endBase)) return undefined;
  let startOffsetUtf16 = startBase + selectionOffsetWithinTextItem(
    range.startContainer,
    range.startOffset,
    startItem,
  );
  let endOffsetUtf16 = endBase + selectionOffsetWithinTextItem(
    range.endContainer,
    range.endOffset,
    endItem,
  );
  if (endOffsetUtf16 < startOffsetUtf16) {
    [startOffsetUtf16, endOffsetUtf16] = [endOffsetUtf16, startOffsetUtf16];
  }
  const rawText = selection.toString();
  const selectedText = rawText.trim();
  if (!selectedText) return undefined;
  const leadingWhitespace = rawText.length - rawText.trimStart().length;
  const trailingWhitespace = rawText.length - rawText.trimEnd().length;
  startOffsetUtf16 += leadingWhitespace;
  endOffsetUtf16 = Math.max(startOffsetUtf16, endOffsetUtf16 - trailingWhitespace);
  const pageRect = textLayer.getBoundingClientRect();
  const width = Math.max(1, pageRect.width);
  const height = Math.max(1, pageRect.height);
  const rects = pageText?.sourceKind === "ocr"
    ? computeOcrSelectionRects(pageText, startOffsetUtf16, endOffsetUtf16)
    : Array.from(range.getClientRects())
      .map((rect) => {
        const left = clamp(rect.left, pageRect.left, pageRect.right);
        const top = clamp(rect.top, pageRect.top, pageRect.bottom);
        const right = clamp(rect.right, pageRect.left, pageRect.right);
        const bottom = clamp(rect.bottom, pageRect.top, pageRect.bottom);
        return {
          x: clamp((left - pageRect.left) / width, 0, 1),
          y: clamp((top - pageRect.top) / height, 0, 1),
          width: clamp((right - left) / width, 0, 1),
          height: clamp((bottom - top) / height, 0, 1),
        };
      })
      .filter((rect) => rect.width > 0 && rect.height > 0);
  if (rects.length === 0 || endOffsetUtf16 <= startOffsetUtf16) return undefined;
  const bounds = pageText?.sourceKind === "ocr"
    ? {
        left: pageRect.left + Math.min(...rects.map((rect) => rect.x)) * width,
        top: pageRect.top + Math.min(...rects.map((rect) => rect.y)) * height,
        right: pageRect.left + Math.max(...rects.map((rect) => rect.x + rect.width)) * width,
      }
    : range.getBoundingClientRect();
  return {
    pageNumber,
    startOffsetUtf16,
    endOffsetUtf16,
    selectedText,
    rects,
    viewportAnchor: {
      left: bounds.left + (bounds.right - bounds.left) / 2,
      top: bounds.top,
    },
  };
}

function clearNativeTextSelection() {
  window.getSelection()?.removeAllRanges();
}

async function sha256Hex(value: string) {
  if (!crypto.subtle) throw new Error("SIDERA_DOCUMENT_EVIDENCE_HASH_UNAVAILABLE");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function boundedUtf16Prefix(value: string, offsetUtf16: number, limitUtf16 = 48) {
  const before = value.slice(0, offsetUtf16);
  const output: string[] = [];
  let used = 0;
  for (const character of Array.from(before).reverse()) {
    const width = character.length;
    if (used + width > limitUtf16) break;
    used += width;
    output.push(character);
  }
  return output.reverse().join("");
}

function boundedUtf16Suffix(value: string, offsetUtf16: number, limitUtf16 = 48) {
  const after = value.slice(offsetUtf16);
  let output = "";
  let used = 0;
  for (const character of after) {
    const width = character.length;
    if (used + width > limitUtf16) break;
    used += width;
    output += character;
  }
  return output;
}

async function evidenceAnchorFromSelection(
  selection: DocumentReaderMeasuredSelection,
  pageText: DocumentPageText,
): Promise<DocumentEvidenceAnchor> {
  if (selection.pageNumber !== pageText.pageIndex + 1) {
    throw new Error("SIDERA_DOCUMENT_EVIDENCE_PAGE_MISMATCH");
  }
  const startOffsetUtf16 = clamp(selection.startOffsetUtf16, 0, pageText.text.length);
  const endOffsetUtf16 = clamp(selection.endOffsetUtf16, startOffsetUtf16, pageText.text.length);
  const quote = pageText.text.slice(startOffsetUtf16, endOffsetUtf16);
  if (!quote.trim()) throw new Error("SIDERA_DOCUMENT_EVIDENCE_ANCHOR_INVALID");
  const normalizedSelected = selection.selectedText.replace(/\s+/g, "");
  const normalizedQuote = quote.replace(/\s+/g, "");
  if (!normalizedSelected || normalizedSelected !== normalizedQuote) {
    throw new Error("SIDERA_DOCUMENT_EVIDENCE_SELECTION_MISMATCH");
  }
  const quoteSha256 = await sha256Hex(quote);
  const stableParts = [
    pageText.documentVersionId,
    pageText.documentSha256,
    String(pageText.pageIndex),
    pageText.sourceKind,
    String(startOffsetUtf16),
    String(endOffsetUtf16),
    quoteSha256,
  ];
  const anchorDigest = await sha256Hex(stableParts.map((part) => `${part}\0`).join(""));
  return {
    id: `doc-anchor-${anchorDigest.slice(0, 24)}`,
    documentVersionId: pageText.documentVersionId,
    documentSha256: pageText.documentSha256,
    pageIndex: pageText.pageIndex,
    pageLabel: pageText.pageLabel,
    sourceKind: pageText.sourceKind,
    startOffsetUtf16,
    endOffsetUtf16,
    quote,
    quoteSha256,
    prefix: boundedUtf16Prefix(pageText.text, startOffsetUtf16),
    suffix: boundedUtf16Suffix(pageText.text, endOffsetUtf16),
    rects: selection.rects,
  };
}

type PdfPageCanvasProps = {
  session: DocumentPdfSession;
  pageNumber: number;
  pageLabel: string;
  width: number;
  height: number;
  scale: number;
  root: HTMLElement | null;
  highlights: DocumentPdfHighlight[];
  sourcePageText?: DocumentPageText;
  selection?: DocumentReaderMeasuredSelection;
  onNearViewport: (pageNumber: number) => void;
  onSelectionChange: (selection?: DocumentReaderMeasuredSelection) => void;
};

function PdfPageCanvas({
  session,
  pageNumber,
  pageLabel,
  width,
  height,
  scale,
  root,
  highlights,
  sourcePageText,
  selection,
  onNearViewport,
  onSelectionChange,
}: PdfPageCanvasProps) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textLayerRef = useRef<HTMLDivElement | null>(null);
  const [nearViewport, setNearViewport] = useState(pageNumber <= 2);
  const [renderError, setRenderError] = useState<string>();
  const [textLayerError, setTextLayerError] = useState<string>();
  const [renderedSize, setRenderedSize] = useState<{ width: number; height: number }>();

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || !root || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => setNearViewport(entry.isIntersecting),
      { root, rootMargin: "900px 0px" },
    );
    observer.observe(frame);
    return () => observer.disconnect();
  }, [root]);

  useEffect(() => {
    if (nearViewport) onNearViewport(pageNumber);
  }, [nearViewport, onNearViewport, pageNumber]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !nearViewport) {
      if (canvas && canvas.width > 1) {
        canvas.width = 1;
        canvas.height = 1;
      }
      return undefined;
    }
    const controller = new AbortController();
    setRenderError(undefined);
    setRenderedSize(undefined);
    void session.renderPage({
      canvas,
      pageNumber,
      scale,
      signal: controller.signal,
      highlights,
    }).then((size) => {
      if (!controller.signal.aborted) setRenderedSize(size);
    }).catch((error) => {
      if (!isAbortError(error)) setRenderError(readerErrorMessage(error, "页面渲染失败。"));
    });
    return () => controller.abort();
  }, [highlights, nearViewport, pageNumber, scale, session]);

  useEffect(() => {
    const textLayer = textLayerRef.current;
    if (!textLayer || !nearViewport) {
      textLayer?.replaceChildren();
      return undefined;
    }
    const controller = new AbortController();
    setTextLayerError(undefined);
    if (sourcePageText?.sourceKind === "ocr") {
      textLayer.replaceChildren();
      textLayer.dataset.mainRotation = "0";
      const layerWidth = width * scale;
      const layerHeight = height * scale;
      textLayer.style.width = `${layerWidth}px`;
      textLayer.style.height = `${layerHeight}px`;
      for (const span of sourcePageText.spans) {
        const element = window.document.createElement("span");
        element.textContent = span.text;
        element.dataset.readerTextItem = "true";
        element.dataset.startOffsetUtf16 = String(span.startOffsetUtf16);
        element.dataset.endOffsetUtf16 = String(span.endOffsetUtf16);
        element.style.left = `${span.x * layerWidth}px`;
        element.style.top = `${span.y * layerHeight}px`;
        element.style.width = `${span.width * layerWidth}px`;
        element.style.height = `${span.height * layerHeight}px`;
        element.style.fontSize = `${Math.max(6, span.height * layerHeight * 0.82)}px`;
        element.style.lineHeight = `${Math.max(7, span.height * layerHeight)}px`;
        element.style.overflow = "hidden";
        textLayer.append(element);
      }
      return () => {
        controller.abort();
        textLayer.replaceChildren();
      };
    }
    void session.renderTextLayer({
      container: textLayer,
      pageNumber,
      scale,
      signal: controller.signal,
    }).then((size) => {
      if (!controller.signal.aborted) setRenderedSize({ width: size.width, height: size.height });
    }).catch((error) => {
      if (!isAbortError(error)) {
        setTextLayerError(readerErrorMessage(error, "页面文本层读取失败。"));
      }
    });
    return () => {
      controller.abort();
      textLayer.replaceChildren();
    };
  }, [height, nearViewport, pageNumber, scale, session, sourcePageText, width]);

  const effectiveWidth = renderedSize?.width ?? width * scale;
  const effectiveHeight = renderedSize?.height ?? height * scale;
  const captureSelection = () => {
    window.requestAnimationFrame(() => {
      const textLayer = textLayerRef.current;
      onSelectionChange(
        textLayer
          ? measurePageTextSelection(textLayer, pageNumber, sourcePageText)
          : undefined,
      );
    });
  };

  return (
    <article
      ref={frameRef}
      className="document-reader-page"
      data-reader-page={pageNumber}
      aria-label={`第 ${pageLabel} 页`}
      style={{ width: `${effectiveWidth}px`, height: `${effectiveHeight}px` }}
      onPointerUp={captureSelection}
    >
      <canvas ref={canvasRef} aria-hidden="true" />
      <div
        ref={textLayerRef}
        className="document-reader-page__text-layer textLayer"
        data-reader-text-layer="true"
        data-reader-page-text={pageNumber}
        data-text-source={sourcePageText?.sourceKind ?? "native"}
      />
      {sourcePageText?.sourceKind === "ocr" && selection?.rects.length ? (
        <div className="document-reader-page__selection-layer" aria-hidden="true">
          {selection.rects.map((rect, index) => (
            <span
              key={`${selection.startOffsetUtf16}-${selection.endOffsetUtf16}-${index}`}
              style={{
                left: `${rect.x * 100}%`,
                top: `${rect.y * 100}%`,
                width: `${rect.width * 100}%`,
                height: `${rect.height * 100}%`,
              }}
            />
          ))}
        </div>
      ) : null}
      <span className="document-reader-page__label">{pageLabel}</span>
      {renderError ? <span className="document-reader-page__error">{renderError}</span> : null}
      {textLayerError ? (
        <span className="document-reader-page__text-error" role="status">{textLayerError}</span>
      ) : null}
    </article>
  );
}

export function DocumentReaderShell({
  databaseDir,
  projectId,
  paperId,
  versionId: initialVersionId,
  title,
  service,
  pdfAdapter,
  onBack,
  onNotice,
  onIndexActivityChange,
  agentConversationTurns = [],
  agentGenerating = false,
  agentError,
  onAskEvidence,
  onStopEvidenceAnswer,
  initialEvidenceAnchor,
}: DocumentReaderShellProps) {
  const target = useMemo<DocumentReaderTarget>(() => ({
    databaseDir,
    projectId,
    paperId,
  }), [databaseDir, paperId, projectId]);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const restoredRef = useRef(false);
  const mountedRef = useRef(true);
  const manifestRequestRef = useRef<{ sequence: number; controller?: AbortController }>({ sequence: 0 });
  const pendingRestoreRef = useRef<DocumentReaderState | undefined>(undefined);
  const latestReaderStateRef = useRef<{
    service: DocumentReaderService;
    target: DocumentReaderTarget;
    versionId: string;
    state: DocumentReaderState;
  } | undefined>(undefined);
  const readerStateSaveTimerRef = useRef<number | undefined>(undefined);
  const readerStateSaveInFlightRef = useRef<Promise<void> | undefined>(undefined);
  const flushReaderStateRef = useRef<() => Promise<void>>(async () => undefined);
  const scrollFrameRef = useRef<number | undefined>(undefined);
  const searchAbortRef = useRef<AbortController | undefined>(undefined);
  const searchSequenceRef = useRef(0);
  const versionEpochRef = useRef(0);
  const parsePollEpochRef = useRef(0);
  const indexPollEpochRef = useRef(0);
  const ocrPollEpochRef = useRef(0);
  const ocrBatchQueueRef = useRef<number[]>([]);
  const activeOcrBatchJobRef = useRef<string | undefined>(undefined);
  const handledOcrBatchJobRef = useRef<string | undefined>(undefined);
  const annotationListSequenceRef = useRef(0);
  const annotationMutationSequenceRef = useRef(0);
  const savedEvidenceListSequenceRef = useRef(0);
  const savedEvidenceMutationSequenceRef = useRef(0);
  const evidenceRefreshSequenceRef = useRef(0);
  const selectionActionTokenRef = useRef<string | undefined>(undefined);
  const selectionFrameRef = useRef<number | undefined>(undefined);
  const selectionPointerActiveRef = useRef(false);
  const selectionBeforeAgentRef = useRef<DocumentReaderMeasuredSelection | undefined>(undefined);
  const restoredEvidenceAnchorIdRef = useRef<string | undefined>(undefined);
  const pageTextCacheRef = useRef<Map<string, Promise<DocumentPageText>>>(new Map());
  const [requestedVersionId, setRequestedVersionId] = useState(initialVersionId);
  const [manifest, setManifest] = useState<DocumentReaderManifest>();
  const [manifestError, setManifestError] = useState<string>();
  const [session, setSession] = useState<DocumentPdfSession>();
  const [sessionError, setSessionError] = useState<string>();
  const [rendererRevision, setRendererRevision] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageDraft, setPageDraft] = useState("1");
  const [scale, setScale] = useState(1);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchError, setSearchError] = useState<string>();
  const [searchHits, setSearchHits] = useState<DocumentSearchHit[]>([]);
  const [searchMode, setSearchMode] = useState<DocumentIndexMode>("auto");
  const [searchResolvedMode, setSearchResolvedMode] = useState<"lexical" | "hybrid">();
  const [searchFallbackReason, setSearchFallbackReason] = useState<string>();
  const [activeHit, setActiveHit] = useState<DocumentSearchHit>();
  const [parseSnapshot, setParseSnapshot] = useState<DocumentParseSnapshot>();
  const [details, setDetails] = useState<DocumentReaderDetails>();
  const [detailsError, setDetailsError] = useState<string>();
  const [annotations, setAnnotations] = useState<DocumentAnnotation[]>([]);
  const [savedEvidence, setSavedEvidence] = useState<DocumentSavedEvidence[]>([]);
  const [evidenceBusy, setEvidenceBusy] = useState(false);
  const [evidenceError, setEvidenceError] = useState<string>();
  const [evidenceMutationId, setEvidenceMutationId] = useState<string>();
  const [editingAnnotation, setEditingAnnotation] = useState<DocumentAnnotation>();
  const [indexSnapshot, setIndexSnapshot] = useState<DocumentIndexSnapshot>();
  const [indexBusy, setIndexBusy] = useState(false);
  const [indexError, setIndexError] = useState<string>();
  const [ocrCapability, setOcrCapability] = useState<DocumentOcrCapability>();
  const [ocrSnapshot, setOcrSnapshot] = useState<DocumentOcrSnapshot>();
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrError, setOcrError] = useState<string>();
  const [ocrBatchOpen, setOcrBatchOpen] = useState(false);
  const [ocrBatchSelectedPages, setOcrBatchSelectedPages] = useState<number[]>([]);
  const [ocrBatchProgress, setOcrBatchProgress] = useState<{
    completed: number;
    total: number;
    pageNumber: number;
  }>();
  const [sourcePreference, setSourcePreference] = useState<DocumentTextSourcePreference>("auto");
  const [activeOcrPageText, setActiveOcrPageText] = useState<DocumentPageText>();
  const [selectionAction, setSelectionAction] = useState<"highlight" | "note" | "evidence">();
  const [measuredSelection, setMeasuredSelection] = useState<DocumentReaderMeasuredSelection>();
  const [noteSelection, setNoteSelection] = useState<DocumentReaderMeasuredSelection>();
  const [noteDraft, setNoteDraft] = useState("");
  const [focusedEvidenceAnchor, setFocusedEvidenceAnchor] = useState<DocumentEvidenceAnchor>();
  const [agentOpen, setAgentOpen] = useState(false);
  const [agentScope, setAgentScope] = useState<SideraReadingContextScope>();
  const [agentDraft, setAgentDraft] = useState("");
  const [agentOpenedAtMs, setAgentOpenedAtMs] = useState(0);
  const noteSaveBusy = selectionAction === "note"
    || (editingAnnotation !== undefined && evidenceMutationId === editingAnnotation.id);
  const activeVersionId = manifest?.documentVersionId;
  const activeParseState = parseSnapshot?.state ?? manifest?.parseState;
  const hasSearchableDocumentText = activeParseState === "ready"
    || (activeParseState === "needs-ocr"
      && (activeOcrPageText?.sourceKind === "ocr"
        || ocrSnapshot?.state === "ready"
        || indexSnapshot?.state === "ready"));
  const pageCount = Math.max(1, session?.pageCount ?? manifest?.pageCount ?? 1);
  const recommendedOcrPages = useMemo(() => (
    manifest?.pages
      .filter((page) => !page.textAvailable)
      .map((page) => page.pageNumber)
      .slice(0, Math.min(8, ocrCapability?.maxBatchPages ?? 8)) ?? []
  ), [manifest?.pages, ocrCapability?.maxBatchPages]);

  const beginAnnotationMutationSequence = useCallback(() => {
    const sequence = ++annotationMutationSequenceRef.current;
    annotationListSequenceRef.current += 1;
    evidenceRefreshSequenceRef.current += 1;
    setEvidenceBusy(false);
    return sequence;
  }, []);

  const beginSavedEvidenceMutationSequence = useCallback(() => {
    const sequence = ++savedEvidenceMutationSequenceRef.current;
    savedEvidenceListSequenceRef.current += 1;
    evidenceRefreshSequenceRef.current += 1;
    setEvidenceBusy(false);
    return sequence;
  }, []);

  const settleAnnotationMutationSequence = useCallback((sequence: number) => {
    if (annotationMutationSequenceRef.current === sequence) {
      annotationListSequenceRef.current += 1;
    }
  }, []);

  const settleSavedEvidenceMutationSequence = useCallback((sequence: number) => {
    if (savedEvidenceMutationSequenceRef.current === sequence) {
      savedEvidenceListSequenceRef.current += 1;
    }
  }, []);

  const ensurePageText = useCallback((pageNumber: number) => {
    if (!activeVersionId) return Promise.reject(new Error("SIDERA_DOCUMENT_VERSION_REQUIRED"));
    const cacheKey = `${activeVersionId}\u0000${pageNumber}`;
    const cached = pageTextCacheRef.current.get(cacheKey);
    if (cached) {
      pageTextCacheRef.current.delete(cacheKey);
      pageTextCacheRef.current.set(cacheKey, cached);
      return cached;
    }
    const request = service.loadPageText({
      ...target,
      versionId: activeVersionId,
      pageIndex: Math.max(0, pageNumber - 1),
    }).catch((error) => {
      pageTextCacheRef.current.delete(cacheKey);
      throw error;
    });
    pageTextCacheRef.current.set(cacheKey, request);
    while (pageTextCacheRef.current.size > 8) {
      const oldest = pageTextCacheRef.current.keys().next().value as string | undefined;
      if (!oldest) break;
      pageTextCacheRef.current.delete(oldest);
    }
    return request;
  }, [activeVersionId, service, target]);

  const prefetchVisiblePageText = useCallback((pageNumber: number) => {
    if (activeParseState !== "ready") return;
    void ensurePageText(pageNumber).catch(() => {
      // Selection actions surface the authoritative error if the user needs this page.
    });
  }, [activeParseState, ensurePageText]);

  const loadManifest = useCallback((nextVersionId?: string) => {
    versionEpochRef.current += 1;
    parsePollEpochRef.current += 1;
    indexPollEpochRef.current += 1;
    ocrPollEpochRef.current += 1;
    searchSequenceRef.current += 1;
    annotationListSequenceRef.current += 1;
    annotationMutationSequenceRef.current += 1;
    savedEvidenceListSequenceRef.current += 1;
    savedEvidenceMutationSequenceRef.current += 1;
    evidenceRefreshSequenceRef.current += 1;
    searchAbortRef.current?.abort();
    setRequestedVersionId(nextVersionId);
    manifestRequestRef.current.controller?.abort();
    const sequence = manifestRequestRef.current.sequence + 1;
    const controller = new AbortController();
    manifestRequestRef.current = { sequence, controller };
    restoredRef.current = false;
    pendingRestoreRef.current = undefined;
    setManifest(undefined);
    setManifestError(undefined);
    setParseSnapshot(undefined);
    setIndexSnapshot(undefined);
    setIndexError(undefined);
    setIndexBusy(false);
    setOcrCapability(undefined);
    setOcrSnapshot(undefined);
    setOcrBusy(false);
    setOcrError(undefined);
    setSourcePreference("auto");
    setActiveOcrPageText(undefined);
    setSearchHits([]);
    setSearchBusy(false);
    setActiveHit(undefined);
    setSearchResolvedMode(undefined);
    setSearchFallbackReason(undefined);
    setMeasuredSelection(undefined);
    setNoteSelection(undefined);
    setEditingAnnotation(undefined);
    setAnnotations([]);
    setSavedEvidence([]);
    setEvidenceBusy(false);
    setEvidenceError(undefined);
    setSessionError(undefined);
    const ownsRequest = () => (
      mountedRef.current
      && !controller.signal.aborted
      && manifestRequestRef.current.sequence === sequence
      && manifestRequestRef.current.controller === controller
    );
    void (async () => {
      try {
        const nextManifest = await service.loadManifest(
          { ...target, versionId: nextVersionId },
          controller.signal,
        );
        if (!ownsRequest()) return;
        const restored = await service.loadState(
          { ...target, versionId: nextManifest.documentVersionId },
          controller.signal,
        );
        if (!ownsRequest()) return;
        const restoredParseState = nextManifest.parseState as DocumentParseState | "paused";
        const restoredParse = restoredParseState === "queued"
          || restoredParseState === "running"
          || restoredParseState === "paused"
          ? await service.loadParseSnapshot(
              { ...target, versionId: nextManifest.documentVersionId },
              controller.signal,
            )
          : undefined;
        if (!ownsRequest()) return;
        const pendingRestore: DocumentReaderState = restored ?? {
          documentVersionId: nextManifest.documentVersionId,
          pageNumber: 1,
          scrollOffset: 0,
          scale: 1,
          updatedAtMs: Date.now(),
        };
        pendingRestoreRef.current = pendingRestore;
        setRequestedVersionId(nextManifest.documentVersionId);
        setCurrentPage(Math.max(1, pendingRestore.pageNumber));
        setPageDraft(String(Math.max(1, pendingRestore.pageNumber)));
        setScale(clamp(pendingRestore.scale, MIN_SCALE, MAX_SCALE));
        setScrollOffset(Math.max(0, pendingRestore.scrollOffset));
        setParseSnapshot(restoredParse);
        setManifest(nextManifest);
        if (restoredParseState === "queued" || restoredParseState === "running") {
          try {
            const attached = await service.startParse({
              ...target,
              versionId: nextManifest.documentVersionId,
            });
            if (!ownsRequest()) return;
            if (restoredParse?.runId && attached.runId && restoredParse.runId !== attached.runId) {
              throw new Error("SIDERA_DOCUMENT_PARSE_REATTACH_FENCE_MISMATCH");
            }
            setParseSnapshot(attached);
          } catch (error) {
            if (ownsRequest() && !isAbortError(error)) {
              onNotice?.(readerErrorMessage(error, "解析任务恢复失败。"), "error");
            }
          }
        }
      } catch (error) {
        if (ownsRequest() && !isAbortError(error)) {
          setManifestError(readerErrorMessage(error, "全文阅读数据读取失败。"));
        }
      } finally {
        if (manifestRequestRef.current.sequence === sequence) {
          manifestRequestRef.current.controller = undefined;
        }
      }
    })();
  }, [onNotice, service, target]);

  useEffect(() => {
    loadManifest(initialVersionId);
    return undefined;
    // The target identity owns initial loading; version changes call loadManifest explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [databaseDir, initialVersionId, paperId, projectId, service]);

  useEffect(() => {
    if (!manifest) {
      setSession(undefined);
      setSessionError(undefined);
      return undefined;
    }
    if (!pdfAdapter) {
      setSession(undefined);
      setSessionError("SIDERA_DOCUMENT_PDFJS_ADAPTER_UNAVAILABLE");
      return undefined;
    }
    const controller = new AbortController();
    let opened: DocumentPdfSession | undefined;
    setSession(undefined);
    setSessionError(undefined);
    void pdfAdapter.open(manifest, controller.signal)
      .then((nextSession) => {
        if (controller.signal.aborted) {
          void nextSession.destroy();
          return;
        }
        opened = nextSession;
        setSession(nextSession);
      })
      .catch((error) => {
        if (!isAbortError(error)) setSessionError(readerErrorMessage(error, "PDF 渲染器初始化失败。"));
      });
    return () => {
      controller.abort();
      if (opened) void opened.destroy();
    };
  }, [manifest, pdfAdapter, rendererRevision]);

  const flushReaderState = useCallback(async () => {
    if (readerStateSaveTimerRef.current !== undefined) {
      window.clearTimeout(readerStateSaveTimerRef.current);
      readerStateSaveTimerRef.current = undefined;
    }
    const pending = latestReaderStateRef.current;
    latestReaderStateRef.current = undefined;
    if (!pending) return readerStateSaveInFlightRef.current;
    const previous = readerStateSaveInFlightRef.current;
    const request = (previous ? previous.catch(() => undefined) : Promise.resolve())
      .then(() => pending.service.saveState({
        ...pending.target,
        versionId: pending.versionId,
        state: pending.state,
      }))
      .catch((error) => {
        onNotice?.(readerErrorMessage(error, "阅读位置保存失败。"), "error");
      });
    readerStateSaveInFlightRef.current = request;
    try {
      await request;
    } finally {
      if (readerStateSaveInFlightRef.current === request) {
        readerStateSaveInFlightRef.current = undefined;
      }
    }
  }, [onNotice]);
  flushReaderStateRef.current = flushReaderState;

  useEffect(() => {
    if (!restoredRef.current || !activeVersionId) return undefined;
    latestReaderStateRef.current = {
      service,
      target,
      versionId: activeVersionId,
      state: {
        documentVersionId: activeVersionId,
        pageNumber: currentPage,
        scrollOffset,
        scale,
        updatedAtMs: Date.now(),
      },
    };
    if (readerStateSaveTimerRef.current !== undefined) {
      window.clearTimeout(readerStateSaveTimerRef.current);
    }
    readerStateSaveTimerRef.current = window.setTimeout(() => {
      readerStateSaveTimerRef.current = undefined;
      void flushReaderState();
    }, 400);
    return () => {
      if (readerStateSaveTimerRef.current !== undefined) {
        window.clearTimeout(readerStateSaveTimerRef.current);
        readerStateSaveTimerRef.current = undefined;
      }
    };
  }, [activeVersionId, currentPage, flushReaderState, scale, scrollOffset, service, target]);

  useEffect(() => () => {
    void flushReaderState();
  }, [databaseDir, flushReaderState, paperId, projectId, service]);

  useEffect(() => {
    if (!parseSnapshot?.runId || (parseSnapshot.state !== "queued" && parseSnapshot.state !== "running")) {
      return undefined;
    }
    const controller = new AbortController();
    const pollEpoch = ++parsePollEpochRef.current;
    const versionEpoch = versionEpochRef.current;
    const versionId = activeVersionId;
    const runId = parseSnapshot.runId;
    let timer: number | undefined;
    const stillCurrent = () => (
      !controller.signal.aborted
      && parsePollEpochRef.current === pollEpoch
      && versionEpochRef.current === versionEpoch
    );
    const poll = async () => {
      if (!versionId || !stillCurrent()) return;
      try {
        const next = await service.loadParseSnapshot(
          { ...target, versionId, runId },
          controller.signal,
        );
        if (!stillCurrent()) return;
        setParseSnapshot(next);
        if (next.state === "queued" || next.state === "running") {
          timer = window.setTimeout(() => void poll(), 800);
        } else if (next.state === "ready") {
          await flushReaderState();
          if (stillCurrent()) loadManifest(versionId);
        }
      } catch (error) {
        if (stillCurrent() && !isAbortError(error)) {
          onNotice?.(readerErrorMessage(error, "解析进度读取失败。"), "error");
          timer = window.setTimeout(() => void poll(), 1_600);
        }
      }
    };
    timer = window.setTimeout(() => void poll(), 800);
    return () => {
      controller.abort();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [activeVersionId, flushReaderState, loadManifest, onNotice, parseSnapshot?.runId, parseSnapshot?.state, service, target]);

  useEffect(() => {
    if (!activeVersionId || !service.currentIndex) return undefined;
    const controller = new AbortController();
    const versionEpoch = versionEpochRef.current;
    const versionId = activeVersionId;
    const stillCurrent = () => (
      !controller.signal.aborted
      && versionEpochRef.current === versionEpoch
    );
    void service.currentIndex({ ...target, versionId }, controller.signal)
      .then(async (current) => {
        if (!stillCurrent() || !current) return;
        setIndexSnapshot(current);
        if (
          (current.state === "queued" || current.state === "running")
          && service.startIndex
        ) {
          const attached = await service.startIndex({
            ...target,
            versionId,
            mode: current.requestedMode,
          });
          if (!stillCurrent()) return;
          if (attached.jobId !== current.jobId) {
            throw new Error("SIDERA_DOCUMENT_INDEX_REATTACH_FENCE_MISMATCH");
          }
          setIndexSnapshot(attached);
        }
      })
      .catch((error) => {
        if (stillCurrent() && !isAbortError(error)) {
          setIndexError(readerErrorMessage(error, "索引状态恢复失败。"));
        }
      });
    return () => controller.abort();
  }, [activeVersionId, service, target]);

  useEffect(() => {
    if (
      !indexSnapshot?.jobId
      || (indexSnapshot.state !== "queued" && indexSnapshot.state !== "running")
      || !activeVersionId
      || !service.loadIndexSnapshot
    ) return undefined;
    const controller = new AbortController();
    const pollEpoch = ++indexPollEpochRef.current;
    const versionEpoch = versionEpochRef.current;
    const versionId = activeVersionId;
    const jobId = indexSnapshot.jobId;
    let timer: number | undefined;
    const stillCurrent = () => (
      !controller.signal.aborted
      && indexPollEpochRef.current === pollEpoch
      && versionEpochRef.current === versionEpoch
    );
    const poll = async () => {
      if (!stillCurrent() || !service.loadIndexSnapshot) return;
      try {
        const next = await service.loadIndexSnapshot(
          { ...target, versionId, jobId },
          controller.signal,
        );
        if (!stillCurrent()) return;
        setIndexSnapshot(next);
        if (next.state === "queued" || next.state === "running") {
          timer = window.setTimeout(() => void poll(), 900);
        }
      } catch (error) {
        if (stillCurrent() && !isAbortError(error)) {
          setIndexError(readerErrorMessage(error, "索引进度读取失败。"));
          timer = window.setTimeout(() => void poll(), 1_800);
        }
      }
    };
    timer = window.setTimeout(() => void poll(), 900);
    return () => {
      controller.abort();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [activeVersionId, indexSnapshot?.jobId, indexSnapshot?.state, service, target]);

  useEffect(() => {
    if (indexSnapshot) onIndexActivityChange?.(indexSnapshot);
  }, [indexSnapshot, onIndexActivityChange]);

  useEffect(() => {
    pageTextCacheRef.current.clear();
    setMeasuredSelection(undefined);
    setNoteSelection(undefined);
    setNoteDraft("");
    setEditingAnnotation(undefined);
    selectionActionTokenRef.current = undefined;
    setSelectionAction(undefined);
    setEvidenceMutationId(undefined);
    setFocusedEvidenceAnchor(undefined);
    setActiveHit(undefined);
    setSearchHits([]);
    setAnnotations([]);
    setSavedEvidence([]);
    setOcrSnapshot(undefined);
    setOcrError(undefined);
    ocrBatchQueueRef.current = [];
    activeOcrBatchJobRef.current = undefined;
    handledOcrBatchJobRef.current = undefined;
    setOcrBatchOpen(false);
    setOcrBatchSelectedPages([]);
    setOcrBatchProgress(undefined);
    setSourcePreference("auto");
    setActiveOcrPageText(undefined);
  }, [activeVersionId]);

  useEffect(() => {
    setMeasuredSelection(undefined);
    clearNativeTextSelection();
  }, [scale]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      selectionPointerActiveRef.current = Boolean(
        event.target instanceof Node && viewportRef.current?.contains(event.target),
      );
    };
    const handlePointerUp = () => {
      selectionPointerActiveRef.current = false;
    };
    const handleSelectionChange = () => {
      if (selectionPointerActiveRef.current) return;
      if (selectionFrameRef.current !== undefined) {
        window.cancelAnimationFrame(selectionFrameRef.current);
      }
      selectionFrameRef.current = window.requestAnimationFrame(() => {
        selectionFrameRef.current = undefined;
        const selection = window.getSelection();
        const anchorNode = selection?.anchorNode;
        const viewport = viewportRef.current;
        if (!selection || selection.isCollapsed || !anchorNode || !viewport?.contains(anchorNode)) {
          return;
        }
        const element = anchorNode instanceof HTMLElement ? anchorNode : anchorNode.parentElement;
        const textLayer = element?.closest<HTMLElement>("[data-reader-text-layer='true']");
        const frame = textLayer?.closest<HTMLElement>("[data-reader-page]");
        const pageNumber = Number(frame?.dataset.readerPage);
        if (!frame || !textLayer || !Number.isFinite(pageNumber)) return;
        const pageText = activeOcrPageText?.pageIndex === pageNumber - 1
          ? activeOcrPageText
          : undefined;
        setMeasuredSelection(measurePageTextSelection(textLayer, pageNumber, pageText));
      });
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("pointerup", handlePointerUp);
    document.addEventListener("pointercancel", handlePointerUp);
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("pointerup", handlePointerUp);
      document.removeEventListener("pointercancel", handlePointerUp);
      document.removeEventListener("selectionchange", handleSelectionChange);
      if (selectionFrameRef.current !== undefined) {
        window.cancelAnimationFrame(selectionFrameRef.current);
        selectionFrameRef.current = undefined;
      }
    };
  }, [activeOcrPageText]);

  useEffect(() => {
    if (!searchOpen && !evidenceOpen) return;
    setMeasuredSelection(undefined);
    clearNativeTextSelection();
  }, [evidenceOpen, searchOpen]);

  useEffect(() => {
    if (!activeVersionId) return undefined;
    const controller = new AbortController();
    const versionEpoch = versionEpochRef.current;
    const annotationRequestSequence = ++annotationListSequenceRef.current;
    const annotationMutationSequence = annotationMutationSequenceRef.current;
    const savedEvidenceRequestSequence = ++savedEvidenceListSequenceRef.current;
    const savedEvidenceMutationSequence = savedEvidenceMutationSequenceRef.current;
    void Promise.all([
      service.listAnnotations({ ...target, versionId: activeVersionId }, controller.signal),
      service.listSavedEvidence({ ...target, versionId: activeVersionId }, controller.signal),
    ]).then(([nextAnnotations, nextEvidence]) => {
      if (controller.signal.aborted || versionEpochRef.current !== versionEpoch) return;
      if (
        annotationListSequenceRef.current === annotationRequestSequence
        && annotationMutationSequenceRef.current === annotationMutationSequence
      ) setAnnotations(nextAnnotations);
      if (
        savedEvidenceListSequenceRef.current === savedEvidenceRequestSequence
        && savedEvidenceMutationSequenceRef.current === savedEvidenceMutationSequence
      ) setSavedEvidence(nextEvidence);
    }).catch(() => {
      // The evidence sheet performs an explicit refresh and reports failures.
    });
    return () => controller.abort();
  }, [activeVersionId, service, target]);

  useEffect(() => {
    if (!evidenceOpen || !activeVersionId) return undefined;
    const controller = new AbortController();
    const versionEpoch = versionEpochRef.current;
    const refreshSequence = ++evidenceRefreshSequenceRef.current;
    const annotationRequestSequence = ++annotationListSequenceRef.current;
    const annotationMutationSequence = annotationMutationSequenceRef.current;
    const savedEvidenceRequestSequence = ++savedEvidenceListSequenceRef.current;
    const savedEvidenceMutationSequence = savedEvidenceMutationSequenceRef.current;
    setEvidenceBusy(true);
    setEvidenceError(undefined);
    void Promise.all([
      service.listAnnotations({ ...target, versionId: activeVersionId }, controller.signal),
      service.listSavedEvidence({ ...target, versionId: activeVersionId }, controller.signal),
    ]).then(([nextAnnotations, nextEvidence]) => {
      if (controller.signal.aborted || versionEpochRef.current !== versionEpoch) return;
      if (
        annotationListSequenceRef.current === annotationRequestSequence
        && annotationMutationSequenceRef.current === annotationMutationSequence
      ) setAnnotations(nextAnnotations);
      if (
        savedEvidenceListSequenceRef.current === savedEvidenceRequestSequence
        && savedEvidenceMutationSequenceRef.current === savedEvidenceMutationSequence
      ) setSavedEvidence(nextEvidence);
      if (evidenceRefreshSequenceRef.current === refreshSequence) setEvidenceBusy(false);
    }).catch((error) => {
      if (
        controller.signal.aborted
        || versionEpochRef.current !== versionEpoch
        || evidenceRefreshSequenceRef.current !== refreshSequence
        || isAbortError(error)
      ) return;
      setEvidenceError(readerErrorMessage(error, "证据读取失败。"));
      setEvidenceBusy(false);
    });
    return () => controller.abort();
  }, [activeVersionId, evidenceOpen, service, target]);

  useEffect(() => {
    if (!evidenceOpen || !activeVersionId || !service.loadDetails) return undefined;
    const controller = new AbortController();
    const versionEpoch = versionEpochRef.current;
    setDetails(undefined);
    setDetailsError(undefined);
    void service.loadDetails({ ...target, versionId: activeVersionId }, controller.signal)
      .then((next) => {
        if (!controller.signal.aborted && versionEpochRef.current === versionEpoch) setDetails(next);
      })
      .catch((error) => {
        if (
          !controller.signal.aborted
          && versionEpochRef.current === versionEpoch
          && !isAbortError(error)
        ) setDetailsError(readerErrorMessage(error, "文档详情读取失败。"));
      });
    return () => controller.abort();
  }, [activeVersionId, evidenceOpen, service, target]);

  useEffect(() => {
    if (!evidenceOpen || !activeVersionId) return undefined;
    const controller = new AbortController();
    const versionEpoch = versionEpochRef.current;
    const versionId = activeVersionId;
    const pageIndex = Math.max(0, currentPage - 1);
    setOcrError(undefined);
    void Promise.all([
      service.loadOcrCapability?.(controller.signal) ?? Promise.resolve(undefined),
      service.loadCurrentOcr?.({ ...target, versionId, pageIndex }, controller.signal)
        ?? Promise.resolve(undefined),
    ]).then(([capability, snapshot]) => {
      if (controller.signal.aborted || versionEpochRef.current !== versionEpoch) return;
      if (capability) setOcrCapability(capability);
      setOcrSnapshot(snapshot);
    }).catch((error) => {
      if (!controller.signal.aborted && versionEpochRef.current === versionEpoch && !isAbortError(error)) {
        setOcrError(readerErrorMessage(error, "当前页文字来源读取失败。"));
      }
    });
    return () => controller.abort();
  }, [activeVersionId, currentPage, evidenceOpen, service, target]);

  useEffect(() => {
    if (!activeVersionId) return undefined;
    const controller = new AbortController();
    const versionEpoch = versionEpochRef.current;
    const versionId = activeVersionId;
    const pageIndex = Math.max(0, currentPage - 1);
    void (async () => {
      const preference = await service.loadSourcePreference(
        { ...target, versionId, pageIndex },
        controller.signal,
      );
      const resolvedPreference = preference?.preference ?? "auto";
      if (controller.signal.aborted || versionEpochRef.current !== versionEpoch) return;
      setSourcePreference(resolvedPreference);
      try {
        const pageText = await service.loadPageText(
          { ...target, versionId, pageIndex },
          controller.signal,
        );
        if (controller.signal.aborted || versionEpochRef.current !== versionEpoch) return;
        setActiveOcrPageText(pageText.sourceKind === "ocr" ? pageText : undefined);
      } catch (error) {
        if (controller.signal.aborted || versionEpochRef.current !== versionEpoch || isAbortError(error)) return;
        setActiveOcrPageText(undefined);
        if (resolvedPreference !== "auto" || !isPageTextSourceUnavailableError(error)) throw error;
      }
    })().catch((error) => {
      if (controller.signal.aborted || versionEpochRef.current !== versionEpoch || isAbortError(error)) return;
      if (evidenceOpen) setOcrError(readerErrorMessage(error, "当前页文字来源读取失败。"));
    });
    return () => controller.abort();
  }, [activeVersionId, currentPage, evidenceOpen, service, target]);

  useEffect(() => {
    if (
      !activeVersionId
      || !ocrSnapshot?.jobId
      || !["awaiting-upload", "queued", "running"].includes(ocrSnapshot.state)
      || !service.loadOcrSnapshot
    ) return undefined;
    const controller = new AbortController();
    const epoch = ++ocrPollEpochRef.current;
    const versionEpoch = versionEpochRef.current;
    const versionId = activeVersionId;
    const jobId = ocrSnapshot.jobId;
    const loadOcrSnapshot = service.loadOcrSnapshot;
    let timer: number | undefined;
    const poll = async () => {
      if (controller.signal.aborted || ocrPollEpochRef.current !== epoch) return;
      try {
        const next = await loadOcrSnapshot(
          { ...target, versionId, jobId },
          controller.signal,
        );
        if (controller.signal.aborted || versionEpochRef.current !== versionEpoch) return;
        setOcrSnapshot(next);
        if (["awaiting-upload", "queued", "running"].includes(next.state)) {
          timer = window.setTimeout(() => void poll(), 650);
          return;
        }
        setOcrBusy(false);
        if (next.state === "ready") {
          pageTextCacheRef.current.clear();
          if (next.pageIndex === currentPage - 1) {
            const pageText = await service.loadPageText(
              { ...target, versionId, pageIndex: next.pageIndex },
              controller.signal,
            );
            if (!controller.signal.aborted && pageText.sourceKind === "ocr") {
              setActiveOcrPageText(pageText);
            }
          }
        } else if (next.state === "failed") {
          setOcrError(next.errorCode ?? "当前页识别失败。");
        }
      } catch (error) {
        if (!controller.signal.aborted && !isAbortError(error)) {
          setOcrError(readerErrorMessage(error, "OCR 状态读取失败。"));
          timer = window.setTimeout(() => void poll(), 1_400);
        }
      }
    };
    timer = window.setTimeout(() => void poll(), 450);
    return () => {
      controller.abort();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [activeVersionId, currentPage, ocrSnapshot?.jobId, ocrSnapshot?.state, service, target]);

  const updatePageFromViewport = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const pageElements = Array.from(viewport.querySelectorAll<HTMLElement>("[data-reader-page]"));
    const viewportTop = viewport.getBoundingClientRect().top;
    let nearest = currentPage;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const page of pageElements) {
      const distance = Math.abs(page.getBoundingClientRect().top - viewportTop - 12);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = Number(page.dataset.readerPage) || nearest;
      }
    }
    setScrollOffset(Math.max(0, viewport.scrollTop));
    if (nearest !== currentPage) {
      setCurrentPage(nearest);
      setPageDraft(String(nearest));
    }
  };

  const handleViewportScroll = () => {
    if (measuredSelection) setMeasuredSelection(undefined);
    if (scrollFrameRef.current !== undefined) return;
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = undefined;
      updatePageFromViewport();
    });
  };

  useEffect(() => {
    mountedRef.current = true;
    const handlePageHide = () => void flushReaderStateRef.current();
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      mountedRef.current = false;
      manifestRequestRef.current.sequence += 1;
      manifestRequestRef.current.controller?.abort();
      manifestRequestRef.current.controller = undefined;
      if (scrollFrameRef.current !== undefined) window.cancelAnimationFrame(scrollFrameRef.current);
      searchAbortRef.current?.abort();
      window.removeEventListener("pagehide", handlePageHide);
      void flushReaderStateRef.current();
    };
  }, []);

  const goToPage = useCallback((requested: number) => {
    const next = clamp(Math.round(requested), 1, pageCount);
    setCurrentPage(next);
    setPageDraft(String(next));
    const viewport = viewportRef.current;
    if (viewport) scrollReaderViewportToPage(viewport, next, "smooth");
  }, [pageCount]);

  useEffect(() => {
    if (!initialEvidenceAnchor || !session || !activeVersionId) return undefined;
    if (initialEvidenceAnchor.documentVersionId !== activeVersionId) return undefined;
    if (initialEvidenceAnchor.pageIndex >= pageCount) return undefined;
    if (restoredEvidenceAnchorIdRef.current === initialEvidenceAnchor.id) return undefined;
    restoredEvidenceAnchorIdRef.current = initialEvidenceAnchor.id;
    setFocusedEvidenceAnchor(initialEvidenceAnchor);
    const frame = window.requestAnimationFrame(() => {
      goToPage(initialEvidenceAnchor.pageIndex + 1);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeVersionId, goToPage, initialEvidenceAnchor, pageCount, session]);

  const submitPage = (event?: FormEvent) => {
    event?.preventDefault();
    const requested = Number(pageDraft);
    if (Number.isFinite(requested)) goToPage(requested);
    else setPageDraft(String(currentPage));
  };

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    const query = searchQuery.trim();
    if (!activeVersionId || !query) return;
    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    const sequence = ++searchSequenceRef.current;
    const versionEpoch = versionEpochRef.current;
    const versionId = activeVersionId;
    const ownsSearch = () => (
      !controller.signal.aborted
      && searchSequenceRef.current === sequence
      && versionEpochRef.current === versionEpoch
    );
    setSearchBusy(true);
    setSearchError(undefined);
    setSearchHits([]);
    setSearchResolvedMode(undefined);
    setSearchFallbackReason(undefined);
    const request = service.searchIndex
      ? service.searchIndex(
          { ...target, versionId, query, mode: searchMode, limit: 100 },
          controller.signal,
        )
      : service.search(
          { ...target, versionId, query, limit: 100 },
          controller.signal,
        ).then((hits) => ({
          jobId: "lexical-compat",
          requestedMode: searchMode,
          resolvedMode: "lexical" as const,
          fallbackReason: searchMode === "hybrid" ? "SIDERA_DOCUMENT_INDEX_UNAVAILABLE" : undefined,
          hits,
        }));
    void request
      .then((result) => {
        if (!ownsSearch()) return;
        setSearchHits(result.hits);
        setSearchResolvedMode(result.resolvedMode);
        setSearchFallbackReason(result.fallbackReason ?? undefined);
        setSearchBusy(false);
        if (
          result.jobId !== "lexical-fallback"
          && result.jobId !== "lexical-compat"
          && service.loadIndexSnapshot
        ) {
          void service.loadIndexSnapshot(
            { ...target, versionId, jobId: result.jobId },
            controller.signal,
          ).then((next) => {
            if (ownsSearch()) setIndexSnapshot(next);
          }).catch(() => {
            // Search results remain authoritative; status can be refreshed later.
          });
        }
      })
      .catch((error) => {
        if (ownsSearch() && !isAbortError(error)) {
          setSearchError(readerErrorMessage(error, "全文搜索失败。"));
          setSearchBusy(false);
        }
      });
  };

  const chooseHit = (hit: DocumentSearchHit) => {
    setActiveHit(hit);
    setSearchOpen(false);
    window.requestAnimationFrame(() => goToPage(hit.anchor.pageNumber));
  };

  const startParse = () => {
    if (!activeVersionId) return;
    const versionEpoch = versionEpochRef.current;
    const versionId = activeVersionId;
    void service.startParse({ ...target, versionId })
      .then((next) => {
        if (versionEpochRef.current === versionEpoch) setParseSnapshot(next);
      })
      .catch((error) => {
        if (versionEpochRef.current === versionEpoch) {
          onNotice?.(readerErrorMessage(error, "解析任务启动失败。"), "error");
        }
      });
  };

  const cancelParse = () => {
    if (!activeVersionId) return;
    const versionEpoch = versionEpochRef.current;
    const versionId = activeVersionId;
    void service.cancelParse({
      ...target,
      versionId,
      runId: parseSnapshot?.runId,
    }).then((next) => {
      if (versionEpochRef.current === versionEpoch) setParseSnapshot(next);
    })
      .catch((error) => {
        if (versionEpochRef.current === versionEpoch) {
          onNotice?.(readerErrorMessage(error, "解析任务取消失败。"), "error");
        }
      });
  };

  const startIndex = useCallback(async () => {
    if (!activeVersionId || !service.startIndex || indexBusy) return;
    const versionEpoch = versionEpochRef.current;
    const versionId = activeVersionId;
    setIndexBusy(true);
    setIndexError(undefined);
    try {
      const next = await service.startIndex({ ...target, versionId, mode: "auto" });
      if (versionEpochRef.current !== versionEpoch) return;
      setIndexSnapshot(next);
    } catch (error) {
      if (versionEpochRef.current === versionEpoch) {
        setIndexError(readerErrorMessage(error, "全文索引启动失败。"));
      }
    } finally {
      if (versionEpochRef.current === versionEpoch) setIndexBusy(false);
    }
  }, [activeVersionId, indexBusy, service, target]);

  const changeIndexState = useCallback(async (action: "pause" | "resume" | "cancel") => {
    if (!activeVersionId || !indexSnapshot?.jobId || indexBusy) return;
    const operation = action === "pause"
      ? service.pauseIndex
      : action === "resume"
        ? service.resumeIndex
        : service.cancelIndex;
    if (!operation) return;
    const versionEpoch = versionEpochRef.current;
    const versionId = activeVersionId;
    const jobId = indexSnapshot.jobId;
    setIndexBusy(true);
    setIndexError(undefined);
    try {
      const next = await operation({ ...target, versionId, jobId });
      if (versionEpochRef.current === versionEpoch) setIndexSnapshot(next);
    } catch (error) {
      if (versionEpochRef.current === versionEpoch) {
        setIndexError(readerErrorMessage(error, "索引状态更新失败。"));
      }
    } finally {
      if (versionEpochRef.current === versionEpoch) setIndexBusy(false);
    }
  }, [activeVersionId, indexBusy, indexSnapshot?.jobId, service.cancelIndex, service.pauseIndex, service.resumeIndex, target]);

  const startPageOcr = useCallback(async (pageNumber: number) => {
    if (!activeVersionId || !session || !service.startOcr || ocrBusy) return;
    const versionEpoch = versionEpochRef.current;
    const versionId = activeVersionId;
    const pageIndex = Math.max(0, pageNumber - 1);
    setOcrBusy(true);
    setOcrError(undefined);
    try {
      const rendered = await session.renderPagePng({ pageNumber });
      if (versionEpochRef.current !== versionEpoch) return;
      const snapshot = await service.startOcr({
        ...target,
        versionId,
        pageIndex,
        png: rendered.blob,
      });
      if (versionEpochRef.current === versionEpoch) {
        if (activeOcrBatchJobRef.current !== undefined || ocrBatchProgress) {
          activeOcrBatchJobRef.current = snapshot.jobId;
        }
        setOcrSnapshot(snapshot);
      }
    } catch (error) {
      if (versionEpochRef.current === versionEpoch) {
        setOcrBusy(false);
        ocrBatchQueueRef.current = [];
        activeOcrBatchJobRef.current = undefined;
        setOcrBatchProgress(undefined);
        setOcrError(readerErrorMessage(error, "当前页识别启动失败。"));
      }
    }
  }, [activeVersionId, ocrBatchProgress, ocrBusy, service, session, target]);

  const startCurrentPageOcr = useCallback(async () => {
    await startPageOcr(currentPage);
  }, [currentPage, startPageOcr]);

  const startRecommendedPagesOcr = useCallback(async () => {
    if (!ocrBatchSelectedPages.length || ocrBusy || !ocrCapability?.installed) return;
    const queue = ocrBatchSelectedPages
      .filter((pageNumber) => recommendedOcrPages.includes(pageNumber))
      .slice(0, Math.min(8, ocrCapability.maxBatchPages));
    const [first, ...remaining] = queue;
    if (!first) return;
    ocrBatchQueueRef.current = remaining;
    activeOcrBatchJobRef.current = "pending";
    handledOcrBatchJobRef.current = undefined;
    setOcrBatchOpen(false);
    setOcrBatchProgress({ completed: 0, total: queue.length, pageNumber: first });
    await startPageOcr(first);
  }, [ocrBatchSelectedPages, ocrBusy, ocrCapability, recommendedOcrPages, startPageOcr]);

  useEffect(() => {
    if (!ocrBatchProgress || !ocrSnapshot?.jobId || ocrBusy) return;
    if (activeOcrBatchJobRef.current !== ocrSnapshot.jobId) return;
    if (!["ready", "failed", "cancelled", "superseded"].includes(ocrSnapshot.state)) return;
    if (handledOcrBatchJobRef.current === ocrSnapshot.jobId) return;
    handledOcrBatchJobRef.current = ocrSnapshot.jobId;
    if (ocrSnapshot.state !== "ready") {
      ocrBatchQueueRef.current = [];
      activeOcrBatchJobRef.current = undefined;
      setOcrBatchProgress(undefined);
      return;
    }
    const nextPage = ocrBatchQueueRef.current.shift();
    if (!nextPage) {
      activeOcrBatchJobRef.current = undefined;
      setOcrBatchProgress(undefined);
      if (activeVersionId && service.loadCurrentOcr) {
        const versionEpoch = versionEpochRef.current;
        void service.loadCurrentOcr({
          ...target,
          versionId: activeVersionId,
          pageIndex: Math.max(0, currentPage - 1),
        }).then((snapshot) => {
          if (versionEpochRef.current === versionEpoch) setOcrSnapshot(snapshot);
        }).catch((error) => {
          if (versionEpochRef.current === versionEpoch && !isAbortError(error)) {
            setOcrError(readerErrorMessage(error, "当前页识别状态读取失败。"));
          }
        });
      }
      return;
    }
    activeOcrBatchJobRef.current = undefined;
    setOcrBatchProgress((previous) => previous
      ? { ...previous, completed: previous.completed + 1, pageNumber: nextPage }
      : previous);
    void startPageOcr(nextPage);
  }, [
    activeVersionId,
    currentPage,
    ocrBatchProgress,
    ocrBusy,
    ocrSnapshot?.jobId,
    ocrSnapshot?.state,
    service,
    startPageOcr,
    target,
  ]);

  const changeTextSource = useCallback(async (preference: DocumentTextSourcePreference) => {
    if (!activeVersionId || evidenceMutationId) return;
    const versionEpoch = versionEpochRef.current;
    const versionId = activeVersionId;
    const pageIndex = Math.max(0, currentPage - 1);
    const previousPreference = sourcePreference;
    setOcrError(undefined);
    try {
      await service.saveSourcePreference({ ...target, versionId, pageIndex, preference });
      pageTextCacheRef.current.clear();
      const pageText = await service.loadPageText({ ...target, versionId, pageIndex });
      if (versionEpochRef.current !== versionEpoch) return;
      setSourcePreference(preference);
      setActiveOcrPageText(pageText.sourceKind === "ocr" ? pageText : undefined);
      setMeasuredSelection(undefined);
      clearNativeTextSelection();
    } catch (error) {
      if (versionEpochRef.current === versionEpoch) {
        try {
          await service.saveSourcePreference({
            ...target,
            versionId,
            pageIndex,
            preference: previousPreference,
          });
        } catch {
          // Preserve the original source-switch failure; the next load will
          // reconcile persisted preference if the rollback itself is unavailable.
        }
        setSourcePreference(previousPreference);
        setOcrError(readerErrorMessage(error, "文字来源切换失败。"));
      }
    }
  }, [activeVersionId, currentPage, evidenceMutationId, service, sourcePreference, target]);

  const cancelCurrentOcr = useCallback(async () => {
    if (!activeVersionId || !ocrSnapshot?.jobId || !service.cancelOcr) return;
    try {
      ocrBatchQueueRef.current = [];
      activeOcrBatchJobRef.current = undefined;
      setOcrBatchProgress(undefined);
      const next = await service.cancelOcr({
        ...target,
        versionId: activeVersionId,
        jobId: ocrSnapshot.jobId,
      });
      setOcrSnapshot(next);
      setOcrBusy(false);
    } catch (error) {
      setOcrError(readerErrorMessage(error, "OCR 取消失败。"));
    }
  }, [activeVersionId, ocrSnapshot?.jobId, service, target]);

  const resolveSelectionAnchor = useCallback(async (selection: DocumentReaderMeasuredSelection) => {
    const pageText = await ensurePageText(selection.pageNumber);
    return evidenceAnchorFromSelection(selection, pageText);
  }, [ensurePageText]);

  const finishSelectionAction = useCallback((anchor?: DocumentEvidenceAnchor) => {
    if (anchor) setFocusedEvidenceAnchor(anchor);
    setMeasuredSelection(undefined);
    clearNativeTextSelection();
  }, []);

  const saveSelectionHighlight = useCallback(async () => {
    if (!activeVersionId || !measuredSelection || selectionAction || evidenceMutationId) return;
    const versionEpoch = versionEpochRef.current;
    const versionId = activeVersionId;
    const mutationSequence = beginAnnotationMutationSequence();
    const actionToken = `annotation:${mutationSequence}:highlight`;
    selectionActionTokenRef.current = actionToken;
    setSelectionAction("highlight");
    try {
      const anchor = await resolveSelectionAnchor(measuredSelection);
      if (
        versionEpochRef.current !== versionEpoch
        || annotationMutationSequenceRef.current !== mutationSequence
      ) return;
      const saved = await service.saveAnnotation({
        ...target,
        versionId,
        annotationId: crypto.randomUUID(),
        kind: "highlight",
        colorToken: "yellow",
        anchor,
      });
      if (
        versionEpochRef.current !== versionEpoch
        || annotationMutationSequenceRef.current !== mutationSequence
      ) return;
      setAnnotations((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      finishSelectionAction(saved.resolvedAnchor ?? saved.anchor);
    } catch (error) {
      if (
        versionEpochRef.current === versionEpoch
        && annotationMutationSequenceRef.current === mutationSequence
      ) {
        onNotice?.(readerErrorMessage(error, "高亮保存失败。"), "error");
      }
    } finally {
      settleAnnotationMutationSequence(mutationSequence);
      if (selectionActionTokenRef.current === actionToken) {
        selectionActionTokenRef.current = undefined;
        setSelectionAction(undefined);
      }
    }
  }, [activeVersionId, beginAnnotationMutationSequence, evidenceMutationId, finishSelectionAction, measuredSelection, onNotice, resolveSelectionAnchor, selectionAction, service, settleAnnotationMutationSequence, target]);

  const beginSelectionNote = useCallback(() => {
    if (!measuredSelection || selectionAction || evidenceMutationId) return;
    setNoteSelection(measuredSelection);
    setNoteDraft("");
    setEvidenceOpen(true);
    setMeasuredSelection(undefined);
    clearNativeTextSelection();
  }, [evidenceMutationId, measuredSelection, selectionAction]);

  const saveSelectionEvidence = useCallback(async () => {
    if (!activeVersionId || !measuredSelection || selectionAction || evidenceMutationId) return;
    const versionEpoch = versionEpochRef.current;
    const versionId = activeVersionId;
    const mutationSequence = beginSavedEvidenceMutationSequence();
    const actionToken = `evidence:${mutationSequence}:evidence`;
    selectionActionTokenRef.current = actionToken;
    setSelectionAction("evidence");
    try {
      const anchor = await resolveSelectionAnchor(measuredSelection);
      if (
        versionEpochRef.current !== versionEpoch
        || savedEvidenceMutationSequenceRef.current !== mutationSequence
      ) return;
      const saved = await service.saveEvidence({
        ...target,
        versionId,
        evidenceId: crypto.randomUUID(),
        anchor,
      });
      if (
        versionEpochRef.current !== versionEpoch
        || savedEvidenceMutationSequenceRef.current !== mutationSequence
      ) return;
      setSavedEvidence((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      finishSelectionAction(saved.resolvedAnchor ?? saved.anchor);
    } catch (error) {
      if (
        versionEpochRef.current === versionEpoch
        && savedEvidenceMutationSequenceRef.current === mutationSequence
      ) {
        onNotice?.(readerErrorMessage(error, "证据保存失败。"), "error");
      }
    } finally {
      settleSavedEvidenceMutationSequence(mutationSequence);
      if (selectionActionTokenRef.current === actionToken) {
        selectionActionTokenRef.current = undefined;
        setSelectionAction(undefined);
      }
    }
  }, [activeVersionId, beginSavedEvidenceMutationSequence, evidenceMutationId, finishSelectionAction, measuredSelection, onNotice, resolveSelectionAnchor, selectionAction, service, settleSavedEvidenceMutationSequence, target]);

  const saveSelectionNote = useCallback(async () => {
    if (!activeVersionId || !noteSelection || !noteDraft.trim() || selectionAction || evidenceMutationId) return;
    const versionEpoch = versionEpochRef.current;
    const versionId = activeVersionId;
    const mutationSequence = beginAnnotationMutationSequence();
    const actionToken = `annotation:${mutationSequence}:note`;
    selectionActionTokenRef.current = actionToken;
    setSelectionAction("note");
    try {
      const anchor = await resolveSelectionAnchor(noteSelection);
      if (
        versionEpochRef.current !== versionEpoch
        || annotationMutationSequenceRef.current !== mutationSequence
      ) return;
      const saved = await service.saveAnnotation({
        ...target,
        versionId,
        annotationId: crypto.randomUUID(),
        kind: "note",
        colorToken: "blue",
        noteText: noteDraft.trim(),
        anchor,
      });
      if (
        versionEpochRef.current !== versionEpoch
        || annotationMutationSequenceRef.current !== mutationSequence
      ) return;
      setAnnotations((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setNoteSelection(undefined);
      setNoteDraft("");
      setFocusedEvidenceAnchor(saved.resolvedAnchor ?? saved.anchor);
    } catch (error) {
      if (
        versionEpochRef.current === versionEpoch
        && annotationMutationSequenceRef.current === mutationSequence
      ) {
        onNotice?.(readerErrorMessage(error, "批注保存失败。"), "error");
      }
    } finally {
      settleAnnotationMutationSequence(mutationSequence);
      if (selectionActionTokenRef.current === actionToken) {
        selectionActionTokenRef.current = undefined;
        setSelectionAction(undefined);
      }
    }
  }, [activeVersionId, beginAnnotationMutationSequence, evidenceMutationId, noteDraft, noteSelection, onNotice, resolveSelectionAnchor, selectionAction, service, settleAnnotationMutationSequence, target]);

  const beginAnnotationEdit = useCallback((annotation: DocumentAnnotation) => {
    if (annotation.kind !== "note" || evidenceMutationId || selectionAction) return;
    setNoteSelection(undefined);
    setEditingAnnotation(annotation);
    setNoteDraft(annotation.noteText ?? "");
  }, [evidenceMutationId, selectionAction]);

  const saveEditedAnnotation = useCallback(async () => {
    if (!activeVersionId || !editingAnnotation || !noteDraft.trim() || evidenceMutationId || selectionAction) return;
    const versionEpoch = versionEpochRef.current;
    const versionId = activeVersionId;
    const mutationId = editingAnnotation.id;
    const mutationSequence = beginAnnotationMutationSequence();
    setEvidenceMutationId(mutationId);
    try {
      const saved = await service.saveAnnotation({
        ...target,
        versionId,
        annotationId: mutationId,
        kind: editingAnnotation.kind,
        colorToken: editingAnnotation.colorToken,
        noteText: noteDraft.trim(),
        anchor: editingAnnotation.anchor,
      });
      if (
        versionEpochRef.current !== versionEpoch
        || annotationMutationSequenceRef.current !== mutationSequence
      ) return;
      setAnnotations((current) => current.map((item) => item.id === saved.id ? saved : item));
      setEditingAnnotation(undefined);
      setNoteDraft("");
    } catch (error) {
      if (
        versionEpochRef.current === versionEpoch
        && annotationMutationSequenceRef.current === mutationSequence
      ) {
        onNotice?.(readerErrorMessage(error, "批注更新失败。"), "error");
      }
    } finally {
      settleAnnotationMutationSequence(mutationSequence);
      if (versionEpochRef.current === versionEpoch) setEvidenceMutationId(undefined);
    }
  }, [activeVersionId, beginAnnotationMutationSequence, editingAnnotation, evidenceMutationId, noteDraft, onNotice, selectionAction, service, settleAnnotationMutationSequence, target]);

  const focusEvidenceAnchor = useCallback((anchor: DocumentEvidenceAnchor) => {
    setFocusedEvidenceAnchor(anchor);
    setEvidenceOpen(false);
    window.requestAnimationFrame(() => goToPage(anchor.pageIndex + 1));
  }, [goToPage]);

  const openEvidenceAgent = useCallback((scope: SideraReadingContextScope) => {
    setAgentScope(scope);
    setAgentDraft("");
    setAgentOpenedAtMs(Date.now());
    setAgentOpen(true);
  }, []);

  const openSelectedEvidenceAgent = useCallback(async () => {
    if (!activeVersionId || !measuredSelection || !onAskEvidence) return;
    try {
      const anchor = await resolveSelectionAnchor(measuredSelection);
      selectionBeforeAgentRef.current = measuredSelection;
      setFocusedEvidenceAnchor(anchor);
      setMeasuredSelection(undefined);
      openEvidenceAgent({
        kind: "selected-anchor",
        paperId,
        documentVersionId: activeVersionId,
        pageIndex: anchor.pageIndex,
        anchor,
      });
    } catch (error) {
      onNotice?.(readerErrorMessage(error, "所选证据暂时无法用于提问。"), "error");
    }
  }, [activeVersionId, measuredSelection, onAskEvidence, onNotice, openEvidenceAgent, paperId, resolveSelectionAnchor]);

  const openPageEvidenceAgent = useCallback((kind: "current-page" | "document-retrieval") => {
    if (!activeVersionId || !onAskEvidence) return;
    openEvidenceAgent({
      kind,
      paperId,
      documentVersionId: activeVersionId,
      ...(kind === "current-page" ? { pageIndex: currentPage - 1 } : {}),
    });
  }, [activeVersionId, currentPage, onAskEvidence, openEvidenceAgent, paperId]);

  const closeEvidenceAgent = useCallback(() => {
    setAgentOpen(false);
    const previousSelection = selectionBeforeAgentRef.current;
    selectionBeforeAgentRef.current = undefined;
    if (previousSelection) setMeasuredSelection(previousSelection);
  }, []);

  const submitEvidenceAgentQuestion = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const prompt = agentDraft.trim();
    if (!prompt || !agentScope || !onAskEvidence || agentGenerating) return;
    setAgentDraft("");
    onAskEvidence(prompt, agentScope);
  }, [agentDraft, agentGenerating, agentScope, onAskEvidence]);

  const activeEvidenceAgentTurn = useMemo(() => (
    [...agentConversationTurns]
      .reverse()
      .find((turn) => turn.submittedAtMs >= agentOpenedAtMs)
  ), [agentConversationTurns, agentOpenedAtMs]);

  const removeAnnotation = useCallback(async (annotationId: string) => {
    if (!activeVersionId || evidenceMutationId || selectionAction) return;
    const versionEpoch = versionEpochRef.current;
    const versionId = activeVersionId;
    const mutationSequence = beginAnnotationMutationSequence();
    setEvidenceMutationId(annotationId);
    try {
      const deleted = await service.deleteAnnotation({ ...target, versionId, annotationId });
      if (
        versionEpochRef.current !== versionEpoch
        || annotationMutationSequenceRef.current !== mutationSequence
      ) return;
      if (!deleted) throw new Error("SIDERA_DOCUMENT_ANNOTATION_NOT_FOUND");
      setAnnotations((current) => current.filter((item) => item.id !== annotationId));
      setEditingAnnotation((current) => current?.id === annotationId ? undefined : current);
    } catch (error) {
      if (
        versionEpochRef.current === versionEpoch
        && annotationMutationSequenceRef.current === mutationSequence
      ) {
        onNotice?.(readerErrorMessage(error, "批注删除失败。"), "error");
      }
    } finally {
      settleAnnotationMutationSequence(mutationSequence);
      if (versionEpochRef.current === versionEpoch) setEvidenceMutationId(undefined);
    }
  }, [activeVersionId, beginAnnotationMutationSequence, evidenceMutationId, onNotice, selectionAction, service, settleAnnotationMutationSequence, target]);

  const removeSavedEvidence = useCallback(async (evidenceId: string) => {
    if (!activeVersionId || evidenceMutationId || selectionAction) return;
    const versionEpoch = versionEpochRef.current;
    const versionId = activeVersionId;
    const mutationSequence = beginSavedEvidenceMutationSequence();
    setEvidenceMutationId(evidenceId);
    try {
      const deleted = await service.deleteEvidence({ ...target, versionId, evidenceId });
      if (
        versionEpochRef.current !== versionEpoch
        || savedEvidenceMutationSequenceRef.current !== mutationSequence
      ) return;
      if (!deleted) throw new Error("SIDERA_DOCUMENT_SAVED_EVIDENCE_NOT_FOUND");
      setSavedEvidence((current) => current.filter((item) => item.id !== evidenceId));
    } catch (error) {
      if (
        versionEpochRef.current === versionEpoch
        && savedEvidenceMutationSequenceRef.current === mutationSequence
      ) {
        onNotice?.(readerErrorMessage(error, "证据删除失败。"), "error");
      }
    } finally {
      settleSavedEvidenceMutationSequence(mutationSequence);
      if (versionEpochRef.current === versionEpoch) setEvidenceMutationId(undefined);
    }
  }, [activeVersionId, beginSavedEvidenceMutationSequence, evidenceMutationId, onNotice, selectionAction, service, settleSavedEvidenceMutationSequence, target]);

  const activeHighlights = useMemo(() => {
    const byPage = new Map<number, DocumentPdfHighlight[]>();
    const append = (
      pageNumber: number,
      rects: DocumentPageRect[],
      colorToken: DocumentPdfHighlight["colorToken"],
    ) => {
      if (rects.length === 0) return;
      byPage.set(pageNumber, [
        ...(byPage.get(pageNumber) ?? []),
        ...rects.map((rect) => ({ ...rect, colorToken })),
      ]);
    };
    if (activeHit) append(activeHit.anchor.pageNumber, activeHit.anchor.rects, "search");
    for (const annotation of annotations) {
      const resolved = annotation.resolvedAnchor
        ?? (annotation.resolution === "exact" ? annotation.anchor : undefined);
      if (
        annotation.kind === "highlight"
        && annotation.status === "active"
        && resolved
        && (annotation.resolution === "exact" || annotation.resolution === "reanchored")
      ) {
        append(resolved.pageIndex + 1, resolved.rects, annotation.colorToken);
      }
    }
    if (focusedEvidenceAnchor) {
      append(focusedEvidenceAnchor.pageIndex + 1, focusedEvidenceAnchor.rects, "blue");
    }
    return byPage;
  }, [activeHit, annotations, focusedEvidenceAnchor]);

  const visiblePages = useMemo(() => {
    if (!manifest) return [];
    const count = session?.pageCount
      ?? Math.max(1, manifest.pageCount, manifest.pages.length);
    const parsedByPage = new Map(manifest.pages.map((page) => [page.pageNumber, page]));
    return Array.from({ length: count }, (_, index) => {
      const pageNumber = index + 1;
      return parsedByPage.get(pageNumber) ?? {
        pageNumber,
        pageLabel: String(pageNumber),
        width: 612,
        height: 792,
        textAvailable: false,
      };
    });
  }, [manifest, session?.pageCount]);

  useEffect(() => {
    const pending = pendingRestoreRef.current;
    if (!manifest || !pending) return undefined;
    const rendererReady = Boolean(session) || Boolean(sessionError);
    if (!rendererReady) return undefined;
    const pageCountIsAuthoritative = Boolean(session)
      || manifest.pages.length > 0
      || (manifest.parseState === "ready" && manifest.pageCount > 0);
    if (!pageCountIsAuthoritative) return undefined;

    const sequence = manifestRequestRef.current.sequence;
    const actualPageCount = Math.max(1, session?.pageCount ?? manifest.pageCount);
    const restoredPage = clamp(pending.pageNumber, 1, actualPageCount);
    const restoredScale = clamp(pending.scale, MIN_SCALE, MAX_SCALE);
    let secondFrame = 0;
    let reapplyTimer = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        if (
          !mountedRef.current
          || manifestRequestRef.current.sequence !== sequence
          || pendingRestoreRef.current !== pending
        ) return;
        setCurrentPage(restoredPage);
        setPageDraft(String(restoredPage));
        setScale(restoredScale);
        setScrollOffset(Math.max(0, pending.scrollOffset));
        const applyPosition = () => {
          const viewport = viewportRef.current;
          if (!viewport) return;
          if (pending.scrollOffset > 0) {
            viewport.scrollTo({ top: pending.scrollOffset, behavior: "auto" });
          } else {
            scrollReaderViewportToPage(viewport, restoredPage, "auto");
          }
        };
        applyPosition();
        restoredRef.current = true;
        pendingRestoreRef.current = undefined;
        reapplyTimer = window.setTimeout(applyPosition, 180);
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
      if (reapplyTimer) window.clearTimeout(reapplyTimer);
    };
  }, [manifest, session, sessionError, visiblePages.length]);

  const safeContentUri = manifest?.contentUri.startsWith("sidera-document://")
    ? manifest.contentUri
    : undefined;

  return (
    <section className="document-reader-shell" aria-label="全文阅读台">
      <header className="document-reader-toolbar">
        <button
          type="button"
          className="document-reader-icon-button"
          onClick={() => void flushReaderState().finally(onBack)}
          aria-label="返回论文"
        >
          <ArrowLeft size={16} aria-hidden="true" />
        </button>
        <div className="document-reader-title" title={manifest?.title || title}>
          <strong>{manifest?.title || title}</strong>
          {activeParseState ? (
            <span data-state={activeParseState}>{parseStateLabel(activeParseState)}</span>
          ) : null}
        </div>
        <form className="document-reader-page-control" onSubmit={submitPage}>
          <button type="button" onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1} aria-label="上一页">
            <ChevronLeft size={15} aria-hidden="true" />
          </button>
          <input
            value={pageDraft}
            onChange={(event) => setPageDraft(event.target.value.replace(/\D/g, ""))}
            onBlur={() => submitPage()}
            inputMode="numeric"
            aria-label="当前页码"
          />
          <span>/ {pageCount}</span>
          <button type="button" onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= pageCount} aria-label="下一页">
            <ChevronRight size={15} aria-hidden="true" />
          </button>
        </form>
        <div className="document-reader-scale-control" aria-label="页面缩放">
          <button type="button" onClick={() => setScale((value) => stepScale(value, -1))} aria-label="缩小">
            <Minus size={14} aria-hidden="true" />
          </button>
          <span>{Math.round(scale * 100)}%</span>
          <button type="button" onClick={() => setScale((value) => stepScale(value, 1))} aria-label="放大">
            <Plus size={14} aria-hidden="true" />
          </button>
        </div>
        <button
          type="button"
          className="document-reader-toolbar-button document-reader-toolbar-button--icon"
          onClick={() => setSearchOpen(true)}
          disabled={!hasSearchableDocumentText}
          aria-label="全文搜索"
          title="全文搜索"
        >
          <Search size={15} aria-hidden="true" />
        </button>
        <button type="button" className="document-reader-toolbar-button" onClick={() => setEvidenceOpen(true)}>
          {indexSnapshot?.state === "queued" || indexSnapshot?.state === "running" ? (
            <LoaderCircle size={15} className="document-reader-spin" aria-hidden="true" />
          ) : (
            <Bookmark size={15} aria-hidden="true" />
          )}
          证据
          {annotations.length + savedEvidence.length > 0 ? (
            <span className="document-reader-toolbar-count">
              {annotations.length + savedEvidence.length}
            </span>
          ) : null}
        </button>
      </header>

      <div
        ref={viewportRef}
        className="document-reader-viewport"
        onScroll={handleViewportScroll}
        aria-busy={!manifest && !manifestError}
      >
        {!manifest && !manifestError ? (
          <div className="document-reader-inline-state" role="status">
            <LoaderCircle size={16} className="document-reader-spin" aria-hidden="true" />
            正在读取全文…
          </div>
        ) : null}
        {manifestError ? (
          <div className="document-reader-inline-state" role="alert">
            <span>{manifestError}</span>
            <button type="button" onClick={() => loadManifest(requestedVersionId)}>
              <RotateCcw size={14} aria-hidden="true" />重试
            </button>
          </div>
        ) : null}
        {manifest && !safeContentUri ? (
          <div className="document-reader-inline-state" role="alert">
            文档地址未通过受控本地协议校验。
          </div>
        ) : null}
        {manifest && session ? (
          <div className="document-reader-pages" data-renderer="pdfjs">
            {visiblePages.map((page) => (
              <PdfPageCanvas
                key={`${manifest.documentVersionId}:${page.pageNumber}`}
                session={session}
                pageNumber={page.pageNumber}
                pageLabel={page.pageLabel}
                width={page.width}
                height={page.height}
                scale={scale}
                root={viewportRef.current}
                highlights={activeHighlights.get(page.pageNumber) ?? EMPTY_PAGE_RECTS}
                sourcePageText={page.pageNumber === currentPage ? activeOcrPageText : undefined}
                selection={measuredSelection?.pageNumber === page.pageNumber
                  ? measuredSelection
                  : undefined}
                onNearViewport={prefetchVisiblePageText}
                onSelectionChange={setMeasuredSelection}
              />
            ))}
          </div>
        ) : null}
        {manifest && !session && !sessionError && safeContentUri ? (
          <div className="document-reader-inline-state" role="status">
            <LoaderCircle size={16} className="document-reader-spin" aria-hidden="true" />
            正在准备本地 PDF 渲染器…
          </div>
        ) : null}
        {manifest && !session && sessionError && safeContentUri ? (
          <div className="document-reader-inline-state" role="alert" data-renderer="pdfjs-error">
            <span>PDF 页面渲染器未能启动：{sessionError}</span>
            <button type="button" onClick={() => setRendererRevision((value) => value + 1)}>
              <RotateCcw size={14} aria-hidden="true" />重试
            </button>
          </div>
        ) : null}
      </div>

      {measuredSelection ? (
        <div
          className="document-reader-selection-menu"
          role="toolbar"
          aria-label="选中文本操作"
          data-busy={selectionAction || evidenceMutationId ? "true" : "false"}
          style={{
            left: `${clamp(measuredSelection.viewportAnchor.left, 118, Math.max(118, window.innerWidth - 118))}px`,
            top: `${Math.max(96, measuredSelection.viewportAnchor.top)}px`,
          }}
        >
          <button
            type="button"
            onClick={() => void saveSelectionHighlight()}
            disabled={Boolean(selectionAction || evidenceMutationId)}
          >
            <Highlighter size={14} aria-hidden="true" />高亮
          </button>
          <button type="button" onClick={beginSelectionNote} disabled={Boolean(selectionAction || evidenceMutationId)}>
            <MessageSquare size={14} aria-hidden="true" />添加批注
          </button>
          <button
            type="button"
            onClick={() => void saveSelectionEvidence()}
            disabled={Boolean(selectionAction || evidenceMutationId)}
          >
            <Bookmark size={14} aria-hidden="true" />保存证据
          </button>
          {onAskEvidence ? (
            <button
              type="button"
              onClick={() => void openSelectedEvidenceAgent()}
              disabled={Boolean(selectionAction || evidenceMutationId)}
            >
              <Sparkles size={14} aria-hidden="true" />用此证据提问
            </button>
          ) : null}
        </div>
      ) : null}

      <footer className="document-reader-progress" aria-label={`阅读进度 ${currentPage} / ${pageCount}`}>
        <span style={{ width: `${clamp(currentPage / pageCount, 0, 1) * 100}%` }} />
      </footer>

      <WorkbenchSideSheet
        open={searchOpen}
        onOpenChange={setSearchOpen}
        title="全文搜索"
        description="在当前文档版本内检索，点击结果跳转到精确页面。"
        bodyClassName="document-reader-sheet"
      >
        <form className="document-reader-search-form" onSubmit={submitSearch}>
          <Search size={15} aria-hidden="true" />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="输入关键词"
            autoComplete="off"
            aria-label="全文搜索词"
          />
          <select
            value={searchMode}
            onChange={(event) => setSearchMode(event.target.value as DocumentIndexMode)}
            aria-label="检索模式"
          >
            <option value="auto">自动</option>
            <option value="lexical">词法</option>
            <option value="hybrid">混合</option>
          </select>
          <button type="submit" disabled={searchBusy || !searchQuery.trim()}>
            {searchBusy ? <LoaderCircle size={14} className="document-reader-spin" aria-hidden="true" /> : "搜索"}
          </button>
        </form>
        {searchResolvedMode ? (
          <p className="document-reader-search-mode" data-fallback={searchFallbackReason ? "true" : "false"}>
            实际使用 {searchModeLabel(searchResolvedMode)}
            {searchFallbackReason ? " · 语义索引尚不可用，已明确降级" : ""}
          </p>
        ) : null}
        {searchError ? <p className="document-reader-sheet-error" role="alert">{searchError}</p> : null}
        {!searchBusy && searchQuery.trim() && searchHits.length === 0 && !searchError ? (
          <p className="document-reader-sheet-muted">当前文档没有匹配结果。</p>
        ) : null}
        <div className="document-reader-search-results" aria-live="polite">
          {searchHits.map((hit) => (
            <button key={hit.anchor.id} type="button" onClick={() => chooseHit(hit)}>
              <span>第 {hit.anchor.pageNumber} 页</span>
              <strong>{hit.excerpt}</strong>
            </button>
          ))}
        </div>
      </WorkbenchSideSheet>

      <WorkbenchSideSheet
        id="document-reader-evidence-sheet"
        open={evidenceOpen && !agentOpen}
        onOpenChange={setEvidenceOpen}
        title="证据"
        description="选段、高亮和批注集中在这里，文档诊断保持折叠。"
        bodyClassName="document-reader-sheet document-reader-evidence-sheet"
      >
        {noteSelection || editingAnnotation ? (
          <section
            className="document-reader-note-composer"
            aria-label={editingAnnotation ? "编辑批注" : "新建批注"}
          >
            <span>
              {editingAnnotation
                ? `编辑第 ${editingAnnotation.anchor.pageLabel} 页批注`
                : `第 ${noteSelection?.pageNumber} 页选段`}
            </span>
            <blockquote>
              {editingAnnotation?.anchor.quote ?? noteSelection?.selectedText}
            </blockquote>
            <textarea
              value={noteDraft}
              onChange={(event) => setNoteDraft(event.target.value)}
              placeholder="写下这段内容为何重要"
              maxLength={4_000}
              aria-label="批注内容"
            />
            <div>
              <button
                type="button"
                onClick={() => {
                  setNoteSelection(undefined);
                  setEditingAnnotation(undefined);
                  setNoteDraft("");
                }}
                disabled={selectionAction === "note" || Boolean(evidenceMutationId)}
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void (editingAnnotation
                  ? saveEditedAnnotation()
                  : saveSelectionNote())}
                aria-busy={noteSaveBusy}
                disabled={
                  !noteDraft.trim()
                  || selectionAction === "note"
                  || Boolean(evidenceMutationId)
                }
              >
                {noteSaveBusy ? (
                  <LoaderCircle size={13} className="document-reader-spin" aria-hidden="true" />
                ) : (
                  <Save size={13} aria-hidden="true" />
                )}
                {editingAnnotation ? "更新批注" : "保存批注"}
              </button>
            </div>
          </section>
        ) : null}

        {evidenceBusy ? (
          <p className="document-reader-sheet-muted" role="status">
            <LoaderCircle size={13} className="document-reader-spin" aria-hidden="true" />
            正在读取本篇证据…
          </p>
        ) : null}
        {evidenceError ? <p className="document-reader-sheet-error" role="alert">{evidenceError}</p> : null}

        <section className="document-reader-ocr-status" aria-label="当前页文字来源">
          <div>
            <span>当前页文字来源</span>
            <strong>
              {activeOcrPageText?.sourceKind === "ocr"
                ? "OCR"
                : sourcePreference === "native"
                  ? "原生文本"
                  : "自动"}
            </strong>
            <small>
              {ocrCapability?.installed
                ? ocrSnapshot?.state === "ready"
                  ? `OCR 已就绪${ocrSnapshot.meanConfidence != null
                    ? ` · 平均置信度 ${Math.round(ocrSnapshot.meanConfidence * 100)}%`
                    : ""}`
                  : ocrSnapshot?.state === "cancelled"
                    ? "本次识别已取消，既有识别结果保持不变。"
                    : ocrSnapshot?.state === "failed"
                      ? "本次识别失败，既有识别结果保持不变。"
                  : ocrSnapshot && ["awaiting-upload", "queued", "running"].includes(ocrSnapshot.state)
                    ? ocrBatchProgress
                      ? `正在识别第 ${ocrBatchProgress.pageNumber} 页 · ${ocrBatchProgress.completed + 1}/${ocrBatchProgress.total}`
                      : "正在本机 CPU 上识别当前页"
                    : "原生文本与 OCR 并存，不会互相覆盖。"
                : "当前版本未安装 OCR。"}
            </small>
          </div>
          <nav aria-label="文字来源操作">
            {ocrCapability?.installed ? (
              <>
                <button
                  type="button"
                  onClick={() => void startCurrentPageOcr()}
                  disabled={ocrBusy || !service.startOcr || !session}
                >
                  {ocrBusy || (ocrSnapshot && ["awaiting-upload", "queued", "running"].includes(ocrSnapshot.state)) ? (
                    <LoaderCircle size={13} className="document-reader-spin" aria-hidden="true" />
                  ) : (
                    <ScanText size={13} aria-hidden="true" />
                  )}
                  {ocrSnapshot?.state === "ready" || activeOcrPageText?.sourceKind === "ocr"
                    ? "重新识别"
                    : "识别当前页"}
                </button>
                {ocrSnapshot && ["awaiting-upload", "queued", "running"].includes(ocrSnapshot.state) ? (
                  <button type="button" onClick={() => void cancelCurrentOcr()}>取消</button>
                ) : null}
                {recommendedOcrPages.length > 1 && !ocrBatchProgress && !ocrBusy ? (
                  <button
                    type="button"
                    onClick={() => {
                      setOcrBatchSelectedPages(recommendedOcrPages);
                      setOcrBatchOpen((open) => !open);
                    }}
                  >
                    建议页 · {recommendedOcrPages.length}
                  </button>
                ) : null}
              </>
            ) : null}
          </nav>
          {ocrBatchOpen ? (
            <div className="document-reader-ocr-batch" aria-label="选择建议识别页面">
              <span>选择需要识别的页面，最多 8 页：</span>
              <div>
                {recommendedOcrPages.map((pageNumber) => (
                  <button
                    key={pageNumber}
                    type="button"
                    aria-pressed={ocrBatchSelectedPages.includes(pageNumber)}
                    onClick={() => setOcrBatchSelectedPages((previous) => (
                      previous.includes(pageNumber)
                        ? previous.filter((selected) => selected !== pageNumber)
                        : [...previous, pageNumber].sort((left, right) => left - right)
                    ))}
                  >
                    第 {pageNumber} 页
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => void startRecommendedPagesOcr()}
                  disabled={!ocrBatchSelectedPages.length || ocrBusy}
                >
                  开始识别
                </button>
              </div>
            </div>
          ) : null}
          {ocrSnapshot?.state === "ready" || activeOcrPageText?.sourceKind === "ocr" ? (
            <div className="document-reader-source-choice" role="group" aria-label="选择文字来源">
              {(["auto", "native", "ocr"] as const).map((preference) => (
                <button
                  key={preference}
                  type="button"
                  data-active={sourcePreference === preference ? "true" : "false"}
                  onClick={() => void changeTextSource(preference)}
                >
                  {preference === "auto" ? "自动" : preference === "native" ? "原生" : "OCR"}
                </button>
              ))}
            </div>
          ) : null}
          {ocrError ? <p className="document-reader-sheet-error" role="alert">{ocrError}</p> : null}
        </section>

        {onAskEvidence ? (
          <nav className="document-reader-agent-actions" aria-label="文档证据提问">
            <button
              type="button"
              onClick={() => openPageEvidenceAgent("current-page")}
              disabled={!hasSearchableDocumentText}
            >
              <MessageSquare size={13} aria-hidden="true" />用当前页提问
            </button>
            <button
              type="button"
              onClick={() => openPageEvidenceAgent("document-retrieval")}
              disabled={indexSnapshot?.state !== "ready"}
              title={indexSnapshot?.state === "ready" ? undefined : "请先手动建立本文索引"}
            >
              <FileSearch size={13} aria-hidden="true" />检索本文提问
            </button>
          </nav>
        ) : null}

        <section className="document-reader-index-status" aria-label="全文索引">
          <div>
            <span>全文索引</span>
            <strong>
              {indexSnapshot ? indexStateLabel(indexSnapshot) : "按需建立"}
            </strong>
            <small>
              {indexSnapshot
                ? indexSnapshot.state === "ready" && indexSnapshot.resolvedMode
                  ? `${searchModeLabel(indexSnapshot.resolvedMode)} · ${indexSnapshot.segmentCount} 个片段`
                  : `${indexSnapshot.embeddedCount} / ${indexSnapshot.segmentCount} 个片段`
                : "未建立时搜索会明确使用词法模式。"}
            </small>
          </div>
          <nav aria-label="索引操作">
            {!indexSnapshot || ["failed", "cancelled", "superseded", "ready"].includes(indexSnapshot.state) ? (
              <button
                type="button"
                onClick={() => void startIndex()}
                disabled={indexBusy || !hasSearchableDocumentText || !service.startIndex}
              >
                <FileSearch size={13} aria-hidden="true" />
                {indexSnapshot?.state === "ready" ? "重建" : "建立"}
              </button>
            ) : null}
            {indexSnapshot?.state === "running" && service.pauseIndex ? (
              <button type="button" onClick={() => void changeIndexState("pause")} disabled={indexBusy}>
                <Pause size={13} aria-hidden="true" />暂停
              </button>
            ) : null}
            {indexSnapshot?.state === "paused" && service.resumeIndex ? (
              <button type="button" onClick={() => void changeIndexState("resume")} disabled={indexBusy}>
                <Play size={13} aria-hidden="true" />继续
              </button>
            ) : null}
            {indexSnapshot && ["queued", "running", "paused"].includes(indexSnapshot.state) && service.cancelIndex ? (
              <button type="button" onClick={() => void changeIndexState("cancel")} disabled={indexBusy}>
                <Square size={12} aria-hidden="true" />取消
              </button>
            ) : null}
          </nav>
          {indexSnapshot && indexSnapshot.segmentCount > 0 ? (
            <span className="document-reader-index-progress" aria-hidden="true">
              <i
                style={{
                  width: `${clamp(
                    indexSnapshot.state === "ready"
                      ? 1
                      : indexSnapshot.embeddedCount / indexSnapshot.segmentCount,
                    0,
                    1,
                  ) * 100}%`,
                }}
              />
            </span>
          ) : null}
          {indexError ? <p className="document-reader-sheet-error" role="alert">{indexError}</p> : null}
        </section>

        <section className="document-reader-evidence-section">
          <header><h3>高亮与批注</h3><span>{annotations.length}</span></header>
          {!evidenceBusy && annotations.length === 0 ? (
            <p>选中文本后可直接高亮，或在这里补充批注。</p>
          ) : null}
          <div className="document-reader-evidence-list">
            {annotations.map((annotation) => {
              const resolved = annotation.status === "active"
                ? annotation.resolvedAnchor
                  ?? (annotation.resolution === "exact" ? annotation.anchor : undefined)
                : undefined;
              return (
                <article
                  key={annotation.id}
                  data-resolution={annotation.resolution}
                  data-editable={annotation.kind === "note" ? "true" : "false"}
                >
                  <button
                    type="button"
                    className="document-reader-evidence-card"
                    onClick={() => resolved && focusEvidenceAnchor(resolved)}
                    disabled={!resolved}
                  >
                    <span>
                      {annotation.kind === "highlight" ? "高亮" : "批注"}
                      · 第 {annotation.anchor.pageLabel} 页
                    </span>
                    <strong>{annotation.anchor.quote}</strong>
                    {annotation.noteText ? <small>{annotation.noteText}</small> : null}
                    <em>{evidenceResolutionLabel(annotation.resolution)}</em>
                  </button>
                  {annotation.kind === "note" ? (
                    <button
                      type="button"
                      className="document-reader-evidence-edit"
                      onClick={() => beginAnnotationEdit(annotation)}
                      disabled={Boolean(evidenceMutationId || selectionAction)}
                      aria-label="编辑批注"
                    >
                      <Pencil size={13} aria-hidden="true" />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="document-reader-evidence-delete"
                    onClick={() => void removeAnnotation(annotation.id)}
                    disabled={Boolean(evidenceMutationId || selectionAction)}
                    aria-label="删除批注"
                  >
                    {evidenceMutationId === annotation.id ? (
                      <LoaderCircle size={13} className="document-reader-spin" aria-hidden="true" />
                    ) : (
                      <Trash2 size={13} aria-hidden="true" />
                    )}
                  </button>
                </article>
              );
            })}
          </div>
        </section>

        <section className="document-reader-evidence-section">
          <header><h3>已保存证据</h3><span>{savedEvidence.length}</span></header>
          {!evidenceBusy && savedEvidence.length === 0 ? (
            <p>选择关键原文并保存后，可从这里快速回到原页。</p>
          ) : null}
          <div className="document-reader-evidence-list">
            {savedEvidence.map((evidence) => {
              const resolved = evidence.status === "active"
                ? evidence.resolvedAnchor
                  ?? (evidence.resolution === "exact" ? evidence.anchor : undefined)
                : undefined;
              return (
                <article key={evidence.id} data-resolution={evidence.resolution}>
                  <button
                    type="button"
                    className="document-reader-evidence-card"
                    onClick={() => resolved && focusEvidenceAnchor(resolved)}
                    disabled={!resolved}
                  >
                    <span>{evidence.label || `第 ${evidence.anchor.pageLabel} 页`}</span>
                    <strong>{evidence.anchor.quote}</strong>
                    {evidence.noteText ? <small>{evidence.noteText}</small> : null}
                    <em>{evidenceResolutionLabel(evidence.resolution)}</em>
                  </button>
                  <button
                    type="button"
                    className="document-reader-evidence-delete"
                    onClick={() => void removeSavedEvidence(evidence.id)}
                    disabled={Boolean(evidenceMutationId || selectionAction)}
                    aria-label="删除已保存证据"
                  >
                    {evidenceMutationId === evidence.id ? (
                      <LoaderCircle size={13} className="document-reader-spin" aria-hidden="true" />
                    ) : (
                      <Trash2 size={13} aria-hidden="true" />
                    )}
                  </button>
                </article>
              );
            })}
          </div>
        </section>

        <details className="document-reader-document-details">
          <summary>文档与版本</summary>
          <section className="document-reader-detail-section">
            <h3>当前文档</h3>
            <div className="document-reader-parse-row">
              <div>
                <strong>{activeParseState ? parseStateLabel(activeParseState) : "状态读取中"}</strong>
                <span>{parseSnapshot?.message ?? manifest?.parseMessage ?? "页码索引与原始 PDF 分离保存。"}</span>
              </div>
              {activeParseState === "queued" || activeParseState === "running" ? (
                <button type="button" onClick={cancelParse}><Square size={13} aria-hidden="true" />停止</button>
              ) : activeParseState !== "ready" && activeParseState !== "needs-ocr" ? (
                <button type="button" onClick={startParse}><FileSearch size={13} aria-hidden="true" />解析</button>
              ) : null}
            </div>
            {parseSnapshot?.pageCount ? (
              <div className="document-reader-parse-progress">
                <span style={{ width: `${(parseSnapshot.pagesProcessed / parseSnapshot.pageCount) * 100}%` }} />
              </div>
            ) : null}
          </section>

          <section className="document-reader-detail-section">
            <h3>文档版本 · {manifest?.versions.length ?? 0}</h3>
            <div className="document-reader-version-list">
              {manifest?.versions.map((version) => (
                <button
                  key={version.id}
                  type="button"
                  data-active={version.id === activeVersionId ? "true" : "false"}
                  onClick={() => {
                    setEvidenceOpen(false);
                    void flushReaderState();
                    loadManifest(version.id);
                  }}
                >
                  <span>
                    <strong>{version.label || versionKindLabel(version.versionKind)}</strong>
                    <small>{byteSizeLabel(version.byteSize)} · {parseStateLabel(version.parseState)}</small>
                  </span>
                  <ChevronDown size={14} aria-hidden="true" />
                </button>
              ))}
            </div>
          </section>

          <details className="document-reader-diagnostics">
            <summary>来源与技术诊断</summary>
            {detailsError ? <p className="document-reader-sheet-error">{detailsError}</p> : null}
            <dl>
              <div><dt>文档版本</dt><dd>{activeVersionId ?? "—"}</dd></div>
              <div><dt>解析器</dt><dd>{manifest?.parserVersion ?? "尚未记录"}</dd></div>
              <div><dt>内容地址</dt><dd>{manifest?.contentUri ? "受控本地协议" : "—"}</dd></div>
            </dl>
            {details?.acquisitions.map((record) => (
              <div key={record.id} className="document-reader-acquisition">
                <strong>{record.originLabel ?? record.kind}</strong>
                <span>{record.stage} · {record.status}{record.errorCode ? ` · ${record.errorCode}` : ""}</span>
              </div>
            ))}
          </details>
        </details>
      </WorkbenchSideSheet>
      {agentOpen && agentScope ? (
        <aside
          className="document-reader-agent-overlay"
          role="dialog"
          aria-label="文档证据 Agent"
          data-reading-scope={agentScope.kind}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              closeEvidenceAgent();
            }
          }}
        >
          <header className="document-reader-agent-overlay__header">
            <div>
              <strong><Sparkles size={15} aria-hidden="true" />证据问答</strong>
              <span>
                {agentScope.kind === "selected-anchor"
                  ? `只使用选中文本 · 第 ${(agentScope.pageIndex ?? 0) + 1} 页`
                  : agentScope.kind === "current-page"
                    ? `只使用当前页 · 第 ${(agentScope.pageIndex ?? 0) + 1} 页`
                    : "仅检索当前文档"}
              </span>
            </div>
            <button type="button" onClick={closeEvidenceAgent} aria-label="关闭证据问答">
              <X size={16} aria-hidden="true" />
            </button>
          </header>
          <div className="document-reader-agent-overlay__content" aria-live="polite">
            {activeEvidenceAgentTurn ? (
              <>
                <p className="document-reader-agent-overlay__question">
                  {activeEvidenceAgentTurn.userText}
                </p>
                <div
                  className="document-reader-agent-overlay__answer"
                  data-state={activeEvidenceAgentTurn.assistant.status}
                >
                  {activeEvidenceAgentTurn.assistant.markdown || (agentGenerating
                    ? "正在核对当前范围内的文档证据…"
                    : "当前回答尚未生成。")}
                </div>
                {activeEvidenceAgentTurn.assistant.entityRefs.some((reference) => (
                  reference.kind === "document-anchor" && reference.anchor
                )) ? (
                  <nav className="document-reader-agent-overlay__citations" aria-label="可验证页码引用">
                    {activeEvidenceAgentTurn.assistant.entityRefs
                      .filter((reference) => reference.kind === "document-anchor" && reference.anchor)
                      .map((reference) => (
                        <button
                          key={`${reference.entityId}:${reference.citationIndex}`}
                          type="button"
                          onClick={() => {
                            if (!reference.anchor) return;
                            setFocusedEvidenceAnchor(reference.anchor);
                            window.requestAnimationFrame(() => goToPage(reference.anchor!.pageIndex + 1));
                          }}
                        >
                          [{reference.citationIndex}] 第 {(reference.pageIndex ?? 0) + 1} 页
                        </button>
                      ))}
                  </nav>
                ) : null}
              </>
            ) : (
              <p className="document-reader-agent-overlay__empty">
                提出具体问题，Agent 只读取你明确授权的文档片段。
              </p>
            )}
            {agentError ? <p className="document-reader-sheet-error" role="alert">{agentError}</p> : null}
          </div>
          <form className="document-reader-agent-overlay__composer" onSubmit={submitEvidenceAgentQuestion}>
            <input
              value={agentDraft}
              onChange={(event) => setAgentDraft(event.target.value)}
              placeholder="基于当前证据提问"
              aria-label="文档证据问题"
              autoFocus
            />
            {agentGenerating ? (
              <button type="button" onClick={onStopEvidenceAnswer} aria-label="停止生成">
                <Square size={14} aria-hidden="true" />
              </button>
            ) : (
              <button type="submit" disabled={!agentDraft.trim()} aria-label="发送证据问题">
                <Send size={14} aria-hidden="true" />
              </button>
            )}
          </form>
        </aside>
      ) : null}
    </section>
  );
}
