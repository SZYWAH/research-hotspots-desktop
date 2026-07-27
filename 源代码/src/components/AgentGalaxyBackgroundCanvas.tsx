import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

import type { AgentGalaxyBackgroundPayloadV1 } from "../types";
import type {
  AgentGalaxyBackgroundMotionState,
  AgentGalaxyBackgroundPreset,
  AgentGalaxyBackgroundQuality,
} from "../lib/agentGalaxyBackgroundReview";

export type AgentGalaxyBackgroundMetrics = {
  averageFrameMs: number;
  p95FrameMs: number;
  averageFps: number;
  dpr: number;
  requestedQuality: AgentGalaxyBackgroundQuality;
  quality: "balanced" | "high";
  drawCalls: number;
  visibleHotspotCount: number;
  visiblePaperProxyCount: number;
  environmentStarCount: number;
  filamentSegmentCount: number;
  downgradeReason?: string;
  paused: boolean;
  reducedMotion: boolean;
  sourceSnapshotId: string;
  gpuRenderer: string;
  bloomMode: "shader-local";
};

type Props = {
  payload: AgentGalaxyBackgroundPayloadV1;
  preset: AgentGalaxyBackgroundPreset;
  motionState: AgentGalaxyBackgroundMotionState;
  quality: AgentGalaxyBackgroundQuality;
  reducedMotion?: boolean;
  onMetrics?: (metrics: AgentGalaxyBackgroundMetrics) => void;
  fixedTimeSeconds?: number;
};

type MotionProfile = {
  travel: number;
  energy: number;
  pulse: number;
  interference: number;
};

const MOTION_PROFILES: Record<AgentGalaxyBackgroundMotionState, MotionProfile> = {
  idle: { travel: 1, energy: 1, pulse: 1, interference: 1 },
  input: { travel: 0.42, energy: 0.76, pulse: 0.4, interference: 0.7 },
  answer: { travel: 0.24, energy: 0.64, pulse: 0.58, interference: 0.55 },
  reading: { travel: 0.08, energy: 0.46, pulse: 0.1, interference: 0.35 },
};

const PAPER_LIMITS = {
  high: 24,
  balanced: 12,
  degraded: 8,
} as const;

const ENVIRONMENT_COUNTS = {
  high: 6000,
  balanced: 2500,
  degraded: 1500,
} as const;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function smootherstep(value: number) {
  const t = clamp(value, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function mixProfile(left: MotionProfile, right: MotionProfile, amount: number): MotionProfile {
  return {
    travel: THREE.MathUtils.lerp(left.travel, right.travel, amount),
    energy: THREE.MathUtils.lerp(left.energy, right.energy, amount),
    pulse: THREE.MathUtils.lerp(left.pulse, right.pulse, amount),
    interference: THREE.MathUtils.lerp(left.interference, right.interference, amount),
  };
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

function trendEnergy(trend: string) {
  const normalized = trend.toLowerCase();
  if (normalized.includes("surg") || normalized.includes("快速")) return 1;
  if (normalized.includes("grow") || normalized.includes("上升")) return 0.86;
  if (normalized.includes("declin") || normalized.includes("下降")) return 0.58;
  return 0.72;
}

function makePointGeometry(
  positions: number[],
  colors: number[],
  sizes: number[],
  seeds: number[],
  energies: number[],
) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("aSize", new THREE.Float32BufferAttribute(sizes, 1));
  geometry.setAttribute("aSeed", new THREE.Float32BufferAttribute(seeds, 1));
  geometry.setAttribute("aEnergy", new THREE.Float32BufferAttribute(energies, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

function createPaperGeometry(
  payload: AgentGalaxyBackgroundPayloadV1,
  perHotspotLimit: number,
) {
  const hotspotById = new Map(payload.hotspots.map((hotspot) => [hotspot.id, hotspot]));
  const used = new Map<string, number>();
  const positions: number[] = [];
  const colors: number[] = [];
  const sizes: number[] = [];
  const seeds: number[] = [];
  const energies: number[] = [];
  const color = new THREE.Color();
  for (const paper of payload.papers) {
    const count = used.get(paper.hotspotId) ?? 0;
    if (count >= perHotspotLimit) continue;
    const hotspot = hotspotById.get(paper.hotspotId);
    if (!hotspot) continue;
    used.set(paper.hotspotId, count + 1);
    positions.push(
      hotspot.position[0] + paper.offset[0],
      hotspot.position[1] + paper.offset[1],
      hotspot.position[2] + paper.offset[2],
    );
    color.set(paper.color);
    colors.push(color.r, color.g, color.b);
    const yearEnergy = paper.year ? clamp((paper.year - 2012) / 16, 0.35, 1) : 0.54;
    sizes.push(0.78 + yearEnergy * 0.54);
    seeds.push(hashString32(paper.id) / 0xffff_ffff);
    energies.push(0.56 + yearEnergy * 0.32);
  }
  return {
    geometry: makePointGeometry(positions, colors, sizes, seeds, energies),
    count: positions.length / 3,
  };
}

function createHotspotGeometry(payload: AgentGalaxyBackgroundPayloadV1) {
  const positions: number[] = [];
  const colors: number[] = [];
  const sizes: number[] = [];
  const seeds: number[] = [];
  const energies: number[] = [];
  const color = new THREE.Color();
  for (const hotspot of payload.hotspots) {
    positions.push(...hotspot.position);
    color.set(hotspot.color);
    colors.push(color.r, color.g, color.b);
    sizes.push(clamp(3.2 + Math.log2(Math.max(2, hotspot.paperCount)) * 0.54, 4.1, 8.4));
    seeds.push(hashString32(hotspot.id) / 0xffff_ffff);
    energies.push(clamp((hotspot.confidence ?? 0.72) * 0.7 + trendEnergy(hotspot.trend) * 0.3, 0.5, 1));
  }
  return makePointGeometry(positions, colors, sizes, seeds, energies);
}

function createEnvironmentGeometry(payload: AgentGalaxyBackgroundPayloadV1) {
  const random = createRandom(hashString32(`${payload.sourceSnapshotId}:environment-v1`));
  const positions: number[] = [];
  const colors: number[] = [];
  const sizes: number[] = [];
  const seeds: number[] = [];
  const energies: number[] = [];
  const warm = new THREE.Color("#d9ecff");
  const cool = new THREE.Color("#7db9dc");
  const color = new THREE.Color();
  for (let index = 0; index < ENVIRONMENT_COUNTS.high; index += 1) {
    const radius = 62 + random() * 150;
    const longitude = random() * Math.PI * 2;
    const latitude = Math.acos(2 * random() - 1);
    positions.push(
      Math.sin(latitude) * Math.cos(longitude) * radius,
      Math.cos(latitude) * radius * 0.78,
      Math.sin(latitude) * Math.sin(longitude) * radius - 24,
    );
    color.copy(cool).lerp(warm, random() * 0.68);
    colors.push(color.r, color.g, color.b);
    sizes.push(0.34 + random() * 0.92);
    seeds.push(random());
    energies.push(0.28 + random() * 0.52);
  }
  return makePointGeometry(positions, colors, sizes, seeds, energies);
}

function createFilamentGeometry(payload: AgentGalaxyBackgroundPayloadV1) {
  const positions: number[] = [];
  const colors: number[] = [];
  const connections = new Set<string>();
  const color = new THREE.Color();
  const mixed = new THREE.Color();
  for (let index = 0; index < payload.hotspots.length; index += 1) {
    const source = payload.hotspots[index];
    const nearest = payload.hotspots
      .map((target, targetIndex) => ({
        target,
        targetIndex,
        distance: targetIndex === index
          ? Number.POSITIVE_INFINITY
          : Math.hypot(
            source.position[0] - target.position[0],
            source.position[1] - target.position[1],
            source.position[2] - target.position[2],
          ),
      }))
      .sort((left, right) => left.distance - right.distance)
      .slice(0, 2);
    for (const candidate of nearest) {
      const key = [index, candidate.targetIndex].sort((left, right) => left - right).join(":");
      if (connections.has(key)) continue;
      connections.add(key);
      positions.push(...source.position, ...candidate.target.position);
      color.set(source.color);
      mixed.set(candidate.target.color);
      colors.push(color.r, color.g, color.b, mixed.r, mixed.g, mixed.b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  return { geometry, segmentCount: positions.length / 6 };
}

function createSignalRingGeometry(payload: AgentGalaxyBackgroundPayloadV1) {
  const positions: number[] = [];
  const colors: number[] = [];
  const color = new THREE.Color();
  const selected = [...payload.hotspots]
    .sort((left, right) => (
      (right.confidence ?? 0) - (left.confidence ?? 0)
      || right.paperCount - left.paperCount
      || left.id.localeCompare(right.id)
    ))
    .slice(0, 14);
  const segmentsPerRing = 40;
  for (const hotspot of selected) {
    color.set(hotspot.color);
    const radius = clamp(1.1 + Math.log2(Math.max(2, hotspot.paperCount)) * 0.11, 1.4, 2.25);
    const orientation = hashString32(hotspot.id) % 3;
    for (let index = 0; index < segmentsPerRing; index += 1) {
      const angleA = (index / segmentsPerRing) * Math.PI * 2;
      const angleB = ((index + 1) / segmentsPerRing) * Math.PI * 2;
      const point = (angle: number) => {
        const cosine = Math.cos(angle) * radius;
        const sine = Math.sin(angle) * radius;
        if (orientation === 0) {
          return [hotspot.position[0] + cosine, hotspot.position[1] + sine, hotspot.position[2]];
        }
        if (orientation === 1) {
          return [hotspot.position[0] + cosine, hotspot.position[1], hotspot.position[2] + sine];
        }
        return [hotspot.position[0], hotspot.position[1] + cosine, hotspot.position[2] + sine];
      };
      positions.push(...point(angleA), ...point(angleB));
      colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  return {
    geometry,
    ringCount: selected.length,
    segmentsPerRing,
  };
}

function createPointMaterial(kind: 0 | 1 | 2, pointScale: number, opacity: number) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: 1 },
      uOpacity: { value: opacity },
      uPointScale: { value: pointScale },
      uFocusDistance: { value: 105 },
      uFocusRange: { value: 82 },
      uPulseStrength: { value: 0 },
      uMotion: { value: 1 },
      uKind: { value: kind },
    },
    vertexShader: `
      attribute float aSize;
      attribute float aSeed;
      attribute float aEnergy;
      uniform float uPixelRatio;
      uniform float uPointScale;
      uniform float uFocusDistance;
      uniform float uFocusRange;
      varying vec3 vColor;
      varying float vSeed;
      varying float vEnergy;
      varying float vFocus;
      void main() {
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        float viewDepth = max(12.0, -viewPosition.z);
        float focusDelta = abs(viewDepth - uFocusDistance);
        vFocus = mix(0.46, 1.0, 1.0 - clamp(focusDelta / uFocusRange, 0.0, 1.0));
        float perspective = 238.0 / viewDepth;
        float maximumSize = uPointScale > 1.8 ? 46.0 : 28.0;
        gl_PointSize = clamp(aSize * uPointScale * uPixelRatio * perspective * mix(0.78, 1.0, vFocus), 0.55, maximumSize);
        gl_Position = projectionMatrix * viewPosition;
        vColor = color;
        vSeed = aSeed;
        vEnergy = aEnergy;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uOpacity;
      uniform float uPulseStrength;
      uniform float uMotion;
      uniform float uKind;
      varying vec3 vColor;
      varying float vSeed;
      varying float vEnergy;
      varying float vFocus;
      void main() {
        vec2 centered = gl_PointCoord - vec2(0.5);
        float radius = length(centered);
        if (radius > 0.5) discard;
        float core = 1.0 - smoothstep(0.02, 0.16, radius);
        float body = 1.0 - smoothstep(0.06, 0.48, radius);
        float halo = 1.0 - smoothstep(0.18, 0.5, radius);
        float ambientTwinkle = sin(uTime * (0.34 + vSeed * 0.22) + vSeed * 41.0);
        float dataBreath = sin(uTime * 0.18 + vSeed * 19.0);
        float modulation = uKind < 0.5
          ? 1.0 + ambientTwinkle * 0.12 * uMotion
          : 1.0 + dataBreath * 0.035 * uMotion;
        float signal = 1.0 + uPulseStrength * (0.5 + 0.5 * sin(uTime * 0.72 - vSeed * 15.0));
        float alphaProfile = uKind > 1.5
          ? core * 0.92 + body * 0.5 + halo * 0.22
          : core * 0.72 + body * 0.46 + halo * 0.09;
        float alpha = alphaProfile * uOpacity * vEnergy * vFocus * modulation * signal;
        if (alpha < 0.004) discard;
        vec3 whiteCore = mix(vColor, vec3(0.94, 0.985, 1.0), core * (uKind > 1.5 ? 0.78 : 0.34));
        gl_FragColor = vec4(whiteCore * (0.72 + core * 0.72), alpha);
      }
    `,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    toneMapped: true,
  });
}

function detectGpuRenderer(renderer: THREE.WebGLRenderer) {
  const context = renderer.getContext();
  const extension = context.getExtension("WEBGL_debug_renderer_info");
  if (!extension) return "WebGL renderer unavailable";
  return String(context.getParameter(extension.UNMASKED_RENDERER_WEBGL) || "Unknown WebGL renderer");
}

function resolveInitialQuality(
  requested: AgentGalaxyBackgroundQuality,
  gpuRenderer: string,
): "balanced" | "high" {
  if (requested === "high") return "high";
  if (requested === "balanced") return "balanced";
  return /nvidia|geforce|radeon|rx\s|rtx/i.test(gpuRenderer) ? "high" : "balanced";
}

function p95(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
}

function setCameraPose(
  camera: THREE.PerspectiveCamera,
  distance: number,
  azimuthDegrees: number,
  elevationDegrees: number,
) {
  const azimuth = THREE.MathUtils.degToRad(azimuthDegrees);
  const elevation = THREE.MathUtils.degToRad(elevationDegrees);
  const horizontal = distance * Math.cos(elevation);
  camera.position.set(
    horizontal * Math.cos(azimuth),
    distance * Math.sin(elevation),
    horizontal * Math.sin(azimuth),
  );
  camera.lookAt(0, 0, 0);
}

export function AgentGalaxyBackgroundCanvas({
  payload,
  preset,
  motionState,
  quality,
  reducedMotion = false,
  onMetrics,
  fixedTimeSeconds,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const motionProfileRef = useRef<MotionProfile>(MOTION_PROFILES[motionState]);
  const motionStateRef = useRef(motionState);
  const motionTransitionRef = useRef({
    from: MOTION_PROFILES[motionState],
    to: MOTION_PROFILES[motionState],
    startedAt: performance.now(),
  });
  const [fallbackReason, setFallbackReason] = useState("");

  useEffect(() => {
    motionStateRef.current = motionState;
    motionTransitionRef.current = {
      from: motionProfileRef.current,
      to: MOTION_PROFILES[motionState],
      startedAt: performance.now(),
    };
  }, [motionState]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    setFallbackReason("");

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: false,
        alpha: false,
        powerPreference: quality === "high"
          ? "high-performance"
          : quality === "balanced"
            ? "low-power"
            : "default",
      });
    } catch (error) {
      setFallbackReason(error instanceof Error ? error.message : "WebGL unavailable");
      return;
    }

    renderer.setClearColor(0x01040a, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.domElement.className = "agent-galaxy-background__canvas";
    renderer.domElement.setAttribute("aria-label", "基于理论星图的沉浸式科研空间");
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(48, 1, 0.4, 420);
    setCameraPose(camera, 105, 270, 50);
    const semanticGroup = new THREE.Group();
    scene.add(semanticGroup);

    const gpuRenderer = detectGpuRenderer(renderer);
    let resolvedQuality = resolveInitialQuality(quality, gpuRenderer);
    let adaptiveTier: "normal" | "degraded" = "normal";
    let downgradeReason: string | undefined;
    let visiblePaperLimit: number = PAPER_LIMITS[resolvedQuality];
    let environmentCount: number = ENVIRONMENT_COUNTS[resolvedQuality];
    let currentDprCap = resolvedQuality === "high" ? 1.5 : 1;

    const environmentGeometry = createEnvironmentGeometry(payload);
    environmentGeometry.setDrawRange(0, environmentCount);
    const environmentMaterial = createPointMaterial(
      0,
      preset === "voyage" ? 1.05 : preset === "breath" ? 0.82 : 0.66,
      preset === "voyage" ? 0.7 : preset === "breath" ? 0.56 : 0.4,
    );
    const environmentPoints = new THREE.Points(environmentGeometry, environmentMaterial);
    scene.add(environmentPoints);

    let paperResult = createPaperGeometry(payload, visiblePaperLimit);
    const paperMaterial = createPointMaterial(1, preset === "breath" ? 1.12 : 0.94, preset === "signal" ? 0.46 : 0.58);
    const paperPoints = new THREE.Points(paperResult.geometry, paperMaterial);
    semanticGroup.add(paperPoints);

    const hotspotGeometry = createHotspotGeometry(payload);
    const hotspotGlowMaterial = createPointMaterial(2, preset === "breath" ? 3.05 : 2.54, preset === "signal" ? 0.18 : 0.24);
    const hotspotGlowPoints = new THREE.Points(hotspotGeometry, hotspotGlowMaterial);
    const hotspotMaterial = createPointMaterial(2, preset === "signal" ? 1.16 : 1.3, preset === "signal" ? 0.68 : 0.82);
    const hotspotPoints = new THREE.Points(hotspotGeometry, hotspotMaterial);
    semanticGroup.add(hotspotGlowPoints, hotspotPoints);

    const filamentResult = createFilamentGeometry(payload);
    const filamentMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: preset === "breath" ? 0.11 : preset === "signal" ? 0.075 : 0.055,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const filaments = new THREE.LineSegments(filamentResult.geometry, filamentMaterial);
    filamentResult.geometry.setDrawRange(
      0,
      Math.min(
        filamentResult.segmentCount,
        resolvedQuality === "high" ? 240 : 120,
      ) * 2,
    );
    semanticGroup.add(filaments);

    const signalRingResult = createSignalRingGeometry(payload);
    const signalRingMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: preset === "signal" ? 0.16 : 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const signalRings = new THREE.LineSegments(signalRingResult.geometry, signalRingMaterial);
    signalRingResult.geometry.setDrawRange(
      0,
      signalRingResult.segmentsPerRing
        * (resolvedQuality === "high" ? signalRingResult.ringCount : 8)
        * 2,
    );
    semanticGroup.add(signalRings);

    const pointMaterials = [
      environmentMaterial,
      paperMaterial,
      hotspotGlowMaterial,
      hotspotMaterial,
    ];
    const frameTimes: number[] = [];
    let lastFrameAt = performance.now();
    let metricsWindowStartedAt = lastFrameAt;
    let animationSeconds = 0;
    let raf = 0;
    let disposed = false;
    let pagePaused = document.hidden;
    let lowPerformanceWindows = 0;

    const targetFps = () => motionStateRef.current === "answer" ? 24 : 30;
    const pixelRatio = () => Math.min(window.devicePixelRatio || 1, currentDprCap);

    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(pixelRatio());
      renderer.setSize(width, height, false);
      for (const material of pointMaterials) {
        material.uniforms.uPixelRatio.value = pixelRatio();
      }
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();

    const applyAdaptiveQuality = (next: "balanced" | "degraded", reason: string) => {
      downgradeReason = reason;
      if (next === "balanced") {
        resolvedQuality = "balanced";
        adaptiveTier = "normal";
        visiblePaperLimit = PAPER_LIMITS.balanced;
        environmentCount = ENVIRONMENT_COUNTS.balanced;
        currentDprCap = 1;
      } else {
        resolvedQuality = "balanced";
        adaptiveTier = "degraded";
        visiblePaperLimit = PAPER_LIMITS.degraded;
        environmentCount = ENVIRONMENT_COUNTS.degraded;
        currentDprCap = 0.82;
        filamentMaterial.opacity *= 0.42;
      }
      const nextPaperResult = createPaperGeometry(payload, visiblePaperLimit);
      paperPoints.geometry.dispose();
      paperPoints.geometry = nextPaperResult.geometry;
      paperResult = nextPaperResult;
      environmentGeometry.setDrawRange(0, environmentCount);
      filamentResult.geometry.setDrawRange(
        0,
        Math.min(filamentResult.segmentCount, next === "degraded" ? 64 : 120) * 2,
      );
      signalRingResult.geometry.setDrawRange(
        0,
        signalRingResult.segmentsPerRing * (next === "degraded" ? 5 : 8) * 2,
      );
      resize();
    };

    const reportMetrics = (paused: boolean) => {
      const averageFrameMs = frameTimes.length
        ? frameTimes.reduce((sum, value) => sum + value, 0) / frameTimes.length
        : 0;
      const averageFps = averageFrameMs > 0 ? 1000 / averageFrameMs : 0;
      onMetrics?.({
        averageFrameMs,
        p95FrameMs: p95(frameTimes),
        averageFps,
        dpr: pixelRatio(),
        requestedQuality: quality,
        quality: resolvedQuality,
        drawCalls: renderer.info.render.calls,
        visibleHotspotCount: payload.hotspots.length,
        visiblePaperProxyCount: paperResult.count,
        environmentStarCount: environmentCount,
        filamentSegmentCount: Math.min(
          filamentResult.segmentCount,
          adaptiveTier === "degraded" ? 64 : resolvedQuality === "high" ? 240 : 120,
        ),
        downgradeReason,
        paused,
        reducedMotion,
        sourceSnapshotId: payload.sourceSnapshotId,
        gpuRenderer,
        bloomMode: "shader-local",
      });
    };

    const renderFrame = (timeSeconds: number, profile: MotionProfile) => {
      const travel = reducedMotion ? 0 : profile.travel;
      const energy = profile.energy;
      if (preset === "voyage") {
        setCameraPose(
          camera,
          105 - (1 - Math.cos(timeSeconds * 0.036)) * 4.8 * travel,
          270 + Math.sin(timeSeconds * 0.055) * 4.8 * travel,
          50 + Math.sin(timeSeconds * 0.041) * 2.2 * travel,
        );
        semanticGroup.rotation.set(
          Math.sin(timeSeconds * 0.021) * 0.018 * travel,
          Math.sin(timeSeconds * 0.026) * 0.055 * travel,
          0,
        );
        semanticGroup.scale.set(1.02, 0.98, 0.76);
      } else if (preset === "breath") {
        const breath = 1 + Math.sin(timeSeconds * 0.23) * 0.018 * energy;
        setCameraPose(
          camera,
          105,
          270 + Math.sin(timeSeconds * 0.038) * 2.1 * travel,
          50 + Math.sin(timeSeconds * 0.032) * 1.2 * travel,
        );
        semanticGroup.rotation.set(0, Math.sin(timeSeconds * 0.019) * 0.028 * travel, 0);
        semanticGroup.scale.set(1.01 * breath, 0.98 * breath, 0.83 * breath);
      } else {
        setCameraPose(
          camera,
          105,
          270 + Math.sin(timeSeconds * 0.028) * 1.4 * travel,
          50 + Math.sin(timeSeconds * 0.024) * 0.7 * travel,
        );
        semanticGroup.rotation.set(0, Math.sin(timeSeconds * 0.014) * 0.018 * travel, 0);
        semanticGroup.scale.set(1, 0.98, 0.88);
      }
      environmentPoints.rotation.y = Math.sin(timeSeconds * 0.012) * 0.026 * travel;
      environmentPoints.rotation.x = Math.sin(timeSeconds * 0.009) * 0.01 * travel;
      const signalPulse = preset === "signal"
        ? (0.08 + 0.22 * (0.5 + 0.5 * Math.sin(timeSeconds * 0.68))) * profile.pulse
        : preset === "breath" ? 0.035 * profile.pulse : 0;
      for (const material of pointMaterials) {
        material.uniforms.uTime.value = timeSeconds;
        material.uniforms.uMotion.value = reducedMotion ? 0 : profile.interference;
        material.uniforms.uPulseStrength.value = reducedMotion ? 0 : signalPulse;
        material.uniforms.uFocusDistance.value = camera.position.length();
      }
      hotspotMaterial.uniforms.uOpacity.value = (preset === "signal" ? 0.68 : 0.82) * energy;
      hotspotGlowMaterial.uniforms.uOpacity.value = (preset === "signal" ? 0.18 : 0.24) * energy;
      paperMaterial.uniforms.uOpacity.value = (preset === "signal" ? 0.46 : 0.58) * (0.72 + energy * 0.28);
      filamentMaterial.opacity = (preset === "breath" ? 0.11 : preset === "signal" ? 0.075 : 0.055)
        * profile.interference
        * (adaptiveTier === "degraded" ? 0.42 : 1);
      signalRingMaterial.opacity = preset === "signal" && !reducedMotion
        ? (0.08 + 0.16 * (0.5 + 0.5 * Math.sin(timeSeconds * 0.78))) * profile.pulse
        : preset === "signal" ? 0.08 : 0;
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
      const transition = motionTransitionRef.current;
      const transitionAmount = smootherstep((now - transition.startedAt) / 900);
      const profile = mixProfile(transition.from, transition.to, transitionAmount);
      motionProfileRef.current = profile;
      renderFrame(animationSeconds, profile);

      if (now - metricsWindowStartedAt >= 2000) {
        const recent = frameTimes.slice(-180);
        const average = recent.length
          ? recent.reduce((sum, value) => sum + value, 0) / recent.length
          : 0;
        const fps = average > 0 ? 1000 / average : 0;
        if (fps > 0 && fps < targetFps()) {
          lowPerformanceWindows += 1;
        } else {
          lowPerformanceWindows = 0;
        }
        if (lowPerformanceWindows >= 2 && !downgradeReason) {
          if (resolvedQuality === "high") {
            applyAdaptiveQuality("balanced", "frame-budget-high-to-balanced");
          } else {
            applyAdaptiveQuality("degraded", "frame-budget-balanced-minimum");
          }
          lowPerformanceWindows = 0;
        }
        reportMetrics(false);
        metricsWindowStartedAt = now;
      }
      raf = requestAnimationFrame(frame);
    };

    const staticTime = Number.isFinite(fixedTimeSeconds) ? Math.max(0, fixedTimeSeconds ?? 0) : undefined;
    if (reducedMotion || staticTime !== undefined) {
      const profile = MOTION_PROFILES[motionState];
      motionProfileRef.current = profile;
      renderFrame(staticTime ?? 0, profile);
      reportMetrics(true);
    } else if (!pagePaused) {
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
      raf = requestAnimationFrame(frame);
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", handleVisibility);
      resizeObserver.disconnect();
      scene.remove(environmentPoints);
      semanticGroup.remove(paperPoints, hotspotGlowPoints, hotspotPoints, filaments, signalRings);
      environmentGeometry.dispose();
      paperPoints.geometry.dispose();
      hotspotGeometry.dispose();
      filamentResult.geometry.dispose();
      signalRingResult.geometry.dispose();
      for (const material of pointMaterials) material.dispose();
      filamentMaterial.dispose();
      signalRingMaterial.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [fixedTimeSeconds, onMetrics, payload, preset, quality, reducedMotion]);

  return (
    <div
      ref={hostRef}
      className={`agent-galaxy-background agent-galaxy-background--${preset}`}
      data-source-snapshot={payload.sourceSnapshotId}
      data-visual-config={payload.visualConfigVersion}
    >
      {fallbackReason ? (
        <div className="agent-galaxy-background__fallback" role="img" aria-label="静态深空背景">
          <span>WEBGL FALLBACK</span>
        </div>
      ) : null}
    </div>
  );
}

export default AgentGalaxyBackgroundCanvas;
