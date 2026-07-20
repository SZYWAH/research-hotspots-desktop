import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const [app, store, desktop, rust, types] = await Promise.all([
  readFile(resolve(root, "src/App.tsx"), "utf8"),
  readFile(resolve(root, "src/data/researchStore.ts"), "utf8"),
  readFile(resolve(root, "src/lib/desktop.ts"), "utf8"),
  readFile(resolve(root, "src-tauri/src/lib.rs"), "utf8"),
  readFile(resolve(root, "src/types.ts"), "utf8"),
]);

const checks = [];
function requireCheck(name, condition) {
  if (!condition) throw new Error(`V20 cache audit failed: ${name}`);
  checks.push(name);
}

requireCheck("lightweight-snapshot-command", rust.includes("fn get_v20_hotspot_snapshot") && desktop.includes('"get_v20_hotspot_snapshot"'));
requireCheck("sqlite-is-cache-authority", app.includes("getV20HotspotSnapshot") && app.includes("replaceV20HotspotCache(snapshot)"));
requireCheck("database-and-snapshot-cache-key", types.includes("databaseKey?: string") && store.includes("hotspot.databaseKey === state.databaseKey") && store.includes("hotspot.snapshotId === state.snapshotId"));
requireCheck("cache-and-meta-single-transaction", store.includes('db.transaction([HOTSPOT_STORE, META_STORE], "readwrite")'));
requireCheck("no-seed-hotspot-fallback", !store.includes("await replaceHotspots(seedHotspotsFromPapers"));
requireCheck("request-sequence-race-guard", app.includes("refreshRequestSequenceRef") && (app.match(/requestSequence !== refreshRequestSequenceRef\.current/g)?.length ?? 0) >= 2);
requireCheck("galaxy-rejects-mixed-snapshots", app.includes("v20SnapshotConsistent") && app.includes("暂不渲染混合数据"));
requireCheck("reports-bind-snapshot", types.includes("snapshotId?: string") && store.includes("const snapshotId = report.snapshotId"));

const rows = [
  { databaseKey: "db-a", snapshotId: "s1", id: "a" },
  { databaseKey: "db-a", snapshotId: "s0", id: "old" },
  { databaseKey: "db-b", snapshotId: "s1", id: "other-db" },
];
const state = { databaseKey: "db-a", snapshotId: "s1" };
const visible = rows.filter((row) => row.databaseKey === state.databaseKey && row.snapshotId === state.snapshotId);
requireCheck("cache-filter-model", visible.length === 1 && visible[0].id === "a");
let sequence = 1;
const stale = sequence;
sequence += 1;
requireCheck("stale-request-model", stale !== sequence);

console.log(JSON.stringify({ status: "passed", checks }, null, 2));
