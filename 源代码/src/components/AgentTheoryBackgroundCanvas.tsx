import { useEffect, useMemo, useRef, useState } from "react";

import type { App17GalaxyPayload } from "../types";
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
  type GalaxyCameraPose,
  type GalaxyExplorationState,
  type GalaxyInteractionMode,
} from "./App17GalaxyCanvas";

type AgentTheoryBackgroundCanvasProps = {
  payload: App17GalaxyPayload;
  interactionMode: GalaxyInteractionMode;
  initialCameraPose?: GalaxyCameraPose;
  resetToBestNonce: number;
  onCameraPoseChange: (pose: GalaxyCameraPose) => void;
  onReady: () => void;
  onRuntimeError: (message: string) => void;
};

export function AgentTheoryBackgroundCanvas({
  payload,
  interactionMode,
  initialCameraPose,
  resetToBestNonce,
  onCameraPoseChange,
  onReady,
  onRuntimeError,
}: AgentTheoryBackgroundCanvasProps) {
  const [selectedHotspotId, setSelectedHotspotId] = useState("");
  const [selectedPaperId, setSelectedPaperId] = useState("");
  const [explorationState, setExplorationState] =
    useState<GalaxyExplorationState>("overview");
  const [command, setCommand] = useState<App17GalaxyCommand>({
    kind: "reset",
    nonce: 0,
  });
  const pendingBestResetRef = useRef(false);
  const previousResetNonceRef = useRef(resetToBestNonce);
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

  const issueCommand = (kind: App17GalaxyCommand["kind"]) => {
    setCommand((current) => ({
      kind,
      nonce: current.nonce + 1,
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

  return (
    <div
      className="agent-theory-background"
      data-interaction-mode={interactionMode}
      data-source-snapshot-id={payload.snapshotId ?? "unknown"}
      data-display-space="agent-depth-enhanced"
      data-depth-scale={depthProfile.depthScale.toFixed(6)}
      data-depth-ratio={depthProfile.rawDepthRatio.toFixed(6)}
      data-perimeter-profile={perimeterProfile.version}
      data-cruise-seed={sessionSeed}
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
    >
      <div className="agent-theory-background__space-label">
        理论布局 · 外围观测巡航
      </div>
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
        interactionMode={interactionMode}
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
        onCameraPoseChange={onCameraPoseChange}
        onReady={onReady}
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
            if (pendingBestResetRef.current) {
              pendingBestResetRef.current = false;
              window.requestAnimationFrame(() => issueCommand("reset"));
            }
          }
        }}
        onSystemViewModeChange={() => undefined}
        onPaperFocusStateChange={() => undefined}
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
