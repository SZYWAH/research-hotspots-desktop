import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const outputDir = path.join(root, "outputs");

const args = process.argv.slice(2).filter((arg) => arg !== "--");
if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
  printHelp();
  process.exit(args.length === 0 ? 1 : 0);
}

const evidencePath = path.resolve(args[0]);
const markdownOutput = path.resolve(readOption("--output") || path.join(outputDir, "v20_hotspot_report_final.md"));
const htmlOutput = path.resolve(readOption("--html-output") || path.join(outputDir, "v20_hotspot_report_final.html"));
const minPapers = parsePositiveInt(readOption("--min-papers"), "--min-papers", 1);

await mkdir(path.dirname(markdownOutput), { recursive: true });
await mkdir(path.dirname(htmlOutput), { recursive: true });

const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
validateEvidence(evidence, minPapers);

const markdown = buildMarkdownReport(evidence);
const html = markdownToHtml(markdown, evidence);

await writeFile(markdownOutput, `${markdown.trim()}\n`, "utf8");
await writeFile(htmlOutput, `${html.trim()}\n`, "utf8");

console.log(`Hotspot report export completed: papers=${evidence.representativePapers.length}, hotspot=${evidence.selectedHotspotId}`);
console.log(`Markdown: ${markdownOutput}`);
console.log(`HTML: ${htmlOutput}`);

function readOption(name) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  return args[index + 1];
}

function parsePositiveInt(value, name, fallback) {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer.`);
  return parsed;
}

function printHelp() {
  console.log(`
Usage:
  node scripts/v20_hotspot_report_export.mjs outputs/v20_hotspot_evidence_final.json --output outputs/v20_hotspot_report_final.md --html-output outputs/v20_hotspot_report_final.html

Options:
  --output <file>        Markdown report output.
  --html-output <file>   HTML report output.
  --min-papers <n>       Minimum representative paper snapshots required. Defaults to 1.

This script creates a deterministic evidence-bound report from a hotspot evidence bundle. It does not call any AI service.
`.trim());
}

function validateEvidence(evidence, minPapers) {
  if (!evidence || typeof evidence !== "object") throw new Error("Evidence bundle must be a JSON object.");
  if (!evidence.selectedHotspotId || !evidence.selectedHotspotTitle) throw new Error("Evidence bundle is missing selected hotspot metadata.");
  if (!Array.isArray(evidence.representativePapers) || evidence.representativePapers.length < minPapers) {
    throw new Error(`Evidence bundle must contain at least ${minPapers} representative paper snapshots.`);
  }
  if (Array.isArray(evidence.missingRepresentativeIds) && evidence.missingRepresentativeIds.length > 0) {
    throw new Error(`Evidence bundle has missing representative paper ids: ${evidence.missingRepresentativeIds.join(", ")}`);
  }
}

function buildMarkdownReport(evidence) {
  const papers = evidence.representativePapers;
  const allCitation = papers.map((_, index) => `[${index + 1}]`).join("");
  const topCitation = papers.slice(0, Math.min(3, papers.length)).map((_, index) => `[${index + 1}]`).join("");
  const keywordText = (evidence.hotspotKeywords ?? []).slice(0, 16).join(", ") || "no keyword evidence";
  const sourceText = (evidence.sourceDistribution ?? []).map((item) => `${item.value}: ${item.count}`).join("; ") || buildFacetText(papers, "source");
  const yearText = (evidence.yearEvolution ?? []).map((item) => `${item.year}: ${item.count}`).join("; ") || buildYearText(papers);
  const similarText = (evidence.similarHotspots ?? [])
    .slice(0, 5)
    .map((item) => `${item.title} (${item.field}, similarity ${Math.round(item.score * 100)}%)`)
    .join("; ") || "no high-similarity hotspot recorded in the current bundle";
  const referenceLines = papers.map((paper, index) => `[${index + 1}] ${paper.title}. ${paper.source || "local"}, ${paper.year ?? paper.publishedDate ?? "unknown year"}.${paper.url || paper.doi ? ` ${paper.url || paper.doi}` : ""}`);

  return [
    `# ${evidence.selectedHotspotTitle} Research Hotspot Report`,
    "",
    "## Evidence Overview",
    `- Hotspot id: ${evidence.selectedHotspotId}`,
    `- Field: ${evidence.selectedHotspotField}`,
    `- Paper count behind hotspot: ${evidence.hotspotPaperCount}`,
    `- Representative papers in this report: ${papers.length}`,
    `- Trend: ${evidence.hotspotTrend}; confidence: ${Math.round((evidence.hotspotConfidence ?? 0) * 100)}%`,
    `- Source distribution: ${sourceText}`,
    `- Year evolution: ${yearText}`,
    `- Keyword network: ${keywordText}`,
    "",
    "## Hotspot Overview",
    `${evidence.selectedHotspotTitle} is treated as a data-backed research hotspot rather than a visual label. The current evidence bundle links the hotspot to ${papers.length} representative paper snapshot${papers.length === 1 ? "" : "s"}, source distribution, yearly evolution, and similar-hotspot context ${topCitation}. This makes the report traceable: every analytical statement below points back to numbered papers, recorded sources, or explicit hotspot metadata.`,
    "",
    `The topic sits in ${evidence.selectedHotspotField} and is currently classified as ${evidence.hotspotTrend}. Its keyword network is centered on ${keywordText}. The confidence score is ${Math.round((evidence.hotspotConfidence ?? 0) * 100)}%, so the report should be read as an evidence-bound synthesis, not as an unconstrained AI narrative ${topCitation}.`,
    "",
    "## Representative Papers",
    ...papers.map((paper, index) => `- [${index + 1}] ${paper.title}. Source: ${paper.source || "local"}; year: ${paper.year ?? paper.publishedDate ?? "unknown"}; field: ${paper.field}. ${summarizePaper(paper)}`),
    "",
    `Together these representative papers form the minimum evidence package for this hotspot. They cover the terms ${keywordText}, and they anchor report generation to concrete records instead of inferred or decorative star-map nodes ${allCitation}.`,
    "",
    "## Year Trend",
    `The yearly signal is: ${yearText}. This trend should be interpreted together with the representative paper list, because sparse years can reflect import coverage as much as true field momentum ${topCitation}. When the same hotspot is re-exported from a real 100000+ library, this section should become the main place to compare early, mature, and emerging phases.`,
    "",
    `For a course presentation or research overview, the safest reading is that the hotspot has an observable temporal footprint and a current trend label of ${evidence.hotspotTrend}. The evidence bundle preserves year-level representative IDs, which allows users to open the underlying papers and verify whether the trend is driven by one cluster, multiple sources, or a recent burst of records ${allCitation}.`,
    "",
    "## Source Distribution",
    `The source distribution is: ${sourceText}. A reliable research workstation must expose this distribution because source concentration changes how strong a conclusion should be. A hotspot dominated by one source should be framed more cautiously than one supported by diverse arXiv, OpenAlex, CNKI, and local records ${topCitation}.`,
    "",
    `The current bundle also records missing representative IDs. This report was generated only after confirming that the missing representative list is empty, so the cited papers are directly traceable through the SQLite evidence chain ${allCitation}.`,
    "",
    "## Keyword Network",
    `The keyword network is: ${keywordText}. These terms connect the visual star-map layer to the report layer: node brightness, labels, semantic links, and written analysis should all remain consistent with the same keyword evidence. Similar hotspot context: ${similarText}.`,
    "",
    `This keyword evidence is especially important for avoiding vague reports. The generator should not claim broad field-wide conclusions unless they are visible in the keywords, representative papers, source distribution, or year evolution captured in the bundle ${topCitation}.`,
    "",
    "## Future Directions",
    `Future work should focus on evidence-chain quality, representative-paper selection, yearly trend validation, and source-diversity checks. For this hotspot, the immediate next step is to run the same report export against the user's real 100000+ paper library and compare whether the top keywords, yearly distribution, and representative papers remain stable ${allCitation}.`,
    "",
    "A stronger final report can then add AI-written interpretation, but the AI layer should remain constrained by this evidence profile. In practice, that means preserving citation IDs, rejecting unsupported claims, and keeping the report auditable through the same hotspot evidence bundle used by the star-map inspector and hotspot report preview.",
    "",
    "## References",
    "",
    ...referenceLines,
  ].join("\n");
}

function summarizePaper(paper) {
  const abstractText = String(paper.abstractText ?? "").replace(/\s+/g, " ").trim();
  if (!abstractText) return "No abstract snapshot was available in the evidence bundle.";
  return abstractText.length > 260 ? `${abstractText.slice(0, 257)}...` : abstractText;
}

function buildFacetText(papers, key) {
  const counts = new Map();
  for (const paper of papers) {
    const value = String(paper[key] ?? "unknown").trim() || "unknown";
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].map(([value, count]) => `${value}: ${count}`).join("; ");
}

function buildYearText(papers) {
  const counts = new Map();
  for (const paper of papers) {
    const value = Number.isFinite(paper.year) ? String(paper.year) : "unknown";
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([value, count]) => `${value}: ${count}`).join("; ");
}

function markdownToHtml(markdown, evidence) {
  const blocks = markdown.split(/\n{2,}/);
  const body = blocks.map((block) => blockToHtml(block)).join("\n");
  const headings = [...markdown.matchAll(/^##\s+(.+)$/gm)].map((match, index) => ({ id: `section-${index + 1}`, text: match[1] }));
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(evidence.selectedHotspotTitle)} Research Hotspot Report</title>
  <style>
    body{margin:0;background:#f7f8fb;color:#172033;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;line-height:1.78}
    main{max-width:980px;margin:0 auto;padding:48px 28px 72px}
    h1{font-size:32px;line-height:1.25;margin:0 0 20px;color:#0e1729}
    h2{font-size:22px;margin:36px 0 12px;color:#172033;border-bottom:1px solid #d8deea;padding-bottom:8px}
    p,li{font-size:15px;color:#26364f}
    .meta,.toc{border:1px solid #d8deea;background:#fff;border-radius:8px;padding:16px 18px;margin:18px 0}
    .meta{color:#5b6b82;font-size:14px}
    .toc a{display:block;color:#3454d1;text-decoration:none;margin:6px 0}
    .refs li{margin:8px 0;color:#4c5c72}
    @media print{body{background:#fff}main{padding:24px}.toc,.meta{break-inside:avoid}}
  </style>
</head>
<body>
  <main>
    <div class="meta">Evidence-bound export / ${escapeHtml(evidence.selectedHotspotField)} / ${escapeHtml(new Date().toISOString())}</div>
    <nav class="toc">
      <strong>Contents</strong>
      ${headings.map((heading) => `<a href="#${heading.id}">${escapeHtml(heading.text)}</a>`).join("\n")}
    </nav>
    ${body}
  </main>
</body>
</html>`;
}

function blockToHtml(block) {
  const text = block.trim();
  if (!text) return "";
  const h1 = text.match(/^#\s+(.+)$/);
  if (h1) return `<h1>${escapeHtml(h1[1])}</h1>`;
  const h2 = text.match(/^##\s+(.+)$/);
  if (h2) return `<h2>${escapeHtml(h2[1])}</h2>`;
  if (/^- /.test(text)) {
    const lines = text.split("\n").filter(Boolean);
    return `<ul>${lines.map((line) => `<li>${inlineMarkdown(escapeHtml(line.replace(/^- /, "")))}</li>`).join("")}</ul>`;
  }
  if (/^\[\d+\]\s+/.test(text)) {
    const lines = text.split("\n").filter(Boolean);
    return `<ol class="refs">${lines.map((line) => `<li>${inlineMarkdown(escapeHtml(line.replace(/^\[\d+\]\s+/, "")))}</li>`).join("")}</ol>`;
  }
  return `<p>${inlineMarkdown(escapeHtml(text)).replace(/\n/g, "<br>")}</p>`;
}

function escapeHtml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function inlineMarkdown(value) {
  return value.replace(/\[(\d+)\]/g, "<sup>[$1]</sup>");
}
