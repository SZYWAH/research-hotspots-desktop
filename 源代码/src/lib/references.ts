import type { CountFacet, Hotspot, Paper, ReportAudit, ReportEvidenceProfile, ResearchReport } from "../types";

const requiredReportSections = ["热点概述", "代表论文", "年度趋势", "来源分布", "关键词网络", "未来方向"];

export function buildReferenceSection(papers: Paper[], citedIndices?: number[]) {
  const selected =
    citedIndices && citedIndices.length > 0
      ? citedIndices.filter((index) => index >= 1 && index <= papers.length)
      : papers.map((_, index) => index + 1);

  if (selected.length === 0) return "## 参考文献\n暂无可用参考文献。";

  return [
    "## 参考文献",
    ...selected.map((index) => {
      const paper = papers[index - 1];
      const year = paper.year ?? paper.publishedDate?.slice(0, 4) ?? "未知年份";
      const url = paper.url || paper.doi || "";
      return `[${index}] ${paper.title}. ${paper.source}, ${year}.${url ? ` ${url}` : ""}`;
    }),
  ].join("\n");
}

export function extractCitationIndices(text: string) {
  return Array.from(new Set([...text.matchAll(/\[(\d+)\]/g)].map((match) => Number(match[1]))))
    .filter((value) => Number.isInteger(value))
    .sort((a, b) => a - b);
}

function reportBodyForAudit(content: string) {
  const referenceHeading = /^\s*#{1,4}\s*(参考文献|References)\s*$/im;
  const match = referenceHeading.exec(content);
  return (match ? content.slice(0, match.index) : content).trim();
}

export function normalizeReportOutput(content: string, topic: string, papers: Paper[], evidenceProfile?: ReportEvidenceProfile) {
  let text = content
    .replace(/^```(?:markdown|md|text)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  text = text.replace(/^(好的|当然|以下是|下面是|可以)[，。\s]*/i, "").trim();
  text = text.replace(/\n#{1,3}\s*(参考文献|References)\s*[\s\S]*$/i, "").trim();
  if (!text.startsWith("#")) text = `# ${topic} 学术综述\n\n${text}`;
  if (evidenceProfile && !/##\s*证据概览/.test(text)) {
    text = injectAfterTitle(text, buildEvidenceProfileMarkdown(evidenceProfile));
  }

  const cited = extractCitationIndices(text);
  return `${text}\n\n${buildReferenceSection(papers, cited)}`.trim();
}

export function buildReportEvidenceProfile(papers: Paper[], hotspot?: Hotspot): ReportEvidenceProfile {
  const years = papers.map((paper) => paper.year).filter((year): year is number => Number.isFinite(year));
  const yearRange = years.length > 0 ? `${Math.min(...years)}-${Math.max(...years)}` : "未知年份";
  const representativePaperIds = Array.from(new Set([
    ...(hotspot?.analysis?.evidencePaperIds ?? []),
    ...(hotspot?.evolution.flatMap((item) => item.representativeIds) ?? []),
    ...papers.slice(0, 12).map((paper) => paper.id),
  ])).filter((id) => papers.some((paper) => paper.id === id)).slice(0, 18);
  const keywordHighlights = Array.from(new Set([
    ...(hotspot?.keywords ?? []),
    ...topKeywordsFromPapers(papers, 12),
  ])).slice(0, 16);

  return {
    paperCount: papers.length,
    yearRange,
    sourceCounts: facetCounts(papers.map((paper) => paper.source)),
    fieldCounts: facetCounts(papers.map((paper) => paper.field).filter(Boolean)),
    keywordHighlights,
    representativePaperIds,
    hotspot: hotspot
      ? {
          id: hotspot.id,
          title: hotspot.title,
          field: hotspot.field,
          trend: hotspot.trend,
          confidence: hotspot.confidence ?? 0,
          summary: hotspot.summary,
          warnings: hotspot.analysis?.warnings ?? [],
        }
      : undefined,
  };
}

export function buildEvidenceProfileMarkdown(profile: ReportEvidenceProfile) {
  const sourceText = profile.sourceCounts.map((item) => `${item.value} ${item.count}`).join("；") || "暂无来源统计";
  const fieldText = profile.fieldCounts.map((item) => `${item.value} ${item.count}`).join("；") || "暂无领域统计";
  const hotspotText = profile.hotspot
    ? `\n- 关联热点：${profile.hotspot.title}；学科：${profile.hotspot.field}；趋势：${profile.hotspot.trend}；置信度：${Math.round(profile.hotspot.confidence * 100)}%。`
    : "";
  const warningText = profile.hotspot?.warnings.length ? `\n- 质量提示：${profile.hotspot.warnings.join("；")}。` : "";

  return [
    "## 证据概览",
    `- 绑定文献：${profile.paperCount} 篇；年份范围：${profile.yearRange}。`,
    `- 来源分布：${sourceText}。`,
    `- 领域分布：${fieldText}。`,
    `- 代表论文证据包：${profile.representativePaperIds.length} 篇。`,
    `- 关键词网络：${profile.keywordHighlights.slice(0, 12).join("、") || "暂无关键词"}。`,
    hotspotText.trim(),
    warningText.trim(),
  ].filter(Boolean).join("\n");
}

export function evaluateReportQuality(content: string, papers: Paper[]): ResearchReport["metrics"] {
  if (!content || papers.length === 0) {
    return { citationCoverage: 0, citationAccuracy: 0, consistencyScore: 0 };
  }

  const auditableContent = reportBodyForAudit(content);
  const cited = extractCitationIndices(auditableContent);
  const valid = cited.filter((index) => index >= 1 && index <= papers.length);
  const citationCoverage = valid.length / papers.length;
  const citationAccuracy = cited.length > 0 ? valid.length / cited.length : 0;
  const density = Math.min(((cited.length / Math.max(auditableContent.length, 1)) * 1000) / 8, 1);
  const consistencyScore = Math.min(1, citationAccuracy * 0.5 + citationCoverage * 0.3 + density * 0.2);

  return {
    citationCoverage: round4(citationCoverage),
    citationAccuracy: round4(citationAccuracy),
    consistencyScore: round4(consistencyScore),
  };
}

export function auditReport(content: string, papers: Paper[]): ReportAudit {
  const auditableContent = reportBodyForAudit(content);
  const citedIndices = extractCitationIndices(auditableContent);
  const valid = citedIndices.filter((index) => index >= 1 && index <= papers.length);
  const invalidCitationCount = citedIndices.length - valid.length;
  const uncitedPaperCount = Math.max(0, papers.length - new Set(valid).size);
  const paragraphs = auditableContent
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter((part) => part.length > 80 && !/^#{1,4}\s/.test(part) && !/\[\d+\]/.test(part))
    .slice(0, 8);
  const vagueSignals = ["显著", "重要", "巨大潜力", "广泛应用", "突破", "前景广阔"];
  const ungrounded = paragraphs.filter((paragraph) => vagueSignals.some((signal) => paragraph.includes(signal)));
  const coverage = papers.length > 0 ? valid.length / papers.length : 0;
  const missingRequiredSections = requiredReportSections.filter((section) => !auditableContent.includes(section));
  const evidenceProfilePresent = /##\s*证据概览/.test(auditableContent);
  const riskLevel: ReportAudit["riskLevel"] =
    invalidCitationCount > 0 || paragraphs.length >= 5 || coverage < 0.25 || missingRequiredSections.length >= 3 || !evidenceProfilePresent
      ? "high"
      : paragraphs.length >= 2 || coverage < 0.5 || missingRequiredSections.length > 0
        ? "medium"
        : "low";

  return {
    citedIndices: valid,
    validCitationCount: valid.length,
    invalidCitationCount,
    uncitedPaperCount,
    unreferencedParagraphs: ungrounded.length > 0 ? ungrounded : paragraphs,
    coverageExplanation:
      papers.length === 0
        ? "报告没有绑定文献，无法评估覆盖率。"
        : `报告引用了 ${valid.length} 个有效编号，覆盖约 ${Math.round(coverage * 100)}% 的绑定文献；未覆盖 ${uncitedPaperCount} 篇。`,
    missingRequiredSections,
    evidenceProfilePresent,
    riskLevel,
  };
}

export function reportToHtml(report: ResearchReport, papers: Paper[]) {
  const title = report.topic || "科研报告";
  const content = report.content.replace(/\n#{1,3}\s*(参考文献|References)\s*[\s\S]*$/i, "").trim();
  const headings = Array.from(content.matchAll(/^#{2,3}\s+(.+)$/gm)).map((match, index) => ({
    id: `section-${index + 1}`,
    text: match[1].trim(),
  }));
  let headingIndex = 0;
  const body = content
    .split(/\n{2,}/)
    .map((block) => {
      const text = block.trim();
      if (!text) return "";
      const h1 = text.match(/^#\s+(.+)$/);
      if (h1) return `<h1>${escapeHtml(h1[1])}</h1>`;
      const h2 = text.match(/^##\s+(.+)$/);
      if (h2) {
        const id = headings[headingIndex]?.id ?? `section-${headingIndex + 1}`;
        headingIndex += 1;
        return `<h2 id="${id}">${escapeHtml(h2[1])}</h2>`;
      }
      const h3 = text.match(/^###\s+(.+)$/);
      if (h3) {
        const id = headings[headingIndex]?.id ?? `section-${headingIndex + 1}`;
        headingIndex += 1;
        return `<h3 id="${id}">${escapeHtml(h3[1])}</h3>`;
      }
      return `<p>${inlineMarkdown(escapeHtml(text)).replace(/\n/g, "<br>")}</p>`;
    })
    .join("\n");
  const references = buildReferenceSection(papers)
    .split("\n")
    .slice(1)
    .map((line) => `<li>${escapeHtml(line.replace(/^\[\d+\]\s*/, ""))}</li>`)
    .join("\n");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    body{margin:0;background:#f6f7fb;color:#172033;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;line-height:1.78}
    main{max-width:980px;margin:0 auto;padding:48px 28px 72px}
    h1{font-size:32px;line-height:1.25;margin:0 0 20px;color:#0e1729}
    h2{font-size:22px;margin:36px 0 12px;color:#172033;border-bottom:1px solid #d8deea;padding-bottom:8px}
    h3{font-size:18px;margin:28px 0 10px;color:#24324a}
    p{font-size:15px;margin:12px 0;color:#26364f}
    .meta,.toc{border:1px solid #d8deea;background:#fff;border-radius:8px;padding:16px 18px;margin:18px 0}
    .meta{color:#5b6b82;font-size:14px}
    .toc a{display:block;color:#3454d1;text-decoration:none;margin:6px 0}
    .refs li{margin:8px 0;color:#4c5c72}
    @media print{body{background:#fff}main{padding:24px}.toc,.meta{break-inside:avoid}}
  </style>
</head>
<body>
  <main>
    <div class="meta">类型：${escapeHtml(report.mode)} / 学科：${escapeHtml(report.discipline)} / 生成时间：${escapeHtml(report.createdAt)}</div>
    <nav class="toc">
      <strong>目录</strong>
      ${headings.map((heading) => `<a href="#${heading.id}">${escapeHtml(heading.text)}</a>`).join("\n")}
    </nav>
    ${body}
    <h2>参考文献</h2>
    <ol class="refs">${references || "<li>暂无可用参考文献。</li>"}</ol>
  </main>
</body>
</html>`;
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function inlineMarkdown(value: string) {
  return value.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\[(\d+)\]/g, "<sup>[$1]</sup>");
}

function injectAfterTitle(content: string, block: string) {
  const lines = content.split("\n");
  const titleIndex = lines.findIndex((line) => /^#\s+/.test(line));
  if (titleIndex < 0) return `${block}\n\n${content}`;
  const next = [...lines];
  next.splice(titleIndex + 1, 0, "", block, "");
  return next.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function facetCounts(values: string[], limit = 8): CountFacet[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = value.trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([value, count]) => ({ value, count }));
}

function topKeywordsFromPapers(papers: Paper[], limit: number) {
  const stopwords = new Set(["the", "and", "for", "with", "from", "this", "that", "using", "based", "paper", "papers", "study", "research", "model", "models", "method", "methods", "data", "analysis", "result", "results", "system", "systems"]);
  const counts = new Map<string, number>();
  for (const paper of papers) {
    const text = `${paper.title} ${paper.abstract} ${paper.categories ?? ""}`.toLowerCase();
    for (const token of text.match(/[\p{L}\p{N}][\p{L}\p{N}-]{2,}/gu) ?? []) {
      if (stopwords.has(token) || /^\d+$/.test(token)) continue;
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([keyword]) => keyword);
}

function round4(value: number) {
  return Math.round(value * 10000) / 10000;
}
