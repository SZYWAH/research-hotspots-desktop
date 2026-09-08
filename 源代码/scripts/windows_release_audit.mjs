import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = json("package.json");
const version = pkg.version;
const tauri = json("src-tauri/tauri.conf.json");
const full = json("src-tauri/tauri.full.conf.json");
const demoFull = json("src-tauri/tauri.demo-full.conf.json");
const lite = json("src-tauri/tauri.lite.conf.json");
const installSmoke = text("scripts/windows_install_smoke.ps1");
const releaseSource = text("scripts/windows_release.mjs");
const demoStageDir = join(ROOT, "release-assets", "demo-staging", "default-library");
const demoSourceDir = join(ROOT, "release-assets", "demo-source", "default-library");
const seedDir = process.env.SIDERA_RELEASE_MODE === "demo-full"
  ? (existsSync(join(demoStageDir, "default-library-manifest.json")) ? demoStageDir : demoSourceDir)
  : join(ROOT, "release-assets", "default-library");
const seedPath = join(seedDir, "research-hotspots-v7.sqlite");
const manifestPath = join(seedDir, "default-library-manifest.json");
const semanticManifestPath = join(ROOT, "resources", "semantic-model", "semantic-model-manifest.json");
const modelDir = join(ROOT, "release-assets", "semantic-model");
const ocrManifestPath = join(ROOT, "release-assets", "ocr-model", "ocr-model-manifest.json");
const ocrLicensePath = join(ROOT, "resources", "ocr-model", "LICENSE-APACHE-2.0.txt");
const outputRoot = process.env.SIDERA_RELEASE_OUTPUT_DIR
  ? resolve(process.env.SIDERA_RELEASE_OUTPUT_DIR)
  : join(ROOT, "release", "windows");
const outputDir = join(outputRoot, version);
const expected = { papers: 25463, hotspots: 160, memberships: 25463 };

assert(version === "0.22.0-beta.4", `unexpected package version ${version}`);
assert(tauri.version === version, "Tauri/package version mismatch");
for (const path of ["src-tauri/Cargo.toml", "src-tauri/core/Cargo.toml"]) {
  assert(new RegExp(`^version = "${escapeRegExp(version)}"$`, "m").test(text(path)), `${path} version mismatch`);
}
const lock = text("src-tauri/Cargo.lock");
assert((lock.match(new RegExp(`version = "${escapeRegExp(version)}"`, "g")) || []).length >= 2, "Cargo.lock does not contain both v0.22 workspace packages");
assert(text(".gitignore").split(/\r?\n/).includes("data/library/"), "data/library must stay ignored");
assert(/autobins\s*=\s*false/.test(text("src-tauri/Cargo.toml")), "Cargo autobins must be disabled for release");
assert(/name\s*=\s*"prepare_default_library"[\s\S]*?required-features\s*=\s*\["dev-tools"\]/.test(text("src-tauri/Cargo.toml")), "default library generator must require dev-tools");
assert(releaseSource.includes("RESEARCH_HOTSPOTS_RELEASE_SOURCE_DIR"), "release source must be explicit");
assert(releaseSource.includes("must be an isolated copy, not data/library"), "release script must reject the active data/library directory");
assert(releaseSource.includes('mode === "demo-full"') && releaseSource.includes("prepareDemoSnapshot"), "internal demo-full route is missing");

const fullResources = full.bundle?.resources || {};
const demoFullResources = demoFull.bundle?.resources || {};
const liteResources = lite.bundle?.resources || {};
assert(Object.keys(fullResources).some((value) => value.endsWith("research-hotspots-v7.sqlite")), "Full config omits seed database");
assert(Object.keys(fullResources).some((value) => value.endsWith("default-library-manifest.json")), "Full config omits seed manifest");
assert(Object.values(fullResources).includes("semantic-model/model.cpu-portable.onnx"), "Full config omits CPU semantic model");
assert(Object.values(fullResources).includes("semantic-model/model.gpu.onnx"), "Full config omits GPU semantic model");
assert(Object.values(fullResources).includes("ocr-model/det/inference.onnx"), "Full config omits OCR detector");
assert(Object.values(fullResources).includes("ocr-model/rec/inference.onnx"), "Full config omits OCR recognizer");
assert(Object.values(fullResources).includes("ocr-model/ocr-model-manifest.json"), "Full config omits OCR manifest");
assert(Object.keys(demoFullResources).some((value) => value.endsWith("demo-staging/default-library/default-library-manifest.json")), "Demo Full config omits stamped seed manifest");
assert(Object.values(demoFullResources).includes("ocr-model/ocr-model-manifest.json"), "Demo Full config omits OCR manifest");
assert(Object.values(liteResources).includes("semantic-model/model.cpu-portable.onnx"), "Lite config omits CPU semantic model");
assert(!Object.values(liteResources).includes("semantic-model/model.gpu.onnx"), "Lite config must not contain GPU semantic model");
assert(!Object.keys(liteResources).some((value) => /default-library|research-hotspots-v7\.sqlite/.test(value)), "Lite config must not contain a default library");
assert(!Object.values(liteResources).some((value) => value.startsWith("ocr-model/")), "Lite config must not contain OCR resources");
assert(/\$PreviousVersion\s*=\s*'0\.22\.0-beta\.3'/.test(installSmoke), "install smoke previous version mismatch");
assert(/\$CurrentVersion\s*=\s*'0\.22\.0-beta\.4'/.test(installSmoke), "install smoke current version mismatch");
assert(/databaseSchemaVersion\s+-eq\s+13/.test(installSmoke), "install smoke must require schema 13");
assert(!/0\.21\.0-beta\.1|\$(?:Beta1|Beta2|FullBeta1|FullBeta2|LiteBeta2)\b|databaseSchemaVersion\s+-eq\s+(?:8|11|12)/.test(installSmoke), "legacy beta variables, versions, or schema assertions remain in install smoke");
assert(/src-tauri\\target\\windows-install-smoke/.test(installSmoke), "install smoke work root must stay under src-tauri target");
assert(!/验收安装|data\\library/.test(installSmoke), "install smoke must not reference user acceptance directories or the active library");
assert(/ExternalDatabase must stay inside WorkRoot/.test(installSmoke), "install smoke must fence its isolated database to WorkRoot");
assert(/FinalInstallDir must stay inside WorkRoot/.test(installSmoke), "install smoke must fence its final installation to WorkRoot");
assert(/refusing to modify a user installation/.test(installSmoke), "install smoke must refuse a same-product installation outside WorkRoot");
assert(/release-assets\\default-library\\research-hotspots-v7\.sqlite/.test(installSmoke), "install smoke isolated database seed is missing");
assert(/Copy-Item\s+-LiteralPath\s+\$SeedDatabase\s+-Destination\s+\$ExternalDatabase/.test(installSmoke), "install smoke must copy the seed into its isolated database");
assert(/Invoke-Installer\s+\$CurrentLiteInstaller\s+\$IsolatedInstallDir/.test(installSmoke), "install smoke must validate the current Lite installer");
assert(/Invoke-Installer\s+\$CurrentFullInstaller\s+\$FinalInstallDir/.test(installSmoke), "install smoke must finish with the current Full installer");

assert(existsSync(seedPath) && existsSync(manifestPath), "V20 default seed and manifest must be generated before audit");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
assert(manifest.manifestSchemaVersion === 5, "manifest schema must be v5");
assert(manifest.generatorVersion === "semantic-seed-5", "manifest generator version mismatch");
assert(manifest.databaseSchemaVersion === 13, "seed database schema must be 13");
assert(Number.isInteger(manifest.libraryRevision) && manifest.libraryRevision >= 0, "seed library revision is missing");
assert(["0.22.0-beta.2", version].includes(manifest.appVersion), "historical seed app version is not compatible with beta.3 demo stamping");
assert(manifest.databaseFile === "research-hotspots-v7.sqlite", "compatible seed filename changed");
assert(manifest.projectId === "project-default" && typeof manifest.snapshotId === "string" && manifest.snapshotId.length > 0, "manifest V20 identity is missing");
assert(manifest.paperCount === expected.papers && manifest.hotspotCount === expected.hotspots && manifest.membershipCount === expected.memberships, "manifest V20 counts mismatch");
assert(manifest.algorithmVersion === "v20-semantic-e5-small-2", "semantic algorithm mismatch");
assert(manifest.paperLayoutVersion === "semantic-hierarchical-pca3-v2", "semantic layout mismatch");
assert(manifest.projectionVersion === "centroid-pca3-robust-whiten-v2", "semantic projection mismatch");
assert(manifest.hotspotIdentityVersion === "stable-field-key-sha256-v2", "hotspot identity version mismatch");
assert(manifest.embeddingModelId === "intfloat/multilingual-e5-small" && typeof manifest.embeddingModelRevision === "string", "semantic model identity mismatch");
assert(manifest.embeddingDimensions === 384 && manifest.embeddingEncoding === "float16-le", "semantic embedding format mismatch");
assert(manifest.embeddingCount === expected.papers, "semantic embedding count mismatch");
assert(statSync(seedPath).size === manifest.sizeBytes, "seed file size does not match manifest");
assert(sha256(seedPath) === manifest.sha256, "seed SHA-256 does not match manifest");

const db = new DatabaseSync(seedPath, { readOnly: true });
const scalar = (sql, ...params) => Object.values(db.prepare(sql).get(...params))[0];
assert(scalar("PRAGMA user_version") === 13, "seed PRAGMA user_version is not 13");
assert(String(scalar("PRAGMA integrity_check")).toLowerCase() === "ok", "seed integrity_check failed");
assert(!db.prepare("PRAGMA foreign_key_check").get(), "seed foreign_key_check failed");
const active = db.prepare("SELECT active_snapshot_id AS snapshotId FROM v20_analysis_state WHERE project_id = ?").get(manifest.projectId);
assert(active?.snapshotId === manifest.snapshotId, "seed active snapshot does not match manifest");
assert(scalar("SELECT COUNT(*) FROM papers WHERE project_id = ?", manifest.projectId) === expected.papers, "seed paper count mismatch");
assert(scalar("SELECT COUNT(*) FROM v20_analysis_snapshots") === 1, "seed must contain exactly one V20 snapshot");
assert(scalar("SELECT COUNT(*) FROM v20_hotspots WHERE project_id = ? AND snapshot_id = ?", manifest.projectId, manifest.snapshotId) === expected.hotspots, "seed hotspot count mismatch");
assert(scalar("SELECT COUNT(*) FROM v20_paper_memberships WHERE project_id = ? AND snapshot_id = ?", manifest.projectId, manifest.snapshotId) === expected.memberships, "seed membership count mismatch");
assert(scalar("SELECT COUNT(*) FROM paper_semantic_embeddings WHERE project_id=? AND model_id=? AND model_revision=? AND dimensions=? AND encoding='float16-le'", manifest.projectId, manifest.embeddingModelId, manifest.embeddingModelRevision, manifest.embeddingDimensions) === expected.papers, "seed semantic embedding count mismatch");
for (const table of ["app17_hotspots", "app17_paper_topics", "app17_hotspot_reviews"]) {
  const present = scalar("SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name=?)", table);
  if (present) assert(scalar(`SELECT COUNT(*) FROM ${table}`) === 0, `${table} legacy rows leaked into seed`);
}
for (const table of ["agent_runs", "agent_artifacts", "agent_operations", "agent_model_calls", "agent_resource_grants", "agent_tool_receipts", "agent_meta", "library_operation_leases"]) {
  assert(scalar(`SELECT COUNT(*) FROM ${table}`) === 0, `${table} runtime rows leaked into seed`);
}
db.close();

assert(existsSync(semanticManifestPath), "semantic model manifest is missing");
const semanticManifest = JSON.parse(readFileSync(semanticManifestPath, "utf8"));
for (const key of ["cpuPortable", "gpu", "tokenizer", "config", "specialTokens", "tokenizerConfig"]) {
  const file = semanticManifest.files[key];
  const path = join(modelDir, file.target);
  assert(existsSync(path), `${key} model resource is missing`);
  assert(statSync(path).size === file.size && sha256(path) === file.sha256, `${key} model resource failed verification`);
}

assert(existsSync(ocrManifestPath) && existsSync(ocrLicensePath), "OCR manifest or Apache-2.0 license is missing");
const ocrManifest = JSON.parse(readFileSync(ocrManifestPath, "utf8"));
assert(ocrManifest.modelId === "PP-OCRv5-mobile-det-rec", "OCR model identity mismatch");
assert(ocrManifest.runtime?.executionProvider === "CPU" && ocrManifest.runtime?.intraOpThreads === 2 && ocrManifest.runtime?.directML === false, "OCR runtime policy mismatch");
assert(Array.isArray(ocrManifest.files) && ocrManifest.files.length === 4, "OCR manifest file set mismatch");
for (const file of ocrManifest.files) {
  const path = join(ROOT, "release-assets", "ocr-model", file.path);
  assert(existsSync(path), `OCR resource is missing: ${file.path}`);
  assert(statSync(path).size === file.bytes && sha256(path) === file.sha256, `OCR resource failed verification: ${file.path}`);
}

const fullInstaller = join(outputDir, `Research-Hotspots-Desktop_${version}_x64-full-setup.exe`);
const liteInstaller = join(outputDir, `Research-Hotspots-Desktop_${version}_x64-lite-setup.exe`);
if (existsSync(fullInstaller) || existsSync(liteInstaller)) {
  if (existsSync(fullInstaller) && existsSync(liteInstaller)) {
    assert(sha256(fullInstaller) !== sha256(liteInstaller), "Full/Lite installers are identical");
    assert(statSync(fullInstaller).size > statSync(liteInstaller).size + manifest.sizeBytes / 20, "Full installer is not materially larger than Lite");
  }
  const sumsPath = join(outputDir, "SHA256SUMS.txt");
  assert(existsSync(sumsPath), "SHA256SUMS.txt missing");
  const sums = readFileSync(sumsPath, "utf8");
  const releaseFiles = [
    fullInstaller,
    liteInstaller,
    join(outputDir, "RELEASE_NOTES_zh-CN.md"),
    join(outputDir, "RELEASE_NOTES_en-US.md"),
    join(outputDir, "default-library-manifest.json"),
    join(outputDir, "semantic-model-manifest.json"),
    join(outputDir, "ocr-model-manifest.json"),
    join(outputDir, "SEMANTIC_MODEL_LICENSE_MIT.txt"),
    join(outputDir, "OCR_MODEL_LICENSE_APACHE_2_0.txt"),
    join(outputDir, "BUILD_METADATA.json"),
  ];
  for (const file of releaseFiles.filter(existsSync)) {
    const name = file.split(/[\\/]/).at(-1);
    assert(sums.includes(`${sha256(file)}  ${name}`), `checksum entry missing for ${name}`);
  }
  const metadata = JSON.parse(readFileSync(join(outputDir, "BUILD_METADATA.json"), "utf8"));
  assert(metadata.appVersion === version && metadata.defaultLibrarySchema === 13, "build metadata version/schema mismatch");
  assert(metadata.defaultSnapshotId === manifest.snapshotId, "build metadata snapshot mismatch");
  assert(metadata.semanticModelId === manifest.embeddingModelId && metadata.semanticModelRevision === manifest.embeddingModelRevision, "build metadata semantic model mismatch");
  if (existsSync(fullInstaller) && !existsSync(liteInstaller)) {
    const packagedManifest = JSON.parse(readFileSync(join(outputDir, "default-library-manifest.json"), "utf8"));
    assert(metadata.artifactKind === "internal-demo" && metadata.sourceDirty === false, "Full-only artifact must be an exact internal demo build");
    assert(packagedManifest.appVersion === version && packagedManifest.sha256 === manifest.sha256, "packaged demo seed metadata mismatch");
    assert(metadata.ocrModelId === ocrManifest.modelId && metadata.ocrModelRevision === ocrManifest.modelRevision, "build metadata OCR identity mismatch");
  }
}

console.log(JSON.stringify({ ok: true, version, snapshotId: manifest.snapshotId, ...expected, seedBytes: manifest.sizeBytes, installersPresent: existsSync(fullInstaller) && existsSync(liteInstaller) }));

function json(path) { return JSON.parse(text(path)); }
function text(path) { return readFileSync(join(ROOT, path), "utf8"); }
function sha256(path) { return createHash("sha256").update(readFileSync(path)).digest("hex"); }
function assert(condition, message) { if (!condition) throw new Error(`windows release audit failed: ${message}`); }
function escapeRegExp(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
