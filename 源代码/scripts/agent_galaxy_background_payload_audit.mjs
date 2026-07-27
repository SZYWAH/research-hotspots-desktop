import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const MAX_SIZE_BYTES = 1024 * 1024;
const MAX_PAPERS_PER_HOTSPOT = 24;
const TARGET_HOTSPOT_P95_RADIUS = 46;
const COORDINATE_TOLERANCE = 1e-9;

function readOption(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function topicKey(field, topicId) {
  return `${field}\0${topicId}`;
}

function fnv1a32(snapshotId, hotspotId, paperId) {
  let hash = 0x811c9dc5;
  for (const [index, value] of [snapshotId, hotspotId, paperId].entries()) {
    if (index > 0) hash = Math.imul(hash, 0x01000193) >>> 0;
    for (const byte of Buffer.from(value, "utf8")) {
      hash ^= byte;
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
  }
  return hash >>> 0;
}

function coordinate(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function distance3(left, right) {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

function sortedKeys(value) {
  return Object.keys(value).sort();
}

const root = path.resolve(readOption("--root") || ".visual-review/app17");
const payloadPath = path.join(root, "payload.json");
const backgroundPath = path.join(root, "agent-background.json");
const manifestPath = path.join(root, "manifest.json");
const [payloadText, backgroundBytes, manifestText] = await Promise.all([
  readFile(payloadPath, "utf8"),
  readFile(backgroundPath),
  readFile(manifestPath, "utf8"),
]);
const payload = JSON.parse(payloadText);
const background = JSON.parse(backgroundBytes.toString("utf8"));
const manifest = JSON.parse(manifestText);
const backgroundStat = await stat(backgroundPath);

assert(background.schemaVersion === 1, "Unexpected Agent background schemaVersion.");
assert(background.payloadKind === "agent-galaxy-background", "Unexpected payloadKind.");
assert(background.samplingVersion === "fnv1a32-snapshot-hotspot-paper-v1", "Unexpected samplingVersion.");
assert(background.visualConfigVersion === "agent-galaxy-immersion-v1", "Unexpected visualConfigVersion.");
assert(background.projectId === manifest.projectId, "Project identity differs from the manifest.");
assert(background.sourceSnapshotId === payload.snapshotId, "Source snapshot identity differs from payload.json.");
assert(background.activeSnapshotId === payload.snapshotId, "Active snapshot identity differs from payload.json.");
assert(background.stale === false, "Freshly exported background is unexpectedly stale.");
assert(background.paperLayoutVersion === payload.paperLayoutVersion, "Layout version differs from payload.json.");
assert(background.projectionVersion === payload.projectionVersion, "Projection version differs from payload.json.");
assert(background.coordinateSpace === payload.paperLayoutCoordinateSpace, "Coordinate space differs from payload.json.");
assert(typeof background.libraryInstanceId === "string" && background.libraryInstanceId.length >= 16, "libraryInstanceId is missing.");
assert(background.sourcePaperCount === payload.paperCount, "Source paper count differs from payload.json.");
assert(background.sourceHotspotCount === payload.hotspotCount, "Source hotspot count differs from payload.json.");
assert(background.hotspots.length === payload.hotspots.length, "Hotspot count differs from payload.json.");
assert(backgroundStat.size === backgroundBytes.length, "Filesystem size differs from bytes read.");
assert(backgroundBytes.length <= MAX_SIZE_BYTES, `Payload exceeds 1 MiB: ${backgroundBytes.length} bytes.`);
assert(manifest.agentBackgroundPath === "agent-background.json", "Manifest background path is invalid.");
assert(manifest.agentBackgroundSizeBytes === backgroundBytes.length, "Manifest background size is invalid.");
assert(manifest.agentBackgroundSha256 === sha256(backgroundBytes), "Manifest background SHA-256 is invalid.");

const fullHotspots = [...payload.hotspots].sort((left, right) => left.id.localeCompare(right.id));
const fullHotspotIds = new Set(fullHotspots.map((hotspot) => hotspot.id));
const backgroundHotspotIds = new Set(background.hotspots.map((hotspot) => hotspot.id));
assert(backgroundHotspotIds.size === background.hotspots.length, "Duplicate background hotspot IDs.");
assert(
  [...fullHotspotIds].every((id) => backgroundHotspotIds.has(id))
    && [...backgroundHotspotIds].every((id) => fullHotspotIds.has(id)),
  "Background hotspot IDs are incomplete.",
);

const centroid = fullHotspots.reduce(
  (sum, hotspot) => [sum[0] + hotspot.x, sum[1] + hotspot.y, sum[2] + hotspot.z],
  [0, 0, 0],
).map((value) => value / fullHotspots.length);
const radii = fullHotspots
  .map((hotspot) => Math.hypot(hotspot.x - centroid[0], hotspot.y - centroid[1], hotspot.z - centroid[2]))
  .sort((left, right) => left - right);
const p95Index = Math.min(radii.length - 1, Math.max(0, Math.ceil(radii.length * 0.95) - 1));
const expectedScale = TARGET_HOTSPOT_P95_RADIUS / radii[p95Index];
assert(Math.abs(background.isotropicScale - expectedScale) <= 1e-12, "Isotropic scale is invalid.");
assert(distance3(background.sourceCentroid, centroid) <= 1e-12, "Source centroid is invalid.");
assert(background.hotspotP95Radius === TARGET_HOTSPOT_P95_RADIUS, "Target hotspot P95 radius is invalid.");

const backgroundHotspotById = new Map(background.hotspots.map((hotspot) => [hotspot.id, hotspot]));
const fullHotspotById = new Map(fullHotspots.map((hotspot) => [hotspot.id, hotspot]));
const fullHotspotByTopic = new Map(fullHotspots.map((hotspot) => [topicKey(hotspot.field, hotspot.topicId), hotspot]));
let maximumHotspotCoordinateError = 0;
for (const source of fullHotspots) {
  const proxy = backgroundHotspotById.get(source.id);
  assert(proxy, `Missing hotspot proxy: ${source.id}`);
  const hotspotKeys = sortedKeys(proxy);
  assert(["color", "field", "id", "paperCount", "position", "trend"].every((key) => hotspotKeys.includes(key)), `Required hotspot fields are missing for ${source.id}.`);
  assert(hotspotKeys.every((key) => ["color", "confidence", "field", "id", "paperCount", "position", "trend"].includes(key)), `Unexpected hotspot fields for ${source.id}.`);
  const expected = [
    coordinate((source.x - centroid[0]) * expectedScale),
    coordinate((source.y - centroid[1]) * expectedScale),
    coordinate((source.z - centroid[2]) * expectedScale),
  ];
  maximumHotspotCoordinateError = Math.max(maximumHotspotCoordinateError, distance3(proxy.position, expected));
}
assert(maximumHotspotCoordinateError <= COORDINATE_TOLERANCE, "Hotspot coordinate error exceeds tolerance.");

const candidatesByHotspot = new Map(background.hotspots.map((hotspot) => [hotspot.id, []]));
const fullPaperById = new Map();
for (const paper of payload.papers) {
  const hotspot = fullHotspotByTopic.get(topicKey(paper.field, paper.topicId));
  assert(hotspot, `Full payload paper has no hotspot: ${paper.rawPaperId}`);
  const existing = fullPaperById.get(paper.rawPaperId);
  assert(!existing, `Duplicate source paper ID: ${paper.rawPaperId}`);
  fullPaperById.set(paper.rawPaperId, paper);
  candidatesByHotspot.get(hotspot.id).push(paper);
}

const expectedPaperIds = [];
for (const hotspot of background.hotspots) {
  const candidates = candidatesByHotspot.get(hotspot.id);
  candidates.sort((left, right) => (
    fnv1a32(background.sourceSnapshotId, hotspot.id, left.rawPaperId)
    - fnv1a32(background.sourceSnapshotId, hotspot.id, right.rawPaperId)
    || left.rawPaperId.localeCompare(right.rawPaperId)
  ));
  expectedPaperIds.push(...candidates.slice(0, MAX_PAPERS_PER_HOTSPOT).map((paper) => paper.rawPaperId));
}

assert(background.papers.length === expectedPaperIds.length, "Sampled paper count is invalid.");
assert(background.papers.length <= background.hotspots.length * MAX_PAPERS_PER_HOTSPOT, "Paper proxy limit is invalid.");
assert(new Set(background.papers.map((paper) => paper.id)).size === background.papers.length, "Duplicate paper proxy IDs.");
assert(
  background.papers.every((paper, index) => paper.id === expectedPaperIds[index]),
  "Paper proxies do not match deterministic FNV-1a sampling order.",
);

const sampleCounts = new Map();
let maximumOffsetError = 0;
for (const paper of background.papers) {
  const paperKeys = sortedKeys(paper);
  assert(["color", "hotspotId", "id", "offset"].every((key) => paperKeys.includes(key)), `Required paper fields are missing for ${paper.id}.`);
  assert(paperKeys.every((key) => ["color", "hotspotId", "id", "offset", "year"].includes(key)), `Unexpected paper fields for ${paper.id}.`);
  assert(fullHotspotIds.has(paper.hotspotId), `Paper proxy has unknown hotspot: ${paper.id}`);
  const sourcePaper = fullPaperById.get(paper.id);
  const sourceHotspot = fullHotspotById.get(paper.hotspotId);
  assert(sourcePaper && sourceHotspot, `Paper proxy source is incomplete: ${paper.id}`);
  const expectedOffset = [
    coordinate((sourcePaper.x - sourceHotspot.x) * expectedScale),
    coordinate((sourcePaper.y - sourceHotspot.y) * expectedScale),
    coordinate((sourcePaper.z - sourceHotspot.z) * expectedScale),
  ];
  maximumOffsetError = Math.max(maximumOffsetError, distance3(paper.offset, expectedOffset));
  sampleCounts.set(paper.hotspotId, (sampleCounts.get(paper.hotspotId) || 0) + 1);
}
assert(maximumOffsetError <= COORDINATE_TOLERANCE, "Paper relative coordinate error exceeds tolerance.");
assert([...sampleCounts.values()].every((count) => count <= MAX_PAPERS_PER_HOTSPOT), "Per-hotspot paper proxy limit exceeded.");

console.log(JSON.stringify({
  pass: true,
  root,
  schemaVersion: background.schemaVersion,
  sourceSnapshotId: background.sourceSnapshotId,
  layoutVersion: background.paperLayoutVersion,
  coordinateSpace: background.coordinateSpace,
  sourcePaperCount: background.sourcePaperCount,
  hotspotCount: background.hotspots.length,
  paperProxyCount: background.papers.length,
  maxPapersPerHotspot: Math.max(...sampleCounts.values()),
  fileSizeBytes: backgroundBytes.length,
  fileSizeLimitBytes: MAX_SIZE_BYTES,
  sha256: manifest.agentBackgroundSha256,
  isotropicScale: background.isotropicScale,
  hotspotP95Radius: background.hotspotP95Radius,
  maximumHotspotCoordinateError,
  maximumOffsetError,
  deterministicSampling: true,
  forbiddenPaperContentAbsent: true,
}, null, 2));
