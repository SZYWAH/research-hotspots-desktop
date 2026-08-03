import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const root = process.cwd();
const packageJsonPath = path.join(
  root,
  "node_modules",
  "@earendil-works",
  "pi-coding-agent",
  "package.json",
);
const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
assert.equal(packageJson.version, "0.82.1", "Pi dependency must remain pinned to 0.82.1");
assert.equal(packageJson.bin?.pi, "dist/cli.js", "Pi bin entry changed unexpectedly");

const rustSource = await readFile(path.join(root, "src-tauri", "src", "sidera_pi_runtime.rs"), "utf8");
const appSource = await readFile(path.join(root, "src", "App.tsx"), "utf8");
const desktopBridge = await readFile(path.join(root, "src", "lib", "sideraPi.ts"), "utf8");

for (const flag of [
  "--mode",
  "--session-dir",
  "--session-id",
  "--no-builtin-tools",
  "--extension",
  "--no-extensions",
  "--no-skills",
  "--no-prompt-templates",
  "--no-context-files",
  "--no-approve",
]) {
  assert.ok(rustSource.includes(`\"${flag}\"`), `Rust runtime must pass ${flag}`);
}
assert.ok(!rustSource.includes('"--no-session"'), "Sidera runtime must preserve Pi sessions");
assert.ok(rustSource.includes("PI_CODING_AGENT_DIR"), "Pi config directory must be isolated");
assert.ok(rustSource.includes("sidera_get_library_overview,sidera_search_local_papers,sidera_get_papers_by_ids,sidera_finalize_evidence"), "Pi must retain the four Sidera library tools");
assert.ok(rustSource.includes("sidera_list_directory,sidera_read_file,sidera_search_files,sidera_fetch_url"), "Pi must receive the audited read-tool allowlist");
assert.ok(rustSource.includes("$SIDERA_PI_API_KEY"), "models.json must reference an environment key");
assert.ok(!rustSource.includes('.arg(api_key)'), "API key must not be a process argument");
assert.ok(!rustSource.includes('"type": "bash"'), "Sidera runtime must not issue Pi bash commands");
assert.ok(appSource.includes("submitSideraPiPrompt"), "formal Sidera input must use Pi");
assert.ok(!desktopBridge.includes('invoke<') || !desktopBridge.includes('"ai_chat"'), "Pi bridge must not fall back to ai_chat");

const isolatedDir = await mkdtemp(path.join(tmpdir(), "sidera-pi-rpc-audit-"));
const fakeKey = "sidera-audit-key-must-not-appear";
const models = {
  providers: {
    "sidera-openai-compatible": {
      baseUrl: "https://example.invalid/v1",
      api: "openai-completions",
      apiKey: "$SIDERA_PI_API_KEY",
      models: [{ id: "sidera-audit-model" }],
    },
  },
};
await writeFile(path.join(isolatedDir, "models.json"), JSON.stringify(models, null, 2), "utf8");

const piBin = path.join(path.dirname(packageJsonPath), packageJson.bin.pi);
const args = [
  piBin,
  "--mode",
  "rpc",
  "--no-session",
  "--no-tools",
  "--no-extensions",
  "--no-skills",
  "--no-prompt-templates",
  "--no-context-files",
  "--no-approve",
  "--provider",
  "sidera-openai-compatible",
  "--model",
  "sidera-audit-model",
];

let stderr = "";
let stdoutPending = "";
const child = spawn(process.execPath, args, {
  cwd: isolatedDir,
  windowsHide: true,
  stdio: ["pipe", "pipe", "pipe"],
  env: {
    ...process.env,
    PI_CODING_AGENT_DIR: isolatedDir,
    PI_SKIP_VERSION_CHECK: "1",
    PI_TELEMETRY: "0",
    SIDERA_PI_API_KEY: fakeKey,
  },
});

const response = await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error("Pi RPC get_state timed out")), 12_000);
  child.once("error", reject);
  child.once("exit", (code) => {
    if (code !== null && code !== 0) reject(new Error(`Pi RPC exited before get_state (${code})`));
  });
  child.stderr.on("data", (chunk) => {
    stderr = (stderr + chunk.toString("utf8")).slice(-16_384);
  });
  child.stdout.on("data", (chunk) => {
    stdoutPending += chunk.toString("utf8");
    while (stdoutPending.includes("\n")) {
      const lf = stdoutPending.indexOf("\n");
      const line = stdoutPending.slice(0, lf).replace(/\r$/, "");
      stdoutPending = stdoutPending.slice(lf + 1);
      if (!line) continue;
      let record;
      try {
        record = JSON.parse(line);
      } catch (error) {
        clearTimeout(timeout);
        reject(new Error(`Pi emitted invalid JSONL: ${error}`));
        return;
      }
      if (record.type === "response" && record.id === "audit-state") {
        clearTimeout(timeout);
        resolve(record);
        return;
      }
    }
  });
  child.stdin.write(`${JSON.stringify({ id: "audit-state", type: "get_state" })}\n`);
});

assert.equal(response.success, true, "Pi RPC get_state must succeed without a model request");
assert.equal(response.command, "get_state");
assert.equal(response.data?.model?.provider, "sidera-openai-compatible");
assert.equal(response.data?.model?.id, "sidera-audit-model");
assert.ok(!stderr.includes(fakeKey), "Pi stderr must not reveal the API key");

const exited = new Promise((resolve) => child.once("exit", resolve));
child.kill();
await Promise.race([
  exited,
  new Promise((resolve) => setTimeout(resolve, 2_000)),
]);
for (let attempt = 0; attempt < 5; attempt += 1) {
  try {
    await rm(isolatedDir, { recursive: true, force: true });
    break;
  } catch (error) {
    if (attempt === 4) throw error;
    await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
  }
}

console.log(JSON.stringify({
  status: "PASS",
  packageVersion: packageJson.version,
  bin: packageJson.bin.pi,
  rpc: "get_state",
  provider: response.data.model.provider,
  model: response.data.model.id,
  tools: "disabled",
  credentialsExposed: false,
}, null, 2));
