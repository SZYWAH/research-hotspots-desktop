import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  AGENT_DUAL_FOCUS_DYNAMIC_SLOTS,
  normalizeAgentDualFocusIntent,
  sampleAgentDualFocusTimeline,
  validateAgentDualFocusScene,
} from "../src/lib/agentDualFocus.ts";

assert.equal(AGENT_DUAL_FOCUS_DYNAMIC_SLOTS, 32);
const normalized = normalizeAgentDualFocusIntent({
  revision: 7,
  primary: {
    kind: "paper",
    entityId: "paper-primary",
    mode: "full-focus",
    reason: "visual-review",
  },
  evidenceEntityIds: Array.from({ length: 9 }, (_, index) => `e-${index}`),
  contextEntityIds: Array.from({ length: 30 }, (_, index) => `c-${index}`),
});
assert.equal(normalized.evidenceEntityIds.length, 5);
assert.equal(normalized.contextEntityIds.length, 24);

const scene = {
  primary: {
    kind: "paper",
    entityId: "paper-primary",
    membership: "sampled",
  },
  evidence: normalized.evidenceEntityIds.map((entityId) => ({
    kind: "paper",
    entityId,
    membership: "sampled",
  })),
  context: normalized.contextEntityIds.map((entityId) => ({
    kind: "paper",
    entityId,
    membership: "snapshot-unsampled",
  })),
  relation: "visual-review",
  sourceSnapshotId: "snapshot-test",
};
assert.equal(validateAgentDualFocusScene(scene), "");
assert.equal(
  validateAgentDualFocusScene({
    ...scene,
    primary: { ...scene.primary, membership: "missing" },
  }),
  "AGENT_DUAL_FOCUS_PRIMARY_MISSING",
);

for (const mode of ["signal", "soft-focus", "full-focus"]) {
  let previousMaterial = 0;
  for (let frame = 0; frame <= 180; frame += 1) {
    const sample = sampleAgentDualFocusTimeline(mode, frame / 60);
    assert.ok(sample.materialBlend + 1e-12 >= previousMaterial);
    previousMaterial = sample.materialBlend;
  }
}

const immersiveSource = await readFile(
  path.join(process.cwd(), "src/components/AgentImmersiveStarfieldCanvas.tsx"),
  "utf8",
);
const theorySource = await readFile(
  path.join(process.cwd(), "src/components/App17GalaxyCanvas.tsx"),
  "utf8",
);
const theoryAdapterSource = await readFile(
  path.join(process.cwd(), "src/components/AgentTheoryBackgroundCanvas.tsx"),
  "utf8",
);
const pageSource = await readFile(
  path.join(process.cwd(), "src/components/AgentDualBackgroundPage.tsx"),
  "utf8",
);

assert.match(
  immersiveSource,
  /geometry\.setAttribute\("aFocusRole"/,
  "Immersive focus must reuse the resident geometry.",
);
assert.match(
  immersiveSource,
  /AGENT_DUAL_FOCUS_DYNAMIC_SLOTS/,
  "Immersive dynamic slots are missing.",
);
assert.match(
  immersiveSource,
  /backgroundFloor[\s\S]*?0\.43/,
  "Sidera evidence-stage background floor must remain within the approved 40-45 percent range.",
);
assert.doesNotMatch(
  immersiveSource,
  /BokehPass|UnrealBloomPass|motionBlur/i,
  "Immersive focus introduced a forbidden post-processing effect.",
);
assert.match(
  theorySource,
  /setAgentFocusVisual/,
  "Theory point layers do not expose same-entity focus weights.",
);
assert.match(
  theorySource,
  /agent-focus-overview/,
  "Theory perimeter focus command is missing.",
);
assert.match(
  theorySource,
  /agent-restore-pose/,
  "Theory Explore pose restoration is missing.",
);
assert.match(
  theoryAdapterSource,
  /!focusRuntimeReady[\s\S]*?focusCommandIssuedRevisionRef\.current === focus\.intent\.revision/,
  "Theory focus commands must wait for WebGL readiness and remain revision-idempotent.",
);
assert.match(
  theoryAdapterSource,
  /phase:\s*releasing && sample\.complete[\s\S]*?\?\s*"releasing"/,
  "Theory release must not report idle before the exact navigation/camera return completes.",
);
assert.match(
  theoryAdapterSource,
  /handleReturnProgress[\s\S]*?focusReturnSawActiveRef\.current[\s\S]*?phase:\s*"idle"/,
  "Theory Ambient release must wait for the R10 return lifecycle before reporting idle.",
);
assert.match(
  pageSource,
  /focus=\{focusPresentation\}/g,
  "Both render adapters must receive the same identity focus presentation.",
);
assert.match(
  pageSource,
  /onCameraPoseChange=\{\(pose\) => \{[\s\S]*?focusPresentation[\s\S]*?theoryNavigation\.level !== "overview"[\s\S]*?return;/,
  "Focused or local-system theory poses must not overwrite the saved overview pose.",
);

console.log(JSON.stringify({
  audit: "agent-dual-focus",
  status: "PASS",
  residentGeometryReused: true,
  dynamicSlotCount: AGENT_DUAL_FOCUS_DYNAMIC_SLOTS,
  maximumEvidence: 5,
  maximumContext: 24,
  theoryCoordinateMutation: false,
  theoryCommandReadyGate: true,
  exactTheoryReleaseLifecycle: true,
  overviewPoseIsolation: true,
}, null, 2));
