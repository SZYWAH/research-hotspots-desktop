import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const outputDir = path.join(root, "outputs");
const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  printHelp();
  process.exit(0);
}

const jsonOutput = path.resolve(readOption("--output") || path.join(outputDir, "v20_terminal_runbook.json"));
const mdOutput = path.resolve(readOption("--markdown") || path.join(outputDir, "V20_TERMINAL_RUNBOOK.md"));
const libraryPath = readOption("--library-path") || "D:\\papers\\library.jsonl";
const bibliographyPath = readOption("--bibliography-path") || "D:\\papers\\library.bib";
const databaseDir = readOption("--database-dir") || "D:\\ResearchHotspotsDesktop\\library";
const discoveryRoot = readOption("--discovery-root") || "D:\\papers";
const uiSmokePath = readOption("--ui-smoke") || "outputs\\v20_ui_final_smoke.json";
const aiLiveSmokePath = readOption("--ai-live-smoke") || "outputs\\v20_ai_live_report_smoke.json";
const refreshAudit = !args.includes("--no-refresh");

await mkdir(path.dirname(jsonOutput), { recursive: true });
await mkdir(path.dirname(mdOutput), { recursive: true });

const auditRefresh = refreshAudit ? refreshGoalReadiness() : { skipped: true, status: null };
const audit = await readJsonIfExists(path.join(outputDir, "v20_goal_readiness_audit.json"));
const finalSummary = await readJsonIfExists(path.join(outputDir, "v20_final_acceptance_gate_summary.json"));
const missing = audit?.nextRequiredEvidence ?? [];
const finalReadiness = audit?.supportingEvidence?.finalReadiness ?? finalSummary?.finalReadiness ?? null;
const warnings = finalReadiness?.warnings ?? [];

const commands = [
  {
    name: "Refresh Current Status",
    when: "Any time you want to inspect current readiness.",
    command: "pnpm acceptance:status",
  },
  {
    name: "Validate Terminal Config",
    when: "Before config-driven terminal acceptance, catch typoed fields, weak thresholds, and sample-only settings.",
    command: "pnpm acceptance:validate-config -- --config configs\\v20_terminal_acceptance.example.json --strict-terminal",
  },
  {
    name: "Validate Terminal Config And Inputs",
    when: "After editing the config with real paths, fail early if the source library is missing or UI smoke / AI smoke / supplied JSON evidence is missing, failed, dry-run-only, or sample-tainted.",
    command: "pnpm acceptance:validate-config -- --config configs\\v20_terminal_acceptance.example.json --strict-terminal --check-existing-inputs",
  },
  {
    name: "Run Storage Preflight",
    when: "Before importing a 100000+ library, verify large database/import targets are on the intended drive and have enough free space.",
    command: "pnpm acceptance:storage-check -- --config configs\\v20_terminal_acceptance.example.json --min-free-gb 10 --require-min-free --require-non-c-storage",
  },
  {
    name: "Run Capacity Plan",
    when: "After discovery and storage preflight, estimate SQLite/import/backup/report space for the terminal run.",
    command: "pnpm acceptance:capacity-plan -- --discovery outputs\\v20_real_data_discovery.json --storage outputs\\v20_storage_preflight.json --min-rows 100000 --min-free-gb 10",
  },
  {
    name: "Run Capacity Plan Check",
    when: "Before final acceptance, verify capacity planning accepts ready storage, rejects low storage in strict mode, and still writes diagnostics without a real candidate.",
    command: "pnpm acceptance:capacity-plan-check",
  },
  {
    name: "Run Source Manifest",
    when: "After discovery, fingerprint the selected real source file so final evidence can be tied to a stable SHA-256 identity.",
    command: "pnpm acceptance:source-manifest -- --discovery outputs\\v20_real_data_discovery.json --output outputs\\v20_source_manifest.json --markdown outputs\\V20_SOURCE_MANIFEST.md --min-rows 100000",
  },
  {
    name: "Run Source Manifest Check",
    when: "Before final acceptance, verify source fingerprinting hashes real sources, rejects sample-like terminal sources, and writes diagnostics when no source is selected.",
    command: "pnpm acceptance:source-manifest-check",
  },
  {
    name: "Run Report Citation Coverage Check",
    when: "Before final report acceptance, verify the report-audit tool rejects reference lists that are not fully cited by the report narrative.",
    command: "pnpm report:audit-check",
  },
  {
    name: "Run Terminal Config Semantic Check",
    when: "Before final acceptance, verify config input validation rejects dry-run AI smoke, failed UI smoke, sample-tainted star-map evidence, and incomplete hotspot evidence.",
    command: "pnpm acceptance:config-check",
  },
  {
    name: "Run Terminal Config From Discovery Check",
    when: "Before final acceptance, verify discovery reports generate strict terminal configs only for real 100000+ or large BibTeX/RIS sources.",
    command: "pnpm acceptance:config-from-discovery-check",
  },
  {
    name: "Run Terminal Preparation Check",
    when: "Before final acceptance, verify the one-command terminal preparation flow reports ready/missing states correctly.",
    command: "pnpm acceptance:prepare-terminal-check",
  },
  {
    name: "Run Terminal Runbook Path Quote Check",
    when: "Before final acceptance on Windows, verify runbook commands quote Chinese paths and paths with spaces safely for PowerShell.",
    command: "pnpm acceptance:runbook-quote-check",
  },
  {
    name: "Run Final Gate Direct Evidence Check",
    when: "Before final acceptance, verify the final gate itself rejects direct fake or weak evidence files.",
    command: "pnpm acceptance:final-gate-check",
  },
  {
    name: "Discover Candidate Real Data",
    when: "Before final acceptance, point this at the folder that contains the real paper export.",
    command: `pnpm discover:real-data -- --root ${psQuote(discoveryRoot)} --output ${psQuote("outputs\\v20_real_data_discovery.json")} --markdown ${psQuote("outputs\\V20_REAL_DATA_DISCOVERY.md")}`,
  },
  {
    name: "Prepare Terminal Acceptance",
    when: "Preferred first step once the real paper export folder is known. It runs discovery, generates a strict config when possible, checks D-drive storage, and writes a concise preparation report.",
    command: `pnpm acceptance:prepare-terminal -- --root ${psQuote(discoveryRoot)} --database-dir ${psQuote(databaseDir)} --ui-smoke ${psQuote(uiSmokePath)} --ai-live-smoke ${psQuote(aiLiveSmokePath)}`,
  },
  {
    name: "Generate Terminal Config From Discovery",
    when: "After discovery reports a ready 100000+ structured source or large BibTeX/RIS source, generate a strict terminal config with D-drive storage and final evidence paths.",
    command: `pnpm acceptance:config-from-discovery -- --discovery ${psQuote("outputs\\v20_real_data_discovery.json")} --output ${psQuote("outputs\\v20_terminal_acceptance.generated.json")} --database-dir ${psQuote(databaseDir)} --ui-smoke ${psQuote(uiSmokePath)} --ai-live-smoke ${psQuote(aiLiveSmokePath)}`,
  },
  {
    name: "Convert BibTeX Or RIS If Needed",
    when: "Use this only when the real library is a .bib or .ris export.",
    command: `pnpm convert:bibliography -- ${psQuote(bibliographyPath)} --output ${psQuote(libraryPath)} --report ${psQuote("outputs\\v20_bibliography_conversion_real.json")}`,
  },
  {
    name: "Bridge AI Env If Using Legacy DEEPSEEK Variables",
    when: "Use only after confirming you want to write .env.local.",
    command: "pnpm ai:bridge-env -- --write",
  },
  {
    name: "Run Live AI Smoke",
    when: "Required before terminal completion. This makes one network-enabled provider call.",
    command: `pnpm ai:live-smoke -- --allow-network --require-live --output ${psQuote(aiLiveSmokePath)}`,
  },
  {
    name: "Run Terminal Acceptance",
    when: "Final delivery gate. It fails unless every terminal-goal requirement is proven.",
    command: [
      "pnpm acceptance:terminal --",
      `-LibraryPath ${psQuote(libraryPath)}`,
      `-DatabaseDir ${psQuote(databaseDir)}`,
      "-ImportBeforeAudit",
      "-ExportStarMap",
      "-MinStarMapEvidenceCoverage 0.8",
      "-MinStarMapEvolutionCoverage 0.8",
      "-MinStarMapSourceDistributionCoverage 0.8",
      "-RejectSampleStarMapSignals",
      "-ExportHotspotEvidence",
      "-GenerateHotspotReport",
      `-UiSmokePath ${psQuote(uiSmokePath)}`,
      `-AiLiveSmokePath ${psQuote(aiLiveSmokePath)}`,
      "-RunPressureTest",
      "-RunTauriBuild",
      "-LaunchExe",
    ].join(" "),
  },
  {
    name: "Run Terminal Acceptance From Config",
    when: "Use this after validating configs\\v20_terminal_acceptance.example.json or another config file with real paths.",
    command: "pnpm acceptance:terminal-config -- --config configs\\v20_terminal_acceptance.example.json",
  },
  {
    name: "Run Terminal Acceptance From Generated Config",
    when: "Use this after Generate Terminal Config From Discovery succeeds.",
    command: "pnpm acceptance:terminal-config -- --config outputs\\v20_terminal_acceptance.generated.json",
  },
  {
    name: "Require Complete From Existing Evidence",
    when: "Use after terminal acceptance to make the current evidence fail/pass as a CI-style check.",
    command: "pnpm acceptance:require-complete",
  },
];
const requirementActions = buildRequirementActions(missing, commands);

const result = {
  generatedAt: new Date().toISOString(),
  projectRoot: root,
  overallComplete: audit?.overallComplete ?? false,
  proven: audit?.proven ?? null,
  missing: audit?.missing ?? null,
  missingRequirements: missing,
  auditRefresh,
  finalReadiness,
  warnings,
  requirementActions,
  defaults: {
    discoveryRoot,
    libraryPath,
    bibliographyPath,
    databaseDir,
    uiSmokePath,
    aiLiveSmokePath,
  },
  commands,
};

await writeFile(jsonOutput, `${JSON.stringify(result, null, 2)}\n`, "utf8");
await writeFile(mdOutput, renderMarkdown(result), "utf8");

console.log(`Terminal runbook generated: missing=${missing.length}, complete=${result.overallComplete}`);
console.log(`JSON: ${jsonOutput}`);
console.log(`Markdown: ${mdOutput}`);

function renderMarkdown(result) {
  const missingList = result.missingRequirements.length
    ? result.missingRequirements.map((item, index) => `${index + 1}. ${item}`).join("\n")
    : "None.";
  const warningList = result.warnings.length
    ? result.warnings.map((item) => `- ${item}`).join("\n")
    : "- No final-readiness warnings are available.";
  const commandSections = result.commands
    .map(
      (item) => `### ${item.name}

${item.when}

\`\`\`powershell
${item.command}
\`\`\``,
    )
    .join("\n\n");
  const requirementActionSections = result.requirementActions.length
    ? result.requirementActions
        .map(
          (item, index) => `### ${index + 1}. ${item.requirement}

${item.why}

Evidence to produce:

${item.evidence.map((evidence) => `- \`${evidence}\``).join("\n")}

Recommended commands:

${item.commands.map((command) => `\`\`\`powershell\n${command}\n\`\`\``).join("\n\n")}`,
        )
        .join("\n\n")
    : "All audited terminal-goal requirements are currently proven.";

  return `# V20 Terminal Readiness Runbook

Generated: ${result.generatedAt}

Current completion: ${result.overallComplete}

- Proven checks: ${result.proven ?? "unknown"}
- Missing checks: ${result.missing ?? "unknown"}
- Audit report: \`outputs/V20_GOAL_READINESS_AUDIT.md\`
- Audit refreshed before runbook: ${!result.auditRefresh.skipped}

## Missing Requirements

${missingList}

## Final Readiness Warnings

${warningList}

## Missing Requirement Action Map

${requirementActionSections}

## Default Paths

- Discovery root: \`${result.defaults.discoveryRoot}\`
- Library path: \`${result.defaults.libraryPath}\`
- Bibliography path: \`${result.defaults.bibliographyPath}\`
- Database dir: \`${result.defaults.databaseDir}\`
- UI smoke: \`${result.defaults.uiSmokePath}\`
- AI live smoke: \`${result.defaults.aiLiveSmokePath}\`

## Commands

${commandSections}
`;
}

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function buildRequirementActions(missingRequirements, commandItems) {
  const commandByName = new Map(commandItems.map((item) => [item.name, item.command]));
  const terminalCommand = commandByName.get("Run Terminal Acceptance");
  const statusCommand = commandByName.get("Refresh Current Status");
  const validateConfigCommand = commandByName.get("Validate Terminal Config");
  const validateInputsCommand = commandByName.get("Validate Terminal Config And Inputs");
  const storagePreflightCommand = commandByName.get("Run Storage Preflight");
  const capacityPlanCommand = commandByName.get("Run Capacity Plan");
  const capacityPlanCheckCommand = commandByName.get("Run Capacity Plan Check");
  const sourceManifestCommand = commandByName.get("Run Source Manifest");
  const sourceManifestCheckCommand = commandByName.get("Run Source Manifest Check");
  const reportAuditCheckCommand = commandByName.get("Run Report Citation Coverage Check");
  const configSemanticCommand = commandByName.get("Run Terminal Config Semantic Check");
  const configFromDiscoveryCheckCommand = commandByName.get("Run Terminal Config From Discovery Check");
  const terminalPreparationCheckCommand = commandByName.get("Run Terminal Preparation Check");
  const terminalRunbookPathQuoteCheckCommand = commandByName.get("Run Terminal Runbook Path Quote Check");
  const finalGateCheckCommand = commandByName.get("Run Final Gate Direct Evidence Check");
  const discoveryCommand = commandByName.get("Discover Candidate Real Data");
  const prepareTerminalCommand = commandByName.get("Prepare Terminal Acceptance");
  const generateConfigFromDiscoveryCommand = commandByName.get("Generate Terminal Config From Discovery");
  const convertCommand = commandByName.get("Convert BibTeX Or RIS If Needed");
  const aiBridgeCommand = commandByName.get("Bridge AI Env If Using Legacy DEEPSEEK Variables");
  const aiSmokeCommand = commandByName.get("Run Live AI Smoke");
  const requireCompleteCommand = commandByName.get("Require Complete From Existing Evidence");
  const evidenceGuardCommands = [storagePreflightCommand, capacityPlanCommand, capacityPlanCheckCommand, sourceManifestCommand, sourceManifestCheckCommand, reportAuditCheckCommand, configSemanticCommand, configFromDiscoveryCheckCommand, terminalPreparationCheckCommand, terminalRunbookPathQuoteCheckCommand, finalGateCheckCommand];
  const actionMap = {
    "Real 100k source-file gate": {
      why: "A non-sample source file with at least 100000 valid paper rows has not been proven.",
      evidence: ["outputs/v20_real_data_discovery.json", "outputs/V20_REAL_DATA_DISCOVERY.md", "outputs/v20_real_library_preflight_user.json"],
      commands: [prepareTerminalCommand, discoveryCommand, generateConfigFromDiscoveryCommand, convertCommand, validateConfigCommand, validateInputsCommand, ...evidenceGuardCommands, terminalCommand, statusCommand],
    },
    "Real imported SQLite audit": {
      why: "The imported SQLite database has not been proven to contain the real 100000+ paper library with passing indexes and query smoke checks.",
      evidence: ["outputs/v20_import_library_final.json", "outputs/v20_sqlite_library_audit_final.json", "outputs/v20_final_acceptance_gate_summary.json"],
      commands: [validateConfigCommand, validateInputsCommand, ...evidenceGuardCommands, terminalCommand, statusCommand],
    },
    "Hotspot candidates and evidence IDs": {
      why: "The real imported library has not yet proven enough generated hotspots, semantic links, and representative evidence IDs.",
      evidence: ["outputs/v20_sqlite_library_audit_final.json", "outputs/v20_star_map_export_final.json"],
      commands: [validateConfigCommand, validateInputsCommand, ...evidenceGuardCommands, terminalCommand, statusCommand],
    },
    "Hotspot evidence bundle": {
      why: "A selected real hotspot has not yet proven representative paper snapshots, yearly evolution, source distribution, and missing-ID checks.",
      evidence: ["outputs/v20_hotspot_evidence_final.json", "outputs/v20_hotspot_evidence_final.md"],
      commands: [validateConfigCommand, validateInputsCommand, ...evidenceGuardCommands, terminalCommand, statusCommand],
    },
    "Real-data star-map acceptance": {
      why: "The star-map UI smoke exists, but it has not been tied to a real imported 100000+ library and clean star-map semantic export.",
      evidence: ["outputs/v20_ui_final_smoke.json", "outputs/v20_star_map_export_final.json", "outputs/v20_sqlite_library_audit_final.json"],
      commands: [validateConfigCommand, validateInputsCommand, ...evidenceGuardCommands, terminalCommand, statusCommand],
    },
    "AI live configuration": {
      why: "Live AI readiness requires usable VITE_DEEPSEEK_* configuration and a network-enabled smoke run.",
      evidence: ["outputs/v20_ai_config_preflight_final.json", "outputs/v20_ai_live_report_smoke.json", "outputs/v20_final_acceptance_gate_summary.json"],
      commands: [aiBridgeCommand, aiSmokeCommand, validateConfigCommand, validateInputsCommand, ...evidenceGuardCommands, terminalCommand, statusCommand],
    },
    "Real exported report evidence chain": {
      why: "A real hotspot report has not yet proven citations, references, evidence sections, and report audit against real representative papers.",
      evidence: ["outputs/v20_hotspot_report_final.md", "outputs/v20_hotspot_report_final.html", "outputs/v20_report_export_audit_final.json"],
      commands: [validateConfigCommand, validateInputsCommand, ...evidenceGuardCommands, terminalCommand, requireCompleteCommand, statusCommand],
    },
  };
  return missingRequirements.map((requirement) => {
    const action = actionMap[requirement] ?? {
      why: "This missing requirement is not mapped yet; refresh the status report and inspect the audit detail.",
      evidence: ["outputs/V20_GOAL_READINESS_AUDIT.md"],
      commands: [statusCommand],
    };
    return {
      requirement,
      why: action.why,
      evidence: action.evidence,
      commands: action.commands.filter(Boolean),
    };
  });
}

function readOption(name) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  return args[index + 1];
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

function refreshGoalReadiness() {
  const result = spawnSync(
    process.execPath,
    [path.join(root, "scripts", "v20_goal_readiness_audit.mjs")],
    {
      cwd: root,
      stdio: "inherit",
      shell: false,
    },
  );
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`Goal readiness audit refresh failed with exit code ${result.status}.`);
  }
  return {
    skipped: false,
    status: result.status,
  };
}

function printHelp() {
  console.log(`
Usage:
  node scripts/v20_terminal_runbook.mjs [options]

Options:
  --output <path>          JSON output path.
  --markdown <path>        Markdown output path.
  --discovery-root <path>  Folder to scan for real paper exports.
  --library-path <path>    Expected final source library path.
  --bibliography-path <path> Expected BibTeX/RIS source path for conversion command.
  --database-dir <path>    Expected final SQLite database directory.
  --ui-smoke <path>        Final UI smoke report path.
  --ai-live-smoke <path>   Final live AI smoke report path.
  --no-refresh             Use existing readiness audit instead of refreshing first.
`);
}
