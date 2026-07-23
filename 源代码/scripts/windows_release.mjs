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
const MANIFEST_SCHEMA_VERSION = 3;
const GENERATOR_VERSION = "agent-seed-3";
const DATABASE_DIR = join(ROOT, "data", "library");
const SOURCE_DATABASE = join(DATABASE_DIR, DATABASE_FILE);
const SEED_DIR = join(ROOT, "release-assets", "default-library");
const SEED_DATABASE = join(SEED_DIR, DATABASE_FILE);
const SEED_MANIFEST = join(SEED_DIR, "default-library-manifest.json");
const SNAPSHOT_STATE = join(SEED_DIR, ".snapshot-source.json");
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

  mkdirSync(OUTPUT_DIR, { recursive: true });
  removeSelectedOutputs();
  preflight(revision);
  if (mode === "full" || mode === "all") buildInstaller("full", revision);
  if (mode === "lite" || mode === "all") buildInstaller("lite", revision);
  if (mode === "all") verifyInstallerPair();
  writeReleaseNotes(revision);
  if (existsSync(SEED_MANIFEST)) copyFileSync(SEED_MANIFEST, join(OUTPUT_DIR, "default-library-manifest.json"));
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
  if (Array.isArray(lite.bundle?.resources) ? lite.bundle.resources.length !== 0 : Object.keys(lite.bundle?.resources || {}).length !== 0) {
    fail("Lite bundle configuration must not include resources.");
  }
}

function prepareSnapshot() {
  if (!existsSync(SOURCE_DATABASE)) fail(`Default source database not found: ${SOURCE_DATABASE}`);
  mkdirSync(SEED_DIR, { recursive: true });
  const source = statSync(SOURCE_DATABASE);
  const db = new DatabaseSync(SOURCE_DATABASE, { readOnly: true });
  const state = db.prepare("SELECT active_snapshot_id AS snapshotId FROM v20_analysis_state WHERE project_id = ?").get("project-default");
  db.close();
  if (!state?.snapshotId) fail("Default source database has no active V20 snapshot for project-default.");
  const expected = {
    sourcePath: SOURCE_DATABASE,
    sourceSize: source.size,
    sourceMtimeMs: Math.trunc(source.mtimeMs),
    appVersion: VERSION,
    manifestSchemaVersion: MANIFEST_SCHEMA_VERSION,
    generatorVersion: GENERATOR_VERSION,
    snapshotId: state.snapshotId,
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
    "--data-version", "v20-default-2026-07-19",
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
      (SELECT COUNT(*) FROM v20_paper_memberships WHERE project_id = ? AND snapshot_id = ?) AS memberships`).get(
        manifest.projectId, manifest.projectId, manifest.snapshotId, manifest.projectId, manifest.snapshotId,
      );
    db.close();
    return counts.papers === manifest.paperCount && counts.hotspots === manifest.hotspotCount && counts.memberships === manifest.membershipCount;
  } catch {
    return false;
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
  run(PNPM, ["audit:windows-release"]);
  run(PNPM, ["build"], revision);
  run("cargo", ["check", "--workspace", "--manifest-path", "src-tauri/Cargo.toml"]);
  run("cargo", ["test", "-p", "research-hotspots-core", "--manifest-path", "src-tauri/Cargo.toml"]);
  run("cargo", ["test", "--workspace", "--no-run", "--manifest-path", "src-tauri/Cargo.toml"]);
}

function removeDevelopmentBinaries() {
  for (const name of ["audit_library.exe", "audit_agent_performance.exe", "export_app17_visual_review.exe", "export_hotspot_evidence.exe", "export_star_map.exe", "import_library.exe", "prepare_default_library.exe"]) {
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
  if (statSync(full).size <= statSync(lite).size + statSync(SEED_DATABASE).size / 20) fail("Full installer is not materially larger than Lite; seed resource may be missing.");
}

function removeSelectedOutputs() {
  const flavors = mode === "all" ? ["full", "lite"] : [mode];
  for (const flavor of flavors) {
    const path = installerPath(flavor);
    if (existsSync(path)) rmSync(path, { force: true });
  }
  for (const name of ["RELEASE_NOTES_zh-CN.md", "RELEASE_NOTES_en-US.md", "BUILD_METADATA.json", "SHA256SUMS.txt", "default-library-manifest.json"]) {
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
  const zh = `# Research Hotspots Desktop ${VERSION}\n\n这是未签名的 Windows x64 Beta 预发布版，构建提交 ${revision}.\n\n${snapshotZh}\n## 主要内容\n\n- 新增受监督研究 Agent：计划审批、写动作审批、证据固化、报告审计、恢复与成本统计。\n- 导入、清洗、V20 建模和 Markdown/HTML 正式导出均受高风险审批、租约和幂等 receipt 约束。\n- 本版本不包含在线学术来源或校园图书馆连接器。\n\n## 安装包区别\n\n- **Full**：包含上述 schema 11 V20 默认论文库；首次启动默认选择安装默认库。\n- **Lite**：不含任何论文数据；首次启动默认选择创建 schema 11 空白库。\n- 两个版本均可创建空白库或接入现有 SQLite 库，且不会自动运行热点聚类。\n\n## 安装提示\n\n- 安装器支持简体中文和英文。\n- 缺少 Microsoft Edge WebView2 Runtime 时，安装过程需要联网下载。\n- 当前版本未代码签名，Windows SmartScreen 可能拦截；请先核对 SHA-256。\n- 用户库升级前会创建迁移安全副本；首次启动禁止覆盖已有数据库。\n- 升级、重装和卸载不会删除用户选择的数据库目录或 Windows Credential Manager 凭据。\n`;
  const en = `# Research Hotspots Desktop ${VERSION}\n\nThis is an unsigned Windows x64 beta prerelease built from commit ${revision}.\n\n${snapshotEn}\n## Highlights\n\n- Adds the supervised Research Agent with plan/action approvals, immutable evidence, report auditing, recovery, and usage insights.\n- Import, cleaning, V20 modeling, and Markdown/HTML export are governed by high-risk approval, leases, and idempotent receipts.\n- Online academic sources and campus-library connectors are not included in this release.\n\n## Packages\n\n- **Full** embeds the schema 11 V20 seed above and defaults to installing it on first launch.\n- **Lite** embeds no paper data and defaults to creating an empty schema 11 library.\n- Both editions can create an empty library or attach an existing SQLite library; neither starts clustering automatically.\n\n## Installation notes\n\n- The installer supports English and Simplified Chinese.\n- If Microsoft Edge WebView2 Runtime is missing, setup needs internet access to download it.\n- This build is not code-signed, so Windows SmartScreen may warn. Verify SHA-256 before continuing.\n- A safety backup is created before user-library migration; existing databases are never overwritten during first run.\n- Upgrade, reinstall, and uninstall do not delete the selected database directory or Windows Credential Manager credentials.\n`;
  writeFileSync(join(OUTPUT_DIR, "RELEASE_NOTES_zh-CN.md"), zh, "utf8");
  writeFileSync(join(OUTPUT_DIR, "RELEASE_NOTES_en-US.md"), en, "utf8");
}

function writeBuildMetadata(revision) {
  const manifest = existsSync(SEED_MANIFEST) ? JSON.parse(readFileSync(SEED_MANIFEST, "utf8")) : undefined;
  writeFileSync(join(OUTPUT_DIR, "BUILD_METADATA.json"), `${JSON.stringify({ appVersion: VERSION, revision, buildTime: BUILD_TIME, defaultSnapshotId: manifest?.snapshotId ?? null }, null, 2)}\n`, "utf8");
}

function writeChecksums() {
  const names = readdirSync(OUTPUT_DIR).filter((name) => name.endsWith(".exe") || name === "default-library-manifest.json" || name === "BUILD_METADATA.json").sort();
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
