import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const rust = read("src-tauri/src/lib.rs");
const app = read("src/App.tsx");
const desktop = read("src/lib/desktop.ts");
const immersive = read("src/components/AgentImmersiveStarfieldCanvas.tsx");
const dualBackground = read("src/components/AgentDualBackgroundPage.tsx");
const evidencePath = path.join(root, "docs/evidence/sidera-013-workbench-performance-2026-08-07.json");
const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
const canonicalDocs = [
  "PROJECT.md",
  "ROADMAP.md",
  "STATUS.md",
  "ARCHITECTURE.md",
  "DECISIONS.md",
  "DEVELOPMENT.md",
];
const docs = Object.fromEntries(canonicalDocs.map((name) => [name, read(`docs/${name}`)]));

const checks = [];
function check(name, passed, detail) {
  checks.push({ name, passed: Boolean(passed), detail });
}
function includes(name, source, token) {
  check(name, source.includes(token), token);
}
function matches(name, source, pattern) {
  check(name, pattern.test(source), pattern.toString());
}
function commandBody(source, signature, nextSignature) {
  const start = source.indexOf(signature);
  const end = source.indexOf(nextSignature, start + signature.length);
  return start >= 0 && end > start ? source.slice(start, end) : "";
}

includes("stable unprepared-read error exists", rust, 'const LIBRARY_READ_NOT_PREPARED: &str = "LIBRARY_READ_NOT_PREPARED";');
includes("explicit prepare command exists", rust, "fn prepare_library_database(");
includes("explicit prepare implementation exists", rust, "fn prepare_library_database_for_reads(");
matches("explicit prepare command is registered", rust, /get_library_setup_state,\s*prepare_library_database,\s*validate_library_location,/);
matches("desktop exposes explicit prepare", desktop, /export async function prepareLibraryDatabase\([\s\S]*?invoke(?:<[^>]+>)?\("prepare_library_database"/);
matches("startup explicitly prepares before refresh reads", app, /await prepareLibraryDatabase\(nextSettings\.databaseDir\);[\s\S]*?await refreshAll\(\)/);
matches("galaxy visual review also prepares before refresh reads", app, /if \(isDesktopRuntime\(\)\) \{\s*if \(!galaxyVisualReview\) \{[\s\S]*?\n\s{10}\}\s*await prepareLibraryDatabase\(nextSettings\.databaseDir\);/);
includes("refresh path owns ordinary status read", app, "const nextStatus = await ensurePaperLibraryReady(nextSettings, nextProject);");

const readOnlyOpen = commandBody(
  rust,
  "fn open_library_database_read_only(",
  "fn open_prepared_library_read_connection(",
);
check("read-only open body found", readOnlyOpen.length > 0, "open_library_database_read_only slice");
includes("ordinary read requires prepared registration", readOnlyOpen, "require_prepared");
check("ordinary read has no implicit full prepare", !readOnlyOpen.includes("prepare_if_needed") && !readOnlyOpen.includes("open_library_database_full"), readOnlyOpen);
includes("ordinary connection opens read-only", rust, "OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX");
includes("ordinary connection enforces query_only", rust, '.pragma_update(None, "query_only", "ON")');
includes("ordinary connection checks schema", rust, 'return Err("LIBRARY_READ_PREPARATION_STALE".to_string())');

const pageCommand = commandBody(rust, "fn query_paper_library(", "fn paper_library_facets(");
const facetCommand = commandBody(rust, "fn paper_library_facets(", "fn upsert_paper_library(");
includes("page command uses lightweight read", pageCommand, "open_library_database_read_only");
check("page command does not use full open", !pageCommand.includes("open_library_database("), pageCommand);
includes("facet command uses lightweight read", facetCommand, "open_library_database_read_only");
check("facet command does not use full open", !facetCommand.includes("open_library_database("), facetCommand);
matches("facets use one read transaction", facetCommand, /transaction[\s\S]*?read_library_revision\(&transaction[\s\S]*?compute_paper_library_facets\(&transaction/);
matches("facet cache is path project revision scoped", rust, /struct PaperLibraryFacetCacheKey \{[\s\S]*?database_key: String,[\s\S]*?project_id: String,[\s\S]*?library_revision: i64,/);
matches("page predicate contains only active filters", rust, /fn paper_query_predicate\([\s\S]*?clauses\.push\("source = \?"\)[\s\S]*?clauses\.push\("field = \?"\)[\s\S]*?clauses\.push\("year = \?"\)/);
check("page predicate removed nullable OR filters", !commandBody(rust, "fn paper_query_predicate(", "fn compute_paper_library_facets(").includes("IS NULL OR"), "paper_query_predicate");
includes("year facet groups native integer", rust, '("CAST(year AS TEXT)", "year", "AND year IS NOT NULL")');

matches("bootstrap is revision bound", app, /type PaperLibraryBootstrapSnapshot = \{[\s\S]*?databasePath: string;[\s\S]*?projectId: string;[\s\S]*?libraryRevision: number;[\s\S]*?facets: PaperLibraryFacets;[\s\S]*?page: PaperQueryResult;/);
includes("bootstrap identity is path project revision", app, "paperLibraryReadIdentity(databasePath: string, projectId: string, libraryRevision: number)");
includes("workbench matches bootstrap identity", app, "const matchingLibraryBootstrap = libraryBootstrap?.identity === libraryReadIdentity");
includes("workbench reuses bootstrap page", app, "paperPageFromBootstrap(matchingLibraryBootstrap, input)");
includes("same-key page requests are shared", app, "const paperLibraryPageRequests = new Map<string, Promise<PaperQueryResult>>();");
includes("same-key detail requests are shared", app, "const paperDocumentPanelRequests = new Map<string, Promise<PaperDocumentPanelLoadResult>>();");
const loadPage = commandBody(app, "async function loadLibraryPage(", "function executeLibraryKeywordSearch()");
check("pagination never recomputes facets", !loadPage.includes("getPaperLibraryFacets("), loadPage);
includes("pagination uses shared request", loadPage, "requestPaperLibraryPageOnce(libraryReadIdentity, input)");
matches("selection does not default to first row", app, /const selectedPaper = visibleLibraryPapers\.find\(\(paper\) => paper\.id === selectedPaperId\);/);
check("first paper is not auto-selected", !app.includes("setSelectedPaperId(visibleLibraryPapers[0]"), "no automatic first-paper selection");

includes("immersive canvas accepts optional frame budget", immersive, "renderBudgetFps?: number;");
includes("frame budget hot-switches through ref", immersive, "const renderBudgetFpsRef = useRef(");
matches("workbench supplies 24fps budget", dualBackground, /const SIDERA_WORKBENCH_RENDER_BUDGET_FPS = 24;[\s\S]*?renderBudgetFps=\{shellPresentation === "workbench"[\s\S]*?SIDERA_WORKBENCH_RENDER_BUDGET_FPS[\s\S]*?: undefined\}/);
matches("skipped frames preserve wall-clock processed delta", immersive, /const deltaSeconds = Math\.min\([\s\S]*?nowMs - lastProcessedFrameMs[\s\S]*?lastProcessedFrameMs = nowMs/);
matches("visibility resume resets processed timestamp", immersive, /const resume = \(\) => \{[\s\S]*?lastProcessedFrameMs = performance\.now\(\)[\s\S]*?requestAnimationFrame\(renderFrame\)/);
matches("synchronous real first frame remains", immersive, /const renderSceneAndReportReady = \(nowMs: number\) => \{[\s\S]*?renderer\.render\(scene, camera\)[\s\S]*?onReadyRef\.current\?\.\(\)[\s\S]*?renderSceneAndReportReady\(performance\.now\(\)\)/);

for (const [name, source] of Object.entries(docs)) {
  includes(`${name} current date`, source, "更新时间：2026-08-09");
  includes(`${name} development 013`, source, "开发 013");
  includes(`${name} native performance result`, source, "NATIVE PERFORMANCE UNVERIFIED");
  check(`${name} does not overstate native performance`, !source.includes("NATIVE PERFORMANCE PASS"), "no final native PASS before post-repair visible desktop rerun");
  includes(`${name} current bounded user feedback`, source, "USER PERFORMANCE ACCEPTANCE PASS (BOUNDED)");
  includes(`${name} explicit prepare lifecycle`, source, "prepare_library_database");
}
includes("STATUS records R3 15 checks", docs["STATUS.md"], "冷启动 R3 专项 15 项");
includes("DEVELOPMENT records R3 15 checks", docs["DEVELOPMENT.md"], "R3 冷启动专项 15 项");
check("STATUS removed stale R3 14 count", !docs["STATUS.md"].includes("冷启动 R3 专项 14 项"), "14 -> 15");
check("DEVELOPMENT removed stale R3 14 count", !docs["DEVELOPMENT.md"].includes("R3 冷启动专项 14 项"), "14 -> 15");
includes("STATUS records bounded user performance feedback", docs["STATUS.md"], "USER PERFORMANCE ACCEPTANCE PASS (BOUNDED)");
check(
  "STATUS preserves final quantitative native gate",
  docs["STATUS.md"].includes("开发 013 最终定量 trace")
    && docs["STATUS.md"].includes("NATIVE PERFORMANCE UNVERIFIED"),
  "current status must retain the development 013 quantitative trace gap without requiring the old sentence",
);
check("STATUS stale institution next step removed", !docs["STATUS.md"].includes("通过后记录 `NATIVE IN-APP SEARCH PASS`，下一工作包进入 L1b"), "remove historical next-step tail");
includes("cold-start chain is marked pending remeasure", docs["STATUS.md"], "最终链待复测更新");

check("evidence package", evidence.package === "Sidera-013", evidence.package);
check("evidence native performance", evidence.nativePerformance === "UNVERIFIED", evidence.nativePerformance);
check("native launch authorization blocker is explicit", evidence.nativePerformanceGate.status === "UNVERIFIED" && evidence.nativePerformanceGate.finalVisibleDesktopAfterSecondNarrowRepair === false && evidence.nativePerformanceGate.launchAuthorization === "UNAVAILABLE" && evidence.nativePerformanceGate.reason.includes("Codex usage limit") && evidence.nativePerformanceGate.productFailure === false, evidence.nativePerformanceGate);
check("historical evidence snapshot user acceptance remains UNVERIFIED", evidence.userPerformanceAcceptance === "UNVERIFIED", evidence.userPerformanceAcceptance);
check("baseline full validation", evidence.baselineDiagnosis.fullValidationMedianMs === 490.7, evidence.baselineDiagnosis.fullValidationMedianMs);
check("baseline first batch", evidence.baselineDiagnosis.clickToFirstBatchMs === 5981.9, evidence.baselineDiagnosis.clickToFirstBatchMs);
check("baseline detail", evidence.baselineDiagnosis.clickToDetailStableMs === 6073.6, evidence.baselineDiagnosis.clickToDetailStableMs);
check("intermediate first batch retained", evidence.intermediateNativeWorkbenchInteraction.clickToFirstBatchStableMs === 114.2 && evidence.intermediateNativeWorkbenchInteraction.finalForDevelopment013 === false, evidence.intermediateNativeWorkbenchInteraction);
check("intermediate entry business IPC zero", evidence.intermediateNativeWorkbenchInteraction.entryBusinessReadIpc === 0, evidence.intermediateNativeWorkbenchInteraction.entryBusinessReadIpc);
check("intermediate explicit detail exactly two IPC", evidence.intermediateNativeWorkbenchInteraction.explicitSelection.ipcCount === 2, evidence.intermediateNativeWorkbenchInteraction.explicitSelection.ipcCount);
check("intermediate refresh one query no facets", evidence.intermediateNativeWorkbenchInteraction.explicitRefresh.queryCount === 1 && evidence.intermediateNativeWorkbenchInteraction.explicitRefresh.facetCount === 0, evidence.intermediateNativeWorkbenchInteraction.explicitRefresh);
check("24fps workbench budget", evidence.implementation.workbenchRenderBudgetFps === 24 && evidence.implementation.agentRenderBudgetFps === null, evidence.implementation.workbenchRenderBudgetFps);
check("intermediate dynamic frames retained without final pass", evidence.intermediateNativePerformance.frameHashesDiffer === true && evidence.intermediateNativePerformance.backgroundRemainedDynamic === true && evidence.intermediateNativePerformance.finalForDevelopment013 === false, evidence.intermediateNativePerformance);
check("database identity unchanged", evidence.database.schemaVersion === 14 && evidence.database.paperCount === 25473 && evidence.database.libraryRevision === 1 && evidence.database.hashCountRevisionUnchanged === true, evidence.database);
check("database SHA locked", evidence.database.sha256BeforeAndAfter === "B546C505F6FAD89C9D4C6429DBBA8FACC7838D5F66CC9367E24A2824EFDCA8FA", evidence.database.sha256BeforeAndAfter);
check("main database content mutations zero", evidence.database.mainDatabaseContentMutations === 0, evidence.database.mainDatabaseContentMutations);
check("sidecar bookkeeping disclosed", evidence.database.walBytes === 0 && evidence.database.shmBytes === 32768 && evidence.database.sidecarBookkeeping.includes("not zero filesystem touching"), evidence.database.sidecarBookkeeping);
check("cold-start chain pending final remeasure", evidence.intermediateColdStartupResourceChain.finalForDevelopment013 === false && evidence.intermediateColdStartupResourceChain.measurementStatus.includes("PENDING REMEASURE"), evidence.intermediateColdStartupResourceChain);
check("R3 remains 15/15", evidence.automatedResults.dynamicStartupR3Audit === "PASS; 15/15", evidence.automatedResults.dynamicStartupR3Audit);
check("desktop test-host boundary", evidence.automatedResults.desktopNewFiveTests.compile === "PASS" && evidence.automatedResults.desktopNewFiveTests.execution === "TEST-HOST UNAVAILABLE" && evidence.automatedResults.desktopNewFiveTests.windowsExitCode === "0xffffffff", evidence.automatedResults.desktopNewFiveTests);
check("extra cargo check tests is non-gate failure", evidence.automatedResults.extraCargoCheckTests.status === "FAIL" && evidence.automatedResults.extraCargoCheckTests.formalCargoCheckGate === false && evidence.automatedResults.extraCargoCheckTests.doesNotOverrideCargoCheckJ2Pass === true, evidence.automatedResults.extraCargoCheckTests);
check("no schema index sort authorization", evidence.remainingBoundary.schemaIndexOrSortAuthorization === "NOT GRANTED", evidence.remainingBoundary.schemaIndexOrSortAuthorization);

const failed = checks.filter((entry) => !entry.passed);
const result = {
  audit: "sidera-workbench-performance-r1",
  status: failed.length === 0 ? "PASS" : "FAIL",
  checkCount: checks.length,
  checks,
  failedChecks: failed,
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (failed.length > 0) process.exitCode = 1;
