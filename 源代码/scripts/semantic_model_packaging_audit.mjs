import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = json("resources/semantic-model/semantic-model-manifest.json");
const full = json("src-tauri/tauri.full.conf.json");
const lite = json("src-tauri/tauri.lite.conf.json");
const modelDir = join(root, "release-assets", "semantic-model");
const fullResources = full.bundle?.resources ?? {};
const liteResources = lite.bundle?.resources ?? {};

assert(manifest.modelId === "intfloat/multilingual-e5-small", "unexpected semantic model");
assert(manifest.dimensions === 384, "unexpected embedding dimensions");
assert(manifest.license === "MIT" && manifest.licenseFile === "LICENSE-MIT.txt", "semantic model license metadata is missing");
assert(existsSync(join(root, "resources", "semantic-model", "LICENSE-MIT.txt")), "MIT license missing");

for (const key of ["cpuPortable", "gpu", "tokenizer", "config", "specialTokens", "tokenizerConfig"]) {
  const file = manifest.files[key];
  const path = join(modelDir, file.target);
  assert(existsSync(path), `${key} resource is missing`);
  assert(statSync(path).size === file.size, `${key} size mismatch`);
  assert(sha256(path) === file.sha256, `${key} SHA-256 mismatch`);
}
for (const name of ["semantic-model-manifest.json", "LICENSE-MIT.txt"]) {
  assert(existsSync(join(modelDir, name)), `${name} is not prepared`);
}

const destinations = (resources) => Object.values(resources);
const sources = (resources) => Object.keys(resources);
const fullDestinations = destinations(fullResources);
const liteDestinations = destinations(liteResources);
assert(fullDestinations.includes("default-library/research-hotspots-v7.sqlite"), "Full seed missing");
assert(fullDestinations.includes("semantic-model/model.cpu-portable.onnx"), "Full CPU model missing");
assert(fullDestinations.includes("semantic-model/model.gpu.onnx"), "Full GPU model missing");
assert(liteDestinations.includes("semantic-model/model.cpu-portable.onnx"), "Lite CPU model missing");
assert(!liteDestinations.includes("semantic-model/model.gpu.onnx"), "Lite must not include GPU model");
assert(!sources(liteResources).some((path) => /default-library|research-hotspots-v7\.sqlite/.test(path)), "Lite must not include a default library");
for (const name of [
  "tokenizer.json", "config.json", "special_tokens_map.json", "tokenizer_config.json",
  "semantic-model-manifest.json", "LICENSE-MIT.txt",
]) {
  assert(fullDestinations.includes(`semantic-model/${name}`), `Full ${name} missing`);
  assert(liteDestinations.includes(`semantic-model/${name}`), `Lite ${name} missing`);
}

console.log(JSON.stringify({
  ok: true,
  modelId: manifest.modelId,
  revision: manifest.revision,
  fullHasGpu: true,
  liteHasGpu: false,
  cpuBytes: manifest.files.cpuPortable.size,
  gpuBytes: manifest.files.gpu.size,
}));

function json(path) {
  return JSON.parse(readFileSync(join(root, path), "utf8"));
}
function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
function assert(condition, message) {
  if (!condition) throw new Error(`semantic model packaging audit failed: ${message}`);
}
