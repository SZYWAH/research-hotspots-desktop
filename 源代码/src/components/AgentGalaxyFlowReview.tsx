import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { AgentGalaxyBackgroundPayloadV1 } from "../types";
import type { AgentGalaxyFocusIntent } from "../lib/agentGalaxyFlowContract";
import { loadAgentGalaxyBackgroundPayload } from "../lib/agentGalaxyBackgroundReview";
import {
  readAgentGalaxyFlowReviewConfig,
  type AgentGalaxyFlowReviewConfig,
} from "../lib/agentGalaxyFlowReview";
import {
  runGravitationalWeaveGpuParityAudit,
  type GravitationalWeaveGpuParityResult,
} from "../lib/gravitationalWeaveGpuParity";
import {
  runAgentGalaxyFocusFieldGpuParityAudit,
  type AgentGalaxyFocusFieldGpuParityResult,
} from "../lib/agentGalaxyFocusFieldGpuParity";
import type {
  AgentGalaxyFocusRuntimeSnapshot,
  AgentGalaxyFocusMode,
} from "../lib/agentGalaxyResidentFocus";
import AgentGalaxyFlowCanvas, {
  AGENT_GALAXY_FLOW_SNAPSHOT_SIZE,
  AGENT_GALAXY_FLOW_STAR_CROP,
  type AgentGalaxyFlowMetrics,
} from "./AgentGalaxyFlowCanvas";
import "./AgentGalaxyFlowReview.css";

type RecordingState = "idle" | "recording" | "saving" | "ready" | "unsupported" | "error";
type SnapshotState = "idle" | "saving" | "ready" | "unsupported" | "error";

type AgentGalaxyFlowReviewWindow = Window & {
  __AGENT_GALAXY_FLOW_REVIEW__?: {
    ready: boolean;
    error?: string;
    config: AgentGalaxyFlowReviewConfig;
    metrics?: AgentGalaxyFlowMetrics;
    gpuParity?: GravitationalWeaveGpuParityResult;
    focusFieldGpuParity?: AgentGalaxyFocusFieldGpuParityResult;
    sourceSnapshotId?: string;
    recordingState: RecordingState;
    recordingSavedPath?: string;
    recordingByteLength: number;
    recordingError?: string;
    snapshotState: SnapshotState;
    snapshotSavedPath?: string;
    snapshotByteLength: number;
    snapshotError?: string;
    focus?: AgentGalaxyFocusRuntimeSnapshot;
    commands: {
      focusPaper: (entityId: string, mode?: AgentGalaxyFocusMode) => void;
      releaseFocus: () => void;
      answerEnded: () => void;
    };
  };
};

const MIN_RECORDING_BYTES = 1024;
const MIN_SNAPSHOT_BYTES = 1024;
const VISIBLE_RESIDENT_PAPER_ID = "project-default:openalex:W2582012066";
const PROMOTED_RESIDENT_PAPER_ID = "project-default:openalex:W4386693657";

function useReducedMotionPreference() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return reducedMotion;
}

function formatMetric(value: number | undefined, digits = 1) {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return "待采样";
  return value.toFixed(digits);
}

function formatBlend(value: number | undefined) {
  return value === undefined || !Number.isFinite(value)
    ? "—"
    : value.toFixed(2);
}

function recordingFilename(config: AgentGalaxyFlowReviewConfig) {
  return `agent-flow-gravitational-weave-${config.camera}-${config.quality}.webm`;
}

function snapshotFilename(config: AgentGalaxyFlowReviewConfig) {
  const time = Math.round(config.fixedTimeSeconds ?? 0)
    .toString()
    .padStart(2, "0");
  if (config.snapshotRegion === "stars") {
    return `agent-flow-gravitational-weave-static-${config.quality}-t${time}-stars-1024x768.png`;
  }
  return `agent-flow-gravitational-weave-static-${config.quality}-t${time}-3840x2160.png`;
}

export default function AgentGalaxyFlowReview() {
  const config = useMemo(readAgentGalaxyFlowReviewConfig, []);
  const reducedMotion = useReducedMotionPreference();
  const [payload, setPayload] = useState<AgentGalaxyBackgroundPayloadV1>();
  const [error, setError] = useState("");
  const [metrics, setMetrics] = useState<AgentGalaxyFlowMetrics>();
  const [gpuParity, setGpuParity] = useState<GravitationalWeaveGpuParityResult>();
  const [focusFieldGpuParity, setFocusFieldGpuParity] =
    useState<AgentGalaxyFocusFieldGpuParityResult>();
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [recordingUrl, setRecordingUrl] = useState("");
  const [recordingSavedPath, setRecordingSavedPath] = useState("");
  const [recordingByteLength, setRecordingByteLength] = useState(0);
  const [recordingError, setRecordingError] = useState("");
  const recordingStartedRef = useRef(false);
  const [snapshotState, setSnapshotState] = useState<SnapshotState>("idle");
  const [snapshotSavedPath, setSnapshotSavedPath] = useState("");
  const [snapshotByteLength, setSnapshotByteLength] = useState(0);
  const [snapshotError, setSnapshotError] = useState("");
  const snapshotStartedRef = useRef(false);
  const [focusIntent, setFocusIntent] = useState<AgentGalaxyFocusIntent>();
  const [focusSnapshot, setFocusSnapshot] =
    useState<AgentGalaxyFocusRuntimeSnapshot>();
  const [selectedPaperId, setSelectedPaperId] = useState(
    config.focusPaper ?? VISIBLE_RESIDENT_PAPER_ID,
  );
  const [selectedFocusMode, setSelectedFocusMode] =
    useState<AgentGalaxyFocusMode>(config.focusMode);
  const answerReleaseTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    let active = true;
    loadAgentGalaxyBackgroundPayload()
      .then(({ payload: nextPayload }) => {
        if (active) setPayload(nextPayload);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      active = false;
    };
  }, []);

  const handleMetrics = useCallback((nextMetrics: AgentGalaxyFlowMetrics) => {
    setMetrics(nextMetrics);
  }, []);

  const handleFocusSnapshot = useCallback(
    (nextSnapshot: AgentGalaxyFocusRuntimeSnapshot) => {
      setFocusSnapshot(nextSnapshot);
    },
    [],
  );

  const focusPaper = useCallback((
    entityId: string,
    mode: AgentGalaxyFocusMode = config.focusMode,
  ) => {
    if (answerReleaseTimerRef.current !== undefined) {
      window.clearTimeout(answerReleaseTimerRef.current);
      answerReleaseTimerRef.current = undefined;
    }
    setSelectedPaperId(entityId);
    setSelectedFocusMode(mode);
    setFocusIntent({
      kind: "paper",
      entityId,
      mode,
      reason: mode === "full-focus"
        ? "citation-click"
        : mode === "soft-focus"
          ? "reading"
          : "query",
    });
  }, [config.focusMode]);

  const releaseFocus = useCallback(() => {
    if (answerReleaseTimerRef.current !== undefined) {
      window.clearTimeout(answerReleaseTimerRef.current);
      answerReleaseTimerRef.current = undefined;
    }
    setFocusIntent(undefined);
  }, []);

  const answerEnded = useCallback(() => {
    if (focusIntent?.mode !== "soft-focus") return;
    if (answerReleaseTimerRef.current !== undefined) {
      window.clearTimeout(answerReleaseTimerRef.current);
    }
    answerReleaseTimerRef.current = window.setTimeout(() => {
      setFocusIntent(undefined);
      answerReleaseTimerRef.current = undefined;
    }, 2000);
  }, [focusIntent?.mode]);

  useEffect(() => {
    const initialPaperId = config.focusPaper ?? VISIBLE_RESIDENT_PAPER_ID;
    const delayMs = config.fixedTimeSeconds !== undefined
      ? 0
      : config.focusPaper
        ? config.focusDelaySeconds * 1000
        : 120;
    const timer = window.setTimeout(() => {
      focusPaper(initialPaperId, config.focusMode);
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [
    config.fixedTimeSeconds,
    config.focusDelaySeconds,
    config.focusMode,
    config.focusPaper,
    focusPaper,
  ]);

  useEffect(() => () => {
    if (answerReleaseTimerRef.current !== undefined) {
      window.clearTimeout(answerReleaseTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (!payload) return;
    let active = true;
    setGpuParity(undefined);
    const timer = window.setTimeout(() => {
      const result = runGravitationalWeaveGpuParityAudit(
        payload,
        {
          gravity: config.gravity,
          shear: config.shear,
          twist: config.twist,
          speed: config.speed,
          calmStrength: config.calm,
        },
        config.fixedTimeSeconds ?? 8,
      );
      if (active) setGpuParity(result);
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [config, payload]);

  useEffect(() => {
    if (!payload) return;
    let active = true;
    setFocusFieldGpuParity(undefined);
    const timer = window.setTimeout(() => {
      const result = runAgentGalaxyFocusFieldGpuParityAudit();
      if (active) setFocusFieldGpuParity(result);
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [payload]);

  useEffect(() => {
    const reviewWindow = window as AgentGalaxyFlowReviewWindow;
    reviewWindow.__AGENT_GALAXY_FLOW_REVIEW__ = {
      ready: Boolean(
        payload
        && metrics?.webglAvailable
        && gpuParity
        && gpuParity.status !== "FAIL"
        && focusFieldGpuParity
        && focusFieldGpuParity.status !== "FAIL"
        && !error
      ),
      error: error || undefined,
      config,
      metrics,
      gpuParity,
      focusFieldGpuParity,
      sourceSnapshotId: payload?.sourceSnapshotId,
      recordingState,
      recordingSavedPath: recordingSavedPath || undefined,
      recordingByteLength,
      recordingError: recordingError || undefined,
      snapshotState,
      snapshotSavedPath: snapshotSavedPath || undefined,
      snapshotByteLength,
      snapshotError: snapshotError || undefined,
      focus: focusSnapshot,
      commands: {
        focusPaper,
        releaseFocus,
        answerEnded,
      },
    };
  }, [
    answerEnded,
    config,
    error,
    focusPaper,
    focusSnapshot,
    focusFieldGpuParity,
    gpuParity,
    metrics,
    payload,
    recordingByteLength,
    recordingError,
    recordingSavedPath,
    recordingState,
    snapshotByteLength,
    snapshotError,
    snapshotSavedPath,
    snapshotState,
    releaseFocus,
  ]);

  useEffect(() => {
    if (
      !payload
      || !metrics?.webglAvailable
      || !config.recordSeconds
      || recordingStartedRef.current
    ) return;
    const canvas = document.querySelector<HTMLCanvasElement>(".agent-galaxy-flow__canvas");
    if (!canvas || typeof canvas.captureStream !== "function" || typeof MediaRecorder === "undefined") {
      setRecordingState("unsupported");
      return;
    }

    const mimeType = [
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
    ].find((candidate) => MediaRecorder.isTypeSupported(candidate));
    if (!mimeType) {
      setRecordingState("unsupported");
      return;
    }

    recordingStartedRef.current = true;
    const stream = canvas.captureStream(30);
    const chunks: BlobPart[] = [];
    let active = true;
    let recorder: MediaRecorder;

    try {
      recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: metrics.quality === "high" ? 8_000_000 : 5_000_000,
      });
    } catch (reason) {
      setRecordingError(reason instanceof Error ? reason.message : "media-recorder-construction-failed");
      setRecordingState("error");
      for (const track of stream.getTracks()) track.stop();
      return;
    }

    const timeout = window.setTimeout(() => {
      if (active && recorder.state === "recording") recorder.stop();
    }, config.recordSeconds * 1000);

    recorder.addEventListener("dataavailable", (event) => {
      if (active && event.data.size > 0) chunks.push(event.data);
    });
    recorder.addEventListener("error", () => {
      if (active) {
        setRecordingError("media-recorder-error");
        setRecordingState("error");
      }
    }, { once: true });
    recorder.addEventListener("stop", async () => {
      for (const track of stream.getTracks()) track.stop();
      if (!active) return;

      const blob = new Blob(chunks, { type: mimeType });
      setRecordingByteLength(blob.size);
      if (blob.size < MIN_RECORDING_BYTES) {
        setRecordingError(`recording-blob-too-small:${blob.size}`);
        setRecordingState("error");
        return;
      }
      const header = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
      if (
        header.length !== 4
        || header[0] !== 0x1a
        || header[1] !== 0x45
        || header[2] !== 0xdf
        || header[3] !== 0xa3
      ) {
        setRecordingError("recording-invalid-webm-header");
        setRecordingState("error");
        return;
      }

      setRecordingUrl(URL.createObjectURL(blob));
      setRecordingState("saving");
      const filename = recordingFilename(config);
      fetch(`/__agent-background-recording?name=${encodeURIComponent(filename)}`, {
        method: "POST",
        headers: { "Content-Type": mimeType },
        body: blob,
      })
        .then(async (response) => {
          if (!response.ok) throw new Error(`录屏保存失败：${response.status}`);
          const result = await response.json() as { path?: string; byteLength?: number };
          if (result.byteLength !== blob.size) throw new Error("录屏保存字节数不一致");
          if (!active) return;
          setRecordingSavedPath(result.path ?? "");
          setRecordingState("ready");
        })
        .catch((reason) => {
          if (!active) return;
          setRecordingError(reason instanceof Error ? reason.message : "recording-save-failed");
          setRecordingState("error");
        });
    }, { once: true });

    setRecordingState("recording");
    recorder.start();

    return () => {
      active = false;
      window.clearTimeout(timeout);
      if (recorder.state === "recording") recorder.stop();
      for (const track of stream.getTracks()) track.stop();
    };
  }, [config, metrics?.quality, metrics?.webglAvailable, payload]);

  useEffect(() => () => {
    if (recordingUrl) URL.revokeObjectURL(recordingUrl);
  }, [recordingUrl]);

  useEffect(() => {
    if (
      !payload
      || !metrics?.webglAvailable
      || !config.snapshotPng
      || snapshotStartedRef.current
    ) return;
    const canvas = document.querySelector<HTMLCanvasElement>(".agent-galaxy-flow__canvas");
    if (!canvas || typeof canvas.toBlob !== "function") {
      setSnapshotState("unsupported");
      return;
    }
    const expectedSize = config.snapshotRegion === "stars"
      ? AGENT_GALAXY_FLOW_STAR_CROP
      : AGENT_GALAXY_FLOW_SNAPSHOT_SIZE;
    if (canvas.width !== expectedSize.width || canvas.height !== expectedSize.height) {
      setSnapshotError(`snapshot-size-mismatch:${canvas.width}x${canvas.height}`);
      setSnapshotState("error");
      return;
    }

    snapshotStartedRef.current = true;
    setSnapshotState("saving");
    canvas.toBlob(async (blob) => {
      if (!blob) {
        setSnapshotError("snapshot-blob-unavailable");
        setSnapshotState("error");
        return;
      }
      setSnapshotByteLength(blob.size);
      if (blob.size < MIN_SNAPSHOT_BYTES) {
        setSnapshotError(`snapshot-blob-too-small:${blob.size}`);
        setSnapshotState("error");
        return;
      }
      const header = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
      if (
        header.length !== 8
        || header[0] !== 0x89
        || header[1] !== 0x50
        || header[2] !== 0x4e
        || header[3] !== 0x47
        || header[4] !== 0x0d
        || header[5] !== 0x0a
        || header[6] !== 0x1a
        || header[7] !== 0x0a
      ) {
        setSnapshotError("snapshot-invalid-png-header");
        setSnapshotState("error");
        return;
      }

      try {
        const filename = snapshotFilename(config);
        const response = await fetch(
          `/__agent-flow-snapshot?name=${encodeURIComponent(filename)}`,
          {
            method: "POST",
            headers: { "Content-Type": "image/png" },
            body: blob,
          },
        );
        if (!response.ok) throw new Error(`截图保存失败：${response.status}`);
        const result = await response.json() as { path?: string; byteLength?: number };
        if (result.byteLength !== blob.size) throw new Error("截图保存字节数不一致");
        setSnapshotSavedPath(result.path ?? "");
        setSnapshotState("ready");
      } catch (reason) {
        setSnapshotError(reason instanceof Error ? reason.message : "snapshot-save-failed");
        setSnapshotState("error");
      }
    }, "image/png");
  }, [config, metrics?.webglAvailable, payload]);

  if (error) {
    return (
      <main className="agent-flow-review agent-flow-review--message" data-review-ready="false">
        <div>
          <p>引力织场载荷未就绪</p>
          <pre>{error}</pre>
        </div>
      </main>
    );
  }

  if (!payload) {
    return (
      <main className="agent-flow-review agent-flow-review--message" data-review-ready="false">
        <div>
          <span className="agent-flow-review__loading-mark" aria-hidden="true" />
          <p>正在校验理论星图派生载荷</p>
        </div>
      </main>
    );
  }

  return (
    <main
      className="agent-flow-review"
      data-review-ready={
        metrics?.webglAvailable
        && gpuParity
        && gpuParity.status !== "FAIL"
        && focusFieldGpuParity
        && focusFieldGpuParity.status !== "FAIL"
          ? "true"
          : "false"
      }
      data-gpu-parity={gpuParity?.status ?? "PREPARING"}
      data-focus-field-gpu-parity={
        focusFieldGpuParity?.status ?? "PREPARING"
      }
      data-review-model={config.model}
      data-review-camera={config.camera}
      data-review-quality={metrics?.quality ?? config.quality}
      data-source-snapshot={payload.sourceSnapshotId}
      data-snapshot-state={snapshotState}
      data-focus-phase={focusSnapshot?.phase ?? "idle"}
      data-focus-target-visible={
        focusSnapshot?.baseVisible === undefined
          ? "unknown"
          : focusSnapshot.baseVisible
            ? "true"
            : "false"
      }
    >
      <AgentGalaxyFlowCanvas
        payload={payload}
        config={config}
        focusIntent={focusIntent}
        reducedMotion={reducedMotion}
        onMetrics={handleMetrics}
        onFocusSnapshot={handleFocusSnapshot}
      />

      {config.showHud ? (
        <>
          <header className="agent-flow-review__identity">
            <h1>引力织场</h1>
            <p>知识空间持续流动。聚焦只改变局部关系与观察位置。</p>
          </header>

          <section
            className="agent-flow-review__focus-controls"
            aria-label="常驻论文聚焦评审"
          >
            <div className="agent-flow-review__focus-targets">
              <button
                type="button"
                aria-pressed={
                  selectedPaperId === VISIBLE_RESIDENT_PAPER_ID
                  && focusSnapshot?.phase !== "idle"
                }
                onClick={() => focusPaper(
                  VISIBLE_RESIDENT_PAPER_ID,
                  selectedFocusMode,
                )}
              >
                常驻可见
              </button>
              <button
                type="button"
                aria-pressed={
                  selectedPaperId === PROMOTED_RESIDENT_PAPER_ID
                  && focusSnapshot?.phase !== "idle"
                }
                onClick={() => focusPaper(
                  PROMOTED_RESIDENT_PAPER_ID,
                  selectedFocusMode,
                )}
              >
                预算外常驻
              </button>
            </div>
            <div className="agent-flow-review__focus-modes">
              {([
                ["signal", "信号"],
                ["soft-focus", "柔焦"],
                ["full-focus", "完整聚焦"],
              ] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={
                    selectedFocusMode === mode
                    && focusSnapshot?.phase !== "idle"
                  }
                  onClick={() => focusPaper(selectedPaperId, mode)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="agent-flow-review__focus-actions">
              <button type="button" onClick={answerEnded}>回答结束</button>
              <button type="button" onClick={releaseFocus}>释放聚焦</button>
              <output aria-live="polite">
                {focusSnapshot?.phase ?? "idle"}
              </output>
            </div>
          </section>

          <section className="agent-flow-review__telemetry" aria-label="引力织场实时指标">
            <dl>
              <div>
                <dt>相机</dt>
                <dd>{config.camera}</dd>
              </div>
              <div>
                <dt>质量</dt>
                <dd>{metrics?.quality ?? config.quality}</dd>
              </div>
              <div>
                <dt>帧率</dt>
                <dd>{formatMetric(metrics?.averageFps)} FPS</dd>
              </div>
              <div>
                <dt>P95</dt>
                <dd>{formatMetric(metrics?.p95FrameMs)} ms</dd>
              </div>
              <div>
                <dt>捕获 / 场 / 材质</dt>
                <dd>
                  {formatBlend(focusSnapshot?.acquisitionBlend)}
                  {" / "}
                  {formatBlend(focusSnapshot?.fieldBlend)}
                  {" / "}
                  {formatBlend(focusSnapshot?.materialBlend)}
                </dd>
              </div>
              <div>
                <dt>相机 / 释放</dt>
                <dd>
                  {formatBlend(focusSnapshot?.cameraBlend)}
                  {" / "}
                  {formatBlend(focusSnapshot?.releaseBlend)}
                </dd>
              </div>
              <div>
                <dt>目标光球</dt>
                <dd>
                  {formatMetric(focusSnapshot?.targetCssPixels, 2)} px
                  {" · LOD "}
                  {formatMetric(focusSnapshot?.targetPhotosphereMix, 2)}
                </dd>
              </div>
              <div>
                <dt>局部织场</dt>
                <dd>
                  {formatMetric(
                    focusSnapshot?.fieldMaximumScreenDisplacementPx,
                    2,
                  )} px
                  {" · "}
                  {formatMetric(
                    (focusSnapshot?.fieldAffectedVisibleRatio ?? 0) * 100,
                    1,
                  )}%
                </dd>
              </div>
            </dl>
          </section>

          <footer className="agent-flow-review__parameters">
            <span>gravity {config.gravity.toFixed(2)}</span>
            <span>shear {config.shear.toFixed(2)}</span>
            <span>twist {config.twist.toFixed(2)}</span>
            <span>speed {config.speed.toFixed(2)}</span>
            <span>calm {config.calm.toFixed(2)}</span>
            <span>material {config.starMaterial}</span>
            <span>field {config.focusField ? "on" : "off"}</span>
            <span>camera {config.focusCamera ? "on" : "off"}</span>
            <span>
              draws {focusSnapshot?.semanticCoreDrawCalls ?? 0}
              {" + "}
              {focusSnapshot?.semanticSurfaceDrawCalls ?? 0}
            </span>
            <span>
              color {focusSnapshot?.semanticPaperColor ?? "—"}
              {" / "}
              {focusSnapshot?.semanticHotspotColor ?? "—"}
            </span>
            <span>
              {config.fixedTimeSeconds === undefined ? "realtime" : `t ${config.fixedTimeSeconds.toFixed(2)}s`}
            </span>
          </footer>

          <aside className="agent-flow-review__counts" aria-label="可见粒子数量">
            <span>{metrics?.visiblePaperProxyCount ?? 0} papers</span>
            <span>{metrics?.visibleHotspotCount ?? 0} hotspots</span>
            <span>{metrics?.environmentStarCount ?? 0} environment</span>
            <span>{metrics?.dustCount ?? 0} dust</span>
          </aside>
        </>
      ) : null}

      <output className="agent-flow-review__readiness" aria-live="polite">
        {!metrics?.webglAvailable || !gpuParity || !focusFieldGpuParity
          ? "PREPARING"
          : gpuParity.status === "FAIL"
            ? "GPU PARITY FAIL"
            : focusFieldGpuParity.status === "FAIL"
              ? "FOCUS FIELD GPU PARITY FAIL"
            : gpuParity.status === "UNVERIFIED"
              ? "READY · GPU PARITY UNVERIFIED"
              : focusFieldGpuParity.status === "UNVERIFIED"
                ? "READY · FOCUS FIELD GPU PARITY UNVERIFIED"
              : "READY"}
      </output>

      <output className="agent-flow-review__diagnostics" aria-label="引力织场性能诊断">
        {JSON.stringify({
          config,
          metrics,
          gpuParity,
          focusFieldGpuParity,
          sourceSnapshotId: payload.sourceSnapshotId,
          sourcePaperCount: payload.sourcePaperCount,
          sourceHotspotCount: payload.sourceHotspotCount,
          focusIntent,
          focusSnapshot,
          recordingState,
          recordingSavedPath: recordingSavedPath || undefined,
          recordingByteLength,
          recordingError: recordingError || undefined,
          snapshotState,
          snapshotSavedPath: snapshotSavedPath || undefined,
          snapshotByteLength,
          snapshotError: snapshotError || undefined,
        })}
      </output>

      {config.recordSeconds ? (
        <aside className="agent-flow-review__recording" data-recording-state={recordingState}>
          {recordingState === "recording" ? `正在录制 ${config.recordSeconds} 秒` : null}
          {recordingState === "saving" ? "正在保存录屏" : null}
          {recordingState === "ready" && recordingUrl ? (
            <a href={recordingUrl} download={recordingFilename(config)}>下载录屏</a>
          ) : null}
          {recordingState === "unsupported" ? "当前浏览器不支持画布录制" : null}
          {recordingState === "error" ? `录制失败：${recordingError || "未知错误"}` : null}
        </aside>
      ) : null}
    </main>
  );
}
