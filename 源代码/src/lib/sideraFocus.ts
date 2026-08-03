import type {
  BackgroundMembership,
  ResolvedAgentGalaxyEntity,
} from "./agentGalaxyFlowContract";

export const SIDERA_DIRECT_CAROUSEL_LIMIT = 6;
export const SIDERA_RESOLVED_ENTITY_LIMIT = 32;

export type SideraAnswerEntityReference = {
  kind: "paper" | "hotspot";
  entityId: string;
  citationIndex?: number;
  mentionOrder: number;
  role: "cited" | "discussed" | "recommended";
  relationSummary: string;
};

export type SideraAssistantMessage = {
  id: string;
  status: "streaming" | "complete" | "cancelled" | "failed" | "interrupted";
  markdown: string;
  entityRefs: SideraAnswerEntityReference[];
  toolStage?: import("./sideraPi").SideraPiToolStage;
  retrievalMode?: import("./sideraPi").SideraPiRetrievalMode;
  citationStatus?: "verified" | "unverified";
  evidenceGateStatus?: import("./sideraPi").SideraEvidenceGateStatus;
  usage?: import("./sideraPi").PiUsage;
};

export type SideraConversationTurn = {
  id: string;
  submittedAtMs: number;
  userText: string;
  assistant: SideraAssistantMessage;
};

export type SideraFocusPhase =
  | "idle"
  | "resolving"
  | "acquiring"
  | "hold"
  | "retargeting"
  | "releasing";

export type SideraDirectFocusRoutePhase =
  | "idle"
  | "acquiring"
  | "entering-system"
  | "approaching-paper"
  | "hold"
  | "retargeting"
  | "releasing-local"
  | "restoring-origin";

export type SideraResolvedReference = {
  reference: SideraAnswerEntityReference;
  entity: ResolvedAgentGalaxyEntity;
};

export type SideraFocusComposition = {
  side: "left" | "right";
  targetCenterPx: [number, number];
  targetDiameterPx: number;
  dialogGapPx: number;
  normalizedAnchorX: number;
};

export type SideraFocusCompositionBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

export type SideraFocusCompositionInput = {
  viewportWidth: number;
  viewportHeight: number;
  titlebarHeight: number;
  dialogBounds: SideraFocusCompositionBounds;
  preferredSide?: "left" | "right";
  fallbackSide: "left" | "right";
};

export type SideraFocusSession = {
  messageId: string;
  candidates: SideraResolvedReference[];
  currentIndex: number;
  side: "left" | "right";
  composition: SideraFocusComposition;
  backgroundMode: "immersive" | "theory";
  phase: SideraFocusPhase;
};

export type SideraAnswerResolution = {
  status: "idle" | "resolving" | "ready" | "failed";
  entities: SideraResolvedReference[];
  missing: SideraAnswerEntityReference[];
  error?: string;
};

export type SideraFocusTimelineSample = {
  phase: Exclude<SideraFocusPhase, "idle" | "resolving">;
  progress: number;
  targetBlend: number;
  evidenceBlend: number;
  cameraBlend: number;
  backgroundDimBlend: number;
  infoBlend: number;
  complete: boolean;
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function resolveSideraFocusComposition(
  input: SideraFocusCompositionInput,
): SideraFocusComposition {
  const viewportWidth = Math.max(1, input.viewportWidth);
  const viewportHeight = Math.max(1, input.viewportHeight);
  const safeLeft = 24;
  const safeRight = viewportWidth - 24;
  const safeTop = Math.max(24, input.titlebarHeight + 20);
  const safeBottom = viewportHeight - 24;
  const leftCapacity = Math.max(0, input.dialogBounds.left - safeLeft);
  const rightCapacity = Math.max(0, safeRight - input.dialogBounds.right);
  const minimumRequired = 160 + 40;
  let side = input.preferredSide;
  if (!side) {
    const leftFits = leftCapacity >= minimumRequired;
    const rightFits = rightCapacity >= minimumRequired;
    if (leftFits !== rightFits) {
      side = leftFits ? "left" : "right";
    } else if (Math.abs(leftCapacity - rightCapacity) > 1) {
      side = leftCapacity > rightCapacity ? "left" : "right";
    } else {
      side = input.fallbackSide;
    }
  }

  const capacity = side === "left" ? leftCapacity : rightCapacity;
  const targetDiameterPx = clamp(Math.min(200, Math.max(160, capacity - 64)), 160, 240);
  const dialogGapPx = clamp(capacity - targetDiameterPx, 40, 64);
  const radius = targetDiameterPx * 0.5;
  const desiredCenterX = side === "left"
    ? input.dialogBounds.left - dialogGapPx - radius
    : input.dialogBounds.right + dialogGapPx + radius;
  const centerX = clamp(desiredCenterX, safeLeft + radius, safeRight - radius);
  const centerY = clamp(viewportHeight * 0.42, safeTop + radius, safeBottom - radius);

  return {
    side,
    targetCenterPx: [centerX, centerY],
    targetDiameterPx,
    dialogGapPx,
    normalizedAnchorX: clamp(centerX / viewportWidth, 0, 1),
  };
}

export function sideraSmootherstep(value: number) {
  const t = clamp01(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function stableHash(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function normalizeSideraReferences(
  references: readonly SideraAnswerEntityReference[],
) {
  const seen = new Set<string>();
  return references
    .slice()
    .sort((left, right) => (
      left.mentionOrder - right.mentionOrder
      || (left.citationIndex ?? Number.MAX_SAFE_INTEGER)
        - (right.citationIndex ?? Number.MAX_SAFE_INTEGER)
      || left.entityId.localeCompare(right.entityId)
    ))
    .filter((reference) => {
      const entityId = reference.entityId.trim();
      if (!entityId) return false;
      const key = `${reference.kind}\u0000${entityId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, SIDERA_RESOLVED_ENTITY_LIMIT)
    .map((reference, mentionOrder) => ({
      ...reference,
      entityId: reference.entityId.trim(),
      mentionOrder,
      relationSummary: reference.relationSummary.trim(),
    }));
}

export function isSideraMessageFocusReady(message: SideraAssistantMessage) {
  return (
    message.status === "complete"
    && normalizeSideraReferences(message.entityRefs).length > 0
  );
}

export function buildSideraCarouselWindow(
  resolved: readonly SideraResolvedReference[],
  selectedEntityId?: string,
) {
  const focusable = resolved.filter(({ entity }) => (
    entity.membership !== "missing"
  ));
  if (focusable.length <= SIDERA_DIRECT_CAROUSEL_LIMIT) {
    return focusable.slice();
  }
  const requestedIndex = selectedEntityId
    ? focusable.findIndex(({ entity }) => entity.entityId === selectedEntityId)
    : 0;
  const selectedIndex = requestedIndex >= 0 ? requestedIndex : 0;
  const maximumStart = focusable.length - SIDERA_DIRECT_CAROUSEL_LIMIT;
  const start = Math.max(
    0,
    Math.min(
      maximumStart,
      selectedIndex - Math.floor(SIDERA_DIRECT_CAROUSEL_LIMIT / 2),
    ),
  );
  return focusable.slice(start, start + SIDERA_DIRECT_CAROUSEL_LIMIT);
}

export function resolveSideraInitialIndex(
  candidates: readonly SideraResolvedReference[],
  selectedEntityId?: string,
) {
  if (!selectedEntityId) return 0;
  const index = candidates.findIndex(({ entity }) => (
    entity.entityId === selectedEntityId
  ));
  return Math.max(0, index);
}

export function chooseSideraFallbackSide(
  messageId: string,
  entityId: string,
): "left" | "right" {
  return stableHash(`${messageId}\u0000${entityId}\u0000sidera-side`) % 2
    ? "left"
    : "right";
}

export function sampleSideraFocusTimeline(
  elapsedSeconds: number,
  phase: "acquiring" | "retargeting" | "releasing",
): SideraFocusTimelineSample {
  const duration = phase === "acquiring"
    ? 1.2
    : phase === "retargeting"
      ? 0.95
      : 0.9;
  const progress = clamp01(elapsedSeconds / duration);
  const eased = sideraSmootherstep(progress);
  if (phase === "releasing") {
    const remaining = 1 - eased;
    return {
      phase,
      progress,
      targetBlend: remaining,
      evidenceBlend: 0,
      cameraBlend: remaining,
      backgroundDimBlend: remaining,
      infoBlend: 1 - sideraSmootherstep(progress / 0.55),
      complete: progress >= 1,
    };
  }
  if (phase === "retargeting") {
    return {
      phase,
      progress,
      targetBlend: eased,
      evidenceBlend: 0,
      cameraBlend: eased,
      backgroundDimBlend: 1,
      infoBlend: sideraSmootherstep((progress - 0.28) / 0.52),
      complete: progress >= 1,
    };
  }
  return {
    phase,
    progress,
    targetBlend: eased,
    evidenceBlend: 0,
    cameraBlend: eased,
    backgroundDimBlend: eased,
    infoBlend: sideraSmootherstep((progress - 0.36) / 0.44),
    complete: progress >= 1,
  };
}

export function membershipLabel(membership: BackgroundMembership) {
  switch (membership) {
    case "sampled":
      return "常驻星";
    case "snapshot-unsampled":
      return "理论快照论文";
    case "active-only":
      return "未分类新信号";
    case "missing":
      return "本地库未找到";
  }
}
