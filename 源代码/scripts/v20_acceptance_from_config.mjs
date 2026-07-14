import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  renderConfigValidation,
  validateTerminalAcceptanceConfig,
} from "./v20_terminal_config_validate.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const args = process.argv.slice(2).filter((arg) => arg !== "--");

if (args.includes("--help") || args.includes("-h")) {
  printHelp();
  process.exit(0);
}

const configPath = path.resolve(readOption("--config") || path.join(root, "configs", "v20_terminal_acceptance.example.json"));
const dryRun = args.includes("--dry-run");
const config = await readJson(configPath);
const validation = validateTerminalAcceptanceConfig(config, {
  configPath,
  strictTerminal: args.includes("--strict-terminal"),
  checkExistingInputs: args.includes("--check-existing-inputs"),
});
console.log(renderConfigValidation(validation));
if (!validation.passed) {
  process.exit(1);
}
const gateArgs = buildGateArgs(config);

if (dryRun) {
  console.log(renderCommand(gateArgs));
  process.exit(0);
}

const powershell = process.platform === "win32" ? "powershell.exe" : "pwsh";
const gateScript = path.join(root, "scripts", "v20_final_acceptance_gate.ps1");
const result = spawnSync(
  powershell,
  ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", gateScript, ...gateArgs],
  {
    cwd: root,
    stdio: "inherit",
    shell: false,
  },
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);

function buildGateArgs(config) {
  const gateArgs = [];
  addValue(gateArgs, "-LibraryPath", config.libraryPath);
  addValue(gateArgs, "-ConvertedImportDir", config.convertedImportDir);
  addValue(gateArgs, "-MinValidRows", config.minValidRows);
  addValue(gateArgs, "-MaxInvalidRate", config.maxInvalidRate);
  addValue(gateArgs, "-MaxDuplicateRate", config.maxDuplicateRate);
  addValue(gateArgs, "-DatabaseDir", config.databaseDir);
  addValue(gateArgs, "-DatabasePath", config.databasePath);
  addSwitch(gateArgs, "-ImportBeforeAudit", config.importBeforeAudit);
  addValue(gateArgs, "-MinImportedRows", config.minImportedRows);
  addValue(gateArgs, "-MaxMissingAbstractRate", config.maxMissingAbstractRate);
  addValue(gateArgs, "-MaxMissingYearRate", config.maxMissingYearRate);
  addValue(gateArgs, "-MaxQueryMs", config.maxQueryMs);
  addValue(gateArgs, "-MinClusters", config.minClusters);
  addSwitch(gateArgs, "-ExportStarMap", config.exportStarMap);
  addValue(gateArgs, "-StarMapPath", config.starMapPath);
  addValue(gateArgs, "-MinStarMapHotspots", config.minStarMapHotspots);
  addValue(gateArgs, "-MinStarMapEvidenceIds", config.minStarMapEvidenceIds);
  addValue(gateArgs, "-MinStarMapLinks", config.minStarMapLinks);
  addValue(gateArgs, "-MinStarMapEvidenceCoverage", config.minStarMapEvidenceCoverage);
  addValue(gateArgs, "-MinStarMapEvolutionCoverage", config.minStarMapEvolutionCoverage);
  addValue(gateArgs, "-MinStarMapSourceDistributionCoverage", config.minStarMapSourceDistributionCoverage);
  addSwitch(gateArgs, "-RejectSampleStarMapSignals", config.rejectSampleStarMapSignals);
  addSwitch(gateArgs, "-ExportHotspotEvidence", config.exportHotspotEvidence);
  addValue(gateArgs, "-HotspotEvidencePath", config.hotspotEvidencePath);
  addValue(gateArgs, "-HotspotEvidenceMarkdownPath", config.hotspotEvidenceMarkdownPath);
  addValue(gateArgs, "-MinHotspotRepresentativePapers", config.minHotspotRepresentativePapers);
  addSwitch(gateArgs, "-GenerateHotspotReport", config.generateHotspotReport);
  addValue(gateArgs, "-GeneratedHotspotReportPath", config.generatedHotspotReportPath);
  addValue(gateArgs, "-GeneratedHotspotReportHtmlPath", config.generatedHotspotReportHtmlPath);
  addValue(gateArgs, "-MinHotspotReportPapers", config.minHotspotReportPapers);
  addValue(gateArgs, "-ReportPath", config.reportPath);
  addValue(gateArgs, "-MinReportCitations", config.minReportCitations);
  addValue(gateArgs, "-MinReportReferences", config.minReportReferences);
  addValue(gateArgs, "-MinReportChars", config.minReportChars);
  addValue(gateArgs, "-UiSmokePath", config.uiSmokePath);
  addValue(gateArgs, "-AiLiveSmokePath", config.aiLiveSmokePath);
  addSwitch(gateArgs, "-RequireLiveAi", config.requireLiveAi);
  addSwitch(gateArgs, "-RequireTerminalReady", config.requireTerminalReady);
  addSwitch(gateArgs, "-SkipBaseline", config.skipBaseline);
  addSwitch(gateArgs, "-RunPressureTest", config.runPressureTest);
  addSwitch(gateArgs, "-RunTauriBuild", config.runTauriBuild);
  addSwitch(gateArgs, "-LaunchExe", config.launchExe);
  return gateArgs;
}

function addValue(args, flag, value) {
  if (value === undefined || value === null || value === "") return;
  args.push(flag, String(value));
}

function addSwitch(args, flag, value) {
  if (value === true) args.push(flag);
}

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read config ${filePath}: ${error.message}`);
  }
}

function readOption(name) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  return args[index + 1];
}

function renderCommand(gateArgs) {
  return [
    "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\\v20_final_acceptance_gate.ps1",
    ...gateArgs.map((arg) => (arg.startsWith("-") ? arg : psQuote(arg))),
  ].join(" ");
}

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function printHelp() {
  console.log(`
Usage:
  node scripts/v20_acceptance_from_config.mjs --config configs/v20_terminal_acceptance.example.json

Options:
  --config <path>  JSON config path.
  --dry-run        Print the resolved PowerShell command without running it.
  --strict-terminal Enforce final 100000+ terminal-goal thresholds.
  --check-existing-inputs Fail early if configured evidence files do not exist.
`);
}
