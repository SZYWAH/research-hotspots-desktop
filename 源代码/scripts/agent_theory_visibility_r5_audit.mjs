import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { DatabaseSync } from "node:sqlite";

import {
  AGENT_THEORY_CRUISE_FIXED_STEP_SECONDS,
  AGENT_THEORY_CRUISE_VISIBILITY_VERSION,
  APP15_THEORY_COORDINATE_SCALE,
  advanceAgentTheoryCruise,
  createAgentTheoryCruiseCheckpoint,
  createAgentTheoryPerimeterProfile,
  sampleAgentTheoryCruise,
} from "../src/lib/agentTheoryPerimeter.ts";
import {
  applyAgentTheoryDepthProfile,
  createAgentTheoryDepthProfile,
} from "../src/lib/agentTheoryDepth.ts";
import {
  createAgentTheoryVisibilityEnvelope,
  isAgentTheoryVisibilitySafe,
} from "../src/lib/agentTheoryVisibilityGuard.ts";
import {
  resolveAgentTheoryScreenLodTarget,
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
const paperMaterialSource = componentSource.match(
  /function createPaperMaterial\([\s\S]*?\n}\n\nfunction resolveAgentTheoryHotspotCoreCssSize/,
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
  SELECT paper_id AS paperId, hotspot_id AS hotspotId, x, y, z
  FROM v20_paper_memberships
  WHERE snapshot_id = ?
  ORDER BY paper_id
`).all(active.snapshotId);
const hotspotRows = database.prepare(`
  SELECT hotspot_id AS id, x, y, z, paper_count AS paperCount
  FROM v20_hotspots
  WHERE snapshot_id = ?
  ORDER BY hotspot_id
`).all(active.snapshotId);
database.close();

const payload = {
  snapshotId: active.snapshotId,
  papers: paperRows.map((row) => ({
    rawPaperId: row.paperId,
    scopedPaperId: row.paperId,
    hotspotId: row.hotspotId,
    field: "",
    topicId: 0,
    x: row.x,
    y: row.y,
    z: row.z,
    color: "#c8d6e6",
    size: 2.2,
  })),
  hotspots: hotspotRows.map((row) => ({
    ...row,
    field: "",
    topicId: 0,
    title: "",
    label: "",
    summary: "",
    trend: "",
    color: "#9ab5d0",
    size: 1,
    keywords: [],
  })),
};
const depthProfile = createAgentTheoryDepthProfile(payload);
const displayPayload = applyAgentTheoryDepthProfile(payload, depthProfile);
const profile = createAgentTheoryPerimeterProfile(displayPayload);
const envelope = createAgentTheoryVisibilityEnvelope(1_440, 900);
const screenLodTarget = resolveAgentTheoryScreenLodTarget(
  1_440,
  900,
  "balanced",
);
const paperStride = Math.max(1, Math.ceil(displayPayload.papers.length / 2_048));
const sampledPapers = displayPayload.papers
  .filter((_, index) => index % paperStride === 0)
  .map((paper) => [
    paper.x * APP15_THEORY_COORDINATE_SCALE,
    paper.y * APP15_THEORY_COORDINATE_SCALE,
    paper.z * APP15_THEORY_COORDINATE_SCALE,
  ]);
const hotspots = displayPayload.hotspots.map((hotspot) => [
  hotspot.x * APP15_THEORY_COORDINATE_SCALE,
  hotspot.y * APP15_THEORY_COORDINATE_SCALE,
  hotspot.z * APP15_THEORY_COORDINATE_SCALE,
]);
const tangentWeights = [0.55, 0.60, 0.65, 0.70, 0.75];
const verticalAimRatios = [-0.28, -0.14, 0, 0.14, 0.28];
const horizonOffsets = [0, 1.5, 3, 4.5, 6];
const fovTangentY = Math.tan(42 * Math.PI / 360);
const fovTangentX = fovTangentY * (1_440 / 900);

function dot(left, right) {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function add(left, right) {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function subtract(left, right) {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function scale(vector, scalar) {
  return [vector[0] * scalar, vector[1] * scalar, vector[2] * scalar];
}

function length(vector) {
  return Math.hypot(vector[0], vector[1], vector[2]);
}

function normalize(vector) {
  const magnitude = Math.max(1e-12, length(vector));
  return scale(vector, 1 / magnitude);
}

function cross(left, right) {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function lookDirection(sample, tangentWeight, verticalAimRatio, center = false) {
  if (center) return normalize(subtract(profile.center, sample.position));
  const position = sample.position;
  const relative = subtract(position, profile.center);
  const verticalAxis = normalize(profile.principalAxes[2]);
  const radial = normalize(
    subtract(relative, scale(verticalAxis, dot(relative, verticalAxis))),
  );
  const planeX = dot(radial, profile.principalAxes[0]);
  const planeY = dot(radial, profile.principalAxes[1]);
  const tangentSign = Math.sign(sample.velocity[0] + sample.velocity[1])
    || 1;
  const tangent = normalize(scale(add(
    scale(profile.principalAxes[0], -planeY),
    scale(profile.principalAxes[1], planeX),
  ), tangentSign));
  const boundedTangent = Math.max(0.55, Math.min(0.75, tangentWeight));
  const inward = Math.sqrt(Math.max(0.001, 1 - boundedTangent ** 2));
  const horizontal = normalize(add(
    scale(tangent, boundedTangent),
    scale(radial, -inward),
  ));
  return normalize(add(
    horizontal,
    scale(verticalAxis, verticalAimRatio * 0.24),
  ));
}

function measure(sample, tangentWeight, verticalAimRatio, center = false) {
  const forward = lookDirection(
    sample,
    tangentWeight,
    verticalAimRatio,
    center,
  );
  let right = normalize(cross(forward, [0, 0, 1]));
  if (length(right) < 1e-6) right = [1, 0, 0];
  const up = normalize(cross(right, forward));
  let sampledPaperCount = 0;
  for (const point of sampledPapers) {
    const relative = subtract(point, sample.position);
    const depth = dot(relative, forward);
    if (depth <= 0.01) continue;
    const ndcX = dot(relative, right) / (depth * fovTangentX);
    const ndcY = dot(relative, up) / (depth * fovTangentY);
    if (Math.abs(ndcX) <= 1 && Math.abs(ndcY) <= 1) {
      sampledPaperCount += 1;
    }
  }
  let hotspotCount = 0;
  const hotspotCells = new Set();
  for (const point of hotspots) {
    const relative = subtract(point, sample.position);
    const depth = dot(relative, forward);
    if (depth <= 0.01) continue;
    const ndcX = dot(relative, right) / (depth * fovTangentX);
    const ndcY = dot(relative, up) / (depth * fovTangentY);
    if (Math.abs(ndcX) > 1 || Math.abs(ndcY) > 1) continue;
    hotspotCount += 1;
    const cellX = Math.max(0, Math.min(5, Math.floor((ndcX * 0.5 + 0.5) * 6)));
    const cellY = Math.max(0, Math.min(3, Math.floor((-ndcY * 0.5 + 0.5) * 4)));
    hotspotCells.add(`${cellX}:${cellY}`);
  }
  const projectedPapers = Math.round(
    sampledPaperCount / Math.max(1, sampledPapers.length)
      * displayPayload.papers.length,
  );
  return {
    paperCount: Math.min(projectedPapers, screenLodTarget),
    hotspotCount,
    hotspotCellCount: hotspotCells.size,
  };
}

function evaluateHorizon(checkpoint, tangentWeight, verticalAimRatio, center) {
  let future = checkpoint;
  let previousOffset = 0;
  const rows = [];
  for (const offset of horizonOffsets) {
    const steps = Math.round(
      (offset - previousOffset) / AGENT_THEORY_CRUISE_FIXED_STEP_SECONDS,
    );
    if (steps > 0) future = advanceAgentTheoryCruise(profile, future, steps);
    previousOffset = offset;
    rows.push(measure(
      sampleAgentTheoryCruise(profile, future),
      tangentWeight,
      verticalAimRatio,
      center,
    ));
  }
  return {
    safe: rows.every((row) => isAgentTheoryVisibilitySafe(row, envelope)),
    minimum: {
      paperCount: Math.min(...rows.map((row) => row.paperCount)),
      hotspotCount: Math.min(...rows.map((row) => row.hotspotCount)),
      hotspotCellCount: Math.min(...rows.map((row) => row.hotspotCellCount)),
    },
  };
}

function findSafeFraming(checkpoint) {
  for (const tangentWeight of tangentWeights) {
    for (const verticalAimRatio of verticalAimRatios) {
      const horizon = evaluateHorizon(
        checkpoint,
        tangentWeight,
        verticalAimRatio,
        false,
      );
      if (horizon.safe) return { tangentWeight, verticalAimRatio, horizon };
    }
  }
  const sample = sampleAgentTheoryCruise(profile, checkpoint);
  const centerHorizon = evaluateHorizon(
    checkpoint,
    sample.tangentWeight,
    0,
    true,
  );
  return centerHorizon.safe
    ? {
      tangentWeight: sample.tangentWeight,
      verticalAimRatio: 0,
      horizon: centerHorizon,
    }
    : null;
}

const simulationSeeds = [
  "m1.3g-r5-visible-a",
  "m1.3g-r5-visible-b",
  "m1.3g-r5-visible-c",
];
const simulationDiagnostics = [];
for (const seed of simulationSeeds) {
  let checkpoint = createAgentTheoryCruiseCheckpoint(profile, seed);
  let minimumPaperCount = Number.POSITIVE_INFINITY;
  let minimumHotspotCount = Number.POSITIVE_INFINITY;
  let minimumHotspotCellCount = Number.POSITIVE_INFINITY;
  let rejectedCruiseSamples = 0;
  let acceptedCruiseSamples = 0;
  for (let second = 0; second < 10 * 60; second += 1) {
    const framing = findSafeFraming(checkpoint);
    if (!framing) {
      rejectedCruiseSamples += 1;
      continue;
    }
    minimumPaperCount = Math.min(
      minimumPaperCount,
      framing.horizon.minimum.paperCount,
    );
    minimumHotspotCount = Math.min(
      minimumHotspotCount,
      framing.horizon.minimum.hotspotCount,
    );
    minimumHotspotCellCount = Math.min(
      minimumHotspotCellCount,
      framing.horizon.minimum.hotspotCellCount,
    );
    acceptedCruiseSamples += 1;
    checkpoint = advanceAgentTheoryCruise(profile, checkpoint, 60);
  }
  simulationDiagnostics.push({
    seed,
    acceptedCruiseSamples,
    rejectedCruiseSamples,
    minimumPaperCount,
    minimumHotspotCount,
    minimumHotspotCellCount,
    finalStepIndex: checkpoint.stepIndex,
  });
}

const checks = [];
const check = (name, passed, detail) => {
  checks.push({ name, passed: Boolean(passed), detail });
};

check(
  "active snapshot identity remains complete",
  paperRows.length === 25_463 && hotspotRows.length === 160,
  `${active.snapshotId}; papers=${paperRows.length}; hotspots=${hotspotRows.length}`,
);
check(
  "R5 envelope resolves locked 1440x900 floors and targets",
  envelope.paperHardFloor === 1_200
    && envelope.paperTarget === 1_500
    && envelope.paperTargetMaximum === 2_500
    && envelope.hotspotHardFloor === 12
    && envelope.hotspotTarget === 16
    && envelope.hotspotCellHardFloor === 5
    && envelope.hotspotCellTarget === 6
    && envelope.predictionHorizonSeconds === 6,
  JSON.stringify(envelope),
);
check(
  "hotspot core and PSF use the R5 perceptible budget",
  /APP17_AGENT_THEORY_HOTSPOT_CORE_MIN_CSS_PX = 2\.8/.test(componentSource)
    && /APP17_AGENT_THEORY_HOTSPOT_CORE_MAX_CSS_PX = 5\.2/.test(componentSource)
    && /APP17_AGENT_THEORY_HOTSPOT_OPTICAL_MIN_CSS_PX = 5\.5/.test(componentSource)
    && /APP17_AGENT_THEORY_HOTSPOT_OPTICAL_MAX_CSS_PX = 10/.test(componentSource)
    && /float alpha = min\(0\.10, shoulderEnergy \+ rayEnergy\)/.test(
      componentSource,
    ),
  "core=2.8-5.2px; optical=5.5-10px; optical alpha<=10%",
);
check(
  "only the leading 20% hotspots receive stable short rays",
  /Math\.ceil\(hotspots\.length \* 0\.2\)/.test(componentSource)
    && /rayStrengths\[index\] = rayRank === undefined/.test(componentSource)
    && /breathAmplitudes\[index\] = visualProfile === "agent-theory"\s*\?\s*0/.test(
      componentSource,
    ),
  "ID-stable ray subset with Agent breathing disabled",
);
check(
  "overview photospheres are disabled while the local system remains intact",
  /const agentTheoryOverviewSphereEnabled = false/.test(componentSource)
    && /agentTheoryHotspotSphereLayer\s*&& agentTheoryOverviewSphereEnabled/.test(
      componentSource,
    )
    && /systemResources\.star\.setOpacity/.test(componentSource),
  "overview uses point/PSF; system entry retains its local star",
);
check(
  "visibility guard evaluates a six-second horizon every 250ms",
  /APP17_AGENT_THEORY_VISIBILITY_EVALUATION_MS = 250/.test(componentSource)
    && /\[0, 1\.5, 3, 4\.5, 6\]/.test(componentSource)
    && /sceneData\.papers\.length \/ 2_048/.test(componentSource)
    && /sceneData\.hotspots\.forEach/.test(componentSource),
  "2048 stratified papers plus all hotspots",
);
check(
  "unsafe cruise horizons steer the sole cruise controller without stopping it",
  !/agentTheoryVisibilityGuardAllowsAdvance/.test(componentSource)
    && /const advanceControl: AgentTheoryCruiseAdvanceControl/.test(
      componentSource,
    )
    && /requestAgentTheoryFallbackGuidance\("no-safe-candidate"\)/.test(
      componentSource,
    )
    && /VISIBILITY_STEERING_DEGREES_PER_SECOND = 0\.35/.test(componentSource),
  "R8 continuous guidance owns direction and speed; no guard can veto a fixed step",
);
check(
  "screen LOD never replaces a valid Ambient set with a near-empty result",
  /nextResult\.viewportSelectedCount\s*< visibilityEnvelope\.paperHardFloor/.test(
    componentSource,
  )
    && /never cross-fade the resident geometry to an empty selection/.test(
      componentSource,
    ),
  "actual viewport target is rejected before setAgentLodSelection",
);
check(
  "return restores the anchor LOD while cruise resumes after the first fixed step",
  /const actualVisibility = measureAgentTheoryActualReturnVisibility\(/.test(
    componentSource,
  )
    && /agentTheoryReturnVisibilityGatePassed = isAgentTheoryVisibilitySafe\(/.test(
      componentSource,
    )
    && /agentTheoryReturnAwaitingFirstCruiseStep = !reduceMotion/.test(
      componentSource,
    )
    && /completeAgentTheoryReturnAfterCruiseStep\(now\)/.test(componentSource)
    && /retiringDurationMs: 300/.test(componentSource),
  "anchor content remains visible while the first resumed cruise step releases the UI",
);
check(
  "a real-render visibility mismatch becomes non-blocking fallback guidance",
  /const entryVisibilitySafe = isAgentTheoryVisibilitySafe\(/.test(
    componentSource,
  )
    && /if \(!healthy\)[\s\S]{0,240}requestAgentTheoryFallbackGuidance\(/.test(
      componentSource,
    )
    && /agentTheoryCruiseHealthAuditActive = !reduceMotion/.test(
      componentSource,
    ),
  "the exact entry frame is audited after return without blocking cruise or remounting",
);
check(
  "an unchanged Explore pose resumes the exact frozen safe cruise state",
  /agentTheoryExploreEntryAnchor/.test(componentSource)
    && /restoreAgentTheoryExploreAnchorState\(entryAnchor\)/.test(
      componentSource,
    )
    && /camera\.position\.copy\(entryAnchor\.position\)/.test(componentSource)
    && /camera\.quaternion\.copy\(entryAnchor\.quaternion\)/.test(
      componentSource,
    )
    && /agentTheoryCruiseInterpolationAlpha\s*=\s*entryAnchor\.interpolationAlpha/.test(
      componentSource,
    ),
  "R6 exact anchor and R7 liveness state replace the legacy derived checkpoint",
);
check(
  "R4 checkpoints are upgraded and revalidated as visibility-v1",
  AGENT_THEORY_CRUISE_VISIBILITY_VERSION === "agent-theory-visibility-v1"
    && /force R5 to revalidate\/recompose the view/.test(perimeterSource),
  AGENT_THEORY_CRUISE_VISIBILITY_VERSION,
);
check(
  "paper material implementation remains outside the R5 hotspot/guard edits",
  paperMaterialSource.includes("AgentTheoryPaperCore")
    && paperMaterialSource.includes("AgentTheoryPaperOptical")
    && !paperMaterialSource.includes("AgentTheoryVisibilityEnvelope"),
  "paper shader path remains independently owned",
);
check(
  "three deterministic ten-minute path simulations retain all content floors",
  simulationDiagnostics.every((row) => (
    row.acceptedCruiseSamples === 600
    && row.rejectedCruiseSamples === 0
    && row.minimumPaperCount >= envelope.paperHardFloor
    && row.minimumHotspotCount >= envelope.hotspotHardFloor
    && row.minimumHotspotCellCount >= envelope.hotspotCellHardFloor
  )),
  JSON.stringify(simulationDiagnostics),
);

const failed = checks.filter((row) => !row.passed);
const result = {
  audit: "agent-theory-r5-visibility-hotspots-v1",
  generatedAt: new Date().toISOString(),
  status: failed.length === 0 ? "PASS" : "FAIL",
  snapshotId: active.snapshotId,
  envelope,
  screenLodTarget,
  simulationDiagnostics,
  diagnostics: {
    paperCount: paperRows.length,
    hotspotCount: hotspotRows.length,
    hotspotCoreCssSize: [2.8, 5.2],
    hotspotOpticalCssSize: [5.5, 10],
    overviewSphereSlots: 0,
    visibilityGuardVersion: AGENT_THEORY_CRUISE_VISIBILITY_VERSION,
  },
  checks,
  failedChecks: failed,
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (failed.length > 0) process.exitCode = 1;
