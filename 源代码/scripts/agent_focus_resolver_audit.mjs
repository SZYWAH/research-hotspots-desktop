import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const rustSource = await readFile(
  path.join(process.cwd(), "src-tauri/src/lib.rs"),
  "utf8",
);
const desktopSource = await readFile(
  path.join(process.cwd(), "src/lib/desktop.ts"),
  "utf8",
);

assert.match(
  rustSource,
  /fn resolve_agent_dual_focus_scene\(/,
  "Dual focus resolver command is missing.",
);
assert.match(
  rustSource,
  /OpenFlags::SQLITE_OPEN_READ_ONLY/,
  "Resolver must open SQLite read-only.",
);
assert.match(
  rustSource,
  /input\.evidence_entity_ids\.len\(\) > 5/,
  "Evidence hard limit is missing.",
);
assert.match(
  rustSource,
  /input\.context_entity_ids\.len\(\) > 24/,
  "Context hard limit is missing.",
);
assert.match(
  rustSource,
  /membership:\s*"active-only"\.to_string\(\)/,
  "Active-only classification is missing.",
);
assert.match(
  rustSource,
  /"snapshot-unsampled"\.to_string\(\)/,
  "Snapshot-unsampled classification is missing.",
);
assert.match(
  rustSource,
  /membership:\s*"missing"\.to_string\(\)/,
  "Missing classification is missing.",
);
assert.match(
  rustSource,
  /SELECT membership\.paper_id,membership\.hotspot_id/,
  "Resolver must return the canonical membership paper ID.",
);
assert.match(
  desktopSource,
  /invoke<AgentDualFocusScene>\(\s*"resolve_agent_dual_focus_scene"/,
  "Desktop invoke wrapper is missing.",
);
assert.match(
  rustSource,
  /resolve_agent_dual_focus_scene,\s*[\r\n]/,
  "Tauri invoke registration is missing.",
);

console.log(JSON.stringify({
  audit: "agent-focus-resolver",
  status: "PASS",
  sqliteMode: "read-only",
  maximumResolvedEntities: 30,
  memberships: [
    "sampled",
    "snapshot-unsampled",
    "active-only",
    "missing",
  ],
}, null, 2));
