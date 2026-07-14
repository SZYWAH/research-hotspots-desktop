import { spawnSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const outputDir = path.join(root, "outputs");
const tempDir = path.join(root, "work", "final-gate-direct-evidence-check");
const gateScript = path.join(root, "scripts", "v20_final_acceptance_gate.ps1");
const sampleLibrary = path.join(root, "data", "samples", "papers_sample.jsonl");
const finalGateSummaryPath = path.join(outputDir, "v20_final_acceptance_gate_summary.json");
const finalSourceManifestPath = path.join(outputDir, "v20_source_manifest_final.json");
const finalSourceManifestMarkdownPath = path.join(outputDir, "V20_SOURCE_MANIFEST_FINAL.md");
const gateSideEffectFiles = [
  path.join(outputDir, "v20_final_acceptance_gate.log"),
  path.join(outputDir, "v20_real_library_preflight_user.json"),
  finalSourceManifestPath,
  finalSourceManifestMarkdownPath,
  path.join(outputDir, "v20_ai_config_preflight_final.json"),
  finalGateSummaryPath,
];

await mkdir(outputDir, { recursive: true });
const sideEffectSnapshot = await snapshotFiles(gateSideEffectFiles);
await rm(tempDir, { recursive: true, force: true });
await mkdir(tempDir, { recursive: true });

const paths = {
  starMapSample: path.join(tempDir, "star-map-sample.json"),
  hotspotMissingIds: path.join(tempDir, "hotspot-evidence-missing-ids.json"),
  starMapEvidenceChain: path.join(tempDir, "star-map-evidence-chain.json"),
  hotspotEvidenceDifferentDb: path.join(tempDir, "hotspot-evidence-different-db.json"),
  uiSmokeWeak: path.join(tempDir, "ui-smoke-weak.json"),
  aiFailedReportAudit: path.join(tempDir, "ai-live-failed-report-audit.json"),
  terminalSource: path.join(tempDir, "terminal-source.jsonl"),
};

try {
  await writeFixtureFiles();

  const cases = [
    {
      name: "final gate writes source manifest into readiness summary",
      libraryPath: paths.terminalSource,
      minValidRows: 2,
      args: [],
      expectedStatus: 0,
      validate: async () => {
        const manifest = await readJson(finalSourceManifestPath);
        const summary = await readJson(finalGateSummaryPath);
        const sha = manifest.source?.sha256;
        const failures = [
          manifest.passed === true ? null : "manifest did not pass",
          manifest.source?.terminalCandidate === true ? null : "manifest source is not a terminal candidate",
          typeof sha === "string" && sha.length === 64 ? null : "manifest SHA-256 is missing or malformed",
          summary.sourceManifestRan === true ? null : "summary did not record sourceManifestRan=true",
          summary.sourceManifestSha256 === sha ? null : "summary SHA-256 does not match manifest",
          summary.sourceManifestTerminalCandidate === true ? null : "summary did not record terminal candidate",
          summary.finalReadiness?.sourceManifestReady === true ? null : "finalReadiness.sourceManifestReady is not true",
          summary.outputs?.sourceManifest === "outputs/v20_source_manifest_final.json" ? null : "summary outputs.sourceManifest path is missing",
        ].filter(Boolean);
        return {
          passed: failures.length === 0,
          detail: failures.join("; "),
        };
      },
    },
    {
      name: "sample-tainted star map is rejected by final gate",
      args: ["-StarMapPath", paths.starMapSample, "-RejectSampleStarMapSignals"],
      expectedStatus: 1,
      expectedStderr: "sample-like signals",
    },
    {
      name: "hotspot evidence with missing representative ids is rejected by final gate",
      args: ["-HotspotEvidencePath", paths.hotspotMissingIds, "-MinHotspotRepresentativePapers", "3"],
      expectedStatus: 1,
      expectedStderr: "missing representative paper ids",
    },
    {
      name: "mismatched star-map and hotspot evidence databases are rejected by final gate",
      args: [
        "-StarMapPath",
        paths.starMapEvidenceChain,
        "-HotspotEvidencePath",
        paths.hotspotEvidenceDifferentDb,
        "-MinHotspotRepresentativePapers",
        "3",
      ],
      expectedStatus: 1,
      expectedStderr: "evidence chain consistency",
    },
    {
      name: "weak UI smoke is rejected by final gate",
      args: ["-UiSmokePath", paths.uiSmokeWeak],
      expectedStatus: 1,
      expectedStderr: "gate.checks.lowOverexposure",
    },
    {
      name: "live AI smoke with failed report audit is rejected by final gate",
      args: ["-AiLiveSmokePath", paths.aiFailedReportAudit],
      expectedStatus: 1,
      expectedStderr: "report audit must pass",
    },
  ];

  const results = [];
  for (const testCase of cases) {
    const result = runGate(testCase.args, {
      libraryPath: testCase.libraryPath,
      minValidRows: testCase.minValidRows,
    });
    const combinedOutput = `${result.stdout}\n${result.stderr}`;
    const basePassed =
      result.status === testCase.expectedStatus &&
      (!testCase.expectedStderr || combinedOutput.toLowerCase().includes(testCase.expectedStderr.toLowerCase()));
    const validation = testCase.validate ? await testCase.validate(result) : { passed: true, detail: null };
    results.push({
      name: testCase.name,
      passed: basePassed && validation.passed,
      expectedStatus: testCase.expectedStatus,
      actualStatus: result.status,
      expectedMessage: testCase.expectedStderr ?? null,
      validationDetail: validation.detail ?? null,
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
    });
  }

  const failed = results.filter((item) => !item.passed);
  const summaryPath = path.join(outputDir, "v20_final_gate_direct_evidence_check.json");
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
    console.error(`Final gate direct evidence check failed: ${failed.map((item) => item.name).join(", ")}`);
    process.exit(1);
  }

  console.log(`Final gate direct evidence check passed: cases=${results.length}`);
  console.log(`Summary: ${summaryPath}`);
} finally {
  await restoreFiles(sideEffectSnapshot);
  await rm(tempDir, { recursive: true, force: true });
}

function runGate(extraArgs, options = {}) {
  const powershell = process.platform === "win32" ? "powershell.exe" : "pwsh";
  const libraryPath = options.libraryPath ?? sampleLibrary;
  const minValidRows = options.minValidRows ?? 1;
  return spawnSync(
    powershell,
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      gateScript,
      "-LibraryPath",
      libraryPath,
      "-MinValidRows",
      String(minValidRows),
      "-SkipBaseline",
      ...extraArgs,
    ],
    {
      cwd: root,
      encoding: "utf8",
      shell: false,
    },
  );
}

async function writeFixtureFiles() {
  await writeFile(
    paths.terminalSource,
    [
      JSON.stringify({
        id: "terminal-001",
        title: "Retrieval Augmented Literature Synthesis",
        abstract: "Evidence-grounded literature synthesis with local SQLite indexing and research hotspot analysis.",
        year: 2026,
        source: "arxiv",
        field: "Artificial Intelligence",
        authors: "Zhang Wei; Li Ming",
        categories: "retrieval augmented generation; scholarly analysis",
      }),
      JSON.stringify({
        id: "terminal-002",
        title: "Local First Scientific Knowledge Workstations",
        abstract: "A local-first workstation design for large paper libraries, topic clustering, and evidence-bound reports.",
        year: 2025,
        source: "OpenAlex",
        field: "Human-Computer Interaction",
        authors: "Chen Yu",
        categories: "local first; research workflow; SQLite",
      }),
    ].join("\n") + "\n",
    "utf8",
  );
  await writeJson(paths.starMapSample, {
    strictGate: { passed: true },
    evidenceProfile: { sampleSignalCount: 2 },
  });
  await writeJson(paths.hotspotMissingIds, {
    strictGate: { passed: true },
    representativePapers: [
      { id: "paper-1", title: "Paper 1" },
      { id: "paper-2", title: "Paper 2" },
      { id: "paper-3", title: "Paper 3" },
    ],
    missingRepresentativeIds: ["paper-missing"],
  });
  await writeJson(paths.starMapEvidenceChain, {
    databasePath: "D:\\ResearchHotspotsDesktop\\library\\research-hotspots-v7.sqlite",
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
  await writeJson(paths.hotspotEvidenceDifferentDb, {
    databasePath: "D:\\ResearchHotspotsDesktop\\other\\research-hotspots-v7.sqlite",
    projectId: "project-default",
    selectedHotspotId: "hotspot-1",
    strictGate: { passed: true },
    representativeIds: ["paper-1", "paper-2", "paper-3"],
    representativePapers: [
      { id: "paper-1", title: "Paper 1" },
      { id: "paper-2", title: "Paper 2" },
      { id: "paper-3", title: "Paper 3" },
    ],
    missingRepresentativeIds: [],
  });
  await writeJson(paths.uiSmokeWeak, {
    gate: {
      passed: true,
      checks: {
        defaultCanvas: true,
        galaxyMapCanvas: true,
        fullscreenCanvas: true,
        fullscreenState: true,
        consoleClean: true,
        screenshotsNonBlank: true,
        lowOverexposure: false,
      },
    },
    consoleIssues: [],
  });
  await writeJson(paths.aiFailedReportAudit, {
    mode: "network-enabled",
    readyForLiveAi: true,
    network: { called: true },
    strictGate: { passed: true },
    reportAudit: { passed: false },
  });
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
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
