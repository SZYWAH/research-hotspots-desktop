import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { DatabaseSync } from "node:sqlite";

import {
  AGENT_THEORY_CRUISE_FIXED_STEP_SECONDS,
  APP15_THEORY_COORDINATE_SCALE,
  advanceAgentTheoryCruise,
  cloneAgentTheoryCruiseCheckpoint,
  createAgentTheoryCruiseCheckpoint,
  createAgentTheoryPerimeterProfile,
  createAgentTheoryReturnTransition,
  estimateVisibleGalaxyFraction,
  resolveAgentTheoryStellarLod,
  sampleAgentTheoryCruise,
  sampleAgentTheoryReturnTransition,
} from "../src/lib/agentTheoryPerimeter.ts";
import {
  applyAgentTheoryDepthProfile,
  createAgentTheoryDepthProfile,
} from "../src/lib/agentTheoryDepth.ts";

const root = process.cwd();
const databasePath = path.join(
  root,
  "data",
  "library",
  "research-hotspots-v7.sqlite",
);
const componentPath = path.join(
  root,
  "src",
  "components",
  "App17GalaxyCanvas.tsx",
);
const wrapperPath = path.join(
  root,
  "src",
  "components",
  "AgentTheoryBackgroundCanvas.tsx",
);
const pagePath = path.join(
  root,
  "src",
  "components",
  "AgentDualBackgroundPage.tsx",
);
const componentSource = fs.readFileSync(componentPath, "utf8");
const wrapperSource = fs.readFileSync(wrapperPath, "utf8");
const pageSource = fs.readFileSync(pagePath, "utf8");
const perimeterSource = fs.readFileSync(
  path.join(root, "src", "lib", "agentTheoryPerimeter.ts"),
  "utf8",
);
const database = new DatabaseSync(databasePath, { readOnly: true });
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
const rawCoordinateHash = hash({
  papers: payload.papers.map(({ rawPaperId, x, y, z }) => [
    rawPaperId,
    x,
    y,
    z,
  ]),
  hotspots: payload.hotspots.map(({ id, x, y, z }) => [id, x, y, z]),
});
const depthProfile = createAgentTheoryDepthProfile(payload);
const displayPayload = applyAgentTheoryDepthProfile(payload, depthProfile);
const profile = createAgentTheoryPerimeterProfile(displayPayload);
const repeatedProfile = createAgentTheoryPerimeterProfile(displayPayload);
const seed = "m1.3g-audit-seed-2026-07-29";
const initial = createAgentTheoryCruiseCheckpoint(profile, seed);
const replayInitial = createAgentTheoryCruiseCheckpoint(profile, seed);
const points = [...displayPayload.papers, ...displayPayload.hotspots].map(
  (point) => ({
    ...point,
    x: point.x * APP15_THEORY_COORDINATE_SCALE,
    y: point.y * APP15_THEORY_COORDINATE_SCALE,
    z: point.z * APP15_THEORY_COORDINATE_SCALE,
  }),
);
const durationSeconds = 8 * 60;
const totalSteps = Math.round(
  durationSeconds / AGENT_THEORY_CRUISE_FIXED_STEP_SECONDS,
);
let checkpoint = cloneAgentTheoryCruiseCheckpoint(initial);
let replay = cloneAgentTheoryCruiseCheckpoint(replayInitial);
const visibilitySamples = [];
const shellViolations = [];
const sampledPositions = [];
const sampledSpeeds = [];
const sampledAccelerations = [];
for (let step = 0; step <= totalSteps; step += 1) {
  if (step % 60 === 0) {
    const sample = sampleAgentTheoryCruise(profile, checkpoint);
    visibilitySamples.push(estimateVisibleGalaxyFraction({
      points,
      sample,
      fovDegrees: 42,
      aspect: 16 / 9,
    }));
    const planeOffset = subtract(sample.position, profile.center);
    const planeRadius = Math.hypot(
      dot(planeOffset, profile.principalAxes[0]),
      dot(planeOffset, profile.principalAxes[1]),
    );
    const requiredRadius = sample.shellRadius + sample.safetyMargin;
    if (planeRadius + 1e-9 < requiredRadius) {
      shellViolations.push({ step, planeRadius, requiredRadius });
    }
    sampledPositions.push(sample.position);
    sampledSpeeds.push(length(sample.velocity));
    sampledAccelerations.push(length(sample.acceleration));
  }
  if (step === totalSteps) break;
  checkpoint = advanceAgentTheoryCruise(profile, checkpoint, 1);
  replay = advanceAgentTheoryCruise(profile, replay, 1);
}

const fiveSecondMotion = measureFiveSecondProjectedMotion({
  points: displayPayload.papers.map((point) => ({
    ...point,
    x: point.x * APP15_THEORY_COORDINATE_SCALE,
    y: point.y * APP15_THEORY_COORDINATE_SCALE,
    z: point.z * APP15_THEORY_COORDINATE_SCALE,
  })),
  profile,
  checkpoint: initial,
  width: 1_440,
  height: 900,
});
const returnStart = add(
  profile.center,
  scale(profile.principalAxes[0], profile.medianRadius * 0.34),
);
const returnLook = [...profile.center];
const returnTransition = createAgentTheoryReturnTransition({
  profile,
  checkpoint: initial,
  nowMs: 0,
  fromPosition: returnStart,
  fromLookTarget: returnLook,
});
const returnDistances = Array.from({ length: 121 }, (_, index) => {
  const nowMs = returnTransition.durationMs * index / 120;
  const sample = sampleAgentTheoryReturnTransition(returnTransition, nowMs);
  return length(subtract(sample.position, returnTransition.toPosition));
});
const returnMonotonicViolations = returnDistances.reduce(
  (count, distance, index) => (
    index > 0 && distance > returnDistances[index - 1] + 1e-9
      ? count + 1
      : count
  ),
  0,
);
const visibilitySorted = visibilitySamples.slice().sort((left, right) => left - right);
const visibleWithinTargetRatio = visibilitySamples.filter(
  (value) => value >= 0.35 && value <= 0.65,
).length / Math.max(1, visibilitySamples.length);

const checks = [];
const check = (name, passed, detail) => {
  checks.push({ name, passed: Boolean(passed), detail });
};
check(
  "active snapshot identity counts remain unchanged",
  paperRows.length === 25_463 && hotspotRows.length === 160,
  `${active.snapshotId}; papers=${paperRows.length}; hotspots=${hotspotRows.length}`,
);
check(
  "perimeter profile is deterministic and uses 96 sectors",
  hash(profile) === hash(repeatedProfile)
    && profile.sectorRadii.length === 96
    && profile.safetyMargins.length === 96,
  hash(profile),
);
check(
  "cruise replay is deterministic",
  hash(checkpoint) === hash(replay),
  hash(checkpoint),
);
check(
  "cruise remains outside the conservative shell",
  shellViolations.length === 0,
  JSON.stringify(shellViolations.slice(0, 3)),
);
check(
  "eight-minute path covers at least 90 percent of perimeter sectors",
  visitedRatio(checkpoint.visitedSectors) >= 0.9,
  `visited=${visitedRatio(checkpoint.visitedSectors)}`,
);
check(
  "raw cruise framing remains close enough for runtime 35-65 percent search",
  percentile(visibilitySorted, 0.5) >= 0.35
    && percentile(visibilitySorted, 0.5) <= 0.65
    && percentile(visibilitySorted, 0.05) >= 0.30
    && percentile(visibilitySorted, 0.95) <= 0.70,
  JSON.stringify({
    withinTargetRatio: visibleWithinTargetRatio,
    p05: percentile(visibilitySorted, 0.05),
    median: percentile(visibilitySorted, 0.5),
    p95: percentile(visibilitySorted, 0.95),
  }),
);
check(
  "five-second near-field projected displacement is perceptible but restrained",
  fiveSecondMotion.nearMedianPx >= 8
    && fiveSecondMotion.nearMedianPx <= 18,
  JSON.stringify(fiveSecondMotion),
);
check(
  "return path approaches its nearest perimeter target monotonically",
  returnMonotonicViolations === 0
    && returnDistances.at(-1) <= 1e-9,
  JSON.stringify({
    durationMs: returnTransition.durationMs,
    violations: returnMonotonicViolations,
    finalDistance: returnDistances.at(-1),
  }),
);
check(
  "LOD thresholds and ordinary-paper sphere exclusion are exact",
  resolveAgentTheoryStellarLod(1.79, false) === "point"
    && resolveAgentTheoryStellarLod(1.8, false) === "psf"
    && resolveAgentTheoryStellarLod(7, false) === "near-psf"
    && resolveAgentTheoryStellarLod(48, false) === "near-psf"
    && resolveAgentTheoryStellarLod(18, true) === "sphere"
    && resolveAgentTheoryStellarLod(14.1, true, "sphere") === "sphere"
    && resolveAgentTheoryStellarLod(14, true, "sphere") === "near-psf",
  "point<1.8; psf<7; ordinary cap near-psf; sphere 18/14 hysteresis",
);
check(
  "Agent runtime owns a single cruise-explore-return camera mode",
  /type AgentTheoryCameraMode = "cruise" \| "explore" \| "returning"/.test(
    fs.readFileSync(
      path.join(root, "src", "lib", "agentTheoryPerimeter.ts"),
      "utf8",
    ),
  )
    && /agentTheoryCameraMode === "returning"/.test(componentSource)
    && /agentTheoryCameraMode === "cruise"/.test(componentSource),
  "single camera writer",
);
check(
  "Explore freezes in place and reset is an explicit Explore command",
  /absorbAgentTheoryCameraIntoOrbit/.test(componentSource)
    && /beginAgentTheoryReturnToPerimeter/.test(componentSource)
    && /重置理论视图/.test(pageSource),
  "AgentDualBackgroundPage and App17GalaxyCanvas",
);
check(
  "session checkpoint uses Web Crypto and persists the PRNG state",
  /window\.crypto\.getRandomValues/.test(wrapperSource)
    && /randomState/.test(perimeterSource)
    && /agent-theory-perimeter-v1-r1/.test(perimeterSource)
    && /research-agent:theory-cruise-seed:/.test(wrapperSource)
    && /legacySessionSeedStorageKey/.test(wrapperSource),
  "AgentTheoryBackgroundCanvas",
);
check(
  "runtime framing uses the actual Three.js camera and frustum",
  /function measureAgentTheoryVisibility/.test(componentSource)
    && /new THREE\.Frustum\(\)/.test(componentSource)
    && /setFromProjectionMatrix/.test(componentSource)
    && /containsPoint/.test(componentSource)
    && /const tangentWeights = \[0\.55, 0\.60, 0\.65, 0\.70, 0\.75\]/.test(
      componentSource,
    ),
  "real runtime frustum search",
);
check(
  "three consecutive near-empty frames trigger a center-safe reframe",
  /agentTheoryLowVisibilityFrames >= 3/.test(componentSource)
    && /perimeter-reframe/.test(componentSource)
    && /agentTheoryCruiseFallbackToCenter/.test(componentSource),
  "perimeter reframe fallback",
);
check(
  "invalid or near-empty cruise checkpoints are not persisted",
  /agentTheoryCruiseCheckpointSaveAllowed/.test(componentSource)
    && /agentTheoryCruiseCheckpointSaveAllowed\s*&&/.test(componentSource),
  "checkpoint save gate",
);
check(
  "resolved hotspots use at most 12 shared instanced sphere slots",
  /const maximumSlots = 12/.test(componentSource)
    && /new THREE\.InstancedMesh\(geometry, coreMaterial, maximumSlots\)/.test(
      componentSource,
    )
    && /slice\(0, maximumSlots\)/.test(componentSource),
  "Agent theory hotspot sphere LOD",
);
check(
  "Agent point-source shaders do not use sphere-normal impostor discs",
  !/float sphereZ = sqrt/.test(
    componentSource.match(
      /function createPaperMaterial\([\s\S]*?\n}\n\nfunction createHotspotPointSourceMaterial/,
    )?.[0] ?? "",
  )
    && /float psf =/.test(componentSource)
    && /float shoulder = exp/.test(componentSource),
  "point and PSF optical path",
);
check(
  "semantic star shaders avoid depth blur, motion blur, full-screen bloom and time opacity",
  !/depthOfField|motionBlur|bokeh/i.test(
    componentSource.match(
      /function createPaperMaterial\([\s\S]*?\n}\n\nfunction createFocusMaterial/,
    )?.[0] ?? "",
  )
    && !/uniform float uTime[\s\S]*vAlpha/.test(
      componentSource.match(
        /function createPaperMaterial\([\s\S]*?\n}\n\nfunction createFocusMaterial/,
      )?.[0] ?? "",
    ),
  "semantic star invariants",
);
check(
  "raw coordinate identity remains unchanged",
  rawCoordinateHash === hash({
    papers: payload.papers.map(({ rawPaperId, x, y, z }) => [
      rawPaperId,
      x,
      y,
      z,
    ]),
    hotspots: payload.hotspots.map(({ id, x, y, z }) => [id, x, y, z]),
  }),
  rawCoordinateHash,
);

const failedChecks = checks.filter((item) => !item.passed);
const result = {
  audit: "agent-theory-perimeter-stellar-lod-v1",
  generatedAt: new Date().toISOString(),
  status: failedChecks.length === 0 ? "PASS" : "FAIL",
  snapshotId: active.snapshotId,
  diagnostics: {
    paperCount: paperRows.length,
    hotspotCount: hotspotRows.length,
    rawCoordinateHash,
    depthScale: depthProfile.depthScale,
    profileHash: hash(profile),
    perimeter: {
      medianRadius: profile.medianRadius,
      maximumRadius: profile.maximumRadius,
      verticalExtent: profile.verticalExtent,
      minimumSafetyMargin: Math.min(...profile.safetyMargins),
      maximumSafetyMargin: Math.max(...profile.safetyMargins),
    },
    cruise: {
      finalCheckpointHash: hash(checkpoint),
      visitedSectorRatio: visitedRatio(checkpoint.visitedSectors),
      visibility: {
        withinTargetRatio: visibleWithinTargetRatio,
        p05: percentile(visibilitySorted, 0.05),
        median: percentile(visibilitySorted, 0.5),
        p95: percentile(visibilitySorted, 0.95),
      },
      speed: summarize(sampledSpeeds),
      acceleration: summarize(sampledAccelerations),
      fiveSecondMotion,
      sampledPositionHash: hash(sampledPositions),
    },
    returnTransition: {
      durationMs: returnTransition.durationMs,
      monotonicViolations: returnMonotonicViolations,
      finalDistance: returnDistances.at(-1),
    },
  },
  checks,
  failedChecks,
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (failedChecks.length > 0) process.exitCode = 1;

function measureFiveSecondProjectedMotion({
  points,
  profile,
  checkpoint,
  width,
  height,
}) {
  const start = sampleAgentTheoryCruise(profile, checkpoint);
  const endCheckpoint = advanceAgentTheoryCruise(
    profile,
    checkpoint,
    Math.round(5 / AGENT_THEORY_CRUISE_FIXED_STEP_SECONDS),
  );
  const end = sampleAgentTheoryCruise(profile, endCheckpoint);
  const startBasis = createCameraBasis(start);
  const endBasis = createCameraBasis(end);
  const displacements = [];
  const near = [];
  const startDepths = points.map((point) => project(
    point,
    start.position,
    startBasis,
    16 / 9,
    42,
  ));
  const visibleDepths = startDepths
    .filter((point) => point.visible)
    .map((point) => point.depth)
    .sort((left, right) => left - right);
  const nearCut = percentile(visibleDepths, 0.36);
  points.forEach((point, index) => {
    const startProjection = startDepths[index];
    if (!startProjection.visible) return;
    const endProjection = project(
      point,
      end.position,
      endBasis,
      16 / 9,
      42,
    );
    if (!endProjection.visible) return;
    const displacement = Math.hypot(
      (endProjection.x - startProjection.x) * width * 0.5,
      (endProjection.y - startProjection.y) * height * 0.5,
    );
    displacements.push(displacement);
    if (startProjection.depth <= nearCut) near.push(displacement);
  });
  displacements.sort((left, right) => left - right);
  near.sort((left, right) => left - right);
  return {
    visiblePairCount: displacements.length,
    medianPx: percentile(displacements, 0.5),
    nearMedianPx: percentile(near, 0.5),
    p75Px: percentile(displacements, 0.75),
    p95Px: percentile(displacements, 0.95),
  };
}

function createCameraBasis(sample) {
  const forward = normalize(subtract(sample.lookTarget, sample.position));
  const worldUp = Math.abs(forward[2]) > 0.92 ? [0, 1, 0] : [0, 0, 1];
  const right = normalize(cross(forward, worldUp));
  return {
    forward,
    right,
    up: normalize(cross(right, forward)),
  };
}

function project(point, position, basis, aspect, fovDegrees) {
  const offset = [
    point.x - position[0],
    point.y - position[1],
    point.z - position[2],
  ];
  const depth = dot(offset, basis.forward);
  if (depth <= 0.1) return { x: 0, y: 0, depth, visible: false };
  const tangentY = Math.tan(fovDegrees * Math.PI / 360);
  const tangentX = tangentY * aspect;
  const x = dot(offset, basis.right) / (depth * tangentX);
  const y = dot(offset, basis.up) / (depth * tangentY);
  return {
    x,
    y,
    depth,
    visible: Math.abs(x) <= 1 && Math.abs(y) <= 1,
  };
}

function summarize(values) {
  const sorted = values.slice().sort((left, right) => left - right);
  return {
    minimum: sorted[0] ?? 0,
    median: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    maximum: sorted.at(-1) ?? 0,
  };
}

function hash(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

function visitedRatio(visited) {
  return visited.filter((value) => value > 0).length / Math.max(1, visited.length);
}

function percentile(values, ratio) {
  if (values.length === 0) return 0;
  return values[Math.min(
    values.length - 1,
    Math.max(0, Math.round((values.length - 1) * ratio)),
  )];
}

function add(left, right) {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function subtract(left, right) {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function scale(vector, scalar) {
  return vector.map((value) => value * scalar);
}

function dot(left, right) {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function cross(left, right) {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function length(vector) {
  return Math.hypot(...vector);
}

function normalize(vector) {
  const magnitude = Math.max(1e-12, length(vector));
  return scale(vector, 1 / magnitude);
}
