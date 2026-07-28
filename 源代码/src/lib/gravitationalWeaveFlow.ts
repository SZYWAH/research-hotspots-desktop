import type {
  AgentGalaxyFlowAssignment,
  AgentGalaxyFlowContext,
  AgentGalaxyFlowModel,
  AgentGalaxyFlowParticleIdentity,
  AgentGalaxyFlowSample,
  AgentGalaxyFlowSampleRequest,
  AgentGalaxyVector3,
} from "./agentGalaxyFlowContract";

export const GRAVITATIONAL_WEAVE_MODEL_ID =
  "gravitational-weave-tech-preview" as const;
export const GRAVITATIONAL_WEAVE_ASSIGNMENT_VERSION =
  "gravitational-weave-assignment-v1";
export const GRAVITATIONAL_WEAVE_FIELD_VERSION =
  "gravitational-weave-field-v1";
export const GRAVITATIONAL_WEAVE_NODE_COUNT = 4;
export const GRAVITATIONAL_WEAVE_MAX_DISPLACEMENT = 2.2;
export const GRAVITATIONAL_WEAVE_DIFFERENTIAL_RATIO = 0.03;
export const GRAVITATIONAL_WEAVE_PERIODS = [36, 44, 53, 67] as const;
export const GRAVITATIONAL_WEAVE_SELECTION_VERSION =
  "gravitational-weave-visible-selection-v1";
export const GRAVITATIONAL_WEAVE_CAPABILITIES = {
  deterministicAnalyticMotion: true,
  dynamicFocus: false,
  offscreenLoopRequired: false,
  visibleRespawnAllowed: false,
  runtimeLaneReassignmentAllowed: false,
} as const;

const TAU = Math.PI * 2;
const EPSILON = 1e-6;

export type GravitationalWeaveNode = {
  position: AgentGalaxyVector3;
  axis: AgentGalaxyVector3;
  influenceRadius: number;
  periodSeconds: number;
  phase: number;
};

export type GravitationalWeaveField = {
  version: typeof GRAVITATIONAL_WEAVE_FIELD_VERSION;
  sourceSnapshotId: string;
  nodes: readonly GravitationalWeaveNode[];
};

export type GravitationalWeaveParameters = {
  gravity: number;
  shear: number;
  twist: number;
  speed: number;
  calmStrength: number;
  calmCenter: AgentGalaxyVector3;
  calmForward: AgentGalaxyVector3;
  calmUp: AgentGalaxyVector3;
  calmRadii: AgentGalaxyVector3;
};

export type GravitationalWeaveUniformValues = {
  uWeaveTime: number;
  uWeaveGravity: number;
  uWeaveShear: number;
  uWeaveTwist: number;
  uWeaveCalmStrength: number;
  uWeaveNodePosition: AgentGalaxyVector3[];
  uWeaveNodeAxis: AgentGalaxyVector3[];
  uWeaveNodeRadius: number[];
  uWeaveNodePeriod: number[];
  uWeaveNodePhase: number[];
  uWeaveCalmCenter: AgentGalaxyVector3;
  uWeaveCalmForward: AgentGalaxyVector3;
  uWeaveCalmUp: AgentGalaxyVector3;
  uWeaveCalmRadii: AgentGalaxyVector3;
};

export const GRAVITATIONAL_WEAVE_DEFAULT_PARAMETERS:
GravitationalWeaveParameters = {
  gravity: 0.85,
  shear: 0.42,
  twist: 0.18,
  speed: 1,
  calmStrength: 0.3,
  calmCenter: [0, 0, 0],
  // 与评审相机的初始观察轴一致；符号不影响椭球方向。
  calmForward: normalize3([0, 0.7660444431, -0.6427876097]),
  calmUp: normalize3([0, 0.6427876097, 0.7660444431]),
  calmRadii: [18, 13, 30],
};

export const GRAVITATIONAL_WEAVE_UNIFORM_NAMES = [
  "uWeaveTime",
  "uWeaveGravity",
  "uWeaveShear",
  "uWeaveTwist",
  "uWeaveCalmStrength",
  "uWeaveNodePosition",
  "uWeaveNodeAxis",
  "uWeaveNodeRadius",
  "uWeaveNodePeriod",
  "uWeaveNodePhase",
  "uWeaveCalmCenter",
  "uWeaveCalmForward",
  "uWeaveCalmUp",
  "uWeaveCalmRadii",
] as const;

export function fnv1a32(value: string) {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function stableHashUnit(value: string) {
  return fnv1a32(value) / 0x1_0000_0000;
}

export function stableFlowIdentityRank(
  identity: AgentGalaxyFlowParticleIdentity,
  selectionVersion = GRAVITATIONAL_WEAVE_SELECTION_VERSION,
) {
  return fnv1a32([
    identity.sourceSnapshotId,
    selectionVersion,
    identity.kind,
    identity.hotspotId ?? "",
    identity.entityId,
  ].join("\0"));
}

export function selectStableFlowIdentities<
  T extends AgentGalaxyFlowParticleIdentity,
>(
  identities: readonly T[],
  maximumCount: number,
  selectionVersion = GRAVITATIONAL_WEAVE_SELECTION_VERSION,
) {
  if (!Number.isFinite(maximumCount) || maximumCount <= 0) return [];
  return [...identities]
    .sort((left, right) => {
      const rankDifference = stableFlowIdentityRank(left, selectionVersion)
        - stableFlowIdentityRank(right, selectionVersion);
      if (rankDifference !== 0) return rankDifference;
      return left.entityId.localeCompare(right.entityId);
    })
    .slice(0, Math.floor(maximumCount));
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

function add3(left: AgentGalaxyVector3, right: AgentGalaxyVector3):
AgentGalaxyVector3 {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function subtract3(left: AgentGalaxyVector3, right: AgentGalaxyVector3):
AgentGalaxyVector3 {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function scale3(value: AgentGalaxyVector3, scale: number):
AgentGalaxyVector3 {
  return [value[0] * scale, value[1] * scale, value[2] * scale];
}

function clone3(value: AgentGalaxyVector3): AgentGalaxyVector3 {
  return [value[0], value[1], value[2]];
}

function dot3(left: AgentGalaxyVector3, right: AgentGalaxyVector3) {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function cross3(left: AgentGalaxyVector3, right: AgentGalaxyVector3):
AgentGalaxyVector3 {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

export function length3(value: AgentGalaxyVector3) {
  return Math.hypot(value[0], value[1], value[2]);
}

export function normalize3(value: AgentGalaxyVector3): AgentGalaxyVector3 {
  const length = Math.max(EPSILON, length3(value));
  return scale3(value, 1 / length);
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const amount = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return amount * amount * (3 - 2 * amount);
}

function orthonormalBasis(
  forwardInput: AgentGalaxyVector3,
  upInput: AgentGalaxyVector3,
) {
  const forward = normalize3(forwardInput);
  let right = cross3(forward, upInput);
  if (length3(right) < 1e-4) {
    right = cross3(forward, Math.abs(forward[1]) > 0.9
      ? [1, 0, 0]
      : [0, 1, 0]);
  }
  right = normalize3(right);
  const up = normalize3(cross3(right, forward));
  return { forward, right, up };
}

function softLimit(
  displacement: AgentGalaxyVector3,
  maximum = GRAVITATIONAL_WEAVE_MAX_DISPLACEMENT,
): AgentGalaxyVector3 {
  const magnitude = length3(displacement);
  if (magnitude < EPSILON) return [0, 0, 0];
  const normalizedMagnitude = magnitude / Math.max(EPSILON, maximum);
  return scale3(
    displacement,
    1 / Math.sqrt(1 + normalizedMagnitude * normalizedMagnitude),
  );
}

function calmMultiplier(
  position: AgentGalaxyVector3,
  parameters: GravitationalWeaveParameters,
) {
  const relative = subtract3(position, parameters.calmCenter);
  const basis = orthonormalBasis(parameters.calmForward, parameters.calmUp);
  const radii = parameters.calmRadii.map(
    (value) => Math.max(0.1, value),
  ) as AgentGalaxyVector3;
  const right = dot3(relative, basis.right) / radii[0];
  const up = dot3(relative, basis.up) / radii[1];
  const forward = dot3(relative, basis.forward) / radii[2];
  const ellipsoidDistance = Math.sqrt(
    right * right + up * up + forward * forward,
  );
  const interior = 1 - smoothstep(0.45, 1, ellipsoidDistance);
  return 1 - Math.min(0.6, Math.max(0, parameters.calmStrength)) * interior;
}

export function createGravitationalWeaveField(
  sourceSnapshotId: string,
): GravitationalWeaveField {
  const random = createRandom(fnv1a32(
    `${sourceSnapshotId}:${GRAVITATIONAL_WEAVE_FIELD_VERSION}`,
  ));
  const nodes = GRAVITATIONAL_WEAVE_PERIODS.map((periodSeconds, index) => {
    const longitude = random() * TAU;
    const latitude = Math.acos(random() * 2 - 1);
    const distance = 9 + random() * 27;
    const position: AgentGalaxyVector3 = [
      Math.sin(latitude) * Math.cos(longitude) * distance,
      Math.cos(latitude) * distance * 0.72,
      Math.sin(latitude) * Math.sin(longitude) * distance,
    ];
    let axis: AgentGalaxyVector3 = [
      random() * 2 - 1,
      random() * 2 - 1,
      random() * 2 - 1,
    ];
    if (length3(axis) < 1e-4) axis = [0, 1, 0];
    return {
      position,
      axis: normalize3(axis),
      influenceRadius: 18 + random() * 24,
      periodSeconds,
      phase: random() * TAU + index * 0.37,
    };
  });
  return {
    version: GRAVITATIONAL_WEAVE_FIELD_VERSION,
    sourceSnapshotId,
    nodes,
  };
}

export function createGravitationalWeaveNodes(sourceSnapshotId: string) {
  return createGravitationalWeaveField(sourceSnapshotId).nodes;
}

function resolveParameters(
  parameters: Partial<GravitationalWeaveParameters> = {},
): GravitationalWeaveParameters {
  return {
    ...GRAVITATIONAL_WEAVE_DEFAULT_PARAMETERS,
    ...parameters,
    calmCenter: clone3(
      parameters.calmCenter
      ?? GRAVITATIONAL_WEAVE_DEFAULT_PARAMETERS.calmCenter
    ),
    calmForward: clone3(
      parameters.calmForward
      ?? GRAVITATIONAL_WEAVE_DEFAULT_PARAMETERS.calmForward
    ),
    calmUp: clone3(
      parameters.calmUp
      ?? GRAVITATIONAL_WEAVE_DEFAULT_PARAMETERS.calmUp
    ),
    calmRadii: clone3(
      parameters.calmRadii
      ?? GRAVITATIONAL_WEAVE_DEFAULT_PARAMETERS.calmRadii
    ),
  };
}

export function createGravitationalWeaveUniformValues(
  sourceSnapshotId: string,
  parameters: Partial<GravitationalWeaveParameters> = {},
  timeSeconds = 0,
): GravitationalWeaveUniformValues {
  const resolved = resolveParameters(parameters);
  const nodes = createGravitationalWeaveNodes(sourceSnapshotId);
  return {
    uWeaveTime: timeSeconds * Math.max(0, resolved.speed),
    uWeaveGravity: resolved.gravity,
    uWeaveShear: resolved.shear,
    uWeaveTwist: resolved.twist,
    uWeaveCalmStrength: resolved.calmStrength,
    uWeaveNodePosition: nodes.map((node) => clone3(node.position)),
    uWeaveNodeAxis: nodes.map((node) => clone3(node.axis)),
    uWeaveNodeRadius: nodes.map((node) => node.influenceRadius),
    uWeaveNodePeriod: nodes.map((node) => node.periodSeconds),
    uWeaveNodePhase: nodes.map((node) => node.phase),
    uWeaveCalmCenter: clone3(resolved.calmCenter),
    uWeaveCalmForward: clone3(resolved.calmForward),
    uWeaveCalmUp: clone3(resolved.calmUp),
    uWeaveCalmRadii: clone3(resolved.calmRadii),
  };
}

function rawFieldDisplacement(
  position: AgentGalaxyVector3,
  timeSeconds: number,
  field: GravitationalWeaveField,
  parameters: GravitationalWeaveParameters,
): AgentGalaxyVector3 {
  let result: AgentGalaxyVector3 = [0, 0, 0];
  const time = timeSeconds * Math.max(0, parameters.speed);
  for (const node of field.nodes) {
    const delta = subtract3(position, node.position);
    const distance = Math.max(EPSILON, length3(delta));
    const radialDirection = scale3(delta, 1 / distance);
    let tangentDirection = cross3(node.axis, radialDirection);
    if (length3(tangentDirection) < 1e-4) {
      tangentDirection = cross3([0, 1, 0], radialDirection);
    }
    tangentDirection = normalize3(tangentDirection);
    const twistDirection = normalize3(cross3(node.axis, tangentDirection));
    const normalizedDistance = distance / node.influenceRadius;
    const weight = Math.exp(-0.5 * normalizedDistance * normalizedDistance);
    const phase = TAU * time / node.periodSeconds + node.phase;
    const radialAmount = -Math.sin(phase) * parameters.gravity * 1.36;
    const shearAmount = Math.cos(phase * 0.91 + 0.43)
      * parameters.shear * 1.08;
    const twistAmount = Math.sin(phase * 1.07 - 0.71)
      * parameters.twist * normalizedDistance * 0.82;
    const contribution = add3(
      add3(
        scale3(radialDirection, radialAmount),
        scale3(tangentDirection, shearAmount),
      ),
      scale3(twistDirection, twistAmount),
    );
    result = add3(result, scale3(contribution, weight));
  }
  return result;
}

function sampleUnboundedGravitationalWeaveField(
  position: AgentGalaxyVector3,
  timeSeconds: number,
  field: GravitationalWeaveField,
  parameters: GravitationalWeaveParameters =
    GRAVITATIONAL_WEAVE_DEFAULT_PARAMETERS,
) {
  const displacement = rawFieldDisplacement(
    position,
    timeSeconds,
    field,
    parameters,
  );
  return scale3(displacement, calmMultiplier(position, parameters));
}

export function sampleGravitationalWeaveField(
  position: AgentGalaxyVector3,
  timeSeconds: number,
  field: GravitationalWeaveField,
  parameters: GravitationalWeaveParameters =
    GRAVITATIONAL_WEAVE_DEFAULT_PARAMETERS,
) {
  return softLimit(sampleUnboundedGravitationalWeaveField(
    position,
    timeSeconds,
    field,
    parameters,
  ));
}

export function sampleGravitationalWeavePosition(
  hotspotAnchor: AgentGalaxyVector3,
  semanticOffset: AgentGalaxyVector3,
  timeSeconds: number,
  field: GravitationalWeaveField,
  parameters: GravitationalWeaveParameters =
    GRAVITATIONAL_WEAVE_DEFAULT_PARAMETERS,
) {
  const shared = sampleUnboundedGravitationalWeaveField(
    hotspotAnchor,
    timeSeconds,
    field,
    parameters,
  );
  const semanticPosition = add3(hotspotAnchor, semanticOffset);
  const local = sampleUnboundedGravitationalWeaveField(
    semanticPosition,
    timeSeconds,
    field,
    parameters,
  );
  let differential = subtract3(local, shared);
  const localLimit = GRAVITATIONAL_WEAVE_DIFFERENTIAL_RATIO
    * length3(semanticOffset);
  const differentialLength = length3(differential);
  if (localLimit <= EPSILON) {
    differential = [0, 0, 0];
  } else if (differentialLength > localLimit) {
    differential = scale3(differential, localLimit / differentialLength);
  }
  const movement = softLimit(add3(shared, differential));
  return add3(semanticPosition, movement);
}

function samplePositionFromRequest(
  request: AgentGalaxyFlowSampleRequest<GravitationalWeaveParameters>,
  field: GravitationalWeaveField,
) {
  return sampleGravitationalWeavePosition(
    request.hotspotAnchor,
    request.semanticOffset,
    request.context.timeSeconds,
    field,
    request.parameters,
  );
}

function sampleRequest(
  request: AgentGalaxyFlowSampleRequest<GravitationalWeaveParameters>,
  field: GravitationalWeaveField,
): AgentGalaxyFlowSample {
  const position = samplePositionFromRequest(request, field);
  const timeStep = 1 / 240;
  const before = samplePositionFromRequest({
    ...request,
    context: {
      ...request.context,
      timeSeconds: request.context.timeSeconds - timeStep,
    },
  }, field);
  const after = samplePositionFromRequest({
    ...request,
    context: {
      ...request.context,
      timeSeconds: request.context.timeSeconds + timeStep,
    },
  }, field);
  return {
    position,
    velocity: scale3(subtract3(after, before), 1 / (timeStep * 2)),
  };
}

export function sampleGravitationalWeave(
  request: AgentGalaxyFlowSampleRequest<GravitationalWeaveParameters>,
) {
  return sampleRequest(
    request,
    createGravitationalWeaveField(request.identity.sourceSnapshotId),
  );
}

export function sampleGravitationalWeaveTangent(
  request: AgentGalaxyFlowSampleRequest<GravitationalWeaveParameters>,
): AgentGalaxyVector3 {
  const velocity = sampleGravitationalWeave(request).velocity;
  if (length3(velocity) >= EPSILON) return normalize3(velocity);
  return normalize3([
    Math.cos(request.assignment.phase),
    request.assignment.radialOffset[1] * 0.2,
    Math.sin(request.assignment.phase),
  ]);
}

export function assignGravitationalWeaveParticle(
  identity: AgentGalaxyFlowParticleIdentity,
): AgentGalaxyFlowAssignment {
  const prefix = [
    identity.sourceSnapshotId,
    identity.kind,
    identity.hotspotId ?? "",
    identity.entityId,
    GRAVITATIONAL_WEAVE_ASSIGNMENT_VERSION,
  ].join(":");
  const seed = fnv1a32(prefix);
  return {
    laneId: seed % GRAVITATIONAL_WEAVE_NODE_COUNT,
    phase: stableHashUnit(`${prefix}:phase`) * TAU,
    radialOffset: [
      stableHashUnit(`${prefix}:radial-x`) * 2 - 1,
      stableHashUnit(`${prefix}:radial-y`) * 2 - 1,
    ],
    seed,
  };
}

export const createGravitationalWeaveAssignment =
  assignGravitationalWeaveParticle;

export function createGravitationalWeaveFlowModel(
  sourceSnapshotId: string,
): AgentGalaxyFlowModel<GravitationalWeaveParameters> {
  const field = createGravitationalWeaveField(sourceSnapshotId);
  return {
    id: GRAVITATIONAL_WEAVE_MODEL_ID,
    assignmentVersion: GRAVITATIONAL_WEAVE_ASSIGNMENT_VERSION,
    capabilities: GRAVITATIONAL_WEAVE_CAPABILITIES,
    shader: {
      vertexChunkId: "agent-gravitational-weave-v1",
      uniformNames: GRAVITATIONAL_WEAVE_UNIFORM_NAMES,
      vertexChunk: GRAVITATIONAL_WEAVE_GLSL,
    },
    defaultParameters: GRAVITATIONAL_WEAVE_DEFAULT_PARAMETERS,
    assign: assignGravitationalWeaveParticle,
    sample: (request) => sampleRequest(request, field),
    sampleTangent: (request) => {
      const velocity = sampleRequest(request, field).velocity;
      return length3(velocity) < EPSILON ? [0, 0, 1] : normalize3(velocity);
    },
  };
}

export function makeGravitationalWeaveContext(
  timeSeconds: number,
): AgentGalaxyFlowContext {
  return { timeSeconds, motionState: "idle" };
}

export const GRAVITATIONAL_WEAVE_GLSL = `
  #define AGENT_WEAVE_NODE_COUNT 4
  uniform float uWeaveTime;
  uniform float uWeaveGravity;
  uniform float uWeaveShear;
  uniform float uWeaveTwist;
  uniform float uWeaveCalmStrength;
  uniform vec3 uWeaveNodePosition[AGENT_WEAVE_NODE_COUNT];
  uniform vec3 uWeaveNodeAxis[AGENT_WEAVE_NODE_COUNT];
  uniform float uWeaveNodeRadius[AGENT_WEAVE_NODE_COUNT];
  uniform float uWeaveNodePeriod[AGENT_WEAVE_NODE_COUNT];
  uniform float uWeaveNodePhase[AGENT_WEAVE_NODE_COUNT];
  uniform vec3 uWeaveCalmCenter;
  uniform vec3 uWeaveCalmForward;
  uniform vec3 uWeaveCalmUp;
  uniform vec3 uWeaveCalmRadii;

  vec3 agentSafeNormalize(vec3 value) {
    return value / max(0.000001, length(value));
  }

  vec3 agentSoftLimit(vec3 value) {
    float normalizedMagnitude = length(value) / 2.2;
    return value / sqrt(1.0 + normalizedMagnitude * normalizedMagnitude);
  }

  float agentCalmMultiplier(vec3 position) {
    vec3 forward = agentSafeNormalize(uWeaveCalmForward);
    vec3 right = agentSafeNormalize(cross(forward, uWeaveCalmUp));
    vec3 up = agentSafeNormalize(cross(right, forward));
    vec3 relative = position - uWeaveCalmCenter;
    vec3 radii = max(uWeaveCalmRadii, vec3(0.1));
    vec3 ellipsoid = vec3(
      dot(relative, right) / radii.x,
      dot(relative, up) / radii.y,
      dot(relative, forward) / radii.z
    );
    float interior = 1.0 - smoothstep(0.45, 1.0, length(ellipsoid));
    return 1.0 - clamp(uWeaveCalmStrength, 0.0, 0.6) * interior;
  }

  vec3 agentRawWeaveField(vec3 position) {
    vec3 result = vec3(0.0);
    for (int index = 0; index < AGENT_WEAVE_NODE_COUNT; index += 1) {
      vec3 delta = position - uWeaveNodePosition[index];
      float distanceToNode = max(0.000001, length(delta));
      vec3 radialDirection = delta / distanceToNode;
      vec3 tangentDirection = cross(uWeaveNodeAxis[index], radialDirection);
      if (length(tangentDirection) < 0.0001) {
        tangentDirection = cross(vec3(0.0, 1.0, 0.0), radialDirection);
      }
      tangentDirection = agentSafeNormalize(tangentDirection);
      vec3 twistDirection = agentSafeNormalize(
        cross(uWeaveNodeAxis[index], tangentDirection)
      );
      float normalizedDistance = distanceToNode / uWeaveNodeRadius[index];
      float weight = exp(-0.5 * normalizedDistance * normalizedDistance);
      float phase = 6.28318530718 * uWeaveTime
        / uWeaveNodePeriod[index] + uWeaveNodePhase[index];
      float radialAmount = -sin(phase) * uWeaveGravity * 1.36;
      float shearAmount = cos(phase * 0.91 + 0.43)
        * uWeaveShear * 1.08;
      float twistAmount = sin(phase * 1.07 - 0.71)
        * uWeaveTwist * normalizedDistance * 0.82;
      result += (
        radialDirection * radialAmount
        + tangentDirection * shearAmount
        + twistDirection * twistAmount
      ) * weight;
    }
    return result;
  }

  vec3 agentUnboundedWeaveField(vec3 position) {
    return agentRawWeaveField(position) * agentCalmMultiplier(position);
  }

  vec3 agentWeaveField(vec3 position) {
    return agentSoftLimit(agentUnboundedWeaveField(position));
  }

  vec3 agentWeaveSemantic(vec3 hotspotAnchor, vec3 semanticOffset) {
    vec3 shared = agentUnboundedWeaveField(hotspotAnchor);
    vec3 semanticPosition = hotspotAnchor + semanticOffset;
    vec3 differential = agentUnboundedWeaveField(semanticPosition) - shared;
    float localLimit = 0.03 * length(semanticOffset);
    float differentialLength = length(differential);
    if (localLimit <= 0.000001) {
      differential = vec3(0.0);
    } else if (differentialLength > localLimit) {
      differential *= localLimit / differentialLength;
    }
    vec3 movement = agentSoftLimit(shared + differential);
    return semanticPosition + movement;
  }

  vec3 agentGalaxyWeaveField(vec3 position) {
    return agentWeaveField(position);
  }

  vec3 agentGalaxyWeaveHotspotPosition(vec3 hotspotAnchor) {
    return agentWeaveSemantic(hotspotAnchor, vec3(0.0));
  }

  vec3 agentGalaxyWeavePaperPosition(
    vec3 hotspotAnchor,
    vec3 semanticOffset
  ) {
    return agentWeaveSemantic(hotspotAnchor, semanticOffset);
  }

  vec3 agentGalaxyWeaveFreePosition(vec3 semanticPosition) {
    return semanticPosition + agentWeaveField(semanticPosition);
  }
`;

export const GRAVITATIONAL_WEAVE_GLSL_CHUNK = GRAVITATIONAL_WEAVE_GLSL;
