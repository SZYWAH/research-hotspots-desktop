import type { App17GalaxyPayload } from "../types";

export const AGENT_THEORY_PERIMETER_PROFILE_VERSION =
  "agent-theory-perimeter-v2-c2" as const;
export const APP15_THEORY_COORDINATE_SCALE = 0.0047;
export const AGENT_THEORY_PERIMETER_SECTOR_COUNT = 96;
export const AGENT_THEORY_CRUISE_FIXED_STEP_SECONDS = 1 / 60;
export const AGENT_THEORY_PERIMETER_MINIMUM_SAFETY_RATIO = 0.06;
export const AGENT_THEORY_CRUISE_VISIBILITY_VERSION =
  "agent-theory-visibility-v1" as const;
export const AGENT_THEORY_CRUISE_MOTION_VERSION =
  "cruise-motion-v2-jerk-limited" as const;
export type AgentTheoryCruiseMotionVersion =
  | "cruise-motion-v1"
  | typeof AGENT_THEORY_CRUISE_MOTION_VERSION;

const AGENT_THEORY_CRUISE_TARGET_MIN_SECONDS = 4;
const AGENT_THEORY_CRUISE_TARGET_MAX_SECONDS = 7;
const AGENT_THEORY_CRUISE_ANGULAR_TARGET_SECONDS = 2.4;
const AGENT_THEORY_CRUISE_VERTICAL_TARGET_SECONDS = 3.2;
const AGENT_THEORY_CRUISE_TANGENT_TARGET_SECONDS = 2.8;
const AGENT_THEORY_CRUISE_MAX_ANGULAR_ACCELERATION = 0.00085;
const AGENT_THEORY_CRUISE_MAX_ANGULAR_JERK = 0.0015;

export type AgentTheoryVec3 = [number, number, number];

export type AgentTheoryPerimeterProfileV1 = {
  version: typeof AGENT_THEORY_PERIMETER_PROFILE_VERSION;
  center: AgentTheoryVec3;
  principalAxes: [AgentTheoryVec3, AgentTheoryVec3, AgentTheoryVec3];
  rawSectorRadii: number[];
  sectorRadii: number[];
  safetyMargins: number[];
  uniformOutwardExpansion: number;
  minimumEntityClearance: number;
  minimumEntitySafetyRatio: number;
  verticalExtent: number;
  medianRadius: number;
  maximumRadius: number;
};

export type AgentTheoryPerimeterFrameSample = {
  angleRadians: number;
  sectorIndex: number;
  sectorProgress: number;
  shellRadius: number;
  safetyMargin: number;
  totalRadius: number;
  radiusDerivative: number;
  radiusSecondDerivative: number;
  radial: AgentTheoryVec3;
  tangent: AgentTheoryVec3;
  normal: AgentTheoryVec3;
  position: AgentTheoryVec3;
};

export type AgentTheoryCruiseCheckpointV1 = {
  visibilityVersion: typeof AGENT_THEORY_CRUISE_VISIBILITY_VERSION;
  motionVersion: AgentTheoryCruiseMotionVersion;
  sessionSeed: string;
  stepIndex: number;
  position: AgentTheoryVec3;
  velocity: AgentTheoryVec3;
  acceleration: AgentTheoryVec3;
  randomState: number[];
  visitedSectors: number[];
  azimuthRadians: number;
  angularVelocity: number;
  angularAcceleration: number;
  verticalOffset: number;
  verticalVelocity: number;
  tangentWeight: number;
  tangentTarget: number;
  tangentVelocity: number;
  inwardWeight: number;
  lastNoiseStep: number;
  nextNoiseStep: number;
  randomTargetStartStep: number;
  angularVelocityTargetFrom: number;
  angularVelocityTargetTo: number;
  verticalTargetFrom: number;
  verticalTargetTo: number;
  verticalAcceleration: number;
  tangentTargetFrom: number;
  tangentTargetTo: number;
};

export type AgentTheoryCruiseAdvanceControl = {
  directionSign: -1 | 1;
  speedScale: number;
};

export type AgentTheoryCameraMode =
  | "cruise"
  | "explore-free"
  | "return-preparing"
  | "returning-anchor"
  | "return-commit";

export type AgentTheoryStellarLod = "point" | "psf" | "near-psf" | "sphere";

export type AgentTheoryCruiseSample = {
  position: AgentTheoryVec3;
  lookTarget: AgentTheoryVec3;
  velocity: AgentTheoryVec3;
  acceleration: AgentTheoryVec3;
  sectorIndex: number;
  safetyMargin: number;
  shellRadius: number;
  visitedSectorRatio: number;
  tangentWeight: number;
  inwardWeight: number;
};

export type AgentTheoryCruiseRenderSample = AgentTheoryCruiseSample & {
  lookVelocity: AgentTheoryVec3;
  interpolationAlpha: number;
};

export type AgentTheoryReturnTransitionV1 = {
  startedAtMs: number;
  durationMs: number;
  fromPosition: AgentTheoryVec3;
  fromLookTarget: AgentTheoryVec3;
  toPosition: AgentTheoryVec3;
  toLookTarget: AgentTheoryVec3;
  fromVelocity: AgentTheoryVec3;
  fromAcceleration: AgentTheoryVec3;
  fromLookVelocity: AgentTheoryVec3;
  toVelocity: AgentTheoryVec3;
  toAcceleration: AgentTheoryVec3;
  toLookVelocity: AgentTheoryVec3;
  targetCheckpoint: AgentTheoryCruiseCheckpointV1;
};

export type AgentTheoryAnchorReturnTransitionV2 = {
  version: "agent-theory-anchor-return-v2";
  startedAtMs: number;
  durationMs: number;
  fromPosition: AgentTheoryVec3;
  toPosition: AgentTheoryVec3;
  distanceRatio: number;
  angleRatio: number;
};

type SpatialPoint = { x: number; y: number; z: number };

export function createAgentTheoryPerimeterProfile(
  payload: Pick<App17GalaxyPayload, "papers" | "hotspots">,
): AgentTheoryPerimeterProfileV1 {
  const points: SpatialPoint[] = [
    ...payload.papers,
    ...payload.hotspots,
  ].filter((point) => (
    Number.isFinite(point.x)
    && Number.isFinite(point.y)
    && Number.isFinite(point.z)
  ));
  const source = (
    points.length > 0 ? points : [{ x: 0, y: 0, z: 0 }]
  ).map((point) => ({
    x: point.x * APP15_THEORY_COORDINATE_SCALE,
    y: point.y * APP15_THEORY_COORDINATE_SCALE,
    z: point.z * APP15_THEORY_COORDINATE_SCALE,
  }));
  const center: AgentTheoryVec3 = [
    average(source.map((point) => point.x)),
    average(source.map((point) => point.y)),
    average(source.map((point) => point.z)),
  ];
  const covariance = createCovarianceMatrix(source, center);
  const principalAxes = resolvePrincipalAxes(covariance);
  const sectorRadii = new Array<number>(
    AGENT_THEORY_PERIMETER_SECTOR_COUNT,
  ).fill(0);
  const verticalDistances: number[] = [];
  const radialPoints: Array<{ angle: number; radius: number }> = [];

  source.forEach((point) => {
    const relative: AgentTheoryVec3 = [
      point.x - center[0],
      point.y - center[1],
      point.z - center[2],
    ];
    const x = dot(relative, principalAxes[0]);
    const y = dot(relative, principalAxes[1]);
    verticalDistances.push(Math.abs(dot(relative, principalAxes[2])));
    const radius = Math.hypot(x, y);
    const angle = Math.atan2(y, x);
    const sector = angleToSector(angle);
    sectorRadii[sector] = Math.max(sectorRadii[sector], radius);
    radialPoints.push({ angle, radius });
  });

  const nonZeroRadii = sectorRadii.filter((radius) => radius > 0);
  const fallbackRadius = percentile(nonZeroRadii, 0.75) || 1;
  for (let sector = 0; sector < sectorRadii.length; sector += 1) {
    if (sectorRadii[sector] <= 0) sectorRadii[sector] = fallbackRadius;
  }
  const conservativeRadii = sectorRadii.map((radius, sector) => {
    let envelope = radius;
    for (let offset = -2; offset <= 2; offset += 1) {
      const neighbor = wrapSector(sector + offset);
      envelope = Math.max(envelope, sectorRadii[neighbor]);
    }
    return envelope;
  });
  const medianRadius = percentile(conservativeRadii, 0.5);
  const safetyMargins = conservativeRadii.map((radius, sector) => {
    const normalized = stableHash(`${sector}:${radius.toFixed(6)}`) / 0xffff_ffff;
    return radius * lerp(0.06, 0.10, normalized);
  });
  const validationEpsilon = Math.max(1e-9, fallbackRadius * 1e-6);
  let maximumSafetyDeficit = 0;
  for (const point of radialPoints) {
    const shell = samplePeriodicC2Scalar(conservativeRadii, point.angle);
    const margin = samplePeriodicC2Scalar(safetyMargins, point.angle);
    const requiredTotal = point.radius * (
      1 + AGENT_THEORY_PERIMETER_MINIMUM_SAFETY_RATIO
    );
    maximumSafetyDeficit = Math.max(
      maximumSafetyDeficit,
      requiredTotal - shell.value - margin.value,
    );
  }
  const uniformOutwardExpansion = Math.max(0, maximumSafetyDeficit)
    + validationEpsilon;
  let minimumEntityClearance = Number.POSITIVE_INFINITY;
  let minimumEntitySafetyRatio = Number.POSITIVE_INFINITY;
  for (const point of radialPoints) {
    const shell = samplePeriodicC2Scalar(conservativeRadii, point.angle);
    const margin = samplePeriodicC2Scalar(safetyMargins, point.angle);
    const clearance = shell.value
      + margin.value
      + uniformOutwardExpansion
      - point.radius;
    minimumEntityClearance = Math.min(minimumEntityClearance, clearance);
    if (point.radius > 1e-9) {
      minimumEntitySafetyRatio = Math.min(
        minimumEntitySafetyRatio,
        clearance / point.radius,
      );
    }
  }
  if (!Number.isFinite(minimumEntityClearance)) {
    minimumEntityClearance = uniformOutwardExpansion;
  }
  if (!Number.isFinite(minimumEntitySafetyRatio)) {
    minimumEntitySafetyRatio = 1;
  }
  const totalKnotRadii = conservativeRadii.map((radius, sector) => (
    radius + safetyMargins[sector] + uniformOutwardExpansion
  ));

  return {
    version: AGENT_THEORY_PERIMETER_PROFILE_VERSION,
    center,
    principalAxes,
    rawSectorRadii: sectorRadii,
    sectorRadii: conservativeRadii,
    safetyMargins,
    uniformOutwardExpansion,
    minimumEntityClearance,
    minimumEntitySafetyRatio,
    verticalExtent: percentile(verticalDistances, 0.98) || 1,
    medianRadius,
    maximumRadius: Math.max(...totalKnotRadii),
  };
}

export function createAgentTheoryCruiseCheckpoint(
  profile: AgentTheoryPerimeterProfileV1,
  sessionSeed: string,
): AgentTheoryCruiseCheckpointV1 {
  const randomState = createRandomState(sessionSeed);
  const startSector = Math.floor(nextRandom(randomState) * profile.sectorRadii.length);
  const sectorWidth = Math.PI * 2 / profile.sectorRadii.length;
  const azimuthRadians = normalizeAngle(
    (startSector + lerp(0.18, 0.82, nextRandom(randomState))) * sectorWidth,
  );
  const direction = nextRandom(randomState) < 0.5 ? -1 : 1;
  const angularVelocity = direction * lerp(0.0052, 0.0066, nextRandom(randomState));
  const verticalOffset = (
    nextRandom(randomState) * 2 - 1
  ) * profile.verticalExtent * 0.42;
  const tangentWeight = lerp(0.68, 0.75, nextRandom(randomState));
  const inwardWeight = Math.sqrt(Math.max(0, 1 - tangentWeight * tangentWeight));
  const visitedSectors = new Array<number>(profile.sectorRadii.length).fill(0);
  markObservedSectors(visitedSectors, startSector);
  const provisional: AgentTheoryCruiseCheckpointV1 = {
    visibilityVersion: AGENT_THEORY_CRUISE_VISIBILITY_VERSION,
    motionVersion: AGENT_THEORY_CRUISE_MOTION_VERSION,
    sessionSeed,
    stepIndex: 0,
    position: [0, 0, 0],
    velocity: [0, 0, 0],
    acceleration: [0, 0, 0],
    randomState,
    visitedSectors,
    azimuthRadians,
    angularVelocity,
    angularAcceleration: 0,
    verticalOffset,
    verticalVelocity: 0,
    tangentWeight,
    tangentTarget: tangentWeight,
    tangentVelocity: 0,
    inwardWeight,
    lastNoiseStep: 0,
    nextNoiseStep: resolveNextCruiseNoiseStep(0, randomState),
    randomTargetStartStep: 0,
    angularVelocityTargetFrom: angularVelocity,
    angularVelocityTargetTo: angularVelocity,
    verticalTargetFrom: verticalOffset,
    verticalTargetTo: verticalOffset,
    verticalAcceleration: 0,
    tangentTargetFrom: tangentWeight,
    tangentTargetTo: tangentWeight,
  };
  const sample = sampleAgentTheoryCruise(profile, provisional);
  provisional.position = sample.position;
  return provisional;
}

export function cloneAgentTheoryCruiseCheckpoint(
  checkpoint: AgentTheoryCruiseCheckpointV1,
): AgentTheoryCruiseCheckpointV1 {
  return {
    ...checkpoint,
    position: [...checkpoint.position],
    velocity: [...checkpoint.velocity],
    acceleration: [...checkpoint.acceleration],
    randomState: checkpoint.randomState.slice(),
    visitedSectors: checkpoint.visitedSectors.slice(),
  };
}

export function advanceAgentTheoryCruise(
  profile: AgentTheoryPerimeterProfileV1,
  checkpoint: AgentTheoryCruiseCheckpointV1,
  stepCount = 1,
  control?: AgentTheoryCruiseAdvanceControl,
): AgentTheoryCruiseCheckpointV1 {
  const next = cloneAgentTheoryCruiseCheckpoint(checkpoint);
  const dt = AGENT_THEORY_CRUISE_FIXED_STEP_SECONDS;
  const maximumSteps = Math.max(0, Math.floor(stepCount));
  for (let step = 0; step < maximumSteps; step += 1) {
    const previousPosition = next.position;
    const previousVelocity = next.velocity;
    const controlledDirection = control?.directionSign
      ?? (Math.sign(next.angularVelocity) || 1);
    const controlledSpeedScale = clamp(control?.speedScale ?? 1, 0.35, 1);
    if (next.stepIndex >= next.nextNoiseStep) {
      const angularTarget = resolveCruiseEnvelopeTarget(
        next.angularVelocityTargetFrom,
        next.angularVelocityTargetTo,
        next.stepIndex,
        next.randomTargetStartStep,
        AGENT_THEORY_CRUISE_ANGULAR_TARGET_SECONDS,
      );
      const verticalTarget = resolveCruiseEnvelopeTarget(
        next.verticalTargetFrom,
        next.verticalTargetTo,
        next.stepIndex,
        next.randomTargetStartStep,
        AGENT_THEORY_CRUISE_VERTICAL_TARGET_SECONDS,
      );
      const tangentTarget = resolveCruiseEnvelopeTarget(
        next.tangentTargetFrom,
        next.tangentTargetTo,
        next.stepIndex,
        next.randomTargetStartStep,
        AGENT_THEORY_CRUISE_TANGENT_TARGET_SECONDS,
      );
      next.lastNoiseStep = next.stepIndex;
      const coverage = visitedSectorRatio(next.visitedSectors);
      const speedFloor = coverage < 0.9 ? 0.0051 : 0.0046;
      const speedCeiling = coverage < 0.9 ? 0.0069 : 0.0072;
      next.randomTargetStartStep = next.stepIndex;
      next.angularVelocityTargetFrom = angularTarget;
      next.angularVelocityTargetTo = controlledDirection * lerp(
        speedFloor,
        speedCeiling,
        nextRandom(next.randomState),
      );
      next.verticalTargetFrom = verticalTarget;
      next.verticalTargetTo = (
        nextRandom(next.randomState) * 2 - 1
      ) * profile.verticalExtent * 0.58;
      next.tangentTargetFrom = tangentTarget;
      next.tangentTargetTo = lerp(
        0.65,
        0.75,
        nextRandom(next.randomState),
      );
      next.nextNoiseStep = resolveNextCruiseNoiseStep(
        next.stepIndex,
        next.randomState,
      );
    }

    const angularEnvelopeTarget = resolveCruiseEnvelopeTarget(
      next.angularVelocityTargetFrom,
      next.angularVelocityTargetTo,
      next.stepIndex,
      next.randomTargetStartStep,
      AGENT_THEORY_CRUISE_ANGULAR_TARGET_SECONDS,
    );
    const controlledAngularTarget = controlledDirection
      * Math.abs(angularEnvelopeTarget)
      * controlledSpeedScale;
    const desiredAngularAcceleration = clamp(
      (
        controlledAngularTarget - next.angularVelocity
      ) / AGENT_THEORY_CRUISE_ANGULAR_TARGET_SECONDS,
      -AGENT_THEORY_CRUISE_MAX_ANGULAR_ACCELERATION,
      AGENT_THEORY_CRUISE_MAX_ANGULAR_ACCELERATION,
    );
    next.angularAcceleration += clamp(
      desiredAngularAcceleration - next.angularAcceleration,
      -AGENT_THEORY_CRUISE_MAX_ANGULAR_JERK * dt,
      AGENT_THEORY_CRUISE_MAX_ANGULAR_JERK * dt,
    );

    next.tangentTarget = resolveCruiseEnvelopeTarget(
      next.tangentTargetFrom,
      next.tangentTargetTo,
      next.stepIndex,
      next.randomTargetStartStep,
      AGENT_THEORY_CRUISE_TANGENT_TARGET_SECONDS,
    );

    const tangentAcceleration = (
      (next.tangentTarget - next.tangentWeight) * 0.34
      - next.tangentVelocity * 1.18
    );
    next.tangentVelocity = clamp(
      next.tangentVelocity + tangentAcceleration * dt,
      -0.018,
      0.018,
    );
    next.tangentWeight = clamp(
      next.tangentWeight + next.tangentVelocity * dt,
      0.64,
      0.76,
    );
    next.inwardWeight = Math.sqrt(
      Math.max(0.001, 1 - next.tangentWeight * next.tangentWeight),
    );
    const nextAngularVelocity =
      next.angularVelocity + next.angularAcceleration * dt;
    next.angularVelocity = clamp(
      nextAngularVelocity,
      -0.0074,
      0.0074,
    );
    next.azimuthRadians = normalizeAngle(
      next.azimuthRadians + next.angularVelocity * dt,
    );
    const verticalTarget = resolveCruiseEnvelopeTarget(
      next.verticalTargetFrom,
      next.verticalTargetTo,
      next.stepIndex,
      next.randomTargetStartStep,
      AGENT_THEORY_CRUISE_VERTICAL_TARGET_SECONDS,
    );
    const verticalOmega = 2 / AGENT_THEORY_CRUISE_VERTICAL_TARGET_SECONDS;
    const desiredVerticalAcceleration = clamp(
      (
        (verticalTarget - next.verticalOffset)
          * verticalOmega * verticalOmega
        - 2 * verticalOmega * next.verticalVelocity
      ),
      -profile.verticalExtent * 0.004,
      profile.verticalExtent * 0.004,
    );
    const maximumVerticalJerkStep =
      profile.verticalExtent * 0.012 * dt;
    next.verticalAcceleration += clamp(
      desiredVerticalAcceleration - next.verticalAcceleration,
      -maximumVerticalJerkStep,
      maximumVerticalJerkStep,
    );
    next.verticalVelocity = clamp(
      next.verticalVelocity + next.verticalAcceleration * dt,
      -profile.verticalExtent * 0.015,
      profile.verticalExtent * 0.015,
    );
    next.verticalOffset = clamp(
      next.verticalOffset + next.verticalVelocity * dt,
      -profile.verticalExtent * 0.72,
      profile.verticalExtent * 0.72,
    );
    next.stepIndex += 1;
    markObservedSectors(
      next.visitedSectors,
      angleToSector(next.azimuthRadians),
    );

    const nextSample = sampleAgentTheoryCruise(profile, next);
    next.position = nextSample.position;
    next.velocity = scale(
      subtract(next.position, previousPosition),
      1 / dt,
    );
    next.acceleration = scale(
      subtract(next.velocity, previousVelocity),
      1 / dt,
    );
  }
  return next;
}

export function sampleAgentTheoryCruise(
  profile: AgentTheoryPerimeterProfileV1,
  checkpoint: AgentTheoryCruiseCheckpointV1,
): AgentTheoryCruiseSample {
  const frame = sampleAgentTheoryPerimeterFrame(
    profile,
    checkpoint.azimuthRadians,
  );
  const sectorIndex = frame.sectorIndex;
  const shellRadius = frame.shellRadius;
  const safetyMargin = frame.safetyMargin;
  const tangentSign = Math.sign(checkpoint.angularVelocity) || 1;
  const angle = frame.angleRadians;
  const radial = frame.radial;
  const tangent = scale(
    normalize(add(
      scale(profile.principalAxes[0], -Math.sin(angle)),
      scale(profile.principalAxes[1], Math.cos(angle)),
    )),
    tangentSign,
  );
  const position = add(
    frame.position,
    scale(profile.principalAxes[2], checkpoint.verticalOffset),
  );
  const lookDirection = normalize(add(
    scale(tangent, checkpoint.tangentWeight),
    scale(radial, -checkpoint.inwardWeight),
  ));
  const lookTarget = add(
    position,
    scale(
      lookDirection,
      Math.max(
        APP15_THEORY_COORDINATE_SCALE * 18,
        profile.medianRadius * 0.88,
      ),
    ),
  );
  return {
    position,
    lookTarget,
    velocity: [...checkpoint.velocity],
    acceleration: [...checkpoint.acceleration],
    sectorIndex,
    safetyMargin,
    shellRadius,
    visitedSectorRatio: visitedSectorRatio(checkpoint.visitedSectors),
    tangentWeight: checkpoint.tangentWeight,
    inwardWeight: checkpoint.inwardWeight,
  };
}

export function sampleAgentTheoryPerimeterFrame(
  profile: AgentTheoryPerimeterProfileV1,
  angleRadians: number,
): AgentTheoryPerimeterFrameSample {
  const angle = normalizeAngle(angleRadians);
  const shell = samplePeriodicC2Scalar(profile.sectorRadii, angle);
  const margin = samplePeriodicC2Scalar(profile.safetyMargins, angle);
  const totalRadius = shell.value
    + margin.value
    + profile.uniformOutwardExpansion;
  const radiusDerivative = shell.firstDerivative + margin.firstDerivative;
  const radiusSecondDerivative =
    shell.secondDerivative + margin.secondDerivative;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const radial = normalize(add(
    scale(profile.principalAxes[0], cosine),
    scale(profile.principalAxes[1], sine),
  ));
  const azimuthTangent = normalize(add(
    scale(profile.principalAxes[0], -sine),
    scale(profile.principalAxes[1], cosine),
  ));
  const curveDerivative = add(
    scale(radial, radiusDerivative),
    scale(azimuthTangent, totalRadius),
  );
  const tangent = normalize(curveDerivative);
  const normal = normalize(add(
    scale(radial, totalRadius),
    scale(azimuthTangent, -radiusDerivative),
  ));
  return {
    angleRadians: angle,
    sectorIndex: shell.sectorIndex,
    sectorProgress: shell.sectorProgress,
    shellRadius: shell.value,
    safetyMargin: margin.value + profile.uniformOutwardExpansion,
    totalRadius,
    radiusDerivative,
    radiusSecondDerivative,
    radial,
    tangent,
    normal,
    position: add(profile.center, scale(radial, totalRadius)),
  };
}

export function resolveAgentTheoryCruiseLookVelocity(
  fromSample: Pick<AgentTheoryCruiseSample, "lookTarget">,
  toSample: Pick<AgentTheoryCruiseSample, "lookTarget">,
  durationSeconds = AGENT_THEORY_CRUISE_FIXED_STEP_SECONDS,
): AgentTheoryVec3 {
  return scale(
    subtract(toSample.lookTarget, fromSample.lookTarget),
    1 / Math.max(1e-6, durationSeconds),
  );
}

export function interpolateAgentTheoryCruiseSamples(
  previous: AgentTheoryCruiseSample,
  current: AgentTheoryCruiseSample,
  interpolationAlpha: number,
  durationSeconds = AGENT_THEORY_CRUISE_FIXED_STEP_SECONDS,
): AgentTheoryCruiseRenderSample {
  const alpha = clamp(interpolationAlpha, 0, 1);
  const hermitePosition = cubicHermiteVec3(
    previous.position,
    current.position,
    previous.velocity,
    current.velocity,
    alpha,
    durationSeconds,
  );
  return {
    position: clampVec3ToSegmentBounds(
      hermitePosition,
      previous.position,
      current.position,
    ),
    lookTarget: lerpVec3(previous.lookTarget, current.lookTarget, alpha),
    velocity: lerpVec3(previous.velocity, current.velocity, alpha),
    acceleration: lerpVec3(
      previous.acceleration,
      current.acceleration,
      alpha,
    ),
    sectorIndex: alpha < 0.5 ? previous.sectorIndex : current.sectorIndex,
    safetyMargin: lerp(previous.safetyMargin, current.safetyMargin, alpha),
    shellRadius: lerp(previous.shellRadius, current.shellRadius, alpha),
    visitedSectorRatio: lerp(
      previous.visitedSectorRatio,
      current.visitedSectorRatio,
      alpha,
    ),
    tangentWeight: lerp(previous.tangentWeight, current.tangentWeight, alpha),
    inwardWeight: lerp(previous.inwardWeight, current.inwardWeight, alpha),
    lookVelocity: resolveAgentTheoryCruiseLookVelocity(
      previous,
      current,
      durationSeconds,
    ),
    interpolationAlpha: alpha,
  };
}

export function sampleInterpolatedAgentTheoryCruise(
  profile: AgentTheoryPerimeterProfileV1,
  previousCheckpoint: AgentTheoryCruiseCheckpointV1,
  currentCheckpoint: AgentTheoryCruiseCheckpointV1,
  interpolationAlpha: number,
): AgentTheoryCruiseRenderSample {
  const stepDelta = Math.max(
    1,
    currentCheckpoint.stepIndex - previousCheckpoint.stepIndex,
  );
  return interpolateAgentTheoryCruiseSamples(
    sampleAgentTheoryCruise(profile, previousCheckpoint),
    sampleAgentTheoryCruise(profile, currentCheckpoint),
    interpolationAlpha,
    stepDelta * AGENT_THEORY_CRUISE_FIXED_STEP_SECONDS,
  );
}

export function createAgentTheoryAnchorReturnTransition({
  nowMs,
  fromPosition,
  toPosition,
  angleRadians,
  medianRadius,
}: {
  nowMs: number;
  fromPosition: AgentTheoryVec3;
  toPosition: AgentTheoryVec3;
  angleRadians: number;
  medianRadius: number;
}): AgentTheoryAnchorReturnTransitionV2 {
  const distance = length(subtract(toPosition, fromPosition));
  const distanceRatio = clamp(
    distance / Math.max(1e-6, medianRadius),
    0,
    1,
  );
  const angleRatio = clamp(
    Math.abs(angleRadians) / (Math.PI / 2),
    0,
    1,
  );
  const durationMs = clamp(
    450
      + 950 * Math.sqrt(distanceRatio)
      + 400 * Math.sqrt(angleRatio),
    450,
    1_800,
  );
  return {
    version: "agent-theory-anchor-return-v2",
    startedAtMs: nowMs,
    durationMs,
    fromPosition: [...fromPosition],
    toPosition: [...toPosition],
    distanceRatio,
    angleRatio,
  };
}

export function sampleAgentTheoryAnchorReturnTransition(
  transition: AgentTheoryAnchorReturnTransitionV2,
  nowMs: number,
): {
  position: AgentTheoryVec3;
  progress: number;
  linearProgress: number;
  complete: boolean;
} {
  const linearProgress = clamp(
    (nowMs - transition.startedAtMs) / Math.max(1, transition.durationMs),
    0,
    1,
  );
  const progress = smootherstep(linearProgress);
  return {
    position: lerpVec3(
      transition.fromPosition,
      transition.toPosition,
      progress,
    ),
    progress,
    linearProgress,
    complete: linearProgress >= 1,
  };
}

export function createAgentTheoryReturnTransition({
  profile,
  checkpoint,
  targetCheckpoint,
  nowMs,
  fromPosition,
  fromLookTarget,
  fromVelocity = [0, 0, 0],
  fromAcceleration = [0, 0, 0],
  fromLookVelocity = [0, 0, 0],
}: {
  profile: AgentTheoryPerimeterProfileV1;
  checkpoint: AgentTheoryCruiseCheckpointV1;
  targetCheckpoint?: AgentTheoryCruiseCheckpointV1;
  nowMs: number;
  fromPosition: AgentTheoryVec3;
  fromLookTarget: AgentTheoryVec3;
  fromVelocity?: AgentTheoryVec3;
  fromAcceleration?: AgentTheoryVec3;
  fromLookVelocity?: AgentTheoryVec3;
}): AgentTheoryReturnTransitionV1 {
  const nextCheckpoint = cloneAgentTheoryCruiseCheckpoint(
    targetCheckpoint ?? checkpoint,
  );
  if (!targetCheckpoint) {
    const relative = subtract(fromPosition, profile.center);
    const planeX = dot(relative, profile.principalAxes[0]);
    const planeY = dot(relative, profile.principalAxes[1]);
    const azimuthRadians = normalizeAngle(Math.atan2(planeY, planeX));
    nextCheckpoint.azimuthRadians = azimuthRadians;
    nextCheckpoint.verticalOffset = clamp(
      dot(relative, profile.principalAxes[2]),
      -profile.verticalExtent * 0.72,
      profile.verticalExtent * 0.72,
    );
    nextCheckpoint.velocity = [0, 0, 0];
    nextCheckpoint.acceleration = [0, 0, 0];
    nextCheckpoint.angularAcceleration = 0;
    markObservedSectors(
      nextCheckpoint.visitedSectors,
      angleToSector(azimuthRadians),
    );
  }
  const destination = sampleAgentTheoryCruise(profile, nextCheckpoint);
  nextCheckpoint.position = destination.position;
  const destinationPreview = advanceAgentTheoryCruise(
    profile,
    nextCheckpoint,
    1,
  );
  const destinationPreviewSample = sampleAgentTheoryCruise(
    profile,
    destinationPreview,
  );
  nextCheckpoint.velocity = [...destinationPreview.velocity];
  const stabilizedPreview = advanceAgentTheoryCruise(
    profile,
    nextCheckpoint,
    1,
  );
  nextCheckpoint.acceleration = [...stabilizedPreview.acceleration];
  const distance = length(subtract(destination.position, fromPosition));
  const approachDirection = normalize(
    subtract(destination.position, fromPosition),
  );
  const sanitizedFromVelocity = removeOpposingComponent(
    fromVelocity,
    approachDirection,
  );
  const sanitizedFromAcceleration = removeOpposingComponent(
    fromAcceleration,
    approachDirection,
  );
  const normalizedDistance = distance / Math.max(0.01, profile.medianRadius);
  const durationMs = clamp(
    1_600 + normalizedDistance * 420,
    1_600,
    2_600,
  );
  return {
    startedAtMs: nowMs,
    durationMs,
    fromPosition: [...fromPosition],
    fromLookTarget: [...fromLookTarget],
    toPosition: [...destination.position],
    toLookTarget: [...destination.lookTarget],
    fromVelocity: sanitizedFromVelocity,
    fromAcceleration: sanitizedFromAcceleration,
    fromLookVelocity: [...fromLookVelocity],
    toVelocity: [...destinationPreview.velocity],
    toAcceleration: [...stabilizedPreview.acceleration],
    toLookVelocity: resolveAgentTheoryCruiseLookVelocity(
      destination,
      destinationPreviewSample,
    ),
    targetCheckpoint: nextCheckpoint,
  };
}

export function sampleAgentTheoryReturnTransition(
  transition: AgentTheoryReturnTransitionV1,
  nowMs: number,
): {
  position: AgentTheoryVec3;
  lookTarget: AgentTheoryVec3;
  velocity: AgentTheoryVec3;
  progress: number;
  complete: boolean;
} {
  const linearProgress = clamp(
    (nowMs - transition.startedAtMs) / Math.max(1, transition.durationMs),
    0,
    1,
  );
  const durationSeconds = Math.max(0.001, transition.durationMs / 1_000);
  const positionSample = sampleQuinticHermite(
    transition.fromPosition,
    transition.toPosition,
    transition.fromVelocity,
    transition.toVelocity,
    transition.fromAcceleration,
    transition.toAcceleration,
    linearProgress,
    durationSeconds,
  );
  const lookSample = sampleQuinticHermite(
    transition.fromLookTarget,
    transition.toLookTarget,
    transition.fromLookVelocity,
    transition.toLookVelocity,
    [0, 0, 0],
    [0, 0, 0],
    linearProgress,
    durationSeconds,
  );
  return {
    position: positionSample.position,
    lookTarget: lookSample.position,
    velocity: positionSample.velocity,
    progress: smootherstep(linearProgress),
    complete: linearProgress >= 1,
  };
}

function removeOpposingComponent(
  value: AgentTheoryVec3,
  approachDirection: AgentTheoryVec3,
): AgentTheoryVec3 {
  const alongApproach = dot(value, approachDirection);
  if (alongApproach >= 0) return [...value];
  return subtract(value, scale(approachDirection, alongApproach));
}

function sampleQuinticHermite(
  from: AgentTheoryVec3,
  to: AgentTheoryVec3,
  fromVelocity: AgentTheoryVec3,
  toVelocity: AgentTheoryVec3,
  fromAcceleration: AgentTheoryVec3,
  toAcceleration: AgentTheoryVec3,
  progress: number,
  durationSeconds: number,
) {
  const position: AgentTheoryVec3 = [0, 0, 0];
  const velocity: AgentTheoryVec3 = [0, 0, 0];
  const u = clamp(progress, 0, 1);
  const u2 = u * u;
  const u3 = u2 * u;
  const u4 = u3 * u;
  const u5 = u4 * u;
  for (let axis = 0; axis < 3; axis += 1) {
    const delta = to[axis] - from[axis];
    const v0 = fromVelocity[axis] * durationSeconds;
    const v1 = toVelocity[axis] * durationSeconds;
    const a0 = fromAcceleration[axis] * durationSeconds * durationSeconds;
    const a1 = toAcceleration[axis] * durationSeconds * durationSeconds;
    const c0 = from[axis];
    const c1 = v0;
    const c2 = a0 * 0.5;
    const c3 = 10 * delta - 6 * v0 - 4 * v1 - 1.5 * a0 + 0.5 * a1;
    const c4 = -15 * delta + 8 * v0 + 7 * v1 + 1.5 * a0 - a1;
    const c5 = 6 * delta - 3 * v0 - 3 * v1 - 0.5 * a0 + 0.5 * a1;
    position[axis] = c0 + c1 * u + c2 * u2 + c3 * u3 + c4 * u4 + c5 * u5;
    const derivative = (
      c1
      + 2 * c2 * u
      + 3 * c3 * u2
      + 4 * c4 * u3
      + 5 * c5 * u4
    );
    velocity[axis] = derivative / durationSeconds;
  }
  return { position, velocity };
}

export function resolveAgentTheoryStellarLod(
  cssDiameter: number,
  sphereEligible: boolean,
  previous?: AgentTheoryStellarLod,
): AgentTheoryStellarLod {
  const diameter = Math.max(0, cssDiameter);
  if (sphereEligible) {
    if (previous === "sphere" && diameter > 9) return "sphere";
    if (diameter >= 12) return "sphere";
  }
  if (diameter < 1.8) return "point";
  if (diameter < 7) return "psf";
  return "near-psf";
}

export function resolveAgentTheoryAngularDiameterCssPx({
  worldDiameter,
  viewDepth,
  viewportHeight,
  fovDegrees,
}: {
  worldDiameter: number;
  viewDepth: number;
  viewportHeight: number;
  fovDegrees: number;
}) {
  const focalPixels = Math.max(1, viewportHeight) / (
    2 * Math.tan(Math.max(0.01, fovDegrees) * Math.PI / 360)
  );
  return Math.max(0, worldDiameter) * focalPixels / Math.max(0.01, viewDepth);
}

export function estimateVisibleGalaxyFraction({
  points,
  sample,
  fovDegrees = 42,
  aspect = 16 / 9,
}: {
  points: SpatialPoint[];
  sample: AgentTheoryCruiseSample;
  fovDegrees?: number;
  aspect?: number;
}) {
  if (points.length === 0) return 0;
  const forward = normalize(subtract(sample.lookTarget, sample.position));
  const worldUp: AgentTheoryVec3 = Math.abs(forward[2]) > 0.92
    ? [0, 1, 0]
    : [0, 0, 1];
  const right = normalize(cross(forward, worldUp));
  const up = normalize(cross(right, forward));
  const tangentY = Math.tan(fovDegrees * Math.PI / 360);
  const tangentX = tangentY * Math.max(0.1, aspect);
  let visible = 0;
  points.forEach((point) => {
    const offset: AgentTheoryVec3 = [
      point.x - sample.position[0],
      point.y - sample.position[1],
      point.z - sample.position[2],
    ];
    const depth = dot(offset, forward);
    if (depth <= 0.1) return;
    if (
      Math.abs(dot(offset, right) / depth) <= tangentX
      && Math.abs(dot(offset, up) / depth) <= tangentY
    ) {
      visible += 1;
    }
  });
  return visible / points.length;
}

export function serializeAgentTheoryCruiseCheckpoint(
  checkpoint: AgentTheoryCruiseCheckpointV1,
) {
  return JSON.stringify(checkpoint);
}

export function parseAgentTheoryCruiseCheckpoint(
  value: string | null,
  expectedSeed: string,
  expectedSectorCount = AGENT_THEORY_PERIMETER_SECTOR_COUNT,
): AgentTheoryCruiseCheckpointV1 | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as AgentTheoryCruiseCheckpointV1;
    if (
      parsed.sessionSeed !== expectedSeed
      || !Number.isFinite(parsed.stepIndex)
      || parsed.position?.length !== 3
      || parsed.velocity?.length !== 3
      || parsed.acceleration?.length !== 3
      || parsed.randomState?.length !== 4
      || parsed.visitedSectors?.length !== expectedSectorCount
      || !Number.isFinite(parsed.azimuthRadians)
      || !Number.isFinite(parsed.angularVelocity)
      || !Number.isFinite(parsed.tangentTarget)
      || !Number.isFinite(parsed.tangentVelocity)
    ) return null;
    const randomState = parsed.randomState.slice();
    const migrated = {
      ...parsed,
      // R4 checkpoints did not prove that the stored camera framing contained
      // semantic entities. Preserve their deterministic path time and seed,
      // but force R5 to revalidate/recompose the view before it becomes ready.
      visibilityVersion: AGENT_THEORY_CRUISE_VISIBILITY_VERSION,
      motionVersion: AGENT_THEORY_CRUISE_MOTION_VERSION,
      angularVelocityTargetFrom:
        finiteOr(parsed.angularVelocityTargetFrom, parsed.angularVelocity),
      angularVelocityTargetTo:
        finiteOr(parsed.angularVelocityTargetTo, parsed.angularVelocity),
      verticalTargetFrom:
        finiteOr(parsed.verticalTargetFrom, parsed.verticalOffset),
      verticalTargetTo:
        finiteOr(parsed.verticalTargetTo, parsed.verticalOffset),
      verticalAcceleration:
        finiteOr(parsed.verticalAcceleration, 0),
      tangentTargetFrom:
        finiteOr(parsed.tangentTargetFrom, parsed.tangentTarget),
      tangentTargetTo:
        finiteOr(parsed.tangentTargetTo, parsed.tangentTarget),
      randomTargetStartStep:
        finiteOr(parsed.randomTargetStartStep, parsed.stepIndex),
      nextNoiseStep: Number.isFinite(parsed.nextNoiseStep)
        ? parsed.nextNoiseStep
        : resolveNextCruiseNoiseStep(parsed.stepIndex, randomState),
      randomState,
    } satisfies AgentTheoryCruiseCheckpointV1;
    return cloneAgentTheoryCruiseCheckpoint(migrated);
  } catch {
    return null;
  }
}

function finiteOr(value: number | undefined, fallback: number) {
  return Number.isFinite(value) ? value as number : fallback;
}

function resolveNextCruiseNoiseStep(
  currentStep: number,
  randomState: number[],
) {
  const intervalSeconds = lerp(
    AGENT_THEORY_CRUISE_TARGET_MIN_SECONDS,
    AGENT_THEORY_CRUISE_TARGET_MAX_SECONDS,
    nextRandom(randomState),
  );
  return currentStep + Math.max(
    1,
    Math.round(intervalSeconds / AGENT_THEORY_CRUISE_FIXED_STEP_SECONDS),
  );
}

function resolveCruiseEnvelopeTarget(
  from: number,
  to: number,
  currentStep: number,
  startedAtStep: number,
  durationSeconds: number,
) {
  const durationSteps = Math.max(
    1,
    Math.round(durationSeconds / AGENT_THEORY_CRUISE_FIXED_STEP_SECONDS),
  );
  const progress = clamp(
    (currentStep - startedAtStep) / durationSteps,
    0,
    1,
  );
  return lerp(from, to, smootherstep(progress));
}

function cubicHermiteVec3(
  from: AgentTheoryVec3,
  to: AgentTheoryVec3,
  fromVelocity: AgentTheoryVec3,
  toVelocity: AgentTheoryVec3,
  progress: number,
  durationSeconds: number,
): AgentTheoryVec3 {
  const t = clamp(progress, 0, 1);
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  return [0, 1, 2].map((axis) => (
    h00 * from[axis]
    + h10 * fromVelocity[axis] * durationSeconds
    + h01 * to[axis]
    + h11 * toVelocity[axis] * durationSeconds
  )) as AgentTheoryVec3;
}

function clampVec3ToSegmentBounds(
  value: AgentTheoryVec3,
  from: AgentTheoryVec3,
  to: AgentTheoryVec3,
): AgentTheoryVec3 {
  return [0, 1, 2].map((axis) => clamp(
    value[axis],
    Math.min(from[axis], to[axis]),
    Math.max(from[axis], to[axis]),
  )) as AgentTheoryVec3;
}

function createCovarianceMatrix(
  points: SpatialPoint[],
  center: AgentTheoryVec3,
) {
  const matrix = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  points.forEach((point) => {
    const offset = [
      point.x - center[0],
      point.y - center[1],
      point.z - center[2],
    ];
    for (let row = 0; row < 3; row += 1) {
      for (let column = row; column < 3; column += 1) {
        matrix[row][column] += offset[row] * offset[column];
      }
    }
  });
  const divisor = Math.max(1, points.length);
  for (let row = 0; row < 3; row += 1) {
    for (let column = row; column < 3; column += 1) {
      matrix[row][column] /= divisor;
      matrix[column][row] = matrix[row][column];
    }
  }
  return matrix;
}

function resolvePrincipalAxes(
  source: number[][],
): [AgentTheoryVec3, AgentTheoryVec3, AgentTheoryVec3] {
  const matrix = source.map((row) => row.slice());
  const vectors = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  for (let sweep = 0; sweep < 18; sweep += 1) {
    const pairs = [[0, 1], [0, 2], [1, 2]];
    pairs.forEach(([left, right]) => {
      const value = matrix[left][right];
      if (Math.abs(value) < 1e-12) return;
      const angle = 0.5 * Math.atan2(
        2 * value,
        matrix[right][right] - matrix[left][left],
      );
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      for (let index = 0; index < 3; index += 1) {
        const leftValue = matrix[index][left];
        const rightValue = matrix[index][right];
        matrix[index][left] = cosine * leftValue - sine * rightValue;
        matrix[index][right] = sine * leftValue + cosine * rightValue;
      }
      for (let index = 0; index < 3; index += 1) {
        const leftValue = matrix[left][index];
        const rightValue = matrix[right][index];
        matrix[left][index] = cosine * leftValue - sine * rightValue;
        matrix[right][index] = sine * leftValue + cosine * rightValue;
        const vectorLeft = vectors[index][left];
        const vectorRight = vectors[index][right];
        vectors[index][left] = cosine * vectorLeft - sine * vectorRight;
        vectors[index][right] = sine * vectorLeft + cosine * vectorRight;
      }
    });
  }
  const eigenvectors = [0, 1, 2]
    .map((index) => ({
      value: matrix[index][index],
      vector: normalize([
        vectors[0][index],
        vectors[1][index],
        vectors[2][index],
      ] as AgentTheoryVec3),
    }))
    .sort((left, right) => right.value - left.value)
    .map(({ vector }) => canonicalizeAxis(vector));
  const normal = canonicalizeAxis(normalize(cross(
    eigenvectors[0],
    eigenvectors[1],
  )));
  const second = normalize(cross(normal, eigenvectors[0]));
  return [eigenvectors[0], second, normal];
}

function samplePeriodicC2Scalar(values: number[], angle: number) {
  const count = Math.max(1, values.length);
  const normalized = normalizeAngle(angle);
  const scaledSector = normalized / (Math.PI * 2) * count;
  const sectorIndex = Math.min(
    count - 1,
    Math.max(0, Math.floor(scaledSector)),
  );
  const sectorProgress = scaledSector - sectorIndex;
  const sectorWidth = Math.PI * 2 / count;
  const u = sectorProgress;
  const u2 = u * u;
  const u3 = u2 * u;
  const oneMinusU = 1 - u;
  const knots = [
    values[wrapIndex(sectorIndex - 1, count)] ?? 0,
    values[sectorIndex] ?? 0,
    values[wrapIndex(sectorIndex + 1, count)] ?? 0,
    values[wrapIndex(sectorIndex + 2, count)] ?? 0,
  ];
  const basis = [
    oneMinusU * oneMinusU * oneMinusU / 6,
    (3 * u3 - 6 * u2 + 4) / 6,
    (-3 * u3 + 3 * u2 + 3 * u + 1) / 6,
    u3 / 6,
  ];
  const firstBasis = [
    -0.5 * oneMinusU * oneMinusU,
    1.5 * u2 - 2 * u,
    -1.5 * u2 + u + 0.5,
    0.5 * u2,
  ];
  const secondBasis = [
    oneMinusU,
    3 * u - 2,
    -3 * u + 1,
    u,
  ];
  const weighted = (weights: number[]) => (
    knots.reduce(
      (sum, knot, index) => sum + knot * weights[index],
      0,
    )
  );
  return {
    sectorIndex,
    sectorProgress,
    value: weighted(basis),
    firstDerivative: weighted(firstBasis) / sectorWidth,
    secondDerivative: weighted(secondBasis) / (sectorWidth * sectorWidth),
  };
}

function wrapIndex(index: number, count: number) {
  return ((index % count) + count) % count;
}

function angleToSector(angle: number) {
  const normalized = normalizeAngle(angle);
  return Math.min(
    AGENT_THEORY_PERIMETER_SECTOR_COUNT - 1,
    Math.floor(
      normalized / (Math.PI * 2) * AGENT_THEORY_PERIMETER_SECTOR_COUNT,
    ),
  );
}

function wrapSector(index: number) {
  return (
    (index % AGENT_THEORY_PERIMETER_SECTOR_COUNT)
    + AGENT_THEORY_PERIMETER_SECTOR_COUNT
  ) % AGENT_THEORY_PERIMETER_SECTOR_COUNT;
}

function markObservedSectors(visitedSectors: number[], centerSector: number) {
  // A tangent-oblique 42 degree frame sees a wide peripheral arc. Coverage
  // records sectors actually observed by the viewport, rather than only the
  // infinitesimal sector containing the camera.
  for (let offset = -21; offset <= 21; offset += 1) {
    visitedSectors[wrapSector(centerSector + offset)] = 1;
  }
}

function createRandomState(seed: string) {
  const state: number[] = [
    stableHash(`${seed}:0`),
    stableHash(`${seed}:1`),
    stableHash(`${seed}:2`),
    stableHash(`${seed}:3`),
  ];
  if (state.every((value) => value === 0)) {
    return [0x9e37_79b9, 0, 0, 0];
  }
  return state;
}

function nextRandom(state: number[]) {
  const result = Math.imul(
    rotateLeft(Math.imul(state[1], 5) >>> 0, 7),
    9,
  ) >>> 0;
  const temporary = (state[1] << 9) >>> 0;
  state[2] ^= state[0];
  state[3] ^= state[1];
  state[1] ^= state[2];
  state[0] ^= state[3];
  state[2] ^= temporary;
  state[3] = rotateLeft(state[3], 11);
  state[0] >>>= 0;
  state[1] >>>= 0;
  state[2] >>>= 0;
  state[3] >>>= 0;
  return result / 0x1_0000_0000;
}

function rotateLeft(value: number, shift: number) {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

function stableHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function canonicalizeAxis(axis: AgentTheoryVec3): AgentTheoryVec3 {
  const largestIndex = [0, 1, 2].sort(
    (left, right) => Math.abs(axis[right]) - Math.abs(axis[left]),
  )[0];
  return axis[largestIndex] < 0 ? scale(axis, -1) : axis;
}

function clampSignedMagnitude(
  value: number,
  minimumMagnitude: number,
  maximumMagnitude: number,
) {
  const sign = Math.sign(value) || 1;
  return sign * clamp(Math.abs(value), minimumMagnitude, maximumMagnitude);
}

function visitedSectorRatio(visitedSectors: number[]) {
  if (visitedSectors.length === 0) return 0;
  return visitedSectors.filter((value) => value > 0).length
    / visitedSectors.length;
}

function add(left: AgentTheoryVec3, right: AgentTheoryVec3): AgentTheoryVec3 {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function subtract(
  left: AgentTheoryVec3,
  right: AgentTheoryVec3,
): AgentTheoryVec3 {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function scale(vector: AgentTheoryVec3, scalar: number): AgentTheoryVec3 {
  return [vector[0] * scalar, vector[1] * scalar, vector[2] * scalar];
}

function dot(left: AgentTheoryVec3, right: AgentTheoryVec3) {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function cross(
  left: AgentTheoryVec3,
  right: AgentTheoryVec3,
): AgentTheoryVec3 {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function length(vector: AgentTheoryVec3) {
  return Math.hypot(vector[0], vector[1], vector[2]);
}

function normalize(vector: AgentTheoryVec3): AgentTheoryVec3 {
  const magnitude = Math.max(1e-12, length(vector));
  return scale(vector, 1 / magnitude);
}

function lerpVec3(
  start: AgentTheoryVec3,
  end: AgentTheoryVec3,
  amount: number,
): AgentTheoryVec3 {
  return [
    lerp(start[0], end[0], amount),
    lerp(start[1], end[1], amount),
    lerp(start[2], end[2], amount),
  ];
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function percentile(values: number[], ratio: number) {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.round((sorted.length - 1) * clamp(ratio, 0, 1))),
  );
  return sorted[index];
}

function normalizeAngle(angle: number) {
  const full = Math.PI * 2;
  return ((angle % full) + full) % full;
}

function smootherstep(value: number) {
  const bounded = clamp(value, 0, 1);
  return bounded * bounded * bounded * (
    bounded * (bounded * 6 - 15) + 10
  );
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function lerp(start: number, end: number, amount: number) {
  return start + (end - start) * amount;
}
