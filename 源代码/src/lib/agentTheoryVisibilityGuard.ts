export const AGENT_THEORY_VISIBILITY_GUARD_VERSION =
  "agent-theory-visibility-v1" as const;

export type AgentTheoryVisibilityEnvelopeV1 = {
  version: typeof AGENT_THEORY_VISIBILITY_GUARD_VERSION;
  paperHardFloor: number;
  paperTarget: number;
  paperTargetMaximum: number;
  hotspotHardFloor: number;
  hotspotTarget: number;
  hotspotCellHardFloor: number;
  hotspotCellTarget: number;
  predictionHorizonSeconds: number;
};

export type AgentTheoryVisibilityCounts = {
  paperCount: number;
  hotspotCount: number;
  hotspotCellCount: number;
};

export type AgentTheoryVisibilityGuardSnapshot = {
  currentPaperCount: number;
  currentHotspotCount: number;
  currentHotspotCellCount: number;
  predictedMinimumPaperCount: number;
  predictedMinimumHotspotCount: number;
  predictedMinimumHotspotCellCount: number;
  steeringBlend: number;
  rejectedCruiseStepCount: number;
  lastSafeStepIndex: number;
  safe: boolean;
};

const clamp = (value: number, minimum: number, maximum: number) => (
  Math.max(minimum, Math.min(maximum, value))
);

export function createAgentTheoryVisibilityEnvelope(
  width: number,
  height: number,
): AgentTheoryVisibilityEnvelopeV1 {
  const referenceArea = 1_440 * 900;
  const viewportArea = Math.max(1, width) * Math.max(1, height);
  const areaScale = clamp(viewportArea / referenceArea, 0.7, 1.2);
  return {
    version: AGENT_THEORY_VISIBILITY_GUARD_VERSION,
    paperHardFloor: Math.round(1_200 * areaScale),
    paperTarget: Math.round(1_500 * areaScale),
    paperTargetMaximum: Math.round(2_500 * areaScale),
    hotspotHardFloor: 12,
    hotspotTarget: 16,
    hotspotCellHardFloor: 5,
    hotspotCellTarget: 6,
    predictionHorizonSeconds: 6,
  };
}

export function isAgentTheoryVisibilitySafe(
  counts: AgentTheoryVisibilityCounts,
  envelope: AgentTheoryVisibilityEnvelopeV1,
) {
  return counts.paperCount >= envelope.paperHardFloor
    && counts.hotspotCount >= envelope.hotspotHardFloor
    && counts.hotspotCellCount >= envelope.hotspotCellHardFloor;
}

export function scoreAgentTheoryVisibility(
  counts: AgentTheoryVisibilityCounts,
  envelope: AgentTheoryVisibilityEnvelopeV1,
) {
  const paperDeficit = Math.max(
    0,
    envelope.paperTarget - counts.paperCount,
  ) / Math.max(1, envelope.paperTarget);
  const paperExcess = Math.max(
    0,
    counts.paperCount - envelope.paperTargetMaximum,
  ) / Math.max(1, envelope.paperTargetMaximum);
  const hotspotDeficit = Math.max(
    0,
    envelope.hotspotTarget - counts.hotspotCount,
  ) / Math.max(1, envelope.hotspotTarget);
  const cellDeficit = Math.max(
    0,
    envelope.hotspotCellTarget - counts.hotspotCellCount,
  ) / Math.max(1, envelope.hotspotCellTarget);
  const hardFloorPenalty = isAgentTheoryVisibilitySafe(counts, envelope)
    ? 0
    : 100;
  return hardFloorPenalty
    + paperDeficit * 8
    + paperExcess * 1.5
    + hotspotDeficit * 14
    + cellDeficit * 18;
}

export function createEmptyAgentTheoryVisibilityGuardSnapshot():
AgentTheoryVisibilityGuardSnapshot {
  return {
    currentPaperCount: 0,
    currentHotspotCount: 0,
    currentHotspotCellCount: 0,
    predictedMinimumPaperCount: 0,
    predictedMinimumHotspotCount: 0,
    predictedMinimumHotspotCellCount: 0,
    steeringBlend: 0,
    rejectedCruiseStepCount: 0,
    lastSafeStepIndex: 0,
    safe: false,
  };
}
