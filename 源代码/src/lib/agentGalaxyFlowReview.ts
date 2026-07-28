/**
 * M1.2a 引力织场的隔离评审参数。
 *
 * 这里只解析开发评审 URL，不改变旧 agent-background、agent-orbit 或默认应用入口。
 */

export const AGENT_GALAXY_FLOW_REVIEW_MODEL = "gravitational-weave" as const;

export type AgentGalaxyFlowReviewCamera = "static" | "codrift";
export type AgentGalaxyFlowReviewQuality = "auto" | "balanced" | "high";

export type AgentGalaxyFlowReviewConfig = {
  model: typeof AGENT_GALAXY_FLOW_REVIEW_MODEL;
  motion: "idle";
  camera: AgentGalaxyFlowReviewCamera;
  quality: AgentGalaxyFlowReviewQuality;
  gravity: number;
  shear: number;
  twist: number;
  speed: number;
  calm: number;
  fixedTimeSeconds?: number;
  recordSeconds?: number;
  snapshotPng: boolean;
  snapshotRegion: "full" | "stars";
  showHud: boolean;
};

function readNumber(
  params: URLSearchParams,
  key: string,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  if (!params.has(key)) return fallback;
  const value = Number(params.get(key));
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, value));
}

export function isAgentGalaxyFlowReviewMode() {
  if (!import.meta.env.DEV || typeof window === "undefined") return false;
  if ("__TAURI_INTERNALS__" in window) return false;
  return new URLSearchParams(window.location.search).get("visual-review") === "agent-flow";
}

export function readAgentGalaxyFlowReviewConfig(): AgentGalaxyFlowReviewConfig {
  const params = typeof window === "undefined"
    ? new URLSearchParams()
    : new URLSearchParams(window.location.search);
  const requestedTime = params.has("time") ? Number(params.get("time")) : undefined;
  const requestedRecord = params.has("record") ? Number(params.get("record")) : undefined;
  const requestedCamera = params.get("camera");
  const requestedQuality = params.get("quality");
  const fixedTimeSeconds = requestedTime !== undefined
    && Number.isFinite(requestedTime)
    && requestedTime >= 0
    ? Math.min(requestedTime, 3600)
    : undefined;

  return {
    model: AGENT_GALAXY_FLOW_REVIEW_MODEL,
    motion: "idle",
    camera: requestedCamera === "codrift" ? "codrift" : "static",
    quality: requestedQuality === "balanced" || requestedQuality === "high"
      ? requestedQuality
      : "auto",
    gravity: readNumber(params, "gravity", 0.85, 0, 1.5),
    shear: readNumber(params, "shear", 0.42, 0, 1),
    twist: readNumber(params, "twist", 0.18, 0, 0.75),
    speed: readNumber(params, "speed", 1, 0, 3),
    calm: readNumber(params, "calm", 0.3, 0, 0.8),
    fixedTimeSeconds,
    recordSeconds: requestedRecord !== undefined
      && Number.isFinite(requestedRecord)
      && requestedRecord > 0
      ? Math.min(requestedRecord, 60)
      : undefined,
    snapshotPng: params.get("snapshot") === "1"
      && fixedTimeSeconds !== undefined,
    snapshotRegion: params.get("snapshotRegion") === "stars"
      ? "stars"
      : "full",
    showHud: params.get("hud") !== "0",
  };
}
