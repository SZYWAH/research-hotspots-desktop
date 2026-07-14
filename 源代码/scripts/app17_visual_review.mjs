import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const DATABASE_FILE = "research-hotspots-v7.sqlite";
const REVIEW_URL = "http://127.0.0.1:5174/?visual-review=galaxy";
const rootDir = process.cwd();
const reviewRoot = join(rootDir, ".visual-review");
const snapshotDir = join(reviewRoot, "app17");
const manifestPath = join(snapshotDir, "manifest.json");
const configPath = join(reviewRoot, "config.json");

function parseArgs(argv) {
  const args = { command: "serve", projectId: "project-default", force: false, open: true };
  let index = 0;
  if (argv[0] === "snapshot" || argv[0] === "serve") {
    args.command = argv[0];
    index = 1;
  }
  while (index < argv.length) {
    const value = argv[index];
    if (value === "--") {
      index += 1;
    } else if (value === "--database-dir") {
      args.databaseDir = argv[index + 1];
      index += 2;
    } else if (value === "--database-path") {
      args.databasePath = argv[index + 1];
      index += 2;
    } else if (value === "--project-id") {
      args.projectId = argv[index + 1];
      index += 2;
    } else if (value === "--force") {
      args.force = true;
      index += 1;
    } else if (value === "--no-open") {
      args.open = false;
      index += 1;
    } else {
      throw new Error(`Unsupported argument: ${value}`);
    }
  }
  return args;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
}

function comparablePath(path) {
  const withoutExtendedPrefix = path.replace(/^\\\\\?\\/, "");
  const normalized = resolve(withoutExtendedPrefix);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function resolveDatabase(args) {
  const saved = readJson(configPath) ?? {};
  const explicitPath = args.databasePath || process.env.APP17_VISUAL_REVIEW_DATABASE_PATH;
  const explicitDir = args.databaseDir || process.env.APP17_VISUAL_REVIEW_DATABASE_DIR;
  const candidates = [];
  if (explicitPath) candidates.push(resolve(explicitPath));
  if (explicitDir) candidates.push(join(resolve(explicitDir), DATABASE_FILE));
  if (!explicitPath && !explicitDir) {
    if (saved.databasePath) candidates.push(resolve(saved.databasePath));
    if (saved.databaseDir) candidates.push(join(resolve(saved.databaseDir), DATABASE_FILE));
    if (process.env.APPDATA) candidates.push(join(process.env.APPDATA, "com.local.research-hotspots-desktop", DATABASE_FILE));
    if (process.env.LOCALAPPDATA) candidates.push(join(process.env.LOCALAPPDATA, "com.local.research-hotspots-desktop", DATABASE_FILE));
  }
  const databasePath = candidates.find((candidate) => existsSync(candidate));
  if (!databasePath) {
    throw new Error([
      "未找到 research-hotspots-v7.sqlite。",
      "请运行：pnpm visual:galaxy -- --database-dir \"<数据库目录>\"",
      `已检查：${candidates.length ? candidates.join("; ") : "未提供目录，且没有已保存配置"}`,
    ].join("\n"));
  }
  return {
    databasePath,
    databaseDir: dirname(databasePath),
    projectId: args.projectId || saved.projectId || "project-default",
  };
}

function snapshotIsCurrent(database, force) {
  if (force || !existsSync(manifestPath)) return false;
  const manifest = readJson(manifestPath);
  const saved = readJson(configPath);
  if (!manifest || manifest.schemaVersion !== 1) return false;
  const databaseStat = statSync(database.databasePath);
  return saved?.databasePath
    && comparablePath(saved.databasePath) === comparablePath(database.databasePath)
    && manifest.projectId === database.projectId
    && Math.abs(Number(manifest.databaseModifiedMs) - databaseStat.mtimeMs) < 2;
}

function exportSnapshot(database, force) {
  mkdirSync(snapshotDir, { recursive: true });
  if (snapshotIsCurrent(database, force)) {
    const manifest = readJson(manifestPath);
    console.log(`视觉快照未变化，跳过导出：${manifest.paperCount} 篇论文 / ${manifest.hotspotCount} 个热点`);
    return;
  }
  const cargoArgs = [
    "run",
    "--quiet",
    "--manifest-path",
    "src-tauri/Cargo.toml",
    "--bin",
    "export_app17_visual_review",
    "--",
    "--database-path",
    database.databasePath,
    "--project-id",
    database.projectId,
    "--output-dir",
    snapshotDir,
  ];
  const cargo = spawnSync("cargo", cargoArgs, { cwd: rootDir, stdio: "inherit", shell: false });
  if (cargo.error) throw cargo.error;
  if (cargo.status !== 0) throw new Error(`快照导出失败，cargo 退出码 ${cargo.status ?? "unknown"}。`);
  mkdirSync(reviewRoot, { recursive: true });
  writeFileSync(configPath, `${JSON.stringify(database, null, 2)}\n`, "utf8");
}

async function endpointReady(path = "/") {
  try {
    const response = await fetch(`http://127.0.0.1:5174${path}`, { cache: "no-store" });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForServer(child) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 20_000) {
    if (child.exitCode !== null) throw new Error(`Vite 提前退出，退出码 ${child.exitCode}。`);
    if (await endpointReady("/manifest.json")) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 200));
  }
  throw new Error("等待 Vite 视觉审查服务器超时。请检查 5174 端口是否被其他程序占用。");
}

function openBrowser() {
  if (process.platform === "win32") {
    const child = spawn("explorer.exe", [REVIEW_URL], { detached: true, stdio: "ignore" });
    child.unref();
    return;
  }
  const command = process.platform === "darwin" ? "open" : "xdg-open";
  const child = spawn(command, [REVIEW_URL], { detached: true, stdio: "ignore" });
  child.unref();
}

async function serve(args) {
  if (await endpointReady("/manifest.json")) {
    console.log(`视觉审查服务器已运行：${REVIEW_URL}`);
    if (args.open) openBrowser();
    return;
  }
  if (await endpointReady("/")) {
    throw new Error("5174 端口已有旧 Vite 服务，但尚未加载视觉快照路由。请先停止旧的 tauri dev/Vite，再重新运行本命令。");
  }
  const viteEntry = join(rootDir, "node_modules", "vite", "bin", "vite.js");
  const child = spawn(process.execPath, [viteEntry, "--host", "127.0.0.1"], {
    cwd: rootDir,
    stdio: "inherit",
    shell: false,
  });
  const stop = () => {
    if (!child.killed) child.kill();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  await waitForServer(child);
  console.log(`浏览器视觉审查已就绪：${REVIEW_URL}`);
  if (args.open) openBrowser();
  await new Promise((resolvePromise, rejectPromise) => {
    child.once("exit", (code) => code === 0 || code === null ? resolvePromise() : rejectPromise(new Error(`Vite 退出码 ${code}。`)));
    child.once("error", rejectPromise);
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const database = resolveDatabase(args);
  exportSnapshot(database, args.force);
  if (args.command === "serve") await serve(args);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
