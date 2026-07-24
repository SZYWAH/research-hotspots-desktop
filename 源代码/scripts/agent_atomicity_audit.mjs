import { readFileSync } from "node:fs";

const runtime = readFileSync(new URL("../src-tauri/src/agent_runtime.rs", import.meta.url), "utf8")
  .replace(/\r\n/g, "\n");
const core = readFileSync(new URL("../src-tauri/core/src/agent_store.rs", import.meta.url), "utf8")
  .replace(/\r\n/g, "\n");
const start = runtime.indexOf("fn execute_extended_tool_sync(");
const end = runtime.indexOf("#[cfg(test)]\nfn execute_extended_tool_sync", start);
if (start < 0 || end < 0) throw new Error("Cannot locate governed extended-tool executor.");
const extended = runtime.slice(start, end);

const checks = [
  ["generated receipt commit primitive", core.includes("pub fn commit_tool_success_generated")],
  ["business write uses receipt transaction", runtime.includes("apply_deferred_tool_commit")],
  ["import deferred", extended.includes("DeferredToolCommit::Import")],
  ["clean deferred", extended.includes("DeferredToolCommit::Clean")],
  ["V20 switch deferred", extended.includes("DeferredToolCommit::RebuildV20")],
  ["export finalization deferred", extended.includes("DeferredToolCommit::Export")],
  ["library lease fenced in commit", runtime.includes("assert_library_operation_lease(transaction, lease, now)")],
  ["deterministic export name", runtime.includes("operation_suffix")],
  ["export replay verifies hash",
    runtime.includes("sha256_file(&final_path)? != expected_sha256")
      && runtime.includes("written_sha256 != file.expected_sha256")],
  ["old import self-commit removed", !extended.includes("super::upsert_paper_rows(&mut connection")],
  ["old clean self-commit removed", !extended.includes("super::clean_library_connection(&mut connection")],
  ["old V20 self-commit removed", !extended.includes("super::cluster_library_connection(&connection")],
];
const failed = checks.filter(([, passed]) => !passed).map(([name]) => name);
if (failed.length) throw new Error(`Agent atomicity audit failed: ${failed.join(", ")}`);
console.log(JSON.stringify({ ok: true, checks: checks.length, invariant: "business+revision+snapshot+artifact+receipt share one SQLite commit" }, null, 2));
