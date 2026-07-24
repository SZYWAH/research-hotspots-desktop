import { DatabaseSync } from "node:sqlite";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const sourceDir = resolve(
  process.env.RESEARCH_HOTSPOTS_SEMANTIC_SEED_DIR
    || join(root, "release-assets", "default-library"),
);
const databasePath = join(sourceDir, "research-hotspots-v7.sqlite");
const manifestPath = join(sourceDir, "default-library-manifest.json");
assert(existsSync(databasePath) && existsSync(manifestPath), "schema 12 semantic seed is missing");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
assert(manifest.manifestSchemaVersion === 4, "manifest schema is not v4");
assert(manifest.databaseSchemaVersion === 12, "database schema is not 12");
assert(manifest.embeddingCount === manifest.paperCount, "embedding count does not match papers");

const db = new DatabaseSync(databasePath, { readOnly: true });
const active = db.prepare(
  "SELECT state.active_snapshot_id snapshotId,snap.algorithm_version algorithmVersion "
  + "FROM v20_analysis_state state JOIN v20_analysis_snapshots snap ON snap.id=state.active_snapshot_id "
  + "WHERE state.project_id=?",
).get(manifest.projectId);
assert(active?.snapshotId === manifest.snapshotId, "active snapshot mismatch");
assert(active?.algorithmVersion === "v20-semantic-e5-small-1", "active algorithm mismatch");

const hotspots = db.prepare(
  "SELECT hotspot_id,x,y,z FROM v20_hotspots WHERE project_id=? AND snapshot_id=? ORDER BY hotspot_id",
).all(manifest.projectId, manifest.snapshotId);
const memberships = db.prepare(
  "SELECT paper_id,hotspot_id,x,y,z,representative_rank FROM v20_paper_memberships "
  + "WHERE project_id=? AND snapshot_id=? ORDER BY hotspot_id,paper_id",
).all(manifest.projectId, manifest.snapshotId);
const embeddings = new Map(db.prepare(
  "SELECT paper_id,vector_blob FROM paper_semantic_embeddings "
  + "WHERE project_id=? AND model_id=? AND model_revision=? AND dimensions=? AND encoding='float16-le'",
).all(manifest.projectId, manifest.embeddingModelId, manifest.embeddingModelRevision, manifest.embeddingDimensions)
  .map((row) => [row.paper_id, decodeFloat16(row.vector_blob)]));
db.close();

assert(hotspots.length === 160, `expected 160 hotspots, got ${hotspots.length}`);
assert(memberships.length === manifest.paperCount, "membership count mismatch");
assert(embeddings.size === manifest.paperCount, "current embedding rows are incomplete");

const hotspotById = new Map(hotspots.map((row) => [row.hotspot_id, row]));
const grouped = new Map();
for (const row of memberships) {
  if (row.representative_rank != null) continue;
  const center = hotspotById.get(row.hotspot_id);
  const point = { id: row.paper_id, x: row.x - center.x, y: row.y - center.y, z: row.z - center.z };
  if (!grouped.has(row.hotspot_id)) grouped.set(row.hotspot_id, []);
  grouped.get(row.hotspot_id).push(point);
}

const metrics = [];
let semanticNearSum = 0;
let randomSum = 0;
let semanticSamples = 0;
for (const [hotspotId, raw] of grouped) {
  if (raw.length === 0) continue;
  const rawRadii = raw.map(radius).sort(numberOrder);
  const p95 = quantile(rawRadii, 0.95) || 1;
  const scale = 3.2 / Math.max(0.0001, p95);
  let shellCount = 0;
  let insideExclusionCount = 0;
  const points = raw.map((point) => {
    const rendered = { ...point, x: point.x * scale, y: point.y * scale, z: point.z * scale };
    const sourceRadius = radius(rendered);
    if (sourceRadius > 1e-12 && sourceRadius < 0.82) {
      const normalized = sourceRadius / 0.82;
      setRadius(rendered, 0.82 + 0.18 * smootherStep(normalized));
    } else if (sourceRadius > 3.2) {
      const tail = 3.64 - 3.2;
      setRadius(rendered, 3.2 + tail * (1 - Math.exp(-(sourceRadius - 3.2) / tail)));
    }
    const r = radius(rendered);
    if (r < 0.82) insideExclusionCount += 1;
    if (r >= 0.82 && r <= 0.92) shellCount += 1;
    return rendered;
  });
  const spans = ["x", "y", "z"].map((axis) => {
    const values = points.map((point) => point[axis]).sort(numberOrder);
    return quantile(values, 0.95) - quantile(values, 0.05);
  });
  const correlations = [
    Math.abs(correlation(points, "x", "y")),
    Math.abs(correlation(points, "x", "z")),
    Math.abs(correlation(points, "y", "z")),
  ];
  const octants = new Set(points.map((p) => `${p.x >= 0 ? 1 : 0}${p.y >= 0 ? 1 : 0}${p.z >= 0 ? 1 : 0}`)).size;
  const renderedRadii = points.map(radius).sort(numberOrder);
  const metric = {
    hotspotId,
    count: points.length,
    maxCorrelation: Math.max(...correlations),
    spanRatio: Math.min(...spans) / Math.max(...spans, 1e-12),
    octants,
    p99Radius: quantile(renderedRadii, 0.99),
    insideExclusionCount,
    exclusionShellRatio: shellCount / points.length,
  };
  metrics.push(metric);
  if (points.length >= 20) {
    const sampleStride = Math.max(1, Math.floor(points.length / 6));
    for (let index = 0; index < points.length && index / sampleStride < 6; index += sampleStride) {
      const anchor = points[index];
      const anchorVector = embeddings.get(anchor.id);
      let nearest;
      let best = -Infinity;
      for (const candidate of points) {
        if (candidate.id === anchor.id) continue;
        const similarity = cosine(anchorVector, embeddings.get(candidate.id));
        if (similarity > best) {
          best = similarity;
          nearest = candidate;
        }
      }
      if (!nearest) continue;
      const random = points[(index * 17 + Math.floor(points.length / 2)) % points.length];
      if (random.id === anchor.id) continue;
      semanticNearSum += distance(anchor, nearest);
      randomSum += distance(anchor, random);
      semanticSamples += 1;
    }
  }
}

const large = metrics.filter((metric) => metric.count >= 64);
const failures = large.flatMap((metric) => {
  const issues = [];
  if (metric.maxCorrelation > 0.10) issues.push(`correlation=${metric.maxCorrelation.toFixed(4)}`);
  if (metric.spanRatio < 0.55) issues.push(`spanRatio=${metric.spanRatio.toFixed(4)}`);
  if (metric.octants < 6) issues.push(`octants=${metric.octants}`);
  if (metric.p99Radius > 3.65) issues.push(`p99=${metric.p99Radius.toFixed(4)}`);
  if (metric.insideExclusionCount > 0) issues.push(`insideExclusion=${metric.insideExclusionCount}`);
  if (metric.exclusionShellRatio > 0.25) issues.push(`shell=${metric.exclusionShellRatio.toFixed(4)}`);
  return issues.length ? [`${metric.hotspotId}: ${issues.join(", ")}`] : [];
});
const meanSemantic = semanticNearSum / Math.max(1, semanticSamples);
const meanRandom = randomSum / Math.max(1, semanticSamples);
assert(semanticSamples > 0 && meanSemantic < meanRandom * 0.85, `semantic neighborhoods are not spatially meaningful (${meanSemantic}/${meanRandom})`);
assert(failures.length === 0, `semantic layout distribution failed:\n${failures.slice(0, 20).join("\n")}`);

console.log(JSON.stringify({
  ok: true,
  snapshotId: manifest.snapshotId,
  papers: manifest.paperCount,
  hotspots: hotspots.length,
  largeHotspots: large.length,
  maximumCorrelation: Math.max(...large.map((metric) => metric.maxCorrelation)),
  minimumSpanRatio: Math.min(...large.map((metric) => metric.spanRatio)),
  minimumOctants: Math.min(...large.map((metric) => metric.octants)),
  maximumP99Radius: Math.max(...metrics.map((metric) => metric.p99Radius)),
  maximumExclusionShellRatio: Math.max(...large.map((metric) => metric.exclusionShellRatio)),
  semanticNeighborDistance: meanSemantic,
  randomPairDistance: meanRandom,
  semanticSamples,
}, null, 2));

function decodeFloat16(blob) {
  const bytes = blob instanceof Uint8Array ? blob : new Uint8Array(blob);
  const output = new Float32Array(bytes.length / 2);
  for (let i = 0; i < output.length; i += 1) {
    const bits = bytes[i * 2] | (bytes[i * 2 + 1] << 8);
    const sign = bits & 0x8000 ? -1 : 1;
    const exponent = (bits >> 10) & 0x1f;
    const fraction = bits & 0x03ff;
    output[i] = exponent === 0
      ? sign * 2 ** -14 * (fraction / 1024)
      : exponent === 31
        ? sign * (fraction ? Number.NaN : Number.POSITIVE_INFINITY)
        : sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
  }
  return output;
}
function cosine(a, b) {
  let dot = 0; let aa = 0; let bb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i];
  }
  return dot / Math.max(1e-12, Math.sqrt(aa * bb));
}
function correlation(points, a, b) {
  const meanA = points.reduce((sum, point) => sum + point[a], 0) / points.length;
  const meanB = points.reduce((sum, point) => sum + point[b], 0) / points.length;
  let numerator = 0; let left = 0; let right = 0;
  for (const point of points) {
    const da = point[a] - meanA; const db = point[b] - meanB;
    numerator += da * db; left += da * da; right += db * db;
  }
  return numerator / Math.max(1e-12, Math.sqrt(left * right));
}
function quantile(sorted, q) {
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * q)));
  return sorted[index] ?? 0;
}
function radius(point) { return Math.hypot(point.x, point.y, point.z); }
function setRadius(point, nextRadius) {
  const current = Math.max(radius(point), 1e-12);
  point.x *= nextRadius / current;
  point.y *= nextRadius / current;
  point.z *= nextRadius / current;
}
function smootherStep(value) {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * clamped * (clamped * (clamped * 6 - 15) + 10);
}
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); }
function numberOrder(a, b) { return a - b; }
function assert(condition, message) { if (!condition) throw new Error(`semantic seed audit failed: ${message}`); }
