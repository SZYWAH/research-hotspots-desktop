import { spawnSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const outputDir = path.join(root, "outputs");
const tempDir = path.join(root, "work", "terminal-prepare-check");

await mkdir(outputDir, { recursive: true });
await rm(tempDir, { recursive: true, force: true });
await mkdir(tempDir, { recursive: true });

try {
  const readyRoot = path.join(tempDir, "ready-source");
  const emptyRoot = path.join(tempDir, "empty-source");
  await mkdir(readyRoot, { recursive: true });
  await mkdir(emptyRoot, { recursive: true });
  const readyLibrary = path.join(readyRoot, "real-library.jsonl");
  await writeFile(readyLibrary, buildRows(100000), "utf8");

  const readySummaryPath = path.join(outputDir, "v20_terminal_prepare_check_ready.json");
  const missingSummaryPath = path.join(outputDir, "v20_terminal_prepare_check_missing.json");

  const cases = [
    {
      name: "ready source produces config and storage preflight",
      run: () =>
        runPrepare([
          "--root",
          readyRoot,
          "--min-final-rows",
          "100000",
          "--max-files",
          "50",
          "--output",
          readySummaryPath,
          "--markdown",
          path.join(outputDir, "V20_TERMINAL_PREPARE_CHECK_READY.md"),
          "--discovery-output",
          path.join(outputDir, "v20_real_data_discovery_prepare_check_ready.json"),
          "--discovery-markdown",
          path.join(outputDir, "V20_REAL_DATA_DISCOVERY_PREPARE_CHECK_READY.md"),
          "--config-output",
          path.join(outputDir, "v20_terminal_acceptance_prepare_check.generated.json"),
          "--config-summary-output",
          path.join(outputDir, "v20_terminal_config_from_discovery_prepare_check.json"),
          "--storage-output",
          path.join(outputDir, "v20_storage_preflight_prepare_check.json"),
          "--no-launch-exe",
          "--require-ready",
        ]),
      inspect: async (run) => {
        const summary = await readJson(readySummaryPath);
        const finalAcceptanceCommand = summary.discovery.gatePlan?.finalAcceptanceCommand ?? "";
        return {
          passed:
            run.status === 0 &&
            summary.ready === true &&
            summary.runs.aiConfig.status === 0 &&
            typeof summary.aiConfig.readyForLiveAi === "boolean" &&
            summary.discovery.finalGateCandidateCount >= 1 &&
            finalAcceptanceCommand.includes("-RequireLiveAi") &&
            finalAcceptanceCommand.includes("-RequireTerminalReady") &&
            summary.sourceManifest.passed === true &&
            typeof summary.sourceManifest.source.sha256 === "string" &&
            summary.config.passed === true &&
            summary.storage.passed === true &&
            summary.capacity.passed === true &&
            typeof summary.capacity.recommendedFreeGb === "number",
          summary,
        };
      },
    },
    {
      name: "ready source can require live AI config as a hard gate",
      run: () =>
        runPrepare([
          "--root",
          readyRoot,
          "--min-final-rows",
          "100000",
          "--max-files",
          "50",
          "--output",
          path.join(outputDir, "v20_terminal_prepare_check_ai_required.json"),
          "--markdown",
          path.join(outputDir, "V20_TERMINAL_PREPARE_CHECK_AI_REQUIRED.md"),
          "--discovery-output",
          path.join(outputDir, "v20_real_data_discovery_prepare_check_ai_required.json"),
          "--discovery-markdown",
          path.join(outputDir, "V20_REAL_DATA_DISCOVERY_PREPARE_CHECK_AI_REQUIRED.md"),
          "--config-output",
          path.join(outputDir, "v20_terminal_acceptance_prepare_check_ai_required.generated.json"),
          "--config-summary-output",
          path.join(outputDir, "v20_terminal_config_from_discovery_prepare_check_ai_required.json"),
          "--storage-output",
          path.join(outputDir, "v20_storage_preflight_prepare_check_ai_required.json"),
          "--ai-config-output",
          path.join(outputDir, "v20_ai_config_preflight_prepare_check_ai_required.json"),
          "--no-launch-exe",
          "--require-ready",
          "--require-live-ai-config",
        ]),
      inspect: async (run) => {
        const summary = await readJson(path.join(outputDir, "v20_terminal_prepare_check_ai_required.json"));
        const expectedStatus = summary.aiConfig.readyForLiveAi ? 0 : 1;
        return {
          passed:
            run.status === expectedStatus &&
            summary.ready === true &&
            summary.hardReady === summary.aiConfig.readyForLiveAi,
          summary,
        };
      },
    },
    {
      name: "missing source reports not ready without hard failure",
      run: () =>
        runPrepare([
          "--root",
          emptyRoot,
          "--min-final-rows",
          "100000",
          "--max-files",
          "50",
          "--output",
          missingSummaryPath,
          "--markdown",
          path.join(outputDir, "V20_TERMINAL_PREPARE_CHECK_MISSING.md"),
          "--discovery-output",
          path.join(outputDir, "v20_real_data_discovery_prepare_check_missing.json"),
          "--discovery-markdown",
          path.join(outputDir, "V20_REAL_DATA_DISCOVERY_PREPARE_CHECK_MISSING.md"),
          "--config-output",
          path.join(outputDir, "v20_terminal_acceptance_prepare_check_missing.generated.json"),
          "--config-summary-output",
          path.join(outputDir, "v20_terminal_config_from_discovery_prepare_check_missing.json"),
          "--storage-output",
          path.join(outputDir, "v20_storage_preflight_prepare_check_missing.json"),
          "--no-launch-exe",
        ]),
      inspect: async (run) => {
        const summary = await readJson(missingSummaryPath);
        return {
          passed:
            run.status === 0 &&
            summary.ready === false &&
            summary.discovery.finalGateCandidateCount === 0 &&
            summary.sourceManifest.source === null &&
            summary.runs.generateConfig.status !== 0 &&
            summary.nextCommands.some((item) => item.includes("Export the full paper library")),
          summary,
        };
      },
    },
    {
      name: "missing source can be required as a hard gate",
      run: () =>
        runPrepare([
          "--root",
          emptyRoot,
          "--min-final-rows",
          "100000",
          "--max-files",
          "50",
          "--output",
          path.join(outputDir, "v20_terminal_prepare_check_missing_required.json"),
          "--markdown",
          path.join(outputDir, "V20_TERMINAL_PREPARE_CHECK_MISSING_REQUIRED.md"),
          "--discovery-output",
          path.join(outputDir, "v20_real_data_discovery_prepare_check_missing_required.json"),
          "--discovery-markdown",
          path.join(outputDir, "V20_REAL_DATA_DISCOVERY_PREPARE_CHECK_MISSING_REQUIRED.md"),
          "--config-output",
          path.join(outputDir, "v20_terminal_acceptance_prepare_check_missing_required.generated.json"),
          "--config-summary-output",
          path.join(outputDir, "v20_terminal_config_from_discovery_prepare_check_missing_required.json"),
          "--storage-output",
          path.join(outputDir, "v20_storage_preflight_prepare_check_missing_required.json"),
          "--no-launch-exe",
          "--require-ready",
        ]),
      inspect: async (run) => ({ passed: run.status !== 0, status: run.status }),
    },
  ];

  const results = [];
  for (const testCase of cases) {
    const run = testCase.run();
    const inspection = await testCase.inspect(run);
    results.push({
      name: testCase.name,
      passed: inspection.passed,
      status: run.status,
      stdoutTail: tailLines(run.stdout, 6),
      stderrTail: tailLines(run.stderr, 6),
      inspection,
    });
  }

  const failed = results.filter((item) => !item.passed);
  const summaryPath = path.join(outputDir, "v20_terminal_prepare_check.json");
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
    console.error(`Terminal prepare check failed: ${failed.map((item) => item.name).join(", ")}`);
    process.exit(1);
  }

  console.log(`Terminal prepare check passed: cases=${results.length}`);
  console.log(`Summary: ${summaryPath}`);
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

function runPrepare(extraArgs) {
  const result = spawnSync(process.execPath, ["scripts\\v20_terminal_prepare.mjs", ...extraArgs], {
    cwd: root,
    env: {
      ...process.env,
      VITE_DEEPSEEK_API_KEY: "",
      VITE_DEEPSEEK_BASE_URL: "",
      VITE_DEEPSEEK_MODEL: "",
    },
    encoding: "utf8",
    shell: false,
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function buildRows(count) {
  const rows = [];
  for (let index = 0; index < count; index += 1) {
    rows.push(
      JSON.stringify({
        id: `paper-${index + 1}`,
        title: `Terminal preparation paper ${index + 1}`,
        abstract: `This paper studies local research hotspot preparation, evidence tracing, and large library validation ${index + 1}.`,
        year: 2020 + (index % 4),
        doi: `10.5555/terminal-prep-${index + 1}`,
        source: "Synthetic check",
        field: "Research tooling",
      }),
    );
  }
  return `${rows.join("\n")}\n`;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function tailLines(value, maxLines) {
  return String(value ?? "").trim().split(/\r?\n/).slice(-maxLines).join("\n");
}
