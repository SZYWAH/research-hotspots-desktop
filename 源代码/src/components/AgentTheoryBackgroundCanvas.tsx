import { useEffect, useRef, useState } from "react";

import type { App17GalaxyPayload } from "../types";
import {
  App17GalaxyCanvas,
  type App17GalaxyCommand,
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
    >
      <App17GalaxyCanvas
        active
        payload={payload}
        farBackgroundPayload={payload}
        selectedId={selectedHotspotId}
        selectedPaperId={selectedPaperId}
        visualMode="galaxy"
        command={command}
        representativePapers={[]}
        visualProfile="agent-theory"
        interactionMode={interactionMode}
        labelsVisible={interactionMode === "explore"}
        initialCameraPose={initialCameraPose}
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
