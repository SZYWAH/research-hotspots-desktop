export const AGENT_GALAXY_FLOW_CONTRACT_VERSION = "agent-galaxy-flow-contract-v1";

export const AGENT_GALAXY_TECHNICAL_FLOW_MODELS = [
  "curve-flow-tech-preview",
  "tidal-curl-tech-preview",
] as const;

export type AgentGalaxyTechnicalFlowModelId =
  (typeof AGENT_GALAXY_TECHNICAL_FLOW_MODELS)[number];

export type AgentGalaxyMotionState =
  | "idle"
  | "input"
  | "thinking"
  | "answer"
  | "reading"
  | "focus";

export type AgentGalaxyFocusIntent = {
  kind: "paper" | "hotspot";
  entityId: string;
  mode: "signal" | "soft-focus" | "full-focus";
  reason: "query" | "citation-click" | "reading";
};

export type BackgroundMembership =
  | "sampled"
  | "snapshot-unsampled"
  | "active-only"
  | "missing";

export type ResolvedAgentGalaxyEntity = {
  kind: "paper" | "hotspot";
  entityId: string;
  hotspotId?: string;
  membership: BackgroundMembership;
  semanticOffset?: [number, number, number];
  sourceSnapshotId?: string;
};

export type AgentGalaxyParticleKind =
  | "paper"
  | "hotspot"
  | "environment"
  | "dust";

export type AgentGalaxyFlowParticleIdentity = {
  kind: AgentGalaxyParticleKind;
  entityId: string;
  hotspotId?: string;
  sourceSnapshotId: string;
  semanticPosition?: [number, number, number];
  semanticOffset?: [number, number, number];
};

export type AgentGalaxyFlowAssignment = {
  laneId: number;
  phase: number;
  radialOffset: [number, number];
  seed: number;
};

export type AgentGalaxyFlowContext = {
  timeSeconds: number;
  motionState: AgentGalaxyMotionState;
  focusIntent?: AgentGalaxyFocusIntent;
};

export type AgentGalaxyFlowSample = {
  position: [number, number, number];
  velocity: [number, number, number];
};

export type AgentGalaxyFlowShaderContract = {
  vertexChunkId: string;
  uniformNames: readonly string[];
};

export interface AgentGalaxyFlowModel {
  readonly id: AgentGalaxyTechnicalFlowModelId;
  readonly assignmentVersion: string;
  readonly shader: AgentGalaxyFlowShaderContract;
  readonly supportsFocus: true;
  readonly supportsOffscreenLoop: true;
  assign(identity: AgentGalaxyFlowParticleIdentity): AgentGalaxyFlowAssignment;
  sample(
    assignment: AgentGalaxyFlowAssignment,
    context: AgentGalaxyFlowContext,
  ): AgentGalaxyFlowSample;
  sampleTangent(
    assignment: AgentGalaxyFlowAssignment,
    context: AgentGalaxyFlowContext,
  ): [number, number, number];
}

export const AGENT_GALAXY_PARTICLE_BUDGET = {
  totalHotspotIdentities: 160,
  perceptibleHotspots: [40, 80],
  residentPaperProxies: 3840,
  perceptiblePaperProxies: [1800, 2600],
  environmentStars: [800, 1500],
  perceptibleSharpStars: [2500, 4000],
  dynamicFocusCache: [16, 32],
} as const;

export const AGENT_GALAXY_VISUAL_INVARIANTS = {
  semanticCoreFullResolution: true,
  semanticCoreUsesTimeOpacity: false,
  semanticStarsUseDepthOfField: false,
  semanticStarsUseMotionBlur: false,
  semanticStarsUseLowResolutionUpscale: false,
  distantStarsMayBlur: false,
  wholeSceneRotationAsFlow: false,
  uniformDiagonalTranslationAsFlow: false,
  visibleRespawnAllowed: false,
  runtimeLaneReassignmentAllowed: false,
  palette: "silver-cool-gray-desaturated-blue",
} as const;
