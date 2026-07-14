import type { ImportInvalidRow, ImportPreview, Paper, SearchResultPaper, SourceKind } from "../types";

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
} as const;

export function parsePaperImport(fileName: string, text: string): SearchResultPaper[] {
  return analyzePaperImport(fileName, text, []).validRows;
}

export function analyzePaperImport(fileName: string, text: string, existingPapers: Paper[]): ImportPreview {
  const rawRows = /\.(jsonl|ndjson)$/i.test(fileName) ? parseJsonLineRows(text) : /\.json$/i.test(fileName) ? parseJsonRows(text) : parseCsvRows(text);
  const existingKeys = new Set(existingPapers.map((paper) => paperKey(paper)));
  const seenKeys = new Set<string>();
  const validRows: SearchResultPaper[] = [];
  const invalidRows: ImportInvalidRow[] = [];
  const duplicateRows: SearchResultPaper[] = [];

  rawRows.forEach((row, index) => {
    const normalized = normalizePaper(row, index);
    if (!normalized.paper) {
      invalidRows.push({ index: index + 1, reason: normalized.reason, raw: row });
      return;
    }

    const key = paperKey(normalized.paper);
    if (existingKeys.has(key) || seenKeys.has(key)) {
      duplicateRows.push(normalized.paper);
      return;
    }
    seenKeys.add(key);
    validRows.push(normalized.paper);
  });

  return {
    fileName,
    totalRows: rawRows.length,
    validRows,
    invalidRows,
    duplicateRows,
    fieldCounts: countBy(validRows, (paper) => paper.field).map(([field, count]) => ({ field, count })),
    sourceCounts: countBy(validRows, (paper) => paper.source).map(([source, count]) => ({ source: source as SourceKind, count })),
  };
}

function parseJsonRows(text: string) {
  const payload = JSON.parse(text) as unknown;
  if (Array.isArray(payload)) return payload.filter(isRecord);
  if (isRecord(payload)) {
    for (const key of ["papers", "data", "items", "results", "records"]) {
      const rows = payload[key];
      if (Array.isArray(rows)) return rows.filter(isRecord);
    }
  }
  return [];
}

function parseJsonLineRows(text: string) {
  const rows: Record<string, unknown>[] = [];
  text.split(/\r?\n/).forEach((line) => {
    const value = line.trim();
    if (!value) return;
    try {
      const parsed = JSON.parse(value) as unknown;
      if (isRecord(parsed)) rows.push(parsed);
    } catch {
      rows.push({ title: "", abstract: "", __invalid_json_line: value });
    }
  });
  return rows;
}

function parseCsvRows(text: string) {
  const rows = parseCsv(text);
  const [header = [], ...body] = rows;
  const keys = header.map((item) => normalizeKey(item));
  return body.map((values) => {
    const row: Record<string, unknown> = {};
    values.forEach((value, valueIndex) => {
      row[keys[valueIndex] || `col${valueIndex}`] = value;
    });
    return row;
  });
}

function normalizePaper(row: Record<string, unknown>, index: number): { paper?: SearchResultPaper; reason: string } {
  const title = pick(row, FIELD_ALIASES.title);
  if (!title.trim()) return { reason: "缺少标题字段 title/题名/标题" };

  const abstract = pick(row, FIELD_ALIASES.abstract) || "本地导入文献，暂无摘要。";
  const doi = pick(row, FIELD_ALIASES.doi);
  const url = pick(row, FIELD_ALIASES.url);
  const sourceValue = pick(row, FIELD_ALIASES.source).toLowerCase();
  const source = normalizeSource(sourceValue);
  const yearText = pick(row, FIELD_ALIASES.year);
  const year = Number.parseInt(yearText.slice(0, 4), 10);
  const id = pick(row, FIELD_ALIASES.id) || `local:${hashString(`${title}:${doi}:${url}:${index}`)}`;

  return {
    reason: "",
    paper: {
      id,
      source,
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

function pick(row: Record<string, unknown>, keys: readonly string[]) {
  const normalizedRow = new Map(Object.entries(row).map(([key, value]) => [normalizeKey(key), value]));
  for (const key of keys) {
    const value = normalizedRow.get(normalizeKey(key));
    if (value !== undefined && value !== null) return String(value).trim();
  }
  return "";
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
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

function normalizeSource(value: string): SourceKind {
  if (value.includes("arxiv")) return "arxiv";
  if (value.includes("openalex")) return "openalex";
  if (value.includes("cnki") || value.includes("知网")) return "cnki";
  return "local";
}

function paperKey(paper: Pick<Paper, "title" | "doi" | "url">) {
  return (paper.doi || paper.url || paper.title).toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function countBy<T>(rows: T[], getKey: (row: T) => string) {
  const counts = new Map<string, number>();
  rows.forEach((row) => {
    const key = getKey(row) || "未分类";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
