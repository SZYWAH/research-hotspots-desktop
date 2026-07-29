import type { App17GalaxyPayload } from "../types";

export const AGENT_THEORY_DEPTH_PROFILE_VERSION = "agent-theory-depth-v1" as const;
export const AGENT_THEORY_DECORATIVE_LAYER_VERSION = "agent-theory-deep-field-v1";
export const AGENT_THEORY_TARGET_AXIS_RATIO = 0.26;
export const AGENT_THEORY_MAX_DEPTH_SCALE = 2.2;

export type AgentTheoryDepthProfileV1 = {
  version: typeof AGENT_THEORY_DEPTH_PROFILE_VERSION;
  rawAxisStd: [number, number, number];
  rawDepthRatio: number;
  depthScale: number;
  centerZ: number;
  decorativeLayerVersion: string;
};

export type AgentTheoryAmbientCameraState = {
  active: boolean;
  azimuthOffsetDegrees: number;
  elevationOffsetDegrees: number;
  distanceOffsetRatio: number;
  pausedReason?: "explore" | "interaction" | "hidden" | "reduced-motion";
};

export type AgentTheoryDepthStyle = {
  sizeMultiplier: number;
  alphaMultiplier: number;
  semanticChroma: number;
};

export type AgentTheoryDecorativePoint = {
  position: [number, number, number];
  color: string;
  size: number;
  alpha: number;
  kind: "star" | "dust";
  depthBand: "near" | "middle" | "far";
};

export function createAgentTheoryDepthProfile(
  payload: Pick<App17GalaxyPayload, "papers" | "hotspots">,
): AgentTheoryDepthProfileV1 {
  const source = payload.papers.length > 0 ? payload.papers : payload.hotspots;
  const xs = source.map((point) => point.x).filter(Number.isFinite);
  const ys = source.map((point) => point.y).filter(Number.isFinite);
  const zs = source.map((point) => point.z).filter(Number.isFinite);
  const rawAxisStd: [number, number, number] = [
    populationStandardDeviation(xs),
    populationStandardDeviation(ys),
    populationStandardDeviation(zs),
  ];
  const planarStd = Math.max(1e-9, (rawAxisStd[0] + rawAxisStd[1]) * 0.5);
  const rawDepthRatio = rawAxisStd[2] / planarStd;
  const depthScale = clamp(
    AGENT_THEORY_TARGET_AXIS_RATIO / Math.max(rawDepthRatio, 0.01),
    1,
    AGENT_THEORY_MAX_DEPTH_SCALE,
  );
  return {
    version: AGENT_THEORY_DEPTH_PROFILE_VERSION,
    rawAxisStd,
    rawDepthRatio,
    depthScale,
    centerZ: median(zs),
    decorativeLayerVersion: AGENT_THEORY_DECORATIVE_LAYER_VERSION,
  };
}

export function applyAgentTheoryDepthProfile(
  payload: App17GalaxyPayload,
  profile: AgentTheoryDepthProfileV1,
): App17GalaxyPayload {
  const enhanceZ = (z: number) => (
    profile.centerZ + (z - profile.centerZ) * profile.depthScale
  );
  return {
    ...payload,
    papers: payload.papers.map((paper) => ({
      ...paper,
      z: enhanceZ(paper.z),
    })),
    hotspots: payload.hotspots.map((hotspot) => ({
      ...hotspot,
      z: enhanceZ(hotspot.z),
    })),
  };
}

export function sampleAgentTheoryAmbientCamera(
  elapsedSeconds: number,
  blend = 1,
): AgentTheoryAmbientCameraState {
  const boundedBlend = smootherstep(clamp(blend, 0, 1));
  const phase = (period: number, offset = 0) => (
    elapsedSeconds * Math.PI * 2 / period + offset
  );
  const eightSecondWindowCenterPhase = (period: number) => (
    -4 * Math.PI * 2 / period
  );
  const azimuthWave = (
    Math.sin(phase(79, eightSecondWindowCenterPhase(79))) * 0.52
    + Math.sin(phase(113, eightSecondWindowCenterPhase(113))) * 0.31
    + Math.sin(phase(157, eightSecondWindowCenterPhase(157))) * 0.17
  );
  const elevationWave = (
    Math.sin(phase(113, eightSecondWindowCenterPhase(113))) * 0.58
    + Math.sin(phase(157, eightSecondWindowCenterPhase(157))) * 0.27
    + Math.sin(phase(79, eightSecondWindowCenterPhase(79))) * 0.15
  );
  const distanceWave = (
    Math.sin(phase(157, eightSecondWindowCenterPhase(157))) * 0.61
    + Math.sin(phase(113, eightSecondWindowCenterPhase(113))) * 0.24
    + Math.sin(phase(79, eightSecondWindowCenterPhase(79))) * 0.15
  );
  const shapeWave = (value: number) => (
    Math.tanh(value * 2.2) / Math.tanh(2.2)
  );
  return {
    active: boundedBlend > 1e-6,
    azimuthOffsetDegrees: shapeWave(azimuthWave) * 1.2 * boundedBlend,
    elevationOffsetDegrees: shapeWave(elevationWave) * 0.6 * boundedBlend,
    distanceOffsetRatio: shapeWave(distanceWave) * 0.008 * boundedBlend,
  };
}

export function resolveAgentTheoryDepthStyle(
  normalizedDepth: number,
): AgentTheoryDepthStyle {
  const depth = clamp(normalizedDepth, 0, 1);
  const nearToMiddle = smootherstep(clamp(depth / 0.52, 0, 1));
  const middleToFar = smootherstep(clamp((depth - 0.48) / 0.52, 0, 1));
  return {
    sizeMultiplier: lerp(
      lerp(1.42, 1, nearToMiddle),
      0.62,
      middleToFar,
    ),
    alphaMultiplier: lerp(1.29, 0.56, smootherstep(depth)),
    semanticChroma: lerp(0.52, 0.78, 1 - depth),
  };
}

export function createAgentTheoryDecorativePlan({
  snapshotId,
  layerVersion,
  quality,
  center,
  baseRadius,
}: {
  snapshotId: string;
  layerVersion: string;
  quality: "balanced" | "high";
  center: readonly [number, number, number];
  baseRadius: number;
}): {
  starCount: number;
  dustCount: number;
  points: AgentTheoryDecorativePoint[];
} {
  const starCount = quality === "high" ? 800 : 500;
  const dustCount = quality === "high" ? 1_600 : 1_000;
  const random = createAgentTheoryRandom(stableAgentTheoryHash(
    `${snapshotId || "unknown"}:${layerVersion}:${quality}`,
  ));
  const layerBounds = [
    { name: "near" as const, minimum: 0.95, maximum: 1.65, cumulative: 0.20 },
    { name: "middle" as const, minimum: 1.65, maximum: 2.85, cumulative: 0.55 },
    { name: "far" as const, minimum: 2.85, maximum: 5.20, cumulative: 1 },
  ];
  const points: AgentTheoryDecorativePoint[] = [];
  const count = starCount + dustCount;
  for (let index = 0; index < count; index += 1) {
    const isStar = index < starCount;
    const layerPick = random();
    const layer = layerBounds.find((candidate) => (
      layerPick < candidate.cumulative
    )) ?? layerBounds.at(-1)!;
    const radius = Math.max(0.8, baseRadius)
      * lerp(layer.minimum, layer.maximum, random());
    const z = random() * 2 - 1;
    const longitude = random() * Math.PI * 2;
    const radial = Math.sqrt(Math.max(0, 1 - z * z));
    const tint = random();
    points.push({
      position: [
        center[0] + Math.cos(longitude) * radial * radius,
        center[1] + Math.sin(longitude) * radial * radius,
        center[2] + z * radius * 0.78,
      ],
      color: tint < 0.78 ? "#d8dee8" : tint < 0.94 ? "#c4d0df" : "#ddd8cf",
      size: isStar
        ? lerp(0.6, 1.4, Math.pow(random(), 1.2))
        : lerp(0.55, 1.05, random()),
      alpha: isStar
        ? lerp(0.08, 0.22, Math.pow(random(), 1.35))
        : lerp(0.018, 0.065, Math.pow(random(), 1.8)),
      kind: isStar ? "star" : "dust",
      depthBand: layer.name,
    });
  }
  return { starCount, dustCount, points };
}

export function stableAgentTheoryHash(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function createAgentTheoryRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function populationStandardDeviation(values: number[]) {
  if (values.length === 0) return 0;
  const average = values.reduce((total, value) => total + value, 0) / values.length;
  const variance = values.reduce(
    (total, value) => total + (value - average) ** 2,
    0,
  ) / values.length;
  return Math.sqrt(variance);
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((left, right) => left - right);
  const middle = Math.floor(sorted.length * 0.5);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) * 0.5
    : sorted[middle];
}

function smootherstep(value: number) {
  return value * value * value * (value * (value * 6 - 15) + 10);
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function lerp(start: number, end: number, amount: number) {
  return start + (end - start) * amount;
}
