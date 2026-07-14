import { spawnSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const outputDir = path.join(root, "outputs");
const tempDir = path.join(root, "work", "bibliography-conversion-check");
const summaryPath = path.join(outputDir, "v20_bibliography_conversion_check.json");

await mkdir(outputDir, { recursive: true });
await rm(tempDir, { recursive: true, force: true });
await mkdir(tempDir, { recursive: true });

const paths = {
  bibSource: path.join(tempDir, "real-library.bib"),
  risSource: path.join(tempDir, "real-library.ris"),
  bibJsonl: path.join(outputDir, "v20_bibliography_check_bib.jsonl"),
  risJsonl: path.join(outputDir, "v20_bibliography_check_ris.jsonl"),
  bibReport: path.join(outputDir, "v20_bibliography_check_bib_report.json"),
  risReport: path.join(outputDir, "v20_bibliography_check_ris_report.json"),
  bibPreflight: path.join(outputDir, "v20_bibliography_check_bib_preflight.json"),
  risPreflight: path.join(outputDir, "v20_bibliography_check_ris_preflight.json"),
  discoveryJson: path.join(outputDir, "v20_bibliography_discovery_check.json"),
  discoveryMarkdown: path.join(outputDir, "V20_BIBLIOGRAPHY_DISCOVERY_CHECK.md"),
};

try {
  await writeFile(paths.bibSource, await readFile(path.join(root, "data", "samples", "papers_sample.bib"), "utf8"), "utf8");
  await writeFile(paths.risSource, await readFile(path.join(root, "data", "samples", "papers_sample.ris"), "utf8"), "utf8");

  const runs = {
    bibConvert: runNode(["scripts\\v20_bibliography_to_jsonl.mjs", paths.bibSource, "--output", paths.bibJsonl, "--report", paths.bibReport]),
    risConvert: runNode(["scripts\\v20_bibliography_to_jsonl.mjs", paths.risSource, "--output", paths.risJsonl, "--report", paths.risReport]),
    bibPreflight: null,
    risPreflight: null,
    discovery: null,
  };
  runs.bibPreflight = runNode([
    "scripts\\v20_real_library_preflight.mjs",
    paths.bibJsonl,
    "--output",
    paths.bibPreflight,
    "--min-valid-rows",
    "2",
    "--require-full-scan",
  ]);
  runs.risPreflight = runNode([
    "scripts\\v20_real_library_preflight.mjs",
    paths.risJsonl,
    "--output",
    paths.risPreflight,
    "--min-valid-rows",
    "2",
    "--require-full-scan",
  ]);
  runs.discovery = runNode([
    "scripts\\v20_real_data_discovery.mjs",
    "--root",
    tempDir,
    "--output",
    paths.discoveryJson,
    "--markdown",
    paths.discoveryMarkdown,
    "--min-final-rows",
    "2",
    "--max-files",
    "20",
  ]);

  const bibReport = await readJson(paths.bibReport);
  const risReport = await readJson(paths.risReport);
  const bibPreflight = await readJson(paths.bibPreflight);
  const risPreflight = await readJson(paths.risPreflight);
  const discovery = await readJson(paths.discoveryJson);
  const bibRows = await readJsonLines(paths.bibJsonl);
  const risRows = await readJsonLines(paths.risJsonl);

  const checks = [
    check("BibTeX conversion command succeeds", runs.bibConvert.status === 0, runs.bibConvert),
    check("RIS conversion command succeeds", runs.risConvert.status === 0, runs.risConvert),
    check("BibTeX conversion keeps two valid records", bibReport.convertedRows === 2 && bibReport.invalidRows === 0, bibReport),
    check("RIS conversion keeps two valid records", risReport.convertedRows === 2 && risReport.invalidRows === 0, risReport),
    check("BibTeX JSONL preserves DOI and year", bibRows.some((row) => row.doi === "10.0000/sample-bib.1" && row.year === 2026), bibRows),
    check("RIS JSONL preserves authors and year", risRows.some((row) => String(row.authors).includes("Chen") && row.year === 2025), risRows),
    check("BibTeX converted JSONL passes strict preflight", runs.bibPreflight.status === 0 && bibPreflight.strictGate?.passed === true && bibPreflight.validRows === 2, bibPreflight),
    check("RIS converted JSONL passes strict preflight", runs.risPreflight.status === 0 && risPreflight.strictGate?.passed === true && risPreflight.validRows === 2, risPreflight),
    check("Pure bibliography directory is discovered as conversion-ready", runs.discovery.status === 0 && discovery.gatePlan?.status === "conversion_ready_source_found", discovery.gatePlan),
    check("Discovery final gate command keeps terminal hard stop", String(discovery.gatePlan?.finalAcceptanceCommand ?? "").includes("-RequireLiveAi") && String(discovery.gatePlan?.finalAcceptanceCommand ?? "").includes("-RequireTerminalReady"), discovery.gatePlan),
  ];

  const failed = checks.filter((item) => !item.passed);
  await writeFile(
    summaryPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        passed: failed.length === 0,
        failed: failed.map((item) => item.name),
        caseCount: checks.length,
        outputs: {
          bibJsonl: "outputs/v20_bibliography_check_bib.jsonl",
          risJsonl: "outputs/v20_bibliography_check_ris.jsonl",
          bibReport: "outputs/v20_bibliography_check_bib_report.json",
          risReport: "outputs/v20_bibliography_check_ris_report.json",
          bibPreflight: "outputs/v20_bibliography_check_bib_preflight.json",
          risPreflight: "outputs/v20_bibliography_check_ris_preflight.json",
          discovery: "outputs/v20_bibliography_discovery_check.json",
          discoveryMarkdown: "outputs/V20_BIBLIOGRAPHY_DISCOVERY_CHECK.md",
        },
        runs: Object.fromEntries(Object.entries(runs).map(([name, run]) => [name, summarizeRun(run)])),
        checks,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  if (failed.length > 0) {
    console.error(`Bibliography conversion check failed: ${failed.map((item) => item.name).join(", ")}`);
    process.exit(1);
  }

  console.log(`Bibliography conversion check passed: cases=${checks.length}`);
  console.log(`Summary: ${summaryPath}`);
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

function runNode(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
    shell: false,
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function check(name, passed, evidence) {
  return {
    name,
    passed: Boolean(passed),
    evidence: summarizeEvidence(evidence),
  };
}

function summarizeEvidence(value) {
  if (Array.isArray(value)) return value.slice(0, 3);
  if (value && typeof value === "object" && "stdout" in value) return summarizeRun(value);
  if (value && typeof value === "object") return value;
  return value ?? null;
}

function summarizeRun(run) {
  return {
    status: run?.status ?? null,
    stdoutTail: tailLines(run?.stdout, 4),
    stderrTail: tailLines(run?.stderr, 4),
  };
}

async function readJson(filePath) {
  return JSON.parse((await readFile(filePath, "utf8")).replace(/^\uFEFF/, ""));
}

async function readJsonLines(filePath) {
  const text = await readFile(filePath, "utf8");
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

function tailLines(value, maxLines) {
  return String(value ?? "").trim().split(/\r?\n/).slice(-maxLines).join("\n");
}
