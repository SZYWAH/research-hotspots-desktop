/**
 * 隔离的轨道运动原型（黑白，无颜色 / 无光晕 / 无聚焦）。
 *
 * 只回答一个问题：论文星「原地绕热点转圈 + 相机闭合路径视差」够不够「活」。
 * 这个文件不引用 AgentGalaxyBackgroundCanvas，也不参与既有视觉审计，
 * 删除本文件与 main.tsx 的分支即可完全回退。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import type { AgentGalaxyBackgroundPayloadV1 } from "../types";
import { loadAgentGalaxyBackgroundPayload } from "../lib/agentGalaxyBackgroundReview";
import {
  readAgentGalaxyOrbitPrototypeConfig,
  type AgentGalaxyOrbitPrototypeConfig,
} from "../lib/agentGalaxyOrbitPrototype";
import "./AgentGalaxyOrbitPrototype.css";

/** 相机闭合路径周期（秒）：三个分量频率成整数比，保证严格闭合。 */
const CAMERA_PERIOD_SECONDS = 240;
/** 注视点自身漂移的闭合周期（秒），与相机周期互质，避免两者锁相。 */
const LOOK_PERIOD_SECONDS = 173;
/** 最快 / 最慢轨道周期（秒），按年份插值。 */
const ORBIT_PERIOD_NEW = 70;
const ORBIT_PERIOD_OLD = 200;

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

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

/** 由热点 id 稳定推导轨道面：同一热点的论文共面，形成一个小盘。 */
function orbitBasis(hotspotId: string) {
  const random = createRandom(hashString32(`${hotspotId}:orbit-axis-v1`));
  const axis = new THREE.Vector3(
    random() * 2 - 1,
    random() * 2 - 1,
    random() * 2 - 1,
  );
  if (axis.lengthSq() < 1e-6) axis.set(0, 1, 0);
  axis.normalize();
  const reference = Math.abs(axis.y) > 0.92
    ? new THREE.Vector3(1, 0, 0)
    : new THREE.Vector3(0, 1, 0);
  const u = new THREE.Vector3().crossVectors(reference, axis).normalize();
  const v = new THREE.Vector3().crossVectors(axis, u).normalize();
  return { axis, u, v };
}

type OrbitGeometryResult = {
  geometry: THREE.BufferGeometry;
  count: number;
};

/**
 * 论文星：位置拆成「热点中心 + 轨道基向量 + 半径 + 角速度 + 相位」。
 * 真实位置在 vertex shader 里算，CPU 只上传一次静态属性。
 */
function createOrbitGeometry(payload: AgentGalaxyBackgroundPayloadV1): OrbitGeometryResult {
  const hotspotById = new Map(payload.hotspots.map((hotspot) => [hotspot.id, hotspot]));
  const basisCache = new Map<string, ReturnType<typeof orbitBasis>>();
  const centers: number[] = [];
  const axisU: number[] = [];
  const axisV: number[] = [];
  const radii: number[] = [];
  const omegas: number[] = [];
  const phases: number[] = [];
  const sizes: number[] = [];
  const energies: number[] = [];

  for (const paper of payload.papers) {
    const hotspot = hotspotById.get(paper.hotspotId);
    if (!hotspot) continue;
    let basis = basisCache.get(paper.hotspotId);
    if (!basis) {
      basis = orbitBasis(paper.hotspotId);
      basisCache.set(paper.hotspotId, basis);
    }

    // 复用载荷里现成的 offset 长度作为轨道半径，不重算布局。
    const offset = new THREE.Vector3(...paper.offset);
    const radius = Math.max(0.05, offset.length());

    // 年份 → 角速度：新论文内圈快，旧论文外圈慢。
    const recency = paper.year ? clamp((paper.year - 2012) / 16, 0, 1) : 0.5;
    const period = THREE.MathUtils.lerp(ORBIT_PERIOD_OLD, ORBIT_PERIOD_NEW, recency);
    const omega = (Math.PI * 2) / period;

    // 相位取位置的平滑函数 + 少量 per-id 抖动：邻居协同运动，读成一种物质。
    const spatialPhase = (hotspot.position[0] * 0.06 + hotspot.position[2] * 0.043)
      + (offset.x * 0.5 + offset.z * 0.31);
    const jitter = (hashString32(paper.id) / 0xffff_ffff) * 0.9;
    const phase = spatialPhase + jitter;

    centers.push(...hotspot.position);
    axisU.push(basis.u.x, basis.u.y, basis.u.z);
    axisV.push(basis.v.x, basis.v.y, basis.v.z);
    radii.push(radius);
    omegas.push(omega);
    phases.push(phase);
    sizes.push(0.82 + recency * 0.5);
    energies.push(0.58 + recency * 0.3);
  }

  const geometry = new THREE.BufferGeometry();
  // position 用热点中心占位，真实位置由 shader 计算。
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(centers, 3));
  geometry.setAttribute("aAxisU", new THREE.Float32BufferAttribute(axisU, 3));
  geometry.setAttribute("aAxisV", new THREE.Float32BufferAttribute(axisV, 3));
  geometry.setAttribute("aRadius", new THREE.Float32BufferAttribute(radii, 1));
  geometry.setAttribute("aOmega", new THREE.Float32BufferAttribute(omegas, 1));
  geometry.setAttribute("aPhase", new THREE.Float32BufferAttribute(phases, 1));
  geometry.setAttribute("aSize", new THREE.Float32BufferAttribute(sizes, 1));
  geometry.setAttribute("aEnergy", new THREE.Float32BufferAttribute(energies, 1));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 320);
  return { geometry, count: radii.length };
}

/** 热点星：不转，作为每个小盘的质心参照。 */
function createHotspotGeometry(payload: AgentGalaxyBackgroundPayloadV1) {
  const positions: number[] = [];
  const sizes: number[] = [];
  const energies: number[] = [];
  for (const hotspot of payload.hotspots) {
    positions.push(...hotspot.position);
    sizes.push(clamp(1.9 + Math.log2(Math.max(2, hotspot.paperCount)) * 0.3, 2.2, 4.6));
    energies.push(0.8);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aSize", new THREE.Float32BufferAttribute(sizes, 1));
  geometry.setAttribute("aEnergy", new THREE.Float32BufferAttribute(energies, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * 非语义微尘：均匀充满整个空间，只负责填补语义缺口，没有身份。
 * 它不代表任何论文，所以允许均匀分布，也允许将来随意重生。
 */
function createDustGeometry(payload: AgentGalaxyBackgroundPayloadV1, count: number) {
  const random = createRandom(hashString32(`${payload.sourceSnapshotId}:dust-v1`));
  const positions: number[] = [];
  const sizes: number[] = [];
  const energies: number[] = [];
  for (let index = 0; index < Math.max(0, count); index += 1) {
    // 立方根采样 → 体积内均匀，不在壳上堆积。
    const radius = 6 + Math.cbrt(random()) * 82;
    const longitude = random() * Math.PI * 2;
    const latitude = Math.acos(2 * random() - 1);
    positions.push(
      Math.sin(latitude) * Math.cos(longitude) * radius,
      Math.cos(latitude) * radius,
      Math.sin(latitude) * Math.sin(longitude) * radius,
    );
    sizes.push(0.34 + random() * 0.42);
    energies.push(0.16 + random() * 0.2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aSize", new THREE.Float32BufferAttribute(sizes, 1));
  geometry.setAttribute("aEnergy", new THREE.Float32BufferAttribute(energies, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * 近景亮星：唯一职责是在稳定深空前滑过，提供视差。
 * 分布在相机路径外侧不远处，数量少但明显。
 */
function createNearFieldGeometry(payload: AgentGalaxyBackgroundPayloadV1, count: number) {
  const random = createRandom(hashString32(`${payload.sourceSnapshotId}:near-field-v1`));
  const positions: number[] = [];
  const sizes: number[] = [];
  const energies: number[] = [];
  for (let index = 0; index < Math.max(0, count); index += 1) {
    const radius = 16 + random() * 26;
    const longitude = random() * Math.PI * 2;
    const latitude = Math.acos(2 * random() - 1);
    positions.push(
      Math.sin(latitude) * Math.cos(longitude) * radius,
      Math.cos(latitude) * radius * 0.7,
      Math.sin(latitude) * Math.sin(longitude) * radius,
    );
    sizes.push(1.4 + random() * 1.5);
    energies.push(0.72 + random() * 0.28);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aSize", new THREE.Float32BufferAttribute(sizes, 1));
  geometry.setAttribute("aEnergy", new THREE.Float32BufferAttribute(energies, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

const SHARED_FRAGMENT = `
  uniform float uOpacity;
  varying float vEnergy;
  void main() {
    vec2 centered = gl_PointCoord - vec2(0.5);
    float radius = length(centered);
    if (radius > 0.5) discard;
    // 亮核不随时间变化：本原型完全没有亮度调制。
    float core = 1.0 - smoothstep(0.0, 0.22, radius);
    float body = 1.0 - smoothstep(0.14, 0.46, radius);
    float alpha = (core * 0.86 + body * 0.34) * uOpacity * vEnergy;
    if (alpha < 0.004) discard;
    float luma = 0.68 + core * 0.32;
    gl_FragColor = vec4(vec3(luma), alpha);
  }
`;

/** 论文星材质：位置在 vertex shader 里由轨道参数解析求值。 */
function createOrbitMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: 1 },
      uOpacity: { value: 0.72 },
      uSpin: { value: 1 },
    },
    vertexShader: `
      attribute vec3 aAxisU;
      attribute vec3 aAxisV;
      attribute float aRadius;
      attribute float aOmega;
      attribute float aPhase;
      attribute float aSize;
      attribute float aEnergy;
      uniform float uTime;
      uniform float uPixelRatio;
      uniform float uSpin;
      varying float vEnergy;
      void main() {
        float theta = uTime * aOmega * uSpin + aPhase;
        vec3 orbit = (aAxisU * cos(theta) + aAxisV * sin(theta)) * aRadius;
        vec4 viewPosition = modelViewMatrix * vec4(position + orbit, 1.0);
        float viewDepth = max(6.0, -viewPosition.z);
        // 远处只改尺寸，不改亮度。
        gl_PointSize = clamp(aSize * uPixelRatio * (250.0 / viewDepth), 1.5 * uPixelRatio, 26.0);
        gl_Position = projectionMatrix * viewPosition;
        vEnergy = aEnergy;
      }
    `,
    fragmentShader: SHARED_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
  });
}

/** 静止层材质（热点与近景共用）。 */
function createStaticMaterial(opacity: number, minPixels: number) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uPixelRatio: { value: 1 },
      uOpacity: { value: opacity },
    },
    vertexShader: `
      attribute float aSize;
      attribute float aEnergy;
      uniform float uPixelRatio;
      varying float vEnergy;
      void main() {
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        float viewDepth = max(6.0, -viewPosition.z);
        gl_PointSize = clamp(aSize * uPixelRatio * (250.0 / viewDepth), ${minPixels.toFixed(1)} * uPixelRatio, 34.0);
        gl_Position = projectionMatrix * viewPosition;
        vEnergy = aEnergy;
      }
    `,
    fragmentShader: SHARED_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
  });
}

/**
 * 相机闭合路径：三个分量频率成整数比（2:3:1），周期严格为 CAMERA_PERIOD_SECONDS。
 *
 * 相机留在星图空心核内（热点最内层 |pos| ≈ 10.7），从里往外看，
 * 星场四面包住画面而不是缩成画面中央的一个球。
 */
function cameraPosition(target: THREE.Vector3, timeSeconds: number, camScale: number, radius: number) {
  const base = (Math.PI * 2) / CAMERA_PERIOD_SECONDS;
  const t = timeSeconds * camScale;
  return target.set(
    Math.sin(base * 2 * t) * radius,
    Math.sin(base * 3 * t) * radius * 0.42,
    Math.cos(base * 1 * t) * radius,
  );
}

/**
 * 注视点：自身也在缓慢漂移的闭合曲线，且远离原点。
 * 视线与原点解耦，运动才读成「穿过星场」而不是「星场在你面前打转」。
 */
function lookAtPoint(target: THREE.Vector3, timeSeconds: number, camScale: number) {
  const base = (Math.PI * 2) / LOOK_PERIOD_SECONDS;
  const t = timeSeconds * camScale;
  return target.set(
    Math.sin(base * 1 * t) * 46,
    Math.sin(base * 2 * t) * 20,
    Math.cos(base * 3 * t) * 46,
  );
}

type SceneProps = {
  payload: AgentGalaxyBackgroundPayloadV1;
  config: AgentGalaxyOrbitPrototypeConfig;
};

function OrbitScene({ payload, config }: SceneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [stats, setStats] = useState({
    fps: 0,
    orbitCount: 0,
    gpu: "",
    onScreen: 0,
    emptyCellRatio: 0,
    densityRatio: 0,
  });
  const [fallback, setFallback] = useState("");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
    } catch (reason) {
      setFallback(reason instanceof Error ? reason.message : "WebGL unavailable");
      return;
    }
    renderer.setClearColor(0x01040a, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.className = "agent-orbit-prototype__canvas";
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(48, 1, 0.4, 520);

    const orbit = createOrbitGeometry(payload);
    const orbitMaterial = createOrbitMaterial();
    orbitMaterial.uniforms.uSpin.value = config.spin;
    const orbitPoints = new THREE.Points(orbit.geometry, orbitMaterial);
    orbitPoints.frustumCulled = false;
    scene.add(orbitPoints);

    const hotspotGeometry = createHotspotGeometry(payload);
    const hotspotMaterial = createStaticMaterial(0.9, 2);
    scene.add(new THREE.Points(hotspotGeometry, hotspotMaterial));

    const nearGeometry = createNearFieldGeometry(payload, config.near);
    const nearMaterial = createStaticMaterial(0.95, 2.5);
    scene.add(new THREE.Points(nearGeometry, nearMaterial));

    const dustGeometry = createDustGeometry(payload, config.dust);
    const dustMaterial = createStaticMaterial(0.4, 1);
    scene.add(new THREE.Points(dustGeometry, dustMaterial));

    const materials = [orbitMaterial, hotspotMaterial, nearMaterial, dustMaterial];
    // 锐利层恒用原生 DPR，不做低分辨率放大。
    const pixelRatio = () => Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(pixelRatio());
      renderer.setSize(width, height, false);
      for (const material of materials) {
        material.uniforms.uPixelRatio.value = pixelRatio();
      }
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();

    const gpu = (() => {
      const context = renderer.getContext();
      const extension = context.getExtension("WEBGL_debug_renderer_info");
      if (!extension) return "unknown";
      return String(context.getParameter(extension.UNMASKED_RENDERER_WEBGL) || "unknown");
    })();

    let raf = 0;
    let disposed = false;
    let paused = document.hidden;
    let animationSeconds = 0;
    let lastFrameAt = performance.now();
    let statsWindowAt = lastFrameAt;
    const frameTimes: number[] = [];

    const cameraTarget = new THREE.Vector3();
    const lookTarget = new THREE.Vector3();

    /**
     * 屏幕密度诊断：把当前帧的锐利星（热点 + 论文轨道位置）投到 12x7 网格，
     * 输出在屏比例、空格比例和 p90/p50 密度比，让「不均匀」变成可读数字。
     */
    const COLUMNS = 12;
    const ROWS = 7;
    const cells = new Int32Array(COLUMNS * ROWS);
    const probe = new THREE.Vector4();
    const basisCache = new Map<string, ReturnType<typeof orbitBasis>>();
    const hotspotById = new Map(payload.hotspots.map((hotspot) => [hotspot.id, hotspot]));

    const measureDensity = (timeSeconds: number) => {
      cells.fill(0);
      let onScreen = 0;
      let total = 0;
      camera.updateMatrixWorld();
      const matrix = new THREE.Matrix4().multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse,
      );
      const accumulate = (x: number, y: number, z: number) => {
        total += 1;
        probe.set(x, y, z, 1).applyMatrix4(matrix);
        if (probe.w <= 0) return;
        const ndcX = probe.x / probe.w;
        const ndcY = probe.y / probe.w;
        const ndcZ = probe.z / probe.w;
        if (ndcZ < -1 || ndcZ > 1) return;
        if (ndcX < -1 || ndcX > 1 || ndcY < -1 || ndcY > 1) return;
        onScreen += 1;
        const column = Math.min(COLUMNS - 1, Math.floor((ndcX + 1) / 2 * COLUMNS));
        const row = Math.min(ROWS - 1, Math.floor((ndcY + 1) / 2 * ROWS));
        cells[row * COLUMNS + column] += 1;
      };

      for (const hotspot of payload.hotspots) {
        accumulate(hotspot.position[0], hotspot.position[1], hotspot.position[2]);
      }
      for (const paper of payload.papers) {
        const hotspot = hotspotById.get(paper.hotspotId);
        if (!hotspot) continue;
        let basis = basisCache.get(paper.hotspotId);
        if (!basis) {
          basis = orbitBasis(paper.hotspotId);
          basisCache.set(paper.hotspotId, basis);
        }
        const offsetLength = Math.hypot(...paper.offset) || 0.05;
        const recency = paper.year ? clamp((paper.year - 2012) / 16, 0, 1) : 0.5;
        const period = THREE.MathUtils.lerp(ORBIT_PERIOD_OLD, ORBIT_PERIOD_NEW, recency);
        const spatialPhase = (hotspot.position[0] * 0.06 + hotspot.position[2] * 0.043)
          + (paper.offset[0] * 0.5 + paper.offset[2] * 0.31);
        const jitter = (hashString32(paper.id) / 0xffff_ffff) * 0.9;
        const theta = timeSeconds * ((Math.PI * 2) / period) * config.spin + spatialPhase + jitter;
        const cosine = Math.cos(theta) * offsetLength;
        const sine = Math.sin(theta) * offsetLength;
        accumulate(
          hotspot.position[0] + basis.u.x * cosine + basis.v.x * sine,
          hotspot.position[1] + basis.u.y * cosine + basis.v.y * sine,
          hotspot.position[2] + basis.u.z * cosine + basis.v.z * sine,
        );
      }

      const sorted = [...cells].sort((left, right) => left - right);
      const median = sorted[Math.floor(sorted.length / 2)] || 1;
      const p90 = sorted[Math.floor((sorted.length - 1) * 0.9)] || 0;
      return {
        onScreen: total > 0 ? onScreen / total : 0,
        emptyCellRatio: sorted.filter((value) => value === 0).length / sorted.length,
        densityRatio: p90 / median,
      };
    };

    const draw = (timeSeconds: number) => {
      orbitMaterial.uniforms.uTime.value = timeSeconds;
      camera.position.copy(cameraPosition(cameraTarget, timeSeconds, config.cam, config.camr));
      camera.lookAt(lookAtPoint(lookTarget, timeSeconds, config.cam));
      renderer.render(scene, camera);
    };

    const frame = (now: number) => {
      if (disposed || paused) return;
      const delta = Math.min(100, Math.max(0, now - lastFrameAt));
      lastFrameAt = now;
      if (delta > 0) {
        frameTimes.push(delta);
        if (frameTimes.length > 180) frameTimes.shift();
        animationSeconds += Math.min(delta, 50) / 1000;
      }
      draw(animationSeconds);
      if (now - statsWindowAt >= 1000) {
        const average = frameTimes.length
          ? frameTimes.reduce((sum, value) => sum + value, 0) / frameTimes.length
          : 0;
        setStats({
          fps: average > 0 ? 1000 / average : 0,
          orbitCount: orbit.count,
          gpu,
          ...measureDensity(animationSeconds),
        });
        statsWindowAt = now;
      }
      raf = requestAnimationFrame(frame);
    };

    if (config.fixedTimeSeconds !== undefined) {
      draw(config.fixedTimeSeconds);
      setStats({
        fps: 0,
        orbitCount: orbit.count,
        gpu,
        ...measureDensity(config.fixedTimeSeconds),
      });
    } else if (!paused) {
      raf = requestAnimationFrame(frame);
    }

    const handleVisibility = () => {
      paused = document.hidden;
      if (paused) {
        cancelAnimationFrame(raf);
        return;
      }
      lastFrameAt = performance.now();
      statsWindowAt = lastFrameAt;
      raf = requestAnimationFrame(frame);
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", handleVisibility);
      resizeObserver.disconnect();
      orbit.geometry.dispose();
      hotspotGeometry.dispose();
      nearGeometry.dispose();
      for (const material of materials) material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [
    config.cam,
    config.camr,
    config.dust,
    config.fixedTimeSeconds,
    config.near,
    config.spin,
    payload,
  ]);

  return (
    <main className="agent-orbit-prototype" data-source-snapshot={payload.sourceSnapshotId}>
      <div ref={hostRef} style={{ position: "absolute", inset: 0 }} />
      <div className="agent-orbit-prototype__hud">
        <b>ORBIT PROTOTYPE · 黑白</b>
        <span>论文星 {stats.orbitCount || "—"} · 热点 {payload.hotspots.length} · 近景 {config.near} · 微尘 {config.dust}</span>
        <span>
          spin {config.spin.toFixed(2)} · cam {config.cam.toFixed(2)} · camr {config.camr.toFixed(1)}
          {config.fixedTimeSeconds === undefined ? "" : ` · t=${config.fixedTimeSeconds}s`}
        </span>
        <span>
          在屏 {(stats.onScreen * 100).toFixed(0)}% · 空格 {(stats.emptyCellRatio * 100).toFixed(0)}%
          · p90/p50 {stats.densityRatio > 0 ? stats.densityRatio.toFixed(1) : "—"}
        </span>
        <span>{stats.fps > 0 ? `${stats.fps.toFixed(1)} FPS` : "固定帧 / 待采样"}</span>
        <span>{stats.gpu}</span>
      </div>
      {fallback ? (
        <div className="agent-orbit-prototype__message">
          <b>WebGL 不可用</b>
          <pre>{fallback}</pre>
        </div>
      ) : null}
    </main>
  );
}

export default function AgentGalaxyOrbitPrototype() {
  const config = useMemo(readAgentGalaxyOrbitPrototypeConfig, []);
  const [payload, setPayload] = useState<AgentGalaxyBackgroundPayloadV1>();
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    loadAgentGalaxyBackgroundPayload()
      .then(({ payload: next }) => {
        if (active) setPayload(next);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return (
      <main className="agent-orbit-prototype">
        <div className="agent-orbit-prototype__message">
          <b>载荷未就绪</b>
          <pre>{error}</pre>
          <pre>先运行 pnpm visual:galaxy:snapshot 生成 agentBackgroundPath。</pre>
        </div>
      </main>
    );
  }

  if (!payload) {
    return (
      <main className="agent-orbit-prototype">
        <div className="agent-orbit-prototype__message">
          <b>正在读取理论星图派生载荷</b>
        </div>
      </main>
    );
  }

  return <OrbitScene payload={payload} config={config} />;
}
