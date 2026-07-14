import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const outputDir = path.join(root, "outputs");

const FIELD_ALIASES = {
  id: ["id", "paper_id", "paperid", "编号", "文献编号"],
  title: ["title", "name", "display_name", "paper_title", "题名", "标题", "论文标题", "文献标题"],
  abstract: ["abstract", "summary", "description", "摘要", "简介", "内容摘要"],
  year: ["year", "publication_year", "published_year", "date", "published", "发表年份", "年份", "出版年"],
  source: ["source", "database", "platform", "来源", "数据源"],
  field: ["field", "discipline", "subject", "category", "学科", "领域", "分类"],
  doi: ["doi", "DOI"],
  url: ["url", "link", "landing_page_url", "pdf_url", "链接", "网址"],
  authors: ["authors", "author", "creator", "作者", "作者列表"],
  categories: ["categories", "keywords", "concepts", "tags", "关键词", "主题词"],
};

const args = process.argv.slice(2);
if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
  printHelp();
  process.exit(args.length === 0 ? 1 : 0);
}

const inputPath = path.resolve(args[0]);
const outputArg = readOption("--output");
const maxRowsArg = readOption("--max-rows");
const minValidRowsArg = readOption("--min-valid-rows");
const maxInvalidRateArg = readOption("--max-invalid-rate");
const maxDuplicateRateArg = readOption("--max-duplicate-rate");
const requireFullScan = args.includes("--require-full-scan");
const maxRows = maxRowsArg ? Number.parseInt(maxRowsArg, 10) : undefined;
if (maxRowsArg && (!Number.isFinite(maxRows) || maxRows <= 0)) {
  throw new Error("--max-rows must be a positive integer.");
}
const minValidRows = minValidRowsArg ? Number.parseInt(minValidRowsArg, 10) : undefined;
if (minValidRowsArg && (!Number.isFinite(minValidRows) || minValidRows <= 0)) {
  throw new Error("--min-valid-rows must be a positive integer.");
}
const maxInvalidRate = maxInvalidRateArg ? Number.parseFloat(maxInvalidRateArg) : undefined;
if (maxInvalidRateArg && (!Number.isFinite(maxInvalidRate) || maxInvalidRate < 0 || maxInvalidRate > 1)) {
  throw new Error("--max-invalid-rate must be a number between 0 and 1.");
}
const maxDuplicateRate = maxDuplicateRateArg ? Number.parseFloat(maxDuplicateRateArg) : undefined;
if (maxDuplicateRateArg && (!Number.isFinite(maxDuplicateRate) || maxDuplicateRate < 0 || maxDuplicateRate > 1)) {
  throw new Error("--max-duplicate-rate must be a number between 0 and 1.");
}

const fileInfo = await stat(inputPath);
if (!fileInfo.isFile()) {
  throw new Error(`Input path is not a file: ${inputPath}`);
}

await mkdir(outputDir, { recursive: true });

const extension = path.extname(inputPath).toLowerCase().replace(/^\./, "");
const rows = extension === "jsonl" || extension === "ndjson"
  ? await readJsonLines(inputPath, maxRows)
  : extension === "json"
    ? await readJson(inputPath, maxRows)
    : extension === "csv"
      ? await readCsv(inputPath, maxRows)
      : unsupported(extension);

const result = analyzeRows(rows.rows, {
  filePath: inputPath,
  fileName: path.basename(inputPath),
  extension,
  sizeBytes: fileInfo.size,
  scannedRows: rows.rows.length,
  stoppedAtMaxRows: rows.stoppedAtMaxRows,
  maxRows: maxRows ?? null,
});
const strictGate = buildStrictGate(result, {
  minValidRows,
  maxInvalidRate,
  maxDuplicateRate,
  requireFullScan,
});
result.strictGate = strictGate;

const outputPath = outputArg
  ? path.resolve(outputArg)
  : path.join(outputDir, `real_library_preflight_${safeTimestamp()}.json`);
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify(result, null, 2), "utf8");

console.log(`Real library preflight completed: valid=${result.validRows}, invalid=${result.invalidRows}, duplicates=${result.duplicateRows}`);
if (strictGate.enabled) console.log(`Strict gate: passed=${strictGate.passed}`);
console.log(`Report: ${outputPath}`);
if (result.recommendations.length > 0) {
  console.log("Recommendations:");
  for (const item of result.recommendations) console.log(`- ${item}`);
}
if (strictGate.enabled && !strictGate.passed) {
  console.error("Strict gate failed:");
  for (const failure of strictGate.failures) console.error(`- ${failure}`);
  process.exit(1);
}

function readOption(name) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  return args[index + 1];
}

function printHelp() {
  console.log(`
Usage:
  node scripts/v20_real_library_preflight.mjs <papers.csv|papers.json|papers.jsonl|papers.ndjson> [--max-rows N] [--output outputs/preflight.json]

Examples:
  node scripts/v20_real_library_preflight.mjs data/samples/papers_sample.jsonl
  node scripts/v20_real_library_preflight.mjs D:\\papers\\library.jsonl --max-rows 100000 --output outputs/real_library_preflight.json
  node scripts/v20_real_library_preflight.mjs D:\\papers\\library.jsonl --min-valid-rows 100000 --require-full-scan --output outputs/real_library_preflight.json

This script is read-only. It does not import into SQLite.
For BibTeX/RIS exports, run pnpm convert:bibliography first and preflight the generated JSONL.
`.trim());
}

function unsupported(extension) {
  if (extension === "bib" || extension === "ris") {
    throw new Error(`Unsupported file extension .${extension}. Convert it first with: pnpm convert:bibliography -- <input.${extension}> --output <library.jsonl>`);
  }
  throw new Error(`Unsupported file extension .${extension}. Expected csv, json, jsonl, or ndjson.`);
}

async function readJsonLines(filePath, limit) {
  const rows = [];
  let stoppedAtMaxRows = false;
  const stream = createReadStream(filePath, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    const text = line.trim();
    if (!text) continue;
    try {
      const value = JSON.parse(text);
      if (isRecord(value)) rows.push(value);
      else rows.push({ title: "", __invalid_shape: "JSONL line is not an object." });
    } catch (error) {
      rows.push({ title: "", __invalid_json_line: String(error) });
    }
    if (limit && rows.length >= limit) {
      stoppedAtMaxRows = true;
      rl.close();
      stream.destroy();
      break;
    }
  }
  return { rows, stoppedAtMaxRows };
}

async function readJson(filePath, limit) {
  const text = await readFile(filePath, "utf8");
  const value = JSON.parse(text);
  let rows = [];
  if (Array.isArray(value)) rows = value.filter(isRecord);
  else if (isRecord(value)) {
    for (const key of ["papers", "data", "items", "results", "records"]) {
      if (Array.isArray(value[key])) {
        rows = value[key].filter(isRecord);
        break;
      }
    }
    if (rows.length === 0) rows = [value];
  }
  const stoppedAtMaxRows = Boolean(limit && rows.length > limit);
  return { rows: limit ? rows.slice(0, limit) : rows, stoppedAtMaxRows };
}

async function readCsv(filePath, limit) {
  const text = await readFile(filePath, "utf8");
  const parsedRows = parseCsv(text);
  const [header = [], ...body] = parsedRows;
  const keys = header.map((item) => normalizeKey(item));
  const rows = body.map((values) => {
    const row = {};
    values.forEach((value, valueIndex) => {
      row[keys[valueIndex] || `col${valueIndex}`] = value;
    });
    return row;
  });
  const stoppedAtMaxRows = Boolean(limit && rows.length > limit);
  return { rows: limit ? rows.slice(0, limit) : rows, stoppedAtMaxRows };
}

function analyzeRows(rows, meta) {
  const seenKeys = new Set();
  const duplicateExamples = [];
  const invalidExamples = [];
  const invalidReasonCounts = new Map();
  const sourceCounts = new Map();
  const fieldCounts = new Map();
  const yearCounts = new Map();
  const sampleTitles = [];
  let validRows = 0;
  let duplicateRows = 0;
  let invalidRows = 0;
  let missingAbstractRows = 0;
  let missingYearRows = 0;
  let missingDoiAndUrlRows = 0;
  let titleLengthMax = 0;
  let abstractLengthMax = 0;
  const years = [];

  rows.forEach((row, index) => {
    const normalized = normalizePaper(row, index);
    if (!normalized.paper) {
      invalidRows += 1;
      invalidReasonCounts.set(normalized.reason, (invalidReasonCounts.get(normalized.reason) ?? 0) + 1);
      if (invalidExamples.length < 8) invalidExamples.push({ index: index + 1, reason: normalized.reason, raw: row });
      return;
    }

    const paper = normalized.paper;
    const key = paperKey(paper);
    if (seenKeys.has(key)) {
      duplicateRows += 1;
      if (duplicateExamples.length < 8) duplicateExamples.push({ index: index + 1, title: paper.title, key });
      return;
    }
    seenKeys.add(key);
    validRows += 1;
    if (!paper.abstract || paper.abstract === "本地导入文献，暂无摘要。") missingAbstractRows += 1;
    if (!paper.year) missingYearRows += 1;
    if (!paper.doi && !paper.url) missingDoiAndUrlRows += 1;
    if (paper.year) years.push(paper.year);
    titleLengthMax = Math.max(titleLengthMax, paper.title.length);
    abstractLengthMax = Math.max(abstractLengthMax, paper.abstract.length);
    increment(sourceCounts, paper.source);
    increment(fieldCounts, paper.field || "未分类");
    if (paper.year) increment(yearCounts, String(paper.year));
    if (sampleTitles.length < 12) sampleTitles.push(paper.title);
  });

  const recommendations = [];
  if (meta.extension === "json") recommendations.push("大型库建议转为 JSONL/NDJSON 后再导入，避免单个巨大 JSON 数组占用内存。");
  if (missingAbstractRows / Math.max(validRows, 1) > 0.2) recommendations.push("超过 20% 有效记录缺少摘要，热点聚类和报告证据质量会下降。");
  if (missingYearRows / Math.max(validRows, 1) > 0.2) recommendations.push("超过 20% 有效记录缺少年份，年度演化与趋势判断会变弱。");
  if (missingDoiAndUrlRows / Math.max(validRows, 1) > 0.5) recommendations.push("超过 50% 有效记录缺少 DOI/URL，去重将主要依赖标题，建议补充唯一标识。");
  if (duplicateRows > 0) recommendations.push("检测到文件内重复记录，导入前建议按 DOI/URL/标题去重。");
  if (invalidRows > 0) recommendations.push("存在无效行，优先修复缺少标题或非法 JSON 行。");
  if (meta.stoppedAtMaxRows) recommendations.push("本次只扫描了部分记录；正式导入前建议对完整文件再跑一次预检。");

  return {
    generatedAt: new Date().toISOString(),
    ...meta,
    totalRowsScanned: rows.length,
    validRows,
    invalidRows,
    duplicateRows,
    missingAbstractRows,
    missingYearRows,
    missingDoiAndUrlRows,
    yearRange: years.length > 0 ? `${Math.min(...years)}-${Math.max(...years)}` : "unknown",
    sourceCounts: toFacetArray(sourceCounts),
    fieldCounts: toFacetArray(fieldCounts),
    yearCounts: toFacetArray(yearCounts, 40),
    maxLengths: { title: titleLengthMax, abstract: abstractLengthMax },
    invalidReasonCounts: toFacetArray(invalidReasonCounts),
    invalidExamples,
    duplicateExamples,
    sampleTitles,
    recommendations,
  };
}

function normalizePaper(row, index) {
  const title = pick(row, FIELD_ALIASES.title);
  if (!title.trim()) return { reason: "缺少标题字段 title/题名/标题" };

  const abstract = pick(row, FIELD_ALIASES.abstract) || "本地导入文献，暂无摘要。";
  const doi = pick(row, FIELD_ALIASES.doi);
  const url = pick(row, FIELD_ALIASES.url);
  const yearText = pick(row, FIELD_ALIASES.year);
  const year = Number.parseInt(yearText.slice(0, 4), 10);
  const id = pick(row, FIELD_ALIASES.id) || `local:${hashString(`${title}:${doi}:${url}:${index}`)}`;

  return {
    paper: {
      id,
      source: normalizeSource(pick(row, FIELD_ALIASES.source)),
      title: title.slice(0, 500),
      abstract: abstract.slice(0, 5000),
      authors: pick(row, FIELD_ALIASES.authors),
      categories: pick(row, FIELD_ALIASES.categories),
      field: pick(row, FIELD_ALIASES.field) || "本地导入",
      publishedDate: yearText,
      year: Number.isFinite(year) ? year : undefined,
      url,
      doi,
    },
  };
}

function pick(row, keys) {
  const normalizedRow = new Map(Object.entries(row).map(([key, value]) => [normalizeKey(key), stringifyValue(value)]));
  for (const key of keys) {
    const value = normalizedRow.get(normalizeKey(key));
    if (value !== undefined && value !== null && value.trim()) return value.trim();
  }
  return "";
}

function stringifyValue(value) {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return value.map(stringifyValue).filter(Boolean).join("; ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function normalizeSource(value) {
  const lower = value.toLowerCase();
  if (lower.includes("arxiv")) return "arxiv";
  if (lower.includes("openalex")) return "openalex";
  if (lower.includes("cnki") || lower.includes("知网")) return "cnki";
  return "local";
}

function paperKey(paper) {
  return (paper.doi || paper.url || paper.title).toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeKey(value) {
  return String(value).trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function increment(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function toFacetArray(map, limit = 20) {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .slice(0, limit)
    .map(([value, count]) => ({ value, count }));
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function safeTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function buildStrictGate(result, options) {
  const checks = [];
  if (options.minValidRows) {
    checks.push({
      name: "minValidRows",
      expected: options.minValidRows,
      actual: result.validRows,
      passed: result.validRows >= options.minValidRows,
      failure: `validRows ${result.validRows} is below required minimum ${options.minValidRows}.`,
    });
  }
  if (options.maxInvalidRate !== undefined) {
    const invalidRate = result.invalidRows / Math.max(result.totalRowsScanned, 1);
    checks.push({
      name: "maxInvalidRate",
      expected: options.maxInvalidRate,
      actual: Number(invalidRate.toFixed(6)),
      passed: invalidRate <= options.maxInvalidRate,
      failure: `invalidRate ${invalidRate.toFixed(4)} exceeds maximum ${options.maxInvalidRate}.`,
    });
  }
  if (options.maxDuplicateRate !== undefined) {
    const duplicateRate = result.duplicateRows / Math.max(result.validRows + result.duplicateRows, 1);
    checks.push({
      name: "maxDuplicateRate",
      expected: options.maxDuplicateRate,
      actual: Number(duplicateRate.toFixed(6)),
      passed: duplicateRate <= options.maxDuplicateRate,
      failure: `duplicateRate ${duplicateRate.toFixed(4)} exceeds maximum ${options.maxDuplicateRate}.`,
    });
  }
  if (options.requireFullScan) {
    checks.push({
      name: "requireFullScan",
      expected: true,
      actual: !result.stoppedAtMaxRows,
      passed: !result.stoppedAtMaxRows,
      failure: "preflight stopped at --max-rows; run a full scan for final acceptance.",
    });
  }

  const failures = checks.filter((check) => !check.passed).map((check) => check.failure);
  return {
    enabled: checks.length > 0,
    passed: failures.length === 0,
    checks: checks.map(({ failure, ...check }) => check),
    failures,
  };
}
