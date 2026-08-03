import {
  Archive,
  ArrowLeft,
  Atom,
  BookOpen,
  Check,
  ChevronRight,
  Crosshair,
  ExternalLink,
  Eye,
  History,
  Maximize2,
  MessageSquareText,
  Minimize2,
  MoreHorizontal,
  Orbit,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Sparkles,
  Square,
  Trash2,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type CSSProperties,
} from "react";

import type {
  AgentImmersiveBackgroundPayloadV2,
  AiSettings,
  App17GalaxyPayload,
  Hotspot,
  Paper,
  Project,
} from "../types";
import {
  getPapersByIds,
  getV20GalaxyPayload,
  loadAgentImmersiveBackground,
  resolveAgentDualFocusScene,
} from "../lib/desktop";
import {
  createIdleAgentDualFocusRuntime,
  normalizeAgentDualFocusIntent,
  validateAgentDualFocusScene,
  type AgentDualFocusIntent,
  type AgentDualFocusPresentation,
  type AgentDualFocusRelation,
  type AgentDualFocusRuntimeSnapshot,
} from "../lib/agentDualFocus";
import type {
  AgentGalaxyFocusIntent,
} from "../lib/agentGalaxyFlowContract";
import {
  agentImmersiveLayoutVersion,
  type AgentImmersiveStyle,
} from "../lib/agentImmersiveStarRiver";
import {
  buildSideraCarouselWindow,
  chooseSideraFallbackSide,
  isSideraMessageFocusReady,
  membershipLabel,
  normalizeSideraReferences,
  resolveSideraInitialIndex,
  resolveSideraFocusComposition,
  type SideraAnswerEntityReference,
  type SideraAnswerResolution,
  type SideraAssistantMessage,
  type SideraConversationTurn,
  type SideraFocusSession,
  type SideraFocusComposition,
  type SideraResolvedReference,
} from "../lib/sideraFocus";
import type {
  SideraConversationSummary,
} from "../lib/sideraConversations";
import type {
  SideraSessionStats,
  SideraToolApprovalRequest,
} from "../lib/sideraPi";
import type {
  AgentTheoryReturnProgressSnapshot,
  GalaxyCameraPose,
} from "./App17GalaxyCanvas";
import {
  AgentImmersiveStarfieldCanvas,
  type AgentImmersiveFlowCheckpointV1,
  type AgentImmersiveFlowMetrics,
} from "./AgentImmersiveStarfieldCanvas";
import {
  AgentTheoryBackgroundCanvas,
  type AgentTheoryNavigationRequest,
  type AgentTheoryNavigationSnapshot,
} from "./AgentTheoryBackgroundCanvas";
import { SideraMarkdown } from "./SideraMarkdown";
import "./AgentDualBackgroundPage.css";

export type {
  SideraAnswerEntityReference,
  SideraAssistantMessage,
  SideraConversationTurn,
} from "../lib/sideraFocus";

export type AgentBackgroundMode = "immersive" | "theory";

export type AgentBackgroundSessionState = {
  mode: AgentBackgroundMode;
  immersiveSeed: string;
  immersiveElapsedSeconds: number;
  immersiveStyle?: AgentImmersiveStyle;
  theoryCameraPose?: GalaxyCameraPose;
};

export type AgentPromptSubmitEvent = {
  text: string;
  backgroundMode: AgentBackgroundMode;
  submittedAtMs: number;
};

export type SideraShellPresentation = "agent" | "workbench" | "suspended";

type AgentDualBackgroundPageProps = {
  settings: AiSettings;
  activeProject: Project;
  hotspots?: Hotspot[];
  onOpenRunCenter?: () => void;
  navigationOpen?: boolean;
  onCloseNavigation?: () => void;
  onPromptSubmit?: (event: AgentPromptSubmitEvent) => void;
  conversationTurns?: SideraConversationTurn[];
  conversationGenerating?: boolean;
  conversationError?: string;
  conversations?: SideraConversationSummary[];
  activeConversationId?: string;
  conversationLoading?: boolean;
  sessionStats?: SideraSessionStats | null;
  toolApproval?: SideraToolApprovalRequest | null;
  onNewConversation?: () => void;
  onSelectConversation?: (conversationId: string) => void;
  onRenameConversation?: (conversationId: string, title: string) => void;
  onArchiveConversation?: (conversationId: string) => void;
  onRestoreConversation?: (conversationId: string) => void;
  onDeleteConversation?: (conversationId: string) => void;
  onDecideToolApproval?: (decision: "approved" | "rejected") => void;
  onStopGeneration?: () => void;
  onOpenSettings?: () => void;
  onOpenPaperDetail?: (paperId: string, title?: string) => void;
  onOpenHotspotDetail?: (hotspotId: string) => void;
  onInitialReady?: () => void;
  onInitialError?: (message: string) => void;
  forceStaticBackground?: boolean;
  shellPresentation?: SideraShellPresentation;
};

const MODE_STORAGE_KEY = "research-agent:background-mode:v2";
const IMMERSIVE_STYLE_STORAGE_KEY = "research-agent:immersive-style:v1";
const SESSION_SEED_STORAGE_KEY = "research-agent:immersive-session-seed:v2";
const SIDERA_SESSION_STORAGE_PREFIX = "research-agent:sidera-session:v1";

function readBackgroundMode(): AgentBackgroundMode {
  try {
    return window.localStorage.getItem(MODE_STORAGE_KEY) === "theory"
      ? "theory"
      : "immersive";
  } catch {
    return "immersive";
  }
}

function readImmersiveStyle(): AgentImmersiveStyle {
  try {
    return window.localStorage.getItem(IMMERSIVE_STYLE_STORAGE_KEY) === "random-field"
      ? "random-field"
      : "star-river";
  } catch {
    return "star-river";
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

function float32ToBase64(values: Float32Array) {
  const bytes = new Uint8Array(values.buffer, values.byteOffset, values.byteLength);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, Math.min(bytes.length, offset + chunkSize));
    binary += String.fromCharCode(...chunk);
  }
  return window.btoa(binary);
}

function base64ToFloat32(value: string) {
  const binary = window.atob(value);
  if (binary.length % Float32Array.BYTES_PER_ELEMENT !== 0) {
    throw new Error("invalid-flow-checkpoint-byte-length");
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Float32Array(bytes.buffer);
}

function readFlowCheckpoint(
  key: string,
  sessionSeed: string,
): AgentImmersiveFlowCheckpointV1 | undefined {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return undefined;
    const stored = JSON.parse(raw) as {
      sessionSeed?: string;
      style?: AgentImmersiveStyle;
      layoutVersion?: string;
      stepIndex?: number;
      textureWidth?: number;
      textureHeight?: number;
      positions?: string;
      velocities?: string;
      backend?: "gpgpu" | "analytic-fallback";
    };
    if (
      stored.sessionSeed !== sessionSeed
      || !Number.isFinite(stored.stepIndex)
      || !Number.isFinite(stored.textureWidth)
      || !Number.isFinite(stored.textureHeight)
      || typeof stored.positions !== "string"
      || typeof stored.velocities !== "string"
    ) {
      return undefined;
    }
    return {
      sessionSeed,
      style: stored.style,
      layoutVersion: stored.layoutVersion,
      stepIndex: Math.max(0, Math.floor(stored.stepIndex ?? 0)),
      textureWidth: Math.max(1, Math.floor(stored.textureWidth ?? 1)),
      textureHeight: Math.max(1, Math.floor(stored.textureHeight ?? 1)),
      positions: base64ToFloat32(stored.positions),
      velocities: base64ToFloat32(stored.velocities),
      backend: stored.backend,
    };
  } catch {
    return undefined;
  }
}

function writeFlowCheckpoint(
  key: string,
  checkpoint: AgentImmersiveFlowCheckpointV1,
) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify({
      sessionSeed: checkpoint.sessionSeed,
      style: checkpoint.style,
      layoutVersion: checkpoint.layoutVersion,
      stepIndex: checkpoint.stepIndex,
      textureWidth: checkpoint.textureWidth,
      textureHeight: checkpoint.textureHeight,
      positions: float32ToBase64(checkpoint.positions),
      velocities: float32ToBase64(checkpoint.velocities),
      backend: checkpoint.backend,
    }));
  } catch {
    // The in-memory checkpoint remains available for the current mounted page.
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

function parseFocusEntityIds(value: string) {
  return value
    .split(/[\s,，;；]+/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

type StoredSideraSession = {
  messageId: string;
  entityId: string;
  side: "left" | "right";
  backgroundMode: AgentBackgroundMode;
  dialogCollapsed: boolean;
  devMessages: SideraAssistantMessage[];
};

function readStoredSideraSession(key: string): StoredSideraSession | null {
  try {
    const value = JSON.parse(
      window.sessionStorage.getItem(key) ?? "null",
    ) as StoredSideraSession | null;
    if (
      !value
      || typeof value.messageId !== "string"
      || typeof value.entityId !== "string"
      || (value.side !== "left" && value.side !== "right")
      || (value.backgroundMode !== "immersive" && value.backgroundMode !== "theory")
      || !Array.isArray(value.devMessages)
    ) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

function writeStoredSideraSession(
  key: string,
  value: StoredSideraSession | null,
) {
  try {
    if (!value) {
      window.sessionStorage.removeItem(key);
      return;
    }
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Session continuity is best effort and must not block the starfield.
  }
}

function compactText(value: string | undefined, maximumLength: number) {
  const normalized = value?.replace(/\s+/gu, " ").trim() ?? "";
  if (normalized.length <= maximumLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maximumLength - 1)).trimEnd()}…`;
}

function referenceLabel(reference: SideraAnswerEntityReference) {
  return reference.kind === "paper" ? "论文" : "热点";
}

function assistantStatusLabel(message: SideraAssistantMessage) {
  if (message.status === "cancelled") return "已停止";
  if (message.status === "interrupted") return "异常退出时已中断";
  if (message.status === "failed") return "回答失败";
  if (message.status !== "streaming") return "回答完成";
  switch (message.toolStage) {
    case "reading-library-overview": return "正在读取本地文献库概况";
    case "searching-local-papers": return "正在检索本地文献";
    case "reading-evidence": return "正在读取证据";
    case "reading-files": return "正在读取文件";
    case "reading-web": return "正在读取网页";
    case "awaiting-tool-approval": return "等待工具审批";
    case "using-tools": return "正在使用工具";
    case "synthesizing": return "正在组织回答";
    default: return "回答中";
  }
}

export function AgentDualBackgroundPage({
  settings,
  activeProject,
  hotspots = [],
  onOpenRunCenter,
  navigationOpen = false,
  onCloseNavigation,
  onPromptSubmit,
  conversationTurns = [],
  conversationGenerating = false,
  conversationError = "",
  conversations = [],
  activeConversationId,
  conversationLoading = false,
  sessionStats,
  toolApproval,
  onNewConversation,
  onSelectConversation,
  onRenameConversation,
  onArchiveConversation,
  onRestoreConversation,
  onDeleteConversation,
  onDecideToolApproval,
  onStopGeneration,
  onOpenSettings,
  onOpenPaperDetail,
  onOpenHotspotDetail,
  onInitialReady,
  onInitialError,
  forceStaticBackground = false,
  shellPresentation = "agent",
}: AgentDualBackgroundPageProps) {
  const developmentFixturesEnabled = useMemo(() => {
    if (!import.meta.env.DEV) return false;
    const review = new URLSearchParams(window.location.search).get("visual-review") ?? "";
    return review.startsWith("agent-") || review === "agent";
  }, []);
  const projectKey = `${settings.databaseDir}\u0000${activeProject.id}`;
  const sessionSeed = useMemo(createSessionSeed, []);
  const elapsedStorageKeys = useMemo(() => ({
    "random-field": `research-agent:immersive-elapsed:v2:${activeProject.id}:${sessionSeed}`,
    "star-river": `research-agent:immersive-elapsed:star-river-v1:${activeProject.id}:${sessionSeed}`,
  }), [activeProject.id, sessionSeed]);
  const flowCheckpointStorageKeys = useMemo(() => ({
    "random-field": `research-agent:immersive-flow-checkpoint:v1:${activeProject.id}:${sessionSeed}`,
    "star-river": `research-agent:immersive-flow-checkpoint:star-river-v1:${activeProject.id}:${sessionSeed}`,
  }), [activeProject.id, sessionSeed]);
  const flowFallbackStorageKey = useMemo(
    () => `research-agent:immersive-flow-fallback:v1:${activeProject.id}:${sessionSeed}`,
    [activeProject.id, sessionSeed],
  );
  const theoryPoseStorageKey = useMemo(
    () => `research-agent:theory-pose:v3-agent-depth:${activeProject.id}`,
    [activeProject.id],
  );
  const sideraSessionStorageKey = useMemo(
    () => `${SIDERA_SESSION_STORAGE_PREFIX}:${activeProject.id}`,
    [activeProject.id],
  );
  const storedSideraSession = useMemo(
    () => readStoredSideraSession(sideraSessionStorageKey),
    [sideraSessionStorageKey],
  );
  const initialMode = useMemo(readBackgroundMode, []);
  const initialImmersiveStyle = useMemo(readImmersiveStyle, []);
  const [preferredMode, setPreferredMode] =
    useState<AgentBackgroundMode>(initialMode);
  const [immersiveStyle, setImmersiveStyle] =
    useState<AgentImmersiveStyle>(initialImmersiveStyle);
  const [mountedMode, setMountedMode] =
    useState<AgentBackgroundMode | null>(null);
  const [mountedImmersiveStyle, setMountedImmersiveStyle] =
    useState<AgentImmersiveStyle | null>(null);
  const [immersivePayload, setImmersivePayload] =
    useState<AgentImmersiveBackgroundPayloadV2 | null>(null);
  const [theoryPayload, setTheoryPayload] =
    useState<App17GalaxyPayload | null>(null);
  const [immersiveElapsedByStyle, setImmersiveElapsedByStyle] = useState<
    Record<AgentImmersiveStyle, number>
  >(() => ({
    "random-field": readElapsedSeconds(elapsedStorageKeys["random-field"]),
    "star-river": readElapsedSeconds(elapsedStorageKeys["star-river"]),
  }));
  const [forceAnalyticFallback, setForceAnalyticFallback] = useState(() => {
    if (import.meta.env.DEV && new URLSearchParams(window.location.search).get("flowBackend") === "analytic") {
      return true;
    }
    try {
      return window.sessionStorage.getItem(flowFallbackStorageKey) === "1";
    } catch {
      return false;
    }
  });
  const [immersiveMetrics, setImmersiveMetrics] =
    useState<AgentImmersiveFlowMetrics | null>(null);
  const [maskVisible, setMaskVisible] = useState(true);
  const [switching, setSwitching] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [exploreTheory, setExploreTheory] = useState(false);
  const [theoryReturnActive, setTheoryReturnActive] = useState(false);
  const [theoryReturnPhase, setTheoryReturnPhase] = useState<
    AgentTheoryReturnProgressSnapshot["phase"]
  >("idle");
  const [theoryNavigation, setTheoryNavigation] =
    useState<AgentTheoryNavigationSnapshot>({
      level: "overview",
      explorationState: "overview",
      paperFocusState: "idle",
      transitioning: false,
    });
  const [theoryNavigationRequest, setTheoryNavigationRequest] =
    useState<AgentTheoryNavigationRequest>({
      kind: "return-overview",
      nonce: 0,
    });
  const [resetTheoryNonce, setResetTheoryNonce] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [devAssistantMessages, setDevAssistantMessages] =
    useState<SideraAssistantMessage[]>(() => (
      developmentFixturesEnabled ? storedSideraSession?.devMessages ?? [] : []
    ));
  const visibleConversationTurns = useMemo<SideraConversationTurn[]>(
    () => [
      ...conversationTurns,
      ...(developmentFixturesEnabled
        ? devAssistantMessages.map((assistant, index) => ({
            id: assistant.id,
            submittedAtMs: index,
            userText: "开发评审：聚焦指定的真实论文或热点。",
            assistant,
          }))
        : []),
    ],
    [conversationTurns, devAssistantMessages, developmentFixturesEnabled],
  );
  const visibleAssistantMessages = useMemo(
    () => visibleConversationTurns.map((turn) => turn.assistant),
    [visibleConversationTurns],
  );
  const [answerResolutions, setAnswerResolutions] =
    useState<Record<string, SideraAnswerResolution>>({});
  const [focusSession, setFocusSession] =
    useState<SideraFocusSession | null>(null);
  const [focusPresentation, setFocusPresentation] =
    useState<AgentDualFocusPresentation | null>(null);
  const [focusRuntime, setFocusRuntime] =
    useState<AgentDualFocusRuntimeSnapshot>(() => (
      createIdleAgentDualFocusRuntime(initialMode)
    ));
  const [focusPanelOpen, setFocusPanelOpen] = useState(false);
  const [focusEntityKind, setFocusEntityKind] =
    useState<AgentGalaxyFocusIntent["kind"]>("paper");
  const [focusEntityId, setFocusEntityId] =
    useState("project-default:openalex:W2582012066");
  const [focusEvidenceInput, setFocusEvidenceInput] = useState("");
  const [dialogCollapsed, setDialogCollapsed] = useState(
    () => visibleConversationTurns.length === 0
      ? true
      : storedSideraSession?.dialogCollapsed ?? false,
  );
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyTab, setHistoryTab] = useState<"active" | "archived">("active");
  const [historyQuery, setHistoryQuery] = useState("");
  const filteredConversations = useMemo(() => {
    const query = historyQuery.trim().toLocaleLowerCase();
    return conversations.filter((conversation) => (
      conversation.status === historyTab
      && (!query || conversation.title.toLocaleLowerCase().includes(query))
    ));
  }, [conversations, historyQuery, historyTab]);
  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId) ?? null,
    [activeConversationId, conversations],
  );
  const [allObjectsMessageId, setAllObjectsMessageId] = useState("");
  const [focusPaperDetail, setFocusPaperDetail] = useState<Paper | null>(null);
  const [focusPaperDetailStatus, setFocusPaperDetailStatus] =
    useState<"idle" | "loading" | "ready" | "missing" | "error">("idle");
  const [pendingExploreAfterFocus, setPendingExploreAfterFocus] = useState(false);
  const focusPaperPresets = useMemo(() => {
    const sampled = immersivePayload?.papers[0]?.id;
    const sampledIds = new Set(
      immersivePayload?.papers.map((paper) => paper.id) ?? [],
    );
    const unsampledPaper = theoryPayload?.papers.find((paper) => (
      !sampledIds.has(paper.rawPaperId)
      && !sampledIds.has(paper.scopedPaperId)
    ));
    return {
      sampled,
      unsampled: unsampledPaper?.scopedPaperId ?? unsampledPaper?.rawPaperId,
    };
  }, [immersivePayload, theoryPayload]);
  const focusHotspotPresets = useMemo(() => {
    const hotspots = immersivePayload?.hotspots.slice().sort((left, right) => (
      left.paperCount - right.paperCount || left.id.localeCompare(right.id)
    )) ?? [];
    if (!hotspots.length) return [];
    return [
      { label: "small hotspot", hotspot: hotspots[0] },
      {
        label: "medium hotspot",
        hotspot: hotspots[Math.floor((hotspots.length - 1) / 2)],
      },
      { label: "large hotspot", hotspot: hotspots[hotspots.length - 1] },
    ];
  }, [immersivePayload]);
  const focusRevisionRef = useRef(0);
  const focusReleaseTimerRef = useRef(0);
  const answerResolutionRevisionRef = useRef(new Map<string, number>());
  const historyRef = useRef<HTMLDivElement | null>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const historyNearBottomRef = useRef(true);
  const previousTurnCountRef = useRef(visibleConversationTurns.length);
  const restoredSideraSessionRef = useRef(false);
  const devMessageSequenceRef = useRef(0);
  const immersivePayloadRef = useRef(immersivePayload);
  const theoryPayloadRef = useRef(theoryPayload);
  const theoryPoseRef = useRef<GalaxyCameraPose | undefined>(
    readTheoryCameraPose(theoryPoseStorageKey),
  );

  useEffect(() => {
    setHistoryOpen(false);
    setHistoryQuery("");
    setDialogCollapsed(conversationTurns.length === 0);
  }, [activeConversationId]);
  const immersiveStyleRef = useRef<AgentImmersiveStyle>(initialImmersiveStyle);
  const flowCheckpointRefs = useRef<Record<
    AgentImmersiveStyle,
    AgentImmersiveFlowCheckpointV1 | undefined
  >>({
    "random-field": readFlowCheckpoint(
      flowCheckpointStorageKeys["random-field"],
      sessionSeed,
    ),
    "star-river": readFlowCheckpoint(
      flowCheckpointStorageKeys["star-river"],
      sessionSeed,
    ),
  });
  const mountedFlowCheckpointRef = useRef<
    AgentImmersiveFlowCheckpointV1 | undefined
  >(flowCheckpointRefs.current[initialImmersiveStyle]);
  const switchTokenRef = useRef(0);
  const revealTimerRef = useRef(0);
  const initialReadyReportedRef = useRef(false);
  const pageRef = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const evidenceCardRef = useRef<HTMLElement | null>(null);

  const measureFocusComposition = useCallback((
    preferredSide: "left" | "right" | undefined,
    fallbackSide: "left" | "right",
  ): SideraFocusComposition => {
    const page = pageRef.current;
    const dialog = dialogRef.current;
    const pageRect = page?.getBoundingClientRect();
    const dialogRect = dialog?.getBoundingClientRect();
    const viewportWidth = pageRect?.width ?? window.innerWidth;
    const viewportHeight = pageRect?.height ?? window.innerHeight;
    const titlebarHeight = page
      ? Number.parseFloat(
        window.getComputedStyle(page).getPropertyValue("--sidera-titlebar-height"),
      ) || 38
      : 38;
    const fallbackDialogWidth = Math.min(760, Math.max(560, viewportWidth * 0.42));
    const fallbackDialogHeight = Math.min(720, Math.max(182, viewportHeight * 0.58));
    const left = dialogRect
      ? dialogRect.left - (pageRect?.left ?? 0)
      : (viewportWidth - fallbackDialogWidth) * 0.5;
    const top = dialogRect
      ? dialogRect.top - (pageRect?.top ?? 0)
      : (viewportHeight - fallbackDialogHeight) * 0.5;
    const width = dialogRect?.width ?? fallbackDialogWidth;
    const height = dialogRect?.height ?? fallbackDialogHeight;
    return resolveSideraFocusComposition({
      viewportWidth,
      viewportHeight,
      titlebarHeight,
      dialogBounds: {
        left,
        top,
        right: left + width,
        bottom: top + height,
        width,
        height,
      },
      preferredSide,
      fallbackSide,
    });
  }, []);

  const resizeComposerTextarea = useCallback((textarea: HTMLTextAreaElement) => {
    textarea.style.height = "42px";
    const nextHeight = Math.min(100, Math.max(42, textarea.scrollHeight));
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > 100 ? "auto" : "hidden";
  }, []);

  useEffect(() => {
    const textarea = composerTextareaRef.current;
    if (textarea) resizeComposerTextarea(textarea);
  }, [draft, resizeComposerTextarea]);

  useEffect(() => {
    const history = historyRef.current;
    if (!history) return;
    const turnAdded = visibleConversationTurns.length > previousTurnCountRef.current;
    previousTurnCountRef.current = visibleConversationTurns.length;
    if (!turnAdded && !historyNearBottomRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      history.scrollTop = history.scrollHeight;
      historyNearBottomRef.current = true;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [visibleConversationTurns]);

  useEffect(() => {
    immersivePayloadRef.current = immersivePayload;
  }, [immersivePayload]);

  useEffect(() => {
    theoryPayloadRef.current = theoryPayload;
  }, [theoryPayload]);

  useEffect(() => {
    immersiveStyleRef.current = immersiveStyle;
  }, [immersiveStyle]);

  const saveElapsed = useCallback((style: AgentImmersiveStyle, value: number) => {
    const safeValue = Math.max(0, value);
    setImmersiveElapsedByStyle((current) => (
      Math.abs(current[style] - safeValue) <= 1e-6
        ? current
        : { ...current, [style]: safeValue }
    ));
    try {
      window.sessionStorage.setItem(elapsedStorageKeys[style], String(safeValue));
    } catch {
      // A blocked storage provider must not interrupt the starfield.
    }
  }, [elapsedStorageKeys]);

  const saveFlowCheckpoint = useCallback((style: AgentImmersiveStyle,
    checkpoint: AgentImmersiveFlowCheckpointV1,
  ) => {
    flowCheckpointRefs.current[style] = checkpoint;
    writeFlowCheckpoint(flowCheckpointStorageKeys[style], checkpoint);
  }, [flowCheckpointStorageKeys]);

  const lockAnalyticFallback = useCallback((reason: string) => {
    setForceAnalyticFallback(true);
    setImmersiveMetrics((current) => ({
      backend: "analytic-fallback",
      textureWidth: current?.textureWidth ?? 128,
      textureHeight: current?.textureHeight ?? 64,
      stepIndex: current?.stepIndex ?? 0,
      catchupSteps: current?.catchupSteps ?? 0,
      degradationReason: reason,
      boundaryTurnCount: current?.boundaryTurnCount ?? 0,
      visibleJumpCount: current?.visibleJumpCount ?? 0,
      checkpointRestoreErrorPx: current?.checkpointRestoreErrorPx ?? 0,
      contextLostCount: (current?.contextLostCount ?? 0) + 1,
    }));
    try {
      window.sessionStorage.setItem(flowFallbackStorageKey, "1");
    } catch {
      // The React state still prevents another GPGPU attempt in this session.
    }
  }, [flowFallbackStorageKey]);

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

  const resolveMessageReferences = useCallback(async (
    message: SideraAssistantMessage,
  ): Promise<SideraAnswerResolution> => {
    const references = normalizeSideraReferences(message.entityRefs);
    if (!isSideraMessageFocusReady(message) || references.length === 0) {
      const empty: SideraAnswerResolution = {
        status: "idle",
        entities: [],
        missing: [],
      };
      setAnswerResolutions((current) => ({ ...current, [message.id]: empty }));
      return empty;
    }
    const requestRevision = (
      answerResolutionRevisionRef.current.get(message.id) ?? 0
    ) + 1;
    answerResolutionRevisionRef.current.set(message.id, requestRevision);
    setAnswerResolutions((current) => ({
      ...current,
      [message.id]: {
        status: "resolving",
        entities: current[message.id]?.entities ?? [],
        missing: current[message.id]?.missing ?? [],
      },
    }));
    try {
      const identityPayload = await ensurePayload(
        "immersive",
      ) as AgentImmersiveBackgroundPayloadV2;
      const scene = await resolveAgentDualFocusScene({
        databaseDir: settings.databaseDir,
        projectId: activeProject.id,
        sourceSnapshotId: identityPayload.sourceSnapshotId,
        sampledPaperIds: identityPayload.papers.map((paper) => paper.id),
        primary: {
          kind: references[0].kind,
          entityId: references[0].entityId,
        },
        evidenceEntityIds: references
          .slice(1, 6)
          .map((reference) => reference.entityId),
        contextEntityIds: references
          .slice(6)
          .map((reference) => reference.entityId),
        relation: "answer-evidence",
      });
      if (
        answerResolutionRevisionRef.current.get(message.id) !== requestRevision
      ) {
        return {
          status: "failed",
          entities: [],
          missing: [],
          error: "SIDERA_STALE_RESOLUTION",
        };
      }
      const resolvedEntities = [
        scene.primary,
        ...scene.evidence,
        ...scene.context,
      ];
      const resolvedById = new Map(
        resolvedEntities.map((entity) => [entity.entityId, entity]),
      );
      const resolved = references.map((reference) => ({
        reference,
        entity: resolvedById.get(reference.entityId) ?? {
          kind: reference.kind,
          entityId: reference.entityId,
          membership: "missing" as const,
        },
      }));
      const result: SideraAnswerResolution = {
        status: "ready",
        entities: resolved.filter(({ entity }) => entity.membership !== "missing"),
        missing: resolved
          .filter(({ entity }) => entity.membership === "missing")
          .map(({ reference }) => reference),
      };
      setAnswerResolutions((current) => ({
        ...current,
        [message.id]: result,
      }));
      return result;
    } catch (error) {
      const result: SideraAnswerResolution = {
        status: "failed",
        entities: [],
        missing: [],
        error: error instanceof Error ? error.message : String(error),
      };
      if (
        answerResolutionRevisionRef.current.get(message.id) === requestRevision
      ) {
        setAnswerResolutions((current) => ({
          ...current,
          [message.id]: result,
        }));
      }
      return result;
    }
  }, [
    activeProject.id,
    ensurePayload,
    settings.databaseDir,
  ]);

  const presentSideraSession = useCallback((
    nextSession: SideraFocusSession,
    phase: "acquiring" | "retargeting",
  ) => {
    const current = nextSession.candidates[nextSession.currentIndex];
    if (!current) return;
    const revision = focusRevisionRef.current + 1;
    focusRevisionRef.current = revision;
    window.clearTimeout(focusReleaseTimerRef.current);
    const intent: AgentDualFocusIntent = normalizeAgentDualFocusIntent({
      revision,
      primary: {
        kind: current.entity.kind,
        entityId: current.entity.entityId,
        mode: "full-focus",
        reason: "citation-click",
      },
      evidenceEntityIds: [],
      contextEntityIds: [],
    });
    const scene = {
      primary: current.entity,
      evidence: [],
      context: [],
      relation: "answer-evidence" as AgentDualFocusRelation,
      sourceSnapshotId: current.entity.sourceSnapshotId
        ?? immersivePayloadRef.current?.sourceSnapshotId
        ?? "",
    };
    const validationError = validateAgentDualFocusScene(scene);
    if (validationError) {
      setFocusRuntime({
        ...createIdleAgentDualFocusRuntime(preferredMode),
        primaryId: current.entity.entityId,
        membership: current.entity.membership,
        resolutionError: validationError,
      });
      return;
    }
    const resolvedSession = {
      ...nextSession,
      backgroundMode: preferredMode,
      phase,
    };
    setFocusSession(resolvedSession);
    setFocusPresentation({
      intent,
      scene,
      releasing: false,
      productMode: "sidera-explicit",
      side: nextSession.side,
      composition: nextSession.composition,
      sideraPhase: phase,
    });
    setFocusRuntime({
      phase,
      backgroundMode: preferredMode,
      primaryId: current.entity.entityId,
      membership: current.entity.membership,
      progress: 0,
      contextSide: nextSession.side,
      targetBlend: phase === "retargeting" ? 1 : 0,
      cameraBlend: 0,
      backgroundDimBlend: phase === "retargeting" ? 1 : 0,
      infoBlend: 0,
    });
  }, [preferredMode]);

  const activateMessageFocus = useCallback(async (
    message: SideraAssistantMessage,
    selectedEntityId?: string,
  ) => {
    if (!isSideraMessageFocusReady(message)) return;
    setHistoryOpen(false);
    let resolution = answerResolutions[message.id];
    if (!resolution || resolution.status !== "ready") {
      setFocusRuntime({
        phase: "resolving",
        backgroundMode: preferredMode,
        primaryId: selectedEntityId,
        progress: 0,
      });
      resolution = await resolveMessageReferences(message);
    }
    if (resolution.status !== "ready" || resolution.entities.length === 0) {
      setFocusRuntime({
        ...createIdleAgentDualFocusRuntime(preferredMode),
        primaryId: selectedEntityId,
        resolutionError: resolution.error
          ?? "本回答没有可在当前文献库中聚焦的实体。",
      });
      return;
    }
    const candidates = buildSideraCarouselWindow(
      resolution.entities,
      selectedEntityId,
    );
    const selected = selectedEntityId
      ?? candidates[0]?.entity.entityId
      ?? "";
    const existingSide = focusSession?.messageId === message.id
      ? focusSession.side
      : undefined;
    const fallbackSide = chooseSideraFallbackSide(message.id, selected);
    const composition = measureFocusComposition(existingSide, fallbackSide);
    const side = composition.side;
    presentSideraSession({
      messageId: message.id,
      candidates,
      currentIndex: resolveSideraInitialIndex(candidates, selected),
      side,
      composition,
      backgroundMode: preferredMode,
      phase: focusSession ? "retargeting" : "acquiring",
    }, focusSession ? "retargeting" : "acquiring");
    setAllObjectsMessageId("");
  }, [
    answerResolutions,
    focusSession,
    measureFocusComposition,
    preferredMode,
    presentSideraSession,
    resolveMessageReferences,
  ]);

  useEffect(() => {
    const messageId = focusSession?.messageId;
    const side = focusSession?.side;
    if (!messageId || !side) return;
    const fallbackSide = chooseSideraFallbackSide(
      messageId,
      focusSession.candidates[focusSession.currentIndex]?.entity.entityId ?? messageId,
    );
    const updateComposition = () => {
      const composition = measureFocusComposition(side, fallbackSide);
      setFocusSession((current) => {
        if (!current || current.messageId !== messageId) return current;
        const previous = current.composition;
        if (
          Math.abs(previous.targetCenterPx[0] - composition.targetCenterPx[0]) < 0.25
          && Math.abs(previous.targetCenterPx[1] - composition.targetCenterPx[1]) < 0.25
          && Math.abs(previous.targetDiameterPx - composition.targetDiameterPx) < 0.25
          && Math.abs(previous.dialogGapPx - composition.dialogGapPx) < 0.25
        ) {
          return current;
        }
        return { ...current, composition };
      });
      setFocusPresentation((current) => (
        current ? { ...current, side: composition.side, composition } : current
      ));
    };
    updateComposition();
    const observer = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(updateComposition);
    if (pageRef.current) observer?.observe(pageRef.current);
    if (dialogRef.current) observer?.observe(dialogRef.current);
    if (evidenceCardRef.current) observer?.observe(evidenceCardRef.current);
    window.addEventListener("resize", updateComposition);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateComposition);
    };
  }, [
    focusSession?.currentIndex,
    focusSession?.messageId,
    focusSession?.side,
    measureFocusComposition,
  ]);

  const retargetFocus = useCallback((nextIndex: number) => {
    if (!focusSession) return;
    const bounded = Math.max(
      0,
      Math.min(focusSession.candidates.length - 1, nextIndex),
    );
    if (bounded === focusSession.currentIndex) return;
    presentSideraSession({
      ...focusSession,
      currentIndex: bounded,
      phase: "retargeting",
    }, "retargeting");
  }, [focusSession, presentSideraSession]);

  const releaseFocus = useCallback(() => {
    window.clearTimeout(focusReleaseTimerRef.current);
    focusRevisionRef.current += 1;
    setFocusSession((current) => (
      current ? { ...current, phase: "releasing" } : current
    ));
    setFocusPresentation((current) => (
      current ? { ...current, releasing: true } : current
    ));
    setFocusRuntime((current) => ({
      ...current,
      phase: current.primaryId ? "releasing" : "idle",
      progress: 0,
      resolutionError: undefined,
    }));
    focusReleaseTimerRef.current = window.setTimeout(() => {
      setFocusPresentation(null);
      setFocusSession(null);
      setFocusRuntime({
        ...createIdleAgentDualFocusRuntime(preferredMode),
        resolutionError: "SIDERA_FOCUS_RELEASE_TIMEOUT",
      });
    }, 10_000);
  }, [preferredMode]);

  const handleFocusRuntime = useCallback((
    snapshot: AgentDualFocusRuntimeSnapshot,
  ) => {
    if (snapshot.backgroundMode !== preferredMode) return;
    setFocusRuntime((current) => {
      if (
        current.primaryId
        && snapshot.primaryId
        && current.primaryId !== snapshot.primaryId
      ) return current;
      return {
        ...snapshot,
        backgroundMode: preferredMode,
      };
    });
    setFocusSession((current) => {
      if (
        !current
        || (
          snapshot.primaryId
          && current.candidates[current.currentIndex]?.entity.entityId
            !== snapshot.primaryId
        )
      ) return current;
      const phase = snapshot.phase === "hold"
        ? "hold"
        : snapshot.phase === "releasing"
          ? "releasing"
          : snapshot.phase === "retargeting"
            ? "retargeting"
            : snapshot.phase === "acquiring"
              ? "acquiring"
              : current.phase;
      return current.phase === phase ? current : { ...current, phase };
    });
    if (
      snapshot.phase === "idle"
      && focusPresentation
      && (
        !snapshot.primaryId
        || snapshot.primaryId === focusPresentation.scene.primary.entityId
      )
    ) {
      window.clearTimeout(focusReleaseTimerRef.current);
      setFocusPresentation(null);
      setFocusSession(null);
    }
  }, [focusPresentation, preferredMode]);

  useEffect(() => {
    visibleAssistantMessages.forEach((message) => {
      if (
        !isSideraMessageFocusReady(message)
        || answerResolutions[message.id]
      ) return;
      void resolveMessageReferences(message);
    });
  }, [
    answerResolutions,
    resolveMessageReferences,
    visibleAssistantMessages,
  ]);

  const activeResolvedReference = focusSession
    ?.candidates[focusSession.currentIndex];

  useEffect(() => {
    const entity = activeResolvedReference?.entity;
    if (!entity || entity.kind !== "paper") {
      setFocusPaperDetail(null);
      setFocusPaperDetailStatus("idle");
      return undefined;
    }
    let disposed = false;
    setFocusPaperDetail(null);
    setFocusPaperDetailStatus("loading");
    void getPapersByIds(
      settings.databaseDir,
      activeProject.id,
      [entity.entityId],
    ).then((papers) => {
      if (disposed) return;
      const paper = papers[0] ?? null;
      setFocusPaperDetail(paper);
      setFocusPaperDetailStatus(paper ? "ready" : "missing");
    }).catch(() => {
      if (disposed) return;
      setFocusPaperDetailStatus("error");
    });
    return () => {
      disposed = true;
    };
  }, [
    activeProject.id,
    activeResolvedReference?.entity.entityId,
    activeResolvedReference?.entity.kind,
    settings.databaseDir,
  ]);

  useEffect(() => {
    if (!focusSession || !activeResolvedReference) {
      if (!restoredSideraSessionRef.current && storedSideraSession) return;
      writeStoredSideraSession(sideraSessionStorageKey, null);
      return;
    }
    writeStoredSideraSession(sideraSessionStorageKey, {
      messageId: focusSession.messageId,
      entityId: activeResolvedReference.entity.entityId,
      side: focusSession.side,
      backgroundMode: preferredMode,
      dialogCollapsed,
      devMessages: developmentFixturesEnabled ? devAssistantMessages : [],
    });
  }, [
    activeResolvedReference,
    developmentFixturesEnabled,
    devAssistantMessages,
    dialogCollapsed,
    focusSession,
    preferredMode,
    sideraSessionStorageKey,
    storedSideraSession,
  ]);

  useEffect(() => {
    if (
      restoredSideraSessionRef.current
      || !storedSideraSession
      || focusPresentation
    ) return;
    const message = visibleAssistantMessages.find(
      (candidate) => candidate.id === storedSideraSession.messageId,
    );
    if (!message) {
      restoredSideraSessionRef.current = true;
      writeStoredSideraSession(sideraSessionStorageKey, null);
      return;
    }
    const resolution = answerResolutions[message.id];
    if (!resolution || resolution.status === "resolving") return;
    restoredSideraSessionRef.current = true;
    setDialogCollapsed(storedSideraSession.dialogCollapsed);
    void activateMessageFocus(message, storedSideraSession.entityId);
  }, [
    activateMessageFocus,
    answerResolutions,
    focusPresentation,
    sideraSessionStorageKey,
    storedSideraSession,
    visibleAssistantMessages,
  ]);

  const reportInitialReady = useCallback(() => {
    if (initialReadyReportedRef.current) return;
    initialReadyReportedRef.current = true;
    onInitialReady?.();
  }, [onInitialReady]);

  const revealRenderer = useCallback(() => {
    window.clearTimeout(revealTimerRef.current);
    revealTimerRef.current = window.setTimeout(() => {
      setMaskVisible(false);
      reportInitialReady();
      window.setTimeout(() => setSwitching(false), 220);
    }, 24);
  }, [reportInitialReady]);

  const mountBackground = useCallback(async (
    mode: AgentBackgroundMode,
    useCoverDelay: boolean,
    requestedImmersiveStyle: AgentImmersiveStyle = immersiveStyleRef.current,
  ) => {
    const token = ++switchTokenRef.current;
    setLoadError("");
    setSwitching(true);
    setMaskVisible(true);
    if (useCoverDelay) await delay(180);
    if (token !== switchTokenRef.current) return;
    setMountedMode(null);
    setMountedImmersiveStyle(null);
    await nextAnimationFrame();
    if (token !== switchTokenRef.current) return;
    try {
      await ensurePayload(mode);
      if (token !== switchTokenRef.current) return;
      if (mode === "immersive") {
        // Freeze the resume state for this renderer instance. The renderer
        // writes a newer checkpoint during cleanup; feeding that mutable ref
        // back as a live prop would retrigger the effect cleanup recursively.
        mountedFlowCheckpointRef.current = flowCheckpointRefs.current[
          requestedImmersiveStyle
        ];
      }
      setMountedImmersiveStyle(
        mode === "immersive" ? requestedImmersiveStyle : null,
      );
      setMountedMode(mode);
    } catch (error) {
      if (token !== switchTokenRef.current) return;
      const message = error instanceof Error ? error.message : "背景载荷读取失败。";
      setLoadError(message);
      setSwitching(false);
      setMaskVisible(false);
      onInitialError?.(message);
    }
  }, [ensurePayload, onInitialError]);

  useEffect(() => {
    if (forceStaticBackground) {
      switchTokenRef.current += 1;
      setMountedMode(null);
      setLoadError("");
      setSwitching(false);
      setMaskVisible(false);
      const readyTimer = window.setTimeout(reportInitialReady, 24);
      return () => window.clearTimeout(readyTimer);
    }
    immersivePayloadRef.current = null;
    theoryPayloadRef.current = null;
    setImmersivePayload(null);
    setTheoryPayload(null);
    setImmersiveElapsedByStyle({
      "random-field": readElapsedSeconds(elapsedStorageKeys["random-field"]),
      "star-river": readElapsedSeconds(elapsedStorageKeys["star-river"]),
    });
    flowCheckpointRefs.current = {
      "random-field": readFlowCheckpoint(
        flowCheckpointStorageKeys["random-field"],
        sessionSeed,
      ),
      "star-river": readFlowCheckpoint(
        flowCheckpointStorageKeys["star-river"],
        sessionSeed,
      ),
    };
    mountedFlowCheckpointRef.current = flowCheckpointRefs.current[
      immersiveStyleRef.current
    ];
    const forcedByReview = import.meta.env.DEV
      && new URLSearchParams(window.location.search).get("flowBackend") === "analytic";
    let sessionFallback = false;
    try {
      sessionFallback = window.sessionStorage.getItem(flowFallbackStorageKey) === "1";
    } catch {
      sessionFallback = false;
    }
    setForceAnalyticFallback(forcedByReview || sessionFallback);
    setImmersiveMetrics(null);
    theoryPoseRef.current = readTheoryCameraPose(theoryPoseStorageKey);
    setExploreTheory(false);
    setTheoryReturnActive(false);
    setTheoryReturnPhase("idle");
    setTheoryNavigation({
      level: "overview",
      explorationState: "overview",
      paperFocusState: "idle",
      transitioning: false,
    });
    if (shellPresentation !== "suspended") {
      void mountBackground(
        shellPresentation === "workbench" ? "immersive" : preferredMode,
        false,
        shellPresentation === "workbench" ? "star-river" : immersiveStyleRef.current,
      );
    }
    return () => {
      switchTokenRef.current += 1;
      window.clearTimeout(revealTimerRef.current);
      window.clearTimeout(focusReleaseTimerRef.current);
    };
    // `preferredMode` intentionally stays outside the dependency list: mode
    // changes are sequenced by `switchBackground` so two renderers never overlap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    elapsedStorageKeys,
    flowCheckpointStorageKeys,
    flowFallbackStorageKey,
    mountBackground,
    forceStaticBackground,
    projectKey,
    reportInitialReady,
    sessionSeed,
    theoryPoseStorageKey,
  ]);

  const previousShellPresentationRef = useRef(shellPresentation);
  useEffect(() => {
    if (previousShellPresentationRef.current === shellPresentation) return;
    previousShellPresentationRef.current = shellPresentation;
    if (forceStaticBackground) return;
    setMoreOpen(false);
    if (shellPresentation === "suspended") {
      switchTokenRef.current += 1;
      setMaskVisible(true);
      setMountedMode(null);
      setMountedImmersiveStyle(null);
      return;
    }
    const targetMode = shellPresentation === "workbench" ? "immersive" : preferredMode;
    const targetStyle = shellPresentation === "workbench"
      ? "star-river"
      : immersiveStyleRef.current;
    if (
      mountedMode === targetMode
      && (
        targetMode !== "immersive"
        || mountedImmersiveStyle === targetStyle
      )
    ) {
      setMaskVisible(false);
      setSwitching(false);
      return;
    }
    void mountBackground(
      targetMode,
      true,
      targetStyle,
    );
  }, [
    forceStaticBackground,
    mountBackground,
    mountedImmersiveStyle,
    mountedMode,
    preferredMode,
    shellPresentation,
  ]);

  const applyTheoryDialogExploreAmount = useCallback((amount: number) => {
    const page = pageRef.current;
    if (!page) return;
    const bounded = Math.max(0, Math.min(1, amount));
    page.style.setProperty(
      "--agent-return-dialog-top",
      `calc(${50 + bounded * 50}% - ${bounded * 21}px)`,
    );
    page.style.setProperty(
      "--agent-return-dialog-translate-y",
      `${-50 - bounded * 50}%`,
    );
    page.style.setProperty(
      "--agent-return-dialog-width",
      `${500 - bounded * 60}px`,
    );
    page.style.setProperty(
      "--agent-return-dialog-min-height",
      `${182 * (1 - bounded)}px`,
    );
    page.style.setProperty(
      "--agent-return-dialog-padding",
      `${18 * (1 - bounded)}px`,
    );
    page.style.setProperty(
      "--agent-return-dialog-radius",
      `${26 - bounded * 11}px`,
    );
    page.dataset.theoryReturnDialogExploreAmount = bounded.toFixed(6);
  }, []);

  useEffect(() => {
    if (!pendingExploreAfterFocus || focusPresentation) return;
    setPendingExploreAfterFocus(false);
    applyTheoryDialogExploreAmount(1);
    setExploreTheory(true);
  }, [
    applyTheoryDialogExploreAmount,
    focusPresentation,
    pendingExploreAfterFocus,
  ]);

  const beginTheoryExploreExit = useCallback(() => {
    if (!exploreTheory || theoryReturnActive) return;
    applyTheoryDialogExploreAmount(1);
    setTheoryReturnPhase("return-preparing");
    setTheoryReturnActive(true);
    setExploreTheory(false);
  }, [
    applyTheoryDialogExploreAmount,
    exploreTheory,
    theoryReturnActive,
  ]);

  const requestTheoryNavigation = useCallback((
    kind: AgentTheoryNavigationRequest["kind"],
  ) => {
    setTheoryNavigationRequest((current) => ({
      kind,
      nonce: current.nonce + 1,
    }));
  }, []);

  const handleTheoryReturnProgress = useCallback((
    snapshot: AgentTheoryReturnProgressSnapshot,
  ) => {
    if (snapshot.phase === "idle") {
      applyTheoryDialogExploreAmount(0);
      const page = pageRef.current;
      if (page) {
        page.dataset.theoryReturnCameraProgress = "0.000000";
        page.dataset.theoryReturnProgressError = "0.000000";
      }
      setTheoryReturnPhase("idle");
      setTheoryReturnActive(false);
      return;
    }
    setTheoryReturnPhase(snapshot.phase);
    setTheoryReturnActive(true);
    const cameraProgress = snapshot.phase === "return-preparing"
      ? 0
      : snapshot.progress;
    applyTheoryDialogExploreAmount(1 - cameraProgress);
    const page = pageRef.current;
    if (page) {
      const dialogProgress = 1 - Number(
        page.dataset.theoryReturnDialogExploreAmount ?? 1,
      );
      page.dataset.theoryReturnCameraProgress =
        cameraProgress.toFixed(6);
      page.dataset.theoryReturnProgressError = Math.abs(
        cameraProgress - dialogProgress,
      ).toFixed(6);
    }
  }, [applyTheoryDialogExploreAmount]);

  useEffect(() => {
    if (!exploreTheory && !focusPresentation && !navigationOpen) return undefined;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (navigationOpen) {
        onCloseNavigation?.();
      } else if (focusPresentation) {
        releaseFocus();
      } else if (theoryNavigation.level === "paper") {
        requestTheoryNavigation("return-system");
      } else if (theoryNavigation.level === "system") {
        requestTheoryNavigation("return-overview");
      } else {
        beginTheoryExploreExit();
      }
    };
    window.addEventListener("keydown", handleEscape, true);
    return () => window.removeEventListener("keydown", handleEscape, true);
  }, [
    beginTheoryExploreExit,
    exploreTheory,
    focusPresentation,
    navigationOpen,
    onCloseNavigation,
    releaseFocus,
    requestTheoryNavigation,
    theoryNavigation.level,
  ]);

  const switchBackground = async (mode: AgentBackgroundMode) => {
    if (mode === preferredMode || switching) return;
    setExploreTheory(false);
    setTheoryReturnActive(false);
    setTheoryReturnPhase("idle");
    setTheoryNavigation({
      level: "overview",
      explorationState: "overview",
      paperFocusState: "idle",
      transitioning: false,
    });
    setMoreOpen(false);
    setPreferredMode(mode);
    setFocusSession((current) => (
      current ? { ...current, backgroundMode: mode, phase: "acquiring" } : current
    ));
    setFocusRuntime((current) => (
      current.primaryId
        ? {
          ...current,
          phase: "acquiring",
          backgroundMode: mode,
          progress: 0,
        }
        : createIdleAgentDualFocusRuntime(mode)
    ));
    try {
      window.localStorage.setItem(MODE_STORAGE_KEY, mode);
    } catch {
      // The mode remains valid for the current session.
    }
    if (forceStaticBackground) return;
    await mountBackground(mode, true);
  };

  const switchImmersiveStyle = async (style: AgentImmersiveStyle) => {
    if (style === immersiveStyleRef.current || switching) return;
    immersiveStyleRef.current = style;
    setMoreOpen(false);
    setImmersiveStyle(style);
    setFocusSession((current) => (
      current ? { ...current, phase: "acquiring" } : current
    ));
    setFocusRuntime((current) => (
      current.primaryId
        ? { ...current, phase: "acquiring", progress: 0 }
        : current
    ));
    try {
      window.localStorage.setItem(IMMERSIVE_STYLE_STORAGE_KEY, style);
    } catch {
      // The in-memory selection remains valid for this session.
    }
    if (forceStaticBackground || preferredMode !== "immersive") return;
    await mountBackground("immersive", true, style);
  };

  const submitPrompt = () => {
    const text = draft.trim();
    if (!text || conversationGenerating) return;
    setDialogCollapsed(false);
    if (focusPresentation) releaseFocus();
    const event: AgentPromptSubmitEvent = {
      text,
      backgroundMode: preferredMode,
      submittedAtMs: Date.now(),
    };
    setDraft("");
    onPromptSubmit?.(event);
    if (preferredMode === "theory" && exploreTheory) {
      beginTheoryExploreExit();
    }
  };

  const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    submitPrompt();
  };

  const activeHotspotDetail = useMemo<Hotspot | null>(() => {
    const entity = activeResolvedReference?.entity;
    if (!entity) return null;
    const hotspotId = entity.kind === "hotspot"
      ? entity.entityId
      : entity.hotspotId;
    if (!hotspotId) return null;
    return hotspots.find((hotspot) => hotspot.id === hotspotId)
      ?? theoryPayload?.hotspotRecords?.find((hotspot) => (
      hotspot.id === hotspotId
    )) ?? null;
  }, [activeResolvedReference, hotspots, theoryPayload]);

  const focusedMessage = focusSession
    ? visibleAssistantMessages.find((message) => (
      message.id === focusSession.messageId
    ))
    : undefined;
  const allObjectsResolution = allObjectsMessageId
    ? answerResolutions[allObjectsMessageId]
    : undefined;

  const appendDevAnswerFixture = useCallback((
    status: SideraAssistantMessage["status"],
    overflow = false,
  ) => {
    const evidenceIds = parseFocusEntityIds(focusEvidenceInput);
    const fallbackPaperIds = immersivePayload?.papers
      .slice(0, overflow ? 10 : 5)
      .map((paper) => paper.id) ?? [];
    const hotspotIds = new Set(
      immersivePayload?.hotspots.map((hotspot) => hotspot.id) ?? [],
    );
    const requested = [
      focusEntityId.trim(),
      ...evidenceIds,
      ...(overflow ? fallbackPaperIds : []),
    ].filter(Boolean);
    const seen = new Set<string>();
    const entityRefs = requested
      .filter((entityId) => {
        if (seen.has(entityId)) return false;
        seen.add(entityId);
        return true;
      })
      .map<SideraAnswerEntityReference>((entityId, index) => ({
        kind: index === 0
          ? focusEntityKind
          : hotspotIds.has(entityId)
            ? "hotspot"
            : "paper",
        entityId,
        citationIndex: index + 1,
        mentionOrder: index,
        role: index === 0 ? "discussed" : "cited",
        relationSummary: index === 0
          ? "这是本回答重点讨论的研究对象。"
          : "该对象为本回答中的直接证据。",
      }));
    if (!entityRefs.length) return;
    const sequence = devMessageSequenceRef.current + 1;
    devMessageSequenceRef.current = sequence;
    const message: SideraAssistantMessage = {
      id: `sidera-dev-${Date.now()}-${sequence}`,
      status,
      markdown: status === "streaming"
        ? "正在依据本地文献证据组织回答。流式阶段不会操控背景……"
        : "基于当前本地文献库，以下对象构成本回答的核心证据。回答完成后，用户可以主动打开证据舞台逐项查看。",
      entityRefs,
    };
    setDevAssistantMessages((current) => [...current, message].slice(-8));
  }, [
    focusEntityId,
    focusEntityKind,
    focusEvidenceInput,
    immersivePayload,
  ]);

  const requestTheoryExplore = useCallback(() => {
    setHistoryOpen(false);
    if (focusPresentation) {
      setPendingExploreAfterFocus(true);
      releaseFocus();
      return;
    }
    applyTheoryDialogExploreAmount(1);
    setExploreTheory(true);
  }, [
    applyTheoryDialogExploreAmount,
    focusPresentation,
    releaseFocus,
  ]);

  const openFocusedDetail = useCallback(() => {
    const entity = activeResolvedReference?.entity;
    if (!entity) return;
    if (entity.kind === "paper") {
      onOpenPaperDetail?.(
        entity.entityId,
        focusPaperDetail?.title ?? entity.title,
      );
      return;
    }
    onOpenHotspotDetail?.(entity.entityId);
  }, [
    activeResolvedReference,
    focusPaperDetail?.title,
    onOpenHotspotDetail,
    onOpenPaperDetail,
  ]);

  const dialogExploreVisible = exploreTheory || theoryReturnActive;
  const dialogVisuallyCollapsed = dialogCollapsed && !dialogExploreVisible;

  return (
    <section
      ref={pageRef}
      className={[
        "agent-dual-page",
        `agent-dual-page--shell-${shellPresentation}`,
        exploreTheory ? "agent-dual-page--explore" : "",
        theoryReturnActive ? "agent-dual-page--returning" : "",
        focusPresentation ? "agent-dual-page--focus-active" : "",
        historyOpen ? "agent-dual-page--history-open" : "",
      ].filter(Boolean).join(" ")}
      data-background-mode={preferredMode}
      data-mounted-mode={mountedMode ?? "none"}
      data-immersive-style={immersiveStyle}
      data-mounted-immersive-style={mountedImmersiveStyle ?? "none"}
      data-shell-presentation={shellPresentation}
      data-immersive-layout-version={agentImmersiveLayoutVersion(immersiveStyle)}
      data-renderer-count={mountedMode ? 1 : 0}
      data-immersive-flow-backend={immersiveMetrics?.backend ?? "pending"}
      data-immersive-flow-degradation={immersiveMetrics?.degradationReason ?? ""}
      data-theory-return-phase={theoryReturnPhase}
      data-focus-phase={focusRuntime.phase}
      data-focus-primary={focusRuntime.primaryId ?? ""}
      data-focus-mode={focusPresentation ? "sidera-explicit" : ""}
      data-focus-membership={focusRuntime.membership ?? ""}
      data-focus-progress={focusRuntime.progress.toFixed(4)}
      data-focus-route-phase={focusRuntime.routePhase ?? ""}
      data-focus-target-blend={(focusRuntime.targetBlend ?? 0).toFixed(4)}
      data-focus-camera-blend={(focusRuntime.cameraBlend ?? 0).toFixed(4)}
      data-focus-background-dim={(
        focusRuntime.backgroundDimBlend ?? 0
      ).toFixed(4)}
      data-focus-info-blend={(focusRuntime.infoBlend ?? 0).toFixed(4)}
      data-sidera-session-message={focusSession?.messageId ?? ""}
      data-sidera-session-index={focusSession?.currentIndex ?? -1}
      data-sidera-session-count={focusSession?.candidates.length ?? 0}
      data-history-open={historyOpen ? "true" : "false"}
      data-dialog-collapsed={dialogVisuallyCollapsed ? "true" : "false"}
      data-sidera-focus-side={focusSession?.side ?? ""}
      data-sidera-focus-gap={focusSession?.composition.dialogGapPx ?? ""}
      data-sidera-focus-diameter={focusSession?.composition.targetDiameterPx ?? ""}
      data-sidera-dialog-collapsed={dialogVisuallyCollapsed ? "true" : "false"}
      style={{
        "--sidera-focus-dim": String(
          focusRuntime.backgroundDimBlend ?? 0,
        ),
        "--sidera-focus-x": `${(
          focusSession?.composition.normalizedAnchorX
          ?? (focusSession?.side === "left" ? 0.22 : 0.78)
        ) * 100}%`,
        "--sidera-focus-diameter": `${focusSession?.composition.targetDiameterPx ?? 200}px`,
      } as CSSProperties}
    >
      <div className="agent-dual-page__background" aria-hidden="true">
        {forceStaticBackground ? (
          <div className="agent-dual-page__static-background" />
        ) : null}
        {mountedMode === "immersive" && immersivePayload ? (
          <AgentImmersiveStarfieldCanvas
            payload={immersivePayload}
            style={mountedImmersiveStyle ?? immersiveStyle}
            elapsedSeconds={immersiveElapsedByStyle[
              mountedImmersiveStyle ?? immersiveStyle
            ]}
            initialCheckpoint={mountedFlowCheckpointRef.current}
            forceAnalyticFallback={forceAnalyticFallback}
            reducedMotion={window.matchMedia("(prefers-reduced-motion: reduce)").matches}
            motionScale={shellPresentation === "workbench" ? 0.2 : 1}
            onElapsedSecondsChange={(value) => saveElapsed(
              mountedImmersiveStyle ?? immersiveStyle,
              value,
            )}
            onCheckpoint={(checkpoint) => saveFlowCheckpoint(
              mountedImmersiveStyle ?? immersiveStyle,
              checkpoint,
            )}
            onMetrics={setImmersiveMetrics}
            focus={focusPresentation}
            onFocusRuntime={handleFocusRuntime}
            onBackendFallback={lockAnalyticFallback}
            onReady={revealRenderer}
            onFatalError={(message) => {
              setLoadError(message);
              setSwitching(false);
              setMaskVisible(false);
              onInitialError?.(message);
            }}
          />
        ) : null}
        {mountedMode === "theory" && theoryPayload ? (
          <AgentTheoryBackgroundCanvas
            payload={theoryPayload}
            interactionMode={exploreTheory ? "explore" : "ambient"}
            initialCameraPose={theoryPoseRef.current}
            resetToBestNonce={resetTheoryNonce}
            navigationRequest={theoryNavigationRequest}
            focus={focusPresentation}
            onFocusRuntime={handleFocusRuntime}
            onCameraPoseChange={(pose) => {
              if (
                focusPresentation
                || theoryNavigation.level !== "overview"
              ) {
                return;
              }
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
            onNavigationStateChange={setTheoryNavigation}
            onReturnProgress={handleTheoryReturnProgress}
            onReady={revealRenderer}
            onRuntimeError={(message) => {
              if (message.includes("外围视野未达到")) {
                theoryPoseRef.current = undefined;
                try {
                  window.sessionStorage.removeItem(theoryPoseStorageKey);
                } catch {
                  // A stale near-field pose is also ignored in memory.
                }
              }
              setLoadError(message);
              setSwitching(false);
              setMaskVisible(false);
              onInitialError?.(message);
            }}
          />
        ) : null}
        <div className="agent-dual-page__vignette" />
        <div className="agent-dual-page__focus-dim" />
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
          exploreTheory && theoryNavigation.level !== "overview" ? (
            <button
              type="button"
              title={theoryNavigation.level === "paper"
                ? theoryNavigation.paperFocusState === "entering"
                  ? "取消论文靠近"
                  : "返回热点星系"
                : "返回理论全图"}
              disabled={switching || theoryNavigation.transitioning}
              onClick={() => {
                requestTheoryNavigation(
                  theoryNavigation.level === "paper"
                    ? "return-system"
                    : "return-overview",
                );
              }}
            >
              <ArrowLeft size={15} />
              <span>
                {theoryNavigation.level === "paper"
                  ? theoryNavigation.paperFocusState === "entering"
                    ? "取消靠近"
                    : "返回星系"
                  : "返回全图"}
              </span>
            </button>
          ) : null
        ) : null}
        {preferredMode === "theory" ? (
          <button
            type="button"
            title={
              exploreTheory
                ? "退出探索布局"
                : theoryReturnActive
                  ? "返回探索布局"
                  : "探索理论星图"
            }
            disabled={switching}
            onClick={() => {
              if (exploreTheory) {
                beginTheoryExploreExit();
              } else if (theoryReturnActive) {
                applyTheoryDialogExploreAmount(1);
                setTheoryReturnPhase("idle");
                setTheoryReturnActive(false);
                setExploreTheory(true);
              } else {
                requestTheoryExplore();
              }
            }}
          >
            {exploreTheory ? <X size={15} /> : <Maximize2 size={15} />}
            <span>
              {exploreTheory
                ? "退出探索"
                : theoryReturnActive
                  ? "返回探索"
                  : "探索"}
            </span>
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
              {preferredMode === "immersive" ? (
                <div
                  className="agent-dual-page__immersive-style"
                  role="group"
                  aria-label="沉浸样式"
                >
                  <span>沉浸样式</span>
                  <div>
                    <button
                      type="button"
                      className={immersiveStyle === "star-river" ? "is-active" : ""}
                      aria-pressed={immersiveStyle === "star-river"}
                      onClick={() => void switchImmersiveStyle("star-river")}
                    >
                      流动星河
                    </button>
                    <button
                      type="button"
                      className={immersiveStyle === "random-field" ? "is-active" : ""}
                      aria-pressed={immersiveStyle === "random-field"}
                      onClick={() => void switchImmersiveStyle("random-field")}
                    >
                      随机星海
                    </button>
                  </div>
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  onOpenRunCenter?.();
                }}
              >
                <MessageSquareText size={15} />
                Agent 运行中心
              </button>
              {developmentFixturesEnabled ? (
                <button
                  type="button"
                  onClick={() => {
                    setMoreOpen(false);
                    setFocusPanelOpen((value) => !value);
                  }}
                >
                  <Crosshair size={15} />
                  聚焦调试
                </button>
              ) : null}
              {preferredMode === "theory" && exploreTheory ? (
                <button
                  type="button"
                  onClick={() => {
                    setMoreOpen(false);
                    setResetTheoryNonce((value) => value + 1);
                  }}
                >
                  <Orbit size={15} />
                  重置理论视图
                </button>
              ) : null}
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

      {developmentFixturesEnabled && focusPanelOpen ? (
        <aside className="agent-dual-focus-panel" aria-label="Sidera 证据聚焦调试">
          <header>
            <strong>Sidera fixtures</strong>
            <button
              type="button"
              title="关闭聚焦调试"
              onClick={() => setFocusPanelOpen(false)}
            >
              <X size={14} />
            </button>
          </header>
          <div className="agent-dual-focus-panel__presets">
            <button
              type="button"
              disabled={!focusPaperPresets.sampled}
              onClick={() => {
                setFocusEntityKind("paper");
                if (focusPaperPresets.sampled) {
                  setFocusEntityId(focusPaperPresets.sampled);
                }
              }}
            >
              sampled
            </button>
            <button
              type="button"
              disabled={!focusPaperPresets.unsampled}
              onClick={() => {
                setFocusEntityKind("paper");
                if (focusPaperPresets.unsampled) {
                  setFocusEntityId(focusPaperPresets.unsampled);
                }
              }}
            >
              unsampled
            </button>
            <button
              type="button"
              onClick={() => {
                setFocusEntityKind("paper");
                setFocusEntityId("fixture:active-only:paper-001");
              }}
            >
              active-only
            </button>
            <button
              type="button"
              onClick={() => {
                setFocusEntityKind("paper");
                setFocusEntityId("fixture:missing:paper-does-not-exist");
              }}
            >
              missing
            </button>
            {focusHotspotPresets.map(({ label, hotspot }) => (
              <button
                key={label}
                type="button"
                title={hotspot.id}
                onClick={() => {
                  setFocusEntityKind("hotspot");
                  setFocusEntityId(hotspot.id);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <label>
            <span>实体</span>
            <select
              value={focusEntityKind}
              onChange={(event) => setFocusEntityKind(
                event.target.value as AgentGalaxyFocusIntent["kind"],
              )}
            >
              <option value="paper">paper</option>
              <option value="hotspot">hotspot</option>
            </select>
          </label>
          <input
            value={focusEntityId}
            aria-label="聚焦实体 ID"
            onChange={(event) => setFocusEntityId(event.target.value)}
          />
          <input
            value={focusEvidenceInput}
            aria-label="证据实体 ID"
            placeholder="其他结构化实体 ID，以空格或逗号分隔"
            onChange={(event) => setFocusEvidenceInput(event.target.value)}
          />
          <div className="agent-dual-focus-panel__actions">
            <button
              type="button"
              onClick={() => appendDevAnswerFixture("complete")}
            >
              完整回答
            </button>
            <button
              type="button"
              onClick={() => appendDevAnswerFixture("streaming")}
            >
              流式回答
            </button>
            <button type="button" onClick={() => appendDevAnswerFixture("complete", true)}>
              溢出回答
            </button>
          </div>
          <div className="agent-dual-focus-panel__actions">
            <button
              type="button"
              disabled={!devAssistantMessages.some((message) => message.status === "streaming")}
              onClick={() => setDevAssistantMessages((current) => current.map((message) => (
                message.status === "streaming"
                  ? { ...message, status: "complete" }
                  : message
              )))}
            >
              完成流式
            </button>
            <button type="button" disabled={!focusPresentation} onClick={releaseFocus}>
              释放舞台
            </button>
          </div>
          <output>
            {[
              `phase=${focusRuntime.phase}`,
              `mode=${focusPresentation ? "explicit" : "idle"}`,
              `membership=${focusRuntime.membership ?? "pending"}`,
              `hotspot=${focusPresentation?.scene.primary.hotspotId ?? "-"}`,
              `vertex=${focusRuntime.targetVertexIndex ?? "-"}`,
              `slot=${focusRuntime.dynamicSlot ?? "-"}`,
              `side=${focusRuntime.contextSide ?? "-"}`,
              `camera=${focusRuntime.cameraState ?? "-"}`,
              `nav=${theoryNavigation.level}/${theoryNavigation.explorationState}/${theoryNavigation.paperFocusState}`,
              `progress=${focusRuntime.progress.toFixed(3)}`,
              focusRuntime.resolutionError
                ? `error=${focusRuntime.resolutionError}`
                : "",
            ].filter(Boolean).join(" · ")}
          </output>
        </aside>
      ) : null}

      {!dialogExploreVisible ? (
        <aside
          className="agent-conversation-drawer"
          aria-label="对话历史"
          aria-hidden={!historyOpen}
        >
          <header className="agent-conversation-drawer__header">
            <div>
              <strong>对话历史</strong>
              <small>{conversations.length} 个会话</small>
            </div>
            <button
              type="button"
              title="新对话"
              disabled={conversationLoading}
              onClick={onNewConversation}
            >
              <Plus size={15} />
            </button>
          </header>
          <label className="agent-conversation-drawer__search">
            <Search size={14} />
            <input
              value={historyQuery}
              onChange={(event) => setHistoryQuery(event.target.value)}
              placeholder="搜索标题"
              aria-label="搜索对话标题"
            />
          </label>
          <div className="agent-conversation-drawer__tabs" role="tablist" aria-label="对话状态">
            <button
              type="button"
              role="tab"
              aria-selected={historyTab === "active"}
              onClick={() => setHistoryTab("active")}
            >
              活动
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={historyTab === "archived"}
              onClick={() => setHistoryTab("archived")}
            >
              已归档
            </button>
          </div>
          <div className="agent-conversation-drawer__list" aria-busy={conversationLoading}>
            {conversationLoading ? <p className="agent-conversation-drawer__empty">正在读取会话…</p> : null}
            {!conversationLoading && filteredConversations.length === 0 ? (
              <p className="agent-conversation-drawer__empty">
                {historyQuery.trim() ? "没有匹配的会话。" : historyTab === "active" ? "暂无活动会话。" : "归档区为空。"}
              </p>
            ) : null}
            {filteredConversations.map((conversation) => (
              <article
                key={conversation.id}
                className={[
                  "agent-conversation-item",
                  conversation.id === activeConversationId ? "is-active" : "",
                ].filter(Boolean).join(" ")}
              >
                <button
                  type="button"
                  className="agent-conversation-item__open"
                  onClick={() => onSelectConversation?.(conversation.id)}
                >
                  <strong>{conversation.title}</strong>
                  <span>
                    {conversation.turnCount} 轮 · {new Date(conversation.updatedAtMs).toLocaleString("zh-CN", {
                      month: "numeric",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  {!conversation.contextAvailable && conversation.turnCount > 0 ? (
                    <small>上下文不可恢复</small>
                  ) : null}
                </button>
                <div className="agent-conversation-item__actions">
                  <button
                    type="button"
                    title="重命名"
                    onClick={() => {
                      const title = window.prompt("输入新的会话标题", conversation.title);
                      if (title?.trim() && title.trim() !== conversation.title) {
                        onRenameConversation?.(conversation.id, title);
                      }
                    }}
                  >
                    <Pencil size={12} />
                  </button>
                  {conversation.status === "active" ? (
                    <button
                      type="button"
                      title="归档"
                      onClick={() => onArchiveConversation?.(conversation.id)}
                    >
                      <Archive size={12} />
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        title="恢复"
                        onClick={() => onRestoreConversation?.(conversation.id)}
                      >
                        <RotateCcw size={12} />
                      </button>
                      <button
                        type="button"
                        title="永久删除"
                        onClick={() => onDeleteConversation?.(conversation.id)}
                      >
                        <Trash2 size={12} />
                      </button>
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
        </aside>
      ) : null}

      <main
        ref={dialogRef}
        className={[
          "agent-dual-dialog",
          dialogVisuallyCollapsed ? "agent-dual-dialog--collapsed" : "",
          historyOpen ? "agent-dual-dialog--history-open" : "",
        ].filter(Boolean).join(" ")}
        aria-label="Sidera 科研 Agent 输入区"
      >
        {!dialogExploreVisible && !dialogCollapsed ? (
          <>
            <header className="agent-dual-dialog__header">
              <span className="agent-dual-dialog__signal" />
              <div>
                <strong>Sidera</strong>
                <small>
                  {activeConversation?.title ?? "科研 Agent"} · {preferredMode === "immersive" ? "沉浸星海" : "理论星图"}
                  </small>
              </div>
              <div className="agent-dual-dialog__header-actions">
                <button
                  type="button"
                  className="agent-dual-dialog__history-toggle"
                  title={historyOpen ? "关闭历史" : "打开历史"}
                  aria-expanded={historyOpen}
                  onClick={() => {
                    if (!historyOpen && focusPresentation) releaseFocus();
                    setHistoryOpen((current) => !current);
                  }}
                >
                  <History size={14} />
                </button>
                <button
                  type="button"
                  className="agent-dual-dialog__new"
                  title="新对话"
                  disabled={conversationLoading}
                  onClick={onNewConversation}
                >
                  <Plus size={14} />
                </button>
                <button
                  type="button"
                  className="agent-dual-dialog__collapse"
                  title="收起对话"
                  onClick={() => {
                    setHistoryOpen(false);
                    setDialogCollapsed(true);
                  }}
                >
                  <Minimize2 size={14} />
                </button>
              </div>
            </header>
            <div
              ref={historyRef}
              className="agent-dual-dialog__history"
              aria-live="polite"
              onScroll={(event) => {
                const element = event.currentTarget;
                historyNearBottomRef.current = (
                  element.scrollHeight - element.scrollTop - element.clientHeight
                ) <= 48;
              }}
            >
              {!visibleConversationTurns.length ? (
                <p className="agent-dual-dialog__empty">
                  在本地文献空间中提出研究问题。
                </p>
              ) : null}
              {visibleConversationTurns.map((turn) => {
                const message = turn.assistant;
                const resolution = answerResolutions[message.id];
                const references = normalizeSideraReferences(message.entityRefs);
                const isActive = focusSession?.messageId === message.id;
                const activeCount = isActive ? focusSession.candidates.length : 0;
                return (
                  <section className="sidera-conversation-turn" key={turn.id} data-turn-id={turn.id}>
                    <div className="sidera-user-record">
                      <span>你</span>
                      <p>{turn.userText}</p>
                    </div>
                    <article
                      className={[
                        "sidera-answer",
                        isActive ? "is-focused" : "",
                      ].filter(Boolean).join(" ")}
                      data-message-status={message.status}
                      data-focus-ready={
                        resolution?.status === "ready"
                        && resolution.entities.length > 0
                          ? "true"
                          : "false"
                      }
                    >
                    <header>
                      <span>Sidera</span>
                      <small>
                        {message.status === "complete" && resolution?.status === "resolving"
                          ? "正在核验引用"
                          : assistantStatusLabel(message)}
                      </small>
                    </header>
                    <div className="sidera-answer__markdown">
                      {message.markdown ? <SideraMarkdown>{message.markdown}</SideraMarkdown> : null}
                    </div>
                    {references.length ? (
                      <div className="sidera-answer__citations" aria-label="结构化引用">
                        {references.map((reference) => {
                          const missing = resolution?.missing.some((candidate) => (
                            candidate.entityId === reference.entityId
                            && candidate.kind === reference.kind
                          ));
                          const resolved = resolution?.entities.some(({ entity }) => (
                            entity.entityId === reference.entityId
                            && entity.kind === reference.kind
                          ));
                          return (
                            <button
                              key={`${reference.kind}:${reference.entityId}`}
                              type="button"
                              title={missing ? "本地库未找到" : reference.relationSummary}
                              disabled={
                                message.status !== "complete"
                                || resolution?.status !== "ready"
                                || !resolved
                              }
                              onClick={() => void activateMessageFocus(
                                message,
                                reference.entityId,
                              )}
                            >
                              <span>[{reference.citationIndex ?? reference.mentionOrder + 1}]</span>
                              {missing
                                ? "本地库未找到"
                                : `${referenceLabel(reference)}证据`}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                    {message.status === "complete" && references.length > 0 ? (
                      <div className="sidera-answer__focus-controls">
                        {isActive && activeCount === 1 ? (
                          <button
                            type="button"
                            className="is-primary"
                            onClick={releaseFocus}
                          >
                            <X size={13} />
                            关闭
                          </button>
                        ) : isActive && activeCount > 1 ? (
                          <div className="sidera-answer__carousel">
                            {focusSession.currentIndex < activeCount - 1 ? (
                              <button
                                type="button"
                                className="is-primary"
                                title="下一颗"
                                onClick={() => retargetFocus(focusSession.currentIndex + 1)}
                              >
                                <ChevronRight size={14} />
                                下一颗
                              </button>
                            ) : null}
                            <button
                              type="button"
                              title="关闭证据舞台"
                              onClick={releaseFocus}
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="is-primary"
                            disabled={
                              resolution?.status !== "ready"
                              || resolution.entities.length === 0
                            }
                            onClick={() => void activateMessageFocus(message)}
                          >
                            <Crosshair size={13} />
                            {resolution?.status === "resolving"
                              ? "正在核验…"
                              : references[0]?.kind === "hotspot"
                                ? "聚焦该热点"
                                : "聚焦该论文"}
                          </button>
                        )}
                      </div>
                    ) : null}
                    {resolution?.status === "failed" ? (
                      <small className="sidera-answer__error">
                        引用解析失败：{resolution.error}
                      </small>
                    ) : null}
                    {message.status === "complete"
                    && message.citationStatus === "unverified" ? (
                      <small className="sidera-answer__error">
                        引用未通过结构化核验，当前回答不提供可点击引用或聚焦入口。
                      </small>
                      ) : null}
                    {message.evidenceGateStatus === "invalid" ? (
                      <small className="sidera-answer__error">
                        本轮证据未通过完成核验，未生成可点击引用或聚焦入口。
                      </small>
                    ) : null}
                    </article>
                  </section>
                );
              })}
            </div>
          </>
        ) : null}
        {toolApproval && !dialogExploreVisible ? (
          <section className="sidera-tool-approval" role="alert" aria-live="assertive">
            <header>
              <span>需要你的批准</span>
              <small>仅对本次工具调用有效</small>
            </header>
            <strong>{toolApproval.summary}</strong>
            {toolApproval.target ? <p>目标：{toolApproval.target}</p> : null}
            {toolApproval.command ? (
              <pre><code>{toolApproval.command}</code></pre>
            ) : null}
            {toolApproval.diffPreview ? (
              <details>
                <summary>查看差异预览</summary>
                <pre><code>{toolApproval.diffPreview}</code></pre>
              </details>
            ) : null}
            <div>
              <button type="button" onClick={() => onDecideToolApproval?.("rejected")}>
                <X size={13} />
                拒绝
              </button>
              <button
                type="button"
                className="is-primary"
                onClick={() => onDecideToolApproval?.("approved")}
              >
                <Check size={13} />
                仅批准本次
              </button>
            </div>
          </section>
        ) : null}
        <div className="agent-dual-dialog__composer">
          {dialogCollapsed && !dialogExploreVisible ? (
            <>
              <button
                type="button"
                className="agent-dual-dialog__history-toggle"
                title={historyOpen ? "关闭历史" : "打开历史"}
                aria-expanded={historyOpen}
                onClick={() => setHistoryOpen((current) => !current)}
              >
                <History size={14} />
              </button>
              <button
                type="button"
                className="agent-dual-dialog__restore"
                title="展开对话"
                onClick={() => setDialogCollapsed(false)}
              >
                <Eye size={14} />
              </button>
            </>
          ) : null}
          <textarea
            ref={composerTextareaRef}
            value={draft}
            rows={1}
            aria-label="输入研究问题"
            placeholder={dialogExploreVisible ? "在理论星图中输入问题…" : "输入研究问题，Shift + Enter 换行"}
            onChange={(event) => {
              setDraft(event.target.value);
              resizeComposerTextarea(event.currentTarget);
            }}
            onKeyDown={handleInputKeyDown}
          />
          <button
            type="button"
            title={conversationGenerating ? "停止生成" : "提交"}
            disabled={!conversationGenerating && !draft.trim()}
            onClick={conversationGenerating ? onStopGeneration : submitPrompt}
          >
            {conversationGenerating ? <Square size={14} /> : <Send size={15} />}
          </button>
        </div>
        {!dialogExploreVisible && !dialogCollapsed ? (
          <footer>
            <span className={conversationError ? "is-error" : ""}>
              {conversationError || (
                sessionStats
                  ? `上下文 ${sessionStats.contextUsage?.percent?.toFixed(0) ?? "—"}% · 输入 ${sessionStats.tokens.input} · 输出 ${sessionStats.tokens.output} · 缓存读取 ${sessionStats.tokens.cacheRead || "未检测到"}`
                  : "Pi 本地 RAG · 可审计文件与 HTTPS 工具 · 变更操作逐次审批"
              )}
            </span>
            {conversationError && onOpenSettings ? (
              <button type="button" onClick={onOpenSettings}>打开设置</button>
            ) : (
              <kbd>{conversationGenerating ? "生成中" : "Enter"}</kbd>
            )}
          </footer>
        ) : null}
      </main>

      {focusSession && activeResolvedReference ? (
        <aside
          ref={evidenceCardRef}
          className={[
            "sidera-evidence-card",
            focusSession.side === "left"
              ? "sidera-evidence-card--right"
              : "sidera-evidence-card--left",
          ].join(" ")}
          aria-label="Sidera 核心证据信息"
          data-entity-kind={activeResolvedReference.entity.kind}
          data-entity-id={activeResolvedReference.entity.entityId}
          style={{
            "--sidera-info-blend": String(
              focusRuntime.phase === "hold"
                ? 1
                : focusRuntime.infoBlend ?? 0,
            ),
            pointerEvents: (
              focusRuntime.phase === "hold"
              || (focusRuntime.infoBlend ?? 0) > 0.05
            ) ? "auto" : "none",
          } as CSSProperties}
        >
          <header>
            <span>
              {activeResolvedReference.entity.kind === "paper"
                ? <BookOpen size={15} />
                : <Atom size={15} />}
              {activeResolvedReference.entity.kind === "paper" ? "论文证据" : "研究热点"}
            </span>
            <small>{membershipLabel(activeResolvedReference.entity.membership)}</small>
          </header>
          <h2>
            {activeResolvedReference.entity.kind === "paper"
              ? focusPaperDetail?.title
                ?? activeResolvedReference.entity.title
                ?? activeResolvedReference.entity.entityId
              : activeHotspotDetail?.title
                ?? activeResolvedReference.entity.title
                ?? activeResolvedReference.entity.entityId}
          </h2>
          {activeResolvedReference.entity.kind === "paper" ? (
            <>
              <p className="sidera-evidence-card__meta">
                {[
                  focusPaperDetail?.authors,
                  focusPaperDetail?.year ?? activeResolvedReference.entity.year,
                  focusPaperDetail?.source,
                ].filter(Boolean).join(" · ") || "文献信息读取中"}
              </p>
              <p>
                {focusPaperDetailStatus === "loading"
                  ? "正在从本地论文库读取完整信息…"
                  : compactText(
                    focusPaperDetail?.abstract,
                    260,
                  ) || "当前论文暂无可用摘要。"}
              </p>
              <dl>
                <div>
                  <dt>所属热点</dt>
                  <dd>{activeHotspotDetail?.title ?? activeResolvedReference.entity.hotspotId ?? "未分类"}</dd>
                </div>
              </dl>
            </>
          ) : (
            <>
              <p className="sidera-evidence-card__meta">
                {[
                  activeHotspotDetail?.field ?? activeResolvedReference.entity.field,
                  activeHotspotDetail ? `${activeHotspotDetail.paperCount} 篇论文` : undefined,
                  activeHotspotDetail?.trend,
                ].filter(Boolean).join(" · ")}
              </p>
              <p>{compactText(activeHotspotDetail?.summary, 240) || "当前热点暂无摘要。"}</p>
              {activeHotspotDetail?.keywords.length ? (
                <div className="sidera-evidence-card__keywords">
                  {activeHotspotDetail.keywords.slice(0, 6).map((keyword) => (
                    <span key={keyword}>{keyword}</span>
                  ))}
                </div>
              ) : null}
            </>
          )}
          <blockquote>
            {activeResolvedReference.reference.relationSummary
              || focusedMessage?.markdown
              || "该对象与当前回答直接相关。"}
          </blockquote>
          <div className="sidera-evidence-card__actions">
            <button
              type="button"
              disabled={
                activeResolvedReference.entity.kind === "paper"
                  ? !onOpenPaperDetail
                  : !onOpenHotspotDetail
              }
              onClick={openFocusedDetail}
            >
              <ExternalLink size={13} />
              打开完整详情
            </button>
            {preferredMode === "immersive" ? (
              <button type="button" onClick={() => void switchBackground("theory")}>
                <Orbit size={13} />
                查看语义位置
              </button>
            ) : null}
          </div>
        </aside>
      ) : null}

      {allObjectsMessageId && allObjectsResolution?.status === "ready" ? (
        <div className="sidera-object-browser" role="dialog" aria-modal="true">
          <button
            type="button"
            className="sidera-object-browser__scrim"
            aria-label="关闭全部对象"
            onClick={() => setAllObjectsMessageId("")}
          />
          <section>
            <header>
              <div>
                <strong>本回答涉及的对象</strong>
                <small>{allObjectsResolution.entities.length} 个本地实体</small>
              </div>
              <button type="button" onClick={() => setAllObjectsMessageId("")}>
                <X size={15} />
              </button>
            </header>
            <div>
              {allObjectsResolution.entities.map(({ entity, reference }) => (
                <button
                  key={`${entity.kind}:${entity.entityId}`}
                  type="button"
                  onClick={() => {
                    const message = visibleAssistantMessages.find((candidate) => (
                      candidate.id === allObjectsMessageId
                    ));
                    if (message) {
                      void activateMessageFocus(message, entity.entityId);
                    }
                  }}
                >
                  <span>{referenceLabel(reference)}</span>
                  <strong>{entity.title ?? entity.entityId}</strong>
                  <small>{reference.relationSummary}</small>
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {loadError ? (
        <div className="agent-dual-page__error" role="alert">
          <strong>
            {preferredMode === "theory"
              ? "理论背景渲染失败"
              : "沉浸背景渲染失败"}
          </strong>
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
