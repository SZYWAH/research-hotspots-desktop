import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const outputDir = path.join(root, "outputs");

const ENV_FILES = [
  ".env",
  ".env.local",
  ".env.production",
  ".env.production.local",
  ".env.development",
  ".env.development.local",
];
const LOCAL_ENV_FILE = ".env.local";
const VITE_KEYS = {
  apiKey: "VITE_DEEPSEEK_API_KEY",
  baseUrl: "VITE_DEEPSEEK_BASE_URL",
  model: "VITE_DEEPSEEK_MODEL",
};
const LEGACY_KEYS = {
  apiKey: "DEEPSEEK_API_KEY",
  baseUrl: "DEEPSEEK_BASE_URL",
  model: "DEEPSEEK_MODEL_NAME",
};
const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-chat";

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  printHelp();
  process.exit(0);
}

const writeMode = args.includes("--write");
const force = args.includes("--force");
const outputPath = path.resolve(readOption("--output") || path.join(outputDir, "v20_ai_env_bridge.json"));

await mkdir(path.dirname(outputPath), { recursive: true });

const entries = [];
const inspectedFiles = [];
for (const fileName of ENV_FILES) {
  const filePath = path.join(root, fileName);
  if (!(await exists(filePath))) {
    inspectedFiles.push({ fileName, exists: false, variableCount: 0 });
    continue;
  }
  const parsed = parseDotenv(await readFile(filePath, "utf8"), fileName);
  inspectedFiles.push({ fileName, exists: true, variableCount: parsed.entries.length, parseWarnings: parsed.warnings });
  entries.push(...parsed.entries);
}

for (const key of [...Object.values(VITE_KEYS), ...Object.values(LEGACY_KEYS)]) {
  if (process.env[key]) {
    entries.push({
      key,
      value: process.env[key],
      source: "process.env",
      line: null,
      priority: 1000,
    });
  }
}

const current = {
  apiKey: resolveValue(VITE_KEYS.apiKey),
  baseUrl: resolveValue(VITE_KEYS.baseUrl),
  model: resolveValue(VITE_KEYS.model),
};
const legacy = {
  apiKey: resolveValue(LEGACY_KEYS.apiKey),
  baseUrl: resolveValue(LEGACY_KEYS.baseUrl),
  model: resolveValue(LEGACY_KEYS.model),
};

const planned = buildPlannedUpdates({ current, legacy, force });
let writeResult = { wrote: false, file: LOCAL_ENV_FILE, changedKeys: [] };
if (writeMode) {
  writeResult = await writeLocalEnv(planned.updates);
}

const result = {
  generatedAt: new Date().toISOString(),
  mode: writeMode ? "write" : "dry-run",
  force,
  inspectedFiles,
  currentVite: summarizeCurrent(current),
  legacyDeepSeek: summarizeLegacy(legacy),
  plannedUpdates: planned.maskedUpdates,
  writeResult,
  readyAfterBridge: planned.readyAfterBridge,
  recommendations: buildRecommendations({ writeMode, planned, writeResult }),
  notes: [
    "This script never writes raw secrets to the JSON report.",
    "Use --write to update .env.local. Without --write it is a dry-run preview.",
    "Use --force only when you intentionally want legacy DEEPSEEK_* values to replace existing VITE_DEEPSEEK_* values.",
  ],
};

await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

console.log(`AI env bridge ${writeMode ? "write" : "dry-run"} completed: plannedKeys=${planned.maskedUpdates.length}, wrote=${writeResult.wrote}`);
console.log(`Report: ${outputPath}`);
if (result.recommendations.length > 0) {
  console.log("Recommendations:");
  for (const item of result.recommendations) console.log(`- ${item}`);
}

function readOption(name) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  return args[index + 1];
}

function printHelp() {
  console.log(`
Usage:
  node scripts/v20_ai_env_bridge.mjs [--write] [--force] [--output outputs/v20_ai_env_bridge.json]

Copies legacy DEEPSEEK_* values to VITE_DEEPSEEK_* in .env.local for Vite frontend AI use.
Default mode is dry-run and does not write files.
`.trim());
}

function buildPlannedUpdates({ current, legacy, force }) {
  const updates = [];
  const add = (name, targetKey, sourceEntry, fallbackValue = null) => {
    const currentEntry = current[name];
    const sourceValue = String(sourceEntry?.value ?? fallbackValue ?? "").trim();
    if (!sourceValue || isPlaceholder(sourceValue)) return;
    const currentValue = String(currentEntry?.value ?? "").trim();
    if (!force && currentValue && !isPlaceholder(currentValue)) return;
    updates.push({
      key: targetKey,
      value: sourceValue,
      source: sourceEntry?.source ?? "default",
      sourceKey: sourceEntry?.key ?? "default",
      action: currentValue ? "replace-placeholder-or-forced" : "add",
    });
  };

  add("apiKey", VITE_KEYS.apiKey, legacy.apiKey);
  add("baseUrl", VITE_KEYS.baseUrl, legacy.baseUrl, DEFAULT_BASE_URL);
  add("model", VITE_KEYS.model, legacy.model, DEFAULT_MODEL);

  const effective = {
    apiKey: updates.find((item) => item.key === VITE_KEYS.apiKey)?.value ?? current.apiKey?.value ?? "",
    baseUrl: updates.find((item) => item.key === VITE_KEYS.baseUrl)?.value ?? current.baseUrl?.value ?? DEFAULT_BASE_URL,
    model: updates.find((item) => item.key === VITE_KEYS.model)?.value ?? current.model?.value ?? DEFAULT_MODEL,
  };
  const readyAfterBridge =
    Boolean(effective.apiKey) &&
    !isPlaceholder(effective.apiKey) &&
    effective.apiKey.length >= 12 &&
    validateBaseUrl(effective.baseUrl) &&
    Boolean(effective.model) &&
    !isPlaceholder(effective.model);

  return {
    updates,
    maskedUpdates: updates.map((item) => ({
      key: item.key,
      action: item.action,
      source: item.source,
      sourceKey: item.sourceKey,
      value: item.key === VITE_KEYS.apiKey ? maskSecret(item.value) : item.value,
    })),
    readyAfterBridge,
  };
}

async function writeLocalEnv(updates) {
  const filePath = path.join(root, LOCAL_ENV_FILE);
  const changedKeys = [];
  let text = (await exists(filePath)) ? await readFile(filePath, "utf8") : "";
  const lines = text ? text.split(/\r?\n/) : [];

  for (const update of updates) {
    const rawLine = `${update.key}=${quoteEnvValue(update.value)}`;
    const index = lines.findIndex((line) => {
      const trimmed = line.trim();
      return trimmed && !trimmed.startsWith("#") && trimmed.replace(/^export\s+/, "").startsWith(`${update.key}=`);
    });
    if (index >= 0) lines[index] = rawLine;
    else lines.push(rawLine);
    changedKeys.push(update.key);
  }

  if (changedKeys.length > 0) {
    await writeFile(filePath, `${lines.filter((line, index) => index < lines.length - 1 || line.trim()).join("\n")}\n`, "utf8");
  }
  return {
    wrote: changedKeys.length > 0,
    file: LOCAL_ENV_FILE,
    changedKeys,
  };
}

function summarizeCurrent(values) {
  return {
    apiKey: summarizeSecret(values.apiKey),
    baseUrl: summarizePlain(values.baseUrl, DEFAULT_BASE_URL),
    model: summarizePlain(values.model, DEFAULT_MODEL),
  };
}

function summarizeLegacy(values) {
  return {
    apiKey: summarizeSecret(values.apiKey),
    baseUrl: summarizePlain(values.baseUrl),
    model: summarizePlain(values.model),
  };
}

function summarizeSecret(entry) {
  if (!entry) return { status: "missing", present: false, source: null, line: null, masked: null, length: 0, placeholderLike: false };
  const value = String(entry.value).trim();
  return {
    status: isPlaceholder(value) ? "placeholder" : "present",
    present: true,
    source: entry.source,
    line: entry.line,
    masked: maskSecret(value),
    length: value.length,
    placeholderLike: isPlaceholder(value),
  };
}

function summarizePlain(entry, fallback = null) {
  if (!entry && fallback === null) return { status: "missing", present: false, source: null, line: null, value: null };
  const value = String(entry?.value ?? fallback).trim();
  return {
    status: entry ? (isPlaceholder(value) ? "placeholder" : "present") : "default",
    present: Boolean(entry),
    source: entry?.source ?? "default",
    line: entry?.line ?? null,
    value,
  };
}

function buildRecommendations({ writeMode, planned, writeResult }) {
  const recommendations = [];
  if (planned.maskedUpdates.length === 0) {
    recommendations.push("No bridge updates are needed, or no usable legacy DEEPSEEK_* values were found.");
  } else if (!writeMode) {
    recommendations.push("Dry-run only. Re-run with --write to update .env.local.");
  } else if (writeResult.wrote) {
    recommendations.push("Re-run scripts/v20_ai_config_preflight.mjs --require-live to verify live AI readiness.");
  }
  if (!planned.readyAfterBridge) {
    recommendations.push("Even after planned bridge updates, live AI readiness may still be false; verify the API key and endpoint.");
  }
  return recommendations;
}

function parseDotenv(text, fileName) {
  const warnings = [];
  const entries = [];
  const priority = ENV_FILES.indexOf(fileName);
  text.split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const normalized = trimmed.startsWith("export ") ? trimmed.slice(7).trim() : trimmed;
    const equalsIndex = normalized.indexOf("=");
    if (equalsIndex <= 0) {
      warnings.push({ line: index + 1, message: "Ignored line without KEY=VALUE shape." });
      return;
    }
    const key = normalized.slice(0, equalsIndex).trim();
    const rawValue = normalized.slice(equalsIndex + 1).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      warnings.push({ line: index + 1, message: `Ignored invalid variable name: ${key}` });
      return;
    }
    entries.push({ key, value: parseEnvValue(rawValue), source: fileName, line: index + 1, priority });
  });
  return { entries, warnings };
}

function parseEnvValue(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') || trimmed.startsWith("'")) return stripQuotes(trimmed);
  return stripInlineComment(trimmed);
}

function stripQuotes(value) {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) return value.slice(1, -1);
  }
  return value;
}

function stripInlineComment(value) {
  const commentIndex = value.search(/\s#/);
  return commentIndex >= 0 ? value.slice(0, commentIndex).trim() : value;
}

function quoteEnvValue(value) {
  if (/^[A-Za-z0-9_./:@-]+$/.test(value)) return value;
  return JSON.stringify(value);
}

function resolveValue(key) {
  const matches = entries.filter((entry) => entry.key === key && String(entry.value).trim());
  if (matches.length === 0) return null;
  matches.sort((a, b) => a.priority - b.priority || (a.line ?? 0) - (b.line ?? 0));
  return matches[matches.length - 1];
}

function validateBaseUrl(value) {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".local");
    return parsed.protocol === "https:" || (parsed.protocol === "http:" && isLocal);
  } catch {
    return false;
  }
}

function isPlaceholder(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return (
    !normalized ||
    normalized === "your_api_key_here" ||
    normalized === "change_me" ||
    normalized === "changeme" ||
    normalized === "placeholder" ||
    normalized === "example" ||
    normalized.includes("your-api-key") ||
    normalized.includes("your_api_key")
  );
}

function maskSecret(value) {
  const trimmed = String(value ?? "").trim();
  if (trimmed.length <= 4) return "****";
  if (trimmed.startsWith("sk-") && trimmed.length > 8) return `sk-****${trimmed.slice(-4)}`;
  if (trimmed.length <= 8) return `${trimmed.slice(0, 1)}****${trimmed.slice(-1)}`;
  return `${trimmed.slice(0, 2)}****${trimmed.slice(-4)}`;
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
