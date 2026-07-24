import { existsSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const core = readFileSync(new URL("../src-tauri/core/src/lib.rs", import.meta.url), "utf8");
const store = readFileSync(new URL("../src-tauri/core/src/agent_store.rs", import.meta.url), "utf8");
const checks = {
  schema12: /LIBRARY_SCHEMA_VERSION:\s*i64\s*=\s*12/.test(core),
  supportsSchema8: /MIN_SUPPORTED_LIBRARY_SCHEMA_VERSION:\s*i64\s*=\s*8/.test(core),
  rejectsNewer: store.includes("LIBRARY_SCHEMA_TOO_NEW"),
  onlineBackup: store.includes("Backup::new"),
  v8Fixture: store.includes("v8_seed_shape_migrates_directly_to_v12"),
  v9Fixture: store.includes("v9_file_migrates_to_v12_with_backup_and_new_contract"),
  idempotentV12: store.includes("repeated_v12_open_is_idempotent"),
};
const manifestPath = new URL("../release-assets/default-library/default-library-manifest.json", import.meta.url);
if (existsSync(manifestPath)) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.appVersion === "0.22.0-beta.1") {
    checks.releaseManifestSchema11 = manifest.manifestSchemaVersion === 3 && manifest.databaseSchemaVersion === 11;
    const database = new DatabaseSync(new URL(`../release-assets/default-library/${manifest.databaseFile}`, import.meta.url), { readOnly: true });
    const version = database.prepare("PRAGMA user_version").get().user_version;
    const runtimeRows = database.prepare("SELECT SUM(count) AS count FROM (SELECT COUNT(*) count FROM agent_runs UNION ALL SELECT COUNT(*) FROM agent_artifacts UNION ALL SELECT COUNT(*) FROM agent_operations UNION ALL SELECT COUNT(*) FROM agent_model_calls)").get().count;
    database.close();
    checks.releaseDatabaseSchema11 = version === 11;
    checks.releaseHasNoAgentHistory = runtimeRows === 0;
  }
}
const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
if (failed.length) throw new Error(`Agent migration audit failed: ${failed.join(", ")}`);
console.log(JSON.stringify({ ok: true, checks }, null, 2));
