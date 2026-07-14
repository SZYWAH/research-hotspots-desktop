import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const outputDir = path.join(root, "outputs");
const args = process.argv.slice(2).filter((arg) => arg !== "--");

if (args.includes("--help") || args.includes("-h")) {
  printHelp();
  process.exit(0);
}

const configPath = path.resolve(readOption("--config") || path.join(root, "configs", "v20_terminal_acceptance.example.json"));
const outputPath = path.resolve(readOption("--output") || path.join(outputDir, "v20_storage_preflight.json"));
const minFreeGb = parseNonNegativeNumber(readOption("--min-free-gb"), "--min-free-gb", 10);
const requireMinFree = args.includes("--require-min-free");
const requireNonCStorage = args.includes("--require-non-c-storage");

await mkdir(path.dirname(outputPath), { recursive: true });

const config = await readJson(configPath);
const driveInfo = getFileSystemDrives();
const targets = buildTargets(config);
const warnings = [];
const errors = [];

for (const target of targets) {
  const drive = driveInfo.byName.get(target.driveLetter?.toUpperCase() ?? "");
  target.drive = drive
    ? {
        name: drive.name,
        root: drive.root,
        freeGb: drive.freeGb,
        usedGb: drive.usedGb,
      }
    : null;

  if (!target.driveLetter) {
    warnings.push(`${target.name} is not a drive-letter path: ${target.path}`);
    continue;
  }
  if (!drive) {
    warnings.push(`${target.name} drive was not found: ${target.driveLetter}`);
    if (requireMinFree || requireNonCStorage) errors.push(`${target.name} drive was not found: ${target.driveLetter}`);
    continue;
  }
  if (target.largeWrite && target.driveLetter.toUpperCase() === "C") {
    warnings.push(`${target.name} is on C drive. Prefer D drive for 100000+ library storage: ${target.path}`);
    if (requireNonCStorage) errors.push(`${target.name} must not be on C drive in strict storage mode.`);
  }
  if (target.largeWrite && drive.freeGb < minFreeGb) {
    warnings.push(`${target.name} drive has ${drive.freeGb.toFixed(2)} GB free; recommended minimum is ${minFreeGb} GB.`);
    if (requireMinFree) errors.push(`${target.name} drive free space is below ${minFreeGb} GB.`);
  }
}

const result = {
  generatedAt: new Date().toISOString(),
  projectRoot: root,
  configPath,
  minFreeGb,
  requireMinFree,
  requireNonCStorage,
  passed: errors.length === 0,
  errors,
  warnings,
  drives: driveInfo.drives,
  targets,
};

await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

console.log(`Storage preflight ${result.passed ? "passed" : "failed"}: warnings=${warnings.length}, errors=${errors.length}`);
console.log(`Output: ${outputPath}`);
if (warnings.length > 0) {
  console.log("Warnings:");
  for (const warning of warnings) console.log(`- ${warning}`);
}
if (errors.length > 0) {
  console.error("Errors:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

function buildTargets(config) {
  const convertedImportDir = config.convertedImportDir || "D:\\ResearchHotspotsDesktop\\imports";
  const databaseTarget = config.databasePath
    ? path.dirname(resolveMaybeRelative(config.databasePath))
    : config.databaseDir
      ? resolveMaybeRelative(config.databaseDir)
      : null;
  return [
    target("libraryPath", config.libraryPath, false),
    target("database storage", databaseTarget, true),
    target("converted import dir", convertedImportDir, true),
    target("generated report dir", config.generatedHotspotReportPath ? path.dirname(resolveMaybeRelative(config.generatedHotspotReportPath)) : outputDir, false),
  ].filter((item) => item.path);
}

function target(name, value, largeWrite) {
  if (!value) return { name, path: null, largeWrite, driveLetter: null };
  const resolved = resolveMaybeRelative(value);
  return {
    name,
    path: resolved,
    largeWrite,
    driveLetter: getDriveLetter(resolved),
  };
}

function resolveMaybeRelative(value) {
  const text = String(value);
  return path.isAbsolute(text) ? text : path.resolve(root, text);
}

function getDriveLetter(value) {
  const match = String(value).match(/^([A-Za-z]):[\\/]/);
  return match ? match[1].toUpperCase() : null;
}

function getFileSystemDrives() {
  if (process.platform !== "win32") {
    return { drives: [], byName: new Map() };
  }
  const command = "[System.IO.DriveInfo]::GetDrives() | Where-Object { $_.DriveType -eq 'Fixed' } | Select-Object Name,AvailableFreeSpace,TotalSize | ConvertTo-Json -Compress";
  const result = spawnSync("powershell.exe", ["-NoProfile", "-Command", command], {
    cwd: root,
    encoding: "utf8",
    shell: false,
  });
  if (result.error || result.status !== 0) {
    return { drives: [], byName: new Map() };
  }
  try {
    const parsed = JSON.parse(result.stdout.trim() || "[]");
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    const drives = rows.map((row) => {
      const rootName = String(row.Name ?? "");
      const driveName = rootName.match(/^([A-Za-z]):/)?.[1]?.toUpperCase() ?? rootName.toUpperCase();
      return {
        name: driveName,
        root: rootName,
        freeBytes: Number(row.AvailableFreeSpace ?? 0),
        usedBytes: Math.max(0, Number(row.TotalSize ?? 0) - Number(row.AvailableFreeSpace ?? 0)),
        freeGb: Number(row.AvailableFreeSpace ?? 0) / 1024 ** 3,
        usedGb: Math.max(0, Number(row.TotalSize ?? 0) - Number(row.AvailableFreeSpace ?? 0)) / 1024 ** 3,
      };
    });
    return { drives, byName: new Map(drives.map((drive) => [drive.name, drive])) };
  } catch {
    return { drives: [], byName: new Map() };
  }
}

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read config ${filePath}: ${error.message}`);
  }
}

function readOption(name) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  return args[index + 1];
}

function parseNonNegativeNumber(value, name, fallback) {
  if (value === undefined) return fallback;
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${name} must be a non-negative number.`);
  return parsed;
}

function printHelp() {
  console.log(`
Usage:
  node scripts/v20_storage_preflight.mjs --config configs/v20_terminal_acceptance.example.json

Options:
  --config <path>              Terminal acceptance config path.
  --output <path>              JSON report path.
  --min-free-gb <number>       Recommended free space for large write targets. Defaults to 10.
  --require-min-free           Fail if large write target drives have less than --min-free-gb.
  --require-non-c-storage      Fail if database/import large write targets are on C drive.
`.trim());
}
