import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const gateScript = path.join(root, "scripts", "v20_final_acceptance_gate.ps1");

const rawArgs = process.argv.slice(2);
const terminalMode = rawArgs.includes("--codex-terminal-ready");
const passThroughArgs = rawArgs.filter((arg) => arg !== "--" && arg !== "--codex-terminal-ready");
const injectedArgs = terminalMode ? ["-RequireLiveAi", "-RequireTerminalReady"] : [];
const powershell = process.platform === "win32" ? "powershell.exe" : "pwsh";

const result = spawnSync(
  powershell,
  ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", gateScript, ...injectedArgs, ...passThroughArgs],
  {
    cwd: root,
    stdio: "inherit",
    shell: false,
  },
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
