import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const section = (source, start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  return from >= 0 && to > from ? source.slice(from, to) : "";
};

const coreSource = read("src-tauri/core/src/lib.rs");
const importCommitSource = read("src-tauri/core/src/import_commit.rs");
const tauriSource = read("src-tauri/src/lib.rs");
const typeSource = read("src/types.ts");
const desktopSource = read("src/lib/desktop.ts");
const appSource = read("src/App.tsx");
const agentSource = read("src/components/AgentDualBackgroundPage.tsx");
const immersiveSource = read("src/components/AgentImmersiveStarfieldCanvas.tsx");
const theorySource = read("src/components/AgentTheoryBackgroundCanvas.tsx");
const galaxySource = read("src/components/App17GalaxyCanvas.tsx");
const splashSource = read("src/components/SideraSplash.tsx");
const docs = [
  "docs/PROJECT.md",
  "docs/ROADMAP.md",
  "docs/STATUS.md",
  "docs/ARCHITECTURE.md",
  "docs/DECISIONS.md",
  "docs/DEVELOPMENT.md",
].map(read);
const nativeEvidence = JSON.parse(read(
  "docs/evidence/sidera-012-r3-cold-start-dynamic-snapshot-2026-08-06.json",
));

const selectorSource = section(
  coreSource,
  "pub fn select_immersive_background_visual_source(",
  "pub fn current_library_revision(",
);
const builderSource = section(
  tauriSource,
  "fn build_agent_immersive_background_payload(",
  "#[cfg(feature = \"dev-tools\")]",
);
const manualSwitchSource = section(
  agentSource,
  "const switchBackground = async (",
  "const switchImmersiveStyle = async",
);
const manualTheoryPreflightSource = section(
  manualSwitchSource,
  'if (mode === "theory" && !forceStaticBackground)',
  "setExploreTheory(false)",
);

const checks = [];
function check(name, condition, detail) {
  checks.push({ name, pass: Boolean(condition), detail });
}

check(
  "P2b keeps the no-auto-analysis mutation contract",
  importCommitSource.includes("invalidate_v20_after_library_mutation")
    && coreSource.includes("DELETE FROM v20_analysis_state WHERE project_id=?1")
    && !importCommitSource.includes("write_snapshot_transaction("),
  "A changed formal import advances the library revision and removes only the active pointer; it does not run V20 analysis.",
);

check(
  "visual source selection is read-only and explicit",
  selectorSource.includes("ImmersiveBackgroundVisualSourceKind::ActiveV20")
    && selectorSource.includes("ImmersiveBackgroundVisualSourceKind::HistoricalV20")
    && coreSource.includes("s.status='ready'")
    && coreSource.includes("ORDER BY s.created_at DESC,s.id DESC")
    && !selectorSource.includes("ensure_v20_schema(")
    && !selectorSource.includes("execute("),
  "The selector reads an explicit active source or the latest ready historical source without mutating database state.",
);

check(
  "active and revision corruption are terminal",
  [
    "V20_VISUAL_SOURCE_ACTIVE_SNAPSHOT_INVALID",
    "V20_VISUAL_SOURCE_REVISION_AHEAD",
    "V20_VISUAL_SOURCE_ACTIVE_REVISION_MISMATCH",
    "V20_VISUAL_SOURCE_LIBRARY_REVISION_CONTRACT_MISMATCH",
    "V20_VISUAL_SOURCE_HOTSPOT_COUNT_MISMATCH",
    "V20_VISUAL_SOURCE_MEMBERSHIP_COUNT_MISMATCH",
    "V20_VISUAL_SOURCE_ORPHAN_HOTSPOT_MEMBERSHIP",
    "V20_VISUAL_SOURCE_ORPHAN_PAPER_MEMBERSHIP",
  ].every((code) => coreSource.includes(code)),
  "A present-but-invalid active source and aggregate structural or revision-contract damage use stable errors instead of historical fallback.",
);

check(
  "hotspot evidence counts are not misread as membership cardinality",
  !coreSource.includes("V20_VISUAL_SOURCE_HOTSPOT_PAPER_COUNT_MISMATCH")
    && coreSource.includes("membership_count != state.paper_count"),
  "V20 hotspot paperCount is an evidence-count field; structural validation uses snapshot totals and referential integrity.",
);

check(
  "historical visual data is never called current analysis",
  coreSource.includes("StaleByLibraryRevision")
    && coreSource.includes("LibraryRevisionAndPaperCountChanged")
    && agentSource.includes("非当前热点分析")
    && agentSource.includes("agent-dual-page__source-summary")
    && !agentSource.includes("agent-dual-page__visual-source-status")
    && agentSource.includes("historical-v20")
    && agentSource.includes("stale-by-library-revision"),
  "Historical source kind, freshness, revisions, counts, and an on-demand non-current-analysis disclosure are preserved without a permanent canvas banner.",
);

const metadataFields = [
  "visualSourceKind",
  "analysisFreshness",
  "visualSourceStaleReason",
  "sourceLibraryRevision",
  "currentLibraryRevision",
  "sourcePaperCount",
  "currentPaperCount",
];
check(
  "Rust and TypeScript visual-source metadata agree",
  metadataFields.every((field) => typeSource.includes(field))
    && [
      "visual_source_kind",
      "analysis_freshness",
      "visual_source_stale_reason",
      "source_library_revision",
      "current_library_revision",
      "source_paper_count",
      "current_paper_count",
    ].every((field) => tauriSource.includes(field)),
  "The immersive payload exposes source identity, freshness, stale reason, revision, and paper-count metadata on both sides.",
);

check(
  "immersive payload no longer requires active V20 state",
  builderSource.includes("select_immersive_background_visual_source")
    && builderSource.includes("AGENT_IMMERSIVE_VISUAL_SOURCE_MISSING")
    && !builderSource.includes("read_analysis_state"),
  "The Tauri loader consumes the validated visual-source contract and retains an explicit no-source terminal error.",
);

check(
  "Tauri string errors retain exact codes",
  desktopSource.includes('typeof error === "string" ? error : String(error)')
    && desktopSource.includes("throw new Error"),
  "Serialized Rust rejection strings are normalized to Error without replacing their stable code.",
);

check(
  "payload deadline only fails",
  agentSource.includes("SIDERA_BACKGROUND_PAYLOAD_DEADLINE_MS = 15_000")
    && agentSource.includes("SIDERA_AGENT_BACKGROUND_PAYLOAD_TIMEOUT")
    && agentSource.includes("Promise.race")
    && !section(
      agentSource,
      "async function waitForBackgroundPayload",
      "type SideraDialogMotionPhase",
    ).includes("reportInitialReady"),
  "A bounded payload wait rejects with a stable terminal code and cannot promote startup readiness.",
);

check(
  "cold theory fallback and manual preflight preserve dynamic ownership",
  agentSource.includes("error instanceof TheoryBackgroundNotReadyError")
    && agentSource.includes("!initialReadyReportedRef.current")
    && agentSource.includes('await ensurePayload("immersive")')
    && agentSource.includes('setMountedMode("immersive")')
    && !agentSource.includes('setMountedMode("static")')
    && manualTheoryPreflightSource.includes('await ensurePayload("theory")')
    && manualTheoryPreflightSource.includes('state: error instanceof TheoryBackgroundNotReadyError')
    && !manualTheoryPreflightSource.includes("setMountedMode(")
    && !manualTheoryPreflightSource.includes("setMaskVisible(")
    && !manualTheoryPreflightSource.includes("setPreferredMode(")
    && !manualTheoryPreflightSource.includes("localStorage.setItem"),
  "Cold-start theory-not-ready still selects a real immersive renderer, while a manual not-ready check keeps the running Canvas, preferred mode, and persistence untouched.",
);

check(
  "mount watchdog only enters failed",
  appSource.includes("SIDERA_AGENT_MOUNT_DEADLINE_MS = 20_000")
    && appSource.includes("SIDERA_AGENT_MOUNT_TIMEOUT")
    && appSource.includes('current === "mounting-agent" ? "failed" : current')
    && !section(
      appSource,
      "const SIDERA_AGENT_MOUNT_DEADLINE_MS",
      "const threeConsole",
    ).includes('"ready"'),
  "The mounting deadline cannot end the splash successfully or select a static background.",
);

check(
  "visual-source cold starts still require real WebGL frames",
  immersiveSource.includes("renderSceneAndReportReady(performance.now())")
    && immersiveSource.includes("renderer.render(scene, camera)")
    && theorySource.includes("onFirstFrame={() =>")
    && galaxySource.includes("onFirstFrameRef.current?.()"),
  "Both dynamic render paths preserve an error-free WebGL render before their first-frame callback when a source exists.",
);

check(
  "only missing visual source auto-selects the static compatibility background",
  splashSource.includes("使用静态背景继续")
    && appSource.includes("onUseStaticBackground")
    && appSource.includes('const SIDERA_IMMERSIVE_VISUAL_SOURCE_MISSING = "AGENT_IMMERSIVE_VISUAL_SOURCE_MISSING"')
    && appSource.includes("isMissingImmersiveVisualSource(message)")
    && appSource.includes("当前论文库尚未生成可用动态星图，已使用静态背景进入应用。")
    && !section(
      appSource,
      "SIDERA_AGENT_MOUNT_TIMEOUT",
      "}, [bypassSideraBoot, sideraBootPhase, sideraSplashMounted])",
    ).includes("setSideraStaticBackground(true)"),
  "The stable missing-source code may enter a non-blocking static background; timeouts and all other startup failures remain explicit.",
);

check(
  "all project truth documents record 012-R3",
  docs.every((document) => document.includes("012-R3"))
    && docs.some((document) => document.includes("historical-v20"))
    && docs.some((document) => document.includes("NATIVE STARTUP PASS"))
    && docs.some((document) => document.includes("USER VISUAL ACCEPTANCE UNVERIFIED"))
    && docs.some((document) => document.includes(
      "sidera-012-r3-cold-start-dynamic-snapshot-2026-08-06.json",
    )),
  "The six project truth documents record the contract, native startup pass, evidence artifact, and remaining user-visual boundary.",
);

check(
  "native evidence records three post-revision dynamic cold starts",
  nativeEvidence.automatedTechnical === "PASS"
    && nativeEvidence.nativeStartup === "PASS"
    && nativeEvidence.userVisualAcceptance === "UNVERIFIED"
    && nativeEvidence.postRevisionGate?.startsWith("PASS")
    && nativeEvidence.nativeRuns?.length === 3
    && nativeEvidence.nativeRuns.every((run) => run.startup?.startsWith("PASS"))
    && nativeEvidence.safety?.providerCalls === 0
    && nativeEvidence.safety?.institutionNetworkRequests === 0
    && nativeEvidence.safety?.libraryWrites === 0
    && nativeEvidence.safety?.hotspotRebuilds === 0
    && nativeEvidence.safety?.staticFallbackSelections === 0
    && nativeEvidence.safety?.retrySelections === 0,
  "The artifact separates automated, actual-Tauri, and user-visual status while proving three no-click post-revision dynamic starts with zero out-of-scope side effects.",
);

const failures = checks.filter((item) => !item.pass);
for (const item of checks) {
  console.log(`${item.pass ? "PASS" : "FAIL"} ${item.name}: ${item.detail}`);
}
if (failures.length > 0) {
  process.exitCode = 1;
} else {
  console.log(`PASS Sidera 012-R3 dynamic startup audit (${checks.length} checks)`);
}
