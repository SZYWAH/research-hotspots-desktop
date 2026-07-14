import { mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const outputDir = path.join(root, "outputs");
const tempDir = path.join(root, "work", "capacity-plan-check");

await mkdir(outputDir, { recursive: true });
await rm(tempDir, { recursive: true, force: true });
await mkdir(tempDir, { recursive: true });

try {
  const discoveryPath = path.join(tempDir, "discovery-ready.json");
  const lowStoragePath = path.join(tempDir, "storage-low.json");
  const readyStoragePath = path.join(tempDir, "storage-ready.json");
  const noCandidateDiscoveryPath = path.join(tempDir, "discovery-empty.json");
  await writeJson(discoveryPath, readyDiscovery());
  await writeJson(readyStoragePath, storageFixture(250));
  await writeJson(lowStoragePath, storageFixture(1));
  await writeJson(noCandidateDiscoveryPath, { candidateCount: 0, finalGateCandidateCount: 0, candidates: [], gatePlan: { status: "no_source_found" } });

  const cases = [
    {
      name: "ready discovery and D-drive storage pass strict capacity",
      args: [
        "--discovery",
        discoveryPath,
        "--storage",
        readyStoragePath,
        "--output",
        path.join(outputDir, "v20_capacity_plan_check_ready.json"),
        "--markdown",
        path.join(outputDir, "V20_CAPACITY_PLAN_CHECK_READY.md"),
        "--require-capacity",
      ],
      expectStatus: 0,
      inspectPath: path.join(outputDir, "v20_capacity_plan_check_ready.json"),
      inspect: (result) => result.passed === true && result.capacityReady === true && result.estimate.meetsMinRows === true,
    },
    {
      name: "low storage fails strict capacity",
      args: [
        "--discovery",
        discoveryPath,
        "--storage",
        lowStoragePath,
        "--output",
        path.join(outputDir, "v20_capacity_plan_check_low_storage.json"),
        "--markdown",
        path.join(outputDir, "V20_CAPACITY_PLAN_CHECK_LOW_STORAGE.md"),
        "--require-capacity",
      ],
      expectStatus: 1,
      inspectPath: path.join(outputDir, "v20_capacity_plan_check_low_storage.json"),
      inspect: (result) => result.passed === false && result.capacityReady === false && result.errors.length > 0,
    },
    {
      name: "missing candidate still writes diagnostic plan",
      args: [
        "--discovery",
        noCandidateDiscoveryPath,
        "--storage",
        readyStoragePath,
        "--output",
        path.join(outputDir, "v20_capacity_plan_check_missing.json"),
        "--markdown",
        path.join(outputDir, "V20_CAPACITY_PLAN_CHECK_MISSING.md"),
      ],
      expectStatus: 0,
      inspectPath: path.join(outputDir, "v20_capacity_plan_check_missing.json"),
      inspect: (result) => result.passed === true && result.selectedSource === null && result.warnings.some((item) => item.includes("No source candidate")),
    },
  ];

  const results = [];
  for (const testCase of cases) {
    const run = spawnSync(process.execPath, ["scripts\\v20_capacity_plan.mjs", ...testCase.args], {
      cwd: root,
      encoding: "utf8",
      shell: false,
    });
    const result = JSON.parse(await readFile(testCase.inspectPath, "utf8"));
    const passed = run.status === testCase.expectStatus && testCase.inspect(result);
    results.push({
      name: testCase.name,
      passed,
      status: run.status,
      expectedStatus: testCase.expectStatus,
      stdoutTail: tailLines(run.stdout, 6),
      stderrTail: tailLines(run.stderr, 6),
    });
  }

  const failed = results.filter((item) => !item.passed);
  const summaryPath = path.join(outputDir, "v20_capacity_plan_check.json");
  await writeJson(summaryPath, {
    generatedAt: new Date().toISOString(),
    passed: failed.length === 0,
    failed: failed.map((item) => item.name),
    caseCount: results.length,
    results,
  });

  if (failed.length > 0) {
    console.error(`Capacity plan check failed: ${failed.map((item) => item.name).join(", ")}`);
    process.exit(1);
  }

  console.log(`Capacity plan check passed: cases=${results.length}`);
  console.log(`Summary: ${summaryPath}`);
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

function readyDiscovery() {
  const candidate = {
    filePath: "D:\\papers\\library.jsonl",
    fileName: "library.jsonl",
    extension: "jsonl",
    sizeBytes: 600 * 1024 * 1024,
    sizeMb: 600,
    estimatedRows: 120000,
    finalGateCandidate: true,
    preflightSupported: true,
    conversionSupported: false,
    titleCoverage: 0.96,
    abstractCoverage: 0.9,
    yearCoverage: 0.95,
    invalidSampleRate: 0,
  };
  return {
    candidateCount: 1,
    finalGateCandidateCount: 1,
    bestCandidate: candidate,
    candidates: [candidate],
    gatePlan: {
      status: "ready_source_found",
      selectedSource: candidate,
    },
  };
}

function storageFixture(freeGb) {
  const drive = { name: "D", root: "D:\\", freeGb, usedGb: 100 };
  return {
    passed: true,
    targets: [
      { name: "database storage", path: "D:\\ResearchHotspotsDesktop\\library", largeWrite: true, driveLetter: "D", drive },
      { name: "converted import dir", path: "D:\\ResearchHotspotsDesktop\\imports", largeWrite: true, driveLetter: "D", drive },
    ],
  };
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function tailLines(value, maxLines) {
  return String(value ?? "").trim().split(/\r?\n/).slice(-maxLines).join("\n");
}
