import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const forbidden = [
  /VITE_DEEPSEEK_API_KEY/i,
  /Authorization\s*:\s*["']?Bearer\s+[A-Za-z0-9_-]{12,}/i,
  /x-api-key\s*[:=]\s*["'][A-Za-z0-9_-]{12,}/i,
  /sk-[A-Za-z0-9_-]{16,}/,
  /AGENT_RELEASE_SECRET_SENTINEL/,
];
const scanned = [];
for (const directory of [join(root, "dist"), join(root, "release", "windows")]) {
  if (!existsSync(directory)) continue;
  walk(directory, (file) => {
    if (statSync(file).size > 32 * 1024 * 1024 || /\.(exe|sqlite|png|ico)$/i.test(file)) return;
    const text = readFileSync(file, "utf8");
    for (const pattern of forbidden) {
      if (pattern.test(text)) throw new Error(`Credential-like release content in ${file}: ${pattern}`);
    }
    scanned.push(file);
  });
}
const runtime = readFileSync(join(root, "src-tauri", "src", "agent_runtime.rs"), "utf8");
const gateway = readFileSync(join(root, "src-tauri", "src", "agent_model_gateway.rs"), "utf8");
const checks = {
  noFrontendCredentialEnv: !readFileSync(join(root, "src", "lib", "desktop.ts"), "utf8").includes("VITE_DEEPSEEK_API_KEY"),
  credentialManagerOnly: runtime.includes("read_app_credential") && runtime.includes("set_app_credential"),
  endpointPolicy: /allow_local_http|PRIVATE|redirect/i.test(gateway),
  rawResponseNotPersisted: !runtime.includes("raw_response_json"),
  htmlEscaped: runtime.includes("html_escape(markdown)"),
  operationBoundExport: runtime.includes("operation_suffix"),
};
const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
if (failed.length) throw new Error(`Agent release security audit failed: ${failed.join(", ")}`);
console.log(JSON.stringify({ ok: true, scannedTextArtifacts: scanned.length, checks }, null, 2));

function walk(directory, visit) {
  for (const name of readdirSync(directory)) {
    const file = join(directory, name);
    if (statSync(file).isDirectory()) walk(file, visit); else visit(file);
  }
}
