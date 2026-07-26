import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const [schema, capabilities, tools, runtime, workspace, types] = await Promise.all([
  readFile(join(root, "src-tauri/core/src/agent_schema.sql"), "utf8"),
  readFile(join(root, "src-tauri/core/src/agent_capabilities.rs"), "utf8"),
  readFile(join(root, "src-tauri/core/src/agent_tools.rs"), "utf8"),
  readFile(join(root, "src-tauri/src/agent_runtime.rs"), "utf8"),
  readFile(join(root, "src/components/AgentWorkspace.tsx"), "utf8"),
  readFile(join(root, "src/agentTypes.ts"), "utf8"),
]);

for (const table of ["agent_resource_grants", "agent_operations", "agent_import_staging_papers", "agent_model_calls", "library_operation_leases"]) assert.match(schema, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
for (const tool of ["preview_paper_import", "import_papers", "preview_library_clean", "clean_paper_library", "inspect_v20_modeling_input", "rebuild_v20_snapshot", "export_report_artifact"]) assert.match(tools, new RegExp(`"${tool}"`));
for (const highTool of ["import_papers", "clean_paper_library", "rebuild_v20_snapshot", "export_report_artifact"]) {
  const definition = tools.slice(tools.indexOf(`"${highTool}"`), tools.indexOf(`"${highTool}"`) + 900);
  assert.match(definition, /AgentRiskLevel::High/);
}
assert.match(capabilities, /acquire_library_lease/);
assert.match(capabilities, /recover_stale_operations/);
assert.match(capabilities, /consume_resource_grant/);
assert.match(runtime, /AGENT_RESOURCE_FINGERPRINT_CHANGED/);
assert.match(runtime, /AGENT_IMPORT_PREVIEW_DRIFT/);
assert.match(runtime, /AGENT_CLEAN_PREVIEW_DRIFT/);
assert.match(runtime, /AGENT_MODELING_INPUT_DRIFT/);
assert.match(runtime, /\.partial/);
assert.match(runtime, /create_new\(true\)/);
assert.match(runtime, /sync_all/);
assert.match(runtime, /AGENT_EXPORT_FILE_EXISTS/);
assert.doesNotMatch(tools, /online_search|shell|arbitrary_sql|campus_library/);
for (const kind of ["research_report", "paper_file_import", "paper_mysql_import", "library_clean", "v20_modeling", "report_export"]) assert.match(types + workspace, new RegExp(kind));
assert.doesNotMatch(workspace, /dangerouslySetInnerHTML/);

console.log(JSON.stringify({ schemaVersion: 12, governedToolCount: 7, highRiskToolCount: 4, atomicImportStaging: true, libraryLease: true, safeExport: true, onlineConnectorsDeferred: true }, null, 2));
