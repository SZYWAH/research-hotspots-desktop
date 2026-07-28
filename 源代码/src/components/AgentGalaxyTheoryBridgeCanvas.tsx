import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

import type { App17GalaxyPayload } from "../types";
import type { ResolvedAgentGalaxyEntity } from "../lib/agentGalaxyFlowContract";

type Props = {
  payload: App17GalaxyPayload;
  target?: ResolvedAgentGalaxyEntity;
};

const SHARP_POINT_VERTEX_SHADER = `
  attribute float aSize;
  attribute vec3 color;
  varying vec3 vColor;
  uniform float uPixelRatio;

  void main() {
    vColor = color;
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    gl_PointSize = aSize * uPixelRatio;
  }
`;

const SHARP_POINT_FRAGMENT_SHADER = `
  varying vec3 vColor;

  void main() {
    vec2 point = (gl_PointCoord - vec2(0.5)) * 2.0;
    float radius = length(point);
    if (radius > 1.0) discard;
    float edge = clamp(fwidth(radius), 0.012, 0.1);
    float coverage = 1.0 - smoothstep(0.88 - edge, 0.88 + edge, radius);
    float core = 1.0 - smoothstep(0.04, 0.24, radius);
    vec3 energy = mix(vColor, vec3(1.0), 0.48 + core * 0.42);
    gl_FragColor = vec4(energy, coverage * (0.72 + core * 0.28));
  }
`;

function findTargetPosition(
  payload: App17GalaxyPayload,
  target?: ResolvedAgentGalaxyEntity,
) {
  if (!target || target.membership === "missing") return new THREE.Vector3();
  if (target.kind === "hotspot") {
    const hotspot = payload.hotspots.find(
      (candidate) => candidate.id === target.entityId,
    );
    return hotspot
      ? new THREE.Vector3(hotspot.x, hotspot.y, hotspot.z)
      : new THREE.Vector3();
  }
  const paper = payload.papers.find((candidate) => (
    candidate.rawPaperId === target.entityId
    || candidate.scopedPaperId === target.entityId
  ));
  return paper
    ? new THREE.Vector3(paper.x, paper.y, paper.z)
    : new THREE.Vector3();
}

function createGeometry(
  items: readonly {
    x: number;
    y: number;
    z: number;
    color: string;
    size: number;
  }[],
  sizeMinimum: number,
  sizeMaximum: number,
) {
  const positions: number[] = [];
  const colors: number[] = [];
  const sizes: number[] = [];
  const color = new THREE.Color();
  for (const item of items) {
    positions.push(item.x, item.y, item.z);
    color.set(item.color || "#b7c6d1");
    const hsl = { h: 0, s: 0, l: 0 };
    color.getHSL(hsl);
    color.setHSL(hsl.h, Math.min(0.2, hsl.s * 0.28), Math.max(0.68, hsl.l));
    colors.push(color.r, color.g, color.b);
    sizes.push(THREE.MathUtils.clamp(item.size, sizeMinimum, sizeMaximum));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(colors, 3),
  );
  geometry.setAttribute(
    "aSize",
    new THREE.Float32BufferAttribute(sizes, 1),
  );
  geometry.computeBoundingSphere();
  return geometry;
}

export default function AgentGalaxyTheoryBridgeCanvas({
  payload,
  target,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: false,
        alpha: false,
        powerPreference: "low-power",
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "WebGL unavailable");
      return;
    }
    renderer.setClearColor(0x000000, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.domElement.className = "agent-immersive-theory__canvas";
    renderer.domElement.setAttribute(
      "aria-label",
      "同一实体的真实理论坐标视图",
    );
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 10_000);
    const paperGeometry = createGeometry(
      payload.papers.map((paper) => ({
        ...paper,
        size: 1.45,
      })),
      1.15,
      1.6,
    );
    const hotspotGeometry = createGeometry(
      payload.hotspots.map((hotspot) => ({
        ...hotspot,
        size: 4.4 + Math.log2(Math.max(2, hotspot.paperCount)) * 0.18,
      })),
      4.4,
      6.4,
    );
    const createMaterial = () => new THREE.ShaderMaterial({
      uniforms: {
        uPixelRatio: { value: 1 },
      },
      vertexShader: SHARP_POINT_VERTEX_SHADER,
      fragmentShader: SHARP_POINT_FRAGMENT_SHADER,
      vertexColors: true,
      transparent: true,
      depthWrite: true,
      depthTest: true,
      blending: THREE.NormalBlending,
      toneMapped: false,
    });
    const paperMaterial = createMaterial();
    const hotspotMaterial = createMaterial();
    const papers = new THREE.Points(paperGeometry, paperMaterial);
    const hotspots = new THREE.Points(hotspotGeometry, hotspotMaterial);
    papers.renderOrder = 1;
    hotspots.renderOrder = 2;
    scene.add(papers, hotspots);

    const targetPosition = findTargetPosition(payload, target);
    const bounds = paperGeometry.boundingSphere;
    const distance = Math.max(12, (bounds?.radius ?? 30) * 0.34);
    const direction = new THREE.Vector3(0.74, 0.48, 0.92).normalize();
    camera.position.copy(targetPosition).addScaledVector(direction, distance);
    camera.lookAt(targetPosition);

    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      renderer.setPixelRatio(dpr);
      renderer.setSize(width, height, false);
      paperMaterial.uniforms.uPixelRatio.value = dpr;
      hotspotMaterial.uniforms.uPixelRatio.value = dpr;
      renderer.render(scene, camera);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();

    return () => {
      resizeObserver.disconnect();
      scene.remove(papers, hotspots);
      paperGeometry.dispose();
      hotspotGeometry.dispose();
      paperMaterial.dispose();
      hotspotMaterial.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [payload, target]);

  return (
    <div
      ref={hostRef}
      className="agent-immersive-theory"
      data-coordinate-space="theory"
      data-source-snapshot={payload.snapshotId ?? "unknown"}
    >
      {error ? <span>{error}</span> : null}
    </div>
  );
}
