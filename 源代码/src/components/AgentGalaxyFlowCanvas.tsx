import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

import type {
  AgentGalaxyBackgroundHotspotV1,
  AgentGalaxyBackgroundPaperV1,
  AgentGalaxyBackgroundPayloadV1,
} from "../types";
import {
  AGENT_GALAXY_FLOW_CONTRACT_VERSION,
  type AgentGalaxyFlowParticleIdentity,
  type AgentGalaxyVector3,
} from "../lib/agentGalaxyFlowContract";
import {
  GRAVITATIONAL_WEAVE_GLSL_CHUNK,
  GRAVITATIONAL_WEAVE_NODE_COUNT,
  createGravitationalWeaveAssignment,
  createGravitationalWeaveUniformValues,
  selectStableFlowIdentities,
  type GravitationalWeaveUniformValues,
} from "../lib/gravitationalWeaveFlow";
import type {
  AgentGalaxyFlowReviewConfig,
  AgentGalaxyFlowReviewQuality,
} from "../lib/agentGalaxyFlowReview";

export type AgentGalaxyFlowMetrics = {
  averageFrameMs: number;
  p95FrameMs: number;
  averageFps: number;
  dpr: number;
  requestedQuality: AgentGalaxyFlowReviewQuality;
  quality: "balanced" | "high";
  drawCalls: number;
  visibleHotspotCount: number;
  visiblePaperProxyCount: number;
  environmentStarCount: number;
  dustCount: number;
  downgradeReason?: string;
  paused: boolean;
  reducedMotion: boolean;
  fixedTime: boolean;
  sourceSnapshotId: string;
  gpuRenderer: string;
  flowModelId: "gravitational-weave-tech-preview";
  flowContractVersion: string;
  fieldNodeCount: 4;
  semanticCoreTimeOpacity: false;
  semanticBlending: "normal";
  bloomMode: "none";
  depthOfField: false;
  wholeGroupTransform: false;
  cameraMode: "static" | "codrift";
  cameraDriftMaxUnits: number;
  webglAvailable: boolean;
};

type Props = {
  payload: AgentGalaxyBackgroundPayloadV1;
  config: AgentGalaxyFlowReviewConfig;
  reducedMotion?: boolean;
  onMetrics?: (metrics: AgentGalaxyFlowMetrics) => void;
};

type ResolvedQuality = "balanced" | "high";

type LayerBudget = {
  papers: number;
  hotspots: number;
  environment: number;
  dust: number;
};

export const AGENT_GALAXY_FLOW_QUALITY_BUDGET: Record<ResolvedQuality, LayerBudget> = {
  balanced: {
    papers: 1920,
    hotspots: 55,
    environment: 800,
    dust: 1600,
  },
  high: {
    papers: 2560,
    hotspots: 75,
    environment: 1200,
    dust: 2600,
  },
};

export const AGENT_GALAXY_FLOW_CAMERA = {
  distance: 105,
  azimuthDegrees: 270,
  elevationDegrees: 50,
  codriftMaxUnits: 0.6,
  codriftPeriodSeconds: 67,
} as const;

export const AGENT_GALAXY_FLOW_SNAPSHOT_SIZE = {
  width: 3840,
  height: 2160,
} as const;

export const AGENT_GALAXY_FLOW_STAR_CROP = {
  x: 640,
  y: 360,
  width: 1024,
  height: 768,
} as const;

export const AGENT_GALAXY_SHARP_SEMANTIC_FRAGMENT_SHADER = `
  uniform vec3 uTint;
  uniform float uOpacity;
  varying float vLuma;
  varying float vDepthLuma;

  void main() {
    vec2 centered = gl_PointCoord - vec2(0.5);
    float radius = length(centered);
    if (radius > 0.5) discard;

    float core = 1.0 - smoothstep(0.02, 0.22, radius);
    float coverage = 1.0 - smoothstep(0.34, 0.5, radius);
    float alpha = coverage
      * (0.78 + core * 0.22)
      * uOpacity
      * vLuma
      * vDepthLuma;
    if (alpha < 0.006) discard;

    float luminance = min(1.0, 0.90 + core * 0.10);
    gl_FragColor = vec4(uTint * luminance, alpha);
  }
`;

const AGENT_GALAXY_DECORATIVE_FRAGMENT_SHADER = `
  uniform vec3 uTint;
  uniform float uOpacity;
  varying float vLuma;
  varying float vDepthLuma;

  void main() {
    vec2 centered = gl_PointCoord - vec2(0.5);
    float radius = length(centered);
    if (radius > 0.5) discard;

    float core = 1.0 - smoothstep(0.03, 0.19, radius);
    float body = 1.0 - smoothstep(0.12, 0.46, radius);
    float alpha = (core * 0.72 + body * 0.2) * uOpacity * vLuma * vDepthLuma;
    if (alpha < 0.004) discard;

    gl_FragColor = vec4(uTint * (0.7 + core * 0.24), alpha);
  }
`;

type WeaveGeometryResult = {
  geometry: THREE.BufferGeometry;
  count: number;
};

type PointLayerMode = "paper" | "hotspot" | "free";

type PointMaterialOptions = {
  mode: PointLayerMode;
  minimumCssPixels: number;
  maximumCssPixels: number;
  tint: string;
  opacity: number;
  flowScale: number;
  semantic: boolean;
  weaveUniforms: GravitationalWeaveUniformValues;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function hashString32(value: string) {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function createRandom(seed: number) {
  let state = seed || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

function p95(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
}

function detectGpuRenderer(renderer: THREE.WebGLRenderer) {
  const context = renderer.getContext();
  const extension = context.getExtension("WEBGL_debug_renderer_info");
  if (!extension) return "WebGL renderer unavailable";
  return String(context.getParameter(extension.UNMASKED_RENDERER_WEBGL) || "Unknown WebGL renderer");
}

function resolveInitialQuality(
  requested: AgentGalaxyFlowReviewQuality,
  gpuRenderer: string,
): ResolvedQuality {
  if (requested === "high") return "high";
  if (requested === "balanced") return "balanced";
  return /nvidia|geforce|radeon|rx\s|rtx/i.test(gpuRenderer) ? "high" : "balanced";
}

function setInitialCameraPose(camera: THREE.PerspectiveCamera) {
  const azimuth = THREE.MathUtils.degToRad(AGENT_GALAXY_FLOW_CAMERA.azimuthDegrees);
  const elevation = THREE.MathUtils.degToRad(AGENT_GALAXY_FLOW_CAMERA.elevationDegrees);
  const horizontal = AGENT_GALAXY_FLOW_CAMERA.distance * Math.cos(elevation);
  camera.position.set(
    horizontal * Math.cos(azimuth),
    AGENT_GALAXY_FLOW_CAMERA.distance * Math.sin(elevation),
    horizontal * Math.sin(azimuth),
  );
  camera.lookAt(0, 0, 0);
}

function identityKey(identity: AgentGalaxyFlowParticleIdentity) {
  return `${identity.kind}:${identity.entityId}`;
}

function paperIdentity(
  payload: AgentGalaxyBackgroundPayloadV1,
  paper: AgentGalaxyBackgroundPaperV1,
  hotspot: AgentGalaxyBackgroundHotspotV1,
): AgentGalaxyFlowParticleIdentity {
  return {
    kind: "paper",
    entityId: paper.id,
    hotspotId: paper.hotspotId,
    sourceSnapshotId: payload.sourceSnapshotId,
    semanticPosition: [
      hotspot.position[0] + paper.offset[0],
      hotspot.position[1] + paper.offset[1],
      hotspot.position[2] + paper.offset[2],
    ],
    semanticOffset: [...paper.offset],
  };
}

function hotspotIdentity(
  payload: AgentGalaxyBackgroundPayloadV1,
  hotspot: AgentGalaxyBackgroundHotspotV1,
): AgentGalaxyFlowParticleIdentity {
  return {
    kind: "hotspot",
    entityId: hotspot.id,
    hotspotId: hotspot.id,
    sourceSnapshotId: payload.sourceSnapshotId,
    semanticPosition: [...hotspot.position],
    semanticOffset: [0, 0, 0],
  };
}

function createPaperGeometry(payload: AgentGalaxyBackgroundPayloadV1): WeaveGeometryResult {
  const hotspotById = new Map(payload.hotspots.map((hotspot) => [hotspot.id, hotspot]));
  const identityByKey = new Map<string, AgentGalaxyFlowParticleIdentity>();
  const paperById = new Map(payload.papers.map((paper) => [paper.id, paper]));
  const identities: AgentGalaxyFlowParticleIdentity[] = [];

  for (const paper of payload.papers) {
    const hotspot = hotspotById.get(paper.hotspotId);
    if (!hotspot) continue;
    const identity = paperIdentity(payload, paper, hotspot);
    identities.push(identity);
    identityByKey.set(identityKey(identity), identity);
  }

  const selected = selectStableFlowIdentities(
    identities,
    Math.min(AGENT_GALAXY_FLOW_QUALITY_BUDGET.high.papers, identities.length),
    "agent-flow-paper-visibility-v1",
  );
  const positions: number[] = [];
  const anchors: number[] = [];
  const offsets: number[] = [];
  const sizes: number[] = [];
  const lumas: number[] = [];

  for (const selectedIdentity of selected) {
    const identity = identityByKey.get(identityKey(selectedIdentity)) ?? selectedIdentity;
    const paper = paperById.get(identity.entityId);
    const hotspot = paper ? hotspotById.get(paper.hotspotId) : undefined;
    if (!paper || !hotspot) continue;
    const assignment = createGravitationalWeaveAssignment(identity);
    const yearLuma = paper.year ? clamp((paper.year - 2012) / 16, 0.2, 1) : 0.5;
    const sizeSeed = assignment.seed / 0xffff_ffff;
    positions.push(
      hotspot.position[0] + paper.offset[0],
      hotspot.position[1] + paper.offset[1],
      hotspot.position[2] + paper.offset[2],
    );
    anchors.push(...hotspot.position);
    offsets.push(...paper.offset);
    sizes.push(1.25 + sizeSeed * 0.55 + yearLuma * 0.4);
    lumas.push(0.82 + yearLuma * 0.12 + sizeSeed * 0.06);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aHotspotAnchor", new THREE.Float32BufferAttribute(anchors, 3));
  geometry.setAttribute("aSemanticOffset", new THREE.Float32BufferAttribute(offsets, 3));
  geometry.setAttribute("aSize", new THREE.Float32BufferAttribute(sizes, 1));
  geometry.setAttribute("aLuma", new THREE.Float32BufferAttribute(lumas, 1));
  geometry.computeBoundingSphere();
  return { geometry, count: positions.length / 3 };
}

function createHotspotGeometry(payload: AgentGalaxyBackgroundPayloadV1): WeaveGeometryResult {
  const hotspotById = new Map(payload.hotspots.map((hotspot) => [hotspot.id, hotspot]));
  const identities = payload.hotspots.map((hotspot) => hotspotIdentity(payload, hotspot));
  const selected = selectStableFlowIdentities(
    identities,
    Math.min(AGENT_GALAXY_FLOW_QUALITY_BUDGET.high.hotspots, identities.length),
    "agent-flow-hotspot-visibility-v1",
  );
  const positions: number[] = [];
  const anchors: number[] = [];
  const offsets: number[] = [];
  const sizes: number[] = [];
  const lumas: number[] = [];

  for (const identity of selected) {
    const hotspot = hotspotById.get(identity.entityId);
    if (!hotspot) continue;
    const assignment = createGravitationalWeaveAssignment(identity);
    const sizeSeed = assignment.seed / 0xffff_ffff;
    positions.push(...hotspot.position);
    anchors.push(...hotspot.position);
    offsets.push(0, 0, 0);
    sizes.push(clamp(
      2.6 + Math.log2(Math.max(2, hotspot.paperCount)) * 0.18 + sizeSeed * 0.34,
      2.6,
      4.4,
    ));
    lumas.push(0.86 + sizeSeed * 0.1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aHotspotAnchor", new THREE.Float32BufferAttribute(anchors, 3));
  geometry.setAttribute("aSemanticOffset", new THREE.Float32BufferAttribute(offsets, 3));
  geometry.setAttribute("aSize", new THREE.Float32BufferAttribute(sizes, 1));
  geometry.setAttribute("aLuma", new THREE.Float32BufferAttribute(lumas, 1));
  geometry.computeBoundingSphere();
  return { geometry, count: positions.length / 3 };
}

function createFreeGeometry(
  payload: AgentGalaxyBackgroundPayloadV1,
  kind: "environment" | "dust",
): WeaveGeometryResult {
  const maximumCount = kind === "environment"
    ? AGENT_GALAXY_FLOW_QUALITY_BUDGET.high.environment
    : AGENT_GALAXY_FLOW_QUALITY_BUDGET.high.dust;
  const random = createRandom(hashString32(
    `${payload.sourceSnapshotId}:gravitational-weave:${kind}:v1`,
  ));
  const positions: number[] = [];
  const anchors: number[] = [];
  const offsets: number[] = [];
  const sizes: number[] = [];
  const lumas: number[] = [];

  for (let index = 0; index < maximumCount; index += 1) {
    const radius = kind === "environment"
      ? 58 + random() * 130
      : 4 + Math.cbrt(random()) * 82;
    const longitude = random() * Math.PI * 2;
    const latitude = Math.acos(2 * random() - 1);
    const position: AgentGalaxyVector3 = [
      Math.sin(latitude) * Math.cos(longitude) * radius,
      Math.cos(latitude) * radius * (kind === "environment" ? 0.82 : 1),
      Math.sin(latitude) * Math.sin(longitude) * radius,
    ];
    positions.push(...position);
    anchors.push(...position);
    offsets.push(0, 0, 0);
    if (kind === "environment") {
      sizes.push(0.76 + random() * 0.72);
      lumas.push(0.35 + random() * 0.3);
    } else {
      sizes.push(0.42 + random() * 0.48);
      lumas.push(0.1 + random() * 0.18);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aHotspotAnchor", new THREE.Float32BufferAttribute(anchors, 3));
  geometry.setAttribute("aSemanticOffset", new THREE.Float32BufferAttribute(offsets, 3));
  geometry.setAttribute("aSize", new THREE.Float32BufferAttribute(sizes, 1));
  geometry.setAttribute("aLuma", new THREE.Float32BufferAttribute(lumas, 1));
  geometry.computeBoundingSphere();
  return { geometry, count: positions.length / 3 };
}

function asThreeUniformValue(value: unknown): unknown {
  if (
    Array.isArray(value)
    && value.length === 3
    && value.every((entry) => typeof entry === "number")
  ) {
    return new THREE.Vector3(value[0], value[1], value[2]);
  }
  if (
    Array.isArray(value)
    && value.length > 0
    && value.every((entry) => (
      Array.isArray(entry)
      && entry.length === 3
      && entry.every((component) => typeof component === "number")
    ))
  ) {
    return value.map((entry) => new THREE.Vector3(entry[0], entry[1], entry[2]));
  }
  return value;
}

function createThreeWeaveUniforms(
  values: GravitationalWeaveUniformValues,
) {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      { value: asThreeUniformValue(value) },
    ]),
  ) as Record<string, THREE.IUniform>;
}

function createPointMaterial(options: PointMaterialOptions) {
  const positionExpression = options.mode === "paper"
    ? "agentGalaxyWeavePaperPosition(aHotspotAnchor, aSemanticOffset)"
    : options.mode === "hotspot"
      ? "agentGalaxyWeaveHotspotPosition(aHotspotAnchor)"
      : "agentGalaxyWeaveFreePosition(position)";
  const originalExpression = options.mode === "paper"
    ? "aHotspotAnchor + aSemanticOffset"
    : options.mode === "hotspot"
      ? "aHotspotAnchor"
      : "position";

  return new THREE.ShaderMaterial({
    uniforms: {
      ...createThreeWeaveUniforms(options.weaveUniforms),
      uPixelRatio: { value: 1 },
      uTint: { value: new THREE.Color(options.tint) },
      uOpacity: { value: options.opacity },
      uFlowScale: { value: options.flowScale },
    },
    vertexShader: `
      attribute vec3 aHotspotAnchor;
      attribute vec3 aSemanticOffset;
      attribute float aSize;
      attribute float aLuma;
      uniform float uPixelRatio;
      uniform float uFlowScale;
      varying float vLuma;
      varying float vDepthLuma;

      ${GRAVITATIONAL_WEAVE_GLSL_CHUNK}

      void main() {
        vec3 originalPosition = ${originalExpression};
        vec3 wovenPosition = ${positionExpression};
        vec3 flowPosition = mix(originalPosition, wovenPosition, uFlowScale);
        vec4 viewPosition = modelViewMatrix * vec4(flowPosition, 1.0);
        float viewDepth = max(5.0, -viewPosition.z);
        float perspective = clamp(sqrt(96.0 / viewDepth), 0.72, 1.34);
        float cssPointSize = clamp(
          aSize * perspective,
          ${options.minimumCssPixels.toFixed(2)},
          ${options.maximumCssPixels.toFixed(2)}
        );
        gl_PointSize = cssPointSize * uPixelRatio;
        gl_Position = projectionMatrix * viewPosition;
        vLuma = aLuma;
        vDepthLuma = clamp(1.1 - viewDepth / 520.0, 0.62, 1.0);
      }
    `,
    fragmentShader: options.semantic
      ? AGENT_GALAXY_SHARP_SEMANTIC_FRAGMENT_SHADER
      : AGENT_GALAXY_DECORATIVE_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
    toneMapped: false,
  });
}

function updateWeaveTime(materials: readonly THREE.ShaderMaterial[], timeSeconds: number) {
  for (const material of materials) {
    const timeUniform = material.uniforms.uWeaveTime;
    if (timeUniform) timeUniform.value = timeSeconds;
  }
}

export function AgentGalaxyFlowCanvas({
  payload,
  config,
  reducedMotion = false,
  onMetrics,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [fallbackReason, setFallbackReason] = useState("");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    setFallbackReason("");

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: false,
        alpha: false,
        preserveDrawingBuffer: config.snapshotPng,
        powerPreference: config.quality === "high"
          ? "high-performance"
          : config.quality === "balanced"
            ? "low-power"
            : "default",
      });
    } catch (reason) {
      setFallbackReason(reason instanceof Error ? reason.message : "WebGL unavailable");
      return;
    }

    renderer.setClearColor(0x020304, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.domElement.className = "agent-galaxy-flow__canvas";
    renderer.domElement.setAttribute("aria-label", "引力织场科研星空技术评审");
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(48, 1, 0.4, 460);
    setInitialCameraPose(camera);
    const initialCameraPosition = camera.position.clone();
    const cameraDrift = new THREE.Vector3();

    const gpuRenderer = detectGpuRenderer(renderer);
    let resolvedQuality = resolveInitialQuality(config.quality, gpuRenderer);
    let budget = AGENT_GALAXY_FLOW_QUALITY_BUDGET[resolvedQuality];
    let downgradeReason: string | undefined;
    const fixedTime = config.fixedTimeSeconds !== undefined;
    const effectiveReducedMotion = reducedMotion && !fixedTime;
    const weaveUniformValues = createGravitationalWeaveUniformValues(
      payload.sourceSnapshotId,
      {
        gravity: config.gravity,
        shear: config.shear,
        twist: config.twist,
        speed: config.speed,
        calmStrength: config.calm,
        calmForward: initialCameraPosition.clone().normalize().toArray() as AgentGalaxyVector3,
        calmUp: camera.up.clone().normalize().toArray() as AgentGalaxyVector3,
      },
      config.fixedTimeSeconds ?? 0,
    );

    const paperResult = createPaperGeometry(payload);
    const hotspotResult = createHotspotGeometry(payload);
    const environmentResult = createFreeGeometry(payload, "environment");
    const dustResult = createFreeGeometry(payload, "dust");

    const paperMaterial = createPointMaterial({
      mode: "paper",
      minimumCssPixels: 1.25,
      maximumCssPixels: 2.2,
      tint: "#e5e9eb",
      opacity: 0.96,
      flowScale: 1,
      semantic: true,
      weaveUniforms: weaveUniformValues,
    });
    const hotspotMaterial = createPointMaterial({
      mode: "hotspot",
      minimumCssPixels: 2.6,
      maximumCssPixels: 4.4,
      tint: "#f4f6f7",
      opacity: 0.98,
      flowScale: 1,
      semantic: true,
      weaveUniforms: weaveUniformValues,
    });
    const environmentMaterial = createPointMaterial({
      mode: "free",
      minimumCssPixels: 0.7,
      maximumCssPixels: 1.55,
      tint: "#aeb4b8",
      opacity: 0.58,
      flowScale: 0.46,
      semantic: false,
      weaveUniforms: weaveUniformValues,
    });
    const dustMaterial = createPointMaterial({
      mode: "free",
      minimumCssPixels: 0.42,
      maximumCssPixels: 0.95,
      tint: "#747b80",
      opacity: 0.36,
      flowScale: 0.68,
      semantic: false,
      weaveUniforms: weaveUniformValues,
    });

    const paperPoints = new THREE.Points(paperResult.geometry, paperMaterial);
    const hotspotPoints = new THREE.Points(hotspotResult.geometry, hotspotMaterial);
    const environmentPoints = new THREE.Points(environmentResult.geometry, environmentMaterial);
    const dustPoints = new THREE.Points(dustResult.geometry, dustMaterial);
    paperPoints.name = "agent-flow-sharp-papers";
    hotspotPoints.name = "agent-flow-sharp-hotspots";
    environmentPoints.name = "agent-flow-environment";
    dustPoints.name = "agent-flow-dust";
    dustPoints.renderOrder = 0;
    environmentPoints.renderOrder = 1;
    paperPoints.renderOrder = 2;
    hotspotPoints.renderOrder = 3;
    scene.add(dustPoints, environmentPoints, paperPoints, hotspotPoints);

    const materials = [
      paperMaterial,
      hotspotMaterial,
      environmentMaterial,
      dustMaterial,
    ] as const;
    const geometries = [
      paperResult.geometry,
      hotspotResult.geometry,
      environmentResult.geometry,
      dustResult.geometry,
    ] as const;

    const applyBudget = (nextBudget: LayerBudget) => {
      paperResult.geometry.setDrawRange(0, Math.min(nextBudget.papers, paperResult.count));
      hotspotResult.geometry.setDrawRange(0, Math.min(nextBudget.hotspots, hotspotResult.count));
      environmentResult.geometry.setDrawRange(0, Math.min(nextBudget.environment, environmentResult.count));
      dustResult.geometry.setDrawRange(0, Math.min(nextBudget.dust, dustResult.count));
    };
    applyBudget(budget);

    const pixelRatio = () => config.snapshotPng
      ? 1
      : Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      const starCrop = config.snapshotPng && config.snapshotRegion === "stars";
      const renderWidth = config.snapshotPng
        ? starCrop
          ? AGENT_GALAXY_FLOW_STAR_CROP.width
          : AGENT_GALAXY_FLOW_SNAPSHOT_SIZE.width
        : width;
      const renderHeight = config.snapshotPng
        ? starCrop
          ? AGENT_GALAXY_FLOW_STAR_CROP.height
          : AGENT_GALAXY_FLOW_SNAPSHOT_SIZE.height
        : height;
      camera.aspect = config.snapshotPng
        ? AGENT_GALAXY_FLOW_SNAPSHOT_SIZE.width
          / AGENT_GALAXY_FLOW_SNAPSHOT_SIZE.height
        : renderWidth / renderHeight;
      if (starCrop) {
        camera.setViewOffset(
          AGENT_GALAXY_FLOW_SNAPSHOT_SIZE.width,
          AGENT_GALAXY_FLOW_SNAPSHOT_SIZE.height,
          AGENT_GALAXY_FLOW_STAR_CROP.x,
          AGENT_GALAXY_FLOW_STAR_CROP.y,
          AGENT_GALAXY_FLOW_STAR_CROP.width,
          AGENT_GALAXY_FLOW_STAR_CROP.height,
        );
      } else {
        camera.clearViewOffset();
      }
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(pixelRatio());
      renderer.setSize(renderWidth, renderHeight, false);
      for (const material of materials) {
        material.uniforms.uPixelRatio.value = pixelRatio();
      }
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();

    const frameTimes: number[] = [];
    let lastFrameAt = performance.now();
    let metricsWindowStartedAt = lastFrameAt;
    let animationSeconds = 0;
    let raf = 0;
    let disposed = false;
    let pagePaused = document.hidden;
    let lowPerformanceWindows = 0;
    let webglAvailable = true;

    const reportMetrics = (paused: boolean) => {
      const averageFrameMs = frameTimes.length
        ? frameTimes.reduce((sum, value) => sum + value, 0) / frameTimes.length
        : 0;
      onMetrics?.({
        averageFrameMs,
        p95FrameMs: p95(frameTimes),
        averageFps: averageFrameMs > 0 ? 1000 / averageFrameMs : 0,
        dpr: pixelRatio(),
        requestedQuality: config.quality,
        quality: resolvedQuality,
        drawCalls: renderer.info.render.calls,
        visibleHotspotCount: Math.min(budget.hotspots, hotspotResult.count),
        visiblePaperProxyCount: Math.min(budget.papers, paperResult.count),
        environmentStarCount: Math.min(budget.environment, environmentResult.count),
        dustCount: Math.min(budget.dust, dustResult.count),
        downgradeReason,
        paused,
        reducedMotion: effectiveReducedMotion,
        fixedTime,
        sourceSnapshotId: payload.sourceSnapshotId,
        gpuRenderer,
        flowModelId: "gravitational-weave-tech-preview",
        flowContractVersion: AGENT_GALAXY_FLOW_CONTRACT_VERSION,
        fieldNodeCount: GRAVITATIONAL_WEAVE_NODE_COUNT,
        semanticCoreTimeOpacity: false,
        semanticBlending: "normal",
        bloomMode: "none",
        depthOfField: false,
        wholeGroupTransform: false,
        cameraMode: config.camera,
        cameraDriftMaxUnits: config.camera === "codrift"
          ? AGENT_GALAXY_FLOW_CAMERA.codriftMaxUnits
          : 0,
        webglAvailable,
      });
    };

    const updateCamera = (timeSeconds: number) => {
      camera.position.copy(initialCameraPosition);
      if (config.camera === "codrift" && !effectiveReducedMotion) {
        const phase = timeSeconds * (Math.PI * 2 / AGENT_GALAXY_FLOW_CAMERA.codriftPeriodSeconds);
        const drift = AGENT_GALAXY_FLOW_CAMERA.codriftMaxUnits;
        camera.position.add(cameraDrift.set(
          Math.sin(phase) * drift,
          Math.sin(phase * 2) * drift * 0.22,
          Math.cos(phase) * drift * 0.45,
        ));
      }
      camera.lookAt(0, 0, 0);
    };

    const draw = (timeSeconds: number) => {
      updateWeaveTime(
        materials,
        timeSeconds * config.speed,
      );
      updateCamera(timeSeconds);
      renderer.render(scene, camera);
    };

    const frame = (now: number) => {
      if (disposed || pagePaused) return;
      const delta = Math.min(100, Math.max(0, now - lastFrameAt));
      lastFrameAt = now;
      if (delta > 0) {
        frameTimes.push(delta);
        if (frameTimes.length > 360) frameTimes.shift();
        animationSeconds += Math.min(delta, 50) / 1000;
      }
      draw(animationSeconds);

      if (now - metricsWindowStartedAt >= 2000) {
        const recent = frameTimes.slice(-180);
        const average = recent.length
          ? recent.reduce((sum, value) => sum + value, 0) / recent.length
          : 0;
        const fps = average > 0 ? 1000 / average : 0;
        const targetFps = resolvedQuality === "high" ? 50 : 30;
        if (config.quality === "auto" && fps > 0 && fps < targetFps) {
          lowPerformanceWindows += 1;
        } else {
          lowPerformanceWindows = 0;
        }

        if (config.quality === "auto" && lowPerformanceWindows >= 2 && !downgradeReason) {
          if (resolvedQuality === "high") {
            resolvedQuality = "balanced";
            budget = AGENT_GALAXY_FLOW_QUALITY_BUDGET.balanced;
            downgradeReason = "frame-budget-high-to-balanced";
          } else {
            budget = {
              ...AGENT_GALAXY_FLOW_QUALITY_BUDGET.balanced,
              environment: 400,
              dust: 800,
            };
            downgradeReason = "frame-budget-decorative-reduction";
          }
          applyBudget(budget);
          lowPerformanceWindows = 0;
        }
        reportMetrics(false);
        metricsWindowStartedAt = now;
      }
      raf = requestAnimationFrame(frame);
    };

    const staticTime = config.fixedTimeSeconds ?? (effectiveReducedMotion ? 8 : 0);
    if (fixedTime || effectiveReducedMotion) {
      draw(staticTime);
      reportMetrics(true);
    } else if (!pagePaused) {
      draw(0);
      reportMetrics(false);
      raf = requestAnimationFrame(frame);
    }

    const handleVisibility = () => {
      pagePaused = document.hidden;
      if (pagePaused) {
        cancelAnimationFrame(raf);
        reportMetrics(true);
        return;
      }
      lastFrameAt = performance.now();
      metricsWindowStartedAt = lastFrameAt;
      if (fixedTime || effectiveReducedMotion) {
        draw(staticTime);
        reportMetrics(true);
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      cancelAnimationFrame(raf);
      webglAvailable = false;
      setFallbackReason("WebGL context lost");
      reportMetrics(true);
    };
    document.addEventListener("visibilitychange", handleVisibility);
    renderer.domElement.addEventListener("webglcontextlost", handleContextLost);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", handleVisibility);
      renderer.domElement.removeEventListener("webglcontextlost", handleContextLost);
      resizeObserver.disconnect();
      scene.remove(dustPoints, environmentPoints, paperPoints, hotspotPoints);
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [config, onMetrics, payload, reducedMotion]);

  return (
    <div
      ref={hostRef}
      className="agent-galaxy-flow"
      data-source-snapshot={payload.sourceSnapshotId}
      data-flow-model="gravitational-weave-tech-preview"
      data-semantic-blending="normal"
      data-semantic-time-opacity="false"
      data-whole-group-transform="false"
    >
      {fallbackReason ? (
        <div className="agent-galaxy-flow__fallback" role="img" aria-label="静态深空背景">
          <span>{fallbackReason}</span>
        </div>
      ) : null}
    </div>
  );
}

export default AgentGalaxyFlowCanvas;
