export const AGENT_THEORY_SCREEN_LOD_VERSION =
  "agent-theory-screen-lod-v3" as const;

export const AGENT_THEORY_SCREEN_LOD_GUARD_BAND_NDC = 1.35;
export const AGENT_THEORY_SCREEN_LOD_ACTIVE_HZ = 20;
export const AGENT_THEORY_SCREEN_LOD_IDLE_HZ = 4;

export type AgentTheoryScreenLodQuality = "balanced" | "high";
export type AgentTheoryScreenLodCadence = "active" | "idle";

export type AgentTheoryScreenLodCandidate = {
  index: number;
  paperId: string;
  topicKey: string;
  ndcX: number;
  ndcY: number;
  ndcZ: number;
  size: number;
  previouslyVisible: boolean;
  forced: boolean;
};

export type AgentTheoryScreenLodResult = {
  selectedIndices: number[];
  candidateCount: number;
  guardBandCandidateCount: number;
  viewportCandidateCount: number;
  viewportSelectedCount: number;
  forcedVisibleCount: number;
  perceptiblePaperCount: number;
  occupiedTileRatio: number;
  overlapP95: number;
  selectionHash: string;
  tileSizeCssPx: number;
  targetCount: number;
  viewportTargetCount: number;
  guardBandNdc: number;
};

export type AgentTheoryScreenLodTransition = {
  /**
   * The target set for the current camera. These entities remain visible after
   * the transition finishes.
   */
  visibleIndices: number[];
  /**
   * Members of visibleIndices that were absent from the previous visible set.
   */
  incomingIndices: number[];
  /**
   * Members of the previous visible set that are no longer targeted. They stay
   * resident until their fade-out finishes.
   */
  retiringIndices: number[];
  /**
   * The union of visibleIndices and retiringIndices. Geometry owners can use
   * this set to guarantee that selection changes never create a blank frame.
   */
  residentIndices: number[];
  transitionHash: string;
};

type PreparedAgentTheoryScreenLodCandidate = {
  candidate: AgentTheoryScreenLodCandidate;
  priority: number;
  tileIndex: number;
  inViewport: boolean;
};

const QUALITY_CONFIG = {
  balanced: {
    minimumCount: 3_500,
    maximumCount: 5_500,
    areaDivisor: 260,
    tileSizeCssPx: 28,
    tileCapacity: 3,
  },
  high: {
    minimumCount: 5_000,
    maximumCount: 7_500,
    areaDivisor: 205,
    tileSizeCssPx: 24,
    tileCapacity: 3,
  },
} as const;

const clamp = (value: number, minimum: number, maximum: number) => (
  Math.max(minimum, Math.min(maximum, value))
);

export function resolveAgentTheoryScreenLodTarget(
  width: number,
  height: number,
  quality: AgentTheoryScreenLodQuality,
) {
  const config = QUALITY_CONFIG[quality];
  return clamp(
    Math.round(Math.max(1, width) * Math.max(1, height) / config.areaDivisor),
    config.minimumCount,
    config.maximumCount,
  );
}

export function resolveAgentTheoryScreenLodIntervalMs(
  cadence: AgentTheoryScreenLodCadence,
) {
  return 1_000 / (
    cadence === "active"
      ? AGENT_THEORY_SCREEN_LOD_ACTIVE_HZ
      : AGENT_THEORY_SCREEN_LOD_IDLE_HZ
  );
}

export function shouldAcceptAgentTheoryScreenLodRevision({
  responseRevision,
  latestRequestedRevision,
  latestAcceptedRevision,
}: {
  responseRevision: number;
  latestRequestedRevision: number;
  latestAcceptedRevision: number;
}) {
  return Number.isSafeInteger(responseRevision)
    && responseRevision === latestRequestedRevision
    && responseRevision > latestAcceptedRevision;
}

export function projectAgentTheoryScreenLodNdc(
  positions: Float32Array,
  localToClipMatrix: Float32Array,
) {
  if (positions.length % 3 !== 0) {
    throw new Error("Screen LOD positions must contain packed xyz triples.");
  }
  if (localToClipMatrix.length !== 16) {
    throw new Error("Screen LOD local-to-clip matrix must contain 16 values.");
  }
  const projected = new Float32Array(positions.length);
  const matrix = localToClipMatrix;
  for (let offset = 0; offset < positions.length; offset += 3) {
    const x = positions[offset];
    const y = positions[offset + 1];
    const z = positions[offset + 2];
    const clipW = matrix[3] * x
      + matrix[7] * y
      + matrix[11] * z
      + matrix[15];
    if (!Number.isFinite(clipW) || clipW <= 1e-7) {
      projected[offset] = Number.NaN;
      projected[offset + 1] = Number.NaN;
      projected[offset + 2] = Number.NaN;
      continue;
    }
    const inverseW = 1 / clipW;
    projected[offset] = (
      matrix[0] * x
      + matrix[4] * y
      + matrix[8] * z
      + matrix[12]
    ) * inverseW;
    projected[offset + 1] = (
      matrix[1] * x
      + matrix[5] * y
      + matrix[9] * z
      + matrix[13]
    ) * inverseW;
    projected[offset + 2] = (
      matrix[2] * x
      + matrix[6] * y
      + matrix[10] * z
      + matrix[14]
    ) * inverseW;
  }
  return projected;
}

export function classifyAgentTheoryScreenLodTransition(
  visibleIndices: readonly number[],
  previousVisibleIndices: readonly number[],
): AgentTheoryScreenLodTransition {
  const visible = sortedUniqueIndices(visibleIndices);
  const previous = sortedUniqueIndices(previousVisibleIndices);
  const visibleSet = new Set(visible);
  const previousSet = new Set(previous);
  const incoming = visible.filter((index) => !previousSet.has(index));
  const retiring = previous.filter((index) => !visibleSet.has(index));
  const resident = sortedUniqueIndices([...visible, ...retiring]);
  let transitionHashValue = 0x811c9dc5;
  for (const [tag, indices] of [
    [1, visible],
    [2, incoming],
    [3, retiring],
    [4, resident],
  ] as const) {
    transitionHashValue ^= tag;
    transitionHashValue = Math.imul(transitionHashValue, 0x01000193);
    for (const index of indices) {
      transitionHashValue ^= index >>> 0;
      transitionHashValue = Math.imul(transitionHashValue, 0x01000193);
    }
  }
  return {
    visibleIndices: visible,
    incomingIndices: incoming,
    retiringIndices: retiring,
    residentIndices: resident,
    transitionHash: (transitionHashValue >>> 0)
      .toString(16)
      .padStart(8, "0"),
  };
}

export function selectAgentTheoryScreenLod({
  candidates,
  width,
  height,
  quality,
  guardBandNdc = 1,
}: {
  candidates: AgentTheoryScreenLodCandidate[];
  width: number;
  height: number;
  quality: AgentTheoryScreenLodQuality;
  guardBandNdc?: number;
}): AgentTheoryScreenLodResult {
  const config = QUALITY_CONFIG[quality];
  const normalizedGuardBand = clamp(
    Number.isFinite(guardBandNdc) ? guardBandNdc : 1,
    1,
    AGENT_THEORY_SCREEN_LOD_GUARD_BAND_NDC,
  );
  const guardBandCandidates = candidates.filter((candidate) => (
    Number.isFinite(candidate.ndcX)
    && Number.isFinite(candidate.ndcY)
    && Number.isFinite(candidate.ndcZ)
    && candidate.ndcZ >= -1
    && candidate.ndcZ <= 1
    && Math.abs(candidate.ndcX) <= normalizedGuardBand
    && Math.abs(candidate.ndcY) <= normalizedGuardBand
  ));
  const viewportCandidates = guardBandCandidates.filter((candidate) => (
    Math.abs(candidate.ndcX) <= 1
    && Math.abs(candidate.ndcY) <= 1
  ));
  const viewportTargetCount = Math.min(
    viewportCandidates.length,
    resolveAgentTheoryScreenLodTarget(width, height, quality),
  );
  const targetCount = Math.min(
    guardBandCandidates.length,
    Math.round(
      resolveAgentTheoryScreenLodTarget(width, height, quality)
        * normalizedGuardBand
        * normalizedGuardBand,
    ),
  );
  const extendedWidth = Math.max(1, width) * normalizedGuardBand;
  const extendedHeight = Math.max(1, height) * normalizedGuardBand;
  const marginX = (extendedWidth - Math.max(1, width)) * 0.5;
  const marginY = (extendedHeight - Math.max(1, height)) * 0.5;
  const columns = Math.max(
    1,
    Math.ceil(extendedWidth / config.tileSizeCssPx),
  );
  const rows = Math.max(
    1,
    Math.ceil(extendedHeight / config.tileSizeCssPx),
  );
  const tileCounts = new Uint16Array(columns * rows);
  const selected = new Set<number>();
  const topicCounts = new Map<string, number>();
  const topicFloor = 6;
  const tileIndexFor = (candidate: AgentTheoryScreenLodCandidate) => {
    const screenX = clamp(
      (candidate.ndcX * 0.5 + 0.5) * width + marginX,
      0,
      extendedWidth - 1,
    );
    const screenY = clamp(
      (-candidate.ndcY * 0.5 + 0.5) * height + marginY,
      0,
      extendedHeight - 1,
    );
    const column = clamp(
      Math.floor(screenX / config.tileSizeCssPx),
      0,
      columns - 1,
    );
    const row = clamp(
      Math.floor(screenY / config.tileSizeCssPx),
      0,
      rows - 1,
    );
    return row * columns + column;
  };
  const priorityFor = (candidate: AgentTheoryScreenLodCandidate) => (
    (candidate.forced ? 10_000 : 0)
    + (candidate.previouslyVisible ? 1.2 : 0)
    + clamp(candidate.size, 0, 6) * 0.08
    + stableUnitHash(`${candidate.topicKey}:${candidate.paperId}`) * 0.04
    + (1 - clamp(candidate.ndcZ * 0.5 + 0.5, 0, 1)) * 0.02
  );
  // Hashing IDs and projecting into tiles are substantially more expensive than
  // comparing numbers. Cache both once per selection instead of repeating them
  // O(n log n) times inside the sort comparator and again in every fill pass.
  const preparedCandidates: PreparedAgentTheoryScreenLodCandidate[] =
    guardBandCandidates.map((candidate) => ({
      candidate,
      priority: priorityFor(candidate),
      tileIndex: tileIndexFor(candidate),
      inViewport: Math.abs(candidate.ndcX) <= 1
        && Math.abs(candidate.ndcY) <= 1,
    }));
  preparedCandidates.sort((left, right) => (
    right.priority - left.priority
    || left.candidate.paperId.localeCompare(right.candidate.paperId)
  ));
  const forcedCandidates: PreparedAgentTheoryScreenLodCandidate[] = [];
  const regularCandidates: PreparedAgentTheoryScreenLodCandidate[] = [];
  const viewportRegularCandidates:
    PreparedAgentTheoryScreenLodCandidate[] = [];
  for (const prepared of preparedCandidates) {
    if (prepared.candidate.forced) {
      forcedCandidates.push(prepared);
    } else {
      regularCandidates.push(prepared);
      if (prepared.inViewport) viewportRegularCandidates.push(prepared);
    }
  }
  let selectedViewportCount = 0;

  const addCandidate = (
    prepared: PreparedAgentTheoryScreenLodCandidate,
    tileCapacity: number,
    ignoreTopicFloor = false,
  ) => {
    const { candidate, tileIndex } = prepared;
    if (selected.has(candidate.index)) return false;
    const topicCount = topicCounts.get(candidate.topicKey) ?? 0;
    const topicReserved = !ignoreTopicFloor && topicCount < topicFloor;
    if (!candidate.forced && !topicReserved && tileCounts[tileIndex] >= tileCapacity) {
      return false;
    }
    selected.add(candidate.index);
    if (prepared.inViewport) selectedViewportCount += 1;
    tileCounts[tileIndex] += 1;
    topicCounts.set(candidate.topicKey, topicCount + 1);
    return true;
  };

  for (const prepared of forcedCandidates) {
    addCandidate(prepared, Number.MAX_SAFE_INTEGER, true);
  }

  // Populate the visible viewport before spending the resident budget on the
  // guard band. The old order sorted both regions together, so a valid return
  // camera could end up retaining thousands of off-screen papers while the
  // actual viewport cross-faded to an empty set.
  for (const prepared of viewportRegularCandidates) {
    if (selectedViewportCount >= viewportTargetCount) break;
    const { candidate } = prepared;
    if ((topicCounts.get(candidate.topicKey) ?? 0) >= topicFloor) continue;
    addCandidate(prepared, config.tileCapacity);
  }
  for (const prepared of viewportRegularCandidates) {
    if (selectedViewportCount >= viewportTargetCount) break;
    addCandidate(prepared, config.tileCapacity, true);
  }
  for (
    let extraCapacity = config.tileCapacity + 1;
    selectedViewportCount < viewportTargetCount
      && extraCapacity <= config.tileCapacity + 5;
    extraCapacity += 1
  ) {
    for (const prepared of viewportRegularCandidates) {
      if (selectedViewportCount >= viewportTargetCount) break;
      addCandidate(prepared, extraCapacity, true);
    }
  }

  for (const prepared of regularCandidates) {
    if (selected.size >= targetCount) break;
    const { candidate } = prepared;
    if ((topicCounts.get(candidate.topicKey) ?? 0) >= topicFloor) continue;
    addCandidate(prepared, config.tileCapacity);
  }
  for (const prepared of regularCandidates) {
    if (selected.size >= targetCount) break;
    addCandidate(prepared, config.tileCapacity, true);
  }
  for (
    let extraCapacity = config.tileCapacity + 1;
    selected.size < targetCount && extraCapacity <= config.tileCapacity + 5;
    extraCapacity += 1
  ) {
    for (const prepared of regularCandidates) {
      if (selected.size >= targetCount) break;
      addCandidate(prepared, extraCapacity, true);
    }
  }

  const selectedIndices = [...selected].sort((left, right) => left - right);
  const selectedSet = new Set(selectedIndices);
  const viewportSelectedCount = viewportCandidates.reduce(
    (count, candidate) => count + (selectedSet.has(candidate.index) ? 1 : 0),
    0,
  );
  const occupiedCounts = [...tileCounts].filter((count) => count > 0);
  const sortedOverlap = occupiedCounts.slice().sort((left, right) => left - right);
  const overlapP95 = sortedOverlap.length > 0
    ? sortedOverlap[
      Math.min(
        sortedOverlap.length - 1,
        Math.max(0, Math.ceil(sortedOverlap.length * 0.95) - 1),
      )
    ]
    : 0;
  let selectionHashValue = 0x811c9dc5;
  for (const index of selectedIndices) {
    selectionHashValue ^= index >>> 0;
    selectionHashValue = Math.imul(selectionHashValue, 0x01000193);
  }

  return {
    selectedIndices,
    candidateCount: candidates.length,
    guardBandCandidateCount: guardBandCandidates.length,
    viewportCandidateCount: viewportCandidates.length,
    viewportSelectedCount,
    forcedVisibleCount: forcedCandidates.length,
    perceptiblePaperCount: selectedIndices.length,
    occupiedTileRatio: occupiedCounts.length / Math.max(1, tileCounts.length),
    overlapP95,
    selectionHash: (selectionHashValue >>> 0).toString(16).padStart(8, "0"),
    tileSizeCssPx: config.tileSizeCssPx,
    targetCount,
    viewportTargetCount,
    guardBandNdc: normalizedGuardBand,
  };
}

export function resolveAgentTheoryPaperCoreStyle(agentDepth: number) {
  const depth = clamp(agentDepth, 0, 1);
  const nearToFar = depth * depth * (3 - 2 * depth);
  return {
    minimumCssSize: 2.06 + (1.35 - 2.06) * nearToFar,
    minimumAlpha: 0.86 + (0.55 - 0.86) * nearToFar,
    sizeMultiplier: 1.06 + (0.72 - 1.06) * nearToFar,
    alphaMultiplier: 1.29 + (0.88 - 1.29) * nearToFar,
  };
}

function stableUnitHash(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) / 0xffffffff;
}

function sortedUniqueIndices(indices: readonly number[]) {
  return [...new Set(
    indices.filter((index) => Number.isSafeInteger(index) && index >= 0),
  )].sort((left, right) => left - right);
}
