import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const outputDir = path.join(root, "outputs");
const args = process.argv.slice(2).filter((arg) => arg !== "--");

const DEFAULT_MIN_ROWS = 100000;
const DEFAULT_MIN_FREE_GB = 10;
const MIN_ROW_BYTES = 2048;
const SQLITE_BYTES_PER_ROW = 4096;
const EXPORT_BYTES_PER_ROW = 512;
const REPORT_AND_SCREENSHOT_BYTES = 512 * 1024 * 1024;
const SAFETY_MULTIPLIER = 1.35;

if (args.includes("--help") || args.includes("-h")) {
  printHelp();
  process.exit(0);
}

const discoveryPath = path.resolve(readOption("--discovery") || path.join(outputDir, "v20_real_data_discovery.json"));
const storagePath = path.resolve(readOption("--storage") || path.join(outputDir, "v20_storage_preflight.json"));
const outputPath = path.resolve(readOption("--output") || path.join(outputDir, "v20_capacity_plan.json"));
const markdownPath = path.resolve(readOption("--markdown") || path.join(outputDir, "V20_CAPACITY_PLAN.md"));
const minRows = readPositiveInt("--min-rows", DEFAULT_MIN_ROWS);
const minFreeGb = readNonNegativeNumber("--min-free-gb", DEFAULT_MIN_FREE_GB);
const requireCapacity = args.includes("--require-capacity");

await mkdir(path.dirname(outputPath), { recursive: true });
await mkdir(path.dirname(markdownPath), { recursive: true });

const discovery = await readJsonIfExists(discoveryPath);
const storage = await readJsonIfExists(storagePath);
const selectedSource = selectSource(discovery, minRows);
const estimate = buildEstimate(selectedSource, minRows);
const storageAssessment = assessStorage(storage, estimate, minFreeGb);
const warnings = buildWarnings({ discovery, selectedSource, estimate, storageAssessment, minRows });
const errors = [];
if (requireCapacity) {
  if (!selectedSource?.filePath) errors.push("No source candidate is available for capacity planning.");
  if (!estimate.meetsMinRows) errors.push(`Selected source is below the ${minRows}+ row terminal target.`);
  if (!storageAssessment.capacityReady) errors.push("Storage targets do not prove enough free space for the estimated terminal run.");
}

const result = {
  generatedAt: new Date().toISOString(),
  projectRoot: root,
  discoveryPath,
  storagePath,
  minRows,
  minFreeGb,
  requireCapacity,
  passed: errors.length === 0,
  capacityReady: storageAssessment.capacityReady,
  selectedSource,
  estimate,
  storageAssessment,
  warnings,
  errors,
  recommendations: buildRecommendations({ estimate, storageAssessment, warnings }),
};

await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
await writeFile(markdownPath, renderMarkdown(result), "utf8");

console.log(
  `Capacity plan completed: passed=${result.passed}, capacityReady=${result.capacityReady}, recommended=${formatGb(estimate.recommendedFreeBytes)}`,
);
console.log(`JSON: ${outputPath}`);
console.log(`Markdown: ${markdownPath}`);
if (warnings.length) {
  console.log("Warnings:");
  for (const warning of warnings) console.log(`- ${warning}`);
}
if (errors.length) {
  console.error("Errors:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

function selectSource(discovery, minRows) {
  if (!discovery || typeof discovery !== "object") return null;
  const gateSource = discovery.gatePlan?.selectedSource?.filePath ? discovery.gatePlan.selectedSource : null;
  const finalCandidate = Array.isArray(discovery.candidates)
    ? discovery.candidates.find((candidate) => candidate.finalGateCandidate && candidate.filePath)
    : null;
  const largeConvertible = Array.isArray(discovery.candidates)
    ? discovery.candidates.find((candidate) => candidate.conversionSupported && (candidate.estimatedRows ?? 0) >= minRows && candidate.filePath)
    : null;
  const bestCandidate = discovery.bestCandidate?.filePath ? discovery.bestCandidate : null;
  const source = finalCandidate ?? largeConvertible ?? gateSource ?? bestCandidate;
  if (!source) return null;
  return {
    filePath: source.filePath,
    extension: source.extension ?? path.extname(source.filePath).replace(/^\./, "").toLowerCase(),
    sizeBytes: Number(source.sizeBytes ?? ((source.sizeMb ?? 0) * 1024 * 1024)),
    sizeMb: source.sizeMb ?? null,
    estimatedRows: source.estimatedRows ?? null,
    finalGateCandidate: Boolean(source.finalGateCandidate),
    conversionSupported: Boolean(source.conversionSupported || ["bib", "ris"].includes(source.extension)),
    recommendation: source.recommendation ?? null,
  };
}

function buildEstimate(source, minRows) {
  const rows = Math.max(minRows, Number(source?.estimatedRows ?? 0) || minRows);
  const sourceBytes = Math.max(0, Number(source?.sizeBytes ?? ((source?.sizeMb ?? 0) * 1024 * 1024)));
  const averageRowBytes = sourceBytes && source?.estimatedRows ? Math.max(MIN_ROW_BYTES, sourceBytes / source.estimatedRows) : MIN_ROW_BYTES;
  const normalizedSourceBytes = Math.max(sourceBytes, rows * averageRowBytes);
  const convertedJsonlBytes = source?.conversionSupported ? Math.max(normalizedSourceBytes * 3, rows * MIN_ROW_BYTES) : 0;
  const sqliteBytes = Math.max(normalizedSourceBytes * 2.5, rows * SQLITE_BYTES_PER_ROW);
  const backupBytes = sqliteBytes;
  const exportBytes = rows * EXPORT_BYTES_PER_ROW + REPORT_AND_SCREENSHOT_BYTES;
  const workingBytes = convertedJsonlBytes + sqliteBytes + backupBytes + exportBytes;
  const recommendedFreeBytes = Math.ceil(workingBytes * SAFETY_MULTIPLIER);
  return {
    rows,
    meetsMinRows: Number(source?.estimatedRows ?? rows) >= minRows,
    sourceBytes,
    averageRowBytes,
    normalizedSourceBytes,
    convertedJsonlBytes,
    sqliteBytes,
    backupBytes,
    exportBytes,
    workingBytes,
    recommendedFreeBytes,
    recommendedFreeGb: bytesToGb(recommendedFreeBytes),
    minimumPolicyFreeGb: Math.max(DEFAULT_MIN_FREE_GB, bytesToGb(recommendedFreeBytes)),
    assumptions: {
      minRowBytes: MIN_ROW_BYTES,
      sqliteBytesPerRow: SQLITE_BYTES_PER_ROW,
      exportBytesPerRow: EXPORT_BYTES_PER_ROW,
      reportAndScreenshotBytes: REPORT_AND_SCREENSHOT_BYTES,
      safetyMultiplier: SAFETY_MULTIPLIER,
    },
  };
}

function assessStorage(storage, estimate, minFreeGb) {
  const targets = Array.isArray(storage?.targets) ? storage.targets : [];
  const largeTargets = targets.filter((target) => target.largeWrite);
  const requiredGb = Math.max(minFreeGb, estimate.recommendedFreeGb);
  const targetAssessments = largeTargets.map((target) => {
    const freeGb = Number(target.drive?.freeGb ?? NaN);
    return {
      name: target.name,
      path: target.path,
      driveLetter: target.driveLetter ?? null,
      freeGb: Number.isFinite(freeGb) ? freeGb : null,
      requiredGb,
      ready: Number.isFinite(freeGb) && freeGb >= requiredGb && String(target.driveLetter ?? "").toUpperCase() !== "C",
    };
  });
  const capacityReady =
    targetAssessments.length > 0 &&
    targetAssessments.every((target) => target.ready) &&
    storage?.passed !== false;
  return {
    storageReportAvailable: Boolean(storage),
    storagePassed: storage?.passed ?? null,
    requiredGb,
    targets: targetAssessments,
    capacityReady,
  };
}

function buildWarnings({ discovery, selectedSource, estimate, storageAssessment, minRows }) {
  const warnings = [];
  if (!discovery) warnings.push("Discovery report is missing; capacity planning is based on defaults only.");
  if (!selectedSource) warnings.push("No source candidate is available; estimate uses default 100000-row assumptions.");
  if (selectedSource && !estimate.meetsMinRows) warnings.push(`Selected source has fewer than ${minRows} estimated rows; this cannot prove terminal completion.`);
  if (!storageAssessment.storageReportAvailable) warnings.push("Storage preflight report is missing.");
  for (const target of storageAssessment.targets) {
    if (!target.ready) warnings.push(`${target.name} is not capacity-ready: drive=${target.driveLetter ?? "missing"}, free=${target.freeGb ?? "missing"} GB, required=${round(target.requiredGb, 2)} GB.`);
  }
  return warnings;
}

function buildRecommendations({ estimate, storageAssessment, warnings }) {
  const recommendations = [
    `Reserve at least ${round(estimate.recommendedFreeGb, 2)} GB free on the database/import drive before final 100000+ acceptance.`,
    "Keep SQLite database, bibliography conversion output, backups, and report exports on D drive.",
  ];
  if (!storageAssessment.capacityReady) {
    recommendations.push("Run storage preflight after generating the real terminal config, then rerun this capacity plan with --require-capacity.");
  }
  if (warnings.some((warning) => warning.includes("fewer than"))) {
    recommendations.push("Use the full real export rather than sample data before final acceptance.");
  }
  return recommendations;
}

function renderMarkdown(result) {
  const targets = result.storageAssessment.targets.length
    ? result.storageAssessment.targets
        .map((target) => `| ${target.ready ? "yes" : "no"} | ${target.name} | ${target.driveLetter ?? ""} | ${round(target.freeGb, 2) ?? ""} | ${round(target.requiredGb, 2)} | \`${target.path}\` |`)
        .join("\n")
    : "| no | No large-write targets found |  |  |  |  |";
  const warnings = result.warnings.length ? result.warnings.map((item) => `- ${item}`).join("\n") : "- None.";
  const recommendations = result.recommendations.length ? result.recommendations.map((item) => `- ${item}`).join("\n") : "- None.";
  return `# V20 Capacity Plan

Generated: ${result.generatedAt}

- Passed: ${result.passed}
- Capacity ready: ${result.capacityReady}
- Selected source: \`${result.selectedSource?.filePath ?? "missing"}\`
- Estimated rows: ${result.estimate.rows}
- Recommended free space: ${round(result.estimate.recommendedFreeGb, 2)} GB

## Estimate

| Item | GB |
|---|---:|
| Normalized source | ${round(bytesToGb(result.estimate.normalizedSourceBytes), 2)} |
| Converted JSONL | ${round(bytesToGb(result.estimate.convertedJsonlBytes), 2)} |
| SQLite database | ${round(bytesToGb(result.estimate.sqliteBytes), 2)} |
| Backup copy | ${round(bytesToGb(result.estimate.backupBytes), 2)} |
| Exports/reports | ${round(bytesToGb(result.estimate.exportBytes), 2)} |
| Working total | ${round(bytesToGb(result.estimate.workingBytes), 2)} |
| Recommended with safety | ${round(result.estimate.recommendedFreeGb, 2)} |

## Storage Targets

| Ready | Target | Drive | Free GB | Required GB | Path |
|---|---|---:|---:|---:|---|
${targets}

## Warnings

${warnings}

## Recommendations

${recommendations}
`;
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return null;
  }
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

function readNonNegativeNumber(name, fallback) {
  const value = readOption(name);
  if (!value) return fallback;
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${name} must be a non-negative number.`);
  return parsed;
}

function bytesToGb(value) {
  return value / 1024 ** 3;
}

function formatGb(value) {
  return `${round(bytesToGb(value), 2)} GB`;
}

function round(value, places) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function printHelp() {
  console.log(`
Usage:
  node scripts/v20_capacity_plan.mjs --discovery outputs/v20_real_data_discovery.json --storage outputs/v20_storage_preflight.json

Options:
  --discovery <path>       Real-data discovery JSON.
  --storage <path>         Storage preflight JSON.
  --output <path>          Capacity plan JSON.
  --markdown <path>        Capacity plan Markdown.
  --min-rows <number>      Terminal row target. Defaults to 100000.
  --min-free-gb <number>   Minimum free-space policy floor. Defaults to 10.
  --require-capacity       Exit non-zero unless selected source and storage are capacity-ready.
`.trim());
}
