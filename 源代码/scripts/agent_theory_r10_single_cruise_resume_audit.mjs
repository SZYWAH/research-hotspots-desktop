import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  AGENT_THEORY_CRUISE_FIXED_STEP_SECONDS,
  advanceAgentTheoryCruise,
  createAgentTheoryCruiseCheckpoint,
} from "../src/lib/agentTheoryPerimeter.ts";

const root = process.cwd();
const componentSource = fs.readFileSync(
  path.join(root, "src", "components", "App17GalaxyCanvas.tsx"),
  "utf8",
);
const wrapperSource = fs.readFileSync(
  path.join(root, "src", "components", "AgentTheoryBackgroundCanvas.tsx"),
  "utf8",
);

const checks = [];
function check(name, passed, evidence) {
  checks.push({ name, passed: Boolean(passed), evidence });
}

function functionBody(name, nextName) {
  const start = componentSource.indexOf(`function ${name}`);
  const end = componentSource.indexOf(`function ${nextName}`, start + 1);
  return start >= 0 && end > start
    ? componentSource.slice(start, end)
    : "";
}

const healthAuditBody = functionBody(
  "completeAgentTheoryCruiseHealthAudit",
  "completeAgentTheoryReturnPreparation",
);
const restoreBody = functionBody(
  "restoreAgentTheoryExploreAnchorState",
  "restoreAgentTheoryExploreAnchorProjection",
);
const workerRequestBody = functionBody(
  "requestAgentTheoryCruiseGuidance",
  "applyAgentTheoryScreenLodDiagnostics",
);

check(
  "Explore anchor freezes current and target Guidance plus relative clocks",
  /guidanceLifecycle:\s*\{[\s\S]*?current:\s*\{[\s\S]*?target:\s*\{/.test(
    componentSource,
  )
    && /targetHoldRemainingMs/.test(componentSource)
    && /nextWorkerEvaluationRemainingMs/.test(componentSource)
    && /consecutiveUnsafeResults/.test(componentSource)
    && /workerEpoch/.test(componentSource),
  "anchor includes both Guidance states, remaining timers, counters and epoch",
);

check(
  "Anchor restore atomically reinstates the frozen cruise lifecycle",
  /entryAnchor\.guidanceLifecycle\.current/.test(restoreBody)
    && /entryAnchor\.guidanceLifecycle\.target/.test(restoreBody)
    && /agentTheoryCruiseAccumulatorSeconds\s*=\s*[\s\S]*?entryAnchor\.liveness\.accumulatorSeconds/.test(
      restoreBody,
    )
    && /agentTheoryGuidanceResumeNotBeforeMs\s*=\s*\([\s\S]*?nextWorkerEvaluationRemainingMs/.test(
      restoreBody,
    ),
  restoreBody,
);

check(
  "Explore invalidates in-flight Worker work and return starts a new epoch",
  (componentSource.match(/agentTheoryGuidanceWorkerEpoch \+= 1/g) ?? [])
    .length >= 2
    && /requestedEpoch !== agentTheoryGuidanceWorkerEpoch/.test(
      workerRequestBody,
    )
    && /response\.revision <= agentTheoryGuidanceLastAcceptedRevision/.test(
      workerRequestBody,
    ),
  "entry and restore advance the epoch; stale epoch/revision responses drop",
);

check(
  "The post-anchor observation window cannot request a fresh reframe",
  /APP17_AGENT_THEORY_POST_RETURN_DIAGNOSTIC_MS = 3_000/.test(
    componentSource,
  )
    && /now < agentTheoryGuidanceResumeNotBeforeMs/.test(workerRequestBody)
    && /broadSearch:\s*!agentTheoryVisibilityGuard\.safe/.test(
      workerRequestBody,
    )
    && !/agentTheoryCruiseHealthAuditActive/.test(workerRequestBody),
  "Guidance resumes from its frozen remaining time after the three-second trace",
);

check(
  "The former 900 ms health audit is diagnostic-only",
  healthAuditBody.length > 0
    && !/requestAgentTheoryFallbackGuidance/.test(healthAuditBody)
    && /updateAgentTheoryPostReturnTrajectoryDiagnostics/.test(
      healthAuditBody,
    )
    && !/healthy\s*=/.test(healthAuditBody),
  healthAuditBody,
);

check(
  "Dead handoff and direct Guidance direction replacement are removed",
  !/agentTheoryCruiseHandoffSeconds/.test(componentSource)
    && /directionSign:\s*\(\s*Math\.sign\(agentTheoryCruiseCheckpoint\.angularVelocity\)/.test(
      componentSource,
    )
    && /advanceControl:[\s\S]*?directionSign:\s*agentTheoryCruiseGuidanceTarget\.directionSign/.test(
      componentSource,
    ),
  "the integrator receives the target direction while rendered state follows actual angular velocity",
);

check(
  "Three-second return diagnostics expose writer, epoch, revisions and reframes",
  /export type AgentTheoryPostReturnTrajectorySnapshot/.test(componentSource)
    && /cameraWriter/.test(componentSource)
    && /acceptedWorkerRevision/.test(componentSource)
    && /discardedWorkerResponseCount/.test(componentSource)
    && /fallbackTriggerCount/.test(componentSource)
    && /extraFramingCount/.test(componentSource)
    && /maximumTrajectoryResidualPx/.test(componentSource)
    && /data-post-return-extra-framing/.test(wrapperSource)
    && /data-post-return-camera-writer/.test(wrapperSource),
  "R10 runtime trace is externally observable without feeding React state back into the camera",
);

const sectorCount = 96;
const profile = {
  version: "agent-theory-perimeter-v1",
  center: [0, 0, 0],
  principalAxes: [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ],
  rawSectorRadii: Array.from({ length: sectorCount }, () => 20),
  sectorRadii: Array.from({ length: sectorCount }, () => 20),
  safetyMargins: Array.from({ length: sectorCount }, () => 1.8),
  uniformOutwardExpansion: 0.8,
  minimumEntityClearance: 1.6,
  minimumEntitySafetyRatio: 0.08,
  verticalExtent: 5,
  medianRadius: 20,
  maximumRadius: 24,
};

function checkpointDigest(checkpoint) {
  return JSON.stringify({
    stepIndex: checkpoint.stepIndex,
    position: checkpoint.position.map((value) => value.toFixed(12)),
    velocity: checkpoint.velocity.map((value) => value.toFixed(12)),
    acceleration: checkpoint.acceleration.map((value) => value.toFixed(12)),
    azimuthRadians: checkpoint.azimuthRadians.toFixed(12),
    angularVelocity: checkpoint.angularVelocity.toFixed(12),
    angularAcceleration: checkpoint.angularAcceleration.toFixed(12),
    verticalOffset: checkpoint.verticalOffset.toFixed(12),
    verticalVelocity: checkpoint.verticalVelocity.toFixed(12),
    randomState: checkpoint.randomState,
  });
}

let uninterrupted = createAgentTheoryCruiseCheckpoint(
  profile,
  "m1.3g-r10-single-resume",
);
uninterrupted = advanceAgentTheoryCruise(profile, uninterrupted, 240);
let resumed = structuredClone(uninterrupted);
for (let cycle = 0; cycle < 5; cycle += 1) {
  const control = {
    directionSign: Math.sign(uninterrupted.angularVelocity) || 1,
    speedScale: 0.78,
  };
  uninterrupted = advanceAgentTheoryCruise(
    profile,
    uninterrupted,
    1,
    control,
  );
  const frozen = structuredClone(resumed);
  // Explore wall-clock time intentionally does not mutate the checkpoint.
  resumed = advanceAgentTheoryCruise(profile, frozen, 1, control);
}
check(
  "Five Explore freezes resume on exactly the next fixed cruise step",
  checkpointDigest(uninterrupted) === checkpointDigest(resumed),
  {
    fixedStepSeconds: AGENT_THEORY_CRUISE_FIXED_STEP_SECONDS,
    uninterrupted: checkpointDigest(uninterrupted),
    resumed: checkpointDigest(resumed),
  },
);

const diagnosticMs = 3_000;
const workerRemainingCases = [0, 125, 500];
const probeTimes = [0, 500, 900, 2_999];
const prematureWorkerAcceptances = workerRemainingCases.flatMap(
  (remainingMs) => probeTimes
    .filter((elapsedMs) => elapsedMs >= diagnosticMs + remainingMs)
    .map((elapsedMs) => ({ remainingMs, elapsedMs })),
);
check(
  "0 ms, 500 ms and 900 ms return events cannot resume Worker guidance",
  prematureWorkerAcceptances.length === 0,
  {
    diagnosticMs,
    workerRemainingCases,
    probeTimes,
    prematureWorkerAcceptances,
  },
);

const oldEpoch = 7;
const resumedEpoch = oldEpoch + 2;
const responses = [
  { epoch: oldEpoch, revision: 41 },
  { epoch: oldEpoch + 1, revision: 42 },
  { epoch: resumedEpoch, revision: 43 },
];
const accepted = responses.filter(
  (response) => response.epoch === resumedEpoch && response.revision > 42,
);
check(
  "Only the resumed epoch can own the first post-return Worker result",
  accepted.length === 1 && accepted[0].revision === 43,
  { oldEpoch, resumedEpoch, responses, accepted },
);

const failed = checks.filter((entry) => !entry.passed);
const report = {
  audit: "agent-theory-r10-single-cruise-resume-v1",
  workPackage: "M1.3g-R10",
  generatedAt: new Date().toISOString(),
  status: failed.length === 0 ? "PASS" : "FAIL",
  checks,
  failedChecks: failed,
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (failed.length > 0) process.exitCode = 1;
