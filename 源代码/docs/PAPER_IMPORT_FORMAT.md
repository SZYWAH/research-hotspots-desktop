# Paper Import Format

Updated: 2026-07-07

This project supports local paper import through the Literature Workbench.

- Browser preview import: reads the selected file in the frontend and shows valid, duplicate, and invalid rows before writing.
- Desktop large-file import: streams CSV / JSON / JSONL / NDJSON into SQLite from the Tauri/Rust backend, suitable for large libraries.

## Recommended Format

For `100000+` papers, use `JSONL` or `NDJSON`.

Why:

- One paper per line.
- Stream-friendly.
- Easy to split, resume, inspect, and repair.
- Avoids loading one huge JSON array into memory.

Recommended extension:

```text
papers.jsonl
```

## BibTeX / RIS Exports

Zotero, EndNote, Mendeley, Web of Science and many journal databases commonly export `BibTeX` or `RIS`. V20 keeps the large-library import path simple: convert those bibliography exports to JSONL first, then reuse the same preflight, Rust import, SQLite audit and star-map pipeline.

The desktop large-file direct import path also accepts `.bib` and `.ris` directly. This is the preferred in-app route for large bibliography exports because it streams records through Rust/Tauri into SQLite instead of loading the whole file in the browser preview.

Convert BibTeX:

```powershell
pnpm convert:bibliography -- D:\papers\library.bib --output D:\papers\library.jsonl --report outputs\bibliography_conversion_report.json
```

Convert RIS:

```powershell
pnpm convert:bibliography -- D:\papers\library.ris --output D:\papers\library.jsonl --report outputs\bibliography_conversion_report.json
```

Then run the read-only preflight:

```powershell
node scripts\v20_real_library_preflight.mjs D:\papers\library.jsonl --min-valid-rows 100000 --require-full-scan --output outputs\real_library_preflight.json
```

The converter is streaming-oriented and does not add a large dependency. It maps common fields into the canonical import shape:

| Canonical field | BibTeX examples | RIS examples |
| --- | --- | --- |
| `title` | `title`, `booktitle` | `TI`, `T1`, `CT` |
| `abstract` | `abstract`, `annotation`, `annote`, `note` | `AB`, `N2` |
| `year` / `publishedDate` | `year`, `date` | `PY`, `Y1`, `DA` |
| `authors` | `author`, `editor` | `AU`, `A1`, `A2` |
| `categories` | `keywords`, `keyword`, `subjects`, `tags` | `KW`, `M1`, `M3` |
| `doi` | `doi` | `DO` |
| `url` | `url`, `howpublished`, `pdf` | `UR`, `L1`, `L2`, `LK` |
| `venue` | `journal`, `booktitle`, `publisher` | `JO`, `JF`, `T2`, `PB` |

Sample files:

```text
data/samples/papers_sample.bib
data/samples/papers_sample.ris
```

## Minimal Required Field

Only `title` is strictly required.

If `abstract` is empty, the app fills a local-import placeholder. For real research analysis, provide abstracts whenever possible, because cleaning, clustering, keyword extraction, trend judgement, and report evidence quality all become stronger with abstracts.

## Recommended Fields

```json
{
  "id": "paper-000001",
  "title": "Retrieval-Augmented Agents for Scientific Literature Synthesis",
  "abstract": "This paper studies retrieval-augmented scientific agents...",
  "year": 2026,
  "source": "arxiv",
  "field": "Artificial Intelligence",
  "doi": "10.0000/example.1",
  "url": "https://example.org/paper-1",
  "authors": "Zhang Wei; Li Ming",
  "categories": "retrieval augmented generation; scientific agents"
}
```

## Supported Field Aliases

The importer accepts English and common Chinese aliases.

| Canonical field | Accepted aliases |
| --- | --- |
| `id` | `id`, `paper_id`, `paperid`, `编号`, `文献编号` |
| `title` | `title`, `name`, `display_name`, `paper_title`, `题名`, `标题`, `论文标题`, `文献标题` |
| `abstract` | `abstract`, `summary`, `description`, `摘要`, `简介`, `内容摘要` |
| `year` | `year`, `publication_year`, `published_year`, `date`, `published`, `发表年份`, `年份`, `出版年` |
| `source` | `source`, `database`, `platform`, `来源`, `数据源` |
| `field` | `field`, `discipline`, `subject`, `category`, `学科`, `领域`, `分类` |
| `doi` | `doi`, `DOI` |
| `url` | `url`, `link`, `landing_page_url`, `pdf_url`, `链接`, `网址` |
| `authors` | `authors`, `author`, `creator`, `作者`, `作者列表` |
| `categories` | `categories`, `keywords`, `concepts`, `tags`, `关键词`, `主题词` |

## Source Normalization

The importer normalizes sources as:

- contains `arxiv` -> `arxiv`
- contains `openalex` -> `openalex`
- contains `cnki` or `知网` -> `cnki`
- otherwise -> `local`

## JSONL Example

See:

```text
data/samples/papers_sample.jsonl
```

Each line is a complete JSON object:

```jsonl
{"id":"sample-001","title":"Retrieval-Augmented Agents for Scientific Literature Synthesis","abstract":"This paper studies retrieval-augmented scientific agents for evidence-grounded literature synthesis.","year":2026,"source":"arxiv","field":"Artificial Intelligence","doi":"10.0000/sample.1","url":"https://example.org/sample-1","authors":"Zhang Wei; Li Ming","categories":"retrieval augmented generation; scientific agents"}
```

## CSV Example

See:

```text
data/samples/papers_sample.csv
```

CSV must include a header row. Use UTF-8 encoding.

## JSON Example

JSON can be:

```json
[
  { "title": "Paper A", "abstract": "..." },
  { "title": "Paper B", "abstract": "..." }
]
```

or wrapped:

```json
{
  "papers": [
    { "title": "Paper A", "abstract": "..." }
  ]
}
```

Supported wrapper keys:

```text
papers, data, items, results, records
```

## Duplicate Logic

Rows are considered duplicates by:

1. `doi`, if present.
2. `url`, if DOI is missing.
3. normalized `title`, if DOI and URL are missing.

## Recoverable Large-File Import

The desktop large-file import path is designed to be safe to rerun after an interruption.

- Rows are written in batches of `1000`.
- Each flushed batch is committed in one SQLite transaction.
- Paper IDs are scoped by project.
- Re-running the same source file updates already imported rows and inserts missing rows instead of duplicating the library.
- The desktop import progress panel shows this recovery guidance during large-file import.
- The task log for `SQLite 大文件直导` records the same recovery strategy in `rawOutput`.

The headless import report includes:

```json
{
  "manifestPath": "D:\\ResearchHotspotsDesktop\\library\\import-manifests\\paper-import-cli-...json",
  "recovery": {
    "safeToRerun": true,
    "batchSize": 1000,
    "strategy": "Re-run the same source file after interruption..."
  }
}
```

The manifest is also written as JSON under the SQLite library directory:

```text
<database-dir>\import-manifests\<task-id>.json
```

It records task id, source file path, SQLite path, status, processed rows, inserted/updated/invalid/duplicate counts, elapsed time, and the same recovery policy. The default acceptance script copies the sample manifest evidence to `outputs/v20_import_manifest_check.json`.

This recovery strategy is covered by the Rust test `paper_file_import_is_idempotent_for_resume_recovery`, which imports the same JSONL file twice and verifies that the second pass updates existing records without increasing the SQLite row count.

## Preflight Check

Run:

```powershell
node scripts\v20_import_format_check.mjs
```

Expected result:

```text
Import format check passed: jsonl=4, csv=4, bib=2, ris=2
```

This verifies the sample files using the same frontend parser used by import preview.

For a real library file, run the read-only preflight script before importing:

```powershell
node scripts\v20_real_library_preflight.mjs D:\papers\library.jsonl --output outputs\real_library_preflight.json
```

For a very large file, you can sample the first rows first:

```powershell
node scripts\v20_real_library_preflight.mjs D:\papers\library.jsonl --max-rows 10000 --output outputs\real_library_preflight_sample.json
```

The preflight report does not write SQLite. It reports valid rows, invalid rows, duplicate risks, missing abstract/year rates, source distribution, field distribution, year range, and recommendations.

Rust backend import-normalization tests:

```powershell
$env:CARGO_HOME='D:\.cargo'; cargo test import_normalization --manifest-path src-tauri\Cargo.toml -- --nocapture
```

These tests validate the desktop direct-import normalization path in `src-tauri/src/lib.rs`, including Chinese aliases, English aliases, source normalization, year parsing, array-to-text conversion, and default abstract behavior.

## Real 100k Library Advice

Before importing the full library:

1. Export the first 100-1000 rows into JSONL.
2. Run `node scripts\v20_real_library_preflight.mjs <sample.jsonl>`.
3. Import or preview that small file.
4. Confirm valid row count, source normalization, field distribution, and duplicate count.
5. Then run preflight on the full JSONL.
6. Then import the full JSONL through `大文件直导`.
7. After import, run `健康检查` and `10 万级压力测试` if needed.
8. Then run cleaning, clustering, star-map inspection, and report generation.
