import {
  ArrowLeft,
  Maximize2,
  MessageSquareText,
  MoreHorizontal,
  Orbit,
  RefreshCw,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

import type {
  AgentImmersiveBackgroundPayloadV2,
  AiSettings,
  App17GalaxyPayload,
  Project,
} from "../types";
import {
  getV20GalaxyPayload,
  loadAgentImmersiveBackground,
} from "../lib/desktop";
import type { GalaxyCameraPose } from "./App17GalaxyCanvas";
import { AgentImmersiveStarfieldCanvas } from "./AgentImmersiveStarfieldCanvas";
import { AgentTheoryBackgroundCanvas } from "./AgentTheoryBackgroundCanvas";
import "./AgentDualBackgroundPage.css";

export type AgentBackgroundMode = "immersive" | "theory";

export type AgentBackgroundSessionState = {
  mode: AgentBackgroundMode;
  immersiveSeed: string;
  immersiveElapsedSeconds: number;
  theoryCameraPose?: GalaxyCameraPose;
};

export type AgentPromptSubmitEvent = {
  text: string;
  backgroundMode: AgentBackgroundMode;
  submittedAtMs: number;
};

type AgentDualBackgroundPageProps = {
  settings: AiSettings;
  activeProject: Project;
  advancedWorkspace: ReactNode;
  onPromptSubmit?: (event: AgentPromptSubmitEvent) => void;
};

const MODE_STORAGE_KEY = "research-agent:background-mode:v2";
const SESSION_SEED_STORAGE_KEY = "research-agent:immersive-session-seed:v2";

function readBackgroundMode(): AgentBackgroundMode {
  try {
    return window.localStorage.getItem(MODE_STORAGE_KEY) === "theory"
      ? "theory"
      : "immersive";
  } catch {
    return "immersive";
  }
}

function createSessionSeed() {
  if (import.meta.env.DEV) {
    const fixedSeed = new URLSearchParams(window.location.search)
      .get("immersiveSeed")
      ?.trim();
    if (fixedSeed) return fixedSeed;
  }
  try {
    const existing = window.sessionStorage.getItem(SESSION_SEED_STORAGE_KEY);
    if (existing) return existing;
    const values = new Uint32Array(4);
    window.crypto.getRandomValues(values);
    const seed = Array.from(values, (value) => value.toString(16).padStart(8, "0"))
      .join("");
    window.sessionStorage.setItem(SESSION_SEED_STORAGE_KEY, seed);
    return seed;
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
}

function readElapsedSeconds(key: string) {
  try {
    const value = Number(window.sessionStorage.getItem(key));
    return Number.isFinite(value) && value >= 0 ? value : 0;
  } catch {
    return 0;
  }
}

function readTheoryCameraPose(key: string): GalaxyCameraPose | undefined {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return undefined;
    const pose = JSON.parse(raw) as GalaxyCameraPose;
    if (
      !Array.isArray(pose.center)
      || pose.center.length !== 3
      || !pose.center.every(Number.isFinite)
      || !Number.isFinite(pose.distance)
      || !Number.isFinite(pose.azimuth)
      || !Number.isFinite(pose.elevation)
    ) {
      return undefined;
    }
    return pose;
  } catch {
    return undefined;
  }
}

function nextAnimationFrame() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

export function AgentDualBackgroundPage({
  settings,
  activeProject,
  advancedWorkspace,
  onPromptSubmit,
}: AgentDualBackgroundPageProps) {
  const projectKey = `${settings.databaseDir}\u0000${activeProject.id}`;
  const sessionSeed = useMemo(createSessionSeed, []);
  const elapsedStorageKey = useMemo(
    () => `research-agent:immersive-elapsed:v2:${activeProject.id}:${sessionSeed}`,
    [activeProject.id, sessionSeed],
  );
  const theoryPoseStorageKey = useMemo(
    () => `research-agent:theory-pose:v2:${activeProject.id}`,
    [activeProject.id],
  );
  const initialMode = useMemo(readBackgroundMode, []);
  const [preferredMode, setPreferredMode] =
    useState<AgentBackgroundMode>(initialMode);
  const [mountedMode, setMountedMode] =
    useState<AgentBackgroundMode | null>(null);
  const [immersivePayload, setImmersivePayload] =
    useState<AgentImmersiveBackgroundPayloadV2 | null>(null);
  const [theoryPayload, setTheoryPayload] =
    useState<App17GalaxyPayload | null>(null);
  const [immersiveElapsedSeconds, setImmersiveElapsedSeconds] = useState(
    () => readElapsedSeconds(elapsedStorageKey),
  );
  const [maskVisible, setMaskVisible] = useState(true);
  const [switching, setSwitching] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [exploreTheory, setExploreTheory] = useState(false);
  const [resetTheoryNonce, setResetTheoryNonce] = useState(0);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [submittedPrompts, setSubmittedPrompts] =
    useState<AgentPromptSubmitEvent[]>([]);
  const immersivePayloadRef = useRef(immersivePayload);
  const theoryPayloadRef = useRef(theoryPayload);
  const theoryPoseRef = useRef<GalaxyCameraPose | undefined>(
    readTheoryCameraPose(theoryPoseStorageKey),
  );
  const switchTokenRef = useRef(0);
  const revealTimerRef = useRef(0);

  useEffect(() => {
    immersivePayloadRef.current = immersivePayload;
  }, [immersivePayload]);

  useEffect(() => {
    theoryPayloadRef.current = theoryPayload;
  }, [theoryPayload]);

  const saveElapsed = useCallback((value: number) => {
    const safeValue = Math.max(0, value);
    setImmersiveElapsedSeconds(safeValue);
    try {
      window.sessionStorage.setItem(elapsedStorageKey, String(safeValue));
    } catch {
      // A blocked storage provider must not interrupt the starfield.
    }
  }, [elapsedStorageKey]);

  const ensurePayload = useCallback(async (mode: AgentBackgroundMode) => {
    if (mode === "immersive") {
      const cached = immersivePayloadRef.current;
      if (cached?.sessionSeed === sessionSeed) return cached;
      const payload = await loadAgentImmersiveBackground({
        databaseDir: settings.databaseDir,
        projectId: activeProject.id,
        sessionSeed,
        paperCount: 6_000,
      });
      immersivePayloadRef.current = payload;
      setImmersivePayload(payload);
      return payload;
    }
    const cached = theoryPayloadRef.current;
    if (cached?.ready) return cached;
    const payload = await getV20GalaxyPayload({
      databaseDir: settings.databaseDir,
      projectId: activeProject.id,
      mode: "galaxy",
    });
    if (!payload.ready) {
      throw new Error(payload.message || "理论星图快照尚未就绪。");
    }
    theoryPayloadRef.current = payload;
    setTheoryPayload(payload);
    return payload;
  }, [activeProject.id, sessionSeed, settings.databaseDir]);

  const revealRenderer = useCallback(() => {
    window.clearTimeout(revealTimerRef.current);
    revealTimerRef.current = window.setTimeout(() => {
      setMaskVisible(false);
      window.setTimeout(() => setSwitching(false), 220);
    }, 24);
  }, []);

  const mountBackground = useCallback(async (
    mode: AgentBackgroundMode,
    useCoverDelay: boolean,
  ) => {
    const token = ++switchTokenRef.current;
    setLoadError("");
    setSwitching(true);
    setMaskVisible(true);
    if (useCoverDelay) await delay(180);
    if (token !== switchTokenRef.current) return;
    setMountedMode(null);
    await nextAnimationFrame();
    if (token !== switchTokenRef.current) return;
    try {
      await ensurePayload(mode);
      if (token !== switchTokenRef.current) return;
      setMountedMode(mode);
    } catch (error) {
      if (token !== switchTokenRef.current) return;
      setLoadError(error instanceof Error ? error.message : "背景载荷读取失败。");
      setSwitching(false);
      setMaskVisible(false);
    }
  }, [ensurePayload]);

  useEffect(() => {
    immersivePayloadRef.current = null;
    theoryPayloadRef.current = null;
    setImmersivePayload(null);
    setTheoryPayload(null);
    setImmersiveElapsedSeconds(readElapsedSeconds(elapsedStorageKey));
    theoryPoseRef.current = readTheoryCameraPose(theoryPoseStorageKey);
    setExploreTheory(false);
    setAdvancedOpen(false);
    void mountBackground(preferredMode, false);
    return () => {
      switchTokenRef.current += 1;
      window.clearTimeout(revealTimerRef.current);
    };
    // `preferredMode` intentionally stays outside the dependency list: mode
    // changes are sequenced by `switchBackground` so two renderers never overlap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    elapsedStorageKey,
    mountBackground,
    projectKey,
    theoryPoseStorageKey,
  ]);

  useEffect(() => {
    if (!exploreTheory) return undefined;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setExploreTheory(false);
    };
    window.addEventListener("keydown", handleEscape, true);
    return () => window.removeEventListener("keydown", handleEscape, true);
  }, [exploreTheory]);

  const switchBackground = async (mode: AgentBackgroundMode) => {
    if (mode === preferredMode || switching) return;
    setExploreTheory(false);
    setMoreOpen(false);
    setPreferredMode(mode);
    try {
      window.localStorage.setItem(MODE_STORAGE_KEY, mode);
    } catch {
      // The mode remains valid for the current session.
    }
    await mountBackground(mode, true);
  };

  const openAdvancedWorkspace = () => {
    switchTokenRef.current += 1;
    setMoreOpen(false);
    setExploreTheory(false);
    setMaskVisible(true);
    setMountedMode(null);
    setAdvancedOpen(true);
  };

  const closeAdvancedWorkspace = () => {
    setAdvancedOpen(false);
    void mountBackground(preferredMode, false);
  };

  const submitPrompt = () => {
    const text = draft.trim();
    if (!text) return;
    const event: AgentPromptSubmitEvent = {
      text,
      backgroundMode: preferredMode,
      submittedAtMs: Date.now(),
    };
    setSubmittedPrompts((current) => [...current, event].slice(-8));
    setDraft("");
    onPromptSubmit?.(event);
    if (preferredMode === "theory" && exploreTheory) {
      setExploreTheory(false);
      setResetTheoryNonce((value) => value + 1);
    }
  };

  const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    submitPrompt();
  };

  if (advancedOpen) {
    return (
      <section className="agent-dual-advanced">
        <header className="agent-dual-advanced__header">
          <button type="button" onClick={closeAdvancedWorkspace}>
            <ArrowLeft size={16} />
            返回 Agent 星空
          </button>
          <span>高级工作台</span>
        </header>
        <div className="agent-dual-advanced__body">{advancedWorkspace}</div>
      </section>
    );
  }

  return (
    <section
      className={`agent-dual-page ${exploreTheory ? "agent-dual-page--explore" : ""}`}
      data-background-mode={preferredMode}
      data-mounted-mode={mountedMode ?? "none"}
      data-renderer-count={mountedMode ? 1 : 0}
    >
      <div className="agent-dual-page__background" aria-hidden="true">
        {mountedMode === "immersive" && immersivePayload ? (
          <AgentImmersiveStarfieldCanvas
            payload={immersivePayload}
            elapsedSeconds={immersiveElapsedSeconds}
            reducedMotion={window.matchMedia("(prefers-reduced-motion: reduce)").matches}
            onElapsedSecondsChange={saveElapsed}
            onReady={revealRenderer}
            onFatalError={(message) => {
              setLoadError(message);
              setSwitching(false);
              setMaskVisible(false);
            }}
          />
        ) : null}
        {mountedMode === "theory" && theoryPayload ? (
          <AgentTheoryBackgroundCanvas
            payload={theoryPayload}
            interactionMode={exploreTheory ? "explore" : "ambient"}
            initialCameraPose={theoryPoseRef.current}
            resetToBestNonce={resetTheoryNonce}
            onCameraPoseChange={(pose) => {
              theoryPoseRef.current = pose;
              try {
                window.sessionStorage.setItem(
                  theoryPoseStorageKey,
                  JSON.stringify(pose),
                );
              } catch {
                // Camera persistence is session-only best effort.
              }
            }}
            onReady={revealRenderer}
          />
        ) : null}
        <div className="agent-dual-page__vignette" />
      </div>

      <div
        className={`agent-dual-page__switch-mask ${maskVisible ? "is-visible" : ""}`}
        aria-hidden="true"
      />

      <div className="agent-dual-page__controls">
        <button
          type="button"
          title={preferredMode === "immersive" ? "切换到理论背景" : "切换到沉浸背景"}
          disabled={switching}
          onClick={() => void switchBackground(
            preferredMode === "immersive" ? "theory" : "immersive",
          )}
        >
          {preferredMode === "immersive" ? <Orbit size={15} /> : <Sparkles size={15} />}
          <span>{preferredMode === "immersive" ? "理论" : "沉浸"}</span>
        </button>
        {preferredMode === "theory" ? (
          <button
            type="button"
            title={exploreTheory ? "退出探索布局" : "探索理论星图"}
            disabled={switching}
            onClick={() => setExploreTheory((value) => !value)}
          >
            {exploreTheory ? <X size={15} /> : <Maximize2 size={15} />}
            <span>{exploreTheory ? "退出探索" : "探索"}</span>
          </button>
        ) : null}
        <div className="agent-dual-page__more">
          <button
            type="button"
            title="更多"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((value) => !value)}
          >
            <MoreHorizontal size={16} />
          </button>
          {moreOpen ? (
            <div className="agent-dual-page__menu">
              <button type="button" onClick={openAdvancedWorkspace}>
                <MessageSquareText size={15} />
                高级工作台
              </button>
              <button
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  void mountBackground(preferredMode, true);
                }}
              >
                <RefreshCw size={15} />
                重新加载背景
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <main className="agent-dual-dialog" aria-label="Research Agent 输入区">
        {!exploreTheory ? (
          <>
            <header className="agent-dual-dialog__header">
              <span className="agent-dual-dialog__signal" />
              <div>
                <strong>Research Agent</strong>
                <small>
                  {preferredMode === "immersive" ? "Immersive field" : "Theory field"}
                </small>
              </div>
            </header>
            <div className="agent-dual-dialog__history" aria-live="polite">
              {submittedPrompts.length ? submittedPrompts.slice(-3).map((item) => (
                <p key={`${item.submittedAtMs}-${item.text}`}>
                  <span>你</span>
                  {item.text}
                </p>
              )) : (
                <p className="agent-dual-dialog__empty">
                  在本地文献空间中提出研究问题。
                </p>
              )}
            </div>
          </>
        ) : null}
        <div className="agent-dual-dialog__composer">
          <textarea
            value={draft}
            rows={exploreTheory ? 1 : 2}
            aria-label="输入研究问题"
            placeholder={exploreTheory ? "在理论星图中输入问题…" : "输入研究问题，Shift + Enter 换行"}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleInputKeyDown}
          />
          <button
            type="button"
            title="提交"
            disabled={!draft.trim()}
            onClick={submitPrompt}
          >
            <Send size={15} />
          </button>
        </div>
        {!exploreTheory ? (
          <footer>
            <span>本版仅记录提交；科研 Agent 回答后端尚未接入。</span>
            <kbd>Enter</kbd>
          </footer>
        ) : null}
      </main>

      {loadError ? (
        <div className="agent-dual-page__error" role="alert">
          <strong>星空暂时不可用</strong>
          <span>{loadError}</span>
          <button type="button" onClick={() => void mountBackground(preferredMode, false)}>
            <RefreshCw size={14} />
            重试
          </button>
        </div>
      ) : null}
    </section>
  );
}
