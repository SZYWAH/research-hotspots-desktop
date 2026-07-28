export const AGENT_GALAXY_FLOW_CONTRACT_VERSION = "agent-galaxy-flow-contract-v2";

export const AGENT_GALAXY_TECHNICAL_FLOW_MODELS = [
  "gravitational-weave-tech-preview",
  "tidal-curl-tech-preview",
] as const;

export type AgentGalaxyTechnicalFlowModelId =
  (typeof AGENT_GALAXY_TECHNICAL_FLOW_MODELS)[number];

export const AGENT_GALAXY_ACTIVE_TECHNICAL_FLOW_MODEL =
  "gravitational-weave-tech-preview" as const satisfies AgentGalaxyTechnicalFlowModelId;

export const AGENT_GALAXY_TECHNICAL_FLOW_MODEL_STATUS = {
  "gravitational-weave-tech-preview": "active",
  "tidal-curl-tech-preview": "planned",
} as const satisfies Record<
  AgentGalaxyTechnicalFlowModelId,
  "active" | "planned"
>;

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

export type AgentGalaxyVector3 = [number, number, number];

export type AgentGalaxyFlowParticleIdentity = {
  kind: AgentGalaxyParticleKind;
  entityId: string;
  hotspotId?: string;
  sourceSnapshotId: string;
  semanticPosition?: AgentGalaxyVector3;
  semanticOffset?: AgentGalaxyVector3;
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
  position: AgentGalaxyVector3;
  velocity: AgentGalaxyVector3;
};

export type AgentGalaxyFlowShaderContract = {
  vertexChunkId: string;
  uniformNames: readonly string[];
  vertexChunk: string;
};

export type AgentGalaxyFlowCapabilities = {
  deterministicAnalyticMotion: boolean;
  dynamicFocus: boolean;
  offscreenLoopRequired: boolean;
  visibleRespawnAllowed: boolean;
  runtimeLaneReassignmentAllowed: boolean;
};

export type AgentGalaxyFlowSampleRequest<TParameters> = {
  identity: AgentGalaxyFlowParticleIdentity;
  hotspotAnchor: AgentGalaxyVector3;
  semanticOffset: AgentGalaxyVector3;
  assignment: AgentGalaxyFlowAssignment;
  context: AgentGalaxyFlowContext;
  parameters: TParameters;
};

export interface AgentGalaxyFlowModel<TParameters = unknown> {
  readonly id: AgentGalaxyTechnicalFlowModelId;
  readonly assignmentVersion: string;
  readonly shader: AgentGalaxyFlowShaderContract;
  readonly capabilities: AgentGalaxyFlowCapabilities;
  readonly defaultParameters: TParameters;
  assign(identity: AgentGalaxyFlowParticleIdentity): AgentGalaxyFlowAssignment;
  sample(request: AgentGalaxyFlowSampleRequest<TParameters>): AgentGalaxyFlowSample;
  sampleTangent(
    request: AgentGalaxyFlowSampleRequest<TParameters>,
  ): AgentGalaxyVector3;
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
