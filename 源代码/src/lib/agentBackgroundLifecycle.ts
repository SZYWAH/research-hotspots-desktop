export type AgentBackgroundLibraryLifecycle = Readonly<{
  identity: string;
  epoch: number;
}>;

export type AgentBackgroundLibraryTransition = Readonly<{
  changed: boolean;
  current: AgentBackgroundLibraryLifecycle;
}>;

function normalizeDatabaseDirectory(databaseDir: string) {
  const normalized = databaseDir.trim().replace(/\//g, "\\").replace(/[\\]+$/, "");
  return normalized.toLocaleLowerCase("en-US");
}

export function agentBackgroundLibraryIdentity(databaseDir: string, projectId: string) {
  return `${normalizeDatabaseDirectory(databaseDir)}::${projectId.trim()}`;
}

export function transitionAgentBackgroundLibrary(
  previous: AgentBackgroundLibraryLifecycle,
  databaseDir: string,
  projectId: string,
): AgentBackgroundLibraryTransition {
  const identity = agentBackgroundLibraryIdentity(databaseDir, projectId);
  if (identity === previous.identity) {
    return { changed: false, current: previous };
  }
  return {
    changed: true,
    current: {
      identity,
      epoch: previous.epoch + 1,
    },
  };
}

export function agentBackgroundMountKey(
  databaseDir: string,
  projectId: string,
  epoch: number,
) {
  return `agent-shell-${agentBackgroundLibraryIdentity(databaseDir, projectId)}-${epoch}`;
}

export function isCurrentAgentBackgroundEpoch(expected: number, current: number) {
  return expected === current;
}
