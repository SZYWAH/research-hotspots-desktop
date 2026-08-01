import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const componentSource = fs.readFileSync(
  path.join(root, "src", "components", "App17GalaxyCanvas.tsx"),
  "utf8",
);
const theorySource = fs.readFileSync(
  path.join(root, "src", "components", "AgentTheoryBackgroundCanvas.tsx"),
  "utf8",
);
const pageSource = fs.readFileSync(
  path.join(root, "src", "components", "AgentDualBackgroundPage.tsx"),
  "utf8",
);

const checks = [];
function check(name, passed, evidence) {
  checks.push({ name, passed: Boolean(passed), evidence });
}

const labelsReadyBlock = componentSource.match(
  /const agentTheoryLabelsReady = \([\s\S]*?\n      \);/,
)?.[0] ?? "";
const anchorCaptureBlock = componentSource.match(
  /agentTheoryExploreEntryAnchor = \{[\s\S]*?\n        \};/,
)?.[0] ?? "";
const anchorRestoreBlock = componentSource.match(
  /function restoreAgentTheoryExploreAnchorState\([\s\S]*?\n    \}/,
)?.[0] ?? "";
const healthAuditBlock = componentSource.match(
  /function beginAgentTheoryCruiseHealthAudit\([\s\S]*?\n    \}\n\n    function completeAgentTheoryReturnAfterCruiseStep[\s\S]*?\n    \}\n\n    function completeAgentTheoryCruiseHealthAudit[\s\S]*?\n    \}/,
)?.[0] ?? "";
const systemPaperLayerBlock = componentSource.match(
  /function createSystemPaperLayer\([\s\S]*?\n\}\n\nfunction createSystemRepresentativeLayer/,
)?.[0] ?? "";
const systemPaperMaterialBlock = componentSource.match(
  /function createSystemPaperMaterial\([\s\S]*?\n\}\n\nfunction createSystemRepresentativeBloomMaterial/,
)?.[0] ?? "";

check(
  "Agent theory labels remain renderable during drag, wheel and LOD work",
  /agentTheoryCameraMode === "explore-free"/.test(labelsReadyBlock)
    && !/orbit\.dragging/.test(labelsReadyBlock)
    && !/orbitZoomActive/.test(labelsReadyBlock)
    && !/agentTheoryLodRefreshPending/.test(labelsReadyBlock)
    && /APP17_AGENT_THEORY_LABEL_FRAME_INTERVAL = 1_000 \/ 30/.test(
      componentSource,
    ),
  "label readiness depends only on Explore mode and uses a 30 FPS cap",
);
check(
  "Hotspot title collision decisions use hysteresis and continuous opacity",
  /collisionFreePasses/.test(componentSource)
    && /APP17_AGENT_THEORY_LABEL_COLLISION_HIDE_MS = 250/.test(
      componentSource,
    )
    && /APP17_AGENT_THEORY_LABEL_FADE_MS = 160/.test(componentSource)
    && /state\.collisionFreePasses >= 2/.test(componentSource)
    && /labelTransitionActive/.test(componentSource),
  "two clear layouts show, 250 ms sustained collision hides, 160 ms fades",
);
check(
  "Transient Agent theory camera work no longer clears the label canvas",
  /else if \(\s*!labelsVisibleRef\.current\s*&& labelDirty/.test(
    componentSource,
  )
    && !/\(!labelsVisibleRef\.current \|\| !agentTheoryLabelsReady\)/.test(
      componentSource,
    ),
  "only an explicit labelsVisible=false clears the canvas",
);

check(
  "Navigation state exposes overview, system and paper levels",
  /AgentTheoryNavigationLevel = "overview" \| "system" \| "paper"/.test(
    theorySource,
  )
    && /onSystemViewModeChange=\{setSystemViewMode\}/.test(theorySource)
    && /onPaperFocusStateChange=\{\(state\) =>/.test(theorySource)
    && /"return-system" \| "return-overview"/.test(theorySource),
  "App17 callbacks are forwarded instead of discarded",
);
check(
  "Right-side navigation and Escape share paper to system to overview order",
  /取消靠近/.test(pageSource)
    && /返回热点星系/.test(pageSource)
    && /返回理论全图/.test(pageSource)
    && /theoryNavigation\.level === "paper"[\s\S]*?return-system[\s\S]*?theoryNavigation\.level === "system"[\s\S]*?return-overview/.test(
      pageSource,
    ),
  "dynamic button and Escape use the same hierarchy",
);

check(
  "Explore anchor freezes the complete cruise liveness state",
  /liveness:\s*\{/.test(anchorCaptureBlock)
    && /accumulatorSeconds/.test(anchorCaptureBlock)
    && /checkpointSaveAllowed/.test(anchorCaptureBlock)
    && /checkpointValid/.test(anchorCaptureBlock)
    && /lastSafeCheckpoint/.test(anchorCaptureBlock)
    && /guidance:\s*\{/.test(anchorCaptureBlock)
    && /centerBlend/.test(anchorCaptureBlock),
  "accumulator, guard, last-safe checkpoint and continuous guidance are captured",
);
check(
  "Cruise liveness is atomically restored before guided advancement resumes",
  /agentTheoryCruiseAccumulatorSeconds/.test(anchorRestoreBlock)
    && /agentTheoryCruiseCheckpointSaveAllowed/.test(anchorRestoreBlock)
    && /agentTheoryVisibilityGuard =/.test(anchorRestoreBlock)
    && /agentTheoryLastSafeCruiseCheckpoint/.test(anchorRestoreBlock)
    && /agentTheoryCruiseGuidance =/.test(anchorRestoreBlock)
    && /agentTheoryCruiseCenterBlend/.test(anchorRestoreBlock),
  "return restores the known-safe entry state and its guidance without a liveness gate",
);
check(
  "Return publishes idle after the first resumed fixed step",
  /agentTheoryReturnAwaitingFirstCruiseStep/.test(componentSource)
    && /agentTheoryCruiseResumeSuccessfulSteps >= 1/.test(componentSource)
    && /completeAgentTheoryReturnAfterCruiseStep/.test(componentSource)
    && /publishAgentTheoryReturnProgress\("idle", 0, true\)/.test(
      healthAuditBlock,
    ),
  "the 900 ms health audit no longer blocks the Agent return state",
);
check(
  "Cruise health audit remains passive and can request continuous fallback",
  /APP17_AGENT_THEORY_CRUISE_HEALTH_AUDIT_MS = 900/.test(componentSource)
    && /APP17_AGENT_THEORY_CRUISE_HEALTH_MINIMUM_STEPS = 30/.test(
      componentSource,
    )
    && /APP17_AGENT_THEORY_CRUISE_HEALTH_MINIMUM_GUARD_PASSES = 2/.test(
      componentSource,
    )
    && /requestAgentTheoryFallbackGuidance/.test(healthAuditBlock)
    && /updateAgentTheoryCruiseLiveness\(now, true\)/.test(healthAuditBlock),
  "health evidence drives guidance without owning the return lifecycle",
);
check(
  "Visibility guidance cannot stop the fixed-step integrator",
  !/agentTheoryVisibilityGuardAllowsAdvance/.test(componentSource)
    && /const advanceControl: AgentTheoryCruiseAdvanceControl/.test(
      componentSource,
    )
    && /agentTheoryCruiseCheckpoint = advanceAgentTheoryCruise\(/.test(
      componentSource,
    )
    && /mode: "fallback"/.test(componentSource),
  "every Ambient fixed step advances under normal, steering or fallback guidance",
);

check(
  "Agent-only system paper visibility uses the post-review enhancement",
  /APP17_AGENT_THEORY_SYSTEM_PAPER_BASE_ALPHA = 0\.82/.test(
    componentSource,
  )
    && /APP17_AGENT_THEORY_SYSTEM_PAPER_FAR_MINIMUM_SIZE = 2\.9/.test(
      componentSource,
    )
    && /APP17_AGENT_THEORY_SYSTEM_PAPER_MEDIUM_MINIMUM_SIZE = 3\.1/.test(
      componentSource,
    )
    && /APP17_AGENT_THEORY_SYSTEM_PAPER_NEAR_MINIMUM_SIZE = 3\.25/.test(
      componentSource,
    )
    && /APP17_AGENT_THEORY_SYSTEM_PAPER_MAXIMUM_SIZE = 5\.0/.test(
      componentSource,
    )
    && /APP17_AGENT_THEORY_SYSTEM_PAPER_DEPTH_BRIGHTNESS_FLOOR = 0\.94/.test(
      componentSource,
    )
    && /APP17_AGENT_THEORY_SYSTEM_PAPER_DEPTH_SIZE_FLOOR = 0\.96/.test(
      componentSource,
    ),
  "alpha, far/mid/near size and depth floors are source-locked",
);
check(
  "Agent-only focus context remains readable",
  /APP17_AGENT_THEORY_SYSTEM_PAPER_FOCUS_CONTEXT_BRIGHTNESS = 0\.68/.test(
    componentSource,
  )
    && /APP17_AGENT_THEORY_SYSTEM_PAPER_FOCUS_NEIGHBOR_BRIGHTNESS = 0\.8/.test(
      componentSource,
    )
    && /focusContextBrightness/.test(systemPaperLayerBlock)
    && /focusNeighborBrightness/.test(systemPaperLayerBlock),
  "non-neighbour and neighbour multipliers are 68% and 80%",
);
check(
  "Analysis and display system paper defaults remain unchanged",
  /APP17_SYSTEM_PAPER_BASE_ALPHA = 0\.65/.test(componentSource)
    && /APP17_SYSTEM_PAPER_DEPTH_BRIGHTNESS_FLOOR = 0\.82/.test(
      componentSource,
    )
    && /APP17_SYSTEM_PAPER_DEPTH_SIZE_FLOOR = 0\.9/.test(componentSource)
    && /visualProfile: GalaxyVisualProfile = "analysis"/.test(
      systemPaperLayerBlock,
    )
    && /visualProfile: GalaxyVisualProfile = "analysis"/.test(
      systemPaperMaterialBlock,
    ),
  "new values are selected only by visualProfile=agent-theory",
);
check(
  "System paper diagnostics expose the actual shader configuration",
  /systemPaperBaseAlpha/.test(componentSource)
    && /systemPaperStableCoreDiameterPhysicalPixels/.test(componentSource)
    && /systemPaperStableCoreEnergy/.test(componentSource)
    && /paperVisualState\?\.focusContextBrightness/.test(componentSource)
    && /paperVisualState\?\.focusNeighborBrightness/.test(componentSource),
  "performance snapshots report alpha, core energy, depth and focus values",
);

const failedChecks = checks.filter((entry) => !entry.passed);
const result = {
  audit: "agent-theory-r7-v2",
  generatedAt: new Date().toISOString(),
  status: failedChecks.length === 0 ? "PASS" : "FAIL",
  scope: {
    labels: "continuous projection with collision hysteresis",
    navigation: "paper -> system -> overview -> exit Explore",
    liveness: "anchor restore plus non-blocking cruise health audit",
    systemVisibility: "agent-theory only",
  },
  lockedValues: {
    labelFps: 30,
    labelShowPasses: 2,
    labelCollisionHideMs: 250,
    labelFadeMs: 160,
    paperBaseAlpha: 0.82,
    pointSizeCssPx: [2.9, 3.1, 3.25, 5.0],
    depthFloors: [0.94, 0.96],
    focusBrightness: [0.68, 0.8],
    cruiseHealthAuditDurationMs: 900,
    cruiseHealthMinimumSteps: 30,
    cruiseHealthMinimumGuardPasses: 2,
    cruiseHealthMinimumProjectionPx: 0.15,
  },
  checks,
  failedChecks,
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (failedChecks.length > 0) process.exitCode = 1;
