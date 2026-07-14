import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const outputDir = path.join(root, "outputs");
const summaryPath = path.join(outputDir, "v20_final_acceptance_gate_summary.json");
const sqliteAuditPath = path.join(outputDir, "v20_sqlite_library_audit_final.json");
const starMapPath = path.join(outputDir, "v20_star_map_export_final.json");
const hotspotEvidencePath = path.join(outputDir, "v20_hotspot_evidence_final.json");
const reportAuditPath = path.join(outputDir, "v20_report_export_audit_final.json");
const checkPath = path.join(outputDir, "v20_evidence_chain_check.json");

const artifacts = {
  summary: await readJsonIfExists(summaryPath),
  sqliteAudit: await readJsonIfExists(sqliteAuditPath),
  starMap: await readJsonIfExists(starMapPath),
  hotspotEvidence: await readJsonIfExists(hotspotEvidencePath),
  reportAudit: await readJsonIfExists(reportAuditPath),
};

const current = evaluateEvidenceChain(artifacts);
const mismatchDatabase = evaluateEvidenceChain({
  ...artifacts,
  starMap: { ...artifacts.starMap, databasePath: "D:\\other-library\\research-hotspots-v7.sqlite" },
});
const missingHotspot = evaluateEvidenceChain({
  ...artifacts,
  hotspotEvidence: { ...artifacts.hotspotEvidence, selectedHotspotId: "missing-hotspot-id" },
});
const reportMismatch = evaluateEvidenceChain({
  ...artifacts,
  reportAudit: { ...artifacts.reportAudit, reportPath: "D:\\other-library\\unrelated-report.md" },
});

const results = [
  {
    name: "current final artifacts share one SQLite and hotspot evidence chain",
    passed: current.passed,
    detail: current.failures.join("; ") || "consistent",
  },
  {
    name: "mismatched star-map database path is rejected",
    passed: !mismatchDatabase.passed && mismatchDatabase.failures.some((item) => item.includes("star-map database")),
    detail: mismatchDatabase.failures.join("; "),
  },
  {
    name: "hotspot evidence outside star-map export is rejected",
    passed: !missingHotspot.passed && missingHotspot.failures.some((item) => item.includes("selected hotspot")),
    detail: missingHotspot.failures.join("; "),
  },
  {
    name: "unrelated report audit path is rejected",
    passed: !reportMismatch.passed && reportMismatch.failures.some((item) => item.includes("report path")),
    detail: reportMismatch.failures.join("; "),
  },
];

const failed = results.filter((item) => !item.passed);
await writeFile(
  checkPath,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      passed: failed.length === 0,
      caseCount: results.length,
      failed: failed.map((item) => item.name),
      currentEvidence: current.evidence,
      results,
    },
    null,
    2,
  )}\n`,
  "utf8",
);

if (failed.length > 0) {
  console.error(`Evidence chain check failed: ${failed.map((item) => item.name).join(", ")}`);
  process.exit(1);
}

console.log(`Evidence chain check passed: cases=${results.length}`);
console.log(`Summary: ${checkPath}`);

function evaluateEvidenceChain(input) {
  const failures = [];
  const summary = input.summary ?? {};
  const sqliteAudit = input.sqliteAudit ?? {};
  const starMap = input.starMap ?? {};
  const hotspotEvidence = input.hotspotEvidence ?? {};
  const reportAudit = input.reportAudit ?? {};

  const sqliteDb = normalizePath(sqliteAudit.databasePath);
  const starMapDb = normalizePath(starMap.databasePath);
  const hotspotDb = normalizePath(hotspotEvidence.databasePath);
  const sqliteProject = normalizeText(sqliteAudit.projectId);
  const starMapProject = normalizeText(starMap.projectId);
  const hotspotProject = normalizeText(hotspotEvidence.projectId);

  if (!sqliteDb) failures.push("SQLite audit database path is missing.");
  if (!starMapDb) failures.push("Star-map database path is missing.");
  if (!hotspotDb) failures.push("Hotspot evidence database path is missing.");
  if (sqliteDb && starMapDb && sqliteDb !== starMapDb) failures.push("star-map database path does not match SQLite audit database path.");
  if (sqliteDb && hotspotDb && sqliteDb !== hotspotDb) failures.push("hotspot evidence database path does not match SQLite audit database path.");
  if (sqliteProject && starMapProject && sqliteProject !== starMapProject) failures.push("star-map projectId does not match SQLite audit projectId.");
  if (sqliteProject && hotspotProject && sqliteProject !== hotspotProject) failures.push("hotspot evidence projectId does not match SQLite audit projectId.");

  const starHotspots = Array.isArray(starMap.hotspots) ? starMap.hotspots : [];
  const selectedHotspotId = normalizeText(hotspotEvidence.selectedHotspotId);
  const selectedStarHotspot = starHotspots.find((item) => normalizeText(item?.id) === selectedHotspotId);
  if (!selectedHotspotId) {
    failures.push("Hotspot evidence selectedHotspotId is missing.");
  } else if (!selectedStarHotspot) {
    failures.push("selected hotspot is not present in star-map export.");
  }

  const hotspotRepresentativeIds = new Set((hotspotEvidence.representativeIds ?? []).map(normalizeText).filter(Boolean));
  const starRepresentativeIds = new Set((selectedStarHotspot?.representativeIds ?? selectedStarHotspot?.analysis?.evidencePaperIds ?? []).map(normalizeText).filter(Boolean));
  if (hotspotRepresentativeIds.size === 0) {
    failures.push("Hotspot evidence representativeIds are missing.");
  }
  for (const id of hotspotRepresentativeIds) {
    if (!starRepresentativeIds.has(id)) failures.push(`hotspot representative id is not present in selected star-map hotspot: ${id}`);
  }

  const expectedReportPath = normalizePath(summary.hotspotReportPath);
  const actualReportPath = normalizePath(reportAudit.reportPath);
  if (expectedReportPath && actualReportPath && expectedReportPath !== actualReportPath) {
    failures.push("report path does not match final-gate generated hotspot report path.");
  }
  if (summary.reportAuditRan === true && reportAudit.strictGate?.passed !== true) {
    failures.push("summary says report audit ran, but report audit strict gate is not passed.");
  }

  return {
    passed: failures.length === 0,
    failures,
    evidence: {
      sqliteDatabasePath: sqliteAudit.databasePath ?? null,
      starMapDatabasePath: starMap.databasePath ?? null,
      hotspotEvidenceDatabasePath: hotspotEvidence.databasePath ?? null,
      projectId: sqliteAudit.projectId ?? starMap.projectId ?? hotspotEvidence.projectId ?? null,
      selectedHotspotId: hotspotEvidence.selectedHotspotId ?? null,
      representativeIds: [...hotspotRepresentativeIds],
      reportPath: reportAudit.reportPath ?? null,
    },
  };
}

function normalizePath(value) {
  if (typeof value !== "string" || value.trim() === "") return "";
  let normalized = value.trim().replace(/^\\\\\?\\/, "").replace(/\//g, "\\");
  normalized = path.win32.normalize(normalized);
  return normalized.toLowerCase();
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse((await readFile(filePath, "utf8")).replace(/^\uFEFF/, ""));
  } catch {
    return null;
  }
}
