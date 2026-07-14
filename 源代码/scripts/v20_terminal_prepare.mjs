import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const outputDir = path.join(root, "outputs");
const args = process.argv.slice(2).filter((arg) => arg !== "--");

const DEFAULTS = {
  discoveryJson: path.join(outputDir, "v20_real_data_discovery.json"),
  discoveryMarkdown: path.join(outputDir, "V20_REAL_DATA_DISCOVERY.md"),
  sourceManifestJson: path.join(outputDir, "v20_source_manifest.generated.json"),
  sourceManifestMarkdown: path.join(outputDir, "V20_SOURCE_MANIFEST_GENERATED.md"),
  generatedConfig: path.join(outputDir, "v20_terminal_acceptance.generated.json"),
  configSummary: path.join(outputDir, "v20_terminal_config_from_discovery.json"),
  storageJson: path.join(outputDir, "v20_storage_preflight.generated.json"),
  capacityJson: path.join(outputDir, "v20_capacity_plan.generated.json"),
  capacityMarkdown: path.join(outputDir, "V20_CAPACITY_PLAN_GENERATED.md"),
  aiConfigJson: path.join(outputDir, "v20_ai_config_preflight_prepare.json"),
  outputJson: path.join(outputDir, "v20_terminal_prepare.json"),
  outputMarkdown: path.join(outputDir, "V20_TERMINAL_PREPARE.md"),
  databaseDir: "D:\\ResearchHotspotsDesktop\\library",
  convertedImportDir: "D:\\ResearchHotspotsDesktop\\imports",
  uiSmokePath: "outputs\\v20_ui_final_smoke.json",
  aiLiveSmokePath: "outputs\\v20_ai_live_report_smoke.json",
  minFinalRows: 100000,
  minFreeGb: 10,
};

if (args.includes("--help") || args.includes("-h")) {
  printHelp();
  process.exit(0);
}

const scanRoots = readRepeated("--root");
const positionalRoots = args.filter((arg, index) => !arg.startsWith("--") && !isOptionValue(index));
const roots = [...scanRoots, ...positionalRoots];
if (roots.length === 0) roots.push(readOption("--discovery-root") || "D:\\papers");

const paths = {
  discoveryJson: path.resolve(readOption("--discovery-output") || DEFAULTS.discoveryJson),
  discoveryMarkdown: path.resolve(readOption("--discovery-markdown") || DEFAULTS.discoveryMarkdown),
  sourceManifestJson: path.resolve(readOption("--source-manifest-output") || DEFAULTS.sourceManifestJson),
  sourceManifestMarkdown: path.resolve(readOption("--source-manifest-markdown") || DEFAULTS.sourceManifestMarkdown),
  generatedConfig: path.resolve(readOption("--config-output") || DEFAULTS.generatedConfig),
  configSummary: path.resolve(readOption("--config-summary-output") || DEFAULTS.configSummary),
  storageJson: path.resolve(readOption("--storage-output") || DEFAULTS.storageJson),
  capacityJson: path.resolve(readOption("--capacity-output") || DEFAULTS.capacityJson),
  capacityMarkdown: path.resolve(readOption("--capacity-markdown") || DEFAULTS.capacityMarkdown),
  aiConfigJson: path.resolve(readOption("--ai-config-output") || DEFAULTS.aiConfigJson),
  outputJson: path.resolve(readOption("--output") || DEFAULTS.outputJson),
  outputMarkdown: path.resolve(readOption("--markdown") || DEFAULTS.outputMarkdown),
};
const options = {
  databaseDir: readOption("--database-dir") || DEFAULTS.databaseDir,
  convertedImportDir: readOption("--converted-import-dir") || DEFAULTS.convertedImportDir,
  uiSmokePath: readOption("--ui-smoke") || DEFAULTS.uiSmokePath,
  aiLiveSmokePath: readOption("--ai-live-smoke") || DEFAULTS.aiLiveSmokePath,
  minFinalRows: readPositiveInt("--min-final-rows", DEFAULTS.minFinalRows),
  minFreeGb: readNonNegativeNumber("--min-free-gb", DEFAULTS.minFreeGb),
  maxFiles: readPositiveInt("--max-files", 5000),
  sampleRows: readPositiveInt("--sample-rows", 200),
  requireReady: args.includes("--require-ready"),
  requireLiveAiConfig: args.includes("--require-live-ai-config"),
  noLaunchExe: args.includes("--no-launch-exe"),
};

await mkdir(path.dirname(paths.outputJson), { recursive: true });
await mkdir(path.dirname(paths.outputMarkdown), { recursive: true });

const commands = buildCommands({ roots, paths, options });
const aiConfigRun = runCommand("AI config preflight", commands.aiConfig);
const aiConfig = await readJsonIfExists(paths.aiConfigJson);
const discoveryRun = runCommand("discover real data", commands.discovery);
const discovery = await readJsonIfExists(paths.discoveryJson);
const sourceManifestRun = discoveryRun.status === 0 ? runCommand("source manifest", commands.sourceManifest) : skipped("Discovery failed.");
const sourceManifest = await readJsonIfExists(paths.sourceManifestJson);
const configRun = discoveryRun.status === 0 ? runCommand("generate terminal config", commands.generateConfig) : skipped("Discovery failed.");
const configSummary = await readJsonIfExists(paths.configSummary);
const generatedConfig = await readJsonIfExists(paths.generatedConfig);
const storageRun = configRun.status === 0 ? runCommand("storage preflight", commands.storagePreflight) : skipped("Terminal config was not generated.");
const storage = await readJsonIfExists(paths.storageJson);
const capacityRun = storageRun.status === 0 ? runCommand("capacity plan", commands.capacityPlan) : skipped("Storage preflight was not generated.");
const capacity = await readJsonIfExists(paths.capacityJson);

const ready = Boolean(discoveryRun.status === 0 && configRun.status === 0 && storageRun.status === 0 && generatedConfig && storage?.passed === true);
const liveAiConfigReady = Boolean(aiConfigRun.status === 0 && aiConfig?.effective?.readyForLiveAi === true);
const hardReady = ready && (!options.requireLiveAiConfig || liveAiConfigReady);
const result = {
  generatedAt: new Date().toISOString(),
  projectRoot: root,
  ready,
  hardReady,
  requireReady: options.requireReady,
  requireLiveAiConfig: options.requireLiveAiConfig,
  scanRoots: roots,
  minFinalRows: options.minFinalRows,
  outputs: {
    discoveryJson: toDisplayPath(paths.discoveryJson),
    discoveryMarkdown: toDisplayPath(paths.discoveryMarkdown),
    sourceManifestJson: toDisplayPath(paths.sourceManifestJson),
    sourceManifestMarkdown: toDisplayPath(paths.sourceManifestMarkdown),
    generatedConfig: toDisplayPath(paths.generatedConfig),
    configSummary: toDisplayPath(paths.configSummary),
    storageJson: toDisplayPath(paths.storageJson),
    capacityJson: toDisplayPath(paths.capacityJson),
    capacityMarkdown: toDisplayPath(paths.capacityMarkdown),
    aiConfigJson: toDisplayPath(paths.aiConfigJson),
    summaryJson: toDisplayPath(paths.outputJson),
    summaryMarkdown: toDisplayPath(paths.outputMarkdown),
  },
  commands,
  runs: {
    aiConfig: summarizeRun(aiConfigRun),
    discovery: summarizeRun(discoveryRun),
    sourceManifest: summarizeRun(sourceManifestRun),
    generateConfig: summarizeRun(configRun),
    storagePreflight: summarizeRun(storageRun),
    capacityPlan: summarizeRun(capacityRun),
  },
  discovery: discovery
    ? {
        candidateCount: discovery.candidateCount,
        finalGateCandidateCount: discovery.finalGateCandidateCount,
        gatePlan: discovery.gatePlan ?? null,
        recommendations: discovery.recommendations ?? [],
      }
    : null,
  config: configSummary
    ? {
        passed: configSummary.passed,
        selectedSource: configSummary.selectedSource ?? null,
        sourceMode: configSummary.sourceMode ?? null,
        validationErrors: configSummary.validation?.errors ?? [],
      }
    : null,
  sourceManifest: sourceManifest
    ? {
        passed: sourceManifest.passed,
        source: sourceManifest.source ?? null,
        warnings: sourceManifest.warnings ?? [],
        errors: sourceManifest.errors ?? [],
      }
    : null,
  storage: storage
    ? {
        passed: storage.passed,
        warnings: storage.warnings ?? [],
        errors: storage.errors ?? [],
        targets: storage.targets ?? [],
      }
    : null,
  capacity: capacity
    ? {
        passed: capacity.passed,
        capacityReady: capacity.capacityReady,
        recommendedFreeGb: capacity.estimate?.recommendedFreeGb ?? null,
        selectedSource: capacity.selectedSource ?? null,
        warnings: capacity.warnings ?? [],
        errors: capacity.errors ?? [],
      }
    : null,
  aiConfig: aiConfig
    ? {
        readyForLiveAi: aiConfig.effective?.readyForLiveAi ?? false,
        apiKeyStatus: aiConfig.effective?.apiKey?.status ?? "missing",
        apiKeySource: aiConfig.effective?.apiKey?.source ?? null,
        baseUrlStatus: aiConfig.effective?.baseUrl?.status ?? "missing",
        modelStatus: aiConfig.effective?.model?.status ?? "missing",
        strictGatePassed: aiConfig.strictGate?.passed ?? null,
        recommendations: aiConfig.recommendations ?? [],
      }
    : null,
  nextCommands: buildNextCommands(paths, options, ready),
};

await writeFile(paths.outputJson, `${JSON.stringify(result, null, 2)}\n`, "utf8");
await writeFile(paths.outputMarkdown, renderMarkdown(result), "utf8");

console.log(`Terminal preparation completed: ready=${ready}, liveAiConfigReady=${liveAiConfigReady}, discoveryCandidates=${result.discovery?.candidateCount ?? "missing"}`);
console.log(`JSON: ${paths.outputJson}`);
console.log(`Markdown: ${paths.outputMarkdown}`);

if (options.requireReady && !hardReady) {
  process.exit(1);
}

function buildCommands({ roots, paths, options }) {
  const aiConfig = [
    process.execPath,
    "scripts\\v20_ai_config_preflight.mjs",
    "--output",
    paths.aiConfigJson,
    ...(options.requireLiveAiConfig ? ["--require-live"] : []),
  ];
  const discovery = [
    process.execPath,
    "scripts\\v20_real_data_discovery.mjs",
    ...roots.flatMap((scanRoot) => ["--root", scanRoot]),
    "--output",
    paths.discoveryJson,
    "--markdown",
    paths.discoveryMarkdown,
    "--min-final-rows",
    String(options.minFinalRows),
    "--sample-rows",
    String(options.sampleRows),
    "--max-files",
    String(options.maxFiles),
  ];
  const sourceManifest = [
    process.execPath,
    "scripts\\v20_source_manifest.mjs",
    "--discovery",
    paths.discoveryJson,
    "--output",
    paths.sourceManifestJson,
    "--markdown",
    paths.sourceManifestMarkdown,
    "--min-rows",
    String(options.minFinalRows),
  ];
  const generateConfig = [
    process.execPath,
    "scripts\\v20_terminal_config_from_discovery.mjs",
    "--discovery",
    paths.discoveryJson,
    "--output",
    paths.generatedConfig,
    "--summary-output",
    paths.configSummary,
    "--database-dir",
    options.databaseDir,
    "--converted-import-dir",
    options.convertedImportDir,
    "--ui-smoke",
    options.uiSmokePath,
    "--ai-live-smoke",
    options.aiLiveSmokePath,
    "--min-valid-rows",
    String(options.minFinalRows),
    ...(options.noLaunchExe ? ["--no-launch-exe"] : []),
  ];
  const storagePreflight = [
    process.execPath,
    "scripts\\v20_storage_preflight.mjs",
    "--config",
    paths.generatedConfig,
    "--output",
    paths.storageJson,
    "--min-free-gb",
    String(options.minFreeGb),
    "--require-min-free",
    "--require-non-c-storage",
  ];
  const capacityPlan = [
    process.execPath,
    "scripts\\v20_capacity_plan.mjs",
    "--discovery",
    paths.discoveryJson,
    "--storage",
    paths.storageJson,
    "--output",
    paths.capacityJson,
    "--markdown",
    paths.capacityMarkdown,
    "--min-rows",
    String(options.minFinalRows),
    "--min-free-gb",
    String(options.minFreeGb),
  ];
  return {
    aiConfig: commandRecord(aiConfig),
    discovery: commandRecord(discovery),
    sourceManifest: commandRecord(sourceManifest),
    generateConfig: commandRecord(generateConfig),
    storagePreflight: commandRecord(storagePreflight),
    capacityPlan: commandRecord(capacityPlan),
  };
}

function runCommand(label, command) {
  const result = spawnSync(command.file, command.args, {
    cwd: root,
    encoding: "utf8",
    shell: false,
  });
  return {
    label,
    status: result.status ?? 1,
    error: result.error ? String(result.error.message ?? result.error) : null,
    stdout: trimOutput(result.stdout),
    stderr: trimOutput(result.stderr),
  };
}

function commandRecord(parts) {
  return {
    file: parts[0],
    args: parts.slice(1),
    powershell: parts.map(psQuote).join(" "),
  };
}

function skipped(reason) {
  return { label: "skipped", status: null, skipped: true, reason, stdout: "", stderr: "", error: null };
}

function summarizeRun(run) {
  return {
    status: run.status,
    skipped: Boolean(run.skipped),
    reason: run.reason ?? null,
    error: run.error ?? null,
    stdoutTail: tailLines(run.stdout, 8),
    stderrTail: tailLines(run.stderr, 8),
  };
}

function buildNextCommands(paths, options, ready) {
  const commands = [
    "pnpm ai:bridge-env -- --write",
    `pnpm ai:live-smoke -- --allow-network --require-live --output ${psQuote(options.aiLiveSmokePath)}`,
    `pnpm acceptance:validate-config -- --config ${psQuote(toDisplayPath(paths.generatedConfig))} --strict-terminal --check-existing-inputs`,
    `pnpm acceptance:terminal-config -- --config ${psQuote(toDisplayPath(paths.generatedConfig))}`,
  ];
  if (!ready) {
    return [
      "Export the full paper library to CSV, JSONL, NDJSON, BibTeX or RIS on the D drive.",
      `pnpm acceptance:prepare-terminal -- --root ${psQuote("D:\\papers")}`,
      ...commands,
    ];
  }
  return commands;
}

function renderMarkdown(result) {
  const storageTargets = result.storage?.targets?.length
    ? result.storage.targets.map((target) => `- ${target.name}: \`${target.path}\` (${target.driveLetter ?? "no drive"}, free=${formatGb(target.drive?.freeGb)})`).join("\n")
    : "- No storage targets were checked.";
  const recommendations = result.discovery?.recommendations?.length
    ? result.discovery.recommendations.map((item, index) => `${index + 1}. ${item}`).join("\n")
    : "None.";
  const aiRecommendations = result.aiConfig?.recommendations?.length
    ? result.aiConfig.recommendations.map((item, index) => `${index + 1}. ${item}`).join("\n")
    : "None.";
  const capacityWarnings = result.capacity?.warnings?.length
    ? result.capacity.warnings.map((item) => `- ${item}`).join("\n")
    : "- None.";
  const nextCommands = result.nextCommands.map((item) => (item.startsWith("pnpm ") ? `\`\`\`powershell\n${item}\n\`\`\`` : `- ${item}`)).join("\n\n");
  const configErrors = result.config?.validationErrors?.length
    ? result.config.validationErrors.map((item) => `- ${item}`).join("\n")
    : "- None.";
  return `# V20 Terminal Preparation

Generated: ${result.generatedAt}

- Ready for terminal config run: ${result.ready}
- Hard ready: ${result.hardReady}
- Require ready: ${result.requireReady}
- Require live AI config: ${result.requireLiveAiConfig}
- Scan roots: ${result.scanRoots.map((item) => `\`${item}\``).join(", ")}
- Minimum rows: ${result.minFinalRows}
- Discovery candidates: ${result.discovery?.candidateCount ?? "missing"}
- Final gate candidates: ${result.discovery?.finalGateCandidateCount ?? "missing"}

## Outputs

- Discovery JSON: \`${result.outputs.discoveryJson}\`
- Discovery Markdown: \`${result.outputs.discoveryMarkdown}\`
- Source manifest: \`${result.outputs.sourceManifestJson}\`
- Generated config: \`${result.outputs.generatedConfig}\`
- Config summary: \`${result.outputs.configSummary}\`
- Storage preflight: \`${result.outputs.storageJson}\`
- Capacity plan: \`${result.outputs.capacityJson}\`
- AI config preflight: \`${result.outputs.aiConfigJson}\`

## Gate Plan

- Status: ${result.discovery?.gatePlan?.status ?? "missing"}
- Summary: ${result.discovery?.gatePlan?.summary ?? "missing"}

## Config

- Passed: ${result.config?.passed ?? false}
- Source mode: ${result.config?.sourceMode ?? "missing"}
- Selected source: \`${result.config?.selectedSource?.filePath ?? "missing"}\`

Validation errors:

${configErrors}

## Source Manifest

- Passed: ${result.sourceManifest?.passed ?? false}
- Source: \`${result.sourceManifest?.source?.path ?? "missing"}\`
- SHA-256: \`${result.sourceManifest?.source?.sha256 ?? "missing"}\`
- Sample-like path: ${result.sourceManifest?.source?.sampleLike ?? "unknown"}

## Storage

- Passed: ${result.storage?.passed ?? false}

${storageTargets}

## Capacity

- Capacity ready: ${result.capacity?.capacityReady ?? false}
- Recommended free space: ${round(result.capacity?.recommendedFreeGb, 2) ?? "missing"} GB

Capacity warnings:

${capacityWarnings}

## AI Config

- Ready for live AI: ${result.aiConfig?.readyForLiveAi ?? false}
- API key status: ${result.aiConfig?.apiKeyStatus ?? "missing"}
- Base URL status: ${result.aiConfig?.baseUrlStatus ?? "missing"}
- Model status: ${result.aiConfig?.modelStatus ?? "missing"}

AI recommendations:

${aiRecommendations}

## Recommendations

${recommendations}

## Next Commands

${nextCommands}
`;
}

function readOption(name) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  return args[index + 1];
}

function readRepeated(name) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === name && args[index + 1]) values.push(args[index + 1]);
  }
  return values;
}

function isOptionValue(index) {
  if (index <= 0) return false;
  const previous = args[index - 1];
  return [
    "--root",
    "--discovery-root",
    "--discovery-output",
    "--discovery-markdown",
    "--source-manifest-output",
    "--source-manifest-markdown",
    "--config-output",
    "--config-summary-output",
    "--storage-output",
    "--capacity-output",
    "--capacity-markdown",
    "--ai-config-output",
    "--output",
    "--markdown",
    "--database-dir",
    "--converted-import-dir",
    "--ui-smoke",
    "--ai-live-smoke",
    "--min-final-rows",
    "--min-free-gb",
    "--max-files",
    "--sample-rows",
  ].includes(previous);
}

function readPositiveInt(name, fallback) {
  const value = readOption(name);
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer.`);
  return parsed;
}

function readNonNegativeNumber(name, fallback) {
  const value = readOption(name);
  if (!value) return fallback;
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${name} must be a non-negative number.`);
  return parsed;
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

function trimOutput(value) {
  return String(value ?? "").trim();
}

function tailLines(value, maxLines) {
  if (!value) return "";
  return value.split(/\r?\n/).slice(-maxLines).join("\n");
}

function toDisplayPath(filePath) {
  return path.relative(root, filePath).startsWith("..") ? filePath : path.relative(root, filePath);
}

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function formatGb(value) {
  return typeof value === "number" ? `${value.toFixed(2)} GB` : "unknown";
}

function round(value, places) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function printHelp() {
  console.log(`
Usage:
  node scripts/v20_terminal_prepare.mjs --root D:\\papers

Options:
  --root <dir>                  Directory to scan. Repeatable.
  --discovery-root <dir>        Fallback scan root when --root is omitted.
  --min-final-rows <number>     Final source threshold. Defaults to 100000.
  --database-dir <path>         Final SQLite directory on D drive.
  --converted-import-dir <path> BibTeX/RIS conversion directory on D drive.
  --ui-smoke <path>             UI smoke evidence path.
  --ai-live-smoke <path>        Live AI smoke evidence path.
  --source-manifest-output <path> Source fingerprint JSON path.
  --source-manifest-markdown <path> Source fingerprint Markdown path.
  --ai-config-output <path>     Read-only AI config preflight report path.
  --capacity-output <path>      Capacity plan JSON path.
  --capacity-markdown <path>    Capacity plan Markdown path.
  --min-free-gb <number>        Strict storage free-space threshold. Defaults to 10.
  --require-ready               Exit non-zero when no terminal-ready source/config/storage chain is found.
  --require-live-ai-config      Also require VITE_DEEPSEEK_* live AI config during preparation.
  --no-launch-exe               Generate a config that skips the final exe launch smoke.

The script runs AI config preflight, discovery, source fingerprinting, strict config generation, storage preflight, capacity planning when possible, and writes a preparation summary.
`.trim());
}
