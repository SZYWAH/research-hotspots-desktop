import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { DatabaseSync } from "node:sqlite";

import {
  AGENT_THEORY_SCREEN_LOD_ACTIVE_HZ,
  AGENT_THEORY_SCREEN_LOD_GUARD_BAND_NDC,
  AGENT_THEORY_SCREEN_LOD_IDLE_HZ,
  classifyAgentTheoryScreenLodTransition,
  resolveAgentTheoryPaperCoreStyle,
  selectAgentTheoryScreenLod,
  shouldAcceptAgentTheoryScreenLodRevision,
} from "../src/lib/agentTheoryScreenLod.ts";

const root = process.cwd();
const componentSource = fs.readFileSync(
  path.join(root, "src", "components", "App17GalaxyCanvas.tsx"),
  "utf8",
);
const screenLodSource = fs.readFileSync(
  path.join(root, "src", "lib", "agentTheoryScreenLod.ts"),
  "utf8",
);
const perimeterSource = fs.readFileSync(
  path.join(root, "src", "lib", "agentTheoryPerimeter.ts"),
  "utf8",
);
const screenLodWorkerSource = fs.readFileSync(
  path.join(root, "src", "lib", "agentTheoryScreenLod.worker.ts"),
  "utf8",
);
const screenLodWorkerClientSource = fs.readFileSync(
  path.join(root, "src", "lib", "agentTheoryScreenLodWorkerClient.ts"),
  "utf8",
);
const screenLodWorkerProtocolSource = fs.readFileSync(
  path.join(root, "src", "lib", "agentTheoryScreenLodWorkerProtocol.ts"),
  "utf8",
);
const screenLodInteractionGateSource = componentSource.match(
  /function agentTheoryScreenLodInteractionActive\([\s\S]*?\n    }/,
)?.[0] ?? "";
const returnHandoffTerminalPrefetchSource = componentSource.match(
  /if \(\s*progress >= 0\.72[\s\S]{0,3000}if \(progress >= 1\)/,
)?.[0] ?? "";
const returnHandoffCompletionSource = componentSource.match(
  /if \(progress >= 1\) \{[\s\S]{0,10000}agentTheoryReturnHandoff = null;[\s\S]{0,420}agentTheoryCameraMode = "cruise";[\s\S]{0,420}\n          }/,
)?.[0] ?? "";
const database = new DatabaseSync(
  path.join(root, "data", "library", "research-hotspots-v7.sqlite"),
  { readOnly: true },
);
const active = database.prepare(`
  SELECT active_snapshot_id AS snapshotId
  FROM v20_analysis_state
  WHERE project_id = 'project-default'
`).get();
if (!active?.snapshotId) throw new Error("active snapshot not found");
const paperCount = database.prepare(`
  SELECT COUNT(*) AS count
  FROM v20_paper_memberships
  WHERE snapshot_id = ?
`).get(active.snapshotId)?.count ?? 0;
const hotspotCount = database.prepare(`
  SELECT COUNT(*) AS count
  FROM v20_hotspots
  WHERE snapshot_id = ?
`).get(active.snapshotId)?.count ?? 0;
database.close();

const candidates = Array.from({ length: 12_000 }, (_, index) => {
  const column = index % 150;
  const row = Math.floor(index / 150) % 80;
  return {
    index,
    paperId: `paper-${String(index).padStart(5, "0")}`,
    topicKey: `topic-${index % 160}`,
    ndcX: -0.98 + column / 149 * 1.96,
    ndcY: -0.96 + row / 79 * 1.92,
    ndcZ: -0.8 + (index % 97) / 96 * 1.6,
    size: 1.2 + (index % 31) / 31 * 3.4,
    previouslyVisible: index % 3 === 0,
    forced: index === 11_999,
  };
});
const balanced = selectAgentTheoryScreenLod({
  candidates,
  width: 1_440,
  height: 900,
  quality: "balanced",
});
const balancedReplay = selectAgentTheoryScreenLod({
  candidates,
  width: 1_440,
  height: 900,
  quality: "balanced",
});
const high = selectAgentTheoryScreenLod({
  candidates,
  width: 1_440,
  height: 900,
  quality: "high",
});
const styleSamples = [0, 0.5, 1].map(resolveAgentTheoryPaperCoreStyle);

const checks = [];
const check = (name, passed, detail) => {
  checks.push({ name, passed: Boolean(passed), detail });
};

check(
  "active snapshot identity is unchanged",
  paperCount === 25_463 && hotspotCount === 160,
  `${active.snapshotId}; papers=${paperCount}; hotspots=${hotspotCount}`,
);
check(
  "screen LOD selection is deterministic for a static camera input",
  balanced.selectionHash === balancedReplay.selectionHash
    && JSON.stringify(balanced.selectedIndices)
      === JSON.stringify(balancedReplay.selectedIndices),
  balanced.selectionHash,
);
check(
  "balanced and high perceptible counts stay inside the locked budgets",
  balanced.perceptiblePaperCount >= 3_500
    && balanced.perceptiblePaperCount <= 5_500
    && high.perceptiblePaperCount >= 5_000
    && high.perceptiblePaperCount <= 7_500,
  JSON.stringify({
    balanced: balanced.perceptiblePaperCount,
    high: high.perceptiblePaperCount,
  }),
);
check(
  "forced paper visibility promotes only the requested candidate",
  balanced.forcedVisibleCount === 1
    && balanced.selectedIndices.includes(11_999),
  `forced=${balanced.forcedVisibleCount}`,
);
check(
  "screen grid overlap is bounded and reports occupancy",
  balanced.overlapP95 <= 8
    && balanced.occupiedTileRatio > 0
    && balanced.tileSizeCssPx === 28,
  JSON.stringify({
    occupiedTileRatio: balanced.occupiedTileRatio,
    overlapP95: balanced.overlapP95,
  }),
);
check(
  "paper core visibility floors match the R3 near-middle-far contract",
  Math.abs(styleSamples[0].minimumCssSize - 2.06) <= 1e-9
    && Math.abs(styleSamples[2].minimumCssSize - 1.35) <= 1e-9
    && Math.abs(styleSamples[0].minimumAlpha - 0.86) <= 1e-9
    && Math.abs(styleSamples[2].minimumAlpha - 0.55) <= 1e-9
    && Math.abs(styleSamples[0].sizeMultiplier - 1.06) <= 1e-9,
  JSON.stringify(styleSamples),
);
check(
  "paper layer keeps one geometry and one stable vertex order",
  /const geometry = new THREE\.BufferGeometry\(\)/.test(componentSource)
    && /new THREE\.Points\(geometry, coreMaterial\)/.test(componentSource)
    && /new THREE\.Points\(geometry, opticalMaterial\)/.test(componentSource)
    && /agentLodWeight/.test(componentSource)
    && /setAgentLodSelection/.test(componentSource),
  "shared geometry, stable indices and per-vertex weights",
);
check(
  "R4 Screen LOD runs in a worker with 20Hz active and 4Hz idle cadence",
  AGENT_THEORY_SCREEN_LOD_ACTIVE_HZ === 20
    && AGENT_THEORY_SCREEN_LOD_IDLE_HZ === 4
    && /createAgentTheoryScreenLodWorkerClient/.test(componentSource)
    && /const cadence = activeCadence \? "active" : "idle"/.test(
      componentSource,
    )
    && /agentTheoryScreenLodWorker\.canRequest\(cadence, now\)/.test(
      componentSource,
    )
    && /new Worker\([\s\S]*agentTheoryScreenLod\.worker\.ts/.test(
      screenLodWorkerClientSource,
    ),
  "active=50ms, idle=250ms; projection and selection stay off the RAF thread",
);
check(
  "Screen LOD Worker starts only after the runtime gate and is disposed with the canvas",
  /if \(runAgentTheoryInitialRuntimeGate\(\)\) \{\s*initializeAgentTheoryScreenLodWorker\(\);\s*invalidate\(true\);\s*\}/.test(
    componentSource,
  )
    && /agentTheoryScreenLodWorker\?\.dispose\(\);[\s\S]{0,120}agentTheoryScreenLodWorker = null;[\s\S]{0,120}agentTheoryScreenLodWorkerReady = false;/.test(
      componentSource,
    )
    && (componentSource.match(
      /initializeAgentTheoryScreenLodWorker\(\);/g,
    )?.length ?? 0) === 1,
  "runtime-gated initialization, one lifecycle owner and deterministic termination",
);
check(
  "dragging requests live guard-band selections and fades incoming stars before retiring old ones",
  /orbit\.pointerPressed[\s\S]{0,100}orbit\.dragging/.test(componentSource)
    && /requestAgentTheoryScreenLodWorker\(now\)/.test(componentSource)
    && !/orbit\.pointerPressed|orbit\.dragging/.test(
      screenLodInteractionGateSource,
    )
    && /incomingDurationMs:\s*90/.test(componentSource)
    && /retiringDurationMs:\s*300/.test(componentSource)
    && /retiringDelayMs:\s*300/.test(componentSource)
    && /response\.incomingIndices\.length/.test(componentSource)
    && /response\.retiringIndices\.length/.test(componentSource),
  "newly exposed cells can appear while the pointer remains down; retirement is delayed",
);
check(
  "drag start and in-flight Worker requests never pause incoming LOD transitions",
  !/orbit\.dragging = true;[\s\S]{0,420}setAgentLodTransitionPaused\(\s*true/.test(
    componentSource,
  )
    && !/agentTheoryLodRefreshPending[\s\S]{0,120}agentTheoryLodInteractionBusy/.test(
      componentSource,
    ),
  "pending means in-flight diagnostics only; it is not a visual freeze gate",
);
check(
  "Worker failure keeps live chunked main-thread LOD instead of freezing until pointer-up",
  /APP17_AGENT_THEORY_MAIN_THREAD_LOD_BUDGET_MS = 1\.5/.test(
    componentSource,
  )
    && /function startAgentTheoryMainThreadLodFallback/.test(componentSource)
    && /performance\.now\(\) - chunkStartedAt[\s\S]{0,100}APP17_AGENT_THEORY_MAIN_THREAD_LOD_BUDGET_MS/.test(
      componentSource,
    )
    && /requestAnimationFrame\(advanceFallback\)/.test(componentSource)
    && /requestIdleCallback\(commitFallback, \{ timeout: 50 \}\)/.test(
      componentSource,
    ),
  "projection is cooperatively sliced to 1.5ms; selection commits in an idle slot",
);
check(
  "Agent theory never degrades overview motion into a frozen canvas",
  /if \(visualProfile === "agent-theory"\) return 0/.test(componentSource)
    && /APP17_AGENT_THEORY_SYSTEM_AMBIENT_FRAME_INTERVAL = 1_000 \/ 24/.test(
      componentSource,
    )
    && /overviewAmbientDegraded && visualProfile !== "agent-theory"/.test(
      componentSource,
    ),
  "Agent theory overview renders on display RAF while system ambient remains capped at 24fps",
);
check(
  "Explore entry directly hands the unchanged cruise pose to free look",
  /const beginAgentTheoryExploreEntry = \(now: number\) => \{[\s\S]{0,2000}captureAgentTheoryFreeLookFromCamera\(\);[\s\S]{0,200}agentTheoryCameraMode = "explore-free"/.test(
    componentSource,
  )
    && !/agentTheoryCameraMode = "entering-explore"/.test(componentSource)
    && /agentTheoryCameraMode !== "explore-free"/.test(componentSource),
  "no pivot recenter or 350ms entry path",
);
check(
  "Explore free look does not depend on a fixed orbit pivot",
  /agentTheoryFreeLookYaw/.test(componentSource)
    && /agentTheoryFreeLookPitch/.test(componentSource)
    && /agentTheoryFreeLookPosition/.test(componentSource)
    && /agentTheoryFreeLookDollyVelocity/.test(componentSource)
    && /constrainAgentTheoryFreeLookPosition/.test(componentSource),
  "yaw/pitch, forward dolly and local pan own the overview camera",
);
check(
  "returning uses quintic continuity and prefetches terminal LOD before handoff completion",
  /sampleQuinticHermite/.test(perimeterSource)
    && /fromVelocity/.test(perimeterSource)
    && /fromAcceleration/.test(perimeterSource)
    && /resolveAgentTheoryCruiseLookVelocity/.test(perimeterSource)
    && /agentTheoryCameraTransitioningBefore/.test(componentSource)
    && /APP17_AGENT_THEORY_RETURN_HANDOFF_MS = 450/.test(componentSource)
    && /agentTheoryCameraMode = "return-handoff"/.test(componentSource)
    && /agentTheoryCameraMode === "returning"[\s\S]{0,140}agentTheoryCameraMode === "return-handoff"/.test(
      componentSource,
    )
    && /requestAgentTheoryScreenLodWorker\(now\)/.test(componentSource)
    && /const terminalCamera = camera\.clone\(\)/.test(
      returnHandoffTerminalPrefetchSource,
    )
    && /requestAgentTheoryScreenLodWorker\([\s\S]{0,120}terminalCamera/.test(
      returnHandoffTerminalPrefetchSource,
    )
    && /startAgentTheoryMainThreadLodFallback\([\s\S]{0,120}terminalCamera/.test(
      returnHandoffTerminalPrefetchSource,
    )
    && returnHandoffCompletionSource.length > 0
    && /paperLayer\.isAgentLodTransitioning\(\)/.test(
      returnHandoffCompletionSource,
    )
    && /pendingVisualTaskCount === 0/.test(returnHandoffCompletionSource)
    && /handoffNow - agentTheoryReturnVisualStableSinceMs >= 500/.test(
      returnHandoffCompletionSource,
    )
    && /setAgentLodTransitionPaused\([\s\S]{0,80}false/.test(
      returnHandoffCompletionSource,
    )
    && !/scheduleAgentTheoryScreenLodRefresh/.test(
      returnHandoffCompletionSource,
    ),
  "C2 return remains live; terminal LOD has a chunked fallback and cruise waits for 500ms of visual stability",
);
check(
  "full-depth diagnostics are capped at 2048 stratified papers",
  /Math\.ceil\(sceneData\.papers\.length \/ 2_048\)/.test(componentSource)
    && !/const depthRows = sceneData\.papers\.map/.test(componentSource),
  "sampled depth diagnostics",
);
check(
  "legacy abrupt reframe remains removed and R5 uses continuous cruise steering",
  !/APP17_AGENT_THEORY_REFRAME_DWELL_MS/.test(componentSource)
    && !/APP17_AGENT_THEORY_REFRAME_COOLDOWN_MS/.test(componentSource)
    && !/agentTheoryLowVisibilityStartedAt/.test(componentSource)
    && /updateAgentTheoryVisibilityGuard/.test(componentSource)
    && /agentTheoryVisibilityGuardAllowsAdvance/.test(componentSource)
    && /return-visibility-center-recovery/.test(componentSource)
    && /VISIBILITY_STEERING_DEGREES_PER_SECOND = 0\.35/.test(
      componentSource,
    ),
  "no dwell/cooldown recenter; one controller steers, holds unsafe steps and performs a continuous terminal recovery",
);
check(
  "Agent paper shaders keep sharp semantic cores without time opacity",
  /AgentTheoryPaperCore/.test(componentSource)
    && /AgentTheoryPaperOptical/.test(componentSource)
    && /depthWrite: agentTheory && !opticalPass/.test(componentSource)
    && !/uniform float uTime[\s\S]*vAlpha/.test(
      componentSource.match(
        /function createPaperMaterial\([\s\S]*?\n}\n\nfunction createHotspotPointSourceMaterial/,
      )?.[0] ?? "",
    ),
  "sharp depth-writing core plus bounded optical shoulder",
);
check(
  "screen LOD contract is versioned",
  /agent-theory-screen-lod-v3/.test(screenLodSource)
    && /agent-theory-screen-lod-worker-v1/.test(
      screenLodWorkerProtocolSource,
    ),
  "agent-theory-screen-lod-v3 + worker-v1",
);
check(
  "screen LOD precomputes expensive sort and tile keys exactly once per candidate",
  /const preparedCandidates:[\s\S]*guardBandCandidates\.map\(\(candidate\) => \(\{[\s\S]*priority: priorityFor\(candidate\),[\s\S]*tileIndex: tileIndexFor\(candidate\),/.test(
    screenLodSource,
  )
    && /preparedCandidates\.sort\(\(left, right\) => \([\s\S]*right\.priority - left\.priority/.test(
      screenLodSource,
    )
    && !/preparedCandidates\.sort\(\(left, right\) => \([\s\S]{0,240}stableUnitHash/.test(
      screenLodSource,
    ),
  "ID hashing and screen-tile projection stay outside the O(n log n) comparator",
);
check(
  "screen LOD fill passes skip forced candidates after their dedicated pass",
  /const forcedCandidates:[\s\S]*const regularCandidates:/.test(screenLodSource)
    && /for \(const prepared of forcedCandidates\)[\s\S]*Number\.MAX_SAFE_INTEGER/.test(
      screenLodSource,
    )
    && /for \(const prepared of regularCandidates\)/.test(screenLodSource),
  "forced and regular candidates are partitioned once after sorting",
);
check(
  "guard band, gap-free transition sets and latest-request-wins are explicit contracts",
  AGENT_THEORY_SCREEN_LOD_GUARD_BAND_NDC === 1.35
    && /projectAgentTheoryScreenLodNdc/.test(
      screenLodWorkerProtocolSource,
    )
    && /selectionResponseTransferables\(response\)/.test(
      screenLodWorkerSource,
    )
    && /activeSelectionRevision/.test(screenLodWorkerClientSource)
    && /queuedSelection/.test(screenLodWorkerClientSource)
    && /replaceQueuedSelection/.test(screenLodWorkerClientSource)
    && /shouldAcceptAgentTheoryScreenLodRevision/.test(
      screenLodWorkerClientSource,
    )
    && !shouldAcceptAgentTheoryScreenLodRevision({
      responseRevision: 1,
      latestRequestedRevision: 2,
      latestAcceptedRevision: 0,
    })
    && shouldAcceptAgentTheoryScreenLodRevision({
      responseRevision: 2,
      latestRequestedRevision: 2,
      latestAcceptedRevision: 0,
    })
    && (() => {
      const transition = classifyAgentTheoryScreenLodTransition(
        [1, 2, 3],
        [2, 3, 4],
      );
      return JSON.stringify(transition.visibleIndices) === "[1,2,3]"
        && JSON.stringify(transition.incomingIndices) === "[1]"
        && JSON.stringify(transition.retiringIndices) === "[4]"
        && JSON.stringify(transition.residentIndices) === "[1,2,3,4]";
    })(),
  "NDC +/-1.35; visible/incoming/retiring/resident; stale revisions discarded",
);

const failedChecks = checks.filter((entry) => !entry.passed);
const summarizeSelection = ({ selectedIndices: _selectedIndices, ...summary }) => (
  summary
);
const report = {
  audit: "agent-theory-interaction-r4-v1",
  generatedAt: new Date().toISOString(),
  status: failedChecks.length === 0 ? "PASS" : "FAIL",
  snapshotId: active.snapshotId,
  diagnostics: {
    paperCount,
    hotspotCount,
    balanced: summarizeSelection(balanced),
    high: summarizeSelection(high),
    styleSamples,
  },
  checks,
  failedChecks,
};
console.log(JSON.stringify(report, null, 2));
if (failedChecks.length > 0) process.exitCode = 1;
