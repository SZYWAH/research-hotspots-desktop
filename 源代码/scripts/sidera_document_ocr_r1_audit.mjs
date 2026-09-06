import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const readJson = (relative) => JSON.parse(read(relative));

const core = read("src-tauri/core/src/document_ocr.rs");
const index = read("src-tauri/core/src/document_index.rs");
const schema = read("src-tauri/core/src/document_derived.rs");
const desktop = read("src-tauri/src/sidera_document_ocr.rs");
const protocol = read("src-tauri/src/sidera_document_protocol.rs");
const adapter = read("src/lib/documentPdfJsAdapter.ts");
const service = read("src/lib/documentReaderDesktopService.ts");
const shell = read("src/components/DocumentReaderShell.tsx");
const full = readJson("src-tauri/tauri.full.conf.json");
const lite = readJson("src-tauri/tauri.lite.conf.json");
const manifest = readJson("release-assets/ocr-model/ocr-model-manifest.json");

assert.match(schema, /DOCUMENT_DERIVED_SCHEMA_VERSION: i64 = 5/);
for (const table of ["document_ocr_jobs", "document_ocr_pages", "document_ocr_spans", "document_ocr_active_results"]) {
  assert.ok(schema.includes(table), `missing derived schema table: ${table}`);
}
for (const state of ["awaiting-upload", "queued", "running", "ready", "failed", "cancelled", "superseded"]) {
  assert.ok(core.includes(`\"${state}\"`), `missing OCR state: ${state}`);
}
for (const constant of [
  "DOCUMENT_OCR_UPLOAD_TTL_MS: i64 = 30_000",
  "DOCUMENT_OCR_JOB_TIMEOUT_MS: i64 = 90_000",
  "DOCUMENT_OCR_MAX_UPLOAD_BYTES: usize = 12 * 1024 * 1024",
  "DOCUMENT_OCR_MAX_IMAGE_EDGE: u32 = 3_000",
  "DOCUMENT_OCR_MAX_IMAGE_PIXELS: u64 = 12_000_000",
  "DOCUMENT_OCR_MAX_BATCH_PAGES: usize = 8",
]) {
  assert.ok(core.includes(constant), `missing OCR bound: ${constant}`);
}
assert.match(core, /UPDATE document_index_jobs SET state='superseded'/);
assert.match(core, /SIDERA_DOCUMENT_OCR_LATE_RESULT/);
assert.match(core, /document_page_text_for_source/);
assert.match(core, /SIDERA_DOCUMENT_NATIVE_SOURCE_NOT_READY/);
assert.match(index, /document_ocr_page_text/);
assert.match(index, /DocumentParseState::NeedsOcr/);
assert.match(index, /source_kind: page\.source_kind\.clone\(\)/);
assert.match(core, /ocr-result-stale/);

assert.match(protocol, /context\.webview_label\(\) != "main"/);
assert.match(protocol, /Method::POST[\s\S]{0,160}\/ocr-upload\//);
assert.match(desktop, /eq_ignore_ascii_case\("image\/png"\)/);
assert.match(desktop, /body\.starts_with\(b"\\x89PNG\\r\\n\\x1a\\n"\)/);
assert.equal((desktop.match(/\.with_intra_threads\(2\)/g) ?? []).length, 2);
assert.doesNotMatch(desktop, /with_execution_providers|DirectMLExecutionProvider|execution_provider::Direct/i);
assert.match(desktop, /DOCUMENT_OCR_MAX_IMAGE_EDGE/);
assert.match(desktop, /DOCUMENT_OCR_MAX_IMAGE_PIXELS/);
assert.match(desktop, /OCR_REC_MAX_IMAGE_WIDTH: u32 = 3_200/);
assert.match(desktop, /rotate90/);
assert.match(desktop, /rotate270/);

assert.match(adapter, /renderPagePng:/);
assert.match(adapter, /scale: 2/);
assert.match(adapter, /image\/png/);
assert.match(service, /sidera-document\.localhost/);
assert.match(shell, /当前页文字来源/);
assert.match(shell, /当前版本未安装 OCR/);
assert.match(shell, /识别当前页/);
assert.match(shell, /建议页 ·/);
assert.match(shell, /最多 8 页/);
assert.match(shell, /Math\.min\(8, ocrCapability\.maxBatchPages\)/);
assert.match(shell, /activeOcrBatchJobRef\.current !== ocrSnapshot\.jobId/);
assert.match(shell, /\["auto", "native", "ocr"\]/);
assert.doesNotMatch(shell, /<button[^>]*>[\s\S]{0,120}(下载 OCR|安装 OCR)/);

const fullResources = full.bundle.resources;
const liteResources = lite.bundle.resources;
for (const file of manifest.files) {
  const relative = `release-assets/ocr-model/${file.path}`;
  const absolute = path.join(root, relative);
  assert.ok(fs.existsSync(absolute), `missing OCR model file: ${relative}`);
  const bytes = fs.readFileSync(absolute);
  assert.equal(bytes.byteLength, file.bytes, `OCR model size drift: ${relative}`);
  assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), file.sha256, `OCR model hash drift: ${relative}`);
  assert.ok(
    Object.keys(fullResources).some((resource) => resource.replaceAll("\\", "/").endsWith(`release-assets/ocr-model/${file.path}`)),
    `Full resources missing OCR asset: ${file.path}`,
  );
}
assert.ok(Object.keys(fullResources).some((resource) => resource.includes("ocr-model-manifest.json")));
assert.ok(Object.keys(fullResources).some((resource) => resource.includes("LICENSE-APACHE-2.0.txt")));
assert.equal(Object.keys(liteResources).some((resource) => resource.includes("ocr-model")), false, "Lite must not bundle OCR assets");
assert.equal(manifest.runtime.executionProvider, "CPU");
assert.equal(manifest.runtime.intraOpThreads, 2);
assert.equal(manifest.runtime.directML, false);

console.log(JSON.stringify({
  status: "STATIC PASS",
  surface: "document-ocr-r1",
  schemaVersion: 5,
  modelId: manifest.modelId,
  modelFilesVerified: manifest.files.length,
  fullResources: "bundled-with-manifest-and-license",
  liteResources: "ocr-excluded",
  runtime: "CPU-2-threads-no-DirectML",
  upload: "main-webview-single-use-png-bounded",
  recognition: "adaptive-latin-width-and-bidirectional-rotated-crops",
  batch: "explicit-max-eight-pages-single-job-sequential",
  nativeAcceptance: "UNVERIFIED",
}, null, 2));
