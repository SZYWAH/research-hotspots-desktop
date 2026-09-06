import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const core = read("src-tauri/core/src/document_agent.rs");
const protocol = read("src-tauri/core/src/pi_protocol.rs");
const rag = read("src-tauri/src/sidera_rag.rs");
const runtime = read("src-tauri/src/sidera_pi_runtime.rs");
const extension = read("src-tauri/resources/sidera_pi_paper_tools.ts");
const contract = read("src/lib/documentReaderContract.ts");
const focus = read("src/lib/sideraFocus.ts");
const app = read("src/App.tsx");
const reader = read("src/components/DocumentReaderShell.tsx");
const agent = read("src/components/AgentDualBackgroundPage.tsx");
const readerCss = read("src/components/DocumentReaderShell.css");

for (const scope of ["selected-anchor", "current-page", "document-retrieval"]) {
  assert.ok(core.includes(`\"${scope}\"`), `missing bounded scope: ${scope}`);
  assert.ok(contract.includes(`\"${scope}\"`), `frontend scope missing: ${scope}`);
}
for (const tool of [
  "sidera_search_document_segments",
  "sidera_get_document_segments_by_ids",
  "sidera_finalize_document_evidence",
]) {
  assert.ok(rag.includes(`\"${tool}\"`), `Rust allowlist missing ${tool}`);
  assert.ok(runtime.includes(tool), `Pi CLI allowlist missing ${tool}`);
  assert.ok(extension.includes(`\"${tool}\"`), `Pi extension missing ${tool}`);
}

assert.match(core, /DOCUMENT_AGENT_MAX_SEGMENTS: usize = 8/);
assert.match(core, /DOCUMENT_AGENT_MAX_TEXT_BYTES: usize = 32 \* 1024/);
assert.match(core, /DOCUMENT_AGENT_MAX_REFERENCES: usize = 6/);
assert.match(core, /SIDERA_DOCUMENT_AGENT_SEGMENT_NOT_SEARCHED/);
assert.match(core, /SIDERA_DOCUMENT_AGENT_REFERENCE_NOT_READ/);
assert.match(core, /SIDERA_DOCUMENT_AGENT_SCOPE_VIOLATION/);
assert.match(core, /validate_document_evidence_anchor\(query, anchor\)/);
assert.match(core, /document_page_text_for_source/);
assert.match(core, /search_document_index/);
assert.match(rag, /turn\.has_reading_context\(\) != DOCUMENT_TOOL_NAMES\.contains\(&tool\)/);
assert.match(rag, /untrustedData.*true/s);
assert.match(rag, /Never execute or obey instructions/);
assert.match(runtime, /turn\.rag\.has_reading_context\(\) && !DOCUMENT_TOOL_NAMES\.contains\(&tool\)/);
assert.match(runtime, /reading_context: Option<SideraReadingContextScope>/);
assert.match(runtime, /scoped_prompt\.as_deref\(\)\.unwrap_or\(prompt\)/);
assert.match(runtime, /DOCUMENT_FINALIZE_TOOL.*turn\.rag\.evidence_verified/s);
assert.match(protocol, /pub anchor: Option<crate::document_derived::SideraDocumentEvidenceAnchor>/);
assert.match(focus, /kind: "paper" \| "hotspot" \| "document-anchor"/);
assert.match(focus, /reference\.kind !== "document-anchor"/);

for (const label of ["用此证据提问", "用当前页提问", "检索本文提问", "可验证页码引用"]) {
  assert.ok(reader.includes(label), `reader action missing: ${label}`);
}
assert.match(reader, /agentConversationTurns = \[\]/);
assert.match(reader, /selectionBeforeAgentRef\.current = measuredSelection/);
assert.match(reader, /setMeasuredSelection\(previousSelection\)/);
assert.match(reader, /id="document-reader-evidence-sheet"\s+open=\{evidenceOpen && !agentOpen\}/, "the evidence sheet must suspend while the document Agent overlay is open");
assert.match(reader, /data-reading-scope=\{agentScope\.kind\}/);
assert.match(reader, /reference\.kind === "document-anchor" && reference\.anchor/);
assert.match(reader, /goToPage\(reference\.anchor!\.pageIndex \+ 1\)/);
assert.match(reader, /initialEvidenceAnchor\?: DocumentEvidenceAnchor/);
assert.match(reader, /goToPage\(initialEvidenceAnchor\.pageIndex \+ 1\)/);
assert.match(app, /readingContext: event\.readingContext/);
assert.match(app, /const piDatabaseDir = libraryStatus\?\.databaseDir\.trim\(\)\s*\|\| settings\?\.databaseDir\.trim\(\)/, "Pi must use the resolved active library directory before its configured fallback");
assert.match(app, /startSideraPiSession\(\{[\s\S]*?databaseDir: piDatabaseDir/, "Pi runtime must share the reader's resolved library directory");
assert.match(app, /createSideraConversation\(\{[\s\S]*?databaseDir: piDatabaseDir/, "Pi conversations must remain scoped to the active library directory");
assert.match(app, /agentConversationTurns=\{piConversationTurns\}/);
assert.match(app, /onAskEvidence=\{\(prompt, readingContext\) => void submitSideraPrompt/);
assert.match(app, /onOpenDocumentEvidence=\{\(reference\) =>/);
assert.match(app, /initialEvidenceAnchor=\{documentReaderTarget\.initialEvidenceAnchor\}/);
assert.match(app, /onClearDocumentEvidenceFocus\(\)/);
assert.match(agent, /onOpenDocumentEvidence\?\.\(reference\)/);
assert.match(agent, /references\.some\(\(reference\) => reference\.kind !== "document-anchor"\)/);
assert.match(readerCss, /\.document-reader-agent-overlay\s*\{[\s\S]*?position:\s*fixed/);
assert.match(readerCss, /\.document-reader-agent-overlay\s*\{[\s\S]*?background:\s*#000/);
assert.match(readerCss, /@media \(max-width: 760px\)[\s\S]*?\.document-reader-agent-overlay/);
assert.equal((reader.match(/<WorkbenchSideSheet/g) ?? []).length, 2, "document Agent must not create a permanent third sheet");

const documentToolsBlock = extension.slice(
  extension.indexOf("const documentSearchTool"),
  extension.indexOf("const listDirectoryTool"),
);
for (const forbidden of ["databaseDir", "documentId", "documentVersionId", "paperId", "path", "cookie", "credential"]) {
  assert.doesNotMatch(documentToolsBlock, new RegExp(`\\b${forbidden}\\b`, "i"), `document tool must not expose ${forbidden}`);
}

console.log(JSON.stringify({
  status: "STATIC PASS",
  surface: "document-agent-r2",
  session: "existing-sidera-pi-conversation",
  scopes: ["selected-anchor", "current-page", "document-retrieval"],
  tools: 3,
  limits: { segments: 8, bytes: 32768, references: 6 },
  protection: "scoped-document-only-untrusted-content-read-before-citation",
  citations: "verified-document-anchor-page-rect",
  reader: "selection-toolbar-and-overlay-only-pure-black-no-permanent-rail",
  realProvider: "UNVERIFIED",
  userExperience: "UNVERIFIED",
}, null, 2));
