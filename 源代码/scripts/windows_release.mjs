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
const DEMO_SOURCE_DIR = join(ROOT, "release-assets", "demo-source", "default-library");
const DEMO_SOURCE_DATABASE = join(DEMO_SOURCE_DIR, DATABASE_FILE);
const DEMO_SOURCE_MANIFEST = join(DEMO_SOURCE_DIR, "default-library-manifest.json");
const DEMO_STAGE_DIR = join(ROOT, "release-assets", "demo-staging", "default-library");
const DEMO_SEED_DATABASE = join(DEMO_STAGE_DIR, DATABASE_FILE);
const DEMO_SEED_MANIFEST = join(DEMO_STAGE_DIR, "default-library-manifest.json");
const SNAPSHOT_STATE = join(SEED_DIR, ".snapshot-source.json");
const MODEL_DIR = join(ROOT, "release-assets", "semantic-model");
const MODEL_MANIFEST = join(ROOT, "resources", "semantic-model", "semantic-model-manifest.json");
const MODEL_LICENSE = join(ROOT, "resources", "semantic-model", "LICENSE-MIT.txt");
const OCR_DIR = join(ROOT, "release-assets", "ocr-model");
const OCR_MANIFEST = join(OCR_DIR, "ocr-model-manifest.json");
const OCR_LICENSE = join(ROOT, "resources", "ocr-model", "LICENSE-APACHE-2.0.txt");
const OUTPUT_ROOT = process.env.SIDERA_RELEASE_OUTPUT_DIR
  ? resolve(process.env.SIDERA_RELEASE_OUTPUT_DIR)
  : join(ROOT, "release", "windows");
const OUTPUT_DIR = join(OUTPUT_ROOT, VERSION);
const TARGET_DIR = process.env.CARGO_TARGET_DIR
  ? resolve(process.env.CARGO_TARGET_DIR)
  : join(ROOT, "src-tauri", "target");
const TARGET_RELEASE_DIR = join(TARGET_DIR, "release");
const NSIS_DIR = join(TARGET_RELEASE_DIR, "bundle", "nsis");
const PNPM = "pnpm";
const BUILD_TIME = new Date().toISOString();

const mode = (process.argv[2] || "all").toLowerCase();
const isDemoFull = mode === "demo-full";
if (!["all", "full", "lite", "snapshot", "demo-full"].includes(mode)) {
  fail("Usage: node scripts/windows_release.mjs [all|full|lite|snapshot|demo-full]");
}

main().catch((error) => fail(error instanceof Error ? error.stack || error.message : String(error)));

async function main() {
  ensureCleanTrackedWorktree();
  assertReleaseConfiguration();
  const revision = capture("git", ["rev-parse", "HEAD"]).trim();
  if (isDemoFull) prepareDemoSnapshot();
  else if (mode === "snapshot" || mode === "full" || mode === "all") prepareSnapshot();
  if (mode === "snapshot") return;
  if (isDemoFull) verifySemanticModelResources();
  else prepareSemanticModelResources();
  if (isDemoFull || mode === "full" || mode === "all") verifyOcrModelResources();

  mkdirSync(OUTPUT_DIR, { recursive: true });
  removeSelectedOutputs();
  preflight(revision);
  if (isDemoFull) buildInstaller("full", revision, "src-tauri/tauri.demo-full.conf.json");
  else if (mode === "full" || mode === "all") buildInstaller("full", revision);
  if (mode === "lite" || mode === "all") buildInstaller("lite", revision);
  if (mode === "all") verifyInstallerPair();
  writeReleaseNotes(revision);
  const packagedSeedManifest = isDemoFull ? DEMO_SEED_MANIFEST : SEED_MANIFEST;
  if (existsSync(packagedSeedManifest)) copyFileSync(packagedSeedManifest, join(OUTPUT_DIR, "default-library-manifest.json"));
  copyFileSync(MODEL_MANIFEST, join(OUTPUT_DIR, "semantic-model-manifest.json"));
  copyFileSync(MODEL_LICENSE, join(OUTPUT_DIR, "SEMANTIC_MODEL_LICENSE_MIT.txt"));
  if (isDemoFull || mode === "full" || mode === "all") {
    copyFileSync(OCR_MANIFEST, join(OUTPUT_DIR, "ocr-model-manifest.json"));
    copyFileSync(OCR_LICENSE, join(OUTPUT_DIR, "OCR_MODEL_LICENSE_APACHE_2_0.txt"));
  }
  writeBuildMetadata(revision);
  writeChecksums();
  run(PNPM, ["audit:windows-release"]);
  if (isDemoFull) run(PNPM, ["audit:sidera-full-demo"]);
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
  const demoFull = JSON.parse(readFileSync(join(ROOT, "src-tauri", "tauri.demo-full.conf.json"), "utf8"));
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
  if (!fullNames.some((value) => value.endsWith("ocr-model/det/inference.onnx"))
    || !fullNames.some((value) => value.endsWith("ocr-model/rec/inference.onnx"))
    || !fullNames.some((value) => value.endsWith("ocr-model/ocr-model-manifest.json"))) {
    fail("Full bundle must include the fixed local OCR resources.");
  }
  const demoResources = demoFull.bundle?.resources || {};
  if (!Object.keys(demoResources).some((value) => value.endsWith("demo-staging/default-library/default-library-manifest.json"))) {
    fail("Demo Full bundle must use the version-stamped demo seed manifest.");
  }
  if (!Object.values(demoResources).some((value) => value.endsWith("ocr-model/ocr-model-manifest.json"))) {
    fail("Demo Full bundle must include the fixed local OCR resources.");
  }
  if (!liteNames.some((value) => value.endsWith("semantic-model/model.cpu-portable.onnx")) || liteNames.some((value) => value.endsWith("semantic-model/model.gpu.onnx"))) {
    fail("Lite bundle must include only the portable CPU semantic model.");
  }
  if (Object.keys(liteResources).some((value) => value.endsWith(DATABASE_FILE) || value.endsWith("default-library-manifest.json"))) {
    fail("Lite bundle must not include the default database.");
  }
  if (Object.values(liteResources).some((value) => value.startsWith("ocr-model/"))) {
    fail("Lite bundle must not include OCR resources.");
  }
}

function prepareDemoSnapshot() {
  if (!existsSync(DEMO_SOURCE_DATABASE) || !existsSync(DEMO_SOURCE_MANIFEST)) {
    fail("Demo Full requires the existing validated default-library seed and manifest.");
  }
  const manifest = JSON.parse(readFileSync(DEMO_SOURCE_MANIFEST, "utf8"));
  if (manifest.manifestSchemaVersion !== MANIFEST_SCHEMA_VERSION
    || manifest.generatorVersion !== GENERATOR_VERSION
    || manifest.databaseSchemaVersion !== 13
    || manifest.projectId !== "project-default"
    || !manifest.snapshotId
    || manifest.paperCount !== 25463
    || manifest.hotspotCount !== 160
    || manifest.membershipCount !== 25463) {
    fail("Existing default-library seed identity is not the validated historical schema 13 snapshot.");
  }
  if (statSync(DEMO_SOURCE_DATABASE).size !== manifest.sizeBytes || sha256(DEMO_SOURCE_DATABASE) !== manifest.sha256) {
    fail("Existing default-library seed failed size or SHA-256 validation.");
  }
  const db = new DatabaseSync(DEMO_SOURCE_DATABASE, { readOnly: true });
  try {
    const counts = db.prepare(`SELECT
      (SELECT COUNT(*) FROM papers WHERE project_id = ?) AS papers,
      (SELECT COUNT(*) FROM v20_hotspots WHERE project_id = ? AND snapshot_id = ?) AS hotspots,
      (SELECT COUNT(*) FROM v20_paper_memberships WHERE project_id = ? AND snapshot_id = ?) AS memberships,
      (SELECT COUNT(*) FROM paper_semantic_embeddings WHERE project_id = ? AND model_id = ? AND model_revision = ?) AS embeddings`).get(
        manifest.projectId, manifest.projectId, manifest.snapshotId, manifest.projectId, manifest.snapshotId,
        manifest.projectId, manifest.embeddingModelId, manifest.embeddingModelRevision,
      );
    if (counts.papers !== manifest.paperCount || counts.hotspots !== manifest.hotspotCount
      || counts.memberships !== manifest.membershipCount || counts.embeddings !== manifest.embeddingCount) {
      fail("Existing default-library seed counts do not match its manifest.");
    }
  } finally {
    db.close();
  }
  mkdirSync(DEMO_STAGE_DIR, { recursive: true });
  if (!existsSync(DEMO_SEED_DATABASE)
    || statSync(DEMO_SEED_DATABASE).size !== manifest.sizeBytes
    || sha256(DEMO_SEED_DATABASE) !== manifest.sha256) {
    copyFileSync(DEMO_SOURCE_DATABASE, DEMO_SEED_DATABASE);
  }
  writeFileSync(DEMO_SEED_MANIFEST, `${JSON.stringify({ ...manifest, appVersion: VERSION }, null, 2)}\n`, "utf8");
  console.log(`Prepared version-stamped demo manifest for immutable snapshot ${manifest.snapshotId}.`);
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
  verifySemanticModelResources();
}

function verifySemanticModelResources() {
  for (const name of [
    "model.cpu-portable.onnx", "model.gpu.onnx", "tokenizer.json", "config.json",
    "special_tokens_map.json", "tokenizer_config.json", "semantic-model-manifest.json", "LICENSE-MIT.txt",
  ]) {
    const path = name === "semantic-model-manifest.json"
      ? MODEL_MANIFEST
      : name === "LICENSE-MIT.txt" ? MODEL_LICENSE : join(MODEL_DIR, name);
    if (!existsSync(path)) fail(`Semantic model resource missing: ${name}`);
  }
  const manifest = JSON.parse(readFileSync(MODEL_MANIFEST, "utf8"));
  for (const key of ["cpuPortable", "gpu", "tokenizer", "config", "specialTokens", "tokenizerConfig"]) {
    const file = manifest.files?.[key];
    const path = file ? join(MODEL_DIR, file.target) : "";
    if (!file || !existsSync(path) || statSync(path).size !== file.size || sha256(path) !== file.sha256) {
      fail(`Semantic model resource failed verification: ${key}`);
    }
  }
}

function verifyOcrModelResources() {
  if (!existsSync(OCR_MANIFEST) || !existsSync(OCR_LICENSE)) {
    fail("Full bundle requires the fixed OCR manifest and Apache-2.0 license.");
  }
  const manifest = JSON.parse(readFileSync(OCR_MANIFEST, "utf8"));
  if (manifest.modelId !== "PP-OCRv5-mobile-det-rec"
    || manifest.runtime?.executionProvider !== "CPU"
    || manifest.runtime?.intraOpThreads !== 2
    || manifest.runtime?.directML !== false) {
    fail("OCR manifest runtime contract changed unexpectedly.");
  }
  for (const file of manifest.files || []) {
    const path = join(OCR_DIR, file.path);
    if (!existsSync(path)) fail(`OCR model resource missing: ${file.path}`);
    if (statSync(path).size !== file.bytes || sha256(path) !== file.sha256) {
      fail(`OCR model resource failed verification: ${file.path}`);
    }
  }
  if ((manifest.files || []).length !== 4) fail("OCR manifest must describe exactly four fixed model files.");
}

function preflight(revision) {
  if (isDemoFull) {
    run(PNPM, ["audit:version-alignment"]);
    run(PNPM, ["audit:sidera-institution-session-r7"]);
    run(PNPM, ["audit:sidera-institution-workspace-r6"]);
    run(PNPM, ["audit:sidera-document-reader-r2"]);
    run(PNPM, ["audit:sidera-document-ocr-r1"]);
    run(PNPM, ["audit:sidera-document-agent-r2"]);
    run(PNPM, ["audit:project-docs"]);
    run(PNPM, ["build"], revision);
    run("cargo", ["check", "--tests", "--manifest-path", "src-tauri/Cargo.toml", "-j", "2"]);
    run("cargo", ["check", "--manifest-path", "src-tauri/Cargo.toml", "-j", "2"]);
    return;
  }
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

function buildInstaller(flavor, revision, configOverride) {
  const fullSeedDatabase = isDemoFull ? DEMO_SEED_DATABASE : SEED_DATABASE;
  const fullSeedManifest = isDemoFull ? DEMO_SEED_MANIFEST : SEED_MANIFEST;
  if (flavor === "full" && (!existsSync(fullSeedDatabase) || !existsSync(fullSeedManifest))) fail("Full installer requires the generated default-library snapshot.");
  if (!NSIS_DIR.startsWith(TARGET_RELEASE_DIR)) fail("Refusing to clean unexpected NSIS path.");
  rmSync(NSIS_DIR, { recursive: true, force: true });
  const config = configOverride || `src-tauri/tauri.${flavor}.conf.json`;
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
  const flavors = mode === "all" ? ["full", "lite"] : [isDemoFull ? "full" : mode];
  for (const flavor of flavors) {
    const path = installerPath(flavor);
    if (existsSync(path)) rmSync(path, { force: true });
  }
  for (const name of ["RELEASE_NOTES_zh-CN.md", "RELEASE_NOTES_en-US.md", "BUILD_METADATA.json", "SHA256SUMS.txt", "default-library-manifest.json", "semantic-model-manifest.json", "SEMANTIC_MODEL_LICENSE_MIT.txt", "ocr-model-manifest.json", "OCR_MODEL_LICENSE_APACHE_2_0.txt"]) {
    const path = join(OUTPUT_DIR, name);
    if (existsSync(path)) rmSync(path, { force: true });
  }
}

function installerPath(flavor) {
  return join(OUTPUT_DIR, `Research-Hotspots-Desktop_${VERSION}_x64-${flavor}-setup.exe`);
}

function writeReleaseNotes(revision) {
  const manifestPath = isDemoFull ? DEMO_SEED_MANIFEST : SEED_MANIFEST;
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : undefined;
  const snapshotZh = manifest ? `Full 默认库快照：${manifest.snapshotId}，${manifest.paperCount.toLocaleString("zh-CN")} 篇论文、${manifest.hotspotCount} 个热点、${manifest.membershipCount.toLocaleString("zh-CN")} 条归属。\n` : "";
  const snapshotEn = manifest ? `Full seed snapshot: ${manifest.snapshotId}; ${manifest.paperCount.toLocaleString("en-US")} papers, ${manifest.hotspotCount} hotspots, and ${manifest.membershipCount.toLocaleString("en-US")} memberships.\n` : "";
  const zh = isDemoFull
    ? `# Sidera ${VERSION} Full Demo\n\n这是从提交 ${revision} 构建的未签名 Windows x64 内部 Beta Demo，不是正式发布。\n\n${snapshotZh}\n## 已包含能力\n\n- 本地论文库、检索筛选、证据阅读器、选择/高亮/批注和本地文档索引。\n- 按需 PP-OCRv5 中文/英文识别，以及带页码锚点的文档证据 Agent。\n- 武大统一发现结构化检索、受控分页和机构会话静默恢复。\n- 便携 CPU 与 DirectML GPU 语义模型；页面导航不会自动启动建模或 OCR。\n\n## 安装提示\n\n- 安装器支持简体中文和英文。\n- 缺少 Microsoft Edge WebView2 Runtime 时，安装过程需要联网下载。\n- 当前版本未代码签名，Windows SmartScreen 可能警告；请先核对 SHA-256。\n- Demo 使用已验证的历史 schema 13 默认库，不重建或覆盖用户的真实论文库。\n- 登录信息只由 Sidera 独立 WebView2 profile 和 Windows 凭据存储管理。\n`
    : `# Research Hotspots Desktop ${VERSION}\n\n这是未签名的 Windows x64 Beta 预发布版，构建提交 ${revision}.\n\n${snapshotZh}\n## 主要内容\n\n- 科研星图热点改为成员论文语义中心与全局 PCA3 三维布局，普通论文继续使用热点内语义三维云。\n- 理论星图相机按场景边界动态构图，并在远景连续降低点尺寸与光晕，避免聚成模糊光团。\n- 保留星空闪烁、远景热点、普通论文呼吸、代表论文能量核心与论文相机旅程。\n- 语义建模支持缓存、分批进度、暂停、取消、稳定热点身份、血缘与安全原子切换。\n- 本版本不包含在线学术来源或校园图书馆连接器。\n\n## 安装包区别\n\n- **Full**：包含 schema 13 语义默认库、便携 CPU 模型和 DirectML GPU 模型。\n- **Lite**：不含论文数据，包含便携 CPU 模型，可创建空库后显式运行建模。\n- 两个版本均不会因页面导航自动运行热点建模。\n\n## 安装提示\n\n- 安装器支持简体中文和英文。\n- 缺少 Microsoft Edge WebView2 Runtime 时，安装过程需要联网下载。\n- 当前版本未代码签名，Windows SmartScreen 可能拦截；请先核对 SHA-256。\n- 用户库升级到 schema 13 前会创建迁移安全副本；首次启动禁止覆盖已有数据库。\n- 语义模型基于 intfloat/multilingual-e5-small，按 MIT 许可分发。\n- 升级、重装和卸载不会删除用户选择的数据库目录或 Windows Credential Manager 凭据。\n`;
  const en = isDemoFull
    ? `# Sidera ${VERSION} Full Demo\n\nThis is an unsigned internal Windows x64 beta demo built from commit ${revision}; it is not a published release.\n\n${snapshotEn}\n## Included capabilities\n\n- Local library search, evidence reader, selection, highlights, annotations, and local document indexing.\n- On-demand bilingual PP-OCRv5 and document-evidence Agent answers with page anchors.\n- Structured Wuhan University discovery search, controlled pagination, and silent institution-session restore.\n- Portable CPU and DirectML GPU semantic models. Navigation never starts modeling or OCR automatically.\n\n## Installation notes\n\n- Setup supports English and Simplified Chinese.\n- Missing WebView2 Runtime may require a network download.\n- The installer is unsigned; verify SHA-256 before continuing.\n- The demo reuses the validated historical schema 13 seed and never rebuilds or overwrites the user's real library.\n`
    : `# Research Hotspots Desktop ${VERSION}\n\nThis is an unsigned Windows x64 beta prerelease built from commit ${revision}.\n\n${snapshotEn}\n## Highlights\n\n- Hotspots now use member-paper semantic centroids and global PCA3 placement, while ordinary papers retain their local semantic 3D clouds.\n- The theory-map camera derives framing from scene bounds and continuously reduces distant point and halo energy to prevent a blurred light cluster.\n- Background twinkle, distant hotspots, ordinary-paper breathing, representative energy cores, and the paper camera journey are preserved.\n- Semantic modeling provides cached batches, progress, pause/cancel controls, stable hotspot identity, lineage, and an atomic snapshot switch.\n- Online academic sources and campus-library connectors are not included.\n\n## Packages\n\n- **Full** embeds the schema 13 semantic seed plus portable CPU and DirectML GPU models.\n- **Lite** embeds no paper data but includes the portable CPU model for explicit local modeling.\n- Neither edition starts modeling automatically during navigation.\n\n## Installation notes\n\n- The installer supports English and Simplified Chinese.\n- If Microsoft Edge WebView2 Runtime is missing, setup needs internet access to download it.\n- This build is not code-signed, so Windows SmartScreen may warn. Verify SHA-256 before continuing.\n- A safety backup is created before migrating user libraries to schema 13.\n- The intfloat/multilingual-e5-small model is distributed under the MIT License.\n- Upgrade, reinstall, and uninstall do not delete the selected database directory or Windows Credential Manager credentials.\n`;
  writeFileSync(join(OUTPUT_DIR, "RELEASE_NOTES_zh-CN.md"), zh, "utf8");
  writeFileSync(join(OUTPUT_DIR, "RELEASE_NOTES_en-US.md"), en, "utf8");
}

function writeBuildMetadata(revision) {
  const manifestPath = isDemoFull ? DEMO_SEED_MANIFEST : SEED_MANIFEST;
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : undefined;
  const semanticModel = JSON.parse(readFileSync(MODEL_MANIFEST, "utf8"));
  const ocrModel = existsSync(OCR_MANIFEST) ? JSON.parse(readFileSync(OCR_MANIFEST, "utf8")) : undefined;
  const fullInstaller = installerPath("full");
  writeFileSync(join(OUTPUT_DIR, "BUILD_METADATA.json"), `${JSON.stringify({
    artifactKind: isDemoFull ? "internal-demo" : "release-candidate",
    appVersion: VERSION,
    revision,
    sourceDirty: false,
    buildTime: BUILD_TIME,
    defaultSnapshotId: manifest?.snapshotId ?? null,
    defaultLibrarySchema: manifest?.databaseSchemaVersion ?? null,
    defaultLibrarySha256: manifest?.sha256 ?? null,
    defaultLibraryPaperCount: manifest?.paperCount ?? null,
    defaultLibraryHotspotCount: manifest?.hotspotCount ?? null,
    semanticModelId: semanticModel.modelId,
    semanticModelRevision: semanticModel.revision,
    ocrModelId: ocrModel?.modelId ?? null,
    ocrModelRevision: ocrModel?.modelRevision ?? null,
    ocrManifestSha256: ocrModel ? sha256(OCR_MANIFEST) : null,
    installerFile: existsSync(fullInstaller) ? fullInstaller.split(/[\\/]/).at(-1) : null,
    installerBytes: existsSync(fullInstaller) ? statSync(fullInstaller).size : null,
    installerSha256: existsSync(fullInstaller) ? sha256(fullInstaller) : null,
    fullResources: ["default-library", "semantic-cpu-portable", "semantic-directml", "pp-ocrv5-mobile-det-rec"],
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
    env: {
      ...process.env,
      CARGO_BUILD_JOBS: process.env.CARGO_BUILD_JOBS || "2",
      VITE_BUILD_REVISION: revision || process.env.VITE_BUILD_REVISION || "release-preflight",
      RELEASE_BUILD_TIME: BUILD_TIME,
      SIDERA_RELEASE_MODE: mode,
      SIDERA_RELEASE_OUTPUT_DIR: OUTPUT_ROOT,
    },
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
