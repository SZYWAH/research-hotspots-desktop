import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync("src/App.tsx", "utf8");
const types = fs.readFileSync("src/types.ts", "utf8");
const desktop = fs.readFileSync("src/lib/desktop.ts", "utf8");
const main = fs.readFileSync("src/main.tsx", "utf8");
const rust = fs.readFileSync("src-tauri/src/lib.rs", "utf8");

const loadLibraryPageStart = app.indexOf("async function loadLibraryPage(");
const loadLibraryPageEnd = app.indexOf("function executeLibraryKeywordSearch()", loadLibraryPageStart);
assert.ok(loadLibraryPageStart >= 0 && loadLibraryPageEnd > loadLibraryPageStart);
const loadLibraryPage = app.slice(loadLibraryPageStart, loadLibraryPageEnd);
const readOnlyStart = rust.indexOf("fn open_library_database_read_only(");
const readOnlyEnd = rust.indexOf("fn open_prepared_library_read_connection(", readOnlyStart);
const readOnlyAccessor = rust.slice(readOnlyStart, readOnlyEnd);
const facetsStart = rust.indexOf("fn paper_library_facets(");
const facetsEnd = rust.indexOf("fn upsert_paper_library(", facetsStart);
const facetsCommand = rust.slice(facetsStart, facetsEnd);

assert.match(types, /type PaperLibraryStatus = \{[\s\S]*?libraryRevision: number;/);
assert.match(desktop, /paperCount: 0,[\s\S]*?libraryRevision: 0,/);
assert.match(desktop, /const librarySetupStateRequests = new Map<string, Promise<LibrarySetupState>>\(\);/);
assert.match(desktop, /const current = librarySetupStateRequests\.get\(requestKey\);\s*if \(current\) return current;/);
assert.match(desktop, /finally \{\s*if \(librarySetupStateRequests\.get\(requestKey\) === request\) \{\s*librarySetupStateRequests\.delete\(requestKey\);/);
assert.match(desktop, /const libraryPreparationRequests = new Map<string, Promise<void>>\(\);/);
assert.match(desktop, /export async function prepareLibraryDatabase\(databaseDir\?: string\)/);
assert.match(desktop, /const current = libraryPreparationRequests\.get\(requestKey\);\s*if \(current\) return current;/);
assert.match(desktop, /invoke<void>\("prepare_library_database", \{ databaseDir \}\)/);
assert.match(rust, /const LIBRARY_READ_NOT_PREPARED: &str = "LIBRARY_READ_NOT_PREPARED";/);
assert.match(rust, /fn prepare_library_database\([\s\S]*?prepare_library_database_for_reads\(&app, database_dir\)/);
assert.match(rust, /get_library_setup_state,\s*prepare_library_database,\s*validate_library_location,/);
assert.match(readOnlyAccessor, /preparations\.require_prepared\(&entry, &database_path\)\?/);
assert.doesNotMatch(readOnlyAccessor, /open_library_database_full/);
assert.match(facetsCommand, /transaction_with_behavior\(TransactionBehavior::Deferred\)/);
assert.match(facetsCommand, /read_library_revision\(&transaction, &project_id\)/);
assert.match(facetsCommand, /compute_paper_library_facets\(&transaction, &project_id\)/);
assert.match(app, /const nextSetupState = await getLibrarySetupState\(nextSettings\.databaseDir\);\s*if \(!mounted\) return;/);
assert.match(app, /await prepareLibraryDatabase\(nextSettings\.databaseDir\);\s*if \(!mounted\) return;/);
assert.match(app, /if \(isDesktopRuntime\(\)\) \{\s*if \(!galaxyVisualReview\) \{[\s\S]*?\n\s{10}\}\s*await prepareLibraryDatabase\(nextSettings\.databaseDir\);/);
assert.match(app, /await prepareLibraryDatabase\(result\.databaseDir\);\s*await refreshAll\(\);/);
assert.match(app, /await prepareLibraryDatabase\(nextDir\);\s*effectiveSettings = \{/);
assert.match(app, /type PaperLibraryBootstrapSnapshot = \{[\s\S]*?databasePath: string;[\s\S]*?projectId: string;[\s\S]*?libraryRevision: number;[\s\S]*?facets: PaperLibraryFacets;[\s\S]*?page: PaperQueryResult;/);
assert.match(app, /setLibraryBootstrap\(\{[\s\S]*?nextStatus\.databasePath[\s\S]*?nextStatus\.libraryRevision[\s\S]*?facets: nextFacets,[\s\S]*?page: paperPage,/);
assert.match(app, /libraryBootstrap=\{libraryBootstrap\}/);
assert.match(app, /const matchingLibraryBootstrap = libraryBootstrap\?\.identity === libraryReadIdentity/);
assert.match(app, /paperPageFromBootstrap\(matchingLibraryBootstrap, input\)/);

assert.doesNotMatch(loadLibraryPage, /getPaperLibraryFacets\(/);
assert.match(loadLibraryPage, /requestPaperLibraryPageOnce\(libraryReadIdentity, input\)/);
assert.match(app, /const paperLibraryPageRequests = new Map<string, Promise<PaperQueryResult>>\(\);/);
assert.match(app, /function shareInFlight<T>\(/);
assert.match(main, /<React\.StrictMode>/);

assert.match(app, /const selectedPaper = visibleLibraryPapers\.find\(\(paper\) => paper\.id === selectedPaperId\);/);
assert.doesNotMatch(app, /const selectedPaper =[^;]*\?\?/);
assert.match(app, /if \(selectedPaperId && !visibleLibraryPapers\.some\(\(paper\) => paper\.id === selectedPaperId\)\) \{\s*setSelectedPaperId\(""\);/);
assert.doesNotMatch(app, /setSelectedPaperId\(visibleLibraryPapers\[0\]/);

assert.match(app, /const paperDocumentPanelRequests = new Map<string, Promise<PaperDocumentPanelLoadResult>>\(\);/);
assert.match(app, /requestPaperDocumentPanelOnce\(\{[\s\S]*?paperId: paper\.id,[\s\S]*?refreshRevision,/);

console.log(JSON.stringify({
  audit: "sidera-workbench-read-path",
  status: "PASS",
  bootstrapIdentity: "database-path+project+library-revision",
  bootstrapPageReuse: true,
  facetsSeparatedFromPagination: true,
  strictModeInFlightCoalescing: true,
  librarySetupStateInFlightCoalescing: true,
  explicitLibraryPreparation: true,
  galaxyVisualReviewPreparation: true,
  readAccessorNeverPrepares: true,
  facetRevisionSnapshot: "deferred-transaction",
  librarySetupStatePersistentCache: false,
  automaticFirstPaperDetail: false,
  staleResponseSequenceGatePreserved: app.includes("libraryLoadSequenceRef"),
}, null, 2));
