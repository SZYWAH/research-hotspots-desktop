import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  HOTSPOT_EVIDENCE_CACHE_LIMIT,
  collectHotspotRepresentativeIds,
  hotspotEvidenceCacheSizeForAudit,
  loadPersistedHotspotEvidence,
  resetHotspotEvidenceCacheForAudit,
} from "../src/lib/hotspotEvidenceLoader.ts";

function makePaper(id, overrides = {}) {
  return {
    id,
    projectId: "project-default",
    source: "arxiv",
    title: `Paper ${id}`,
    abstract: `Abstract for ${id}`,
    field: "Artificial Intelligence",
    year: 2025,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeHotspot(id, evidenceIds, overrides = {}) {
  return {
    id,
    projectId: "project-default",
    field: "Artificial Intelligence",
    topicId: 1,
    title: `Hotspot ${id}`,
    summary: "Persisted V20 hotspot",
    keywords: ["evidence", "retrieval"],
    paperCount: 100,
    trend: "Surging",
    confidence: 0.91,
    source: "worker",
    coordinates: { x: 1, y: 2, z: 3 },
    evolution: [
      { year: 2024, count: 30, keywords: ["evidence"], representativeIds: [evidenceIds[1] ?? "", evidenceIds[0] ?? ""] },
      { year: 2025, count: 70, keywords: ["retrieval"], representativeIds: [evidenceIds[2] ?? "", evidenceIds[1] ?? ""] },
    ],
    sourceDistribution: [{ value: "arxiv", count: 70 }, { value: "openalex", count: 30 }],
    similarHotspots: [],
    analysis: {
      keywordFocus: 0.8,
      representativeCoverage: 0.9,
      recentMomentum: 0.7,
      sourceDiversity: 0.6,
      evidencePaperIds: [...evidenceIds],
      warnings: [],
    },
    updatedAt: "2026-07-17T00:00:00.000Z",
    ...overrides,
  };
}

function loadInput(hotspot, hotspots, fetchPapersByIds, requestSequence = 1) {
  return {
    databaseDir: "D:/library",
    projectId: "project-default",
    hotspot,
    hotspots,
    requestSequence,
    maxPapers: 18,
    fetchPapersByIds,
  };
}

resetHotspotEvidenceCacheForAudit();

const orderedHotspot = makeHotspot("ordered", ["paper-1", "paper-2", "paper-1", "paper-3"]);
assert.deepEqual(collectHotspotRepresentativeIds(orderedHotspot, 18), ["paper-1", "paper-2", "paper-3"]);
assert.equal(collectHotspotRepresentativeIds(makeHotspot("capped", Array.from({ length: 30 }, (_, index) => `paper-${index}`)), 18).length, 18);

let zeroIdFetchCount = 0;
const zeroIdHotspot = makeHotspot("empty", [], { evolution: [], analysis: undefined });
const zeroIdResult = await loadPersistedHotspotEvidence(loadInput(zeroIdHotspot, [zeroIdHotspot], async () => {
  zeroIdFetchCount += 1;
  return [];
}));
assert.equal(zeroIdResult.status, "missing-evidence");
assert.equal(zeroIdFetchCount, 0);
assert.equal(zeroIdResult.diagnostics.fullReclusterTriggeredByNavigation, false);

const similarHotspot = makeHotspot("similar", ["paper-similar"]);
const partialHotspot = makeHotspot("partial", ["paper-1", "paper-2", "paper-3"], {
  similarHotspots: [{ hotspotId: similarHotspot.id, score: 0.82 }],
});
const partialResult = await loadPersistedHotspotEvidence(loadInput(partialHotspot, [partialHotspot, similarHotspot], async () => [
  makePaper("paper-1"),
  makePaper("paper-3", { source: "openalex", year: 2024 }),
]));
assert.equal(partialResult.status, "ready");
assert.deepEqual(partialResult.bundle?.representativePapers.map((paper) => paper.id), ["paper-1", "paper-3"]);
assert.deepEqual(partialResult.bundle?.missingRepresentativeIds, ["paper-2"]);
assert.equal(partialResult.bundle?.similarHotspots[0]?.hotspotId, similarHotspot.id);
assert.equal(partialResult.bundle?.sourceDistribution.length, 2);
assert.equal(partialResult.diagnostics.missingRepresentativeCount, 1);

resetHotspotEvidenceCacheForAudit();
const sharedHotspot = makeHotspot("shared", ["paper-shared"]);
let sharedFetchCount = 0;
let resolveSharedFetch;
const sharedFetcher = () => {
  sharedFetchCount += 1;
  return new Promise((resolve) => {
    resolveSharedFetch = resolve;
  });
};
const firstShared = loadPersistedHotspotEvidence(loadInput(sharedHotspot, [sharedHotspot], sharedFetcher, 10));
const secondShared = loadPersistedHotspotEvidence(loadInput(sharedHotspot, [sharedHotspot], sharedFetcher, 11));
assert.equal(sharedFetchCount, 1);
resolveSharedFetch([makePaper("paper-shared")]);
const [firstSharedResult, secondSharedResult] = await Promise.all([firstShared, secondShared]);
assert.equal(firstSharedResult.diagnostics.evidenceCacheState, "miss");
assert.equal(secondSharedResult.diagnostics.evidenceCacheState, "pending");
const cachedSharedResult = await loadPersistedHotspotEvidence(loadInput(sharedHotspot, [sharedHotspot], sharedFetcher, 12));
assert.equal(cachedSharedResult.diagnostics.evidenceCacheState, "hit");
assert.equal(sharedFetchCount, 1);

const updatedHotspot = { ...sharedHotspot, updatedAt: "2026-07-17T01:00:00.000Z" };
const updatedResult = await loadPersistedHotspotEvidence(loadInput(updatedHotspot, [updatedHotspot], async () => {
  sharedFetchCount += 1;
  return [makePaper("paper-shared")];
}, 13));
assert.equal(updatedResult.diagnostics.evidenceCacheState, "miss");
assert.equal(sharedFetchCount, 2);

const missingRowsHotspot = makeHotspot("all-missing", ["paper-missing"]);
const missingRowsResult = await loadPersistedHotspotEvidence(loadInput(missingRowsHotspot, [missingRowsHotspot], async () => []));
assert.equal(missingRowsResult.status, "unavailable");
assert.equal(missingRowsResult.bundle, null);

let failureFetchCount = 0;
const failingHotspot = makeHotspot("failing", ["paper-failing"]);
const failingInput = () => loadInput(failingHotspot, [failingHotspot], async () => {
  failureFetchCount += 1;
  throw new Error("simulated sqlite error");
});
assert.equal((await loadPersistedHotspotEvidence(failingInput())).status, "unavailable");
assert.equal((await loadPersistedHotspotEvidence(failingInput())).status, "unavailable");
assert.equal(failureFetchCount, 2);

resetHotspotEvidenceCacheForAudit();
for (let index = 0; index < HOTSPOT_EVIDENCE_CACHE_LIMIT + 1; index += 1) {
  const paperId = `lru-paper-${index}`;
  const hotspot = makeHotspot(`lru-${index}`, [paperId]);
  const result = await loadPersistedHotspotEvidence(loadInput(hotspot, [hotspot], async () => [makePaper(paperId)]));
  assert.equal(result.status, "ready");
}
assert.equal(hotspotEvidenceCacheSizeForAudit(), HOTSPOT_EVIDENCE_CACHE_LIMIT);

resetHotspotEvidenceCacheForAudit();
const pendingResolvers = new Map();
let pendingFetchCount = 0;
const pendingLoads = Array.from({ length: HOTSPOT_EVIDENCE_CACHE_LIMIT + 1 }, (_, index) => {
  const paperId = `pending-paper-${index}`;
  const hotspot = makeHotspot(`pending-${index}`, [paperId]);
  return loadPersistedHotspotEvidence(loadInput(hotspot, [hotspot], async () => {
    pendingFetchCount += 1;
    return new Promise((resolve) => pendingResolvers.set(paperId, resolve));
  }));
});
const firstPendingHotspot = makeHotspot("pending-0", ["pending-paper-0"]);
const repeatedOldestPending = loadPersistedHotspotEvidence(loadInput(firstPendingHotspot, [firstPendingHotspot], async () => {
  pendingFetchCount += 1;
  return [makePaper("pending-paper-0")];
}, 99));
assert.equal(pendingFetchCount, HOTSPOT_EVIDENCE_CACHE_LIMIT + 1);
for (const [paperId, resolve] of pendingResolvers) resolve([makePaper(paperId)]);
const pendingResults = await Promise.all([...pendingLoads, repeatedOldestPending]);
assert.equal(pendingResults.at(-1).diagnostics.evidenceCacheState, "pending");
assert.equal(hotspotEvidenceCacheSizeForAudit(), HOTSPOT_EVIDENCE_CACHE_LIMIT);

const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const hotspotLibraryStart = appSource.indexOf("function HotspotLibrary(");
const hotspotLibraryEnd = appSource.indexOf("function EvidenceMini(", hotspotLibraryStart);
assert.ok(hotspotLibraryStart >= 0 && hotspotLibraryEnd > hotspotLibraryStart);
const hotspotLibrarySource = appSource.slice(hotspotLibraryStart, hotspotLibraryEnd);
assert.match(hotspotLibrarySource, /loadPersistedHotspotEvidence\s*\(/);
assert.match(hotspotLibrarySource, /hotspot\.source === "seed"/);
assert.match(hotspotLibrarySource, /当前展示的是内置样例热点/);
assert.match(hotspotLibrarySource, /data-hotspot-source=/);
assert.match(hotspotLibrarySource, /前往热点建模/);
assert.match(hotspotLibrarySource, /onNavigate\("pipeline"\)/);
assert.doesNotMatch(hotspotLibrarySource, /exportHotspotEvidence\s*\(/);
assert.doesNotMatch(hotspotLibrarySource, /cluster_paper_library|cluster_library_connection/);

const pipelineViewStart = appSource.indexOf("function PipelineView(");
const pipelineViewEnd = appSource.indexOf("function LogsView(", pipelineViewStart);
assert.ok(pipelineViewStart >= 0 && pipelineViewEnd > pipelineViewStart);
const pipelineViewSource = appSource.slice(pipelineViewStart, pipelineViewEnd);
assert.match(pipelineViewSource, /hotspot\.source === "worker"/);
assert.match(pipelineViewSource, /hotspot\.source !== "seed"/);
assert.match(pipelineViewSource, /hotspot\.analysis\?\.evidencePaperIds\.length/);
assert.match(pipelineViewSource, /当前仅有样例热点，请先运行热点建模/);

console.log(JSON.stringify({
  status: "passed",
  representativeLimit: 18,
  cacheLimit: HOTSPOT_EVIDENCE_CACHE_LIMIT,
  checks: [
    "priority-dedupe-order-cap",
    "zero-id-no-query",
    "partial-missing-bundle",
    "single-flight-pending-hit",
    "updated-at-invalidation",
    "all-missing-unavailable",
    "failure-not-cached",
    "lru-bound",
    "pending-single-flight-beyond-lru",
    "seed-hotspot-ui-disclosure",
    "seed-hotspot-pipeline-state",
    "navigation-source-never-reclusters",
  ],
}, null, 2));
