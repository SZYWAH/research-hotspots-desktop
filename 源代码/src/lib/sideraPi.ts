import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type SideraPiSessionInfo = {
  sessionId: string;
  provider: string;
  model: string;
  packageVersion: string;
};

export type SideraPiRuntimeStatus = {
  phase: "idle" | "ready" | "generating" | "error";
  sessionId?: string;
  provider?: string;
  model?: string;
  activeMessageId?: string;
  revision: number;
  processAlive: boolean;
  outputBytes: number;
  stderrBytes: number;
  lastErrorCode?: string;
};

export type PiUsage = {
  inputTokens?: number;
  outputTokens?: number;
  cacheRead?: number;
  cacheWrite?: number;
  cost?: number;
};

export type SideraCacheRetention = "auto" | "long";

export type SideraSessionStats = {
  sessionFile?: string;
  sessionId: string;
  userMessages: number;
  assistantMessages: number;
  toolCalls: number;
  toolResults: number;
  totalMessages: number;
  tokens: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
  cost: number;
  contextUsage?: {
    tokens?: number;
    contextWindow?: number;
    percent?: number;
  };
};

export type SideraToolApprovalRequest = {
  approvalId: string;
  sessionId: string;
  messageId: string;
  toolCallId: string;
  tool: string;
  summary: string;
  target?: string;
  command?: string;
  diffPreview?: string;
  parameterHash: string;
};

export type SideraPiToolStage =
  | "reading-library-overview"
  | "searching-local-papers"
  | "reading-evidence"
  | "synthesizing"
  | "reading-files"
  | "reading-web"
  | "awaiting-tool-approval"
  | "using-tools";

export type SideraEvidenceGateStatus =
  | "undecided"
  | "retrieving"
  | "overview-ready"
  | "evidence-verified"
  | "no-results"
  | "invalid";

export type SideraPiRetrievalMode = "hybrid-e5-like" | "lexical-fallback";

type SideraPiEventBase = {
  sequence: number;
  revision: number;
};

export type SideraPiEvent = SideraPiEventBase & (
  | { type: "session-ready"; sessionId: string; provider: string; model: string }
  | { type: "turn-start"; sessionId: string; messageId: string }
  | { type: "assistant-delta"; sessionId: string; messageId: string; delta: string }
  | { type: "assistant-replace"; sessionId: string; messageId: string; markdown: string }
  | { type: "tool-stage"; sessionId: string; messageId: string; stage: SideraPiToolStage }
  | { type: "tool-approval-requested"; request: SideraToolApprovalRequest }
  | { type: "tool-approval-resolved"; approvalId: string; decision: "approved" | "rejected" }
  | {
      type: "turn-complete";
      sessionId: string;
      messageId: string;
      usage?: PiUsage;
      entityRefs: import("./sideraFocus").SideraAnswerEntityReference[];
      retrievalMode?: SideraPiRetrievalMode;
      citationStatus?: "verified" | "unverified";
      evidenceGateStatus?: SideraEvidenceGateStatus;
    }
  | { type: "turn-cancelled"; sessionId: string; messageId: string }
  | { type: "runtime-error"; sessionId?: string; code: string; message: string }
);

export type SideraPiStartSessionInput = {
  projectId: string;
  conversationId: string;
  databaseDir: string;
  provider: "deepseek" | "openai-compatible";
  baseUrl: string;
  model: string;
  useEnvKey: boolean;
  cacheRetention: SideraCacheRetention;
};

function requireDesktop() {
  if (!isTauri()) {
    throw new Error("Pi 会话仅可在 Sidera 桌面版中使用。");
  }
}

export async function startSideraPiSession(input: SideraPiStartSessionInput) {
  requireDesktop();
  return invoke<SideraPiSessionInfo>("sidera_pi_start_session", { input });
}

export async function submitSideraPiPrompt(input: {
  sessionId: string;
  messageId: string;
  prompt: string;
  readingContext?: import("./documentReaderContract").SideraReadingContextScope;
}) {
  requireDesktop();
  await invoke("sidera_pi_submit_prompt", { input });
}

export async function abortSideraPiTurn(input: {
  sessionId: string;
  messageId: string;
}) {
  requireDesktop();
  await invoke("sidera_pi_abort_turn", { input });
}

export async function getSideraPiStatus() {
  requireDesktop();
  return invoke<SideraPiRuntimeStatus>("sidera_pi_get_status");
}

export async function getSideraPiSessionStats() {
  requireDesktop();
  return invoke<SideraSessionStats>("sidera_pi_get_session_stats");
}

export async function decideSideraToolApproval(input: {
  approvalId: string;
  decision: "approved" | "rejected";
}) {
  requireDesktop();
  await invoke("sidera_pi_decide_tool_approval", { input });
}

export async function stopSideraPiSession() {
  if (!isTauri()) return;
  await invoke("sidera_pi_stop_session");
}

export async function listenSideraPiEvents(
  handler: (event: SideraPiEvent) => void,
): Promise<UnlistenFn> {
  requireDesktop();
  return listen<SideraPiEvent>("sidera-pi-event", ({ payload }) => handler(payload));
}

const safePiErrorMessages: Record<string, string> = {
  SIDERA_PI_CREDENTIAL_REQUIRED: "尚未配置模型凭据，请先在设置中保存 API Key。",
  SIDERA_PI_MODEL_REQUIRED: "尚未配置模型 ID，请先打开设置。",
  SIDERA_PI_ENDPOINT_INVALID: "模型服务地址无效，请检查设置中的 Base URL。",
  SIDERA_PI_PROVIDER_UNSUPPORTED: "当前模型 Provider 暂不受 Pi 会话支持。",
  SIDERA_PI_PACKAGE_NOT_FOUND: "未找到固定版本的 Pi 运行依赖。",
  SIDERA_PI_PACKAGE_VERSION_MISMATCH: "Pi 运行依赖版本与 Sidera 锁定版本不一致。",
  SIDERA_PI_NODE_NOT_FOUND: "未找到 Node.js，Pi 运行时无法启动。",
  SIDERA_PI_NODE_UNAVAILABLE: "Node.js 当前不可用，Pi 运行时无法启动。",
  SIDERA_PI_EXTENSION_INVALID: "Pi 工具扩展资源不完整，请修复开发版构建。",
  SIDERA_PI_PROCESS_START_FAILED: "Pi 运行进程启动失败，请确认 Node.js 可用。",
  SIDERA_PI_PROCESS_EXITED: "Pi 进程意外退出；问题没有被自动重放。",
  SIDERA_PI_PROVIDER_ERROR: "模型服务未能完成本轮回答。",
  SIDERA_PI_LONG_CACHE_UNSUPPORTED: "当前模型服务不支持长缓存，请在设置中切换为兼容模式后重新发送。本轮未自动重试。",
  SIDERA_PI_RPC_COMMAND_FAILED: "Pi 未能接受本轮请求。",
  SIDERA_PI_OUTPUT_LIMIT_EXCEEDED: "本轮输出超过安全上限，生成已停止。",
  SIDERA_PI_TOOL_EVENT_BLOCKED: "Pi 尝试调用本阶段禁用的工具，生成已停止。",
  SIDERA_TOOL_APPROVAL_EXPIRED: "该工具审批已经失效，没有执行操作。",
  SIDERA_TOOL_REJECTED_BY_USER: "工具操作已拒绝。",
  SIDERA_PI_CACHE_RETENTION_INVALID: "缓存策略无效，请重新保存模型设置。",
  SIDERA_RAG_DATABASE_NOT_FOUND: "本地论文库不可用，请检查数据库设置。",
  SIDERA_RAG_TOOL_LIMIT_EXCEEDED: "本轮本地检索超过安全上限，生成已停止。",
  SIDERA_CONVERSATION_DATABASE_DIR_REQUIRED: "尚未设置论文库目录，请先打开设置。",
  SIDERA_CONVERSATION_DATABASE_DIR_NOT_FOUND: "论文库目录不存在，请在设置中重新选择。",
  SIDERA_CONVERSATION_SCHEMA_TOO_NEW: "会话库版本高于当前程序支持范围，未进行自动修改。",
  SIDERA_CONVERSATION_SCHEMA_INCOMPATIBLE: "会话库结构不兼容，未进行破坏性自动恢复。请在设置中运行“检测 Agent”。",
  SIDERA_CONVERSATION_STORE_FAILED: "会话存储暂不可用，请在设置中运行“检测 Agent”。",
};

export function describeSideraPiError(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const code = Object.keys(safePiErrorMessages).find((candidate) => raw.includes(candidate));
  if (code) return safePiErrorMessages[code];
  if (/network|fetch|connect|timeout|ECONN|HTTP/i.test(raw)) {
    return "模型服务连接失败，请检查网络、Base URL 和模型状态。";
  }
  if (raw.trim().startsWith("SIDERA_")) {
    const safeCode = raw.trim().split(":", 1)[0];
    return `Agent 本地运行失败（${safeCode}），请在设置中运行“检测 Agent”。`;
  }
  return raw.trim() || "Pi 会话发生未知错误。";
}
