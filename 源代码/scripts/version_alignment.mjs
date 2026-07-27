import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

export function parseCargoPackageVersion(cargoToml) {
  const packageHeader = cargoToml.match(/^\[package\]\s*$/m);
  if (!packageHeader || packageHeader.index === undefined) return "unknown";
  const remainder = cargoToml.slice(packageHeader.index + packageHeader[0].length);
  const nextSection = remainder.search(/^\[[^\]]+\]\s*$/m);
  const packageSection = nextSection >= 0 ? remainder.slice(0, nextSection) : remainder;
  return packageSection.match(/^version\s*=\s*"([^"]+)"/m)?.[1] ?? "unknown";
}

export function evaluateVersionAlignment({ packageVersion, tauriVersion, cargoToml }) {
  const cargoVersion = parseCargoPackageVersion(cargoToml);
  const packageVersionValid = SEMVER_PATTERN.test(packageVersion);
  return {
    aligned: packageVersionValid
      && tauriVersion === packageVersion
      && cargoVersion === packageVersion,
    packageVersion,
    tauriVersion,
    cargoVersion,
    packageVersionValid,
  };
}

export async function readProjectVersionAlignment(root) {
  const [packageJson, tauriConf, cargoToml] = await Promise.all([
    readFile(path.join(root, "package.json"), "utf8").then(JSON.parse),
    readFile(path.join(root, "src-tauri", "tauri.conf.json"), "utf8").then(JSON.parse),
    readFile(path.join(root, "src-tauri", "Cargo.toml"), "utf8"),
  ]);
  return evaluateVersionAlignment({
    packageVersion: packageJson.version,
    tauriVersion: tauriConf.version,
    cargoToml,
  });
}

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(scriptDir, "..");
  const current = await readProjectVersionAlignment(root);
  assert(current.aligned, `project version mismatch: ${JSON.stringify(current)}`);

  if (process.argv.includes("--current-only")) {
    console.log(JSON.stringify({ pass: true, current }, null, 2));
    return;
  }

  const tauriMismatch = evaluateVersionAlignment({
    packageVersion: current.packageVersion,
    tauriVersion: `${current.packageVersion}-mismatch`,
    cargoToml: `[package]\nname = "fixture"\nversion = "${current.packageVersion}"\n`,
  });
  const cargoMismatch = evaluateVersionAlignment({
    packageVersion: current.packageVersion,
    tauriVersion: current.packageVersion,
    cargoToml: `[package]\nname = "fixture"\nversion = "${current.packageVersion}-mismatch"\n`,
  });

  assert.equal(tauriMismatch.aligned, false, "Tauri version mismatch was accepted");
  assert.equal(cargoMismatch.aligned, false, "Cargo version mismatch was accepted");

  console.log(JSON.stringify({
    pass: true,
    cases: {
      currentAligned: current.aligned,
      tauriMismatchRejected: !tauriMismatch.aligned,
      cargoMismatchRejected: !cargoMismatch.aligned,
    },
    current,
  }, null, 2));
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
