import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { DatabaseSync } from "node:sqlite";

import {
  AGENT_THEORY_CRUISE_FIXED_STEP_SECONDS,
  resolveAgentTheoryStellarLod,
} from "../src/lib/agentTheoryPerimeter.ts";
import {
  AGENT_THEORY_SCREEN_LOD_ACTIVE_HZ,
  AGENT_THEORY_SCREEN_LOD_GUARD_BAND_NDC,
  AGENT_THEORY_SCREEN_LOD_IDLE_HZ,
  resolveAgentTheoryPaperCoreStyle,
} from "../src/lib/agentTheoryScreenLod.ts";

const root = process.cwd();
const componentSource = fs.readFileSync(
  path.join(root, "src", "components", "App17GalaxyCanvas.tsx"),
  "utf8",
);
const perimeterSource = fs.readFileSync(
  path.join(root, "src", "lib", "agentTheoryPerimeter.ts"),
  "utf8",
);
const screenLodSource = fs.readFileSync(
  path.join(root, "src", "lib", "agentTheoryScreenLod.ts"),
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
const semanticMaterialSource = componentSource.match(
  /function createPaperMaterial\([\s\S]*?\n}\r?\n\r?\nfunction createHotspotPointSourceMaterial[\s\S]*?\n}\r?\n\r?\nfunction createFocusMaterial/,
)?.[0] ?? "";
const agentTheoryOverviewDoubleClickSource = componentSource.match(
  /const handleDoubleClick = \(event: MouseEvent\) => \{[\s\S]*?if \(\s*exploration\.state !== "system"/,
)?.[0] ?? "";
const agentTheorySphereLayerSource = componentSource.match(
  /function createAgentTheoryHotspotSphereLayer\([\s\S]*?\n}\r?\n\r?\nfunction setAgentDepthRangeOnObject/,
)?.[0] ?? "";
const agentTheoryRuntimeCameraSource = componentSource.match(
  /const applyRuntimeCamera = \(\) => \{[\s\S]*?\n    };\r?\n\s*const calculateSystemEntryScale/,
)?.[0] ?? "";
const agentTheoryReturningBranchSource = agentTheoryRuntimeCameraSource.match(
  /agentTheoryCameraMode === "returning-anchor"[\s\S]*?agentTheoryCameraMode === "cruise"/,
)?.[0] ?? "";
const agentTheoryReturnTerminalPrefetchSource = componentSource.match(
  /if \(\s*progress >= 0\.72[\s\S]{0,3000}if \(progress >= 1\)/,
)?.[0] ?? "";
const agentTheoryReturnVisualCommitSource = componentSource.match(
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
const paperRows = database.prepare(`
  SELECT paper_id AS id, hotspot_id AS hotspotId, x, y, z
  FROM v20_paper_memberships
  WHERE snapshot_id = ?
  ORDER BY paper_id
`).all(active.snapshotId);
const hotspotRows = database.prepare(`
  SELECT hotspot_id AS id, x, y, z
  FROM v20_hotspots
  WHERE snapshot_id = ?
  ORDER BY hotspot_id
`).all(active.snapshotId);
database.close();

const rawCoordinateHash = crypto
  .createHash("sha256")
  .update(JSON.stringify({
    papers: paperRows.map((row) => [
      row.id,
      row.hotspotId,
      row.x,
      row.y,
      row.z,
    ]),
    hotspots: hotspotRows.map((row) => [
      row.id,
      row.x,
      row.y,
      row.z,
    ]),
  }))
  .digest("hex");
const expectedSnapshotId = "project-default:v20:1784365136031";
const expectedRawCoordinateHash =
  "192bf4e585f18819fb8d6874df5adb6de61f18c82753d8d08f8fda3617cc730d";

const nearPaperStyle = resolveAgentTheoryPaperCoreStyle(0);
const farPaperStyle = resolveAgentTheoryPaperCoreStyle(1);
const checks = [];
const check = (name, passed, detail) => {
  checks.push({ name, passed: Boolean(passed), detail });
};

check(
  "active snapshot retains every original paper and hotspot coordinate",
  paperRows.length === 25_463
    && hotspotRows.length === 160
    && active.snapshotId === expectedSnapshotId
    && rawCoordinateHash === expectedRawCoordinateHash
    && paperRows.every((row) => (
      Number.isFinite(row.x)
      && Number.isFinite(row.y)
      && Number.isFinite(row.z)
    ))
    && hotspotRows.every((row) => (
      Number.isFinite(row.x)
      && Number.isFinite(row.y)
      && Number.isFinite(row.z)
    )),
  `${active.snapshotId}; papers=${paperRows.length}; hotspots=${hotspotRows.length}; sha256=${rawCoordinateHash}`,
);
check(
  "camera mode contract uses free-look and the exact-anchor return phases",
  /type AgentTheoryCameraMode\s*=\s*\|\s*"cruise"\s*\|\s*"explore-free"\s*\|\s*"return-preparing"\s*\|\s*"returning-anchor"\s*\|\s*"return-commit"/m.test(
    perimeterSource,
  )
    && /agentTheoryCameraMode\s*=\s*"explore-free"/.test(componentSource)
    && /agentTheoryCameraMode\s*=\s*"return-preparing"/.test(componentSource)
    && /agentTheoryCameraMode\s*=\s*"returning-anchor"/.test(componentSource)
    && !/"entering-explore"/.test(perimeterSource),
  "cruise -> explore-free -> return-preparing -> returning-anchor -> cruise",
);
check(
  "Explore enters from the current cruise pose without a recenter transition",
  /const beginAgentTheoryExploreEntry[\s\S]{0,7000}captureAgentTheoryFreeLookFromCamera\(\)[\s\S]{0,240}agentTheoryCameraMode\s*=\s*"explore-free"/.test(
    componentSource,
  )
    && !/const beginAgentTheoryExploreEntry[\s\S]{0,7000}durationMs:\s*350/.test(
      componentSource,
    )
    && /agentTheoryFreeLook/.test(componentSource),
  "the current world position and forward direction are captured directly",
);
check(
  "left drag controls free yaw and pitch instead of a fixed orbit center",
  /APP17_AGENT_THEORY_FREE_LOOK_RADIANS_PER_PIXEL\s*=\s*[\s\S]{0,80}degToRad\(0\.12\)/.test(
    componentSource,
  )
    && /degToRad\(-85\)[\s\S]{0,80}degToRad\(85\)/.test(componentSource)
    && /agentTheoryFreeLookYaw/.test(componentSource)
    && /agentTheoryFreeLookPitch/.test(componentSource)
    && /agentTheoryCameraMode\s*!==\s*"explore-free"/.test(componentSource),
  "0.12 degrees per CSS pixel with a +/-85 degree pitch bound",
);
check(
  "wheel dolly and shift or middle-button pan use the local free-camera frame",
  /resolveAgentTheoryFreeLookDirection/.test(componentSource)
    && /agentTheoryFreeLookDollyVelocity/.test(componentSource)
    && /event\.shiftKey/.test(componentSource)
    && /event\.button\s*===\s*1/.test(componentSource)
    && /crossVectors\(forward,\s*camera\.up\)/.test(componentSource)
    && /const localUp/.test(componentSource),
  "wheel follows forward; shift-left or middle drag pans in the local plane",
);
check(
  "Agent theory free-look wheel travel is bounded to a controlled impulse",
  /APP17_AGENT_THEORY_FREE_LOOK_WHEEL_IMPULSE_PER_RADIUS = 0\.0035/.test(
    componentSource,
  )
    && /APP17_AGENT_THEORY_FREE_LOOK_WHEEL_MAX_SPEED_PER_RADIUS = 0\.55/.test(
      componentSource,
    )
    && /APP17_AGENT_THEORY_FREE_LOOK_DOLLY_DAMPING_SECONDS = 0\.16/.test(
      componentSource,
    )
    && 120 * 0.0035 * 0.16 <= 0.08,
  "one standard 120-delta wheel step settles within about 6.7% of the median galaxy radius",
);
check(
  "double-click aim is bounded to 500ms and any manual input cancels it",
  /agentTheoryFreeLookAim/.test(componentSource)
    && /durationMs:\s*500/.test(componentSource)
    && /cancelAgentTheoryFreeLookAim/.test(componentSource)
    && /handleDoubleClick/.test(componentSource),
  "transient 500ms aim with explicit cancellation",
);
check(
  "overview hotspot single-click entry and double-click aim cannot race",
  /APP17_AGENT_THEORY_HOTSPOT_SINGLE_CLICK_DELAY_MS\s*=\s*500/.test(
    componentSource,
  )
    && /agentTheoryFreeOverview && agentTheoryHotspotClickTimer[\s\S]{0,140}clearTimeout\(agentTheoryHotspotClickTimer\)/.test(
      componentSource,
    )
    && /agentTheoryHotspotClickTimer = window\.setTimeout\(\(\) => \{[\s\S]{0,420}onSelectRef\.current\(deferredHotspotId\)[\s\S]{0,120}APP17_AGENT_THEORY_HOTSPOT_SINGLE_CLICK_DELAY_MS/.test(
      componentSource,
    )
    && /clearTimeout\(agentTheoryHotspotClickTimer\)/.test(
      agentTheoryOverviewDoubleClickSource,
    )
    && /beginAgentTheoryFreeLookAim\(worldTarget, performance\.now\(\)\)/.test(
      agentTheoryOverviewDoubleClickSource,
    )
    && !/onSelectRef\.current/.test(agentTheoryOverviewDoubleClickSource)
    && !/beginEnterSystem/.test(agentTheoryOverviewDoubleClickSource),
  "second pointerdown or dblclick cancels delayed entry; hotspot dblclick only aims",
);
check(
  "free camera is bounded by the expanded theory volume without auto-centering",
  /constrainAgentTheoryFreeLookPosition/.test(componentSource)
    && /maximumRadius\s*\*\s*1\.5/.test(componentSource)
    && /agentTheoryFreeLookPosition\.copy\(camera\.position\)/.test(
      componentSource,
    ),
  "1.5x semantic bounds; reset is the only explicit best-view action",
);
check(
  "reset, fit and top transition the explore-free camera pose",
  /const beginAgentTheoryFreeLookPoseTransition/.test(componentSource)
    && /fromPosition:\s*agentTheoryFreeLookPosition\.clone\(\)/.test(
      componentSource,
    )
    && /toPosition:\s*targetPosition\.clone\(\)/.test(componentSource)
    && /fromQuaternion:\s*camera\.quaternion\.clone\(\)/.test(componentSource)
    && /toQuaternion:\s*targetObject\.quaternion\.clone\(\)/.test(
      componentSource,
    )
    && /commandRef\.current\.kind === "reset"[\s\S]{0,140}commandRef\.current\.kind === "fit"[\s\S]{0,140}commandRef\.current\.kind === "top"[\s\S]{0,1600}beginAgentTheoryFreeLookPoseTransition/.test(
      componentSource,
    )
    && /agentTheoryFreeLookPosition[\s\S]{0,160}\.lerp\(agentTheoryFreeLookAim\.toPosition, aimEased\)/.test(
      componentSource,
    )
    && /\.slerp\(\s*agentTheoryFreeLookAim\.toQuaternion,\s*aimEased/.test(
      componentSource,
    ),
  "view presets animate position and quaternion instead of only mutating orbit",
);
check(
  "return uses the derivative-free exact-anchor path and resumes cruise directly",
  /createAgentTheoryAnchorReturnTransition/.test(perimeterSource)
    && /const progress = smootherstep\(linearProgress\)/.test(perimeterSource)
    && /beginAgentTheoryCruiseHealthAudit\(performance\.now\(\)\)/.test(
      componentSource,
    )
    && /completeAgentTheoryReturnAfterCruiseStep\(now\)/.test(
      componentSource,
    ),
  "position lerp and quaternion slerp reach the frozen anchor; the first fixed step releases the UI",
);
check(
  "return prewarms the anchor union and retires it without blocking cruise",
  /agentTheoryExpectedLodPurpose = "return-anchor"/.test(componentSource)
    && /agentTheoryReturnUnionIndices/.test(componentSource)
    && /projectionSignature/.test(componentSource)
    && /incomingDurationMs:\s*90/.test(componentSource)
    && /retiringDurationMs:\s*300/.test(componentSource)
    && /agentTheoryReturnAwaitingFirstCruiseStep/.test(componentSource),
  "the current and anchor LOD sets coexist through return; retirement runs alongside resumed cruise",
);
check(
  "return and resumed-cruise diagnostics retain a real world reference",
  /const captureAgentTheoryReturnProjection = \(\) => \{[\s\S]{0,420}sceneData\.hotspots\[0\]\?\.position[\s\S]{0,220}\.applyMatrix4\(root\.matrixWorld\)[\s\S]{0,180}\.project\(camera\)/.test(
    componentSource,
  )
    && /const finishAgentTheoryReturnProjection = \(\) => \{[\s\S]{0,260}\.project\(camera\)[\s\S]{0,260}returnProjectionErrorPx = Math\.hypot/.test(
      componentSource,
    )
    && /captureAgentTheoryReturnProjection\(\)/.test(
      agentTheoryReturningBranchSource,
    )
    && /finishAgentTheoryReturnProjection\(\)/.test(
      agentTheoryReturningBranchSource,
    )
    && /returnDirectionStepDegrees\s*=/.test(
      agentTheoryReturningBranchSource,
    )
    && /AgentTheoryCruiseLivenessSnapshot/.test(componentSource)
    && /projectionMovementPxLastSecond/.test(componentSource),
  "a real hotspot projection covers the anchor path and live cruise reports projected movement",
);
check(
  "cruise renders interpolated previous and current fixed-step states",
  Math.abs(AGENT_THEORY_CRUISE_FIXED_STEP_SECONDS - 1 / 60) <= 1e-12
    && /agentTheoryPreviousCruiseCheckpoint/.test(componentSource)
    && /sampleInterpolatedAgentTheoryCruise/.test(componentSource)
    && /agentTheoryCruiseInterpolationAlpha/.test(componentSource)
    && /const stepCount = Math\.min\(\s*3,/.test(componentSource)
    && /if \(cruiseElapsedSeconds > 0\.1\)[\s\S]{0,160}agentTheoryCruiseAccumulatorSeconds = 0;[\s\S]{0,120}else \{[\s\S]{0,100}agentTheoryCruiseAccumulatorSeconds \+= cruiseElapsedSeconds/.test(
      componentSource,
    ),
  "1/60s integration, previous/current interpolation, three-step and 100ms caps",
);
check(
  "depth staging uses a stratified sample and 900ms continuous smoothing",
  /Math\.ceil\(sceneData\.papers\.length\s*\/\s*2_048\)/.test(componentSource)
    && /APP17_AGENT_THEORY_DEPTH_RESPONSE_SECONDS\s*=\s*0\.9/.test(
      componentSource,
    )
    && /agentTheoryDepthTargetP5/.test(componentSource)
    && /agentTheoryDepthCurrentP5/.test(componentSource)
    && /applyAgentTheoryDepthSmoothing/.test(componentSource),
  "at most 2048 papers feed a smoothed target range",
);
check(
  "Screen LOD uses a live 20Hz Worker cadence and a 4Hz idle cadence",
  AGENT_THEORY_SCREEN_LOD_ACTIVE_HZ === 20
    && AGENT_THEORY_SCREEN_LOD_IDLE_HZ === 4
    && /createAgentTheoryScreenLodWorkerClient/.test(componentSource)
    && /agentTheoryScreenLodWorker\.canRequest\(cadence, now\)/.test(
      componentSource,
    )
    && /incomingDurationMs:\s*90/.test(componentSource)
    && /retiringDurationMs:\s*300/.test(componentSource)
    && /retiringDelayMs:\s*300/.test(componentSource)
    && /selectionResponseTransferables\(response\)/.test(
      screenLodWorkerSource,
    ),
  "active=50ms with prompt incoming fade; idle=250ms with delayed retirement",
);
check(
  "legacy abrupt reframing stays disabled while R8 guidance cannot stop cruise",
  !/APP17_AGENT_THEORY_REFRAME_DWELL_MS/.test(componentSource)
    && !/APP17_AGENT_THEORY_REFRAME_COOLDOWN_MS/.test(componentSource)
    && !/agentTheoryLowVisibilityStartedAt/.test(componentSource)
    && /updateAgentTheoryVisibilityGuard/.test(componentSource)
    && !/agentTheoryVisibilityGuardAllowsAdvance/.test(componentSource)
    && /AgentTheoryCruiseAdvanceControl/.test(componentSource)
    && /requestAgentTheoryFallbackGuidance/.test(componentSource),
  "no dwell/cooldown recenter writer; one integrator always advances under normal, steering or fallback guidance",
);
check(
  "Ambient and Explore keep hotspots in point/PSF LOD",
  /resolveAgentTheoryStellarLod\(\s*diameter,\s*false,\s*previousLod,\s*\)/.test(
    agentTheorySphereLayerSource,
  )
    && resolveAgentTheoryStellarLod(48, false) !== "sphere",
  "overview sphere eligibility is disabled even for a 48px projected source",
);
check(
  "overview PSF retains hotspot ownership while the sphere map resolves empty",
  agentTheorySphereLayerSource.length > 0
    && /hotspotLayer\.setResolvedSphereBlends\(sphereState\.blendById\)/.test(
      componentSource,
    )
    && /pickObject:\s*coreObject/.test(componentSource),
  "no duplicate business entity or picking owner is introduced",
);
check(
  "hotspot point and optical layers use the R5 perceptible stellar budget",
  /APP17_AGENT_THEORY_HOTSPOT_CORE_MIN_CSS_PX = 2\.8/.test(
    componentSource,
  )
    && /APP17_AGENT_THEORY_HOTSPOT_CORE_MAX_CSS_PX = 5\.2/.test(
      componentSource,
    )
    && /APP17_AGENT_THEORY_HOTSPOT_OPTICAL_MIN_CSS_PX = 5\.5/.test(
      componentSource,
    )
    && /APP17_AGENT_THEORY_HOTSPOT_OPTICAL_MAX_CSS_PX = 10/.test(
      componentSource,
    )
    && /shoulderPoint/.test(componentSource)
    && /horizontalSpike/.test(componentSource)
    && /verticalSpike/.test(componentSource),
  "core 2.8-5.2px, optical 5.5-10px, seeded non-circular shoulder",
);
check(
  "hotspot visibility remains scored independently of the paper LOD",
  /hotspotCount/.test(componentSource)
    && /hotspotCellCount/.test(componentSource)
    && /createAgentTheoryVisibilityEnvelope/.test(componentSource)
    && /visibleHotspotCount/.test(componentSource)
    && /hotspotOccupiedCellCount/.test(componentSource)
    && /offscreenSphereSlotCount/.test(componentSource),
  "minimum 16 hotspots across 6 screen regions without overview sphere allocation",
);
check(
  "hotspot core receives a tiny depth bias while the full hotspot still depth-tests",
  /gl_Position\.z -= 0\.00002 \* gl_Position\.w/.test(componentSource)
    && /depthTest:\s*true/.test(componentSource)
    && /AgentTheoryHotspotCorePSF/.test(componentSource),
  "one-pixel-class semantic core priority without disabling depth testing",
);
check(
  "near paper core is brighter but remains bounded and sharp",
  nearPaperStyle.minimumAlpha >= 0.86 - 1e-9
    && nearPaperStyle.sizeMultiplier <= 1.06 + 1e-9
    && nearPaperStyle.minimumCssSize <= 4.8
    && /float radianceCeiling = mix\(1\.0, 1\.12, vAgentNearness\)/.test(
      componentSource,
    )
    && /min\(0\.15,\s*vAlpha \* opticalEnergy\)/.test(
      componentSource,
    ),
  JSON.stringify({ nearPaperStyle, farPaperStyle }),
);
check(
  "near-paper 1.12 radiance is depth-weighted rather than global",
  /float radianceCeiling = mix\(1\.0, 1\.12, vAgentNearness\)/.test(
    semanticMaterialSource,
  )
    && /float coreRadiance = 0\.90[\s\S]{0,120}mix\(0\.10, 0\.24, vAgentNearness\)/.test(
      semanticMaterialSource,
    )
    && /min\(radianceCeiling, coreRadiance\)/.test(semanticMaterialSource)
    && !/color \* min\(1\.12,/.test(semanticMaterialSource),
  "far papers cap at 1.0 while the nearest papers continuously approach 1.12",
);
check(
  "semantic star opacity is not time-driven and no forbidden blur path was added",
  semanticMaterialSource.length > 0
    && !/uniform float uTime[\s\S]{0,1200}vAlpha/.test(semanticMaterialSource)
    && !/BokehPass|MotionBlur|depthOfField/i.test(semanticMaterialSource)
    && !/BloomPass|UnrealBloomPass/i.test(semanticMaterialSource),
  "no time opacity, depth-of-field, motion blur or fullscreen bloom",
);
check(
  "Screen LOD keeps identity-stable coordinates in the Worker catalog",
  /selectedIndices = \[\.\.\.selected\]\.sort/.test(screenLodSource)
    && !/candidate\.(x|y|z)\s*=/.test(screenLodSource)
    && AGENT_THEORY_SCREEN_LOD_GUARD_BAND_NDC === 1.35
    && /positions:\s*Float32Array/.test(screenLodWorkerProtocolSource)
    && /localToClipMatrix:\s*Float32Array/.test(
      screenLodWorkerProtocolSource,
    )
    && /activeSelectionRevision/.test(screenLodWorkerClientSource)
    && /queuedSelection/.test(screenLodWorkerClientSource)
    && /replaceQueuedSelection/.test(screenLodWorkerClientSource)
    && /shouldAcceptAgentTheoryScreenLodRevision/.test(
      screenLodWorkerClientSource,
    ),
  "stable vertex indices, immutable local xyz, +/-1.35 guard band and latest-request-wins",
);

const failedChecks = checks.filter((entry) => !entry.passed);
const report = {
  audit: "agent-theory-free-look-continuity-hotspots-r4-v1",
  generatedAt: new Date().toISOString(),
  status: failedChecks.length === 0 ? "PASS" : "FAIL",
  snapshotId: active.snapshotId,
  diagnostics: {
    paperCount: paperRows.length,
    hotspotCount: hotspotRows.length,
    rawCoordinateHash,
    nearPaperStyle,
    farPaperStyle,
  },
  checks,
  failedChecks,
};

console.log(JSON.stringify(report, null, 2));
if (failedChecks.length > 0) process.exitCode = 1;
