import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const outputDir = path.join(root, "outputs");

const VITE_ENV_FILES = [
  ".env",
  ".env.local",
  ".env.production",
  ".env.production.local",
  ".env.development",
  ".env.development.local",
];

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

const outputPath = path.resolve(readOption("--output") || path.join(outputDir, "v20_ai_config_preflight.json"));
const requireLive = args.includes("--require-live");
await mkdir(path.dirname(outputPath), { recursive: true });

const parsedFiles = [];
const entries = [];
for (const fileName of VITE_ENV_FILES) {
  const filePath = path.join(root, fileName);
  if (!(await exists(filePath))) {
    parsedFiles.push({ fileName, exists: false, variableCount: 0 });
    continue;
  }

  const text = await readFile(filePath, "utf8");
  const parsed = parseDotenv(text, fileName);
  parsedFiles.push({
    fileName,
    exists: true,
    variableCount: parsed.entries.length,
    parseWarnings: parsed.warnings,
  });
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

const effectiveApiKey = resolveValue(VITE_KEYS.apiKey);
const effectiveBaseUrl = resolveValue(VITE_KEYS.baseUrl);
const effectiveModel = resolveValue(VITE_KEYS.model);
const legacyApiKey = resolveValue(LEGACY_KEYS.apiKey);
const legacyBaseUrl = resolveValue(LEGACY_KEYS.baseUrl);
const legacyModel = resolveValue(LEGACY_KEYS.model);

const apiKeyStatus = summarizeSecret(effectiveApiKey);
const baseUrlStatus = summarizeBaseUrl(effectiveBaseUrl);
const modelStatus = summarizeModel(effectiveModel);
const legacyStatus = {
  apiKey: summarizeSecret(legacyApiKey),
  baseUrl: summarizePlain(legacyBaseUrl),
  model: summarizePlain(legacyModel),
};

const readyForLiveAi =
  apiKeyStatus.present &&
  !apiKeyStatus.placeholderLike &&
  apiKeyStatus.length >= 12 &&
  baseUrlStatus.valid &&
  modelStatus.valid;

const recommendations = buildRecommendations({
  readyForLiveAi,
  apiKeyStatus,
  baseUrlStatus,
  modelStatus,
  legacyStatus,
});

const result = {
  generatedAt: new Date().toISOString(),
  inspectedFiles: parsedFiles,
  effective: {
    readyForLiveAi,
    apiKey: apiKeyStatus,
    baseUrl: baseUrlStatus,
    model: modelStatus,
  },
  legacyDeepSeekVariables: legacyStatus,
  notes: [
    "This check is read-only and never prints the raw API key.",
    "Vite only exposes client variables prefixed with VITE_. Legacy DEEPSEEK_* variables are reported but are not effective for the current frontend AI path.",
    "A missing key is allowed in local acceptance; live AI report generation still requires a real key or a manual key in Settings.",
  ],
  strictGate: buildStrictGate({ requireLive, readyForLiveAi }),
  recommendations,
};

await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

console.log(
  `AI config preflight completed: readyForLiveAi=${readyForLiveAi}, key=${apiKeyStatus.status}, baseUrl=${baseUrlStatus.status}, model=${modelStatus.status}`,
);
if (result.strictGate.enabled) console.log(`Strict gate: passed=${result.strictGate.passed}`);
console.log(`Report: ${outputPath}`);
if (recommendations.length > 0) {
  console.log("Recommendations:");
  for (const item of recommendations) console.log(`- ${item}`);
}
if (result.strictGate.enabled && !result.strictGate.passed) {
  console.error("Strict gate failed:");
  for (const failure of result.strictGate.failures) console.error(`- ${failure}`);
  process.exit(1);
}

function readOption(name) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  return args[index + 1];
}

function printHelp() {
  console.log(`
Usage:
  node scripts/v20_ai_config_preflight.mjs [--output outputs/v20_ai_config_preflight.json] [--require-live]

Checks VITE_DEEPSEEK_API_KEY, VITE_DEEPSEEK_BASE_URL, and VITE_DEEPSEEK_MODEL without exposing secrets.
`.trim());
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function parseDotenv(text, fileName) {
  const warnings = [];
  const entries = [];
  const priority = VITE_ENV_FILES.indexOf(fileName);
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

    entries.push({
      key,
      value: parseEnvValue(rawValue),
      source: fileName,
      line: index + 1,
      priority,
    });
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
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}

function stripInlineComment(value) {
  const commentIndex = value.search(/\s#/);
  return commentIndex >= 0 ? value.slice(0, commentIndex).trim() : value;
}

function resolveValue(key) {
  const matches = entries.filter((entry) => entry.key === key && String(entry.value).trim());
  if (matches.length === 0) return null;
  matches.sort((a, b) => a.priority - b.priority || (a.line ?? 0) - (b.line ?? 0));
  return matches[matches.length - 1];
}

function summarizeSecret(entry) {
  if (!entry) {
    return {
      status: "missing",
      present: false,
      source: null,
      line: null,
      masked: null,
      length: 0,
      placeholderLike: false,
    };
  }

  const value = String(entry.value).trim();
  const placeholderLike = isPlaceholder(value);
  return {
    status: placeholderLike ? "placeholder" : "present",
    present: true,
    source: entry.source,
    line: entry.line,
    masked: maskSecret(value),
    length: value.length,
    placeholderLike,
  };
}

function summarizePlain(entry) {
  if (!entry) {
    return { status: "missing", present: false, source: null, line: null, value: null };
  }
  const value = String(entry.value).trim();
  return {
    status: isPlaceholder(value) ? "placeholder" : "present",
    present: true,
    source: entry.source,
    line: entry.line,
    value,
  };
}

function summarizeBaseUrl(entry) {
  const value = String(entry?.value || DEFAULT_BASE_URL).trim();
  const validation = validateBaseUrl(value);
  return {
    status: entry ? (validation.valid ? "present" : "invalid") : "default",
    present: Boolean(entry),
    source: entry?.source || "app default",
    line: entry?.line || null,
    value,
    effectiveEndpoint: buildEndpoint(value),
    valid: validation.valid,
    reason: validation.reason,
  };
}

function summarizeModel(entry) {
  const value = String(entry?.value || DEFAULT_MODEL).trim();
  const placeholderLike = isPlaceholder(value);
  const valid = value.length > 0 && !placeholderLike;
  return {
    status: entry ? (valid ? "present" : "invalid") : "default",
    present: Boolean(entry),
    source: entry?.source || "app default",
    line: entry?.line || null,
    value,
    valid,
    placeholderLike,
  };
}

function validateBaseUrl(value) {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".local");
    if (parsed.protocol === "https:") return { valid: true, reason: "https endpoint" };
    if (parsed.protocol === "http:" && isLocal) return { valid: true, reason: "local http endpoint" };
    return { valid: false, reason: "Use https for remote providers, or http only for localhost/local endpoints." };
  } catch {
    return { valid: false, reason: "Base URL is not a valid URL." };
  }
}

function buildEndpoint(baseUrl) {
  const normalized = baseUrl.trim().replace(/\/+$/, "");
  if (normalized.endsWith("/chat/completions")) return normalized;
  if (normalized.endsWith("/v1")) return `${normalized}/chat/completions`;
  return `${normalized}/v1/chat/completions`;
}

function isPlaceholder(value) {
  const normalized = value.trim().toLowerCase();
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
  const trimmed = value.trim();
  if (trimmed.length <= 4) return "****";
  if (trimmed.startsWith("sk-") && trimmed.length > 8) return `sk-****${trimmed.slice(-4)}`;
  if (trimmed.length <= 8) return `${trimmed.slice(0, 1)}****${trimmed.slice(-1)}`;
  return `${trimmed.slice(0, 2)}****${trimmed.slice(-4)}`;
}

function buildRecommendations({ readyForLiveAi, apiKeyStatus, baseUrlStatus, modelStatus, legacyStatus }) {
  const recommendations = [];
  if (readyForLiveAi) {
    recommendations.push("Live AI configuration looks ready for a real DeepSeek report-generation smoke test.");
    return recommendations;
  }
  if (!apiKeyStatus.present) {
    recommendations.push("Set VITE_DEEPSEEK_API_KEY in .env.local, or use the app Settings page to enter a manual key.");
  } else if (apiKeyStatus.placeholderLike) {
    recommendations.push("Replace the placeholder VITE_DEEPSEEK_API_KEY with a real key before live AI verification.");
  } else if (apiKeyStatus.length < 12) {
    recommendations.push("The detected VITE_DEEPSEEK_API_KEY is unusually short; verify that it is complete.");
  }
  if (!baseUrlStatus.valid) {
    recommendations.push("Fix VITE_DEEPSEEK_BASE_URL. Remote providers should use https; plain http is only accepted for local endpoints.");
  }
  if (!modelStatus.valid) {
    recommendations.push("Set VITE_DEEPSEEK_MODEL to a concrete model name, for example deepseek-chat.");
  }
  if (!apiKeyStatus.present && legacyStatus.apiKey.present) {
    recommendations.push("DEEPSEEK_API_KEY was found, but the current Vite frontend only reads VITE_DEEPSEEK_API_KEY. Run `pnpm ai:bridge-env -- --write` to copy usable legacy values into .env.local.");
  }
  if (!baseUrlStatus.present && legacyStatus.baseUrl.present) {
    recommendations.push("DEEPSEEK_BASE_URL was found, but the current Vite frontend only reads VITE_DEEPSEEK_BASE_URL. The env bridge can map it to VITE_DEEPSEEK_BASE_URL.");
  }
  if (!modelStatus.present && legacyStatus.model.present) {
    recommendations.push("DEEPSEEK_MODEL_NAME was found, but the current Vite frontend only reads VITE_DEEPSEEK_MODEL. The env bridge can map it to VITE_DEEPSEEK_MODEL.");
  }
  return recommendations;
}

function buildStrictGate({ requireLive, readyForLiveAi }) {
  const checks = [];
  if (requireLive) {
    checks.push({
      name: "requireLiveAi",
      expected: true,
      actual: readyForLiveAi,
      passed: readyForLiveAi,
      failure: "readyForLiveAi is false; configure VITE_DEEPSEEK_API_KEY or a valid environment for live AI verification.",
    });
  }
  const failures = checks.filter((check) => !check.passed).map((check) => check.failure);
  return {
    enabled: checks.length > 0,
    passed: failures.length === 0,
    checks: checks.map(({ failure, ...check }) => check),
    failures,
  };
}
