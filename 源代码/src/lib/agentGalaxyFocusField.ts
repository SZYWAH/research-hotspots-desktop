import type { AgentGalaxyVector3 } from "./agentGalaxyFlowContract";

export const AGENT_GALAXY_FOCUS_FIELD_CONTRACT_VERSION =
  "agent-galaxy-focus-field-v1";

export const AGENT_GALAXY_FOCUS_FIELD_MAX_RADIUS_FRACTION = 0.02;
export const AGENT_GALAXY_FOCUS_FIELD_MAX_WORLD_UNITS = 0.24;

export type AgentGalaxyFocusFieldSample = {
  offset: AgentGalaxyVector3;
  influence: number;
  maximumDisplacement: number;
};

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(edge0: number, edge1: number, value: number) {
  if (edge1 <= edge0) return value >= edge1 ? 1 : 0;
  const amount = clamp01((value - edge0) / (edge1 - edge0));
  return amount * amount * (3 - 2 * amount);
}

function length3(value: AgentGalaxyVector3) {
  return Math.hypot(value[0], value[1], value[2]);
}

function scale3(
  value: AgentGalaxyVector3,
  scalar: number,
): AgentGalaxyVector3 {
  return [
    value[0] * scalar,
    value[1] * scalar,
    value[2] * scalar,
  ];
}

function normalize3(
  value: AgentGalaxyVector3,
  fallback: AgentGalaxyVector3,
): AgentGalaxyVector3 {
  const magnitude = length3(value);
  if (magnitude <= 1e-8) return [...fallback];
  return scale3(value, 1 / magnitude);
}

function cross3(
  left: AgentGalaxyVector3,
  right: AgentGalaxyVector3,
): AgentGalaxyVector3 {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function dot3(
  left: AgentGalaxyVector3,
  right: AgentGalaxyVector3,
) {
  return left[0] * right[0]
    + left[1] * right[1]
    + left[2] * right[2];
}

export function agentGalaxyFocusFieldMaximumDisplacement(radius: number) {
  return Math.min(
    Math.max(0, radius) * AGENT_GALAXY_FOCUS_FIELD_MAX_RADIUS_FRACTION,
    AGENT_GALAXY_FOCUS_FIELD_MAX_WORLD_UNITS,
  );
}

/**
 * A deterministic, non-radial tidal bend used by both diagnostics and the
 * vertex shader. It changes local velocity and curvature without making the
 * paper cloud collapse into a ring or a queue.
 */
export function sampleAgentGalaxyFocusFieldOffset(
  semanticRelative: AgentGalaxyVector3,
  targetTangent: AgentGalaxyVector3,
  radius: number,
  fieldBlend: number,
  seed: number,
): AgentGalaxyFocusFieldSample {
  const safeRadius = Math.max(0.1, radius);
  const semanticDistance = length3(semanticRelative);
  const maximumDisplacement =
    agentGalaxyFocusFieldMaximumDisplacement(safeRadius);
  if (
    semanticDistance <= 1e-8
    || semanticDistance >= safeRadius
    || fieldBlend <= 1e-8
  ) {
    return {
      offset: [0, 0, 0],
      influence: 0,
      maximumDisplacement,
    };
  }

  const radial = normalize3(semanticRelative, [1, 0, 0]);
  const tangent = normalize3(targetTangent, [0, 1, 0]);
  let side = cross3(tangent, radial);
  if (length3(side) <= 1e-5) {
    const fallbackAxis: AgentGalaxyVector3 =
      Math.abs(tangent[1]) < 0.82 ? [0, 1, 0] : [1, 0, 0];
    side = cross3(tangent, fallbackAxis);
  }
  side = normalize3(side, [0, 0, 1]);

  const normalizedDistance = clamp01(semanticDistance / safeRadius);
  const neighborhood = 1 - smoothstep(
    safeRadius * 0.36,
    safeRadius,
    semanticDistance,
  );
  const phase = dot3(semanticRelative, [0.83, 1.17, 1.43])
    + seed * 6.28318530718;
  const signedBend = Math.sin(phase);
  const tangentShear = dot3(radial, tangent);
  const envelope = clamp01(fieldBlend)
    * neighborhood
    * (0.48 + normalizedDistance * 0.52);

  const raw: AgentGalaxyVector3 = [
    side[0] * signedBend * 0.82 + tangent[0] * tangentShear * 0.28,
    side[1] * signedBend * 0.82 + tangent[1] * tangentShear * 0.28,
    side[2] * signedBend * 0.82 + tangent[2] * tangentShear * 0.28,
  ];
  const rawLength = length3(raw);
  if (rawLength <= 1e-8) {
    return {
      offset: [0, 0, 0],
      influence: envelope,
      maximumDisplacement,
    };
  }
  const requestedLength = maximumDisplacement * envelope;
  const softLimitedLength = requestedLength
    / (1 + requestedLength / Math.max(1e-6, maximumDisplacement));
  return {
    offset: scale3(raw, softLimitedLength / rawLength),
    influence: envelope,
    maximumDisplacement,
  };
}

export const AGENT_GALAXY_FOCUS_FIELD_GLSL_CHUNK = `
  float agentFocusFieldSaturate(float value) {
    return clamp(value, 0.0, 1.0);
  }

  vec3 agentFocusFieldSafeNormalize(vec3 value, vec3 fallbackValue) {
    float magnitude = length(value);
    return magnitude <= 0.00000001 ? fallbackValue : value / magnitude;
  }

  vec4 agentGalaxyFocusFieldOffset(
    vec3 semanticRelative,
    vec3 targetTangent,
    float radius,
    float fieldBlend,
    float seed
  ) {
    float safeRadius = max(0.1, radius);
    float semanticDistance = length(semanticRelative);
    float maximumDisplacement = min(
      safeRadius * 0.02,
      0.24
    );
    if (
      semanticDistance <= 0.00000001
      || semanticDistance >= safeRadius
      || fieldBlend <= 0.00000001
    ) {
      return vec4(0.0, 0.0, 0.0, 0.0);
    }

    vec3 radial = agentFocusFieldSafeNormalize(
      semanticRelative,
      vec3(1.0, 0.0, 0.0)
    );
    vec3 tangent = agentFocusFieldSafeNormalize(
      targetTangent,
      vec3(0.0, 1.0, 0.0)
    );
    vec3 side = cross(tangent, radial);
    if (length(side) <= 0.00001) {
      vec3 fallbackAxis = abs(tangent.y) < 0.82
        ? vec3(0.0, 1.0, 0.0)
        : vec3(1.0, 0.0, 0.0);
      side = cross(tangent, fallbackAxis);
    }
    side = agentFocusFieldSafeNormalize(side, vec3(0.0, 0.0, 1.0));

    float normalizedDistance = agentFocusFieldSaturate(
      semanticDistance / safeRadius
    );
    float neighborhood = 1.0 - smoothstep(
      safeRadius * 0.36,
      safeRadius,
      semanticDistance
    );
    float phase = dot(
      semanticRelative,
      vec3(0.83, 1.17, 1.43)
    ) + seed * 6.28318530718;
    float signedBend = sin(phase);
    float tangentShear = dot(radial, tangent);
    float envelope = agentFocusFieldSaturate(fieldBlend)
      * neighborhood
      * (0.48 + normalizedDistance * 0.52);

    vec3 rawOffset = side * signedBend * 0.82
      + tangent * tangentShear * 0.28;
    float rawLength = length(rawOffset);
    if (rawLength <= 0.00000001) {
      return vec4(0.0, 0.0, 0.0, envelope);
    }
    float requestedLength = maximumDisplacement * envelope;
    float softLimitedLength = requestedLength
      / (1.0 + requestedLength / max(0.000001, maximumDisplacement));
    return vec4(
      rawOffset * (softLimitedLength / rawLength),
      envelope
    );
  }
`;
