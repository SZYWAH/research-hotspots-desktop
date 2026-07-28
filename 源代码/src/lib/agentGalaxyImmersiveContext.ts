import type {
  AgentGalaxyBackgroundHotspotV1,
  AgentGalaxyBackgroundPaperV1,
  AgentGalaxyBackgroundPayloadV1,
} from "../types";
import type { ResolvedAgentGalaxyEntity } from "./agentGalaxyFlowContract";

export type AgentGalaxyContextRelation =
  | "answer-evidence"
  | "citation-neighborhood"
  | "hotspot-membership"
  | "visual-review-fixture";

export type AgentGalaxyImmersiveContextSet = {
  target: ResolvedAgentGalaxyEntity;
  targetPaper?: AgentGalaxyBackgroundPaperV1;
  hotspot?: AgentGalaxyBackgroundHotspotV1;
  contextPapers: AgentGalaxyBackgroundPaperV1[];
  contextEntityIds: string[];
  relation: AgentGalaxyContextRelation;
  extractionSide: "left" | "right";
  sourceSnapshotId: string;
};

function fnv1a32(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function squaredDistance(
  left: readonly number[],
  right: readonly number[],
) {
  const x = (left[0] ?? 0) - (right[0] ?? 0);
  const y = (left[1] ?? 0) - (right[1] ?? 0);
  const z = (left[2] ?? 0) - (right[2] ?? 0);
  return x * x + y * y + z * z;
}

export function resolveAgentGalaxyImmersivePaperId(
  payload: AgentGalaxyBackgroundPayloadV1,
  requestedId?: string,
) {
  if (
    requestedId
    && payload.papers.some((paper) => paper.id === requestedId)
  ) {
    return requestedId;
  }

  const preferredId = "project-default:openalex:W2582012066";
  if (payload.papers.some((paper) => paper.id === preferredId)) {
    return preferredId;
  }

  return [...payload.papers]
    .sort((left, right) => left.id.localeCompare(right.id))[0]?.id;
}

export function resolveAgentGalaxyImmersiveContext(
  payload: AgentGalaxyBackgroundPayloadV1,
  paperId: string,
  maximumContextPapers = 24,
): AgentGalaxyImmersiveContextSet | undefined {
  const targetPaper = payload.papers.find((paper) => paper.id === paperId);
  if (!targetPaper) return undefined;
  const hotspot = payload.hotspots.find(
    (candidate) => candidate.id === targetPaper.hotspotId,
  );
  if (!hotspot) return undefined;
  return resolveAgentGalaxyImmersiveContextFromEntity(
    payload,
    {
      kind: "paper",
      entityId: targetPaper.id,
      hotspotId: hotspot.id,
      membership: "sampled",
      semanticPosition: [
        hotspot.position[0] + targetPaper.offset[0],
        hotspot.position[1] + targetPaper.offset[1],
        hotspot.position[2] + targetPaper.offset[2],
      ],
      hotspotPosition: [...hotspot.position],
      semanticOffset: [...targetPaper.offset],
      sourceSnapshotId: payload.sourceSnapshotId,
      field: hotspot.field,
      year: targetPaper.year,
      color: targetPaper.color,
      placementRule: "semantic",
    },
    { maximumContextPapers },
  );
}

export type AgentGalaxyContextResolutionOptions = {
  evidenceEntityIds?: readonly string[];
  citationEntityIds?: readonly string[];
  maximumContextPapers?: number;
};

export function resolveAgentGalaxyImmersiveContextFromEntity(
  payload: AgentGalaxyBackgroundPayloadV1,
  target: ResolvedAgentGalaxyEntity,
  options: AgentGalaxyContextResolutionOptions = {},
): AgentGalaxyImmersiveContextSet | undefined {
  if (target.membership === "missing") return undefined;
  const targetPaper = target.kind === "paper"
    ? payload.papers.find((paper) => paper.id === target.entityId)
      ?? (
        target.semanticOffset && target.hotspotId
          ? {
              id: target.entityId,
              hotspotId: target.hotspotId,
              offset: [...target.semanticOffset] as [number, number, number],
              color: target.color ?? "#aeb8bf",
              year: target.year,
            }
          : undefined
      )
    : undefined;
  const hotspotId = target.kind === "hotspot"
    ? target.entityId
    : target.hotspotId;
  const hotspot = hotspotId
    ? payload.hotspots.find((candidate) => candidate.id === hotspotId)
    : undefined;
  const limit = Math.min(
    24,
    Math.max(1, Math.floor(options.maximumContextPapers ?? 24)),
  );
  const eligible = hotspot
    ? payload.papers.filter((paper) => (
        paper.hotspotId === hotspot.id
        && paper.id !== target.entityId
      ))
    : [];
  const eligibleById = new Map(eligible.map((paper) => [paper.id, paper]));
  const selected: AgentGalaxyBackgroundPaperV1[] = [];
  const selectedIds = new Set<string>();
  const appendPriority = (ids: readonly string[] | undefined) => {
    for (const id of ids ?? []) {
      if (selected.length >= limit || selectedIds.has(id)) continue;
      const paper = eligibleById.get(id);
      if (!paper) continue;
      selected.push(paper);
      selectedIds.add(id);
    }
  };

  // Real answer evidence takes precedence, followed by explicit citation
  // neighbours. Semantic neighbours only fill the remaining visual budget.
  appendPriority(options.evidenceEntityIds);
  appendPriority(options.citationEntityIds);
  const targetOffset = targetPaper?.offset ?? [0, 0, 0];
  const semanticNeighbors = eligible
    .filter((paper) => !selectedIds.has(paper.id))
    .sort((left, right) => {
      const distanceDifference = squaredDistance(
        left.offset,
        targetOffset,
      ) - squaredDistance(
        right.offset,
        targetOffset,
      );
      if (Math.abs(distanceDifference) > 1e-12) return distanceDifference;
      const stableDifference = fnv1a32(
        `${payload.sourceSnapshotId}:${target.entityId}:${left.id}`,
      ) - fnv1a32(
        `${payload.sourceSnapshotId}:${target.entityId}:${right.id}`,
      );
      return stableDifference || left.id.localeCompare(right.id);
    });
  for (const paper of semanticNeighbors) {
    if (selected.length >= limit) break;
    selected.push(paper);
    selectedIds.add(paper.id);
  }

  const relation: AgentGalaxyContextRelation = (
    options.evidenceEntityIds?.some((id) => selectedIds.has(id))
      ? "answer-evidence"
      : options.citationEntityIds?.some((id) => selectedIds.has(id))
        ? "citation-neighborhood"
        : "hotspot-membership"
  );
  return {
    target,
    targetPaper,
    hotspot,
    contextPapers: selected,
    contextEntityIds: selected.map((paper) => paper.id),
    relation,
    extractionSide: fnv1a32(
      `${payload.sourceSnapshotId}:${target.entityId}:extraction-side`,
    ) % 2 === 0
      ? "left"
      : "right",
    sourceSnapshotId: payload.sourceSnapshotId,
  };
}

export function nextAgentGalaxyImmersivePaperId(
  payload: AgentGalaxyBackgroundPayloadV1,
  currentPaperId: string,
) {
  const ordered = [...payload.papers].sort(
    (left, right) => left.id.localeCompare(right.id),
  );
  if (!ordered.length) return undefined;
  const currentIndex = ordered.findIndex((paper) => paper.id === currentPaperId);
  return ordered[(Math.max(0, currentIndex) + 1) % ordered.length]?.id;
}
