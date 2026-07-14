import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const outputDir = path.join(root, "outputs");
const summaryPath = path.join(outputDir, "v20_terminal_runbook_path_quote_check.json");
const runbookJsonPath = path.join(outputDir, "v20_terminal_runbook_path_quote_check.runbook.json");
const runbookMarkdownPath = path.join(outputDir, "V20_TERMINAL_RUNBOOK_PATH_QUOTE_CHECK.md");

const discoveryRoot = "D:\\\u8bba\u6587 \u6570\u636e";
const libraryPath = `${discoveryRoot}\\\u771f\u5b9e library.jsonl`;
const bibliographyPath = `${discoveryRoot}\\\u5bfc\u51fa library.bib`;
const databaseDir = "D:\\Research Hotspots Desktop\\\u771f\u5b9e library";
const uiSmokePath = "outputs\\v20_ui_final_smoke.json";
const aiLiveSmokePath = "outputs\\v20_ai_live_report_smoke.json";

await mkdir(outputDir, { recursive: true });

const runbook = spawnSync(
  process.execPath,
  [
    "scripts\\v20_terminal_runbook.mjs",
    "--no-refresh",
    "--output",
    runbookJsonPath,
    "--markdown",
    runbookMarkdownPath,
    "--discovery-root",
    discoveryRoot,
    "--library-path",
    libraryPath,
    "--bibliography-path",
    bibliographyPath,
    "--database-dir",
    databaseDir,
    "--ui-smoke",
    uiSmokePath,
    "--ai-live-smoke",
    aiLiveSmokePath,
  ],
  {
    cwd: root,
    encoding: "utf8",
    shell: false,
  },
);

const results = [];
if (runbook.status !== 0) {
  results.push({
    name: "runbook generation succeeds for Chinese and spaced paths",
    passed: false,
    detail: `status=${runbook.status}, stderr=${tailLines(runbook.stderr, 4)}`,
  });
} else {
  const generated = await readJson(runbookJsonPath);
  const markdown = await readFile(runbookMarkdownPath, "utf8");
  const commandByName = new Map(generated.commands.map((item) => [item.name, item.command]));

  addCase(results, "discovery root is single-quoted", commandByName.get("Discover Candidate Real Data"), `--root '${discoveryRoot}'`);
  addCase(results, "bibliography input is single-quoted", commandByName.get("Convert BibTeX Or RIS If Needed"), `-- '${bibliographyPath}'`);
  addCase(results, "converted library output is single-quoted", commandByName.get("Convert BibTeX Or RIS If Needed"), `--output '${libraryPath}'`);
  addCase(results, "terminal library path is single-quoted", commandByName.get("Run Terminal Acceptance"), `-LibraryPath '${libraryPath}'`);
  addCase(results, "terminal database dir is single-quoted", commandByName.get("Run Terminal Acceptance"), `-DatabaseDir '${databaseDir}'`);
  addCase(results, "prepare-terminal database dir is single-quoted", commandByName.get("Prepare Terminal Acceptance"), `--database-dir '${databaseDir}'`);
  addCase(results, "generated-config database dir is single-quoted", commandByName.get("Generate Terminal Config From Discovery"), `--database-dir '${databaseDir}'`);
  addCase(results, "live AI smoke output is single-quoted", commandByName.get("Run Live AI Smoke"), `--output '${aiLiveSmokePath}'`);
  addCase(results, "markdown preserves quoted Chinese discovery root", markdown, `--root '${discoveryRoot}'`);
  addCase(results, "markdown preserves quoted terminal database dir", markdown, `-DatabaseDir '${databaseDir}'`);
}

const failed = results.filter((item) => !item.passed);
const summary = {
  generatedAt: new Date().toISOString(),
  passed: failed.length === 0,
  failed: failed.map((item) => item.name),
  caseCount: results.length,
  runbookJson: "outputs/v20_terminal_runbook_path_quote_check.runbook.json",
  runbookMarkdown: "outputs/V20_TERMINAL_RUNBOOK_PATH_QUOTE_CHECK.md",
  defaults: {
    discoveryRoot,
    libraryPath,
    bibliographyPath,
    databaseDir,
    uiSmokePath,
    aiLiveSmokePath,
  },
  results,
};

await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

if (failed.length > 0) {
  console.error(`Terminal runbook path quote check failed: ${failed.map((item) => item.name).join(", ")}`);
  process.exit(1);
}

console.log(`Terminal runbook path quote check passed: cases=${results.length}`);
console.log(`Summary: ${summaryPath}`);
console.log(`Markdown: ${runbookMarkdownPath}`);

function addCase(results, name, haystack, needle) {
  results.push({
    name,
    passed: typeof haystack === "string" && haystack.includes(needle),
    expectedFragment: needle,
    evidenceExcerpt: typeof haystack === "string" ? excerpt(haystack, needle) : null,
  });
}

function excerpt(value, needle) {
  const index = value.indexOf(needle);
  if (index < 0) return value.slice(0, 600);
  const start = Math.max(0, index - 180);
  const end = Math.min(value.length, index + needle.length + 180);
  return value.slice(start, end);
}

async function readJson(filePath) {
  return JSON.parse((await readFile(filePath, "utf8")).replace(/^\uFEFF/, ""));
}

function tailLines(value, maxLines) {
  return String(value ?? "").trim().split(/\r?\n/).slice(-maxLines).join("\n");
}
