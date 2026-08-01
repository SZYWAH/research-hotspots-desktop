import {
  resolveAgentTheoryScreenLodIntervalMs,
  type AgentTheoryScreenLodCadence,
  type AgentTheoryScreenLodQuality,
} from "./agentTheoryScreenLod";
import type {
  AgentTheoryCruiseGuidanceInput,
} from "./agentTheoryCruiseGuidance";
import {
  AGENT_THEORY_SCREEN_LOD_WORKER_PROTOCOL_VERSION,
  cloneAgentTheoryScreenLodWorkerCatalog,
  type AgentTheoryCruiseGuidanceWorkerRequest,
  type AgentTheoryCruiseGuidanceWorkerResponse,
  type AgentTheoryLodPurpose,
  type AgentTheoryProjectionSignature,
  type AgentTheoryScreenLodWorkerCatalog,
  type AgentTheoryScreenLodWorkerInitializeRequest,
  type AgentTheoryScreenLodWorkerReadyResponse,
  type AgentTheoryScreenLodWorkerRequest,
  type AgentTheoryScreenLodWorkerResponse,
  type AgentTheoryScreenLodWorkerSelectionRequest,
  type AgentTheoryScreenLodWorkerSelectionResponse,
} from "./agentTheoryScreenLodWorkerProtocol";

const AGENT_THEORY_CRUISE_GUIDANCE_INTERVAL_MS = 500;

export type AgentTheoryScreenLodWorkerSelectionInput = {
  purpose: AgentTheoryLodPurpose;
  projectionSignature: AgentTheoryProjectionSignature;
  cadence: AgentTheoryScreenLodCadence;
  width: number;
  height: number;
  quality: AgentTheoryScreenLodQuality;
  localToClipMatrix: Float32Array;
  previousVisibleMask: Uint8Array;
  forcedVisibleMask: Uint8Array;
};

export type AgentTheoryScreenLodWorkerClientSnapshot = {
  catalogRevision: string;
  latestRequestedRevision: number;
  latestAcceptedRevision: number;
  pendingRequestCount: number;
  discardedResponseCount: number;
  lastRequestedAtMs: number;
  latestGuidanceRequestedRevision: number;
  latestGuidanceAcceptedRevision: number;
  pendingGuidanceCount: number;
  discardedGuidanceResponseCount: number;
  lastGuidanceRequestedAtMs: number;
  activeTask: "selection" | "guidance" | null;
};

type WorkerTaskKind = "selection" | "guidance";
type WorkerTaskResponse =
  | AgentTheoryScreenLodWorkerSelectionResponse
  | AgentTheoryCruiseGuidanceWorkerResponse;

type PendingTask = {
  kind: WorkerTaskKind;
  resolve: (response: WorkerTaskResponse | null) => void;
  reject: (error: Error) => void;
};

type QueuedTask = {
  kind: WorkerTaskKind;
  revision: number;
  request: AgentTheoryScreenLodWorkerRequest;
  transferables: Transferable[];
};

export type AgentTheoryScreenLodWorkerClient = {
  initialize: (
    catalog: AgentTheoryScreenLodWorkerCatalog,
  ) => Promise<AgentTheoryScreenLodWorkerReadyResponse>;
  requestSelection: (
    input: AgentTheoryScreenLodWorkerSelectionInput,
    nowMs?: number,
  ) => Promise<AgentTheoryScreenLodWorkerSelectionResponse | null>;
  requestGuidance: (
    input: AgentTheoryCruiseGuidanceInput,
    nowMs?: number,
  ) => Promise<AgentTheoryCruiseGuidanceWorkerResponse | null>;
  canRequest: (
    cadence: AgentTheoryScreenLodCadence,
    nowMs?: number,
  ) => boolean;
  canRequestGuidance: (nowMs?: number) => boolean;
  getSnapshot: () => AgentTheoryScreenLodWorkerClientSnapshot;
  dispose: () => void;
};

export function createAgentTheoryScreenLodWorkerClient():
AgentTheoryScreenLodWorkerClient {
  const worker = new Worker(
    new URL("./agentTheoryScreenLod.worker.ts", import.meta.url),
    {
      type: "module",
      name: "agent-theory-screen-lod",
    },
  );
  let catalogRevision = "";
  let nextRevision = 0;
  let latestRequestedRevision = 0;
  let latestAcceptedRevision = 0;
  let latestGuidanceRequestedRevision = 0;
  let latestGuidanceAcceptedRevision = 0;
  let discardedResponseCount = 0;
  let discardedGuidanceResponseCount = 0;
  let lastRequestedAtMs = Number.NEGATIVE_INFINITY;
  let lastGuidanceRequestedAtMs = Number.NEGATIVE_INFINITY;
  let disposed = false;
  let readyResolve:
    | ((response: AgentTheoryScreenLodWorkerReadyResponse) => void)
    | null = null;
  let readyReject: ((error: Error) => void) | null = null;
  const pendingTasks = new Map<number, PendingTask>();
  let activeTask: QueuedTask | null = null;
  let queuedSelection: QueuedTask | null = null;
  let queuedGuidance: QueuedTask | null = null;

  const discardTask = (task: QueuedTask) => {
    const pending = pendingTasks.get(task.revision);
    pendingTasks.delete(task.revision);
    if (task.kind === "guidance") discardedGuidanceResponseCount += 1;
    else discardedResponseCount += 1;
    pending?.resolve(null);
  };

  const dispatchTask = (task: QueuedTask) => {
    activeTask = task;
    worker.postMessage(task.request, task.transferables);
  };

  const dispatchNextTask = () => {
    if (disposed || activeTask) return;
    const task = queuedGuidance ?? queuedSelection;
    if (!task) return;
    if (task.kind === "guidance") queuedGuidance = null;
    else queuedSelection = null;
    dispatchTask(task);
  };

  const queueTask = (task: QueuedTask) => {
    if (!activeTask) {
      dispatchTask(task);
      return;
    }
    if (task.kind === "guidance") {
      if (queuedGuidance) discardTask(queuedGuidance);
      queuedGuidance = task;
    } else {
      if (queuedSelection) discardTask(queuedSelection);
      queuedSelection = task;
    }
  };

  worker.onmessage = (
    event: MessageEvent<AgentTheoryScreenLodWorkerResponse>,
  ) => {
    if (disposed) return;
    const response = event.data;
    if (response.type === "agent-theory-screen-lod:ready") {
      if (response.catalogRevision !== catalogRevision) {
        readyReject?.(
          new Error(
            "Screen LOD worker initialized an unexpected catalog revision.",
          ),
        );
      } else {
        readyResolve?.(response);
      }
      readyResolve = null;
      readyReject = null;
      return;
    }
    if (response.type === "agent-theory-screen-lod:error") {
      const error = new Error(response.message);
      if (response.revision !== undefined) {
        const pending = pendingTasks.get(response.revision);
        pendingTasks.delete(response.revision);
        pending?.reject(error);
        if (activeTask?.revision === response.revision) activeTask = null;
        dispatchNextTask();
      } else {
        readyReject?.(error);
        readyResolve = null;
        readyReject = null;
      }
      return;
    }

    const pending = pendingTasks.get(response.revision);
    pendingTasks.delete(response.revision);
    if (activeTask?.revision === response.revision) activeTask = null;
    const selectionResponse =
      response.type === "agent-theory-screen-lod:selection";
    const accepted = response.catalogRevision === catalogRevision
      && (
        selectionResponse
          ? response.revision === latestRequestedRevision
            && response.revision > latestAcceptedRevision
          : response.revision === latestGuidanceRequestedRevision
            && response.revision > latestGuidanceAcceptedRevision
      );
    if (!accepted) {
      if (pending) {
        if (selectionResponse) discardedResponseCount += 1;
        else discardedGuidanceResponseCount += 1;
        pending.resolve(null);
      }
      dispatchNextTask();
      return;
    }
    if (selectionResponse) latestAcceptedRevision = response.revision;
    else latestGuidanceAcceptedRevision = response.revision;
    pending?.resolve(response);
    dispatchNextTask();
  };

  worker.onerror = (event) => {
    const error = new Error(
      event.message || "Screen LOD worker failed unexpectedly.",
    );
    readyReject?.(error);
    readyResolve = null;
    readyReject = null;
    for (const pending of pendingTasks.values()) pending.reject(error);
    pendingTasks.clear();
    activeTask = null;
    queuedSelection = null;
    queuedGuidance = null;
  };

  return {
    initialize: (catalog) => {
      if (disposed) {
        return Promise.reject(new Error("Screen LOD worker is disposed."));
      }
      const catalogClone = cloneAgentTheoryScreenLodWorkerCatalog(catalog);
      catalogRevision = catalogClone.catalogRevision;
      const request: AgentTheoryScreenLodWorkerInitializeRequest = {
        type: "agent-theory-screen-lod:initialize",
        protocolVersion: AGENT_THEORY_SCREEN_LOD_WORKER_PROTOCOL_VERSION,
        catalog: catalogClone,
      };
      return new Promise((resolve, reject) => {
        readyResolve = resolve;
        readyReject = reject;
        worker.postMessage(request, [
          catalogClone.positions.buffer,
          catalogClone.sizes.buffer,
          catalogClone.guidance.paperPositions.buffer,
          catalogClone.guidance.hotspotPositions.buffer,
        ]);
      });
    },
    requestSelection: (input, nowMs = performance.now()) => {
      if (disposed) {
        return Promise.reject(new Error("Screen LOD worker is disposed."));
      }
      if (!catalogRevision) {
        return Promise.reject(
          new Error("Screen LOD worker must be initialized before selection."),
        );
      }
      nextRevision += 1;
      latestRequestedRevision = nextRevision;
      const revision = nextRevision;
      const localToClipMatrix = input.localToClipMatrix.slice();
      const previousVisibleMask = input.previousVisibleMask.slice();
      const forcedVisibleMask = input.forcedVisibleMask.slice();
      const request: AgentTheoryScreenLodWorkerSelectionRequest = {
        type: "agent-theory-screen-lod:select",
        protocolVersion: AGENT_THEORY_SCREEN_LOD_WORKER_PROTOCOL_VERSION,
        catalogRevision,
        revision,
        purpose: input.purpose,
        projectionSignature: input.projectionSignature,
        cadence: input.cadence,
        width: input.width,
        height: input.height,
        quality: input.quality,
        localToClipMatrix,
        previousVisibleMask,
        forcedVisibleMask,
      };
      lastRequestedAtMs = nowMs;
      return new Promise((resolve, reject) => {
        pendingTasks.set(revision, {
          kind: "selection",
          resolve: (response) => resolve(
            response as AgentTheoryScreenLodWorkerSelectionResponse | null,
          ),
          reject,
        });
        queueTask({
          kind: "selection",
          revision,
          request,
          transferables: [
            localToClipMatrix.buffer,
            previousVisibleMask.buffer,
            forcedVisibleMask.buffer,
          ],
        });
      });
    },
    requestGuidance: (input, nowMs = performance.now()) => {
      if (disposed) {
        return Promise.reject(new Error("Screen LOD worker is disposed."));
      }
      if (!catalogRevision) {
        return Promise.reject(
          new Error("Screen LOD worker must be initialized before guidance."),
        );
      }
      nextRevision += 1;
      latestGuidanceRequestedRevision = nextRevision;
      const revision = nextRevision;
      const request: AgentTheoryCruiseGuidanceWorkerRequest = {
        type: "agent-theory-screen-lod:guidance",
        protocolVersion: AGENT_THEORY_SCREEN_LOD_WORKER_PROTOCOL_VERSION,
        catalogRevision,
        revision,
        input,
      };
      lastGuidanceRequestedAtMs = nowMs;
      return new Promise((resolve, reject) => {
        pendingTasks.set(revision, {
          kind: "guidance",
          resolve: (response) => resolve(
            response as AgentTheoryCruiseGuidanceWorkerResponse | null,
          ),
          reject,
        });
        queueTask({
          kind: "guidance",
          revision,
          request,
          transferables: [],
        });
      });
    },
    canRequest: (cadence, nowMs = performance.now()) => (
      nowMs - lastRequestedAtMs
        >= resolveAgentTheoryScreenLodIntervalMs(cadence)
    ),
    canRequestGuidance: (nowMs = performance.now()) => (
      nowMs - lastGuidanceRequestedAtMs
        >= AGENT_THEORY_CRUISE_GUIDANCE_INTERVAL_MS
    ),
    getSnapshot: () => ({
      catalogRevision,
      latestRequestedRevision,
      latestAcceptedRevision,
      pendingRequestCount: [...pendingTasks.values()].filter(
        (task) => task.kind === "selection",
      ).length,
      discardedResponseCount,
      lastRequestedAtMs,
      latestGuidanceRequestedRevision,
      latestGuidanceAcceptedRevision,
      pendingGuidanceCount: [...pendingTasks.values()].filter(
        (task) => task.kind === "guidance",
      ).length,
      discardedGuidanceResponseCount,
      lastGuidanceRequestedAtMs,
      activeTask: activeTask?.kind ?? null,
    }),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      worker.terminate();
      activeTask = null;
      queuedSelection = null;
      queuedGuidance = null;
      const error = new Error("Screen LOD worker was disposed.");
      readyReject?.(error);
      readyResolve = null;
      readyReject = null;
      for (const pending of pendingTasks.values()) pending.reject(error);
      pendingTasks.clear();
    },
  };
}
