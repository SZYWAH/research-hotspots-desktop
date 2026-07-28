import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import * as THREE from "three";

import {
  GRAVITATIONAL_WEAVE_DEFAULT_PARAMETERS,
  GRAVITATIONAL_WEAVE_DIFFERENTIAL_RATIO,
  GRAVITATIONAL_WEAVE_GLSL,
  GRAVITATIONAL_WEAVE_MAX_DISPLACEMENT,
  GRAVITATIONAL_WEAVE_NODE_COUNT,
  GRAVITATIONAL_WEAVE_PERIODS,
  assignGravitationalWeaveParticle,
  createGravitationalWeaveField,
  createGravitationalWeaveFlowModel,
  length3,
  sampleGravitationalWeavePosition,
} from "../src/lib/gravitationalWeaveFlow.ts";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function p95(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
}

function distance(left, right) {
  return Math.hypot(
    left[0] - right[0],
    left[1] - right[1],
    left[2] - right[2],
  );
}

function finiteVector(value) {
  return value.length === 3 && value.every(Number.isFinite);
}

function identityForHotspot(payload, hotspot) {
  return {
    kind: "hotspot",
    entityId: hotspot.id,
    hotspotId: hotspot.id,
    sourceSnapshotId: payload.sourceSnapshotId,
    semanticPosition: [...hotspot.position],
    semanticOffset: [0, 0, 0],
  };
}

function identityForPaper(payload, paper, hotspot) {
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

const root = new URL("../", import.meta.url);
const payload = JSON.parse(
  await readFile(new URL(".visual-review/app17/agent-background.json", root), "utf8"),
);
const contract = await readFile(
  new URL("src/lib/agentGalaxyFlowContract.ts", root),
  "utf8",
);

assert(payload.schemaVersion === 1, "Agent background payload schema changed.");
assert(payload.hotspots.length === 160, "Expected 160 hotspot identities.");
assert(payload.papers.length === 3840, "Expected 3840 resident paper proxies.");
assert(
  contract.includes('AGENT_GALAXY_FLOW_CONTRACT_VERSION = "agent-galaxy-flow-contract-v2"'),
  "Flow contract v2 is not active.",
);

const field = createGravitationalWeaveField(payload.sourceSnapshotId);
const repeatedField = createGravitationalWeaveField(payload.sourceSnapshotId);
const fieldJson = JSON.stringify(field);
assert(field.nodes.length === GRAVITATIONAL_WEAVE_NODE_COUNT, "Expected four field nodes.");
assert(fieldJson === JSON.stringify(repeatedField), "Field node generation is not deterministic.");
assert(
  field.nodes.every((node) => (
    node.influenceRadius >= 18
    && node.influenceRadius <= 42
    && finiteVector(node.position)
    && finiteVector(node.axis)
  )),
  "Field node radius or vector is outside its contract.",
);
assert(
  field.nodes.every((node, index) => node.periodSeconds === GRAVITATIONAL_WEAVE_PERIODS[index]),
  "Field node periods changed.",
);

const model = createGravitationalWeaveFlowModel(payload.sourceSnapshotId);
assert(model.id === "gravitational-weave-tech-preview", "Unexpected active flow model.");
assert(model.capabilities.deterministicAnalyticMotion === true, "Analytic motion capability missing.");
assert(model.capabilities.dynamicFocus === false, "M1.2a must not claim dynamic focus.");
assert(model.capabilities.offscreenLoopRequired === false, "M1.2a must not require screen looping.");
assert(model.capabilities.visibleRespawnAllowed === false, "Visible respawn must remain disabled.");
assert(
  model.capabilities.runtimeLaneReassignmentAllowed === false,
  "Runtime lane reassignment must remain disabled.",
);

const hotspotById = new Map(payload.hotspots.map((hotspot) => [hotspot.id, hotspot]));
const paperByHotspot = new Map(payload.hotspots.map((hotspot) => [hotspot.id, []]));
for (const paper of payload.papers) {
  paperByHotspot.get(paper.hotspotId)?.push(paper);
}

const identities = [
  ...payload.hotspots.map((hotspot) => identityForHotspot(payload, hotspot)),
  ...payload.papers.map((paper) => {
    const hotspot = hotspotById.get(paper.hotspotId);
    assert(hotspot, `Paper hotspot is missing: ${paper.id}`);
    return identityForPaper(payload, paper, hotspot);
  }),
];

for (const identity of identities.slice(0, 512)) {
  const left = assignGravitationalWeaveParticle(identity);
  const right = assignGravitationalWeaveParticle(identity);
  assert(JSON.stringify(left) === JSON.stringify(right), `Assignment changed: ${identity.entityId}`);
}

const auditTimes = [0, 8, 20, 36, 44, 53, 67];
let maximumDisplacement = 0;
let minimumCloudDiameterRatio = Number.POSITIVE_INFINITY;
let maximumCloudDiameterRatio = 0;
const coordinateDigest = createHash("sha256");

for (const timeSeconds of auditTimes) {
  for (const hotspot of payload.hotspots) {
    const deformedHotspot = sampleGravitationalWeavePosition(
      hotspot.position,
      [0, 0, 0],
      timeSeconds,
      field,
      GRAVITATIONAL_WEAVE_DEFAULT_PARAMETERS,
    );
    const hotspotDisplacement = distance(deformedHotspot, hotspot.position);
    maximumDisplacement = Math.max(maximumDisplacement, hotspotDisplacement);
    assert(finiteVector(deformedHotspot), `Non-finite hotspot coordinate: ${hotspot.id}`);
    coordinateDigest.update(
      deformedHotspot.map((value) => value.toFixed(9)).join(","),
    );

    const papers = paperByHotspot.get(hotspot.id) ?? [];
    const sourceRadii = [];
    const deformedRadii = [];
    for (const paper of papers) {
      const deformedPaper = sampleGravitationalWeavePosition(
        hotspot.position,
        paper.offset,
        timeSeconds,
        field,
        GRAVITATIONAL_WEAVE_DEFAULT_PARAMETERS,
      );
      const original = [
        hotspot.position[0] + paper.offset[0],
        hotspot.position[1] + paper.offset[1],
        hotspot.position[2] + paper.offset[2],
      ];
      const paperDisplacement = distance(deformedPaper, original);
      maximumDisplacement = Math.max(maximumDisplacement, paperDisplacement);
      assert(finiteVector(deformedPaper), `Non-finite paper coordinate: ${paper.id}`);
      sourceRadii.push(length3(paper.offset));
      deformedRadii.push(distance(deformedPaper, deformedHotspot));
      coordinateDigest.update(
        deformedPaper.map((value) => value.toFixed(9)).join(","),
      );
    }
    const sourceP95 = p95(sourceRadii);
    if (sourceP95 > 1e-6) {
      const ratio = p95(deformedRadii) / sourceP95;
      minimumCloudDiameterRatio = Math.min(minimumCloudDiameterRatio, ratio);
      maximumCloudDiameterRatio = Math.max(maximumCloudDiameterRatio, ratio);
    }
  }
}

assert(
  maximumDisplacement < GRAVITATIONAL_WEAVE_MAX_DISPLACEMENT + 1e-9,
  `Semantic displacement exceeded ${GRAVITATIONAL_WEAVE_MAX_DISPLACEMENT}: ${maximumDisplacement}`,
);
assert(
  minimumCloudDiameterRatio >= 0.94 && maximumCloudDiameterRatio <= 1.06,
  `Cloud diameter ratio left 0.94-1.06: ${minimumCloudDiameterRatio}-${maximumCloudDiameterRatio}`,
);

const continuitySample = identities.slice(0, 256);
const continuityTime = 12.5;
const frameStep = 1 / 60;
let maximumFrameStep = 0;
let maximumVelocityResidual = 0;
for (const identity of continuitySample) {
  const hotspot = hotspotById.get(identity.hotspotId);
  assert(hotspot, `Continuity identity hotspot missing: ${identity.entityId}`);
  const semanticOffset = identity.semanticOffset ?? [0, 0, 0];
  const request = {
    identity,
    hotspotAnchor: hotspot.position,
    semanticOffset,
    assignment: model.assign(identity),
    context: { timeSeconds: continuityTime, motionState: "idle" },
    parameters: model.defaultParameters,
  };
  const current = model.sample(request);
  const next = model.sample({
    ...request,
    context: { ...request.context, timeSeconds: continuityTime + frameStep },
  });
  const frameDistance = distance(current.position, next.position);
  maximumFrameStep = Math.max(maximumFrameStep, frameDistance);
  const predicted = current.position.map(
    (value, index) => value + current.velocity[index] * frameStep,
  );
  maximumVelocityResidual = Math.max(
    maximumVelocityResidual,
    distance(predicted, next.position),
  );
}
assert(maximumFrameStep < 0.02, `A one-frame position jump is too large: ${maximumFrameStep}`);
assert(
  maximumVelocityResidual < 0.001,
  `Velocity continuity residual is too large: ${maximumVelocityResidual}`,
);

const camera = new THREE.PerspectiveCamera(48, 1440 / 900, 0.4, 460);
const azimuth = THREE.MathUtils.degToRad(270);
const elevation = THREE.MathUtils.degToRad(50);
const horizontal = 105 * Math.cos(elevation);
camera.position.set(
  horizontal * Math.cos(azimuth),
  105 * Math.sin(elevation),
  horizontal * Math.sin(azimuth),
);
camera.lookAt(0, 0, 0);
camera.updateMatrixWorld();
camera.updateProjectionMatrix();

let visibleAtStart = 0;
let visiblyMoved = 0;
const visibleMotionPixels = [];
for (const identity of identities) {
  const hotspot = hotspotById.get(identity.hotspotId);
  if (!hotspot) continue;
  const offset = identity.semanticOffset ?? [0, 0, 0];
  const start = sampleGravitationalWeavePosition(
    hotspot.position,
    offset,
    0,
    field,
    GRAVITATIONAL_WEAVE_DEFAULT_PARAMETERS,
  );
  const end = sampleGravitationalWeavePosition(
    hotspot.position,
    offset,
    8,
    field,
    GRAVITATIONAL_WEAVE_DEFAULT_PARAMETERS,
  );
  const startNdc = new THREE.Vector3(...start).project(camera);
  const endNdc = new THREE.Vector3(...end).project(camera);
  if (
    startNdc.z < -1 || startNdc.z > 1
    || Math.abs(startNdc.x) > 1 || Math.abs(startNdc.y) > 1
  ) continue;
  visibleAtStart += 1;
  const pixels = Math.hypot(
    (endNdc.x - startNdc.x) * 720,
    (endNdc.y - startNdc.y) * 450,
  );
  visibleMotionPixels.push(pixels);
  if (pixels >= 1.5) visiblyMoved += 1;
}
const visibleMotionRatio = visibleAtStart > 0 ? visiblyMoved / visibleAtStart : 0;
assert(visibleAtStart > 0, "Static camera sees no semantic stars.");
assert(
  visibleMotionRatio >= 0.3,
  `Only ${(visibleMotionRatio * 100).toFixed(2)}% of visible semantic stars move at least 1.5px.`,
);

const shaderChecks = {
  fourNodes: GRAVITATIONAL_WEAVE_GLSL.includes("#define AGENT_WEAVE_NODE_COUNT 4"),
  differentialLimit: GRAVITATIONAL_WEAVE_GLSL.includes("0.03 * length(semanticOffset)"),
  maximumDisplacement: GRAVITATIONAL_WEAVE_GLSL.includes("/ 2.2"),
  noRespawn: !/respawn|wrap|mod\s*\(/i.test(GRAVITATIONAL_WEAVE_GLSL),
  requiredFunctions: ["agentWeaveField", "agentWeaveSemantic"]
    .every((name) => GRAVITATIONAL_WEAVE_GLSL.includes(name)),
};
for (const [name, pass] of Object.entries(shaderChecks)) {
  assert(pass, `GLSL contract check failed: ${name}`);
}

console.log(JSON.stringify({
  pass: true,
  phase: "m1.2a-gravitational-weave-math",
  model: model.id,
  field: {
    version: field.version,
    nodeCount: field.nodes.length,
    periods: field.nodes.map((node) => node.periodSeconds),
    radiusRange: [
      Math.min(...field.nodes.map((node) => node.influenceRadius)),
      Math.max(...field.nodes.map((node) => node.influenceRadius)),
    ],
    sha256: sha256(fieldJson),
  },
  deterministicCoordinateSha256: coordinateDigest.digest("hex"),
  semantic: {
    identityCount: identities.length,
    maximumDisplacement,
    differentialRatio: GRAVITATIONAL_WEAVE_DIFFERENTIAL_RATIO,
    cloudDiameterRatio: [
      minimumCloudDiameterRatio,
      maximumCloudDiameterRatio,
    ],
  },
  continuity: {
    sampleCount: continuitySample.length,
    maximumFrameStep,
    maximumVelocityResidual,
  },
  staticCameraMotion: {
    viewport: [1440, 900],
    visibleAtStart,
    visiblyMoved,
    visibleMotionRatio,
    p95MotionPixels: p95(visibleMotionPixels),
  },
  shaderChecks,
  gpuParity: {
    status: "UNVERIFIED",
    reason: "Requires the staged browser WebGL review.",
    tolerance: 2e-4,
    sampleCount: 256,
  },
}, null, 2));
