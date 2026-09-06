import { execFileSync, spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPOSITORY_ROOT = path.resolve(ROOT, "..");
const PORT = 5174;
const APP_PROCESS = "research-hotspots-desktop";
const packageRunner = process.platform === "win32"
  ? {
      command: process.env.ComSpec || "cmd.exe",
      args: ["/d", "/c", "pnpm", "tauri", "dev"],
    }
  : {
      command: "pnpm",
      args: ["tauri", "dev"],
    };

const running = capture("pwsh", [
  "-NoProfile",
  "-Command",
  `Get-Process -Name '${APP_PROCESS}' -ErrorAction SilentlyContinue | Select-Object Id,StartTime,Path | ConvertTo-Json -Compress; exit 0`,
]).trim();

if (running) {
  fail(`SIDERA_DESKTOP_ALREADY_RUNNING: 请先正常关闭现有 Sidera。\n${running}`);
}

if (await portIsOpen(PORT)) {
  fail(`SIDERA_DEV_PORT_IN_USE: 127.0.0.1:${PORT} 已被占用，请先关闭旧 Vite/Tauri 开发任务。`);
}

const gitArgs = ["-c", `safe.directory=${REPOSITORY_ROOT}`];
const revision = capture("git", [...gitArgs, "rev-parse", "HEAD"]).trim();
const trackedDirty = capture("git", [...gitArgs, "status", "--porcelain=v1", "--untracked-files=no"]).trim().length > 0;
const buildRevision = `${revision}${trackedDirty ? "-dirty" : ""}`;
console.log(JSON.stringify({
  launcher: "sidera-desktop-dev",
  root: ROOT,
  revision: buildRevision,
  port: PORT,
  cargoJobs: 2,
}, null, 2));

const child = spawn(packageRunner.command, packageRunner.args, {
  cwd: ROOT,
  stdio: "inherit",
  windowsHide: true,
  env: {
    ...process.env,
    CARGO_BUILD_JOBS: "2",
    VITE_BUILD_REVISION: buildRevision,
  },
});

child.once("error", (error) => fail(`SIDERA_DESKTOP_LAUNCH_FAILED: ${error.message}`));
child.once("exit", (code, signal) => {
  if (signal) {
    console.error(`Sidera 开发任务被信号 ${signal} 终止。`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = code ?? 1;
});

function capture(command, args) {
  try {
    return execFileSync(command, args, {
      cwd: ROOT,
      encoding: "utf8",
      windowsHide: true,
    });
  } catch (error) {
    fail(`SIDERA_DESKTOP_PREFLIGHT_FAILED: ${command} ${args.join(" ")}\n${error.stderr || error.message}`);
  }
}

function portIsOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    const finish = (open) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(500);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
