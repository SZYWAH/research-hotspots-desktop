import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

function option(name, fallback = undefined) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function stripPaperCoordinates(paper) {
  const { x: _x, y: _y, z: _z, ...business } = paper;
  return business;
}

function stripHotspotCoordinates(hotspot) {
  const { x: _x, y: _y, z: _z, ...business } = hotspot;
  return business;
}

function businessPayload(payload) {
  const {
    message: _message,
    paperLayoutVersion: _paperLayoutVersion,
    paperLayoutCoordinateSpace: _paperLayoutCoordinateSpace,
    paperLayoutScaleMode: _paperLayoutScaleMode,
    paperLayoutLocalP95Radius: _paperLayoutLocalP95Radius,
    paperLayoutSharedScale: _paperLayoutSharedScale,
    projectionVersion: _projectionVersion,
    papers,
    hotspots,
    ...stableTopLevel
  } = payload;
  return {
    ...stableTopLevel,
    papers: papers.map(stripPaperCoordinates),
    hotspots: hotspots.map(stripHotspotCoordinates),
  };
}

function stableManifest(manifest) {
  const {
    generatedAt: _generatedAt,
    coordinateOverridePath: _coordinateOverridePath,
    coordinateOverrideSha256: _coordinateOverrideSha256,
    ...stable
  } = manifest;
  return stable;
}

const root = path.resolve(option(
  "--root",
  process.env.GALAXY_UMAP_AB_ROOT
    ?? "D:/wenjian/Desktop/综合课程设计/验收临时/galaxy-layout-ab-20260725",
));
const variants = [
  {
    id: "A",
    directory: "a",
    report: "umap-a-report.json",
    projectionVersion: "global-e5-umap3-n15-md0-cosine-r42-v1",
  },
  {
    id: "B",
    directory: "b",
    report: "umap-b-report.json",
    projectionVersion: "global-e5-umap3-n30-md0.02-cosine-r42-v1",
  },
  {
    id: "C",
    directory: "c",
    report: "umap-c-report.json",
    projectionVersion: "global-e5-umap3-n60-md0.05-cosine-r42-v1",
  },
];

const baselinePayload = await readJson(path.join(root, "v3", "payload.json"));
const baselineManifest = await readJson(path.join(root, "v3", "manifest.json"));
const baselineBusiness = businessPayload(baselinePayload);
const baselineStableManifest = stableManifest(baselineManifest);
const results = [];

assert.equal(baselinePayload.paperCount, 25_463);
assert.equal(baselinePayload.hotspotCount, 160);
assert.equal(baselinePayload.papers.length, 25_463);
assert.equal(baselinePayload.hotspots.length, 160);
assert.equal(baselinePayload.paperLayoutCoordinateSpace, "hierarchical");
assert.equal(baselinePayload.paperLayoutScaleMode, "shared");

for (const variant of variants) {
  const directory = path.join(root, variant.directory);
  const payloadPath = path.join(directory, "payload.json");
  const payload = await readJson(payloadPath);
  const manifest = await readJson(path.join(directory, "manifest.json"));
  const report = await readJson(path.join(root, "umap", variant.report));
  const overrideBytes = await readFile(report.coordinateOverridePath);

  assert.equal(payload.paperCount, 25_463, `${variant.id}: payload paper count`);
  assert.equal(payload.hotspotCount, 160, `${variant.id}: payload hotspot count`);
  assert.equal(payload.papers.length, 25_463, `${variant.id}: paper rows`);
  assert.equal(payload.hotspots.length, 160, `${variant.id}: hotspot rows`);
  assert.equal(payload.paperLayoutCoordinateSpace, "global", `${variant.id}: coordinate space`);
  assert.equal(payload.paperLayoutScaleMode, "shared", `${variant.id}: scale mode`);
  assert.equal(
    payload.paperLayoutVersion,
    "semantic-global-umap3-v4-experimental",
    `${variant.id}: layout version`,
  );
  assert.equal(
    payload.projectionVersion,
    variant.projectionVersion,
    `${variant.id}: projection version`,
  );
  assert.equal(
    payload.paperLayoutLocalP95Radius,
    report.localPaperToHotspotP95Radius,
    `${variant.id}: local paper P95 metadata`,
  );
  assert.equal(report.paperCount, 25_463, `${variant.id}: report paper count`);
  assert.equal(report.hotspotCount, 160, `${variant.id}: report hotspot count`);
  assert.equal(report.businessDataChanged, false, `${variant.id}: generator business-data flag`);
  assert.equal(report.deterministic, true, `${variant.id}: deterministic flag`);
  assert.equal(
    report.coordinateHashFirstRun,
    report.coordinateHashSecondRun,
    `${variant.id}: repeated coordinate hash`,
  );
  assert.equal(
    sha256(overrideBytes),
    report.coordinateOverrideSha256,
    `${variant.id}: coordinate override file hash`,
  );
  assert.equal(
    manifest.coordinateOverrideSha256,
    report.coordinateOverrideSha256,
    `${variant.id}: exported manifest override hash`,
  );
  assert.equal(
    report.semanticNeighborMetric.semanticNeighborsClearlyCloser,
    true,
    `${variant.id}: semantic-neighbor audit`,
  );
  assert(
    report.semanticNeighborMetric.neighborToRandomRatio < 0.25,
    `${variant.id}: semantic neighbors are not clearly closer than random pairs`,
  );
  assert(
    Math.abs(report.hotspotP95Radius - 92) <= 1e-9,
    `${variant.id}: hotspot P95 radius was not mapped to 92`,
  );
  assert.deepEqual(
    businessPayload(payload),
    baselineBusiness,
    `${variant.id}: non-coordinate payload business data changed`,
  );
  assert.deepEqual(
    stableManifest(manifest),
    baselineStableManifest,
    `${variant.id}: manifest topics or database identity changed`,
  );

  results.push({
    candidate: variant.id,
    coordinateHash: report.coordinateHashFirstRun,
    coordinateOverrideSha256: report.coordinateOverrideSha256,
    projectionVersion: payload.projectionVersion,
    localPaperToHotspotP95Radius: payload.paperLayoutLocalP95Radius,
    hotspotP95Radius: report.hotspotP95Radius,
    semanticNeighborToRandomRatio:
      report.semanticNeighborMetric.neighborToRandomRatio,
    deterministic: report.deterministic,
    businessDataChanged: false,
  });
}

assert.equal(
  new Set(results.map((result) => result.coordinateHash)).size,
  variants.length,
  "the three UMAP candidates must have distinct coordinates",
);

console.log(JSON.stringify({
  pass: true,
  root,
  baseline: {
    layoutVersion: baselinePayload.paperLayoutVersion,
    coordinateSpace: baselinePayload.paperLayoutCoordinateSpace,
    scaleMode: baselinePayload.paperLayoutScaleMode,
    paperCount: baselinePayload.paperCount,
    hotspotCount: baselinePayload.hotspotCount,
  },
  invariants: {
    paperIdsAndBusinessFieldsUnchanged: true,
    hotspotIdsAndBusinessFieldsUnchanged: true,
    hotspotRecordsAndEvidenceUnchanged: true,
    topicManifestUnchanged: true,
    membershipAndRepresentativeHash:
      (await readJson(path.join(root, "umap", variants[0].report)))
        .membershipRepresentativeHash,
  },
  candidates: results,
}, null, 2));
