import { readFile } from "node:fs/promises";

import {
  AGENT_GALAXY_FOCUS_PROFILES,
  agentGalaxyFocusSmootherstep,
  commandAgentGalaxyFocus,
  createAgentGalaxyFocusController,
  estimateAgentGalaxyFocusCloudDiameterRatio,
  releaseAgentGalaxyFocus,
  resolveResidentPaperBaseVisibility,
  sampleAgentGalaxyFocusController,
  selectAgentGalaxyFocusAnchor,
} from "../src/lib/agentGalaxyResidentFocus.ts";
import {
  stableFlowIdentityRank,
} from "../src/lib/gravitationalWeaveFlow.ts";
import {
  AGENT_GALAXY_FOCUS_FIELD_MAX_WORLD_UNITS,
  agentGalaxyFocusFieldMaximumDisplacement,
  sampleAgentGalaxyFocusFieldOffset,
} from "../src/lib/agentGalaxyFocusField.ts";
import {
  AGENT_GALAXY_PHOTOSPHERE_STYLES,
  agentGalaxyPhotosphereMix,
  createAgentGalaxyFocusTint,
  createAgentGalaxyHotspotTint,
  createAgentGalaxyPaperTint,
} from "../src/lib/agentGalaxyPhotosphere.ts";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const [
  canvas,
  review,
  reviewCss,
  reviewConfig,
  flow,
  focusField,
  photosphere,
  payloadText,
  fixturesText,
] = await Promise.all([
  read("src/components/AgentGalaxyFlowCanvas.tsx"),
  read("src/components/AgentGalaxyFlowReview.tsx"),
  read("src/components/AgentGalaxyFlowReview.css"),
  read("src/lib/agentGalaxyFlowReview.ts"),
  read("src/lib/gravitationalWeaveFlow.ts"),
  read("src/lib/agentGalaxyFocusField.ts"),
  read("src/lib/agentGalaxyPhotosphere.ts"),
  read(".visual-review/app17/agent-background.json"),
  read("docs/evidence/agent-galaxy-focus-fixtures-v1.json"),
]);

const payload = JSON.parse(payloadText);
const fixtures = JSON.parse(fixturesText);
assert(payload.papers.length === 3840, "Expected 3840 resident paper identities.");

const hotspotById = new Map(payload.hotspots.map((hotspot) => [hotspot.id, hotspot]));
const identities = payload.papers.map((paper) => {
  const hotspot = hotspotById.get(paper.hotspotId);
  assert(hotspot, `Missing paper hotspot: ${paper.id}`);
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
});
const ordered = [...identities].sort((left, right) => {
  const difference = stableFlowIdentityRank(
    left,
    "agent-flow-paper-visibility-v1",
  ) - stableFlowIdentityRank(
    right,
    "agent-flow-paper-visibility-v1",
  );
  return difference || left.entityId.localeCompare(right.entityId);
});
const indexById = new Map(ordered.map((identity, index) => [identity.entityId, index]));
assert(indexById.size === 3840, "Resident paper identity map contains duplicates.");

const visibleFixture = fixtures.sampledPapers.find(
  (paper) => paper.id === "project-default:openalex:W2582012066",
);
const promotedFixture = fixtures.sampledPapers.find(
  (paper) => paper.id === "project-default:openalex:W4386693657",
);
assert(visibleFixture && promotedFixture, "Resident focus fixtures are incomplete.");
const visibleFixtureIndex = indexById.get(visibleFixture.id);
const promotedFixtureIndex = indexById.get(promotedFixture.id);
assert(
  resolveResidentPaperBaseVisibility(visibleFixtureIndex, 1920),
  "Visible fixture must remain in the balanced resident budget.",
);
assert(
  !resolveResidentPaperBaseVisibility(promotedFixtureIndex, 1920)
    && resolveResidentPaperBaseVisibility(promotedFixtureIndex, 2560),
  "Promotion fixture must be hidden in balanced and visible in high.",
);

function target(entityId, vertexIndex, hotspotIndex) {
  return {
    entityId,
    vertexIndex,
    hotspotId: `hotspot-${hotspotIndex}`,
    hotspotIndex,
    hotspotAnchor: [hotspotIndex, 0, 0],
    semanticOffset: [1, 0.5, -0.25],
    focusTint: [0.48, 0.57, 0.64],
    neighborhoodRadius: 8,
    membership: "sampled",
    baseVisible: vertexIndex < 1920,
    anchorNdc: hotspotIndex % 2 ? [0.52, 0.14] : [-0.52, 0.14],
  };
}

const visibleTarget = target(visibleFixture.id, visibleFixtureIndex, 1);
const promotedTarget = target(promotedFixture.id, promotedFixtureIndex, 2);

const fullController = createAgentGalaxyFocusController();
commandAgentGalaxyFocus(fullController, visibleTarget, "full-focus", 0);
assert(
  sampleAgentGalaxyFocusController(fullController, 0).slots[0].weight === 0,
  "Full focus must start without a style or geometry jump.",
);
const fullAtAcquisition = sampleAgentGalaxyFocusController(
  fullController,
  0.65,
);
assert(
  fullAtAcquisition.slots[0].visual.acquisitionBlend === 1
    && fullAtAcquisition.slots[0].visual.cameraBlend === 0,
  "Full focus must become perceptible before the camera begins moving.",
);
const fullBeforeCamera = sampleAgentGalaxyFocusController(
  fullController,
  0.94,
);
assert(
  fullBeforeCamera.slots[0].visual.materialBlend > 0.9
    && fullBeforeCamera.slots[0].visual.fieldBlend > 0
    && fullBeforeCamera.slots[0].visual.cameraBlend === 0,
  "Photosphere and FocusField must be visible before camera capture.",
);
const fullHold = sampleAgentGalaxyFocusController(fullController, 2.36);
assert(
  fullHold.phase === "hold" && fullHold.slots[0].weight === 1,
  "Full focus did not settle after 2.35 seconds.",
);
assert(
  sampleAgentGalaxyFocusController(fullController, 20).phase === "hold",
  "Full focus must persist until explicit release.",
);
releaseAgentGalaxyFocus(fullController, 20);
assert(
  sampleAgentGalaxyFocusController(fullController, 20).slots[0].weight === 1,
  "Release must begin at the current focus weight.",
);
assert(
  sampleAgentGalaxyFocusController(fullController, 21.401).phase === "idle",
  "Full focus did not finish its 1.4 second release.",
);

const signalController = createAgentGalaxyFocusController();
commandAgentGalaxyFocus(signalController, visibleTarget, "signal", 0);
assert(
  sampleAgentGalaxyFocusController(signalController, 0.6).phase === "hold",
  "Signal did not finish its 0.6 second capture.",
);
assert(
  sampleAgentGalaxyFocusController(signalController, 3.2).phase === "idle",
  "Signal did not finish its automatic hold and release cycle.",
);

const retargetController = createAgentGalaxyFocusController();
commandAgentGalaxyFocus(retargetController, visibleTarget, "full-focus", 0);
sampleAgentGalaxyFocusController(retargetController, 2.2);
commandAgentGalaxyFocus(retargetController, promotedTarget, "full-focus", 3);
const retargetStart = sampleAgentGalaxyFocusController(retargetController, 3);
const retargetMiddle = sampleAgentGalaxyFocusController(retargetController, 3.8);
const retargetEnd = sampleAgentGalaxyFocusController(retargetController, 4.601);
assert(
  retargetStart.phase === "retarget"
    && retargetStart.slots.length === 2
    && retargetStart.slots[0].weight === 1
    && retargetStart.slots[1].weight === 0,
  "Retarget must start from the current target without a reset.",
);
assert(
  retargetMiddle.slots.length === 2
    && retargetMiddle.slots[0].weight > 0
    && retargetMiddle.slots[1].weight > 0,
  "Retarget must crossfade the outgoing and incoming resident vertices.",
);
assert(
  retargetEnd.phase === "hold"
    && retargetEnd.slots.length === 1
    && retargetEnd.slots[0].target.entityId === promotedTarget.entityId,
  "Retarget did not settle on the incoming resident vertex.",
);

const retargetReleaseController = createAgentGalaxyFocusController();
commandAgentGalaxyFocus(retargetReleaseController, visibleTarget, "full-focus", 0);
sampleAgentGalaxyFocusController(retargetReleaseController, 2.2);
commandAgentGalaxyFocus(
  retargetReleaseController,
  promotedTarget,
  "full-focus",
  3,
);
const retargetBeforeRelease = sampleAgentGalaxyFocusController(
  retargetReleaseController,
  3.7,
);
releaseAgentGalaxyFocus(retargetReleaseController, 3.7);
const retargetReleaseStart = sampleAgentGalaxyFocusController(
  retargetReleaseController,
  3.7,
);
const retargetReleaseMiddle = sampleAgentGalaxyFocusController(
  retargetReleaseController,
  4.4,
);
assert(
  retargetBeforeRelease.slots.length === 2
    && retargetReleaseStart.slots.length === 2
    && retargetReleaseStart.slots.every((slot) => (
      Math.abs(
        slot.weight
        - retargetBeforeRelease.slots.find(
          (before) => before.target.entityId === slot.target.entityId,
        ).weight
      ) < 1e-12
    )),
  "Release during retarget must preserve both current vertex weights.",
);
assert(
  retargetReleaseMiddle.slots.length === 2
    && retargetReleaseMiddle.slots.every((slot) => (
      slot.weight < retargetReleaseStart.slots.find(
        (before) => before.target.entityId === slot.target.entityId,
      ).weight
    )),
  "Release during retarget must continuously fade both resident vertices.",
);

let previousProgress = 0;
let maximumProgressStep = 0;
let maximumLumaStepRatio = 0;
for (
  let frame = 1;
  frame <= Math.ceil(AGENT_GALAXY_FOCUS_PROFILES["full-focus"].captureSeconds * 60);
  frame += 1
) {
  const progress = agentGalaxyFocusSmootherstep(
    frame / (
      AGENT_GALAXY_FOCUS_PROFILES["full-focus"].captureSeconds * 60
    ),
  );
  assert(progress >= previousProgress, "Focus smootherstep is not monotonic.");
  maximumProgressStep = Math.max(maximumProgressStep, progress - previousProgress);
  maximumLumaStepRatio = Math.max(
    maximumLumaStepRatio,
    (progress - previousProgress)
      * (AGENT_GALAXY_FOCUS_PROFILES["full-focus"].lumaMultiplier - 1),
  );
  previousProgress = progress;
}
assert(
  maximumProgressStep <= 0.05,
  `One-frame focus energy step exceeds 5%: ${maximumProgressStep}`,
);
assert(
  maximumLumaStepRatio
    <= AGENT_GALAXY_FOCUS_PROFILES["full-focus"].lumaMultiplier * 0.05,
  `One-frame focus luma step exceeds 5%: ${maximumLumaStepRatio}`,
);
assert(
  AGENT_GALAXY_FOCUS_PROFILES.signal.targetCssPixels === 4.2
    && AGENT_GALAXY_FOCUS_PROFILES["soft-focus"].targetCssPixels === 6.2
    && AGENT_GALAXY_FOCUS_PROFILES["full-focus"].targetCssPixels === 8.5,
  "Focus photosphere target sizes left the approved LOD levels.",
);
assert(
  estimateAgentGalaxyFocusCloudDiameterRatio(fullHold.slots) >= 0.96,
  "Full focus cloud diameter ratio left the accepted range.",
);
assert(
  JSON.stringify(selectAgentGalaxyFocusAnchor(-0.3, 1440)) === "[-0.52,0.14]"
    && JSON.stringify(selectAgentGalaxyFocusAnchor(0.3, 1440)) === "[0.52,0.14]"
    && JSON.stringify(selectAgentGalaxyFocusAnchor(0.3, 600)) === "[0,0.56]",
  "Adaptive focus anchor selection changed.",
);

const signalVisual = sampleAgentGalaxyFocusController(
  signalController,
  0,
);
assert(
  signalVisual.slots.length === 0,
  "Completed signal must not leave a stale focus slot.",
);

const softController = createAgentGalaxyFocusController();
commandAgentGalaxyFocus(softController, visibleTarget, "soft-focus", 0);
const softBeforeField = sampleAgentGalaxyFocusController(softController, 0.34);
const softBeforeCamera = sampleAgentGalaxyFocusController(softController, 0.74);
const softMovingCamera = sampleAgentGalaxyFocusController(softController, 1.05);
assert(
  softBeforeField.slots[0].visual.fieldBlend === 0
    && softBeforeField.slots[0].visual.cameraBlend === 0,
  "Soft focus field or camera started before the capture slice.",
);
assert(
  softBeforeCamera.slots[0].visual.acquisitionBlend > 0
    && softBeforeCamera.slots[0].visual.materialBlend > 0
    && softBeforeCamera.slots[0].visual.cameraBlend === 0,
  "Soft focus target must become visible before camera movement.",
);
assert(
  softMovingCamera.slots[0].visual.fieldBlend > 0
    && softMovingCamera.slots[0].visual.cameraBlend > 0,
  "Soft focus did not enter its staged field/camera interval.",
);

const releaseOrderController = createAgentGalaxyFocusController();
commandAgentGalaxyFocus(
  releaseOrderController,
  visibleTarget,
  "full-focus",
  0,
);
sampleAgentGalaxyFocusController(releaseOrderController, 2.36);
releaseAgentGalaxyFocus(releaseOrderController, 3);
const releaseEarly = sampleAgentGalaxyFocusController(
  releaseOrderController,
  3.28,
).slots[0].visual;
assert(
  releaseEarly.cameraBlend < releaseEarly.materialBlend
    && releaseEarly.cameraBlend < releaseEarly.acquisitionBlend,
  "Release must return the camera before losing the target photosphere.",
);

let maximumFocusFieldDisplacement = 0;
let focusFieldNonRadialSamples = 0;
for (let index = 0; index < 256; index += 1) {
  const relative = [
    Math.sin(index * 1.37) * (1.5 + (index % 7)),
    Math.cos(index * 0.83) * (0.8 + (index % 5)),
    Math.sin(index * 0.47 + 0.6) * (1.2 + (index % 6)),
  ];
  const tangent = [
    Math.cos(index * 0.31),
    Math.sin(index * 0.53),
    Math.cos(index * 0.71),
  ];
  const radius = 5 + (index % 8);
  const sample = sampleAgentGalaxyFocusFieldOffset(
    relative,
    tangent,
    radius,
    1,
    (index * 0.61803398875) % 1,
  );
  const length = Math.hypot(...sample.offset);
  maximumFocusFieldDisplacement = Math.max(
    maximumFocusFieldDisplacement,
    length,
  );
  const relativeLength = Math.hypot(...relative);
  if (length > 1e-7 && relativeLength > 1e-7) {
    const radialProjection = Math.abs(
      sample.offset.reduce(
        (sum, value, axis) => sum + value * relative[axis],
        0,
      ) / (length * relativeLength),
    );
    if (radialProjection < 0.95) focusFieldNonRadialSamples += 1;
  }
}
assert(
  maximumFocusFieldDisplacement <= AGENT_GALAXY_FOCUS_FIELD_MAX_WORLD_UNITS,
  "FocusField exceeds its maximum world displacement.",
);
assert(
  focusFieldNonRadialSamples >= 64,
  "FocusField degraded into a radial collapse.",
);
assert(
  sampleAgentGalaxyFocusFieldOffset(
    [0, 0, 0],
    [0, 1, 0],
    8,
    1,
    0.5,
  ).offset.every((value) => value === 0),
  "FocusField must not displace the target paper itself.",
);
assert(
  agentGalaxyFocusFieldMaximumDisplacement(12)
    === AGENT_GALAXY_FOCUS_FIELD_MAX_WORLD_UNITS,
  "FocusField maximum displacement contract changed.",
);

assert(
  agentGalaxyPhotosphereMix(2.1) === 0
    && agentGalaxyPhotosphereMix(4.6) === 1,
  "Photosphere LOD transition left the 2.2-4.5px range.",
);
assert(
  AGENT_GALAXY_PHOTOSPHERE_STYLES.paper.lodStartPx === 2.2
    && AGENT_GALAXY_PHOTOSPHERE_STYLES.hotspot.coronaStrength
      > AGENT_GALAXY_PHOTOSPHERE_STYLES.paper.coronaStrength,
  "Paper/hotspot photosphere hierarchy changed.",
);
const paperTint = createAgentGalaxyPaperTint("#4f8fb8");
const hotspotTint = createAgentGalaxyHotspotTint("#4f8fb8");
const focusTint = createAgentGalaxyFocusTint("#4f8fb8");
assert(
  hotspotTint.some((value, axis) => Math.abs(value - paperTint[axis]) > 1e-3)
    && focusTint.every((value) => value >= 0 && value <= 1),
  "Semantic photosphere tint hierarchy is not deterministic.",
);

const sourceChecks = {
  baseFlowCapabilityRemainsTruthful: flow.includes("dynamicFocus: false"),
  allResidentVerticesRetained: canvas.includes("const ordered = [...identities].sort")
    && canvas.includes("paperResult.geometry.setDrawRange(0, paperResult.count)"),
  perVertexVisibility: canvas.includes('setAttribute("aStableOrder"')
    && canvas.includes("uVisiblePaperBudget")
    && canvas.includes("vVertexVisibility < 0.0001"),
  stableVertexIdentity: canvas.includes('setAttribute("aEntityIndex"')
    && canvas.includes("paperById: Map<string, PaperVertexMetadata>"),
  noReplacementLayer: !canvas.includes("new THREE.Points(focus")
    && !canvas.includes("DynamicFocusLayer"),
  sameGeometryFocus: canvas.includes("uFocusATargetVertexIndex")
    && canvas.includes("uFocusBTargetVertexIndex"),
  localPhaseLock: canvas.includes("semanticRelative")
    && canvas.includes("liveRelative")
    && canvas.includes("uFocusAPhaseLock"),
  stagedFocusTimeline: canvas.includes("uFocusAAcquisitionBlend")
    && canvas.includes("uFocusAFieldBlend")
    && canvas.includes("uFocusAMaterialBlend")
    && canvas.includes("slot.visual.cameraBlend"),
  absoluteTargetPhotosphereSize: canvas.includes(
    "uFocusATargetCssPixels",
  )
    && canvas.includes(
      "mix(baseCssPointSize, targetCssPixels, targetCssBlend)",
    ),
  focusFieldCpuGlslShared: canvas.includes(
    "AGENT_GALAXY_FOCUS_FIELD_GLSL_CHUNK",
  )
    && focusField.includes("sampleAgentGalaxyFocusFieldOffset")
    && focusField.includes("agentGalaxyFocusFieldOffset("),
  cameraWithoutFovZoom: canvas.includes("AGENT_GALAXY_FOCUS_DISTANCE")
    && !canvas.includes("camera.fov =")
    && canvas.includes("createAnchoredCameraQuaternion"),
  focusIntentDoesNotRebuildRenderer:
    canvas.includes("focusIntentRevisionRef.current += 1")
    && /\}, \[config, payload, reducedMotion\]\);/.test(canvas),
  opacityRemainsIndependent: !/uFocus[A-B][A-Za-z]*Opacity/.test(canvas)
    && canvas.includes("vLuma = aLuma;")
    && canvas.includes("vFocusLuma = targetLumaMultiplier;")
    && canvas.includes("targetSizeMultiplier"),
  pureBlackReviewBackground: canvas.includes("setClearColor(0x000000, 1)")
    && reviewCss.includes("--flow-bg: #000000"),
  crispSemanticCoverage: photosphere.includes("fwidth(radius)")
    && photosphere.includes(
      "sqrt(max(0.0, 1.0 - radiusSquared))",
    )
    && !photosphere.includes("motionBlur"),
  sharedGeometryPhotosphere: canvas.includes(
    "new THREE.Points(\n      paperResult.geometry,\n      paperSurfaceMaterial",
  )
    && canvas.includes(
      "new THREE.Points(\n      hotspotResult.geometry,\n      hotspotSurfaceMaterial",
    )
    && canvas.includes('semanticPass: "core"')
    && canvas.includes('semanticPass: "surface"'),
  photosphereDepthContract: canvas.includes(
    'options.semanticPass !== "surface"',
  )
    && canvas.includes("depthWrite: Boolean("),
  perVertexSemanticTint: canvas.includes('"aSemanticTint"')
    && canvas.includes("createAgentGalaxyPaperTint")
    && canvas.includes("createAgentGalaxyHotspotTint")
    && canvas.includes("createAgentGalaxyFocusTint")
    && photosphere.includes("surfaceChromaScale"),
  lowSaturationSemanticMaterial:
    photosphere.includes("createAgentGalaxyPaperTint")
    && photosphere.includes("createAgentGalaxyHotspotTint")
    && photosphere.includes("createAgentGalaxyFocusTint")
    && photosphere.includes("0.045, 0.08")
    && photosphere.includes("0.16, 0.22")
    && canvas.includes("uFocusAColorBlend")
    && canvas.includes("uFocusATint"),
  boundedNeighborhoodContrast: canvas.includes("uFocusANeighborDim")
    && canvas.includes("neighborhoodContrast")
    && canvas.includes("0.0,\n          0.22"),
  reviewAutoActivatesDefaultFocus:
    review.includes("config.focusPaper ?? VISIBLE_RESIDENT_PAPER_ID")
    && review.includes("focusSnapshot?.phase !== \"idle\""),
  focusProjectionUsesFreshCameraMatrix:
    canvas.includes("camera.updateMatrixWorld(true);")
    && canvas.includes("const projected = projectToViewport"),
  noForbiddenFocusDecoration: !/crosshair|focusRing|neon|bloompass/i.test(canvas),
  reviewParameters: [
    "focusPaper",
    "focusMode",
    "focusDelay",
    "starMaterial",
    "focusField",
    "focusCamera",
  ]
    .every((parameter) => reviewConfig.includes(`"${parameter}"`)),
  reviewCommands: ["常驻可见", "预算外常驻", "回答结束", "释放聚焦"]
    .every((label) => review.includes(label)),
  answerEndOnlyReleasesSoftFocus:
    review.includes('focusIntent?.mode !== "soft-focus"'),
  reviewDiagnostics: review.includes("focusSnapshot")
    && review.includes("focusIntent")
    && review.includes("onFocusSnapshot")
    && review.includes("focusFieldGpuParity"),
};
for (const [name, pass] of Object.entries(sourceChecks)) {
  assert(pass, `Agent galaxy focus source check failed: ${name}`);
}

console.log(JSON.stringify({
  pass: true,
  phase: "m1.3b-1-photosphere-perceptible-focus",
  residentPapers: {
    count: ordered.length,
    uniqueIds: indexById.size,
    balancedBudget: 1920,
    highBudget: 2560,
  },
  fixtures: {
    visible: {
      id: visibleFixture.id,
      vertexIndex: visibleFixtureIndex,
      balancedVisible: true,
    },
    promoted: {
      id: promotedFixture.id,
      vertexIndex: promotedFixtureIndex,
      balancedVisible: false,
      highVisible: true,
    },
  },
  timing: {
    profiles: AGENT_GALAXY_FOCUS_PROFILES,
    maximumProgressStepAt60Fps: maximumProgressStep,
    maximumLumaStepRatioAt60Fps: maximumLumaStepRatio,
  },
  cloudDiameterRatio: estimateAgentGalaxyFocusCloudDiameterRatio(fullHold.slots),
  focusField: {
    maximumWorldDisplacement: maximumFocusFieldDisplacement,
    nonRadialSamples: focusFieldNonRadialSamples,
    cpuGpuParity: "BROWSER_RUNTIME",
  },
  photosphere: {
    paper: AGENT_GALAXY_PHOTOSPHERE_STYLES.paper,
    hotspot: AGENT_GALAXY_PHOTOSPHERE_STYLES.hotspot,
    paperTint,
    hotspotTint,
    focusTint,
  },
  sourceChecks,
  browserVisualAcceptance: "UNVERIFIED",
  tauriAcceptance: "OUT_OF_SCOPE",
}, null, 2));
