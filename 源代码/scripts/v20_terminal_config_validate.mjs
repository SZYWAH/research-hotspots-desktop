import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const outputDir = path.join(root, "outputs");

const FIELD_SPECS = {
  $schema: { type: "string", meta: true },
  libraryPath: { type: "string", required: true },
  convertedImportDir: { type: "string" },
  minValidRows: { type: "integer", min: 1 },
  maxInvalidRate: { type: "number", min: 0, max: 1 },
  maxDuplicateRate: { type: "number", min: 0, max: 1 },
  databaseDir: { type: "string" },
  databasePath: { type: "string" },
  importBeforeAudit: { type: "boolean" },
  minImportedRows: { type: "integer", min: 1 },
  maxMissingAbstractRate: { type: "number", min: 0, max: 1 },
  maxMissingYearRate: { type: "number", min: 0, max: 1 },
  maxQueryMs: { type: "integer", min: 1 },
  minClusters: { type: "integer", min: 1 },
  exportStarMap: { type: "boolean" },
  starMapPath: { type: "string" },
  minStarMapHotspots: { type: "integer", min: 1 },
  minStarMapEvidenceIds: { type: "integer", min: 1 },
  minStarMapLinks: { type: "integer", min: 0 },
  minStarMapEvidenceCoverage: { type: "number", min: 0, max: 1 },
  minStarMapEvolutionCoverage: { type: "number", min: 0, max: 1 },
  minStarMapSourceDistributionCoverage: { type: "number", min: 0, max: 1 },
  rejectSampleStarMapSignals: { type: "boolean" },
  exportHotspotEvidence: { type: "boolean" },
  hotspotEvidencePath: { type: "string" },
  hotspotEvidenceMarkdownPath: { type: "string" },
  minHotspotRepresentativePapers: { type: "integer", min: 1 },
  generateHotspotReport: { type: "boolean" },
  generatedHotspotReportPath: { type: "string" },
  generatedHotspotReportHtmlPath: { type: "string" },
  minHotspotReportPapers: { type: "integer", min: 1 },
  reportPath: { type: "string" },
  minReportCitations: { type: "integer", min: 1 },
  minReportReferences: { type: "integer", min: 1 },
  minReportChars: { type: "integer", min: 1 },
  uiSmokePath: { type: "string" },
  aiLiveSmokePath: { type: "string" },
  requireLiveAi: { type: "boolean" },
  requireTerminalReady: { type: "boolean" },
  skipBaseline: { type: "boolean" },
  runPressureTest: { type: "boolean" },
  runTauriBuild: { type: "boolean" },
  launchExe: { type: "boolean" },
};

const TERMINAL_MINIMUMS = {
  minValidRows: 100000,
  minImportedRows: 100000,
  minClusters: 10,
  minStarMapHotspots: 10,
  minStarMapEvidenceIds: 10,
  minStarMapLinks: 1,
  minStarMapEvidenceCoverage: 0.8,
  minStarMapEvolutionCoverage: 0.8,
  minStarMapSourceDistributionCoverage: 0.8,
  minHotspotRepresentativePapers: 3,
  minHotspotReportPapers: 3,
  minReportCitations: 3,
  minReportReferences: 3,
  minReportChars: 1200,
};

const SAMPLE_PATH_PATTERN = /(^|[\\/])(data[\\/]samples|samples)([\\/]|$)|sample|demo|fixture/i;

export async function readTerminalAcceptanceConfig(configPath) {
  const resolvedPath = path.resolve(configPath);
  try {
    return JSON.parse(await readFile(resolvedPath, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read config ${resolvedPath}: ${error.message}`);
  }
}

export function validateTerminalAcceptanceConfig(config, options = {}) {
  const errors = [];
  const warnings = [];
  const configPath = options.configPath ? path.resolve(options.configPath) : null;

  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return {
      passed: false,
      errors: ["Config must be a JSON object."],
      warnings,
      terminalProfile: false,
      configPath,
    };
  }

  for (const [key, spec] of Object.entries(FIELD_SPECS)) {
    if (spec.required && !hasUsableValue(config[key])) {
      errors.push(`Missing required field: ${key}.`);
    }
  }

  for (const [key, value] of Object.entries(config)) {
    const spec = FIELD_SPECS[key];
    if (!spec) {
      errors.push(`Unknown field: ${key}.`);
      continue;
    }
    if (!hasUsableValue(value) && spec.type === "string") {
      errors.push(`Field ${key} must be a non-empty string.`);
      continue;
    }
    if (value === undefined || value === null || value === "") continue;
    validateTypeAndRange(key, value, spec, errors);
  }

  const hasDatabaseTarget = hasUsableValue(config.databaseDir) || hasUsableValue(config.databasePath);
  const terminalProfile = Boolean(options.strictTerminal || config.requireTerminalReady === true);

  if (hasUsableValue(config.databaseDir) && hasUsableValue(config.databasePath)) {
    errors.push("Use either databaseDir or databasePath, not both.");
  }
  if (config.importBeforeAudit === true && (!hasUsableValue(config.databaseDir) || hasUsableValue(config.databasePath))) {
    errors.push("importBeforeAudit requires databaseDir and cannot be combined with databasePath.");
  }
  if (config.exportStarMap === true && hasUsableValue(config.starMapPath)) {
    errors.push("Use either exportStarMap or starMapPath, not both.");
  }
  if (config.exportStarMap === true && !hasDatabaseTarget) {
    errors.push("exportStarMap requires databaseDir or databasePath.");
  }
  if (config.exportHotspotEvidence === true && hasUsableValue(config.hotspotEvidencePath)) {
    errors.push("Use either exportHotspotEvidence or hotspotEvidencePath, not both.");
  }
  if (config.exportHotspotEvidence === true && !hasDatabaseTarget) {
    errors.push("exportHotspotEvidence requires databaseDir or databasePath.");
  }
  if (config.generateHotspotReport === true && config.exportHotspotEvidence !== true && !hasUsableValue(config.hotspotEvidencePath)) {
    errors.push("generateHotspotReport requires exportHotspotEvidence or hotspotEvidencePath.");
  }
  if (config.generateHotspotReport === true && hasUsableValue(config.reportPath)) {
    errors.push("Use either generateHotspotReport or reportPath, not both.");
  }

  if (terminalProfile) {
    validateTerminalProfile(config, hasDatabaseTarget, errors);
  } else {
    validateNonTerminalWarnings(config, warnings);
  }

  if (options.checkExistingInputs) {
    validateExistingInputs(config, errors);
  }

  return {
    passed: errors.length === 0,
    terminalProfile,
    configPath,
    errors,
    warnings,
    checkedExistingInputs: Boolean(options.checkExistingInputs),
  };
}

export function renderConfigValidation(validation) {
  const lines = [
    `Config validation: ${validation.passed ? "passed" : "failed"}`,
    `Terminal profile: ${validation.terminalProfile}`,
  ];
  if (validation.configPath) lines.push(`Config: ${validation.configPath}`);
  if (validation.errors.length) {
    lines.push("", "Errors:");
    lines.push(...validation.errors.map((item) => `- ${item}`));
  }
  if (validation.warnings.length) {
    lines.push("", "Warnings:");
    lines.push(...validation.warnings.map((item) => `- ${item}`));
  }
  return lines.join("\n");
}

function validateTerminalProfile(config, hasDatabaseTarget, errors) {
  if (looksSampleLike(config.libraryPath)) {
    errors.push("Terminal-ready config cannot use a sample/demo/fixture libraryPath.");
  }
  if (!hasDatabaseTarget) {
    errors.push("Terminal-ready config requires databaseDir or databasePath.");
  }
  if (looksSampleLike(config.databaseDir) || looksSampleLike(config.databasePath)) {
    errors.push("Terminal-ready config cannot use sample/demo/fixture database paths.");
  }
  if (config.skipBaseline === true) {
    errors.push("Terminal-ready config cannot set skipBaseline=true.");
  }
  if (config.requireTerminalReady !== true) {
    errors.push("Terminal-ready config must set requireTerminalReady=true.");
  }
  if (config.requireLiveAi !== true) {
    errors.push("Terminal-ready config must set requireLiveAi=true.");
  }
  if (!hasUsableValue(config.aiLiveSmokePath)) {
    errors.push("Terminal-ready config requires aiLiveSmokePath.");
  }
  if (!hasUsableValue(config.uiSmokePath)) {
    errors.push("Terminal-ready config requires uiSmokePath.");
  }
  if (config.exportStarMap !== true && !hasUsableValue(config.starMapPath)) {
    errors.push("Terminal-ready config requires exportStarMap=true or starMapPath.");
  }
  if (config.rejectSampleStarMapSignals !== true) {
    errors.push("Terminal-ready config must set rejectSampleStarMapSignals=true.");
  }
  if (config.exportHotspotEvidence !== true && !hasUsableValue(config.hotspotEvidencePath)) {
    errors.push("Terminal-ready config requires exportHotspotEvidence=true or hotspotEvidencePath.");
  }
  if (config.generateHotspotReport !== true && !hasUsableValue(config.reportPath)) {
    errors.push("Terminal-ready config requires generateHotspotReport=true or reportPath.");
  }
  if (config.runPressureTest !== true) {
    errors.push("Terminal-ready config must set runPressureTest=true.");
  }
  if (config.runTauriBuild !== true) {
    errors.push("Terminal-ready config must set runTauriBuild=true.");
  }

  for (const [key, minimum] of Object.entries(TERMINAL_MINIMUMS)) {
    const value = config[key];
    if (value === undefined || value === null || value === "") {
      errors.push(`Terminal-ready config must set ${key} >= ${minimum}.`);
    } else if (typeof value === "number" && value < minimum) {
      errors.push(`Terminal-ready config must keep ${key} >= ${minimum}; current value is ${value}.`);
    }
  }
}

function validateNonTerminalWarnings(config, warnings) {
  if (config.skipBaseline === true) {
    warnings.push("skipBaseline=true is acceptable for samples only and cannot prove final completion.");
  }
  if ((config.minValidRows ?? 0) < 100000) {
    warnings.push("minValidRows is below 100000; this config is sample/dev-only.");
  }
  if ((config.minImportedRows ?? 0) < 100000) {
    warnings.push("minImportedRows is below 100000; imported SQLite readiness remains unproven.");
  }
  if (config.rejectSampleStarMapSignals !== true) {
    warnings.push("rejectSampleStarMapSignals is not enabled; real star-map completion remains unproven.");
  }
  if (config.requireLiveAi !== true) {
    warnings.push("requireLiveAi is not enabled; live AI completion remains unproven.");
  }
  if (config.requireTerminalReady !== true) {
    warnings.push("requireTerminalReady is not enabled; this run cannot be treated as terminal-goal completion.");
  }
}

function validateExistingInputs(config, errors) {
  const evidence = {
    starMap: null,
    hotspotEvidence: null,
  };
  const pathFields = [
    "libraryPath",
    "databasePath",
    "starMapPath",
    "hotspotEvidencePath",
    "reportPath",
    "uiSmokePath",
    "aiLiveSmokePath",
  ];
  for (const key of pathFields) {
    if (hasUsableValue(config[key]) && !existsSync(path.resolve(config[key]))) {
      errors.push(`${key} does not exist: ${config[key]}`);
    }
  }

  if (hasUsableValue(config.starMapPath) && existsSync(path.resolve(config.starMapPath))) {
    const starMap = readJsonEvidence(config.starMapPath, "starMapPath", errors);
    evidence.starMap = starMap;
    if (starMap && starMap.strictGate?.passed !== true) {
      errors.push("starMapPath evidence must have strictGate.passed=true.");
    }
    if (starMap && (starMap.evidenceProfile?.sampleSignalCount ?? 0) > 0 && config.rejectSampleStarMapSignals === true) {
      errors.push("starMapPath evidence contains sample-like signals while rejectSampleStarMapSignals=true.");
    }
  }

  if (hasUsableValue(config.hotspotEvidencePath) && existsSync(path.resolve(config.hotspotEvidencePath))) {
    const hotspotEvidence = readJsonEvidence(config.hotspotEvidencePath, "hotspotEvidencePath", errors);
    evidence.hotspotEvidence = hotspotEvidence;
    if (hotspotEvidence && hotspotEvidence.strictGate?.passed !== true) {
      errors.push("hotspotEvidencePath evidence must have strictGate.passed=true.");
    }
    if (hotspotEvidence && count(hotspotEvidence.missingRepresentativeIds) > 0) {
      errors.push("hotspotEvidencePath evidence must not contain missing representative paper ids.");
    }
  }

  if (hasUsableValue(config.uiSmokePath) && existsSync(path.resolve(config.uiSmokePath))) {
    const uiSmoke = readJsonEvidence(config.uiSmokePath, "uiSmokePath", errors);
    if (uiSmoke && uiSmoke.gate?.passed !== true) {
      errors.push("uiSmokePath evidence must have gate.passed=true.");
    }
    if (uiSmoke && count(uiSmoke.consoleIssues) > 0) {
      errors.push("uiSmokePath evidence must have no consoleIssues.");
    }
    if (uiSmoke?.gate?.checks) {
      for (const requiredCheck of ["defaultCanvas", "galaxyMapCanvas", "fullscreenCanvas", "fullscreenState", "consoleClean", "screenshotsNonBlank", "lowOverexposure"]) {
        if (uiSmoke.gate.checks[requiredCheck] !== true) {
          errors.push(`uiSmokePath evidence must have gate.checks.${requiredCheck}=true.`);
        }
      }
    }
  }

  if (hasUsableValue(config.aiLiveSmokePath) && existsSync(path.resolve(config.aiLiveSmokePath))) {
    const aiSmoke = readJsonEvidence(config.aiLiveSmokePath, "aiLiveSmokePath", errors);
    if (config.requireLiveAi === true) {
      if (aiSmoke?.mode !== "network-enabled") {
        errors.push("aiLiveSmokePath evidence must be produced in network-enabled mode when requireLiveAi=true.");
      }
      if (aiSmoke?.readyForLiveAi !== true) {
        errors.push("aiLiveSmokePath evidence must have readyForLiveAi=true when requireLiveAi=true.");
      }
      if (aiSmoke?.network?.called !== true) {
        errors.push("aiLiveSmokePath evidence must have network.called=true when requireLiveAi=true.");
      }
      if (aiSmoke?.strictGate?.passed !== true) {
        errors.push("aiLiveSmokePath evidence must have strictGate.passed=true when requireLiveAi=true.");
      }
      if (aiSmoke?.reportAudit?.passed !== true) {
        errors.push("aiLiveSmokePath evidence must have reportAudit.passed=true when requireLiveAi=true.");
      }
    }
  }

  validateSuppliedEvidenceChain(config, evidence, errors);
}

function validateSuppliedEvidenceChain(config, evidence, errors) {
  const expectedDatabasePath = expectedConfigDatabasePath(config);
  for (const [label, artifact] of [
    ["starMapPath", evidence.starMap],
    ["hotspotEvidencePath", evidence.hotspotEvidence],
  ]) {
    if (artifact?.databasePath && expectedDatabasePath && normalizeEvidencePath(artifact.databasePath) !== expectedDatabasePath) {
      errors.push(`${label} evidence databasePath does not match configured database target.`);
    }
  }

  const starMap = evidence.starMap;
  const hotspotEvidence = evidence.hotspotEvidence;
  if (!starMap || !hotspotEvidence) {
    return;
  }

  const starMapDb = normalizeEvidencePath(starMap.databasePath);
  const hotspotDb = normalizeEvidencePath(hotspotEvidence.databasePath);
  if (starMapDb && hotspotDb && starMapDb !== hotspotDb) {
    errors.push("starMapPath and hotspotEvidencePath evidence must reference the same databasePath.");
  }

  const starMapProject = normalizeText(starMap.projectId);
  const hotspotProject = normalizeText(hotspotEvidence.projectId);
  if (starMapProject && hotspotProject && starMapProject !== hotspotProject) {
    errors.push("starMapPath and hotspotEvidencePath evidence must use the same projectId.");
  }

  const selectedHotspotId = normalizeText(hotspotEvidence.selectedHotspotId);
  if (!selectedHotspotId) {
    errors.push("hotspotEvidencePath evidence must include selectedHotspotId when starMapPath is supplied.");
    return;
  }

  const starHotspot = Array.isArray(starMap.hotspots)
    ? starMap.hotspots.find((item) => normalizeText(item?.id) === selectedHotspotId)
    : null;
  if (!starHotspot) {
    errors.push("hotspotEvidencePath selectedHotspotId must exist in starMapPath evidence.");
    return;
  }

  const hotspotRepresentativeIds = normalizeIdList(hotspotEvidence.representativeIds);
  const starRepresentativeIds = normalizeIdList(starHotspot.representativeIds?.length ? starHotspot.representativeIds : starHotspot.analysis?.evidencePaperIds);
  for (const id of hotspotRepresentativeIds) {
    if (!starRepresentativeIds.includes(id)) {
      errors.push(`hotspotEvidencePath representativeId is missing from the selected starMapPath hotspot: ${id}.`);
    }
  }
}

function expectedConfigDatabasePath(config) {
  if (hasUsableValue(config.databasePath)) {
    return normalizeEvidencePath(config.databasePath);
  }
  if (hasUsableValue(config.databaseDir)) {
    return normalizeEvidencePath(path.join(config.databaseDir, "research-hotspots-v7.sqlite"));
  }
  return "";
}

function normalizeEvidencePath(value) {
  if (typeof value !== "string" || value.trim() === "") return "";
  const withoutVerbatimPrefix = value.trim().replace(/^\\\\\?\\/, "").replace(/\//g, "\\");
  return path.win32.normalize(path.resolve(withoutVerbatimPrefix)).toLowerCase();
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeIdList(value) {
  return Array.isArray(value) ? value.map(normalizeText).filter(Boolean) : [];
}

function readJsonEvidence(filePath, label, errors) {
  try {
    return JSON.parse(readFileSync(path.resolve(filePath), "utf8").replace(/^\uFEFF/, ""));
  } catch (error) {
    errors.push(`${label} must be valid JSON evidence: ${error.message}`);
    return null;
  }
}

function count(value) {
  return Array.isArray(value) ? value.length : 0;
}

function validateTypeAndRange(key, value, spec, errors) {
  if (spec.type === "string") {
    if (typeof value !== "string") errors.push(`Field ${key} must be a string.`);
    return;
  }
  if (spec.type === "boolean") {
    if (typeof value !== "boolean") errors.push(`Field ${key} must be a boolean.`);
    return;
  }
  if (spec.type === "integer") {
    if (typeof value !== "number" || !Number.isInteger(value)) {
      errors.push(`Field ${key} must be an integer.`);
      return;
    }
  } else if (spec.type === "number" && (typeof value !== "number" || !Number.isFinite(value))) {
    errors.push(`Field ${key} must be a finite number.`);
    return;
  }
  if (typeof spec.min === "number" && value < spec.min) {
    errors.push(`Field ${key} must be >= ${spec.min}.`);
  }
  if (typeof spec.max === "number" && value > spec.max) {
    errors.push(`Field ${key} must be <= ${spec.max}.`);
  }
}

function looksSampleLike(value) {
  return typeof value === "string" && SAMPLE_PATH_PATTERN.test(value);
}

function hasUsableValue(value) {
  return value !== undefined && value !== null && value !== "";
}

async function main() {
  const args = process.argv.slice(2).filter((arg) => arg !== "--");
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }

  const configPath = path.resolve(readOption(args, "--config") || path.join(root, "configs", "v20_terminal_acceptance.example.json"));
  const outputPath = path.resolve(readOption(args, "--output") || defaultValidationOutputPath(configPath));
  const config = await readTerminalAcceptanceConfig(configPath);
  const validation = validateTerminalAcceptanceConfig(config, {
    configPath,
    strictTerminal: args.includes("--strict-terminal"),
    checkExistingInputs: args.includes("--check-existing-inputs"),
  });

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), ...validation }, null, 2)}\n`, "utf8");
  console.log(renderConfigValidation(validation));
  console.log(`Output: ${outputPath}`);
  if (!validation.passed) process.exit(1);
}

function readOption(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  return args[index + 1];
}

function defaultValidationOutputPath(configPath) {
  const stem = path.basename(configPath, path.extname(configPath)).replace(/[^\w.-]+/g, "_");
  return path.join(outputDir, `v20_terminal_acceptance_config_check_${stem}.json`);
}

function printHelp() {
  console.log(`
Usage:
  node scripts/v20_terminal_config_validate.mjs --config configs/v20_terminal_acceptance.example.json

Options:
  --config <path>           JSON config path.
  --strict-terminal         Enforce final 100000+ terminal-goal thresholds even if requireTerminalReady is absent.
  --check-existing-inputs   Also fail when configured input evidence files do not exist.
  --output <path>           JSON validation report path.
`);
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === thisFile) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
