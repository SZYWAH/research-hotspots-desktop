import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

import type { App17GalaxyHotspotPoint, App17GalaxyPayload, HotspotEvidencePaperSnapshot } from "../types";

type App17GalaxyCommand = {
  kind: "reset" | "fit" | "top" | "enter-system" | "exit-system" | "reset-system" | "focus-paper" | "return-system-center" | "toggle-paper-inspection";
  nonce: number;
};

export type GalaxyExplorationState = "overview" | "preparing" | "entering" | "system" | "exiting";

export type GalaxySystemViewMode = "system" | "paper-focus";

export type GalaxyPaperFocusState = "idle" | "entering" | "focused" | "exiting";

export type GalaxyPaperInspectionMode = "none" | "docked" | "centered";

export type GalaxyPaperPanelState = "hidden" | "staged" | "entering" | "visible" | "exiting";

export type GalaxyPaperInspectionVisualType = "none" | "data-sphere" | "energy-core";

export type GalaxyPaperCameraWriter = "orbit" | "paper-flight" | "paper-composition" | "paper-return";

export type GalaxyPaperVisualMetadata = {
  id: string;
  year?: number;
  source?: string;
  representative: boolean;
};

export type GalaxyPaperDetailCacheState = "idle" | "representative" | "hit" | "miss" | "missing" | "error";

export type GalaxyPerformanceScenario = "overview-auto" | "interacting" | "system-exploration" | "top-static" | "theory-static";

export type GalaxyAmbientMotion = "none" | "rotation-breath" | "breath";

export type GalaxyEnvironmentMotion = "none" | "twinkle";

export type GalaxyBloomRenderMode = "none" | "local";

export type GalaxyPerformanceSnapshot = {
  scenario: GalaxyPerformanceScenario;
  fullscreen: boolean;
  sampleDurationMs: number;
  currentFps: number;
  averageFps: number;
  averageFrameMs: number;
  p95FrameMs: number;
  maxFrameMs: number;
  averageWebglMs: number;
  averageLabelMs: number;
  longFrames50: number;
  longFrames100: number;
  drawCalls: number;
  renderedPoints: number;
  geometries: number;
  textures: number;
  paperCount: number;
  hotspotCount: number;
  width: number;
  height: number;
  pixelRatio: number;
  projectionZoom: number;
  environmentStarCount: number;
  environmentVisibleStarEstimate: number;
  environmentMicroCount: number;
  environmentCompactCount: number;
  environmentAnchorCount: number;
  environmentMotion: GalaxyEnvironmentMotion;
  environmentTargetFps: number;
  ambientMotion: GalaxyAmbientMotion;
  ambientTargetFps: number;
  ambientCadenceMisses: number;
  selectionToFirstFrameMs: number;
  resumeToFirstFrameMs: number;
  focusTransitionMs: number;
  focusTransitionActive: boolean;
  systemPrepareMs: number;
  systemCacheHit: boolean;
  systemVisualMode: "none" | "display" | "theory";
  systemStarDrawCalls: number;
  systemStarBloomDrawCalls: number;
  systemMovingPaperCount: number;
  systemTargetFps: number;
  systemStarProjectedDiameter: number;
  systemStarViewportRatio: number;
  systemStarLod: "none" | GalaxySystemStarLod;
  systemStarLodBlend: number;
  systemStarFarCoreBlend: number;
  systemStarCoronaBlend: number;
  systemStarSurfaceDetailBlend: number;
  systemStarDepthOcclusionActive: boolean;
  systemStarSurfaceBloomBlend: number;
  systemStarCoronaCloseupBlend: number;
  systemStarRotationDegrees: number;
  systemStarMotionActive: boolean;
  overviewSelectedTopicOpacity: number;
  systemCloudOpacity: number;
  systemUniquePaperCount: number;
  systemDuplicatePaperCount: number;
  systemHiddenRepresentativeCount: number;
  systemUnresolvedRepresentativeCount: number;
  systemPaperLod: "none" | GalaxySystemPaperLod;
  systemPaperLodBlend: number;
  systemPaperMinPointSize: number;
  systemPaperMaxPointSize: number;
  systemPaperRevealProgress: number;
  systemPaperExposure: number;
  systemPaperTargetExposure: number;
  systemPaperDepthBrightnessFloor: number;
  systemPaperDepthSizeFloor: number;
  systemRepresentativeFocusMode: GalaxySystemPaperFocusMode;
  systemRepresentativeFocusRank: number;
  systemRepresentativeDimFactor: number;
  systemRepresentativeBloomActive: boolean;
  systemPaperPickMs: number;
  systemPaperPickP95Ms: number;
  systemPaperPickCandidateCount: number;
  systemSelectedPaperType: "none" | "representative" | "ordinary";
  systemPaperDetailQueryMs: number;
  systemPaperDetailCacheState: GalaxyPaperDetailCacheState;
  systemViewMode: GalaxySystemViewMode;
  systemPaperFocusState: GalaxyPaperFocusState;
  systemPaperFocusProgress: number;
  systemPaperFocusStartDistance: number;
  systemPaperFocusTransitionMs: number;
  systemPaperFocusTargetDistance: number;
  systemPaperFocusTargetScreenSize: number;
  systemPaperFocusNeighborBrightness: number;
  systemPaperFocusContextBrightness: number;
  systemPaperFocusCanceled: boolean;
  systemPaperInspectionMode: GalaxyPaperInspectionMode;
  systemPaperInspectionVisualType: GalaxyPaperInspectionVisualType;
  systemPaperInspectionBlend: number;
  systemPaperInspectionDockBlend: number;
  systemPaperInspectionDiameter: number;
  systemPaperInspectionDrawCalls: number;
  systemPaperPanelState: GalaxyPaperPanelState;
  systemPaperPanelProgress: number;
  systemPaperPanelHeaderProgress: number;
  systemPaperPanelBodyProgress: number;
  systemPaperTargetAnchorX: number;
  systemPaperAnchorErrorPx: number;
  systemPaperCameraWriter: GalaxyPaperCameraWriter;
  systemPaperReturnHorizontalReversals: number;
  systemRepresentativeEnergyCoreDrawCalls: number;
  systemRepresentativeEnergyDetailBlend: number;
  systemRepresentativeEnergyBloomOpacity: number;
  systemRepresentativeEnergyWispCount: number;
  systemRepresentativeEnergyCarrierScale: number;
  systemRepresentativeEnergyCloseupCompactness: number;
  systemRepresentativeEnergyVisibleRadius: number;
  systemRepresentativeEnergyOrbitAttenuation: number;
  systemRepresentativeEnergyBodyCoreDiameter: number;
  systemRepresentativeEnergyBodyCoreBlend: number;
  systemRepresentativeEnergyFresnelWidth: number;
  systemRepresentativeEnergyOuterGlowDiameter: number;
  systemRepresentativeEnergyOuterGlowMonotonic: boolean;
  systemRepresentativeEnergyMicroCoreDiameter: number;
  systemRepresentativeEnergyMicroCoreBlend: number;
  systemRepresentativeEnergySoftCoreAttenuation: number;
  systemRepresentativeEnergyMicroCoreBrightness: number;
  systemPaperInspectionBloomDrawCalls: number;
  systemPaperAngularSizeRatio: number;
  systemPaperAngularGrowthRatio: number;
  systemPaperFlightPathMode: GalaxyPaperFlightPathMode;
  systemPaperCameraDistance: number;
  systemPaperCenterErrorPx: number;
  systemPaperStarClearance: number;
  transitionTailP95Ms: number;
  transitionTailLongFrames50: number;
  transitionCanvasResizeCount: number;
  transitionCanvasTopDelta: number;
  transitionScrollDelta: number;
  representativePrepareMs: number;
  representativeCommitMs: number;
  lastNormalizedWheelDelta: number;
  lastWheelDistanceRatio: number;
  transitionP95Ms: number;
  transitionLongFrames50: number;
  evidenceUpdateDeferred: boolean;
  bloomRequestedMode: GalaxyBloomRenderMode;
  bloomEffectiveMode: GalaxyBloomRenderMode;
  bloomAvailable: boolean;
  bloomThreshold: number;
  bloomStrength: number;
  bloomRadius: number;
  bloomBlend: number;
  bloomResolutionScale: number;
  bloomBufferPixelRatio: number;
  averageBloomMs: number;
  p95BloomMs: number;
  gpuVendor: string;
  gpuRenderer: string;
};

type App17GalaxyCanvasProps = {
  active: boolean;
  payload: App17GalaxyPayload;
  selectedId: string;
  selectedPaperId?: string;
  selectedPaperVisual?: GalaxyPaperVisualMetadata;
  visualMode: "nebula" | "galaxy";
  command: App17GalaxyCommand;
  representativePapers?: HotspotEvidencePaperSnapshot[];
  onSelect: (hotspotId: string) => void;
  onSelectPaper?: (paperId: string) => void;
  onExplorationStateChange?: (state: GalaxyExplorationState) => void;
  onSystemViewModeChange?: (mode: GalaxySystemViewMode) => void;
  onPaperFocusStateChange?: (state: GalaxyPaperFocusState, paperId: string) => void;
  onPaperInspectionModeChange?: (mode: GalaxyPaperInspectionMode, paperId: string) => void;
  onPaperPanelStateChange?: (state: GalaxyPaperPanelState, paperId: string) => void;
  onClearSelection: () => void;
  paperDetailQueryMs?: number;
  paperDetailCacheState?: GalaxyPaperDetailCacheState;
  diagnosticsResetNonce?: number;
  fullscreen?: boolean;
  onBloomAvailabilityChange?: (available: boolean, reason?: string) => void;
  onPerformanceSnapshot?: (snapshot: GalaxyPerformanceSnapshot) => void;
};

type App17RenderPoint = {
  id: string;
  title: string;
  field: string;
  topicId: number;
  paperCount: number;
  color: string;
  size: number;
  seed: number;
  glowStrength: number;
  importance: number;
  displaySize: number;
  position: THREE.Vector3;
};

type App17ParticlePoint = {
  paperId: string;
  topicKey: string;
  x: number;
  y: number;
  z: number;
  color: string;
  haloColor?: string;
  size: number;
  alpha: number;
  year?: number;
  representativeRank?: number;
  visualSeed: number;
  rayAngle: number;
  visualSizeVariation: number;
  visualBrightnessVariation: number;
};

type App17CameraPreset = {
  center: THREE.Vector3;
  distance: number;
  minDistance: number;
  maxDistance: number;
  azimuth: number;
  elevation: number;
  minElevation: number;
  maxElevation: number;
  fitDistance: number;
  fitAzimuth: number;
  fitElevation: number;
  topDistance: number;
  topAzimuth: number;
  topElevation: number;
  zScale: number;
  autoRotate: boolean;
  autoRotateAzimuthStep: number;
};

type App17ViewMode = "overview" | "system" | "top";

type App17OrbitPose = {
  center: THREE.Vector3;
  distance: number;
  azimuth: number;
  elevation: number;
};

type App17OrbitTransition = {
  kind: App17GalaxyCommand["kind"];
  startedAt: number;
  durationMs: number;
  from: App17OrbitPose;
  to: App17OrbitPose;
  centerControl?: THREE.Vector3;
  cameraFrom?: THREE.Vector3;
  cameraTo?: THREE.Vector3;
  cameraControl?: THREE.Vector3;
  logarithmicDistance?: boolean;
};

type App17OrbitState = {
  center: THREE.Vector3;
  distance: number;
  targetDistance: number;
  azimuth: number;
  elevation: number;
  transition: App17OrbitTransition | null;
  pointerPressed: boolean;
  dragging: boolean;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  pauseUntil: number;
  viewMode: App17ViewMode;
};

type App17SceneData = {
  kind: "app14" | "app15";
  papers: App17ParticlePoint[];
  hotspots: App17RenderPoint[];
  orbitPositions: Float32Array | null;
  camera: App17CameraPreset;
};

type App17TimedSample = {
  timestamp: number;
  value: number;
};

type App17ScalarTransition = {
  startedAt: number;
  durationMs: number;
  from: number;
  to: number;
};

type GalaxySystemPaper = {
  id: string;
  title: string;
  source: string;
  year?: number;
  rank: number;
  displaySize: number;
  color: string;
  orbit: GalaxySystemOrbit;
  position: THREE.Vector3;
};

type GalaxySystemCloudPaper = {
  id: string;
  year?: number;
  position: THREE.Vector3;
  color: string;
  index: number;
};

type GalaxySystemVisualMode = "display" | "theory";

type GalaxySystemStarLod = "far" | "transition" | "near" | "surface";

type GalaxySystemPaperLod = "far" | "medium" | "near";

type GalaxySystemPaperFocusMode = "none" | "hover" | "selected";

type GalaxyRepresentativeEnergyWisp = {
  angle: number;
  width: number;
  curvature: number;
  strength: number;
};

type GalaxyRepresentativeEnergyProfile = {
  primaryAngle: number;
  secondaryAngle: number;
  eccentricity: number;
  wispCount: number;
  wisps: [GalaxyRepresentativeEnergyWisp, GalaxyRepresentativeEnergyWisp];
};

type GalaxyCoronaSector = {
  angle: number;
  width: number;
  extension: number;
  curvature: number;
  opacity: number;
};

type GalaxyCoronaProfile = {
  sectors: [GalaxyCoronaSector, GalaxyCoronaSector, GalaxyCoronaSector, GalaxyCoronaSector];
  sectorCount: number;
  innerHaloStrength: number;
  trendStrength: number;
};

type GalaxySystemOrbit = {
  majorRadius: number;
  minorRadius: number;
  inclination: number;
  nodeAngle: number;
  phase: number;
  angularSpeed: number;
  rotation: THREE.Quaternion;
};

type GalaxySystemResources = {
  hotspotId: string;
  hotspot: App17GalaxyHotspotPoint;
  visualMode: GalaxySystemVisualMode;
  root: THREE.Group;
  cloudLayer: ReturnType<typeof createSystemPaperLayer>;
  representativeLayer?: ReturnType<typeof createSystemRepresentativeLayer>;
  representativeBloomLayer?: ReturnType<typeof createSystemRepresentativeBloomLayer>;
  orbitLayer?: ReturnType<typeof createSystemOrbitLayer>;
  star: ReturnType<typeof createSystemStar>;
  representativePapers: GalaxySystemPaper[];
  canonicalPaperIdById: Map<string, string>;
  uniquePaperCount: number;
  duplicatePaperCount: number;
  hiddenRepresentativeCount: number;
  unresolvedRepresentativeCount: number;
  representativeSignature: string;
  activeTimeSeconds: number;
  entryScale: number;
  starEntryScale: number;
  updateAnimation: (elapsedSeconds: number, motionEnabled: boolean, frozenPaperIds: Set<string>) => boolean;
  dispose: () => void;
};

type GalaxySystemRepresentativeBundle = {
  signature: string;
  representativeLayer?: ReturnType<typeof createSystemRepresentativeLayer>;
  representativeBloomLayer?: ReturnType<typeof createSystemRepresentativeBloomLayer>;
  orbitLayer?: ReturnType<typeof createSystemOrbitLayer>;
  representativePapers: GalaxySystemPaper[];
  hiddenRepresentativeIds: Set<string>;
  hiddenRepresentativeCount: number;
  unresolvedRepresentativeCount: number;
  dispose: () => void;
};

type GalaxyExplorationRuntime = {
  state: GalaxyExplorationState;
  blend: number;
  fromBlend: number;
  toBlend: number;
  savedOverviewPose: App17OrbitPose | null;
  savedOverviewViewMode: App17ViewMode;
  savedOverviewPauseUntil: number;
  focusWorld: THREE.Vector3;
  focusLocal: THREE.Vector3;
  selectedTopicKey: string;
  systemDistance: number;
  entryFocusDistance: number;
};

type GalaxyPaperFocusRuntime = {
  state: GalaxyPaperFocusState;
  blend: number;
  fromBlend: number;
  toBlend: number;
  targetId: string;
  startDistance: number;
  targetDistance: number;
  targetScreenSize: number;
  flightStrength: number;
  canceled: boolean;
};

type GalaxyPaperInspectionRuntime = {
  mode: GalaxyPaperInspectionMode;
  visualType: GalaxyPaperInspectionVisualType;
  blend: number;
  dockBlend: number;
  dockTransition: App17ScalarTransition | null;
  panelState: GalaxyPaperPanelState;
  panelProgress: number;
  panelTransition: App17ScalarTransition | null;
};

type GalaxyPaperVisualHandoffState = "none" | "entering" | "locked" | "return-hold" | "return-handoff";

type GalaxyPaperVisualHandoffRuntime = {
  state: GalaxyPaperVisualHandoffState;
  lockedInspectionBlend: number;
  lockedProjectedDiameter: number;
  lockedAnchorNdcX: number;
  returnHoldProgress: number;
  cameraTakeoverPending: boolean;
};

type GalaxyPaperFlightPathMode = "none" | "direct" | "avoidance";

type GalaxyPaperDirectFlight = {
  kind: "focus" | "return";
  pathMode: GalaxyPaperFlightPathMode;
  startedAt: number;
  durationMs: number;
  startCameraPosition: THREE.Vector3;
  endCameraPosition: THREE.Vector3;
  controlPoint: THREE.Vector3 | null;
  arcLengthTable: Float32Array | null;
  startQuaternion: THREE.Quaternion;
  endQuaternion: THREE.Quaternion;
  startLookTarget: THREE.Vector3;
  endLookTarget: THREE.Vector3;
  paperWorldPosition: THREE.Vector3;
  startDistance: number;
  targetDistance: number;
  minimumStarClearance: number;
  returnPose: App17OrbitPose | null;
  startAnchorNdcX: number;
  targetAnchorNdcX: number;
  settledFramePending: boolean;
};

type GalaxyPaperCompositionTimeline = {
  targetAnchorNdcX: number;
  currentAnchorNdcX: number;
  anchorErrorPx: number;
  panelHeaderProgress: number;
  panelBodyProgress: number;
  cameraWriter: GalaxyPaperCameraWriter;
  returnHorizontalReversals: number;
  lastReturnScreenX: number;
  lastReturnDirection: number;
};

type GalaxyPaperSurfaceProfile = {
  axisA: THREE.Vector3;
  axisB: THREE.Vector3;
  axisC: THREE.Vector3;
  phases: THREE.Vector3;
  frequencies: THREE.Vector3;
  rotationAxis: THREE.Vector3;
};

type IdleCapableWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

const APP17_CAMERA_FOV = 42;
const APP17_DRAG_THRESHOLD = 4;
const APP17_INTERACTION_PAUSE_MS = 1_200;
const APP17_OVERVIEW_FRAME_INTERVAL = 1_000 / 30;
const APP17_INTERACTION_FRAME_INTERVAL = 1_000 / 60;
const APP17_LABEL_FRAME_INTERVAL = 1_000 / 20;
const APP17_DEFAULT_LABEL_LIMIT = 20;
const APP17_ZOOM_LABEL_LIMIT = 35;
const APP17_ZOOM_LABEL_RADIUS = 7;
const APP17_COMMAND_TRANSITION_MS = 450;
const APP17_FULLSCREEN_TRANSITION_MS = 320;
const APP17_FULLSCREEN_APP14_ZOOM = 1.13;
const APP17_FULLSCREEN_APP15_ZOOM = 1.10;
const APP17_FULLSCREEN_SYSTEM_ZOOM = 1.05;
const APP17_SYSTEM_TRANSITION_MS = 2_000;
const APP17_SYSTEM_DISTANCE = 8;
const APP17_SYSTEM_MIN_DISTANCE = 1;
const APP17_SYSTEM_MAX_DISTANCE = 12;
const APP17_SYSTEM_ELEVATION = THREE.MathUtils.degToRad(24);
const APP17_SYSTEM_RADIUS = 3.2;
const APP17_SYSTEM_ORBIT_SEGMENTS = 96;
const APP17_SYSTEM_CACHE_LIMIT = 4;
const APP17_SYSTEM_STAR_RADIUS = 0.38;
const APP17_SYSTEM_STAR_DRAW_CALLS = 3;
const APP17_SYSTEM_STAR_FAR_MAX_VIEWPORT_RATIO = 0.09;
const APP17_SYSTEM_STAR_NEAR_MIN_VIEWPORT_RATIO = 0.2;
const APP17_SYSTEM_STAR_SURFACE_MIN_VIEWPORT_RATIO = 0.45;
const APP17_SYSTEM_STAR_ROTATION_PERIOD_SECONDS = 60;
const APP17_SYSTEM_INNER_ORBIT_PERIOD_SECONDS = 90;
const APP17_SYSTEM_OUTER_ORBIT_PERIOD_SECONDS = 210;
const APP17_SYSTEM_PAPER_FAR_DISTANCE = 10.5;
const APP17_SYSTEM_PAPER_MEDIUM_DISTANCE = 6.5;
const APP17_SYSTEM_PAPER_NEAR_DISTANCE = 3.2;
const APP17_SYSTEM_PAPER_REVEAL_START = 0.25;
const APP17_SYSTEM_PAPER_REVEAL_END = 0.82;
const APP17_SYSTEM_PAPER_FAR_EXPOSURE = 1.4;
const APP17_SYSTEM_PAPER_MEDIUM_EXPOSURE = 1.35;
const APP17_SYSTEM_PAPER_NEAR_EXPOSURE = 1.2;
const APP17_SYSTEM_PAPER_DEPTH_BRIGHTNESS_FLOOR = 0.67;
const APP17_SYSTEM_PAPER_DEPTH_SIZE_FLOOR = 0.83;
const APP17_SYSTEM_PAPER_PICK_RADIUS_PX = 12;
const APP17_SYSTEM_ORDINARY_PAPER_PICK_RADIUS_PX = 7;
const APP17_SYSTEM_PAPER_PICK_INTERVAL_MS = 1_000 / 30;
const APP17_SYSTEM_PAPER_FOCUS_MIN_DISTANCE = 0.12;
const APP17_SYSTEM_PAPER_FOCUS_MAX_DISTANCE = 2.2;
const APP17_SYSTEM_PAPER_FOCUS_DISTANCE = 0.85;
const APP17_SYSTEM_PAPER_FOCUS_TRANSITION_MS = 1_800;
const APP17_SYSTEM_PAPER_RETARGET_TRANSITION_MS = 1_100;
const APP17_SYSTEM_PAPER_RETURN_TRANSITION_MS = 1_100;
const APP17_SYSTEM_PAPER_FOCUS_ORDINARY_SIZE = 32;
const APP17_SYSTEM_PAPER_FOCUS_REPRESENTATIVE_SIZE = 43;
const APP17_SYSTEM_PAPER_FOCUS_ORDINARY_MAX_SIZE = 52;
const APP17_SYSTEM_PAPER_FOCUS_REPRESENTATIVE_MAX_SIZE = 62;
const APP17_SYSTEM_PAPER_FOCUS_CONTEXT_BRIGHTNESS = 0.34;
const APP17_SYSTEM_PAPER_FOCUS_NEIGHBOR_BRIGHTNESS = 0.55;
const APP17_SYSTEM_PAPER_FOCUS_REPRESENTATIVE_BRIGHTNESS = 0.45;
const APP17_SYSTEM_PAPER_FOCUS_ORBIT_BRIGHTNESS = 0.28;
const APP17_SYSTEM_PAPER_FOCUS_STAR_BRIGHTNESS = 0.24;
const APP17_SYSTEM_PAPER_FOCUS_RESPONSE = 20;
const APP17_PAPER_INSPECTION_PANEL_START_PROGRESS = 0.36;
const APP17_PAPER_INSPECTION_HEADER_START_PROGRESS = 0.46;
const APP17_PAPER_INSPECTION_BODY_START_PROGRESS = 0.58;
const APP17_PAPER_INSPECTION_PANEL_ENTER_MS = 520;
const APP17_PAPER_INSPECTION_PANEL_EXIT_MS = 150;
const APP17_PAPER_INSPECTION_TOGGLE_MS = 420;
const APP17_PAPER_INSPECTION_WORLD_DIAMETER = 0.08;
const APP17_PAPER_INSPECTION_ARRIVAL_VIEWPORT_RATIO = 0.62;
const APP17_PAPER_INSPECTION_HANDOFF_START_PX = 22;
const APP17_PAPER_INSPECTION_HANDOFF_END_PX = 26;
const APP17_PAPER_RETURN_VISUAL_HOLD_PROGRESS = 0.18;
const APP17_REPRESENTATIVE_SYSTEM_SIZE_SCALE = 1.32;
const APP17_REPRESENTATIVE_INSPECTION_SCALE = 1.16;
const APP17_REPRESENTATIVE_INSPECTION_HANDOFF_START_PX = 24;
const APP17_REPRESENTATIVE_INSPECTION_HANDOFF_END_PX = 56;
const APP17_REPRESENTATIVE_BLOOM_STRENGTH_SCALE = 0.9;
const APP17_REPRESENTATIVE_ENERGY_CARRIER_SCALE = 1.35;
const APP17_REPRESENTATIVE_ENERGY_DETAIL_START_PX = 24;
const APP17_REPRESENTATIVE_ENERGY_DETAIL_END_PX = 72;
const APP17_REPRESENTATIVE_ENERGY_NEAR_BLOOM_END_PX = 160;
const APP17_REPRESENTATIVE_BODY_CORE_START_PX = 96;
const APP17_REPRESENTATIVE_BODY_CORE_END_PX = 180;
const APP17_REPRESENTATIVE_BODY_CORE_RATIO = 0.18;
const APP17_REPRESENTATIVE_BODY_CORE_MIN_DIAMETER_PX = 72;
const APP17_REPRESENTATIVE_BODY_CORE_MAX_DIAMETER_PX = 112;
const APP17_REPRESENTATIVE_BODY_CORE_BRIGHTNESS = 1.0;
const APP17_REPRESENTATIVE_OUTER_HALO_SCALE = 3.65;
const APP17_REPRESENTATIVE_MICRO_CORE_RATIO = 0.18;
const APP17_REPRESENTATIVE_MICRO_CORE_MIN_DIAMETER_PX = 14;
const APP17_REPRESENTATIVE_MICRO_CORE_MAX_DIAMETER_PX = 22;
const APP17_REPRESENTATIVE_MICRO_CORE_BRIGHTNESS = 0.985;
const APP17_REPRESENTATIVE_MICRO_CORE_BLOOM_WEIGHT = 0.028;
const APP17_PAPER_FLIGHT_AIM_PORTION = 0.42;
const APP17_PAPER_FLIGHT_STAR_CLEARANCE = 1.25;
const APP17_PAPER_FLIGHT_ARC_SAMPLES = 64;
const APP17_BLOOM_LAYER = 1;
const APP17_BLOOM_RESOLUTION_SCALE = 0.65;
const APP17_LOCAL_BLOOM_THRESHOLD = 0.82;
const APP17_LOCAL_BLOOM_STRENGTH = 0.24;
const APP17_LOCAL_BLOOM_RADIUS = 0.18;
const APP17_LOCAL_BLOOM_START_BLEND = 0.32;
const APP17_LOCAL_BLOOM_END_BLEND = 0.82;
const APP17_FAR_SCENE_SCALE = 7.5;
const APP17_FAR_PAPER_OPACITY = 0.1;
const APP17_FAR_PAPER_SIZE = 0.55;
const APP17_FAR_HOTSPOT_CORE_OPACITY = 0.44;
const APP17_FAR_HOTSPOT_HALO_OPACITY = 0.24;
const APP17_FAR_HOTSPOT_RAY_OPACITY = 0.12;
const APP17_FAR_HOTSPOT_SIZE = 0.7;
const APP17_FAR_ORBIT_OPACITY = 0.04;
const APP17_FAR_ROTATION_RADIANS_PER_SECOND = THREE.MathUtils.degToRad(0.045);
const APP17_APP14_AMBIENT_FRAME_INTERVAL = 1_000 / 20;
const APP17_APP15_AMBIENT_FRAME_INTERVAL = 1_000 / 12;
const APP17_ENVIRONMENT_STAR_COUNT = 9_000;
const APP17_ENVIRONMENT_MICRO_COUNT = 7_560;
const APP17_ENVIRONMENT_COMPACT_COUNT = 1_260;
const APP17_ENVIRONMENT_ANCHOR_COUNT = 180;
const APP17_ENVIRONMENT_SYSTEM_RATIO = 0.6;
const APP17_ENVIRONMENT_SHELL_RADIUS = 160;
const APP17_ENVIRONMENT_APP14_FRAME_INTERVAL = 1_000 / 20;
const APP17_ENVIRONMENT_APP15_FRAME_INTERVAL = 1_000 / 12;
const APP17_ENVIRONMENT_INNER_DENSITY = 0.55;
const APP17_ENVIRONMENT_INNER_BRIGHTNESS = 0.55;
const APP17_WHEEL_TIME_CONSTANT_MS = 60;
const APP17_WHEEL_MAX_PIXEL_DELTA = 120;
const APP17_WHEEL_LINE_PIXELS = 16;
const APP17_WHEEL_SENSITIVITY = 0.00065;
const APP17_PERFORMANCE_WINDOW_MS = 10_000;
const APP17_PERFORMANCE_REPORT_INTERVAL_MS = 500;
const APP17_INTERACTION_SCENARIO_HOLD_MS = 3_000;
const APP17_PALETTE = ["#38bdf8", "#818cf8", "#34d399", "#f472b6", "#fbbf24", "#a78bfa", "#2dd4bf", "#fb7185", "#fcd34d", "#94a3b8"];
const APP17_FOCUS_TEXTURE_SIZE = 256;
const APP17_FOCUS_RING_RADIUS = 88;
const APP17_FOCUS_CSS_DIAMETER = 56;

const APP14_COORD_SCALE = 0.00205;
const APP14_VISIBLE_HOTSPOTS = 50;
const APP14_ORBIT_COUNT = 5;
const APP14_ORBIT_SEGMENTS = 120;
const APP14_PHI = (1 + Math.sqrt(5)) / 2;

const APP15_COORD_SCALE = 0.0047;
const APP17_SCENE_CACHE = new WeakMap<App17GalaxyPayload, Map<"nebula" | "galaxy", App17SceneData>>();

const REPRESENTATIVE_ENERGY_FIELD_GLSL = `
  float representativeAngularDistance(float firstAngle, float secondAngle) {
    return abs(atan(sin(firstAngle - secondAngle), cos(firstAngle - secondAngle)));
  }

  float representativeBoundedEnergy(float rawEnergy) {
    return 1.0 - exp(-max(0.0, rawEnergy) * 0.82);
  }

  float representativeEnergyHash(float value) {
    return fract(sin(value * 91.337 + 17.17) * 43758.5453123);
  }

  void representativeEnergyProfileFromSeed(
    float visualSeed,
    float rayAngle,
    float representativeRank,
    out float primaryAngle,
    out float secondaryAngle,
    out float eccentricity,
    out vec4 wispA,
    out vec4 wispB,
    out float wispCount
  ) {
    float seed = visualSeed * 137.19 + rayAngle * 0.173 + representativeRank * 1.31;
    float topRepresentative = 1.0 - step(2.5, representativeRank);
    float firstGate = mix(
      step(0.54, representativeEnergyHash(seed + 1.0)),
      step(0.16, representativeEnergyHash(seed + 1.0)),
      topRepresentative
    );
    float secondGate = topRepresentative * step(0.60, representativeEnergyHash(seed + 2.0));
    firstGate = max(firstGate, secondGate);
    primaryAngle = rayAngle + (representativeEnergyHash(seed + 3.0) - 0.5) * 1.35;
    secondaryAngle = representativeEnergyHash(seed + 4.0) * 6.28318530718;
    eccentricity = mix(0.05, 0.14, representativeEnergyHash(seed + 5.0));
    wispA = vec4(
      representativeEnergyHash(seed + 6.0) * 6.28318530718,
      mix(0.08, 0.16, representativeEnergyHash(seed + 7.0)),
      mix(-0.22, 0.22, representativeEnergyHash(seed + 8.0)),
      mix(0.025, 0.055, representativeEnergyHash(seed + 9.0)) * firstGate
    );
    wispB = vec4(
      representativeEnergyHash(seed + 10.0) * 6.28318530718,
      mix(0.08, 0.16, representativeEnergyHash(seed + 11.0)),
      mix(-0.22, 0.22, representativeEnergyHash(seed + 12.0)),
      mix(0.025, 0.055, representativeEnergyHash(seed + 13.0)) * secondGate
    );
    wispCount = firstGate + secondGate;
  }

  float representativeEnergyWisp(
    float angle,
    float opticalRadius,
    vec4 wisp,
    float enabled,
    float detailBlend,
    float energyTime,
    float closeupCompactness
  ) {
    float curvedAngle = wisp.x
      + sin(opticalRadius * 5.3 + energyTime * 0.18 + wisp.x * 3.0) * wisp.z;
    float directional = exp(-pow(
      representativeAngularDistance(angle, curvedAngle) / max(0.001, wisp.y),
      2.0
    ));
    float radial = smoothstep(
      mix(0.30, 0.28, closeupCompactness),
      mix(0.42, 0.36, closeupCompactness),
      opticalRadius
    ) * (1.0 - smoothstep(
      mix(0.64, 0.54, closeupCompactness),
      mix(0.78, 0.62, closeupCompactness),
      opticalRadius
    ));
    return directional
      * radial
      * wisp.w
      * enabled
      * detailBlend
      * mix(1.0, 0.70, closeupCompactness);
  }

  void sampleRepresentativeEnergy(
    vec2 point,
    float carrierScale,
    float primaryAngle,
    float secondaryAngle,
    float eccentricity,
    vec4 wispA,
    vec4 wispB,
    float wispCount,
    float detailBlend,
    float energyTime,
    float closeupCompactness,
    out float core,
    out float thermal,
    out float innerGlow,
    out float outerGlow,
    out float wisps
  ) {
    vec2 primaryAxis = vec2(cos(primaryAngle), sin(primaryAngle));
    vec2 secondaryAxis = vec2(-primaryAxis.y, primaryAxis.x);
    float compactness = clamp(closeupCompactness, 0.0, 1.0);
    float eccentricityStrength = eccentricity * mix(0.45, 1.0, detailBlend);
    vec2 aligned = vec2(
      dot(point, primaryAxis) / (1.0 + eccentricityStrength),
      dot(point, secondaryAxis) / max(0.001, 1.0 - eccentricityStrength)
    );
    float opticalRadius = length(aligned) * carrierScale;
    float angle = atan(aligned.y, aligned.x);
    float tail = 1.0 - smoothstep(
      mix(1.04, 0.68, compactness),
      mix(1.32, 0.92, compactness),
      opticalRadius
    );
    float asymmetry = mix(0.90, 0.70, compactness)
      + cos(angle - secondaryAngle) * mix(0.075, 0.16, compactness)
      + cos(angle * 2.0 + primaryAngle * 0.63) * mix(0.04, 0.08, compactness);
    core = exp(-opticalRadius * opticalRadius * mix(72.0, 128.0, compactness));
    thermal = exp(-opticalRadius * opticalRadius * mix(21.5, 38.0, compactness));
    innerGlow = exp(-opticalRadius * opticalRadius * mix(7.2, 13.5, compactness)) * tail;
    outerGlow = exp(-opticalRadius * opticalRadius * mix(3.45, 9.0, compactness)) * tail * asymmetry;
    wisps = max(
      representativeEnergyWisp(angle, opticalRadius, wispA, step(0.5, wispCount), detailBlend, energyTime, compactness),
      representativeEnergyWisp(angle, opticalRadius, wispB, step(1.5, wispCount), detailBlend, energyTime, compactness)
    );
  }
`;

function getCachedSceneData(payload: App17GalaxyPayload, visualMode: "nebula" | "galaxy") {
  let payloadCache = APP17_SCENE_CACHE.get(payload);
  if (!payloadCache) {
    payloadCache = new Map();
    APP17_SCENE_CACHE.set(payload, payloadCache);
  }
  const cached = payloadCache.get(visualMode);
  if (cached) return cached;
  const sceneData = visualMode === "nebula" ? buildApp14ShowScene(payload) : buildApp15TheoryScene(payload);
  payloadCache.set(visualMode, sceneData);
  return sceneData;
}

function assignHotspotVisualMetrics(hotspots: App17RenderPoint[], kind: App17SceneData["kind"]) {
  const logCounts = hotspots.map((hotspot) => Math.log1p(Math.max(0, hotspot.paperCount)));
  const minLogCount = logCounts.length > 0 ? Math.min(...logCounts) : 0;
  const maxLogCount = logCounts.length > 0 ? Math.max(...logCounts) : 1;
  const hasCountRange = maxLogCount - minLogCount > 0.0001;
  const minSize = kind === "app14" ? 28 : 16;
  const maxSize = kind === "app14" ? 76 : 43;
  hotspots.forEach((hotspot, index) => {
    const importance = hasCountRange
      ? THREE.MathUtils.clamp((logCounts[index] - minLogCount) / (maxLogCount - minLogCount), 0, 1)
      : 0.5;
    hotspot.importance = importance;
    hotspot.displaySize = minSize + Math.pow(importance, 0.72) * (maxSize - minSize);
  });
  return hotspots;
}

export function App17GalaxyCanvas({
  active,
  payload,
  selectedId,
  selectedPaperId = "",
  selectedPaperVisual,
  visualMode,
  command,
  representativePapers = [],
  onSelect,
  onSelectPaper,
  onExplorationStateChange,
  onSystemViewModeChange,
  onPaperFocusStateChange,
  onPaperInspectionModeChange,
  onPaperPanelStateChange,
  onClearSelection,
  paperDetailQueryMs = 0,
  paperDetailCacheState = "idle",
  diagnosticsResetNonce = 0,
  fullscreen = false,
  onBloomAvailabilityChange,
  onPerformanceSnapshot,
}: App17GalaxyCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const labelCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const selectedIdRef = useRef(selectedId);
  const selectedPaperIdRef = useRef(selectedPaperId);
  const selectedPaperVisualRef = useRef(selectedPaperVisual);
  const representativePapersRef = useRef(representativePapers);
  const commandRef = useRef(command);
  const onSelectRef = useRef(onSelect);
  const onSelectPaperRef = useRef(onSelectPaper);
  const onExplorationStateChangeRef = useRef(onExplorationStateChange);
  const onSystemViewModeChangeRef = useRef(onSystemViewModeChange);
  const onPaperFocusStateChangeRef = useRef(onPaperFocusStateChange);
  const onPaperInspectionModeChangeRef = useRef(onPaperInspectionModeChange);
  const onPaperPanelStateChangeRef = useRef(onPaperPanelStateChange);
  const onClearSelectionRef = useRef(onClearSelection);
  const paperDetailQueryMsRef = useRef(paperDetailQueryMs);
  const paperDetailCacheStateRef = useRef(paperDetailCacheState);
  const diagnosticsResetNonceRef = useRef(diagnosticsResetNonce);
  const fullscreenRef = useRef(fullscreen);
  const onBloomAvailabilityChangeRef = useRef(onBloomAvailabilityChange);
  const onPerformanceSnapshotRef = useRef(onPerformanceSnapshot);
  const resetDiagnosticsRef = useRef<(() => void) | null>(null);
  const invalidateRef = useRef<(() => void) | null>(null);
  const refreshSystemRef = useRef<(() => void) | null>(null);
  const prepareSystemRef = useRef<((hotspotId: string) => void) | null>(null);
  const selectionRequestedAtRef = useRef(0);
  const selectionPendingFrameRef = useRef(false);
  const activeControllerRef = useRef<((nextActive: boolean) => void) | null>(null);
  const fullscreenControllerRef = useRef<((nextFullscreen: boolean) => void) | null>(null);
  const inspectionMetadataControllerRef = useRef<(() => void) | null>(null);

  const sceneData = useMemo(
    () => getCachedSceneData(payload, visualMode),
    [payload, visualMode],
  );

  useLayoutEffect(() => {
    activeControllerRef.current?.(active);
  }, [active]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
    selectionRequestedAtRef.current = performance.now();
    selectionPendingFrameRef.current = true;
    prepareSystemRef.current?.(selectedId);
    invalidateRef.current?.();
  }, [selectedId]);

  useEffect(() => {
    selectedPaperIdRef.current = selectedPaperId;
    invalidateRef.current?.();
  }, [selectedPaperId]);

  useEffect(() => {
    selectedPaperVisualRef.current = selectedPaperVisual;
    inspectionMetadataControllerRef.current?.();
    invalidateRef.current?.();
  }, [selectedPaperVisual]);

  useEffect(() => {
    representativePapersRef.current = representativePapers;
    refreshSystemRef.current?.();
  }, [representativePapers]);

  useEffect(() => {
    commandRef.current = command;
    invalidateRef.current?.();
  }, [command]);

  useEffect(() => {
    onSelectRef.current = onSelect;
    onSelectPaperRef.current = onSelectPaper;
    onExplorationStateChangeRef.current = onExplorationStateChange;
    onSystemViewModeChangeRef.current = onSystemViewModeChange;
    onPaperFocusStateChangeRef.current = onPaperFocusStateChange;
    onPaperInspectionModeChangeRef.current = onPaperInspectionModeChange;
    onPaperPanelStateChangeRef.current = onPaperPanelStateChange;
    onClearSelectionRef.current = onClearSelection;
  }, [onClearSelection, onExplorationStateChange, onPaperFocusStateChange, onPaperInspectionModeChange, onPaperPanelStateChange, onSelect, onSelectPaper, onSystemViewModeChange]);

  useEffect(() => {
    paperDetailQueryMsRef.current = paperDetailQueryMs;
    paperDetailCacheStateRef.current = paperDetailCacheState;
  }, [paperDetailCacheState, paperDetailQueryMs]);

  useEffect(() => {
    fullscreenRef.current = fullscreen;
    fullscreenControllerRef.current?.(fullscreen);
  }, [fullscreen]);

  useEffect(() => {
    onBloomAvailabilityChangeRef.current = onBloomAvailabilityChange;
  }, [onBloomAvailabilityChange]);

  useEffect(() => {
    onPerformanceSnapshotRef.current = onPerformanceSnapshot;
  }, [onPerformanceSnapshot]);

  useEffect(() => {
    diagnosticsResetNonceRef.current = diagnosticsResetNonce;
    resetDiagnosticsRef.current?.();
  }, [diagnosticsResetNonce]);

  useEffect(() => {
    const hostElement = containerRef.current;
    const labelCanvas = labelCanvasRef.current;
    if (!hostElement || !labelCanvas) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(APP17_CAMERA_FOV, 1, 0.1, 240);
    camera.up.set(0, 0, 1);

    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, preserveDrawingBuffer: false });
    const idlePixelRatio = Math.min(window.devicePixelRatio || 1, 1.25);
    const currentPixelRatio = idlePixelRatio;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(currentPixelRatio);
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.className = "app17-galaxy-canvas";
    hostElement.appendChild(renderer.domElement);
    renderer.info.autoReset = false;
    const gpuInfo = readWebglRendererInfo(renderer);
    let bloomPipeline: ReturnType<typeof createGalaxyBloomPipeline> | null = null;
    let bloomAvailable = true;
    let bloomUnavailableReason = "";
    let bloomBufferPixelRatio = 0;
    try {
      bloomPipeline = createGalaxyBloomPipeline(renderer, scene, camera);
    } catch (error) {
      bloomAvailable = false;
      bloomUnavailableReason = `局部辉光初始化失败：${String(error)}`;
    }
    onBloomAvailabilityChangeRef.current?.(bloomAvailable, bloomUnavailableReason || undefined);
    const reducedMotionMedia = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduceMotion = reducedMotionMedia.matches;

    const environmentStarLayer = createEnvironmentStarLayer(currentPixelRatio);
    scene.add(environmentStarLayer.object);

    const overviewRoot = new THREE.Group();
    scene.add(overviewRoot);
    const root = new THREE.Group();
    root.rotation.set(0, 0, 0);
    root.scale.set(1, 1, sceneData.camera.zScale);
    overviewRoot.add(root);

    const paperLayer = createPaperLayer(sceneData.papers, currentPixelRatio, sceneData.kind);
    root.add(paperLayer.object);

    const orbitLayer = sceneData.orbitPositions ? createOrbitLayer(sceneData.orbitPositions) : undefined;
    if (orbitLayer) root.add(orbitLayer.object);

    const hotspotLayer = createHotspotLayer(sceneData.hotspots, currentPixelRatio, sceneData.kind);
    root.add(hotspotLayer.object);

    const focusSprite = new THREE.Sprite(createFocusMaterial());
    focusSprite.visible = false;
    focusSprite.scale.setScalar(0.55);
    scene.add(focusSprite);
    const paperInspectionVisual = createPaperInspectionVisual();
    scene.add(paperInspectionVisual.object);
    const focusViewPosition = new THREE.Vector3();
    const systemCenterViewPosition = new THREE.Vector3();
    const systemWorldScale = new THREE.Vector3(1, 1, 1);

    const raycaster = new THREE.Raycaster();
    const overviewPointPickThreshold = sceneData.kind === "app14" ? 0.22 : 0.16;
    raycaster.params.Points = { threshold: overviewPointPickThreshold };
    const pointer = new THREE.Vector2();
    const systemPickWorldPosition = new THREE.Vector3();
    const systemPickViewPosition = new THREE.Vector3();
    const systemPickProjectedPosition = new THREE.Vector3();
    const hotspotByIndex = sceneData.hotspots;
    const hotspotById = new Map(sceneData.hotspots.map((hotspot) => [hotspot.id, hotspot]));
    const environmentHotspotPositions = sceneData.hotspots.map((hotspot) => hotspot.position);
    const rankedHotspots = sceneData.hotspots.slice().sort((a, b) => b.paperCount - a.paperCount || a.id.localeCompare(b.id));
    const labelTextById = new Map(
      sceneData.hotspots.map((hotspot) => [
        hotspot.id,
        ellipsis(hotspot.title, sceneData.kind === "app14" ? 32 : 28),
      ]),
    );
    const hoverIdRef = { current: "" };
    let pressedTargetId = "";
    let pressedTargetKind: "hotspot" | "paper" | "inspection" = "hotspot";
    const commandNonceRef = { current: commandRef.current.nonce };
    const orbit: App17OrbitState = {
      center: sceneData.camera.center.clone(),
      distance: sceneData.camera.distance,
      targetDistance: sceneData.camera.distance,
      azimuth: sceneData.camera.azimuth,
      elevation: sceneData.camera.elevation,
      transition: null,
      pointerPressed: false,
      dragging: false,
      startX: 0,
      startY: 0,
      lastX: 0,
      lastY: 0,
      pauseUntil: 0,
      viewMode: "overview",
    };
    const exploration: GalaxyExplorationRuntime = {
      state: "overview",
      blend: 0,
      fromBlend: 0,
      toBlend: 0,
      savedOverviewPose: null,
      savedOverviewViewMode: "overview",
      savedOverviewPauseUntil: 0,
      focusWorld: new THREE.Vector3(),
      focusLocal: new THREE.Vector3(),
      selectedTopicKey: "",
      systemDistance: APP17_SYSTEM_DISTANCE,
      entryFocusDistance: APP17_SYSTEM_DISTANCE,
    };
    const paperFocus: GalaxyPaperFocusRuntime = {
      state: "idle",
      blend: 0,
      fromBlend: 0,
      toBlend: 0,
      targetId: "",
      startDistance: 0,
      targetDistance: 0,
      targetScreenSize: 0,
      flightStrength: 0,
      canceled: false,
    };
    const paperInspection: GalaxyPaperInspectionRuntime = {
      mode: "none",
      visualType: "none",
      blend: 0,
      dockBlend: 0,
      dockTransition: null,
      panelState: "hidden",
      panelProgress: 0,
      panelTransition: null,
    };
    const paperVisualHandoff: GalaxyPaperVisualHandoffRuntime = {
      state: "none",
      lockedInspectionBlend: 0,
      lockedProjectedDiameter: 0,
      lockedAnchorNdcX: 0,
      returnHoldProgress: APP17_PAPER_RETURN_VISUAL_HOLD_PROGRESS,
      cameraTakeoverPending: false,
    };
    const paperComposition: GalaxyPaperCompositionTimeline = {
      targetAnchorNdcX: 0,
      currentAnchorNdcX: 0,
      anchorErrorPx: 0,
      panelHeaderProgress: 0,
      panelBodyProgress: 0,
      cameraWriter: "orbit",
      returnHorizontalReversals: 0,
      lastReturnScreenX: Number.NaN,
      lastReturnDirection: 0,
    };
    let systemResources: GalaxySystemResources | null = null;
    const systemCache = new Map<string, GalaxySystemResources>();
    const systemVisualMode: GalaxySystemVisualMode = sceneData.kind === "app14" ? "display" : "theory";
    const systemCacheKey = (hotspotId: string) => `${systemVisualMode}:${hotspotId}`;
    let preparationToken = 0;
    let preparationIdleId = 0;
    let preparationTimerId = 0;
    let representativePreparationIdleId = 0;
    let representativePreparationTimerId = 0;
    let representativeCommitFrameId = 0;
    let representativeUpdateToken = 0;
    let preparedRepresentativeUpdate: {
      resources: GalaxySystemResources;
      bundle: GalaxySystemRepresentativeBundle;
    } | null = null;
    let preparingHotspotId = "";
    let pendingEnterHotspotId = "";
    let pendingRepresentativeUpdate = false;
    let hoveredSystemPaperId = "";
    let systemViewMode: GalaxySystemViewMode = "system";
    let savedSystemPose: App17OrbitPose | null = null;
    let lastSystemPaperPickAt = Number.NEGATIVE_INFINITY;
    let lastSystemPaperPickId = "";
    let systemHoverPickTimer = 0;
    let lastSystemPaperPickMs = 0;
    let lastSystemPaperPickCandidateCount = 0;
    let lastPaperFocusTransitionMs = 0;
    let lastPaperFocusCanceled = false;
    let paperFocusTargetDistance = 0;
    let lastPaperAngularSizeRatio = 0;
    let lastPaperAngularGrowthRatio = 0;
    let paperDirectFlight: GalaxyPaperDirectFlight | null = null;
    let lastPaperFlightPathMode: GalaxyPaperFlightPathMode = "none";
    let lastPaperCameraDistance = 0;
    let lastPaperCenterErrorPx = 0;
    let lastPaperStarClearance = 0;
    let lastTransitionTailP95Ms = 0;
    let lastTransitionTailLongFrames50 = 0;
    let transitionCanvasResizeCount = 0;
    let transitionStartCanvasTop = 0;
    let transitionMaxCanvasTopDelta = 0;
    let transitionStartScrollY = 0;
    let transitionMaxScrollDelta = 0;
    let lastRepresentativePrepareMs = 0;
    let lastRepresentativeCommitMs = 0;
    let timelinePausedAt = 0;
    let paperInspectionTimeSeconds = 0;
    let lastInspectionToggleAt = Number.NEGATIVE_INFINITY;
    let lastPointerDragEndedAt = Number.NEGATIVE_INFINITY;
    let fullscreenBlend = fullscreenRef.current ? 1 : 0;
    let fullscreenTransition: App17ScalarTransition | null = null;
    let ambientTimeSeconds = 0;
    let environmentTimeSeconds = 0;
    let farRotationAngle = 0;
    let lastAmbientRenderTime = 0;
    root.updateMatrixWorld(true);
    applyCameraOrbit(camera, orbit);

    let frameId = 0;
    let width = 1;
    let height = 1;
    let disposed = false;
    let runtimeActive = active;
    let renderRequested = true;
    let labelDirty = true;
    let lastRenderTime = 0;
    let lastLabelRenderTime = Number.NEGATIVE_INFINITY;
    let autoResumeTimer = 0;
    let diagnosticsTimer = 0;
    let diagnosticsActive = false;
    let performanceScenario: GalaxyPerformanceScenario = "overview-auto";
    let performanceStartedAt = performance.now();
    let lastMeasuredRenderTime = 0;
    let lastInteractionTime = Number.NEGATIVE_INFINITY;
    let lastSelectionToFirstFrameMs = 0;
    let lastResumeToFirstFrameMs = 0;
    let resumeRequestedAt = 0;
    let resumePendingFrame = false;
    let lastFocusTransitionMs = 0;
    let lastSystemPrepareMs = 0;
    let lastSystemCacheHit = false;
    let lastTransitionP95Ms = 0;
    let lastTransitionLongFrames50 = 0;
    let lastTransitionRenderTime = 0;
    let pendingWheelDelta = 0;
    let lastNormalizedWheelDelta = 0;
    let lastWheelDistanceRatio = 0;
    let overviewSelectedTopicOpacity = 1;
    let systemCloudOpacity = 0;
    const transitionFrameTimes: number[] = [];
    const transitionTailFrameTimes: number[] = [];
    const frameSamples: App17TimedSample[] = [];
    const webglSamples: App17TimedSample[] = [];
    const bloomSamples: App17TimedSample[] = [];
    const labelSamples: App17TimedSample[] = [];
    const paperPickSamples: App17TimedSample[] = [];
    const ambientCadenceSamples: App17TimedSample[] = [];
    const environmentProjection = new THREE.Vector3();
    const environmentOverviewEnvelope = new THREE.Vector4(0, 0, 0.78, 0.55);
    const environmentSystemEnvelope = new THREE.Vector4(0, 0, 0.42, 0.42);
    const environmentProjectedX: number[] = [];
    const environmentProjectedY: number[] = [];
    const environmentProjectedDistanceX: number[] = [];
    const environmentProjectedDistanceY: number[] = [];
    const environmentSystemSamples = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(APP17_SYSTEM_RADIUS, 0, 0),
      new THREE.Vector3(-APP17_SYSTEM_RADIUS, 0, 0),
      new THREE.Vector3(0, APP17_SYSTEM_RADIUS, 0),
      new THREE.Vector3(0, -APP17_SYSTEM_RADIUS, 0),
      new THREE.Vector3(0, 0, APP17_SYSTEM_RADIUS * 0.72),
      new THREE.Vector3(0, 0, -APP17_SYSTEM_RADIUS * 0.72),
    ];

    const setSystemViewMode = (mode: GalaxySystemViewMode) => {
      if (systemViewMode === mode) return;
      systemViewMode = mode;
      onSystemViewModeChangeRef.current?.(mode);
    };

    function getAmbientMotion(): GalaxyAmbientMotion {
      if (reduceMotion || exploration.state === "overview" || exploration.state === "preparing") return "none";
      return sceneData.kind === "app14" ? "rotation-breath" : "breath";
    }

    function getLocalBloomBlend() {
      if (exploration.state === "preparing") return 0;
      return smoothStepRange(
        APP17_LOCAL_BLOOM_START_BLEND,
        APP17_LOCAL_BLOOM_END_BLEND,
        exploration.blend,
      );
    }

    function getRequestedBloomMode(): GalaxyBloomRenderMode {
      return getLocalBloomBlend() > 0.001 ? "local" : "none";
    }

    function getEffectiveBloomMode(): GalaxyBloomRenderMode {
      const requested = getRequestedBloomMode();
      return bloomAvailable && bloomPipeline ? requested : "none";
    }

    function getBloomParameters(mode = getEffectiveBloomMode()) {
      if (mode === "local") return {
        threshold: APP17_LOCAL_BLOOM_THRESHOLD,
        strength: APP17_LOCAL_BLOOM_STRENGTH * getLocalBloomBlend(),
        radius: APP17_LOCAL_BLOOM_RADIUS,
      };
      return { threshold: 1, strength: 0, radius: 0 };
    }

    function getAmbientTargetFps() {
      if (reduceMotion || exploration.state !== "system") return 0;
      return sceneData.kind === "app14" ? 20 : 12;
    }

    function getEnvironmentMotion(): GalaxyEnvironmentMotion {
      return !reduceMotion && fullscreenBlend > 0.001 ? "twinkle" : "none";
    }

    function getEnvironmentTargetFps() {
      if (getEnvironmentMotion() === "none") return 0;
      if (
        sceneData.kind === "app14"
        && exploration.state === "overview"
        && orbit.viewMode === "overview"
        && sceneData.camera.autoRotate
      ) return 30;
      return sceneData.kind === "app14" ? 20 : 12;
    }

    function getEnvironmentStarCount() {
      if (fullscreenBlend <= 0.001) return 0;
      const systemBlend = smoothStepRange(0.55, 1, exploration.blend);
      return Math.round(APP17_ENVIRONMENT_STAR_COUNT * THREE.MathUtils.lerp(1, APP17_ENVIRONMENT_SYSTEM_RATIO, systemBlend));
    }

    function getEnvironmentVisibleStarEstimate() {
      const activeStarCount = getEnvironmentStarCount();
      if (activeStarCount === 0 || width <= 0 || height <= 0) return 0;
      const verticalFov = THREE.MathUtils.degToRad(camera.getEffectiveFOV());
      const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
      const solidAngle = 4 * Math.asin(THREE.MathUtils.clamp(
        Math.sin(horizontalFov / 2) * Math.sin(verticalFov / 2),
        -1,
        1,
      ));
      return Math.round(activeStarCount * solidAngle / (Math.PI * 4));
    }

    function getEnvironmentSourceCounts() {
      const activeRatio = getEnvironmentStarCount() / APP17_ENVIRONMENT_STAR_COUNT;
      return {
        micro: Math.round(APP17_ENVIRONMENT_MICRO_COUNT * activeRatio),
        compact: Math.round(APP17_ENVIRONMENT_COMPACT_COUNT * activeRatio),
        anchor: Math.round(APP17_ENVIRONMENT_ANCHOR_COUNT * activeRatio),
      };
    }

    function setEnvelopeFromProjectedPoints(
      points: THREE.Vector3[],
      matrix: THREE.Matrix4,
      target: THREE.Vector4,
      minimumRadiusX: number,
      minimumRadiusY: number,
    ) {
      environmentProjectedX.length = 0;
      environmentProjectedY.length = 0;
      points.forEach((point) => {
        environmentProjection.copy(point).applyMatrix4(matrix).project(camera);
        if (
          Number.isFinite(environmentProjection.x)
          && Number.isFinite(environmentProjection.y)
          && environmentProjection.z >= -1.4
          && environmentProjection.z <= 1.4
        ) {
          environmentProjectedX.push(environmentProjection.x);
          environmentProjectedY.push(environmentProjection.y);
        }
      });
      if (environmentProjectedX.length === 0) return;
      const centerX = percentileNumber(environmentProjectedX, 0.5);
      const centerY = percentileNumber(environmentProjectedY, 0.5);
      environmentProjectedDistanceX.length = environmentProjectedX.length;
      environmentProjectedDistanceY.length = environmentProjectedY.length;
      for (let index = 0; index < environmentProjectedX.length; index += 1) {
        environmentProjectedDistanceX[index] = Math.abs(environmentProjectedX[index] - centerX);
        environmentProjectedDistanceY[index] = Math.abs(environmentProjectedY[index] - centerY);
      }
      const radiusX = percentileNumber(environmentProjectedDistanceX, 0.95);
      const radiusY = percentileNumber(environmentProjectedDistanceY, 0.95);
      target.set(
        THREE.MathUtils.clamp(centerX, -0.35, 0.35),
        THREE.MathUtils.clamp(centerY, -0.35, 0.35),
        THREE.MathUtils.clamp(radiusX * 1.12, minimumRadiusX, 0.96),
        THREE.MathUtils.clamp(radiusY * 1.14, minimumRadiusY, 0.9),
      );
    }

    function updateEnvironmentEnvelope() {
      setEnvelopeFromProjectedPoints(
        environmentHotspotPositions,
        root.matrixWorld,
        environmentOverviewEnvelope,
        sceneData.kind === "app14" ? 0.42 : 0.34,
        sceneData.kind === "app14" ? 0.24 : 0.28,
      );
      const systemEnvelopeBlend = smoothStepRange(0.45, 0.85, exploration.blend);
      if (systemEnvelopeBlend > 0 && systemResources) {
        setEnvelopeFromProjectedPoints(
          environmentSystemSamples,
          systemResources.root.matrixWorld,
          environmentSystemEnvelope,
          0.28,
          0.28,
        );
        environmentStarLayer.setEnvelope(
          THREE.MathUtils.lerp(environmentOverviewEnvelope.x, environmentSystemEnvelope.x, systemEnvelopeBlend),
          THREE.MathUtils.lerp(environmentOverviewEnvelope.y, environmentSystemEnvelope.y, systemEnvelopeBlend),
          THREE.MathUtils.lerp(environmentOverviewEnvelope.z, environmentSystemEnvelope.z, systemEnvelopeBlend),
          THREE.MathUtils.lerp(environmentOverviewEnvelope.w, environmentSystemEnvelope.w, systemEnvelopeBlend),
        );
        return;
      }
      environmentStarLayer.setEnvelope(
        environmentOverviewEnvelope.x,
        environmentOverviewEnvelope.y,
        environmentOverviewEnvelope.z,
        environmentOverviewEnvelope.w,
      );
    }

    function getPerformanceScenario(now: number): GalaxyPerformanceScenario {
      if (orbit.dragging || now - lastInteractionTime <= APP17_INTERACTION_SCENARIO_HOLD_MS) return "interacting";
      if (exploration.state !== "overview") return "system-exploration";
      if (sceneData.kind === "app15") return "theory-static";
      if (orbit.viewMode === "top") return "top-static";
      return "overview-auto";
    }

    function resetPerformanceSamples(now = performance.now()) {
      frameSamples.length = 0;
      webglSamples.length = 0;
      bloomSamples.length = 0;
      labelSamples.length = 0;
      paperPickSamples.length = 0;
      ambientCadenceSamples.length = 0;
      performanceStartedAt = now;
      performanceScenario = getPerformanceScenario(now);
      lastMeasuredRenderTime = 0;
      lastAmbientRenderTime = 0;
    }

    function ensureDiagnosticsActive(now: number) {
      const enabled = Boolean(onPerformanceSnapshotRef.current);
      if (!enabled) {
        diagnosticsActive = false;
        return false;
      }
      const nextScenario = getPerformanceScenario(now);
      if (!diagnosticsActive || nextScenario !== performanceScenario) {
        diagnosticsActive = true;
        resetPerformanceSamples(now);
      }
      return true;
    }

    function pruneSamples(samples: App17TimedSample[], now: number) {
      const cutoff = now - APP17_PERFORMANCE_WINDOW_MS;
      let removeCount = 0;
      while (removeCount < samples.length && samples[removeCount].timestamp < cutoff) removeCount += 1;
      if (removeCount > 0) samples.splice(0, removeCount);
    }

    function averageValue(samples: App17TimedSample[]) {
      if (samples.length === 0) return 0;
      return samples.reduce((total, sample) => total + sample.value, 0) / samples.length;
    }

    function percentileValue(samples: App17TimedSample[], percentile: number) {
      if (samples.length === 0) return 0;
      const values = samples.map((sample) => sample.value).sort((a, b) => a - b);
      const index = Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * percentile) - 1));
      return values[index];
    }

    function reportPerformance(now = performance.now()) {
      if (!runtimeActive || document.visibilityState === "hidden") return;
      const callback = onPerformanceSnapshotRef.current;
      if (!callback || !ensureDiagnosticsActive(now)) return;
      pruneSamples(frameSamples, now);
      pruneSamples(webglSamples, now);
      pruneSamples(bloomSamples, now);
      pruneSamples(labelSamples, now);
      pruneSamples(paperPickSamples, now);
      pruneSamples(ambientCadenceSamples, now);
      const recentFrameSamples = frameSamples.filter((sample) => sample.timestamp >= now - 1_000);
      const averageFrameMs = averageValue(frameSamples);
      const currentFrameMs = averageValue(recentFrameSamples);
      const environmentSourceCounts = getEnvironmentSourceCounts();
      const starVisualState = systemResources?.star.getVisualState();
      const paperVisualState = systemResources?.cloudLayer.getVisualState();
      const representativeVisualState = systemResources?.representativeLayer?.getVisualState();
      const orbitVisualState = systemResources?.orbitLayer?.getVisualState();
      const inspectionVisualState = paperInspectionVisual.getVisualState();
      const representativeEnergyVisualState = inspectionVisualState.visualType === "energy-core"
        ? inspectionVisualState
        : representativeVisualState;
      const bloomRequestedMode = getRequestedBloomMode();
      const bloomEffectiveMode = getEffectiveBloomMode();
      const bloomParameters = getBloomParameters(bloomEffectiveMode);
      callback({
        scenario: performanceScenario,
        fullscreen: fullscreenRef.current,
        sampleDurationMs: Math.min(APP17_PERFORMANCE_WINDOW_MS, Math.max(0, now - performanceStartedAt)),
        currentFps: currentFrameMs > 0 ? 1_000 / currentFrameMs : 0,
        averageFps: averageFrameMs > 0 ? 1_000 / averageFrameMs : 0,
        averageFrameMs,
        p95FrameMs: percentileValue(frameSamples, 0.95),
        maxFrameMs: frameSamples.length > 0 ? Math.max(...frameSamples.map((sample) => sample.value)) : 0,
        averageWebglMs: averageValue(webglSamples),
        averageLabelMs: averageValue(labelSamples),
        longFrames50: frameSamples.filter((sample) => sample.value > 50).length,
        longFrames100: frameSamples.filter((sample) => sample.value > 100).length,
        drawCalls: renderer.info.render.calls,
        renderedPoints: Math.max(
          0,
          renderer.info.render.points - (environmentStarLayer.object.visible ? APP17_ENVIRONMENT_STAR_COUNT : 0),
        ),
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        paperCount: sceneData.papers.length,
        hotspotCount: sceneData.hotspots.length,
        width,
        height,
        pixelRatio: currentPixelRatio,
        projectionZoom: camera.zoom,
        environmentStarCount: getEnvironmentStarCount(),
        environmentVisibleStarEstimate: getEnvironmentVisibleStarEstimate(),
        environmentMicroCount: environmentSourceCounts.micro,
        environmentCompactCount: environmentSourceCounts.compact,
        environmentAnchorCount: environmentSourceCounts.anchor,
        environmentMotion: getEnvironmentMotion(),
        environmentTargetFps: getEnvironmentTargetFps(),
        ambientMotion: getAmbientMotion(),
        ambientTargetFps: getAmbientTargetFps(),
        ambientCadenceMisses: ambientCadenceSamples.reduce((total, sample) => total + sample.value, 0),
        selectionToFirstFrameMs: lastSelectionToFirstFrameMs,
        resumeToFirstFrameMs: lastResumeToFirstFrameMs,
        focusTransitionMs: lastFocusTransitionMs,
        focusTransitionActive: orbit.transition?.kind === "enter-system" || paperDirectFlight?.kind === "focus",
        systemPrepareMs: lastSystemPrepareMs,
        systemCacheHit: lastSystemCacheHit,
        systemVisualMode: systemResources?.visualMode ?? "none",
        systemStarDrawCalls: starVisualState?.drawCalls ?? 0,
        systemStarBloomDrawCalls: starVisualState?.bloomDrawCalls ?? 0,
        systemMovingPaperCount: systemResources?.representativePapers.length ?? 0,
        systemTargetFps: exploration.state === "system" ? getAmbientTargetFps() : 0,
        systemStarProjectedDiameter: starVisualState?.projectedDiameter ?? 0,
        systemStarViewportRatio: starVisualState?.viewportRatio ?? 0,
        systemStarLod: starVisualState?.lod ?? "none",
        systemStarLodBlend: starVisualState?.bodyBlend ?? 0,
        systemStarFarCoreBlend: starVisualState?.farCoreBlend ?? 0,
        systemStarCoronaBlend: starVisualState?.coronaBlend ?? 0,
        systemStarSurfaceDetailBlend: starVisualState?.surfaceDetailBlend ?? 0,
        systemStarDepthOcclusionActive: Boolean(starVisualState?.depthOcclusionActive),
        systemStarSurfaceBloomBlend: starVisualState?.surfaceBloomBlend ?? 0,
        systemStarCoronaCloseupBlend: starVisualState?.coronaCloseupBlend ?? 0,
        systemStarRotationDegrees: starVisualState?.rotationDegrees ?? 0,
        systemStarMotionActive: Boolean(starVisualState?.motionActive),
        overviewSelectedTopicOpacity,
        systemCloudOpacity,
        systemUniquePaperCount: systemResources?.uniquePaperCount ?? 0,
        systemDuplicatePaperCount: systemResources?.duplicatePaperCount ?? 0,
        systemHiddenRepresentativeCount: systemResources?.hiddenRepresentativeCount ?? 0,
        systemUnresolvedRepresentativeCount: systemResources?.unresolvedRepresentativeCount ?? 0,
        systemPaperLod: paperVisualState?.lod ?? "none",
        systemPaperLodBlend: paperVisualState?.lodBlend ?? 0,
        systemPaperMinPointSize: paperVisualState?.minimumPointSize ?? 0,
        systemPaperMaxPointSize: paperVisualState?.maximumPointSize ?? 0,
        systemPaperRevealProgress: paperVisualState?.revealProgress ?? 0,
        systemPaperExposure: paperVisualState?.effectiveExposure ?? 1,
        systemPaperTargetExposure: paperVisualState?.targetExposure ?? 1,
        systemPaperDepthBrightnessFloor: paperVisualState?.depthBrightnessFloor ?? APP17_SYSTEM_PAPER_DEPTH_BRIGHTNESS_FLOOR,
        systemPaperDepthSizeFloor: paperVisualState?.depthSizeFloor ?? APP17_SYSTEM_PAPER_DEPTH_SIZE_FLOOR,
        systemRepresentativeFocusMode: representativeVisualState?.focusMode ?? "none",
        systemRepresentativeFocusRank: representativeVisualState?.focusRank ?? -1,
        systemRepresentativeDimFactor: representativeVisualState?.representativeDimFactor ?? 1,
        systemRepresentativeBloomActive: Boolean(
          bloomAvailable
          && systemResources?.representativeBloomLayer
          && getLocalBloomBlend() > 0.001
        ),
        systemPaperPickMs: lastSystemPaperPickMs,
        systemPaperPickP95Ms: percentileValue(paperPickSamples, 0.95),
        systemPaperPickCandidateCount: lastSystemPaperPickCandidateCount,
        systemSelectedPaperType: selectedPaperIdRef.current
          ? systemResources?.representativePapers.some((paper) => paper.id === selectedPaperIdRef.current)
            ? "representative"
            : "ordinary"
          : "none",
        systemPaperDetailQueryMs: paperDetailQueryMsRef.current,
        systemPaperDetailCacheState: paperDetailCacheStateRef.current,
        systemViewMode,
        systemPaperFocusState: paperFocus.state,
        systemPaperFocusProgress: paperFocus.blend,
        systemPaperFocusStartDistance: paperFocus.startDistance,
        systemPaperFocusTransitionMs: lastPaperFocusTransitionMs,
        systemPaperFocusTargetDistance: paperFocusTargetDistance,
        systemPaperFocusTargetScreenSize: paperFocus.targetScreenSize,
        systemPaperFocusNeighborBrightness: THREE.MathUtils.lerp(1, APP17_SYSTEM_PAPER_FOCUS_NEIGHBOR_BRIGHTNESS, paperFocus.blend),
        systemPaperFocusContextBrightness: THREE.MathUtils.lerp(1, APP17_SYSTEM_PAPER_FOCUS_CONTEXT_BRIGHTNESS, paperFocus.blend),
        systemPaperFocusCanceled: lastPaperFocusCanceled,
        systemPaperInspectionMode: paperInspection.mode,
        systemPaperInspectionVisualType: inspectionVisualState.visualType,
        systemPaperInspectionBlend: paperInspection.blend,
        systemPaperInspectionDockBlend: paperInspection.dockBlend,
        systemPaperInspectionDiameter: inspectionVisualState.projectedDiameter,
        systemPaperInspectionDrawCalls: inspectionVisualState.drawCalls,
        systemPaperPanelState: paperInspection.panelState,
        systemPaperPanelProgress: paperInspection.panelProgress,
        systemPaperPanelHeaderProgress: paperComposition.panelHeaderProgress,
        systemPaperPanelBodyProgress: paperComposition.panelBodyProgress,
        systemPaperTargetAnchorX: paperComposition.targetAnchorNdcX,
        systemPaperAnchorErrorPx: paperComposition.anchorErrorPx,
        systemPaperCameraWriter: paperComposition.cameraWriter,
        systemPaperReturnHorizontalReversals: paperComposition.returnHorizontalReversals,
        systemRepresentativeEnergyCoreDrawCalls: systemResources?.representativeLayer ? 1 : 0,
        systemRepresentativeEnergyDetailBlend: representativeEnergyVisualState?.energyDetailBlend ?? 0,
        systemRepresentativeEnergyBloomOpacity: representativeEnergyVisualState?.energyBloomOpacity ?? 0,
        systemRepresentativeEnergyWispCount: representativeEnergyVisualState?.energyWispCount ?? 0,
        systemRepresentativeEnergyCarrierScale: representativeEnergyVisualState?.energyCarrierScale ?? 1,
        systemRepresentativeEnergyCloseupCompactness: representativeEnergyVisualState?.energyCloseupCompactness ?? 0,
        systemRepresentativeEnergyVisibleRadius: representativeEnergyVisualState?.energyVisibleRadius ?? 0,
        systemRepresentativeEnergyOrbitAttenuation: orbitVisualState?.paperInspectionAttenuation ?? 1,
        systemRepresentativeEnergyBodyCoreDiameter: representativeEnergyVisualState?.energyBodyCoreDiameter ?? 0,
        systemRepresentativeEnergyBodyCoreBlend: representativeEnergyVisualState?.energyBodyCoreBlend ?? 0,
        systemRepresentativeEnergyFresnelWidth: representativeEnergyVisualState?.energyFresnelWidth ?? 0,
        systemRepresentativeEnergyOuterGlowDiameter: representativeEnergyVisualState?.energyOuterGlowDiameter ?? 0,
        systemRepresentativeEnergyOuterGlowMonotonic: representativeEnergyVisualState?.energyOuterGlowMonotonic ?? true,
        systemRepresentativeEnergyMicroCoreDiameter: representativeEnergyVisualState?.energyMicroCoreDiameter ?? 0,
        systemRepresentativeEnergyMicroCoreBlend: representativeEnergyVisualState?.energyMicroCoreBlend ?? 0,
        systemRepresentativeEnergySoftCoreAttenuation: representativeEnergyVisualState?.energySoftCoreAttenuation ?? 1,
        systemRepresentativeEnergyMicroCoreBrightness: representativeEnergyVisualState?.energyMicroCoreBrightness ?? 0,
        systemPaperInspectionBloomDrawCalls: inspectionVisualState.bloomDrawCalls,
        systemPaperAngularSizeRatio: inspectionVisualState.viewportRatio,
        systemPaperAngularGrowthRatio: lastPaperAngularGrowthRatio,
        systemPaperFlightPathMode: lastPaperFlightPathMode,
        systemPaperCameraDistance: lastPaperCameraDistance,
        systemPaperCenterErrorPx: lastPaperCenterErrorPx,
        systemPaperStarClearance: lastPaperStarClearance,
        transitionTailP95Ms: lastTransitionTailP95Ms,
        transitionTailLongFrames50: lastTransitionTailLongFrames50,
        transitionCanvasResizeCount,
        transitionCanvasTopDelta: transitionMaxCanvasTopDelta,
        transitionScrollDelta: transitionMaxScrollDelta,
        representativePrepareMs: lastRepresentativePrepareMs,
        representativeCommitMs: lastRepresentativeCommitMs,
        lastNormalizedWheelDelta,
        lastWheelDistanceRatio,
        transitionP95Ms: lastTransitionP95Ms,
        transitionLongFrames50: lastTransitionLongFrames50,
        evidenceUpdateDeferred: pendingRepresentativeUpdate,
        bloomRequestedMode,
        bloomEffectiveMode,
        bloomAvailable,
        bloomThreshold: bloomParameters.threshold,
        bloomStrength: bloomParameters.strength,
        bloomRadius: bloomParameters.radius,
        bloomBlend: getLocalBloomBlend(),
        bloomResolutionScale: APP17_BLOOM_RESOLUTION_SCALE,
        bloomBufferPixelRatio,
        averageBloomMs: averageValue(bloomSamples),
        p95BloomMs: percentileValue(bloomSamples, 0.95),
        gpuVendor: gpuInfo.vendor,
        gpuRenderer: gpuInfo.renderer,
      });
    }

    resetDiagnosticsRef.current = () => {
      resetPerformanceSamples();
      reportPerformance();
    };
    diagnosticsTimer = window.setInterval(() => reportPerformance(), APP17_PERFORMANCE_REPORT_INTERVAL_MS);

    function scheduleFrame() {
      if (disposed || !runtimeActive || frameId !== 0 || document.visibilityState === "hidden") return;
      frameId = requestAnimationFrame(render);
    }

    function invalidate(includeLabels = true) {
      renderRequested = true;
      if (includeLabels) labelDirty = true;
      scheduleFrame();
    }

    function advanceFullscreenTransition(now: number) {
      if (!fullscreenTransition) return false;
      const progress = fullscreenTransition.durationMs <= 0
        ? 1
        : THREE.MathUtils.clamp((now - fullscreenTransition.startedAt) / fullscreenTransition.durationMs, 0, 1);
      fullscreenBlend = THREE.MathUtils.lerp(fullscreenTransition.from, fullscreenTransition.to, smootherStep(progress));
      if (progress >= 1) {
        fullscreenBlend = fullscreenTransition.to;
        fullscreenTransition = null;
      }
      return true;
    }

    function applyFullscreenVisuals(now: number) {
      const transitionChanged = advanceFullscreenTransition(now);
      const systemProjectionBlend = smoothStepRange(0.2, 0.82, exploration.blend);
      const overviewZoom = sceneData.kind === "app14" ? APP17_FULLSCREEN_APP14_ZOOM : APP17_FULLSCREEN_APP15_ZOOM;
      const fullscreenZoom = THREE.MathUtils.lerp(overviewZoom, APP17_FULLSCREEN_SYSTEM_ZOOM, systemProjectionBlend);
      const nextZoom = THREE.MathUtils.lerp(1, fullscreenZoom, fullscreenBlend);
      const zoomChanged = Math.abs(camera.zoom - nextZoom) > 0.0001;
      if (zoomChanged) {
        camera.zoom = nextZoom;
        camera.updateProjectionMatrix();
      }
      environmentStarLayer.setState(fullscreenBlend, smoothStepRange(0.55, 1, exploration.blend));
      environmentStarLayer.setAnimation(environmentTimeSeconds, reduceMotion ? 0 : fullscreenBlend);
      return transitionChanged || zoomChanged;
    }

    fullscreenControllerRef.current = (nextFullscreen) => {
      const now = performance.now();
      advanceFullscreenTransition(now);
      const target = nextFullscreen ? 1 : 0;
      if (Math.abs(fullscreenBlend - target) < 0.0001 && fullscreenTransition === null) return;
      if (reduceMotion) {
        fullscreenBlend = target;
        fullscreenTransition = null;
      } else {
        fullscreenTransition = {
          startedAt: now,
          durationMs: APP17_FULLSCREEN_TRANSITION_MS,
          from: fullscreenBlend,
          to: target,
        };
      }
      environmentStarLayer.object.visible = true;
      invalidate(true);
    };

    const handleReducedMotionChange = (event: MediaQueryListEvent) => {
      reduceMotion = event.matches;
      if (reduceMotion && fullscreenTransition) {
        fullscreenBlend = fullscreenTransition.to;
        fullscreenTransition = null;
      }
      invalidate(true);
    };
    reducedMotionMedia.addEventListener("change", handleReducedMotionChange);

    function clearAutoResumeTimer() {
      if (autoResumeTimer) window.clearTimeout(autoResumeTimer);
      autoResumeTimer = 0;
    }

    invalidateRef.current = () => invalidate(true);

    const resize = () => {
      if (!runtimeActive) return;
      const rect = hostElement.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return;
      if (orbit.transition?.kind === "enter-system" || orbit.transition?.kind === "exit-system" || paperDirectFlight) {
        transitionCanvasResizeCount += 1;
      }
      width = Math.max(1, Math.floor(rect.width));
      height = Math.max(1, Math.floor(rect.height));
      renderer.setPixelRatio(currentPixelRatio);
      renderer.setSize(width, height, false);
      bloomBufferPixelRatio = bloomPipeline?.setSize(width, height, currentPixelRatio) ?? 0;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      labelCanvas.width = Math.max(1, Math.floor(width * idlePixelRatio));
      labelCanvas.height = Math.max(1, Math.floor(height * idlePixelRatio));
      labelCanvas.style.width = `${width}px`;
      labelCanvas.style.height = `${height}px`;
      invalidate(true);
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(hostElement);
    resize();

    const pauseTimeline = () => {
      if (timelinePausedAt <= 0) timelinePausedAt = performance.now();
    };

    const resumeTimeline = () => {
      if (timelinePausedAt <= 0) return;
      const pausedDuration = Math.max(0, performance.now() - timelinePausedAt);
      if (orbit.transition) orbit.transition.startedAt += pausedDuration;
      if (paperDirectFlight) paperDirectFlight.startedAt += pausedDuration;
      if (fullscreenTransition) fullscreenTransition.startedAt += pausedDuration;
      if (paperInspection.dockTransition) paperInspection.dockTransition.startedAt += pausedDuration;
      if (paperInspection.panelTransition) paperInspection.panelTransition.startedAt += pausedDuration;
      timelinePausedAt = 0;
    };

    activeControllerRef.current = (nextActive) => {
      if (runtimeActive === nextActive) return;
      runtimeActive = nextActive;
      if (!runtimeActive) {
        if (frameId) cancelAnimationFrame(frameId);
        frameId = 0;
        orbit.pointerPressed = false;
        orbit.dragging = false;
        pressedTargetId = "";
        clearAutoResumeTimer();
        diagnosticsActive = false;
        lastAmbientRenderTime = 0;
        pauseTimeline();
        return;
      }

      if (document.visibilityState !== "hidden") resumeTimeline();
      resumeRequestedAt = performance.now();
      resumePendingFrame = true;
      lastRenderTime = 0;
      lastMeasuredRenderTime = 0;
      lastAmbientRenderTime = 0;
      resize();
      if (orbit.viewMode === "overview" && sceneData.camera.autoRotate && orbit.pauseUntil > resumeRequestedAt) {
        autoResumeTimer = window.setTimeout(() => {
          autoResumeTimer = 0;
          invalidate(true);
        }, orbit.pauseUntil - resumeRequestedAt);
      }
      invalidate(true);
    };

    const setExplorationState = (state: GalaxyExplorationState, deferCallback = false) => {
      if (exploration.state === state) return;
      exploration.state = state;
      if (deferCallback) {
        requestAnimationFrame(() => {
          if (!disposed && exploration.state === state) onExplorationStateChangeRef.current?.(state);
        });
      } else {
        onExplorationStateChangeRef.current?.(state);
      }
    };

    const setPaperFocusState = (state: GalaxyPaperFocusState, paperId = paperFocus.targetId) => {
      paperFocus.state = state;
      onPaperFocusStateChangeRef.current?.(state, paperId);
    };

    const setPaperInspectionMode = (mode: GalaxyPaperInspectionMode, paperId = paperFocus.targetId) => {
      if (paperInspection.mode === mode) return;
      paperInspection.mode = mode;
      onPaperInspectionModeChangeRef.current?.(mode, paperId);
      labelDirty = true;
    };
    const setPaperPanelState = (state: GalaxyPaperPanelState, paperId = paperFocus.targetId) => {
      if (paperInspection.panelState === state) return;
      paperInspection.panelState = state;
      onPaperPanelStateChangeRef.current?.(state, paperId);
    };
    const paperReadingAnchorNdcX = () => {
      if (fullscreenRef.current) return -0.48;
      return window.innerWidth >= 1280 ? -0.2 : 0;
    };
    const applyRuntimeCamera = () => {
      if (paperDirectFlight) return;
      if (
        paperFocus.state === "focused"
        && paperInspection.blend > 0.001
        && width > 0
        && height > 0
      ) {
        const cameraPosition = orbitPoseCameraPosition(captureOrbitPose(orbit));
        const anchorTarget = paperInspection.mode === "centered"
          ? 0
          : paperReadingAnchorNdcX() * paperInspection.dockBlend;
        camera.position.copy(cameraPosition);
        camera.quaternion.copy(cameraQuaternionForAnchoredTarget(
          cameraPosition,
          orbit.center,
          camera,
          anchorTarget,
          0,
        ));
        camera.updateMatrixWorld(true);
        paperComposition.targetAnchorNdcX = anchorTarget;
        paperComposition.currentAnchorNdcX = anchorTarget;
        paperComposition.cameraWriter = "paper-composition";
        return;
      }
      applyCameraOrbit(camera, orbit);
      paperComposition.targetAnchorNdcX = 0;
      paperComposition.currentAnchorNdcX = 0;
      paperComposition.cameraWriter = "orbit";
    };

    const calculateSystemEntryScale = (renderHotspot: App17RenderPoint, topicKey: string) => {
      const radii = sceneData.papers
        .filter((paper) => paper.topicKey === topicKey)
        .map((paper) => Math.hypot(
          paper.x - renderHotspot.position.x,
          paper.y - renderHotspot.position.y,
          (paper.z - renderHotspot.position.z) * sceneData.camera.zScale,
        ))
        .sort((a, b) => a - b);
      const radiusIndex = Math.min(radii.length - 1, Math.max(0, Math.floor(radii.length * 0.95)));
      const overviewRadius = radii[radiusIndex] || APP17_SYSTEM_RADIUS * 0.12;
      return THREE.MathUtils.clamp(overviewRadius / APP17_SYSTEM_RADIUS, 0.045, 0.42);
    };

    const configureSystemEntry = (resources: GalaxySystemResources, renderHotspot: App17RenderPoint) => {
      const focusDistance = Math.max(0.1, camera.position.distanceTo(exploration.focusWorld));
      exploration.entryFocusDistance = focusDistance;
      const visibleWorldHeight = 2 * focusDistance * Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5) / Math.max(0.001, camera.zoom);
      const worldPerCssPixel = visibleWorldHeight / Math.max(1, height);
      const hotspotRadius = renderHotspot.displaySize * worldPerCssPixel * 0.5;
      resources.starEntryScale = THREE.MathUtils.clamp(hotspotRadius / APP17_SYSTEM_STAR_RADIUS, 0.08, 1.2);

      const initialVisualScale = Math.max(resources.entryScale, resources.starEntryScale);
      const growthLimitedDistance = (focusDistance / Math.max(initialVisualScale, 0.001)) * 0.96;
      exploration.systemDistance = THREE.MathUtils.clamp(
        Math.min(APP17_SYSTEM_DISTANCE, growthLimitedDistance),
        APP17_SYSTEM_MIN_DISTANCE * 1.4,
        APP17_SYSTEM_DISTANCE,
      );
    };

    const cancelScheduledPreparation = (resetPreparingState = false) => {
      preparationToken += 1;
      const idleWindow = window as IdleCapableWindow;
      if (preparationIdleId && idleWindow.cancelIdleCallback) idleWindow.cancelIdleCallback(preparationIdleId);
      if (preparationTimerId) window.clearTimeout(preparationTimerId);
      preparationIdleId = 0;
      preparationTimerId = 0;
      preparingHotspotId = "";
      pendingEnterHotspotId = "";
      if (resetPreparingState && exploration.state === "preparing") setExplorationState("overview");
    };

    const touchSystemCache = (hotspotId: string) => {
      const key = systemCacheKey(hotspotId);
      const cached = systemCache.get(key);
      if (!cached) return;
      systemCache.delete(key);
      systemCache.set(key, cached);
    };

    const storeSystemCache = (resources: GalaxySystemResources) => {
      const key = systemCacheKey(resources.hotspotId);
      const previous = systemCache.get(key);
      if (previous && previous !== resources) {
        scene.remove(previous.root);
        previous.dispose();
      }
      systemCache.delete(key);
      systemCache.set(key, resources);
      while (systemCache.size > APP17_SYSTEM_CACHE_LIMIT) {
        const oldestId = systemCache.keys().next().value as string | undefined;
        if (!oldestId) break;
        const oldest = systemCache.get(oldestId);
        systemCache.delete(oldestId);
        if (oldest) {
          if (systemResources === oldest) systemResources = null;
          scene.remove(oldest.root);
          oldest.dispose();
        }
      }
    };

    const activateSystemResources = (resources: GalaxySystemResources) => {
      const selectedHotspotId = selectedIdRef.current;
      if (resources.hotspotId !== selectedHotspotId) return false;
      const payloadHotspot = payload.hotspots.find((hotspot) => hotspot.id === selectedHotspotId);
      const renderHotspot = hotspotById.get(selectedHotspotId);
      if (!payloadHotspot || !renderHotspot) return false;
      root.updateMatrixWorld(true);
      const focusLocal = renderHotspot.position;
      const focusWorld = focusLocal.clone().applyMatrix4(root.matrixWorld);
      exploration.focusWorld.copy(focusWorld);
      exploration.focusLocal.copy(focusLocal);
      exploration.selectedTopicKey = topicKeyFromHotspot(payloadHotspot);
      paperLayer.setExplorationSelection(exploration.selectedTopicKey, exploration.focusLocal);
      hotspotLayer.setExplorationSelection(exploration.selectedTopicKey, exploration.focusLocal);
      if (systemResources && systemResources !== resources) setGalaxySystemOpacity(systemResources, 0);
      systemResources = resources;
      systemResources.root.position.copy(focusWorld);
      configureSystemEntry(systemResources, renderHotspot);
      touchSystemCache(resources.hotspotId);
      applyExplorationBlend(exploration.blend);
      return true;
    };

    const beginTransitionLayoutDiagnostics = () => {
      transitionTailFrameTimes.length = 0;
      transitionCanvasResizeCount = 0;
      transitionStartCanvasTop = renderer.domElement.getBoundingClientRect().top;
      transitionMaxCanvasTopDelta = 0;
      transitionStartScrollY = window.scrollY;
      transitionMaxScrollDelta = 0;
    };

    const startPreparedEnter = (now: number) => {
      if (!systemResources || !activateSystemResources(systemResources)) return;
      finishPaperFocusReset();
      ambientTimeSeconds = 0;
      farRotationAngle = 0;
      lastAmbientRenderTime = 0;
      applyAmbientVisuals();
      if (!exploration.savedOverviewPose) {
        exploration.savedOverviewPose = captureOrbitPose(orbit);
        exploration.savedOverviewViewMode = orbit.viewMode;
        exploration.savedOverviewPauseUntil = orbit.pauseUntil;
      }
      exploration.fromBlend = exploration.blend;
      exploration.toBlend = 1;
      orbit.viewMode = "system";
      clearAutoResumeTimer();
      transitionFrameTimes.length = 0;
      lastTransitionRenderTime = 0;
      beginTransitionLayoutDiagnostics();
      setExplorationState("entering");
      startOrbitTransition(
        orbit,
        "enter-system",
        exploration.focusWorld,
        exploration.systemDistance,
        orbit.azimuth,
        APP17_SYSTEM_ELEVATION,
        now,
        APP17_SYSTEM_TRANSITION_MS,
      );
      invalidate(true);
    };

    const scheduleSystemPreparation = (hotspotId: string, enterWhenReady: boolean) => {
      if (!hotspotId) return;
      const cached = systemCache.get(systemCacheKey(hotspotId));
      if (cached) {
        lastSystemCacheHit = true;
        if (enterWhenReady && activateSystemResources(cached)) startPreparedEnter(performance.now());
        return;
      }
      if (preparingHotspotId === hotspotId) {
        if (enterWhenReady) {
          pendingEnterHotspotId = hotspotId;
          setExplorationState("preparing");
        }
        return;
      }

      cancelScheduledPreparation(exploration.state === "preparing");
      const payloadHotspot = payload.hotspots.find((hotspot) => hotspot.id === hotspotId);
      if (!payloadHotspot) return;
      preparingHotspotId = hotspotId;
      pendingEnterHotspotId = enterWhenReady ? hotspotId : "";
      if (enterWhenReady) setExplorationState("preparing");
      const token = preparationToken;
      const prepare = async () => {
        preparationIdleId = 0;
        preparationTimerId = 0;
        if (disposed || token !== preparationToken || selectedIdRef.current !== hotspotId) return;
        const startedAt = performance.now();
        const resources = buildGalaxySystemResources(
          payload,
          payloadHotspot,
          representativePapersRef.current,
          currentPixelRatio,
          systemVisualMode,
        );
        const renderHotspot = hotspotById.get(hotspotId);
        if (renderHotspot) {
          resources.entryScale = calculateSystemEntryScale(renderHotspot, topicKeyFromHotspot(payloadHotspot));
        }
        scene.add(resources.root);
        resources.root.visible = true;
        try {
          if (typeof renderer.compileAsync === "function") await renderer.compileAsync(scene, camera);
          else renderer.compile(scene, camera);
        } catch {
          if (!disposed && token === preparationToken) renderer.compile(scene, camera);
        }
        if (bloomPipeline && bloomAvailable) {
          try {
            bloomPipeline.prewarm(getBloomParameters("local"));
          } catch (error) {
            bloomAvailable = false;
            bloomUnavailableReason = `局部辉光预热失败：${String(error)}`;
            onBloomAvailabilityChangeRef.current?.(false, bloomUnavailableReason);
          }
        }
        resources.root.visible = false;
        if (disposed || token !== preparationToken || selectedIdRef.current !== hotspotId) {
          scene.remove(resources.root);
          resources.dispose();
          return;
        }
        replaceSystemRepresentatives(resources, representativePapersRef.current, currentPixelRatio);
        storeSystemCache(resources);
        lastSystemPrepareMs = Math.max(0, performance.now() - startedAt);
        lastSystemCacheHit = false;
        preparingHotspotId = "";
        if (pendingEnterHotspotId === hotspotId) {
          pendingEnterHotspotId = "";
          if (activateSystemResources(resources)) startPreparedEnter(performance.now());
        }
        reportPerformance();
      };
      const idleWindow = window as IdleCapableWindow;
      if (idleWindow.requestIdleCallback) {
        preparationIdleId = idleWindow.requestIdleCallback(() => void prepare(), { timeout: 600 });
      } else {
        preparationTimerId = window.setTimeout(() => void prepare(), 32);
      }
    };

    prepareSystemRef.current = (hotspotId) => {
      if (exploration.state !== "overview" && exploration.state !== "preparing") return;
      if (exploration.state === "preparing" && hotspotId !== pendingEnterHotspotId) {
        cancelScheduledPreparation(true);
      }
      const payloadHotspot = payload.hotspots.find((hotspot) => hotspot.id === hotspotId);
      const renderHotspot = hotspotById.get(hotspotId);
      if (payloadHotspot && renderHotspot) {
        exploration.focusLocal.copy(renderHotspot.position);
        exploration.selectedTopicKey = topicKeyFromHotspot(payloadHotspot);
        paperLayer.setExplorationSelection(exploration.selectedTopicKey, exploration.focusLocal);
        hotspotLayer.setExplorationSelection(exploration.selectedTopicKey, exploration.focusLocal);
      }
      scheduleSystemPreparation(hotspotId, false);
    };

    const cancelRepresentativeUpdate = (disposePrepared = true) => {
      representativeUpdateToken += 1;
      const idleWindow = window as IdleCapableWindow;
      if (representativePreparationIdleId && idleWindow.cancelIdleCallback) {
        idleWindow.cancelIdleCallback(representativePreparationIdleId);
      }
      if (representativePreparationTimerId) window.clearTimeout(representativePreparationTimerId);
      if (representativeCommitFrameId) cancelAnimationFrame(representativeCommitFrameId);
      representativePreparationIdleId = 0;
      representativePreparationTimerId = 0;
      representativeCommitFrameId = 0;
      if (disposePrepared) preparedRepresentativeUpdate?.bundle.dispose();
      preparedRepresentativeUpdate = null;
    };

    const commitPreparedRepresentativeUpdate = () => {
      representativeCommitFrameId = 0;
      if (!preparedRepresentativeUpdate) return;
      if (
        exploration.state === "entering"
        || exploration.state === "exiting"
        || exploration.state === "preparing"
      ) return;
      const prepared = preparedRepresentativeUpdate;
      preparedRepresentativeUpdate = null;
      if (
        prepared.resources.hotspotId !== selectedIdRef.current
        || representativePaperSignature(representativePapersRef.current) !== prepared.bundle.signature
      ) {
        prepared.bundle.dispose();
        pendingRepresentativeUpdate = false;
        return;
      }
      const commitStartedAt = performance.now();
      const changed = commitSystemRepresentativeBundle(prepared.resources, prepared.bundle);
      lastRepresentativeCommitMs = Math.max(0, performance.now() - commitStartedAt);
      pendingRepresentativeUpdate = false;
      if (changed) {
        if (systemResources === prepared.resources) applyExplorationBlend(exploration.blend);
        hoveredSystemPaperId = "";
        invalidate(true);
      }
      reportPerformance();
    };

    const queueRepresentativeCommit = () => {
      if (!preparedRepresentativeUpdate || representativeCommitFrameId) return;
      if (
        exploration.state === "entering"
        || exploration.state === "exiting"
        || exploration.state === "preparing"
      ) return;
      representativeCommitFrameId = requestAnimationFrame(commitPreparedRepresentativeUpdate);
    };

    const scheduleRepresentativePreparation = (resources: GalaxySystemResources) => {
      const signature = representativePaperSignature(representativePapersRef.current);
      if (signature === resources.representativeSignature) {
        pendingRepresentativeUpdate = false;
        cancelRepresentativeUpdate();
        return;
      }
      cancelRepresentativeUpdate();
      pendingRepresentativeUpdate = true;
      const token = representativeUpdateToken;
      const hotspotId = resources.hotspotId;
      const paperSnapshot = representativePapersRef.current.slice();
      const prepare = () => {
        representativePreparationIdleId = 0;
        representativePreparationTimerId = 0;
        if (disposed || token !== representativeUpdateToken || selectedIdRef.current !== hotspotId) return;
        const prepareStartedAt = performance.now();
        const bundle = buildSystemRepresentativeBundle(resources, paperSnapshot, currentPixelRatio);
        lastRepresentativePrepareMs = Math.max(0, performance.now() - prepareStartedAt);
        if (
          disposed
          || token !== representativeUpdateToken
          || selectedIdRef.current !== hotspotId
          || representativePaperSignature(representativePapersRef.current) !== bundle.signature
        ) {
          bundle.dispose();
          return;
        }
        preparedRepresentativeUpdate = { resources, bundle };
        queueRepresentativeCommit();
        reportPerformance();
      };
      const idleWindow = window as IdleCapableWindow;
      if (idleWindow.requestIdleCallback) {
        representativePreparationIdleId = idleWindow.requestIdleCallback(prepare, { timeout: 1_200 });
      } else {
        representativePreparationTimerId = window.setTimeout(prepare, 96);
      }
      reportPerformance();
    };

    refreshSystemRef.current = () => {
      const cached = systemCache.get(systemCacheKey(selectedIdRef.current));
      if (!cached) return;
      scheduleRepresentativePreparation(cached);
    };

    const flushDeferredRepresentativeUpdate = () => {
      if (!pendingRepresentativeUpdate) return;
      if (preparedRepresentativeUpdate) queueRepresentativeCommit();
      else {
        const cached = systemCache.get(systemCacheKey(selectedIdRef.current));
        if (cached) scheduleRepresentativePreparation(cached);
      }
    };

    const applyAmbientVisuals = () => {
      const rotationAngle = sceneData.kind === "app14" ? farRotationAngle : 0;
      const ambientStrength = reduceMotion ? 0 : 1;
      paperLayer.setFarRotation(rotationAngle);
      hotspotLayer.setAmbientState(ambientTimeSeconds, rotationAngle, ambientStrength);
      orbitLayer?.setExploration(
        smoothStepRange(0, 0.78, exploration.blend),
        exploration.focusLocal,
        rotationAngle,
      );
    };

    const applyExplorationBlend = (blend: number) => {
      exploration.blend = THREE.MathUtils.clamp(blend, 0, 1);
      const retreatProgress = smoothStepRange(0, 0.78, exploration.blend);
      const systemFade = smoothStepRange(0.2, 0.78, exploration.blend);
      const systemRevealProgress = smoothStepRange(
        APP17_SYSTEM_PAPER_REVEAL_START,
        APP17_SYSTEM_PAPER_REVEAL_END,
        exploration.blend,
      );
      overviewSelectedTopicOpacity = 1 - systemFade;
      systemCloudOpacity = systemFade;
      const systemExpansion = smoothStepRange(0.16, 0.94, exploration.blend);
      const starExpansion = smoothStepRange(0.28, 0.88, exploration.blend);
      overviewRoot.visible = true;
      overviewRoot.scale.setScalar(1);
      overviewRoot.position.set(0, 0, 0);
      paperLayer.setExplorationProgress(retreatProgress, overviewSelectedTopicOpacity);
      hotspotLayer.setExplorationProgress(retreatProgress);
      applyAmbientVisuals();
      if (systemResources) {
        const currentFocusDistance = Math.max(0.1, camera.position.distanceTo(exploration.focusWorld));
        const distanceRatio = currentFocusDistance / Math.max(0.1, exploration.entryFocusDistance);
        const scaleFloor = systemResources.entryScale * distanceRatio;
        const starScaleFloor = systemResources.starEntryScale * distanceRatio;
        const systemScale = Math.min(1, Math.max(
          THREE.MathUtils.lerp(systemResources.entryScale, 1, systemExpansion),
          scaleFloor,
        ));
        const starWorldScale = Math.min(1, Math.max(
          THREE.MathUtils.lerp(systemResources.starEntryScale, 1, starExpansion),
          starScaleFloor,
        ));
        systemResources.root.scale.setScalar(systemScale);
        systemResources.star.object.scale.setScalar(starWorldScale / Math.max(0.001, systemScale));
        systemResources.cloudLayer.setRevealProgress(systemRevealProgress);
        setGalaxySystemOpacity(systemResources, systemFade);
      }
      focusSprite.visible = exploration.blend < 0.02 && Boolean(selectedIdRef.current);
    };

    const beginEnterSystem = (now: number) => {
      const selectedHotspotId = selectedIdRef.current;
      const cached = systemCache.get(systemCacheKey(selectedHotspotId));
      if (cached && activateSystemResources(cached)) {
        lastSystemCacheHit = true;
        startPreparedEnter(now);
        return;
      }
      lastSystemCacheHit = false;
      scheduleSystemPreparation(selectedHotspotId, true);
      invalidate(true);
    };

    const beginExitSystem = (now: number) => {
      if (exploration.state === "overview") return;
      if (exploration.state === "preparing") {
        cancelScheduledPreparation(true);
        invalidate(true);
        return;
      }
      const saved = exploration.savedOverviewPose ?? {
        center: sceneData.camera.center.clone(),
        distance: sceneData.camera.distance,
        azimuth: sceneData.camera.azimuth,
        elevation: sceneData.camera.elevation,
      };
      if (paperDirectFlight) {
        syncOrbitFromCamera(orbit, camera, orbit.center);
        paperDirectFlight = null;
      }
      exploration.fromBlend = exploration.blend;
      exploration.toBlend = 0;
      if (paperFocus.state !== "idle") {
        paperFocus.fromBlend = paperFocus.blend;
        paperFocus.toBlend = 0;
        paperFocus.flightStrength = 0;
        paperFocus.canceled = paperFocus.state === "entering";
        lastPaperFocusCanceled = paperFocus.canceled;
        setPaperFocusState("exiting");
        if (paperInspection.panelState !== "hidden" || paperInspection.panelProgress > 0.001) {
          paperInspection.panelTransition = {
            startedAt: now,
            durationMs: APP17_PAPER_INSPECTION_PANEL_EXIT_MS,
            from: paperInspection.panelProgress,
            to: 0,
          };
          setPaperPanelState("exiting");
        } else {
          paperInspection.panelTransition = null;
          setPaperPanelState("hidden");
        }
      }
      orbit.viewMode = "overview";
      transitionFrameTimes.length = 0;
      lastTransitionRenderTime = 0;
      beginTransitionLayoutDiagnostics();
      setExplorationState("exiting");
      startOrbitTransition(
        orbit,
        "exit-system",
        saved.center,
        saved.distance,
        saved.azimuth,
        saved.elevation,
        now,
        Math.max(240, APP17_SYSTEM_TRANSITION_MS * Math.max(0.12, exploration.blend)),
      );
    };

    const resetSystemView = (now: number) => {
      if (exploration.state !== "system") return;
      if (paperDirectFlight) {
        syncOrbitFromCamera(orbit, camera, orbit.center);
        paperDirectFlight = null;
      }
      if (paperFocus.state !== "idle") {
        paperFocus.fromBlend = paperFocus.blend;
        paperFocus.toBlend = 0;
        paperFocus.flightStrength = 0;
        paperFocus.canceled = paperFocus.state === "entering";
        lastPaperFocusCanceled = paperFocus.canceled;
        setPaperFocusState("exiting");
      }
      startOrbitTransition(
        orbit,
        "reset-system",
        exploration.focusWorld,
        exploration.systemDistance,
        Math.PI / 4,
        APP17_SYSTEM_ELEVATION,
        now,
      );
    };

    const resolveSystemPaperPosition = (paperId: string) => {
      if (!systemResources || !paperId) return undefined;
      return systemResources.representativePapers.find((paper) => paper.id === paperId)?.position
        ?? systemResources.cloudLayer.getPaperById(paperId)?.position;
    };

    const resolveSystemPaperVisual = (paperId: string) => {
      if (!systemResources || !paperId) return undefined;
      const representativePaper = systemResources.representativePapers.find((paper) => paper.id === paperId);
      const ordinaryPaper = representativePaper ? undefined : systemResources.cloudLayer.getPaperById(paperId);
      const metadata = selectedPaperVisualRef.current?.id === paperId ? selectedPaperVisualRef.current : undefined;
      const position = representativePaper?.position ?? ordinaryPaper?.position;
      if (!position) return undefined;
      return {
        position,
        color: representativePaper?.color ?? ordinaryPaper?.color ?? "#f5f7ff",
        haloColor: systemResources.hotspot.color || "#8ea7ff",
        source: metadata?.source ?? representativePaper?.source,
        representative: metadata?.representative ?? Boolean(representativePaper),
        representativeRank: representativePaper?.rank ?? -1,
      };
    };

    const configurePaperInspectionVisual = () => {
      const visual = resolveSystemPaperVisual(paperFocus.targetId);
      if (!visual) return;
      paperInspection.visualType = visual.representative ? "energy-core" : "data-sphere";
      paperInspectionVisual.configure({
        paperId: paperFocus.targetId,
        bodyColor: visual.color,
        haloColor: visual.haloColor,
        source: visual.source,
        representative: visual.representative,
        representativeRank: visual.representativeRank,
      });
    };
    inspectionMetadataControllerRef.current = configurePaperInspectionVisual;

    const applyPaperFocusBlend = (blend: number) => {
      paperFocus.blend = THREE.MathUtils.clamp(blend, 0, 1);
      if (!systemResources) return;
      const targetPosition = resolveSystemPaperPosition(paperFocus.targetId);
      const flightStrength = paperFocus.state === "entering" || paperFocus.state === "exiting"
        ? paperFocus.flightStrength
        : 0;
      systemResources.cloudLayer.setPaperFocus(
        paperFocus.targetId,
        targetPosition,
        paperFocus.blend,
        paperInspection.blend,
        flightStrength,
        orbit.distance,
      );
      systemResources.representativeLayer?.setPaperFocus(
        paperFocus.targetId,
        targetPosition,
        paperFocus.blend,
        paperInspection.blend,
        flightStrength,
        orbit.distance,
      );
      const targetRank = systemResources.representativePapers.findIndex((paper) => paper.id === paperFocus.targetId);
      systemResources.representativeBloomLayer?.setPaperFocusBlend(paperFocus.blend, paperInspection.blend, targetRank);
      systemResources.orbitLayer?.setPaperFocus(
        paperFocus.blend,
        targetRank,
        paperInspection.blend,
      );
      systemResources.star.setFocusAttenuation(
        THREE.MathUtils.lerp(1, APP17_SYSTEM_PAPER_FOCUS_STAR_BRIGHTNESS, paperFocus.blend),
      );
      const targetLayerState = targetRank >= 0
        ? systemResources.representativeLayer?.getVisualState()
        : systemResources.cloudLayer.getVisualState();
      paperFocus.targetScreenSize = paperInspectionVisual.getVisualState().projectedDiameter
        || targetLayerState?.paperFocusTargetScreenSize
        || 0;
      configurePaperInspectionVisual();
      const nextNear = paperInspection.blend > 0.001 ? 0.02 : 0.1;
      if (Math.abs(camera.near - nextNear) > 0.001) {
        camera.near = nextNear;
        camera.updateProjectionMatrix();
      }
    };

    const resetPaperVisualHandoff = () => {
      paperVisualHandoff.state = "none";
      paperVisualHandoff.lockedInspectionBlend = 0;
      paperVisualHandoff.lockedProjectedDiameter = 0;
      paperVisualHandoff.lockedAnchorNdcX = 0;
      paperVisualHandoff.returnHoldProgress = APP17_PAPER_RETURN_VISUAL_HOLD_PROGRESS;
      paperVisualHandoff.cameraTakeoverPending = false;
    };

    const finishPaperFocusReset = () => {
      applyPaperFocusBlend(0);
      paperFocus.blend = 0;
      paperFocus.fromBlend = 0;
      paperFocus.toBlend = 0;
      paperFocus.targetId = "";
      paperFocus.startDistance = 0;
      paperFocus.targetDistance = 0;
      paperFocus.targetScreenSize = 0;
      paperFocus.flightStrength = 0;
      paperFocus.canceled = false;
      paperDirectFlight = null;
      lastPaperFlightPathMode = "none";
      lastPaperCameraDistance = 0;
      lastPaperCenterErrorPx = 0;
      lastPaperStarClearance = 0;
      paperInspection.blend = 0;
      paperInspection.visualType = "none";
      paperInspection.dockBlend = 0;
      paperInspection.dockTransition = null;
      paperInspection.panelProgress = 0;
      paperInspection.panelTransition = null;
      paperInspectionVisual.object.visible = false;
      resetPaperVisualHandoff();
      paperComposition.targetAnchorNdcX = 0;
      paperComposition.currentAnchorNdcX = 0;
      paperComposition.anchorErrorPx = 0;
      paperComposition.panelHeaderProgress = 0;
      paperComposition.panelBodyProgress = 0;
      paperComposition.cameraWriter = "orbit";
      paperComposition.returnHorizontalReversals = 0;
      paperComposition.lastReturnScreenX = Number.NaN;
      paperComposition.lastReturnDirection = 0;
      setPaperInspectionMode("none", "");
      setPaperPanelState("hidden", "");
      camera.near = 0.1;
      camera.updateProjectionMatrix();
      savedSystemPose = null;
      paperFocusTargetDistance = 0;
      setSystemViewMode("system");
      setPaperFocusState("idle", "");
    };

    const updatePaperInspectionHandoff = () => {
      if (!systemResources || !paperFocus.targetId || paperFocus.state === "idle") {
        paperInspection.blend = 0;
        return;
      }
      const localPosition = resolveSystemPaperPosition(paperFocus.targetId);
      if (!localPosition) {
        paperInspection.blend = 0;
        return;
      }
      systemResources.root.updateMatrixWorld(true);
      const worldPosition = localPosition.clone().applyMatrix4(systemResources.root.matrixWorld);
      const targetVisual = resolveSystemPaperVisual(paperFocus.targetId);
      const representativeInspection = Boolean(targetVisual?.representative);
      const inspectionScale = representativeInspection
        ? APP17_REPRESENTATIVE_INSPECTION_SCALE
        : 1;
      const projectedDiameter = projectedWorldDiameterPixels(
        worldPosition,
        APP17_PAPER_INSPECTION_WORLD_DIAMETER * inspectionScale,
        camera,
        height,
      );
      const sizeBlend = smoothStepRange(
        representativeInspection
          ? APP17_REPRESENTATIVE_INSPECTION_HANDOFF_START_PX
          : APP17_PAPER_INSPECTION_HANDOFF_START_PX,
        representativeInspection
          ? APP17_REPRESENTATIVE_INSPECTION_HANDOFF_END_PX
          : APP17_PAPER_INSPECTION_HANDOFF_END_PX,
        projectedDiameter,
      );
      const focusGate = smoothStepRange(0.04, 0.24, paperFocus.blend);
      const dynamicBlend = sizeBlend * focusGate;

      if (paperVisualHandoff.state === "return-hold") {
        const returnFlight = paperDirectFlight?.kind === "return" ? paperDirectFlight : null;
        const returnProgress = returnFlight
          ? THREE.MathUtils.clamp(
              (performance.now() - returnFlight.startedAt) / Math.max(1, returnFlight.durationMs),
              0,
              1,
            )
          : 1;
        if (returnProgress <= paperVisualHandoff.returnHoldProgress) {
          paperInspection.blend = paperVisualHandoff.lockedInspectionBlend;
          return;
        }
        paperVisualHandoff.state = "return-handoff";
      }

      if (paperVisualHandoff.state === "return-handoff") {
        // Keep the close-up visible until the physical projected size has crossed back through its handoff range.
        paperInspection.blend = Math.min(paperVisualHandoff.lockedInspectionBlend, sizeBlend);
        return;
      }

      if (paperVisualHandoff.state === "locked") {
        paperInspection.blend = paperVisualHandoff.lockedInspectionBlend;
        return;
      }

      paperInspection.blend = dynamicBlend;
      if (paperVisualHandoff.state === "entering" && dynamicBlend >= 0.995) {
        paperVisualHandoff.state = "locked";
        paperVisualHandoff.lockedInspectionBlend = dynamicBlend;
        paperVisualHandoff.lockedProjectedDiameter = projectedDiameter;
        paperVisualHandoff.lockedAnchorNdcX = paperComposition.currentAnchorNdcX;
      }
    };

    const createFocusPaperFlight = (
      paperWorldPosition: THREE.Vector3,
      targetDistance: number,
      now: number,
      durationMs: number,
    ) => {
      const startCameraPosition = camera.position.clone();
      const approachDirection = startCameraPosition.clone().sub(paperWorldPosition);
      if (approachDirection.lengthSq() < 0.000001) {
        camera.getWorldDirection(approachDirection).multiplyScalar(-1);
      }
      approachDirection.normalize();
      const endCameraPosition = paperWorldPosition.clone().addScaledVector(approachDirection, targetDistance);
      const startLookTarget = orbit.center.clone();
      const endLookTarget = paperWorldPosition.clone();
      const startProjection = paperWorldPosition.clone().project(camera);
      const startAnchorNdcX = THREE.MathUtils.clamp(startProjection.x, -0.96, 0.96);
      const targetAnchorNdcX = paperReadingAnchorNdcX();

      systemResources?.root.updateMatrixWorld(true);
      systemResources?.star.object.updateMatrixWorld(true);
      const starCenter = systemResources
        ? new THREE.Vector3().setFromMatrixPosition(systemResources.star.object.matrixWorld)
        : new THREE.Vector3();
      const starScale = systemResources
        ? systemResources.star.object.getWorldScale(new THREE.Vector3())
        : new THREE.Vector3(1, 1, 1);
      const safeStarRadius = APP17_SYSTEM_STAR_RADIUS
        * Math.max(starScale.x, starScale.y, starScale.z)
        * APP17_PAPER_FLIGHT_STAR_CLEARANCE;
      const avoidance = createPaperAvoidancePath(
        startCameraPosition,
        endCameraPosition,
        starCenter,
        safeStarRadius,
        camera,
        APP17_PAPER_FLIGHT_ARC_SAMPLES,
      );

      return {
        kind: "focus" as const,
        pathMode: avoidance ? "avoidance" as const : "direct" as const,
        startedAt: now,
        durationMs,
        startCameraPosition,
        endCameraPosition,
        controlPoint: avoidance?.controlPoint ?? null,
        arcLengthTable: avoidance?.arcLengthTable ?? null,
        startQuaternion: camera.quaternion.clone(),
        endQuaternion: cameraQuaternionForAnchoredTarget(
          endCameraPosition,
          endLookTarget,
          camera,
          targetAnchorNdcX,
          0,
        ),
        startLookTarget,
        endLookTarget,
        paperWorldPosition: paperWorldPosition.clone(),
        startDistance: startCameraPosition.distanceTo(paperWorldPosition),
        targetDistance,
        minimumStarClearance: Math.max(
          0,
          (avoidance?.minimumClearance
            ?? segmentPointMinimumDistance(startCameraPosition, endCameraPosition, starCenter)) - safeStarRadius,
        ),
        returnPose: null,
        startAnchorNdcX,
        targetAnchorNdcX,
        settledFramePending: false,
      } satisfies GalaxyPaperDirectFlight;
    };

    const createReturnPaperFlight = (target: App17OrbitPose, now: number, durationMs: number) => {
      const endCameraPosition = orbitPoseCameraPosition(target);
      const targetPaperPosition = resolveSystemPaperPosition(paperFocus.targetId);
      const paperWorldPosition = systemResources && targetPaperPosition
        ? targetPaperPosition.clone().applyMatrix4(systemResources.root.matrixWorld)
        : orbit.center.clone();
      const startProjection = paperWorldPosition.clone().project(camera);
      return {
        kind: "return" as const,
        pathMode: "direct" as const,
        startedAt: now,
        durationMs,
        startCameraPosition: camera.position.clone(),
        endCameraPosition,
        controlPoint: null,
        arcLengthTable: null,
        startQuaternion: camera.quaternion.clone(),
        endQuaternion: cameraQuaternionForTarget(endCameraPosition, target.center, camera.up),
        startLookTarget: paperWorldPosition.clone(),
        endLookTarget: target.center.clone(),
        paperWorldPosition,
        startDistance: camera.position.distanceTo(paperWorldPosition),
        targetDistance: target.distance,
        minimumStarClearance: lastPaperStarClearance,
        returnPose: cloneOrbitPose(target),
        startAnchorNdcX: THREE.MathUtils.clamp(startProjection.x, -0.96, 0.96),
        targetAnchorNdcX: 0,
        settledFramePending: false,
      } satisfies GalaxyPaperDirectFlight;
    };

    const focusPaperById = (paperId: string, now: number) => {
      if (exploration.state !== "system" || !systemResources) return;
      const localPosition = resolveSystemPaperPosition(paperId);
      if (!localPosition) return;
      const retargeting = paperFocus.state !== "idle" && Boolean(savedSystemPose);
      if (!savedSystemPose) savedSystemPose = captureOrbitPose(orbit);
      systemResources.root.updateMatrixWorld(true);
      const worldPosition = localPosition.clone().applyMatrix4(systemResources.root.matrixWorld);
      const targetDistance = paperInspectionTargetDistance(camera, APP17_PAPER_INSPECTION_ARRIVAL_VIEWPORT_RATIO);
      paperFocusTargetDistance = Math.min(camera.position.distanceTo(worldPosition), targetDistance);
      paperFocus.targetId = paperId;
      paperFocus.startDistance = camera.position.distanceTo(worldPosition);
      paperFocus.targetDistance = paperFocusTargetDistance;
      paperFocus.fromBlend = retargeting ? 1 : paperFocus.blend;
      paperFocus.toBlend = 1;
      paperFocus.flightStrength = 0;
      paperFocus.canceled = false;
      lastPaperFocusCanceled = false;
      paperVisualHandoff.state = "entering";
      paperVisualHandoff.lockedInspectionBlend = 0;
      paperVisualHandoff.lockedProjectedDiameter = 0;
      paperVisualHandoff.lockedAnchorNdcX = paperComposition.currentAnchorNdcX;
      paperVisualHandoff.returnHoldProgress = APP17_PAPER_RETURN_VISUAL_HOLD_PROGRESS;
      paperVisualHandoff.cameraTakeoverPending = false;
      const keepReadingPanel = retargeting && paperInspection.panelProgress > 0.5;
      paperInspection.dockTransition = null;
      paperInspection.panelTransition = null;
      paperInspection.panelProgress = keepReadingPanel ? 1 : 0;
      paperInspection.blend = retargeting ? 0 : paperInspection.blend;
      paperInspection.dockBlend = keepReadingPanel ? 1 : 0;
      paperComposition.panelHeaderProgress = keepReadingPanel ? 1 : 0;
      paperComposition.panelBodyProgress = keepReadingPanel ? 1 : 0;
      paperComposition.returnHorizontalReversals = 0;
      paperComposition.lastReturnScreenX = Number.NaN;
      paperComposition.lastReturnDirection = 0;
      setPaperInspectionMode(keepReadingPanel ? "docked" : "none", paperId);
      setPaperPanelState(keepReadingPanel ? "visible" : "staged", paperId);
      setSystemViewMode("paper-focus");
      setPaperFocusState("entering", paperId);
      configurePaperInspectionVisual();
      applyPaperFocusBlend(paperFocus.blend);
      transitionFrameTimes.length = 0;
      lastTransitionRenderTime = 0;
      beginTransitionLayoutDiagnostics();
      cancelOrbitMotion(orbit);
      pendingWheelDelta = 0;
      paperDirectFlight = createFocusPaperFlight(
        worldPosition,
        paperFocusTargetDistance,
        now,
        retargeting ? APP17_SYSTEM_PAPER_RETARGET_TRANSITION_MS : APP17_SYSTEM_PAPER_FOCUS_TRANSITION_MS,
      );
      lastPaperFlightPathMode = paperDirectFlight.pathMode;
      lastPaperStarClearance = paperDirectFlight.minimumStarClearance;
      paperComposition.targetAnchorNdcX = paperDirectFlight.targetAnchorNdcX;
      paperComposition.currentAnchorNdcX = paperDirectFlight.startAnchorNdcX;
      paperComposition.cameraWriter = "paper-flight";
      invalidate(true);
    };

    const returnToSystemCenter = (now: number) => {
      if (exploration.state !== "system" || !savedSystemPose || paperFocus.state === "idle") return;
      const target = savedSystemPose;
      paperFocus.fromBlend = paperFocus.blend;
      paperFocus.toBlend = 0;
      paperFocus.flightStrength = 0;
      paperFocus.canceled = paperFocus.state === "entering";
      lastPaperFocusCanceled = paperFocus.canceled;
      setPaperFocusState("exiting");
      paperInspection.dockTransition = null;
      paperVisualHandoff.state = "return-hold";
      paperVisualHandoff.lockedInspectionBlend = paperInspection.blend;
      paperVisualHandoff.lockedProjectedDiameter = paperInspectionVisual.getVisualState().projectedDiameter;
      paperVisualHandoff.lockedAnchorNdcX = paperComposition.currentAnchorNdcX;
      paperVisualHandoff.returnHoldProgress = APP17_PAPER_RETURN_VISUAL_HOLD_PROGRESS;
      paperVisualHandoff.cameraTakeoverPending = false;
      paperComposition.cameraWriter = "paper-return";
      paperComposition.returnHorizontalReversals = 0;
      paperComposition.lastReturnScreenX = Number.NaN;
      paperComposition.lastReturnDirection = 0;
      if (paperInspection.panelProgress > 0.001) {
        paperInspection.panelTransition = {
          startedAt: now,
          durationMs: APP17_PAPER_INSPECTION_PANEL_EXIT_MS,
          from: paperInspection.panelProgress,
          to: 0,
        };
        setPaperPanelState("exiting");
      } else {
        paperInspection.panelTransition = null;
        paperInspection.panelProgress = 0;
        setPaperPanelState("hidden");
      }
      const duration = paperFocus.canceled
        ? Math.max(260, APP17_SYSTEM_PAPER_RETURN_TRANSITION_MS * Math.max(0.22, paperFocus.blend))
        : APP17_SYSTEM_PAPER_RETURN_TRANSITION_MS;
      transitionFrameTimes.length = 0;
      lastTransitionRenderTime = 0;
      cancelOrbitMotion(orbit);
      pendingWheelDelta = 0;
      paperDirectFlight = createReturnPaperFlight(target, now, duration);
      lastPaperFlightPathMode = paperDirectFlight.pathMode;
      invalidate(true);
    };

    const advancePaperDirectFlight = (now: number) => {
      const flight = paperDirectFlight;
      if (!flight) return false;
      if (flight.settledFramePending) {
        paperDirectFlight = null;
        lastPaperFocusTransitionMs = Math.max(0, now - flight.startedAt);
        lastTransitionP95Ms = percentileNumber(transitionFrameTimes, 0.95);
        lastTransitionLongFrames50 = transitionFrameTimes.filter((value) => value > 50).length;
        if (flight.kind === "focus") {
          syncOrbitFromCamera(orbit, camera, flight.paperWorldPosition);
          orbit.targetDistance = orbit.distance;
          applyPaperFocusBlend(1);
          updatePaperInspectionHandoff();
          applyPaperFocusBlend(1);
          setPaperFocusState("focused");
          setSystemViewMode("paper-focus");
          paperInspection.panelTransition = null;
          paperInspection.panelProgress = 1;
          paperInspection.dockBlend = 1;
          paperComposition.currentAnchorNdcX = flight.targetAnchorNdcX;
          paperComposition.targetAnchorNdcX = flight.targetAnchorNdcX;
          paperComposition.panelHeaderProgress = 1;
          paperComposition.panelBodyProgress = 1;
          paperComposition.cameraWriter = "paper-composition";
          setPaperInspectionMode("docked");
          setPaperPanelState("visible");
        } else {
          const returnPose = flight.returnPose;
          if (returnPose) {
            orbit.center.copy(returnPose.center);
            orbit.distance = returnPose.distance;
            orbit.targetDistance = returnPose.distance;
            orbit.azimuth = returnPose.azimuth;
            orbit.elevation = returnPose.elevation;
            applyCameraOrbit(camera, orbit);
          }
          paperComposition.cameraWriter = "orbit";
          finishPaperFocusReset();
        }
        return true;
      }
      const progress = THREE.MathUtils.clamp((now - flight.startedAt) / Math.max(1, flight.durationMs), 0, 1);
      const eased = smootherStep(progress);
      const nextPosition = samplePaperDirectFlightPosition(flight, eased);
      const lookTarget = flight.startLookTarget.clone().lerp(flight.endLookTarget, eased);
      camera.position.copy(nextPosition);
      if (flight.kind === "focus") {
        const anchorProgress = smootherStep(progress);
        const currentAnchor = THREE.MathUtils.lerp(
          flight.startAnchorNdcX,
          flight.targetAnchorNdcX,
          anchorProgress,
        );
        const anchoredQuaternion = cameraQuaternionForAnchoredTarget(
          nextPosition,
          flight.paperWorldPosition,
          camera,
          currentAnchor,
          0,
        );
        camera.quaternion.slerpQuaternions(
          flight.startQuaternion,
          anchoredQuaternion,
          smootherStep(Math.min(1, progress / APP17_PAPER_FLIGHT_AIM_PORTION)),
        );
        paperInspection.dockBlend = anchorProgress;
        paperComposition.currentAnchorNdcX = currentAnchor;
        paperComposition.targetAnchorNdcX = flight.targetAnchorNdcX;
        paperComposition.cameraWriter = "paper-flight";

        if (paperInspection.panelState !== "visible") {
          const panelStartAt = flight.durationMs * APP17_PAPER_INSPECTION_PANEL_START_PROGRESS;
          const panelElapsed = now - flight.startedAt - panelStartAt;
          paperInspection.panelProgress = smootherStep(
            THREE.MathUtils.clamp(panelElapsed / APP17_PAPER_INSPECTION_PANEL_ENTER_MS, 0, 1),
          );
          paperComposition.panelHeaderProgress = smoothStepRange(
            APP17_PAPER_INSPECTION_HEADER_START_PROGRESS,
            0.76,
            progress,
          );
          paperComposition.panelBodyProgress = smoothStepRange(
            APP17_PAPER_INSPECTION_BODY_START_PROGRESS,
            0.94,
            progress,
          );
          if (progress >= APP17_PAPER_INSPECTION_PANEL_START_PROGRESS) {
            if (paperInspection.mode !== "docked") setPaperInspectionMode("docked");
            setPaperPanelState(progress >= 0.94 ? "visible" : "entering");
          }
        }
      } else {
        const currentAnchor = THREE.MathUtils.lerp(
          flight.startAnchorNdcX,
          flight.targetAnchorNdcX,
          eased,
        );
        camera.quaternion.copy(cameraQuaternionForAnchoredTarget(
          nextPosition,
          lookTarget,
          camera,
          currentAnchor,
          0,
        ));
        paperComposition.currentAnchorNdcX = currentAnchor;
        paperComposition.targetAnchorNdcX = flight.targetAnchorNdcX;
        paperComposition.cameraWriter = "paper-return";
      }
      camera.updateMatrixWorld(true);

      syncOrbitFromCamera(orbit, camera, lookTarget);
      paperFocus.flightStrength = Math.sin(Math.PI * eased);
      applyPaperFocusBlend(THREE.MathUtils.lerp(paperFocus.fromBlend, paperFocus.toBlend, eased));
      updatePaperInspectionHandoff();
      applyPaperFocusBlend(paperFocus.blend);
      lastPaperCameraDistance = camera.position.distanceTo(flight.paperWorldPosition);
      const projectedPaper = flight.paperWorldPosition.clone().project(camera);
      lastPaperCenterErrorPx = Math.hypot(
        projectedPaper.x * width * 0.5,
        projectedPaper.y * height * 0.5,
      );
      paperComposition.anchorErrorPx = Math.abs(
        projectedPaper.x - paperComposition.currentAnchorNdcX,
      ) * width * 0.5;
      if (flight.kind === "return") {
        if (Number.isFinite(paperComposition.lastReturnScreenX)) {
          const movement = projectedPaper.x - paperComposition.lastReturnScreenX;
          const direction = Math.abs(movement) > 0.0005 ? Math.sign(movement) : 0;
          if (
            direction !== 0
            && paperComposition.lastReturnDirection !== 0
            && direction !== paperComposition.lastReturnDirection
          ) {
            paperComposition.returnHorizontalReversals += 1;
          }
          if (direction !== 0) paperComposition.lastReturnDirection = direction;
        }
        paperComposition.lastReturnScreenX = projectedPaper.x;
      }

      if (progress < 1) return true;
      camera.position.copy(flight.endCameraPosition);
      camera.quaternion.copy(flight.endQuaternion);
      camera.updateMatrixWorld(true);
      syncOrbitFromCamera(orbit, camera, flight.endLookTarget);
      if (flight.kind === "focus") {
        const targetVisual = resolveSystemPaperVisual(paperFocus.targetId);
        const inspectionDiameter = APP17_PAPER_INSPECTION_WORLD_DIAMETER
          * (targetVisual?.representative ? APP17_REPRESENTATIVE_INSPECTION_SCALE : 1);
        paperVisualHandoff.state = "locked";
        paperVisualHandoff.lockedInspectionBlend = 1;
        paperVisualHandoff.lockedProjectedDiameter = projectedWorldDiameterPixels(
          flight.paperWorldPosition,
          inspectionDiameter,
          camera,
          height,
        );
        paperVisualHandoff.lockedAnchorNdcX = flight.targetAnchorNdcX;
      }
      flight.settledFramePending = true;
      paperVisualHandoff.cameraTakeoverPending = true;
      return true;
    };

    const togglePaperInspection = (now: number) => {
      if (exploration.state !== "system" || paperFocus.state !== "focused" || paperInspection.blend < 0.98) return;
      const nextMode: GalaxyPaperInspectionMode = paperInspection.mode === "centered" ? "docked" : "centered";
      paperInspection.dockTransition = {
        startedAt: now,
        durationMs: APP17_PAPER_INSPECTION_TOGGLE_MS,
        from: paperInspection.dockBlend,
        to: nextMode === "docked" ? 1 : 0,
      };
      setPaperInspectionMode(nextMode);
      paperInspection.panelTransition = {
        startedAt: now,
        durationMs: nextMode === "docked" ? APP17_PAPER_INSPECTION_PANEL_ENTER_MS : APP17_PAPER_INSPECTION_PANEL_EXIT_MS,
        from: paperInspection.panelProgress,
        to: nextMode === "docked" ? 1 : 0,
      };
      setPaperPanelState(nextMode === "docked" ? "entering" : "exiting");
      invalidate(true);
    };

    const updatePointer = (event: { clientX: number; clientY: number }) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
    };

    const pickHotspot = () => {
      raycaster.params.Points.threshold = overviewPointPickThreshold;
      raycaster.setFromCamera(pointer, camera);
      const intersections = raycaster.intersectObject(hotspotLayer.object, false);
      const index = intersections.length > 0 ? intersections[0].index ?? -1 : -1;
      return index >= 0 ? hotspotByIndex[index]?.id ?? "" : "";
    };

    const pickSystemPaper = (force = false) => {
      if (!systemResources) return "";
      const pickStartedAt = performance.now();
      if (!force && pickStartedAt - lastSystemPaperPickAt < APP17_SYSTEM_PAPER_PICK_INTERVAL_MS) {
        return lastSystemPaperPickId;
      }
      lastSystemPaperPickAt = pickStartedAt;
      lastSystemPaperPickCandidateCount = 0;
      systemResources.root.updateMatrixWorld(true);
      systemResources.root.getWorldPosition(systemPickWorldPosition);
      systemPickViewPosition.copy(systemPickWorldPosition).applyMatrix4(camera.matrixWorldInverse);
      const viewDepth = Math.max(0.1, -systemPickViewPosition.z);
      const visibleWorldHeight = (
        2
        * viewDepth
        * Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5)
      ) / Math.max(0.01, camera.zoom);
      const worldUnitsPerPixel = visibleWorldHeight / Math.max(1, height);
      const withinScreenRadius = (localPosition: THREE.Vector3, radiusPx: number) => {
        systemPickWorldPosition.copy(localPosition).applyMatrix4(systemResources!.root.matrixWorld);
        systemPickProjectedPosition.copy(systemPickWorldPosition).project(camera);
        if (systemPickProjectedPosition.z < -1 || systemPickProjectedPosition.z > 1) return false;
        const dx = (systemPickProjectedPosition.x - pointer.x) * width * 0.5;
        const dy = (systemPickProjectedPosition.y - pointer.y) * height * 0.5;
        return dx * dx + dy * dy <= radiusPx * radiusPx;
      };
      const finishPick = (paperId: string) => {
        lastSystemPaperPickId = paperId;
        lastSystemPaperPickMs = performance.now() - pickStartedAt;
        paperPickSamples.push({ timestamp: performance.now(), value: lastSystemPaperPickMs });
        return paperId;
      };

      if (systemResources.representativeLayer) {
        raycaster.params.Points.threshold = THREE.MathUtils.clamp(
          worldUnitsPerPixel * APP17_SYSTEM_PAPER_PICK_RADIUS_PX,
          0.012,
          0.32,
        );
        raycaster.setFromCamera(pointer, camera);
        const representativeIntersections = raycaster.intersectObject(systemResources.representativeLayer.object, false);
        lastSystemPaperPickCandidateCount += representativeIntersections.length;
        for (const intersection of representativeIntersections) {
          const index = intersection.index ?? -1;
          const paper = index >= 0 ? systemResources.representativePapers[index] : undefined;
          if (!paper || !withinScreenRadius(paper.position, APP17_SYSTEM_PAPER_PICK_RADIUS_PX)) continue;
          if (systemResources.star.getVisualState().depthOcclusionActive && isSystemPaperOccludedByStar(paper.position, systemResources, camera)) continue;
          return finishPick(paper.id);
        }
      }

      raycaster.params.Points.threshold = THREE.MathUtils.clamp(
        worldUnitsPerPixel * APP17_SYSTEM_ORDINARY_PAPER_PICK_RADIUS_PX,
        0.01,
        0.26,
      );
      raycaster.setFromCamera(pointer, camera);
      const ordinaryIntersections = raycaster.intersectObject(systemResources.cloudLayer.object, false);
      lastSystemPaperPickCandidateCount += ordinaryIntersections.length;
      for (const intersection of ordinaryIntersections) {
        const paper = systemResources.cloudLayer.getPaperByIndex(intersection.index ?? -1);
        if (!paper || !withinScreenRadius(paper.position, APP17_SYSTEM_ORDINARY_PAPER_PICK_RADIUS_PX)) continue;
        if (systemResources.star.getVisualState().depthOcclusionActive && isSystemPaperOccludedByStar(paper.position, systemResources, camera)) continue;
        return finishPick(paper.id);
      }
      return finishPick("");
    };

    const applySystemPaperHover = (paperId: string) => {
      if (hoveredSystemPaperId === paperId) return;
      hoveredSystemPaperId = paperId;
      renderer.domElement.style.cursor = paperId ? "pointer" : "grab";
      invalidate(true);
    };

    const pickPaperInspectionVisual = () => {
      if (paperFocus.state !== "focused" || paperInspection.blend < 0.65 || !paperInspectionVisual.object.visible) return false;
      raycaster.setFromCamera(pointer, camera);
      return raycaster.intersectObject(paperInspectionVisual.hitObject, false).length > 0;
    };

    const scheduleSystemPaperHoverPick = () => {
      if (systemHoverPickTimer) return;
      const remaining = Math.max(0, APP17_SYSTEM_PAPER_PICK_INTERVAL_MS - (performance.now() - lastSystemPaperPickAt));
      systemHoverPickTimer = window.setTimeout(() => {
        systemHoverPickTimer = 0;
        if (disposed || !runtimeActive || document.visibilityState === "hidden" || exploration.state !== "system" || orbit.pointerPressed) return;
        applySystemPaperHover(pickSystemPaper(true));
      }, remaining);
    };

    const scheduleAutoRotateResume = (now = performance.now()) => {
      if (exploration.state !== "overview" || orbit.viewMode !== "overview" || !sceneData.camera.autoRotate) return;
      clearAutoResumeTimer();
      orbit.pauseUntil = now + APP17_INTERACTION_PAUSE_MS;
      autoResumeTimer = window.setTimeout(() => {
        autoResumeTimer = 0;
        invalidate(true);
      }, APP17_INTERACTION_PAUSE_MS);
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (exploration.state === "preparing" || exploration.state === "entering" || exploration.state === "exiting") return;
      if (paperFocus.state === "entering" || paperFocus.state === "exiting") return;
      if (event.button !== 0 || orbit.pointerPressed) return;
      if (systemHoverPickTimer) {
        window.clearTimeout(systemHoverPickTimer);
        systemHoverPickTimer = 0;
      }
      updatePointer(event);
      orbit.pointerPressed = true;
      orbit.dragging = false;
      orbit.startX = event.clientX;
      orbit.startY = event.clientY;
      orbit.lastX = event.clientX;
      orbit.lastY = event.clientY;
      const inspectionHit = exploration.state === "system" && pickPaperInspectionVisual();
      pressedTargetKind = inspectionHit ? "inspection" : exploration.state === "system" ? "paper" : "hotspot";
      pressedTargetId = inspectionHit
        ? paperFocus.targetId
        : pressedTargetKind === "paper" ? pickSystemPaper(true) : pickHotspot();
      renderer.domElement.setPointerCapture(event.pointerId);
      renderer.domElement.style.cursor = pressedTargetId ? "pointer" : "grab";
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (exploration.state === "preparing" || exploration.state === "entering" || exploration.state === "exiting") return;
      if (paperFocus.state === "entering" || paperFocus.state === "exiting") return;
      updatePointer(event);
      if (orbit.pointerPressed) {
        if (!orbit.dragging) {
          const travel = Math.hypot(event.clientX - orbit.startX, event.clientY - orbit.startY);
          if (travel <= APP17_DRAG_THRESHOLD) return;
          orbit.dragging = true;
          pressedTargetId = "";
          clearAutoResumeTimer();
          pendingWheelDelta = 0;
          cancelOrbitMotion(orbit);
          lastInteractionTime = performance.now();
          orbit.lastX = event.clientX;
          orbit.lastY = event.clientY;
          renderer.domElement.style.cursor = "grabbing";
          invalidate(true);
          return;
        }
        lastInteractionTime = performance.now();
        const dx = event.clientX - orbit.lastX;
        const dy = event.clientY - orbit.lastY;
        orbit.lastX = event.clientX;
        orbit.lastY = event.clientY;
        orbit.azimuth -= dx * 0.0045;
        orbit.elevation = THREE.MathUtils.clamp(
          orbit.elevation + dy * 0.0022,
          sceneData.camera.minElevation,
          sceneData.camera.maxElevation,
        );
        invalidate(true);
        return;
      }
      if (exploration.state === "system" && pickPaperInspectionVisual()) {
        if (hoveredSystemPaperId) hoveredSystemPaperId = "";
        renderer.domElement.style.cursor = "pointer";
        return;
      }
      if (exploration.state === "system" && performance.now() - lastSystemPaperPickAt < APP17_SYSTEM_PAPER_PICK_INTERVAL_MS) {
        scheduleSystemPaperHoverPick();
        return;
      }
      const nextHoverId = exploration.state === "system" ? pickSystemPaper(true) : pickHotspot();
      const currentHoverId = exploration.state === "system" ? hoveredSystemPaperId : hoverIdRef.current;
      if (currentHoverId !== nextHoverId) {
        if (exploration.state === "system") hoveredSystemPaperId = nextHoverId;
        else hoverIdRef.current = nextHoverId;
        renderer.domElement.style.cursor = nextHoverId ? "pointer" : "grab";
        invalidate(true);
      }
    };

    const handlePointerUp = (event: PointerEvent) => {
      updatePointer(event);
      if (!orbit.pointerPressed) return;
      const wasDragging = orbit.dragging;
      const targetId = pressedTargetId;
      const targetKind = pressedTargetKind;
      orbit.pointerPressed = false;
      orbit.dragging = false;
      pressedTargetId = "";
      if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId);
      const releaseOnInspection = exploration.state === "system" && pickPaperInspectionVisual();
      const releaseHoverId = releaseOnInspection ? "" : exploration.state === "system" ? pickSystemPaper(true) : pickHotspot();
      if (exploration.state === "system") hoveredSystemPaperId = releaseHoverId;
      else hoverIdRef.current = releaseHoverId;
      renderer.domElement.style.cursor = releaseHoverId ? "pointer" : "grab";
      if (wasDragging) {
        const now = performance.now();
        lastPointerDragEndedAt = now;
        lastInteractionTime = now;
        scheduleAutoRotateResume(now);
        invalidate(true);
        return;
      }
      invalidate(true);
      if (targetKind === "inspection") {
        const now = performance.now();
        if (targetId && now - lastInspectionToggleAt > 350) {
          lastInspectionToggleAt = now;
          togglePaperInspection(now);
        }
        return;
      }
      if (targetKind === "paper") {
        onSelectPaperRef.current?.(targetId);
        return;
      }
      if (targetId) onSelectRef.current(targetId);
      else onClearSelectionRef.current();
    };

    const handlePointerCancel = (event: PointerEvent) => {
      if (!orbit.pointerPressed) return;
      const wasDragging = orbit.dragging;
      orbit.pointerPressed = false;
      orbit.dragging = false;
      pressedTargetId = "";
      if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId);
      renderer.domElement.style.cursor = "grab";
      if (wasDragging) {
        const now = performance.now();
        lastPointerDragEndedAt = now;
        lastInteractionTime = now;
        scheduleAutoRotateResume(now);
      }
      invalidate(true);
    };

    const handleDoubleClick = (event: MouseEvent) => {
      if (
        exploration.state !== "system"
        || paperFocus.state === "entering"
        || paperFocus.state === "exiting"
        || orbit.pointerPressed
        || orbit.dragging
        || performance.now() - lastPointerDragEndedAt < 350
      ) return;
      updatePointer(event);
      if (pickPaperInspectionVisual()) {
        event.preventDefault();
        return;
      }
      const paperId = pickSystemPaper(true);
      if (!paperId) return;
      event.preventDefault();
      selectedPaperIdRef.current = paperId;
      hoveredSystemPaperId = paperId;
      onSelectPaperRef.current?.(paperId);
      focusPaperById(paperId, performance.now());
      invalidate(true);
    };

    const handlePointerLeave = () => {
      if (systemHoverPickTimer) {
        window.clearTimeout(systemHoverPickTimer);
        systemHoverPickTimer = 0;
      }
      if (!orbit.pointerPressed && (hoverIdRef.current || hoveredSystemPaperId)) {
        if (exploration.state === "system") hoveredSystemPaperId = "";
        else hoverIdRef.current = "";
        invalidate(true);
      }
      renderer.domElement.style.cursor = "grab";
    };

    const normalizeWheelDelta = (event: WheelEvent) => {
      const pixelDelta = event.deltaMode === 1
        ? event.deltaY * APP17_WHEEL_LINE_PIXELS
        : event.deltaMode === 2
          ? event.deltaY * Math.max(1, height)
          : event.deltaY;
      return THREE.MathUtils.clamp(
        pixelDelta,
        -APP17_WHEEL_MAX_PIXEL_DELTA,
        APP17_WHEEL_MAX_PIXEL_DELTA,
      );
    };

    const applyPendingWheelZoom = () => {
      if (Math.abs(pendingWheelDelta) < 0.001) return false;
      const normalizedDelta = THREE.MathUtils.clamp(
        pendingWheelDelta,
        -APP17_WHEEL_MAX_PIXEL_DELTA,
        APP17_WHEEL_MAX_PIXEL_DELTA,
      );
      pendingWheelDelta = 0;
      const minDistance = exploration.state === "system"
        ? systemViewMode === "paper-focus" ? APP17_SYSTEM_PAPER_FOCUS_MIN_DISTANCE : APP17_SYSTEM_MIN_DISTANCE
        : sceneData.camera.minDistance;
      const maxDistance = exploration.state === "system"
        ? systemViewMode === "paper-focus" ? APP17_SYSTEM_PAPER_FOCUS_MAX_DISTANCE : APP17_SYSTEM_MAX_DISTANCE
        : sceneData.camera.maxDistance;
      const previousTargetDistance = orbit.targetDistance;
      const nextTargetDistance = THREE.MathUtils.clamp(
        previousTargetDistance * Math.exp(normalizedDelta * APP17_WHEEL_SENSITIVITY),
        minDistance,
        maxDistance,
      );
      orbit.targetDistance = nextTargetDistance;
      lastNormalizedWheelDelta = normalizedDelta;
      lastWheelDistanceRatio = previousTargetDistance > 0
        ? nextTargetDistance / previousTargetDistance - 1
        : 0;
      return Math.abs(nextTargetDistance - previousTargetDistance) > 0.0001;
    };

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (exploration.state === "preparing" || exploration.state === "entering" || exploration.state === "exiting") return;
      if (paperFocus.state === "entering" || paperFocus.state === "exiting") return;
      const now = performance.now();
      lastInteractionTime = now;
      scheduleAutoRotateResume(now);
      cancelOrbitTransition(orbit);
      pendingWheelDelta = THREE.MathUtils.clamp(
        pendingWheelDelta + normalizeWheelDelta(event),
        -APP17_WHEEL_MAX_PIXEL_DELTA,
        APP17_WHEEL_MAX_PIXEL_DELTA,
      );
      invalidate(true);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || exploration.state === "overview") return;
      event.preventDefault();
      if (exploration.state === "system" && paperFocus.state === "exiting") {
        return;
      }
      if (exploration.state === "system" && paperFocus.state !== "idle" && savedSystemPose) {
        returnToSystemCenter(performance.now());
      } else {
        beginExitSystem(performance.now());
      }
      invalidate(true);
    };

    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.addEventListener("pointermove", handlePointerMove);
    renderer.domElement.addEventListener("pointerup", handlePointerUp);
    renderer.domElement.addEventListener("pointercancel", handlePointerCancel);
    renderer.domElement.addEventListener("pointerleave", handlePointerLeave);
    renderer.domElement.addEventListener("dblclick", handleDoubleClick);
    renderer.domElement.addEventListener("wheel", handleWheel, { passive: false });
    window.addEventListener("keydown", handleKeyDown);

    function render(now: number) {
      frameId = 0;
      if (disposed || !runtimeActive || document.visibilityState === "hidden") return;

      if (commandNonceRef.current !== commandRef.current.nonce) {
        commandNonceRef.current = commandRef.current.nonce;
        clearAutoResumeTimer();
        pendingWheelDelta = 0;
        if (commandRef.current.kind === "enter-system") {
          beginEnterSystem(now);
        } else if (commandRef.current.kind === "exit-system") {
          beginExitSystem(now);
        } else if (commandRef.current.kind === "focus-paper") {
          focusPaperById(selectedPaperIdRef.current, now);
        } else if (commandRef.current.kind === "return-system-center") {
          returnToSystemCenter(now);
        } else if (commandRef.current.kind === "toggle-paper-inspection") {
          togglePaperInspection(now);
        } else if (commandRef.current.kind === "reset-system") {
          resetSystemView(now);
        } else if (exploration.state !== "overview") {
          beginExitSystem(now);
        } else if (commandRef.current.kind === "top") {
          orbit.viewMode = "top";
          startOrbitTransition(
            orbit,
            "top",
            sceneData.camera.center,
            sceneData.camera.topDistance,
            sceneData.camera.topAzimuth,
            sceneData.camera.topElevation,
            now,
          );
        } else if (commandRef.current.kind === "fit") {
          orbit.viewMode = "overview";
          orbit.pauseUntil = 0;
          startOrbitTransition(
            orbit,
            "fit",
            sceneData.camera.center,
            sceneData.camera.fitDistance,
            sceneData.camera.fitAzimuth,
            sceneData.camera.fitElevation,
            now,
          );
        } else {
          orbit.viewMode = "overview";
          orbit.pauseUntil = 0;
          startOrbitTransition(
            orbit,
            "reset",
            sceneData.camera.center,
            sceneData.camera.distance,
            sceneData.camera.azimuth,
            sceneData.camera.elevation,
            now,
          );
        }
        renderRequested = true;
        labelDirty = true;
      }

      applyPendingWheelZoom();

      const transitioningBefore = orbit.transition !== null || paperDirectFlight !== null;
      const zoomingBefore = orbitZoomActive(orbit);
      const fullscreenTransitioningBefore = fullscreenTransition !== null;
      const inspectionTransitioningBefore = paperInspection.dockTransition !== null || paperInspection.panelTransition !== null;
      const ambientSteadyActiveBefore = !reduceMotion && exploration.state === "system";
      const environmentAnimationActiveBefore = !reduceMotion
        && (fullscreenBlend > 0.001 || fullscreenTransition?.to === 1);
      const autoRotateActive =
        exploration.state === "overview"
        &&
        orbit.viewMode === "overview"
        && !orbit.dragging
        && !transitioningBefore
        && !zoomingBefore
        && sceneData.camera.autoRotate
        && now >= orbit.pauseUntil;
      const frameInterval = orbit.dragging || transitioningBefore || zoomingBefore || fullscreenTransitioningBefore || inspectionTransitioningBefore
        ? APP17_INTERACTION_FRAME_INTERVAL
        : autoRotateActive
          ? APP17_OVERVIEW_FRAME_INTERVAL
          : ambientSteadyActiveBefore
            ? sceneData.kind === "app14" ? APP17_APP14_AMBIENT_FRAME_INTERVAL : APP17_APP15_AMBIENT_FRAME_INTERVAL
            : environmentAnimationActiveBefore
              ? sceneData.kind === "app14" ? APP17_ENVIRONMENT_APP14_FRAME_INTERVAL : APP17_ENVIRONMENT_APP15_FRAME_INTERVAL
              : 0;

      if (
        !renderRequested
        && frameInterval > 0
        && lastRenderTime > 0
        && now - lastRenderTime < frameInterval - 0.5
      ) {
        scheduleFrame();
        return;
      }

      const rawElapsedMs = lastRenderTime > 0 ? Math.max(0, now - lastRenderTime) : 0;
      const elapsedMs = Math.min(64, rawElapsedMs);
      const ambientElapsedMs = Math.min(120, rawElapsedMs);
      const measuredTransition = orbit.transition;
      const measuredPaperFlight = paperDirectFlight;
      if (
        measuredTransition?.kind === "enter-system"
        || measuredTransition?.kind === "exit-system"
        || measuredPaperFlight !== null
      ) {
        const transitionFrameMs = lastTransitionRenderTime > 0 ? now - lastTransitionRenderTime : 0;
        if (transitionFrameMs > 0) transitionFrameTimes.push(transitionFrameMs);
        if (
          transitionFrameMs > 0
          && (measuredTransition?.kind === "enter-system" || measuredTransition?.kind === "exit-system")
          && measuredTransition.startedAt + measuredTransition.durationMs - now <= 500
        ) {
          transitionTailFrameTimes.push(transitionFrameMs);
        }
        if (measuredTransition?.kind === "enter-system" || measuredTransition?.kind === "exit-system" || measuredPaperFlight) {
          transitionMaxCanvasTopDelta = Math.max(
            transitionMaxCanvasTopDelta,
            Math.abs(renderer.domElement.getBoundingClientRect().top - transitionStartCanvasTop),
          );
          transitionMaxScrollDelta = Math.max(transitionMaxScrollDelta, Math.abs(window.scrollY - transitionStartScrollY));
        }
        lastTransitionRenderTime = now;
      }
      let orbitChanged = false;
      let ambientChanged = false;
      const ambientTimelineActive = !reduceMotion
        && exploration.state !== "overview"
        && exploration.state !== "preparing";
      const environmentTimelineActive = !reduceMotion
        && (fullscreenBlend > 0.001 || fullscreenTransition?.to === 1);
      if (environmentTimelineActive && ambientElapsedMs > 0) {
        environmentTimeSeconds += ambientElapsedMs / 1_000;
        environmentStarLayer.setAnimation(environmentTimeSeconds, fullscreenBlend);
        ambientChanged = true;
      } else if (renderRequested) {
        environmentStarLayer.setAnimation(environmentTimeSeconds, 0);
      }
      if (ambientTimelineActive && ambientElapsedMs > 0) {
        ambientTimeSeconds += ambientElapsedMs / 1_000;
        if (paperInspection.blend > 0.001 && !reduceMotion) {
          paperInspectionTimeSeconds += ambientElapsedMs / 1_000;
        }
        if (sceneData.kind === "app14") {
          farRotationAngle = (farRotationAngle + APP17_FAR_ROTATION_RADIANS_PER_SECOND * (ambientElapsedMs / 1_000)) % (Math.PI * 2);
        }
        applyAmbientVisuals();
        ambientChanged = true;
      } else if (renderRequested) {
        applyAmbientVisuals();
      }
      if (systemResources && exploration.state !== "overview" && exploration.state !== "preparing") {
        const selectedOrbitRank = systemResources.representativePapers.findIndex((paper) => paper.id === selectedPaperIdRef.current);
        const hoveredOrbitRank = systemResources.representativePapers.findIndex((paper) => paper.id === hoveredSystemPaperId);
        systemResources.cloudLayer.setSelectedOrdinaryPaper(
          selectedPaperIdRef.current && selectedOrbitRank < 0 ? selectedPaperIdRef.current : "",
        );
        systemResources.representativeLayer?.setRepresentativeFocus(selectedOrbitRank, hoveredOrbitRank);
        systemResources.representativeBloomLayer?.setRepresentativeFocus(selectedOrbitRank, hoveredOrbitRank);
        const frozenPaperIds = new Set(
          [selectedPaperIdRef.current, hoveredSystemPaperId, paperFocus.targetId].filter(Boolean),
        );
        const systemAnimationChanged = systemResources.updateAnimation(
          ambientTimelineActive ? ambientElapsedMs / 1_000 : 0,
          !reduceMotion,
          frozenPaperIds,
        );
        systemResources.orbitLayer?.setHighlight(selectedOrbitRank, hoveredOrbitRank);
        if (systemAnimationChanged) {
          ambientChanged = true;
          if (selectedPaperIdRef.current || hoveredSystemPaperId) labelDirty = true;
        }
      }
      if (paperInspection.panelTransition && now >= paperInspection.panelTransition.startedAt) {
        const panelProgress = THREE.MathUtils.clamp(
          (now - paperInspection.panelTransition.startedAt) / paperInspection.panelTransition.durationMs,
          0,
          1,
        );
        const enteringPanel = paperInspection.panelTransition.to > paperInspection.panelTransition.from;
        if (enteringPanel && paperInspection.panelState === "hidden") {
          setPaperInspectionMode("docked");
          setPaperPanelState("entering");
        }
        paperInspection.panelProgress = THREE.MathUtils.lerp(
          paperInspection.panelTransition.from,
          paperInspection.panelTransition.to,
          smootherStep(panelProgress),
        );
        if (!enteringPanel) {
          paperComposition.panelHeaderProgress = paperInspection.panelProgress;
          paperComposition.panelBodyProgress = paperInspection.panelProgress;
        }
        if (paperInspection.mode !== "centered") paperInspection.dockBlend = paperInspection.panelProgress;
        orbitChanged = true;
        labelDirty = true;
        if (panelProgress >= 1) {
          paperInspection.panelTransition = null;
          if (enteringPanel) setPaperPanelState("visible");
          else {
            paperInspection.panelProgress = 0;
            paperInspection.dockBlend = 0;
            setPaperPanelState("hidden");
          }
        }
      }
      if (paperInspection.dockTransition) {
        const dockProgress = THREE.MathUtils.clamp(
          (now - paperInspection.dockTransition.startedAt) / paperInspection.dockTransition.durationMs,
          0,
          1,
        );
        paperInspection.dockBlend = THREE.MathUtils.lerp(
          paperInspection.dockTransition.from,
          paperInspection.dockTransition.to,
          smootherStep(dockProgress),
        );
        orbitChanged = true;
        labelDirty = true;
        if (dockProgress >= 1) paperInspection.dockTransition = null;
      }
      if (paperDirectFlight) {
        advancePaperDirectFlight(now);
        orbitChanged = true;
        labelDirty = true;
      }
      if (orbit.transition) {
        const activeTransition = orbit.transition;
        if (activeTransition.kind === "enter-system" || activeTransition.kind === "exit-system") {
          const progress = THREE.MathUtils.clamp((now - activeTransition.startedAt) / activeTransition.durationMs, 0, 1);
          const eased = smootherStep(progress);
          applyExplorationBlend(THREE.MathUtils.lerp(exploration.fromBlend, exploration.toBlend, eased));
        }
        if (
          paperFocus.state !== "idle"
          && (
            activeTransition.kind === "reset-system"
            || activeTransition.kind === "exit-system"
          )
        ) {
          const progress = THREE.MathUtils.clamp((now - activeTransition.startedAt) / activeTransition.durationMs, 0, 1);
          const eased = smootherStep(progress);
          paperFocus.flightStrength = Math.sin(Math.PI * eased);
          applyPaperFocusBlend(THREE.MathUtils.lerp(paperFocus.fromBlend, paperFocus.toBlend, eased));
        }
        const completed = advanceOrbitTransition(orbit, now);
        orbitChanged = true;
        if (completed && activeTransition.kind === "enter-system") {
          lastFocusTransitionMs = Math.max(0, now - activeTransition.startedAt);
          lastTransitionP95Ms = percentileNumber(transitionFrameTimes, 0.95);
          lastTransitionLongFrames50 = transitionFrameTimes.filter((value) => value > 50).length;
          lastTransitionTailP95Ms = percentileNumber(transitionTailFrameTimes, 0.95);
          lastTransitionTailLongFrames50 = transitionTailFrameTimes.filter((value) => value > 50).length;
          applyExplorationBlend(1);
          setExplorationState("system", true);
          flushDeferredRepresentativeUpdate();
        } else if (completed && activeTransition.kind === "reset-system") {
          if (paperFocus.state !== "idle") finishPaperFocusReset();
          else setSystemViewMode("system");
        } else if (completed && activeTransition.kind === "exit-system") {
          lastTransitionP95Ms = percentileNumber(transitionFrameTimes, 0.95);
          lastTransitionLongFrames50 = transitionFrameTimes.filter((value) => value > 50).length;
          lastTransitionTailP95Ms = percentileNumber(transitionTailFrameTimes, 0.95);
          lastTransitionTailLongFrames50 = transitionTailFrameTimes.filter((value) => value > 50).length;
          applyExplorationBlend(0);
          orbit.viewMode = exploration.savedOverviewViewMode;
          orbit.pauseUntil = exploration.savedOverviewPauseUntil;
          if (orbit.viewMode === "overview" && sceneData.camera.autoRotate && orbit.pauseUntil > now) {
            clearAutoResumeTimer();
            autoResumeTimer = window.setTimeout(() => {
              autoResumeTimer = 0;
              invalidate(true);
            }, orbit.pauseUntil - now);
          }
          exploration.savedOverviewPose = null;
          exploration.selectedTopicKey = "";
          ambientTimeSeconds = 0;
          farRotationAngle = 0;
          lastAmbientRenderTime = 0;
          applyAmbientVisuals();
          hoveredSystemPaperId = "";
          finishPaperFocusReset();
          onSelectPaperRef.current?.("");
          setExplorationState("overview", true);
          flushDeferredRepresentativeUpdate();
        }
      } else if (advanceOrbitZoom(orbit, elapsedMs)) {
        orbitChanged = true;
      }
      if (autoRotateActive) {
        orbit.azimuth += sceneData.camera.autoRotateAzimuthStep * (elapsedMs / 50);
        orbit.targetDistance = orbit.distance;
        orbitChanged = true;
      }
      const projectionChanged = applyFullscreenVisuals(now);
      if (projectionChanged) labelDirty = true;
      const webglRenderNeeded = renderRequested
        || orbitChanged
        || ambientChanged
        || projectionChanged
        || orbit.dragging
        || selectionPendingFrameRef.current;

      if (webglRenderNeeded) {
        applyRuntimeCamera();
        if (paperFocus.state !== "idle") {
          updatePaperInspectionHandoff();
          applyPaperFocusBlend(paperFocus.blend);
        }
        environmentStarLayer.setCenter(camera.position);
        overviewRoot.updateMatrixWorld();
        root.updateMatrixWorld();
        systemResources?.root.updateMatrixWorld();
        if (systemResources) {
          const inspectionVisual = resolveSystemPaperVisual(paperFocus.targetId);
          const inspectionWorldPosition = inspectionVisual?.position.clone().applyMatrix4(systemResources.root.matrixWorld);
          if (inspectionWorldPosition && paperFocus.state !== "idle") {
            const inspectionProjection = inspectionWorldPosition.clone().project(camera);
            paperComposition.anchorErrorPx = Math.abs(
              inspectionProjection.x - paperComposition.currentAnchorNdcX,
            ) * width * 0.5;
          } else {
            paperComposition.anchorErrorPx = 0;
          }
          const projectedDiameterOverride = (
            paperVisualHandoff.cameraTakeoverPending
            || paperVisualHandoff.state === "return-hold"
          ) && paperVisualHandoff.lockedProjectedDiameter > 0
            ? paperVisualHandoff.lockedProjectedDiameter
            : undefined;
          paperInspectionVisual.setVisual({
            worldPosition: inspectionWorldPosition,
            camera,
            viewportWidth: width,
            viewportHeight: height,
            inspectionBlend: paperInspection.blend,
            projectedDiameterOverride,
            dockBlend: paperInspection.dockBlend,
            centered: paperInspection.mode === "centered",
            fullscreen: fullscreenRef.current,
            wideLayout: window.innerWidth >= 1280,
            timeSeconds: paperInspectionTimeSeconds,
            motionStrength: reduceMotion ? 0 : 1,
          });
          const inspectionVisualState = paperInspectionVisual.getVisualState();
          if (
            paperVisualHandoff.cameraTakeoverPending
            && paperComposition.cameraWriter === "paper-composition"
          ) {
            paperVisualHandoff.cameraTakeoverPending = false;
          }
          lastPaperAngularGrowthRatio = lastPaperAngularSizeRatio > 0 && inspectionVisualState.viewportRatio > 0
            ? inspectionVisualState.viewportRatio / lastPaperAngularSizeRatio - 1
            : 0;
          lastPaperAngularSizeRatio = inspectionVisualState.viewportRatio;
          paperFocus.targetScreenSize = inspectionVisualState.projectedDiameter
            || paperFocus.targetScreenSize;
          systemResources.cloudLayer.setLodDistance(orbit.distance);
          systemResources.representativeLayer?.setLodDistance(orbit.distance);
          const starProjectionChanged = systemResources.star.updateProjection(camera, width, height);
          const starVisualState = systemResources.star.getVisualState();
          systemResources.orbitLayer?.setCloseupAttenuation(
            1 - smoothStepRange(0.65, 0.9, starVisualState.viewportRatio) * 0.2,
          );
          if (starProjectionChanged) labelDirty = true;
          systemCenterViewPosition
            .setFromMatrixPosition(systemResources.root.matrixWorld)
            .applyMatrix4(camera.matrixWorldInverse);
          systemResources.root.getWorldScale(systemWorldScale);
          const systemDepthStrength = smoothStepRange(0.62, 1, exploration.blend);
          const systemDepthRange = APP17_SYSTEM_RADIUS * Math.max(
            systemWorldScale.x,
            systemWorldScale.y,
            systemWorldScale.z,
          );
          const systemCenterViewDepth = -systemCenterViewPosition.z;
          systemResources.cloudLayer.setSystemDepthCue(
            systemCenterViewDepth,
            systemDepthRange,
            systemDepthStrength,
          );
          systemResources.representativeLayer?.setSystemDepthCue(
            systemCenterViewDepth,
            systemDepthRange,
            systemDepthStrength,
          );
          systemResources.orbitLayer?.setDepthCue(
            systemCenterViewDepth,
            systemDepthRange,
            systemDepthStrength,
          );
        }
        updateEnvironmentEnvelope();
        if (exploration.state === "overview") {
          updateFocusSprite(
            focusSprite,
            hotspotById.get(selectedIdRef.current),
            root,
            camera,
            height,
            focusViewPosition,
          );
        } else if (exploration.state === "system" && systemResources) {
          const selectedPaper = systemResources.representativePapers.find((paper) => paper.id === selectedPaperIdRef.current);
          const selectedOrdinaryPaper = selectedPaper
            ? undefined
            : systemResources.cloudLayer.getPaperById(selectedPaperIdRef.current);
          if (paperInspection.blend > 0.08) focusSprite.visible = false;
          else {
            updateSystemPaperFocusSprite(
              focusSprite,
              selectedPaper?.position ?? selectedOrdinaryPaper?.position,
              systemResources.root,
              camera,
              height,
              focusViewPosition,
              selectedPaper ? 30 : 28,
            );
          }
        } else {
          focusSprite.visible = false;
        }
        const measurePerformance = ensureDiagnosticsActive(now);
        const webglStartedAt = measurePerformance ? performance.now() : 0;
        const bloomMode = getEffectiveBloomMode();
        const bloomParameters = getBloomParameters(bloomMode);
        renderer.info.reset();
        camera.layers.set(0);
        renderer.setRenderTarget(null);
        renderer.render(scene, camera);
        const bloomStartedAt = measurePerformance && bloomMode !== "none" ? performance.now() : 0;
        if (bloomMode !== "none" && bloomPipeline) {
          try {
            bloomPipeline.renderOverlay(bloomParameters);
          } catch (error) {
            bloomAvailable = false;
            bloomUnavailableReason = `局部辉光渲染失败：${String(error)}`;
            onBloomAvailabilityChangeRef.current?.(false, bloomUnavailableReason);
          }
        }
        if (measurePerformance && bloomStartedAt > 0) {
          bloomSamples.push({ timestamp: now, value: performance.now() - bloomStartedAt });
        }
        const systemAmbientSteadyActive = !reduceMotion
          && exploration.state === "system"
          && !orbit.dragging
          && !orbit.transition
          && !paperDirectFlight
          && !orbitZoomActive(orbit)
          && fullscreenTransition === null;
        const environmentSteadyActive = !reduceMotion
          && fullscreenBlend > 0.001
          && !orbit.dragging
          && !orbit.transition
          && !paperDirectFlight
          && !orbitZoomActive(orbit)
          && fullscreenTransition === null;
        if (systemAmbientSteadyActive || environmentSteadyActive) {
          const ambientInterval = sceneData.kind === "app14"
            ? APP17_APP14_AMBIENT_FRAME_INTERVAL
            : APP17_APP15_AMBIENT_FRAME_INTERVAL;
          if (lastAmbientRenderTime > 0) {
            ambientCadenceSamples.push({
              timestamp: now,
              value: now - lastAmbientRenderTime > ambientInterval * 1.8 ? 1 : 0,
            });
          }
          lastAmbientRenderTime = now;
        } else {
          lastAmbientRenderTime = 0;
        }
        if (resumePendingFrame) {
          lastResumeToFirstFrameMs = Math.max(0, performance.now() - resumeRequestedAt);
          resumePendingFrame = false;
        }
        if (selectionPendingFrameRef.current) {
          lastSelectionToFirstFrameMs = Math.max(0, performance.now() - selectionRequestedAtRef.current);
          selectionPendingFrameRef.current = false;
        }
        if (measurePerformance) {
          const completedAt = performance.now();
          webglSamples.push({ timestamp: now, value: completedAt - webglStartedAt });
          if (lastMeasuredRenderTime > 0) frameSamples.push({ timestamp: now, value: now - lastMeasuredRenderTime });
          lastMeasuredRenderTime = now;
        }
        lastRenderTime = now;
        if (autoRotateActive || orbit.dragging || orbitChanged) labelDirty = true;
      }

      if (labelDirty && now - lastLabelRenderTime >= APP17_LABEL_FRAME_INTERVAL) {
        const measurePerformance = ensureDiagnosticsActive(now);
        const labelStartedAt = measurePerformance ? performance.now() : 0;
        if (exploration.blend > 0.55 && systemResources) {
          drawSystemLabels(
            labelCanvas!,
            camera,
            systemResources,
            payload.hotspots.find((hotspot) => hotspot.id === systemResources?.hotspotId)?.title ?? "热点星系",
            selectedPaperIdRef.current,
            hoveredSystemPaperId,
            paperInspection.blend > 0.08,
            width,
            height,
          );
        } else {
          drawLabels(
            labelCanvas!,
            camera,
            root,
            sceneData,
            rankedHotspots,
            hotspotById,
            labelTextById,
            selectedIdRef.current,
            hoverIdRef.current,
            orbit.distance,
            exploration.blend,
            width,
            height,
          );
        }
        if (measurePerformance) labelSamples.push({ timestamp: now, value: performance.now() - labelStartedAt });
        labelDirty = false;
        lastLabelRenderTime = now;
      }

      renderRequested = false;
      const ambientSteadyActiveAfter = !reduceMotion && exploration.state === "system";
      const environmentAnimationActiveAfter = !reduceMotion && fullscreenBlend > 0.001;
      if (
        autoRotateActive
        || ambientSteadyActiveAfter
        || environmentAnimationActiveAfter
        || orbit.dragging
        || orbit.transition
        || paperDirectFlight
        || orbitZoomActive(orbit)
        || fullscreenTransition
        || paperInspection.dockTransition
        || paperInspection.panelTransition
        || labelDirty
      ) scheduleFrame();
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        if (frameId) cancelAnimationFrame(frameId);
        frameId = 0;
        lastAmbientRenderTime = 0;
        pauseTimeline();
        return;
      }
      if (!runtimeActive) return;
      resumeTimeline();
      lastRenderTime = 0;
      lastAmbientRenderTime = 0;
      invalidate(true);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    scheduleSystemPreparation(selectedIdRef.current, false);
    invalidate(true);

    return () => {
      disposed = true;
      if (frameId) cancelAnimationFrame(frameId);
      clearAutoResumeTimer();
      if (systemHoverPickTimer) window.clearTimeout(systemHoverPickTimer);
      if (diagnosticsTimer) window.clearInterval(diagnosticsTimer);
      invalidateRef.current = null;
      refreshSystemRef.current = null;
      prepareSystemRef.current = null;
      resetDiagnosticsRef.current = null;
      activeControllerRef.current = null;
      fullscreenControllerRef.current = null;
      inspectionMetadataControllerRef.current = null;
      cancelScheduledPreparation(false);
      cancelRepresentativeUpdate();
      resizeObserver.disconnect();
      reducedMotionMedia.removeEventListener("change", handleReducedMotionChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      renderer.domElement.removeEventListener("pointerup", handlePointerUp);
      renderer.domElement.removeEventListener("pointercancel", handlePointerCancel);
      renderer.domElement.removeEventListener("pointerleave", handlePointerLeave);
      renderer.domElement.removeEventListener("dblclick", handleDoubleClick);
      renderer.domElement.removeEventListener("wheel", handleWheel);
      window.removeEventListener("keydown", handleKeyDown);
      hostElement.removeChild(renderer.domElement);
      paperLayer.dispose();
      hotspotLayer.dispose();
      orbitLayer?.dispose();
      scene.remove(environmentStarLayer.object);
      environmentStarLayer.dispose();
      focusSprite.material.dispose();
      (focusSprite.material.map as THREE.Texture | null)?.dispose();
      scene.remove(paperInspectionVisual.object);
      paperInspectionVisual.dispose();
      const disposedSystems = new Set<GalaxySystemResources>();
      systemCache.forEach((resources) => {
        if (disposedSystems.has(resources)) return;
        disposedSystems.add(resources);
        scene.remove(resources.root);
        resources.dispose();
      });
      systemCache.clear();
      bloomPipeline?.dispose();
      renderer.dispose();
    };
  }, [sceneData]);

  return (
    <>
      <div className="reference-galaxy-backdrop" />
      <div ref={containerRef} className="reference-galaxy-canvas-host" />
      <canvas ref={labelCanvasRef} className="app17-galaxy-label-canvas" />
      <div className="reference-galaxy-vignette" />
    </>
  );
}

function createGalaxyBloomPipeline(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
) {
  const bloomRenderTarget = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    depthBuffer: true,
    stencilBuffer: false,
  });
  const bloomComposer = new EffectComposer(renderer, bloomRenderTarget);
  bloomComposer.renderToScreen = false;
  bloomComposer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0, 0, 1);
  bloomComposer.addPass(bloomPass);

  const overlayScene = new THREE.Scene();
  const overlayCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const overlayGeometry = new THREE.PlaneGeometry(2, 2);
  const overlayMaterial = new THREE.ShaderMaterial({
    uniforms: {
      bloomTexture: { value: bloomComposer.renderTarget2.texture },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D bloomTexture;
      varying vec2 vUv;
      void main() {
        vec3 bloom = texture2D(bloomTexture, vUv).rgb;
        gl_FragColor = vec4(bloom, 1.0);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const overlayQuad = new THREE.Mesh(overlayGeometry, overlayMaterial);
  overlayQuad.frustumCulled = false;
  overlayScene.add(overlayQuad);

  return {
    setSize: (width: number, height: number, basePixelRatio: number) => {
      const bloomPixelRatio = Math.min(1, basePixelRatio * APP17_BLOOM_RESOLUTION_SCALE);
      bloomComposer.setPixelRatio(bloomPixelRatio);
      bloomComposer.setSize(width, height);
      return bloomPixelRatio;
    },
    renderOverlay: (parameters: { threshold: number; strength: number; radius: number }) => {
      bloomPass.threshold = parameters.threshold;
      bloomPass.strength = parameters.strength;
      bloomPass.radius = parameters.radius;
      const previousMask = camera.layers.mask;
      const previousAutoClear = renderer.autoClear;
      try {
        camera.layers.set(APP17_BLOOM_LAYER);
        bloomComposer.render();
        renderer.setRenderTarget(null);
        renderer.autoClear = false;
        renderer.render(overlayScene, overlayCamera);
      } finally {
        renderer.autoClear = previousAutoClear;
        camera.layers.mask = previousMask;
        renderer.setRenderTarget(null);
      }
    },
    prewarm: (parameters: { threshold: number; strength: number; radius: number }) => {
      bloomPass.threshold = parameters.threshold;
      bloomPass.strength = parameters.strength;
      bloomPass.radius = parameters.radius;
      const previousMask = camera.layers.mask;
      try {
        camera.layers.set(APP17_BLOOM_LAYER);
        bloomComposer.render();
      } finally {
        camera.layers.mask = previousMask;
        renderer.setRenderTarget(null);
      }
    },
    dispose: () => {
      bloomComposer.dispose();
      overlayGeometry.dispose();
      overlayMaterial.dispose();
      bloomPass.dispose();
    },
  };
}

function readWebglRendererInfo(renderer: THREE.WebGLRenderer) {
  const context = renderer.getContext();
  const extension = context.getExtension("WEBGL_debug_renderer_info") as {
    UNMASKED_VENDOR_WEBGL: number;
    UNMASKED_RENDERER_WEBGL: number;
  } | null;
  if (!extension) return { vendor: "不可用", renderer: "不可用" };
  try {
    return {
      vendor: String(context.getParameter(extension.UNMASKED_VENDOR_WEBGL) || "不可用"),
      renderer: String(context.getParameter(extension.UNMASKED_RENDERER_WEBGL) || "不可用"),
    };
  } catch {
    return { vendor: "不可用", renderer: "不可用" };
  }
}

function startOrbitTransition(
  orbit: App17OrbitState,
  kind: App17GalaxyCommand["kind"],
  center: THREE.Vector3,
  distance: number,
  azimuth: number,
  elevation: number,
  now: number,
  durationMs = APP17_COMMAND_TRANSITION_MS,
  centerControl?: THREE.Vector3,
  cameraPath?: { from: THREE.Vector3; to: THREE.Vector3; control: THREE.Vector3 },
  logarithmicDistance = false,
) {
  orbit.transition = {
    kind,
    startedAt: now,
    durationMs,
    from: {
      center: orbit.center.clone(),
      distance: orbit.distance,
      azimuth: orbit.azimuth,
      elevation: orbit.elevation,
    },
    to: {
      center: center.clone(),
      distance,
      azimuth,
      elevation,
    },
    centerControl: centerControl?.clone(),
    cameraFrom: cameraPath?.from.clone(),
    cameraTo: cameraPath?.to.clone(),
    cameraControl: cameraPath?.control.clone(),
    logarithmicDistance,
  };
  orbit.targetDistance = distance;
}

function captureOrbitPose(orbit: App17OrbitState): App17OrbitPose {
  return {
    center: orbit.center.clone(),
    distance: orbit.distance,
    azimuth: orbit.azimuth,
    elevation: orbit.elevation,
  };
}

function orbitPoseCameraPosition(pose: App17OrbitPose) {
  const horizontalDistance = pose.distance * Math.cos(pose.elevation);
  return new THREE.Vector3(
    pose.center.x + horizontalDistance * Math.cos(pose.azimuth),
    pose.center.y + horizontalDistance * Math.sin(pose.azimuth),
    pose.center.z + pose.distance * Math.sin(pose.elevation),
  );
}

function cloneOrbitPose(pose: App17OrbitPose): App17OrbitPose {
  return {
    center: pose.center.clone(),
    distance: pose.distance,
    azimuth: pose.azimuth,
    elevation: pose.elevation,
  };
}

function cameraQuaternionForTarget(position: THREE.Vector3, target: THREE.Vector3, up: THREE.Vector3) {
  const matrix = new THREE.Matrix4().lookAt(position, target, up);
  return new THREE.Quaternion().setFromRotationMatrix(matrix);
}

function cameraQuaternionForAnchoredTarget(
  position: THREE.Vector3,
  target: THREE.Vector3,
  camera: THREE.PerspectiveCamera,
  targetNdcX: number,
  targetNdcY: number,
) {
  if (Math.abs(targetNdcX) < 0.0001 && Math.abs(targetNdcY) < 0.0001) {
    return cameraQuaternionForTarget(position, target, camera.up);
  }
  const baseQuaternion = cameraQuaternionForTarget(position, target, camera.up);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(baseQuaternion).normalize();
  const localUp = new THREE.Vector3(0, 1, 0).applyQuaternion(baseQuaternion).normalize();
  const distance = Math.max(0.0001, position.distanceTo(target));
  const visibleWorldHeight = 2
    * distance
    * Math.tan(THREE.MathUtils.degToRad(camera.getEffectiveFOV()) * 0.5);
  const visibleWorldWidth = visibleWorldHeight * camera.aspect;
  const lookTarget = target.clone()
    .addScaledVector(right, -targetNdcX * visibleWorldWidth * 0.5)
    .addScaledVector(localUp, -targetNdcY * visibleWorldHeight * 0.5);
  return cameraQuaternionForTarget(position, lookTarget, camera.up);
}

function syncOrbitFromCamera(
  orbit: App17OrbitState,
  camera: THREE.PerspectiveCamera,
  center: THREE.Vector3,
) {
  const offset = camera.position.clone().sub(center);
  const distance = Math.max(0.0001, offset.length());
  orbit.center.copy(center);
  orbit.distance = distance;
  orbit.targetDistance = distance;
  orbit.azimuth = Math.atan2(offset.y, offset.x);
  orbit.elevation = Math.asin(THREE.MathUtils.clamp(offset.z / distance, -1, 1));
}

function projectedWorldDiameterPixels(
  worldPosition: THREE.Vector3,
  worldDiameter: number,
  camera: THREE.PerspectiveCamera,
  viewportHeight: number,
) {
  if (viewportHeight <= 0) return 0;
  const viewPosition = worldPosition.clone().applyMatrix4(camera.matrixWorldInverse);
  const viewDepth = -viewPosition.z;
  if (viewDepth <= camera.near) return 0;
  const effectiveFov = THREE.MathUtils.degToRad(camera.getEffectiveFOV());
  const visibleWorldHeight = 2 * viewDepth * Math.tan(effectiveFov * 0.5);
  return worldDiameter * viewportHeight / Math.max(0.0001, visibleWorldHeight);
}

function segmentPointMinimumDistance(start: THREE.Vector3, end: THREE.Vector3, point: THREE.Vector3) {
  const segment = end.clone().sub(start);
  const lengthSq = segment.lengthSq();
  if (lengthSq < 0.0000001) return start.distanceTo(point);
  const progress = THREE.MathUtils.clamp(point.clone().sub(start).dot(segment) / lengthSq, 0, 1);
  return start.clone().addScaledVector(segment, progress).distanceTo(point);
}

function quadraticBezierPoint(
  start: THREE.Vector3,
  control: THREE.Vector3,
  end: THREE.Vector3,
  progress: number,
  target = new THREE.Vector3(),
) {
  const inverse = 1 - progress;
  return target.copy(start).multiplyScalar(inverse * inverse)
    .addScaledVector(control, 2 * inverse * progress)
    .addScaledVector(end, progress * progress);
}

function buildQuadraticArcLengthTable(
  start: THREE.Vector3,
  control: THREE.Vector3,
  end: THREE.Vector3,
  samples: number,
) {
  const sampleCount = Math.max(8, samples);
  const table = new Float32Array(sampleCount + 1);
  const previous = start.clone();
  const current = new THREE.Vector3();
  let length = 0;
  for (let index = 1; index <= sampleCount; index += 1) {
    quadraticBezierPoint(start, control, end, index / sampleCount, current);
    length += current.distanceTo(previous);
    table[index] = length;
    previous.copy(current);
  }
  if (length > 0.000001) {
    for (let index = 1; index <= sampleCount; index += 1) table[index] /= length;
  }
  return table;
}

function sampleQuadraticByArcProgress(
  start: THREE.Vector3,
  control: THREE.Vector3,
  end: THREE.Vector3,
  table: Float32Array,
  progress: number,
) {
  const clamped = THREE.MathUtils.clamp(progress, 0, 1);
  let high = table.length - 1;
  let low = 0;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) * 0.5);
    if (table[middle] < clamped) low = middle;
    else high = middle;
  }
  const lowerLength = table[low];
  const upperLength = table[high];
  const segmentProgress = upperLength > lowerLength
    ? (clamped - lowerLength) / (upperLength - lowerLength)
    : 0;
  const t = (low + segmentProgress) / Math.max(1, table.length - 1);
  return quadraticBezierPoint(start, control, end, t);
}

function quadraticMinimumDistance(
  start: THREE.Vector3,
  control: THREE.Vector3,
  end: THREE.Vector3,
  point: THREE.Vector3,
  samples: number,
) {
  const sample = new THREE.Vector3();
  let minimum = Number.POSITIVE_INFINITY;
  for (let index = 0; index <= samples; index += 1) {
    quadraticBezierPoint(start, control, end, index / samples, sample);
    minimum = Math.min(minimum, sample.distanceTo(point));
  }
  return minimum;
}

function createPaperAvoidancePath(
  start: THREE.Vector3,
  end: THREE.Vector3,
  starCenter: THREE.Vector3,
  safeRadius: number,
  camera: THREE.PerspectiveCamera,
  samples: number,
) {
  const directClearance = segmentPointMinimumDistance(start, end, starCenter);
  if (safeRadius <= 0 || directClearance >= safeRadius) return null;
  const segment = end.clone().sub(start);
  const segmentLengthSq = Math.max(0.000001, segment.lengthSq());
  const closestProgress = THREE.MathUtils.clamp(
    starCenter.clone().sub(start).dot(segment) / segmentLengthSq,
    0.08,
    0.92,
  );
  const closestPoint = start.clone().addScaledVector(segment, closestProgress);
  const radial = closestPoint.clone().sub(starCenter);
  if (radial.lengthSq() < 0.000001) radial.set(1, 0, 0).applyQuaternion(camera.quaternion);
  radial.normalize();
  const midpoint = start.clone().lerp(end, 0.5);
  const influence = Math.max(0.12, 2 * closestProgress * (1 - closestProgress));
  const requiredOffset = (safeRadius - directClearance + safeRadius * 0.035) / influence;
  let fallbackControl = midpoint.clone().addScaledVector(radial, requiredOffset);
  let fallbackClearance = quadraticMinimumDistance(start, fallbackControl, end, starCenter, samples);
  let fallbackTable = buildQuadraticArcLengthTable(start, fallbackControl, end, samples);
  let safestControl: THREE.Vector3 | null = null;
  let safestClearance = 0;
  let safestLength = Number.POSITIVE_INFINITY;
  let safestTable: Float32Array | null = null;

  for (const direction of [1, -1]) {
    for (let step = 1; step <= 9; step += 1) {
      const offset = requiredOffset * (1 + (step - 1) * 0.22);
      const control = midpoint.clone().addScaledVector(radial, offset * direction);
      const minimumClearance = quadraticMinimumDistance(start, control, end, starCenter, samples);
      const table = buildQuadraticArcLengthTable(start, control, end, samples);
      const approximateLength = table.length > 1
        ? start.distanceTo(control) + control.distanceTo(end)
        : Number.POSITIVE_INFINITY;
      if (minimumClearance > fallbackClearance) {
        fallbackControl = control;
        fallbackClearance = minimumClearance;
        fallbackTable = table;
      }
      if (minimumClearance >= safeRadius && approximateLength < safestLength) {
        safestControl = control;
        safestClearance = minimumClearance;
        safestTable = table;
        safestLength = approximateLength;
      }
    }
  }
  return {
    controlPoint: safestControl ?? fallbackControl,
    arcLengthTable: safestTable ?? fallbackTable,
    minimumClearance: safestControl ? safestClearance : fallbackClearance,
  };
}

function samplePaperDirectFlightPosition(flight: GalaxyPaperDirectFlight, progress: number) {
  if (flight.pathMode === "avoidance" && flight.controlPoint && flight.arcLengthTable) {
    return sampleQuadraticByArcProgress(
      flight.startCameraPosition,
      flight.controlPoint,
      flight.endCameraPosition,
      flight.arcLengthTable,
      progress,
    );
  }
  if (flight.kind === "focus") {
    const direction = flight.startCameraPosition.clone().sub(flight.paperWorldPosition).normalize();
    const distance = Math.exp(THREE.MathUtils.lerp(
      Math.log(Math.max(0.0001, flight.startDistance)),
      Math.log(Math.max(0.0001, flight.targetDistance)),
      progress,
    ));
    return flight.paperWorldPosition.clone().addScaledVector(direction, distance);
  }
  return flight.startCameraPosition.clone().lerp(flight.endCameraPosition, progress);
}

function paperInspectionTargetDistance(camera: THREE.PerspectiveCamera, targetViewportRatio: number) {
  const effectiveFov = THREE.MathUtils.degToRad(camera.getEffectiveFOV());
  const distance = APP17_PAPER_INSPECTION_WORLD_DIAMETER
    / Math.max(0.001, 2 * Math.tan(effectiveFov * 0.5) * targetViewportRatio);
  return THREE.MathUtils.clamp(
    distance,
    APP17_SYSTEM_PAPER_FOCUS_MIN_DISTANCE,
    APP17_SYSTEM_PAPER_FOCUS_MAX_DISTANCE,
  );
}

function applyCameraOrbit(camera: THREE.PerspectiveCamera, orbit: App17OrbitState) {
  camera.up.set(0, 0, 1);
  const horizontalDistance = orbit.distance * Math.cos(orbit.elevation);
  camera.position.set(
    orbit.center.x + horizontalDistance * Math.cos(orbit.azimuth),
    orbit.center.y + horizontalDistance * Math.sin(orbit.azimuth),
    orbit.center.z + orbit.distance * Math.sin(orbit.elevation),
  );
  camera.lookAt(orbit.center);
  camera.updateMatrixWorld();
}

function lerpAngle(current: number, target: number, amount: number) {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + delta * amount;
}

function cancelOrbitTransition(orbit: App17OrbitState) {
  if (!orbit.transition) return;
  orbit.transition = null;
  orbit.targetDistance = orbit.distance;
}

function cancelOrbitMotion(orbit: App17OrbitState) {
  orbit.transition = null;
  orbit.targetDistance = orbit.distance;
}

function orbitZoomActive(orbit: App17OrbitState) {
  return Math.abs(orbit.targetDistance - orbit.distance) > 0.001;
}

function advanceOrbitZoom(orbit: App17OrbitState, elapsedMs: number) {
  if (!orbitZoomActive(orbit) || elapsedMs <= 0) return false;
  const blend = 1 - Math.exp(-elapsedMs / APP17_WHEEL_TIME_CONSTANT_MS);
  orbit.distance += (orbit.targetDistance - orbit.distance) * blend;
  if (!orbitZoomActive(orbit)) orbit.distance = orbit.targetDistance;
  return true;
}

function cubicEaseInOut(progress: number) {
  return progress < 0.5
    ? 4 * progress * progress * progress
    : 1 - ((-2 * progress + 2) ** 3) / 2;
}

function smoothStepRange(start: number, end: number, value: number) {
  const progress = THREE.MathUtils.clamp((value - start) / Math.max(0.0001, end - start), 0, 1);
  return progress * progress * (3 - 2 * progress);
}

function percentileNumber(values: number[], percentile: number) {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * percentile) - 1))];
}

function smootherStep(progress: number) {
  const value = THREE.MathUtils.clamp(progress, 0, 1);
  return value * value * value * (value * (value * 6 - 15) + 10);
}

function advanceOrbitTransition(orbit: App17OrbitState, now: number) {
  const transition = orbit.transition;
  if (!transition) return false;
  const progress = THREE.MathUtils.clamp((now - transition.startedAt) / transition.durationMs, 0, 1);
  const eased = transition.kind === "enter-system"
    || transition.kind === "exit-system"
    || transition.kind === "focus-paper"
    || transition.kind === "return-system-center"
    ? smootherStep(progress)
    : cubicEaseInOut(progress);
  if (transition.centerControl) {
    const inverse = 1 - eased;
    orbit.center.copy(transition.from.center).multiplyScalar(inverse * inverse)
      .addScaledVector(transition.centerControl, 2 * inverse * eased)
      .addScaledVector(transition.to.center, eased * eased);
  } else {
    orbit.center.lerpVectors(transition.from.center, transition.to.center, eased);
  }
  if (transition.cameraFrom && transition.cameraTo && transition.cameraControl) {
    const inverse = 1 - eased;
    const cameraPosition = transition.cameraFrom.clone().multiplyScalar(inverse * inverse)
      .addScaledVector(transition.cameraControl, 2 * inverse * eased)
      .addScaledVector(transition.cameraTo, eased * eased);
    const direction = cameraPosition.sub(orbit.center);
    if (direction.lengthSq() < 0.000001) direction.set(1, 0, 0);
    direction.normalize();
    const distance = transition.logarithmicDistance
      ? Math.exp(THREE.MathUtils.lerp(
          Math.log(Math.max(0.001, transition.from.distance)),
          Math.log(Math.max(0.001, transition.to.distance)),
          eased,
        ))
      : THREE.MathUtils.lerp(transition.from.distance, transition.to.distance, eased);
    orbit.distance = distance;
    orbit.azimuth = Math.atan2(direction.y, direction.x);
    orbit.elevation = Math.asin(THREE.MathUtils.clamp(direction.z, -1, 1));
  } else {
    orbit.distance = transition.logarithmicDistance
      ? Math.exp(THREE.MathUtils.lerp(
          Math.log(Math.max(0.001, transition.from.distance)),
          Math.log(Math.max(0.001, transition.to.distance)),
          eased,
        ))
      : THREE.MathUtils.lerp(transition.from.distance, transition.to.distance, eased);
    orbit.azimuth = lerpAngle(transition.from.azimuth, transition.to.azimuth, eased);
    orbit.elevation = THREE.MathUtils.lerp(transition.from.elevation, transition.to.elevation, eased);
  }
  orbit.targetDistance = transition.to.distance;
  if (progress < 1) return false;
  orbit.center.copy(transition.to.center);
  orbit.distance = transition.to.distance;
  orbit.azimuth = transition.to.azimuth;
  orbit.elevation = transition.to.elevation;
  orbit.transition = null;
  return true;
}

function buildApp14ShowScene(payload: App17GalaxyPayload): App17SceneData {
  const topHotspots = payload.hotspots
    .slice()
    .sort((a, b) => b.paperCount - a.paperCount || a.field.localeCompare(b.field) || a.topicId - b.topicId)
    .slice(0, APP14_VISIBLE_HOTSPOTS);
  const layoutHotspots = stableShuffleHotspotsApp14(topHotspots);
  const fields = unique(topHotspots.map((hotspot) => hotspot.field));
  const fieldToColor = new Map(fields.map((field, index) => [field, APP17_PALETTE[index % APP17_PALETTE.length]]));
  const topOrbitKeys = new Set(topHotspots.slice(0, APP14_ORBIT_COUNT).map(topicKeyFromHotspot));
  const hotspotByTopic = new Map<string, App17RenderPoint>();
  const orbitPositions: number[] = [];

  const hotspots = assignHotspotVisualMetrics(layoutHotspots.map((hotspot, index) => {
    const key = topicKeyFromHotspot(hotspot);
    const r = Math.sqrt(index + 1) * 320;
    const theta = (index * 2 * Math.PI) / (APP14_PHI ** 2);
    const position = new THREE.Vector3(
      r * Math.cos(theta) * APP14_COORD_SCALE,
      r * Math.sin(theta) * APP14_COORD_SCALE,
      0,
    );
    const color = fieldToColor.get(hotspot.field) ?? "#ffffff";
    const renderPoint: App17RenderPoint = {
      id: hotspot.id,
      title: hotspot.title || hotspot.label || `Topic ${hotspot.topicId}`,
      field: hotspot.field,
      topicId: hotspot.topicId,
      paperCount: hotspot.paperCount || 10,
      color,
      size: 6 + Math.log1p(hotspot.paperCount || 10) * 5,
      seed: stableHash(hotspot.id) / 4294967295,
      glowStrength: app17GlowStrength(hotspot.trend),
      importance: 0,
      displaySize: 0,
      position,
    };
    hotspotByTopic.set(key, renderPoint);
    if (topOrbitKeys.has(key)) {
      for (let segment = 0; segment < APP14_ORBIT_SEGMENTS; segment += 1) {
        const a = (segment / APP14_ORBIT_SEGMENTS) * Math.PI * 2;
        const b = ((segment + 1) / APP14_ORBIT_SEGMENTS) * Math.PI * 2;
        orbitPositions.push(
          r * Math.cos(a) * APP14_COORD_SCALE,
          r * Math.sin(a) * APP14_COORD_SCALE,
          0,
          r * Math.cos(b) * APP14_COORD_SCALE,
          r * Math.sin(b) * APP14_COORD_SCALE,
          0,
        );
      }
    }
    return renderPoint;
  }), "app14");

  const groupedPapers = new Map<string, App17GalaxyPayload["papers"]>();
  payload.papers.forEach((paper) => {
    const key = `${paper.field}_${paper.topicId}`;
    if (!hotspotByTopic.has(key)) return;
    const group = groupedPapers.get(key) ?? [];
    group.push(paper);
    groupedPapers.set(key, group);
  });

  const papers: App17ParticlePoint[] = [];
  groupedPapers.forEach((topicPapers, key) => {
    const hotspot = hotspotByTopic.get(key);
    if (!hotspot) return;
    const rng = seededRandom(stableHash(key));
    topicPapers.forEach((paper, index) => {
      const radius = (80 + rng() * 170) * APP14_COORD_SCALE;
      const angle = rng() * Math.PI * 2;
      const sizeRng = seededRandom(stableHash(`${key}:${index}:size`));
      papers.push({
        paperId: paper.scopedPaperId || paper.rawPaperId,
        topicKey: key,
        x: hotspot.position.x + radius * Math.cos(angle),
        y: hotspot.position.y + radius * Math.sin(angle),
        z: hotspot.position.z,
        color: hotspot.color,
        size: 2.8 * (0.85 + sizeRng() * 0.35),
        alpha: 0.58,
        year: paper.year,
        ...paperVisualVariation(paper.scopedPaperId || paper.rawPaperId),
      });
    });
  });

  return {
    kind: "app14",
    papers,
    hotspots,
    orbitPositions: orbitPositions.length > 0 ? new Float32Array(orbitPositions) : null,
    camera: {
      center: new THREE.Vector3(0, 0, -0.1),
      distance: Math.hypot(8.9, 3.6),
      minDistance: 1.9,
      maxDistance: 15.2,
      azimuth: Math.PI / 4,
      elevation: Math.atan2(3.6, 8.9),
      minElevation: THREE.MathUtils.degToRad(-80),
      maxElevation: THREE.MathUtils.degToRad(88),
      fitDistance: Math.hypot(11.4, 4.6),
      fitAzimuth: Math.PI / 4,
      fitElevation: Math.atan2(4.6, 11.4),
      topDistance: Math.hypot(0.55, 12.6),
      topAzimuth: Math.PI / 2,
      topElevation: Math.atan2(12.6, 0.55),
      zScale: 0.22,
      autoRotate: true,
      autoRotateAzimuthStep: 0.00135,
    },
  };
}

function buildApp15TheoryScene(payload: App17GalaxyPayload): App17SceneData {
  const hotspots = assignHotspotVisualMetrics(payload.hotspots.map((hotspot) => ({
    id: hotspot.id,
    title: hotspot.title || hotspot.label || `${hotspot.field} ${hotspot.topicId}`,
    field: hotspot.field,
    topicId: hotspot.topicId,
    paperCount: hotspot.paperCount,
    color: hotspot.color,
    size: hotspot.size,
    seed: stableHash(hotspot.id) / 4294967295,
    glowStrength: app17GlowStrength(hotspot.trend),
    importance: 0,
    displaySize: 0,
    position: new THREE.Vector3(hotspot.x * APP15_COORD_SCALE, hotspot.y * APP15_COORD_SCALE, hotspot.z * APP15_COORD_SCALE),
  })), "app15");
  const papers = payload.papers.map((paper) => ({
    paperId: paper.scopedPaperId || paper.rawPaperId,
    topicKey: `${paper.field}_${paper.topicId}`,
    x: paper.x * APP15_COORD_SCALE,
    y: paper.y * APP15_COORD_SCALE,
    z: paper.z * APP15_COORD_SCALE,
    color: paper.color || "#89b4ff",
    size: THREE.MathUtils.clamp(paper.size || 2.2, 2.2, 3.6),
    alpha: 0.62,
    year: paper.year,
    ...paperVisualVariation(paper.scopedPaperId || paper.rawPaperId),
  }));

  return {
    kind: "app15",
    papers,
    hotspots,
    orbitPositions: null,
    camera: {
      center: new THREE.Vector3(0, 0, 0),
      distance: Math.hypot(8.7, 3.92),
      minDistance: 1.7,
      maxDistance: 14.8,
      azimuth: Math.PI / 4,
      elevation: Math.atan2(3.92, 8.7),
      minElevation: THREE.MathUtils.degToRad(-80),
      maxElevation: THREE.MathUtils.degToRad(88),
      fitDistance: Math.hypot(10.2, 4.1),
      fitAzimuth: Math.PI / 4,
      fitElevation: Math.atan2(4.1, 10.2),
      topDistance: Math.hypot(0.5, 11.4),
      topAzimuth: Math.PI / 2,
      topElevation: Math.atan2(11.4, 0.5),
      zScale: 0.42,
      autoRotate: false,
      autoRotateAzimuthStep: 0,
    },
  };
}

function buildGalaxySystemResources(
  payload: App17GalaxyPayload,
  hotspot: App17GalaxyHotspotPoint,
  representativePapers: HotspotEvidencePaperSnapshot[],
  pixelRatio: number,
  visualMode: GalaxySystemVisualMode,
) {
  const topicPaperByCanonicalId = new Map<string, (typeof payload.papers)[number]>();
  let duplicatePaperCount = 0;
  payload.papers.forEach((paper) => {
    if (paper.field !== hotspot.field || paper.topicId !== hotspot.topicId) return;
    const canonicalId = paper.scopedPaperId || paper.rawPaperId;
    if (!canonicalId) return;
    if (topicPaperByCanonicalId.has(canonicalId)) {
      duplicatePaperCount += 1;
      return;
    }
    topicPaperByCanonicalId.set(canonicalId, paper);
  });
  const topicPapers = [...topicPaperByCanonicalId.values()];
  const relativePoints = topicPapers.map((paper) => ({
    paper,
    vector: new THREE.Vector3(paper.x - hotspot.x, paper.y - hotspot.y, (paper.z - hotspot.z) * 0.62),
  }));
  const radii = relativePoints.map((item) => item.vector.length()).sort((a, b) => a - b);
  const percentileIndex = Math.min(radii.length - 1, Math.max(0, Math.floor(radii.length * 0.95)));
  const percentileRadius = radii[percentileIndex] || 1;
  const coordinateScale = APP17_SYSTEM_RADIUS / Math.max(0.0001, percentileRadius);
  const canonicalPaperIdById = new Map<string, string>();
  relativePoints.forEach((item) => {
    const canonicalId = item.paper.scopedPaperId || item.paper.rawPaperId;
    if (item.paper.scopedPaperId) canonicalPaperIdById.set(item.paper.scopedPaperId, canonicalId);
    if (item.paper.rawPaperId) canonicalPaperIdById.set(item.paper.rawPaperId, canonicalId);
  });
  const knownTopicYears = topicPapers
    .map((paper) => paper.year)
    .filter((year): year is number => Number.isFinite(year));
  const minimumTopicYear = knownTopicYears.length > 0 ? Math.min(...knownTopicYears) : 0;
  const maximumTopicYear = knownTopicYears.length > 0 ? Math.max(...knownTopicYears) : 0;
  const cloudPoints: App17ParticlePoint[] = relativePoints
    .map((item) => ({
      paperId: item.paper.scopedPaperId || item.paper.rawPaperId,
      topicKey: topicKeyFromHotspot(hotspot),
      x: item.vector.x * coordinateScale,
      y: item.vector.y * coordinateScale,
      z: item.vector.z * coordinateScale,
      color: representativeYearColor(item.paper.year, minimumTopicYear, maximumTopicYear),
      haloColor: hotspot.color,
      size: THREE.MathUtils.clamp(item.paper.size || 2.2, 2.2, 3.4),
      alpha: 0.48,
      year: item.paper.year,
      ...paperVisualVariation(item.paper.scopedPaperId || item.paper.rawPaperId),
    }));

  const root = new THREE.Group();
  root.visible = false;
  const cloudLayer = createSystemPaperLayer(cloudPoints, pixelRatio, false);
  root.add(cloudLayer.object);
  const star = createSystemStar(hotspot);
  root.add(star.object);

  const resources: GalaxySystemResources = {
    hotspotId: hotspot.id,
    hotspot,
    visualMode,
    root,
    cloudLayer,
    star,
    representativePapers: [],
    canonicalPaperIdById,
    uniquePaperCount: topicPapers.length,
    duplicatePaperCount,
    hiddenRepresentativeCount: 0,
    unresolvedRepresentativeCount: 0,
    representativeSignature: "",
    activeTimeSeconds: 0,
    entryScale: 1,
    starEntryScale: 1,
    updateAnimation: (elapsedSeconds, motionEnabled, frozenPaperIds) => {
      const elapsed = THREE.MathUtils.clamp(elapsedSeconds, 0, 0.12);
      let positionsChanged = false;
      if (motionEnabled && elapsed > 0) {
        resources.activeTimeSeconds += elapsed;
        resources.representativePapers.forEach((paper) => {
          if (frozenPaperIds.has(paper.id)) return;
          paper.orbit.phase = (paper.orbit.phase + paper.orbit.angularSpeed * elapsed) % (Math.PI * 2);
          galaxySystemOrbitPoint(paper.orbit, paper.orbit.phase, paper.position);
          positionsChanged = true;
        });
        if (positionsChanged) {
          const positions = resources.representativePapers.map((paper) => paper.position);
          resources.representativeLayer?.setPointPositions(positions);
          resources.representativeBloomLayer?.setPointPositions(positions);
        }
      }
      const representativeFocusChanged = resources.representativeLayer?.advanceFocus(
        elapsed,
        !motionEnabled,
      ) ?? false;
      resources.representativeLayer?.setEnergyTime(
        resources.activeTimeSeconds,
        motionEnabled ? 1 : 0,
      );
      const cloudFocusChanged = resources.cloudLayer.advanceFocus(
        elapsed,
        !motionEnabled,
      );
      const representativeBloomFocusChanged = resources.representativeBloomLayer?.advanceFocus(
        elapsed,
        !motionEnabled,
      ) ?? false;
      const orbitHighlightChanged = resources.orbitLayer?.advanceHighlight(elapsed, !motionEnabled) ?? false;
      star.setAnimation(resources.activeTimeSeconds, motionEnabled ? 1 : 0);
      return positionsChanged
        || orbitHighlightChanged
        || cloudFocusChanged
        || representativeFocusChanged
        || representativeBloomFocusChanged;
    },
    dispose: () => {
      cloudLayer.dispose();
      resources.representativeLayer?.dispose();
      resources.representativeBloomLayer?.dispose();
      resources.orbitLayer?.dispose();
      star.dispose();
    },
  };
  replaceSystemRepresentatives(resources, representativePapers, pixelRatio);
  setGalaxySystemOpacity(resources, 0);
  return resources;
}

function representativePaperSignature(papers: HotspotEvidencePaperSnapshot[]) {
  return papers
    .slice(0, 10)
    .map((paper) => `${paper.id}:${paper.source}:${paper.year ?? 0}:${paper.title}`)
    .join("|");
}

function buildSystemRepresentativeBundle(
  resources: GalaxySystemResources,
  representativePapers: HotspotEvidencePaperSnapshot[],
  pixelRatio: number,
): GalaxySystemRepresentativeBundle {
  const signature = representativePaperSignature(representativePapers);
  const uniqueRepresentativePapers = representativePapers
    .filter((paper, index, papers) => papers.findIndex((candidate) => candidate.id === paper.id) === index)
    .slice(0, 10);
  const representatives = uniqueRepresentativePapers
    .map((paper, rank) => ({
      paper,
      rank,
      canonicalId: resources.canonicalPaperIdById.get(paper.id),
    }))
    .filter((item): item is typeof item & { canonicalId: string } => Boolean(item.canonicalId));
  const hiddenRepresentativeIds = new Set(representatives.map((item) => item.canonicalId));
  const unresolvedRepresentativeCount = Math.max(0, uniqueRepresentativePapers.length - representatives.length);

  const orbitPositions: number[] = [];
  const orbitColors: number[] = [];
  const orbitRanks: number[] = [];
  const orbitAlphas: number[] = [];
  const representativePoints: App17ParticlePoint[] = [];
  const systemPapers: GalaxySystemPaper[] = [];
  const knownYears = representatives
    .map(({ paper }) => paper.year)
    .filter((year): year is number => Number.isFinite(year));
  const minimumYear = knownYears.length > 0 ? Math.min(...knownYears) : 0;
  const maximumYear = knownYears.length > 0 ? Math.max(...knownYears) : 0;
  representatives.forEach(({ paper, rank }) => {
    const count = Math.max(1, representatives.length);
    const radius = count === 1 ? 1.35 : 0.82 + (rank / Math.max(1, count - 1)) * 2.18;
    const random = seededRandom(stableHash(paper.id));
    const minorRadius = radius * (0.76 + random() * 0.16);
    const inclination = resources.visualMode === "display"
      ? 0
      : THREE.MathUtils.degToRad(-18 + random() * 36);
    const nodeAngle = random() * Math.PI * 2;
    const phase = random() * Math.PI * 2;
    const normalizedRadius = THREE.MathUtils.clamp((radius - 0.82) / 2.18, 0, 1);
    const periodSeconds = THREE.MathUtils.lerp(
      APP17_SYSTEM_INNER_ORBIT_PERIOD_SECONDS,
      APP17_SYSTEM_OUTER_ORBIT_PERIOD_SECONDS,
      Math.pow(normalizedRadius, 1.25),
    );
    const orbit: GalaxySystemOrbit = {
      majorRadius: radius,
      minorRadius,
      inclination,
      nodeAngle,
      phase,
      angularSpeed: (Math.PI * 2) / periodSeconds,
      rotation: new THREE.Quaternion().setFromEuler(new THREE.Euler(inclination, 0, nodeAngle, "XYZ")),
    };
    const orbitColor = new THREE.Color(sourceOrbitColor(paper.source));
    const orbitAlpha = rank < 3
      ? [0.22, 0.19, 0.17][rank]
      : THREE.MathUtils.lerp(0.1, 0.05, (rank - 3) / 6);
    for (let segment = 0; segment < APP17_SYSTEM_ORBIT_SEGMENTS; segment += 1) {
      const start = galaxySystemOrbitPoint(orbit, (segment / APP17_SYSTEM_ORBIT_SEGMENTS) * Math.PI * 2);
      const end = galaxySystemOrbitPoint(orbit, ((segment + 1) / APP17_SYSTEM_ORBIT_SEGMENTS) * Math.PI * 2);
      orbitPositions.push(start.x, start.y, start.z, end.x, end.y, end.z);
      orbitColors.push(
        orbitColor.r, orbitColor.g, orbitColor.b,
        orbitColor.r, orbitColor.g, orbitColor.b,
      );
      orbitRanks.push(rank, rank);
      orbitAlphas.push(orbitAlpha, orbitAlpha);
    }
    const position = galaxySystemOrbitPoint(orbit, phase);
    const displaySize = (
      7 + Math.pow(1 - Math.min(9, rank) / 9, 0.72) * 7
    ) * APP17_REPRESENTATIVE_SYSTEM_SIZE_SCALE;
    representativePoints.push({
      paperId: paper.id,
      topicKey: topicKeyFromHotspot(resources.hotspot),
      x: position.x,
      y: position.y,
      z: position.z,
      color: representativeYearColor(paper.year, minimumYear, maximumYear),
      haloColor: resources.hotspot.color,
      size: displaySize,
      alpha: 0.98,
      year: paper.year,
      representativeRank: rank,
      ...paperVisualVariation(paper.id, true),
    });
    systemPapers.push({
      id: paper.id,
      title: paper.title,
      source: paper.source,
      year: paper.year,
      rank,
      displaySize,
      color: representativeYearColor(paper.year, minimumYear, maximumYear),
      orbit,
      position,
    });
  });

  const representativeLayer = representativePoints.length > 0
    ? createSystemRepresentativeLayer(representativePoints, pixelRatio)
    : undefined;
  const representativeBloomLayer = representativePoints.length > 0
    ? createSystemRepresentativeBloomLayer(representativePoints, pixelRatio)
    : undefined;
  const orbitLayer = orbitPositions.length > 0
    ? createSystemOrbitLayer(
        new Float32Array(orbitPositions),
        new Float32Array(orbitColors),
        new Float32Array(orbitRanks),
        new Float32Array(orbitAlphas),
      )
    : undefined;
  return {
    signature,
    representativeLayer,
    representativeBloomLayer,
    orbitLayer,
    representativePapers: systemPapers,
    hiddenRepresentativeIds,
    hiddenRepresentativeCount: hiddenRepresentativeIds.size,
    unresolvedRepresentativeCount,
    dispose: () => {
      representativeLayer?.dispose();
      representativeBloomLayer?.dispose();
      orbitLayer?.dispose();
    },
  };
}

function commitSystemRepresentativeBundle(
  resources: GalaxySystemResources,
  bundle: GalaxySystemRepresentativeBundle,
) {
  if (bundle.signature === resources.representativeSignature) {
    bundle.dispose();
    return false;
  }

  if (resources.representativeLayer) {
    resources.root.remove(resources.representativeLayer.object);
    resources.representativeLayer.dispose();
  }
  if (resources.representativeBloomLayer) {
    resources.root.remove(resources.representativeBloomLayer.object);
    resources.representativeBloomLayer.dispose();
  }
  if (resources.orbitLayer) {
    resources.root.remove(resources.orbitLayer.object);
    resources.orbitLayer.dispose();
  }

  resources.representativeLayer = bundle.representativeLayer;
  resources.representativeBloomLayer = bundle.representativeBloomLayer;
  resources.orbitLayer = bundle.orbitLayer;
  resources.representativePapers = bundle.representativePapers;
  resources.hiddenRepresentativeCount = bundle.hiddenRepresentativeCount;
  resources.unresolvedRepresentativeCount = bundle.unresolvedRepresentativeCount;
  resources.representativeSignature = bundle.signature;
  resources.cloudLayer.setHiddenPaperIds(bundle.hiddenRepresentativeIds);
  if (resources.representativeLayer) resources.root.add(resources.representativeLayer.object);
  if (resources.representativeBloomLayer) resources.root.add(resources.representativeBloomLayer.object);
  if (resources.orbitLayer) resources.root.add(resources.orbitLayer.object);
  return true;
}

function replaceSystemRepresentatives(
  resources: GalaxySystemResources,
  representativePapers: HotspotEvidencePaperSnapshot[],
  pixelRatio: number,
) {
  const signature = representativePaperSignature(representativePapers);
  if (signature === resources.representativeSignature) return false;
  return commitSystemRepresentativeBundle(
    resources,
    buildSystemRepresentativeBundle(resources, representativePapers, pixelRatio),
  );
}

function createSystemPaperLayer(
  papers: App17ParticlePoint[],
  pixelRatio: number,
  dynamicPositions: boolean,
) {
  const count = papers.length;
  const positions = new Float32Array(count * 3);
  const coreColors = new Float32Array(count * 3);
  const haloColors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const alphas = new Float32Array(count);
  const originalAlphas = new Float32Array(count);
  const representativeRanks = new Float32Array(count);
  const visualSeeds = new Float32Array(count);
  const rayAngles = new Float32Array(count);
  const sizeVariations = new Float32Array(count);
  const brightnessVariations = new Float32Array(count);
  const focusValues = new Float32Array(count).fill(1);
  const focusTargets = new Float32Array(count).fill(1);
  const paperFocusMasks = new Float32Array(count);
  const paperIds = papers.map((paper) => paper.paperId);
  const paperRecords = papers.map<GalaxySystemCloudPaper>((paper, index) => ({
    id: paper.paperId,
    year: paper.year,
    position: new THREE.Vector3(paper.x, paper.y, paper.z),
    color: paper.color,
    index,
  }));
  const paperRecordById = new Map(paperRecords.map((paper) => [paper.id, paper]));
  const coreColor = new THREE.Color();
  const haloColor = new THREE.Color();
  const ordinaryBaseSizes: number[] = [];
  let currentLod: GalaxySystemPaperLod = "medium";
  let lodBlend = 0.5;
  let farBlend = 0;
  let nearBlend = 0;
  let minimumPointSize = 2.2;
  let maximumPointSize = 3.4;
  let revealProgress = 0;
  let targetExposure = APP17_SYSTEM_PAPER_MEDIUM_EXPOSURE;
  let focusMode: GalaxySystemPaperFocusMode = "none";
  let focusRank = -1;
  let representativeDimFactor = 1;
  let selectedOrdinaryPaperId = "";
  let paperFocusTargetId = "";
  let energyDetailBlend = 0;
  let energyBloomOpacity = 0;
  let energyWispCount = 0;
  let paperFocusTargetScreenSize = dynamicPositions
    ? APP17_SYSTEM_PAPER_FOCUS_REPRESENTATIVE_SIZE
    : APP17_SYSTEM_PAPER_FOCUS_ORDINARY_SIZE;

  const updateFocusTargets = () => {
    for (let index = 0; index < focusTargets.length; index += 1) {
      const rank = representativeRanks[index];
      focusTargets[index] = rank >= 0
        ? representativeFocusTarget(rank, focusMode === "selected" ? focusRank : -1, focusMode === "hover" ? focusRank : -1)
        : paperIds[index] === selectedOrdinaryPaperId ? 1.12 : 1;
    }
  };

  papers.forEach((paper, index) => {
    positions[index * 3] = paper.x;
    positions[index * 3 + 1] = paper.y;
    positions[index * 3 + 2] = paper.z;
    coreColor.set(paper.color);
    haloColor.set(paper.haloColor || paper.color);
    coreColors[index * 3] = coreColor.r;
    coreColors[index * 3 + 1] = coreColor.g;
    coreColors[index * 3 + 2] = coreColor.b;
    haloColors[index * 3] = haloColor.r;
    haloColors[index * 3 + 1] = haloColor.g;
    haloColors[index * 3 + 2] = haloColor.b;
    sizes[index] = paper.size;
    alphas[index] = paper.alpha;
    originalAlphas[index] = paper.alpha;
    representativeRanks[index] = paper.representativeRank ?? -1;
    visualSeeds[index] = paper.visualSeed;
    rayAngles[index] = paper.rayAngle;
    sizeVariations[index] = paper.visualSizeVariation;
    brightnessVariations[index] = paper.visualBrightnessVariation;
    if ((paper.representativeRank ?? -1) >= 0) {
      const profile = createRepresentativeEnergyProfile(
        paper.paperId,
        paper.representativeRank ?? 0,
      );
      energyWispCount = Math.max(energyWispCount, profile.wispCount);
    }
    if ((paper.representativeRank ?? -1) < 0) {
      ordinaryBaseSizes.push(paper.size * paper.visualSizeVariation);
    }
  });
  const ordinaryBaseMinimum = ordinaryBaseSizes.length > 0 ? Math.min(...ordinaryBaseSizes) : 2.2;
  const ordinaryBaseMaximum = ordinaryBaseSizes.length > 0 ? Math.max(...ordinaryBaseSizes) : 3.4;

  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(positions, 3);
  if (dynamicPositions) positionAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", positionAttribute);
  geometry.setAttribute("coreColor", new THREE.BufferAttribute(coreColors, 3));
  geometry.setAttribute("haloColor", new THREE.BufferAttribute(haloColors, 3));
  geometry.setAttribute("pointSize", new THREE.BufferAttribute(sizes, 1));
  const alphaAttribute = new THREE.BufferAttribute(alphas, 1);
  geometry.setAttribute("pointAlpha", alphaAttribute);
  geometry.setAttribute("representativeRank", new THREE.BufferAttribute(representativeRanks, 1));
  geometry.setAttribute("visualSeed", new THREE.BufferAttribute(visualSeeds, 1));
  geometry.setAttribute("rayAngle", new THREE.BufferAttribute(rayAngles, 1));
  geometry.setAttribute("sizeVariation", new THREE.BufferAttribute(sizeVariations, 1));
  geometry.setAttribute("brightnessVariation", new THREE.BufferAttribute(brightnessVariations, 1));
  const focusAttribute = new THREE.BufferAttribute(focusValues, 1).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("focusIntensity", focusAttribute);
  const paperFocusMaskAttribute = new THREE.BufferAttribute(paperFocusMasks, 1).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("paperFocusMask", paperFocusMaskAttribute);

  const material = createSystemPaperMaterial(pixelRatio, dynamicPositions);
  const object = new THREE.Points(geometry, material);
  object.frustumCulled = false;
  object.renderOrder = dynamicPositions ? 4 : 2;
  if (dynamicPositions) energyBloomOpacity = 0.18;

  return {
    object,
    setOpacity: (opacity: number) => {
      material.uniforms.uSceneOpacity.value = opacity;
    },
    setRevealProgress: (progress: number) => {
      revealProgress = THREE.MathUtils.clamp(progress, 0, 1);
      material.uniforms.uSystemRevealProgress.value = revealProgress;
    },
    setSystemDepthCue: (centerViewDepth: number, depthRange: number, strength: number) => {
      material.uniforms.uSystemCenterViewDepth.value = centerViewDepth;
      material.uniforms.uSystemDepthRange.value = Math.max(0.001, depthRange);
      material.uniforms.uSystemDepthStrength.value = THREE.MathUtils.clamp(strength, 0, 1);
    },
    setLodDistance: (distance: number) => {
      const nextFarBlend = smoothStepRange(
        APP17_SYSTEM_PAPER_MEDIUM_DISTANCE,
        APP17_SYSTEM_PAPER_FAR_DISTANCE,
        distance,
      );
      const nextNearBlend = 1 - smoothStepRange(
        APP17_SYSTEM_PAPER_NEAR_DISTANCE,
        APP17_SYSTEM_PAPER_MEDIUM_DISTANCE,
        distance,
      );
      const nextLodBlend = 1 - smoothStepRange(
        APP17_SYSTEM_PAPER_NEAR_DISTANCE,
        APP17_SYSTEM_PAPER_FAR_DISTANCE,
        distance,
      );
      material.uniforms.uPaperFarBlend.value = nextFarBlend;
      material.uniforms.uPaperNearBlend.value = nextNearBlend;
      targetExposure = THREE.MathUtils.lerp(
        THREE.MathUtils.lerp(
          APP17_SYSTEM_PAPER_MEDIUM_EXPOSURE,
          APP17_SYSTEM_PAPER_FAR_EXPOSURE,
          nextFarBlend,
        ),
        APP17_SYSTEM_PAPER_NEAR_EXPOSURE,
        nextNearBlend,
      );
      material.uniforms.uOrdinaryExposure.value = targetExposure;
      farBlend = nextFarBlend;
      nearBlend = nextNearBlend;
      lodBlend = nextLodBlend;
      currentLod = nextFarBlend >= 0.5 ? "far" : nextNearBlend >= 0.5 ? "near" : "medium";
      const sizeScale = THREE.MathUtils.lerp(1, 0.88, nextFarBlend) * THREE.MathUtils.lerp(1, 1.05, nextNearBlend);
      const shaderMinimum = THREE.MathUtils.lerp(
        THREE.MathUtils.lerp(2.15, 2.05, nextFarBlend),
        2.35,
        nextNearBlend,
      );
      minimumPointSize = THREE.MathUtils.clamp(
        Math.max(shaderMinimum, ordinaryBaseMinimum * sizeScale * 0.92),
        2.05,
        4.2,
      );
      maximumPointSize = THREE.MathUtils.clamp(ordinaryBaseMaximum * sizeScale * 1.18, minimumPointSize, 4.2);
    },
    setEnergyTime: (timeSeconds: number, motionStrength: number) => {
      material.uniforms.uEnergyTime.value = timeSeconds;
      material.uniforms.uEnergyMotionStrength.value = THREE.MathUtils.clamp(motionStrength, 0, 1);
    },
    setRepresentativeFocus: (selectedRank: number, hoveredRank: number) => {
      focusMode = selectedRank >= 0 ? "selected" : hoveredRank >= 0 ? "hover" : "none";
      focusRank = selectedRank >= 0 ? selectedRank : hoveredRank;
      representativeDimFactor = selectedRank >= 0 ? 0.82 : hoveredRank >= 0 ? 0.9 : 1;
      updateFocusTargets();
    },
    setSelectedOrdinaryPaper: (paperId: string) => {
      if (selectedOrdinaryPaperId === paperId) return;
      selectedOrdinaryPaperId = paperId;
      updateFocusTargets();
    },
    setPaperFocus: (
      paperId: string,
      targetPosition: THREE.Vector3 | undefined,
      blend: number,
      inspectionBlend: number,
      flightStrength: number,
      cameraDistance: number,
    ) => {
      if (paperFocusTargetId !== paperId) {
        paperFocusTargetId = paperId;
        for (let index = 0; index < paperFocusMasks.length; index += 1) {
          paperFocusMasks[index] = paperIds[index] === paperId ? 1 : 0;
        }
        paperFocusMaskAttribute.needsUpdate = true;
      }
      if (targetPosition) material.uniforms.uPaperFocusPosition.value.copy(targetPosition);
      const baseSize = dynamicPositions
        ? APP17_SYSTEM_PAPER_FOCUS_REPRESENTATIVE_SIZE
        : APP17_SYSTEM_PAPER_FOCUS_ORDINARY_SIZE;
      const maximumSize = dynamicPositions
        ? APP17_SYSTEM_PAPER_FOCUS_REPRESENTATIVE_MAX_SIZE
        : APP17_SYSTEM_PAPER_FOCUS_ORDINARY_MAX_SIZE;
      const closeupBoost = 1 - smoothStepRange(
        APP17_SYSTEM_PAPER_FOCUS_MIN_DISTANCE,
        APP17_SYSTEM_PAPER_FOCUS_DISTANCE,
        cameraDistance,
      );
      paperFocusTargetScreenSize = THREE.MathUtils.lerp(
        baseSize,
        maximumSize,
        closeupBoost,
      );
      energyDetailBlend = dynamicPositions
        ? smoothStepRange(
            APP17_REPRESENTATIVE_ENERGY_DETAIL_START_PX,
            APP17_REPRESENTATIVE_ENERGY_DETAIL_END_PX,
            paperFocusTargetScreenSize,
          )
        : 0;
      energyBloomOpacity = dynamicPositions
        ? THREE.MathUtils.lerp(
            0.18,
            0.11,
            energyDetailBlend,
          )
        : 0;
      material.uniforms.uPaperFocusBlend.value = THREE.MathUtils.clamp(blend, 0, 1);
      material.uniforms.uPaperInspectionBlend.value = THREE.MathUtils.clamp(inspectionBlend, 0, 1);
      material.uniforms.uPaperFocusFlightStrength.value = THREE.MathUtils.clamp(flightStrength, 0, 1);
      material.uniforms.uPaperFocusTargetCssSize.value = paperFocusTargetScreenSize;
      material.uniforms.uPaperFocusContextBrightness.value = dynamicPositions
        ? APP17_SYSTEM_PAPER_FOCUS_REPRESENTATIVE_BRIGHTNESS
        : APP17_SYSTEM_PAPER_FOCUS_CONTEXT_BRIGHTNESS;
      material.uniforms.uPaperFocusNeighborBrightness.value = dynamicPositions
        ? APP17_SYSTEM_PAPER_FOCUS_REPRESENTATIVE_BRIGHTNESS
        : APP17_SYSTEM_PAPER_FOCUS_NEIGHBOR_BRIGHTNESS;
    },
    advanceFocus: (elapsedSeconds: number, immediate = false) => {
      const blend = immediate
        ? 1
        : 1 - Math.exp(-Math.max(0, elapsedSeconds) * APP17_SYSTEM_PAPER_FOCUS_RESPONSE);
      let changed = false;
      for (let index = 0; index < focusValues.length; index += 1) {
        const next = THREE.MathUtils.lerp(focusValues[index], focusTargets[index], blend);
        if (Math.abs(next - focusValues[index]) > 0.001) changed = true;
        focusValues[index] = Math.abs(next - focusTargets[index]) < 0.001 ? focusTargets[index] : next;
      }
      if (changed) focusAttribute.needsUpdate = true;
      return changed;
    },
    getVisualState: () => ({
      lod: currentLod,
      lodBlend,
      farBlend,
      nearBlend,
      minimumPointSize,
      maximumPointSize,
      revealProgress,
      targetExposure,
      effectiveExposure: THREE.MathUtils.lerp(1, targetExposure, revealProgress),
      depthBrightnessFloor: APP17_SYSTEM_PAPER_DEPTH_BRIGHTNESS_FLOOR,
      depthSizeFloor: APP17_SYSTEM_PAPER_DEPTH_SIZE_FLOOR,
      focusMode,
      focusRank,
      representativeDimFactor,
      paperFocusTargetScreenSize,
      energyDetailBlend,
      energyBloomOpacity,
      energyWispCount,
      energyCarrierScale: dynamicPositions ? APP17_REPRESENTATIVE_ENERGY_CARRIER_SCALE : 1,
      energyCloseupCompactness: 0,
      energyVisibleRadius: dynamicPositions ? 1 : 0,
      energyBodyCoreDiameter: 0,
      energyBodyCoreBlend: 0,
      energyFresnelWidth: 0,
      energyOuterGlowDiameter: 0,
      energyOuterGlowMonotonic: true,
      energyMicroCoreDiameter: 0,
      energyMicroCoreBlend: 0,
      energySoftCoreAttenuation: 1,
      energyMicroCoreBrightness: 0,
    }),
    getPaperByIndex: (index: number) => {
      if (index < 0 || index >= paperRecords.length || alphas[index] <= 0.001) return undefined;
      return paperRecords[index];
    },
    getPaperById: (paperId: string) => paperRecordById.get(paperId),
    setHiddenPaperIds: (hiddenPaperIds: Set<string>) => {
      for (let index = 0; index < alphas.length; index += 1) {
        alphas[index] = hiddenPaperIds.has(paperIds[index]) ? 0 : originalAlphas[index];
      }
      alphaAttribute.needsUpdate = true;
    },
    setPointPositions: (nextPositions: THREE.Vector3[]) => {
      const updateCount = Math.min(nextPositions.length, count);
      for (let index = 0; index < updateCount; index += 1) {
        const position = nextPositions[index];
        positions[index * 3] = position.x;
        positions[index * 3 + 1] = position.y;
        positions[index * 3 + 2] = position.z;
        paperRecords[index]?.position.copy(position);
      }
      positionAttribute.needsUpdate = true;
    },
    dispose: () => {
      geometry.dispose();
      material.dispose();
    },
  };
}

function createSystemRepresentativeLayer(papers: App17ParticlePoint[], pixelRatio: number) {
  return createSystemPaperLayer(papers, pixelRatio, true);
}

function createSystemRepresentativeBloomLayer(papers: App17ParticlePoint[], pixelRatio: number) {
  const count = papers.length;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const strengths = new Float32Array(count);
  const representativeRanks = new Float32Array(count);
  const focusValues = new Float32Array(count).fill(1);
  const focusTargets = new Float32Array(count).fill(1);
  const color = new THREE.Color();
  papers.forEach((paper, index) => {
    positions[index * 3] = paper.x;
    positions[index * 3 + 1] = paper.y;
    positions[index * 3 + 2] = paper.z;
    color.set(paper.color);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
    sizes[index] = paper.size;
    strengths[index] = (index < 3
      ? [0.22, 0.18, 0.15][index]
      : THREE.MathUtils.lerp(0.12, 0.05, THREE.MathUtils.clamp((index - 3) / 6, 0, 1)))
      * APP17_REPRESENTATIVE_BLOOM_STRENGTH_SCALE;
    representativeRanks[index] = paper.representativeRank ?? index;
  });
  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", positionAttribute);
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("pointSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("bloomStrength", new THREE.BufferAttribute(strengths, 1));
  geometry.setAttribute("representativeRank", new THREE.BufferAttribute(representativeRanks, 1));
  const focusAttribute = new THREE.BufferAttribute(focusValues, 1).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("focusIntensity", focusAttribute);
  const material = createSystemRepresentativeBloomMaterial(pixelRatio);
  const object = new THREE.Points(geometry, material);
  object.layers.set(APP17_BLOOM_LAYER);
  object.frustumCulled = false;
  object.renderOrder = 4;
  return {
    object,
    setOpacity: (opacity: number) => {
      material.uniforms.uSceneOpacity.value = opacity;
    },
    setRepresentativeFocus: (selectedRank: number, hoveredRank: number) => {
      for (let rank = 0; rank < focusTargets.length; rank += 1) {
        focusTargets[rank] = representativeFocusTarget(rank, selectedRank, hoveredRank);
      }
    },
    setPaperFocusBlend: (blend: number, inspectionBlend: number, targetRank: number) => {
      material.uniforms.uPaperFocusBlend.value = THREE.MathUtils.clamp(blend, 0, 1);
      material.uniforms.uPaperInspectionBlend.value = THREE.MathUtils.clamp(inspectionBlend, 0, 1);
      material.uniforms.uPaperInspectionTargetRank.value = targetRank;
    },
    advanceFocus: (elapsedSeconds: number, immediate = false) => {
      const blend = immediate
        ? 1
        : 1 - Math.exp(-Math.max(0, elapsedSeconds) * APP17_SYSTEM_PAPER_FOCUS_RESPONSE);
      let changed = false;
      for (let rank = 0; rank < focusValues.length; rank += 1) {
        const next = THREE.MathUtils.lerp(focusValues[rank], focusTargets[rank], blend);
        if (Math.abs(next - focusValues[rank]) > 0.001) changed = true;
        focusValues[rank] = Math.abs(next - focusTargets[rank]) < 0.001 ? focusTargets[rank] : next;
      }
      if (changed) focusAttribute.needsUpdate = true;
      return changed;
    },
    setPointPositions: (nextPositions: THREE.Vector3[]) => {
      const updateCount = Math.min(nextPositions.length, count);
      for (let index = 0; index < updateCount; index += 1) {
        positions[index * 3] = nextPositions[index].x;
        positions[index * 3 + 1] = nextPositions[index].y;
        positions[index * 3 + 2] = nextPositions[index].z;
      }
      positionAttribute.needsUpdate = true;
    },
    dispose: () => {
      geometry.dispose();
      material.dispose();
    },
  };
}

function createSystemOrbitLayer(
  positions: Float32Array,
  colors: Float32Array,
  orbitRanks: Float32Array,
  baseAlphas: Float32Array,
) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("orbitRank", new THREE.BufferAttribute(orbitRanks, 1));
  geometry.setAttribute("baseAlpha", new THREE.BufferAttribute(baseAlphas, 1));
  const emphasisValues = new Float32Array(10);
  const emphasisTargets = new Float32Array(10);
  let paperInspectionBlend = 0;
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uSceneOpacity: { value: 1 },
      uEmphasis: { value: emphasisValues },
      uSystemCenterViewDepth: { value: 0 },
      uSystemDepthRange: { value: APP17_SYSTEM_RADIUS },
      uDepthStrength: { value: 0 },
      uCloseupAttenuation: { value: 1 },
      uPaperFocusBlend: { value: 0 },
      uPaperFocusTargetRank: { value: -1 },
      uPaperInspectionBlend: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
    toneMapped: false,
    vertexShader: `
      attribute vec3 color;
      attribute float orbitRank;
      attribute float baseAlpha;
      uniform float uSystemCenterViewDepth;
      uniform float uSystemDepthRange;
      varying vec3 vColor;
      varying float vOrbitRank;
      varying float vBaseAlpha;
      varying float vRelativeDepth;
      void main() {
        vColor = color;
        vOrbitRank = orbitRank;
        vBaseAlpha = baseAlpha;
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        vRelativeDepth = ((-viewPosition.z) - uSystemCenterViewDepth) / max(0.001, uSystemDepthRange);
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      uniform float uSceneOpacity;
      uniform float uDepthStrength;
      uniform float uCloseupAttenuation;
      uniform float uPaperFocusBlend;
      uniform float uPaperFocusTargetRank;
      uniform float uPaperInspectionBlend;
      uniform float uEmphasis[10];
      varying vec3 vColor;
      varying float vOrbitRank;
      varying float vBaseAlpha;
      varying float vRelativeDepth;
      float emphasisForRank(float rank) {
        if (rank < 0.5) return uEmphasis[0];
        if (rank < 1.5) return uEmphasis[1];
        if (rank < 2.5) return uEmphasis[2];
        if (rank < 3.5) return uEmphasis[3];
        if (rank < 4.5) return uEmphasis[4];
        if (rank < 5.5) return uEmphasis[5];
        if (rank < 6.5) return uEmphasis[6];
        if (rank < 7.5) return uEmphasis[7];
        if (rank < 8.5) return uEmphasis[8];
        return uEmphasis[9];
      }
      void main() {
        float emphasis = emphasisForRank(vOrbitRank);
        float depthPosition = smoothstep(-0.72, 0.72, vRelativeDepth);
        float depthFactor = mix(1.15, 0.55, depthPosition);
        depthFactor = mix(1.0, depthFactor, uDepthStrength * (1.0 - emphasis));
        float highlightedAlpha = mix(0.28, 0.42, smoothstep(0.78, 1.0, emphasis));
        float targetMask = 1.0 - step(0.45, abs(vOrbitRank - uPaperFocusTargetRank));
        float focusContext = mix(${APP17_SYSTEM_PAPER_FOCUS_ORBIT_BRIGHTNESS.toFixed(2)}, 1.0, max(emphasis, targetMask));
        float closeupFactor = mix(uCloseupAttenuation, 1.0, emphasis) * mix(1.0, focusContext, uPaperFocusBlend);
        float inspectionProgress = smoothstep(0.70, 1.0, uPaperInspectionBlend);
        float inspectionAttenuation = mix(0.14, 0.20, targetMask);
        inspectionAttenuation = mix(1.0, inspectionAttenuation, inspectionProgress);
        float alpha = mix(vBaseAlpha * depthFactor, highlightedAlpha, emphasis)
          * uSceneOpacity
          * closeupFactor
          * inspectionAttenuation;
        vec3 color = mix(vColor, vec3(0.94, 0.98, 1.0), emphasis * 0.32);
        if (alpha < 0.002) discard;
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });
  const object = new THREE.LineSegments(geometry, material);
  object.frustumCulled = false;
  object.renderOrder = 3;
  return {
    object,
    setOpacity: (opacity: number) => {
      material.uniforms.uSceneOpacity.value = opacity;
    },
    setHighlight: (selectedRank: number, hoveredRank: number) => {
      for (let rank = 0; rank < emphasisTargets.length; rank += 1) {
        emphasisTargets[rank] = rank === selectedRank ? 1 : rank === hoveredRank ? 0.72 : 0;
      }
    },
    advanceHighlight: (elapsedSeconds: number, immediate = false) => {
      const blend = immediate ? 1 : 1 - Math.exp(-Math.max(0, elapsedSeconds) * 14);
      let changed = false;
      for (let rank = 0; rank < emphasisValues.length; rank += 1) {
        const next = THREE.MathUtils.lerp(emphasisValues[rank], emphasisTargets[rank], blend);
        if (Math.abs(next - emphasisValues[rank]) > 0.001) changed = true;
        emphasisValues[rank] = Math.abs(next - emphasisTargets[rank]) < 0.001 ? emphasisTargets[rank] : next;
      }
      return changed;
    },
    setDepthCue: (centerViewDepth: number, depthRange: number, strength: number) => {
      material.uniforms.uSystemCenterViewDepth.value = centerViewDepth;
      material.uniforms.uSystemDepthRange.value = Math.max(0.001, depthRange);
      material.uniforms.uDepthStrength.value = THREE.MathUtils.clamp(strength, 0, 1);
    },
    setCloseupAttenuation: (attenuation: number) => {
      material.uniforms.uCloseupAttenuation.value = THREE.MathUtils.clamp(attenuation, 0.8, 1);
    },
    setPaperFocus: (blend: number, targetRank: number, inspectionBlend: number) => {
      paperInspectionBlend = THREE.MathUtils.clamp(inspectionBlend, 0, 1);
      material.uniforms.uPaperFocusBlend.value = THREE.MathUtils.clamp(blend, 0, 1);
      material.uniforms.uPaperFocusTargetRank.value = targetRank;
      material.uniforms.uPaperInspectionBlend.value = paperInspectionBlend;
    },
    getVisualState: () => ({
      paperInspectionAttenuation: THREE.MathUtils.lerp(
        1,
        0.14,
        smoothStepRange(0.70, 1, paperInspectionBlend),
      ),
    }),
    dispose: () => {
      geometry.dispose();
      material.dispose();
    },
  };
}

function paperVisualVariation(paperId: string, preserveRankSize = false) {
  const normalize = (suffix: string) => stableHash(`${paperId}:${suffix}`) / 4294967295;
  return {
    visualSeed: normalize("visual"),
    rayAngle: normalize("ray") * Math.PI,
    visualSizeVariation: preserveRankSize ? 1 : THREE.MathUtils.lerp(0.94, 1.06, normalize("size")),
    visualBrightnessVariation: THREE.MathUtils.lerp(0.95, 1.05, normalize("brightness")),
  };
}

function createRepresentativeEnergyProfile(
  paperId: string,
  representativeRank: number,
): GalaxyRepresentativeEnergyProfile {
  const random = seededRandom(stableHash(`${paperId}:representative-energy-profile`));
  const maxWispCount = representativeRank <= 2 ? 2 : 1;
  const wispCount = maxWispCount === 2
    ? random() < 0.16 ? 0 : 1 + Math.floor(random() * 2)
    : random() < 0.54 ? 0 : 1;
  const createWisp = (): GalaxyRepresentativeEnergyWisp => ({
    angle: random() * Math.PI * 2,
    width: THREE.MathUtils.lerp(0.08, 0.16, random()),
    curvature: THREE.MathUtils.lerp(-0.22, 0.22, random()),
    strength: THREE.MathUtils.lerp(0.025, 0.055, random()),
  });
  const firstWisp = createWisp();
  const secondWisp = createWisp();
  if (wispCount < 2) secondWisp.strength = 0;
  if (wispCount < 1) firstWisp.strength = 0;
  return {
    primaryAngle: random() * Math.PI * 2,
    secondaryAngle: random() * Math.PI * 2,
    eccentricity: THREE.MathUtils.lerp(0.05, 0.14, random()),
    wispCount,
    wisps: [firstWisp, secondWisp],
  };
}

function representativeFocusTarget(
  rank: number,
  selectedRank: number,
  hoveredRank: number,
) {
  if (selectedRank >= 0) {
    return rank === selectedRank || rank === hoveredRank ? 1 : 0.82;
  }
  if (hoveredRank >= 0) return rank === hoveredRank ? 1 : 0.9;
  return 1;
}

function sourceOrbitColor(source: string) {
  const normalized = source.toLowerCase();
  if (normalized.includes("arxiv")) return "#77b8ff";
  if (normalized.includes("openalex")) return "#67e8c5";
  if (normalized.includes("cnki")) return "#ffd166";
  return "#c8d2df";
}

function representativeYearColor(year: number | undefined, minimumYear: number, maximumYear: number) {
  if (!Number.isFinite(year) || minimumYear <= 0 || maximumYear <= minimumYear) return "#f5f7ff";
  const normalized = THREE.MathUtils.clamp(((year as number) - minimumYear) / (maximumYear - minimumYear), 0, 1);
  const warm = new THREE.Color("#ffe7c2");
  const neutral = new THREE.Color("#fffaf0");
  const cool = new THREE.Color("#d9efff");
  const color = normalized < 0.5
    ? warm.lerp(neutral, normalized * 2)
    : neutral.lerp(cool, (normalized - 0.5) * 2);
  return `#${color.getHexString()}`;
}

function galaxySystemOrbitPoint(orbit: GalaxySystemOrbit, angle: number, target = new THREE.Vector3()) {
  return target
    .set(
      orbit.majorRadius * Math.cos(angle),
      orbit.minorRadius * Math.sin(angle),
      0,
    )
    .applyQuaternion(orbit.rotation);
}

function setGalaxySystemOpacity(resources: GalaxySystemResources, opacity: number) {
  resources.root.visible = opacity > 0.001;
  resources.cloudLayer.setOpacity(opacity);
  resources.representativeLayer?.setOpacity(opacity);
  resources.representativeBloomLayer?.setOpacity(opacity);
  resources.orbitLayer?.setOpacity(opacity);
  resources.star.setOpacity(opacity);
}

function systemCoronaTrendStrength(trend: string) {
  const normalized = trend.toLowerCase();
  if (normalized.includes("surg") || normalized.includes("hot")) return 1;
  if (normalized.includes("stable")) return 0.82;
  if (normalized.includes("declin")) return 0.68;
  return 0.75;
}

function createGalaxyCoronaProfile(hotspot: App17GalaxyHotspotPoint): GalaxyCoronaProfile {
  const random = seededRandom(stableHash(`${hotspot.id}:corona-profile`));
  const sectorCount = 2 + Math.floor(random() * 3);
  const offset = random() * Math.PI * 2;
  const sectors: GalaxyCoronaSector[] = [];
  for (let index = 0; index < sectorCount; index += 1) {
    const baseAngle = offset + index * Math.PI * 2 / sectorCount;
    sectors.push({
      angle: baseAngle + (random() - 0.5) * 0.34,
      width: THREE.MathUtils.lerp(0.12, 0.26, random()),
      extension: THREE.MathUtils.lerp(0.1, 0.28, random()),
      curvature: THREE.MathUtils.lerp(-0.28, 0.28, random()),
      opacity: THREE.MathUtils.lerp(0.08, 0.16, random()),
    });
  }
  while (sectors.length < 4) {
    sectors.push({ angle: 0, width: 0.12, extension: 0, curvature: 0, opacity: 0 });
  }
  return {
    sectors: sectors as GalaxyCoronaProfile["sectors"],
    sectorCount,
    innerHaloStrength: THREE.MathUtils.lerp(0.045, 0.085, random()),
    trendStrength: systemCoronaTrendStrength(hotspot.trend),
  };
}

function createPaperSurfaceProfile(paperId: string): GalaxyPaperSurfaceProfile {
  const random = seededRandom(stableHash(`${paperId}:surface-profile`));
  const randomDirection = () => {
    const z = random() * 2 - 1;
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(Math.max(0, 1 - z * z));
    return new THREE.Vector3(radius * Math.cos(angle), radius * Math.sin(angle), z).normalize();
  };
  const axisA = randomDirection();
  let axisB = randomDirection();
  if (Math.abs(axisA.dot(axisB)) > 0.88) axisB = new THREE.Vector3().crossVectors(axisA, new THREE.Vector3(0, 0, 1));
  if (axisB.lengthSq() < 0.001) axisB.set(0, 1, 0);
  axisB.normalize();
  const axisC = new THREE.Vector3().crossVectors(axisA, axisB).normalize();
  return {
    axisA,
    axisB,
    axisC,
    phases: new THREE.Vector3(random(), random(), random()).multiplyScalar(Math.PI * 2),
    frequencies: new THREE.Vector3(
      THREE.MathUtils.lerp(1.15, 1.75, random()),
      THREE.MathUtils.lerp(1.45, 2.15, random()),
      THREE.MathUtils.lerp(2.1, 3.0, random()),
    ),
    rotationAxis: randomDirection(),
  };
}

type PaperInspectionVisualConfiguration = {
  paperId: string;
  bodyColor: string;
  haloColor: string;
  source?: string;
  representative: boolean;
  representativeRank: number;
};

type PaperInspectionVisualFrame = {
  worldPosition: THREE.Vector3 | undefined;
  camera: THREE.PerspectiveCamera;
  viewportWidth: number;
  viewportHeight: number;
  inspectionBlend: number;
  projectedDiameterOverride?: number;
  dockBlend: number;
  centered: boolean;
  fullscreen: boolean;
  wideLayout: boolean;
  timeSeconds: number;
  motionStrength: number;
};

function createPaperInspectionVisual() {
  const object = new THREE.Group();
  object.visible = false;
  const dataSphere = createPaperInspectionDataSphere();
  const energyCore = createPaperInspectionEnergyCore();
  object.add(dataSphere.object, energyCore.object);
  let visualType: GalaxyPaperInspectionVisualType = "none";

  return {
    object,
    get hitObject() {
      return visualType === "energy-core" ? energyCore.hitObject : dataSphere.hitObject;
    },
    configure: (configuration: PaperInspectionVisualConfiguration) => {
      visualType = configuration.representative ? "energy-core" : "data-sphere";
      dataSphere.object.visible = false;
      energyCore.object.visible = false;
      if (visualType === "energy-core") {
        energyCore.configure(configuration);
      } else {
        dataSphere.configure(configuration.paperId, configuration.bodyColor, configuration.source);
      }
    },
    setVisual: (frame: PaperInspectionVisualFrame) => {
      object.visible = Boolean(frame.worldPosition && frame.inspectionBlend > 0.002);
      if (!object.visible) {
        dataSphere.object.visible = false;
        energyCore.object.visible = false;
        return;
      }
      if (visualType === "energy-core") {
        dataSphere.object.visible = false;
        energyCore.setVisual(frame);
      } else {
        energyCore.object.visible = false;
        dataSphere.setVisual(frame);
      }
    },
    getVisualState: () => {
      const state = visualType === "energy-core"
        ? energyCore.getVisualState()
        : visualType === "data-sphere"
          ? dataSphere.getVisualState()
          : {
              projectedDiameter: 0,
              viewportRatio: 0,
              drawCalls: 0,
              bloomDrawCalls: 0,
              energyDetailBlend: 0,
              energyBloomOpacity: 0,
              energyWispCount: 0,
              energyCarrierScale: 1,
              energyCloseupCompactness: 0,
              energyVisibleRadius: 0,
              energyBodyCoreDiameter: 0,
              energyBodyCoreBlend: 0,
              energyFresnelWidth: 0,
              energyOuterGlowDiameter: 0,
              energyOuterGlowMonotonic: true,
              energyMicroCoreDiameter: 0,
              energyMicroCoreBlend: 0,
              energySoftCoreAttenuation: 1,
              energyMicroCoreBrightness: 0,
            };
      return { ...state, visualType };
    },
    dispose: () => {
      dataSphere.dispose();
      energyCore.dispose();
    },
  };
}

function createPaperInspectionEnergyCore() {
  const object = new THREE.Group();
  object.visible = false;
  let projectedDiameter = 0;
  let viewportRatio = 0;
  let currentPaperId = "";
  let flowPeriodSeconds = 90;
  let energyProfile = createRepresentativeEnergyProfile("paper-default", 0);
  let detailBlend = 0;
  let bloomOpacity = 0;
  let closeupCompactness = 0;
  let visibleRadius = 1;
  let energyBodyStrength = 1;
  let outerGlowStrength = 0.065;
  let bodyCoreDiameter = 0;
  let bodyCoreBlend = 0;
  let fresnelWidth = 0;
  let outerGlowDiameter = 0;
  let microCoreDiameter = 0;
  let microCoreBlend = 0;
  let softCoreAttenuation = 1;
  const microCoreBrightness = APP17_REPRESENTATIVE_MICRO_CORE_BRIGHTNESS;
  const geometry = new THREE.PlaneGeometry(
    APP17_REPRESENTATIVE_ENERGY_CARRIER_SCALE,
    APP17_REPRESENTATIVE_ENERGY_CARRIER_SCALE,
    1,
    1,
  );
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uCoreColor: { value: new THREE.Color("#f4f7ff") },
      uHaloColor: { value: new THREE.Color("#8ea7ff") },
      uOpacity: { value: 0 },
      uRankStrength: { value: 1 },
      uTime: { value: 0 },
      uMotionStrength: { value: 1 },
      uPrimaryAngle: { value: energyProfile.primaryAngle },
      uSecondaryAngle: { value: energyProfile.secondaryAngle },
      uEccentricity: { value: energyProfile.eccentricity },
      uWispA: { value: new THREE.Vector4() },
      uWispB: { value: new THREE.Vector4() },
      uWispCount: { value: energyProfile.wispCount },
      uDetailBlend: { value: 0 },
      uCarrierScale: { value: APP17_REPRESENTATIVE_ENERGY_CARRIER_SCALE },
      uWispStrength: { value: 0 },
      uCloseupCompactness: { value: 0 },
      uOuterGlowStrength: { value: 0.065 },
      uEnergyBodyStrength: { value: 1 },
      uBodyCoreRadius: { value: 0.18 },
      uBodyCoreBlend: { value: 0 },
      uBodyCoreBrightness: { value: APP17_REPRESENTATIVE_BODY_CORE_BRIGHTNESS },
      uOuterHaloScale: { value: APP17_REPRESENTATIVE_OUTER_HALO_SCALE },
      uMicroCoreRadius: { value: 0.05 },
      uMicroCoreBlend: { value: 0 },
      uSoftCoreAttenuation: { value: 1 },
      uMicroCoreBrightness: { value: APP17_REPRESENTATIVE_MICRO_CORE_BRIGHTNESS },
    },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
    toneMapped: false,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uCoreColor;
      uniform vec3 uHaloColor;
      uniform float uOpacity;
      uniform float uRankStrength;
      uniform float uTime;
      uniform float uMotionStrength;
      uniform float uPrimaryAngle;
      uniform float uSecondaryAngle;
      uniform float uEccentricity;
      uniform vec4 uWispA;
      uniform vec4 uWispB;
      uniform float uWispCount;
      uniform float uDetailBlend;
      uniform float uCarrierScale;
      uniform float uWispStrength;
      uniform float uCloseupCompactness;
      uniform float uOuterGlowStrength;
      uniform float uEnergyBodyStrength;
      uniform float uBodyCoreRadius;
      uniform float uBodyCoreBlend;
      uniform float uBodyCoreBrightness;
      uniform float uOuterHaloScale;
      uniform float uMicroCoreRadius;
      uniform float uMicroCoreBlend;
      uniform float uSoftCoreAttenuation;
      uniform float uMicroCoreBrightness;
      varying vec2 vUv;
      ${REPRESENTATIVE_ENERGY_FIELD_GLSL}
      void main() {
        vec2 point = (vUv - vec2(0.5)) * 2.0;
        float core;
        float thermal;
        float innerGlow;
        float outerGlow;
        float wisps;
        sampleRepresentativeEnergy(
          point,
          uCarrierScale,
          uPrimaryAngle,
          uSecondaryAngle,
          uEccentricity,
          uWispA,
          uWispB,
          uWispCount,
          uDetailBlend * uWispStrength,
          uTime * uMotionStrength,
          uCloseupCompactness,
          core,
          thermal,
          innerGlow,
          outerGlow,
          wisps
        );
        float softCoreProgress = clamp((1.0 - uSoftCoreAttenuation) / 0.30, 0.0, 1.0);
        float rawEnergy = core * (0.72 * uSoftCoreAttenuation)
          + thermal * mix(0.32, 0.24, softCoreProgress)
          + innerGlow * 0.16 * uEnergyBodyStrength
          + outerGlow * uOuterGlowStrength
          + wisps;
        float energy = representativeBoundedEnergy(rawEnergy);
        float energyAlpha = energy * uOpacity * uRankStrength;
        vec3 hotWhite = vec3(1.0, 0.985, 0.95);
        vec3 energyColor = mix(uHaloColor, uCoreColor, clamp(thermal * 0.78 + innerGlow * 0.1, 0.0, 1.0));
        energyColor = mix(energyColor, hotWhite, clamp(core * 0.72 + thermal * 0.16, 0.0, 0.82));
        energyColor = min(vec3(1.0), energyColor + uHaloColor * wisps * 0.12);

        float opticalRadius = length(point) * uCarrierScale;
        float bodyRadius = max(uBodyCoreRadius, 0.0001);
        float bodyDistance = opticalRadius / bodyRadius;
        vec2 bodyPlane = point * (uCarrierScale / bodyRadius);
        float bodyAntialias = max(fwidth(bodyDistance) * 1.65, 0.012);
        float bodyMask = 1.0 - smoothstep(
          1.0 - bodyAntialias,
          1.0 + bodyAntialias,
          bodyDistance
        );
        float bodySurface = sqrt(max(0.0, 1.0 - bodyDistance * bodyDistance));
        vec3 bodyNormal = normalize(vec3(bodyPlane, bodySurface));
        vec3 bodyLightDirection = normalize(vec3(-0.24, 0.30, 0.92));
        float bodyDiffuse = clamp(dot(bodyNormal, bodyLightDirection), 0.0, 1.0);
        float limb = pow(bodySurface, 0.52);
        float bodyLuminance = mix(0.78, 1.0, limb) * mix(0.98, 1.035, bodyDiffuse);
        vec3 bodyTemperature = mix(uCoreColor, uHaloColor, 0.38);
        bodyTemperature = mix(bodyTemperature, vec3(0.72, 0.92, 0.90), 0.20);
        vec3 bodyColor = mix(bodyTemperature, hotWhite, 0.30 + limb * 0.18);
        bodyColor = min(vec3(1.0), bodyColor * bodyLuminance * uBodyCoreBrightness);
        float bodyRankFactor = mix(
          0.98,
          1.02,
          clamp((uRankStrength - 0.70) / 0.24, 0.0, 1.0)
        );
        float bodyVolumeAlpha = mix(0.48, 0.82, pow(bodySurface, 0.46));
        float bodyAlpha = bodyMask
          * uBodyCoreBlend
          * uOpacity
          * bodyVolumeAlpha
          * bodyRankFactor;

        float closeupEnergyAlpha = energy
          * bodyMask
          * mix(0.10, 0.18, bodySurface)
          * uOpacity
          * uRankStrength;
        energyAlpha = mix(energyAlpha, closeupEnergyAlpha, uBodyCoreBlend);

        float haloAngle = atan(point.y, point.x);
        float haloAsymmetry = 0.985
          + cos(haloAngle - uPrimaryAngle) * 0.010
          + cos(haloAngle * 2.0 + uSecondaryAngle) * 0.005;
        float haloRankOpacity = uBodyCoreBlend
          * uOpacity
          * mix(0.88, 1.0, uRankStrength);

        float bodyFresnel = pow(clamp(1.0 - bodySurface, 0.0, 1.0), 2.42);
        float fresnelEdgeGate = smoothstep(0.78, 0.98, bodyDistance);
        float fresnelLayerAlpha = min(
          0.72,
          bodyFresnel * fresnelEdgeGate * bodyMask * haloRankOpacity * 4.20
        );
        vec3 fresnelColor = mix(uHaloColor, hotWhite, 0.90);

        float outsideDistance = max(bodyDistance - 1.0, 0.0);
        float outsideGate = smoothstep(0.96, 1.04, bodyDistance);
        float carrierDistance = opticalRadius / max(bodyRadius * uOuterHaloScale, 0.0001);
        float carrierFade = 1.0 - smoothstep(0.78, 1.0, carrierDistance);
        float compactTail = exp(-outsideDistance * 2.35);
        float longTail = exp(-outsideDistance * 0.82);
        float outerLayerAlpha = min(
          0.72,
          outsideGate
            * carrierFade
            * haloAsymmetry
            * (compactTail * 0.60 + longTail * 0.20)
            * haloRankOpacity
        );
        vec3 outerHaloColor = mix(
          mix(uHaloColor, uCoreColor, 0.34),
          vec3(0.68, 0.90, 0.88),
          0.36
        );

        float microRadius = max(uMicroCoreRadius, 0.0001);
        float microDistance = opticalRadius / microRadius;
        float microAntialias = max(fwidth(microDistance), 0.012);
        float microMask = 1.0 - smoothstep(1.0 - microAntialias, 1.0 + microAntialias, microDistance);
        float microSurface = sqrt(max(0.0, 1.0 - microDistance * microDistance));
        float microFacing = pow(microSurface, 0.58);
        float microAlpha = microMask
          * uMicroCoreBlend
          * uOpacity
          * mix(0.91, 0.985, microFacing)
          * mix(0.96, 1.0, uRankStrength);
        vec3 microEdgeColor = mix(uCoreColor, hotWhite, 0.70);
        vec3 microColor = mix(microEdgeColor, vec3(1.0, 0.997, 0.985), microFacing * 0.88);
        microColor *= mix(0.82, uMicroCoreBrightness, microFacing);
        microColor = min(vec3(1.0), microColor);

        vec3 premultipliedColor = outerHaloColor * outerLayerAlpha;
        float alpha = outerLayerAlpha;
        premultipliedColor = bodyColor * bodyAlpha
          + premultipliedColor * (1.0 - bodyAlpha);
        alpha = bodyAlpha + alpha * (1.0 - bodyAlpha);
        premultipliedColor = energyColor * energyAlpha
          + premultipliedColor * (1.0 - energyAlpha);
        alpha = energyAlpha + alpha * (1.0 - energyAlpha);
        premultipliedColor = fresnelColor * fresnelLayerAlpha
          + premultipliedColor * (1.0 - fresnelLayerAlpha);
        alpha = fresnelLayerAlpha + alpha * (1.0 - fresnelLayerAlpha);
        premultipliedColor = microColor * microAlpha
          + premultipliedColor * (1.0 - microAlpha);
        alpha = microAlpha + alpha * (1.0 - microAlpha);
        if (alpha < 0.00025) discard;
        vec3 color = premultipliedColor / max(alpha, 0.0001);
        gl_FragColor = vec4(min(vec3(1.0), color), alpha);
      }
    `,
  });
  const core = new THREE.Mesh(geometry, material);
  core.frustumCulled = false;
  core.renderOrder = 11;
  object.add(core);

  const bloomMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color("#f8fbff") },
      uOpacity: { value: 0 },
      uCarrierScale: { value: APP17_REPRESENTATIVE_ENERGY_CARRIER_SCALE },
      uBloomWeight: { value: 0.18 },
      uMicroCoreRadius: { value: 0.05 },
      uMicroCoreBlend: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uCarrierScale;
      uniform float uBloomWeight;
      uniform float uMicroCoreRadius;
      uniform float uMicroCoreBlend;
      varying vec2 vUv;
      void main() {
        vec2 point = (vUv - vec2(0.5)) * 2.0;
        float opticalRadius = length(point) * uCarrierScale;
        float legacyCore = exp(-opticalRadius * opticalRadius * 92.0);
        float microDistance = opticalRadius / max(uMicroCoreRadius, 0.0001);
        float microCore = exp(-microDistance * microDistance * 2.8);
        float core = mix(legacyCore, microCore, uMicroCoreBlend);
        float alpha = core * 0.52 * uOpacity * uBloomWeight;
        if (alpha < 0.00025) discard;
        gl_FragColor = vec4(mix(uColor, vec3(1.0, 0.98, 0.95), 0.82), alpha);
      }
    `,
  });
  const bloom = new THREE.Mesh(geometry, bloomMaterial);
  bloom.layers.set(APP17_BLOOM_LAYER);
  bloom.frustumCulled = false;
  bloom.renderOrder = 5;
  object.add(bloom);

  const viewPosition = new THREE.Vector3();
  return {
    object,
    hitObject: core,
    configure: (configuration: PaperInspectionVisualConfiguration) => {
      const seed = stableHash(`${configuration.paperId}:inspection-energy`) / 4294967295;
      if (configuration.paperId !== currentPaperId) {
        currentPaperId = configuration.paperId;
        flowPeriodSeconds = THREE.MathUtils.lerp(70, 110, seed);
      }
      const rankStrength = THREE.MathUtils.lerp(
        1,
        0.7,
        THREE.MathUtils.clamp(configuration.representativeRank / 9, 0, 1),
      );
      material.uniforms.uCoreColor.value.set(configuration.bodyColor || "#f4f7ff");
      material.uniforms.uHaloColor.value.set(configuration.haloColor || "#8ea7ff");
      material.uniforms.uRankStrength.value = rankStrength;
      energyProfile = createRepresentativeEnergyProfile(
        configuration.paperId,
        configuration.representativeRank,
      );
      material.uniforms.uPrimaryAngle.value = energyProfile.primaryAngle;
      material.uniforms.uSecondaryAngle.value = energyProfile.secondaryAngle;
      material.uniforms.uEccentricity.value = energyProfile.eccentricity;
      material.uniforms.uWispA.value.set(
        energyProfile.wisps[0].angle,
        energyProfile.wisps[0].width,
        energyProfile.wisps[0].curvature,
        energyProfile.wisps[0].strength,
      );
      material.uniforms.uWispB.value.set(
        energyProfile.wisps[1].angle,
        energyProfile.wisps[1].width,
        energyProfile.wisps[1].curvature,
        energyProfile.wisps[1].strength,
      );
      material.uniforms.uWispCount.value = energyProfile.wispCount;
      material.uniforms.uWispStrength.value = rankStrength;
      bloomMaterial.uniforms.uColor.value.set(configuration.bodyColor || "#f8fbff");
    },
    setVisual: ({
      worldPosition,
      camera,
      viewportWidth,
      viewportHeight,
      inspectionBlend,
      projectedDiameterOverride,
      timeSeconds,
      motionStrength,
    }: PaperInspectionVisualFrame) => {
      if (!worldPosition || viewportWidth < 1 || viewportHeight < 1 || inspectionBlend <= 0.002) {
        object.visible = false;
        projectedDiameter = 0;
        viewportRatio = 0;
        bodyCoreDiameter = 0;
        bodyCoreBlend = 0;
        fresnelWidth = 0;
        outerGlowDiameter = 0;
        microCoreDiameter = 0;
        microCoreBlend = 0;
        return;
      }
      const inspectionWorldDiameter = APP17_PAPER_INSPECTION_WORLD_DIAMETER
        * APP17_REPRESENTATIVE_INSPECTION_SCALE;
      viewPosition.copy(worldPosition).applyMatrix4(camera.matrixWorldInverse);
      const viewDepth = -viewPosition.z;
      if (viewDepth <= camera.near) {
        object.visible = false;
        projectedDiameter = 0;
        viewportRatio = 0;
        bodyCoreDiameter = 0;
        bodyCoreBlend = 0;
        fresnelWidth = 0;
        outerGlowDiameter = 0;
        microCoreDiameter = 0;
        microCoreBlend = 0;
        return;
      }
      const effectiveFov = THREE.MathUtils.degToRad(camera.getEffectiveFOV());
      const visibleWorldHeight = 2 * viewDepth * Math.tan(effectiveFov * 0.5);
      const naturalProjectedDiameter = inspectionWorldDiameter
        * viewportHeight / Math.max(0.0001, visibleWorldHeight);
      const renderedProjectedDiameter = Number.isFinite(projectedDiameterOverride)
        && (projectedDiameterOverride ?? 0) > 0
        ? (projectedDiameterOverride ?? naturalProjectedDiameter)
        : naturalProjectedDiameter;
      const projectionScale = renderedProjectedDiameter / Math.max(0.0001, naturalProjectedDiameter);
      object.position.copy(worldPosition);
      object.quaternion.copy(camera.quaternion);
      object.scale.setScalar(inspectionWorldDiameter * projectionScale);
      projectedDiameter = renderedProjectedDiameter;
      viewportRatio = projectedDiameter / Math.max(1, viewportHeight);
      const opacity = smootherStep(inspectionBlend);
      detailBlend = smoothStepRange(
        APP17_REPRESENTATIVE_ENERGY_DETAIL_START_PX,
        APP17_REPRESENTATIVE_ENERGY_DETAIL_END_PX,
        projectedDiameter,
      );
      closeupCompactness = smoothStepRange(
        120,
        260,
        projectedDiameter,
      );
      bodyCoreBlend = smoothStepRange(
        APP17_REPRESENTATIVE_BODY_CORE_START_PX,
        APP17_REPRESENTATIVE_BODY_CORE_END_PX,
        projectedDiameter,
      );
      bodyCoreDiameter = THREE.MathUtils.clamp(
        projectedDiameter * APP17_REPRESENTATIVE_BODY_CORE_RATIO,
        APP17_REPRESENTATIVE_BODY_CORE_MIN_DIAMETER_PX,
        APP17_REPRESENTATIVE_BODY_CORE_MAX_DIAMETER_PX,
      );
      fresnelWidth = THREE.MathUtils.clamp(bodyCoreDiameter * 0.045, 3, 6);
      outerGlowDiameter = bodyCoreDiameter * 3.2;
      microCoreBlend = bodyCoreBlend;
      microCoreDiameter = THREE.MathUtils.clamp(
        bodyCoreDiameter * APP17_REPRESENTATIVE_MICRO_CORE_RATIO,
        APP17_REPRESENTATIVE_MICRO_CORE_MIN_DIAMETER_PX,
        APP17_REPRESENTATIVE_MICRO_CORE_MAX_DIAMETER_PX,
      );
      const bodyCoreRadius = bodyCoreDiameter / Math.max(1, projectedDiameter);
      const microCoreRadius = microCoreDiameter / Math.max(1, projectedDiameter);
      softCoreAttenuation = THREE.MathUtils.lerp(1, 0.56, bodyCoreBlend);
      visibleRadius = THREE.MathUtils.lerp(1, 0.72, closeupCompactness);
      energyBodyStrength = THREE.MathUtils.lerp(1, 0.56, bodyCoreBlend);
      outerGlowStrength = THREE.MathUtils.lerp(0.065, 0.017, bodyCoreBlend);
      const legacyBloomOpacity = THREE.MathUtils.lerp(
        0.18,
        0.08,
        smoothStepRange(
          APP17_REPRESENTATIVE_ENERGY_DETAIL_START_PX,
          APP17_REPRESENTATIVE_ENERGY_NEAR_BLOOM_END_PX,
          projectedDiameter,
        ),
      );
      bloomOpacity = THREE.MathUtils.lerp(
        legacyBloomOpacity,
        APP17_REPRESENTATIVE_MICRO_CORE_BLOOM_WEIGHT,
        bodyCoreBlend,
      );
      material.uniforms.uCloseupCompactness.value = closeupCompactness;
      material.uniforms.uOuterGlowStrength.value = outerGlowStrength;
      material.uniforms.uEnergyBodyStrength.value = energyBodyStrength;
      material.uniforms.uBodyCoreRadius.value = bodyCoreRadius;
      material.uniforms.uBodyCoreBlend.value = bodyCoreBlend;
      material.uniforms.uBodyCoreBrightness.value = APP17_REPRESENTATIVE_BODY_CORE_BRIGHTNESS;
      material.uniforms.uOuterHaloScale.value = APP17_REPRESENTATIVE_OUTER_HALO_SCALE;
      material.uniforms.uMicroCoreRadius.value = microCoreRadius;
      material.uniforms.uMicroCoreBlend.value = microCoreBlend;
      material.uniforms.uSoftCoreAttenuation.value = softCoreAttenuation;
      material.uniforms.uMicroCoreBrightness.value = microCoreBrightness;
      material.uniforms.uOpacity.value = opacity;
      material.uniforms.uTime.value = (timeSeconds / flowPeriodSeconds) * Math.PI * 2;
      material.uniforms.uMotionStrength.value = motionStrength;
      material.uniforms.uDetailBlend.value = detailBlend;
      bloomMaterial.uniforms.uOpacity.value = opacity;
      bloomMaterial.uniforms.uBloomWeight.value = bloomOpacity;
      bloomMaterial.uniforms.uMicroCoreRadius.value = microCoreRadius;
      bloomMaterial.uniforms.uMicroCoreBlend.value = microCoreBlend;
      object.visible = true;
      object.updateMatrixWorld(true);
    },
    getVisualState: () => ({
      projectedDiameter,
      viewportRatio,
      drawCalls: object.visible ? 2 : 0,
      bloomDrawCalls: object.visible ? 1 : 0,
      energyDetailBlend: detailBlend,
      energyBloomOpacity: bloomOpacity,
      energyWispCount: energyProfile.wispCount,
      energyCarrierScale: APP17_REPRESENTATIVE_ENERGY_CARRIER_SCALE,
      energyCloseupCompactness: closeupCompactness,
      energyVisibleRadius: visibleRadius,
      energyBodyCoreDiameter: bodyCoreDiameter,
      energyBodyCoreBlend: bodyCoreBlend,
      energyFresnelWidth: fresnelWidth,
      energyOuterGlowDiameter: outerGlowDiameter,
      energyOuterGlowMonotonic: true,
      energyMicroCoreDiameter: microCoreDiameter,
      energyMicroCoreBlend: microCoreBlend,
      energySoftCoreAttenuation: softCoreAttenuation,
      energyMicroCoreBrightness: microCoreBrightness,
    }),
    dispose: () => {
      geometry.dispose();
      material.dispose();
      bloomMaterial.dispose();
    },
  };
}

function createPaperInspectionDataSphere() {
  const object = new THREE.Group();
  object.visible = false;
  object.scale.setScalar(APP17_PAPER_INSPECTION_WORLD_DIAMETER);
  let projectedDiameter = 0;
  let viewportRatio = 0;
  let currentPaperId = "";
  let rotationSpeed = 0.055;
  let surfaceProfile = createPaperSurfaceProfile("paper-default");
  const bodyGeometry = new THREE.SphereGeometry(0.5, 48, 32);
  const bodyMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uBodyColor: { value: new THREE.Color("#eef3ff") },
      uAxisA: { value: surfaceProfile.axisA.clone() },
      uAxisB: { value: surfaceProfile.axisB.clone() },
      uAxisC: { value: surfaceProfile.axisC.clone() },
      uPhases: { value: surfaceProfile.phases.clone() },
      uFrequencies: { value: surfaceProfile.frequencies.clone() },
      uOpacity: { value: 0 },
    },
    transparent: true,
    depthWrite: true,
    depthTest: true,
    toneMapped: false,
    vertexShader: `
      varying vec3 vLocalDirection;
      varying vec3 vNormalView;
      varying vec3 vViewDirection;
      void main() {
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        vLocalDirection = normalize(position);
        vNormalView = normalize(normalMatrix * normal);
        vViewDirection = normalize(-viewPosition.xyz);
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uBodyColor;
      uniform vec3 uAxisA;
      uniform vec3 uAxisB;
      uniform vec3 uAxisC;
      uniform vec3 uPhases;
      uniform vec3 uFrequencies;
      uniform float uOpacity;
      varying vec3 vLocalDirection;
      varying vec3 vNormalView;
      varying vec3 vViewDirection;
      void main() {
        vec3 direction = normalize(vLocalDirection);
        vec3 normalView = normalize(vNormalView);
        float facing = clamp(dot(normalView, normalize(vViewDirection)), 0.0, 1.0);
        float bandA = sin(dot(direction, uAxisA) * uFrequencies.x * 6.2831853 + uPhases.x);
        float bandB = sin(dot(direction, uAxisB) * uFrequencies.y * 6.2831853 + uPhases.y);
        float veinWave = sin(
          dot(direction, uAxisC) * uFrequencies.z * 6.2831853
          + bandA * 0.72
          + uPhases.z
        );
        float broadField = bandA * 0.075 + bandB * 0.052;
        float vein = smoothstep(0.66, 0.97, abs(veinWave)) * 0.06;
        vec3 lightDirection = normalize(vec3(-0.46, 0.32, 0.83));
        float diffuse = clamp(dot(normalView, lightDirection) * 0.31 + 0.69, 0.34, 1.0);
        float limb = mix(0.56, 1.0, pow(facing, 0.58));
        vec3 highTemperature = mix(uBodyColor, vec3(1.0), 0.62);
        vec3 lowTemperature = uBodyColor * 0.72;
        float thermal = clamp(0.58 + broadField + vein, 0.38, 0.78);
        vec3 body = mix(lowTemperature, highTemperature, thermal) * diffuse * limb;
        body = vec3(1.0) - exp(-max(body, vec3(0.0)) * 1.18);
        float edgeFade = smoothstep(0.018, 0.16, facing);
        float alpha = uOpacity * edgeFade;
        if (alpha < 0.002) discard;
        gl_FragColor = vec4(body, alpha);
      }
    `,
  });
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.renderOrder = 10;
  body.frustumCulled = false;
  object.add(body);

  const atmosphereGeometry = new THREE.SphereGeometry(0.525, 40, 28);
  const atmosphereMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uAtmosphereColor: { value: new THREE.Color("#b9c8dc") },
      uOpacity: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    vertexShader: `
      varying vec3 vNormalView;
      varying vec3 vViewDirection;
      void main() {
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        vNormalView = normalize(normalMatrix * normal);
        vViewDirection = normalize(-viewPosition.xyz);
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uAtmosphereColor;
      uniform float uOpacity;
      varying vec3 vNormalView;
      varying vec3 vViewDirection;
      void main() {
        float facing = clamp(dot(normalize(vNormalView), normalize(vViewDirection)), 0.0, 1.0);
        float rim = pow(1.0 - facing, 3.8);
        float alpha = uOpacity * rim * smoothstep(0.0, 0.2, facing);
        if (alpha < 0.002) discard;
        gl_FragColor = vec4(uAtmosphereColor * (0.54 + rim * 0.28), alpha);
      }
    `,
  });
  const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
  atmosphere.renderOrder = 9;
  atmosphere.frustumCulled = false;
  object.add(atmosphere);

  const viewPosition = new THREE.Vector3();
  return {
    object,
    hitObject: body,
    configure: (paperId: string, bodyColor: string, source?: string) => {
      if (paperId !== currentPaperId) {
        currentPaperId = paperId;
        surfaceProfile = createPaperSurfaceProfile(paperId);
        bodyMaterial.uniforms.uAxisA.value.copy(surfaceProfile.axisA);
        bodyMaterial.uniforms.uAxisB.value.copy(surfaceProfile.axisB);
        bodyMaterial.uniforms.uAxisC.value.copy(surfaceProfile.axisC);
        bodyMaterial.uniforms.uPhases.value.copy(surfaceProfile.phases);
        bodyMaterial.uniforms.uFrequencies.value.copy(surfaceProfile.frequencies);
        rotationSpeed = THREE.MathUtils.lerp(0.042, 0.068, stableHash(`${paperId}:rotation-speed`) / 4294967295);
      }
      bodyMaterial.uniforms.uBodyColor.value.set(bodyColor || "#eef3ff");
      atmosphereMaterial.uniforms.uAtmosphereColor.value.set(sourceOrbitColor(source || ""));
    },
    setVisual: ({
      worldPosition,
      camera,
      viewportWidth,
      viewportHeight,
      inspectionBlend,
      projectedDiameterOverride,
      timeSeconds,
    }: {
      worldPosition: THREE.Vector3 | undefined;
      camera: THREE.PerspectiveCamera;
      viewportWidth: number;
      viewportHeight: number;
      inspectionBlend: number;
      projectedDiameterOverride?: number;
      dockBlend: number;
      centered: boolean;
      fullscreen: boolean;
      wideLayout: boolean;
      timeSeconds: number;
      motionStrength: number;
    }) => {
      if (!worldPosition || viewportWidth < 1 || viewportHeight < 1 || inspectionBlend <= 0.002) {
        object.visible = false;
        projectedDiameter = 0;
        viewportRatio = 0;
        return;
      }
      viewPosition.copy(worldPosition).applyMatrix4(camera.matrixWorldInverse);
      const viewDepth = -viewPosition.z;
      if (viewDepth <= camera.near) {
        object.visible = false;
        projectedDiameter = 0;
        viewportRatio = 0;
        return;
      }
      const effectiveFov = THREE.MathUtils.degToRad(camera.getEffectiveFOV());
      const visibleWorldHeight = 2 * viewDepth * Math.tan(effectiveFov * 0.5);
      const naturalProjectedDiameter = APP17_PAPER_INSPECTION_WORLD_DIAMETER
        * viewportHeight / Math.max(0.0001, visibleWorldHeight);
      const renderedProjectedDiameter = Number.isFinite(projectedDiameterOverride)
        && (projectedDiameterOverride ?? 0) > 0
        ? (projectedDiameterOverride ?? naturalProjectedDiameter)
        : naturalProjectedDiameter;
      const projectionScale = renderedProjectedDiameter / Math.max(0.0001, naturalProjectedDiameter);
      object.position.copy(worldPosition);
      object.scale.setScalar(APP17_PAPER_INSPECTION_WORLD_DIAMETER * projectionScale);
      projectedDiameter = renderedProjectedDiameter;
      viewportRatio = projectedDiameter / Math.max(1, viewportHeight);
      const opacity = smootherStep(inspectionBlend);
      bodyMaterial.uniforms.uOpacity.value = opacity;
      atmosphereMaterial.uniforms.uOpacity.value = opacity * 0.11;
      object.quaternion.setFromAxisAngle(surfaceProfile.rotationAxis, timeSeconds * rotationSpeed);
      object.visible = true;
      object.updateMatrixWorld(true);
    },
    getVisualState: () => ({
      projectedDiameter,
      viewportRatio,
      drawCalls: object.visible ? 2 : 0,
      bloomDrawCalls: 0,
      energyDetailBlend: 0,
      energyBloomOpacity: 0,
      energyWispCount: 0,
      energyCarrierScale: 1,
      energyCloseupCompactness: 0,
      energyVisibleRadius: 0,
      energyBodyCoreDiameter: 0,
      energyBodyCoreBlend: 0,
      energyFresnelWidth: 0,
      energyOuterGlowDiameter: 0,
      energyOuterGlowMonotonic: true,
      energyMicroCoreDiameter: 0,
      energyMicroCoreBlend: 0,
      energySoftCoreAttenuation: 1,
      energyMicroCoreBrightness: 0,
    }),
    dispose: () => {
      bodyGeometry.dispose();
      atmosphereGeometry.dispose();
      bodyMaterial.dispose();
      atmosphereMaterial.dispose();
    },
  };
}

function createSystemStar(hotspot: App17GalaxyHotspotPoint) {
  const object = new THREE.Group();
  const color = new THREE.Color(hotspot.color || "#7dd3fc");
  let projectedDiameter = 0;
  let viewportRatio = 0;
  let bodyBlend = 0;
  let farCoreBlend = 1;
  let coronaBlend = 1;
  let coronaCssExtension = 18;
  let surfaceDetailBlend = 0;
  let depthOcclusionActive = false;
  let surfaceBloomBlend = 0;
  let coronaCloseupBlend = 1;
  let sceneOpacity = 1;
  let focusAttenuation = 1;
  let lod: GalaxySystemStarLod = "far";
  let rotationAngle = 0;
  let motionActive = true;
  const starSeed = stableHash(`${hotspot.id}:system-star`) / 4294967295;
  const coronaProfile = createGalaxyCoronaProfile(hotspot);

  const impostorGeometry = new THREE.PlaneGeometry(2, 2, 1, 1);
  const impostorMaterial = createSystemImpostorMaterial(color, coronaProfile, starSeed);
  const impostor = new THREE.Mesh(impostorGeometry, impostorMaterial);
  impostor.frustumCulled = false;
  impostor.renderOrder = 5;
  object.add(impostor);
  const bloomCoreMaterial = createSystemBloomCoreMaterial(color);
  const bloomCore = new THREE.Mesh(impostorGeometry, bloomCoreMaterial);
  bloomCore.frustumCulled = false;
  bloomCore.renderOrder = 8;
  bloomCore.layers.set(APP17_BLOOM_LAYER);
  object.add(bloomCore);

  const photosphereGeometry = new THREE.SphereGeometry(APP17_SYSTEM_STAR_RADIUS, 96, 64);
  const depthMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
  depthMaterial.colorWrite = false;
  depthMaterial.depthWrite = true;
  depthMaterial.depthTest = true;
  depthMaterial.depthFunc = THREE.LessEqualDepth;
  const depthOccluder = new THREE.Mesh(photosphereGeometry, depthMaterial);
  depthOccluder.renderOrder = 1;
  depthOccluder.visible = false;
  depthOccluder.layers.enable(APP17_BLOOM_LAYER);
  object.add(depthOccluder);

  const photosphereMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: color },
      uSceneOpacity: { value: 1 },
      uBodyBlend: { value: 0 },
      uSurfaceDetailBlend: { value: 0 },
      uRotationAngle: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
    vertexShader: `
      varying vec3 vNormalView;
      varying vec3 vViewDirection;
      varying vec3 vLocalPosition;
      void main() {
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        vNormalView = normalize(normalMatrix * normal);
        vViewDirection = normalize(-viewPosition.xyz);
        vLocalPosition = position / ${APP17_SYSTEM_STAR_RADIUS.toFixed(2)};
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uSceneOpacity;
      uniform float uBodyBlend;
      uniform float uSurfaceDetailBlend;
      uniform float uRotationAngle;
      varying vec3 vNormalView;
      varying vec3 vViewDirection;
      varying vec3 vLocalPosition;
      float hash31(vec3 point) {
        point = fract(point * 0.1031);
        point += dot(point, point.yzx + 33.33);
        return fract((point.x + point.y) * point.z);
      }
      float valueNoise(vec3 point) {
        vec3 cell = floor(point);
        vec3 local = fract(point);
        local = local * local * (3.0 - 2.0 * local);
        float n000 = hash31(cell + vec3(0.0, 0.0, 0.0));
        float n100 = hash31(cell + vec3(1.0, 0.0, 0.0));
        float n010 = hash31(cell + vec3(0.0, 1.0, 0.0));
        float n110 = hash31(cell + vec3(1.0, 1.0, 0.0));
        float n001 = hash31(cell + vec3(0.0, 0.0, 1.0));
        float n101 = hash31(cell + vec3(1.0, 0.0, 1.0));
        float n011 = hash31(cell + vec3(0.0, 1.0, 1.0));
        float n111 = hash31(cell + vec3(1.0, 1.0, 1.0));
        float nx00 = mix(n000, n100, local.x);
        float nx10 = mix(n010, n110, local.x);
        float nx01 = mix(n001, n101, local.x);
        float nx11 = mix(n011, n111, local.x);
        return mix(mix(nx00, nx10, local.y), mix(nx01, nx11, local.y), local.z);
      }
      float fbm(vec3 point) {
        float value = 0.0;
        float amplitude = 0.54;
        mat3 basis = mat3(
          0.00, 0.80, 0.60,
          -0.80, 0.36, -0.48,
          -0.60, -0.48, 0.64
        );
        for (int octave = 0; octave < 4; octave += 1) {
          value += valueNoise(point) * amplitude;
          point = basis * point * 2.03 + vec3(1.7, 3.1, 2.2);
          amplitude *= 0.5;
        }
        return value;
      }
      vec3 rotateAroundAxis(vec3 point, vec3 axis, float angle) {
        float cosine = cos(angle);
        float sine = sin(angle);
        return point * cosine
          + cross(axis, point) * sine
          + axis * dot(axis, point) * (1.0 - cosine);
      }
      void main() {
        float facing = clamp(dot(normalize(vNormalView), normalize(vViewDirection)), 0.0, 1.0);
        vec3 rotationAxis = normalize(vec3(0.258819, 0.0, 0.965926));
        vec3 samplePosition = rotateAroundAxis(vLocalPosition, rotationAxis, -uRotationAngle);
        float convection = fbm(samplePosition * 1.18 + vec3(7.4, 2.1, 4.8));
        vec3 warpedPosition = samplePosition + vec3(
          convection - 0.5,
          fbm(samplePosition.yzx * 1.36 + vec3(2.8, 5.4, 1.2)) - 0.5,
          fbm(samplePosition.zxy * 1.52 + vec3(4.2, 1.1, 6.7)) - 0.5
        ) * 0.24;
        float filament = fbm(warpedPosition.yzx * 3.1 + vec3(1.8, 8.2, 3.5));
        float fineStructure = fbm(warpedPosition * 8.4 + vec3(5.2, 0.8, 9.1));
        float microStructure = fbm(warpedPosition.zxy * 15.2 + vec3(0.7, 6.2, 3.8));
        float broadActivity = convection - 0.5;
        float flowingActivity = filament - 0.5;
        float fineRidge = pow(max(0.0, 1.0 - abs(fineStructure * 2.0 - 1.0)), 4.0);
        float microRidge = pow(max(0.0, 1.0 - abs(microStructure * 2.0 - 1.0)), 5.0);
        float networkActivity = ((fineRidge - 0.34) * 0.055 + (microRidge - 0.28) * 0.035) * uSurfaceDetailBlend;
        float activity = broadActivity * 0.26
          + flowingActivity * 0.18
          + (fineStructure - 0.5) * mix(0.025, 0.075, uSurfaceDetailBlend)
          + (microStructure - 0.5) * 0.045 * uSurfaceDetailBlend
          + networkActivity;
        float cellNetwork = smoothstep(0.52, 0.84, fineRidge) * uSurfaceDetailBlend;
        float hotRegion = smoothstep(0.17, 0.3, activity);
        float limb = mix(0.52, 1.0, pow(facing, 0.38));
        float centerHeat = pow(facing, 1.45);
        vec3 highTemperature = vec3(1.0, 0.955, 0.86);
        float fieldLuminance = dot(uColor, vec3(0.2126, 0.7152, 0.0722));
        vec3 restrainedField = mix(vec3(fieldLuminance), uColor, 0.7);
        vec3 chromaticBody = mix(
          restrainedField * 0.72,
          highTemperature,
          0.42 + hotRegion * 0.1
        );
        vec3 body = chromaticBody * (0.62 + limb * 0.35 + activity * 0.86 + networkActivity * 0.18);
        body *= 1.0 - cellNetwork * uSurfaceDetailBlend * 0.11;
        body = mix(body, highTemperature * (0.96 + activity * 0.1), hotRegion * 0.07);
        body = mix(body, highTemperature, centerHeat * 0.08);
        body = vec3(1.0) - exp(-max(body, vec3(0.0)) * 1.5);
        float bodyOpacity = smoothstep(0.04, 0.92, uBodyBlend);
        float alpha = uSceneOpacity * bodyOpacity;
        if (alpha < 0.002) discard;
        gl_FragColor = vec4(body, alpha);
      }
    `,
  });
  const photosphere = new THREE.Mesh(photosphereGeometry, photosphereMaterial);
  photosphere.renderOrder = 6;
  object.add(photosphere);
  const surfaceBloomMaterial = createSystemSurfaceBloomMaterial(color);
  const surfaceBloom = new THREE.Mesh(photosphereGeometry, surfaceBloomMaterial);
  surfaceBloom.layers.set(APP17_BLOOM_LAYER);
  surfaceBloom.renderOrder = 2;
  surfaceBloom.visible = false;
  object.add(surfaceBloom);
  const magneticLayer = createSystemMagneticLayer(color, starSeed);
  object.add(magneticLayer.object);

  const applySceneOpacity = () => {
    const opacity = sceneOpacity * focusAttenuation;
    impostorMaterial.uniforms.uSceneOpacity.value = opacity;
    bloomCoreMaterial.uniforms.uSceneOpacity.value = opacity;
    photosphereMaterial.uniforms.uSceneOpacity.value = opacity;
    surfaceBloomMaterial.uniforms.uSceneOpacity.value = opacity;
    depthOccluder.visible = depthOcclusionActive && sceneOpacity > 0.92;
    magneticLayer.setOpacity(opacity);
  };

  const worldPosition = new THREE.Vector3();
  const worldScale = new THREE.Vector3();
  const viewPosition = new THREE.Vector3();

  return {
    object,
    setOpacity: (opacity: number) => {
      sceneOpacity = opacity;
      applySceneOpacity();
    },
    setFocusAttenuation: (attenuation: number) => {
      focusAttenuation = THREE.MathUtils.clamp(attenuation, 0, 1);
      applySceneOpacity();
    },
    setAnimation: (timeSeconds: number, motionStrength: number) => {
      motionActive = motionStrength > 0.001;
      rotationAngle = ((timeSeconds / APP17_SYSTEM_STAR_ROTATION_PERIOD_SECONDS) * Math.PI * 2) % (Math.PI * 2);
      photosphereMaterial.uniforms.uRotationAngle.value = rotationAngle;
      surfaceBloomMaterial.uniforms.uRotationAngle.value = rotationAngle;
      impostorMaterial.uniforms.uTime.value = timeSeconds;
      impostorMaterial.uniforms.uRotationAngle.value = rotationAngle;
      impostorMaterial.uniforms.uMotionStrength.value = motionStrength;
      magneticLayer.setAnimation(rotationAngle * 0.65, motionStrength);
    },
    updateProjection: (camera: THREE.PerspectiveCamera, viewportWidth: number, viewportHeight: number) => {
      if (viewportWidth < 1 || viewportHeight < 1) return false;
      object.getWorldPosition(worldPosition);
      object.getWorldScale(worldScale);
      viewPosition.copy(worldPosition).applyMatrix4(camera.matrixWorldInverse);
      const viewDepth = -viewPosition.z;
      if (viewDepth <= camera.near) return false;
      const effectiveFov = THREE.MathUtils.degToRad(camera.getEffectiveFOV());
      const visibleWorldHeight = 2 * viewDepth * Math.tan(effectiveFov * 0.5);
      const bodyWorldDiameter = APP17_SYSTEM_STAR_RADIUS * 2 * Math.max(worldScale.x, worldScale.y, worldScale.z);
      const nextProjectedDiameter = bodyWorldDiameter * viewportHeight / Math.max(0.0001, visibleWorldHeight);
      const nextViewportRatio = nextProjectedDiameter / Math.max(1, viewportHeight);
      const nextBodyBlend = smoothStepRange(
        APP17_SYSTEM_STAR_FAR_MAX_VIEWPORT_RATIO,
        APP17_SYSTEM_STAR_NEAR_MIN_VIEWPORT_RATIO,
        nextViewportRatio,
      );
      const nextFarCoreBlend = 1 - smoothStepRange(0.72, 0.96, nextBodyBlend);
      const nextSurfaceDetailBlend = smoothStepRange(0.22, 0.55, nextViewportRatio);
      const nextDepthOcclusionActive = nextBodyBlend >= 0.94;
      const nextSurfaceBloomBlend = smoothStepRange(0.18, 0.36, nextViewportRatio);
      const nextCoronaCloseupBlend = 1 - smoothStepRange(0.45, 0.85, nextViewportRatio) * 0.72;
      const nextCoronaBlend = nextCoronaCloseupBlend;
      const nextLod: GalaxySystemStarLod = nextViewportRatio <= APP17_SYSTEM_STAR_FAR_MAX_VIEWPORT_RATIO
        ? "far"
        : nextViewportRatio < APP17_SYSTEM_STAR_NEAR_MIN_VIEWPORT_RATIO
          ? "transition"
          : nextViewportRatio < APP17_SYSTEM_STAR_SURFACE_MIN_VIEWPORT_RATIO
            ? "near"
            : "surface";
      const coreCssDiameter = THREE.MathUtils.clamp(nextProjectedDiameter * 0.18, 10, 24);
      const nextCoronaCssExtension = THREE.MathUtils.clamp(nextProjectedDiameter * 0.14, 10, 52);
      const spriteCssSize = Math.max(
        coreCssDiameter + nextCoronaCssExtension * 2.1,
        nextProjectedDiameter + nextCoronaCssExtension * 2.1,
      );
      const bloomSpriteCssSize = coreCssDiameter * 2.8;
      const changed = Math.abs(nextProjectedDiameter - projectedDiameter) > 0.05
        || Math.abs(nextViewportRatio - viewportRatio) > 0.0001
        || Math.abs(nextBodyBlend - bodyBlend) > 0.001
        || Math.abs(nextFarCoreBlend - farCoreBlend) > 0.001
        || Math.abs(nextSurfaceDetailBlend - surfaceDetailBlend) > 0.001
        || Math.abs(nextSurfaceBloomBlend - surfaceBloomBlend) > 0.001
        || nextDepthOcclusionActive !== depthOcclusionActive
        || nextLod !== lod;
      projectedDiameter = nextProjectedDiameter;
      viewportRatio = nextViewportRatio;
      bodyBlend = nextBodyBlend;
      farCoreBlend = nextFarCoreBlend;
      coronaBlend = nextCoronaBlend;
      coronaCssExtension = nextCoronaCssExtension;
      surfaceDetailBlend = nextSurfaceDetailBlend;
      depthOcclusionActive = nextDepthOcclusionActive;
      surfaceBloomBlend = nextSurfaceBloomBlend;
      coronaCloseupBlend = nextCoronaCloseupBlend;
      lod = nextLod;
      impostorMaterial.uniforms.uViewport.value.set(viewportWidth, viewportHeight);
      impostorMaterial.uniforms.uSpriteCssSize.value = spriteCssSize;
      impostorMaterial.uniforms.uProjectedBodyDiameter.value = projectedDiameter;
      impostorMaterial.uniforms.uCoreCssDiameter.value = coreCssDiameter;
      impostorMaterial.uniforms.uCoronaCssExtension.value = coronaCssExtension;
      impostorMaterial.uniforms.uBodyBlend.value = bodyBlend;
      impostorMaterial.uniforms.uFarCoreBlend.value = farCoreBlend;
      impostorMaterial.uniforms.uCoronaBlend.value = coronaBlend;
      bloomCoreMaterial.uniforms.uViewport.value.set(viewportWidth, viewportHeight);
      bloomCoreMaterial.uniforms.uSpriteCssSize.value = bloomSpriteCssSize;
      bloomCoreMaterial.uniforms.uProjectedBodyDiameter.value = projectedDiameter;
      bloomCoreMaterial.uniforms.uCoreCssDiameter.value = coreCssDiameter;
      bloomCoreMaterial.uniforms.uBodyBlend.value = bodyBlend;
      bloomCoreMaterial.uniforms.uFarCoreBlend.value = farCoreBlend;
      photosphereMaterial.uniforms.uBodyBlend.value = bodyBlend;
      photosphereMaterial.uniforms.uSurfaceDetailBlend.value = surfaceDetailBlend;
      surfaceBloomMaterial.uniforms.uBodyBlend.value = bodyBlend;
      surfaceBloomMaterial.uniforms.uSurfaceDetailBlend.value = surfaceDetailBlend;
      surfaceBloomMaterial.uniforms.uSurfaceBloomBlend.value = surfaceBloomBlend;
      magneticLayer.setLodBlend(bodyBlend);
      photosphere.visible = bodyBlend > 0.001;
      bloomCore.visible = farCoreBlend > 0.001;
      surfaceBloom.visible = surfaceBloomBlend > 0.001 && sceneOpacity > 0.001;
      depthOccluder.visible = depthOcclusionActive && sceneOpacity > 0.92;
      return changed;
    },
    getVisualState: () => ({
      projectedDiameter,
      viewportRatio,
      lod,
      bodyBlend,
      farCoreBlend,
      coronaBlend,
      coronaCssExtension,
      surfaceDetailBlend,
      depthOcclusionActive,
      surfaceBloomBlend,
      coronaCloseupBlend,
      rotationDegrees: THREE.MathUtils.radToDeg(rotationAngle),
      motionActive,
      drawCalls: bodyBlend > 0.001 ? APP17_SYSTEM_STAR_DRAW_CALLS + (depthOcclusionActive ? 1 : 0) : 1,
      bloomDrawCalls: (farCoreBlend > 0.001 ? 1 : 0) + (surfaceBloomBlend > 0.001 ? 1 : 0) + (depthOcclusionActive ? 1 : 0),
    }),
    dispose: () => {
      impostorGeometry.dispose();
      impostorMaterial.dispose();
      bloomCoreMaterial.dispose();
      photosphereGeometry.dispose();
      photosphereMaterial.dispose();
      surfaceBloomMaterial.dispose();
      depthMaterial.dispose();
      magneticLayer.dispose();
    },
  };
}

function createSystemMagneticLayer(color: THREE.Color, seed: number) {
  const positions: number[] = [];
  const alphas: number[] = [];
  const random = seededRandom(Math.floor(seed * 4294967295));
  const loopCount = 4 + Math.floor(random() * 3);
  const fallbackAxis = new THREE.Vector3(0, 0, 1);

  for (let loopIndex = 0; loopIndex < loopCount; loopIndex += 1) {
    const azimuth = random() * Math.PI * 2;
    const latitude = THREE.MathUtils.degToRad(-42 + random() * 84);
    const centerDirection = new THREE.Vector3(
      Math.cos(latitude) * Math.cos(azimuth),
      Math.cos(latitude) * Math.sin(azimuth),
      Math.sin(latitude),
    ).normalize();
    const tangent = new THREE.Vector3().crossVectors(centerDirection, fallbackAxis);
    if (tangent.lengthSq() < 0.001) tangent.set(1, 0, 0);
    tangent.normalize().applyAxisAngle(centerDirection, random() * Math.PI * 2);
    const halfSeparation = THREE.MathUtils.degToRad(16 + random() * 24);
    const footA = centerDirection.clone().multiplyScalar(Math.cos(halfSeparation))
      .addScaledVector(tangent, Math.sin(halfSeparation))
      .normalize()
      .multiplyScalar(APP17_SYSTEM_STAR_RADIUS * 1.01);
    const footB = centerDirection.clone().multiplyScalar(Math.cos(halfSeparation))
      .addScaledVector(tangent, -Math.sin(halfSeparation))
      .normalize()
      .multiplyScalar(APP17_SYSTEM_STAR_RADIUS * 1.01);
    const apex = centerDirection.clone().multiplyScalar(APP17_SYSTEM_STAR_RADIUS * (1.55 + random() * 0.78));
    const curve = new THREE.QuadraticBezierCurve3(footA, apex, footB);
    const points = curve.getPoints(28);
    for (let segment = 0; segment < points.length - 1; segment += 1) {
      const normalized = (segment + 0.5) / (points.length - 1);
      const alpha = Math.pow(Math.sin(normalized * Math.PI), 0.72) * (0.42 + random() * 0.18);
      positions.push(
        points[segment].x, points[segment].y, points[segment].z,
        points[segment + 1].x, points[segment + 1].y, points[segment + 1].z,
      );
      alphas.push(alpha, alpha);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("lineAlpha", new THREE.Float32BufferAttribute(alphas, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: color },
      uSceneOpacity: { value: 1 },
      uLodBlend: { value: 0 },
      uRotationAngle: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    vertexShader: `
      attribute float lineAlpha;
      uniform float uRotationAngle;
      varying float vAlpha;
      void main() {
        float cosine = cos(uRotationAngle);
        float sine = sin(uRotationAngle);
        vec3 rotated = position;
        rotated.xy = mat2(cosine, sine, -sine, cosine) * rotated.xy;
        vAlpha = lineAlpha;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(rotated, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uSceneOpacity;
      uniform float uLodBlend;
      varying float vAlpha;
      void main() {
        float alpha = vAlpha * uSceneOpacity * smoothstep(0.12, 0.72, uLodBlend) * 0.3;
        if (alpha < 0.002) discard;
        vec3 lineColor = mix(uColor, vec3(0.92, 0.9, 0.84), 0.54);
        gl_FragColor = vec4(lineColor, alpha);
      }
    `,
  });
  const object = new THREE.LineSegments(geometry, material);
  object.frustumCulled = false;
  object.renderOrder = 7;
  return {
    object,
    setOpacity: (opacity: number) => {
      material.uniforms.uSceneOpacity.value = opacity;
    },
    setLodBlend: (blend: number) => {
      material.uniforms.uLodBlend.value = blend;
    },
    setAnimation: (angle: number, motionStrength: number) => {
      material.uniforms.uRotationAngle.value = angle * motionStrength;
    },
    dispose: () => {
      geometry.dispose();
      material.dispose();
    },
  };
}

function createSystemBloomCoreMaterial(color: THREE.Color) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: color },
      uSceneOpacity: { value: 1 },
      uViewport: { value: new THREE.Vector2(1, 1) },
      uSpriteCssSize: { value: 48 },
      uProjectedBodyDiameter: { value: 36 },
      uCoreCssDiameter: { value: 12 },
      uBodyBlend: { value: 0 },
      uFarCoreBlend: { value: 1 },
    },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    vertexShader: `
      uniform vec2 uViewport;
      uniform float uSpriteCssSize;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 centerView = viewMatrix * modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        vec4 clipPosition = projectionMatrix * centerView;
        vec2 pixelOffset = position.xy * uSpriteCssSize / uViewport;
        clipPosition.xy += pixelOffset * clipPosition.w;
        gl_Position = clipPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uSceneOpacity;
      uniform float uSpriteCssSize;
      uniform float uProjectedBodyDiameter;
      uniform float uCoreCssDiameter;
      uniform float uBodyBlend;
      uniform float uFarCoreBlend;
      varying vec2 vUv;
      void main() {
        vec2 pointPx = (vUv - vec2(0.5)) * uSpriteCssSize;
        float radiusPx = length(pointPx);
        float coreRadius = max(1.0, uCoreCssDiameter * 0.5);
        float core = exp(-radiusPx * radiusPx / max(1.0, coreRadius * coreRadius * 0.34));
        float innerGlow = exp(-radiusPx * radiusPx / max(1.0, coreRadius * coreRadius * 1.9));
        float farSignal = (core * 0.92 + innerGlow * 0.2) * uFarCoreBlend;
        float alpha = farSignal * uSceneOpacity;
        if (alpha < 0.002) discard;
        vec3 highTemperature = vec3(1.0, 0.94, 0.82);
        vec3 glowColor = mix(uColor, highTemperature, 0.76) * 2.8;
        gl_FragColor = vec4(glowColor, min(alpha, 1.0));
      }
    `,
  });
}

function createSystemSurfaceBloomMaterial(color: THREE.Color) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: color },
      uSceneOpacity: { value: 1 },
      uBodyBlend: { value: 0 },
      uSurfaceDetailBlend: { value: 0 },
      uSurfaceBloomBlend: { value: 0 },
      uRotationAngle: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    vertexShader: `
      varying vec3 vLocalPosition;
      void main() {
        vLocalPosition = position / ${APP17_SYSTEM_STAR_RADIUS.toFixed(2)};
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uSceneOpacity;
      uniform float uBodyBlend;
      uniform float uSurfaceDetailBlend;
      uniform float uSurfaceBloomBlend;
      uniform float uRotationAngle;
      varying vec3 vLocalPosition;
      float hash31(vec3 point) {
        point = fract(point * 0.1031);
        point += dot(point, point.yzx + 33.33);
        return fract((point.x + point.y) * point.z);
      }
      float valueNoise(vec3 point) {
        vec3 cell = floor(point);
        vec3 local = fract(point);
        local = local * local * (3.0 - 2.0 * local);
        float n000 = hash31(cell + vec3(0.0, 0.0, 0.0));
        float n100 = hash31(cell + vec3(1.0, 0.0, 0.0));
        float n010 = hash31(cell + vec3(0.0, 1.0, 0.0));
        float n110 = hash31(cell + vec3(1.0, 1.0, 0.0));
        float n001 = hash31(cell + vec3(0.0, 0.0, 1.0));
        float n101 = hash31(cell + vec3(1.0, 0.0, 1.0));
        float n011 = hash31(cell + vec3(0.0, 1.0, 1.0));
        float n111 = hash31(cell + vec3(1.0, 1.0, 1.0));
        float nx00 = mix(n000, n100, local.x);
        float nx10 = mix(n010, n110, local.x);
        float nx01 = mix(n001, n101, local.x);
        float nx11 = mix(n011, n111, local.x);
        return mix(mix(nx00, nx10, local.y), mix(nx01, nx11, local.y), local.z);
      }
      float fbm(vec3 point) {
        float value = 0.0;
        float amplitude = 0.54;
        for (int octave = 0; octave < 4; octave += 1) {
          value += valueNoise(point) * amplitude;
          point = point.yzx * 2.03 + vec3(1.7, 3.1, 2.2);
          amplitude *= 0.5;
        }
        return value;
      }
      vec3 rotateAroundAxis(vec3 point, vec3 axis, float angle) {
        float cosine = cos(angle);
        float sine = sin(angle);
        return point * cosine
          + cross(axis, point) * sine
          + axis * dot(axis, point) * (1.0 - cosine);
      }
      void main() {
        vec3 rotationAxis = normalize(vec3(0.258819, 0.0, 0.965926));
        vec3 samplePosition = rotateAroundAxis(vLocalPosition, rotationAxis, -uRotationAngle);
        float broad = fbm(samplePosition * 1.18 + vec3(7.4, 2.1, 4.8)) - 0.5;
        float filament = fbm(samplePosition.yzx * 3.1 + vec3(1.8, 8.2, 3.5)) - 0.5;
        float fineStructure = fbm(samplePosition * 8.4 + vec3(5.2, 0.8, 9.1)) - 0.5;
        float fineRidge = pow(max(0.0, 1.0 - abs(fineStructure * 2.0 - 1.0)), 4.0);
        float activity = broad * 0.38 + filament * 0.27 + (fineStructure - 0.5) * 0.12 * uSurfaceDetailBlend + (fineRidge - 0.34) * 0.06 * uSurfaceDetailBlend;
        float hotMask = smoothstep(0.18, 0.32, activity);
        float alpha = hotMask * uSurfaceBloomBlend * uBodyBlend * uSceneOpacity * 0.28;
        if (alpha < 0.002) discard;
        vec3 highTemperature = vec3(1.0, 0.955, 0.86);
        vec3 bloomColor = mix(uColor, highTemperature, 0.86) * (1.45 + hotMask * 0.75);
        gl_FragColor = vec4(bloomColor, alpha);
      }
    `,
  });
}

function createSystemImpostorMaterial(color: THREE.Color, profile: GalaxyCoronaProfile, seed: number) {
  const sectorShapes = profile.sectors.map(
    (sector) => new THREE.Vector4(sector.angle, sector.width, sector.extension / 0.28, sector.curvature),
  );
  const sectorOpacities = new THREE.Vector4(
    profile.sectors[0].opacity,
    profile.sectors[1].opacity,
    profile.sectors[2].opacity,
    profile.sectors[3].opacity,
  );
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: color },
      uStrength: { value: profile.trendStrength },
      uInnerHaloStrength: { value: profile.innerHaloStrength },
      uSector0: { value: sectorShapes[0] },
      uSector1: { value: sectorShapes[1] },
      uSector2: { value: sectorShapes[2] },
      uSector3: { value: sectorShapes[3] },
      uSectorOpacities: { value: sectorOpacities },
      uSceneOpacity: { value: 1 },
      uTime: { value: 0 },
      uMotionStrength: { value: 1 },
      uRotationAngle: { value: 0 },
      uViewport: { value: new THREE.Vector2(1, 1) },
      uSpriteCssSize: { value: 72 },
      uProjectedBodyDiameter: { value: 48 },
      uCoreCssDiameter: { value: 14 },
      uCoronaCssExtension: { value: 14 },
      uBodyBlend: { value: 0 },
      uFarCoreBlend: { value: 1 },
      uCoronaBlend: { value: 1 },
      uSeed: { value: seed },
    },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    vertexShader: `
      uniform vec2 uViewport;
      uniform float uSpriteCssSize;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 centerView = viewMatrix * modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        vec4 clipPosition = projectionMatrix * centerView;
        vec2 pixelOffset = position.xy * uSpriteCssSize / uViewport;
        clipPosition.xy += pixelOffset * clipPosition.w;
        gl_Position = clipPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uStrength;
      uniform float uInnerHaloStrength;
      uniform vec4 uSector0;
      uniform vec4 uSector1;
      uniform vec4 uSector2;
      uniform vec4 uSector3;
      uniform vec4 uSectorOpacities;
      uniform float uSceneOpacity;
      uniform float uTime;
      uniform float uMotionStrength;
      uniform float uRotationAngle;
      uniform float uSpriteCssSize;
      uniform float uProjectedBodyDiameter;
      uniform float uCoreCssDiameter;
      uniform float uCoronaCssExtension;
      uniform float uBodyBlend;
      uniform float uFarCoreBlend;
      uniform float uCoronaBlend;
      uniform float uSeed;
      varying vec2 vUv;
      float angleDistance(float first, float second) {
        return abs(atan(sin(first - second), cos(first - second)));
      }
      float activitySector(float angle, float center, float width) {
        float distance = angleDistance(angle, center) / max(0.08, width);
        return exp(-pow(distance, 3.0));
      }
      void main() {
        vec2 pointPx = (vUv - vec2(0.5)) * uSpriteCssSize;
        float radiusPx = length(pointPx);
        float angle = atan(pointPx.y, pointPx.x);
        float coreRadius = max(1.0, uCoreCssDiameter * 0.5);
        float bodyRadius = max(coreRadius, uProjectedBodyDiameter * 0.5);
        float sourceRadius = mix(coreRadius * 0.82, bodyRadius, uBodyBlend);
        float coronaRotation = uRotationAngle * 0.65 + uTime * 0.003 * uMotionStrength;
        float seedAngle = uSeed * 6.28318530718;
        float outsideDistance = max(0.0, radiusPx - sourceRadius);
        float radialPhase = outsideDistance / max(1.0, uCoronaCssExtension);
        float bendProgress = smoothstep(0.0, 1.0, radialPhase);
        float sectorA = activitySector(
          angle + uSector0.w * bendProgress,
          uSector0.x + coronaRotation,
          uSector0.y
        );
        float sectorB = activitySector(
          angle + uSector1.w * bendProgress,
          uSector1.x + coronaRotation * 0.94,
          uSector1.y
        );
        float sectorC = activitySector(
          angle + uSector2.w * bendProgress,
          uSector2.x + coronaRotation * 1.06,
          uSector2.y
        );
        float sectorD = activitySector(
          angle + uSector3.w * bendProgress,
          uSector3.x + coronaRotation * 0.88,
          uSector3.y
        );
        float extensionField = max(
          max(sectorA * uSector0.z, sectorB * uSector1.z),
          max(sectorC * uSector2.z, sectorD * uSector3.z)
        );
        float streamerField = sectorA * uSectorOpacities.x
          + sectorB * uSectorOpacities.y
          + sectorC * uSectorOpacities.z
          + sectorD * uSectorOpacities.w;
        float fineContour = 0.96 + sin(angle * 5.0 + seedAngle * 1.7 - coronaRotation * 0.45) * 0.04;
        float activeCoverage = smoothstep(0.015, 0.14, extensionField);
        float coronaRadius = sourceRadius + uCoronaCssExtension * extensionField * fineContour;
        float coronaMask = (1.0 - smoothstep(sourceRadius * 0.99, coronaRadius, radiusPx)) * activeCoverage;
        float innerCorona = exp(-outsideDistance / max(1.0, uCoronaCssExtension * 0.14)) * uInnerHaloStrength * activeCoverage;
        float streamerCorona = exp(-outsideDistance / max(1.0, uCoronaCssExtension * 0.38)) * streamerField;
        float corona = coronaMask * (innerCorona + streamerCorona);
        float core = exp(-radiusPx * radiusPx / max(1.0, coreRadius * coreRadius * 0.42));
        float innerGlow = exp(-radiusPx * radiusPx / max(1.0, coreRadius * coreRadius * 2.6));
        float alpha = uFarCoreBlend * (core * 0.82 + innerGlow * 0.2)
          + corona * uStrength * uCoronaBlend;
        alpha *= uSceneOpacity;
        if (alpha < 0.0015) discard;
        vec3 highTemperature = vec3(0.92, 0.86, 0.76);
        vec3 glowColor = mix(uColor, highTemperature, clamp(core + innerGlow * 0.42, 0.12, 0.9));
        gl_FragColor = vec4(glowColor, min(alpha, 1.0));
      }
    `,
  });
}

function createEnvironmentStarLayer(pixelRatio: number) {
  const positions = new Float32Array(APP17_ENVIRONMENT_STAR_COUNT * 3);
  const colors = new Float32Array(APP17_ENVIRONMENT_STAR_COUNT * 3);
  const sizes = new Float32Array(APP17_ENVIRONMENT_STAR_COUNT);
  const alphas = new Float32Array(APP17_ENVIRONMENT_STAR_COUNT);
  const sourceTypes = new Float32Array(APP17_ENVIRONMENT_STAR_COUNT);
  const aspectRatios = new Float32Array(APP17_ENVIRONMENT_STAR_COUNT);
  const rotations = new Float32Array(APP17_ENVIRONMENT_STAR_COUNT);
  const coreStrengths = new Float32Array(APP17_ENVIRONMENT_STAR_COUNT);
  const haloStrengths = new Float32Array(APP17_ENVIRONMENT_STAR_COUNT);
  const rayStrengths = new Float32Array(APP17_ENVIRONMENT_STAR_COUNT);
  const visibilitySeeds = new Float32Array(APP17_ENVIRONMENT_STAR_COUNT);
  const twinklePhases = new Float32Array(APP17_ENVIRONMENT_STAR_COUNT);
  const twinkleSpeeds = new Float32Array(APP17_ENVIRONMENT_STAR_COUNT);
  const twinkleAmplitudes = new Float32Array(APP17_ENVIRONMENT_STAR_COUNT);
  const systemKeeps = new Float32Array(APP17_ENVIRONMENT_STAR_COUNT);
  const sourceShapes = new Float32Array(APP17_ENVIRONMENT_STAR_COUNT * 4);
  const sourceLights = new Float32Array(APP17_ENVIRONMENT_STAR_COUNT * 4);
  const sourceMotions = new Float32Array(APP17_ENVIRONMENT_STAR_COUNT * 4);
  const rng = seededRandom(stableHash("app17:fullscreen-deep-field-v2"));
  const color = new THREE.Color();

  for (let index = 0; index < APP17_ENVIRONMENT_STAR_COUNT; index += 1) {
    const z = 1 - rng() * 2;
    const longitude = rng() * Math.PI * 2;
    const radial = Math.sqrt(Math.max(0, 1 - z * z));
    positions[index * 3] = Math.cos(longitude) * radial * APP17_ENVIRONMENT_SHELL_RADIUS;
    positions[index * 3 + 1] = Math.sin(longitude) * radial * APP17_ENVIRONMENT_SHELL_RADIUS;
    positions[index * 3 + 2] = z * APP17_ENVIRONMENT_SHELL_RADIUS;

    const colorChoice = rng();
    color.set(colorChoice < 0.7 ? "#e7f0ff" : colorChoice < 0.9 ? "#bdd7ff" : "#ffe5b9");
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;

    const sourceType = index < APP17_ENVIRONMENT_MICRO_COUNT
      ? 0
      : index < APP17_ENVIRONMENT_MICRO_COUNT + APP17_ENVIRONMENT_COMPACT_COUNT
        ? 1
        : 2;
    sourceTypes[index] = sourceType;
    rotations[index] = rng() * Math.PI * 2;
    visibilitySeeds[index] = rng();
    twinklePhases[index] = rng() * Math.PI * 2;

    if (sourceType === 0) {
      sizes[index] = 1 + Math.pow(rng(), 1.45) * 1.5;
      alphas[index] = 0.46 + Math.pow(rng(), 1.35) * 0.34;
      aspectRatios[index] = 1;
      coreStrengths[index] = 0.8 + rng() * 0.35;
      haloStrengths[index] = 0.06 + rng() * 0.07;
      rayStrengths[index] = 0;
      const twinkles = rng() < 0.35;
      const periodSeconds = 4 + rng() * 8;
      twinkleSpeeds[index] = (Math.PI * 2) / periodSeconds;
      twinkleAmplitudes[index] = twinkles ? 0.15 + rng() * 0.1 : 0;
    } else if (sourceType === 1) {
      sizes[index] = 2.5 + Math.pow(rng(), 0.72) * 4.5;
      alphas[index] = 0.4 + rng() * 0.3;
      aspectRatios[index] = 1.35 + rng() * 1.55;
      coreStrengths[index] = 0.46 + rng() * 0.3;
      haloStrengths[index] = 0.16 + rng() * 0.14;
      rayStrengths[index] = 0;
      const periodSeconds = 12 + rng() * 13;
      twinkleSpeeds[index] = (Math.PI * 2) / periodSeconds;
      twinkleAmplitudes[index] = 0.06 + rng() * 0.06;
    } else {
      sizes[index] = 6 + Math.pow(rng(), 0.8) * 8;
      alphas[index] = 0.72 + rng() * 0.23;
      aspectRatios[index] = 1;
      coreStrengths[index] = 0.95 + rng() * 0.3;
      haloStrengths[index] = 0.18 + rng() * 0.16;
      rayStrengths[index] = rng() < 0.26 ? 0.04 + rng() * 0.05 : 0;
      const periodSeconds = 16 + rng() * 14;
      twinkleSpeeds[index] = (Math.PI * 2) / periodSeconds;
      twinkleAmplitudes[index] = 0.04 + rng() * 0.04;
    }
    systemKeeps[index] = rng() < APP17_ENVIRONMENT_SYSTEM_RATIO ? 1 : 0;
    const packedOffset = index * 4;
    sourceShapes[packedOffset] = sourceTypes[index];
    sourceShapes[packedOffset + 1] = aspectRatios[index];
    sourceShapes[packedOffset + 2] = rotations[index];
    sourceShapes[packedOffset + 3] = visibilitySeeds[index];
    sourceLights[packedOffset] = coreStrengths[index];
    sourceLights[packedOffset + 1] = haloStrengths[index];
    sourceLights[packedOffset + 2] = rayStrengths[index];
    sourceLights[packedOffset + 3] = alphas[index];
    sourceMotions[packedOffset] = twinklePhases[index];
    sourceMotions[packedOffset + 1] = twinkleSpeeds[index];
    sourceMotions[packedOffset + 2] = twinkleAmplitudes[index];
    sourceMotions[packedOffset + 3] = systemKeeps[index];
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("pointSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("sourceShape", new THREE.BufferAttribute(sourceShapes, 4));
  geometry.setAttribute("sourceLight", new THREE.BufferAttribute(sourceLights, 4));
  geometry.setAttribute("sourceMotion", new THREE.BufferAttribute(sourceMotions, 4));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uPixelRatio: { value: pixelRatio },
      uFullscreenBlend: { value: 0 },
      uSystemBlend: { value: 0 },
      uAmbientTime: { value: 0 },
      uMotionStrength: { value: 1 },
      uDataEnvelope: { value: new THREE.Vector4(0, 0, 0.78, 0.55) },
      uInnerDensity: { value: APP17_ENVIRONMENT_INNER_DENSITY },
      uInnerBrightness: { value: APP17_ENVIRONMENT_INNER_BRIGHTNESS },
    },
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    vertexShader: `
      attribute vec3 color;
      attribute float pointSize;
      attribute vec4 sourceShape;
      attribute vec4 sourceLight;
      attribute vec4 sourceMotion;
      uniform float uPixelRatio;
      uniform float uFullscreenBlend;
      uniform float uSystemBlend;
      uniform float uAmbientTime;
      uniform float uMotionStrength;
      uniform vec4 uDataEnvelope;
      uniform float uInnerDensity;
      uniform float uInnerBrightness;
      varying vec3 vColor;
      varying float vAlpha;
      varying float vSourceType;
      varying float vAspectRatio;
      varying float vSourceRotation;
      varying float vCoreStrength;
      varying float vHaloStrength;
      varying float vRayStrength;
      void main() {
        float sourceType = sourceShape.x;
        float aspectRatio = sourceShape.y;
        float sourceRotation = sourceShape.z;
        float visibilitySeed = sourceShape.w;
        float coreStrength = sourceLight.x;
        float haloStrength = sourceLight.y;
        float rayStrength = sourceLight.z;
        float pointAlpha = sourceLight.w;
        float twinklePhase = sourceMotion.x;
        float twinkleSpeed = sourceMotion.y;
        float twinkleAmplitude = sourceMotion.z;
        float systemKeep = sourceMotion.w;
        vColor = color;
        vSourceType = sourceType;
        vAspectRatio = aspectRatio;
        vSourceRotation = sourceRotation;
        vCoreStrength = coreStrength;
        vHaloStrength = haloStrength;
        vRayStrength = rayStrength;
        vec4 clipPosition = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        vec2 ndc = clipPosition.xy / max(0.0001, abs(clipPosition.w));
        vec2 envelopeOffset = (ndc - uDataEnvelope.xy) / max(uDataEnvelope.zw, vec2(0.05));
        float envelopeMetric = length(envelopeOffset);
        float outerBlend = smoothstep(0.82, 1.18, envelopeMetric);
        float densityLimit = mix(uInnerDensity, 1.0, outerBlend);
        float densityVisibility = 1.0 - smoothstep(densityLimit, densityLimit + 0.015, visibilitySeed);
        float envelopeBrightness = mix(uInnerBrightness, 1.0, outerBlend);
        float systemDensity = mix(1.0, systemKeep, uSystemBlend);
        float systemBrightness = mix(1.0, ${APP17_ENVIRONMENT_SYSTEM_RATIO.toFixed(2)}, uSystemBlend);
        float primaryWave = sin(uAmbientTime * twinkleSpeed + twinklePhase);
        float secondaryWave = sin(uAmbientTime * twinkleSpeed * 0.43 + twinklePhase * 1.71);
        float twinkle = 1.0 + twinkleAmplitude * (primaryWave * 0.72 + secondaryWave * 0.28) * uMotionStrength;
        vAlpha = pointAlpha
          * uFullscreenBlend
          * densityVisibility
          * envelopeBrightness
          * systemDensity
          * systemBrightness
          * max(0.5, twinkle);
        gl_PointSize = max(4.0, pointSize * uPixelRatio);
        gl_Position = clipPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;
      varying float vSourceType;
      varying float vAspectRatio;
      varying float vSourceRotation;
      varying float vCoreStrength;
      varying float vHaloStrength;
      varying float vRayStrength;
      void main() {
        vec2 uv = (gl_PointCoord - vec2(0.5)) * 2.0;
        float radius = length(uv);
        float radialEdge = 1.0 - smoothstep(0.78, 1.0, radius);
        if (radialEdge <= 0.001 || vAlpha <= 0.001) discard;

        float cosine = cos(vSourceRotation);
        float sine = sin(vSourceRotation);
        vec2 rotated = mat2(cosine, sine, -sine, cosine) * uv;
        vec2 ellipseUv = vec2(rotated.x, rotated.y * vAspectRatio);
        float circularRadiusSquared = dot(uv, uv);
        float ellipseRadiusSquared = dot(ellipseUv, ellipseUv);

        float microMask = 1.0 - step(0.5, vSourceType);
        float compactMask = step(0.5, vSourceType) * (1.0 - step(1.5, vSourceType));
        float anchorMask = step(1.5, vSourceType);

        float microCore = exp(-circularRadiusSquared * 28.0) * vCoreStrength;
        float microHalo = exp(-circularRadiusSquared * 5.6) * vHaloStrength;
        float compactCore = exp(-ellipseRadiusSquared * 16.0) * vCoreStrength;
        float compactBody = exp(-ellipseRadiusSquared * 3.6) * vHaloStrength;
        float anchorCore = exp(-circularRadiusSquared * 34.0) * vCoreStrength;
        float anchorHotCore = exp(-circularRadiusSquared * 120.0) * 0.75;
        float anchorHalo = exp(-circularRadiusSquared * 3.2) * vHaloStrength;

        float pixelWidth = max(fwidth(uv.x), fwidth(uv.y));
        float horizontalRay = (1.0 - smoothstep(pixelWidth, pixelWidth * 2.4, abs(rotated.y))) * exp(-abs(rotated.x) * 5.2);
        float verticalRay = (1.0 - smoothstep(pixelWidth, pixelWidth * 2.4, abs(rotated.x))) * exp(-abs(rotated.y) * 5.2);
        float diffraction = (horizontalRay + verticalRay) * (1.0 - smoothstep(0.52, 0.94, radius)) * vRayStrength;

        float microEnergy = microCore + microHalo;
        float compactEnergy = compactCore + compactBody;
        float anchorEnergy = anchorCore + anchorHotCore + anchorHalo + diffraction;
        float totalEnergy = (microEnergy * microMask + compactEnergy * compactMask + anchorEnergy * anchorMask) * radialEdge;
        float alpha = min(0.98, vAlpha * totalEnergy);
        if (alpha < 0.002) discard;

        float whiteCore = microMask * microCore + compactMask * compactCore + anchorMask * (anchorCore + anchorHotCore + diffraction);
        float colorMix = clamp(whiteCore / max(totalEnergy, 0.0001), 0.0, 1.0);
        vec3 sourceColor = mix(vColor, vec3(1.0, 0.975, 0.91), colorMix * (0.52 + anchorMask * 0.26));
        gl_FragColor = vec4(clamp(sourceColor, 0.0, 1.0), alpha);
      }
    `,
  });

  const object = new THREE.Points(geometry, material);
  object.visible = false;
  object.frustumCulled = false;
  object.renderOrder = -100;

  return {
    object,
    setState: (fullscreenAmount: number, systemAmount: number) => {
      material.uniforms.uFullscreenBlend.value = THREE.MathUtils.clamp(fullscreenAmount, 0, 1);
      material.uniforms.uSystemBlend.value = THREE.MathUtils.clamp(systemAmount, 0, 1);
      object.visible = fullscreenAmount > 0.001;
    },
    setAnimation: (timeSeconds: number, motionStrength: number) => {
      material.uniforms.uAmbientTime.value = timeSeconds;
      material.uniforms.uMotionStrength.value = THREE.MathUtils.clamp(motionStrength, 0, 1);
    },
    setEnvelope: (centerX: number, centerY: number, radiusX: number, radiusY: number) => {
      material.uniforms.uDataEnvelope.value.set(centerX, centerY, radiusX, radiusY);
    },
    setCenter: (position: THREE.Vector3) => {
      object.position.copy(position);
    },
    dispose: () => {
      geometry.dispose();
      material.dispose();
    },
  };
}

function createPaperLayer(
  papers: App17ParticlePoint[],
  pixelRatio: number,
  kind: App17SceneData["kind"],
  dynamicPositions = false,
) {
  const count = papers.length;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const alphas = new Float32Array(count);
  const originalAlphas = new Float32Array(count);
  const selectedMasks = new Float32Array(count);
  const topicKeys = papers.map((paper) => paper.topicKey);
  const paperIds = papers.map((paper) => paper.paperId);
  const color = new THREE.Color();

  papers.forEach((paper, index) => {
    positions[index * 3] = paper.x;
    positions[index * 3 + 1] = paper.y;
    positions[index * 3 + 2] = paper.z;
    color.set(paper.color);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
    sizes[index] = paper.size;
    alphas[index] = paper.alpha;
    originalAlphas[index] = paper.alpha;
  });

  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(positions, 3);
  if (dynamicPositions) positionAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", positionAttribute);
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("pointSize", new THREE.BufferAttribute(sizes, 1));
  const alphaAttribute = new THREE.BufferAttribute(alphas, 1);
  geometry.setAttribute("pointAlpha", alphaAttribute);
  const selectedMaskAttribute = new THREE.BufferAttribute(selectedMasks, 1);
  geometry.setAttribute("selectedMask", selectedMaskAttribute);

  const material = createPaperMaterial(pixelRatio, kind);
  const object = new THREE.Points(geometry, material);
  object.frustumCulled = false;
  let selectedTopicKey = "";
  return {
    object,
    setOpacity: (opacity: number) => {
      material.uniforms.uSceneOpacity.value = opacity;
    },
    setExplorationSelection: (topicKey: string, focusPosition: THREE.Vector3) => {
      material.uniforms.uFocusPosition.value.copy(focusPosition);
      if (selectedTopicKey === topicKey) return;
      selectedTopicKey = topicKey;
      for (let index = 0; index < selectedMasks.length; index += 1) {
        selectedMasks[index] = topicKeys[index] === topicKey ? 1 : 0;
      }
      selectedMaskAttribute.needsUpdate = true;
    },
    setExplorationProgress: (progress: number, selectedTopicOpacity: number) => {
      material.uniforms.uExplorationProgress.value = progress;
      material.uniforms.uSelectedTopicOpacity.value = THREE.MathUtils.clamp(selectedTopicOpacity, 0, 1);
    },
    setFarRotation: (rotationAngle: number) => {
      material.uniforms.uFarRotationAngle.value = rotationAngle;
    },
    setSystemDepthCue: (centerViewDepth: number, depthRange: number, strength: number) => {
      material.uniforms.uSystemCenterViewDepth.value = centerViewDepth;
      material.uniforms.uSystemDepthRange.value = Math.max(0.001, depthRange);
      material.uniforms.uSystemDepthStrength.value = THREE.MathUtils.clamp(strength, 0, 1);
    },
    setHiddenPaperIds: (hiddenPaperIds: Set<string>) => {
      for (let index = 0; index < alphas.length; index += 1) {
        alphas[index] = hiddenPaperIds.has(paperIds[index]) ? 0 : originalAlphas[index];
      }
      alphaAttribute.needsUpdate = true;
    },
    setPointPositions: (nextPositions: THREE.Vector3[]) => {
      const updateCount = Math.min(nextPositions.length, count);
      for (let index = 0; index < updateCount; index += 1) {
        const position = nextPositions[index];
        positions[index * 3] = position.x;
        positions[index * 3 + 1] = position.y;
        positions[index * 3 + 2] = position.z;
      }
      positionAttribute.needsUpdate = true;
    },
    dispose: () => {
      geometry.dispose();
      material.dispose();
    },
  };
}

function createHotspotLayer(hotspots: App17RenderPoint[], pixelRatio: number, kind: App17SceneData["kind"]) {
  const count = hotspots.length;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const pointIntensities = new Float32Array(count);
  const haloStrengths = new Float32Array(count);
  const rayStrengths = new Float32Array(count);
  const breathPhases = new Float32Array(count);
  const breathSpeeds = new Float32Array(count);
  const selectedMasks = new Float32Array(count);
  const topicKeys = hotspots.map((hotspot) => topicKeyFromHotspot(hotspot));
  const color = new THREE.Color();
  const rayRankById = new Map(
    hotspots
      .slice()
      .sort((a, b) => b.paperCount - a.paperCount || a.id.localeCompare(b.id))
      .slice(0, 8)
      .map((hotspot, rank) => [hotspot.id, rank]),
  );

  hotspots.forEach((hotspot, index) => {
    const importance = hotspot.importance;
    const rayRank = rayRankById.get(hotspot.id);
    positions[index * 3] = hotspot.position.x;
    positions[index * 3 + 1] = hotspot.position.y;
    positions[index * 3 + 2] = hotspot.position.z;
    color.set(hotspot.color);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
    sizes[index] = hotspot.displaySize;
    pointIntensities[index] = 0.68 + importance * 0.32;
    haloStrengths[index] = hotspot.glowStrength * (0.55 + importance * 0.45) * (kind === "app14" ? 1 : 0.72);
    rayStrengths[index] = rayRank === undefined ? 0 : 0.08 + (1 - rayRank / 7) * 0.14;
    breathPhases[index] = hotspot.seed * Math.PI * 2;
    const breathSeed = stableHash(`${hotspot.id}:breath`) / 4294967295;
    const periodSeconds = kind === "app14" ? 10 + breathSeed * 6 : 12 + breathSeed * 6;
    breathSpeeds[index] = (Math.PI * 2) / periodSeconds;
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("pointSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("pointIntensity", new THREE.BufferAttribute(pointIntensities, 1));
  geometry.setAttribute("haloStrength", new THREE.BufferAttribute(haloStrengths, 1));
  geometry.setAttribute("rayStrength", new THREE.BufferAttribute(rayStrengths, 1));
  geometry.setAttribute("breathPhase", new THREE.BufferAttribute(breathPhases, 1));
  geometry.setAttribute("breathSpeed", new THREE.BufferAttribute(breathSpeeds, 1));
  const selectedMaskAttribute = new THREE.BufferAttribute(selectedMasks, 1);
  geometry.setAttribute("selectedMask", selectedMaskAttribute);

  const material = createHotspotPointSourceMaterial(pixelRatio, kind);
  const object = new THREE.Points(geometry, material);
  object.frustumCulled = false;
  let selectedTopicKey = "";

  return {
    object,
    setOpacity: (opacity: number) => {
      material.uniforms.uSceneOpacity.value = opacity;
    },
    setExplorationSelection: (topicKey: string, focusPosition: THREE.Vector3) => {
      material.uniforms.uFocusPosition.value.copy(focusPosition);
      if (selectedTopicKey === topicKey) return;
      selectedTopicKey = topicKey;
      for (let index = 0; index < selectedMasks.length; index += 1) {
        selectedMasks[index] = topicKeys[index] === topicKey ? 1 : 0;
      }
      selectedMaskAttribute.needsUpdate = true;
    },
    setExplorationProgress: (progress: number) => {
      material.uniforms.uExplorationProgress.value = progress;
    },
    setAmbientState: (timeSeconds: number, rotationAngle: number, strength: number) => {
      material.uniforms.uAmbientTime.value = timeSeconds;
      material.uniforms.uFarRotationAngle.value = rotationAngle;
      material.uniforms.uAmbientStrength.value = strength;
    },
    dispose: () => {
      geometry.dispose();
      material.dispose();
    },
  };
}

function createOrbitLayer(positions: Float32Array) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({
    color: 0xe8f0ff,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
  });
  const object = new THREE.LineSegments(geometry, material);
  object.frustumCulled = false;
  return {
    object,
    setOpacity: (opacity: number) => {
      material.opacity = opacity * 0.22;
    },
    setExploration: (progress: number, focusPosition: THREE.Vector3, rotationAngle = 0) => {
      const scale = THREE.MathUtils.lerp(1, APP17_FAR_SCENE_SCALE, progress);
      const effectiveRotation = rotationAngle * smoothStepRange(0.7, 1, progress);
      const cosine = Math.cos(effectiveRotation);
      const sine = Math.sin(effectiveRotation);
      const scaledFocusX = focusPosition.x * scale;
      const scaledFocusY = focusPosition.y * scale;
      object.scale.setScalar(scale);
      object.rotation.set(0, 0, effectiveRotation);
      object.position.set(
        focusPosition.x - (scaledFocusX * cosine - scaledFocusY * sine),
        focusPosition.y - (scaledFocusX * sine + scaledFocusY * cosine),
        focusPosition.z - focusPosition.z * scale,
      );
      material.opacity = 0.22 * THREE.MathUtils.lerp(1, APP17_FAR_ORBIT_OPACITY, progress);
    },
    dispose: () => {
      geometry.dispose();
      material.dispose();
    },
  };
}

function createSystemPaperMaterial(pixelRatio: number, representativeEnergy = false) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uPixelRatio: { value: pixelRatio },
      uSceneOpacity: { value: 1 },
      uSystemCenterViewDepth: { value: 0 },
      uSystemDepthRange: { value: APP17_SYSTEM_RADIUS },
      uSystemDepthStrength: { value: 0 },
      uPaperFarBlend: { value: 0 },
      uPaperNearBlend: { value: 0 },
      uSystemRevealProgress: { value: 0 },
      uOrdinaryExposure: { value: APP17_SYSTEM_PAPER_MEDIUM_EXPOSURE },
      uPaperFocusPosition: { value: new THREE.Vector3() },
      uPaperFocusBlend: { value: 0 },
      uPaperInspectionBlend: { value: 0 },
      uPaperFocusFlightStrength: { value: 0 },
      uPaperFocusTargetCssSize: { value: APP17_SYSTEM_PAPER_FOCUS_ORDINARY_SIZE },
      uPaperFocusContextBrightness: { value: APP17_SYSTEM_PAPER_FOCUS_CONTEXT_BRIGHTNESS },
      uPaperFocusNeighborBrightness: { value: APP17_SYSTEM_PAPER_FOCUS_NEIGHBOR_BRIGHTNESS },
      uCarrierScale: { value: APP17_REPRESENTATIVE_ENERGY_CARRIER_SCALE },
      uEnergyTime: { value: 0 },
      uEnergyMotionStrength: { value: 1 },
      uCloseupCompactness: { value: 0 },
      uOuterGlowStrength: { value: 0.065 },
      uEnergyBodyStrength: { value: 1 },
    },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: representativeEnergy ? THREE.AdditiveBlending : THREE.NormalBlending,
    toneMapped: false,
    vertexShader: `
      attribute vec3 coreColor;
      attribute vec3 haloColor;
      attribute float pointSize;
      attribute float pointAlpha;
      attribute float representativeRank;
      attribute float visualSeed;
      attribute float rayAngle;
      attribute float sizeVariation;
      attribute float brightnessVariation;
      attribute float focusIntensity;
      attribute float paperFocusMask;
      uniform float uPixelRatio;
      uniform float uSceneOpacity;
      uniform float uSystemCenterViewDepth;
      uniform float uSystemDepthRange;
      uniform float uSystemDepthStrength;
      uniform float uPaperFarBlend;
      uniform float uPaperNearBlend;
      uniform float uSystemRevealProgress;
      uniform float uOrdinaryExposure;
      uniform vec3 uPaperFocusPosition;
      uniform float uPaperFocusBlend;
      uniform float uPaperInspectionBlend;
      uniform float uPaperFocusFlightStrength;
      uniform float uPaperFocusTargetCssSize;
      uniform float uPaperFocusContextBrightness;
      uniform float uPaperFocusNeighborBrightness;
      uniform float uCarrierScale;
      uniform float uEnergyTime;
      uniform float uEnergyMotionStrength;
      varying vec3 vCoreColor;
      varying vec3 vHaloColor;
      varying float vAlpha;
      varying float vOrdinaryMask;
      varying float vRayStrength;
      varying float vVisualSeed;
      varying float vRayAngle;
      varying float vFlightStrength;
      varying float vFlightAngle;
      varying float vRepresentativeRank;
      varying float vEnergyDetailBlend;
      varying float vEnergyTime;
      void main() {
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        vec4 targetViewPosition = modelViewMatrix * vec4(uPaperFocusPosition, 1.0);
        float relativeDepth = ((-viewPosition.z) - uSystemCenterViewDepth) / max(0.001, uSystemDepthRange);
        float deepPosition = clamp(max(relativeDepth, 0.0), 0.0, 1.0);
        float distanceScale = clamp(10.0 / max(1.0, -viewPosition.z), 0.78, 1.18);
        float representativeMask = step(-0.5, representativeRank);
        float ordinaryMask = 1.0 - representativeMask;
        float depthBrightnessFloor = mix(0.55, ${APP17_SYSTEM_PAPER_DEPTH_BRIGHTNESS_FLOOR.toFixed(2)}, ordinaryMask);
        float depthSizeFloor = mix(0.78, ${APP17_SYSTEM_PAPER_DEPTH_SIZE_FLOOR.toFixed(2)}, ordinaryMask);
        float depthBrightness = mix(1.0, depthBrightnessFloor, deepPosition);
        float depthSize = mix(1.0, depthSizeFloor, deepPosition);
        float ordinaryExposure = mix(1.0, uOrdinaryExposure, uSystemRevealProgress);
        float targetMask = paperFocusMask;
        float neighborMask = 1.0 - smoothstep(0.38, 0.95, distance(position, uPaperFocusPosition));
        float contextBrightness = mix(uPaperFocusContextBrightness, uPaperFocusNeighborBrightness, neighborMask);
        contextBrightness = mix(contextBrightness, 1.0, targetMask);
        vCoreColor = coreColor;
        vHaloColor = haloColor;
        vOrdinaryMask = ordinaryMask;
        vAlpha = pointAlpha
          * uSceneOpacity
          * brightnessVariation
          * focusIntensity
          * mix(1.0, ordinaryExposure, ordinaryMask)
          * mix(1.0, depthBrightness, uSystemDepthStrength)
          * mix(1.0, contextBrightness, uPaperFocusBlend)
          * (1.0 - targetMask * uPaperInspectionBlend);
        vRayStrength = representativeRank >= 0.0
          ? representativeRank < 3.0
            ? 0.16 + (2.0 - representativeRank) * 0.035
            : mix(0.13, 0.065, clamp((representativeRank - 3.0) / 6.0, 0.0, 1.0))
          : 0.0;
        vVisualSeed = visualSeed;
        vRayAngle = rayAngle;
        vRepresentativeRank = representativeRank;
        float depthScale = mix(1.0, depthSize, uSystemDepthStrength);
        float ordinaryScale = mix(1.0, 0.88, uPaperFarBlend) * mix(1.0, 1.05, uPaperNearBlend);
        float ordinaryMinimum = mix(2.15, 2.05, uPaperFarBlend);
        ordinaryMinimum = mix(ordinaryMinimum, 2.35, uPaperNearBlend);
        float ordinarySize = clamp(
          pointSize * sizeVariation * distanceScale * depthScale * ordinaryScale,
          ordinaryMinimum,
          4.2
        );
        float representativeSize = pointSize * distanceScale * depthScale;
        float baseSize = mix(ordinarySize, representativeSize, representativeMask);
        float focusedSize = mix(baseSize, uPaperFocusTargetCssSize, targetMask * uPaperFocusBlend);
        vec4 clipPosition = projectionMatrix * viewPosition;
        vec4 targetClipPosition = projectionMatrix * targetViewPosition;
        vec2 clipDelta = clipPosition.xy / max(0.0001, clipPosition.w)
          - targetClipPosition.xy / max(0.0001, targetClipPosition.w);
        vFlightAngle = atan(clipDelta.y, clipDelta.x);
        vFlightStrength = uPaperFocusFlightStrength * step(0.93, visualSeed) * (1.0 - targetMask);
        vEnergyDetailBlend = representativeMask * smoothstep(
          ${APP17_REPRESENTATIVE_ENERGY_DETAIL_START_PX.toFixed(1)},
          ${APP17_REPRESENTATIVE_ENERGY_DETAIL_END_PX.toFixed(1)},
          focusedSize
        );
        vEnergyTime = uEnergyTime * uEnergyMotionStrength;
        float carrierScale = mix(1.0, uCarrierScale, representativeMask);
        gl_PointSize = focusedSize * uPixelRatio * carrierScale * (1.0 + vFlightStrength * 1.35);
        gl_Position = clipPosition;
      }
    `,
    fragmentShader: representativeEnergy ? `
      varying vec3 vCoreColor;
      varying vec3 vHaloColor;
      varying float vAlpha;
      varying float vRepresentativeRank;
      varying float vVisualSeed;
      varying float vRayAngle;
      varying float vEnergyDetailBlend;
      varying float vEnergyTime;
      uniform float uCarrierScale;
      uniform float uCloseupCompactness;
      uniform float uOuterGlowStrength;
      uniform float uEnergyBodyStrength;
      ${REPRESENTATIVE_ENERGY_FIELD_GLSL}
      void main() {
        vec2 point = (gl_PointCoord - vec2(0.5)) * 2.0;
        float core;
        float thermal;
        float innerGlow;
        float outerGlow;
        float wisps;
        float primaryAngle;
        float secondaryAngle;
        float eccentricity;
        float wispCount;
        vec4 wispA;
        vec4 wispB;
        representativeEnergyProfileFromSeed(
          vVisualSeed,
          vRayAngle,
          vRepresentativeRank,
          primaryAngle,
          secondaryAngle,
          eccentricity,
          wispA,
          wispB,
          wispCount
        );
        sampleRepresentativeEnergy(
          point,
          uCarrierScale,
          primaryAngle,
          secondaryAngle,
          eccentricity,
          wispA,
          wispB,
          wispCount,
          vEnergyDetailBlend,
          vEnergyTime,
          uCloseupCompactness,
          core,
          thermal,
          innerGlow,
          outerGlow,
          wisps
        );
        float rankStrength = mix(0.94, 0.70, clamp(vRepresentativeRank / 9.0, 0.0, 1.0));
        float rawEnergy = core * 0.72
          + thermal * 0.32
          + innerGlow * 0.16 * uEnergyBodyStrength
          + outerGlow * uOuterGlowStrength
          + wisps;
        float energy = representativeBoundedEnergy(rawEnergy);
        float alpha = energy * vAlpha * rankStrength;
        if (alpha < 0.00025) discard;
        vec3 warmWhite = vec3(1.0, 0.985, 0.95);
        vec3 color = mix(vHaloColor, vCoreColor, clamp(thermal * 0.78 + innerGlow * 0.1, 0.0, 1.0));
        color = mix(color, warmWhite, clamp(core * 0.72 + thermal * 0.16, 0.0, 0.82));
        color = min(vec3(1.0), color + vHaloColor * wisps * 0.12);
        gl_FragColor = vec4(color, alpha);
      }
    ` : `
      varying vec3 vCoreColor;
      varying vec3 vHaloColor;
      varying float vAlpha;
      varying float vOrdinaryMask;
      varying float vRayStrength;
      varying float vVisualSeed;
      varying float vRayAngle;
      varying float vFlightStrength;
      varying float vFlightAngle;
      uniform float uPaperFarBlend;
      uniform float uPaperNearBlend;
      void main() {
        vec2 point = (gl_PointCoord - vec2(0.5)) * 2.0;
        float radius = length(point);
        float edge = 1.0 - smoothstep(0.72, 1.0, radius);
        float coreTightness = mix(34.0, 29.0, uPaperFarBlend);
        coreTightness = mix(coreTightness, 44.0, uPaperNearBlend);
        float haloTightness = mix(2.35, 1.9, uPaperFarBlend);
        haloTightness = mix(haloTightness, 3.45, uPaperNearBlend);
        haloTightness *= mix(0.95, 1.05, vVisualSeed);
        float core = exp(-radius * radius * coreTightness);
        float innerGlow = exp(-radius * radius * 8.0);
        float halo = exp(-radius * radius * haloTightness) * edge;
        float rayCos = cos(vRayAngle);
        float raySin = sin(vRayAngle);
        vec2 rayPoint = mat2(rayCos, -raySin, raySin, rayCos) * point;
        float horizontalRay = exp(-abs(rayPoint.y) * 27.0) * exp(-abs(rayPoint.x) * 3.8);
        float verticalRay = exp(-abs(rayPoint.x) * 27.0) * exp(-abs(rayPoint.y) * 3.8);
        float rays = (horizontalRay + verticalRay) * vRayStrength * edge;
        float flightCos = cos(vFlightAngle);
        float flightSin = sin(vFlightAngle);
        vec2 flightPoint = mat2(flightCos, -flightSin, flightSin, flightCos) * point;
        float flightStreak = exp(-abs(flightPoint.y) * 24.0)
          * exp(-abs(flightPoint.x) * 2.4)
          * vFlightStrength
          * 0.08
          * edge;
        float coreWeight = mix(0.9, 1.05, vOrdinaryMask);
        float innerGlowWeight = mix(0.24, 0.27, vOrdinaryMask);
        float haloWeight = mix(0.08, 0.085, vOrdinaryMask);
        float alpha = (core * coreWeight + innerGlow * innerGlowWeight + halo * haloWeight + rays + flightStreak) * vAlpha;
        vec3 color = mix(vHaloColor, vCoreColor, clamp(core + innerGlow * 0.72, 0.0, 1.0));
        float whiteCoreMix = mix(0.55, 0.67, vOrdinaryMask);
        color = mix(color, vec3(1.0, 0.985, 0.95), core * whiteCoreMix);
        if (alpha < 0.0015) discard;
        gl_FragColor = vec4(color, min(alpha, 1.0));
      }
    `,
  });
}

function createSystemRepresentativeBloomMaterial(pixelRatio: number) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uPixelRatio: { value: pixelRatio },
      uSceneOpacity: { value: 1 },
      uPaperFocusBlend: { value: 0 },
      uPaperInspectionBlend: { value: 0 },
      uPaperInspectionTargetRank: { value: -1 },
      uCarrierScale: { value: APP17_REPRESENTATIVE_ENERGY_CARRIER_SCALE },
    },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    vertexShader: `
      attribute vec3 color;
      attribute float pointSize;
      attribute float bloomStrength;
      attribute float focusIntensity;
      attribute float representativeRank;
      uniform float uPixelRatio;
      uniform float uCarrierScale;
      varying vec3 vColor;
      varying float vBloomStrength;
      varying float vFocusIntensity;
      varying float vRepresentativeRank;
      varying float vBloomWeight;
      void main() {
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        float distanceScale = clamp(10.0 / max(1.0, -viewPosition.z), 0.8, 1.18);
        vColor = color;
        vBloomStrength = bloomStrength;
        vFocusIntensity = focusIntensity;
        vRepresentativeRank = representativeRank;
        float coreCssSize = pointSize * 0.94 * distanceScale;
        vBloomWeight = mix(
          0.18,
          0.11,
          smoothstep(
            ${APP17_REPRESENTATIVE_ENERGY_DETAIL_START_PX.toFixed(1)},
            ${APP17_REPRESENTATIVE_ENERGY_DETAIL_END_PX.toFixed(1)},
            coreCssSize
          )
        );
        gl_PointSize = coreCssSize * uCarrierScale * uPixelRatio;
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      uniform float uSceneOpacity;
      uniform float uPaperFocusBlend;
      uniform float uPaperInspectionBlend;
      uniform float uPaperInspectionTargetRank;
      varying vec3 vColor;
      varying float vBloomStrength;
      varying float vFocusIntensity;
      varying float vRepresentativeRank;
      varying float vBloomWeight;
      uniform float uCarrierScale;
      void main() {
        vec2 point = (gl_PointCoord - vec2(0.5)) * 2.0;
        float opticalRadius = length(point) * uCarrierScale;
        float core = exp(-opticalRadius * opticalRadius * 88.0);
        float focusAttenuation = mix(1.0, ${APP17_SYSTEM_PAPER_FOCUS_REPRESENTATIVE_BRIGHTNESS.toFixed(2)}, uPaperFocusBlend);
        float targetMask = 1.0 - step(0.45, abs(vRepresentativeRank - uPaperInspectionTargetRank));
        float inspectionVisibility = 1.0 - targetMask * uPaperInspectionBlend;
        float alpha = core * 0.46 * uSceneOpacity * vBloomStrength * vBloomWeight
          * vFocusIntensity * focusAttenuation * inspectionVisibility;
        if (alpha < 0.00025) discard;
        vec3 lightColor = mix(vColor, vec3(1.0, 0.975, 0.94), 0.88);
        gl_FragColor = vec4(lightColor, alpha);
      }
    `,
  });
}

function createPaperMaterial(pixelRatio: number, kind: App17SceneData["kind"]) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uPixelRatio: { value: pixelRatio },
      uMinimumCssSize: { value: kind === "app14" ? 2.35 : 2.2 },
      uDistanceAttenuation: { value: kind === "app14" ? 0.55 : 0.85 },
      uSceneOpacity: { value: 1 },
      uExplorationProgress: { value: 0 },
      uSelectedTopicOpacity: { value: 1 },
      uFocusPosition: { value: new THREE.Vector3() },
      uFarRotationAngle: { value: 0 },
      uSystemCenterViewDepth: { value: 0 },
      uSystemDepthRange: { value: APP17_SYSTEM_RADIUS },
      uSystemDepthStrength: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
    toneMapped: false,
    vertexShader: `
      attribute vec3 color;
      attribute float pointSize;
      attribute float pointAlpha;
      attribute float selectedMask;
      uniform float uPixelRatio;
      uniform float uMinimumCssSize;
      uniform float uDistanceAttenuation;
      uniform float uSceneOpacity;
      uniform float uExplorationProgress;
      uniform float uSelectedTopicOpacity;
      uniform vec3 uFocusPosition;
      uniform float uFarRotationAngle;
      uniform float uSystemCenterViewDepth;
      uniform float uSystemDepthRange;
      uniform float uSystemDepthStrength;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vColor = color;
        float retreatScale = mix(1.0, ${APP17_FAR_SCENE_SCALE.toFixed(1)}, uExplorationProgress);
        float effectiveRotation = uFarRotationAngle * smoothstep(0.7, 1.0, uExplorationProgress);
        float rotationCosine = cos(effectiveRotation);
        float rotationSine = sin(effectiveRotation);
        mat2 farRotation = mat2(rotationCosine, rotationSine, -rotationSine, rotationCosine);
        vec3 farOffset = position - uFocusPosition;
        farOffset.xy = farRotation * farOffset.xy;
        vec3 distantPosition = uFocusPosition + farOffset * retreatScale;
        vec3 transformedPosition = mix(distantPosition, position, selectedMask);
        float distantVisibility = mix(1.0, ${APP17_FAR_PAPER_OPACITY.toFixed(2)}, uExplorationProgress);
        float selectedVisibility = uSelectedTopicOpacity;
        float visibility = mix(distantVisibility, selectedVisibility, selectedMask);
        float distantPointScale = mix(1.0, ${APP17_FAR_PAPER_SIZE.toFixed(2)}, uExplorationProgress);
        float pointScale = mix(distantPointScale, 1.0, selectedMask);
        vec4 mvPosition = modelViewMatrix * vec4(transformedPosition, 1.0);
        float relativeDepth = ((-mvPosition.z) - uSystemCenterViewDepth) / max(0.001, uSystemDepthRange);
        float deepPosition = clamp(max(relativeDepth, 0.0), 0.0, 1.0);
        float depthVisibility = mix(1.0, mix(1.0, 0.72, deepPosition), uSystemDepthStrength);
        vAlpha = pointAlpha * uSceneOpacity * visibility * depthVisibility;
        float distanceScale = clamp(10.0 / max(1.0, -mvPosition.z), 0.78, 1.2);
        float displayScale = mix(1.0, distanceScale, uDistanceAttenuation);
        gl_PointSize = max(pointSize * pointScale, uMinimumCssSize * pointScale) * uPixelRatio * displayScale;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        if (vAlpha <= 0.001) discard;
        vec2 centered = (gl_PointCoord - vec2(0.5)) * 2.0;
        float radius = length(centered);
        float antialias = max(fwidth(radius), 0.012);
        float disc = 1.0 - smoothstep(1.0 - antialias, 1.0 + antialias, radius);
        float halo = pow(max(0.0, 1.0 - radius), 1.65);
        float core = exp(-radius * radius * 18.0);
        float pointEnergy = min(1.0, 0.16 + 0.84 * halo + core * 0.5);
        float alpha = disc * vAlpha * pointEnergy;
        vec3 finalColor = mix(vColor, vec3(1.0), core * 0.72);
        if (alpha < 0.002) discard;
        gl_FragColor = vec4(finalColor, alpha);
      }
    `,
  });
}

function createHotspotPointSourceMaterial(pixelRatio: number, kind: App17SceneData["kind"]) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uPixelRatio: { value: pixelRatio },
      uDepthAttenuation: { value: kind === "app14" ? 0.35 : 0.82 },
      uSceneOpacity: { value: 1 },
      uExplorationProgress: { value: 0 },
      uFocusPosition: { value: new THREE.Vector3() },
      uFarRotationAngle: { value: 0 },
      uAmbientTime: { value: 0 },
      uAmbientStrength: { value: 1 },
    },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    vertexShader: `
      attribute vec3 color;
      attribute float pointSize;
      attribute float pointIntensity;
      attribute float haloStrength;
      attribute float rayStrength;
      attribute float breathPhase;
      attribute float breathSpeed;
      attribute float selectedMask;
      uniform float uPixelRatio;
      uniform float uDepthAttenuation;
      uniform float uSceneOpacity;
      uniform float uExplorationProgress;
      uniform vec3 uFocusPosition;
      uniform float uFarRotationAngle;
      uniform float uAmbientTime;
      uniform float uAmbientStrength;
      varying vec3 vColor;
      varying float vPointIntensity;
      varying float vHaloStrength;
      varying float vRayStrength;
      varying float vCoreVisibility;
      varying float vHaloVisibility;
      varying float vRayVisibility;
      void main() {
        vColor = color;
        vPointIntensity = pointIntensity;
        vHaloStrength = haloStrength;
        vRayStrength = rayStrength;
        float retreatScale = mix(1.0, ${APP17_FAR_SCENE_SCALE.toFixed(1)}, uExplorationProgress);
        float effectiveRotation = uFarRotationAngle * smoothstep(0.7, 1.0, uExplorationProgress);
        float rotationCosine = cos(effectiveRotation);
        float rotationSine = sin(effectiveRotation);
        mat2 farRotation = mat2(rotationCosine, rotationSine, -rotationSine, rotationCosine);
        vec3 farOffset = position - uFocusPosition;
        farOffset.xy = farRotation * farOffset.xy;
        vec3 distantPosition = uFocusPosition + farOffset * retreatScale;
        vec3 transformedPosition = mix(distantPosition, position, selectedMask);
        float selectedVisibility = 1.0 - smoothstep(0.32, 0.76, uExplorationProgress);
        float distantCoreVisibility = mix(1.0, ${APP17_FAR_HOTSPOT_CORE_OPACITY.toFixed(2)}, uExplorationProgress);
        float distantHaloVisibility = mix(1.0, ${APP17_FAR_HOTSPOT_HALO_OPACITY.toFixed(2)}, uExplorationProgress);
        float distantRayVisibility = mix(1.0, ${APP17_FAR_HOTSPOT_RAY_OPACITY.toFixed(2)}, uExplorationProgress);
        float ambientMask = (1.0 - selectedMask) * smoothstep(0.7, 1.0, uExplorationProgress) * uAmbientStrength;
        float breath = sin(uAmbientTime * breathSpeed + breathPhase) * ambientMask;
        float baseCoreVisibility = mix(distantCoreVisibility, selectedVisibility, selectedMask);
        float baseHaloVisibility = mix(distantHaloVisibility, selectedVisibility, selectedMask);
        vCoreVisibility = uSceneOpacity * ${kind === "app14"
          ? "baseCoreVisibility * (1.0 + breath * 0.04)"
          : "clamp(baseCoreVisibility + breath * 0.06, 0.0, 1.0)"};
        vHaloVisibility = uSceneOpacity * ${kind === "app14"
          ? "baseHaloVisibility * (1.0 + breath * 0.08)"
          : "clamp(baseHaloVisibility + breath * 0.12, 0.0, 1.0)"};
        vRayVisibility = uSceneOpacity * mix(distantRayVisibility, selectedVisibility, selectedMask);
        float distantPointScale = mix(1.0, ${APP17_FAR_HOTSPOT_SIZE.toFixed(2)}, uExplorationProgress);
        float pointScale = mix(distantPointScale, 1.0, selectedMask);
        vec4 mvPosition = modelViewMatrix * vec4(transformedPosition, 1.0);
        float distanceScale = clamp(10.0 / max(1.0, -mvPosition.z), 0.74, 1.22);
        float displayScale = mix(1.0, distanceScale, uDepthAttenuation);
        gl_PointSize = pointSize * pointScale * displayScale * uPixelRatio;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vPointIntensity;
      varying float vHaloStrength;
      varying float vRayStrength;
      varying float vCoreVisibility;
      varying float vHaloVisibility;
      varying float vRayVisibility;
      void main() {
        vec2 uv = (gl_PointCoord - vec2(0.5)) * 2.0;
        float radius = length(uv);
        float radiusSquared = dot(uv, uv);
        float edgeFade = 1.0 - smoothstep(0.72, 1.0, radius);
        float outerGlow = exp(-radiusSquared * 4.6) * edgeFade;
        float innerGlow = exp(-radiusSquared * 18.0);
        float hotCore = exp(-radiusSquared * 92.0);

        float pixelWidth = max(fwidth(uv.x), fwidth(uv.y));
        float horizontalRay = (1.0 - smoothstep(pixelWidth, pixelWidth * 2.8, abs(uv.y))) * exp(-abs(uv.x) * 4.2);
        float verticalRay = (1.0 - smoothstep(pixelWidth, pixelWidth * 2.8, abs(uv.x))) * exp(-abs(uv.y) * 4.2);
        float rayFade = 1.0 - smoothstep(0.68, 0.96, radius);
        float diffraction = (horizontalRay + verticalRay) * rayFade * vRayStrength;

        float outerEnergy = outerGlow * 0.18 * vHaloStrength * vHaloVisibility;
        float innerVisibility = mix(vHaloVisibility, vCoreVisibility, 0.38);
        float innerEnergy = innerGlow * (0.38 + vPointIntensity * 0.28) * innerVisibility;
        float coreEnergy = hotCore * (0.62 + vPointIntensity * 0.55) * vCoreVisibility;
        float rayEnergy = diffraction * 0.28 * vRayVisibility;
        float totalEnergy = outerEnergy + innerEnergy + coreEnergy + rayEnergy;
        if (radius > 1.0 || totalEnergy < 0.002) discard;

        vec3 warmCore = vec3(1.0, 0.965, 0.88);
        vec3 innerColor = mix(vColor, warmCore, 0.12);
        vec3 rayColor = mix(vColor, warmCore, 0.7);
        vec3 lightColor = (
          vColor * outerEnergy
          + innerColor * innerEnergy
          + warmCore * coreEnergy
          + rayColor * rayEnergy
        ) / max(totalEnergy, 0.0001);
        float alpha = min(0.96, totalEnergy);
        gl_FragColor = vec4(clamp(lightColor, 0.0, 1.0), alpha);
      }
    `,
  });
}

function createFocusMaterial() {
  const canvas = document.createElement("canvas");
  canvas.width = APP17_FOCUS_TEXTURE_SIZE;
  canvas.height = APP17_FOCUS_TEXTURE_SIZE;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const center = APP17_FOCUS_TEXTURE_SIZE / 2;
    ctx.clearRect(0, 0, APP17_FOCUS_TEXTURE_SIZE, APP17_FOCUS_TEXTURE_SIZE);
    ctx.lineCap = "round";

    ctx.strokeStyle = "rgba(207,229,242,0.18)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(center, center, APP17_FOCUS_RING_RADIUS, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = "rgba(231,244,251,0.62)";
    ctx.lineWidth = 2.5;
    for (let index = 0; index < 4; index += 1) {
      const quadrant = index * Math.PI * 0.5;
      ctx.beginPath();
      ctx.arc(
        center,
        center,
        APP17_FOCUS_RING_RADIUS,
        quadrant + 0.14,
        quadrant + Math.PI * 0.5 - 0.14,
      );
      ctx.stroke();
    }

    ctx.strokeStyle = "rgba(105,192,241,0.64)";
    ctx.lineWidth = 2.5;
    for (let index = 0; index < 4; index += 1) {
      const angle = index * Math.PI * 0.5;
      ctx.beginPath();
      ctx.moveTo(center + Math.cos(angle) * 95, center + Math.sin(angle) * 95);
      ctx.lineTo(center + Math.cos(angle) * 102, center + Math.sin(angle) * 102);
      ctx.stroke();
    }
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, opacity: 0.72 });
}

function focusMarkerCssDiameter() {
  return APP17_FOCUS_CSS_DIAMETER;
}

function updateFocusSprite(
  sprite: THREE.Sprite,
  hotspot: App17RenderPoint | undefined,
  root: THREE.Group,
  camera: THREE.PerspectiveCamera,
  viewportHeight: number,
  viewPosition: THREE.Vector3,
) {
  if (!hotspot || viewportHeight < 1) {
    sprite.visible = false;
    return;
  }
  sprite.position.copy(hotspot.position).applyMatrix4(root.matrixWorld);
  const viewDepth = -viewPosition.copy(sprite.position).applyMatrix4(camera.matrixWorldInverse).z;
  if (viewDepth <= camera.near) {
    sprite.visible = false;
    return;
  }
  const ringDiameter = focusMarkerCssDiameter();
  const spriteCssSize = ringDiameter * APP17_FOCUS_TEXTURE_SIZE / (APP17_FOCUS_RING_RADIUS * 2);
  const visibleWorldHeight = 2 * viewDepth * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) / Math.max(0.001, camera.zoom);
  const worldSize = spriteCssSize * visibleWorldHeight / viewportHeight;
  sprite.visible = true;
  sprite.scale.set(worldSize, worldSize, 1);
}

function updateSystemPaperFocusSprite(
  sprite: THREE.Sprite,
  localPosition: THREE.Vector3 | undefined,
  root: THREE.Group,
  camera: THREE.PerspectiveCamera,
  viewportHeight: number,
  viewPosition: THREE.Vector3,
  ringCssSize = 48,
) {
  if (!localPosition || viewportHeight < 1) {
    sprite.visible = false;
    return;
  }
  sprite.position.copy(localPosition).applyMatrix4(root.matrixWorld);
  const viewDepth = -viewPosition.copy(sprite.position).applyMatrix4(camera.matrixWorldInverse).z;
  if (viewDepth <= camera.near) {
    sprite.visible = false;
    return;
  }
  const spriteCssSize = ringCssSize * APP17_FOCUS_TEXTURE_SIZE / (APP17_FOCUS_RING_RADIUS * 2);
  const visibleWorldHeight = 2 * viewDepth * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) / Math.max(0.001, camera.zoom);
  const worldSize = spriteCssSize * visibleWorldHeight / viewportHeight;
  sprite.visible = true;
  sprite.scale.set(worldSize, worldSize, 1);
}

function isSystemPaperOccludedByStar(
  localPosition: THREE.Vector3,
  resources: GalaxySystemResources,
  camera: THREE.PerspectiveCamera,
) {
  const starCenterWorld = new THREE.Vector3().setFromMatrixPosition(resources.root.matrixWorld);
  const starWorldScale = new THREE.Vector3();
  resources.root.getWorldScale(starWorldScale);
  const starWorldRadius = APP17_SYSTEM_STAR_RADIUS * Math.max(starWorldScale.x, starWorldScale.y, starWorldScale.z);
  const paperWorldPosition = localPosition.clone().applyMatrix4(resources.root.matrixWorld);
  const cameraToPaper = paperWorldPosition.sub(camera.position);
  const paperDistance = cameraToPaper.length();
  if (paperDistance <= 0.001) return false;
  cameraToPaper.multiplyScalar(1 / paperDistance);
  const cameraToStar = camera.position.clone().sub(starCenterWorld);
  const projectedCenter = cameraToStar.dot(cameraToPaper);
  const discriminant = projectedCenter * projectedCenter - (cameraToStar.lengthSq() - starWorldRadius * starWorldRadius);
  if (discriminant <= 0) return false;
  const nearestHit = -projectedCenter - Math.sqrt(discriminant);
  return nearestHit > 0 && nearestHit < paperDistance - starWorldRadius * 0.02;
}

function drawSystemLabels(
  canvas: HTMLCanvasElement,
  camera: THREE.PerspectiveCamera,
  resources: GalaxySystemResources,
  hotspotTitle: string,
  selectedPaperId: string,
  hoveredPaperId: string,
  hideFocusedPaper: boolean,
  width: number,
  height: number,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const pixelRatio = canvas.width / Math.max(1, width);
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const starCenterWorld = new THREE.Vector3().setFromMatrixPosition(resources.root.matrixWorld);
  const starWorldScale = new THREE.Vector3();
  resources.root.getWorldScale(starWorldScale);
  const starWorldRadius = APP17_SYSTEM_STAR_RADIUS * Math.max(starWorldScale.x, starWorldScale.y, starWorldScale.z);
  const paperWorldPosition = new THREE.Vector3();
  const cameraToPaper = new THREE.Vector3();
  const cameraToStar = new THREE.Vector3();

  const isOccludedByStar = (position: THREE.Vector3) => {
    paperWorldPosition.copy(position).applyMatrix4(resources.root.matrixWorld);
    cameraToPaper.copy(paperWorldPosition).sub(camera.position);
    const paperDistance = cameraToPaper.length();
    if (paperDistance <= 0.001) return false;
    cameraToPaper.multiplyScalar(1 / paperDistance);
    cameraToStar.copy(camera.position).sub(starCenterWorld);
    const projectedCenter = cameraToStar.dot(cameraToPaper);
    const discriminant = projectedCenter * projectedCenter - (cameraToStar.lengthSq() - starWorldRadius * starWorldRadius);
    if (discriminant <= 0) return false;
    const nearestHit = -projectedCenter - Math.sqrt(discriminant);
    return nearestHit > 0 && nearestHit < paperDistance - starWorldRadius * 0.02;
  };

  const project = (position: THREE.Vector3) => {
    const projected = position.clone().applyMatrix4(resources.root.matrixWorld).project(camera);
    return {
      visible: projected.z >= -1 && projected.z <= 1,
      x: (projected.x * 0.5 + 0.5) * width,
      y: (-projected.y * 0.5 + 0.5) * height,
    };
  };
  const center = project(new THREE.Vector3(0, 0, 0));
  const starVisualState = resources.star.getVisualState();
  const titleOffset = Math.max(
    58,
    starVisualState.projectedDiameter * 0.5 + starVisualState.coronaCssExtension + 12,
  );
  const titleY = center.y - titleOffset;
  if (center.visible && starVisualState.viewportRatio < 0.3 && titleY >= 18) {
    ctx.font = "700 13px Inter, Microsoft YaHei, system-ui, sans-serif";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(0,0,0,0.92)";
    ctx.fillStyle = "rgba(255,255,255,0.96)";
    const title = ellipsis(hotspotTitle, 34);
    ctx.strokeText(title, center.x, titleY);
    ctx.fillText(title, center.x, titleY);
  }

  const paperIds = unique([
    hideFocusedPaper ? "" : selectedPaperId,
    hoveredPaperId === selectedPaperId && hideFocusedPaper ? "" : hoveredPaperId,
  ].filter(Boolean));
  paperIds.forEach((paperId) => {
    const representativePaper = resources.representativePapers.find((item) => item.id === paperId);
    const ordinaryPaper = representativePaper ? undefined : resources.cloudLayer.getPaperById(paperId);
    const position = representativePaper?.position ?? ordinaryPaper?.position;
    if (!position) return;
    if (starVisualState.depthOcclusionActive && isOccludedByStar(position)) return;
    const point = project(position);
    if (!point.visible || point.x < -120 || point.x > width + 120 || point.y < -30 || point.y > height + 30) return;
    ctx.font = "700 11px Inter, Microsoft YaHei, system-ui, sans-serif";
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = "rgba(0,0,0,0.92)";
    ctx.fillStyle = paperId === selectedPaperId ? "rgba(255,255,255,0.98)" : "rgba(225,240,255,0.92)";
    const title = representativePaper ? ellipsis(representativePaper.title, 38) : "普通论文";
    const titleOffset = representativePaper ? Math.max(17, representativePaper.displaySize * 0.78 + 8) : 18;
    const metadataOffset = Math.max(4, titleOffset - 13);
    ctx.strokeText(title, point.x, point.y - titleOffset);
    ctx.fillText(title, point.x, point.y - titleOffset);
    ctx.font = "600 9px Inter, system-ui, sans-serif";
    ctx.fillStyle = "rgba(190,215,245,0.72)";
    const metadata = representativePaper
      ? `${representativePaper.source} · ${representativePaper.year ?? "未知年份"}`
      : `${ordinaryPaper?.year ?? "未知年份"} · 点击查看详情`;
    ctx.strokeText(metadata, point.x, point.y - metadataOffset);
    ctx.fillText(metadata, point.x, point.y - metadataOffset);
  });
}

function drawLabels(
  canvas: HTMLCanvasElement,
  camera: THREE.PerspectiveCamera,
  root: THREE.Group,
  sceneData: App17SceneData,
  rankedHotspots: App17RenderPoint[],
  hotspotById: Map<string, App17RenderPoint>,
  labelTextById: Map<string, string>,
  selectedId: string,
  hoverId: string,
  cameraDistance: number,
  explorationProgress: number,
  width: number,
  height: number,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const pixelRatio = canvas.width / Math.max(1, width);
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const selected = hotspotById.get(selectedId);
  const hovered = hotspotById.get(hoverId);
  const labelLimit = cameraDistance <= APP17_ZOOM_LABEL_RADIUS
    ? APP17_ZOOM_LABEL_LIMIT
    : APP17_DEFAULT_LABEL_LIMIT;
  const candidates = explorationProgress > 0.08
    ? uniqueHotspots([selected, hovered])
    : uniqueHotspots([selected, hovered, ...rankedHotspots.slice(0, labelLimit)]);
  const occupied: Array<{ x: number; y: number; w: number; h: number }> = [];
  const worldPosition = new THREE.Vector3();
  const screenPosition = new THREE.Vector3();

  for (const hotspot of candidates) {
    worldPosition.copy(hotspot.position).applyMatrix4(root.matrixWorld);
    screenPosition.copy(worldPosition).project(camera);
    if (screenPosition.z < -1 || screenPosition.z > 1) continue;
    const x = (screenPosition.x * 0.5 + 0.5) * width;
    const baseLabelOffset = Math.max(15, hotspot.size * 0.5 + hotspot.displaySize * 0.08);
    const selectedLabelOffset = focusMarkerCssDiameter() * 0.5 + (sceneData.kind === "app15" ? 26 : 12);
    const labelOffset = hotspot.id === selectedId ? Math.max(baseLabelOffset, selectedLabelOffset) : baseLabelOffset;
    const y = (-screenPosition.y * 0.5 + 0.5) * height - labelOffset;
    if (x < -90 || x > width + 90 || y < -40 || y > height + 40) continue;

    const isPriority = hotspot.id === selectedId || hotspot.id === hoverId;
    const title = isPriority ? ellipsis(hotspot.title, 38) : labelTextById.get(hotspot.id) ?? hotspot.title;
    const estimatedWidth = THREE.MathUtils.clamp(title.length * (sceneData.kind === "app14" ? 6.2 : 7), 72, isPriority ? 230 : 200);
    const box = { x: x - estimatedWidth / 2, y: y - 15, w: estimatedWidth, h: isPriority && sceneData.kind === "app15" ? 34 : 24 };
    if (!isPriority && occupied.some((item) => rectsOverlap(item, box))) continue;
    occupied.push(box);

    ctx.font = isPriority ? "700 13px Inter, Microsoft YaHei, system-ui, sans-serif" : sceneData.kind === "app14" ? "700 10px Inter, Microsoft YaHei, system-ui, sans-serif" : "700 11px Inter, system-ui, sans-serif";
    ctx.lineWidth = sceneData.kind === "app14" ? 3.2 : 4;
    ctx.strokeStyle = "rgba(0,0,0,0.94)";
    ctx.fillStyle = isPriority ? "rgba(255,255,255,0.98)" : "rgba(246,250,255,0.9)";
    ctx.strokeText(title, x, y);
    ctx.fillText(title, x, y);

    if (isPriority && sceneData.kind === "app15") {
      const subtitle = `${hotspot.field} | ${hotspot.paperCount.toLocaleString()}`;
      ctx.font = "600 10px Inter, system-ui, sans-serif";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(0,0,0,0.88)";
      ctx.fillStyle = "rgba(218,232,255,0.78)";
      ctx.strokeText(subtitle, x, y + 15);
      ctx.fillText(subtitle, x, y + 15);
    }
  }
}

function stableShuffleHotspotsApp14(hotspots: App17GalaxyHotspotPoint[]) {
  return hotspots.slice().sort((a, b) => (stableHash(topicKeyFromHotspot(a)) % 1_000_000_000_000) - (stableHash(topicKeyFromHotspot(b)) % 1_000_000_000_000));
}

function topicKeyFromHotspot(hotspot: Pick<App17GalaxyHotspotPoint, "field" | "topicId">) {
  return `${hotspot.field}_${hotspot.topicId}`;
}

function app17GlowStrength(value: string) {
  const normalized = value.toLowerCase();
  if (normalized.includes("surg") || normalized.includes("hot") || normalized.includes("爆")) return 1;
  if (normalized.includes("stable") || normalized.includes("稳定")) return 0.75;
  if (normalized.includes("declin") || normalized.includes("下降")) return 0.55;
  return 0.65;
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function unique<T>(items: T[]) {
  const seen = new Set<T>();
  const result: T[] = [];
  items.forEach((item) => {
    if (seen.has(item)) return;
    seen.add(item);
    result.push(item);
  });
  return result;
}

function uniqueHotspots(items: Array<App17RenderPoint | undefined>) {
  const seen = new Set<string>();
  const result: App17RenderPoint[] = [];
  items.forEach((item) => {
    if (!item || seen.has(item.id)) return;
    seen.add(item.id);
    result.push(item);
  });
  return result;
}

function rectsOverlap(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function ellipsis(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(1, maxLength - 3))}...`;
}
