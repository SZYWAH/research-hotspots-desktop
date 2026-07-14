import { Buffer } from "node:buffer";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import ts from "typescript";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const outputDir = path.join(root, "outputs");
const execFileAsync = promisify(execFile);

await mkdir(outputDir, { recursive: true });

const sourcePath = path.join(root, "src", "lib", "importers.ts");
const source = await readFile(sourcePath, "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
    importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
  },
  fileName: sourcePath,
}).outputText;

const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled, "utf8").toString("base64")}`;
const importers = await import(moduleUrl);

const jsonlPath = path.join(root, "data", "samples", "papers_sample.jsonl");
const csvPath = path.join(root, "data", "samples", "papers_sample.csv");
const bibPath = path.join(root, "data", "samples", "papers_sample.bib");
const risPath = path.join(root, "data", "samples", "papers_sample.ris");
const convertedBibPath = path.join(outputDir, "v20_bibliography_sample_bib.jsonl");
const convertedRisPath = path.join(outputDir, "v20_bibliography_sample_ris.jsonl");
const jsonlText = await readFile(jsonlPath, "utf8");
const csvText = await readFile(csvPath, "utf8");

await execFileAsync(process.execPath, [
  path.join(root, "scripts", "v20_bibliography_to_jsonl.mjs"),
  bibPath,
  "--output",
  convertedBibPath,
  "--report",
  path.join(outputDir, "v20_bibliography_sample_bib_report.json"),
]);
await execFileAsync(process.execPath, [
  path.join(root, "scripts", "v20_bibliography_to_jsonl.mjs"),
  risPath,
  "--output",
  convertedRisPath,
  "--report",
  path.join(outputDir, "v20_bibliography_sample_ris_report.json"),
]);

const convertedBibText = await readFile(convertedBibPath, "utf8");
const convertedRisText = await readFile(convertedRisPath, "utf8");

const jsonlPreview = importers.analyzePaperImport("papers_sample.jsonl", jsonlText, []);
const csvPreview = importers.analyzePaperImport("papers_sample.csv", csvText, []);
const bibPreview = importers.analyzePaperImport("v20_bibliography_sample_bib.jsonl", convertedBibText, []);
const risPreview = importers.analyzePaperImport("v20_bibliography_sample_ris.jsonl", convertedRisText, []);

const checks = [
  ["jsonl valid rows", jsonlPreview.validRows.length === 4],
  ["jsonl invalid rows", jsonlPreview.invalidRows.length === 0],
  ["jsonl duplicate rows", jsonlPreview.duplicateRows.length === 0],
  ["jsonl cnki alias", jsonlPreview.validRows.some((paper) => paper.source === "cnki" && paper.title.includes("知识图谱"))],
  ["jsonl year parsing", jsonlPreview.validRows.some((paper) => paper.id === "sample-004" && paper.year === 2022)],
  ["csv valid rows", csvPreview.validRows.length === 4],
  ["csv invalid rows", csvPreview.invalidRows.length === 0],
  ["csv duplicate rows", csvPreview.duplicateRows.length === 0],
  ["csv openalex source", csvPreview.validRows.some((paper) => paper.source === "openalex")],
  ["csv local source", csvPreview.validRows.some((paper) => paper.source === "local")],
  ["bib converted valid rows", bibPreview.validRows.length === 2],
  ["bib converted invalid rows", bibPreview.invalidRows.length === 0],
  ["bib converted year parsing", bibPreview.validRows.some((paper) => paper.year === 2026)],
  ["bib converted doi", bibPreview.validRows.some((paper) => paper.doi === "10.0000/sample-bib.1")],
  ["ris converted valid rows", risPreview.validRows.length === 2],
  ["ris converted invalid rows", risPreview.invalidRows.length === 0],
  ["ris converted year parsing", risPreview.validRows.some((paper) => paper.year === 2025)],
  ["ris converted authors", risPreview.validRows.some((paper) => paper.authors.includes("Chen"))],
];

const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
const result = {
  passed: failed.length === 0,
  failed,
  jsonl: {
    totalRows: jsonlPreview.totalRows,
    validRows: jsonlPreview.validRows.length,
    invalidRows: jsonlPreview.invalidRows.length,
    duplicateRows: jsonlPreview.duplicateRows.length,
    sourceCounts: jsonlPreview.sourceCounts,
    fieldCounts: jsonlPreview.fieldCounts,
  },
  csv: {
    totalRows: csvPreview.totalRows,
    validRows: csvPreview.validRows.length,
    invalidRows: csvPreview.invalidRows.length,
    duplicateRows: csvPreview.duplicateRows.length,
    sourceCounts: csvPreview.sourceCounts,
    fieldCounts: csvPreview.fieldCounts,
  },
  bib: {
    totalRows: bibPreview.totalRows,
    validRows: bibPreview.validRows.length,
    invalidRows: bibPreview.invalidRows.length,
    duplicateRows: bibPreview.duplicateRows.length,
    sourceCounts: bibPreview.sourceCounts,
    fieldCounts: bibPreview.fieldCounts,
  },
  ris: {
    totalRows: risPreview.totalRows,
    validRows: risPreview.validRows.length,
    invalidRows: risPreview.invalidRows.length,
    duplicateRows: risPreview.duplicateRows.length,
    sourceCounts: risPreview.sourceCounts,
    fieldCounts: risPreview.fieldCounts,
  },
  sampleFiles: {
    jsonl: "data/samples/papers_sample.jsonl",
    csv: "data/samples/papers_sample.csv",
    bib: "data/samples/papers_sample.bib",
    ris: "data/samples/papers_sample.ris",
    convertedBib: "outputs/v20_bibliography_sample_bib.jsonl",
    convertedRis: "outputs/v20_bibliography_sample_ris.jsonl",
  },
};

await writeFile(path.join(outputDir, "v20_import_format_check.json"), JSON.stringify(result, null, 2), "utf8");

if (failed.length > 0) {
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
}

console.log(`Import format check passed: jsonl=${jsonlPreview.validRows.length}, csv=${csvPreview.validRows.length}, bib=${bibPreview.validRows.length}, ris=${risPreview.validRows.length}`);
