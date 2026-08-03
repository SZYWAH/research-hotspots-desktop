import { invoke, isTauri } from "@tauri-apps/api/core";

import type { SideraAnswerEntityReference, SideraConversationTurn } from "./sideraFocus";
import type { PiUsage, SideraEvidenceGateStatus, SideraPiRetrievalMode } from "./sideraPi";

export type SideraConversationStatus = "active" | "archived";

export type SideraConversationSummary = {
  id: string;
  projectId: string;
  title: string;
  status: SideraConversationStatus;
  provider: string;
  model: string;
  contextAvailable: boolean;
  turnCount: number;
  createdAtMs: number;
  updatedAtMs: number;
  lastOpenedAtMs: number;
};

export type SideraStoredTurn = {
  id: string;
  submittedAtMs: number;
  userText: string;
  assistantStatus: "streaming" | "complete" | "cancelled" | "failed" | "interrupted";
  assistantMarkdown: string;
  entityRefs: SideraAnswerEntityReference[];
  retrievalMode?: SideraPiRetrievalMode;
  citationStatus?: "verified" | "unverified";
  evidenceGateStatus?: SideraEvidenceGateStatus;
  usage?: PiUsage;
  updatedAtMs: number;
};

export type SideraConversationSnapshot = {
  conversation: SideraConversationSummary;
  turns: SideraStoredTurn[];
};

export type SideraReadinessStatus = "pass" | "repaired" | "fail";

export type SideraAgentLocalReadiness = {
  conversationStore: {
    status: SideraReadinessStatus;
    code?: string;
    detail: string;
    schemaVersion?: number;
    repaired: boolean;
    conversationCount?: number;
  };
  piRuntime: {
    status: "pass" | "fail";
    code?: string;
    detail: string;
    packageVersion?: string;
    nodeVersion?: string;
  };
};

type Scope = { databaseDir: string; projectId: string };
type WithId = Scope & { conversationId: string };

function requireDesktop() {
  if (!isTauri()) throw new Error("对话历史仅可在 Sidera 桌面版中使用。");
}

export async function checkSideraAgentLocalReadiness(input: Scope) {
  requireDesktop();
  return invoke<SideraAgentLocalReadiness>("sidera_agent_local_readiness", { input });
}

export async function listSideraConversations(
  input: Scope & { status?: SideraConversationStatus | "all"; query?: string },
) {
  requireDesktop();
  return invoke<SideraConversationSummary[]>("sidera_conversation_list", { input });
}

export async function openRecentSideraConversation(input: Scope) {
  requireDesktop();
  return invoke<SideraConversationSnapshot | null>("sidera_conversation_open_recent", { input });
}

export async function createSideraConversation(
  input: Scope & { conversationId?: string; provider: string; model: string },
) {
  requireDesktop();
  return invoke<SideraConversationSnapshot>("sidera_conversation_create", { input });
}

export async function openSideraConversation(input: WithId) {
  requireDesktop();
  return invoke<SideraConversationSnapshot>("sidera_conversation_open", { input });
}

export async function renameSideraConversation(input: WithId & { title: string }) {
  requireDesktop();
  return invoke<SideraConversationSummary>("sidera_conversation_rename", { input });
}

export async function archiveSideraConversation(input: WithId) {
  requireDesktop();
  return invoke<SideraConversationSummary>("sidera_conversation_archive", { input });
}

export async function restoreSideraConversation(input: WithId) {
  requireDesktop();
  return invoke<SideraConversationSummary>("sidera_conversation_restore", { input });
}

export async function deleteSideraConversation(input: WithId) {
  requireDesktop();
  await invoke("sidera_conversation_delete", { input });
}

export async function upsertSideraConversationTurn(
  input: Scope & WithId & {
    id: string;
    submittedAtMs: number;
    userText: string;
    assistantStatus: SideraStoredTurn["assistantStatus"];
    assistantMarkdown: string;
    entityRefs: SideraAnswerEntityReference[];
    retrievalMode?: SideraPiRetrievalMode;
    citationStatus?: "verified" | "unverified";
    evidenceGateStatus?: SideraEvidenceGateStatus;
    usage?: PiUsage;
  },
) {
  requireDesktop();
  return invoke<SideraStoredTurn>("sidera_conversation_upsert_turn", { input });
}

export function conversationTurnsFromSnapshot(
  snapshot: SideraConversationSnapshot,
): SideraConversationTurn[] {
  return snapshot.turns.map((turn) => ({
    id: turn.id,
    submittedAtMs: turn.submittedAtMs,
    userText: turn.userText,
    assistant: {
      id: turn.id,
      status: turn.assistantStatus,
      markdown: turn.assistantMarkdown,
      entityRefs: Array.isArray(turn.entityRefs) ? turn.entityRefs : [],
      retrievalMode: turn.retrievalMode,
      citationStatus: turn.citationStatus,
      evidenceGateStatus: turn.evidenceGateStatus,
      usage: turn.usage,
    },
  }));
}
