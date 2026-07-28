import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

import type {
  AgentGalaxyBackgroundHotspotV1,
  AgentGalaxyBackgroundPaperV1,
  AgentGalaxyBackgroundPayloadV1,
} from "../types";
import {
  AGENT_GALAXY_FLOW_CONTRACT_VERSION,
  type AgentGalaxyFocusIntent,
  type AgentGalaxyFlowParticleIdentity,
  type AgentGalaxyMotionState,
  type AgentGalaxyVector3,
  type ResolvedAgentGalaxyEntity,
} from "../lib/agentGalaxyFlowContract";
import {
  GRAVITATIONAL_WEAVE_GLSL_CHUNK,
  GRAVITATIONAL_WEAVE_DEFAULT_PARAMETERS,
  GRAVITATIONAL_WEAVE_NODE_COUNT,
  createGravitationalWeaveAssignment,
  createGravitationalWeaveField,
  createGravitationalWeaveUniformValues,
  sampleGravitationalWeavePosition,
  stableFlowIdentityRank,
  type GravitationalWeaveParameters,
  type GravitationalWeaveUniformValues,
} from "../lib/gravitationalWeaveFlow";
import {
  AGENT_GALAXY_FOCUS_DISTANCE,
  AGENT_GALAXY_FOCUS_PROFILES,
  commandAgentGalaxyFocus,
  createAgentGalaxyFocusController,
  estimateAgentGalaxyFocusCloudDiameterRatio,
  releaseAgentGalaxyFocus,
  resolveResidentPaperBaseVisibility,
  sampleAgentGalaxyFocusController,
  selectAgentGalaxyFocusAnchor,
  type AgentGalaxyFocusRuntimeSnapshot,
  type AgentGalaxyFocusSlot,
  type AgentGalaxyResidentFocusTarget,
} from "../lib/agentGalaxyResidentFocus";
import {
  AGENT_GALAXY_FOCUS_FIELD_GLSL_CHUNK,
  agentGalaxyFocusFieldMaximumDisplacement,
  sampleAgentGalaxyFocusFieldOffset,
} from "../lib/agentGalaxyFocusField";
import {
  AGENT_GALAXY_FLAT_SEMANTIC_FRAGMENT_SHADER,
  AGENT_GALAXY_PHOTOSPHERE_CORE_FRAGMENT_SHADER,
  AGENT_GALAXY_PHOTOSPHERE_STYLES,
  AGENT_GALAXY_PHOTOSPHERE_SURFACE_FRAGMENT_SHADER,
  agentGalaxyColorToCssHex,
  agentGalaxyPhotosphereMix,
  createAgentGalaxyFocusTint,
  createAgentGalaxyHotspotTint,
  createAgentGalaxyPaperTint,
  type AgentGalaxyPhotosphereStyle,
} from "../lib/agentGalaxyPhotosphere";
import type {
  AgentGalaxyFlowReviewConfig,
  AgentGalaxyFlowReviewQuality,
} from "../lib/agentGalaxyFlowReview";

export type AgentGalaxyFlowMetrics = {
  averageFrameMs: number;
  p95FrameMs: number;
  averageFps: number;
  dpr: number;
  requestedQuality: AgentGalaxyFlowReviewQuality;
  quality: "balanced" | "high";
  drawCalls: number;
  visibleHotspotCount: number;
  visiblePaperProxyCount: number;
  environmentStarCount: number;
  dustCount: number;
  downgradeReason?: string;
  paused: boolean;
  reducedMotion: boolean;
  fixedTime: boolean;
  sourceSnapshotId: string;
  gpuRenderer: string;
  flowModelId: "gravitational-weave-tech-preview";
  flowContractVersion: string;
  fieldNodeCount: 4;
  semanticCoreTimeOpacity: false;
  semanticBlending: "normal";
  bloomMode: "none";
  depthOfField: false;
  wholeGroupTransform: false;
  cameraMode: "static" | "codrift";
  cameraDriftMaxUnits: number;
  webglAvailable: boolean;
  focusPhase: AgentGalaxyFocusRuntimeSnapshot["phase"];
  focusTargetId?: string;
  focusTargetVertexIndex?: number;
  focusTargetBaseVisible?: boolean;
  focusTargetPromoted?: boolean;
  focusCameraDistance?: number;
  focusAnchorErrorPx?: number;
  focusCloudDiameterRatio?: number;
  focusMaxScreenStepPx?: number;
  focusMaxLumaStepRatio?: number;
  focusAcquisitionBlend?: number;
  focusFieldBlend?: number;
  focusMaterialBlend?: number;
  focusCameraBlend?: number;
  focusReleaseBlend?: number;
  focusTargetCssPixels?: number;
  focusTargetPhotosphereMix?: number;
  focusFieldMaximumWorldDisplacement?: number;
  focusFieldMaximumScreenDisplacementPx?: number;
  focusFieldAffectedVisibleRatio?: number;
  focusSemanticPaperColor?: string;
  focusSemanticHotspotColor?: string;
  starMaterial: "flat" | "photosphere";
  focusFieldEnabled: boolean;
  focusCameraEnabled: boolean;
  semanticCoreDrawCalls: 2;
  semanticSurfaceDrawCalls: 2;
  focusRendererInstanceId: number;
  focusTransitionCount: number;
  contextState: AgentGalaxyMotionState;
  contextTargetId?: string;
  contextTargetKind?: "paper" | "hotspot";
  contextMembership?: ResolvedAgentGalaxyEntity["membership"];
  contextEntityCount: number;
  contextBlend: number;
  contextCloudDiameterRatio: number;
  dynamicEntityCount: number;
};

export type AgentGalaxyContextPresentation = {
  state: AgentGalaxyMotionState;
  target?: ResolvedAgentGalaxyEntity;
  contextEntityIds: readonly string[];
  resolvedEntities?: readonly ResolvedAgentGalaxyEntity[];
  extractionSide: "left" | "right";
  active: boolean;
  evidenceOrder?: readonly string[];
};

type Props = {
  payload: AgentGalaxyBackgroundPayloadV1;
  config: AgentGalaxyFlowReviewConfig;
  focusIntent?: AgentGalaxyFocusIntent;
  motionState?: AgentGalaxyMotionState;
  contextPresentation?: AgentGalaxyContextPresentation;
  presentationProfile?: "analysis" | "immersive";
  reducedMotion?: boolean;
  onMetrics?: (metrics: AgentGalaxyFlowMetrics) => void;
  onFocusSnapshot?: (snapshot: AgentGalaxyFocusRuntimeSnapshot) => void;
};

type ResolvedQuality = "balanced" | "high";

type LayerBudget = {
  papers: number;
  hotspots: number;
  environment: number;
  dust: number;
};

export const AGENT_GALAXY_FLOW_QUALITY_BUDGET: Record<ResolvedQuality, LayerBudget> = {
  balanced: {
    papers: 1920,
    hotspots: 55,
    environment: 800,
    dust: 1600,
  },
  high: {
    papers: 2560,
    hotspots: 75,
    environment: 1200,
    dust: 2600,
  },
};

export const AGENT_GALAXY_FLOW_CAMERA = {
  distance: 105,
  azimuthDegrees: 270,
  elevationDegrees: 50,
  codriftMaxUnits: 0.6,
  codriftPeriodSeconds: 67,
} as const;

export const AGENT_GALAXY_FLOW_SNAPSHOT_SIZE = {
  width: 3840,
  height: 2160,
} as const;

export const AGENT_GALAXY_FLOW_STAR_CROP = {
  x: 640,
  y: 360,
  width: 1024,
  height: 768,
} as const;

export const AGENT_GALAXY_SHARP_SEMANTIC_FRAGMENT_SHADER =
  AGENT_GALAXY_PHOTOSPHERE_CORE_FRAGMENT_SHADER;

const AGENT_GALAXY_DECORATIVE_FRAGMENT_SHADER = `
  uniform vec3 uTint;
  uniform float uOpacity;
  varying float vLuma;
  varying float vDepthLuma;
  varying float vFocusLuma;
  varying float vVertexVisibility;

  void main() {
    if (vVertexVisibility < 0.0001) discard;
    vec2 centered = gl_PointCoord - vec2(0.5);
    float radius = length(centered);
    if (radius > 0.5) discard;

    float edgeAa = clamp(fwidth(radius), 0.01, 0.09);
    float coverage = 1.0 - smoothstep(
      0.43 - edgeAa,
      0.43 + edgeAa,
      radius
    );
    float core = 1.0 - smoothstep(0.035, 0.16, radius);
    float alpha = coverage
      * (0.5 + core * 0.5)
      * uOpacity
      * vLuma
      * vDepthLuma;
    if (alpha < 0.004) discard;

    gl_FragColor = vec4(
      min(vec3(1.0), uTint * (0.74 + core * 0.22) * vFocusLuma),
      alpha
    );
  }
`;

type WeaveGeometryResult = {
  geometry: THREE.BufferGeometry;
  count: number;
};

type PaperVertexMetadata = {
  identity: AgentGalaxyFlowParticleIdentity;
  paper: AgentGalaxyBackgroundPaperV1;
  hotspot: AgentGalaxyBackgroundHotspotV1;
  vertexIndex: number;
  hotspotIndex: number;
  neighborhoodRadius: number;
  baseCssSize: number;
  paperTint: AgentGalaxyVector3;
  hotspotTint: AgentGalaxyVector3;
};

type PaperGeometryResult = WeaveGeometryResult & {
  paperById: Map<string, PaperVertexMetadata>;
  papersByHotspotId: Map<string, PaperVertexMetadata[]>;
};

type DynamicPaperGeometryResult = PaperGeometryResult & {
  entityIdBySlot: Array<string | undefined>;
};

type HotspotVertexMetadata = {
  hotspot: AgentGalaxyBackgroundHotspotV1;
  vertexIndex: number;
  hotspotIndex: number;
};

type HotspotGeometryResult = WeaveGeometryResult & {
  hotspotById: Map<string, HotspotVertexMetadata>;
};

type PointLayerMode = "paper" | "hotspot" | "free";

type PointMaterialOptions = {
  mode: PointLayerMode;
  minimumCssPixels: number;
  maximumCssPixels: number;
  tint: string;
  opacity: number;
  flowScale: number;
  semantic: boolean;
  weaveUniforms: GravitationalWeaveUniformValues;
  focusable?: boolean;
  focusReactive?: boolean;
  contextual?: boolean;
  hotspotBudgeted?: boolean;
  semanticPass?: "core" | "surface";
  photosphereStyle?: AgentGalaxyPhotosphereStyle;
  starMaterial?: "flat" | "photosphere";
};

let nextFocusRendererInstanceId = 1;
const DEFAULT_FOCUS_TANGENT = new THREE.Vector3(0, 1, 0);

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function smootherstep(value: number) {
  const t = clamp(value, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function primaryFocusCameraCap(
  mode: AgentGalaxyFocusIntent["mode"] | undefined,
) {
  if (mode === "soft-focus") return 0.08;
  if (mode === "full-focus") return 0.15;
  return 0;
}

function hashString32(value: string) {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function createRandom(seed: number) {
  let state = seed || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

function p95(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
}

function detectGpuRenderer(renderer: THREE.WebGLRenderer) {
  const context = renderer.getContext();
  const extension = context.getExtension("WEBGL_debug_renderer_info");
  if (!extension) return "WebGL renderer unavailable";
  return String(context.getParameter(extension.UNMASKED_RENDERER_WEBGL) || "Unknown WebGL renderer");
}

function resolveInitialQuality(
  requested: AgentGalaxyFlowReviewQuality,
  gpuRenderer: string,
): ResolvedQuality {
  if (requested === "high") return "high";
  if (requested === "balanced") return "balanced";
  return /nvidia|geforce|radeon|rx\s|rtx/i.test(gpuRenderer) ? "high" : "balanced";
}

function setInitialCameraPose(camera: THREE.PerspectiveCamera) {
  const azimuth = THREE.MathUtils.degToRad(AGENT_GALAXY_FLOW_CAMERA.azimuthDegrees);
  const elevation = THREE.MathUtils.degToRad(AGENT_GALAXY_FLOW_CAMERA.elevationDegrees);
  const horizontal = AGENT_GALAXY_FLOW_CAMERA.distance * Math.cos(elevation);
  camera.position.set(
    horizontal * Math.cos(azimuth),
    AGENT_GALAXY_FLOW_CAMERA.distance * Math.sin(elevation),
    horizontal * Math.sin(azimuth),
  );
  camera.lookAt(0, 0, 0);
}

function identityKey(identity: AgentGalaxyFlowParticleIdentity) {
  return `${identity.kind}:${identity.entityId}`;
}

function paperIdentity(
  payload: AgentGalaxyBackgroundPayloadV1,
  paper: AgentGalaxyBackgroundPaperV1,
  hotspot: AgentGalaxyBackgroundHotspotV1,
): AgentGalaxyFlowParticleIdentity {
  return {
    kind: "paper",
    entityId: paper.id,
    hotspotId: paper.hotspotId,
    sourceSnapshotId: payload.sourceSnapshotId,
    semanticPosition: [
      hotspot.position[0] + paper.offset[0],
      hotspot.position[1] + paper.offset[1],
      hotspot.position[2] + paper.offset[2],
    ],
    semanticOffset: [...paper.offset],
  };
}

function hotspotIdentity(
  payload: AgentGalaxyBackgroundPayloadV1,
  hotspot: AgentGalaxyBackgroundHotspotV1,
): AgentGalaxyFlowParticleIdentity {
  return {
    kind: "hotspot",
    entityId: hotspot.id,
    hotspotId: hotspot.id,
    sourceSnapshotId: payload.sourceSnapshotId,
    semanticPosition: [...hotspot.position],
    semanticOffset: [0, 0, 0],
  };
}

function createPaperGeometry(payload: AgentGalaxyBackgroundPayloadV1): PaperGeometryResult {
  const hotspotById = new Map(payload.hotspots.map((hotspot) => [hotspot.id, hotspot]));
  const identityByKey = new Map<string, AgentGalaxyFlowParticleIdentity>();
  const paperById = new Map(payload.papers.map((paper) => [paper.id, paper]));
  const identities: AgentGalaxyFlowParticleIdentity[] = [];
  const hotspotIndexById = new Map(
    [...payload.hotspots]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((hotspot, index) => [hotspot.id, index]),
  );
  const offsetLengthsByHotspot = new Map<string, number[]>();

  for (const paper of payload.papers) {
    const hotspot = hotspotById.get(paper.hotspotId);
    if (!hotspot) continue;
    const identity = paperIdentity(payload, paper, hotspot);
    identities.push(identity);
    identityByKey.set(identityKey(identity), identity);
    const values = offsetLengthsByHotspot.get(paper.hotspotId) ?? [];
    values.push(Math.hypot(...paper.offset));
    offsetLengthsByHotspot.set(paper.hotspotId, values);
  }

  const ordered = [...identities].sort((left, right) => {
    const rankDifference = stableFlowIdentityRank(
      left,
      "agent-flow-paper-visibility-v1",
    ) - stableFlowIdentityRank(
      right,
      "agent-flow-paper-visibility-v1",
    );
    if (rankDifference !== 0) return rankDifference;
    return left.entityId.localeCompare(right.entityId);
  });
  const positions: number[] = [];
  const anchors: number[] = [];
  const offsets: number[] = [];
  const sizes: number[] = [];
  const lumas: number[] = [];
  const stableOrders: number[] = [];
  const entityIndices: number[] = [];
  const hotspotIndices: number[] = [];
  const semanticTints: number[] = [];
  const contextRolesA: number[] = [];
  const contextRolesB: number[] = [];
  const contextOrdersA: number[] = [];
  const contextOrdersB: number[] = [];
  const vertexMetadataByPaperId = new Map<string, PaperVertexMetadata>();
  const vertexMetadataByHotspotId = new Map<string, PaperVertexMetadata[]>();

  for (const [stableOrder, orderedIdentity] of ordered.entries()) {
    const identity = identityByKey.get(identityKey(orderedIdentity)) ?? orderedIdentity;
    const paper = paperById.get(identity.entityId);
    const hotspot = paper ? hotspotById.get(paper.hotspotId) : undefined;
    if (!paper || !hotspot) continue;
    const assignment = createGravitationalWeaveAssignment(identity);
    const yearLuma = paper.year ? clamp((paper.year - 2012) / 16, 0.2, 1) : 0.5;
    const sizeSeed = assignment.seed / 0xffff_ffff;
    const vertexIndex = positions.length / 3;
    const hotspotIndex = hotspotIndexById.get(hotspot.id) ?? -1;
    const neighborhoodRadius = clamp(
      p95(offsetLengthsByHotspot.get(hotspot.id) ?? []) * 0.75,
      5,
      12,
    );
    const baseCssSize = 1.6 + sizeSeed * 0.65 + yearLuma * 0.55;
    const paperTint = createAgentGalaxyPaperTint(
      hotspot.color || paper.color,
    );
    const hotspotTint = createAgentGalaxyHotspotTint(
      hotspot.color || paper.color,
    );
    positions.push(
      hotspot.position[0] + paper.offset[0],
      hotspot.position[1] + paper.offset[1],
      hotspot.position[2] + paper.offset[2],
    );
    anchors.push(...hotspot.position);
    offsets.push(...paper.offset);
    sizes.push(baseCssSize);
    lumas.push(0.82 + yearLuma * 0.12 + sizeSeed * 0.06);
    stableOrders.push(stableOrder);
    entityIndices.push(vertexIndex);
    hotspotIndices.push(hotspotIndex);
    semanticTints.push(...paperTint);
    contextRolesA.push(0);
    contextRolesB.push(0);
    contextOrdersA.push(1);
    contextOrdersB.push(1);
    const metadata: PaperVertexMetadata = {
      identity,
      paper,
      hotspot,
      vertexIndex,
      hotspotIndex,
      neighborhoodRadius,
      baseCssSize,
      paperTint,
      hotspotTint,
    };
    vertexMetadataByPaperId.set(paper.id, metadata);
    const hotspotPapers = vertexMetadataByHotspotId.get(hotspot.id) ?? [];
    hotspotPapers.push(metadata);
    vertexMetadataByHotspotId.set(hotspot.id, hotspotPapers);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aHotspotAnchor", new THREE.Float32BufferAttribute(anchors, 3));
  geometry.setAttribute("aSemanticOffset", new THREE.Float32BufferAttribute(offsets, 3));
  geometry.setAttribute("aSize", new THREE.Float32BufferAttribute(sizes, 1));
  geometry.setAttribute("aLuma", new THREE.Float32BufferAttribute(lumas, 1));
  geometry.setAttribute("aStableOrder", new THREE.Float32BufferAttribute(stableOrders, 1));
  geometry.setAttribute("aEntityIndex", new THREE.Float32BufferAttribute(entityIndices, 1));
  geometry.setAttribute("aHotspotIndex", new THREE.Float32BufferAttribute(hotspotIndices, 1));
  geometry.setAttribute("aContextRoleA", new THREE.Float32BufferAttribute(contextRolesA, 1));
  geometry.setAttribute("aContextRoleB", new THREE.Float32BufferAttribute(contextRolesB, 1));
  geometry.setAttribute("aContextOrderA", new THREE.Float32BufferAttribute(contextOrdersA, 1));
  geometry.setAttribute("aContextOrderB", new THREE.Float32BufferAttribute(contextOrdersB, 1));
  geometry.setAttribute(
    "aSemanticTint",
    new THREE.Float32BufferAttribute(semanticTints, 3),
  );
  geometry.computeBoundingSphere();
  return {
    geometry,
    count: positions.length / 3,
    paperById: vertexMetadataByPaperId,
    papersByHotspotId: vertexMetadataByHotspotId,
  };
}

function createDynamicPaperGeometry(
  maximumCount: number,
): DynamicPaperGeometryResult {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(new Float32Array(maximumCount * 3), 3),
  );
  geometry.setAttribute(
    "aHotspotAnchor",
    new THREE.Float32BufferAttribute(new Float32Array(maximumCount * 3), 3),
  );
  geometry.setAttribute(
    "aSemanticOffset",
    new THREE.Float32BufferAttribute(new Float32Array(maximumCount * 3), 3),
  );
  geometry.setAttribute(
    "aSize",
    new THREE.Float32BufferAttribute(
      new Float32Array(maximumCount).fill(2.1),
      1,
    ),
  );
  geometry.setAttribute(
    "aLuma",
    new THREE.Float32BufferAttribute(
      new Float32Array(maximumCount).fill(0.92),
      1,
    ),
  );
  geometry.setAttribute(
    "aStableOrder",
    new THREE.Float32BufferAttribute(
      new Float32Array(maximumCount).fill(1_000_000),
      1,
    ),
  );
  geometry.setAttribute(
    "aEntityIndex",
    new THREE.Float32BufferAttribute(new Float32Array(maximumCount), 1),
  );
  geometry.setAttribute(
    "aHotspotIndex",
    new THREE.Float32BufferAttribute(
      new Float32Array(maximumCount).fill(-10_000),
      1,
    ),
  );
  geometry.setAttribute(
    "aSemanticTint",
    new THREE.Float32BufferAttribute(
      new Float32Array(maximumCount * 3).fill(0.78),
      3,
    ),
  );
  geometry.setAttribute(
    "aContextRoleA",
    new THREE.Float32BufferAttribute(new Float32Array(maximumCount), 1),
  );
  geometry.setAttribute(
    "aContextRoleB",
    new THREE.Float32BufferAttribute(new Float32Array(maximumCount), 1),
  );
  geometry.setAttribute(
    "aContextOrderA",
    new THREE.Float32BufferAttribute(
      new Float32Array(maximumCount).fill(1),
      1,
    ),
  );
  geometry.setAttribute(
    "aContextOrderB",
    new THREE.Float32BufferAttribute(
      new Float32Array(maximumCount).fill(1),
      1,
    ),
  );
  geometry.setDrawRange(0, maximumCount);
  geometry.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(),
    Number.POSITIVE_INFINITY,
  );
  return {
    geometry,
    count: maximumCount,
    paperById: new Map(),
    papersByHotspotId: new Map(),
    entityIdBySlot: Array.from({ length: maximumCount }),
  };
}

function updateDynamicPaperGeometry(
  result: DynamicPaperGeometryResult,
  payload: AgentGalaxyBackgroundPayloadV1,
  entities: readonly ResolvedAgentGalaxyEntity[],
  baseEntityIndex: number,
  hotspotResult: HotspotGeometryResult,
) {
  const dynamicEntities = entities
    .filter((entity) => (
      entity.kind === "paper"
      && entity.membership !== "sampled"
      && entity.membership !== "missing"
      && entity.hotspotPosition
      && entity.semanticOffset
    ))
    .slice(0, result.count);
  const desiredById = new Map(
    dynamicEntities.map((entity) => [entity.entityId, entity]),
  );
  const entityBySlot: Array<ResolvedAgentGalaxyEntity | undefined> =
    Array.from({ length: result.count });
  for (let slot = 0; slot < result.count; slot += 1) {
    const existingId = result.entityIdBySlot[slot];
    if (!existingId) continue;
    const existing = desiredById.get(existingId);
    if (!existing) continue;
    entityBySlot[slot] = existing;
    desiredById.delete(existingId);
  }
  for (const entity of desiredById.values()) {
    const slot = entityBySlot.findIndex((candidate) => !candidate);
    if (slot < 0) break;
    entityBySlot[slot] = entity;
  }
  const attributes = [
    "position",
    "aHotspotAnchor",
    "aSemanticOffset",
    "aSize",
    "aLuma",
    "aStableOrder",
    "aEntityIndex",
    "aHotspotIndex",
    "aSemanticTint",
    "aContextRoleA",
    "aContextRoleB",
    "aContextOrderA",
    "aContextOrderB",
  ] as const;
  result.paperById.clear();
  result.papersByHotspotId.clear();
  result.entityIdBySlot.fill(undefined);

  for (let slot = 0; slot < result.count; slot += 1) {
    const entity = entityBySlot[slot];
    const anchor = entity?.hotspotPosition ?? [0, 0, 0];
    const offset = entity?.semanticOffset ?? [0, 0, 0];
    const hotspotMetadata = entity?.hotspotId
      ? hotspotResult.hotspotById.get(entity.hotspotId)
      : undefined;
    const fallbackHotspot: AgentGalaxyBackgroundHotspotV1 = {
      id: entity?.hotspotId ?? `unclassified:${entity?.entityId ?? slot}`,
      position: [...anchor],
      field: entity?.field ?? "Unclassified",
      color: entity?.color ?? "#aeb8bf",
      trend: "stable",
      paperCount: 1,
    };
    const hotspot = hotspotMetadata?.hotspot ?? fallbackHotspot;
    const paper: AgentGalaxyBackgroundPaperV1 = {
      id: entity?.entityId ?? `dynamic-empty:${slot}`,
      hotspotId: hotspot.id,
      offset: [...offset],
      color: entity?.color ?? hotspot.color,
      year: entity?.year,
    };
    const position = result.geometry.getAttribute("position") as THREE.BufferAttribute;
    const anchorAttribute = result.geometry.getAttribute(
      "aHotspotAnchor",
    ) as THREE.BufferAttribute;
    const offsetAttribute = result.geometry.getAttribute(
      "aSemanticOffset",
    ) as THREE.BufferAttribute;
    const size = result.geometry.getAttribute("aSize") as THREE.BufferAttribute;
    const luma = result.geometry.getAttribute("aLuma") as THREE.BufferAttribute;
    const stableOrder = result.geometry.getAttribute(
      "aStableOrder",
    ) as THREE.BufferAttribute;
    const entityIndex = result.geometry.getAttribute(
      "aEntityIndex",
    ) as THREE.BufferAttribute;
    const hotspotIndex = result.geometry.getAttribute(
      "aHotspotIndex",
    ) as THREE.BufferAttribute;
    const tint = result.geometry.getAttribute(
      "aSemanticTint",
    ) as THREE.BufferAttribute;
    const paperTint = createAgentGalaxyPaperTint(paper.color);
    position.setXYZ(
      slot,
      anchor[0] + offset[0],
      anchor[1] + offset[1],
      anchor[2] + offset[2],
    );
    anchorAttribute.setXYZ(slot, anchor[0], anchor[1], anchor[2]);
    offsetAttribute.setXYZ(slot, offset[0], offset[1], offset[2]);
    size.setX(slot, entity ? 2.2 : 0);
    luma.setX(slot, entity ? 0.94 : 0);
    stableOrder.setX(slot, 1_000_000 + slot);
    entityIndex.setX(slot, baseEntityIndex + slot);
    hotspotIndex.setX(slot, hotspotMetadata?.hotspotIndex ?? -10_000 - slot);
    tint.setXYZ(slot, paperTint[0], paperTint[1], paperTint[2]);
    if (!entity) continue;
    result.entityIdBySlot[slot] = entity.entityId;
    const metadata: PaperVertexMetadata = {
      identity: {
        kind: "paper",
        entityId: entity.entityId,
        hotspotId: entity.hotspotId,
        sourceSnapshotId: entity.sourceSnapshotId
          ?? payload.sourceSnapshotId,
        semanticPosition: entity.semanticPosition,
        semanticOffset: [...offset],
      },
      paper,
      hotspot,
      vertexIndex: baseEntityIndex + slot,
      hotspotIndex: hotspotMetadata?.hotspotIndex ?? -10_000 - slot,
      neighborhoodRadius: 7,
      baseCssSize: 2.2,
      paperTint,
      hotspotTint: createAgentGalaxyHotspotTint(hotspot.color),
    };
    result.paperById.set(entity.entityId, metadata);
    const siblings = result.papersByHotspotId.get(hotspot.id) ?? [];
    siblings.push(metadata);
    result.papersByHotspotId.set(hotspot.id, siblings);
  }
  for (const attributeName of attributes) {
    const attribute = result.geometry.getAttribute(attributeName);
    if (attribute instanceof THREE.BufferAttribute) attribute.needsUpdate = true;
  }
}

function createHotspotGeometry(payload: AgentGalaxyBackgroundPayloadV1): HotspotGeometryResult {
  const hotspotById = new Map(payload.hotspots.map((hotspot) => [hotspot.id, hotspot]));
  const identities = payload.hotspots.map((hotspot) => hotspotIdentity(payload, hotspot));
  const ordered = [...identities].sort((left, right) => {
    const rankDifference = stableFlowIdentityRank(
      left,
      "agent-flow-hotspot-visibility-v1",
    ) - stableFlowIdentityRank(
      right,
      "agent-flow-hotspot-visibility-v1",
    );
    return rankDifference || left.entityId.localeCompare(right.entityId);
  });
  const positions: number[] = [];
  const anchors: number[] = [];
  const offsets: number[] = [];
  const sizes: number[] = [];
  const lumas: number[] = [];
  const semanticTints: number[] = [];
  const stableOrders: number[] = [];
  const entityIndices: number[] = [];
  const hotspotIndices: number[] = [];
  const contextRolesA: number[] = [];
  const contextRolesB: number[] = [];
  const contextOrdersA: number[] = [];
  const contextOrdersB: number[] = [];
  const vertexMetadata = new Map<string, HotspotVertexMetadata>();

  for (const [stableOrder, identity] of ordered.entries()) {
    const hotspot = hotspotById.get(identity.entityId);
    if (!hotspot) continue;
    const assignment = createGravitationalWeaveAssignment(identity);
    const sizeSeed = assignment.seed / 0xffff_ffff;
    positions.push(...hotspot.position);
    anchors.push(...hotspot.position);
    offsets.push(0, 0, 0);
    sizes.push(clamp(
      3.6 + Math.log2(Math.max(2, hotspot.paperCount)) * 0.24 + sizeSeed * 0.42,
      3.6,
      6.2,
    ));
    lumas.push(0.86 + sizeSeed * 0.1);
    semanticTints.push(...createAgentGalaxyHotspotTint(hotspot.color));
    const vertexIndex = positions.length / 3 - 1;
    stableOrders.push(stableOrder);
    entityIndices.push(vertexIndex);
    hotspotIndices.push(vertexIndex);
    contextRolesA.push(0);
    contextRolesB.push(0);
    contextOrdersA.push(1);
    contextOrdersB.push(1);
    vertexMetadata.set(hotspot.id, {
      hotspot,
      vertexIndex,
      hotspotIndex: vertexIndex,
    });
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aHotspotAnchor", new THREE.Float32BufferAttribute(anchors, 3));
  geometry.setAttribute("aSemanticOffset", new THREE.Float32BufferAttribute(offsets, 3));
  geometry.setAttribute("aSize", new THREE.Float32BufferAttribute(sizes, 1));
  geometry.setAttribute("aLuma", new THREE.Float32BufferAttribute(lumas, 1));
  geometry.setAttribute("aStableOrder", new THREE.Float32BufferAttribute(stableOrders, 1));
  geometry.setAttribute("aEntityIndex", new THREE.Float32BufferAttribute(entityIndices, 1));
  geometry.setAttribute("aHotspotIndex", new THREE.Float32BufferAttribute(hotspotIndices, 1));
  geometry.setAttribute("aContextRoleA", new THREE.Float32BufferAttribute(contextRolesA, 1));
  geometry.setAttribute("aContextRoleB", new THREE.Float32BufferAttribute(contextRolesB, 1));
  geometry.setAttribute("aContextOrderA", new THREE.Float32BufferAttribute(contextOrdersA, 1));
  geometry.setAttribute("aContextOrderB", new THREE.Float32BufferAttribute(contextOrdersB, 1));
  geometry.setAttribute(
    "aSemanticTint",
    new THREE.Float32BufferAttribute(semanticTints, 3),
  );
  geometry.computeBoundingSphere();
  return {
    geometry,
    count: positions.length / 3,
    hotspotById: vertexMetadata,
  };
}

function createFreeGeometry(
  payload: AgentGalaxyBackgroundPayloadV1,
  kind: "environment" | "dust",
): WeaveGeometryResult {
  const maximumCount = kind === "environment"
    ? AGENT_GALAXY_FLOW_QUALITY_BUDGET.high.environment
    : AGENT_GALAXY_FLOW_QUALITY_BUDGET.high.dust;
  const random = createRandom(hashString32(
    `${payload.sourceSnapshotId}:gravitational-weave:${kind}:v1`,
  ));
  const positions: number[] = [];
  const anchors: number[] = [];
  const offsets: number[] = [];
  const sizes: number[] = [];
  const lumas: number[] = [];

  for (let index = 0; index < maximumCount; index += 1) {
    const radius = kind === "environment"
      ? 58 + random() * 130
      : 4 + Math.cbrt(random()) * 82;
    const longitude = random() * Math.PI * 2;
    const latitude = Math.acos(2 * random() - 1);
    const position: AgentGalaxyVector3 = [
      Math.sin(latitude) * Math.cos(longitude) * radius,
      Math.cos(latitude) * radius * (kind === "environment" ? 0.82 : 1),
      Math.sin(latitude) * Math.sin(longitude) * radius,
    ];
    positions.push(...position);
    anchors.push(...position);
    offsets.push(0, 0, 0);
    if (kind === "environment") {
      sizes.push(0.76 + random() * 0.72);
      lumas.push(0.35 + random() * 0.3);
    } else {
      sizes.push(0.42 + random() * 0.48);
      lumas.push(0.1 + random() * 0.18);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aHotspotAnchor", new THREE.Float32BufferAttribute(anchors, 3));
  geometry.setAttribute("aSemanticOffset", new THREE.Float32BufferAttribute(offsets, 3));
  geometry.setAttribute("aSize", new THREE.Float32BufferAttribute(sizes, 1));
  geometry.setAttribute("aLuma", new THREE.Float32BufferAttribute(lumas, 1));
  geometry.computeBoundingSphere();
  return { geometry, count: positions.length / 3 };
}

function asThreeUniformValue(value: unknown): unknown {
  if (
    Array.isArray(value)
    && value.length === 3
    && value.every((entry) => typeof entry === "number")
  ) {
    return new THREE.Vector3(value[0], value[1], value[2]);
  }
  if (
    Array.isArray(value)
    && value.length > 0
    && value.every((entry) => (
      Array.isArray(entry)
      && entry.length === 3
      && entry.every((component) => typeof component === "number")
    ))
  ) {
    return value.map((entry) => new THREE.Vector3(entry[0], entry[1], entry[2]));
  }
  return value;
}

function createThreeWeaveUniforms(
  values: GravitationalWeaveUniformValues,
) {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      { value: asThreeUniformValue(value) },
    ]),
  ) as Record<string, THREE.IUniform>;
}

function createPointMaterial(options: PointMaterialOptions) {
  const positionExpression = options.mode === "paper"
    ? "agentGalaxyWeavePaperPosition(aHotspotAnchor, aSemanticOffset)"
    : options.mode === "hotspot"
      ? "agentGalaxyWeaveHotspotPosition(aHotspotAnchor)"
      : "agentGalaxyWeaveFreePosition(position)";
  const originalExpression = options.mode === "paper"
    ? "aHotspotAnchor + aSemanticOffset"
    : options.mode === "hotspot"
      ? "aHotspotAnchor"
      : "position";
  const hasFocusUniforms = Boolean(options.focusable || options.focusReactive);
  const hasContextUniforms = Boolean(options.contextual);
  const focusUniforms: Record<string, THREE.IUniform> = hasFocusUniforms ? {
    uFocusFieldEnabled: { value: 1 },
    uVisiblePaperBudget: { value: 0 },
    uFocusAWeight: { value: 0 },
    uFocusAAcquisitionBlend: { value: 0 },
    uFocusAFieldBlend: { value: 0 },
    uFocusAMaterialBlend: { value: 0 },
    uFocusATargetVertexIndex: { value: -1 },
    uFocusATargetHotspotIndex: { value: -1 },
    uFocusATargetAnchor: { value: new THREE.Vector3() },
    uFocusATargetOffset: { value: new THREE.Vector3() },
    uFocusATangent: { value: new THREE.Vector3(0, 1, 0) },
    uFocusASeed: { value: 0 },
    uFocusARadius: { value: 5 },
    uFocusAPhaseLock: { value: 0 },
    uFocusACompression: { value: 0 },
    uFocusASizeMultiplier: { value: 1 },
    uFocusATargetCssPixels: { value: 4.2 },
    uFocusALumaMultiplier: { value: 1 },
    uFocusAColorBlend: { value: 0 },
    uFocusANeighborDim: { value: 0 },
    uFocusATint: { value: new THREE.Color("#b7c6d1") },
    uFocusBWeight: { value: 0 },
    uFocusBAcquisitionBlend: { value: 0 },
    uFocusBFieldBlend: { value: 0 },
    uFocusBMaterialBlend: { value: 0 },
    uFocusBTargetVertexIndex: { value: -1 },
    uFocusBTargetHotspotIndex: { value: -1 },
    uFocusBTargetAnchor: { value: new THREE.Vector3() },
    uFocusBTargetOffset: { value: new THREE.Vector3() },
    uFocusBTangent: { value: new THREE.Vector3(0, 1, 0) },
    uFocusBSeed: { value: 0 },
    uFocusBRadius: { value: 5 },
    uFocusBPhaseLock: { value: 0 },
    uFocusBCompression: { value: 0 },
    uFocusBSizeMultiplier: { value: 1 },
    uFocusBTargetCssPixels: { value: 4.2 },
    uFocusBLumaMultiplier: { value: 1 },
    uFocusBColorBlend: { value: 0 },
    uFocusBNeighborDim: { value: 0 },
    uFocusBTint: { value: new THREE.Color("#b7c6d1") },
  } : {};
  const contextUniforms: Record<string, THREE.IUniform> = hasContextUniforms ? {
    uContextABlend: { value: 0 },
    uContextBBlend: { value: 0 },
    uContextAEvidenceProgress: { value: 1 },
    uContextBEvidenceProgress: { value: 1 },
    uContextATranslation: { value: new THREE.Vector3() },
    uContextBTranslation: { value: new THREE.Vector3() },
    uContextBackgroundLuma: { value: 0.68 },
    uContextPaperLuma: { value: 1.22 },
    uContextTargetLuma: { value: 1.7 },
    uContextTargetCssPixels: { value: 4.8 },
    uVisibleHotspotBudget: { value: 0 },
  } : {};
  const commonFocusDeclarations = hasFocusUniforms ? `
      uniform float uFocusFieldEnabled;
      uniform float uFocusAWeight;
      uniform float uFocusAAcquisitionBlend;
      uniform float uFocusAFieldBlend;
      uniform float uFocusAMaterialBlend;
      uniform float uFocusATargetVertexIndex;
      uniform float uFocusATargetHotspotIndex;
      uniform vec3 uFocusATargetAnchor;
      uniform vec3 uFocusATargetOffset;
      uniform vec3 uFocusATangent;
      uniform float uFocusASeed;
      uniform float uFocusARadius;
      uniform float uFocusAPhaseLock;
      uniform float uFocusACompression;
      uniform float uFocusASizeMultiplier;
      uniform float uFocusATargetCssPixels;
      uniform float uFocusALumaMultiplier;
      uniform float uFocusAColorBlend;
      uniform float uFocusANeighborDim;
      uniform vec3 uFocusATint;

      uniform float uFocusBWeight;
      uniform float uFocusBAcquisitionBlend;
      uniform float uFocusBFieldBlend;
      uniform float uFocusBMaterialBlend;
      uniform float uFocusBTargetVertexIndex;
      uniform float uFocusBTargetHotspotIndex;
      uniform vec3 uFocusBTargetAnchor;
      uniform vec3 uFocusBTargetOffset;
      uniform vec3 uFocusBTangent;
      uniform float uFocusBSeed;
      uniform float uFocusBRadius;
      uniform float uFocusBPhaseLock;
      uniform float uFocusBCompression;
      uniform float uFocusBSizeMultiplier;
      uniform float uFocusBTargetCssPixels;
      uniform float uFocusBLumaMultiplier;
      uniform float uFocusBColorBlend;
      uniform float uFocusBNeighborDim;
      uniform vec3 uFocusBTint;
  ` : "";
  const focusDeclarations = options.focusable ? `
      attribute float aStableOrder;
      attribute float aEntityIndex;
      attribute float aHotspotIndex;
      uniform float uVisiblePaperBudget;

      vec4 agentFocusCandidate(
        vec3 livePosition,
        vec3 targetAnchor,
        vec3 targetOffset,
        vec3 targetTangent,
        float targetHotspotIndex,
        float targetSeed,
        float fieldBlend,
        float radius,
        float phaseLock,
        float compression
      ) {
        float sameHotspot = 1.0 - step(
          0.5,
          abs(aHotspotIndex - targetHotspotIndex)
        );
        vec3 semanticRelative = (
          aHotspotAnchor + aSemanticOffset
        ) - (
          targetAnchor + targetOffset
        );
        float semanticDistance = length(semanticRelative);
        float neighborhood = 1.0 - smoothstep(
          max(0.1, radius * 0.58),
          max(0.2, radius),
          semanticDistance
        );
        float influence = sameHotspot
          * neighborhood
          * clamp(fieldBlend, 0.0, 1.0);
        vec3 targetPosition = agentGalaxyWeavePaperPosition(
          targetAnchor,
          targetOffset
        );
        vec3 liveRelative = livePosition - targetPosition;
        vec3 lockedRelative = mix(
          liveRelative,
          semanticRelative * (1.0 - compression),
          clamp(phaseLock * fieldBlend, 0.0, 1.0)
        );
        vec3 tidalOffset = agentGalaxyFocusFieldOffset(
          semanticRelative,
          targetTangent,
          radius,
          fieldBlend,
          targetSeed
        ).xyz;
        return vec4(
          targetPosition + lockedRelative + tidalOffset,
          influence
        );
      }
  ` : "";
  const contextDeclarations = hasContextUniforms ? `
      attribute float aContextRoleA;
      attribute float aContextRoleB;
      attribute float aContextOrderA;
      attribute float aContextOrderB;
      uniform float uContextABlend;
      uniform float uContextBBlend;
      uniform float uContextAEvidenceProgress;
      uniform float uContextBEvidenceProgress;
      uniform vec3 uContextATranslation;
      uniform vec3 uContextBTranslation;
      uniform float uContextBackgroundLuma;
      uniform float uContextPaperLuma;
      uniform float uContextTargetLuma;
      uniform float uContextTargetCssPixels;
      ${options.hotspotBudgeted ? `
      attribute float aStableOrder;
      uniform float uVisibleHotspotBudget;
      ` : ""}
  ` : "";
  const focusPositionBlock = options.focusable ? `
        vec4 focusCandidateA = agentFocusCandidate(
          flowPosition,
          uFocusATargetAnchor,
          uFocusATargetOffset,
          uFocusATangent,
          uFocusATargetHotspotIndex,
          uFocusASeed,
          uFocusAFieldBlend * uFocusFieldEnabled,
          uFocusARadius,
          uFocusAPhaseLock,
          uFocusACompression
        );
        vec4 focusCandidateB = agentFocusCandidate(
          flowPosition,
          uFocusBTargetAnchor,
          uFocusBTargetOffset,
          uFocusBTangent,
          uFocusBTargetHotspotIndex,
          uFocusBSeed,
          uFocusBFieldBlend * uFocusFieldEnabled,
          uFocusBRadius,
          uFocusBPhaseLock,
          uFocusBCompression
        );
        float focusWeightSum = focusCandidateA.w + focusCandidateB.w;
        if (focusWeightSum > 0.000001) {
          vec3 focusPosition = (
            focusCandidateA.xyz * focusCandidateA.w
            + focusCandidateB.xyz * focusCandidateB.w
          ) / focusWeightSum;
          flowPosition = mix(
            flowPosition,
            focusPosition,
            clamp(focusWeightSum, 0.0, 1.0)
          );
        }

        float isTargetA = 1.0 - step(
          0.5,
          abs(aEntityIndex - uFocusATargetVertexIndex)
        );
        float isTargetB = 1.0 - step(
          0.5,
          abs(aEntityIndex - uFocusBTargetVertexIndex)
        );
        float targetStyleA = isTargetA
          * clamp(uFocusAAcquisitionBlend, 0.0, 1.0);
        float targetStyleB = isTargetB
          * clamp(uFocusBAcquisitionBlend, 0.0, 1.0);
        float targetStyle = max(targetStyleA, targetStyleB);
        float targetMaterialA = isTargetA
          * clamp(uFocusAMaterialBlend, 0.0, 1.0)
          * uFocusAColorBlend;
        float targetMaterialB = isTargetB
          * clamp(uFocusBMaterialBlend, 0.0, 1.0)
          * uFocusBColorBlend;
        float targetMaterial = max(targetMaterialA, targetMaterialB);
        vec3 targetFocusTint = vec3(1.0);
        float targetTintWeight = targetMaterialA + targetMaterialB;
        if (targetTintWeight > 0.000001) {
          targetFocusTint = (
            uFocusATint * targetMaterialA
            + uFocusBTint * targetMaterialB
          ) / targetTintWeight;
        }
        float neighborhoodDim = max(
          focusCandidateA.w
            * uFocusANeighborDim
            * uFocusAFieldBlend,
          focusCandidateB.w
            * uFocusBNeighborDim
            * uFocusBFieldBlend
        ) * (1.0 - targetStyle);
        float neighborhoodContrast = 1.0 - clamp(
          neighborhoodDim,
          0.0,
          0.22
        );
        float targetSizeMultiplier = max(
          mix(
            1.0,
            uFocusASizeMultiplier,
            isTargetA * uFocusAMaterialBlend
          ),
          mix(
            1.0,
            uFocusBSizeMultiplier,
            isTargetB * uFocusBMaterialBlend
          )
        );
        float targetCssBlend = max(
          isTargetA * uFocusAMaterialBlend,
          isTargetB * uFocusBMaterialBlend
        );
        float targetCssPixels = max(
          isTargetA * uFocusATargetCssPixels,
          isTargetB * uFocusBTargetCssPixels
        );
        float targetLumaMultiplier = max(
          mix(
            1.0,
            uFocusALumaMultiplier,
            isTargetA * uFocusAMaterialBlend
          ),
          mix(
            1.0,
            uFocusBLumaMultiplier,
            isTargetB * uFocusBMaterialBlend
          )
        );
        float baseVisible = 1.0 - step(
          uVisiblePaperBudget - 0.5,
          aStableOrder
        );
        float vertexVisibility = max(baseVisible, targetStyle);
        vec3 semanticTint = mix(
          aSemanticTint,
          targetFocusTint,
          clamp(targetMaterial, 0.0, 1.0)
        );
  ` : options.focusReactive ? `
        vec3 targetPositionA = agentGalaxyWeavePaperPosition(
          uFocusATargetAnchor,
          uFocusATargetOffset
        );
        vec3 targetPositionB = agentGalaxyWeavePaperPosition(
          uFocusBTargetAnchor,
          uFocusBTargetOffset
        );
        vec3 tidalOffsetA = agentGalaxyFocusFieldOffset(
          flowPosition - targetPositionA,
          uFocusATangent,
          uFocusARadius * 1.15,
          uFocusAFieldBlend * uFocusFieldEnabled,
          uFocusASeed
        ).xyz;
        vec3 tidalOffsetB = agentGalaxyFocusFieldOffset(
          flowPosition - targetPositionB,
          uFocusBTangent,
          uFocusBRadius * 1.15,
          uFocusBFieldBlend * uFocusFieldEnabled,
          uFocusBSeed
        ).xyz;
        flowPosition += tidalOffsetA + tidalOffsetB;
        float targetSizeMultiplier = 1.0;
        float targetCssBlend = 0.0;
        float targetCssPixels = 0.0;
        float targetLumaMultiplier = 1.0;
        float targetMaterial = 0.0;
        float neighborhoodContrast = 1.0;
        float vertexVisibility = 1.0;
        vec3 semanticTint = uTint;
  ` : `
        float targetSizeMultiplier = 1.0;
        float targetCssBlend = 0.0;
        float targetCssPixels = 0.0;
        float targetLumaMultiplier = 1.0;
        float targetMaterial = 0.0;
        float neighborhoodContrast = 1.0;
        float vertexVisibility = 1.0;
        vec3 semanticTint = ${options.semantic ? "aSemanticTint" : "uTint"};
  `;
  const contextPositionBlock = hasContextUniforms ? `
        float contextRevealA = step(
          aContextOrderA,
          uContextAEvidenceProgress + 0.0001
        );
        float contextRevealB = step(
          aContextOrderB,
          uContextBEvidenceProgress + 0.0001
        );
        float contextMemberA = step(0.5, aContextRoleA)
          * contextRevealA
          * clamp(uContextABlend, 0.0, 1.0);
        float contextMemberB = step(0.5, aContextRoleB)
          * contextRevealB
          * clamp(uContextBBlend, 0.0, 1.0);
        float contextTargetA = step(1.5, aContextRoleA)
          * clamp(uContextABlend, 0.0, 1.0);
        float contextTargetB = step(1.5, aContextRoleB)
          * clamp(uContextBBlend, 0.0, 1.0);
        float contextMember = max(contextMemberA, contextMemberB);
        float contextTarget = max(contextTargetA, contextTargetB);
        float contextGlobal = max(
          clamp(uContextABlend, 0.0, 1.0),
          clamp(uContextBBlend, 0.0, 1.0)
        );
        flowPosition += uContextATranslation * contextMemberA;
        flowPosition += uContextBTranslation * contextMemberB;
        ${options.hotspotBudgeted ? `
        float hotspotBaseVisible = 1.0 - step(
          uVisibleHotspotBudget - 0.5,
          aStableOrder
        );
        vertexVisibility = max(hotspotBaseVisible, contextMember);
        ` : `
        vertexVisibility = max(vertexVisibility, contextMember);
        `}
        float contextLuma = mix(
          uContextBackgroundLuma,
          uContextPaperLuma,
          contextMember
        );
        contextLuma = mix(
          contextLuma,
          uContextTargetLuma,
          contextTarget
        );
        targetLumaMultiplier = mix(
          targetLumaMultiplier,
          max(targetLumaMultiplier, contextLuma),
          contextGlobal
        );
        ${options.mode === "paper" ? `
        targetCssBlend = max(targetCssBlend, contextTarget);
        targetCssPixels = max(
          targetCssPixels,
          uContextTargetCssPixels * step(0.0001, contextTarget)
        );
        targetMaterial = max(targetMaterial, contextTarget * 0.78);
        ` : ""}
  ` : "";
  const photosphereStyle = options.photosphereStyle
    ?? AGENT_GALAXY_PHOTOSPHERE_STYLES.paper;
  const semanticFragmentShader = options.starMaterial === "flat"
    ? AGENT_GALAXY_FLAT_SEMANTIC_FRAGMENT_SHADER
    : options.semanticPass === "surface"
      ? AGENT_GALAXY_PHOTOSPHERE_SURFACE_FRAGMENT_SHADER
      : AGENT_GALAXY_PHOTOSPHERE_CORE_FRAGMENT_SHADER;

  return new THREE.ShaderMaterial({
    uniforms: {
      ...createThreeWeaveUniforms(options.weaveUniforms),
      ...focusUniforms,
      ...contextUniforms,
      uPixelRatio: { value: 1 },
      uTint: { value: new THREE.Color(options.tint) },
      uOpacity: { value: options.opacity },
      uFlowScale: { value: options.flowScale },
      uPhotosphereEnabled: {
        value: options.starMaterial === "photosphere" ? 1 : 0,
      },
      uCoreRatio: { value: photosphereStyle.coreRatio },
      uLimbStrength: { value: photosphereStyle.limbStrength },
      uCoronaStrength: { value: photosphereStyle.coronaStrength },
      uSurfaceChromaScale: { value: photosphereStyle.surfaceChromaScale },
      uLodStartPx: { value: photosphereStyle.lodStartPx },
      uLodFullPx: { value: photosphereStyle.lodFullPx },
    },
    vertexShader: `
      attribute vec3 aHotspotAnchor;
      attribute vec3 aSemanticOffset;
      attribute float aSize;
      attribute float aLuma;
      ${options.semantic ? "attribute vec3 aSemanticTint;" : ""}
      uniform float uPixelRatio;
      uniform float uFlowScale;
      uniform float uPhotosphereEnabled;
      uniform float uLodStartPx;
      uniform float uLodFullPx;
      uniform vec3 uTint;
      varying float vLuma;
      varying float vDepthLuma;
      varying float vFocusLuma;
      varying vec3 vSemanticTint;
      varying float vFocusMaterial;
      varying float vNeighborhoodContrast;
      varying float vVertexVisibility;
      varying float vPhotosphereMix;

      ${GRAVITATIONAL_WEAVE_GLSL_CHUNK}
      ${AGENT_GALAXY_FOCUS_FIELD_GLSL_CHUNK}
      ${commonFocusDeclarations}
      ${focusDeclarations}
      ${contextDeclarations}

      void main() {
        vec3 originalPosition = ${originalExpression};
        vec3 wovenPosition = ${positionExpression};
        vec3 flowPosition = mix(originalPosition, wovenPosition, uFlowScale);
        ${focusPositionBlock}
        ${contextPositionBlock}
        vec4 viewPosition = modelViewMatrix * vec4(flowPosition, 1.0);
        float viewDepth = max(5.0, -viewPosition.z);
        float perspective = clamp(sqrt(96.0 / viewDepth), 0.72, 1.34);
        float baseCssPointSize = aSize * perspective;
        float cssPointSize = clamp(
          mix(baseCssPointSize, targetCssPixels, targetCssBlend),
          ${options.minimumCssPixels.toFixed(2)},
          ${(options.focusable ? 9 : options.maximumCssPixels).toFixed(2)}
        );
        gl_PointSize = cssPointSize * uPixelRatio * vertexVisibility;
        gl_Position = projectionMatrix * viewPosition;
        vLuma = aLuma;
        vFocusLuma = targetLumaMultiplier;
        vSemanticTint = semanticTint;
        vFocusMaterial = targetMaterial;
        vNeighborhoodContrast = neighborhoodContrast;
        vVertexVisibility = vertexVisibility;
        vPhotosphereMix = uPhotosphereEnabled * smoothstep(
          uLodStartPx,
          uLodFullPx,
          cssPointSize
        );
        vDepthLuma = clamp(1.1 - viewDepth / 520.0, 0.62, 1.0);
      }
    `,
    fragmentShader: options.semantic
      ? semanticFragmentShader
      : AGENT_GALAXY_DECORATIVE_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: Boolean(
      options.semantic
      && options.semanticPass !== "surface"
    ),
    depthTest: true,
    blending: THREE.NormalBlending,
    toneMapped: false,
  });
}

function updateWeaveTime(materials: readonly THREE.ShaderMaterial[], timeSeconds: number) {
  for (const material of materials) {
    const timeUniform = material.uniforms.uWeaveTime;
    if (timeUniform) timeUniform.value = timeSeconds;
  }
}

function writeFocusSlotUniforms(
  material: THREE.ShaderMaterial,
  prefix: "A" | "B",
  slot?: AgentGalaxyFocusSlot,
  tangent?: THREE.Vector3,
  presentationProfile: "analysis" | "immersive" = "analysis",
) {
  const uniforms = material.uniforms;
  if (!uniforms[`uFocus${prefix}Weight`]) return;
  const weight = slot?.weight ?? 0;
  uniforms[`uFocus${prefix}Weight`].value = weight;
  uniforms[`uFocus${prefix}AcquisitionBlend`].value =
    slot?.visual.acquisitionBlend ?? 0;
  uniforms[`uFocus${prefix}FieldBlend`].value =
    (slot?.visual.fieldBlend ?? 0) * (slot?.profile.fieldStrength ?? 0);
  uniforms[`uFocus${prefix}MaterialBlend`].value =
    slot?.visual.materialBlend ?? 0;
  uniforms[`uFocus${prefix}TargetVertexIndex`].value =
    slot?.target.vertexIndex ?? -1;
  uniforms[`uFocus${prefix}TargetHotspotIndex`].value =
    slot?.target.hotspotIndex ?? -1;
  (uniforms[`uFocus${prefix}TargetAnchor`].value as THREE.Vector3).fromArray(
    slot?.target.hotspotAnchor ?? [0, 0, 0],
  );
  (uniforms[`uFocus${prefix}TargetOffset`].value as THREE.Vector3).fromArray(
    slot?.target.semanticOffset ?? [0, 0, 0],
  );
  (uniforms[`uFocus${prefix}Tangent`].value as THREE.Vector3).copy(
    tangent ?? DEFAULT_FOCUS_TANGENT,
  );
  uniforms[`uFocus${prefix}Seed`].value = slot
    ? hashString32(slot.target.entityId) / 0xffff_ffff
    : 0;
  uniforms[`uFocus${prefix}Radius`].value =
    slot?.target.neighborhoodRadius ?? 5;
  uniforms[`uFocus${prefix}PhaseLock`].value =
    slot?.profile.phaseLock ?? 0;
  uniforms[`uFocus${prefix}Compression`].value =
    slot?.profile.compression ?? 0;
  uniforms[`uFocus${prefix}SizeMultiplier`].value =
    slot?.profile.sizeMultiplier ?? 1;
  uniforms[`uFocus${prefix}TargetCssPixels`].value =
    slot
      ? presentationProfile === "immersive"
        ? Math.min(4.8, slot.profile.targetCssPixels)
        : slot.profile.targetCssPixels
      : 4.2;
  uniforms[`uFocus${prefix}LumaMultiplier`].value =
    slot
      ? presentationProfile === "immersive"
        ? Math.min(1.18, slot.profile.lumaMultiplier)
        : slot.profile.lumaMultiplier
      : 1;
  uniforms[`uFocus${prefix}ColorBlend`].value =
    slot?.profile.colorBlend ?? 0;
  uniforms[`uFocus${prefix}NeighborDim`].value =
    slot?.profile.neighborDim ?? 0;
  (uniforms[`uFocus${prefix}Tint`].value as THREE.Color).fromArray(
    slot?.target.focusTint ?? [0.48, 0.57, 0.64],
  );
}

function updatePaperFocusUniforms(
  materials: readonly THREE.ShaderMaterial[],
  slots: readonly AgentGalaxyFocusSlot[],
  tangentByEntityId: ReadonlyMap<string, THREE.Vector3>,
  focusFieldEnabled: boolean,
  presentationProfile: "analysis" | "immersive",
) {
  for (const material of materials) {
    if (material.uniforms.uFocusFieldEnabled) {
      material.uniforms.uFocusFieldEnabled.value = focusFieldEnabled ? 1 : 0;
    }
    writeFocusSlotUniforms(
      material,
      "A",
      slots[0],
      slots[0]
        ? tangentByEntityId.get(slots[0].target.entityId)
        : undefined,
      presentationProfile,
    );
    writeFocusSlotUniforms(
      material,
      "B",
      slots[1],
      slots[1]
        ? tangentByEntityId.get(slots[1].target.entityId)
        : undefined,
      presentationProfile,
    );
  }
}

type ContextSlotPrefix = "A" | "B";

function clearContextRoleAttribute(
  geometry: THREE.BufferGeometry,
  attributeName: "aContextRoleA" | "aContextRoleB",
) {
  const attribute = geometry.getAttribute(attributeName);
  if (!(attribute instanceof THREE.BufferAttribute)) return;
  attribute.array.fill(0);
  attribute.needsUpdate = true;
}

function writeContextRoles(
  paperResult: PaperGeometryResult,
  hotspotResult: HotspotGeometryResult,
  prefix: ContextSlotPrefix,
  presentation?: AgentGalaxyContextPresentation,
  dynamicPaperResult?: DynamicPaperGeometryResult,
) {
  const attributeName = `aContextRole${prefix}` as const;
  const orderAttributeName = `aContextOrder${prefix}` as const;
  clearContextRoleAttribute(paperResult.geometry, attributeName);
  clearContextRoleAttribute(hotspotResult.geometry, attributeName);
  const clearOrder = (geometry: THREE.BufferGeometry) => {
    const attribute = geometry.getAttribute(orderAttributeName);
    if (!(attribute instanceof THREE.BufferAttribute)) return;
    attribute.array.fill(1);
    attribute.needsUpdate = true;
  };
  clearOrder(paperResult.geometry);
  clearOrder(hotspotResult.geometry);
  if (dynamicPaperResult) {
    clearContextRoleAttribute(dynamicPaperResult.geometry, attributeName);
    clearOrder(dynamicPaperResult.geometry);
  }
  if (!presentation?.active || !presentation.target) return;

  const paperRoles = paperResult.geometry.getAttribute(attributeName);
  const paperOrders = paperResult.geometry.getAttribute(orderAttributeName);
  const hotspotRoles = hotspotResult.geometry.getAttribute(attributeName);
  const orderedContextIds = [
    ...(presentation.evidenceOrder ?? []),
    ...presentation.contextEntityIds,
  ].filter((entityId, index, values) => (
    values.indexOf(entityId) === index
  ));
  const contextIds = new Set(orderedContextIds);
  const orderById = new Map(orderedContextIds.map((entityId, index) => [
    entityId,
    (index + 1) / Math.max(1, orderedContextIds.length),
  ]));
  if (paperRoles instanceof THREE.BufferAttribute) {
    for (const entityId of contextIds) {
      const metadata = paperResult.paperById.get(entityId);
      if (metadata) {
        paperRoles.setX(metadata.vertexIndex, 1);
        if (paperOrders instanceof THREE.BufferAttribute) {
          paperOrders.setX(
            metadata.vertexIndex,
            orderById.get(entityId) ?? 1,
          );
        }
      }
    }
    if (presentation.target.kind === "paper") {
      const target = paperResult.paperById.get(
        presentation.target.entityId,
      );
      if (target) {
        paperRoles.setX(target.vertexIndex, 2);
        if (paperOrders instanceof THREE.BufferAttribute) {
          paperOrders.setX(target.vertexIndex, 0);
        }
      }
    }
    paperRoles.needsUpdate = true;
    if (paperOrders instanceof THREE.BufferAttribute) {
      paperOrders.needsUpdate = true;
    }
  }
  if (
    hotspotRoles instanceof THREE.BufferAttribute
    && presentation.target.kind === "hotspot"
  ) {
    const target = hotspotResult.hotspotById.get(
      presentation.target.entityId,
    );
    if (target) {
      hotspotRoles.setX(target.vertexIndex, 2);
      const hotspotOrders = hotspotResult.geometry.getAttribute(
        orderAttributeName,
      );
      if (hotspotOrders instanceof THREE.BufferAttribute) {
        hotspotOrders.setX(target.vertexIndex, 0);
        hotspotOrders.needsUpdate = true;
      }
    }
    hotspotRoles.needsUpdate = true;
  }
  if (dynamicPaperResult) {
    const dynamicRoles = dynamicPaperResult.geometry.getAttribute(
      attributeName,
    );
    const dynamicOrders = dynamicPaperResult.geometry.getAttribute(
      orderAttributeName,
    );
    if (dynamicRoles instanceof THREE.BufferAttribute) {
      for (const entityId of contextIds) {
        const slot = dynamicPaperResult.entityIdBySlot.indexOf(entityId);
        if (slot >= 0) {
          dynamicRoles.setX(slot, 1);
          if (dynamicOrders instanceof THREE.BufferAttribute) {
            dynamicOrders.setX(slot, orderById.get(entityId) ?? 1);
          }
        }
      }
      if (presentation.target.kind === "paper") {
        const slot = dynamicPaperResult.entityIdBySlot.indexOf(
          presentation.target.entityId,
        );
        if (slot >= 0) {
          dynamicRoles.setX(slot, 2);
          if (dynamicOrders instanceof THREE.BufferAttribute) {
            dynamicOrders.setX(slot, 0);
          }
        }
      }
      dynamicRoles.needsUpdate = true;
      if (dynamicOrders instanceof THREE.BufferAttribute) {
        dynamicOrders.needsUpdate = true;
      }
    }
  }
}

function writeContextUniforms(
  materials: readonly THREE.ShaderMaterial[],
  prefix: ContextSlotPrefix,
  blend: number,
  translation: THREE.Vector3,
  evidenceProgress: number,
) {
  for (const material of materials) {
    const blendUniform = material.uniforms[`uContext${prefix}Blend`];
    if (!blendUniform) continue;
    blendUniform.value = blend;
    material.uniforms[
      `uContext${prefix}EvidenceProgress`
    ].value = evidenceProgress;
    (
      material.uniforms[
        `uContext${prefix}Translation`
      ].value as THREE.Vector3
    ).copy(translation);
  }
}

const AGENT_GALAXY_STATE_MOTION: Record<
  AgentGalaxyMotionState,
  {
    gravity: number;
    shear: number;
    twist: number;
    calm: number;
    timeScale: number;
    contextStrength: number;
  }
> = {
  idle: {
    gravity: 1,
    shear: 1,
    twist: 1,
    calm: 1,
    timeScale: 1,
    contextStrength: 0,
  },
  input: {
    gravity: 0.82,
    shear: 0.82,
    twist: 0.8,
    calm: 1.55,
    timeScale: 0.78,
    contextStrength: 0,
  },
  thinking: {
    gravity: 1.04,
    shear: 1.14,
    twist: 1.12,
    calm: 0.92,
    timeScale: 1.02,
    contextStrength: 0.34,
  },
  answer: {
    gravity: 0.98,
    shear: 1.08,
    twist: 1.04,
    calm: 1.02,
    timeScale: 0.9,
    contextStrength: 0.74,
  },
  reading: {
    gravity: 0.72,
    shear: 0.74,
    twist: 0.72,
    calm: 1.38,
    timeScale: 0.55,
    contextStrength: 0.82,
  },
  focus: {
    gravity: 0.9,
    shear: 0.96,
    twist: 0.9,
    calm: 1.16,
    timeScale: 0.72,
    contextStrength: 1,
  },
};

function projectToViewport(
  position: THREE.Vector3,
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number,
) {
  const projected = position.clone().project(camera);
  return {
    ndc: projected,
    x: (projected.x * 0.5 + 0.5) * width,
    y: (1 - (projected.y * 0.5 + 0.5)) * height,
  };
}

function anchorToViewport(
  anchorNdc: readonly [number, number],
  width: number,
  height: number,
) {
  return {
    x: (anchorNdc[0] * 0.5 + 0.5) * width,
    y: (1 - (anchorNdc[1] * 0.5 + 0.5)) * height,
  };
}

function createAnchoredCameraQuaternion(
  camera: THREE.PerspectiveCamera,
  cameraPosition: THREE.Vector3,
  targetPosition: THREE.Vector3,
  anchorNdc: readonly [number, number],
) {
  const centerCamera = camera.clone();
  centerCamera.position.copy(cameraPosition);
  centerCamera.up.set(0, 1, 0);
  centerCamera.lookAt(targetPosition);
  const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
  const localTargetRay = new THREE.Vector3(
    anchorNdc[0] * tanHalfFov * camera.aspect,
    anchorNdc[1] * tanHalfFov,
    -1,
  ).normalize();
  const localCorrection = new THREE.Quaternion().setFromUnitVectors(
    localTargetRay,
    new THREE.Vector3(0, 0, -1),
  );
  return centerCamera.quaternion.clone().multiply(localCorrection);
}

export function AgentGalaxyFlowCanvas({
  payload,
  config,
  focusIntent,
  motionState = "idle",
  contextPresentation,
  presentationProfile = "analysis",
  reducedMotion = false,
  onMetrics,
  onFocusSnapshot,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const focusIntentRef = useRef<AgentGalaxyFocusIntent | undefined>(focusIntent);
  const focusIntentRevisionRef = useRef(0);
  const motionStateRef = useRef<AgentGalaxyMotionState>(motionState);
  const contextPresentationRef =
    useRef<AgentGalaxyContextPresentation | undefined>(contextPresentation);
  const contextPresentationRevisionRef = useRef(0);
  const onMetricsRef = useRef(onMetrics);
  const onFocusSnapshotRef = useRef(onFocusSnapshot);
  const [fallbackReason, setFallbackReason] = useState("");

  useEffect(() => {
    focusIntentRef.current = focusIntent;
    focusIntentRevisionRef.current += 1;
  }, [focusIntent]);

  useEffect(() => {
    motionStateRef.current = motionState;
  }, [motionState]);

  useEffect(() => {
    contextPresentationRef.current = contextPresentation;
    contextPresentationRevisionRef.current += 1;
  }, [contextPresentation]);

  useEffect(() => {
    onMetricsRef.current = onMetrics;
  }, [onMetrics]);

  useEffect(() => {
    onFocusSnapshotRef.current = onFocusSnapshot;
  }, [onFocusSnapshot]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    setFallbackReason("");

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: false,
        alpha: false,
        preserveDrawingBuffer: config.snapshotPng,
        powerPreference: config.quality === "high"
          ? "high-performance"
          : config.quality === "balanced"
            ? "low-power"
            : "default",
      });
    } catch (reason) {
      setFallbackReason(reason instanceof Error ? reason.message : "WebGL unavailable");
      return;
    }

    renderer.setClearColor(0x000000, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.domElement.className = "agent-galaxy-flow__canvas";
    renderer.domElement.setAttribute("aria-label", "引力织场科研星空技术评审");
    host.appendChild(renderer.domElement);
    const rendererInstanceId = nextFocusRendererInstanceId;
    nextFocusRendererInstanceId += 1;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(48, 1, 0.4, 460);
    setInitialCameraPose(camera);
    const initialCameraPosition = camera.position.clone();
    const initialCameraQuaternion = camera.quaternion.clone();
    const cameraDrift = new THREE.Vector3();

    const gpuRenderer = detectGpuRenderer(renderer);
    let resolvedQuality = resolveInitialQuality(config.quality, gpuRenderer);
    let budget = AGENT_GALAXY_FLOW_QUALITY_BUDGET[resolvedQuality];
    let downgradeReason: string | undefined;
    const fixedTime = config.fixedTimeSeconds !== undefined;
    const effectiveReducedMotion = reducedMotion && !fixedTime;
    const weaveUniformValues = createGravitationalWeaveUniformValues(
      payload.sourceSnapshotId,
      {
        gravity: config.gravity,
        shear: config.shear,
        twist: config.twist,
        speed: config.speed,
        calmStrength: config.calm,
        calmForward: initialCameraPosition.clone().normalize().toArray() as AgentGalaxyVector3,
        calmUp: camera.up.clone().normalize().toArray() as AgentGalaxyVector3,
      },
      config.fixedTimeSeconds ?? 0,
    );
    const focusFlowParameters: GravitationalWeaveParameters = {
      ...GRAVITATIONAL_WEAVE_DEFAULT_PARAMETERS,
      gravity: config.gravity,
      shear: config.shear,
      twist: config.twist,
      speed: config.speed,
      calmStrength: config.calm,
      calmCenter: [0, 0, 0],
      calmForward: (
        initialCameraPosition.clone().normalize().toArray()
      ) as AgentGalaxyVector3,
      calmUp: camera.up.clone().normalize().toArray() as AgentGalaxyVector3,
      calmRadii: (
        [...GRAVITATIONAL_WEAVE_DEFAULT_PARAMETERS.calmRadii]
      ) as AgentGalaxyVector3,
    };
    const focusFlowField = createGravitationalWeaveField(payload.sourceSnapshotId);
    const focusController = createAgentGalaxyFocusController();

    const paperResult = createPaperGeometry(payload);
    const hotspotResult = createHotspotGeometry(payload);
    const dynamicPaperResult = createDynamicPaperGeometry(24);
    const environmentResult = createFreeGeometry(payload, "environment");
    const dustResult = createFreeGeometry(payload, "dust");

    const paperCoreMaterial = createPointMaterial({
      mode: "paper",
      minimumCssPixels: 1.6,
      maximumCssPixels: 2.8,
      tint: "#edf1f3",
      opacity: 0.98,
      flowScale: 1,
      semantic: true,
      weaveUniforms: weaveUniformValues,
      focusable: true,
      contextual: true,
      semanticPass: "core",
      photosphereStyle: AGENT_GALAXY_PHOTOSPHERE_STYLES.paper,
      starMaterial: config.starMaterial,
    });
    const paperSurfaceMaterial = createPointMaterial({
      mode: "paper",
      minimumCssPixels: 1.6,
      maximumCssPixels: 2.8,
      tint: "#edf1f3",
      opacity: 0.98,
      flowScale: 1,
      semantic: true,
      weaveUniforms: weaveUniformValues,
      focusable: true,
      contextual: true,
      semanticPass: "surface",
      photosphereStyle: AGENT_GALAXY_PHOTOSPHERE_STYLES.paper,
      starMaterial: config.starMaterial,
    });
    const dynamicPaperCoreMaterial = createPointMaterial({
      mode: "paper",
      minimumCssPixels: 1.6,
      maximumCssPixels: 2.8,
      tint: "#edf1f3",
      opacity: 0.98,
      flowScale: 1,
      semantic: true,
      weaveUniforms: weaveUniformValues,
      focusable: true,
      contextual: true,
      semanticPass: "core",
      photosphereStyle: AGENT_GALAXY_PHOTOSPHERE_STYLES.paper,
      starMaterial: config.starMaterial,
    });
    const dynamicPaperSurfaceMaterial = createPointMaterial({
      mode: "paper",
      minimumCssPixels: 1.6,
      maximumCssPixels: 2.8,
      tint: "#edf1f3",
      opacity: 0.98,
      flowScale: 1,
      semantic: true,
      weaveUniforms: weaveUniformValues,
      focusable: true,
      contextual: true,
      semanticPass: "surface",
      photosphereStyle: AGENT_GALAXY_PHOTOSPHERE_STYLES.paper,
      starMaterial: config.starMaterial,
    });
    const hotspotCoreMaterial = createPointMaterial({
      mode: "hotspot",
      minimumCssPixels: 3.6,
      maximumCssPixels: 6.2,
      tint: "#f4f6f7",
      opacity: 0.98,
      flowScale: 1,
      semantic: true,
      contextual: true,
      hotspotBudgeted: true,
      weaveUniforms: weaveUniformValues,
      semanticPass: "core",
      photosphereStyle: AGENT_GALAXY_PHOTOSPHERE_STYLES.hotspot,
      starMaterial: config.starMaterial,
    });
    const hotspotSurfaceMaterial = createPointMaterial({
      mode: "hotspot",
      minimumCssPixels: 3.6,
      maximumCssPixels: 6.2,
      tint: "#f4f6f7",
      opacity: 0.98,
      flowScale: 1,
      semantic: true,
      contextual: true,
      hotspotBudgeted: true,
      weaveUniforms: weaveUniformValues,
      semanticPass: "surface",
      photosphereStyle: AGENT_GALAXY_PHOTOSPHERE_STYLES.hotspot,
      starMaterial: config.starMaterial,
    });
    const environmentMaterial = createPointMaterial({
      mode: "free",
      minimumCssPixels: 0.7,
      maximumCssPixels: 1.55,
      tint: "#aeb4b8",
      opacity: 0.58,
      flowScale: 0.46,
      semantic: false,
      weaveUniforms: weaveUniformValues,
      starMaterial: config.starMaterial,
    });
    const dustMaterial = createPointMaterial({
      mode: "free",
      minimumCssPixels: 0.42,
      maximumCssPixels: 0.95,
      tint: "#747b80",
      opacity: 0.36,
      flowScale: 0.68,
      semantic: false,
      weaveUniforms: weaveUniformValues,
      focusReactive: true,
      starMaterial: config.starMaterial,
    });

    const paperPoints = new THREE.Points(
      paperResult.geometry,
      paperCoreMaterial,
    );
    const paperSurfacePoints = new THREE.Points(
      paperResult.geometry,
      paperSurfaceMaterial,
    );
    const dynamicPaperPoints = new THREE.Points(
      dynamicPaperResult.geometry,
      dynamicPaperCoreMaterial,
    );
    const dynamicPaperSurfacePoints = new THREE.Points(
      dynamicPaperResult.geometry,
      dynamicPaperSurfaceMaterial,
    );
    dynamicPaperPoints.frustumCulled = false;
    dynamicPaperSurfacePoints.frustumCulled = false;
    const hotspotPoints = new THREE.Points(
      hotspotResult.geometry,
      hotspotCoreMaterial,
    );
    const hotspotSurfacePoints = new THREE.Points(
      hotspotResult.geometry,
      hotspotSurfaceMaterial,
    );
    const environmentPoints = new THREE.Points(environmentResult.geometry, environmentMaterial);
    const dustPoints = new THREE.Points(dustResult.geometry, dustMaterial);
    paperPoints.name = "agent-flow-sharp-papers";
    paperSurfacePoints.name = "agent-flow-paper-photosphere-surface";
    dynamicPaperPoints.name = "agent-flow-dynamic-paper-core";
    dynamicPaperSurfacePoints.name = "agent-flow-dynamic-paper-surface";
    hotspotPoints.name = "agent-flow-sharp-hotspots";
    hotspotSurfacePoints.name = "agent-flow-hotspot-photosphere-surface";
    environmentPoints.name = "agent-flow-environment";
    dustPoints.name = "agent-flow-dust";
    dustPoints.renderOrder = 0;
    environmentPoints.renderOrder = 1;
    paperPoints.renderOrder = 2;
    dynamicPaperPoints.renderOrder = 2;
    hotspotPoints.renderOrder = 3;
    paperSurfacePoints.renderOrder = 4;
    dynamicPaperSurfacePoints.renderOrder = 4;
    hotspotSurfacePoints.renderOrder = 5;
    scene.add(
      dustPoints,
      environmentPoints,
      paperPoints,
      dynamicPaperPoints,
      hotspotPoints,
      paperSurfacePoints,
      dynamicPaperSurfacePoints,
      hotspotSurfacePoints,
    );

    const materials = [
      paperCoreMaterial,
      paperSurfaceMaterial,
      dynamicPaperCoreMaterial,
      dynamicPaperSurfaceMaterial,
      hotspotCoreMaterial,
      hotspotSurfaceMaterial,
      environmentMaterial,
      dustMaterial,
    ] as const;
    const focusMaterials = [
      paperCoreMaterial,
      paperSurfaceMaterial,
      dynamicPaperCoreMaterial,
      dynamicPaperSurfaceMaterial,
      dustMaterial,
    ] as const;
    const geometries = [
      paperResult.geometry,
      dynamicPaperResult.geometry,
      hotspotResult.geometry,
      environmentResult.geometry,
      dustResult.geometry,
    ] as const;

    const applyBudget = (nextBudget: LayerBudget) => {
      paperResult.geometry.setDrawRange(0, paperResult.count);
      for (const material of [paperCoreMaterial, paperSurfaceMaterial]) {
        material.uniforms.uVisiblePaperBudget.value = Math.min(
          nextBudget.papers,
          paperResult.count,
        );
      }
      hotspotResult.geometry.setDrawRange(0, hotspotResult.count);
      for (const material of [hotspotCoreMaterial, hotspotSurfaceMaterial]) {
        material.uniforms.uVisibleHotspotBudget.value = Math.min(
          nextBudget.hotspots,
          hotspotResult.count,
        );
      }
      environmentResult.geometry.setDrawRange(0, Math.min(nextBudget.environment, environmentResult.count));
      dustResult.geometry.setDrawRange(0, Math.min(nextBudget.dust, dustResult.count));
    };
    applyBudget(budget);

    const pixelRatio = () => config.snapshotPng
      ? 1
      : Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      const starCrop = config.snapshotPng && config.snapshotRegion === "stars";
      const renderWidth = config.snapshotPng
        ? starCrop
          ? AGENT_GALAXY_FLOW_STAR_CROP.width
          : AGENT_GALAXY_FLOW_SNAPSHOT_SIZE.width
        : width;
      const renderHeight = config.snapshotPng
        ? starCrop
          ? AGENT_GALAXY_FLOW_STAR_CROP.height
          : AGENT_GALAXY_FLOW_SNAPSHOT_SIZE.height
        : height;
      camera.aspect = config.snapshotPng
        ? AGENT_GALAXY_FLOW_SNAPSHOT_SIZE.width
          / AGENT_GALAXY_FLOW_SNAPSHOT_SIZE.height
        : renderWidth / renderHeight;
      if (starCrop) {
        camera.setViewOffset(
          AGENT_GALAXY_FLOW_SNAPSHOT_SIZE.width,
          AGENT_GALAXY_FLOW_SNAPSHOT_SIZE.height,
          AGENT_GALAXY_FLOW_STAR_CROP.x,
          AGENT_GALAXY_FLOW_STAR_CROP.y,
          AGENT_GALAXY_FLOW_STAR_CROP.width,
          AGENT_GALAXY_FLOW_STAR_CROP.height,
        );
      } else {
        camera.clearViewOffset();
      }
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(pixelRatio());
      renderer.setSize(renderWidth, renderHeight, false);
      for (const material of materials) {
        material.uniforms.uPixelRatio.value = pixelRatio();
      }
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();

    const frameTimes: number[] = [];
    let lastFrameAt = performance.now();
    let metricsWindowStartedAt = lastFrameAt;
    let animationSeconds = 0;
    let raf = 0;
    let disposed = false;
    let pagePaused = document.hidden;
    let lowPerformanceWindows = 0;
    let webglAvailable = true;
    let lastFocusIntentRevision = -1;
    let lastContextPresentationRevision = -1;
    let lastMotionState = motionStateRef.current;
    let motionTransitionStartedAt = 0;
    let motionFrom = {
      ...AGENT_GALAXY_STATE_MOTION[lastMotionState],
    };
    let motionCurrent = {
      ...AGENT_GALAXY_STATE_MOTION[lastMotionState],
    };
    let motionTarget = {
      ...AGENT_GALAXY_STATE_MOTION[lastMotionState],
    };
    let weaveAnimationSeconds = 0;
    let focusResolutionError = "";
    let focusMaxScreenStepPx = 0;
    let focusMaxLumaStepRatio = 0;
    let previousFocusLumaMultiplier = 1;
    let lastFocusScreenPosition: THREE.Vector2 | undefined;
    let lastFocusSnapshotAt = -Infinity;
    let latestFocusSnapshot: AgentGalaxyFocusRuntimeSnapshot = {
      phase: "idle",
      progress: 0,
      rendererInstanceId,
      transitionCount: 0,
    };
    const baseCameraPosition = new THREE.Vector3();
    const baseCameraQuaternion = new THREE.Quaternion();
    const focusCameraPosition = new THREE.Vector3();
    const blendedFocusPosition = new THREE.Vector3();
    const targetWorldPosition = new THREE.Vector3();
    const focusTargetPosition = new THREE.Vector3();
    const targetCameraQuaternion = new THREE.Quaternion();
    const blendedFocusQuaternion = new THREE.Quaternion();
    const focusQuaternionScratch = new THREE.Quaternion();
    const targetPositionByEntityId = new Map<string, THREE.Vector3>();
    const targetTangentByEntityId = new Map<string, THREE.Vector3>();
    const tangentBefore = new THREE.Vector3();
    const tangentAfter = new THREE.Vector3();
    const approachDirection = new THREE.Vector3();
    const focusFieldProbeWorld = new THREE.Vector3();
    const focusFieldProbeOffset = new THREE.Vector3();
    const contextTargetWorld = new THREE.Vector3();
    const contextDesiredWorld = new THREE.Vector3();
    const contextProjected = new THREE.Vector3();
    const contextTranslationScratch = new THREE.Vector3();
    const contextMaterials = [
      paperCoreMaterial,
      paperSurfaceMaterial,
      dynamicPaperCoreMaterial,
      dynamicPaperSurfaceMaterial,
      hotspotCoreMaterial,
      hotspotSurfaceMaterial,
    ] as const;
    const contextSlots: Array<{
      prefix: ContextSlotPrefix;
      presentation?: AgentGalaxyContextPresentation;
      blend: number;
      fromBlend: number;
      targetBlend: number;
      startedAt: number;
      duration: number;
      translation: THREE.Vector3;
    }> = [
      {
        prefix: "A",
        blend: 0,
        fromBlend: 0,
        targetBlend: 0,
        startedAt: 0,
        duration: 1.1,
        translation: new THREE.Vector3(),
      },
      {
        prefix: "B",
        blend: 0,
        fromBlend: 0,
        targetBlend: 0,
        startedAt: 0,
        duration: 1.1,
        translation: new THREE.Vector3(),
      },
    ];

    const allPaperMetadata = () => {
      const merged = new Map(paperResult.paperById);
      for (const [id, metadata] of dynamicPaperResult.paperById) {
        merged.set(id, metadata);
      }
      return merged;
    };

    const updateMotionState = (timeSeconds: number) => {
      const requested = motionStateRef.current;
      if (requested !== lastMotionState) {
        lastMotionState = requested;
        motionTransitionStartedAt = timeSeconds;
        motionFrom = { ...motionCurrent };
        motionTarget = { ...AGENT_GALAXY_STATE_MOTION[requested] };
      }
      const amount = effectiveReducedMotion
        ? 1
        : smootherstep((timeSeconds - motionTransitionStartedAt) / 0.9);
      for (const key of [
        "gravity",
        "shear",
        "twist",
        "calm",
        "timeScale",
        "contextStrength",
      ] as const) {
        motionCurrent[key] = THREE.MathUtils.lerp(
          motionFrom[key],
          motionTarget[key],
          amount,
        );
      }
      focusFlowParameters.gravity = config.gravity * motionCurrent.gravity;
      focusFlowParameters.shear = config.shear * motionCurrent.shear;
      focusFlowParameters.twist = config.twist * motionCurrent.twist;
      focusFlowParameters.calmStrength = clamp(
        config.calm * motionCurrent.calm,
        0,
        0.6,
      );
      for (const material of materials) {
        material.uniforms.uWeaveGravity.value = focusFlowParameters.gravity;
        material.uniforms.uWeaveShear.value = focusFlowParameters.shear;
        material.uniforms.uWeaveTwist.value = focusFlowParameters.twist;
        material.uniforms.uWeaveCalmStrength.value =
          focusFlowParameters.calmStrength;
      }
    };

    const processContextPresentation = (timeSeconds: number) => {
      if (
        lastContextPresentationRevision
        === contextPresentationRevisionRef.current
      ) return;
      lastContextPresentationRevision =
        contextPresentationRevisionRef.current;
      const next = contextPresentationRef.current;
      for (const slot of contextSlots) {
        slot.fromBlend = slot.blend;
        slot.targetBlend = 0;
        slot.startedAt = timeSeconds;
        slot.duration = 1.2;
      }
      if (!next?.active || !next.target) return;

      const cachedResolvedEntities = [
        ...(next.resolvedEntities ?? []),
        ...contextSlots.flatMap(
          (slot) => slot.presentation?.resolvedEntities ?? [],
        ),
      ].filter((entity, index, values) => (
        values.findIndex((candidate) => (
          candidate.kind === entity.kind
          && candidate.entityId === entity.entityId
        )) === index
      ));
      updateDynamicPaperGeometry(
        dynamicPaperResult,
        payload,
        cachedResolvedEntities,
        paperResult.count,
        hotspotResult,
      );
      const matching = contextSlots.find(
        (slot) => slot.presentation?.target?.entityId
          === next.target?.entityId,
      );
      const incoming = matching
        ?? [...contextSlots].sort(
          (left, right) => left.blend - right.blend,
        )[0];
      if (!incoming) return;
      incoming.presentation = next;
      incoming.fromBlend = incoming.blend;
      incoming.targetBlend = 1;
      incoming.startedAt = timeSeconds;
      incoming.duration = matching ? 0.9 : 1.1;
      writeContextRoles(
        paperResult,
        hotspotResult,
        incoming.prefix,
        next,
        dynamicPaperResult,
      );
    };

    const sampleContextTargetPosition = (
      presentation: AgentGalaxyContextPresentation,
      timeSeconds: number,
      target: THREE.Vector3,
    ) => {
      if (!presentation.target) return undefined;
      if (presentation.target.kind === "hotspot") {
        const metadata = hotspotResult.hotspotById.get(
          presentation.target.entityId,
        );
        if (!metadata) return undefined;
        return target.fromArray(sampleGravitationalWeavePosition(
          metadata.hotspot.position,
          [0, 0, 0],
          timeSeconds,
          focusFlowField,
          focusFlowParameters,
        ));
      }
      const metadata = allPaperMetadata().get(
        presentation.target.entityId,
      );
      return metadata
        ? sampleTargetPosition(metadata, timeSeconds, target)
        : undefined;
    };

    const updateContextPresentation = (
      flowTimeSeconds: number,
      timelineSeconds: number,
    ) => {
      processContextPresentation(timelineSeconds);
      for (const slot of contextSlots) {
        const elapsed = Math.max(0, timelineSeconds - slot.startedAt);
        slot.blend = THREE.MathUtils.lerp(
          slot.fromBlend,
          slot.targetBlend,
          smootherstep(elapsed / Math.max(0.001, slot.duration)),
        );
        const stateStrength = effectiveReducedMotion
          ? slot.targetBlend
          : motionCurrent.contextStrength;
        const effectiveBlend = slot.blend * stateStrength;
        slot.translation.set(0, 0, 0);
        const presentation = slot.presentation;
        if (presentation && effectiveBlend > 0.0001) {
          const targetPosition = sampleContextTargetPosition(
            presentation,
            flowTimeSeconds,
            contextTargetWorld,
          );
          if (targetPosition) {
            camera.updateMatrixWorld(true);
            contextProjected.copy(targetPosition).project(camera);
            const desiredX = presentation.extractionSide === "right"
              ? 0.56
              : -0.56;
            const desiredY = host.clientWidth < 768 ? 0.48 : 0.1;
            contextDesiredWorld.set(
              desiredX,
              desiredY,
              contextProjected.z,
            ).unproject(camera);
            contextTranslationScratch.copy(contextDesiredWorld)
              .sub(targetPosition);
            // A rigid translation preserves the internal semantic geometry.
            slot.translation.copy(contextTranslationScratch);
          }
        }
        writeContextUniforms(
          contextMaterials,
          slot.prefix,
          effectiveBlend,
          slot.translation,
          slot.presentation?.state === "answer" && !effectiveReducedMotion
            ? smootherstep(
                (timelineSeconds - slot.startedAt) / 3.2,
              )
            : 1,
        );
        if (slot.blend <= 0.0001 && slot.targetBlend === 0) {
          slot.presentation = undefined;
          writeContextRoles(
            paperResult,
            hotspotResult,
            slot.prefix,
            undefined,
            dynamicPaperResult,
          );
        }
      }
    };

    const reportMetrics = (paused: boolean) => {
      const averageFrameMs = frameTimes.length
        ? frameTimes.reduce((sum, value) => sum + value, 0) / frameTimes.length
        : 0;
      const primaryContextSlot = [...contextSlots]
        .filter((slot) => slot.presentation)
        .sort((left, right) => right.blend - left.blend)[0];
      const primaryContext = primaryContextSlot?.presentation;
      onMetricsRef.current?.({
        averageFrameMs,
        p95FrameMs: p95(frameTimes),
        averageFps: averageFrameMs > 0 ? 1000 / averageFrameMs : 0,
        dpr: pixelRatio(),
        requestedQuality: config.quality,
        quality: resolvedQuality,
        drawCalls: renderer.info.render.calls,
        visibleHotspotCount: Math.min(budget.hotspots, hotspotResult.count),
        visiblePaperProxyCount: Math.min(budget.papers, paperResult.count)
          + (latestFocusSnapshot.promoted ? 1 : 0),
        environmentStarCount: Math.min(budget.environment, environmentResult.count),
        dustCount: Math.min(budget.dust, dustResult.count),
        downgradeReason,
        paused,
        reducedMotion: effectiveReducedMotion,
        fixedTime,
        sourceSnapshotId: payload.sourceSnapshotId,
        gpuRenderer,
        flowModelId: "gravitational-weave-tech-preview",
        flowContractVersion: AGENT_GALAXY_FLOW_CONTRACT_VERSION,
        fieldNodeCount: GRAVITATIONAL_WEAVE_NODE_COUNT,
        semanticCoreTimeOpacity: false,
        semanticBlending: "normal",
        bloomMode: "none",
        depthOfField: false,
        wholeGroupTransform: false,
        cameraMode: config.camera,
        cameraDriftMaxUnits: config.camera === "codrift"
          ? AGENT_GALAXY_FLOW_CAMERA.codriftMaxUnits
          : 0,
        webglAvailable,
        focusPhase: latestFocusSnapshot.phase,
        focusTargetId: latestFocusSnapshot.targetId,
        focusTargetVertexIndex: latestFocusSnapshot.vertexIndex,
        focusTargetBaseVisible: latestFocusSnapshot.baseVisible,
        focusTargetPromoted: latestFocusSnapshot.promoted,
        focusCameraDistance: latestFocusSnapshot.cameraDistance,
        focusAnchorErrorPx: latestFocusSnapshot.anchorErrorPx,
        focusCloudDiameterRatio: latestFocusSnapshot.cloudDiameterRatio,
        focusMaxScreenStepPx: latestFocusSnapshot.maxScreenStepPx,
        focusMaxLumaStepRatio: latestFocusSnapshot.maxLumaStepRatio,
        focusAcquisitionBlend: latestFocusSnapshot.acquisitionBlend,
        focusFieldBlend: latestFocusSnapshot.fieldBlend,
        focusMaterialBlend: latestFocusSnapshot.materialBlend,
        focusCameraBlend: latestFocusSnapshot.cameraBlend,
        focusReleaseBlend: latestFocusSnapshot.releaseBlend,
        focusTargetCssPixels: latestFocusSnapshot.targetCssPixels,
        focusTargetPhotosphereMix:
          latestFocusSnapshot.targetPhotosphereMix,
        focusFieldMaximumWorldDisplacement:
          latestFocusSnapshot.fieldMaximumWorldDisplacement,
        focusFieldMaximumScreenDisplacementPx:
          latestFocusSnapshot.fieldMaximumScreenDisplacementPx,
        focusFieldAffectedVisibleRatio:
          latestFocusSnapshot.fieldAffectedVisibleRatio,
        focusSemanticPaperColor: latestFocusSnapshot.semanticPaperColor,
        focusSemanticHotspotColor: latestFocusSnapshot.semanticHotspotColor,
        starMaterial: config.starMaterial,
        focusFieldEnabled: config.focusField,
        focusCameraEnabled: config.focusCamera,
        semanticCoreDrawCalls: 2,
        semanticSurfaceDrawCalls: 2,
        focusRendererInstanceId: rendererInstanceId,
        focusTransitionCount: latestFocusSnapshot.transitionCount,
        contextState: motionStateRef.current,
        contextTargetId: primaryContext?.target?.entityId,
        contextTargetKind: primaryContext?.target?.kind,
        contextMembership: primaryContext?.target?.membership,
        contextEntityCount: primaryContext
          ? Math.min(24, primaryContext.contextEntityIds.length)
          : 0,
        contextBlend: primaryContextSlot?.blend ?? 0,
        contextCloudDiameterRatio: 1,
        dynamicEntityCount: dynamicPaperResult.paperById.size,
      });
    };

    const updateBaseCamera = (timeSeconds: number) => {
      baseCameraPosition.copy(initialCameraPosition);
      if (config.camera === "codrift" && !effectiveReducedMotion) {
        const phase = timeSeconds * (Math.PI * 2 / AGENT_GALAXY_FLOW_CAMERA.codriftPeriodSeconds);
        const drift = AGENT_GALAXY_FLOW_CAMERA.codriftMaxUnits;
        baseCameraPosition.add(cameraDrift.set(
          Math.sin(phase) * drift,
          Math.sin(phase * 2) * drift * 0.22,
          Math.cos(phase) * drift * 0.45,
        ));
      }
      camera.position.copy(baseCameraPosition);
      camera.quaternion.copy(initialCameraQuaternion);
      camera.lookAt(0, 0, 0);
      baseCameraQuaternion.copy(camera.quaternion);
    };

    const sampleTargetPosition = (
      metadata: PaperVertexMetadata,
      timeSeconds: number,
      target = new THREE.Vector3(),
    ) => {
      const position = sampleGravitationalWeavePosition(
        metadata.hotspot.position,
        metadata.paper.offset,
        timeSeconds,
        focusFlowField,
        focusFlowParameters,
      );
      return target.fromArray(position);
    };

    const sampleTargetTangent = (
      metadata: PaperVertexMetadata,
      timeSeconds: number,
      target = new THREE.Vector3(),
    ) => {
      sampleTargetPosition(metadata, timeSeconds - 0.025, tangentBefore);
      sampleTargetPosition(metadata, timeSeconds + 0.025, tangentAfter);
      target.copy(tangentAfter).sub(tangentBefore);
      if (target.lengthSq() <= 1e-10) {
        target.fromArray(metadata.paper.offset);
      }
      if (target.lengthSq() <= 1e-10) target.set(0, 1, 0);
      return target.normalize();
    };

    const resolveFocusTarget = (
      intent: AgentGalaxyFocusIntent,
      timeSeconds: number,
    ): AgentGalaxyResidentFocusTarget | undefined => {
      if (intent.kind !== "paper") {
        focusResolutionError = `unsupported-focus-kind:${intent.kind}`;
        return undefined;
      }
      const metadata = paperResult.paperById.get(intent.entityId)
        ?? dynamicPaperResult.paperById.get(intent.entityId);
      if (!metadata) {
        focusResolutionError = `resident-paper-not-found:${intent.entityId}`;
        return undefined;
      }
      const worldPosition = sampleTargetPosition(metadata, timeSeconds, targetWorldPosition);
      const projected = worldPosition.clone().project(camera);
      const resolvedEntity = contextPresentationRef.current?.resolvedEntities
        ?.find((entity) => entity.entityId === intent.entityId);
      const resolvedMembership = resolvedEntity?.membership;
      focusResolutionError = "";
      return {
        entityId: metadata.paper.id,
        vertexIndex: metadata.vertexIndex,
        hotspotId: metadata.hotspot.id,
        hotspotIndex: metadata.hotspotIndex,
        hotspotAnchor: [...metadata.hotspot.position],
        semanticOffset: [...metadata.paper.offset],
        focusTint: createAgentGalaxyFocusTint(
          metadata.hotspot.color || metadata.paper.color,
        ),
        neighborhoodRadius: metadata.neighborhoodRadius,
        membership: resolvedMembership && resolvedMembership !== "missing"
          ? resolvedMembership
          : "sampled",
        baseVisible: resolveResidentPaperBaseVisibility(
          metadata.vertexIndex,
          budget.papers,
        ),
        anchorNdc: selectAgentGalaxyFocusAnchor(projected.x, host.clientWidth),
      };
    };

    const processFocusIntent = (
      flowTimeSeconds: number,
      focusTimeSeconds: number,
    ) => {
      if (lastFocusIntentRevision === focusIntentRevisionRef.current) return;
      lastFocusIntentRevision = focusIntentRevisionRef.current;
      focusMaxScreenStepPx = 0;
      focusMaxLumaStepRatio = 0;
      lastFocusScreenPosition = undefined;
      const focusBeforeIntent = sampleAgentGalaxyFocusController(
        focusController,
        focusTimeSeconds,
      );
      previousFocusLumaMultiplier = focusBeforeIntent.slots.reduce(
        (maximum, slot) => Math.max(
          maximum,
          1 + (slot.profile.lumaMultiplier - 1) * slot.weight,
        ),
        1,
      );
      const intent = focusIntentRef.current;
      if (!intent) {
        releaseAgentGalaxyFocus(focusController, focusTimeSeconds);
        focusResolutionError = "";
        return;
      }
      const target = resolveFocusTarget(intent, flowTimeSeconds);
      if (!target) {
        releaseAgentGalaxyFocus(focusController, focusTimeSeconds);
        return;
      }
      const commandTime = fixedTime || effectiveReducedMotion
        ? focusTimeSeconds - AGENT_GALAXY_FOCUS_PROFILES[intent.mode].captureSeconds
        : focusTimeSeconds;
      commandAgentGalaxyFocus(
        focusController,
        target,
        intent.mode,
        commandTime,
      );
    };

    const updateFocusCamera = (
      flowTimeSeconds: number,
      focusTimeSeconds: number,
    ) => {
      processFocusIntent(flowTimeSeconds, focusTimeSeconds);
      const sampledFocus = sampleAgentGalaxyFocusController(
        focusController,
        focusTimeSeconds,
      );
      const displaySlots = effectiveReducedMotion
        ? sampledFocus.slots.map((slot) => ({
            ...slot,
            visual: {
              ...slot.visual,
              fieldBlend: 0,
              cameraBlend: 0,
            },
            profile: {
              ...slot.profile,
              cameraBlend: 0,
              fieldStrength: 0,
              phaseLock: 0,
              compression: 0,
            },
          }))
        : sampledFocus.slots;
      const focusLumaMultiplier = displaySlots.reduce(
        (maximum, slot) => Math.max(
          maximum,
          1 + (slot.profile.lumaMultiplier - 1)
            * slot.visual.materialBlend,
        ),
        1,
      );
      focusMaxLumaStepRatio = Math.max(
        focusMaxLumaStepRatio,
        Math.abs(focusLumaMultiplier - previousFocusLumaMultiplier),
      );
      previousFocusLumaMultiplier = focusLumaMultiplier;
      targetPositionByEntityId.clear();
      targetTangentByEntityId.clear();

      for (const slot of displaySlots) {
        const metadata = paperResult.paperById.get(slot.target.entityId)
          ?? dynamicPaperResult.paperById.get(slot.target.entityId);
        if (!metadata) continue;
        targetPositionByEntityId.set(
          slot.target.entityId,
          sampleTargetPosition(
            metadata,
            flowTimeSeconds,
            new THREE.Vector3(),
          ),
        );
        targetTangentByEntityId.set(
          slot.target.entityId,
          sampleTargetTangent(
            metadata,
            flowTimeSeconds,
            new THREE.Vector3(),
          ),
        );
      }
      updatePaperFocusUniforms(
        focusMaterials,
        displaySlots,
        targetTangentByEntityId,
        config.focusField && !effectiveReducedMotion,
        presentationProfile,
      );

      let totalCameraWeight = 0;
      let cameraSlotCount = 0;
      blendedFocusPosition.set(0, 0, 0);
      blendedFocusQuaternion.identity();

      for (const slot of displaySlots) {
        const position = targetPositionByEntityId.get(slot.target.entityId);
        if (!position) continue;
        const cameraWeight = config.focusCamera
          ? slot.profile.cameraBlend * slot.visual.cameraBlend
          : 0;
        if (cameraWeight <= 0.000001) continue;

        approachDirection.copy(baseCameraPosition).sub(position).normalize();
        focusCameraPosition.copy(position).addScaledVector(
          approachDirection,
          AGENT_GALAXY_FOCUS_DISTANCE,
        );
        targetCameraQuaternion.copy(createAnchoredCameraQuaternion(
          camera,
          focusCameraPosition,
          position,
          slot.target.anchorNdc,
        ));
        if (cameraSlotCount === 0) {
          blendedFocusPosition.copy(focusCameraPosition);
          blendedFocusQuaternion.copy(targetCameraQuaternion);
          totalCameraWeight = cameraWeight;
          cameraSlotCount = 1;
        } else {
          const nextTotal = totalCameraWeight + cameraWeight;
          const mix = cameraWeight / Math.max(0.000001, nextTotal);
          blendedFocusPosition.lerp(focusCameraPosition, mix);
          blendedFocusQuaternion.slerp(targetCameraQuaternion, mix);
          totalCameraWeight = nextTotal;
          cameraSlotCount += 1;
        }
      }

      const immersiveCameraCap = primaryFocusCameraCap(
        displaySlots[displaySlots.length - 1]?.mode,
      );
      const cameraInfluence = clamp(
        totalCameraWeight * (
          presentationProfile === "immersive"
            ? immersiveCameraCap
            : 1
        ),
        0,
        1,
      );
      camera.position.copy(baseCameraPosition);
      camera.quaternion.copy(baseCameraQuaternion);
      if (cameraSlotCount > 0 && cameraInfluence > 0) {
        camera.position.lerp(blendedFocusPosition, cameraInfluence);
        focusQuaternionScratch.copy(baseCameraQuaternion)
          .slerp(blendedFocusQuaternion, cameraInfluence);
        camera.quaternion.copy(focusQuaternionScratch);
      }

      const primarySlot = displaySlots[displaySlots.length - 1];
      let cameraDistance: number | undefined;
      let anchorErrorPx: number | undefined;
      let targetCssPixels: number | undefined;
      let targetPhotosphereMix: number | undefined;
      let fieldMaximumWorldDisplacement: number | undefined;
      let fieldMaximumScreenDisplacementPx: number | undefined;
      let fieldAffectedVisibleRatio: number | undefined;
      let semanticPaperColor: string | undefined;
      let semanticHotspotColor: string | undefined;
      if (primarySlot) {
        const position = targetPositionByEntityId.get(primarySlot.target.entityId);
        const metadata = paperResult.paperById.get(
          primarySlot.target.entityId,
        ) ?? dynamicPaperResult.paperById.get(
          primarySlot.target.entityId,
        );
        if (position) {
          focusTargetPosition.copy(position);
          cameraDistance = camera.position.distanceTo(focusTargetPosition);
          camera.updateMatrixWorld(true);
          const projected = projectToViewport(
            focusTargetPosition,
            camera,
            Math.max(1, host.clientWidth),
            Math.max(1, host.clientHeight),
          );
          const anchor = anchorToViewport(
            primarySlot.target.anchorNdc,
            Math.max(1, host.clientWidth),
            Math.max(1, host.clientHeight),
          );
          anchorErrorPx = Math.hypot(
            projected.x - anchor.x,
            projected.y - anchor.y,
          );
          const currentScreen = new THREE.Vector2(projected.x, projected.y);
          if (lastFocusScreenPosition) {
            focusMaxScreenStepPx = Math.max(
              focusMaxScreenStepPx,
              currentScreen.distanceTo(lastFocusScreenPosition),
            );
          }
          lastFocusScreenPosition = currentScreen;

          if (metadata) {
            const viewPosition = focusFieldProbeWorld.copy(position)
              .applyMatrix4(camera.matrixWorldInverse);
            const viewDepth = Math.max(5, -viewPosition.z);
            const perspective = clamp(
              Math.sqrt(96 / viewDepth),
              0.72,
              1.34,
            );
            const baseProjectedSize = metadata.baseCssSize * perspective;
            targetCssPixels = clamp(
              THREE.MathUtils.lerp(
                baseProjectedSize,
                presentationProfile === "immersive"
                  ? Math.min(4.8, primarySlot.profile.targetCssPixels)
                  : primarySlot.profile.targetCssPixels,
                primarySlot.visual.materialBlend,
              ),
              1.6,
              presentationProfile === "immersive" ? 4.8 : 9,
            );
            targetPhotosphereMix = config.starMaterial === "photosphere"
              ? agentGalaxyPhotosphereMix(targetCssPixels)
              : 0;
            semanticPaperColor = agentGalaxyColorToCssHex(
              metadata.paperTint,
            );
            semanticHotspotColor = agentGalaxyColorToCssHex(
              metadata.hotspotTint,
            );

            const effectiveFieldBlend = config.focusField
              && !effectiveReducedMotion
              ? primarySlot.visual.fieldBlend
                * primarySlot.profile.fieldStrength
              : 0;
            fieldMaximumWorldDisplacement =
              agentGalaxyFocusFieldMaximumDisplacement(
                primarySlot.target.neighborhoodRadius,
              ) * effectiveFieldBlend;
            const pixelsPerWorld = Math.max(1, host.clientHeight)
              / (
                2
                * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5))
                * Math.max(1, cameraDistance)
              );
            fieldMaximumScreenDisplacementPx =
              fieldMaximumWorldDisplacement * pixelsPerWorld;

            const hotspotPapers = paperResult.papersByHotspotId.get(
              metadata.hotspot.id,
            ) ?? [];
            let visibleNeighborCount = 0;
            let affectedVisibleNeighborCount = 0;
            const tangent = targetTangentByEntityId.get(
              primarySlot.target.entityId,
            ) ?? DEFAULT_FOCUS_TANGENT;
            for (const neighbor of hotspotPapers) {
              if (
                neighbor.vertexIndex >= budget.papers
                || neighbor.paper.id === metadata.paper.id
              ) continue;
              visibleNeighborCount += 1;
              const relative: AgentGalaxyVector3 = [
                neighbor.paper.offset[0] - metadata.paper.offset[0],
                neighbor.paper.offset[1] - metadata.paper.offset[1],
                neighbor.paper.offset[2] - metadata.paper.offset[2],
              ];
              const fieldSample = sampleAgentGalaxyFocusFieldOffset(
                relative,
                tangent.toArray() as AgentGalaxyVector3,
                primarySlot.target.neighborhoodRadius,
                effectiveFieldBlend,
                hashString32(primarySlot.target.entityId) / 0xffff_ffff,
              );
              focusFieldProbeOffset.fromArray(fieldSample.offset);
              if (
                focusFieldProbeOffset.length()
                >= fieldSample.maximumDisplacement * 0.18
              ) {
                affectedVisibleNeighborCount += 1;
              }
            }
            fieldAffectedVisibleRatio = visibleNeighborCount > 0
              ? affectedVisibleNeighborCount / visibleNeighborCount
              : 0;
          }
        }
      } else {
        lastFocusScreenPosition = undefined;
      }

      latestFocusSnapshot = {
        phase: focusResolutionError ? "idle" : sampledFocus.phase,
        targetId: primarySlot?.target.entityId,
        membership: primarySlot?.target.membership,
        progress: sampledFocus.progress,
        mode: primarySlot?.mode,
        vertexIndex: primarySlot?.target.vertexIndex,
        baseVisible: primarySlot?.target.baseVisible,
        promoted: primarySlot
          ? !primarySlot.target.baseVisible && primarySlot.weight > 0.0001
          : false,
        cameraDistance,
        anchorNdc: primarySlot
          ? [...primarySlot.target.anchorNdc]
          : undefined,
        anchorErrorPx,
        cloudDiameterRatio:
          estimateAgentGalaxyFocusCloudDiameterRatio(displaySlots),
        maxScreenStepPx: focusMaxScreenStepPx,
        maxLumaStepRatio: focusMaxLumaStepRatio,
        acquisitionBlend: primarySlot?.visual.acquisitionBlend,
        fieldBlend: primarySlot?.visual.fieldBlend,
        materialBlend: primarySlot?.visual.materialBlend,
        cameraBlend: primarySlot?.visual.cameraBlend,
        releaseBlend: primarySlot?.visual.releaseBlend,
        targetCssPixels,
        targetPhotosphereMix,
        fieldMaximumWorldDisplacement,
        fieldMaximumScreenDisplacementPx,
        fieldAffectedVisibleRatio,
        semanticPaperColor,
        semanticHotspotColor,
        starMaterial: config.starMaterial,
        semanticCoreDrawCalls: 2,
        semanticSurfaceDrawCalls: 2,
        rendererInstanceId,
        transitionCount: sampledFocus.transitionCount,
        resolutionError: focusResolutionError || undefined,
      };

      if (
        focusTimeSeconds - lastFocusSnapshotAt >= 0.1
        || latestFocusSnapshot.phase === "idle"
      ) {
        onFocusSnapshotRef.current?.(latestFocusSnapshot);
        lastFocusSnapshotAt = focusTimeSeconds;
      }
    };

    const draw = (
      timelineSeconds: number,
      flowTimeSeconds = timelineSeconds,
    ) => {
      updateMotionState(timelineSeconds);
      updateWeaveTime(
        materials,
        flowTimeSeconds * config.speed,
      );
      updateBaseCamera(flowTimeSeconds);
      const focusTimeSeconds = fixedTime || effectiveReducedMotion
        ? Math.max(8, config.fixedTimeSeconds ?? 8)
        : timelineSeconds;
      updateContextPresentation(flowTimeSeconds, focusTimeSeconds);
      updateFocusCamera(flowTimeSeconds, focusTimeSeconds);
      renderer.render(scene, camera);
    };

    const frame = (now: number) => {
      if (disposed || pagePaused) return;
      const delta = Math.min(100, Math.max(0, now - lastFrameAt));
      lastFrameAt = now;
      if (delta > 0) {
        frameTimes.push(delta);
        if (frameTimes.length > 360) frameTimes.shift();
        animationSeconds += Math.min(delta, 50) / 1000;
        weaveAnimationSeconds += Math.min(delta, 50) / 1000
          * motionCurrent.timeScale;
      }
      draw(animationSeconds, weaveAnimationSeconds);

      if (now - metricsWindowStartedAt >= 2000) {
        const recent = frameTimes.slice(-180);
        const average = recent.length
          ? recent.reduce((sum, value) => sum + value, 0) / recent.length
          : 0;
        const fps = average > 0 ? 1000 / average : 0;
        const targetFps = resolvedQuality === "high" ? 50 : 30;
        if (config.quality === "auto" && fps > 0 && fps < targetFps) {
          lowPerformanceWindows += 1;
        } else {
          lowPerformanceWindows = 0;
        }

        if (config.quality === "auto" && lowPerformanceWindows >= 2 && !downgradeReason) {
          if (resolvedQuality === "high") {
            resolvedQuality = "balanced";
            budget = AGENT_GALAXY_FLOW_QUALITY_BUDGET.balanced;
            downgradeReason = "frame-budget-high-to-balanced";
          } else {
            budget = {
              ...AGENT_GALAXY_FLOW_QUALITY_BUDGET.balanced,
              environment: 400,
              dust: 800,
            };
            downgradeReason = "frame-budget-decorative-reduction";
          }
          applyBudget(budget);
          lowPerformanceWindows = 0;
        }
        reportMetrics(false);
        metricsWindowStartedAt = now;
      }
      raf = requestAnimationFrame(frame);
    };

    const staticTime = config.fixedTimeSeconds ?? (effectiveReducedMotion ? 8 : 0);
    if (fixedTime || effectiveReducedMotion) {
      draw(staticTime, staticTime);
      reportMetrics(true);
    } else if (!pagePaused) {
      draw(0, 0);
      reportMetrics(false);
      raf = requestAnimationFrame(frame);
    }

    const handleVisibility = () => {
      pagePaused = document.hidden;
      if (pagePaused) {
        cancelAnimationFrame(raf);
        reportMetrics(true);
        return;
      }
      lastFrameAt = performance.now();
      metricsWindowStartedAt = lastFrameAt;
      if (fixedTime || effectiveReducedMotion) {
        draw(staticTime, staticTime);
        reportMetrics(true);
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      cancelAnimationFrame(raf);
      webglAvailable = false;
      setFallbackReason("WebGL context lost");
      reportMetrics(true);
    };
    document.addEventListener("visibilitychange", handleVisibility);
    renderer.domElement.addEventListener("webglcontextlost", handleContextLost);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", handleVisibility);
      renderer.domElement.removeEventListener("webglcontextlost", handleContextLost);
      resizeObserver.disconnect();
      scene.remove(
        dustPoints,
        environmentPoints,
        paperPoints,
        dynamicPaperPoints,
        hotspotPoints,
        paperSurfacePoints,
        dynamicPaperSurfacePoints,
        hotspotSurfacePoints,
      );
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [config, payload, reducedMotion]);

  return (
    <div
      ref={hostRef}
      className="agent-galaxy-flow"
      data-source-snapshot={payload.sourceSnapshotId}
      data-flow-model="gravitational-weave-tech-preview"
      data-semantic-blending="normal"
      data-semantic-time-opacity="false"
      data-whole-group-transform="false"
    >
      {fallbackReason ? (
        <div className="agent-galaxy-flow__fallback" role="img" aria-label="静态深空背景">
          <span>{fallbackReason}</span>
        </div>
      ) : null}
    </div>
  );
}

export default AgentGalaxyFlowCanvas;
