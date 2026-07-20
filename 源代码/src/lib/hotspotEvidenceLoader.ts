import type { Hotspot, HotspotEvidenceBundle, HotspotEvidencePaperSnapshot, Paper } from "../types";

export const HOTSPOT_EVIDENCE_CACHE_LIMIT = 64;
export const HOTSPOT_EVIDENCE_MAX_PAPERS = 18;

export type HotspotEvidenceCacheState = "none" | "miss" | "pending" | "hit";
export type HotspotEvidenceLoadStatus = "ready" | "missing-evidence" | "unavailable";

export type HotspotEvidenceDiagnostics = {
  evidenceLoadMs: number;
  evidenceCacheState: HotspotEvidenceCacheState;
  requestedRepresentativeCount: number;
  foundRepresentativeCount: number;
  missingRepresentativeCount: number;
  requestSequence: number;
  fullReclusterTriggeredByNavigation: false;
};

export type HotspotEvidenceLoadResult = {
  status: HotspotEvidenceLoadStatus;
  bundle: HotspotEvidenceBundle | null;
  diagnostics: HotspotEvidenceDiagnostics;
  errorMessage?: string;
};

export type HotspotEvidenceLoadInput = {
  databaseDir: string;
  projectId: string;
  hotspot: Hotspot;
  hotspots: Hotspot[];
  requestSequence: number;
  maxPapers?: number;
  fetchPapersByIds: (ids: string[]) => Promise<Paper[]>;
};

const evidenceCache = new Map<string, HotspotEvidenceLoadResult>();
const pendingEvidenceRequests = new Map<string, Promise<HotspotEvidenceLoadResult>>();

export function collectHotspotRepresentativeIds(hotspot: Hotspot, maxPapers = HOTSPOT_EVIDENCE_MAX_PAPERS) {
  const limit = Math.max(1, Math.min(50, Math.floor(maxPapers)));
  const ids = [
    ...(hotspot.analysis?.evidencePaperIds ?? []),
    ...hotspot.evolution.flatMap((item) => item.representativeIds),
  ];
  const uniqueIds: string[] = [];
  const seen = new Set<string>();
  for (const rawId of ids) {
    const id = rawId.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    uniqueIds.push(id);
    if (uniqueIds.length >= limit) break;
  }
  return uniqueIds;
}

export function hotspotEvidenceCacheKey(input: Pick<HotspotEvidenceLoadInput, "databaseDir" | "projectId" | "hotspot"> & { maxPapers: number }) {
  const databaseDir = input.databaseDir.trim().replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase() || "default";
  return `${databaseDir}::${input.projectId}::${input.hotspot.id}::${input.hotspot.updatedAt}::${input.maxPapers}`;
}

export async function loadPersistedHotspotEvidence(input: HotspotEvidenceLoadInput): Promise<HotspotEvidenceLoadResult> {
  const startedAt = performance.now();
  const maxPapers = Math.max(1, Math.min(50, Math.floor(input.maxPapers ?? HOTSPOT_EVIDENCE_MAX_PAPERS)));
  const representativeIds = collectHotspotRepresentativeIds(input.hotspot, maxPapers);
  if (representativeIds.length === 0) {
    return {
      status: "missing-evidence",
      bundle: null,
      diagnostics: createDiagnostics(input.requestSequence, "none", startedAt, 0, 0),
    };
  }

  const cacheKey = hotspotEvidenceCacheKey({ ...input, maxPapers });
  const cachedResult = evidenceCache.get(cacheKey);
  if (cachedResult) {
    touchCacheEntry(cacheKey, cachedResult);
    return withRequestDiagnostics(cachedResult, input.requestSequence, "hit", startedAt);
  }

  const pendingRequest = pendingEvidenceRequests.get(cacheKey);
  if (pendingRequest) {
    const result = await pendingRequest;
    return withRequestDiagnostics(result, input.requestSequence, "pending", startedAt);
  }

  const request = (async () => {
    try {
      const papers = await input.fetchPapersByIds(representativeIds);
      const bundle = buildPersistedHotspotEvidenceBundle({
        databaseDir: input.databaseDir,
        projectId: input.projectId,
        hotspot: input.hotspot,
        hotspots: input.hotspots,
        representativeIds,
        papers,
      });
      const foundCount = bundle.representativePapers.length;
      if (foundCount === 0) {
        return {
          status: "unavailable",
          bundle: null,
          diagnostics: createDiagnostics(input.requestSequence, "miss", startedAt, representativeIds.length, 0),
          errorMessage: "No persisted representative papers were found in SQLite.",
        } satisfies HotspotEvidenceLoadResult;
      }
      const result = {
        status: "ready",
        bundle,
        diagnostics: createDiagnostics(input.requestSequence, "miss", startedAt, representativeIds.length, foundCount),
      } satisfies HotspotEvidenceLoadResult;
      evidenceCache.set(cacheKey, result);
      trimEvidenceCache();
      return result;
    } catch (error) {
      return {
        status: "unavailable",
        bundle: null,
        diagnostics: createDiagnostics(input.requestSequence, "miss", startedAt, representativeIds.length, 0),
        errorMessage: error instanceof Error ? error.message : String(error),
      } satisfies HotspotEvidenceLoadResult;
    } finally {
      pendingEvidenceRequests.delete(cacheKey);
    }
  })();
  pendingEvidenceRequests.set(cacheKey, request);
  return request;
}

export function buildPersistedHotspotEvidenceBundle(input: {
  databaseDir: string;
  projectId: string;
  hotspot: Hotspot;
  hotspots: Hotspot[];
  representativeIds: string[];
  papers: Paper[];
}): HotspotEvidenceBundle {
  const papersById = new Map(input.papers.map((paper) => [paper.id, paper]));
  const representativePapers = input.representativeIds
    .map((id) => papersById.get(id))
    .filter((paper): paper is Paper => Boolean(paper))
    .map(paperToEvidenceSnapshot);
  const foundIds = new Set(representativePapers.map((paper) => paper.id));
  const missingRepresentativeIds = input.representativeIds.filter((id) => !foundIds.has(id));
  const hotspotById = new Map(input.hotspots.map((hotspot) => [hotspot.id, hotspot]));
  const similarHotspots = (input.hotspot.similarHotspots ?? []).flatMap((relation) => {
    const similar = hotspotById.get(relation.hotspotId);
    return similar
      ? [{ hotspotId: similar.id, title: similar.title, field: similar.field, score: relation.score }]
      : [];
  });

  return {
    generatedAt: new Date().toISOString(),
    databasePath: input.databaseDir.trim()
      ? `${input.databaseDir.replace(/[\\/]+$/, "")}\\research-hotspots-v7.sqlite`
      : "default SQLite library",
    projectId: input.projectId,
    selectedHotspotId: input.hotspot.id,
    selectedHotspotTitle: input.hotspot.title,
    selectedHotspotField: input.hotspot.field,
    hotspotPaperCount: input.hotspot.paperCount,
    hotspotKeywords: [...input.hotspot.keywords],
    hotspotTrend: input.hotspot.trend,
    hotspotConfidence: input.hotspot.confidence ?? 0,
    representativeIds: [...input.representativeIds],
    missingRepresentativeIds,
    representativePapers,
    yearEvolution: input.hotspot.evolution.map((item) => ({
      year: item.year,
      count: item.count,
      keywords: [...item.keywords],
      representativeIds: [...item.representativeIds],
    })),
    sourceDistribution: (input.hotspot.sourceDistribution ?? []).map((item) => ({ ...item })),
    similarHotspots,
    evidenceProfileMarkdown: buildEvidenceProfileMarkdown(input.hotspot, representativePapers, missingRepresentativeIds),
  };
}

export function resetHotspotEvidenceCacheForAudit() {
  evidenceCache.clear();
  pendingEvidenceRequests.clear();
}

export function hotspotEvidenceCacheSizeForAudit() {
  return evidenceCache.size;
}

function paperToEvidenceSnapshot(paper: Paper): HotspotEvidencePaperSnapshot {
  return {
    id: paper.id,
    source: paper.source,
    title: paper.title,
    abstractText: paper.abstract,
    authors: paper.authors,
    categories: paper.categories,
    field: paper.field,
    publishedDate: paper.publishedDate,
    year: paper.year,
    url: paper.url,
    doi: paper.doi,
  };
}

function buildEvidenceProfileMarkdown(hotspot: Hotspot, papers: HotspotEvidencePaperSnapshot[], missingIds: string[]) {
  const yearRange = papers.map((paper) => paper.year).filter((year): year is number => typeof year === "number").sort((a, b) => a - b);
  const sources = Array.from(new Set(papers.map((paper) => paper.source)));
  return [
    `## Persisted V20 Evidence Profile`,
    `- Hotspot: ${hotspot.title}`,
    `- Representative papers found: ${papers.length}`,
    `- Missing representative IDs: ${missingIds.length}`,
    `- Year range: ${yearRange.length ? `${yearRange[0]}-${yearRange.at(-1)}` : "unknown"}`,
    `- Sources: ${sources.join(", ") || "unknown"}`,
    `- Keywords: ${hotspot.keywords.slice(0, 12).join(", ") || "none"}`,
  ].join("\n");
}

function createDiagnostics(
  requestSequence: number,
  cacheState: HotspotEvidenceCacheState,
  startedAt: number,
  requestedCount: number,
  foundCount: number,
): HotspotEvidenceDiagnostics {
  return {
    evidenceLoadMs: Math.max(0, performance.now() - startedAt),
    evidenceCacheState: cacheState,
    requestedRepresentativeCount: requestedCount,
    foundRepresentativeCount: foundCount,
    missingRepresentativeCount: Math.max(0, requestedCount - foundCount),
    requestSequence,
    fullReclusterTriggeredByNavigation: false,
  };
}

function withRequestDiagnostics(
  result: HotspotEvidenceLoadResult,
  requestSequence: number,
  cacheState: HotspotEvidenceCacheState,
  startedAt: number,
): HotspotEvidenceLoadResult {
  return {
    ...result,
    diagnostics: {
      ...result.diagnostics,
      evidenceLoadMs: Math.max(0, performance.now() - startedAt),
      evidenceCacheState: cacheState,
      requestSequence,
    },
  };
}

function touchCacheEntry(key: string, entry: HotspotEvidenceLoadResult) {
  evidenceCache.delete(key);
  evidenceCache.set(key, entry);
}

function trimEvidenceCache() {
  while (evidenceCache.size > HOTSPOT_EVIDENCE_CACHE_LIMIT) {
    const oldestKey = evidenceCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    evidenceCache.delete(oldestKey);
  }
}
