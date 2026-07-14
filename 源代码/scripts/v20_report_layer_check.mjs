import { Buffer } from "node:buffer";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const outputDir = path.join(root, "outputs");

await mkdir(outputDir, { recursive: true });

const sourcePath = path.join(root, "src", "lib", "references.ts");
const source = await readFile(sourcePath, "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
    importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
  },
  fileName: sourcePath,
}).outputText;

const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled, "utf8").toString("base64")}`;
const references = await import(moduleUrl);

const now = "2026-07-07T03:20:00.000Z";
const papers = [
  {
    id: "paper-1",
    title: "Retrieval-Augmented Agents for Scientific Literature Synthesis",
    abstract: "This paper studies retrieval-augmented scientific agents for evidence-grounded literature synthesis and citation checking.",
    source: "arXiv",
    field: "Artificial Intelligence",
    year: 2026,
    publishedDate: "2026-02-14",
    url: "https://example.org/paper-1",
    doi: "10.0000/example.1",
    categories: "retrieval augmented generation, scientific agents",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "paper-2",
    title: "Citation-Grounded Review Generation with Evidence Profiles",
    abstract: "The work evaluates evidence profiles, representative papers, source distribution, and year trends in review generation.",
    source: "OpenAlex",
    field: "Artificial Intelligence",
    year: 2025,
    publishedDate: "2025-11-04",
    url: "https://example.org/paper-2",
    doi: "10.0000/example.2",
    categories: "evidence profile, citation audit",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "paper-3",
    title: "Knowledge Graph Signals for Research Hotspot Evolution",
    abstract: "This study models yearly evolution, keyword networks, and source diversity for research hotspot analysis.",
    source: "CNKI",
    field: "Knowledge Graph",
    year: 2024,
    publishedDate: "2024-06-18",
    url: "https://example.org/paper-3",
    doi: "10.0000/example.3",
    categories: "knowledge graph, hotspot evolution",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "paper-4",
    title: "Early Survey on Local-First Scholarly Workstations",
    abstract: "The survey discusses local storage, SQLite indexing, privacy, and workstation workflows for scholarly analysis.",
    source: "Local",
    field: "Human-Computer Interaction",
    year: 2022,
    publishedDate: "2022-09-22",
    url: "https://example.org/paper-4",
    doi: "10.0000/example.4",
    categories: "local first, scholarly workstation",
    createdAt: now,
    updatedAt: now,
  },
];

const hotspot = {
  id: "hotspot-rag-review",
  projectId: "default",
  field: "Artificial Intelligence",
  topicId: 1,
  title: "Retrieval Augmented Scientific Review",
  summary: "A hotspot around evidence-grounded review generation and scientific literature synthesis.",
  keywords: ["retrieval", "evidence", "citation", "scientific agents", "keyword network"],
  paperCount: papers.length,
  confidence: 0.82,
  trend: "surging",
  coordinates: { x: 0, y: 0, z: 0 },
  evolution: [
    { year: 2024, count: 1, keywords: ["knowledge graph"], representativeIds: ["paper-3"] },
    { year: 2025, count: 1, keywords: ["evidence profile"], representativeIds: ["paper-2"] },
    { year: 2026, count: 1, keywords: ["retrieval"], representativeIds: ["paper-1"] },
  ],
  sourceDistribution: [
    { value: "arXiv", count: 1 },
    { value: "OpenAlex", count: 1 },
    { value: "CNKI", count: 1 },
  ],
  similarHotspots: [],
  analysis: {
    keywordFocus: 0.78,
    representativeCoverage: 0.75,
    recentMomentum: 0.66,
    sourceDiversity: 0.8,
    evidencePaperIds: ["paper-1", "paper-2", "paper-3"],
    warnings: [],
  },
  updatedAt: now,
};

const evidenceProfile = references.buildReportEvidenceProfile(papers, hotspot);
const rawReport = `
# Retrieval Augmented Scientific Review 学术综述

## 一、热点概述
检索增强科研综述的核心价值在于把文献检索、证据绑定和生成式写作连接起来，从而降低综述生成中的幻觉风险[1][2]。

## 二、代表论文
代表论文显示，科学代理系统提供检索与合成能力，证据包方法增强引用审计，而知识图谱信号补充热点演化解释[1][2][3]。

## 三、年度趋势
年度趋势从 2022 年的本地优先工作站讨论，逐步转向 2024 年的热点演化建模、2025 年的证据包审计和 2026 年的检索增强科学代理[1][2][3][4]。

## 四、来源分布
来源分布覆盖 arXiv、OpenAlex、CNKI 和 Local 数据，说明该热点既包含国际预印本，也包含本地知识沉淀视角[1][2][3][4]。

## 五、关键词网络
关键词网络围绕 retrieval、evidence、citation、scientific agents 与 hotspot evolution 展开，体现从检索到引用审计再到语义演化的链条[1][2][3]。

## 六、未来方向
未来方向应聚焦可解释证据链、代表论文筛选、年度演化可视化和本地隐私保护，以支持真实科研综述和课程展示场景[1][2][4]。
`.trim();

const normalized = references.normalizeReportOutput(rawReport, "Retrieval Augmented Scientific Review", papers, evidenceProfile);
const metrics = references.evaluateReportQuality(normalized, papers);
const audit = references.auditReport(normalized, papers);
const report = {
  id: "report-offline-check",
  projectId: "default",
  topic: "Retrieval Augmented Scientific Review",
  mode: "deep",
  discipline: "Artificial Intelligence",
  content: normalized,
  paperIds: papers.map((paper) => paper.id),
  metrics,
  evidenceProfile,
  createdAt: now,
  updatedAt: now,
};
const html = references.reportToHtml(report, papers);

const checks = [
  ["paper count", evidenceProfile.paperCount === 4],
  ["year range", evidenceProfile.yearRange === "2022-2026"],
  ["representative evidence", evidenceProfile.representativePaperIds.length >= 3 && evidenceProfile.representativePaperIds.includes("paper-1")],
  ["evidence overview injected", normalized.includes("## 证据概览")],
  ["reference section", normalized.includes("## 参考文献")],
  ["no invalid citations", audit.invalidCitationCount === 0],
  ["required sections", audit.missingRequiredSections.length === 0],
  ["evidence profile audit", audit.evidenceProfilePresent === true],
  ["citation accuracy", metrics.citationAccuracy === 1],
  ["citation coverage", metrics.citationCoverage >= 0.75],
  ["html charset", html.includes('<meta charset="utf-8">')],
  ["html references", html.includes("<h2>参考文献</h2>")],
];

const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
const result = {
  passed: failed.length === 0,
  failed,
  metrics,
  audit,
  evidenceProfile,
  outputFiles: {
    json: "outputs/v20_report_layer_check.json",
    html: "outputs/v20_report_layer_check.html",
  },
};

await writeFile(path.join(outputDir, "v20_report_layer_check.html"), html, "utf8");
await writeFile(path.join(outputDir, "v20_report_layer_check.json"), JSON.stringify(result, null, 2), "utf8");

if (failed.length > 0) {
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
}

console.log(`Report layer check passed: coverage=${metrics.citationCoverage}, accuracy=${metrics.citationAccuracy}, risk=${audit.riskLevel}`);
