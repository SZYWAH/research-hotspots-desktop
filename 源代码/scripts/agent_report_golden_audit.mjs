import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  auditReport,
  evaluateReportQuality,
  normalizeReportOutput,
} from "../src/lib/references.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = JSON.parse(
  fs.readFileSync(path.join(root, "scripts/fixtures/agent-report-golden.json"), "utf8"),
);

const papers = fixture.papers.map((paper) => ({
  ...paper,
  abstract: "",
  createdAt: "golden",
  updatedAt: "golden",
}));

function counts(values) {
  const result = new Map();
  for (const value of values) result.set(value, (result.get(value) ?? 0) + 1);
  return [...result].map(([value, count]) => ({ value, count }));
}

function profileFor(selected) {
  const years = selected.map((paper) => paper.year).filter(Number.isFinite);
  return {
    paperCount: selected.length,
    yearRange: `${Math.min(...years)}-${Math.max(...years)}`,
    sourceCounts: counts(selected.map((paper) => paper.source)),
    fieldCounts: counts(selected.map((paper) => paper.field)),
    keywordHighlights: fixture.keywords,
    representativePaperIds: selected.map((paper) => paper.id),
  };
}

const normalizationPapers = papers.slice(0, fixture.normalization.paperCount);
const normalized = normalizeReportOutput(
  fixture.normalization.rawContent,
  fixture.topic,
  normalizationPapers,
  profileFor(normalizationPapers),
);
assert.equal(normalized, fixture.normalization.expectedNormalized);

for (const testCase of fixture.auditCases) {
  const selected = papers.slice(0, testCase.paperCount);
  const audit = auditReport(testCase.content, selected);
  const actual = {
    citedIndices: audit.citedIndices,
    invalidCitationCount: audit.invalidCitationCount,
    uncitedPaperCount: audit.uncitedPaperCount,
    missingRequiredSections: audit.missingRequiredSections,
    evidenceProfilePresent: audit.evidenceProfilePresent,
    riskLevel: audit.riskLevel,
    metrics: evaluateReportQuality(testCase.content, selected),
  };
  assert.deepEqual(actual, testCase.expected, `golden mismatch: ${testCase.name}`);
}

console.log(JSON.stringify({
  ok: true,
  fixtureSchemaVersion: fixture.schemaVersion,
  normalizationMatched: true,
  auditCases: fixture.auditCases.map((testCase) => testCase.name),
}));
