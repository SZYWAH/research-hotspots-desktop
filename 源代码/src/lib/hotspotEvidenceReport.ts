import type { Hotspot, HotspotEvidenceBundle, Paper, SourceKind } from "../types";

export function hotspotEvidenceToPapers(bundle: HotspotEvidenceBundle | null): Paper[] {
  if (!bundle) return [];
  const timestamp = evidenceGeneratedAtToIso(bundle.generatedAt);
  return bundle.representativePapers.map((paper) => ({
    id: paper.id,
    projectId: bundle.projectId,
    source: normalizeEvidenceSource(paper.source),
    title: paper.title,
    abstract: paper.abstractText,
    authors: paper.authors,
    categories: paper.categories,
    field: paper.field,
    publishedDate: paper.publishedDate,
    year: paper.year,
    url: paper.url,
    doi: paper.doi,
    createdAt: timestamp,
    updatedAt: timestamp,
  }));
}

export function formatHotspotEvidenceMarkdown(bundle: HotspotEvidenceBundle) {
  const yearLines = bundle.yearEvolution.length
    ? bundle.yearEvolution
        .slice()
        .sort((a, b) => a.year - b.year)
        .map((row) => `- ${row.year}: ${row.count} papers; keywords: ${row.keywords.slice(0, 8).join(", ") || "none"}; representative IDs: ${row.representativeIds.slice(0, 6).join(", ") || "none"}`)
        .join("\n")
    : "- No year-evolution data.";
  const sourceLines = bundle.sourceDistribution.length
    ? bundle.sourceDistribution.map((row) => `- ${row.value}: ${row.count}`).join("\n")
    : "- No source-distribution data.";
  const similarLines = bundle.similarHotspots.length
    ? bundle.similarHotspots.map((row) => `- ${row.title} (${row.field}): ${Math.round(row.score * 100)}%`).join("\n")
    : "- No similar hotspots.";
  const paperLines = bundle.representativePapers.length
    ? bundle.representativePapers
        .map((paper, index) => {
          const year = paper.year ?? paper.publishedDate?.slice(0, 4) ?? "unknown year";
          const link = paper.url || paper.doi || "";
          return `${index + 1}. ${paper.title}\n   - ID: ${paper.id}\n   - Source: ${paper.source}; year: ${year}; field: ${paper.field}${link ? `\n   - Link: ${link}` : ""}`;
        })
        .join("\n")
    : "No representative papers.";

  return [
    `# ${bundle.selectedHotspotTitle} Evidence Bundle`,
    "",
    `- Hotspot ID: ${bundle.selectedHotspotId}`,
    `- Project ID: ${bundle.projectId}`,
    `- Field: ${bundle.selectedHotspotField}`,
    `- Hotspot paper count: ${bundle.hotspotPaperCount}`,
    `- Trend: ${bundle.hotspotTrend}`,
    `- Confidence: ${Math.round(bundle.hotspotConfidence * 100)}%`,
    `- Keywords: ${bundle.hotspotKeywords.join(", ") || "none"}`,
    `- Generated at: ${evidenceGeneratedAtToIso(bundle.generatedAt)}`,
    `- SQLite: ${bundle.databasePath}`,
    "",
    "## Evidence Overview",
    bundle.evidenceProfileMarkdown || "No evidence overview.",
    "",
    "## Year Evolution",
    yearLines,
    "",
    "## Source Distribution",
    sourceLines,
    "",
    "## Similar Hotspots",
    similarLines,
    "",
    "## Representative Papers",
    paperLines,
    "",
    "## Missing Representative IDs",
    bundle.missingRepresentativeIds.length ? bundle.missingRepresentativeIds.map((id) => `- ${id}`).join("\n") : "- None",
  ].join("\n");
}

export function buildOfflineHotspotReport(hotspot: Hotspot, bundle: HotspotEvidenceBundle, papers: Paper[]) {
  const citationAll = papers.map((_, index) => `[${index + 1}]`).join("");
  const citationTop = papers.slice(0, Math.min(3, papers.length)).map((_, index) => `[${index + 1}]`).join("");
  const yearText = bundle.yearEvolution.length
    ? bundle.yearEvolution.slice().sort((a, b) => a.year - b.year).map((row) => `${row.year}:${row.count}`).join(" / ")
    : papers.map((paper) => paper.year ?? "unknown").join(" / ");
  const sourceText = bundle.sourceDistribution.length
    ? bundle.sourceDistribution.map((row) => `${row.value} ${row.count}`).join(" / ")
    : countBy(papers, (paper) => paper.source).map(([value, count]) => `${value} ${count}`).join(" / ");
  const keywordText = Array.from(new Set([...bundle.hotspotKeywords, ...hotspot.keywords])).slice(0, 16).join(", ") || "no keywords";
  const similarText = bundle.similarHotspots.length
    ? bundle.similarHotspots.slice(0, 5).map((row) => `${row.title} (${row.field}, ${Math.round(row.score * 100)}%)`).join("; ")
    : "no similar hotspot records";
  const references = papers.map((paper, index) => {
    const year = paper.year ?? paper.publishedDate?.slice(0, 4) ?? "unknown year";
    const link = paper.url || paper.doi || "";
    return `[${index + 1}] ${paper.title}. ${paper.source}, ${year}.${link ? ` ${link}` : ""}`;
  }).join("\n");
  const representativeText = papers
    .map((paper, index) => {
      const abstract = paper.abstract.replace(/\s+/g, " ").trim();
      const summary = abstract.length > 180 ? `${abstract.slice(0, 177)}...` : abstract || "No abstract snapshot is available for this representative paper.";
      return `- [${index + 1}] ${paper.title}: this record comes from ${paper.source}, year ${paper.year ?? paper.publishedDate?.slice(0, 4) ?? "unknown"}, and provides direct evidence for the hotspot. ${summary}`;
    })
    .join("\n");

  return [
    `# ${hotspot.title} Offline Evidence Report`,
    "",
    "## Evidence Overview",
    `- Linked hotspot: ${hotspot.title}; field: ${hotspot.field}; trend: ${hotspot.trend}; confidence: ${Math.round((hotspot.confidence ?? 0) * 100)}%.`,
    `- Representative papers: ${papers.length}; hotspot paper count: ${bundle.hotspotPaperCount}; missing representative IDs: ${bundle.missingRepresentativeIds.length}.`,
    `- Year trend: ${yearText}.`,
    `- Source distribution: ${sourceText}.`,
    `- Keyword network: ${keywordText}.`,
    "",
    "## Hotspot Overview",
    `${hotspot.title} is a traceable research topic exported from the SQLite hotspot evidence bundle. This report does not call an AI service; it is generated directly from representative papers, year evolution, source distribution, and similar-hotspot metadata, so it can serve as an auditable evidence draft for presentations or later AI-assisted writing ${citationTop}.`,
    "",
    `${hotspot.summary || "No human-written hotspot summary is available."} The evidence bundle places this topic in ${hotspot.field}, marks the trend as ${hotspot.trend}, and records confidence at ${Math.round((hotspot.confidence ?? 0) * 100)}%. These claims still need real 100000+ library validation, but the representative-paper trail is preserved here ${citationTop}.`,
    "",
    "## Representative Papers",
    representativeText || "No representative papers.",
    "",
    `These papers form the minimum evidence package for the current hotspot. Every conclusion in this report should be traceable to numbered papers, hotspot keywords, year evolution, or source statistics; later AI reports should preserve these citation IDs to avoid unsupported generalization ${citationAll}.`,
    "",
    "## Year Trend",
    `The current year trend is: ${yearText}. Year evolution helps distinguish early exploration, stable accumulation, and rapid growth. Sparse years should first be checked against import coverage instead of being interpreted as a true drop in research activity ${citationTop}.`,
    "",
    "## Source Distribution",
    `The current source distribution is: ${sourceText}. Source structure affects confidence: single-source hotspots should be framed cautiously, while more balanced arXiv, OpenAlex, CNKI, and local records make the claim more robust ${citationTop}.`,
    "",
    "## Keyword Network",
    `The current keyword network includes: ${keywordText}. These terms should constrain star-map labels, semantic links, and report topics. Similar hotspot context: ${similarText}. Future iterations can split or merge hotspots by keyword overlap, shared representative papers, and similar year trends ${citationTop}.`,
    "",
    "## Future Directions",
    `The next step is to validate this report in the full workflow: run cleaning, clustering, star-map export, and report audit on the real 100000+ paper library, then compare whether representative papers, keyword networks, and year trends remain stable ${citationAll}.`,
    "",
    "The AI layer can turn this into smoother prose, but it must remain constrained by the evidence chain: keep citation IDs, keep the representative-paper list, keep source/year statistics, and avoid claims not supported by the evidence bundle.",
    "",
    "## References",
    references || "No references.",
  ].join("\n");
}

function evidenceGeneratedAtToIso(value: string) {
  const unixMs = value.match(/^unix-ms:(\d+)$/)?.[1];
  if (unixMs) {
    const parsed = Number(unixMs);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  return new Date().toISOString();
}

function normalizeEvidenceSource(value: string): SourceKind {
  const normalized = value.trim().toLowerCase();
  return normalized === "arxiv" || normalized === "openalex" || normalized === "cnki" || normalized === "local" ? normalized : "local";
}

function countBy<T>(rows: T[], getKey: (row: T) => string) {
  const counts = new Map<string, number>();
  rows.forEach((row) => {
    const key = getKey(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
}
