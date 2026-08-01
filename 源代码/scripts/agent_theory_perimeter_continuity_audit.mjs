import crypto from "node:crypto";
import path from "node:path";
import process from "node:process";
import { DatabaseSync } from "node:sqlite";

import {
  AGENT_THEORY_CRUISE_FIXED_STEP_SECONDS,
  AGENT_THEORY_PERIMETER_MINIMUM_SAFETY_RATIO,
  AGENT_THEORY_PERIMETER_PROFILE_VERSION,
  AGENT_THEORY_PERIMETER_SECTOR_COUNT,
  APP15_THEORY_COORDINATE_SCALE,
  advanceAgentTheoryCruise,
  cloneAgentTheoryCruiseCheckpoint,
  createAgentTheoryCruiseCheckpoint,
  createAgentTheoryPerimeterProfile,
  sampleAgentTheoryCruise,
  sampleAgentTheoryPerimeterFrame,
} from "../src/lib/agentTheoryPerimeter.ts";
import {
  applyAgentTheoryDepthProfile,
  createAgentTheoryDepthProfile,
} from "../src/lib/agentTheoryDepth.ts";

const root = process.cwd();
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
const repeatedProfile = createAgentTheoryPerimeterProfile(displayPayload);
const worldPoints = [...displayPayload.papers, ...displayPayload.hotspots].map(
  (point) => [
    point.x * APP15_THEORY_COORDINATE_SCALE,
    point.y * APP15_THEORY_COORDINATE_SCALE,
    point.z * APP15_THEORY_COORDINATE_SCALE,
  ],
);

const entitySafetyViolations = [];
let measuredMinimumClearance = Number.POSITIVE_INFINITY;
let measuredMinimumSafetyRatio = Number.POSITIVE_INFINITY;
for (let index = 0; index < worldPoints.length; index += 1) {
  const relative = subtract(worldPoints[index], profile.center);
  const planeX = dot(relative, profile.principalAxes[0]);
  const planeY = dot(relative, profile.principalAxes[1]);
  const entityRadius = Math.hypot(planeX, planeY);
  const frame = sampleAgentTheoryPerimeterFrame(
    profile,
    Math.atan2(planeY, planeX),
  );
  const clearance = frame.totalRadius - entityRadius;
  const safetyRatio = entityRadius > 1e-9 ? clearance / entityRadius : 1;
  measuredMinimumClearance = Math.min(measuredMinimumClearance, clearance);
  measuredMinimumSafetyRatio = Math.min(
    measuredMinimumSafetyRatio,
    safetyRatio,
  );
  const requiredClearance =
    entityRadius * AGENT_THEORY_PERIMETER_MINIMUM_SAFETY_RATIO;
  if (clearance + 1e-9 < requiredClearance) {
    entitySafetyViolations.push({
      index,
      entityRadius,
      clearance,
      requiredClearance,
    });
  }
}

const sectorWidth = Math.PI * 2 / AGENT_THEORY_PERIMETER_SECTOR_COUNT;
const boundaryEpsilon = sectorWidth * 1e-6;
const boundaryDiagnostics = [];
for (
  let sector = 0;
  sector < AGENT_THEORY_PERIMETER_SECTOR_COUNT;
  sector += 1
) {
  const angle = sector * sectorWidth;
  const left = sampleAgentTheoryPerimeterFrame(
    profile,
    angle - boundaryEpsilon,
  );
  const exact = sampleAgentTheoryPerimeterFrame(profile, angle);
  const right = sampleAgentTheoryPerimeterFrame(
    profile,
    angle + boundaryEpsilon,
  );
  boundaryDiagnostics.push({
    sector,
    radiusGap: Math.abs(left.totalRadius - right.totalRadius),
    firstDerivativeGap: Math.abs(
      left.radiusDerivative - right.radiusDerivative,
    ),
    secondDerivativeGap: Math.abs(
      left.radiusSecondDerivative - right.radiusSecondDerivative,
    ),
    exactTangentNormalDot: Math.abs(dot(exact.tangent, exact.normal)),
    exactTangentLengthError: Math.abs(length(exact.tangent) - 1),
    exactNormalLengthError: Math.abs(length(exact.normal) - 1),
    exactNormalOutwardDot: dot(exact.normal, exact.radial),
  });
}

const simulationDurationSeconds = 10 * 60;
const simulationSteps = Math.round(
  simulationDurationSeconds / AGENT_THEORY_CRUISE_FIXED_STEP_SECONDS,
);
const seed = "m1.3g-r4-c2-shell-2026-07-29";
let checkpoint = createAgentTheoryCruiseCheckpoint(profile, seed);
let replayCheckpoint = createAgentTheoryCruiseCheckpoint(profile, seed);
let previousSample = sampleAgentTheoryCruise(profile, checkpoint);
let maximumStepDistance = 0;
let maximumStepDirectionRadians = 0;
let nonFiniteFrameCount = 0;
let automaticSafetyReframeRequests = 0;
let sectorCrossingCount = 0;
let previousSector = previousSample.sectorIndex;
const sampledPositions = [];
for (let step = 0; step <= simulationSteps; step += 1) {
  const sample = sampleAgentTheoryCruise(profile, checkpoint);
  const frame = sampleAgentTheoryPerimeterFrame(
    profile,
    checkpoint.azimuthRadians,
  );
  const planeOffset = subtract(sample.position, profile.center);
  const planeRadius = Math.hypot(
    dot(planeOffset, profile.principalAxes[0]),
    dot(planeOffset, profile.principalAxes[1]),
  );
  if (
    !sample.position.every(Number.isFinite)
    || !sample.lookTarget.every(Number.isFinite)
    || !Number.isFinite(frame.radiusDerivative)
    || !Number.isFinite(frame.radiusSecondDerivative)
  ) {
    nonFiniteFrameCount += 1;
  }
  if (
    planeRadius + 1e-9 < frame.totalRadius
    || dot(frame.normal, frame.radial) <= 0
    || Math.abs(dot(frame.tangent, frame.normal)) > 1e-8
  ) {
    automaticSafetyReframeRequests += 1;
  }
  if (step > 0) {
    maximumStepDistance = Math.max(
      maximumStepDistance,
      length(subtract(sample.position, previousSample.position)),
    );
    const previousDirection = normalize(
      subtract(previousSample.lookTarget, previousSample.position),
    );
    const currentDirection = normalize(
      subtract(sample.lookTarget, sample.position),
    );
    maximumStepDirectionRadians = Math.max(
      maximumStepDirectionRadians,
      Math.acos(clamp(dot(previousDirection, currentDirection), -1, 1)),
    );
    if (sample.sectorIndex !== previousSector) sectorCrossingCount += 1;
  }
  if (step % 60 === 0) sampledPositions.push(sample.position);
  previousSample = sample;
  previousSector = sample.sectorIndex;
  if (step === simulationSteps) break;
  checkpoint = advanceAgentTheoryCruise(profile, checkpoint, 1);
  replayCheckpoint = advanceAgentTheoryCruise(
    profile,
    replayCheckpoint,
    1,
  );
}

const maximumBoundaryRadiusGap = Math.max(
  ...boundaryDiagnostics.map((row) => row.radiusGap),
);
const maximumBoundaryFirstDerivativeGap = Math.max(
  ...boundaryDiagnostics.map((row) => row.firstDerivativeGap),
);
const maximumBoundarySecondDerivativeGap = Math.max(
  ...boundaryDiagnostics.map((row) => row.secondDerivativeGap),
);
const maximumFrameError = Math.max(
  ...boundaryDiagnostics.flatMap((row) => [
    row.exactTangentNormalDot,
    row.exactTangentLengthError,
    row.exactNormalLengthError,
  ]),
);
const minimumNormalOutwardDot = Math.min(
  ...boundaryDiagnostics.map((row) => row.exactNormalOutwardDot),
);
const scaleTolerance = Math.max(1e-9, profile.maximumRadius * 1e-5);
const derivativeTolerance = Math.max(1e-8, profile.maximumRadius * 2e-4);
const secondDerivativeTolerance = Math.max(
  1e-7,
  profile.maximumRadius * 8e-3,
);

const checks = [];
const check = (name, passed, detail) => {
  checks.push({ name, passed: Boolean(passed), detail });
};
check(
  "active snapshot retains all source entities",
  paperRows.length === 25_463 && hotspotRows.length === 160,
  `${active.snapshotId}; papers=${paperRows.length}; hotspots=${hotspotRows.length}`,
);
check(
  "profile keeps 96-sector statistics and is deterministic",
  profile.version === AGENT_THEORY_PERIMETER_PROFILE_VERSION
    && profile.rawSectorRadii.length === 96
    && profile.sectorRadii.length === 96
    && profile.safetyMargins.length === 96
    && hash(profile) === hash(repeatedProfile),
  `${profile.version}; hash=${hash(profile)}`,
);
check(
  "periodic shell is C2-continuous at every sector boundary",
  maximumBoundaryRadiusGap <= scaleTolerance
    && maximumBoundaryFirstDerivativeGap <= derivativeTolerance
    && maximumBoundarySecondDerivativeGap <= secondDerivativeTolerance,
  JSON.stringify({
    maximumBoundaryRadiusGap,
    maximumBoundaryFirstDerivativeGap,
    maximumBoundarySecondDerivativeGap,
    scaleTolerance,
    derivativeTolerance,
    secondDerivativeTolerance,
  }),
);
check(
  "continuous frame exposes normalized tangent and outward normal",
  maximumFrameError <= 1e-8 && minimumNormalOutwardDot > 0,
  JSON.stringify({ maximumFrameError, minimumNormalOutwardDot }),
);
check(
  "all papers and hotspots retain at least six-percent radial safety",
  entitySafetyViolations.length === 0
    && measuredMinimumSafetyRatio
      + 1e-9 >= AGENT_THEORY_PERIMETER_MINIMUM_SAFETY_RATIO
    && Math.abs(
      measuredMinimumClearance - profile.minimumEntityClearance,
    ) <= 1e-8
    && Math.abs(
      measuredMinimumSafetyRatio - profile.minimumEntitySafetyRatio,
    ) <= 1e-8,
  JSON.stringify({
    violationCount: entitySafetyViolations.length,
    measuredMinimumClearance,
    measuredMinimumSafetyRatio,
    uniformOutwardExpansion: profile.uniformOutwardExpansion,
  }),
);
check(
  "ten-minute CPU cruise replay is deterministic and finite",
  nonFiniteFrameCount === 0
    && hash(checkpoint) === hash(replayCheckpoint)
    && sectorCrossingCount > 0,
  JSON.stringify({
    nonFiniteFrameCount,
    sectorCrossingCount,
    checkpointHash: hash(checkpoint),
  }),
);
check(
  "continuous shell requests zero automatic safety reframes",
  automaticSafetyReframeRequests === 0,
  `automaticSafetyReframeRequests=${automaticSafetyReframeRequests}`,
);
check(
  "ten-minute sampled path is stable and reproducible",
  maximumStepDistance < profile.maximumRadius * 0.01
    && maximumStepDirectionRadians < 0.01
    && hash(sampledPositions).length === 64,
  JSON.stringify({
    maximumStepDistance,
    maximumStepDirectionRadians,
    sampledPositionHash: hash(sampledPositions),
  }),
);

const failedChecks = checks.filter((row) => !row.passed);
const result = {
  audit: "agent-theory-perimeter-c2-continuity-r4-v1",
  generatedAt: new Date().toISOString(),
  status: failedChecks.length === 0 ? "PASS" : "FAIL",
  snapshotId: active.snapshotId,
  diagnostics: {
    profileVersion: profile.version,
    profileHash: hash(profile),
    paperCount: paperRows.length,
    hotspotCount: hotspotRows.length,
    uniformOutwardExpansion: profile.uniformOutwardExpansion,
    minimumEntityClearance: measuredMinimumClearance,
    minimumEntitySafetyRatio: measuredMinimumSafetyRatio,
    boundary: {
      maximumRadiusGap: maximumBoundaryRadiusGap,
      maximumFirstDerivativeGap: maximumBoundaryFirstDerivativeGap,
      maximumSecondDerivativeGap: maximumBoundarySecondDerivativeGap,
      maximumFrameError,
      minimumNormalOutwardDot,
    },
    simulation: {
      durationSeconds: simulationDurationSeconds,
      steps: simulationSteps,
      sectorCrossingCount,
      nonFiniteFrameCount,
      automaticSafetyReframeRequests,
      maximumStepDistance,
      maximumStepDirectionRadians,
      finalCheckpointHash: hash(checkpoint),
      sampledPositionHash: hash(sampledPositions),
    },
  },
  checks,
  failedChecks,
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (failedChecks.length > 0) process.exitCode = 1;

function hash(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

function subtract(left, right) {
  return [
    left[0] - right[0],
    left[1] - right[1],
    left[2] - right[2],
  ];
}

function dot(left, right) {
  return left[0] * right[0]
    + left[1] * right[1]
    + left[2] * right[2];
}

function length(vector) {
  return Math.hypot(vector[0], vector[1], vector[2]);
}

function normalize(vector) {
  const magnitude = Math.max(1e-12, length(vector));
  return vector.map((value) => value / magnitude);
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}
