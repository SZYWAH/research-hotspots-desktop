import { useEffect, useRef } from "react";
import * as THREE from "three";
import type {
  AgentImmersiveBackgroundPayloadV2,
  AgentImmersiveBackgroundPaperV2,
} from "../types";
import {
  AGENT_DUAL_FOCUS_DYNAMIC_SLOTS,
  sampleAgentDualFocusTimeline,
  type AgentDualFocusPresentation,
  type AgentDualFocusRuntimeSnapshot,
} from "../lib/agentDualFocus";
import { sampleSideraFocusTimeline } from "../lib/sideraFocus";
import {
  AGENT_IMMERSIVE_DUST_COUNT,
  AGENT_IMMERSIVE_STAR_RIVER_VERSION,
  agentImmersiveLayoutVersion,
  createAgentStarRiverParticle,
  flowSeedPhase as starRiverSeedPhase,
  sampleAgentStarRiverPosition,
  sampleAgentStarRiverFrame,
  sampleAgentStarRiverSpine,
  sampleAgentStarRiverVelocity,
  type AgentImmersiveStyle,
  type AgentStarRiverMeta,
  type AgentStarRiverParticleKind,
} from "../lib/agentImmersiveStarRiver";

const FIELD_SIZE = 45;
const HOTSPOT_CORE_RADIUS = FIELD_SIZE * 0.4;
const MAX_PIXEL_RATIO = 2;
const FLOW_TEXTURE_WIDTH = 128;
const FLOW_TEXTURE_HEIGHT = 64;
const FLOW_TEXTURE_SLOTS = FLOW_TEXTURE_WIDTH * FLOW_TEXTURE_HEIGHT;
const FLOW_FIXED_STEP_SECONDS = 1 / 60;
const FLOW_MAX_STEPS_PER_FRAME = 3;
const FLOW_METRICS_WINDOW_SECONDS = 5;

export type AgentImmersiveFlowBackend = "gpgpu" | "analytic-fallback";

export type AgentImmersiveFlowCheckpointV1 = {
  sessionSeed: string;
  style?: AgentImmersiveStyle;
  layoutVersion?: string;
  stepIndex: number;
  textureWidth: number;
  textureHeight: number;
  positions: Float32Array;
  velocities: Float32Array;
  backend?: AgentImmersiveFlowBackend;
};

export type AgentImmersiveFlowMetrics = {
  backend: AgentImmersiveFlowBackend;
  textureWidth: number;
  textureHeight: number;
  stepIndex: number;
  catchupSteps: number;
  degradationReason?: string;
  displacementMedianPx?: number;
  displacementP75Px?: number;
  displacementP95Px?: number;
  visibleMovedOver3PxRatio?: number;
  globalDirectionality?: number;
  boundaryTurnCount: number;
  visibleJumpCount: number;
  checkpointRestoreErrorPx: number;
  contextLostCount: number;
  style?: AgentImmersiveStyle;
  layoutVersion?: string;
  mainBandCount?: number;
  branchCount?: number;
  outerCount?: number;
  dustCount?: number;
  nebulaRibbonCount?: number;
  localTangentAlignment?: number;
  centralCalmSpeedRatio?: number;
};

type AgentImmersiveStarfieldCanvasProps = {
  payload: AgentImmersiveBackgroundPayloadV2;
  style?: AgentImmersiveStyle;
  elapsedSeconds: number;
  initialCheckpoint?: AgentImmersiveFlowCheckpointV1;
  forceAnalyticFallback?: boolean;
  reducedMotion?: boolean;
  motionScale?: number;
  onElapsedSecondsChange?: (elapsedSeconds: number) => void;
  onCheckpoint?: (checkpoint: AgentImmersiveFlowCheckpointV1) => void;
  onMetrics?: (metrics: AgentImmersiveFlowMetrics) => void;
  focus?: AgentDualFocusPresentation | null;
  onFocusRuntime?: (snapshot: AgentDualFocusRuntimeSnapshot) => void;
  onBackendFallback?: (reason: string) => void;
  onReady?: () => void;
  onFatalError?: (message: string) => void;
};

type SpatialAttributes = {
  basePositions: Float32Array;
  sizes: Float32Array;
  types: Float32Array;
  colors: Float32Array;
  seeds: Float32Array;
  entityIds: string[];
  hotspotIds: string[];
  riverMetadata: Float32Array;
  simulationBasePositions: Float32Array;
  simulationTypes: Float32Array;
  simulationRiverMetadata: Float32Array;
  dustOffset: number;
  dustCount: number;
  dustSizes: Float32Array;
  dustSeeds: Float32Array;
  composition: {
    mainBandCount: number;
    branchCount: number;
    outerCount: number;
  };
};

type ImmersiveFocusGeometryAttributes = {
  role: THREE.BufferAttribute;
  origin: THREE.BufferAttribute;
  target: THREE.BufferAttribute;
  enabled: THREE.BufferAttribute;
  dynamic: THREE.BufferAttribute;
  color: THREE.BufferAttribute;
};

type FlowTargets = {
  positions: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget];
  velocities: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget];
  activeIndex: 0 | 1;
};

type GpgpuRuntime = {
  targets: FlowTargets;
  step: (stepIndex: number) => void;
  readState: () => { positions: Float32Array; velocities: Float32Array };
  dispose: () => void;
};

function fnv1a32(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function mutedStellarColor(source: string, kind: "paper" | "hotspot") {
  const color = new THREE.Color(source || "#d8dde3");
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  const saturation = kind === "hotspot"
    ? Math.min(0.18, hsl.s * 0.22 + 0.035)
    : Math.min(0.075, hsl.s * 0.09 + 0.014);
  const lightness = kind === "hotspot" ? 0.76 : 0.88;
  return color.setHSL(hsl.h, saturation, lightness);
}

function writeRandomPosition(
  target: Float32Array,
  index: number,
  random: () => number,
  radiusLimit: number,
) {
  const radius = random() * radiusLimit;
  const theta = random() * Math.PI * 2;
  const phi = Math.acos(2 * random() - 1);
  const offset = index * 3;
  target[offset] = radius * Math.sin(phi) * Math.cos(theta);
  target[offset + 1] = radius * Math.sin(phi) * Math.sin(theta) * 0.4;
  target[offset + 2] = radius * Math.cos(phi);
}

function writeRiverMeta(
  target: Float32Array,
  index: number,
  meta: AgentStarRiverMeta,
) {
  const offset = index * 4;
  target[offset] = meta.band;
  target[offset + 1] = meta.t;
  target[offset + 2] = meta.radius;
  target[offset + 3] = meta.phase;
}

function particleKindFromType(type: number): AgentStarRiverParticleKind {
  if (type > 1.5) return "dust";
  if (type > 0.5) return "hotspot";
  return "paper";
}

function readRiverMeta(source: Float32Array, index: number): AgentStarRiverMeta {
  const offset = index * 4;
  return {
    band: Math.max(0, Math.min(3, Math.round(source[offset]))) as AgentStarRiverMeta["band"],
    t: source[offset + 1],
    radius: source[offset + 2],
    phase: source[offset + 3],
  };
}

function buildSpatialAttributes(
  payload: AgentImmersiveBackgroundPayloadV2,
  style: AgentImmersiveStyle,
): SpatialAttributes {
  const total = (
    payload.hotspots.length
    + payload.papers.length
    + AGENT_DUAL_FOCUS_DYNAMIC_SLOTS
  );
  const basePositions = new Float32Array(total * 3);
  const sizes = new Float32Array(total);
  const types = new Float32Array(total);
  const colors = new Float32Array(total * 3);
  const seeds = new Float32Array(total);
  const entityIds = new Array<string>(total);
  const hotspotIds = new Array<string>(total).fill("");
  const riverMetadata = new Float32Array(total * 4);
  const composition = { mainBandCount: 0, branchCount: 0, outerCount: 0 };

  const assignPosition = (
    index: number,
    entityId: string,
    kind: AgentStarRiverParticleKind,
    ordinal: number,
    totalOfKind: number,
    random: () => number,
    randomRadius: number,
  ) => {
    if (style === "star-river") {
      const particle = createAgentStarRiverParticle(
        payload.sessionSeed,
        entityId,
        kind,
        ordinal,
        totalOfKind,
      );
      basePositions.set(particle.position, index * 3);
      writeRiverMeta(riverMetadata, index, particle.meta);
      if (kind !== "dynamic") {
        if (particle.meta.band === 0) composition.mainBandCount += 1;
        else if (particle.meta.band === 3) composition.outerCount += 1;
        else composition.branchCount += 1;
      }
      return;
    }
    writeRandomPosition(basePositions, index, random, randomRadius);
  };

  payload.hotspots.forEach((hotspot, index) => {
    const random = mulberry32(fnv1a32(`${payload.sessionSeed}\u0000hotspot\u0000${hotspot.id}`));
    assignPosition(
      index,
      hotspot.id,
      "hotspot",
      index,
      payload.hotspots.length,
      random,
      HOTSPOT_CORE_RADIUS,
    );
    sizes[index] = 2.25 + random() * 1.15;
    types[index] = 1;
    seeds[index] = random();
    const color = mutedStellarColor(hotspot.color, "hotspot");
    color.toArray(colors, index * 3);
    entityIds[index] = hotspot.id;
    hotspotIds[index] = hotspot.id;
  });

  payload.papers.forEach((paper, paperIndex) => {
    const index = payload.hotspots.length + paperIndex;
    const random = mulberry32(fnv1a32(`${payload.sessionSeed}\u0000paper\u0000${paper.id}`));
    assignPosition(
      index,
      paper.id,
      "paper",
      paperIndex,
      payload.papers.length,
      random,
      FIELD_SIZE,
    );
    sizes[index] = 1.05 + random() * 0.65;
    types[index] = 0;
    seeds[index] = random();
    const color = mutedStellarColor(paper.color, "paper");
    color.toArray(colors, index * 3);
    entityIds[index] = paper.id;
    hotspotIds[index] = paper.hotspotId;
  });

  const dynamicOffset = payload.hotspots.length + payload.papers.length;
  for (let slot = 0; slot < AGENT_DUAL_FOCUS_DYNAMIC_SLOTS; slot += 1) {
    const index = dynamicOffset + slot;
    const random = mulberry32(
      fnv1a32(`${payload.sessionSeed}\u0000dynamic-focus-slot\u0000${slot}`),
    );
    const entityId = `__agent_dynamic_focus_slot_${slot}`;
    assignPosition(
      index,
      entityId,
      "dynamic",
      slot,
      AGENT_DUAL_FOCUS_DYNAMIC_SLOTS,
      random,
      FIELD_SIZE * 0.82,
    );
    sizes[index] = 1.3 + random() * 0.35;
    types[index] = 0;
    seeds[index] = random();
    const color = mutedStellarColor("#d8dde3", "paper");
    color.toArray(colors, index * 3);
    entityIds[index] = entityId;
  }

  const dustOffset = total;
  const dustCount = style === "star-river"
    ? Math.min(AGENT_IMMERSIVE_DUST_COUNT, FLOW_TEXTURE_SLOTS - total)
    : 0;
  const simulationCount = total + dustCount;
  const simulationBasePositions = new Float32Array(simulationCount * 3);
  const simulationTypes = new Float32Array(simulationCount);
  const simulationRiverMetadata = new Float32Array(simulationCount * 4);
  simulationBasePositions.set(basePositions);
  simulationTypes.set(types);
  simulationRiverMetadata.set(riverMetadata);
  const dustSizes = new Float32Array(dustCount);
  const dustSeeds = new Float32Array(dustCount);
  for (let dustIndex = 0; dustIndex < dustCount; dustIndex += 1) {
    const simulationIndex = dustOffset + dustIndex;
    const entityId = `__agent_star_river_dust_${dustIndex}`;
    const random = mulberry32(fnv1a32(`${payload.sessionSeed}\u0000${entityId}`));
    const particle = createAgentStarRiverParticle(
      payload.sessionSeed,
      entityId,
      "dust",
      dustIndex,
      dustCount,
    );
    simulationBasePositions.set(particle.position, simulationIndex * 3);
    simulationTypes[simulationIndex] = 2;
    writeRiverMeta(simulationRiverMetadata, simulationIndex, particle.meta);
    dustSizes[dustIndex] = 0.45 + random() * 0.45;
    dustSeeds[dustIndex] = random();
  }

  return {
    basePositions,
    sizes,
    types,
    colors,
    seeds,
    entityIds,
    hotspotIds,
    riverMetadata,
    simulationBasePositions,
    simulationTypes,
    simulationRiverMetadata,
    dustOffset,
    dustCount,
    dustSizes,
    dustSeeds,
    composition,
  };
}

function flowSeedPhase(sessionSeed: string) {
  return (fnv1a32(`immersive-flow-v1\u0000${sessionSeed}`) / 4294967296) * Math.PI * 2;
}

function sampleTwoLevelVelocity(
  x: number,
  y: number,
  z: number,
  type: number,
  time: number,
  seedPhase: number,
) {
  const macroX = Math.sin(y * 0.085 + time * 0.105 + seedPhase)
    + Math.cos(z * 0.064 - time * 0.082 + seedPhase * 0.37);
  const macroY = Math.sin(z * 0.078 + time * 0.074 + seedPhase * 0.71)
    - Math.cos(x * 0.058 + time * 0.066 - seedPhase * 0.29);
  const macroZ = Math.sin(x * 0.071 - time * 0.093 + seedPhase * 0.53)
    + Math.cos(y * 0.112 + time * 0.058 + seedPhase * 0.19);
  const microX = Math.cos(y * 0.39 + time * 0.27 + seedPhase * 1.13)
    - Math.sin(z * 0.31 - time * 0.33 + seedPhase * 0.83);
  const microY = Math.cos(z * 0.36 - time * 0.29 + seedPhase * 0.61)
    - Math.sin(x * 0.43 + time * 0.31 - seedPhase * 0.47);
  const microZ = Math.cos(x * 0.38 + time * 0.34 - seedPhase * 0.73)
    - Math.sin(y * 0.40 - time * 0.27 + seedPhase * 0.41);

  const calmRadius = Math.sqrt(
    (x * x) / (10 * 10)
    + (y * y) / (5.5 * 5.5)
    + (z * z) / (13 * 13),
  );
  const calmWeight = Math.max(0, Math.min(1, (1 - calmRadius) / 0.65));
  const calmScale = 1 - calmWeight * 0.30;
  const typeScale = type > 0.5 ? 0.72 : 1;

  const normalizedX = Math.abs(x) / 45;
  const normalizedY = Math.abs(y) / 18;
  const normalizedZ = Math.abs(z) / 45;
  const edge = Math.max(normalizedX, normalizedY, normalizedZ);
  const edgeWeight = edge <= 0.84
    ? 0
    : Math.min(1, (edge - 0.84) / 0.16);
  const inwardX = -Math.sign(x || 1) * edgeWeight * normalizedX * 0.16;
  const inwardY = -Math.sign(y || 1) * edgeWeight * normalizedY * 0.16;
  const inwardZ = -Math.sign(z || 1) * edgeWeight * normalizedZ * 0.16;
  const fieldScale = 1 - edgeWeight * 0.72;

  return [
    ((macroX * 0.034 + microX * 0.019) * fieldScale + inwardX) * calmScale * typeScale * 1.25,
    ((macroY * 0.026 + microY * 0.015) * fieldScale + inwardY) * calmScale * typeScale * 1.25,
    ((macroZ * 0.034 + microZ * 0.019) * fieldScale + inwardZ) * calmScale * typeScale * 1.25,
  ] as const;
}

function sampleAnalyticPosition(
  x: number,
  y: number,
  z: number,
  type: number,
  time: number,
  seedPhase: number,
) {
  const scale = type > 0.5 ? 0.72 : 1;
  const calmRadius = Math.sqrt(
    (x * x) / (10 * 10)
    + (y * y) / (5.5 * 5.5)
    + (z * z) / (13 * 13),
  );
  const calmWeight = Math.max(0, Math.min(1, (1 - calmRadius) / 0.65));
  const calmScale = 1 - calmWeight * 0.30;
  const edge = Math.max(Math.abs(x) / 45, Math.abs(y) / 18, Math.abs(z) / 45);
  const boundaryWeight = edge <= 0.84
    ? 0
    : Math.min(1, (edge - 0.84) / 0.16);
  const boundaryScale = 1 - boundaryWeight * 0.75;
  const macro = 0.78;
  const micro = 0.30;
  return [
    x + scale * calmScale * boundaryScale * (
      Math.sin(y * 0.085 + time * 0.105 + seedPhase) * macro
      + Math.sin(z * 0.31 - time * 0.33 + seedPhase * 0.83) * micro
    ),
    y + scale * calmScale * boundaryScale * (
      Math.sin(z * 0.078 + time * 0.074 + seedPhase * 0.71) * macro * 0.72
      + Math.sin(x * 0.43 + time * 0.31 - seedPhase * 0.47) * micro * 0.72
    ),
    z + scale * calmScale * boundaryScale * (
      Math.sin(x * 0.071 - time * 0.093 + seedPhase * 0.53) * macro
      + Math.sin(y * 0.40 - time * 0.27 + seedPhase * 0.41) * micro
    ),
  ] as const;
}

function checkpointIsCompatible(
  checkpoint: AgentImmersiveFlowCheckpointV1 | undefined,
  sessionSeed: string,
  style: AgentImmersiveStyle,
) {
  const expectedLength = FLOW_TEXTURE_SLOTS * 4;
  return Boolean(
    checkpoint
    && checkpoint.sessionSeed === sessionSeed
    && (
      style === "random-field"
        ? (!checkpoint.style || checkpoint.style === "random-field")
        : checkpoint.style === style
          && checkpoint.layoutVersion === agentImmersiveLayoutVersion(style)
    )
    && checkpoint.textureWidth === FLOW_TEXTURE_WIDTH
    && checkpoint.textureHeight === FLOW_TEXTURE_HEIGHT
    && checkpoint.positions.length === expectedLength
    && checkpoint.velocities.length === expectedLength,
  );
}

function buildInitialFlowState(
  attributes: SpatialAttributes,
  sessionSeed: string,
  elapsedSeconds: number,
  style: AgentImmersiveStyle,
  checkpoint?: AgentImmersiveFlowCheckpointV1,
) {
  if (checkpointIsCompatible(checkpoint, sessionSeed, style) && checkpoint) {
    return {
      positions: checkpoint.positions.slice(),
      velocities: checkpoint.velocities.slice(),
      stepIndex: Math.max(0, Math.floor(checkpoint.stepIndex)),
      restored: true,
    };
  }

  const positions = new Float32Array(FLOW_TEXTURE_SLOTS * 4);
  const velocities = new Float32Array(FLOW_TEXTURE_SLOTS * 4);
  const seedPhase = style === "star-river"
    ? starRiverSeedPhase(sessionSeed)
    : flowSeedPhase(sessionSeed);
  for (let index = 0; index < attributes.simulationTypes.length; index += 1) {
    const sourceOffset = index * 3;
    const stateOffset = index * 4;
    const basePosition = [
      attributes.simulationBasePositions[sourceOffset],
      attributes.simulationBasePositions[sourceOffset + 1],
      attributes.simulationBasePositions[sourceOffset + 2],
    ] as [number, number, number];
    const type = attributes.simulationTypes[index];
    const kind = particleKindFromType(type);
    const position = style === "star-river"
      ? sampleAgentStarRiverPosition(
        basePosition,
        readRiverMeta(attributes.simulationRiverMetadata, index),
        kind,
        elapsedSeconds,
        seedPhase,
      )
      : basePosition;
    const velocity = style === "star-river"
      ? sampleAgentStarRiverVelocity(
        [position[0], position[1], position[2]],
        basePosition,
        readRiverMeta(attributes.simulationRiverMetadata, index),
        kind,
        elapsedSeconds,
        seedPhase,
      )
      : sampleTwoLevelVelocity(
        position[0],
        position[1],
        position[2],
        type,
        elapsedSeconds,
        seedPhase,
      );
    positions[stateOffset] = position[0];
    positions[stateOffset + 1] = position[1];
    positions[stateOffset + 2] = position[2];
    positions[stateOffset + 3] = type;
    velocities[stateOffset] = velocity[0];
    velocities[stateOffset + 1] = velocity[1];
    velocities[stateOffset + 2] = velocity[2];
    velocities[stateOffset + 3] = 0;
  }
  for (let index = attributes.simulationTypes.length; index < FLOW_TEXTURE_SLOTS; index += 1) {
    positions[index * 4 + 3] = -1;
  }
  return {
    positions,
    velocities,
    stepIndex: Math.max(0, Math.round(elapsedSeconds / FLOW_FIXED_STEP_SECONDS)),
    restored: false,
  };
}

const ANALYTIC_FLOW_GLSL = `
float immersiveCalmScale(vec3 pos) {
  float radius = length(pos / vec3(10.0, 5.5, 13.0));
  float calm = 1.0 - smoothstep(0.35, 1.0, radius);
  return 1.0 - calm * 0.30;
}

vec3 immersiveAnalyticPosition(
  vec3 basePosition,
  float type,
  float time,
  float seedPhase
) {
  float typeScale = type > 0.5 ? 0.72 : 1.0;
  float calmScale = immersiveCalmScale(basePosition);
  float edge = max(
    abs(basePosition.x) / 45.0,
    max(abs(basePosition.y) / 18.0, abs(basePosition.z) / 45.0)
  );
  float boundaryScale = 1.0 - smoothstep(0.84, 1.0, edge) * 0.75;
  vec3 displacement = vec3(
    sin(basePosition.y * 0.085 + time * 0.105 + seedPhase) * 0.78
      + sin(basePosition.z * 0.31 - time * 0.33 + seedPhase * 0.83) * 0.30,
    sin(basePosition.z * 0.078 + time * 0.074 + seedPhase * 0.71) * 0.5616
      + sin(basePosition.x * 0.43 + time * 0.31 - seedPhase * 0.47) * 0.216,
    sin(basePosition.x * 0.071 - time * 0.093 + seedPhase * 0.53) * 0.78
      + sin(basePosition.y * 0.40 - time * 0.27 + seedPhase * 0.41) * 0.30
  );
  return basePosition + displacement * typeScale * calmScale * boundaryScale;
}
`;

const STAR_RIVER_FLOW_GLSL = `
const float STAR_RIVER_TAU = 6.28318530718;

vec3 immersiveStarRiverSpine(float band, float sourceT, float seedPhase) {
  float t = clamp(sourceT, 0.0, 1.0);
  float bendA = sin(3.14159265359 * t + seedPhase * 0.17);
  float bendB = sin(3.14159265359 * 3.0 * t + seedPhase * 0.29);
  if (band > 1.5) {
    return vec3(
      -18.0 + t * 48.0,
      -13.0 + t * 21.0 - bendA * 4.8 + bendB * 1.25,
      -9.0 - t * 7.0 + sin(STAR_RIVER_TAU * t + seedPhase * 0.31) * 3.8
    );
  }
  if (band > 0.5) {
    return vec3(
      -29.0 + t * 52.0,
      -11.0 + t * 22.0 + bendA * 4.2 - bendB * 1.1,
      -18.0 + t * 12.0 + sin(STAR_RIVER_TAU * t + seedPhase * 0.21) * 3.4
    );
  }
  return vec3(
    -31.0 + t * 61.0,
    -13.0 + t * 27.0 + bendA * 2.9 + bendB * 0.9,
    -16.0 + t * 13.0 + sin(STAR_RIVER_TAU * t + seedPhase * 0.13) * 3.1
  );
}

mat3 immersiveStarRiverFrame(float band, float t, float seedPhase) {
  float epsilon = 0.0025;
  vec3 tangent = normalize(
    immersiveStarRiverSpine(band, t + epsilon, seedPhase)
      - immersiveStarRiverSpine(band, t - epsilon, seedPhase)
  );
  vec3 reference = abs(tangent.z) > 0.91 ? vec3(0.0, 1.0, 0.0) : vec3(0.0, 0.0, 1.0);
  vec3 normal = normalize(cross(reference, tangent));
  vec3 binormal = normalize(cross(tangent, normal));
  return mat3(tangent, normal, binormal);
}

float immersiveStarRiverKindScale(float type) {
  return type > 1.5 ? 1.25 : type > 0.5 ? 0.72 : 1.0;
}

float immersiveStarRiverCalmScale(vec3 pos) {
  float radius = length(pos / vec3(10.0, 5.5, 13.0));
  float calm = 1.0 - smoothstep(0.72, 1.20, radius);
  return 1.0 - calm * 0.35;
}

vec3 immersiveStarRiverPosition(
  vec3 basePosition,
  vec4 meta,
  float type,
  float time,
  float seedPhase
) {
  float kindScale = immersiveStarRiverKindScale(type);
  if (meta.x > 2.5) {
    float scale = kindScale * immersiveStarRiverCalmScale(basePosition);
    return basePosition + vec3(
      sin(time * (0.050 + meta.w * 0.024) + meta.w * 11.2) * 0.52,
      sin(time * (0.043 + meta.z * 0.021) + meta.w * 7.7) * 0.34,
      cos(time * (0.039 + meta.w * 0.017) + meta.w * 13.1) * 0.48
    ) * scale;
  }
  float endEase = sin(3.14159265359 * clamp(meta.y, 0.02, 0.98));
  float longitudinal = endEase * kindScale * (
    sin(time * (0.058 + meta.w * 0.026) + meta.w * STAR_RIVER_TAU) * 0.027
      + sin(time * (0.032 + meta.z * 0.018) + meta.w * 11.3) * 0.012
  );
  float t = clamp(meta.y + longitudinal, 0.012, 0.988);
  vec3 spine = immersiveStarRiverSpine(meta.x, t, seedPhase);
  mat3 frame = immersiveStarRiverFrame(meta.x, t, seedPhase);
  vec3 normal = frame[1];
  vec3 binormal = frame[2];
  float width = meta.x < 0.5 ? 6.4 : 4.2;
  float depth = meta.x < 0.5 ? 8.6 : 6.1;
  float radialScale = type > 1.5 ? 1.24 : type > 0.5 ? 0.86 : 1.0;
  float angle = meta.w * STAR_RIVER_TAU
    + sin(time * (0.022 + meta.w * 0.012) + meta.w * 5.9) * 0.22 * kindScale;
  vec3 target = spine
    + normal * cos(angle) * meta.z * width * radialScale
    + binormal * sin(angle) * meta.z * depth * radialScale;
  float curl = kindScale * (0.22 + meta.z * 0.18);
  vec3 rawTarget = target + vec3(
    sin(time * (0.15 + meta.w * 0.08) + meta.w * 17.0) * curl,
    sin(time * (0.13 + meta.z * 0.07) + meta.w * 13.0) * curl * 0.72,
    cos(time * (0.14 + meta.w * 0.075) + meta.w * 19.0) * curl
  );
  float calm = immersiveStarRiverCalmScale(basePosition);
  return basePosition + (rawTarget - basePosition) * calm;
}
`;

const VERTEX_SHADER = `
uniform float uTime;
uniform float uPixelRatio;
uniform float uLayerScale;
uniform float uUseStateTexture;
uniform float uSeedPhase;
uniform float uStarRiver;
uniform float uFocusActive;
uniform float uFocusAcquisition;
uniform float uFocusContext;
uniform float uFocusMaterial;
uniform vec3 uFocusBend;
uniform sampler2D uPositionTexture;

attribute vec3 aBasePos;
attribute float aSize;
attribute float aType;
attribute vec3 aColor;
attribute float aSeed;
attribute vec2 aStateUv;
attribute vec4 aRiverMeta;
attribute float aFocusRole;
attribute vec3 aFocusOrigin;
attribute vec3 aFocusTarget;
attribute float aFocusEnabled;
attribute float aDynamicSlot;

varying vec3 vColor;
varying float vType;
varying float vPointSize;
varying float vBrightness;
varying float vFocusRole;
varying float vFocusBlend;

${ANALYTIC_FLOW_GLSL}
${STAR_RIVER_FLOW_GLSL}

void main() {
  vec3 pos = uUseStateTexture > 0.5
    ? texture2D(uPositionTexture, aStateUv).xyz
    : uStarRiver > 0.5
      ? immersiveStarRiverPosition(aBasePos, aRiverMeta, aType, uTime, uSeedPhase)
      : immersiveAnalyticPosition(aBasePos, aType, uTime, uSeedPhase);
  float selected = step(0.5, aFocusRole);
  vFocusRole = aFocusRole;
  vFocusBlend = uFocusMaterial * selected;
  float gatherBlend = uFocusContext * selected;
  vec3 focusOffset = aFocusTarget - aFocusOrigin;
  pos += focusOffset * gatherBlend
    + uFocusBend * sin(3.14159265 * gatherBlend) * selected;

  vec4 viewPosition = modelViewMatrix * vec4(pos, 1.0);
  float perspective = 52.0 / max(2.0, -viewPosition.z);
  float cssSize = aSize * perspective;
  if (aType > 0.5) {
    cssSize = clamp(cssSize, 2.6, 8.8);
  } else {
    cssSize = clamp(cssSize, 1.15, 5.5);
  }
  float roleSize = aFocusRole > 2.5
    ? 1.72
    : aFocusRole > 1.5
      ? 1.18
      : aFocusRole > 0.5
        ? 1.20
        : 1.0;
  cssSize = min(
    aType > 0.5 ? 8.8 : 4.8,
    cssSize * mix(1.0, roleSize, uFocusMaterial)
  );
  cssSize *= uLayerScale;

  float depthFade = smoothstep(-72.0, -8.0, viewPosition.z);
  float stableVariation = mix(0.82, 1.0, aSeed);
  float roleEnergy = aFocusRole > 2.5
    ? 1.72
    : aFocusRole > 1.5
      ? 1.22
      : aFocusRole > 0.5
        ? 1.22
        : 1.0;
  float backgroundFloor = mix(1.0, 0.43, uFocusActive * (1.0 - selected));
  float activeWeight = aDynamicSlot > 0.5
    ? aFocusEnabled * uFocusAcquisition
    : 1.0;
  vBrightness = depthFade
    * stableVariation
    * backgroundFloor
    * mix(1.0, roleEnergy, uFocusMaterial * selected)
    * activeWeight;
  vColor = aColor;
  vType = aType;
  vPointSize = cssSize;

  gl_PointSize = cssSize * uPixelRatio;
  gl_Position = projectionMatrix * viewPosition;
}
`;

const FULLSCREEN_VERTEX_SHADER = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const COPY_FRAGMENT_SHADER = `
uniform sampler2D uSource;
varying vec2 vUv;

void main() {
  gl_FragColor = texture2D(uSource, vUv);
}
`;

const VELOCITY_FRAGMENT_SHADER = `
uniform sampler2D uPositionTexture;
uniform sampler2D uVelocityTexture;
uniform float uDeltaTime;
uniform float uSimulationTime;
uniform float uSeedPhase;
uniform float uStarRiver;
uniform sampler2D uBasePositionTexture;
uniform sampler2D uRiverMetaTexture;
varying vec2 vUv;

${ANALYTIC_FLOW_GLSL}
${STAR_RIVER_FLOW_GLSL}

vec3 twoLevelVelocity(vec3 pos, float type, float time, float seedPhase) {
  vec3 macroFlow = vec3(
    sin(pos.y * 0.085 + time * 0.105 + seedPhase)
      + cos(pos.z * 0.064 - time * 0.082 + seedPhase * 0.37),
    sin(pos.z * 0.078 + time * 0.074 + seedPhase * 0.71)
      - cos(pos.x * 0.058 + time * 0.066 - seedPhase * 0.29),
    sin(pos.x * 0.071 - time * 0.093 + seedPhase * 0.53)
      + cos(pos.y * 0.112 + time * 0.058 + seedPhase * 0.19)
  ) * vec3(0.034, 0.026, 0.034);
  vec3 curlFlow = vec3(
    cos(pos.y * 0.39 + time * 0.27 + seedPhase * 1.13)
      - sin(pos.z * 0.31 - time * 0.33 + seedPhase * 0.83),
    cos(pos.z * 0.36 - time * 0.29 + seedPhase * 0.61)
      - sin(pos.x * 0.43 + time * 0.31 - seedPhase * 0.47),
    cos(pos.x * 0.38 + time * 0.34 - seedPhase * 0.73)
      - sin(pos.y * 0.40 - time * 0.27 + seedPhase * 0.41)
  ) * vec3(0.019, 0.015, 0.019);

  vec3 normalizedPosition = abs(pos) / vec3(45.0, 18.0, 45.0);
  float edge = max(normalizedPosition.x, max(normalizedPosition.y, normalizedPosition.z));
  float edgeWeight = smoothstep(0.84, 1.0, edge);
  vec3 inward = -sign(pos + vec3(0.0001))
    * normalizedPosition
    * edgeWeight
    * 0.16;
  float calmRadius = length(pos / vec3(10.0, 5.5, 13.0));
  float calmWeight = 1.0 - smoothstep(0.35, 1.0, calmRadius);
  float calmScale = 1.0 - calmWeight * 0.30;
  float typeScale = type > 0.5 ? 0.72 : 1.0;
  return ((macroFlow + curlFlow) * (1.0 - edgeWeight * 0.72) + inward)
    * calmScale
    * typeScale
    * 1.25;
}

void main() {
  vec4 positionState = texture2D(uPositionTexture, vUv);
  vec4 velocityState = texture2D(uVelocityTexture, vUv);
  if (positionState.w < -0.5) {
    gl_FragColor = vec4(0.0);
    return;
  }
  vec3 targetVelocity;
  if (uStarRiver > 0.5) {
    vec3 basePosition = texture2D(uBasePositionTexture, vUv).xyz;
    vec4 riverMeta = texture2D(uRiverMetaTexture, vUv);
    vec3 currentTarget = immersiveStarRiverPosition(
      basePosition,
      riverMeta,
      positionState.w,
      uSimulationTime,
      uSeedPhase
    );
    vec3 nextTarget = immersiveStarRiverPosition(
      basePosition,
      riverMeta,
      positionState.w,
      uSimulationTime + uDeltaTime,
      uSeedPhase
    );
    float spring = positionState.w > 1.5 ? 0.24 : 0.18;
    targetVelocity = (nextTarget - currentTarget) / uDeltaTime
      + (currentTarget - positionState.xyz) * spring;
  } else {
    targetVelocity = twoLevelVelocity(
      positionState.xyz,
      positionState.w,
      uSimulationTime,
      uSeedPhase
    );
  }
  float response = 1.0 - exp(-uDeltaTime * 1.35);
  vec3 velocity = mix(velocityState.xyz, targetVelocity, response);
  gl_FragColor = vec4(velocity, 0.0);
}
`;

const POSITION_FRAGMENT_SHADER = `
uniform sampler2D uPositionTexture;
uniform sampler2D uVelocityTexture;
uniform float uDeltaTime;
varying vec2 vUv;

void main() {
  vec4 positionState = texture2D(uPositionTexture, vUv);
  if (positionState.w < -0.5) {
    gl_FragColor = positionState;
    return;
  }
  vec3 velocity = texture2D(uVelocityTexture, vUv).xyz;
  gl_FragColor = vec4(positionState.xyz + velocity * uDeltaTime, positionState.w);
}
`;

const CORE_FRAGMENT_SHADER = `
varying vec3 vColor;
varying float vType;
varying float vPointSize;
varying float vBrightness;
varying float vFocusRole;
varying float vFocusBlend;

void main() {
  vec2 point = gl_PointCoord * 2.0 - 1.0;
  float radius = length(point);
  float aa = max(fwidth(radius), 0.012);
  float edge = 1.0 - smoothstep(0.92, 0.92 + aa, radius);
  if (edge <= 0.0 || vBrightness <= 0.002) discard;

  float tinyBlend = 1.0 - smoothstep(2.2, 3.2, vPointSize);
  float sphereZ = sqrt(max(0.0, 1.0 - radius * radius));
  vec3 normal = normalize(vec3(point, sphereZ));
  vec3 keyLight = normalize(vec3(-0.38, 0.46, 0.80));
  float diffuse = max(0.0, dot(normal, keyLight));
  float limb = pow(max(0.0, sphereZ), vType > 0.5 ? 0.42 : 0.62);
  float surface = mix(0.46 + 0.54 * diffuse, 1.0, tinyBlend) * limb;

  float coreRadius = vType > 0.5 ? 0.28 : 0.22;
  float hotCore = 1.0 - smoothstep(coreRadius, coreRadius + aa * 1.5, radius);
  float axis = min(abs(point.x), abs(point.y));
  float spike = (1.0 - smoothstep(0.018, 0.018 + aa, axis))
    * pow(max(0.0, 1.0 - radius), 5.0)
    * smoothstep(2.2, 4.4, vPointSize);
  float diamond = 1.0 - smoothstep(
    0.42,
    0.42 + aa,
    abs(point.x) + abs(point.y)
  );
  float needle = mix(diamond, hotCore, smoothstep(1.6, 2.4, vPointSize));

  vec3 whiteCore = vec3(0.99, 0.995, 1.0);
  vec3 surfaceColor = mix(vColor, whiteCore, hotCore * 0.82 + tinyBlend * 0.55);
  float intensity = (surface * 0.78 + needle * 0.88 + spike * 0.18)
    * vBrightness;
  float alpha = clamp(edge * intensity, 0.0, 1.0);
  if (alpha < 0.015) discard;
  gl_FragColor = vec4(surfaceColor * min(1.12, intensity), alpha);
}
`;

const CORONA_FRAGMENT_SHADER = `
varying vec3 vColor;
varying float vType;
varying float vPointSize;
varying float vBrightness;
varying float vFocusRole;
varying float vFocusBlend;

void main() {
  if (vPointSize < 2.2 || vBrightness <= 0.002) discard;
  vec2 point = gl_PointCoord * 2.0 - 1.0;
  float radius = length(point);
  float aa = max(fwidth(radius), 0.012);
  float shell = smoothstep(0.58, 0.78, radius)
    * (1.0 - smoothstep(0.90, 0.90 + aa, radius));
  float axis = min(abs(point.x), abs(point.y));
  float shortSpike = (1.0 - smoothstep(0.012, 0.012 + aa, axis))
    * pow(max(0.0, 1.0 - radius), 8.0);
  float angle = atan(point.y, point.x);
  float arcBand = 1.0 - smoothstep(0.032, 0.082, abs(radius - 0.61));
  float arcA = smoothstep(-0.18, 0.22, sin(angle * 1.34 + 0.7));
  float arcB = smoothstep(-0.26, 0.18, cos(angle * 1.11 - 1.3));
  float focusArc = arcBand
    * max(arcA * (1.0 - arcB), arcB * (1.0 - arcA))
    * step(2.5, vFocusRole)
    * vFocusBlend;
  float strength = vType > 0.5 ? 0.10 : 0.032;
  float alpha = (shell * strength + shortSpike * strength * 0.65)
    * vBrightness + focusArc * 0.12;
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(vColor * alpha, alpha);
}
`;

const DUST_VERTEX_SHADER = `
uniform float uTime;
uniform float uPixelRatio;
uniform float uUseStateTexture;
uniform float uSeedPhase;
uniform sampler2D uPositionTexture;

attribute vec3 aBasePos;
attribute float aSize;
attribute float aSeed;
attribute vec2 aStateUv;
attribute vec4 aRiverMeta;

varying float vDustAlpha;

${ANALYTIC_FLOW_GLSL}
${STAR_RIVER_FLOW_GLSL}

void main() {
  vec3 pos = uUseStateTexture > 0.5
    ? texture2D(uPositionTexture, aStateUv).xyz
    : immersiveStarRiverPosition(aBasePos, aRiverMeta, 2.0, uTime, uSeedPhase);
  vec4 viewPosition = modelViewMatrix * vec4(pos, 1.0);
  float perspective = clamp(42.0 / max(7.0, -viewPosition.z), 0.72, 1.18);
  float cssSize = clamp(aSize * perspective, 0.45, 0.9);
  gl_PointSize = cssSize * uPixelRatio;
  gl_Position = projectionMatrix * viewPosition;
  vDustAlpha = mix(0.03, 0.12, aSeed) * smoothstep(-76.0, -6.0, viewPosition.z);
}
`;

const DUST_FRAGMENT_SHADER = `
varying float vDustAlpha;

void main() {
  vec2 point = gl_PointCoord * 2.0 - 1.0;
  float radius = length(point);
  float aa = max(fwidth(radius), 0.04);
  float alpha = (1.0 - smoothstep(0.52, 0.52 + aa, radius)) * vDustAlpha;
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(vec3(0.56, 0.60, 0.66), alpha);
}
`;

const NEBULA_VERTEX_SHADER = `
attribute float aBand;
varying vec2 vUv;
varying float vBand;

void main() {
  vUv = uv;
  vBand = aBand;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const NEBULA_FRAGMENT_SHADER = `
uniform float uTime;
varying vec2 vUv;
varying float vBand;

float nebulaHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float nebulaNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(nebulaHash(i), nebulaHash(i + vec2(1.0, 0.0)), u.x),
    mix(nebulaHash(i + vec2(0.0, 1.0)), nebulaHash(i + vec2(1.0)), u.x),
    u.y
  );
}

void main() {
  float center = pow(max(0.0, 1.0 - abs(vUv.y * 2.0 - 1.0)), 2.6);
  vec2 driftUv = vec2(vUv.x * 12.0 - uTime * 0.006, vUv.y * 5.0 + vBand * 3.7);
  float detail = nebulaNoise(driftUv)
    * 0.62 + nebulaNoise(driftUv * 2.1 + 4.7) * 0.38;
  float wisps = smoothstep(0.42, 0.88, detail);
  float alpha = center * (0.006 + wisps * 0.038);
  if (alpha < 0.003) discard;
  vec3 color = mix(vec3(0.28, 0.32, 0.39), vec3(0.48, 0.52, 0.61), wisps);
  gl_FragColor = vec4(color, alpha);
}
`;

function createDustGeometry(attributes: SpatialAttributes) {
  const count = attributes.dustCount;
  const basePositions = attributes.simulationBasePositions.slice(
    attributes.dustOffset * 3,
    (attributes.dustOffset + count) * 3,
  );
  const riverMetadata = attributes.simulationRiverMetadata.slice(
    attributes.dustOffset * 4,
    (attributes.dustOffset + count) * 4,
  );
  const stateUvs = new Float32Array(count * 2);
  for (let dustIndex = 0; dustIndex < count; dustIndex += 1) {
    const stateIndex = attributes.dustOffset + dustIndex;
    stateUvs[dustIndex * 2] = ((stateIndex % FLOW_TEXTURE_WIDTH) + 0.5) / FLOW_TEXTURE_WIDTH;
    stateUvs[dustIndex * 2 + 1] = (
      Math.floor(stateIndex / FLOW_TEXTURE_WIDTH) + 0.5
    ) / FLOW_TEXTURE_HEIGHT;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(basePositions.slice(), 3));
  geometry.setAttribute("aBasePos", new THREE.BufferAttribute(basePositions, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(attributes.dustSizes, 1));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(attributes.dustSeeds, 1));
  geometry.setAttribute("aStateUv", new THREE.BufferAttribute(stateUvs, 2));
  geometry.setAttribute("aRiverMeta", new THREE.BufferAttribute(riverMetadata, 4));
  return geometry;
}

function createDustMaterial(pixelRatio: number, seedPhase: number) {
  return new THREE.ShaderMaterial({
    name: "agent-immersive-star-river-dust",
    vertexShader: DUST_VERTEX_SHADER,
    fragmentShader: DUST_FRAGMENT_SHADER,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: pixelRatio },
      uUseStateTexture: { value: 0 },
      uSeedPhase: { value: seedPhase },
      uPositionTexture: { value: null },
    },
  });
}

function createNebulaRibbon(seedPhase: number) {
  const segments = 96;
  const positions: number[] = [];
  const uvs: number[] = [];
  const bands: number[] = [];
  const indices: number[] = [];
  const widths = [8.8, 5.5, 5.2];
  for (let band = 0; band < 3; band += 1) {
    const vertexOffset = positions.length / 3;
    for (let segment = 0; segment <= segments; segment += 1) {
      const t = segment / segments;
      const spine = sampleAgentStarRiverSpine(
        band as 0 | 1 | 2,
        t,
        seedPhase,
      );
      const frame = sampleAgentStarRiverFrame(
        band as 0 | 1 | 2,
        t,
        seedPhase,
      );
      const width = widths[band] * (0.74 + Math.sin(Math.PI * t) * 0.26);
      for (const side of [-1, 1]) {
        positions.push(
          spine[0] + frame.normal[0] * width * side,
          spine[1] + frame.normal[1] * width * side,
          spine[2] + frame.normal[2] * width * side,
        );
        uvs.push(t, side < 0 ? 0 : 1);
        bands.push(band);
      }
    }
    for (let segment = 0; segment < segments; segment += 1) {
      const index = vertexOffset + segment * 2;
      indices.push(index, index + 1, index + 2, index + 1, index + 3, index + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("aBand", new THREE.Float32BufferAttribute(bands, 1));
  geometry.setIndex(indices);
  const material = new THREE.ShaderMaterial({
    name: "agent-immersive-star-river-nebula-ribbons",
    vertexShader: NEBULA_VERTEX_SHADER,
    fragmentShader: NEBULA_FRAGMENT_SHADER,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 } },
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 0;
  return { mesh, geometry, material };
}

function createGeometry(attributes: SpatialAttributes) {
  const stateUvs = new Float32Array(attributes.types.length * 2);
  const focusRoles = new Float32Array(attributes.types.length);
  const focusOrigins = attributes.basePositions.slice();
  const focusTargets = attributes.basePositions.slice();
  const focusEnabled = new Float32Array(attributes.types.length);
  const dynamicSlots = new Float32Array(attributes.types.length);
  const dynamicOffset = attributes.types.length - AGENT_DUAL_FOCUS_DYNAMIC_SLOTS;
  for (let index = 0; index < attributes.types.length; index += 1) {
    stateUvs[index * 2] = ((index % FLOW_TEXTURE_WIDTH) + 0.5) / FLOW_TEXTURE_WIDTH;
    stateUvs[index * 2 + 1] = (
      Math.floor(index / FLOW_TEXTURE_WIDTH) + 0.5
    ) / FLOW_TEXTURE_HEIGHT;
    const dynamic = index >= dynamicOffset;
    focusEnabled[index] = dynamic ? 0 : 1;
    dynamicSlots[index] = dynamic ? 1 : 0;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(attributes.basePositions.slice(), 3));
  geometry.setAttribute("aBasePos", new THREE.BufferAttribute(attributes.basePositions, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(attributes.sizes, 1));
  geometry.setAttribute("aType", new THREE.BufferAttribute(attributes.types, 1));
  geometry.setAttribute("aColor", new THREE.BufferAttribute(attributes.colors, 3));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(attributes.seeds, 1));
  geometry.setAttribute("aStateUv", new THREE.BufferAttribute(stateUvs, 2));
  geometry.setAttribute("aRiverMeta", new THREE.BufferAttribute(attributes.riverMetadata, 4));
  geometry.setAttribute("aFocusRole", new THREE.BufferAttribute(focusRoles, 1));
  geometry.setAttribute("aFocusOrigin", new THREE.BufferAttribute(focusOrigins, 3));
  geometry.setAttribute("aFocusTarget", new THREE.BufferAttribute(focusTargets, 3));
  geometry.setAttribute("aFocusEnabled", new THREE.BufferAttribute(focusEnabled, 1));
  geometry.setAttribute("aDynamicSlot", new THREE.BufferAttribute(dynamicSlots, 1));
  return geometry;
}

function getImmersiveFocusGeometryAttributes(
  geometry: THREE.BufferGeometry,
): ImmersiveFocusGeometryAttributes {
  return {
    role: geometry.getAttribute("aFocusRole") as THREE.BufferAttribute,
    origin: geometry.getAttribute("aFocusOrigin") as THREE.BufferAttribute,
    target: geometry.getAttribute("aFocusTarget") as THREE.BufferAttribute,
    enabled: geometry.getAttribute("aFocusEnabled") as THREE.BufferAttribute,
    dynamic: geometry.getAttribute("aDynamicSlot") as THREE.BufferAttribute,
    color: geometry.getAttribute("aColor") as THREE.BufferAttribute,
  };
}

function updateFocusMaterialUniforms(
  materials: THREE.ShaderMaterial[],
  sample: {
    acquisitionBlend: number;
    contextBlend: number;
    materialBlend: number;
    backgroundDimBlend: number;
  },
  active: boolean,
  bend: THREE.Vector3,
) {
  for (const material of materials) {
    material.uniforms.uFocusActive.value = active ? sample.backgroundDimBlend : 0;
    material.uniforms.uFocusAcquisition.value = sample.acquisitionBlend;
    material.uniforms.uFocusContext.value = sample.contextBlend;
    material.uniforms.uFocusMaterial.value = sample.materialBlend;
    (material.uniforms.uFocusBend.value as THREE.Vector3).copy(bend);
  }
}

function createMaterial(
  fragmentShader: string,
  pixelRatio: number,
  layerScale: number,
  corona: boolean,
  seedPhase: number,
  style: AgentImmersiveStyle,
) {
  return new THREE.ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader,
    transparent: true,
    depthTest: true,
    depthWrite: !corona,
    blending: corona ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: pixelRatio },
      uLayerScale: { value: layerScale },
      uUseStateTexture: { value: 0 },
      uSeedPhase: { value: seedPhase },
      uStarRiver: { value: style === "star-river" ? 1 : 0 },
      uPositionTexture: { value: null },
      uFocusActive: { value: 0 },
      uFocusAcquisition: { value: 0 },
      uFocusContext: { value: 0 },
      uFocusMaterial: { value: 0 },
      uFocusBend: { value: new THREE.Vector3() },
    },
  });
}

function createFloatStateTarget() {
  const target = new THREE.WebGLRenderTarget(
    FLOW_TEXTURE_WIDTH,
    FLOW_TEXTURE_HEIGHT,
    {
      type: THREE.FloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
    },
  );
  target.texture.name = "agent-immersive-flow-state";
  target.texture.colorSpace = THREE.NoColorSpace;
  target.texture.internalFormat = "RGBA32F";
  return target;
}

function createStateDataTexture(data: Float32Array) {
  const texture = new THREE.DataTexture(
    data,
    FLOW_TEXTURE_WIDTH,
    FLOW_TEXTURE_HEIGHT,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function packSimulationVec3Texture(
  values: Float32Array,
  types: Float32Array,
) {
  const packed = new Float32Array(FLOW_TEXTURE_SLOTS * 4);
  for (let index = 0; index < types.length; index += 1) {
    packed[index * 4] = values[index * 3];
    packed[index * 4 + 1] = values[index * 3 + 1];
    packed[index * 4 + 2] = values[index * 3 + 2];
    packed[index * 4 + 3] = types[index];
  }
  for (let index = types.length; index < FLOW_TEXTURE_SLOTS; index += 1) {
    packed[index * 4 + 3] = -1;
  }
  return packed;
}

function packSimulationMetaTexture(values: Float32Array) {
  const packed = new Float32Array(FLOW_TEXTURE_SLOTS * 4);
  packed.set(values.subarray(0, Math.min(values.length, packed.length)));
  return packed;
}

function createSimulationMaterial(
  fragmentShader: string,
  uniforms: Record<string, THREE.IUniform>,
) {
  return new THREE.ShaderMaterial({
    vertexShader: FULLSCREEN_VERTEX_SHADER,
    fragmentShader,
    uniforms,
    blending: THREE.NoBlending,
    depthTest: false,
    depthWrite: false,
    transparent: false,
    toneMapped: false,
  });
}

function percentile(sortedValues: number[], fraction: number) {
  if (!sortedValues.length) return 0;
  const index = Math.max(
    0,
    Math.min(sortedValues.length - 1, Math.round((sortedValues.length - 1) * fraction)),
  );
  return sortedValues[index];
}

function projectStateToScreen(
  state: Float32Array,
  count: number,
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number,
) {
  const output = new Float32Array(count * 3);
  const point = new THREE.Vector3();
  camera.updateMatrixWorld(true);
  for (let index = 0; index < count; index += 1) {
    const offset = index * 4;
    point.set(state[offset], state[offset + 1], state[offset + 2]).project(camera);
    output[index * 3] = (point.x * 0.5 + 0.5) * width;
    output[index * 3 + 1] = (-point.y * 0.5 + 0.5) * height;
    output[index * 3 + 2] = (
      point.z >= -1
      && point.z <= 1
      && point.x >= -1
      && point.x <= 1
      && point.y >= -1
      && point.y <= 1
    ) ? 1 : 0;
  }
  return output;
}

function calculateFiveSecondMetrics(
  startScreen: Float32Array,
  endScreen: Float32Array,
) {
  const distances: number[] = [];
  let sumX = 0;
  let sumY = 0;
  let sumEnergy = 0;
  for (let index = 0; index < startScreen.length; index += 3) {
    if (startScreen[index + 2] < 0.5 || endScreen[index + 2] < 0.5) continue;
    const dx = endScreen[index] - startScreen[index];
    const dy = endScreen[index + 1] - startScreen[index + 1];
    const distance = Math.hypot(dx, dy);
    distances.push(distance);
    sumX += dx;
    sumY += dy;
    sumEnergy += dx * dx + dy * dy;
  }
  distances.sort((left, right) => left - right);
  const count = Math.max(1, distances.length);
  const meanX = sumX / count;
  const meanY = sumY / count;
  const directionality = sumEnergy > 1e-9
    ? (count * (meanX * meanX + meanY * meanY)) / sumEnergy
    : 0;
  return {
    displacementMedianPx: percentile(distances, 0.5),
    displacementP75Px: percentile(distances, 0.75),
    displacementP95Px: percentile(distances, 0.95),
    visibleMovedOver3PxRatio: distances.filter((distance) => distance > 3).length / count,
    globalDirectionality: directionality,
  };
}

function createGpgpuRuntime(
  renderer: THREE.WebGLRenderer,
  initialPositions: Float32Array,
  initialVelocities: Float32Array,
  seedPhase: number,
  attributes: SpatialAttributes,
  style: AgentImmersiveStyle,
): GpgpuRuntime {
  const gl = renderer.getContext();
  if (!renderer.capabilities.isWebGL2) {
    throw new Error("webgl2-unavailable");
  }
  if (!gl.getExtension("EXT_color_buffer_float")) {
    throw new Error("float-framebuffer-unavailable");
  }

  const targets: FlowTargets = {
    positions: [createFloatStateTarget(), createFloatStateTarget()],
    velocities: [createFloatStateTarget(), createFloatStateTarget()],
    activeIndex: 0,
  };
  const simulationScene = new THREE.Scene();
  const simulationCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quadGeometry = new THREE.PlaneGeometry(2, 2);
  const copyMaterial = createSimulationMaterial(COPY_FRAGMENT_SHADER, {
    uSource: { value: null },
  });
  const velocityMaterial = createSimulationMaterial(VELOCITY_FRAGMENT_SHADER, {
    uPositionTexture: { value: null },
    uVelocityTexture: { value: null },
    uDeltaTime: { value: FLOW_FIXED_STEP_SECONDS },
    uSimulationTime: { value: 0 },
    uSeedPhase: { value: seedPhase },
    uStarRiver: { value: style === "star-river" ? 1 : 0 },
    uBasePositionTexture: { value: null },
    uRiverMetaTexture: { value: null },
  });
  const positionMaterial = createSimulationMaterial(POSITION_FRAGMENT_SHADER, {
    uPositionTexture: { value: null },
    uVelocityTexture: { value: null },
    uDeltaTime: { value: FLOW_FIXED_STEP_SECONDS },
  });
  const quad = new THREE.Mesh(quadGeometry, copyMaterial);
  quad.frustumCulled = false;
  simulationScene.add(quad);
  const positionTexture = createStateDataTexture(initialPositions);
  const velocityTexture = createStateDataTexture(initialVelocities);
  const basePositionTexture = createStateDataTexture(packSimulationVec3Texture(
    attributes.simulationBasePositions,
    attributes.simulationTypes,
  ));
  const riverMetaTexture = createStateDataTexture(packSimulationMetaTexture(
    attributes.simulationRiverMetadata,
  ));
  velocityMaterial.uniforms.uBasePositionTexture.value = basePositionTexture;
  velocityMaterial.uniforms.uRiverMetaTexture.value = riverMetaTexture;

  const copyTexture = (
    source: THREE.Texture,
    targetsToFill: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget],
  ) => {
    copyMaterial.uniforms.uSource.value = source;
    quad.material = copyMaterial;
    for (const target of targetsToFill) {
      renderer.setRenderTarget(target);
      renderer.render(simulationScene, simulationCamera);
    }
  };

  try {
    copyTexture(positionTexture, targets.positions);
    copyTexture(velocityTexture, targets.velocities);
    renderer.setRenderTarget(null);
    const probe = new Float32Array(4);
    renderer.readRenderTargetPixels(targets.positions[0], 0, 0, 1, 1, probe);
    if (!Number.isFinite(probe[0]) || !Number.isFinite(probe[1]) || !Number.isFinite(probe[2])) {
      throw new Error("float-framebuffer-readback-invalid");
    }
  } catch (error) {
    renderer.setRenderTarget(null);
    positionTexture.dispose();
    velocityTexture.dispose();
    basePositionTexture.dispose();
    riverMetaTexture.dispose();
    copyMaterial.dispose();
    velocityMaterial.dispose();
    positionMaterial.dispose();
    quadGeometry.dispose();
    targets.positions.forEach((target) => target.dispose());
    targets.velocities.forEach((target) => target.dispose());
    throw error;
  }
  positionTexture.dispose();
  velocityTexture.dispose();

  return {
    targets,
    step: (stepIndex) => {
      const current = targets.activeIndex;
      const next = current === 0 ? 1 : 0;
      velocityMaterial.uniforms.uPositionTexture.value = targets.positions[current].texture;
      velocityMaterial.uniforms.uVelocityTexture.value = targets.velocities[current].texture;
      velocityMaterial.uniforms.uSimulationTime.value = stepIndex * FLOW_FIXED_STEP_SECONDS;
      quad.material = velocityMaterial;
      renderer.setRenderTarget(targets.velocities[next]);
      renderer.render(simulationScene, simulationCamera);

      positionMaterial.uniforms.uPositionTexture.value = targets.positions[current].texture;
      positionMaterial.uniforms.uVelocityTexture.value = targets.velocities[next].texture;
      quad.material = positionMaterial;
      renderer.setRenderTarget(targets.positions[next]);
      renderer.render(simulationScene, simulationCamera);
      renderer.setRenderTarget(null);
      targets.activeIndex = next as 0 | 1;
    },
    readState: () => {
      const length = FLOW_TEXTURE_SLOTS * 4;
      const positions = new Float32Array(length);
      const velocities = new Float32Array(length);
      renderer.readRenderTargetPixels(
        targets.positions[targets.activeIndex],
        0,
        0,
        FLOW_TEXTURE_WIDTH,
        FLOW_TEXTURE_HEIGHT,
        positions,
      );
      renderer.readRenderTargetPixels(
        targets.velocities[targets.activeIndex],
        0,
        0,
        FLOW_TEXTURE_WIDTH,
        FLOW_TEXTURE_HEIGHT,
        velocities,
      );
      return { positions, velocities };
    },
    dispose: () => {
      simulationScene.remove(quad);
      copyMaterial.dispose();
      velocityMaterial.dispose();
      positionMaterial.dispose();
      basePositionTexture.dispose();
      riverMetaTexture.dispose();
      quadGeometry.dispose();
      targets.positions.forEach((target) => target.dispose());
      targets.velocities.forEach((target) => target.dispose());
    },
  };
}

function sampleAnalyticState(
  attributes: SpatialAttributes,
  sessionSeed: string,
  elapsedSeconds: number,
  style: AgentImmersiveStyle,
) {
  const positions = new Float32Array(FLOW_TEXTURE_SLOTS * 4);
  const velocities = new Float32Array(FLOW_TEXTURE_SLOTS * 4);
  const seedPhase = style === "star-river"
    ? starRiverSeedPhase(sessionSeed)
    : flowSeedPhase(sessionSeed);
  for (let index = 0; index < attributes.simulationTypes.length; index += 1) {
    const baseOffset = index * 3;
    const stateOffset = index * 4;
    const type = attributes.simulationTypes[index];
    const basePosition = [
      attributes.simulationBasePositions[baseOffset],
      attributes.simulationBasePositions[baseOffset + 1],
      attributes.simulationBasePositions[baseOffset + 2],
    ] as [number, number, number];
    const kind = particleKindFromType(type);
    const meta = readRiverMeta(attributes.simulationRiverMetadata, index);
    const position = style === "star-river"
      ? sampleAgentStarRiverPosition(
        basePosition,
        meta,
        kind,
        elapsedSeconds,
        seedPhase,
      )
      : sampleAnalyticPosition(
        basePosition[0],
        basePosition[1],
        basePosition[2],
        type,
        elapsedSeconds,
        seedPhase,
      );
    const velocity = style === "star-river"
      ? sampleAgentStarRiverVelocity(
        [position[0], position[1], position[2]],
        basePosition,
        meta,
        kind,
        elapsedSeconds,
        seedPhase,
      )
      : sampleTwoLevelVelocity(
        position[0],
        position[1],
        position[2],
        type,
        elapsedSeconds,
        seedPhase,
      );
    positions[stateOffset] = position[0];
    positions[stateOffset + 1] = position[1];
    positions[stateOffset + 2] = position[2];
    positions[stateOffset + 3] = type;
    velocities[stateOffset] = velocity[0];
    velocities[stateOffset + 1] = velocity[1];
    velocities[stateOffset + 2] = velocity[2];
  }
  for (let index = attributes.simulationTypes.length; index < FLOW_TEXTURE_SLOTS; index += 1) {
    positions[index * 4 + 3] = -1;
  }
  return { positions, velocities };
}

export function AgentImmersiveStarfieldCanvas({
  payload,
  style = "star-river",
  elapsedSeconds,
  initialCheckpoint,
  forceAnalyticFallback = false,
  reducedMotion = false,
  motionScale = 1,
  onElapsedSecondsChange,
  onCheckpoint,
  onMetrics,
  focus,
  onFocusRuntime,
  onBackendFallback,
  onReady,
  onFatalError,
}: AgentImmersiveStarfieldCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const elapsedRef = useRef(Math.max(0, elapsedSeconds));
  const onElapsedRef = useRef(onElapsedSecondsChange);
  const onCheckpointRef = useRef(onCheckpoint);
  const onMetricsRef = useRef(onMetrics);
  const focusRef = useRef(focus);
  const onFocusRuntimeRef = useRef(onFocusRuntime);
  const focusRefreshRef = useRef<(() => void) | null>(null);
  const onBackendFallbackRef = useRef(onBackendFallback);
  const onReadyRef = useRef(onReady);
  const onFatalErrorRef = useRef(onFatalError);
  const motionScaleRef = useRef(Math.max(0, motionScale));

  useEffect(() => {
    onElapsedRef.current = onElapsedSecondsChange;
    onCheckpointRef.current = onCheckpoint;
    onMetricsRef.current = onMetrics;
    focusRef.current = focus;
    onFocusRuntimeRef.current = onFocusRuntime;
    focusRefreshRef.current?.();
    onBackendFallbackRef.current = onBackendFallback;
    onReadyRef.current = onReady;
    onFatalErrorRef.current = onFatalError;
    motionScaleRef.current = Math.max(0, motionScale);
  }, [
    onBackendFallback,
    onCheckpoint,
    onElapsedSecondsChange,
    onFatalError,
    motionScale,
    focus,
    onFocusRuntime,
    onMetrics,
    onReady,
  ]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: false,
        alpha: false,
        powerPreference: "default",
        preserveDrawingBuffer: false,
      });
    } catch (error) {
      onFatalErrorRef.current?.(
        error instanceof Error ? error.message : "WebGL 初始化失败。",
      );
      return undefined;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(0, 0, 25);
    const pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    renderer.setPixelRatio(pixelRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.domElement.className = "agent-immersive-starfield__canvas";
    renderer.domElement.dataset.agentRenderer = "immersive-v3";
    host.appendChild(renderer.domElement);

    const attributes = buildSpatialAttributes(payload, style);
    if (attributes.simulationTypes.length > FLOW_TEXTURE_SLOTS) {
      renderer.dispose();
      renderer.domElement.remove();
      onFatalErrorRef.current?.(
        `沉浸粒子数量 ${attributes.simulationTypes.length} 超过流场槽位 ${FLOW_TEXTURE_SLOTS}。`,
      );
      return undefined;
    }
    const seedPhase = style === "star-river"
      ? starRiverSeedPhase(payload.sessionSeed)
      : flowSeedPhase(payload.sessionSeed);
    const initialState = buildInitialFlowState(
      attributes,
      payload.sessionSeed,
      elapsedRef.current,
      style,
      initialCheckpoint,
    );
    elapsedRef.current = Math.max(
      elapsedRef.current,
      initialState.stepIndex * FLOW_FIXED_STEP_SECONDS,
    );

    let backend: AgentImmersiveFlowBackend = "analytic-fallback";
    let degradationReason: string | undefined;
    let gpgpu: GpgpuRuntime | null = null;
    if (!forceAnalyticFallback && !reducedMotion) {
      try {
        gpgpu = createGpgpuRuntime(
          renderer,
          initialState.positions,
          initialState.velocities,
          seedPhase,
          attributes,
          style,
        );
        backend = "gpgpu";
      } catch (error) {
        degradationReason = error instanceof Error ? error.message : "gpgpu-initialization-failed";
      }
    } else {
      degradationReason = reducedMotion ? "reduced-motion-static" : "forced-analytic-fallback";
    }

    const geometry = createGeometry(attributes);
    const coreMaterial = createMaterial(
      CORE_FRAGMENT_SHADER,
      pixelRatio,
      1,
      false,
      seedPhase,
      style,
    );
    const coronaMaterial = createMaterial(
      CORONA_FRAGMENT_SHADER,
      pixelRatio,
      1.28,
      true,
      seedPhase,
      style,
    );
    if (gpgpu) {
      const positionTexture = gpgpu.targets.positions[gpgpu.targets.activeIndex].texture;
      coreMaterial.uniforms.uUseStateTexture.value = 1;
      coronaMaterial.uniforms.uUseStateTexture.value = 1;
      coreMaterial.uniforms.uPositionTexture.value = positionTexture;
      coronaMaterial.uniforms.uPositionTexture.value = positionTexture;
    }
    const corePoints = new THREE.Points(geometry, coreMaterial);
    const coronaPoints = new THREE.Points(geometry, coronaMaterial);
    const dustGeometry = style === "star-river" && attributes.dustCount > 0
      ? createDustGeometry(attributes)
      : null;
    const dustMaterial = dustGeometry
      ? createDustMaterial(pixelRatio, seedPhase)
      : null;
    if (gpgpu && dustMaterial) {
      dustMaterial.uniforms.uUseStateTexture.value = 1;
      dustMaterial.uniforms.uPositionTexture.value = (
        gpgpu.targets.positions[gpgpu.targets.activeIndex].texture
      );
    }
    const dustPoints = dustGeometry && dustMaterial
      ? new THREE.Points(dustGeometry, dustMaterial)
      : null;
    const nebulaRibbon = style === "star-river"
      ? createNebulaRibbon(seedPhase)
      : null;
    const focusGeometry = getImmersiveFocusGeometryAttributes(geometry);
    const residentIndexById = new Map<string, number>();
    attributes.entityIds.forEach((entityId, index) => {
      residentIndexById.set(entityId, index);
      const separator = entityId.indexOf(":");
      if (separator > 0) {
        residentIndexById.set(entityId.slice(separator + 1), index);
      }
    });
    const dynamicSlotOffset = (
      attributes.types.length - AGENT_DUAL_FOCUS_DYNAMIC_SLOTS
    );
    corePoints.frustumCulled = false;
    coronaPoints.frustumCulled = false;
    corePoints.renderOrder = 1;
    coronaPoints.renderOrder = 2;
    if (dustPoints) {
      dustPoints.frustumCulled = false;
      dustPoints.renderOrder = 0;
      scene.add(dustPoints);
    }
    if (nebulaRibbon) scene.add(nebulaRibbon.mesh);
    scene.add(corePoints, coronaPoints);
    host.dataset.flowBackend = backend;
    host.dataset.flowTexture = `${FLOW_TEXTURE_WIDTH}x${FLOW_TEXTURE_HEIGHT}`;
    host.dataset.immersiveStyle = style;
    host.dataset.immersiveLayoutVersion = agentImmersiveLayoutVersion(style);
    host.dataset.starRiverMainCount = String(attributes.composition.mainBandCount);
    host.dataset.starRiverBranchCount = String(attributes.composition.branchCount);
    host.dataset.starRiverOuterCount = String(attributes.composition.outerCount);
    host.dataset.starRiverDustCount = String(attributes.dustCount);
    if (degradationReason) host.dataset.flowDegradationReason = degradationReason;

    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      renderer.render(scene, camera);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();

    let animationFrame = 0;
    let disposed = false;
    let lastFrameMs = performance.now();
    let readyReported = false;
    let accumulatorSeconds = 0;
    let stepIndex = initialState.stepIndex;
    let catchupSteps = 0;
    let contextLostCount = 0;
    let metricsReported = false;
    let fallbackRequested = false;
    const metricsStartElapsed = elapsedRef.current;
    const initialMetricState = gpgpu
      ? gpgpu.readState().positions
      : sampleAnalyticState(
        attributes,
        payload.sessionSeed,
        elapsedRef.current,
        style,
      ).positions;
    const initialScreen = projectStateToScreen(
      initialMetricState,
      attributes.types.length,
      camera,
      Math.max(1, host.clientWidth),
      Math.max(1, host.clientHeight),
    );

    const currentState = () => (
      gpgpu?.readState()
      ?? sampleAnalyticState(
        attributes,
        payload.sessionSeed,
        elapsedRef.current,
        style,
      )
    );
    let activeFocusRevision = -1;
    let completedFocusRevision = -1;
    let activeFocusStartedMs = 0;
    let activeFocusReleaseStartedMs = 0;
    let activeFocusReleasing = false;
    let activeFocusSide: "left" | "right" = "left";
    let activeFocusTargetIndex = -1;
    let activeFocusDynamicSlot = -1;
    let lastFocusRuntimeMs = -Infinity;
    let activeFocusFlowSpeedScale = 1;
    const activeFocusBend = new THREE.Vector3();
    const activeFocusFromPosition = camera.position.clone();
    const activeFocusFromQuaternion = camera.quaternion.clone();
    const activeFocusReleasePosition = camera.position.clone();
    const activeFocusReleaseQuaternion = camera.quaternion.clone();
    const focusDesiredPosition = new THREE.Vector3();
    const focusDesiredTarget = new THREE.Vector3();
    const focusDesiredQuaternion = new THREE.Quaternion();
    const focusProjectionProbe = new THREE.Vector3();
    const focusLookMatrix = new THREE.Matrix4();
    const activeFocusTrackedPosition = new THREE.Vector3();
    const activeFocusTrackedVelocity = new THREE.Vector3();
    const activeFocusTargetVelocity = new THREE.Vector3();

    const clearFocusGeometry = () => {
      const roles = focusGeometry.role.array as Float32Array;
      const enabled = focusGeometry.enabled.array as Float32Array;
      roles.fill(0);
      for (let index = 0; index < enabled.length; index += 1) {
        enabled[index] = index < dynamicSlotOffset ? 1 : 0;
      }
      focusGeometry.role.needsUpdate = true;
      focusGeometry.enabled.needsUpdate = true;
      activeFocusTargetIndex = -1;
      activeFocusDynamicSlot = -1;
    };

    const findResidentIndex = (entityId: string) => {
      const direct = residentIndexById.get(entityId);
      if (direct !== undefined) return direct;
      const separator = entityId.indexOf(":");
      return separator > 0
        ? residentIndexById.get(entityId.slice(separator + 1))
        : undefined;
    };

    const configureFocusGeometry = (
      presentation: AgentDualFocusPresentation,
      nowMs: number,
    ) => {
      clearFocusGeometry();
      const stateSnapshot = currentState();
      const state = stateSnapshot.positions;
      const roles = focusGeometry.role.array as Float32Array;
      const origins = focusGeometry.origin.array as Float32Array;
      const targets = focusGeometry.target.array as Float32Array;
      const enabled = focusGeometry.enabled.array as Float32Array;
      const colors = focusGeometry.color.array as Float32Array;
      const explicit = presentation.productMode === "sidera-explicit";
      const selectedEntities = presentation.intent.primary.mode === "signal"
        ? [{ entity: presentation.scene.primary, role: 3 }]
        : explicit
          ? [{ entity: presentation.scene.primary, role: 3 }]
        : [
          ...presentation.scene.context.map((entity) => ({ entity, role: 1 })),
          ...presentation.scene.evidence.map((entity) => ({ entity, role: 2 })),
          { entity: presentation.scene.primary, role: 3 },
        ];
      const assignments: Array<{
        index: number;
        role: number;
        x: number;
        y: number;
        z: number;
      }> = [];
      let nextDynamicSlot = 0;
      for (const { entity, role } of selectedEntities) {
        let index = findResidentIndex(entity.entityId);
        let dynamicSlot = -1;
        if (index === undefined) {
          if (nextDynamicSlot >= AGENT_DUAL_FOCUS_DYNAMIC_SLOTS) continue;
          dynamicSlot = nextDynamicSlot;
          index = dynamicSlotOffset + nextDynamicSlot;
          nextDynamicSlot += 1;
          enabled[index] = 1;
          const color = mutedStellarColor(entity.color ?? "#d8dde3", "paper");
          color.toArray(colors, index * 3);
        }
        const stateOffset = index * 4;
        const baseOffset = index * 3;
        const x = state[stateOffset];
        const y = state[stateOffset + 1];
        const z = state[stateOffset + 2];
        origins[baseOffset] = x;
        origins[baseOffset + 1] = y;
        origins[baseOffset + 2] = z;
        roles[index] = role;
        assignments.push({ index, role, x, y, z });
        if (role === 3) {
          activeFocusTargetIndex = index;
          activeFocusDynamicSlot = dynamicSlot;
          activeFocusTrackedPosition.set(x, y, z);
          activeFocusTrackedVelocity.set(
            stateSnapshot.velocities[stateOffset],
            stateSnapshot.velocities[stateOffset + 1],
            stateSnapshot.velocities[stateOffset + 2],
          );
        }
      }
      const centroid = assignments.reduce(
        (accumulator, assignment) => {
          accumulator.x += assignment.x;
          accumulator.y += assignment.y;
          accumulator.z += assignment.z;
          return accumulator;
        },
        new THREE.Vector3(),
      );
      if (assignments.length) centroid.multiplyScalar(1 / assignments.length);
      const leftCenter = new THREE.Vector3(-10.5, 1.2, -0.5);
      const rightCenter = new THREE.Vector3(10.5, 1.2, -0.5);
      const leftDistance = centroid.distanceToSquared(leftCenter);
      const rightDistance = centroid.distanceToSquared(rightCenter);
      if (presentation.side) {
        activeFocusSide = presentation.side;
      } else if (Math.abs(leftDistance - rightDistance) < 1e-6) {
        activeFocusSide = fnv1a32(presentation.scene.primary.entityId) % 2
          ? "left"
          : "right";
      } else {
        activeFocusSide = leftDistance <= rightDistance ? "left" : "right";
      }
      if (explicit) {
        for (const assignment of assignments) {
          const baseOffset = assignment.index * 3;
          targets[baseOffset] = assignment.x;
          targets[baseOffset + 1] = assignment.y;
          targets[baseOffset + 2] = assignment.z;
        }
        activeFocusBend.set(0, 0, 0);
      } else {
        const targetCenter = activeFocusSide === "left" ? leftCenter : rightCenter;
        const offset = targetCenter.clone().sub(centroid);
        for (const assignment of assignments) {
          const baseOffset = assignment.index * 3;
          targets[baseOffset] = assignment.x + offset.x;
          targets[baseOffset + 1] = assignment.y + offset.y;
          targets[baseOffset + 2] = assignment.z + offset.z;
        }
        const bendSign = fnv1a32(
          `${presentation.scene.primary.entityId}\u0000focus-bend`,
        ) % 2 ? 1 : -1;
        activeFocusBend.set(0, bendSign * 3.2, 0);
      }
      focusGeometry.role.needsUpdate = true;
      focusGeometry.origin.needsUpdate = true;
      focusGeometry.target.needsUpdate = true;
      focusGeometry.enabled.needsUpdate = true;
      focusGeometry.color.needsUpdate = true;
      activeFocusRevision = presentation.intent.revision;
      activeFocusStartedMs = nowMs;
      activeFocusReleaseStartedMs = 0;
      activeFocusReleasing = false;
      activeFocusFromPosition.copy(camera.position);
      activeFocusFromQuaternion.copy(camera.quaternion);
      host.dataset.focusContextSide = activeFocusSide;
      host.dataset.focusTargetIndex = String(activeFocusTargetIndex);
      host.dataset.focusDynamicSlot = String(activeFocusDynamicSlot);
    };

    const updateFocus = (nowMs: number) => {
      const presentation = focusRef.current;
      if (!presentation) {
        if (activeFocusRevision >= 0) {
          clearFocusGeometry();
          activeFocusRevision = -1;
          const idleSample = sampleAgentDualFocusTimeline("signal", 1, true);
          updateFocusMaterialUniforms(
            [coreMaterial, coronaMaterial],
            {
              acquisitionBlend: 0,
              contextBlend: 0,
              materialBlend: 0,
              backgroundDimBlend: 0,
            },
            false,
            activeFocusBend.set(0, 0, 0),
          );
          camera.position.set(0, 0, 25);
          camera.lookAt(0, 0, 0);
          activeFocusFlowSpeedScale = 1;
        }
        return;
      }
      if (presentation.intent.revision === completedFocusRevision) return;
      if (presentation.intent.revision !== activeFocusRevision) {
        configureFocusGeometry(presentation, nowMs);
        completedFocusRevision = -1;
      }
      if (presentation.releasing && !activeFocusReleasing) {
        activeFocusReleasing = true;
        activeFocusReleaseStartedMs = nowMs;
        activeFocusReleasePosition.copy(camera.position);
        activeFocusReleaseQuaternion.copy(camera.quaternion);
      }
      const mode = presentation.intent.primary.mode;
      const signalAutoRelease = (
        mode === "signal"
        && !presentation.releasing
        && (nowMs - activeFocusStartedMs) / 1000 >= 2.4
      );
      if (signalAutoRelease && !activeFocusReleasing) {
        activeFocusReleasing = true;
        activeFocusReleaseStartedMs = nowMs;
      }
      const elapsedSeconds = reducedMotion
        ? 10
        : (
          nowMs - (
            activeFocusReleasing
              ? activeFocusReleaseStartedMs
              : activeFocusStartedMs
          )
        ) / 1000;
      const explicit = presentation.productMode === "sidera-explicit";
      const sideraSample = explicit
        ? sampleSideraFocusTimeline(
          elapsedSeconds,
          activeFocusReleasing
            ? "releasing"
            : presentation.sideraPhase ?? "acquiring",
        )
        : null;
      const legacySample = explicit
        ? null
        : sampleAgentDualFocusTimeline(mode, elapsedSeconds, activeFocusReleasing);
      const sample = sideraSample
        ? {
          phase: sideraSample.complete
            ? activeFocusReleasing
              ? "idle" as const
              : "hold" as const
            : sideraSample.phase === "retargeting"
              ? "retargeting" as const
              : sideraSample.phase === "releasing"
                ? "releasing" as const
                : "acquiring" as const,
          progress: sideraSample.progress,
          acquisitionBlend: sideraSample.targetBlend,
          contextBlend: 0,
          materialBlend: sideraSample.targetBlend,
          cameraBlend: sideraSample.cameraBlend,
          backgroundDimBlend: sideraSample.backgroundDimBlend,
          infoBlend: sideraSample.infoBlend,
          complete: sideraSample.complete,
        }
        : {
          ...legacySample!,
          backgroundDimBlend: legacySample!.materialBlend,
          infoBlend: legacySample!.materialBlend,
        };
      updateFocusMaterialUniforms(
        [coreMaterial, coronaMaterial],
        sample,
        true,
        activeFocusBend,
      );
      activeFocusFlowSpeedScale = THREE.MathUtils.lerp(
        1,
        0.5,
        sample.backgroundDimBlend,
      );
      if (activeFocusReleasing) {
        activeFocusFlowSpeedScale = THREE.MathUtils.lerp(
          1,
          0.5,
          sample.backgroundDimBlend,
        );
      }
      const approachRatio = mode === "soft-focus"
        ? 0.08
        : mode === "full-focus"
          ? 0.15
          : 0;
      const cameraBlend = reducedMotion ? 0 : sample.cameraBlend;
      const sideSign = activeFocusSide === "left" ? -1 : 1;
      if (
        presentation.productMode === "sidera-explicit"
        && activeFocusTargetIndex >= 0
      ) {
        if (gpgpu) {
          focusDesiredTarget.copy(activeFocusTrackedPosition);
        } else {
          const baseOffset = activeFocusTargetIndex * 3;
          const basePosition = [
            attributes.basePositions[baseOffset],
            attributes.basePositions[baseOffset + 1],
            attributes.basePositions[baseOffset + 2],
          ] as [number, number, number];
          const analyticPosition = style === "star-river"
            ? sampleAgentStarRiverPosition(
              basePosition,
              readRiverMeta(attributes.riverMetadata, activeFocusTargetIndex),
              particleKindFromType(attributes.types[activeFocusTargetIndex]),
              elapsedRef.current,
              seedPhase,
            )
            : sampleAnalyticPosition(
              basePosition[0],
              basePosition[1],
              basePosition[2],
              attributes.types[activeFocusTargetIndex],
              elapsedRef.current,
              seedPhase,
            );
          focusDesiredTarget.set(...analyticPosition);
        }
        const distance = 25 * (1 - 0.12 * cameraBlend);
        const halfHeight = Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5)
          * distance;
        const desiredNdcX = presentation.composition
          ? presentation.composition.normalizedAnchorX * 2 - 1
          : activeFocusSide === "left" ? -0.56 : 0.56;
        const desiredNdcY = 0.16;
        focusDesiredPosition.set(
          focusDesiredTarget.x - desiredNdcX * halfHeight * camera.aspect,
          focusDesiredTarget.y - desiredNdcY * halfHeight,
          focusDesiredTarget.z + distance,
        );
        focusLookMatrix.lookAt(
          focusDesiredPosition,
          new THREE.Vector3(
            focusDesiredPosition.x,
            focusDesiredPosition.y,
            focusDesiredTarget.z,
          ),
          camera.up,
        );
        focusDesiredQuaternion.setFromRotationMatrix(focusLookMatrix);
        if (activeFocusReleasing) {
          const releaseProgress = 1 - cameraBlend;
          camera.position
            .copy(activeFocusReleasePosition)
            .lerp(new THREE.Vector3(0, 0, 25), releaseProgress);
          const baseLookMatrix = new THREE.Matrix4().lookAt(
            new THREE.Vector3(0, 0, 25),
            new THREE.Vector3(0, 0, 0),
            camera.up,
          );
          camera.quaternion
            .copy(activeFocusReleaseQuaternion)
            .slerp(
              new THREE.Quaternion().setFromRotationMatrix(baseLookMatrix),
              releaseProgress,
            );
        } else {
          camera.position
            .copy(activeFocusFromPosition)
            .lerp(focusDesiredPosition, cameraBlend);
          camera.quaternion
            .copy(activeFocusFromQuaternion)
            .slerp(focusDesiredQuaternion, cameraBlend);
        }
        camera.updateMatrixWorld(true);
        focusProjectionProbe.copy(focusDesiredTarget).project(camera);
        const expectedX = desiredNdcX;
        const anchorErrorPx = Math.hypot(
          (focusProjectionProbe.x - expectedX) * host.clientWidth * 0.5,
          (focusProjectionProbe.y - 0.16) * host.clientHeight * 0.5,
        );
        host.dataset.focusAnchorErrorPx = anchorErrorPx.toFixed(3);
      } else {
        camera.position.set(
          sideSign * 1.4 * cameraBlend,
          0,
          25 * (1 - approachRatio * cameraBlend),
        );
        camera.lookAt(sideSign * 0.8 * cameraBlend, 0, 0);
      }
      if (nowMs - lastFocusRuntimeMs >= 100) {
        lastFocusRuntimeMs = nowMs;
        onFocusRuntimeRef.current?.({
          phase: sample.phase,
          backgroundMode: "immersive",
          primaryId: presentation.scene.primary.entityId,
          focusMode: mode,
          membership: presentation.scene.primary.membership,
          progress: sample.progress,
          targetVertexIndex: activeFocusTargetIndex >= 0
            ? activeFocusTargetIndex
            : undefined,
          dynamicSlot: activeFocusDynamicSlot >= 0
            ? activeFocusDynamicSlot
            : undefined,
          contextSide: activeFocusSide,
          targetBlend: sample.materialBlend,
          cameraBlend: sample.cameraBlend,
          backgroundDimBlend: sample.backgroundDimBlend,
          infoBlend: sample.infoBlend,
          cameraState: presentation.productMode === "sidera-explicit"
            ? "co-moving"
            : approachRatio > 0
              ? "assisted"
              : "static",
        });
      }
      if (sample.complete && activeFocusReleasing) {
        completedFocusRevision = presentation.intent.revision;
        clearFocusGeometry();
        activeFocusRevision = -1;
        updateFocusMaterialUniforms(
          [coreMaterial, coronaMaterial],
          {
            acquisitionBlend: 0,
            contextBlend: 0,
            materialBlend: 0,
            backgroundDimBlend: 0,
          },
          false,
          activeFocusBend.set(0, 0, 0),
        );
        camera.position.set(0, 0, 25);
        camera.lookAt(0, 0, 0);
        activeFocusFlowSpeedScale = 1;
        onFocusRuntimeRef.current?.({
          phase: "idle",
          backgroundMode: "immersive",
          progress: 0,
        });
      }
    };
    const currentMetrics = (
      fiveSecondMetrics?: ReturnType<typeof calculateFiveSecondMetrics>,
    ): AgentImmersiveFlowMetrics => ({
      backend,
      textureWidth: FLOW_TEXTURE_WIDTH,
      textureHeight: FLOW_TEXTURE_HEIGHT,
      stepIndex,
      catchupSteps,
      degradationReason,
      ...fiveSecondMetrics,
      boundaryTurnCount: 0,
      visibleJumpCount: 0,
      checkpointRestoreErrorPx: initialState.restored ? 0 : 0,
      contextLostCount,
      style,
      layoutVersion: agentImmersiveLayoutVersion(style),
      mainBandCount: attributes.composition.mainBandCount,
      branchCount: attributes.composition.branchCount,
      outerCount: attributes.composition.outerCount,
      dustCount: attributes.dustCount,
      nebulaRibbonCount: nebulaRibbon ? 3 : 0,
    });
    onMetricsRef.current?.(currentMetrics());

    const updateRenderState = () => {
      coreMaterial.uniforms.uTime.value = elapsedRef.current;
      coronaMaterial.uniforms.uTime.value = elapsedRef.current;
      if (dustMaterial) dustMaterial.uniforms.uTime.value = elapsedRef.current;
      if (nebulaRibbon) nebulaRibbon.material.uniforms.uTime.value = elapsedRef.current;
      if (gpgpu) {
        const positionTexture = gpgpu.targets.positions[gpgpu.targets.activeIndex].texture;
        coreMaterial.uniforms.uPositionTexture.value = positionTexture;
        coronaMaterial.uniforms.uPositionTexture.value = positionTexture;
        if (dustMaterial) {
          dustMaterial.uniforms.uUseStateTexture.value = 1;
          dustMaterial.uniforms.uPositionTexture.value = positionTexture;
        }
      }
    };
    focusRefreshRef.current = () => {
      if (disposed) return;
      updateFocus(performance.now());
      updateRenderState();
      renderer.render(scene, camera);
    };

    const renderFrame = (nowMs: number) => {
      if (disposed) return;
      const deltaSeconds = Math.min(0.05, Math.max(0, (nowMs - lastFrameMs) / 1000));
      lastFrameMs = nowMs;
      if (!document.hidden && !reducedMotion) {
        const scaledDeltaSeconds = deltaSeconds
          * activeFocusFlowSpeedScale
          * motionScaleRef.current;
        if (gpgpu) {
          accumulatorSeconds = Math.min(
            accumulatorSeconds + scaledDeltaSeconds,
            FLOW_FIXED_STEP_SECONDS * FLOW_MAX_STEPS_PER_FRAME,
          );
          let frameSteps = 0;
          while (
            accumulatorSeconds >= FLOW_FIXED_STEP_SECONDS
            && frameSteps < FLOW_MAX_STEPS_PER_FRAME
          ) {
            stepIndex += 1;
            gpgpu.step(stepIndex);
            if (activeFocusTargetIndex >= 0) {
              const baseOffset = activeFocusTargetIndex * 3;
              const type = attributes.types[activeFocusTargetIndex];
              const targetVelocity = style === "star-river"
                ? sampleAgentStarRiverVelocity(
                  activeFocusTrackedPosition.toArray() as [number, number, number],
                  [
                    attributes.basePositions[baseOffset],
                    attributes.basePositions[baseOffset + 1],
                    attributes.basePositions[baseOffset + 2],
                  ],
                  readRiverMeta(attributes.riverMetadata, activeFocusTargetIndex),
                  particleKindFromType(type),
                  stepIndex * FLOW_FIXED_STEP_SECONDS,
                  seedPhase,
                )
                : sampleTwoLevelVelocity(
                  activeFocusTrackedPosition.x,
                  activeFocusTrackedPosition.y,
                  activeFocusTrackedPosition.z,
                  type,
                  stepIndex * FLOW_FIXED_STEP_SECONDS,
                  seedPhase,
                );
              const response = 1 - Math.exp(-FLOW_FIXED_STEP_SECONDS * 1.35);
              activeFocusTargetVelocity.set(...targetVelocity);
              activeFocusTrackedVelocity.lerp(
                activeFocusTargetVelocity,
                response,
              );
              activeFocusTrackedPosition.addScaledVector(
                activeFocusTrackedVelocity,
                FLOW_FIXED_STEP_SECONDS,
              );
            }
            accumulatorSeconds -= FLOW_FIXED_STEP_SECONDS;
            frameSteps += 1;
          }
          catchupSteps += Math.max(0, frameSteps - 1);
          elapsedRef.current += frameSteps * FLOW_FIXED_STEP_SECONDS;
        } else {
          elapsedRef.current += scaledDeltaSeconds;
          stepIndex = Math.round(elapsedRef.current / FLOW_FIXED_STEP_SECONDS);
        }
      }
      updateFocus(nowMs);
      updateRenderState();
      renderer.render(scene, camera);
      if (!readyReported) {
        readyReported = true;
        onReadyRef.current?.();
      }
      if (
        !metricsReported
        && elapsedRef.current - metricsStartElapsed >= FLOW_METRICS_WINDOW_SECONDS
      ) {
        metricsReported = true;
        const endState = currentState().positions;
        const endScreen = projectStateToScreen(
          endState,
          attributes.types.length,
          camera,
          Math.max(1, host.clientWidth),
          Math.max(1, host.clientHeight),
        );
        const displacement = calculateFiveSecondMetrics(initialScreen, endScreen);
        host.dataset.flowDisplacementMedianPx = displacement.displacementMedianPx.toFixed(3);
        host.dataset.flowDisplacementP75Px = displacement.displacementP75Px.toFixed(3);
        host.dataset.flowDisplacementP95Px = displacement.displacementP95Px.toFixed(3);
        host.dataset.flowDirectionality = displacement.globalDirectionality.toFixed(4);
        onMetricsRef.current?.(currentMetrics(displacement));
      }
      if (!document.hidden && !reducedMotion) {
        animationFrame = requestAnimationFrame(renderFrame);
      }
    };
    const resume = () => {
      if (disposed || document.hidden || reducedMotion) return;
      cancelAnimationFrame(animationFrame);
      lastFrameMs = performance.now();
      animationFrame = requestAnimationFrame(renderFrame);
    };
    const handleVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(animationFrame);
        onElapsedRef.current?.(elapsedRef.current);
      } else if (reducedMotion) {
        renderer.render(scene, camera);
      } else {
        resume();
      }
    };
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      contextLostCount += 1;
      if (fallbackRequested) return;
      fallbackRequested = true;
      cancelAnimationFrame(animationFrame);
      onMetricsRef.current?.(currentMetrics());
      onBackendFallbackRef.current?.("webgl-context-lost");
    };
    document.addEventListener("visibilitychange", handleVisibility);
    renderer.domElement.addEventListener("webglcontextlost", handleContextLost, false);
    if (reducedMotion) {
      updateRenderState();
      renderer.render(scene, camera);
      readyReported = true;
      onReadyRef.current?.();
    } else {
      animationFrame = requestAnimationFrame(renderFrame);
    }

    return () => {
      disposed = true;
      focusRefreshRef.current = null;
      cancelAnimationFrame(animationFrame);
      document.removeEventListener("visibilitychange", handleVisibility);
      renderer.domElement.removeEventListener("webglcontextlost", handleContextLost, false);
      resizeObserver.disconnect();
      onElapsedRef.current?.(elapsedRef.current);
      try {
        const state = currentState();
        onCheckpointRef.current?.({
          sessionSeed: payload.sessionSeed,
          style,
          layoutVersion: agentImmersiveLayoutVersion(style),
          stepIndex,
          textureWidth: FLOW_TEXTURE_WIDTH,
          textureHeight: FLOW_TEXTURE_HEIGHT,
          positions: state.positions,
          velocities: state.velocities,
          backend,
        });
      } catch {
        // A context-lost renderer may reject readback; elapsed time still persists.
      }
      scene.remove(corePoints, coronaPoints);
      if (dustPoints) scene.remove(dustPoints);
      if (nebulaRibbon) scene.remove(nebulaRibbon.mesh);
      coreMaterial.dispose();
      coronaMaterial.dispose();
      geometry.dispose();
      dustMaterial?.dispose();
      dustGeometry?.dispose();
      nebulaRibbon?.material.dispose();
      nebulaRibbon?.geometry.dispose();
      gpgpu?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [
    forceAnalyticFallback,
    initialCheckpoint,
    payload,
    reducedMotion,
    style,
  ]);

  return (
    <div
      ref={hostRef}
      className="agent-immersive-starfield"
      data-paper-count={payload.papers.length}
      data-hotspot-count={payload.hotspots.length}
      data-source-snapshot-id={payload.sourceSnapshotId}
      data-flow-version="agent-immersive-two-level-v1"
      data-immersive-style={style}
      data-layout-version={agentImmersiveLayoutVersion(style)}
    />
  );
}

export function hasTheoryCoordinates(
  payload: AgentImmersiveBackgroundPayloadV2,
) {
  const forbiddenKeys = new Set([
    "position",
    "offset",
    "centroid",
    "sourceCentroid",
    "isotropicScale",
    "x",
    "y",
    "z",
  ]);
  const visit = (value: unknown): boolean => {
    if (!value || typeof value !== "object") return false;
    if (Array.isArray(value)) return value.some(visit);
    return Object.entries(value).some(([key, child]) => (
      forbiddenKeys.has(key) || visit(child)
    ));
  };
  return visit(payload);
}

export function paperIdsAreUnique(
  papers: AgentImmersiveBackgroundPaperV2[],
) {
  return new Set(papers.map((paper) => paper.id)).size === papers.length;
}
