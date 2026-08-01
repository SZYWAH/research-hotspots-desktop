import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { DatabaseSync } from "node:sqlite";
import * as THREE from "three";

import {
  APP15_THEORY_COORDINATE_SCALE,
  advanceAgentTheoryCruise,
  createAgentTheoryAnchorReturnTransition,
  createAgentTheoryCruiseCheckpoint,
  createAgentTheoryPerimeterProfile,
  sampleAgentTheoryAnchorReturnTransition,
  sampleAgentTheoryCruise,
} from "../src/lib/agentTheoryPerimeter.ts";
import {
  applyAgentTheoryDepthProfile,
  createAgentTheoryDepthProfile,
} from "../src/lib/agentTheoryDepth.ts";
import {
  AGENT_THEORY_SCREEN_LOD_GUARD_BAND_NDC,
  selectAgentTheoryScreenLod,
} from "../src/lib/agentTheoryScreenLod.ts";
import {
  createAgentTheoryVisibilityEnvelope,
  isAgentTheoryVisibilitySafe,
} from "../src/lib/agentTheoryVisibilityGuard.ts";

const root = process.cwd();
const componentSource = fs.readFileSync(
  path.join(root, "src", "components", "App17GalaxyCanvas.tsx"),
  "utf8",
);
const pageSource = fs.readFileSync(
  path.join(root, "src", "components", "AgentDualBackgroundPage.tsx"),
  "utf8",
);
const perimeterSource = fs.readFileSync(
  path.join(root, "src", "lib", "agentTheoryPerimeter.ts"),
  "utf8",
);
const protocolSource = fs.readFileSync(
  path.join(root, "src", "lib", "agentTheoryScreenLodWorkerProtocol.ts"),
  "utf8",
);

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
const perimeterProfile = createAgentTheoryPerimeterProfile(displayPayload);
const paperPoints = displayPayload.papers.map(
  (paper) => new THREE.Vector3(
    paper.x * APP15_THEORY_COORDINATE_SCALE,
    paper.y * APP15_THEORY_COORDINATE_SCALE,
    paper.z * APP15_THEORY_COORDINATE_SCALE,
  ),
);
const hotspotPoints = displayPayload.hotspots.map(
  (hotspot) => new THREE.Vector3(
    hotspot.x * APP15_THEORY_COORDINATE_SCALE,
    hotspot.y * APP15_THEORY_COORDINATE_SCALE,
    hotspot.z * APP15_THEORY_COORDINATE_SCALE,
  ),
);
const viewport = { width: 1_440, height: 900 };
const envelope = createAgentTheoryVisibilityEnvelope(
  viewport.width,
  viewport.height,
);

const createCamera = () => new THREE.PerspectiveCamera(
  42,
  viewport.width / viewport.height,
  0.001,
  Math.max(1_000, perimeterProfile.maximumRadius * 30),
);

const projectPoint = (point, camera) => {
  const projected = point.clone().project(camera);
  return {
    visible: Number.isFinite(projected.x)
      && Number.isFinite(projected.y)
      && Number.isFinite(projected.z)
      && Math.abs(projected.x) <= 1
      && Math.abs(projected.y) <= 1
      && projected.z >= -1
      && projected.z <= 1,
    x: projected.x,
    y: projected.y,
    z: projected.z,
  };
};

const measureVisibility = (camera, paperIndices) => {
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  let paperCount = 0;
  for (const index of paperIndices) {
    if (projectPoint(paperPoints[index], camera).visible) paperCount += 1;
  }
  let hotspotCount = 0;
  const hotspotCells = new Set();
  for (const point of hotspotPoints) {
    const projected = projectPoint(point, camera);
    if (!projected.visible) continue;
    hotspotCount += 1;
    const cellX = Math.max(
      0,
      Math.min(5, Math.floor((projected.x * 0.5 + 0.5) * 6)),
    );
    const cellY = Math.max(
      0,
      Math.min(3, Math.floor((-projected.y * 0.5 + 0.5) * 4)),
    );
    hotspotCells.add(`${cellX}:${cellY}`);
  }
  return {
    paperCount,
    hotspotCount,
    hotspotCellCount: hotspotCells.size,
  };
};

const selectForCamera = (camera, previousSelection = new Set()) => {
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  const candidates = paperPoints.map((point, index) => {
    const projected = point.clone().project(camera);
    return {
      index,
      paperId: displayPayload.papers[index].scopedPaperId,
      topicKey: displayPayload.papers[index].hotspotId,
      ndcX: projected.x,
      ndcY: projected.y,
      ndcZ: projected.z,
      size: displayPayload.papers[index].size,
      previouslyVisible: previousSelection.has(index),
      forced: false,
    };
  });
  return selectAgentTheoryScreenLod({
    candidates,
    width: viewport.width,
    height: viewport.height,
    quality: "balanced",
    guardBandNdc: AGENT_THEORY_SCREEN_LOD_GUARD_BAND_NDC,
  });
};

const anchorCamera = createCamera();
let anchorCheckpoint = createAgentTheoryCruiseCheckpoint(
  perimeterProfile,
  "m1.3g-r6-anchor-audit",
);
let anchorSelection = null;
let anchorVisibility = null;
for (let attempt = 0; attempt < 96; attempt += 1) {
  const sample = sampleAgentTheoryCruise(
    perimeterProfile,
    anchorCheckpoint,
  );
  anchorCamera.position.fromArray(sample.position);
  anchorCamera.lookAt(new THREE.Vector3().fromArray(perimeterProfile.center));
  anchorCamera.updateMatrixWorld(true);
  const selection = selectForCamera(anchorCamera);
  const visibility = measureVisibility(
    anchorCamera,
    selection.selectedIndices,
  );
  if (isAgentTheoryVisibilitySafe(visibility, envelope)) {
    anchorSelection = selection;
    anchorVisibility = visibility;
    break;
  }
  anchorCheckpoint = advanceAgentTheoryCruise(
    perimeterProfile,
    anchorCheckpoint,
    120,
  );
}
if (!anchorSelection || !anchorVisibility) {
  throw new Error("R6 audit could not locate a safe perimeter anchor.");
}

const anchorPosition = anchorCamera.position.clone();
const anchorQuaternion = anchorCamera.quaternion.clone();
const anchorForward = new THREE.Vector3(0, 0, -1)
  .applyQuaternion(anchorQuaternion);
const anchorRight = new THREE.Vector3(1, 0, 0)
  .applyQuaternion(anchorQuaternion);
const anchorUp = new THREE.Vector3(0, 1, 0)
  .applyQuaternion(anchorQuaternion);

const rotatedQuaternion = (yawDegrees, pitchDegrees) => {
  const yaw = new THREE.Quaternion().setFromAxisAngle(
    anchorUp,
    THREE.MathUtils.degToRad(yawDegrees),
  );
  const pitchAxis = anchorRight.clone().applyQuaternion(yaw);
  const pitch = new THREE.Quaternion().setFromAxisAngle(
    pitchAxis,
    THREE.MathUtils.degToRad(pitchDegrees),
  );
  return yaw.multiply(pitch).multiply(anchorQuaternion).normalize();
};

const scenarios = [
  {
    id: "immediate",
    position: anchorPosition.clone(),
    quaternion: anchorQuaternion.clone(),
    interactionVelocity: new THREE.Vector3(),
    visibleFloorRequired: true,
  },
  {
    id: "wheel-forward",
    position: anchorPosition.clone().addScaledVector(anchorForward, 0.08),
    quaternion: anchorQuaternion.clone(),
    interactionVelocity: anchorForward.clone().multiplyScalar(0.87),
    visibleFloorRequired: true,
  },
  {
    id: "wheel-backward",
    position: anchorPosition.clone().addScaledVector(anchorForward, -0.09),
    quaternion: anchorQuaternion.clone(),
    interactionVelocity: anchorForward.clone().multiplyScalar(-0.72),
    visibleFloorRequired: true,
  },
  {
    id: "drag-one-pixel",
    position: anchorPosition.clone(),
    quaternion: rotatedQuaternion(0.12, 0),
    interactionVelocity: anchorRight.clone().multiplyScalar(0.12),
    visibleFloorRequired: true,
  },
  {
    id: "drag-and-pan",
    position: anchorPosition.clone()
      .addScaledVector(anchorRight, 0.28)
      .addScaledVector(anchorUp, -0.12),
    quaternion: rotatedQuaternion(4.5, -1.8),
    interactionVelocity: anchorRight.clone().multiplyScalar(1.6),
    visibleFloorRequired: true,
  },
  {
    id: "combined",
    position: anchorPosition.clone()
      .addScaledVector(anchorForward, 0.06)
      .addScaledVector(anchorRight, -0.12),
    quaternion: rotatedQuaternion(-5.5, 2.2),
    interactionVelocity: anchorForward.clone().multiplyScalar(0.8)
      .addScaledVector(anchorRight, -1.1),
    visibleFloorRequired: true,
  },
  {
    id: "intentional-blank-view",
    position: anchorPosition.clone(),
    quaternion: rotatedQuaternion(105, 0),
    interactionVelocity: anchorRight.clone().multiplyScalar(4.2),
    visibleFloorRequired: false,
  },
];

const scenarioDiagnostics = scenarios.map((scenario) => {
  const fromCamera = createCamera();
  fromCamera.position.copy(scenario.position);
  fromCamera.quaternion.copy(scenario.quaternion);
  fromCamera.updateMatrixWorld(true);
  const currentSelection = selectForCamera(
    fromCamera,
    new Set(anchorSelection.selectedIndices),
  );
  const union = new Set([
    ...anchorSelection.selectedIndices,
    ...currentSelection.selectedIndices,
  ]);
  const angle = scenario.quaternion.angleTo(anchorQuaternion);
  const transition = createAgentTheoryAnchorReturnTransition({
    nowMs: 0,
    fromPosition: scenario.position.toArray(),
    toPosition: anchorPosition.toArray(),
    angleRadians: angle,
    medianRadius: perimeterProfile.medianRadius,
  });
  const frameCount = Math.ceil(transition.durationMs / (1_000 / 60));
  let minimumPaperCount = Number.POSITIVE_INFINITY;
  let minimumHotspotCount = Number.POSITIVE_INFINITY;
  let minimumHotspotCellCount = Number.POSITIVE_INFINITY;
  let maximumSegmentDeviation = 0;
  let maximumParameterOvershoot = 0;
  let previousQuaternion = scenario.quaternion.clone();
  let terminalDirectionStepDegrees = 0;
  for (let frame = 0; frame <= frameCount; frame += 1) {
    const nowMs = Math.min(
      transition.durationMs,
      frame * (1_000 / 60),
    );
    const sample = sampleAgentTheoryAnchorReturnTransition(
      transition,
      nowMs,
    );
    const camera = createCamera();
    camera.position.fromArray(sample.position);
    camera.quaternion.copy(scenario.quaternion).slerp(
      anchorQuaternion,
      sample.progress,
    );
    camera.updateMatrixWorld(true);
    const visibility = measureVisibility(camera, union);
    minimumPaperCount = Math.min(
      minimumPaperCount,
      visibility.paperCount,
    );
    minimumHotspotCount = Math.min(
      minimumHotspotCount,
      visibility.hotspotCount,
    );
    minimumHotspotCellCount = Math.min(
      minimumHotspotCellCount,
      visibility.hotspotCellCount,
    );
    const expected = scenario.position.clone().lerp(
      anchorPosition,
      sample.progress,
    );
    maximumSegmentDeviation = Math.max(
      maximumSegmentDeviation,
      camera.position.distanceTo(expected),
    );
    const segment = anchorPosition.clone().sub(scenario.position);
    const segmentLengthSq = segment.lengthSq();
    const parameter = segmentLengthSq <= 1e-18
      ? 0
      : camera.position.clone().sub(scenario.position).dot(segment)
        / segmentLengthSq;
    maximumParameterOvershoot = Math.max(
      maximumParameterOvershoot,
      Math.max(0, -parameter, parameter - 1),
    );
    const directionStepDegrees = THREE.MathUtils.radToDeg(
      previousQuaternion.angleTo(camera.quaternion),
    );
    if (frame === frameCount) {
      terminalDirectionStepDegrees = directionStepDegrees;
    }
    previousQuaternion.copy(camera.quaternion);
  }
  return {
    id: scenario.id,
    durationMs: transition.durationMs,
    nonzeroInteractionSpeed: scenario.interactionVelocity.length(),
    finalPositionError: new THREE.Vector3()
      .fromArray(
        sampleAgentTheoryAnchorReturnTransition(
          transition,
          transition.durationMs,
        ).position,
      )
      .distanceTo(anchorPosition),
    finalDirectionErrorDegrees: THREE.MathUtils.radToDeg(
      scenario.quaternion.clone().slerp(anchorQuaternion, 1)
        .angleTo(anchorQuaternion),
    ),
    maximumSegmentDeviation,
    maximumParameterOvershoot,
    terminalDirectionStepDegrees,
    minimumPaperCount,
    minimumHotspotCount,
    minimumHotspotCellCount,
    visibleFloorRequired: scenario.visibleFloorRequired,
    unionCount: union.size,
  };
});

const checks = [];
const check = (name, passed, detail) => {
  checks.push({ name, passed: Boolean(passed), detail });
};

check(
  "active V20 identity is complete",
  paperRows.length === 25_463 && hotspotRows.length === 160,
  `${active.snapshotId}; papers=${paperRows.length}; hotspots=${hotspotRows.length}`,
);
check(
  "real Three.js perimeter anchor satisfies the locked visibility floor",
  isAgentTheoryVisibilitySafe(anchorVisibility, envelope),
  JSON.stringify(anchorVisibility),
);
check(
  "nonzero wheel, drag, pan and combined interactions return exactly",
  scenarioDiagnostics
    .filter((row) => row.id !== "immediate")
    .every((row) => (
      row.nonzeroInteractionSpeed > 0
      && row.finalPositionError <= 1e-6
      && row.finalDirectionErrorDegrees <= 0.01
    )),
  JSON.stringify(
    scenarioDiagnostics.map((row) => ({
      id: row.id,
      speed: row.nonzeroInteractionSpeed,
      positionError: row.finalPositionError,
      directionError: row.finalDirectionErrorDegrees,
    })),
  ),
);
check(
  "smootherstep return remains inside the exact start-anchor segment",
  scenarioDiagnostics.every((row) => (
    row.maximumSegmentDeviation <= 1e-9
    && row.maximumParameterOvershoot <= 1e-12
  )),
  JSON.stringify(
    scenarioDiagnostics.map((row) => ({
      id: row.id,
      deviation: row.maximumSegmentDeviation,
      overshoot: row.maximumParameterOvershoot,
    })),
  ),
);
check(
  "return terminal orientation settles without a final-frame jump",
  scenarioDiagnostics.every(
    (row) => row.terminalDirectionStepDegrees <= 0.05,
  ),
  JSON.stringify(
    scenarioDiagnostics.map((row) => ({
      id: row.id,
      terminalStepDegrees: row.terminalDirectionStepDegrees,
    })),
  ),
);
check(
  "visible Explore paths retain the paper, hotspot and cell floors",
  scenarioDiagnostics
    .filter((row) => row.visibleFloorRequired)
    .every((row) => (
      row.minimumPaperCount >= envelope.paperHardFloor
      && row.minimumHotspotCount >= envelope.hotspotHardFloor
      && row.minimumHotspotCellCount >= envelope.hotspotCellHardFloor
    )),
  JSON.stringify(
    scenarioDiagnostics
      .filter((row) => row.visibleFloorRequired)
      .map((row) => ({
        id: row.id,
        papers: row.minimumPaperCount,
        hotspots: row.minimumHotspotCount,
        cells: row.minimumHotspotCellCount,
      })),
  ),
);
check(
  "blank-view return prewarms the anchor union before camera motion",
  /agentTheoryReturnPreparedAtMs = now/.test(componentSource)
    && /agentTheoryCameraMode === "return-preparing"[\s\S]{0,1200}agentTheoryReturnAnchorLodResult !== null[\s\S]{0,800}startAgentTheoryPreparedReturn/.test(
      componentSource,
    )
    && /paperLayer\.setAgentLodSelection\(\s*agentTheoryReturnUnionIndices/.test(
      componentSource,
    ),
  "anchor selection is added during return-preparing; camera starts only after prewarm",
);
check(
  "runtime uses the R6 derivative-free anchor trajectory",
  /createAgentTheoryAnchorReturnTransition\(\{[\s\S]{0,800}fromPosition:[\s\S]{0,500}toPosition:[\s\S]{0,500}angleRadians:/.test(
    componentSource,
  )
    && !/createAgentTheoryReturnTransition/.test(componentSource)
    && /position:\s*lerpVec3\(/.test(perimeterSource)
    && /const progress = smootherstep\(linearProgress\)/.test(
      perimeterSource,
    ),
  "position lerp + quaternion slerp; no free-look derivative injection",
);
check(
  "return preserves actual live weights while R8 resumes cruise non-blockingly",
  /function measureAgentTheoryActualReturnVisibility\([\s\S]{0,2600}paperLayer\.getAgentLodWeights/.test(
    componentSource,
  )
    && /agentTheoryReturnVisibilityGatePassed = isAgentTheoryVisibilitySafe\(/.test(
      componentSource,
    )
    && /agentTheoryReturnAwaitingFirstCruiseStep = !reduceMotion/.test(
      componentSource,
    )
    && /completeAgentTheoryReturnAfterCruiseStep\(now\)/.test(componentSource)
    && /retiringDurationMs:\s*300/.test(componentSource),
  "the anchor union retires over 300ms while the first resumed fixed step releases the UI",
);
check(
  "Worker responses are scoped by R6 purpose and projection signature",
  /agent-theory-screen-lod-worker-v3-guidance/.test(protocolSource)
    && /purpose:\s*AgentTheoryLodPurpose/.test(protocolSource)
    && /projectionSignature:\s*AgentTheoryProjectionSignature/.test(
      protocolSource,
    )
    && /response\.projectionSignature[\s\S]{0,120}agentTheoryExpectedProjectionSignature/.test(
      componentSource,
    )
    && /returnDiscardedLodResponseCount/.test(componentSource),
  "stale purpose, projection or viewport responses cannot replace the anchor set",
);
check(
  "dialog and camera share one return progress contract",
  /onAgentTheoryReturnProgressRef\.current\?\.\(\{[\s\S]{0,120}phase,[\s\S]{0,120}progress: boundedProgress/.test(
    componentSource,
  )
    && /const cameraProgress = snapshot\.phase === "return-preparing"[\s\S]{0,180}snapshot\.progress/.test(
      pageSource,
    )
    && /applyTheoryDialogExploreAmount\(1 - cameraProgress\)/.test(
      pageSource,
    ),
  "return-preparing holds both; returning-anchor advances both from one RAF progress",
);
check(
  "return can be interrupted back into Explore without replacing the anchor",
  /else if \(theoryReturnActive\)[\s\S]{0,220}setExploreTheory\(true\)/.test(
    pageSource,
  )
    && /agentTheoryCameraMode === "cruise"[\s\S]{0,80}\|\| !agentTheoryExploreEntryAnchor/.test(
      componentSource,
    ),
  "the original entry anchor survives an interrupted return",
);

const failed = checks.filter((entry) => !entry.passed);
const result = {
  audit: "agent-theory-explore-return-r6-v1",
  generatedAt: new Date().toISOString(),
  status: failed.length === 0 ? "PASS" : "FAIL",
  snapshotId: active.snapshotId,
  viewport,
  envelope,
  anchor: {
    position: anchorPosition.toArray(),
    visible: anchorVisibility,
    selectionCount: anchorSelection.selectedIndices.length,
  },
  scenarioDiagnostics,
  checks,
  failedChecks: failed,
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (failed.length > 0) process.exitCode = 1;
