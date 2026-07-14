import { Buffer } from "node:buffer";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const outputDir = path.join(root, "outputs");
await mkdir(outputDir, { recursive: true });

const modulePath = path.join(root, "src", "lib", "hotspotEvidenceReport.ts");
const source = await readFile(modulePath, "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
    importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
  },
  fileName: modulePath,
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled, "utf8").toString("base64")}`;
const {
  buildOfflineHotspotReport,
  formatHotspotEvidenceMarkdown,
  hotspotEvidenceToPapers,
} = await import(moduleUrl);

const evidence = {
  generatedAt: "unix-ms:1783388400000",
  databasePath: "D:\\ResearchHotspotsDesktop\\library\\research-hotspots-v7.sqlite",
  projectId: "project-final",
  selectedHotspotId: "hotspot-evidence-chain",
  selectedHotspotTitle: "Evidence-Grounded Research Hotspot Workflows",
  selectedHotspotField: "Research Infrastructure",
  hotspotPaperCount: 128,
  hotspotKeywords: ["evidence chain", "research hotspot", "SQLite", "star map"],
  hotspotTrend: "Surging",
  hotspotConfidence: 0.86,
  representativeIds: ["paper-1", "paper-2", "paper-3"],
  missingRepresentativeIds: [],
  representativePapers: [
    {
      id: "paper-1",
      source: "arXiv",
      title: "SQLite Evidence Bundles for Research Hotspot Reports",
      abstractText: "This paper studies local-first evidence bundles, representative paper snapshots, and citation-preserving report generation.",
      authors: "Chen Yu",
      categories: "evidence chain; local-first",
      field: "Research Infrastructure",
      publishedDate: "2026-03-01",
      year: 2026,
      url: "https://example.org/paper-1",
      doi: "10.0000/evidence.1",
    },
    {
      id: "paper-2",
      source: "OpenAlex",
      title: "Star Map Interfaces for Literature-Scale Topic Exploration",
      abstractText: "The work links star-map visualization, topic clusters, year evolution, and source distribution to traceable paper records.",
      authors: "Li Ming",
      categories: "visualization; topic model",
      field: "Research Infrastructure",
      publishedDate: "2025-08-12",
      year: 2025,
      url: "https://example.org/paper-2",
      doi: "10.0000/evidence.2",
    },
    {
      id: "paper-3",
      source: "CNKI",
      title: "Representative Paper Selection in Large Research Libraries",
      abstractText: "This study evaluates representative paper selection, source diversity, and yearly trend validation in large paper libraries.",
      authors: "Wang Lei",
      categories: "large library; representative papers",
      field: "Research Infrastructure",
      publishedDate: "2024-11-20",
      year: 2024,
      url: "https://example.org/paper-3",
      doi: "10.0000/evidence.3",
    },
  ],
  yearEvolution: [
    { year: 2024, count: 18, keywords: ["representative papers"], representativeIds: ["paper-3"] },
    { year: 2025, count: 42, keywords: ["star map"], representativeIds: ["paper-2"] },
    { year: 2026, count: 68, keywords: ["evidence chain"], representativeIds: ["paper-1"] },
  ],
  sourceDistribution: [
    { value: "arXiv", count: 48 },
    { value: "OpenAlex", count: 52 },
    { value: "CNKI", count: 28 },
  ],
  similarHotspots: [
    { hotspotId: "hotspot-report-audit", title: "Citation-Audited Report Generation", field: "Research Infrastructure", score: 0.78 },
  ],
  evidenceProfileMarkdown: "## Evidence Overview\n- Representative paper snapshots are complete.\n- Year evolution and source distribution are present.",
};

const hotspot = {
  id: evidence.selectedHotspotId,
  projectId: evidence.projectId,
  field: evidence.selectedHotspotField,
  topicId: 1,
  title: evidence.selectedHotspotTitle,
  summary: "A hotspot about evidence-grounded, local-first research analysis workflows.",
  keywords: ["evidence", "SQLite", "report", "star map"],
  paperCount: evidence.hotspotPaperCount,
  trend: "Surging",
  confidence: evidence.hotspotConfidence,
  source: "worker",
  coordinates: { x: 0, y: 0, z: 0 },
  evolution: evidence.yearEvolution,
  sourceDistribution: evidence.sourceDistribution,
  similarHotspots: [{ hotspotId: "hotspot-report-audit", score: 0.78 }],
  analysis: {
    keywordFocus: 0.82,
    representativeCoverage: 1,
    recentMomentum: 0.74,
    sourceDiversity: 0.9,
    evidencePaperIds: evidence.representativeIds,
    warnings: [],
  },
  updatedAt: "2026-07-07T03:00:00.000Z",
};

const papers = hotspotEvidenceToPapers(evidence);
const markdown = formatHotspotEvidenceMarkdown(evidence);
const report = buildOfflineHotspotReport(hotspot, evidence, papers);

const requiredReportSections = [
  "## Evidence Overview",
  "## Hotspot Overview",
  "## Representative Papers",
  "## Year Trend",
  "## Source Distribution",
  "## Keyword Network",
  "## Future Directions",
  "## References",
];
const requiredEvidenceSections = [
  "## Evidence Overview",
  "## Year Evolution",
  "## Source Distribution",
  "## Similar Hotspots",
  "## Representative Papers",
  "## Missing Representative IDs",
];

const checks = [
  ["paper count", papers.length === 3],
  ["source normalization", papers[0].source === "arxiv" && papers[1].source === "openalex" && papers[2].source === "cnki"],
  ["evidence markdown sections", requiredEvidenceSections.every((section) => markdown.includes(section))],
  ["offline report sections", requiredReportSections.every((section) => report.includes(section))],
  ["offline report citations", /\[1\]/.test(report) && /\[2\]/.test(report) && /\[3\]/.test(report)],
  ["missing representative ids clean", markdown.includes("- None")],
];
const failed = checks.filter(([, passed]) => !passed).map(([name]) => name);

const reportPath = path.join(outputDir, "v20_hotspot_evidence_offline_report_check.md");
const summaryPath = path.join(outputDir, "v20_hotspot_evidence_report_check.json");
await writeFile(reportPath, `${report.trim()}\n`, "utf8");
await writeFile(summaryPath, `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  passed: failed.length === 0,
  failed,
  paperCount: papers.length,
  reportPath: path.relative(root, reportPath),
  checkedSections: requiredReportSections,
}, null, 2)}\n`, "utf8");

if (failed.length > 0) {
  console.error(`Hotspot evidence report check failed: ${failed.join(", ")}`);
  process.exit(1);
}

console.log(`Hotspot evidence report check passed: papers=${papers.length}`);
console.log(`Summary: ${summaryPath}`);
console.log(`Report: ${reportPath}`);
