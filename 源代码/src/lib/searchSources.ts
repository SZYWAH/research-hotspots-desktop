import type { SearchOptions, SearchResultPaper, SourceKind } from "../types";
import { clampYear } from "./dates";
import { searchCnkiPapers } from "./desktop";

export async function searchAcademicSources(options: SearchOptions) {
  const tasks = options.sources.map(async (source) => {
    if (source === "openalex") return searchOpenAlex(options);
    if (source === "arxiv") return searchArxiv(options);
    if (source === "cnki") return searchCnki(options);
    return [] as SearchResultPaper[];
  });
  const settled = await Promise.allSettled(tasks);
  const rows = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  const failures = settled.flatMap((result) => result.status === "rejected" ? [result.reason instanceof Error ? result.reason.message : String(result.reason)] : []);
  if (rows.length === 0 && failures.length > 0) throw new Error(failures.join("；"));
  return dedupeByTitle(rows).slice(0, options.maxResults * Math.max(1, options.sources.length));
}

async function searchCnki(options: SearchOptions): Promise<SearchResultPaper[]> {
  if (!options.cnki) throw new Error("CNKI 设置缺失，请先在设置页配置 ChromeDriver。");
  const result = await searchCnkiPapers({
    query: options.query,
    maxResults: options.maxResults,
    startYear: options.startYear,
    endYear: options.endYear,
    settings: options.cnki,
  });
  if (!result.ok) {
    const debug = result.debugArtifacts.length ? ` 调试快照：${result.debugArtifacts.join("；")}` : "";
    throw new Error(`${result.message}${debug}`);
  }
  return result.papers;
}

async function searchOpenAlex(options: SearchOptions): Promise<SearchResultPaper[]> {
  const url = new URL("https://api.openalex.org/works");
  url.searchParams.set("search", options.query);
  url.searchParams.set("filter", `from_publication_date:${options.startYear}-01-01,to_publication_date:${options.endYear}-12-31`);
  url.searchParams.set("per_page", String(Math.min(50, options.maxResults)));
  url.searchParams.set("sort", "cited_by_count:desc");
  url.searchParams.set("mailto", "local-research-desktop@example.com");

  const payload = await fetch(url).then((response) => response.json());
  const results = Array.isArray(payload.results) ? payload.results : [];
  return results.map((item: Record<string, unknown>) => {
    const rawId = String(item.id || crypto.randomUUID()).split("/").pop() || crypto.randomUUID();
    const year = clampYear(item.publication_year);
    return {
      id: `openalex:${rawId}`,
      source: "openalex" as SourceKind,
      title: String(item.display_name || "Untitled").slice(0, 500),
      abstract: reconstructOpenAlexAbstract(item.abstract_inverted_index as Record<string, number[]> | undefined),
      authors: Array.isArray(item.authorships)
        ? item.authorships
            .map((entry) => (entry as { author?: { display_name?: string } }).author?.display_name)
            .filter(Boolean)
            .join(", ")
        : "",
      categories: Array.isArray(item.concepts)
        ? item.concepts
            .slice(0, 5)
            .map((entry) => (entry as { display_name?: string }).display_name)
            .filter(Boolean)
            .join(", ")
        : "",
      field: inferField(options.query),
      publishedDate: String(item.publication_date || year),
      year,
      url: String(item.doi || item.id || ""),
      doi: String(item.doi || ""),
    };
  });
}

async function searchArxiv(options: SearchOptions): Promise<SearchResultPaper[]> {
  const url = new URL("https://export.arxiv.org/api/query");
  url.searchParams.set("search_query", `all:${options.query}`);
  url.searchParams.set("start", "0");
  url.searchParams.set("max_results", String(Math.min(50, options.maxResults)));
  url.searchParams.set("sortBy", "submittedDate");
  url.searchParams.set("sortOrder", "descending");

  const xml = await fetch(url).then((response) => response.text());
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  return Array.from(doc.querySelectorAll("entry")).map((entry) => {
    const id = text(entry, "id");
    const published = text(entry, "published");
    const year = clampYear(published.slice(0, 4));
    return {
      id: `arxiv:${id.split("/abs/").pop() || crypto.randomUUID()}`,
      source: "arxiv" as SourceKind,
      title: text(entry, "title").replace(/\s+/g, " ").trim(),
      abstract: text(entry, "summary").replace(/\s+/g, " ").trim(),
      authors: Array.from(entry.querySelectorAll("author name")).map((node) => node.textContent ?? "").join(", "),
      categories: Array.from(entry.querySelectorAll("category")).map((node) => node.getAttribute("term") ?? "").join(", "),
      field: inferField(options.query),
      publishedDate: published,
      year,
      url: id,
      doi: "",
    };
  });
}

function reconstructOpenAlexAbstract(index?: Record<string, number[]>) {
  if (!index) return "暂无摘要";
  const words: Array<string | undefined> = [];
  for (const [word, positions] of Object.entries(index)) {
    for (const position of positions) words[position] = word;
  }
  return words.filter(Boolean).join(" ").slice(0, 3000) || "暂无摘要";
}

function text(parent: Element, selector: string) {
  return parent.querySelector(selector)?.textContent ?? "";
}

function inferField(query: string) {
  const value = query.toLowerCase();
  if (/protein|biology|gene|cell|蛋白|生物|基因|细胞/.test(value)) return "Computational Biology";
  if (/quantum|量子/.test(value)) return "Quantum Physics";
  if (/geometry|moduli|algebraic|几何|模空间|代数/.test(value)) return "Algebraic Geometry";
  if (/medical|imaging|diagnosis|医学|影像|诊断/.test(value)) return "Medical Imaging";
  return "Artificial Intelligence";
}

function dedupeByTitle(rows: SearchResultPaper[]) {
  const seen = new Set<string>();
  const output: SearchResultPaper[] = [];
  for (const row of rows) {
    const key = row.title.toLowerCase().replace(/\s+/g, " ").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(row);
  }
  return output;
}
