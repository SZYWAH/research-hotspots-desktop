import { useEffect, useMemo, useRef, useState } from "react";

import type { App17GalaxyPayload } from "../types";
import {
  applyAgentTheoryDepthProfile,
  createAgentTheoryDepthProfile,
} from "../lib/agentTheoryDepth";
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
};

export function AgentTheoryBackgroundCanvas({
  payload,
  interactionMode,
  initialCameraPose,
  resetToBestNonce,
  onCameraPoseChange,
  onReady,
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
  const ambientStorageKey = useMemo(
    () => (
      `research-agent:theory-ambient:${depthProfile.version}:`
      + `${payload.snapshotId ?? "unknown"}`
    ),
    [depthProfile.version, payload.snapshotId],
  );
  const initialAmbientElapsedSeconds = useMemo(() => {
    try {
      const value = Number(window.sessionStorage.getItem(ambientStorageKey));
      return Number.isFinite(value) && value >= 0 ? value : 0;
    } catch {
      return 0;
    }
  }, [ambientStorageKey]);
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
      data-near-paper-count={depthDiagnostics?.nearPaperCount ?? 0}
      data-middle-paper-count={depthDiagnostics?.middlePaperCount ?? 0}
      data-far-paper-count={depthDiagnostics?.farPaperCount ?? 0}
    >
      <div className="agent-theory-background__space-label">
        理论布局 · 视觉纵深增强
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
        agentTheoryQuality={quality}
        initialAgentTheoryAmbientElapsedSeconds={
          initialAmbientElapsedSeconds
        }
        onAgentTheoryAmbientElapsedSecondsChange={(elapsedSeconds) => {
          try {
            window.sessionStorage.setItem(
              ambientStorageKey,
              elapsedSeconds.toFixed(6),
            );
          } catch {
            // Ambient phase persistence is session-only best effort.
          }
        }}
        onAgentTheoryDepthDiagnostics={setDepthDiagnostics}
        onCameraPoseChange={onCameraPoseChange}
        onReady={onReady}
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
