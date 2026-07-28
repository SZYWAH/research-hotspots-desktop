import type { AgentGalaxyMotionState } from "./agentGalaxyFlowContract";

export type AgentGalaxyImmersiveState = AgentGalaxyMotionState;
export type AgentGalaxyImmersiveQuality = "auto" | "balanced" | "high";
export type AgentGalaxyImmersiveEntityKind = "paper" | "hotspot";
export type AgentGalaxyImmersiveView = "immersive" | "theory";

export type AgentGalaxyImmersiveReviewConfig = {
  state: AgentGalaxyImmersiveState;
  quality: AgentGalaxyImmersiveQuality;
  focusEntity?: string;
  focusKind: AgentGalaxyImmersiveEntityKind;
  view: AgentGalaxyImmersiveView;
  fixedTimeSeconds?: number;
  showHud: boolean;
};

function isTauriImmersiveReviewEnabled() {
  return import.meta.env.DEV
    && import.meta.env.VITE_AGENT_GALAXY_IMMERSIVE_REVIEW === "1";
}

export function isAgentGalaxyImmersiveReviewMode() {
  if (!import.meta.env.DEV || typeof window === "undefined") return false;
  if ("__TAURI_INTERNALS__" in window) {
    return isTauriImmersiveReviewEnabled();
  }
  return new URLSearchParams(window.location.search).get("visual-review")
    === "agent-immersive";
}

export function readAgentGalaxyImmersiveReviewConfig():
AgentGalaxyImmersiveReviewConfig {
  const params = typeof window === "undefined"
    ? new URLSearchParams()
    : new URLSearchParams(window.location.search);
  const requestedState = params.get("state");
  const requestedQuality = params.get("quality");
  const requestedTime = params.has("time")
    ? Number(params.get("time"))
    : undefined;
  const tauriReviewEnabled = isTauriImmersiveReviewEnabled();
  const allowedStates: AgentGalaxyImmersiveState[] = [
    "idle",
    "input",
    "thinking",
    "answer",
    "reading",
    "focus",
  ];

  return {
    state: allowedStates.includes(requestedState as AgentGalaxyImmersiveState)
      ? requestedState as AgentGalaxyImmersiveState
      : "idle",
    quality: requestedQuality === "balanced" || requestedQuality === "high"
      ? requestedQuality
      : tauriReviewEnabled
        ? "balanced"
        : "auto",
    focusEntity: params.get("focusEntity")?.trim()
      || params.get("focusPaper")?.trim()
      || undefined,
    focusKind: params.get("focusKind") === "hotspot" ? "hotspot" : "paper",
    view: params.get("view") === "theory" ? "theory" : "immersive",
    fixedTimeSeconds: requestedTime !== undefined
      && Number.isFinite(requestedTime)
      && requestedTime >= 0
      ? Math.min(requestedTime, 3600)
      : undefined,
    showHud: params.get("hud") === "1" || tauriReviewEnabled,
  };
}
