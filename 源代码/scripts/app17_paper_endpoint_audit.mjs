import { readFile } from "node:fs/promises";

import * as THREE from "three";

import { resolveGalaxyPaperReadingPose } from "../src/components/App17PaperJourneyController.ts";

const SNAPSHOT_PATH = new URL("../.visual-review/app17/payload.json", import.meta.url);
const CANVAS_SOURCE_PATH = new URL("../src/components/App17GalaxyCanvas.tsx", import.meta.url);
const CONTROLLER_SOURCE_PATH = new URL("../src/components/App17PaperJourneyController.ts", import.meta.url);
const SYSTEM_RADIUS = 3.2;
const SYSTEM_DISTANCE = 8;
const STAR_RADIUS = 0.38;
const STAR_SAFE_RADIUS = STAR_RADIUS * 1.25;
const PAPER_STAR_EXCLUSION_RADIUS = 0.82;
const VIEWPORT_WIDTH = 936;
const VIEWPORT_HEIGHT = 718;
const CAMERA_FOV = 42;
const CAMERA_ASPECT = VIEWPORT_WIDTH / VIEWPORT_HEIGHT;
const READING_ANCHOR_NDC_X = -0.46;
const READING_ANCHOR_NDC_Y = 0;
const TARGET_BODY_DIAMETER_PX = THREE.MathUtils.clamp(VIEWPORT_HEIGHT * 0.10, 72, 112);
const OBSERVATION_DIRECTION_COUNT = 12;
const CARRIER_SCALE = 1.35;
const TIMELINE_SAMPLE_PROGRESS = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1];

function clamp01(value) {
  return THREE.MathUtils.clamp(value, 0, 1);
}

function smootherStep(value) {
  const progress = clamp01(value);
  return progress * progress * progress * (progress * (progress * 6 - 15) + 10);
}

function screenDistancePx(a, b) {
  return Math.hypot(
    (a.x - b.x) * VIEWPORT_WIDTH * 0.5,
    (a.y - b.y) * VIEWPORT_HEIGHT * 0.5,
  );
}

function screenLineDeviationPx(start, end, point) {
  const delta = end.clone().sub(start);
  const lengthSq = delta.lengthSq();
  if (lengthSq < 1e-12) return 0;
  const progress = THREE.MathUtils.clamp(point.clone().sub(start).dot(delta) / lengthSq, 0, 1);
  return screenDistancePx(point, start.clone().addScaledVector(delta, progress));
}

function stableHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function topicKey(value) {
  return `${value.field}::${value.topicId}`;
}

function cameraQuaternionForTarget(position, target, up) {
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(position, target, up));
}

function observationDirections() {
  const directions = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let index = 0; index < OBSERVATION_DIRECTION_COUNT; index += 1) {
    const y = 1 - ((index + 0.5) / OBSERVATION_DIRECTION_COUNT) * 2;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const angle = index * goldenAngle;
    directions.push(new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, y));
  }
  return directions;
}

function systemCameraPose(direction) {
  const position = direction.clone().multiplyScalar(SYSTEM_DISTANCE);
  return {
    position,
    quaternion: cameraQuaternionForTarget(position, new THREE.Vector3(), new THREE.Vector3(0, 0, 1)),
  };
}

function localProjection(target, pose, projection) {
  const local = target.clone().sub(pose.position).applyQuaternion(pose.quaternion.clone().invert());
  const depth = -local.z;
  const halfHeight = depth * Math.tan(THREE.MathUtils.degToRad(projection.fovDegrees) * 0.5);
  const halfWidth = halfHeight * projection.aspect;
  return {
    depth,
    ndcX: local.x / Math.max(1e-9, halfWidth),
    ndcY: local.y / Math.max(1e-9, halfHeight),
  };
}

function segmentPointMinimumDistance(start, end, point) {
  const segment = end.clone().sub(start);
  const lengthSq = segment.lengthSq();
  if (lengthSq < 1e-12) return start.distanceTo(point);
  const progress = THREE.MathUtils.clamp(point.clone().sub(start).dot(segment) / lengthSq, 0, 1);
  return start.clone().addScaledVector(segment, progress).distanceTo(point);
}

function targetDistanceForWorldDiameter(worldDiameter, projection) {
  const effectiveFov = THREE.MathUtils.degToRad(projection.fovDegrees);
  const targetViewDepth = worldDiameter / Math.max(
    0.001,
    2 * Math.tan(effectiveFov * 0.5) * (TARGET_BODY_DIAMETER_PX / VIEWPORT_HEIGHT),
  );
  const anchorYaw = Math.atan(
    READING_ANCHOR_NDC_X * projection.aspect * Math.tan(effectiveFov * 0.5),
  );
  return THREE.MathUtils.clamp(
    targetViewDepth / Math.max(0.001, Math.abs(Math.cos(anchorYaw))),
    0.12,
    4.5,
  );
}

function projectedDiameter(target, pose, projection, worldDiameter) {
  const { depth } = localProjection(target, pose, projection);
  const visibleWorldHeight = 2 * depth * Math.tan(THREE.MathUtils.degToRad(projection.fovDegrees) * 0.5);
  return worldDiameter * VIEWPORT_HEIGHT / Math.max(1e-9, visibleWorldHeight);
}

const [payloadText, canvasSource, controllerSource] = await Promise.all([
  readFile(SNAPSHOT_PATH, "utf8"),
  readFile(CANVAS_SOURCE_PATH, "utf8"),
  readFile(CONTROLLER_SOURCE_PATH, "utf8"),
]);
const payload = JSON.parse(payloadText);
const hotspots = new Map(payload.hotspots.map((hotspot) => [topicKey(hotspot), hotspot]));
const papersByTopic = new Map();
for (const paper of payload.papers) {
  const key = topicKey(paper);
  const papers = papersByTopic.get(key) ?? [];
  papers.push(paper);
  papersByTopic.set(key, papers);
}

const projection = {
  fovDegrees: CAMERA_FOV,
  aspect: CAMERA_ASPECT,
  zoom: 1,
  up: new THREE.Vector3(0, 0, 1),
};
const starCenter = new THREE.Vector3();
const auditRows = [];
let displacedFromStar = 0;
for (const [key, papers] of papersByTopic) {
  const hotspot = hotspots.get(key);
  if (!hotspot) continue;
  const relative = papers.map((paper) => ({
    paper,
    position: new THREE.Vector3(
      paper.x - hotspot.x,
      paper.y - hotspot.y,
      (paper.z - hotspot.z) * 0.62,
    ),
  }));
  const radii = relative.map((item) => item.position.length()).sort((a, b) => a - b);
  const percentileIndex = Math.min(radii.length - 1, Math.max(0, Math.floor(radii.length * 0.95)));
  const coordinateScale = SYSTEM_RADIUS / Math.max(0.0001, radii[percentileIndex] || 1);
  for (const item of relative) {
    const paperId = item.paper.scopedPaperId || item.paper.rawPaperId;
    const targetWorldPosition = item.position.multiplyScalar(coordinateScale);
    if (targetWorldPosition.length() < PAPER_STAR_EXCLUSION_RADIUS) {
      displacedFromStar += 1;
      if (targetWorldPosition.lengthSq() < 1e-12) {
        const random = seededRandom(stableHash(`${paperId}:star-exclusion`));
        targetWorldPosition.set(random() - 0.5, random() - 0.5, random() - 0.5);
        if (targetWorldPosition.lengthSq() < 1e-12) targetWorldPosition.set(1, 0, 0);
      }
      targetWorldPosition.setLength(PAPER_STAR_EXCLUSION_RADIUS);
    }
    auditRows.push({ paperId, paper: item.paper, targetWorldPosition });
  }
}

let visibleCases = 0;
let acceptedVisibleCases = 0;
let occludedCases = 0;
let correctlyRejectedOccludedCases = 0;
let relaxedCases = 0;
let maximumBodyErrorPx = 0;
let maximumRelaxedBodyErrorPx = 0;
let maximumAnchorErrorPx = 0;
let maximumRayLateralDeviation = 0;
let maximumScreenPathLineDeviationPx = 0;
let maximumAnchorProgressError = 0;
let maximumReturnAnchorSymmetryErrorPx = 0;
let minimumEarlyAnchorProgress = Number.POSITIVE_INFINITY;
let earlyAnchorMotionCases = 0;
let minimumStarClearance = Number.POSITIVE_INFINITY;
const failures = [];
const directions = observationDirections();

for (let paperIndex = 0; paperIndex < auditRows.length; paperIndex += 1) {
  const { paperId, paper, targetWorldPosition } = auditRows[paperIndex];
  for (let directionIndex = 0; directionIndex < directions.length; directionIndex += 1) {
    const startCameraPose = systemCameraPose(directions[directionIndex]);
    const startProjection = localProjection(targetWorldPosition, startCameraPose, projection);
    if (
      startProjection.depth <= 0
      || Math.abs(startProjection.ndcX) > 0.96
      || Math.abs(startProjection.ndcY) > 0.96
    ) continue;

    const physicalLineClearance = segmentPointMinimumDistance(
      startCameraPose.position,
      targetWorldPosition,
      starCenter,
    );
    const occluded = physicalLineClearance < STAR_RADIUS * 1.005;
    const paperViewDepth = Math.max(1, startProjection.depth);
    const pointDistanceScale = THREE.MathUtils.clamp(10 / paperViewDepth, 0.78, 1.18);
    const systemPointDiameter = THREE.MathUtils.clamp(
      (paper.size || 2.2) * pointDistanceScale,
      2.05,
      4.2,
    );
    const visibleWorldHeight = 2
      * paperViewDepth
      * Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV) * 0.5);
    const ownerWorldDiameter = Math.max(
      0.0001,
      systemPointDiameter * visibleWorldHeight / VIEWPORT_HEIGHT,
    );
    const resolution = resolveGalaxyPaperReadingPose({
      startCameraPose,
      targetWorldPosition,
      targetDistance: targetDistanceForWorldDiameter(ownerWorldDiameter, projection),
      startAnchorNdcX: THREE.MathUtils.clamp(startProjection.ndcX, -0.96, 0.96),
      startAnchorNdcY: THREE.MathUtils.clamp(startProjection.ndcY, -0.96, 0.96),
      endAnchorNdcX: READING_ANCHOR_NDC_X,
      endAnchorNdcY: READING_ANCHOR_NDC_Y,
      projection,
      viewportWidth: VIEWPORT_WIDTH,
      viewportHeight: VIEWPORT_HEIGHT,
      starCenter,
      starSafeRadius: STAR_SAFE_RADIUS,
      starPhysicalRadius: STAR_RADIUS,
    });

    if (occluded) {
      occludedCases += 1;
      if (!resolution) correctlyRejectedOccludedCases += 1;
      else failures.push({ paperId, directionIndex, reason: "occluded-accepted" });
      continue;
    }
    visibleCases += 1;
    if (!resolution) {
      failures.push({ paperId, directionIndex, reason: "visible-straight-ray-rejected" });
      continue;
    }

    const endpointProjection = localProjection(targetWorldPosition, resolution.endCameraPose, projection);
    const bodyErrorPx = Math.abs(
      projectedDiameter(targetWorldPosition, resolution.endCameraPose, projection, ownerWorldDiameter)
        - TARGET_BODY_DIAMETER_PX,
    );
    const anchorErrorPx = Math.hypot(
      (endpointProjection.ndcX - READING_ANCHOR_NDC_X) * VIEWPORT_WIDTH * 0.5,
      (endpointProjection.ndcY - READING_ANCHOR_NDC_Y) * VIEWPORT_HEIGHT * 0.5,
    );
    const pathDirection = resolution.path.endCameraPose.position.clone()
      .sub(resolution.path.startCameraPose.position);
    const pathLength = pathDirection.length();
    let rayLateralDeviation = 0;
    if (pathLength > 1e-9) {
      pathDirection.multiplyScalar(1 / pathLength);
      for (let sampleIndex = 0; sampleIndex <= 64; sampleIndex += 1) {
        const samplePosition = resolution.path.startCameraPose.position.clone().lerp(
          resolution.path.endCameraPose.position,
          sampleIndex / 64,
        );
        const fromStart = samplePosition.sub(resolution.path.startCameraPose.position);
        rayLateralDeviation = Math.max(
          rayLateralDeviation,
          fromStart.addScaledVector(pathDirection, -fromStart.dot(pathDirection)).length(),
        );
      }
    }
    const clearance = resolution.path.minimumStarClearance;
    const startAnchor = new THREE.Vector2(
      resolution.path.startAnchorNdcX,
      resolution.path.startAnchorNdcY,
    );
    const endAnchor = new THREE.Vector2(
      resolution.path.endAnchorNdcX,
      resolution.path.endAnchorNdcY,
    );
    const anchorDelta = endAnchor.clone().sub(startAnchor);
    const anchorLengthSq = anchorDelta.lengthSq();
    let previousAnchorProgress = -1;
    let timelineMonotonic = true;
    for (const progress of TIMELINE_SAMPLE_PROGRESS) {
      const easedProgress = smootherStep(progress);
      const anchor = startAnchor.clone().lerp(endAnchor, easedProgress);
      const normalizedAnchorProgress = anchorLengthSq > 1e-12
        ? anchor.clone().sub(startAnchor).dot(anchorDelta) / anchorLengthSq
        : easedProgress;
      const reverseAnchor = endAnchor.clone().lerp(startAnchor, easedProgress);
      const mirroredForwardAnchor = startAnchor.clone().lerp(endAnchor, smootherStep(1 - progress));
      maximumScreenPathLineDeviationPx = Math.max(
        maximumScreenPathLineDeviationPx,
        screenLineDeviationPx(startAnchor, endAnchor, anchor),
      );
      maximumAnchorProgressError = Math.max(
        maximumAnchorProgressError,
        Math.abs(normalizedAnchorProgress - easedProgress),
      );
      maximumReturnAnchorSymmetryErrorPx = Math.max(
        maximumReturnAnchorSymmetryErrorPx,
        screenDistancePx(reverseAnchor, mirroredForwardAnchor),
      );
      if (normalizedAnchorProgress + 1e-9 < previousAnchorProgress) timelineMonotonic = false;
      previousAnchorProgress = normalizedAnchorProgress;
      if (progress === 0.1 && screenDistancePx(startAnchor, endAnchor) > 8) {
        earlyAnchorMotionCases += 1;
        minimumEarlyAnchorProgress = Math.min(minimumEarlyAnchorProgress, normalizedAnchorProgress);
      }
    }
    const relaxed = resolution.readingDistanceRelaxation > 1e-6;
    if (relaxed) {
      relaxedCases += 1;
      maximumRelaxedBodyErrorPx = Math.max(maximumRelaxedBodyErrorPx, bodyErrorPx);
    } else {
      maximumBodyErrorPx = Math.max(maximumBodyErrorPx, bodyErrorPx);
    }
    maximumAnchorErrorPx = Math.max(maximumAnchorErrorPx, anchorErrorPx);
    maximumRayLateralDeviation = Math.max(maximumRayLateralDeviation, rayLateralDeviation);
    minimumStarClearance = Math.min(minimumStarClearance, clearance);

    if (
      resolution.path.mode !== "direct"
      || resolution.endpointCandidateCount !== 1
      || resolution.endpointDirectionDeviationDegrees !== 0
      || anchorErrorPx > 0.75
      || rayLateralDeviation > 1e-5
      || !timelineMonotonic
      || clearance < STAR_SAFE_RADIUS
      || (!relaxed && bodyErrorPx > 3)
    ) {
      failures.push({
        paperId,
        directionIndex,
        reason: "metric",
        bodyErrorPx,
        relaxed,
        anchorErrorPx,
        rayLateralDeviation,
        timelineMonotonic,
        minimumStarClearance: clearance,
        pathMode: resolution.path.mode,
      });
      continue;
    }
    acceptedVisibleCases += 1;
  }
  if ((paperIndex + 1) % 2_000 === 0) {
    console.log(`[paper-straight-ray-audit] ${paperIndex + 1}/${auditRows.length}`);
  }
}

// The square carrier's closest edge is already outside the hard discard
// radius. Scan the full requested projected-size range and all four edges to
// make the zero-leak assertion explicit.
let maximumRepresentativeCarrierEdgeLeak = 0;
for (let projectedSize = 1; projectedSize <= 320; projectedSize += 1) {
  for (const point of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1]]) {
    const opticalRadius = Math.hypot(point[0], point[1]) * CARRIER_SCALE;
    const envelope = opticalRadius > 1.32
      ? 0
      : 1 - THREE.MathUtils.smoothstep(opticalRadius, 1.24, 1.32);
    maximumRepresentativeCarrierEdgeLeak = Math.max(maximumRepresentativeCarrierEdgeLeak, envelope);
  }
}
const envelopeDefinitionCount = (canvasSource.match(/representativeCarrierEnvelope\(float opticalRadius\)/g) ?? []).length;
const envelopeUseCount = (canvasSource.match(/representativeCarrierEnvelope\(opticalRadius\)/g) ?? []).length;
const hardDiscardCount = (canvasSource.match(/opticalRadius > 1\.32/g) ?? []).length;
const shaderEnvelopeComplete = envelopeDefinitionCount === 1 && envelopeUseCount >= 4 && hardDiscardCount >= 4;
const unifiedAnchorTimelineComplete = !controllerSource.includes("ANCHOR_SETTLE_START")
  && !controllerSource.includes("anchorSettleStart")
  && !controllerSource.includes("anchorCurve")
  && !controllerSource.includes("pathAnchorBlend")
  && controllerSource.includes(
    "const anchorNdcX = THREE.MathUtils.lerp(path.startAnchorNdcX, path.endAnchorNdcX, easedProgress);",
  )
  && controllerSource.includes(
    "const anchorNdcY = THREE.MathUtils.lerp(path.startAnchorNdcY, path.endAnchorNdcY, easedProgress);",
  );

const summary = {
  papers: auditRows.length,
  hotspots: papersByTopic.size,
  observationDirections: directions.length,
  visibleCases,
  acceptedVisibleCases,
  visibleSuccessRate: visibleCases > 0 ? acceptedVisibleCases / visibleCases : 0,
  occludedCases,
  correctlyRejectedOccludedCases,
  occludedRejectionRate: occludedCases > 0 ? correctlyRejectedOccludedCases / occludedCases : 1,
  displacedFromStar,
  relaxedCases,
  targetBodyDiameterPx: TARGET_BODY_DIAMETER_PX,
  maximumBodyErrorPx,
  maximumRelaxedBodyErrorPx,
  maximumAnchorErrorPx,
  maximumRayLateralDeviation,
  maximumScreenPathLineDeviationPx,
  maximumAnchorProgressError,
  maximumReturnAnchorSymmetryErrorPx,
  minimumEarlyAnchorProgress: Number.isFinite(minimumEarlyAnchorProgress) ? minimumEarlyAnchorProgress : 0,
  earlyAnchorMotionCases,
  minimumStarClearance,
  starSafeRadius: STAR_SAFE_RADIUS,
  maximumRepresentativeCarrierEdgeLeak,
  shaderEnvelopeComplete,
  envelopeDefinitionCount,
  envelopeUseCount,
  hardDiscardCount,
  unifiedAnchorTimelineComplete,
  ordinaryHandoffDiameterRatio: 1,
  failures: failures.slice(0, 20),
};
console.log(JSON.stringify(summary, null, 2));
if (
  failures.length > 0
  || acceptedVisibleCases !== visibleCases
  || correctlyRejectedOccludedCases !== occludedCases
  || maximumRepresentativeCarrierEdgeLeak !== 0
  || !shaderEnvelopeComplete
  || !unifiedAnchorTimelineComplete
  || maximumScreenPathLineDeviationPx > 0.75
  || maximumAnchorProgressError > 1e-6
  || maximumReturnAnchorSymmetryErrorPx > 0.75
  || earlyAnchorMotionCases === 0
  || minimumEarlyAnchorProgress < smootherStep(0.1) - 1e-6
) process.exitCode = 1;
