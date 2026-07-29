import type { App17GalaxyPayload } from "../types";

export const AGENT_THEORY_PERIMETER_PROFILE_VERSION =
  "agent-theory-perimeter-v1-r1" as const;
export const APP15_THEORY_COORDINATE_SCALE = 0.0047;
export const AGENT_THEORY_PERIMETER_SECTOR_COUNT = 96;
export const AGENT_THEORY_CRUISE_FIXED_STEP_SECONDS = 1 / 60;

export type AgentTheoryVec3 = [number, number, number];

export type AgentTheoryPerimeterProfileV1 = {
  version: typeof AGENT_THEORY_PERIMETER_PROFILE_VERSION;
  center: AgentTheoryVec3;
  principalAxes: [AgentTheoryVec3, AgentTheoryVec3, AgentTheoryVec3];
  sectorRadii: number[];
  safetyMargins: number[];
  verticalExtent: number;
  medianRadius: number;
  maximumRadius: number;
};

export type AgentTheoryCruiseCheckpointV1 = {
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
  inwardWeight: number;
  lastNoiseStep: number;
};

export type AgentTheoryCameraMode = "cruise" | "explore" | "returning";

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

export type AgentTheoryReturnTransitionV1 = {
  startedAtMs: number;
  durationMs: number;
  fromPosition: AgentTheoryVec3;
  fromLookTarget: AgentTheoryVec3;
  toPosition: AgentTheoryVec3;
  toLookTarget: AgentTheoryVec3;
  targetCheckpoint: AgentTheoryCruiseCheckpointV1;
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
    const sector = angleToSector(Math.atan2(y, x));
    sectorRadii[sector] = Math.max(sectorRadii[sector], radius);
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

  return {
    version: AGENT_THEORY_PERIMETER_PROFILE_VERSION,
    center,
    principalAxes,
    sectorRadii: conservativeRadii,
    safetyMargins,
    verticalExtent: percentile(verticalDistances, 0.98) || 1,
    medianRadius,
    maximumRadius: Math.max(...conservativeRadii),
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
    inwardWeight,
    lastNoiseStep: 0,
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
): AgentTheoryCruiseCheckpointV1 {
  const next = cloneAgentTheoryCruiseCheckpoint(checkpoint);
  const dt = AGENT_THEORY_CRUISE_FIXED_STEP_SECONDS;
  const maximumSteps = Math.max(0, Math.floor(stepCount));
  for (let step = 0; step < maximumSteps; step += 1) {
    const previousPosition = next.position;
    const previousVelocity = next.velocity;
    if (next.stepIndex - next.lastNoiseStep >= 120) {
      next.lastNoiseStep = next.stepIndex;
      const direction = Math.sign(next.angularVelocity) || 1;
      const coverage = visitedSectorRatio(next.visitedSectors);
      const speedFloor = coverage < 0.9 ? 0.0051 : 0.0046;
      const speedCeiling = coverage < 0.9 ? 0.0069 : 0.0072;
      const targetSpeed = direction * lerp(
        speedFloor,
        speedCeiling,
        nextRandom(next.randomState),
      );
      next.angularAcceleration = clamp(
        (targetSpeed - next.angularVelocity) * 0.18,
        -0.00085,
        0.00085,
      );
      const tangentTarget = lerp(0.65, 0.75, nextRandom(next.randomState));
      next.tangentWeight = lerp(next.tangentWeight, tangentTarget, 0.16);
      next.inwardWeight = Math.sqrt(
        Math.max(0.001, 1 - next.tangentWeight * next.tangentWeight),
      );
      const verticalTarget = (
        nextRandom(next.randomState) * 2 - 1
      ) * profile.verticalExtent * 0.58;
      next.verticalVelocity = clamp(
        next.verticalVelocity
          + (verticalTarget - next.verticalOffset) * 0.000035,
        -profile.verticalExtent * 0.015,
        profile.verticalExtent * 0.015,
      );
    }

    next.angularVelocity = clampSignedMagnitude(
      next.angularVelocity + next.angularAcceleration * dt,
      0.0045,
      0.0074,
    );
    next.angularAcceleration *= 0.998;
    next.azimuthRadians = normalizeAngle(
      next.azimuthRadians + next.angularVelocity * dt,
    );
    next.verticalVelocity += -next.verticalOffset * 0.00011;
    next.verticalVelocity *= 0.9992;
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
  const sectorIndex = angleToSector(checkpoint.azimuthRadians);
  const shellRadius = resolveConservativeShellRadius(
    profile,
    checkpoint.azimuthRadians,
  );
  const safetyMargin = resolveConservativeSafetyMargin(
    profile,
    checkpoint.azimuthRadians,
  );
  const radial = add(
    scale(profile.principalAxes[0], Math.cos(checkpoint.azimuthRadians)),
    scale(profile.principalAxes[1], Math.sin(checkpoint.azimuthRadians)),
  );
  const tangentSign = Math.sign(checkpoint.angularVelocity) || 1;
  const tangent = scale(
    add(
      scale(profile.principalAxes[0], -Math.sin(checkpoint.azimuthRadians)),
      scale(profile.principalAxes[1], Math.cos(checkpoint.azimuthRadians)),
    ),
    tangentSign,
  );
  const position = add(
    add(
      profile.center,
      scale(radial, shellRadius + safetyMargin),
    ),
    scale(profile.principalAxes[2], checkpoint.verticalOffset),
  );
  const lookDirection = normalize(add(
    scale(tangent, checkpoint.tangentWeight),
    scale(radial, -checkpoint.inwardWeight),
  ));
  const lookTarget = add(
    position,
    scale(lookDirection, Math.max(18, profile.medianRadius * 0.88)),
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

export function createAgentTheoryReturnTransition({
  profile,
  checkpoint,
  nowMs,
  fromPosition,
  fromLookTarget,
}: {
  profile: AgentTheoryPerimeterProfileV1;
  checkpoint: AgentTheoryCruiseCheckpointV1;
  nowMs: number;
  fromPosition: AgentTheoryVec3;
  fromLookTarget: AgentTheoryVec3;
}): AgentTheoryReturnTransitionV1 {
  const relative = subtract(fromPosition, profile.center);
  const planeX = dot(relative, profile.principalAxes[0]);
  const planeY = dot(relative, profile.principalAxes[1]);
  const azimuthRadians = normalizeAngle(Math.atan2(planeY, planeX));
  const nextCheckpoint = cloneAgentTheoryCruiseCheckpoint(checkpoint);
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
  const destination = sampleAgentTheoryCruise(profile, nextCheckpoint);
  nextCheckpoint.position = destination.position;
  const distance = length(subtract(destination.position, fromPosition));
  const durationMs = clamp(1_800 + distance * 12, 1_800, 3_200);
  return {
    startedAtMs: nowMs,
    durationMs,
    fromPosition: [...fromPosition],
    fromLookTarget: [...fromLookTarget],
    toPosition: [...destination.position],
    toLookTarget: [...destination.lookTarget],
    targetCheckpoint: nextCheckpoint,
  };
}

export function sampleAgentTheoryReturnTransition(
  transition: AgentTheoryReturnTransitionV1,
  nowMs: number,
): {
  position: AgentTheoryVec3;
  lookTarget: AgentTheoryVec3;
  progress: number;
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
    lookTarget: lerpVec3(
      transition.fromLookTarget,
      transition.toLookTarget,
      progress,
    ),
    progress,
    complete: linearProgress >= 1,
  };
}

export function resolveAgentTheoryStellarLod(
  cssDiameter: number,
  sphereEligible: boolean,
  previous?: AgentTheoryStellarLod,
): AgentTheoryStellarLod {
  const diameter = Math.max(0, cssDiameter);
  if (sphereEligible) {
    if (previous === "sphere" && diameter > 14) return "sphere";
    if (diameter >= 18) return "sphere";
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
    ) return null;
    return cloneAgentTheoryCruiseCheckpoint(parsed);
  } catch {
    return null;
  }
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

function resolveConservativeShellRadius(
  profile: AgentTheoryPerimeterProfileV1,
  angle: number,
) {
  const sector = angleToSector(angle);
  return Math.max(
    profile.sectorRadii[sector],
    profile.sectorRadii[wrapSector(sector - 1)],
    profile.sectorRadii[wrapSector(sector + 1)],
  );
}

function resolveConservativeSafetyMargin(
  profile: AgentTheoryPerimeterProfileV1,
  angle: number,
) {
  const sector = angleToSector(angle);
  return Math.max(
    profile.safetyMargins[sector],
    profile.safetyMargins[wrapSector(sector - 1)],
    profile.safetyMargins[wrapSector(sector + 1)],
  );
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
