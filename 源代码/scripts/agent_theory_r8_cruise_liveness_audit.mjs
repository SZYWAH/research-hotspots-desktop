import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import * as THREE from "three";

import {
  AGENT_THEORY_CRUISE_FIXED_STEP_SECONDS,
  AGENT_THEORY_PERIMETER_PROFILE_VERSION,
  advanceAgentTheoryCruise,
  cloneAgentTheoryCruiseCheckpoint,
  createAgentTheoryCruiseCheckpoint,
  sampleAgentTheoryCruise,
} from "../src/lib/agentTheoryPerimeter.ts";

const root = process.cwd();
const componentSource = fs.readFileSync(
  path.join(root, "src", "components", "App17GalaxyCanvas.tsx"),
  "utf8",
);
const theorySource = fs.readFileSync(
  path.join(root, "src", "components", "AgentTheoryBackgroundCanvas.tsx"),
  "utf8",
);

const checks = [];
function check(name, passed, evidence) {
  checks.push({ name, passed: Boolean(passed), evidence });
}

const sectorCount = 96;
const sectorRadii = Array.from(
  { length: sectorCount },
  (_, index) => 20 + Math.sin(index / sectorCount * Math.PI * 6) * 1.6,
);
const safetyMargins = Array.from(
  { length: sectorCount },
  (_, index) => 1.6 + Math.cos(index / sectorCount * Math.PI * 4) * 0.2,
);
const profile = {
  version: AGENT_THEORY_PERIMETER_PROFILE_VERSION,
  center: [0, 0, 0],
  principalAxes: [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ],
  rawSectorRadii: sectorRadii.slice(),
  sectorRadii,
  safetyMargins,
  uniformOutwardExpansion: 0.8,
  minimumEntityClearance: 1.6,
  minimumEntitySafetyRatio: 0.08,
  verticalExtent: 5,
  medianRadius: 20,
  maximumRadius: 24,
};

function positionDistance(left, right) {
  return Math.hypot(
    left[0] - right[0],
    left[1] - right[1],
    left[2] - right[2],
  );
}

function simulateTenMinutes(seed) {
  let checkpoint = createAgentTheoryCruiseCheckpoint(profile, seed);
  let previousPosition = checkpoint.position;
  let maximumStepDistance = 0;
  let maximumStillSteps = 0;
  let currentStillSteps = 0;
  const totalSteps = Math.round(600 / AGENT_THEORY_CRUISE_FIXED_STEP_SECONDS);
  for (let step = 0; step < totalSteps; step += 1) {
    const directionSign = (
      step >= totalSteps / 3 && step < totalSteps / 3 + 900
        ? -(Math.sign(checkpoint.angularVelocity) || 1)
        : Math.sign(checkpoint.angularVelocity) || 1
    );
    const speedScale = (
      step >= totalSteps / 3 && step < totalSteps / 3 + 900
        ? 0.35
        : 1
    );
    const previousStep = checkpoint.stepIndex;
    checkpoint = advanceAgentTheoryCruise(
      profile,
      checkpoint,
      1,
      {
        directionSign,
        speedScale,
      },
    );
    if (checkpoint.stepIndex !== previousStep + 1) {
      throw new Error("fixed-step checkpoint did not advance exactly once");
    }
    const stepDistance = positionDistance(
      checkpoint.position,
      previousPosition,
    );
    maximumStepDistance = Math.max(maximumStepDistance, stepDistance);
    if (stepDistance <= 1e-9) {
      currentStillSteps += 1;
      maximumStillSteps = Math.max(maximumStillSteps, currentStillSteps);
    } else {
      currentStillSteps = 0;
    }
    previousPosition = checkpoint.position;
  }
  return {
    checkpoint,
    maximumStepDistance,
    maximumStillSteps,
  };
}

const simulations = [
  "r8-seed-a",
  "r8-seed-b",
  "r8-seed-c",
].map(simulateTenMinutes);

check(
  "Ten-minute multi-seed cruise never stops advancing",
  simulations.every(
    ({ checkpoint, maximumStillSteps }) => (
      checkpoint.stepIndex === 36_000
      && maximumStillSteps < 2
    ),
  ),
  simulations.map(({ checkpoint, maximumStillSteps }) => ({
    stepIndex: checkpoint.stepIndex,
    maximumStillSteps,
  })),
);

check(
  "Guided cruise remains continuous under fallback-speed reversal",
  simulations.every(
    ({ maximumStepDistance }) => (
      Number.isFinite(maximumStepDistance)
      && maximumStepDistance > 0
      && maximumStepDistance < 0.02
    ),
  ),
  simulations.map(({ maximumStepDistance }) => maximumStepDistance),
);

let returnCheckpoint = createAgentTheoryCruiseCheckpoint(
  profile,
  "r8-return-cycles",
);
const returnCycleEvidence = [];
for (let cycle = 0; cycle < 5; cycle += 1) {
  returnCheckpoint = advanceAgentTheoryCruise(
    profile,
    returnCheckpoint,
    180,
    {
      directionSign: Math.sign(returnCheckpoint.angularVelocity) || 1,
      speedScale: 1,
    },
  );
  const anchor = cloneAgentTheoryCruiseCheckpoint(returnCheckpoint);
  const resumed = advanceAgentTheoryCruise(
    profile,
    cloneAgentTheoryCruiseCheckpoint(anchor),
    1,
    {
      directionSign: Math.sign(anchor.angularVelocity) || 1,
      speedScale: 1,
    },
  );
  returnCycleEvidence.push({
    cycle: cycle + 1,
    stepDelta: resumed.stepIndex - anchor.stepIndex,
    positionDelta: positionDistance(resumed.position, anchor.position),
  });
  returnCheckpoint = resumed;
}
check(
  "Five exact-anchor returns resume on the next fixed step",
  returnCycleEvidence.every(
    ({ stepDelta, positionDelta }) => stepDelta === 1 && positionDelta > 0,
  ),
  returnCycleEvidence,
);

const camera = new THREE.PerspectiveCamera(42, 1440 / 900, 0.1, 240);
camera.up.set(0, 0, 1);
let projectionCheckpoint = createAgentTheoryCruiseCheckpoint(
  profile,
  "r8-three-camera",
);
const firstSample = sampleAgentTheoryCruise(profile, projectionCheckpoint);
camera.position.fromArray(firstSample.position);
camera.lookAt(new THREE.Vector3().fromArray(firstSample.lookTarget));
camera.updateMatrixWorld(true);
const probe = new THREE.Vector3(2.5, -1.5, 0.8);
const firstProjection = probe.clone().project(camera);
projectionCheckpoint = advanceAgentTheoryCruise(
  profile,
  projectionCheckpoint,
  60,
  {
    directionSign: Math.sign(projectionCheckpoint.angularVelocity) || 1,
    speedScale: 1,
  },
);
const secondSample = sampleAgentTheoryCruise(profile, projectionCheckpoint);
camera.position.fromArray(secondSample.position);
camera.lookAt(new THREE.Vector3().fromArray(secondSample.lookTarget));
camera.updateMatrixWorld(true);
const secondProjection = probe.clone().project(camera);
const projectionDeltaPx = Math.hypot(
  (secondProjection.x - firstProjection.x) * 720,
  (secondProjection.y - firstProjection.y) * 450,
);
check(
  "A real Three.js camera observes non-zero cruise projection movement",
  Number.isFinite(projectionDeltaPx) && projectionDeltaPx >= 0.15,
  { projectionDeltaPx },
);

const fixedStepBlock = componentSource.match(
  /if \(stepCount > 0\) \{[\s\S]*?agentTheoryCruiseAccumulatorSeconds = Math\.min/,
)?.[0] ?? "";
check(
  "Visibility guard no longer owns fixed-step liveness",
  !/agentTheoryVisibilityGuardAllowsAdvance/.test(componentSource)
    && /AgentTheoryCruiseAdvanceControl/.test(fixedStepBlock)
    && /advanceAgentTheoryCruise\(/.test(fixedStepBlock),
  "the fixed-step loop always calls advanceAgentTheoryCruise",
);
check(
  "Fallback guidance preserves a non-zero target speed",
  /mode: "fallback"/.test(componentSource)
    && /speedScale: 0\.35/.test(componentSource)
    && /directionSign: fallbackDirection/.test(componentSource),
  "no-safe-candidate selects continuous center-facing reversal guidance",
);
check(
  "Return completion is decoupled from the passive 900 ms audit",
  /agentTheoryCruiseResumeSuccessfulSteps >= 1/.test(componentSource)
    && /completeAgentTheoryReturnAfterCruiseStep\(now\)/.test(
      componentSource,
    )
    && /completeAgentTheoryCruiseHealthAudit/.test(componentSource),
  "idle follows the first rendered cruise step; health evidence remains passive",
);
check(
  "Live liveness diagnostics publish at no more than four hertz",
  /APP17_AGENT_THEORY_LIVENESS_PUBLISH_MS = 250/.test(componentSource)
    && /updateAgentTheoryCruiseLiveness\(now\)/.test(componentSource)
    && /publishAgentTheoryRuntimeDiagnostics\(\)/.test(componentSource)
    && /data-cruise-step-delta/.test(theorySource)
    && /data-cruise-guidance/.test(theorySource),
  "runtime exposes step delta, projected movement, still time and recovery count",
);

const failed = checks.filter((entry) => !entry.passed);
const report = {
  status: failed.length === 0 ? "PASS" : "FAIL",
  workPackage: "M1.3g-R8",
  checks,
};
console.log(JSON.stringify(report, null, 2));
if (failed.length > 0) process.exitCode = 1;
