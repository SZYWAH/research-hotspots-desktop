import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function percentile(values, fraction) {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((first, second) => first - second);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))];
}

function median(values) {
  return percentile(values, 0.5);
}

function subtract(first, second) {
  return [first[0] - second[0], first[1] - second[1], first[2] - second[2]];
}

function add(first, second) {
  return [first[0] + second[0], first[1] + second[1], first[2] + second[2]];
}

function scale(vector, amount) {
  return [vector[0] * amount, vector[1] * amount, vector[2] * amount];
}

function dot(first, second) {
  return first[0] * second[0] + first[1] * second[1] + first[2] * second[2];
}

function cross(first, second) {
  return [
    first[1] * second[2] - first[2] * second[1],
    first[2] * second[0] - first[0] * second[2],
    first[0] * second[1] - first[1] * second[0],
  ];
}

function length(vector) {
  return Math.hypot(...vector);
}

function normalize(vector) {
  const magnitude = Math.max(1e-12, length(vector));
  return scale(vector, 1 / magnitude);
}

function camera(center, distance, azimuthDegrees, elevationDegrees) {
  const azimuth = azimuthDegrees * Math.PI / 180;
  const elevation = elevationDegrees * Math.PI / 180;
  const offset = [
    distance * Math.cos(elevation) * Math.cos(azimuth),
    distance * Math.cos(elevation) * Math.sin(azimuth),
    distance * Math.sin(elevation),
  ];
  const position = add(center, offset);
  const forward = normalize(scale(offset, -1));
  let right = normalize(cross(forward, [0, 0, 1]));
  if (length(right) < 1e-9) right = [1, 0, 0];
  const up = normalize(cross(right, forward));
  return { center, distance, position, forward, right, up };
}

function project(point, view, aspect = 1440 / 900, fovDegrees = 42) {
  const relative = subtract(point, view.position);
  const depth = dot(relative, view.forward);
  if (depth <= 1e-9) return { x: Number.NaN, y: Number.NaN, depth, visible: false };
  const tangent = Math.tan(fovDegrees * Math.PI / 360);
  const x = dot(relative, view.right) / (depth * tangent * aspect);
  const y = dot(relative, view.up) / (depth * tangent);
  return {
    x,
    y,
    depth,
    visible: Number.isFinite(x) && Number.isFinite(y) && Math.abs(x) <= 1 && Math.abs(y) <= 1,
  };
}

function hotspotDisplaySizes(hotspots) {
  const logs = hotspots.map((hotspot) => Math.log1p(Math.max(0, hotspot.paperCount)));
  const minimum = Math.min(...logs);
  const maximum = Math.max(...logs);
  const span = Math.max(1e-9, maximum - minimum);
  return hotspots.map((_hotspot, index) => 16 + ((logs[index] - minimum) / span) ** 0.72 * 27);
}

function occupancy(projected, columns = 30, rows = 18) {
  const cells = new Set();
  let insideCount = 0;
  for (const point of projected) {
    if (!point.visible) continue;
    insideCount += 1;
    const column = Math.min(columns - 1, Math.max(0, Math.floor((point.x * 0.5 + 0.5) * columns)));
    const row = Math.min(rows - 1, Math.max(0, Math.floor((-point.y * 0.5 + 0.5) * rows)));
    cells.add(`${column}:${row}`);
  }
  return {
    occupiedCells: cells.size,
    totalCells: columns * rows,
    occupancyRatio: cells.size / (columns * rows),
    insideCount,
  };
}

function trimmedArea(projected) {
  const visible = projected.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  const xs = visible.map((point) => point.x);
  const ys = visible.map((point) => point.y);
  const width = Math.max(1e-9, percentile(xs, 0.98) - percentile(xs, 0.02));
  const height = Math.max(1e-9, percentile(ys, 0.98) - percentile(ys, 0.02));
  return width * height;
}

function fixedViewMetrics(payload) {
  const hotspotPoints = payload.hotspots.map((hotspot) => [hotspot.x, hotspot.y, hotspot.z]);
  const paperPoints = payload.papers.map((paper) => [paper.x, paper.y, paper.z]);
  const center = [
    median(hotspotPoints.map((point) => point[0])),
    median(hotspotPoints.map((point) => point[1])),
    median(hotspotPoints.map((point) => point[2])),
  ];
  const radii = [...hotspotPoints, ...paperPoints].map((point) => length(subtract(point, center)));
  const p95Radius = percentile(radii, 0.95);
  const distance = p95Radius / (0.78 * Math.tan(42 * Math.PI / 360));
  const view = camera(center, distance, 45, 18);
  const projectedHotspots = hotspotPoints.map((point) => project(point, view));
  const projectedPapers = paperPoints.map((point) => project(point, view));
  const displaySizes = hotspotDisplaySizes(payload.hotspots);
  let overlapCount = 0;
  let comparablePairCount = 0;
  for (let first = 0; first < projectedHotspots.length; first += 1) {
    if (!projectedHotspots[first].visible) continue;
    for (let second = first + 1; second < projectedHotspots.length; second += 1) {
      if (!projectedHotspots[second].visible) continue;
      comparablePairCount += 1;
      const deltaPixels = Math.hypot(
        (projectedHotspots[first].x - projectedHotspots[second].x) * 720,
        (projectedHotspots[first].y - projectedHotspots[second].y) * 450,
      );
      if (deltaPixels < (displaySizes[first] + displaySizes[second]) * 0.5) overlapCount += 1;
    }
  }
  const visibleHotspots = projectedHotspots.filter((point) => point.visible);
  const centroid = visibleHotspots.length > 0
    ? [
        visibleHotspots.reduce((total, point) => total + point.x, 0) / visibleHotspots.length,
        visibleHotspots.reduce((total, point) => total + point.y, 0) / visibleHotspots.length,
      ]
    : [0, 0];
  const edgeCount = projectedHotspots.filter((point) => (
    point.visible && (Math.abs(point.x) >= 0.9 || Math.abs(point.y) >= 0.9)
  )).length;
  const croppedCount = projectedHotspots.filter((point) => !point.visible).length;

  return {
    camera: {
      azimuthDegrees: 45,
      elevationDegrees: 18,
      distance,
      p95Radius,
      p95FramingFraction: 0.78,
    },
    hotspotOverlapCount: overlapCount,
    hotspotComparablePairCount: comparablePairCount,
    hotspotOverlapRate: comparablePairCount > 0 ? overlapCount / comparablePairCount : 0,
    grid: occupancy(projectedPapers),
    hotspotCentroid: {
      x: centroid[0],
      y: centroid[1],
      offset: Math.hypot(...centroid),
    },
    edgeHotspotCount: edgeCount,
    croppedHotspotCount: croppedCount,
  };
}

function topic(payload, field, topicId) {
  return payload.hotspots.find((hotspot) => hotspot.field === field && hotspot.topicId === topicId);
}

function regionalMetrics(payload) {
  const first = topic(payload, "Computational Biology", 138);
  const second = topic(payload, "Computational Biology", 96);
  if (!first || !second) throw new Error("missing Computational Biology 138/96");
  const keys = new Set([
    `${first.field}_${first.topicId}`,
    `${second.field}_${second.topicId}`,
  ]);
  const papers = payload.papers.filter((paper) => keys.has(`${paper.field}_${paper.topicId}`));
  const center = [
    (first.x + second.x) * 0.5,
    (first.y + second.y) * 0.5,
    (first.z + second.z) * 0.5,
  ];
  const points = [
    [first.x, first.y, first.z],
    [second.x, second.y, second.z],
    ...papers.map((paper) => [paper.x, paper.y, paper.z]),
  ];
  const p95Radius = percentile(points.map((point) => length(subtract(point, center))), 0.95);
  const distance = p95Radius / (0.62 * Math.tan(42 * Math.PI / 360));
  const view = camera(center, distance, 45, 18);
  const projected = papers.map((paper) => project([paper.x, paper.y, paper.z], view));
  const firstProjection = project([first.x, first.y, first.z], view);
  const secondProjection = project([second.x, second.y, second.z], view);
  const area = trimmedArea(projected);
  return {
    camera: {
      focus: "Computational Biology 138/96 midpoint",
      azimuthDegrees: 45,
      elevationDegrees: 18,
      distance,
      p95Radius,
      p95FramingFraction: 0.62,
    },
    paperCount: papers.length,
    trimmedPaperAreaNdc2: area,
    paperDensityPerNdc2: papers.length / area,
    grid: occupancy(projected, 24, 15),
    hotspotCenterSeparationNdc: Math.hypot(
      firstProjection.x - secondProjection.x,
      firstProjection.y - secondProjection.y,
    ),
    croppedPaperCount: projected.filter((point) => !point.visible).length,
  };
}

function localSystemMetrics(payload, field, topicId) {
  const hotspot = topic(payload, field, topicId);
  if (!hotspot) throw new Error(`missing ${field} ${topicId}`);
  const coordinateScale = 3.2 / Math.max(
    1e-12,
    (payload.paperLayoutLocalP95Radius ?? 10.5) * (payload.paperLayoutSharedScale ?? 1),
  );
  const papers = payload.papers.filter((paper) => paper.field === field && paper.topicId === topicId);
  const points = papers.map((paper) => [
    (paper.x - hotspot.x) * coordinateScale,
    (paper.y - hotspot.y) * coordinateScale,
    (paper.z - hotspot.z) * coordinateScale,
  ]);
  const view = camera([0, 0, 0], 8, 45, 26);
  const projected = points.map((point) => project(point, view));
  const area = trimmedArea(projected);
  return {
    field,
    topicId,
    title: hotspot.title,
    paperCount: papers.length,
    camera: { azimuthDegrees: 45, elevationDegrees: 26, distance: 8 },
    grid: occupancy(projected, 24, 15),
    trimmedPaperAreaNdc2: area,
    paperDensityPerNdc2: papers.length / area,
    croppedPaperCount: projected.filter((point) => !point.visible).length,
  };
}

const root = path.resolve(option(
  "--root",
  process.env.GALAXY_UMAP_AB_ROOT
    ?? "D:/wenjian/Desktop/综合课程设计/验收临时/galaxy-layout-ab-20260725",
));
const output = path.resolve(option(
  "--output",
  path.join(root, "multiscale-20260726", "fixed-view-metrics.json"),
));
const variants = [
  { id: "v3", label: "v3 hierarchical/shared", directory: "v3" },
  { id: "A", label: "UMAP-A n15 md0", directory: "a" },
  { id: "B", label: "UMAP-B n30 md0.02", directory: "b" },
  { id: "C", label: "UMAP-C n60 md0.05", directory: "c" },
];
const reports = [];
for (const variant of variants) {
  const payload = JSON.parse(await readFile(path.join(root, variant.directory, "payload.json"), "utf8"));
  const semanticReport = variant.id === "v3"
    ? undefined
    : JSON.parse(await readFile(
        path.join(root, "umap", `umap-${variant.id.toLowerCase()}-report.json`),
        "utf8",
      ));
  reports.push({
    ...variant,
    paperCount: payload.paperCount,
    hotspotCount: payload.hotspotCount,
    layoutVersion: payload.paperLayoutVersion,
    coordinateSpace: payload.paperLayoutCoordinateSpace,
    scaleMode: payload.paperLayoutScaleMode,
    fixedGlobal: fixedViewMetrics(payload),
    interwovenRegion: regionalMetrics(payload),
    localSystems: {
      small: localSystemMetrics(payload, "Computational Biology", 138),
      medium: localSystemMetrics(payload, "Artificial Intelligence", 78),
      large: localSystemMetrics(payload, "Quantum Physics", 1),
    },
    semanticNeighborToRandomRatio:
      semanticReport?.semanticNeighborMetric?.neighborToRandomRatio ?? null,
  });
}

const report = {
  generatedAt: new Date().toISOString(),
  purpose: "deterministic multiscale comparison only; no candidate is selected or activated",
  logicalViewport: { width: 1440, height: 900 },
  fixedGlobalCamera: { azimuthDegrees: 45, elevationDegrees: 18, p95FramingFraction: 0.78 },
  fixedLocalCamera: { azimuthDegrees: 45, elevationDegrees: 26, distance: 8 },
  reports,
};
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");

const markdown = [
  "# 理论星图多尺度固定视角指标",
  "",
  "本报告只用于人工 A/B；不会自动选择或启用候选。",
  "",
  "| 布局 | 热点重叠率 | 网格占用 | 重心偏移 | 边缘/裁切热点 | 交织区论文密度 | 语义近邻/随机 |",
  "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
  ...reports.map((item) => [
    item.label,
    `${(item.fixedGlobal.hotspotOverlapRate * 100).toFixed(2)}%`,
    `${(item.fixedGlobal.grid.occupancyRatio * 100).toFixed(2)}%`,
    item.fixedGlobal.hotspotCentroid.offset.toFixed(4),
    `${item.fixedGlobal.edgeHotspotCount}/${item.fixedGlobal.croppedHotspotCount}`,
    item.interwovenRegion.paperDensityPerNdc2.toFixed(2),
    item.semanticNeighborToRandomRatio === null ? "n/a" : item.semanticNeighborToRandomRatio.toFixed(4),
  ].join(" | ").replace(/^/, "| ").replace(/$/, " |")),
  "",
].join("\n");
const markdownPath = output.replace(/\.json$/i, ".md");
await writeFile(markdownPath, markdown, "utf8");
console.log(JSON.stringify({ pass: true, output, markdownPath, reports }, null, 2));
