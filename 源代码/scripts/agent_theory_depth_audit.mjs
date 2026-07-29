import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { DatabaseSync } from "node:sqlite";

import {
  applyAgentTheoryDepthProfile,
  createAgentTheoryDecorativePlan,
  createAgentTheoryDepthProfile,
  resolveAgentTheoryDepthStyle,
  sampleAgentTheoryAmbientCamera,
} from "../src/lib/agentTheoryDepth.ts";
import {
  selectDeterministicAgentTheoryView,
} from "../src/lib/galaxyTheoryView.ts";

const root = process.cwd();
const databasePath = path.join(
  root,
  "data",
  "library",
  "research-hotspots-v7.sqlite",
);
const componentPath = path.join(
  root,
  "src",
  "components",
  "App17GalaxyCanvas.tsx",
);
const wrapperPath = path.join(
  root,
  "src",
  "components",
  "AgentTheoryBackgroundCanvas.tsx",
);
const pagePath = path.join(
  root,
  "src",
  "components",
  "AgentDualBackgroundPage.tsx",
);
const componentSource = fs.readFileSync(componentPath, "utf8");
const wrapperSource = fs.readFileSync(wrapperPath, "utf8");
const pageSource = fs.readFileSync(pagePath, "utf8");
const database = new DatabaseSync(databasePath, { readOnly: true });
const active = database.prepare(`
  SELECT active_snapshot_id AS snapshotId
  FROM v20_analysis_state
  WHERE project_id = 'project-default'
`).get();
if (!active?.snapshotId) {
  throw new Error("active snapshot not found");
}
const paperRows = database.prepare(`
  SELECT paper_id AS paperId, hotspot_id AS hotspotId, x, y, z
  FROM v20_paper_memberships
  WHERE snapshot_id = ?
  ORDER BY paper_id
`).all(active.snapshotId);
const hotspotRows = database.prepare(`
  SELECT hotspot_id AS hotspotId, x, y, z, paper_count AS paperCount
  FROM v20_hotspots
  WHERE snapshot_id = ?
  ORDER BY hotspot_id
`).all(active.snapshotId);
database.close();

const payload = {
  snapshotId: active.snapshotId,
  papers: paperRows.map((row) => ({
    rawPaperId: row.paperId,
    scopedPaperId: row.paperId,
    field: "",
    topicId: 0,
    x: row.x,
    y: row.y,
    z: row.z,
    color: "#ffffff",
    size: 2.2,
  })),
  hotspots: hotspotRows.map((row) => ({
    id: row.hotspotId,
    field: "",
    topicId: 0,
    title: "",
    label: "",
    summary: "",
    trend: "",
    paperCount: row.paperCount,
    x: row.x,
    y: row.y,
    z: row.z,
    color: "#ffffff",
    size: 1,
    keywords: [],
  })),
};

const hash = (value) => crypto
  .createHash("sha256")
  .update(JSON.stringify(value))
  .digest("hex");
const rawCoordinateHash = hash({
  papers: payload.papers.map(({ rawPaperId, x, y, z }) => [
    rawPaperId,
    x,
    y,
    z,
  ]),
  hotspots: payload.hotspots.map(({ id, x, y, z }) => [id, x, y, z]),
});
const profile = createAgentTheoryDepthProfile(payload);
const repeatedProfile = createAgentTheoryDepthProfile(payload);
const displayPayload = applyAgentTheoryDepthProfile(payload, profile);
const rawCoordinateHashAfter = hash({
  papers: payload.papers.map(({ rawPaperId, x, y, z }) => [
    rawPaperId,
    x,
    y,
    z,
  ]),
  hotspots: payload.hotspots.map(({ id, x, y, z }) => [id, x, y, z]),
});
const transformMaximumError = Math.max(
  ...displayPayload.papers.map((paper, index) => {
    const raw = payload.papers[index];
    return Math.max(
      Math.abs(paper.x - raw.x),
      Math.abs(paper.y - raw.y),
      Math.abs(
        paper.z
          - (
            profile.centerZ
            + (raw.z - profile.centerZ) * profile.depthScale
          ),
      ),
    );
  }),
);

const viewHotspots = displayPayload.hotspots.map((hotspot) => ({
  x: hotspot.x,
  y: hotspot.y,
  z: hotspot.z,
  topicKey: hotspot.id,
  displaySize: 10,
}));
const viewPapers = displayPayload.papers.map((paper) => ({
  x: paper.x,
  y: paper.y,
  z: paper.z,
  topicKey: paper.hotspotId,
  displaySize: 2.2,
}));
const view = selectDeterministicAgentTheoryView(
  viewHotspots,
  viewPapers,
  16 / 9,
  42,
);
const repeatedView = selectDeterministicAgentTheoryView(
  viewHotspots,
  viewPapers,
  16 / 9,
  42,
);
const decorativePlan = createAgentTheoryDecorativePlan({
  snapshotId: active.snapshotId,
  layerVersion: profile.decorativeLayerVersion,
  quality: "balanced",
  center: [0, 0, 0],
  baseRadius: 1,
});
const repeatedDecorativePlan = createAgentTheoryDecorativePlan({
  snapshotId: active.snapshotId,
  layerVersion: profile.decorativeLayerVersion,
  quality: "balanced",
  center: [0, 0, 0],
  baseRadius: 1,
});
const decorativeBandCounts = decorativePlan.points.reduce(
  (counts, point) => {
    counts[point.depthBand] += 1;
    return counts;
  },
  { near: 0, middle: 0, far: 0 },
);
const ambientSamples = Array.from(
  { length: 600 },
  (_, index) => sampleAgentTheoryAmbientCamera(index, 1),
);
const maximumAmbientAzimuth = Math.max(
  ...ambientSamples.map((sample) => Math.abs(sample.azimuthOffsetDegrees)),
);
const maximumAmbientElevation = Math.max(
  ...ambientSamples.map((sample) => Math.abs(sample.elevationOffsetDegrees)),
);
const maximumAmbientDistanceRatio = Math.max(
  ...ambientSamples.map((sample) => Math.abs(sample.distanceOffsetRatio)),
);
const nearStyle = resolveAgentTheoryDepthStyle(0);
const middleStyle = resolveAgentTheoryDepthStyle(0.5);
const farStyle = resolveAgentTheoryDepthStyle(1);
const parallaxCenter = [
  median(viewHotspots.map((point) => point.x).sort((left, right) => left - right)),
  median(viewHotspots.map((point) => point.y).sort((left, right) => left - right)),
  median(viewHotspots.map((point) => point.z).sort((left, right) => left - right)),
];
const parallaxMeasurement = measureParallax(
  viewPapers,
  view,
  parallaxCenter,
  0,
  8,
  1_440,
  900,
);
const checks = [];
const check = (name, passed, detail) => {
  checks.push({ name, passed: Boolean(passed), detail });
};

check(
  "active snapshot contains the expected V20 identity counts",
  paperRows.length === 25_463 && hotspotRows.length === 160,
  `${active.snapshotId}; papers=${paperRows.length}; hotspots=${hotspotRows.length}`,
);
check(
  "depth profile is deterministic",
  hash(profile) === hash(repeatedProfile),
  hash(profile),
);
check(
  "active snapshot depth scale matches the bounded thin-slab correction",
  profile.depthScale >= 1
    && profile.depthScale <= 2.2
    && Math.abs(profile.depthScale - 1.9478813603445035) < 1e-9,
  `ratio=${profile.rawDepthRatio}; scale=${profile.depthScale}`,
);
check(
  "raw coordinates are not mutated",
  rawCoordinateHash === rawCoordinateHashAfter,
  rawCoordinateHash,
);
check(
  "display transform changes only Z according to the shared profile",
  transformMaximumError <= 1e-12,
  `maximumError=${transformMaximumError}`,
);
check(
  "Agent depth-aware view is deterministic",
  hash(view) === hash(repeatedView),
  `azimuth=${view.azimuth}; elevation=${view.elevation}; score=${view.selectedScore}`,
);
check(
  "Agent view score includes depth compression and parallax",
  Number.isFinite(view.score.depthCompressionPenalty)
    && Number.isFinite(view.score.parallaxPenalty),
  JSON.stringify(view.score),
);
check(
  "near and far paper size staging exceeds the 1.8 ratio",
  nearStyle.sizeMultiplier / farStyle.sizeMultiplier >= 1.8,
  `near=${nearStyle.sizeMultiplier}; middle=${middleStyle.sizeMultiplier}; far=${farStyle.sizeMultiplier}`,
);
check(
  "depth staging uses the locked alpha and chroma ranges",
  Math.abs(nearStyle.alphaMultiplier - 1.29) < 1e-12
    && Math.abs(farStyle.alphaMultiplier - 0.56) < 1e-12
    && Math.abs(nearStyle.semanticChroma - 0.78) < 1e-12
    && Math.abs(farStyle.semanticChroma - 0.52) < 1e-12,
  JSON.stringify({ nearStyle, middleStyle, farStyle }),
);
check(
  "balanced decorative layer has fixed non-semantic budgets",
  decorativePlan.starCount === 500
    && decorativePlan.dustCount === 1_000
    && decorativePlan.points.length === 1_500,
  JSON.stringify({
    stars: decorativePlan.starCount,
    dust: decorativePlan.dustCount,
  }),
);
check(
  "decorative coordinates are deterministic",
  hash(decorativePlan) === hash(repeatedDecorativePlan),
  hash(decorativePlan),
);
check(
  "decorative depth bands follow the 20/35/45 distribution",
  Math.abs(decorativeBandCounts.near / 1_500 - 0.20) < 0.04
    && Math.abs(decorativeBandCounts.middle / 1_500 - 0.35) < 0.04
    && Math.abs(decorativeBandCounts.far / 1_500 - 0.45) < 0.04,
  JSON.stringify(decorativeBandCounts),
);
check(
  "ambient camera remains inside locked limits",
  maximumAmbientAzimuth <= 1.2 + 1e-12
    && maximumAmbientElevation <= 0.6 + 1e-12
    && maximumAmbientDistanceRatio <= 0.008 + 1e-12,
  JSON.stringify({
    maximumAmbientAzimuth,
    maximumAmbientElevation,
    maximumAmbientDistanceRatio,
  }),
);
check(
  "eight-second ambient drift separates near and far projected motion",
  parallaxMeasurement.medianDifferencePx >= 1,
  JSON.stringify(parallaxMeasurement),
);
check(
  "Agent wrapper derives an in-memory display payload",
  /applyAgentTheoryDepthProfile\(payload, depthProfile\)/.test(wrapperSource)
    && /data-display-space="agent-depth-enhanced"/.test(wrapperSource)
    && /理论布局 · (视觉纵深增强|外围观测巡航)/.test(wrapperSource),
  "AgentTheoryBackgroundCanvas",
);
check(
  "analysis and Agent scene caches are isolated",
  /const cacheKey = `\$\{visualMode\}:\$\{visualProfile\}`/.test(componentSource)
    && /visualProfile === "agent-theory"[\s\S]*selectDeterministicAgentTheoryView/.test(componentSource),
  "profile-specific scene cache and view selector",
);
check(
  "decorative layer is explicitly non-semantic and non-pickable",
  /object\.userData\.semanticEntity = false/.test(componentSource)
    && /object\.userData\.pickable = false/.test(componentSource)
    && !/paperId|hotspotId/.test(
      componentSource.match(
        /function createAgentTheoryDecorativeLayer\([\s\S]*?\n}\n\nfunction createPaperLayer/,
      )?.[0] ?? "",
    ),
  "decorative deep field",
);
check(
  "theory pose persistence is versioned for enhanced coordinates",
  /research-agent:theory-pose:v3-agent-depth/.test(pageSource),
  "AgentDualBackgroundPage",
);
check(
  "Agent semantic stars avoid blur and time-opacity effects",
  !/depthOfField|motionBlur|bokeh/i.test(
    componentSource.match(
      /function createPaperMaterial\([\s\S]*?\n}\n\nfunction createHotspotPointSourceMaterial/,
    )?.[0] ?? "",
  )
    && !/uniform float uTime/.test(
      componentSource.match(
        /function createPaperMaterial\([\s\S]*?\n}\n\nfunction createHotspotPointSourceMaterial/,
      )?.[0] ?? "",
    ),
  "Agent overview paper shader",
);

const failedChecks = checks.filter((item) => !item.passed);
const result = {
  audit: "agent-theory-depth-v1",
  generatedAt: new Date().toISOString(),
  status: failedChecks.length === 0 ? "PASS" : "FAIL",
  snapshotId: active.snapshotId,
  diagnostics: {
    paperCount: paperRows.length,
    hotspotCount: hotspotRows.length,
    rawCoordinateHash,
    rawAxisStd: profile.rawAxisStd,
    rawDepthRatio: profile.rawDepthRatio,
    depthScale: profile.depthScale,
    centerZ: profile.centerZ,
    selectedView: view,
    decorativeBandCounts,
    decorativeCoordinateHash: hash(decorativePlan),
    depthStyles: {
      near: nearStyle,
      middle: middleStyle,
      far: farStyle,
    },
    ambientLimits: {
      maximumAmbientAzimuth,
      maximumAmbientElevation,
      maximumAmbientDistanceRatio,
    },
    parallaxMeasurement,
  },
  checks,
  failedChecks,
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (failedChecks.length > 0) process.exitCode = 1;

function measureParallax(
  points,
  selection,
  center,
  startSeconds,
  endSeconds,
  width,
  height,
) {
  const startCamera = cameraAt(selection, startSeconds);
  const endCamera = cameraAt(selection, endSeconds);
  const startRows = points.map((point) => {
    const projected = project(point, center, startCamera, 16 / 9, 42);
    return {
      depth: projected.depth,
      startX: projected.x,
      startY: projected.y,
    };
  });
  const sortedDepths = startRows
    .map((row) => row.depth)
    .sort((left, right) => left - right);
  const nearCut = percentile(sortedDepths, 0.32);
  const farCut = percentile(sortedDepths, 0.68);
  const near = [];
  const far = [];
  for (let index = 0; index < points.length; index += 1) {
    const start = startRows[index];
    if (start.depth > nearCut && start.depth < farCut) continue;
    const end = project(points[index], center, endCamera, 16 / 9, 42);
    const displacement = Math.hypot(
      (end.x - start.startX) * width * 0.5,
      (end.y - start.startY) * height * 0.5,
    );
    if (start.depth <= nearCut) near.push(displacement);
    else far.push(displacement);
  }
  near.sort((left, right) => left - right);
  far.sort((left, right) => left - right);
  const nearMedianPx = percentile(near, 0.5);
  const farMedianPx = percentile(far, 0.5);
  return {
    startSeconds,
    endSeconds,
    nearMedianPx,
    farMedianPx,
    medianDifferencePx: Math.abs(nearMedianPx - farMedianPx),
  };
}

function cameraAt(selection, seconds) {
  const ambient = sampleAgentTheoryAmbientCamera(seconds, 1);
  return {
    azimuth: selection.azimuth
      + ambient.azimuthOffsetDegrees * Math.PI / 180,
    elevation: selection.elevation
      + ambient.elevationOffsetDegrees * Math.PI / 180,
    distance: selection.distance * (1 + ambient.distanceOffsetRatio),
  };
}

function project(point, center, camera, aspect, fovDegrees) {
  const horizontal = Math.cos(camera.elevation);
  const direction = [
    horizontal * Math.cos(camera.azimuth),
    horizontal * Math.sin(camera.azimuth),
    Math.sin(camera.elevation),
  ];
  const right = normalize([direction[1], -direction[0], 0]);
  const up = normalize(cross(direction, right));
  const relative = [
    point.x - center[0],
    point.y - center[1],
    point.z - center[2],
  ];
  const verticalTangent = Math.tan(fovDegrees * Math.PI / 360);
  const depth = Math.max(1e-9, camera.distance - dot(relative, direction));
  return {
    x: dot(relative, right) / (depth * verticalTangent * aspect),
    y: dot(relative, up) / (depth * verticalTangent),
    depth,
  };
}

function percentile(values, ratio) {
  if (values.length === 0) return 0;
  return values[Math.min(
    values.length - 1,
    Math.max(0, Math.ceil(values.length * ratio) - 1),
  )];
}

function median(values) {
  if (values.length === 0) return 0;
  const middle = Math.floor(values.length * 0.5);
  return values.length % 2 === 0
    ? (values[middle - 1] + values[middle]) * 0.5
    : values[middle];
}

function dot(left, right) {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function cross(left, right) {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function normalize(value) {
  const length = Math.max(1e-12, Math.hypot(...value));
  return value.map((component) => component / length);
}
