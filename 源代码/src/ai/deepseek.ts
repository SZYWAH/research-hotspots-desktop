import type { AiSettings, Hotspot, Paper, ReportGenerationOptions, ReportEvidenceProfile, ResearchReport } from "../types";
import { buildEvidenceProfileMarkdown, buildReportEvidenceProfile, evaluateReportQuality, normalizeReportOutput } from "../lib/references";
import { runAiChat } from "../lib/desktop";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export async function testAiConnection(settings: AiSettings) {
  return callChat(settings, [
    { role: "system", content: "你是 API 连通性测试助手，只输出简短中文。" },
    { role: "user", content: "请只回复：连接正常" },
  ], "test");
}

export async function generateBilingualKeyword(topic: string, settings: AiSettings) {
  const content = await callChat(settings, [
    {
      role: "system",
      content: "你是学术检索词助手。只输出精准英文检索词，不解释，不加引号。",
    },
    {
      role: "user",
      content: `请把这个中文或混合主题转换为适合 arXiv / OpenAlex 的英文核心检索词：${topic}`,
    },
  ], "keyword");
  return content.replace(/["'`[\]()]/g, "").trim() || topic;
}

export async function generateResearchReport(input: {
  topic: string;
  papers: Paper[];
  mode: ResearchReport["mode"];
  discipline: string;
  settings: AiSettings;
  options?: ReportGenerationOptions;
  hotspot?: Hotspot;
  onTaskStarted?: (taskKey: string) => void;
}) {
  const { topic, papers, mode, discipline, settings, options, hotspot, onTaskStarted } = input;
  const evidenceProfile = buildReportEvidenceProfile(papers, hotspot);
  const content = await callChat(settings, [
    {
      role: "system",
      content:
        "你是严谨的中文学术综述写作系统。必须基于给定文献写作，不得编造未给出的论文、数据或引用编号。直接输出 Markdown 正文。",
    },
    {
      role: "user",
      content: buildReportPrompt(topic, papers, mode, discipline, options, evidenceProfile),
    },
  ], mode === "deep" ? "deep" : "simple", onTaskStarted);
  const normalized = normalizeReportOutput(content, topic, papers, evidenceProfile);
  return {
    content: normalized,
    metrics: evaluateReportQuality(normalized, papers),
    evidenceProfile,
  };
}

export async function reviseResearchReport(input: {
  topic: string;
  papers: Paper[];
  originalReport: string;
  feedback: string;
  discipline: string;
  settings: AiSettings;
}) {
  const evidenceProfile = buildReportEvidenceProfile(input.papers);
  const content = await callChat(input.settings, [
    {
      role: "system",
      content: "你是严谨的中文学术综述改写助手。只输出新版完整综述 Markdown。",
    },
    {
      role: "user",
      content: [
        `研究主题：${input.topic}`,
        `学科模板：${input.discipline}`,
        `用户修改意见：${input.feedback}`,
        "V20 证据概览：",
        buildEvidenceProfileMarkdown(evidenceProfile),
        "原综述：",
        input.originalReport,
        "文献数据源：",
        formatPapers(input.papers),
      ].join("\n\n"),
    },
  ], "revised");
  const normalized = normalizeReportOutput(content, input.topic, input.papers, evidenceProfile);
  return {
    content: normalized,
    metrics: evaluateReportQuality(normalized, input.papers),
    evidenceProfile,
  };
}

async function callChat(
  settings: AiSettings,
  messages: ChatMessage[],
  mode: "test" | "simple" | "deep" | "revised" | "keyword",
  onTaskStarted?: (taskKey: string) => void,
) {
  if (!settings.apiCredentialConfigured && !settings.manualApiKey.trim() && !settings.useEnvKey) {
    throw new Error("缺少安全凭据。请在设置页保存 API Key。");
  }
  const projectId = settings.projectId || "project-default";
  const taskIdentity = `${projectId}:${mode}:${messages.at(-1)?.content.slice(0, 96) ?? "request"}`;
  const taskKey = `${projectId}:${mode}:${stableTaskHash(taskIdentity)}`;
  onTaskStarted?.(taskKey);
  const result = await runAiChat({
    taskKey,
    projectId,
    provider: settings.provider,
    baseUrl: settings.baseUrl,
    model: settings.model,
    temperature: settings.temperature,
    useEnvKey: settings.useEnvKey,
    mode,
    messages,
  });
  return result.content;
}

function stableTaskHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function buildReportPrompt(topic: string, papers: Paper[], mode: ResearchReport["mode"], discipline: string, options: ReportGenerationOptions | undefined, evidenceProfile: ReportEvidenceProfile) {
  const paperLimit = mode === "deep" ? Math.min(80, papers.length) : Math.min(40, papers.length);
  const lengthRule = buildLengthRule(mode, options?.targetLength);
  const structure = buildStructureRule(mode, options?.structure);
  const citationRule =
    options?.citationDensity === "high"
      ? "每个段落至少包含 1 处有效文献编号，关键比较句尽量使用多个编号。"
      : options?.citationDensity === "low"
        ? "每个小节至少包含 2-3 处有效文献编号，避免引用堆砌。"
        : "每个核心段落都应有有效文献编号支撑。";
  const toneRule =
    options?.tone === "critical"
      ? "语气保持审慎批判，明确证据强弱、局限性和可能争议。"
      : options?.tone === "draft"
        ? "语气允许偏草稿，但仍需保持引用真实和逻辑清楚。"
        : "语气正式、克制、适合课程设计或学术综述正文。";
  const futureRule = options?.includeFutureDirections === false ? "不单独展开未来研究方向。" : "必须包含未来研究方向或路线图，并说明依据来自哪些文献。";
  const evidenceOverview = buildEvidenceProfileMarkdown(evidenceProfile);

  return `
你是一名严谨的【${discipline}】学术综述写作专家。请基于下方真实文献，为主题“${topic}”生成中文学术综述。

【强制输出格式】
# ${topic} 学术综述
## 证据概览
使用下方“V20 证据包”改写为正式报告中的证据概览，不要遗漏绑定文献数、年份范围、来源分布、关键词网络和代表论文数量。
${structure}

【要求】
1. 正文目标长度：${lengthRule}。
2. 每个核心判断必须使用 [1]、[2][3] 形式引用文献。
3. 引用编号只能来自下方文献数据源，不得编造。
4. 不要输出“参考文献”章节，系统会自动追加。
5. 不要寒暄，不要免责声明，不要整段英文。
6. 文献较少时降低篇幅；文献较多时增加比较、分歧、证据强弱和未来路线。
7. 引用密度：${citationRule}
8. 写作语气：${toneRule}
9. 未来方向：${futureRule}
10. 必须显式覆盖：热点概述、代表论文、年度趋势、来源分布、关键词网络、未来方向。
11. “代表论文”部分必须指出至少 3 篇代表性文献的作用或证据价值；如果文献不足 3 篇，说明证据不足。
12. “年度趋势”部分必须结合年份范围和近年文献变化，不能只写抽象判断。

【V20 证据包】
${evidenceOverview}

【文献数据源】
${formatPapers(papers.slice(0, paperLimit))}
`.trim();
}

function buildLengthRule(mode: ResearchReport["mode"], targetLength?: ReportGenerationOptions["targetLength"]) {
  if (targetLength === "short") return mode === "deep" ? "2500-3500 字" : "1200-1800 字";
  if (targetLength === "long") return mode === "deep" ? "7000-10000 字" : "3500-5000 字";
  return mode === "deep" ? "5000-8000 字" : "1800-2500 字";
}

function buildStructureRule(mode: ResearchReport["mode"], structure?: ReportGenerationOptions["structure"]) {
  if (structure === "problem-method") {
    return "## 一、热点概述与问题界定\n## 二、主要方法路线\n## 三、代表论文与证据比较\n## 四、年度趋势、来源分布与关键词网络\n## 五、局限性、风险与未来方向";
  }
  if (structure === "timeline") {
    return "## 一、热点概述\n## 二、年度趋势与阶段演化\n## 三、代表论文与近年关键进展\n## 四、来源分布与关键词网络\n## 五、当前瓶颈与未来方向";
  }
  if (structure === "comparison") {
    return "## 一、热点概述与问题界定\n## 二、主要技术路线对比\n## 三、代表论文与证据强弱\n## 四、年度趋势、来源分布与关键词网络\n## 五、争议、局限与未来方向";
  }
  return mode === "deep"
    ? "## 一、热点概述与理论基础\n## 二、代表论文与关键进展\n## 三、年度趋势、来源分布与关键词网络\n## 四、问题瓶颈与未来方向\n## 五、总结"
    : "## 一、热点概述\n## 二、代表论文与主要进展\n## 三、年度趋势、来源分布、关键词网络与未来方向";
}

function formatPapers(papers: Paper[]) {
  return papers
    .map((paper, index) => {
      const year = paper.year ?? paper.publishedDate?.slice(0, 4) ?? "未知年份";
      return `文献[${index + 1}] ${paper.source} ${paper.title}\n年份：${year}\n链接：${paper.url || paper.doi || ""}\n摘要：${paper.abstract || "暂无摘要"}`;
    })
    .join("\n\n");
}
