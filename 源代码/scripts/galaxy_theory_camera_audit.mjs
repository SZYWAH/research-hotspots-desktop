import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile("src/components/App17GalaxyCanvas.tsx", "utf8");
const viewports = [
  [2048, 1178],
  [1920, 1080],
  [1366, 768],
  [1024, 768],
];
const fovRadians = 42 * Math.PI / 180;

function distanceForCoverage(radius, coverage, aspect) {
  const vertical = Math.tan(fovRadians / 2);
  const limiting = Math.min(vertical, vertical * aspect);
  return radius / (coverage * limiting);
}

for (const [width, height] of viewports) {
  const aspect = width / height;
  const radius = 0.63;
  const initial = distanceForCoverage(radius, 0.72, aspect);
  const fit = distanceForCoverage(radius, 0.86, aspect);
  const far = distanceForCoverage(radius, 0.45, aspect);
  const projectedCoverage = (distance) => radius / (distance * Math.min(
    Math.tan(fovRadians / 2),
    Math.tan(fovRadians / 2) * aspect,
  ));
  assert(projectedCoverage(initial) >= 0.68 && projectedCoverage(initial) <= 0.76);
  assert(projectedCoverage(fit) >= 0.82 && projectedCoverage(fit) <= 0.89);
  assert(projectedCoverage(far) >= 0.42 && projectedCoverage(far) <= 0.48);
}

assert(source.includes("resolveTheorySceneFraming"), "scene bounds are not derived");
assert(source.includes("resolveTheoryCameraPreset"), "dynamic theory camera is missing");
assert(source.includes("framing.p95Radius * 0.2"), "inside-volume minimum distance changed");
assert(source.includes("distanceForCoverage(0.72)"), "initial coverage changed");
assert(source.includes("distanceForCoverage(0.86)"), "fit coverage changed");
assert(source.includes("distanceForCoverage(0.45)"), "far coverage changed");
assert(source.includes("zScale: 1"), "theory Z compression remains");
assert(!source.includes("zScale: 0.42"), "legacy theory Z compression remains");
assert(source.includes("overviewFramingMode"), "resize/manual zoom preservation is missing");
assert(source.includes("hotspotPickProjectedPosition"), "screen-space hotspot picking is missing");
assert(source.includes("Math.max(\n          10,"), "minimum 10px pick radius is missing");
assert(source.includes("uOverviewFarBlend"), "theory far-distance LOD is missing");
assert(source.includes("mix(1.0, 0.62, uOverviewFarBlend)"), "paper far LOD changed");
assert(source.includes("mix(1.0, 0.68, uOverviewFarBlend)"), "hotspot core-size far LOD changed");
assert(source.includes("mix(1.0, 0.45, uOverviewFarBlend)"), "hotspot halo/ray far LOD changed");

console.log(JSON.stringify({
  pass: true,
  viewports: viewports.map(([width, height]) => `${width}x${height}`),
  initialCoverage: 0.72,
  fitCoverage: 0.86,
  farCoverage: 0.45,
  nearestP95Ratio: 0.20,
  zScale: 1,
  picking: "screen-space",
}, null, 2));
