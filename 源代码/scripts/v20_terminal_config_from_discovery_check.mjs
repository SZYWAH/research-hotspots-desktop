import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildTerminalConfigFromDiscovery } from "./v20_terminal_config_from_discovery.mjs";
import { validateTerminalAcceptanceConfig } from "./v20_terminal_config_validate.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const outputDir = path.join(root, "outputs");
const tempDir = path.join(root, "work", "terminal-config-from-discovery-check");

await mkdir(outputDir, { recursive: true });
await rm(tempDir, { recursive: true, force: true });
await mkdir(tempDir, { recursive: true });

try {
  const paths = {
    library: path.join(tempDir, "real-library.jsonl"),
    bibliography: path.join(tempDir, "real-library.bib"),
    sampleLike: path.join(tempDir, "sample-library.jsonl"),
    database: "D:\\ResearchHotspotsDesktop\\library",
    converted: "D:\\ResearchHotspotsDesktop\\imports",
    uiSmoke: "outputs\\v20_ui_final_smoke.json",
    aiLiveSmoke: "outputs\\v20_ai_live_report_smoke.json",
  };

  await writeFile(paths.library, '{"title":"Large real row"}\n', "utf8");
  await writeFile(paths.bibliography, '@article{real,title={Large real export}}\n', "utf8");
  await writeFile(paths.sampleLike, '{"title":"Large sample row"}\n', "utf8");

  const directDiscovery = {
    gatePlan: {
      status: "ready_source_found",
      selectedSource: { filePath: paths.library, estimatedRows: 100000, titleCoverage: 0.98 },
    },
    candidates: [],
  };
  const bibliographyDiscovery = {
    gatePlan: {
      status: "conversion_ready_source_found",
      selectedSource: { filePath: paths.bibliography, estimatedRows: 120000, titleCoverage: null },
      convertedOutput: path.join(paths.converted, "real-library.jsonl"),
    },
    candidates: [],
  };
  const noCandidateDiscovery = {
    gatePlan: { status: "structured_sources_found_below_final_rows" },
    candidates: [{ filePath: paths.library, estimatedRows: 50, finalGateCandidate: false }],
  };
  const sampleLikeDiscovery = {
    gatePlan: {
      status: "ready_source_found",
      selectedSource: { filePath: paths.sampleLike, estimatedRows: 100000, titleCoverage: 0.98 },
    },
    candidates: [],
  };

  const cases = [
    {
      name: "direct final candidate creates a strict terminal config",
      run: () => {
        const result = buildTerminalConfigFromDiscovery(directDiscovery, commonOptions(paths));
        const validation = validateTerminalAcceptanceConfig(result.config, { strictTerminal: true });
        return {
          passed:
            validation.passed &&
            result.config.libraryPath === paths.library &&
            result.config.minValidRows === 100000 &&
            result.config.importBeforeAudit === true &&
            result.config.requireTerminalReady === true,
          validation,
          config: result.config,
        };
      },
    },
    {
      name: "large bibliography source keeps original file and conversion directory",
      run: () => {
        const result = buildTerminalConfigFromDiscovery(bibliographyDiscovery, commonOptions(paths));
        const validation = validateTerminalAcceptanceConfig(result.config, { strictTerminal: true });
        return {
          passed:
            validation.passed &&
            result.sourceMode === "bibliography-conversion" &&
            result.config.libraryPath === paths.bibliography &&
            result.config.convertedImportDir === paths.converted,
          validation,
          config: result.config,
        };
      },
    },
    {
      name: "discovery without a terminal-ready source is rejected",
      run: () => {
        try {
          buildTerminalConfigFromDiscovery(noCandidateDiscovery, commonOptions(paths));
          return { passed: false, error: null };
        } catch (error) {
          return { passed: String(error?.message ?? error).includes("No terminal-ready source"), error: String(error?.message ?? error) };
        }
      },
    },
    {
      name: "sample-like discovered source remains blocked by strict validation",
      run: () => {
        const result = buildTerminalConfigFromDiscovery(sampleLikeDiscovery, commonOptions(paths));
        const validation = validateTerminalAcceptanceConfig(result.config, { strictTerminal: true });
        return {
          passed:
            validation.passed === false &&
            validation.errors.some((error) => error.includes("sample/demo/fixture libraryPath")),
          validation,
          config: result.config,
        };
      },
    },
  ];

  const results = cases.map((testCase) => {
    const outcome = testCase.run();
    return { name: testCase.name, ...outcome };
  });
  const failed = results.filter((item) => !item.passed);
  const summaryPath = path.join(outputDir, "v20_terminal_config_from_discovery_check.json");
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
    console.error(`Terminal config from discovery check failed: ${failed.map((item) => item.name).join(", ")}`);
    process.exit(1);
  }

  console.log(`Terminal config from discovery check passed: cases=${results.length}`);
  console.log(`Summary: ${summaryPath}`);
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

function commonOptions(paths) {
  return {
    databaseDir: paths.database,
    convertedImportDir: paths.converted,
    uiSmokePath: paths.uiSmoke,
    aiLiveSmokePath: paths.aiLiveSmoke,
    minValidRows: 100000,
    launchExe: true,
  };
}
