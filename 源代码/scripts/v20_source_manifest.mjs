import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const outputDir = path.join(root, "outputs");
const args = process.argv.slice(2).filter((arg) => arg !== "--");

const SAMPLE_PATH_PATTERN = /(^|[\\/])(data[\\/]samples|samples)([\\/]|$)|sample|demo|fixture/i;

if (args.includes("--help") || args.includes("-h")) {
  printHelp();
  process.exit(0);
}

const sourcePathArg = readOption("--source");
const discoveryPath = path.resolve(readOption("--discovery") || path.join(outputDir, "v20_real_data_discovery.json"));
const outputPath = path.resolve(readOption("--output") || path.join(outputDir, "v20_source_manifest.json"));
const markdownPath = path.resolve(readOption("--markdown") || path.join(outputDir, "V20_SOURCE_MANIFEST.md"));
const minRows = readPositiveInt("--min-rows", 100000);
const estimatedRowsOverride = readOptionalPositiveInt("--estimated-rows");
const requireTerminalSource = args.includes("--require-terminal-source");

await mkdir(path.dirname(outputPath), { recursive: true });
await mkdir(path.dirname(markdownPath), { recursive: true });

const discovery = await readJsonIfExists(discoveryPath);
const selectedSource = sourcePathArg
  ? { filePath: path.resolve(sourcePathArg), selectedBy: "cli", estimatedRows: estimatedRowsOverride }
  : selectSourceFromDiscovery(discovery, minRows);
const result = await buildManifest({ selectedSource, discovery, minRows, requireTerminalSource });

await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
await writeFile(markdownPath, renderMarkdown(result), "utf8");

console.log(`Source manifest completed: passed=${result.passed}, source=${result.source?.path ?? "missing"}`);
console.log(`JSON: ${outputPath}`);
console.log(`Markdown: ${markdownPath}`);
if (result.warnings.length) {
  console.log("Warnings:");
  for (const warning of result.warnings) console.log(`- ${warning}`);
}
if (result.errors.length) {
  console.error("Errors:");
  for (const error of result.errors) console.error(`- ${error}`);
  process.exit(1);
}

async function buildManifest({ selectedSource, discovery, minRows, requireTerminalSource }) {
  const warnings = [];
  const errors = [];
  if (!selectedSource?.filePath) {
    warnings.push("No source file was selected from discovery.");
    if (requireTerminalSource) errors.push("A terminal source manifest requires a selected source file.");
    return {
      generatedAt: new Date().toISOString(),
      projectRoot: root,
      discoveryPath,
      minRows,
      requireTerminalSource,
      passed: errors.length === 0,
      source: null,
      discoverySummary: summarizeDiscovery(discovery),
      warnings,
      errors,
    };
  }

  const sourcePath = path.resolve(selectedSource.filePath);
  let info = null;
  try {
    info = await stat(sourcePath);
  } catch (error) {
    errors.push(`Selected source does not exist or cannot be read: ${sourcePath}. ${error.message}`);
  }

  const fingerprint = info?.isFile() ? await hashFile(sourcePath) : null;
  const estimatedRows = selectedSource.estimatedRows ?? null;
  const sampleLike = SAMPLE_PATH_PATTERN.test(sourcePath);
  const terminalCandidate = Boolean(estimatedRows !== null && estimatedRows >= minRows && !sampleLike && fingerprint?.sha256);
  if (sampleLike) warnings.push("Selected source path looks like sample/demo/fixture data.");
  if (estimatedRows !== null && estimatedRows < minRows) warnings.push(`Selected source estimated rows ${estimatedRows} is below terminal target ${minRows}.`);
  if (!fingerprint?.sha256) warnings.push("No SHA-256 fingerprint was produced.");
  if (requireTerminalSource && !terminalCandidate) {
    errors.push("Selected source does not satisfy terminal-source requirements: non-sample path, enough estimated rows, and SHA-256 fingerprint.");
  }

  return {
    generatedAt: new Date().toISOString(),
    projectRoot: root,
    discoveryPath,
    minRows,
    requireTerminalSource,
    passed: errors.length === 0,
    source: {
      path: sourcePath,
      selectedBy: selectedSource.selectedBy ?? "discovery",
      extension: selectedSource.extension ?? path.extname(sourcePath).replace(/^\./, "").toLowerCase(),
      sizeBytes: info?.size ?? null,
      sizeMb: info ? round(info.size / 1024 / 1024, 3) : null,
      modifiedAt: info?.mtime?.toISOString?.() ?? null,
      estimatedRows,
      finalGateCandidate: Boolean(selectedSource.finalGateCandidate),
      conversionSupported: Boolean(selectedSource.conversionSupported || ["bib", "ris"].includes(selectedSource.extension)),
      sampleLike,
      terminalCandidate,
      sha256: fingerprint?.sha256 ?? null,
      hashElapsedMs: fingerprint?.elapsedMs ?? null,
    },
    discoverySummary: summarizeDiscovery(discovery),
    warnings,
    errors,
  };
}

function selectSourceFromDiscovery(discovery, minRows) {
  if (!discovery || typeof discovery !== "object") return null;
  const plan = discovery.gatePlan && typeof discovery.gatePlan === "object" ? discovery.gatePlan : null;
  if (["ready_source_found", "conversion_ready_source_found"].includes(plan?.status) && plan.selectedSource?.filePath) {
    return {
      ...plan.selectedSource,
      selectedBy: "gatePlan",
      conversionSupported: plan.status === "conversion_ready_source_found",
    };
  }
  const candidates = Array.isArray(discovery.candidates) ? discovery.candidates : [];
  const finalCandidate = candidates.find((candidate) => candidate.finalGateCandidate && candidate.filePath);
  if (finalCandidate) return { ...finalCandidate, selectedBy: "finalGateCandidate" };
  const largeConvertible = candidates.find((candidate) => candidate.conversionSupported && (candidate.estimatedRows ?? 0) >= minRows && candidate.filePath);
  if (largeConvertible) return { ...largeConvertible, selectedBy: "largeConvertible" };
  const bestCandidate = discovery.bestCandidate?.filePath ? discovery.bestCandidate : null;
  return bestCandidate ? { ...bestCandidate, selectedBy: "bestCandidate" } : null;
}

function summarizeDiscovery(discovery) {
  if (!discovery) return null;
  return {
    generatedAt: discovery.generatedAt ?? null,
    candidateCount: discovery.candidateCount ?? null,
    finalGateCandidateCount: discovery.finalGateCandidateCount ?? null,
    gatePlanStatus: discovery.gatePlan?.status ?? null,
    scanRoots: discovery.scanRoots ?? [],
  };
}

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => {
      resolve({ sha256: hash.digest("hex"), elapsedMs: Date.now() - startedAt });
    });
  });
}

function renderMarkdown(result) {
  const warnings = result.warnings.length ? result.warnings.map((item) => `- ${item}`).join("\n") : "- None.";
  const errors = result.errors.length ? result.errors.map((item) => `- ${item}`).join("\n") : "- None.";
  return `# V20 Source Manifest

Generated: ${result.generatedAt}

- Passed: ${result.passed}
- Source: \`${result.source?.path ?? "missing"}\`
- SHA-256: \`${result.source?.sha256 ?? "missing"}\`
- Size: ${result.source?.sizeMb ?? "missing"} MB
- Estimated rows: ${result.source?.estimatedRows ?? "unknown"}
- Sample-like path: ${result.source?.sampleLike ?? "unknown"}
- Terminal candidate: ${result.source?.terminalCandidate ?? false}

## Discovery

- Discovery report: \`${discoveryPath}\`
- Candidate files: ${result.discoverySummary?.candidateCount ?? "missing"}
- Final gate candidates: ${result.discoverySummary?.finalGateCandidateCount ?? "missing"}
- Gate plan: ${result.discoverySummary?.gatePlanStatus ?? "missing"}

## Warnings

${warnings}

## Errors

${errors}
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

function readOptionalPositiveInt(name) {
  const value = readOption(name);
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer.`);
  return parsed;
}

function round(value, places) {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function printHelp() {
  console.log(`
Usage:
  node scripts/v20_source_manifest.mjs --discovery outputs/v20_real_data_discovery.json
  node scripts/v20_source_manifest.mjs --source D:\\papers\\library.jsonl --require-terminal-source

Options:
  --source <path>              Source file to fingerprint. Overrides discovery selection.
  --discovery <path>           Real-data discovery JSON.
  --output <path>              Source manifest JSON.
  --markdown <path>            Source manifest Markdown.
  --min-rows <number>          Terminal row target. Defaults to 100000.
  --estimated-rows <number>    Estimated or preflight-proven row count when --source is used.
  --require-terminal-source    Exit non-zero unless the selected source is non-sample, large enough, and hashed.
`.trim());
}
