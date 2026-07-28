import { useMemo } from "react";

import type { AgentGalaxyBackgroundPayloadV1 } from "../types";
import type { AgentGalaxyFocusIntent } from "../lib/agentGalaxyFlowContract";
import type {
  AgentGalaxyImmersiveContextSet,
} from "../lib/agentGalaxyImmersiveContext";
import type {
  AgentGalaxyImmersiveQuality,
  AgentGalaxyImmersiveState,
} from "../lib/agentGalaxyImmersiveReview";
import type { AgentGalaxyFocusRuntimeSnapshot } from "../lib/agentGalaxyResidentFocus";
import type { AgentGalaxyFlowReviewConfig } from "../lib/agentGalaxyFlowReview";
import AgentGalaxyFlowCanvas, {
  type AgentGalaxyContextPresentation,
  type AgentGalaxyFlowMetrics,
} from "./AgentGalaxyFlowCanvas";

type Props = {
  payload: AgentGalaxyBackgroundPayloadV1;
  state: AgentGalaxyImmersiveState;
  quality: AgentGalaxyImmersiveQuality;
  focusIntent?: AgentGalaxyFocusIntent;
  contextSet?: AgentGalaxyImmersiveContextSet;
  reducedMotion?: boolean;
  onMetrics?: (metrics: AgentGalaxyFlowMetrics) => void;
  onFocusSnapshot?: (snapshot: AgentGalaxyFocusRuntimeSnapshot) => void;
};

export default function AgentGalaxyImmersiveCanvas({
  payload,
  state,
  quality,
  focusIntent,
  contextSet,
  reducedMotion,
  onMetrics,
  onFocusSnapshot,
}: Props) {
  const flowConfig = useMemo<AgentGalaxyFlowReviewConfig>(() => ({
    model: "gravitational-weave",
    motion: "idle",
    camera: "codrift",
    quality,
    gravity: 0.85,
    shear: 0.42,
    twist: 0.18,
    speed: 1,
    calm: 0.3,
    snapshotPng: false,
    snapshotRegion: "full",
    showHud: false,
    focusMode: "full-focus",
    focusDelaySeconds: 0,
    starMaterial: "photosphere",
    focusField: true,
    focusCamera: true,
  }), [quality]);
  const contextPresentation = useMemo<
    AgentGalaxyContextPresentation | undefined
  >(() => {
    if (!contextSet) return undefined;
    const resolvedEntities = [
      contextSet.target,
      ...contextSet.contextPapers.map((paper) => {
        const hotspot = payload.hotspots.find(
          (candidate) => candidate.id === paper.hotspotId,
        );
        return {
          kind: "paper" as const,
          entityId: paper.id,
          hotspotId: paper.hotspotId,
          membership: "sampled" as const,
          semanticPosition: hotspot
            ? [
                hotspot.position[0] + paper.offset[0],
                hotspot.position[1] + paper.offset[1],
                hotspot.position[2] + paper.offset[2],
              ] as [number, number, number]
            : undefined,
          hotspotPosition: hotspot
            ? [...hotspot.position] as [number, number, number]
            : undefined,
          semanticOffset: [...paper.offset] as [number, number, number],
          sourceSnapshotId: payload.sourceSnapshotId,
          field: hotspot?.field,
          year: paper.year,
          color: paper.color,
          placementRule: "semantic" as const,
        };
      }),
    ];
    return {
      state,
      target: contextSet.target,
      contextEntityIds: contextSet.contextEntityIds,
      evidenceOrder: contextSet.contextEntityIds,
      resolvedEntities,
      extractionSide: contextSet.extractionSide,
      active: state === "thinking"
        || state === "answer"
        || state === "reading"
        || state === "focus",
    };
  }, [contextSet, payload.hotspots, payload.sourceSnapshotId, state]);

  return (
    <div
      className="agent-immersive-canvas"
      data-agent-state={state}
      data-context-relation={contextSet?.relation ?? "none"}
      data-context-count={contextSet?.contextPapers.length ?? 0}
    >
      <AgentGalaxyFlowCanvas
        payload={payload}
        config={flowConfig}
        focusIntent={focusIntent}
        motionState={state}
        contextPresentation={contextPresentation}
        presentationProfile="immersive"
        reducedMotion={reducedMotion}
        onMetrics={onMetrics}
        onFocusSnapshot={onFocusSnapshot}
      />
    </div>
  );
}
