import { useCallback, useEffect, useMemo, useState } from "react";

import type { AgentGalaxyBackgroundPayloadV1 } from "../types";
import {
  loadAgentGalaxyBackgroundPayload,
  readAgentGalaxyBackgroundReviewConfig,
  type AgentGalaxyBackgroundReviewConfig,
} from "../lib/agentGalaxyBackgroundReview";
import AgentGalaxyBackgroundCanvas, {
  type AgentGalaxyBackgroundMetrics,
} from "./AgentGalaxyBackgroundCanvas";
import "./AgentGalaxyBackgroundReview.css";

type ReviewWindow = Window & {
  __AGENT_GALAXY_BACKGROUND_REVIEW__?: {
    ready: boolean;
    error?: string;
    config: AgentGalaxyBackgroundReviewConfig;
    metrics?: AgentGalaxyBackgroundMetrics;
    sourceSnapshotId?: string;
    recordingState: RecordingState;
    recordingSavedPath?: string;
    recordingByteLength: number;
    recordingError?: string;
  };
};

type RecordingState = "idle" | "recording" | "saving" | "ready" | "unsupported" | "error";
const MIN_RECORDING_BYTES = 1024;

const PRESET_COPY = {
  voyage: {
    eyebrow: "DEEP SPACE VOYAGE",
    title: "深空航行",
    description: "以缓慢穿行为主，强调真实方向、纵深与视差。",
  },
  breath: {
    eyebrow: "GALACTIC BREATH",
    title: "星系呼吸",
    description: "以热点能量和星流为主，强调凝聚、呼吸与空间张力。",
  },
  signal: {
    eyebrow: "RESEARCH SIGNAL",
    title: "科研信号",
    description: "以低频深空和受控脉冲为主，所有脉冲均属于展示层。",
  },
} as const;

function useReducedMotionPreference() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return reduced;
}

function formatMetric(value: number, suffix = "") {
  if (!Number.isFinite(value) || value <= 0) return "待采样";
  return `${value.toFixed(1)}${suffix}`;
}

export default function AgentGalaxyBackgroundReview() {
  const config = useMemo(readAgentGalaxyBackgroundReviewConfig, []);
  const copy = PRESET_COPY[config.preset];
  const reducedMotion = useReducedMotionPreference();
  const [payload, setPayload] = useState<AgentGalaxyBackgroundPayloadV1>();
  const [error, setError] = useState("");
  const [metrics, setMetrics] = useState<AgentGalaxyBackgroundMetrics>();
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [recordingUrl, setRecordingUrl] = useState("");
  const [recordingSavedPath, setRecordingSavedPath] = useState("");
  const [recordingByteLength, setRecordingByteLength] = useState(0);
  const [recordingError, setRecordingError] = useState("");
  const [viewport, setViewport] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
  }));

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

  const handleMetrics = useCallback((nextMetrics: AgentGalaxyBackgroundMetrics) => {
    setMetrics(nextMetrics);
  }, []);

  useEffect(() => {
    const updateViewport = () => setViewport({
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
    });
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  useEffect(() => {
    const reviewWindow = window as ReviewWindow;
    reviewWindow.__AGENT_GALAXY_BACKGROUND_REVIEW__ = {
      ready: Boolean(payload && metrics && !error),
      error: error || undefined,
      config,
      metrics,
      sourceSnapshotId: payload?.sourceSnapshotId,
      recordingState,
      recordingSavedPath: recordingSavedPath || undefined,
      recordingByteLength,
      recordingError: recordingError || undefined,
    };
  }, [
    config,
    error,
    metrics,
    payload,
    recordingByteLength,
    recordingError,
    recordingSavedPath,
    recordingState,
  ]);

  useEffect(() => {
    if (!payload || !config.recordSeconds) return;
    let active = true;
    const canvas = document.querySelector<HTMLCanvasElement>(".agent-galaxy-background__canvas");
    if (!canvas || typeof canvas.captureStream !== "function" || typeof MediaRecorder === "undefined") {
      setRecordingState("unsupported");
      return;
    }
    const stream = canvas.captureStream(30);
    const mimeType = [
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
    ].find((candidate) => MediaRecorder.isTypeSupported(candidate));
    if (!mimeType) {
      setRecordingState("unsupported");
      return;
    }
    const chunks: BlobPart[] = [];
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: config.quality === "high" ? 8_000_000 : 5_000_000,
      });
    } catch (reason) {
      setRecordingError(reason instanceof Error ? reason.message : "media-recorder-construction-failed");
      setRecordingState("error");
      return;
    }
    const timeout = window.setTimeout(() => {
      if (!active) return;
      if (recorder.state === "recording") recorder.stop();
    }, config.recordSeconds * 1000);
    recorder.addEventListener("dataavailable", (event) => {
      if (active && event.data.size > 0) chunks.push(event.data);
    });
    recorder.addEventListener("stop", async () => {
      if (!active) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      const blob = new Blob(chunks, { type: mimeType });
      setRecordingUrl(URL.createObjectURL(blob));
      setRecordingByteLength(blob.size);
      if (blob.size < MIN_RECORDING_BYTES) {
        setRecordingError(`recording-blob-too-small:${blob.size}`);
        setRecordingState("error");
        for (const track of stream.getTracks()) track.stop();
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
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      setRecordingState("saving");
      for (const track of stream.getTracks()) track.stop();
      const filename = `agent-background-${config.preset}-${config.motionState}-${config.quality}.webm`;
      fetch(`/__agent-background-recording?name=${encodeURIComponent(filename)}`, {
        method: "POST",
        headers: { "Content-Type": mimeType },
        body: blob,
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(`录屏保存失败：${response.status}`);
          }
          const result = await response.json() as { path?: string; byteLength?: number };
          if (result.byteLength !== blob.size) {
            throw new Error("录屏保存字节数不一致");
          }
          if (!active) return;
          setRecordingSavedPath(result.path ?? "");
          setRecordingState("ready");
        })
        .catch((reason) => {
          if (active) {
            setRecordingError(reason instanceof Error ? reason.message : "recording-save-failed");
            setRecordingState("error");
          }
        });
    }, { once: true });
    recorder.addEventListener("error", () => {
      if (active) {
        setRecordingError("media-recorder-error");
        setRecordingState("error");
      }
    }, { once: true });
    setRecordingState("recording");
    recorder.start();
    return () => {
      active = false;
      window.clearTimeout(timeout);
      if (recorder.state === "recording") recorder.stop();
      for (const track of stream.getTracks()) track.stop();
    };
  }, [config.quality, config.recordSeconds, payload]);

  useEffect(() => () => {
    if (recordingUrl) URL.revokeObjectURL(recordingUrl);
  }, [recordingUrl]);

  if (error) {
    return (
      <main className="agent-background-review agent-background-review--error" data-review-ready="false">
        <p>AGENT GALAXY REVIEW</p>
        <h1>载荷未就绪</h1>
        <pre>{error}</pre>
      </main>
    );
  }

  if (!payload) {
    return (
      <main className="agent-background-review agent-background-review--loading" data-review-ready="false">
        <span className="agent-background-review__loading-mark" aria-hidden="true" />
        <p>正在校验理论星图派生载荷</p>
      </main>
    );
  }

  return (
    <main
      className={`agent-background-review agent-background-review--${config.preset}`}
      data-review-ready={metrics ? "true" : "false"}
      data-review-preset={config.preset}
      data-review-motion={config.motionState}
      data-review-quality={metrics?.quality ?? config.quality}
      data-source-snapshot={payload.sourceSnapshotId}
    >
      <AgentGalaxyBackgroundCanvas
        payload={payload}
        preset={config.preset}
        motionState={config.motionState}
        quality={config.quality}
        reducedMotion={reducedMotion}
        fixedTimeSeconds={config.fixedTimeSeconds}
        onMetrics={handleMetrics}
      />

      <header className="agent-background-review__header">
        <div>
          <p>{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
          <span>{copy.description}</span>
        </div>
        <dl>
          <div>
            <dt>状态</dt>
            <dd>{config.motionState}</dd>
          </div>
          <div>
            <dt>质量</dt>
            <dd>{metrics?.quality ?? config.quality}</dd>
          </div>
          <div>
            <dt>时间</dt>
            <dd>{config.fixedTimeSeconds === undefined ? "实时" : `${config.fixedTimeSeconds}s 固定`}</dd>
          </div>
        </dl>
      </header>

      <section className="agent-background-review__agent-safe-zone" aria-label="Agent 对话安全区域预览">
        <p>RESEARCH AGENT</p>
        <div className="agent-background-review__prompt">
          <span>询问一篇论文、一个热点，或描述你想探索的研究问题</span>
          <b aria-hidden="true">↗</b>
        </div>
        <small>本地论文库 · {payload.sourcePaperCount.toLocaleString()} 篇 · 联网按需启用</small>
      </section>

      <footer className="agent-background-review__footer">
        <div>
          <span>源快照</span>
          <strong>{payload.sourceSnapshotId}</strong>
        </div>
        <div>
          <span>代理</span>
          <strong>{payload.hotspots.length} 热点 · {metrics?.visiblePaperProxyCount ?? payload.papers.length} 论文</strong>
        </div>
        <div>
          <span>性能</span>
          <strong>
            {formatMetric(metrics?.averageFps ?? 0, " FPS")} · {formatMetric(metrics?.p95FrameMs ?? 0, " ms P95")}
          </strong>
        </div>
        <div>
          <span>展示规则</span>
          <strong>装饰星尘与能量丝已标记</strong>
        </div>
      </footer>

      <output className="agent-background-review__readiness" aria-live="polite">
        {metrics ? "READY" : "PREPARING"}
      </output>

      <output className="agent-background-review__diagnostics" aria-label="Agent 背景性能诊断">
        {JSON.stringify({
          viewport,
          config,
          metrics,
          sourceSnapshotId: payload.sourceSnapshotId,
          sourcePaperCount: payload.sourcePaperCount,
          sourceHotspotCount: payload.sourceHotspotCount,
          recordingState,
          recordingSavedPath: recordingSavedPath || undefined,
          recordingByteLength,
          recordingError: recordingError || undefined,
        })}
      </output>

      {config.recordSeconds ? (
        <aside className="agent-background-review__recording" data-recording-state={recordingState}>
          {recordingState === "recording" ? `正在录制 ${config.recordSeconds} 秒` : null}
          {recordingState === "saving" ? "正在保存录屏" : null}
          {recordingState === "ready" && recordingUrl ? (
            <a
              href={recordingUrl}
              download={`agent-background-${config.preset}-${config.motionState}-${config.quality}.webm`}
            >
              保存录屏
            </a>
          ) : null}
          {recordingState === "unsupported" ? "当前 WebView 不支持画布录制" : null}
          {recordingState === "error" ? "录制失败" : null}
        </aside>
      ) : null}
    </main>
  );
}
