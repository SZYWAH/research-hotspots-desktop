/**
 * 隔离的轨道运动原型配置。
 *
 * 这个模块只负责读取 URL 旋钮，不触碰既有的 agent-background 评审链路：
 * `?visual-review=agent-orbit` 走原型，其他值仍然由旧入口处理。
 */

export type AgentGalaxyOrbitPrototypeConfig = {
  /** 轨道整体快慢倍率。 */
  spin: number;
  /** 相机路径速度倍率，0 表示相机静止。 */
  cam: number;
  /** 近景视差亮星数量。 */
  near: number;
  /** 相机路径半径：留在星图空心核内（热点最内层 |pos| ≈ 10.7）。 */
  camr: number;
  /** 非语义微尘数量：只负责填补语义缺口，无身份。 */
  dust: number;
  /** 固定时间帧（秒）；给定时只渲染一帧，便于确定性截图。 */
  fixedTimeSeconds?: number;
};

function readNumber(
  params: URLSearchParams,
  key: string,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  if (!params.has(key)) return fallback;
  const parsed = Number(params.get(key));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

export function isAgentGalaxyOrbitPrototypeMode() {
  if (!import.meta.env.DEV || typeof window === "undefined") return false;
  if ("__TAURI_INTERNALS__" in window) return false;
  return new URLSearchParams(window.location.search).get("visual-review") === "agent-orbit";
}

export function readAgentGalaxyOrbitPrototypeConfig(): AgentGalaxyOrbitPrototypeConfig {
  const params = typeof window === "undefined"
    ? new URLSearchParams()
    : new URLSearchParams(window.location.search);
  const requestedTime = params.has("time") ? Number(params.get("time")) : undefined;
  return {
    spin: readNumber(params, "spin", 1, 0, 8),
    cam: readNumber(params, "cam", 1, 0, 6),
    near: Math.round(readNumber(params, "near", 40, 0, 400)),
    camr: readNumber(params, "camr", 11, 0, 60),
    dust: Math.round(readNumber(params, "dust", 2600, 0, 20000)),
    fixedTimeSeconds: requestedTime !== undefined
      && Number.isFinite(requestedTime)
      && requestedTime >= 0
      ? Math.min(requestedTime, 3600)
      : undefined,
  };
}
