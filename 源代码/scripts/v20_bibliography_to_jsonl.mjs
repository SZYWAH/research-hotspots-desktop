import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const outputDir = path.join(root, "outputs");

const args = process.argv.slice(2);
if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
  printHelp();
  process.exit(args.length === 0 ? 1 : 0);
}

const inputPath = path.resolve(args[0]);
const extension = path.extname(inputPath).toLowerCase();
const outputPath = path.resolve(readOption("--output") || defaultOutputPath(inputPath));
const reportPath = path.resolve(readOption("--report") || path.join(outputDir, "v20_bibliography_to_jsonl_report.json"));
const sourceOverride = readOption("--source") || "";
const fieldOverride = readOption("--field") || "";
const maxRecordsArg = readOption("--max-records");
const maxRecords = maxRecordsArg ? Number.parseInt(maxRecordsArg, 10) : null;

if (maxRecordsArg && (!Number.isFinite(maxRecords) || maxRecords <= 0)) {
  throw new Error("--max-records must be a positive integer.");
}
if (![".bib", ".ris"].includes(extension)) {
  throw new Error(`Unsupported bibliography file type: ${extension || "(none)"}. Expected .bib or .ris.`);
}

await mkdir(path.dirname(outputPath), { recursive: true });
await mkdir(path.dirname(reportPath), { recursive: true });

const writer = createWriteStream(outputPath, { encoding: "utf8" });
const startedAt = Date.now();
const stats = createStats({ inputPath, outputPath, reportPath, format: extension.slice(1), maxRecords });

try {
  if (extension === ".bib") {
    await convertBibTeX(inputPath, writer, stats, { sourceOverride, fieldOverride, maxRecords });
  } else {
    await convertRis(inputPath, writer, stats, { sourceOverride, fieldOverride, maxRecords });
  }
} finally {
  await closeWriter(writer);
}

stats.elapsedMs = Date.now() - startedAt;
stats.recommendations = buildRecommendations(stats);
await writeFile(reportPath, `${JSON.stringify(stats, null, 2)}\n`, "utf8");

console.log(`Bibliography conversion completed: converted=${stats.convertedRows}, invalid=${stats.invalidRows}`);
console.log(`JSONL: ${outputPath}`);
console.log(`Report: ${reportPath}`);
if (stats.recommendations.length > 0) {
  console.log("Recommendations:");
  for (const item of stats.recommendations) console.log(`- ${item}`);
}

function readOption(name) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  return args[index + 1];
}

function printHelp() {
  console.log(`
Usage:
  node scripts/v20_bibliography_to_jsonl.mjs <library.bib|library.ris> --output <library.jsonl> [--report outputs/report.json]

Examples:
  pnpm convert:bibliography -- data/samples/papers_sample.bib --output outputs/papers_from_bib.jsonl
  pnpm convert:bibliography -- D:\\papers\\library.ris --output D:\\papers\\library.jsonl --report outputs\\ris_conversion_report.json
  pnpm convert:bibliography -- D:\\papers\\library.bib --output D:\\papers\\library.jsonl --field "Artificial Intelligence"

The converter writes one JSON object per line, compatible with the existing V20 preflight and Rust SQLite import path.
`.trim());
}

function defaultOutputPath(filePath) {
  const parsed = path.parse(filePath);
  return path.join(parsed.dir, `${parsed.name}.jsonl`);
}

function createStats(meta) {
  return {
    generatedAt: new Date().toISOString(),
    ...meta,
    totalEntries: 0,
    convertedRows: 0,
    invalidRows: 0,
    missingTitleRows: 0,
    missingAbstractRows: 0,
    missingYearRows: 0,
    missingDoiAndUrlRows: 0,
    duplicateRows: 0,
    skippedByMaxRecords: false,
    sampleTitles: [],
    invalidExamples: [],
    duplicateExamples: [],
    sourceCounts: {},
    fieldCounts: {},
    yearCounts: {},
    recommendations: [],
    elapsedMs: 0,
  };
}

async function convertBibTeX(filePath, writer, stats, options) {
  const seen = new Set();
  for await (const entryText of readBibTeXEntries(filePath)) {
    if (options.maxRecords && stats.convertedRows >= options.maxRecords) {
      stats.skippedByMaxRecords = true;
      break;
    }
    stats.totalEntries += 1;
    const entry = parseBibTeXEntry(entryText);
    if (!entry) {
      markInvalid(stats, "Cannot parse BibTeX entry.", entryText.slice(0, 240));
      continue;
    }
    const row = bibEntryToPaper(entry, options);
    writePaperRow(row, writer, stats, seen, entry.key);
  }
}

async function* readBibTeXEntries(filePath) {
  const stream = createReadStream(filePath, { encoding: "utf8" });
  let buffer = "";
  let inEntry = false;
  let seenOpen = false;
  let quote = false;
  let escape = false;
  let depth = 0;
  let closeChar = "";

  for await (const chunk of stream) {
    for (const char of chunk) {
      if (!inEntry) {
        if (char === "@") {
          inEntry = true;
          seenOpen = false;
          quote = false;
          escape = false;
          depth = 0;
          closeChar = "";
          buffer = "@";
        }
        continue;
      }

      buffer += char;
      if (!seenOpen) {
        if (char === "{" || char === "(") {
          seenOpen = true;
          depth = 1;
          closeChar = char === "{" ? "}" : ")";
        }
        continue;
      }

      if (escape) {
        escape = false;
        continue;
      }
      if (char === "\\") {
        escape = true;
        continue;
      }
      if (char === '"') {
        quote = !quote;
        continue;
      }
      if (!quote && (char === "{" || char === "(")) {
        depth += 1;
      } else if (!quote && char === closeChar) {
        depth -= 1;
        if (depth === 0) {
          yield buffer;
          inEntry = false;
          buffer = "";
        }
      }
    }
  }

  if (inEntry && buffer.trim()) {
    yield buffer;
  }
}

function parseBibTeXEntry(text) {
  const firstOpen = text.search(/[({]/);
  if (!text.startsWith("@") || firstOpen < 0) return null;
  const type = text.slice(1, firstOpen).trim().toLowerCase();
  if (["comment", "preamble", "string"].includes(type)) return null;

  const close = text.trim().endsWith(")") ? ")" : "}";
  const inner = text.slice(firstOpen + 1, text.lastIndexOf(close));
  const keySplit = splitFirstTopLevelComma(inner);
  if (!keySplit) return null;

  return {
    type,
    key: keySplit.left.trim(),
    fields: parseBibFields(keySplit.right),
  };
}

function splitFirstTopLevelComma(value) {
  let depth = 0;
  let quote = false;
  let escape = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (escape) {
      escape = false;
      continue;
    }
    if (char === "\\") {
      escape = true;
      continue;
    }
    if (char === '"') {
      quote = !quote;
      continue;
    }
    if (!quote && (char === "{" || char === "(")) depth += 1;
    else if (!quote && (char === "}" || char === ")")) depth = Math.max(0, depth - 1);
    else if (!quote && depth === 0 && char === ",") {
      return { left: value.slice(0, index), right: value.slice(index + 1) };
    }
  }
  return null;
}

function parseBibFields(body) {
  const fields = {};
  for (const part of splitTopLevel(body, ",")) {
    const eqIndex = findTopLevel(part, "=");
    if (eqIndex < 0) continue;
    const key = normalizeBibKey(part.slice(0, eqIndex));
    const value = cleanBibValue(part.slice(eqIndex + 1));
    if (key && value) fields[key] = value;
  }
  return fields;
}

function splitTopLevel(value, separator) {
  const parts = [];
  let start = 0;
  let depth = 0;
  let quote = false;
  let escape = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (escape) {
      escape = false;
      continue;
    }
    if (char === "\\") {
      escape = true;
      continue;
    }
    if (char === '"') {
      quote = !quote;
      continue;
    }
    if (!quote && (char === "{" || char === "(")) depth += 1;
    else if (!quote && (char === "}" || char === ")")) depth = Math.max(0, depth - 1);
    else if (!quote && depth === 0 && char === separator) {
      parts.push(value.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(value.slice(start));
  return parts;
}

function findTopLevel(value, target) {
  let depth = 0;
  let quote = false;
  let escape = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (escape) {
      escape = false;
      continue;
    }
    if (char === "\\") {
      escape = true;
      continue;
    }
    if (char === '"') {
      quote = !quote;
      continue;
    }
    if (!quote && (char === "{" || char === "(")) depth += 1;
    else if (!quote && (char === "}" || char === ")")) depth = Math.max(0, depth - 1);
    else if (!quote && depth === 0 && char === target) return index;
  }
  return -1;
}

function cleanBibValue(rawValue) {
  const pieces = splitTopLevel(rawValue, "#").map((piece) => cleanSingleBibValue(piece)).filter(Boolean);
  return collapseWhitespace(pieces.join(" "));
}

function cleanSingleBibValue(rawValue) {
  let value = rawValue.trim().replace(/,$/, "").trim();
  let changed = true;
  while (changed) {
    changed = false;
    if ((value.startsWith("{") && value.endsWith("}") && isBalancedWrapper(value, "{", "}")) || (value.startsWith("(") && value.endsWith(")") && isBalancedWrapper(value, "(", ")"))) {
      value = value.slice(1, -1).trim();
      changed = true;
    }
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1).trim();
      changed = true;
    }
  }
  return decodeLatexish(value);
}

function isBalancedWrapper(value, open, close) {
  let depth = 0;
  let quote = false;
  let escape = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (escape) {
      escape = false;
      continue;
    }
    if (char === "\\") {
      escape = true;
      continue;
    }
    if (char === '"') {
      quote = !quote;
      continue;
    }
    if (!quote && char === open) depth += 1;
    if (!quote && char === close) {
      depth -= 1;
      if (depth === 0 && index < value.length - 1) return false;
    }
  }
  return depth === 0;
}

function bibEntryToPaper(entry, options) {
  const fields = entry.fields;
  const title = first(fields, ["title", "booktitle"]);
  const abstractText = first(fields, ["abstract", "annotation", "annote", "note"]);
  const doi = normalizeDoi(first(fields, ["doi"]));
  const url = first(fields, ["url", "howpublished", "pdf"]);
  const authors = normalizeAuthors(first(fields, ["author", "editor"]));
  const categories = first(fields, ["keywords", "keyword", "subjects", "tags"]);
  const yearSource = first(fields, ["year", "date", "urldate", "month"]);
  const publishedDate = first(fields, ["date", "year"]);
  const venue = first(fields, ["journal", "journaltitle", "booktitle", "conference", "publisher", "school", "institution"]);
  const source = normalizeSource(options.sourceOverride || first(fields, ["archiveprefix", "primaryclass", "eprinttype", "url", "eprint"]));
  return {
    id: `bib:${stableHash(`${entry.key}:${title}:${doi}:${url}`)}`,
    title,
    abstract: abstractText,
    year: extractYear(yearSource),
    publishedDate,
    source,
    field: options.fieldOverride || inferField(categories, venue, entry.type),
    doi,
    url: url || (doi ? `https://doi.org/${doi}` : ""),
    authors,
    categories,
    venue,
    bibliographyType: entry.type,
    bibliographyKey: entry.key,
  };
}

async function convertRis(filePath, writer, stats, options) {
  const seen = new Set();
  let current = null;
  let lastTag = "";
  const stream = createReadStream(filePath, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (options.maxRecords && stats.convertedRows >= options.maxRecords) {
      stats.skippedByMaxRecords = true;
      rl.close();
      stream.destroy();
      break;
    }

    const match = line.match(/^([A-Z0-9]{2})\s+-\s?(.*)$/);
    if (!match) {
      if (current && lastTag && line.trim()) {
        appendRisValue(current, lastTag, line.trim());
      }
      continue;
    }

    const tag = match[1];
    const value = match[2].trim();
    if (tag === "TY") {
      current = { TY: [value] };
      lastTag = tag;
      continue;
    }
    if (tag === "ER") {
      if (current) {
        stats.totalEntries += 1;
        const row = risEntryToPaper(current, options);
        writePaperRow(row, writer, stats, seen, firstRis(current, ["ID", "TI", "T1"]));
      }
      current = null;
      lastTag = "";
      continue;
    }
    if (!current) current = {};
    appendRisValue(current, tag, value);
    lastTag = tag;
  }

  if (current && Object.keys(current).length > 0) {
    stats.totalEntries += 1;
    const row = risEntryToPaper(current, options);
    writePaperRow(row, writer, stats, seen, firstRis(current, ["ID", "TI", "T1"]));
  }
}

function appendRisValue(entry, tag, value) {
  if (!entry[tag]) entry[tag] = [];
  if (value) entry[tag].push(value);
}

function risEntryToPaper(entry, options) {
  const title = firstRis(entry, ["TI", "T1", "CT"]);
  const abstractText = firstRis(entry, ["AB", "N2"]);
  const doi = normalizeDoi(firstRis(entry, ["DO"]));
  const url = firstRis(entry, ["UR", "L1", "L2", "LK"]);
  const authors = uniqueValues(["AU", "A1", "A2", "A3", "A4"].flatMap((tag) => entry[tag] || [])).join("; ");
  const categories = uniqueValues(["KW", "M1", "M3"].flatMap((tag) => entry[tag] || [])).join("; ");
  const yearText = firstRis(entry, ["PY", "Y1", "Y2", "DA"]);
  const venue = firstRis(entry, ["JO", "JF", "JA", "T2", "PB"]);
  const source = normalizeSource(options.sourceOverride || firstRis(entry, ["DB", "DP", "UR"]));
  const type = firstRis(entry, ["TY"]);
  return {
    id: `ris:${stableHash(`${title}:${doi}:${url}`)}`,
    title,
    abstract: abstractText,
    year: extractYear(yearText),
    publishedDate: yearText,
    source,
    field: options.fieldOverride || inferField(categories, venue, type),
    doi,
    url: url || (doi ? `https://doi.org/${doi}` : ""),
    authors,
    categories,
    venue,
    bibliographyType: type,
  };
}

function writePaperRow(row, writer, stats, seen, rawKey) {
  if (!row.title || !row.title.trim()) {
    stats.invalidRows += 1;
    stats.missingTitleRows += 1;
    if (stats.invalidExamples.length < 8) {
      stats.invalidExamples.push({ reason: "Missing title.", key: rawKey || "" });
    }
    return;
  }

  const key = paperKey(row);
  if (seen.has(key)) {
    stats.duplicateRows += 1;
    if (stats.duplicateExamples.length < 8) stats.duplicateExamples.push({ title: row.title, key });
    return;
  }
  seen.add(key);

  const normalizedRow = trimPaper(row);
  writer.write(`${JSON.stringify(normalizedRow)}\n`);
  stats.convertedRows += 1;
  if (!normalizedRow.abstract) stats.missingAbstractRows += 1;
  if (!normalizedRow.year) stats.missingYearRows += 1;
  if (!normalizedRow.doi && !normalizedRow.url) stats.missingDoiAndUrlRows += 1;
  increment(stats.sourceCounts, normalizedRow.source || "local");
  increment(stats.fieldCounts, normalizedRow.field || "Local Import");
  if (normalizedRow.year) increment(stats.yearCounts, String(normalizedRow.year));
  if (stats.sampleTitles.length < 12) stats.sampleTitles.push(normalizedRow.title);
}

function trimPaper(row) {
  return {
    id: row.id,
    title: truncate(collapseWhitespace(row.title), 500),
    abstract: truncate(collapseWhitespace(row.abstract), 5000),
    year: row.year || undefined,
    publishedDate: truncate(collapseWhitespace(row.publishedDate), 80),
    source: row.source || "local",
    field: truncate(collapseWhitespace(row.field), 120) || "Local Import",
    doi: truncate(collapseWhitespace(row.doi), 240),
    url: truncate(collapseWhitespace(row.url), 1000),
    authors: truncate(collapseWhitespace(row.authors), 2000),
    categories: truncate(collapseWhitespace(row.categories), 2000),
    venue: truncate(collapseWhitespace(row.venue), 500),
    bibliographyType: truncate(collapseWhitespace(row.bibliographyType), 80),
    bibliographyKey: truncate(collapseWhitespace(row.bibliographyKey), 240),
  };
}

function markInvalid(stats, reason, sample) {
  stats.invalidRows += 1;
  if (stats.invalidExamples.length < 8) stats.invalidExamples.push({ reason, sample });
}

function first(fields, keys) {
  for (const key of keys) {
    const value = fields[normalizeBibKey(key)];
    if (value && value.trim()) return value.trim();
  }
  return "";
}

function firstRis(entry, tags) {
  for (const tag of tags) {
    const values = entry[tag] || [];
    const value = values.find((item) => item && item.trim());
    if (value) return value.trim();
  }
  return "";
}

function inferField(categories, venue, type) {
  const firstCategory = splitTerms(categories)[0];
  if (firstCategory) return titleCase(firstCategory);
  if (venue) return "Bibliography Import";
  if (type) return `RIS ${type}`;
  return "Local Import";
}

function splitTerms(value) {
  return String(value || "")
    .split(/[;,|]/)
    .map((item) => collapseWhitespace(item).trim())
    .filter(Boolean);
}

function normalizeAuthors(value) {
  return String(value || "")
    .split(/\s+\band\b\s+/i)
    .map((author) => {
      const cleaned = collapseWhitespace(author);
      const parts = cleaned.split(",").map((item) => item.trim()).filter(Boolean);
      if (parts.length >= 2) return `${parts.slice(1).join(" ")} ${parts[0]}`;
      return cleaned;
    })
    .filter(Boolean)
    .join("; ");
}

function normalizeDoi(value) {
  return String(value || "")
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "");
}

function normalizeSource(value) {
  const lower = String(value || "").toLowerCase();
  if (lower.includes("arxiv")) return "arxiv";
  if (lower.includes("openalex")) return "openalex";
  if (lower.includes("cnki")) return "cnki";
  return "local";
}

function extractYear(value) {
  const match = String(value || "").match(/(?:18|19|20|21)\d{2}/);
  return match ? Number.parseInt(match[0], 10) : undefined;
}

function paperKey(row) {
  return (row.doi || row.url || row.title).toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeBibKey(value) {
  return String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function decodeLatexish(value) {
  return value
    .replace(/\\&/g, "&")
    .replace(/\\%/g, "%")
    .replace(/\\_/g, "_")
    .replace(/\\#/g, "#")
    .replace(/---/g, "-")
    .replace(/--/g, "-")
    .replace(/\\[a-zA-Z]+\*?(?:\[[^\]]*])?(?:\{([^{}]*)\})?/g, "$1")
    .replace(/[{}]/g, " ");
}

function collapseWhitespace(value) {
  return String(value || "").split(/\s+/).filter(Boolean).join(" ");
}

function truncate(value, maxLength) {
  const text = String(value || "");
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function titleCase(value) {
  return value.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

function uniqueValues(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const normalized = collapseWhitespace(value);
    const key = normalized.toLowerCase();
    if (normalized && !seen.has(key)) {
      seen.add(key);
      result.push(normalized);
    }
  }
  return result;
}

function increment(map, key) {
  map[key] = (map[key] || 0) + 1;
}

function stableHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function buildRecommendations(stats) {
  const recommendations = [];
  if (stats.convertedRows === 0) recommendations.push("No usable records were converted. Check whether the input is valid BibTeX/RIS.");
  if (stats.missingAbstractRows / Math.max(stats.convertedRows, 1) > 0.2) recommendations.push("More than 20% of converted records lack abstracts; clustering and reports may be weaker.");
  if (stats.missingYearRows / Math.max(stats.convertedRows, 1) > 0.2) recommendations.push("More than 20% of converted records lack years; yearly evolution will be weaker.");
  if (stats.missingDoiAndUrlRows / Math.max(stats.convertedRows, 1) > 0.5) recommendations.push("More than 50% of converted records lack DOI/URL; dedupe will rely mostly on titles.");
  if (stats.duplicateRows > 0) recommendations.push("Duplicate bibliography records were skipped by DOI, URL, or normalized title.");
  if (stats.skippedByMaxRecords) recommendations.push("Conversion stopped at --max-records; run without it before final import.");
  recommendations.push(`Next: run node scripts/v20_real_library_preflight.mjs "${stats.outputPath}" --output outputs/real_library_preflight.json`);
  return recommendations;
}

function closeWriter(writer) {
  return new Promise((resolve, reject) => {
    writer.end(() => resolve());
    writer.on("error", reject);
  });
}
