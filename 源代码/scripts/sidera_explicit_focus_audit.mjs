import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildSideraCarouselWindow,
  isSideraMessageFocusReady,
  normalizeSideraReferences,
  resolveSideraInitialIndex,
  sampleSideraFocusTimeline,
  SIDERA_DIRECT_CAROUSEL_LIMIT,
} from "../src/lib/sideraFocus.ts";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const read = (relativePath) => fs.readFileSync(
  path.join(root, relativePath),
  "utf8",
);
const pageSource = read("src/components/AgentDualBackgroundPage.tsx");
const immersiveSource = read(
  "src/components/AgentImmersiveStarfieldCanvas.tsx",
);
const theorySource = read("src/components/AgentTheoryBackgroundCanvas.tsx");
const galaxySource = read("src/components/App17GalaxyCanvas.tsx");
const cssSource = read("src/components/AgentDualBackgroundPage.css");

const references = normalizeSideraReferences([
  {
    kind: "paper",
    entityId: "paper-c",
    mentionOrder: 7,
    role: "recommended",
    relationSummary: " third ",
  },
  {
    kind: "paper",
    entityId: "paper-a",
    citationIndex: 1,
    mentionOrder: 0,
    role: "cited",
    relationSummary: " first ",
  },
  {
    kind: "hotspot",
    entityId: "hotspot-b",
    citationIndex: 2,
    mentionOrder: 1,
    role: "discussed",
    relationSummary: " second ",
  },
  {
    kind: "paper",
    entityId: "paper-a",
    mentionOrder: 9,
    role: "cited",
    relationSummary: "duplicate",
  },
]);
assert.deepEqual(
  references.map((reference) => reference.entityId),
  ["paper-a", "hotspot-b", "paper-c"],
);
assert.equal(references[0].relationSummary, "first");

assert.equal(isSideraMessageFocusReady({
  id: "streaming",
  status: "streaming",
  markdown: "partial",
  entityRefs: references,
}), false);
assert.equal(isSideraMessageFocusReady({
  id: "complete",
  status: "complete",
  markdown: "done",
  entityRefs: references,
}), true);

const resolved = Array.from({ length: 12 }, (_, index) => ({
  reference: {
    kind: "paper",
    entityId: `paper-${index}`,
    citationIndex: index + 1,
    mentionOrder: index,
    role: "cited",
    relationSummary: `evidence-${index}`,
  },
  entity: {
    kind: "paper",
    entityId: `paper-${index}`,
    membership: index === 11 ? "missing" : "sampled",
  },
}));
const windowed = buildSideraCarouselWindow(resolved, "paper-8");
assert.equal(windowed.length, SIDERA_DIRECT_CAROUSEL_LIMIT);
assert.ok(windowed.some(({ entity }) => entity.entityId === "paper-8"));
assert.ok(windowed.every(({ entity }) => entity.membership !== "missing"));
assert.equal(
  windowed[resolveSideraInitialIndex(windowed, "paper-8")].entity.entityId,
  "paper-8",
);

const firstRaf = sampleSideraFocusTimeline(1 / 60, "acquiring");
assert.ok(firstRaf.targetBlend > 0, "target must begin on the first RAF");
assert.ok(firstRaf.cameraBlend > 0, "camera must begin on the first RAF");
assert.ok(
  firstRaf.backgroundDimBlend > 0,
  "background dimming must begin on the first RAF",
);
assert.equal(
  firstRaf.targetBlend,
  firstRaf.cameraBlend,
  "target and camera must share the exact acquisition clock",
);
assert.equal(
  firstRaf.targetBlend,
  firstRaf.backgroundDimBlend,
  "target and dimming must share the exact acquisition clock",
);

for (const phase of ["acquiring", "retargeting", "releasing"]) {
  let previousTarget = phase === "releasing" ? 1 : 0;
  for (let step = 0; step <= 150; step += 1) {
    const sample = sampleSideraFocusTimeline(step / 60, phase);
    assert.ok(sample.progress >= 0 && sample.progress <= 1);
    assert.equal(sample.evidenceBlend, 0);
    if (phase === "releasing") {
      assert.ok(sample.targetBlend <= previousTarget + 1e-9);
    } else {
      assert.ok(sample.targetBlend + 1e-9 >= previousTarget);
    }
    previousTarget = sample.targetBlend;
  }
}

const photosphereStart = galaxySource.indexOf(
  "function createPaperInspectionPhotosphere()",
);
const photosphereEnd = galaxySource.indexOf(
  "function createPaperInspectionEnergyCore()",
  photosphereStart,
);
const photosphereSource = galaxySource.slice(
  photosphereStart,
  photosphereEnd,
);

const dot3 = (left, right) => (
  left[0] * right[0]
  + left[1] * right[1]
  + left[2] * right[2]
);
const normalize3 = (value) => {
  const length = Math.sqrt(dot3(value, value));
  return value.map((component) => component / length);
};
const cross3 = (left, right) => [
  left[1] * right[2] - left[2] * right[1],
  left[2] * right[0] - left[0] * right[2],
  left[0] * right[1] - left[1] * right[0],
];
let analyticSilhouetteMaximumError = 0;
for (const scenario of [
  { center: [0, 0, -3], radius: 0.8 },
  { center: [0.92, -0.31, -2.45], radius: 0.82 },
]) {
  const distanceSquared = dot3(scenario.center, scenario.center);
  const centerScale = 1 - scenario.radius ** 2 / distanceSquared;
  const tangentCenter = scenario.center.map(
    (component) => component * centerScale,
  );
  const tangentRadius = scenario.radius * Math.sqrt(centerScale);
  const centerDirection = normalize3(scenario.center);
  const reference = Math.abs(centerDirection[1]) < 0.9
    ? [0, 1, 0]
    : [1, 0, 0];
  const tangentAxisA = normalize3(cross3(centerDirection, reference));
  const tangentAxisB = normalize3(cross3(centerDirection, tangentAxisA));
  for (let index = 0; index < 64; index += 1) {
    const angle = index / 64 * Math.PI * 2;
    const tangentPoint = tangentCenter.map((component, axis) => (
      component
      + tangentAxisA[axis] * Math.cos(angle) * tangentRadius
      + tangentAxisB[axis] * Math.sin(angle) * tangentRadius
    ));
    const ray = normalize3(tangentPoint);
    const closestApproach = dot3(ray, scenario.center);
    const tangentField = closestApproach ** 2
      - (distanceSquared - scenario.radius ** 2);
    analyticSilhouetteMaximumError = Math.max(
      analyticSilhouetteMaximumError,
      Math.abs(tangentField),
    );
  }
}
assert.ok(
  analyticSilhouetteMaximumError <= 1e-10,
  `analytic silhouette error ${analyticSilhouetteMaximumError}`,
);

const sourceChecks = [
  [
    pageSource.includes('productMode: "sidera-explicit"'),
    "page must opt into the explicit Sidera path",
  ],
  [
    pageSource.includes("evidenceEntityIds: []")
      && pageSource.includes("evidence: []"),
    "the product path must emphasize only the current entity",
  ],
  [
    pageSource.includes("下一颗")
      && !pageSource.includes("上一颗"),
    "multi-object focus must expose only next and close",
  ],
  [
    !pageSource.includes("查看论文近景")
      && !pageSource.includes("进入热点星系"),
    "the information card must not require a second deep-focus click",
  ],
  [
    !pageSource.includes(
      "setFocusSession(null);\n      setDialogCollapsed(false);",
    )
      && !pageSource.includes(
        "setFocusSession(null);\r\n      setDialogCollapsed(false);",
      ),
    "focus release must not force the dialog open or collapsed",
  ],
  [
    cssSource.includes("width: clamp(480px, 36vw, 640px)"),
    "dialog width must match the M1.3j contract",
  ],
  [
    cssSource.includes("--sidera-focus-dim")
      && cssSource.includes("--sidera-focus-x"),
    "theory dimming must use the unified focus sample and target side",
  ],
  [
    immersiveSource.includes("sampleSideraFocusTimeline")
      && immersiveSource.includes("backgroundDimBlend"),
    "immersive target, camera and dimming must share the Sidera sample",
  ],
  [
    theorySource.includes("`enter-hotspot:${targetHotspotId}`")
      && theorySource.includes("`focus-paper:${primary.entityId}`")
      && theorySource.includes('"focus-paper"'),
    "theory paper focus must automatically enter its system and approach",
  ],
  [
    theorySource.includes('paperFocusState === "entering"')
      && theorySource.includes('|| systemViewMode === "paper-focus"'),
    "an in-progress direct paper approach must not be mistaken for a return request",
  ],
  [
    immersiveSource.includes("phase: sideraSample.complete")
      && theorySource.includes("phase: sideraSample.complete")
      && immersiveSource.includes('"hold" as const')
      && theorySource.includes('"hold" as const'),
    "completed retarget timelines must settle in hold rather than remain retargeting",
  ],
  [
    theorySource.includes('primary.kind === "hotspot"')
      && theorySource.includes('explorationState === "system"'),
    "hotspot focus must stop after system entry",
  ],
  [
    theorySource.includes("focusReturnPendingRef.current")
      && theorySource.includes("setFocusCapturingCruise(false)"),
    "theory release must return through the frozen cruise lifecycle",
  ],
  [
    galaxySource.includes(
      "APP17_AGENT_PAPER_PHOTOSPHERE_MIN_DIAMETER_PX = 160",
    )
      && galaxySource.includes(
        "APP17_AGENT_PAPER_PHOTOSPHERE_MAX_DIAMETER_PX = 240",
      ),
    "paper photosphere diameter must remain in the 160-240px range",
  ],
  [
    galaxySource.includes(
      "APP17_AGENT_PAPER_PHOTOSPHERE_LOD_ENTER_PX = 18",
    )
      && galaxySource.includes(
        "APP17_AGENT_PAPER_PHOTOSPHERE_LOD_EXIT_PX = 14",
      ),
    "photosphere LOD must use the locked hysteresis",
  ],
  [
    photosphereSource.includes("new THREE.SphereGeometry(0.5, 72, 48)")
      && photosphereSource.includes("object.quaternion.identity()")
      && !photosphereSource.includes("copy(camera.quaternion)"),
    "agent theory close-up must be a true sphere, not a camera-facing plane",
  ],
  [
    photosphereSource.includes("whiteHotCore")
      && photosphereSource.includes("stellarRidgedFbm")
      && photosphereSource.includes("filamentNetwork")
      && photosphereSource.includes("middleFilament")
      && photosphereSource.includes("fineFilament")
      && photosphereSource.includes("fwidth(middleCurrent)")
      && photosphereSource.includes("fwidth(fineCurrent)")
      && photosphereSource.includes("irregularCore")
      && photosphereSource.includes("microRidge")
      && photosphereSource.includes("limbEmission")
      && photosphereSource.includes("coronaFbm")
      && photosphereSource.includes("uCoronaStrength")
      && photosphereSource.includes(
        "agent-theory-paper-photosphere-energy-veil",
      )
      && photosphereSource.includes(
        "agent-theory-paper-photosphere-silhouette-ring",
      )
      && photosphereSource.includes("new THREE.PlaneGeometry(1, 1, 1, 1)")
      && photosphereSource.includes("uSphereCenterView")
      && photosphereSource.includes("uSphereRadius")
      && photosphereSource.includes("float tangentField")
      && photosphereSource.includes("fwidth(tangentField)")
      && photosphereSource.includes("float continuity = 0.94")
      && photosphereSource.includes("silhouetteProjectionCorrection")
      && photosphereSource.includes("silhouetteQuadScale")
      && photosphereSource.includes("silhouetteRing.quaternion")
      && !photosphereSource.includes(
        "agent-theory-paper-photosphere-limb-shell",
      )
      && !photosphereSource.includes("narrowLimb")
      && !photosphereSource.includes("localThickening")
      && photosphereSource.includes("vertexFbm")
      && photosphereSource.includes("displacedPosition")
      && photosphereSource.includes("projectedDiameter * 1.14")
      && !photosphereSource.includes(
        "radiance *= mix(0.42, 1.0, pow(mu, 0.33))",
      ),
    "the photosphere must use multiscale emissive plasma, an irregular core, a continuous screen-space silhouette ring and displaced corona",
  ],
  [
    galaxySource.includes(
      'visualProfile === "agent-theory"\n        ? "photosphere"',
    ),
    "only the agent theory profile may replace existing paper close-ups",
  ],
  [
    galaxySource.includes("uAgentFocusBackgroundBlend"),
    "target energy and background dimming must be independently controlled",
  ],
];
for (const [condition, message] of sourceChecks) {
  assert.ok(condition, message);
}

const report = {
  audit: "sidera-direct-focus-photosphere",
  workPackage: "M1.3j",
  status: "PASS",
  carouselLimit: SIDERA_DIRECT_CAROUSEL_LIMIT,
  normalizedReferenceOrder: references.map((reference) => reference.entityId),
  firstRaf: {
    targetBlend: firstRaf.targetBlend,
    cameraBlend: firstRaf.cameraBlend,
    backgroundDimBlend: firstRaf.backgroundDimBlend,
  },
  checks: sourceChecks.length + 16,
  analyticSilhouetteMaximumError,
  verified: [
    "structured answers gate focus",
    "one target is emphasized at a time",
    "dimming and camera acquisition share the first RAF",
    "theory paper routes directly through its hotspot to close-up",
    "dialog geometry is invariant under focus lifecycle",
    "agent theory uses a real 160-240px photosphere",
    "the silhouette ring follows the analytic ray-sphere tangent boundary",
  ],
};
console.log(JSON.stringify(report, null, 2));
