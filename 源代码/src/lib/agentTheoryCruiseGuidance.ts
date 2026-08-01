import {
  AGENT_THEORY_CRUISE_FIXED_STEP_SECONDS,
  advanceAgentTheoryCruise,
  cloneAgentTheoryCruiseCheckpoint,
  sampleAgentTheoryCruise,
  type AgentTheoryCruiseCheckpointV1,
  type AgentTheoryPerimeterProfileV1,
  type AgentTheoryVec3,
} from "./agentTheoryPerimeter";
import { resolveAgentTheoryScreenLodTarget } from "./agentTheoryScreenLod";
import {
  createAgentTheoryVisibilityEnvelope,
  isAgentTheoryVisibilitySafe,
  scoreAgentTheoryVisibility,
  type AgentTheoryVisibilityCounts,
} from "./agentTheoryVisibilityGuard";

export const AGENT_THEORY_CRUISE_GUIDANCE_VERSION =
  "agent-theory-cruise-guidance-v1" as const;

export type AgentTheoryCruiseGuidanceCatalog = {
  profile: AgentTheoryPerimeterProfileV1;
  paperPositions: Float32Array;
  totalPaperCount: number;
  hotspotPositions: Float32Array;
};

export type AgentTheoryCruiseGuidanceInput = {
  checkpoint: AgentTheoryCruiseCheckpointV1;
  tangentWeight: number;
  verticalAimRatio: number;
  centerBlend: number;
  directionSign: -1 | 1;
  speedScale: number;
  width: number;
  height: number;
  quality: "balanced" | "high";
  fovDegrees: number;
  near: number;
  far: number;
  broadSearch: boolean;
};

export type AgentTheoryCruiseGuidanceResult = {
  tangentWeight: number;
  verticalAimRatio: number;
  directionSign: -1 | 1;
  speedScale: number;
  fallbackToCenter: boolean;
  scoreImprovementRatio: number;
  currentCounts: AgentTheoryVisibilityCounts;
  predictedMinimumPaperCount: number;
  predictedMinimumHotspotCount: number;
  predictedMinimumHotspotCellCount: number;
  currentSafe: boolean;
  recommendedSafe: boolean;
  belowTarget: boolean;
  depthPercentiles: [number, number, number];
};

type VisibilitySample = {
  counts: AgentTheoryVisibilityCounts;
  depths: number[];
};

type Horizon = {
  current: VisibilitySample;
  minimum: AgentTheoryVisibilityCounts;
  safe: boolean;
  score: number;
};

type Candidate = {
  tangentWeight: number;
  verticalAimRatio: number;
  directionSign: -1 | 1;
  speedScale: number;
  fallbackToCenter: boolean;
  horizon: Horizon;
};

export function validateAgentTheoryCruiseGuidanceCatalog(
  catalog: AgentTheoryCruiseGuidanceCatalog,
) {
  if (
    catalog.paperPositions.length % 3 !== 0
    || catalog.hotspotPositions.length % 3 !== 0
    || catalog.paperPositions.length === 0
    || catalog.hotspotPositions.length === 0
  ) {
    throw new Error("Cruise guidance positions must contain xyz triples.");
  }
  if (
    !Number.isSafeInteger(catalog.totalPaperCount)
    || catalog.totalPaperCount <= 0
  ) {
    throw new Error("Cruise guidance totalPaperCount must be positive.");
  }
}

export function executeAgentTheoryCruiseGuidance(
  catalog: AgentTheoryCruiseGuidanceCatalog,
  input: AgentTheoryCruiseGuidanceInput,
): AgentTheoryCruiseGuidanceResult {
  validateAgentTheoryCruiseGuidanceCatalog(catalog);
  const currentDirection = input.directionSign;
  const currentHorizon = evaluateHorizon(catalog, input, {
    tangentWeight: input.tangentWeight,
    verticalAimRatio: input.verticalAimRatio,
    directionSign: currentDirection,
    speedScale: input.speedScale,
    fallbackToCenter: input.centerBlend > 0.5,
  });
  const envelope = createAgentTheoryVisibilityEnvelope(
    input.width,
    input.height,
  );
  const belowTarget = (
    currentHorizon.minimum.paperCount < envelope.paperTarget
    || currentHorizon.minimum.hotspotCount < envelope.hotspotTarget
    || currentHorizon.minimum.hotspotCellCount < envelope.hotspotCellTarget
  );
  let best: Candidate = {
    tangentWeight: input.tangentWeight,
    verticalAimRatio: input.verticalAimRatio,
    directionSign: currentDirection,
    speedScale: input.speedScale,
    fallbackToCenter: input.centerBlend > 0.5,
    horizon: currentHorizon,
  };

  if (!currentHorizon.safe || belowTarget) {
    const directionSigns: Array<-1 | 1> = input.broadSearch
      ? [currentDirection, currentDirection === 1 ? -1 : 1]
      : [currentDirection];
    const tangentWeights = input.broadSearch
      ? [0.55, 0.60, 0.65, 0.70, 0.75]
      : uniqueNumbers([
          clamp(input.tangentWeight - 0.05, 0.55, 0.75),
          clamp(input.tangentWeight, 0.55, 0.75),
          clamp(input.tangentWeight + 0.05, 0.55, 0.75),
        ]);
    const verticalRatios = input.broadSearch
      ? [-0.28, -0.14, 0, 0.14, 0.28]
      : uniqueNumbers([
          clamp(input.verticalAimRatio - 0.14, -0.28, 0.28),
          clamp(input.verticalAimRatio, -0.28, 0.28),
          clamp(input.verticalAimRatio + 0.14, -0.28, 0.28),
        ]);
    for (const directionSign of directionSigns) {
      for (const tangentWeight of tangentWeights) {
        for (const verticalAimRatio of verticalRatios) {
          const speedScale = directionSign === currentDirection ? 0.78 : 0.55;
          const candidate: Candidate = {
            tangentWeight,
            verticalAimRatio,
            directionSign,
            speedScale,
            fallbackToCenter: false,
            horizon: evaluateHorizon(catalog, input, {
              tangentWeight,
              verticalAimRatio,
              directionSign,
              speedScale,
              fallbackToCenter: false,
            }),
          };
          if (candidateBetter(candidate, best)) best = candidate;
        }
      }
    }
    if (input.broadSearch && !best.horizon.safe) {
      for (const directionSign of directionSigns) {
        const candidate: Candidate = {
          tangentWeight: input.tangentWeight,
          verticalAimRatio: 0,
          directionSign,
          speedScale: 0.35,
          fallbackToCenter: true,
          horizon: evaluateHorizon(catalog, input, {
            tangentWeight: input.tangentWeight,
            verticalAimRatio: 0,
            directionSign,
            speedScale: 0.35,
            fallbackToCenter: true,
          }),
        };
        if (candidateBetter(candidate, best)) best = candidate;
      }
    }
  }

  const denominator = Math.max(1, Math.abs(currentHorizon.score));
  return {
    tangentWeight: best.tangentWeight,
    verticalAimRatio: best.verticalAimRatio,
    directionSign: best.directionSign,
    speedScale: best.speedScale,
    fallbackToCenter: best.fallbackToCenter,
    scoreImprovementRatio: Math.max(
      0,
      (currentHorizon.score - best.horizon.score) / denominator,
    ),
    currentCounts: currentHorizon.current.counts,
    predictedMinimumPaperCount: best.horizon.minimum.paperCount,
    predictedMinimumHotspotCount: best.horizon.minimum.hotspotCount,
    predictedMinimumHotspotCellCount:
      best.horizon.minimum.hotspotCellCount,
    currentSafe: currentHorizon.safe,
    recommendedSafe: best.horizon.safe,
    belowTarget,
    depthPercentiles: resolveDepthPercentiles(
      currentHorizon.current.depths,
      input.near,
    ),
  };
}

function evaluateHorizon(
  catalog: AgentTheoryCruiseGuidanceCatalog,
  input: AgentTheoryCruiseGuidanceInput,
  candidate: Omit<Candidate, "horizon">,
): Horizon {
  const envelope = createAgentTheoryVisibilityEnvelope(
    input.width,
    input.height,
  );
  const offsets = [0, 1.5, 3, 4.5, 6];
  let checkpoint = cloneAgentTheoryCruiseCheckpoint(input.checkpoint);
  let previousOffset = 0;
  const rows: VisibilitySample[] = [];
  for (const offset of offsets) {
    const steps = Math.max(
      0,
      Math.round(
        (offset - previousOffset) / AGENT_THEORY_CRUISE_FIXED_STEP_SECONDS,
      ),
    );
    if (steps > 0) {
      checkpoint = advanceAgentTheoryCruise(
        catalog.profile,
        checkpoint,
        steps,
        {
          directionSign: candidate.directionSign,
          speedScale: candidate.speedScale,
        },
      );
    }
    previousOffset = offset;
    const sample = sampleAgentTheoryCruise(catalog.profile, checkpoint);
    const position = sample.position;
    const lookTarget = createLookTarget(
      catalog.profile,
      position,
      candidate.tangentWeight,
      candidate.verticalAimRatio,
      candidate.directionSign,
      candidate.fallbackToCenter,
    );
    rows.push(measureVisibility(catalog, input, position, lookTarget));
  }
  const minimum = {
    paperCount: Math.min(...rows.map((row) => row.counts.paperCount)),
    hotspotCount: Math.min(...rows.map((row) => row.counts.hotspotCount)),
    hotspotCellCount: Math.min(
      ...rows.map((row) => row.counts.hotspotCellCount),
    ),
  };
  return {
    current: rows[0],
    minimum,
    safe: rows.every((row) => (
      isAgentTheoryVisibilitySafe(row.counts, envelope)
    )),
    score: rows.reduce(
      (sum, row) => sum + scoreAgentTheoryVisibility(row.counts, envelope),
      0,
    )
      + (candidate.fallbackToCenter ? 4 : 0)
      + (candidate.directionSign === input.directionSign ? 0 : 0.35),
  };
}

function measureVisibility(
  catalog: AgentTheoryCruiseGuidanceCatalog,
  input: AgentTheoryCruiseGuidanceInput,
  position: AgentTheoryVec3,
  lookTarget: AgentTheoryVec3,
): VisibilitySample {
  const forward = normalize(subtract(lookTarget, position));
  let right = normalize(cross(forward, [0, 0, 1]));
  if (length(right) <= 1e-9) right = [1, 0, 0];
  const up = normalize(cross(right, forward));
  const tanHalfFov = Math.tan(input.fovDegrees * Math.PI / 360);
  const aspect = input.width / Math.max(1, input.height);
  let visiblePapers = 0;
  const depths: number[] = [];
  for (
    let offset = 0;
    offset < catalog.paperPositions.length;
    offset += 3
  ) {
    const projected = projectPoint(
      [
        catalog.paperPositions[offset],
        catalog.paperPositions[offset + 1],
        catalog.paperPositions[offset + 2],
      ],
      position,
      forward,
      right,
      up,
      tanHalfFov,
      aspect,
      input.near,
      input.far,
    );
    if (!projected) continue;
    visiblePapers += 1;
    depths.push(projected.depth);
  }
  let hotspotCount = 0;
  const cells = new Set<string>();
  for (
    let offset = 0;
    offset < catalog.hotspotPositions.length;
    offset += 3
  ) {
    const projected = projectPoint(
      [
        catalog.hotspotPositions[offset],
        catalog.hotspotPositions[offset + 1],
        catalog.hotspotPositions[offset + 2],
      ],
      position,
      forward,
      right,
      up,
      tanHalfFov,
      aspect,
      input.near,
      input.far,
    );
    if (!projected) continue;
    hotspotCount += 1;
    const cellX = clamp(Math.floor((projected.ndcX * 0.5 + 0.5) * 6), 0, 5);
    const cellY = clamp(Math.floor((-projected.ndcY * 0.5 + 0.5) * 4), 0, 3);
    cells.add(`${cellX}:${cellY}`);
  }
  const projectedPaperCount = Math.round(
    visiblePapers / Math.max(1, catalog.paperPositions.length / 3)
      * catalog.totalPaperCount,
  );
  return {
    counts: {
      paperCount: Math.min(
        projectedPaperCount,
        resolveAgentTheoryScreenLodTarget(
          input.width,
          input.height,
          input.quality,
        ),
      ),
      hotspotCount,
      hotspotCellCount: cells.size,
    },
    depths,
  };
}

function createLookTarget(
  profile: AgentTheoryPerimeterProfileV1,
  position: AgentTheoryVec3,
  tangentWeight: number,
  verticalAimRatio: number,
  directionSign: -1 | 1,
  fallbackToCenter: boolean,
): AgentTheoryVec3 {
  if (fallbackToCenter) return [...profile.center];
  const verticalAxis = normalize(profile.principalAxes[2]);
  const relative = subtract(position, profile.center);
  const radial = normalize(subtract(
    relative,
    scale(verticalAxis, dot(relative, verticalAxis)),
  ));
  const planeX = dot(radial, profile.principalAxes[0]);
  const planeY = dot(radial, profile.principalAxes[1]);
  const tangent = normalize(scale(add(
    scale(profile.principalAxes[0], -planeY),
    scale(profile.principalAxes[1], planeX),
  ), directionSign));
  const boundedTangent = clamp(tangentWeight, 0.55, 0.75);
  const inward = Math.sqrt(Math.max(0.001, 1 - boundedTangent ** 2));
  const direction = normalize(add(
    scale(tangent, boundedTangent),
    scale(radial, -inward),
  ));
  return add(
    add(
      position,
      scale(direction, Math.max(0.0047 * 18, profile.medianRadius * 0.88)),
    ),
    scale(verticalAxis, verticalAimRatio * profile.verticalExtent),
  );
}

function projectPoint(
  point: AgentTheoryVec3,
  position: AgentTheoryVec3,
  forward: AgentTheoryVec3,
  right: AgentTheoryVec3,
  up: AgentTheoryVec3,
  tanHalfFov: number,
  aspect: number,
  near: number,
  far: number,
) {
  const delta = subtract(point, position);
  const depth = dot(delta, forward);
  if (depth < near || depth > far) return null;
  const ndcX = dot(delta, right) / Math.max(1e-9, depth * tanHalfFov * aspect);
  const ndcY = dot(delta, up) / Math.max(1e-9, depth * tanHalfFov);
  if (Math.abs(ndcX) > 1 || Math.abs(ndcY) > 1) return null;
  return { ndcX, ndcY, depth };
}

function resolveDepthPercentiles(
  depths: number[],
  fallback: number,
): [number, number, number] {
  if (depths.length === 0) return [fallback, fallback, fallback + 0.001];
  const sorted = [...depths].sort((left, right) => left - right);
  const p5 = percentile(sorted, 0.05);
  const p50 = percentile(sorted, 0.5);
  return [p5, p50, Math.max(p5 + 0.001, percentile(sorted, 0.95))];
}

function candidateBetter(candidate: Candidate, current: Candidate) {
  if (candidate.horizon.safe !== current.horizon.safe) {
    return candidate.horizon.safe;
  }
  return candidate.horizon.score < current.horizon.score;
}

function percentile(sorted: number[], ratio: number) {
  const index = clamp(
    Math.round((sorted.length - 1) * ratio),
    0,
    sorted.length - 1,
  );
  return sorted[index];
}

function uniqueNumbers(values: number[]) {
  return [...new Set(values)];
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
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

function scale(value: AgentTheoryVec3, amount: number): AgentTheoryVec3 {
  return [value[0] * amount, value[1] * amount, value[2] * amount];
}

function dot(left: AgentTheoryVec3, right: AgentTheoryVec3) {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function cross(left: AgentTheoryVec3, right: AgentTheoryVec3): AgentTheoryVec3 {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function length(value: AgentTheoryVec3) {
  return Math.hypot(value[0], value[1], value[2]);
}

function normalize(value: AgentTheoryVec3): AgentTheoryVec3 {
  const magnitude = length(value);
  return magnitude > 1e-12 ? scale(value, 1 / magnitude) : [0, 0, 0];
}
