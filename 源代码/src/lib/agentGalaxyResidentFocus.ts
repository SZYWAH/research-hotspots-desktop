import type {
  AgentGalaxyFocusIntent,
  AgentGalaxyVector3,
  BackgroundMembership,
} from "./agentGalaxyFlowContract";

export const AGENT_GALAXY_FOCUS_CONTRACT_VERSION =
  "agent-galaxy-resident-focus-contract-v1";

export type AgentGalaxyFocusPhase =
  | "idle"
  | "signal"
  | "capture"
  | "hold"
  | "release"
  | "retarget";

export type AgentGalaxyFocusMode = AgentGalaxyFocusIntent["mode"];

export type AgentGalaxyResidentFocusTarget = {
  entityId: string;
  vertexIndex: number;
  hotspotId: string;
  hotspotIndex: number;
  hotspotAnchor: AgentGalaxyVector3;
  semanticOffset: AgentGalaxyVector3;
  focusTint: AgentGalaxyVector3;
  neighborhoodRadius: number;
  membership: Exclude<BackgroundMembership, "missing">;
  baseVisible: boolean;
  anchorNdc: [number, number];
};

export type AgentGalaxyFocusProfile = {
  captureSeconds: number;
  holdSeconds?: number;
  releaseSeconds: number;
  cameraBlend: number;
  fieldStrength: number;
  phaseLock: number;
  compression: number;
  sizeMultiplier: number;
  targetCssPixels: number;
  lumaMultiplier: number;
  colorBlend: number;
  neighborDim: number;
};

export const AGENT_GALAXY_FOCUS_PROFILES: Record<
  AgentGalaxyFocusMode,
  AgentGalaxyFocusProfile
> = {
  signal: {
    captureSeconds: 0.6,
    holdSeconds: 1.8,
    releaseSeconds: 0.8,
    cameraBlend: 0,
    fieldStrength: 0,
    phaseLock: 0,
    compression: 0,
    sizeMultiplier: 1.5,
    targetCssPixels: 4.2,
    lumaMultiplier: 1.12,
    colorBlend: 0.38,
    neighborDim: 0.06,
  },
  "soft-focus": {
    captureSeconds: 1.4,
    releaseSeconds: 1.4,
    cameraBlend: 0.25,
    fieldStrength: 0.55,
    phaseLock: 0.35,
    compression: 0.01,
    sizeMultiplier: 2.2,
    targetCssPixels: 6.2,
    lumaMultiplier: 1.2,
    colorBlend: 0.62,
    neighborDim: 0.11,
  },
  "full-focus": {
    captureSeconds: 2.35,
    releaseSeconds: 1.4,
    cameraBlend: 1,
    fieldStrength: 1,
    phaseLock: 0.7,
    compression: 0.02,
    sizeMultiplier: 3.05,
    targetCssPixels: 8.5,
    lumaMultiplier: 1.28,
    colorBlend: 0.82,
    neighborDim: 0.16,
  },
};

export const AGENT_GALAXY_FOCUS_RETARGET_SECONDS = 1.6;
export const AGENT_GALAXY_FOCUS_DISTANCE = 44;

export type AgentGalaxyFocusSlot = {
  target: AgentGalaxyResidentFocusTarget;
  mode: AgentGalaxyFocusMode;
  profile: AgentGalaxyFocusProfile;
  weight: number;
  visual: AgentGalaxyFocusVisualSample;
};

type StoredFocusSlot = Omit<AgentGalaxyFocusSlot, "profile" | "visual">;

export type AgentGalaxyFocusVisualSample = {
  acquisitionBlend: number;
  fieldBlend: number;
  materialBlend: number;
  cameraBlend: number;
  releaseBlend: number;
};

export type AgentGalaxyFocusController = {
  phase: AgentGalaxyFocusPhase;
  phaseStartedAt: number;
  active?: StoredFocusSlot;
  outgoing?: StoredFocusSlot;
  releaseStartWeight: number;
  transitionCount: number;
};

export type AgentGalaxyFocusControllerSample = {
  phase: AgentGalaxyFocusPhase;
  progress: number;
  slots: AgentGalaxyFocusSlot[];
  transitionCount: number;
};

export type AgentGalaxyFocusRuntimeSnapshot = {
  phase: AgentGalaxyFocusPhase;
  targetId?: string;
  membership?: BackgroundMembership;
  progress: number;
  mode?: AgentGalaxyFocusMode;
  vertexIndex?: number;
  baseVisible?: boolean;
  promoted?: boolean;
  cameraDistance?: number;
  anchorNdc?: [number, number];
  anchorErrorPx?: number;
  cloudDiameterRatio?: number;
  maxScreenStepPx?: number;
  maxLumaStepRatio?: number;
  acquisitionBlend?: number;
  fieldBlend?: number;
  materialBlend?: number;
  cameraBlend?: number;
  releaseBlend?: number;
  targetCssPixels?: number;
  targetPhotosphereMix?: number;
  fieldMaximumWorldDisplacement?: number;
  fieldMaximumScreenDisplacementPx?: number;
  fieldAffectedVisibleRatio?: number;
  semanticPaperColor?: string;
  semanticHotspotColor?: string;
  starMaterial?: "flat" | "photosphere";
  semanticCoreDrawCalls?: number;
  semanticSurfaceDrawCalls?: number;
  rendererInstanceId?: number;
  transitionCount: number;
  resolutionError?: string;
};

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

export function agentGalaxyFocusSmootherstep(value: number) {
  const amount = clamp01(value);
  return amount * amount * amount
    * (amount * (amount * 6 - 15) + 10);
}

export function createAgentGalaxyFocusController(): AgentGalaxyFocusController {
  return {
    phase: "idle",
    phaseStartedAt: 0,
    releaseStartWeight: 0,
    transitionCount: 0,
  };
}

function smootherRange(
  value: number,
  start: number,
  end: number,
) {
  if (end <= start) return value >= end ? 1 : 0;
  return agentGalaxyFocusSmootherstep((value - start) / (end - start));
}

function captureVisual(
  mode: AgentGalaxyFocusMode,
  elapsedSeconds: number,
): AgentGalaxyFocusVisualSample {
  if (mode === "signal") {
    return {
      acquisitionBlend: smootherRange(elapsedSeconds, 0, 0.6),
      fieldBlend: 0,
      materialBlend: smootherRange(elapsedSeconds, 0.08, 0.6),
      cameraBlend: 0,
      releaseBlend: 0,
    };
  }
  if (mode === "soft-focus") {
    return {
      acquisitionBlend: smootherRange(elapsedSeconds, 0, 0.5),
      fieldBlend: smootherRange(elapsedSeconds, 0.35, 1),
      materialBlend: smootherRange(elapsedSeconds, 0.08, 0.72),
      cameraBlend: smootherRange(elapsedSeconds, 0.75, 1.4),
      releaseBlend: 0,
    };
  }
  return {
    acquisitionBlend: smootherRange(elapsedSeconds, 0, 0.65),
    fieldBlend: smootherRange(elapsedSeconds, 0.45, 1.15),
    materialBlend: smootherRange(elapsedSeconds, 0.08, 0.82),
    cameraBlend: smootherRange(elapsedSeconds, 0.95, 2.35),
    releaseBlend: 0,
  };
}

function holdVisual(): AgentGalaxyFocusVisualSample {
  return {
    acquisitionBlend: 1,
    fieldBlend: 1,
    materialBlend: 1,
    cameraBlend: 1,
    releaseBlend: 0,
  };
}

function releaseVisual(
  progress: number,
  startWeight: number,
): AgentGalaxyFocusVisualSample {
  const amount = clamp01(progress);
  const scale = clamp01(startWeight);
  return {
    acquisitionBlend: scale * (1 - smootherRange(amount, 0.28, 1)),
    fieldBlend: scale * (1 - smootherRange(amount, 0.12, 1)),
    materialBlend: scale * (1 - smootherRange(amount, 0.28, 1)),
    cameraBlend: scale * (1 - smootherRange(amount, 0, 0.72)),
    releaseBlend: amount,
  };
}

function retargetIncomingVisual(
  progress: number,
): AgentGalaxyFocusVisualSample {
  const amount = clamp01(progress);
  return {
    acquisitionBlend: smootherRange(amount, 0, 0.36),
    fieldBlend: smootherRange(amount, 0.22, 0.76),
    materialBlend: smootherRange(amount, 0.08, 0.5),
    cameraBlend: smootherRange(amount, 0.48, 1),
    releaseBlend: 0,
  };
}

function scaleVisual(
  visual: AgentGalaxyFocusVisualSample,
  scale: number,
): AgentGalaxyFocusVisualSample {
  const amount = clamp01(scale);
  return {
    acquisitionBlend: visual.acquisitionBlend * amount,
    fieldBlend: visual.fieldBlend * amount,
    materialBlend: visual.materialBlend * amount,
    cameraBlend: visual.cameraBlend * amount,
    releaseBlend: visual.releaseBlend,
  };
}

function withProfile(
  slot: StoredFocusSlot,
  visual: AgentGalaxyFocusVisualSample,
): AgentGalaxyFocusSlot {
  return {
    ...slot,
    profile: AGENT_GALAXY_FOCUS_PROFILES[slot.mode],
    visual,
  };
}

function dominantSlot(sample: AgentGalaxyFocusControllerSample) {
  return [...sample.slots].sort((left, right) => right.weight - left.weight)[0];
}

function finishAt(
  controller: AgentGalaxyFocusController,
  phase: AgentGalaxyFocusPhase,
  phaseStartedAt: number,
) {
  controller.phase = phase;
  controller.phaseStartedAt = phaseStartedAt;
  controller.transitionCount += 1;
}

export function sampleAgentGalaxyFocusController(
  controller: AgentGalaxyFocusController,
  nowSeconds: number,
): AgentGalaxyFocusControllerSample {
  for (let guard = 0; guard < 4; guard += 1) {
    const active = controller.active;
    if (!active || controller.phase === "idle") {
      controller.phase = "idle";
      controller.active = undefined;
      controller.outgoing = undefined;
      return {
        phase: "idle",
        progress: 0,
        slots: [],
        transitionCount: controller.transitionCount,
      };
    }

    const profile = AGENT_GALAXY_FOCUS_PROFILES[active.mode];
    const elapsed = Math.max(0, nowSeconds - controller.phaseStartedAt);

    if (controller.phase === "capture" || controller.phase === "signal") {
      const rawProgress = elapsed / profile.captureSeconds;
      if (rawProgress >= 1) {
        active.weight = 1;
        finishAt(
          controller,
          "hold",
          controller.phaseStartedAt + profile.captureSeconds,
        );
        continue;
      }
      const progress = agentGalaxyFocusSmootherstep(rawProgress);
      active.weight = progress;
      return {
        phase: controller.phase,
        progress,
        slots: [withProfile(
          active,
          captureVisual(active.mode, elapsed),
        )],
        transitionCount: controller.transitionCount,
      };
    }

    if (controller.phase === "hold") {
      const holdSeconds = profile.holdSeconds;
      if (holdSeconds !== undefined && elapsed >= holdSeconds) {
        controller.releaseStartWeight = 1;
        finishAt(
          controller,
          "release",
          controller.phaseStartedAt + holdSeconds,
        );
        continue;
      }
      active.weight = 1;
      return {
        phase: "hold",
        progress: 1,
        slots: [withProfile(active, holdVisual())],
        transitionCount: controller.transitionCount,
      };
    }

    if (controller.phase === "release") {
      const rawProgress = elapsed / profile.releaseSeconds;
      if (rawProgress >= 1) {
        controller.active = undefined;
        controller.outgoing = undefined;
        finishAt(controller, "idle", nowSeconds);
        continue;
      }
      const progress = agentGalaxyFocusSmootherstep(rawProgress);
      active.weight = controller.releaseStartWeight * (1 - progress);
      const slots = [withProfile(
        active,
        releaseVisual(rawProgress, controller.releaseStartWeight),
      )];
      if (controller.outgoing) {
        const outgoingStartWeight = controller.outgoing.weight;
        slots.unshift(withProfile(
          {
            ...controller.outgoing,
            weight: outgoingStartWeight * (1 - progress),
          },
          releaseVisual(rawProgress, outgoingStartWeight),
        ));
      }
      return {
        phase: "release",
        progress,
        slots,
        transitionCount: controller.transitionCount,
      };
    }

    if (controller.phase === "retarget") {
      const rawProgress = elapsed / AGENT_GALAXY_FOCUS_RETARGET_SECONDS;
      if (rawProgress >= 1) {
        active.weight = 1;
        controller.outgoing = undefined;
        finishAt(
          controller,
          "hold",
          controller.phaseStartedAt + AGENT_GALAXY_FOCUS_RETARGET_SECONDS,
        );
        continue;
      }
      const progress = agentGalaxyFocusSmootherstep(rawProgress);
      active.weight = progress;
      const slots = [withProfile(
        active,
        retargetIncomingVisual(rawProgress),
      )];
      if (controller.outgoing) {
        const outgoingStartWeight = controller.outgoing.weight;
        slots.unshift(withProfile(
          {
            ...controller.outgoing,
            weight: outgoingStartWeight * (1 - progress),
          },
          scaleVisual(
            holdVisual(),
            outgoingStartWeight * (1 - progress),
          ),
        ));
      }
      return {
        phase: "retarget",
        progress,
        slots,
        transitionCount: controller.transitionCount,
      };
    }
  }

  throw new Error("agent-galaxy-focus-controller-transition-overflow");
}

export function commandAgentGalaxyFocus(
  controller: AgentGalaxyFocusController,
  target: AgentGalaxyResidentFocusTarget,
  mode: AgentGalaxyFocusMode,
  nowSeconds: number,
) {
  const current = sampleAgentGalaxyFocusController(controller, nowSeconds);
  const currentPrimary = dominantSlot(current);
  const sameTargetAndMode = currentPrimary
    && currentPrimary.target.entityId === target.entityId
    && currentPrimary.mode === mode
    && controller.phase !== "release";
  if (sameTargetAndMode) return current;

  const next: StoredFocusSlot = {
    target,
    mode,
    weight: 0,
  };
  controller.active = next;
  controller.releaseStartWeight = 0;
  controller.phaseStartedAt = nowSeconds;
  controller.transitionCount += 1;

  if (currentPrimary && currentPrimary.weight > 0.0001) {
    controller.outgoing = {
      target: currentPrimary.target,
      mode: currentPrimary.mode,
      weight: currentPrimary.weight,
    };
    controller.phase = "retarget";
  } else {
    controller.outgoing = undefined;
    controller.phase = mode === "signal" ? "signal" : "capture";
  }
  return sampleAgentGalaxyFocusController(controller, nowSeconds);
}

export function releaseAgentGalaxyFocus(
  controller: AgentGalaxyFocusController,
  nowSeconds: number,
) {
  const current = sampleAgentGalaxyFocusController(controller, nowSeconds);
  const primary = dominantSlot(current);
  if (!primary) return current;
  const secondary = current.slots.find(
    (slot) => slot.target.entityId !== primary.target.entityId,
  );
  controller.active = {
    target: primary.target,
    mode: primary.mode,
    weight: primary.weight,
  };
  controller.outgoing = secondary
    ? {
        target: secondary.target,
        mode: secondary.mode,
        weight: secondary.weight,
      }
    : undefined;
  controller.releaseStartWeight = primary.weight;
  controller.phase = "release";
  controller.phaseStartedAt = nowSeconds;
  controller.transitionCount += 1;
  return sampleAgentGalaxyFocusController(controller, nowSeconds);
}

export function selectAgentGalaxyFocusAnchor(
  projectedNdcX: number,
  viewportWidth: number,
): [number, number] {
  if (viewportWidth < 768) return [0, 0.56];
  return [projectedNdcX <= 0 ? -0.52 : 0.52, 0.14];
}

export function resolveResidentPaperBaseVisibility(
  stableOrder: number,
  visibleBudget: number,
) {
  return stableOrder >= 0 && stableOrder < visibleBudget;
}

export function estimateAgentGalaxyFocusCloudDiameterRatio(
  slots: readonly AgentGalaxyFocusSlot[],
) {
  let minimumRatio = 1;
  for (const slot of slots) {
    const ratio = 1
      - slot.profile.phaseLock
        * slot.profile.compression
        * clamp01(slot.visual.fieldBlend);
    minimumRatio = Math.min(minimumRatio, ratio);
  }
  return minimumRatio;
}
