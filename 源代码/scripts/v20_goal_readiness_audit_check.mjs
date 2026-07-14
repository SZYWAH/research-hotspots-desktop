import { spawnSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const outputDir = path.join(root, "outputs");
const finalSummaryPath = path.join(outputDir, "v20_final_acceptance_gate_summary.json");
const auditJsonPath = path.join(outputDir, "v20_goal_readiness_audit.json");
const auditMarkdownPath = path.join(outputDir, "V20_GOAL_READINESS_AUDIT.md");
const checkSummaryPath = path.join(outputDir, "v20_goal_readiness_audit_check.json");

await mkdir(outputDir, { recursive: true });
const snapshot = await snapshotFiles([finalSummaryPath, auditJsonPath, auditMarkdownPath]);

let results = [];
try {
  await writeForgedFinalSummary();
  const run = spawnSync(process.execPath, ["scripts/v20_goal_readiness_audit.mjs"], {
    cwd: root,
    encoding: "utf8",
    shell: false,
  });
  const audit = await readJson(auditJsonPath);
  const checks = new Map((audit.checks ?? []).map((item) => [item.name, item]));

  results = [
    {
      name: "forged all-true finalReadiness does not complete the terminal goal",
      passed: run.status === 0 && audit.overallComplete === false,
      detail: `status=${run.status}, overallComplete=${audit.overallComplete}`,
    },
    {
      name: "forged all-true finalReadiness still leaves real source gate missing",
      passed: checks.get("Real 100k source-file gate")?.status === "missing",
      detail: checks.get("Real 100k source-file gate")?.detail ?? "missing check row",
    },
    {
      name: "forged all-true finalReadiness still leaves live AI gate missing without live smoke evidence",
      passed: checks.get("AI live configuration")?.status === "missing",
      detail: checks.get("AI live configuration")?.detail ?? "missing check row",
    },
  ];
} finally {
  await restoreFiles(snapshot);
}

const failed = results.filter((item) => !item.passed);
await writeFile(
  checkSummaryPath,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      passed: failed.length === 0,
      caseCount: results.length,
      failed: failed.map((item) => item.name),
      results,
    },
    null,
    2,
  )}\n`,
  "utf8",
);

if (failed.length > 0) {
  console.error(`Goal readiness audit check failed: ${failed.map((item) => item.name).join(", ")}`);
  process.exit(1);
}

console.log(`Goal readiness audit check passed: cases=${results.length}`);
console.log(`Summary: ${checkSummaryPath}`);

async function writeForgedFinalSummary() {
  await writeFile(
    finalSummaryPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        libraryPath: path.join(root, "data", "samples", "papers_sample.jsonl"),
        baselineSkipped: true,
        minValidRows: 4,
        realLibraryGatePassed: true,
        validRows: 4,
        invalidRows: 0,
        duplicateRows: 0,
        sourceLooksSample: true,
        sourceManifestRan: true,
        sourceManifestPath: "outputs/v20_source_manifest_final.json",
        sourceManifestSha256: null,
        sourceManifestSampleLike: true,
        sourceManifestTerminalCandidate: false,
        liveAiRequired: true,
        terminalReadyRequired: true,
        readyForLiveAi: true,
        aiLiveSmokeRan: true,
        aiLiveSmokePassed: true,
        aiLiveSmokeNetworkCalled: true,
        aiLiveSmokeReportAuditPassed: true,
        headlessImportRan: true,
        headlessImportProcessedRows: 100000,
        sqliteAuditRan: true,
        sqliteAuditPassed: true,
        importedPaperCount: 100000,
        importedVisibleHotspots: 20,
        starMapExportRan: true,
        starMapExportPassed: true,
        starMapHotspotCount: 20,
        starMapEvidenceIdCount: 100000,
        starMapSemanticLinkCount: 60,
        starMapEvidenceCoverage: 1,
        starMapEvolutionCoverage: 1,
        starMapSourceDistributionCoverage: 1,
        starMapSampleSignalCount: 0,
        rejectSampleStarMapSignals: true,
        hotspotEvidenceRan: true,
        hotspotEvidencePassed: true,
        hotspotRepresentativePaperCount: 3,
        hotspotMissingRepresentativeIds: 0,
        reportAuditRan: true,
        reportAuditPassed: true,
        reportCitationCount: 3,
        reportReferenceCount: 3,
        uiSmokeRan: true,
        uiSmokePassed: true,
        uiConsoleIssueCount: 0,
        finalReadiness: {
          terminalGoalReady: true,
          realDataSourceReady: true,
          realImportedSqliteReady: true,
          realStarMapReady: true,
          hotspotEvidenceReady: true,
          realReportReady: true,
          uiSmokeReady: true,
          liveAiReady: true,
          sourceLooksSample: false,
          sourceManifestReady: true,
          starMapCoverageReady: true,
          starMapSampleClean: true,
          rejectSampleStarMapSignals: true,
          warnings: [],
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

async function readJson(filePath) {
  return JSON.parse((await readFile(filePath, "utf8")).replace(/^\uFEFF/, ""));
}

async function snapshotFiles(filePaths) {
  const entries = [];
  for (const filePath of filePaths) {
    try {
      entries.push({ filePath, content: await readFile(filePath) });
    } catch {
      entries.push({ filePath, content: null });
    }
  }
  return entries;
}

async function restoreFiles(entries) {
  for (const entry of entries) {
    if (entry.content === null) {
      await rm(entry.filePath, { force: true });
    } else {
      await writeFile(entry.filePath, entry.content);
    }
  }
}
