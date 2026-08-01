import {
  AGENT_THEORY_SCREEN_LOD_WORKER_PROTOCOL_VERSION,
  cloneAgentTheoryScreenLodWorkerCatalog,
  executeAgentTheoryCruiseGuidanceWorkerRequest,
  executeAgentTheoryScreenLodWorkerSelection,
  selectionResponseTransferables,
  validateAgentTheoryScreenLodWorkerCatalog,
  type AgentTheoryScreenLodWorkerCatalog,
  type AgentTheoryScreenLodWorkerErrorResponse,
  type AgentTheoryScreenLodWorkerRequest,
  type AgentTheoryScreenLodWorkerResponse,
} from "./agentTheoryScreenLodWorkerProtocol";

type AgentTheoryScreenLodWorkerScope = {
  onmessage:
    | ((event: MessageEvent<AgentTheoryScreenLodWorkerRequest>) => void)
    | null;
  postMessage: (
    message: AgentTheoryScreenLodWorkerResponse,
    transfer?: Transferable[],
  ) => void;
};

const workerScope =
  globalThis as unknown as AgentTheoryScreenLodWorkerScope;
let catalog: AgentTheoryScreenLodWorkerCatalog | null = null;

workerScope.onmessage = (
  event: MessageEvent<AgentTheoryScreenLodWorkerRequest>,
) => {
  const request = event.data;
  try {
    if (
      request.protocolVersion
        !== AGENT_THEORY_SCREEN_LOD_WORKER_PROTOCOL_VERSION
    ) {
      throw new Error(
        `Unsupported Screen LOD worker protocol: ${request.protocolVersion}`,
      );
    }
    if (request.type === "agent-theory-screen-lod:initialize") {
      const entityCount = validateAgentTheoryScreenLodWorkerCatalog(
        request.catalog,
      );
      catalog = cloneAgentTheoryScreenLodWorkerCatalog(request.catalog);
      workerScope.postMessage({
        type: "agent-theory-screen-lod:ready",
        protocolVersion: AGENT_THEORY_SCREEN_LOD_WORKER_PROTOCOL_VERSION,
        catalogRevision: catalog.catalogRevision,
        entityCount,
      });
      return;
    }
    if (!catalog) {
      throw new Error(
        "Screen LOD worker received work before initialization.",
      );
    }
    if (request.type === "agent-theory-screen-lod:guidance") {
      workerScope.postMessage(
        executeAgentTheoryCruiseGuidanceWorkerRequest(catalog, request),
      );
      return;
    }
    const response = executeAgentTheoryScreenLodWorkerSelection(
      catalog,
      request,
    );
    workerScope.postMessage(
      response,
      selectionResponseTransferables(response),
    );
  } catch (error) {
    const response: AgentTheoryScreenLodWorkerErrorResponse = {
      type: "agent-theory-screen-lod:error",
      protocolVersion: AGENT_THEORY_SCREEN_LOD_WORKER_PROTOCOL_VERSION,
      catalogRevision:
        request.type !== "agent-theory-screen-lod:initialize"
          ? request.catalogRevision
          : request.catalog.catalogRevision
            || catalog?.catalogRevision
            || "",
      revision:
        request.type !== "agent-theory-screen-lod:initialize"
          ? request.revision
          : undefined,
      task:
        request.type === "agent-theory-screen-lod:guidance"
          ? "guidance"
          : request.type === "agent-theory-screen-lod:select"
            ? "selection"
            : undefined,
      message: error instanceof Error ? error.message : String(error),
    };
    workerScope.postMessage(response);
  }
};
