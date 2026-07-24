import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const core = await readFile("src-tauri/core/src/semantic_layout.rs", "utf8");
const schema = await readFile("src-tauri/core/src/schema.sql", "utf8");
const desktop = await readFile("src-tauri/src/lib.rs", "utf8");
const runtime = await readFile("src-tauri/src/semantic_embedding.rs", "utf8");
const canvas = await readFile("src/components/App17GalaxyCanvas.tsx", "utf8");
const app = await readFile("src/App.tsx", "utf8");
const review = await readFile("scripts/app17_visual_review.mjs", "utf8");

assert(!desktop.includes('format!("{}::x", candidate.id)'), "legacy paperId::x coordinate hash remains");
assert(!desktop.includes('format!("{}::y", candidate.id)'), "legacy paperId::y coordinate hash remains");
assert(!desktop.includes('format!("{}::z", candidate.id)'), "legacy paperId::z coordinate hash remains");
assert(schema.includes("paper_semantic_embeddings"), "semantic cache table is missing");
assert(core.includes("deterministic_component"), "deterministic PCA component solver is missing");
assert(core.includes("percentile_abs"), "robust whitening is missing");
assert(core.includes("mapped_radius"), "continuous central exclusion mapping is missing");
assert(canvas.includes("(semanticLayout ? 1 : 0.62)"), "semantic layouts must not receive legacy Z compression");
assert(
  canvas.includes("APP17_SYSTEM_PAPER_STAR_EXCLUSION_RADIUS + 0.18 * smootherStep(normalized)")
    && canvas.includes("APP17_SYSTEM_SEMANTIC_OUTLIER_RADIUS"),
  "semantic layouts must use continuous central exclusion and outlier compression",
);
assert(desktop.includes("程序不会自动建模或展示旧螺旋布局"), "legacy snapshot guidance is missing");
assert(runtime.includes("SEMANTIC_EMBEDDING_CHUNK_SIZE: usize = 256"), "256-paper cache transaction batches are missing");
assert(runtime.includes("wait_for_permission"), "semantic pause/cancel boundary is missing");
assert(desktop.includes('progress.stage = "committing"'), "safe committing stage is missing");
assert(desktop.includes("SEMANTIC_MODELING_COMMITTING"), "committing control fence is missing");
assert(app.includes("getSemanticModelingStatus"), "pipeline semantic progress polling is missing");
assert(app.includes("controlSemanticModeling"), "pipeline semantic pause/cancel controls are missing");
assert(app.includes("GPU（当前安装不可用）"), "Lite GPU capability explanation is missing");
assert(
  desktop.includes('let payload = build_v20_galaxy_payload(&conn, &project_id, "nebula")?'),
  "browser visual review must export the active V20 semantic payload",
);
assert(
  desktop.includes("query_v20_visual_review_hotspot_papers"),
  "browser visual review must load papers from active V20 memberships",
);
assert(!review.includes("cluster_paper_library"), "browser review must not trigger modeling");

console.log(JSON.stringify({
  pass: true,
  coordinateSource: "multilingual-e5-small + deterministic PCA3",
  legacyCoordinateHashes: 0,
  semanticZScale: 1,
  embeddingTransactionBatch: 256,
  safeCommitControlFence: true,
  browserReviewSource: "active-v20-semantic-snapshot",
  autoModeling: false,
}, null, 2));
