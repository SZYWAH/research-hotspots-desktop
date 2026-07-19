import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const [store, app, desktop, rust, core, types] = await Promise.all([
  readFile(resolve(root, "src/data/researchStore.ts"), "utf8"),
  readFile(resolve(root, "src/App.tsx"), "utf8"),
  readFile(resolve(root, "src/lib/desktop.ts"), "utf8"),
  readFile(resolve(root, "src-tauri/src/lib.rs"), "utf8"),
  readFile(resolve(root, "src-tauri/core/src/lib.rs"), "utf8"),
  readFile(resolve(root, "src/types.ts"), "utf8"),
]);

const checks = [];
function requireCheck(name, condition) {
  if (!condition) throw new Error(`Backup restore audit failed: ${name}`);
  checks.push(name);
}

requireCheck("backup-schema-v2", types.includes("schemaVersion?: number") && store.includes("schemaVersion: 2"));
requireCheck("derived-hotspots-excluded", store.includes("hotspots: []"));
const restoreBlock = store.slice(store.indexOf("export async function restoreBackupData"), store.indexOf("function normalizeBackupForRestore"));
requireCheck("restore-validates-before-write", restoreBlock.indexOf("normalizeBackupForRestore") < restoreBlock.indexOf("db.transaction("));
requireCheck("indexeddb-single-transaction", store.includes("[PROJECT_STORE, META_STORE, PAPER_STORE, HOTSPOT_STORE, REPORT_STORE, JOB_STORE, SETTINGS_STORE, TASK_LOG_STORE]"));
requireCheck("sqlite-inspection-ui", desktop.includes("inspect_paper_library_backup") && app.includes("inspectPaperLibraryBackup"));
requireCheck(
  "sqlite-staging-and-integrity",
  rust.includes("staging_path")
    && core.includes("PRAGMA quick_check")
    && core.includes("PRAGMA foreign_key_check"),
);
requireCheck("sqlite-atomic-swap", rust.includes("atomic_replace_file_with_rollback") && core.includes("atomic_file_replace_rolls_back_on_validation_failure"));
requireCheck("restore-marker-recovery", rust.includes("recover_interrupted_restore") && rust.includes("research-hotspots-v7.restore.json"));
requireCheck("library-busy-guard", rust.includes("LIBRARY_BUSY") && rust.includes("LibraryMutationRegistry"));
requireCheck("v20-count-validation", core.includes("V20 membership count mismatch") && core.includes("V20 hotspot count mismatch"));
requireCheck("old-backup-no-auto-cluster", !store.includes("await replaceHotspots(seedHotspotsFromPapers"));

console.log(JSON.stringify({ status: "passed", checks }, null, 2));
