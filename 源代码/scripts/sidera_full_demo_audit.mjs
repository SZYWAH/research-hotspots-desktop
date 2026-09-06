import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = json(join(ROOT, "package.json"));
const version = pkg.version;
const outputRoot = process.env.SIDERA_RELEASE_OUTPUT_DIR
  ? resolve(process.env.SIDERA_RELEASE_OUTPUT_DIR)
  : join(ROOT, "release", "windows");
const output = join(outputRoot, version);
const installerName = `Research-Hotspots-Desktop_${version}_x64-full-setup.exe`;
const installer = join(output, installerName);
const metadataPath = join(output, "BUILD_METADATA.json");
const sumsPath = join(output, "SHA256SUMS.txt");
const packagedSeedPath = join(output, "default-library-manifest.json");
const semanticPath = join(output, "semantic-model-manifest.json");
const ocrPath = join(output, "ocr-model-manifest.json");

for (const path of [
  installer,
  metadataPath,
  sumsPath,
  packagedSeedPath,
  semanticPath,
  ocrPath,
  join(output, "SEMANTIC_MODEL_LICENSE_MIT.txt"),
  join(output, "OCR_MODEL_LICENSE_APACHE_2_0.txt"),
]) {
  assert(existsSync(path), `missing Full Demo artifact: ${path}`);
}

const metadata = json(metadataPath);
const seed = json(packagedSeedPath);
const semantic = json(semanticPath);
const ocr = json(ocrPath);
const installerHash = sha256(installer);
const installerBytes = statSync(installer).size;

assert(metadata.artifactKind === "internal-demo", "artifact kind must be internal-demo");
assert(metadata.appVersion === version && seed.appVersion === version, "Demo version metadata is not aligned");
assert(metadata.sourceDirty === false && /^[0-9a-f]{40}$/.test(metadata.revision), "Demo must be tied to a clean exact Git revision");
assert(metadata.installerFile === installerName, "installer filename metadata mismatch");
assert(metadata.installerBytes === installerBytes && metadata.installerSha256 === installerHash, "installer identity metadata mismatch");
assert(seed.databaseSchemaVersion === 13 && seed.paperCount === 25463 && seed.hotspotCount === 160 && seed.membershipCount === 25463, "historical seed identity mismatch");
assert(metadata.defaultLibrarySha256 === seed.sha256 && metadata.defaultSnapshotId === seed.snapshotId, "seed metadata mismatch");
assert(metadata.semanticModelId === semantic.modelId && metadata.semanticModelRevision === semantic.revision, "semantic model metadata mismatch");
assert(ocr.modelId === "PP-OCRv5-mobile-det-rec" && ocr.runtime?.executionProvider === "CPU" && ocr.runtime?.intraOpThreads === 2 && ocr.runtime?.directML === false, "OCR runtime contract mismatch");
assert(metadata.ocrModelId === ocr.modelId && metadata.ocrModelRevision === ocr.modelRevision && metadata.ocrManifestSha256 === sha256(ocrPath), "OCR metadata mismatch");
for (const resource of ["default-library", "semantic-cpu-portable", "semantic-directml", "pp-ocrv5-mobile-det-rec"]) {
  assert(metadata.fullResources?.includes(resource), `Full Demo metadata omits ${resource}`);
}

const sums = readFileSync(sumsPath, "utf8");
for (const name of [
  installerName,
  "BUILD_METADATA.json",
  "default-library-manifest.json",
  "semantic-model-manifest.json",
  "ocr-model-manifest.json",
  "SEMANTIC_MODEL_LICENSE_MIT.txt",
  "OCR_MODEL_LICENSE_APACHE_2_0.txt",
  "RELEASE_NOTES_zh-CN.md",
  "RELEASE_NOTES_en-US.md",
]) {
  const path = join(output, name);
  assert(existsSync(path), `missing checksum target: ${name}`);
  assert(sums.includes(`${sha256(path)}  ${name}`), `checksum mismatch or omission: ${name}`);
}

console.log(JSON.stringify({
  ok: true,
  artifactKind: metadata.artifactKind,
  version,
  revision: metadata.revision,
  installer: installerName,
  installerBytes,
  installerSha256: installerHash,
  snapshotId: seed.snapshotId,
  semanticModelId: semantic.modelId,
  ocrModelId: ocr.modelId,
}, null, 2));

function json(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function assert(condition, message) {
  if (!condition) throw new Error(`Sidera Full Demo audit failed: ${message}`);
}
