import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
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

const jsonOutput = path.resolve(readOption("--output") || path.join(outputDir, "v20_goal_readiness_audit.json"));
const mdOutput = path.resolve(readOption("--markdown") || path.join(outputDir, "V20_GOAL_READINESS_AUDIT.md"));
const requireComplete = args.includes("--require-complete");

await mkdir(path.dirname(jsonOutput), { recursive: true });
await mkdir(path.dirname(mdOutput), { recursive: true });

const packageJson = await readJson(path.join(root, "package.json"));
const tauriConf = await readJson(path.join(root, "src-tauri", "tauri.conf.json"));
const cargoToml = await readTextIfExists(path.join(root, "src-tauri", "Cargo.toml"));
const cargoVersion = cargoToml.match(/^version\s*=\s*"([^"]+)"/m)?.[1] ?? "unknown";
const appVersion = packageJson.version;

const artifacts = {
  finalAcceptance: await readTextIfExists(path.join(root, "outputs", "V20_FINAL_ACCEPTANCE.md")),
  acceptanceLog: await readTextIfExists(path.join(root, "outputs", "v20_acceptance_check.log")),
  finalGate: await readJsonIfExists(path.join(root, "outputs", "v20_final_acceptance_gate_summary.json")),
  aiConfig: await readJsonIfExists(path.join(root, "outputs", "v20_ai_config_preflight.json")),
  aiEnvBridge: await readJsonIfExists(path.join(root, "outputs", "v20_ai_env_bridge.json")),
  aiLiveSmoke: await readJsonIfExists(path.join(root, "outputs", "v20_ai_live_report_smoke.json")),
  sqliteAudit: await readJsonIfExists(path.join(root, "outputs", "v20_sqlite_library_audit_final.json")),
  starMapExport: await readJsonIfExists(path.join(root, "outputs", "v20_star_map_export_final.json")),
  hotspotEvidence: await readJsonIfExists(path.join(root, "outputs", "v20_hotspot_evidence_final.json")),
  reportAudit: await readJsonIfExists(path.join(root, "outputs", "v20_report_export_audit_final.json")),
  reportExportAuditCheck: await readJsonIfExists(path.join(root, "outputs", "v20_report_export_audit_check.json")),
  hotspotEvidenceReportCheck: await readJsonIfExists(path.join(root, "outputs", "v20_hotspot_evidence_report_check.json")),
  uiSmoke: await readJsonIfExists(path.join(root, "outputs", "v20_ui_final_smoke.json")),
  importFormat: await readJsonIfExists(path.join(root, "outputs", "v20_import_format_check.json")),
  bibliographyConversionCheck: await readJsonIfExists(path.join(root, "outputs", "v20_bibliography_conversion_check.json")),
  dataDiscovery: await readJsonIfExists(path.join(root, "outputs", "v20_real_data_discovery.json")),
  importLibrary: await readJsonIfExists(path.join(root, "outputs", "v20_import_library_final.json")),
  importRecovery: await readJsonIfExists(path.join(root, "outputs", "v20_import_recovery_report_check.json")),
  importManifest: await readJsonIfExists(path.join(root, "outputs", "v20_import_manifest_check.json")),
  storagePreflight: await readJsonIfExists(path.join(root, "outputs", "v20_storage_preflight.json")),
  capacityPlanCheck: await readJsonIfExists(path.join(root, "outputs", "v20_capacity_plan_check.json")),
  sourceManifestCheck: await readJsonIfExists(path.join(root, "outputs", "v20_source_manifest_check.json")),
  terminalConfigValidatorCheck: await readJsonIfExists(path.join(root, "outputs", "v20_terminal_config_validator_check.json")),
  terminalConfigFromDiscoveryCheck: await readJsonIfExists(path.join(root, "outputs", "v20_terminal_config_from_discovery_check.json")),
  terminalPrepareCheck: await readJsonIfExists(path.join(root, "outputs", "v20_terminal_prepare_check.json")),
  terminalRunbookPathQuoteCheck: await readJsonIfExists(path.join(root, "outputs", "v20_terminal_runbook_path_quote_check.json")),
  finalGateDirectEvidenceCheck: await readJsonIfExists(path.join(root, "outputs", "v20_final_gate_direct_evidence_check.json")),
  readinessAuditCheck: await readJsonIfExists(path.join(root, "outputs", "v20_goal_readiness_audit_check.json")),
  evidenceChainCheck: await readJsonIfExists(path.join(root, "outputs", "v20_evidence_chain_check.json")),
};

const releaseExePath = path.join(root, "src-tauri", "target", "release", "research-hotspots-desktop.exe");
const releaseExe = await fileSummary(releaseExePath);
const versionUnified = appVersion === "0.20.0" && tauriConf.version === "0.20.0" && cargoVersion === "0.20.0";
const acceptanceCorePassed = /V20 acceptance (?:core checks|check) completed/.test(artifacts.acceptanceLog);
const defaultAcceptancePassed = acceptanceCorePassed && !/Command failed|throw|failed:/i.test(stripExpectedWords(artifacts.acceptanceLog));
const heavyPressureDocumented = /rows=100000[\s\S]*hotspots=20[\s\S]*cleaned=true/.test(artifacts.finalAcceptance);
const releaseGuiDocumented = /Release exe subsystem:\s*Windows GUI|release exe subsystem: Windows GUI|PE .{0,20}Windows GUI/i.test(
  `${artifacts.finalAcceptance}\n${artifacts.acceptanceLog}`,
);
const importRecoveryGate = Boolean(
  /paper_file_import_is_idempotent_for_resume_recovery[\s\S]*ok/.test(artifacts.acceptanceLog) &&
    artifacts.importRecovery?.import?.recovery?.safeToRerun === true &&
    artifacts.importRecovery?.import?.recovery?.batchSize === 1000 &&
    artifacts.importRecovery?.import?.manifestPath &&
    artifacts.importManifest?.status === "done" &&
    artifacts.importManifest?.recovery?.safeToRerun === true,
);

const finalGate = artifacts.finalGate ?? {};
const finalReadiness = finalGate.finalReadiness && typeof finalGate.finalReadiness === "object" ? finalGate.finalReadiness : null;
const sourceManifestSummaryReady = Boolean(
  finalGate.sourceManifestTerminalCandidate === true &&
    finalGate.sourceManifestSampleLike === false &&
    typeof finalGate.sourceManifestSha256 === "string" &&
    /^[a-f0-9]{64}$/i.test(finalGate.sourceManifestSha256),
);
const realSourceEvidenceGate = Boolean(
  finalGate.realLibraryGatePassed &&
    finalGate.minValidRows >= 100000 &&
    finalGate.validRows >= 100000 &&
    finalGate.baselineSkipped === false &&
    finalGate.sourceLooksSample === false &&
    sourceManifestSummaryReady,
);
const realSourceGate = finalReadiness
  ? finalReadiness.realDataSourceReady === true && realSourceEvidenceGate
  : realSourceEvidenceGate;
const importedRealSqliteEvidenceGate = Boolean(
  realSourceGate &&
    finalGate.sqliteAuditRan &&
    finalGate.sqliteAuditPassed &&
    finalGate.importedPaperCount >= 100000,
);
const importedRealSqliteGate = finalReadiness
  ? finalReadiness.realImportedSqliteReady === true && importedRealSqliteEvidenceGate
  : importedRealSqliteEvidenceGate;
const realStarMapEvidenceGate = Boolean(
  importedRealSqliteGate &&
    finalGate.starMapExportRan &&
    finalGate.starMapExportPassed &&
    finalGate.starMapHotspotCount >= 10 &&
    finalGate.starMapEvidenceIdCount >= 10 &&
    artifacts.starMapExport?.strictGate?.passed &&
    (artifacts.starMapExport?.evidenceProfile?.evidenceCoverage ?? 0) >= 0.8 &&
    (artifacts.starMapExport?.evidenceProfile?.evolutionCoverage ?? 0) >= 0.8 &&
    (artifacts.starMapExport?.evidenceProfile?.sourceDistributionCoverage ?? 0) >= 0.8 &&
    finalGate.rejectSampleStarMapSignals === true &&
    (artifacts.starMapExport?.evidenceProfile?.sampleSignalCount ?? 1) === 0,
);
const realStarMapExportGate = finalReadiness
  ? finalReadiness.realStarMapReady === true && realStarMapEvidenceGate
  : realStarMapEvidenceGate;
const realHotspotEvidenceEvidenceGate = Boolean(
  realStarMapExportGate &&
    finalGate.hotspotEvidenceRan &&
    finalGate.hotspotEvidencePassed &&
    finalGate.hotspotRepresentativePaperCount >= 3 &&
    finalGate.hotspotMissingRepresentativeIds === 0 &&
    artifacts.hotspotEvidence?.strictGate?.passed,
);
const realHotspotEvidenceGate = finalReadiness
  ? finalReadiness.hotspotEvidenceReady === true && realHotspotEvidenceEvidenceGate
  : realHotspotEvidenceEvidenceGate;
const liveAiSmokeGate = Boolean(
  artifacts.aiLiveSmoke?.mode === "network-enabled" &&
    artifacts.aiLiveSmoke?.network?.called === true &&
    artifacts.aiLiveSmoke?.strictGate?.passed === true &&
    artifacts.aiLiveSmoke?.reportAudit?.passed === true,
);
const liveAiEvidenceGate = Boolean(finalGate.liveAiRequired && finalGate.readyForLiveAi && liveAiSmokeGate);
const liveAiGate = finalReadiness ? finalReadiness.liveAiReady === true && liveAiEvidenceGate : liveAiEvidenceGate;
const reportPath = String(artifacts.reportAudit?.reportPath ?? finalGate.hotspotReportPath ?? finalGate.outputs?.reportExportAudit ?? "");
const reportLooksSample = /v20_report_layer_check|hotspot_report_sample|sample/i.test(reportPath);
const realReportEvidenceGate = Boolean(
  importedRealSqliteGate &&
    realHotspotEvidenceGate &&
    finalGate.reportAuditRan &&
    finalGate.reportAuditPassed &&
    finalGate.reportCitationCount >= 3 &&
    finalGate.reportReferenceCount >= 3 &&
    finalGate.evidenceChainPassed === true &&
    !reportLooksSample,
);
const realReportGate = finalReadiness
  ? finalReadiness.realReportReady === true && finalReadiness.evidenceChainReady === true && realReportEvidenceGate
  : realReportEvidenceGate;
const offlineHotspotEvidenceReportGate = Boolean(
  artifacts.hotspotEvidenceReportCheck?.passed === true &&
    (artifacts.hotspotEvidenceReportCheck?.paperCount ?? 0) >= 3 &&
    [
      "## Evidence Overview",
      "## Hotspot Overview",
      "## Representative Papers",
      "## Year Trend",
      "## Source Distribution",
      "## Keyword Network",
      "## Future Directions",
      "## References",
    ].every((section) => artifacts.hotspotEvidenceReportCheck?.checkedSections?.includes(section)),
);
const reportExportAuditGate = Boolean(
  artifacts.reportExportAuditCheck?.passed === true &&
    (artifacts.reportExportAuditCheck?.caseCount ?? 0) >= 2,
);
const terminalConfigValidatorGate = Boolean(
  artifacts.terminalConfigValidatorCheck?.passed === true &&
    (artifacts.terminalConfigValidatorCheck?.caseCount ?? 0) >= 11,
);
const terminalConfigFromDiscoveryGate = Boolean(
  artifacts.terminalConfigFromDiscoveryCheck?.passed === true &&
    (artifacts.terminalConfigFromDiscoveryCheck?.caseCount ?? 0) >= 4,
);
const bibliographyConversionGate = Boolean(
  artifacts.bibliographyConversionCheck?.passed === true &&
    (artifacts.bibliographyConversionCheck?.caseCount ?? 0) >= 10,
);
const terminalPrepareGate = Boolean(
  artifacts.terminalPrepareCheck?.passed === true &&
    (artifacts.terminalPrepareCheck?.caseCount ?? 0) >= 4,
);
const terminalRunbookPathQuoteGate = Boolean(
  artifacts.terminalRunbookPathQuoteCheck?.passed === true &&
    (artifacts.terminalRunbookPathQuoteCheck?.caseCount ?? 0) >= 10,
);
const storagePreflightGate = Boolean(
  artifacts.storagePreflight?.passed === true &&
    Array.isArray(artifacts.storagePreflight?.targets) &&
    artifacts.storagePreflight.targets.some((target) => target.name === "database storage" && target.driveLetter === "D"),
);
const capacityPlanGate = Boolean(
  artifacts.capacityPlanCheck?.passed === true &&
    (artifacts.capacityPlanCheck?.caseCount ?? 0) >= 3,
);
const sourceManifestGate = Boolean(
  artifacts.sourceManifestCheck?.passed === true &&
    (artifacts.sourceManifestCheck?.caseCount ?? 0) >= 3,
);
const finalGateDirectEvidenceResults = Array.isArray(artifacts.finalGateDirectEvidenceCheck?.results)
  ? artifacts.finalGateDirectEvidenceCheck.results
  : [];
const finalGateSourceManifestCase = finalGateDirectEvidenceResults.find(
  (item) => item?.name === "final gate writes source manifest into readiness summary",
);
const finalGateDirectEvidenceGate = Boolean(
  artifacts.finalGateDirectEvidenceCheck?.passed === true &&
    (artifacts.finalGateDirectEvidenceCheck?.caseCount ?? 0) >= 6 &&
    finalGateSourceManifestCase?.passed === true,
);
const readinessAuditGuardGate = Boolean(
  artifacts.readinessAuditCheck?.passed === true &&
    (artifacts.readinessAuditCheck?.caseCount ?? 0) >= 3,
);
const evidenceChainGate = Boolean(
  artifacts.evidenceChainCheck?.passed === true &&
    (artifacts.evidenceChainCheck?.caseCount ?? 0) >= 4,
);
const uiSmokeGate = Boolean(artifacts.uiSmoke?.gate?.passed);
const uiRealDataGate = finalReadiness
  ? Boolean(finalReadiness.uiSmokeReady === true && importedRealSqliteGate && realStarMapExportGate && finalGate.importedVisibleHotspots >= 10)
  : Boolean(uiSmokeGate && importedRealSqliteGate && realStarMapExportGate && finalGate.importedVisibleHotspots >= 10);

const checks = [
  check("Version alignment", versionUnified, `package=${appVersion}, tauri=${tauriConf.version}, cargo=${cargoVersion}`, ["package.json", "src-tauri/tauri.conf.json", "src-tauri/Cargo.toml"]),
  check("Default engineering acceptance", defaultAcceptancePassed, "v20_acceptance_check.ps1 latest log completed", ["outputs/v20_acceptance_check.log"]),
  check("Synthetic 100k pressure test", heavyPressureDocumented, "V20 acceptance notes contain 100000-row pressure evidence", ["outputs/V20_FINAL_ACCEPTANCE.md"]),
  check("Release exe / Windows GUI", Boolean(releaseExe.exists && releaseGuiDocumented), `${releaseExe.exists ? `${releaseExe.sizeBytes} bytes` : "missing exe"}; GUI evidence=${releaseGuiDocumented}`, ["src-tauri/target/release/research-hotspots-desktop.exe", "outputs/V20_FINAL_ACCEPTANCE.md"]),
  check("Import format and field normalization", Boolean(artifacts.importFormat?.passed), `importFormat.passed=${artifacts.importFormat?.passed ?? "missing"}`, ["outputs/v20_import_format_check.json"]),
  check("Bibliography conversion and preflight", bibliographyConversionGate, `passed=${artifacts.bibliographyConversionCheck?.passed ?? "missing"}, cases=${artifacts.bibliographyConversionCheck?.caseCount ?? "missing"}`, ["outputs/v20_bibliography_conversion_check.json", "outputs/v20_bibliography_check_bib_preflight.json", "outputs/v20_bibliography_check_ris_preflight.json"]),
  check("Recoverable large-file import", importRecoveryGate, `safeToRerun=${artifacts.importRecovery?.import?.recovery?.safeToRerun ?? "missing"}, batchSize=${artifacts.importRecovery?.import?.recovery?.batchSize ?? "missing"}, manifestStatus=${artifacts.importManifest?.status ?? "missing"}`, ["outputs/v20_acceptance_check.log", "outputs/v20_import_recovery_report_check.json", "outputs/v20_import_manifest_check.json"]),
  check("Report export citation coverage audit", reportExportAuditGate, `passed=${artifacts.reportExportAuditCheck?.passed ?? "missing"}, cases=${artifacts.reportExportAuditCheck?.caseCount ?? "missing"}`, ["outputs/v20_report_export_audit_check.json"]),
  check("Offline hotspot evidence report generation", offlineHotspotEvidenceReportGate, `passed=${artifacts.hotspotEvidenceReportCheck?.passed ?? "missing"}, papers=${artifacts.hotspotEvidenceReportCheck?.paperCount ?? "missing"}, sections=${artifacts.hotspotEvidenceReportCheck?.checkedSections?.length ?? "missing"}`, ["outputs/v20_hotspot_evidence_report_check.json", "outputs/v20_hotspot_evidence_offline_report_check.md"]),
  check("Storage location and free-space preflight", storagePreflightGate, `passed=${artifacts.storagePreflight?.passed ?? "missing"}, warnings=${artifacts.storagePreflight?.warnings?.length ?? "missing"}, databaseDrive=${artifacts.storagePreflight?.targets?.find((target) => target.name === "database storage")?.driveLetter ?? "missing"}`, ["outputs/v20_storage_preflight.json"]),
  check("Capacity planning workflow", capacityPlanGate, `passed=${artifacts.capacityPlanCheck?.passed ?? "missing"}, cases=${artifacts.capacityPlanCheck?.caseCount ?? "missing"}`, ["outputs/v20_capacity_plan_check.json"]),
  check("Source manifest fingerprinting", sourceManifestGate, `passed=${artifacts.sourceManifestCheck?.passed ?? "missing"}, cases=${artifacts.sourceManifestCheck?.caseCount ?? "missing"}`, ["outputs/v20_source_manifest_check.json"]),
  check("Terminal config semantic validation", terminalConfigValidatorGate, `passed=${artifacts.terminalConfigValidatorCheck?.passed ?? "missing"}, cases=${artifacts.terminalConfigValidatorCheck?.caseCount ?? "missing"}`, ["outputs/v20_terminal_config_validator_check.json"]),
  check("Terminal config generation from discovery", terminalConfigFromDiscoveryGate, `passed=${artifacts.terminalConfigFromDiscoveryCheck?.passed ?? "missing"}, cases=${artifacts.terminalConfigFromDiscoveryCheck?.caseCount ?? "missing"}`, ["outputs/v20_terminal_config_from_discovery_check.json"]),
  check("Terminal preparation workflow", terminalPrepareGate, `passed=${artifacts.terminalPrepareCheck?.passed ?? "missing"}, cases=${artifacts.terminalPrepareCheck?.caseCount ?? "missing"}`, ["outputs/v20_terminal_prepare_check.json"]),
  check("Terminal runbook PowerShell path quoting", terminalRunbookPathQuoteGate, `passed=${artifacts.terminalRunbookPathQuoteCheck?.passed ?? "missing"}, cases=${artifacts.terminalRunbookPathQuoteCheck?.caseCount ?? "missing"}`, ["outputs/v20_terminal_runbook_path_quote_check.json", "outputs/V20_TERMINAL_RUNBOOK_PATH_QUOTE_CHECK.md"]),
  check("Final gate direct evidence and source manifest integration", finalGateDirectEvidenceGate, `passed=${artifacts.finalGateDirectEvidenceCheck?.passed ?? "missing"}, cases=${artifacts.finalGateDirectEvidenceCheck?.caseCount ?? "missing"}, sourceManifestCase=${finalGateSourceManifestCase?.passed ?? "missing"}`, ["outputs/v20_final_gate_direct_evidence_check.json"]),
  check("Goal readiness audit false-positive guard", readinessAuditGuardGate, `passed=${artifacts.readinessAuditCheck?.passed ?? "missing"}, cases=${artifacts.readinessAuditCheck?.caseCount ?? "missing"}`, ["outputs/v20_goal_readiness_audit_check.json"]),
  check("Terminal evidence chain consistency", evidenceChainGate, `passed=${artifacts.evidenceChainCheck?.passed ?? "missing"}, cases=${artifacts.evidenceChainCheck?.caseCount ?? "missing"}`, ["outputs/v20_evidence_chain_check.json"]),
  check("Real 100k source-file gate", realSourceGate, `finalGate validRows=${finalGate.validRows ?? "missing"}, minValidRows=${finalGate.minValidRows ?? "missing"}, baselineSkipped=${finalGate.baselineSkipped ?? "missing"}, sourceLooksSample=${finalGate.sourceLooksSample ?? finalReadiness?.sourceLooksSample ?? "missing"}, sourceManifest=${finalGate.sourceManifestTerminalCandidate ?? finalReadiness?.sourceManifestReady ?? "missing"}, discoveryFinalCandidates=${artifacts.dataDiscovery?.finalGateCandidateCount ?? "missing"}`, ["outputs/v20_final_acceptance_gate_summary.json", "outputs/v20_real_data_discovery.json", "outputs/v20_source_manifest_final.json"]),
  check("Real imported SQLite audit", importedRealSqliteGate, `importedPaperCount=${finalGate.importedPaperCount ?? "missing"}, sqliteAuditPassed=${finalGate.sqliteAuditPassed ?? "missing"}`, ["outputs/v20_sqlite_library_audit_final.json"]),
  check("Hotspot candidates and evidence IDs", Boolean(importedRealSqliteGate && finalGate.importedVisibleHotspots >= 10 && realStarMapExportGate), `importedVisibleHotspots=${finalGate.importedVisibleHotspots ?? "missing"}, starMapHotspots=${finalGate.starMapHotspotCount ?? "missing"}, evidenceIds=${finalGate.starMapEvidenceIdCount ?? "missing"}, evidenceCoverage=${artifacts.starMapExport?.evidenceProfile?.evidenceCoverage ?? "missing"}, sampleSignalCount=${artifacts.starMapExport?.evidenceProfile?.sampleSignalCount ?? "missing"}, rejectSampleSignals=${finalGate.rejectSampleStarMapSignals ?? finalReadiness?.rejectSampleStarMapSignals ?? "missing"}`, ["outputs/v20_sqlite_library_audit_final.json", "outputs/v20_star_map_export_final.json"]),
  check("Hotspot evidence bundle", realHotspotEvidenceGate, `hotspotEvidencePassed=${finalGate.hotspotEvidencePassed ?? "missing"}, representativePapers=${finalGate.hotspotRepresentativePaperCount ?? "missing"}, missingIds=${finalGate.hotspotMissingRepresentativeIds ?? "missing"}`, ["outputs/v20_hotspot_evidence_final.json"]),
  check("Star-map UI smoke", uiSmokeGate, `uiSmokePassed=${artifacts.uiSmoke?.gate?.passed ?? "missing"}, consoleIssues=${artifacts.uiSmoke?.consoleIssues?.length ?? "missing"}`, ["outputs/v20_ui_final_smoke.json"]),
  check("Real-data star-map acceptance", uiRealDataGate, `uiSmoke=${uiSmokeGate}, importedRealSqlite=${importedRealSqliteGate}, starMapExport=${realStarMapExportGate}`, ["outputs/v20_ui_final_smoke.json", "outputs/v20_sqlite_library_audit_final.json", "outputs/v20_star_map_export_final.json"]),
  check("AI live configuration", liveAiGate, `readyForLiveAi=${finalGate.readyForLiveAi ?? artifacts.aiConfig?.effective?.readyForLiveAi ?? "missing"}, liveAiRequired=${finalGate.liveAiRequired ?? "missing"}, bridgeReadyAfter=${artifacts.aiEnvBridge?.readyAfterBridge ?? "missing"}, bridgeWrote=${artifacts.aiEnvBridge?.writeResult?.wrote ?? "missing"}, liveSmoke=${liveAiSmokeGate}`, ["outputs/v20_ai_config_preflight.json", "outputs/v20_ai_env_bridge.json", "outputs/v20_ai_live_report_smoke.json", "outputs/v20_final_acceptance_gate_summary.json"]),
  check("Real exported report evidence chain", realReportGate, `reportAuditPassed=${finalGate.reportAuditPassed ?? "missing"}, citations=${finalGate.reportCitationCount ?? "missing"}, references=${finalGate.reportReferenceCount ?? "missing"}, evidenceChain=${finalGate.evidenceChainPassed ?? finalReadiness?.evidenceChainReady ?? "missing"}, sample=${reportLooksSample}`, ["outputs/v20_report_export_audit_final.json", "outputs/v20_evidence_chain_check.json"]),
];

const proven = checks.filter((item) => item.status === "proven").length;
const missing = checks.filter((item) => item.status === "missing").length;
const overallComplete = missing === 0;
const result = {
  generatedAt: new Date().toISOString(),
  projectRoot: root,
  appVersion,
  overallComplete,
  proven,
  missing,
  checks,
  supportingEvidence: {
    realDataDiscovery: artifacts.dataDiscovery
      ? {
          generatedAt: artifacts.dataDiscovery.generatedAt,
          scannedFileCount: artifacts.dataDiscovery.scannedFileCount,
          candidateCount: artifacts.dataDiscovery.candidateCount,
          preflightSupportedCount: artifacts.dataDiscovery.preflightSupportedCount,
          finalGateCandidateCount: artifacts.dataDiscovery.finalGateCandidateCount,
          recommendations: artifacts.dataDiscovery.recommendations ?? [],
          gatePlan: artifacts.dataDiscovery.gatePlan ?? null,
          report: "outputs/v20_real_data_discovery.json",
        }
      : null,
    headlessImport: artifacts.importLibrary
      ? {
          generatedAt: artifacts.importLibrary.generatedAt,
          processedRows: artifacts.importLibrary.import?.processedRows ?? null,
          inserted: artifacts.importLibrary.import?.inserted ?? null,
          updated: artifacts.importLibrary.import?.updated ?? null,
          invalidRows: artifacts.importLibrary.import?.invalidRows ?? null,
          duplicateRows: artifacts.importLibrary.import?.duplicateRows ?? null,
          report: "outputs/v20_import_library_final.json",
        }
      : null,
    bibliographyConversion: artifacts.bibliographyConversionCheck
      ? {
          generatedAt: artifacts.bibliographyConversionCheck.generatedAt,
          passed: artifacts.bibliographyConversionCheck.passed,
          caseCount: artifacts.bibliographyConversionCheck.caseCount,
          failed: artifacts.bibliographyConversionCheck.failed ?? [],
          outputs: artifacts.bibliographyConversionCheck.outputs ?? {},
          report: "outputs/v20_bibliography_conversion_check.json",
        }
      : null,
    starMapExport: artifacts.starMapExport
      ? {
          generatedAt: artifacts.starMapExport.generatedAt,
          paperCount: artifacts.starMapExport.paperCount,
          hotspotCount: artifacts.starMapExport.hotspotCount,
          evidenceIdCount: artifacts.starMapExport.evidenceIdCount,
          semanticLinkCount: artifacts.starMapExport.semanticLinkCount,
          evidenceCoverage: artifacts.starMapExport.evidenceProfile?.evidenceCoverage ?? null,
          evolutionCoverage: artifacts.starMapExport.evidenceProfile?.evolutionCoverage ?? null,
          sourceDistributionCoverage: artifacts.starMapExport.evidenceProfile?.sourceDistributionCoverage ?? null,
          sampleSignalCount: artifacts.starMapExport.evidenceProfile?.sampleSignalCount ?? null,
          gatePassed: artifacts.starMapExport.strictGate?.passed ?? false,
          report: "outputs/v20_star_map_export_final.json",
        }
      : null,
    hotspotEvidence: artifacts.hotspotEvidence
      ? {
          generatedAt: artifacts.hotspotEvidence.generatedAt,
          selectedHotspotId: artifacts.hotspotEvidence.selectedHotspotId,
          selectedHotspotTitle: artifacts.hotspotEvidence.selectedHotspotTitle,
          representativePaperCount: artifacts.hotspotEvidence.representativePapers?.length ?? 0,
          missingRepresentativeIds: artifacts.hotspotEvidence.missingRepresentativeIds?.length ?? 0,
          yearEvolutionCount: artifacts.hotspotEvidence.yearEvolution?.length ?? 0,
          sourceDistributionCount: artifacts.hotspotEvidence.sourceDistribution?.length ?? 0,
          gatePassed: artifacts.hotspotEvidence.strictGate?.passed ?? false,
          report: "outputs/v20_hotspot_evidence_final.json",
        }
      : null,
    offlineHotspotEvidenceReport: artifacts.hotspotEvidenceReportCheck
      ? {
          generatedAt: artifacts.hotspotEvidenceReportCheck.generatedAt,
          passed: artifacts.hotspotEvidenceReportCheck.passed,
          paperCount: artifacts.hotspotEvidenceReportCheck.paperCount,
          checkedSectionCount: artifacts.hotspotEvidenceReportCheck.checkedSections?.length ?? 0,
          reportPath: artifacts.hotspotEvidenceReportCheck.reportPath,
          report: "outputs/v20_hotspot_evidence_report_check.json",
        }
      : null,
    reportExportAuditCheck: artifacts.reportExportAuditCheck
      ? {
          generatedAt: artifacts.reportExportAuditCheck.generatedAt,
          passed: artifacts.reportExportAuditCheck.passed,
          caseCount: artifacts.reportExportAuditCheck.caseCount,
          failed: artifacts.reportExportAuditCheck.failed ?? [],
          report: "outputs/v20_report_export_audit_check.json",
        }
      : null,
    terminalConfigValidator: artifacts.terminalConfigValidatorCheck
      ? {
          generatedAt: artifacts.terminalConfigValidatorCheck.generatedAt,
          passed: artifacts.terminalConfigValidatorCheck.passed,
          caseCount: artifacts.terminalConfigValidatorCheck.caseCount,
          failed: artifacts.terminalConfigValidatorCheck.failed ?? [],
          report: "outputs/v20_terminal_config_validator_check.json",
        }
      : null,
    terminalConfigFromDiscovery: artifacts.terminalConfigFromDiscoveryCheck
      ? {
          generatedAt: artifacts.terminalConfigFromDiscoveryCheck.generatedAt,
          passed: artifacts.terminalConfigFromDiscoveryCheck.passed,
          caseCount: artifacts.terminalConfigFromDiscoveryCheck.caseCount,
          failed: artifacts.terminalConfigFromDiscoveryCheck.failed ?? [],
          report: "outputs/v20_terminal_config_from_discovery_check.json",
        }
      : null,
    terminalPrepare: artifacts.terminalPrepareCheck
      ? {
          generatedAt: artifacts.terminalPrepareCheck.generatedAt,
          passed: artifacts.terminalPrepareCheck.passed,
          caseCount: artifacts.terminalPrepareCheck.caseCount,
          failed: artifacts.terminalPrepareCheck.failed ?? [],
          report: "outputs/v20_terminal_prepare_check.json",
        }
      : null,
    terminalRunbookPathQuote: artifacts.terminalRunbookPathQuoteCheck
      ? {
          generatedAt: artifacts.terminalRunbookPathQuoteCheck.generatedAt,
          passed: artifacts.terminalRunbookPathQuoteCheck.passed,
          caseCount: artifacts.terminalRunbookPathQuoteCheck.caseCount,
          failed: artifacts.terminalRunbookPathQuoteCheck.failed ?? [],
          runbookMarkdown: artifacts.terminalRunbookPathQuoteCheck.runbookMarkdown,
          report: "outputs/v20_terminal_runbook_path_quote_check.json",
        }
      : null,
    storagePreflight: artifacts.storagePreflight
      ? {
          generatedAt: artifacts.storagePreflight.generatedAt,
          passed: artifacts.storagePreflight.passed,
          warningCount: artifacts.storagePreflight.warnings?.length ?? 0,
          errorCount: artifacts.storagePreflight.errors?.length ?? 0,
          databaseDrive: artifacts.storagePreflight.targets?.find((target) => target.name === "database storage")?.driveLetter ?? null,
          report: "outputs/v20_storage_preflight.json",
        }
      : null,
    capacityPlan: artifacts.capacityPlanCheck
      ? {
          generatedAt: artifacts.capacityPlanCheck.generatedAt,
          passed: artifacts.capacityPlanCheck.passed,
          caseCount: artifacts.capacityPlanCheck.caseCount,
          failed: artifacts.capacityPlanCheck.failed ?? [],
          report: "outputs/v20_capacity_plan_check.json",
        }
      : null,
    sourceManifest: artifacts.sourceManifestCheck
      ? {
          generatedAt: artifacts.sourceManifestCheck.generatedAt,
          passed: artifacts.sourceManifestCheck.passed,
          caseCount: artifacts.sourceManifestCheck.caseCount,
          failed: artifacts.sourceManifestCheck.failed ?? [],
          report: "outputs/v20_source_manifest_check.json",
        }
      : null,
    finalGateDirectEvidence: artifacts.finalGateDirectEvidenceCheck
      ? {
          generatedAt: artifacts.finalGateDirectEvidenceCheck.generatedAt,
          passed: artifacts.finalGateDirectEvidenceCheck.passed,
          caseCount: artifacts.finalGateDirectEvidenceCheck.caseCount,
          failed: artifacts.finalGateDirectEvidenceCheck.failed ?? [],
          sourceManifestCasePassed: finalGateSourceManifestCase?.passed ?? false,
          caseNames: finalGateDirectEvidenceResults.map((item) => item.name).filter(Boolean),
          report: "outputs/v20_final_gate_direct_evidence_check.json",
        }
      : null,
    readinessAuditGuard: artifacts.readinessAuditCheck
      ? {
          generatedAt: artifacts.readinessAuditCheck.generatedAt,
          passed: artifacts.readinessAuditCheck.passed,
          caseCount: artifacts.readinessAuditCheck.caseCount,
          failed: artifacts.readinessAuditCheck.failed ?? [],
          caseNames: (artifacts.readinessAuditCheck.results ?? []).map((item) => item.name).filter(Boolean),
          report: "outputs/v20_goal_readiness_audit_check.json",
        }
      : null,
    evidenceChain: artifacts.evidenceChainCheck
      ? {
          generatedAt: artifacts.evidenceChainCheck.generatedAt,
          passed: artifacts.evidenceChainCheck.passed,
          caseCount: artifacts.evidenceChainCheck.caseCount,
          failed: artifacts.evidenceChainCheck.failed ?? [],
          currentEvidence: artifacts.evidenceChainCheck.currentEvidence ?? {},
          report: "outputs/v20_evidence_chain_check.json",
        }
      : null,
    aiEnvBridge: artifacts.aiEnvBridge
      ? {
          generatedAt: artifacts.aiEnvBridge.generatedAt,
          mode: artifacts.aiEnvBridge.mode,
          plannedUpdateCount: artifacts.aiEnvBridge.plannedUpdates?.length ?? 0,
          readyAfterBridge: artifacts.aiEnvBridge.readyAfterBridge,
          wrote: artifacts.aiEnvBridge.writeResult?.wrote ?? false,
          changedKeys: artifacts.aiEnvBridge.writeResult?.changedKeys ?? [],
          report: "outputs/v20_ai_env_bridge.json",
        }
      : null,
    aiLiveSmoke: artifacts.aiLiveSmoke
      ? {
          generatedAt: artifacts.aiLiveSmoke.generatedAt,
          mode: artifacts.aiLiveSmoke.mode,
          readyForLiveAi: artifacts.aiLiveSmoke.readyForLiveAi,
          called: artifacts.aiLiveSmoke.network?.called ?? false,
          gatePassed: artifacts.aiLiveSmoke.strictGate?.passed ?? false,
          reportAuditPassed: artifacts.aiLiveSmoke.reportAudit?.passed ?? null,
          report: "outputs/v20_ai_live_report_smoke.json",
        }
      : null,
    finalReadiness: finalReadiness
      ? {
          terminalGoalReady: finalReadiness.terminalGoalReady ?? false,
          realDataSourceReady: finalReadiness.realDataSourceReady ?? false,
          realImportedSqliteReady: finalReadiness.realImportedSqliteReady ?? false,
          realStarMapReady: finalReadiness.realStarMapReady ?? false,
          hotspotEvidenceReady: finalReadiness.hotspotEvidenceReady ?? false,
          realReportReady: finalReadiness.realReportReady ?? false,
          evidenceChainReady: finalReadiness.evidenceChainReady ?? false,
          uiSmokeReady: finalReadiness.uiSmokeReady ?? false,
          liveAiReady: finalReadiness.liveAiReady ?? false,
          warnings: finalReadiness.warnings ?? [],
          report: "outputs/v20_final_acceptance_gate_summary.json",
        }
      : null,
  },
  currentConclusion: overallComplete
    ? "All audited gates are proven. The active goal may be ready for final completion review."
    : "The project is not fully complete against the terminal goal because real 100000+ library, live AI, real-data star-map, hotspot evidence, or real exported report evidence remains unproven.",
  nextRequiredEvidence: checks.filter((item) => item.status !== "proven").map((item) => item.name),
};

await writeFile(jsonOutput, `${JSON.stringify(result, null, 2)}\n`, "utf8");
await writeFile(mdOutput, renderMarkdown(result), "utf8");

console.log(`Goal readiness audit completed: proven=${proven}, missing=${missing}, complete=${overallComplete}`);
console.log(`JSON: ${jsonOutput}`);
console.log(`Markdown: ${mdOutput}`);

if (requireComplete && !overallComplete) {
  console.error("Goal readiness is incomplete.");
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
  node scripts/v20_goal_readiness_audit.mjs [--output outputs/v20_goal_readiness_audit.json] [--markdown outputs/V20_GOAL_READINESS_AUDIT.md] [--require-complete]

This script is read-only. It summarizes which terminal-goal requirements are proven by current artifacts and which still require real data / live AI evidence.
`.trim());
}

function check(name, passed, detail, evidence) {
  return {
    name,
    status: passed ? "proven" : "missing",
    detail,
    evidence,
  };
}

async function readJson(filePath) {
  return JSON.parse(stripBom(await readFile(filePath, "utf8")));
}

async function readJsonIfExists(filePath) {
  if (!(await exists(filePath))) return null;
  return readJson(filePath);
}

async function readTextIfExists(filePath) {
  if (!(await exists(filePath))) return "";
  return stripBom(await readFile(filePath, "utf8"));
}

async function fileSummary(filePath) {
  if (!(await exists(filePath))) return { exists: false, sizeBytes: 0 };
  const info = await stat(filePath);
  return { exists: true, sizeBytes: info.size, updatedAt: info.mtime.toISOString() };
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function stripBom(value) {
  return value.replace(/^\uFEFF/, "");
}

function stripExpectedWords(value) {
  return value
    .replace(/test result: ok\.[^\n]*/gi, "")
    .replace(/Skipping[^\n]*/gi, "")
    .replace(/risk=low/gi, "")
    .replace(/readyForLiveAi=false/gi, "");
}

function renderMarkdown(result) {
  const rows = result.checks
    .map((item) => `| ${item.status} | ${item.name} | ${escapePipe(item.detail)} | ${item.evidence.map((evidencePath) => `\`${evidencePath}\``).join("<br>")} |`)
    .join("\n");
  const missing = result.nextRequiredEvidence.length
    ? result.nextRequiredEvidence.map((item, index) => `${index + 1}. ${item}`).join("\n")
    : "None.";
  const discovery = result.supportingEvidence.realDataDiscovery
    ? [
        `- Report: \`${result.supportingEvidence.realDataDiscovery.report}\``,
        `- Candidate files: ${result.supportingEvidence.realDataDiscovery.candidateCount}`,
        `- Preflight-supported files: ${result.supportingEvidence.realDataDiscovery.preflightSupportedCount}`,
        `- Final gate candidates: ${result.supportingEvidence.realDataDiscovery.finalGateCandidateCount}`,
        ...(result.supportingEvidence.realDataDiscovery.gatePlan
          ? renderDiscoveryGatePlan(result.supportingEvidence.realDataDiscovery.gatePlan)
          : []),
        ...(result.supportingEvidence.realDataDiscovery.recommendations ?? []).map((item) => `- ${item}`),
      ].join("\n")
    : "- No real-data discovery report is available yet.";
  const headlessImport = result.supportingEvidence.headlessImport
    ? [
        `- Report: \`${result.supportingEvidence.headlessImport.report}\``,
        `- Processed rows: ${result.supportingEvidence.headlessImport.processedRows}`,
        `- Inserted rows: ${result.supportingEvidence.headlessImport.inserted}`,
        `- Updated rows: ${result.supportingEvidence.headlessImport.updated}`,
        `- Invalid rows: ${result.supportingEvidence.headlessImport.invalidRows}`,
        `- Duplicate rows: ${result.supportingEvidence.headlessImport.duplicateRows}`,
      ].join("\n")
    : "- No headless import report is available yet.";
  const bibliographyConversion = result.supportingEvidence.bibliographyConversion
    ? [
        `- Report: \`${result.supportingEvidence.bibliographyConversion.report}\``,
        `- Passed: ${result.supportingEvidence.bibliographyConversion.passed}`,
        `- Case count: ${result.supportingEvidence.bibliographyConversion.caseCount}`,
        `- Failed cases: ${result.supportingEvidence.bibliographyConversion.failed.length}`,
        `- BibTeX preflight: \`${result.supportingEvidence.bibliographyConversion.outputs.bibPreflight ?? "missing"}\``,
        `- RIS preflight: \`${result.supportingEvidence.bibliographyConversion.outputs.risPreflight ?? "missing"}\``,
      ].join("\n")
    : "- No bibliography conversion and preflight check is available yet.";
  const starMapExport = result.supportingEvidence.starMapExport
    ? [
        `- Report: \`${result.supportingEvidence.starMapExport.report}\``,
        `- Paper count: ${result.supportingEvidence.starMapExport.paperCount}`,
        `- Hotspot count: ${result.supportingEvidence.starMapExport.hotspotCount}`,
        `- Evidence id count: ${result.supportingEvidence.starMapExport.evidenceIdCount}`,
        `- Semantic link count: ${result.supportingEvidence.starMapExport.semanticLinkCount}`,
        `- Evidence coverage: ${result.supportingEvidence.starMapExport.evidenceCoverage}`,
        `- Evolution coverage: ${result.supportingEvidence.starMapExport.evolutionCoverage}`,
        `- Source distribution coverage: ${result.supportingEvidence.starMapExport.sourceDistributionCoverage}`,
        `- Sample signal count: ${result.supportingEvidence.starMapExport.sampleSignalCount}`,
        `- Gate passed: ${result.supportingEvidence.starMapExport.gatePassed}`,
      ].join("\n")
    : "- No star-map semantic export is available yet.";
  const hotspotEvidence = result.supportingEvidence.hotspotEvidence
    ? [
        `- Report: \`${result.supportingEvidence.hotspotEvidence.report}\``,
        `- Selected hotspot: ${result.supportingEvidence.hotspotEvidence.selectedHotspotTitle}`,
        `- Representative papers: ${result.supportingEvidence.hotspotEvidence.representativePaperCount}`,
        `- Missing representative ids: ${result.supportingEvidence.hotspotEvidence.missingRepresentativeIds}`,
        `- Year evolution rows: ${result.supportingEvidence.hotspotEvidence.yearEvolutionCount}`,
        `- Source distribution rows: ${result.supportingEvidence.hotspotEvidence.sourceDistributionCount}`,
        `- Gate passed: ${result.supportingEvidence.hotspotEvidence.gatePassed}`,
      ].join("\n")
    : "- No hotspot evidence bundle is available yet.";
  const offlineHotspotEvidenceReport = result.supportingEvidence.offlineHotspotEvidenceReport
    ? [
        `- Report: \`${result.supportingEvidence.offlineHotspotEvidenceReport.report}\``,
        `- Generated report: \`${result.supportingEvidence.offlineHotspotEvidenceReport.reportPath}\``,
        `- Passed: ${result.supportingEvidence.offlineHotspotEvidenceReport.passed}`,
        `- Paper count: ${result.supportingEvidence.offlineHotspotEvidenceReport.paperCount}`,
        `- Checked sections: ${result.supportingEvidence.offlineHotspotEvidenceReport.checkedSectionCount}`,
      ].join("\n")
    : "- No offline hotspot evidence report check is available yet.";
  const reportExportAuditCheck = result.supportingEvidence.reportExportAuditCheck
    ? [
        `- Report: \`${result.supportingEvidence.reportExportAuditCheck.report}\``,
        `- Passed: ${result.supportingEvidence.reportExportAuditCheck.passed}`,
        `- Case count: ${result.supportingEvidence.reportExportAuditCheck.caseCount}`,
        `- Failed cases: ${result.supportingEvidence.reportExportAuditCheck.failed.length}`,
      ].join("\n")
    : "- No report export citation coverage audit check is available yet.";
  const terminalConfigValidator = result.supportingEvidence.terminalConfigValidator
    ? [
        `- Report: \`${result.supportingEvidence.terminalConfigValidator.report}\``,
        `- Passed: ${result.supportingEvidence.terminalConfigValidator.passed}`,
        `- Case count: ${result.supportingEvidence.terminalConfigValidator.caseCount}`,
        `- Failed cases: ${result.supportingEvidence.terminalConfigValidator.failed.length}`,
      ].join("\n")
    : "- No terminal config semantic validator check is available yet.";
  const terminalConfigFromDiscovery = result.supportingEvidence.terminalConfigFromDiscovery
    ? [
        `- Report: \`${result.supportingEvidence.terminalConfigFromDiscovery.report}\``,
        `- Passed: ${result.supportingEvidence.terminalConfigFromDiscovery.passed}`,
        `- Case count: ${result.supportingEvidence.terminalConfigFromDiscovery.caseCount}`,
        `- Failed cases: ${result.supportingEvidence.terminalConfigFromDiscovery.failed.length}`,
      ].join("\n")
    : "- No terminal config from discovery check is available yet.";
  const terminalPrepare = result.supportingEvidence.terminalPrepare
    ? [
        `- Report: \`${result.supportingEvidence.terminalPrepare.report}\``,
        `- Passed: ${result.supportingEvidence.terminalPrepare.passed}`,
        `- Case count: ${result.supportingEvidence.terminalPrepare.caseCount}`,
        `- Failed cases: ${result.supportingEvidence.terminalPrepare.failed.length}`,
      ].join("\n")
    : "- No terminal preparation workflow check is available yet.";
  const terminalRunbookPathQuote = result.supportingEvidence.terminalRunbookPathQuote
    ? [
        `- Report: \`${result.supportingEvidence.terminalRunbookPathQuote.report}\``,
        `- Markdown: \`${result.supportingEvidence.terminalRunbookPathQuote.runbookMarkdown}\``,
        `- Passed: ${result.supportingEvidence.terminalRunbookPathQuote.passed}`,
        `- Case count: ${result.supportingEvidence.terminalRunbookPathQuote.caseCount}`,
        `- Failed cases: ${result.supportingEvidence.terminalRunbookPathQuote.failed.length}`,
      ].join("\n")
    : "- No terminal runbook path-quote check is available yet.";
  const storagePreflight = result.supportingEvidence.storagePreflight
    ? [
        `- Report: \`${result.supportingEvidence.storagePreflight.report}\``,
        `- Passed: ${result.supportingEvidence.storagePreflight.passed}`,
        `- Database drive: ${result.supportingEvidence.storagePreflight.databaseDrive}`,
        `- Warnings: ${result.supportingEvidence.storagePreflight.warningCount}`,
        `- Errors: ${result.supportingEvidence.storagePreflight.errorCount}`,
      ].join("\n")
    : "- No storage preflight is available yet.";
  const capacityPlan = result.supportingEvidence.capacityPlan
    ? [
        `- Report: \`${result.supportingEvidence.capacityPlan.report}\``,
        `- Passed: ${result.supportingEvidence.capacityPlan.passed}`,
        `- Case count: ${result.supportingEvidence.capacityPlan.caseCount}`,
        `- Failed cases: ${result.supportingEvidence.capacityPlan.failed.length}`,
      ].join("\n")
    : "- No capacity planning workflow check is available yet.";
  const sourceManifest = result.supportingEvidence.sourceManifest
    ? [
        `- Report: \`${result.supportingEvidence.sourceManifest.report}\``,
        `- Passed: ${result.supportingEvidence.sourceManifest.passed}`,
        `- Case count: ${result.supportingEvidence.sourceManifest.caseCount}`,
        `- Failed cases: ${result.supportingEvidence.sourceManifest.failed.length}`,
      ].join("\n")
    : "- No source manifest fingerprinting check is available yet.";
  const finalGateDirectEvidence = result.supportingEvidence.finalGateDirectEvidence
    ? [
        `- Report: \`${result.supportingEvidence.finalGateDirectEvidence.report}\``,
        `- Passed: ${result.supportingEvidence.finalGateDirectEvidence.passed}`,
        `- Case count: ${result.supportingEvidence.finalGateDirectEvidence.caseCount}`,
        `- Source manifest integration case passed: ${result.supportingEvidence.finalGateDirectEvidence.sourceManifestCasePassed}`,
        `- Failed cases: ${result.supportingEvidence.finalGateDirectEvidence.failed.length}`,
        `- Case names: ${result.supportingEvidence.finalGateDirectEvidence.caseNames.join("; ")}`,
      ].join("\n")
    : "- No final gate direct evidence and source manifest integration check is available yet.";
  const readinessAuditGuard = result.supportingEvidence.readinessAuditGuard
    ? [
        `- Report: \`${result.supportingEvidence.readinessAuditGuard.report}\``,
        `- Passed: ${result.supportingEvidence.readinessAuditGuard.passed}`,
        `- Case count: ${result.supportingEvidence.readinessAuditGuard.caseCount}`,
        `- Failed cases: ${result.supportingEvidence.readinessAuditGuard.failed.length}`,
        `- Case names: ${result.supportingEvidence.readinessAuditGuard.caseNames.join("; ")}`,
      ].join("\n")
    : "- No goal readiness audit false-positive guard check is available yet.";
  const evidenceChain = result.supportingEvidence.evidenceChain
    ? [
        `- Report: \`${result.supportingEvidence.evidenceChain.report}\``,
        `- Passed: ${result.supportingEvidence.evidenceChain.passed}`,
        `- Case count: ${result.supportingEvidence.evidenceChain.caseCount}`,
        `- Failed cases: ${result.supportingEvidence.evidenceChain.failed.length}`,
        `- SQLite database: \`${result.supportingEvidence.evidenceChain.currentEvidence.sqliteDatabasePath ?? "missing"}\``,
        `- Star-map database: \`${result.supportingEvidence.evidenceChain.currentEvidence.starMapDatabasePath ?? "missing"}\``,
        `- Hotspot evidence database: \`${result.supportingEvidence.evidenceChain.currentEvidence.hotspotEvidenceDatabasePath ?? "missing"}\``,
        `- Selected hotspot: \`${result.supportingEvidence.evidenceChain.currentEvidence.selectedHotspotId ?? "missing"}\``,
        `- Report path: \`${result.supportingEvidence.evidenceChain.currentEvidence.reportPath ?? "missing"}\``,
      ].join("\n")
    : "- No terminal evidence chain consistency check is available yet.";
  const aiEnvBridge = result.supportingEvidence.aiEnvBridge
    ? [
        `- Report: \`${result.supportingEvidence.aiEnvBridge.report}\``,
        `- Mode: ${result.supportingEvidence.aiEnvBridge.mode}`,
        `- Planned update count: ${result.supportingEvidence.aiEnvBridge.plannedUpdateCount}`,
        `- Ready after bridge: ${result.supportingEvidence.aiEnvBridge.readyAfterBridge}`,
        `- Wrote .env.local: ${result.supportingEvidence.aiEnvBridge.wrote}`,
      ].join("\n")
    : "- No AI env bridge report is available yet.";
  const aiLiveSmoke = result.supportingEvidence.aiLiveSmoke
    ? [
        `- Report: \`${result.supportingEvidence.aiLiveSmoke.report}\``,
        `- Mode: ${result.supportingEvidence.aiLiveSmoke.mode}`,
        `- Ready for live AI: ${result.supportingEvidence.aiLiveSmoke.readyForLiveAi}`,
        `- Network called: ${result.supportingEvidence.aiLiveSmoke.called}`,
        `- Gate passed: ${result.supportingEvidence.aiLiveSmoke.gatePassed}`,
        `- Report audit passed: ${result.supportingEvidence.aiLiveSmoke.reportAuditPassed}`,
      ].join("\n")
    : "- No AI live report smoke is available yet.";
  const finalReadiness = result.supportingEvidence.finalReadiness
    ? [
        `- Report: \`${result.supportingEvidence.finalReadiness.report}\``,
        `- Terminal goal ready: ${result.supportingEvidence.finalReadiness.terminalGoalReady}`,
        `- Real data source ready: ${result.supportingEvidence.finalReadiness.realDataSourceReady}`,
        `- Real imported SQLite ready: ${result.supportingEvidence.finalReadiness.realImportedSqliteReady}`,
        `- Real star map ready: ${result.supportingEvidence.finalReadiness.realStarMapReady}`,
        `- Hotspot evidence ready: ${result.supportingEvidence.finalReadiness.hotspotEvidenceReady}`,
        `- Real report ready: ${result.supportingEvidence.finalReadiness.realReportReady}`,
        `- Evidence chain ready: ${result.supportingEvidence.finalReadiness.evidenceChainReady}`,
        `- UI smoke ready: ${result.supportingEvidence.finalReadiness.uiSmokeReady}`,
        `- Live AI ready: ${result.supportingEvidence.finalReadiness.liveAiReady}`,
        ...(result.supportingEvidence.finalReadiness.warnings ?? []).map((item) => `- Warning: ${item}`),
      ].join("\n")
    : "- No final-readiness summary is available yet.";
  return `# V20 Goal Readiness Audit

Generated: ${result.generatedAt}

Conclusion: ${result.currentConclusion}

- Proven checks: ${result.proven}
- Missing checks: ${result.missing}
- Overall complete: ${result.overallComplete}

| Status | Item | Detail | Evidence |
|---|---|---|---|
${rows}

## Still Required

${missing}

## Supporting Evidence

### Final Readiness Summary

${finalReadiness}

### Real Data Discovery

${discovery}

### Headless Import

${headlessImport}

### Bibliography Conversion And Preflight

${bibliographyConversion}

### Star Map Export

${starMapExport}

### Hotspot Evidence Bundle

${hotspotEvidence}

### Offline Hotspot Evidence Report

${offlineHotspotEvidenceReport}

### Report Export Citation Coverage Audit

${reportExportAuditCheck}

### Terminal Config Semantic Validator

${terminalConfigValidator}

### Terminal Config From Discovery

${terminalConfigFromDiscovery}

### Terminal Preparation Workflow

${terminalPrepare}

### Terminal Runbook PowerShell Path Quoting

${terminalRunbookPathQuote}

### Storage Preflight

${storagePreflight}

### Capacity Planning

${capacityPlan}

### Source Manifest Fingerprinting

${sourceManifest}

### Final Gate Direct Evidence Rejection

${finalGateDirectEvidence}

### Goal Readiness Audit False-Positive Guard

${readinessAuditGuard}

### Terminal Evidence Chain Consistency

${evidenceChain}

### AI Env Bridge

${aiEnvBridge}

### AI Live Report Smoke

${aiLiveSmoke}
`;
}

function renderDiscoveryGatePlan(plan) {
  const lines = [
    `- Next gate plan: ${plan.status}`,
    `- Gate plan summary: ${plan.summary}`,
  ];
  if (plan.selectedSource?.filePath) {
    lines.push(`- Gate plan source: \`${plan.selectedSource.filePath}\``);
  }
  if (plan.convertedOutput) {
    lines.push(`- Gate plan converted output: \`${plan.convertedOutput}\``);
  }
  if (plan.conversionCommand) {
    lines.push(`- Conversion command: \`${plan.conversionCommand}\``);
  }
  if (plan.strictPreflightCommand) {
    lines.push(`- Strict preflight command: \`${plan.strictPreflightCommand}\``);
  }
  if (plan.finalAcceptanceCommand) {
    lines.push(`- Final acceptance command: \`${plan.finalAcceptanceCommand}\``);
  }
  return lines;
}

function escapePipe(value) {
  return String(value).replace(/\|/g, "\\|");
}
