import type {
  AgentGalaxyBackgroundPayloadV1,
  App17GalaxyPayload,
} from "../types";
import type {
  AgentGalaxyFocusIntent,
  AgentGalaxyVector3,
  ResolvedAgentGalaxyEntity,
} from "./agentGalaxyFlowContract";

export const AGENT_GALAXY_DYNAMIC_ENTITY_CACHE_SIZE = 24;
export const AGENT_GALAXY_MULTI_ENTITY_LIMIT = 6;
export const AGENT_GALAXY_UNCLASSIFIED_PLACEMENT_VERSION =
  "unclassified-frontier-v1" as const;

export type AgentGalaxyEntityResolveRequest = Pick<
  AgentGalaxyFocusIntent,
  "kind" | "entityId"
>;

function fnv1a32(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function colorForField(
  payload: AgentGalaxyBackgroundPayloadV1,
  field: string,
) {
  return payload.hotspots.find((hotspot) => hotspot.field === field)?.color
    ?? "#aeb8bf";
}

export function resolveAgentGalaxyUnclassifiedPosition(
  sourceSnapshotId: string,
  entityId: string,
): AgentGalaxyVector3 {
  const azimuthSeed = fnv1a32(
    `${sourceSnapshotId}:${entityId}:unclassified-azimuth`,
  ) / 0xffff_ffff;
  const elevationSeed = fnv1a32(
    `${sourceSnapshotId}:${entityId}:unclassified-elevation`,
  ) / 0xffff_ffff;
  const radiusSeed = fnv1a32(
    `${sourceSnapshotId}:${entityId}:unclassified-radius`,
  ) / 0xffff_ffff;
  const azimuth = azimuthSeed * Math.PI * 2;
  const elevation = (elevationSeed - 0.5) * 0.46;
  const radius = 76 + radiusSeed * 12;
  const horizontal = Math.cos(elevation) * radius;
  return [
    Math.cos(azimuth) * horizontal,
    Math.sin(elevation) * radius,
    Math.sin(azimuth) * horizontal,
  ];
}

export function normalizeAgentGalaxyResolvedEntity(
  payload: AgentGalaxyBackgroundPayloadV1,
  entity: ResolvedAgentGalaxyEntity,
): ResolvedAgentGalaxyEntity {
  if (entity.membership !== "active-only") return entity;
  return {
    ...entity,
    hotspotId: undefined,
    hotspotPosition: resolveAgentGalaxyUnclassifiedPosition(
      payload.sourceSnapshotId,
      entity.entityId,
    ),
    semanticPosition: undefined,
    semanticOffset: [0, 0, 0],
    sourceSnapshotId: payload.sourceSnapshotId,
    color: entity.color ?? colorForField(payload, entity.field ?? ""),
    placementRule: AGENT_GALAXY_UNCLASSIFIED_PLACEMENT_VERSION,
  };
}

export function resolveAgentGalaxyReviewEntities(
  payload: AgentGalaxyBackgroundPayloadV1,
  fullPayload: App17GalaxyPayload,
  requests: readonly AgentGalaxyEntityResolveRequest[],
) {
  const sampledPaperById = new Map(
    payload.papers.map((paper) => [paper.id, paper]),
  );
  const backgroundHotspotById = new Map(
    payload.hotspots.map((hotspot) => [hotspot.id, hotspot]),
  );
  const fullPaperById = new Map(
    fullPayload.papers.flatMap((paper) => [
      [paper.rawPaperId, paper] as const,
      [paper.scopedPaperId, paper] as const,
    ]),
  );
  const fullHotspotById = new Map(
    fullPayload.hotspots.map((hotspot) => [hotspot.id, hotspot]),
  );
  const fullHotspotByTopic = new Map(
    fullPayload.hotspots.map((hotspot) => [
      `${hotspot.field}\u0000${hotspot.topicId}`,
      hotspot,
    ]),
  );

  return requests.slice(0, 32).map((request): ResolvedAgentGalaxyEntity => {
    if (request.kind === "hotspot") {
      const backgroundHotspot = backgroundHotspotById.get(request.entityId);
      const fullHotspot = fullHotspotById.get(request.entityId);
      if (!backgroundHotspot || !fullHotspot) {
        return {
          kind: "hotspot",
          entityId: request.entityId,
          membership: "missing",
        };
      }
      return {
        kind: "hotspot",
        entityId: request.entityId,
        membership: "sampled",
        semanticPosition: [...backgroundHotspot.position],
        hotspotPosition: [...backgroundHotspot.position],
        semanticOffset: [0, 0, 0],
        sourceSnapshotId: payload.sourceSnapshotId,
        title: fullHotspot.title,
        field: backgroundHotspot.field,
        color: backgroundHotspot.color,
        placementRule: "semantic",
      };
    }

    const sampledPaper = sampledPaperById.get(request.entityId);
    if (sampledPaper) {
      const hotspot = backgroundHotspotById.get(sampledPaper.hotspotId);
      return {
        kind: "paper",
        entityId: request.entityId,
        hotspotId: sampledPaper.hotspotId,
        membership: "sampled",
        semanticPosition: hotspot
          ? [
              hotspot.position[0] + sampledPaper.offset[0],
              hotspot.position[1] + sampledPaper.offset[1],
              hotspot.position[2] + sampledPaper.offset[2],
            ]
          : undefined,
        hotspotPosition: hotspot ? [...hotspot.position] : undefined,
        semanticOffset: [...sampledPaper.offset],
        sourceSnapshotId: payload.sourceSnapshotId,
        field: hotspot?.field,
        year: sampledPaper.year,
        color: sampledPaper.color,
        placementRule: "semantic",
      };
    }

    const fullPaper = fullPaperById.get(request.entityId);
    if (!fullPaper) {
      return {
        kind: "paper",
        entityId: request.entityId,
        membership: "missing",
      };
    }
    const fullHotspot = fullHotspotByTopic.get(
      `${fullPaper.field}\u0000${fullPaper.topicId}`,
    );
    const backgroundHotspot = fullHotspot
      ? backgroundHotspotById.get(fullHotspot.id)
      : undefined;
    if (!fullHotspot || !backgroundHotspot) {
      return normalizeAgentGalaxyResolvedEntity(payload, {
        kind: "paper",
        entityId: request.entityId,
        membership: "active-only",
        sourceSnapshotId: payload.sourceSnapshotId,
        field: fullPaper.field,
        year: fullPaper.year,
        color: fullPaper.color,
      });
    }

    const scale = payload.isotropicScale;
    const offset: AgentGalaxyVector3 = [
      (fullPaper.x - fullHotspot.x) * scale,
      (fullPaper.y - fullHotspot.y) * scale,
      (fullPaper.z - fullHotspot.z) * scale,
    ];
    return {
      kind: "paper",
      entityId: request.entityId,
      hotspotId: backgroundHotspot.id,
      membership: "snapshot-unsampled",
      semanticPosition: [
        backgroundHotspot.position[0] + offset[0],
        backgroundHotspot.position[1] + offset[1],
        backgroundHotspot.position[2] + offset[2],
      ],
      hotspotPosition: [...backgroundHotspot.position],
      semanticOffset: offset,
      sourceSnapshotId: payload.sourceSnapshotId,
      field: fullPaper.field,
      year: fullPaper.year,
      color: fullPaper.color,
      placementRule: "semantic",
    };
  });
}

export function findAgentGalaxyReviewEntityIds(
  payload: AgentGalaxyBackgroundPayloadV1,
  fullPayload: App17GalaxyPayload,
) {
  const sampled = new Set(payload.papers.map((paper) => paper.id));
  const snapshotUnsampled = fullPayload.papers.find(
    (paper) => !sampled.has(paper.rawPaperId)
      && !sampled.has(paper.scopedPaperId),
  );
  return {
    sampledPaperId: payload.papers[0]?.id,
    snapshotUnsampledPaperId:
      snapshotUnsampled?.rawPaperId ?? snapshotUnsampled?.scopedPaperId,
    hotspotId: payload.hotspots[0]?.id,
  };
}
