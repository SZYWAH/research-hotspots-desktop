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
const REQUIRED_SECTIONS = ["热点概述", "代表论文", "年度趋势", "来源分布", "关键词网络", "未来方向"];

const SAMPLE_PAPERS = [
  {
    index: 1,
    title: "Retrieval-Augmented Agents for Scientific Literature Synthesis",
    source: "arXiv",
    year: 2026,
    url: "https://example.org/paper-1",
    abstract: "This paper studies retrieval-augmented scientific agents for evidence-grounded literature synthesis and citation checking.",
  },
  {
    index: 2,
    title: "Citation-Grounded Review Generation with Evidence Profiles",
    source: "OpenAlex",
    year: 2025,
    url: "https://example.org/paper-2",
    abstract: "The work evaluates evidence profiles, representative papers, source distribution, and year trends in review generation.",
  },
  {
    index: 3,
    title: "Knowledge Graph Signals for Research Hotspot Evolution",
    source: "CNKI",
    year: 2024,
    url: "https://example.org/paper-3",
    abstract: "This study models yearly evolution, keyword networks, and source diversity for research hotspot analysis.",
  },
  {
    index: 4,
    title: "Early Survey on Local-First Scholarly Workstations",
    source: "Local",
    year: 2022,
    url: "https://example.org/paper-4",
    abstract: "The survey discusses local storage, SQLite indexing, privacy, and workstation workflows for scholarly analysis.",
  },
];

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  printHelp();
  process.exit(0);
}

const allowNetwork = args.includes("--allow-network");
const requireLive = args.includes("--require-live");
const outputPath = path.resolve(readOption("--output") || path.join(outputDir, "v20_ai_live_report_smoke.json"));
const reportOutputPath = path.resolve(readOption("--report-output") || path.join(outputDir, "v20_ai_live_report_smoke.md"));

await mkdir(path.dirname(outputPath), { recursive: true });
await mkdir(path.dirname(reportOutputPath), { recursive: true });

const config = await loadEffectiveConfig();
const readyForLiveAi = Boolean(
  config.apiKey &&
    !isPlaceholder(config.apiKey) &&
    config.apiKey.length >= 12 &&
    validateBaseUrl(config.baseUrl) &&
    config.model &&
    !isPlaceholder(config.model),
);

let networkResult = null;
let reportAudit = null;
let generatedReportPath = null;
if (allowNetwork && readyForLiveAi) {
  const started = Date.now();
  const content = await callChat(config, buildMessages());
  await writeFile(reportOutputPath, `${content.trim()}\n`, "utf8");
  reportAudit = auditLiveReport(content);
  generatedReportPath = reportOutputPath;
  networkResult = {
    called: true,
    elapsedMs: Date.now() - started,
    reportChars: content.trim().length,
  };
} else {
  networkResult = {
    called: false,
    reason: allowNetwork ? "live AI config is not ready" : "missing --allow-network",
  };
}

const gateChecks = buildGateChecks({ allowNetwork, requireLive, readyForLiveAi, networkResult, reportAudit });
const result = {
  generatedAt: new Date().toISOString(),
  mode: allowNetwork ? "network-enabled" : "dry-run",
  readyForLiveAi,
  endpoint: buildEndpoint(config.baseUrl),
  model: config.model,
  apiKey: {
    present: Boolean(config.apiKey),
    source: config.apiKeySource,
    masked: config.apiKey ? maskSecret(config.apiKey) : null,
    length: config.apiKey?.length ?? 0,
    placeholderLike: isPlaceholder(config.apiKey ?? ""),
  },
  network: networkResult,
  reportAudit,
  generatedReportPath,
  strictGate: gateChecks,
  recommendations: buildRecommendations({ allowNetwork, requireLive, readyForLiveAi, reportAudit }),
  notes: [
    "This script is dry-run by default.",
    "It only calls the AI provider when --allow-network is present.",
    "The JSON report masks the API key and never stores the raw secret.",
    "The smoke prompt uses synthetic sample papers, not the user's real library.",
  ],
};

await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

console.log(`AI live report smoke ${allowNetwork ? "network-enabled" : "dry-run"} completed: ready=${readyForLiveAi}, called=${networkResult.called}, gate=${gateChecks.passed}`);
console.log(`JSON: ${outputPath}`);
if (generatedReportPath) console.log(`Report markdown: ${generatedReportPath}`);
if (result.recommendations.length > 0) {
  console.log("Recommendations:");
  for (const item of result.recommendations) console.log(`- ${item}`);
}
if (gateChecks.enabled && !gateChecks.passed) {
  console.error("Strict gate failed:");
  for (const failure of gateChecks.failures) console.error(`- ${failure}`);
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
  node scripts/v20_ai_live_report_smoke.mjs [--allow-network] [--require-live] [--output outputs/v20_ai_live_report_smoke.json]

Default mode is dry-run. Add --allow-network to make one live chat-completions request using VITE_DEEPSEEK_* config.
`.trim());
}

async function loadEffectiveConfig() {
  const entries = [];
  for (const fileName of ENV_FILES) {
    const filePath = path.join(root, fileName);
    if (!(await exists(filePath))) continue;
    entries.push(...parseDotenv(await readFile(filePath, "utf8"), fileName).entries);
  }
  for (const key of [...Object.values(VITE_KEYS), ...Object.values(LEGACY_KEYS)]) {
    if (process.env[key]) {
      entries.push({ key, value: process.env[key], source: "process.env", line: null, priority: 1000 });
    }
  }

  const viteKey = resolveValue(entries, VITE_KEYS.apiKey);
  const legacyKey = resolveValue(entries, LEGACY_KEYS.apiKey);
  const viteBaseUrl = resolveValue(entries, VITE_KEYS.baseUrl);
  const legacyBaseUrl = resolveValue(entries, LEGACY_KEYS.baseUrl);
  const viteModel = resolveValue(entries, VITE_KEYS.model);
  const legacyModel = resolveValue(entries, LEGACY_KEYS.model);
  const apiKeyEntry = usable(viteKey?.value) ? viteKey : usable(legacyKey?.value) ? legacyKey : viteKey ?? legacyKey;
  const baseUrlEntry = usable(viteBaseUrl?.value) ? viteBaseUrl : usable(legacyBaseUrl?.value) ? legacyBaseUrl : viteBaseUrl ?? legacyBaseUrl;
  const modelEntry = usable(viteModel?.value) ? viteModel : usable(legacyModel?.value) ? legacyModel : viteModel ?? legacyModel;
  return {
    apiKey: String(apiKeyEntry?.value ?? "").trim(),
    apiKeySource: apiKeyEntry?.source ?? null,
    baseUrl: String(baseUrlEntry?.value ?? DEFAULT_BASE_URL).trim(),
    model: String(modelEntry?.value ?? DEFAULT_MODEL).trim(),
  };
}

function parseDotenv(text, fileName) {
  const entries = [];
  const warnings = [];
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
  const commentIndex = trimmed.search(/\s#/);
  return commentIndex >= 0 ? trimmed.slice(0, commentIndex).trim() : trimmed;
}

function stripQuotes(value) {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) return value.slice(1, -1);
  }
  return value;
}

function resolveValue(entries, key) {
  const matches = entries.filter((entry) => entry.key === key && String(entry.value).trim());
  if (matches.length === 0) return null;
  matches.sort((a, b) => a.priority - b.priority || (a.line ?? 0) - (b.line ?? 0));
  return matches[matches.length - 1];
}

function usable(value) {
  return Boolean(value && String(value).trim() && !isPlaceholder(value));
}

async function callChat(config, messages) {
  const response = await fetch(buildEndpoint(config.baseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: 0.2,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || `AI request failed: HTTP ${response.status}`);
  }
  const content = payload?.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("AI response was empty.");
  return content;
}

function buildMessages() {
  return [
    {
      role: "system",
      content: "你是严谨的中文科研综述写作系统。只能基于给定论文证据写作，不得编造引用编号、论文或数据。直接输出 Markdown。",
    },
    {
      role: "user",
      content: [
        "请基于下列 4 篇样例论文，生成一份 900-1400 字的科研热点分析报告。",
        "必须包含这些二级标题：热点概述、代表论文、年度趋势、来源分布、关键词网络、未来方向。",
        "每个核心判断都必须使用 [1]、[2] 这种引用编号，引用编号只能来自给定论文。",
        "最后必须包含“参考文献”章节，并列出 [1] 到 [4]。",
        "",
        "证据概览：绑定文献 4 篇；年份范围 2022-2026；来源包含 arXiv、OpenAlex、CNKI、Local；关键词包含 retrieval、evidence、citation、knowledge graph、local-first。",
        "",
        SAMPLE_PAPERS.map((paper) => `[${paper.index}] ${paper.title}. ${paper.source}, ${paper.year}. ${paper.url}\n摘要：${paper.abstract}`).join("\n\n"),
      ].join("\n"),
    },
  ];
}

function auditLiveReport(content) {
  const text = content.replace(/\s+/g, " ").trim();
  const citationIndices = [...content.matchAll(/\[(\d+)\]/g)].map((match) => Number(match[1])).filter(Number.isInteger);
  const uniqueCitationIndices = Array.from(new Set(citationIndices)).sort((a, b) => a - b);
  const invalidCitationCount = uniqueCitationIndices.filter((index) => index < 1 || index > SAMPLE_PAPERS.length).length;
  const missingSections = REQUIRED_SECTIONS.filter((section) => !content.includes(section));
  const referencePresent = /参考文献|References/i.test(content);
  const referenceItems = [...content.matchAll(/(?:^|\n)\s*\[(\d+)\]\s+/g)].map((match) => Number(match[1]));
  const semanticSignals = {
    evidenceOverview: /证据概览|绑定文献|年份范围/.test(content),
    representativePapers: /代表论文|代表文献/.test(content),
    yearTrend: /年度趋势|年份|2022|2026/.test(content),
    sourceDistribution: /来源分布|arXiv|OpenAlex|CNKI/.test(content),
    keywordNetwork: /关键词网络|retrieval|evidence|citation/.test(content),
    futureDirection: /未来方向|未来研究|研究方向/.test(content),
  };
  const checks = [
    { name: "minChars", passed: text.length >= 900, actual: text.length, expected: ">=900" },
    { name: "maxChars", passed: text.length <= 2200, actual: text.length, expected: "<=2200" },
    { name: "minCitations", passed: uniqueCitationIndices.length >= 4, actual: uniqueCitationIndices.length, expected: ">=4" },
    { name: "validCitationRange", passed: invalidCitationCount === 0, actual: invalidCitationCount, expected: 0 },
    { name: "requiredSections", passed: missingSections.length === 0, actual: missingSections.join(", ") || "all present", expected: "all present" },
    { name: "references", passed: referencePresent && referenceItems.length >= 4, actual: referenceItems.length, expected: ">=4" },
    { name: "semanticSignals", passed: Object.values(semanticSignals).every(Boolean), actual: JSON.stringify(semanticSignals), expected: "all true" },
  ];
  const failures = checks.filter((check) => !check.passed).map((check) => `${check.name} expected ${check.expected}, actual ${check.actual}.`);
  return {
    passed: failures.length === 0,
    charCount: text.length,
    citationIndices: uniqueCitationIndices,
    invalidCitationCount,
    missingSections,
    referenceCount: referenceItems.length,
    semanticSignals,
    checks,
    failures,
  };
}

function buildGateChecks({ allowNetwork, requireLive, readyForLiveAi, networkResult, reportAudit }) {
  const checks = [];
  if (requireLive) {
    checks.push({ name: "readyForLiveAi", expected: true, actual: readyForLiveAi, passed: readyForLiveAi });
    checks.push({ name: "networkCall", expected: true, actual: networkResult.called, passed: networkResult.called });
    checks.push({ name: "reportAudit", expected: true, actual: reportAudit?.passed ?? false, passed: reportAudit?.passed === true });
  } else if (allowNetwork) {
    checks.push({ name: "readyForLiveAi", expected: true, actual: readyForLiveAi, passed: readyForLiveAi });
    checks.push({ name: "reportAudit", expected: true, actual: reportAudit?.passed ?? false, passed: reportAudit?.passed === true });
  }
  const failures = checks.filter((check) => !check.passed).map((check) => `${check.name} expected ${check.expected}, actual ${check.actual}.`);
  return {
    enabled: checks.length > 0,
    passed: failures.length === 0,
    checks,
    failures,
  };
}

function buildRecommendations({ allowNetwork, requireLive, readyForLiveAi, reportAudit }) {
  const recommendations = [];
  if (!allowNetwork) recommendations.push("Dry-run only. Re-run with --allow-network when you explicitly want to spend one live AI request.");
  if (!readyForLiveAi) recommendations.push("Configure VITE_DEEPSEEK_API_KEY or run pnpm ai:bridge-env -- --write before live AI verification.");
  if (allowNetwork && readyForLiveAi && reportAudit?.passed) recommendations.push("Live AI sample report smoke passed. Next run should use the user's real imported library and exported report audit.");
  if (requireLive && (!allowNetwork || !readyForLiveAi || !reportAudit?.passed)) recommendations.push("--require-live needs --allow-network, ready config, and a passing report audit.");
  return recommendations;
}

function buildEndpoint(baseUrl) {
  const normalized = baseUrl.trim().replace(/\/+$/, "");
  if (normalized.endsWith("/chat/completions")) return normalized;
  if (normalized.endsWith("/v1")) return `${normalized}/chat/completions`;
  return `${normalized}/v1/chat/completions`;
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
