import { spawnSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const outputDir = path.join(root, "outputs");
const tempDir = path.join(root, "work", "report-export-audit-check");
const auditScript = path.join(root, "scripts", "v20_report_export_audit.mjs");

await mkdir(outputDir, { recursive: true });
await rm(tempDir, { recursive: true, force: true });
await mkdir(tempDir, { recursive: true });

try {
  const fullCoverageReport = path.join(tempDir, "report-full-coverage.md");
  const partialCoverageReport = path.join(tempDir, "report-partial-coverage.md");
  await writeFile(fullCoverageReport, buildReport("[1][2][3]"), "utf8");
  await writeFile(partialCoverageReport, buildReport("[1][2]"), "utf8");

  const cases = [
    {
      name: "full citation coverage passes",
      reportPath: fullCoverageReport,
      outputPath: path.join(outputDir, "v20_report_export_audit_coverage_pass.json"),
      expectStatus: 0,
    },
    {
      name: "partial citation coverage fails",
      reportPath: partialCoverageReport,
      outputPath: path.join(outputDir, "v20_report_export_audit_coverage_fail.json"),
      expectStatus: 1,
    },
  ];

  const results = cases.map((testCase) => {
    const result = spawnSync(
      process.execPath,
      [
        auditScript,
        testCase.reportPath,
        "--output",
        testCase.outputPath,
        "--require-evidence",
        "--require-sections",
        "--require-references",
        "--min-citations",
        "1",
        "--min-references",
        "3",
        "--min-chars",
        "200",
        "--min-citation-coverage",
        "1",
      ],
      {
        cwd: root,
        encoding: "utf8",
        shell: false,
      },
    );
    return {
      name: testCase.name,
      passed: result.status === testCase.expectStatus,
      expectedStatus: testCase.expectStatus,
      actualStatus: result.status,
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
      output: path.relative(root, testCase.outputPath),
    };
  });

  const failed = results.filter((item) => !item.passed);
  const summaryPath = path.join(outputDir, "v20_report_export_audit_check.json");
  await writeFile(
    summaryPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        passed: failed.length === 0,
        failed: failed.map((item) => item.name),
        caseCount: results.length,
        results,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  if (failed.length > 0) {
    console.error(`Report export audit check failed: ${failed.map((item) => item.name).join(", ")}`);
    process.exit(1);
  }

  console.log(`Report export audit check passed: cases=${results.length}`);
  console.log(`Summary: ${summaryPath}`);
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

function buildReport(citations) {
  return `# Evidence-Grounded Research Hotspot Report

## Evidence Overview
The evidence profile is grounded in three representative papers and keeps all claims auditable ${citations}.

## Hotspot Overview
This hotspot describes local-first research analysis, citation-bound reporting, and star-map evidence tracing ${citations}.

## Representative Papers
The representative papers cover local SQLite storage, hotspot report generation, and semantic visualization ${citations}.

## Year Trend
The year trend shows how research analysis systems evolve from storage infrastructure into evidence-aware reporting ${citations}.

## Source Distribution
The source distribution includes local, OpenAlex, and arXiv style records for diversity checks ${citations}.

## Keyword Network
The keyword network connects evidence chain, representative papers, source diversity, and report audit ${citations}.

## Future Directions
Future work should keep every representative reference cited by the analysis narrative ${citations}.

## References

[1] Local SQLite Evidence Chains for Research Hotspot Analysis. arXiv, 2026.
[2] Citation Coverage Audits for Literature Reports. OpenAlex, 2025.
[3] Semantic Star Maps and Representative Paper Tracing. CNKI, 2024.
`;
}
