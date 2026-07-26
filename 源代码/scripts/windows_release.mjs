import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGE = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const VERSION = PACKAGE.version;
const DATABASE_FILE = "research-hotspots-v7.sqlite";
const MANIFEST_SCHEMA_VERSION = 5;
const GENERATOR_VERSION = "semantic-seed-5";
const DATABASE_DIR = process.env.RESEARCH_HOTSPOTS_RELEASE_SOURCE_DIR
  ? resolve(process.env.RESEARCH_HOTSPOTS_RELEASE_SOURCE_DIR)
  : "";
const SOURCE_DATABASE = DATABASE_DIR ? join(DATABASE_DIR, DATABASE_FILE) : "";
const SEED_DIR = join(ROOT, "release-assets", "default-library");
const SEED_DATABASE = join(SEED_DIR, DATABASE_FILE);
const SEED_MANIFEST = join(SEED_DIR, "default-library-manifest.json");
const SNAPSHOT_STATE = join(SEED_DIR, ".snapshot-source.json");
const MODEL_DIR = join(ROOT, "release-assets", "semantic-model");
const MODEL_MANIFEST = join(ROOT, "resources", "semantic-model", "semantic-model-manifest.json");
const MODEL_LICENSE = join(ROOT, "resources", "semantic-model", "LICENSE-MIT.txt");
const OUTPUT_DIR = join(ROOT, "release", "windows", VERSION);
const TARGET_RELEASE_DIR = join(ROOT, "src-tauri", "target", "release");
const NSIS_DIR = join(TARGET_RELEASE_DIR, "bundle", "nsis");
const PNPM = "pnpm";
const BUILD_TIME = new Date().toISOString();

const mode = (process.argv[2] || "all").toLowerCase();
if (!["all", "full", "lite", "snapshot"].includes(mode)) {
  fail("Usage: node scripts/windows_release.mjs [all|full|lite|snapshot]");
}

main().catch((error) => fail(error instanceof Error ? error.stack || error.message : String(error)));

async function main() {
  ensureCleanTrackedWorktree();
  assertReleaseConfiguration();
  const revision = capture("git", ["rev-parse", "HEAD"]).trim();
  if (mode === "snapshot" || mode === "full" || mode === "all") prepareSnapshot();
  if (mode === "snapshot") return;
  prepareSemanticModelResources();

  mkdirSync(OUTPUT_DIR, { recursive: true });
  removeSelectedOutputs();
  preflight(revision);
  if (mode === "full" || mode === "all") buildInstaller("full", revision);
  if (mode === "lite" || mode === "all") buildInstaller("lite", revision);
  if (mode === "all") verifyInstallerPair();
  writeReleaseNotes(revision);
  if (existsSync(SEED_MANIFEST)) copyFileSync(SEED_MANIFEST, join(OUTPUT_DIR, "default-library-manifest.json"));
  copyFileSync(MODEL_MANIFEST, join(OUTPUT_DIR, "semantic-model-manifest.json"));
  copyFileSync(MODEL_LICENSE, join(OUTPUT_DIR, "SEMANTIC_MODEL_LICENSE_MIT.txt"));
  writeBuildMetadata(revision);
  writeChecksums();
  run(PNPM, ["audit:windows-release"]);
  console.log(`\nWindows release artifacts: ${OUTPUT_DIR}`);
}

function ensureCleanTrackedWorktree() {
  const status = capture("git", ["status", "--porcelain", "--untracked-files=no"]).trim();
  if (status) fail(`Windows release requires committed, clean tracked files:\n${status}`);
}

function assertReleaseConfiguration() {
  const tauri = JSON.parse(readFileSync(join(ROOT, "src-tauri", "tauri.conf.json"), "utf8"));
  if (tauri.version !== VERSION) fail(`Version mismatch: package=${VERSION}, tauri=${tauri.version}`);
  const full = JSON.parse(readFileSync(join(ROOT, "src-tauri", "tauri.full.conf.json"), "utf8"));
  const lite = JSON.parse(readFileSync(join(ROOT, "src-tauri", "tauri.lite.conf.json"), "utf8"));
  const fullResources = full.bundle?.resources || {};
  if (!Object.keys(fullResources).some((value) => value.endsWith(DATABASE_FILE)) || !Object.keys(fullResources).some((value) => value.endsWith("default-library-manifest.json"))) {
    fail("Full bundle configuration must include the seed database and manifest.");
  }
  const fullNames = Object.values(fullResources);
  const liteResources = lite.bundle?.resources || {};
  const liteNames = Object.values(liteResources);
  if (!fullNames.some((value) => value.endsWith("semantic-model/model.cpu-portable.onnx")) || !fullNames.some((value) => value.endsWith("semantic-model/model.gpu.onnx"))) {
    fail("Full bundle must include portable CPU and DirectML semantic models.");
  }
  if (!liteNames.some((value) => value.endsWith("semantic-model/model.cpu-portable.onnx")) || liteNames.some((value) => value.endsWith("semantic-model/model.gpu.onnx"))) {
    fail("Lite bundle must include only the portable CPU semantic model.");
  }
  if (Object.keys(liteResources).some((value) => value.endsWith(DATABASE_FILE) || value.endsWith("default-library-manifest.json"))) {
    fail("Lite bundle must not include the default database.");
  }
}

function prepareSnapshot() {
  if (!DATABASE_DIR) fail("Set RESEARCH_HOTSPOTS_RELEASE_SOURCE_DIR to an isolated schema 13 semantic library directory.");
  const activeLibraryDir = resolve(ROOT, "data", "library").toLocaleLowerCase("en-US");
  if (DATABASE_DIR.toLocaleLowerCase("en-US") === activeLibraryDir) {
    fail("RESEARCH_HOTSPOTS_RELEASE_SOURCE_DIR must be an isolated copy, not data/library.");
  }
  if (!existsSync(SOURCE_DATABASE)) fail(`Default source database not found: ${SOURCE_DATABASE}`);
  mkdirSync(SEED_DIR, { recursive: true });
  const source = statSync(SOURCE_DATABASE);
  const db = new DatabaseSync(SOURCE_DATABASE, { readOnly: true });
  const state = db.prepare(
    "SELECT state.active_snapshot_id AS snapshotId,snapshot.algorithm_version AS algorithmVersion,"
    + "snapshot.layout_version AS layoutVersion,snapshot.projection_version AS projectionVersion,"
    + "snapshot.embedding_model_id AS embeddingModelId,snapshot.embedding_model_revision AS embeddingModelRevision,"
    + "snapshot.hotspot_identity_version AS hotspotIdentityVersion "
    + "FROM v20_analysis_state state JOIN v20_analysis_snapshots snapshot ON snapshot.id=state.active_snapshot_id "
    + "WHERE state.project_id = ?",
  ).get("project-default");
  db.close();
  if (!state?.snapshotId) fail("Default source database has no active V20 snapshot for project-default.");
  const modelManifest = JSON.parse(readFileSync(MODEL_MANIFEST, "utf8"));
  const expected = {
    sourcePath: SOURCE_DATABASE,
    sourceSize: source.size,
    sourceMtimeMs: Math.trunc(source.mtimeMs),
    appVersion: VERSION,
    manifestSchemaVersion: MANIFEST_SCHEMA_VERSION,
    generatorVersion: GENERATOR_VERSION,
    snapshotId: state.snapshotId,
    algorithmVersion: state.algorithmVersion,
    layoutVersion: state.layoutVersion,
    projectionVersion: state.projectionVersion,
    embeddingModelId: state.embeddingModelId,
    embeddingModelRevision: state.embeddingModelRevision,
    hotspotIdentityVersion: state.hotspotIdentityVersion,
    modelId: modelManifest.modelId,
    modelRevision: modelManifest.revision,
  };
  if (cachedSnapshotIsValid(expected)) {
    console.log(`Default V20 snapshot ${state.snapshotId} is current; skipping export.`);
    return;
  }

  run("cargo", [
    "run", "--manifest-path", "src-tauri/Cargo.toml", "--features", "dev-tools",
    "--bin", "prepare_default_library", "--",
    "--database-dir", DATABASE_DIR,
    "--output-dir", SEED_DIR,
    "--data-version", "v20-semantic-default-2026-07-24",
    "--project-id", "project-default",
  ]);
  const manifest = JSON.parse(readFileSync(SEED_MANIFEST, "utf8"));
  if (manifest.snapshotId !== state.snapshotId) fail("Generated seed snapshot changed while export was running; refusing release.");
  writeFileSync(SNAPSHOT_STATE, `${JSON.stringify(expected, null, 2)}\n`, "utf8");
}

function cachedSnapshotIsValid(expected) {
  if (!existsSync(SEED_DATABASE) || !existsSync(SEED_MANIFEST) || !existsSync(SNAPSHOT_STATE)) return false;
  try {
    const current = JSON.parse(readFileSync(SNAPSHOT_STATE, "utf8"));
    const manifest = JSON.parse(readFileSync(SEED_MANIFEST, "utf8"));
    if (JSON.stringify(current) !== JSON.stringify(expected)) return false;
    if (manifest.manifestSchemaVersion !== MANIFEST_SCHEMA_VERSION || manifest.generatorVersion !== GENERATOR_VERSION || manifest.appVersion !== VERSION || manifest.snapshotId !== expected.snapshotId) return false;
    const seed = statSync(SEED_DATABASE);
    if (seed.size !== manifest.sizeBytes || sha256(SEED_DATABASE) !== manifest.sha256) return false;
    const db = new DatabaseSync(SEED_DATABASE, { readOnly: true });
    const counts = db.prepare(`SELECT
      (SELECT COUNT(*) FROM papers WHERE project_id = ?) AS papers,
      (SELECT COUNT(*) FROM v20_hotspots WHERE project_id = ? AND snapshot_id = ?) AS hotspots,
      (SELECT COUNT(*) FROM v20_paper_memberships WHERE project_id = ? AND snapshot_id = ?) AS memberships,
      (SELECT COUNT(*) FROM paper_semantic_embeddings WHERE project_id = ? AND model_id = ? AND model_revision = ?) AS embeddings`).get(
        manifest.projectId, manifest.projectId, manifest.snapshotId, manifest.projectId, manifest.snapshotId,
        manifest.projectId, manifest.embeddingModelId, manifest.embeddingModelRevision,
      );
    db.close();
    return counts.papers === manifest.paperCount && counts.hotspots === manifest.hotspotCount
      && counts.memberships === manifest.membershipCount && counts.embeddings === manifest.embeddingCount;
  } catch {
    return false;
  }
}

function prepareSemanticModelResources() {
  run(PNPM, ["prepare:semantic-model"]);
  run(PNPM, ["prepare:semantic-model", "--", "--gpu"]);
  for (const name of [
    "model.cpu-portable.onnx", "model.gpu.onnx", "tokenizer.json", "config.json",
    "special_tokens_map.json", "tokenizer_config.json", "semantic-model-manifest.json", "LICENSE-MIT.txt",
  ]) {
    if (!existsSync(join(MODEL_DIR, name))) fail(`Semantic model resource missing: ${name}`);
  }
}

function preflight(revision) {
  removeDevelopmentBinaries();
  run(PNPM, ["audit:v20-cache"]);
  run(PNPM, ["audit:backup-restore"]);
  run(PNPM, ["audit:hotspot-library"]);
  run(PNPM, ["visual:galaxy:paper-audit"]);
  run(PNPM, ["audit:agent-ui"]);
  run(PNPM, ["audit:agent-persistence"]);
  run(PNPM, ["audit:agent-executor"]);
  run(PNPM, ["audit:agent-model-gateway"]);
  run(PNPM, ["audit:agent-capabilities"]);
  run(PNPM, ["audit:agent-long-tasks"]);
  run(PNPM, ["audit:agent-quality"]);
  run(PNPM, ["audit:agent-atomicity"]);
  run(PNPM, ["audit:agent-release-security"]);
  run(PNPM, ["audit:agent-migrations"]);
  run(PNPM, ["audit:agent-desktop-acceptance"]);
  run(PNPM, ["audit:semantic-model-packaging"]);
  run(PNPM, ["audit:galaxy-semantic-seed"]);
  run(PNPM, ["audit:windows-release"]);
  run(PNPM, ["build"], revision);
  run("cargo", ["check", "--workspace", "--manifest-path", "src-tauri/Cargo.toml"]);
  run("cargo", ["test", "-p", "research-hotspots-core", "--manifest-path", "src-tauri/Cargo.toml"]);
  run("cargo", ["test", "--workspace", "--no-run", "--manifest-path", "src-tauri/Cargo.toml"]);
}

function removeDevelopmentBinaries() {
  for (const name of ["audit_library.exe", "audit_agent_performance.exe", "audit_semantic_embedding_runtime.exe", "audit_galaxy_semantic_layout.exe", "export_app17_visual_review.exe", "export_hotspot_evidence.exe", "export_star_map.exe", "import_library.exe", "prepare_default_library.exe", "rebuild_semantic_galaxy_snapshot.exe"]) {
    const path = join(TARGET_RELEASE_DIR, name);
    if (existsSync(path)) rmSync(path, { force: true });
  }
}

function buildInstaller(flavor, revision) {
  if (flavor === "full" && (!existsSync(SEED_DATABASE) || !existsSync(SEED_MANIFEST))) fail("Full installer requires the generated default-library snapshot.");
  if (!NSIS_DIR.startsWith(TARGET_RELEASE_DIR)) fail("Refusing to clean unexpected NSIS path.");
  rmSync(NSIS_DIR, { recursive: true, force: true });
  const config = `src-tauri/tauri.${flavor}.conf.json`;
  run(PNPM, ["tauri", "build", "--bundles", "nsis", "--config", config, "--no-sign"], revision);
  const candidates = existsSync(NSIS_DIR)
    ? readdirSync(NSIS_DIR).filter((name) => name.toLowerCase().endsWith(".exe")).map((name) => join(NSIS_DIR, name))
    : [];
  if (candidates.length !== 1) fail(`Expected exactly one fresh NSIS installer for ${flavor}, found ${candidates.length}.`);
  const destination = installerPath(flavor);
  copyFileSync(candidates[0], destination);
  console.log(`Collected ${flavor} installer: ${relative(ROOT, destination)}`);
}

function verifyInstallerPair() {
  const full = installerPath("full");
  const lite = installerPath("lite");
  if (!existsSync(full) || !existsSync(lite)) fail("Full/Lite installer pair is incomplete.");
  if (sha256(full) === sha256(lite)) fail("Full and Lite installers unexpectedly have the same SHA-256.");
  const gpuBytes = statSync(join(MODEL_DIR, "model.gpu.onnx")).size;
  if (statSync(full).size <= statSync(lite).size + (statSync(SEED_DATABASE).size + gpuBytes) / 25) fail("Full installer is not materially larger than Lite; seed or GPU resource may be missing.");
}

function removeSelectedOutputs() {
  const flavors = mode === "all" ? ["full", "lite"] : [mode];
  for (const flavor of flavors) {
    const path = installerPath(flavor);
    if (existsSync(path)) rmSync(path, { force: true });
  }
  for (const name of ["RELEASE_NOTES_zh-CN.md", "RELEASE_NOTES_en-US.md", "BUILD_METADATA.json", "SHA256SUMS.txt", "default-library-manifest.json", "semantic-model-manifest.json", "SEMANTIC_MODEL_LICENSE_MIT.txt"]) {
    const path = join(OUTPUT_DIR, name);
    if (existsSync(path)) rmSync(path, { force: true });
  }
}

function installerPath(flavor) {
  return join(OUTPUT_DIR, `Research-Hotspots-Desktop_${VERSION}_x64-${flavor}-setup.exe`);
}

function writeReleaseNotes(revision) {
  const manifest = existsSync(SEED_MANIFEST) ? JSON.parse(readFileSync(SEED_MANIFEST, "utf8")) : undefined;
  const snapshotZh = manifest ? `Full 默认库快照：${manifest.snapshotId}，${manifest.paperCount.toLocaleString("zh-CN")} 篇论文、${manifest.hotspotCount} 个热点、${manifest.membershipCount.toLocaleString("zh-CN")} 条归属。\n` : "";
  const snapshotEn = manifest ? `Full seed snapshot: ${manifest.snapshotId}; ${manifest.paperCount.toLocaleString("en-US")} papers, ${manifest.hotspotCount} hotspots, and ${manifest.membershipCount.toLocaleString("en-US")} memberships.\n` : "";
  const zh = `# Research Hotspots Desktop ${VERSION}\n\n这是未签名的 Windows x64 Beta 预发布版，构建提交 ${revision}.\n\n${snapshotZh}\n## 主要内容\n\n- 科研星图热点改为成员论文语义中心与全局 PCA3 三维布局，普通论文继续使用热点内语义三维云。\n- 理论星图相机按场景边界动态构图，并在远景连续降低点尺寸与光晕，避免聚成模糊光团。\n- 保留星空闪烁、远景热点、普通论文呼吸、代表论文能量核心与论文相机旅程。\n- 语义建模支持缓存、分批进度、暂停、取消、稳定热点身份、血缘与安全原子切换。\n- 本版本不包含在线学术来源或校园图书馆连接器。\n\n## 安装包区别\n\n- **Full**：包含 schema 13 语义默认库、便携 CPU 模型和 DirectML GPU 模型。\n- **Lite**：不含论文数据，包含便携 CPU 模型，可创建空库后显式运行建模。\n- 两个版本均不会因页面导航自动运行热点建模。\n\n## 安装提示\n\n- 安装器支持简体中文和英文。\n- 缺少 Microsoft Edge WebView2 Runtime 时，安装过程需要联网下载。\n- 当前版本未代码签名，Windows SmartScreen 可能拦截；请先核对 SHA-256。\n- 用户库升级到 schema 13 前会创建迁移安全副本；首次启动禁止覆盖已有数据库。\n- 语义模型基于 intfloat/multilingual-e5-small，按 MIT 许可分发。\n- 升级、重装和卸载不会删除用户选择的数据库目录或 Windows Credential Manager 凭据。\n`;
  const en = `# Research Hotspots Desktop ${VERSION}\n\nThis is an unsigned Windows x64 beta prerelease built from commit ${revision}.\n\n${snapshotEn}\n## Highlights\n\n- Hotspots now use member-paper semantic centroids and global PCA3 placement, while ordinary papers retain their local semantic 3D clouds.\n- The theory-map camera derives framing from scene bounds and continuously reduces distant point and halo energy to prevent a blurred light cluster.\n- Background twinkle, distant hotspots, ordinary-paper breathing, representative energy cores, and the paper camera journey are preserved.\n- Semantic modeling provides cached batches, progress, pause/cancel controls, stable hotspot identity, lineage, and an atomic snapshot switch.\n- Online academic sources and campus-library connectors are not included.\n\n## Packages\n\n- **Full** embeds the schema 13 semantic seed plus portable CPU and DirectML GPU models.\n- **Lite** embeds no paper data but includes the portable CPU model for explicit local modeling.\n- Neither edition starts modeling automatically during navigation.\n\n## Installation notes\n\n- The installer supports English and Simplified Chinese.\n- If Microsoft Edge WebView2 Runtime is missing, setup needs internet access to download it.\n- This build is not code-signed, so Windows SmartScreen may warn. Verify SHA-256 before continuing.\n- A safety backup is created before migrating user libraries to schema 13.\n- The intfloat/multilingual-e5-small model is distributed under the MIT License.\n- Upgrade, reinstall, and uninstall do not delete the selected database directory or Windows Credential Manager credentials.\n`;
  writeFileSync(join(OUTPUT_DIR, "RELEASE_NOTES_zh-CN.md"), zh, "utf8");
  writeFileSync(join(OUTPUT_DIR, "RELEASE_NOTES_en-US.md"), en, "utf8");
}

function writeBuildMetadata(revision) {
  const manifest = existsSync(SEED_MANIFEST) ? JSON.parse(readFileSync(SEED_MANIFEST, "utf8")) : undefined;
  const semanticModel = JSON.parse(readFileSync(MODEL_MANIFEST, "utf8"));
  writeFileSync(join(OUTPUT_DIR, "BUILD_METADATA.json"), `${JSON.stringify({
    appVersion: VERSION,
    revision,
    buildTime: BUILD_TIME,
    defaultSnapshotId: manifest?.snapshotId ?? null,
    defaultLibrarySchema: manifest?.databaseSchemaVersion ?? null,
    semanticModelId: semanticModel.modelId,
    semanticModelRevision: semanticModel.revision,
    fullResources: ["default-library", "semantic-cpu-portable", "semantic-directml"],
    liteResources: ["semantic-cpu-portable"],
  }, null, 2)}\n`, "utf8");
}

function writeChecksums() {
  const names = readdirSync(OUTPUT_DIR).filter((name) => name !== "SHA256SUMS.txt").sort();
  writeFileSync(join(OUTPUT_DIR, "SHA256SUMS.txt"), `${names.map((name) => `${sha256(join(OUTPUT_DIR, name))}  ${name}`).join("\n")}\n`, "utf8");
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function run(command, args, revision) {
  console.log(`\n> ${command} ${args.map(quote).join(" ")}`);
  const result = spawnSync(command, args, {
    cwd: ROOT, stdio: "inherit", windowsHide: true, shell: process.platform === "win32",
    env: { ...process.env, VITE_BUILD_REVISION: revision || process.env.VITE_BUILD_REVISION || "release-preflight", RELEASE_BUILD_TIME: BUILD_TIME },
  });
  if (result.error) fail(result.error.message);
  if (result.status !== 0) fail(`${command} exited with code ${result.status}`);
}

function capture(command, args) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: "utf8", windowsHide: true, shell: process.platform === "win32" });
  if (result.error) fail(result.error.message);
  if (result.status !== 0) fail(`${command} exited with code ${result.status}: ${result.stderr || result.stdout}`);
  return result.stdout;
}

function quote(value) { return /\s/.test(value) ? `"${value}"` : value; }
function fail(message) { console.error(message); process.exit(1); }
