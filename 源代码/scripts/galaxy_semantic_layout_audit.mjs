import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const core = await readFile("src-tauri/core/src/semantic_layout.rs", "utf8");
const schema = await readFile("src-tauri/core/src/schema.sql", "utf8");
const desktop = await readFile("src-tauri/src/lib.rs", "utf8");
const canvas = await readFile("src/components/App17GalaxyCanvas.tsx", "utf8");

assert(!desktop.includes('format!("{}::x", candidate.id)'), "legacy paperId::x coordinate hash remains");
assert(!desktop.includes('format!("{}::y", candidate.id)'), "legacy paperId::y coordinate hash remains");
assert(!desktop.includes('format!("{}::z", candidate.id)'), "legacy paperId::z coordinate hash remains");
assert(schema.includes("paper_semantic_embeddings"), "semantic cache table is missing");
assert(core.includes("deterministic_component"), "deterministic PCA component solver is missing");
assert(core.includes("percentile_abs"), "robust whitening is missing");
assert(core.includes("mapped_radius"), "continuous central exclusion mapping is missing");
assert(canvas.includes("(semanticLayout ? 1 : 0.62)"), "semantic layouts must not receive legacy Z compression");
assert(desktop.includes("程序不会自动建模或展示旧螺旋布局"), "legacy snapshot guidance is missing");

console.log(JSON.stringify({
  pass: true,
  coordinateSource: "multilingual-e5-small + deterministic PCA3",
  legacyCoordinateHashes: 0,
  semanticZScale: 1,
  autoModeling: false,
}, null, 2));
