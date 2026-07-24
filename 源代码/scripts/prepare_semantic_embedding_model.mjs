import { createHash } from "node:crypto";
import { createWriteStream, existsSync } from "node:fs";
import { copyFile, mkdir, readFile, rename, rm, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = join(root, "resources", "semantic-model", "semantic-model-manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const destination = resolve(process.env.SEMANTIC_MODEL_DIR || join(root, "release-assets", "semantic-model"));
const base = `https://huggingface.co/${manifest.modelId}/resolve/${manifest.revision}`;
const selected = process.argv.includes("--gpu")
  ? ["gpu", "tokenizer", "config", "specialTokens", "tokenizerConfig"]
  : ["cpuPortable", "tokenizer", "config", "specialTokens", "tokenizerConfig"];

await mkdir(destination, { recursive: true });

async function sha256(path) {
  const hash = createHash("sha256");
  const bytes = await readFile(path);
  hash.update(bytes);
  return hash.digest("hex");
}

async function valid(path, file) {
  if (!existsSync(path)) return false;
  const info = await stat(path);
  if (info.size !== file.size) return false;
  return !file.sha256 || (await sha256(path)) === file.sha256;
}

for (const key of selected) {
  const file = manifest.files[key];
  const target = join(destination, file.target);
  if (await valid(target, file)) {
    console.log(`reuse ${file.target}`);
    continue;
  }
  const partial = `${target}.partial`;
  await rm(partial, { force: true });
  const response = await fetch(`${base}/${file.source}`, { redirect: "follow" });
  if (!response.ok || !response.body) {
    throw new Error(`Cannot download ${file.source}: HTTP ${response.status}`);
  }
  await finished(Readable.fromWeb(response.body).pipe(createWriteStream(partial)));
  if (!(await valid(partial, file))) {
    await rm(partial, { force: true });
    throw new Error(`Checksum or size mismatch for ${file.source}`);
  }
  await rm(target, { force: true });
  await rename(partial, target);
  console.log(`prepared ${file.target}`);
}

await copyFile(manifestPath, join(destination, "semantic-model-manifest.json"));
console.log(JSON.stringify({
  modelId: manifest.modelId,
  revision: manifest.revision,
  destination,
  mode: process.argv.includes("--gpu") ? "gpu" : "cpu",
}, null, 2));
