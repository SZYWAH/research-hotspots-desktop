import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  renderConfigValidation,
  validateTerminalAcceptanceConfig,
} from "./v20_terminal_config_validate.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const outputDir = path.join(root, "outputs");

const DEFAULTS = {
  databaseDir: "D:\\ResearchHotspotsDesktop\\library",
  convertedImportDir: "D:\\ResearchHotspotsDesktop\\imports",
  uiSmokePath: "outputs\\v20_ui_final_smoke.json",
  aiLiveSmokePath: "outputs\\v20_ai_live_report_smoke.json",
  outputPath: path.join(outputDir, "v20_terminal_acceptance.generated.json"),
  summaryPath: path.join(outputDir, "v20_terminal_config_from_discovery.json"),
  minValidRows: 100000,
};

const args = process.argv.slice(2).filter((arg) => arg !== "--");
const discoveryPath = path.resolve(readOption("--discovery") || path.join(outputDir, "v20_real_data_discovery.json"));
const outputPath = path.resolve(readOption("--output") || DEFAULTS.outputPath);
const summaryPath = path.resolve(readOption("--summary-output") || DEFAULTS.summaryPath);
const minValidRows = readPositiveInt("--min-valid-rows", DEFAULTS.minValidRows);
const databaseDir = readOption("--database-dir") || DEFAULTS.databaseDir;
const convertedImportDir = readOption("--converted-import-dir") || DEFAULTS.convertedImportDir;
const uiSmokePath = readOption("--ui-smoke") || DEFAULTS.uiSmokePath;
const aiLiveSmokePath = readOption("--ai-live-smoke") || DEFAULTS.aiLiveSmokePath;
const launchExe = !args.includes("--no-launch-exe");
const checkExistingInputs = args.includes("--check-existing-inputs");

async function main() {
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }
  const discovery = JSON.parse(await readFile(discoveryPath, "utf8"));
  const { config, selectedSource, sourceMode } = buildTerminalConfigFromDiscovery(discovery, {
    minValidRows,
    databaseDir,
    convertedImportDir,
    uiSmokePath,
    aiLiveSmokePath,
    launchExe,
  });
  const validation = validateTerminalAcceptanceConfig(config, {
    configPath: outputPath,
    strictTerminal: true,
    checkExistingInputs,
  });
  const summary = {
    generatedAt: new Date().toISOString(),
    passed: validation.passed,
    discoveryPath,
    outputPath,
    selectedSource,
    sourceMode,
    checkExistingInputs,
    validation,
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await mkdir(path.dirname(summaryPath), { recursive: true });
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  if (!validation.passed) {
    console.error(renderConfigValidation(validation));
    console.error(`Summary: ${summaryPath}`);
    process.exit(1);
  }

  await writeFile(outputPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  console.log(`Terminal config generated from discovery: ${outputPath}`);
  console.log(`Summary: ${summaryPath}`);
  console.log(renderConfigValidation(validation));
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === thisFile) {
  main().catch(async (error) => {
    const summary = {
      generatedAt: new Date().toISOString(),
      passed: false,
      discoveryPath,
      outputPath,
      error: String(error?.message ?? error),
    };
    await mkdir(path.dirname(summaryPath), { recursive: true });
    await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
    console.error(summary.error);
    console.error(`Summary: ${summaryPath}`);
    process.exit(1);
  });
}

export function buildTerminalConfigFromDiscovery(discovery, options = {}) {
  const minValidRows = options.minValidRows ?? DEFAULTS.minValidRows;
  const selected = selectReadySource(discovery, minValidRows);
  const libraryPath = selected.filePath;
  const config = {
    $schema: "./v20_terminal_acceptance.schema.json",
    libraryPath,
    convertedImportDir: options.convertedImportDir ?? DEFAULTS.convertedImportDir,
    databaseDir: options.databaseDir ?? DEFAULTS.databaseDir,
    importBeforeAudit: true,
    minValidRows,
    minImportedRows: minValidRows,
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
    uiSmokePath: options.uiSmokePath ?? DEFAULTS.uiSmokePath,
    aiLiveSmokePath: options.aiLiveSmokePath ?? DEFAULTS.aiLiveSmokePath,
    requireLiveAi: true,
    requireTerminalReady: true,
    runPressureTest: true,
    runTauriBuild: true,
    launchExe: options.launchExe ?? true,
  };
  return {
    config,
    selectedSource: selected,
    sourceMode: selected.conversionSupported ? "bibliography-conversion" : "structured-source",
  };
}

function selectReadySource(discovery, minValidRows) {
  if (!discovery || typeof discovery !== "object") {
    throw new Error("Discovery report must be a JSON object.");
  }

  const plan = discovery.gatePlan && typeof discovery.gatePlan === "object" ? discovery.gatePlan : null;
  if (["ready_source_found", "conversion_ready_source_found"].includes(plan?.status) && plan.selectedSource?.filePath) {
    return {
      ...plan.selectedSource,
      conversionSupported: plan.status === "conversion_ready_source_found",
      fromGatePlan: true,
    };
  }

  const candidates = Array.isArray(discovery.candidates) ? discovery.candidates : [];
  const structured = candidates.find((item) => item.finalGateCandidate && item.filePath);
  if (structured) {
    return { ...structured, conversionSupported: false, fromGatePlan: false };
  }

  const convertible = candidates.find((item) => item.conversionSupported && (item.estimatedRows ?? 0) >= minValidRows && item.filePath);
  if (convertible) {
    return { ...convertible, conversionSupported: true, fromGatePlan: false };
  }

  const gateStatus = plan?.status ?? "missing";
  throw new Error(`No terminal-ready source was found in discovery report. gatePlan.status=${gateStatus}, minValidRows=${minValidRows}.`);
}

function readOption(name) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  return args[index + 1];
}

function readPositiveInt(name, fallback) {
  const value = readOption(name);
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer.`);
  return parsed;
}

function printHelp() {
  console.log(`
Usage:
  node scripts/v20_terminal_config_from_discovery.mjs --discovery outputs/v20_real_data_discovery.json --output outputs/v20_terminal_acceptance.generated.json

Options:
  --discovery <path>              Real-data discovery JSON report.
  --output <path>                 Generated terminal acceptance config path.
  --summary-output <path>         Generator summary JSON path.
  --database-dir <path>           Final SQLite database directory.
  --converted-import-dir <path>   D-drive directory for BibTeX/RIS conversion outputs.
  --ui-smoke <path>               Final UI smoke evidence path.
  --ai-live-smoke <path>          Final live AI smoke evidence path.
  --min-valid-rows <number>       Terminal source row threshold. Defaults to 100000.
  --check-existing-inputs         Also validate existing UI/AI/evidence input files.
  --no-launch-exe                 Generate a terminal config that skips launchExe.

The script fails when discovery has no structured 100000+ source or large BibTeX/RIS source.
`.trim());
}
