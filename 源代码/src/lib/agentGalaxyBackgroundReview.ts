import type { AgentGalaxyBackgroundPayloadV1 } from "../types";
import type { GalaxyVisualReviewManifest } from "./galaxyVisualReview";

export type AgentGalaxyBackgroundPreset = "voyage" | "breath" | "signal";
export type AgentGalaxyBackgroundMotionState = "idle" | "input" | "answer" | "reading";
export type AgentGalaxyBackgroundQuality = "auto" | "balanced" | "high";

export type AgentGalaxyBackgroundReviewConfig = {
  preset: AgentGalaxyBackgroundPreset;
  motionState: AgentGalaxyBackgroundMotionState;
  quality: AgentGalaxyBackgroundQuality;
  fixedTimeSeconds?: number;
  recordSeconds?: number;
};

export function isAgentGalaxyBackgroundReviewMode() {
  if (!import.meta.env.DEV || typeof window === "undefined") return false;
  if ("__TAURI_INTERNALS__" in window) return false;
  return new URLSearchParams(window.location.search).get("visual-review") === "agent-background";
}

export function readAgentGalaxyBackgroundReviewConfig(): AgentGalaxyBackgroundReviewConfig {
  const params = typeof window === "undefined"
    ? new URLSearchParams()
    : new URLSearchParams(window.location.search);
  const requestedPreset = params.get("preset");
  const requestedMotion = params.get("motion");
  const requestedQuality = params.get("quality");
  const requestedTime = params.has("time") ? Number(params.get("time")) : undefined;
  const requestedRecord = params.has("record") ? Number(params.get("record")) : undefined;
  const preset: AgentGalaxyBackgroundPreset = requestedPreset === "breath" || requestedPreset === "signal"
    ? requestedPreset
    : "voyage";
  const motionState: AgentGalaxyBackgroundMotionState = requestedMotion === "input"
    || requestedMotion === "answer"
    || requestedMotion === "reading"
    ? requestedMotion
    : "idle";
  const quality: AgentGalaxyBackgroundQuality = requestedQuality === "balanced" || requestedQuality === "high"
    ? requestedQuality
    : "auto";
  return {
    preset,
    motionState,
    quality,
    fixedTimeSeconds: requestedTime !== undefined
      && Number.isFinite(requestedTime)
      && requestedTime >= 0
      ? Math.min(requestedTime, 3600)
      : undefined,
    recordSeconds: requestedRecord !== undefined
      && Number.isFinite(requestedRecord)
      && requestedRecord > 0
      ? Math.min(requestedRecord, 60)
      : undefined,
  };
}

async function fetchSnapshotJson<T>(path: string): Promise<T> {
  const response = await fetch(`/${path.replace(/^\/+/, "")}?agentReview=${Date.now()}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Agent 星空评审载荷读取失败（${response.status}）：${path}`);
  }
  return response.json() as Promise<T>;
}

export async function loadAgentGalaxyBackgroundPayload() {
  const manifest = await fetchSnapshotJson<GalaxyVisualReviewManifest>("manifest.json");
  if (manifest.schemaVersion !== 1 || !manifest.agentBackgroundPath) {
    throw new Error("当前视觉快照没有 Agent 星空载荷，请重新运行 pnpm visual:galaxy:snapshot。");
  }
  const payload = await fetchSnapshotJson<AgentGalaxyBackgroundPayloadV1>(manifest.agentBackgroundPath);
  if (payload.schemaVersion !== 1 || payload.payloadKind !== "agent-galaxy-background") {
    throw new Error("Agent 星空载荷版本不受支持。");
  }
  if (payload.sourceSnapshotId !== payload.activeSnapshotId && !payload.stale) {
    throw new Error("Agent 星空载荷的快照过期状态不一致。");
  }
  return { manifest, payload };
}
