import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const shell = read("src/components/DocumentReaderShell.tsx");
const styles = read("src/components/DocumentReaderShell.css");
const contract = read("src/lib/documentReaderContract.ts");
const adapter = read("src/lib/documentPdfJsAdapter.ts");
const desktopService = read("src/lib/documentReaderDesktopService.ts");
const desktop = read("src/lib/desktop.ts");
const sideraDocuments = read("src-tauri/src/sidera_documents.rs");
const app = read("src/App.tsx");
const indexStyles = read("src/index.css");
const packageJson = JSON.parse(read("package.json"));

const requiredStates = [
  "queued",
  "running",
  "ready",
  "needs-ocr",
  "failed",
  "cancelled",
  "stale",
];
for (const state of requiredStates) {
  assert.ok(contract.includes(`\"${state}\"`), `missing parse state: ${state}`);
}

assert.match(shell, /className="document-reader-toolbar"/);
assert.match(shell, /className="document-reader-viewport"/);
assert.match(shell, /<WorkbenchSideSheet[\s\S]*?title="全文搜索"/);
assert.match(shell, /<WorkbenchSideSheet[\s\S]*?title="证据"/);
assert.match(shell, /data-renderer="pdfjs"/);
assert.match(shell, /data-renderer="pdfjs-error"/);
assert.doesNotMatch(shell, /<iframe/);
assert.match(shell, /service\.saveState/);
assert.match(shell, /service\.search/);
assert.match(shell, /service\.startParse/);
assert.match(shell, /service\.cancelParse/);
assert.match(shell, /IntersectionObserver/);
assert.match(shell, /rootMargin: "900px 0px"/);
assert.match(shell, /const EMPTY_PAGE_RECTS: DocumentPageRect\[\] = \[\]/);
assert.match(shell, /highlights=\{activeHighlights\.get\(page\.pageNumber\) \?\? EMPTY_PAGE_RECTS\}/);
assert.match(shell, /document-reader-diagnostics/);
assert.ok(!/hero/i.test(shell), "reader must not add a hero surface");
assert.match(shell, /manifestRequestRef = useRef<\{ sequence: number; controller\?: AbortController \}>/);
assert.match(shell, /setRequestedVersionId\(nextVersionId\);[\s\S]{0,160}manifestRequestRef\.current\.controller\?\.abort\(\)/);
assert.match(shell, /const ownsRequest = \(\) => \([\s\S]{0,260}manifestRequestRef\.current\.sequence === sequence/);
assert.match(shell, /pendingRestoreRef/);
assert.match(shell, /pageCountIsAuthoritative = Boolean\(session\)/);
assert.match(shell, /session\?\.pageCount \?\? manifest\.pageCount/);
assert.match(shell, /window\.requestAnimationFrame\(\(\) => \{[\s\S]{0,100}window\.requestAnimationFrame/);
assert.match(shell, /reapplyTimer = window\.setTimeout\(applyPosition, 180\)/);
assert.match(shell, /manifest && !session && !sessionError && safeContentUri/);
assert.match(shell, /manifest && !session && sessionError && safeContentUri/);
assert.match(shell, /flushReaderState\(\)\.finally\(onBack\)/);
assert.match(shell, /window\.addEventListener\("pagehide", handlePageHide\)/);
assert.match(shell, /flushReaderStateRef\.current = flushReaderState/);
assert.match(shell, /const handlePageHide = \(\) => void flushReaderStateRef\.current\(\)/);
assert.match(shell, /window\.removeEventListener\("pagehide", handlePageHide\);[\s\S]{0,120}flushReaderStateRef\.current\(\)/);
assert.match(shell, /useEffect\(\(\) => \{[\s\S]{0,900}mountedRef\.current = false;[\s\S]{0,900}\}, \[\]\);/);
assert.doesNotMatch(shell, /mountedRef\.current = false;[\s\S]{0,900}\}, \[flushReaderState\]\);/);
assert.match(shell, /readerStateSaveInFlightRef/);
assert.match(shell, /restoredParseState === "queued"[\s\S]{0,120}restoredParseState === "running"/);
assert.match(shell, /service\.loadParseSnapshot\([\s\S]{0,220}versionId: nextManifest\.documentVersionId/);
assert.match(shell, /setParseSnapshot\(restoredParse\)/);
assert.match(shell, /service\.startParse\(\{[\s\S]{0,180}versionId: nextManifest\.documentVersionId/);
assert.match(shell, /SIDERA_DOCUMENT_PARSE_REATTACH_FENCE_MISMATCH/);
assert.match(shell, /function scrollReaderViewportToPage\(/);
assert.match(shell, /viewport\.scrollTo\(\{[\s\S]{0,180}viewport\.scrollTop \+ pageTop - viewportTop - 12/);
assert.match(shell, /scrollReaderViewportToPage\(viewport, next, "smooth"\)/);
assert.match(shell, /scrollReaderViewportToPage\(viewport, restoredPage, "auto"\)/);
assert.doesNotMatch(shell, /scrollIntoView\(/, "reader navigation must never scroll document/window ancestors");

assert.match(styles, /--document-reader-control-height: 36px/);
assert.match(styles, /background: #000/);
assert.match(styles, /\.document-reader-shell \{[\s\S]{0,260}height: 100%;[\s\S]{0,120}min-height: 0/);
assert.match(styles, /padding-top: var\(--sidera-titlebar-height, 38px\)/);
assert.match(styles, /grid-template-rows: 52px minmax\(0, 1fr\) 2px/);
assert.match(styles, /\.document-reader-toolbar[\s\S]*?display: flex/);
assert.match(styles, /\.document-reader-viewport[\s\S]*?min-height: 0/);
assert.match(styles, /\.document-reader-viewport[\s\S]*?overflow: auto/);
assert.match(styles, /\.document-reader-pages[\s\S]*?min-height: 100%/);
assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
assert.ok(!styles.includes("backdrop-filter"), "reader must not use a persistent blur surface");

assert.match(adapter, /createBundledPdfJsAdapter/);
assert.match(adapter, /function pdfJsResourceUri\(contentUri: string\)/);
assert.match(adapter, /parsed\.protocol !== "sidera-document:"/);
assert.match(adapter, /parsed\.hostname !== "localhost"/);
assert.match(adapter, /\/Windows\/i\.test\(navigator\.userAgent\)/);
assert.match(adapter, /http:\/\/sidera-document\.localhost/);
assert.equal((adapter.match(/url: resourceUri/g) ?? []).length, 2);
assert.match(adapter, /withCredentials: false/);
assert.match(adapter, /disableAutoFetch: true/);
assert.match(adapter, /Math\.min\(window\.devicePixelRatio \|\| 1, 2\)/);
assert.match(adapter, /renderSignal\?\.addEventListener\("abort", onRenderAbort, \{ once: true \}\);[\s\S]{0,180}page = await document\.getPage/);
assert.match(adapter, /page = await document\.getPage\(pageNumber\);[\s\S]{0,120}renderSignal\?\.aborted/);
assert.match(adapter, /rendering = page\.render\([\s\S]{0,180}if \(renderSignal\?\.aborted\)/);
assert.ok(!adapter.includes("https://"), "PDF adapter must not load a CDN");
assert.ok(!adapter.includes("convertFileSrc"), "PDF adapter must not expose a filesystem path");
assert.match(adapter, /parseWithBundledPdfJs/);
assert.match(adapter, /DOCUMENT_READER_MAX_BYTES = 50 \* 1024 \* 1024/);
assert.match(adapter, /DOCUMENT_READER_MAX_PAGES = 300/);
assert.match(adapter, /resumePageIndex = Math\.min\(document\.numPages, Math\.max\(0, started\.pagesProcessed\)\)/);
assert.match(adapter, /for \(let pageIndex = resumePageIndex; pageIndex < document\.numPages; pageIndex \+= 1\)/);

assert.match(desktopService, /createDesktopDocumentReaderComposition/);
assert.match(desktopService, /GlobalWorkerOptions\.workerSrc/);
assert.match(desktopService, /loadPdfJs: \(\) => Promise<BundledPdfJsModule>/);
assert.match(desktopService, /parseWithBundledPdfJs/);
assert.match(desktopService, /resourceUri\.startsWith\("sidera-document:\/\/localhost\/version\/"\)/);
assert.ok(!desktopService.includes("convertFileSrc"), "desktop service must not expose a filesystem path");
assert.match(desktopService, /MANIFEST_CACHE_LIMIT = 8/);
assert.match(desktopService, /RUN_CACHE_LIMIT = 16/);
assert.match(desktopService, /ACTIVE_PARSE_LIMIT = 4/);
assert.match(desktopService, /lruSet\(manifestCache/);
assert.match(desktopService, /lruSet\(runFences/);
assert.match(desktopService, /parseSnapshot: desktopManifest\.parse \? toPublicParse\(desktopManifest\.parse\) : undefined/);
assert.match(desktopService, /const restored = cachedManifest\?\.parseSnapshot;[\s\S]{0,180}return restored;/);
assert.match(desktopService, /parseControllersByVersion/);
assert.match(desktopService, /parseControllersByRun/);
assert.match(desktopService, /signal: controller\.signal/);
assert.match(desktopService, /parseControllersByRun\.get\(target\.runId\)\?\.abort\(\);[\s\S]{0,520}return cancelRun\(target, fence\)/);
assert.match(desktopService, /runFences\.delete\(snapshot\.runId\)/);
assert.match(desktopService, /rememberTerminalSnapshot\(toPublicParse\(next\)\)/);
assert.match(desktopService, /const cachedManifest = lruGet\(manifestCache, targetKey\(target\)\)/);
assert.match(desktopService, /cachedManifest\.desktopManifest\.readerState/);
assert.match(sideraDocuments, /sidera_document_reader_manifest[\s\S]{0,520}spawn_blocking/);
assert.match(sideraDocuments, /SIDERA_DOCUMENT_READER_MANIFEST_TASK_FAILED/);

assert.equal(packageJson.dependencies["pdfjs-dist"], "5.4.149");
assert.match(app, /pdf\.worker\.min\.mjs\?url/);
assert.match(app, /createDesktopDocumentReaderComposition/);
assert.match(app, /parserVersion: "pdfjs-dist@5\.4\.149"/);
assert.match(app, /<DocumentReaderShell/);
assert.match(app, /onReadVersion=/);
assert.match(app, /onReadVersion\(version\.id\)[\s\S]{0,180}阅读全文/);
assert.match(app, /shellPresentation=\{institutionBrowserVisible \|\| documentReaderActive \? "suspended"/);
assert.match(app, /onDocumentReaderActiveChange=\{setDocumentReaderActive\}/);
assert.match(app, /onDocumentReaderActiveChange\(Boolean\(documentReaderTarget\)\)/);
assert.match(app, /<DocumentReaderShell[\s\S]{0,900}onNotice=\{onNotice\}/);
assert.match(app, /documentReaderActive \? "workspace--reader-active" : ""/);
assert.match(indexStyles, /\.workspace--workbench\.workspace--reader-active,[\s\S]{0,360}overflow: hidden;[\s\S]{0,80}padding: 0;/);

for (const command of [
  "sidera_document_parse_start",
  "sidera_document_parse_snapshot",
  "sidera_document_parse_cancel",
  "sidera_document_parse_page_submit",
  "sidera_document_parse_finalize",
  "sidera_document_search",
  "sidera_document_reader_manifest",
  "sidera_document_reader_state_get",
  "sidera_document_reader_state_save",
]) {
  assert.ok(desktop.includes(`\"${command}\"`), `missing desktop command: ${command}`);
}

console.log(JSON.stringify({
  status: "PASS",
  checks: 105,
  surface: "document-reader-r1",
  contentPriority: {
    singleLineToolbar: true,
    overlaySheets: 2,
    persistentHero: false,
    documentViewport: "primary",
  },
}, null, 2));
