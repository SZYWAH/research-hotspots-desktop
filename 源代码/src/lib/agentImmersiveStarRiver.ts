export type AgentImmersiveStyle = "star-river" | "random-field";

export const AGENT_IMMERSIVE_STAR_RIVER_VERSION = "star-river-v1";
export const AGENT_IMMERSIVE_RANDOM_FIELD_VERSION = "random-field-v1";
export const AGENT_IMMERSIVE_DUST_COUNT = 2_000;

export type AgentStarRiverBand = 0 | 1 | 2 | 3;

export type AgentStarRiverMeta = {
  band: AgentStarRiverBand;
  t: number;
  radius: number;
  phase: number;
};

export type AgentStarRiverParticleKind = "paper" | "hotspot" | "dynamic" | "dust";

export type AgentStarRiverParticle = {
  position: [number, number, number];
  meta: AgentStarRiverMeta;
};

const TAU = Math.PI * 2;

export function agentImmersiveLayoutVersion(style: AgentImmersiveStyle) {
  return style === "star-river"
    ? AGENT_IMMERSIVE_STAR_RIVER_VERSION
    : AGENT_IMMERSIVE_RANDOM_FIELD_VERSION;
}

export function fnv1a32(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function normalize(vector: [number, number, number]): [number, number, number] {
  const length = Math.hypot(vector[0], vector[1], vector[2]) || 1;
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function cross(
  left: [number, number, number],
  right: [number, number, number],
): [number, number, number] {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function addScaled(
  base: [number, number, number],
  first: [number, number, number],
  firstScale: number,
  second: [number, number, number],
  secondScale: number,
): [number, number, number] {
  return [
    base[0] + first[0] * firstScale + second[0] * secondScale,
    base[1] + first[1] * firstScale + second[1] * secondScale,
    base[2] + first[2] * firstScale + second[2] * secondScale,
  ];
}

export function sampleAgentStarRiverSpine(
  band: Exclude<AgentStarRiverBand, 3>,
  sourceT: number,
  seedPhase: number,
) {
  const t = clamp(sourceT, 0, 1);
  const bendA = Math.sin(Math.PI * t + seedPhase * 0.17);
  const bendB = Math.sin(Math.PI * 3 * t + seedPhase * 0.29);
  if (band === 1) {
    return [
      -29 + t * 52,
      -11 + t * 22 + bendA * 4.2 - bendB * 1.1,
      -18 + t * 12 + Math.sin(TAU * t + seedPhase * 0.21) * 3.4,
    ] as [number, number, number];
  }
  if (band === 2) {
    return [
      -18 + t * 48,
      -13 + t * 21 - bendA * 4.8 + bendB * 1.25,
      -9 - t * 7 + Math.sin(TAU * t + seedPhase * 0.31) * 3.8,
    ] as [number, number, number];
  }
  return [
    -31 + t * 61,
    -13 + t * 27 + bendA * 2.9 + bendB * 0.9,
    -16 + t * 13 + Math.sin(TAU * t + seedPhase * 0.13) * 3.1,
  ] as [number, number, number];
}

export function sampleAgentStarRiverFrame(
  band: Exclude<AgentStarRiverBand, 3>,
  t: number,
  seedPhase: number,
) {
  const epsilon = 0.0025;
  const before = sampleAgentStarRiverSpine(band, t - epsilon, seedPhase);
  const after = sampleAgentStarRiverSpine(band, t + epsilon, seedPhase);
  const tangent = normalize([
    after[0] - before[0],
    after[1] - before[1],
    after[2] - before[2],
  ]);
  const reference: [number, number, number] = Math.abs(tangent[2]) > 0.91
    ? [0, 1, 0]
    : [0, 0, 1];
  const normal = normalize(cross(reference, tangent));
  const binormal = normalize(cross(tangent, normal));
  return { tangent, normal, binormal };
}

function chooseBand(
  random: () => number,
  kind: AgentStarRiverParticleKind,
): AgentStarRiverBand {
  const bucket = random();
  if (kind === "hotspot") {
    if (bucket < 0.72) return 0;
    return bucket < 0.86 ? 1 : 2;
  }
  if (bucket < 0.72) return 0;
  if (bucket < 0.81) return 1;
  if (bucket < 0.90) return 2;
  return 3;
}

function sampleSparseOuterPosition(random: () => number): [number, number, number] {
  const radius = 18 + Math.pow(random(), 0.72) * 24;
  const theta = random() * TAU;
  const y = (random() * 2 - 1) * 15;
  return [
    Math.cos(theta) * radius,
    y,
    Math.sin(theta) * radius * 0.72 - 8,
  ];
}

export function createAgentStarRiverParticle(
  sessionSeed: string,
  entityId: string,
  kind: AgentStarRiverParticleKind,
  ordinal: number,
  totalOfKind: number,
): AgentStarRiverParticle {
  const random = mulberry32(fnv1a32(
    `${AGENT_IMMERSIVE_STAR_RIVER_VERSION}\u0000${sessionSeed}\u0000${kind}\u0000${entityId}`,
  ));
  const band = chooseBand(random, kind);
  const phase = random();
  const radius = Math.pow(random(), kind === "dust" ? 0.72 : 1.55);
  const stratifiedT = kind === "hotspot"
    ? ((ordinal + 0.35 + random() * 0.30) / Math.max(1, totalOfKind)) % 1
    : (random() * 0.94 + 0.03);
  const meta: AgentStarRiverMeta = {
    band,
    t: stratifiedT,
    radius,
    phase,
  };
  if (band === 3) {
    return { position: sampleSparseOuterPosition(random), meta };
  }
  const seedPhase = flowSeedPhase(sessionSeed);
  const spine = sampleAgentStarRiverSpine(band, stratifiedT, seedPhase);
  const { normal, binormal } = sampleAgentStarRiverFrame(band, stratifiedT, seedPhase);
  const angle = phase * TAU + random() * 0.4;
  meta.phase = (angle / TAU) % 1;
  const width = band === 0 ? 6.4 : 4.2;
  const depth = band === 0 ? 8.6 : 6.1;
  const kindScale = kind === "dust" ? 1.24 : kind === "hotspot" ? 0.86 : 1;
  return {
    position: addScaled(
      spine,
      normal,
      Math.cos(angle) * radius * width * kindScale,
      binormal,
      Math.sin(angle) * radius * depth * kindScale,
    ),
    meta,
  };
}

export function flowSeedPhase(sessionSeed: string) {
  return (
    fnv1a32(`${AGENT_IMMERSIVE_STAR_RIVER_VERSION}\u0000${sessionSeed}`)
    / 4294967296
  ) * TAU;
}

function calmScale(position: [number, number, number]) {
  const radius = Math.sqrt(
    position[0] * position[0] / 100
    + position[1] * position[1] / 30.25
    + position[2] * position[2] / 169,
  );
  const linear = clamp((radius - 0.72) / 0.48, 0, 1);
  const eased = linear * linear * (3 - 2 * linear);
  const weight = 1 - eased;
  return 1 - weight * 0.35;
}

export function sampleAgentStarRiverPosition(
  basePosition: [number, number, number],
  meta: AgentStarRiverMeta,
  kind: AgentStarRiverParticleKind,
  time: number,
  seedPhase: number,
): [number, number, number] {
  const kindScale = kind === "hotspot" ? 0.72 : kind === "dust" ? 1.25 : 1;
  if (meta.band === 3) {
    const scale = kindScale * calmScale(basePosition);
    return [
      basePosition[0] + Math.sin(time * (0.050 + meta.phase * 0.024) + meta.phase * 11.2) * 0.52 * scale,
      basePosition[1] + Math.sin(time * (0.043 + meta.radius * 0.021) + meta.phase * 7.7) * 0.34 * scale,
      basePosition[2] + Math.cos(time * (0.039 + meta.phase * 0.017) + meta.phase * 13.1) * 0.48 * scale,
    ];
  }
  const endEase = Math.sin(Math.PI * clamp(meta.t, 0.02, 0.98));
  const longitudinal = endEase * kindScale * (
    Math.sin(time * (0.058 + meta.phase * 0.026) + meta.phase * TAU) * 0.027
    + Math.sin(time * (0.032 + meta.radius * 0.018) + meta.phase * 11.3) * 0.012
  );
  const t = clamp(meta.t + longitudinal, 0.012, 0.988);
  const spine = sampleAgentStarRiverSpine(meta.band, t, seedPhase);
  const { normal, binormal } = sampleAgentStarRiverFrame(meta.band, t, seedPhase);
  const width = meta.band === 0 ? 6.4 : 4.2;
  const depth = meta.band === 0 ? 8.6 : 6.1;
  const radialScale = kind === "dust" ? 1.24 : kind === "hotspot" ? 0.86 : 1;
  const angle = meta.phase * TAU
    + Math.sin(time * (0.022 + meta.phase * 0.012) + meta.phase * 5.9) * 0.22 * kindScale;
  const curl = kindScale * (0.22 + meta.radius * 0.18);
  const target = addScaled(
    spine,
    normal,
    Math.cos(angle) * meta.radius * width * radialScale,
    binormal,
    Math.sin(angle) * meta.radius * depth * radialScale,
  );
  const rawTarget: [number, number, number] = [
    target[0] + Math.sin(time * (0.15 + meta.phase * 0.08) + meta.phase * 17.0) * curl,
    target[1] + Math.sin(time * (0.13 + meta.radius * 0.07) + meta.phase * 13.0) * curl * 0.72,
    target[2] + Math.cos(time * (0.14 + meta.phase * 0.075) + meta.phase * 19.0) * curl,
  ];
  const calm = calmScale(basePosition);
  return [
    basePosition[0] + (rawTarget[0] - basePosition[0]) * calm,
    basePosition[1] + (rawTarget[1] - basePosition[1]) * calm,
    basePosition[2] + (rawTarget[2] - basePosition[2]) * calm,
  ];
}

export function sampleAgentStarRiverVelocity(
  currentPosition: [number, number, number],
  basePosition: [number, number, number],
  meta: AgentStarRiverMeta,
  kind: AgentStarRiverParticleKind,
  time: number,
  seedPhase: number,
) {
  const delta = 1 / 60;
  const currentTarget = sampleAgentStarRiverPosition(
    basePosition,
    meta,
    kind,
    time,
    seedPhase,
  );
  const nextTarget = sampleAgentStarRiverPosition(
    basePosition,
    meta,
    kind,
    time + delta,
    seedPhase,
  );
  const spring = kind === "dust" ? 0.24 : 0.18;
  return [
    (nextTarget[0] - currentTarget[0]) / delta
      + (currentTarget[0] - currentPosition[0]) * spring,
    (nextTarget[1] - currentTarget[1]) / delta
      + (currentTarget[1] - currentPosition[1]) * spring,
    (nextTarget[2] - currentTarget[2]) / delta
      + (currentTarget[2] - currentPosition[2]) * spring,
  ] as [number, number, number];
}
