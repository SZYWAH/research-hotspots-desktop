import type {
  AgentGalaxyFocusIntent,
  BackgroundMembership,
  ResolvedAgentGalaxyEntity,
} from "./agentGalaxyFlowContract";

export const AGENT_DUAL_FOCUS_MAX_EVIDENCE = 5;
export const AGENT_DUAL_FOCUS_MAX_CONTEXT = 24;
export const AGENT_DUAL_FOCUS_MAX_RESOLVED = 32;
export const AGENT_DUAL_FOCUS_DYNAMIC_SLOTS = 32;

export type AgentDualFocusRelation =
  | "answer-evidence"
  | "citation-neighborhood"
  | "hotspot-membership"
  | "visual-review";

export type AgentDualFocusIntent = {
  revision: number;
  primary: AgentGalaxyFocusIntent;
  evidenceEntityIds: string[];
  contextEntityIds: string[];
};

export type AgentDualFocusScene = {
  primary: ResolvedAgentGalaxyEntity;
  evidence: ResolvedAgentGalaxyEntity[];
  context: ResolvedAgentGalaxyEntity[];
  relation: AgentDualFocusRelation;
  sourceSnapshotId: string;
};

export type AgentDualFocusPhase =
  | "idle"
  | "resolving"
  | "acquiring"
  | "hold"
  | "releasing"
  | "retargeting";

export type AgentDualFocusRuntimeSnapshot = {
  phase: AgentDualFocusPhase;
  backgroundMode: "immersive" | "theory";
  primaryId?: string;
  focusMode?: AgentGalaxyFocusIntent["mode"];
  membership?: BackgroundMembership;
  progress: number;
  resolutionError?: string;
  targetVertexIndex?: number;
  dynamicSlot?: number;
  contextSide?: "left" | "right";
  cameraState?: string;
  targetBlend?: number;
  cameraBlend?: number;
  backgroundDimBlend?: number;
  infoBlend?: number;
  routePhase?: string;
};

export type AgentDualFocusPresentation = {
  intent: AgentDualFocusIntent;
  scene: AgentDualFocusScene;
  releasing: boolean;
  productMode?: "legacy-dynamic" | "sidera-explicit";
  side?: "left" | "right";
  sideraPhase?: "acquiring" | "retargeting";
};

export type AgentDualFocusTimelineSample = {
  phase: Exclude<AgentDualFocusPhase, "resolving" | "retargeting">;
  progress: number;
  acquisitionBlend: number;
  contextBlend: number;
  materialBlend: number;
  cameraBlend: number;
  complete: boolean;
};

export type AgentDualFocusResolveInput = {
  databaseDir?: string;
  projectId?: string;
  sourceSnapshotId: string;
  sampledPaperIds: string[];
  primary: Pick<AgentGalaxyFocusIntent, "kind" | "entityId">;
  evidenceEntityIds: string[];
  contextEntityIds: string[];
  relation: AgentDualFocusRelation;
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function smootherstep(value: number) {
  const t = clamp01(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function normalizeAgentDualFocusIntent(
  intent: AgentDualFocusIntent,
): AgentDualFocusIntent {
  const primaryId = intent.primary.entityId.trim();
  const seen = new Set<string>([primaryId]);
  const takeUnique = (values: readonly string[], limit: number) => {
    const resolved: string[] = [];
    for (const value of values) {
      const id = value.trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      resolved.push(id);
      if (resolved.length >= limit) break;
    }
    return resolved;
  };
  const evidenceEntityIds = takeUnique(
    intent.evidenceEntityIds,
    AGENT_DUAL_FOCUS_MAX_EVIDENCE,
  );
  const contextEntityIds = takeUnique(
    intent.contextEntityIds,
    AGENT_DUAL_FOCUS_MAX_CONTEXT,
  );
  return {
    revision: Math.max(0, Math.floor(intent.revision)),
    primary: {
      ...intent.primary,
      entityId: primaryId,
    },
    evidenceEntityIds,
    contextEntityIds,
  };
}

export function validateAgentDualFocusScene(scene: AgentDualFocusScene) {
  if (scene.primary.membership === "missing") {
    return "AGENT_DUAL_FOCUS_PRIMARY_MISSING";
  }
  if (scene.evidence.length > AGENT_DUAL_FOCUS_MAX_EVIDENCE) {
    return "AGENT_DUAL_FOCUS_EVIDENCE_LIMIT_EXCEEDED";
  }
  if (scene.context.length > AGENT_DUAL_FOCUS_MAX_CONTEXT) {
    return "AGENT_DUAL_FOCUS_CONTEXT_LIMIT_EXCEEDED";
  }
  const identities = [
    scene.primary.entityId,
    ...scene.evidence.map((entity) => entity.entityId),
    ...scene.context.map((entity) => entity.entityId),
  ];
  if (new Set(identities).size !== identities.length) {
    return "AGENT_DUAL_FOCUS_DUPLICATE_ENTITY";
  }
  return "";
}

export function sampleAgentDualFocusTimeline(
  mode: AgentGalaxyFocusIntent["mode"],
  elapsedSeconds: number,
  releasing = false,
): AgentDualFocusTimelineSample {
  const acquireDuration = mode === "signal"
    ? 0.6
    : mode === "soft-focus"
      ? 1.4
      : 2.2;
  const releaseDuration = mode === "signal" ? 0.8 : 1.4;
  if (releasing) {
    const progress = smootherstep(elapsedSeconds / releaseDuration);
    const remaining = 1 - progress;
    return {
      phase: progress >= 1 ? "idle" : "releasing",
      progress,
      acquisitionBlend: remaining,
      contextBlend: remaining,
      materialBlend: remaining,
      cameraBlend: remaining,
      complete: progress >= 1,
    };
  }
  const progress = clamp01(elapsedSeconds / acquireDuration);
  const acquisitionBlend = smootherstep(progress / 0.3);
  const contextBlend = mode === "signal"
    ? 0
    : smootherstep((progress - 0.14) / 0.56);
  const materialBlend = smootherstep((progress - 0.05) / 0.62);
  const cameraBlend = mode === "signal"
    ? 0
    : smootherstep((progress - 0.62) / 0.38);
  return {
    phase: progress >= 1 ? "hold" : "acquiring",
    progress,
    acquisitionBlend,
    contextBlend,
    materialBlend,
    cameraBlend,
    complete: progress >= 1,
  };
}

export function createIdleAgentDualFocusRuntime(
  backgroundMode: "immersive" | "theory",
): AgentDualFocusRuntimeSnapshot {
  return {
    phase: "idle",
    backgroundMode,
    progress: 0,
  };
}
