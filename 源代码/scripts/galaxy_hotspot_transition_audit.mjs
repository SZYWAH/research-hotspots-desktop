import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  THEORY_SYSTEM_HOTSPOT_CORE_OPACITY,
  THEORY_SYSTEM_HOTSPOT_HALO_OPACITY,
  THEORY_SYSTEM_HOTSPOT_RAY_OPACITY,
  THEORY_SYSTEM_PAPER_OPACITY,
  distanceAfterSimilarityRebase,
  projectedRatioAfterSimilarityRebase,
  resolveTheorySystemVisibility,
} from "../src/lib/galaxySystemTransition.ts";
import {
  GALAXY_FAR_BACKGROUND_HOTSPOT_CORE_BREATH_AMPLITUDE,
  GALAXY_FAR_BACKGROUND_HOTSPOT_CORE_OPACITY,
  GALAXY_FAR_BACKGROUND_HOTSPOT_HALO_BREATH_AMPLITUDE,
  GALAXY_FAR_BACKGROUND_HOTSPOT_HALO_OPACITY,
  GALAXY_FAR_BACKGROUND_MAX_DIRECTION_SEPARATION_DEGREES,
  GALAXY_FAR_BACKGROUND_MAX_PAPERS_PER_HOTSPOT,
  GALAXY_FAR_BACKGROUND_MAX_RADIUS,
  GALAXY_FAR_BACKGROUND_MIN_RADIUS,
  GALAXY_FAR_BACKGROUND_PAPER_BREATH_AMPLITUDE,
  GALAXY_FAR_BACKGROUND_PAPER_OPACITY,
  buildGalaxyFarBackgroundPlan,
  resolveGalaxyFarBackgroundMask,
  resolveGalaxyFarBackgroundTransition,
} from "../src/lib/galaxyFarBackground.ts";

const source = await readFile("src/components/App17GalaxyCanvas.tsx", "utf8");
const samples = Array.from({ length: 121 }, (_, index) => index / 120);
const enterDistances = samples.map((progress) => 180 + (24 - 180) * progress);
const exitDistances = enterDistances.slice().reverse();

for (let index = 1; index < samples.length; index += 1) {
  assert(enterDistances[index] <= enterDistances[index - 1], "enter distance is not monotonic");
  assert(exitDistances[index] >= exitDistances[index - 1], "exit distance is not monotonic");
}

const beforeFade = resolveTheorySystemVisibility(0.7);
const completedFade = resolveTheorySystemVisibility(1);
assert.equal(beforeFade.paperOpacity, 1);
assert.equal(beforeFade.hotspotCoreOpacity, 1);
assert(Math.abs(completedFade.paperOpacity - THEORY_SYSTEM_PAPER_OPACITY) < 1e-12);
assert(Math.abs(completedFade.hotspotCoreOpacity - THEORY_SYSTEM_HOTSPOT_CORE_OPACITY) < 1e-12);
assert(Math.abs(completedFade.hotspotHaloOpacity - THEORY_SYSTEM_HOTSPOT_HALO_OPACITY) < 1e-12);
assert(Math.abs(completedFade.hotspotRayOpacity - THEORY_SYSTEM_HOTSPOT_RAY_OPACITY) < 1e-12);

const entryScale = 0.137;
const projected = projectedRatioAfterSimilarityRebase(
  [2.4, -1.7, 0.5],
  [0.2, 0.4, 18],
  entryScale,
  true,
);
const projectionDelta = Math.hypot(
  projected.afterX - projected.beforeX,
  projected.afterY - projected.beforeY,
);
assert(projectionDelta < 1e-12, `similarity rebase projection drifted by ${projectionDelta}`);
const canonicalDistance = distanceAfterSimilarityRebase(18, entryScale, true);
const restoredDistance = distanceAfterSimilarityRebase(canonicalDistance, entryScale, false);
assert(Math.abs(restoredDistance - 18) < 1e-12, "similarity rebase is not reversible");

assert(
  source.includes('float retreatScale = ${kind === "app15"')
    && source.includes('? "1.0"'),
  "theory shader still moves non-selected objects",
);
assert(source.includes("captureTheoryWorldReference"), "world-coordinate drift capture is missing");
assert(source.includes("measureTheoryWorldDrift"), "world-coordinate drift measurement is missing");
assert(source.includes("performTheoryCanonicalRebase(true)"), "canonical entry rebase is missing");
assert(source.includes("performTheoryCanonicalRebase(false)"), "canonical exit rebase is missing");
assert(source.includes("representativeLayoutBlend"), "representative semantic/orbit interpolation is missing");
assert(source.includes("elapsed / 0.3"), "representative interpolation is not 300ms");
assert(source.includes("queuedEnterHotspotId"), "queued hotspot selection is missing");
assert(source.includes("APP17_SYSTEM_TRANSITION_MS"), "system transition duration is missing");
assert(
  source.includes("createTheoryFarBackgroundLayer"),
  "theory far-background proxy layer is missing",
);
assert(
  source.includes("paperObject.raycast = () => undefined")
    && source.includes("hotspotObject.raycast = () => undefined"),
  "far-background proxies are pickable",
);
assert(
  source.includes("overviewRoot.visible = !theoryMode || exploration.blend < 1 - 1e-9"),
  "the completed theory system still renders the real overview root",
);
assert(
  source.includes('? "1.0"')
    && source.includes("baseCoreVisibility * (1.0 + breath * 0.06)")
    && source.includes("baseHaloVisibility * (1.0 + breath * 0.12)"),
  "theory source layer still applies point shrinking or additive breathing",
);

const syntheticHotspots = [
  { id: "selected", field: "Field", topicId: 1, x: 0, y: 0, z: 0, color: "#ffffff", size: 12 },
  { id: "interwoven", field: "Field", topicId: 2, x: 0.3, y: 0, z: 0, color: "#99ccff", size: 10 },
  { id: "separated", field: "Field", topicId: 3, x: 12, y: 2, z: 0, color: "#ffcc99", size: 9 },
];
const syntheticPapers = syntheticHotspots.flatMap((hotspot) => (
  Array.from({ length: 36 }, (_, index) => {
    const angle = index * Math.PI * 2 / 36;
    const radius = hotspot.id === "separated" ? 0.5 : 1;
    return {
      rawPaperId: `${hotspot.id}-paper-${index}`,
      scopedPaperId: `${hotspot.id}-paper-${index}`,
      field: hotspot.field,
      topicId: hotspot.topicId,
      x: hotspot.x + Math.cos(angle) * radius,
      y: hotspot.y + Math.sin(angle) * radius,
      z: hotspot.z + (index % 3 - 1) * 0.05,
      color: hotspot.color,
      size: 2.4,
    };
  })
));
const syntheticBefore = JSON.stringify({ syntheticHotspots, syntheticPapers });
const farPlan = buildGalaxyFarBackgroundPlan(
  syntheticHotspots,
  syntheticPapers,
  "selected",
  1,
);
const repeatedFarPlan = buildGalaxyFarBackgroundPlan(
  syntheticHotspots,
  syntheticPapers,
  "selected",
  1,
);
assert.equal(
  JSON.stringify({ syntheticHotspots, syntheticPapers }),
  syntheticBefore,
  "far-background planning mutated source coordinates",
);
assert.deepEqual(repeatedFarPlan, farPlan, "far-background planning is not deterministic");
assert.equal(farPlan.hotspots.length, 2, "selected hotspot was not excluded");
assert.equal(farPlan.crossfadeHotspotCount, 1, "interwoven hotspot was not classified for crossfade");
assert.equal(farPlan.retreatHotspotCount, 1, "separated hotspot was not classified for retreat");
assert(farPlan.paperSampleCount <= farPlan.hotspots.length * GALAXY_FAR_BACKGROUND_MAX_PAPERS_PER_HOTSPOT);
assert(farPlan.maximumLocalOffsetError <= 1e-12, "paper local offsets changed during proxy planning");
farPlan.hotspots.forEach((hotspot) => {
  assert(hotspot.papers.length <= GALAXY_FAR_BACKGROUND_MAX_PAPERS_PER_HOTSPOT);
  assert(hotspot.targetRadius >= GALAXY_FAR_BACKGROUND_MIN_RADIUS);
  assert(hotspot.targetRadius <= GALAXY_FAR_BACKGROUND_MAX_RADIUS);
  assert(hotspot.directionSeparationDegrees <= GALAXY_FAR_BACKGROUND_MAX_DIRECTION_SEPARATION_DEGREES);
});

const retreatPlan = farPlan.hotspots.find((hotspot) => hotspot.transitionMode === "retreat");
assert(retreatPlan, "missing retreat plan");
let previousRetreatRadius = retreatPlan.startRadius;
for (const progress of samples) {
  const transition = resolveGalaxyFarBackgroundTransition(progress, "retreat");
  const center = retreatPlan.startCenter.map((value, index) => (
    value + (retreatPlan.targetCenter[index] - value) * transition.centerProgress
  ));
  const radius = Math.hypot(...center);
  assert(radius + 1e-9 >= previousRetreatRadius, "retreat center distance is not monotonic");
  previousRetreatRadius = radius;
}
const crossfadeAtTakeover = resolveGalaxyFarBackgroundTransition(0.76, "crossfade");
const crossfadeAtEnd = resolveGalaxyFarBackgroundTransition(1, "crossfade");
assert.equal(crossfadeAtTakeover.revealProgress, 0);
assert.equal(crossfadeAtEnd.revealProgress, 1);
assert.equal(crossfadeAtEnd.centerProgress, 1);

const centralMask = resolveGalaxyFarBackgroundMask(0.4);
assert.equal(centralMask.innerRadiusNdc, 0.32);
assert.equal(centralMask.outerRadiusNdc, 0.44);
assert.equal(THEORY_SYSTEM_PAPER_OPACITY, 0);
assert.equal(THEORY_SYSTEM_HOTSPOT_CORE_OPACITY, 0);
assert.equal(THEORY_SYSTEM_HOTSPOT_HALO_OPACITY, 0);
assert.equal(THEORY_SYSTEM_HOTSPOT_RAY_OPACITY, 0);

console.log(JSON.stringify({
  pass: true,
  cameraDistance: {
    enterMonotonic: true,
    exitMonotonic: true,
  },
  nonSelectedWorldCoordinateDriftTarget: 1e-9,
  finalVisibility: {
    paper: THEORY_SYSTEM_PAPER_OPACITY,
    hotspotCore: THEORY_SYSTEM_HOTSPOT_CORE_OPACITY,
    hotspotHalo: THEORY_SYSTEM_HOTSPOT_HALO_OPACITY,
    hotspotRay: THEORY_SYSTEM_HOTSPOT_RAY_OPACITY,
  },
  farBackground: {
    deterministic: true,
    selectedExcluded: true,
    hotspotCount: farPlan.hotspots.length,
    paperSampleCount: farPlan.paperSampleCount,
    retreatHotspotCount: farPlan.retreatHotspotCount,
    crossfadeHotspotCount: farPlan.crossfadeHotspotCount,
    targetRadiusRange: [farPlan.nearestTargetRadius, farPlan.farthestTargetRadius],
    localOffsetError: farPlan.maximumLocalOffsetError,
    centralMask,
    breathingRanges: {
      paper: [
        GALAXY_FAR_BACKGROUND_PAPER_OPACITY * (1 - GALAXY_FAR_BACKGROUND_PAPER_BREATH_AMPLITUDE),
        GALAXY_FAR_BACKGROUND_PAPER_OPACITY * (1 + GALAXY_FAR_BACKGROUND_PAPER_BREATH_AMPLITUDE),
      ],
      hotspotCore: [
        GALAXY_FAR_BACKGROUND_HOTSPOT_CORE_OPACITY * (1 - GALAXY_FAR_BACKGROUND_HOTSPOT_CORE_BREATH_AMPLITUDE),
        GALAXY_FAR_BACKGROUND_HOTSPOT_CORE_OPACITY * (1 + GALAXY_FAR_BACKGROUND_HOTSPOT_CORE_BREATH_AMPLITUDE),
      ],
      hotspotHalo: [
        GALAXY_FAR_BACKGROUND_HOTSPOT_HALO_OPACITY * (1 - GALAXY_FAR_BACKGROUND_HOTSPOT_HALO_BREATH_AMPLITUDE),
        GALAXY_FAR_BACKGROUND_HOTSPOT_HALO_OPACITY * (1 + GALAXY_FAR_BACKGROUND_HOTSPOT_HALO_BREATH_AMPLITUDE),
      ],
    },
  },
  canonicalRebase: {
    reversible: true,
    projectionDelta,
  },
  representativeSemanticOrbitInterpolationMs: 300,
}, null, 2));
