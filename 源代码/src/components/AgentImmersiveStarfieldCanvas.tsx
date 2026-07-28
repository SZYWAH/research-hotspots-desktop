import { useEffect, useRef } from "react";
import * as THREE from "three";
import type {
  AgentImmersiveBackgroundPayloadV2,
  AgentImmersiveBackgroundPaperV2,
} from "../types";

const FIELD_SIZE = 45;
const HOTSPOT_CORE_RADIUS = FIELD_SIZE * 0.4;
const MAX_PIXEL_RATIO = 2;

type AgentImmersiveStarfieldCanvasProps = {
  payload: AgentImmersiveBackgroundPayloadV2;
  elapsedSeconds: number;
  reducedMotion?: boolean;
  onElapsedSecondsChange?: (elapsedSeconds: number) => void;
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

const NOISE_GLSL = `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
    i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(
    dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)
  ));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;
  vec4 m = max(
    0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)),
    0.0
  );
  m *= m;
  return 42.0 * dot(
    m * m,
    vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3))
  );
}

vec3 flowNoise(vec3 p) {
  return vec3(
    snoise(p + vec3(13.1, 7.7, 3.4)),
    snoise(p.yzx + vec3(5.2, 19.3, 11.8)),
    snoise(p.zxy + vec3(17.4, 2.9, 23.6))
  );
}

vec3 immersiveCurlOffset(vec3 pos, float time) {
  vec3 n1 = flowNoise(pos * 0.10 + vec3(time * 0.05));
  vec3 n2 = flowNoise(pos * 0.20 - vec3(time * 0.03));
  return vec3(
    n1.y - n2.z,
    n2.x - n1.z,
    n1.x - n2.y
  ) * 0.40;
}
`;

const VERTEX_SHADER = `
uniform float uTime;
uniform float uPixelRatio;
uniform float uLayerScale;

attribute vec3 aBasePos;
attribute float aSize;
attribute float aType;
attribute vec3 aColor;
attribute float aSeed;

varying vec3 vColor;
varying float vType;
varying float vPointSize;
varying float vBrightness;

${NOISE_GLSL}

void main() {
  vec3 pos = aBasePos + immersiveCurlOffset(aBasePos, uTime * 0.10);

  // Preserve the reference composition: the central dialogue remains calm,
  // without creating a hard circular hole in the starfield.
  float centreDistance = length(pos.xy);
  float repel = smoothstep(2.5, 0.0, centreDistance);
  pos.xy += normalize(pos.xy + vec2(0.001)) * repel * 1.5;

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

function createGeometry(payload: AgentImmersiveBackgroundPayloadV2) {
  const attributes = buildSpatialAttributes(payload);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(attributes.basePositions.slice(), 3));
  geometry.setAttribute("aBasePos", new THREE.BufferAttribute(attributes.basePositions, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(attributes.sizes, 1));
  geometry.setAttribute("aType", new THREE.BufferAttribute(attributes.types, 1));
  geometry.setAttribute("aColor", new THREE.BufferAttribute(attributes.colors, 3));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(attributes.seeds, 1));
  return geometry;
}

function createMaterial(
  fragmentShader: string,
  pixelRatio: number,
  layerScale: number,
  corona: boolean,
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
    },
  });
}

export function AgentImmersiveStarfieldCanvas({
  payload,
  elapsedSeconds,
  reducedMotion = false,
  onElapsedSecondsChange,
  onReady,
  onFatalError,
}: AgentImmersiveStarfieldCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const elapsedRef = useRef(Math.max(0, elapsedSeconds));
  const onElapsedRef = useRef(onElapsedSecondsChange);
  const onReadyRef = useRef(onReady);
  const onFatalErrorRef = useRef(onFatalError);

  useEffect(() => {
    onElapsedRef.current = onElapsedSecondsChange;
    onReadyRef.current = onReady;
    onFatalErrorRef.current = onFatalError;
  }, [onElapsedSecondsChange, onFatalError, onReady]);

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
    renderer.domElement.dataset.agentRenderer = "immersive-v2";
    host.appendChild(renderer.domElement);

    const geometry = createGeometry(payload);
    const coreMaterial = createMaterial(CORE_FRAGMENT_SHADER, pixelRatio, 1, false);
    const coronaMaterial = createMaterial(CORONA_FRAGMENT_SHADER, pixelRatio, 1.28, true);
    const corePoints = new THREE.Points(geometry, coreMaterial);
    const coronaPoints = new THREE.Points(geometry, coronaMaterial);
    corePoints.frustumCulled = false;
    coronaPoints.frustumCulled = false;
    corePoints.renderOrder = 1;
    coronaPoints.renderOrder = 2;
    scene.add(corePoints, coronaPoints);

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
    const renderFrame = (nowMs: number) => {
      if (disposed) return;
      const deltaSeconds = Math.min(0.05, Math.max(0, (nowMs - lastFrameMs) / 1000));
      lastFrameMs = nowMs;
      if (!document.hidden && !reducedMotion) {
        elapsedRef.current += deltaSeconds;
      }
      coreMaterial.uniforms.uTime.value = elapsedRef.current;
      coronaMaterial.uniforms.uTime.value = elapsedRef.current;
      renderer.render(scene, camera);
      if (!readyReported) {
        readyReported = true;
        onReadyRef.current?.();
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
    document.addEventListener("visibilitychange", handleVisibility);
    if (reducedMotion) {
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
      resizeObserver.disconnect();
      onElapsedRef.current?.(elapsedRef.current);
      scene.remove(corePoints, coronaPoints);
      coreMaterial.dispose();
      coronaMaterial.dispose();
      geometry.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [payload, reducedMotion]);

  return (
    <div
      ref={hostRef}
      className="agent-immersive-starfield"
      data-paper-count={payload.papers.length}
      data-hotspot-count={payload.hotspots.length}
      data-source-snapshot-id={payload.sourceSnapshotId}
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
