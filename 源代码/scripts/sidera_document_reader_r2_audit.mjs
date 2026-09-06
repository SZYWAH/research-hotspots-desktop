import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const shell = read("src/components/DocumentReaderShell.tsx");
const styles = read("src/components/DocumentReaderShell.css");
const adapter = read("src/lib/documentPdfJsAdapter.ts");
const contract = read("src/lib/documentReaderContract.ts");
const service = read("src/lib/documentReaderDesktopService.ts");
const desktop = read("src/lib/desktop.ts");
const app = read("src/App.tsx");
const agentWorkspace = read("src/components/AgentWorkspace.tsx");
const appStyles = read("src/index.css");

assert.equal((shell.match(/<canvas\b/g) ?? []).length, 1, "reader must mount one canvas element");
assert.doesNotMatch(shell, /<iframe\b/, "reader must not mount a second PDF renderer");
assert.match(shell, /data-renderer="pdfjs"/);
assert.match(shell, /data-renderer="pdfjs-error"/);
assert.match(shell, /className="document-reader-page__text-layer textLayer"/);
assert.match(shell, /data-reader-text-layer="true"/);
assert.match(shell, /const SCALE_PRESETS = \[[^\]]*1\.25[^\]]*\] as const/);
assert.match(shell, /stepScale\(value, -1\)/);
assert.match(shell, /stepScale\(value, 1\)/);
assert.match(shell, /measurePageTextSelection/);
assert.match(shell, /startOffsetUtf16/);
assert.match(shell, /endOffsetUtf16/);
assert.match(shell, /range\.getClientRects\(\)/);
assert.match(shell, /const pageRect = textLayer\.getBoundingClientRect\(\)/);
assert.match(shell, /evidenceAnchorFromSelection/);
assert.match(shell, /doc-anchor-\$\{anchorDigest\.slice\(0, 24\)\}/);
assert.match(shell, /stableParts\.map\(\(part\) => `\$\{part\}\\0`\)/);
assert.match(shell, /service\.loadPageText/);
assert.match(shell, /onNearViewport=\{prefetchVisiblePageText\}/);
assert.match(shell, /pageTextCacheRef/);
assert.match(shell, /pageTextCacheRef\.current\.size > 8/);
assert.match(shell, /service\.saveAnnotation/);
assert.match(shell, /service\.saveEvidence/);
assert.match(shell, /service\.deleteAnnotation/);
assert.match(shell, /service\.deleteEvidence/);
assert.match(shell, /service\.searchIndex/);
assert.match(shell, /service\.startIndex/);
assert.match(shell, /service\.loadIndexSnapshot/);
assert.match(shell, /changeIndexState\("pause"\)/);
assert.match(shell, /changeIndexState\("resume"\)/);
assert.match(shell, /changeIndexState\("cancel"\)/);
assert.match(shell, /crypto\.randomUUID\(\)/);
assert.doesNotMatch(shell, /localStorage[\s\S]{0,120}(annotation|evidence|highlight)/i);

assert.match(shell, /useState\(false\);[\s\S]{0,240}const \[evidenceOpen, setEvidenceOpen\] = useState\(false\)/);
assert.match(shell, /id="document-reader-evidence-sheet"/);
assert.match(shell, /title="证据"/);
assert.match(shell, /className="document-reader-selection-menu"/);
for (const action of ["高亮", "添加批注", "保存证据"]) {
  assert.ok(shell.includes(action), `missing selection action: ${action}`);
}
assert.match(shell, /document-reader-toolbar-button--icon[\s\S]{0,220}aria-label="全文搜索"/);
assert.match(shell, /<Bookmark size=\{15\}[\s\S]{0,120}证据/);
assert.match(shell, /<details className="document-reader-document-details">/);
assert.match(shell, /aria-label="检索模式"/);
assert.match(shell, /实际使用 \{searchModeLabel\(searchResolvedMode\)\}/);
assert.match(shell, /beginAnnotationEdit/);
assert.match(shell, /saveEditedAnnotation/);
assert.match(shell, /anchor: editingAnnotation\.anchor/);
assert.match(shell, /annotation\.kind === "note" \? \(/);
assert.match(shell, /document\.addEventListener\("selectionchange"/);
assert.match(shell, /versionEpochRef/);
assert.match(shell, /searchSequenceRef/);
assert.match(shell, /parsePollEpochRef/);
assert.match(shell, /indexPollEpochRef/);
assert.match(shell, /annotationListSequenceRef/);
assert.match(shell, /annotationMutationSequenceRef/);
assert.match(shell, /savedEvidenceListSequenceRef/);
assert.match(shell, /savedEvidenceMutationSequenceRef/);
assert.match(shell, /selectionActionTokenRef/);
assert.match(shell, /selectionActionTokenRef\.current === actionToken/);
assert.match(shell, /const noteSaveBusy = selectionAction === "note"/);
assert.match(shell, /editingAnnotation !== undefined && evidenceMutationId === editingAnnotation\.id/);
assert.match(shell, /aria-busy=\{noteSaveBusy\}/);
assert.doesNotMatch(shell, /evidenceMutationId === editingAnnotation\?\.id/);
assert.match(shell, /选区定位与当前页面不一致，请重新选择文本后再试。/);
assert.match(shell, /annotationMutationSequenceRef\.current === annotationMutationSequence/);
assert.match(shell, /savedEvidenceMutationSequenceRef\.current === savedEvidenceMutationSequence/);
assert.match(shell, /service\.currentIndex/);
assert.match(shell, /SIDERA_DOCUMENT_INDEX_REATTACH_FENCE_MISMATCH/);
assert.match(shell, /onIndexActivityChange\?\.\(indexSnapshot\)/);
assert.match(shell, /restoredParseState === "queued"[\s\S]{0,120}restoredParseState === "running"/);
assert.match(shell, /SIDERA_DOCUMENT_PARSE_REATTACH_FENCE_MISMATCH/);
assert.match(shell, /const count = session\?\.pageCount[\s\S]{0,100}Math\.max\(1, manifest\.pageCount, manifest\.pages\.length\)/);
assert.match(shell, /parsedByPage\.get\(pageNumber\) \?\?/);
assert.doesNotMatch(shell, /setInterval\(/, "reader polling must never overlap");
assert.match(shell, /Promise\.all\(\[[\s\S]{0,220}listAnnotations[\s\S]{0,220}listSavedEvidence/);
assert.ok(!/hero/i.test(shell), "reader must not add a hero surface");
assert.doesNotMatch(shell, /document-reader-stat/i);

assert.match(styles, /grid-template-rows: 52px minmax\(0, 1fr\) 2px/);
assert.match(styles, /\.document-reader-viewport[\s\S]{0,180}min-height: 0;[\s\S]{0,180}overflow: auto/);
assert.match(styles, /\.document-reader-page__text-layer[\s\S]{0,360}color: transparent/);
assert.match(styles, /--scale-factor: 1/);
assert.match(styles, /--user-unit: 1/);
assert.match(styles, /--total-scale-factor: calc\(var\(--scale-factor\) \* var\(--user-unit\)\)/);
assert.match(styles, /\.document-reader-page \{[\s\S]{0,100}box-sizing: content-box/);
assert.doesNotMatch(styles, /\.document-reader-page canvas[\s\S]{0,160}width: 100% !important/);
assert.match(styles, /\.document-reader-page__text-layer ::selection/);
assert.match(styles, /\.document-reader-page__text-layer\[data-text-source="ocr"\] ::selection[\s\S]{0,100}background: transparent/);
assert.match(styles, /\.document-reader-page__selection-layer[\s\S]{0,180}pointer-events: none/);
assert.match(shell, /computeOcrSelectionRects\(pageText, startOffsetUtf16, endOffsetUtf16\)/);
assert.match(shell, /data-text-source=\{sourcePageText\?\.sourceKind \?\? "native"\}/);
assert.match(shell, /selection=\{measuredSelection\?\.pageNumber === page\.pageNumber/);
for (const rotation of ["90", "180", "270"]) {
  assert.match(styles, new RegExp(`\\.document-reader-page__text-layer\\[data-main-rotation="${rotation}"\\]`));
}
assert.match(styles, /#document-reader-evidence-sheet \{[\s\S]{0,100}--workbench-side-sheet-surface: #000/);
assert.match(styles, /\.document-reader-selection-menu[\s\S]{0,360}background: #000/);
assert.ok(!styles.includes("backdrop-filter"), "reader surfaces must not add persistent blur");

assert.match(adapter, /renderTextLayer:/);
assert.match(adapter, /new pdfjs\.TextLayer/);
assert.match(adapter, /textContentByPage/);
assert.match(adapter, /textDiv\.dataset\.startOffsetUtf16/);
assert.match(adapter, /textDiv\.dataset\.endOffsetUtf16/);
assert.match(adapter, /convertToViewportRectangle/);
assert.match(adapter, /viewportRectangle\(/);
assert.match(adapter, /const isHandoffAbort = signal\?\.aborted/);
assert.match(adapter, /if \(!isHandoffAbort\) \{[\s\S]{0,160}transport\.cancel/);
assert.match(adapter, /function textLayerBoxSize\(viewport: PdfJsViewport\)/);
assert.match(adapter, /rotation === 90 \|\| rotation === 270[\s\S]{0,100}width: viewport\.height, height: viewport\.width/);
assert.match(adapter, /container\.style\.width = `\$\{textLayerBox\.width\}px`/);
assert.match(adapter, /container\.style\.height = `\$\{textLayerBox\.height\}px`/);
assert.match(adapter, /container\.style\.setProperty\([\s\S]{0,80}"--total-scale-factor"/);
assert.match(adapter, /container\.dataset\.mainRotation = String/);
assert.match(adapter, /resumePageIndex = Math\.min\(document\.numPages, Math\.max\(0, started\.pagesProcessed\)\)/);
assert.match(adapter, /for \(let pageIndex = resumePageIndex; pageIndex < document\.numPages; pageIndex \+= 1\)/);

for (const value of [
  'DocumentTextSourceKind = "native" | "ocr"',
  'DocumentTextSourcePreference = "auto" | DocumentTextSourceKind',
  '"exact" | "reanchored" | "ambiguous" | "missing"',
  "loadPageText:",
  "listAnnotations:",
  "saveAnnotation:",
  "listSavedEvidence:",
  "saveEvidence:",
  "DocumentIndexMode",
  '"paused"',
  "searchIndex?:",
  "startIndex?:",
  "currentIndex?:",
  "pauseIndex?:",
  "resumeIndex?:",
  "cancelIndex?:",
]) {
  assert.ok(contract.includes(value), `missing reader contract: ${value}`);
}

for (const api of [
  "getDocumentPageText",
  "listDocumentAnnotations",
  "saveDocumentAnnotation",
  "deleteDocumentAnnotation",
  "listDocumentSavedEvidence",
  "saveDocumentEvidence",
  "deleteDocumentEvidence",
  "getDocumentSourcePreference",
  "saveDocumentSourcePreference",
  "searchDocumentIndex",
  "startDocumentIndex",
  "getDocumentIndexSnapshot",
  "getCurrentDocumentIndex",
  "pauseDocumentIndex",
  "resumeDocumentIndex",
  "cancelDocumentIndex",
]) {
  assert.ok(service.includes(api), `desktop service is missing API: ${api}`);
}

for (const command of [
  "sidera_document_page_text",
  "sidera_document_annotation_list",
  "sidera_document_annotation_save",
  "sidera_document_annotation_delete",
  "sidera_document_evidence_list",
  "sidera_document_evidence_save",
  "sidera_document_evidence_delete",
  "sidera_document_index_start",
  "sidera_document_index_current",
  "sidera_document_index_snapshot",
  "sidera_document_index_pause",
  "sidera_document_index_resume",
  "sidera_document_index_cancel",
  "sidera_document_search",
]) {
  assert.ok(desktop.includes(`\"${command}\"`), `desktop bridge is missing command: ${command}`);
}

assert.match(app, /documentReaderActive \? "workspace--reader-active" : ""/);
assert.match(app, /shellPresentation=\{institutionBrowserVisible \|\| documentReaderActive \? "suspended"/);
assert.match(app, /const \[documentIndexActivity, setDocumentIndexActivity\] = useState<DocumentIndexSnapshot \| null>\(null\)/);
assert.match(app, /<AgentWorkspace[\s\S]{0,320}documentIndexActivity=\{documentIndexActivity\}/);
assert.match(app, /<SearchWorkspace[\s\S]{0,2400}onDocumentIndexActivityChange=\{setDocumentIndexActivity\}/);
assert.match(app, /<DocumentReaderShell[\s\S]{0,900}onIndexActivityChange=\{onDocumentIndexActivityChange\}/);
assert.doesNotMatch(app, /setDocumentIndexActivity\(null\)/, "reader close must not clear observed index activity");
assert.match(agentWorkspace, /documentIndexActivity\?: DocumentIndexSnapshot \| null/);
assert.match(agentWorkspace, /文档索引任务/);
assert.match(agentWorkspace, /embeddedCount[\s\S]{0,100}segmentCount/);
assert.match(agentWorkspace, /documentIndexModeLabel\(props\.documentIndexActivity\.resolvedMode\)/);
assert.match(agentWorkspace, /fallbackReason \?\? "无"/);
assert.match(agentWorkspace, /仅显示本进程内阅读器已观察的最新任务；重启后由对应阅读器恢复并重新上报。/);
assert.match(agentWorkspace, /onClick=\{\(\) => props\.onNavigate\("search"\)\}[\s\S]{0,100}返回文献工作台/);
assert.match(appStyles, /\.agent-document-index-activity \{[\s\S]{0,260}background: #000/);
assert.doesNotMatch(agentWorkspace, /documentIndexActivity[\s\S]{0,160}(runCenterData|visibleRuns)\s*[+.=]/, "document index activity must not alter Agent counts");
assert.match(service, /parseStartRequestsByVersion/);
assert.match(service, /const existingStart = parseStartRequestsByVersion\.get\(versionKey\)/);
assert.match(service, /target\.mode !== "auto" && target\.mode !== "lexical"/);
assert.match(service, /requestedMode: target\.mode/);
assert.match(desktop, /const \{ requestedMode, \.\.\.commandInput \} = input/);
assert.match(desktop, /input: \{ \.\.\.commandInput, mode: requestedMode \}/);
assert.doesNotMatch(desktop, /input: \{ \.\.\.input, mode: input\.requestedMode \}/);

console.log(JSON.stringify({
  status: "STATIC PASS",
  surface: "document-reader-r2",
  staticContracts: {
    canvasElementDeclarations: 1,
    transparentSelectableTextLayer: true,
    exactViewportScaleVariables: true,
    rotatedPageGeometryImplementation: "viewport-transform-plus-text-layer-css",
    pageTextLoading: "near-viewport-lazy",
    selectionActionsPersisted: true,
    annotationEditing: true,
    versionEpochFencing: true,
    selectionMutationTokenFencing: true,
    noteSaveIdleIcon: "save-static-spinner-busy-only",
    parsePolling: "serial-handoff-safe",
    documentSearch: "auto-fts-e5-with-explicit-fallback",
    indexControl: "start-pause-resume-cancel",
    runCenterIndexActivity: "latest-observed-snapshot-separate-from-agent-runs",
    evidenceEntry: "single-compact",
    evidenceSheetDefault: "closed-pure-black",
    toolbarHeightPx: 52,
    hero: false,
    persistentRail: false,
  },
  nativeAcceptance: {
    singleCanvasAtRuntime: "UNVERIFIED",
    rotatedSelectionAccuracy: "UNVERIFIED",
    desktopReaderFlow: "UNVERIFIED",
  },
}, null, 2));
