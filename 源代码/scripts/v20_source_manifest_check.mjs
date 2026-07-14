import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const outputDir = path.join(root, "outputs");
const tempDir = path.join(root, "work", "source-manifest-check");

await mkdir(outputDir, { recursive: true });
await rm(tempDir, { recursive: true, force: true });
await mkdir(tempDir, { recursive: true });

try {
  const realSource = path.join(tempDir, "real-library.jsonl");
  const sampleDir = path.join(tempDir, "samples");
  await mkdir(sampleDir, { recursive: true });
  const sampleSource = path.join(sampleDir, "sample-library.jsonl");
  const realContent = buildRows(5);
  const sampleContent = buildRows(5);
  await writeFile(realSource, realContent, "utf8");
  await writeFile(sampleSource, sampleContent, "utf8");
  const expectedHash = createHash("sha256").update(realContent).digest("hex");

  const discoveryPath = path.join(tempDir, "discovery.json");
  const sampleDiscoveryPath = path.join(tempDir, "discovery-sample.json");
  const emptyDiscoveryPath = path.join(tempDir, "discovery-empty.json");
  await writeJson(discoveryPath, discoveryFor(realSource, 5, true));
  await writeJson(sampleDiscoveryPath, discoveryFor(sampleSource, 5, true));
  await writeJson(emptyDiscoveryPath, { candidateCount: 0, finalGateCandidateCount: 0, candidates: [], gatePlan: { status: "no_source_found" } });

  const cases = [
    {
      name: "real source manifest hashes selected source",
      args: [
        "--discovery",
        discoveryPath,
        "--min-rows",
        "5",
        "--output",
        path.join(outputDir, "v20_source_manifest_check_real.json"),
        "--markdown",
        path.join(outputDir, "V20_SOURCE_MANIFEST_CHECK_REAL.md"),
        "--require-terminal-source",
      ],
      expectStatus: 0,
      inspectPath: path.join(outputDir, "v20_source_manifest_check_real.json"),
      inspect: (result) => result.source.sha256 === expectedHash && result.source.terminalCandidate === true,
    },
    {
      name: "sample-like source fails terminal requirement",
      args: [
        "--discovery",
        sampleDiscoveryPath,
        "--min-rows",
        "5",
        "--output",
        path.join(outputDir, "v20_source_manifest_check_sample.json"),
        "--markdown",
        path.join(outputDir, "V20_SOURCE_MANIFEST_CHECK_SAMPLE.md"),
        "--require-terminal-source",
      ],
      expectStatus: 1,
      inspectPath: path.join(outputDir, "v20_source_manifest_check_sample.json"),
      inspect: (result) => result.passed === false && result.source.sampleLike === true && result.errors.length > 0,
    },
    {
      name: "missing source candidate writes diagnostic manifest",
      args: [
        "--discovery",
        emptyDiscoveryPath,
        "--min-rows",
        "5",
        "--output",
        path.join(outputDir, "v20_source_manifest_check_empty.json"),
        "--markdown",
        path.join(outputDir, "V20_SOURCE_MANIFEST_CHECK_EMPTY.md"),
      ],
      expectStatus: 0,
      inspectPath: path.join(outputDir, "v20_source_manifest_check_empty.json"),
      inspect: (result) => result.passed === true && result.source === null && result.warnings.some((item) => item.includes("No source file")),
    },
  ];

  const results = [];
  for (const testCase of cases) {
    const run = spawnSync(process.execPath, ["scripts\\v20_source_manifest.mjs", ...testCase.args], {
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
  const summaryPath = path.join(outputDir, "v20_source_manifest_check.json");
  await writeJson(summaryPath, {
    generatedAt: new Date().toISOString(),
    passed: failed.length === 0,
    failed: failed.map((item) => item.name),
    caseCount: results.length,
    results,
  });

  if (failed.length > 0) {
    console.error(`Source manifest check failed: ${failed.map((item) => item.name).join(", ")}`);
    process.exit(1);
  }

  console.log(`Source manifest check passed: cases=${results.length}`);
  console.log(`Summary: ${summaryPath}`);
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

function discoveryFor(filePath, rows, finalGateCandidate) {
  const candidate = {
    filePath,
    fileName: path.basename(filePath),
    extension: "jsonl",
    sizeBytes: 1000,
    sizeMb: 0.001,
    estimatedRows: rows,
    finalGateCandidate,
    preflightSupported: true,
    conversionSupported: false,
  };
  return {
    candidateCount: 1,
    finalGateCandidateCount: finalGateCandidate ? 1 : 0,
    bestCandidate: candidate,
    candidates: [candidate],
    gatePlan: {
      status: finalGateCandidate ? "ready_source_found" : "structured_sources_found_below_final_rows",
      selectedSource: candidate,
    },
  };
}

function buildRows(count) {
  return Array.from({ length: count }, (_, index) => JSON.stringify({ id: `p-${index}`, title: `Paper ${index}` })).join("\n") + "\n";
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function tailLines(value, maxLines) {
  return String(value ?? "").trim().split(/\r?\n/).slice(-maxLines).join("\n");
}
