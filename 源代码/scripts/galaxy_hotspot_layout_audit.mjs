import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const core = await readFile("src-tauri/core/src/semantic_layout.rs", "utf8");
const schema = await readFile("src-tauri/core/src/schema.sql", "utf8");
const desktop = await readFile("src-tauri/src/lib.rs", "utf8");
const store = await readFile("src-tauri/core/src/agent_store.rs", "utf8");

assert(core.includes('SEMANTIC_LAYOUT_VERSION: &str = "semantic-hierarchical-pca3-v2"'));
assert(core.includes('SEMANTIC_PROJECTION_VERSION: &str = "centroid-pca3-robust-whiten-v2"'));
assert(core.includes("SEMANTIC_HOTSPOT_P95_RADIUS: f64 = 92.0"));
assert(core.includes("semantic_centroid_record"), "equal-weight semantic centroid is missing");
assert(core.includes("project_semantic_hotspot_centroids"), "global hotspot PCA3 is missing");
assert(core.includes("stable_semantic_hotspot_id"), "stable hotspot identity is missing");
assert(core.includes('"{project_id}:sqlite-cluster:v2:{}"'), "hotspot ID format changed");
assert(desktop.includes("semantic_hotspot_identity_key(&group.field, &group.keyword)"));
assert(desktop.includes("hotspot.coordinates.x as f64 + point.x * 9.6"), "hierarchical X composition is missing");
assert(desktop.includes("hotspot.coordinates.y as f64 + point.y * 9.6"), "hierarchical Y composition is missing");
assert(desktop.includes("hotspot.coordinates.z as f64 + point.z * 9.6"), "hierarchical Z composition is missing");
assert(desktop.includes('progress.stage = "hotspot-centroids"'));
assert(desktop.includes('progress.stage = "hotspot-pca3"'));
assert(desktop.includes('progress.stage = "hotspot-lineage"'));
assert(desktop.includes("V20_HOTSPOT_LINEAGE_UNCHANGED_LIBRARY_MISMATCH"));
assert(schema.includes("v20_hotspot_lineage"), "lineage table is missing");
assert(schema.includes("identity_key_sha256"), "stable identity key column is missing");
assert(schema.includes("hotspot_identity_version"), "snapshot identity version is missing");
assert(store.includes(".pre-schema-v13."), "schema 13 safety backup is missing");
assert(!desktop.includes('format!("{project_id}:sqlite-cluster:{index}:'), "ranked hotspot ID remains");

console.log(JSON.stringify({
  pass: true,
  algorithmVersion: "v20-semantic-e5-small-2",
  layoutVersion: "semantic-hierarchical-pca3-v2",
  projectionVersion: "centroid-pca3-robust-whiten-v2",
  identityVersion: "stable-field-key-sha256-v2",
  globalHotspotP95Radius: 92,
  localPaperScale: 9.6,
  lineage: "transactional",
}, null, 2));
