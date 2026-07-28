import * as THREE from "three";

import type { AgentGalaxyVector3 } from "./agentGalaxyFlowContract";

export const AGENT_GALAXY_PHOTOSPHERE_CONTRACT_VERSION =
  "agent-galaxy-photosphere-v1";

export type AgentGalaxyPhotosphereStyle = {
  kind: "paper" | "hotspot";
  coreRatio: number;
  limbStrength: number;
  surfaceChromaScale: number;
  coronaStrength: number;
  lodStartPx: number;
  lodFullPx: number;
};

export const AGENT_GALAXY_PHOTOSPHERE_STYLES: Record<
  AgentGalaxyPhotosphereStyle["kind"],
  AgentGalaxyPhotosphereStyle
> = {
  paper: {
    kind: "paper",
    coreRatio: 0.17,
    limbStrength: 0.58,
    surfaceChromaScale: 0.46,
    coronaStrength: 0.035,
    lodStartPx: 2.2,
    lodFullPx: 4.5,
  },
  hotspot: {
    kind: "hotspot",
    coreRatio: 0.23,
    limbStrength: 0.7,
    surfaceChromaScale: 1,
    coronaStrength: 0.18,
    lodStartPx: 2.2,
    lodFullPx: 4.5,
  },
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function createTint(
  colorValue: string,
  saturationMinimum: number,
  saturationMaximum: number,
  saturationScale: number,
  lightnessMinimum: number,
  lightnessMaximum: number,
): THREE.Color {
  const color = new THREE.Color(colorValue || "#b7c6d1");
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  color.setHSL(
    hsl.h,
    clamp(
      hsl.s * saturationScale,
      saturationMinimum,
      saturationMaximum,
    ),
    clamp(hsl.l, lightnessMinimum, lightnessMaximum),
  );
  return color;
}

export function createAgentGalaxyPaperTint(
  colorValue: string,
): AgentGalaxyVector3 {
  return createTint(colorValue, 0.045, 0.08, 0.12, 0.78, 0.84)
    .toArray() as AgentGalaxyVector3;
}

export function createAgentGalaxyHotspotTint(
  colorValue: string,
): AgentGalaxyVector3 {
  return createTint(colorValue, 0.12, 0.18, 0.24, 0.7, 0.78)
    .toArray() as AgentGalaxyVector3;
}

export function createAgentGalaxyFocusTint(
  colorValue: string,
): AgentGalaxyVector3 {
  return createTint(colorValue, 0.16, 0.22, 0.32, 0.68, 0.76)
    .toArray() as AgentGalaxyVector3;
}

export function agentGalaxyColorToCssHex(color: AgentGalaxyVector3) {
  return `#${new THREE.Color().fromArray(color).getHexString()}`;
}

export function agentGalaxyPhotosphereMix(cssPixels: number) {
  const style = AGENT_GALAXY_PHOTOSPHERE_STYLES.paper;
  const amount = clamp(
    (cssPixels - style.lodStartPx)
      / (style.lodFullPx - style.lodStartPx),
    0,
    1,
  );
  return amount * amount * (3 - 2 * amount);
}

export const AGENT_GALAXY_FLAT_SEMANTIC_FRAGMENT_SHADER = `
  uniform float uOpacity;
  varying float vLuma;
  varying float vDepthLuma;
  varying float vFocusLuma;
  varying vec3 vSemanticTint;
  varying float vFocusMaterial;
  varying float vNeighborhoodContrast;
  varying float vVertexVisibility;

  vec3 agentStarSoftCompress(vec3 energy) {
    return vec3(1.0) - exp(-max(energy, vec3(0.0)));
  }

  void main() {
    if (vVertexVisibility < 0.0001) discard;
    vec2 centered = gl_PointCoord - vec2(0.5);
    float radius = length(centered);
    if (radius > 0.5) discard;

    float edgeAa = clamp(fwidth(radius), 0.008, 0.08);
    float coverage = 1.0 - smoothstep(
      0.455 - edgeAa,
      0.455 + edgeAa,
      radius
    );
    float core = 1.0 - smoothstep(0.045, 0.155, radius);
    float alpha = coverage * uOpacity * vLuma * vDepthLuma;
    if (alpha < 0.006) discard;

    vec3 materialTint = mix(
      vSemanticTint,
      vec3(1.0),
      core * (0.82 + vFocusMaterial * 0.12)
    );
    vec3 energy = materialTint
      * (0.9 + core * 0.26)
      * vFocusLuma
      * vNeighborhoodContrast;
    gl_FragColor = vec4(agentStarSoftCompress(energy * 1.35), alpha);
  }
`;

export const AGENT_GALAXY_PHOTOSPHERE_CORE_FRAGMENT_SHADER = `
  uniform float uOpacity;
  uniform float uCoreRatio;
  uniform float uLimbStrength;
  varying float vLuma;
  varying float vDepthLuma;
  varying float vFocusLuma;
  varying vec3 vSemanticTint;
  varying float vFocusMaterial;
  varying float vNeighborhoodContrast;
  varying float vVertexVisibility;
  varying float vPhotosphereMix;

  vec3 agentStarSoftCompress(vec3 energy) {
    return vec3(1.0) - exp(-max(energy, vec3(0.0)));
  }

  void main() {
    if (vVertexVisibility < 0.0001) discard;
    vec2 point = (gl_PointCoord - vec2(0.5)) * 2.0;
    float radiusSquared = dot(point, point);
    if (radiusSquared > 1.0) discard;

    float radius = sqrt(radiusSquared) * 0.5;
    float edgeAa = clamp(fwidth(radius), 0.006, 0.07);
    float coverage = 1.0 - smoothstep(
      0.475 - edgeAa,
      0.475 + edgeAa,
      radius
    );
    float sphereZ = sqrt(max(0.0, 1.0 - radiusSquared));
    vec3 normal = normalize(vec3(point.x, -point.y, sphereZ));
    vec3 keyLight = normalize(vec3(-0.38, 0.46, 0.80));
    float diffuse = max(dot(normal, keyLight), 0.0);
    float limb = pow(max(sphereZ, 0.0), uLimbStrength);
    float specular = pow(
      max(dot(reflect(-keyLight, normal), vec3(0.0, 0.0, 1.0)), 0.0),
      18.0
    );
    float coreRadius = mix(0.115, uCoreRatio, vPhotosphereMix);
    float brightCore = 1.0 - smoothstep(
      coreRadius * 0.45,
      coreRadius,
      length(point)
    );

    vec3 pinTint = mix(vSemanticTint, vec3(1.0), 0.9);
    vec3 sphereTint = mix(
      vec3(0.94, 0.96, 0.97),
      vSemanticTint,
      0.42 + vFocusMaterial * 0.34
    );
    float sphereLight = 0.43
      + diffuse * 0.48
      + limb * 0.18
      + specular * 0.2;
    vec3 sphereEnergy = sphereTint * sphereLight
      + vec3(1.0) * brightCore * (0.46 + vFocusMaterial * 0.12);
    vec3 pinEnergy = pinTint * (0.84 + brightCore * 0.42);
    vec3 energy = mix(pinEnergy, sphereEnergy, vPhotosphereMix)
      * vFocusLuma
      * vNeighborhoodContrast;
    float alpha = coverage * uOpacity * vLuma * vDepthLuma;
    if (alpha < 0.006) discard;

    gl_FragColor = vec4(agentStarSoftCompress(energy * 1.42), alpha);
  }
`;

export const AGENT_GALAXY_PHOTOSPHERE_SURFACE_FRAGMENT_SHADER = `
  uniform float uOpacity;
  uniform float uCoronaStrength;
  uniform float uSurfaceChromaScale;
  varying float vLuma;
  varying float vDepthLuma;
  varying float vFocusLuma;
  varying vec3 vSemanticTint;
  varying float vFocusMaterial;
  varying float vNeighborhoodContrast;
  varying float vVertexVisibility;
  varying float vPhotosphereMix;

  vec3 agentStarSoftCompress(vec3 energy) {
    return vec3(1.0) - exp(-max(energy, vec3(0.0)));
  }

  void main() {
    if (vVertexVisibility < 0.0001 || vPhotosphereMix < 0.0001) discard;
    vec2 point = (gl_PointCoord - vec2(0.5)) * 2.0;
    float radiusSquared = dot(point, point);
    if (radiusSquared > 1.0) discard;

    float radius = sqrt(radiusSquared);
    float sphereZ = sqrt(max(0.0, 1.0 - radiusSquared));
    vec3 normal = normalize(vec3(point.x, -point.y, sphereZ));
    vec3 keyLight = normalize(vec3(-0.38, 0.46, 0.80));
    float diffuse = max(dot(normal, keyLight), 0.0);
    float shell = smoothstep(0.2, 0.55, radius)
      * (1.0 - smoothstep(0.79, 1.0, radius));
    float corona = (uCoronaStrength + vFocusMaterial * 0.12)
      * vPhotosphereMix;
    float alpha = shell
      * corona
      * 0.32
      * uOpacity
      * vLuma
      * vDepthLuma;
    if (alpha < 0.003) discard;

    vec3 mantleTint = mix(
      vec3(0.88, 0.91, 0.93),
      vSemanticTint,
      clamp(
        uSurfaceChromaScale * (0.62 + vFocusMaterial * 0.18),
        0.0,
        1.0
      )
    );
    vec3 energy = mantleTint
      * (0.54 + diffuse * 0.46)
      * vFocusLuma
      * vNeighborhoodContrast;
    gl_FragColor = vec4(agentStarSoftCompress(energy * 1.12), alpha);
  }
`;
