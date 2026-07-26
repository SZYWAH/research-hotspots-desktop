import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  GALAXY_FAR_BACKGROUND_MAX_DIRECTION_SEPARATION_DEGREES,
  GALAXY_FAR_BACKGROUND_MAX_PAPERS_PER_HOTSPOT,
  GALAXY_FAR_BACKGROUND_MAX_RADIUS,
  GALAXY_FAR_BACKGROUND_MIN_RADIUS,
  buildGalaxyFarBackgroundPlan,
  resolveGalaxyFarBackgroundTransition,
} from "../src/lib/galaxyFarBackground.ts";

const args = process.argv.slice(2);
const payloadArgumentIndex = args.indexOf("--payload");
if (payloadArgumentIndex < 0 || !args[payloadArgumentIndex + 1]) {
  throw new Error("usage: pnpm audit:galaxy-far-background-payload -- --payload <payload.json>");
}
const payloadPath = resolve(args[payloadArgumentIndex + 1]);
const outputArgumentIndex = args.indexOf("--output");
const outputPath = outputArgumentIndex >= 0 && args[outputArgumentIndex + 1]
  ? resolve(args[outputArgumentIndex + 1])
  : undefined;
const payload = JSON.parse(await readFile(payloadPath, "utf8"));
assert.equal(payload.ready, true, "payload is not ready");
assert(payload.hotspots.length > 1, "payload has no background hotspots");
assert(payload.papers.length > 0, "payload has no papers");
assert.equal(payload.paperLayoutScaleMode, "shared", "payload is not using the shared coordinate scale");

const coordinateScale = 3.2 / Math.max(
  1e-12,
  (payload.paperLayoutLocalP95Radius ?? 10.5) * (payload.paperLayoutSharedScale ?? 1),
);
const requestedSelectors = [
  ["Computational Biology", 138],
  ["Computational Biology", 96],
  ["Artificial Intelligence", 78],
  ["Quantum Physics", 1],
];
const selectedHotspots = requestedSelectors.map(([field, topicId]) => {
  const hotspot = payload.hotspots.find((candidate) => (
    candidate.field === field && candidate.topicId === topicId
  ));
  assert(hotspot, `missing ${field} ${topicId}`);
  return hotspot;
});

const reports = [];
for (const selected of selectedHotspots) {
  const sourceCoordinateHashBefore = createHash("sha256")
    .update(JSON.stringify({
      hotspots: payload.hotspots.map((hotspot) => [hotspot.id, hotspot.x, hotspot.y, hotspot.z]),
      papers: payload.papers.map((paper) => [
        paper.scopedPaperId || paper.rawPaperId,
        paper.x,
        paper.y,
        paper.z,
      ]),
    }))
    .digest("hex");
  const plan = buildGalaxyFarBackgroundPlan(
    payload.hotspots,
    payload.papers,
    selected.id,
    coordinateScale,
  );
  const repeatedPlan = buildGalaxyFarBackgroundPlan(
    payload.hotspots,
    payload.papers,
    selected.id,
    coordinateScale,
  );
  const sourceCoordinateHashAfter = createHash("sha256")
    .update(JSON.stringify({
      hotspots: payload.hotspots.map((hotspot) => [hotspot.id, hotspot.x, hotspot.y, hotspot.z]),
      papers: payload.papers.map((paper) => [
        paper.scopedPaperId || paper.rawPaperId,
        paper.x,
        paper.y,
        paper.z,
      ]),
    }))
    .digest("hex");

  assert.equal(sourceCoordinateHashAfter, sourceCoordinateHashBefore, "source XYZ changed");
  assert.deepEqual(repeatedPlan, plan, "proxy plan changed between identical runs");
  assert.equal(plan.hotspots.length, payload.hotspots.length - 1);
  assert(plan.paperSampleCount <= plan.hotspots.length * GALAXY_FAR_BACKGROUND_MAX_PAPERS_PER_HOTSPOT);
  assert(plan.maximumLocalOffsetError <= 1e-9);
  assert(plan.nearestTargetRadius >= GALAXY_FAR_BACKGROUND_MIN_RADIUS);
  assert(plan.farthestTargetRadius <= GALAXY_FAR_BACKGROUND_MAX_RADIUS);

  let maximumSampledPaperOffset = 0;
  for (const hotspot of plan.hotspots) {
    assert(hotspot.papers.length <= GALAXY_FAR_BACKGROUND_MAX_PAPERS_PER_HOTSPOT);
    assert(hotspot.directionSeparationDegrees <= GALAXY_FAR_BACKGROUND_MAX_DIRECTION_SEPARATION_DEGREES);
    for (const paper of hotspot.papers) {
      maximumSampledPaperOffset = Math.max(
        maximumSampledPaperOffset,
        Math.hypot(...paper.localOffset),
      );
    }
    if (hotspot.transitionMode === "crossfade") {
      for (const progress of [0, 0.7, 0.76, 0.88, 1]) {
        assert.equal(
          resolveGalaxyFarBackgroundTransition(progress, "crossfade").centerProgress,
          1,
          "crossfade hotspot traverses the foreground",
        );
      }
    } else {
      let previousRadius = hotspot.startRadius;
      for (let index = 0; index <= 100; index += 1) {
        const transition = resolveGalaxyFarBackgroundTransition(index / 100, "retreat");
        const center = hotspot.startCenter.map((value, axis) => (
          value + (hotspot.targetCenter[axis] - value) * transition.centerProgress
        ));
        const radius = Math.hypot(...center);
        assert(radius + 1e-9 >= previousRadius, "retreat center distance decreased");
        previousRadius = radius;
      }
    }
  }
  assert(
    plan.farthestTargetRadius + maximumSampledPaperOffset + 8 < 240,
    "proxy exceeds the 240-unit far plane",
  );

  reports.push({
    selected: {
      id: selected.id,
      field: selected.field,
      topicId: selected.topicId,
      title: selected.title,
    },
    hotspotCount: plan.hotspots.length,
    paperSampleCount: plan.paperSampleCount,
    retreatHotspotCount: plan.retreatHotspotCount,
    crossfadeHotspotCount: plan.crossfadeHotspotCount,
    targetRadiusRange: [plan.nearestTargetRadius, plan.farthestTargetRadius],
    maximumSampledPaperOffset,
    maximumFarPlaneDistance: plan.farthestTargetRadius + maximumSampledPaperOffset + 8,
    maximumLocalOffsetError: plan.maximumLocalOffsetError,
    deterministic: true,
    sourceCoordinateHash: sourceCoordinateHashBefore,
  });
}

const result = {
  pass: true,
  payloadPath,
  paperCount: payload.papers.length,
  hotspotCount: payload.hotspots.length,
  coordinateScale,
  reports,
};
const serialized = `${JSON.stringify(result, null, 2)}\n`;
if (outputPath) {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, serialized, "utf8");
}
console.log(serialized.trimEnd());
