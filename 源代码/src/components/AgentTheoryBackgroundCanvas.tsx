import { useEffect, useMemo, useRef, useState } from "react";

import type { App17GalaxyPayload } from "../types";
import {
  sampleAgentDualFocusTimeline,
  type AgentDualFocusPresentation,
  type AgentDualFocusRuntimeSnapshot,
} from "../lib/agentDualFocus";
import {
  sampleSideraFocusTimeline,
  sideraSmootherstep,
} from "../lib/sideraFocus";
import {
  applyAgentTheoryDepthProfile,
  createAgentTheoryDepthProfile,
} from "../lib/agentTheoryDepth";
import {
  createAgentTheoryCruiseCheckpoint,
  createAgentTheoryPerimeterProfile,
  parseAgentTheoryCruiseCheckpoint,
  serializeAgentTheoryCruiseCheckpoint,
  type AgentTheoryCruiseCheckpointV1,
} from "../lib/agentTheoryPerimeter";
import {
  App17GalaxyCanvas,
  type App17GalaxyCommand,
  type AgentTheoryDepthDiagnostics,
  type AgentTheoryQuality,
  type AgentTheoryReturnProgressSnapshot,
  type AgentTheoryFocusVisualState,
  type GalaxyCameraPose,
  type GalaxyExplorationState,
  type GalaxyInteractionMode,
  type GalaxyPaperFocusState,
  type GalaxySystemViewMode,
} from "./App17GalaxyCanvas";

export type AgentTheoryNavigationLevel = "overview" | "system" | "paper";

export type AgentTheoryNavigationSnapshot = {
  level: AgentTheoryNavigationLevel;
  explorationState: GalaxyExplorationState;
  paperFocusState: GalaxyPaperFocusState;
  transitioning: boolean;
};

export type AgentTheoryNavigationRequest = {
  kind: "return-system" | "return-overview";
  nonce: number;
};

type AgentTheoryBackgroundCanvasProps = {
  payload: App17GalaxyPayload;
  interactionMode: GalaxyInteractionMode;
  initialCameraPose?: GalaxyCameraPose;
  resetToBestNonce: number;
  navigationRequest?: AgentTheoryNavigationRequest;
  focus?: AgentDualFocusPresentation | null;
  onFocusRuntime?: (snapshot: AgentDualFocusRuntimeSnapshot) => void;
  onCameraPoseChange: (pose: GalaxyCameraPose) => void;
  onNavigationStateChange?: (
    snapshot: AgentTheoryNavigationSnapshot,
  ) => void;
  onReturnProgress?: (
    snapshot: AgentTheoryReturnProgressSnapshot,
  ) => void;
  onReady: () => void;
  onRuntimeError: (message: string) => void;
};

export function AgentTheoryBackgroundCanvas({
  payload,
  interactionMode,
  initialCameraPose,
  resetToBestNonce,
  navigationRequest,
  focus,
  onFocusRuntime,
  onCameraPoseChange,
  onNavigationStateChange,
  onReturnProgress,
  onReady,
  onRuntimeError,
}: AgentTheoryBackgroundCanvasProps) {
  const [selectedHotspotId, setSelectedHotspotId] = useState("");
  const [selectedPaperId, setSelectedPaperId] = useState("");
  const [explorationState, setExplorationState] =
    useState<GalaxyExplorationState>("overview");
  const [systemViewMode, setSystemViewMode] =
    useState<GalaxySystemViewMode>("system");
  const [paperFocusState, setPaperFocusState] =
    useState<GalaxyPaperFocusState>("idle");
  const [command, setCommand] = useState<App17GalaxyCommand>({
    kind: "reset",
    nonce: 0,
  });
  const pendingBestResetRef = useRef(false);
  const previousResetNonceRef = useRef(resetToBestNonce);
  const previousNavigationNonceRef = useRef(
    navigationRequest?.nonce ?? 0,
  );
  const depthProfile = useMemo(
    () => createAgentTheoryDepthProfile(payload),
    [payload],
  );
  const displayPayload = useMemo(
    () => applyAgentTheoryDepthProfile(payload, depthProfile),
    [depthProfile, payload],
  );
  const perimeterProfile = useMemo(
    () => createAgentTheoryPerimeterProfile(displayPayload),
    [displayPayload],
  );
  const cruiseStorageKey = useMemo(
    () => (
      `research-agent:theory-cruise:${perimeterProfile.version}:`
      + `${payload.snapshotId ?? "unknown"}`
    ),
    [payload.snapshotId, perimeterProfile.version],
  );
  const sessionSeedStorageKey = (
    `research-agent:theory-cruise-seed:${payload.snapshotId ?? "unknown"}`
  );
  const legacySessionSeedStorageKey = (
    `research-agent:theory-cruise:agent-theory-perimeter-v1:`
    + `${payload.snapshotId ?? "unknown"}:seed`
  );
  const sessionSeed = useMemo(() => {
    try {
      const existing = window.sessionStorage.getItem(sessionSeedStorageKey)
        ?? window.sessionStorage.getItem(legacySessionSeedStorageKey);
      if (existing) {
        window.sessionStorage.setItem(sessionSeedStorageKey, existing);
        return existing;
      }
      const randomWords = new Uint32Array(4);
      window.crypto.getRandomValues(randomWords);
      const seed = Array.from(
        randomWords,
        (value) => value.toString(16).padStart(8, "0"),
      ).join("");
      window.sessionStorage.setItem(sessionSeedStorageKey, seed);
      return seed;
    } catch {
      return `${payload.snapshotId ?? "unknown"}:${Date.now().toString(36)}`;
    }
  }, [
    legacySessionSeedStorageKey,
    payload.snapshotId,
    sessionSeedStorageKey,
  ]);
  const initialCruiseCheckpoint = useMemo<AgentTheoryCruiseCheckpointV1>(() => {
    try {
      const restored = parseAgentTheoryCruiseCheckpoint(
        window.sessionStorage.getItem(cruiseStorageKey),
        sessionSeed,
      );
      if (restored) return restored;
    } catch {
      // Session cruise persistence is best effort.
    }
    return createAgentTheoryCruiseCheckpoint(perimeterProfile, sessionSeed);
  }, [cruiseStorageKey, perimeterProfile, sessionSeed]);
  const quality = useMemo<AgentTheoryQuality>(() => {
    if (!import.meta.env.DEV) return "balanced";
    return new URLSearchParams(window.location.search)
      .get("agentTheoryQuality") === "high"
      ? "high"
      : "balanced";
  }, []);
  const [depthDiagnostics, setDepthDiagnostics] =
    useState<AgentTheoryDepthDiagnostics | null>(null);
  const [focusVisual, setFocusVisual] =
    useState<AgentTheoryFocusVisualState | null>(null);
  const [focusCapturingCruise, setFocusCapturingCruise] = useState(false);
  const [focusRuntimeReady, setFocusRuntimeReady] = useState(false);
  const focusRevisionRef = useRef(-1);
  const focusCommandIssuedRevisionRef = useRef(-1);
  const focusStartedAtRef = useRef(0);
  const focusReleaseStartedAtRef = useRef(0);
  const focusInternallyReleasingRef = useRef(false);
  const focusOriginExploreRef = useRef(false);
  const focusSavedPoseRef = useRef<GalaxyCameraPose | undefined>(undefined);
  const latestCameraPoseRef = useRef<GalaxyCameraPose | undefined>(
    initialCameraPose,
  );
  const focusReturnPendingRef = useRef(false);
  const focusReturnSawActiveRef = useRef(false);
  const focusRestoreCommandedRef = useRef(false);
  const focusRuntimeReportedAtRef = useRef(0);
  const focusVisualUpdatedAtRef = useRef(0);
  const focusSignalCompletedRevisionRef = useRef(-1);
  const explicitRouteLastActionRef = useRef("");
  const explicitReleaseLastActionRef = useRef("");
  const explicitRouteReachedAtRef = useRef(0);
  const explicitSessionActiveRef = useRef(false);

  const issueCommand = (
    kind: App17GalaxyCommand["kind"],
    options?: Pick<
      App17GalaxyCommand,
      "focusMode" | "cameraPose" | "focusSide" | "focusAnchorNdcX"
    >,
  ) => {
    setCommand((current) => ({
      kind,
      nonce: current.nonce + 1,
      ...options,
    }));
  };

  useEffect(() => {
    if (previousResetNonceRef.current === resetToBestNonce) return;
    previousResetNonceRef.current = resetToBestNonce;
    setSelectedPaperId("");
    setSelectedHotspotId("");
    if (explorationState === "overview") {
      issueCommand("reset");
    } else {
      pendingBestResetRef.current = true;
      issueCommand("exit-system");
    }
  }, [explorationState, resetToBestNonce]);

  useEffect(() => {
    const nextNonce = navigationRequest?.nonce ?? 0;
    if (
      !navigationRequest
      || previousNavigationNonceRef.current === nextNonce
    ) return;
    previousNavigationNonceRef.current = nextNonce;
    if (navigationRequest.kind === "return-system") {
      issueCommand("return-system-center");
    } else if (navigationRequest.kind === "return-overview") {
      issueCommand("exit-system");
    }
  }, [navigationRequest]);

  useEffect(() => {
    if (!focus) {
      explicitSessionActiveRef.current = false;
      explicitRouteLastActionRef.current = "";
      explicitReleaseLastActionRef.current = "";
      explicitRouteReachedAtRef.current = 0;
      return undefined;
    }
    const revision = focus.intent.revision;
    if (focusRevisionRef.current === revision) {
      if (focus.releasing && !focusInternallyReleasingRef.current) {
        focusInternallyReleasingRef.current = true;
        focusReleaseStartedAtRef.current = performance.now();
      }
      return undefined;
    }
    const continuingExplicitSession = (
      focus.productMode === "sidera-explicit"
      && explicitSessionActiveRef.current
      && !focus.releasing
    );
    focusRevisionRef.current = revision;
    focusCommandIssuedRevisionRef.current = -1;
    focusStartedAtRef.current = performance.now();
    focusReleaseStartedAtRef.current = 0;
    focusInternallyReleasingRef.current = focus.releasing;
    if (!continuingExplicitSession) {
      focusOriginExploreRef.current = interactionMode === "explore";
      focusSavedPoseRef.current = latestCameraPoseRef.current;
      setFocusCapturingCruise(interactionMode !== "explore");
    }
    focusReturnPendingRef.current = false;
    focusReturnSawActiveRef.current = false;
    focusRestoreCommandedRef.current = false;
    focusSignalCompletedRevisionRef.current = -1;
    explicitRouteLastActionRef.current = "";
    explicitReleaseLastActionRef.current = "";
    explicitRouteReachedAtRef.current = 0;
    explicitSessionActiveRef.current = focus.productMode === "sidera-explicit";
    const primary = focus.scene.primary;
    if (focus.productMode !== "sidera-explicit") {
      if (primary.kind === "hotspot") {
        setSelectedHotspotId(primary.entityId);
        setSelectedPaperId("");
      } else {
        setSelectedHotspotId(primary.hotspotId ?? "");
        setSelectedPaperId(primary.entityId);
      }
    }
    return undefined;
  }, [focus, interactionMode]);

  useEffect(() => {
    if (
      !focusRuntimeReady
      || !focus
      || focus.releasing
      || focus.productMode === "sidera-explicit"
      || focusCommandIssuedRevisionRef.current === focus.intent.revision
    ) {
      return undefined;
    }
    const revision = focus.intent.revision;
    const commandTimer = window.setTimeout(() => {
      if (
        focusRevisionRef.current !== revision
        || focusCommandIssuedRevisionRef.current === revision
      ) {
        return;
      }
      focusCommandIssuedRevisionRef.current = revision;
      const primary = focus.scene.primary;
      if (
        focus.intent.primary.mode === "full-focus"
        && (primary.hotspotId || primary.kind === "hotspot")
      ) {
        issueCommand("enter-system");
      } else {
        issueCommand("agent-focus-overview", {
          focusMode: focus.intent.primary.mode,
          focusSide: focus.side,
          focusAnchorNdcX: focus.composition
            ? focus.composition.normalizedAnchorX * 2 - 1
            : undefined,
        });
      }
    }, 90);
    return () => window.clearTimeout(commandTimer);
  }, [focus, focusRuntimeReady]);

  useEffect(() => {
    if (
      !focusRuntimeReady
      || !focus
      || focus.releasing
      || focus.productMode !== "sidera-explicit"
    ) return;
    const primary = focus.scene.primary;
    const targetHotspotId = primary.kind === "hotspot"
      ? primary.entityId
      : primary.hotspotId ?? "";
    const issueRouteCommand = (
      key: string,
      kind: App17GalaxyCommand["kind"],
    ) => {
      const scopedKey = `${focus.intent.revision}:${key}`;
      if (explicitRouteLastActionRef.current === scopedKey) return;
      explicitRouteLastActionRef.current = scopedKey;
      issueCommand(kind, {
        focusSide: focus.side,
        focusAnchorNdcX: focus.composition
          ? focus.composition.normalizedAnchorX * 2 - 1
          : undefined,
      });
    };

    if (primary.kind === "paper" && !targetHotspotId) {
      if (selectedPaperId !== primary.entityId) {
        setSelectedPaperId(primary.entityId);
        setSelectedHotspotId("");
        return;
      }
      issueRouteCommand("active-only-overview", "agent-focus-overview");
      return;
    }

    const paperIsActive = (
      paperFocusState !== "idle"
      || systemViewMode === "paper-focus"
    );
    if (paperIsActive) {
      if (
        primary.kind === "paper"
        && selectedHotspotId === targetHotspotId
        && selectedPaperId === primary.entityId
      ) {
        if (
          paperFocusState === "entering"
          || paperFocusState === "focused"
          || systemViewMode === "paper-focus"
        ) {
          return;
        }
      }
      issueRouteCommand(
        `return-paper:${selectedPaperId}:${paperFocusState}`,
        "return-system-center",
      );
      return;
    }

    if (
      explorationState === "preparing"
      || explorationState === "entering"
      || explorationState === "exiting"
    ) return;

    if (explorationState === "system") {
      if (selectedHotspotId !== targetHotspotId) {
        issueRouteCommand(
          `exit-hotspot:${selectedHotspotId}:for:${targetHotspotId}`,
          "exit-system",
        );
        return;
      }
      if (primary.kind === "paper") {
        if (selectedPaperId !== primary.entityId) {
          setSelectedPaperId(primary.entityId);
          return;
        }
        issueRouteCommand(
          `focus-paper:${primary.entityId}`,
          "focus-paper",
        );
      }
      return;
    }

    if (selectedHotspotId !== targetHotspotId) {
      setSelectedHotspotId(targetHotspotId);
      return;
    }
    const targetPaperId = primary.kind === "paper" ? primary.entityId : "";
    if (selectedPaperId !== targetPaperId) {
      setSelectedPaperId(targetPaperId);
      return;
    }
    issueRouteCommand(`enter-hotspot:${targetHotspotId}`, "enter-system");
  }, [
    explorationState,
    focus,
    focusRuntimeReady,
    paperFocusState,
    selectedHotspotId,
    selectedPaperId,
    systemViewMode,
  ]);

  useEffect(() => {
    if (
      !focus
      || focus.releasing
      || focus.productMode === "sidera-explicit"
      || focus.intent.primary.mode !== "full-focus"
      || focus.scene.primary.kind !== "paper"
      || explorationState !== "system"
      || paperFocusState !== "idle"
    ) return;
    const timer = window.setTimeout(() => {
      if (
        focusRevisionRef.current === focus.intent.revision
        && explorationState === "system"
      ) {
        issueCommand("focus-paper");
      }
    }, 180);
    return () => window.clearTimeout(timer);
  }, [explorationState, focus, paperFocusState]);

  useEffect(() => {
    if (!focus) {
      setFocusVisual(null);
      return undefined;
    }
    let animationFrame = 0;
    let disposed = false;
    const tick = (now: number) => {
      if (disposed) return;
      const mode = focus.intent.primary.mode;
      const signalAutoRelease = (
        mode === "signal"
        && !focus.releasing
        && now - focusStartedAtRef.current >= 2_400
      );
      if (
        (focus.releasing || signalAutoRelease)
        && !focusInternallyReleasingRef.current
      ) {
        focusInternallyReleasingRef.current = true;
        focusReleaseStartedAtRef.current = now;
      }
      const releasing = focusInternallyReleasingRef.current;
      const elapsedSeconds = (
        now
        - (
          releasing
            ? focusReleaseStartedAtRef.current
            : focusStartedAtRef.current
        )
      ) / 1000;
      const sideraSample = focus.productMode === "sidera-explicit"
        ? sampleSideraFocusTimeline(
          elapsedSeconds,
          releasing
            ? "releasing"
            : focus.sideraPhase ?? "acquiring",
        )
        : null;
      const legacySample = sideraSample
        ? null
        : sampleAgentDualFocusTimeline(mode, elapsedSeconds, releasing);
      const sample = sideraSample
        ? {
          phase: sideraSample.complete
            ? releasing
              ? "idle" as const
              : "hold" as const
            : sideraSample.phase === "retargeting"
              ? "retargeting" as const
              : sideraSample.phase === "releasing"
                ? "releasing" as const
                : "acquiring" as const,
          progress: sideraSample.progress,
          materialBlend: sideraSample.targetBlend,
          cameraBlend: sideraSample.cameraBlend,
          backgroundDimBlend: sideraSample.backgroundDimBlend,
          infoBlend: sideraSample.infoBlend,
          complete: sideraSample.complete,
        }
        : {
          ...legacySample!,
          backgroundDimBlend: legacySample!.materialBlend,
          infoBlend: legacySample!.materialBlend,
        };
      const primary = focus.scene.primary;
      const routeReached = focus.productMode !== "sidera-explicit"
        || (
          primary.kind === "paper"
            ? primary.hotspotId
              ? (
                explorationState === "system"
                && paperFocusState === "focused"
                && selectedPaperId === primary.entityId
              )
              : sample.complete
            : (
              explorationState === "system"
              && selectedHotspotId === primary.entityId
            )
        );
      if (routeReached && explicitRouteReachedAtRef.current <= 0) {
        explicitRouteReachedAtRef.current = now;
      }
      const routeInfoBlend = focus.productMode === "sidera-explicit"
        ? routeReached
          ? sideraSmootherstep(
            (now - explicitRouteReachedAtRef.current - 120) / 420,
          )
          : 0
        : sample.infoBlend;
      const runtimePhase = releasing
        ? sample.phase
        : focus.productMode === "sidera-explicit" && !routeReached
          ? focus.sideraPhase === "retargeting"
            ? "retargeting" as const
            : "acquiring" as const
          : sample.phase;
      if (now - focusVisualUpdatedAtRef.current >= 33 || sample.complete) {
        focusVisualUpdatedAtRef.current = now;
        setFocusVisual({
          primaryId: focus.scene.primary.entityId,
          evidenceIds: focus.productMode === "sidera-explicit"
            ? []
            : focus.scene.evidence.map((entity) => entity.entityId),
          contextIds: focus.scene.context.map((entity) => entity.entityId),
          dynamicEntities: [
            ...focus.scene.context.map((entity) => ({ entity, role: 1 as const })),
            ...focus.scene.evidence.map((entity) => ({ entity, role: 2 as const })),
            { entity: focus.scene.primary, role: 3 as const },
          ].filter(({ entity }) => entity.membership === "active-only")
            .map(({ entity, role }) => ({
              entityId: entity.entityId,
              color: entity.color,
              role,
            })),
          blend: sample.materialBlend,
          productMode: focus.productMode,
          side: focus.side,
          normalizedAnchorX: focus.composition?.normalizedAnchorX,
          targetDiameterPx: focus.composition?.targetDiameterPx,
        });
      }
      if (now - focusRuntimeReportedAtRef.current >= 100) {
        focusRuntimeReportedAtRef.current = now;
        onFocusRuntime?.({
          phase: releasing && sample.complete
            ? "releasing"
            : runtimePhase,
          backgroundMode: "theory",
          primaryId: focus.scene.primary.entityId,
          focusMode: mode,
          membership: focus.scene.primary.membership,
          progress: sample.progress,
          targetBlend: sample.materialBlend,
          cameraBlend: sample.cameraBlend,
          backgroundDimBlend: sample.backgroundDimBlend,
          infoBlend: routeInfoBlend,
          routePhase: focus.scene.primary.kind === "paper"
            ? paperFocusState === "idle"
              ? explorationState === "system"
                ? "approaching-paper"
                : "entering-system"
              : paperFocusState === "focused"
                ? "hold"
                : "approaching-paper"
            : explorationState === "system"
              ? "hold"
              : "entering-system",
          cameraState: focusOriginExploreRef.current
            ? "explore-preserved"
            : focusCapturingCruise
              ? "perimeter-captured"
              : "returning-perimeter",
        });
      }
      if (
        sample.complete
        && releasing
        && mode === "signal"
        && focusSignalCompletedRevisionRef.current !== focus.intent.revision
      ) {
        focusSignalCompletedRevisionRef.current = focus.intent.revision;
        if (focusOriginExploreRef.current) {
          if (focusSavedPoseRef.current) {
            issueCommand("agent-restore-pose", {
              cameraPose: focusSavedPoseRef.current,
            });
          }
          window.setTimeout(() => {
            onFocusRuntime?.({
              phase: "idle",
              backgroundMode: "theory",
              progress: 0,
            });
          }, 780);
        } else {
          focusReturnPendingRef.current = true;
          setFocusCapturingCruise(false);
        }
      }
      animationFrame = window.requestAnimationFrame(tick);
    };
    animationFrame = window.requestAnimationFrame(tick);
    return () => {
      disposed = true;
      window.cancelAnimationFrame(animationFrame);
    };
  }, [
    explorationState,
    focus,
    focusCapturingCruise,
    onFocusRuntime,
    paperFocusState,
    selectedHotspotId,
    selectedPaperId,
  ]);

  useEffect(() => {
    if (!focus?.releasing || focus.intent.primary.mode === "signal") return;
    const issueReleaseCommand = (
      key: string,
      kind: App17GalaxyCommand["kind"],
    ) => {
      const scopedKey = `${focus.intent.revision}:${key}`;
      if (explicitReleaseLastActionRef.current === scopedKey) return;
      explicitReleaseLastActionRef.current = scopedKey;
      issueCommand(kind, {
        focusSide: focus.side,
        focusAnchorNdcX: focus.composition
          ? focus.composition.normalizedAnchorX * 2 - 1
          : undefined,
      });
    };
    if (paperFocusState === "exiting") return;
    if (
      paperFocusState !== "idle"
      || systemViewMode === "paper-focus"
    ) {
      issueReleaseCommand("release-paper", "return-system-center");
      return;
    }
    if (explorationState === "exiting") return;
    if (explorationState !== "overview") {
      issueReleaseCommand("release-system", "exit-system");
      return;
    }
    if (focusRestoreCommandedRef.current) return;
    focusRestoreCommandedRef.current = true;
    if (focusOriginExploreRef.current) {
      if (focusSavedPoseRef.current) {
        if (explicitReleaseLastActionRef.current !== "restore-explore") {
          explicitReleaseLastActionRef.current = "restore-explore";
          issueCommand("agent-restore-pose", {
            cameraPose: focusSavedPoseRef.current,
          });
        }
      }
      const timer = window.setTimeout(() => {
        onFocusRuntime?.({
          phase: "idle",
          backgroundMode: "theory",
          progress: 0,
        });
      }, 800);
      return () => window.clearTimeout(timer);
    }
    focusReturnPendingRef.current = true;
    setFocusCapturingCruise(false);
    return undefined;
  }, [
    explorationState,
    focus,
    onFocusRuntime,
    paperFocusState,
    systemViewMode,
  ]);

  const effectiveInteractionMode: GalaxyInteractionMode = (
    interactionMode === "explore" || focusCapturingCruise
  ) ? "explore" : "ambient";

  const handleReturnProgress = (
    snapshot: AgentTheoryReturnProgressSnapshot,
  ) => {
    if (!focusReturnPendingRef.current) {
      onReturnProgress?.(snapshot);
      return;
    }
    if (snapshot.phase !== "idle") {
      focusReturnSawActiveRef.current = true;
      return;
    }
    if (!focusReturnSawActiveRef.current) return;
    focusReturnPendingRef.current = false;
    focusReturnSawActiveRef.current = false;
    onFocusRuntime?.({
      phase: "idle",
      backgroundMode: "theory",
      progress: 0,
    });
  };

  useEffect(() => {
    const paperActive = (
      paperFocusState !== "idle"
      || systemViewMode === "paper-focus"
    );
    const level: AgentTheoryNavigationLevel = paperActive
      ? "paper"
      : explorationState === "overview"
        ? "overview"
        : "system";
    onNavigationStateChange?.({
      level,
      explorationState,
      paperFocusState,
      transitioning: (
        explorationState === "preparing"
        || explorationState === "entering"
        || explorationState === "exiting"
        || paperFocusState === "entering"
        || paperFocusState === "exiting"
      ),
    });
  }, [
    explorationState,
    onNavigationStateChange,
    paperFocusState,
    systemViewMode,
  ]);

  return (
    <div
      className="agent-theory-background"
      data-interaction-mode={interactionMode}
      data-effective-interaction-mode={effectiveInteractionMode}
      data-source-snapshot-id={payload.snapshotId ?? "unknown"}
      data-display-space="agent-depth-enhanced"
      data-depth-scale={depthProfile.depthScale.toFixed(6)}
      data-depth-ratio={depthProfile.rawDepthRatio.toFixed(6)}
      data-perimeter-profile={perimeterProfile.version}
      data-cruise-seed={sessionSeed}
      data-navigation-level={
        paperFocusState !== "idle" || systemViewMode === "paper-focus"
          ? "paper"
          : explorationState === "overview"
            ? "overview"
            : "system"
      }
      data-paper-focus-state={paperFocusState}
      data-near-paper-count={depthDiagnostics?.nearPaperCount ?? 0}
      data-middle-paper-count={depthDiagnostics?.middlePaperCount ?? 0}
      data-far-paper-count={depthDiagnostics?.farPaperCount ?? 0}
      data-camera-mode={depthDiagnostics?.cameraMode ?? (
        interactionMode === "explore" ? "explore" : "cruise"
      )}
      data-perimeter-sector={depthDiagnostics?.perimeterSector ?? 0}
      data-visible-galaxy-ratio={(
        depthDiagnostics?.visibleGalaxyRatio ?? 0
      ).toFixed(4)}
      data-visited-sector-ratio={(
        depthDiagnostics?.visitedSectorRatio ?? 0
      ).toFixed(4)}
      data-sphere-hotspot-count={
        depthDiagnostics?.activeSphereHotspotCount ?? 0
      }
      data-shader-status={depthDiagnostics?.shaderStatus ?? "pending"}
      data-shader-failure-materials={
        depthDiagnostics?.shaderFailureMaterials.join(",") ?? ""
      }
      data-webgl-error-count={depthDiagnostics?.webglErrorCount ?? 0}
      data-first-frame-paper-count={
        depthDiagnostics?.firstFrameVisiblePaperCount ?? 0
      }
      data-first-frame-hotspot-count={
        depthDiagnostics?.firstFrameVisibleHotspotCount ?? 0
      }
      data-first-frame-decorative-count={
        depthDiagnostics?.firstFrameDecorativeVisibleCount ?? 0
      }
      data-perimeter-reframe-count={
        depthDiagnostics?.perimeterReframeCount ?? 0
      }
      data-perimeter-degradation={
        depthDiagnostics?.perimeterDegradationReason ?? ""
      }
      data-ready-gate={depthDiagnostics?.readyGatePassed ? "pass" : "pending"}
      data-perceptible-paper-count={
        depthDiagnostics?.perceptiblePaperCount ?? 0
      }
      data-perceptible-hotspot-count={
        depthDiagnostics?.visibleHotspotCount ?? 0
      }
      data-hotspot-cell-count={
        depthDiagnostics?.hotspotOccupiedCellCount ?? 0
      }
      data-visibility-guard-safe={
        depthDiagnostics?.visibilityGuard.safe ? "true" : "false"
      }
      data-visibility-predicted-papers={
        depthDiagnostics?.visibilityGuard.predictedMinimumPaperCount ?? 0
      }
      data-visibility-predicted-hotspots={
        depthDiagnostics?.visibilityGuard.predictedMinimumHotspotCount ?? 0
      }
      data-lod-target-rejected={
        depthDiagnostics?.visibilityLodTargetRejected ? "true" : "false"
      }
      data-return-visibility-gate={
        depthDiagnostics?.returnVisibilityGatePassed ? "pass" : "pending"
      }
      data-return-phase={depthDiagnostics?.returnPhase ?? "idle"}
      data-return-progress={(
        depthDiagnostics?.returnProgress ?? 0
      ).toFixed(4)}
      data-return-visible-papers={
        depthDiagnostics?.returnActualVisiblePaperCount ?? 0
      }
      data-return-visible-hotspots={
        depthDiagnostics?.returnActualVisibleHotspotCount ?? 0
      }
      data-return-black-frames={
        depthDiagnostics?.returnBlackFrameCount ?? 0
      }
      data-return-cruise-checkpoint-delta={
        depthDiagnostics?.returnCruiseCheckpointDelta ?? 0
      }
      data-return-cruise-ambient-delta={(
        depthDiagnostics?.returnAmbientTimeDelta ?? 0
      ).toFixed(6)}
      data-return-cruise-still-frames={
        depthDiagnostics?.returnConsecutiveStillFrames ?? 0
      }
      data-return-cruise-guard-evaluations={
        depthDiagnostics?.returnCruiseGuardEvaluationCount ?? 0
      }
      data-return-cruise-safe-guards={
        depthDiagnostics?.returnCruiseGuardSafeCount ?? 0
      }
      data-post-return-trace={
        depthDiagnostics?.postReturnTrajectory.active ? "active" : "idle"
      }
      data-post-return-camera-writer={
        depthDiagnostics?.postReturnTrajectory.cameraWriter ?? "none"
      }
      data-post-return-guidance-epoch={
        depthDiagnostics?.postReturnTrajectory.guidanceEpoch ?? 0
      }
      data-post-return-guidance-source={
        depthDiagnostics?.postReturnTrajectory.guidanceSource ?? "none"
      }
      data-post-return-extra-framing={
        depthDiagnostics?.postReturnTrajectory.extraFramingCount ?? 0
      }
      data-post-return-fallback-count={
        depthDiagnostics?.postReturnTrajectory.fallbackTriggerCount ?? 0
      }
      data-post-return-worker-accepted={
        depthDiagnostics?.postReturnTrajectory.acceptedWorkerRevision ?? 0
      }
      data-post-return-worker-discarded={
        depthDiagnostics?.postReturnTrajectory
          .discardedWorkerResponseCount ?? 0
      }
      data-cruise-guidance={
        depthDiagnostics?.cruiseLiveness.guidanceMode ?? "normal"
      }
      data-cruise-step={
        depthDiagnostics?.cruiseLiveness.stepIndex ?? 0
      }
      data-cruise-step-delta={
        depthDiagnostics?.cruiseLiveness.stepDeltaLastSecond ?? 0
      }
      data-cruise-projection-delta={(
        depthDiagnostics?.cruiseLiveness.projectionMovementPxLastSecond ?? 0
      ).toFixed(6)}
      data-cruise-still-ms={(
        depthDiagnostics?.cruiseLiveness.consecutiveStillMs ?? 0
      ).toFixed(1)}
      data-cruise-recovery-count={
        depthDiagnostics?.cruiseLiveness.recoveryCount ?? 0
      }
      data-cruise-motion-version={
        depthDiagnostics?.cruiseLiveness.motionVersion ?? ""
      }
      data-cruise-random-target-seconds={(
        depthDiagnostics?.cruiseLiveness.randomTargetSecondsRemaining ?? 0
      ).toFixed(3)}
      data-cruise-worker-latency-ms={(
        depthDiagnostics?.cruiseLiveness.workerGuidanceLatencyMs ?? 0
      ).toFixed(2)}
      data-cruise-worker-pending={
        depthDiagnostics?.cruiseLiveness.workerGuidancePending ?? 0
      }
      data-cruise-worker-discarded={
        depthDiagnostics?.cruiseLiveness.workerGuidanceDiscarded ?? 0
      }
      data-cruise-guidance-switches={
        depthDiagnostics?.cruiseLiveness.guidanceTargetSwitchCount ?? 0
      }
      data-cruise-probe-speed={(
        depthDiagnostics?.cruiseLiveness
          .referenceProjectionSpeedPxPerSecond ?? 0
      ).toFixed(3)}
      data-cruise-probe-acceleration={(
        depthDiagnostics?.cruiseLiveness
          .referenceProjectionAccelerationPxPerSecond2 ?? 0
      ).toFixed(3)}
      data-cruise-probe-residual={(
        depthDiagnostics?.cruiseLiveness.referenceTrajectoryResidualPx ?? 0
      ).toFixed(4)}
      data-cruise-paused-reason={
        depthDiagnostics?.cruiseLiveness.pausedReason ?? ""
      }
      aria-label={import.meta.env.DEV
        ? [
          "Agent theory diagnostics",
          `mode=${depthDiagnostics?.cameraMode ?? "pending"}`,
          `papers=${depthDiagnostics?.perceptiblePaperCount ?? 0}`,
          `hotspots=${depthDiagnostics?.visibleHotspotCount ?? 0}`,
          `cells=${depthDiagnostics?.hotspotOccupiedCellCount ?? 0}`,
          `guard=${depthDiagnostics?.visibilityGuard.safe ? "safe" : "unsafe"}`,
          `predictedPapers=${depthDiagnostics?.visibilityGuard.predictedMinimumPaperCount ?? 0}`,
          `predictedHotspots=${depthDiagnostics?.visibilityGuard.predictedMinimumHotspotCount ?? 0}`,
          `lodRejected=${depthDiagnostics?.visibilityLodTargetRejected ? "true" : "false"}`,
          `returnGate=${depthDiagnostics?.returnVisibilityGatePassed ? "pass" : "pending"}`,
        ].join(";")
        : undefined}
    >
      <div className="agent-theory-background__space-label">
        理论布局 · 外围观测巡航
      </div>
      {import.meta.env.DEV
        && new URLSearchParams(window.location.search).get("theoryHud") === "1"
        && depthDiagnostics && (
        <output
          aria-label="Agent theory runtime diagnostics"
          style={{
            position: "absolute",
            left: "8px",
            bottom: "8px",
            zIndex: 20,
            maxWidth: "calc(100% - 16px)",
            padding: "4px 6px",
            color: "rgba(255,255,255,0.62)",
            background: "rgba(0,0,0,0.72)",
            font: "10px/1.3 monospace",
            pointerEvents: "none",
          }}
        >
          {[
            `mode=${depthDiagnostics.cameraMode}`,
            `papers=${depthDiagnostics.perceptiblePaperCount}`,
            `hotspots=${depthDiagnostics.visibleHotspotCount}`,
            `cells=${depthDiagnostics.hotspotOccupiedCellCount}`,
            `guard=${depthDiagnostics.visibilityGuard.safe ? "safe" : "unsafe"}`,
            `predicted=${depthDiagnostics.visibilityGuard.predictedMinimumPaperCount}/${depthDiagnostics.visibilityGuard.predictedMinimumHotspotCount}/${depthDiagnostics.visibilityGuard.predictedMinimumHotspotCellCount}`,
            `fallback=${depthDiagnostics.perimeterDegradationReason || "none"}`,
            `lodRejected=${depthDiagnostics.visibilityLodTargetRejected ? "yes" : "no"}`,
            `returnGate=${depthDiagnostics.returnVisibilityGatePassed ? "pass" : "pending"}`,
            `return=${depthDiagnostics.returnPhase}:${depthDiagnostics.returnProgress.toFixed(3)}`,
            `actual=${depthDiagnostics.returnActualVisiblePaperCount}/${depthDiagnostics.returnActualVisibleHotspotCount}/${depthDiagnostics.returnActualVisibleHotspotCellCount}`,
            `blackFrames=${depthDiagnostics.returnBlackFrameCount}`,
            `resume=${depthDiagnostics.returnCruiseCheckpointDelta}steps/${depthDiagnostics.returnAmbientTimeDelta.toFixed(3)}s`,
            `resumeRejected=${depthDiagnostics.returnCruiseAdvanceRejectedCount}`,
            `stillFrames=${depthDiagnostics.returnConsecutiveStillFrames}`,
            `guard=${depthDiagnostics.returnCruiseGuardSafeCount}/${depthDiagnostics.returnCruiseGuardEvaluationCount}`,
            `postReturn=${depthDiagnostics.postReturnTrajectory.active ? "active" : "idle"}/${depthDiagnostics.postReturnTrajectory.cameraWriter}`,
            `postGuidance=${depthDiagnostics.postReturnTrajectory.guidanceSource}@${depthDiagnostics.postReturnTrajectory.guidanceEpoch}`,
            `postWorker=${depthDiagnostics.postReturnTrajectory.acceptedWorkerRevision}ok/${depthDiagnostics.postReturnTrajectory.discardedWorkerResponseCount}drop`,
            `postReframe=${depthDiagnostics.postReturnTrajectory.extraFramingCount}/${depthDiagnostics.postReturnTrajectory.fallbackTriggerCount}fallback`,
            `guidance=${depthDiagnostics.cruiseLiveness.guidanceMode}`,
            `motionV=${depthDiagnostics.cruiseLiveness.motionVersion}`,
            `step=${depthDiagnostics.cruiseLiveness.stepIndex}(+${depthDiagnostics.cruiseLiveness.stepDeltaLastSecond})`,
            `motion=${depthDiagnostics.cruiseLiveness.projectionMovementPxLastSecond.toFixed(3)}px`,
            `target=${depthDiagnostics.cruiseLiveness.randomTargetSecondsRemaining.toFixed(2)}s`,
            `worker=${depthDiagnostics.cruiseLiveness.workerGuidanceLatencyMs.toFixed(1)}ms/${depthDiagnostics.cruiseLiveness.workerGuidancePending}q/${depthDiagnostics.cruiseLiveness.workerGuidanceDiscarded}drop`,
            `switches=${depthDiagnostics.cruiseLiveness.guidanceTargetSwitchCount}/${depthDiagnostics.cruiseLiveness.guidanceEmergencyOverrideCount}`,
            `probe=${depthDiagnostics.cruiseLiveness.referenceProjectionSpeedPxPerSecond.toFixed(2)}v/${depthDiagnostics.cruiseLiveness.referenceProjectionAccelerationPxPerSecond2.toFixed(2)}a/${depthDiagnostics.cruiseLiveness.referenceTrajectoryResidualPx.toFixed(3)}r`,
            `still=${depthDiagnostics.cruiseLiveness.consecutiveStillMs.toFixed(0)}ms`,
            `recoveries=${depthDiagnostics.cruiseLiveness.recoveryCount}`,
          ].join(" · ")}
        </output>
      )}
      <App17GalaxyCanvas
        active
        payload={displayPayload}
        farBackgroundPayload={displayPayload}
        selectedId={selectedHotspotId}
        selectedPaperId={selectedPaperId}
        visualMode="galaxy"
        command={command}
        representativePapers={[]}
        visualProfile="agent-theory"
        interactionMode={effectiveInteractionMode}
        labelsVisible={interactionMode === "explore"}
        initialCameraPose={initialCameraPose}
        agentTheoryDepthProfile={depthProfile}
        agentTheoryPerimeterProfile={perimeterProfile}
        agentTheoryQuality={quality}
        initialAgentTheoryCruiseCheckpoint={initialCruiseCheckpoint}
        onAgentTheoryCruiseCheckpointChange={(checkpoint) => {
          try {
            window.sessionStorage.setItem(
              cruiseStorageKey,
              serializeAgentTheoryCruiseCheckpoint(checkpoint),
            );
          } catch {
            // Session cruise persistence is best effort.
          }
        }}
        onAgentTheoryDepthDiagnostics={setDepthDiagnostics}
        onAgentTheoryReturnProgress={handleReturnProgress}
        agentTheoryFocusVisual={focusVisual}
        onCameraPoseChange={(pose) => {
          latestCameraPoseRef.current = pose;
          onCameraPoseChange(pose);
        }}
        onReady={() => {
          setFocusRuntimeReady(true);
          onReady();
        }}
        onRuntimeError={onRuntimeError}
        onSelect={(hotspotId) => {
          if (interactionMode !== "explore") return;
          setSelectedHotspotId(hotspotId);
          setSelectedPaperId("");
          issueCommand("enter-system");
        }}
        onSelectPaper={(paperId) => {
          if (interactionMode !== "explore") return;
          setSelectedPaperId(paperId);
        }}
        onExplorationStateChange={(state) => {
          setExplorationState(state);
          if (state === "overview") {
            setSelectedPaperId("");
            setPaperFocusState("idle");
            setSystemViewMode("system");
            if (pendingBestResetRef.current) {
              pendingBestResetRef.current = false;
              window.requestAnimationFrame(() => issueCommand("reset"));
            }
          }
        }}
        onSystemViewModeChange={setSystemViewMode}
        onPaperFocusStateChange={(state) => {
          setPaperFocusState(state);
        }}
        onPaperInspectionModeChange={() => undefined}
        onPaperPanelStateChange={() => undefined}
        onClearSelection={() => {
          setSelectedHotspotId("");
          setSelectedPaperId("");
        }}
      />
    </div>
  );
}
