import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import type { Hotspot } from "../types";

type GalaxyVisualMode = "nebula" | "galaxy";
type GalaxyLayoutMode = "semantic" | "spiral" | "timeline" | "confidence";

type ReferenceGalaxyCommand = {
  kind: "reset" | "fit" | "top";
  nonce: number;
};

type ReferenceGalaxyItem = {
  id: string;
  title: string;
  subtitle: string;
  field: string;
  keywords: string[];
  relatedIds: string[];
  paperCount: number;
  confidence: number;
  weight: number;
  color: string;
  coordinates: THREE.Vector3;
  fieldIndex: number;
  fieldCount: number;
  index: number;
  total: number;
  influence: number;
  normalizedYear: number;
};

type ReferenceGalaxyPoint = {
  item: ReferenceGalaxyItem;
  color: string;
  base: THREE.Vector3;
  phase: number;
  speed: number;
  drift: number;
  stream: number;
  size: number;
  alpha: number;
};

type ReferenceDustPoint = {
  color: string;
  base: THREE.Vector3;
  phase: number;
  speed: number;
  drift: number;
  stream: number;
  size: number;
  alpha: number;
};

type ReferencePointLayer = {
  geometry: THREE.BufferGeometry;
  material: THREE.ShaderMaterial;
  positions: Float32Array;
  sizes: Float32Array;
  alphas: Float32Array;
};

type ReferenceGalaxyLink = {
  sourceIndex: number;
  targetIndex: number;
  score: number;
};

type ReferenceOrbitLayer = {
  object: THREE.LineSegments;
  geometry: THREE.BufferGeometry;
  material: THREE.LineBasicMaterial;
};

type ReferenceLinkLayer = {
  object: THREE.LineSegments;
  geometry: THREE.BufferGeometry;
  material: THREE.LineBasicMaterial;
  positions: Float32Array;
};

type ReferenceFocusStarLayer = {
  group: THREE.Group;
  core: THREE.Sprite;
  halo: THREE.Sprite;
  materials: THREE.SpriteMaterial[];
  textures: THREE.Texture[];
};

type ReferenceRotationControls = {
  yaw: number;
  pitch: number;
  roll: number;
  yawTarget: number;
  pitchTarget: number;
  rollTarget: number;
  velocityYaw: number;
  velocityPitch: number;
  pointerDown: boolean;
  dragging: boolean;
  moved: boolean;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  autoPausedUntil: number;
};

type ReferenceFocusState = {
  active: boolean;
  selectedIndex: number;
  approach: number;
  targetLocal: THREE.Vector3;
  nearLocal: THREE.Vector3;
  yaw: number;
  pitch: number;
  roll: number;
  restoreYaw: number;
  restorePitch: number;
  restoreRoll: number;
  restoreDistance: number;
  restoreFov: number;
};

const REFERENCE_CAMERA_FOV = 43;
const REFERENCE_CAMERA_DISTANCE = 8.6;
const REFERENCE_FOCUS_CAMERA_DISTANCE = 6.45;
const REFERENCE_FOCUS_CAMERA_FOV = 41.4;
const REFERENCE_MIN_CAMERA_DISTANCE = 4.8;
const REFERENCE_MAX_CAMERA_DISTANCE = 12.5;
const REFERENCE_DRAG_THRESHOLD = 5;
const REFERENCE_FIELD_COLORS = ["#27d5c7", "#58c4ff", "#ff6f8f", "#ffd24d", "#9484ff", "#54de96", "#ec69c8", "#c8d6e6"];
const REFERENCE_VISIBLE_HOTSPOT_LIMIT = 50;
const REFERENCE_MAX_PAPER_PARTICLES = 12000;
const REFERENCE_MIN_PAPER_PARTICLES = 8000;
const REFERENCE_MAX_PARTICLES_PER_HOTSPOT = 520;
const REFERENCE_ORBIT_COUNT = 5;
const REFERENCE_GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export function ReferenceGalaxyCanvas({
  hotspots,
  paperCount,
  selectedId,
  visualMode,
  layoutMode,
  relatedIds = [],
  labelIds = [],
  command,
  onSelect,
  onClearSelection,
}: {
  hotspots: Hotspot[];
  paperCount: number;
  selectedId: string;
  visualMode: GalaxyVisualMode;
  layoutMode: GalaxyLayoutMode;
  relatedIds?: string[];
  labelIds?: string[];
  command: ReferenceGalaxyCommand;
  onSelect: (hotspotId: string) => void;
  onClearSelection: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const focusMarkerRef = useRef<HTMLDivElement | null>(null);
  const labelLayerRef = useRef<HTMLDivElement | null>(null);
  const selectedIdRef = useRef(selectedId);
  const relatedIdsRef = useRef(relatedIds);
  const labelIdsRef = useRef(labelIds);
  const commandRef = useRef(command);
  const onSelectRef = useRef(onSelect);
  const onClearSelectionRef = useRef(onClearSelection);

  const items = useMemo(() => buildReferenceItems(hotspots), [hotspots]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    relatedIdsRef.current = relatedIds;
  }, [relatedIds]);

  useEffect(() => {
    labelIdsRef.current = labelIds;
  }, [labelIds]);

  useEffect(() => {
    commandRef.current = command;
  }, [command]);

  useEffect(() => {
    onSelectRef.current = onSelect;
    onClearSelectionRef.current = onClearSelection;
  }, [onClearSelection, onSelect]);

  useEffect(() => {
    const hostElement = containerRef.current;
    const markerElement = focusMarkerRef.current;
    const labelLayerElement = labelLayerRef.current;
    if (!hostElement) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(REFERENCE_CAMERA_FOV, 1, 0.1, 100);
    camera.position.set(0, 0, REFERENCE_CAMERA_DISTANCE);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.className = "reference-galaxy-canvas";
    hostElement.appendChild(renderer.domElement);

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dataStars = buildReferenceGalaxyPoints(items, visualMode, layoutMode);
    const semanticLinks = buildReferenceGalaxyLinks(dataStars);
    const paperDust = buildReferencePaperParticles(dataStars, paperCount, visualMode);
    const backgroundDust = buildReferenceBackgroundDust(normalizeReferenceBackgroundDustCount(paperCount, items.length, visualMode), visualMode);

    const dataLayer = createReferencePointLayer(dataStars, visualMode === "galaxy" ? 1.52 : 1.55);
    const paperLayer = createReferencePointLayer(paperDust, visualMode === "galaxy" ? 1.08 : 1.02);
    const backgroundLayer = createReferencePointLayer(backgroundDust, visualMode === "galaxy" ? 0.48 : 0.44);

    const galaxyGroup = new THREE.Group();
    galaxyGroup.rotation.order = "YXZ";
    const paperStarField = new THREE.Points(paperLayer.geometry, paperLayer.material);
    const dataStarField = new THREE.Points(dataLayer.geometry, dataLayer.material);
    const backgroundStarField = new THREE.Points(backgroundLayer.geometry, backgroundLayer.material);
    const orbitLayer = createReferenceOrbitLayer(dataStars, visualMode);
    const baseLinkLayer = createReferenceLinkLayer(dataStars, semanticLinks, 0.08);
    const selectedLinkLayer = createReferenceLinkLayer(dataStars, [], 0.38);
    const focusStarLayer = createReferenceFocusStarLayer();
    const labelElements = createReferenceLabels(labelLayerElement, dataStars);
    backgroundStarField.rotation.order = "YXZ";
    backgroundStarField.renderOrder = 0;
    orbitLayer.object.renderOrder = 1;
    baseLinkLayer.object.renderOrder = 1;
    paperStarField.renderOrder = 1;
    selectedLinkLayer.object.renderOrder = 2;
    dataStarField.renderOrder = 2;
    focusStarLayer.group.renderOrder = 3;
    galaxyGroup.add(orbitLayer.object, paperStarField, baseLinkLayer.object, selectedLinkLayer.object, dataStarField, focusStarLayer.group);
    scene.add(backgroundStarField, galaxyGroup);

    const controls: ReferenceRotationControls = {
      yaw: 0,
      pitch: 0,
      roll: 0,
      yawTarget: visualMode === "galaxy" ? -0.22 : 0,
      pitchTarget: visualMode === "galaxy" ? -0.05 : 0,
      rollTarget: 0,
      velocityYaw: 0,
      velocityPitch: 0,
      pointerDown: false,
      dragging: false,
      moved: false,
      startX: 0,
      startY: 0,
      lastX: 0,
      lastY: 0,
      autoPausedUntil: 0,
    };

    const focusState: ReferenceFocusState = {
      active: false,
      selectedIndex: -1,
      approach: 0,
      targetLocal: new THREE.Vector3(),
      nearLocal: new THREE.Vector3(),
      yaw: 0,
      pitch: 0,
      roll: 0,
      restoreYaw: controls.yawTarget,
      restorePitch: controls.pitchTarget,
      restoreRoll: controls.rollTarget,
      restoreDistance: REFERENCE_CAMERA_DISTANCE,
      restoreFov: REFERENCE_CAMERA_FOV,
    };

    const raycaster = new THREE.Raycaster();
    raycaster.params.Points.threshold = 0.19;
    const pointer = new THREE.Vector2();
    let cameraDistanceTarget = visualMode === "galaxy" ? 9.1 : REFERENCE_CAMERA_DISTANCE;
    let frameId = 0;
    let elapsed = 0;
    let lastFrameAt = performance.now();
    let hoveredIndex = -1;
    let lastSyncedSelectedId = selectedIdRef.current;
    let lastLinkedSelectedId = "";
    let lastLinkedRelatedKey = "";
    let lastCommandNonce = commandRef.current.nonce;

    function resize() {
      const rect = hostElement!.getBoundingClientRect();
      const width = Math.max(320, rect.width);
      const height = Math.max(320, rect.height);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      const ratio = Math.min(window.devicePixelRatio || 1, 1.75);
      dataLayer.material.uniforms.uPixelRatio.value = ratio;
      paperLayer.material.uniforms.uPixelRatio.value = ratio;
      backgroundLayer.material.uniforms.uPixelRatio.value = ratio;
    }

    function findPointIndex(event: PointerEvent | MouseEvent) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObject(dataStarField, false)[0];
      return typeof hit?.index === "number" ? hit.index : -1;
    }

    function setCanvasCursor(nextHoveredIndex = hoveredIndex) {
      if (controls.dragging) {
        renderer.domElement.style.cursor = "grabbing";
      } else if (nextHoveredIndex >= 0) {
        renderer.domElement.style.cursor = "pointer";
      } else {
        renderer.domElement.style.cursor = "grab";
      }
    }

    function focusStar(index: number, emit = true) {
      const point = dataStars[index];
      if (!point) return;

      const targetDirection = new THREE.Vector3(0.18, 0.02, 1).normalize();
      const sourceDirection = point.base.clone().normalize();
      const quaternion = new THREE.Quaternion().setFromUnitVectors(sourceDirection, targetDirection);
      const targetEuler = new THREE.Euler().setFromQuaternion(quaternion, "YXZ");

      focusState.active = true;
      focusState.selectedIndex = index;
      focusState.restoreYaw = controls.yawTarget;
      focusState.restorePitch = controls.pitchTarget;
      focusState.restoreRoll = controls.rollTarget;
      focusState.restoreDistance = cameraDistanceTarget;
      focusState.restoreFov = camera.fov;
      focusState.targetLocal.copy(point.base);
      focusState.nearLocal.copy(point.base);
      focusState.approach = 0;
      focusState.yaw = nearestReferenceAngle(targetEuler.y, controls.yawTarget);
      focusState.pitch = clampReferenceNumber(targetEuler.x, -1.1, 1.1);
      focusState.roll = nearestReferenceAngle(targetEuler.z, controls.rollTarget);

      controls.yawTarget = focusState.yaw;
      controls.pitchTarget = focusState.pitch;
      controls.rollTarget = focusState.roll;
      controls.velocityYaw = 0;
      controls.velocityPitch = 0;
      controls.autoPausedUntil = performance.now() + 9000;
      cameraDistanceTarget = REFERENCE_FOCUS_CAMERA_DISTANCE;
      hoveredIndex = index;
      setCanvasCursor(index);
      if (emit) onSelectRef.current(point.item.id);
    }

    function releaseFocusIfNeeded() {
      if (selectedIdRef.current) return;
      if (!focusState.active && focusState.approach <= 0.001 && Math.abs(cameraDistanceTarget - focusState.restoreDistance) < 0.01) return;
      controls.yawTarget = focusState.restoreYaw;
      controls.pitchTarget = focusState.restorePitch;
      controls.rollTarget = focusState.restoreRoll;
      cameraDistanceTarget = focusState.restoreDistance;
      focusState.active = false;
      controls.autoPausedUntil = performance.now() + 1600;
    }

    function syncExternalSelection() {
      const nextSelectedId = selectedIdRef.current;
      if (nextSelectedId === lastSyncedSelectedId) return;
      lastSyncedSelectedId = nextSelectedId;
      if (!nextSelectedId) {
        focusState.active = false;
        return;
      }
      const index = dataStars.findIndex((point) => point.item.id === nextSelectedId);
      if (index >= 0) focusStar(index, false);
    }

    function applyCameraCommand() {
      const nextCommand = commandRef.current;
      if (nextCommand.nonce === lastCommandNonce) return;
      lastCommandNonce = nextCommand.nonce;
      focusState.active = false;
      controls.velocityYaw = 0;
      controls.velocityPitch = 0;
      controls.autoPausedUntil = performance.now() + 2200;
      if (nextCommand.kind === "top") {
        controls.yawTarget = 0;
        controls.pitchTarget = -1.08;
        controls.rollTarget = 0;
        cameraDistanceTarget = 9.4;
      } else if (nextCommand.kind === "fit") {
        controls.yawTarget = visualMode === "galaxy" ? -0.22 : 0;
        controls.pitchTarget = visualMode === "galaxy" ? -0.05 : 0;
        controls.rollTarget = 0;
        cameraDistanceTarget = visualMode === "galaxy" ? 9.1 : REFERENCE_CAMERA_DISTANCE;
      } else {
        controls.yawTarget = 0;
        controls.pitchTarget = 0;
        controls.rollTarget = 0;
        cameraDistanceTarget = REFERENCE_CAMERA_DISTANCE;
      }
    }

    function handlePointerDown(event: PointerEvent) {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      controls.pointerDown = true;
      controls.dragging = false;
      controls.moved = false;
      controls.startX = event.clientX;
      controls.startY = event.clientY;
      controls.lastX = event.clientX;
      controls.lastY = event.clientY;
      controls.velocityYaw = 0;
      controls.velocityPitch = 0;
      controls.autoPausedUntil = performance.now() + 3000;
      renderer.domElement.setPointerCapture?.(event.pointerId);
      setCanvasCursor();
    }

    function handlePointerMove(event: PointerEvent) {
      if (controls.pointerDown) {
        const totalX = event.clientX - controls.startX;
        const totalY = event.clientY - controls.startY;
        const movedDistance = Math.hypot(totalX, totalY);
        if (!controls.dragging && movedDistance > REFERENCE_DRAG_THRESHOLD) {
          controls.dragging = true;
          controls.moved = true;
          focusState.active = false;
          if (selectedIdRef.current) onClearSelectionRef.current();
        }

        if (controls.dragging) {
          const dx = event.clientX - controls.lastX;
          const dy = event.clientY - controls.lastY;
          controls.yawTarget += dx * 0.0066;
          controls.pitchTarget = clampReferenceNumber(controls.pitchTarget + dy * 0.0034, -1.1, 1.1);
          controls.rollTarget = dampReferenceNumber(controls.rollTarget, 0, 8, 1 / 60);
          controls.velocityYaw = dx * 0.052;
          controls.velocityPitch = dy * 0.019;
          controls.lastX = event.clientX;
          controls.lastY = event.clientY;
          controls.autoPausedUntil = performance.now() + 4000;
          setCanvasCursor();
          return;
        }
      }

      hoveredIndex = findPointIndex(event);
      setCanvasCursor(hoveredIndex);
    }

    function handlePointerUp(event: PointerEvent) {
      renderer.domElement.releasePointerCapture?.(event.pointerId);
      if (controls.pointerDown && !controls.dragging && !controls.moved) {
        const index = findPointIndex(event);
        if (index >= 0) focusStar(index);
      }
      controls.pointerDown = false;
      controls.dragging = false;
      controls.moved = false;
      setCanvasCursor();
    }

    function handlePointerCancel(event: PointerEvent) {
      renderer.domElement.releasePointerCapture?.(event.pointerId);
      controls.pointerDown = false;
      controls.dragging = false;
      controls.moved = false;
      controls.velocityYaw = 0;
      controls.velocityPitch = 0;
      setCanvasCursor();
    }

    function handlePointerLeave() {
      if (controls.pointerDown) return;
      hoveredIndex = -1;
      setCanvasCursor();
    }

    function handleWheel(event: WheelEvent) {
      event.preventDefault();
      const scale = event.ctrlKey ? 0.012 : 0.006;
      cameraDistanceTarget = clampReferenceNumber(cameraDistanceTarget + event.deltaY * scale, REFERENCE_MIN_CAMERA_DISTANCE, REFERENCE_MAX_CAMERA_DISTANCE);
      if (focusState.active) controls.autoPausedUntil = performance.now() + 4000;
    }

    function render() {
      const now = performance.now();
      const dt = Math.min((now - lastFrameAt) / 1000, 0.033);
      lastFrameAt = now;
      elapsed += dt;
      syncExternalSelection();
      applyCameraCommand();
      releaseFocusIfNeeded();

      const motionScale = reducedMotion ? 0.08 : 1;
      const shouldAutoDrift = !controls.dragging && !focusState.active && now > controls.autoPausedUntil;
      const focusTarget = focusState.active ? 1 : 0;
      focusState.approach = dampReferenceNumber(focusState.approach, focusTarget, focusState.active ? 2.7 : 4.8, dt);
      if (!focusState.active && focusState.approach < 0.018) {
        focusState.approach = 0;
        focusState.selectedIndex = -1;
      }
      const focusEase = easeOutReferenceCubic(focusState.approach);
      const focusRush = reducedMotion ? focusEase * 0.08 : focusEase * 0.34;
      const relatedKey = relatedIdsRef.current.join("|");
      if (selectedIdRef.current !== lastLinkedSelectedId || relatedKey !== lastLinkedRelatedKey) {
        lastLinkedSelectedId = selectedIdRef.current;
        lastLinkedRelatedKey = relatedKey;
        updateReferenceSelectedLinks(selectedLinkLayer, dataStars, semanticLinks, selectedIdRef.current, relatedIdsRef.current);
      }

      if (!controls.dragging && !focusState.active) {
        controls.yawTarget += controls.velocityYaw * dt;
        controls.pitchTarget = clampReferenceNumber(controls.pitchTarget + controls.velocityPitch * dt, -1.1, 1.1);
        controls.velocityYaw *= Math.exp(-3.2 * dt);
        controls.velocityPitch *= Math.exp(-3.8 * dt);
        if (Math.abs(controls.velocityYaw) < 0.0008) controls.velocityYaw = 0;
        if (Math.abs(controls.velocityPitch) < 0.0008) controls.velocityPitch = 0;
      }

      const autoYaw = shouldAutoDrift ? (Math.sin(elapsed * 0.095) * 0.14 + Math.sin(elapsed * 0.031 + 1.7) * 0.08) * motionScale : 0;
      const autoPitch = shouldAutoDrift ? (Math.sin(elapsed * 0.055 + 0.4) * 0.045 + Math.sin(elapsed * 0.021 + 2.2) * 0.03) * motionScale : 0;
      const autoRoll = shouldAutoDrift ? Math.sin(elapsed * 0.039 + 1.1) * 0.018 * motionScale : 0;

      const targetYaw = focusState.active ? focusState.yaw : controls.yawTarget + autoYaw;
      const targetPitch = focusState.active ? focusState.pitch : clampReferenceNumber(controls.pitchTarget + autoPitch, -1.1, 1.1);
      const targetRoll = focusState.active ? focusState.roll : controls.rollTarget + autoRoll;
      controls.yaw = dampReferenceNumber(controls.yaw, targetYaw, focusState.active ? 4.5 : 5.2, dt);
      controls.pitch = dampReferenceNumber(controls.pitch, targetPitch, focusState.active ? 4.2 : 4.8, dt);
      controls.roll = dampReferenceNumber(controls.roll, targetRoll, focusState.active ? 4.2 : 3.6, dt);
      galaxyGroup.rotation.set(controls.pitch, controls.yaw, controls.roll, "YXZ");

      const targetX = selectedIdRef.current ? -0.38 : 0;
      galaxyGroup.position.x = dampReferenceNumber(galaxyGroup.position.x, targetX, 6.2, dt);
      camera.position.z = dampReferenceNumber(camera.position.z, cameraDistanceTarget, 7.4, dt);
      camera.fov = dampReferenceNumber(camera.fov, focusState.active ? REFERENCE_FOCUS_CAMERA_FOV : focusState.restoreFov, 4.6, dt);
      camera.updateProjectionMatrix();

      backgroundStarField.rotation.y = Math.sin(elapsed * 0.018) * 0.025 * motionScale - focusRush * 0.035;
      backgroundStarField.rotation.x = Math.cos(elapsed * 0.014) * 0.018 * motionScale + focusRush * 0.02;
      backgroundStarField.position.z = dampReferenceNumber(backgroundStarField.position.z, -focusRush * 0.7, 5.4, dt);
      paperStarField.position.z = dampReferenceNumber(paperStarField.position.z, focusRush * 0.08, 5.4, dt);

      updateReferenceDataStarHighlights(dataStars, dataLayer, hoveredIndex, focusState.selectedIndex, dt);
      updateReferenceFocusStarLayer(focusStarLayer, focusState, dataStars[focusState.selectedIndex], elapsed, dt);
      updateReferenceFocusMarker(markerElement, dataStars[focusState.selectedIndex], focusState, galaxyGroup, camera, renderer.domElement, focusEase);
      updateReferenceLabels(labelElements, dataStars, focusState.selectedIndex, hoveredIndex, selectedIdRef.current, relatedIdsRef.current, labelIdsRef.current, galaxyGroup, camera, renderer.domElement, focusEase);

      dataLayer.material.uniforms.uTime.value = elapsed;
      paperLayer.material.uniforms.uTime.value = elapsed * 0.54;
      backgroundLayer.material.uniforms.uTime.value = elapsed * 0.36;
      paperLayer.material.uniforms.uOpacity.value = (visualMode === "galaxy" ? 1.08 : 1.02) - focusEase * 0.08;
      backgroundLayer.material.uniforms.uOpacity.value = (visualMode === "galaxy" ? 0.48 : 0.44) - focusEase * 0.04;

      renderer.render(scene, camera);
      frameId = window.requestAnimationFrame(render);
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(hostElement);
    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.addEventListener("pointermove", handlePointerMove);
    renderer.domElement.addEventListener("pointerup", handlePointerUp);
    renderer.domElement.addEventListener("pointercancel", handlePointerCancel);
    renderer.domElement.addEventListener("pointerleave", handlePointerLeave);
    renderer.domElement.addEventListener("wheel", handleWheel, { passive: false });
    resize();
    setCanvasCursor();
    render();

    return () => {
      window.cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      renderer.domElement.removeEventListener("pointerup", handlePointerUp);
      renderer.domElement.removeEventListener("pointercancel", handlePointerCancel);
      renderer.domElement.removeEventListener("pointerleave", handlePointerLeave);
      renderer.domElement.removeEventListener("wheel", handleWheel);
      dataLayer.geometry.dispose();
      paperLayer.geometry.dispose();
      backgroundLayer.geometry.dispose();
      dataLayer.material.dispose();
      paperLayer.material.dispose();
      backgroundLayer.material.dispose();
      orbitLayer.geometry.dispose();
      orbitLayer.material.dispose();
      baseLinkLayer.geometry.dispose();
      baseLinkLayer.material.dispose();
      selectedLinkLayer.geometry.dispose();
      selectedLinkLayer.material.dispose();
      disposeReferenceFocusStarLayer(focusStarLayer);
      renderer.dispose();
      renderer.domElement.remove();
      clearReferenceLabels(labelElements);
      if (markerElement) markerElement.dataset.active = "false";
    };
  }, [items, layoutMode, paperCount, visualMode]);

  return (
    <>
      <div className="reference-galaxy-backdrop" />
      <div className="reference-galaxy-canvas-host" ref={containerRef} />
      <div className="reference-galaxy-label-layer" ref={labelLayerRef} aria-hidden="true" />
      <div className="reference-galaxy-focus-marker" ref={focusMarkerRef} aria-hidden="true">
        <span className="reference-galaxy-focus-marker-ring" />
        <span className="reference-galaxy-focus-marker-core" />
      </div>
      <div className="reference-galaxy-vignette" />
    </>
  );
}

function createReferencePointLayer<T extends { color: string; base: THREE.Vector3; size: number; alpha?: number; phase: number }>(points: T[], opacity: number): ReferencePointLayer {
  const positions = new Float32Array(points.length * 3);
  const colors = new Float32Array(points.length * 3);
  const sizes = new Float32Array(points.length);
  const phases = new Float32Array(points.length);
  const alphas = new Float32Array(points.length);

  points.forEach((point, index) => {
    positions[index * 3] = point.base.x;
    positions[index * 3 + 1] = point.base.y;
    positions[index * 3 + 2] = point.base.z;
    const color = new THREE.Color(point.color);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
    sizes[index] = point.size;
    phases[index] = point.phase;
    alphas[index] = point.alpha ?? 1;
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("pointSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("phase", new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute("alphaBase", new THREE.BufferAttribute(alphas, 1));

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    uniforms: {
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 1.75) },
      uOpacity: { value: opacity },
      uTime: { value: 0 },
    },
    vertexShader: `
      attribute float pointSize;
      attribute float phase;
      attribute float alphaBase;
      uniform float uPixelRatio;
      uniform float uTime;
      varying vec3 vColor;
      varying float vAlpha;
      varying float vDepth;

      void main() {
        vColor = color;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        float depthScale = clamp(8.4 / max(1.0, -mvPosition.z), 0.54, 1.72);
        float twinkle = 0.88 + sin(uTime * 1.45 + phase) * 0.12;
        gl_PointSize = pointSize * uPixelRatio * depthScale * twinkle;
        vDepth = smoothstep(10.5, 2.2, -mvPosition.z);
        vAlpha = alphaBase;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;
      varying float vDepth;
      uniform float uOpacity;

      void main() {
        vec2 uv = gl_PointCoord - vec2(0.5);
        float d = length(uv);
        float core = smoothstep(0.18, 0.0, d);
        float disc = smoothstep(0.36, 0.13, d) * 0.54;
        float edge = smoothstep(0.5, 0.24, d) * 0.1;
        float alpha = (core * 0.96 + disc + edge) * vAlpha * uOpacity * (0.62 + vDepth * 0.56);
        if (alpha < 0.018) discard;
        gl_FragColor = vec4(vColor, alpha);
      }
    `,
  });

  return { geometry, material, positions, sizes, alphas };
}

function createReferenceLinkLayer(points: ReferenceGalaxyPoint[], links: ReferenceGalaxyLink[], opacity: number): ReferenceLinkLayer {
  const positions = new Float32Array(Math.max(1, links.length) * 2 * 3);
  const colors = new Float32Array(Math.max(1, links.length) * 2 * 3);
  links.forEach((link, index) => {
    const source = points[link.sourceIndex];
    const target = points[link.targetIndex];
    if (!source || !target) return;
    const offset = index * 6;
    positions[offset] = source.base.x;
    positions[offset + 1] = source.base.y;
    positions[offset + 2] = source.base.z;
    positions[offset + 3] = target.base.x;
    positions[offset + 4] = target.base.y;
    positions[offset + 5] = target.base.z;
    const sourceColor = new THREE.Color(source.color).lerp(new THREE.Color("#dcecff"), 0.24);
    const targetColor = new THREE.Color(target.color).lerp(new THREE.Color("#dcecff"), 0.24);
    colors[offset] = sourceColor.r;
    colors[offset + 1] = sourceColor.g;
    colors[offset + 2] = sourceColor.b;
    colors[offset + 3] = targetColor.r;
    colors[offset + 4] = targetColor.g;
    colors[offset + 5] = targetColor.b;
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setDrawRange(0, links.length * 2);
  const material = new THREE.LineBasicMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    opacity,
  });
  const object = new THREE.LineSegments(geometry, material);
  return { object, geometry, material, positions };
}

function createReferenceOrbitLayer(points: ReferenceGalaxyPoint[], visualMode: GalaxyVisualMode): ReferenceOrbitLayer {
  const orbitPoints = points.slice(0, REFERENCE_ORBIT_COUNT);
  const segmentCount = 160;
  const vertexCount = Math.max(1, orbitPoints.length * segmentCount * 2);
  const positions = new Float32Array(vertexCount * 3);

  orbitPoints.forEach((point, orbitIndex) => {
    const baseOffset = orbitIndex * segmentCount * 6;
    const flatten = visualMode === "galaxy" ? 0.38 : 0.44;
    const radius = Math.max(1.08, Math.hypot(point.base.x, point.base.y / Math.max(0.1, flatten)) + 0.28 + orbitIndex * 0.08);
    const z = point.base.z * 0.22;
    const spin = seededReferenceValue(`${point.item.id}:orbit:spin`) * Math.PI * 2;
    const wobble = 0.02 + seededReferenceValue(`${point.item.id}:orbit:wobble`) * 0.07;

    for (let index = 0; index < segmentCount; index += 1) {
      const a = (index / segmentCount) * Math.PI * 2 + spin;
      const b = ((index + 1) / segmentCount) * Math.PI * 2 + spin;
      writeReferenceOrbitVertex(positions, baseOffset + index * 6, a, radius, flatten, z, wobble);
      writeReferenceOrbitVertex(positions, baseOffset + index * 6 + 3, b, radius, flatten, z, wobble);
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setDrawRange(0, orbitPoints.length * segmentCount * 2);
  const material = new THREE.LineBasicMaterial({
    color: visualMode === "galaxy" ? "#c8d8ff" : "#dfeaff",
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: visualMode === "galaxy" ? 0.16 : 0.13,
  });
  const object = new THREE.LineSegments(geometry, material);
  object.visible = orbitPoints.length > 0;
  return { object, geometry, material };
}

function writeReferenceOrbitVertex(positions: Float32Array, offset: number, angle: number, radius: number, flatten: number, z: number, wobble: number) {
  positions[offset] = Math.cos(angle) * radius;
  positions[offset + 1] = Math.sin(angle) * radius * flatten;
  positions[offset + 2] = z + Math.sin(angle * 2.0) * wobble;
}

function updateReferenceSelectedLinks(
  layer: ReferenceLinkLayer,
  points: ReferenceGalaxyPoint[],
  links: ReferenceGalaxyLink[],
  selectedId: string,
  relatedIds: string[],
) {
  const selectedIndex = selectedId ? points.findIndex((point) => point.item.id === selectedId) : -1;
  const relatedSet = new Set(relatedIds);
  const selectedLinks = links
    .filter((link) => {
      const source = points[link.sourceIndex];
      const target = points[link.targetIndex];
      if (!source || !target) return false;
      if (selectedIndex >= 0 && (link.sourceIndex === selectedIndex || link.targetIndex === selectedIndex)) return true;
      return relatedSet.has(source.item.id) && relatedSet.has(target.item.id);
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);

  const requiredLength = Math.max(1, selectedLinks.length) * 2 * 3;
  if (layer.positions.length < requiredLength) {
    layer.positions = new Float32Array(requiredLength);
    layer.geometry.setAttribute("position", new THREE.BufferAttribute(layer.positions, 3));
  }
  selectedLinks.forEach((link, index) => {
    const source = points[link.sourceIndex];
    const target = points[link.targetIndex];
    if (!source || !target) return;
    const offset = index * 6;
    layer.positions[offset] = source.base.x;
    layer.positions[offset + 1] = source.base.y;
    layer.positions[offset + 2] = source.base.z;
    layer.positions[offset + 3] = target.base.x;
    layer.positions[offset + 4] = target.base.y;
    layer.positions[offset + 5] = target.base.z;
  });
  layer.geometry.setDrawRange(0, selectedLinks.length * 2);
  layer.geometry.attributes.position.needsUpdate = true;
  layer.object.visible = selectedLinks.length > 0;
}

function createReferenceLabels(host: HTMLDivElement | null, points: ReferenceGalaxyPoint[]) {
  if (!host) return [];
  host.innerHTML = "";
  return points.map((point) => {
    const label = document.createElement("div");
    label.className = "reference-galaxy-data-label";
    label.dataset.hotspotId = point.item.id;
    label.innerHTML = `<span>${escapeReferenceHtml(compactReferenceLabel(point.item.title, 30))}</span><small>${escapeReferenceHtml(point.item.field)} · ${point.item.paperCount} 篇</small>`;
    host.appendChild(label);
    return label;
  });
}

function updateReferenceLabels(
  labels: HTMLDivElement[],
  points: ReferenceGalaxyPoint[],
  selectedIndex: number,
  hoveredIndex: number,
  selectedId: string,
  relatedIds: string[],
  labelIds: string[],
  galaxyGroup: THREE.Group,
  camera: THREE.PerspectiveCamera,
  canvas: HTMLCanvasElement,
  focusEase: number,
) {
  if (labels.length === 0) return;
  const rect = canvas.getBoundingClientRect();
  const relatedSet = new Set(relatedIds);
  const pinnedSet = new Set(labelIds);
  galaxyGroup.updateMatrixWorld(true);

  labels.forEach((label, index) => {
    const point = points[index];
    if (!point) return;
    const selected = point.item.id === selectedId || index === selectedIndex;
    const hovered = index === hoveredIndex;
    const related = relatedSet.has(point.item.id);
    const pinned = pinnedSet.has(point.item.id);
    const shouldShow = selected || hovered || related || (!selectedId && pinned) || (selectedId && pinned && focusEase < 0.22);
    if (!shouldShow) {
      label.style.opacity = "0";
      label.dataset.state = "hidden";
      return;
    }

    const worldPosition = point.base.clone();
    galaxyGroup.localToWorld(worldPosition);
    worldPosition.project(camera);
    const inView = worldPosition.z > -1 && worldPosition.z < 1 && Math.abs(worldPosition.x) < 1.08 && Math.abs(worldPosition.y) < 1.08;
    if (!inView) {
      label.style.opacity = "0";
      label.dataset.state = "hidden";
      return;
    }

    const x = ((worldPosition.x + 1) * 0.5) * rect.width;
    const y = ((1 - worldPosition.y) * 0.5) * rect.height;
    const depthOpacity = clampReferenceNumber(1 - Math.max(0, worldPosition.z) * 0.38, 0.42, 1);
    const tone = selected ? "selected" : hovered ? "hovered" : related ? "related" : "pinned";
    const opacity = selected ? 0.96 : hovered ? 0.88 : related ? 0.72 : 0.52;
    label.dataset.state = tone;
    label.style.opacity = String(clampReferenceNumber(opacity * depthOpacity, 0, 1));
    label.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -135%)`;
  });
}

function clearReferenceLabels(labels: HTMLDivElement[]) {
  labels.forEach((label) => label.remove());
}

function createReferenceFocusStarLayer(): ReferenceFocusStarLayer {
  const coreTexture = createReferenceRadialTexture([
    { stop: 0, color: "rgba(255,255,255,0)" },
    { stop: 1, color: "rgba(255,255,255,0)" },
  ]);
  const haloTexture = createReferenceRadialTexture([
    { stop: 0, color: "rgba(255,255,255,0)" },
    { stop: 0.2, color: "rgba(174,211,255,0.045)" },
    { stop: 0.52, color: "rgba(90,146,231,0.018)" },
    { stop: 1, color: "rgba(140,191,255,0)" },
  ]);

  const coreMaterial = new THREE.SpriteMaterial({
    map: coreTexture,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0,
  });
  const haloMaterial = new THREE.SpriteMaterial({
    map: haloTexture,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0,
  });
  const group = new THREE.Group();
  const halo = new THREE.Sprite(haloMaterial);
  const core = new THREE.Sprite(coreMaterial);
  halo.renderOrder = 4;
  core.renderOrder = 5;
  group.visible = false;
  group.add(halo, core);

  return {
    group,
    core,
    halo,
    materials: [coreMaterial, haloMaterial],
    textures: [coreTexture, haloTexture],
  };
}

function createReferenceRadialTexture(stops: Array<{ stop: number; color: string }>) {
  const size = 192;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) return new THREE.CanvasTexture(canvas);

  const radius = size / 2;
  const gradient = context.createRadialGradient(radius, radius, 0, radius, radius, radius);
  stops.forEach((item) => gradient.addColorStop(item.stop, item.color));
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function updateReferenceFocusStarLayer(layer: ReferenceFocusStarLayer, focusState: ReferenceFocusState, point: ReferenceGalaxyPoint | undefined, elapsed: number, delta: number) {
  const approach = easeOutReferenceCubic(focusState.approach);
  if (!point || approach <= 0.001) {
    layer.group.visible = false;
    layer.materials.forEach((material) => {
      material.opacity = 0;
    });
    return;
  }

  const pulse = 1 + Math.sin(elapsed * 1.8 + point.phase) * 0.012;
  const nextPosition = focusState.targetLocal.clone();
  nextPosition.x += Math.sin(elapsed * 0.34 + point.phase) * 0.006 * approach;
  nextPosition.y += Math.sin(elapsed * 0.62 + point.phase) * 0.008 * approach;

  layer.group.visible = true;
  layer.group.position.lerp(nextPosition, 1 - Math.exp(-10 * delta));
  layer.halo.material.color.lerp(new THREE.Color(point.color), 0.22);

  const baseScale = (0.22 + approach * 0.14) * pulse;
  layer.core.scale.setScalar(baseScale);
  layer.halo.scale.setScalar(baseScale * 2.45);
  layer.core.material.opacity = 0;
  layer.halo.material.opacity = Math.min(0.085, approach * 0.07);
}

function disposeReferenceFocusStarLayer(layer: ReferenceFocusStarLayer) {
  layer.materials.forEach((material) => material.dispose());
  layer.textures.forEach((texture) => texture.dispose());
}

function updateReferenceFocusMarker(
  marker: HTMLDivElement | null,
  point: ReferenceGalaxyPoint | undefined,
  focusState: ReferenceFocusState,
  galaxyGroup: THREE.Group,
  camera: THREE.PerspectiveCamera,
  canvas: HTMLCanvasElement,
  focusEase: number,
) {
  if (!marker) return;
  if (!point || focusState.approach <= 0.001) {
    marker.style.setProperty("--focus-opacity", "0");
    marker.dataset.active = "false";
    return;
  }

  galaxyGroup.updateMatrixWorld(true);
  const worldPosition = point.base.clone();
  galaxyGroup.localToWorld(worldPosition);
  worldPosition.project(camera);
  const inView = worldPosition.z > -1 && worldPosition.z < 1 && Math.abs(worldPosition.x) < 1.08 && Math.abs(worldPosition.y) < 1.08;
  if (!inView) {
    marker.style.setProperty("--focus-opacity", "0");
    marker.dataset.active = "false";
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const screenX = ((worldPosition.x + 1) * 0.5) * rect.width;
  const screenY = ((1 - worldPosition.y) * 0.5) * rect.height;
  const markerScale = clampReferenceNumber(0.84 + focusEase * 0.18, 0.82, 1.02);
  const markerOpacity = clampReferenceNumber(0.12 + focusEase * 0.58, 0, 0.7);

  marker.style.setProperty("--focus-x", `${screenX}px`);
  marker.style.setProperty("--focus-y", `${screenY}px`);
  marker.style.setProperty("--focus-scale", markerScale.toFixed(3));
  marker.style.setProperty("--focus-opacity", markerOpacity.toFixed(3));
  marker.dataset.active = markerOpacity > 0.02 ? "true" : "false";
}

function updateReferenceDataStarHighlights(points: ReferenceGalaxyPoint[], layer: ReferencePointLayer, hoveredIndex: number, selectedIndex: number, delta: number) {
  for (let index = 0; index < points.length; index += 1) {
    const selected = index === selectedIndex;
    const hovered = index === hoveredIndex;
    const targetSize = points[index].size * (selected ? 2.18 : hovered ? 1.18 : 1);
    const targetAlpha = points[index].alpha * (selected ? 1.82 : hovered ? 1.14 : 1);
    layer.sizes[index] = dampReferenceNumber(layer.sizes[index], targetSize, selected ? 13 : 8, delta);
    layer.alphas[index] = dampReferenceNumber(layer.alphas[index], targetAlpha, selected ? 13 : 8, delta);
  }
  layer.geometry.attributes.pointSize.needsUpdate = true;
  layer.geometry.attributes.alphaBase.needsUpdate = true;
}

function buildReferenceItems(hotspots: Hotspot[]): ReferenceGalaxyItem[] {
  const visibleHotspots = hotspots
    .slice()
    .sort((a, b) => {
      const left = b.paperCount * ((b.confidence ?? 0.5) + 0.5);
      const right = a.paperCount * ((a.confidence ?? 0.5) + 0.5);
      return left - right;
    })
    .slice(0, REFERENCE_VISIBLE_HOTSPOT_LIMIT);
  const fields = Array.from(new Set(visibleHotspots.map((hotspot) => hotspot.field))).sort();
  const maxPaperCount = Math.max(1, ...visibleHotspots.map((hotspot) => hotspot.paperCount));
  const years = visibleHotspots.flatMap((hotspot) => hotspot.evolution.map((item) => item.year)).filter(Number.isFinite);
  const minYear = Math.min(...years, new Date().getFullYear() - 4);
  const maxYear = Math.max(...years, new Date().getFullYear());
  const maxAbsCoordinate = Math.max(
    1,
    ...visibleHotspots.flatMap((hotspot) => [
      Math.abs(hotspot.coordinates.x),
      Math.abs(hotspot.coordinates.y),
      Math.abs(hotspot.coordinates.z),
    ]),
  );
  return visibleHotspots.map((hotspot, index) => {
    const fieldIndex = Math.max(0, fields.indexOf(hotspot.field));
    const confidence = hotspot.confidence ?? 0.5;
    const influence = Math.sqrt(hotspot.paperCount / maxPaperCount);
    const yearCenter = hotspot.evolution.length > 0
      ? hotspot.evolution.reduce((sum, item) => sum + item.year * item.count, 0) / Math.max(1, hotspot.evolution.reduce((sum, item) => sum + item.count, 0))
      : minYear;
    const normalizedYear = (yearCenter - minYear) / Math.max(1, maxYear - minYear);
    return {
      id: hotspot.id,
      title: hotspot.title,
      subtitle: hotspot.summary,
      field: hotspot.field,
      keywords: hotspot.keywords,
      relatedIds: hotspot.similarHotspots?.map((relation) => relation.hotspotId) ?? [],
      paperCount: hotspot.paperCount,
      confidence,
      weight: 1 + influence * 4 + confidence * 1.5,
      color: REFERENCE_FIELD_COLORS[fieldIndex % REFERENCE_FIELD_COLORS.length] ?? REFERENCE_FIELD_COLORS[index % REFERENCE_FIELD_COLORS.length],
      coordinates: new THREE.Vector3(
        clampReferenceNumber(hotspot.coordinates.x / maxAbsCoordinate, -1, 1),
        clampReferenceNumber(hotspot.coordinates.y / maxAbsCoordinate, -1, 1),
        clampReferenceNumber(hotspot.coordinates.z / maxAbsCoordinate, -1, 1),
      ),
      fieldIndex,
      fieldCount: Math.max(1, fields.length),
      index,
      total: Math.max(1, visibleHotspots.length),
      influence,
      normalizedYear: clampReferenceNumber(normalizedYear, 0, 1),
    };
  });
}

function buildReferenceGalaxyPoints(items: ReferenceGalaxyItem[], visualMode: GalaxyVisualMode, layoutMode: GalaxyLayoutMode): ReferenceGalaxyPoint[] {
  return items.map((item, index) => {
    const seed = `${visualMode}:${layoutMode}:${item.field}:${item.id}:${index}`;
    return {
      item,
      color: item.color,
      base: buildResearchHotspotPosition(item, seed, visualMode, layoutMode),
      phase: seededReferenceValue(`${seed}:phase`) * Math.PI * 2,
      speed: 0.25 + seededReferenceValue(`${seed}:speed`) * 0.38,
      drift: 0.005 + seededReferenceValue(`${seed}:drift`) * 0.014,
      stream: 0.18 + seededReferenceValue(`${seed}:stream`) * 0.28,
      size: 18.5 + seededReferenceValue(`${seed}:size`) * 7.4 + Math.min(item.weight, 6) * 2.25 + item.influence * 7.2,
      alpha: 1.04 + item.confidence * 0.2,
    };
  });
}

function buildReferenceGalaxyLinks(points: ReferenceGalaxyPoint[]): ReferenceGalaxyLink[] {
  const indexById = new Map(points.map((point, index) => [point.item.id, index]));
  const links = new Map<string, ReferenceGalaxyLink>();

  points.forEach((point, sourceIndex) => {
    point.item.relatedIds.forEach((targetId) => {
      const targetIndex = indexById.get(targetId);
      if (typeof targetIndex !== "number" || targetIndex === sourceIndex) return;
      const [left, right] = sourceIndex < targetIndex ? [sourceIndex, targetIndex] : [targetIndex, sourceIndex];
      const key = `${left}:${right}`;
      const existing = links.get(key);
      const score = 0.36 + keywordOverlap(points[left].item.keywords, points[right].item.keywords) * 0.34;
      if (!existing || existing.score < score) links.set(key, { sourceIndex: left, targetIndex: right, score });
    });
  });

  for (let sourceIndex = 0; sourceIndex < points.length; sourceIndex += 1) {
    for (let targetIndex = sourceIndex + 1; targetIndex < points.length; targetIndex += 1) {
      const source = points[sourceIndex];
      const target = points[targetIndex];
      const keywordScore = keywordOverlap(source.item.keywords, target.item.keywords);
      const fieldBoost = source.item.field === target.item.field ? 0.09 : 0;
      const distance = source.base.distanceTo(target.base);
      const spatialScore = Math.max(0, 0.16 - distance / 42);
      const score = keywordScore + fieldBoost + spatialScore;
      if (score < 0.14) continue;
      const key = `${sourceIndex}:${targetIndex}`;
      const existing = links.get(key);
      if (!existing || existing.score < score) links.set(key, { sourceIndex, targetIndex, score });
    }
  }

  return Array.from(links.values()).sort((a, b) => b.score - a.score).slice(0, 64);
}

function buildResearchHotspotPosition(item: ReferenceGalaxyItem, seed: string, visualMode: GalaxyVisualMode, layoutMode: GalaxyLayoutMode) {
  if (layoutMode === "timeline") return timelineResearchPosition(item, seed);
  if (layoutMode === "confidence") return confidenceResearchPosition(item, seed);
  if (layoutMode === "spiral") return spiralResearchPosition(item, seed, visualMode);
  return semanticResearchPosition(item, seed, visualMode);
}

function semanticResearchPosition(item: ReferenceGalaxyItem, seed: string, visualMode: GalaxyVisualMode) {
  const legacy = legacyResearchUniversePosition(item, seed, visualMode, 0.82);
  const hasSignal = item.coordinates.lengthSq() > 0.0001;
  if (!hasSignal) return legacy;
  const coordinateBias = new THREE.Vector3(
    item.coordinates.x * 0.82,
    item.coordinates.y * 0.46,
    item.coordinates.z * 0.36,
  );
  return legacy.add(coordinateBias);
}

function spiralResearchPosition(item: ReferenceGalaxyItem, seed: string, visualMode: GalaxyVisualMode) {
  return legacyResearchUniversePosition(item, seed, visualMode, 1.08);
}

function timelineResearchPosition(item: ReferenceGalaxyItem, seed: string) {
  const fieldAngle = (item.fieldIndex / item.fieldCount) * Math.PI * 2;
  const universe = legacyResearchUniversePosition(item, seed, "nebula", 0.7);
  return new THREE.Vector3(
    (item.normalizedYear - 0.5) * 6.2 + universe.x * 0.18,
    Math.sin(fieldAngle) * 1.2 + universe.y * 0.34,
    Math.cos(fieldAngle) * 0.84 + universe.z * 0.36,
  );
}

function confidenceResearchPosition(item: ReferenceGalaxyItem, seed: string) {
  const fieldAngle = (item.fieldIndex / item.fieldCount) * Math.PI * 2 + item.index * 0.31;
  const universe = legacyResearchUniversePosition(item, seed, "nebula", 0.72);
  const shell = 2.25 + item.influence * 1.05;
  return new THREE.Vector3(
    Math.cos(fieldAngle) * shell + universe.x * 0.22,
    (item.confidence - 0.5) * 3.2 + universe.y * 0.18,
    Math.sin(fieldAngle) * shell * 0.42 + universe.z * 0.26,
  );
}

function legacyResearchUniversePosition(item: ReferenceGalaxyItem, seed: string, visualMode: GalaxyVisualMode, scale: number) {
  const order = item.index + 1;
  const t = Math.sqrt(order / Math.max(1, item.total));
  const fieldAngle = (item.fieldIndex / item.fieldCount) * Math.PI * 2;
  const angle = order * REFERENCE_GOLDEN_ANGLE + fieldAngle * 0.42 + (seededReferenceValue(`${seed}:angle`) - 0.5) * 0.55;
  const spread = visualMode === "galaxy" ? 3.72 : 3.34;
  const radius = (0.36 + t * spread + item.influence * 0.42) * scale;
  const verticalFlatten = visualMode === "galaxy" ? 0.42 : 0.5;
  const fieldLift = Math.sin(fieldAngle) * 0.16 + (item.confidence - 0.5) * 0.24;
  const depth = (seededReferenceValue(`${seed}:depth`) - 0.5) * (0.36 + t * 0.72);
  return new THREE.Vector3(
    Math.cos(angle) * radius,
    Math.sin(angle) * radius * verticalFlatten + fieldLift,
    depth + Math.cos(fieldAngle) * 0.16,
  );
}

function buildReferencePaperParticles(points: ReferenceGalaxyPoint[], paperCount: number, visualMode: GalaxyVisualMode): ReferenceDustPoint[] {
  if (points.length === 0) return [];

  const visiblePaperTotal = points.reduce((sum, point) => sum + Math.max(1, point.item.paperCount), 0);
  const looksLikeRealCluster = visiblePaperTotal >= Math.min(500, Math.max(1, paperCount) * 0.08);
  const minTotal = looksLikeRealCluster
    ? REFERENCE_MIN_PAPER_PARTICLES
    : clampReferenceNumber(points.length * 170, 420, 2400);
  const derivedTotal = looksLikeRealCluster
    ? Math.round(Math.sqrt(visiblePaperTotal) * 54 + points.length * 82)
    : Math.round(points.length * 155 + Math.sqrt(visiblePaperTotal) * 42);
  const targetTotal = clampReferenceNumber(derivedTotal, minTotal, REFERENCE_MAX_PAPER_PARTICLES);
  const perHotspotCap = points.length <= 6 ? 1700 : points.length <= 16 ? 980 : REFERENCE_MAX_PARTICLES_PER_HOTSPOT;
  const minPerHotspot = looksLikeRealCluster ? 24 : 58;
  const allocations = points.map((point) => {
    const share = Math.max(1, point.item.paperCount) / visiblePaperTotal;
    return clampReferenceNumber(Math.round(targetTotal * share), minPerHotspot, perHotspotCap);
  });
  const allocatedTotal = allocations.reduce((sum, value) => sum + value, 0);
  if (allocatedTotal > targetTotal) {
    const scale = targetTotal / allocatedTotal;
    allocations.forEach((value, index) => {
      allocations[index] = Math.max(minPerHotspot, Math.floor(value * scale));
    });
  }

  const particles: ReferenceDustPoint[] = [];
  points.forEach((point, pointIndex) => {
    const count = allocations[pointIndex] ?? minPerHotspot;
    const clusterRadius = 0.13 + point.item.influence * 0.55 + Math.min(0.24, Math.log10(point.item.paperCount + 1) * 0.08);
    const verticalScale = visualMode === "galaxy" ? 0.34 : 0.42;
    const depthScale = visualMode === "galaxy" ? 0.16 : 0.22;
    const fieldAngle = (point.item.fieldIndex / point.item.fieldCount) * Math.PI * 2;
    const fieldDrift = new THREE.Vector3(Math.cos(fieldAngle) * 0.04, Math.sin(fieldAngle) * 0.02, Math.sin(fieldAngle * 0.7) * 0.04);

    for (let index = 0; index < count; index += 1) {
      const seed = `${visualMode}:paper:${point.item.id}:${index}`;
      const angle = seededReferenceValue(`${seed}:angle`) * Math.PI * 2;
      const radius = Math.pow(seededReferenceValue(`${seed}:radius`), 0.58) * clusterRadius;
      const strand = (seededReferenceValue(`${seed}:strand`) - 0.5) * clusterRadius * 0.22;
      const base = new THREE.Vector3(
        point.base.x + Math.cos(angle) * radius + fieldDrift.x,
        point.base.y + Math.sin(angle) * radius * verticalScale + fieldDrift.y,
        point.base.z + strand * depthScale + fieldDrift.z,
      );
      const warm = seededReferenceValue(`${seed}:warm`) > 0.84;
      particles.push({
        color: blendReferenceColor(point.color, warm ? "#ffe0a8" : "#eef6ff", 0.12 + seededReferenceValue(`${seed}:mix`) * 0.18),
        base,
        phase: seededReferenceValue(`${seed}:phase`) * Math.PI * 2,
        speed: 0.04 + seededReferenceValue(`${seed}:speed`) * 0.08,
        drift: 0,
        stream: 0,
        size: 1.15 + seededReferenceValue(`${seed}:size`) * (visualMode === "galaxy" ? 1.65 : 1.9),
        alpha: 0.32 + seededReferenceValue(`${seed}:alpha`) * 0.48,
      });
    }
  });

  return particles.slice(0, REFERENCE_MAX_PAPER_PARTICLES);
}

function normalizeReferenceBackgroundDustCount(paperCount: number, itemCount: number, visualMode: GalaxyVisualMode) {
  const derived = paperCount > 0 ? Math.round(Math.sqrt(paperCount) * 5 + itemCount * 12) : 520 + itemCount * 18;
  const min = visualMode === "galaxy" ? 680 : 540;
  const max = visualMode === "galaxy" ? 1700 : 1350;
  return clampReferenceNumber(derived, min, max);
}

function buildReferenceBackgroundDust(count: number, visualMode: GalaxyVisualMode): ReferenceDustPoint[] {
  return Array.from({ length: count }, (_, index) => {
    const seed = `${visualMode}:background:${index}`;
    const angle = seededReferenceValue(`${seed}:theta`) * Math.PI * 2;
    const height = seededReferenceValue(`${seed}:height`) * 2 - 1;
    const radius = 5.4 + seededReferenceValue(`${seed}:radius`) * (visualMode === "galaxy" ? 5.2 : 4.6);
    const spread = Math.sqrt(Math.max(0, 1 - height * height));
    return {
      color: seededReferenceValue(`${seed}:warm`) > 0.88 ? "#efe0bf" : "#bfd9ff",
      base: new THREE.Vector3(Math.cos(angle) * spread * radius, height * radius * 0.8, Math.sin(angle) * spread * radius - 1.8),
      phase: seededReferenceValue(`${seed}:phase`) * Math.PI * 2,
      speed: 0.04 + seededReferenceValue(`${seed}:speed`) * 0.12,
      drift: 0.001 + seededReferenceValue(`${seed}:drift`) * 0.004,
      stream: 0.3 + seededReferenceValue(`${seed}:stream`) * 0.58,
      size: 1.1 + seededReferenceValue(`${seed}:size`) * 1.55,
      alpha: 0.22 + seededReferenceValue(`${seed}:alpha`) * 0.38,
    };
  });
}

function blendReferenceColor(left: string, right: string, mix: number) {
  return new THREE.Color(left).lerp(new THREE.Color(right), clampReferenceNumber(mix, 0, 1)).getStyle();
}

function seededReferenceValue(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10000) / 10000;
}

function keywordOverlap(left: string[], right: string[]) {
  const a = new Set(left.map((item) => item.toLowerCase()));
  const b = new Set(right.map((item) => item.toLowerCase()));
  const shared = Array.from(a).filter((item) => b.has(item)).length;
  const union = new Set([...a, ...b]).size || 1;
  return shared / union;
}

function compactReferenceLabel(value: string, maxLength = 30) {
  return value.length <= maxLength ? value : `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function escapeReferenceHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function dampReferenceNumber(current: number, target: number, lambda: number, delta: number) {
  return current + (target - current) * (1 - Math.exp(-lambda * delta));
}

function easeOutReferenceCubic(value: number) {
  return 1 - Math.pow(1 - clampReferenceNumber(value, 0, 1), 3);
}

function clampReferenceNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function nearestReferenceAngle(target: number, current: number) {
  return current + THREE.MathUtils.euclideanModulo(target - current + Math.PI, Math.PI * 2) - Math.PI;
}
