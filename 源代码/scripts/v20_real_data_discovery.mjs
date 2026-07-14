import { createReadStream } from "node:fs";
import { access, mkdir, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const outputDir = path.join(root, "outputs");

const SUPPORTED_SOURCE_EXTENSIONS = new Set([".csv", ".json", ".jsonl", ".ndjson"]);
const CONVERTIBLE_SOURCE_EXTENSIONS = new Set([".bib", ".ris"]);
const DISCOVERY_EXTENSIONS = new Set([
  ".csv",
  ".json",
  ".jsonl",
  ".ndjson",
  ".bib",
  ".ris",
  ".db",
  ".sqlite",
  ".sqlite3",
]);
const SKIPPED_DIRS = new Set([
  ".git",
  ".idea",
  "__pycache__",
  "capabilities",
  "dist",
  "gen",
  "node_modules",
  "outputs",
  "target",
  "target-codex-build",
]);
const SKIPPED_FILE_NAMES = new Set([
  "package.json",
  "tsconfig.json",
  "tsconfig.app.json",
  "tsconfig.node.json",
  "tauri.conf.json",
  "desktop-schema.json",
  "windows-schema.json",
  "capabilities.json",
  "acl-manifests.json",
  ".rustc_info.json",
]);
const DEFAULT_SAMPLE_ROWS = 200;
const DEFAULT_MAX_FILES = 5000;
const DEFAULT_MIN_FINAL_ROWS = 100000;
const DEFAULT_ACCEPTANCE_DATABASE_DIR = "D:\\ResearchHotspotsDesktop\\library";
const DEFAULT_CONVERTED_IMPORT_DIR = "D:\\ResearchHotspotsDesktop\\imports";

const FIELD_ALIASES = {
  title: ["title", "name", "display_name", "paper_title", "\u9898\u540d", "\u6807\u9898", "\u8bba\u6587\u6807\u9898", "\u6587\u732e\u6807\u9898"],
  abstract: ["abstract", "summary", "description", "\u6458\u8981", "\u7b80\u4ecb", "\u5185\u5bb9\u6458\u8981"],
  year: ["year", "publication_year", "published_year", "date", "published", "\u53d1\u8868\u5e74\u4efd", "\u5e74\u4efd", "\u51fa\u7248\u5e74"],
  source: ["source", "database", "platform", "\u6765\u6e90", "\u6570\u636e\u6e90"],
  field: ["field", "discipline", "subject", "category", "\u5b66\u79d1", "\u9886\u57df", "\u5206\u7c7b"],
  doi: ["doi", "DOI"],
  url: ["url", "link", "landing_page_url", "pdf_url", "\u94fe\u63a5", "\u7f51\u5740"],
  authors: ["authors", "author", "creator", "\u4f5c\u8005", "\u4f5c\u8005\u5217\u8868"],
  categories: ["categories", "keywords", "concepts", "tags", "\u5173\u952e\u8bcd", "\u4e3b\u9898\u8bcd"],
};

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  printHelp();
  process.exit(0);
}

const roots = readRepeated("--root");
const positionalRoots = args.filter((arg, index) => !arg.startsWith("--") && !isOptionValue(index));
const scanRoots = [...roots, ...positionalRoots].map((item) => path.resolve(item));
if (scanRoots.length === 0) scanRoots.push(root);

const outputJson = path.resolve(readOption("--output") || path.join(outputDir, "v20_real_data_discovery.json"));
const outputMarkdown = path.resolve(readOption("--markdown") || path.join(outputDir, "V20_REAL_DATA_DISCOVERY.md"));
const sampleRows = readPositiveInt("--sample-rows", DEFAULT_SAMPLE_ROWS);
const maxFiles = readPositiveInt("--max-files", DEFAULT_MAX_FILES);
const minFinalRows = readPositiveInt("--min-final-rows", DEFAULT_MIN_FINAL_ROWS);
const includeBuildArtifacts = args.includes("--include-build-artifacts");

await mkdir(path.dirname(outputJson), { recursive: true });
await mkdir(path.dirname(outputMarkdown), { recursive: true });

const startedAt = Date.now();
const files = [];
const scanWarnings = [];
for (const scanRoot of scanRoots) {
  if (!(await exists(scanRoot))) {
    scanWarnings.push(`Scan root does not exist: ${scanRoot}`);
    continue;
  }
  await collectFiles(scanRoot, files, { includeBuildArtifacts, maxFiles, scanWarnings });
  if (files.length >= maxFiles) break;
}

const candidates = [];
for (const filePath of files) {
  try {
    candidates.push(await inspectCandidate(filePath, { sampleRows, minFinalRows }));
  } catch (error) {
    candidates.push({
      filePath,
      fileName: path.basename(filePath),
      extension: path.extname(filePath).toLowerCase().replace(/^\./, ""),
      status: "inspect_failed",
      error: String(error?.message ?? error),
    });
  }
}

candidates.sort(compareCandidates);

const finalGateReady = candidates.filter((item) => item.finalGateCandidate);
const preflightReady = candidates.filter((item) => item.preflightSupported);
const conversionReady = candidates.filter((item) => item.conversionSupported);
const gatePlan = buildGatePlan({ finalGateReady, preflightReady, conversionReady, minFinalRows });
const result = {
  generatedAt: new Date().toISOString(),
  projectRoot: root,
  scanRoots,
  settings: {
    sampleRows,
    maxFiles,
    minFinalRows,
    includeBuildArtifacts,
  },
  scannedFileCount: files.length,
  candidateCount: candidates.length,
  preflightSupportedCount: preflightReady.length,
  conversionSupportedCount: conversionReady.length,
  finalGateCandidateCount: finalGateReady.length,
  bestCandidate: candidates[0] ?? null,
  gatePlan,
  warnings: scanWarnings,
  recommendations: buildRecommendations({ candidates, finalGateReady, preflightReady, conversionReady, minFinalRows, gatePlan }),
  candidates,
  elapsedMs: Date.now() - startedAt,
};

await writeFile(outputJson, `${JSON.stringify(result, null, 2)}\n`, "utf8");
await writeFile(outputMarkdown, renderMarkdown(result), "utf8");

console.log(`Real data discovery completed: candidates=${result.candidateCount}, finalGateCandidates=${result.finalGateCandidateCount}`);
console.log(`JSON: ${outputJson}`);
console.log(`Markdown: ${outputMarkdown}`);
if (result.recommendations.length > 0) {
  console.log("Recommendations:");
  for (const item of result.recommendations) console.log(`- ${item}`);
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

function readPositiveInt(name, fallback) {
  const value = readOption(name);
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer.`);
  return parsed;
}

function isOptionValue(index) {
  if (index <= 0) return false;
  const previous = args[index - 1];
  return ["--root", "--output", "--markdown", "--sample-rows", "--max-files", "--min-final-rows"].includes(previous);
}

function printHelp() {
  console.log(`
Usage:
  node scripts/v20_real_data_discovery.mjs [--root <dir>] [--output outputs/v20_real_data_discovery.json] [--markdown outputs/V20_REAL_DATA_DISCOVERY.md]

Examples:
  node scripts/v20_real_data_discovery.mjs --root D:\\papers --root D:\\wenjian\\Desktop\\个人知识库
  node scripts/v20_real_data_discovery.mjs D:\\papers --min-final-rows 100000 --sample-rows 500

This script is read-only. It discovers candidate paper-library files for the final real-data acceptance gate.
`.trim());
}

async function collectFiles(dirPath, files, options) {
  if (files.length >= options.maxFiles) return;
  let entries = [];
  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch (error) {
    options.scanWarnings.push(`Cannot read directory ${dirPath}: ${error.message}`);
    return;
  }

  for (const entry of entries) {
    if (files.length >= options.maxFiles) return;
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (!options.includeBuildArtifacts && SKIPPED_DIRS.has(entry.name)) continue;
      await collectFiles(fullPath, files, options);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!options.includeBuildArtifacts && SKIPPED_FILE_NAMES.has(entry.name)) continue;
    const extension = path.extname(entry.name).toLowerCase();
    if (DISCOVERY_EXTENSIONS.has(extension)) files.push(fullPath);
  }
}

async function inspectCandidate(filePath, options) {
  const info = await stat(filePath);
  const extensionWithDot = path.extname(filePath).toLowerCase();
  const extension = extensionWithDot.replace(/^\./, "");
  const base = {
    filePath,
    fileName: path.basename(filePath),
    extension,
    sizeBytes: info.size,
    sizeMb: round(info.size / 1024 / 1024, 3),
    preflightSupported: SUPPORTED_SOURCE_EXTENSIONS.has(extensionWithDot),
    conversionSupported: CONVERTIBLE_SOURCE_EXTENSIONS.has(extensionWithDot),
    finalGateCandidate: false,
  };

  if (extensionWithDot === ".jsonl" || extensionWithDot === ".ndjson") {
    return { ...base, ...(await inspectJsonLines(filePath, options)) };
  }
  if (extensionWithDot === ".csv") {
    return { ...base, ...(await inspectCsv(filePath, options)) };
  }
  if (extensionWithDot === ".json") {
    return { ...base, ...(await inspectJson(filePath, options)) };
  }
  if (extensionWithDot === ".bib") {
    return { ...base, ...(await inspectPatternEntries(filePath, /^@\w+\s*\{/i, options, "BibTeX entries")) };
  }
  if (extensionWithDot === ".ris") {
    return { ...base, ...(await inspectPatternEntries(filePath, /^TY\s+-/i, options, "RIS entries")) };
  }
  return {
    ...base,
    estimatedRows: null,
    sampleRows: 0,
    titleCoverage: null,
    status: "sqlite_or_database_file",
    recommendation: "Audit this file with the Rust SQLite audit tool if it is a project database.",
  };
}

async function inspectJsonLines(filePath, options) {
  let estimatedRows = 0;
  let sampleCount = 0;
  let invalidSampleRows = 0;
  const coverage = emptyCoverage();
  const stream = createReadStream(filePath, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    const text = line.trim();
    if (!text) continue;
    estimatedRows += 1;
    if (sampleCount < options.sampleRows) {
      sampleCount += 1;
      try {
        const row = JSON.parse(text);
        if (isRecord(row)) updateCoverage(coverage, row);
        else invalidSampleRows += 1;
      } catch {
        invalidSampleRows += 1;
      }
    }
  }
  return finalizeStructuredInspection({ estimatedRows, sampleCount, invalidSampleRows, coverage, options });
}

async function inspectCsv(filePath, options) {
  let estimatedRows = 0;
  let sampleCount = 0;
  let invalidSampleRows = 0;
  let keys = null;
  const coverage = emptyCoverage();
  const stream = createReadStream(filePath, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    if (!keys) {
      keys = parseCsvLine(line).map((item) => normalizeKey(item));
      continue;
    }
    estimatedRows += 1;
    if (sampleCount < options.sampleRows) {
      sampleCount += 1;
      const values = parseCsvLine(line);
      const row = {};
      values.forEach((value, index) => {
        row[keys[index] || `col${index}`] = value;
      });
      if (Object.keys(row).length === 0) invalidSampleRows += 1;
      else updateCoverage(coverage, row);
    }
  }
  return finalizeStructuredInspection({ estimatedRows, sampleCount, invalidSampleRows, coverage, options });
}

async function inspectJson(filePath, options) {
  const info = await stat(filePath);
  if (info.size > 80 * 1024 * 1024) {
    return {
      estimatedRows: null,
      sampleRows: 0,
      titleCoverage: null,
      status: "large_json_not_parsed",
      recommendation: "Convert large JSON arrays to JSONL/NDJSON before final import and preflight.",
    };
  }
  const value = JSON.parse(await readFile(filePath, "utf8"));
  const rows = extractJsonRows(value);
  const coverage = emptyCoverage();
  const sample = rows.slice(0, options.sampleRows);
  for (const row of sample) updateCoverage(coverage, row);
  return finalizeStructuredInspection({
    estimatedRows: rows.length,
    sampleCount: sample.length,
    invalidSampleRows: 0,
    coverage,
    options,
    recommendation: rows.length >= options.minFinalRows ? "JSON arrays work, but JSONL is safer for very large imports." : null,
  });
}

async function inspectPatternEntries(filePath, pattern, options, label) {
  let estimatedRows = 0;
  const stream = createReadStream(filePath, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    if (pattern.test(line.trim())) estimatedRows += 1;
  }
  const likelyLargeEnough = estimatedRows >= options.minFinalRows;
  return {
    estimatedRows,
    sampleRows: 0,
    titleCoverage: null,
    abstractCoverage: null,
    yearCoverage: null,
    doiOrUrlCoverage: null,
    invalidSampleRate: null,
    status: likelyLargeEnough ? "large_bibliography_candidate" : "bibliography_candidate",
    finalGateCandidate: false,
    recommendation: `${label} detected. Convert with pnpm convert:bibliography -- "${filePath}" --output D:\\papers\\library.jsonl, then run real-library preflight.`,
  };
}

function finalizeStructuredInspection({ estimatedRows, sampleCount, invalidSampleRows, coverage, options, recommendation = null }) {
  const titleCoverage = rate(coverage.title, sampleCount);
  const abstractCoverage = rate(coverage.abstract, sampleCount);
  const yearCoverage = rate(coverage.year, sampleCount);
  const doiOrUrlCoverage = rate(coverage.doiOrUrl, sampleCount);
  const invalidSampleRate = rate(invalidSampleRows, sampleCount);
  const finalGateCandidate = estimatedRows >= options.minFinalRows && titleCoverage >= 0.7 && invalidSampleRate <= 0.2;
  return {
    estimatedRows,
    sampleRows: sampleCount,
    titleCoverage,
    abstractCoverage,
    yearCoverage,
    doiOrUrlCoverage,
    invalidSampleRate,
    status: finalGateCandidate ? "final_gate_candidate" : "structured_candidate",
    finalGateCandidate,
    recommendation: recommendation || structuredRecommendation({ estimatedRows, titleCoverage, abstractCoverage, yearCoverage, invalidSampleRate, options }),
  };
}

function emptyCoverage() {
  return { title: 0, abstract: 0, year: 0, doiOrUrl: 0 };
}

function updateCoverage(coverage, row) {
  const title = pick(row, FIELD_ALIASES.title);
  const abstract = pick(row, FIELD_ALIASES.abstract);
  const year = pick(row, FIELD_ALIASES.year);
  const doi = pick(row, FIELD_ALIASES.doi);
  const url = pick(row, FIELD_ALIASES.url);
  if (title) coverage.title += 1;
  if (abstract) coverage.abstract += 1;
  if (/^\d{4}/.test(year)) coverage.year += 1;
  if (doi || url) coverage.doiOrUrl += 1;
}

function pick(row, keys) {
  if (!isRecord(row)) return "";
  const normalizedRow = new Map(Object.entries(row).map(([key, value]) => [normalizeKey(key), stringifyValue(value)]));
  for (const key of keys) {
    const value = normalizedRow.get(normalizeKey(key));
    if (value && value.trim()) return value.trim();
  }
  return "";
}

function stringifyValue(value) {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return value.map(stringifyValue).filter(Boolean).join("; ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function normalizeKey(value) {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[\s\-]+/g, "_");
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

function extractJsonRows(value) {
  if (Array.isArray(value)) return value.filter(isRecord);
  if (isRecord(value)) {
    for (const key of ["papers", "data", "items", "results", "records"]) {
      if (Array.isArray(value[key])) return value[key].filter(isRecord);
    }
    return [value];
  }
  return [];
}

function structuredRecommendation({ estimatedRows, titleCoverage, abstractCoverage, yearCoverage, invalidSampleRate, options }) {
  if (estimatedRows < options.minFinalRows) return `Below final target: estimated rows ${estimatedRows}, expected at least ${options.minFinalRows}.`;
  if (titleCoverage < 0.7) return "Title coverage is too low for reliable import and hotspot evidence tracing.";
  if (invalidSampleRate > 0.2) return "Too many invalid sampled rows. Clean the source before final import.";
  if (abstractCoverage < 0.5) return "Candidate is large enough, but abstract coverage is weak; report evidence quality may suffer.";
  if (yearCoverage < 0.5) return "Candidate is large enough, but year coverage is weak; trend analysis may suffer.";
  return "Looks suitable for strict real-library preflight.";
}

function buildGatePlan({ finalGateReady, preflightReady, conversionReady, minFinalRows }) {
  const directSource = finalGateReady[0] ?? null;
  const largeConvertible = conversionReady.find((item) => (item.estimatedRows ?? 0) >= minFinalRows) ?? null;
  const fallbackConvertible = conversionReady[0] ?? null;
  const convertible = largeConvertible ?? fallbackConvertible;
  const convertedOutput = convertible
    ? path.join(DEFAULT_CONVERTED_IMPORT_DIR, `${safeFileStem(convertible.fileName)}.jsonl`)
    : null;
  const libraryPath = directSource?.filePath ?? (largeConvertible ? convertedOutput : null);

  if (directSource) {
    return {
      status: "ready_source_found",
      summary: `A structured source file appears ready for the strict ${minFinalRows}+ row gate.`,
      selectedSource: summarizeCandidate(directSource),
      conversionCommand: null,
      strictPreflightCommand: buildStrictPreflightCommand(directSource.filePath, minFinalRows),
      finalAcceptanceCommand: buildFinalAcceptanceCommand(directSource.filePath),
      notes: [
        "Run the strict preflight first if you want a fast source-file check.",
        "Run the final acceptance command after confirming AI live smoke and UI smoke evidence are current.",
      ],
    };
  }

  if (largeConvertible && convertedOutput) {
    return {
      status: "conversion_ready_source_found",
      summary: `A large BibTeX/RIS source was found. The final acceptance gate can convert it to JSONL on D: before the strict ${minFinalRows}+ row gate.`,
      selectedSource: summarizeCandidate(largeConvertible),
      convertedOutput,
      conversionCommand: buildConversionCommand(largeConvertible.filePath, convertedOutput),
      strictPreflightCommand: buildStrictPreflightCommand(convertedOutput, minFinalRows),
      finalAcceptanceCommand: buildFinalAcceptanceCommand(largeConvertible.filePath),
      notes: [
        "For a fast source-only check, run the conversion command and strict preflight command first.",
        "For a full final gate, pass the original BibTeX/RIS file; the gate will convert it to D:\\ResearchHotspotsDesktop\\imports before preflight and import.",
      ],
    };
  }

  if (convertible && convertedOutput) {
    return {
      status: "conversion_candidate_below_final_rows",
      summary: `A BibTeX/RIS source was found, but its estimated rows are below the ${minFinalRows}+ final target.`,
      selectedSource: summarizeCandidate(convertible),
      convertedOutput,
      conversionCommand: buildConversionCommand(convertible.filePath, convertedOutput),
      strictPreflightCommand: null,
      finalAcceptanceCommand: null,
      notes: [
        "This file can validate the conversion path, but it cannot prove the final 100000+ paper requirement.",
        "Export the full real library from Zotero, EndNote, Mendeley, Web of Science or another source, then rerun discovery.",
      ],
    };
  }

  return {
    status: preflightReady.length > 0 ? "structured_sources_found_below_final_rows" : "no_source_found",
    summary: `No discovered source currently proves the strict ${minFinalRows}+ row real-library gate.`,
    selectedSource: preflightReady[0] ? summarizeCandidate(preflightReady[0]) : null,
    conversionCommand: null,
    strictPreflightCommand: null,
    finalAcceptanceCommand: null,
    notes: [
      "Export the full paper library to CSV, JSONL, NDJSON, BibTeX or RIS on the D: drive.",
      "Rerun discovery with --root pointing at the export directory.",
      "Use the final acceptance gate only after a source file has at least 100000 valid rows.",
    ],
  };
}

function buildRecommendations({ candidates, finalGateReady, preflightReady, conversionReady, minFinalRows, gatePlan }) {
  const recommendations = [];
  if (candidates.length === 0) {
    recommendations.push("No candidate paper-library files were found in the scanned roots.");
    recommendations.push("Export the real library to CSV, JSONL, or NDJSON on the D drive, then re-run discovery.");
    return recommendations;
  }
  if (finalGateReady.length === 0) {
    recommendations.push(`No scanned file is currently ready for the final ${minFinalRows}+ row source-file gate.`);
  }
  if (preflightReady.length === 0) {
    recommendations.push("No CSV/JSON/JSONL/NDJSON file was found. Convert BibTeX/RIS/database exports before final preflight.");
  }
  if (conversionReady.length > 0) {
    recommendations.push("BibTeX/RIS files were found. Use `pnpm convert:bibliography -- <input.bib|input.ris> --output <library.jsonl>` before strict preflight and import.");
  }
  if (gatePlan?.finalAcceptanceCommand) {
    recommendations.push("A concrete final acceptance command is available in the `gatePlan` section of the JSON/Markdown report.");
  }
  const databaseFiles = candidates.filter((item) => ["db", "sqlite", "sqlite3"].includes(item.extension));
  if (databaseFiles.length > 0) {
    recommendations.push("SQLite-like files were found. Use audit_library only when they are research-hotspots-v7 compatible databases.");
  }
  return recommendations;
}

function summarizeCandidate(item) {
  return {
    filePath: item.filePath,
    extension: item.extension,
    sizeMb: item.sizeMb,
    estimatedRows: item.estimatedRows ?? null,
    titleCoverage: item.titleCoverage ?? null,
    abstractCoverage: item.abstractCoverage ?? null,
    yearCoverage: item.yearCoverage ?? null,
    invalidSampleRate: item.invalidSampleRate ?? null,
    recommendation: item.recommendation ?? null,
  };
}

function buildConversionCommand(inputPath, outputPath) {
  return `pnpm convert:bibliography -- ${quotePowerShell(inputPath)} --output ${quotePowerShell(outputPath)} --report outputs\\v20_bibliography_conversion_real.json`;
}

function buildStrictPreflightCommand(libraryPath, minFinalRows) {
  return `node scripts\\v20_real_library_preflight.mjs ${quotePowerShell(libraryPath)} --output outputs\\v20_real_library_preflight_user.json --min-valid-rows ${minFinalRows} --max-invalid-rate 0.05 --max-duplicate-rate 0.30 --require-full-scan`;
}

function buildFinalAcceptanceCommand(libraryPath) {
  return `$env:CARGO_HOME='D:\\.cargo'; powershell -ExecutionPolicy Bypass -File scripts\\v20_final_acceptance_gate.ps1 -LibraryPath ${quotePowerShell(libraryPath)} -DatabaseDir ${quotePowerShell(DEFAULT_ACCEPTANCE_DATABASE_DIR)} -ImportBeforeAudit -ExportStarMap -ExportHotspotEvidence -GenerateHotspotReport -UiSmokePath outputs\\v20_ui_final_smoke.json -AiLiveSmokePath outputs\\v20_ai_live_report_smoke.json -RequireLiveAi -RequireTerminalReady -RunPressureTest -RunTauriBuild -LaunchExe`;
}

function quotePowerShell(value) {
  return `"${String(value).replace(/"/g, '`"')}"`;
}

function safeFileStem(fileName) {
  const stem = path.basename(fileName, path.extname(fileName)).replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "");
  return stem || "library";
}

function compareCandidates(left, right) {
  const leftScore = scoreCandidate(left);
  const rightScore = scoreCandidate(right);
  if (leftScore !== rightScore) return rightScore - leftScore;
  return (right.sizeBytes ?? 0) - (left.sizeBytes ?? 0);
}

function scoreCandidate(item) {
  let score = 0;
  if (item.finalGateCandidate) score += 1000;
  if (item.preflightSupported) score += 100;
  if (item.conversionSupported) score += 70;
  if ((item.estimatedRows ?? 0) >= DEFAULT_MIN_FINAL_ROWS) score += 80;
  score += Math.min(60, Math.log10(Math.max(item.sizeBytes ?? 1, 1)) * 10);
  score += Math.round((item.titleCoverage ?? 0) * 40);
  score += Math.round((item.abstractCoverage ?? 0) * 20);
  return score;
}

function renderMarkdown(result) {
  const topRows = result.candidates.slice(0, 20).map((item) => {
    return `| ${item.finalGateCandidate ? "yes" : "no"} | ${item.preflightSupported ? "yes" : "no"} | ${item.conversionSupported ? "yes" : "no"} | ${escapePipe(item.filePath)} | ${item.extension} | ${item.sizeMb ?? ""} | ${item.estimatedRows ?? "unknown"} | ${formatRate(item.titleCoverage)} | ${escapePipe(item.recommendation ?? item.status ?? "")} |`;
  }).join("\n");
  const recommendations = result.recommendations.length
    ? result.recommendations.map((item, index) => `${index + 1}. ${item}`).join("\n")
    : "None.";
  const gatePlan = renderGatePlanMarkdown(result.gatePlan);
  return `# V20 Real Data Discovery

Generated: ${result.generatedAt}

- Scanned roots: ${result.scanRoots.map((item) => `\`${item}\``).join(", ")}
- Candidate files: ${result.candidateCount}
- Preflight-supported files: ${result.preflightSupportedCount}
- Bibliography-convertible files: ${result.conversionSupportedCount}
- Final gate candidates: ${result.finalGateCandidateCount}
- Elapsed: ${result.elapsedMs} ms

## Recommendations

${recommendations}

## Next Gate Plan

${gatePlan}

## Top Candidates

| Final gate | Preflight | Convertible | Path | Ext | MB | Estimated rows | Title coverage | Note |
|---|---|---|---|---:|---:|---:|---:|---|
${topRows || "| no | no | no | No candidates found |  |  |  |  |  |"}
`;
}

function renderGatePlanMarkdown(plan) {
  if (!plan) return "No gate plan was generated.";
  const lines = [
    `- Status: \`${plan.status}\``,
    `- Summary: ${plan.summary}`,
  ];
  if (plan.selectedSource) {
    lines.push(`- Selected source: \`${plan.selectedSource.filePath}\``);
    lines.push(`- Estimated rows: ${plan.selectedSource.estimatedRows ?? "unknown"}`);
  }
  if (plan.convertedOutput) lines.push(`- Converted output: \`${plan.convertedOutput}\``);
  if (plan.notes?.length) {
    for (const note of plan.notes) lines.push(`- ${note}`);
  }
  const commandBlocks = [];
  if (plan.conversionCommand) commandBlocks.push(`Conversion:\n\n\`\`\`powershell\n${plan.conversionCommand}\n\`\`\``);
  if (plan.strictPreflightCommand) commandBlocks.push(`Strict preflight:\n\n\`\`\`powershell\n${plan.strictPreflightCommand}\n\`\`\``);
  if (plan.finalAcceptanceCommand) commandBlocks.push(`Final acceptance:\n\n\`\`\`powershell\n${plan.finalAcceptanceCommand}\n\`\`\``);
  return `${lines.join("\n")}${commandBlocks.length ? `\n\n${commandBlocks.join("\n\n")}` : ""}`;
}

function formatRate(value) {
  if (value === null || value === undefined) return "unknown";
  return `${Math.round(value * 100)}%`;
}

function escapePipe(value) {
  return String(value).replace(/\|/g, "\\|");
}

function rate(value, total) {
  if (!total) return 0;
  return round(value / total, 4);
}

function round(value, places) {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
