export const GALAXY_FAR_BACKGROUND_TAKEOVER_START = 0.7;
export const GALAXY_FAR_BACKGROUND_TAKEOVER_END = 0.76;
export const GALAXY_FAR_BACKGROUND_RETREAT_END = 1;
export const GALAXY_FAR_BACKGROUND_MIN_RADIUS = 84;
export const GALAXY_FAR_BACKGROUND_MAX_RADIUS = 120;
export const GALAXY_FAR_BACKGROUND_MAX_PAPERS_PER_HOTSPOT = 24;
export const GALAXY_FAR_BACKGROUND_INTERWEAVE_THRESHOLD = 0.75;
export const GALAXY_FAR_BACKGROUND_MAX_DIRECTION_SEPARATION_DEGREES = 12;
export const GALAXY_FAR_BACKGROUND_PAPER_OPACITY = 0.035;
export const GALAXY_FAR_BACKGROUND_HOTSPOT_CORE_OPACITY = 0.14;
export const GALAXY_FAR_BACKGROUND_HOTSPOT_HALO_OPACITY = 0.055;
export const GALAXY_FAR_BACKGROUND_PAPER_SIZE_SCALE = 0.65;
export const GALAXY_FAR_BACKGROUND_HOTSPOT_SIZE_SCALE = 0.7;
export const GALAXY_FAR_BACKGROUND_PAPER_BREATH_AMPLITUDE = 0.03;
export const GALAXY_FAR_BACKGROUND_HOTSPOT_CORE_BREATH_AMPLITUDE = 0.08;
export const GALAXY_FAR_BACKGROUND_HOTSPOT_HALO_BREATH_AMPLITUDE = 0.12;
export const GALAXY_FAR_BACKGROUND_MASK_MIN_INNER_NDC = 0.18;
export const GALAXY_FAR_BACKGROUND_MASK_MAX_INNER_NDC = 0.32;
export const GALAXY_FAR_BACKGROUND_MASK_FEATHER_NDC = 0.12;
export const GALAXY_FAR_BACKGROUND_MASK_VIEWPORT_MARGIN_NDC = 0.1;

export type GalaxyFarBackgroundTransitionMode = "retreat" | "crossfade";
export type GalaxyFarBackgroundVector = [number, number, number];

export type GalaxyFarBackgroundHotspotInput = {
  id: string;
  field: string;
  topicId: number;
  x: number;
  y: number;
  z: number;
  color: string;
  size: number;
};

export type GalaxyFarBackgroundPaperInput = {
  rawPaperId: string;
  scopedPaperId: string;
  field: string;
  topicId: number;
  x: number;
  y: number;
  z: number;
  color: string;
  size: number;
};

export type GalaxyFarBackgroundPaperPlan = {
  paperId: string;
  color: string;
  size: number;
  localOffset: GalaxyFarBackgroundVector;
};

export type GalaxyFarBackgroundHotspotPlan = {
  hotspotId: string;
  topicKey: string;
  color: string;
  sourceSize: number;
  startCenter: GalaxyFarBackgroundVector;
  targetCenter: GalaxyFarBackgroundVector;
  startRadius: number;
  targetRadius: number;
  p95Radius: number;
  overlapRatio: number;
  transitionMode: GalaxyFarBackgroundTransitionMode;
  directionSeparationDegrees: number;
  breathingPeriodSeconds: number;
  breathPhase: number;
  papers: GalaxyFarBackgroundPaperPlan[];
};

export type GalaxyFarBackgroundPlan = {
  selectedHotspotId: string;
  selectedP95Radius: number;
  hotspots: GalaxyFarBackgroundHotspotPlan[];
  retreatHotspotCount: number;
  crossfadeHotspotCount: number;
  paperSampleCount: number;
  nearestTargetRadius: number;
  farthestTargetRadius: number;
  maximumLocalOffsetError: number;
};

export type GalaxyFarBackgroundTransitionState = {
  centerProgress: number;
  revealProgress: number;
};

export type GalaxyFarBackgroundMask = {
  innerRadiusNdc: number;
  outerRadiusNdc: number;
};

function clampUnit(value: number) {
  return Math.min(1, Math.max(0, value));
}

function smoothUnit(value: number) {
  const clamped = clampUnit(value);
  return clamped * clamped * (3 - 2 * clamped);
}

function smoothRange(start: number, end: number, value: number) {
  return smoothUnit((value - start) / Math.max(1e-9, end - start));
}

export function galaxyFarBackgroundStableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function hashUnit(value: string) {
  return galaxyFarBackgroundStableHash(value) / 4294967295;
}

function topicKey(item: Pick<GalaxyFarBackgroundHotspotInput, "field" | "topicId">) {
  return `${item.field}_${item.topicId}`;
}

function vectorLength(vector: GalaxyFarBackgroundVector) {
  return Math.hypot(vector[0], vector[1], vector[2]);
}

function subtract(
  first: Pick<GalaxyFarBackgroundHotspotInput, "x" | "y" | "z">,
  second: Pick<GalaxyFarBackgroundHotspotInput, "x" | "y" | "z">,
  scale: number,
): GalaxyFarBackgroundVector {
  return [
    (first.x - second.x) * scale,
    (first.y - second.y) * scale,
    (first.z - second.z) * scale,
  ];
}

function normalize(vector: GalaxyFarBackgroundVector): GalaxyFarBackgroundVector {
  const length = vectorLength(vector);
  if (length <= 1e-12) return [1, 0, 0];
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function deterministicDirection(key: string): GalaxyFarBackgroundVector {
  const longitude = hashUnit(`${key}:longitude`) * Math.PI * 2;
  const z = hashUnit(`${key}:latitude`) * 2 - 1;
  const radius = Math.sqrt(Math.max(0, 1 - z * z));
  return [Math.cos(longitude) * radius, Math.sin(longitude) * radius, z];
}

function cross(first: GalaxyFarBackgroundVector, second: GalaxyFarBackgroundVector): GalaxyFarBackgroundVector {
  return [
    first[1] * second[2] - first[2] * second[1],
    first[2] * second[0] - first[0] * second[2],
    first[0] * second[1] - first[1] * second[0],
  ];
}

function dot(first: GalaxyFarBackgroundVector, second: GalaxyFarBackgroundVector) {
  return first[0] * second[0] + first[1] * second[1] + first[2] * second[2];
}

function rotateAroundAxis(
  direction: GalaxyFarBackgroundVector,
  axis: GalaxyFarBackgroundVector,
  angle: number,
): GalaxyFarBackgroundVector {
  const normalizedAxis = normalize(axis);
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const axisCrossDirection = cross(normalizedAxis, direction);
  const axisDotDirection = dot(normalizedAxis, direction);
  return normalize([
    direction[0] * cosine
      + axisCrossDirection[0] * sine
      + normalizedAxis[0] * axisDotDirection * (1 - cosine),
    direction[1] * cosine
      + axisCrossDirection[1] * sine
      + normalizedAxis[1] * axisDotDirection * (1 - cosine),
    direction[2] * cosine
      + axisCrossDirection[2] * sine
      + normalizedAxis[2] * axisDotDirection * (1 - cosine),
  ]);
}

function p95(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((first, second) => first - second);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * 0.95) - 1))];
}

export function resolveGalaxyFarBackgroundTransition(
  progress: number,
  mode: GalaxyFarBackgroundTransitionMode,
): GalaxyFarBackgroundTransitionState {
  if (mode === "crossfade") {
    return {
      centerProgress: 1,
      revealProgress: smoothRange(
        GALAXY_FAR_BACKGROUND_TAKEOVER_END,
        GALAXY_FAR_BACKGROUND_RETREAT_END,
        progress,
      ),
    };
  }
  return {
    centerProgress: smoothRange(
      GALAXY_FAR_BACKGROUND_TAKEOVER_END,
      GALAXY_FAR_BACKGROUND_RETREAT_END,
      progress,
    ),
    revealProgress: smoothRange(
      GALAXY_FAR_BACKGROUND_TAKEOVER_START,
      GALAXY_FAR_BACKGROUND_TAKEOVER_END,
      progress,
    ),
  };
}

export function resolveGalaxyFarBackgroundMask(projectedP95RadiusNdc: number): GalaxyFarBackgroundMask {
  const innerRadiusNdc = Math.min(
    GALAXY_FAR_BACKGROUND_MASK_MAX_INNER_NDC,
    Math.max(
      GALAXY_FAR_BACKGROUND_MASK_MIN_INNER_NDC,
      projectedP95RadiusNdc + GALAXY_FAR_BACKGROUND_MASK_VIEWPORT_MARGIN_NDC,
    ),
  );
  return {
    innerRadiusNdc,
    outerRadiusNdc: innerRadiusNdc + GALAXY_FAR_BACKGROUND_MASK_FEATHER_NDC,
  };
}

export function buildGalaxyFarBackgroundPlan(
  hotspots: GalaxyFarBackgroundHotspotInput[],
  papers: GalaxyFarBackgroundPaperInput[],
  selectedHotspotId: string,
  coordinateScale: number,
): GalaxyFarBackgroundPlan {
  const selected = hotspots.find((hotspot) => hotspot.id === selectedHotspotId);
  if (!selected) {
    return {
      selectedHotspotId,
      selectedP95Radius: 0,
      hotspots: [],
      retreatHotspotCount: 0,
      crossfadeHotspotCount: 0,
      paperSampleCount: 0,
      nearestTargetRadius: 0,
      farthestTargetRadius: 0,
      maximumLocalOffsetError: 0,
    };
  }

  const safeScale = Math.max(1e-12, Math.abs(coordinateScale));
  const hotspotByTopic = new Map(hotspots.map((hotspot) => [topicKey(hotspot), hotspot]));
  const papersByTopic = new Map<string, GalaxyFarBackgroundPaperInput[]>();
  papers.forEach((paper) => {
    const key = topicKey(paper);
    if (!hotspotByTopic.has(key)) return;
    const rows = papersByTopic.get(key) ?? [];
    rows.push(paper);
    papersByTopic.set(key, rows);
  });

  const radiusByTopic = new Map<string, number>();
  hotspots.forEach((hotspot) => {
    const radii = (papersByTopic.get(topicKey(hotspot)) ?? []).map((paper) => (
      Math.hypot(paper.x - hotspot.x, paper.y - hotspot.y, paper.z - hotspot.z) * safeScale
    ));
    radiusByTopic.set(topicKey(hotspot), p95(radii));
  });
  const selectedP95Radius = radiusByTopic.get(topicKey(selected)) ?? 0;

  let maximumLocalOffsetError = 0;
  const plans = hotspots
    .filter((hotspot) => hotspot.id !== selectedHotspotId)
    .map((hotspot): GalaxyFarBackgroundHotspotPlan => {
      const key = topicKey(hotspot);
      const startCenter = subtract(hotspot, selected, safeScale);
      const startRadius = vectorLength(startCenter);
      const targetP95Radius = radiusByTopic.get(key) ?? 0;
      const overlapDenominator = selectedP95Radius + targetP95Radius;
      const overlapRatio = overlapDenominator > 1e-12
        ? startRadius / overlapDenominator
        : Number.POSITIVE_INFINITY;
      const transitionMode: GalaxyFarBackgroundTransitionMode = overlapRatio <= GALAXY_FAR_BACKGROUND_INTERWEAVE_THRESHOLD
        ? "crossfade"
        : "retreat";

      let direction = startRadius > 1e-12
        ? normalize(startCenter)
        : deterministicDirection(`${hotspot.id}:coincident-direction`);
      let directionSeparationDegrees = 0;
      const nearlyCoincident = startRadius <= Math.max(0.25, overlapDenominator * 0.05);
      if (nearlyCoincident) {
        directionSeparationDegrees = 4
          + hashUnit(`${hotspot.id}:direction-separation`)
            * (GALAXY_FAR_BACKGROUND_MAX_DIRECTION_SEPARATION_DEGREES - 4);
        const reference = deterministicDirection(`${hotspot.id}:direction-axis`);
        let axis = cross(direction, reference);
        if (vectorLength(axis) <= 1e-9) axis = cross(direction, [0, 0, 1]);
        if (vectorLength(axis) <= 1e-9) axis = [0, 1, 0];
        direction = rotateAroundAxis(
          direction,
          axis,
          directionSeparationDegrees * Math.PI / 180,
        );
      }

      const deterministicRadius = GALAXY_FAR_BACKGROUND_MIN_RADIUS
        + hashUnit(`${hotspot.id}:far-radius`)
          * (GALAXY_FAR_BACKGROUND_MAX_RADIUS - GALAXY_FAR_BACKGROUND_MIN_RADIUS);
      const targetRadius = Math.min(
        GALAXY_FAR_BACKGROUND_MAX_RADIUS,
        Math.max(deterministicRadius, startRadius + 1),
      );
      const targetCenter: GalaxyFarBackgroundVector = [
        direction[0] * targetRadius,
        direction[1] * targetRadius,
        direction[2] * targetRadius,
      ];
      const paperPlans = (papersByTopic.get(key) ?? [])
        .map((paper) => ({
          paper,
          paperId: paper.scopedPaperId || paper.rawPaperId,
          hash: galaxyFarBackgroundStableHash(
            `${hotspot.id}:${paper.scopedPaperId || paper.rawPaperId}:far-paper`,
          ),
        }))
        .filter((item) => Boolean(item.paperId))
        .sort((first, second) => first.hash - second.hash || first.paperId.localeCompare(second.paperId))
        .slice(0, GALAXY_FAR_BACKGROUND_MAX_PAPERS_PER_HOTSPOT)
        .map(({ paper, paperId }): GalaxyFarBackgroundPaperPlan => {
          const localOffset: GalaxyFarBackgroundVector = [
            (paper.x - hotspot.x) * safeScale,
            (paper.y - hotspot.y) * safeScale,
            (paper.z - hotspot.z) * safeScale,
          ];
          const reconstructedStart: GalaxyFarBackgroundVector = [
            startCenter[0] + localOffset[0],
            startCenter[1] + localOffset[1],
            startCenter[2] + localOffset[2],
          ];
          const directStart = subtract(paper, selected, safeScale);
          maximumLocalOffsetError = Math.max(
            maximumLocalOffsetError,
            Math.hypot(
              reconstructedStart[0] - directStart[0],
              reconstructedStart[1] - directStart[1],
              reconstructedStart[2] - directStart[2],
            ),
          );
          return {
            paperId,
            color: paper.color || hotspot.color,
            size: paper.size,
            localOffset,
          };
        });

      const breathingPeriodSeconds = 12 + hashUnit(`${hotspot.id}:far-breath-period`) * 6;
      return {
        hotspotId: hotspot.id,
        topicKey: key,
        color: hotspot.color,
        sourceSize: hotspot.size,
        startCenter,
        targetCenter,
        startRadius,
        targetRadius,
        p95Radius: targetP95Radius,
        overlapRatio,
        transitionMode,
        directionSeparationDegrees,
        breathingPeriodSeconds,
        breathPhase: hashUnit(`${hotspot.id}:far-breath-phase`) * Math.PI * 2,
        papers: paperPlans,
      };
    });

  const targetRadii = plans.map((plan) => plan.targetRadius);
  return {
    selectedHotspotId,
    selectedP95Radius,
    hotspots: plans,
    retreatHotspotCount: plans.filter((plan) => plan.transitionMode === "retreat").length,
    crossfadeHotspotCount: plans.filter((plan) => plan.transitionMode === "crossfade").length,
    paperSampleCount: plans.reduce((total, plan) => total + plan.papers.length, 0),
    nearestTargetRadius: targetRadii.length > 0 ? Math.min(...targetRadii) : 0,
    farthestTargetRadius: targetRadii.length > 0 ? Math.max(...targetRadii) : 0,
    maximumLocalOffsetError,
  };
}
