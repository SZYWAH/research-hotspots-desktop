import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  AGENT_THEORY_CRUISE_FIXED_STEP_SECONDS,
  AGENT_THEORY_CRUISE_MOTION_VERSION,
  AGENT_THEORY_PERIMETER_PROFILE_VERSION,
  advanceAgentTheoryCruise,
  createAgentTheoryCruiseCheckpoint,
  interpolateAgentTheoryCruiseSamples,
  parseAgentTheoryCruiseCheckpoint,
  sampleAgentTheoryCruise,
} from "../src/lib/agentTheoryPerimeter.ts";
const root = process.cwd();
const componentSource = fs.readFileSync(
  path.join(root, "src", "components", "App17GalaxyCanvas.tsx"),
  "utf8",
);
const protocolSource = fs.readFileSync(
  path.join(root, "src", "lib", "agentTheoryScreenLodWorkerProtocol.ts"),
  "utf8",
);
const clientSource = fs.readFileSync(
  path.join(root, "src", "lib", "agentTheoryScreenLodWorkerClient.ts"),
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
  safetyMargins: Array.from(
    { length: sectorCount },
    (_, index) => 1.6 + Math.cos(index / sectorCount * Math.PI * 4) * 0.2,
  ),
  uniformOutwardExpansion: 0.8,
  minimumEntityClearance: 1.6,
  minimumEntitySafetyRatio: 0.08,
  verticalExtent: 5,
  medianRadius: 20,
  maximumRadius: 24,
};

function distance(left, right) {
  return Math.hypot(
    left[0] - right[0],
    left[1] - right[1],
    left[2] - right[2],
  );
}

function stableMotionDigest(checkpoint) {
  return JSON.stringify({
    stepIndex: checkpoint.stepIndex,
    position: checkpoint.position.map((value) => value.toFixed(12)),
    velocity: checkpoint.velocity.map((value) => value.toFixed(12)),
    azimuthRadians: checkpoint.azimuthRadians.toFixed(12),
    angularVelocity: checkpoint.angularVelocity.toFixed(12),
    verticalOffset: checkpoint.verticalOffset.toFixed(12),
    randomState: checkpoint.randomState,
    nextNoiseStep: checkpoint.nextNoiseStep,
  });
}

function simulate(seed, seconds = 30) {
  let checkpoint = createAgentTheoryCruiseCheckpoint(profile, seed);
  const targetIntervals = [];
  let maximumVelocityStep = 0;
  let maximumAngularVelocityStep = 0;
  let maximumVerticalVelocityStep = 0;
  let maximumTargetUpdateVelocityStep = 0;
  let maximumTargetUpdateAngularVelocityStep = 0;
  let maximumTargetUpdateVerticalVelocityStep = 0;
  let previousNoiseStep = checkpoint.lastNoiseStep;
  const totalSteps = Math.round(
    seconds / AGENT_THEORY_CRUISE_FIXED_STEP_SECONDS,
  );
  for (let step = 0; step < totalSteps; step += 1) {
    const previous = checkpoint;
    checkpoint = advanceAgentTheoryCruise(profile, checkpoint, 1, {
      directionSign: Math.sign(checkpoint.angularVelocity) || 1,
      speedScale: 1,
    });
    maximumVelocityStep = Math.max(
      maximumVelocityStep,
      distance(checkpoint.velocity, previous.velocity),
    );
    maximumAngularVelocityStep = Math.max(
      maximumAngularVelocityStep,
      Math.abs(checkpoint.angularVelocity - previous.angularVelocity),
    );
    maximumVerticalVelocityStep = Math.max(
      maximumVerticalVelocityStep,
      Math.abs(checkpoint.verticalVelocity - previous.verticalVelocity),
    );
    if (checkpoint.lastNoiseStep !== previousNoiseStep) {
      targetIntervals.push(
        (
          checkpoint.lastNoiseStep - previousNoiseStep
        ) * AGENT_THEORY_CRUISE_FIXED_STEP_SECONDS,
      );
      maximumTargetUpdateVelocityStep = Math.max(
        maximumTargetUpdateVelocityStep,
        distance(checkpoint.velocity, previous.velocity),
      );
      maximumTargetUpdateAngularVelocityStep = Math.max(
        maximumTargetUpdateAngularVelocityStep,
        Math.abs(checkpoint.angularVelocity - previous.angularVelocity),
      );
      maximumTargetUpdateVerticalVelocityStep = Math.max(
        maximumTargetUpdateVerticalVelocityStep,
        Math.abs(checkpoint.verticalVelocity - previous.verticalVelocity),
      );
      previousNoiseStep = checkpoint.lastNoiseStep;
    }
  }
  return {
    checkpoint,
    targetIntervals,
    maximumVelocityStep,
    maximumAngularVelocityStep,
    maximumVerticalVelocityStep,
    maximumTargetUpdateVelocityStep,
    maximumTargetUpdateAngularVelocityStep,
    maximumTargetUpdateVerticalVelocityStep,
  };
}

const deterministicA = simulate("r9-deterministic", 60);
const deterministicB = simulate("r9-deterministic", 60);
check(
  "V2 cruise remains deterministic for the same seed and step count",
  stableMotionDigest(deterministicA.checkpoint)
    === stableMotionDigest(deterministicB.checkpoint),
  {
    motionVersion: deterministicA.checkpoint.motionVersion,
    digest: stableMotionDigest(deterministicA.checkpoint),
  },
);

check(
  "Random targets update inside the locked four-to-seven second range",
  deterministicA.targetIntervals.length >= 7
    && deterministicA.targetIntervals.every(
      (seconds) => seconds >= 3.98 && seconds <= 7.02,
    ),
  deterministicA.targetIntervals,
);

check(
  "Target changes are jerk-limited instead of velocity impulses",
  deterministicA.maximumTargetUpdateAngularVelocityStep < 1e-5
    && deterministicA.maximumTargetUpdateVerticalVelocityStep < 4e-4
    && deterministicA.maximumTargetUpdateVelocityStep < 0.15,
  {
    maximumTargetUpdateAngularVelocityStep:
      deterministicA.maximumTargetUpdateAngularVelocityStep,
    maximumTargetUpdateVerticalVelocityStep:
      deterministicA.maximumTargetUpdateVerticalVelocityStep,
    maximumTargetUpdateVelocityStep:
      deterministicA.maximumTargetUpdateVelocityStep,
    fullRunMaximumAngularVelocityStep:
      deterministicA.maximumAngularVelocityStep,
    fullRunMaximumVerticalVelocityStep:
      deterministicA.maximumVerticalVelocityStep,
    fullRunMaximumVelocityStep: deterministicA.maximumVelocityStep,
  },
);

const v1 = createAgentTheoryCruiseCheckpoint(profile, "r9-v1-migration");
const v1Json = JSON.parse(JSON.stringify(v1));
delete v1Json.motionVersion;
delete v1Json.nextNoiseStep;
delete v1Json.randomTargetStartStep;
delete v1Json.angularVelocityTargetFrom;
delete v1Json.angularVelocityTargetTo;
delete v1Json.verticalTargetFrom;
delete v1Json.verticalTargetTo;
delete v1Json.verticalAcceleration;
delete v1Json.tangentTargetFrom;
delete v1Json.tangentTargetTo;
const migrated = parseAgentTheoryCruiseCheckpoint(
  JSON.stringify(v1Json),
  v1.sessionSeed,
);
check(
  "V1 checkpoint migrates in place without a camera-position jump",
  migrated?.motionVersion === AGENT_THEORY_CRUISE_MOTION_VERSION
    && distance(migrated.position, v1.position) <= 1e-12
    && migrated.stepIndex === v1.stepIndex,
  {
    migrated: Boolean(migrated),
    positionError: migrated ? distance(migrated.position, v1.position) : null,
    motionVersion: migrated?.motionVersion,
  },
);

let interpolationCheckpoint = createAgentTheoryCruiseCheckpoint(
  profile,
  "r9-hermite",
);
const previousCheckpoint = interpolationCheckpoint;
interpolationCheckpoint = advanceAgentTheoryCruise(
  profile,
  interpolationCheckpoint,
  1,
  {
    directionSign: Math.sign(interpolationCheckpoint.angularVelocity) || 1,
    speedScale: 1,
  },
);
const previousSample = sampleAgentTheoryCruise(
  profile,
  previousCheckpoint,
);
const currentSample = sampleAgentTheoryCruise(
  profile,
  interpolationCheckpoint,
);
let hermiteInsideSegment = true;
for (let index = 0; index <= 100; index += 1) {
  const sample = interpolateAgentTheoryCruiseSamples(
    previousSample,
    currentSample,
    index / 100,
  );
  for (let axis = 0; axis < 3; axis += 1) {
    const minimum = Math.min(
      previousSample.position[axis],
      currentSample.position[axis],
    ) - 1e-12;
    const maximum = Math.max(
      previousSample.position[axis],
      currentSample.position[axis],
    ) + 1e-12;
    if (sample.position[axis] < minimum || sample.position[axis] > maximum) {
      hermiteInsideSegment = false;
    }
  }
}
check(
  "Hermite render interpolation is endpoint-exact and non-overshooting",
  hermiteInsideSegment
    && distance(
      interpolateAgentTheoryCruiseSamples(
        previousSample,
        currentSample,
        0,
      ).position,
      previousSample.position,
    ) <= 1e-12
    && distance(
      interpolateAgentTheoryCruiseSamples(
        previousSample,
        currentSample,
        1,
      ).position,
      currentSample.position,
    ) <= 1e-12,
  { hermiteInsideSegment },
);

const ambientCruiseBlock = componentSource.match(
  /if \(agentTheoryCameraMode === "cruise"\) \{[\s\S]*?requestAgentTheoryCruiseGuidance\(now\);[\s\S]*?\}/,
)?.[0] ?? "";
check(
  "RAF requests background guidance instead of scanning visibility",
  /requestAgentTheoryCruiseGuidance\(now\)/.test(ambientCruiseBlock)
    && !/updateAgentTheoryVisibilityGuard\(now\)/.test(ambientCruiseBlock)
    && /requestIdleCallback\(runFallback/.test(componentSource)
    && /paperSampleLimit: 512/.test(componentSource)
    && /horizonOffsetsSeconds: \[0, 3, 6\]/.test(componentSource),
  "worker path is primary; 1 Hz 512-paper idle fallback stays outside RAF",
);

check(
  "One worker multiplexes priority guidance and ordinary screen LOD",
  /agent-theory-screen-lod-worker-v3-guidance/.test(protocolSource)
    && /agent-theory-screen-lod:guidance-result/.test(protocolSource)
    && /const task = queuedGuidance \?\? queuedSelection/.test(clientSource)
    && /discardedGuidanceResponseCount/.test(clientSource),
  "guidance shares the existing worker and stale queued work is discarded",
);

check(
  "Camera render path uses Hermite position and quaternion slerp",
  /sampleInterpolatedAgentTheoryCruise/.test(componentSource)
    && /\.slerp\(/.test(componentSource)
    && /agentTheoryCruisePreviousQuaternion/.test(componentSource)
    && /workerOwnsCruiseDepth/.test(componentSource),
  "position, orientation and depth ownership use the R9 continuous path",
);

const failed = checks.filter((entry) => !entry.passed);
const report = {
  status: failed.length === 0 ? "PASS" : "FAIL",
  workPackage: "M1.3g-R9",
  checks,
};
console.log(JSON.stringify(report, null, 2));
if (failed.length > 0) process.exitCode = 1;
