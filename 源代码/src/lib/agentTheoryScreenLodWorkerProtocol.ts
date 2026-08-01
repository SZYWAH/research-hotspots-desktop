import {
  AGENT_THEORY_SCREEN_LOD_GUARD_BAND_NDC,
  AGENT_THEORY_SCREEN_LOD_VERSION,
  classifyAgentTheoryScreenLodTransition,
  projectAgentTheoryScreenLodNdc,
  resolveAgentTheoryScreenLodIntervalMs,
  selectAgentTheoryScreenLod,
  type AgentTheoryScreenLodCadence,
  type AgentTheoryScreenLodQuality,
} from "./agentTheoryScreenLod";
import {
  executeAgentTheoryCruiseGuidance,
  validateAgentTheoryCruiseGuidanceCatalog,
  type AgentTheoryCruiseGuidanceCatalog,
  type AgentTheoryCruiseGuidanceInput,
  type AgentTheoryCruiseGuidanceResult,
} from "./agentTheoryCruiseGuidance";

export const AGENT_THEORY_SCREEN_LOD_WORKER_PROTOCOL_VERSION =
  "agent-theory-screen-lod-worker-v3-guidance" as const;

export type AgentTheoryLodPurpose =
  | "explore"
  | "return-anchor"
  | "cruise";

export type AgentTheoryProjectionSignature = string;

export type AgentTheoryScreenLodWorkerCatalog = {
  catalogRevision: string;
  paperIds: string[];
  topicKeys: string[];
  /**
   * Immutable local-space xyz triples. Projection belongs to the worker so an
   * active gesture only sends a 4x4 local-to-clip matrix from the main thread.
   */
  positions: Float32Array;
  sizes: Float32Array;
  guidance: AgentTheoryCruiseGuidanceCatalog;
};

export type AgentTheoryScreenLodWorkerInitializeRequest = {
  type: "agent-theory-screen-lod:initialize";
  protocolVersion: typeof AGENT_THEORY_SCREEN_LOD_WORKER_PROTOCOL_VERSION;
  catalog: AgentTheoryScreenLodWorkerCatalog;
};

export type AgentTheoryScreenLodWorkerReadyResponse = {
  type: "agent-theory-screen-lod:ready";
  protocolVersion: typeof AGENT_THEORY_SCREEN_LOD_WORKER_PROTOCOL_VERSION;
  catalogRevision: string;
  entityCount: number;
};

export type AgentTheoryScreenLodWorkerSelectionRequest = {
  type: "agent-theory-screen-lod:select";
  protocolVersion: typeof AGENT_THEORY_SCREEN_LOD_WORKER_PROTOCOL_VERSION;
  catalogRevision: string;
  revision: number;
  purpose: AgentTheoryLodPurpose;
  projectionSignature: AgentTheoryProjectionSignature;
  cadence: AgentTheoryScreenLodCadence;
  width: number;
  height: number;
  quality: AgentTheoryScreenLodQuality;
  /**
   * Column-major projection * view * local matrix, matching Three.js
   * Matrix4.elements ordering.
   */
  localToClipMatrix: Float32Array;
  previousVisibleMask: Uint8Array;
  forcedVisibleMask: Uint8Array;
};

export type AgentTheoryScreenLodWorkerSelectionResponse = {
  type: "agent-theory-screen-lod:selection";
  protocolVersion: typeof AGENT_THEORY_SCREEN_LOD_WORKER_PROTOCOL_VERSION;
  catalogRevision: string;
  revision: number;
  purpose: AgentTheoryLodPurpose;
  projectionSignature: AgentTheoryProjectionSignature;
  cadence: AgentTheoryScreenLodCadence;
  requestedIntervalMs: number;
  selectionHash: string;
  transitionHash: string;
  visibleIndices: Uint32Array;
  incomingIndices: Uint32Array;
  retiringIndices: Uint32Array;
  residentIndices: Uint32Array;
  candidateCount: number;
  guardBandCandidateCount: number;
  viewportCandidateCount: number;
  viewportSelectedCount: number;
  perceptiblePaperCount: number;
  forcedVisibleCount: number;
  occupiedTileRatio: number;
  overlapP95: number;
  targetCount: number;
  viewportTargetCount: number;
  guardBandNdc: number;
};

export type AgentTheoryCruiseGuidanceWorkerRequest = {
  type: "agent-theory-screen-lod:guidance";
  protocolVersion: typeof AGENT_THEORY_SCREEN_LOD_WORKER_PROTOCOL_VERSION;
  catalogRevision: string;
  revision: number;
  input: AgentTheoryCruiseGuidanceInput;
};

export type AgentTheoryCruiseGuidanceWorkerResponse = {
  type: "agent-theory-screen-lod:guidance-result";
  protocolVersion: typeof AGENT_THEORY_SCREEN_LOD_WORKER_PROTOCOL_VERSION;
  catalogRevision: string;
  revision: number;
  result: AgentTheoryCruiseGuidanceResult;
  computeMs: number;
};

export type AgentTheoryScreenLodWorkerErrorResponse = {
  type: "agent-theory-screen-lod:error";
  protocolVersion: typeof AGENT_THEORY_SCREEN_LOD_WORKER_PROTOCOL_VERSION;
  catalogRevision: string;
  revision?: number;
  task?: "selection" | "guidance";
  message: string;
};

export type AgentTheoryScreenLodWorkerRequest =
  | AgentTheoryScreenLodWorkerInitializeRequest
  | AgentTheoryScreenLodWorkerSelectionRequest
  | AgentTheoryCruiseGuidanceWorkerRequest;

export type AgentTheoryScreenLodWorkerResponse =
  | AgentTheoryScreenLodWorkerReadyResponse
  | AgentTheoryScreenLodWorkerSelectionResponse
  | AgentTheoryCruiseGuidanceWorkerResponse
  | AgentTheoryScreenLodWorkerErrorResponse;

export function validateAgentTheoryScreenLodWorkerCatalog(
  catalog: AgentTheoryScreenLodWorkerCatalog,
) {
  const entityCount = catalog.paperIds.length;
  if (!catalog.catalogRevision.trim()) {
    throw new Error("Screen LOD catalogRevision must not be empty.");
  }
  if (
    catalog.topicKeys.length !== entityCount
    || catalog.positions.length !== entityCount * 3
    || catalog.sizes.length !== entityCount
  ) {
    throw new Error(
      "Screen LOD catalog arrays must have identical entity counts.",
    );
  }
  if (
    catalog.paperIds.some((paperId) => !paperId)
    || catalog.topicKeys.some((topicKey) => !topicKey)
  ) {
    throw new Error("Screen LOD catalog identities must not be empty.");
  }
  if (new Set(catalog.paperIds).size !== entityCount) {
    throw new Error("Screen LOD catalog paper identities must be unique.");
  }
  for (const value of catalog.positions) {
    if (!Number.isFinite(value)) {
      throw new Error("Screen LOD catalog positions must be finite.");
    }
  }
  for (const value of catalog.sizes) {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(
        "Screen LOD catalog sizes must be finite and non-negative.",
      );
    }
  }
  validateAgentTheoryCruiseGuidanceCatalog(catalog.guidance);
  return entityCount;
}

export function executeAgentTheoryScreenLodWorkerSelection(
  catalog: AgentTheoryScreenLodWorkerCatalog,
  request: AgentTheoryScreenLodWorkerSelectionRequest,
): AgentTheoryScreenLodWorkerSelectionResponse {
  const entityCount = validateAgentTheoryScreenLodWorkerCatalog(catalog);
  if (
    request.protocolVersion
      !== AGENT_THEORY_SCREEN_LOD_WORKER_PROTOCOL_VERSION
  ) {
    throw new Error(
      `Unsupported Screen LOD worker protocol: ${request.protocolVersion}`,
    );
  }
  if (request.catalogRevision !== catalog.catalogRevision) {
    throw new Error(
      `Screen LOD catalog revision mismatch: expected `
        + `${catalog.catalogRevision}, received ${request.catalogRevision}.`,
    );
  }
  if (!Number.isSafeInteger(request.revision) || request.revision <= 0) {
    throw new Error("Screen LOD request revision must be a positive integer.");
  }
  if (
    !["explore", "return-anchor", "cruise"].includes(request.purpose)
    || !request.projectionSignature.trim()
  ) {
    throw new Error(
      "Screen LOD requests require a valid purpose and projection signature.",
    );
  }
  if (
    request.localToClipMatrix.length !== 16
    || request.previousVisibleMask.length !== entityCount
    || request.forcedVisibleMask.length !== entityCount
  ) {
    throw new Error(
      "Screen LOD request buffers do not match the initialized catalog.",
    );
  }
  if (
    !Number.isFinite(request.width)
    || request.width <= 0
    || !Number.isFinite(request.height)
    || request.height <= 0
  ) {
    throw new Error("Screen LOD viewport dimensions must be positive.");
  }
  for (const value of request.localToClipMatrix) {
    if (!Number.isFinite(value)) {
      throw new Error("Screen LOD local-to-clip matrix must be finite.");
    }
  }

  const previousVisibleIndices: number[] = [];
  const ndcCoordinates = projectAgentTheoryScreenLodNdc(
    catalog.positions,
    request.localToClipMatrix,
  );
  const candidates = [];
  for (let index = 0; index < entityCount; index += 1) {
    const previouslyVisible = request.previousVisibleMask[index] !== 0;
    if (previouslyVisible) previousVisibleIndices.push(index);
    candidates.push({
      index,
      paperId: catalog.paperIds[index],
      topicKey: catalog.topicKeys[index],
      ndcX: ndcCoordinates[index * 3],
      ndcY: ndcCoordinates[index * 3 + 1],
      ndcZ: ndcCoordinates[index * 3 + 2],
      size: catalog.sizes[index],
      previouslyVisible,
      forced: request.forcedVisibleMask[index] !== 0,
    });
  }

  const selection = selectAgentTheoryScreenLod({
    candidates,
    width: request.width,
    height: request.height,
    quality: request.quality,
    guardBandNdc: AGENT_THEORY_SCREEN_LOD_GUARD_BAND_NDC,
  });
  const transition = classifyAgentTheoryScreenLodTransition(
    selection.selectedIndices,
    previousVisibleIndices,
  );

  return {
    type: "agent-theory-screen-lod:selection",
    protocolVersion: AGENT_THEORY_SCREEN_LOD_WORKER_PROTOCOL_VERSION,
    catalogRevision: catalog.catalogRevision,
    revision: request.revision,
    purpose: request.purpose,
    projectionSignature: request.projectionSignature,
    cadence: request.cadence,
    requestedIntervalMs: resolveAgentTheoryScreenLodIntervalMs(
      request.cadence,
    ),
    selectionHash: selection.selectionHash,
    transitionHash: transition.transitionHash,
    visibleIndices: Uint32Array.from(transition.visibleIndices),
    incomingIndices: Uint32Array.from(transition.incomingIndices),
    retiringIndices: Uint32Array.from(transition.retiringIndices),
    residentIndices: Uint32Array.from(transition.residentIndices),
    candidateCount: selection.candidateCount,
    guardBandCandidateCount: selection.guardBandCandidateCount,
    viewportCandidateCount: selection.viewportCandidateCount,
    viewportSelectedCount: selection.viewportSelectedCount,
    perceptiblePaperCount: selection.perceptiblePaperCount,
    forcedVisibleCount: selection.forcedVisibleCount,
    occupiedTileRatio: selection.occupiedTileRatio,
    overlapP95: selection.overlapP95,
    targetCount: selection.targetCount,
    viewportTargetCount: selection.viewportTargetCount,
    guardBandNdc: selection.guardBandNdc,
  };
}

export function executeAgentTheoryCruiseGuidanceWorkerRequest(
  catalog: AgentTheoryScreenLodWorkerCatalog,
  request: AgentTheoryCruiseGuidanceWorkerRequest,
): AgentTheoryCruiseGuidanceWorkerResponse {
  validateAgentTheoryScreenLodWorkerCatalog(catalog);
  if (
    request.protocolVersion
      !== AGENT_THEORY_SCREEN_LOD_WORKER_PROTOCOL_VERSION
  ) {
    throw new Error(
      `Unsupported Screen LOD worker protocol: ${request.protocolVersion}`,
    );
  }
  if (request.catalogRevision !== catalog.catalogRevision) {
    throw new Error(
      `Cruise guidance catalog revision mismatch: expected `
        + `${catalog.catalogRevision}, received ${request.catalogRevision}.`,
    );
  }
  if (!Number.isSafeInteger(request.revision) || request.revision <= 0) {
    throw new Error(
      "Cruise guidance request revision must be a positive integer.",
    );
  }
  const startedAt = typeof performance !== "undefined"
    ? performance.now()
    : Date.now();
  const result = executeAgentTheoryCruiseGuidance(
    catalog.guidance,
    request.input,
  );
  const finishedAt = typeof performance !== "undefined"
    ? performance.now()
    : Date.now();
  return {
    type: "agent-theory-screen-lod:guidance-result",
    protocolVersion: AGENT_THEORY_SCREEN_LOD_WORKER_PROTOCOL_VERSION,
    catalogRevision: catalog.catalogRevision,
    revision: request.revision,
    result,
    computeMs: Math.max(0, finishedAt - startedAt),
  };
}

export function cloneAgentTheoryScreenLodWorkerCatalog(
  catalog: AgentTheoryScreenLodWorkerCatalog,
): AgentTheoryScreenLodWorkerCatalog {
  return {
    catalogRevision: catalog.catalogRevision,
    paperIds: [...catalog.paperIds],
    topicKeys: [...catalog.topicKeys],
    positions: catalog.positions.slice(),
    sizes: catalog.sizes.slice(),
    guidance: {
      profile: {
        ...catalog.guidance.profile,
        center: [...catalog.guidance.profile.center],
        principalAxes: catalog.guidance.profile.principalAxes.map(
          (axis) => [...axis],
        ) as AgentTheoryCruiseGuidanceCatalog["profile"]["principalAxes"],
        sectorRadii: [...catalog.guidance.profile.sectorRadii],
        safetyMargins: [...catalog.guidance.profile.safetyMargins],
      },
      paperPositions: catalog.guidance.paperPositions.slice(),
      totalPaperCount: catalog.guidance.totalPaperCount,
      hotspotPositions: catalog.guidance.hotspotPositions.slice(),
    },
  };
}

export function selectionResponseTransferables(
  response: AgentTheoryScreenLodWorkerSelectionResponse,
) {
  return [
    response.visibleIndices.buffer,
    response.incomingIndices.buffer,
    response.retiringIndices.buffer,
    response.residentIndices.buffer,
  ];
}

export const AGENT_THEORY_SCREEN_LOD_WORKER_SELECTION_VERSION =
  `${AGENT_THEORY_SCREEN_LOD_VERSION}:guard-${AGENT_THEORY_SCREEN_LOD_GUARD_BAND_NDC}`;
