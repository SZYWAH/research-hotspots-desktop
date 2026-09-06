import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

import type { App17GalaxyHotspotPoint, App17GalaxyPayload, HotspotEvidencePaperSnapshot } from "../types";
import {
  createAgentTheoryDecorativePlan,
  resolveAgentTheoryDepthStyle,
  type AgentTheoryAmbientCameraState,
  type AgentTheoryDepthProfileV1,
} from "../lib/agentTheoryDepth";
import {
  AGENT_THEORY_CRUISE_FIXED_STEP_SECONDS,
  AGENT_THEORY_CRUISE_MOTION_VERSION,
  APP15_THEORY_COORDINATE_SCALE,
  advanceAgentTheoryCruise,
  cloneAgentTheoryCruiseCheckpoint,
  createAgentTheoryAnchorReturnTransition,
  createAgentTheoryCruiseCheckpoint,
  resolveAgentTheoryAngularDiameterCssPx,
  resolveAgentTheoryStellarLod,
  sampleAgentTheoryAnchorReturnTransition,
  sampleAgentTheoryCruise,
  sampleInterpolatedAgentTheoryCruise,
  type AgentTheoryAnchorReturnTransitionV2,
  type AgentTheoryCameraMode,
  type AgentTheoryCruiseAdvanceControl,
  type AgentTheoryCruiseCheckpointV1,
  type AgentTheoryPerimeterProfileV1,
  type AgentTheoryStellarLod,
} from "../lib/agentTheoryPerimeter";
import type {
  AgentTheoryCruiseGuidanceResult,
} from "../lib/agentTheoryCruiseGuidance";
import {
  AGENT_THEORY_SCREEN_LOD_GUARD_BAND_NDC,
  resolveAgentTheoryPaperCoreStyle,
  resolveAgentTheoryScreenLodTarget,
  selectAgentTheoryScreenLod,
  type AgentTheoryScreenLodCandidate,
  type AgentTheoryScreenLodResult,
} from "../lib/agentTheoryScreenLod";
import {
  createAgentTheoryScreenLodWorkerClient,
  type AgentTheoryScreenLodWorkerClient,
} from "../lib/agentTheoryScreenLodWorkerClient";
import type {
  AgentTheoryLodPurpose,
  AgentTheoryProjectionSignature,
  AgentTheoryCruiseGuidanceWorkerResponse,
  AgentTheoryScreenLodWorkerSelectionResponse,
} from "../lib/agentTheoryScreenLodWorkerProtocol";
import {
  createAgentTheoryVisibilityEnvelope,
  createEmptyAgentTheoryVisibilityGuardSnapshot,
  isAgentTheoryVisibilitySafe,
  scoreAgentTheoryVisibility,
  type AgentTheoryVisibilityCounts,
  type AgentTheoryVisibilityGuardSnapshot,
} from "../lib/agentTheoryVisibilityGuard";
import {
  GALAXY_FAR_BACKGROUND_HOTSPOT_CORE_BREATH_AMPLITUDE,
  GALAXY_FAR_BACKGROUND_HOTSPOT_CORE_OPACITY,
  GALAXY_FAR_BACKGROUND_HOTSPOT_HALO_BREATH_AMPLITUDE,
  GALAXY_FAR_BACKGROUND_HOTSPOT_HALO_OPACITY,
  GALAXY_FAR_BACKGROUND_HOTSPOT_SIZE_SCALE,
  GALAXY_FAR_BACKGROUND_PAPER_BREATH_AMPLITUDE,
  GALAXY_FAR_BACKGROUND_PAPER_OPACITY,
  GALAXY_FAR_BACKGROUND_PAPER_SIZE_SCALE,
  buildGalaxyFarBackgroundPlan,
  resolveGalaxyFarBackgroundMask,
  resolveGalaxyFarBackgroundTransition,
  type GalaxyFarBackgroundPlan,
  type GalaxyFarBackgroundHotspotPlan,
} from "../lib/galaxyFarBackground";
import {
  distanceAfterSimilarityRebase,
  normalizeEntryScale,
  resolveTheorySystemVisibility,
} from "../lib/galaxySystemTransition";
import {
  selectDeterministicAgentTheoryView,
  selectDeterministicTheoryView,
  type GalaxyTheoryViewSelection,
} from "../lib/galaxyTheoryView";
import {
  App17PaperJourneyController,
  projectGalaxyPaperTargetToNdc,
  resolveGalaxyPaperReadingPose,
  type GalaxyPaperJourneyFrame,
  type GalaxyPaperJourneyPanelState,
  type GalaxyPaperJourneyPathMode,
  type GalaxyPaperJourneyState,
} from "./App17PaperJourneyController";
import {
  resolveGalaxyContextRailWidth,
  resolveGalaxyOverviewCameraPose,
  resolveResearchGalaxyContextComposition,
  type GalaxyContextRailMode,
} from "./App17GalaxySpatialComposition";

export {
  resolveGalaxyContextRailWidth,
  resolveGalaxyOverviewCameraPose,
  resolveResearchGalaxyContextComposition,
} from "./App17GalaxySpatialComposition";
export type {
  GalaxyContextRailMode,
  GalaxyOverviewCameraPose,
  GalaxyOverviewPoseResolution,
  GalaxyOverviewSceneFrame,
  ResearchGalaxyContextComposition,
} from "./App17GalaxySpatialComposition";

export type App17GalaxyCommand = {
  kind: "reset" | "fit" | "top" | "enter-system" | "exit-system" | "reset-system" | "focus-paper" | "return-system-center" | "toggle-paper-inspection" | "agent-focus-overview" | "agent-restore-pose";
  nonce: number;
  focusMode?: "signal" | "soft-focus" | "full-focus";
  focusSide?: "left" | "right";
  focusAnchorNdcX?: number;
  cameraPose?: GalaxyCameraPose;
};

export type GalaxyVisualProfile = "analysis" | "agent-theory";

export type GalaxyInteractionMode = "ambient" | "explore";

export type AgentTheoryQuality = "balanced" | "high";

export type AgentTheoryFocusVisualState = {
  primaryId?: string;
  evidenceIds: string[];
  contextIds: string[];
  dynamicEntities: Array<{
    entityId: string;
    color?: string;
    role: 1 | 2 | 3;
  }>;
  blend: number;
  productMode?: "legacy-dynamic" | "sidera-explicit";
  side?: "left" | "right";
  normalizedAnchorX?: number;
  targetDiameterPx?: number;
};

export type AgentTheoryCruiseGuidanceMode =
  | "normal"
  | "steering"
  | "fallback";

export type AgentTheoryCruiseGuidanceV1 = {
  mode: AgentTheoryCruiseGuidanceMode;
  tangentWeight: number;
  verticalAimRatio: number;
  directionSign: -1 | 1;
  speedScale: number;
  reason?: "below-target" | "unsafe-horizon" | "no-safe-candidate";
};

export type AgentTheoryCruiseLivenessSnapshot = {
  motionVersion: typeof AGENT_THEORY_CRUISE_MOTION_VERSION;
  cameraMode: AgentTheoryCameraMode;
  guidanceMode: AgentTheoryCruiseGuidanceMode;
  stepIndex: number;
  stepDeltaLastSecond: number;
  projectionMovementPxLastSecond: number;
  visibilitySafe: boolean;
  predictedPaperCount: number;
  predictedHotspotCount: number;
  consecutiveStillMs: number;
  recoveryCount: number;
  randomTargetSecondsRemaining: number;
  angularVelocity: number;
  angularAcceleration: number;
  verticalAcceleration: number;
  workerGuidanceLatencyMs: number;
  workerGuidancePending: number;
  workerGuidanceDiscarded: number;
  guidanceTargetHoldMs: number;
  guidanceTargetSwitchCount: number;
  guidanceEmergencyOverrideCount: number;
  mainThreadGuidanceFallbackCount: number;
  referenceProjectionSpeedPxPerSecond: number;
  referenceProjectionAccelerationPxPerSecond2: number;
  referenceTrajectoryResidualPx: number;
  pausedReason?: "explore" | "hidden" | "reduced-motion";
};

export type AgentTheoryPostReturnTrajectorySnapshot = {
  active: boolean;
  elapsedMs: number;
  cameraWriter: "agent-theory-cruise" | "return-anchor" | "none";
  guidanceEpoch: number;
  guidanceSource: "frozen" | "worker" | "main-thread-fallback" | "none";
  acceptedWorkerRevision: number;
  discardedWorkerResponseCount: number;
  fallbackTriggerCount: number;
  extraFramingCount: number;
  lodHash: string;
  depthHash: string;
  maximumTrajectoryResidualPx: number;
};

export type GalaxyCameraPose = {
  center: [number, number, number];
  distance: number;
  azimuth: number;
  elevation: number;
};

export type GalaxyExplorationState = "overview" | "preparing" | "entering" | "system" | "exiting";

export type GalaxySystemViewMode = "system" | "paper-focus";

export type GalaxyPaperFocusState = "idle" | "entering" | "focused" | "exiting";

export type GalaxyPaperInspectionMode = "none" | "docked" | "centered";

export type GalaxyPaperPanelState = "hidden" | "staged" | "entering" | "visible" | "exiting";

export type GalaxyPaperInspectionVisualType =
  | "none"
  | "data-sphere"
  | "energy-core"
  | "photosphere";

export type GalaxyPaperVisualOwnerState = "none" | "acquiring" | "owned" | "releasing";

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

export type GalaxyReviewCameraPreset =
  | "global"
  | "interwoven"
  | "system-small"
  | "system-medium"
  | "system-large";

export type AgentTheoryDepthDiagnostics = {
  displaySpace: "raw" | "agent-depth-enhanced";
  rawAxisStd: [number, number, number];
  rawDepthRatio: number;
  depthScale: number;
  viewDepthP5: number;
  viewDepthP50: number;
  viewDepthP95: number;
  nearPaperCount: number;
  middlePaperCount: number;
  farPaperCount: number;
  nearPaperSizeRange: [number, number];
  middlePaperSizeRange: [number, number];
  farPaperSizeRange: [number, number];
  ambientCamera: AgentTheoryAmbientCameraState;
  projectedParallaxDeltaPx: number;
  decorativeStarCount: number;
  decorativeDustCount: number;
  decorativeDegradationReason: string;
  cameraMode: AgentTheoryCameraMode;
  perimeterSector: number;
  perimeterSafetyMargin: number;
  perimeterNearestEntityDistance: number;
  visibleGalaxyRatio: number;
  visitedSectorRatio: number;
  cruiseSpeed: number;
  cruiseAcceleration: number;
  cruiseCheckpointProjectionErrorPx: number;
  stellarLodCounts: Record<AgentTheoryStellarLod, number>;
  activeSphereHotspotCount: number;
  currentSphereHotspotCount: number;
  retiringSphereHotspotCount: number;
  stellarLodTransitionCount: number;
  shaderStatus: "pending" | "ready" | "failed";
  shaderFailureMaterials: string[];
  webglErrorCount: number;
  firstFrameVisiblePaperCount: number;
  firstFrameVisibleHotspotCount: number;
  firstFrameDecorativeVisibleCount: number;
  perimeterReframeCount: number;
  perimeterDegradationReason: string;
  readyGatePassed: boolean;
  residentPaperCount: number;
  perceptiblePaperCount: number;
  forcedVisibleCount: number;
  occupiedTileRatio: number;
  overlapP95: number;
  screenLodSelectionHash: string;
  screenLodBackend: "worker" | "main-thread-fallback";
  screenLodWorkerLatencyMs: number;
  screenLodRequestedRevision: number;
  screenLodAcceptedRevision: number;
  screenLodDiscardedResponses: number;
  screenLodViewportCount: number;
  screenLodGuardBandCount: number;
  screenLodIncomingCount: number;
  screenLodRetiringCount: number;
  returnPendingVisualTaskCount: number;
  returnDepthErrorRatio: number;
  actualCoreSizeRange: [number, number];
  actualAlphaRange: [number, number];
  freeLookPosition: [number, number, number];
  freeLookDirection: [number, number, number];
  returnProjectionErrorPx: number;
  returnDirectionStepDegrees: number;
  depthTargetP5: number;
  depthTargetP95: number;
  depthMaximumFrameDelta: number;
  cruiseInterpolationAlpha: number;
  cruiseBacklogTruncationCount: number;
  visibleHotspotCount: number;
  hotspotOccupiedCellCount: number;
  hotspotCoreSizeRange: [number, number];
  hotspotSphereOffscreenSlotCount: number;
  visibilityGuard: AgentTheoryVisibilityGuardSnapshot;
  visibilityLodTargetRejected: boolean;
  visibilityCheckpointValid: boolean;
  returnVisibilityGatePassed: boolean;
  returnPhase: AgentTheoryReturnPhase;
  returnProgress: number;
  returnStartPosition: [number, number, number];
  returnAnchorPosition: [number, number, number];
  returnDistance: number;
  returnAngleDegrees: number;
  returnMaximumSegmentDeviation: number;
  returnCurrentSelectionCount: number;
  returnAnchorSelectionCount: number;
  returnUnionSelectionCount: number;
  returnActualVisiblePaperCount: number;
  returnActualVisibleHotspotCount: number;
  returnActualVisibleHotspotCellCount: number;
  returnMinimumVisiblePaperCount: number;
  returnBlackFrameCount: number;
  returnProjectionSignature: string;
  returnDiscardedLodResponseCount: number;
  returnCruiseRestoreDurationMs: number;
  returnCruiseAdvanceRejectedCount: number;
  returnCruiseFirstSuccessfulStep: number;
  returnCruiseCheckpointDelta: number;
  returnAmbientTimeDelta: number;
  returnConsecutiveStillFrames: number;
  returnCruiseGuardEvaluationCount: number;
  returnCruiseGuardSafeCount: number;
  postReturnTrajectory: AgentTheoryPostReturnTrajectorySnapshot;
  cruiseLiveness: AgentTheoryCruiseLivenessSnapshot;
};

export type AgentTheoryReturnPhase =
  | "idle"
  | "return-preparing"
  | "returning-anchor"
  | "return-commit";

export type AgentTheoryReturnProgressSnapshot = {
  phase: AgentTheoryReturnPhase;
  progress: number;
};

type AgentTheoryExploreSafeAnchorV2 = {
  version: "agent-theory-explore-safe-anchor-v2";
  previousCheckpoint: AgentTheoryCruiseCheckpointV1 | null;
  currentCheckpoint: AgentTheoryCruiseCheckpointV1;
  interpolationAlpha: number;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  lookTarget: THREE.Vector3;
  lookDistance: number;
  projection: {
    fov: number;
    near: number;
    far: number;
    zoom: number;
  };
  depthCurrent: [number, number, number];
  depthTarget: [number, number, number];
  lodSelection: AgentTheoryScreenLodResult | null;
  lodTargetWeights: Float32Array;
  visibility: AgentTheoryVisibilityCounts;
  viewport: [number, number];
  snapshotId: string;
  tangentWeight: number;
  verticalAimRatio: number;
  fallbackToCenter: boolean;
  centerBlend: number;
  guidance: AgentTheoryCruiseGuidanceV1;
  guidanceLifecycle: FrozenCruiseGuidanceState;
  liveness: FrozenCruiseLivenessState;
};

type FrozenCruiseGuidanceState = {
  current: AgentTheoryCruiseGuidanceV1;
  target: AgentTheoryCruiseGuidanceV1;
  desiredTangentWeight: number | null;
  desiredVerticalAimRatio: number;
  centerBlendTarget: number;
  safeDurationMs: number;
  targetHoldRemainingMs: number;
  nextWorkerEvaluationRemainingMs: number;
  consecutiveUnsafeResults: number;
  workerEpoch: number;
  acceptedRevision: number;
};

type FrozenCruiseLivenessState = {
  accumulatorSeconds: number;
  checkpointSaveAllowed: boolean;
  checkpointValid: boolean;
  visibilityGuard: AgentTheoryVisibilityGuardSnapshot;
  lastSafeCheckpoint: AgentTheoryCruiseCheckpointV1 | null;
  ambientTimeSeconds: number;
};

export type GalaxyPerformanceSnapshot = {
  scenario: GalaxyPerformanceScenario;
  fullscreen: boolean;
  sampleDurationMs: number;
  currentFps: number;
  averageFps: number;
  averageFrameMs: number;
  p50FrameMs: number;
  p95FrameMs: number;
  maxFrameMs: number;
  averageWebglMs: number;
  averageLabelMs: number;
  longFrames25: number;
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
  theoryDisplaySpace: "raw" | "agent-depth-enhanced";
  theoryRawAxisStd: [number, number, number];
  theoryRawDepthRatio: number;
  theoryDepthScale: number;
  theoryViewDepthP5: number;
  theoryViewDepthP50: number;
  theoryViewDepthP95: number;
  theoryNearPaperCount: number;
  theoryMiddlePaperCount: number;
  theoryFarPaperCount: number;
  theoryAmbientAzimuthOffsetDegrees: number;
  theoryAmbientElevationOffsetDegrees: number;
  theoryAmbientDistanceOffsetRatio: number;
  theoryProjectedParallaxDeltaPx: number;
  theoryDecorativeStarCount: number;
  theoryDecorativeDustCount: number;
  theoryDecorativeDegradationReason: string;
  theoryCameraMode: AgentTheoryCameraMode;
  theoryPerimeterSector: number;
  theoryPerimeterSafetyMargin: number;
  theoryNearestEntityDistance: number;
  theoryVisibleGalaxyRatio: number;
  theoryVisitedSectorRatio: number;
  theoryCruiseSpeed: number;
  theoryCruiseAcceleration: number;
  theoryCruiseCheckpointProjectionErrorPx: number;
  theoryStellarLodCounts: Record<AgentTheoryStellarLod, number>;
  theoryActiveSphereHotspotCount: number;
  theoryStellarLodTransitionCount: number;
  theoryShaderStatus: "pending" | "ready" | "failed";
  theoryShaderFailureMaterials: string[];
  theoryWebglErrorCount: number;
  theoryFirstFrameVisiblePaperCount: number;
  theoryFirstFrameVisibleHotspotCount: number;
  theoryFirstFrameDecorativeVisibleCount: number;
  theoryPerimeterReframeCount: number;
  theoryPerimeterDegradationReason: string;
  theoryReadyGatePassed: boolean;
  theoryResidentPaperCount: number;
  theoryPerceptiblePaperCount: number;
  theoryForcedVisibleCount: number;
  theoryOccupiedTileRatio: number;
  theoryOverlapP95: number;
  theoryScreenLodSelectionHash: string;
  theoryActualCoreSizeRange: [number, number];
  theoryActualAlphaRange: [number, number];
  ambientMotion: GalaxyAmbientMotion;
  ambientTargetFps: number;
  ambientCadenceMisses: number;
  overviewAmbientDegraded: boolean;
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
  systemEntryCameraTravelDistance: number;
  systemEntryCameraRayDeviation: number;
  systemEntryDistanceMonotonicViolations: number;
  systemEntryNonSelectedWorldDrift: number;
  systemEntryScale: number;
  systemCanonicalRebaseCount: number;
  systemCanonicalRebaseProjectionDeltaPx: number;
  systemEntrySelectedCenterDeltaPx: number;
  systemEntryCloudDiameterRatio: number;
  systemNonSelectedPaperOpacity: number;
  systemNonSelectedHotspotOpacity: number;
  farBackgroundHotspotCount: number;
  farBackgroundPaperSampleCount: number;
  farBackgroundRetreatHotspotCount: number;
  farBackgroundCrossfadeHotspotCount: number;
  farBackgroundNearestRadius: number;
  farBackgroundFarthestRadius: number;
  farBackgroundLocalOffsetError: number;
  farBackgroundCentralMaskVisibleCount: number;
  farBackgroundPaperBrightnessMin: number;
  farBackgroundPaperBrightnessMax: number;
  farBackgroundHotspotCoreBrightnessMin: number;
  farBackgroundHotspotCoreBrightnessMax: number;
  farBackgroundHotspotHaloBrightnessMin: number;
  farBackgroundHotspotHaloBrightnessMax: number;
  farBackgroundRebaseProjectionDeltaPx: number;
  systemOverviewVisibleObjectCount: number;
  systemOverviewPickableObjectCount: number;
  representativeOwnershipBlend: number;
  representativeStyleBlend: number;
  representativeOrbitReveal: number;
  representativeOrbitMotionBlend: number;
  representativeSemanticOrbitError: number;
  representativeSafeOrbitCaptureCount: number;
  representativeHandoffProjectionDeltaPx: number;
  representativeMaxLuminanceStep: number;
  theoryViewAzimuthDegrees: number;
  theoryViewElevationDegrees: number;
  theoryViewBaselineScore: number;
  theoryViewSelectedScore: number;
  theoryViewImprovementRatio: number;
  theoryViewOptimized: boolean;
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
  systemPaperBaseAlpha: number;
  systemPaperDepthBrightnessFloor: number;
  systemPaperDepthSizeFloor: number;
  systemPaperStableCoreDiameterPhysicalPixels: number;
  systemPaperStableCoreEnergy: number;
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
  systemPaperJourneyState: GalaxyPaperJourneyState;
  systemPaperJourneyProgress: number;
  systemPaperJourneyPathMode: GalaxyPaperJourneyPathMode;
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
  systemPaperCameraWriterChanges: number;
  systemPaperQuaternionDeltaDegrees: number;
  systemPaperAnchorDeltaPx: number;
  systemPaperVisualOwnerState: GalaxyPaperVisualOwnerState;
  systemPaperVisualOwnerOpacity: number;
  systemPaperVisualCompactLod: number;
  systemPaperVisibleEnergyRatio: number;
  systemPaperHandoffAlphaSum: number;
  systemPaperHandoffPointDiameter: number;
  systemPaperHandoffCloseupDiameter: number;
  systemPaperHandoffPointAlpha: number;
  systemPaperHandoffCloseupAlpha: number;
  systemPaperHandoffPositionDeltaPx: number;
  systemPaperProjectedTargetDiameter: number;
  systemPaperCameraTravelDistance: number;
  systemPaperCameraDistanceToTarget: number;
  systemPaperTargetWorldPositionDrift: number;
  systemPaperMinimumStarClearance: number;
  systemPaperSmoothnessExtensionMs: number;
  systemPaperReturnPositionError: number;
  systemPaperReturnAngleErrorDegrees: number;
  systemPaperStarInFrustum: boolean;
  systemPaperStarDrawCalls: number;
  systemPaperReturnHorizontalReversals: number;
  systemPaperTargetBodyDiameterPx: number;
  systemPaperActualBodyDiameterPx: number;
  systemPaperRepresentativeCarrierRatio: number;
  systemPaperEndpointStarExitMarginPx: number;
  systemPaperEndpointCandidateCount: number;
  systemPaperEndpointDirectionDeviationDegrees: number;
  systemPaperEndpointCompositionRejected: boolean;
  systemPaperCameraRayLateralDeviation: number;
  systemPaperTargetScreenStepPx: number;
  systemPaperTargetScreenReversals: number;
  systemPaperCameraQuaternionStepDegrees: number;
  systemPaperProgressStep: number;
  systemPaperResolvedReadingDistance: number;
  systemPaperReadingDistanceRelaxation: number;
  systemPaperOrdinarySurfaceMorph: number;
  systemPaperOrdinaryAtmosphereMorph: number;
  systemPaperHandoffDiameterRatio: number;
  systemRepresentativeCarrierEdgeLeak: number;
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
  farBackgroundPayload?: App17GalaxyPayload;
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
  reviewCameraPreset?: GalaxyReviewCameraPreset;
  visualProfile?: GalaxyVisualProfile;
  interactionMode?: GalaxyInteractionMode;
  labelsVisible?: boolean;
  initialCameraPose?: GalaxyCameraPose;
  contextRailMode?: GalaxyContextRailMode;
  agentTheoryDepthProfile?: AgentTheoryDepthProfileV1;
  agentTheoryPerimeterProfile?: AgentTheoryPerimeterProfileV1;
  agentTheoryQuality?: AgentTheoryQuality;
  initialAgentTheoryCruiseCheckpoint?: AgentTheoryCruiseCheckpointV1;
  onAgentTheoryCruiseCheckpointChange?: (
    checkpoint: AgentTheoryCruiseCheckpointV1,
  ) => void;
  onAgentTheoryDepthDiagnostics?: (diagnostics: AgentTheoryDepthDiagnostics) => void;
  onAgentTheoryReturnProgress?: (
    snapshot: AgentTheoryReturnProgressSnapshot,
  ) => void;
  agentTheoryFocusVisual?: AgentTheoryFocusVisualState | null;
  onCameraPoseChange?: (pose: GalaxyCameraPose) => void;
  onFirstFrame?: () => void;
  onReady?: () => void;
  onRuntimeError?: (message: string) => void;
};

export type GalaxySpatialComposition = {
  railMode: GalaxyContextRailMode;
  railWidthPx: number;
  effectiveViewport: [number, number, number, number];
  cameraPose: GalaxyCameraPose;
  paperAnchorNdcX: number;
};

export type GalaxySpatialTransition = {
  phase: "idle" | "focusing-paper" | "returning-system" | "rail-only";
  progress: number;
  from: GalaxySpatialComposition;
  to: GalaxySpatialComposition;
  cameraWriter: "orbit" | "spatial-transition";
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
  breathPeriodSeconds: number;
  breathAmplitudeScale: number;
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
  semanticColor?: string;
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
  theoryFraming?: App17TheoryFraming;
};

type App17TheoryFraming = {
  p95Radius: number;
  maxRadius: number;
  boundsMin: THREE.Vector3;
  boundsMax: THREE.Vector3;
  viewSelection: GalaxyTheoryViewSelection;
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
  radialCameraTarget?: THREE.Vector3;
  radialCameraDirection?: THREE.Vector3;
  radialCameraStartDistance?: number;
  radialCameraEndDistance?: number;
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
  ordinaryDisplaySize: number;
  ordinaryAlpha: number;
  color: string;
  orbit: GalaxySystemOrbit;
  semanticPosition: THREE.Vector3;
  orbitPosition: THREE.Vector3;
  position: THREE.Vector3;
  transitionDelaySeconds: number;
  ownershipBlend: number;
  styleBlend: number;
  orbitReveal: number;
  orbitMotionBlend: number;
  requiresSafeOrbitCapture: boolean;
  lastCombinedLuminance: number;
};

type GalaxySystemCloudPaper = {
  id: string;
  year?: number;
  position: THREE.Vector3;
  color: string;
  index: number;
  displaySize: number;
  visualSizeVariation: number;
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
  phase: number;
  angularSpeed: number;
  radialBasis: THREE.Vector3;
  tangentBasis: THREE.Vector3;
};

type GalaxySystemResources = {
  hotspotId: string;
  hotspot: App17GalaxyHotspotPoint;
  visualMode: GalaxySystemVisualMode;
  visualProfile: GalaxyVisualProfile;
  root: THREE.Group;
  cloudLayer: ReturnType<typeof createSystemPaperLayer>;
  farBackgroundLayer?: ReturnType<typeof createTheoryFarBackgroundLayer>;
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
  representativeOwnershipBlend: number;
  representativeStyleBlend: number;
  representativeOrbitReveal: number;
  representativeOrbitMotionBlend: number;
  representativeTransitionElapsed: number;
  representativeTransitionDirection: -1 | 0 | 1;
  representativeSemanticOrbitError: number;
  representativeSafeOrbitCaptureCount: number;
  representativeMaxLuminanceStep: number;
  opacity: number;
  activeTimeSeconds: number;
  entryScale: number;
  starEntryScale: number;
  coordinateScale: number;
  cloudP95Radius: number;
  frameRadius: number;
  initialDistance: number;
  minDistance: number;
  maxDistance: number;
  setRepresentativeEntryProgress: (progress: number) => void;
  startRepresentativeSettle: () => void;
  startRepresentativeExit: () => void;
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
  semanticOrbitError: number;
  safeOrbitCaptureCount: number;
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
  canonicalRebased: boolean;
};

type GalaxyPaperJourneyPresentationRuntime = {
  mode: GalaxyPaperInspectionMode;
  visualType: GalaxyPaperInspectionVisualType;
  panelState: GalaxyPaperPanelState;
  startDistance: number;
  targetScreenSize: number;
  systemPointDiameter: number;
  compactOpticalDiameter: number;
  worldDiameter: number;
  targetBodyDiameterPx: number;
  representativeCarrierRatio: number;
  endpointStarExitMarginPx: number;
  endpointCandidateCount: number;
  endpointDirectionDeviationDegrees: number;
  endpointCompositionRejected: boolean;
};

type PaperReadingOpticalProfile = {
  targetBodyDiameterPx: number;
  targetProjectedDiameterPx: number;
  representativeCarrierRatio: number;
};

type GalaxyPaperFlightTraceSample = {
  timestamp: number;
  targetId: string;
  visualType: GalaxyPaperInspectionVisualType;
  focusState: GalaxyPaperFocusState;
  pathMode: GalaxyPaperJourneyPathMode;
  cameraWriter: GalaxyPaperCameraWriter;
  ownerState: "none" | "acquiring" | "owned" | "releasing";
  ownerOpacity: number;
  compactLod: number;
  systemPointDiameter: number;
  inspectionProjectedDiameter: number;
  projectedTargetDiameter: number;
  cameraTravelDistance: number;
  cameraDistanceToTarget: number;
  targetWorldPositionDrift: number;
  minimumStarClearance: number;
  starSafeRadius: number;
  smoothnessExtensionMs: number;
  returnPositionError: number;
  returnAngleErrorDegrees: number;
  pointCoreDiameter: number;
  dedicatedCoreDiameter: number;
  pointAlpha: number;
  dedicatedAlpha: number;
  visibleEnergyRatio: number;
  screenX: number;
  screenY: number;
  anchorErrorPx: number;
  quaternionDeltaDegrees: number;
  cameraWriterChanges: number;
  canvasResizeCount: number;
  returnHorizontalReversals: number;
  visibleCoreDiameter: number;
  visibleCoreX: number;
  visibleCoreY: number;
  visibleCoreEnergy: number;
  cameraToPaperDistance: number;
  cameraToStarDistance: number;
  starToPaperDistance: number;
  starProjectedDiameter: number;
  starViewportRatio: number;
  starScreenX: number;
  starScreenY: number;
  starFocusAttenuation: number;
  starInFrustum: boolean;
  starDrawCalls: number;
  starViewDepth: number;
  handoffAlphaSum: number;
  handoffPositionDeltaPx: number;
  visibleTargetObjectCount: number;
  canvasTop: number;
  canvasWidth: number;
  canvasHeight: number;
  pageScrollY: number;
  targetBodyDiameterPx: number;
  actualBodyDiameterPx: number;
  representativeCarrierRatio: number;
  endpointStarExitMarginPx: number;
  endpointCandidateCount: number;
  endpointDirectionDeviationDegrees: number;
  endpointCompositionRejected: boolean;
  cameraRayLateralDeviation: number;
  targetScreenStepPx: number;
  targetScreenReversals: number;
  cameraQuaternionStepDegrees: number;
  progressStep: number;
  resolvedReadingDistance: number;
  readingDistanceRelaxation: number;
  ordinarySurfaceMorph: number;
  ordinaryAtmosphereMorph: number;
  handoffDiameterRatio: number;
  representativeCarrierEdgeLeak: number;
};

type GalaxyPaperVisibleCoreMetrics = {
  diameter: number;
  x: number;
  y: number;
  energy: number;
};

type GalaxyPaperFlightTraceWindow = Window & {
  __APP17_PAPER_FLIGHT_TRACE__?: GalaxyPaperFlightTraceSample[];
};

type GalaxyPaperFlightPathMode = "none" | "direct" | "avoidance";

type GalaxyPaperCompositionTimeline = {
  targetAnchorNdcX: number;
  currentAnchorNdcX: number;
  anchorErrorPx: number;
  panelHeaderProgress: number;
  panelBodyProgress: number;
  cameraWriter: GalaxyPaperCameraWriter;
  cameraWriterChangesThisFrame: number;
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
const APP17_AGENT_THEORY_LABEL_FRAME_INTERVAL = 1_000 / 30;
const APP17_AGENT_THEORY_LABEL_FADE_MS = 160;
const APP17_AGENT_THEORY_LABEL_COLLISION_HIDE_MS = 250;
const APP17_DEFAULT_LABEL_LIMIT = 20;
const APP17_ZOOM_LABEL_LIMIT = 35;
const APP17_ZOOM_LABEL_RADIUS = 7;
// The leading hotspots stay named at every distance; the rest only earn a label
// once the camera is close enough to separate them, and anything below that is
// reachable by hover. A flat wall of names reads as noise, not as a map.
const APP17_PRIMARY_LABEL_COUNT = 6;
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
const APP17_NATURAL_LAYOUT_VERSION = "semantic-hierarchical-natural-pca3-v3";
const APP17_SYSTEM_ORBIT_SEGMENTS = 96;
const APP17_SYSTEM_CACHE_LIMIT = 4;
const APP17_SYSTEM_STAR_RADIUS = 0.38;
const APP17_SYSTEM_PAPER_STAR_EXCLUSION_RADIUS = 0.82;
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
const APP17_SYSTEM_PAPER_BASE_ALPHA = 0.65;
const APP17_SYSTEM_PAPER_MINIMUM_SIZE = 2.5;
const APP17_SYSTEM_PAPER_MAXIMUM_SIZE = 3.9;
const APP17_SYSTEM_PAPER_DEPTH_BRIGHTNESS_FLOOR = 0.82;
const APP17_SYSTEM_PAPER_DEPTH_SIZE_FLOOR = 0.9;
const APP17_AGENT_THEORY_SYSTEM_PAPER_BASE_ALPHA = 0.82;
const APP17_AGENT_THEORY_SYSTEM_PAPER_FAR_MINIMUM_SIZE = 2.9;
const APP17_AGENT_THEORY_SYSTEM_PAPER_MEDIUM_MINIMUM_SIZE = 3.1;
const APP17_AGENT_THEORY_SYSTEM_PAPER_NEAR_MINIMUM_SIZE = 3.25;
const APP17_AGENT_THEORY_SYSTEM_PAPER_MAXIMUM_SIZE = 5.0;
const APP17_AGENT_THEORY_SYSTEM_PAPER_DEPTH_BRIGHTNESS_FLOOR = 0.94;
const APP17_AGENT_THEORY_SYSTEM_PAPER_DEPTH_SIZE_FLOOR = 0.96;
const APP17_SYSTEM_PAPER_PICK_RADIUS_PX = 12;
const APP17_SYSTEM_ORDINARY_PAPER_PICK_RADIUS_PX = 7;
const APP17_SYSTEM_PAPER_PICK_INTERVAL_MS = 1_000 / 30;
const APP17_SYSTEM_PAPER_FOCUS_MIN_DISTANCE = 0.12;
const APP17_SYSTEM_PAPER_FOCUS_MAX_DISTANCE = 4.5;
const APP17_SYSTEM_PAPER_FOCUS_DISTANCE = 0.85;
const APP17_SYSTEM_PAPER_FOCUS_TRANSITION_MS = 1_800;
const APP17_SYSTEM_PAPER_RETARGET_TRANSITION_MS = 1_800;
const APP17_SYSTEM_PAPER_RETURN_TRANSITION_MS = 1_800;
const APP17_SYSTEM_PAPER_RETURN_DIRECTION_NOISE_PX = 0.75;
const APP17_SYSTEM_PAPER_FOCUS_ORDINARY_SIZE = 32;
const APP17_SYSTEM_PAPER_FOCUS_REPRESENTATIVE_SIZE = 43;
const APP17_SYSTEM_PAPER_FOCUS_ORDINARY_MAX_SIZE = 52;
const APP17_SYSTEM_PAPER_FOCUS_REPRESENTATIVE_MAX_SIZE = 62;
const APP17_SYSTEM_PAPER_FOCUS_CONTEXT_BRIGHTNESS = 0.34;
const APP17_SYSTEM_PAPER_FOCUS_NEIGHBOR_BRIGHTNESS = 0.55;
const APP17_AGENT_THEORY_SYSTEM_PAPER_FOCUS_CONTEXT_BRIGHTNESS = 0.68;
const APP17_AGENT_THEORY_SYSTEM_PAPER_FOCUS_NEIGHBOR_BRIGHTNESS = 0.8;
const APP17_AGENT_THEORY_POST_RETURN_DIAGNOSTIC_MS = 3_000;
const APP17_AGENT_THEORY_GUIDANCE_RECOVERY_SAFE_MS = 500;
const APP17_AGENT_THEORY_LIVENESS_PUBLISH_MS = 250;
const APP17_AGENT_THEORY_LIVENESS_STILL_MS = 500;
const APP17_AGENT_THEORY_LIVENESS_MOVEMENT_AUDIT_MS = 900;
const APP17_SYSTEM_PAPER_FOCUS_REPRESENTATIVE_BRIGHTNESS = 0.45;
const APP17_SYSTEM_PAPER_FOCUS_ORBIT_BRIGHTNESS = 0.28;
const APP17_SYSTEM_PAPER_FOCUS_RESPONSE = 20;
const APP17_PAPER_INSPECTION_PANEL_START_PROGRESS = 0.36;
const APP17_PAPER_INSPECTION_HEADER_START_PROGRESS = 0.46;
const APP17_PAPER_INSPECTION_BODY_START_PROGRESS = 0.58;
const APP17_PAPER_INSPECTION_PANEL_ENTER_MS = 520;
const APP17_PAPER_INSPECTION_TOGGLE_MS = 420;
const APP17_PAPER_INSPECTION_MOTION_RESUME_MS = 1_000;
const APP17_PAPER_INSPECTION_WORLD_DIAMETER = 0.08;
const APP17_PAPER_INSPECTION_ARRIVAL_VIEWPORT_RATIO = 0.62;
const APP17_AGENT_PAPER_PHOTOSPHERE_MIN_DIAMETER_PX = 160;
const APP17_AGENT_PAPER_PHOTOSPHERE_MAX_DIAMETER_PX = 240;
const APP17_AGENT_PAPER_PHOTOSPHERE_VIEWPORT_RATIO = 0.22;
const APP17_AGENT_PAPER_PHOTOSPHERE_LOD_ENTER_PX = 18;
const APP17_AGENT_PAPER_PHOTOSPHERE_LOD_EXIT_PX = 14;
const APP17_REPRESENTATIVE_SYSTEM_SIZE_SCALE = 1.32;
const APP17_REPRESENTATIVE_OWNERSHIP_START = 0.7;
const APP17_REPRESENTATIVE_STYLE_DURATION_SECONDS = 0.8;
const APP17_REPRESENTATIVE_MAX_STYLE_STEP = 0.14;
const APP17_REPRESENTATIVE_ORBIT_REVEAL_DURATION_SECONDS = 0.96;
const APP17_REPRESENTATIVE_MOTION_DELAY_SECONDS = 0.24;
const APP17_REPRESENTATIVE_MOTION_DURATION_SECONDS = 0.72;
const APP17_REPRESENTATIVE_STAGGER_MAX_SECONDS = 0.24;
const APP17_REPRESENTATIVE_SAFE_ORBIT_RADIUS = APP17_SYSTEM_PAPER_STAR_EXCLUSION_RADIUS;
const APP17_REPRESENTATIVE_INSPECTION_SCALE = 1.16;
const APP17_REPRESENTATIVE_BLOOM_STRENGTH_SCALE = 0.9;
const APP17_REPRESENTATIVE_ENERGY_CARRIER_SCALE = 1.35;
// The ordinary paper PointSprite's soft halo has a wider visible footprint than
// its nominal point size. Match that optical footprint before the static owner
// handoff while the camera starts moving through the real scene.
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
const APP17_REPRESENTATIVE_MICRO_CORE_SYSTEM_RATIO = 0.16;
const APP17_REPRESENTATIVE_MICRO_CORE_BRIGHTNESS = 0.985;
const APP17_REPRESENTATIVE_MICRO_CORE_BLOOM_WEIGHT = 0.028;
const APP17_PAPER_FLIGHT_STAR_CLEARANCE = 1.25;
const APP17_PAPER_READING_BODY_VIEWPORT_RATIO = 0.10;
const APP17_PAPER_REPRESENTATIVE_CARRIER_VIEWPORT_RATIO = 0.373;
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
const APP17_AGENT_THEORY_SYSTEM_AMBIENT_FRAME_INTERVAL = 1_000 / 24;
const APP17_OVERVIEW_AMBIENT_FRAME_INTERVAL = 1_000 / 24;
const APP17_AGENT_THEORY_DEGRADED_OVERVIEW_FRAME_INTERVAL = 1_000 / 18;
const APP17_AGENT_THEORY_LOD_SETTLE_MS = 50;
const APP17_AGENT_THEORY_CRUISE_LOD_INTERVAL_MS = 250;
const APP17_AGENT_THEORY_LOD_CHANGE_THRESHOLD = 0.04;
const APP17_AGENT_THEORY_LOD_CROSSFADE_MS = 300;
const APP17_AGENT_THEORY_MAIN_THREAD_LOD_BUDGET_MS = 1.5;
const APP17_AGENT_THEORY_DEPTH_RESPONSE_SECONDS = 0.9;
const APP17_AGENT_THEORY_VISIBILITY_EVALUATION_MS = 250;
const APP17_AGENT_THEORY_VISIBILITY_STEERING_DEGREES_PER_SECOND = 0.35;
const APP17_AGENT_THEORY_GUIDANCE_WORKER_INTERVAL_MS = 500;
const APP17_AGENT_THEORY_GUIDANCE_TARGET_HOLD_MS = 1_500;
const APP17_AGENT_THEORY_GUIDANCE_MINIMUM_SCORE_IMPROVEMENT = 0.05;
const APP17_AGENT_THEORY_GUIDANCE_FALLBACK_INTERVAL_MS = 1_000;
const APP17_AGENT_THEORY_HOTSPOT_CORE_MIN_CSS_PX = 2.8;
const APP17_AGENT_THEORY_HOTSPOT_CORE_MAX_CSS_PX = 5.2;
const APP17_AGENT_THEORY_HOTSPOT_OPTICAL_MIN_CSS_PX = 5.5;
const APP17_AGENT_THEORY_HOTSPOT_OPTICAL_MAX_CSS_PX = 10;
const APP17_AGENT_THEORY_FREE_LOOK_RADIANS_PER_PIXEL =
  THREE.MathUtils.degToRad(0.12);
const APP17_AGENT_THEORY_FREE_LOOK_WHEEL_IMPULSE_PER_RADIUS = 0.0035;
const APP17_AGENT_THEORY_FREE_LOOK_WHEEL_MIN_IMPULSE = 0.00075;
const APP17_AGENT_THEORY_FREE_LOOK_WHEEL_MAX_SPEED_PER_RADIUS = 0.55;
const APP17_AGENT_THEORY_FREE_LOOK_WHEEL_MIN_MAX_SPEED = 0.015;
const APP17_AGENT_THEORY_FREE_LOOK_DOLLY_DAMPING_SECONDS = 0.16;
const APP17_AGENT_THEORY_HOTSPOT_SINGLE_CLICK_DELAY_MS = 500;
// Overview breathing is a comfort animation, not a correctness feature.
// Analysis views may fall back to a still frame. Agent theory keeps a reduced
// cadence instead, because a fully stopped canvas is indistinguishable from a
// renderer hang in the immersive workspace.
const APP17_OVERVIEW_AMBIENT_SLOW_FRAME_MS = 55;
const APP17_OVERVIEW_AMBIENT_SLOW_WINDOWS_BEFORE_DEGRADE = 3;
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
// Deep-space colour discipline: the field is carried by one of three
// temperature families rather than by a saturated hue per hotspot, so
// neighbouring disciplines separate while the galaxy still reads as starlight.
const APP17_STAR_WHITE = "#f4f7ff";
const APP17_COLOR_FAMILIES = [
  ["#ffc66e", "#ffa94d", "#f58b4c"],
  ["#7fd4ff", "#4fb8f0", "#3d8fe0"],
  ["#c9a6ff", "#a78bfa", "#8b6fe8"],
];
// Ordinary paper stars sit close to star white; the hotspot core keeps the full
// family colour so identity stays readable without a field of confetti.
const APP17_PAPER_STAR_WHITENESS = 0.55;
const APP17_PALETTE = [
  "#ffc66e", "#7fd4ff", "#c9a6ff", "#ffa94d", "#4fb8f0",
  "#a78bfa", "#f58b4c", "#3d8fe0", "#8b6fe8", "#aeb9cf",
];
const APP17_FOCUS_TEXTURE_SIZE = 256;
const APP17_FOCUS_RING_RADIUS = 88;
const APP17_FOCUS_CSS_DIAMETER = 56;

const APP14_COORD_SCALE = 0.00205;
const APP14_VISIBLE_HOTSPOTS = 50;
const APP14_ORBIT_COUNT = 5;
const APP14_ORBIT_SEGMENTS = 120;
const APP14_PHI = (1 + Math.sqrt(5)) / 2;

const APP15_COORD_SCALE = APP15_THEORY_COORDINATE_SCALE;
const APP17_SCENE_CACHE = new WeakMap<App17GalaxyPayload, Map<string, App17SceneData>>();

const REPRESENTATIVE_ENERGY_FIELD_GLSL = `
  float representativeAngularDistance(float firstAngle, float secondAngle) {
    return abs(atan(sin(firstAngle - secondAngle), cos(firstAngle - secondAngle)));
  }

  float representativeBoundedEnergy(float rawEnergy) {
    return 1.0 - exp(-max(0.0, rawEnergy) * 0.82);
  }

  float representativeCarrierEnvelope(float opticalRadius) {
    return 1.0 - smoothstep(1.24, 1.32, opticalRadius);
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

function getCachedSceneData(
  payload: App17GalaxyPayload,
  visualMode: "nebula" | "galaxy",
  visualProfile: GalaxyVisualProfile,
) {
  let payloadCache = APP17_SCENE_CACHE.get(payload);
  if (!payloadCache) {
    payloadCache = new Map();
    APP17_SCENE_CACHE.set(payload, payloadCache);
  }
  const cacheKey = `${visualMode}:${visualProfile}`;
  const cached = payloadCache.get(cacheKey);
  if (cached) return cached;
  const sceneData = visualMode === "nebula"
    ? buildApp14ShowScene(payload)
    : buildApp15TheoryScene(payload, visualProfile);
  payloadCache.set(cacheKey, sceneData);
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
  farBackgroundPayload = payload,
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
  reviewCameraPreset,
  visualProfile = "analysis",
  interactionMode = "explore",
  labelsVisible = true,
  initialCameraPose,
  contextRailMode = "closed",
  agentTheoryDepthProfile,
  agentTheoryPerimeterProfile,
  agentTheoryQuality = "balanced",
  initialAgentTheoryCruiseCheckpoint,
  onAgentTheoryCruiseCheckpointChange,
  onAgentTheoryDepthDiagnostics,
  onAgentTheoryReturnProgress,
  agentTheoryFocusVisual,
  onCameraPoseChange,
  onFirstFrame,
  onReady,
  onRuntimeError,
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
  const interactionModeRef = useRef(interactionMode);
  const labelsVisibleRef = useRef(labelsVisible);
  const initialCameraPoseRef = useRef(initialCameraPose);
  const contextRailModeRef = useRef<GalaxyContextRailMode>(contextRailMode);
  const onAgentTheoryCruiseCheckpointChangeRef = useRef(
    onAgentTheoryCruiseCheckpointChange,
  );
  const onAgentTheoryDepthDiagnosticsRef = useRef(onAgentTheoryDepthDiagnostics);
  const onAgentTheoryReturnProgressRef = useRef(
    onAgentTheoryReturnProgress,
  );
  const agentTheoryFocusVisualRef = useRef(agentTheoryFocusVisual);
  const onCameraPoseChangeRef = useRef(onCameraPoseChange);
  const onFirstFrameRef = useRef(onFirstFrame);
  const onReadyRef = useRef(onReady);
  const onRuntimeErrorRef = useRef(onRuntimeError);
  const resetDiagnosticsRef = useRef<(() => void) | null>(null);
  const invalidateRef = useRef<(() => void) | null>(null);
  const refreshSystemRef = useRef<(() => void) | null>(null);
  const prepareSystemRef = useRef<((hotspotId: string) => void) | null>(null);
  const selectionRequestedAtRef = useRef(0);
  const selectionPendingFrameRef = useRef(false);
  const activeControllerRef = useRef<((nextActive: boolean) => void) | null>(null);
  const fullscreenControllerRef = useRef<((nextFullscreen: boolean) => void) | null>(null);
  const inspectionMetadataControllerRef = useRef<(() => void) | null>(null);
  const agentTheoryFocusVisualControllerRef =
    useRef<((state: AgentTheoryFocusVisualState | null) => void) | null>(null);
  const viewportOffsetControllerRef = useRef<((mode: GalaxyContextRailMode) => void) | null>(null);
  const viewportOffsetCurrentRef = useRef(0);
  const persistentRenderCoreRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
  } | null>(null);
  const persistentSceneFrameRef = useRef<{
    mode: "nebula" | "galaxy";
    center: THREE.Vector3;
    distance: number;
  } | null>(null);

  const sceneData = useMemo(
    () => getCachedSceneData(payload, visualMode, visualProfile),
    [payload, visualMode, visualProfile],
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
    contextRailModeRef.current = contextRailMode;
    viewportOffsetControllerRef.current?.(contextRailMode);
  }, [contextRailMode]);

  useEffect(() => {
    if (initialCameraPose) initialCameraPoseRef.current = initialCameraPose;
  }, [initialCameraPose]);

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
    agentTheoryFocusVisualRef.current = agentTheoryFocusVisual;
    agentTheoryFocusVisualControllerRef.current?.(agentTheoryFocusVisual ?? null);
    invalidateRef.current?.();
  }, [agentTheoryFocusVisual]);

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
    interactionModeRef.current = interactionMode;
    invalidateRef.current?.();
  }, [interactionMode]);

  useEffect(() => {
    labelsVisibleRef.current = labelsVisible;
    invalidateRef.current?.();
  }, [labelsVisible]);

  useEffect(() => {
    onCameraPoseChangeRef.current = onCameraPoseChange;
  }, [onCameraPoseChange]);

  useEffect(() => {
    onAgentTheoryCruiseCheckpointChangeRef.current =
      onAgentTheoryCruiseCheckpointChange;
  }, [onAgentTheoryCruiseCheckpointChange]);

  useEffect(() => {
    onAgentTheoryDepthDiagnosticsRef.current = onAgentTheoryDepthDiagnostics;
  }, [onAgentTheoryDepthDiagnostics]);

  useEffect(() => {
    onAgentTheoryReturnProgressRef.current = onAgentTheoryReturnProgress;
  }, [onAgentTheoryReturnProgress]);

  useEffect(() => {
    onFirstFrameRef.current = onFirstFrame;
  }, [onFirstFrame]);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    onRuntimeErrorRef.current = onRuntimeError;
  }, [onRuntimeError]);

  useEffect(() => {
    diagnosticsResetNonceRef.current = diagnosticsResetNonce;
    resetDiagnosticsRef.current?.();
  }, [diagnosticsResetNonce]);

  useEffect(() => {
    const hostElement = containerRef.current;
    const labelCanvas = labelCanvasRef.current;
    if (!hostElement || !labelCanvas) return;

    let renderCore = persistentRenderCoreRef.current;
    if (!renderCore) {
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(APP17_CAMERA_FOV, 1, 0.1, 240);
      camera.up.set(0, 0, 1);
      const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, preserveDrawingBuffer: false });
      renderer.debug.checkShaderErrors = true;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.domElement.className = "app17-galaxy-canvas";
      hostElement.appendChild(renderer.domElement);
      renderer.info.autoReset = false;
      renderCore = { scene, camera, renderer };
      persistentRenderCoreRef.current = renderCore;
    }
    const { scene, camera, renderer } = renderCore;
    scene.clear();
    scene.background = visualProfile === "analysis" ? new THREE.Color(0x000000) : null;
    camera.fov = APP17_CAMERA_FOV;
    camera.up.set(0, 0, 1);
    const idlePixelRatio = Math.min(window.devicePixelRatio || 1, 1.25);
    const currentPixelRatio = idlePixelRatio;
    renderer.setPixelRatio(currentPixelRatio);
    renderer.setClearColor(0x000000, visualProfile === "analysis" ? 1 : 0);
    renderer.domElement.dataset.visualProfile = visualProfile;
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
    const cameraPreset: App17CameraPreset = {
      ...sceneData.camera,
      center: sceneData.camera.center.clone(),
      theoryFraming: sceneData.camera.theoryFraming
        ? {
          ...sceneData.camera.theoryFraming,
          boundsMin: sceneData.camera.theoryFraming.boundsMin.clone(),
          boundsMax: sceneData.camera.theoryFraming.boundsMax.clone(),
        }
        : undefined,
    };
    if (import.meta.env.DEV && reviewCameraPreset) {
      applyGalaxyReviewCameraPreset(cameraPreset, sceneData, reviewCameraPreset);
    }
    const targetSceneFrame = {
      mode: visualMode,
      center: cameraPreset.center.clone(),
      distance: Math.max(0.001, cameraPreset.distance),
    };
    const restoredPose = initialCameraPoseRef.current;
    const previousSceneFrame = persistentSceneFrameRef.current;
    const overviewPose = resolveGalaxyOverviewCameraPose({
      mode: visualMode,
      canonicalPose: {
        center: cameraPreset.center.toArray(),
        distance: cameraPreset.distance,
        azimuth: cameraPreset.azimuth,
        elevation: cameraPreset.elevation,
      },
      restoredPose,
      previousSceneFrame: previousSceneFrame
        ? {
            mode: previousSceneFrame.mode,
            center: previousSceneFrame.center.toArray(),
            distance: previousSceneFrame.distance,
          }
        : undefined,
      minimumDistance: cameraPreset.minDistance,
      maximumDistance: cameraPreset.maxDistance,
      minimumElevation: cameraPreset.minElevation,
      maximumElevation: cameraPreset.maxElevation,
    });
    cameraPreset.center.fromArray(overviewPose.center);
    cameraPreset.distance = overviewPose.distance;
    cameraPreset.azimuth = overviewPose.azimuth;
    cameraPreset.elevation = overviewPose.elevation;
    renderer.domElement.dataset.overviewPoseRestoration = overviewPose.restoration;
    persistentSceneFrameRef.current = targetSceneFrame;
    const fixedSystemReview = import.meta.env.DEV
      && Boolean(reviewCameraPreset?.startsWith("system-"));
    const farBackgroundRenderHotspots = sceneData.kind === "app15"
      ? buildApp15TheoryHotspots(farBackgroundPayload)
      : sceneData.hotspots;

    const environmentStarLayer = createEnvironmentStarLayer(currentPixelRatio);
    scene.add(environmentStarLayer.object);
    const agentTheoryDecorativeLayer = visualProfile === "agent-theory"
      ? createAgentTheoryDecorativeLayer(
        currentPixelRatio,
        sceneData,
        payload.snapshotId ?? "unknown",
        agentTheoryQuality,
        agentTheoryDepthProfile?.decorativeLayerVersion
          ?? "agent-theory-deep-field-v1",
      )
      : null;
    if (agentTheoryDecorativeLayer) {
      scene.add(agentTheoryDecorativeLayer.object);
    }

    const overviewRoot = new THREE.Group();
    scene.add(overviewRoot);
    const root = new THREE.Group();
    root.rotation.set(0, 0, 0);
    root.scale.set(1, 1, cameraPreset.zScale);
    overviewRoot.add(root);
    const agentTheoryDynamicFocusLayer = (
      visualProfile === "agent-theory" && agentTheoryPerimeterProfile
    )
      ? createAgentTheoryDynamicFocusLayer(
        currentPixelRatio,
        agentTheoryPerimeterProfile,
      )
      : null;
    if (agentTheoryDynamicFocusLayer) {
      root.add(agentTheoryDynamicFocusLayer.object);
    }

    const paperLayer = createPaperLayer(
      sceneData.papers,
      currentPixelRatio,
      sceneData.kind,
      visualProfile,
    );
    root.add(paperLayer.object);

    const orbitLayer = sceneData.orbitPositions ? createOrbitLayer(sceneData.orbitPositions) : undefined;
    if (orbitLayer) root.add(orbitLayer.object);

    const hotspotLayer = createHotspotLayer(
      sceneData.hotspots,
      currentPixelRatio,
      sceneData.kind,
      visualProfile,
    );
    root.add(hotspotLayer.object);
    const applyAgentTheoryFocusVisual = (
      focusState: AgentTheoryFocusVisualState | null,
    ) => {
      const evidenceIds = new Set(focusState?.evidenceIds ?? []);
      const contextIds = new Set(focusState?.contextIds ?? []);
      const blend = focusState?.blend ?? 0;
      const backgroundBlend = focusState?.productMode === "sidera-explicit"
        ? 0
        : blend;
      paperLayer.setAgentFocusVisual(
        focusState?.primaryId,
        evidenceIds,
        contextIds,
        blend,
        backgroundBlend,
      );
      hotspotLayer.setAgentFocusVisual(
        focusState?.primaryId,
        evidenceIds,
        contextIds,
        blend,
        backgroundBlend,
      );
      agentTheoryDynamicFocusLayer?.setEntities(
        focusState?.dynamicEntities ?? [],
        blend,
      );
    };
    agentTheoryFocusVisualControllerRef.current = applyAgentTheoryFocusVisual;
    applyAgentTheoryFocusVisual(agentTheoryFocusVisualRef.current ?? null);
    const agentTheoryHotspotSphereLayer = visualProfile === "agent-theory"
      ? createAgentTheoryHotspotSphereLayer(sceneData.hotspots)
      : null;
    // Agent overview uses point/PSF hotspots only. The existing local-system
    // renderer remains the sole owner of true photospheres after system entry.
    const agentTheoryOverviewSphereEnabled = false;
    if (agentTheoryHotspotSphereLayer && agentTheoryOverviewSphereEnabled) {
      scene.add(agentTheoryHotspotSphereLayer.object);
    }

    const focusSprite = new THREE.Sprite(createFocusMaterial());
    focusSprite.visible = false;
    focusSprite.scale.setScalar(0.55);
    scene.add(focusSprite);
    const paperInspectionVisual = createPaperInspectionVisual(visualProfile);
    scene.add(paperInspectionVisual.object);
    const focusViewPosition = new THREE.Vector3();
    const systemCenterViewPosition = new THREE.Vector3();
    const systemWorldScale = new THREE.Vector3(1, 1, 1);
    const paperTraceStarWorldPosition = new THREE.Vector3();
    const paperTraceStarProjectedPosition = new THREE.Vector3();
    const paperTraceSourceWorldPosition = new THREE.Vector3();
    const paperTraceSourceProjectedPosition = new THREE.Vector3();
    const paperTraceTargetProjectedPosition = new THREE.Vector3();
    const paperTracePickWorldPosition = new THREE.Vector3();
    const paperTracePickProjectedPosition = new THREE.Vector3();
    const representativeSemanticProjectedPosition = new THREE.Vector3();
    const recentRepresentativeScreenPositions = new Map<string, Array<{
      timestamp: number;
      x: number;
      y: number;
    }>>();

    const raycaster = new THREE.Raycaster();
    const overviewPointPickThreshold = sceneData.kind === "app14" ? 0.22 : 0.16;
    raycaster.params.Points = { threshold: overviewPointPickThreshold };
    const pointer = new THREE.Vector2();
    const hotspotPickWorldPosition = new THREE.Vector3();
    const hotspotPickProjectedPosition = new THREE.Vector3();
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
      center: cameraPreset.center.clone(),
      distance: cameraPreset.distance,
      targetDistance: cameraPreset.distance,
      azimuth: cameraPreset.azimuth,
      elevation: cameraPreset.elevation,
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
    const publishCameraPose = () => {
      if (exploration.state !== "overview" || paperJourney.getState() !== "idle") return;
      const callback = onCameraPoseChangeRef.current;
      if (
        visualProfile === "agent-theory"
        && agentTheoryCameraMode === "explore-free"
        && exploration.state === "overview"
      ) {
        const center = agentTheoryCurrentLookTarget;
        const offset = camera.position.clone().sub(center);
        const distance = Math.max(0.001, offset.length());
        const pose: GalaxyCameraPose = {
          center: [center.x, center.y, center.z],
          distance,
          azimuth: Math.atan2(offset.y, offset.x),
          elevation: Math.asin(THREE.MathUtils.clamp(
            offset.z / distance,
            -1,
            1,
          )),
        };
        initialCameraPoseRef.current = pose;
        callback?.(pose);
        return;
      }
      const pose: GalaxyCameraPose = {
        center: [orbit.center.x, orbit.center.y, orbit.center.z],
        distance: orbit.distance,
        azimuth: orbit.azimuth,
        elevation: orbit.elevation,
      };
      initialCameraPoseRef.current = pose;
      callback?.(pose);
    };
    let overviewFramingMode: "initial" | "fit" | "manual" = "initial";
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
      canonicalRebased: false,
    };
    // The Three.js runtime can be rebuilt independently of the parent React
    // state (for example after Vite Fast Refresh or a scene-data replacement).
    // Its fresh state is always overview, so publish that state immediately;
    // otherwise the parent can remain in `system` while the canvas has already
    // returned to overview, disabling hotspot controls and making exit a no-op.
    onExplorationStateChangeRef.current?.("overview");
    const paperPresentation: GalaxyPaperJourneyPresentationRuntime = {
      mode: "none",
      visualType: "none",
      panelState: "hidden",
      startDistance: 0,
      targetScreenSize: 0,
      systemPointDiameter: APP17_SYSTEM_PAPER_FOCUS_ORDINARY_SIZE,
      compactOpticalDiameter: APP17_SYSTEM_PAPER_FOCUS_ORDINARY_SIZE,
      worldDiameter: APP17_PAPER_INSPECTION_WORLD_DIAMETER,
      targetBodyDiameterPx: APP17_REPRESENTATIVE_BODY_CORE_MIN_DIAMETER_PX,
      representativeCarrierRatio: 0,
      endpointStarExitMarginPx: 0,
      endpointCandidateCount: 0,
      endpointDirectionDeviationDegrees: 0,
      endpointCompositionRejected: false,
    };
    let publishedPaperFocusState: GalaxyPaperFocusState = "idle";
    const paperComposition: GalaxyPaperCompositionTimeline = {
      targetAnchorNdcX: 0,
      currentAnchorNdcX: 0,
      anchorErrorPx: 0,
      panelHeaderProgress: 0,
      panelBodyProgress: 0,
      cameraWriter: "orbit",
      cameraWriterChangesThisFrame: 0,
      returnHorizontalReversals: 0,
      lastReturnScreenX: Number.NaN,
      lastReturnDirection: 0,
    };
    const paperJourney = new App17PaperJourneyController();
    let paperJourneyFrame: GalaxyPaperJourneyFrame = paperJourney.getFrame();
    let previousPaperJourneyState: GalaxyPaperJourneyState = "idle";
    let pendingPaperJourneyAction: "exit-system" | "reset-system" | null = null;
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
    let agentTheoryHotspotClickTimer = 0;
    let lastSystemPaperPickMs = 0;
    let lastSystemPaperPickCandidateCount = 0;
    let lastPaperFocusTransitionMs = 0;
    let lastPaperFocusCanceled = false;
    let paperFocusTargetDistance = 0;
    let lastPaperAngularSizeRatio = 0;
    let lastPaperAngularGrowthRatio = 0;
    let paperFocusWorldPosition: THREE.Vector3 | null = null;
    const lastRenderedPaperCameraQuaternion = camera.quaternion.clone();
    let lastPaperQuaternionDeltaDegrees = 0;
    let lastPaperAnchorDeltaPx = 0;
    let lastPaperProjectionX = Number.NaN;
    let lastPaperHandoffAlphaSum = 1;
    let lastPaperHandoffPositionDeltaPx = 0;
    let lastPaperTargetWorldPositionDrift = 0;
    let lastPaperPointCoreDiameter = 0;
    let lastPaperDedicatedCoreDiameter = 0;
    let lastPaperPointAlpha = 1;
    let lastPaperDedicatedAlpha = 0;
    let lastPaperVisibleEnergyRatio = 1;
    let lastPaperFlightPathMode: GalaxyPaperFlightPathMode = "none";
    let lastPaperCameraDistance = 0;
    let lastPaperCenterErrorPx = 0;
    let lastPaperStarClearance = 0;
    let lastPaperStarSafeRadius = 0;
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
    let paperInspectionMotionStrength = 0;
    let lastInspectionToggleAt = Number.NEGATIVE_INFINITY;
    let lastPointerDragEndedAt = Number.NEGATIVE_INFINITY;
    let fullscreenBlend = fullscreenRef.current ? 1 : 0;
    let fullscreenTransition: App17ScalarTransition | null = null;
    let ambientTimeSeconds = 0;
    let environmentTimeSeconds = 0;
    let farRotationAngle = 0;
    let lastAmbientRenderTime = 0;
    let previousAgentTheoryInteractionMode = interactionModeRef.current;
    let agentTheoryCameraMode: AgentTheoryCameraMode =
      visualProfile === "agent-theory" && interactionModeRef.current === "ambient"
        ? "cruise"
        : "explore-free";
    let agentTheoryCruiseCheckpoint = agentTheoryPerimeterProfile
      ? initialAgentTheoryCruiseCheckpoint
        ? cloneAgentTheoryCruiseCheckpoint(initialAgentTheoryCruiseCheckpoint)
        : createAgentTheoryCruiseCheckpoint(
          agentTheoryPerimeterProfile,
          `${payload.snapshotId ?? "unknown"}:fallback`,
        )
      : null;
    let agentTheoryPreviousCruiseCheckpoint = agentTheoryCruiseCheckpoint
      ? cloneAgentTheoryCruiseCheckpoint(agentTheoryCruiseCheckpoint)
      : null;
    let agentTheoryReturnTransition:
      | AgentTheoryAnchorReturnTransitionV2
      | null = null;
    let agentTheoryReturnOrientation: {
      fromQuaternion: THREE.Quaternion;
      toQuaternion: THREE.Quaternion;
      fromLookDistance: number;
      toLookDistance: number;
      fromDepth: [number, number, number];
      toDepth: [number, number, number];
    } | null = null;
    let agentTheoryReturnPreparedAtMs = 0;
    let agentTheoryReturnAnchorLodResult:
      | AgentTheoryScreenLodResult
      | null = null;
    let agentTheoryReturnUnionIndices: number[] = [];
    let agentTheoryReturnProjectionSignature = "";
    let agentTheoryExpectedLodPurpose: AgentTheoryLodPurpose | null = null;
    let agentTheoryExpectedProjectionSignature = "";
    let agentTheoryDiscardedLodResponseCount = 0;
    let agentTheoryLastReturnProgressPublished = -1;
    let agentTheoryCruiseHealthAuditActive = false;
    let agentTheoryReturnAwaitingFirstCruiseStep = false;
    let agentTheoryCruiseResumeStartedAtMs = 0;
    let agentTheoryCruiseResumeStartStep = 0;
    let agentTheoryCruiseResumeSuccessfulSteps = 0;
    let agentTheoryCruiseResumeRejectedSteps = 0;
    let agentTheoryCruiseResumeFirstSuccessfulStep = -1;
    let agentTheoryCruiseResumeAmbientStart = 0;
    let agentTheoryCruiseResumeStillFrames = 0;
    let agentTheoryCruiseResumeGuardEvaluationCount = 0;
    let agentTheoryCruiseResumeGuardSafeCount = 0;
    const agentTheoryCruiseResumeProjectionStart = new THREE.Vector3();
    const agentTheoryCruiseResumeProjectionCurrent = new THREE.Vector3();
    const agentTheoryFreeLookPosition = orbitPoseCameraPosition({
      center: orbit.center,
      distance: orbit.distance,
      azimuth: orbit.azimuth,
      elevation: orbit.elevation,
    });
    const agentTheoryFreeLookDirection = orbit.center.clone()
      .sub(agentTheoryFreeLookPosition)
      .normalize();
    let agentTheoryFreeLookYaw = Math.atan2(
      agentTheoryFreeLookDirection.y,
      agentTheoryFreeLookDirection.x,
    );
    let agentTheoryFreeLookPitch = Math.asin(THREE.MathUtils.clamp(
      agentTheoryFreeLookDirection.z,
      -1,
      1,
    ));
    let agentTheoryFreeLookDollyVelocity = 0;
    let agentTheoryFreeLookLastUpdateAt = performance.now();
    let agentTheoryFreeLookPointerMode: "look" | "pan" = "look";
    let agentTheoryFreeLookAim: {
      startedAtMs: number;
      durationMs: number;
      fromPosition: THREE.Vector3;
      toPosition: THREE.Vector3;
      fromQuaternion: THREE.Quaternion;
      toQuaternion: THREE.Quaternion;
      lookDistance: number;
    } | null = null;
    let agentTheorySavedFreeLookPose: {
      position: THREE.Vector3;
      direction: THREE.Vector3;
    } | null = null;
    let agentTheoryCruiseAccumulatorSeconds = 0;
    let agentTheoryCruiseInterpolationAlpha = 0;
    let agentTheoryCruiseBacklogTruncationCount = 0;
    let lastAgentTheoryCruisePublishedStep =
      agentTheoryCruiseCheckpoint?.stepIndex ?? 0;
    const agentTheoryLookTarget = cameraPreset.center.clone();
    const agentTheoryCurrentLookTarget = cameraPreset.center.clone();
    const agentTheoryCruiseOrientationProbe = new THREE.PerspectiveCamera();
    const agentTheoryCruisePreviousQuaternion = new THREE.Quaternion();
    const agentTheoryCruiseCurrentQuaternion = new THREE.Quaternion();
    const agentTheoryCruiseRenderDirection = new THREE.Vector3();
    const agentTheoryPointerOffsetTarget = new THREE.Vector2();
    const agentTheoryPointerOffsetCurrent = new THREE.Vector2();
    let agentTheoryPendingReturnAfterSystemExit = false;
    let agentTheoryStellarLodTransitionCount = 0;
    let agentTheoryCruiseCheckpointProjectionErrorPx = 0;
    let agentTheoryCruiseCheckpointSaveAllowed = true;
    let agentTheoryCruiseCheckpointSaveTimer = 0;
    let agentTheoryCruiseCheckpointSaveIdleId = 0;
    let agentTheoryCruiseViewTangentWeight: number | null = null;
    let agentTheoryCruiseVerticalAimRatio = 0;
    let agentTheoryCruiseFallbackToCenter = false;
    let agentTheoryCruiseDesiredTangentWeight: number | null = null;
    let agentTheoryCruiseDesiredVerticalAimRatio = 0;
    let agentTheoryVisibilityGuardLastEvaluatedAt =
      Number.NEGATIVE_INFINITY;
    let agentTheoryVisibilityCheckpointValid = false;
    let agentTheoryVisibilityLodTargetRejected = false;
    let agentTheoryReturnVisibilityGatePassed = false;
    let agentTheoryVisibilityGuard =
      createEmptyAgentTheoryVisibilityGuardSnapshot();
    let agentTheoryLastSafeCruiseCheckpoint = agentTheoryCruiseCheckpoint
      ? cloneAgentTheoryCruiseCheckpoint(agentTheoryCruiseCheckpoint)
      : null;
    const initialAgentTheoryCruiseDirection = (
      Math.sign(agentTheoryCruiseCheckpoint?.angularVelocity ?? 1) || 1
    ) as -1 | 1;
    let agentTheoryCruiseGuidance: AgentTheoryCruiseGuidanceV1 = {
      mode: "normal",
      tangentWeight:
        agentTheoryCruiseCheckpoint?.tangentWeight ?? 0.7,
      verticalAimRatio: 0,
      directionSign: initialAgentTheoryCruiseDirection,
      speedScale: 1,
    };
    let agentTheoryCruiseGuidanceTarget: AgentTheoryCruiseGuidanceV1 = {
      ...agentTheoryCruiseGuidance,
    };
    let agentTheoryCruiseCenterBlend = 0;
    let agentTheoryCruiseCenterBlendTarget = 0;
    let agentTheoryGuidanceSafeSinceMs = performance.now();
    let agentTheoryCruiseRecoveryCount = 0;
    let agentTheoryCruiseLastLivenessPublishedAt =
      Number.NEGATIVE_INFINITY;
    let agentTheoryCruiseLivenessBaselineAt = performance.now();
    let agentTheoryCruiseLivenessBaselineStep =
      agentTheoryCruiseCheckpoint?.stepIndex ?? 0;
    const agentTheoryCruiseLivenessBaselineCamera =
      camera.position.clone();
    let agentTheoryCruiseLastProgressAt = performance.now();
    const agentTheoryCruiseProbeProjection = new THREE.Vector2();
    const agentTheoryCruiseProbePreviousProjection = new THREE.Vector2();
    const agentTheoryCruiseProbeVelocity = new THREE.Vector2();
    const agentTheoryCruiseProbePreviousVelocity = new THREE.Vector2();
    let agentTheoryCruiseProbeLastAt = 0;
    let agentTheoryCruiseProbeInitialized = false;
    let agentTheoryCruiseProbeSpeedPxPerSecond = 0;
    let agentTheoryCruiseProbeAccelerationPxPerSecond2 = 0;
    let agentTheoryCruiseProbeResidualPx = 0;
    let agentTheoryExploreEntryAnchor:
      | AgentTheoryExploreSafeAnchorV2
      | null = null;
    let lastAgentTheoryDepthUpdateAt = Number.NEGATIVE_INFINITY;
    let agentTheoryDepthTargetP5 = 0;
    let agentTheoryDepthTargetP50 = 0;
    let agentTheoryDepthTargetP95 = 1;
    let agentTheoryDepthCurrentP5 = 0;
    let agentTheoryDepthCurrentP50 = 0;
    let agentTheoryDepthCurrentP95 = 1;
    let agentTheoryDepthMaximumFrameDelta = 0;
    let agentTheoryCachedDiagnosticDepthRows: Array<{
      index: number;
      depth: number;
      size: number;
    }> = [];
    let lastAgentTheoryScreenLodUpdateAt = Number.NEGATIVE_INFINITY;
    let lastAgentTheoryScreenLodForcedSignature = "";
    let agentTheoryScreenLodResult: AgentTheoryScreenLodResult | null = null;
    const agentTheoryScreenLodCameraPosition = new THREE.Vector3(
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
    );
    const agentTheoryScreenLodCameraQuaternion = new THREE.Quaternion();
    let agentTheoryScreenLodCameraDistance = 0;
    const agentTheoryScreenLodWorld = new THREE.Vector3();
    const agentTheoryScreenLodView = new THREE.Vector3();
    const agentTheoryScreenLodProjection = new THREE.Vector3();
    const agentTheoryScreenLodLocalToClip = new THREE.Matrix4();
    let agentTheoryScreenLodWorker:
      | AgentTheoryScreenLodWorkerClient
      | null = null;
    let agentTheoryScreenLodWorkerReady = false;
    let agentTheoryScreenLodWorkerFailed = false;
    let agentTheoryGuidanceLastRequestedAt =
      Number.NEGATIVE_INFINITY;
    let agentTheoryGuidanceLastAcceptedAt =
      Number.NEGATIVE_INFINITY;
    let agentTheoryGuidanceTargetChangedAt = performance.now();
    let agentTheoryGuidanceConsecutiveUnsafeResults = 0;
    let agentTheoryGuidanceTargetSwitchCount = 0;
    let agentTheoryGuidanceEmergencyOverrideCount = 0;
    let agentTheoryGuidanceWorkerLatencyMs = 0;
    let agentTheoryGuidanceFallbackIdleId = 0;
    let agentTheoryGuidanceFallbackTimer = 0;
    let agentTheoryGuidanceFallbackLastScheduledAt =
      Number.NEGATIVE_INFINITY;
    let agentTheoryGuidanceFallbackCount = 0;
    let agentTheoryGuidanceWorkerEpoch = 0;
    let agentTheoryGuidanceLastAcceptedRevision = 0;
    let agentTheoryGuidanceResumeNotBeforeMs =
      Number.NEGATIVE_INFINITY;
    let agentTheoryGuidanceSource:
      AgentTheoryPostReturnTrajectorySnapshot["guidanceSource"] = "none";
    let agentTheoryPostReturnDiagnosticStartedAtMs =
      Number.NEGATIVE_INFINITY;
    let agentTheoryPostReturnExtraFramingCount = 0;
    let agentTheoryPostReturnAcceptedWorkerRevision = 0;
    let agentTheoryPostReturnDiscardedWorkerResponses = 0;
    let agentTheoryPostReturnFallbackTriggerCount = 0;
    let agentTheoryPostReturnMaximumTrajectoryResidualPx = 0;
    let agentTheoryMainThreadLodRevision = 0;
    let agentTheoryMainThreadLodFrame = 0;
    let agentTheoryMainThreadLodCommitIdleId = 0;
    let agentTheoryMainThreadLodCommitTimer = 0;
    let agentTheoryMainThreadLodJob: {
      revision: number;
      cursor: number;
      candidates: AgentTheoryScreenLodCandidate[];
      localToClipMatrix: Float32Array;
      purpose: AgentTheoryLodPurpose;
      projectionSignature: AgentTheoryProjectionSignature;
      previousVisibleMask: Uint8Array;
      forcedVisibleMask: Uint8Array;
      width: number;
      height: number;
      quality: AgentTheoryQuality;
    } | null = null;
    let agentTheoryDepthDiagnostics: AgentTheoryDepthDiagnostics = {
      displaySpace: agentTheoryDepthProfile
        ? "agent-depth-enhanced"
        : "raw",
      rawAxisStd: agentTheoryDepthProfile
        ? [...agentTheoryDepthProfile.rawAxisStd]
        : [0, 0, 0],
      rawDepthRatio: agentTheoryDepthProfile?.rawDepthRatio ?? 0,
      depthScale: agentTheoryDepthProfile?.depthScale ?? 1,
      viewDepthP5: 0,
      viewDepthP50: 0,
      viewDepthP95: 1,
      nearPaperCount: 0,
      middlePaperCount: sceneData.papers.length,
      farPaperCount: 0,
      nearPaperSizeRange: [0, 0],
      middlePaperSizeRange: [0, 0],
      farPaperSizeRange: [0, 0],
      ambientCamera: {
        active: false,
        azimuthOffsetDegrees: 0,
        elevationOffsetDegrees: 0,
        distanceOffsetRatio: 0,
      },
      projectedParallaxDeltaPx: 0,
      decorativeStarCount: agentTheoryDecorativeLayer?.starCount ?? 0,
      decorativeDustCount: agentTheoryDecorativeLayer?.dustCount ?? 0,
      decorativeDegradationReason:
        agentTheoryDecorativeLayer?.degradationReason ?? "",
      cameraMode: agentTheoryCameraMode,
      perimeterSector: 0,
      perimeterSafetyMargin: 0,
      perimeterNearestEntityDistance: 0,
      visibleGalaxyRatio: 0,
      visitedSectorRatio: 0,
      cruiseSpeed: 0,
      cruiseAcceleration: 0,
      cruiseCheckpointProjectionErrorPx: 0,
      stellarLodCounts: {
        point: 0,
        psf: 0,
        "near-psf": 0,
        sphere: 0,
      },
      activeSphereHotspotCount: 0,
      currentSphereHotspotCount: 0,
      retiringSphereHotspotCount: 0,
      stellarLodTransitionCount: 0,
      shaderStatus: visualProfile === "agent-theory" ? "pending" : "ready",
      shaderFailureMaterials: [],
      webglErrorCount: 0,
      firstFrameVisiblePaperCount: 0,
      firstFrameVisibleHotspotCount: 0,
      firstFrameDecorativeVisibleCount: 0,
      perimeterReframeCount: 0,
      perimeterDegradationReason: "",
      readyGatePassed: false,
      residentPaperCount: sceneData.papers.length,
      perceptiblePaperCount: sceneData.papers.length,
      forcedVisibleCount: 0,
      occupiedTileRatio: 0,
      overlapP95: 0,
      screenLodSelectionHash: "",
      screenLodBackend: "main-thread-fallback",
      screenLodWorkerLatencyMs: 0,
      screenLodRequestedRevision: 0,
      screenLodAcceptedRevision: 0,
      screenLodDiscardedResponses: 0,
      screenLodViewportCount: 0,
      screenLodGuardBandCount: 0,
      screenLodIncomingCount: 0,
      screenLodRetiringCount: 0,
      returnPendingVisualTaskCount: 0,
      returnDepthErrorRatio: 0,
      actualCoreSizeRange: [0, 0],
      actualAlphaRange: [0, 0],
      freeLookPosition: camera.position.toArray() as [number, number, number],
      freeLookDirection: agentTheoryFreeLookDirection.toArray() as [
        number,
        number,
        number,
      ],
      returnProjectionErrorPx: 0,
      returnDirectionStepDegrees: 0,
      depthTargetP5: 0,
      depthTargetP95: 1,
      depthMaximumFrameDelta: 0,
      cruiseInterpolationAlpha: 0,
      cruiseBacklogTruncationCount: 0,
      visibleHotspotCount: 0,
      hotspotOccupiedCellCount: 0,
      hotspotCoreSizeRange: [0, 0],
      hotspotSphereOffscreenSlotCount: 0,
      visibilityGuard: { ...agentTheoryVisibilityGuard },
      visibilityLodTargetRejected: false,
      visibilityCheckpointValid: false,
      returnVisibilityGatePassed: false,
      returnPhase: "idle",
      returnProgress: 0,
      returnStartPosition: [0, 0, 0],
      returnAnchorPosition: [0, 0, 0],
      returnDistance: 0,
      returnAngleDegrees: 0,
      returnMaximumSegmentDeviation: 0,
      returnCurrentSelectionCount: 0,
      returnAnchorSelectionCount: 0,
      returnUnionSelectionCount: 0,
      returnActualVisiblePaperCount: 0,
      returnActualVisibleHotspotCount: 0,
      returnActualVisibleHotspotCellCount: 0,
      returnMinimumVisiblePaperCount: Number.POSITIVE_INFINITY,
      returnBlackFrameCount: 0,
      returnProjectionSignature: "",
      returnDiscardedLodResponseCount: 0,
      returnCruiseRestoreDurationMs: 0,
      returnCruiseAdvanceRejectedCount: 0,
      returnCruiseFirstSuccessfulStep: -1,
      returnCruiseCheckpointDelta: 0,
      returnAmbientTimeDelta: 0,
      returnConsecutiveStillFrames: 0,
      returnCruiseGuardEvaluationCount: 0,
      returnCruiseGuardSafeCount: 0,
      postReturnTrajectory: {
        active: false,
        elapsedMs: 0,
        cameraWriter: "none",
        guidanceEpoch: 0,
        guidanceSource: "none",
        acceptedWorkerRevision: 0,
        discardedWorkerResponseCount: 0,
        fallbackTriggerCount: 0,
        extraFramingCount: 0,
        lodHash: "",
        depthHash: "",
        maximumTrajectoryResidualPx: 0,
      },
      cruiseLiveness: {
        motionVersion: AGENT_THEORY_CRUISE_MOTION_VERSION,
        cameraMode: agentTheoryCameraMode,
        guidanceMode: agentTheoryCruiseGuidance.mode,
        stepIndex: agentTheoryCruiseCheckpoint?.stepIndex ?? 0,
        stepDeltaLastSecond: 0,
        projectionMovementPxLastSecond: 0,
        visibilitySafe: false,
        predictedPaperCount: 0,
        predictedHotspotCount: 0,
        consecutiveStillMs: 0,
        recoveryCount: 0,
        randomTargetSecondsRemaining: 0,
        angularVelocity: agentTheoryCruiseCheckpoint?.angularVelocity ?? 0,
        angularAcceleration:
          agentTheoryCruiseCheckpoint?.angularAcceleration ?? 0,
        verticalAcceleration:
          agentTheoryCruiseCheckpoint?.verticalAcceleration ?? 0,
        workerGuidanceLatencyMs: 0,
        workerGuidancePending: 0,
        workerGuidanceDiscarded: 0,
        guidanceTargetHoldMs: 0,
        guidanceTargetSwitchCount: 0,
        guidanceEmergencyOverrideCount: 0,
        mainThreadGuidanceFallbackCount: 0,
        referenceProjectionSpeedPxPerSecond: 0,
        referenceProjectionAccelerationPxPerSecond2: 0,
        referenceTrajectoryResidualPx: 0,
        pausedReason: interactionModeRef.current === "explore"
          ? "explore"
          : reduceMotion
            ? "reduced-motion"
            : undefined,
      },
    };
    root.updateMatrixWorld(true);
    applyCameraOrbit(camera, orbit);

    let frameId = 0;
    let width = 1;
    let height = 1;
    let disposed = false;
    let viewportOffsetCurrent = visualProfile === "analysis"
      ? 0
      : viewportOffsetCurrentRef.current;
    if (visualProfile === "analysis") {
      viewportOffsetCurrentRef.current = 0;
      camera.clearViewOffset();
      camera.updateProjectionMatrix();
    }
    let viewportOffsetTransition: {
      from: number;
      to: number;
      startedAt: number;
      phase: "rail-only" | "focusing-paper" | "returning-system";
    } | null = null;

    const viewportOffsetForRail = (mode: GalaxyContextRailMode) => {
      if (visualProfile === "analysis") {
        return resolveResearchGalaxyContextComposition(mode, width).viewportOffsetRatio;
      }
      const railWidth = resolveGalaxyContextRailWidth(mode, width);
      return railWidth <= 0 ? 0 : (railWidth + 24) / Math.max(2, width * 2);
    };

    const applyViewportComposition = (now: number, force = false) => {
      if (viewportOffsetTransition) {
        const progress = viewportOffsetTransition.phase === "focusing-paper"
          ? paperJourneyFrame.focusBlend
          : viewportOffsetTransition.phase === "returning-system"
            ? 1 - paperJourneyFrame.focusBlend
            : THREE.MathUtils.clamp(
                (now - viewportOffsetTransition.startedAt) / 320,
                0,
                1,
              );
        viewportOffsetCurrent = THREE.MathUtils.lerp(
          viewportOffsetTransition.from,
          viewportOffsetTransition.to,
          viewportOffsetTransition.phase === "rail-only" ? smootherStep(progress) : progress,
        );
        if (progress >= 1) viewportOffsetTransition = null;
      }
      viewportOffsetCurrentRef.current = viewportOffsetCurrent;
      const offsetPixels = Math.round(width * viewportOffsetCurrent);
      if (offsetPixels === 0) camera.clearViewOffset();
      else camera.setViewOffset(width, height, offsetPixels, 0, width, height);
      if (force) camera.updateProjectionMatrix();
      return Boolean(viewportOffsetTransition);
    };

    viewportOffsetControllerRef.current = (mode) => {
      const target = viewportOffsetForRail(mode);
      if (Math.abs(target - viewportOffsetCurrent) < 0.00001) return;
      const journeyState = paperJourney.getState();
      const phase = mode === "paper-reading" && (journeyState === "acquiring" || journeyState === "flying-in")
        ? "focusing-paper"
        : mode === "hotspot" && (journeyState === "flying-out" || journeyState === "releasing")
          ? "returning-system"
          : "rail-only";
      viewportOffsetTransition = {
        from: viewportOffsetCurrent,
        to: target,
        startedAt: performance.now(),
        phase,
      };
      invalidateRef.current?.();
    };
    viewportOffsetControllerRef.current(contextRailModeRef.current);
    let runtimeActive = active;
    let renderRequested = true;
    let firstFrameReported = false;
    let readyReported = false;
    let runtimeFailureReported = false;
    let agentTheoryInitialGateComplete = visualProfile !== "agent-theory";
    let lastPosePublishedAt = Number.NEGATIVE_INFINITY;
    let labelDirty = true;
    let lastRenderTime = 0;
    let lastLabelRenderTime = Number.NEGATIVE_INFINITY;
    const agentTheoryLabelRuntimeStates =
      new Map<string, AgentTheoryLabelRuntimeState>();
    let autoResumeTimer = 0;
    let agentTheoryLodRefreshTimer = 0;
    let agentTheoryLodRefreshPending = false;
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
    let lastSystemEntryCameraTravelDistance = 0;
    let lastSystemEntryCameraRayDeviation = 0;
    let lastSystemEntryDistanceMonotonicViolations = 0;
    let lastRepresentativeHandoffProjectionDeltaPx = 0;
    let previousSystemEntryHotspotDistance = Number.POSITIVE_INFINITY;
    let lastSystemEntryNonSelectedWorldDrift = 0;
    let lastSystemEntryScale = 1;
    let systemCanonicalRebaseCount = 0;
    let lastSystemCanonicalRebaseProjectionDeltaPx = 0;
    let lastFarBackgroundRebaseProjectionDeltaPx = 0;
    let lastSystemEntrySelectedCenterDeltaPx = 0;
    let lastSystemEntryCloudDiameterRatio = 1;
    const systemEntryCameraStart = new THREE.Vector3();
    const theoryEntryRayTarget = new THREE.Vector3();
    const theoryEntryRayDirection = new THREE.Vector3(1, 0, 0);
    let theoryEntryRayStartDistance = 0;
    let theoryEntryRayEndDistance = 0;
    let queuedEnterHotspotId = "";
    let theoryWorldReference: Array<{
      kind: "paper" | "hotspot";
      index: number;
      x: number;
      y: number;
      z: number;
    }> = [];
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

    // Overview breathing keeps the galaxy alive while nothing is selected. It
    // stays off whenever the frame budget, the user's motion preference or the
    // page visibility says it should.
    let overviewAmbientDegraded = false;
    let overviewAmbientSlowWindows = 0;
    let overviewAmbientLastFrameTime = 0;
    const overviewAmbientFrameDeltas: number[] = [];

    function overviewAmbientActive() {
      return !reduceMotion
        && (
          !overviewAmbientDegraded
          || visualProfile === "agent-theory"
        )
        && (exploration.state === "overview" || exploration.state === "preparing");
    }

    function getOverviewAmbientFrameInterval() {
      // Perimeter cruise is camera motion, not a decorative breathing pass.
      // Render it on every display RAF and degrade decoration/labels instead
      // of quantising the camera to the former 24/18 FPS cadence.
      if (visualProfile === "agent-theory") return 0;
      return APP17_OVERVIEW_AMBIENT_FRAME_INTERVAL;
    }

    function getSystemAmbientFrameInterval() {
      if (sceneData.kind === "app14") {
        return APP17_APP14_AMBIENT_FRAME_INTERVAL;
      }
      return visualProfile === "agent-theory"
        ? APP17_AGENT_THEORY_SYSTEM_AMBIENT_FRAME_INTERVAL
        : APP17_APP15_AMBIENT_FRAME_INTERVAL;
    }

    // Watches the real cadence of the overview breathing frames. The diagnostics
    // samplers only run while the panel is open, so this keeps its own window.
    function trackOverviewAmbientCadence(now: number) {
      if (overviewAmbientDegraded) return;
      const previous = overviewAmbientLastFrameTime;
      overviewAmbientLastFrameTime = now;
      if (previous <= 0) return;
      const delta = now - previous;
      // A frame that arrives after a long gap is a scheduling pause, not a slow
      // frame; counting it would degrade on tab switches and drag releases.
      if (delta > APP17_OVERVIEW_AMBIENT_SLOW_FRAME_MS * 4) {
        overviewAmbientFrameDeltas.length = 0;
        return;
      }
      overviewAmbientFrameDeltas.push(delta);
      if (overviewAmbientFrameDeltas.length < 24) return;
      const sorted = overviewAmbientFrameDeltas.slice().sort((first, second) => first - second);
      const p95 = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)];
      overviewAmbientFrameDeltas.length = 0;
      if (p95 <= APP17_OVERVIEW_AMBIENT_SLOW_FRAME_MS) {
        overviewAmbientSlowWindows = 0;
        return;
      }
      overviewAmbientSlowWindows += 1;
      if (overviewAmbientSlowWindows < APP17_OVERVIEW_AMBIENT_SLOW_WINDOWS_BEFORE_DEGRADE) return;
      overviewAmbientDegraded = true;
      applyAmbientVisuals();
      invalidate();
    }

    function getAmbientMotion(): GalaxyAmbientMotion {
      if (reduceMotion) return "none";
      if (exploration.state === "overview" || exploration.state === "preparing") {
        return overviewAmbientDegraded && visualProfile !== "agent-theory"
          ? "none"
          : "breath";
      }
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
      if (reduceMotion) return 0;
      if (exploration.state !== "system") {
        if (!overviewAmbientActive()) return 0;
        const interval = getOverviewAmbientFrameInterval();
        return interval <= 0 ? 60 : Math.round(1_000 / interval);
      }
      return Math.round(1_000 / getSystemAmbientFrameInterval());
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
        && cameraPreset.autoRotate
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

    const agentTheoryDepthWorld = new THREE.Vector3();
    const agentTheoryDepthView = new THREE.Vector3();
    const agentTheoryCurrentProjection = new THREE.Vector3();
    const agentTheoryBaseProjection = new THREE.Vector3();
    const agentTheoryBaseCamera = new THREE.PerspectiveCamera(
      APP17_CAMERA_FOV,
      1,
      0.1,
      240,
    );
    agentTheoryBaseCamera.up.set(0, 0, 1);
    const agentTheoryVisibilityProbeCamera = new THREE.PerspectiveCamera(
      APP17_CAMERA_FOV,
      1,
      0.1,
      240,
    );
    agentTheoryVisibilityProbeCamera.up.set(0, 0, 1);
    const agentTheoryVisibilityFrustum = new THREE.Frustum();
    const agentTheoryVisibilityProjection = new THREE.Matrix4();
    const agentTheoryVisibilityWorld = new THREE.Vector3();
    const agentTheoryReturnProjectionWorld = new THREE.Vector3();
    const agentTheoryReturnProjectionBefore = new THREE.Vector3();
    const agentTheoryReturnProjectionAfter = new THREE.Vector3();

    function createAgentTheoryCruiseLookTarget(
      sample: ReturnType<typeof sampleAgentTheoryCruise>,
      tangentWeight = sample.tangentWeight,
      verticalAimRatio = 0,
      fallbackToCenter: boolean | number = false,
      directionSign?: number,
    ) {
      if (!agentTheoryPerimeterProfile) {
        return cameraPreset.center.clone();
      }
      const centerBlend = typeof fallbackToCenter === "number"
        ? THREE.MathUtils.clamp(fallbackToCenter, 0, 1)
        : fallbackToCenter ? 1 : 0;
      const position = new THREE.Vector3().fromArray(sample.position);
      const center = new THREE.Vector3().fromArray(
        agentTheoryPerimeterProfile.center,
      );
      const verticalAxis = new THREE.Vector3().fromArray(
        agentTheoryPerimeterProfile.principalAxes[2],
      ).normalize();
      const relative = position.clone().sub(center);
      const radial = relative.clone()
        .addScaledVector(verticalAxis, -relative.dot(verticalAxis))
        .normalize();
      const axisX = new THREE.Vector3().fromArray(
        agentTheoryPerimeterProfile.principalAxes[0],
      );
      const axisY = new THREE.Vector3().fromArray(
        agentTheoryPerimeterProfile.principalAxes[1],
      );
      const planeX = radial.dot(axisX);
      const planeY = radial.dot(axisY);
      const tangentSign = directionSign ?? THREE.MathUtils.clamp(
        (agentTheoryCruiseCheckpoint?.angularVelocity ?? 0.0045)
          / Math.max(
            0.001575,
            0.0045 * agentTheoryCruiseGuidance.speedScale,
          ),
        -1,
        1,
      );
      const tangent = axisX.clone().multiplyScalar(-planeY)
        .addScaledVector(axisY, planeX)
        .multiplyScalar(tangentSign)
        .normalize();
      const boundedTangent = THREE.MathUtils.clamp(tangentWeight, 0.55, 0.75);
      const inwardWeight = Math.sqrt(
        Math.max(0.001, 1 - boundedTangent * boundedTangent),
      );
      const direction = tangent.multiplyScalar(boundedTangent)
        .addScaledVector(radial, -inwardWeight)
        .normalize();
      const framedTarget = position.add(
        direction.multiplyScalar(
          Math.max(
            APP15_THEORY_COORDINATE_SCALE * 18,
            agentTheoryPerimeterProfile.medianRadius * 0.88,
          ),
        ),
      ).addScaledVector(
        verticalAxis,
        verticalAimRatio * agentTheoryPerimeterProfile.verticalExtent,
      );
      return framedTarget.lerp(cameraPreset.center, centerBlend);
    }

    function measureAgentTheoryVisibility(
      position: THREE.Vector3,
      lookTarget: THREE.Vector3,
      paperSampleLimit = 2_048,
    ) {
      agentTheoryVisibilityProbeCamera.aspect = camera.aspect;
      agentTheoryVisibilityProbeCamera.zoom = camera.zoom;
      agentTheoryVisibilityProbeCamera.near = camera.near;
      agentTheoryVisibilityProbeCamera.far = camera.far;
      agentTheoryVisibilityProbeCamera.position.copy(position);
      agentTheoryVisibilityProbeCamera.lookAt(lookTarget);
      agentTheoryVisibilityProbeCamera.updateProjectionMatrix();
      agentTheoryVisibilityProbeCamera.updateMatrixWorld(true);
      agentTheoryVisibilityProjection.multiplyMatrices(
        agentTheoryVisibilityProbeCamera.projectionMatrix,
        agentTheoryVisibilityProbeCamera.matrixWorldInverse,
      );
      agentTheoryVisibilityFrustum.setFromProjectionMatrix(
        agentTheoryVisibilityProjection,
      );
      root.updateMatrixWorld(true);
      let sampledVisiblePaperCount = 0;
      let hotspotCount = 0;
      const hotspotCells = new Set<string>();
      const paperStride = Math.max(
        1,
        Math.ceil(sceneData.papers.length / paperSampleLimit),
      );
      let sampledPaperCount = 0;
      for (
        let paperIndex = 0;
        paperIndex < sceneData.papers.length;
        paperIndex += paperStride
      ) {
        const paper = sceneData.papers[paperIndex];
        sampledPaperCount += 1;
        agentTheoryVisibilityWorld
          .set(paper.x, paper.y, paper.z)
          .applyMatrix4(root.matrixWorld);
        if (agentTheoryVisibilityFrustum.containsPoint(agentTheoryVisibilityWorld)) {
          sampledVisiblePaperCount += 1;
        }
      }
      sceneData.hotspots.forEach((hotspot) => {
        agentTheoryVisibilityWorld
          .copy(hotspot.position)
          .applyMatrix4(root.matrixWorld);
        const coreCssSize = resolveAgentTheoryHotspotCoreCssSize(
          hotspot.importance,
        );
        const coreAlpha = 0.82;
        if (
          agentTheoryVisibilityFrustum.containsPoint(agentTheoryVisibilityWorld)
          && coreCssSize >= APP17_AGENT_THEORY_HOTSPOT_CORE_MIN_CSS_PX
          && coreAlpha >= 0.82
        ) {
          hotspotCount += 1;
          agentTheoryCurrentProjection
            .copy(agentTheoryVisibilityWorld)
            .project(agentTheoryVisibilityProbeCamera);
          const cellX = THREE.MathUtils.clamp(
            Math.floor((agentTheoryCurrentProjection.x * 0.5 + 0.5) * 6),
            0,
            5,
          );
          const cellY = THREE.MathUtils.clamp(
            Math.floor((-agentTheoryCurrentProjection.y * 0.5 + 0.5) * 4),
            0,
            3,
          );
          hotspotCells.add(`${cellX}:${cellY}`);
        }
      });
      const projectedPaperCount = Math.round(
        sampledVisiblePaperCount / Math.max(1, sampledPaperCount)
          * sceneData.papers.length,
      );
      const paperCount = Math.min(
        projectedPaperCount,
        resolveAgentTheoryScreenLodTarget(width, height, agentTheoryQuality),
      );
      const semanticCount = sampledVisiblePaperCount + hotspotCount;
      return {
        paperCount,
        sampledVisiblePaperCount,
        projectedPaperCount,
        hotspotCount,
        hotspotCellCount: hotspotCells.size,
        decorativeCount:
          agentTheoryDecorativeLayer?.countVisible(
            agentTheoryVisibilityProbeCamera,
          ) ?? 0,
        semanticCount,
        ratio: semanticCount / Math.max(
          1,
          sampledPaperCount + sceneData.hotspots.length,
        ),
      };
    }

    function visibilityCounts(
      visibility: ReturnType<typeof measureAgentTheoryVisibility>,
    ): AgentTheoryVisibilityCounts {
      return {
        paperCount: visibility.paperCount,
        hotspotCount: visibility.hotspotCount,
        hotspotCellCount: visibility.hotspotCellCount,
      };
    }

    function evaluateAgentTheoryVisibilityHorizon(
      checkpoint: AgentTheoryCruiseCheckpointV1,
      tangentWeight: number,
      verticalAimRatio: number,
      fallbackToCenter: boolean | number = false,
      directionSign = (
        Math.sign(checkpoint.angularVelocity) || 1
      ) as -1 | 1,
      speedScale = 1,
      options?: {
        horizonOffsetsSeconds?: number[];
        paperSampleLimit?: number;
      },
    ) {
      if (!agentTheoryPerimeterProfile) return null;
      const envelope = createAgentTheoryVisibilityEnvelope(width, height);
      const horizonOffsetsSeconds =
        options?.horizonOffsetsSeconds ?? [0, 1.5, 3, 4.5, 6];
      let futureCheckpoint = cloneAgentTheoryCruiseCheckpoint(checkpoint);
      let previousOffsetSeconds = 0;
      const rows: Array<{
        counts: AgentTheoryVisibilityCounts;
        visibility: ReturnType<typeof measureAgentTheoryVisibility>;
      }> = [];
      for (const offsetSeconds of horizonOffsetsSeconds) {
        const deltaSteps = Math.max(
          0,
          Math.round(
            (offsetSeconds - previousOffsetSeconds)
              / AGENT_THEORY_CRUISE_FIXED_STEP_SECONDS,
          ),
        );
        if (deltaSteps > 0) {
          futureCheckpoint = advanceAgentTheoryCruise(
            agentTheoryPerimeterProfile,
            futureCheckpoint,
            deltaSteps,
            {
              directionSign,
              speedScale,
            },
          );
        }
        previousOffsetSeconds = offsetSeconds;
        const sample = sampleAgentTheoryCruise(
          agentTheoryPerimeterProfile,
          futureCheckpoint,
        );
        const position = new THREE.Vector3().fromArray(sample.position);
        const lookTarget = createAgentTheoryCruiseLookTarget(
          sample,
          tangentWeight,
          verticalAimRatio,
          fallbackToCenter,
          directionSign,
        );
        const visibility = measureAgentTheoryVisibility(
          position,
          lookTarget,
          options?.paperSampleLimit,
        );
        rows.push({
          visibility,
          counts: visibilityCounts(visibility),
        });
      }
      const minimum: AgentTheoryVisibilityCounts = {
        paperCount: Math.min(...rows.map((row) => row.counts.paperCount)),
        hotspotCount: Math.min(...rows.map((row) => row.counts.hotspotCount)),
        hotspotCellCount: Math.min(
          ...rows.map((row) => row.counts.hotspotCellCount),
        ),
      };
      return {
        current: rows[0],
        minimum,
        rows,
        safe: rows.every((row) => (
          isAgentTheoryVisibilitySafe(row.counts, envelope)
        )),
        score: rows.reduce(
          (total, row) => (
            total + scoreAgentTheoryVisibility(row.counts, envelope)
          ),
          0,
        )
          + (Number(fallbackToCenter) > 0 ? 4 : 0)
          + (
            directionSign === (Math.sign(checkpoint.angularVelocity) || 1)
              ? 0
              : 0.35
          ),
        envelope,
      };
    }

    function findBestAgentTheoryVisibilityFraming(
      checkpoint: AgentTheoryCruiseCheckpointV1,
      broadSearch: boolean,
      options?: {
        horizonOffsetsSeconds?: number[];
        paperSampleLimit?: number;
      },
    ) {
      const sample = sampleAgentTheoryCruise(
        agentTheoryPerimeterProfile!,
        checkpoint,
      );
      const currentTangent = agentTheoryCruiseDesiredTangentWeight
        ?? agentTheoryCruiseViewTangentWeight
        ?? sample.tangentWeight;
      const currentVertical = agentTheoryCruiseDesiredVerticalAimRatio;
      const currentDirection = (
        Math.sign(checkpoint.angularVelocity) || 1
      ) as -1 | 1;
      const directionSigns: Array<-1 | 1> = broadSearch
        ? [currentDirection, (currentDirection * -1) as -1 | 1]
        : [currentDirection];
      const tangentWeights = broadSearch
        ? [0.55, 0.60, 0.65, 0.70, 0.75]
        : [
          THREE.MathUtils.clamp(currentTangent - 0.05, 0.55, 0.75),
          THREE.MathUtils.clamp(currentTangent, 0.55, 0.75),
          THREE.MathUtils.clamp(currentTangent + 0.05, 0.55, 0.75),
        ];
      const verticalAimRatios = broadSearch
        ? [-0.28, -0.14, 0, 0.14, 0.28]
        : [
          THREE.MathUtils.clamp(currentVertical - 0.14, -0.28, 0.28),
          THREE.MathUtils.clamp(currentVertical, -0.28, 0.28),
          THREE.MathUtils.clamp(currentVertical + 0.14, -0.28, 0.28),
        ];
      let best: {
        tangentWeight: number;
        verticalAimRatio: number;
        fallbackToCenter: boolean;
        directionSign: -1 | 1;
        horizon: NonNullable<
          ReturnType<typeof evaluateAgentTheoryVisibilityHorizon>
        >;
      } | null = null;
      for (const directionSign of directionSigns) {
        for (const tangentWeight of [...new Set(tangentWeights)]) {
          for (const verticalAimRatio of [...new Set(verticalAimRatios)]) {
            const horizon = evaluateAgentTheoryVisibilityHorizon(
              checkpoint,
              tangentWeight,
              verticalAimRatio,
              false,
              directionSign,
              directionSign === currentDirection ? 1 : 0.55,
              options,
            );
            if (!horizon) continue;
            const candidate = {
              tangentWeight,
              verticalAimRatio,
              fallbackToCenter: false,
              directionSign,
              horizon,
            };
            if (
              !best
              || (
                candidate.horizon.safe !== best.horizon.safe
                  ? candidate.horizon.safe
                  : candidate.horizon.score < best.horizon.score
              )
            ) {
              best = candidate;
            }
          }
        }
      }
      if (broadSearch && (!best || !best.horizon.safe)) {
        for (const directionSign of directionSigns) {
          const centerHorizon = evaluateAgentTheoryVisibilityHorizon(
            checkpoint,
            currentTangent,
            0,
            true,
            directionSign,
            0.35,
            options,
          );
          if (
            centerHorizon
            && (
              !best
              || (
                centerHorizon.safe !== best.horizon.safe
                  ? centerHorizon.safe
                  : centerHorizon.score < best.horizon.score
              )
            )
          ) {
            best = {
              tangentWeight: currentTangent,
              verticalAimRatio: 0,
              fallbackToCenter: true,
              directionSign,
              horizon: centerHorizon,
            };
          }
        }
      }
      return best;
    }

    function selectAgentTheoryCruiseFraming(
      sample: ReturnType<typeof sampleAgentTheoryCruise>,
      initial = false,
    ) {
      if (!agentTheoryPerimeterProfile || !agentTheoryCruiseCheckpoint) {
        return null;
      }
      const best = findBestAgentTheoryVisibilityFraming(
        agentTheoryCruiseCheckpoint,
        true,
      );
      if (!best) return null;
      agentTheoryCruiseViewTangentWeight = best.tangentWeight;
      agentTheoryCruiseVerticalAimRatio = best.verticalAimRatio;
      agentTheoryCruiseDesiredTangentWeight = best.tangentWeight;
      agentTheoryCruiseDesiredVerticalAimRatio = best.verticalAimRatio;
      agentTheoryCruiseFallbackToCenter = best.fallbackToCenter;
      agentTheoryCruiseCenterBlend = best.fallbackToCenter ? 1 : 0;
      agentTheoryCruiseCenterBlendTarget = agentTheoryCruiseCenterBlend;
      agentTheoryCruiseGuidance = {
        mode: best.fallbackToCenter ? "fallback" : "normal",
        tangentWeight: best.tangentWeight,
        verticalAimRatio: best.verticalAimRatio,
        directionSign: best.directionSign,
        speedScale: best.fallbackToCenter ? 0.35 : 1,
        reason: best.fallbackToCenter
          ? "no-safe-candidate"
          : undefined,
      };
      agentTheoryCruiseGuidanceTarget = {
        ...agentTheoryCruiseGuidance,
      };
      if (
        initial
        && agentTheoryCruiseCheckpoint
        && Math.sign(agentTheoryCruiseCheckpoint.angularVelocity)
          !== best.directionSign
      ) {
        agentTheoryCruiseCheckpoint.angularVelocity =
          best.directionSign
          * Math.max(
            0.0045,
            Math.abs(agentTheoryCruiseCheckpoint.angularVelocity),
          );
        agentTheoryPreviousCruiseCheckpoint =
          cloneAgentTheoryCruiseCheckpoint(agentTheoryCruiseCheckpoint);
      }
      agentTheoryCruiseCheckpointSaveAllowed = best.horizon.safe;
      agentTheoryVisibilityCheckpointValid = best.horizon.safe;
      agentTheoryVisibilityGuard = {
        ...agentTheoryVisibilityGuard,
        currentPaperCount: best.horizon.current.counts.paperCount,
        currentHotspotCount: best.horizon.current.counts.hotspotCount,
        currentHotspotCellCount:
          best.horizon.current.counts.hotspotCellCount,
        predictedMinimumPaperCount: best.horizon.minimum.paperCount,
        predictedMinimumHotspotCount: best.horizon.minimum.hotspotCount,
        predictedMinimumHotspotCellCount:
          best.horizon.minimum.hotspotCellCount,
        steeringBlend: initial ? 1 : agentTheoryVisibilityGuard.steeringBlend,
        lastSafeStepIndex: best.horizon.safe
          ? agentTheoryCruiseCheckpoint.stepIndex
          : agentTheoryVisibilityGuard.lastSafeStepIndex,
        safe: best.horizon.safe,
      };
      if (best.horizon.safe) {
        agentTheoryLastSafeCruiseCheckpoint =
          cloneAgentTheoryCruiseCheckpoint(agentTheoryCruiseCheckpoint);
      }
      agentTheoryDepthDiagnostics.perimeterDegradationReason =
        best.fallbackToCenter ? "visibility-envelope-center-fallback" : "";
      return best;
    }

    function setAgentTheoryCruiseGuidanceTarget(
      next: AgentTheoryCruiseGuidanceV1,
      centerBlendTarget = 0,
    ) {
      const normalizedNext: AgentTheoryCruiseGuidanceV1 = {
        ...next,
        tangentWeight: THREE.MathUtils.clamp(
          next.tangentWeight,
          0.55,
          0.75,
        ),
        verticalAimRatio: THREE.MathUtils.clamp(
          next.verticalAimRatio,
          -0.28,
          0.28,
        ),
        speedScale: THREE.MathUtils.clamp(next.speedScale, 0.35, 1),
      };
      const enteringFallback = (
        normalizedNext.mode === "fallback"
        && agentTheoryCruiseGuidanceTarget.mode !== "fallback"
      );
      if (enteringFallback) {
        agentTheoryCruiseRecoveryCount += 1;
      }
      const materiallyChanged = (
        normalizedNext.mode !== agentTheoryCruiseGuidanceTarget.mode
        || normalizedNext.directionSign
          !== agentTheoryCruiseGuidanceTarget.directionSign
        || Math.abs(
          normalizedNext.tangentWeight
            - agentTheoryCruiseGuidanceTarget.tangentWeight,
        ) > 1e-4
        || Math.abs(
          normalizedNext.verticalAimRatio
            - agentTheoryCruiseGuidanceTarget.verticalAimRatio,
        ) > 1e-4
        || Math.abs(
          normalizedNext.speedScale
            - agentTheoryCruiseGuidanceTarget.speedScale,
        ) > 1e-4
        || Math.abs(
          centerBlendTarget - agentTheoryCruiseCenterBlendTarget,
        ) > 1e-4
      );
      agentTheoryCruiseGuidanceTarget = normalizedNext;
      if (materiallyChanged) {
        agentTheoryGuidanceTargetChangedAt = performance.now();
        agentTheoryGuidanceTargetSwitchCount += 1;
        if (
          Number.isFinite(agentTheoryPostReturnDiagnosticStartedAtMs)
          && performance.now() - agentTheoryPostReturnDiagnosticStartedAtMs
            < APP17_AGENT_THEORY_POST_RETURN_DIAGNOSTIC_MS
        ) {
          agentTheoryPostReturnExtraFramingCount += 1;
        }
      }
      agentTheoryCruiseDesiredTangentWeight =
        agentTheoryCruiseGuidanceTarget.tangentWeight;
      agentTheoryCruiseDesiredVerticalAimRatio =
        agentTheoryCruiseGuidanceTarget.verticalAimRatio;
      agentTheoryCruiseCenterBlendTarget = THREE.MathUtils.clamp(
        centerBlendTarget,
        0,
        1,
      );
      agentTheoryCruiseFallbackToCenter =
        agentTheoryCruiseCenterBlendTarget > 0.001;
    }

    function requestAgentTheoryFallbackGuidance(
      reason: AgentTheoryCruiseGuidanceV1["reason"] =
        "no-safe-candidate",
    ) {
      const now = performance.now();
      const postReturnDiagnosticActive = (
        Number.isFinite(agentTheoryPostReturnDiagnosticStartedAtMs)
        && now - agentTheoryPostReturnDiagnosticStartedAtMs
          < APP17_AGENT_THEORY_POST_RETURN_DIAGNOSTIC_MS
      );
      const currentCounts = {
        paperCount: agentTheoryVisibilityGuard.currentPaperCount,
        hotspotCount: agentTheoryVisibilityGuard.currentHotspotCount,
        hotspotCellCount:
          agentTheoryVisibilityGuard.currentHotspotCellCount,
      };
      if (
        postReturnDiagnosticActive
        && isAgentTheoryVisibilitySafe(
          currentCounts,
          createAgentTheoryVisibilityEnvelope(width, height),
        )
      ) {
        return;
      }
      const currentDirection = (
        Math.sign(agentTheoryCruiseCheckpoint?.angularVelocity ?? 1) || 1
      ) as -1 | 1;
      const fallbackDirection =
        agentTheoryCruiseGuidanceTarget.mode === "fallback"
          ? agentTheoryCruiseGuidanceTarget.directionSign
          : (currentDirection * -1) as -1 | 1;
      setAgentTheoryCruiseGuidanceTarget({
        mode: "fallback",
        tangentWeight:
          agentTheoryCruiseViewTangentWeight
          ?? agentTheoryCruiseCheckpoint?.tangentWeight
          ?? 0.7,
        verticalAimRatio: 0,
        directionSign: fallbackDirection,
        speedScale: 0.35,
        reason,
      }, 1);
      agentTheoryGuidanceSource = "main-thread-fallback";
      if (postReturnDiagnosticActive) {
        agentTheoryPostReturnFallbackTriggerCount += 1;
      }
      agentTheoryGuidanceSafeSinceMs = 0;
      agentTheoryDepthDiagnostics.perimeterDegradationReason =
        `continuous-guidance-${reason}`;
    }

    function advanceAgentTheoryVisibilitySteering(elapsedSeconds: number) {
      if (
        !agentTheoryPerimeterProfile
        || !agentTheoryCruiseCheckpoint
        || agentTheoryCruiseDesiredTangentWeight === null
      ) return;
      const currentTangent = agentTheoryCruiseViewTangentWeight
        ?? agentTheoryCruiseCheckpoint.tangentWeight;
      const currentVertical = agentTheoryCruiseVerticalAimRatio;
      const sample = sampleAgentTheoryCruise(
        agentTheoryPerimeterProfile,
        agentTheoryCruiseCheckpoint,
      );
      const position = new THREE.Vector3().fromArray(sample.position);
      const currentDirection = createAgentTheoryCruiseLookTarget(
        sample,
        currentTangent,
        currentVertical,
        agentTheoryCruiseCenterBlend,
      ).sub(position).normalize();
      const desiredDirection = createAgentTheoryCruiseLookTarget(
        sample,
        agentTheoryCruiseDesiredTangentWeight,
        agentTheoryCruiseDesiredVerticalAimRatio,
        agentTheoryCruiseCenterBlendTarget,
        agentTheoryCruiseGuidanceTarget.directionSign,
      ).sub(position).normalize();
      const angularDistance = currentDirection.angleTo(desiredDirection);
      if (angularDistance <= 1e-7) {
        agentTheoryCruiseViewTangentWeight =
          agentTheoryCruiseDesiredTangentWeight;
        agentTheoryCruiseVerticalAimRatio =
          agentTheoryCruiseDesiredVerticalAimRatio;
        agentTheoryVisibilityGuard.steeringBlend = 1;
      } else {
        const maximumStep = THREE.MathUtils.degToRad(
          APP17_AGENT_THEORY_VISIBILITY_STEERING_DEGREES_PER_SECOND
            * Math.max(0, elapsedSeconds),
        );
        const blend = THREE.MathUtils.clamp(
          maximumStep / angularDistance,
          0,
          1,
        );
        agentTheoryCruiseViewTangentWeight = THREE.MathUtils.lerp(
          currentTangent,
          agentTheoryCruiseDesiredTangentWeight,
          blend,
        );
        agentTheoryCruiseVerticalAimRatio = THREE.MathUtils.lerp(
          currentVertical,
          agentTheoryCruiseDesiredVerticalAimRatio,
          blend,
        );
        agentTheoryVisibilityGuard.steeringBlend = blend;
      }
      const responseBlend = 1 - Math.exp(
        -Math.max(0, elapsedSeconds) / 0.65,
      );
      agentTheoryCruiseCenterBlend = THREE.MathUtils.lerp(
        agentTheoryCruiseCenterBlend,
        agentTheoryCruiseCenterBlendTarget,
        responseBlend,
      );
      agentTheoryCruiseGuidance = {
        ...agentTheoryCruiseGuidance,
        mode: agentTheoryCruiseGuidanceTarget.mode,
        reason: agentTheoryCruiseGuidanceTarget.reason,
        tangentWeight:
          agentTheoryCruiseViewTangentWeight
          ?? agentTheoryCruiseGuidanceTarget.tangentWeight,
        verticalAimRatio: agentTheoryCruiseVerticalAimRatio,
        directionSign: (
          Math.sign(agentTheoryCruiseCheckpoint.angularVelocity)
          || agentTheoryCruiseGuidance.directionSign
        ) as -1 | 1,
        speedScale: THREE.MathUtils.lerp(
          agentTheoryCruiseGuidance.speedScale,
          agentTheoryCruiseGuidanceTarget.speedScale,
          responseBlend,
        ),
      };
    }

    function updateAgentTheoryPostReturnTrajectoryDiagnostics(
      now: number,
      cameraWriter:
        AgentTheoryPostReturnTrajectorySnapshot["cameraWriter"],
    ) {
      if (!Number.isFinite(agentTheoryPostReturnDiagnosticStartedAtMs)) {
        return;
      }
      const elapsedMs = Math.max(
        0,
        now - agentTheoryPostReturnDiagnosticStartedAtMs,
      );
      const active = (
        elapsedMs < APP17_AGENT_THEORY_POST_RETURN_DIAGNOSTIC_MS
      );
      if (
        !active
        && !agentTheoryDepthDiagnostics.postReturnTrajectory.active
      ) {
        return;
      }
      agentTheoryPostReturnMaximumTrajectoryResidualPx = Math.max(
        agentTheoryPostReturnMaximumTrajectoryResidualPx,
        agentTheoryCruiseProbeResidualPx,
      );
      agentTheoryDepthDiagnostics.postReturnTrajectory = {
        active,
        elapsedMs: Math.min(
          elapsedMs,
          APP17_AGENT_THEORY_POST_RETURN_DIAGNOSTIC_MS,
        ),
        cameraWriter,
        guidanceEpoch: agentTheoryGuidanceWorkerEpoch,
        guidanceSource: agentTheoryGuidanceSource,
        acceptedWorkerRevision:
          agentTheoryPostReturnAcceptedWorkerRevision,
        discardedWorkerResponseCount:
          agentTheoryPostReturnDiscardedWorkerResponses,
        fallbackTriggerCount:
          agentTheoryPostReturnFallbackTriggerCount,
        extraFramingCount: agentTheoryPostReturnExtraFramingCount,
        lodHash:
          agentTheoryScreenLodResult?.selectionHash
          ?? agentTheoryExploreEntryAnchor?.lodSelection?.selectionHash
          ?? "",
        depthHash: [
          agentTheoryDepthCurrentP5.toFixed(6),
          agentTheoryDepthCurrentP50.toFixed(6),
          agentTheoryDepthCurrentP95.toFixed(6),
        ].join(":"),
        maximumTrajectoryResidualPx:
          agentTheoryPostReturnMaximumTrajectoryResidualPx,
      };
    }

    function updateAgentTheoryVisibilityGuard(
      now: number,
      force = false,
      lightweightFallback = false,
    ) {
      if (
        visualProfile !== "agent-theory"
        || interactionModeRef.current !== "ambient"
        || exploration.state !== "overview"
        || !agentTheoryPerimeterProfile
        || !agentTheoryCruiseCheckpoint
      ) return false;
      if (
        !force
        && now - agentTheoryVisibilityGuardLastEvaluatedAt
          < APP17_AGENT_THEORY_VISIBILITY_EVALUATION_MS
      ) return agentTheoryVisibilityGuard.safe;
      agentTheoryVisibilityGuardLastEvaluatedAt = now;
      const tangentWeight = agentTheoryCruiseViewTangentWeight
        ?? agentTheoryCruiseCheckpoint.tangentWeight;
      const currentHorizon = evaluateAgentTheoryVisibilityHorizon(
        agentTheoryCruiseCheckpoint,
        tangentWeight,
        agentTheoryCruiseVerticalAimRatio,
        agentTheoryCruiseCenterBlend,
        agentTheoryCruiseGuidance.directionSign,
        agentTheoryCruiseGuidance.speedScale,
        lightweightFallback
          ? {
            horizonOffsetsSeconds: [0, 3, 6],
            paperSampleLimit: 512,
          }
          : undefined,
      );
      if (!currentHorizon) return false;
      let chosenHorizon = currentHorizon;
      let chosenCandidate: ReturnType<
        typeof findBestAgentTheoryVisibilityFraming
      > = null;
      const belowTarget = (
        currentHorizon.minimum.paperCount
          < currentHorizon.envelope.paperTarget
        || currentHorizon.minimum.hotspotCount
          < currentHorizon.envelope.hotspotTarget
        || currentHorizon.minimum.hotspotCellCount
          < currentHorizon.envelope.hotspotCellTarget
      );
      if (!currentHorizon.safe || belowTarget) {
        const candidate = findBestAgentTheoryVisibilityFraming(
          agentTheoryCruiseCheckpoint,
          lightweightFallback
            ? false
            : !currentHorizon.safe,
          lightweightFallback
            ? {
              horizonOffsetsSeconds: [0, 3, 6],
              paperSampleLimit: 512,
            }
            : undefined,
        );
        if (
          candidate
          && (
            candidate.horizon.safe && !currentHorizon.safe
            || candidate.horizon.score + 0.01 < currentHorizon.score
          )
        ) {
          agentTheoryCruiseDesiredTangentWeight = candidate.tangentWeight;
          agentTheoryCruiseDesiredVerticalAimRatio =
            candidate.verticalAimRatio;
          chosenHorizon = candidate.horizon;
          chosenCandidate = candidate;
        }
      }
      if (currentHorizon.safe) {
        if (agentTheoryGuidanceSafeSinceMs <= 0) {
          agentTheoryGuidanceSafeSinceMs = now;
        }
        const safeLongEnough = (
          now - agentTheoryGuidanceSafeSinceMs
            >= APP17_AGENT_THEORY_GUIDANCE_RECOVERY_SAFE_MS
        );
        if (chosenCandidate && belowTarget) {
          setAgentTheoryCruiseGuidanceTarget({
            mode: "steering",
            tangentWeight: chosenCandidate.tangentWeight,
            verticalAimRatio: chosenCandidate.verticalAimRatio,
            directionSign: chosenCandidate.directionSign,
            speedScale: 0.78,
            reason: "below-target",
          }, chosenCandidate.fallbackToCenter ? 1 : 0);
        } else if (safeLongEnough) {
          const currentDirection = (
            Math.sign(agentTheoryCruiseCheckpoint.angularVelocity) || 1
          ) as -1 | 1;
          setAgentTheoryCruiseGuidanceTarget({
            mode: "normal",
            tangentWeight:
              agentTheoryCruiseViewTangentWeight
              ?? tangentWeight,
            verticalAimRatio: agentTheoryCruiseVerticalAimRatio,
            directionSign: currentDirection,
            speedScale: 1,
          });
          agentTheoryDepthDiagnostics.perimeterDegradationReason = "";
        }
      } else {
        agentTheoryGuidanceSafeSinceMs = 0;
        if (chosenCandidate?.horizon.safe) {
          setAgentTheoryCruiseGuidanceTarget({
            mode: "steering",
            tangentWeight: chosenCandidate.tangentWeight,
            verticalAimRatio: chosenCandidate.verticalAimRatio,
            directionSign: chosenCandidate.directionSign,
            speedScale: 0.55,
            reason: "unsafe-horizon",
          }, chosenCandidate.fallbackToCenter ? 1 : 0);
        } else {
          requestAgentTheoryFallbackGuidance("no-safe-candidate");
        }
      }
      agentTheoryCruiseCheckpointSaveAllowed = currentHorizon.safe;
      agentTheoryVisibilityCheckpointValid = currentHorizon.safe;
      agentTheoryVisibilityGuard = {
        ...agentTheoryVisibilityGuard,
        currentPaperCount: currentHorizon.current.counts.paperCount,
        currentHotspotCount: currentHorizon.current.counts.hotspotCount,
        currentHotspotCellCount:
          currentHorizon.current.counts.hotspotCellCount,
        predictedMinimumPaperCount: chosenHorizon.minimum.paperCount,
        predictedMinimumHotspotCount: chosenHorizon.minimum.hotspotCount,
        predictedMinimumHotspotCellCount:
          chosenHorizon.minimum.hotspotCellCount,
        lastSafeStepIndex: currentHorizon.safe
          ? agentTheoryCruiseCheckpoint.stepIndex
          : agentTheoryVisibilityGuard.lastSafeStepIndex,
        safe: currentHorizon.safe || chosenHorizon.safe,
      };
      if (currentHorizon.safe) {
        agentTheoryLastSafeCruiseCheckpoint =
          cloneAgentTheoryCruiseCheckpoint(agentTheoryCruiseCheckpoint);
      }
      agentTheoryDepthDiagnostics.visibilityGuard = {
        ...agentTheoryVisibilityGuard,
      };
      agentTheoryDepthDiagnostics.visibilityCheckpointValid =
        agentTheoryVisibilityCheckpointValid;
      if (agentTheoryCruiseHealthAuditActive) {
        agentTheoryCruiseResumeGuardEvaluationCount += 1;
        if (currentHorizon.safe || chosenHorizon.safe) {
          agentTheoryCruiseResumeGuardSafeCount += 1;
        }
        agentTheoryDepthDiagnostics.returnCruiseGuardEvaluationCount =
          agentTheoryCruiseResumeGuardEvaluationCount;
        agentTheoryDepthDiagnostics.returnCruiseGuardSafeCount =
          agentTheoryCruiseResumeGuardSafeCount;
      }
      return currentHorizon.safe || chosenHorizon.safe;
    }

    function applyAgentTheoryGuidanceDepthPercentiles(
      result: AgentTheoryCruiseGuidanceResult,
    ) {
      const next = result.depthPercentiles;
      const current = [
        agentTheoryDepthTargetP5,
        agentTheoryDepthTargetP50,
        agentTheoryDepthTargetP95,
      ];
      const relativeDelta = Math.max(
        ...next.map((value, index) => (
          Math.abs(value - current[index])
            / Math.max(0.001, Math.abs(current[index]))
        )),
      );
      if (
        !Number.isFinite(relativeDelta)
        || relativeDelta >= 0.01
      ) {
        agentTheoryDepthTargetP5 = next[0];
        agentTheoryDepthTargetP50 = next[1];
        agentTheoryDepthTargetP95 = Math.max(next[0] + 0.001, next[2]);
      }
    }

    function applyAgentTheoryCruiseGuidanceWorkerResponse(
      response: AgentTheoryCruiseGuidanceWorkerResponse,
      requestedAtMs: number,
    ) {
      if (
        disposed
        || visualProfile !== "agent-theory"
        || interactionModeRef.current !== "ambient"
        || exploration.state !== "overview"
        || agentTheoryCameraMode !== "cruise"
        || !agentTheoryCruiseCheckpoint
      ) return;
      const now = performance.now();
      const result = response.result;
      const envelope = createAgentTheoryVisibilityEnvelope(width, height);
      const currentBelowHardFloor = !isAgentTheoryVisibilitySafe(
        result.currentCounts,
        envelope,
      );
      agentTheoryGuidanceWorkerLatencyMs = Math.max(
        response.computeMs,
        now - requestedAtMs,
      );
      agentTheoryGuidanceLastAcceptedAt = now;
      agentTheoryGuidanceLastAcceptedRevision = response.revision;
      agentTheoryGuidanceSource = "worker";
      if (
        Number.isFinite(agentTheoryPostReturnDiagnosticStartedAtMs)
        && now - agentTheoryPostReturnDiagnosticStartedAtMs
          < APP17_AGENT_THEORY_POST_RETURN_DIAGNOSTIC_MS
      ) {
        agentTheoryPostReturnAcceptedWorkerRevision = response.revision;
      }
      applyAgentTheoryGuidanceDepthPercentiles(result);
      if (result.recommendedSafe) {
        agentTheoryGuidanceConsecutiveUnsafeResults = 0;
      } else {
        agentTheoryGuidanceConsecutiveUnsafeResults += 1;
      }
      const targetHeldLongEnough = (
        now - agentTheoryGuidanceTargetChangedAt
          >= APP17_AGENT_THEORY_GUIDANCE_TARGET_HOLD_MS
      );
      const materiallyBetter = (
        result.scoreImprovementRatio
          >= APP17_AGENT_THEORY_GUIDANCE_MINIMUM_SCORE_IMPROVEMENT
      );
      if (
        currentBelowHardFloor
        || agentTheoryGuidanceConsecutiveUnsafeResults >= 2
      ) {
        agentTheoryGuidanceEmergencyOverrideCount += 1;
        if (result.recommendedSafe) {
          setAgentTheoryCruiseGuidanceTarget({
            mode: "steering",
            tangentWeight: result.tangentWeight,
            verticalAimRatio: result.verticalAimRatio,
            directionSign: result.directionSign,
            speedScale: THREE.MathUtils.clamp(
              result.speedScale,
              0.55,
              1,
            ),
            reason: "unsafe-horizon",
          }, result.fallbackToCenter ? 1 : 0);
        } else {
          setAgentTheoryCruiseGuidanceTarget({
            mode: "fallback",
            tangentWeight: result.tangentWeight,
            verticalAimRatio: result.verticalAimRatio,
            directionSign: result.directionSign,
            speedScale: THREE.MathUtils.clamp(
              result.speedScale,
              0.35,
              0.55,
            ),
            reason: "no-safe-candidate",
          }, result.fallbackToCenter ? 1 : 0);
        }
      } else if (
        result.belowTarget
        && result.recommendedSafe
        && materiallyBetter
        && targetHeldLongEnough
      ) {
        setAgentTheoryCruiseGuidanceTarget({
          mode: "steering",
          tangentWeight: result.tangentWeight,
          verticalAimRatio: result.verticalAimRatio,
          directionSign: result.directionSign,
          speedScale: THREE.MathUtils.clamp(result.speedScale, 0.55, 1),
          reason: "below-target",
        }, result.fallbackToCenter ? 1 : 0);
      } else if (
        !result.belowTarget
        && result.currentSafe
        && targetHeldLongEnough
        && agentTheoryCruiseGuidanceTarget.mode !== "normal"
      ) {
        setAgentTheoryCruiseGuidanceTarget({
          mode: "normal",
          tangentWeight:
            agentTheoryCruiseViewTangentWeight
              ?? result.tangentWeight,
          verticalAimRatio: agentTheoryCruiseVerticalAimRatio,
          directionSign: result.directionSign,
          speedScale: 1,
        });
      }
      agentTheoryCruiseCheckpointSaveAllowed = result.currentSafe;
      agentTheoryVisibilityCheckpointValid = result.currentSafe;
      agentTheoryVisibilityGuard = {
        ...agentTheoryVisibilityGuard,
        currentPaperCount: result.currentCounts.paperCount,
        currentHotspotCount: result.currentCounts.hotspotCount,
        currentHotspotCellCount: result.currentCounts.hotspotCellCount,
        predictedMinimumPaperCount: result.predictedMinimumPaperCount,
        predictedMinimumHotspotCount: result.predictedMinimumHotspotCount,
        predictedMinimumHotspotCellCount:
          result.predictedMinimumHotspotCellCount,
        lastSafeStepIndex: result.currentSafe
          ? agentTheoryCruiseCheckpoint.stepIndex
          : agentTheoryVisibilityGuard.lastSafeStepIndex,
        safe: result.currentSafe || result.recommendedSafe,
      };
      if (result.currentSafe) {
        agentTheoryLastSafeCruiseCheckpoint =
          cloneAgentTheoryCruiseCheckpoint(agentTheoryCruiseCheckpoint);
      }
      agentTheoryDepthDiagnostics.visibilityGuard = {
        ...agentTheoryVisibilityGuard,
      };
      agentTheoryDepthDiagnostics.visibilityCheckpointValid =
        agentTheoryVisibilityCheckpointValid;
      if (agentTheoryCruiseHealthAuditActive) {
        agentTheoryCruiseResumeGuardEvaluationCount += 1;
        if (result.currentSafe || result.recommendedSafe) {
          agentTheoryCruiseResumeGuardSafeCount += 1;
        }
        agentTheoryDepthDiagnostics.returnCruiseGuardEvaluationCount =
          agentTheoryCruiseResumeGuardEvaluationCount;
        agentTheoryDepthDiagnostics.returnCruiseGuardSafeCount =
          agentTheoryCruiseResumeGuardSafeCount;
      }
    }

    function cancelAgentTheoryGuidanceFallback() {
      if (agentTheoryGuidanceFallbackTimer) {
        window.clearTimeout(agentTheoryGuidanceFallbackTimer);
        agentTheoryGuidanceFallbackTimer = 0;
      }
      if (agentTheoryGuidanceFallbackIdleId) {
        const idleWindow = window as IdleCapableWindow;
        idleWindow.cancelIdleCallback?.(agentTheoryGuidanceFallbackIdleId);
        agentTheoryGuidanceFallbackIdleId = 0;
      }
    }

    function scheduleAgentTheoryGuidanceFallback(now: number) {
      if (
        agentTheoryGuidanceFallbackTimer
        || agentTheoryGuidanceFallbackIdleId
        || now < agentTheoryGuidanceResumeNotBeforeMs
        || now - agentTheoryGuidanceFallbackLastScheduledAt
          < APP17_AGENT_THEORY_GUIDANCE_FALLBACK_INTERVAL_MS
      ) return;
      agentTheoryGuidanceFallbackLastScheduledAt = now;
      const runFallback = () => {
        agentTheoryGuidanceFallbackTimer = 0;
        agentTheoryGuidanceFallbackIdleId = 0;
        if (
          disposed
          || interactionModeRef.current !== "ambient"
          || exploration.state !== "overview"
          || agentTheoryCameraMode !== "cruise"
          || performance.now() < agentTheoryGuidanceResumeNotBeforeMs
        ) return;
        agentTheoryGuidanceFallbackCount += 1;
        agentTheoryGuidanceSource = "main-thread-fallback";
        updateAgentTheoryVisibilityGuard(performance.now(), true, true);
        invalidate(true);
      };
      const idleWindow = window as IdleCapableWindow;
      if (idleWindow.requestIdleCallback) {
        agentTheoryGuidanceFallbackIdleId =
          idleWindow.requestIdleCallback(runFallback, { timeout: 250 });
      } else {
        agentTheoryGuidanceFallbackTimer =
          window.setTimeout(runFallback, 16);
      }
    }

    function requestAgentTheoryCruiseGuidance(now: number) {
      if (
        visualProfile !== "agent-theory"
        || interactionModeRef.current !== "ambient"
        || exploration.state !== "overview"
        || agentTheoryCameraMode !== "cruise"
        || !agentTheoryCruiseCheckpoint
        || now < agentTheoryGuidanceResumeNotBeforeMs
      ) return false;
      const client = agentTheoryScreenLodWorker;
      if (
        !client
        || !agentTheoryScreenLodWorkerReady
        || agentTheoryScreenLodWorkerFailed
      ) {
        scheduleAgentTheoryGuidanceFallback(now);
        return false;
      }
      if (
        now - agentTheoryGuidanceLastRequestedAt
          < APP17_AGENT_THEORY_GUIDANCE_WORKER_INTERVAL_MS
        || !client.canRequestGuidance(now)
      ) return false;
      cancelAgentTheoryGuidanceFallback();
      agentTheoryGuidanceLastRequestedAt = now;
      const requestedAtMs = now;
      const requestedEpoch = agentTheoryGuidanceWorkerEpoch;
      const currentTangent = agentTheoryCruiseViewTangentWeight
        ?? agentTheoryCruiseCheckpoint.tangentWeight;
      void client.requestGuidance({
        checkpoint: cloneAgentTheoryCruiseCheckpoint(
          agentTheoryCruiseCheckpoint,
        ),
        tangentWeight: currentTangent,
        verticalAimRatio: agentTheoryCruiseVerticalAimRatio,
        centerBlend: agentTheoryCruiseCenterBlend,
        directionSign: agentTheoryCruiseGuidanceTarget.directionSign,
        speedScale: agentTheoryCruiseGuidance.speedScale,
        width,
        height,
        quality: agentTheoryQuality,
        fovDegrees: camera.fov,
        near: camera.near,
        far: camera.far,
        broadSearch: !agentTheoryVisibilityGuard.safe,
      }, now).then((response) => {
        if (!response) return;
        if (
          requestedEpoch !== agentTheoryGuidanceWorkerEpoch
          || response.revision <= agentTheoryGuidanceLastAcceptedRevision
        ) {
          agentTheoryPostReturnDiscardedWorkerResponses += 1;
          return;
        }
        applyAgentTheoryCruiseGuidanceWorkerResponse(
          response,
          requestedAtMs,
        );
        invalidate(true);
      }).catch(() => {
        if (
          disposed
          || requestedEpoch !== agentTheoryGuidanceWorkerEpoch
        ) return;
        scheduleAgentTheoryGuidanceFallback(performance.now());
      });
      return true;
    }

    function applyAgentTheoryScreenLodDiagnostics(
      nextResult: AgentTheoryScreenLodResult,
    ) {
      root.updateMatrixWorld(true);
      camera.updateMatrixWorld(true);
      const selectedDepths: Array<{
        depth: number;
        size: number;
        alpha: number;
      }> = [];
      const sampleStride = Math.max(
        1,
        Math.ceil(nextResult.selectedIndices.length / 2_048),
      );
      for (
        let sampleIndex = 0;
        sampleIndex < nextResult.selectedIndices.length;
        sampleIndex += sampleStride
      ) {
        const paperIndex = nextResult.selectedIndices[sampleIndex];
        const paper = sceneData.papers[paperIndex];
        if (!paper) continue;
        agentTheoryScreenLodWorld
          .set(paper.x, paper.y, paper.z)
          .applyMatrix4(root.matrixWorld);
        agentTheoryScreenLodView
          .copy(agentTheoryScreenLodWorld)
          .applyMatrix4(camera.matrixWorldInverse);
        selectedDepths.push({
          depth: Math.max(camera.near, -agentTheoryScreenLodView.z),
          size: paper.size,
          alpha: paper.alpha,
        });
      }
      const depthDenominator = Math.max(
        0.001,
        agentTheoryDepthDiagnostics.viewDepthP95
          - agentTheoryDepthDiagnostics.viewDepthP5,
      );
      const actualSizes: number[] = [];
      const actualAlphas: number[] = [];
      selectedDepths.forEach((row) => {
        const normalizedDepth = THREE.MathUtils.clamp(
          (row.depth - agentTheoryDepthDiagnostics.viewDepthP5)
            / depthDenominator,
          0,
          1,
        );
        const style = resolveAgentTheoryPaperCoreStyle(normalizedDepth);
        actualSizes.push(THREE.MathUtils.clamp(
          Math.max(
            row.size
              * style.sizeMultiplier
              * THREE.MathUtils.clamp(
                0.42 / Math.max(0.08, row.depth),
                0.78,
                1.8,
              ),
            style.minimumCssSize,
          ),
          style.minimumCssSize,
          4.8,
        ));
        actualAlphas.push(Math.min(
          1,
          Math.max(
            row.alpha * style.alphaMultiplier,
            style.minimumAlpha,
          ),
        ));
      });
      agentTheoryDepthDiagnostics.residentPaperCount = sceneData.papers.length;
      agentTheoryDepthDiagnostics.perceptiblePaperCount =
        nextResult.viewportSelectedCount;
      agentTheoryDepthDiagnostics.forcedVisibleCount =
        nextResult.forcedVisibleCount;
      agentTheoryDepthDiagnostics.occupiedTileRatio =
        nextResult.occupiedTileRatio;
      agentTheoryDepthDiagnostics.overlapP95 = nextResult.overlapP95;
      agentTheoryDepthDiagnostics.screenLodSelectionHash =
        nextResult.selectionHash;
      agentTheoryDepthDiagnostics.screenLodViewportCount =
        nextResult.viewportSelectedCount;
      agentTheoryDepthDiagnostics.screenLodGuardBandCount = Math.max(
        0,
        nextResult.selectedIndices.length - nextResult.viewportSelectedCount,
      );
      agentTheoryDepthDiagnostics.actualCoreSizeRange = actualSizes.length > 0
        ? [Math.min(...actualSizes), Math.max(...actualSizes)]
        : [0, 0];
      agentTheoryDepthDiagnostics.actualAlphaRange = actualAlphas.length > 0
        ? [Math.min(...actualAlphas), Math.max(...actualAlphas)]
        : [0, 0];
    }

    function cloneAgentTheoryScreenLodResult(
      result: AgentTheoryScreenLodResult | null,
    ): AgentTheoryScreenLodResult | null {
      return result
        ? {
          ...result,
          selectedIndices: [...result.selectedIndices],
        }
        : null;
    }

    function publishAgentTheoryReturnProgress(
      phase: AgentTheoryReturnPhase,
      progress: number,
      force = false,
    ) {
      const boundedProgress = THREE.MathUtils.clamp(progress, 0, 1);
      if (
        !force
        && agentTheoryDepthDiagnostics.returnPhase === phase
        && Math.abs(
          boundedProgress - agentTheoryLastReturnProgressPublished,
        ) < 1e-4
      ) return;
      agentTheoryLastReturnProgressPublished = boundedProgress;
      agentTheoryDepthDiagnostics.returnPhase = phase;
      agentTheoryDepthDiagnostics.returnProgress = boundedProgress;
      onAgentTheoryReturnProgressRef.current?.({
        phase,
        progress: boundedProgress,
      });
    }

    function createAgentTheoryProjectionSignature(
      matrix: THREE.Matrix4,
      purpose: AgentTheoryLodPurpose,
      projectionWidth = width,
      projectionHeight = height,
    ): AgentTheoryProjectionSignature {
      const matrixIdentity = matrix.elements
        .map((value) => value.toFixed(6))
        .join(",");
      return [
        purpose,
        projectionWidth,
        projectionHeight,
        stableHash(matrixIdentity).toString(16).padStart(8, "0"),
      ].join(":");
    }

    function measureAgentTheoryActualReturnVisibility(
      indices: readonly number[],
      projectionCamera: THREE.PerspectiveCamera = camera,
    ) {
      root.updateMatrixWorld(true);
      projectionCamera.updateMatrixWorld(true);
      projectionCamera.updateProjectionMatrix();
      agentTheoryScreenLodLocalToClip
        .multiplyMatrices(
          projectionCamera.projectionMatrix,
          projectionCamera.matrixWorldInverse,
        )
        .multiply(root.matrixWorld);
      const matrix = agentTheoryScreenLodLocalToClip.elements;
      const actualWeights = paperLayer.getAgentLodWeights();
      let paperCount = 0;
      for (const index of indices) {
        if ((actualWeights[index] ?? 0) < 0.12) continue;
        const paper = sceneData.papers[index];
        if (!paper) continue;
        const clipW = matrix[3] * paper.x
          + matrix[7] * paper.y
          + matrix[11] * paper.z
          + matrix[15];
        if (!Number.isFinite(clipW) || clipW <= 1e-7) continue;
        const inverseW = 1 / clipW;
        const ndcX = (
          matrix[0] * paper.x
          + matrix[4] * paper.y
          + matrix[8] * paper.z
          + matrix[12]
        ) * inverseW;
        const ndcY = (
          matrix[1] * paper.x
          + matrix[5] * paper.y
          + matrix[9] * paper.z
          + matrix[13]
        ) * inverseW;
        const ndcZ = (
          matrix[2] * paper.x
          + matrix[6] * paper.y
          + matrix[10] * paper.z
          + matrix[14]
        ) * inverseW;
        if (
          ndcX >= -1
          && ndcX <= 1
          && ndcY >= -1
          && ndcY <= 1
          && ndcZ >= -1
          && ndcZ <= 1
        ) paperCount += 1;
      }
      const hotspotVisibility = measureAgentTheoryVisibility(
        projectionCamera.position,
        agentTheoryCurrentLookTarget,
      );
      return {
        paperCount,
        hotspotCount: hotspotVisibility.hotspotCount,
        hotspotCellCount: hotspotVisibility.hotspotCellCount,
      };
    }

    function applyAgentTheoryScreenLodResult(
      nextResult: AgentTheoryScreenLodResult,
      now: number,
      transitionOptions?: {
        incomingDurationMs?: number;
        retiringDurationMs?: number;
        retiringDelayMs?: number;
      },
    ) {
      const visibilityEnvelope = createAgentTheoryVisibilityEnvelope(
        width,
        height,
      );
      const protectsAmbientVisibility = (
        visualProfile === "agent-theory"
        && interactionModeRef.current === "ambient"
        && exploration.state === "overview"
      );
      if (
        protectsAmbientVisibility
        && nextResult.viewportSelectedCount
          < visibilityEnvelope.paperHardFloor
      ) {
        agentTheoryVisibilityLodTargetRejected = true;
        agentTheoryDepthDiagnostics.visibilityLodTargetRejected = true;
        if (!agentTheoryScreenLodResult) {
          // Preserve the diagnostic failure count for the initial ready gate,
          // but never cross-fade the resident geometry to an empty selection.
          agentTheoryDepthDiagnostics.perceptiblePaperCount =
            nextResult.viewportSelectedCount;
          agentTheoryDepthDiagnostics.screenLodSelectionHash =
            nextResult.selectionHash;
        }
        agentTheoryLodRefreshPending = false;
        return false;
      }
      agentTheoryVisibilityLodTargetRejected = false;
      agentTheoryDepthDiagnostics.visibilityLodTargetRejected = false;
      const initial = agentTheoryScreenLodResult === null;
      const selectionChanged = (
        initial
        || nextResult.selectionHash
          !== agentTheoryScreenLodResult?.selectionHash
      );
      if (selectionChanged) {
        paperLayer.setAgentLodSelection(
          nextResult.selectedIndices,
          now,
          initial,
          transitionOptions,
        );
      }
      agentTheoryScreenLodResult = nextResult;
      lastAgentTheoryScreenLodUpdateAt = now;
      agentTheoryScreenLodCameraPosition.copy(camera.position);
      agentTheoryScreenLodCameraQuaternion.copy(camera.quaternion);
      agentTheoryScreenLodCameraDistance = camera.position.distanceTo(
        agentTheoryCurrentLookTarget,
      );
      applyAgentTheoryScreenLodDiagnostics(nextResult);
      labelDirty = true;
      invalidate(selectionChanged || paperLayer.isAgentLodTransitioning());
      return selectionChanged;
    }

    function applyAgentTheoryScreenLodWorkerResponse(
      response: AgentTheoryScreenLodWorkerSelectionResponse,
      requestedAtMs: number,
    ) {
      if (disposed || !runtimeActive) return;
      const now = performance.now();
      const nextResult: AgentTheoryScreenLodResult = {
        selectedIndices: Array.from(response.visibleIndices),
        candidateCount: response.candidateCount,
        guardBandCandidateCount: response.guardBandCandidateCount,
        viewportCandidateCount: response.viewportCandidateCount,
        viewportSelectedCount: response.viewportSelectedCount,
        forcedVisibleCount: response.forcedVisibleCount,
        perceptiblePaperCount: response.perceptiblePaperCount,
        occupiedTileRatio: response.occupiedTileRatio,
        overlapP95: response.overlapP95,
        selectionHash: response.selectionHash,
        tileSizeCssPx: agentTheoryScreenLodResult?.tileSizeCssPx ?? 28,
        targetCount: response.targetCount,
        viewportTargetCount: response.viewportTargetCount,
        guardBandNdc: response.guardBandNdc,
      };
      if (response.purpose === "return-anchor") {
        const validAnchorResponse = (
          agentTheoryCameraMode === "return-preparing"
          && response.purpose === agentTheoryExpectedLodPurpose
          && response.projectionSignature
            === agentTheoryExpectedProjectionSignature
        );
        if (!validAnchorResponse) {
          agentTheoryDiscardedLodResponseCount += 1;
          agentTheoryDepthDiagnostics.returnDiscardedLodResponseCount =
            agentTheoryDiscardedLodResponseCount;
          return;
        }
        completeAgentTheoryReturnPreparation(nextResult, now);
      } else if (
        agentTheoryCameraMode === "return-preparing"
        || agentTheoryCameraMode === "returning-anchor"
        || agentTheoryCameraMode === "return-commit"
      ) {
        agentTheoryDiscardedLodResponseCount += 1;
        agentTheoryDepthDiagnostics.returnDiscardedLodResponseCount =
          agentTheoryDiscardedLodResponseCount;
        return;
      } else {
        applyAgentTheoryScreenLodResult(nextResult, now, {
          incomingDurationMs: 90,
          retiringDurationMs: 300,
          retiringDelayMs: 300,
        });
      }
      agentTheoryDepthDiagnostics.screenLodWorkerLatencyMs = Math.max(
        0,
        now - requestedAtMs,
      );
      agentTheoryDepthDiagnostics.screenLodIncomingCount =
        response.incomingIndices.length;
      agentTheoryDepthDiagnostics.screenLodRetiringCount =
        response.retiringIndices.length;
      const workerSnapshot = agentTheoryScreenLodWorker?.getSnapshot();
      if (workerSnapshot) {
        agentTheoryDepthDiagnostics.screenLodRequestedRevision =
          workerSnapshot.latestRequestedRevision;
        agentTheoryDepthDiagnostics.screenLodAcceptedRevision =
          workerSnapshot.latestAcceptedRevision;
        agentTheoryDepthDiagnostics.screenLodDiscardedResponses =
          workerSnapshot.discardedResponseCount;
        agentTheoryLodRefreshPending =
          workerSnapshot.pendingRequestCount > 0;
      } else {
        agentTheoryLodRefreshPending = false;
      }
    }

    function requestAgentTheoryScreenLodWorker(
      now = performance.now(),
      force = false,
      projectionCamera: THREE.PerspectiveCamera = camera,
      purpose: AgentTheoryLodPurpose = (
        interactionModeRef.current === "explore" ? "explore" : "cruise"
      ),
    ) {
      if (
        !agentTheoryScreenLodWorker
        || !agentTheoryScreenLodWorkerReady
        || agentTheoryScreenLodWorkerFailed
        || visualProfile !== "agent-theory"
        || sceneData.kind !== "app15"
        || exploration.state !== "overview"
      ) return false;
      if (
        purpose !== "return-anchor"
        && (
          agentTheoryCameraMode === "return-preparing"
          || agentTheoryCameraMode === "returning-anchor"
          || agentTheoryCameraMode === "return-commit"
        )
      ) return false;
      const activeCadence = (
        agentTheoryCameraMode === "return-preparing"
        || agentTheoryCameraMode === "returning-anchor"
        || agentTheoryCameraMode === "return-commit"
        || agentTheoryCameraMode === "explore-free"
          && (
            orbit.pointerPressed
            || orbit.dragging
            || agentTheoryFreeLookAim !== null
            || Math.abs(agentTheoryFreeLookDollyVelocity) > 1e-5
          )
      );
      const cadence = activeCadence ? "active" : "idle";
      if (
        !force
        && !agentTheoryScreenLodWorker.canRequest(cadence, now)
      ) return false;

      root.updateMatrixWorld(true);
      projectionCamera.updateMatrixWorld(true);
      projectionCamera.updateProjectionMatrix();
      agentTheoryScreenLodLocalToClip
        .multiplyMatrices(
          projectionCamera.projectionMatrix,
          projectionCamera.matrixWorldInverse,
        )
        .multiply(root.matrixWorld);
      const projectionSignature = createAgentTheoryProjectionSignature(
        agentTheoryScreenLodLocalToClip,
        purpose,
      );
      if (purpose === "return-anchor") {
        agentTheoryExpectedLodPurpose = purpose;
        agentTheoryExpectedProjectionSignature = projectionSignature;
        agentTheoryReturnProjectionSignature = projectionSignature;
        agentTheoryDepthDiagnostics.returnProjectionSignature =
          projectionSignature;
      }
      const currentWeights = paperLayer.getAgentLodTargetWeights();
      const previousVisibleMask = new Uint8Array(currentWeights.length);
      for (let index = 0; index < currentWeights.length; index += 1) {
        previousVisibleMask[index] = currentWeights[index] >= 0.5 ? 1 : 0;
      }
      const forcedVisibleMask = new Uint8Array(currentWeights.length);
      [
        selectedPaperIdRef.current,
        paperJourney.getTargetId(),
      ].filter(Boolean).forEach((paperId) => {
        const index = paperLayer.getPaperIndex(paperId);
        if (index >= 0) forcedVisibleMask[index] = 1;
      });
      const requestedAtMs = performance.now();
      const requestedEpoch = agentTheoryGuidanceWorkerEpoch;
      agentTheoryLodRefreshPending = true;
      void agentTheoryScreenLodWorker.requestSelection({
        purpose,
        projectionSignature,
        cadence,
        width,
        height,
        quality: agentTheoryQuality,
        localToClipMatrix: Float32Array.from(
          agentTheoryScreenLodLocalToClip.elements,
        ),
        previousVisibleMask,
        forcedVisibleMask,
      }, requestedAtMs).then((response) => {
        if (requestedEpoch !== agentTheoryGuidanceWorkerEpoch) {
          agentTheoryDiscardedLodResponseCount += 1;
          agentTheoryDepthDiagnostics.returnDiscardedLodResponseCount =
            agentTheoryDiscardedLodResponseCount;
          const snapshot = agentTheoryScreenLodWorker?.getSnapshot();
          agentTheoryLodRefreshPending =
            (snapshot?.pendingRequestCount ?? 0) > 0;
          return;
        }
        if (!response) {
          const snapshot = agentTheoryScreenLodWorker?.getSnapshot();
          agentTheoryLodRefreshPending =
            (snapshot?.pendingRequestCount ?? 0) > 0;
          return;
        }
        applyAgentTheoryScreenLodWorkerResponse(response, requestedAtMs);
      }).catch(() => {
        if (disposed) return;
        agentTheoryScreenLodWorkerFailed = true;
        agentTheoryScreenLodWorkerReady = false;
        agentTheoryDepthDiagnostics.screenLodBackend =
          "main-thread-fallback";
        agentTheoryLodRefreshPending = false;
        scheduleAgentTheoryScreenLodRefresh(0);
      });
      return true;
    }

    function cancelAgentTheoryMainThreadLodFallback() {
      agentTheoryMainThreadLodRevision += 1;
      agentTheoryMainThreadLodJob = null;
      if (agentTheoryMainThreadLodFrame) {
        cancelAnimationFrame(agentTheoryMainThreadLodFrame);
        agentTheoryMainThreadLodFrame = 0;
      }
      if (agentTheoryMainThreadLodCommitIdleId) {
        const idleWindow = window as IdleCapableWindow;
        idleWindow.cancelIdleCallback?.(
          agentTheoryMainThreadLodCommitIdleId,
        );
        agentTheoryMainThreadLodCommitIdleId = 0;
      }
      if (agentTheoryMainThreadLodCommitTimer) {
        window.clearTimeout(agentTheoryMainThreadLodCommitTimer);
        agentTheoryMainThreadLodCommitTimer = 0;
      }
    }

    function startAgentTheoryMainThreadLodFallback(
      now = performance.now(),
      force = false,
      projectionCamera: THREE.PerspectiveCamera = camera,
      purpose: AgentTheoryLodPurpose = (
        interactionModeRef.current === "explore" ? "explore" : "cruise"
      ),
    ) {
      if (
        visualProfile !== "agent-theory"
        || sceneData.kind !== "app15"
        || exploration.state !== "overview"
        || disposed
        || !runtimeActive
      ) return false;
      if (
        purpose !== "return-anchor"
        && (
          agentTheoryCameraMode === "return-preparing"
          || agentTheoryCameraMode === "returning-anchor"
          || agentTheoryCameraMode === "return-commit"
        )
      ) return false;
      if (
        !force
        && (
          agentTheoryMainThreadLodJob
          || agentTheoryMainThreadLodFrame
          || agentTheoryMainThreadLodCommitIdleId
          || agentTheoryMainThreadLodCommitTimer
        )
      ) return false;
      if (force) cancelAgentTheoryMainThreadLodFallback();

      root.updateMatrixWorld(true);
      projectionCamera.updateMatrixWorld(true);
      projectionCamera.updateProjectionMatrix();
      const localToClipMatrix = new THREE.Matrix4()
        .multiplyMatrices(
          projectionCamera.projectionMatrix,
          projectionCamera.matrixWorldInverse,
        )
        .multiply(root.matrixWorld);
      const projectionSignature = createAgentTheoryProjectionSignature(
        localToClipMatrix,
        purpose,
      );
      const currentWeights = paperLayer.getAgentLodTargetWeights();
      const previousVisibleMask = new Uint8Array(currentWeights.length);
      for (let index = 0; index < currentWeights.length; index += 1) {
        previousVisibleMask[index] = currentWeights[index] >= 0.5 ? 1 : 0;
      }
      const forcedVisibleMask = new Uint8Array(currentWeights.length);
      [
        selectedPaperIdRef.current,
        paperJourney.getTargetId(),
      ].filter(Boolean).forEach((paperId) => {
        const index = paperLayer.getPaperIndex(paperId);
        if (index >= 0) forcedVisibleMask[index] = 1;
      });
      const revision = agentTheoryMainThreadLodRevision + 1;
      agentTheoryMainThreadLodRevision = revision;
      agentTheoryMainThreadLodJob = {
        revision,
        cursor: 0,
        candidates: [],
        localToClipMatrix: Float32Array.from(localToClipMatrix.elements),
        purpose,
        projectionSignature,
        previousVisibleMask,
        forcedVisibleMask,
        width,
        height,
        quality: agentTheoryQuality,
      };
      agentTheoryLodRefreshPending = true;
      agentTheoryDepthDiagnostics.screenLodBackend =
        "main-thread-fallback";

      const advanceFallback = () => {
        agentTheoryMainThreadLodFrame = 0;
        const job = agentTheoryMainThreadLodJob;
        if (
          !job
          || job.revision !== agentTheoryMainThreadLodRevision
          || disposed
          || !runtimeActive
          || document.visibilityState === "hidden"
        ) return;
        const chunkStartedAt = performance.now();
        const matrix = job.localToClipMatrix;
        while (job.cursor < sceneData.papers.length) {
          const index = job.cursor;
          const paper = sceneData.papers[index];
          const x = paper.x;
          const y = paper.y;
          const z = paper.z;
          const clipW = matrix[3] * x
            + matrix[7] * y
            + matrix[11] * z
            + matrix[15];
          let ndcX = Number.NaN;
          let ndcY = Number.NaN;
          let ndcZ = Number.NaN;
          if (Number.isFinite(clipW) && clipW > 1e-7) {
            const inverseW = 1 / clipW;
            ndcX = (
              matrix[0] * x
              + matrix[4] * y
              + matrix[8] * z
              + matrix[12]
            ) * inverseW;
            ndcY = (
              matrix[1] * x
              + matrix[5] * y
              + matrix[9] * z
              + matrix[13]
            ) * inverseW;
            ndcZ = (
              matrix[2] * x
              + matrix[6] * y
              + matrix[10] * z
              + matrix[14]
            ) * inverseW;
          }
          job.candidates.push({
            index,
            paperId: paper.paperId,
            topicKey: paper.topicKey,
            ndcX,
            ndcY,
            ndcZ,
            size: paper.size,
            previouslyVisible: job.previousVisibleMask[index] !== 0,
            forced: job.forcedVisibleMask[index] !== 0,
          });
          job.cursor += 1;
          if (
            (job.cursor & 63) === 0
            && performance.now() - chunkStartedAt
              >= APP17_AGENT_THEORY_MAIN_THREAD_LOD_BUDGET_MS
          ) break;
        }
        if (job.cursor < sceneData.papers.length) {
          agentTheoryMainThreadLodFrame =
            requestAnimationFrame(advanceFallback);
          return;
        }

        agentTheoryMainThreadLodJob = null;
        const commitFallback = () => {
          agentTheoryMainThreadLodCommitIdleId = 0;
          agentTheoryMainThreadLodCommitTimer = 0;
          if (
            disposed
            || !runtimeActive
            || job.revision !== agentTheoryMainThreadLodRevision
          ) return;
          const nextResult = selectAgentTheoryScreenLod({
            candidates: job.candidates,
            width: job.width,
            height: job.height,
            quality: job.quality,
            guardBandNdc: AGENT_THEORY_SCREEN_LOD_GUARD_BAND_NDC,
          });
          if (job.purpose === "return-anchor") {
            const validAnchorResult = (
              agentTheoryCameraMode === "return-preparing"
              && job.purpose === agentTheoryExpectedLodPurpose
              && job.projectionSignature
                === agentTheoryExpectedProjectionSignature
            );
            if (validAnchorResult) {
              completeAgentTheoryReturnPreparation(
                nextResult,
                performance.now(),
              );
            } else {
              agentTheoryDiscardedLodResponseCount += 1;
              agentTheoryDepthDiagnostics.returnDiscardedLodResponseCount =
                agentTheoryDiscardedLodResponseCount;
            }
          } else if (
            agentTheoryCameraMode !== "return-preparing"
            && agentTheoryCameraMode !== "returning-anchor"
            && agentTheoryCameraMode !== "return-commit"
          ) {
            applyAgentTheoryScreenLodResult(
              nextResult,
              performance.now(),
              {
                incomingDurationMs: 90,
                retiringDurationMs: 300,
                retiringDelayMs: 300,
              },
            );
          }
          agentTheoryLodRefreshPending = false;
        };
        const idleWindow = window as IdleCapableWindow;
        if (idleWindow.requestIdleCallback) {
          agentTheoryMainThreadLodCommitIdleId =
            idleWindow.requestIdleCallback(commitFallback, { timeout: 50 });
        } else {
          agentTheoryMainThreadLodCommitTimer = window.setTimeout(
            commitFallback,
            0,
          );
        }
      };
      agentTheoryMainThreadLodFrame = requestAnimationFrame(advanceFallback);
      return true;
    }

    function agentTheoryScreenLodInteractionActive(
      now = performance.now(),
    ) {
      void now;
      return exploration.state !== "overview" || orbit.transition !== null;
    }

    function updateAgentTheoryScreenLod(
      now = performance.now(),
      force = false,
      fromDeferredRefresh = false,
    ) {
      if (
        visualProfile === "agent-theory"
        && sceneData.kind === "app15"
        && agentTheoryScreenLodWorkerReady
        && !agentTheoryScreenLodWorkerFailed
        && !force
      ) {
        requestAgentTheoryScreenLodWorker(now);
        return false;
      }
      if (
        visualProfile !== "agent-theory"
        || sceneData.kind !== "app15"
        || (
          !force
          && agentTheoryScreenLodInteractionActive(now)
        )
      ) return false;
      const forcedSignature = [
        selectedPaperIdRef.current,
        paperJourney.getTargetId(),
      ].filter(Boolean).sort().join("|");
      const forcedSelectionChanged = (
        forcedSignature !== lastAgentTheoryScreenLodForcedSignature
      );
      const currentDistance = camera.position.distanceTo(
        agentTheoryCurrentLookTarget,
      );
      if (!force && !forcedSelectionChanged && agentTheoryScreenLodResult) {
        const minimumInterval = agentTheoryCameraMode === "cruise"
          ? APP17_AGENT_THEORY_CRUISE_LOD_INTERVAL_MS
          : 250;
        if (now - lastAgentTheoryScreenLodUpdateAt < minimumInterval) {
          return false;
        }
        const angleDegrees = THREE.MathUtils.radToDeg(
          camera.quaternion.angleTo(agentTheoryScreenLodCameraQuaternion),
        );
        const distanceRatio = Math.abs(
          currentDistance - agentTheoryScreenLodCameraDistance,
        ) / Math.max(0.001, agentTheoryScreenLodCameraDistance);
        if (angleDegrees <= 0.25 && distanceRatio <= 0.015) return false;
      }
      if (!force && !fromDeferredRefresh) {
        startAgentTheoryMainThreadLodFallback(now);
        return false;
      }

      root.updateMatrixWorld(true);
      camera.updateMatrixWorld(true);
      const currentWeights = paperLayer.getAgentLodTargetWeights();
      const forcedPaperIds = new Set(
        forcedSignature ? forcedSignature.split("|") : [],
      );
      const candidates: AgentTheoryScreenLodCandidate[] = [];
      sceneData.papers.forEach((paper, index) => {
        agentTheoryScreenLodWorld
          .set(paper.x, paper.y, paper.z)
          .applyMatrix4(root.matrixWorld);
        agentTheoryScreenLodProjection
          .copy(agentTheoryScreenLodWorld)
          .project(camera);
        if (
          agentTheoryScreenLodProjection.z < -1
          || agentTheoryScreenLodProjection.z > 1
        ) return;
        candidates.push({
          index,
          paperId: paper.paperId,
          topicKey: paper.topicKey,
          ndcX: agentTheoryScreenLodProjection.x,
          ndcY: agentTheoryScreenLodProjection.y,
          ndcZ: agentTheoryScreenLodProjection.z,
          size: paper.size,
          previouslyVisible: currentWeights[index] >= 0.5,
          forced: forcedPaperIds.has(paper.paperId),
        });
      });
      const nextResult = selectAgentTheoryScreenLod({
        candidates,
        width,
        height,
        quality: agentTheoryQuality,
        guardBandNdc: AGENT_THEORY_SCREEN_LOD_GUARD_BAND_NDC,
      });
      const initial = agentTheoryScreenLodResult === null;
      let selectionChanged = (
        initial
        || nextResult.selectionHash !== agentTheoryScreenLodResult?.selectionHash
      );
      if (
        selectionChanged
        && !initial
        && !forcedSelectionChanged
        && agentTheoryCameraMode === "cruise"
        && agentTheoryScreenLodResult
      ) {
        const previousSelection = new Set(
          agentTheoryScreenLodResult.selectedIndices,
        );
        let changedCount = 0;
        nextResult.selectedIndices.forEach((index) => {
          if (!previousSelection.has(index)) changedCount += 1;
        });
        const nextSelection = new Set(nextResult.selectedIndices);
        agentTheoryScreenLodResult.selectedIndices.forEach((index) => {
          if (!nextSelection.has(index)) changedCount += 1;
        });
        const membershipDeltaRatio = changedCount / Math.max(
          1,
          Math.max(
            nextResult.selectedIndices.length,
            agentTheoryScreenLodResult.selectedIndices.length,
          ) * 2,
        );
        if (membershipDeltaRatio < APP17_AGENT_THEORY_LOD_CHANGE_THRESHOLD) {
          selectionChanged = false;
        }
      }
      if (selectionChanged) {
        paperLayer.setAgentLodSelection(
          nextResult.selectedIndices,
          now,
          initial,
        );
      }
      if (selectionChanged || initial) {
        agentTheoryScreenLodResult = nextResult;
      }
      lastAgentTheoryScreenLodForcedSignature = forcedSignature;
      lastAgentTheoryScreenLodUpdateAt = now;
      agentTheoryScreenLodCameraPosition.copy(camera.position);
      agentTheoryScreenLodCameraQuaternion.copy(camera.quaternion);
      agentTheoryScreenLodCameraDistance = currentDistance;
      applyAgentTheoryScreenLodDiagnostics(nextResult);
      return selectionChanged;
    }

    function cancelAgentTheoryScreenLodRefresh() {
      if (agentTheoryLodRefreshTimer) {
        window.clearTimeout(agentTheoryLodRefreshTimer);
        agentTheoryLodRefreshTimer = 0;
      }
      cancelAgentTheoryMainThreadLodFallback();
    }

    function scheduleAgentTheoryScreenLodRefresh(
      delayMs = APP17_AGENT_THEORY_LOD_SETTLE_MS,
    ) {
      if (
        visualProfile !== "agent-theory"
        || sceneData.kind !== "app15"
        || disposed
        || !runtimeActive
      ) return;
      cancelAgentTheoryScreenLodRefresh();
      agentTheoryLodRefreshPending = true;
      if (
        agentTheoryScreenLodWorker
        && agentTheoryScreenLodWorkerReady
        && !agentTheoryScreenLodWorkerFailed
      ) {
        agentTheoryLodRefreshTimer = window.setTimeout(() => {
          agentTheoryLodRefreshTimer = 0;
          const requested = requestAgentTheoryScreenLodWorker(
            performance.now(),
            true,
          );
          if (!requested) agentTheoryLodRefreshPending = false;
          invalidate(requested);
        }, Math.max(0, delayMs));
        return;
      }
      agentTheoryLodRefreshTimer = window.setTimeout(() => {
        agentTheoryLodRefreshTimer = 0;
        const started = startAgentTheoryMainThreadLodFallback(
          performance.now(),
          true,
        );
        if (!started) agentTheoryLodRefreshPending = false;
      }, Math.max(0, delayMs));
    }

    function initializeAgentTheoryScreenLodWorker() {
      if (
        visualProfile !== "agent-theory"
        || sceneData.kind !== "app15"
        || !agentTheoryPerimeterProfile
        || typeof Worker === "undefined"
      ) return;
      try {
        const client = createAgentTheoryScreenLodWorkerClient();
        agentTheoryScreenLodWorker = client;
        const positions = paperLayer.getPositions();
        const sizes = paperLayer.getSizes();
        const guidancePaperStride = Math.max(
          1,
          Math.ceil(sceneData.papers.length / 2_048),
        );
        const guidancePaperPositions = new Float32Array(
          Math.ceil(sceneData.papers.length / guidancePaperStride) * 3,
        );
        let guidancePaperOffset = 0;
        for (
          let index = 0;
          index < sceneData.papers.length;
          index += guidancePaperStride
        ) {
          const paper = sceneData.papers[index];
          guidancePaperPositions[guidancePaperOffset] = paper.x;
          guidancePaperPositions[guidancePaperOffset + 1] = paper.y;
          guidancePaperPositions[guidancePaperOffset + 2] = paper.z;
          guidancePaperOffset += 3;
        }
        const guidanceHotspotPositions = new Float32Array(
          sceneData.hotspots.length * 3,
        );
        sceneData.hotspots.forEach((hotspot, index) => {
          guidanceHotspotPositions[index * 3] = hotspot.position.x;
          guidanceHotspotPositions[index * 3 + 1] = hotspot.position.y;
          guidanceHotspotPositions[index * 3 + 2] = hotspot.position.z;
        });
        void client.initialize({
          catalogRevision: [
            payload.snapshotId ?? "unknown",
            sceneData.papers.length,
            "screen-lod-r5",
          ].join(":"),
          paperIds: [...paperLayer.getPaperIds()],
          topicKeys: [...paperLayer.getTopicKeys()],
          positions: positions.slice(),
          sizes: sizes.slice(),
          guidance: {
            profile: agentTheoryPerimeterProfile,
            paperPositions: guidancePaperPositions.subarray(
              0,
              guidancePaperOffset,
            ),
            totalPaperCount: sceneData.papers.length,
            hotspotPositions: guidanceHotspotPositions,
          },
        }).then(() => {
          if (disposed || agentTheoryScreenLodWorker !== client) return;
          cancelAgentTheoryMainThreadLodFallback();
          agentTheoryScreenLodWorkerReady = true;
          agentTheoryScreenLodWorkerFailed = false;
          agentTheoryDepthDiagnostics.screenLodBackend = "worker";
          requestAgentTheoryScreenLodWorker(performance.now(), true);
          requestAgentTheoryCruiseGuidance(performance.now());
          invalidate(true);
        }).catch(() => {
          if (disposed) return;
          agentTheoryScreenLodWorkerFailed = true;
          agentTheoryScreenLodWorkerReady = false;
          agentTheoryDepthDiagnostics.screenLodBackend =
            "main-thread-fallback";
          client.dispose();
          if (agentTheoryScreenLodWorker === client) {
            agentTheoryScreenLodWorker = null;
          }
          scheduleAgentTheoryScreenLodRefresh(0);
        });
      } catch {
        agentTheoryScreenLodWorkerFailed = true;
        agentTheoryScreenLodWorkerReady = false;
        agentTheoryDepthDiagnostics.screenLodBackend =
          "main-thread-fallback";
      }
    }

    function updateAgentTheoryDepthStaging(
      now = performance.now(),
      force = false,
    ) {
      if (
        visualProfile !== "agent-theory"
        || !agentTheoryDepthProfile
        || sceneData.kind !== "app15"
      ) return;
      if (!force && now - lastAgentTheoryDepthUpdateAt < 250) return;
      lastAgentTheoryDepthUpdateAt = now;
      root.updateMatrixWorld(true);
      camera.updateMatrixWorld(true);
      let visibleEntityCount = 0;
      let visiblePaperCount = 0;
      let visibleHotspotCount = 0;
      let nearestEntityDistance = Number.POSITIVE_INFINITY;
      const stellarLodCounts: Record<AgentTheoryStellarLod, number> = {
        point: 0,
        psf: 0,
        "near-psf": 0,
        sphere: 0,
      };
      const workerOwnsCruiseDepth = (
        agentTheoryCameraMode === "cruise"
        && agentTheoryScreenLodWorkerReady
        && !agentTheoryScreenLodWorkerFailed
      );
      let depthRows = workerOwnsCruiseDepth
        ? []
        : agentTheoryCachedDiagnosticDepthRows;
      if (!workerOwnsCruiseDepth) {
        const nextDepthRows: typeof agentTheoryCachedDiagnosticDepthRows = [];
        const diagnosticPaperStride = Math.max(
          1,
          Math.ceil(sceneData.papers.length / 2_048),
        );
        for (
          let index = 0;
          index < sceneData.papers.length;
          index += diagnosticPaperStride
        ) {
          const paper = sceneData.papers[index];
          agentTheoryDepthWorld
            .set(paper.x, paper.y, paper.z)
            .applyMatrix4(root.matrixWorld);
          nearestEntityDistance = Math.min(
            nearestEntityDistance,
            agentTheoryDepthWorld.distanceTo(camera.position),
          );
          agentTheoryDepthView
            .copy(agentTheoryDepthWorld)
            .applyMatrix4(camera.matrixWorldInverse);
          const cssDiameter = resolveAgentTheoryAngularDiameterCssPx({
            worldDiameter: Math.max(0.015, paper.size * 0.022),
            viewDepth: Math.max(0.01, -agentTheoryDepthView.z),
            viewportHeight: height,
            fovDegrees: camera.fov,
          });
          stellarLodCounts[
            resolveAgentTheoryStellarLod(cssDiameter, false)
          ] += 1;
          nextDepthRows.push({
            index,
            depth: Math.max(camera.near, -agentTheoryDepthView.z),
            size: paper.size,
          });
        }
        agentTheoryCachedDiagnosticDepthRows = nextDepthRows;
        depthRows = nextDepthRows;
      }
      visiblePaperCount =
        agentTheoryScreenLodResult?.viewportSelectedCount ?? 0;
      visibleEntityCount =
        agentTheoryScreenLodResult?.candidateCount ?? visiblePaperCount;
      const visibleHotspotCells = new Set<string>();
      const visibleHotspotCoreSizes: number[] = [];
      sceneData.hotspots.forEach((hotspot) => {
        agentTheoryDepthWorld
          .copy(hotspot.position)
          .applyMatrix4(root.matrixWorld);
        nearestEntityDistance = Math.min(
          nearestEntityDistance,
          agentTheoryDepthWorld.distanceTo(camera.position),
        );
        agentTheoryCurrentProjection
          .copy(agentTheoryDepthWorld)
          .project(camera);
        const hotspotCoreCssSize =
          resolveAgentTheoryHotspotCoreCssSize(hotspot.importance);
        const hotspotCoreOpacity = 0.82;
        if (
          agentTheoryCurrentProjection.z >= -1
          && agentTheoryCurrentProjection.z <= 1
          && Math.abs(agentTheoryCurrentProjection.x) <= 1
          && Math.abs(agentTheoryCurrentProjection.y) <= 1
          && hotspotCoreCssSize
            >= APP17_AGENT_THEORY_HOTSPOT_CORE_MIN_CSS_PX
          && hotspotCoreOpacity >= 0.82
        ) {
          visibleEntityCount += 1;
          visibleHotspotCount += 1;
          const cellX = THREE.MathUtils.clamp(
            Math.floor((agentTheoryCurrentProjection.x * 0.5 + 0.5) * 6),
            0,
            5,
          );
          const cellY = THREE.MathUtils.clamp(
            Math.floor((-agentTheoryCurrentProjection.y * 0.5 + 0.5) * 4),
            0,
            3,
          );
          visibleHotspotCells.add(`${cellX}:${cellY}`);
          visibleHotspotCoreSizes.push(hotspotCoreCssSize);
        }
        const previousLod = agentTheoryHotspotSphereLayer
          ?.getLodById()
          .get(hotspot.id);
        const diameter = agentTheoryHotspotSphereLayer
          ?.getProjectedDiameterById()
          .get(hotspot.id) ?? 0;
        stellarLodCounts[
          resolveAgentTheoryStellarLod(diameter, false, previousLod)
        ] += 1;
      });
      if (!workerOwnsCruiseDepth) {
        const sortedDepths = depthRows
          .map((row) => row.depth)
          .sort((left, right) => left - right);
        agentTheoryDepthTargetP5 = percentileNumber(sortedDepths, 0.05);
        agentTheoryDepthTargetP50 = percentileNumber(sortedDepths, 0.50);
        agentTheoryDepthTargetP95 = Math.max(
          agentTheoryDepthTargetP5 + 0.001,
          percentileNumber(sortedDepths, 0.95),
        );
      }
      if (
        force
        || !Number.isFinite(agentTheoryDepthCurrentP5)
        || agentTheoryDepthCurrentP95 <= agentTheoryDepthCurrentP5
      ) {
        agentTheoryDepthCurrentP5 = agentTheoryDepthTargetP5;
        agentTheoryDepthCurrentP50 = agentTheoryDepthTargetP50;
        agentTheoryDepthCurrentP95 = agentTheoryDepthTargetP95;
      }
      const viewDepthP5 = agentTheoryDepthCurrentP5;
      const viewDepthP50 = agentTheoryDepthCurrentP50;
      const viewDepthP95 = agentTheoryDepthCurrentP95;
      const diagnosticLodWeights = paperLayer.getAgentLodTargetWeights();
      const diagnosticCoreSizes: number[] = [];
      const diagnosticCoreAlphas: number[] = [];
      const diagnosticDepthDenominator = Math.max(
        0.001,
        viewDepthP95 - viewDepthP5,
      );
      depthRows.forEach((row) => {
        if (diagnosticLodWeights[row.index] < 0.5) return;
        const paper = sceneData.papers[row.index];
        const normalizedDepth = THREE.MathUtils.clamp(
          (row.depth - viewDepthP5) / diagnosticDepthDenominator,
          0,
          1,
        );
        const style = resolveAgentTheoryPaperCoreStyle(normalizedDepth);
        diagnosticCoreSizes.push(THREE.MathUtils.clamp(
          Math.max(
            paper.size
              * style.sizeMultiplier
              * THREE.MathUtils.clamp(
                0.42 / Math.max(0.08, row.depth),
                0.78,
                1.8,
              ),
            style.minimumCssSize,
          ),
          style.minimumCssSize,
          4.8,
        ));
        diagnosticCoreAlphas.push(Math.min(
          1,
          Math.max(
            paper.alpha * style.alphaMultiplier,
            style.minimumAlpha,
          ),
        ));
      });
      agentTheoryDepthDiagnostics.actualCoreSizeRange =
        diagnosticCoreSizes.length > 0
          ? [Math.min(...diagnosticCoreSizes), Math.max(...diagnosticCoreSizes)]
          : agentTheoryDepthDiagnostics.actualCoreSizeRange;
      agentTheoryDepthDiagnostics.actualAlphaRange =
        diagnosticCoreAlphas.length > 0
          ? [Math.min(...diagnosticCoreAlphas), Math.max(...diagnosticCoreAlphas)]
          : agentTheoryDepthDiagnostics.actualAlphaRange;
      const firstCut = THREE.MathUtils.lerp(viewDepthP5, viewDepthP95, 0.38);
      const secondCut = THREE.MathUtils.lerp(viewDepthP5, viewDepthP95, 0.68);
      const ranges = {
        near: (
          depthRows.length > 0
            ? [Number.POSITIVE_INFINITY, 0]
            : [...agentTheoryDepthDiagnostics.nearPaperSizeRange]
        ) as [number, number],
        middle: (
          depthRows.length > 0
            ? [Number.POSITIVE_INFINITY, 0]
            : [...agentTheoryDepthDiagnostics.middlePaperSizeRange]
        ) as [number, number],
        far: (
          depthRows.length > 0
            ? [Number.POSITIVE_INFINITY, 0]
            : [...agentTheoryDepthDiagnostics.farPaperSizeRange]
        ) as [number, number],
      };
      let nearPaperCount = depthRows.length > 0
        ? 0
        : agentTheoryDepthDiagnostics.nearPaperCount;
      let middlePaperCount = depthRows.length > 0
        ? 0
        : agentTheoryDepthDiagnostics.middlePaperCount;
      let farPaperCount = depthRows.length > 0
        ? 0
        : agentTheoryDepthDiagnostics.farPaperCount;
      const depthDenominator = Math.max(0.001, viewDepthP95 - viewDepthP5);
      for (const row of depthRows) {
        const depth = THREE.MathUtils.clamp(
          (row.depth - viewDepthP5) / depthDenominator,
          0,
          1,
        );
        const depthStyle = resolveAgentTheoryDepthStyle(depth);
        const stagedSize = THREE.MathUtils.clamp(
          depthStyle.sizeMultiplier * row.size,
          0.62,
          4.8,
        );
        const key = row.depth <= firstCut
          ? "near"
          : row.depth >= secondCut
            ? "far"
            : "middle";
        if (key === "near") nearPaperCount += 1;
        else if (key === "far") farPaperCount += 1;
        else middlePaperCount += 1;
        ranges[key][0] = Math.min(ranges[key][0], stagedSize);
        ranges[key][1] = Math.max(ranges[key][1], stagedSize);
      }
      for (const range of Object.values(ranges)) {
        if (!Number.isFinite(range[0])) range[0] = 0;
      }

      agentTheoryBaseCamera.aspect = camera.aspect;
      agentTheoryBaseCamera.zoom = camera.zoom;
      agentTheoryBaseCamera.updateProjectionMatrix();
      applyCameraOrbit(agentTheoryBaseCamera, orbit);
      const nearDisplacements: number[] = [];
      const farDisplacements: number[] = [];
      const sampleStride = Math.max(1, Math.floor(depthRows.length / 512));
      for (let index = 0; index < depthRows.length; index += sampleStride) {
        const row = depthRows[index];
        if (row.depth > firstCut && row.depth < secondCut) continue;
        const paper = sceneData.papers[row.index];
        agentTheoryDepthWorld
          .set(paper.x, paper.y, paper.z)
          .applyMatrix4(root.matrixWorld);
        agentTheoryCurrentProjection
          .copy(agentTheoryDepthWorld)
          .project(camera);
        agentTheoryBaseProjection
          .copy(agentTheoryDepthWorld)
          .project(agentTheoryBaseCamera);
        const displacement = Math.hypot(
          (agentTheoryCurrentProjection.x - agentTheoryBaseProjection.x)
            * width * 0.5,
          (agentTheoryCurrentProjection.y - agentTheoryBaseProjection.y)
            * height * 0.5,
        );
        if (row.depth <= firstCut) nearDisplacements.push(displacement);
        else farDisplacements.push(displacement);
      }
      nearDisplacements.sort((left, right) => left - right);
      farDisplacements.sort((left, right) => left - right);
      const projectedParallaxDeltaPx = Math.abs(
        depthRows.length > 0
          ? percentileNumber(nearDisplacements, 0.5)
            - percentileNumber(farDisplacements, 0.5)
          : agentTheoryDepthDiagnostics.projectedParallaxDeltaPx,
      );
      agentTheoryDepthDiagnostics = {
        ...agentTheoryDepthDiagnostics,
        viewDepthP5,
        viewDepthP50,
        viewDepthP95,
        nearPaperCount,
        middlePaperCount,
        farPaperCount,
        nearPaperSizeRange: ranges.near,
        middlePaperSizeRange: ranges.middle,
        farPaperSizeRange: ranges.far,
        projectedParallaxDeltaPx,
        perimeterNearestEntityDistance: Number.isFinite(nearestEntityDistance)
          ? nearestEntityDistance
          : 0,
        visibleGalaxyRatio: visibleEntityCount / Math.max(
          1,
          sceneData.papers.length + sceneData.hotspots.length,
        ),
        cruiseCheckpointProjectionErrorPx:
          agentTheoryCruiseCheckpointProjectionErrorPx,
        stellarLodCounts,
        activeSphereHotspotCount:
          agentTheoryHotspotSphereLayer?.getActiveSphereCount() ?? 0,
        currentSphereHotspotCount:
          agentTheoryHotspotSphereLayer?.getCurrentSphereCount() ?? 0,
        retiringSphereHotspotCount:
          agentTheoryHotspotSphereLayer?.getRetiringSphereCount() ?? 0,
        stellarLodTransitionCount: agentTheoryStellarLodTransitionCount,
        visibleHotspotCount,
        hotspotOccupiedCellCount: visibleHotspotCells.size,
        hotspotCoreSizeRange: visibleHotspotCoreSizes.length > 0
          ? [
            Math.min(...visibleHotspotCoreSizes),
            Math.max(...visibleHotspotCoreSizes),
          ]
          : [0, 0],
        hotspotSphereOffscreenSlotCount:
          agentTheoryHotspotSphereLayer?.getOffscreenSphereSlotCount() ?? 0,
        visibilityGuard: { ...agentTheoryVisibilityGuard },
        visibilityLodTargetRejected:
          agentTheoryVisibilityLodTargetRejected,
        visibilityCheckpointValid:
          agentTheoryVisibilityCheckpointValid,
        returnVisibilityGatePassed:
          agentTheoryReturnVisibilityGatePassed,
      };
      if (!readyReported) {
        agentTheoryDepthDiagnostics.firstFrameVisiblePaperCount =
          visiblePaperCount;
        agentTheoryDepthDiagnostics.firstFrameVisibleHotspotCount =
          visibleHotspotCount;
        agentTheoryDepthDiagnostics.firstFrameDecorativeVisibleCount =
          agentTheoryDecorativeLayer?.countVisible(camera) ?? 0;
      }
      agentTheoryCruiseCheckpointSaveAllowed =
        agentTheoryVisibilityCheckpointValid;
      onAgentTheoryDepthDiagnosticsRef.current?.({
        ...agentTheoryDepthDiagnostics,
        rawAxisStd: [...agentTheoryDepthDiagnostics.rawAxisStd],
        nearPaperSizeRange: [...agentTheoryDepthDiagnostics.nearPaperSizeRange],
        middlePaperSizeRange: [...agentTheoryDepthDiagnostics.middlePaperSizeRange],
        farPaperSizeRange: [...agentTheoryDepthDiagnostics.farPaperSizeRange],
        ambientCamera: { ...agentTheoryDepthDiagnostics.ambientCamera },
        stellarLodCounts: {
          ...agentTheoryDepthDiagnostics.stellarLodCounts,
        },
        actualCoreSizeRange: [
          ...agentTheoryDepthDiagnostics.actualCoreSizeRange,
        ],
        actualAlphaRange: [
          ...agentTheoryDepthDiagnostics.actualAlphaRange,
        ],
        freeLookPosition: [
          ...agentTheoryDepthDiagnostics.freeLookPosition,
        ],
        freeLookDirection: [
          ...agentTheoryDepthDiagnostics.freeLookDirection,
        ],
        hotspotCoreSizeRange: [
          ...agentTheoryDepthDiagnostics.hotspotCoreSizeRange,
        ],
        visibilityGuard: {
          ...agentTheoryDepthDiagnostics.visibilityGuard,
        },
        cruiseLiveness: {
          ...agentTheoryDepthDiagnostics.cruiseLiveness,
        },
        postReturnTrajectory: {
          ...agentTheoryDepthDiagnostics.postReturnTrajectory,
        },
        shaderFailureMaterials: [
          ...agentTheoryDepthDiagnostics.shaderFailureMaterials,
        ],
      });
    }

    function applyAgentTheoryDepthSmoothing(elapsedSeconds: number) {
      if (
        visualProfile !== "agent-theory"
        || !agentTheoryDepthProfile
      ) return false;
      if (
        agentTheoryCameraMode === "return-preparing"
        || agentTheoryCameraMode === "returning-anchor"
        || agentTheoryCameraMode === "return-commit"
      ) return false;
      const responseSeconds = APP17_AGENT_THEORY_DEPTH_RESPONSE_SECONDS;
      const response = 1 - Math.exp(
        -Math.max(0, elapsedSeconds)
          / responseSeconds,
      );
      const previousP5 = agentTheoryDepthCurrentP5;
      const previousP50 = agentTheoryDepthCurrentP50;
      const previousP95 = agentTheoryDepthCurrentP95;
      agentTheoryDepthCurrentP5 = THREE.MathUtils.lerp(
        agentTheoryDepthCurrentP5,
        agentTheoryDepthTargetP5,
        response,
      );
      agentTheoryDepthCurrentP50 = THREE.MathUtils.lerp(
        agentTheoryDepthCurrentP50,
        agentTheoryDepthTargetP50,
        response,
      );
      agentTheoryDepthCurrentP95 = Math.max(
        agentTheoryDepthCurrentP5 + 0.001,
        THREE.MathUtils.lerp(
          agentTheoryDepthCurrentP95,
          agentTheoryDepthTargetP95,
          response,
        ),
      );
      const frameDelta = Math.max(
        Math.abs(agentTheoryDepthCurrentP5 - previousP5),
        Math.abs(agentTheoryDepthCurrentP50 - previousP50),
        Math.abs(agentTheoryDepthCurrentP95 - previousP95),
      );
      agentTheoryDepthMaximumFrameDelta = Math.max(
        agentTheoryDepthMaximumFrameDelta,
        frameDelta,
      );
      paperLayer.setAgentDepthRange(
        agentTheoryDepthCurrentP5,
        agentTheoryDepthCurrentP95,
      );
      setAgentDepthRangeOnObject(
        hotspotLayer.object,
        agentTheoryDepthCurrentP5,
        agentTheoryDepthCurrentP95,
      );
      agentTheoryDepthDiagnostics.viewDepthP5 = agentTheoryDepthCurrentP5;
      agentTheoryDepthDiagnostics.viewDepthP50 = agentTheoryDepthCurrentP50;
      agentTheoryDepthDiagnostics.viewDepthP95 = agentTheoryDepthCurrentP95;
      agentTheoryDepthDiagnostics.depthTargetP5 = agentTheoryDepthTargetP5;
      agentTheoryDepthDiagnostics.depthTargetP95 = agentTheoryDepthTargetP95;
      agentTheoryDepthDiagnostics.depthMaximumFrameDelta =
        agentTheoryDepthMaximumFrameDelta;
      return frameDelta > 1e-7;
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
      let systemPaperStarInFrustum = false;
      if (systemResources?.star.object.visible) {
        systemResources.star.object.updateMatrixWorld(true);
        systemResources.star.object.getWorldPosition(paperTraceStarWorldPosition);
        paperTraceStarProjectedPosition.copy(paperTraceStarWorldPosition).project(camera);
        systemPaperStarInFrustum = Math.abs(paperTraceStarProjectedPosition.x) <= 1
          && Math.abs(paperTraceStarProjectedPosition.y) <= 1
          && paperTraceStarProjectedPosition.z >= -1
          && paperTraceStarProjectedPosition.z <= 1;
      }
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
      const theoryVisibility = resolveTheorySystemVisibility(exploration.blend);
      const farBackgroundVisualState = systemResources?.farBackgroundLayer?.getDiagnostics(
        camera,
        systemResources.root,
      );
      const theoryViewSelection = cameraPreset.theoryFraming?.viewSelection;
      callback({
        scenario: performanceScenario,
        fullscreen: fullscreenRef.current,
        sampleDurationMs: Math.min(APP17_PERFORMANCE_WINDOW_MS, Math.max(0, now - performanceStartedAt)),
        currentFps: currentFrameMs > 0 ? 1_000 / currentFrameMs : 0,
        averageFps: averageFrameMs > 0 ? 1_000 / averageFrameMs : 0,
        averageFrameMs,
        p50FrameMs: percentileValue(frameSamples, 0.50),
        p95FrameMs: percentileValue(frameSamples, 0.95),
        maxFrameMs: frameSamples.length > 0 ? Math.max(...frameSamples.map((sample) => sample.value)) : 0,
        averageWebglMs: averageValue(webglSamples),
        averageLabelMs: averageValue(labelSamples),
        longFrames25: frameSamples.filter((sample) => sample.value > 25).length,
        longFrames50: frameSamples.filter((sample) => sample.value > 50).length,
        longFrames100: frameSamples.filter((sample) => sample.value > 100).length,
        drawCalls: renderer.info.render.calls,
        renderedPoints: Math.max(
          0,
          renderer.info.render.points
            - (environmentStarLayer.object.visible ? APP17_ENVIRONMENT_STAR_COUNT : 0)
            - (agentTheoryDecorativeLayer
              ? agentTheoryDecorativeLayer.starCount + agentTheoryDecorativeLayer.dustCount
              : 0),
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
        theoryDisplaySpace: agentTheoryDepthDiagnostics.displaySpace,
        theoryRawAxisStd: [...agentTheoryDepthDiagnostics.rawAxisStd],
        theoryRawDepthRatio: agentTheoryDepthDiagnostics.rawDepthRatio,
        theoryDepthScale: agentTheoryDepthDiagnostics.depthScale,
        theoryViewDepthP5: agentTheoryDepthDiagnostics.viewDepthP5,
        theoryViewDepthP50: agentTheoryDepthDiagnostics.viewDepthP50,
        theoryViewDepthP95: agentTheoryDepthDiagnostics.viewDepthP95,
        theoryNearPaperCount: agentTheoryDepthDiagnostics.nearPaperCount,
        theoryMiddlePaperCount: agentTheoryDepthDiagnostics.middlePaperCount,
        theoryFarPaperCount: agentTheoryDepthDiagnostics.farPaperCount,
        theoryAmbientAzimuthOffsetDegrees:
          agentTheoryDepthDiagnostics.ambientCamera.azimuthOffsetDegrees,
        theoryAmbientElevationOffsetDegrees:
          agentTheoryDepthDiagnostics.ambientCamera.elevationOffsetDegrees,
        theoryAmbientDistanceOffsetRatio:
          agentTheoryDepthDiagnostics.ambientCamera.distanceOffsetRatio,
        theoryProjectedParallaxDeltaPx:
          agentTheoryDepthDiagnostics.projectedParallaxDeltaPx,
        theoryDecorativeStarCount: agentTheoryDepthDiagnostics.decorativeStarCount,
        theoryDecorativeDustCount: agentTheoryDepthDiagnostics.decorativeDustCount,
        theoryDecorativeDegradationReason:
          agentTheoryDepthDiagnostics.decorativeDegradationReason,
        theoryCameraMode: agentTheoryDepthDiagnostics.cameraMode,
        theoryPerimeterSector: agentTheoryDepthDiagnostics.perimeterSector,
        theoryPerimeterSafetyMargin:
          agentTheoryDepthDiagnostics.perimeterSafetyMargin,
        theoryNearestEntityDistance:
          agentTheoryDepthDiagnostics.perimeterNearestEntityDistance,
        theoryVisibleGalaxyRatio:
          agentTheoryDepthDiagnostics.visibleGalaxyRatio,
        theoryVisitedSectorRatio:
          agentTheoryDepthDiagnostics.visitedSectorRatio,
        theoryCruiseSpeed: agentTheoryDepthDiagnostics.cruiseSpeed,
        theoryCruiseAcceleration:
          agentTheoryDepthDiagnostics.cruiseAcceleration,
        theoryCruiseCheckpointProjectionErrorPx:
          agentTheoryDepthDiagnostics.cruiseCheckpointProjectionErrorPx,
        theoryStellarLodCounts: {
          ...agentTheoryDepthDiagnostics.stellarLodCounts,
        },
        theoryActiveSphereHotspotCount:
          agentTheoryDepthDiagnostics.activeSphereHotspotCount,
        theoryStellarLodTransitionCount:
          agentTheoryDepthDiagnostics.stellarLodTransitionCount,
        theoryShaderStatus: agentTheoryDepthDiagnostics.shaderStatus,
        theoryShaderFailureMaterials: [
          ...agentTheoryDepthDiagnostics.shaderFailureMaterials,
        ],
        theoryWebglErrorCount: agentTheoryDepthDiagnostics.webglErrorCount,
        theoryFirstFrameVisiblePaperCount:
          agentTheoryDepthDiagnostics.firstFrameVisiblePaperCount,
        theoryFirstFrameVisibleHotspotCount:
          agentTheoryDepthDiagnostics.firstFrameVisibleHotspotCount,
        theoryFirstFrameDecorativeVisibleCount:
          agentTheoryDepthDiagnostics.firstFrameDecorativeVisibleCount,
        theoryPerimeterReframeCount:
          agentTheoryDepthDiagnostics.perimeterReframeCount,
        theoryPerimeterDegradationReason:
          agentTheoryDepthDiagnostics.perimeterDegradationReason,
        theoryReadyGatePassed: agentTheoryDepthDiagnostics.readyGatePassed,
        theoryResidentPaperCount:
          agentTheoryDepthDiagnostics.residentPaperCount,
        theoryPerceptiblePaperCount:
          agentTheoryDepthDiagnostics.perceptiblePaperCount,
        theoryForcedVisibleCount:
          agentTheoryDepthDiagnostics.forcedVisibleCount,
        theoryOccupiedTileRatio:
          agentTheoryDepthDiagnostics.occupiedTileRatio,
        theoryOverlapP95: agentTheoryDepthDiagnostics.overlapP95,
        theoryScreenLodSelectionHash:
          agentTheoryDepthDiagnostics.screenLodSelectionHash,
        theoryActualCoreSizeRange: [
          ...agentTheoryDepthDiagnostics.actualCoreSizeRange,
        ],
        theoryActualAlphaRange: [
          ...agentTheoryDepthDiagnostics.actualAlphaRange,
        ],
        ambientMotion: getAmbientMotion(),
        ambientTargetFps: getAmbientTargetFps(),
        ambientCadenceMisses: ambientCadenceSamples.reduce((total, sample) => total + sample.value, 0),
        overviewAmbientDegraded,
        selectionToFirstFrameMs: lastSelectionToFirstFrameMs,
        resumeToFirstFrameMs: lastResumeToFirstFrameMs,
        focusTransitionMs: lastFocusTransitionMs,
        focusTransitionActive: orbit.transition?.kind === "enter-system" || paperJourneyFrame.state === "flying-in",
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
        systemEntryCameraTravelDistance: lastSystemEntryCameraTravelDistance,
        systemEntryCameraRayDeviation: lastSystemEntryCameraRayDeviation,
        systemEntryDistanceMonotonicViolations: lastSystemEntryDistanceMonotonicViolations,
        systemEntryNonSelectedWorldDrift: lastSystemEntryNonSelectedWorldDrift,
        systemEntryScale: lastSystemEntryScale,
        systemCanonicalRebaseCount,
        systemCanonicalRebaseProjectionDeltaPx: lastSystemCanonicalRebaseProjectionDeltaPx,
        systemEntrySelectedCenterDeltaPx: lastSystemEntrySelectedCenterDeltaPx,
        systemEntryCloudDiameterRatio: lastSystemEntryCloudDiameterRatio,
        systemNonSelectedPaperOpacity: sceneData.kind === "app15"
          ? theoryVisibility.paperOpacity
          : THREE.MathUtils.lerp(1, APP17_FAR_PAPER_OPACITY, exploration.blend),
        systemNonSelectedHotspotOpacity: sceneData.kind === "app15"
          ? theoryVisibility.hotspotCoreOpacity
          : THREE.MathUtils.lerp(1, APP17_FAR_HOTSPOT_CORE_OPACITY, exploration.blend),
        farBackgroundHotspotCount: farBackgroundVisualState?.hotspotCount ?? 0,
        farBackgroundPaperSampleCount: farBackgroundVisualState?.paperSampleCount ?? 0,
        farBackgroundRetreatHotspotCount: farBackgroundVisualState?.retreatHotspotCount ?? 0,
        farBackgroundCrossfadeHotspotCount: farBackgroundVisualState?.crossfadeHotspotCount ?? 0,
        farBackgroundNearestRadius: farBackgroundVisualState?.nearestRadius ?? 0,
        farBackgroundFarthestRadius: farBackgroundVisualState?.farthestRadius ?? 0,
        farBackgroundLocalOffsetError: farBackgroundVisualState?.localOffsetError ?? 0,
        farBackgroundCentralMaskVisibleCount: farBackgroundVisualState?.centralMaskVisibleCount ?? 0,
        farBackgroundPaperBrightnessMin: farBackgroundVisualState?.paperBrightnessMin ?? 0,
        farBackgroundPaperBrightnessMax: farBackgroundVisualState?.paperBrightnessMax ?? 0,
        farBackgroundHotspotCoreBrightnessMin: farBackgroundVisualState?.hotspotCoreBrightnessMin ?? 0,
        farBackgroundHotspotCoreBrightnessMax: farBackgroundVisualState?.hotspotCoreBrightnessMax ?? 0,
        farBackgroundHotspotHaloBrightnessMin: farBackgroundVisualState?.hotspotHaloBrightnessMin ?? 0,
        farBackgroundHotspotHaloBrightnessMax: farBackgroundVisualState?.hotspotHaloBrightnessMax ?? 0,
        farBackgroundRebaseProjectionDeltaPx: lastFarBackgroundRebaseProjectionDeltaPx,
        systemOverviewVisibleObjectCount: overviewRoot.visible
          ? sceneData.papers.length + sceneData.hotspots.length
          : 0,
        systemOverviewPickableObjectCount: overviewRoot.visible
          && !(sceneData.kind === "app15" && exploration.blend >= 0.7)
          ? sceneData.hotspots.length
          : 0,
        representativeOwnershipBlend: systemResources?.representativeOwnershipBlend ?? 0,
        representativeStyleBlend: systemResources?.representativeStyleBlend ?? 0,
        representativeOrbitReveal: systemResources?.representativeOrbitReveal ?? 0,
        representativeOrbitMotionBlend: systemResources?.representativeOrbitMotionBlend ?? 0,
        representativeSemanticOrbitError: systemResources?.representativeSemanticOrbitError ?? 0,
        representativeSafeOrbitCaptureCount: systemResources?.representativeSafeOrbitCaptureCount ?? 0,
        representativeHandoffProjectionDeltaPx: lastRepresentativeHandoffProjectionDeltaPx,
        representativeMaxLuminanceStep: systemResources?.representativeMaxLuminanceStep ?? 0,
        theoryViewAzimuthDegrees: theoryViewSelection
          ? THREE.MathUtils.radToDeg(theoryViewSelection.azimuth)
          : THREE.MathUtils.radToDeg(cameraPreset.azimuth),
        theoryViewElevationDegrees: theoryViewSelection
          ? THREE.MathUtils.radToDeg(theoryViewSelection.elevation)
          : THREE.MathUtils.radToDeg(cameraPreset.elevation),
        theoryViewBaselineScore: theoryViewSelection?.baselineScore ?? 0,
        theoryViewSelectedScore: theoryViewSelection?.selectedScore ?? 0,
        theoryViewImprovementRatio: theoryViewSelection?.improvementRatio ?? 0,
        theoryViewOptimized: Boolean(theoryViewSelection?.usedOptimizedView),
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
        systemPaperBaseAlpha: paperVisualState?.baseAlpha
          ?? APP17_SYSTEM_PAPER_BASE_ALPHA,
        systemPaperDepthBrightnessFloor: paperVisualState?.depthBrightnessFloor ?? APP17_SYSTEM_PAPER_DEPTH_BRIGHTNESS_FLOOR,
        systemPaperDepthSizeFloor: paperVisualState?.depthSizeFloor ?? APP17_SYSTEM_PAPER_DEPTH_SIZE_FLOOR,
        systemPaperStableCoreDiameterPhysicalPixels:
          paperVisualState?.stableCoreDiameterPhysicalPixels ?? 0,
        systemPaperStableCoreEnergy:
          paperVisualState?.stableCoreEnergy ?? 0,
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
        systemPaperJourneyState: paperJourneyFrame.state,
        systemPaperJourneyProgress: paperJourneyFrame.journeyProgress,
        systemPaperJourneyPathMode: paperJourneyFrame.pathMode,
        systemPaperFocusState: publishedPaperFocusState,
        systemPaperFocusProgress: paperJourneyFrame.focusBlend,
        systemPaperFocusStartDistance: paperPresentation.startDistance,
        systemPaperFocusTransitionMs: lastPaperFocusTransitionMs,
        systemPaperFocusTargetDistance: paperFocusTargetDistance,
        systemPaperFocusTargetScreenSize: paperPresentation.targetScreenSize,
        systemPaperFocusNeighborBrightness: THREE.MathUtils.lerp(
          1,
          paperVisualState?.focusNeighborBrightness
            ?? APP17_SYSTEM_PAPER_FOCUS_NEIGHBOR_BRIGHTNESS,
          paperJourneyFrame.focusBlend,
        ),
        systemPaperFocusContextBrightness: THREE.MathUtils.lerp(
          1,
          paperVisualState?.focusContextBrightness
            ?? APP17_SYSTEM_PAPER_FOCUS_CONTEXT_BRIGHTNESS,
          paperJourneyFrame.focusBlend,
        ),
        systemPaperFocusCanceled: lastPaperFocusCanceled,
        systemPaperInspectionMode: paperPresentation.mode,
        systemPaperInspectionVisualType: inspectionVisualState.visualType,
        systemPaperInspectionBlend: paperJourneyFrame.visualOwnerOpacity,
        systemPaperInspectionDockBlend: paperPresentation.mode === "docked"
          ? paperJourneyFrame.panelProgress
          : 0,
        systemPaperInspectionDiameter: inspectionVisualState.projectedDiameter,
        systemPaperInspectionDrawCalls: inspectionVisualState.drawCalls,
        systemPaperPanelState: paperPresentation.panelState,
        systemPaperPanelProgress: paperJourneyFrame.panelProgress,
        systemPaperPanelHeaderProgress: paperComposition.panelHeaderProgress,
        systemPaperPanelBodyProgress: paperComposition.panelBodyProgress,
        systemPaperTargetAnchorX: paperComposition.targetAnchorNdcX,
        systemPaperAnchorErrorPx: paperComposition.anchorErrorPx,
        systemPaperCameraWriter: paperComposition.cameraWriter,
        systemPaperCameraWriterChanges: paperComposition.cameraWriterChangesThisFrame,
        systemPaperQuaternionDeltaDegrees: lastPaperQuaternionDeltaDegrees,
        systemPaperAnchorDeltaPx: lastPaperAnchorDeltaPx,
        systemPaperVisualOwnerState: journeyOwnerState(paperJourneyFrame.state),
        systemPaperVisualOwnerOpacity: paperJourneyFrame.visualOwnerOpacity,
        systemPaperVisualCompactLod: paperJourneyFrame.inspectionLod,
        systemPaperVisibleEnergyRatio: lastPaperVisibleEnergyRatio,
        systemPaperHandoffAlphaSum: lastPaperHandoffAlphaSum,
        systemPaperHandoffPointDiameter: lastPaperPointCoreDiameter,
        systemPaperHandoffCloseupDiameter: lastPaperDedicatedCoreDiameter,
        systemPaperHandoffPointAlpha: lastPaperPointAlpha,
        systemPaperHandoffCloseupAlpha: lastPaperDedicatedAlpha,
        systemPaperHandoffPositionDeltaPx: lastPaperHandoffPositionDeltaPx,
        systemPaperProjectedTargetDiameter: paperJourneyFrame.projectedTargetDiameter,
        systemPaperCameraTravelDistance: paperJourneyFrame.cameraTravelDistance,
        systemPaperCameraDistanceToTarget: paperJourneyFrame.cameraDistanceToTarget,
        systemPaperTargetWorldPositionDrift: Math.max(
          paperJourneyFrame.targetWorldPositionDrift,
          lastPaperTargetWorldPositionDrift,
        ),
        systemPaperMinimumStarClearance: paperJourneyFrame.minimumStarClearance,
        systemPaperSmoothnessExtensionMs: paperJourneyFrame.smoothnessExtensionMs,
        systemPaperReturnPositionError: paperJourneyFrame.returnPositionError,
        systemPaperReturnAngleErrorDegrees: paperJourneyFrame.returnAngleErrorDegrees,
        systemPaperStarInFrustum,
        systemPaperStarDrawCalls: starVisualState?.drawCalls ?? 0,
        systemPaperReturnHorizontalReversals: paperComposition.returnHorizontalReversals,
        systemPaperTargetBodyDiameterPx: paperPresentation.targetBodyDiameterPx,
        systemPaperActualBodyDiameterPx: inspectionVisualState.visualType === "energy-core"
          ? inspectionVisualState.energyBodyCoreDiameter
          : inspectionVisualState.projectedDiameter,
        systemPaperRepresentativeCarrierRatio: paperPresentation.representativeCarrierRatio,
        systemPaperEndpointStarExitMarginPx: paperPresentation.endpointStarExitMarginPx,
        systemPaperEndpointCandidateCount: paperPresentation.endpointCandidateCount,
        systemPaperEndpointDirectionDeviationDegrees: paperPresentation.endpointDirectionDeviationDegrees,
        systemPaperEndpointCompositionRejected: paperPresentation.endpointCompositionRejected,
        systemPaperCameraRayLateralDeviation: paperJourneyFrame.cameraRayLateralDeviation,
        systemPaperTargetScreenStepPx: paperJourneyFrame.targetScreenStepPx,
        systemPaperTargetScreenReversals: paperJourneyFrame.targetScreenReversals,
        systemPaperCameraQuaternionStepDegrees: paperJourneyFrame.cameraQuaternionStepDegrees,
        systemPaperProgressStep: paperJourneyFrame.progressStep,
        systemPaperResolvedReadingDistance: paperJourneyFrame.resolvedReadingDistance,
        systemPaperReadingDistanceRelaxation: paperJourneyFrame.readingDistanceRelaxation,
        systemPaperOrdinarySurfaceMorph: inspectionVisualState.ordinarySurfaceMorph,
        systemPaperOrdinaryAtmosphereMorph: inspectionVisualState.ordinaryAtmosphereMorph,
        systemPaperHandoffDiameterRatio: inspectionVisualState.handoffDiameterRatio,
        systemRepresentativeCarrierEdgeLeak: inspectionVisualState.representativeCarrierEdgeLeak,
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

    function publishAgentTheoryRuntimeDiagnostics() {
      onAgentTheoryDepthDiagnosticsRef.current?.({
        ...agentTheoryDepthDiagnostics,
        rawAxisStd: [...agentTheoryDepthDiagnostics.rawAxisStd],
        nearPaperSizeRange: [...agentTheoryDepthDiagnostics.nearPaperSizeRange],
        middlePaperSizeRange: [
          ...agentTheoryDepthDiagnostics.middlePaperSizeRange,
        ],
        farPaperSizeRange: [...agentTheoryDepthDiagnostics.farPaperSizeRange],
        ambientCamera: { ...agentTheoryDepthDiagnostics.ambientCamera },
        stellarLodCounts: {
          ...agentTheoryDepthDiagnostics.stellarLodCounts,
        },
        freeLookPosition: [
          ...agentTheoryDepthDiagnostics.freeLookPosition,
        ],
        freeLookDirection: [
          ...agentTheoryDepthDiagnostics.freeLookDirection,
        ],
        hotspotCoreSizeRange: [
          ...agentTheoryDepthDiagnostics.hotspotCoreSizeRange,
        ],
        visibilityGuard: {
          ...agentTheoryDepthDiagnostics.visibilityGuard,
        },
        postReturnTrajectory: {
          ...agentTheoryDepthDiagnostics.postReturnTrajectory,
        },
        shaderFailureMaterials: [
          ...agentTheoryDepthDiagnostics.shaderFailureMaterials,
        ],
      });
    }

    function updateAgentTheoryCruiseMotionProbe(now: number) {
      if (
        visualProfile !== "agent-theory"
        || sceneData.kind !== "app15"
        || sceneData.papers.length === 0
      ) return;
      const paper = sceneData.papers[0];
      agentTheoryDepthWorld
        .set(paper.x, paper.y, paper.z)
        .applyMatrix4(root.matrixWorld);
      agentTheoryCurrentProjection
        .copy(agentTheoryDepthWorld)
        .project(camera);
      agentTheoryCruiseProbeProjection.set(
        agentTheoryCurrentProjection.x * width * 0.5,
        agentTheoryCurrentProjection.y * height * 0.5,
      );
      if (
        agentTheoryCruiseProbeInitialized
        && now > agentTheoryCruiseProbeLastAt
      ) {
        const elapsedSeconds = Math.max(
          1 / 240,
          (now - agentTheoryCruiseProbeLastAt) / 1_000,
        );
        const predictedX = (
          agentTheoryCruiseProbePreviousProjection.x
          + agentTheoryCruiseProbePreviousVelocity.x * elapsedSeconds
        );
        const predictedY = (
          agentTheoryCruiseProbePreviousProjection.y
          + agentTheoryCruiseProbePreviousVelocity.y * elapsedSeconds
        );
        agentTheoryCruiseProbeResidualPx = Math.hypot(
          agentTheoryCruiseProbeProjection.x - predictedX,
          agentTheoryCruiseProbeProjection.y - predictedY,
        );
        agentTheoryCruiseProbeVelocity.set(
          (
            agentTheoryCruiseProbeProjection.x
              - agentTheoryCruiseProbePreviousProjection.x
          ) / elapsedSeconds,
          (
            agentTheoryCruiseProbeProjection.y
              - agentTheoryCruiseProbePreviousProjection.y
          ) / elapsedSeconds,
        );
        agentTheoryCruiseProbeSpeedPxPerSecond =
          agentTheoryCruiseProbeVelocity.length();
        agentTheoryCruiseProbeAccelerationPxPerSecond2 = Math.hypot(
          (
            agentTheoryCruiseProbeVelocity.x
              - agentTheoryCruiseProbePreviousVelocity.x
          ) / elapsedSeconds,
          (
            agentTheoryCruiseProbeVelocity.y
              - agentTheoryCruiseProbePreviousVelocity.y
          ) / elapsedSeconds,
        );
        agentTheoryCruiseProbePreviousVelocity.copy(
          agentTheoryCruiseProbeVelocity,
        );
      } else {
        agentTheoryCruiseProbePreviousVelocity.set(0, 0);
        agentTheoryCruiseProbeInitialized = true;
      }
      agentTheoryCruiseProbePreviousProjection.copy(
        agentTheoryCruiseProbeProjection,
      );
      agentTheoryCruiseProbeLastAt = now;
    }

    function updateAgentTheoryCruiseLiveness(
      now: number,
      force = false,
    ) {
      if (visualProfile !== "agent-theory") return;
      if (
        !force
        && now - agentTheoryCruiseLastLivenessPublishedAt
          < APP17_AGENT_THEORY_LIVENESS_PUBLISH_MS
      ) return;
      agentTheoryCruiseLastLivenessPublishedAt = now;
      const checkpointStep = agentTheoryCruiseCheckpoint?.stepIndex ?? 0;
      const elapsedMs = Math.max(
        1,
        now - agentTheoryCruiseLivenessBaselineAt,
      );
      const stepDelta = Math.max(
        0,
        checkpointStep - agentTheoryCruiseLivenessBaselineStep,
      );
      const lookDistance = Math.max(
        camera.near * 4,
        camera.position.distanceTo(agentTheoryCurrentLookTarget),
      );
      const visibleWorldHeight = (
        2
        * lookDistance
        * Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5)
        / Math.max(0.001, camera.zoom)
      );
      const worldPerCssPixel = visibleWorldHeight / Math.max(1, height);
      const projectedMovementPx = camera.position.distanceTo(
        agentTheoryCruiseLivenessBaselineCamera,
      ) / Math.max(1e-9, worldPerCssPixel);
      const pausedReason = document.visibilityState === "hidden"
        ? "hidden"
        : interactionModeRef.current === "explore"
          ? "explore"
          : reduceMotion
            ? "reduced-motion"
            : undefined;
      const activeCruise = (
        !pausedReason
        && exploration.state === "overview"
        && agentTheoryCameraMode === "cruise"
      );
      if (activeCruise && stepDelta > 0) {
        agentTheoryCruiseLastProgressAt = now;
      }
      const consecutiveStillMs = activeCruise
        ? Math.max(0, now - agentTheoryCruiseLastProgressAt)
        : 0;
      if (
        activeCruise
        && now >= agentTheoryGuidanceResumeNotBeforeMs
        && (
          consecutiveStillMs >= APP17_AGENT_THEORY_LIVENESS_STILL_MS
          || (
            elapsedMs
              >= APP17_AGENT_THEORY_LIVENESS_MOVEMENT_AUDIT_MS
            && stepDelta > 0
            && projectedMovementPx < 0.15
          )
        )
      ) {
        requestAgentTheoryFallbackGuidance("no-safe-candidate");
      }
      const workerSnapshot = agentTheoryScreenLodWorker?.getSnapshot();
      agentTheoryDepthDiagnostics.cruiseLiveness = {
        motionVersion: AGENT_THEORY_CRUISE_MOTION_VERSION,
        cameraMode: agentTheoryCameraMode,
        guidanceMode: agentTheoryCruiseGuidance.mode,
        stepIndex: checkpointStep,
        stepDeltaLastSecond: stepDelta,
        projectionMovementPxLastSecond: projectedMovementPx,
        visibilitySafe: agentTheoryVisibilityGuard.safe,
        predictedPaperCount:
          agentTheoryVisibilityGuard.predictedMinimumPaperCount,
        predictedHotspotCount:
          agentTheoryVisibilityGuard.predictedMinimumHotspotCount,
        consecutiveStillMs,
        recoveryCount: agentTheoryCruiseRecoveryCount,
        randomTargetSecondsRemaining: agentTheoryCruiseCheckpoint
          ? Math.max(
            0,
            (
              agentTheoryCruiseCheckpoint.nextNoiseStep
                - agentTheoryCruiseCheckpoint.stepIndex
            ) * AGENT_THEORY_CRUISE_FIXED_STEP_SECONDS,
          )
          : 0,
        angularVelocity:
          agentTheoryCruiseCheckpoint?.angularVelocity ?? 0,
        angularAcceleration:
          agentTheoryCruiseCheckpoint?.angularAcceleration ?? 0,
        verticalAcceleration:
          agentTheoryCruiseCheckpoint?.verticalAcceleration ?? 0,
        workerGuidanceLatencyMs: agentTheoryGuidanceWorkerLatencyMs,
        workerGuidancePending:
          workerSnapshot?.pendingGuidanceCount ?? 0,
        workerGuidanceDiscarded:
          workerSnapshot?.discardedGuidanceResponseCount ?? 0,
        guidanceTargetHoldMs: Math.max(
          0,
          now - agentTheoryGuidanceTargetChangedAt,
        ),
        guidanceTargetSwitchCount:
          agentTheoryGuidanceTargetSwitchCount,
        guidanceEmergencyOverrideCount:
          agentTheoryGuidanceEmergencyOverrideCount,
        mainThreadGuidanceFallbackCount:
          agentTheoryGuidanceFallbackCount,
        referenceProjectionSpeedPxPerSecond:
          agentTheoryCruiseProbeSpeedPxPerSecond,
        referenceProjectionAccelerationPxPerSecond2:
          agentTheoryCruiseProbeAccelerationPxPerSecond2,
        referenceTrajectoryResidualPx:
          agentTheoryCruiseProbeResidualPx,
        pausedReason,
      };
      publishAgentTheoryRuntimeDiagnostics();
      if (elapsedMs >= 1_000) {
        agentTheoryCruiseLivenessBaselineAt = now;
        agentTheoryCruiseLivenessBaselineStep = checkpointStep;
        agentTheoryCruiseLivenessBaselineCamera.copy(camera.position);
      }
    }

    function drainWebglErrors(gl: WebGLRenderingContext | WebGL2RenderingContext) {
      let count = 0;
      for (let attempt = 0; attempt < 64; attempt += 1) {
        const error = gl.getError();
        if (error === gl.NO_ERROR) break;
        count += 1;
      }
      return count;
    }

    function reportAgentTheoryRuntimeFailure(
      message: string,
      failedMaterials: string[] = [],
      webglErrorCount = 0,
    ) {
      if (runtimeFailureReported || disposed) return;
      runtimeFailureReported = true;
      agentTheoryCruiseCheckpointSaveAllowed = false;
      agentTheoryDepthDiagnostics.shaderStatus = "failed";
      agentTheoryDepthDiagnostics.shaderFailureMaterials = [
        ...new Set(failedMaterials.filter(Boolean)),
      ];
      agentTheoryDepthDiagnostics.webglErrorCount += webglErrorCount;
      agentTheoryDepthDiagnostics.readyGatePassed = false;
      if (frameId) cancelAnimationFrame(frameId);
      frameId = 0;
      runtimeActive = false;
      renderRequested = false;
      publishAgentTheoryRuntimeDiagnostics();
      onRuntimeErrorRef.current?.(message);
    }

    function runAgentTheoryInitialRuntimeGate() {
      if (visualProfile !== "agent-theory") return true;
      const gl = renderer.getContext();
      try {
        applyRuntimeCamera();
        if (
          agentTheoryPerimeterProfile
          && agentTheoryCruiseCheckpoint
          && agentTheoryCameraMode === "cruise"
        ) {
          const cruiseSample = sampleAgentTheoryCruise(
            agentTheoryPerimeterProfile,
            agentTheoryCruiseCheckpoint,
          );
          selectAgentTheoryCruiseFraming(cruiseSample, true);
          updateAgentTheoryVisibilityGuard(performance.now(), true);
          applyRuntimeCamera();
        }
        updateAgentTheoryScreenLod(performance.now(), true);
        updateAgentTheoryDepthStaging(performance.now(), true);
        const initialVisibilityEnvelope =
          createAgentTheoryVisibilityEnvelope(width, height);
        if (
          agentTheoryDepthDiagnostics.perceptiblePaperCount
            < initialVisibilityEnvelope.paperHardFloor
          || agentTheoryDepthDiagnostics.visibleHotspotCount
            < initialVisibilityEnvelope.hotspotHardFloor
          || agentTheoryDepthDiagnostics.hotspotOccupiedCellCount
            < initialVisibilityEnvelope.hotspotCellHardFloor
          || agentTheoryDepthDiagnostics.occupiedTileRatio <= 0
          || !agentTheoryVisibilityCheckpointValid
        ) {
          reportAgentTheoryRuntimeFailure(
            "理论背景构图失败：当前外围视野未达到论文与热点可见下限。",
          );
          return false;
        }

        drainWebglErrors(gl);
        renderer.compile(scene, camera);
        type RuntimeProgram = {
          name?: string;
          program?: WebGLProgram;
          diagnostics?: {
            runnable?: boolean;
            programLog?: string;
          };
        };
        const programs = (
          renderer.info as unknown as { programs?: RuntimeProgram[] }
        ).programs ?? [];
        const failedMaterials: string[] = [];
        programs.forEach((program, index) => {
          const linked = Boolean(
            program.program
            && gl.getProgramParameter(program.program, gl.LINK_STATUS),
          );
          if (
            !linked
            || program.diagnostics?.runnable === false
          ) {
            failedMaterials.push(program.name || `program-${index + 1}`);
          }
        });
        const compileErrors = drainWebglErrors(gl);
        if (programs.length === 0 || failedMaterials.length > 0 || compileErrors > 0) {
          reportAgentTheoryRuntimeFailure(
            failedMaterials.length > 0
              ? `理论背景 Shader 编译失败：${failedMaterials.join("、")}`
              : "理论背景 Shader 编译失败：未建立有效的 WebGL program。",
            failedMaterials,
            compileErrors,
          );
          return false;
        }
        agentTheoryDepthDiagnostics.shaderStatus = "ready";
        agentTheoryDepthDiagnostics.shaderFailureMaterials = [];
        agentTheoryInitialGateComplete = true;
        publishAgentTheoryRuntimeDiagnostics();
        return true;
      } catch (error) {
        reportAgentTheoryRuntimeFailure(
          `理论背景初始化失败：${String(error)}`,
        );
        return false;
      }
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

    const updateTheoryCameraFraming = (nextAspect: number) => {
      const framing = cameraPreset.theoryFraming;
      if (sceneData.kind !== "app15" || !framing) return;
      const previousDistance = cameraPreset.distance;
      const previousTargetDistance = orbit.targetDistance;
      const nextPreset = resolveTheoryCameraPreset({
        center: cameraPreset.center,
        framing,
        aspect: nextAspect,
      });
      Object.assign(cameraPreset, nextPreset);
      cameraPreset.center.copy(nextPreset.center);
      if (import.meta.env.DEV && reviewCameraPreset) {
        applyGalaxyReviewCameraPreset(cameraPreset, sceneData, reviewCameraPreset);
      }
      if (
        exploration.state === "overview"
        && !orbit.transition
        && paperJourney.getState() === "idle"
        && !(
          visualProfile === "agent-theory"
          && agentTheoryCameraMode !== "cruise"
        )
      ) {
        let nextDistance = cameraPreset.distance;
        if (orbit.viewMode === "top") {
          nextDistance = cameraPreset.topDistance;
        } else if (overviewFramingMode === "fit") {
          nextDistance = cameraPreset.fitDistance;
        } else if (overviewFramingMode === "manual") {
          const relativeZoom = previousTargetDistance / Math.max(0.001, previousDistance);
          nextDistance = cameraPreset.distance * relativeZoom;
        }
        nextDistance = THREE.MathUtils.clamp(
          nextDistance,
          cameraPreset.minDistance,
          cameraPreset.maxDistance,
        );
        orbit.distance = nextDistance;
        orbit.targetDistance = nextDistance;
        orbit.center.copy(cameraPreset.center);
      }
      camera.near = Math.max(0.001, Math.min(0.02, cameraPreset.minDistance * 0.04));
      camera.far = Math.max(
        240,
        cameraPreset.maxDistance + framing.maxRadius * 4,
      );
    };

    const resize = () => {
      if (!runtimeActive) return;
      const rect = hostElement.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return;
      if (orbit.transition?.kind === "enter-system" || orbit.transition?.kind === "exit-system" || paperJourney.isMoving()) {
        transitionCanvasResizeCount += 1;
      }
      width = Math.max(1, Math.floor(rect.width));
      height = Math.max(1, Math.floor(rect.height));
      renderer.setPixelRatio(currentPixelRatio);
      renderer.setSize(width, height, false);
      paperLayer.setViewportHeight(height);
      hotspotLayer.setViewportHeight(height);
      bloomBufferPixelRatio = bloomPipeline?.setSize(width, height, currentPixelRatio) ?? 0;
      camera.aspect = width / height;
      updateTheoryCameraFraming(camera.aspect);
      camera.updateProjectionMatrix();
      const resizeNow = performance.now();
      viewportOffsetControllerRef.current?.(contextRailModeRef.current);
      applyViewportComposition(resizeNow, true);
      if (paperJourney.getState() === "reading") {
        paperJourney.reprojectReading({
          fovDegrees: camera.fov,
          aspect: camera.aspect,
          zoom: camera.zoom,
          up: camera.up.clone(),
        });
        const readingRailMode = paperPresentation.mode === "centered"
          ? "paper-summary"
          : "paper-reading";
        paperJourney.setReadingAnchor(paperRailAnchorNdcX(readingRailMode), resizeNow);
        paperJourneyFrame = paperJourney.advance(resizeNow);
        paperFocusWorldPosition = paperJourneyFrame.targetWorldPosition?.clone() ?? null;
      }
      labelCanvas.width = Math.max(1, Math.floor(width * idlePixelRatio));
      labelCanvas.height = Math.max(1, Math.floor(height * idlePixelRatio));
      labelCanvas.style.width = `${width}px`;
      labelCanvas.style.height = `${height}px`;
      if (agentTheoryInitialGateComplete) {
        scheduleAgentTheoryScreenLodRefresh(80);
      }
      invalidate(true);
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(hostElement);
    resize();

    const pauseTimeline = () => {
      if (timelinePausedAt > 0) return;
      timelinePausedAt = performance.now();
      paperJourney.pause(timelinePausedAt);
    };

    const resumeTimeline = () => {
      if (timelinePausedAt <= 0) return;
      const resumedAt = performance.now();
      const pausedDuration = Math.max(0, resumedAt - timelinePausedAt);
      if (orbit.transition) orbit.transition.startedAt += pausedDuration;
      paperJourney.resume(resumedAt);
      if (fullscreenTransition) fullscreenTransition.startedAt += pausedDuration;
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
      if (orbit.viewMode === "overview" && cameraPreset.autoRotate && orbit.pauseUntil > resumeRequestedAt) {
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

    const setPaperFocusState = (state: GalaxyPaperFocusState, paperId = paperJourney.getTargetId()) => {
      if (publishedPaperFocusState === state) return;
      publishedPaperFocusState = state;
      onPaperFocusStateChangeRef.current?.(state, paperId);
    };

    const setPaperInspectionMode = (mode: GalaxyPaperInspectionMode, paperId = paperJourney.getTargetId()) => {
      if (paperPresentation.mode === mode) return;
      paperPresentation.mode = mode;
      onPaperInspectionModeChangeRef.current?.(mode, paperId);
      labelDirty = true;
    };
    const setPaperPanelState = (state: GalaxyPaperPanelState, paperId = paperJourney.getTargetId()) => {
      if (paperPresentation.panelState === state) return;
      paperPresentation.panelState = state;
      onPaperPanelStateChangeRef.current?.(state, paperId);
    };
    const paperRailAnchorNdcX = (railMode: "paper-summary" | "paper-reading") => {
      const explicitSide = agentTheoryFocusVisualRef.current?.productMode
        === "sidera-explicit"
        ? agentTheoryFocusVisualRef.current.side
        : undefined;
      if (visualProfile === "agent-theory") {
        if (!explicitSide) return 0;
        const normalizedAnchorX = agentTheoryFocusVisualRef.current?.normalizedAnchorX;
        return normalizedAnchorX === undefined
          ? explicitSide === "left" ? -0.56 : 0.56
          : THREE.MathUtils.clamp(normalizedAnchorX * 2 - 1, -0.92, 0.92);
      }
      return resolveResearchGalaxyContextComposition(railMode, width).paperAnchorNdcX;
    };
    const setPaperCameraWriter = (writer: GalaxyPaperCameraWriter) => {
      if (paperComposition.cameraWriter === writer) return;
      paperComposition.cameraWriter = writer;
      paperComposition.cameraWriterChangesThisFrame += 1;
    };
    const captureCameraPose = () => ({
      position: camera.position.clone(),
      quaternion: camera.quaternion.clone(),
    });
    const paperJourneyProjection = () => ({
      fovDegrees: camera.fov,
      aspect: camera.aspect,
      zoom: camera.zoom,
      up: camera.up.clone(),
    });
    const journeyFocusState = (state: GalaxyPaperJourneyState): GalaxyPaperFocusState => {
      if (state === "idle") return "idle";
      if (state === "acquiring" || state === "flying-in") return "entering";
      if (state === "reading") return "focused";
      return "exiting";
    };
    const journeyOwnerState = (state: GalaxyPaperJourneyState): GalaxyPaperFlightTraceSample["ownerState"] => {
      if (state === "idle") return "none";
      if (state === "acquiring") return "acquiring";
      if (state === "releasing") return "releasing";
      return "owned";
    };
    const journeyCameraWriter = (frame: GalaxyPaperJourneyFrame): GalaxyPaperCameraWriter => {
      if (frame.state === "reading") return "paper-composition";
      if (frame.state === "flying-out" || frame.state === "releasing") return "paper-return";
      if (frame.state === "acquiring" || frame.state === "flying-in") return "paper-flight";
      return "orbit";
    };
    const absorbAgentTheoryCameraIntoOrbit = (
      lookTarget = agentTheoryCurrentLookTarget,
    ) => {
      orbit.center.copy(lookTarget);
      const offset = camera.position.clone().sub(orbit.center);
      orbit.distance = Math.max(0.001, offset.length());
      orbit.targetDistance = orbit.distance;
      orbit.azimuth = Math.atan2(offset.y, offset.x);
      orbit.elevation = THREE.MathUtils.clamp(
        Math.asin(THREE.MathUtils.clamp(
          offset.z / Math.max(0.001, orbit.distance),
          -1,
          1,
        )),
        visualProfile === "agent-theory"
          ? THREE.MathUtils.degToRad(-85)
          : cameraPreset.minElevation,
        visualProfile === "agent-theory"
          ? THREE.MathUtils.degToRad(85)
          : cameraPreset.maxElevation,
      );
      if (
        visualProfile === "agent-theory"
        && agentTheoryPerimeterProfile
      ) {
        cameraPreset.minDistance = Math.max(
          0.02,
          agentTheoryPerimeterProfile.medianRadius * 0.38,
        );
        cameraPreset.maxDistance = Math.max(
          orbit.distance * 4,
          agentTheoryPerimeterProfile.maximumRadius * 4,
        );
      }
      orbit.transition = null;
    };
    const resolveAgentTheoryFreeLookDirection = (
      target = new THREE.Vector3(),
    ) => target.set(
      Math.cos(agentTheoryFreeLookPitch)
        * Math.cos(agentTheoryFreeLookYaw),
      Math.cos(agentTheoryFreeLookPitch)
        * Math.sin(agentTheoryFreeLookYaw),
      Math.sin(agentTheoryFreeLookPitch),
    ).normalize();
    const captureAgentTheoryFreeLookFromCamera = () => {
      agentTheoryFreeLookPosition.copy(camera.position);
      camera.getWorldDirection(agentTheoryFreeLookDirection);
      agentTheoryFreeLookYaw = Math.atan2(
        agentTheoryFreeLookDirection.y,
        agentTheoryFreeLookDirection.x,
      );
      agentTheoryFreeLookPitch = THREE.MathUtils.clamp(
        Math.asin(THREE.MathUtils.clamp(
          agentTheoryFreeLookDirection.z,
          -1,
          1,
        )),
        THREE.MathUtils.degToRad(-85),
        THREE.MathUtils.degToRad(85),
      );
      agentTheoryFreeLookDollyVelocity = 0;
    };
    const constrainAgentTheoryFreeLookPosition = () => {
      if (!agentTheoryPerimeterProfile) return;
      const center = new THREE.Vector3().fromArray(
        agentTheoryPerimeterProfile.center,
      );
      const offset = agentTheoryFreeLookPosition.clone().sub(center);
      const maximumDistance = Math.max(
        agentTheoryPerimeterProfile.maximumRadius * 1.5,
        agentTheoryPerimeterProfile.medianRadius * 1.5,
      );
      if (offset.length() > maximumDistance) {
        offset.setLength(maximumDistance);
        agentTheoryFreeLookPosition.copy(center).add(offset);
        agentTheoryFreeLookDollyVelocity = 0;
      }
    };
    const cancelAgentTheoryFreeLookAim = () => {
      if (!agentTheoryFreeLookAim) return;
      captureAgentTheoryFreeLookFromCamera();
      agentTheoryFreeLookAim = null;
    };
    const beginAgentTheoryFreeLookAim = (
      target: THREE.Vector3,
      now: number,
    ) => {
      const targetObject = new THREE.Object3D();
      targetObject.position.copy(agentTheoryFreeLookPosition);
      targetObject.up.copy(camera.up);
      targetObject.lookAt(target);
      agentTheoryFreeLookAim = {
        startedAtMs: now,
        durationMs: 500,
        fromPosition: agentTheoryFreeLookPosition.clone(),
        toPosition: agentTheoryFreeLookPosition.clone(),
        fromQuaternion: camera.quaternion.clone(),
        toQuaternion: targetObject.quaternion.clone(),
        lookDistance: Math.max(
          camera.near * 4,
          agentTheoryFreeLookPosition.distanceTo(target),
        ),
      };
      invalidate(true);
    };
    const beginAgentTheoryFreeLookPoseTransition = (
      targetPosition: THREE.Vector3,
      targetLookTarget: THREE.Vector3,
      now: number,
      durationMs = 650,
    ) => {
      cancelAgentTheoryFreeLookAim();
      const targetObject = new THREE.Object3D();
      targetObject.position.copy(targetPosition);
      targetObject.up.copy(camera.up);
      targetObject.lookAt(targetLookTarget);
      agentTheoryFreeLookAim = {
        startedAtMs: now,
        durationMs,
        fromPosition: agentTheoryFreeLookPosition.clone(),
        toPosition: targetPosition.clone(),
        fromQuaternion: camera.quaternion.clone(),
        toQuaternion: targetObject.quaternion.clone(),
        lookDistance: Math.max(
          camera.near * 4,
          targetPosition.distanceTo(targetLookTarget),
        ),
      };
      agentTheoryFreeLookDollyVelocity = 0;
      cancelOrbitMotion(orbit);
      cancelAgentTheoryScreenLodRefresh();
      requestAgentTheoryScreenLodWorker(now, true);
      invalidate(true);
    };
    const resolveAgentTheoryExploreEntry = () => {
      root.updateMatrixWorld(true);
      camera.updateMatrixWorld(true);
      const weightedTarget = new THREE.Vector3();
      const semanticBounds = new THREE.Box3();
      const theoryFraming = cameraPreset.theoryFraming;
      if (theoryFraming) {
        const { boundsMin, boundsMax } = theoryFraming;
        for (const x of [boundsMin.x, boundsMax.x]) {
          for (const y of [boundsMin.y, boundsMax.y]) {
            for (const z of [boundsMin.z, boundsMax.z]) {
              semanticBounds.expandByPoint(
                agentTheoryScreenLodWorld
                  .set(x, y, z)
                  .applyMatrix4(root.matrixWorld),
              );
            }
          }
        }
      }
      let totalWeight = 0;
      let weightedDepth = 0;
      const currentForward = new THREE.Vector3();
      camera.getWorldDirection(currentForward);
      const includeWorldPoint = (worldPoint: THREE.Vector3) => {
        semanticBounds.expandByPoint(worldPoint);
        agentTheoryCurrentProjection.copy(worldPoint).project(camera);
        if (
          agentTheoryCurrentProjection.z < -1
          || agentTheoryCurrentProjection.z > 1
          || Math.abs(agentTheoryCurrentProjection.x) > 1
          || Math.abs(agentTheoryCurrentProjection.y) > 1
        ) return;
        const radial = Math.hypot(
          agentTheoryCurrentProjection.x,
          agentTheoryCurrentProjection.y,
        );
        const depth = agentTheoryScreenLodView
          .copy(worldPoint)
          .sub(camera.position)
          .dot(currentForward);
        if (depth <= camera.near) return;
        const weight = Math.exp(-radial * radial * 7.5);
        weightedTarget.addScaledVector(worldPoint, weight);
        weightedDepth += depth * weight;
        totalWeight += weight;
      };
      const selectedIndices = agentTheoryScreenLodResult?.selectedIndices
        ?? sceneData.papers.map((_, index) => index);
      selectedIndices.forEach((index) => {
        const paper = sceneData.papers[index];
        if (!paper) return;
        agentTheoryScreenLodWorld
          .set(paper.x, paper.y, paper.z)
          .applyMatrix4(root.matrixWorld);
        includeWorldPoint(agentTheoryScreenLodWorld);
      });
      sceneData.hotspots.forEach((hotspot) => {
        agentTheoryScreenLodWorld
          .copy(hotspot.position)
          .applyMatrix4(root.matrixWorld);
        includeWorldPoint(agentTheoryScreenLodWorld);
      });
      if (totalWeight <= 1e-9) {
        weightedTarget.copy(cameraPreset.center);
        weightedDepth = camera.position.distanceTo(weightedTarget);
        totalWeight = 1;
      }
      weightedTarget.multiplyScalar(1 / totalWeight);
      weightedDepth /= totalWeight;

      const targetObject = new THREE.Object3D();
      targetObject.position.copy(camera.position);
      targetObject.up.copy(camera.up);
      targetObject.lookAt(weightedTarget);
      const desiredQuaternion = targetObject.quaternion.clone();
      const angularDelta = camera.quaternion.angleTo(desiredQuaternion);
      const maximumAngularDelta = THREE.MathUtils.degToRad(1.5);
      if (angularDelta > maximumAngularDelta) {
        desiredQuaternion.copy(camera.quaternion).slerp(
          targetObject.quaternion,
          maximumAngularDelta / angularDelta,
        );
      }
      const finalForward = new THREE.Vector3(0, 0, -1)
        .applyQuaternion(desiredQuaternion)
        .normalize();
      const pivot = camera.position.clone().addScaledVector(
        finalForward,
        Math.max(camera.near * 4, weightedDepth),
      );
      if (!semanticBounds.containsPoint(pivot)) {
        const intersection = new THREE.Ray(
          camera.position,
          finalForward,
        ).intersectBox(semanticBounds, new THREE.Vector3());
        if (intersection) {
          pivot.copy(intersection).addScaledVector(
            finalForward,
            Math.max(
              0.002,
              (agentTheoryPerimeterProfile?.medianRadius ?? 0.1) * 0.08,
            ),
          );
        } else {
          pivot.copy(weightedTarget).clamp(
            semanticBounds.min,
            semanticBounds.max,
          );
          targetObject.lookAt(pivot);
          const pivotAngle = camera.quaternion.angleTo(targetObject.quaternion);
          desiredQuaternion.copy(camera.quaternion).slerp(
            targetObject.quaternion,
            pivotAngle > maximumAngularDelta
              ? maximumAngularDelta / pivotAngle
              : 1,
          );
        }
      }
      return {
        pivot,
        targetQuaternion: desiredQuaternion,
        lookDistance: Math.max(
          camera.near * 4,
          camera.position.distanceTo(pivot),
        ),
      };
    };
    const beginAgentTheoryExploreEntry = (now: number) => {
      if (
        agentTheoryCruiseCheckpoint
        && (
          agentTheoryCameraMode === "cruise"
          || !agentTheoryExploreEntryAnchor
        )
      ) {
        const guidanceTargetElapsedMs = Math.max(
          0,
          now - agentTheoryGuidanceTargetChangedAt,
        );
        const guidanceWorkerElapsedMs = Number.isFinite(
          agentTheoryGuidanceLastRequestedAt,
        )
          ? Math.max(0, now - agentTheoryGuidanceLastRequestedAt)
          : 0;
        const anchorLodSelection = cloneAgentTheoryScreenLodResult(
          agentTheoryScreenLodResult,
        );
        const anchorVisibility = measureAgentTheoryActualReturnVisibility(
          anchorLodSelection?.selectedIndices ?? [],
          camera,
        );
        agentTheoryExploreEntryAnchor = {
          version: "agent-theory-explore-safe-anchor-v2",
          previousCheckpoint: agentTheoryPreviousCruiseCheckpoint
            ? cloneAgentTheoryCruiseCheckpoint(
              agentTheoryPreviousCruiseCheckpoint,
            )
            : null,
          currentCheckpoint: cloneAgentTheoryCruiseCheckpoint(
            agentTheoryCruiseCheckpoint,
          ),
          interpolationAlpha: agentTheoryCruiseInterpolationAlpha,
          position: camera.position.clone(),
          quaternion: camera.quaternion.clone(),
          lookTarget: agentTheoryCurrentLookTarget.clone(),
          lookDistance: Math.max(
            camera.near * 4,
            camera.position.distanceTo(agentTheoryCurrentLookTarget),
          ),
          projection: {
            fov: camera.fov,
            near: camera.near,
            far: camera.far,
            zoom: camera.zoom,
          },
          depthCurrent: [
            agentTheoryDepthCurrentP5,
            agentTheoryDepthCurrentP50,
            agentTheoryDepthCurrentP95,
          ],
          depthTarget: [
            agentTheoryDepthTargetP5,
            agentTheoryDepthTargetP50,
            agentTheoryDepthTargetP95,
          ],
          lodSelection: anchorLodSelection,
          lodTargetWeights: Float32Array.from(
            paperLayer.getAgentLodTargetWeights(),
          ),
          visibility: {
            paperCount: anchorVisibility.paperCount,
            hotspotCount: anchorVisibility.hotspotCount,
            hotspotCellCount: anchorVisibility.hotspotCellCount,
          },
          viewport: [width, height],
          snapshotId: payload.snapshotId ?? "unknown",
          tangentWeight: agentTheoryCruiseViewTangentWeight
            ?? agentTheoryCruiseCheckpoint.tangentWeight,
          verticalAimRatio: agentTheoryCruiseVerticalAimRatio,
          fallbackToCenter: agentTheoryCruiseFallbackToCenter,
          centerBlend: agentTheoryCruiseCenterBlend,
          guidance: {
            ...agentTheoryCruiseGuidance,
          },
          guidanceLifecycle: {
            current: {
              ...agentTheoryCruiseGuidance,
            },
            target: {
              ...agentTheoryCruiseGuidanceTarget,
            },
            desiredTangentWeight:
              agentTheoryCruiseDesiredTangentWeight,
            desiredVerticalAimRatio:
              agentTheoryCruiseDesiredVerticalAimRatio,
            centerBlendTarget: agentTheoryCruiseCenterBlendTarget,
            safeDurationMs: agentTheoryGuidanceSafeSinceMs > 0
              ? Math.max(0, now - agentTheoryGuidanceSafeSinceMs)
              : 0,
            targetHoldRemainingMs: Math.max(
              0,
              APP17_AGENT_THEORY_GUIDANCE_TARGET_HOLD_MS
                - guidanceTargetElapsedMs,
            ),
            nextWorkerEvaluationRemainingMs: Number.isFinite(
              agentTheoryGuidanceLastRequestedAt,
            )
              ? Math.max(
                0,
                APP17_AGENT_THEORY_GUIDANCE_WORKER_INTERVAL_MS
                  - guidanceWorkerElapsedMs,
              )
              : APP17_AGENT_THEORY_GUIDANCE_WORKER_INTERVAL_MS,
            consecutiveUnsafeResults:
              agentTheoryGuidanceConsecutiveUnsafeResults,
            workerEpoch: agentTheoryGuidanceWorkerEpoch,
            acceptedRevision:
              agentTheoryGuidanceLastAcceptedRevision,
          },
          liveness: {
            accumulatorSeconds: agentTheoryCruiseAccumulatorSeconds,
            checkpointSaveAllowed:
              agentTheoryCruiseCheckpointSaveAllowed,
            checkpointValid: agentTheoryVisibilityCheckpointValid,
            visibilityGuard: { ...agentTheoryVisibilityGuard },
            lastSafeCheckpoint: agentTheoryLastSafeCruiseCheckpoint
              ? cloneAgentTheoryCruiseCheckpoint(
                agentTheoryLastSafeCruiseCheckpoint,
              )
              : null,
            ambientTimeSeconds,
          },
        };
      }
      agentTheoryGuidanceWorkerEpoch += 1;
      agentTheoryGuidanceResumeNotBeforeMs =
        Number.POSITIVE_INFINITY;
      agentTheoryGuidanceSource = "none";
      cancelAgentTheoryGuidanceFallback();
      cancelAgentTheoryScreenLodRefresh();
      agentTheoryReturnTransition = null;
      agentTheoryReturnOrientation = null;
      agentTheoryReturnPreparedAtMs = 0;
      agentTheoryReturnAnchorLodResult = null;
      agentTheoryReturnUnionIndices = [];
      agentTheoryCruiseHealthAuditActive = false;
      agentTheoryReturnAwaitingFirstCruiseStep = false;
      agentTheoryExpectedLodPurpose = null;
      agentTheoryExpectedProjectionSignature = "";
      agentTheoryPendingReturnAfterSystemExit = false;
      captureAgentTheoryFreeLookFromCamera();
      agentTheoryCameraMode = "explore-free";
      publishAgentTheoryReturnProgress("idle", 0, true);
      cancelOrbitMotion(orbit);
      orbit.pointerPressed = false;
      orbit.dragging = false;
      pendingWheelDelta = 0;
      agentTheoryFreeLookDollyVelocity = 0;
      agentTheoryCurrentLookTarget
        .copy(agentTheoryFreeLookPosition)
        .addScaledVector(
          resolveAgentTheoryFreeLookDirection(),
          Math.max(
            camera.near * 4,
            agentTheoryPerimeterProfile?.medianRadius ?? 1,
          ),
        );
      paperLayer.setAgentLodTransitionPaused(false, now);
      if (!requestAgentTheoryScreenLodWorker(now, true)) {
        scheduleAgentTheoryScreenLodRefresh(0);
      }
      labelDirty = true;
      invalidate(true);
    };
    const captureAgentTheoryReturnProjection = () => {
      root.updateMatrixWorld(true);
      agentTheoryReturnProjectionWorld.copy(
        sceneData.hotspots[0]?.position ?? cameraPreset.center,
      ).applyMatrix4(root.matrixWorld);
      agentTheoryReturnProjectionBefore
        .copy(agentTheoryReturnProjectionWorld)
        .project(camera);
    };
    const finishAgentTheoryReturnProjection = () => {
      agentTheoryReturnProjectionAfter
        .copy(agentTheoryReturnProjectionWorld)
        .project(camera);
      agentTheoryDepthDiagnostics.returnProjectionErrorPx = Math.hypot(
        (agentTheoryReturnProjectionAfter.x
          - agentTheoryReturnProjectionBefore.x) * width * 0.5,
        (agentTheoryReturnProjectionAfter.y
          - agentTheoryReturnProjectionBefore.y) * height * 0.5,
      );
    };
    function restoreAgentTheoryExploreAnchorState(
      entryAnchor: NonNullable<typeof agentTheoryExploreEntryAnchor>,
      now: number,
    ) {
      agentTheoryPreviousCruiseCheckpoint =
        entryAnchor.previousCheckpoint
          ? cloneAgentTheoryCruiseCheckpoint(
            entryAnchor.previousCheckpoint,
          )
          : cloneAgentTheoryCruiseCheckpoint(
            entryAnchor.currentCheckpoint,
          );
      agentTheoryCruiseCheckpoint = cloneAgentTheoryCruiseCheckpoint(
        entryAnchor.currentCheckpoint,
      );
      agentTheoryCruiseInterpolationAlpha =
        entryAnchor.interpolationAlpha;
      agentTheoryCruiseViewTangentWeight = entryAnchor.tangentWeight;
      agentTheoryCruiseDesiredTangentWeight = entryAnchor.tangentWeight;
      agentTheoryCruiseVerticalAimRatio = entryAnchor.verticalAimRatio;
      agentTheoryCruiseDesiredVerticalAimRatio =
        entryAnchor.verticalAimRatio;
      agentTheoryCruiseFallbackToCenter = entryAnchor.fallbackToCenter;
      agentTheoryCruiseCenterBlend = entryAnchor.centerBlend;
      agentTheoryCruiseCenterBlendTarget = entryAnchor.centerBlend;
      agentTheoryCruiseGuidance = {
        ...entryAnchor.guidanceLifecycle.current,
      };
      agentTheoryCruiseGuidanceTarget = {
        ...entryAnchor.guidanceLifecycle.target,
      };
      agentTheoryCruiseDesiredTangentWeight =
        entryAnchor.guidanceLifecycle.desiredTangentWeight;
      agentTheoryCruiseDesiredVerticalAimRatio =
        entryAnchor.guidanceLifecycle.desiredVerticalAimRatio;
      agentTheoryCruiseCenterBlendTarget =
        entryAnchor.guidanceLifecycle.centerBlendTarget;
      const guidanceClockResumeAt =
        now + APP17_AGENT_THEORY_POST_RETURN_DIAGNOSTIC_MS;
      agentTheoryGuidanceTargetChangedAt = (
        guidanceClockResumeAt
        - (
          APP17_AGENT_THEORY_GUIDANCE_TARGET_HOLD_MS
          - entryAnchor.guidanceLifecycle.targetHoldRemainingMs
        )
      );
      agentTheoryGuidanceSafeSinceMs =
        entryAnchor.guidanceLifecycle.safeDurationMs > 0
          ? guidanceClockResumeAt
            - entryAnchor.guidanceLifecycle.safeDurationMs
          : 0;
      agentTheoryGuidanceConsecutiveUnsafeResults =
        entryAnchor.guidanceLifecycle.consecutiveUnsafeResults;
      agentTheoryGuidanceLastAcceptedRevision = Math.max(
        agentTheoryGuidanceLastAcceptedRevision,
        entryAnchor.guidanceLifecycle.acceptedRevision,
      );
      agentTheoryGuidanceWorkerEpoch += 1;
      agentTheoryGuidanceResumeNotBeforeMs = (
        guidanceClockResumeAt
        + entryAnchor.guidanceLifecycle
          .nextWorkerEvaluationRemainingMs
      );
      agentTheoryGuidanceLastRequestedAt = (
        agentTheoryGuidanceResumeNotBeforeMs
        - APP17_AGENT_THEORY_GUIDANCE_WORKER_INTERVAL_MS
      );
      agentTheoryGuidanceSource = "frozen";
      agentTheoryDepthCurrentP5 = entryAnchor.depthCurrent[0];
      agentTheoryDepthCurrentP50 = entryAnchor.depthCurrent[1];
      agentTheoryDepthCurrentP95 = entryAnchor.depthCurrent[2];
      agentTheoryDepthTargetP5 = entryAnchor.depthTarget[0];
      agentTheoryDepthTargetP50 = entryAnchor.depthTarget[1];
      agentTheoryDepthTargetP95 = entryAnchor.depthTarget[2];
      agentTheoryCruiseAccumulatorSeconds =
        entryAnchor.liveness.accumulatorSeconds;
      agentTheoryCruiseCheckpointSaveAllowed =
        entryAnchor.liveness.checkpointSaveAllowed;
      agentTheoryVisibilityCheckpointValid =
        entryAnchor.liveness.checkpointValid;
      agentTheoryVisibilityGuard = {
        ...entryAnchor.liveness.visibilityGuard,
      };
      agentTheoryLastSafeCruiseCheckpoint =
        entryAnchor.liveness.lastSafeCheckpoint
          ? cloneAgentTheoryCruiseCheckpoint(
            entryAnchor.liveness.lastSafeCheckpoint,
          )
          : cloneAgentTheoryCruiseCheckpoint(
            entryAnchor.currentCheckpoint,
          );
      ambientTimeSeconds = entryAnchor.liveness.ambientTimeSeconds;
    }

    function restoreAgentTheoryExploreAnchorProjection(
      entryAnchor: NonNullable<typeof agentTheoryExploreEntryAnchor>,
      projectionCamera: THREE.PerspectiveCamera = camera,
    ) {
      projectionCamera.fov = entryAnchor.projection.fov;
      projectionCamera.near = entryAnchor.projection.near;
      projectionCamera.far = entryAnchor.projection.far;
      projectionCamera.zoom = entryAnchor.projection.zoom;
      projectionCamera.aspect = Math.max(1, width) / Math.max(1, height);
      projectionCamera.updateProjectionMatrix();
    }

    function beginAgentTheoryCruiseHealthAudit(now: number) {
      const entryAnchor = agentTheoryExploreEntryAnchor;
      if (!entryAnchor) return;
      const anchorLodResult = agentTheoryReturnAnchorLodResult;
      restoreAgentTheoryExploreAnchorState(entryAnchor, now);
      restoreAgentTheoryExploreAnchorProjection(entryAnchor);
      camera.position.copy(entryAnchor.position);
      camera.quaternion.copy(entryAnchor.quaternion);
      camera.updateMatrixWorld(true);
      agentTheoryCurrentLookTarget.copy(entryAnchor.lookTarget);
      agentTheoryLookTarget.copy(entryAnchor.lookTarget);
      agentTheoryCameraMode = "cruise";
      agentTheoryReturnTransition = null;
      agentTheoryReturnOrientation = null;
      agentTheoryPendingReturnAfterSystemExit = false;
      cancelOrbitMotion(orbit);
      pendingWheelDelta = 0;
      agentTheoryFreeLookDollyVelocity = 0;
      agentTheoryCruiseHealthAuditActive = !reduceMotion;
      agentTheoryReturnAwaitingFirstCruiseStep = !reduceMotion;
      agentTheoryCruiseResumeStartedAtMs = now;
      agentTheoryCruiseResumeStartStep =
        agentTheoryCruiseCheckpoint?.stepIndex ?? 0;
      agentTheoryCruiseResumeSuccessfulSteps = 0;
      agentTheoryCruiseResumeRejectedSteps = 0;
      agentTheoryCruiseResumeFirstSuccessfulStep = -1;
      agentTheoryCruiseResumeAmbientStart = ambientTimeSeconds;
      agentTheoryCruiseResumeStillFrames = 0;
      agentTheoryCruiseResumeGuardEvaluationCount = 0;
      agentTheoryCruiseResumeGuardSafeCount = 0;
      agentTheoryPostReturnDiagnosticStartedAtMs = now;
      agentTheoryPostReturnExtraFramingCount = 0;
      agentTheoryPostReturnAcceptedWorkerRevision = 0;
      agentTheoryPostReturnDiscardedWorkerResponses = 0;
      agentTheoryPostReturnFallbackTriggerCount = 0;
      agentTheoryPostReturnMaximumTrajectoryResidualPx = 0;
      agentTheoryGuidanceSource = "frozen";
      const entryVisibilitySafe = isAgentTheoryVisibilitySafe(
        entryAnchor.visibility,
        createAgentTheoryVisibilityEnvelope(width, height),
      );
      if (entryVisibilitySafe) {
        agentTheoryVisibilityCheckpointValid = true;
      }
      agentTheoryCruiseCheckpointSaveAllowed =
        entryAnchor.liveness.checkpointSaveAllowed;
      if (anchorLodResult) {
        paperLayer.setAgentLodSelection(
          anchorLodResult.selectedIndices,
          now,
          false,
          {
            incomingDurationMs: 90,
            retiringDurationMs: 300,
            retiringDelayMs: 0,
          },
        );
        agentTheoryScreenLodResult =
          cloneAgentTheoryScreenLodResult(anchorLodResult);
        applyAgentTheoryScreenLodDiagnostics(anchorLodResult);
      }
      const actualVisibility = measureAgentTheoryActualReturnVisibility(
        agentTheoryReturnUnionIndices,
        camera,
      );
      agentTheoryDepthDiagnostics.returnActualVisiblePaperCount =
        actualVisibility.paperCount;
      agentTheoryDepthDiagnostics.returnActualVisibleHotspotCount =
        actualVisibility.hotspotCount;
      agentTheoryDepthDiagnostics.returnActualVisibleHotspotCellCount =
        actualVisibility.hotspotCellCount;
      agentTheoryReturnVisibilityGatePassed = isAgentTheoryVisibilitySafe(
        actualVisibility,
        createAgentTheoryVisibilityEnvelope(width, height),
      );
      agentTheoryDepthDiagnostics.returnVisibilityGatePassed =
        agentTheoryReturnVisibilityGatePassed;
      root.updateMatrixWorld(true);
      agentTheoryReturnProjectionWorld.copy(
        sceneData.hotspots[0]?.position ?? cameraPreset.center,
      ).applyMatrix4(root.matrixWorld);
      agentTheoryCruiseResumeProjectionStart
        .copy(agentTheoryReturnProjectionWorld)
        .project(camera);
      agentTheoryDepthDiagnostics.returnCruiseRestoreDurationMs = 0;
      agentTheoryDepthDiagnostics.returnCruiseAdvanceRejectedCount = 0;
      agentTheoryDepthDiagnostics.returnCruiseFirstSuccessfulStep = -1;
      agentTheoryDepthDiagnostics.returnCruiseCheckpointDelta = 0;
      agentTheoryDepthDiagnostics.returnAmbientTimeDelta = 0;
      agentTheoryDepthDiagnostics.returnConsecutiveStillFrames = 0;
      agentTheoryDepthDiagnostics.returnCruiseGuardEvaluationCount = 0;
      agentTheoryDepthDiagnostics.returnCruiseGuardSafeCount = 0;
      agentTheoryCruiseLivenessBaselineAt = now;
      agentTheoryCruiseLivenessBaselineStep =
        agentTheoryCruiseCheckpoint?.stepIndex ?? 0;
      agentTheoryCruiseLivenessBaselineCamera.copy(camera.position);
      agentTheoryCruiseLastProgressAt = now;
      updateAgentTheoryPostReturnTrajectoryDiagnostics(
        now,
        "agent-theory-cruise",
      );
      if (reduceMotion) {
        completeAgentTheoryReturnAfterCruiseStep(now);
        return;
      }
      publishAgentTheoryReturnProgress("return-commit", 1, true);
      invalidate(true);
    }

    function completeAgentTheoryReturnAfterCruiseStep(now: number) {
      const entryAnchor = agentTheoryExploreEntryAnchor;
      if (!entryAnchor) return;
      agentTheoryReturnAwaitingFirstCruiseStep = false;
      agentTheoryReturnPreparedAtMs = 0;
      agentTheoryReturnVisibilityGatePassed = true;
      agentTheoryDepthDiagnostics.returnVisibilityGatePassed = true;
      agentTheoryCruiseCheckpointSaveAllowed =
        agentTheoryVisibilityCheckpointValid
        && (
          entryAnchor.liveness.checkpointSaveAllowed
          || agentTheoryCruiseResumeSuccessfulSteps >= 1
        );
      agentTheoryExpectedLodPurpose = null;
      agentTheoryExpectedProjectionSignature = "";
      agentTheoryReturnAnchorLodResult = null;
      agentTheoryReturnUnionIndices = [];
      agentTheoryExploreEntryAnchor = null;
      agentTheoryDepthDiagnostics.returnCruiseRestoreDurationMs =
        Math.max(0, now - agentTheoryCruiseResumeStartedAtMs);
      publishAgentTheoryReturnProgress("idle", 0, true);
      invalidate(true);
    }

    function completeAgentTheoryCruiseHealthAudit(
      now: number,
      _projectionDeltaPx: number,
    ) {
      if (!agentTheoryCruiseHealthAuditActive) return;
      agentTheoryCruiseHealthAuditActive = false;
      agentTheoryDepthDiagnostics.returnCruiseRestoreDurationMs =
        Math.max(0, now - agentTheoryCruiseResumeStartedAtMs);
      updateAgentTheoryPostReturnTrajectoryDiagnostics(
        now,
        "agent-theory-cruise",
      );
      updateAgentTheoryCruiseLiveness(now, true);
    }

    function completeAgentTheoryReturnPreparation(
      anchorResult: AgentTheoryScreenLodResult,
      now: number,
    ) {
      const entryAnchor = agentTheoryExploreEntryAnchor;
      if (
        !entryAnchor
        || agentTheoryCameraMode !== "return-preparing"
      ) return;
      const currentWeights = paperLayer.getAgentLodWeights();
      const currentTargetWeights = paperLayer.getAgentLodTargetWeights();
      const union = new Set<number>(anchorResult.selectedIndices);
      let currentSelectionCount = 0;
      for (let index = 0; index < currentWeights.length; index += 1) {
        if (
          currentWeights[index] >= 0.01
          || currentTargetWeights[index] >= 0.01
        ) {
          union.add(index);
          currentSelectionCount += 1;
        }
      }
      agentTheoryReturnAnchorLodResult =
        cloneAgentTheoryScreenLodResult(anchorResult);
      agentTheoryReturnUnionIndices = [...union];
      paperLayer.setAgentLodSelection(
        agentTheoryReturnUnionIndices,
        now,
        false,
        {
          incomingDurationMs: 90,
          retiringDurationMs: 300,
          retiringDelayMs: 300,
        },
      );
      agentTheoryReturnPreparedAtMs = now;
      agentTheoryReturnVisibilityGatePassed = false;
      agentTheoryDepthDiagnostics.returnVisibilityGatePassed = false;
      agentTheoryDepthDiagnostics.returnCurrentSelectionCount =
        currentSelectionCount;
      agentTheoryDepthDiagnostics.returnAnchorSelectionCount =
        anchorResult.selectedIndices.length;
      agentTheoryDepthDiagnostics.returnUnionSelectionCount =
        agentTheoryReturnUnionIndices.length;
      agentTheoryDepthDiagnostics.returnProjectionSignature =
        agentTheoryReturnProjectionSignature;
      agentTheoryDepthDiagnostics.returnMinimumVisiblePaperCount =
        Number.POSITIVE_INFINITY;
      agentTheoryDepthDiagnostics.returnBlackFrameCount = 0;
      agentTheoryDepthDiagnostics.returnMaximumSegmentDeviation = 0;
      publishAgentTheoryReturnProgress("return-preparing", 0, true);
      invalidate(true);
    }

    function startAgentTheoryPreparedReturn(now: number) {
      const entryAnchor = agentTheoryExploreEntryAnchor;
      if (
        !entryAnchor
        || !agentTheoryReturnAnchorLodResult
        || agentTheoryCameraMode !== "return-preparing"
      ) return;
      const returnDistance = camera.position.distanceTo(
        entryAnchor.position,
      );
      const returnAngle = camera.quaternion.angleTo(
          entryAnchor.quaternion,
      );
      agentTheoryReturnTransition =
        createAgentTheoryAnchorReturnTransition({
          nowMs: now,
          fromPosition: camera.position.toArray() as [
            number,
            number,
            number,
          ],
          toPosition: entryAnchor.position.toArray() as [
            number,
            number,
            number,
          ],
          angleRadians: returnAngle,
          medianRadius: agentTheoryPerimeterProfile?.medianRadius ?? 1,
        });
      agentTheoryReturnOrientation = {
        fromQuaternion: camera.quaternion.clone(),
        toQuaternion: entryAnchor.quaternion.clone(),
        fromLookDistance: Math.max(
          camera.near * 4,
          camera.position.distanceTo(agentTheoryCurrentLookTarget),
        ),
        toLookDistance: entryAnchor.lookDistance,
        fromDepth: [
          agentTheoryDepthCurrentP5,
          agentTheoryDepthCurrentP50,
          agentTheoryDepthCurrentP95,
        ],
        toDepth: [...entryAnchor.depthCurrent],
      };
      agentTheoryDepthDiagnostics.returnDistance = returnDistance;
      agentTheoryDepthDiagnostics.returnAngleDegrees =
        THREE.MathUtils.radToDeg(returnAngle);
      agentTheoryDepthDiagnostics.returnStartPosition =
        camera.position.toArray() as [number, number, number];
      agentTheoryDepthDiagnostics.returnAnchorPosition =
        entryAnchor.position.toArray() as [number, number, number];
      agentTheoryCameraMode = "returning-anchor";
      publishAgentTheoryReturnProgress("returning-anchor", 0, true);
      invalidate(true);
    }

    function requestAgentTheoryAnchorLod(
      entryAnchor: NonNullable<typeof agentTheoryExploreEntryAnchor>,
      now: number,
    ) {
      const anchorCamera = camera.clone();
      restoreAgentTheoryExploreAnchorProjection(
        entryAnchor,
        anchorCamera,
      );
      anchorCamera.position.copy(entryAnchor.position);
      anchorCamera.quaternion.copy(entryAnchor.quaternion);
      anchorCamera.updateMatrixWorld(true);
      root.updateMatrixWorld(true);
      const anchorMatrix = new THREE.Matrix4()
        .multiplyMatrices(
          anchorCamera.projectionMatrix,
          anchorCamera.matrixWorldInverse,
        )
        .multiply(root.matrixWorld);
      agentTheoryReturnProjectionSignature =
        createAgentTheoryProjectionSignature(
          anchorMatrix,
          "return-anchor",
        );
      agentTheoryExpectedLodPurpose = "return-anchor";
      agentTheoryExpectedProjectionSignature =
        agentTheoryReturnProjectionSignature;
      agentTheoryDepthDiagnostics.returnProjectionSignature =
        agentTheoryReturnProjectionSignature;
      const requested = requestAgentTheoryScreenLodWorker(
        now,
        true,
        anchorCamera,
        "return-anchor",
      );
      if (!requested) {
        startAgentTheoryMainThreadLodFallback(
          now,
          true,
          anchorCamera,
          "return-anchor",
        );
      }
    }

    const beginAgentTheoryReturnToPerimeter = (now: number) => {
      if (
        !agentTheoryPerimeterProfile
        || !agentTheoryCruiseCheckpoint
        || interactionModeRef.current !== "ambient"
      ) return;
      if (agentTheoryCameraMode === "explore-free") {
        captureAgentTheoryFreeLookFromCamera();
      }
      agentTheoryFreeLookAim = null;
      agentTheoryFreeLookDollyVelocity = 0;
      pendingWheelDelta = 0;
      orbit.pointerPressed = false;
      orbit.dragging = false;
      cancelAgentTheoryScreenLodRefresh();
      const entryAnchor = agentTheoryExploreEntryAnchor;
      if (!entryAnchor) return;
      agentTheoryCameraMode = "return-preparing";
      publishAgentTheoryReturnProgress("return-preparing", 0, true);
      agentTheoryPendingReturnAfterSystemExit = false;
      cancelOrbitMotion(orbit);
      const canReuseAnchorSelection = Boolean(
        entryAnchor.lodSelection
        && entryAnchor.viewport[0] === width
        && entryAnchor.viewport[1] === height
        && entryAnchor.snapshotId === (payload.snapshotId ?? "unknown")
      );
      if (canReuseAnchorSelection && entryAnchor.lodSelection) {
        agentTheoryReturnProjectionSignature = [
          "return-anchor",
          width,
          height,
          entryAnchor.lodSelection.selectionHash,
        ].join(":");
        completeAgentTheoryReturnPreparation(
          entryAnchor.lodSelection,
          now,
        );
      } else {
        requestAgentTheoryAnchorLod(entryAnchor, now);
      }
    };
    const synchronizeAgentTheoryInteractionMode = () => {
      if (visualProfile !== "agent-theory") return;
      const nextMode = interactionModeRef.current;
      if (nextMode !== previousAgentTheoryInteractionMode) {
        if (nextMode === "explore") {
          beginAgentTheoryExploreEntry(performance.now());
        } else if (exploration.state !== "overview") {
          agentTheoryPendingReturnAfterSystemExit = true;
          beginExitSystem(performance.now());
        } else {
          beginAgentTheoryReturnToPerimeter(performance.now());
        }
        previousAgentTheoryInteractionMode = nextMode;
      }
      if (
        nextMode === "ambient"
        && agentTheoryPendingReturnAfterSystemExit
        && exploration.state === "overview"
        && !orbit.transition
      ) {
        beginAgentTheoryReturnToPerimeter(performance.now());
      }
    };
    const applyAgentTheoryPointerParallax = (
      position: THREE.Vector3,
      sourceTarget: THREE.Vector3,
    ) => {
      const forward = sourceTarget.clone().sub(position).normalize();
      const right = new THREE.Vector3().crossVectors(
        forward,
        camera.up,
      ).normalize();
      const localUp = new THREE.Vector3().crossVectors(right, forward).normalize();
      const yaw = Math.tan(THREE.MathUtils.degToRad(
        agentTheoryPointerOffsetCurrent.x * 0.25,
      ));
      const pitch = Math.tan(THREE.MathUtils.degToRad(
        agentTheoryPointerOffsetCurrent.y * 0.15,
      ));
      const distance = Math.max(1, sourceTarget.distanceTo(position));
      return position.clone().add(
        forward.addScaledVector(right, yaw).addScaledVector(localUp, pitch)
          .normalize()
          .multiplyScalar(distance),
      );
    };
    const applyRuntimeCamera = () => {
      synchronizeAgentTheoryInteractionMode();
      if (paperJourneyFrame.cameraPose) {
        camera.position.copy(paperJourneyFrame.cameraPose.position);
        camera.quaternion.copy(paperJourneyFrame.cameraPose.quaternion);
        camera.updateMatrixWorld(true);
        paperComposition.targetAnchorNdcX = paperJourneyFrame.anchorNdcX;
        paperComposition.currentAnchorNdcX = paperJourneyFrame.anchorNdcX;
        setPaperCameraWriter(journeyCameraWriter(paperJourneyFrame));
        return;
      }
      if (
        visualProfile === "agent-theory"
        && interactionModeRef.current === "explore"
        && exploration.state === "overview"
        && agentTheoryCameraMode === "explore-free"
      ) {
        const freeLookNow = performance.now();
        const elapsedSeconds = THREE.MathUtils.clamp(
          (freeLookNow - agentTheoryFreeLookLastUpdateAt) / 1_000,
          0,
          0.05,
        );
        agentTheoryFreeLookLastUpdateAt = freeLookNow;
        if (agentTheoryFreeLookAim) {
          const aimProgress = THREE.MathUtils.clamp(
            (freeLookNow - agentTheoryFreeLookAim.startedAtMs)
              / Math.max(1, agentTheoryFreeLookAim.durationMs),
            0,
            1,
          );
          const aimEased = smootherStep(aimProgress);
          agentTheoryFreeLookPosition
            .copy(agentTheoryFreeLookAim.fromPosition)
            .lerp(agentTheoryFreeLookAim.toPosition, aimEased);
          camera.quaternion
            .copy(agentTheoryFreeLookAim.fromQuaternion)
            .slerp(
              agentTheoryFreeLookAim.toQuaternion,
              aimEased,
            );
          camera.getWorldDirection(agentTheoryFreeLookDirection);
          agentTheoryFreeLookYaw = Math.atan2(
            agentTheoryFreeLookDirection.y,
            agentTheoryFreeLookDirection.x,
          );
          agentTheoryFreeLookPitch = Math.asin(THREE.MathUtils.clamp(
            agentTheoryFreeLookDirection.z,
            -1,
            1,
          ));
          if (aimProgress >= 1) {
            agentTheoryFreeLookAim = null;
            scheduleAgentTheoryScreenLodRefresh(
              APP17_AGENT_THEORY_LOD_SETTLE_MS,
            );
          }
        } else {
          resolveAgentTheoryFreeLookDirection(agentTheoryFreeLookDirection);
        }
        if (Math.abs(agentTheoryFreeLookDollyVelocity) > 1e-5) {
          agentTheoryFreeLookPosition.addScaledVector(
            agentTheoryFreeLookDirection,
            agentTheoryFreeLookDollyVelocity * elapsedSeconds,
          );
          agentTheoryFreeLookDollyVelocity *= Math.exp(
            -elapsedSeconds
              / APP17_AGENT_THEORY_FREE_LOOK_DOLLY_DAMPING_SECONDS,
          );
          constrainAgentTheoryFreeLookPosition();
          invalidate(true);
        }
        camera.position.copy(agentTheoryFreeLookPosition);
        if (!agentTheoryFreeLookAim) {
          camera.lookAt(
            agentTheoryFreeLookPosition.clone().add(
              agentTheoryFreeLookDirection,
            ),
          );
        }
        camera.updateMatrixWorld(true);
        const lookDistance = agentTheoryFreeLookAim?.lookDistance
          ?? Math.max(
            camera.near * 4,
            agentTheoryPerimeterProfile?.medianRadius ?? 1,
          );
        const focusHoldDrift = new THREE.Vector3();
        const explicitFocusBlend = (
          agentTheoryFocusVisualRef.current?.productMode === "sidera-explicit"
            ? agentTheoryFocusVisualRef.current.blend
            : 0
        );
        if (
          explicitFocusBlend > 0.001
          && !agentTheoryFreeLookAim
          && !reduceMotion
        ) {
          const right = new THREE.Vector3().crossVectors(
            agentTheoryFreeLookDirection,
            camera.up,
          ).normalize();
          const localUp = new THREE.Vector3().crossVectors(
            right,
            agentTheoryFreeLookDirection,
          ).normalize();
          focusHoldDrift
            .addScaledVector(
              right,
              Math.sin(freeLookNow / 41_000 * Math.PI * 2)
                * 0.035
                * explicitFocusBlend,
            )
            .addScaledVector(
              localUp,
              Math.cos(freeLookNow / 53_000 * Math.PI * 2)
                * 0.024
                * explicitFocusBlend,
            );
          camera.position.add(focusHoldDrift);
          camera.lookAt(
            agentTheoryFreeLookPosition
              .clone()
              .addScaledVector(agentTheoryFreeLookDirection, lookDistance)
              .add(focusHoldDrift),
          );
          camera.updateMatrixWorld(true);
        }
        agentTheoryCurrentLookTarget
          .copy(agentTheoryFreeLookPosition)
          .addScaledVector(agentTheoryFreeLookDirection, lookDistance)
          .add(focusHoldDrift);
        agentTheoryDepthDiagnostics.freeLookPosition =
          agentTheoryFreeLookPosition.toArray() as [number, number, number];
        agentTheoryDepthDiagnostics.freeLookDirection =
          agentTheoryFreeLookDirection.toArray() as [number, number, number];
        agentTheoryDepthDiagnostics.cameraMode = agentTheoryCameraMode;
      } else if (
        visualProfile === "agent-theory"
        && interactionModeRef.current === "ambient"
        && exploration.state === "overview"
        && agentTheoryPerimeterProfile
        && agentTheoryCruiseCheckpoint
        && agentTheoryCameraMode === "return-preparing"
      ) {
        agentTheoryDepthDiagnostics.cameraMode = agentTheoryCameraMode;
        publishAgentTheoryReturnProgress("return-preparing", 0);
        const anchorSelectionReady = (
          agentTheoryReturnAnchorLodResult !== null
          && (
            !paperLayer.isAgentLodTransitioning()
            || (
              agentTheoryReturnPreparedAtMs > 0
              && performance.now() - agentTheoryReturnPreparedAtMs >= 120
            )
          )
        );
        if (anchorSelectionReady) {
          startAgentTheoryPreparedReturn(performance.now());
        }
      } else if (
        visualProfile === "agent-theory"
        && interactionModeRef.current === "ambient"
        && exploration.state === "overview"
        && agentTheoryPerimeterProfile
        && agentTheoryCruiseCheckpoint
        && agentTheoryCameraMode === "returning-anchor"
        && agentTheoryReturnTransition
        && agentTheoryReturnOrientation
        && agentTheoryExploreEntryAnchor
      ) {
        captureAgentTheoryReturnProjection();
        const returnSample = sampleAgentTheoryAnchorReturnTransition(
          agentTheoryReturnTransition,
          performance.now(),
        );
        camera.position.fromArray(returnSample.position);
        const segmentStart = agentTheoryReturnTransition.fromPosition;
        const segmentEnd = agentTheoryReturnTransition.toPosition;
        const segmentX = segmentEnd[0] - segmentStart[0];
        const segmentY = segmentEnd[1] - segmentStart[1];
        const segmentZ = segmentEnd[2] - segmentStart[2];
        const segmentLengthSq = (
          segmentX * segmentX
          + segmentY * segmentY
          + segmentZ * segmentZ
        );
        const segmentParameter = segmentLengthSq > 1e-18
          ? THREE.MathUtils.clamp(
            (
              (camera.position.x - segmentStart[0]) * segmentX
              + (camera.position.y - segmentStart[1]) * segmentY
              + (camera.position.z - segmentStart[2]) * segmentZ
            ) / segmentLengthSq,
            0,
            1,
          )
          : 0;
        const closestSegmentX =
          segmentStart[0] + segmentX * segmentParameter;
        const closestSegmentY =
          segmentStart[1] + segmentY * segmentParameter;
        const closestSegmentZ =
          segmentStart[2] + segmentZ * segmentParameter;
        agentTheoryDepthDiagnostics.returnMaximumSegmentDeviation = Math.max(
          agentTheoryDepthDiagnostics.returnMaximumSegmentDeviation,
          Math.hypot(
            camera.position.x - closestSegmentX,
            camera.position.y - closestSegmentY,
            camera.position.z - closestSegmentZ,
          ),
        );
        const previousQuaternion = camera.quaternion.clone();
        camera.quaternion
          .copy(agentTheoryReturnOrientation.fromQuaternion)
          .slerp(
            agentTheoryReturnOrientation.toQuaternion,
            returnSample.progress,
          );
        camera.getWorldDirection(agentTheoryFreeLookDirection);
        const lookDistance = THREE.MathUtils.lerp(
          agentTheoryReturnOrientation.fromLookDistance,
          agentTheoryReturnOrientation.toLookDistance,
          returnSample.progress,
        );
        agentTheoryLookTarget
          .copy(camera.position)
          .addScaledVector(agentTheoryFreeLookDirection, lookDistance);
        agentTheoryCurrentLookTarget.copy(agentTheoryLookTarget);
        agentTheoryDepthCurrentP5 = THREE.MathUtils.lerp(
          agentTheoryReturnOrientation.fromDepth[0],
          agentTheoryReturnOrientation.toDepth[0],
          returnSample.progress,
        );
        agentTheoryDepthCurrentP50 = THREE.MathUtils.lerp(
          agentTheoryReturnOrientation.fromDepth[1],
          agentTheoryReturnOrientation.toDepth[1],
          returnSample.progress,
        );
        agentTheoryDepthCurrentP95 = THREE.MathUtils.lerp(
          agentTheoryReturnOrientation.fromDepth[2],
          agentTheoryReturnOrientation.toDepth[2],
          returnSample.progress,
        );
        camera.updateMatrixWorld(true);
        agentTheoryDepthDiagnostics.returnDirectionStepDegrees =
          THREE.MathUtils.radToDeg(
            previousQuaternion.angleTo(camera.quaternion),
          );
        finishAgentTheoryReturnProjection();
        const actualVisibility =
          measureAgentTheoryActualReturnVisibility(
            agentTheoryReturnUnionIndices,
            camera,
          );
        agentTheoryDepthDiagnostics.returnActualVisiblePaperCount =
          actualVisibility.paperCount;
        agentTheoryDepthDiagnostics.returnActualVisibleHotspotCount =
          actualVisibility.hotspotCount;
        agentTheoryDepthDiagnostics.returnActualVisibleHotspotCellCount =
          actualVisibility.hotspotCellCount;
        agentTheoryDepthDiagnostics.returnMinimumVisiblePaperCount =
          Math.min(
            agentTheoryDepthDiagnostics.returnMinimumVisiblePaperCount,
            actualVisibility.paperCount,
          );
        if (actualVisibility.paperCount <= 0) {
          agentTheoryDepthDiagnostics.returnBlackFrameCount += 1;
        }
        agentTheoryDepthDiagnostics.cameraMode = agentTheoryCameraMode;
        publishAgentTheoryReturnProgress(
          "returning-anchor",
          returnSample.progress,
        );
        if (returnSample.complete) {
          restoreAgentTheoryExploreAnchorProjection(
            agentTheoryExploreEntryAnchor,
          );
          camera.position.copy(agentTheoryExploreEntryAnchor.position);
          camera.quaternion.copy(agentTheoryExploreEntryAnchor.quaternion);
          camera.updateMatrixWorld(true);
          agentTheoryCurrentLookTarget.copy(
            agentTheoryExploreEntryAnchor.lookTarget,
          );
          agentTheoryLookTarget.copy(
            agentTheoryExploreEntryAnchor.lookTarget,
          );
          agentTheoryReturnTransition = null;
          beginAgentTheoryCruiseHealthAudit(performance.now());
        }
      } else if (
        visualProfile === "agent-theory"
        && interactionModeRef.current === "ambient"
        && exploration.state === "overview"
        && agentTheoryPerimeterProfile
        && agentTheoryCruiseCheckpoint
        && agentTheoryCameraMode === "cruise"
      ) {
        const cruiseSample = agentTheoryPreviousCruiseCheckpoint
          ? sampleInterpolatedAgentTheoryCruise(
            agentTheoryPerimeterProfile,
            agentTheoryPreviousCruiseCheckpoint,
            agentTheoryCruiseCheckpoint,
            agentTheoryCruiseInterpolationAlpha,
          )
          : sampleAgentTheoryCruise(
          agentTheoryPerimeterProfile,
          agentTheoryCruiseCheckpoint,
          );
        camera.position.fromArray(cruiseSample.position);
        if (agentTheoryPreviousCruiseCheckpoint) {
          const previousSample = sampleAgentTheoryCruise(
            agentTheoryPerimeterProfile,
            agentTheoryPreviousCruiseCheckpoint,
          );
          const currentSample = sampleAgentTheoryCruise(
            agentTheoryPerimeterProfile,
            agentTheoryCruiseCheckpoint,
          );
          const previousPosition = new THREE.Vector3().fromArray(
            previousSample.position,
          );
          const currentPosition = new THREE.Vector3().fromArray(
            currentSample.position,
          );
          const previousTarget = createAgentTheoryCruiseLookTarget(
            previousSample,
            agentTheoryCruiseViewTangentWeight
              ?? previousSample.tangentWeight,
            agentTheoryCruiseVerticalAimRatio,
            agentTheoryCruiseCenterBlend,
          );
          const currentTarget = createAgentTheoryCruiseLookTarget(
            currentSample,
            agentTheoryCruiseViewTangentWeight
              ?? currentSample.tangentWeight,
            agentTheoryCruiseVerticalAimRatio,
            agentTheoryCruiseCenterBlend,
          );
          agentTheoryCruiseOrientationProbe.up.copy(camera.up);
          agentTheoryCruiseOrientationProbe.position.copy(previousPosition);
          agentTheoryCruiseOrientationProbe.lookAt(previousTarget);
          agentTheoryCruisePreviousQuaternion.copy(
            agentTheoryCruiseOrientationProbe.quaternion,
          );
          agentTheoryCruiseOrientationProbe.position.copy(currentPosition);
          agentTheoryCruiseOrientationProbe.lookAt(currentTarget);
          agentTheoryCruiseCurrentQuaternion.copy(
            agentTheoryCruiseOrientationProbe.quaternion,
          );
          camera.quaternion
            .copy(agentTheoryCruisePreviousQuaternion)
            .slerp(
              agentTheoryCruiseCurrentQuaternion,
              agentTheoryCruiseInterpolationAlpha,
            );
          const lookDistance = THREE.MathUtils.lerp(
            previousPosition.distanceTo(previousTarget),
            currentPosition.distanceTo(currentTarget),
            agentTheoryCruiseInterpolationAlpha,
          );
          camera.updateMatrixWorld(true);
          camera.getWorldDirection(agentTheoryCruiseRenderDirection);
          agentTheoryLookTarget
            .copy(camera.position)
            .addScaledVector(
              agentTheoryCruiseRenderDirection,
              lookDistance,
            );
        } else {
          agentTheoryLookTarget.copy(createAgentTheoryCruiseLookTarget(
            cruiseSample,
            agentTheoryCruiseViewTangentWeight
              ?? cruiseSample.tangentWeight,
            agentTheoryCruiseVerticalAimRatio,
            agentTheoryCruiseCenterBlend,
          ));
          camera.lookAt(agentTheoryLookTarget);
          camera.updateMatrixWorld(true);
        }
        agentTheoryCurrentLookTarget.copy(agentTheoryLookTarget);
        agentTheoryDepthDiagnostics.ambientCamera = {
          active: !reduceMotion,
          azimuthOffsetDegrees: 0,
          elevationOffsetDegrees: 0,
          distanceOffsetRatio: 0,
          pausedReason: reduceMotion ? "reduced-motion" : undefined,
        };
        agentTheoryDepthDiagnostics.cameraMode = agentTheoryCameraMode;
        agentTheoryDepthDiagnostics.perimeterSector = cruiseSample.sectorIndex;
        agentTheoryDepthDiagnostics.perimeterSafetyMargin =
          cruiseSample.safetyMargin;
        agentTheoryDepthDiagnostics.visitedSectorRatio =
          cruiseSample.visitedSectorRatio;
        agentTheoryDepthDiagnostics.cruiseSpeed =
          new THREE.Vector3().fromArray(cruiseSample.velocity).length();
        agentTheoryDepthDiagnostics.cruiseAcceleration =
          new THREE.Vector3().fromArray(cruiseSample.acceleration).length();
        agentTheoryDepthDiagnostics.cruiseInterpolationAlpha =
          agentTheoryCruiseInterpolationAlpha;
        agentTheoryDepthDiagnostics.cruiseBacklogTruncationCount =
          agentTheoryCruiseBacklogTruncationCount;
        updateAgentTheoryPostReturnTrajectoryDiagnostics(
          performance.now(),
          "agent-theory-cruise",
        );
      } else {
        applyCameraOrbit(camera, orbit);
        agentTheoryCurrentLookTarget.copy(orbit.center);
        agentTheoryDepthDiagnostics.ambientCamera = {
          active: false,
          azimuthOffsetDegrees: 0,
          elevationOffsetDegrees: 0,
          distanceOffsetRatio: 0,
          pausedReason: reduceMotion
            ? "reduced-motion"
            : document.visibilityState === "hidden"
              ? "hidden"
              : interactionModeRef.current === "explore"
                ? "explore"
                : "interaction",
        };
        if (visualProfile === "agent-theory") {
          agentTheoryDepthDiagnostics.cameraMode = agentTheoryCameraMode;
        }
      }
      paperComposition.targetAnchorNdcX = 0;
      paperComposition.currentAnchorNdcX = 0;
      setPaperCameraWriter("orbit");
    };

    const calculateSystemEntryScale = (
      resources: GalaxySystemResources,
      renderHotspot: App17RenderPoint,
      topicKey: string,
    ) => {
      if (
        sceneData.kind === "app15"
        && (payload.paperLayoutScaleMode === "shared" || payload.paperLayoutVersion === APP17_NATURAL_LAYOUT_VERSION)
      ) {
        return normalizeEntryScale(APP15_COORD_SCALE / Math.max(1e-9, resources.coordinateScale));
      }
      const radii = sceneData.papers
        .filter((paper) => paper.topicKey === topicKey)
        .map((paper) => Math.hypot(
          paper.x - renderHotspot.position.x,
          paper.y - renderHotspot.position.y,
          (paper.z - renderHotspot.position.z) * cameraPreset.zScale,
        ))
        .sort((a, b) => a - b);
      const radiusIndex = Math.min(radii.length - 1, Math.max(0, Math.floor(radii.length * 0.95)));
      const overviewRadius = radii[radiusIndex] || APP17_SYSTEM_RADIUS * 0.12;
      return normalizeEntryScale(THREE.MathUtils.clamp(overviewRadius / APP17_SYSTEM_RADIUS, 0.045, 0.42));
    };

    const configureSystemEntry = (resources: GalaxySystemResources, renderHotspot: App17RenderPoint) => {
      const focusDistance = Math.max(0.1, camera.position.distanceTo(exploration.focusWorld));
      exploration.entryFocusDistance = focusDistance;
      const visibleWorldHeight = 2 * focusDistance * Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5) / Math.max(0.001, camera.zoom);
      const worldPerCssPixel = visibleWorldHeight / Math.max(1, height);
      const hotspotRadius = renderHotspot.displaySize * worldPerCssPixel * 0.5;
      resources.starEntryScale = THREE.MathUtils.clamp(hotspotRadius / APP17_SYSTEM_STAR_RADIUS, 0.08, 1.2);

      if (sceneData.kind === "app15") {
        exploration.systemDistance = fixedSystemReview
          ? APP17_SYSTEM_DISTANCE * resources.entryScale
          : resources.initialDistance * resources.entryScale;
      } else {
        const initialVisualScale = Math.max(resources.entryScale, resources.starEntryScale);
        const growthLimitedDistance = (focusDistance / Math.max(initialVisualScale, 0.001)) * 0.96;
        exploration.systemDistance = THREE.MathUtils.clamp(
          Math.min(resources.initialDistance, growthLimitedDistance),
          resources.minDistance * 1.4,
          resources.initialDistance,
        );
      }
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
      const farTransitionModeByTopic = new Map(
        resources.farBackgroundLayer?.plan.hotspots.map((hotspot) => [
          hotspot.topicKey,
          hotspot.transitionMode,
        ]) ?? [],
      );
      paperLayer.setTheoryFarTransitionModes(farTransitionModeByTopic);
      hotspotLayer.setTheoryFarTransitionModes(farTransitionModeByTopic);
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
      exploration.canonicalRebased = false;
      if (sceneData.kind === "app15") {
        systemResources.setRepresentativeEntryProgress(0);
        const positions = systemResources.representativePapers.map((paper) => paper.position);
        systemResources.representativeLayer?.setPointPositions(positions);
        systemResources.representativeBloomLayer?.setPointPositions(positions);
      }
      systemResources.root.scale.setScalar(normalizeEntryScale(systemResources.entryScale));
      systemResources.star.object.scale.setScalar(1);
      lastSystemEntryScale = normalizeEntryScale(systemResources.entryScale);
      lastSystemCanonicalRebaseProjectionDeltaPx = 0;
      lastFarBackgroundRebaseProjectionDeltaPx = 0;
      lastSystemEntrySelectedCenterDeltaPx = 0;
      lastSystemEntryCloudDiameterRatio = 1;
      lastSystemEntryNonSelectedWorldDrift = 0;
      lastSystemEntryCameraRayDeviation = 0;
      lastSystemEntryDistanceMonotonicViolations = 0;
      lastRepresentativeHandoffProjectionDeltaPx = 0;
      systemResources.representativeMaxLuminanceStep = 0;
      applyCameraOrbit(camera, orbit);
      systemEntryCameraStart.copy(camera.position);
      theoryEntryRayTarget.copy(exploration.focusWorld);
      theoryEntryRayDirection.copy(camera.position).sub(theoryEntryRayTarget);
      theoryEntryRayStartDistance = Math.max(0.001, theoryEntryRayDirection.length());
      if (theoryEntryRayDirection.lengthSq() < 1e-12) theoryEntryRayDirection.set(1, 0, 0);
      else theoryEntryRayDirection.normalize();
      theoryEntryRayEndDistance = exploration.systemDistance;
      previousSystemEntryHotspotDistance = theoryEntryRayStartDistance;
      captureTheoryWorldReference();
      orbit.viewMode = "system";
      clearAutoResumeTimer();
      transitionFrameTimes.length = 0;
      lastTransitionRenderTime = 0;
      beginTransitionLayoutDiagnostics();
      setExplorationState("entering");
      const directTheoryEntry = sceneData.kind === "app15";
      const entryAzimuth = directTheoryEntry
        ? Math.atan2(theoryEntryRayDirection.y, theoryEntryRayDirection.x)
        : fixedSystemReview ? Math.PI / 4 : orbit.azimuth;
      const entryElevation = directTheoryEntry
        ? Math.asin(THREE.MathUtils.clamp(theoryEntryRayDirection.z, -1, 1))
        : fixedSystemReview ? THREE.MathUtils.degToRad(26) : APP17_SYSTEM_ELEVATION;
      startOrbitTransition(
        orbit,
        "enter-system",
        exploration.focusWorld,
        exploration.systemDistance,
        entryAzimuth,
        entryElevation,
        now,
        APP17_SYSTEM_TRANSITION_MS,
        undefined,
        undefined,
        true,
        directTheoryEntry
          ? {
              target: theoryEntryRayTarget,
              direction: theoryEntryRayDirection,
              startDistance: theoryEntryRayStartDistance,
              endDistance: theoryEntryRayEndDistance,
            }
          : undefined,
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
          farBackgroundPayload,
          payloadHotspot,
          representativePapersRef.current,
          currentPixelRatio,
          systemVisualMode,
          farBackgroundRenderHotspots,
          visualProfile,
        );
        const renderHotspot = hotspotById.get(hotspotId);
        if (renderHotspot) {
          resources.entryScale = calculateSystemEntryScale(
            resources,
            renderHotspot,
            topicKeyFromHotspot(payloadHotspot),
          );
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
        if (systemResources === prepared.resources) {
          applyExplorationBlend(exploration.blend);
          if (sceneData.kind === "app15" && exploration.state === "system") {
            prepared.resources.startRepresentativeSettle();
          }
        }
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
      hotspotLayer.setAmbientState(
        ambientTimeSeconds,
        rotationAngle,
        ambientStrength,
        overviewAmbientActive() ? 1 : 0,
      );
      systemResources?.farBackgroundLayer?.setAnimation(
        ambientTimeSeconds,
        ambientStrength,
      );
      orbitLayer?.setExploration(
        smoothStepRange(0, 0.78, exploration.blend),
        exploration.focusLocal,
        rotationAngle,
      );
    };

    function overviewTheoryFarBlend() {
      if (
        sceneData.kind !== "app15"
        || visualProfile === "agent-theory"
        || exploration.state !== "overview"
        || cameraPreset.maxDistance <= cameraPreset.distance
      ) return 0;
      return smoothStepRange(
        cameraPreset.distance,
        cameraPreset.maxDistance,
        orbit.distance,
      );
    }

    const applyOverviewDistanceLod = () => {
      const farBlend = overviewTheoryFarBlend();
      paperLayer.setOverviewFarBlend(farBlend);
      hotspotLayer.setOverviewFarBlend(farBlend);
    };

    const captureTheoryWorldReference = () => {
      if (sceneData.kind !== "app15") {
        theoryWorldReference = [];
        return;
      }
      const references: typeof theoryWorldReference = [];
      const paperStride = Math.max(1, Math.floor(sceneData.papers.length / 48));
      for (let index = 0; index < sceneData.papers.length && references.length < 48; index += paperStride) {
        const point = sceneData.papers[index];
        references.push({ kind: "paper", index, x: point.x, y: point.y, z: point.z });
      }
      const hotspotStride = Math.max(1, Math.floor(sceneData.hotspots.length / 16));
      for (let index = 0; index < sceneData.hotspots.length && references.length < 64; index += hotspotStride) {
        const point = sceneData.hotspots[index].position;
        references.push({ kind: "hotspot", index, x: point.x, y: point.y, z: point.z });
      }
      theoryWorldReference = references;
    };

    const measureTheoryWorldDrift = () => {
      let maximum = 0;
      for (const reference of theoryWorldReference) {
        const point = reference.kind === "paper"
          ? sceneData.papers[reference.index]
          : sceneData.hotspots[reference.index]?.position;
        if (!point) continue;
        const x = reference.kind === "paper" ? point.x : point.x;
        const y = reference.kind === "paper" ? point.y : point.y;
        const z = reference.kind === "paper" ? point.z : point.z;
        maximum = Math.max(
          maximum,
          Math.hypot(x - reference.x, y - reference.y, z - reference.z),
        );
      }
      lastSystemEntryNonSelectedWorldDrift = maximum;
      return maximum;
    };

    const performTheoryCanonicalRebase = (toCanonical: boolean) => {
      if (
        sceneData.kind !== "app15"
        || !systemResources
        || exploration.canonicalRebased === toCanonical
      ) return;
      const entryScale = normalizeEntryScale(systemResources.entryScale);
      const sample = systemResources.cloudLayer.getPaperByIndex(0)?.position.clone()
        ?? new THREE.Vector3(APP17_SYSTEM_RADIUS, 0, 0);
      applyCameraOrbit(camera, orbit);
      systemResources.root.updateMatrixWorld(true);
      const beforeCenter = exploration.focusWorld.clone().project(camera);
      const beforeSample = sample.clone().applyMatrix4(systemResources.root.matrixWorld).project(camera);
      const farSample = systemResources.farBackgroundLayer?.getSamplePosition();
      const beforeFarSample = farSample
        ?.clone()
        .applyMatrix4(systemResources.root.matrixWorld)
        .project(camera);
      const beforeRadius = Math.hypot(
        (beforeSample.x - beforeCenter.x) * width * 0.5,
        (beforeSample.y - beforeCenter.y) * height * 0.5,
      );

      systemResources.root.scale.setScalar(toCanonical ? 1 : entryScale);
      orbit.distance = distanceAfterSimilarityRebase(orbit.distance, entryScale, toCanonical);
      orbit.targetDistance = distanceAfterSimilarityRebase(orbit.targetDistance, entryScale, toCanonical);
      exploration.systemDistance = toCanonical
        ? fixedSystemReview ? APP17_SYSTEM_DISTANCE : systemResources.initialDistance
        : (fixedSystemReview ? APP17_SYSTEM_DISTANCE : systemResources.initialDistance) * entryScale;
      exploration.canonicalRebased = toCanonical;
      applyCameraOrbit(camera, orbit);
      systemResources.root.updateMatrixWorld(true);

      const afterCenter = exploration.focusWorld.clone().project(camera);
      const afterSample = sample.clone().applyMatrix4(systemResources.root.matrixWorld).project(camera);
      const afterFarSample = farSample
        ?.clone()
        .applyMatrix4(systemResources.root.matrixWorld)
        .project(camera);
      const afterRadius = Math.hypot(
        (afterSample.x - afterCenter.x) * width * 0.5,
        (afterSample.y - afterCenter.y) * height * 0.5,
      );
      lastSystemCanonicalRebaseProjectionDeltaPx = Math.hypot(
        (afterSample.x - beforeSample.x) * width * 0.5,
        (afterSample.y - beforeSample.y) * height * 0.5,
      );
      lastSystemEntrySelectedCenterDeltaPx = Math.hypot(
        (afterCenter.x - beforeCenter.x) * width * 0.5,
        (afterCenter.y - beforeCenter.y) * height * 0.5,
      );
      lastSystemEntryCloudDiameterRatio = beforeRadius > 1e-9 ? afterRadius / beforeRadius : 1;
      lastFarBackgroundRebaseProjectionDeltaPx = beforeFarSample && afterFarSample
        ? Math.hypot(
            (afterFarSample.x - beforeFarSample.x) * width * 0.5,
            (afterFarSample.y - beforeFarSample.y) * height * 0.5,
          )
        : 0;
      systemCanonicalRebaseCount += 1;
    };

    const updateTheoryFarBackgroundMask = () => {
      const layer = systemResources?.farBackgroundLayer;
      if (!layer || !systemResources) return;
      systemResources.root.updateMatrixWorld(true);
      const centerWorld = new THREE.Vector3().setFromMatrixPosition(systemResources.root.matrixWorld);
      const centerNdc3 = centerWorld.clone().project(camera);
      systemResources.root.getWorldScale(systemWorldScale);
      const worldP95Radius = systemResources.cloudP95Radius * Math.max(
        systemWorldScale.x,
        systemWorldScale.y,
        systemWorldScale.z,
      );
      const focusDistance = Math.max(0.001, camera.position.distanceTo(centerWorld));
      const projectedP95RadiusNdc = worldP95Radius
        * camera.zoom
        / (focusDistance * Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5));
      const mask = resolveGalaxyFarBackgroundMask(projectedP95RadiusNdc);
      layer.setMask(
        new THREE.Vector2(centerNdc3.x, centerNdc3.y),
        mask.innerRadiusNdc,
        mask.outerRadiusNdc,
      );
    };

    const applyExplorationBlend = (blend: number) => {
      exploration.blend = THREE.MathUtils.clamp(blend, 0, 1);
      const theoryMode = sceneData.kind === "app15";
      const retreatProgress = theoryMode
        ? exploration.blend
        : smoothStepRange(0, 0.78, exploration.blend);
      const systemFade = theoryMode
        ? smoothStepRange(0.76, 1, exploration.blend)
        : smoothStepRange(0.2, 0.78, exploration.blend);
      const systemRevealProgress = smoothStepRange(
        APP17_SYSTEM_PAPER_REVEAL_START,
        APP17_SYSTEM_PAPER_REVEAL_END,
        exploration.blend,
      );
      overviewSelectedTopicOpacity = 1 - systemFade;
      systemCloudOpacity = systemFade;
      const systemExpansion = smoothStepRange(0.16, 0.94, exploration.blend);
      const starExpansion = smoothStepRange(0.28, 0.88, exploration.blend);
      overviewRoot.visible = !theoryMode || exploration.blend < 1 - 1e-9;
      overviewRoot.scale.setScalar(1);
      overviewRoot.position.set(0, 0, 0);
      paperLayer.setExplorationProgress(retreatProgress, overviewSelectedTopicOpacity);
      hotspotLayer.setExplorationProgress(retreatProgress);
      agentTheoryDecorativeLayer?.setOpacity(
        THREE.MathUtils.lerp(1, 0.38, systemFade),
      );
      applyAmbientVisuals();
      if (systemResources) {
        if (theoryMode && exploration.state === "entering") {
          systemResources.setRepresentativeEntryProgress(exploration.blend);
        }
        systemResources.farBackgroundLayer?.setProgress(exploration.blend);
        if (theoryMode) {
          const systemScale = exploration.canonicalRebased
            ? 1
            : normalizeEntryScale(systemResources.entryScale);
          systemResources.root.scale.setScalar(systemScale);
          systemResources.star.object.scale.setScalar(1);
        } else {
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
        }
        systemResources.cloudLayer.setRevealProgress(systemRevealProgress);
        setGalaxySystemOpacity(systemResources, systemFade);
        if (theoryMode) {
          // The overview remains a compact stellar PSF. A true photosphere is
          // introduced only during the final 400ms of the two-second system
          // entry (and removed along the same interval on exit).
          systemResources.star.setOpacity(
            smoothStepRange(0.80, 1.0, exploration.blend),
          );
        }
        if (systemResources.farBackgroundLayer?.hasVisibleProxy()) {
          systemResources.root.visible = true;
        }
      }
      focusSprite.visible = (
        exploration.blend < 0.02
        && Boolean(selectedIdRef.current)
        && !(
          visualProfile === "agent-theory"
          && (agentTheoryFocusVisualRef.current?.blend ?? 0) > 0.001
        )
      );
    };

    const beginEnterSystem = (now: number) => {
      const selectedHotspotId = selectedIdRef.current;
      if (exploration.state === "entering" || exploration.state === "exiting") {
        queuedEnterHotspotId = selectedHotspotId;
        return;
      }
      if (
        visualProfile === "agent-theory"
        && agentTheoryCameraMode === "explore-free"
        && exploration.state === "overview"
      ) {
        captureAgentTheoryFreeLookFromCamera();
        agentTheorySavedFreeLookPose = {
          position: agentTheoryFreeLookPosition.clone(),
          direction: agentTheoryFreeLookDirection.clone(),
        };
        agentTheoryCurrentLookTarget
          .copy(agentTheoryFreeLookPosition)
          .addScaledVector(
            agentTheoryFreeLookDirection,
            Math.max(
              camera.near * 4,
              agentTheoryPerimeterProfile?.medianRadius ?? 1,
            ),
          );
        absorbAgentTheoryCameraIntoOrbit(agentTheoryCurrentLookTarget);
      }
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
      const reversingTheoryEntry = sceneData.kind === "app15"
        && exploration.state === "entering"
        && orbit.transition?.kind === "enter-system";
      if (exploration.state === "preparing") {
        cancelScheduledPreparation(true);
        invalidate(true);
        return;
      }
      if (paperJourney.getState() !== "idle") {
        pendingPaperJourneyAction = "exit-system";
        returnToSystemCenter(now);
        return;
      }
      if (sceneData.kind === "app15" && exploration.canonicalRebased) {
        performTheoryCanonicalRebase(false);
      }
      if (sceneData.kind === "app15" && systemResources) {
        systemResources.startRepresentativeExit();
      }
      const saved = exploration.savedOverviewPose ?? {
        center: cameraPreset.center.clone(),
        distance: cameraPreset.distance,
        azimuth: cameraPreset.azimuth,
        elevation: cameraPreset.elevation,
      };
      exploration.fromBlend = exploration.blend;
      exploration.toBlend = 0;
      applyCameraOrbit(camera, orbit);
      const currentCameraPosition = camera.position.clone();
      const savedCameraPosition = orbitPoseCameraPosition(saved);
      const directExitCameraPath = sceneData.kind === "app15" && !reversingTheoryEntry
        ? {
            from: currentCameraPosition,
            to: savedCameraPosition,
            control: currentCameraPosition.clone().lerp(savedCameraPosition, 0.5),
          }
        : undefined;
      const reverseEntryRayPath = reversingTheoryEntry
        ? {
            target: theoryEntryRayTarget,
            direction: theoryEntryRayDirection,
            startDistance: Math.max(0.001, currentCameraPosition.distanceTo(theoryEntryRayTarget)),
            endDistance: theoryEntryRayStartDistance,
          }
        : undefined;
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
        undefined,
        directExitCameraPath,
        true,
        reverseEntryRayPath,
      );
    };

    const resetSystemView = (now: number) => {
      if (exploration.state !== "system") return;
      if (paperJourney.getState() !== "idle") {
        pendingPaperJourneyAction = "reset-system";
        returnToSystemCenter(now);
        return;
      }
      startOrbitTransition(
        orbit,
        "reset-system",
        exploration.focusWorld,
        fixedSystemReview ? APP17_SYSTEM_DISTANCE : exploration.systemDistance,
        Math.PI / 4,
        fixedSystemReview ? THREE.MathUtils.degToRad(26) : APP17_SYSTEM_ELEVATION,
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
        haloColor: app17HotspotFamilyColor(systemResources.hotspot),
        source: metadata?.source ?? representativePaper?.source,
        representative: metadata?.representative ?? Boolean(representativePaper),
        representativeRank: representativePaper?.rank ?? -1,
        displaySize: representativePaper?.displaySize ?? ordinaryPaper?.displaySize ?? 1,
        visualSizeVariation: ordinaryPaper?.visualSizeVariation ?? 1,
      };
    };

    const configurePaperInspectionVisual = (paperId = paperJourney.getTargetId()) => {
      const visual = resolveSystemPaperVisual(paperId);
      if (!visual) return;
      paperPresentation.visualType = visualProfile === "agent-theory"
        ? "photosphere"
        : visual.representative
          ? "energy-core"
          : "data-sphere";
      paperInspectionVisual.configure({
        paperId,
        bodyColor: visual.color,
        haloColor: visual.haloColor,
        source: visual.source,
        representative: visual.representative,
        representativeRank: visual.representativeRank,
      });
    };
    inspectionMetadataControllerRef.current = configurePaperInspectionVisual;

    const applyPaperJourneySceneFrame = (frame: GalaxyPaperJourneyFrame) => {
      const blend = THREE.MathUtils.clamp(frame.focusBlend, 0, 1);
      const inspectionBlend = THREE.MathUtils.clamp(frame.visualOwnerOpacity, 0, 1);
      const targetId = frame.targetId;
      if (!systemResources) return;
      const targetPosition = targetId ? resolveSystemPaperPosition(targetId) : undefined;
      const flightStrength = frame.state === "flying-in" || frame.state === "flying-out"
        ? Math.sin(Math.PI * frame.journeyProgress)
        : 0;
      const activeCameraDistance = frame.targetWorldPosition
        ? camera.position.distanceTo(frame.targetWorldPosition)
        : orbit.distance;
      systemResources.cloudLayer.setPaperFocus(
        targetId,
        targetPosition,
        blend,
        inspectionBlend,
        flightStrength,
        activeCameraDistance,
      );
      systemResources.representativeLayer?.setPaperFocus(
        targetId,
        targetPosition,
        blend,
        inspectionBlend,
        flightStrength,
        activeCameraDistance,
      );
      const targetRank = systemResources.representativePapers.findIndex((paper) => paper.id === targetId);
      systemResources.representativeBloomLayer?.setPaperFocusBlend(
        blend,
        inspectionBlend,
        targetRank,
      );
      systemResources.orbitLayer?.setPaperFocus(
        blend,
        targetRank,
        inspectionBlend,
      );
      systemResources.star.setFocusAttenuation(1);
      const targetLayerState = targetRank >= 0
        ? systemResources.representativeLayer?.getVisualState()
        : systemResources.cloudLayer.getVisualState();
      paperPresentation.targetScreenSize = paperInspectionVisual.getVisualState().projectedDiameter
        || targetLayerState?.paperFocusTargetScreenSize
        || 0;
      const nextNear = frame.state !== "idle" ? 0.02 : 0.1;
      if (Math.abs(camera.near - nextNear) > 0.001) {
        camera.near = nextNear;
        camera.updateProjectionMatrix();
      }
    };

    const finishPaperFocusReset = () => {
      paperJourney.reset();
      paperJourneyFrame = paperJourney.getFrame();
      applyPaperJourneySceneFrame(paperJourneyFrame);
      paperFocusWorldPosition = null;
      lastPaperFlightPathMode = "none";
      lastPaperCameraDistance = 0;
      lastPaperCenterErrorPx = 0;
      lastPaperStarClearance = 0;
      lastPaperStarSafeRadius = 0;
      lastPaperHandoffAlphaSum = 1;
      lastPaperHandoffPositionDeltaPx = 0;
      lastPaperTargetWorldPositionDrift = 0;
      lastPaperPointCoreDiameter = 0;
      lastPaperDedicatedCoreDiameter = 0;
      lastPaperPointAlpha = 1;
      lastPaperDedicatedAlpha = 0;
      lastPaperVisibleEnergyRatio = 1;
      paperPresentation.mode = "none";
      paperPresentation.visualType = "none";
      paperPresentation.panelState = "hidden";
      paperPresentation.startDistance = 0;
      paperPresentation.targetScreenSize = 0;
      paperPresentation.systemPointDiameter = APP17_SYSTEM_PAPER_FOCUS_ORDINARY_SIZE;
      paperPresentation.compactOpticalDiameter = APP17_SYSTEM_PAPER_FOCUS_ORDINARY_SIZE;
      paperPresentation.worldDiameter = APP17_PAPER_INSPECTION_WORLD_DIAMETER;
      paperPresentation.targetBodyDiameterPx = APP17_REPRESENTATIVE_BODY_CORE_MIN_DIAMETER_PX;
      paperPresentation.representativeCarrierRatio = 0;
      paperPresentation.endpointStarExitMarginPx = 0;
      paperPresentation.endpointCandidateCount = 0;
      paperPresentation.endpointDirectionDeviationDegrees = 0;
      paperPresentation.endpointCompositionRejected = false;
      paperInspectionMotionStrength = 0;
      paperInspectionVisual.object.visible = false;
      paperComposition.targetAnchorNdcX = 0;
      paperComposition.currentAnchorNdcX = 0;
      paperComposition.anchorErrorPx = 0;
      paperComposition.panelHeaderProgress = 0;
      paperComposition.panelBodyProgress = 0;
      setPaperCameraWriter("orbit");
      paperComposition.returnHorizontalReversals = 0;
      paperComposition.lastReturnScreenX = Number.NaN;
      paperComposition.lastReturnDirection = 0;
      onPaperInspectionModeChangeRef.current?.("none", "");
      onPaperPanelStateChangeRef.current?.("hidden", "");
      camera.near = sceneData.kind === "app15"
        ? Math.max(0.001, Math.min(0.02, cameraPreset.minDistance * 0.04))
        : 0.1;
      if (sceneData.kind === "app15" && cameraPreset.theoryFraming) {
        camera.far = Math.max(
          240,
          cameraPreset.maxDistance + cameraPreset.theoryFraming.maxRadius * 4,
        );
      }
      camera.updateProjectionMatrix();
      savedSystemPose = null;
      paperFocusTargetDistance = 0;
      setSystemViewMode("system");
      setPaperFocusState("idle", "");
    };

    const paperVisualIsolation = import.meta.env.DEV
      ? new URLSearchParams(window.location.search).get("paper-visual")
      : null;
    const paperFlightPixelTraceEnabled = import.meta.env.DEV
      && new URLSearchParams(window.location.search).get("paper-trace") === "1";
    let paperPixelReadback = new Uint8Array(0);
    let paperPixelReadbackFailed = false;
    let pendingPaperFlightTracePhase: "focus" | "return" | null = null;
    let paperFlightTracePublishAt = 0;

    const resetPaperFlightTrace = () => {
      if (!import.meta.env.DEV) return;
      (window as GalaxyPaperFlightTraceWindow).__APP17_PAPER_FLIGHT_TRACE__ = [];
      delete renderer.domElement.dataset.paperFlightTrace;
      delete renderer.domElement.dataset.paperFlightTracePhase;
      paperFlightTracePublishAt = 0;
    };

    const publishPaperFlightTrace = (phase: "focus" | "return") => {
      if (!import.meta.env.DEV) return;
      const samples = (window as GalaxyPaperFlightTraceWindow).__APP17_PAPER_FLIGHT_TRACE__ ?? [];
      renderer.domElement.dataset.paperFlightTrace = JSON.stringify(samples);
      renderer.domElement.dataset.paperFlightTracePhase = phase;
    };

    const recordPaperFlightTrace = (
      now: number,
      inspectionProjectedDiameter: number,
      actualBodyDiameterPx: number,
      projectedPaper: THREE.Vector3,
      visibleCore: GalaxyPaperVisibleCoreMetrics | null,
      visualMorph: {
        ordinarySurfaceMorph: number;
        ordinaryAtmosphereMorph: number;
        handoffDiameterRatio: number;
        representativeCarrierEdgeLeak: number;
      },
    ) => {
      if (!import.meta.env.DEV) return;
      if (!paperJourney.isMoving() && pendingPaperFlightTracePhase === null) return;
      const traceWindow = window as GalaxyPaperFlightTraceWindow;
      const samples = traceWindow.__APP17_PAPER_FLIGHT_TRACE__ ?? [];
      const cameraToPaperDistance = paperFocusWorldPosition
        ? camera.position.distanceTo(paperFocusWorldPosition)
        : 0;
      let cameraToStarDistance = 0;
      let starToPaperDistance = 0;
      let starProjectedDiameter = 0;
      let starViewportRatio = 0;
      let starScreenX = 0;
      let starScreenY = 0;
      let starFocusAttenuation = 1;
      let starInFrustum = false;
      let starDrawCalls = 0;
      let starViewDepth = 0;
      if (systemResources) {
        systemResources.star.object.updateMatrixWorld(true);
        const starCenter = new THREE.Vector3().setFromMatrixPosition(systemResources.star.object.matrixWorld);
        const starVisualState = systemResources.star.getVisualState();
        cameraToStarDistance = camera.position.distanceTo(starCenter);
        starToPaperDistance = paperFocusWorldPosition?.distanceTo(starCenter) ?? 0;
        starProjectedDiameter = starVisualState.projectedDiameter;
        starViewportRatio = starVisualState.viewportRatio;
        starFocusAttenuation = starVisualState.focusAttenuation;
        starDrawCalls = starVisualState.drawCalls;
        systemResources.star.object.getWorldPosition(paperTraceStarWorldPosition);
        paperTraceStarProjectedPosition.copy(paperTraceStarWorldPosition).project(camera);
        starScreenX = paperTraceStarProjectedPosition.x * width * 0.5;
        starScreenY = -paperTraceStarProjectedPosition.y * height * 0.5;
        starInFrustum = systemResources.star.object.visible
          && Math.abs(paperTraceStarProjectedPosition.x) <= 1
          && Math.abs(paperTraceStarProjectedPosition.y) <= 1
          && paperTraceStarProjectedPosition.z >= -1
          && paperTraceStarProjectedPosition.z <= 1;
        starViewDepth = -paperTraceStarWorldPosition.clone().applyMatrix4(camera.matrixWorldInverse).z;
      }
      const canvasRect = renderer.domElement.getBoundingClientRect();
      const projectedScreenX = projectedPaper.x * width * 0.5;
      if (
        paperJourneyFrame.state === "flying-out"
        && paperJourneyFrame.journeyProgress >= 1 - 300 / APP17_SYSTEM_PAPER_RETURN_TRANSITION_MS
      ) {
        if (!Number.isFinite(paperComposition.lastReturnScreenX)) {
          paperComposition.lastReturnScreenX = projectedScreenX;
        } else {
          const horizontalDelta = projectedScreenX - paperComposition.lastReturnScreenX;
          if (Math.abs(horizontalDelta) >= APP17_SYSTEM_PAPER_RETURN_DIRECTION_NOISE_PX) {
            const direction = Math.sign(horizontalDelta);
            if (
              paperComposition.lastReturnDirection !== 0
              && direction !== paperComposition.lastReturnDirection
            ) {
              paperComposition.returnHorizontalReversals += 1;
            }
            paperComposition.lastReturnDirection = direction;
            paperComposition.lastReturnScreenX = projectedScreenX;
          }
        }
      }
      samples.push({
        timestamp: now,
        targetId: paperJourneyFrame.targetId,
        visualType: paperPresentation.visualType,
        focusState: publishedPaperFocusState,
        pathMode: lastPaperFlightPathMode,
        cameraWriter: paperComposition.cameraWriter,
        ownerState: journeyOwnerState(paperJourneyFrame.state),
        ownerOpacity: paperJourneyFrame.visualOwnerOpacity,
        compactLod: paperJourneyFrame.inspectionLod,
        systemPointDiameter: paperPresentation.systemPointDiameter,
        inspectionProjectedDiameter,
        projectedTargetDiameter: paperJourneyFrame.projectedTargetDiameter,
        cameraTravelDistance: paperJourneyFrame.cameraTravelDistance,
        cameraDistanceToTarget: paperJourneyFrame.cameraDistanceToTarget,
        targetWorldPositionDrift: Math.max(
          paperJourneyFrame.targetWorldPositionDrift,
          lastPaperTargetWorldPositionDrift,
        ),
        minimumStarClearance: paperJourneyFrame.minimumStarClearance,
        starSafeRadius: lastPaperStarSafeRadius,
        smoothnessExtensionMs: paperJourneyFrame.smoothnessExtensionMs,
        returnPositionError: paperJourneyFrame.returnPositionError,
        returnAngleErrorDegrees: paperJourneyFrame.returnAngleErrorDegrees,
        pointCoreDiameter: lastPaperPointCoreDiameter,
        dedicatedCoreDiameter: lastPaperDedicatedCoreDiameter,
        pointAlpha: lastPaperPointAlpha,
        dedicatedAlpha: lastPaperDedicatedAlpha,
        visibleEnergyRatio: lastPaperVisibleEnergyRatio,
        screenX: projectedScreenX,
        screenY: -projectedPaper.y * height * 0.5,
        anchorErrorPx: paperComposition.anchorErrorPx,
        quaternionDeltaDegrees: lastPaperQuaternionDeltaDegrees,
        cameraWriterChanges: paperComposition.cameraWriterChangesThisFrame,
        canvasResizeCount: transitionCanvasResizeCount,
        returnHorizontalReversals: paperComposition.returnHorizontalReversals,
        visibleCoreDiameter: visibleCore?.diameter ?? 0,
        visibleCoreX: visibleCore?.x ?? 0,
        visibleCoreY: visibleCore?.y ?? 0,
        visibleCoreEnergy: visibleCore?.energy ?? 0,
        cameraToPaperDistance,
        cameraToStarDistance,
        starToPaperDistance,
        starProjectedDiameter,
        starViewportRatio,
        starScreenX,
        starScreenY,
        starFocusAttenuation,
        starInFrustum,
        starDrawCalls,
        starViewDepth,
        handoffAlphaSum: lastPaperHandoffAlphaSum,
        handoffPositionDeltaPx: lastPaperHandoffPositionDeltaPx,
        visibleTargetObjectCount: Number(lastPaperPointAlpha > 0.001)
          + Number(lastPaperDedicatedAlpha > 0.001),
        canvasTop: canvasRect.top,
        canvasWidth: canvasRect.width,
        canvasHeight: canvasRect.height,
        pageScrollY: window.scrollY,
        targetBodyDiameterPx: paperPresentation.targetBodyDiameterPx,
        actualBodyDiameterPx,
        representativeCarrierRatio: paperPresentation.representativeCarrierRatio,
        endpointStarExitMarginPx: paperPresentation.endpointStarExitMarginPx,
        endpointCandidateCount: paperPresentation.endpointCandidateCount,
        endpointDirectionDeviationDegrees: paperPresentation.endpointDirectionDeviationDegrees,
        endpointCompositionRejected: paperPresentation.endpointCompositionRejected,
        cameraRayLateralDeviation: paperJourneyFrame.cameraRayLateralDeviation,
        targetScreenStepPx: paperJourneyFrame.targetScreenStepPx,
        targetScreenReversals: paperJourneyFrame.targetScreenReversals,
        cameraQuaternionStepDegrees: paperJourneyFrame.cameraQuaternionStepDegrees,
        progressStep: paperJourneyFrame.progressStep,
        resolvedReadingDistance: paperJourneyFrame.resolvedReadingDistance,
        readingDistanceRelaxation: paperJourneyFrame.readingDistanceRelaxation,
        ordinarySurfaceMorph: visualMorph.ordinarySurfaceMorph,
        ordinaryAtmosphereMorph: visualMorph.ordinaryAtmosphereMorph,
        handoffDiameterRatio: visualMorph.handoffDiameterRatio,
        representativeCarrierEdgeLeak: visualMorph.representativeCarrierEdgeLeak,
      });
      if (samples.length > 720) samples.splice(0, samples.length - 720);
      traceWindow.__APP17_PAPER_FLIGHT_TRACE__ = samples;
      if (paperFlightPixelTraceEnabled) {
        renderer.domElement.dataset.paperFlightTrace = JSON.stringify(samples);
      }
    };

    const measurePaperVisibleCore = (
      projectedPaper: THREE.Vector3,
      inspectionProjectedDiameter: number,
    ): GalaxyPaperVisibleCoreMetrics | null => {
      if (!paperFlightPixelTraceEnabled || paperPixelReadbackFailed) return null;
      const canvas = renderer.domElement;
      const bufferWidth = canvas.width;
      const bufferHeight = canvas.height;
      if (bufferWidth < 2 || bufferHeight < 2 || width < 2 || height < 2) return null;
      const scaleX = bufferWidth / width;
      const scaleY = bufferHeight / height;
      const centerX = (projectedPaper.x * 0.5 + 0.5) * bufferWidth;
      const centerY = (projectedPaper.y * 0.5 + 0.5) * bufferHeight;
      const radiusCss = THREE.MathUtils.clamp(
        Math.max(18, inspectionProjectedDiameter * 0.12),
        18,
        72,
      );
      const radiusX = Math.max(2, Math.ceil(radiusCss * scaleX));
      const radiusY = Math.max(2, Math.ceil(radiusCss * scaleY));
      const x = Math.max(0, Math.floor(centerX - radiusX));
      const y = Math.max(0, Math.floor(centerY - radiusY));
      const sampleWidth = Math.min(bufferWidth - x, radiusX * 2 + 1);
      const sampleHeight = Math.min(bufferHeight - y, radiusY * 2 + 1);
      if (sampleWidth < 2 || sampleHeight < 2) return null;
      const analysisRadiusCss = THREE.MathUtils.clamp(
        inspectionProjectedDiameter * 0.12,
        4,
        40,
      );
      const radialEnvelopeAt = (px: number, py: number) => {
        const dx = (x + px + 0.5 - centerX) / scaleX;
        const dy = (y + py + 0.5 - centerY) / scaleY;
        const normalizedRadius = Math.sqrt(dx * dx + dy * dy) / analysisRadiusCss;
        return 1 - THREE.MathUtils.smoothstep(normalizedRadius, 0.72, 1);
      };
      const requiredLength = sampleWidth * sampleHeight * 4;
      if (paperPixelReadback.length < requiredLength) paperPixelReadback = new Uint8Array(requiredLength);
      const pixels = paperPixelReadback.subarray(0, requiredLength);
      try {
        const gl = renderer.getContext();
        gl.readPixels(x, y, sampleWidth, sampleHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      } catch (error) {
        paperPixelReadbackFailed = true;
        console.warn("[app17] paper pixel trace readback failed", error);
        return null;
      }

      let peak = 0;
      let borderSum = 0;
      let borderCount = 0;
      for (let py = 0; py < sampleHeight; py += 1) {
        for (let px = 0; px < sampleWidth; px += 1) {
          const offset = (py * sampleWidth + px) * 4;
          const luminance = (
            pixels[offset] * 0.2126
            + pixels[offset + 1] * 0.7152
            + pixels[offset + 2] * 0.0722
          ) / 255;
          if (radialEnvelopeAt(px, py) > 0) peak = Math.max(peak, luminance);
          if (px < 2 || py < 2 || px >= sampleWidth - 2 || py >= sampleHeight - 2) {
            borderSum += luminance;
            borderCount += 1;
          }
        }
      }
      const background = borderCount > 0 ? borderSum / borderCount : 0;
      const contrast = peak - background;
      if (contrast < 0.025) return null;
      const coreWeightForLuminance = (luminance: number) => {
        const normalized = THREE.MathUtils.clamp((luminance - background) / contrast, 0, 1);
        const softCore = THREE.MathUtils.smoothstep(normalized, 0.12, 0.88);
        return softCore * softCore * contrast;
      };
      let weightedX = 0;
      let weightedY = 0;
      let totalWeight = 0;
      for (let py = 0; py < sampleHeight; py += 1) {
        for (let px = 0; px < sampleWidth; px += 1) {
          const offset = (py * sampleWidth + px) * 4;
          const luminance = (
            pixels[offset] * 0.2126
            + pixels[offset + 1] * 0.7152
            + pixels[offset + 2] * 0.0722
          ) / 255;
          const weight = coreWeightForLuminance(luminance) * radialEnvelopeAt(px, py);
          if (weight <= 0) continue;
          weightedX += (x + px + 0.5) * weight;
          weightedY += (y + py + 0.5) * weight;
          totalWeight += weight;
        }
      }
      if (totalWeight <= 0) return null;
      const centroidBufferX = weightedX / totalWeight;
      const centroidBufferY = weightedY / totalWeight;
      let radialMoment = 0;
      for (let py = 0; py < sampleHeight; py += 1) {
        for (let px = 0; px < sampleWidth; px += 1) {
          const offset = (py * sampleWidth + px) * 4;
          const luminance = (
            pixels[offset] * 0.2126
            + pixels[offset + 1] * 0.7152
            + pixels[offset + 2] * 0.0722
          ) / 255;
          const weight = coreWeightForLuminance(luminance) * radialEnvelopeAt(px, py);
          if (weight <= 0) continue;
          const dx = (x + px + 0.5 - centroidBufferX) / scaleX;
          const dy = (y + py + 0.5 - centroidBufferY) / scaleY;
          radialMoment += (dx * dx + dy * dy) * weight;
        }
      }
      const rmsRadius = Math.sqrt(Math.max(0, radialMoment / totalWeight));
      return {
        // Energy moments remain continuous when a subpixel core crosses the
        // raster grid, unlike counting pixels above a hard threshold.
        diameter: rmsRadius * 2.4,
        x: centroidBufferX / scaleX,
        y: height - centroidBufferY / scaleY,
        energy: totalWeight / Math.max(0.0001, scaleX * scaleY),
      };
    };

    const focusPaperById = (paperId: string, now: number) => {
      if (exploration.state !== "system" || !systemResources) {
        if (import.meta.env.DEV) {
          renderer.domElement.dataset.paperFocusRejection = JSON.stringify({
            reason: "system-not-ready",
            paperId,
            explorationState: exploration.state,
            hasSystemResources: Boolean(systemResources),
          });
        }
        return;
      }
      const localPosition = resolveSystemPaperPosition(paperId);
      if (!localPosition) {
        if (import.meta.env.DEV) {
          renderer.domElement.dataset.paperFocusRejection = JSON.stringify({
            reason: "paper-position-missing",
            paperId,
          });
        }
        return;
      }
      delete renderer.domElement.dataset.paperFocusRejection;
      const retargeting = paperJourney.getState() !== "idle" && Boolean(savedSystemPose);
      if (!savedSystemPose) savedSystemPose = captureOrbitPose(orbit);
      systemResources.root.updateMatrixWorld(true);
      const worldPosition = localPosition.clone().applyMatrix4(systemResources.root.matrixWorld);
      const targetVisual = resolveSystemPaperVisual(paperId);
      const representativeInspection = Boolean(targetVisual?.representative);
      const paperViewDepth = Math.max(
        1,
        -worldPosition.clone().applyMatrix4(camera.matrixWorldInverse).z,
      );
      const pointDistanceScale = THREE.MathUtils.clamp(10 / paperViewDepth, 0.78, 1.18);
      const systemPointDiameter = representativeInspection
        ? Math.max(1, (targetVisual?.displaySize ?? 1) * pointDistanceScale)
        : THREE.MathUtils.clamp(
            (targetVisual?.displaySize ?? 1)
              * (targetVisual?.visualSizeVariation ?? 1)
              * pointDistanceScale,
            2.05,
            4.2,
          );
      // Acquisition is now a pure ownership handoff. The dedicated ordinary
      // visual starts with the exact source point footprint instead of the old
      // 1.68x jump that exposed the sphere carrier immediately.
      const compactOpticalDiameter = systemPointDiameter;
      const effectiveFov = THREE.MathUtils.degToRad(camera.getEffectiveFOV());
      // Calibrate at the real ownership boundary. The old farther-endpoint
      // calibration enlarged retargeted papers before the source point had
      // faded, which made the handoff itself visible.
      const ownerCalibrationDepth = paperViewDepth;
      const visibleWorldHeight = 2
        * ownerCalibrationDepth
        * Math.tan(effectiveFov * 0.5);
      const ownerCarrierDiameter = compactOpticalDiameter
        * (
          representativeInspection && visualProfile !== "agent-theory"
            ? APP17_REPRESENTATIVE_ENERGY_CARRIER_SCALE
            : 1
        );
      const ownerWorldDiameter = Math.max(
        0.0001,
        ownerCarrierDiameter
          * visibleWorldHeight
          / Math.max(1, height),
      );
      const resolvedOpticalProfile = resolvePaperReadingOpticalProfile(
        representativeInspection,
        height,
        visualProfile,
      );
      const explicitTargetDiameter = agentTheoryFocusVisualRef.current?.productMode === "sidera-explicit"
        ? agentTheoryFocusVisualRef.current.targetDiameterPx
        : undefined;
      const opticalProfile = explicitTargetDiameter === undefined
        ? resolvedOpticalProfile
        : {
            ...resolvedOpticalProfile,
            targetBodyDiameterPx: THREE.MathUtils.clamp(explicitTargetDiameter, 160, 240),
            targetProjectedDiameterPx: THREE.MathUtils.clamp(explicitTargetDiameter, 160, 240),
          };
      const targetAnchorNdcX = paperRailAnchorNdcX("paper-reading");
      const targetDistance = paperInspectionTargetDistance(
        camera,
        opticalProfile.targetProjectedDiameterPx / Math.max(1, height),
        ownerWorldDiameter,
        APP17_SYSTEM_PAPER_FOCUS_MIN_DISTANCE,
        targetAnchorNdcX,
      );
      systemResources.star.object.updateMatrixWorld(true);
      const starCenter = new THREE.Vector3().setFromMatrixPosition(systemResources.star.object.matrixWorld);
      const starScale = systemResources.star.object.getWorldScale(new THREE.Vector3());
      const starWorldRadius = APP17_SYSTEM_STAR_RADIUS
        * Math.max(starScale.x, starScale.y, starScale.z);
      const starSafeRadius = starWorldRadius * APP17_PAPER_FLIGHT_STAR_CLEARANCE;
      const startPose = captureCameraPose();
      const projection = paperJourneyProjection();
      // Keep Journey anchors in the same canonical projection used by its
      // quaternion solver. The live camera includes the context-rail
      // `setViewOffset`; feeding that shifted projection back into the solver
      // bakes the rail displacement into the pose and applies it twice.
      const startProjection = projectGalaxyPaperTargetToNdc(
        worldPosition,
        startPose,
        projection,
      );
      const startAnchorNdcX = THREE.MathUtils.clamp(startProjection.x, -0.96, 0.96);
      const startAnchorNdcY = THREE.MathUtils.clamp(startProjection.y, -0.96, 0.96);
      const resolvedReadingPose = resolveGalaxyPaperReadingPose({
        startCameraPose: startPose,
        targetWorldPosition: worldPosition,
        targetDistance,
        startAnchorNdcX,
        startAnchorNdcY,
        endAnchorNdcX: targetAnchorNdcX,
        endAnchorNdcY: 0,
        projection,
        viewportWidth: width,
        viewportHeight: height,
        starCenter,
        starSafeRadius,
        starPhysicalRadius: starWorldRadius,
      });
      if (!resolvedReadingPose) {
        if (import.meta.env.DEV) {
          renderer.domElement.dataset.paperFocusRejection = JSON.stringify({
            reason: "straight-ray-not-safe",
            paperId,
            targetDistance,
            targetBodyDiameterPx: opticalProfile.targetBodyDiameterPx,
            targetProjectedDiameterPx: opticalProfile.targetProjectedDiameterPx,
            starWorldRadius,
            endpointCandidateCount: 1,
          });
        }
        if (!retargeting) finishPaperFocusReset();
        paperPresentation.targetBodyDiameterPx = opticalProfile.targetBodyDiameterPx;
        paperPresentation.representativeCarrierRatio = opticalProfile.representativeCarrierRatio;
        paperPresentation.endpointStarExitMarginPx = 0;
        paperPresentation.endpointCandidateCount = 1;
        paperPresentation.endpointDirectionDeviationDegrees = 0;
        paperPresentation.endpointCompositionRejected = true;
        invalidate(true);
        return;
      }
      const nextJourneyFrame = paperJourney.startFocus({
        now,
        targetId: paperId,
        targetWorldPosition: worldPosition,
        startPose,
        systemPose: startPose,
        endCameraPose: resolvedReadingPose.endCameraPose,
        preparedPath: resolvedReadingPose.path,
        startAnchorNdcX,
        startAnchorNdcY,
        targetAnchorNdcX,
        targetAnchorNdcY: 0,
        durationMs: retargeting
          ? APP17_SYSTEM_PAPER_RETARGET_TRANSITION_MS
          : APP17_SYSTEM_PAPER_FOCUS_TRANSITION_MS,
        acquireDurationMs: visualProfile === "agent-theory" ? undefined : 0,
        retargeting,
        projection,
        starCenter,
        starSafeRadius,
        starPhysicalRadius: starWorldRadius,
        targetWorldDiameter: ownerWorldDiameter,
        viewportWidth: width,
        viewportHeight: height,
      });
      const focusAccepted = nextJourneyFrame.state !== "idle"
        && nextJourneyFrame.targetId === paperId;
      if (!focusAccepted) {
        if (import.meta.env.DEV) {
          renderer.domElement.dataset.paperFocusRejection = JSON.stringify({
            reason: "path-clearance",
            paperId,
            targetDistance,
            starSafeRadius,
          });
        }
        paperJourneyFrame = nextJourneyFrame;
        if (!retargeting) finishPaperFocusReset();
        invalidate(true);
        return;
      }

      paperJourneyFrame = nextJourneyFrame;
      resetPaperFlightTrace();
      paperFocusWorldPosition = paperJourneyFrame.targetWorldPosition?.clone() ?? worldPosition.clone();
      paperInspectionMotionStrength = 0;
      paperPresentation.startDistance = camera.position.distanceTo(worldPosition);
      paperPresentation.systemPointDiameter = systemPointDiameter;
      paperPresentation.compactOpticalDiameter = compactOpticalDiameter;
      paperPresentation.worldDiameter = ownerWorldDiameter;
      paperPresentation.targetBodyDiameterPx = opticalProfile.targetBodyDiameterPx;
      paperPresentation.representativeCarrierRatio = opticalProfile.representativeCarrierRatio;
      paperPresentation.endpointStarExitMarginPx = resolvedReadingPose.endpointStarExitMarginPx;
      paperPresentation.endpointCandidateCount = resolvedReadingPose.endpointCandidateCount;
      paperPresentation.endpointDirectionDeviationDegrees = resolvedReadingPose.endpointDirectionDeviationDegrees;
      paperPresentation.endpointCompositionRejected = false;
      paperFocusTargetDistance = resolvedReadingPose.resolvedReadingDistance;
      lastPaperFocusCanceled = false;
      paperComposition.panelHeaderProgress = 0;
      paperComposition.panelBodyProgress = 0;
      paperComposition.returnHorizontalReversals = 0;
      paperComposition.lastReturnScreenX = Number.NaN;
      paperComposition.lastReturnDirection = 0;
      setPaperInspectionMode("none", paperId);
      setPaperPanelState("staged", paperId);
      setSystemViewMode("paper-focus");
      setPaperFocusState("entering", paperId);
      configurePaperInspectionVisual(paperId);
      transitionFrameTimes.length = 0;
      lastTransitionRenderTime = 0;
      beginTransitionLayoutDiagnostics();
      cancelOrbitMotion(orbit);
      pendingWheelDelta = 0;
      lastPaperFlightPathMode = paperJourneyFrame.pathMode;
      lastPaperStarClearance = paperJourneyFrame.minimumStarClearance;
      lastPaperStarSafeRadius = starSafeRadius;
      paperComposition.targetAnchorNdcX = paperJourneyFrame.anchorNdcX;
      paperComposition.currentAnchorNdcX = paperJourneyFrame.anchorNdcX;
      setPaperCameraWriter("paper-flight");
      invalidate(true);
    };

    const returnToSystemCenter = (now: number) => {
      if (exploration.state !== "system" || !savedSystemPose || paperJourney.getState() === "idle") return;
      const canceledDuringEntry = publishedPaperFocusState === "entering";
      const duration = APP17_SYSTEM_PAPER_RETURN_TRANSITION_MS;
      const nextJourneyFrame = paperJourney.getState() === "acquiring" || paperJourney.getState() === "flying-in"
        ? paperJourney.cancel(now, captureCameraPose())
        : paperJourney.startReturn({
            now,
            currentPose: captureCameraPose(),
            projection: paperJourneyProjection(),
            durationMs: duration,
          });
      if (nextJourneyFrame.state !== "flying-out" && nextJourneyFrame.state !== "releasing") {
        paperJourneyFrame = nextJourneyFrame;
        invalidate(true);
        return;
      }

      paperJourneyFrame = nextJourneyFrame;
      resetPaperFlightTrace();
      lastPaperFocusCanceled = canceledDuringEntry;
      setPaperFocusState("exiting");
      setPaperCameraWriter("paper-return");
      paperComposition.returnHorizontalReversals = 0;
      paperComposition.lastReturnScreenX = Number.NaN;
      paperComposition.lastReturnDirection = 0;
      setPaperPanelState(paperJourneyFrame.panelProgress > 0.001 ? "exiting" : "hidden");
      transitionFrameTimes.length = 0;
      lastTransitionRenderTime = 0;
      cancelOrbitMotion(orbit);
      pendingWheelDelta = 0;
      lastPaperFlightPathMode = paperJourneyFrame.pathMode;
      invalidate(true);
    };

    const advancePaperJourney = (now: number) => {
      const previousState = previousPaperJourneyState;
      paperJourneyFrame = paperJourney.advance(now);
      paperFocusWorldPosition = paperJourneyFrame.targetWorldPosition?.clone() ?? null;
      previousPaperJourneyState = paperJourneyFrame.state;

      if (paperJourneyFrame.state === "idle") {
        if (previousState !== "idle") {
          const pendingAction = pendingPaperJourneyAction;
          pendingPaperJourneyAction = null;
          if (savedSystemPose) {
            orbit.center.copy(savedSystemPose.center);
            orbit.distance = savedSystemPose.distance;
            orbit.targetDistance = savedSystemPose.distance;
            orbit.azimuth = savedSystemPose.azimuth;
            orbit.elevation = savedSystemPose.elevation;
          }
          publishPaperFlightTrace("return");
          pendingPaperFlightTracePhase = null;
          finishPaperFocusReset();
          if (pendingAction === "exit-system") beginExitSystem(now);
          else if (pendingAction === "reset-system") resetSystemView(now);
        }
        return previousState !== "idle";
      }

      const nextFocusState = journeyFocusState(paperJourneyFrame.state);
        if (publishedPaperFocusState !== nextFocusState) {
        setPaperFocusState(nextFocusState, paperJourneyFrame.targetId);
          if (nextFocusState === "focused") {
            lastPaperFocusTransitionMs = APP17_SYSTEM_PAPER_FOCUS_TRANSITION_MS;
            pendingPaperFlightTracePhase = "focus";
            paperFlightTracePublishAt = now + 320;
          }
      }

      if (paperVisualIsolation === "system") paperJourneyFrame.visualOwnerOpacity = 0;
      else if (paperVisualIsolation === "dedicated") paperJourneyFrame.visualOwnerOpacity = 1;
      paperComposition.panelHeaderProgress = smoothStepRange(0.12, 0.52, paperJourneyFrame.panelProgress);
      paperComposition.panelBodyProgress = smoothStepRange(0.34, 0.92, paperJourneyFrame.panelProgress);
      paperComposition.currentAnchorNdcX = paperJourneyFrame.anchorNdcX;
      paperComposition.targetAnchorNdcX = paperJourneyFrame.anchorNdcX;
      lastPaperFlightPathMode = paperJourneyFrame.pathMode;
      lastPaperStarClearance = paperJourneyFrame.minimumStarClearance;
      setPaperCameraWriter(journeyCameraWriter(paperJourneyFrame));

      const nextPanelState = paperJourneyFrame.panelState as GalaxyPaperJourneyPanelState;
      if (paperPresentation.panelState !== nextPanelState) {
        setPaperPanelState(nextPanelState, paperJourneyFrame.targetId);
      }
      if (
        nextPanelState !== "hidden"
        && nextPanelState !== "staged"
        && paperPresentation.mode !== "centered"
      ) {
        setPaperInspectionMode("docked", paperJourneyFrame.targetId);
      }
      if (paperJourneyFrame.state === "reading") setSystemViewMode("paper-focus");

      return paperJourney.isMoving();
    };

    const togglePaperInspection = (now: number) => {
      if (exploration.state !== "system" || paperJourney.getState() !== "reading" || paperJourneyFrame.visualOwnerOpacity < 0.98) return;
      const nextMode: GalaxyPaperInspectionMode = paperPresentation.mode === "centered" ? "docked" : "centered";
      setPaperInspectionMode(nextMode);
      paperJourney.setReadingAnchor(
        paperRailAnchorNdcX(nextMode === "docked" ? "paper-reading" : "paper-summary"),
        now,
      );
      paperJourney.setReadingPanelVisible(nextMode === "docked", now);
      paperJourneyFrame = paperJourney.advance(now);
      paperFocusWorldPosition = paperJourneyFrame.targetWorldPosition?.clone() ?? null;
      setPaperPanelState(nextMode === "docked" ? "visible" : "hidden");
      invalidate(true);
    };

    const updatePointer = (event: { clientX: number; clientY: number }) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
    };

    const pickHotspot = () => {
      if (
        sceneData.kind === "app15"
        && exploration.blend >= 0.7
      ) return "";
      if (sceneData.kind !== "app15") {
        raycaster.params.Points.threshold = overviewPointPickThreshold;
        raycaster.setFromCamera(pointer, camera);
        const intersections = raycaster.intersectObject(hotspotLayer.pickObject, false);
        const index = intersections.length > 0 ? intersections[0].index ?? -1 : -1;
        return index >= 0 ? hotspotByIndex[index]?.id ?? "" : "";
      }
      root.updateMatrixWorld(true);
      const pointerX = (pointer.x * 0.5 + 0.5) * width;
      const pointerY = (-pointer.y * 0.5 + 0.5) * height;
      const farBlend = overviewTheoryFarBlend();
      let bestId = "";
      let bestDistanceSquared = Number.POSITIVE_INFINITY;
      let bestDepth = Number.POSITIVE_INFINITY;
      for (const hotspot of hotspotByIndex) {
        hotspotPickWorldPosition.copy(hotspot.position).applyMatrix4(root.matrixWorld);
        hotspotPickProjectedPosition.copy(hotspotPickWorldPosition).project(camera);
        if (
          hotspotPickProjectedPosition.z < -1
          || hotspotPickProjectedPosition.z > 1
          || Math.abs(hotspotPickProjectedPosition.x) > 1
          || Math.abs(hotspotPickProjectedPosition.y) > 1
        ) continue;
        const x = (hotspotPickProjectedPosition.x * 0.5 + 0.5) * width;
        const y = (-hotspotPickProjectedPosition.y * 0.5 + 0.5) * height;
        const deltaX = x - pointerX;
        const deltaY = y - pointerY;
        const distanceSquared = deltaX * deltaX + deltaY * deltaY;
        const displayRadius = Math.max(
          10,
          hotspot.displaySize * THREE.MathUtils.lerp(1, 0.68, farBlend) * 0.5,
        );
        if (distanceSquared > displayRadius * displayRadius) continue;
        if (
          distanceSquared < bestDistanceSquared - 0.01
          || (
            Math.abs(distanceSquared - bestDistanceSquared) <= 0.01
            && hotspotPickProjectedPosition.z < bestDepth
          )
        ) {
          bestId = hotspot.id;
          bestDistanceSquared = distanceSquared;
          bestDepth = hotspotPickProjectedPosition.z;
        }
      }
      return bestId;
    };

    const pickOverviewPaper = () => {
      if (
        visualProfile !== "agent-theory"
        || sceneData.kind !== "app15"
        || exploration.state !== "overview"
      ) return "";
      const candidateIndices = agentTheoryScreenLodResult?.selectedIndices;
      if (!candidateIndices?.length) return "";
      root.updateMatrixWorld(true);
      const pointerX = (pointer.x * 0.5 + 0.5) * width;
      const pointerY = (-pointer.y * 0.5 + 0.5) * height;
      let bestId = "";
      let bestDistanceSquared = 10 * 10;
      let bestDepth = Number.POSITIVE_INFINITY;
      candidateIndices.forEach((index) => {
        const paper = sceneData.papers[index];
        if (!paper) return;
        agentTheoryScreenLodWorld
          .set(paper.x, paper.y, paper.z)
          .applyMatrix4(root.matrixWorld);
        agentTheoryScreenLodProjection
          .copy(agentTheoryScreenLodWorld)
          .project(camera);
        if (
          agentTheoryScreenLodProjection.z < -1
          || agentTheoryScreenLodProjection.z > 1
          || Math.abs(agentTheoryScreenLodProjection.x) > 1
          || Math.abs(agentTheoryScreenLodProjection.y) > 1
        ) return;
        const x = (agentTheoryScreenLodProjection.x * 0.5 + 0.5) * width;
        const y = (-agentTheoryScreenLodProjection.y * 0.5 + 0.5) * height;
        const distanceSquared =
          (x - pointerX) * (x - pointerX)
          + (y - pointerY) * (y - pointerY);
        if (
          distanceSquared < bestDistanceSquared
          || (
            Math.abs(distanceSquared - bestDistanceSquared) <= 0.01
            && agentTheoryScreenLodProjection.z < bestDepth
          )
        ) {
          bestId = paper.paperId;
          bestDistanceSquared = distanceSquared;
          bestDepth = agentTheoryScreenLodProjection.z;
        }
      });
      return bestId;
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
      const screenDistanceSquared = (localPosition: THREE.Vector3) => {
        systemPickWorldPosition.copy(localPosition).applyMatrix4(systemResources!.root.matrixWorld);
        systemPickProjectedPosition.copy(systemPickWorldPosition).project(camera);
        if (systemPickProjectedPosition.z < -1 || systemPickProjectedPosition.z > 1) {
          return Number.POSITIVE_INFINITY;
        }
        const dx = (systemPickProjectedPosition.x - pointer.x) * width * 0.5;
        const dy = (systemPickProjectedPosition.y - pointer.y) * height * 0.5;
        return dx * dx + dy * dy;
      };
      const withinScreenRadius = (localPosition: THREE.Vector3, radiusPx: number) => (
        screenDistanceSquared(localPosition) <= radiusPx * radiusPx
      );
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
      if (paperJourney.getState() === "flying-in") {
        let fallbackPaperId = "";
        let fallbackDistanceSquared = Number.POSITIVE_INFINITY;
        const representativeRadiusSquared = (APP17_SYSTEM_PAPER_PICK_RADIUS_PX * 1.5) ** 2;
        for (const paper of systemResources.representativePapers) {
          if (
            systemResources.star.getVisualState().depthOcclusionActive
            && isSystemPaperOccludedByStar(paper.position, systemResources, camera)
          ) continue;
          const distanceSquared = screenDistanceSquared(paper.position);
          if (distanceSquared <= representativeRadiusSquared && distanceSquared < fallbackDistanceSquared) {
            fallbackPaperId = paper.id;
            fallbackDistanceSquared = distanceSquared;
          }
        }
        const ordinaryRadiusSquared = (APP17_SYSTEM_ORDINARY_PAPER_PICK_RADIUS_PX * 1.75) ** 2;
        const ordinaryCount = systemResources.cloudLayer.object.geometry.getAttribute("position").count;
        for (let index = 0; index < ordinaryCount; index += 1) {
          const paper = systemResources.cloudLayer.getPaperByIndex(index);
          if (!paper) continue;
          if (
            systemResources.star.getVisualState().depthOcclusionActive
            && isSystemPaperOccludedByStar(paper.position, systemResources, camera)
          ) continue;
          const distanceSquared = screenDistanceSquared(paper.position);
          if (distanceSquared <= ordinaryRadiusSquared && distanceSquared < fallbackDistanceSquared) {
            fallbackPaperId = paper.id;
            fallbackDistanceSquared = distanceSquared;
          }
        }
        if (fallbackPaperId) return finishPick(fallbackPaperId);
        const recentCutoff = pickStartedAt - 600;
        const pointerScreenX = pointer.x * width * 0.5;
        const pointerScreenY = -pointer.y * height * 0.5;
        const historicalRadiusSquared = (APP17_SYSTEM_PAPER_PICK_RADIUS_PX * 1.75) ** 2;
        for (const [paperId, samples] of recentRepresentativeScreenPositions) {
          if (paperId === paperJourney.getTargetId()) continue;
          const historicalPosition = resolveSystemPaperPosition(paperId);
          if (!historicalPosition) continue;
          if (
            systemResources.star.getVisualState().depthOcclusionActive
            && isSystemPaperOccludedByStar(historicalPosition, systemResources, camera)
          ) continue;
          for (const sample of samples) {
            if (sample.timestamp < recentCutoff) continue;
            const distanceSquared = (
              (sample.x - pointerScreenX) ** 2
              + (sample.y - pointerScreenY) ** 2
            );
            if (distanceSquared <= historicalRadiusSquared && distanceSquared < fallbackDistanceSquared) {
              fallbackPaperId = paperId;
              fallbackDistanceSquared = distanceSquared;
            }
          }
        }
        if (fallbackPaperId) return finishPick(fallbackPaperId);
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
      if (paperJourney.getState() !== "reading" || paperJourneyFrame.visualOwnerOpacity < 0.65 || !paperInspectionVisual.object.visible) return false;
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
      if (exploration.state !== "overview" || orbit.viewMode !== "overview" || !cameraPreset.autoRotate) return;
      clearAutoResumeTimer();
      orbit.pauseUntil = now + APP17_INTERACTION_PAUSE_MS;
      autoResumeTimer = window.setTimeout(() => {
        autoResumeTimer = 0;
        invalidate(true);
      }, APP17_INTERACTION_PAUSE_MS);
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (interactionModeRef.current !== "explore") return;
      if (
        visualProfile === "agent-theory"
        && agentTheoryCameraMode !== "explore-free"
      ) return;
      if (exploration.state === "preparing" || exploration.state === "entering" || exploration.state === "exiting") return;
      if (paperJourney.isMoving()) return;
      const agentTheoryFreeOverview = (
        visualProfile === "agent-theory"
        && exploration.state === "overview"
      );
      if (agentTheoryFreeOverview && agentTheoryHotspotClickTimer) {
        window.clearTimeout(agentTheoryHotspotClickTimer);
        agentTheoryHotspotClickTimer = 0;
      }
      if (
        orbit.pointerPressed
        || (
          agentTheoryFreeOverview
            ? event.button !== 0 && event.button !== 1
            : event.button !== 0
        )
      ) return;
      if (agentTheoryFreeOverview) {
        event.preventDefault();
        cancelAgentTheoryFreeLookAim();
        agentTheoryFreeLookPointerMode =
          event.button === 1 || event.shiftKey ? "pan" : "look";
      }
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
      pressedTargetId = agentTheoryFreeOverview
        && agentTheoryFreeLookPointerMode === "pan"
        ? ""
        : inspectionHit
          ? paperJourney.getTargetId()
          : pressedTargetKind === "paper"
            ? pickSystemPaper(true)
            : pickHotspot();
      renderer.domElement.setPointerCapture(event.pointerId);
      renderer.domElement.style.cursor = pressedTargetId ? "pointer" : "grab";
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (
        visualProfile === "agent-theory"
        && interactionModeRef.current === "ambient"
      ) return;
      if (interactionModeRef.current !== "explore") return;
      if (
        visualProfile === "agent-theory"
        && agentTheoryCameraMode !== "explore-free"
      ) return;
      if (exploration.state === "preparing" || exploration.state === "entering" || exploration.state === "exiting") return;
      if (paperJourney.isMoving()) return;
      updatePointer(event);
      if (orbit.pointerPressed) {
        if (!orbit.dragging) {
          const travel = Math.hypot(event.clientX - orbit.startX, event.clientY - orbit.startY);
          if (travel <= APP17_DRAG_THRESHOLD) return;
          orbit.dragging = true;
          if (visualProfile === "agent-theory") {
            cancelAgentTheoryScreenLodRefresh();
            requestAgentTheoryScreenLodWorker(performance.now(), true);
          }
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
        if (
          visualProfile === "agent-theory"
          && exploration.state === "overview"
        ) {
          if (agentTheoryFreeLookPointerMode === "pan") {
            const forward = resolveAgentTheoryFreeLookDirection();
            const right = new THREE.Vector3()
              .crossVectors(forward, camera.up)
              .normalize();
            const localUp = new THREE.Vector3()
              .crossVectors(right, forward)
              .normalize();
            const lookDistance = Math.max(
              camera.near * 4,
              agentTheoryPerimeterProfile?.medianRadius ?? 1,
            );
            const worldUnitsPerPixel = (
              2
              * lookDistance
              * Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5)
            ) / Math.max(1, height);
            agentTheoryFreeLookPosition
              .addScaledVector(right, -dx * worldUnitsPerPixel)
              .addScaledVector(localUp, dy * worldUnitsPerPixel);
            constrainAgentTheoryFreeLookPosition();
          } else {
            agentTheoryFreeLookYaw -=
              dx * APP17_AGENT_THEORY_FREE_LOOK_RADIANS_PER_PIXEL;
            agentTheoryFreeLookPitch = THREE.MathUtils.clamp(
              agentTheoryFreeLookPitch
                - dy * APP17_AGENT_THEORY_FREE_LOOK_RADIANS_PER_PIXEL,
              THREE.MathUtils.degToRad(-85),
              THREE.MathUtils.degToRad(85),
            );
            resolveAgentTheoryFreeLookDirection(
              agentTheoryFreeLookDirection,
            );
          }
          invalidate(true);
          return;
        }
        const readingOrbit = paperJourney.getReadingOrbit();
        if (paperJourney.getState() === "reading" && readingOrbit) {
          const azimuth = readingOrbit.azimuth - dx * 0.0045;
          const elevation = THREE.MathUtils.clamp(
            readingOrbit.elevation + dy * 0.0022,
            cameraPreset.minElevation,
            cameraPreset.maxElevation,
          );
          paperJourney.setReadingOrbit({ azimuth, elevation });
        } else {
          orbit.azimuth -= dx * 0.0045;
          orbit.elevation = THREE.MathUtils.clamp(
            orbit.elevation + dy * 0.0022,
            cameraPreset.minElevation,
            cameraPreset.maxElevation,
          );
        }
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
      if (interactionModeRef.current !== "explore") return;
      if (
        visualProfile === "agent-theory"
        && agentTheoryCameraMode !== "explore-free"
      ) return;
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
        if (!requestAgentTheoryScreenLodWorker(now, true)) {
          scheduleAgentTheoryScreenLodRefresh(0);
        }
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
      if (
        targetId
        && visualProfile === "agent-theory"
        && exploration.state === "overview"
      ) {
        const deferredHotspotId = targetId;
        agentTheoryHotspotClickTimer = window.setTimeout(() => {
          agentTheoryHotspotClickTimer = 0;
          if (
            disposed
            || interactionModeRef.current !== "explore"
            || exploration.state !== "overview"
            || agentTheoryCameraMode !== "explore-free"
          ) return;
          onSelectRef.current(deferredHotspotId);
        }, APP17_AGENT_THEORY_HOTSPOT_SINGLE_CLICK_DELAY_MS);
        return;
      }
      if (targetId) onSelectRef.current(targetId);
      else onClearSelectionRef.current();
    };

    const handlePointerCancel = (event: PointerEvent) => {
      if (interactionModeRef.current !== "explore") return;
      if (
        visualProfile === "agent-theory"
        && agentTheoryCameraMode !== "explore-free"
      ) return;
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
        if (!requestAgentTheoryScreenLodWorker(now, true)) {
          scheduleAgentTheoryScreenLodRefresh(0);
        }
        scheduleAutoRotateResume(now);
      }
      invalidate(true);
    };

    const handleDoubleClick = (event: MouseEvent) => {
      if (interactionModeRef.current !== "explore") return;
      if (
        visualProfile === "agent-theory"
        && agentTheoryCameraMode !== "explore-free"
      ) return;
      if (orbit.pointerPressed || orbit.dragging) return;
      updatePointer(event);
      if (
        visualProfile === "agent-theory"
        && exploration.state === "overview"
      ) {
        if (agentTheoryHotspotClickTimer) {
          window.clearTimeout(agentTheoryHotspotClickTimer);
          agentTheoryHotspotClickTimer = 0;
        }
        const hotspotId = pickHotspot();
        const paperId = hotspotId ? "" : pickOverviewPaper();
        const worldTarget = new THREE.Vector3();
        if (hotspotId) {
          const hotspot = hotspotById.get(hotspotId);
          if (!hotspot) return;
          worldTarget.copy(hotspot.position).applyMatrix4(root.matrixWorld);
        } else if (paperId) {
          const paper = sceneData.papers.find(
            (candidate) => candidate.paperId === paperId,
          );
          if (!paper) return;
          worldTarget
            .set(paper.x, paper.y, paper.z)
            .applyMatrix4(root.matrixWorld);
          onSelectPaperRef.current?.(paperId);
        } else {
          return;
        }
        event.preventDefault();
        beginAgentTheoryFreeLookAim(worldTarget, performance.now());
        return;
      }
      if (
        exploration.state !== "system"
        || (paperJourney.isMoving() && paperJourney.getState() !== "flying-in")
        || performance.now() - lastPointerDragEndedAt < 350
      ) return;
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
      if (
        visualProfile === "agent-theory"
        && interactionModeRef.current === "ambient"
      ) {
        agentTheoryPointerOffsetTarget.set(0, 0);
        invalidate(true);
        return;
      }
      if (interactionModeRef.current !== "explore") return;
      if (
        visualProfile === "agent-theory"
        && agentTheoryCameraMode !== "explore-free"
      ) return;
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
      const readingOrbit = paperJourney.getReadingOrbit();
      if (paperJourney.getState() === "reading" && readingOrbit) {
        const previousDistance = readingOrbit.distance;
        const nextDistance = THREE.MathUtils.clamp(
          previousDistance * Math.exp(normalizedDelta * APP17_WHEEL_SENSITIVITY),
          APP17_SYSTEM_PAPER_FOCUS_MIN_DISTANCE,
          APP17_SYSTEM_PAPER_FOCUS_MAX_DISTANCE,
        );
        paperJourney.setReadingOrbit({ distance: nextDistance });
        lastNormalizedWheelDelta = normalizedDelta;
        lastWheelDistanceRatio = previousDistance > 0
          ? nextDistance / previousDistance - 1
          : 0;
        return Math.abs(nextDistance - previousDistance) > 0.0001;
      }
      const minDistance = exploration.state === "system"
        ? systemViewMode === "paper-focus"
          ? APP17_SYSTEM_PAPER_FOCUS_MIN_DISTANCE
          : systemResources?.minDistance ?? APP17_SYSTEM_MIN_DISTANCE
        : cameraPreset.minDistance;
      const maxDistance = exploration.state === "system"
        ? systemViewMode === "paper-focus"
          ? APP17_SYSTEM_PAPER_FOCUS_MAX_DISTANCE
          : systemResources?.maxDistance ?? APP17_SYSTEM_MAX_DISTANCE
        : cameraPreset.maxDistance;
      const previousTargetDistance = orbit.targetDistance;
      const nextTargetDistance = THREE.MathUtils.clamp(
        previousTargetDistance * Math.exp(normalizedDelta * APP17_WHEEL_SENSITIVITY),
        minDistance,
        maxDistance,
      );
      orbit.targetDistance = nextTargetDistance;
      if (exploration.state === "overview") overviewFramingMode = "manual";
      lastNormalizedWheelDelta = normalizedDelta;
      lastWheelDistanceRatio = previousTargetDistance > 0
        ? nextTargetDistance / previousTargetDistance - 1
        : 0;
      return Math.abs(nextTargetDistance - previousTargetDistance) > 0.0001;
    };

    const handleWheel = (event: WheelEvent) => {
      if (interactionModeRef.current !== "explore") return;
      if (
        visualProfile === "agent-theory"
        && agentTheoryCameraMode !== "explore-free"
      ) return;
      event.preventDefault();
      if (exploration.state === "preparing" || exploration.state === "entering" || exploration.state === "exiting") return;
      if (paperJourney.isMoving()) return;
      const now = performance.now();
      lastInteractionTime = now;
      if (
        visualProfile === "agent-theory"
        && exploration.state === "overview"
      ) {
        cancelAgentTheoryFreeLookAim();
        const normalizedDelta = normalizeWheelDelta(event);
        const medianRadius =
          agentTheoryPerimeterProfile?.medianRadius ?? 1;
        const velocityScale = Math.max(
          APP17_AGENT_THEORY_FREE_LOOK_WHEEL_MIN_IMPULSE,
          medianRadius
            * APP17_AGENT_THEORY_FREE_LOOK_WHEEL_IMPULSE_PER_RADIUS,
        );
        const maximumDollySpeed = Math.max(
          APP17_AGENT_THEORY_FREE_LOOK_WHEEL_MIN_MAX_SPEED,
          (agentTheoryPerimeterProfile?.maximumRadius ?? 1)
            * APP17_AGENT_THEORY_FREE_LOOK_WHEEL_MAX_SPEED_PER_RADIUS,
        );
        const previousDollyVelocity =
          agentTheoryFreeLookDollyVelocity;
        agentTheoryFreeLookDollyVelocity = THREE.MathUtils.clamp(
          agentTheoryFreeLookDollyVelocity
            - normalizedDelta * velocityScale,
          -maximumDollySpeed,
          maximumDollySpeed,
        );
        lastNormalizedWheelDelta = normalizedDelta;
        lastWheelDistanceRatio = medianRadius > 1e-9
          ? (
            agentTheoryFreeLookDollyVelocity
            - previousDollyVelocity
          ) * APP17_AGENT_THEORY_FREE_LOOK_DOLLY_DAMPING_SECONDS
            / medianRadius
          : 0;
        requestAgentTheoryScreenLodWorker(now, true);
        invalidate(true);
        return;
      }
      scheduleAutoRotateResume(now);
      cancelOrbitTransition(orbit);
      pendingWheelDelta = THREE.MathUtils.clamp(
        pendingWheelDelta + normalizeWheelDelta(event),
        -APP17_WHEEL_MAX_PIXEL_DELTA,
        APP17_WHEEL_MAX_PIXEL_DELTA,
      );
      if (visualProfile === "agent-theory") {
        requestAgentTheoryScreenLodWorker(now, true);
      }
      invalidate(true);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (interactionModeRef.current !== "explore") return;
      if (event.key !== "Escape" || exploration.state === "overview") return;
      event.preventDefault();
      if (exploration.state === "system" && (paperJourney.getState() === "flying-out" || paperJourney.getState() === "releasing")) {
        return;
      }
      if (exploration.state === "system" && paperJourney.getState() !== "idle" && savedSystemPose) {
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
    renderer.domElement.addEventListener(
      "lostpointercapture",
      handlePointerCancel,
    );
    renderer.domElement.addEventListener("pointerleave", handlePointerLeave);
    renderer.domElement.addEventListener("dblclick", handleDoubleClick);
    renderer.domElement.addEventListener("wheel", handleWheel, { passive: false });
    window.addEventListener("keydown", handleKeyDown);

    function render(now: number) {
      frameId = 0;
      if (disposed || !runtimeActive || document.visibilityState === "hidden") return;
      paperComposition.cameraWriterChangesThisFrame = 0;

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
        } else if (commandRef.current.kind === "agent-focus-overview") {
          root.updateMatrixWorld(true);
          const target = new THREE.Vector3();
          let resolved = false;
          const requestedPaperId = selectedPaperIdRef.current;
          if (requestedPaperId) {
            const paper = sceneData.papers.find(
              (candidate) => candidate.paperId === requestedPaperId,
            );
            if (paper) {
              target.set(paper.x, paper.y, paper.z).applyMatrix4(root.matrixWorld);
              resolved = true;
            }
          }
          if (!resolved && selectedIdRef.current) {
            const hotspot = hotspotById.get(selectedIdRef.current);
            if (hotspot) {
              target.copy(hotspot.position).applyMatrix4(root.matrixWorld);
              resolved = true;
            }
          }
          if (!resolved && requestedPaperId && agentTheoryDynamicFocusLayer) {
            const dynamicPosition = agentTheoryDynamicFocusLayer.getPosition(
              requestedPaperId,
            );
            if (dynamicPosition) {
              target.copy(dynamicPosition).applyMatrix4(root.matrixWorld);
              resolved = true;
            }
          }
          if (resolved) {
            captureAgentTheoryFreeLookFromCamera();
            const currentForward = camera.getWorldDirection(new THREE.Vector3());
            const currentRight = new THREE.Vector3()
              .crossVectors(currentForward, camera.up)
              .normalize();
            const targetDistance = Math.max(
              camera.near * 4,
              camera.position.distanceTo(target),
            );
            const targetNdcX = commandRef.current.focusAnchorNdcX
              ?? (commandRef.current.focusSide === "left"
                ? -0.56
                : commandRef.current.focusSide === "right"
                  ? 0.56
                  : 0);
            const halfVisibleWidth = targetDistance
              * Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5)
              * camera.aspect;
            const composedLookTarget = target.clone().addScaledVector(
              currentRight,
              -targetNdcX * halfVisibleWidth,
            );
            if (
              commandRef.current.focusMode === "soft-focus"
              || commandRef.current.focusMode === "full-focus"
            ) {
              const assistedPosition = camera.position.clone().lerp(
                target,
                commandRef.current.focusMode === "full-focus" ? 0.15 : 0.08,
              );
              beginAgentTheoryFreeLookPoseTransition(
                assistedPosition,
                composedLookTarget,
                now,
                850,
              );
            } else {
              beginAgentTheoryFreeLookAim(composedLookTarget, now);
            }
          }
        } else if (
          commandRef.current.kind === "agent-restore-pose"
          && commandRef.current.cameraPose
        ) {
          const pose = commandRef.current.cameraPose;
          const center = new THREE.Vector3().fromArray(pose.center);
          const targetPosition = orbitPoseCameraPosition({
            center,
            distance: pose.distance,
            azimuth: pose.azimuth,
            elevation: pose.elevation,
          });
          captureAgentTheoryFreeLookFromCamera();
          beginAgentTheoryFreeLookPoseTransition(
            targetPosition,
            center,
            now,
            750,
          );
        } else if (commandRef.current.kind === "reset-system") {
          resetSystemView(now);
        } else if (exploration.state !== "overview") {
          beginExitSystem(now);
        } else if (
          visualProfile === "agent-theory"
          && interactionModeRef.current === "explore"
          && agentTheoryCameraMode === "explore-free"
          && (
            commandRef.current.kind === "reset"
            || commandRef.current.kind === "fit"
            || commandRef.current.kind === "top"
          )
        ) {
          const presetKind = commandRef.current.kind;
          const targetDistance = presetKind === "top"
            ? cameraPreset.topDistance
            : presetKind === "fit"
              ? cameraPreset.fitDistance
              : cameraPreset.distance;
          const targetAzimuth = presetKind === "top"
            ? cameraPreset.topAzimuth
            : presetKind === "fit"
              ? cameraPreset.fitAzimuth
              : cameraPreset.azimuth;
          const targetElevation = presetKind === "top"
            ? cameraPreset.topElevation
            : presetKind === "fit"
              ? cameraPreset.fitElevation
              : cameraPreset.elevation;
          orbit.viewMode = presetKind === "top" ? "top" : "overview";
          overviewFramingMode = presetKind === "fit" ? "fit" : "initial";
          orbit.pauseUntil = 0;
          orbit.center.copy(cameraPreset.center);
          orbit.distance = targetDistance;
          orbit.targetDistance = targetDistance;
          orbit.azimuth = targetAzimuth;
          orbit.elevation = targetElevation;
          beginAgentTheoryFreeLookPoseTransition(
            orbitPoseCameraPosition({
              center: cameraPreset.center,
              distance: targetDistance,
              azimuth: targetAzimuth,
              elevation: targetElevation,
            }),
            cameraPreset.center,
            now,
          );
        } else if (commandRef.current.kind === "top") {
          orbit.viewMode = "top";
          startOrbitTransition(
            orbit,
            "top",
            cameraPreset.center,
            cameraPreset.topDistance,
            cameraPreset.topAzimuth,
            cameraPreset.topElevation,
            now,
          );
        } else if (commandRef.current.kind === "fit") {
          orbit.viewMode = "overview";
          overviewFramingMode = "fit";
          orbit.pauseUntil = 0;
          startOrbitTransition(
            orbit,
            "fit",
            cameraPreset.center,
            cameraPreset.fitDistance,
            cameraPreset.fitAzimuth,
            cameraPreset.fitElevation,
            now,
          );
        } else {
          orbit.viewMode = "overview";
          overviewFramingMode = "initial";
          orbit.pauseUntil = 0;
          startOrbitTransition(
            orbit,
            "reset",
            cameraPreset.center,
            cameraPreset.distance,
            cameraPreset.azimuth,
            cameraPreset.elevation,
            now,
          );
        }
        renderRequested = true;
        labelDirty = true;
      }

      applyPendingWheelZoom();

      const agentTheoryCameraTransitioningBefore = (
        visualProfile === "agent-theory"
        && (
          agentTheoryCameraMode === "return-preparing"
          || agentTheoryCameraMode === "returning-anchor"
          || agentTheoryCameraMode === "return-commit"
          || agentTheoryFreeLookAim !== null
          || Math.abs(agentTheoryFreeLookDollyVelocity) > 1e-5
        )
      );
      const transitioningBefore = (
        orbit.transition !== null
        || paperJourney.isMoving()
        || agentTheoryCameraTransitioningBefore
      );
      const zoomingBefore = orbitZoomActive(orbit);
      const fullscreenTransitioningBefore = fullscreenTransition !== null;
      const inspectionTransitioningBefore = paperJourney.isMoving();
      const ambientSteadyActiveBefore = !reduceMotion && exploration.state === "system";
      const overviewAmbientActiveBefore = overviewAmbientActive();
      const environmentAnimationActiveBefore = !reduceMotion
        && (fullscreenBlend > 0.001 || fullscreenTransition?.to === 1);
      const autoRotateActive =
        exploration.state === "overview"
        &&
        orbit.viewMode === "overview"
        && !orbit.dragging
        && !transitioningBefore
        && !zoomingBefore
        && cameraPreset.autoRotate
        && now >= orbit.pauseUntil;
      const frameInterval = orbit.dragging || transitioningBefore || zoomingBefore || fullscreenTransitioningBefore || inspectionTransitioningBefore
        ? APP17_INTERACTION_FRAME_INTERVAL
        : autoRotateActive
          ? APP17_OVERVIEW_FRAME_INTERVAL
          : ambientSteadyActiveBefore
            ? getSystemAmbientFrameInterval()
            : overviewAmbientActiveBefore
              ? getOverviewAmbientFrameInterval()
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
      const measuredPaperFlight = paperJourney.isMoving();
      if (
        measuredTransition?.kind === "enter-system"
        || measuredTransition?.kind === "exit-system"
        || measuredPaperFlight
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
        && (
          (exploration.state !== "overview" && exploration.state !== "preparing")
          || overviewAmbientActiveBefore
        );
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
        if (
          visualProfile === "agent-theory"
          && interactionModeRef.current === "ambient"
          && exploration.state === "overview"
        ) {
          agentTheoryPointerOffsetTarget.set(0, 0);
          agentTheoryPointerOffsetCurrent.set(0, 0);
          if (agentTheoryCameraMode === "cruise") {
            advanceAgentTheoryVisibilitySteering(
              ambientElapsedMs / 1_000,
            );
            requestAgentTheoryCruiseGuidance(now);
          }
          if (
            !reduceMotion
            && agentTheoryCameraMode === "cruise"
            && agentTheoryPerimeterProfile
            && agentTheoryCruiseCheckpoint
          ) {
            const cruiseElapsedSeconds = ambientElapsedMs / 1_000;
            if (cruiseElapsedSeconds > 0.1) {
              agentTheoryCruiseBacklogTruncationCount += 1;
              agentTheoryCruiseAccumulatorSeconds = 0;
            } else {
              agentTheoryCruiseAccumulatorSeconds += cruiseElapsedSeconds;
            }
            const stepCount = Math.min(
              3,
              Math.floor(
                agentTheoryCruiseAccumulatorSeconds
                / AGENT_THEORY_CRUISE_FIXED_STEP_SECONDS,
              ),
            );
            if (stepCount > 0) {
              for (let stepIndex = 0; stepIndex < stepCount; stepIndex += 1) {
                agentTheoryPreviousCruiseCheckpoint =
                  cloneAgentTheoryCruiseCheckpoint(
                    agentTheoryCruiseCheckpoint,
                  );
                const advanceControl: AgentTheoryCruiseAdvanceControl = {
                  directionSign:
                    agentTheoryCruiseGuidanceTarget.directionSign,
                  speedScale: agentTheoryCruiseGuidance.speedScale,
                };
                agentTheoryCruiseCheckpoint = advanceAgentTheoryCruise(
                  agentTheoryPerimeterProfile,
                  agentTheoryCruiseCheckpoint,
                  1,
                  advanceControl,
                );
                agentTheoryCruiseLastProgressAt = now;
                if (agentTheoryCruiseHealthAuditActive) {
                  agentTheoryCruiseResumeSuccessfulSteps += 1;
                  if (agentTheoryCruiseResumeFirstSuccessfulStep < 0) {
                    agentTheoryCruiseResumeFirstSuccessfulStep =
                      agentTheoryCruiseCheckpoint.stepIndex;
                  }
                }
                agentTheoryCruiseAccumulatorSeconds -=
                  AGENT_THEORY_CRUISE_FIXED_STEP_SECONDS;
              }
            }
            agentTheoryCruiseAccumulatorSeconds = Math.min(
              agentTheoryCruiseAccumulatorSeconds,
              AGENT_THEORY_CRUISE_FIXED_STEP_SECONDS,
            );
            agentTheoryCruiseInterpolationAlpha = THREE.MathUtils.clamp(
              agentTheoryCruiseAccumulatorSeconds
                / AGENT_THEORY_CRUISE_FIXED_STEP_SECONDS,
              0,
              1,
            );
            if (
              agentTheoryReturnAwaitingFirstCruiseStep
              && agentTheoryCruiseResumeSuccessfulSteps >= 1
            ) {
              completeAgentTheoryReturnAfterCruiseStep(now);
            }
            if (agentTheoryCruiseHealthAuditActive) {
              agentTheoryCruiseResumeProjectionCurrent
                .copy(agentTheoryReturnProjectionWorld)
                .project(camera);
              const resumeProjectionDeltaPx = Math.hypot(
                (
                  agentTheoryCruiseResumeProjectionCurrent.x
                  - agentTheoryCruiseResumeProjectionStart.x
                ) * width * 0.5,
                (
                  agentTheoryCruiseResumeProjectionCurrent.y
                  - agentTheoryCruiseResumeProjectionStart.y
                ) * height * 0.5,
              );
              if (resumeProjectionDeltaPx < 0.15) {
                agentTheoryCruiseResumeStillFrames += 1;
              } else {
                agentTheoryCruiseResumeStillFrames = 0;
              }
              agentTheoryDepthDiagnostics.returnCruiseRestoreDurationMs =
                Math.max(0, now - agentTheoryCruiseResumeStartedAtMs);
              agentTheoryDepthDiagnostics
                .returnCruiseAdvanceRejectedCount =
                agentTheoryCruiseResumeRejectedSteps;
              agentTheoryDepthDiagnostics.returnCruiseFirstSuccessfulStep =
                agentTheoryCruiseResumeFirstSuccessfulStep;
              agentTheoryDepthDiagnostics.returnCruiseCheckpointDelta =
                Math.max(
                  0,
                  agentTheoryCruiseCheckpoint.stepIndex
                    - agentTheoryCruiseResumeStartStep,
                );
              agentTheoryDepthDiagnostics.returnAmbientTimeDelta =
                Math.max(
                  0,
                  ambientTimeSeconds
                    - agentTheoryCruiseResumeAmbientStart,
                );
              agentTheoryDepthDiagnostics.returnConsecutiveStillFrames =
                agentTheoryCruiseResumeStillFrames;
              agentTheoryDepthDiagnostics.returnCruiseGuardEvaluationCount =
                agentTheoryCruiseResumeGuardEvaluationCount;
              agentTheoryDepthDiagnostics.returnCruiseGuardSafeCount =
                agentTheoryCruiseResumeGuardSafeCount;
              const resumeProofDurationMs = Math.max(
                0,
                now - agentTheoryCruiseResumeStartedAtMs,
              );
              if (
                resumeProofDurationMs
                  >= APP17_AGENT_THEORY_POST_RETURN_DIAGNOSTIC_MS
              ) {
                completeAgentTheoryCruiseHealthAudit(
                  now,
                  resumeProjectionDeltaPx,
                );
              }
            }
            if (
              agentTheoryCruiseCheckpointSaveAllowed
              &&
              agentTheoryCruiseCheckpoint.stepIndex
                - lastAgentTheoryCruisePublishedStep >= 45
              && !agentTheoryCruiseCheckpointSaveTimer
              && !agentTheoryCruiseCheckpointSaveIdleId
            ) {
              agentTheoryCruiseCheckpointSaveTimer = window.setTimeout(() => {
                agentTheoryCruiseCheckpointSaveTimer = 0;
                const persistCheckpoint = () => {
                  agentTheoryCruiseCheckpointSaveIdleId = 0;
                  if (
                    disposed
                    || !agentTheoryCruiseCheckpoint
                    || !agentTheoryCruiseCheckpointSaveAllowed
                  ) return;
                  lastAgentTheoryCruisePublishedStep =
                    agentTheoryCruiseCheckpoint.stepIndex;
                  onAgentTheoryCruiseCheckpointChangeRef.current?.(
                    cloneAgentTheoryCruiseCheckpoint(
                      agentTheoryCruiseCheckpoint,
                    ),
                  );
                };
                const idleWindow = window as IdleCapableWindow;
                if (idleWindow.requestIdleCallback) {
                  agentTheoryCruiseCheckpointSaveIdleId =
                    idleWindow.requestIdleCallback(
                      persistCheckpoint,
                      { timeout: 500 },
                    );
                } else {
                  persistCheckpoint();
                }
              }, 1_000);
            }
          }
        }
        // Keep the target's internal energy/surface phase fixed while the
        // camera is moving. Otherwise the brightness centroid can drift even
        // when the journey pose itself is perfectly continuous.
        if (paperJourneyFrame.state === "reading" && !reduceMotion) {
          paperInspectionMotionStrength = Math.min(
            1,
            paperInspectionMotionStrength
              + ambientElapsedMs / APP17_PAPER_INSPECTION_MOTION_RESUME_MS,
          );
          // Integrate the motion clock itself instead of multiplying the full
          // accumulated phase by a changing strength. This prevents a phase
          // jump on the first stable reading frames.
          paperInspectionTimeSeconds += (ambientElapsedMs / 1_000) * paperInspectionMotionStrength;
        } else {
          paperInspectionMotionStrength = 0;
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
          [selectedPaperIdRef.current, hoveredSystemPaperId, paperJourney.getTargetId()].filter(Boolean),
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
      if (paperJourney.getState() !== "idle") {
        advancePaperJourney(now);
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
        const completed = advanceOrbitTransition(orbit, now);
        if (sceneData.kind === "app15" && activeTransition.kind === "enter-system") {
          const cameraPosition = orbitPoseCameraPosition({
            center: orbit.center,
            distance: orbit.distance,
            azimuth: orbit.azimuth,
            elevation: orbit.elevation,
          });
          const hotspotOffset = cameraPosition.sub(theoryEntryRayTarget);
          const hotspotDistance = hotspotOffset.length();
          const rayProjection = hotspotOffset.dot(theoryEntryRayDirection);
          const rayDeviation = hotspotOffset
            .addScaledVector(theoryEntryRayDirection, -rayProjection)
            .length();
          lastSystemEntryCameraRayDeviation = Math.max(
            lastSystemEntryCameraRayDeviation,
            rayDeviation,
          );
          if (hotspotDistance > previousSystemEntryHotspotDistance + 1e-9) {
            lastSystemEntryDistanceMonotonicViolations += 1;
          }
          previousSystemEntryHotspotDistance = hotspotDistance;
        }
        orbitChanged = true;
        if (completed && activeTransition.kind === "enter-system") {
          lastFocusTransitionMs = Math.max(0, now - activeTransition.startedAt);
          lastTransitionP95Ms = percentileNumber(transitionFrameTimes, 0.95);
          lastTransitionLongFrames50 = transitionFrameTimes.filter((value) => value > 50).length;
          lastTransitionTailP95Ms = percentileNumber(transitionTailFrameTimes, 0.95);
          lastTransitionTailLongFrames50 = transitionTailFrameTimes.filter((value) => value > 50).length;
          applyExplorationBlend(1);
          applyCameraOrbit(camera, orbit);
          lastSystemEntryCameraTravelDistance = camera.position.distanceTo(systemEntryCameraStart);
          measureTheoryWorldDrift();
          performTheoryCanonicalRebase(true);
          if (sceneData.kind === "app15" && systemResources) {
            systemResources.startRepresentativeSettle();
          }
          setExplorationState("system", true);
          flushDeferredRepresentativeUpdate();
          if (
            queuedEnterHotspotId
            && queuedEnterHotspotId !== systemResources?.hotspotId
          ) {
            queuedEnterHotspotId = "";
            beginExitSystem(now);
          }
        } else if (completed && activeTransition.kind === "reset-system") {
          if (paperJourney.getState() !== "idle") finishPaperFocusReset();
          else setSystemViewMode("system");
        } else if (completed && activeTransition.kind === "exit-system") {
          lastTransitionP95Ms = percentileNumber(transitionFrameTimes, 0.95);
          lastTransitionLongFrames50 = transitionFrameTimes.filter((value) => value > 50).length;
          lastTransitionTailP95Ms = percentileNumber(transitionTailFrameTimes, 0.95);
          lastTransitionTailLongFrames50 = transitionTailFrameTimes.filter((value) => value > 50).length;
          applyExplorationBlend(0);
          orbit.viewMode = exploration.savedOverviewViewMode;
          orbit.pauseUntil = exploration.savedOverviewPauseUntil;
          if (
            visualProfile === "agent-theory"
            && interactionModeRef.current === "explore"
            && agentTheoryCameraMode === "explore-free"
          ) {
            if (agentTheorySavedFreeLookPose) {
              camera.position.copy(agentTheorySavedFreeLookPose.position);
              camera.lookAt(
                agentTheorySavedFreeLookPose.position.clone().add(
                  agentTheorySavedFreeLookPose.direction,
                ),
              );
              camera.updateMatrixWorld(true);
            } else {
              applyCameraOrbit(camera, orbit);
            }
            captureAgentTheoryFreeLookFromCamera();
            agentTheorySavedFreeLookPose = null;
          }
          if (orbit.viewMode === "overview" && cameraPreset.autoRotate && orbit.pauseUntil > now) {
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
          if (queuedEnterHotspotId) {
            const queued = queuedEnterHotspotId;
            queuedEnterHotspotId = "";
            if (selectedIdRef.current === queued) beginEnterSystem(now);
          }
        }
      } else if (advanceOrbitZoom(orbit, elapsedMs)) {
        orbitChanged = true;
      }
      if (autoRotateActive) {
        orbit.azimuth += cameraPreset.autoRotateAzimuthStep * (elapsedMs / 50);
        orbit.targetDistance = orbit.distance;
        orbitChanged = true;
      }
      const projectionChanged = applyFullscreenVisuals(now);
      const viewportCompositionChanged = applyViewportComposition(now);
      if (projectionChanged || viewportCompositionChanged) labelDirty = true;
      const agentTheoryLodInteractionBusy = (
        visualProfile === "agent-theory"
        && agentTheoryScreenLodInteractionActive(now)
      );
      paperLayer.setAgentLodTransitionPaused(
        agentTheoryLodInteractionBusy,
        now,
      );
      if (
        !agentTheoryLodInteractionBusy
        && paperLayer.advanceAgentLodTransition(now)
      ) {
        ambientChanged = true;
      }
      if (applyAgentTheoryDepthSmoothing(elapsedMs / 1_000)) {
        ambientChanged = true;
      }
      const webglRenderNeeded = renderRequested
        || orbitChanged
        || ambientChanged
        || agentTheoryCameraTransitioningBefore
        || projectionChanged
        || viewportCompositionChanged
        || orbit.dragging
        || selectionPendingFrameRef.current;

      if (webglRenderNeeded) {
        applyRuntimeCamera();
        updateAgentTheoryCruiseMotionProbe(now);
        updateAgentTheoryCruiseLiveness(now);
        if (updateAgentTheoryScreenLod(now)) {
          ambientChanged = true;
        }
        if (
          agentTheoryHotspotSphereLayer
          && agentTheoryOverviewSphereEnabled
        ) {
          const sphereState = agentTheoryHotspotSphereLayer.update({
            camera,
            root,
            viewportHeight: height,
            deltaSeconds: Math.max(0, elapsedMs) / 1_000,
            surfaceTimeSeconds: ambientTimeSeconds * 0.025,
          });
          const overviewSphereOpacity = 1 - smoothStepRange(
            0.68,
            0.78,
            exploration.blend,
          );
          agentTheoryHotspotSphereLayer.setOpacity(overviewSphereOpacity);
          hotspotLayer.setResolvedSphereBlends(sphereState.blendById);
          agentTheoryDepthDiagnostics.activeSphereHotspotCount =
            sphereState.activeSphereCount;
          agentTheoryDepthDiagnostics.stellarLodTransitionCount =
            sphereState.transitionCount;
          agentTheoryDepthDiagnostics.hotspotSphereOffscreenSlotCount =
            sphereState.offscreenSphereSlotCount;
          agentTheoryStellarLodTransitionCount = sphereState.transitionCount;
        } else if (visualProfile === "agent-theory") {
          hotspotLayer.setResolvedSphereBlends(new Map());
          agentTheoryDepthDiagnostics.activeSphereHotspotCount = 0;
          agentTheoryDepthDiagnostics.currentSphereHotspotCount = 0;
          agentTheoryDepthDiagnostics.retiringSphereHotspotCount = 0;
          agentTheoryDepthDiagnostics.hotspotSphereOffscreenSlotCount = 0;
        }
        updateAgentTheoryDepthStaging(now);
        applyOverviewDistanceLod();
        lastPaperQuaternionDeltaDegrees = paperJourneyFrame.state !== "idle"
          ? THREE.MathUtils.radToDeg(lastRenderedPaperCameraQuaternion.angleTo(camera.quaternion))
          : 0;
        lastRenderedPaperCameraQuaternion.copy(camera.quaternion);
        if (import.meta.env.DEV && paperComposition.cameraWriterChangesThisFrame > 1) {
          console.warn("[app17] multiple paper camera writers in one frame", {
            writer: paperComposition.cameraWriter,
            changes: paperComposition.cameraWriterChangesThisFrame,
          });
        }
        if (paperJourneyFrame.state !== "idle") {
          applyPaperJourneySceneFrame(paperJourneyFrame);
          lastPaperHandoffAlphaSum = lastPaperPointAlpha + lastPaperDedicatedAlpha;
        } else {
          lastPaperHandoffAlphaSum = 1;
        }
        environmentStarLayer.setCenter(camera.position);
        overviewRoot.updateMatrixWorld();
        root.updateMatrixWorld();
        systemResources?.root.updateMatrixWorld();
        updateTheoryFarBackgroundMask();
        if (systemResources) {
          if (systemResources.visualMode === "theory") {
            for (const paper of systemResources.representativePapers) {
              if (paper.ownershipBlend <= 1e-6 || paper.ownershipBlend >= 1 - 1e-6) continue;
              paperTracePickProjectedPosition
                .copy(paper.position)
                .applyMatrix4(systemResources.root.matrixWorld)
                .project(camera);
              representativeSemanticProjectedPosition
                .copy(paper.semanticPosition)
                .applyMatrix4(systemResources.root.matrixWorld)
                .project(camera);
              lastRepresentativeHandoffProjectionDeltaPx = Math.max(
                lastRepresentativeHandoffProjectionDeltaPx,
                Math.hypot(
                  (paperTracePickProjectedPosition.x - representativeSemanticProjectedPosition.x)
                    * width * 0.5,
                  (paperTracePickProjectedPosition.y - representativeSemanticProjectedPosition.y)
                    * height * 0.5,
                ),
              );
            }
          }
          if (paperJourneyFrame.state !== "idle") {
            const historyCutoff = now - 600;
            for (const paper of systemResources.representativePapers) {
              paperTracePickWorldPosition
                .copy(paper.position)
                .applyMatrix4(systemResources.root.matrixWorld);
              paperTracePickProjectedPosition
                .copy(paperTracePickWorldPosition)
                .project(camera);
              const samples = recentRepresentativeScreenPositions.get(paper.id) ?? [];
              samples.push({
                timestamp: now,
                x: paperTracePickProjectedPosition.x * width * 0.5,
                y: -paperTracePickProjectedPosition.y * height * 0.5,
              });
              while (samples.length > 0 && samples[0].timestamp < historyCutoff) samples.shift();
              recentRepresentativeScreenPositions.set(paper.id, samples);
            }
          } else if (recentRepresentativeScreenPositions.size > 0) {
            recentRepresentativeScreenPositions.clear();
          }
          if (paperFlightPixelTraceEnabled) {
            const canvasRect = renderer.domElement.getBoundingClientRect();
            const systemRootMatrixWorld = systemResources.root.matrixWorld;
            const tracePickTargets: Array<{
              id: string;
              kind: "representative" | "ordinary";
              screenX: number;
              screenY: number;
              depth: number;
            }> = systemResources.representativePapers.map((paper) => {
                paperTracePickWorldPosition
                  .copy(paper.position)
                  .applyMatrix4(systemRootMatrixWorld);
                paperTracePickProjectedPosition
                  .copy(paperTracePickWorldPosition)
                  .project(camera);
                return {
                  id: paper.id,
                  kind: "representative" as const,
                  screenX: canvasRect.left
                    + (paperTracePickProjectedPosition.x * 0.5 + 0.5) * canvasRect.width,
                  screenY: canvasRect.top
                    + (-paperTracePickProjectedPosition.y * 0.5 + 0.5) * canvasRect.height,
                  depth: paperTracePickProjectedPosition.z,
                };
              });
            const ordinaryPositionCount = systemResources.cloudLayer.object.geometry
              .getAttribute("position").count;
            const ordinaryStride = Math.max(1, Math.floor(ordinaryPositionCount / 96));
            for (
              let index = 0;
              index < ordinaryPositionCount && tracePickTargets.length < systemResources.representativePapers.length + 24;
              index += ordinaryStride
            ) {
              const paper = systemResources.cloudLayer.getPaperByIndex(index);
              if (!paper) continue;
              paperTracePickWorldPosition
                .copy(paper.position)
                .applyMatrix4(systemRootMatrixWorld);
              paperTracePickProjectedPosition
                .copy(paperTracePickWorldPosition)
                .project(camera);
              if (
                Math.abs(paperTracePickProjectedPosition.x) > 0.96
                || Math.abs(paperTracePickProjectedPosition.y) > 0.96
                || paperTracePickProjectedPosition.z < -1
                || paperTracePickProjectedPosition.z > 1
              ) continue;
              tracePickTargets.push({
                id: paper.id,
                kind: "ordinary",
                screenX: canvasRect.left
                  + (paperTracePickProjectedPosition.x * 0.5 + 0.5) * canvasRect.width,
                screenY: canvasRect.top
                  + (-paperTracePickProjectedPosition.y * 0.5 + 0.5) * canvasRect.height,
                depth: paperTracePickProjectedPosition.z,
              });
            }
            renderer.domElement.dataset.paperPickTargets = JSON.stringify(tracePickTargets);
          }
          const inspectionWorldPosition = paperJourneyFrame.targetWorldPosition?.clone()
            ?? paperFocusWorldPosition?.clone();
          lastPaperHandoffPositionDeltaPx = 0;
          lastPaperTargetWorldPositionDrift = 0;
          if (inspectionWorldPosition && paperJourneyFrame.targetId) {
            const sourceLocalPosition = resolveSystemPaperPosition(paperJourneyFrame.targetId);
            if (sourceLocalPosition) {
              paperTraceSourceWorldPosition
                .copy(sourceLocalPosition)
                .applyMatrix4(systemResources.root.matrixWorld);
              lastPaperTargetWorldPositionDrift = paperTraceSourceWorldPosition.distanceTo(inspectionWorldPosition);
              paperTraceSourceProjectedPosition.copy(paperTraceSourceWorldPosition).project(camera);
              paperTraceTargetProjectedPosition.copy(inspectionWorldPosition).project(camera);
              if (
                Number.isFinite(paperTraceSourceProjectedPosition.x)
                && Number.isFinite(paperTraceSourceProjectedPosition.y)
                && Number.isFinite(paperTraceTargetProjectedPosition.x)
                && Number.isFinite(paperTraceTargetProjectedPosition.y)
              ) {
                lastPaperHandoffPositionDeltaPx = Math.hypot(
                  (paperTraceSourceProjectedPosition.x - paperTraceTargetProjectedPosition.x) * width * 0.5,
                  (paperTraceSourceProjectedPosition.y - paperTraceTargetProjectedPosition.y) * height * 0.5,
                );
              }
            }
          }
          if (inspectionWorldPosition && paperJourneyFrame.state !== "idle") {
            const inspectionProjection = inspectionWorldPosition.clone().project(camera);
            lastPaperAnchorDeltaPx = Number.isFinite(lastPaperProjectionX)
              ? Math.abs(inspectionProjection.x - lastPaperProjectionX) * width * 0.5
              : 0;
            lastPaperProjectionX = inspectionProjection.x;
            const effectiveAnchorNdcX = paperComposition.currentAnchorNdcX
              - viewportOffsetCurrent * 2;
            paperComposition.anchorErrorPx = Math.abs(
              inspectionProjection.x - effectiveAnchorNdcX,
            ) * width * 0.5;
          } else {
            paperComposition.anchorErrorPx = 0;
            lastPaperAnchorDeltaPx = 0;
            lastPaperProjectionX = Number.NaN;
          }
          paperInspectionVisual.setVisual({
            worldPosition: inspectionWorldPosition,
            camera,
            viewportWidth: width,
            viewportHeight: height,
            inspectionBlend: paperJourneyFrame.visualOwnerOpacity,
            compactDiameter: paperPresentation.compactOpticalDiameter,
            worldDiameter: paperPresentation.worldDiameter,
            targetBodyDiameterPx: paperPresentation.targetBodyDiameterPx,
            compactLod: paperJourneyFrame.inspectionLod,
            centered: paperPresentation.mode === "centered",
            fullscreen: fullscreenRef.current,
            wideLayout: window.innerWidth >= 1280,
            timeSeconds: paperInspectionTimeSeconds,
            motionStrength: reduceMotion ? 0 : 1,
          });
          const inspectionVisualState = paperInspectionVisual.getVisualState();
          if (paperJourneyFrame.state !== "idle") {
            const ownerOpacity = paperJourneyFrame.visualOwnerOpacity;
            const representativeInspection = inspectionVisualState.visualType === "energy-core";
            const opticalScale = representativeInspection ? 1 / APP17_REPRESENTATIVE_ENERGY_CARRIER_SCALE : 1;
            const pointCoreDiameter = Math.max(1, paperPresentation.systemPointDiameter * opticalScale);
            const closeupCoreDiameter = Math.max(
              pointCoreDiameter,
              inspectionVisualState.projectedDiameter * opticalScale,
            );
            lastPaperPointCoreDiameter = pointCoreDiameter;
            lastPaperDedicatedCoreDiameter = closeupCoreDiameter;
            lastPaperPointAlpha = 1 - ownerOpacity;
            lastPaperDedicatedAlpha = ownerOpacity;
            lastPaperVisibleEnergyRatio = (
              pointCoreDiameter * pointCoreDiameter * (1 - ownerOpacity)
              + closeupCoreDiameter * closeupCoreDiameter * ownerOpacity
            ) / Math.max(1, pointCoreDiameter * pointCoreDiameter);
            lastPaperHandoffAlphaSum = lastPaperPointAlpha + lastPaperDedicatedAlpha;
          }
          lastPaperAngularGrowthRatio = lastPaperAngularSizeRatio > 0 && inspectionVisualState.viewportRatio > 0
            ? inspectionVisualState.viewportRatio / lastPaperAngularSizeRatio - 1
            : 0;
          lastPaperAngularSizeRatio = inspectionVisualState.viewportRatio;
          paperPresentation.targetScreenSize = inspectionVisualState.projectedDiameter
            || paperPresentation.targetScreenSize;
          const activeSystemCameraDistance = camera.position.distanceTo(exploration.focusWorld);
          systemResources.cloudLayer.setLodDistance(activeSystemCameraDistance);
          systemResources.representativeLayer?.setLodDistance(activeSystemCameraDistance);
          const starProjectionChanged = systemResources.star.updateProjection(camera, width, height);
          const starVisualState = systemResources.star.getVisualState();
          systemResources.star.setFocusAttenuation(1);
          systemResources.orbitLayer?.setCloseupAttenuation(
            1 - smoothStepRange(0.65, 0.9, starVisualState.viewportRatio) * 0.2,
          );
          if (starProjectionChanged) labelDirty = true;
          systemCenterViewPosition
            .setFromMatrixPosition(systemResources.root.matrixWorld)
            .applyMatrix4(camera.matrixWorldInverse);
          systemResources.root.getWorldScale(systemWorldScale);
          const systemDepthStrength = smoothStepRange(0.62, 1, exploration.blend);
          const systemDepthRange = systemResources.frameRadius * Math.max(
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
          if (paperJourneyFrame.visualOwnerOpacity > 0.08) focusSprite.visible = false;
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
        if (visualProfile === "agent-theory") {
          const frameWebglErrors = drainWebglErrors(renderer.getContext());
          if (frameWebglErrors > 0) {
            reportAgentTheoryRuntimeFailure(
              "理论背景首帧 WebGL 校验失败，请重试或查看材质诊断。",
              [],
              frameWebglErrors,
            );
            return;
          }
        }
        if (!firstFrameReported) {
          firstFrameReported = true;
          onFirstFrameRef.current?.();
        }
        if (!readyReported) {
          if (visualProfile !== "agent-theory") {
            readyReported = true;
            onReadyRef.current?.();
          } else if (
            agentTheoryInitialGateComplete
            && agentTheoryDepthDiagnostics.shaderStatus === "ready"
            && agentTheoryDepthDiagnostics.webglErrorCount === 0
            && agentTheoryDepthDiagnostics.perceptiblePaperCount
              >= createAgentTheoryVisibilityEnvelope(
                width,
                height,
              ).paperHardFloor
            && agentTheoryDepthDiagnostics.visibleHotspotCount
              >= createAgentTheoryVisibilityEnvelope(
                width,
                height,
              ).hotspotHardFloor
            && agentTheoryDepthDiagnostics.hotspotOccupiedCellCount
              >= createAgentTheoryVisibilityEnvelope(
                width,
                height,
              ).hotspotCellHardFloor
            && agentTheoryVisibilityCheckpointValid
            && agentTheoryDepthDiagnostics.occupiedTileRatio > 0
          ) {
            readyReported = true;
            agentTheoryDepthDiagnostics.readyGatePassed = true;
            publishAgentTheoryRuntimeDiagnostics();
            onReadyRef.current?.();
          }
        }
        if (
          onCameraPoseChangeRef.current
          && exploration.state === "overview"
          && paperJourney.getState() === "idle"
          && (
            visualProfile !== "agent-theory"
            || (
              agentTheoryCameraMode === "explore-free"
              && !orbit.dragging
              && !orbit.transition
              && !orbitZoomActive(orbit)
            )
          )
          && (
            lastPosePublishedAt === Number.NEGATIVE_INFINITY
            || now - lastPosePublishedAt >= 120
          )
        ) {
          lastPosePublishedAt = now;
          publishCameraPose();
        }
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
        if (paperFocusWorldPosition && paperJourneyFrame.state !== "idle") {
          const projectedPaper = paperFocusWorldPosition.clone().project(camera);
          const traceInspectionVisualState = paperInspectionVisual.getVisualState();
          const inspectionProjectedDiameter = traceInspectionVisualState.projectedDiameter;
          const actualBodyDiameterPx = traceInspectionVisualState.visualType === "energy-core"
            ? traceInspectionVisualState.energyBodyCoreDiameter
            : traceInspectionVisualState.projectedDiameter;
          recordPaperFlightTrace(
            now,
            inspectionProjectedDiameter,
            actualBodyDiameterPx,
            projectedPaper,
            measurePaperVisibleCore(projectedPaper, inspectionProjectedDiameter),
            {
              ordinarySurfaceMorph: traceInspectionVisualState.ordinarySurfaceMorph,
              ordinaryAtmosphereMorph: traceInspectionVisualState.ordinaryAtmosphereMorph,
              handoffDiameterRatio: traceInspectionVisualState.handoffDiameterRatio,
              representativeCarrierEdgeLeak: traceInspectionVisualState.representativeCarrierEdgeLeak,
            },
          );
          if (pendingPaperFlightTracePhase && now >= paperFlightTracePublishAt) {
            publishPaperFlightTrace(pendingPaperFlightTracePhase);
            pendingPaperFlightTracePhase = null;
            paperFlightTracePublishAt = 0;
          }
        }
        if (measurePerformance && bloomStartedAt > 0) {
          bloomSamples.push({ timestamp: now, value: performance.now() - bloomStartedAt });
        }
        const systemAmbientSteadyActive = !reduceMotion
          && exploration.state === "system"
          && !orbit.dragging
          && !orbit.transition
          && !paperJourney.isMoving()
          && !orbitZoomActive(orbit)
          && fullscreenTransition === null;
        const environmentSteadyActive = !reduceMotion
          && fullscreenBlend > 0.001
          && !orbit.dragging
          && !orbit.transition
          && !paperJourney.isMoving()
          && !orbitZoomActive(orbit)
          && fullscreenTransition === null;
        if (systemAmbientSteadyActive || environmentSteadyActive) {
          const ambientInterval = getSystemAmbientFrameInterval();
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
        if (overviewAmbientActiveBefore) trackOverviewAmbientCadence(now);
        else overviewAmbientLastFrameTime = 0;
        if (autoRotateActive || orbit.dragging || orbitChanged) labelDirty = true;
      }

      const agentTheoryLabelsReady = (
        visualProfile !== "agent-theory"
        || agentTheoryCameraMode === "explore-free"
      );
      const labelFrameInterval = visualProfile === "agent-theory"
        ? APP17_AGENT_THEORY_LABEL_FRAME_INTERVAL
        : APP17_LABEL_FRAME_INTERVAL;
      if (
        labelsVisibleRef.current
        && agentTheoryLabelsReady
        && labelDirty
        && now - lastLabelRenderTime >= labelFrameInterval
      ) {
        const measurePerformance = ensureDiagnosticsActive(now);
        const labelStartedAt = measurePerformance ? performance.now() : 0;
        let labelTransitionActive = false;
        if (exploration.blend >= 0.7 && systemResources) {
          drawSystemLabels(
            labelCanvas!,
            camera,
            systemResources,
            payload.hotspots.find((hotspot) => hotspot.id === systemResources?.hotspotId)?.title ?? "热点星系",
            selectedPaperIdRef.current,
            hoveredSystemPaperId,
            paperJourneyFrame.visualOwnerOpacity > 0.08,
            width,
            height,
          );
        } else {
          labelTransitionActive = drawLabels(
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
            visualProfile,
            agentTheoryLabelRuntimeStates,
            now,
          );
        }
        if (measurePerformance) labelSamples.push({ timestamp: now, value: performance.now() - labelStartedAt });
        labelDirty = labelTransitionActive;
        lastLabelRenderTime = now;
      } else if (
        !labelsVisibleRef.current
        && labelDirty
      ) {
        const context = labelCanvas!.getContext("2d");
        context?.clearRect(0, 0, labelCanvas!.width, labelCanvas!.height);
        agentTheoryLabelRuntimeStates.clear();
        labelDirty = false;
      }

      renderRequested = false;
      const ambientSteadyActiveAfter = !reduceMotion && exploration.state === "system";
      const environmentAnimationActiveAfter = !reduceMotion && fullscreenBlend > 0.001;
      if (
        autoRotateActive
        || ambientSteadyActiveAfter
        || overviewAmbientActive()
        || environmentAnimationActiveAfter
        || orbit.dragging
        || orbit.transition
        || paperJourney.isMoving()
        || orbitZoomActive(orbit)
        || fullscreenTransition
        || paperLayer.isAgentLodTransitioning()
        || agentTheoryCameraMode === "return-preparing"
        || agentTheoryCameraMode === "returning-anchor"
        || agentTheoryCameraMode === "return-commit"
        || agentTheoryFreeLookAim !== null
        || Math.abs(agentTheoryFreeLookDollyVelocity) > 1e-5
        || labelDirty
      ) scheduleFrame();
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        if (frameId) cancelAnimationFrame(frameId);
        frameId = 0;
        lastAmbientRenderTime = 0;
        cancelAgentTheoryScreenLodRefresh();
        cancelAgentTheoryGuidanceFallback();
        if (visualProfile === "agent-theory") {
          orbit.pointerPressed = false;
          orbit.dragging = false;
          agentTheoryLodRefreshPending = true;
          paperLayer.setAgentLodTransitionPaused(true, performance.now());
        }
        pauseTimeline();
        return;
      }
      if (!runtimeActive) return;
      resumeTimeline();
      lastRenderTime = 0;
      lastAmbientRenderTime = 0;
      if (agentTheoryLodRefreshPending) {
        scheduleAgentTheoryScreenLodRefresh(0);
      }
      requestAgentTheoryCruiseGuidance(performance.now());
      invalidate(true);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    scheduleSystemPreparation(selectedIdRef.current, false);
    if (runAgentTheoryInitialRuntimeGate()) {
      initializeAgentTheoryScreenLodWorker();
      if (document.visibilityState === "hidden") {
        invalidate(true);
      } else {
        // The startup contract is the first error-free WebGL render. Render
        // synchronously so a cold WebView2 window cannot strand startup while
        // requestAnimationFrame is temporarily throttled during reveal.
        render(performance.now());
      }
    }

    return () => {
      disposed = true;
      publishCameraPose();
      if (frameId) cancelAnimationFrame(frameId);
      clearAutoResumeTimer();
      cancelAgentTheoryScreenLodRefresh();
      cancelAgentTheoryGuidanceFallback();
      agentTheoryScreenLodWorker?.dispose();
      agentTheoryScreenLodWorker = null;
      agentTheoryScreenLodWorkerReady = false;
      if (agentTheoryCruiseCheckpointSaveTimer) {
        window.clearTimeout(agentTheoryCruiseCheckpointSaveTimer);
        agentTheoryCruiseCheckpointSaveTimer = 0;
      }
      if (agentTheoryCruiseCheckpointSaveIdleId) {
        const idleWindow = window as IdleCapableWindow;
        idleWindow.cancelIdleCallback?.(agentTheoryCruiseCheckpointSaveIdleId);
        agentTheoryCruiseCheckpointSaveIdleId = 0;
      }
      if (systemHoverPickTimer) window.clearTimeout(systemHoverPickTimer);
      if (agentTheoryHotspotClickTimer) {
        window.clearTimeout(agentTheoryHotspotClickTimer);
        agentTheoryHotspotClickTimer = 0;
      }
      if (diagnosticsTimer) window.clearInterval(diagnosticsTimer);
      invalidateRef.current = null;
      refreshSystemRef.current = null;
      prepareSystemRef.current = null;
      resetDiagnosticsRef.current = null;
      activeControllerRef.current = null;
      fullscreenControllerRef.current = null;
      inspectionMetadataControllerRef.current = null;
      viewportOffsetControllerRef.current = null;
      cancelScheduledPreparation(false);
      cancelRepresentativeUpdate();
      resizeObserver.disconnect();
      reducedMotionMedia.removeEventListener("change", handleReducedMotionChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      renderer.domElement.removeEventListener("pointerup", handlePointerUp);
      renderer.domElement.removeEventListener("pointercancel", handlePointerCancel);
      renderer.domElement.removeEventListener(
        "lostpointercapture",
        handlePointerCancel,
      );
      renderer.domElement.removeEventListener("pointerleave", handlePointerLeave);
      renderer.domElement.removeEventListener("dblclick", handleDoubleClick);
      renderer.domElement.removeEventListener("wheel", handleWheel);
      window.removeEventListener("keydown", handleKeyDown);
      paperLayer.dispose();
      hotspotLayer.dispose();
      agentTheoryFocusVisualControllerRef.current = null;
      if (agentTheoryHotspotSphereLayer) {
        scene.remove(agentTheoryHotspotSphereLayer.object);
        agentTheoryHotspotSphereLayer.dispose();
      }
      if (agentTheoryDynamicFocusLayer) {
        root.remove(agentTheoryDynamicFocusLayer.object);
        agentTheoryDynamicFocusLayer.dispose();
      }
      orbitLayer?.dispose();
      scene.remove(environmentStarLayer.object);
      environmentStarLayer.dispose();
      if (
        agentTheoryCruiseCheckpoint
        && agentTheoryCruiseCheckpointSaveAllowed
      ) {
        onAgentTheoryCruiseCheckpointChangeRef.current?.(
          cloneAgentTheoryCruiseCheckpoint(agentTheoryCruiseCheckpoint),
        );
      }
      if (agentTheoryDecorativeLayer) {
        scene.remove(agentTheoryDecorativeLayer.object);
        agentTheoryDecorativeLayer.dispose();
      }
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
      scene.clear();
    };
  }, [
    agentTheoryDepthProfile,
    agentTheoryPerimeterProfile,
    agentTheoryQuality,
    farBackgroundPayload,
    initialAgentTheoryCruiseCheckpoint,
    payload.snapshotId,
    reviewCameraPreset,
    sceneData,
    visualProfile,
  ]);

  useEffect(() => () => {
    const core = persistentRenderCoreRef.current;
    if (!core) return;
    const canvas = core.renderer.domElement;
    if (canvas.parentElement) canvas.parentElement.removeChild(canvas);
    core.scene.clear();
    core.renderer.dispose();
    persistentRenderCoreRef.current = null;
  }, []);

  return (
    <>
      <div className="reference-galaxy-backdrop" />
      <div ref={containerRef} className="reference-galaxy-canvas-host" />
      <canvas
        ref={labelCanvasRef}
        className="app17-galaxy-label-canvas"
        style={{ display: labelsVisible ? "block" : "none" }}
      />
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
  radialCameraPath?: {
    target: THREE.Vector3;
    direction: THREE.Vector3;
    startDistance: number;
    endDistance: number;
  },
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
    radialCameraTarget: radialCameraPath?.target.clone(),
    radialCameraDirection: radialCameraPath?.direction.clone().normalize(),
    radialCameraStartDistance: radialCameraPath?.startDistance,
    radialCameraEndDistance: radialCameraPath?.endDistance,
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

function resolvePaperReadingOpticalProfile(
  representative: boolean,
  viewportHeight: number,
  visualProfile: GalaxyVisualProfile = "analysis",
): PaperReadingOpticalProfile {
  if (visualProfile === "agent-theory") {
    const targetBodyDiameterPx = THREE.MathUtils.clamp(
      viewportHeight * APP17_AGENT_PAPER_PHOTOSPHERE_VIEWPORT_RATIO,
      APP17_AGENT_PAPER_PHOTOSPHERE_MIN_DIAMETER_PX,
      APP17_AGENT_PAPER_PHOTOSPHERE_MAX_DIAMETER_PX,
    );
    return {
      targetBodyDiameterPx,
      targetProjectedDiameterPx: targetBodyDiameterPx,
      representativeCarrierRatio: 0,
    };
  }
  const targetBodyDiameterPx = THREE.MathUtils.clamp(
    viewportHeight * APP17_PAPER_READING_BODY_VIEWPORT_RATIO,
    APP17_REPRESENTATIVE_BODY_CORE_MIN_DIAMETER_PX,
    APP17_REPRESENTATIVE_BODY_CORE_MAX_DIAMETER_PX,
  );
  const representativeCarrierRatio = representative
    ? APP17_PAPER_REPRESENTATIVE_CARRIER_VIEWPORT_RATIO
    : 0;
  return {
    targetBodyDiameterPx,
    targetProjectedDiameterPx: representative
      ? viewportHeight * representativeCarrierRatio
      : targetBodyDiameterPx,
    representativeCarrierRatio,
  };
}

function paperInspectionTargetDistance(
  camera: THREE.PerspectiveCamera,
  targetViewportRatio: number,
  worldDiameter = APP17_PAPER_INSPECTION_WORLD_DIAMETER,
  minimumDistance = APP17_SYSTEM_PAPER_FOCUS_MIN_DISTANCE,
  targetAnchorNdcX = 0,
) {
  const effectiveFov = THREE.MathUtils.degToRad(camera.getEffectiveFOV());
  const targetViewDepth = worldDiameter
    / Math.max(0.001, 2 * Math.tan(effectiveFov * 0.5) * targetViewportRatio);
  const anchorYaw = Math.atan(
    targetAnchorNdcX * camera.aspect * Math.tan(effectiveFov * 0.5),
  );
  const distance = targetViewDepth / Math.max(0.001, Math.abs(Math.cos(anchorYaw)));
  return THREE.MathUtils.clamp(
    distance,
    minimumDistance,
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
  if (
    transition.radialCameraTarget
    && transition.radialCameraDirection
    && transition.radialCameraStartDistance !== undefined
    && transition.radialCameraEndDistance !== undefined
  ) {
    const distanceFromTarget = transition.logarithmicDistance
      ? Math.exp(THREE.MathUtils.lerp(
          Math.log(Math.max(0.001, transition.radialCameraStartDistance)),
          Math.log(Math.max(0.001, transition.radialCameraEndDistance)),
          eased,
        ))
      : THREE.MathUtils.lerp(
          transition.radialCameraStartDistance,
          transition.radialCameraEndDistance,
          eased,
        );
    const cameraPosition = transition.radialCameraTarget.clone()
      .addScaledVector(transition.radialCameraDirection, distanceFromTarget);
    const direction = cameraPosition.sub(orbit.center);
    orbit.distance = Math.max(0.0001, direction.length());
    direction.normalize();
    orbit.azimuth = Math.atan2(direction.y, direction.x);
    orbit.elevation = Math.asin(THREE.MathUtils.clamp(direction.z, -1, 1));
  } else if (transition.cameraFrom && transition.cameraTo && transition.cameraControl) {
    const inverse = 1 - eased;
    const cameraPosition = transition.cameraFrom.clone().multiplyScalar(inverse * inverse)
      .addScaledVector(transition.cameraControl, 2 * inverse * eased)
      .addScaledVector(transition.cameraTo, eased * eased);
    const direction = cameraPosition.sub(orbit.center);
    if (direction.lengthSq() < 0.000001) direction.set(1, 0, 0);
    orbit.distance = Math.max(0.0001, direction.length());
    direction.normalize();
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
    const color = app17FamilyColor(hotspot.field, hotspot.topicId);
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
      ...app17BreathProfile(hotspot.trend, hotspot.id),
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
        color: app17PaperColor(hotspot.color),
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

function buildApp15TheoryHotspots(payload: App17GalaxyPayload) {
  return assignHotspotVisualMetrics(payload.hotspots.map((hotspot) => ({
    id: hotspot.id,
    title: hotspot.title || hotspot.label || `${hotspot.field} ${hotspot.topicId}`,
    field: hotspot.field,
    topicId: hotspot.topicId,
    paperCount: hotspot.paperCount,
    color: app17FamilyColor(hotspot.field, hotspot.topicId),
    size: hotspot.size,
    seed: stableHash(hotspot.id) / 4294967295,
    glowStrength: app17GlowStrength(hotspot.trend),
    ...app17BreathProfile(hotspot.trend, hotspot.id),
    importance: 0,
    displaySize: 0,
    position: new THREE.Vector3(hotspot.x * APP15_COORD_SCALE, hotspot.y * APP15_COORD_SCALE, hotspot.z * APP15_COORD_SCALE),
  })), "app15");
}

function buildApp15TheoryScene(
  payload: App17GalaxyPayload,
  visualProfile: GalaxyVisualProfile = "analysis",
): App17SceneData {
  const hotspots = buildApp15TheoryHotspots(payload);
  const papers = payload.papers.map((paper) => ({
    paperId: paper.scopedPaperId || paper.rawPaperId,
    topicKey: `${paper.field}_${paper.topicId}`,
    x: paper.x * APP15_COORD_SCALE,
    y: paper.y * APP15_COORD_SCALE,
    z: paper.z * APP15_COORD_SCALE,
    color: app17PaperColor(app17FamilyColor(paper.field, paper.topicId)),
    semanticColor: app17FamilyColor(paper.field, paper.topicId),
    size: THREE.MathUtils.clamp(paper.size || 2.2, 2.2, 3.6),
    alpha: 0.62,
    year: paper.year,
    ...paperVisualVariation(paper.scopedPaperId || paper.rawPaperId),
  }));
  const theoryFraming = resolveTheorySceneFraming(hotspots, papers, visualProfile);
  const camera = resolveTheoryCameraPreset({
    center: theoryFraming.center,
    framing: theoryFraming.framing,
    aspect: 16 / 9,
  });

  return {
    kind: "app15",
    papers,
    hotspots,
    orbitPositions: null,
    camera,
  };
}

function applyGalaxyReviewCameraPreset(
  cameraPreset: App17CameraPreset,
  sceneData: App17SceneData,
  preset: GalaxyReviewCameraPreset,
) {
  if (sceneData.kind !== "app15") return;
  const azimuth = Math.PI / 4;
  const elevation = THREE.MathUtils.degToRad(18);
  const center = cameraPreset.center.clone();
  let points: THREE.Vector3[] = [
    ...sceneData.hotspots.map((hotspot) => hotspot.position),
    ...sceneData.papers.map((paper) => new THREE.Vector3(paper.x, paper.y, paper.z)),
  ];

  if (preset === "interwoven") {
    const firstTopicKey = "Computational Biology_138";
    const secondTopicKey = "Computational Biology_96";
    const first = sceneData.hotspots.find((hotspot) => topicKeyFromHotspot(hotspot) === firstTopicKey);
    const second = sceneData.hotspots.find((hotspot) => topicKeyFromHotspot(hotspot) === secondTopicKey);
    if (first && second) {
      center.copy(first.position).add(second.position).multiplyScalar(0.5);
      points = [
        first.position,
        second.position,
        ...sceneData.papers
          .filter((paper) => paper.topicKey === firstTopicKey || paper.topicKey === secondTopicKey)
          .map((paper) => new THREE.Vector3(paper.x, paper.y, paper.z)),
      ];
    }
  }

  const radii = points
    .map((point) => point.distanceTo(center))
    .sort((first, second) => first - second);
  const p95Radius = percentileNumber(radii, 0.95) || 1;
  const framingFraction = preset === "interwoven" ? 0.62 : 0.78;
  const distance = Math.max(
    0.25,
    p95Radius / (
      framingFraction
      * Math.tan(THREE.MathUtils.degToRad(APP17_CAMERA_FOV) * 0.5)
    ),
  );
  cameraPreset.center.copy(center);
  cameraPreset.distance = distance;
  cameraPreset.fitDistance = distance;
  cameraPreset.azimuth = azimuth;
  cameraPreset.elevation = elevation;
  cameraPreset.fitAzimuth = azimuth;
  cameraPreset.fitElevation = elevation;
  cameraPreset.minDistance = Math.max(0.01, distance * 0.18);
  cameraPreset.maxDistance = Math.max(distance * 2.2, distance + p95Radius * 2);
  cameraPreset.autoRotate = false;
}

function resolveTheorySceneFraming(
  hotspots: App17RenderPoint[],
  papers: App17ParticlePoint[],
  visualProfile: GalaxyVisualProfile = "analysis",
) {
  const hotspotXs = hotspots.map((hotspot) => hotspot.position.x).sort((a, b) => a - b);
  const hotspotYs = hotspots.map((hotspot) => hotspot.position.y).sort((a, b) => a - b);
  const hotspotZs = hotspots.map((hotspot) => hotspot.position.z).sort((a, b) => a - b);
  const center = new THREE.Vector3(
    percentileNumber(hotspotXs, 0.5),
    percentileNumber(hotspotYs, 0.5),
    percentileNumber(hotspotZs, 0.5),
  );
  const boundsMin = new THREE.Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
  const boundsMax = new THREE.Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);
  const radii: number[] = [];
  const include = (point: THREE.Vector3) => {
    boundsMin.min(point);
    boundsMax.max(point);
    radii.push(point.distanceTo(center));
  };
  hotspots.forEach((hotspot) => include(hotspot.position));
  papers.forEach((paper) => include(new THREE.Vector3(paper.x, paper.y, paper.z)));
  radii.sort((a, b) => a - b);
  const fallbackRadius = 0.5;
  const maxRadius = Math.max(fallbackRadius, radii.at(-1) ?? fallbackRadius);
  const p95Radius = Math.max(maxRadius * 0.1, percentileNumber(radii, 0.95));
  const viewHotspots = hotspots.map((hotspot) => ({
    x: hotspot.position.x,
    y: hotspot.position.y,
    z: hotspot.position.z,
    topicKey: `${hotspot.field}_${hotspot.topicId}`,
    displaySize: hotspot.displaySize,
  }));
  const viewPapers = papers.map((paper) => ({
    x: paper.x,
    y: paper.y,
    z: paper.z,
    topicKey: paper.topicKey,
    displaySize: paper.size,
  }));
  const viewSelection = visualProfile === "agent-theory"
    ? selectDeterministicAgentTheoryView(
      viewHotspots,
      viewPapers,
      16 / 9,
      APP17_CAMERA_FOV,
    )
    : selectDeterministicTheoryView(
      viewHotspots,
      viewPapers,
      16 / 9,
      APP17_CAMERA_FOV,
    );
  return {
    center,
    framing: {
      p95Radius,
      maxRadius,
      boundsMin,
      boundsMax,
      viewSelection,
    } satisfies App17TheoryFraming,
  };
}

function resolveTheoryCameraPreset({
  center,
  framing,
  aspect,
}: {
  center: THREE.Vector3;
  framing: App17TheoryFraming;
  aspect: number;
}): App17CameraPreset {
  const verticalHalfFov = THREE.MathUtils.degToRad(APP17_CAMERA_FOV) * 0.5;
  const verticalTangent = Math.tan(verticalHalfFov);
  const horizontalTangent = verticalTangent * Math.max(0.1, aspect);
  const limitingTangent = Math.max(0.01, Math.min(verticalTangent, horizontalTangent));
  const distanceForCoverage = (coverage: number) => (
    framing.maxRadius / Math.max(0.01, coverage * limitingTangent)
  );
  const aspectCorrection = Math.max(1, (16 / 9) / Math.max(0.1, aspect));
  const optimizedDistance = framing.viewSelection.distance * aspectCorrection;
  const distance = Math.max(optimizedDistance, framing.p95Radius * 0.6);
  const fitDistance = Math.max(distance * 1.12, distanceForCoverage(0.86));
  const maxDistance = Math.max(distance * 1.75, distanceForCoverage(0.45));
  const minDistance = Math.max(0.01, framing.p95Radius * 0.2);
  const azimuth = framing.viewSelection.azimuth;
  const elevation = framing.viewSelection.elevation;
  return {
    center: center.clone(),
    distance,
    minDistance,
    maxDistance,
    azimuth,
    elevation,
    minElevation: THREE.MathUtils.degToRad(-80),
    maxElevation: THREE.MathUtils.degToRad(88),
    fitDistance,
    fitAzimuth: azimuth,
    fitElevation: elevation,
    topDistance: fitDistance,
    topAzimuth: THREE.MathUtils.degToRad(90),
    topElevation: THREE.MathUtils.degToRad(87.5),
    zScale: 1,
    autoRotate: false,
    autoRotateAzimuthStep: 0,
    theoryFraming: {
      p95Radius: framing.p95Radius,
      maxRadius: framing.maxRadius,
      boundsMin: framing.boundsMin.clone(),
      boundsMax: framing.boundsMax.clone(),
      viewSelection: { ...framing.viewSelection, score: { ...framing.viewSelection.score } },
    },
  };
}

function buildGalaxySystemResources(
  payload: App17GalaxyPayload,
  farBackgroundPayload: App17GalaxyPayload,
  hotspot: App17GalaxyHotspotPoint,
  representativePapers: HotspotEvidencePaperSnapshot[],
  pixelRatio: number,
  visualMode: GalaxySystemVisualMode,
  renderHotspots: App17RenderPoint[],
  visualProfile: GalaxyVisualProfile = "analysis",
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
  const semanticLayout = payload.paperLayoutVersion?.startsWith("semantic-") ?? false;
  const naturalSemanticLayout = payload.paperLayoutScaleMode === "shared"
    || payload.paperLayoutVersion === APP17_NATURAL_LAYOUT_VERSION;
  const relativePoints = topicPapers.map((paper) => ({
    paper,
    vector: new THREE.Vector3(
      paper.x - hotspot.x,
      paper.y - hotspot.y,
      (paper.z - hotspot.z) * (semanticLayout ? 1 : 0.62),
    ),
  }));
  const radii = relativePoints.map((item) => item.vector.length()).sort((a, b) => a - b);
  const percentileIndex = Math.min(radii.length - 1, Math.max(0, Math.floor(radii.length * 0.95)));
  const percentileRadius = radii[percentileIndex] || 1;
  const naturalLayoutUnitScale = naturalSemanticLayout
    ? Math.max(0.0001, payload.paperLayoutSharedScale ?? 1)
    : 1;
  const coordinateScale = naturalSemanticLayout
    ? APP17_SYSTEM_RADIUS /
      Math.max(
        0.0001,
        (payload.paperLayoutLocalP95Radius ?? 10.5) * naturalLayoutUnitScale,
      )
    : APP17_SYSTEM_RADIUS / Math.max(0.0001, percentileRadius);
  const scaledRadii = radii.map((radius) => radius * coordinateScale);
  const p99Index = Math.min(
    scaledRadii.length - 1,
    Math.max(0, Math.floor(scaledRadii.length * 0.99)),
  );
  const ordinaryCloudP99Radius = scaledRadii[p99Index] || APP17_SYSTEM_RADIUS;
  const frameRadius = Math.max(APP17_SYSTEM_RADIUS, ordinaryCloudP99Radius);
  const limitingTangent = Math.max(0.01, Math.tan(THREE.MathUtils.degToRad(APP17_CAMERA_FOV) * 0.5));
  const initialDistance = frameRadius / (0.72 * limitingTangent);
  const minDistance = Math.max(APP17_SYSTEM_STAR_RADIUS * 1.35, frameRadius * 0.2);
  const maxDistance = frameRadius / (0.45 * limitingTangent);
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
  const agentTheorySystem = visualProfile === "agent-theory";
  const systemPaperMinimumSize = agentTheorySystem
    ? APP17_AGENT_THEORY_SYSTEM_PAPER_FAR_MINIMUM_SIZE
    : APP17_SYSTEM_PAPER_MINIMUM_SIZE;
  const systemPaperMaximumSize = agentTheorySystem
    ? APP17_AGENT_THEORY_SYSTEM_PAPER_MAXIMUM_SIZE
    : APP17_SYSTEM_PAPER_MAXIMUM_SIZE;
  const systemPaperBaseAlpha = agentTheorySystem
    ? APP17_AGENT_THEORY_SYSTEM_PAPER_BASE_ALPHA
    : APP17_SYSTEM_PAPER_BASE_ALPHA;
  const cloudPoints: App17ParticlePoint[] = relativePoints
    .map((item) => {
      const paperId = item.paper.scopedPaperId || item.paper.rawPaperId;
      const position = item.vector.clone().multiplyScalar(coordinateScale);
      if (!semanticLayout && position.length() < APP17_SYSTEM_PAPER_STAR_EXCLUSION_RADIUS) {
        if (position.lengthSq() < 1e-12) {
          const random = seededRandom(stableHash(`${paperId}:star-exclusion`));
          position.set(random() - 0.5, random() - 0.5, random() - 0.5);
          if (position.lengthSq() < 1e-12) position.set(1, 0, 0);
        }
        position.setLength(APP17_SYSTEM_PAPER_STAR_EXCLUSION_RADIUS);
      }
      return {
        paperId,
        topicKey: topicKeyFromHotspot(hotspot),
        x: position.x,
        y: position.y,
        z: position.z,
        color: representativeYearColor(item.paper.year, minimumTopicYear, maximumTopicYear),
        haloColor: app17HotspotFamilyColor(hotspot),
        size: THREE.MathUtils.clamp(
          item.paper.size || systemPaperMinimumSize,
          systemPaperMinimumSize,
          systemPaperMaximumSize,
        ),
        alpha: systemPaperBaseAlpha,
        year: item.paper.year,
        ...paperVisualVariation(paperId),
      };
    });

  const root = new THREE.Group();
  root.visible = false;
  const farBackgroundLayer = visualMode === "theory"
    ? createTheoryFarBackgroundLayer(
        buildGalaxyFarBackgroundPlan(
          farBackgroundPayload.hotspots,
          farBackgroundPayload.papers,
          hotspot.id,
          coordinateScale,
        ),
        renderHotspots,
        pixelRatio,
      )
    : undefined;
  if (farBackgroundLayer) root.add(farBackgroundLayer.object);
  const cloudLayer = createSystemPaperLayer(
    cloudPoints,
    pixelRatio,
    false,
    visualProfile,
  );
  root.add(cloudLayer.object);
  const star = createSystemStar(hotspot);
  root.add(star.object);

  const resources: GalaxySystemResources = {
    hotspotId: hotspot.id,
    hotspot,
    visualMode,
    visualProfile,
    root,
    cloudLayer,
    farBackgroundLayer,
    star,
    representativePapers: [],
    canonicalPaperIdById,
    uniquePaperCount: topicPapers.length,
    duplicatePaperCount,
    hiddenRepresentativeCount: 0,
    unresolvedRepresentativeCount: 0,
    representativeSignature: "",
    representativeOwnershipBlend: visualMode === "theory" ? 0 : 1,
    representativeStyleBlend: visualMode === "theory" ? 0 : 1,
    representativeOrbitReveal: visualMode === "theory" ? 0 : 1,
    representativeOrbitMotionBlend: visualMode === "theory" ? 0 : 1,
    representativeTransitionElapsed: 0,
    representativeTransitionDirection: 0,
    representativeSemanticOrbitError: 0,
    representativeSafeOrbitCaptureCount: 0,
    representativeMaxLuminanceStep: 0,
    opacity: 0,
    activeTimeSeconds: 0,
    entryScale: 1,
    starEntryScale: 1,
    coordinateScale,
    cloudP95Radius: scaledRadii[percentileIndex] || APP17_SYSTEM_RADIUS,
    frameRadius,
    initialDistance,
    minDistance,
    maxDistance,
    setRepresentativeEntryProgress: (progress) => {
      if (resources.visualMode !== "theory") return;
      const ownership = smootherStep(smoothStepRange(
        APP17_REPRESENTATIVE_OWNERSHIP_START,
        1,
        progress,
      ));
      resources.representativeTransitionDirection = 0;
      resources.representativeTransitionElapsed = 0;
      resources.representativePapers.forEach((paper) => {
        paper.ownershipBlend = ownership;
        paper.styleBlend = 0;
        paper.orbitReveal = 0;
        paper.orbitMotionBlend = 0;
        paper.orbit.phase = 0;
        paper.position.copy(paper.semanticPosition);
      });
      applyRepresentativeTransitionVisuals(resources);
    },
    startRepresentativeSettle: () => {
      if (resources.visualMode !== "theory") return;
      resources.representativeTransitionElapsed = 0;
      resources.representativeTransitionDirection = 1;
      resources.representativePapers.forEach((paper) => {
        paper.ownershipBlend = 1;
      });
      applyRepresentativeTransitionVisuals(resources);
    },
    startRepresentativeExit: () => {
      if (resources.visualMode !== "theory") return;
      resources.representativeTransitionElapsed = 0;
      resources.representativeTransitionDirection = -1;
    },
    updateAnimation: (elapsedSeconds, motionEnabled, frozenPaperIds) => {
      const elapsed = THREE.MathUtils.clamp(elapsedSeconds, 0, 0.12);
      let positionsChanged = false;
      const transitionChanged = resources.representativeTransitionDirection !== 0 && elapsed > 0;
      if ((motionEnabled || transitionChanged) && elapsed > 0) {
        resources.activeTimeSeconds += elapsed;
        if (transitionChanged) resources.representativeTransitionElapsed += elapsed;
        resources.representativePapers.forEach((paper) => {
          if (resources.representativeTransitionDirection > 0) {
            const localTime = Math.max(
              0,
              resources.representativeTransitionElapsed - paper.transitionDelaySeconds,
            );
            const targetStyleBlend = smootherStep(THREE.MathUtils.clamp(
              localTime / APP17_REPRESENTATIVE_STYLE_DURATION_SECONDS,
              0,
              1,
            ));
            paper.styleBlend = Math.min(
              targetStyleBlend,
              paper.styleBlend + APP17_REPRESENTATIVE_MAX_STYLE_STEP,
            );
            paper.orbitReveal = smootherStep(THREE.MathUtils.clamp(
              localTime / APP17_REPRESENTATIVE_ORBIT_REVEAL_DURATION_SECONDS,
              0,
              1,
            ));
            paper.orbitMotionBlend = smootherStep(THREE.MathUtils.clamp(
              (localTime - APP17_REPRESENTATIVE_MOTION_DELAY_SECONDS)
                / APP17_REPRESENTATIVE_MOTION_DURATION_SECONDS,
              0,
              1,
            ));
            if (
              motionEnabled
              && !frozenPaperIds.has(paper.id)
              && !paper.requiresSafeOrbitCapture
            ) {
              paper.orbit.phase = (
                paper.orbit.phase
                + paper.orbit.angularSpeed * elapsed * paper.orbitMotionBlend
              ) % (Math.PI * 2);
            }
          } else if (resources.representativeTransitionDirection < 0) {
            paper.orbitMotionBlend = Math.max(
              0,
              paper.orbitMotionBlend - elapsed / APP17_REPRESENTATIVE_MOTION_DURATION_SECONDS,
            );
            paper.orbitReveal = Math.max(
              0,
              paper.orbitReveal - elapsed / APP17_REPRESENTATIVE_ORBIT_REVEAL_DURATION_SECONDS,
            );
            paper.styleBlend = Math.max(
              0,
              paper.styleBlend - Math.min(
                APP17_REPRESENTATIVE_MAX_STYLE_STEP,
                elapsed / APP17_REPRESENTATIVE_STYLE_DURATION_SECONDS,
              ),
            );
            if (
              paper.orbitMotionBlend <= 1e-6
              && paper.orbitReveal <= 1e-6
              && paper.styleBlend <= 1e-6
            ) {
              paper.ownershipBlend = Math.max(0, paper.ownershipBlend - elapsed / 0.6);
            }
          } else if (
            motionEnabled
            && paper.orbitMotionBlend > 0.999
            && !frozenPaperIds.has(paper.id)
          ) {
            paper.orbit.phase = (
              paper.orbit.phase + paper.orbit.angularSpeed * elapsed
            ) % (Math.PI * 2);
          }
          galaxySystemOrbitPoint(paper.orbit, paper.orbit.phase, paper.orbitPosition);
          if (paper.requiresSafeOrbitCapture && resources.representativeTransitionDirection > 0) {
            const captureProgress = smootherStep(THREE.MathUtils.clamp(
              (resources.representativeTransitionElapsed - paper.transitionDelaySeconds) / 1.2,
              0,
              1,
            ));
            hermiteRepresentativeCapturePoint(
              paper.semanticPosition,
              paper.orbitPosition,
              paper.orbit.tangentBasis,
              paper.orbit.minorRadius,
              captureProgress,
              paper.position,
            );
          } else if (resources.representativeTransitionDirection < 0) {
            paper.position.lerpVectors(
              paper.semanticPosition,
              paper.orbitPosition,
              smootherStep(paper.orbitMotionBlend),
            );
          } else if (paper.orbitMotionBlend > 1e-6 || resources.visualMode === "display") {
            paper.position.copy(paper.orbitPosition);
          } else {
            paper.position.copy(paper.semanticPosition);
          }
          positionsChanged = true;
        });
        if (
          resources.representativeTransitionDirection > 0
          && resources.representativeTransitionElapsed
            >= APP17_REPRESENTATIVE_ORBIT_REVEAL_DURATION_SECONDS
              + APP17_REPRESENTATIVE_STAGGER_MAX_SECONDS
          && resources.representativePapers.every((paper) => paper.styleBlend >= 1 - 1e-6)
        ) {
          resources.representativeTransitionDirection = 0;
          resources.representativePapers.forEach((paper) => {
            paper.styleBlend = 1;
            paper.orbitReveal = 1;
            paper.orbitMotionBlend = 1;
            paper.ownershipBlend = 1;
          });
        } else if (
          resources.representativeTransitionDirection < 0
          && resources.representativePapers.every((paper) => paper.ownershipBlend <= 1e-6)
        ) {
          resources.representativeTransitionDirection = 0;
          resources.representativePapers.forEach((paper) => {
            paper.position.copy(paper.semanticPosition);
          });
        }
        applyRepresentativeTransitionVisuals(resources);
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
        || transitionChanged
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
      resources.farBackgroundLayer?.dispose();
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
  const orbitArcDistances: number[] = [];
  const representativePoints: App17ParticlePoint[] = [];
  const systemPapers: GalaxySystemPaper[] = [];
  let semanticOrbitError = 0;
  let safeOrbitCaptureCount = 0;
  const knownYears = representatives
    .map(({ paper }) => paper.year)
    .filter((year): year is number => Number.isFinite(year));
  const minimumYear = knownYears.length > 0 ? Math.min(...knownYears) : 0;
  const maximumYear = knownYears.length > 0 ? Math.max(...knownYears) : 0;
  representatives.forEach(({ paper, rank, canonicalId }) => {
    const count = Math.max(1, representatives.length);
    const cloudPaper = resources.cloudLayer.getPaperById(canonicalId);
    const semanticPosition = cloudPaper?.position.clone() ?? new THREE.Vector3(1.35, 0, 0);
    const random = seededRandom(stableHash(paper.id));
    const requiresSafeOrbitCapture = resources.visualMode === "theory"
      && semanticPosition.length() < APP17_REPRESENTATIVE_SAFE_ORBIT_RADIUS;
    const orbit = resources.visualMode === "theory"
      ? createSemanticGalaxySystemOrbit(
          semanticPosition,
          paper.id,
          resources.cloudP95Radius,
        )
      : createDisplayGalaxySystemOrbit(rank, count, random);
    if (requiresSafeOrbitCapture) safeOrbitCaptureCount += 1;
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
      const startProgress = segment / APP17_SYSTEM_ORBIT_SEGMENTS;
      const endProgress = (segment + 1) / APP17_SYSTEM_ORBIT_SEGMENTS;
      orbitArcDistances.push(
        Math.min(startProgress, 1 - startProgress) * 2,
        Math.min(endProgress, 1 - endProgress) * 2,
      );
    }
    const orbitPosition = galaxySystemOrbitPoint(orbit, orbit.phase);
    if (!requiresSafeOrbitCapture && resources.visualMode === "theory") {
      semanticOrbitError = Math.max(
        semanticOrbitError,
        orbitPosition.distanceTo(semanticPosition),
      );
    }
    const position = resources.visualMode === "theory"
      ? semanticPosition.clone()
      : orbitPosition.clone();
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
      haloColor: app17HotspotFamilyColor(resources.hotspot),
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
      ordinaryDisplaySize: cloudPaper?.displaySize ?? (
        resources.visualProfile === "agent-theory"
          ? APP17_AGENT_THEORY_SYSTEM_PAPER_FAR_MINIMUM_SIZE
          : APP17_SYSTEM_PAPER_MINIMUM_SIZE
      ),
      ordinaryAlpha: resources.visualProfile === "agent-theory"
        ? APP17_AGENT_THEORY_SYSTEM_PAPER_BASE_ALPHA
        : APP17_SYSTEM_PAPER_BASE_ALPHA,
      color: representativeYearColor(paper.year, minimumYear, maximumYear),
      orbit,
      semanticPosition,
      orbitPosition,
      position,
      transitionDelaySeconds: (
        stableHash(`${paper.id}:representative-transition-delay`) / 4294967295
      ) * APP17_REPRESENTATIVE_STAGGER_MAX_SECONDS,
      ownershipBlend: resources.visualMode === "theory" ? 0 : 1,
      styleBlend: resources.visualMode === "theory" ? 0 : 1,
      orbitReveal: resources.visualMode === "theory" ? 0 : 1,
      orbitMotionBlend: resources.visualMode === "theory" ? 0 : 1,
      requiresSafeOrbitCapture,
      lastCombinedLuminance: resources.visualMode === "theory"
        ? resources.visualProfile === "agent-theory"
          ? APP17_AGENT_THEORY_SYSTEM_PAPER_BASE_ALPHA
          : APP17_SYSTEM_PAPER_BASE_ALPHA
        : 0.98,
    });
  });

  const representativeLayer = representativePoints.length > 0
    ? createSystemRepresentativeLayer(
        representativePoints,
        pixelRatio,
        resources.visualProfile,
      )
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
        new Float32Array(orbitArcDistances),
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
    semanticOrbitError,
    safeOrbitCaptureCount,
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
  resources.representativeSemanticOrbitError = bundle.semanticOrbitError;
  resources.representativeSafeOrbitCaptureCount = bundle.safeOrbitCaptureCount;
  resources.representativeMaxLuminanceStep = 0;
  resources.representativeSignature = bundle.signature;
  if (resources.visualMode === "theory") {
    resources.representativeTransitionDirection = 0;
    resources.representativeTransitionElapsed = 0;
    resources.representativePapers.forEach((paper) => {
      paper.ownershipBlend = 0;
      paper.styleBlend = 0;
      paper.orbitReveal = 0;
      paper.orbitMotionBlend = 0;
      paper.position.copy(paper.semanticPosition);
    });
  } else {
    resources.representativePapers.forEach((paper) => {
      paper.ownershipBlend = 1;
      paper.styleBlend = 1;
      paper.orbitReveal = 1;
      paper.orbitMotionBlend = 1;
    });
  }
  if (resources.representativeLayer) resources.root.add(resources.representativeLayer.object);
  if (resources.representativeBloomLayer) resources.root.add(resources.representativeBloomLayer.object);
  if (resources.orbitLayer) resources.root.add(resources.orbitLayer.object);
  applyRepresentativeTransitionVisuals(resources);
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
  visualProfile: GalaxyVisualProfile = "analysis",
) {
  const agentTheorySystem = visualProfile === "agent-theory";
  const farMinimumPointSize = agentTheorySystem
    ? APP17_AGENT_THEORY_SYSTEM_PAPER_FAR_MINIMUM_SIZE
    : 2.5;
  const mediumMinimumPointSize = agentTheorySystem
    ? APP17_AGENT_THEORY_SYSTEM_PAPER_MEDIUM_MINIMUM_SIZE
    : 2.6;
  const nearMinimumPointSize = agentTheorySystem
    ? APP17_AGENT_THEORY_SYSTEM_PAPER_NEAR_MINIMUM_SIZE
    : 2.8;
  const maximumPointSizeLimit = agentTheorySystem
    ? APP17_AGENT_THEORY_SYSTEM_PAPER_MAXIMUM_SIZE
    : 4.6;
  const depthBrightnessFloor = agentTheorySystem
    ? APP17_AGENT_THEORY_SYSTEM_PAPER_DEPTH_BRIGHTNESS_FLOOR
    : APP17_SYSTEM_PAPER_DEPTH_BRIGHTNESS_FLOOR;
  const depthSizeFloor = agentTheorySystem
    ? APP17_AGENT_THEORY_SYSTEM_PAPER_DEPTH_SIZE_FLOOR
    : APP17_SYSTEM_PAPER_DEPTH_SIZE_FLOOR;
  const focusContextBrightness = agentTheorySystem
    ? APP17_AGENT_THEORY_SYSTEM_PAPER_FOCUS_CONTEXT_BRIGHTNESS
    : APP17_SYSTEM_PAPER_FOCUS_CONTEXT_BRIGHTNESS;
  const focusNeighborBrightness = agentTheorySystem
    ? APP17_AGENT_THEORY_SYSTEM_PAPER_FOCUS_NEIGHBOR_BRIGHTNESS
    : APP17_SYSTEM_PAPER_FOCUS_NEIGHBOR_BRIGHTNESS;
  const count = papers.length;
  const positions = new Float32Array(count * 3);
  const coreColors = new Float32Array(count * 3);
  const haloColors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const alphas = new Float32Array(count);
  const originalAlphas = new Float32Array(count);
  const transitionStyles = new Float32Array(count);
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
    displaySize: paper.size,
    visualSizeVariation: paper.visualSizeVariation,
  }));
  const paperRecordById = new Map(paperRecords.map((paper) => [paper.id, paper]));
  const coreColor = new THREE.Color();
  const haloColor = new THREE.Color();
  const ordinaryBaseSizes: number[] = [];
  let currentLod: GalaxySystemPaperLod = "medium";
  let lodBlend = 0.5;
  let farBlend = 0;
  let nearBlend = 0;
  let minimumPointSize = mediumMinimumPointSize;
  let maximumPointSize = maximumPointSizeLimit;
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
    transitionStyles[index] = (paper.representativeRank ?? -1) >= 0 ? 1 : 0;
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
  const ordinaryBaseMinimum = ordinaryBaseSizes.length > 0
    ? Math.min(...ordinaryBaseSizes)
    : farMinimumPointSize;
  const ordinaryBaseMaximum = ordinaryBaseSizes.length > 0
    ? Math.max(...ordinaryBaseSizes)
    : maximumPointSizeLimit;

  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(positions, 3);
  if (dynamicPositions) positionAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", positionAttribute);
  geometry.setAttribute("coreColor", new THREE.BufferAttribute(coreColors, 3));
  geometry.setAttribute("haloColor", new THREE.BufferAttribute(haloColors, 3));
  const pointSizeAttribute = new THREE.BufferAttribute(sizes, 1);
  if (dynamicPositions) pointSizeAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("pointSize", pointSizeAttribute);
  const alphaAttribute = new THREE.BufferAttribute(alphas, 1);
  if (dynamicPositions) alphaAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("pointAlpha", alphaAttribute);
  const transitionStyleAttribute = new THREE.BufferAttribute(transitionStyles, 1);
  if (dynamicPositions) transitionStyleAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("transitionStyle", transitionStyleAttribute);
  geometry.setAttribute("representativeRank", new THREE.BufferAttribute(representativeRanks, 1));
  geometry.setAttribute("visualSeed", new THREE.BufferAttribute(visualSeeds, 1));
  geometry.setAttribute("rayAngle", new THREE.BufferAttribute(rayAngles, 1));
  geometry.setAttribute("sizeVariation", new THREE.BufferAttribute(sizeVariations, 1));
  geometry.setAttribute("brightnessVariation", new THREE.BufferAttribute(brightnessVariations, 1));
  const focusAttribute = new THREE.BufferAttribute(focusValues, 1).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("focusIntensity", focusAttribute);
  const paperFocusMaskAttribute = new THREE.BufferAttribute(paperFocusMasks, 1).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("paperFocusMask", paperFocusMaskAttribute);

  const material = createSystemPaperMaterial(
    pixelRatio,
    dynamicPositions,
    visualProfile,
  );
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
        THREE.MathUtils.lerp(
          mediumMinimumPointSize,
          farMinimumPointSize,
          nextFarBlend,
        ),
        nearMinimumPointSize,
        nextNearBlend,
      );
      minimumPointSize = THREE.MathUtils.clamp(
        Math.max(shaderMinimum, ordinaryBaseMinimum * sizeScale * 0.96),
        farMinimumPointSize,
        maximumPointSizeLimit,
      );
      maximumPointSize = THREE.MathUtils.clamp(
        ordinaryBaseMaximum * sizeScale * 1.12,
        minimumPointSize,
        maximumPointSizeLimit,
      );
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
        ? agentTheorySystem
          ? focusContextBrightness
          : APP17_SYSTEM_PAPER_FOCUS_REPRESENTATIVE_BRIGHTNESS
        : focusContextBrightness;
      material.uniforms.uPaperFocusNeighborBrightness.value = dynamicPositions
        ? agentTheorySystem
          ? focusNeighborBrightness
          : APP17_SYSTEM_PAPER_FOCUS_REPRESENTATIVE_BRIGHTNESS
        : focusNeighborBrightness;
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
      baseAlpha: agentTheorySystem
        ? APP17_AGENT_THEORY_SYSTEM_PAPER_BASE_ALPHA
        : APP17_SYSTEM_PAPER_BASE_ALPHA,
      depthBrightnessFloor,
      depthSizeFloor,
      focusContextBrightness,
      focusNeighborBrightness,
      stableCoreDiameterPhysicalPixels: agentTheorySystem ? 1.2 : 0.8,
      stableCoreEnergy: agentTheorySystem ? 0.74 : 0.58,
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
    setRepresentativeOwnership: (ownershipByPaperId: Map<string, number>) => {
      for (let index = 0; index < alphas.length; index += 1) {
        const ownership = ownershipByPaperId.get(paperIds[index]) ?? 0;
        alphas[index] = originalAlphas[index] * (1 - THREE.MathUtils.clamp(ownership, 0, 1));
      }
      alphaAttribute.needsUpdate = true;
    },
    setPointPresentation: (
      presentations: Array<{ alpha: number; size: number; style: number }>,
    ) => {
      const updateCount = Math.min(presentations.length, count);
      for (let index = 0; index < updateCount; index += 1) {
        alphas[index] = presentations[index].alpha;
        sizes[index] = presentations[index].size;
        transitionStyles[index] = presentations[index].style;
      }
      alphaAttribute.needsUpdate = true;
      pointSizeAttribute.needsUpdate = true;
      transitionStyleAttribute.needsUpdate = true;
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

function createSystemRepresentativeLayer(
  papers: App17ParticlePoint[],
  pixelRatio: number,
  visualProfile: GalaxyVisualProfile = "analysis",
) {
  return createSystemPaperLayer(
    papers,
    pixelRatio,
    true,
    visualProfile,
  );
}

function createSystemRepresentativeBloomLayer(papers: App17ParticlePoint[], pixelRatio: number) {
  const count = papers.length;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const strengths = new Float32Array(count);
  const baseStrengths = new Float32Array(count);
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
    baseStrengths[index] = (index < 3
      ? [0.22, 0.18, 0.15][index]
      : THREE.MathUtils.lerp(0.12, 0.05, THREE.MathUtils.clamp((index - 3) / 6, 0, 1)))
      * APP17_REPRESENTATIVE_BLOOM_STRENGTH_SCALE;
    strengths[index] = baseStrengths[index];
    representativeRanks[index] = paper.representativeRank ?? index;
  });
  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", positionAttribute);
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("pointSize", new THREE.BufferAttribute(sizes, 1));
  const bloomStrengthAttribute = new THREE.BufferAttribute(strengths, 1).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("bloomStrength", bloomStrengthAttribute);
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
    setPaperFocusBlend: (
      blend: number,
      inspectionBlend: number,
      targetRank: number,
    ) => {
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
    setTransitionStyles: (styles: Array<{ ownership: number; style: number }>) => {
      const updateCount = Math.min(styles.length, count);
      for (let index = 0; index < updateCount; index += 1) {
        strengths[index] = baseStrengths[index]
          * THREE.MathUtils.clamp(styles[index].ownership, 0, 1)
          * THREE.MathUtils.clamp(styles[index].style, 0, 1);
      }
      bloomStrengthAttribute.needsUpdate = true;
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
  arcDistances: Float32Array,
) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("orbitRank", new THREE.BufferAttribute(orbitRanks, 1));
  geometry.setAttribute("baseAlpha", new THREE.BufferAttribute(baseAlphas, 1));
  geometry.setAttribute("arcDistance", new THREE.BufferAttribute(arcDistances, 1));
  const emphasisValues = new Float32Array(10);
  const emphasisTargets = new Float32Array(10);
  const revealValues = new Float32Array(10).fill(1);
  let paperInspectionBlend = 0;
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uSceneOpacity: { value: 1 },
      uEmphasis: { value: emphasisValues },
      uReveal: { value: revealValues },
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
    // The journey target is a dedicated reading foreground. Keeping it in the
    // system depth buffer lets the (visually faded) central star erase it for
    // several frames during return, which reads as a sudden model swap.
    depthTest: false,
    blending: THREE.NormalBlending,
    toneMapped: false,
    vertexShader: `
      attribute vec3 color;
      attribute float orbitRank;
      attribute float baseAlpha;
      attribute float arcDistance;
      uniform float uSystemCenterViewDepth;
      uniform float uSystemDepthRange;
      varying vec3 vColor;
      varying float vOrbitRank;
      varying float vBaseAlpha;
      varying float vRelativeDepth;
      varying float vArcDistance;
      void main() {
        vColor = color;
        vOrbitRank = orbitRank;
        vBaseAlpha = baseAlpha;
        vArcDistance = arcDistance;
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
      uniform float uReveal[10];
      varying vec3 vColor;
      varying float vOrbitRank;
      varying float vBaseAlpha;
      varying float vRelativeDepth;
      varying float vArcDistance;
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
      float revealForRank(float rank) {
        if (rank < 0.5) return uReveal[0];
        if (rank < 1.5) return uReveal[1];
        if (rank < 2.5) return uReveal[2];
        if (rank < 3.5) return uReveal[3];
        if (rank < 4.5) return uReveal[4];
        if (rank < 5.5) return uReveal[5];
        if (rank < 6.5) return uReveal[6];
        if (rank < 7.5) return uReveal[7];
        if (rank < 8.5) return uReveal[8];
        return uReveal[9];
      }
      void main() {
        float emphasis = emphasisForRank(vOrbitRank);
        float reveal = revealForRank(vOrbitRank);
        float revealThreshold = mix(0.04, 1.02, reveal);
        float revealAlpha = (1.0 - smoothstep(revealThreshold, revealThreshold + 0.05, vArcDistance))
          * smoothstep(0.0, 0.04, reveal);
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
          * revealAlpha
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
    setReveal: (reveals: number[]) => {
      for (let rank = 0; rank < revealValues.length; rank += 1) {
        revealValues[rank] = THREE.MathUtils.clamp(reveals[rank] ?? 0, 0, 1);
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

function createDisplayGalaxySystemOrbit(
  rank: number,
  count: number,
  random: () => number,
): GalaxySystemOrbit {
  const radius = count === 1 ? 1.35 : 0.82 + (rank / Math.max(1, count - 1)) * 2.18;
  const minorRadius = radius * (0.76 + random() * 0.16);
  const nodeAngle = random() * Math.PI * 2;
  const phase = random() * Math.PI * 2;
  const normalizedRadius = THREE.MathUtils.clamp((radius - 0.82) / 2.18, 0, 1);
  const periodSeconds = THREE.MathUtils.lerp(
    APP17_SYSTEM_INNER_ORBIT_PERIOD_SECONDS,
    APP17_SYSTEM_OUTER_ORBIT_PERIOD_SECONDS,
    Math.pow(normalizedRadius, 1.25),
  );
  const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, nodeAngle, "XYZ"));
  return {
    majorRadius: radius,
    minorRadius,
    phase,
    angularSpeed: (Math.PI * 2) / periodSeconds,
    radialBasis: new THREE.Vector3(1, 0, 0).applyQuaternion(rotation),
    tangentBasis: new THREE.Vector3(0, 1, 0).applyQuaternion(rotation),
  };
}

function createSemanticGalaxySystemOrbit(
  semanticPosition: THREE.Vector3,
  paperId: string,
  cloudP95Radius: number,
): GalaxySystemOrbit {
  const semanticRadius = semanticPosition.length();
  const majorRadius = Math.max(APP17_REPRESENTATIVE_SAFE_ORBIT_RADIUS, semanticRadius);
  const random = seededRandom(stableHash(`${paperId}:semantic-orbit`));
  const radialBasis = semanticRadius > 1e-9
    ? semanticPosition.clone().normalize()
    : new THREE.Vector3(random() - 0.5, random() - 0.5, random() - 0.5).normalize();
  if (radialBasis.lengthSq() < 1e-12) radialBasis.set(1, 0, 0);
  const tangentSeed = new THREE.Vector3(random() - 0.5, random() - 0.5, random() - 0.5);
  tangentSeed.addScaledVector(radialBasis, -tangentSeed.dot(radialBasis));
  if (tangentSeed.lengthSq() < 1e-12) {
    const fallbackAxis = Math.abs(radialBasis.z) < 0.8
      ? new THREE.Vector3(0, 0, 1)
      : new THREE.Vector3(0, 1, 0);
    tangentSeed.crossVectors(fallbackAxis, radialBasis);
  }
  const tangentBasis = tangentSeed.normalize();
  const minorRadius = majorRadius * THREE.MathUtils.lerp(0.82, 0.94, random());
  const normalizedRadius = THREE.MathUtils.clamp(
    majorRadius / Math.max(APP17_REPRESENTATIVE_SAFE_ORBIT_RADIUS, cloudP95Radius),
    0,
    1,
  );
  const periodSeconds = THREE.MathUtils.lerp(
    APP17_SYSTEM_INNER_ORBIT_PERIOD_SECONDS,
    APP17_SYSTEM_OUTER_ORBIT_PERIOD_SECONDS,
    Math.pow(normalizedRadius, 1.25),
  );
  const direction = random() < 0.5 ? -1 : 1;
  return {
    majorRadius,
    minorRadius,
    phase: 0,
    angularSpeed: direction * (Math.PI * 2) / periodSeconds,
    radialBasis,
    tangentBasis,
  };
}

function galaxySystemOrbitPoint(orbit: GalaxySystemOrbit, angle: number, target = new THREE.Vector3()) {
  return target.copy(orbit.radialBasis)
    .multiplyScalar(orbit.majorRadius * Math.cos(angle))
    .addScaledVector(orbit.tangentBasis, orbit.minorRadius * Math.sin(angle));
}

function hermiteRepresentativeCapturePoint(
  start: THREE.Vector3,
  end: THREE.Vector3,
  endTangentDirection: THREE.Vector3,
  orbitMinorRadius: number,
  progress: number,
  target: THREE.Vector3,
) {
  const t = THREE.MathUtils.clamp(progress, 0, 1);
  const t2 = t * t;
  const t3 = t2 * t;
  const startWeight = 2 * t3 - 3 * t2 + 1;
  const endWeight = -2 * t3 + 3 * t2;
  const endTangentWeight = t3 - t2;
  return target.copy(start)
    .multiplyScalar(startWeight)
    .addScaledVector(end, endWeight)
    .addScaledVector(endTangentDirection, endTangentWeight * orbitMinorRadius * 0.35);
}

function applyRepresentativeTransitionVisuals(resources: GalaxySystemResources) {
  const ownershipByCanonicalId = new Map<string, number>();
  const presentations: Array<{ alpha: number; size: number; style: number }> = [];
  const bloomStyles: Array<{ ownership: number; style: number }> = [];
  const orbitReveals = new Array<number>(10).fill(0);
  let ownershipTotal = 0;
  let styleTotal = 0;
  let revealTotal = 0;
  let motionTotal = 0;
  resources.representativePapers.forEach((paper) => {
    const canonicalId = resources.canonicalPaperIdById.get(paper.id) ?? paper.id;
    ownershipByCanonicalId.set(canonicalId, paper.ownershipBlend);
    const representativeLuminance = THREE.MathUtils.lerp(
      paper.ordinaryAlpha,
      0.98,
      paper.styleBlend,
    );
    const combinedLuminance = paper.ordinaryAlpha * (1 - paper.ownershipBlend)
      + representativeLuminance * paper.ownershipBlend;
    resources.representativeMaxLuminanceStep = Math.max(
      resources.representativeMaxLuminanceStep,
      Math.abs(combinedLuminance - paper.lastCombinedLuminance),
    );
    paper.lastCombinedLuminance = combinedLuminance;
    presentations.push({
      alpha: representativeLuminance * paper.ownershipBlend,
      size: THREE.MathUtils.lerp(
        paper.ordinaryDisplaySize,
        paper.displaySize,
        paper.styleBlend,
      ),
      style: paper.styleBlend,
    });
    bloomStyles.push({
      ownership: paper.ownershipBlend,
      style: paper.styleBlend,
    });
    orbitReveals[paper.rank] = paper.orbitReveal;
    ownershipTotal += paper.ownershipBlend;
    styleTotal += paper.styleBlend;
    revealTotal += paper.orbitReveal;
    motionTotal += paper.orbitMotionBlend;
  });
  const count = Math.max(1, resources.representativePapers.length);
  resources.representativeOwnershipBlend = ownershipTotal / count;
  resources.representativeStyleBlend = styleTotal / count;
  resources.representativeOrbitReveal = revealTotal / count;
  resources.representativeOrbitMotionBlend = motionTotal / count;
  resources.cloudLayer.setRepresentativeOwnership(ownershipByCanonicalId);
  resources.representativeLayer?.setPointPresentation(presentations);
  resources.representativeBloomLayer?.setTransitionStyles(bloomStyles);
  resources.orbitLayer?.setReveal(orbitReveals);
}

function setGalaxySystemOpacity(resources: GalaxySystemResources, opacity: number) {
  resources.opacity = opacity;
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
  compactDiameter: number;
  worldDiameter: number;
  targetBodyDiameterPx: number;
  compactLod: number;
  centered: boolean;
  fullscreen: boolean;
  wideLayout: boolean;
  timeSeconds: number;
  motionStrength: number;
};

function createPaperInspectionVisual(visualProfile: GalaxyVisualProfile) {
  const object = new THREE.Group();
  object.visible = false;
  const dataSphere = createPaperInspectionDataSphere();
  const energyCore = createPaperInspectionEnergyCore();
  const photosphere = createPaperInspectionPhotosphere();
  object.add(dataSphere.object, energyCore.object, photosphere.object);
  let visualType: GalaxyPaperInspectionVisualType = "none";

  return {
    object,
    get hitObject() {
      return visualType === "photosphere"
        ? photosphere.hitObject
        : visualType === "energy-core"
          ? energyCore.hitObject
          : dataSphere.hitObject;
    },
    configure: (configuration: PaperInspectionVisualConfiguration) => {
      visualType = visualProfile === "agent-theory"
        ? "photosphere"
        : configuration.representative
          ? "energy-core"
          : "data-sphere";
      dataSphere.object.visible = false;
      energyCore.object.visible = false;
      photosphere.object.visible = false;
      if (visualType === "photosphere") {
        photosphere.configure(configuration);
      } else if (visualType === "energy-core") {
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
        photosphere.object.visible = false;
        return;
      }
      if (visualType === "photosphere") {
        dataSphere.object.visible = false;
        energyCore.object.visible = false;
        photosphere.setVisual(frame);
      } else if (visualType === "energy-core") {
        dataSphere.object.visible = false;
        photosphere.object.visible = false;
        energyCore.setVisual(frame);
      } else {
        energyCore.object.visible = false;
        photosphere.object.visible = false;
        dataSphere.setVisual(frame);
      }
    },
    getVisualState: () => {
      const state = visualType === "photosphere"
        ? photosphere.getVisualState()
        : visualType === "energy-core"
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
              ordinarySurfaceMorph: 0,
              ordinaryAtmosphereMorph: 0,
              handoffDiameterRatio: 1,
              representativeCarrierEdgeLeak: 0,
            };
      return { ...state, visualType };
    },
    dispose: () => {
      dataSphere.dispose();
      energyCore.dispose();
      photosphere.dispose();
    },
  };
}

function createPaperInspectionPhotosphere() {
  const object = new THREE.Group();
  object.visible = false;
  let projectedDiameter = 0;
  let viewportRatio = 0;
  let currentPaperId = "";
  let rotationAngle = 0;
  let rotationSpeed = 0.04;
  let lastVisualTimeSeconds = Number.NaN;
  let surfaceBlend = 0;
  let coronaBlend = 0;
  let handoffDiameterRatio = 1;
  let photosphereLodActive = false;
  let surfaceProfile = createPaperSurfaceProfile("agent-paper-default");

  const geometry = new THREE.SphereGeometry(0.5, 72, 48);
  const bodyMaterial = new THREE.ShaderMaterial({
    name: "agent-theory-paper-photosphere-body",
    uniforms: {
      uBodyColor: { value: new THREE.Color("#9fb9db") },
      uRotationAxis: { value: surfaceProfile.rotationAxis.clone() },
      uRotationAngle: { value: 0 },
      uPhase: { value: surfaceProfile.phases.clone() },
      uOpacity: { value: 0 },
      uSurfaceBlend: { value: 0 },
      uRepresentativeStrength: { value: 0 },
    },
    transparent: true,
    depthWrite: true,
    depthTest: true,
    toneMapped: false,
    vertexShader: `
      varying vec3 vLocalPosition;
      varying vec3 vNormalView;
      varying vec3 vViewDirection;
      void main() {
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        vLocalPosition = position * 2.0;
        vNormalView = normalize(normalMatrix * normal);
        vViewDirection = normalize(-viewPosition.xyz);
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uBodyColor;
      uniform vec3 uRotationAxis;
      uniform float uRotationAngle;
      uniform vec3 uPhase;
      uniform float uOpacity;
      uniform float uSurfaceBlend;
      uniform float uRepresentativeStrength;
      varying vec3 vLocalPosition;
      varying vec3 vNormalView;
      varying vec3 vViewDirection;

      vec3 rotateAroundAxis(vec3 value, vec3 axis, float angle) {
        float cosine = cos(angle);
        float sine = sin(angle);
        return value * cosine
          + cross(axis, value) * sine
          + axis * dot(axis, value) * (1.0 - cosine);
      }

      float hash31(vec3 point) {
        return fract(sin(dot(point, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
      }

      float noise3(vec3 point) {
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
        return mix(
          mix(nx00, nx10, local.y),
          mix(nx01, nx11, local.y),
          local.z
        );
      }

      float stellarFbm(vec3 point) {
        float value = 0.0;
        float amplitude = 0.56;
        for (int octave = 0; octave < 4; octave += 1) {
          value += noise3(point) * amplitude;
          point = point * 2.03 + vec3(7.1, 3.7, 5.3);
          amplitude *= 0.48;
        }
        return value;
      }

      float stellarRidgedFbm(vec3 point) {
        float value = 0.0;
        float amplitude = 0.58;
        for (int octave = 0; octave < 4; octave += 1) {
          float ridge = 1.0 - abs(noise3(point) * 2.0 - 1.0);
          value += ridge * ridge * amplitude;
          point = point * 2.11 + vec3(5.7, 9.2, 3.4);
          amplitude *= 0.47;
        }
        return value;
      }

      void main() {
        vec3 direction = rotateAroundAxis(
          normalize(vLocalPosition),
          normalize(uRotationAxis),
          uRotationAngle
        );
        float macroPlasma = stellarFbm(direction * 3.4 + uPhase * 0.38);
        vec3 domainWarp = vec3(
          stellarFbm(direction * 6.8 + uPhase),
          stellarFbm(direction * 6.8 + uPhase.yzx + 11.3),
          stellarFbm(direction * 6.8 + uPhase.zxy + 23.7)
        ) - 0.5;
        vec3 plasmaDirection = normalize(direction + domainWarp * 0.18);
        float broadCurrent = stellarFbm(
          plasmaDirection * 4.6 + uPhase.zxy * 0.72
        );
        float middleCurrent = stellarFbm(
          plasmaDirection * 8.2 - uPhase.yzx * 1.22
        );
        float fineCurrent = stellarFbm(
          plasmaDirection * 17.5 + uPhase.xyz * 1.84
        );
        float middleContourTarget = 0.51 + (broadCurrent - 0.5) * 0.08;
        float middleAa = clamp(fwidth(middleCurrent), 0.003, 0.016);
        float middleFilament = 1.0 - smoothstep(
          middleAa * 0.58,
          middleAa * 1.48,
          abs(middleCurrent - middleContourTarget)
        );
        float currentGate = smoothstep(
          0.36,
          0.70,
          broadCurrent * 0.64 + macroPlasma * 0.36
        );
        middleFilament *= mix(0.18, 1.0, currentGate);
        float fineContourTarget = 0.51 + (middleCurrent - 0.5) * 0.06;
        float fineAa = clamp(fwidth(fineCurrent), 0.0025, 0.013);
        float fineFilament = 1.0 - smoothstep(
          fineAa * 0.44,
          fineAa * 1.12,
          abs(fineCurrent - fineContourTarget)
        );
        fineFilament *= smoothstep(0.40, 0.72, middleCurrent);
        float microRidge = stellarRidgedFbm(
          plasmaDirection * 34.0 - uPhase.yzx * 1.9
        );
        float microFilament = smoothstep(0.93, 1.06, microRidge);
        float filamentNetwork = clamp(
          middleFilament * 0.64
            + fineFilament * 0.34
            + microFilament * 0.12,
          0.0,
          1.0
        );
        float granules = stellarFbm(
          plasmaDirection * 38.0 + uPhase.yzx * 2.3
        );
        float granuleDelta = clamp((granules - 0.52) * 0.72, -0.19, 0.20);
        float mu = clamp(dot(normalize(vNormalView), normalize(vViewDirection)), 0.0, 1.0);
        float limbEmission = pow(1.0 - mu, 2.1);
        float coreEnvelope = pow(mu, 1.38);
        float hotPocket = smoothstep(
          0.54,
          0.86,
          broadCurrent * 0.72 + middleFilament * 0.24 + fineFilament * 0.12
        );
        float irregularCore = coreEnvelope
          * (0.20 + hotPocket * 0.58 + filamentNetwork * 0.28);
        float thermal = clamp(
          0.28
            + granuleDelta
            + filamentNetwork * 0.34
            + (macroPlasma - 0.5) * 0.20
            + (broadCurrent - 0.5) * 0.14,
          0.0,
          1.0
        );
        vec3 coolSurface = mix(uBodyColor, vec3(0.18, 0.24, 0.54), 0.52);
        vec3 midSurface = mix(uBodyColor, vec3(0.54, 0.66, 0.96), 0.72);
        vec3 hotSurface = vec3(1.0, 0.998, 0.985);
        vec3 radiance = coolSurface
          * (0.56 + macroPlasma * 0.15 + granuleDelta * 0.18);
        radiance += midSurface
          * (0.10 + thermal * 0.46 + broadCurrent * 0.08);
        radiance += hotSurface
          * filamentNetwork
          * (0.48 + thermal * 0.38);
        radiance += mix(uBodyColor, vec3(0.74, 0.84, 1.0), 0.82)
          * limbEmission
          * (0.32 + filamentNetwork * 0.36);
        float whiteHotCore = irregularCore
          * (0.66 + thermal * 0.30 + filamentNetwork * 0.18);
        radiance += hotSurface
          * whiteHotCore
          * (1.06 + uRepresentativeStrength * 0.04);
        vec3 compactPoint = mix(uBodyColor, vec3(1.0), 0.88)
          * (0.92 + mu * 0.30);
        vec3 color = mix(compactPoint, radiance, uSurfaceBlend);
        color = vec3(1.0) - exp(-max(color, vec3(0.0)) * 1.30);
        gl_FragColor = vec4(color, uOpacity);
      }
    `,
  });
  const body = new THREE.Mesh(geometry, bodyMaterial);
  body.renderOrder = 10;
  body.frustumCulled = false;
  object.add(body);

  const energyVeilMaterial = new THREE.ShaderMaterial({
    name: "agent-theory-paper-photosphere-energy-veil",
    uniforms: {
      uVeilColor: { value: new THREE.Color("#dce7ff") },
      uRotationAxis: { value: surfaceProfile.rotationAxis.clone() },
      uRotationAngle: { value: 0 },
      uPhase: { value: surfaceProfile.phases.clone() },
      uOpacity: { value: 0 },
      uSurfaceBlend: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    side: THREE.FrontSide,
    vertexShader: `
      varying vec3 vLocalPosition;
      varying vec3 vNormalView;
      varying vec3 vViewDirection;

      void main() {
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        vLocalPosition = position * 2.0;
        vNormalView = normalize(normalMatrix * normal);
        vViewDirection = normalize(-viewPosition.xyz);
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uVeilColor;
      uniform vec3 uRotationAxis;
      uniform float uRotationAngle;
      uniform vec3 uPhase;
      uniform float uOpacity;
      uniform float uSurfaceBlend;
      varying vec3 vLocalPosition;
      varying vec3 vNormalView;
      varying vec3 vViewDirection;

      vec3 rotateAroundAxis(vec3 value, vec3 axis, float angle) {
        float cosine = cos(angle);
        float sine = sin(angle);
        return value * cosine
          + cross(axis, value) * sine
          + axis * dot(axis, value) * (1.0 - cosine);
      }

      void main() {
        float mu = clamp(
          dot(normalize(vNormalView), normalize(vViewDirection)),
          0.0,
          1.0
        );
        vec3 direction = rotateAroundAxis(
          normalize(vLocalPosition),
          normalize(uRotationAxis),
          uRotationAngle
        );
        float fineEnergy = 0.5 + 0.5 * sin(
          dot(direction, vec3(31.7, 47.3, 23.9))
            + sin(dot(direction, vec3(17.1, 29.4, 41.2)) + uPhase.x)
        );
        float coherentEnergy = 0.5 + 0.5 * sin(
          dot(direction, vec3(7.9, 13.7, 19.3))
            + sin(dot(direction, vec3(11.1, 5.4, 17.2)) + uPhase.y) * 1.35
            + uPhase.z * 0.31
        );
        float hotPocket = smoothstep(
          0.42,
          0.82,
          fineEnergy * 0.42 + coherentEnergy * 0.58
        );
        float innerHeat = pow(mu, 1.72) * (0.54 + hotPocket * 0.46);
        float whiteCore = pow(mu, 4.8) * (0.42 + hotPocket * 0.58);
        float alpha = uOpacity
          * uSurfaceBlend
          * (innerHeat * 0.082 + whiteCore * 0.16)
          * (0.82 + fineEnergy * 0.16 + coherentEnergy * 0.14);
        if (alpha < 0.001) discard;
        vec3 veilRadiance = mix(
          uVeilColor,
          vec3(1.0, 0.998, 0.985),
          clamp(whiteCore + hotPocket * 0.22, 0.0, 1.0)
        );
        gl_FragColor = vec4(
          veilRadiance * (1.08 + whiteCore * 0.66 + hotPocket * 0.16),
          alpha
        );
      }
    `,
  });
  const energyVeil = new THREE.Mesh(geometry, energyVeilMaterial);
  energyVeil.renderOrder = 11;
  energyVeil.frustumCulled = false;
  energyVeil.scale.setScalar(1.003);
  object.add(energyVeil);

  const silhouetteRingGeometry = new THREE.PlaneGeometry(1, 1, 1, 1);
  const silhouetteRingMaterial = new THREE.ShaderMaterial({
    name: "agent-theory-paper-photosphere-silhouette-ring",
    uniforms: {
      uRingColor: { value: new THREE.Color("#d7e4ff") },
      uPhase: { value: surfaceProfile.phases.clone() },
      uSphereCenterView: { value: new THREE.Vector3(0, 0, -1) },
      uSphereRadius: { value: 0.5 },
      uTanHalfFov: { value: Math.tan(THREE.MathUtils.degToRad(30)) },
      uAspect: { value: 1 },
      uProjectedCenterNdc: { value: new THREE.Vector2() },
      uOpacity: { value: 0 },
      uSurfaceBlend: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    side: THREE.FrontSide,
    vertexShader: `
      varying vec2 vNdc;
      void main() {
        vec4 clipPosition = projectionMatrix
          * modelViewMatrix
          * vec4(position, 1.0);
        vNdc = clipPosition.xy / clipPosition.w;
        gl_Position = clipPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uRingColor;
      uniform vec3 uPhase;
      uniform vec3 uSphereCenterView;
      uniform float uSphereRadius;
      uniform float uTanHalfFov;
      uniform float uAspect;
      uniform vec2 uProjectedCenterNdc;
      uniform float uOpacity;
      uniform float uSurfaceBlend;
      varying vec2 vNdc;

      void main() {
        vec3 viewRay = normalize(vec3(
          vNdc.x * uAspect * uTanHalfFov,
          vNdc.y * uTanHalfFov,
          -1.0
        ));
        float closestApproach = dot(viewRay, uSphereCenterView);
        float tangentField = closestApproach * closestApproach
          - (
            dot(uSphereCenterView, uSphereCenterView)
            - uSphereRadius * uSphereRadius
          );
        float fieldPixel = max(fwidth(tangentField), 0.0000001);
        float fieldDistance = abs(tangentField);
        float core = 1.0 - smoothstep(
          fieldPixel * 0.30,
          fieldPixel * 1.08,
          fieldDistance
        );
        float shoulder = 1.0 - smoothstep(
          fieldPixel * 0.68,
          fieldPixel * 3.20,
          fieldDistance
        );
        vec2 projectedDelta = vec2(
          (vNdc.x - uProjectedCenterNdc.x) * uAspect,
          vNdc.y - uProjectedCenterNdc.y
        );
        float angle = atan(projectedDelta.y, projectedDelta.x);
        float stableVariation = 0.5 + 0.5 * sin(
          angle * 3.0
            + uPhase.x
            + sin(angle * 5.0 + uPhase.y) * 0.32
        );
        float continuity = 0.94 + stableVariation * 0.06;
        float alpha = uOpacity
          * uSurfaceBlend
          * (core * (0.62 + continuity * 0.08) + shoulder * 0.085);
        if (alpha < 0.001) discard;
        vec3 ringRadiance = mix(
          uRingColor,
          vec3(1.0, 0.995, 0.985),
          0.72
        );
        gl_FragColor = vec4(
          ringRadiance * (1.38 + core * 0.76 + stableVariation * 0.12),
          alpha
        );
      }
    `,
  });
  const silhouetteRing = new THREE.Mesh(
    silhouetteRingGeometry,
    silhouetteRingMaterial,
  );
  silhouetteRing.renderOrder = 12;
  silhouetteRing.frustumCulled = false;
  silhouetteRing.scale.set(1.2, 1.2, 1);
  object.add(silhouetteRing);

  const coronaGeometry = new THREE.SphereGeometry(0.5, 96, 64);
  const coronaMaterial = new THREE.ShaderMaterial({
    name: "agent-theory-paper-photosphere-corona",
    uniforms: {
      uCoronaColor: { value: new THREE.Color("#9ab7df") },
      uRotationAxis: { value: surfaceProfile.rotationAxis.clone() },
      uRotationAngle: { value: 0 },
      uPhase: { value: surfaceProfile.phases.clone() },
      uOpacity: { value: 0 },
      uCoronaBlend: { value: 0 },
      uCoronaStrength: { value: 0.105 },
    },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    side: THREE.FrontSide,
    vertexShader: `
      uniform vec3 uRotationAxis;
      uniform float uRotationAngle;
      uniform vec3 uPhase;
      varying vec3 vLocalPosition;
      varying vec3 vNormalView;
      varying vec3 vViewDirection;
      varying float vPlume;

      vec3 rotateAroundAxis(vec3 value, vec3 axis, float angle) {
        float cosine = cos(angle);
        float sine = sin(angle);
        return value * cosine
          + cross(axis, value) * sine
          + axis * dot(axis, value) * (1.0 - cosine);
      }

      float vertexHash(vec3 point) {
        return fract(sin(dot(point, vec3(37.1, 91.7, 53.3))) * 43758.5453);
      }

      float vertexNoise(vec3 point) {
        vec3 cell = floor(point);
        vec3 local = fract(point);
        local = local * local * (3.0 - 2.0 * local);
        float n000 = vertexHash(cell);
        float n100 = vertexHash(cell + vec3(1.0, 0.0, 0.0));
        float n010 = vertexHash(cell + vec3(0.0, 1.0, 0.0));
        float n110 = vertexHash(cell + vec3(1.0, 1.0, 0.0));
        float n001 = vertexHash(cell + vec3(0.0, 0.0, 1.0));
        float n101 = vertexHash(cell + vec3(1.0, 0.0, 1.0));
        float n011 = vertexHash(cell + vec3(0.0, 1.0, 1.0));
        float n111 = vertexHash(cell + vec3(1.0, 1.0, 1.0));
        return mix(
          mix(mix(n000, n100, local.x), mix(n010, n110, local.x), local.y),
          mix(mix(n001, n101, local.x), mix(n011, n111, local.x), local.y),
          local.z
        );
      }

      float vertexFbm(vec3 point) {
        float value = 0.0;
        float amplitude = 0.58;
        for (int octave = 0; octave < 3; octave += 1) {
          value += vertexNoise(point) * amplitude;
          point = point * 2.03 + vec3(5.4, 2.7, 8.1);
          amplitude *= 0.46;
        }
        return value;
      }

      void main() {
        vec3 direction = rotateAroundAxis(
          normalize(position),
          normalize(uRotationAxis),
          uRotationAngle * 0.72
        );
        float flow = vertexFbm(direction * 4.8 + uPhase * 0.34);
        vPlume = smoothstep(0.64, 0.91, flow);
        float displacement = (flow - 0.5) * 0.012 + vPlume * vPlume * 0.082;
        vec3 displacedPosition = position * (1.0 + displacement);
        vec4 viewPosition = modelViewMatrix * vec4(displacedPosition, 1.0);
        vLocalPosition = displacedPosition * 2.0;
        vNormalView = normalize(normalMatrix * normal);
        vViewDirection = normalize(-viewPosition.xyz);
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uCoronaColor;
      uniform vec3 uRotationAxis;
      uniform float uRotationAngle;
      uniform vec3 uPhase;
      uniform float uOpacity;
      uniform float uCoronaBlend;
      uniform float uCoronaStrength;
      varying vec3 vLocalPosition;
      varying vec3 vNormalView;
      varying vec3 vViewDirection;
      varying float vPlume;

      vec3 rotateAroundAxis(vec3 value, vec3 axis, float angle) {
        float cosine = cos(angle);
        float sine = sin(angle);
        return value * cosine
          + cross(axis, value) * sine
          + axis * dot(axis, value) * (1.0 - cosine);
      }

      float coronaHash(vec3 point) {
        return fract(sin(dot(point, vec3(41.7, 289.1, 113.5))) * 43758.5453);
      }

      float coronaNoise(vec3 point) {
        vec3 cell = floor(point);
        vec3 local = fract(point);
        local = local * local * (3.0 - 2.0 * local);
        float n000 = coronaHash(cell);
        float n100 = coronaHash(cell + vec3(1.0, 0.0, 0.0));
        float n010 = coronaHash(cell + vec3(0.0, 1.0, 0.0));
        float n110 = coronaHash(cell + vec3(1.0, 1.0, 0.0));
        float n001 = coronaHash(cell + vec3(0.0, 0.0, 1.0));
        float n101 = coronaHash(cell + vec3(1.0, 0.0, 1.0));
        float n011 = coronaHash(cell + vec3(0.0, 1.0, 1.0));
        float n111 = coronaHash(cell + vec3(1.0, 1.0, 1.0));
        return mix(
          mix(mix(n000, n100, local.x), mix(n010, n110, local.x), local.y),
          mix(mix(n001, n101, local.x), mix(n011, n111, local.x), local.y),
          local.z
        );
      }

      float coronaFbm(vec3 point) {
        float value = 0.0;
        float amplitude = 0.58;
        for (int octave = 0; octave < 4; octave += 1) {
          value += coronaNoise(point) * amplitude;
          point = point * 2.07 + vec3(3.1, 7.7, 5.4);
          amplitude *= 0.46;
        }
        return value;
      }

      void main() {
        float mu = clamp(dot(normalize(vNormalView), normalize(vViewDirection)), 0.0, 1.0);
        vec3 direction = rotateAroundAxis(
          normalize(vLocalPosition),
          normalize(uRotationAxis),
          uRotationAngle * 0.72
        );
        float rim = pow(1.0 - mu, 1.82);
        float broadFlow = coronaFbm(direction * 5.4 + uPhase * 0.42);
        float fineFlow = coronaFbm(direction * 13.0 - uPhase.yzx * 0.68);
        float filament = smoothstep(0.56, 0.88, broadFlow + fineFlow * 0.16);
        float plume = max(
          vPlume,
          smoothstep(0.62, 0.90, broadFlow)
            * smoothstep(0.34, 0.84, fineFlow)
        );
        float alpha = uOpacity
          * uCoronaBlend
          * uCoronaStrength
          * rim
          * (0.08 + filament * 0.70 + plume * 1.62);
        if (alpha < 0.001) discard;
        vec3 coronaRadiance = mix(
          uCoronaColor,
          vec3(0.78, 0.84, 1.0),
          0.56 + plume * 0.24
        );
        gl_FragColor = vec4(
          coronaRadiance * (1.18 + rim * 0.66 + plume * 0.72),
          alpha
        );
      }
    `,
  });
  const corona = new THREE.Mesh(coronaGeometry, coronaMaterial);
  corona.renderOrder = 13;
  corona.frustumCulled = false;
  corona.scale.setScalar(1.038);
  object.add(corona);

  const viewPosition = new THREE.Vector3();
  const cameraWorldQuaternion = new THREE.Quaternion();
  const objectWorldQuaternion = new THREE.Quaternion();
  const sphereWorldPosition = new THREE.Vector3();
  const sphereWorldScale = new THREE.Vector3();
  const sphereCenterView = new THREE.Vector3();
  const projectedSphereCenterNdc = new THREE.Vector3();
  return {
    object,
    hitObject: body,
    configure: (configuration: PaperInspectionVisualConfiguration) => {
      if (configuration.paperId !== currentPaperId) {
        currentPaperId = configuration.paperId;
        surfaceProfile = createPaperSurfaceProfile(configuration.paperId);
        bodyMaterial.uniforms.uRotationAxis.value.copy(surfaceProfile.rotationAxis);
        bodyMaterial.uniforms.uPhase.value.copy(surfaceProfile.phases);
        energyVeilMaterial.uniforms.uRotationAxis.value.copy(surfaceProfile.rotationAxis);
        energyVeilMaterial.uniforms.uPhase.value.copy(surfaceProfile.phases);
        silhouetteRingMaterial.uniforms.uPhase.value.copy(surfaceProfile.phases);
        coronaMaterial.uniforms.uRotationAxis.value.copy(surfaceProfile.rotationAxis);
        coronaMaterial.uniforms.uPhase.value.copy(surfaceProfile.phases);
        rotationAngle = (
          stableHash(`${configuration.paperId}:agent-photosphere-phase`) / 4294967295
        ) * Math.PI * 2;
        rotationSpeed = THREE.MathUtils.lerp(
          0.032,
          0.048,
          stableHash(`${configuration.paperId}:agent-photosphere-speed`) / 4294967295,
        );
        lastVisualTimeSeconds = Number.NaN;
      }
      const semantic = new THREE.Color(configuration.bodyColor || "#9fb9db");
      const hsl = { h: 0, s: 0, l: 0 };
      semantic.getHSL(hsl);
      semantic.setHSL(
        hsl.h,
        THREE.MathUtils.clamp(hsl.s * 0.50 + 0.16, 0.16, 0.30),
        THREE.MathUtils.clamp(hsl.l * 0.52 + 0.16, 0.34, 0.52),
      );
      semantic.lerp(new THREE.Color("#7897c8"), 0.30);
      bodyMaterial.uniforms.uBodyColor.value.copy(semantic);
      energyVeilMaterial.uniforms.uVeilColor.value.copy(
        semantic.clone().lerp(new THREE.Color("#edf3ff"), 0.82),
      );
      silhouetteRingMaterial.uniforms.uRingColor.value.copy(
        semantic.clone().lerp(new THREE.Color("#e1e9ff"), 0.76),
      );
      const coronaColor = semantic.clone().lerp(
        new THREE.Color(configuration.haloColor || "#b6c8ff"),
        0.54,
      );
      coronaMaterial.uniforms.uCoronaColor.value.copy(coronaColor);
      bodyMaterial.uniforms.uRepresentativeStrength.value = configuration.representative
        ? 1
        : 0;
      coronaMaterial.uniforms.uCoronaStrength.value = configuration.representative
        ? 0.16
        : 0.14;
    },
    setVisual: ({
      worldPosition,
      camera,
      viewportWidth,
      viewportHeight,
      inspectionBlend,
      worldDiameter,
      compactDiameter,
      timeSeconds,
      motionStrength,
    }: PaperInspectionVisualFrame) => {
      if (
        !worldPosition
        || viewportWidth < 1
        || viewportHeight < 1
        || inspectionBlend <= 0.002
      ) {
        object.visible = false;
        projectedDiameter = 0;
        viewportRatio = 0;
        surfaceBlend = 0;
        coronaBlend = 0;
        handoffDiameterRatio = 1;
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
      const inspectionWorldDiameter = Math.max(0.0001, worldDiameter);
      projectedDiameter = inspectionWorldDiameter
        * viewportHeight
        / Math.max(0.0001, visibleWorldHeight);
      viewportRatio = projectedDiameter / Math.max(1, viewportHeight);
      handoffDiameterRatio = projectedDiameter / Math.max(0.0001, compactDiameter);
      if (photosphereLodActive) {
        photosphereLodActive = projectedDiameter > APP17_AGENT_PAPER_PHOTOSPHERE_LOD_EXIT_PX;
      } else {
        photosphereLodActive = projectedDiameter >= APP17_AGENT_PAPER_PHOTOSPHERE_LOD_ENTER_PX;
      }
      surfaceBlend = photosphereLodActive
        ? smootherStep(THREE.MathUtils.clamp(
          (projectedDiameter - APP17_AGENT_PAPER_PHOTOSPHERE_LOD_EXIT_PX)
            / (
              APP17_AGENT_PAPER_PHOTOSPHERE_LOD_ENTER_PX
              - APP17_AGENT_PAPER_PHOTOSPHERE_LOD_EXIT_PX
            ),
          0,
          1,
        ))
        : 0;
      coronaBlend = smootherStep(THREE.MathUtils.clamp(
        (projectedDiameter - 28) / 52,
        0,
        1,
      ));
      if (Number.isFinite(lastVisualTimeSeconds)) {
        const elapsed = THREE.MathUtils.clamp(timeSeconds - lastVisualTimeSeconds, 0, 0.1);
        rotationAngle += elapsed
          * rotationSpeed
          * THREE.MathUtils.clamp(motionStrength, 0, 1);
      }
      lastVisualTimeSeconds = timeSeconds;
      object.position.copy(worldPosition);
      object.quaternion.identity();
      object.scale.setScalar(inspectionWorldDiameter);
      body.scale.setScalar(1);
      energyVeil.scale.setScalar(1.003);
      corona.scale.setScalar(1.038);
      object.updateWorldMatrix(true, true);
      camera.getWorldQuaternion(cameraWorldQuaternion);
      object.getWorldQuaternion(objectWorldQuaternion);
      silhouetteRing.quaternion
        .copy(objectWorldQuaternion.invert())
        .multiply(cameraWorldQuaternion);
      body.getWorldPosition(sphereWorldPosition);
      body.getWorldScale(sphereWorldScale);
      sphereCenterView
        .copy(sphereWorldPosition)
        .applyMatrix4(camera.matrixWorldInverse);
      const sphereRadius = Math.max(
        sphereWorldScale.x,
        sphereWorldScale.y,
        sphereWorldScale.z,
      ) * 0.5;
      const sphereDistance = Math.max(
        sphereRadius + 0.0001,
        sphereCenterView.length(),
      );
      const silhouetteProjectionCorrection = sphereDistance / Math.sqrt(
        Math.max(
          0.000001,
          sphereDistance * sphereDistance - sphereRadius * sphereRadius,
        ),
      );
      const silhouetteQuadScale = THREE.MathUtils.clamp(
        silhouetteProjectionCorrection * 1.16,
        1.16,
        1.6,
      );
      silhouetteRing.scale.set(
        silhouetteQuadScale,
        silhouetteQuadScale,
        1,
      );
      projectedSphereCenterNdc.copy(sphereWorldPosition).project(camera);
      silhouetteRingMaterial.uniforms.uSphereCenterView.value.copy(
        sphereCenterView,
      );
      silhouetteRingMaterial.uniforms.uSphereRadius.value = sphereRadius;
      silhouetteRingMaterial.uniforms.uTanHalfFov.value = Math.tan(
        effectiveFov * 0.5,
      );
      silhouetteRingMaterial.uniforms.uAspect.value = camera.aspect;
      silhouetteRingMaterial.uniforms.uProjectedCenterNdc.value.set(
        projectedSphereCenterNdc.x,
        projectedSphereCenterNdc.y,
      );
      bodyMaterial.uniforms.uRotationAngle.value = rotationAngle;
      bodyMaterial.uniforms.uOpacity.value = inspectionBlend;
      bodyMaterial.uniforms.uSurfaceBlend.value = surfaceBlend;
      bodyMaterial.depthWrite = inspectionBlend >= 0.985;
      energyVeilMaterial.uniforms.uRotationAngle.value = rotationAngle;
      energyVeilMaterial.uniforms.uOpacity.value = inspectionBlend;
      energyVeilMaterial.uniforms.uSurfaceBlend.value = surfaceBlend;
      silhouetteRingMaterial.uniforms.uOpacity.value = inspectionBlend;
      silhouetteRingMaterial.uniforms.uSurfaceBlend.value = surfaceBlend;
      coronaMaterial.uniforms.uRotationAngle.value = rotationAngle;
      coronaMaterial.uniforms.uOpacity.value = inspectionBlend;
      coronaMaterial.uniforms.uCoronaBlend.value = coronaBlend;
      body.visible = inspectionBlend > 0.002;
      energyVeil.visible = inspectionBlend * surfaceBlend > 0.002;
      silhouetteRing.visible = inspectionBlend * surfaceBlend > 0.002;
      corona.visible = inspectionBlend * coronaBlend > 0.002;
      object.visible = true;
      object.updateMatrixWorld(true);
    },
    getVisualState: () => ({
      projectedDiameter,
      viewportRatio,
      drawCalls: object.visible
        ? Number(body.visible)
          + Number(energyVeil.visible)
          + Number(silhouetteRing.visible)
          + Number(corona.visible)
        : 0,
      bloomDrawCalls: 0,
      energyDetailBlend: 0,
      energyBloomOpacity: 0,
      energyWispCount: 0,
      energyCarrierScale: 1,
      energyCloseupCompactness: 0,
      energyVisibleRadius: 0,
      energyBodyCoreDiameter: projectedDiameter,
      energyBodyCoreBlend: surfaceBlend,
      energyFresnelWidth: 1.25,
      energyOuterGlowDiameter: projectedDiameter * 1.14,
      energyOuterGlowMonotonic: true,
      energyMicroCoreDiameter: 0,
      energyMicroCoreBlend: 0,
      energySoftCoreAttenuation: 1,
      energyMicroCoreBrightness: 0,
      ordinarySurfaceMorph: surfaceBlend,
      ordinaryAtmosphereMorph: coronaBlend,
      handoffDiameterRatio,
      representativeCarrierEdgeLeak: 0,
    }),
    dispose: () => {
      geometry.dispose();
      silhouetteRingGeometry.dispose();
      coronaGeometry.dispose();
      bodyMaterial.dispose();
      energyVeilMaterial.dispose();
      silhouetteRingMaterial.dispose();
      coronaMaterial.dispose();
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
  let handoffDiameterRatio = 1;
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
      uInspectionLod: { value: 0 },
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
      uniform float uInspectionLod;
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

        vec3 closeupPremultiplied = outerHaloColor * outerLayerAlpha;
        float closeupAlpha = outerLayerAlpha;
        closeupPremultiplied = bodyColor * bodyAlpha
          + closeupPremultiplied * (1.0 - bodyAlpha);
        closeupAlpha = bodyAlpha + closeupAlpha * (1.0 - bodyAlpha);
        closeupPremultiplied = energyColor * energyAlpha
          + closeupPremultiplied * (1.0 - energyAlpha);
        closeupAlpha = energyAlpha + closeupAlpha * (1.0 - energyAlpha);
        closeupPremultiplied = fresnelColor * fresnelLayerAlpha
          + closeupPremultiplied * (1.0 - fresnelLayerAlpha);
        closeupAlpha = fresnelLayerAlpha + closeupAlpha * (1.0 - fresnelLayerAlpha);
        closeupPremultiplied = microColor * microAlpha
          + closeupPremultiplied * (1.0 - microAlpha);
        closeupAlpha = microAlpha + closeupAlpha * (1.0 - microAlpha);

        // Match the system representative point at the two static ownership
        // boundaries. The journey blends this compact field to the established
        // close-up field inside the same object, so no model is swapped while
        // the camera is moving.
        float readableCore = exp(-opticalRadius * opticalRadius * 54.0);
        float readableInnerGlow = exp(-opticalRadius * opticalRadius * 12.0)
          * (1.0 - smoothstep(0.58, 0.96, opticalRadius));
        float readableEnergy = readableCore * 0.92 + readableInnerGlow * 0.13;
        float compactAlpha = max(energy, readableEnergy) * uOpacity * uRankStrength;
        vec3 compactColor = mix(
          uHaloColor,
          uCoreColor,
          clamp(thermal * 0.78 + innerGlow * 0.1, 0.0, 1.0)
        );
        compactColor = mix(
          compactColor,
          hotWhite,
          clamp(max(core * 0.72 + thermal * 0.16, readableCore * 0.88), 0.0, 0.88)
        );
        compactColor = min(vec3(1.0), compactColor + uHaloColor * wisps * 0.12);

        float inspectionLod = smoothstep(0.0, 1.0, clamp(uInspectionLod, 0.0, 1.0));
        float alpha = mix(compactAlpha, closeupAlpha, inspectionLod);
        vec3 premultipliedColor = mix(
          compactColor * compactAlpha,
          closeupPremultiplied,
          inspectionLod
        );
        float carrierEnvelope = representativeCarrierEnvelope(opticalRadius);
        alpha *= carrierEnvelope;
        premultipliedColor *= carrierEnvelope;
        if (opticalRadius > 1.32 || alpha < 0.00025) discard;
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
      ${REPRESENTATIVE_ENERGY_FIELD_GLSL}
      void main() {
        vec2 point = (vUv - vec2(0.5)) * 2.0;
        float opticalRadius = length(point) * uCarrierScale;
        float legacyCore = exp(-opticalRadius * opticalRadius * 92.0);
        float microDistance = opticalRadius / max(uMicroCoreRadius, 0.0001);
        float microCore = exp(-microDistance * microDistance * 2.8);
        float core = mix(legacyCore, microCore, uMicroCoreBlend);
        float alpha = core * 0.52 * uOpacity * uBloomWeight
          * representativeCarrierEnvelope(opticalRadius);
        if (opticalRadius > 1.32 || alpha < 0.00025) discard;
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
      compactDiameter,
      worldDiameter,
      targetBodyDiameterPx,
      compactLod,
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
      const inspectionWorldDiameter = Math.max(0.0001, worldDiameter);
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
      object.position.copy(worldPosition);
      object.quaternion.copy(camera.quaternion);
      object.scale.setScalar(inspectionWorldDiameter);
      projectedDiameter = naturalProjectedDiameter;
      viewportRatio = projectedDiameter / Math.max(1, viewportHeight);
      handoffDiameterRatio = projectedDiameter
        / APP17_REPRESENTATIVE_ENERGY_CARRIER_SCALE
        / Math.max(0.0001, compactDiameter);
      const opacity = inspectionBlend;
      const lockedProjectedDiameter = Math.max(1, projectedDiameter);
      const inspectionLod = THREE.MathUtils.clamp(compactLod, 0, 1);
      detailBlend = smoothStepRange(
        APP17_REPRESENTATIVE_ENERGY_DETAIL_START_PX,
        APP17_REPRESENTATIVE_ENERGY_DETAIL_END_PX,
        lockedProjectedDiameter,
      ) * inspectionLod;
      closeupCompactness = smoothStepRange(
        120,
        260,
        lockedProjectedDiameter,
      );
      bodyCoreBlend = smoothStepRange(
        APP17_REPRESENTATIVE_BODY_CORE_START_PX,
        APP17_REPRESENTATIVE_BODY_CORE_END_PX,
        lockedProjectedDiameter,
      );
      const referenceBodyCoreDiameter = THREE.MathUtils.clamp(
        targetBodyDiameterPx,
        APP17_REPRESENTATIVE_BODY_CORE_MIN_DIAMETER_PX,
        APP17_REPRESENTATIVE_BODY_CORE_MAX_DIAMETER_PX,
      );
      const bodyCoreRadius = referenceBodyCoreDiameter / lockedProjectedDiameter;
      bodyCoreDiameter = projectedDiameter * bodyCoreRadius;
      fresnelWidth = THREE.MathUtils.clamp(bodyCoreDiameter * 0.045, 3, 6);
      outerGlowDiameter = bodyCoreDiameter * 3.2;
      microCoreBlend = bodyCoreBlend;
      const referenceMicroCoreDiameter = THREE.MathUtils.clamp(
        referenceBodyCoreDiameter * APP17_REPRESENTATIVE_MICRO_CORE_RATIO,
        APP17_REPRESENTATIVE_MICRO_CORE_MIN_DIAMETER_PX,
        APP17_REPRESENTATIVE_MICRO_CORE_MAX_DIAMETER_PX,
      );
      const naturalMicroCoreDiameter = projectedDiameter
        * referenceMicroCoreDiameter
        / lockedProjectedDiameter;
      const systemMicroCoreDiameter = THREE.MathUtils.clamp(
        compactDiameter * 0.096,
        1.6,
        3.0,
      );
      microCoreDiameter = Math.max(naturalMicroCoreDiameter, systemMicroCoreDiameter);
      const microCoreRadius = microCoreDiameter / Math.max(projectedDiameter, 0.0001);
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
          lockedProjectedDiameter,
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
      material.uniforms.uInspectionLod.value = inspectionLod;
      material.uniforms.uOpacity.value = opacity;
      material.uniforms.uTime.value = (timeSeconds / flowPeriodSeconds) * Math.PI * 2;
      material.uniforms.uMotionStrength.value = motionStrength;
      material.uniforms.uDetailBlend.value = detailBlend;
      bloomMaterial.uniforms.uOpacity.value = opacity;
      bloomMaterial.uniforms.uBloomWeight.value = THREE.MathUtils.lerp(0.18, bloomOpacity, inspectionLod);
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
      ordinarySurfaceMorph: 0,
      ordinaryAtmosphereMorph: 0,
      handoffDiameterRatio,
      representativeCarrierEdgeLeak: 0,
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
  let rotationAngle = 0;
  let lastVisualTimeSeconds = Number.NaN;
  let surfaceMorph = 0;
  let atmosphereMorph = 0;
  let handoffDiameterRatio = 1;
  let surfaceProfile = createPaperSurfaceProfile("paper-default");
  const bodyGeometry = new THREE.PlaneGeometry(1, 1);
  const bodyMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uBodyColor: { value: new THREE.Color("#eef3ff") },
      uAxisA: { value: surfaceProfile.axisA.clone() },
      uAxisB: { value: surfaceProfile.axisB.clone() },
      uAxisC: { value: surfaceProfile.axisC.clone() },
      uPhases: { value: surfaceProfile.phases.clone() },
      uFrequencies: { value: surfaceProfile.frequencies.clone() },
      uRotationAxis: { value: surfaceProfile.rotationAxis.clone() },
      uRotationAngle: { value: 0 },
      uOpacity: { value: 0 },
      uSurfaceMorph: { value: 0 },
    },
    transparent: true,
    // The inspection object owns the target for the whole journey. It must not
    // disappear behind system geometry while the camera follows that target.
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uBodyColor;
      uniform vec3 uAxisA;
      uniform vec3 uAxisB;
      uniform vec3 uAxisC;
      uniform vec3 uPhases;
      uniform vec3 uFrequencies;
      uniform vec3 uRotationAxis;
      uniform float uRotationAngle;
      uniform float uOpacity;
      uniform float uSurfaceMorph;
      varying vec2 vUv;
      vec3 rotateAroundAxis(vec3 value, vec3 axis, float angle) {
        float cosine = cos(angle);
        float sine = sin(angle);
        return value * cosine
          + cross(axis, value) * sine
          + axis * dot(axis, value) * (1.0 - cosine);
      }
      void main() {
        vec2 point = (vUv - vec2(0.5)) * 2.0;
        float radiusSquared = dot(point, point);
        float edgeWidth = max(fwidth(radiusSquared) * 1.35, 0.001);
        if (radiusSquared > 1.0 + edgeWidth) discard;
        vec3 normalView = normalize(vec3(point, sqrt(max(0.0, 1.0 - radiusSquared))));
        float facing = clamp(normalView.z, 0.0, 1.0);
        vec3 direction = rotateAroundAxis(
          normalView,
          normalize(uRotationAxis),
          uRotationAngle
        );
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
        vec3 sphereBody = mix(lowTemperature, highTemperature, thermal) * diffuse * limb;
        sphereBody = vec3(1.0) - exp(-max(sphereBody, vec3(0.0)) * 1.18);
        float radius = sqrt(radiusSquared);
        float pointEdge = 1.0 - smoothstep(0.72, 1.0, radius);
        float pointCore = exp(-radiusSquared * 34.0);
        float pointInnerGlow = exp(-radiusSquared * 8.0);
        float pointHalo = exp(-radiusSquared * 2.35) * pointEdge;
        float compactAlpha = min(
          1.0,
          pointCore * 0.90 + pointInnerGlow * 0.27 + pointHalo * 0.085
        );
        vec3 compactColor = mix(
          uBodyColor,
          vec3(1.0),
          clamp(pointCore + pointInnerGlow * 0.72, 0.0, 1.0)
        );
        compactColor = mix(compactColor, vec3(1.0, 0.985, 0.95), pointCore * 0.67);
        vec3 body = mix(compactColor, sphereBody, uSurfaceMorph);
        float edgeFade = smoothstep(0.018, 0.16, facing);
        float circleMask = 1.0 - smoothstep(1.0 - edgeWidth, 1.0 + edgeWidth, radiusSquared);
        float sphereAlpha = edgeFade * circleMask;
        float alpha = uOpacity * mix(compactAlpha, sphereAlpha, uSurfaceMorph);
        if (alpha < 0.002) discard;
        gl_FragColor = vec4(body, alpha);
      }
    `,
  });
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.renderOrder = 10;
  body.frustumCulled = false;
  object.add(body);

  const atmosphereGeometry = new THREE.PlaneGeometry(1, 1);
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
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uAtmosphereColor;
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        vec2 point = (vUv - vec2(0.5)) * 2.0;
        float radiusSquared = dot(point, point);
        float edgeWidth = max(fwidth(radiusSquared) * 1.35, 0.001);
        if (radiusSquared > 1.0 + edgeWidth) discard;
        float facing = sqrt(max(0.0, 1.0 - radiusSquared));
        float rim = pow(1.0 - facing, 3.8);
        float circleMask = 1.0 - smoothstep(1.0 - edgeWidth, 1.0 + edgeWidth, radiusSquared);
        float alpha = uOpacity * rim * smoothstep(0.0, 0.2, facing) * circleMask;
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
        bodyMaterial.uniforms.uRotationAxis.value.copy(surfaceProfile.rotationAxis);
        rotationSpeed = THREE.MathUtils.lerp(0.042, 0.068, stableHash(`${paperId}:rotation-speed`) / 4294967295);
        rotationAngle = (stableHash(`${paperId}:rotation-phase`) / 4294967295) * Math.PI * 2;
        lastVisualTimeSeconds = Number.NaN;
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
      worldDiameter,
      compactDiameter,
      timeSeconds,
      motionStrength,
    }: PaperInspectionVisualFrame) => {
      if (!worldPosition || viewportWidth < 1 || viewportHeight < 1 || inspectionBlend <= 0.002) {
        object.visible = false;
        projectedDiameter = 0;
        viewportRatio = 0;
        surfaceMorph = 0;
        atmosphereMorph = 0;
        handoffDiameterRatio = 1;
        return;
      }
      viewPosition.copy(worldPosition).applyMatrix4(camera.matrixWorldInverse);
      const viewDepth = -viewPosition.z;
      if (viewDepth <= camera.near) {
        object.visible = false;
        projectedDiameter = 0;
        viewportRatio = 0;
        surfaceMorph = 0;
        atmosphereMorph = 0;
        handoffDiameterRatio = 1;
        return;
      }
      const effectiveFov = THREE.MathUtils.degToRad(camera.getEffectiveFOV());
      const visibleWorldHeight = 2 * viewDepth * Math.tan(effectiveFov * 0.5);
      const inspectionWorldDiameter = Math.max(0.0001, worldDiameter);
      const naturalProjectedDiameter = inspectionWorldDiameter
        * viewportHeight / Math.max(0.0001, visibleWorldHeight);
      object.position.copy(worldPosition);
      object.scale.setScalar(inspectionWorldDiameter);
      const opacity = inspectionBlend;
      projectedDiameter = naturalProjectedDiameter;
      viewportRatio = projectedDiameter / Math.max(1, viewportHeight);
      surfaceMorph = smootherStep(THREE.MathUtils.clamp((projectedDiameter - 8) / (36 - 8), 0, 1));
      atmosphereMorph = smootherStep(THREE.MathUtils.clamp((projectedDiameter - 28) / (56 - 28), 0, 1));
      handoffDiameterRatio = projectedDiameter / Math.max(0.0001, compactDiameter);
      bodyMaterial.uniforms.uOpacity.value = opacity;
      bodyMaterial.uniforms.uSurfaceMorph.value = surfaceMorph;
      if (Number.isFinite(lastVisualTimeSeconds)) {
        const elapsed = THREE.MathUtils.clamp(timeSeconds - lastVisualTimeSeconds, 0, 0.1);
        rotationAngle += elapsed * rotationSpeed * THREE.MathUtils.clamp(motionStrength, 0, 1);
      }
      lastVisualTimeSeconds = timeSeconds;
      bodyMaterial.uniforms.uRotationAngle.value = rotationAngle;
      atmosphereMaterial.uniforms.uOpacity.value = opacity * atmosphereMorph * 0.11;
      body.visible = opacity > 0.002;
      atmosphere.visible = opacity * atmosphereMorph > 0.002;
      object.quaternion.copy(camera.quaternion);
      body.scale.setScalar(1);
      atmosphere.scale.setScalar(1.05);
      body.quaternion.identity();
      atmosphere.quaternion.identity();
      object.visible = true;
      object.updateMatrixWorld(true);
    },
    getVisualState: () => ({
      projectedDiameter,
      viewportRatio,
      drawCalls: object.visible
        ? Number(body.visible) + Number(atmosphere.visible)
        : 0,
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
      ordinarySurfaceMorph: surfaceMorph,
      ordinaryAtmosphereMorph: atmosphereMorph,
      handoffDiameterRatio,
      representativeCarrierEdgeLeak: 0,
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
  const color = new THREE.Color(app17HotspotFamilyColor(hotspot));
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
        float activity = broadActivity * 0.30
          + flowingActivity * 0.20
          + (fineStructure - 0.5) * mix(0.018, 0.062, uSurfaceDetailBlend)
          + (microStructure - 0.5) * 0.038 * uSurfaceDetailBlend
          + networkActivity;
        float cellNetwork = smoothstep(0.52, 0.84, fineRidge) * uSurfaceDetailBlend;
        float hotRegion = smoothstep(0.17, 0.3, activity);
        float limb = mix(0.38, 1.0, pow(facing, 0.46));
        float centerHeat = pow(facing, 1.45);
        vec3 highTemperature = vec3(1.0, 0.955, 0.86);
        float fieldLuminance = dot(uColor, vec3(0.2126, 0.7152, 0.0722));
        vec3 restrainedField = mix(vec3(fieldLuminance), uColor, 0.78);
        vec3 chromaticBody = mix(
          restrainedField * 0.76,
          highTemperature,
          0.28 + hotRegion * 0.06
        );
        vec3 body = chromaticBody
          * (0.56 + limb * 0.39 + activity * 0.72 + networkActivity * 0.14);
        body *= 1.0 - cellNetwork * uSurfaceDetailBlend * 0.16;
        body = mix(
          body,
          highTemperature * (0.93 + activity * 0.08),
          hotRegion * 0.045
        );
        body = mix(body, highTemperature, centerHeat * 0.035);
        body = vec3(1.0) - exp(-max(body, vec3(0.0)) * 1.32);
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
    depthOccluder.visible = depthOcclusionActive
      && sceneOpacity > 0.92
      && focusAttenuation > 0.9;
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
      const nextCoronaCssExtension = THREE.MathUtils.clamp(
        nextProjectedDiameter * 0.095,
        7,
        34,
      );
      const spriteCssSize = Math.max(
        coreCssDiameter + nextCoronaCssExtension * 1.8,
        nextProjectedDiameter + nextCoronaCssExtension * 1.8,
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
      depthOccluder.visible = depthOcclusionActive
        && sceneOpacity > 0.92
        && focusAttenuation > 0.9;
      return changed;
    },
    getVisualState: () => ({
      projectedDiameter,
      viewportRatio,
      focusAttenuation,
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
        float fineContour = 0.91
          + sin(angle * 5.0 + seedAngle * 1.7 - coronaRotation * 0.45) * 0.055
          + sin(angle * 3.0 - seedAngle * 0.8 + coronaRotation * 0.22) * 0.035;
        float activeCoverage = smoothstep(0.015, 0.14, extensionField);
        float coronaRadius = sourceRadius + uCoronaCssExtension * extensionField * fineContour;
        float coronaMask = (1.0 - smoothstep(sourceRadius * 0.99, coronaRadius, radiusPx)) * activeCoverage;
        float innerCorona = exp(
          -outsideDistance / max(1.0, uCoronaCssExtension * 0.10)
        ) * uInnerHaloStrength * activeCoverage;
        float streamerCorona = exp(
          -outsideDistance / max(1.0, uCoronaCssExtension * 0.26)
        ) * streamerField;
        float corona = coronaMask * (innerCorona + streamerCorona);
        float core = exp(-radiusPx * radiusPx / max(1.0, coreRadius * coreRadius * 0.42));
        float innerGlow = exp(-radiusPx * radiusPx / max(1.0, coreRadius * coreRadius * 2.6));
        float coronaEnergy = min(
          0.12,
          corona * uStrength * uCoronaBlend * 0.72
        );
        float alpha = uFarCoreBlend * (core * 0.82 + innerGlow * 0.2)
          + coronaEnergy;
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

function createAgentTheoryDecorativeLayer(
  pixelRatio: number,
  sceneData: App17SceneData,
  snapshotId: string,
  quality: AgentTheoryQuality,
  layerVersion: string,
) {
  const baseRadius = Math.max(
    0.8,
    sceneData.camera.theoryFraming?.maxRadius
      ?? sceneData.camera.distance * 0.45,
  );
  const plan = createAgentTheoryDecorativePlan({
    snapshotId,
    layerVersion,
    quality,
    center: [
      sceneData.camera.center.x,
      sceneData.camera.center.y,
      sceneData.camera.center.z,
    ],
    baseRadius,
  });
  const { starCount, dustCount } = plan;
  const count = starCount + dustCount;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const alphas = new Float32Array(count);
  const kinds = new Float32Array(count);
  const color = new THREE.Color();
  plan.points.forEach((point, index) => {
    positions[index * 3] = point.position[0];
    positions[index * 3 + 1] = point.position[1];
    positions[index * 3 + 2] = point.position[2];
    color.set(point.color);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
    sizes[index] = point.size;
    alphas[index] = point.alpha;
    kinds[index] = point.kind === "star" ? 1 : 0;
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("pointSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("pointAlpha", new THREE.BufferAttribute(alphas, 1));
  geometry.setAttribute("pointKind", new THREE.BufferAttribute(kinds, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uPixelRatio: { value: pixelRatio },
      uSceneOpacity: { value: 1 },
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
      attribute float pointKind;
      uniform float uPixelRatio;
      uniform float uSceneOpacity;
      varying vec3 vColor;
      varying float vAlpha;
      varying float vKind;
      void main() {
        vColor = color;
        vAlpha = pointAlpha * uSceneOpacity;
        vKind = pointKind;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        float distanceScale = clamp(8.0 / max(1.0, -mvPosition.z), 0.58, 1.18);
        gl_PointSize = max(1.0, pointSize * distanceScale * uPixelRatio);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;
      varying float vKind;
      void main() {
        vec2 point = (gl_PointCoord - vec2(0.5)) * 2.0;
        float radius = length(point);
        float antialias = max(fwidth(radius), 0.018);
        float star = 1.0 - smoothstep(0.48, 0.48 + antialias, abs(point.x) + abs(point.y));
        float dust = 1.0 - smoothstep(0.58, 0.58 + antialias, radius);
        float shape = mix(dust * 0.62, star, vKind);
        float alpha = shape * vAlpha;
        if (alpha < 0.003) discard;
        gl_FragColor = vec4(vColor, alpha);
      }
    `,
  });
  material.name = "AgentTheoryDecorativeDeepField";
  const object = new THREE.Points(geometry, material);
  object.name = "agent-theory-decorative-deep-field";
  object.frustumCulled = false;
  object.renderOrder = -50;
  object.userData.semanticEntity = false;
  object.userData.pickable = false;
  const visibilityFrustum = new THREE.Frustum();
  const visibilityProjection = new THREE.Matrix4();
  const visibilityPosition = new THREE.Vector3();

  return {
    object,
    starCount,
    dustCount,
    degradationReason: "",
    setOpacity: (opacity: number) => {
      material.uniforms.uSceneOpacity.value = THREE.MathUtils.clamp(opacity, 0, 1);
    },
    countVisible: (camera: THREE.PerspectiveCamera) => {
      camera.updateMatrixWorld(true);
      object.updateMatrixWorld(true);
      visibilityProjection.multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse,
      );
      visibilityFrustum.setFromProjectionMatrix(visibilityProjection);
      let visible = 0;
      for (let index = 0; index < count; index += 1) {
        visibilityPosition.set(
          positions[index * 3],
          positions[index * 3 + 1],
          positions[index * 3 + 2],
        ).applyMatrix4(object.matrixWorld);
        if (visibilityFrustum.containsPoint(visibilityPosition)) visible += 1;
      }
      return visible;
    },
    dispose: () => {
      geometry.dispose();
      material.dispose();
    },
  };
}

function createAgentTheoryDynamicFocusLayer(
  pixelRatio: number,
  perimeterProfile: AgentTheoryPerimeterProfileV1,
) {
  const slotCount = 32;
  const positions = new Float32Array(slotCount * 3);
  const colors = new Float32Array(slotCount * 3);
  const sizes = new Float32Array(slotCount);
  const alphas = new Float32Array(slotCount);
  const roles = new Float32Array(slotCount);
  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(positions, 3);
  const colorAttribute = new THREE.BufferAttribute(colors, 3);
  const sizeAttribute = new THREE.BufferAttribute(sizes, 1);
  const alphaAttribute = new THREE.BufferAttribute(alphas, 1);
  const roleAttribute = new THREE.BufferAttribute(roles, 1);
  geometry.setAttribute("position", positionAttribute);
  geometry.setAttribute("color", colorAttribute);
  geometry.setAttribute("pointSize", sizeAttribute);
  geometry.setAttribute("pointAlpha", alphaAttribute);
  geometry.setAttribute("focusRole", roleAttribute);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uPixelRatio: { value: pixelRatio },
    },
    transparent: true,
    depthWrite: true,
    depthTest: true,
    blending: THREE.NormalBlending,
    toneMapped: false,
    vertexShader: `
      attribute vec3 color;
      attribute float pointSize;
      attribute float pointAlpha;
      attribute float focusRole;
      uniform float uPixelRatio;
      varying vec3 vColor;
      varying float vAlpha;
      varying float vRole;
      void main() {
        vColor = color;
        vAlpha = pointAlpha;
        vRole = focusRole;
        gl_PointSize = max(1.0, pointSize) * uPixelRatio;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;
      varying float vRole;
      void main() {
        if (vAlpha <= 0.001) discard;
        vec2 point = (gl_PointCoord - vec2(0.5)) * 2.0;
        float radius = length(point);
        if (radius >= 1.0) discard;
        float aa = max(fwidth(radius), 0.008);
        float core = exp(-radius * radius * 16.0);
        float pin = 1.0 - smoothstep(
          0.16,
          0.16 + aa,
          max(abs(point.x), abs(point.y))
        );
        float energy = max(core, pin * 0.78);
        vec3 hotCore = mix(vColor, vec3(0.998, 0.998, 1.0), energy * 0.88);
        float alpha = min(1.0, vAlpha * energy * (vRole > 2.5 ? 1.16 : 1.0));
        if (alpha <= 0.006) discard;
        gl_FragColor = vec4(hotCore, alpha);
      }
    `,
  });
  material.name = "AgentTheoryDynamicFocusCore";
  const object = new THREE.Points(geometry, material);
  object.frustumCulled = false;
  object.renderOrder = 5;
  const slotById = new Map<string, number>();
  const idBySlot = new Array<string>(slotCount).fill("");
  const color = new THREE.Color();
  const center = new THREE.Vector3().fromArray(perimeterProfile.center);
  const axisA = new THREE.Vector3().fromArray(perimeterProfile.principalAxes[0]);
  const axisB = new THREE.Vector3().fromArray(perimeterProfile.principalAxes[1]);
  const axisC = new THREE.Vector3().fromArray(perimeterProfile.principalAxes[2]);

  const assignSlot = (entityId: string) => {
    const existing = slotById.get(entityId);
    if (existing !== undefined) return existing;
    const start = stableHash(`agent-theory-dynamic-focus:${entityId}`) % slotCount;
    for (let probe = 0; probe < slotCount; probe += 1) {
      const slot = (start + probe) % slotCount;
      if (idBySlot[slot]) continue;
      idBySlot[slot] = entityId;
      slotById.set(entityId, slot);
      return slot;
    }
    return -1;
  };

  const setEntities = (
    entities: AgentTheoryFocusVisualState["dynamicEntities"],
    blend: number,
  ) => {
    alphas.fill(0);
    roles.fill(0);
    const activeIds = new Set(entities.map((entity) => entity.entityId));
    Array.from(slotById.entries()).forEach(([entityId, slot]) => {
      if (activeIds.has(entityId)) return;
      slotById.delete(entityId);
      idBySlot[slot] = "";
    });
    entities.slice(0, slotCount).forEach((entity) => {
      const slot = assignSlot(entity.entityId);
      if (slot < 0) return;
      const hash = stableHash(`agent-theory-frontier:${entity.entityId}`);
      const angle = (hash / 4294967296) * Math.PI * 2;
      const radius = perimeterProfile.medianRadius * (
        1.03 + ((hash >>> 8) % 1000) / 1000 * 0.08
      );
      const vertical = (
        (((hash >>> 18) % 1000) / 1000) - 0.5
      ) * perimeterProfile.verticalExtent * 0.42;
      const position = center.clone()
        .addScaledVector(axisA, Math.cos(angle) * radius)
        .addScaledVector(axisB, Math.sin(angle) * radius)
        .addScaledVector(axisC, vertical);
      position.toArray(positions, slot * 3);
      color.set(entity.color ?? "#cdd7e4");
      const hsl = { h: 0, s: 0, l: 0 };
      color.getHSL(hsl);
      color.setHSL(hsl.h, Math.min(0.16, hsl.s * 0.35 + 0.025), 0.82);
      color.toArray(colors, slot * 3);
      roles[slot] = entity.role;
      sizes[slot] = entity.role === 3 ? 4.8 : entity.role === 2 ? 3.7 : 3.1;
      const energy = entity.role === 3 ? 0.94 : entity.role === 2 ? 0.76 : 0.66;
      alphas[slot] = THREE.MathUtils.clamp(blend, 0, 1) * energy;
    });
    positionAttribute.needsUpdate = true;
    colorAttribute.needsUpdate = true;
    sizeAttribute.needsUpdate = true;
    alphaAttribute.needsUpdate = true;
    roleAttribute.needsUpdate = true;
  };

  return {
    object,
    setEntities,
    getPosition: (entityId: string) => {
      const slot = slotById.get(entityId);
      if (slot === undefined) return null;
      return new THREE.Vector3(
        positions[slot * 3],
        positions[slot * 3 + 1],
        positions[slot * 3 + 2],
      );
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
  visualProfile: GalaxyVisualProfile = "analysis",
  dynamicPositions = false,
) {
  const count = papers.length;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const semanticColors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const alphas = new Float32Array(count);
  const originalAlphas = new Float32Array(count);
  const selectedMasks = new Float32Array(count);
  const crossfadeMasks = new Float32Array(count);
  const stellarSeeds = new Float32Array(count);
  const stellarRayAngles = new Float32Array(count);
  const stellarRayStrengths = new Float32Array(count);
  const agentFocusRoles = new Float32Array(count);
  const agentLodWeights = new Float32Array(count);
  const agentLodStartWeights = new Float32Array(count);
  const agentLodTargetWeights = new Float32Array(count);
  const topicKeys = papers.map((paper) => paper.topicKey);
  const paperIds = papers.map((paper) => paper.paperId);
  const color = new THREE.Color();
  const rayEligibleIds = new Set(
    papers
      .slice()
      .sort((left, right) => (
        right.size * right.alpha - left.size * left.alpha
        || left.paperId.localeCompare(right.paperId)
      ))
      .slice(0, Math.max(1, Math.ceil(papers.length * 0.02)))
      .map((paper) => paper.paperId),
  );

  papers.forEach((paper, index) => {
    positions[index * 3] = paper.x;
    positions[index * 3 + 1] = paper.y;
    positions[index * 3 + 2] = paper.z;
    color.set(paper.color);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
    color.set(paper.semanticColor ?? paper.color);
    semanticColors[index * 3] = color.r;
    semanticColors[index * 3 + 1] = color.g;
    semanticColors[index * 3 + 2] = color.b;
    sizes[index] = paper.size;
    alphas[index] = paper.alpha;
    originalAlphas[index] = paper.alpha;
    stellarSeeds[index] = paper.visualSeed;
    stellarRayAngles[index] = paper.rayAngle;
    stellarRayStrengths[index] = rayEligibleIds.has(paper.paperId)
      ? 0.28 + paper.visualBrightnessVariation * 0.12
      : 0;
    agentLodWeights[index] = visualProfile === "agent-theory" ? 0 : 1;
    agentLodStartWeights[index] = agentLodWeights[index];
    agentLodTargetWeights[index] = agentLodWeights[index];
  });

  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(positions, 3);
  if (dynamicPositions) positionAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", positionAttribute);
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("semanticColor", new THREE.BufferAttribute(semanticColors, 3));
  geometry.setAttribute("pointSize", new THREE.BufferAttribute(sizes, 1));
  const alphaAttribute = new THREE.BufferAttribute(alphas, 1);
  geometry.setAttribute("pointAlpha", alphaAttribute);
  const selectedMaskAttribute = new THREE.BufferAttribute(selectedMasks, 1);
  geometry.setAttribute("selectedMask", selectedMaskAttribute);
  const crossfadeMaskAttribute = new THREE.BufferAttribute(crossfadeMasks, 1);
  geometry.setAttribute("crossfadeMask", crossfadeMaskAttribute);
  geometry.setAttribute(
    "stellarSeed",
    new THREE.BufferAttribute(stellarSeeds, 1),
  );
  geometry.setAttribute(
    "stellarRayAngle",
    new THREE.BufferAttribute(stellarRayAngles, 1),
  );
  geometry.setAttribute(
    "stellarRayStrength",
    new THREE.BufferAttribute(stellarRayStrengths, 1),
  );
  const agentFocusRoleAttribute = new THREE.BufferAttribute(agentFocusRoles, 1);
  geometry.setAttribute("agentFocusRole", agentFocusRoleAttribute);
  const agentLodWeightAttribute = new THREE.BufferAttribute(agentLodWeights, 1);
  geometry.setAttribute("agentLodWeight", agentLodWeightAttribute);

  const coreMaterial = createPaperMaterial(
    pixelRatio,
    kind,
    visualProfile,
    "core",
  );
  const coreObject = new THREE.Points(geometry, coreMaterial);
  coreObject.frustumCulled = false;
  coreObject.renderOrder = 1;
  const opticalMaterial = visualProfile === "agent-theory"
    ? createPaperMaterial(pixelRatio, kind, visualProfile, "optical")
    : null;
  const opticalObject = opticalMaterial
    ? new THREE.Points(geometry, opticalMaterial)
    : null;
  if (opticalObject) {
    opticalObject.frustumCulled = false;
    opticalObject.renderOrder = 2;
  }
  const object = new THREE.Group();
  object.add(coreObject);
  if (opticalObject) object.add(opticalObject);
  const materials = opticalMaterial
    ? [coreMaterial, opticalMaterial]
    : [coreMaterial];
  let agentLodTransitionPausedAt = Number.NEGATIVE_INFINITY;
  const agentLodTransitionStartTimes = new Float64Array(count);
  const agentLodTransitionDurations = new Float32Array(count);
  const agentLodTransitionDelays = new Float32Array(count);
  const agentLodTransitionActiveMask = new Uint8Array(count);
  const agentLodDesiredMask = new Uint8Array(count);
  let agentLodTransitionActiveCount = 0;
  let selectedTopicKey = "";
  return {
    object,
    pickObject: coreObject,
    setOpacity: (opacity: number) => {
      materials.forEach((material) => {
        material.uniforms.uSceneOpacity.value = opacity;
      });
    },
    setExplorationSelection: (topicKey: string, focusPosition: THREE.Vector3) => {
      materials.forEach((material) => {
        material.uniforms.uFocusPosition.value.copy(focusPosition);
      });
      if (selectedTopicKey === topicKey) return;
      selectedTopicKey = topicKey;
      for (let index = 0; index < selectedMasks.length; index += 1) {
        selectedMasks[index] = topicKeys[index] === topicKey ? 1 : 0;
      }
      selectedMaskAttribute.needsUpdate = true;
    },
    setExplorationProgress: (progress: number, selectedTopicOpacity: number) => {
      materials.forEach((material) => {
        material.uniforms.uExplorationProgress.value = progress;
        material.uniforms.uSelectedTopicOpacity.value = THREE.MathUtils.clamp(
          selectedTopicOpacity,
          0,
          1,
        );
      });
    },
    setTheoryFarTransitionModes: (modeByTopic: Map<string, "retreat" | "crossfade">) => {
      for (let index = 0; index < crossfadeMasks.length; index += 1) {
        crossfadeMasks[index] = modeByTopic.get(topicKeys[index]) === "crossfade" ? 1 : 0;
      }
      crossfadeMaskAttribute.needsUpdate = true;
    },
    setFarRotation: (rotationAngle: number) => {
      materials.forEach((material) => {
        material.uniforms.uFarRotationAngle.value = rotationAngle;
      });
    },
    setOverviewFarBlend: (blend: number) => {
      materials.forEach((material) => {
        material.uniforms.uOverviewFarBlend.value = THREE.MathUtils.clamp(
          blend,
          0,
          1,
        );
      });
    },
    setSystemDepthCue: (centerViewDepth: number, depthRange: number, strength: number) => {
      materials.forEach((material) => {
        material.uniforms.uSystemCenterViewDepth.value = centerViewDepth;
        material.uniforms.uSystemDepthRange.value = Math.max(0.001, depthRange);
        material.uniforms.uSystemDepthStrength.value = THREE.MathUtils.clamp(
          strength,
          0,
          1,
        );
      });
    },
    setAgentDepthRange: (nearDepth: number, farDepth: number) => {
      materials.forEach((material) => {
        material.uniforms.uAgentDepthNear.value = nearDepth;
        material.uniforms.uAgentDepthFar.value = Math.max(
          nearDepth + 0.001,
          farDepth,
        );
      });
    },
    setViewportHeight: (viewportHeight: number) => {
      materials.forEach((material) => {
        material.uniforms.uViewportHeight.value = Math.max(1, viewportHeight);
      });
    },
    setAgentFocusVisual: (
      primaryId: string | undefined,
      evidenceIds: ReadonlySet<string>,
      contextIds: ReadonlySet<string>,
      blend: number,
      backgroundBlend = blend,
    ) => {
      if (visualProfile !== "agent-theory") return;
      const safeBlend = THREE.MathUtils.clamp(blend, 0, 1);
      let changed = false;
      for (let index = 0; index < paperIds.length; index += 1) {
        const paperId = paperIds[index];
        const nextRole = paperId === primaryId
          ? 3
          : evidenceIds.has(paperId)
            ? 2
            : contextIds.has(paperId)
              ? 1
              : 0;
        if (agentFocusRoles[index] === nextRole) continue;
        agentFocusRoles[index] = nextRole;
        changed = true;
      }
      if (changed) agentFocusRoleAttribute.needsUpdate = true;
      materials.forEach((material) => {
        material.uniforms.uAgentFocusBlend.value = safeBlend;
        material.uniforms.uAgentFocusBackgroundBlend.value =
          THREE.MathUtils.clamp(backgroundBlend, 0, 1);
      });
    },
    setAgentLodSelection: (
      selectedIndices: readonly number[],
      nowMs: number,
      immediate = false,
      options?: {
        incomingDurationMs?: number;
        retiringDurationMs?: number;
        retiringDelayMs?: number;
      },
    ) => {
      if (visualProfile !== "agent-theory") return;
      agentLodDesiredMask.fill(0);
      selectedIndices.forEach((index) => {
        if (index >= 0 && index < count) agentLodDesiredMask[index] = 1;
      });
      if (immediate) {
        for (let index = 0; index < count; index += 1) {
          const desired = agentLodDesiredMask[index];
          agentLodTargetWeights[index] = desired;
          agentLodWeights[index] = desired;
          agentLodStartWeights[index] = desired;
          agentLodTransitionActiveMask[index] = 0;
        }
        agentLodTransitionActiveCount = 0;
        agentLodTransitionPausedAt = Number.NEGATIVE_INFINITY;
        agentLodWeightAttribute.needsUpdate = true;
        return;
      }
      const incomingDurationMs = Math.max(
        1,
        options?.incomingDurationMs ?? 90,
      );
      const retiringDurationMs = Math.max(
        1,
        options?.retiringDurationMs ?? APP17_AGENT_THEORY_LOD_CROSSFADE_MS,
      );
      const retiringDelayMs = Math.max(
        0,
        options?.retiringDelayMs ?? APP17_AGENT_THEORY_LOD_CROSSFADE_MS,
      );
      for (let index = 0; index < count; index += 1) {
        const desired = agentLodDesiredMask[index];
        if (Math.abs(agentLodTargetWeights[index] - desired) <= 1e-5) {
          continue;
        }
        agentLodTargetWeights[index] = desired;
        agentLodStartWeights[index] = agentLodWeights[index];
        agentLodTransitionStartTimes[index] = nowMs;
        agentLodTransitionDurations[index] = desired > 0.5
          ? incomingDurationMs
          : retiringDurationMs;
        agentLodTransitionDelays[index] = desired > 0.5
          ? 0
          : retiringDelayMs;
        if (agentLodTransitionActiveMask[index] === 0) {
          agentLodTransitionActiveMask[index] = 1;
          agentLodTransitionActiveCount += 1;
        }
      }
    },
    setAgentLodTransitionPaused: (paused: boolean, nowMs: number) => {
      if (agentLodTransitionActiveCount === 0) {
        agentLodTransitionPausedAt = Number.NEGATIVE_INFINITY;
        return;
      }
      if (paused) {
        if (!Number.isFinite(agentLodTransitionPausedAt)) {
          agentLodTransitionPausedAt = nowMs;
        }
        return;
      }
      if (Number.isFinite(agentLodTransitionPausedAt)) {
        const pausedDuration = Math.max(
          0,
          nowMs - agentLodTransitionPausedAt,
        );
        for (let index = 0; index < count; index += 1) {
          if (agentLodTransitionActiveMask[index] === 0) continue;
          agentLodTransitionStartTimes[index] += pausedDuration;
        }
        agentLodTransitionPausedAt = Number.NEGATIVE_INFINITY;
      }
    },
    advanceAgentLodTransition: (nowMs: number) => {
      if (
        agentLodTransitionActiveCount === 0
        || Number.isFinite(agentLodTransitionPausedAt)
      ) return false;
      let changed = false;
      for (let index = 0; index < count; index += 1) {
        if (agentLodTransitionActiveMask[index] === 0) continue;
        const progress = THREE.MathUtils.clamp(
          (
            nowMs
            - agentLodTransitionStartTimes[index]
            - agentLodTransitionDelays[index]
          ) / Math.max(1, agentLodTransitionDurations[index]),
          0,
          1,
        );
        const eased = smootherStep(progress);
        const nextWeight = THREE.MathUtils.lerp(
          agentLodStartWeights[index],
          agentLodTargetWeights[index],
          eased,
        );
        if (Math.abs(nextWeight - agentLodWeights[index]) <= 1e-5) continue;
        agentLodWeights[index] = nextWeight;
        changed = true;
        if (progress >= 1) {
          agentLodWeights[index] = agentLodTargetWeights[index];
          agentLodStartWeights[index] = agentLodTargetWeights[index];
          agentLodTransitionActiveMask[index] = 0;
          agentLodTransitionActiveCount = Math.max(
            0,
            agentLodTransitionActiveCount - 1,
          );
        }
      }
      if (changed) agentLodWeightAttribute.needsUpdate = true;
      if (agentLodTransitionActiveCount === 0) {
        agentLodTransitionPausedAt = Number.NEGATIVE_INFINITY;
      }
      return changed || agentLodTransitionActiveCount > 0;
    },
    isAgentLodTransitioning: () => (
      agentLodTransitionActiveCount > 0
      && !Number.isFinite(agentLodTransitionPausedAt)
    ),
    getAgentLodWeights: () => agentLodWeights,
    getAgentLodTargetWeights: () => agentLodTargetWeights,
    getPaperIds: () => paperIds,
    getTopicKeys: () => topicKeys,
    getSizes: () => sizes,
    getOriginalAlphas: () => originalAlphas,
    getPositions: () => positions,
    getPaperIndex: (paperId: string) => paperIds.indexOf(paperId),
    getAgentLodSelectionCount: () => {
      let selected = 0;
      for (let index = 0; index < count; index += 1) {
        if (agentLodTargetWeights[index] >= 0.5) selected += 1;
      }
      return selected;
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
      materials.forEach((material) => material.dispose());
    },
  };
}

function createHotspotLayer(
  hotspots: App17RenderPoint[],
  pixelRatio: number,
  kind: App17SceneData["kind"],
  visualProfile: GalaxyVisualProfile = "analysis",
) {
  const count = hotspots.length;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const pointIntensities = new Float32Array(count);
  const haloStrengths = new Float32Array(count);
  const rayStrengths = new Float32Array(count);
  const breathPhases = new Float32Array(count);
  const breathSpeeds = new Float32Array(count);
  const breathAmplitudes = new Float32Array(count);
  const selectedMasks = new Float32Array(count);
  const crossfadeMasks = new Float32Array(count);
  const sphereBlends = new Float32Array(count);
  const agentFocusRoles = new Float32Array(count);
  const topicKeys = hotspots.map((hotspot) => topicKeyFromHotspot(hotspot));
  const hotspotIds = hotspots.map((hotspot) => hotspot.id);
  const color = new THREE.Color();
  const rayRankById = new Map(
    hotspots
      .slice()
      .sort((a, b) => b.paperCount - a.paperCount || a.id.localeCompare(b.id))
      .slice(0, Math.max(1, Math.ceil(hotspots.length * 0.2)))
      .map((hotspot, rank) => [hotspot.id, rank]),
  );
  const rayEligibleCount = Math.max(1, rayRankById.size);

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
    rayStrengths[index] = rayRank === undefined
      ? 0
      : 0.025 + (1 - rayRank / Math.max(1, rayEligibleCount - 1)) * 0.045;
    breathPhases[index] = hotspot.seed * Math.PI * 2;
    breathSpeeds[index] = (Math.PI * 2) / hotspot.breathPeriodSeconds;
    breathAmplitudes[index] = visualProfile === "agent-theory"
      ? 0
      : hotspot.breathAmplitudeScale;
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
  geometry.setAttribute("breathAmplitude", new THREE.BufferAttribute(breathAmplitudes, 1));
  const selectedMaskAttribute = new THREE.BufferAttribute(selectedMasks, 1);
  geometry.setAttribute("selectedMask", selectedMaskAttribute);
  const crossfadeMaskAttribute = new THREE.BufferAttribute(crossfadeMasks, 1);
  geometry.setAttribute("crossfadeMask", crossfadeMaskAttribute);
  const sphereBlendAttribute = new THREE.BufferAttribute(sphereBlends, 1);
  geometry.setAttribute("sphereBlend", sphereBlendAttribute);
  const agentFocusRoleAttribute = new THREE.BufferAttribute(agentFocusRoles, 1);
  geometry.setAttribute("agentFocusRole", agentFocusRoleAttribute);

  const coreMaterial = createHotspotPointSourceMaterial(
    pixelRatio,
    kind,
    visualProfile,
    "core",
  );
  const coreObject = new THREE.Points(geometry, coreMaterial);
  coreObject.frustumCulled = false;
  coreObject.renderOrder = 1;
  const opticalMaterial = visualProfile === "agent-theory"
    ? createHotspotPointSourceMaterial(pixelRatio, kind, visualProfile, "optical")
    : null;
  const opticalObject = opticalMaterial
    ? new THREE.Points(geometry, opticalMaterial)
    : null;
  if (opticalObject) {
    opticalObject.frustumCulled = false;
    opticalObject.renderOrder = 2;
  }
  const object = new THREE.Group();
  object.add(coreObject);
  if (opticalObject) object.add(opticalObject);
  const materials = opticalMaterial
    ? [coreMaterial, opticalMaterial]
    : [coreMaterial];
  let selectedTopicKey = "";

  return {
    object,
    pickObject: coreObject,
    setOpacity: (opacity: number) => {
      materials.forEach((material) => {
        material.uniforms.uSceneOpacity.value = opacity;
      });
    },
    setExplorationSelection: (topicKey: string, focusPosition: THREE.Vector3) => {
      materials.forEach((material) => {
        material.uniforms.uFocusPosition.value.copy(focusPosition);
      });
      if (selectedTopicKey === topicKey) return;
      selectedTopicKey = topicKey;
      for (let index = 0; index < selectedMasks.length; index += 1) {
        selectedMasks[index] = topicKeys[index] === topicKey ? 1 : 0;
      }
      selectedMaskAttribute.needsUpdate = true;
    },
    setExplorationProgress: (progress: number) => {
      materials.forEach((material) => {
        material.uniforms.uExplorationProgress.value = progress;
      });
    },
    setTheoryFarTransitionModes: (modeByTopic: Map<string, "retreat" | "crossfade">) => {
      for (let index = 0; index < crossfadeMasks.length; index += 1) {
        crossfadeMasks[index] = modeByTopic.get(topicKeys[index]) === "crossfade" ? 1 : 0;
      }
      crossfadeMaskAttribute.needsUpdate = true;
    },
    setAmbientState: (timeSeconds: number, rotationAngle: number, strength: number, overviewAmbient = 0) => {
      materials.forEach((material) => {
        material.uniforms.uAmbientTime.value = timeSeconds;
        material.uniforms.uFarRotationAngle.value = rotationAngle;
        material.uniforms.uAmbientStrength.value = strength;
        material.uniforms.uOverviewAmbient.value = THREE.MathUtils.clamp(overviewAmbient, 0, 1);
      });
    },
    setOverviewFarBlend: (blend: number) => {
      materials.forEach((material) => {
        material.uniforms.uOverviewFarBlend.value = THREE.MathUtils.clamp(blend, 0, 1);
      });
    },
    setViewportHeight: (viewportHeight: number) => {
      materials.forEach((material) => {
        material.uniforms.uViewportHeight.value = Math.max(1, viewportHeight);
      });
    },
    setAgentFocusVisual: (
      primaryId: string | undefined,
      evidenceIds: ReadonlySet<string>,
      contextIds: ReadonlySet<string>,
      blend: number,
      backgroundBlend = blend,
    ) => {
      if (visualProfile !== "agent-theory") return;
      const safeBlend = THREE.MathUtils.clamp(blend, 0, 1);
      let changed = false;
      for (let index = 0; index < hotspotIds.length; index += 1) {
        const hotspotId = hotspotIds[index];
        const nextRole = hotspotId === primaryId
          ? 3
          : evidenceIds.has(hotspotId)
            ? 2
            : contextIds.has(hotspotId)
              ? 1
              : 0;
        if (agentFocusRoles[index] === nextRole) continue;
        agentFocusRoles[index] = nextRole;
        changed = true;
      }
      if (changed) agentFocusRoleAttribute.needsUpdate = true;
      materials.forEach((material) => {
        material.uniforms.uAgentFocusBlend.value = safeBlend;
        material.uniforms.uAgentFocusBackgroundBlend.value =
          THREE.MathUtils.clamp(backgroundBlend, 0, 1);
      });
    },
    setResolvedSphereBlends: (blendById: ReadonlyMap<string, number>) => {
      let changed = false;
      for (let index = 0; index < sphereBlends.length; index += 1) {
        const next = THREE.MathUtils.clamp(
          blendById.get(hotspotIds[index]) ?? 0,
          0,
          1,
        );
        if (Math.abs(next - sphereBlends[index]) <= 1e-4) continue;
        sphereBlends[index] = next;
        changed = true;
      }
      if (changed) sphereBlendAttribute.needsUpdate = true;
    },
    dispose: () => {
      geometry.dispose();
      materials.forEach((material) => material.dispose());
    },
  };
}

function createAgentTheoryHotspotSphereLayer(
  hotspots: App17RenderPoint[],
) {
  const maximumSlots = 12;
  const maximumRetiringSlots = 12;
  const geometry = new THREE.SphereGeometry(1, 32, 24);
  const instanceSeeds = new Float32Array(maximumSlots);
  const instanceBlends = new Float32Array(maximumSlots);
  const seedAttribute = new THREE.InstancedBufferAttribute(instanceSeeds, 1);
  const blendAttribute = new THREE.InstancedBufferAttribute(instanceBlends, 1);
  geometry.setAttribute("instanceSeed", seedAttribute);
  geometry.setAttribute("instanceBlend", blendAttribute);
  const retiringGeometry = new THREE.SphereGeometry(1, 32, 24);
  const retiringInstanceSeeds = new Float32Array(maximumRetiringSlots);
  const retiringInstanceBlends = new Float32Array(maximumRetiringSlots);
  const retiringSeedAttribute = new THREE.InstancedBufferAttribute(
    retiringInstanceSeeds,
    1,
  );
  const retiringBlendAttribute = new THREE.InstancedBufferAttribute(
    retiringInstanceBlends,
    1,
  );
  retiringGeometry.setAttribute("instanceSeed", retiringSeedAttribute);
  retiringGeometry.setAttribute("instanceBlend", retiringBlendAttribute);

  const sharedVertexShader = `
    attribute float instanceSeed;
    attribute float instanceBlend;
    varying vec3 vWorldPosition;
    varying vec3 vWorldNormal;
    varying vec3 vLocalPosition;
    varying vec3 vColor;
    varying float vSeed;
    varying float vBlend;
    void main() {
      vec4 worldPosition = modelMatrix * instanceMatrix * vec4(position, 1.0);
      mat3 worldNormalMatrix = mat3(modelMatrix * instanceMatrix);
      vWorldPosition = worldPosition.xyz;
      vWorldNormal = normalize(worldNormalMatrix * normal);
      vLocalPosition = position;
      vColor = instanceColor;
      vSeed = instanceSeed;
      vBlend = instanceBlend;
      gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
  `;
  const coreMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uSurfaceTime: { value: 0 },
      uSceneOpacity: { value: 1 },
    },
    vertexColors: true,
    transparent: true,
    depthWrite: true,
    depthTest: true,
    blending: THREE.NormalBlending,
    toneMapped: false,
    vertexShader: sharedVertexShader,
    fragmentShader: `
      uniform float uSurfaceTime;
      uniform float uSceneOpacity;
      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;
      varying vec3 vLocalPosition;
      varying vec3 vColor;
      varying float vSeed;
      varying float vBlend;
      void main() {
        vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
        float facing = clamp(dot(normalize(vWorldNormal), viewDirection), 0.0, 1.0);
        float limb = pow(facing, 0.34);
        float grainA = sin(
          dot(vLocalPosition, vec3(19.7, 23.1, 17.3))
            + vSeed * 31.7
            + uSurfaceTime * 0.035
        );
        float grainB = sin(
          dot(vLocalPosition.yzx, vec3(41.0, 35.0, 29.0))
            - vSeed * 17.0
            - uSurfaceTime * 0.021
        );
        float granulation = 0.94 + (grainA * grainB) * 0.045;
        vec3 lowChromaSurface = mix(
          vec3(dot(vColor, vec3(0.2126, 0.7152, 0.0722))),
          vColor,
          0.58
        );
        vec3 photosphere = mix(
          lowChromaSurface * 0.82,
          vec3(1.0, 0.995, 0.975),
          pow(facing, 1.8) * 0.74
        );
        float exposure = mix(0.72, 1.0, facing) * granulation;
        float alpha = vBlend * uSceneOpacity * smoothstep(0.0, 0.08, facing);
        if (alpha <= 0.002) discard;
        gl_FragColor = vec4(photosphere * exposure, alpha);
        #include <colorspace_fragment>
      }
    `,
  });
  coreMaterial.name = "AgentTheoryHotspotSphereCore";
  const coronaMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uSurfaceTime: { value: 0 },
      uSceneOpacity: { value: 1 },
    },
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    toneMapped: false,
    vertexShader: sharedVertexShader,
    fragmentShader: `
      uniform float uSceneOpacity;
      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;
      varying vec3 vColor;
      varying float vBlend;
      void main() {
        vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
        float rim = pow(
          1.0 - abs(dot(normalize(vWorldNormal), viewDirection)),
          4.2
        );
        float alpha = min(0.055, rim * 0.065) * vBlend * uSceneOpacity;
        if (alpha <= 0.002) discard;
        vec3 coronaColor = mix(vColor, vec3(1.0), 0.72);
        gl_FragColor = vec4(coronaColor, alpha);
        #include <colorspace_fragment>
      }
    `,
  });
  coronaMaterial.name = "AgentTheoryHotspotSphereCorona";
  const core = new THREE.InstancedMesh(geometry, coreMaterial, maximumSlots);
  const corona = new THREE.InstancedMesh(geometry, coronaMaterial, maximumSlots);
  const retiringCore = new THREE.InstancedMesh(
    retiringGeometry,
    coreMaterial,
    maximumRetiringSlots,
  );
  const retiringCorona = new THREE.InstancedMesh(
    retiringGeometry,
    coronaMaterial,
    maximumRetiringSlots,
  );
  core.frustumCulled = false;
  corona.frustumCulled = false;
  retiringCore.frustumCulled = false;
  retiringCorona.frustumCulled = false;
  core.renderOrder = 3;
  corona.renderOrder = 4;
  retiringCore.renderOrder = 3;
  retiringCorona.renderOrder = 4;
  // Keep one fully transparent instance available for the initial
  // renderer.compile() pass. The first LOD update replaces this sentinel.
  core.count = 1;
  corona.count = 1;
  retiringCore.count = 0;
  retiringCorona.count = 0;
  const neutral = new THREE.Color("#dbe5f1");
  const sentinelMatrix = new THREE.Matrix4();
  for (let slot = 0; slot < maximumSlots; slot += 1) {
    core.setMatrixAt(slot, sentinelMatrix);
    corona.setMatrixAt(slot, sentinelMatrix);
    core.setColorAt(slot, neutral);
    corona.setColorAt(slot, neutral);
  }
  for (let slot = 0; slot < maximumRetiringSlots; slot += 1) {
    retiringCore.setMatrixAt(slot, sentinelMatrix);
    retiringCorona.setMatrixAt(slot, sentinelMatrix);
    retiringCore.setColorAt(slot, neutral);
    retiringCorona.setColorAt(slot, neutral);
  }
  instanceBlends[0] = 0;
  core.instanceMatrix.needsUpdate = true;
  corona.instanceMatrix.needsUpdate = true;
  retiringCore.instanceMatrix.needsUpdate = true;
  retiringCorona.instanceMatrix.needsUpdate = true;
  if (!core.instanceColor || !corona.instanceColor) {
    throw new Error("Agent theory sphere instanceColor buffers were not created");
  }
  if (!retiringCore.instanceColor || !retiringCorona.instanceColor) {
    throw new Error("Agent theory retiring sphere instanceColor buffers were not created");
  }
  core.instanceColor.needsUpdate = true;
  corona.instanceColor.needsUpdate = true;
  retiringCore.instanceColor.needsUpdate = true;
  retiringCorona.instanceColor.needsUpdate = true;
  blendAttribute.needsUpdate = true;
  retiringBlendAttribute.needsUpdate = true;

  const object = new THREE.Group();
  object.add(core, corona, retiringCore, retiringCorona);
  const lodById = new Map<string, AgentTheoryStellarLod>();
  const blendById = new Map<string, number>();
  const projectedDiameterById = new Map<string, number>();
  const worldPosition = new THREE.Vector3();
  const viewPosition = new THREE.Vector3();
  const projectedPosition = new THREE.Vector3();
  const worldScale = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  let transitionCount = 0;
  let activeSphereCount = 0;
  let currentSphereCount = 0;
  let retiringSphereCount = 0;
  let offscreenSphereSlotCount = 0;

  const update = ({
    camera,
    root,
    viewportHeight,
    deltaSeconds,
    surfaceTimeSeconds,
  }: {
    camera: THREE.PerspectiveCamera;
    root: THREE.Object3D;
    viewportHeight: number;
    deltaSeconds: number;
    surfaceTimeSeconds: number;
  }) => {
    root.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    root.getWorldScale(worldScale);
    const rootScale = Math.max(worldScale.x, worldScale.y, worldScale.z);
    type HotspotSphereCandidate = {
      hotspot: App17RenderPoint;
      worldPosition: THREE.Vector3;
      diameter: number;
      worldRadius: number;
    };
    const sphereCandidates: HotspotSphereCandidate[] = [];
    const resolvedById = new Map<string, HotspotSphereCandidate>();
    offscreenSphereSlotCount = 0;
    projectedDiameterById.clear();
    hotspots.forEach((hotspot) => {
      worldPosition.copy(hotspot.position).applyMatrix4(root.matrixWorld);
      viewPosition.copy(worldPosition).applyMatrix4(camera.matrixWorldInverse);
      const viewDepth = -viewPosition.z;
      const worldRadius = (
        0.16 + hotspot.importance * 0.18
      ) * APP15_COORD_SCALE * rootScale;
      const diameter = viewDepth > 0
        ? resolveAgentTheoryAngularDiameterCssPx({
          worldDiameter: worldRadius * 2,
          viewDepth,
          viewportHeight,
          fovDegrees: camera.fov,
        })
        : 0;
      const resolvedCandidate: HotspotSphereCandidate = {
        hotspot,
        worldPosition: worldPosition.clone(),
        diameter,
        worldRadius,
      };
      resolvedById.set(hotspot.id, resolvedCandidate);
      projectedDiameterById.set(hotspot.id, diameter);
      const previousLod = lodById.get(hotspot.id);
      const lod = resolveAgentTheoryStellarLod(
        diameter,
        false,
        previousLod,
      );
      if (lod !== previousLod && previousLod !== undefined) transitionCount += 1;
      lodById.set(hotspot.id, lod);
      if (lod !== "sphere") return;
      projectedPosition.copy(worldPosition).project(camera);
      if (
        projectedPosition.z < -1
        || projectedPosition.z > 1
        || Math.abs(projectedPosition.x) > 1
        || Math.abs(projectedPosition.y) > 1
      ) {
        offscreenSphereSlotCount += 1;
        return;
      }
      sphereCandidates.push(resolvedCandidate);
    });
    sphereCandidates.sort((left, right) => (
      right.diameter - left.diameter
      || right.hotspot.importance - left.hotspot.importance
      || left.hotspot.id.localeCompare(right.hotspot.id)
    ));
    const selected = sphereCandidates.slice(0, maximumSlots);
    const selectedIds = new Set(selected.map(({ hotspot }) => hotspot.id));
    const blendStep = Math.min(1, Math.max(0, deltaSeconds) / 0.4);
    hotspots.forEach((hotspot) => {
      const current = blendById.get(hotspot.id) ?? 0;
      const target = selectedIds.has(hotspot.id) ? 1 : 0;
      const next = target > current
        ? Math.min(target, current + blendStep)
        : Math.max(target, current - blendStep);
      if (next <= 0.001 && target === 0) blendById.delete(hotspot.id);
      else blendById.set(hotspot.id, next);
    });
    const rendered = selected
      .map((candidate) => ({
        ...candidate,
        blend: blendById.get(candidate.hotspot.id) ?? 0,
      }))
      .filter(({ blend }) => blend > 0.001);
    const retiring = Array.from(blendById.entries())
      .filter(([hotspotId, blend]) => (
        !selectedIds.has(hotspotId)
        && blend > 0.001
        && resolvedById.has(hotspotId)
      ))
      .map(([hotspotId, blend]) => ({
        ...resolvedById.get(hotspotId)!,
        blend,
      }))
      .sort((left, right) => (
        right.blend - left.blend
        || right.diameter - left.diameter
        || left.hotspot.id.localeCompare(right.hotspot.id)
      ));
    const retiringCapacity = Math.max(0, maximumSlots - rendered.length);
    const renderedRetiring = retiring.slice(
      0,
      Math.min(maximumRetiringSlots, retiringCapacity),
    );
    retiring.slice(renderedRetiring.length).forEach(({ hotspot }) => {
      // Extremely fast camera changes can retire more than one complete set
      // inside the 400ms optical crossfade. Restore the point-source owner
      // immediately for overflow entities rather than exceeding the global
      // twelve-sphere visual budget or keeping the point source hidden.
      blendById.delete(hotspot.id);
    });
    rendered.forEach((candidate, slot) => {
      const color = new THREE.Color(candidate.hotspot.color);
      scale.setScalar(candidate.worldRadius);
      matrix.compose(candidate.worldPosition, quaternion, scale);
      core.setMatrixAt(slot, matrix);
      core.setColorAt(slot, color);
      scale.setScalar(candidate.worldRadius * 1.08);
      matrix.compose(candidate.worldPosition, quaternion, scale);
      corona.setMatrixAt(slot, matrix);
      corona.setColorAt(slot, color);
      instanceSeeds[slot] = candidate.hotspot.seed;
      instanceBlends[slot] = candidate.blend;
    });
    renderedRetiring.forEach((candidate, slot) => {
      const color = new THREE.Color(candidate.hotspot.color);
      scale.setScalar(candidate.worldRadius);
      matrix.compose(candidate.worldPosition, quaternion, scale);
      retiringCore.setMatrixAt(slot, matrix);
      retiringCore.setColorAt(slot, color);
      scale.setScalar(candidate.worldRadius * 1.08);
      matrix.compose(candidate.worldPosition, quaternion, scale);
      retiringCorona.setMatrixAt(slot, matrix);
      retiringCorona.setColorAt(slot, color);
      retiringInstanceSeeds[slot] = candidate.hotspot.seed;
      retiringInstanceBlends[slot] = candidate.blend;
    });
    currentSphereCount = rendered.length;
    retiringSphereCount = renderedRetiring.length;
    activeSphereCount = currentSphereCount + retiringSphereCount;
    core.count = currentSphereCount;
    corona.count = currentSphereCount;
    retiringCore.count = retiringSphereCount;
    retiringCorona.count = retiringSphereCount;
    core.instanceMatrix.needsUpdate = true;
    corona.instanceMatrix.needsUpdate = true;
    retiringCore.instanceMatrix.needsUpdate = true;
    retiringCorona.instanceMatrix.needsUpdate = true;
    if (core.instanceColor) core.instanceColor.needsUpdate = true;
    if (corona.instanceColor) corona.instanceColor.needsUpdate = true;
    if (retiringCore.instanceColor) retiringCore.instanceColor.needsUpdate = true;
    if (retiringCorona.instanceColor) retiringCorona.instanceColor.needsUpdate = true;
    seedAttribute.needsUpdate = true;
    blendAttribute.needsUpdate = true;
    retiringSeedAttribute.needsUpdate = true;
    retiringBlendAttribute.needsUpdate = true;
    coreMaterial.uniforms.uSurfaceTime.value = surfaceTimeSeconds;
    coronaMaterial.uniforms.uSurfaceTime.value = surfaceTimeSeconds;
    return {
      blendById,
      lodById,
      projectedDiameterById,
      activeSphereCount,
      currentSphereCount,
      retiringSphereCount,
      offscreenSphereSlotCount,
      transitionCount,
    };
  };

  return {
    object,
    update,
    setOpacity: (opacity: number) => {
      const bounded = THREE.MathUtils.clamp(opacity, 0, 1);
      coreMaterial.uniforms.uSceneOpacity.value = bounded;
      coronaMaterial.uniforms.uSceneOpacity.value = bounded;
      object.visible = bounded > 0.001;
    },
    getBlendById: () => blendById,
    getLodById: () => lodById,
    getProjectedDiameterById: () => projectedDiameterById,
    getActiveSphereCount: () => activeSphereCount,
    getCurrentSphereCount: () => currentSphereCount,
    getRetiringSphereCount: () => retiringSphereCount,
    getOffscreenSphereSlotCount: () => offscreenSphereSlotCount,
    getTransitionCount: () => transitionCount,
    dispose: () => {
      geometry.dispose();
      retiringGeometry.dispose();
      coreMaterial.dispose();
      coronaMaterial.dispose();
    },
  };
}

function setAgentDepthRangeOnObject(
  object: THREE.Object3D,
  nearDepth: number,
  farDepth: number,
) {
  object.traverse((child) => {
    const candidate = child as THREE.Points<
      THREE.BufferGeometry,
      THREE.Material | THREE.Material[]
    >;
    const materials = Array.isArray(candidate.material)
      ? candidate.material
      : candidate.material
        ? [candidate.material]
        : [];
    materials.forEach((material) => {
      if (!(material instanceof THREE.ShaderMaterial)) return;
      if (!material.uniforms.uAgentDepthNear || !material.uniforms.uAgentDepthFar) {
        return;
      }
      material.uniforms.uAgentDepthNear.value = nearDepth;
      material.uniforms.uAgentDepthFar.value = Math.max(
        nearDepth + 0.001,
        farDepth,
      );
    });
  });
}

function createTheoryFarBackgroundLayer(
  plan: GalaxyFarBackgroundPlan,
  renderHotspots: App17RenderPoint[],
  pixelRatio: number,
) {
  type FarPaperRuntime = {
    hotspot: GalaxyFarBackgroundHotspotPlan;
    localOffset: THREE.Vector3;
  };

  const root = new THREE.Group();
  root.name = "theory-far-background";
  root.visible = false;
  const renderHotspotById = new Map(renderHotspots.map((hotspot) => [hotspot.id, hotspot]));
  const hotspotPositions = new Float32Array(plan.hotspots.length * 3);
  const hotspotColors = new Float32Array(plan.hotspots.length * 3);
  const hotspotSizes = new Float32Array(plan.hotspots.length);
  const hotspotReveals = new Float32Array(plan.hotspots.length);
  const hotspotBreathPhases = new Float32Array(plan.hotspots.length);
  const hotspotBreathSpeeds = new Float32Array(plan.hotspots.length);
  const color = new THREE.Color();
  plan.hotspots.forEach((hotspot, index) => {
    const renderHotspot = renderHotspotById.get(hotspot.hotspotId);
    // Prefer the rendered family colour so the retreating proxies match the
    // galaxy they were lifted from rather than the raw payload palette.
    color.set(renderHotspot?.color || hotspot.color || "#dce9ff");
    hotspotColors[index * 3] = color.r;
    hotspotColors[index * 3 + 1] = color.g;
    hotspotColors[index * 3 + 2] = color.b;
    hotspotSizes[index] = renderHotspot?.displaySize ?? Math.max(6, hotspot.sourceSize);
    hotspotBreathPhases[index] = hotspot.breathPhase;
    hotspotBreathSpeeds[index] = Math.PI * 2 / Math.max(1, hotspot.breathingPeriodSeconds);
  });

  const paperRuntime: FarPaperRuntime[] = [];
  plan.hotspots.forEach((hotspot) => {
    hotspot.papers.forEach((paper) => {
      paperRuntime.push({
        hotspot,
        localOffset: new THREE.Vector3(...paper.localOffset),
      });
    });
  });
  const paperPositions = new Float32Array(paperRuntime.length * 3);
  const paperColors = new Float32Array(paperRuntime.length * 3);
  const paperSizes = new Float32Array(paperRuntime.length);
  const paperReveals = new Float32Array(paperRuntime.length);
  const paperBreathPhases = new Float32Array(paperRuntime.length);
  const paperBreathSpeeds = new Float32Array(paperRuntime.length);
  let paperIndex = 0;
  plan.hotspots.forEach((hotspot) => {
    const renderHotspot = renderHotspotById.get(hotspot.hotspotId);
    hotspot.papers.forEach((paper) => {
      color.set(app17PaperColor(renderHotspot?.color || hotspot.color || paper.color || "#a8c8ff"));
      paperColors[paperIndex * 3] = color.r;
      paperColors[paperIndex * 3 + 1] = color.g;
      paperColors[paperIndex * 3 + 2] = color.b;
      paperSizes[paperIndex] = THREE.MathUtils.clamp(paper.size || 2.2, 2.2, 3.6);
      paperBreathPhases[paperIndex] = hotspot.breathPhase;
      paperBreathSpeeds[paperIndex] = Math.PI * 2 / Math.max(1, hotspot.breathingPeriodSeconds);
      paperIndex += 1;
    });
  });

  const paperGeometry = new THREE.BufferGeometry();
  const paperPositionAttribute = new THREE.BufferAttribute(paperPositions, 3);
  paperPositionAttribute.setUsage(THREE.DynamicDrawUsage);
  const paperRevealAttribute = new THREE.BufferAttribute(paperReveals, 1);
  paperRevealAttribute.setUsage(THREE.DynamicDrawUsage);
  paperGeometry.setAttribute("position", paperPositionAttribute);
  paperGeometry.setAttribute("color", new THREE.BufferAttribute(paperColors, 3));
  paperGeometry.setAttribute("pointSize", new THREE.BufferAttribute(paperSizes, 1));
  paperGeometry.setAttribute("reveal", paperRevealAttribute);
  paperGeometry.setAttribute("breathPhase", new THREE.BufferAttribute(paperBreathPhases, 1));
  paperGeometry.setAttribute("breathSpeed", new THREE.BufferAttribute(paperBreathSpeeds, 1));
  const paperMaterial = createTheoryFarBackgroundPaperMaterial(pixelRatio);
  const paperObject = new THREE.Points(paperGeometry, paperMaterial);
  paperObject.name = "theory-far-background-papers";
  paperObject.frustumCulled = false;
  paperObject.renderOrder = -20;
  paperObject.raycast = () => undefined;
  root.add(paperObject);

  const hotspotGeometry = new THREE.BufferGeometry();
  const hotspotPositionAttribute = new THREE.BufferAttribute(hotspotPositions, 3);
  hotspotPositionAttribute.setUsage(THREE.DynamicDrawUsage);
  const hotspotRevealAttribute = new THREE.BufferAttribute(hotspotReveals, 1);
  hotspotRevealAttribute.setUsage(THREE.DynamicDrawUsage);
  hotspotGeometry.setAttribute("position", hotspotPositionAttribute);
  hotspotGeometry.setAttribute("color", new THREE.BufferAttribute(hotspotColors, 3));
  hotspotGeometry.setAttribute("pointSize", new THREE.BufferAttribute(hotspotSizes, 1));
  hotspotGeometry.setAttribute("reveal", hotspotRevealAttribute);
  hotspotGeometry.setAttribute("breathPhase", new THREE.BufferAttribute(hotspotBreathPhases, 1));
  hotspotGeometry.setAttribute("breathSpeed", new THREE.BufferAttribute(hotspotBreathSpeeds, 1));
  const hotspotMaterial = createTheoryFarBackgroundHotspotMaterial(pixelRatio);
  const hotspotObject = new THREE.Points(hotspotGeometry, hotspotMaterial);
  hotspotObject.name = "theory-far-background-hotspots";
  hotspotObject.frustumCulled = false;
  hotspotObject.renderOrder = -19;
  hotspotObject.raycast = () => undefined;
  root.add(hotspotObject);

  const currentCenterByHotspotId = new Map<string, THREE.Vector3>();
  const scratchCenter = new THREE.Vector3();
  let progress = 0;
  let maximumReveal = 0;
  let maskInnerRadiusNdc = 0.18;
  let maskOuterRadiusNdc = 0.3;
  const maskCenterNdc = new THREE.Vector2();

  const updateGeometry = (nextProgress: number) => {
    progress = THREE.MathUtils.clamp(nextProgress, 0, 1);
    maximumReveal = 0;
    plan.hotspots.forEach((hotspot, index) => {
      const transition = resolveGalaxyFarBackgroundTransition(progress, hotspot.transitionMode);
      scratchCenter.set(
        THREE.MathUtils.lerp(hotspot.startCenter[0], hotspot.targetCenter[0], transition.centerProgress),
        THREE.MathUtils.lerp(hotspot.startCenter[1], hotspot.targetCenter[1], transition.centerProgress),
        THREE.MathUtils.lerp(hotspot.startCenter[2], hotspot.targetCenter[2], transition.centerProgress),
      );
      currentCenterByHotspotId.set(hotspot.hotspotId, scratchCenter.clone());
      hotspotPositions[index * 3] = scratchCenter.x;
      hotspotPositions[index * 3 + 1] = scratchCenter.y;
      hotspotPositions[index * 3 + 2] = scratchCenter.z;
      hotspotReveals[index] = transition.revealProgress;
      maximumReveal = Math.max(maximumReveal, transition.revealProgress);
    });
    paperRuntime.forEach((paper, index) => {
      const center = currentCenterByHotspotId.get(paper.hotspot.hotspotId);
      const transition = resolveGalaxyFarBackgroundTransition(progress, paper.hotspot.transitionMode);
      if (center) {
        paperPositions[index * 3] = center.x + paper.localOffset.x;
        paperPositions[index * 3 + 1] = center.y + paper.localOffset.y;
        paperPositions[index * 3 + 2] = center.z + paper.localOffset.z;
      }
      paperReveals[index] = transition.revealProgress;
    });
    hotspotPositionAttribute.needsUpdate = true;
    hotspotRevealAttribute.needsUpdate = true;
    paperPositionAttribute.needsUpdate = true;
    paperRevealAttribute.needsUpdate = true;
    root.visible = maximumReveal > 0.001;
  };
  updateGeometry(0);

  return {
    object: root,
    plan,
    setProgress: updateGeometry,
    hasVisibleProxy: () => maximumReveal > 0.001,
    setPixelRatio: (nextPixelRatio: number) => {
      paperMaterial.uniforms.uPixelRatio.value = nextPixelRatio;
      hotspotMaterial.uniforms.uPixelRatio.value = nextPixelRatio;
    },
    setAnimation: (timeSeconds: number, motionStrength: number) => {
      paperMaterial.uniforms.uAmbientTime.value = timeSeconds;
      paperMaterial.uniforms.uMotionStrength.value = THREE.MathUtils.clamp(motionStrength, 0, 1);
      hotspotMaterial.uniforms.uAmbientTime.value = timeSeconds;
      hotspotMaterial.uniforms.uMotionStrength.value = THREE.MathUtils.clamp(motionStrength, 0, 1);
    },
    setMask: (centerNdc: THREE.Vector2, innerRadiusNdc: number, outerRadiusNdc: number) => {
      maskCenterNdc.copy(centerNdc);
      maskInnerRadiusNdc = innerRadiusNdc;
      maskOuterRadiusNdc = outerRadiusNdc;
      paperMaterial.uniforms.uMaskCenterNdc.value.copy(centerNdc);
      paperMaterial.uniforms.uMaskInnerRadiusNdc.value = innerRadiusNdc;
      paperMaterial.uniforms.uMaskOuterRadiusNdc.value = outerRadiusNdc;
      hotspotMaterial.uniforms.uMaskCenterNdc.value.copy(centerNdc);
      hotspotMaterial.uniforms.uMaskInnerRadiusNdc.value = innerRadiusNdc;
      hotspotMaterial.uniforms.uMaskOuterRadiusNdc.value = outerRadiusNdc;
    },
    getSamplePosition: () => (
      plan.hotspots.length > 0
        ? new THREE.Vector3(
            hotspotPositions[0],
            hotspotPositions[1],
            hotspotPositions[2],
          )
        : undefined
    ),
    getDiagnostics: (camera?: THREE.Camera, worldRoot?: THREE.Object3D) => {
      let centralMaskVisibleCount = 0;
      if (camera && worldRoot && maximumReveal > 0.001) {
        worldRoot.updateMatrixWorld(true);
        const worldPosition = new THREE.Vector3();
        const projected = new THREE.Vector3();
        plan.hotspots.forEach((hotspot, index) => {
          if (hotspotReveals[index] <= 0.001) return;
          worldPosition
            .set(
              hotspotPositions[index * 3],
              hotspotPositions[index * 3 + 1],
              hotspotPositions[index * 3 + 2],
            )
            .applyMatrix4(worldRoot.matrixWorld);
          projected.copy(worldPosition).project(camera);
          const distance = Math.hypot(
            projected.x - maskCenterNdc.x,
            projected.y - maskCenterNdc.y,
          );
          const maskVisibility = smoothStepRange(maskInnerRadiusNdc, maskOuterRadiusNdc, distance);
          if (distance <= maskInnerRadiusNdc && maskVisibility > 1e-9) centralMaskVisibleCount += 1;
        });
      }
      return {
        hotspotCount: plan.hotspots.length,
        paperSampleCount: plan.paperSampleCount,
        retreatHotspotCount: plan.retreatHotspotCount,
        crossfadeHotspotCount: plan.crossfadeHotspotCount,
        nearestRadius: plan.nearestTargetRadius,
        farthestRadius: plan.farthestTargetRadius,
        localOffsetError: plan.maximumLocalOffsetError,
        centralMaskVisibleCount,
        paperBrightnessMin: GALAXY_FAR_BACKGROUND_PAPER_OPACITY
          * (1 - GALAXY_FAR_BACKGROUND_PAPER_BREATH_AMPLITUDE),
        paperBrightnessMax: GALAXY_FAR_BACKGROUND_PAPER_OPACITY
          * (1 + GALAXY_FAR_BACKGROUND_PAPER_BREATH_AMPLITUDE),
        hotspotCoreBrightnessMin: GALAXY_FAR_BACKGROUND_HOTSPOT_CORE_OPACITY
          * (1 - GALAXY_FAR_BACKGROUND_HOTSPOT_CORE_BREATH_AMPLITUDE),
        hotspotCoreBrightnessMax: GALAXY_FAR_BACKGROUND_HOTSPOT_CORE_OPACITY
          * (1 + GALAXY_FAR_BACKGROUND_HOTSPOT_CORE_BREATH_AMPLITUDE),
        hotspotHaloBrightnessMin: GALAXY_FAR_BACKGROUND_HOTSPOT_HALO_OPACITY
          * (1 - GALAXY_FAR_BACKGROUND_HOTSPOT_HALO_BREATH_AMPLITUDE),
        hotspotHaloBrightnessMax: GALAXY_FAR_BACKGROUND_HOTSPOT_HALO_OPACITY
          * (1 + GALAXY_FAR_BACKGROUND_HOTSPOT_HALO_BREATH_AMPLITUDE),
        progress,
      };
    },
    dispose: () => {
      paperGeometry.dispose();
      paperMaterial.dispose();
      hotspotGeometry.dispose();
      hotspotMaterial.dispose();
    },
  };
}

function createTheoryFarBackgroundPaperMaterial(pixelRatio: number) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uPixelRatio: { value: pixelRatio },
      uAmbientTime: { value: 0 },
      uMotionStrength: { value: 1 },
      uMaskCenterNdc: { value: new THREE.Vector2() },
      uMaskInnerRadiusNdc: { value: 0.18 },
      uMaskOuterRadiusNdc: { value: 0.3 },
    },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
    toneMapped: false,
    vertexShader: `
      attribute vec3 color;
      attribute float pointSize;
      attribute float reveal;
      attribute float breathPhase;
      attribute float breathSpeed;
      uniform float uPixelRatio;
      uniform float uAmbientTime;
      uniform float uMotionStrength;
      uniform vec2 uMaskCenterNdc;
      uniform float uMaskInnerRadiusNdc;
      uniform float uMaskOuterRadiusNdc;
      varying vec3 vColor;
      varying float vAlpha;
      varying float vMaskVisibility;
      void main() {
        vColor = color;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vec4 clipPosition = projectionMatrix * mvPosition;
        vec2 projectedNdc = clipPosition.xy / max(0.0001, clipPosition.w);
        vMaskVisibility = smoothstep(
          uMaskInnerRadiusNdc,
          uMaskOuterRadiusNdc,
          distance(projectedNdc, uMaskCenterNdc)
        );
        float breath = sin(uAmbientTime * breathSpeed + breathPhase)
          * ${GALAXY_FAR_BACKGROUND_PAPER_BREATH_AMPLITUDE.toFixed(3)}
          * uMotionStrength;
        vAlpha = ${GALAXY_FAR_BACKGROUND_PAPER_OPACITY.toFixed(3)} * reveal * (1.0 + breath);
        float perspectiveScale = clamp(12.0 / max(1.0, -mvPosition.z), 0.10, 1.0);
        gl_PointSize = max(
          0.45,
          pointSize * ${GALAXY_FAR_BACKGROUND_PAPER_SIZE_SCALE.toFixed(2)} * perspectiveScale
        ) * uPixelRatio;
        gl_Position = clipPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;
      varying float vMaskVisibility;
      void main() {
        vec2 centered = (gl_PointCoord - vec2(0.5)) * 2.0;
        float radius = length(centered);
        float antialias = max(fwidth(radius), 0.018);
        float disc = 1.0 - smoothstep(1.0 - antialias, 1.0 + antialias, radius);
        float core = exp(-radius * radius * 16.0);
        float alpha = disc * vAlpha * (0.28 + core * 0.72) * vMaskVisibility;
        if (alpha < 0.0002) discard;
        gl_FragColor = vec4(mix(vColor, vec3(1.0), core * 0.58), alpha);
      }
    `,
  });
}

function createTheoryFarBackgroundHotspotMaterial(pixelRatio: number) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uPixelRatio: { value: pixelRatio },
      uAmbientTime: { value: 0 },
      uMotionStrength: { value: 1 },
      uMaskCenterNdc: { value: new THREE.Vector2() },
      uMaskInnerRadiusNdc: { value: 0.18 },
      uMaskOuterRadiusNdc: { value: 0.3 },
    },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
    toneMapped: false,
    vertexShader: `
      attribute vec3 color;
      attribute float pointSize;
      attribute float reveal;
      attribute float breathPhase;
      attribute float breathSpeed;
      uniform float uPixelRatio;
      uniform float uAmbientTime;
      uniform float uMotionStrength;
      uniform vec2 uMaskCenterNdc;
      uniform float uMaskInnerRadiusNdc;
      uniform float uMaskOuterRadiusNdc;
      varying vec3 vColor;
      varying float vReveal;
      varying float vCoreBreath;
      varying float vHaloBreath;
      varying float vMaskVisibility;
      void main() {
        vColor = color;
        vReveal = reveal;
        float breathWave = sin(uAmbientTime * breathSpeed + breathPhase) * uMotionStrength;
        vCoreBreath = 1.0
          + breathWave * ${GALAXY_FAR_BACKGROUND_HOTSPOT_CORE_BREATH_AMPLITUDE.toFixed(3)};
        vHaloBreath = 1.0
          + breathWave * ${GALAXY_FAR_BACKGROUND_HOTSPOT_HALO_BREATH_AMPLITUDE.toFixed(3)};
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vec4 clipPosition = projectionMatrix * mvPosition;
        vec2 projectedNdc = clipPosition.xy / max(0.0001, clipPosition.w);
        vMaskVisibility = smoothstep(
          uMaskInnerRadiusNdc,
          uMaskOuterRadiusNdc,
          distance(projectedNdc, uMaskCenterNdc)
        );
        float perspectiveScale = clamp(14.0 / max(1.0, -mvPosition.z), 0.12, 1.0);
        gl_PointSize = max(
          0.85,
          pointSize * ${GALAXY_FAR_BACKGROUND_HOTSPOT_SIZE_SCALE.toFixed(2)} * perspectiveScale
        ) * uPixelRatio;
        gl_Position = clipPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vReveal;
      varying float vCoreBreath;
      varying float vHaloBreath;
      varying float vMaskVisibility;
      void main() {
        vec2 uv = (gl_PointCoord - vec2(0.5)) * 2.0;
        float radius = length(uv);
        float radiusSquared = dot(uv, uv);
        float edge = 1.0 - smoothstep(0.74, 1.0, radius);
        float halo = exp(-radiusSquared * 4.8) * edge
          * ${GALAXY_FAR_BACKGROUND_HOTSPOT_HALO_OPACITY.toFixed(3)}
          * vHaloBreath;
        float inner = exp(-radiusSquared * 20.0) * 0.42;
        float core = exp(-radiusSquared * 92.0);
        float coreEnergy = (inner + core)
          * ${GALAXY_FAR_BACKGROUND_HOTSPOT_CORE_OPACITY.toFixed(3)}
          * vCoreBreath;
        float alpha = (halo + coreEnergy) * vReveal * vMaskVisibility;
        if (radius > 1.0 || alpha < 0.00025) discard;
        vec3 warmCore = vec3(1.0, 0.975, 0.91);
        vec3 finalColor = mix(vColor, warmCore, core / max(0.001, core + halo) * 0.76);
        gl_FragColor = vec4(finalColor, min(0.82, alpha));
      }
    `,
  });
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

function createSystemPaperMaterial(
  pixelRatio: number,
  representativeEnergy = false,
  visualProfile: GalaxyVisualProfile = "analysis",
) {
  const agentTheorySystem = visualProfile === "agent-theory";
  const depthBrightnessFloor = agentTheorySystem
    ? APP17_AGENT_THEORY_SYSTEM_PAPER_DEPTH_BRIGHTNESS_FLOOR
    : APP17_SYSTEM_PAPER_DEPTH_BRIGHTNESS_FLOOR;
  const depthSizeFloor = agentTheorySystem
    ? APP17_AGENT_THEORY_SYSTEM_PAPER_DEPTH_SIZE_FLOOR
    : APP17_SYSTEM_PAPER_DEPTH_SIZE_FLOOR;
  const farMinimumPointSize = agentTheorySystem
    ? APP17_AGENT_THEORY_SYSTEM_PAPER_FAR_MINIMUM_SIZE
    : 2.5;
  const mediumMinimumPointSize = agentTheorySystem
    ? APP17_AGENT_THEORY_SYSTEM_PAPER_MEDIUM_MINIMUM_SIZE
    : 2.6;
  const nearMinimumPointSize = agentTheorySystem
    ? APP17_AGENT_THEORY_SYSTEM_PAPER_NEAR_MINIMUM_SIZE
    : 2.8;
  const maximumPointSize = agentTheorySystem
    ? APP17_AGENT_THEORY_SYSTEM_PAPER_MAXIMUM_SIZE
    : 4.6;
  const focusContextBrightness = agentTheorySystem
    ? APP17_AGENT_THEORY_SYSTEM_PAPER_FOCUS_CONTEXT_BRIGHTNESS
    : APP17_SYSTEM_PAPER_FOCUS_CONTEXT_BRIGHTNESS;
  const focusNeighborBrightness = agentTheorySystem
    ? APP17_AGENT_THEORY_SYSTEM_PAPER_FOCUS_NEIGHBOR_BRIGHTNESS
    : APP17_SYSTEM_PAPER_FOCUS_NEIGHBOR_BRIGHTNESS;
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
      uPaperFocusContextBrightness: { value: focusContextBrightness },
      uPaperFocusNeighborBrightness: { value: focusNeighborBrightness },
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
      attribute float transitionStyle;
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
      varying float vRepresentativeStyle;
      varying float vEnergyDetailBlend;
      varying float vEnergyTime;
      void main() {
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        vec4 targetViewPosition = modelViewMatrix * vec4(uPaperFocusPosition, 1.0);
        float relativeDepth = ((-viewPosition.z) - uSystemCenterViewDepth) / max(0.001, uSystemDepthRange);
        float deepPosition = clamp(max(relativeDepth, 0.0), 0.0, 1.0);
        float distanceScale = clamp(10.0 / max(1.0, -viewPosition.z), 0.78, 1.18);
        float representativeMask = step(-0.5, representativeRank) * transitionStyle;
        float ordinaryMask = 1.0 - representativeMask;
        float depthBrightnessFloor = mix(0.55, ${depthBrightnessFloor.toFixed(2)}, ordinaryMask);
        float depthSizeFloor = mix(0.78, ${depthSizeFloor.toFixed(2)}, ordinaryMask);
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
        vRepresentativeStyle = transitionStyle;
        float depthScale = mix(1.0, depthSize, uSystemDepthStrength);
        float ordinaryScale = mix(1.0, 0.88, uPaperFarBlend) * mix(1.0, 1.05, uPaperNearBlend);
        float ordinaryMinimum = mix(
          ${mediumMinimumPointSize.toFixed(2)},
          ${farMinimumPointSize.toFixed(2)},
          uPaperFarBlend
        );
        ordinaryMinimum = mix(
          ordinaryMinimum,
          ${nearMinimumPointSize.toFixed(2)},
          uPaperNearBlend
        );
        float ordinarySize = clamp(
          pointSize * sizeVariation * distanceScale * depthScale * ordinaryScale,
          ordinaryMinimum,
          ${maximumPointSize.toFixed(2)}
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
      varying float vRepresentativeStyle;
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
        // Keep a crisp, size-stable identity at system scale. The shared soft
        // energy field is tuned for close inspection and otherwise becomes
        // too diffuse to distinguish from the ordinary paper cloud.
        float opticalRadius = length(point) * uCarrierScale;
        float readableCore = exp(-opticalRadius * opticalRadius * 54.0);
        float readableInnerGlow = exp(-opticalRadius * opticalRadius * 12.0)
          * (1.0 - smoothstep(0.58, 0.96, opticalRadius));
        float readableEnergy = readableCore * 0.92 + readableInnerGlow * 0.13;
        float ordinaryRadius = length(point);
        float ordinaryEdge = 1.0 - smoothstep(0.72, 1.0, ordinaryRadius);
        float ordinaryCore = exp(-ordinaryRadius * ordinaryRadius * 34.0);
        float ordinaryHalo = exp(-ordinaryRadius * ordinaryRadius * 2.6) * ordinaryEdge;
        float ordinaryEnergy = max(
          ordinaryCore * 1.05,
          (1.0 - smoothstep(0.12, 0.28, ordinaryRadius)) * 0.58
        ) + ordinaryHalo * 0.085;
        float representativeAlpha = max(energy, readableEnergy) * rankStrength
          * representativeCarrierEnvelope(opticalRadius);
        float alpha = mix(ordinaryEnergy, representativeAlpha, vRepresentativeStyle) * vAlpha;
        if (opticalRadius > 1.32 || alpha < 0.00025) discard;
        vec3 warmWhite = vec3(1.0, 0.985, 0.95);
        vec3 color = mix(vHaloColor, vCoreColor, clamp(thermal * 0.78 + innerGlow * 0.1, 0.0, 1.0));
        color = mix(
          color,
          warmWhite,
          clamp(max(core * 0.72 + thermal * 0.16, readableCore * 0.88), 0.0, 0.88)
        );
        color = min(vec3(1.0), color + vHaloColor * wisps * 0.12);
        vec3 ordinaryColor = mix(vHaloColor, vCoreColor, clamp(ordinaryCore * 0.72, 0.0, 1.0));
        ordinaryColor = mix(ordinaryColor, warmWhite, ordinaryCore * 0.67);
        color = mix(ordinaryColor, color, vRepresentativeStyle);
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
        float stableCore = (
          1.0 - smoothstep(
            ${agentTheorySystem ? "0.12" : "0.12"},
            ${agentTheorySystem ? "0.34" : "0.28"},
            radius
          )
        ) * vOrdinaryMask;
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
        float alpha = (
          max(
            core * coreWeight,
            stableCore * ${agentTheorySystem ? "0.74" : "0.58"}
          )
          + innerGlow * innerGlowWeight
          + halo * haloWeight
          + rays
          + flightStreak
        ) * vAlpha;
        vec3 color = mix(vHaloColor, vCoreColor, clamp(core + innerGlow * 0.72, 0.0, 1.0));
        float whiteCoreMix = mix(0.55, 0.67, vOrdinaryMask);
        color = mix(color, vec3(1.0, 0.985, 0.95), max(core, stableCore) * whiteCoreMix);
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
      uniform float uPaperInspectionTargetRank;
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
      ${REPRESENTATIVE_ENERGY_FIELD_GLSL}
      void main() {
        vec2 point = (gl_PointCoord - vec2(0.5)) * 2.0;
        float opticalRadius = length(point) * uCarrierScale;
        float core = exp(-opticalRadius * opticalRadius * 88.0);
        float focusAttenuation = mix(1.0, ${APP17_SYSTEM_PAPER_FOCUS_REPRESENTATIVE_BRIGHTNESS.toFixed(2)}, uPaperFocusBlend);
        float targetMask = 1.0 - step(0.45, abs(vRepresentativeRank - uPaperInspectionTargetRank));
        float inspectionVisibility = 1.0 - targetMask * uPaperInspectionBlend;
        float alpha = core * 0.46 * uSceneOpacity * vBloomStrength * vBloomWeight
          * vFocusIntensity * focusAttenuation * inspectionVisibility
          * representativeCarrierEnvelope(opticalRadius);
        if (opticalRadius > 1.32 || alpha < 0.00025) discard;
        vec3 lightColor = mix(vColor, vec3(1.0, 0.975, 0.94), 0.88);
        gl_FragColor = vec4(lightColor, alpha);
      }
    `,
  });
}

function createPaperMaterial(
  pixelRatio: number,
  kind: App17SceneData["kind"],
  visualProfile: GalaxyVisualProfile = "analysis",
  channel: "core" | "optical" = "core",
) {
  const agentTheory = visualProfile === "agent-theory";
  const opticalPass = agentTheory && channel === "optical";
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uPixelRatio: { value: pixelRatio },
      uMinimumCssSize: { value: kind === "app14" ? 2.35 : 2.2 },
      uDistanceAttenuation: { value: kind === "app14" ? 0.55 : 0.85 },
      uSceneOpacity: { value: 1 },
      uExplorationProgress: { value: 0 },
      uSelectedTopicOpacity: { value: 1 },
      uFocusPosition: { value: new THREE.Vector3() },
      uFarRotationAngle: { value: 0 },
      uOverviewFarBlend: { value: 0 },
      uSystemCenterViewDepth: { value: 0 },
      uSystemDepthRange: { value: APP17_SYSTEM_RADIUS },
      uSystemDepthStrength: { value: 0 },
      uAgentDepthNear: { value: 0 },
      uAgentDepthFar: { value: 1 },
      uViewportHeight: { value: 900 },
      uAgentFocusBlend: { value: 0 },
      uAgentFocusBackgroundBlend: { value: 0 },
    },
    transparent: true,
    depthWrite: agentTheory && !opticalPass,
    depthTest: true,
    blending: THREE.NormalBlending,
    toneMapped: false,
    vertexShader: `
      attribute vec3 color;
      attribute vec3 semanticColor;
      attribute float pointSize;
      attribute float pointAlpha;
      attribute float selectedMask;
      attribute float crossfadeMask;
      attribute float stellarSeed;
      attribute float stellarRayAngle;
      attribute float stellarRayStrength;
      attribute float agentLodWeight;
      attribute float agentFocusRole;
      uniform float uPixelRatio;
      uniform float uMinimumCssSize;
      uniform float uDistanceAttenuation;
      uniform float uSceneOpacity;
      uniform float uExplorationProgress;
      uniform float uSelectedTopicOpacity;
      uniform vec3 uFocusPosition;
      uniform float uFarRotationAngle;
      uniform float uOverviewFarBlend;
      uniform float uSystemCenterViewDepth;
      uniform float uSystemDepthRange;
      uniform float uSystemDepthStrength;
      uniform float uAgentDepthNear;
      uniform float uAgentDepthFar;
      uniform float uViewportHeight;
      uniform float uAgentFocusBlend;
      uniform float uAgentFocusBackgroundBlend;
      varying vec3 vColor;
      varying vec3 vSemanticColor;
      varying float vAlpha;
      varying float vCssSize;
      varying float vAgentNearness;
      varying float vStellarSeed;
      varying float vStellarRayAngle;
      varying float vStellarRayStrength;
      varying float vAgentLodWeight;
      varying float vAgentFocusRole;
      varying float vAgentFocusBlend;
      void main() {
        vColor = color;
        vSemanticColor = semanticColor;
        vStellarSeed = stellarSeed;
        vStellarRayAngle = stellarRayAngle;
        vStellarRayStrength = stellarRayStrength;
        float focusSelected = step(0.5, agentFocusRole);
        float effectiveFocus = focusSelected * uAgentFocusBlend;
        vAgentFocusRole = agentFocusRole;
        vAgentFocusBlend = effectiveFocus;
        vAgentLodWeight = max(agentLodWeight, effectiveFocus);
        float isolationProgress = ${kind === "app15"
          ? "smoothstep(0.70, 1.0, uExplorationProgress)"
          : "uExplorationProgress"};
        float retreatScale = ${kind === "app15"
          ? "1.0"
          : `mix(1.0, ${APP17_FAR_SCENE_SCALE.toFixed(1)}, uExplorationProgress)`};
        float effectiveRotation = uFarRotationAngle * smoothstep(0.7, 1.0, uExplorationProgress);
        float rotationCosine = cos(effectiveRotation);
        float rotationSine = sin(effectiveRotation);
        mat2 farRotation = mat2(rotationCosine, rotationSine, -rotationSine, rotationCosine);
        vec3 farOffset = position - uFocusPosition;
        farOffset.xy = farRotation * farOffset.xy;
        vec3 distantPosition = uFocusPosition + farOffset * retreatScale;
        vec3 transformedPosition = mix(distantPosition, position, selectedMask);
        float distantVisibility = ${kind === "app15"
          ? "mix(1.0 - smoothstep(0.70, 0.76, uExplorationProgress), 1.0 - smoothstep(0.76, 1.0, uExplorationProgress), crossfadeMask)"
          : `mix(1.0, ${APP17_FAR_PAPER_OPACITY.toFixed(2)}, isolationProgress)`};
        float selectedVisibility = uSelectedTopicOpacity;
        float visibility = mix(distantVisibility, selectedVisibility, selectedMask);
        float distantPointScale = ${kind === "app15"
          ? "1.0"
          : `mix(1.0, ${APP17_FAR_PAPER_SIZE.toFixed(2)}, isolationProgress)`};
        float pointScale = mix(distantPointScale, 1.0, selectedMask);
        vec4 mvPosition = modelViewMatrix * vec4(transformedPosition, 1.0);
        float relativeDepth = ((-mvPosition.z) - uSystemCenterViewDepth) / max(0.001, uSystemDepthRange);
        float deepPosition = clamp(max(relativeDepth, 0.0), 0.0, 1.0);
        float depthVisibility = mix(1.0, mix(1.0, 0.72, deepPosition), uSystemDepthStrength);
        float overviewOpacity = mix(1.0, 0.78, uOverviewFarBlend);
        float agentDepth = clamp(
          ((-mvPosition.z) - uAgentDepthNear)
            / max(0.001, uAgentDepthFar - uAgentDepthNear),
          0.0,
          1.0
        );
        vAgentNearness = 1.0 - agentDepth;
        float agentDepthBlend = smoothstep(0.0, 1.0, agentDepth);
        float agentAlphaScale = ${agentTheory
          ? "mix(1.29, 0.88, agentDepthBlend)"
          : "1.0"};
        float minimumAgentAlpha = ${agentTheory
          ? "mix(0.86, 0.55, agentDepthBlend)"
          : "0.0"};
        float focusEnergy = agentFocusRole > 2.5
          ? 1.72
          : agentFocusRole > 1.5
            ? 1.36
            : agentFocusRole > 0.5
              ? 1.22
              : 1.0;
        float focusBackgroundScale = mix(
          1.0,
          0.43,
          uAgentFocusBackgroundBlend * (1.0 - focusSelected)
        );
        vAlpha = max(pointAlpha * agentAlphaScale, minimumAgentAlpha)
          * uSceneOpacity
          * visibility
          * depthVisibility
          * overviewOpacity
          * ${agentTheory ? "max(agentLodWeight, effectiveFocus)" : "1.0"}
          * mix(1.0, focusEnergy, effectiveFocus)
          * focusBackgroundScale;
        float distanceScale = clamp(10.0 / max(1.0, -mvPosition.z), 0.78, 1.2);
        float displayScale = mix(1.0, distanceScale, uDistanceAttenuation);
        float overviewPointScale = mix(1.0, 0.62, uOverviewFarBlend);
        float overviewMinimumCssSize = mix(uMinimumCssSize, 1.15, uOverviewFarBlend);
        float baseCssSize = max(
          pointSize * pointScale * overviewPointScale,
          overviewMinimumCssSize * pointScale
        ) * displayScale;
        float agentSizeScale = mix(1.06, 0.72, agentDepthBlend);
        float minimumAgentCssSize = mix(2.06, 1.35, agentDepthBlend);
        float angularCssSize = pointSize
          * pointScale
          * agentSizeScale
          * clamp(0.42 / max(0.08, -mvPosition.z), 0.78, 1.8);
        float focusSize = agentFocusRole > 2.5
          ? 1.62
          : agentFocusRole > 1.5
            ? 1.30
            : agentFocusRole > 0.5
              ? 1.16
              : 1.0;
        vCssSize = (${agentTheory
          ? opticalPass
            ? "clamp(max(angularCssSize, minimumAgentCssSize) * 1.65, 2.2, 7.9)"
            : "clamp(max(angularCssSize, minimumAgentCssSize), minimumAgentCssSize, 4.8)"
          : "baseCssSize"}) * mix(1.0, focusSize, effectiveFocus);
        vCssSize = ${agentTheory
          ? opticalPass
            ? "min(vCssSize, 8.4)"
            : "min(vCssSize, 4.8)"
          : "vCssSize"};
        gl_PointSize = max(1.0, vCssSize) * uPixelRatio;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: agentTheory ? (opticalPass ? `
      varying vec3 vColor;
      varying vec3 vSemanticColor;
      varying float vAlpha;
      varying float vCssSize;
      varying float vAgentNearness;
      varying float vStellarSeed;
      varying float vStellarRayAngle;
      varying float vStellarRayStrength;
      varying float vAgentFocusRole;
      varying float vAgentFocusBlend;
      void main() {
        if (vAlpha <= 0.001) discard;
        vec2 point = (gl_PointCoord - vec2(0.5)) * 2.0;
        float radius = length(point);
        if (radius >= 1.0) discard;
        float antialias = max(fwidth(radius), 0.008);
        float angle = atan(point.y, point.x);
        float irregular = 0.88 + 0.12 * sin(
          angle * 5.0 + vStellarSeed * 19.0
        );
        float shoulder = exp(-radius * radius * 6.8) * irregular;
        float rayCos = cos(vStellarRayAngle);
        float raySin = sin(vStellarRayAngle);
        vec2 rayPoint = mat2(
          rayCos, -raySin,
          raySin, rayCos
        ) * point;
        float rayWidth = max(antialias, 0.010);
        float horizontalRay = (
          1.0 - smoothstep(rayWidth, rayWidth * 2.1, abs(rayPoint.y))
        ) * exp(-abs(rayPoint.x) * mix(9.5, 6.2, vStellarSeed));
        float verticalRay = (
          1.0 - smoothstep(rayWidth, rayWidth * 2.1, abs(rayPoint.x))
        ) * exp(-abs(rayPoint.y) * mix(6.8, 9.2, vStellarSeed));
        float rayEnvelope = 1.0 - smoothstep(0.22, 0.84, radius);
        float rays = (horizontalRay + verticalRay)
          * rayEnvelope
          * vStellarRayStrength
          * smoothstep(2.0, 3.8, vCssSize);
        float arcRadius = abs(radius - 0.58);
        float arcBand = 1.0 - smoothstep(0.035, 0.085, arcRadius);
        float arcGapA = smoothstep(
          -0.22,
          0.20,
          sin(angle * 1.35 + vStellarSeed * 13.0)
        );
        float arcGapB = smoothstep(
          -0.30,
          0.18,
          cos(angle * 1.12 - vStellarSeed * 17.0)
        );
        float focusArc = arcBand
          * max(arcGapA * (1.0 - arcGapB), arcGapB * (1.0 - arcGapA))
          * step(2.5, vAgentFocusRole)
          * vAgentFocusBlend;
        float luminance = dot(vSemanticColor, vec3(0.2126, 0.7152, 0.0722));
        float semanticChroma = mix(0.52, 0.78, vAgentNearness);
        vec3 semanticShell = mix(vec3(luminance), vSemanticColor, semanticChroma);
        float opticalEnergy = shoulder * 0.13 + rays * 0.075;
        float alpha = min(0.15, vAlpha * opticalEnergy + focusArc * 0.12);
        if (alpha < 0.0025) discard;
        gl_FragColor = vec4(semanticShell, alpha);
      }
    ` : `
      varying vec3 vColor;
      varying vec3 vSemanticColor;
      varying float vAlpha;
      varying float vCssSize;
      varying float vAgentNearness;
      varying float vStellarSeed;
      varying float vStellarRayAngle;
      varying float vStellarRayStrength;
      varying float vAgentFocusRole;
      varying float vAgentFocusBlend;
      void main() {
        if (vAlpha <= 0.001) discard;
        vec2 point = (gl_PointCoord - vec2(0.5)) * 2.0;
        float radius = length(point);
        if (radius >= 1.0) discard;
        float antialias = max(fwidth(radius), 0.008);
        float pointLod = 1.0 - smoothstep(1.55, 2.15, vCssSize);
        float coreTightness = max(12.0, vCssSize * vCssSize * 1.85);
        float hotCore = exp(-radius * radius * coreTightness);
        float pin = 1.0 - smoothstep(
          0.22,
          0.22 + antialias,
          max(abs(point.x), abs(point.y))
        );
        float luminance = dot(vSemanticColor, vec3(0.2126, 0.7152, 0.0722));
        float semanticChroma = mix(0.54, 0.78, vAgentNearness);
        vec3 semanticShell = mix(vec3(luminance), vSemanticColor, semanticChroma);
        float coreEnergy = max(hotCore, pin * mix(0.78, 0.48, pointLod));
        vec3 color = mix(
          semanticShell,
          vec3(0.995, 0.997, 1.0),
          clamp(coreEnergy * 0.90, 0.0, 0.94)
        );
        float alpha = vAlpha * min(1.0, coreEnergy * 1.14);
        if (alpha < 0.008) discard;
        float radianceCeiling = mix(1.0, 1.12, vAgentNearness);
        float coreRadiance = 0.90
          + coreEnergy * mix(0.10, 0.24, vAgentNearness);
        gl_FragColor = vec4(color * min(radianceCeiling, coreRadiance), alpha);
      }
    `) : `
      varying vec3 vColor;
      varying float vAlpha;
      varying float vCssSize;
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
  material.name = agentTheory
    ? opticalPass
      ? "AgentTheoryPaperOptical"
      : "AgentTheoryPaperCore"
    : `AnalysisPaperPSF:${kind}`;
  return material;
}

function resolveAgentTheoryHotspotCoreCssSize(importance: number) {
  return THREE.MathUtils.lerp(
    APP17_AGENT_THEORY_HOTSPOT_CORE_MIN_CSS_PX,
    APP17_AGENT_THEORY_HOTSPOT_CORE_MAX_CSS_PX,
    Math.pow(THREE.MathUtils.clamp(importance, 0, 1), 0.72),
  );
}

function resolveAgentTheoryHotspotOpticalCssSize(importance: number) {
  return THREE.MathUtils.lerp(
    APP17_AGENT_THEORY_HOTSPOT_OPTICAL_MIN_CSS_PX,
    APP17_AGENT_THEORY_HOTSPOT_OPTICAL_MAX_CSS_PX,
    Math.pow(THREE.MathUtils.clamp(importance, 0, 1), 0.72),
  );
}

function createHotspotPointSourceMaterial(
  pixelRatio: number,
  kind: App17SceneData["kind"],
  visualProfile: GalaxyVisualProfile = "analysis",
  channel: "core" | "optical" = "core",
) {
  const agentTheory = visualProfile === "agent-theory";
  const opticalPass = agentTheory && channel === "optical";
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uPixelRatio: { value: pixelRatio },
      uDepthAttenuation: { value: kind === "app14" ? 0.35 : 0.82 },
      uSceneOpacity: { value: 1 },
      uExplorationProgress: { value: 0 },
      uFocusPosition: { value: new THREE.Vector3() },
      uFarRotationAngle: { value: 0 },
      uAmbientTime: { value: 0 },
      uAmbientStrength: { value: 1 },
      uOverviewAmbient: { value: 0 },
      uOverviewFarBlend: { value: 0 },
      uAgentDepthNear: { value: 0 },
      uAgentDepthFar: { value: 1 },
      uViewportHeight: { value: 900 },
      uAgentFocusBlend: { value: 0 },
      uAgentFocusBackgroundBlend: { value: 0 },
    },
    transparent: true,
    depthWrite: agentTheory && !opticalPass,
    depthTest: true,
    blending: opticalPass
      ? THREE.AdditiveBlending
      : agentTheory
        ? THREE.NormalBlending
        : THREE.AdditiveBlending,
    toneMapped: false,
    vertexShader: `
      attribute vec3 color;
      attribute float pointSize;
      attribute float pointIntensity;
      attribute float haloStrength;
      attribute float rayStrength;
      attribute float breathPhase;
      attribute float breathSpeed;
      attribute float breathAmplitude;
      attribute float selectedMask;
      attribute float crossfadeMask;
      attribute float sphereBlend;
      attribute float agentFocusRole;
      uniform float uPixelRatio;
      uniform float uDepthAttenuation;
      uniform float uSceneOpacity;
      uniform float uExplorationProgress;
      uniform vec3 uFocusPosition;
      uniform float uFarRotationAngle;
      uniform float uAmbientTime;
      uniform float uAmbientStrength;
      uniform float uOverviewAmbient;
      uniform float uOverviewFarBlend;
      uniform float uAgentDepthNear;
      uniform float uAgentDepthFar;
      uniform float uViewportHeight;
      uniform float uAgentFocusBlend;
      uniform float uAgentFocusBackgroundBlend;
      varying vec3 vColor;
      varying float vPointIntensity;
      varying float vHaloStrength;
      varying float vRayStrength;
      varying float vCoreVisibility;
      varying float vHaloVisibility;
      varying float vRayVisibility;
      varying float vCssSize;
      varying float vAgentNearness;
      varying float vStellarSeed;
      varying float vImportance;
      varying float vAgentFocusRole;
      varying float vAgentFocusBlend;
      void main() {
        vColor = color;
        vPointIntensity = pointIntensity;
        vHaloStrength = haloStrength;
        vRayStrength = rayStrength;
        vStellarSeed = fract(breathPhase / 6.28318530718);
        float focusSelected = step(0.5, agentFocusRole);
        float effectiveFocus = focusSelected * uAgentFocusBlend;
        vAgentFocusRole = agentFocusRole;
        vAgentFocusBlend = effectiveFocus;
        float focusEnergy = agentFocusRole > 2.5
          ? 1.68
          : agentFocusRole > 1.5
            ? 1.22
            : agentFocusRole > 0.5
              ? 1.12
              : 1.0;
        float isolationProgress = ${kind === "app15"
          ? "smoothstep(0.70, 1.0, uExplorationProgress)"
          : "uExplorationProgress"};
        float retreatScale = ${kind === "app15"
          ? "1.0"
          : `mix(1.0, ${APP17_FAR_SCENE_SCALE.toFixed(1)}, uExplorationProgress)`};
        float effectiveRotation = uFarRotationAngle * smoothstep(0.7, 1.0, uExplorationProgress);
        float rotationCosine = cos(effectiveRotation);
        float rotationSine = sin(effectiveRotation);
        mat2 farRotation = mat2(rotationCosine, rotationSine, -rotationSine, rotationCosine);
        vec3 farOffset = position - uFocusPosition;
        farOffset.xy = farRotation * farOffset.xy;
        vec3 distantPosition = uFocusPosition + farOffset * retreatScale;
        vec3 transformedPosition = mix(distantPosition, position, selectedMask);
        float selectedVisibility = 1.0 - smoothstep(${kind === "app15"
          ? agentTheory
            ? "0.80, 1.0"
            : "0.76, 1.0"
          : "0.32, 0.76"}, uExplorationProgress);
        float theorySourceVisibility = mix(
          1.0 - smoothstep(0.70, 0.76, uExplorationProgress),
          1.0 - smoothstep(0.76, 1.0, uExplorationProgress),
          crossfadeMask
        );
        float distantCoreVisibility = ${kind === "app15"
          ? "theorySourceVisibility"
          : `mix(1.0, ${APP17_FAR_HOTSPOT_CORE_OPACITY.toFixed(2)}, isolationProgress)`};
        float distantHaloVisibility = ${kind === "app15"
          ? "theorySourceVisibility"
          : `mix(1.0, ${APP17_FAR_HOTSPOT_HALO_OPACITY.toFixed(2)}, isolationProgress)`};
        float distantRayVisibility = ${kind === "app15"
          ? "theorySourceVisibility"
          : `mix(1.0, ${APP17_FAR_HOTSPOT_RAY_OPACITY.toFixed(2)}, isolationProgress)`};
        float ambientMask = (1.0 - selectedMask)
          * max(smoothstep(0.7, 1.0, uExplorationProgress), uOverviewAmbient)
          * uAmbientStrength;
        float breath = sin(uAmbientTime * breathSpeed + breathPhase) * ambientMask * breathAmplitude;
        float baseCoreVisibility = mix(distantCoreVisibility, selectedVisibility, selectedMask);
        float baseHaloVisibility = mix(distantHaloVisibility, selectedVisibility, selectedMask);
        float spriteVisibility = 1.0 - smoothstep(0.02, 0.98, sphereBlend);
        float focusBackgroundScale = mix(
          1.0,
          0.43,
          uAgentFocusBackgroundBlend * (1.0 - focusSelected)
        );
        vCoreVisibility = spriteVisibility * uSceneOpacity * focusBackgroundScale * mix(1.0, 0.82, uOverviewFarBlend) * mix(1.0, focusEnergy, effectiveFocus) * ${kind === "app14"
          ? "baseCoreVisibility * (1.0 + breath * 0.04)"
          : "baseCoreVisibility * (1.0 + breath * 0.06)"};
        vHaloVisibility = spriteVisibility * uSceneOpacity * focusBackgroundScale * mix(1.0, 0.45, uOverviewFarBlend) * mix(1.0, focusEnergy, effectiveFocus) * ${kind === "app14"
          ? "baseHaloVisibility * (1.0 + breath * 0.08)"
          : "baseHaloVisibility * (1.0 + breath * 0.12)"};
        vRayVisibility = spriteVisibility * uSceneOpacity * focusBackgroundScale
          * mix(1.0, 0.45, uOverviewFarBlend)
          * mix(distantRayVisibility, selectedVisibility, selectedMask);
        float distantPointScale = ${kind === "app15"
          ? "1.0"
          : `mix(1.0, ${APP17_FAR_HOTSPOT_SIZE.toFixed(2)}, isolationProgress)`};
        float pointScale = mix(distantPointScale, 1.0, selectedMask);
        vec4 mvPosition = modelViewMatrix * vec4(transformedPosition, 1.0);
        float agentDepth = clamp(
          ((-mvPosition.z) - uAgentDepthNear)
            / max(0.001, uAgentDepthFar - uAgentDepthNear),
          0.0,
          1.0
        );
        vAgentNearness = 1.0 - agentDepth;
        float distanceScale = clamp(10.0 / max(1.0, -mvPosition.z), 0.74, 1.22);
        float displayScale = mix(1.0, distanceScale, uDepthAttenuation);
        float importance = clamp((pointIntensity - 0.68) / 0.32, 0.0, 1.0);
        vImportance = importance;
        float worldDiameter = mix(0.32, 0.68, importance)
          * ${APP15_COORD_SCALE.toFixed(4)};
        float angularCssDiameter = worldDiameter
          * (uViewportHeight * 0.5 * projectionMatrix[1][1])
          / max(0.1, -mvPosition.z);
        float sourceCssSize = ${agentTheory
          ? opticalPass
            ? `mix(${APP17_AGENT_THEORY_HOTSPOT_OPTICAL_MIN_CSS_PX.toFixed(1)}, ${APP17_AGENT_THEORY_HOTSPOT_OPTICAL_MAX_CSS_PX.toFixed(1)}, pow(importance, 0.72))`
            : `mix(${APP17_AGENT_THEORY_HOTSPOT_CORE_MIN_CSS_PX.toFixed(1)}, ${APP17_AGENT_THEORY_HOTSPOT_CORE_MAX_CSS_PX.toFixed(1)}, pow(importance, 0.72))`
          : "pointSize"};
        float depthSizeScale = ${agentTheory
          ? "mix(0.96, 1.05, vAgentNearness)"
          : "1.0"};
        float stagedCssSize = sourceCssSize
          * pointScale
          * mix(1.0, 0.68, uOverviewFarBlend)
          * displayScale
          * depthSizeScale;
        stagedCssSize *= mix(
          1.0,
          agentFocusRole > 2.5 ? 1.32 : agentFocusRole > 1.5 ? 1.16 : 1.08,
          effectiveFocus
        );
        vCssSize = ${agentTheory
          ? opticalPass
            ? `clamp(stagedCssSize, ${APP17_AGENT_THEORY_HOTSPOT_OPTICAL_MIN_CSS_PX.toFixed(1)}, ${APP17_AGENT_THEORY_HOTSPOT_OPTICAL_MAX_CSS_PX.toFixed(1)})`
            : `clamp(stagedCssSize, ${APP17_AGENT_THEORY_HOTSPOT_CORE_MIN_CSS_PX.toFixed(1)}, ${APP17_AGENT_THEORY_HOTSPOT_CORE_MAX_CSS_PX.toFixed(1)})`
          : "stagedCssSize"};
        gl_PointSize = vCssSize * uPixelRatio;
        gl_Position = projectionMatrix * mvPosition;
        ${agentTheory && !opticalPass
          ? "gl_Position.z -= 0.00002 * gl_Position.w;"
          : ""}
      }
    `,
    fragmentShader: agentTheory ? (opticalPass ? `
      varying vec3 vColor;
      varying float vPointIntensity;
      varying float vHaloStrength;
      varying float vRayStrength;
      varying float vCoreVisibility;
      varying float vHaloVisibility;
      varying float vRayVisibility;
      varying float vCssSize;
      varying float vAgentNearness;
      varying float vStellarSeed;
      varying float vImportance;
      varying float vAgentFocusRole;
      varying float vAgentFocusBlend;
      void main() {
        vec2 point = (gl_PointCoord - vec2(0.5)) * 2.0;
        float radius = length(point);
        float antialias = max(fwidth(radius), 0.008);
        if (radius >= 1.0) discard;
        float rayAngle = (vStellarSeed - 0.5) * 0.34;
        float rayCos = cos(rayAngle);
        float raySin = sin(rayAngle);
        vec2 rayPoint = mat2(
          rayCos, -raySin,
          raySin, rayCos
        ) * point;
        float asymmetry = mix(-0.13, 0.13, vStellarSeed);
        vec2 shoulderPoint = vec2(
          rayPoint.x * (0.91 + asymmetry),
          rayPoint.y * (1.09 - asymmetry)
        );
        float shoulderRadius = length(shoulderPoint);
        float shoulderAngle = atan(shoulderPoint.y, shoulderPoint.x);
        float contour = 0.88
          + sin(shoulderAngle * 3.0 + vStellarSeed * 17.0) * 0.075
          + sin(shoulderAngle * 5.0 - vStellarSeed * 11.0) * 0.045;
        float shoulder = exp(-shoulderRadius * shoulderRadius * 6.8)
          * (1.0 - smoothstep(0.58 * contour, 0.96 * contour, shoulderRadius));
        float horizontalAxis = abs(rayPoint.y)
          * mix(0.88, 1.12, vStellarSeed);
        float verticalAxis = abs(rayPoint.x)
          * mix(1.12, 0.88, vStellarSeed);
        float horizontalSpike = (
          1.0 - smoothstep(0.010, 0.010 + antialias, horizontalAxis)
        ) * pow(max(0.0, 1.0 - abs(rayPoint.x)), 4.8);
        float verticalSpike = (
          1.0 - smoothstep(0.010, 0.010 + antialias, verticalAxis)
        ) * pow(max(0.0, 1.0 - abs(rayPoint.y)), 5.6);
        float rayEnergy = (
          horizontalSpike * mix(1.08, 0.86, vStellarSeed)
          + verticalSpike * mix(0.82, 1.05, vStellarSeed)
        ) * vRayStrength * 0.12 * vRayVisibility;
        float shoulderEnergy = shoulder
          * (0.052 + vImportance * 0.018)
          * vHaloStrength
          * vHaloVisibility;
        float arcRadius = abs(radius - 0.59);
        float arcBand = 1.0 - smoothstep(0.035, 0.09, arcRadius);
        float arcA = smoothstep(
          -0.18,
          0.22,
          sin(shoulderAngle * 1.31 + vStellarSeed * 15.0)
        );
        float arcB = smoothstep(
          -0.28,
          0.16,
          cos(shoulderAngle * 1.08 - vStellarSeed * 12.0)
        );
        float focusArc = arcBand
          * max(arcA * (1.0 - arcB), arcB * (1.0 - arcA))
          * step(2.5, vAgentFocusRole)
          * vAgentFocusBlend;
        float alpha = min(
          0.12,
          min(0.10, shoulderEnergy + rayEnergy) + focusArc * 0.12
        );
        if (alpha < 0.003) discard;
        float luminance = dot(vColor, vec3(0.2126, 0.7152, 0.0722));
        vec3 stellarColor = mix(
          vec3(luminance),
          vColor,
          mix(0.48, 0.66, vAgentNearness)
        );
        vec3 color = mix(
          stellarColor,
          vec3(0.995, 0.997, 1.0),
          clamp(rayEnergy * 4.5, 0.0, 0.78)
        );
        gl_FragColor = vec4(color, alpha);
      }
    ` : `
      varying vec3 vColor;
      varying float vPointIntensity;
      varying float vHaloStrength;
      varying float vRayStrength;
      varying float vCoreVisibility;
      varying float vHaloVisibility;
      varying float vRayVisibility;
      varying float vCssSize;
      varying float vAgentNearness;
      varying float vStellarSeed;
      varying float vImportance;
      varying float vAgentFocusRole;
      varying float vAgentFocusBlend;
      void main() {
        vec2 point = (gl_PointCoord - vec2(0.5)) * 2.0;
        float radius = length(point);
        float antialias = max(fwidth(radius), 0.010);
        if (radius >= 1.0 || vCoreVisibility <= 0.001) discard;
        float hotCore = 1.0 - smoothstep(
          0.42,
          min(0.98, 0.42 + antialias * 2.4),
          radius
        );
        float subpixelShoulder = exp(-radius * radius * 7.5)
          * (1.0 - smoothstep(0.55, 0.98, radius));
        float luminance = dot(vColor, vec3(0.2126, 0.7152, 0.0722));
        vec3 stellarShell = mix(
          vec3(luminance),
          vColor,
          mix(0.42, 0.58, vAgentNearness)
        );
        vec3 color = mix(
          stellarShell,
          vec3(0.995, 0.997, 1.0),
          clamp(0.72 + hotCore * 0.22, 0.0, 0.94)
        );
        float energy = hotCore + subpixelShoulder * (0.18 + vImportance * 0.08);
        float alpha = vCoreVisibility * min(1.0, energy);
        if (alpha < 0.008) discard;
        gl_FragColor = vec4(color * min(1.06, 0.94 + energy * 0.12), alpha);
      }
    `) : `
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
  material.name = agentTheory
    ? opticalPass
      ? "AgentTheoryHotspotOpticalPSF"
      : "AgentTheoryHotspotCorePSF"
    : `AnalysisHotspotPSF:${kind}:${channel}`;
  return material;
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

type AgentTheoryLabelRuntimeState = {
  opacity: number;
  targetOpacity: number;
  collisionFreePasses: number;
  collisionStartedAtMs: number;
  lastUpdatedAtMs: number;
};

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

function drawAgentTheoryLabels(
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
  width: number,
  height: number,
  states: Map<string, AgentTheoryLabelRuntimeState>,
  now: number,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  const pixelRatio = canvas.width / Math.max(1, width);
  const selected = hotspotById.get(selectedId);
  const hovered = hotspotById.get(hoverId);
  const labelLimit = cameraDistance <= APP17_ZOOM_LABEL_RADIUS
    ? APP17_ZOOM_LABEL_LIMIT
    : APP17_DEFAULT_LABEL_LIMIT;
  const primaryHotspots = rankedHotspots.slice(0, APP17_PRIMARY_LABEL_COUNT);
  const secondaryHotspots = cameraDistance <= APP17_ZOOM_LABEL_RADIUS
    ? rankedHotspots.slice(APP17_PRIMARY_LABEL_COUNT, labelLimit)
    : [];
  const secondaryIds = new Set(secondaryHotspots.map((hotspot) => hotspot.id));
  const candidates = uniqueHotspots([
    selected,
    hovered,
    ...primaryHotspots,
    ...secondaryHotspots,
  ]);
  const occupied: Array<{ x: number; y: number; w: number; h: number }> = [];
  const worldPosition = new THREE.Vector3();
  const screenPosition = new THREE.Vector3();
  const seenIds = new Set<string>();
  const renderEntries: Array<{
    hotspot: App17RenderPoint;
    state: AgentTheoryLabelRuntimeState;
    x: number;
    y: number;
    title: string;
    isPriority: boolean;
    isSecondary: boolean;
  }> = [];
  let transitionActive = false;

  for (const hotspot of candidates) {
    worldPosition.copy(hotspot.position).applyMatrix4(root.matrixWorld);
    screenPosition.copy(worldPosition).project(camera);
    if (screenPosition.z < -1 || screenPosition.z > 1) continue;
    const x = (screenPosition.x * 0.5 + 0.5) * width;
    const opticalDiameter =
      APP17_AGENT_THEORY_HOTSPOT_OPTICAL_MIN_CSS_PX
      + Math.pow(hotspot.importance, 0.72)
        * (
          APP17_AGENT_THEORY_HOTSPOT_OPTICAL_MAX_CSS_PX
          - APP17_AGENT_THEORY_HOTSPOT_OPTICAL_MIN_CSS_PX
        );
    const baseLabelOffset = Math.max(10, opticalDiameter * 0.5 + 5);
    const selectedLabelOffset =
      focusMarkerCssDiameter() * 0.5
      + (sceneData.kind === "app15" ? 26 : 12);
    const labelOffset = hotspot.id === selectedId
      ? Math.max(baseLabelOffset, selectedLabelOffset)
      : baseLabelOffset;
    const y = (-screenPosition.y * 0.5 + 0.5) * height - labelOffset;
    if (x < -90 || x > width + 90 || y < -40 || y > height + 40) continue;

    const isPriority = hotspot.id === selectedId || hotspot.id === hoverId;
    const title = isPriority
      ? ellipsis(hotspot.title, 38)
      : labelTextById.get(hotspot.id) ?? hotspot.title;
    const estimatedWidth = THREE.MathUtils.clamp(
      title.length * 7,
      72,
      isPriority ? 230 : 200,
    );
    const box = {
      x: x - estimatedWidth / 2,
      y: y - 15,
      w: estimatedWidth,
      h: isPriority && sceneData.kind === "app15" ? 34 : 24,
    };
    const collides = !isPriority
      && occupied.some((item) => rectsOverlap(item, box));
    let state = states.get(hotspot.id);
    if (!state) {
      state = {
        opacity: 0,
        targetOpacity: 0,
        collisionFreePasses: 0,
        collisionStartedAtMs: 0,
        lastUpdatedAtMs: now,
      };
      states.set(hotspot.id, state);
    }
    seenIds.add(hotspot.id);

    if (isPriority) {
      state.collisionFreePasses = 2;
      state.collisionStartedAtMs = 0;
      state.targetOpacity = 1;
    } else if (!collides) {
      state.collisionFreePasses = Math.min(
        2,
        state.collisionFreePasses + 1,
      );
      state.collisionStartedAtMs = 0;
      if (state.collisionFreePasses >= 2) state.targetOpacity = 1;
    } else {
      state.collisionFreePasses = 0;
      if (state.collisionStartedAtMs <= 0) {
        state.collisionStartedAtMs = now;
      }
      if (
        now - state.collisionStartedAtMs
          >= APP17_AGENT_THEORY_LABEL_COLLISION_HIDE_MS
      ) {
        state.targetOpacity = 0;
      }
    }

    const elapsedMs = Math.max(0, now - state.lastUpdatedAtMs);
    const opacityStep = elapsedMs / APP17_AGENT_THEORY_LABEL_FADE_MS;
    state.opacity = state.opacity < state.targetOpacity
      ? Math.min(state.targetOpacity, state.opacity + opacityStep)
      : Math.max(state.targetOpacity, state.opacity - opacityStep);
    state.lastUpdatedAtMs = now;
    if (
      Math.abs(state.opacity - state.targetOpacity) > 0.001
      || (!collides && !isPriority && state.collisionFreePasses < 2)
      || (
        collides
        && state.collisionStartedAtMs > 0
        && now - state.collisionStartedAtMs
          < APP17_AGENT_THEORY_LABEL_COLLISION_HIDE_MS
      )
    ) {
      transitionActive = true;
    }
    if (state.opacity > 0.001 || state.targetOpacity > 0) {
      occupied.push(box);
      renderEntries.push({
        hotspot,
        state,
        x,
        y,
        title,
        isPriority,
        isSecondary: !isPriority && secondaryIds.has(hotspot.id),
      });
    }
  }

  for (const [hotspotId, state] of states) {
    if (seenIds.has(hotspotId)) continue;
    state.targetOpacity = 0;
    const elapsedMs = Math.max(0, now - state.lastUpdatedAtMs);
    state.opacity = Math.max(
      0,
      state.opacity
        - elapsedMs / APP17_AGENT_THEORY_LABEL_FADE_MS,
    );
    state.lastUpdatedAtMs = now;
    if (state.opacity <= 0.001) states.delete(hotspotId);
    else transitionActive = true;
  }

  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const entry of renderEntries) {
    if (entry.state.opacity <= 0.001) continue;
    ctx.globalAlpha = entry.state.opacity;
    ctx.font = entry.isPriority
      ? "650 12px Inter, Microsoft YaHei, system-ui, sans-serif"
      : entry.isSecondary
        ? "600 10px Inter, system-ui, sans-serif"
        : "620 11px Inter, system-ui, sans-serif";
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = "rgba(0,0,0,0.82)";
    ctx.fillStyle = entry.isPriority
      ? "rgba(255,255,255,0.98)"
      : entry.isSecondary
        ? "rgba(235,243,255,0.58)"
        : "rgba(241,247,255,0.82)";
    ctx.strokeText(entry.title, entry.x, entry.y);
    ctx.fillText(entry.title, entry.x, entry.y);

    if (entry.isPriority && sceneData.kind === "app15") {
      const subtitle =
        `${entry.hotspot.field} | ${entry.hotspot.paperCount.toLocaleString()}`;
      ctx.font = "600 10px Inter, system-ui, sans-serif";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(0,0,0,0.88)";
      ctx.fillStyle = "rgba(218,232,255,0.78)";
      ctx.strokeText(subtitle, entry.x, entry.y + 15);
      ctx.fillText(subtitle, entry.x, entry.y + 15);
    }
  }
  ctx.globalAlpha = 1;
  return transitionActive;
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
  visualProfile: GalaxyVisualProfile,
  agentTheoryStates?: Map<string, AgentTheoryLabelRuntimeState>,
  now = performance.now(),
) {
  if (visualProfile === "agent-theory" && agentTheoryStates) {
    return drawAgentTheoryLabels(
      canvas,
      camera,
      root,
      sceneData,
      rankedHotspots,
      hotspotById,
      labelTextById,
      selectedId,
      hoverId,
      cameraDistance,
      width,
      height,
      agentTheoryStates,
      now,
    );
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
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
  const primaryHotspots = rankedHotspots.slice(0, APP17_PRIMARY_LABEL_COUNT);
  const secondaryHotspots = cameraDistance <= APP17_ZOOM_LABEL_RADIUS
    ? rankedHotspots.slice(APP17_PRIMARY_LABEL_COUNT, labelLimit)
    : [];
  const secondaryIds = new Set(secondaryHotspots.map((hotspot) => hotspot.id));
  const candidates = explorationProgress > 0.08
    ? uniqueHotspots([selected, hovered])
    : uniqueHotspots([selected, hovered, ...primaryHotspots, ...secondaryHotspots]);
  const occupied: Array<{ x: number; y: number; w: number; h: number }> = [];
  const worldPosition = new THREE.Vector3();
  const screenPosition = new THREE.Vector3();

  for (const hotspot of candidates) {
    worldPosition.copy(hotspot.position).applyMatrix4(root.matrixWorld);
    screenPosition.copy(worldPosition).project(camera);
    if (screenPosition.z < -1 || screenPosition.z > 1) continue;
    const x = (screenPosition.x * 0.5 + 0.5) * width;
    const agentOpticalDiameter =
      APP17_AGENT_THEORY_HOTSPOT_OPTICAL_MIN_CSS_PX
      + Math.pow(hotspot.importance, 0.72)
        * (
          APP17_AGENT_THEORY_HOTSPOT_OPTICAL_MAX_CSS_PX
          - APP17_AGENT_THEORY_HOTSPOT_OPTICAL_MIN_CSS_PX
        );
    const baseLabelOffset = visualProfile === "agent-theory"
      ? Math.max(10, agentOpticalDiameter * 0.5 + 5)
      : Math.max(15, hotspot.size * 0.5 + hotspot.displaySize * 0.08);
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

    const isSecondary = !isPriority && secondaryIds.has(hotspot.id);
    ctx.font = isPriority
      ? visualProfile === "agent-theory"
        ? "650 12px Inter, Microsoft YaHei, system-ui, sans-serif"
        : "700 13px Inter, Microsoft YaHei, system-ui, sans-serif"
      : sceneData.kind === "app14"
        ? "700 10px Inter, Microsoft YaHei, system-ui, sans-serif"
        : isSecondary
          ? visualProfile === "agent-theory"
            ? "600 10px Inter, system-ui, sans-serif"
            : "700 11px Inter, system-ui, sans-serif"
          : visualProfile === "agent-theory"
            ? "620 11px Inter, system-ui, sans-serif"
            : "700 12px Inter, system-ui, sans-serif";
    ctx.lineWidth = sceneData.kind === "app14"
      ? 3.2
      : visualProfile === "agent-theory"
        ? 2.6
        : 4;
    ctx.strokeStyle = visualProfile === "agent-theory"
      ? "rgba(0,0,0,0.82)"
      : "rgba(0,0,0,0.94)";
    ctx.fillStyle = isPriority
      ? "rgba(255,255,255,0.98)"
      : isSecondary
        ? visualProfile === "agent-theory"
          ? "rgba(235,243,255,0.58)"
          : "rgba(246,250,255,0.72)"
        : visualProfile === "agent-theory"
          ? "rgba(241,247,255,0.82)"
          : "rgba(246,250,255,0.95)";
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
  return false;
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

function app17FamilyColor(field: string, topicId: number) {
  const family = APP17_COLOR_FAMILIES[stableHash(field) % APP17_COLOR_FAMILIES.length];
  return family[stableHash(`${field}_${topicId}`) % family.length];
}

function app17HotspotFamilyColor(hotspot: Pick<App17GalaxyHotspotPoint, "field" | "topicId">) {
  return app17FamilyColor(hotspot.field, hotspot.topicId);
}

const app17PaperColorCache = new Map<string, string>();

function app17PaperColor(hex: string) {
  const cached = app17PaperColorCache.get(hex);
  if (cached !== undefined) return cached;
  const blended = new THREE.Color(hex)
    .lerp(new THREE.Color(APP17_STAR_WHITE), APP17_PAPER_STAR_WHITENESS);
  const result = `#${blended.getHexString()}`;
  app17PaperColorCache.set(hex, result);
  return result;
}

function app17BreathProfile(trend: string, id: string) {
  const normalized = trend.toLowerCase();
  const seed = stableHash(`${id}:breath`) / 4294967295;
  const [shortestPeriod, longestPeriod, amplitudeScale] =
    normalized.includes("surg") || normalized.includes("hot") || normalized.includes("爆")
      ? [6, 8, 1.8]
      : normalized.includes("declin") || normalized.includes("下降")
        ? [16, 20, 0.45]
        : [9, 12, 1];
  return {
    breathPeriodSeconds: shortestPeriod + seed * (longestPeriod - shortestPeriod),
    breathAmplitudeScale: amplitudeScale,
  };
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
