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
const lite = json("src-tauri/tauri.lite.conf.json");
const seedDir = join(ROOT, "release-assets", "default-library");
const seedPath = join(seedDir, "research-hotspots-v7.sqlite");
const manifestPath = join(seedDir, "default-library-manifest.json");
const outputDir = join(ROOT, "release", "windows", version);
const expected = { papers: 25463, hotspots: 160, memberships: 25463 };

assert(/^0\.22\.0-beta\.\d+$/.test(version), `unexpected package version ${version}`);
assert(tauri.version === version, "Tauri/package version mismatch");
for (const path of ["src-tauri/Cargo.toml", "src-tauri/core/Cargo.toml"]) {
  assert(new RegExp(`^version = "${escapeRegExp(version)}"$`, "m").test(text(path)), `${path} version mismatch`);
}
const lock = text("src-tauri/Cargo.lock");
assert((lock.match(new RegExp(`version = "${escapeRegExp(version)}"`, "g")) || []).length >= 2, "Cargo.lock does not contain both v0.22 workspace packages");
assert(text(".gitignore").split(/\r?\n/).includes("data/library/"), "data/library must stay ignored");
assert(/autobins\s*=\s*false/.test(text("src-tauri/Cargo.toml")), "Cargo autobins must be disabled for release");
assert(/name\s*=\s*"prepare_default_library"[\s\S]*?required-features\s*=\s*\["dev-tools"\]/.test(text("src-tauri/Cargo.toml")), "default library generator must require dev-tools");

const fullResources = full.bundle?.resources || {};
assert(Object.keys(fullResources).some((value) => value.endsWith("research-hotspots-v7.sqlite")), "Full config omits seed database");
assert(Object.keys(fullResources).some((value) => value.endsWith("default-library-manifest.json")), "Full config omits seed manifest");
assert(Array.isArray(lite.bundle?.resources) && lite.bundle.resources.length === 0, "Lite config must contain no resources");

assert(existsSync(seedPath) && existsSync(manifestPath), "V20 default seed and manifest must be generated before audit");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
assert(manifest.manifestSchemaVersion === 3, "manifest schema must be v3");
assert(manifest.generatorVersion === "agent-seed-3", "manifest generator version mismatch");
assert(manifest.databaseSchemaVersion === 11, "seed database schema must be 11");
assert(Number.isInteger(manifest.libraryRevision) && manifest.libraryRevision >= 0, "seed library revision is missing");
assert(manifest.appVersion === version, "seed app version mismatch");
assert(manifest.databaseFile === "research-hotspots-v7.sqlite", "compatible seed filename changed");
assert(manifest.projectId === "project-default" && typeof manifest.snapshotId === "string" && manifest.snapshotId.length > 0, "manifest V20 identity is missing");
assert(manifest.paperCount === expected.papers && manifest.hotspotCount === expected.hotspots && manifest.membershipCount === expected.memberships, "manifest V20 counts mismatch");
assert(statSync(seedPath).size === manifest.sizeBytes, "seed file size does not match manifest");
assert(sha256(seedPath) === manifest.sha256, "seed SHA-256 does not match manifest");

const db = new DatabaseSync(seedPath, { readOnly: true });
const scalar = (sql, ...params) => Object.values(db.prepare(sql).get(...params))[0];
assert(scalar("PRAGMA user_version") === 11, "seed PRAGMA user_version is not 11");
assert(String(scalar("PRAGMA integrity_check")).toLowerCase() === "ok", "seed integrity_check failed");
assert(!db.prepare("PRAGMA foreign_key_check").get(), "seed foreign_key_check failed");
const active = db.prepare("SELECT active_snapshot_id AS snapshotId FROM v20_analysis_state WHERE project_id = ?").get(manifest.projectId);
assert(active?.snapshotId === manifest.snapshotId, "seed active snapshot does not match manifest");
assert(scalar("SELECT COUNT(*) FROM papers WHERE project_id = ?", manifest.projectId) === expected.papers, "seed paper count mismatch");
assert(scalar("SELECT COUNT(*) FROM v20_analysis_snapshots") === 1, "seed must contain exactly one V20 snapshot");
assert(scalar("SELECT COUNT(*) FROM v20_hotspots WHERE project_id = ? AND snapshot_id = ?", manifest.projectId, manifest.snapshotId) === expected.hotspots, "seed hotspot count mismatch");
assert(scalar("SELECT COUNT(*) FROM v20_paper_memberships WHERE project_id = ? AND snapshot_id = ?", manifest.projectId, manifest.snapshotId) === expected.memberships, "seed membership count mismatch");
for (const table of ["app17_hotspots", "app17_paper_topics", "app17_hotspot_reviews"]) {
  const present = scalar("SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name=?)", table);
  if (present) assert(scalar(`SELECT COUNT(*) FROM ${table}`) === 0, `${table} legacy rows leaked into seed`);
}
for (const table of ["agent_runs", "agent_artifacts", "agent_operations", "agent_model_calls", "agent_resource_grants", "agent_tool_receipts", "agent_meta", "library_operation_leases"]) {
  assert(scalar(`SELECT COUNT(*) FROM ${table}`) === 0, `${table} runtime rows leaked into seed`);
}
db.close();

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
  for (const file of [fullInstaller, liteInstaller].filter(existsSync)) {
    const name = file.split(/[\\/]/).at(-1);
    assert(sums.includes(`${sha256(file)}  ${name}`), `checksum entry missing for ${name}`);
  }
}

console.log(JSON.stringify({ ok: true, version, snapshotId: manifest.snapshotId, ...expected, seedBytes: manifest.sizeBytes, installersPresent: existsSync(fullInstaller) && existsSync(liteInstaller) }));

function json(path) { return JSON.parse(text(path)); }
function text(path) { return readFileSync(join(ROOT, path), "utf8"); }
function sha256(path) { return createHash("sha256").update(readFileSync(path)).digest("hex"); }
function assert(condition, message) { if (!condition) throw new Error(`windows release audit failed: ${message}`); }
function escapeRegExp(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
