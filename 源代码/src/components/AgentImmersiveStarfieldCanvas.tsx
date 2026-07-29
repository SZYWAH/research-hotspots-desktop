import { useEffect, useRef } from "react";
import * as THREE from "three";
import type {
  AgentImmersiveBackgroundPayloadV2,
  AgentImmersiveBackgroundPaperV2,
} from "../types";

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
};

type AgentImmersiveStarfieldCanvasProps = {
  payload: AgentImmersiveBackgroundPayloadV2;
  elapsedSeconds: number;
  initialCheckpoint?: AgentImmersiveFlowCheckpointV1;
  forceAnalyticFallback?: boolean;
  reducedMotion?: boolean;
  onElapsedSecondsChange?: (elapsedSeconds: number) => void;
  onCheckpoint?: (checkpoint: AgentImmersiveFlowCheckpointV1) => void;
  onMetrics?: (metrics: AgentImmersiveFlowMetrics) => void;
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

function buildSpatialAttributes(payload: AgentImmersiveBackgroundPayloadV2): SpatialAttributes {
  const total = payload.hotspots.length + payload.papers.length;
  const basePositions = new Float32Array(total * 3);
  const sizes = new Float32Array(total);
  const types = new Float32Array(total);
  const colors = new Float32Array(total * 3);
  const seeds = new Float32Array(total);

  payload.hotspots.forEach((hotspot, index) => {
    const random = mulberry32(fnv1a32(`${payload.sessionSeed}\u0000hotspot\u0000${hotspot.id}`));
    writeRandomPosition(basePositions, index, random, HOTSPOT_CORE_RADIUS);
    sizes[index] = 2.25 + random() * 1.15;
    types[index] = 1;
    seeds[index] = random();
    const color = mutedStellarColor(hotspot.color, "hotspot");
    color.toArray(colors, index * 3);
  });

  payload.papers.forEach((paper, paperIndex) => {
    const index = payload.hotspots.length + paperIndex;
    const random = mulberry32(fnv1a32(`${payload.sessionSeed}\u0000paper\u0000${paper.id}`));
    writeRandomPosition(basePositions, index, random, FIELD_SIZE);
    sizes[index] = 1.05 + random() * 0.65;
    types[index] = 0;
    seeds[index] = random();
    const color = mutedStellarColor(paper.color, "paper");
    color.toArray(colors, index * 3);
  });

  return { basePositions, sizes, types, colors, seeds };
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
) {
  const expectedLength = FLOW_TEXTURE_SLOTS * 4;
  return Boolean(
    checkpoint
    && checkpoint.sessionSeed === sessionSeed
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
  checkpoint?: AgentImmersiveFlowCheckpointV1,
) {
  if (checkpointIsCompatible(checkpoint, sessionSeed) && checkpoint) {
    return {
      positions: checkpoint.positions.slice(),
      velocities: checkpoint.velocities.slice(),
      stepIndex: Math.max(0, Math.floor(checkpoint.stepIndex)),
      restored: true,
    };
  }

  const positions = new Float32Array(FLOW_TEXTURE_SLOTS * 4);
  const velocities = new Float32Array(FLOW_TEXTURE_SLOTS * 4);
  const seedPhase = flowSeedPhase(sessionSeed);
  for (let index = 0; index < attributes.types.length; index += 1) {
    const sourceOffset = index * 3;
    const stateOffset = index * 4;
    const x = attributes.basePositions[sourceOffset];
    const y = attributes.basePositions[sourceOffset + 1];
    const z = attributes.basePositions[sourceOffset + 2];
    const type = attributes.types[index];
    const velocity = sampleTwoLevelVelocity(
      x,
      y,
      z,
      type,
      elapsedSeconds,
      seedPhase,
    );
    positions[stateOffset] = x;
    positions[stateOffset + 1] = y;
    positions[stateOffset + 2] = z;
    positions[stateOffset + 3] = type;
    velocities[stateOffset] = velocity[0];
    velocities[stateOffset + 1] = velocity[1];
    velocities[stateOffset + 2] = velocity[2];
    velocities[stateOffset + 3] = 0;
  }
  for (let index = attributes.types.length; index < FLOW_TEXTURE_SLOTS; index += 1) {
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

const VERTEX_SHADER = `
uniform float uTime;
uniform float uPixelRatio;
uniform float uLayerScale;
uniform float uUseStateTexture;
uniform float uSeedPhase;
uniform sampler2D uPositionTexture;

attribute vec3 aBasePos;
attribute float aSize;
attribute float aType;
attribute vec3 aColor;
attribute float aSeed;
attribute vec2 aStateUv;

varying vec3 vColor;
varying float vType;
varying float vPointSize;
varying float vBrightness;

${ANALYTIC_FLOW_GLSL}

void main() {
  vec3 pos = uUseStateTexture > 0.5
    ? texture2D(uPositionTexture, aStateUv).xyz
    : immersiveAnalyticPosition(aBasePos, aType, uTime, uSeedPhase);

  vec4 viewPosition = modelViewMatrix * vec4(pos, 1.0);
  float perspective = 52.0 / max(2.0, -viewPosition.z);
  float cssSize = aSize * perspective;
  if (aType > 0.5) {
    cssSize = clamp(cssSize, 2.6, 8.8);
  } else {
    cssSize = clamp(cssSize, 1.15, 5.5);
  }
  cssSize *= uLayerScale;

  float depthFade = smoothstep(-72.0, -8.0, viewPosition.z);
  float stableVariation = mix(0.82, 1.0, aSeed);
  vBrightness = depthFade * stableVariation;
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
varying vec2 vUv;

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
  vec3 targetVelocity = twoLevelVelocity(
    positionState.xyz,
    positionState.w,
    uSimulationTime,
    uSeedPhase
  );
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
  float strength = vType > 0.5 ? 0.10 : 0.032;
  float alpha = (shell * strength + shortSpike * strength * 0.65)
    * vBrightness;
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(vColor * alpha, alpha);
}
`;

function createGeometry(attributes: SpatialAttributes) {
  const stateUvs = new Float32Array(attributes.types.length * 2);
  for (let index = 0; index < attributes.types.length; index += 1) {
    stateUvs[index * 2] = ((index % FLOW_TEXTURE_WIDTH) + 0.5) / FLOW_TEXTURE_WIDTH;
    stateUvs[index * 2 + 1] = (
      Math.floor(index / FLOW_TEXTURE_WIDTH) + 0.5
    ) / FLOW_TEXTURE_HEIGHT;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(attributes.basePositions.slice(), 3));
  geometry.setAttribute("aBasePos", new THREE.BufferAttribute(attributes.basePositions, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(attributes.sizes, 1));
  geometry.setAttribute("aType", new THREE.BufferAttribute(attributes.types, 1));
  geometry.setAttribute("aColor", new THREE.BufferAttribute(attributes.colors, 3));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(attributes.seeds, 1));
  geometry.setAttribute("aStateUv", new THREE.BufferAttribute(stateUvs, 2));
  return geometry;
}

function createMaterial(
  fragmentShader: string,
  pixelRatio: number,
  layerScale: number,
  corona: boolean,
  seedPhase: number,
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
      uPositionTexture: { value: null },
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
) {
  const positions = new Float32Array(FLOW_TEXTURE_SLOTS * 4);
  const velocities = new Float32Array(FLOW_TEXTURE_SLOTS * 4);
  const seedPhase = flowSeedPhase(sessionSeed);
  for (let index = 0; index < attributes.types.length; index += 1) {
    const baseOffset = index * 3;
    const stateOffset = index * 4;
    const type = attributes.types[index];
    const position = sampleAnalyticPosition(
      attributes.basePositions[baseOffset],
      attributes.basePositions[baseOffset + 1],
      attributes.basePositions[baseOffset + 2],
      type,
      elapsedSeconds,
      seedPhase,
    );
    const velocity = sampleTwoLevelVelocity(
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
  for (let index = attributes.types.length; index < FLOW_TEXTURE_SLOTS; index += 1) {
    positions[index * 4 + 3] = -1;
  }
  return { positions, velocities };
}

export function AgentImmersiveStarfieldCanvas({
  payload,
  elapsedSeconds,
  initialCheckpoint,
  forceAnalyticFallback = false,
  reducedMotion = false,
  onElapsedSecondsChange,
  onCheckpoint,
  onMetrics,
  onBackendFallback,
  onReady,
  onFatalError,
}: AgentImmersiveStarfieldCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const elapsedRef = useRef(Math.max(0, elapsedSeconds));
  const onElapsedRef = useRef(onElapsedSecondsChange);
  const onCheckpointRef = useRef(onCheckpoint);
  const onMetricsRef = useRef(onMetrics);
  const onBackendFallbackRef = useRef(onBackendFallback);
  const onReadyRef = useRef(onReady);
  const onFatalErrorRef = useRef(onFatalError);

  useEffect(() => {
    onElapsedRef.current = onElapsedSecondsChange;
    onCheckpointRef.current = onCheckpoint;
    onMetricsRef.current = onMetrics;
    onBackendFallbackRef.current = onBackendFallback;
    onReadyRef.current = onReady;
    onFatalErrorRef.current = onFatalError;
  }, [
    onBackendFallback,
    onCheckpoint,
    onElapsedSecondsChange,
    onFatalError,
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

    const attributes = buildSpatialAttributes(payload);
    if (attributes.types.length > FLOW_TEXTURE_SLOTS) {
      renderer.dispose();
      renderer.domElement.remove();
      onFatalErrorRef.current?.(
        `沉浸粒子数量 ${attributes.types.length} 超过流场槽位 ${FLOW_TEXTURE_SLOTS}。`,
      );
      return undefined;
    }
    const seedPhase = flowSeedPhase(payload.sessionSeed);
    const initialState = buildInitialFlowState(
      attributes,
      payload.sessionSeed,
      elapsedRef.current,
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
    );
    const coronaMaterial = createMaterial(
      CORONA_FRAGMENT_SHADER,
      pixelRatio,
      1.28,
      true,
      seedPhase,
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
    corePoints.frustumCulled = false;
    coronaPoints.frustumCulled = false;
    corePoints.renderOrder = 1;
    coronaPoints.renderOrder = 2;
    scene.add(corePoints, coronaPoints);
    host.dataset.flowBackend = backend;
    host.dataset.flowTexture = `${FLOW_TEXTURE_WIDTH}x${FLOW_TEXTURE_HEIGHT}`;
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
      : sampleAnalyticState(attributes, payload.sessionSeed, elapsedRef.current).positions;
    const initialScreen = projectStateToScreen(
      initialMetricState,
      attributes.types.length,
      camera,
      Math.max(1, host.clientWidth),
      Math.max(1, host.clientHeight),
    );

    const currentState = () => (
      gpgpu?.readState()
      ?? sampleAnalyticState(attributes, payload.sessionSeed, elapsedRef.current)
    );
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
    });
    onMetricsRef.current?.(currentMetrics());

    const updateRenderState = () => {
      coreMaterial.uniforms.uTime.value = elapsedRef.current;
      coronaMaterial.uniforms.uTime.value = elapsedRef.current;
      if (gpgpu) {
        const positionTexture = gpgpu.targets.positions[gpgpu.targets.activeIndex].texture;
        coreMaterial.uniforms.uPositionTexture.value = positionTexture;
        coronaMaterial.uniforms.uPositionTexture.value = positionTexture;
      }
    };

    const renderFrame = (nowMs: number) => {
      if (disposed) return;
      const deltaSeconds = Math.min(0.05, Math.max(0, (nowMs - lastFrameMs) / 1000));
      lastFrameMs = nowMs;
      if (!document.hidden && !reducedMotion) {
        if (gpgpu) {
          accumulatorSeconds = Math.min(
            accumulatorSeconds + deltaSeconds,
            FLOW_FIXED_STEP_SECONDS * FLOW_MAX_STEPS_PER_FRAME,
          );
          let frameSteps = 0;
          while (
            accumulatorSeconds >= FLOW_FIXED_STEP_SECONDS
            && frameSteps < FLOW_MAX_STEPS_PER_FRAME
          ) {
            stepIndex += 1;
            gpgpu.step(stepIndex);
            accumulatorSeconds -= FLOW_FIXED_STEP_SECONDS;
            frameSteps += 1;
          }
          catchupSteps += Math.max(0, frameSteps - 1);
          elapsedRef.current += frameSteps * FLOW_FIXED_STEP_SECONDS;
        } else {
          elapsedRef.current += deltaSeconds;
          stepIndex = Math.round(elapsedRef.current / FLOW_FIXED_STEP_SECONDS);
        }
      }
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
      cancelAnimationFrame(animationFrame);
      document.removeEventListener("visibilitychange", handleVisibility);
      renderer.domElement.removeEventListener("webglcontextlost", handleContextLost, false);
      resizeObserver.disconnect();
      onElapsedRef.current?.(elapsedRef.current);
      try {
        const state = currentState();
        onCheckpointRef.current?.({
          sessionSeed: payload.sessionSeed,
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
      coreMaterial.dispose();
      coronaMaterial.dispose();
      geometry.dispose();
      gpgpu?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [
    forceAnalyticFallback,
    initialCheckpoint,
    payload,
    reducedMotion,
  ]);

  return (
    <div
      ref={hostRef}
      className="agent-immersive-starfield"
      data-paper-count={payload.papers.length}
      data-hotspot-count={payload.hotspots.length}
      data-source-snapshot-id={payload.sourceSnapshotId}
      data-flow-version="agent-immersive-two-level-v1"
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
