import { invoke } from "@tauri-apps/api/core";

import type {
  AgentArtifactRecord,
  AgentAutomationMode,
  AgentBudget,
  AgentEventRecord,
  AgentModelProfile,
  AgentModelProfileReference,
  AgentModelRole,
  AgentRunOverview,
  AgentRunRecord,
  AgentRunSnapshot,
  AgentRunKind,
  AgentResourceGrant,
} from "../agentTypes";
import { normalizeAgentError } from "./agentUiModel";

export type AgentDatabaseContext = { databaseDir?: string; projectId: string };

export type AgentModelTestResult = {
  connected: boolean;
  protocol: AgentModelProfile["protocol"];
  model: string;
  elapsedMs: number;
  retryCount: number;
  fallbackUsed: boolean;
};

export interface AgentDesktopClient {
  listRuns(context: AgentDatabaseContext, limit?: number, offset?: number): Promise<AgentRunRecord[]>;
  getOverview(context: AgentDatabaseContext, runId: string): Promise<AgentRunOverview>;
  getArtifact(context: AgentDatabaseContext, runId: string, artifactId: string): Promise<AgentArtifactRecord>;
  getDraftModelProfiles(context: AgentDatabaseContext, runId: string): Promise<{ planner: AgentModelProfileReference; writer?: AgentModelProfileReference }>;
  getEvents(context: AgentDatabaseContext, runId: string, afterSequence?: number, limit?: number): Promise<AgentEventRecord[]>;
  configureCredential(input: { projectId: string; profile: AgentModelProfile; secret?: string; legacyService?: string }): Promise<{ configured: boolean; migratedLegacyCredential: boolean }>;
  testModel(input: { projectId: string; profile: AgentModelProfile }): Promise<AgentModelTestResult>;
  saveModelProfile(context: AgentDatabaseContext, role: AgentModelRole, profile: AgentModelProfile): Promise<AgentModelProfileReference>;
  createResourceGrant(context: AgentDatabaseContext, input: { grantKind: AgentResourceGrant["grantKind"]; locator: string; metadata?: unknown; expiresAtMs?: number }): Promise<AgentResourceGrant>;
  revokeResourceGrant(context: AgentDatabaseContext, grantId: string): Promise<void>;
  createRun(context: AgentDatabaseContext, input: { id: string; automationMode: AgentAutomationMode; objective: string; budget: AgentBudget; runKind: AgentRunKind; taskInput: unknown }): Promise<AgentRunRecord>;
  planRun(context: AgentDatabaseContext, runId: string, planner: AgentModelProfileReference, writer?: AgentModelProfileReference): Promise<AgentRunSnapshot>;
  executeRun(context: AgentDatabaseContext, runId: string): Promise<AgentRunSnapshot>;
  decidePlan(context: AgentDatabaseContext, input: { runId: string; decision: "approved" | "rejected" | "revoked"; actorId: string; reason?: string }): Promise<AgentRunSnapshot>;
  decideAction(context: AgentDatabaseContext, input: { runId: string; stepId: string; decision: "approved" | "rejected" | "revoked"; actorId: string; reason?: string }): Promise<AgentRunSnapshot>;
  submitAnswer(context: AgentDatabaseContext, input: { runId: string; questionId: string; answer: unknown; actorId: string }): Promise<AgentRunSnapshot>;
  reviewArtifact(context: AgentDatabaseContext, input: { runId: string; artifactId: string; decision: "approved" | "rejected"; actorId: string; reason?: string }): Promise<AgentRunSnapshot>;
  controlRun(context: AgentDatabaseContext, runId: string, action: "pause" | "resume" | "cancel"): Promise<AgentRunSnapshot>;
}

async function agentInvoke<T>(command: string, input: unknown): Promise<T> {
  try {
    return await invoke<T>(command, { input });
  } catch (error) {
    throw normalizeAgentError(error);
  }
}

export function overviewFromSnapshot(snapshot: AgentRunSnapshot): AgentRunOverview {
  return {
    run: snapshot.run,
    plan: snapshot.plan,
    steps: snapshot.steps,
    artifacts: snapshot.artifacts.map(({ content: _content, ...metadata }) => metadata),
    approvals: snapshot.approvals,
    questions: snapshot.questions,
    answers: snapshot.answers,
    artifactReviews: snapshot.artifactReviews,
    modelProfiles: snapshot.modelProfiles,
    currentLease: snapshot.currentLease,
    eventCursor: snapshot.events.reduce((maximum, event) => Math.max(maximum, event.sequence), 0),
  };
}

export function createAgentDesktopClient(): AgentDesktopClient {
  return {
    listRuns: (context, limit = 50, offset = 0) => agentInvoke("agent_list_runs", { databaseDir: context.databaseDir, projectId: context.projectId, limit, offset }),
    getOverview: (context, runId) => agentInvoke("agent_get_run_overview", { databaseDir: context.databaseDir, runId }),
    getArtifact: (context, runId, artifactId) => agentInvoke("agent_get_artifact", { databaseDir: context.databaseDir, runId, artifactId }),
    getDraftModelProfiles: (context, runId) => agentInvoke("agent_get_draft_model_profiles", { databaseDir: context.databaseDir, runId }),
    getEvents: (context, runId, afterSequence = 0, limit = 200) => agentInvoke("agent_get_events", { databaseDir: context.databaseDir, runId, afterSequence, limit }),
    configureCredential: (input) => agentInvoke("agent_configure_model_credential", input),
    testModel: (input) => agentInvoke("agent_test_model_profile", input),
    saveModelProfile: (context, role, profile) => agentInvoke("agent_save_model_profile", { databaseDir: context.databaseDir, role, profile }),
    createResourceGrant: (context, input) => agentInvoke("agent_create_resource_grant", { databaseDir: context.databaseDir, projectId: context.projectId, ...input }),
    revokeResourceGrant: (context, grantId) => agentInvoke("agent_revoke_resource_grant", { databaseDir: context.databaseDir, grantId }),
    createRun: (context, input) => agentInvoke("agent_create_run", { databaseDir: context.databaseDir, projectId: context.projectId, ...input }),
    planRun: (context, runId, planner, writer) => agentInvoke("agent_plan_run", { databaseDir: context.databaseDir, runId, planner, writer }),
    executeRun: (context, runId) => agentInvoke("agent_execute_run", { databaseDir: context.databaseDir, runId }),
    decidePlan: (context, input) => agentInvoke("agent_decide_plan", { databaseDir: context.databaseDir, stepId: undefined, ...input }),
    decideAction: (context, input) => agentInvoke("agent_decide_action", { databaseDir: context.databaseDir, ...input }),
    submitAnswer: (context, input) => agentInvoke("agent_submit_answer", { databaseDir: context.databaseDir, ...input }),
    reviewArtifact: (context, input) => agentInvoke("agent_review_artifact", { databaseDir: context.databaseDir, ...input }),
    controlRun: (context, runId, action) => agentInvoke("agent_control_run", { databaseDir: context.databaseDir, runId, action }),
  };
}
