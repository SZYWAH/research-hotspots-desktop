import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  AGENT_THEORY_SCREEN_LOD_ACTIVE_HZ,
  AGENT_THEORY_SCREEN_LOD_GUARD_BAND_NDC,
  AGENT_THEORY_SCREEN_LOD_IDLE_HZ,
  classifyAgentTheoryScreenLodTransition,
  projectAgentTheoryScreenLodNdc,
  resolveAgentTheoryScreenLodIntervalMs,
  selectAgentTheoryScreenLod,
  shouldAcceptAgentTheoryScreenLodRevision,
} from "../src/lib/agentTheoryScreenLod.ts";

const root = process.cwd();
const workerSource = fs.readFileSync(
  path.join(root, "src", "lib", "agentTheoryScreenLod.worker.ts"),
  "utf8",
);
const clientSource = fs.readFileSync(
  path.join(root, "src", "lib", "agentTheoryScreenLodWorkerClient.ts"),
  "utf8",
);
const protocolSource = fs.readFileSync(
  path.join(root, "src", "lib", "agentTheoryScreenLodWorkerProtocol.ts"),
  "utf8",
);

const entityCount = 12_000;
const columns = 120;
const rows = Math.ceil(entityCount / columns);
const paperIds = [];
const topicKeys = [];
const sizes = new Float32Array(entityCount);
const positions = new Float32Array(entityCount * 3);
for (let index = 0; index < entityCount; index += 1) {
  const column = index % columns;
  const row = Math.floor(index / columns);
  paperIds.push(`paper-${String(index).padStart(5, "0")}`);
  topicKeys.push(`topic-${index % 160}`);
  sizes[index] = 1.2 + (index % 37) / 37 * 3.2;
  positions[index * 3] = -1.7 + column / (columns - 1) * 3.4;
  positions[index * 3 + 1] = -1.6 + row / (rows - 1) * 3.2;
  positions[index * 3 + 2] = -0.92 + (index % 97) / 96 * 1.84;
}

const catalog = {
  catalogRevision: "audit-catalog-v1",
  paperIds,
  topicKeys,
  positions,
  sizes,
};
const emptyPreviousMask = new Uint8Array(entityCount);
const forcedVisibleMask = new Uint8Array(entityCount);
const forcedIndex = Math.floor(rows / 2) * columns + Math.floor(columns / 2);
forcedVisibleMask[forcedIndex] = 1;
const identityMatrix = Float32Array.from([
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]);
const shiftedMatrix = identityMatrix.slice();
shiftedMatrix[12] = -0.32;
shiftedMatrix[13] = 0.08;
const executePureSelection = ({
  revision,
  cadence,
  localToClipMatrix,
  previousVisibleMask,
}) => {
  const ndcCoordinates = projectAgentTheoryScreenLodNdc(
    catalog.positions,
    localToClipMatrix,
  );
  const previousVisibleIndices = [];
  const candidates = catalog.paperIds.map((paperId, index) => {
    const previouslyVisible = previousVisibleMask[index] !== 0;
    if (previouslyVisible) previousVisibleIndices.push(index);
    return {
      index,
      paperId,
      topicKey: catalog.topicKeys[index],
      ndcX: ndcCoordinates[index * 3],
      ndcY: ndcCoordinates[index * 3 + 1],
      ndcZ: ndcCoordinates[index * 3 + 2],
      size: catalog.sizes[index],
      previouslyVisible,
      forced: forcedVisibleMask[index] !== 0,
    };
  });
  const selection = selectAgentTheoryScreenLod({
    candidates,
    width: 1_440,
    height: 900,
    quality: "balanced",
    guardBandNdc: AGENT_THEORY_SCREEN_LOD_GUARD_BAND_NDC,
  });
  const transition = classifyAgentTheoryScreenLodTransition(
    selection.selectedIndices,
    previousVisibleIndices,
  );
  return {
    ...selection,
    revision,
    cadence,
    requestedIntervalMs: resolveAgentTheoryScreenLodIntervalMs(cadence),
    visibleIndices: Uint32Array.from(transition.visibleIndices),
    incomingIndices: Uint32Array.from(transition.incomingIndices),
    retiringIndices: Uint32Array.from(transition.retiringIndices),
    residentIndices: Uint32Array.from(transition.residentIndices),
    transitionHash: transition.transitionHash,
  };
};

const first = executePureSelection({
    revision: 1,
    cadence: "active",
    localToClipMatrix: identityMatrix,
    previousVisibleMask: emptyPreviousMask,
});
const firstReplay = executePureSelection({
    revision: 1,
    cadence: "active",
    localToClipMatrix: identityMatrix,
    previousVisibleMask: emptyPreviousMask,
});
const previousVisibleMask = new Uint8Array(entityCount);
for (const index of first.visibleIndices) previousVisibleMask[index] = 1;
const shifted = executePureSelection({
    revision: 2,
    cadence: "idle",
    localToClipMatrix: shiftedMatrix,
    previousVisibleMask,
});
const firstTransition = classifyAgentTheoryScreenLodTransition(
  first.visibleIndices,
  [],
);
const shiftedVisibleSet = new Set(shifted.visibleIndices);
const firstVisibleSet = new Set(first.visibleIndices);
const shiftedResidentSet = new Set(shifted.residentIndices);
const selectedInGuardBand = [...first.visibleIndices].filter((index) => {
  const x = positions[index * 3];
  const y = positions[index * 3 + 1];
  return Math.abs(x) > 1 || Math.abs(y) > 1;
});

const checks = [];
const check = (name, passed, detail) => {
  checks.push({ name, passed: Boolean(passed), detail });
};

check(
  "locked guard band and active/idle cadence are exposed as pure contracts",
  AGENT_THEORY_SCREEN_LOD_GUARD_BAND_NDC === 1.35
    && AGENT_THEORY_SCREEN_LOD_ACTIVE_HZ === 20
    && AGENT_THEORY_SCREEN_LOD_IDLE_HZ === 4
    && resolveAgentTheoryScreenLodIntervalMs("active") === 50
    && resolveAgentTheoryScreenLodIntervalMs("idle") === 250,
  JSON.stringify({
    guardBand: AGENT_THEORY_SCREEN_LOD_GUARD_BAND_NDC,
    activeMs: resolveAgentTheoryScreenLodIntervalMs("active"),
    idleMs: resolveAgentTheoryScreenLodIntervalMs("idle"),
  }),
);
check(
  "worker owns immutable positions and projects from a 4x4 matrix",
  /positions:\s*Float32Array/.test(protocolSource)
    && /localToClipMatrix:\s*Float32Array/.test(protocolSource)
    && /projectAgentTheoryScreenLodNdc\([\s\S]*catalog\.positions,[\s\S]*request\.localToClipMatrix/.test(
      protocolSource,
    )
    && !/ndcCoordinates:\s*Float32Array/.test(clientSource),
  "main thread sends matrix/masks; worker catalog owns local xyz",
);
check(
  "worker selection is deterministic for identical catalog and camera input",
  first.selectionHash === firstReplay.selectionHash
    && first.transitionHash === firstReplay.transitionHash
    && arraysEqual(first.visibleIndices, firstReplay.visibleIndices),
  `${first.selectionHash}/${first.transitionHash}`,
);
check(
  "column-major local-to-clip projection is deterministic and rejects points behind the camera",
  (() => {
    const projection = projectAgentTheoryScreenLodNdc(
      Float32Array.from([0.25, -0.5, 0.75, 1, 1, 1]),
      identityMatrix,
    );
    const behindMatrix = identityMatrix.slice();
    behindMatrix[15] = -1;
    const behind = projectAgentTheoryScreenLodNdc(
      Float32Array.from([0, 0, 0]),
      behindMatrix,
    );
    return approximatelyEqual(projection[0], 0.25)
      && approximatelyEqual(projection[1], -0.5)
      && approximatelyEqual(projection[2], 0.75)
      && Number.isNaN(behind[0]);
  })(),
  "identity projection preserved; clipW <= 0 excluded",
);
check(
  "selection reserves real entities outside the viewport inside +/-1.35 NDC",
  first.guardBandNdc === 1.35
    && first.guardBandCandidateCount > first.viewportCandidateCount
    && selectedInGuardBand.length > 0,
  JSON.stringify({
    guardCandidates: first.guardBandCandidateCount,
    viewportCandidates: first.viewportCandidateCount,
    selectedInGuardBand: selectedInGuardBand.length,
  }),
);
check(
  "selection fills the current viewport before spending budget on the guard band",
  first.viewportSelectedCount === first.viewportTargetCount,
  JSON.stringify({
    viewportSelected: first.viewportSelectedCount,
    viewportTarget: first.viewportTargetCount,
  }),
);
check(
  "visible/incoming/retiring/resident semantics form a gap-free transition",
  shifted.incomingIndices.length > 0
    && shifted.retiringIndices.length > 0
    && [...shifted.incomingIndices].every(
      (index) => shiftedVisibleSet.has(index) && !firstVisibleSet.has(index),
    )
    && [...shifted.retiringIndices].every(
      (index) => firstVisibleSet.has(index) && !shiftedVisibleSet.has(index),
    )
    && [...shifted.visibleIndices].every((index) => shiftedResidentSet.has(index))
    && [...shifted.retiringIndices].every(
      (index) => shiftedResidentSet.has(index),
    ),
  JSON.stringify({
    visible: shifted.visibleIndices.length,
    incoming: shifted.incomingIndices.length,
    retiring: shifted.retiringIndices.length,
    resident: shifted.residentIndices.length,
  }),
);
check(
  "initial transition classifies every first-frame entity as incoming",
  firstTransition.retiringIndices.length === 0
    && firstTransition.visibleIndices.length
      === firstTransition.incomingIndices.length
    && firstTransition.residentIndices.length
      === firstTransition.visibleIndices.length,
  firstTransition.transitionHash,
);
check(
  "revision gate rejects stale and duplicate worker replies",
  !shouldAcceptAgentTheoryScreenLodRevision({
    responseRevision: 1,
    latestRequestedRevision: 2,
    latestAcceptedRevision: 0,
  })
    && shouldAcceptAgentTheoryScreenLodRevision({
      responseRevision: 2,
      latestRequestedRevision: 2,
      latestAcceptedRevision: 0,
    })
    && !shouldAcceptAgentTheoryScreenLodRevision({
      responseRevision: 2,
      latestRequestedRevision: 2,
      latestAcceptedRevision: 2,
    }),
  "revision 1 stale; revision 2 accepted once",
);
check(
  "forced visibility remains identity-stable inside the worker result",
  first.forcedVisibleCount === 1
    && firstVisibleSet.has(forcedIndex),
  `forced=${first.forcedVisibleCount}; index=${forcedIndex}`,
);
check(
  "worker transfers result buffers and client coalesces superseded revisions",
  /selectionResponseTransferables\(response\)/.test(workerSource)
    && /latestRequestedRevision/.test(clientSource)
    && /activeTask/.test(clientSource)
    && /queuedSelection/.test(clientSource)
    && /queuedGuidance/.test(clientSource)
    && /queueTask/.test(clientSource)
    && /dispatchNextTask/.test(clientSource),
  "transferable typed arrays + one active and one latest queued request",
);
check(
  "R6 worker protocol preserves request purpose and projection identity",
  /agent-theory-screen-lod-worker-v3-guidance/.test(protocolSource)
    && /purpose:\s*AgentTheoryLodPurpose/.test(protocolSource)
    && /projectionSignature:\s*AgentTheoryProjectionSignature/.test(
      protocolSource,
    )
    && /purpose:\s*request\.purpose/.test(protocolSource)
    && /projectionSignature:\s*request\.projectionSignature/.test(
      protocolSource,
    )
    && /purpose:\s*input\.purpose/.test(clientSource)
    && /projectionSignature:\s*input\.projectionSignature/.test(clientSource),
  "v3 request purpose/signature are validated, forwarded and echoed",
);
check(
  "selection leaves catalog identity and projection buffers unchanged",
  catalog.paperIds.length === entityCount
    && catalog.paperIds[forcedIndex]
      === `paper-${String(forcedIndex).padStart(5, "0")}`
    && positions[0] === -1.7000000476837158
    && first.candidateCount === entityCount,
  `entities=${catalog.paperIds.length}; candidates=${first.candidateCount}`,
);

const failed = checks.filter((entry) => !entry.passed);
console.log(JSON.stringify({
  audit: "agent-theory-screen-lod-worker-v1",
  passed: failed.length === 0,
  summary: {
    total: checks.length,
    passed: checks.length - failed.length,
    failed: failed.length,
  },
  metrics: {
    guardBandNdc: first.guardBandNdc,
    viewportSelectedCount: first.viewportSelectedCount,
    guardBandSelectedCount:
      first.visibleIndices.length - first.viewportSelectedCount,
    incomingAfterPan: shifted.incomingIndices.length,
    retiringAfterPan: shifted.retiringIndices.length,
    activeIntervalMs: first.requestedIntervalMs,
    idleIntervalMs: shifted.requestedIntervalMs,
  },
  checks,
}, null, 2));
if (failed.length > 0) process.exitCode = 1;

function arraysEqual(left, right) {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function approximatelyEqual(left, right, epsilon = 1e-6) {
  return Math.abs(left - right) <= epsilon;
}
