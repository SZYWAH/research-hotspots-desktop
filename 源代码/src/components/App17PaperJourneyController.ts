import * as THREE from "three";

export type GalaxyPaperJourneyState =
  | "idle"
  | "acquiring"
  | "flying-in"
  | "reading"
  | "flying-out"
  | "releasing";

// `avoidance` remains in the public diagnostic union so old trace snapshots can
// still be read. New paths are always direct.
export type GalaxyPaperJourneyPathMode = "none" | "direct" | "avoidance";

export type GalaxyPaperCameraPose = {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
};

export type GalaxyPaperReadingOrbit = {
  center: THREE.Vector3;
  distance: number;
  azimuth: number;
  elevation: number;
  anchorNdcX: number;
};

export type GalaxyPaperJourneyPath = {
  mode: "direct";
  startCameraPose: GalaxyPaperCameraPose;
  endCameraPose: GalaxyPaperCameraPose;
  targetWorldPosition: THREE.Vector3;
  startAnchorNdcX: number;
  startAnchorNdcY: number;
  endAnchorNdcX: number;
  endAnchorNdcY: number;
  orientationRollRadians: number;
  minimumStarClearance: number;
  resolvedReadingDistance: number;
  readingDistanceRelaxation: number;
};

export type GalaxyPaperJourneyPanelState = "hidden" | "staged" | "entering" | "visible" | "exiting";

export type GalaxyPaperJourneyFrame = {
  state: GalaxyPaperJourneyState;
  targetId: string;
  targetWorldPosition: THREE.Vector3 | null;
  cameraPose: GalaxyPaperCameraPose | null;
  journeyProgress: number;
  focusBlend: number;
  visualOwnerOpacity: number;
  inspectionLod: number;
  panelProgress: number;
  panelState: GalaxyPaperJourneyPanelState;
  anchorNdcX: number;
  anchorNdcY: number;
  pathMode: GalaxyPaperJourneyPathMode;
  minimumStarClearance: number;
  smoothnessExtensionMs: number;
  projectedTargetDiameter: number;
  cameraTravelDistance: number;
  cameraDistanceToTarget: number;
  targetWorldPositionDrift: number;
  returnPositionError: number;
  returnAngleErrorDegrees: number;
  cameraRayLateralDeviation: number;
  targetScreenStepPx: number;
  targetScreenReversals: number;
  cameraQuaternionStepDegrees: number;
  progressStep: number;
  resolvedReadingDistance: number;
  readingDistanceRelaxation: number;
  cameraWriter: "orbit" | "paper-journey" | "paper-reading";
};

export type GalaxyPaperJourneyProjection = {
  fovDegrees: number;
  aspect: number;
  zoom: number;
  up: THREE.Vector3;
};

export type GalaxyPaperJourneyStartOptions = {
  now: number;
  targetId: string;
  targetWorldPosition: THREE.Vector3;
  startPose: GalaxyPaperCameraPose;
  systemPose: GalaxyPaperCameraPose;
  endCameraPose: GalaxyPaperCameraPose;
  preparedPath: GalaxyPaperJourneyPath;
  startAnchorNdcX: number;
  startAnchorNdcY?: number;
  targetAnchorNdcX: number;
  targetAnchorNdcY?: number;
  durationMs?: number;
  acquireDurationMs?: number;
  retargeting?: boolean;
  projection: GalaxyPaperJourneyProjection;
  starCenter?: THREE.Vector3;
  starSafeRadius?: number;
  starPhysicalRadius?: number;
  // Kept as ignored compatibility inputs until all old call sites disappear.
  starVisualRadius?: number;
  maximumVisibleStarViewportRatio?: number;
  minimumReadingStarViewDepth?: number;
  targetWorldDiameter?: number;
  viewportWidth?: number;
  viewportHeight?: number;
};

export type GalaxyPaperReadingPoseResolution = {
  endCameraPose: GalaxyPaperCameraPose;
  path: GalaxyPaperJourneyPath;
  endpointStarExitMarginPx: number;
  endpointCandidateCount: number;
  endpointDirectionDeviationDegrees: number;
  endpointCompositionRejected: boolean;
  resolvedReadingDistance: number;
  readingDistanceRelaxation: number;
};

export type GalaxyPaperReadingPoseOptions = {
  startCameraPose: GalaxyPaperCameraPose;
  targetWorldPosition: THREE.Vector3;
  targetDistance: number;
  startAnchorNdcX: number;
  startAnchorNdcY?: number;
  endAnchorNdcX: number;
  endAnchorNdcY?: number;
  projection: GalaxyPaperJourneyProjection;
  viewportWidth: number;
  viewportHeight: number;
  starCenter: THREE.Vector3;
  starSafeRadius: number;
  starPhysicalRadius?: number;
  // Ignored compatibility inputs from the retired composition solver.
  starVisualRadius?: number;
  endpointStarExitMarginPx?: number;
  maximumVisibleStarViewportRatio?: number;
};

export type GalaxyPaperJourneyReturnOptions = {
  now: number;
  currentPose: GalaxyPaperCameraPose;
  projection: GalaxyPaperJourneyProjection;
  durationMs?: number;
};

type ProjectedTarget = {
  x: number;
  y: number;
  depth: number;
};

type SampledPath = {
  cameraPose: GalaxyPaperCameraPose;
  easedProgress: number;
  anchorNdcX: number;
  anchorNdcY: number;
};

type ActiveSegment = {
  startedAt: number;
  durationMs: number;
  path: GalaxyPaperJourneyPath;
  actualProgress: number;
  lastAdvancedAt: number;
  lastProjectedTargetDiameter: number;
  lastProjection: ProjectedTarget;
  lastQuaternion: THREE.Quaternion;
  lastProgressStep: number;
  lastScreenStepPx: number;
  lastQuaternionStepDegrees: number;
  lastHorizontalDirection: -1 | 0 | 1;
  targetScreenReversals: number;
  focusBlendScale: number;
  smoothnessExtensionMs: number;
};

type ReadingAnchorTransition = {
  startedAt: number;
  startAnchorNdcX: number;
  endAnchorNdcX: number;
};

const ACQUIRE_MS = 120;
const RELEASE_MS = 120;
const DEFAULT_FLIGHT_MS = 1_800;
const DEFAULT_RETARGET_MS = DEFAULT_FLIGHT_MS;
const PANEL_ENTER_MS = 420;
const PANEL_EXIT_MS = 150;
const ANCHOR_TRANSITION_MS = 420;
const MAX_PROJECTED_SIZE_RATIO = 1.05;
const MIN_PROJECTED_SIZE_RATIO = 0.95;
const MAX_PROGRESS_STEP = 1 / 45;
const MAX_QUATERNION_STEP_DEGREES = 1.25;
const SCREEN_REVERSAL_NOISE_PX = 0.75;
const PATH_SAMPLE_COUNT = 320;
const POSITION_EPSILON = 1e-6;

function clamp01(value: number) {
  return THREE.MathUtils.clamp(value, 0, 1);
}

function smootherStep(value: number) {
  const t = clamp01(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function clonePose(pose: GalaxyPaperCameraPose): GalaxyPaperCameraPose {
  return {
    position: pose.position.clone(),
    quaternion: pose.quaternion.clone().normalize(),
  };
}

function cloneProjection(projection: GalaxyPaperJourneyProjection): GalaxyPaperJourneyProjection {
  return { ...projection, up: projection.up.clone() };
}

function clonePath(path: GalaxyPaperJourneyPath): GalaxyPaperJourneyPath {
  return {
    ...path,
    startCameraPose: clonePose(path.startCameraPose),
    endCameraPose: clonePose(path.endCameraPose),
    targetWorldPosition: path.targetWorldPosition.clone(),
  };
}

function effectiveFov(projection: GalaxyPaperJourneyProjection) {
  return 2 * Math.atan(
    Math.tan(THREE.MathUtils.degToRad(projection.fovDegrees) * 0.5)
      / Math.max(0.0001, projection.zoom),
  );
}

/**
 * Construct the unique roll-free pose that sees `target` at the requested NDC.
 * Position and composition therefore share one solve; there is no independent
 * quaternion interpolation that can wobble against the camera path.
 */
function cameraQuaternionForScreenTarget(
  position: THREE.Vector3,
  target: THREE.Vector3,
  projection: GalaxyPaperJourneyProjection,
  targetNdcX: number,
  targetNdcY: number,
) {
  const worldDirection = target.clone().sub(position).normalize();
  if (worldDirection.lengthSq() < 1e-12) return new THREE.Quaternion();
  const tanHalfFov = Math.tan(effectiveFov(projection) * 0.5);
  const localDirection = new THREE.Vector3(
    targetNdcX * projection.aspect * tanHalfFov,
    targetNdcY * tanHalfFov,
    -1,
  ).normalize();
  const quaternion = new THREE.Quaternion().setFromUnitVectors(localDirection, worldDirection);

  const currentUp = new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion)
    .addScaledVector(worldDirection, -new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion).dot(worldDirection));
  const desiredUp = projection.up.clone()
    .addScaledVector(worldDirection, -projection.up.dot(worldDirection));
  if (currentUp.lengthSq() > 1e-10 && desiredUp.lengthSq() > 1e-10) {
    currentUp.normalize();
    desiredUp.normalize();
    const cross = currentUp.clone().cross(desiredUp);
    const roll = Math.atan2(worldDirection.dot(cross), currentUp.dot(desiredUp));
    quaternion.premultiply(
      new THREE.Quaternion().setFromAxisAngle(worldDirection, roll),
    );
  }
  return quaternion.normalize();
}

function cameraRollOffsetRadians(
  baseQuaternion: THREE.Quaternion,
  requestedQuaternion: THREE.Quaternion,
  worldDirection: THREE.Vector3,
) {
  const baseUp = new THREE.Vector3(0, 1, 0).applyQuaternion(baseQuaternion)
    .addScaledVector(
      worldDirection,
      -new THREE.Vector3(0, 1, 0).applyQuaternion(baseQuaternion).dot(worldDirection),
    );
  const requestedUp = new THREE.Vector3(0, 1, 0).applyQuaternion(requestedQuaternion)
    .addScaledVector(
      worldDirection,
      -new THREE.Vector3(0, 1, 0).applyQuaternion(requestedQuaternion).dot(worldDirection),
    );
  if (baseUp.lengthSq() < 1e-10 || requestedUp.lengthSq() < 1e-10) return 0;
  baseUp.normalize();
  requestedUp.normalize();
  return Math.atan2(
    worldDirection.dot(baseUp.clone().cross(requestedUp)),
    baseUp.dot(requestedUp),
  );
}

function projectWorldToNdc(
  worldPosition: THREE.Vector3,
  cameraPose: GalaxyPaperCameraPose,
  projection: GalaxyPaperJourneyProjection,
): ProjectedTarget {
  const local = worldPosition.clone().sub(cameraPose.position)
    .applyQuaternion(cameraPose.quaternion.clone().invert());
  const depth = -local.z;
  const halfHeight = Math.max(1e-9, depth * Math.tan(effectiveFov(projection) * 0.5));
  const halfWidth = Math.max(1e-9, halfHeight * projection.aspect);
  return {
    x: local.x / halfWidth,
    y: local.y / halfHeight,
    depth,
  };
}

/**
 * Project a paper into the Journey's canonical camera space.
 *
 * The renderer may apply `PerspectiveCamera.setViewOffset()` to reserve room
 * for a context rail. That principal-point shift belongs to the final render,
 * not to the camera pose solved by the Journey. Callers must therefore use
 * this projection instead of `Vector3.project(camera)` when recording path
 * anchors, otherwise the rail offset is baked into the quaternion and then
 * applied a second time by the renderer.
 */
export function projectGalaxyPaperTargetToNdc(
  worldPosition: THREE.Vector3,
  cameraPose: GalaxyPaperCameraPose,
  projection: GalaxyPaperJourneyProjection,
) {
  return projectWorldToNdc(worldPosition, cameraPose, projection);
}

function projectedTargetDiameter(
  target: THREE.Vector3,
  cameraPose: GalaxyPaperCameraPose,
  projection: GalaxyPaperJourneyProjection,
  targetWorldDiameter: number,
  viewportHeight: number,
) {
  const projectionPoint = projectWorldToNdc(target, cameraPose, projection);
  if (projectionPoint.depth <= 1e-7) return Number.POSITIVE_INFINITY;
  const visibleWorldHeight = 2 * projectionPoint.depth * Math.tan(effectiveFov(projection) * 0.5);
  return Math.max(1e-9, targetWorldDiameter * viewportHeight / visibleWorldHeight);
}

function segmentPointMinimumDistance(start: THREE.Vector3, end: THREE.Vector3, point: THREE.Vector3) {
  const segment = end.clone().sub(start);
  const lengthSq = segment.lengthSq();
  if (lengthSq < 1e-12) return start.distanceTo(point);
  const progress = clamp01(point.clone().sub(start).dot(segment) / lengthSq);
  return start.clone().addScaledVector(segment, progress).distanceTo(point);
}

function sampleCameraPath(
  path: GalaxyPaperJourneyPath,
  progress: number,
  projection: GalaxyPaperJourneyProjection,
): SampledPath {
  const actualProgress = clamp01(progress);
  const easedProgress = smootherStep(actualProgress);
  const position = path.startCameraPose.position.clone().lerp(
    path.endCameraPose.position,
    easedProgress,
  );
  const anchorNdcX = THREE.MathUtils.lerp(path.startAnchorNdcX, path.endAnchorNdcX, easedProgress);
  const anchorNdcY = THREE.MathUtils.lerp(path.startAnchorNdcY, path.endAnchorNdcY, easedProgress);
  const quaternion = cameraQuaternionForScreenTarget(
    position,
    path.targetWorldPosition,
    projection,
    anchorNdcX,
    anchorNdcY,
  );
  const worldDirection = path.targetWorldPosition.clone().sub(position).normalize();
  if (Math.abs(path.orientationRollRadians) > 1e-10 && worldDirection.lengthSq() > 1e-10) {
    quaternion.premultiply(
      new THREE.Quaternion().setFromAxisAngle(worldDirection, path.orientationRollRadians),
    ).normalize();
  }
  return {
    cameraPose: { position, quaternion },
    easedProgress,
    anchorNdcX,
    anchorNdcY,
  };
}

function makeDirectPath(options: {
  startCameraPose: GalaxyPaperCameraPose;
  endCameraPose: GalaxyPaperCameraPose;
  targetWorldPosition: THREE.Vector3;
  startAnchorNdcX: number;
  startAnchorNdcY: number;
  endAnchorNdcX: number;
  endAnchorNdcY: number;
  projection: GalaxyPaperJourneyProjection;
  starCenter?: THREE.Vector3;
  resolvedReadingDistance?: number;
  readingDistanceRelaxation?: number;
}): GalaxyPaperJourneyPath {
  const startCameraPose = clonePose(options.startCameraPose);
  const startWorldDirection = options.targetWorldPosition.clone()
    .sub(startCameraPose.position)
    .normalize();
  const baseStartQuaternion = cameraQuaternionForScreenTarget(
    startCameraPose.position,
    options.targetWorldPosition,
    options.projection,
    options.startAnchorNdcX,
    options.startAnchorNdcY,
  );
  const orientationRollRadians = cameraRollOffsetRadians(
    baseStartQuaternion,
    startCameraPose.quaternion,
    startWorldDirection,
  );
  const endCameraPose = clonePose(options.endCameraPose);
  const endWorldDirection = options.targetWorldPosition.clone()
    .sub(endCameraPose.position)
    .normalize();
  endCameraPose.quaternion.copy(cameraQuaternionForScreenTarget(
    endCameraPose.position,
    options.targetWorldPosition,
    options.projection,
    options.endAnchorNdcX,
    options.endAnchorNdcY,
  ));
  if (Math.abs(orientationRollRadians) > 1e-10 && endWorldDirection.lengthSq() > 1e-10) {
    endCameraPose.quaternion.premultiply(
      new THREE.Quaternion().setFromAxisAngle(endWorldDirection, orientationRollRadians),
    ).normalize();
  }
  return {
    mode: "direct",
    startCameraPose,
    endCameraPose,
    targetWorldPosition: options.targetWorldPosition.clone(),
    startAnchorNdcX: options.startAnchorNdcX,
    startAnchorNdcY: options.startAnchorNdcY,
    endAnchorNdcX: options.endAnchorNdcX,
    endAnchorNdcY: options.endAnchorNdcY,
    orientationRollRadians,
    minimumStarClearance: options.starCenter
      ? segmentPointMinimumDistance(
          options.startCameraPose.position,
          options.endCameraPose.position,
          options.starCenter,
        )
      : Number.POSITIVE_INFINITY,
    resolvedReadingDistance: options.resolvedReadingDistance
      ?? options.endCameraPose.position.distanceTo(options.targetWorldPosition),
    readingDistanceRelaxation: options.readingDistanceRelaxation ?? 0,
  };
}

function safeDirectEndpointProgress(
  start: THREE.Vector3,
  desiredEnd: THREE.Vector3,
  starCenter: THREE.Vector3,
  requiredClearance: number,
) {
  if (start.distanceTo(starCenter) < requiredClearance) return null;
  let lastSafe = 0;
  for (let index = 1; index <= PATH_SAMPLE_COUNT; index += 1) {
    const progress = index / PATH_SAMPLE_COUNT;
    const position = start.clone().lerp(desiredEnd, progress);
    if (position.distanceTo(starCenter) < requiredClearance) {
      let lower = lastSafe;
      let upper = progress;
      for (let iteration = 0; iteration < 40; iteration += 1) {
        const middle = (lower + upper) * 0.5;
        const middlePosition = start.clone().lerp(desiredEnd, middle);
        if (middlePosition.distanceTo(starCenter) >= requiredClearance) lower = middle;
        else upper = middle;
      }
      return Math.max(0, lower - 1e-6);
    }
    lastSafe = progress;
  }
  return 1;
}

/**
 * Resolve exactly one endpoint on the current camera-to-paper ray. If the
 * desired distance would enter the star safety sphere, stop earlier on that
 * same ray. There is deliberately no global candidate search and no detour.
 */
export function resolveGalaxyPaperReadingPose(
  options: GalaxyPaperReadingPoseOptions,
): GalaxyPaperReadingPoseResolution | null {
  const startPose = clonePose(options.startCameraPose);
  const target = options.targetWorldPosition.clone();
  const approachDirection = startPose.position.clone().sub(target);
  const startDistance = approachDirection.length();
  if (startDistance < POSITION_EPSILON) return null;
  approachDirection.normalize();

  const requestedDistance = THREE.MathUtils.clamp(options.targetDistance, 0.0001, startDistance);
  const desiredEnd = target.clone().addScaledVector(approachDirection, requestedDistance);
  const requiredClearance = Math.max(0, options.starSafeRadius)
    + Math.max(1e-4, Math.max(0, options.starSafeRadius) * 0.01);
  const physicalRadius = Math.max(0, options.starPhysicalRadius ?? 0);

  // A paper hidden behind the actual star is not a valid focus target. Picking
  // already rejects it; this guard keeps retarget/history paths consistent.
  if (
    physicalRadius > 0
    && segmentPointMinimumDistance(startPose.position, target, options.starCenter)
      < physicalRadius + Math.max(1e-4, physicalRadius * 0.005)
  ) {
    return null;
  }

  const safeProgress = requiredClearance > 0
    ? safeDirectEndpointProgress(
        startPose.position,
        desiredEnd,
        options.starCenter,
        requiredClearance,
      )
    : 1;
  if (safeProgress === null || safeProgress <= 1e-6) return null;

  const endPosition = startPose.position.clone().lerp(desiredEnd, safeProgress);
  const resolvedReadingDistance = endPosition.distanceTo(target);
  const readingDistanceRelaxation = Math.max(0, resolvedReadingDistance - requestedDistance);
  const startAnchorNdcY = options.startAnchorNdcY ?? 0;
  const endAnchorNdcY = options.endAnchorNdcY ?? 0;
  const endCameraPose = {
    position: endPosition,
    quaternion: cameraQuaternionForScreenTarget(
      endPosition,
      target,
      options.projection,
      options.endAnchorNdcX,
      endAnchorNdcY,
    ),
  };
  const path = makeDirectPath({
    startCameraPose: startPose,
    endCameraPose,
    targetWorldPosition: target,
    startAnchorNdcX: options.startAnchorNdcX,
    startAnchorNdcY,
    endAnchorNdcX: options.endAnchorNdcX,
    endAnchorNdcY,
    projection: options.projection,
    starCenter: options.starCenter,
    resolvedReadingDistance,
    readingDistanceRelaxation,
  });

  return {
    endCameraPose: clonePose(path.endCameraPose),
    path,
    endpointStarExitMarginPx: 0,
    endpointCandidateCount: 1,
    endpointDirectionDeviationDegrees: 0,
    endpointCompositionRejected: false,
    resolvedReadingDistance,
    readingDistanceRelaxation,
  };
}

function reversePath(
  path: GalaxyPaperJourneyPath,
  projection: GalaxyPaperJourneyProjection,
): GalaxyPaperJourneyPath {
  const reversed = makeDirectPath({
    startCameraPose: path.endCameraPose,
    endCameraPose: path.startCameraPose,
    targetWorldPosition: path.targetWorldPosition,
    startAnchorNdcX: path.endAnchorNdcX,
    startAnchorNdcY: path.endAnchorNdcY,
    endAnchorNdcX: path.startAnchorNdcX,
    endAnchorNdcY: path.startAnchorNdcY,
    projection,
    resolvedReadingDistance: path.startCameraPose.position.distanceTo(path.targetWorldPosition),
    readingDistanceRelaxation: 0,
  });
  reversed.minimumStarClearance = path.minimumStarClearance;
  return reversed;
}

function reversePathPrefix(
  path: GalaxyPaperJourneyPath,
  currentPose: GalaxyPaperCameraPose,
  traveledProgress: number,
  projection: GalaxyPaperJourneyProjection,
  starCenter?: THREE.Vector3,
) {
  const currentProjection = projectWorldToNdc(path.targetWorldPosition, currentPose, projection);
  return makeDirectPath({
    startCameraPose: currentPose,
    endCameraPose: path.startCameraPose,
    targetWorldPosition: path.targetWorldPosition,
    startAnchorNdcX: currentProjection.x,
    startAnchorNdcY: currentProjection.y,
    endAnchorNdcX: path.startAnchorNdcX,
    endAnchorNdcY: path.startAnchorNdcY,
    projection,
    starCenter,
    resolvedReadingDistance: path.startCameraPose.position.distanceTo(path.targetWorldPosition),
    readingDistanceRelaxation: 0,
  });
}

function poseForReadingOrbit(
  orbit: GalaxyPaperReadingOrbit,
  projection: GalaxyPaperJourneyProjection,
) {
  const horizontalDistance = orbit.distance * Math.cos(orbit.elevation);
  const position = new THREE.Vector3(
    Math.cos(orbit.azimuth) * horizontalDistance,
    Math.sin(orbit.azimuth) * horizontalDistance,
    Math.sin(orbit.elevation) * orbit.distance,
  ).add(orbit.center);
  return {
    position,
    quaternion: cameraQuaternionForScreenTarget(
      position,
      orbit.center,
      projection,
      orbit.anchorNdcX,
      0,
    ),
  } satisfies GalaxyPaperCameraPose;
}

function readingOrbitFromPose(
  pose: GalaxyPaperCameraPose,
  center: THREE.Vector3,
  anchorNdcX: number,
) {
  const offset = pose.position.clone().sub(center);
  const distance = Math.max(1e-6, offset.length());
  return {
    center: center.clone(),
    distance,
    azimuth: Math.atan2(offset.y, offset.x),
    elevation: Math.asin(THREE.MathUtils.clamp(offset.z / distance, -1, 1)),
    anchorNdcX,
  } satisfies GalaxyPaperReadingOrbit;
}

function quaternionAngleDegrees(a: THREE.Quaternion, b: THREE.Quaternion) {
  return THREE.MathUtils.radToDeg(a.angleTo(b));
}

export class App17PaperJourneyController {
  private state: GalaxyPaperJourneyState = "idle";
  private targetId = "";
  private targetWorldPosition: THREE.Vector3 | null = null;
  private targetReferencePosition: THREE.Vector3 | null = null;
  private systemPose: GalaxyPaperCameraPose | null = null;
  private currentPose: GalaxyPaperCameraPose | null = null;
  private projection: GalaxyPaperJourneyProjection | null = null;
  private inboundPath: GalaxyPaperJourneyPath | null = null;
  private inboundReturnsToSystem = true;
  private segment: ActiveSegment | null = null;
  private phaseStartedAt = 0;
  private phaseDurationMs = 0;
  private readingOrbit: GalaxyPaperReadingOrbit | null = null;
  private readingInteracted = false;
  private readingAnchorTransition: ReadingAnchorTransition | null = null;
  private readingPanelVisible = true;
  private readingPanelStartedAt = 0;
  private pausedAt = 0;
  private starCenter: THREE.Vector3 | null = null;
  private starSafeRadius = 0;
  private starPhysicalRadius = 0;
  private targetWorldDiameter = 1;
  private viewportWidth = 1;
  private viewportHeight = 1;
  private lastSmoothnessExtensionMs = 0;
  private lastFrame: GalaxyPaperJourneyFrame = this.createIdleFrame();

  getState() { return this.state; }
  getTargetId() { return this.targetId; }
  getReadingOrbit() {
    return this.readingOrbit
      ? { ...this.readingOrbit, center: this.readingOrbit.center.clone() }
      : null;
  }
  getFrame() { return this.cloneFrame(this.lastFrame); }
  isMoving() {
    return this.state === "acquiring"
      || this.state === "flying-in"
      || this.state === "flying-out"
      || this.state === "releasing"
      || this.readingAnchorTransition !== null;
  }

  startFocus(options: GalaxyPaperJourneyStartOptions) {
    const cameraPose = clonePose(options.startPose);
    const targetWorldPosition = options.targetWorldPosition.clone();
    const preparedPath = options.preparedPath;
    const pathMatchesRequest = preparedPath.targetWorldPosition.distanceTo(targetWorldPosition) <= 1e-5
      && preparedPath.startCameraPose.position.distanceTo(cameraPose.position) <= 1e-5
      && preparedPath.endCameraPose.position.distanceTo(options.endCameraPose.position) <= 1e-5;
    if (!pathMatchesRequest) {
      if (!options.retargeting) this.reset();
      return this.getFrame();
    }

    const retargeting = Boolean(options.retargeting);
    this.targetId = options.targetId;
    this.targetWorldPosition = targetWorldPosition;
    this.targetReferencePosition = targetWorldPosition.clone();
    if (!retargeting || !this.systemPose) this.systemPose = clonePose(options.systemPose);
    this.currentPose = cameraPose;
    this.projection = cloneProjection(options.projection);
    this.starCenter = options.starCenter?.clone() ?? null;
    this.starSafeRadius = Math.max(0, options.starSafeRadius ?? 0);
    this.starPhysicalRadius = Math.max(0, options.starPhysicalRadius ?? 0);
    this.targetWorldDiameter = Math.max(1e-9, options.targetWorldDiameter ?? 1);
    this.viewportWidth = Math.max(1, options.viewportWidth ?? 1);
    this.viewportHeight = Math.max(1, options.viewportHeight ?? 1);
    this.inboundPath = clonePath(preparedPath);
    this.inboundReturnsToSystem = !retargeting;
    const acquireDurationMs = Math.max(0, options.acquireDurationMs ?? ACQUIRE_MS);
    this.segment = this.createSegment(
      this.inboundPath,
      options.now + (retargeting ? 0 : acquireDurationMs),
      options.durationMs ?? (retargeting ? DEFAULT_RETARGET_MS : DEFAULT_FLIGHT_MS),
    );
    this.phaseStartedAt = options.now;
    this.phaseDurationMs = retargeting ? 0 : acquireDurationMs;
    this.state = retargeting || acquireDurationMs <= 0 ? "flying-in" : "acquiring";
    this.readingOrbit = null;
    this.readingInteracted = false;
    this.readingAnchorTransition = null;
    this.readingPanelVisible = true;
    this.readingPanelStartedAt = 0;
    this.lastSmoothnessExtensionMs = 0;
    return this.advance(options.now);
  }

  startReturn(options: GalaxyPaperJourneyReturnOptions) {
    if (!this.targetWorldPosition || !this.systemPose || !this.currentPose || this.state === "idle") {
      return this.getFrame();
    }
    const projection = cloneProjection(options.projection);
    const startPose = clonePose(options.currentPose);
    let path: GalaxyPaperJourneyPath;
    if (this.state === "reading" && !this.readingInteracted && this.inboundReturnsToSystem && this.inboundPath) {
      path = reversePath(this.inboundPath, projection);
    } else {
      const startProjection = projectWorldToNdc(this.targetWorldPosition, startPose, projection);
      const endProjection = projectWorldToNdc(this.targetWorldPosition, this.systemPose, projection);
      path = makeDirectPath({
        startCameraPose: startPose,
        endCameraPose: this.systemPose,
        targetWorldPosition: this.targetWorldPosition,
        startAnchorNdcX: startProjection.x,
        startAnchorNdcY: startProjection.y,
        endAnchorNdcX: endProjection.x,
        endAnchorNdcY: endProjection.y,
        projection,
        starCenter: this.starCenter ?? undefined,
        resolvedReadingDistance: this.systemPose.position.distanceTo(this.targetWorldPosition),
      });
    }
    this.currentPose = clonePose(path.startCameraPose);
    this.projection = projection;
    this.segment = this.createSegment(path, options.now, options.durationMs ?? DEFAULT_FLIGHT_MS);
    this.state = "flying-out";
    this.phaseStartedAt = options.now;
    this.phaseDurationMs = this.segment.durationMs;
    this.readingPanelVisible = false;
    this.readingAnchorTransition = null;
    this.lastSmoothnessExtensionMs = 0;
    return this.advance(options.now);
  }

  cancel(now: number, currentPose: GalaxyPaperCameraPose) {
    if (this.state === "idle") return this.getFrame();
    const traveled = this.state === "flying-in"
      ? this.segment?.actualProgress ?? this.lastFrame.journeyProgress
      : this.state === "acquiring" ? 0 : 1;
    if ((this.state === "acquiring" || this.state === "flying-in") && this.inboundPath && this.projection) {
      const path = reversePathPrefix(
        this.inboundPath,
        currentPose,
        traveled,
        this.projection,
        this.starCenter ?? undefined,
      );
      this.currentPose = clonePose(currentPose);
      this.segment = this.createSegment(
        path,
        now,
        THREE.MathUtils.clamp(DEFAULT_FLIGHT_MS * traveled, 450, DEFAULT_FLIGHT_MS),
        smootherStep(traveled),
      );
      this.state = "flying-out";
      this.phaseStartedAt = now;
      this.phaseDurationMs = this.segment.durationMs;
      this.readingPanelVisible = false;
      this.readingAnchorTransition = null;
      this.lastSmoothnessExtensionMs = 0;
      return this.advance(now);
    }
    return this.startReturn({
      now,
      currentPose,
      projection: this.projection!,
      durationMs: THREE.MathUtils.clamp(DEFAULT_FLIGHT_MS * traveled, 450, DEFAULT_FLIGHT_MS),
    });
  }

  setReadingOrbit(next: Partial<Omit<GalaxyPaperReadingOrbit, "center">>) {
    if (this.state !== "reading" || !this.readingOrbit || !this.projection) return;
    const candidate = { ...this.readingOrbit, center: this.readingOrbit.center.clone() };
    let changed = false;
    for (const key of ["distance", "azimuth", "elevation", "anchorNdcX"] as const) {
      const value = next[key];
      if (typeof value === "number" && Math.abs(value - candidate[key]) > 1e-8) {
        candidate[key] = key === "distance" ? Math.max(1e-6, value) : value;
        changed = true;
      }
    }
    if (!changed) return;
    const candidatePose = poseForReadingOrbit(candidate, this.projection);
    if (!this.readingPoseIsSafe(candidatePose)) return;
    this.readingOrbit = candidate;
    this.readingInteracted = true;
    this.currentPose = candidatePose;
  }

  setReadingAnchor(anchorNdcX: number, now = performance.now()) {
    if (this.state !== "reading" || !this.readingOrbit) return;
    if (Math.abs(anchorNdcX - this.readingOrbit.anchorNdcX) < 1e-8) return;
    this.readingInteracted = true;
    this.readingAnchorTransition = {
      startedAt: now,
      startAnchorNdcX: this.readingOrbit.anchorNdcX,
      endAnchorNdcX: anchorNdcX,
    };
  }

  setReadingPanelVisible(visible: boolean, now = performance.now()) {
    if (this.state !== "reading") return;
    this.readingPanelVisible = visible;
    if (visible) this.readingPanelStartedAt = now;
  }

  reprojectReading(projection: GalaxyPaperJourneyProjection) {
    this.projection = cloneProjection(projection);
    if (this.state === "reading" && this.readingOrbit) {
      this.currentPose = poseForReadingOrbit(this.readingOrbit, this.projection);
    }
  }

  pause(now: number) {
    if (this.pausedAt <= 0) this.pausedAt = now;
  }

  resume(now: number) {
    if (this.pausedAt <= 0) return;
    const duration = Math.max(0, now - this.pausedAt);
    this.phaseStartedAt += duration;
    this.readingPanelStartedAt += duration;
    if (this.segment) {
      this.segment.startedAt += duration;
      this.segment.lastAdvancedAt += duration;
    }
    if (this.readingAnchorTransition) this.readingAnchorTransition.startedAt += duration;
    this.pausedAt = 0;
  }

  reset() {
    this.state = "idle";
    this.targetId = "";
    this.targetWorldPosition = null;
    this.targetReferencePosition = null;
    this.systemPose = null;
    this.currentPose = null;
    this.projection = null;
    this.inboundPath = null;
    this.inboundReturnsToSystem = true;
    this.segment = null;
    this.readingOrbit = null;
    this.readingInteracted = false;
    this.readingAnchorTransition = null;
    this.readingPanelVisible = true;
    this.readingPanelStartedAt = 0;
    this.phaseStartedAt = 0;
    this.phaseDurationMs = 0;
    this.pausedAt = 0;
    this.starCenter = null;
    this.starSafeRadius = 0;
    this.starPhysicalRadius = 0;
    this.targetWorldDiameter = 1;
    this.viewportWidth = 1;
    this.viewportHeight = 1;
    this.lastSmoothnessExtensionMs = 0;
    this.lastFrame = this.createIdleFrame();
  }

  advance(now: number) {
    if (this.pausedAt > 0) return this.getFrame();
    if (!this.targetWorldPosition || !this.currentPose || !this.projection) {
      this.lastFrame = this.createIdleFrame();
      return this.getFrame();
    }

    if (this.state === "acquiring") {
      const progress = this.phaseDurationMs <= 0 ? 1 : clamp01((now - this.phaseStartedAt) / this.phaseDurationMs);
      if (progress >= 1) this.state = "flying-in";
      this.lastFrame = this.createFrame({
        state: this.state === "flying-in" ? "flying-in" : "acquiring",
        progress: this.state === "flying-in" ? 0 : progress,
        focusBlend: 0,
        ownerOpacity: this.state === "flying-in" ? 1 : smootherStep(progress),
        inspectionLod: 0,
        panelProgress: 0,
        panelState: "staged",
        cameraWriter: "paper-journey",
        path: this.inboundPath,
        anchorX: this.inboundPath?.startAnchorNdcX,
        anchorY: this.inboundPath?.startAnchorNdcY,
      });
      return this.getFrame();
    }

    if (this.state === "flying-in" && this.segment) {
      const activePath = this.segment.path;
      const sampled = this.advanceActiveSegment(now);
      this.currentPose = sampled.cameraPose;
      if (sampled.completed) {
        this.lastSmoothnessExtensionMs = this.segment.smoothnessExtensionMs;
        this.state = "reading";
        this.segment = null;
        this.readingPanelStartedAt = now;
        this.readingOrbit = readingOrbitFromPose(this.currentPose, this.targetWorldPosition, activePath.endAnchorNdcX);
      }
      this.lastFrame = this.createFrame({
        state: this.state,
        progress: sampled.actualProgress,
        focusBlend: sampled.easedProgress,
        ownerOpacity: 1,
        inspectionLod: sampled.easedProgress,
        panelProgress: 0,
        panelState: this.state === "reading" ? "entering" : "staged",
        cameraWriter: this.state === "reading" ? "paper-reading" : "paper-journey",
        path: activePath,
        anchorX: sampled.anchorNdcX,
        anchorY: sampled.anchorNdcY,
      });
      return this.getFrame();
    }

    if (this.state === "reading") {
      this.advanceReadingAnchor(now);
      const panelProgress = this.readingPanelVisible
        ? smootherStep(clamp01((now - this.readingPanelStartedAt) / PANEL_ENTER_MS))
        : 0;
      this.lastFrame = this.createFrame({
        state: "reading",
        progress: 1,
        focusBlend: 1,
        ownerOpacity: 1,
        inspectionLod: 1,
        panelProgress,
        panelState: this.readingPanelVisible
          ? panelProgress >= 1 ? "visible" : "entering"
          : "hidden",
        cameraWriter: "paper-reading",
        path: this.inboundPath,
        anchorX: this.readingOrbit?.anchorNdcX ?? this.lastFrame.anchorNdcX,
        anchorY: 0,
      });
      return this.getFrame();
    }

    if (this.state === "flying-out" && this.segment) {
      const activePath = this.segment.path;
      const focusBlendScale = this.segment.focusBlendScale;
      const segmentStartedAt = this.segment.startedAt;
      const sampled = this.advanceActiveSegment(now);
      this.currentPose = sampled.cameraPose;
      const panelProgress = 1 - smootherStep(clamp01((now - segmentStartedAt) / PANEL_EXIT_MS));
      if (sampled.completed) {
        this.lastSmoothnessExtensionMs = this.segment.smoothnessExtensionMs;
        this.state = "releasing";
        this.segment = null;
        this.phaseStartedAt = now;
        this.phaseDurationMs = RELEASE_MS;
      }
      this.lastFrame = this.createFrame({
        state: this.state,
        progress: sampled.actualProgress,
        focusBlend: focusBlendScale * (1 - sampled.easedProgress),
        ownerOpacity: 1,
        inspectionLod: focusBlendScale * (1 - sampled.easedProgress),
        panelProgress: sampled.completed ? 0 : panelProgress,
        panelState: panelProgress > 0.001 && !sampled.completed ? "exiting" : "hidden",
        cameraWriter: "paper-journey",
        path: activePath,
        anchorX: sampled.anchorNdcX,
        anchorY: sampled.anchorNdcY,
      });
      return this.getFrame();
    }

    if (this.state === "releasing") {
      const progress = this.phaseDurationMs <= 0 ? 1 : clamp01((now - this.phaseStartedAt) / this.phaseDurationMs);
      if (progress >= 1) {
        this.reset();
        return this.getFrame();
      }
      const projected = projectWorldToNdc(this.targetWorldPosition, this.currentPose, this.projection);
      this.lastFrame = this.createFrame({
        state: "releasing",
        progress,
        focusBlend: 0,
        ownerOpacity: 1 - smootherStep(progress),
        inspectionLod: 0,
        panelProgress: 0,
        panelState: "hidden",
        cameraWriter: "paper-journey",
        path: null,
        anchorX: projected.x,
        anchorY: projected.y,
      });
      return this.getFrame();
    }

    this.lastFrame = this.createIdleFrame();
    return this.getFrame();
  }

  private createSegment(
    path: GalaxyPaperJourneyPath,
    startedAt: number,
    durationMs: number,
    focusBlendScale = 1,
  ) {
    const initial = sampleCameraPath(path, 0, this.projection!);
    return {
      startedAt,
      durationMs: Math.max(1, durationMs),
      path,
      actualProgress: 0,
      lastAdvancedAt: startedAt,
      lastProjectedTargetDiameter: this.projectedDiameterForPose(initial.cameraPose),
      lastProjection: projectWorldToNdc(path.targetWorldPosition, initial.cameraPose, this.projection!),
      lastQuaternion: initial.cameraPose.quaternion.clone(),
      lastProgressStep: 0,
      lastScreenStepPx: 0,
      lastQuaternionStepDegrees: 0,
      lastHorizontalDirection: 0,
      targetScreenReversals: 0,
      focusBlendScale: clamp01(focusBlendScale),
      smoothnessExtensionMs: 0,
    } satisfies ActiveSegment;
  }

  private projectedDiameterForPose(pose: GalaxyPaperCameraPose) {
    if (!this.targetWorldPosition || !this.projection) return 0;
    return projectedTargetDiameter(
      this.targetWorldPosition,
      pose,
      this.projection,
      this.targetWorldDiameter,
      this.viewportHeight,
    );
  }

  private advanceActiveSegment(now: number) {
    const segment = this.segment!;
    const timeTargetProgress = clamp01((now - segment.startedAt) / segment.durationMs);
    if (timeTargetProgress > segment.actualProgress && now > segment.lastAdvancedAt) {
      const previousProgress = segment.actualProgress;
      const progressUpperBound = Math.min(timeTargetProgress, previousProgress + MAX_PROGRESS_STEP);
      const maxScreenStepPx = THREE.MathUtils.clamp(this.viewportWidth * 0.015, 10, 18);

      const evaluate = (progress: number) => {
        const sample = sampleCameraPath(segment.path, progress, this.projection!);
        const diameter = this.projectedDiameterForPose(sample.cameraPose);
        const projected = projectWorldToNdc(segment.path.targetWorldPosition, sample.cameraPose, this.projection!);
        const screenStepPx = Math.hypot(
          (projected.x - segment.lastProjection.x) * this.viewportWidth * 0.5,
          (projected.y - segment.lastProjection.y) * this.viewportHeight * 0.5,
        );
        const quaternionStepDegrees = quaternionAngleDegrees(segment.lastQuaternion, sample.cameraPose.quaternion);
        const diameterRatio = segment.lastProjectedTargetDiameter > 0
          ? diameter / segment.lastProjectedTargetDiameter
          : 1;
        const safe = Number.isFinite(diameterRatio)
          && diameterRatio >= MIN_PROJECTED_SIZE_RATIO
          && diameterRatio <= MAX_PROJECTED_SIZE_RATIO
          && screenStepPx <= maxScreenStepPx + 1e-6
          && quaternionStepDegrees <= MAX_QUATERNION_STEP_DEGREES + 1e-6;
        return { sample, diameter, projected, screenStepPx, quaternionStepDegrees, safe };
      };

      let nextProgress = progressUpperBound;
      let result = evaluate(nextProgress);
      if (!result.safe) {
        let lower = previousProgress;
        let upper = progressUpperBound;
        for (let iteration = 0; iteration < 32; iteration += 1) {
          const middle = (lower + upper) * 0.5;
          if (evaluate(middle).safe) lower = middle;
          else upper = middle;
        }
        nextProgress = lower;
        result = evaluate(nextProgress);
      }

      const horizontalStepPx = (result.projected.x - segment.lastProjection.x) * this.viewportWidth * 0.5;
      const horizontalDirection: -1 | 0 | 1 = Math.abs(horizontalStepPx) <= SCREEN_REVERSAL_NOISE_PX
        ? 0
        : horizontalStepPx > 0 ? 1 : -1;
      if (
        horizontalDirection !== 0
        && segment.lastHorizontalDirection !== 0
        && horizontalDirection !== segment.lastHorizontalDirection
      ) {
        segment.targetScreenReversals += 1;
      }
      if (horizontalDirection !== 0) segment.lastHorizontalDirection = horizontalDirection;

      segment.actualProgress = nextProgress;
      segment.lastProgressStep = nextProgress - previousProgress;
      segment.lastProjectedTargetDiameter = result.diameter;
      segment.lastProjection = result.projected;
      segment.lastQuaternion = result.sample.cameraPose.quaternion.clone();
      segment.lastScreenStepPx = result.screenStepPx;
      segment.lastQuaternionStepDegrees = result.quaternionStepDegrees;
      segment.lastAdvancedAt = now;
    }
    if (now > segment.startedAt + segment.durationMs && segment.actualProgress < 1) {
      segment.smoothnessExtensionMs = now - (segment.startedAt + segment.durationMs);
    }
    if (segment.actualProgress >= 1 - 1e-8) segment.actualProgress = 1;
    const sampled = sampleCameraPath(segment.path, segment.actualProgress, this.projection!);
    return {
      ...sampled,
      actualProgress: segment.actualProgress,
      completed: segment.actualProgress >= 1,
    };
  }

  private readingPoseIsSafe(pose: GalaxyPaperCameraPose) {
    if (!this.targetWorldPosition || !this.starCenter) return true;
    const requiredClearance = this.starSafeRadius + Math.max(1e-4, this.starSafeRadius * 0.01);
    if (requiredClearance > 0 && pose.position.distanceTo(this.starCenter) < requiredClearance) return false;
    if (
      this.starPhysicalRadius > 0
      && segmentPointMinimumDistance(pose.position, this.targetWorldPosition, this.starCenter)
        < this.starPhysicalRadius + Math.max(1e-4, this.starPhysicalRadius * 0.005)
    ) return false;
    // Keep a user-modified reading pose returnable without adding a detour.
    if (
      this.systemPose
      && requiredClearance > 0
      && segmentPointMinimumDistance(pose.position, this.systemPose.position, this.starCenter) < requiredClearance
    ) return false;
    return true;
  }

  private advanceReadingAnchor(now: number) {
    if (!this.readingAnchorTransition || !this.readingOrbit || !this.projection) return;
    const progress = clamp01((now - this.readingAnchorTransition.startedAt) / ANCHOR_TRANSITION_MS);
    const candidateOrbit = {
      ...this.readingOrbit,
      center: this.readingOrbit.center.clone(),
      anchorNdcX: THREE.MathUtils.lerp(
        this.readingAnchorTransition.startAnchorNdcX,
        this.readingAnchorTransition.endAnchorNdcX,
        smootherStep(progress),
      ),
    };
    const candidatePose = poseForReadingOrbit(candidateOrbit, this.projection);
    if (!this.readingPoseIsSafe(candidatePose)) {
      this.readingAnchorTransition = null;
      return;
    }
    this.readingOrbit = candidateOrbit;
    this.currentPose = candidatePose;
    if (progress >= 1) this.readingAnchorTransition = null;
  }

  private rayLateralDeviation(path: GalaxyPaperJourneyPath | null) {
    if (!path || !this.currentPose) return 0;
    const direction = path.endCameraPose.position.clone().sub(path.startCameraPose.position);
    const length = direction.length();
    if (length < POSITION_EPSILON) return 0;
    direction.multiplyScalar(1 / length);
    const fromStart = this.currentPose.position.clone().sub(path.startCameraPose.position);
    return fromStart.addScaledVector(direction, -fromStart.dot(direction)).length();
  }

  private createIdleFrame(): GalaxyPaperJourneyFrame {
    return {
      state: "idle",
      targetId: "",
      targetWorldPosition: null,
      cameraPose: null,
      journeyProgress: 0,
      focusBlend: 0,
      visualOwnerOpacity: 0,
      inspectionLod: 0,
      panelProgress: 0,
      panelState: "hidden",
      anchorNdcX: 0,
      anchorNdcY: 0,
      pathMode: "none",
      minimumStarClearance: 0,
      smoothnessExtensionMs: 0,
      projectedTargetDiameter: 0,
      cameraTravelDistance: 0,
      cameraDistanceToTarget: 0,
      targetWorldPositionDrift: 0,
      returnPositionError: 0,
      returnAngleErrorDegrees: 0,
      cameraRayLateralDeviation: 0,
      targetScreenStepPx: 0,
      targetScreenReversals: 0,
      cameraQuaternionStepDegrees: 0,
      progressStep: 0,
      resolvedReadingDistance: 0,
      readingDistanceRelaxation: 0,
      cameraWriter: "orbit",
    };
  }

  private createFrame(options: {
    state: GalaxyPaperJourneyState;
    progress: number;
    focusBlend: number;
    ownerOpacity: number;
    inspectionLod: number;
    panelProgress: number;
    panelState: GalaxyPaperJourneyPanelState;
    cameraWriter: GalaxyPaperJourneyFrame["cameraWriter"];
    path: GalaxyPaperJourneyPath | null;
    anchorX?: number;
    anchorY?: number;
  }): GalaxyPaperJourneyFrame {
    const projectedDiameter = this.currentPose ? this.projectedDiameterForPose(this.currentPose) : 0;
    return {
      state: options.state,
      targetId: this.targetId,
      targetWorldPosition: this.targetWorldPosition?.clone() ?? null,
      cameraPose: this.currentPose ? clonePose(this.currentPose) : null,
      journeyProgress: clamp01(options.progress),
      focusBlend: clamp01(options.focusBlend),
      visualOwnerOpacity: clamp01(options.ownerOpacity),
      inspectionLod: clamp01(options.inspectionLod),
      panelProgress: clamp01(options.panelProgress),
      panelState: options.panelState,
      anchorNdcX: options.anchorX ?? this.lastFrame.anchorNdcX,
      anchorNdcY: options.anchorY ?? this.lastFrame.anchorNdcY,
      pathMode: options.path?.mode ?? "none",
      minimumStarClearance: options.path?.minimumStarClearance ?? 0,
      smoothnessExtensionMs: this.segment?.smoothnessExtensionMs ?? this.lastSmoothnessExtensionMs,
      projectedTargetDiameter: Number.isFinite(projectedDiameter) ? projectedDiameter : 0,
      cameraTravelDistance: this.currentPose && this.systemPose
        ? this.currentPose.position.distanceTo(this.systemPose.position)
        : 0,
      cameraDistanceToTarget: this.currentPose && this.targetWorldPosition
        ? this.currentPose.position.distanceTo(this.targetWorldPosition)
        : 0,
      targetWorldPositionDrift: this.targetWorldPosition && this.targetReferencePosition
        ? this.targetWorldPosition.distanceTo(this.targetReferencePosition)
        : 0,
      returnPositionError: this.currentPose && this.systemPose
        ? this.currentPose.position.distanceTo(this.systemPose.position)
        : 0,
      returnAngleErrorDegrees: this.currentPose && this.systemPose
        ? quaternionAngleDegrees(this.currentPose.quaternion, this.systemPose.quaternion)
        : 0,
      cameraRayLateralDeviation: this.rayLateralDeviation(options.path),
      targetScreenStepPx: this.segment?.lastScreenStepPx ?? 0,
      targetScreenReversals: this.segment?.targetScreenReversals ?? 0,
      cameraQuaternionStepDegrees: this.segment?.lastQuaternionStepDegrees ?? 0,
      progressStep: this.segment?.lastProgressStep ?? 0,
      resolvedReadingDistance: options.path?.resolvedReadingDistance ?? 0,
      readingDistanceRelaxation: options.path?.readingDistanceRelaxation ?? 0,
      cameraWriter: options.cameraWriter,
    };
  }

  private cloneFrame(frame: GalaxyPaperJourneyFrame): GalaxyPaperJourneyFrame {
    return {
      ...frame,
      targetWorldPosition: frame.targetWorldPosition?.clone() ?? null,
      cameraPose: frame.cameraPose ? clonePose(frame.cameraPose) : null,
    };
  }
}
