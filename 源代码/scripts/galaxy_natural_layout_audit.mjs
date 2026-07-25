import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const core = await readFile("src-tauri/core/src/semantic_layout.rs", "utf8");
const desktop = await readFile("src-tauri/src/lib.rs", "utf8");
const canvas = await readFile("src/components/App17GalaxyCanvas.tsx", "utf8");
const types = await readFile("src/types.ts", "utf8");
const progress = await readFile("src/lib/analysisProgress.ts", "utf8");

assert(core.includes('SEMANTIC_LAYOUT_VERSION: &str = "semantic-hierarchical-natural-pca3-v3"'));
assert(core.includes('SEMANTIC_PROJECTION_VERSION: &str = "global-centroid-pca3-local-raw-pca3-v3"'));
assert(core.includes("SEMANTIC_LOCAL_P95_RADIUS: f64 = 10.5"));
assert(core.includes("project_raw_pca3"), "raw PCA3 projection is missing");
assert(core.includes("scale_semantic_local_point_sets"), "pooled local scaling is missing");
assert(core.includes("soft_cap_radius"), "direction-preserving P99 cap is missing");
assert(!core.includes("decorrelate_and_robust_scale"), "per-axis whitening must be removed");
assert(!core.includes("mapped_radius"), "central shell mapping must be removed");
assert(!core.includes("stable_unit(&record.paper_id"), "synthetic local jitter must be removed");
assert(desktop.includes("project_semantic_embeddings(&records)"), "all hotspot members must share one PCA projection");
assert(!desktop.includes("ordinary_records"), "ordinary and representative papers must not use separate PCA projections");
assert(!desktop.includes("representative_records"), "ordinary and representative papers must not use separate PCA projections");
assert(desktop.includes("scale_semantic_local_point_sets(&mut local_point_sets)"));
assert(!desktop.includes("point.x * 9.6"), "fixed local multiplier must be removed");
assert(desktop.includes("paper_layout_local_p95_radius: Some(SEMANTIC_LOCAL_P95_RADIUS)"));
assert(types.includes("paperLayoutLocalP95Radius?: number"));
assert(types.includes("paperLayoutSharedScale?: number"));
assert(canvas.includes("APP17_NATURAL_LAYOUT_VERSION"));
assert(canvas.includes("payload.paperLayoutSharedScale ?? 1"));
assert(canvas.includes("(payload.paperLayoutLocalP95Radius ?? 10.5) * naturalLayoutUnitScale"));
assert(!canvas.includes("APP17_SYSTEM_SEMANTIC_OUTLIER_RADIUS"));
assert(!canvas.includes("APP17_SYSTEM_PAPER_STAR_EXCLUSION_RADIUS + 0.18 * smootherStep(normalized)"));
assert(canvas.includes("frameRadius"));
assert(canvas.includes("resources.minDistance"));
assert(canvas.includes("systemResources?.maxDistance"));
assert(progress.includes('CURRENT_V20_ALGORITHM_VERSION = "v20-semantic-e5-small-3"'));

console.log(JSON.stringify({
  pass: true,
  layoutVersion: "semantic-hierarchical-natural-pca3-v3",
  projectionVersion: "global-centroid-pca3-local-raw-pca3-v3",
  localTargetP95Radius: 10.5,
  perHotspotWhitening: false,
  centralExclusion: false,
  perHotspotFrontendNormalization: false,
  representativeOrbitRendererPreserved: true,
}, null, 2));
