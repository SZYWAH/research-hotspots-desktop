import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { selectDeterministicTheoryView } from "../src/lib/galaxyTheoryView.ts";

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--payload") {
      args.payload = argv[index + 1];
      index += 1;
    } else {
      throw new Error(`Unsupported argument: ${argv[index]}`);
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const payloadPath = resolve(args.payload || ".visual-review/app17/payload.json");
let hotspots;
let papers;
if (existsSync(payloadPath)) {
  const payload = JSON.parse(await readFile(payloadPath, "utf8"));
  hotspots = payload.hotspots.map((point) => ({
    x: point.x,
    y: point.y,
    z: point.z,
    displaySize: point.size,
    topicKey: `${point.field}::${point.topicId}`,
  }));
  papers = payload.papers.map((point) => ({
    x: point.x,
    y: point.y,
    z: point.z,
    topicKey: `${point.field}::${point.topicId}`,
  }));
} else {
  hotspots = Array.from({ length: 160 }, (_, index) => ({
    x: Math.sin(index * 0.73) * (30 + index % 17),
    y: Math.cos(index * 0.41) * (24 + index % 13),
    z: Math.sin(index * 0.19) * 18,
    displaySize: 12 + index % 15,
    topicKey: `topic-${index}`,
  }));
  papers = Array.from({ length: 4_096 }, (_, index) => {
    const hotspot = hotspots[index % hotspots.length];
    return {
      x: hotspot.x + Math.sin(index * 1.17) * 5,
      y: hotspot.y + Math.cos(index * 0.83) * 4,
      z: hotspot.z + Math.sin(index * 0.37) * 3,
      topicKey: hotspot.topicKey,
    };
  });
}

const first = selectDeterministicTheoryView(hotspots, papers, 16 / 9, 42);
const second = selectDeterministicTheoryView(hotspots, papers, 16 / 9, 42);
assert.deepEqual(second, first, "same snapshot did not produce the same view");
assert(first.selectedScore <= first.baselineScore + 1e-12, "selected score regressed");
if (first.usedOptimizedView) {
  assert(first.improvementRatio >= 0.05, "optimized view bypassed the 5% gate");
} else {
  assert(Math.abs(first.azimuth - Math.PI / 4) < 1e-12, "fallback did not preserve 45° azimuth");
  assert(Math.abs(first.elevation - 26 * Math.PI / 180) < 1e-12, "fallback did not preserve 26° elevation");
}

const source = await readFile("src/lib/galaxyTheoryView.ts", "utf8");
assert(source.includes("index < 24"), "24 azimuth candidates are missing");
assert(source.includes("[18, 26, 34, 42, 50]"), "five elevation candidates are missing");
assert(source.includes("MAX_PAPER_SCORE_SAMPLES = 2_048"), "paper scoring cap changed");
assert(source.includes("overlapPenalty * 0.4"), "overlap score weight changed");
assert(source.includes("emptyGridRatio * 0.25"), "empty-area score weight changed");
assert(source.includes("centerOffset * 0.2"), "center score weight changed");
assert(source.includes("edgeCrowding * 0.15"), "edge score weight changed");
assert(source.includes("improvementRatio >= 0.05"), "5% fallback gate is missing");

console.log(JSON.stringify({
  pass: true,
  payloadPath: existsSync(payloadPath) ? payloadPath : null,
  hotspotCount: hotspots.length,
  paperCount: papers.length,
  deterministic: true,
  selectedAzimuthDegrees: first.azimuth * 180 / Math.PI,
  selectedElevationDegrees: first.elevation * 180 / Math.PI,
  baselineScore: first.baselineScore,
  selectedScore: first.selectedScore,
  improvementRatio: first.improvementRatio,
  usedOptimizedView: first.usedOptimizedView,
  score: first.score,
}, null, 2));
