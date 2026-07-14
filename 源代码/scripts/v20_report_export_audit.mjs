import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const outputDir = path.join(root, "outputs");

const SECTION_GROUPS = [
  sectionGroup("hotspotOverview", [/Hotspot Overview/i, /Research Hotspot/i, /\u70ed\u70b9\u6982\u8ff0/, /姒傝/]),
  sectionGroup("representativePapers", [/Representative Papers/i, /\u4ee3\u8868\u8bba\u6587/, /representative/i, /浠ｈ/]),
  sectionGroup("yearTrend", [/Year(?:ly)? Trend/i, /Year Evolution/i, /\u5e74\u5ea6\u8d8b\u52bf/, /骞村害/]),
  sectionGroup("sourceDistribution", [/Source Distribution/i, /\u6765\u6e90\u5206\u5e03/, /source distribution/i, /鏉ユ簮/]),
  sectionGroup("keywordNetwork", [/Keyword Network/i, /\u5173\u952e\u8bcd\u7f51\u7edc/, /keyword/i, /鍏抽敭/]),
  sectionGroup("futureDirections", [/Future Directions/i, /\u672a\u6765\u65b9\u5411/, /\u7814\u7a76\u65b9\u5411/, /鏈/]),
];

const args = process.argv.slice(2);
if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
  printHelp();
  process.exit(args.length === 0 ? 1 : 0);
}

const reportPath = path.resolve(args[0]);
const outputPath = path.resolve(readOption("--output") || path.join(outputDir, "v20_report_export_audit.json"));
const minCitations = parsePositiveInt(readOption("--min-citations"), "--min-citations", 3);
const minReferences = parsePositiveInt(readOption("--min-references"), "--min-references", 3);
const minChars = parsePositiveInt(readOption("--min-chars"), "--min-chars", 1200);
const minCitationCoverage = parseRatio(readOption("--min-citation-coverage"), "--min-citation-coverage", 0);
const requireEvidence = args.includes("--require-evidence");
const requireSections = args.includes("--require-sections");
const requireReferences = args.includes("--require-references");

await mkdir(path.dirname(outputPath), { recursive: true });

const fileInfo = await stat(reportPath);
if (!fileInfo.isFile()) throw new Error(`Report path is not a file: ${reportPath}`);

const raw = await readFile(reportPath, "utf8");
const extension = path.extname(reportPath).toLowerCase().replace(/^\./, "");
const normalized = extension === "html" || looksLikeHtml(raw) ? htmlToText(raw) : raw;
const compactText = normalized.replace(/\s+/g, " ").trim();
const citationText = stripReferenceSection(normalized);
const citationIndices = extractCitationIndices(citationText);
const uniqueCitationIndices = Array.from(new Set(citationIndices)).sort((a, b) => a - b);
const markdownReferences = extractMarkdownReferences(normalized);
const htmlReferenceCount = extractHtmlReferenceCount(raw);
const referenceCount = Math.max(markdownReferences.length, htmlReferenceCount);
const invalidCitationCount = referenceCount > 0 ? uniqueCitationIndices.filter((index) => index < 1 || index > referenceCount).length : 0;
const validCitationIndices = uniqueCitationIndices.filter((index) => index >= 1 && index <= referenceCount);
const missingReferenceCitationIndices = referenceCount > 0
  ? Array.from({ length: referenceCount }, (_, index) => index + 1).filter((index) => !validCitationIndices.includes(index))
  : [];
const citationCoverage = referenceCount > 0 ? validCitationIndices.length / referenceCount : 0;
const requiredSectionStatus = SECTION_GROUPS.map((group) => ({
  section: group.name,
  present: group.patterns.some((pattern) => pattern.test(normalized)),
}));
const missingRequiredSections = requiredSectionStatus.filter((item) => !item.present).map((item) => item.section);
const evidenceProfilePresent = /Evidence Overview|Evidence Profile|\u8bc1\u636e\u6982\u89c8|璇佹嵁/i.test(normalized);
const referenceSectionPresent = /References|Reference List|\u53c2\u8003\u6587\u732e|鍙傝/i.test(normalized) || referenceCount > 0;
const futureDirectionPresent = SECTION_GROUPS.find((group) => group.name === "futureDirections").patterns.some((pattern) => pattern.test(normalized));
const sourceDistributionPresent = SECTION_GROUPS.find((group) => group.name === "sourceDistribution").patterns.some((pattern) => pattern.test(normalized));
const yearTrendPresent = SECTION_GROUPS.find((group) => group.name === "yearTrend").patterns.some((pattern) => pattern.test(normalized));
const keywordNetworkPresent = SECTION_GROUPS.find((group) => group.name === "keywordNetwork").patterns.some((pattern) => pattern.test(normalized));
const representativePaperPresent = SECTION_GROUPS.find((group) => group.name === "representativePapers").patterns.some((pattern) => pattern.test(normalized));

const checks = buildChecks({
  charCount: compactText.length,
  minChars,
  citationCount: uniqueCitationIndices.length,
  minCitations,
  referenceCount,
  minReferences,
  invalidCitationCount,
  missingReferenceCitationIndices,
  citationCoverage,
  evidenceProfilePresent,
  referenceSectionPresent,
  missingRequiredSections,
  requireEvidence,
  requireSections,
  requireReferences,
  minCitationCoverage,
});

const riskLevel =
  checks.failures.length > 0 || invalidCitationCount > 0 || compactText.length < minChars
    ? "high"
    : missingRequiredSections.length > 0 || uniqueCitationIndices.length < minCitations + 2
      ? "medium"
      : "low";

const result = {
  generatedAt: new Date().toISOString(),
  reportPath,
  fileName: path.basename(reportPath),
  extension,
  sizeBytes: fileInfo.size,
  charCount: compactText.length,
  citationIndices: uniqueCitationIndices,
  citationCount: uniqueCitationIndices.length,
  referenceCount,
  invalidCitationCount,
  citationCoverage,
  missingReferenceCitationIndices,
  evidenceProfilePresent,
  referenceSectionPresent,
  requiredSectionStatus,
  missingRequiredSections,
  semanticSignals: {
    futureDirectionPresent,
    sourceDistributionPresent,
    yearTrendPresent,
    keywordNetworkPresent,
    representativePaperPresent,
  },
  strictGate: checks,
  riskLevel,
};

await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

console.log(
  `Report export audit completed: citations=${result.citationCount}, references=${result.referenceCount}, risk=${result.riskLevel}, gate=${result.strictGate.passed}`,
);
console.log(`Report: ${outputPath}`);
if (checks.enabled && !checks.passed) {
  console.error("Strict gate failed:");
  for (const failure of checks.failures) console.error(`- ${failure}`);
  process.exit(1);
}

function sectionGroup(name, patterns) {
  return { name, patterns };
}

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

function parseRatio(value, name, fallback) {
  if (value === undefined) return fallback;
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) throw new Error(`${name} must be between 0 and 1.`);
  return parsed;
}

function printHelp() {
  console.log(`
Usage:
  node scripts/v20_report_export_audit.mjs <report.md|report.html> [--output outputs/report_audit.json]

Strict options:
  --require-evidence
  --require-sections
  --require-references
  --min-citations 3
  --min-references 3
  --min-chars 1200
  --min-citation-coverage 1

This script is read-only. It checks an exported report for evidence structure, citations, references, and required research-report sections.
`.trim());
}

function looksLikeHtml(value) {
  return /<!doctype html|<html[\s>]|<body[\s>]/i.test(value);
}

function htmlToText(value) {
  return decodeHtmlEntities(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<\/(h1|h2|h3|p|li|div|section|nav|main|br)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\n{3,}/g, "\n\n"),
  );
}

function decodeHtmlEntities(value) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractCitationIndices(value) {
  return [...value.matchAll(/\[(\d+)\]/g)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isInteger(value));
}

function stripReferenceSection(value) {
  const referenceStart = value.search(/(^|\n)#{1,3}\s*(References|Reference List|\u53c2\u8003\u6587\u732e)\b|(^|\n)\s*(References|Reference List|\u53c2\u8003\u6587\u732e)\s*(\n|$)/i);
  return referenceStart >= 0 ? value.slice(0, referenceStart) : value;
}

function extractMarkdownReferences(value) {
  const referenceStart = value.search(/(^|\n)#{1,3}\s*(References|Reference List|\u53c2\u8003\u6587\u732e)\b/i);
  const text = referenceStart >= 0 ? value.slice(referenceStart) : value;
  return [...text.matchAll(/(?:^|\n)\s*\[(\d+)\]\s+\S/g)].map((match) => Number(match[1]));
}

function extractHtmlReferenceCount(value) {
  const refsMatch = value.match(/<ol[^>]*class=["'][^"']*refs[^"']*["'][^>]*>([\s\S]*?)<\/ol>/i);
  if (!refsMatch) return 0;
  return (refsMatch[1].match(/<li\b/gi) ?? []).length;
}

function buildChecks(input) {
  const checks = [
    {
      name: "minChars",
      expected: String(input.minChars),
      actual: String(input.charCount),
      passed: input.charCount >= input.minChars,
    },
    {
      name: "minCitations",
      expected: String(input.minCitations),
      actual: String(input.citationCount),
      passed: input.citationCount >= input.minCitations,
    },
  ];

  if (input.requireReferences) {
    checks.push(
      {
        name: "referenceSection",
        expected: "present",
        actual: input.referenceSectionPresent ? "present" : "missing",
        passed: input.referenceSectionPresent,
      },
      {
        name: "minReferences",
        expected: String(input.minReferences),
        actual: String(input.referenceCount),
        passed: input.referenceCount >= input.minReferences,
      },
      {
        name: "validCitationRange",
        expected: "0 invalid citations",
        actual: `${input.invalidCitationCount} invalid citations`,
        passed: input.invalidCitationCount === 0,
      },
    );
  }

  if (input.minCitationCoverage > 0) {
    checks.push({
      name: "citationCoverage",
      expected: String(input.minCitationCoverage),
      actual: input.citationCoverage.toFixed(3),
      passed: input.citationCoverage >= input.minCitationCoverage,
    });
  }

  if (input.requireEvidence) {
    checks.push({
      name: "evidenceProfile",
      expected: "present",
      actual: input.evidenceProfilePresent ? "present" : "missing",
      passed: input.evidenceProfilePresent,
    });
  }

  if (input.requireSections) {
    checks.push({
      name: "requiredSections",
      expected: "all required sections present",
      actual: input.missingRequiredSections.length === 0 ? "all present" : input.missingRequiredSections.join(", "),
      passed: input.missingRequiredSections.length === 0,
    });
  }

  const failures = checks
    .filter((check) => !check.passed)
    .map((check) => `${check.name} expected ${check.expected}, actual ${check.actual}.`);

  return {
    enabled: checks.length > 0,
    passed: failures.length === 0,
    checks,
    failures,
  };
}
