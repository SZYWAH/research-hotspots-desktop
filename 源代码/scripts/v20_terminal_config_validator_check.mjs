import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateTerminalAcceptanceConfig } from "./v20_terminal_config_validate.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const outputDir = path.join(root, "outputs");
const tempDir = path.join(root, "work", "terminal-config-validator-check");

await mkdir(outputDir, { recursive: true });
await rm(tempDir, { recursive: true, force: true });
await mkdir(tempDir, { recursive: true });

const paths = {
  library: path.join(tempDir, "library.jsonl"),
  database: path.join(tempDir, "database"),
  databaseFile: path.join(tempDir, "database", "research-hotspots-v7.sqlite"),
  uiSmoke: path.join(tempDir, "ui-smoke.json"),
  aiLiveSmoke: path.join(tempDir, "ai-live-smoke.json"),
  aiDryRunSmoke: path.join(tempDir, "ai-dry-run-smoke.json"),
  aiFailedReportSmoke: path.join(tempDir, "ai-failed-report-smoke.json"),
  failedUiSmoke: path.join(tempDir, "ui-smoke-failed.json"),
  starMapClean: path.join(tempDir, "star-map-clean.json"),
  starMapSample: path.join(tempDir, "star-map-sample.json"),
  hotspotEvidenceClean: path.join(tempDir, "hotspot-evidence-clean.json"),
  hotspotEvidenceDifferentDb: path.join(tempDir, "hotspot-evidence-different-db.json"),
  hotspotEvidenceUnknownHotspot: path.join(tempDir, "hotspot-evidence-unknown-hotspot.json"),
  hotspotEvidenceMissingIds: path.join(tempDir, "hotspot-evidence-missing-ids.json"),
};

try {
  await writeFixtureFiles();

  const baseConfig = {
    libraryPath: paths.library,
    databaseDir: paths.database,
    importBeforeAudit: true,
    minValidRows: 100000,
    minImportedRows: 100000,
    minClusters: 10,
    exportStarMap: true,
    minStarMapHotspots: 10,
    minStarMapEvidenceIds: 10,
    minStarMapLinks: 1,
    minStarMapEvidenceCoverage: 0.8,
    minStarMapEvolutionCoverage: 0.8,
    minStarMapSourceDistributionCoverage: 0.8,
    rejectSampleStarMapSignals: true,
    exportHotspotEvidence: true,
    minHotspotRepresentativePapers: 3,
    generateHotspotReport: true,
    minHotspotReportPapers: 3,
    minReportCitations: 3,
    minReportReferences: 3,
    minReportChars: 1200,
    uiSmokePath: paths.uiSmoke,
    aiLiveSmokePath: paths.aiLiveSmoke,
    requireLiveAi: true,
    requireTerminalReady: true,
    runPressureTest: true,
    runTauriBuild: true,
    launchExe: true,
  };

  const cases = [
    {
      name: "valid terminal inputs pass semantic evidence checks",
      config: baseConfig,
      expectPassed: true,
      expectedErrors: [],
    },
    {
      name: "dry-run AI smoke is rejected when live AI is required",
      config: { ...baseConfig, aiLiveSmokePath: paths.aiDryRunSmoke },
      expectPassed: false,
      expectedErrors: ["network-enabled", "network.called=true", "reportAudit.passed=true"],
    },
    {
      name: "live AI smoke with failed report audit is rejected",
      config: { ...baseConfig, aiLiveSmokePath: paths.aiFailedReportSmoke },
      expectPassed: false,
      expectedErrors: ["reportAudit.passed=true"],
    },
    {
      name: "failed UI smoke is rejected",
      config: { ...baseConfig, uiSmokePath: paths.failedUiSmoke },
      expectPassed: false,
      expectedErrors: ["gate.passed=true", "consoleIssues"],
    },
    {
      name: "sample-tainted supplied star map is rejected",
      config: { ...baseConfig, exportStarMap: false, starMapPath: paths.starMapSample },
      expectPassed: false,
      expectedErrors: ["sample-like"],
    },
    {
      name: "clean supplied star map can replace exportStarMap",
      config: { ...baseConfig, exportStarMap: false, starMapPath: paths.starMapClean },
      expectPassed: true,
      expectedErrors: [],
    },
    {
      name: "clean supplied star map and hotspot evidence pass chain checks",
      config: { ...baseConfig, exportStarMap: false, starMapPath: paths.starMapClean, exportHotspotEvidence: false, hotspotEvidencePath: paths.hotspotEvidenceClean },
      expectPassed: true,
      expectedErrors: [],
    },
    {
      name: "hotspot evidence with missing representative ids is rejected",
      config: { ...baseConfig, exportHotspotEvidence: false, hotspotEvidencePath: paths.hotspotEvidenceMissingIds },
      expectPassed: false,
      expectedErrors: ["missing representative paper ids"],
    },
    {
      name: "mismatched supplied star map and hotspot evidence databases are rejected",
      config: { ...baseConfig, exportStarMap: false, starMapPath: paths.starMapClean, exportHotspotEvidence: false, hotspotEvidencePath: paths.hotspotEvidenceDifferentDb },
      expectPassed: false,
      expectedErrors: ["configured database target", "same databasePath"],
    },
    {
      name: "hotspot evidence selectedHotspotId missing from supplied star map is rejected",
      config: { ...baseConfig, exportStarMap: false, starMapPath: paths.starMapClean, exportHotspotEvidence: false, hotspotEvidencePath: paths.hotspotEvidenceUnknownHotspot },
      expectPassed: false,
      expectedErrors: ["selectedHotspotId must exist"],
    },
    {
      name: "clean supplied hotspot evidence can replace exportHotspotEvidence",
      config: { ...baseConfig, exportHotspotEvidence: false, hotspotEvidencePath: paths.hotspotEvidenceClean },
      expectPassed: true,
      expectedErrors: [],
    },
  ];

  const results = cases.map((testCase) => {
    const validation = validateTerminalAcceptanceConfig(testCase.config, {
      strictTerminal: true,
      checkExistingInputs: true,
    });
    const expectedErrorsPresent = testCase.expectedErrors.every((fragment) =>
      validation.errors.some((error) => error.includes(fragment)),
    );
    const passed =
      validation.passed === testCase.expectPassed &&
      (testCase.expectPassed ? validation.errors.length === 0 : expectedErrorsPresent);
    return {
      name: testCase.name,
      passed,
      expectedPassed: testCase.expectPassed,
      actualPassed: validation.passed,
      expectedErrors: testCase.expectedErrors,
      actualErrors: validation.errors,
    };
  });

  const failed = results.filter((item) => !item.passed);
  const summaryPath = path.join(outputDir, "v20_terminal_config_validator_check.json");
  await writeFile(
    summaryPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        passed: failed.length === 0,
        failed: failed.map((item) => item.name),
        caseCount: results.length,
        results,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  if (failed.length > 0) {
    console.error(`Terminal config validator check failed: ${failed.map((item) => item.name).join(", ")}`);
    process.exit(1);
  }

  console.log(`Terminal config validator check passed: cases=${results.length}`);
  console.log(`Summary: ${summaryPath}`);
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

async function writeFixtureFiles() {
  await mkdir(paths.database, { recursive: true });
  await writeFile(paths.library, '{"id":"paper-1","title":"Realistic paper row"}\n', "utf8");
  await writeJson(paths.uiSmoke, {
    gate: {
      passed: true,
      checks: {
        defaultCanvas: true,
        galaxyMapCanvas: true,
        fullscreenCanvas: true,
        fullscreenState: true,
        consoleClean: true,
        screenshotsNonBlank: true,
        lowOverexposure: true,
      },
    },
    consoleIssues: [],
  });
  await writeJson(paths.failedUiSmoke, {
    gate: {
      passed: false,
      checks: {
        defaultCanvas: true,
        galaxyMapCanvas: true,
        fullscreenCanvas: true,
        fullscreenState: true,
        consoleClean: false,
        screenshotsNonBlank: true,
        lowOverexposure: true,
      },
    },
    consoleIssues: [{ type: "error", text: "synthetic console failure" }],
  });
  await writeJson(paths.aiLiveSmoke, {
    mode: "network-enabled",
    readyForLiveAi: true,
    network: { called: true },
    strictGate: { passed: true },
    reportAudit: { passed: true },
  });
  await writeJson(paths.aiDryRunSmoke, {
    mode: "dry-run",
    readyForLiveAi: true,
    network: { called: false, reason: "missing --allow-network" },
    strictGate: { passed: true },
    reportAudit: null,
  });
  await writeJson(paths.aiFailedReportSmoke, {
    mode: "network-enabled",
    readyForLiveAi: true,
    network: { called: true },
    strictGate: { passed: false },
    reportAudit: { passed: false },
  });
  await writeJson(paths.starMapClean, {
    databasePath: paths.databaseFile,
    projectId: "project-default",
    strictGate: { passed: true },
    evidenceProfile: { sampleSignalCount: 0 },
    hotspots: [
      {
        id: "hotspot-1",
        representativeIds: ["paper-1", "paper-2", "paper-3"],
      },
    ],
  });
  await writeJson(paths.starMapSample, {
    databasePath: paths.databaseFile,
    projectId: "project-default",
    strictGate: { passed: true },
    evidenceProfile: { sampleSignalCount: 2 },
    hotspots: [],
  });
  await writeJson(paths.hotspotEvidenceClean, {
    databasePath: paths.databaseFile,
    projectId: "project-default",
    selectedHotspotId: "hotspot-1",
    strictGate: { passed: true },
    representativeIds: ["paper-1", "paper-2", "paper-3"],
    missingRepresentativeIds: [],
  });
  await writeJson(paths.hotspotEvidenceDifferentDb, {
    databasePath: path.join(tempDir, "other-database", "research-hotspots-v7.sqlite"),
    projectId: "project-default",
    selectedHotspotId: "hotspot-1",
    strictGate: { passed: true },
    representativeIds: ["paper-1", "paper-2", "paper-3"],
    missingRepresentativeIds: [],
  });
  await writeJson(paths.hotspotEvidenceUnknownHotspot, {
    databasePath: paths.databaseFile,
    projectId: "project-default",
    selectedHotspotId: "hotspot-missing",
    strictGate: { passed: true },
    representativeIds: ["paper-1", "paper-2", "paper-3"],
    missingRepresentativeIds: [],
  });
  await writeJson(paths.hotspotEvidenceMissingIds, {
    databasePath: paths.databaseFile,
    projectId: "project-default",
    selectedHotspotId: "hotspot-1",
    strictGate: { passed: true },
    representativeIds: ["paper-1", "paper-2", "paper-3"],
    missingRepresentativeIds: ["paper-missing"],
  });
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
